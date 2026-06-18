/*
 * zeliard_sword_gfx.c
 *
 * Mode 13h (320x200, 256-colour) hero + sword rendering routines.
 * Translated from the 8086 MCGA graphics driver of Zeliard (Sierra/Game Arts, 1987).
 *
 * Segment model notes
 * -------------------
 * The original code runs in a real-mode segmented model.  All VRAM access
 * goes through the 0xA000 segment (physical 0xA0000).  In this translation
 * the framebuffer is a flat byte array `vram[]` where:
 *
 *   vram[y * 320 + x]   = visible pixel at (x, y)       offsets 0 … 63999
 *   vram[VRAM_SHADOW_BASE … ]  = off-screen shadow area  offsets 64064+
 *
 * `seg1_data[]` replaces the "seg1" data segment that held the sword
 * animation graphics and per-frame tile maps.
 *
 * All arithmetic on tile/map coordinates uses uint8_t to preserve the
 * original 8-bit wrapping behaviour.
 */

#include <stdint.h>
#include <string.h>   /* memcpy */

/* ═══════════════════════════════════════════════════════════════════
 * External symbols  –  defined elsewhere in the port
 * ═══════════════════════════════════════════════════════════════════ */

/*
 * Mode-13h framebuffer: 1 byte per pixel, 320 bytes per scanline.
 *   Offsets 0 – 63999  : visible 320×200 area.
 *   Offsets 64064+     : off-screen shadow buffer (originally the
 *                         area past the end of visible VRAM in the
 *                         0xA000 segment).
 */
extern uint8_t vram[];

/*
 * Flat representation of the "seg1" data segment.
 * Two offsets into it are used at run-time (set up by
 * Render_Sword_Overlay before we are called):
 *
 *   sword_phase_src     – column-major 4×4 table of tile indices for
 *                         the current sword animation frame.
 *                         0xFF means "transparent tile, skip".
 *
 *   sword_animation_gfx – base offset of the 4-bpp sword tile sheet
 *                         inside seg1.  Tile N starts at
 *                         seg1_data[sword_animation_gfx + N * 16].
 */
extern uint8_t  seg1_data[];
extern uint16_t sword_phase_src;       /* offset into seg1_data */
extern uint16_t sword_animation_gfx;   /* offset into seg1_data */

/*
 * Scrolled tile map.  In the original, DS:[SI] addressing into the
 * data segment; mapped here to a flat array indexed by the same SI
 * arithmetic.
 */
extern uint8_t map_data[];

/* Hero / sword state */
extern uint8_t  viewport_rows_remaining; /* bands left to render this frame      */
extern uint8_t  hero_head_y_in_viewport; /* tile-row of hero's head in viewport  */
extern uint8_t  hero_x_in_viewport;      /* tile-col of hero in viewport         */
extern uint8_t  sword_swing_flag;        /* 0 = sheathed, non-zero = swinging    */
extern uint8_t  sword_type;             /* 1-based index into entity_render_tbl  */

/*
 * hero_sprite_hidden
 *   0    – hero tile buffer is ready to blit to VRAM.
 *   0xFF – hero sprite already committed to VRAM this frame; skip.
 */
extern uint8_t  hero_sprite_hidden;

/*
 * ui_element_dirty
 *   0    – shadow buffer matches VRAM; nothing to restore.
 *   non-0 – shadow buffer holds saved background; must restore it.
 */
extern uint8_t  ui_element_dirty;

/* VRAM offsets (set by the scrolling / layout engine) */
extern uint16_t hero_vram_base;          /* top-left VRAM offset of 3×3 hero tiles  */
extern uint16_t entity_vram_src;         /* top-left VRAM offset of 4×4 sword sprite */
extern uint16_t viewport_left_top_addr;  /* flat map index of viewport's top-left tile*/

/*
 * hero_sprite_offset  (dw, two independent bytes):
 *   low  byte (& 0x00FF) – Y sub-tile offset
 *   high byte (>> 8)     – X sub-tile offset
 */
extern uint16_t hero_sprite_offset;

/* Tile system */
extern uint16_t tile_vram_cache[128];      /* word per tile; 0 = stale / not cached  */
extern uint8_t  nine_unpacked_tiles[576];  /* 9 tiles × 8×8 bytes, row-major         */

/* Map-wrapping helper (handles ring-buffer top-edge wrap) */
extern void wrap_map_from_above(uint16_t *si);

/* ═══════════════════════════════════════════════════════════════════
 * Constants
 * ═══════════════════════════════════════════════════════════════════ */

#define SCREEN_WIDTH     320
#define VRAM_SHADOW_BASE 64064   /* 320*200 + 64: compact off-screen scratch area */

/* ═══════════════════════════════════════════════════════════════════
 * Module-private state
 * ═══════════════════════════════════════════════════════════════════ */

/*
 * Active sword colour map (word):
 *   low  byte = primary   palette index  (2-bit pixel code 01 or 10)
 *   high byte = highlight palette index  (2-bit pixel code 11)
 *
 * Loaded from entity_render_tbl[sword_type - 1] at the start of
 * each sword-overlay render.
 */
static uint16_t transparency_mask_bitplane_f;

/*
 * Sword-type to { primary_color, highlight_color } map.
 * Indexed 0-based; callers use (sword_type - 1) as the index.
 *
 *   Low  byte → primary   colour (palette index)
 *   High byte → highlight colour (palette index)
 */
static const uint16_t entity_render_tbl[6] = {
    0x0901,   /* type 1: white     */
    0x2404,   /* type 2: blue      */
    0x1B03,   /* type 3: yellow    */
    0x0901,   /* type 4: white     */
    0x2404,   /* type 5: blue      */
    0x3606,   /* type 6: lt yellow */
};

/* ═══════════════════════════════════════════════════════════════════
 * Forward declarations
 * ═══════════════════════════════════════════════════════════════════ */
static void CalculateSpriteBitmask(uint16_t *ax, uint16_t *out_mask, uint16_t *out_color);
static void Copy_tile(const uint8_t *src, uint16_t dst_offset);
       void Copy_Tile_Buffer_To_VRAM(void);
       void Flush_Ui_Element_If_Dirty(void);
static void Blit32x32SpriteToVram(void);
static void Copy4x4TilesFromScreenToShadowBuffer(void);
static void Clear_Tile_Cache_Around_Hero(void);
static void Sword_Overlay_EntryPoint(void);
       void render_hero_sword(void);


/* ═══════════════════════════════════════════════════════════════════
 * Copy_tile
 *
 * Copies one 8×8 pixel tile from src[] into vram[], advancing
 * the destination by SCREEN_WIDTH (320) bytes between rows to
 * account for the full scanline width.
 *
 * Original: Copy_tile / loc_368D  – 8× { 4× movsw; add di, 320-8 }
 *
 * After returning, src[] has logically advanced by 64 bytes (8 rows
 * × 8 bytes).  In C the caller manages the pointer; DI was
 * push/pop preserved by the outer loop in the original so the
 * caller controls the VRAM offset too.
 * ═══════════════════════════════════════════════════════════════════ */
static void Copy_tile(const uint8_t *src, uint16_t dst_offset)
{
    for (int row = 0; row < 8; row++) {
        memcpy(&vram[dst_offset], src, 8);
        src        += 8;
        dst_offset += SCREEN_WIDTH;   /* next scanline */
    }
}


/* ═══════════════════════════════════════════════════════════════════
 * Copy_Tile_Buffer_To_VRAM
 *
 * Blits the 3×3 tile grid from nine_unpacked_tiles[] into VRAM
 * at hero_vram_base, producing a 24×24 pixel hero sprite.
 *
 * Bails out early when hero_sprite_hidden != 0 (sprite already
 * committed this frame).  Sets the flag to 0xFF on a successful blit.
 *
 * Original: Copy_Tile_Buffer_To_VRAM / loc_40F8 / loc_40FD / loc_4112 / loc_4116
 * ═══════════════════════════════════════════════════════════════════ */
void Copy_Tile_Buffer_To_VRAM(void)
{
    if (hero_sprite_hidden)       /* already drawn this frame – bail */
        return;
    hero_sprite_hidden = 0xFF;    /* mark as committed               */

    const uint8_t *src     = nine_unpacked_tiles;
    uint16_t       row_dst = hero_vram_base;

    /* Outer loop: 3 rows of tiles (each row is 8 scanlines tall) */
    for (int tile_row = 0; tile_row < 3; tile_row++) {
        uint16_t dst = row_dst;

        /* Inner loop: 3 tiles across (each tile is 8 pixels wide).
         * DI is push/pop preserved in the original; here we just
         * restore `dst` manually and bump it by 8 for the next tile. */
        for (int tile_col = 0; tile_col < 3; tile_col++) {
            Copy_tile(src, dst);
            src += 64;   /* next tile's 8×8 data                 */
            dst += 8;    /* 8 pixels right in VRAM               */
        }

        /* Step down one full row of tiles:
         *   SCREEN_WIDTH * 8  rows   = 2560 bytes total
         *   minus the 24 pixels (3 tiles × 8) already advanced
         *   = 2560 - 24 = 2536 in the original `add di, 320*8-24`
         * Here we just reset dst to the start of the next tile row. */
        row_dst += SCREEN_WIDTH * 8;
    }
}


/* ═══════════════════════════════════════════════════════════════════
 * Blit32x32SpriteToVram
 *
 * Restores a 32×32 pixel region to on-screen VRAM at entity_vram_src
 * from the compact shadow buffer at VRAM_SHADOW_BASE.
 *
 * Source rows are packed contiguously (32 bytes each).
 * Destination rows are spaced SCREEN_WIDTH bytes apart.
 *
 * Original: Blit32x32SpriteToVram / loc_3F77  – 32× { rep movsw cx=16; add di, 320-32 }
 * ═══════════════════════════════════════════════════════════════════ */
static void Blit32x32SpriteToVram(void)
{
    uint16_t src = VRAM_SHADOW_BASE;   /* compact shadow: 32-byte rows  */
    uint16_t dst = entity_vram_src;    /* on-screen VRAM: 320-byte rows */

    for (int row = 0; row < 32; row++) {
        memcpy(&vram[dst], &vram[src], 32);
        src += 32;             /* shadow rows are packed tightly   */
        dst += SCREEN_WIDTH;   /* VRAM rows span the full scanline */
    }
}


/* ═══════════════════════════════════════════════════════════════════
 * Flush_Ui_Element_If_Dirty
 *
 * If ui_element_dirty is set, restores the saved background under
 * the sword sprite (Blit32x32SpriteToVram), then clears the flag.
 *
 * Original: Flush_Ui_Element_If_Dirty / loc_3F31
 * ═══════════════════════════════════════════════════════════════════ */
void Flush_Ui_Element_If_Dirty(void)
{
    if (!ui_element_dirty)
        return;
    Blit32x32SpriteToVram();
    ui_element_dirty = 0;
}


/* ═══════════════════════════════════════════════════════════════════
 * Copy4x4TilesFromScreenToShadowBuffer
 *
 * Saves the 32×32 pixel region at entity_vram_src from on-screen
 * VRAM into the compact shadow buffer – the inverse of
 * Blit32x32SpriteToVram.
 *
 * Source rows are spaced SCREEN_WIDTH bytes apart (live VRAM).
 * Destination rows are packed contiguously (shadow buffer).
 *
 * Original: Copy4x4TilesFromScreenToShadowBuffer / loc_3F55
 *   – 32× { rep movsw cx=16; add si, 320-32 }
 * ═══════════════════════════════════════════════════════════════════ */
static void Copy4x4TilesFromScreenToShadowBuffer(void)
{
    uint16_t src = entity_vram_src;    /* on-screen VRAM: 320-byte rows  */
    uint16_t dst = VRAM_SHADOW_BASE;   /* compact shadow: 32-byte rows   */

    for (int row = 0; row < 32; row++) {
        memcpy(&vram[dst], &vram[src], 32);
        src += SCREEN_WIDTH;   /* advance one full scanline in VRAM */
        dst += 32;             /* advance one packed row in shadow  */
    }
}


/* 
 * Locates the 4×4 block of map tiles under the hero + sword sprite
 * and zeroes their tile_vram_cache[] entries, forcing those tiles
 * to be re-rendered on the next scroll pass.
 *
 * Map layout: 36 tiles wide, 64 tiles tall (ring-buffer, mod 64).
 *
 * hero_sprite_offset (dw):
 *   low  byte – Y sub-tile adjustment
 *   high byte – X sub-tile adjustment
 *   (both set by Render_Sword_Overlay)
 */
static void Clear_Tile_Cache_Around_Hero(void)
{
    const uint8_t y_sub = (uint8_t)(hero_sprite_offset & 0x00FF);   /* low  byte */
    const uint8_t x_sub = (uint8_t)(hero_sprite_offset >> 8);       /* high byte */
    uint8_t tile_row = (hero_head_y_in_viewport + y_sub) & 0x3F;
    uint8_t tile_col = (uint8_t)(hero_x_in_viewport + x_sub + 4);

    /* Flat map index; `mul cl` in the original gives a 16-bit result. */
    uint16_t si = (uint16_t)tile_row * 36 + tile_col + viewport_left_top_addr;
    wrap_map_from_above(&si);

    /* Walk the 4×4 block (4 rows of 4 columns). */
    for (int outer = 0; outer < 4; outer++) {
        for (int inner = 0; inner < 4; inner++) {
            /* Bit 7 is a flag; mask it off to get the tile ID. */
            uint8_t tile_id = map_data[si] & 0x7F;
            si++;
            tile_vram_cache[tile_id] = 0;   /* invalidate cache entry */
        }
        si += 32;   /* 36-tile-wide row, we read 4 → skip remaining 32 */
        wrap_map_from_above(&si);
    }
}


/* ═══════════════════════════════════════════════════════════════════
 * CalculateSpriteBitmask
 *
 * Decodes the top 4 bits of *ax as two packed 2-bit pixel codes and
 * produces a write-mask and a colour word for a pair of adjacent
 * VRAM bytes (mode-13h pixels).
 *
 *   bits 15-14 of *ax → pixel A (low  byte of out_mask / out_color)
 *   bits 13-12 of *ax → pixel B (high byte of out_mask / out_color)
 *
 * 2-bit code mapping:
 *   00 → transparent: mask byte = 0x00, colour byte = 0x00 (no write)
 *   01 → primary colour   (low  byte of transparency_mask_bitplane_f)
 *   10 → primary colour   (same as 01)
 *   11 → highlight colour (high byte of transparency_mask_bitplane_f)
 *
 * *ax is shifted left by 4 on return so the next call automatically
 * picks up the next nibble.
 *
 * Verified against the original truth table (see assembly comments).
 *
 * Original: CalculateSpriteBitmask / loc_40B5 / loc_40C2 / loc_40D1
 * ═══════════════════════════════════════════════════════════════════ */
static void CalculateSpriteBitmask(uint16_t *ax, uint16_t *out_mask, uint16_t *out_color)
{
    /* The mask word byte layout:
     *   +0 (low  byte) = primary   colour index
     *   +1 (high byte) = highlight colour index
     * (matches `byte ptr transparency_mask_bitplane_f` vs `+1` in the asm) */
    const uint8_t primary   = (uint8_t)(transparency_mask_bitplane_f & 0xFF);
    const uint8_t highlight = (uint8_t)(transparency_mask_bitplane_f >> 8);

    const uint16_t val   = *ax;
    const uint8_t  pix_a = (val >> 14) & 3;   /* bits 15-14 → pixel A */
    const uint8_t  pix_b = (val >> 12) & 3;   /* bits 13-12 → pixel B */
    *ax = (uint16_t)(val << 4);                /* consume top 4 bits   */

    uint16_t mask  = 0;
    uint16_t color = 0;

    /* Pixel A → low byte.
     * In the asm: first two add/adc pairs extract bits 15-14 into bl,
     * then `or bp, 0FFh` sets the low mask byte, and DL is loaded from
     * transparency_mask_bitplane_f+1 (highlight) initially, then
     * overwritten with +0 (primary) if bl != 3. */
    if (pix_a != 0) {
        mask  |= 0x00FF;
        color |= (pix_a == 3) ? highlight : primary;
    }

    /* Pixel B → high byte (same logic, second add/adc pair for bits 13-12). */
    if (pix_b != 0) {
        mask  |= 0xFF00;
        color |= (uint16_t)((pix_b == 3) ? highlight : primary) << 8;
    }

    *out_mask  = mask;
    *out_color = color;
}


/*
 * Renders the 32×32 pixel (4×4 tile) sword sprite over the hero
 * with per-pixel transparency, using a 2-bit-per-pixel colour
 * encoding from the sword animation sheet.
 *
 * Sprite data layout (sword_phase_src in seg1_data):
 *   Column-major 4×4 table of tile indices – 16 bytes total:
 *     [0..3]   tile indices for column 0, rows 0-3 (top → bottom)
 *     [4..7]   tile indices for column 1, rows 0-3
 *     [8..11]  tile indices for column 2
 *     [12..15] tile indices for column 3
 *   0xFF = transparent tile (8 scanlines are skipped).
 *
 * Tile pixel format (16 bytes per tile = 8 rows × 2 bytes):
 *   Each word encodes 8 pixels as four 2-bit nibbles.
 *   After the original `xchg ah, al` byte-swap, the bit order is
 *   MSB-first: bits 15-14, 13-12, 11-10, 9-8 of the swapped word
 *   are the first four pixel pairs; bits 7-6, 5-4, 3-2, 1-0 are the
 *   next four.  Each pair is decoded by CalculateSpriteBitmask.
 *
 * The write path for every pixel pair (2 bytes at vram[di .. di+1]):
 *   apply mask (clear bits) then OR in colour – faithfully replicates
 *   the original `not bp; and es:[di+N], bp; or es:[di+N], dx`.
 */
static void Sword_Overlay_EntryPoint(void)
{
    if (!sword_swing_flag)
        return;   /* sword in sheath – nothing to do */

    ui_element_dirty = 0xFF;

    Clear_Tile_Cache_Around_Hero();
    Copy4x4TilesFromScreenToShadowBuffer();   /* save background under sprite */

    /* Load the colour palette for this sword type. */
    transparency_mask_bitplane_f = entity_render_tbl[sword_type - 1];

    /* Pointer into seg1_data for the column-major tile-index table. */
    const uint8_t *tile_map = seg1_data + sword_phase_src;

    uint16_t di_col = entity_vram_src;   /* VRAM top-left of the sprite */

    /* Outer loop: 4 columns of 8 pixels each → 32 pixels wide.
     * DI is push/pop'd per column in the original (push di before inner
     * loop, pop di + add 8 after).  Here di_col tracks the column base. */
    for (int col = 0; col < 4; col++) {
        uint16_t di = di_col;

        /* Inner loop: 4 tiles tall of 8 scanlines each → 32 pixels tall.
         * SI (tile_map) advances sequentially – no push/pop needed in C. */
        for (int row = 0; row < 4; row++) {
            uint8_t tile_idx = *tile_map++;

            if (tile_idx == 0xFF) {
                /* Transparent tile: skip 8 scanlines. */
                di += SCREEN_WIDTH * 8;
            } else {
                /* Opaque tile: blit 8 scanlines of 8 pixels.
                 * Tile data is at seg1[sword_animation_gfx + tile_idx*16].
                 * (Original: `add ax, ax` × 4 = multiply by 16, then
                 *  `add si, ds:sword_animation_gfx`.)               */
                const uint8_t *tile_src =
                    seg1_data + sword_animation_gfx + (uint16_t)tile_idx * 16;

                for (int line = 0; line < 8; line++) {
                    /* Load 2 bytes = 4 nibbles = 8 pixels.
                     * `lodsw` reads little-endian, then `xchg ah, al`
                     * puts the first byte into the high position so bits
                     * 15-14 of the swapped word are the first pixel pair. */
                    uint16_t ax = (uint16_t)tile_src[0]
                                | ((uint16_t)tile_src[1] << 8);
                    tile_src += 2;
                    /* xchg ah, al */
                    ax = (uint16_t)((ax >> 8) | (ax << 8));

                    uint16_t mask, color;

                    /* 4 calls × 2 pixels = 8 pixels per scanline.
                     * Each call also shifts ax left by 4 for the next. */

                    /* pixels 0-1  → vram[di .. di+1] */
                    CalculateSpriteBitmask(&ax, &mask, &color);
                    vram[di + 0] = (vram[di + 0] & ~(uint8_t)(mask))
                                 | (uint8_t)(color);
                    vram[di + 1] = (vram[di + 1] & ~(uint8_t)(mask >> 8))
                                 | (uint8_t)(color >> 8);

                    /* pixels 2-3  → vram[di+2 .. di+3] */
                    CalculateSpriteBitmask(&ax, &mask, &color);
                    vram[di + 2] = (vram[di + 2] & ~(uint8_t)(mask))
                                 | (uint8_t)(color);
                    vram[di + 3] = (vram[di + 3] & ~(uint8_t)(mask >> 8))
                                 | (uint8_t)(color >> 8);

                    /* pixels 4-5  → vram[di+4 .. di+5] */
                    CalculateSpriteBitmask(&ax, &mask, &color);
                    vram[di + 4] = (vram[di + 4] & ~(uint8_t)(mask))
                                 | (uint8_t)(color);
                    vram[di + 5] = (vram[di + 5] & ~(uint8_t)(mask >> 8))
                                 | (uint8_t)(color >> 8);

                    /* pixels 6-7  → vram[di+6 .. di+7] */
                    CalculateSpriteBitmask(&ax, &mask, &color);
                    vram[di + 6] = (vram[di + 6] & ~(uint8_t)(mask))
                                 | (uint8_t)(color);
                    vram[di + 7] = (vram[di + 7] & ~(uint8_t)(mask >> 8))
                                 | (uint8_t)(color >> 8);

                    di += SCREEN_WIDTH;   /* next scanline */
                }
                /* di now naturally sits at the top of the next tile row –
                 * no additional adjustment needed. */
            }
        }

        di_col += 8;   /* next column: 8 pixels to the right */
    }
}


/* ═══════════════════════════════════════════════════════════════════
 * render_hero_sword
 *
 * Per-band dispatcher called by the scrolling renderer once per
 * 8-scanline horizontal band as it sweeps the viewport.
 *
 * Computes a "threshold" band index from viewport_rows_remaining
 * and compares it against the hero's position to decide which
 * blit function to call for the current band.
 *
 *   threshold = 18 - viewport_rows_remaining   (uint8_t, wraps)
 *
 * ── Sword sheathed (sword_swing_flag == 0) ────────────────────────
 *   threshold == hero_head_y - 2
 *     → blit the 3×3 hero body tiles (Copy_Tile_Buffer_To_VRAM)
 *
 * ── Sword swinging (sword_swing_flag != 0) ───────────────────────
 *   let top_row = hero_head_y - 5
 *
 *   threshold < top_row
 *     → band not reached yet; nothing to draw
 *
 *   threshold == top_row
 *     → topmost band of the expanded sprite:
 *         flush saved background (Flush_Ui_Element_If_Dirty)
 *         then blit hero body     (Copy_Tile_Buffer_To_VRAM)
 *
 *   threshold == top_row + 10
 *     → sword-overlay band: draw the 4×4 tile sword sprite
 *         (Sword_Overlay_EntryPoint)
 *
 *   any other threshold
 *     → between bands; nothing to draw
 *
 * Note: all comparisons use unsigned 8-bit arithmetic, matching the
 * original `jnb` (jump-if-not-below = unsigned >=) behaviour.
 *
 * Original: render_hero_sword / loc_3E18 / loc_3E22 / loc_3E2A / loc_3E31
 * ═══════════════════════════════════════════════════════════════════ */
void render_hero_sword(void)
{
    /* uint8_t arithmetic: neg al + add 18 = 18 - viewport_rows_remaining */
    const uint8_t threshold = (uint8_t)(18u - viewport_rows_remaining);

    if (!sword_swing_flag) {
        /* Sheathed: only blit the hero body when we hit the correct band. */
        if ((uint8_t)(hero_head_y_in_viewport - 2u) == threshold)
            Copy_Tile_Buffer_To_VRAM();
        return;
    }

    /* Sword swinging: the visible sprite spans from top_row to top_row+10. */
    const uint8_t top_row = (uint8_t)(hero_head_y_in_viewport - 5u);

    /* `cmp cl, al; jnb` = jump if threshold >= top_row (unsigned).
     * Equivalently, return if threshold < top_row. */
    if (threshold < top_row)
        return;   /* haven't reached the sprite region yet */

    if (threshold == top_row) {
        /* Top band: restore any saved background, then draw hero body. */
        Flush_Ui_Element_If_Dirty();
        Copy_Tile_Buffer_To_VRAM();
        return;
    }

    /* threshold > top_row: check for the sword-overlay band. */
    if ((uint8_t)(top_row + 10u) == threshold)
        Sword_Overlay_EntryPoint();
}
