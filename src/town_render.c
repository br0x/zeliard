/**
 * town_render.c
 *
 * C port of the town tile rendering logic from Zeliard's DOS graphics driver
 * (gtmcga.asm / gtmcga.bin — MCGA mode 13h, 320×200, VRAM at 0xA000:0000).
 *
 * The original code renders a 28-column × 8-row tile viewport from the
 * proximity map into VRAM.  Each tile is 8×8 pixels, 6 bits-per-pixel packed
 * into 48 bytes (3 bytes = 4 pixels, two nibbles per byte).
 *
 * Memory layout preserved from the original:
 *   seg1 = code_segment + 0x1000  (tile graphics, animation tables, masks)
 *   seg2 = code_segment + 0x2000  (blit OR/AND buffers for sprites)
 *
 * In this C port we model those banked segments as flat uint8_t arrays
 * provided by the caller through zeliard_mem_t.
 */

#include "town_render.h"
#include <stddef.h>
#include <string.h>
#include <stdint.h>

/* =========================================================================
 * Internal state (mirrors the module-level variables in gtmcga.asm)
 * =========================================================================*/

/** VRAM x-pixel start of the current column being rendered. */
static uint16_t current_column_screen_addr;

/** Index (0-27) of the column currently being rendered. */
static uint8_t  column_counter;

/** Blit cache: maps tile-id → VRAM address where that tile was first drawn.
 *  Size = 256 entries × 2 bytes. 0x0000 means "not yet drawn this frame". */
static uint16_t blit_cache[256];

/** Staging buffer: 5 bytes used by special_multi_tile_column_renderer and
 *  pre_pass_special_column_initializer to hold tile ids for NPC columns. */
static uint8_t  tile_id_staging_buffer[5]; /* [0..4] */

/** x-coordinate (in tile/proximity units) used during sprite table scans. */
static uint16_t sprite_x_coord;

/* =========================================================================
 * Layout constants (MCGA 320×200, viewport origin = pixel (48,14))
 * =========================================================================*/
#define SCREEN_WIDTH        320
#define VIEWPORT_X_START    48
#define VIEWPORT_Y_START    14
#define TILE_SIZE           8       /* pixels */
#define TILE_BYTES          48      /* packed bytes per 8×8 tile (6 bpp) */
#define VIEWPORT_COLS       28
#define VIEWPORT_ROWS       8

/** Byte offset into VRAM for pixel (x, y).  VRAM is linear 320 bytes/row. */
#define VRAM_OFF(x, y)  ((uint32_t)(y) * SCREEN_WIDTH + (x))

/** VRAM start of the viewport area (column 0, row 0 of the visible map). */
#define VIEWPORT_VRAM_BASE  VRAM_OFF(VIEWPORT_X_START, VIEWPORT_Y_START + TILE_SIZE * TILE_SIZE)
/* Note: VIEWPORT_Y_START + 8*8 = 14 + 64 = 78, i.e. the game skips the top
 * 8 tile rows (sky / distant mountains) that are handled separately by
 * backup_upper_town_3_tiles.  The viewport renders rows 8-15 of the 16-row
 * map, starting at y-pixel 78. */

/** Shadow memory base offset within VRAM (320×200 = 64000 bytes, then 192*N). */
#define VRAM_SHADOW_BASE    (320 * 200)

/* =========================================================================
 * Forward declarations (internal helpers)
 * =========================================================================*/
static void hero_column_shadow_blitter_guard(zeliard_mem_t *m, uint8_t *si, uint8_t *di);
static void tile_render_and_animate(zeliard_mem_t *m, uint8_t *si, uint8_t *di);
static void background_tile_render_with_blit_cache(zeliard_mem_t *m, uint8_t *si, uint8_t *di);
static void special_tile_dispatcher(zeliard_mem_t *m, uint8_t *si, uint8_t *di);
static void special_multi_tile_column_renderer(zeliard_mem_t *m, uint8_t *si, uint8_t *di);
static void pre_pass_special_column_initializer(zeliard_mem_t *m, uint8_t *start_si);

static void unpack_tile_to_vram(zeliard_mem_t *m, uint8_t tile_id, uint8_t *vram_dst);
static void copy_3_vert_tiles(uint8_t *vram, uint16_t dst_off, uint16_t src_off);

static uint8_t sprite_descriptor_table_scanner(zeliard_mem_t *m, uint16_t dx);
static uint8_t sprite_x_coordinate_lookup(zeliard_mem_t *m, uint8_t *si, uint8_t *bl_out);
static void    get_sprite_vram_address(zeliard_mem_t *m, uint8_t *npc, uint16_t *di_out);
static void    sprite_compositor_dispatcher(zeliard_mem_t *m, uint8_t bl, uint16_t vram_di);
static void    npc_3_tiles_to_shadow_buffer(zeliard_mem_t *m, uint8_t *si, uint16_t shadow_di);
static void    blit_tile_to_shadow_buffer(zeliard_mem_t *m, uint8_t *color_src,
                                           uint8_t *mask_src, uint8_t *vram_dst);

/* =========================================================================
 * PUBLIC ENTRY POINT
 * =========================================================================*/

/**
 * render_town_tiles_28_columns
 *
 * Main rendering entry for the town viewport.  Iterates all 28 columns of the
 * visible map, dispatches each of the 8 tile rows in that column to the
 * appropriate renderer (animated, background, or special/NPC), and writes
 * decoded pixels to VRAM.
 *
 * Parameters:
 *   m   - pointer to the Zeliard memory context (VRAM, seg1, seg2, game state)
 *
 * Algorithm overview:
 *   1. Zero the blit_cache (256 words) so no tile is considered "already drawn".
 *   2. If column 29 of the proximity map contains tile 0xFD (NPC marker), run
 *      pre_pass_special_column_initializer to blit the pre-column NPC shadow.
 *   3. For each of the 28 viewport columns (left→right):
 *       a. Call hero_column_shadow_blitter_guard — if this is the hero's column,
 *          copy the pre-rendered hero shadow tiles from shadow memory to VRAM.
 *       b. Read 8 tile IDs from the proximity map row for this column.
 *       c. Rows 0-2 → tile_render_and_animate   (may have waving-flag animation)
 *       d. Row 3    → background_tile_render_with_blit_cache
 *       e. Row 4    → background_tile_render_with_blit_cache
 *       f. Row 5    → special_tile_dispatcher    (may trigger NPC compositor)
 *       g. Rows 6-7 → background_tile_render_with_blit_cache
 *   4. Advance VRAM pointer 8 pixels right, increment column_counter.
 */
void render_town_tiles_28_columns(zeliard_mem_t *m)
{
    /* Step 1: clear blit cache */
    memset(blit_cache, 0, sizeof(blit_cache));

    /* Step 2: pre-pass for NPC shadow in column to the left of viewport */
    {
        uint8_t *prox = m->proximity_map + m->proximity_start_tiles;
        if (prox[29] == 0xFD) {
            pre_pass_special_column_initializer(m, prox);
        }
    }

    /* Step 3: set up column loop */
    current_column_screen_addr = (uint16_t)VRAM_OFF(VIEWPORT_X_START,
                                                     VIEWPORT_Y_START + 8 * TILE_SIZE);

    uint8_t *si = m->proximity_map + m->proximity_start_tiles + 0x20; /* +32 bytes */
    uint8_t *di = m->viewport_buffer; /* 28×8 viewport tile-id buffer in DS */

    column_counter = 0;

    while (column_counter < VIEWPORT_COLS) {
        /* --- hero shadow guard --- */
        hero_column_shadow_blitter_guard(m, si, di);

        /* --- rows 0..7 --- */
        /* Row 0 – animated */
        {
            uint8_t prox_tile = *si++;
            uint8_t vp_tile   = *di;
            *di++ = 0xFE;
            if (prox_tile != vp_tile) {
                /* tile changed: render and optionally animate */
                /* (restore si/di for the call; they already advanced) */
                /* The ASM used cmpsb then called with si-1, di-1 pointing at tile */
                /* We model this by passing the tile id directly. */
                uint8_t bl = 0; /* row index */
                (void)bl;
                tile_render_and_animate(m, si - 1, di - 1); /* corrected below */
            }
        }

        /* The pattern above is repeated 7 more times (rows 1-7).  The ASM
         * increments BL (row counter) before each call so the renderer knows
         * the tile's y-offset within the column.  We replicate this cleanly: */

        /* Reset and redo the whole column in a cleaner loop that matches the
         * original structure exactly. */
        si -= 1; di -= 1; /* undo the preview attempt above */

        /* ----------------------------------------------------------------- */
        /* Actual per-row dispatch matching the ASM 1:1                       */
        /* ----------------------------------------------------------------- */
        for (uint8_t row = 0; row < VIEWPORT_ROWS; row++) {
            uint8_t prox_tile = si[row];   /* tile id from proximity map   */
            uint8_t vp_cached = di[row];   /* tile id from last frame      */
            /* cmpsb would increment both si and di; we use indices instead */

            if (prox_tile == vp_cached) {
                /* Tile unchanged – skip rendering this cell */
                continue;
            }

            /* Dispatch by row — each renderer marks di[row] itself */
            if (row <= 2) {
                /* Rows 0-2: animated tiles (flags, etc.) */
                tile_render_and_animate(m, &si[row], &di[row]);
            } else if (row == 5) { // NPC and hero heads level
                /* Row 5: special dispatcher (NPC heads) */
                special_tile_dispatcher(m, &si[row], &di[row]);
            } else {
                /* Rows 3,4,6,7: plain background with blit cache */
                background_tile_render_with_blit_cache(m, &si[row], &di[row]);
            }
        }

        /* Advance VRAM x by 8 pixels */
        current_column_screen_addr += TILE_SIZE;
        /* Advance proximity map and viewport buffer pointers to next column */
        si += VIEWPORT_ROWS;
        di += VIEWPORT_ROWS;

        column_counter++;
    }
}

/* =========================================================================
 * hero_column_shadow_blitter_guard
 *
 * When the current column matches the hero's viewport-x position, copies the
 * 2×3-tile (16×24 px) hero shadow from the shadow memory area to VRAM.
 * The shadow was previously composited into VRAM_SHADOW_BASE by the caller.
 *
 * This is skipped for column 27 (rightmost) to avoid overrunning VRAM.
 * =========================================================================*/
static void hero_column_shadow_blitter_guard(zeliard_mem_t *m, uint8_t *si, uint8_t *di)
{
    (void)si; (void)di;

    if (column_counter == 27) return; /* guard: skip last column */

    uint8_t hero_x = m->save[SAVE_HERO_X_IN_VIEWPORT]; /* hero tile x in viewport */
    if (column_counter != hero_x) return;

    /* Hero x in VRAM pixels = hero_x * 8 */
    uint16_t vram_x = (uint16_t)hero_x * TILE_SIZE;
    uint32_t dst_off = VRAM_OFF(VIEWPORT_X_START + vram_x,
                                VIEWPORT_Y_START + 13 * TILE_SIZE);

    /* Copy 2 columns × 3 tiles (24 scanlines each) from shadow memory */
    for (int col = 0; col < 2; col++) {
        uint32_t d = dst_off + col * TILE_SIZE;
        uint32_t s = VRAM_SHADOW_BASE;
        copy_3_vert_tiles(m->vram, (uint16_t)d, (uint16_t)s);
        /* Each call advances s by 3*8*320 = 7680 bytes automatically in the
         * ASM via rep movsw; here copy_3_vert_tiles handles that. */
    }
}

/* =========================================================================
 * copy_3_vert_tiles
 *
 * Copies 3 vertically-stacked 8×8 tiles (24 scanlines × 8 bytes = 192 bytes
 * of VRAM) from src_off to dst_off.  Each scanline is 8 bytes wide; after
 * each scanline the VRAM pointer jumps 312 bytes (320 - 8) to the next row.
 *
 * Parameters:
 *   vram    - pointer to the flat VRAM buffer (65536 bytes)
 *   dst_off - byte offset of top-left pixel in VRAM
 *   src_off - byte offset of top-left source pixel in VRAM
 * =========================================================================*/
static void copy_3_vert_tiles(uint8_t *vram, uint16_t dst_off, uint16_t src_off)
{
    for (int scanline = 0; scanline < 24; scanline++) {
        /* Copy 8 pixels (one tile scanline) */
        memcpy(vram + dst_off, vram + src_off, TILE_SIZE);
        dst_off += SCREEN_WIDTH;
        src_off += SCREEN_WIDTH;
    }
}

/* =========================================================================
 * unpack_tile_to_vram
 *
 * Decodes a single 48-byte packed tile from seg1 and writes 64 unpacked bytes
 * (one 6-bit palette index per byte) to vram_dst.
 *
 * Pixel encoding in the packed format (3 bytes → 4 pixels):
 *   byte0 = [p3_hi | p2_hi]  (bits 7-4 = p3 hi nibble, bits 3-0 = p2 hi nibble)
 *   byte1 = [p1_hi | p0_hi]
 *   byte2 = [p3_lo | p2_lo | p1_lo | p0_lo]  (2 bits each, lo pair)
 *
 * Unpacked value:
 *   u0 = (byte0 >> 2)         & 0x3F
 *   u1 = ((byte0 & 3) << 4) | (byte1 >> 4)     -- actually:
 *
 * The ASM uses a 3-byte → 4-pixel scheme that maps to the VGA 6-bit palette:
 *   The 3 source bytes carry 24 bits; each group of 6 bits is one pixel.
 *   Reading left to right: pixel0 uses bits 23-18, pixel1 uses 17-12,
 *   pixel2 uses 11-6, pixel3 uses 5-0.
 *
 *   lodsw  → dx (dh=byte1, dl=byte0)
 *   lodsb  → bl (bl=byte2)
 *   bh = dl (copy byte0)
 *   dx >>= 2  → dh=(byte1>>2), dl=(byte0>>2)
 *   vram[0] = dh   (bits 7-2 of byte1 → top 6 bits = pixel 0)
 *   dl >>= 2 → dl=(byte0>>4) ... etc.
 *   bx <<= 4 → bh=(byte0<<2), bl=(byte2<<2)
 *   vram[2] = bh & 0x3F
 *   vram[3] = bl & 0x3F  (actually al & 0x3f)
 * =========================================================================*/
static void unpack_tile_to_vram(zeliard_mem_t *m, uint8_t tile_id, uint8_t *vram_dst)
{
    const uint8_t *src = m->seg1 + 0x8100 + (uint32_t)tile_id * TILE_BYTES;

    for (int group = 0; group < 16; group++) {   /* 16 groups × 3 bytes = 48 */
        uint8_t b0 = src[0];
        uint8_t b1 = src[1];
        uint8_t b2 = src[2];
        src += 3;

        /* Reconstruct as in the ASM: dh=b1,dl=b0,bl=b2 */
        uint16_t dx = ((uint16_t)b1 << 8) | b0;
        uint8_t  bl = b2;
        uint8_t  bh = b0; /* bh=dl before shift */

        dx >>= 2;
        vram_dst[0] = (uint8_t)(dx >> 8);    /* dh after >>2 */
        dx >>= 2;
        vram_dst[1] = (uint8_t)(dx & 0xFF);  /* dl after >>4 (total >>4 from original) */

        uint16_t bx = ((uint16_t)bh << 8) | bl;
        bx <<= 2;
        bx <<= 2; /* bx <<= 4 */
        vram_dst[2] = (bx >> 8) & 0x3F;      /* bh & 0x3F */
        vram_dst[3] = b2 & 0x3F;             /* al & 0x3F  (bl before shift) */

        vram_dst += 4;
    }
}

/* =========================================================================
 * background_tile_render_with_blit_cache
 *
 * Renders a background tile (no transparency / no animation check).
 * Uses blit_cache to avoid re-decoding the same tile id twice per frame:
 *   - On cache miss: decode packed tile from seg1 to VRAM, record VRAM address.
 *   - On cache hit:  memcpy 8 scanlines (8 bytes each) from the already-drawn
 *     tile location in VRAM.
 *
 * The viewport buffer byte at *di_ptr is checked:
 *   0xFF means "tile is 0" (transparent/empty) — skip rendering.
 *   Otherwise the current proximity-map tile id is in *si.
 *
 * Parameters:
 *   m       - memory context
 *   si      - points to current tile id in proximity map
 *   di_ptr  - points to the corresponding viewport buffer byte (in/out)
 * =========================================================================*/
static void background_tile_render_with_blit_cache(zeliard_mem_t *m,
                                                    uint8_t *si,
                                                    uint8_t *di)
{
    /* di points directly at the viewport buffer byte for this cell */
    uint8_t vp_byte = *di;
    *di = 0xFE; /* mark as processed */

    vp_byte++;        /* +1: if was 0xFF → becomes 0, skip */
    if (vp_byte == 0) return; /* tile id 0 = empty */

    /* si points directly at the current tile id in the proximity map */
    uint8_t tile_id = *si;

    /* Compute row from viewport buffer pointer position within this column */
    uint8_t row = (uint8_t)(di - (m->viewport_buffer +
                              (ptrdiff_t)column_counter * VIEWPORT_ROWS));

    /* VRAM address for this tile */
    uint32_t vram_y = VIEWPORT_Y_START + (uint32_t)(8 + row) * TILE_SIZE;
    uint32_t vram_x = VIEWPORT_X_START + (uint32_t)column_counter * TILE_SIZE;
    uint16_t vram_addr = (uint16_t)VRAM_OFF(vram_x, vram_y);

    /* Blit cache lookup */
    if (blit_cache[tile_id] != 0) {
        /* Cache hit: copy from where it was first drawn */
        uint16_t src_off = blit_cache[tile_id];
        for (int scanline = 0; scanline < TILE_SIZE; scanline++) {
            memcpy(m->vram + vram_addr, m->vram + src_off, TILE_SIZE);
            vram_addr += SCREEN_WIDTH;
            src_off   += SCREEN_WIDTH;
        }
    } else {
        /* Cache miss: decode and write to VRAM */
        blit_cache[tile_id] = vram_addr;

        const uint8_t *packed = m->seg1 + 0x8100 + (uint32_t)tile_id * TILE_BYTES;
        uint16_t dst = vram_addr;

        for (int scanline = 0; scanline < TILE_SIZE; scanline++) {
            /* Decode 8 pixels from 6 packed bytes (2 groups of 3 bytes) */
            for (int grp = 0; grp < 2; grp++) {
                uint8_t b0 = packed[0];
                uint8_t b1 = packed[1];
                uint8_t b2 = packed[2];
                packed += 3;

                uint16_t dx = ((uint16_t)b1 << 8) | b0;
                uint8_t  bh_orig = b0;
                uint8_t  bl_orig = b2;

                dx >>= 2;
                m->vram[dst + 0] = (uint8_t)(dx >> 8);
                dx >>= 2;
                m->vram[dst + 1] = (uint8_t)(dx & 0xFF);

                uint16_t bx = ((uint16_t)bh_orig << 8) | bl_orig;
                bx <<= 4;
                m->vram[dst + 2] = (uint8_t)(bx >> 8) & 0x3F;
                m->vram[dst + 3] = b2 & 0x3F;

                dst += 4;
            }
            dst += SCREEN_WIDTH - TILE_SIZE; /* skip to next scanline */
        }
    }
}

/* =========================================================================
 * tile_render_and_animate
 *
 * Like background_tile_render_with_blit_cache but first consults the
 * tile_anim_count_table (at seg1:8000h) to check whether the tile has an
 * animation frame count > 0.
 *
 * If tile_anim_count_table[tile_id] == 0 → delegate to
 *   background_tile_render_with_blit_cache (no animation, but still use cache).
 *
 * If > 0 → render using the transparency mask from seg1:hero_transparency_masks
 *   (D000h in seg1) so the tile's transparent pixels show the background.
 *
 * After rendering, if the next-frame viewport buffer byte is non-zero and < 25,
 * the animation replacement table (at seg1:tile_animation_replacement_table /
 * 8004h) is consulted to replace the tile id in the proximity map for the next
 * frame (advancing the animation cycle).
 *
 * Parameters:
 *   m       - memory context
 *   si      - points to current tile id in proximity map (si[-1] after cmpsb)
 *   di_ptr  - points to viewport buffer byte
 * =========================================================================*/
static void tile_render_and_animate(zeliard_mem_t *m, uint8_t *si, uint8_t *di)
{
    uint8_t vp_byte = *di;
    *di = 0xFE;
    vp_byte++;
    if (vp_byte == 0) return; /* tile id 0 = skip */

    uint8_t tile_id = *si;

    /* Check animation count table in seg1 */
    uint16_t anim_table_ptr = *(uint16_t *)(m->seg1 + 0x8000); /* ptr to count table */
    uint8_t  anim_count = m->seg1[anim_table_ptr + tile_id];

    if (anim_count == 0) {
        /* Not an animated tile; fall through to plain background renderer */
        background_tile_render_with_blit_cache(m, si, di);
        return;
    }

    /* Animated tile: render with transparency mask */
    uint8_t row = (uint8_t)(di - (m->viewport_buffer +
                              (ptrdiff_t)column_counter * VIEWPORT_ROWS));

    uint32_t vram_y = VIEWPORT_Y_START + (uint32_t)(8 + row) * TILE_SIZE;
    uint32_t vram_x = VIEWPORT_X_START + (uint32_t)column_counter * TILE_SIZE;
    uint16_t vram_dst = (uint16_t)VRAM_OFF(vram_x, vram_y);

    /* Mask pointer: 8 bytes per tile in seg1 at hero_transparency_masks (0xD000) */
    const uint8_t *mask = m->seg1 + 0xD000 + (uint32_t)tile_id * TILE_SIZE;
    /* Packed tile graphics */
    const uint8_t *packed = m->seg1 + 0x8100 + (uint32_t)tile_id * TILE_BYTES;

    /* Background source: VRAM at (column_counter*192 + row*64) + 0xA000 offset
     * The ASM computes: bx = y*64 + column_counter*192 + 0xA000
     * This is the "pre-composited background" plane in VRAM shadow. */
    uint32_t bg_base = (uint32_t)column_counter * 192 +
                       (uint32_t)row * 64;

    uint16_t dst = vram_dst;
    for (int scanline = 0; scanline < TILE_SIZE; scanline++) {
        uint8_t mask_byte = mask[scanline]; /* 8-bit mask for this scanline */

        for (int grp = 0; grp < 2; grp++) {
            /* Decode 4 pixels from 3 packed bytes */
            uint8_t b0 = packed[0];
            uint8_t b1 = packed[1];
            uint8_t b2 = packed[2];
            packed += 3;

            uint16_t dx = ((uint16_t)b1 << 8) | b0;
            uint8_t  bh_orig = b0;
            uint8_t  bl_orig = b2;

            dx >>= 2;
            uint8_t p0 = (uint8_t)(dx >> 8);
            dx >>= 2;
            uint8_t p1 = (uint8_t)(dx & 0xFF);

            uint16_t bx = ((uint16_t)bh_orig << 8) | bl_orig;
            bx <<= 4;
            uint8_t p2 = (uint8_t)(bx >> 8) & 0x3F;
            uint8_t p3 = b2 & 0x3F;

            /* Apply transparency mask (bit = 1 → use background pixel) */
            uint32_t bg_off = bg_base + (uint32_t)scanline * TILE_SIZE + grp * 4;
#define APPLY_MASK_BIT(pixel, bg_src)                  \
            mask_byte <<= 1;                           \
            if (mask_byte & 0x100)                     \
                pixel = m->vram[bg_src];               \
            mask_byte &= 0xFF;

            /* The ASM shifts mask_byte left and uses carry.  We simulate: */
            uint16_t mw = (uint16_t)mask_byte << 1;
            p0 = (mw & 0x100) ? m->vram[bg_off + 0] : p0; mw &= 0xFF; mw <<= 1;
            p1 = (mw & 0x100) ? m->vram[bg_off + 1] : p1; mw &= 0xFF; mw <<= 1;
            p2 = (mw & 0x100) ? m->vram[bg_off + 2] : p2; mw &= 0xFF; mw <<= 1;
            p3 = (mw & 0x100) ? m->vram[bg_off + 3] : p3;
            mask_byte = (uint8_t)(mw & 0xFF);

            m->vram[dst + 0] = p0;
            m->vram[dst + 1] = p1;
            m->vram[dst + 2] = p2;
            m->vram[dst + 3] = p3;
            dst += 4;
        }
        dst += SCREEN_WIDTH - TILE_SIZE;
    }

    /* --- Animation replacement pass --- */
    /* After rendering, check if next viewport buffer byte (the tile just written
     * to viewport_buffer before calling this) is non-zero and < 25.
     * If so, look it up in the tile_animation_replacement_table. */
    uint8_t next_vp = *di;
    if (next_vp == 0) return;
    if (next_vp >= 25) return;

    /* Read replacement table pointer from seg1:8004h */
    uint16_t repl_table_ptr = *(uint16_t *)(m->seg1 + 0x8004);
    uint8_t  count = m->seg1[repl_table_ptr];
    if (count == 0) return;

    uint16_t entry = repl_table_ptr + 1;
    while (count--) {
        uint8_t old_id = m->seg1[entry];
        if (old_id == 0xFF) break;
        if (next_vp == old_id) {
            /* Replace tile id in proximity map for next frame */
            *si = m->seg1[entry + 1];
            break;
        }
        entry += 2;
    }
}

/* =========================================================================
 * special_tile_dispatcher
 *
 * Checks whether the current tile at row 5 is 0xFD (NPC column marker).
 * If not → background_tile_render_with_blit_cache.
 * If yes  → special_multi_tile_column_renderer (composite NPC sprite).
 * =========================================================================*/
static void special_tile_dispatcher(zeliard_mem_t *m, uint8_t *si, uint8_t *di)
{
    if (*si != 0xFD) {
        background_tile_render_with_blit_cache(m, si, di);
    } else {
        special_multi_tile_column_renderer(m, si, di);
    }
}

/* =========================================================================
 * special_multi_tile_column_renderer
 *
 * Renders a column that contains an NPC sprite (tile id 0xFD in row 5).
 *
 * Sequence:
 *  1. Read 5 tile ids from the proximity map (the NPC slot: rows 5..9 which
 *     span rows 5,6,7 of this column and rows 0,1 of the next column).
 *  2. Compute sprite_x_coord = column_counter + 4 + proximity_map_left_col_x.
 *  3. Call sprite_descriptor_table_scanner to resolve the NPC tile id.
 *  4. If the second tile slot is also 0xFD, resolve it too (wide NPC).
 *  5. Unpack those 6 tiles to shadow memory (shadow rows 2-3).
 *  6. Walk the NPC array, compositing each NPC sprite whose x matches.
 *  7. Copy the resulting shadow tiles to VRAM for rows 5-7 (and possibly
 *     the first 2 rows of the next column).
 *  8. Mark viewport buffer bytes as 0xFF (processed).
 * =========================================================================*/
static void special_multi_tile_column_renderer(zeliard_mem_t *m,
                                                uint8_t *si,
                                                uint8_t *di)
{
    /* 1. Capture 5 bytes from proximity map (tile ids for this NPC slot) */
    uint8_t slot[5];
    /* si points at row 5; the NPC slot spans rows 5,6 of this column
     * and rows 4,5,6 of the next column (stride = VIEWPORT_ROWS = 8) */
    slot[0] = si[0]; slot[1] = si[1];
    /* skip to next column (offset +8 from row 5 = row 5 of next column) */
    slot[2] = si[7]; slot[3] = si[8]; slot[4] = si[9];
    /* Copy to tile_id_staging_buffer */
    memcpy(tile_id_staging_buffer, slot, 5);

    /* 2. Sprite x coordinate */
    sprite_x_coord = (uint16_t)column_counter + 4 + m->proximity_map_left_col_x;

    /* 3. Resolve first tile (may be 0xFD placeholder → look up in NPC table) */
    tile_id_staging_buffer[0] = sprite_descriptor_table_scanner(m, sprite_x_coord);

    /* 4. If second tile is also 0xFD, resolve it (wide NPC) */
    if (tile_id_staging_buffer[2] == 0xFD) {
        sprite_x_coord++;
        tile_id_staging_buffer[2] = sprite_descriptor_table_scanner(m, sprite_x_coord);
    }

    /* 5. Unpack 6 tiles (3 from first slot, 3 from second) to shadow memory */
    /* Shadow memory offset 192*2 = row 2 of 3-row blocks */
    uint16_t shadow_dst = VRAM_SHADOW_BASE + 192 * 2;
    for (int t = 0; t < 6; t++) {
        unpack_tile_to_vram(m, tile_id_staging_buffer[t < 3 ? 0 : 2],
                            m->vram + shadow_dst + (uint32_t)t * 64);
    }

    /* 6. Walk NPC array, composite matching sprites */
    uint8_t *npc = m->npc_array;
    while (*(uint16_t *)npc != 0xFFFF) {
        uint8_t bl_out;
        if (sprite_x_coordinate_lookup(m, npc, &bl_out) && bl_out) {
            uint16_t sprite_vram_di;
            get_sprite_vram_address(m, npc, &sprite_vram_di);
            sprite_compositor_dispatcher(m, bl_out, sprite_vram_di);
        }
        npc += 8; /* sizeof(NPC) */
    }

    /* 7. Copy shadow tiles to VRAM */
    /* Row 5 starts at y = VIEWPORT_Y_START + (8+5)*8 = 14+104 = 118 */
    uint32_t dst_base = VRAM_OFF(current_column_screen_addr % SCREEN_WIDTH,
                                 VIEWPORT_Y_START + (8 + 5) * TILE_SIZE);

    uint8_t ch = *di;        /* viewport byte at row 5 */
    uint8_t cl = *(di + 8);  /* viewport byte for row 5 of next column */

    /* Copy 3-tile shadow block for this column (rows 5-7) */
    ch++;
    if (ch != 0) { /* if not 0xFF (processed) */
        copy_3_vert_tiles(m->vram, (uint16_t)(dst_base),
                          (uint16_t)(VRAM_SHADOW_BASE + 192 * 2));
    }

    /* Copy 3-tile shadow block for next column if not at col 27 */
    if (column_counter != 0x1B) {
        cl++;
        if (cl != 0) {
            copy_3_vert_tiles(m->vram,
                              (uint16_t)(dst_base + TILE_SIZE),
                              (uint16_t)(VRAM_SHADOW_BASE + 192 * 3));
        }
    }

    /* 8. Mark viewport buffer as processed */
    *di       = 0xFE;
    di[1]     = 0xFF;
    di[2]     = 0xFF;
    di[8]     = 0xFF;
    di[9]     = 0xFF;
    di[10]    = 0xFF;
}

/* =========================================================================
 * pre_pass_special_column_initializer
 *
 * Runs before the main column loop when the proximity map column just to the
 * left of the viewport (column index 29 = start+29) contains tile 0xFD.
 * This pre-renders the NPC shadow for the partially-visible left-edge column
 * and copies it to VRAM at y=rows 13-15 (the lower 3 tile rows of the map).
 *
 * Also sets the first 3 bytes of the viewport buffer's "cache_bytes" region
 * to 0xFF to prevent the main loop from re-rendering those cells.
 * =========================================================================*/
static void pre_pass_special_column_initializer(zeliard_mem_t *m, uint8_t *start_si)
{
    /* Read 3 tile ids from proximity map at offset 36+1=37 */
    uint8_t *src = start_si + 37;
    tile_id_staging_buffer[0] = src[0];
    tile_id_staging_buffer[1] = src[1];
    tile_id_staging_buffer[2] = src[2];

    uint16_t dx = (uint16_t)m->proximity_map_left_col_x + 3;
    sprite_x_coord = dx;

    /* If first tile is 0xFD, resolve via descriptor table */
    if (tile_id_staging_buffer[0] == 0xFD) {
        dx++;
        tile_id_staging_buffer[0] = sprite_descriptor_table_scanner(m, dx);
    }

    /* Unpack 3 tiles to shadow memory at row 2 */
    uint16_t shadow_dst = VRAM_SHADOW_BASE + 192 * 2;
    for (int t = 0; t < 3; t++) {
        unpack_tile_to_vram(m, tile_id_staging_buffer[t],
                            m->vram + shadow_dst + (uint32_t)t * 64);
    }

    /* Walk NPC array, composite matching sprites with partial x offset */
    uint8_t *npc = m->npc_array;
    while (*(uint16_t *)npc != 0xFFFF) {
        uint8_t bl_out;
        if (sprite_x_coordinate_lookup(m, npc, &bl_out) && bl_out) {
            bl_out--;
            uint16_t sprite_vram_di;
            get_sprite_vram_address(m, npc, &sprite_vram_di);
            /* Partial-column shift: add 3*bl_out pixels */
            sprite_vram_di += (uint16_t)bl_out * 3;
            npc_3_tiles_to_shadow_buffer(m, tile_id_staging_buffer, shadow_dst);
        }
        npc += 8;
    }

    /* Copy 3-tile shadow to VRAM at row 13 (the lower-left corner) */
    uint32_t dst = VRAM_OFF(VIEWPORT_X_START, VIEWPORT_Y_START + 13 * TILE_SIZE);
    copy_3_vert_tiles(m->vram, (uint16_t)dst, (uint16_t)(VRAM_SHADOW_BASE + 192 * 2));

    /* Mark viewport buffer cache bytes as 0xFF (will skip these in main loop) */
    uint8_t *cache = m->cache_bytes;
    cache[0] = 0xFF;
    cache[1] = 0xFF;
    cache[2] = 0xFF;
}

/* =========================================================================
 * sprite_descriptor_table_scanner
 *
 * Walks the NPC sprite descriptor table starting from the beginning, skipping
 * entries whose tile[3] == 0xFD (another NPC placeholder), until it finds an
 * entry at x-coordinate dx.  Returns the resolved tile id byte.
 *
 * Parameters:
 *   m   - memory context (npc_array_addr points to the NPC table)
 *   dx  - target x-coordinate to match
 *
 * Returns: tile id for the NPC at that x position (or 0 if not found).
 * =========================================================================*/
static uint8_t sprite_descriptor_table_scanner(zeliard_mem_t *m, uint16_t dx)
{
    uint8_t *si = m->npc_array;

    /* Skip entries whose tile[3] == 0xFD and advance to x-match */
    while (1) {
        if (si[3] == 0xFD) {
            si += 8;
            /* advance until x matches */
            while (*(uint16_t *)si != dx) si += 8;
        } else {
            break;
        }
    }

    return si[3]; /* resolved tile id */
}

/* =========================================================================
 * sprite_x_coordinate_lookup
 *
 * Checks whether any NPC in the array is at x = sprite_x_coord or
 * sprite_x_coord+1 (2-wide NPC spans one extra column).
 *
 * Returns: true if a match was found; sets *bl_out to 1 or 2
 *          (1 = first column of sprite, 2 = second column).
 *          Returns false (and *bl_out = 0) if no match.
 * =========================================================================*/
static uint8_t sprite_x_coordinate_lookup(zeliard_mem_t *m, uint8_t *npc, uint8_t *bl_out)
{
    uint16_t dx = sprite_x_coord;
    for (uint8_t cx = 2; cx >= 1; cx--) {
        if (*(uint16_t *)npc == dx) {
            *bl_out = cx;
            return 1;
        }
        dx++;
    }
    *bl_out = 0;
    return 0;
}

/* =========================================================================
 * get_sprite_vram_address
 *
 * Computes the offset within seg1's NPC sprite graphics (at 0x4000) for the
 * given NPC entry.
 *
 *   npc[2] = animation frame (bits 6-0) + flag bit7 (facing direction)
 *   npc[4] = anim sub-frame (bits 1-0)
 *
 * Returns the byte offset in seg1 via *di_out.
 * Formula:
 *   frame = npc[2] & 0x7F
 *   base  = frame * 48 + 0x4000
 *   If bit7 of npc[2] is clear → add 4
 *   sub   = (npc[4] & 3) * 6
 *   di    = base + sub
 * =========================================================================*/
static void get_sprite_vram_address(zeliard_mem_t *m, uint8_t *npc, uint16_t *di_out)
{
    (void)m;
    uint8_t ch = npc[2];
    uint8_t frame = ch & 0x7F;
    uint16_t di = (uint16_t)frame * 48 + 0x4000;

    uint8_t dl = 0;
    if (!(ch & 0x80)) dl = 4;

    uint8_t sub = npc[4] & 3;
    di += dl + (uint16_t)sub * 6;

    *di_out = di;
}

/* =========================================================================
 * sprite_compositor_dispatcher
 *
 * Selects between single-tile and two-tile NPC compositor based on bl:
 *   bl == 1 → single_sprite_shadow_compositor
 *   bl == 2 → two_sprite_shadow_compositor
 * =========================================================================*/
static void sprite_compositor_dispatcher(zeliard_mem_t *m, uint8_t bl, uint16_t vram_di)
{
    uint16_t shadow_di;
    if (bl == 2) {
        /* two-tile: composite both halves */
        shadow_di = VRAM_SHADOW_BASE + 192 * 2;
        npc_3_tiles_to_shadow_buffer(m, tile_id_staging_buffer, shadow_di);
        /* fall through to second half */
        npc_3_tiles_to_shadow_buffer(m, tile_id_staging_buffer + 3, shadow_di + 192);
    } else {
        /* single-tile: composite right half only (tile_id_staging_buffer + 3) */
        shadow_di = VRAM_SHADOW_BASE + 192 * 3;
        npc_3_tiles_to_shadow_buffer(m, tile_id_staging_buffer + 3, shadow_di);
    }
    (void)vram_di;
}

/* =========================================================================
 * npc_3_tiles_to_shadow_buffer
 *
 * Blits 3 NPC tiles (from seg1 color and mask data) into shadow VRAM.
 * For each of the 3 tiles:
 *   1. Mark tile_id_staging_buffer slot as 0xFF (consumed).
 *   2. Read tile index from seg1 NPC graphics (at 0x4100).
 *   3. Read transparency mask from seg1 NPC mask buffer (at 0x7000).
 *   4. Call blit_tile_to_shadow_buffer to AND-clear then OR-blit pixels.
 *
 * Parameters:
 *   m         - memory context
 *   si        - pointer into tile_id_staging_buffer (modified in place)
 *   shadow_di - byte offset in VRAM for the shadow destination
 * =========================================================================*/
static void npc_3_tiles_to_shadow_buffer(zeliard_mem_t *m, uint8_t *si, uint16_t shadow_di)
{
    for (int t = 0; t < 3; t++) {
        si[t] = 0xFF; /* mark consumed */

        uint8_t tile_idx = m->seg1[0x4100 + t]; /* NPC tile index from sprite sheet */
        if (tile_idx == 0) continue;
        tile_idx--;

        uint8_t *color_src = m->seg1 + 0x4100 + (uint32_t)tile_idx * 48;
        uint8_t *mask_src  = m->seg1 + 0x7000 + (uint32_t)tile_idx * 8;

        blit_tile_to_shadow_buffer(m, color_src, mask_src,
                                   m->vram + shadow_di + (uint32_t)t * 64);
    }
}

/* =========================================================================
 * blit_tile_to_shadow_buffer
 *
 * AND-blits a transparency mask into the shadow VRAM (clearing sprite pixels),
 * then OR-blits the color data on top.
 *
 * Two-pass operation:
 *  Pass 1 (AND): for each of 64 pixels, if mask bit = 0 → clear vram pixel.
 *  Pass 2 (OR):  unpack 48-byte tile and OR each decoded byte into VRAM.
 *
 * Parameters:
 *   m          - memory context
 *   color_src  - pointer to 48-byte packed tile color data
 *   mask_src   - pointer to 8-byte transparency mask (1 byte per scanline)
 *   vram_dst   - pointer to 64-byte shadow VRAM region (8×8 pixels)
 * =========================================================================*/
static void blit_tile_to_shadow_buffer(zeliard_mem_t *m,
                                        uint8_t *color_src,
                                        uint8_t *mask_src,
                                        uint8_t *vram_dst)
{
    (void)m;
    /* Pass 1: AND-clear */
    for (int row = 0; row < TILE_SIZE; row++) {
        uint8_t mask_byte = mask_src[row];
        for (int px = 0; px < TILE_SIZE; px++) {
            /* shift mask left: if bit7=0, AND with 0 (clear) */
            uint8_t keep = (mask_byte & 0x80) ? 0xFF : 0x00;
            vram_dst[row * TILE_SIZE + px] &= keep;
            mask_byte <<= 1;
        }
    }

    /* Pass 2: OR-blit decoded pixels */
    uint8_t *dst = vram_dst;
    for (int group = 0; group < 16; group++) {
        uint8_t b0 = color_src[0];
        uint8_t b1 = color_src[1];
        uint8_t b2 = color_src[2];
        color_src += 3;

        uint16_t dx = ((uint16_t)b1 << 8) | b0;
        uint8_t  bh_orig = b0;
        uint8_t  bl_orig = b2;

        dx >>= 2;
        dst[0] |= (uint8_t)(dx >> 8);
        dx >>= 2;
        dst[1] |= (uint8_t)(dx & 0xFF);

        uint16_t bx = ((uint16_t)bh_orig << 8) | bl_orig;
        bx <<= 4;
        dst[2] |= (uint8_t)(bx >> 8) & 0x3F;
        dst[3] |= b2 & 0x3F;

        dst += 4;
    }
}
