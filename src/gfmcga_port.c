/*
 * gfmcga_port.c
 *
 * C translation of seven rendering functions from Zeliard's MCGA graphics
 * driver (gfmcga.asm).  Original target: DOS mode 13h, 320×200, 256 colours.
 *
 * ── Segment / memory layout of seg1 ─────────────────────────────────────────
 *
 *   seg1 + 0x0000  fman_gfx sprite-header table
 *                  Each entry is 9 bytes (one per 3×3 tile column).
 *                  The byte value is a 1-based tile index into the sprite
 *                  pixel data; 0 means "transparent slot".
 *
 *   seg1 + 0x0333  Hero / entity sprite pixel data (nibble-compressed,
 *                  32 bytes per tile = 64 nibbles = 8×8 pixels at 4 bpp)
 *
 *   seg1 + 0x4000  Dungeon tile pixel data (same nibble-compressed format,
 *                  32 bytes per tile)
 *
 *   seg1 + 0x8030  Dungeon tile pixel data (packed 6-bit-per-pixel format,
 *                  48 bytes per tile, 1-based indices)
 *
 *   seg1 + 0xA000  Dungeon tile transparency masks (1 bit per pixel,
 *                  8 bytes per tile – used when blitting a tile over a bg)
 *
 * ── Key buffers ──────────────────────────────────────────────────────────────
 *
 *   tile_neighborhood_buffer[9]
 *       3×3 raw dungeon-map tile indices centred on the hero's head tile.
 *       Negative values (bit7 set) mean a "occupied/entity" slot; they are
 *       translated via proximity_second_layer[idx & 0x7F] before use.
 *
 *   tile_load_buffer[16]
 *       4×4 proximity-monster slot indices centred on the hero.
 *       Only proximity-map bytes with bit7 set are kept; others are 0.
 *
 *   nine_unpacked_tiles[576]
 *       Offscreen hero-tile buffer: 9 columns × 64 bytes each.
 *       All rendering functions in this file write into this buffer.
 *       Column N starts at nine_unpacked_tiles + N*64.
 *
 * ── Monster frame-data format ────────────────────────────────────────────────
 *
 *   Each monster has a "frame table" (monster_ai_move_right/left_frames[]),
 *   indexed by monster.flags & 0x1F.  The entry is an absolute DS offset
 *   pointing to an array of 5-byte animation-frame records:
 *
 *     frame[0] = blit-mode / palette selector
 *     frame[1] = fman tile when the lower-right neighbour (di[5]) is occupied
 *     frame[2] = fman tile when the lower-left  neighbour (di[4]) is occupied
 *     frame[3] = fman tile when the upper-right neighbour (di[1]) is occupied
 *     frame[4] = fman tile when the upper-left  neighbour (di[0]) is occupied
 *
 *   The fman tile indices select 8×8 dungeon tiles (nibble-compressed at
 *   seg1+0x4000 / masks at seg1+0xA000) that visually represent the monster.
 *
 * ── All other functions and variables are assumed defined elsewhere. ──────────
 */

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

/* ─── External state (defined elsewhere in the port) ──────────────────────── */

extern uint8_t  tile_neighborhood_buffer[9];   /* 3×3 dungeon tile indices   */
extern uint8_t  tile_load_buffer[16];          /* 4×4 proximity-monster slots */
extern uint8_t  nine_unpacked_tiles[576];        /* 9 columns × 64 B offscreen  */

extern uint8_t  hero_frame_tile_idx;             /* current output column (0-8) */
extern uint8_t  tile_blit_mode;                /* palette set by Lookup        */
extern uint16_t hero_vram_base;                /* VRAM address of hero top-left */
extern uint8_t  hero_head_y_in_viewport;
extern uint8_t  hero_x_in_viewport;
extern uint8_t  hero_y_absolute;
extern uint16_t nibble_decode_lut;             /* active palette LUT pointer   */

extern const uint8_t   *seg1;
extern const uint8_t   *proximity_map;         /* 36-col × 64-row proximity    */
extern const uint8_t   *proximity_second_layer;/* 128-byte bg-tile xlat table  */
extern const uint8_t   *monsters_table_addr;   /* monster records, 16 B each   */
extern const uint16_t   monster_ai_move_right_frames[];
extern const uint16_t   monster_ai_move_left_frames[];
extern const uint8_t   *game_ds;               /* DS-segment base (for frame-data offsets) */
extern const uint16_t   pal_decode_tbl[6];     /* palette table pointers       */
extern uint32_t         hero_transparency_masks_offset; /* offset in seg1 for fman masks */

/* Hero state flags */
extern uint8_t invincibility_flag;
extern uint8_t on_rope_flags;
extern uint8_t hero_hidden_flag;
extern uint8_t facing_direction;    /* bit0: 0=right, 1=left                  */
extern uint8_t shield_anim_active;
extern uint8_t shield_anim_phase;   /* 0..7                                   */
extern uint8_t shield_variant_index;/* 1-based                                */
extern uint8_t squat_flag;          /* 0=no squat; 0xFF=squatting             */
extern uint8_t hero_animation_phase;/* 0..3=walk frames, 0x80=idle            */
extern uint8_t jump_phase_flags;    /* bit7=high jump, 0x7F=mid jump          */
extern uint8_t slope_direction;     /* 0=flat, 1=slope right, 2=slope left    */
extern uint8_t is_boss_cavern;
extern uint8_t hero_damage_this_frame;

/* ─── Pixel / tile renderers (defined elsewhere) ─────────────────────────── */

/* Render a packed 6-bit tile (48 bytes) into a 64-byte slot */
extern void render_48bytes_packed_tile(const uint8_t *src, uint8_t *dst);

/* Render a nibble-compressed tile (32 bytes) using nibble_decode_lut */
extern void render_nibble_compressed_tile(const uint8_t *src, uint8_t *dst);

/* Blit a 2bpp (nibble-compressed) sprite over an existing 64-byte slot
 * using per-pixel transparency masks (8 bytes). */
extern void render_2bpp_tile(const uint8_t *src,
                             const uint8_t *masks,
                             uint8_t       *dst);

/* Dungeon-map helpers */
extern void    load_3x3_tiles(void);
extern uint8_t Translate_Tile_Index(uint8_t raw);   /* proximity_second_layer xlat */
extern uint8_t get_player_shield_category(void);    /* 0=none, 1=small, 2=large    */

/* ─── fman_gfx layout constants (seg1-relative, 9 bytes per sprite group) ── */
/* Each sprite "group" is 9 header bytes; the byte at position N is the       */
/* 1-based tile index for column N of the 3×3 hero sprite grid.               */

#define FMAN_BODY_RIGHT_BASE    (  0u)                /* right-facing body base */
#define FMAN_BODY_LEFT_BASE     ( 13u * 9u)           /* left-facing body base  */
#define FMAN_BODY_ROPE_BASE     (2u * 13u * 9u)       /* on-rope body base      */
#define FMAN_BODY_OPEN_DOOR     ((2u*13u + 4u) * 9u)  /* door-hidden body       */
#define FMAN_ARM_RIGHT_BASE     ((2u*13u + 4u + 1u) * 9u)
#define FMAN_SHIELD_BACK_BASE   (0x02C7u)              /* = 79 × 9              */
#define FMAN_ARM_LEFT_BASE      ((2u*13u + 4u + 1u + 18u) * 9u)
#define FMAN_SHIELD_FRONT_BASE  ((2u*13u + 4u + 1u + 2u*18u) * 9u)

#define FMAN_SPRITE_PIXEL_BASE  (0x0333u)  /* hero sprite pixel start in seg1 */
#define DUNGEON_TILE_NIBBLE_BASE (0x4000u)
#define DUNGEON_TILE_PACKED_BASE (0x8030u)
#define DUNGEON_TILE_MASK_BASE   (0xA000u)
#define VIEWPORT_TOP_LEFT_VRAM  (0x3800u)  /* adjust to actual engine value   */

/* ─── Module-private state ───────────────────────────────────────────────── */
/*
 * Set by Lookup_Monster_Tile_Attributes after reading the blit-mode byte.
 * Points to the 4 subsequent fman-tile-index bytes in the monster frame data:
 *   [0] = tile for di[5] case (lower-right neighbour occupied)
 *   [1] = tile for di[4] case (lower-left  neighbour occupied)
 *   [2] = tile for di[1] case (upper-right neighbour occupied)
 *   [3] = tile for di[0] case (upper-left  neighbour occupied)
 */
static const uint8_t *s_frame_fman_tiles;

/* Private forward declaration */
static void _render_hero_3x3(void);

/* Forward declaration needed by choose_hero_sprite (defined after it) */
void Render_Scrolling_Tile(const uint8_t *sprite_header, uint8_t cx);


/*
 * Clears both tile buffers and runs the hero-tile rendering grid WITHOUT
 * re-sampling the proximity map.  Used when the surroundings are known to be
 * clear / already accounted for (animation-only refresh).
 *
 * ASM equivalent: zeros tile_neighborhood_buffer + tile_load_buffer (both
 * via rep stosw), then jmps to loc_39F5 (skipping Sample_Neighborhood_Attributes).
 */
void Update_Local_Attribute_Cache(void)
{
    memset(tile_neighborhood_buffer, 0, sizeof tile_neighborhood_buffer); /* 9 B  */
    memset(tile_load_buffer,         0, sizeof tile_load_buffer);         /* 16 B */
    _render_hero_3x3();
}


/*
 * Alternative entry point (ASM label inside the same proc):
 *   1. Calls load_3x3_tiles() to fill tile_neighborhood_buffer[9] with the
 *      raw 3×3 dungeon-map tile indices centred on the hero's head tile.
 *   2. Fills tile_load_buffer[16] (4 rows × 4 cols) by sampling the
 *      proximity map in a 4×4 window:
 *        starting row = (hero_y_absolute − 1) & 0x3F
 *        starting col = hero_x_in_viewport + 3
 *      Only bytes with bit7 set (occupied slots) are kept; others become 0.
 *   3. Falls through to the shared rendering grid.
 */
void Sample_Neighborhood_Attributes(void)
{
    load_3x3_tiles();   /* → tile_neighborhood_buffer[9] */

    uint8_t *dst   = tile_load_buffer;
    uint8_t  row_y = (uint8_t)(hero_y_absolute - 1u);

    for (int r = 0; r < 4; r++, row_y++) {
        uint8_t        y   = row_y & 0x3Fu;           /* wrap within 64 rows */
        const uint8_t *src = proximity_map
                           + (uint16_t)y * 36u
                           + hero_x_in_viewport + 3u;
        for (int c = 0; c < 4; c++) {
            uint8_t v = *src++;
            *dst++ = (v & 0x80u) ? v : 0u;           /* keep occupied slots only */
        }
    }

    _render_hero_3x3();
}


/* 
 * Resolves a proximity-map slot index to the monster's current visual state.
 *
 * Steps:
 *   a) Look up the background tile from proximity_second_layer[tile_idx].
 *   b) Find the monster record (16 bytes) at monsters_table_addr + idx*16.
 *   c) Compute the frame-data byte address:
 *        frame_table = right or left based on ai_flags bit7
 *        base_offset = frame_table[monster.flags & 0x1F]  (uint16 table entry)
 *        byte_addr   = base_offset + (anim_counter & 0xF) * 5
 *   d) Read game_ds[byte_addr] → blit-mode byte → tile_blit_mode.
 *      Set s_frame_fman_tiles = &game_ds[byte_addr + 1] (4 fman-tile bytes).
 *   e) If not a boss cavern and ai_flags bit5 is set: blit_mode += 3.
 *
 * Returns: the background tile index (proximity_second_layer[tile_idx]).
 * Side-effects: tile_blit_mode, s_frame_fman_tiles.
 */
uint8_t Lookup_Monster_Tile_Attributes(uint8_t tile_idx)
{
    tile_idx &= 0x7Fu;

    /* (a) background tile */
    uint8_t bg_tile = proximity_second_layer[tile_idx];

    /* (b) monster record: 16 bytes per entry */
    const uint8_t *m = monsters_table_addr + (uint16_t)tile_idx * 16u;

    /* (c) animation frame offset: (anim_counter & 0xF) × 5 bytes per frame */
    uint8_t  anim      = m[6] & 0x0Fu;
    uint16_t entry_off = (uint16_t)anim * 5u;

    /* Select frame table: right-facing (ai_flags bit7=1) or left-facing */
    const uint16_t *frame_tbl = (m[5] & 0x80u)
                                ? monster_ai_move_right_frames
                                : monster_ai_move_left_frames;

    /* Frame sub-table base (absolute DS offset into game frame data) */
    uint8_t  flags     = m[4] & 0x1Fu;
    uint16_t base_off  = frame_tbl[flags];
    uint16_t byte_addr = base_off + entry_off;

    /* (d) blit-mode byte + pointer to the 4 fman-tile bytes that follow it */
    uint8_t blit_mode  = game_ds[byte_addr];
    s_frame_fman_tiles = &game_ds[byte_addr + 1u];

    /* (e) non-boss special bonus */
    if (!is_boss_cavern && (m[5] & 0x20u))
        blit_mode += 3u;

    tile_blit_mode = blit_mode;
    return bg_tile;
}


/* 
 * Renders one 8×8 tile slot into nine_unpacked_tiles[hero_frame_tile_idx × 64].
 *
 * The tile index is *nb_ptr (current position in tile_neighborhood_buffer):
 *   0        → clear the 64-byte slot (transparent / empty tile)
 *   non-zero → packed tile (1-based, 48 bytes at seg1:DUNGEON_TILE_PACKED_BASE)
 *
 * Called when tile_load_buffer shows no monsters near the current hero cell.
 */
void Render_Empty_Or_Cached_Tile(const uint8_t *nb_ptr)
{
    uint8_t  tile = *nb_ptr;
    uint8_t *dst  = nine_unpacked_tiles + (uint16_t)hero_frame_tile_idx * 64u;

    if (tile == 0u) {
        /* Clear_Tile_Buffer: 32 word-writes = 64 bytes */
        memset(dst, 0, 64u);
        return;
    }

    /* Packed tile source (1-based → subtract 1 for 0-based multiply) */
    const uint8_t *src = seg1 + DUNGEON_TILE_PACKED_BASE
                       + (uint16_t)(tile - 1u) * 48u;
    render_48bytes_packed_tile(src, dst);
}


/* 
 * Renders a foreground dungeon tile (fman_tile) over a background dungeon
 * tile (from *nb_ptr) into nine_unpacked_tiles[hero_frame_tile_idx × 64].
 *
 * fman_tile  : index into nibble-compressed dungeon tile data (from the
 *              monster frame-data bytes populated by Lookup_Monster_Tile_Attributes).
 *              Selects pixel data at seg1+0x4000 + fman_tile*32
 *              and transparency mask at seg1+0xA000 + fman_tile*8.
 *
 * nb_ptr     : current position in tile_neighborhood_buffer → background tile.
 *              If bit7 is set (raw map notation), it is translated via
 *              Translate_Tile_Index() before use.
 *
 * Rendering:
 *   bg_tile ≠ 0 → render packed background tile, then blit nibble sprite on top
 *   bg_tile = 0 → render only the nibble-compressed fman tile (no background)
 *
 * The palette decode table is selected from pal_decode_tbl[tile_blit_mode].
 */
void Render_Tile_With_Palette(uint8_t fman_tile, const uint8_t *nb_ptr)
{
    /* Background tile from the neighbourhood buffer */
    uint8_t bg_tile = *nb_ptr;
    if (bg_tile & 0x80u)
        bg_tile = Translate_Tile_Index(bg_tile);  /* → proximity_second_layer[idx] */

    /* Set active palette decode table */
    nibble_decode_lut = pal_decode_tbl[tile_blit_mode];

    /* Nibble-compressed source + transparency masks for the fman (foreground) tile */
    const uint8_t *nibble_src = seg1 + DUNGEON_TILE_NIBBLE_BASE
                              + (uint16_t)fman_tile * 32u;
    const uint8_t *masks      = seg1 + DUNGEON_TILE_MASK_BASE
                              + (uint16_t)fman_tile * 8u;

    /* Destination column in the offscreen hero buffer */
    uint8_t *dst = nine_unpacked_tiles + (uint16_t)hero_frame_tile_idx * 64u;

    if (bg_tile != 0u) {
        /* Render packed background tile (decode_and_render_tile_with_blitting),
         * then blit the nibble sprite on top (render_2bpp_tile). */
        const uint8_t *bg_src = seg1 + DUNGEON_TILE_PACKED_BASE
                              + (uint16_t)(bg_tile - 1u) * 48u;
        render_48bytes_packed_tile(bg_src, dst);   /* opaque background */
        render_2bpp_tile(nibble_src, masks, dst);  /* transparent overlay */
    } else {
        /* No background – render only the nibble-compressed tile */
        render_nibble_compressed_tile(nibble_src, dst);
    }
}


/* 
 * Called after the 3×3 background grid has been written to nine_unpacked_tiles.
 * Composites three hero-sprite layers on top via Render_Scrolling_Tile():
 *
 *   Layer 1 – Back arm / weapon (drawn BEFORE the body)
 *     Skipped when invincible, on rope, or hidden.
 *     Source determined by:
 *       • facing direction (ARM_RIGHT_BASE / ARM_LEFT_BASE)
 *       • active shield animation (SHIELD_BACK_BASE + phase/size offset)
 *       • held shield without animation (12×9 + squat + size offset)
 *       • plain walk arm swing (only even phases: phase=0→offset 0, phase=2→18)
 *     Squat mode uses 6 tiles from column 3; normal uses 9 tiles from column 0.
 *
 *   Layer 2 – Body
 *     Base: BODY_RIGHT / BODY_LEFT / BODY_ROPE / BODY_OPEN_DOOR
 *     Frame offset selected by (in priority order):
 *       invincibility(+10 frames) → walk animation, squat(5), high-jump(7),
 *       slope-right(8), slope-left(9), mid-jump(6), idle(4), walk(0-3)
 *     Always 9 tiles from column 0.
 *
 *   Layer 3 – Front arm (drawn AFTER the body)
 *     Skipped when invincible.
 *     Uses the OPPOSITE arm base from Layer 1 (arm in front of body).
 *     Logic mirrors Layer 1 for shield states; for rope/hidden uses a fixed
 *     hardcoded offset (0x7E=small shield, 0x99=large shield from arm base).
 *     Squat: 6 tiles from col 3; normal: 9 tiles from col 0.
 *
 * Palette is set from pal_decode_tbl[hero_damage_this_frame & 3].
 */
void _choose_hero_sprite(void)
{
    /* Set hero rendering palette based on current damage flash state */
    nibble_decode_lut = pal_decode_tbl[hero_damage_this_frame & 3u];

    const bool facing_left = (facing_direction & 1u) != 0u;

    /* ─────────────────────────────────────────────────────────────────────
     * Layer 1: Back arm / weapon
     * ───────────────────────────────────────────────────────────────────── */
    if (!(invincibility_flag | on_rope_flags | hero_hidden_flag)) {

        /* Base: back arm follows the facing direction directly */
        const uint8_t *arm_si = seg1 + (facing_left ? FMAN_ARM_LEFT_BASE
                                                     : FMAN_ARM_RIGHT_BASE);
        bool do_render_arm = false;
        uint8_t arm_cx = 9u;
        uint8_t arm_col = 0u;

        if (shield_anim_active) {
            uint16_t phase_off = (uint16_t)(shield_anim_phase >> 1u) * 9u;

            if (!facing_left) {
                /* Facing right + active shield → SHIELD_BACK_BASE */
                uint8_t cat = get_player_shield_category();
                arm_si = seg1 + FMAN_SHIELD_BACK_BASE
                       + phase_off + (uint16_t)cat * (4u * 9u);
            } else {
                /* Facing left + active shield */
                uint16_t off = phase_off + 36u;
                switch (shield_variant_index) {
                case 1:  off += 36u; break;
                case 2:  off  = 99u; break;
                default: break;
                }
                arm_si += off;
            }
            do_render_arm = true;

        } else {
            uint8_t cat = get_player_shield_category();

            if (cat && !facing_left) {
                /* Facing right, holding shield (no active animation) */
                uint16_t off = 12u * 9u + (uint16_t)(squat_flag & 9u);
                if (cat >= 2u) off += 3u * 9u;
                arm_si += off;
                do_render_arm = true;

            } else if (!squat_flag && hero_animation_phase != 0x80u) {
                /* No shield (or facing left): show walk arm on even phases only.
                 * The arm is visible when (hero_animation_phase + 2) & 3 is even.
                 *   phase 0 → shifted 2 (even, arm offset +18)
                 *   phase 1 → shifted 3 (odd,  skip)
                 *   phase 2 → shifted 0 (even, arm offset +0)
                 *   phase 3 → shifted 1 (odd,  skip) */
                uint8_t shifted = (uint8_t)((hero_animation_phase + 2u) & 3u);
                if (!(shifted & 1u)) {
                    arm_si += (uint16_t)shifted * 9u;
                    do_render_arm = true;
                }
            }
            /* else: squat, idle, odd walk phase → no back arm rendered */
        }

        if (do_render_arm) {
            if (squat_flag) {
                arm_col = 3u;
                arm_cx  = 6u;
            }
            hero_frame_tile_idx = arm_col;
            Render_Scrolling_Tile(arm_si, arm_cx);
        }
    }

    /* ─────────────────────────────────────────────────────────────────────
     * Layer 2: Body
     * ───────────────────────────────────────────────────────────────────── */
    {
        const uint8_t *body_si;
        uint16_t        body_off = 0u;

        if (hero_hidden_flag) {
            /* Hiding in doorway: static open-door frame, no additional offset */
            body_si = seg1 + FMAN_BODY_OPEN_DOOR;

        } else if (on_rope_flags) {
            /* On rope: use normal walk-animation phases (0..3) */
            body_si  = seg1 + FMAN_BODY_ROPE_BASE;
            body_off = (uint16_t)(hero_animation_phase & 3u) * 9u;

        } else {
            body_si = seg1 + (facing_left ? FMAN_BODY_LEFT_BASE
                                          : FMAN_BODY_RIGHT_BASE);

            if (invincibility_flag) {
                /* Invincibility mode: frames start +10 from body base,
                 * then walk animation on top of that. */
                body_si += 10u * 9u;
                body_off = (uint16_t)(hero_animation_phase & 3u) * 9u;

            } else if (squat_flag) {
                body_off = 5u * 9u;

            } else if (jump_phase_flags & 0x80u) {
                body_off = 7u * 9u;                /* high-jump apex         */

            } else if (slope_direction == 1u) {
                body_off = 8u * 9u;                /* slope right            */

            } else if (slope_direction == 2u) {
                body_off = 9u * 9u;                /* slope left             */

            } else if (jump_phase_flags == 0x7Fu) {
                body_off = 6u * 9u;                /* mid-jump               */

            } else if (hero_animation_phase == 0x80u) {
                body_off = 4u * 9u;                /* idle / standing still  */

            } else {
                /* Normal walk animation: phases 0..3 */
                body_off = (uint16_t)(hero_animation_phase & 3u) * 9u;
            }
        }

        hero_frame_tile_idx = 0u;
        Render_Scrolling_Tile(body_si + body_off, 9u);
    }

    /* Invincibility: no front arm, done */
    if (invincibility_flag)
        return;

    /* ─────────────────────────────────────────────────────────────────────
     * Layer 3: Front arm (drawn over the body)
     * ─────────────────────────────────────────────────────────────────────
     * The front-arm uses the OPPOSITE sprite base from the back arm so that
     * the two arms bracket the body: when facing right the front arm is the
     * left arm sprite, and vice-versa. */
    {
        /* Note the intentional inversion vs. Layer 1 */
        const uint8_t *arm_si = seg1 + (facing_left ? FMAN_ARM_RIGHT_BASE
                                                     : FMAN_ARM_LEFT_BASE);

        if (on_rope_flags | hero_hidden_flag) {
            /* On rope or hidden: only show arm if a shield is held */
            uint8_t cat = get_player_shield_category();
            if (!cat) return;                       /* no shield → no front arm */

            /* Small shield → +0x7E (126) from arm base (14th frame group)
             * Large shield → +0x99 (153) from arm base (17th frame group) */
            arm_si += (cat >= 2u) ? 0x99u : 0x7Eu;

        } else if (shield_anim_active) {
            uint16_t phase_off = (uint16_t)(shield_anim_phase >> 1u) * 9u;

            if (!facing_left) {
                /* Facing right + active shield front → SHIELD_FRONT_BASE */
                uint8_t cat = get_player_shield_category();
                arm_si = seg1 + FMAN_SHIELD_FRONT_BASE
                       + phase_off + (uint16_t)cat * (4u * 9u);
            } else {
                /* Facing left + active shield front */
                uint16_t off = phase_off + 4u * 9u;
                switch (shield_variant_index) {
                case 1:  off += 4u * 9u;  break;
                case 2:  off  = 11u * 9u; break;
                default: break;
                }
                arm_si += off;
            }

        } else if (facing_left) {
            uint8_t cat = get_player_shield_category();
            if (cat) {
                /* Facing left, holding shield (no animation) */
                uint16_t off = (uint16_t)(squat_flag & 9u) + 12u * 9u;
                if (cat >= 2u) off += 3u * 9u;
                arm_si += off;
            } else {
                /* Facing left, no shield: walk or idle arm */
                uint16_t off = 3u * 9u;    /* default: squat / idle */
                if (!squat_flag && hero_animation_phase != 0x80u)
                    off = (uint16_t)(hero_animation_phase & 3u) * 9u;
                arm_si += off;
            }

        } else {
            /* Facing right, no shield animation */
            uint16_t off = 3u * 9u;        /* default: squat / idle */
            if (!squat_flag && hero_animation_phase != 0x80u)
                off = (uint16_t)(hero_animation_phase & 3u) * 9u;
            arm_si += off;
        }

        if (squat_flag) {
            hero_frame_tile_idx = 3u;
            Render_Scrolling_Tile(arm_si, 6u);
        } else {
            hero_frame_tile_idx = 0u;
            Render_Scrolling_Tile(arm_si, 9u);
        }
    }
}


/*
 * Renders cx consecutive hero-sprite tiles from the fman_gfx header table
 * into nine_unpacked_tiles, advancing hero_frame_tile_idx for each tile.
 *
 * sprite_header  : pointer into seg1 fman_gfx header table (1 byte per slot)
 * cx             : number of tile slots to process
 *
 * Each header byte is a 1-based tile index into the hero sprite pixel data:
 *   0        → transparent slot (column advanced, nothing rendered)
 *   non-zero → pixel data at seg1 + FMAN_SPRITE_PIXEL_BASE + tile*32
 *              mask data at seg1 + hero_transparency_masks_offset + tile*8
 *
 * The sprite is composited onto nine_unpacked_tiles[hero_frame_tile_idx × 64]
 * using render_2bpp_tile() (AND-mask to clear, then OR sprite pixels in).
 *
 * In the original ASM, ES was set to seg1 before calling this function so
 * that "mov al, es:[si]" reads from seg1.  Here we use seg1 directly.
 *
 * Called directly from choose_hero_sprite, and also as a tail-call from the
 * end of choose_hero_sprite (the non-squat front-arm path falls through into
 * the function in the original – here it is a normal call).
 */
void Render_Scrolling_Tile(const uint8_t *sprite_header, uint8_t cx)
{
    for (; cx > 0u; cx--, sprite_header++, hero_frame_tile_idx++) {
        uint8_t tile = *sprite_header;
        if (tile == 0u)
            continue;   /* transparent slot – advance counter, no pixels */

        const uint8_t *src   = seg1 + FMAN_SPRITE_PIXEL_BASE
                             + (uint16_t)tile * 32u;
        const uint8_t *masks = seg1 + hero_transparency_masks_offset
                             + (uint16_t)tile * 8u;
        uint8_t *dst = nine_unpacked_tiles + (uint16_t)hero_frame_tile_idx * 64u;

        render_2bpp_tile(src, masks, dst);
    }
}


/*
 * Corresponds to ASM label _render_hero_3x3 inside Update_Local_Attribute_Cache.
 *
 * 1. Computes hero_vram_base = viewport_top_left + head_y*320*8 + x*8.
 * 2. Iterates a 3×3 grid over tile_neighborhood_buffer (si) and the matching
 *    2×2 sliding window in tile_load_buffer (di, which is 4 elements wide).
 *
 *    For each of the 9 cells the surrounding 2×2 window in tile_load_buffer
 *    is checked for monster proximity slots:
 *
 *      all four zero → Render_Empty_Or_Cached_Tile(&si[0])
 *                       (packed bg tile or clear, no monster)
 *
 *      di[0] (upper-left)  non-zero
 *        → Lookup(di[0]) sets tile_blit_mode + s_frame_fman_tiles
 *        → fman tile = s_frame_fman_tiles[3]  (frame data byte 4)
 *        → Render_Tile_With_Palette(fman, &si[0])
 *
 *      di[1] (upper-right) non-zero
 *        → fman tile = s_frame_fman_tiles[2]  (frame data byte 3)
 *
 *      di[4] (lower-left)  non-zero
 *        → fman tile = s_frame_fman_tiles[1]  (frame data byte 2)
 *
 *      di[5] (lower-right) non-zero
 *        → Lookup(di[5]) returns bg_tile
 *        → neighbourhood[si] is updated: si[0] = bg_tile  (side-effect!)
 *        → fman tile = s_frame_fman_tiles[0]  (frame data byte 1)
 *        → Render_Tile_With_Palette(fman, &si[0])
 *          (bg_tile is now positive so Translate_Tile_Index is not called)
 *
 * 3. After all 9 cells: calls choose_hero_sprite() for the arm/body layers.
 *
 * Loop advance (from the "choose_hero_sprite callback" in the original):
 *   inner loop: si++, di++, hero_frame_tile_idx++ (3 times)
 *   between rows: di++ extra (to skip to the next 4-wide row in tile_load_buffer)
 */
static void _render_hero_3x3(void)
{
    hero_vram_base = (uint16_t)hero_head_y_in_viewport * (320u * 8u)
                   + (uint16_t)hero_x_in_viewport      * 8u
                   + VIEWPORT_TOP_LEFT_VRAM;

    hero_frame_tile_idx = 0u;

    /*
     * si : walks tile_neighborhood_buffer row-major (stride 3)
     * di : walks tile_load_buffer in a stride-4 grid; the 2×2 window is
     *      di[0], di[1], di[4], di[5] at each position.
     */
    uint8_t       *si = tile_neighborhood_buffer;
    const uint8_t *di = tile_load_buffer;

    for (int outer = 0; outer < 3; outer++) {
        for (int inner = 0; inner < 3; inner++) {

            /* Check the 2×2 proximity window for this cell */
            uint8_t any = di[0] | di[1] | di[4] | di[5];

            if (!any) {
                /*
                 * No monsters near this cell.
                 * Render the packed background tile (or clear if tile index 0).
                 */
                Render_Empty_Or_Cached_Tile(si);

            } else if (di[0]) {
                /*
                 * Monster occupies the upper-left neighbour.
                 * fman tile = frame_data byte 4 (s_frame_fman_tiles[3]).
                 * Background = *si (tile_neighborhood_buffer[current]).
                 */
                Lookup_Monster_Tile_Attributes(di[0]);
                Render_Tile_With_Palette(s_frame_fman_tiles[3], si);

            } else if (di[1]) {
                /* Monster at upper-right: frame byte 3 */
                Lookup_Monster_Tile_Attributes(di[1]);
                Render_Tile_With_Palette(s_frame_fman_tiles[2], si);

            } else if (di[4]) {
                /* Monster at lower-left: frame byte 2 */
                Lookup_Monster_Tile_Attributes(di[4]);
                Render_Tile_With_Palette(s_frame_fman_tiles[1], si);

            } else {
                /*
                 * Monster at lower-right (di[5]): frame byte 1.
                 *
                 * Unique side-effect: the neighbourhood cell is updated with
                 * the background tile from the Lookup (proximity_second_layer
                 * result), so that Render_Tile_With_Palette sees a positive
                 * (already-translated) background tile and skips Translate_Tile_Index.
                 */
                uint8_t bg_tile = Lookup_Monster_Tile_Attributes(di[5]);
                *si = bg_tile;  /* update neighbourhood buffer */
                Render_Tile_With_Palette(s_frame_fman_tiles[0], si);
            }

            /* Advance to the next cell (equivalent to choose_hero_sprite callback) */
            si++;
            di++;
            hero_frame_tile_idx++;
        }
        /*
         * After the inner 3-cell pass, skip one extra column in tile_load_buffer
         * to align di to the start of the next 4-wide row.
         * (3 cells consumed inner + 1 skip = stride of 4)
         */
        di++;
    }

    /* All background cells rendered; composite the hero sprite layers */
    _choose_hero_sprite();
}
