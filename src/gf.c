#include <stdint.h>
#include <stddef.h>
#include <string.h>

#include "zeliard.h"

/* ─── fman_gfx layout constants (seg1-relative, 9 bytes per sprite group) ── */
/* Each sprite "group" is 9 header bytes; the byte at position N is the       */
/* 1-based tile index for column N of the 3×3 hero sprite grid.               */
#define FMAN_BODY_RIGHT_BASE    (0)                /* right-facing body base */
#define FMAN_BODY_LEFT_BASE     (13 * 9)           /* left-facing body base  */
#define FMAN_BODY_ROPE_BASE     (2 * 13 * 9)       /* on-rope body base      */
#define FMAN_BODY_OPEN_DOOR     ((2 * 13 + 4) * 9)  /* door-hidden body       */
#define FMAN_ARM_RIGHT_BASE     ((2 * 13 + 4 + 1) * 9)
#define FMAN_ARM_LEFT_BASE      ((2 * 13 + 4 + 1 + 18) * 9) // 49 * 9
#define FMAN_SHIELD_FRONT_BASE  ((2 * 13 + 4 + 1 + 2 * 18) * 9) // 67 * 9
#define FMAN_SHIELD_BACK_BASE   ((2 * 13 + 4 + 1 + 2 * 18 + 12) * 9) // 79 * 9

#define DUNGEON_TILE_PACKED_BASE (0x8030) // seg1-relative
#define DUNGEON_TILE_NIBBLE_BASE (0x4000) // seg1-relative
#define DUNGEON_TILE_MASK_BASE   (0xA000) // seg1-relative
#define FMAN_SPRITE_PIXEL_BASE   (0x0333)  /* hero sprite pixel start in seg1 */

uint16_t sword_animation_gfx[];
uint16_t hero_vram_base; // Destination VRAM offset for the hero’s 3x3 tile block
uint16_t entity_vram_src; // VRAM offset where the 32x32 overlay is placed
uint8_t* sword_phase_src; // Pointer to current sword phase tile indices (4x4 grid, 16 bytes)
uint16_t sword_sprite_offsets;
uint8_t viewport_rows_remaining;

uint16_t transparency_mask_bitplane_f; // Transparency color pair (e.g., 0x0901)
// --- Helper state for bitmask generation ---
static uint8_t tile_load_buffer[16];
static uint8_t tile_neighborhood_buffer[9]; // 3x3 frame
static uint8_t  tile_blit_mode;  // palette set by Lookup
static uint8_t  nine_unpacked_tiles[9*64];  // 3x3 frame of 8x8px tiles
static uint8_t  hero_frame_tile_idx;
static uint8_t *nibble_decode_lut; // active palette LUT pointer
static uint16_t tile_vram_cache[128];

uint16_t entity_render_tbl[] = {0x0901, 0x2404, 0x1B03, 0x0901, 0x2404, 0x3606};

static const uint8_t pal_decode_data0[] = {
    0, 1, 2, 3, 8, 9, 0x0A, 0x0B, 0x10, 0x11, 0x12, 0x13, 0x18, 0x19, 0x1A, 0x1B
};

static const uint8_t pal_decode_data1[] = {
    0, 2, 4, 6, 0x10, 0x12, 0x14, 0x16, 0x20, 0x22, 0x24, 0x26, 0x30, 0x32, 0x34, 0x36
};

static const uint8_t pal_decode_data2[] = {
    0, 1, 4, 5, 8, 9, 0x0C, 0x0D, 0x20, 0x21, 0x24, 0x25, 0x28, 0x29, 0x2C, 0x2D
};

static const uint8_t pal_decode_data3[] = {
    0, 5, 6, 7, 0x28, 0x2D, 0x2E, 0x2F, 0x30, 0x35, 0x36, 0x37, 0x38, 0x3D, 0x3E, 0x3F
};

static const uint8_t pal_decode_data4[] = {
    0, 6, 5, 7, 0x30, 0x36, 0x35, 0x37, 0x28, 0x2E, 0x2D, 0x2F, 0x38, 0x3E, 0x3D, 0x3F
};

static const uint8_t *const pal_decode_tbl[] = {
    pal_decode_data0,
    pal_decode_data1,
    pal_decode_data2,
    pal_decode_data3,
    pal_decode_data4,
    pal_decode_data3
};

// VRAM buffer (320x200 bytes)
// Provided here as stub, all the actual rendering should be done in js
extern uint8_t vram[320 * 200];

// --- Helper function declarations (assumed to be defined elsewhere) ---
void load_3x3_tiles(void);
uint8_t Translate_Tile_Index(uint8_t al);
void render_48bytes_packed_tile(uint16_t si_offset, uint16_t di_offset);
void decode_and_render_tile_with_blitting(uint8_t al, uint16_t si_offset, uint16_t bp_offset, uint16_t di_offset);
void render_nibble_compressed_tile(uint16_t si_offset, uint16_t di_offset);
void render_2bpp_tile(uint16_t si_offset, uint16_t bp_offset, uint16_t di_offset);
uint8_t get_player_shield_category(void);

void Clear_Tile_Buffer(uint8_t *dest)
{
    memset(dest, 0, 64);
}

/* 
 * Clears both tile buffers and runs the hero-tile rendering grid WITHOUT
 * re-sampling the proximity map.  Used when the surroundings are known to be
 * clear / already accounted for (animation-only refresh).
 */
// Checked
void Update_Local_Attribute_Cache(void)
{
    memset(tile_neighborhood_buffer, 0, sizeof tile_neighborhood_buffer); /* 9 B  */
    memset(tile_load_buffer,         0, sizeof tile_load_buffer);         /* 16 B */
    _render_hero_3x3();
}

// Loads the 3×3 block of tile indices around the hero’s current position from the proximity map 
// and stores them into tile_neighborhood_buffer. Used later to determine what tiles are 
// under or near the hero for proper rendering and attribute lookups.
// Output:
// tile_neighborhood_buffer (9 bytes) filled with tile indices 
// (negative values indicate valid loaded tiles, zero if blank).
// Checked
void Sample_Neighborhood_Attributes()
{
    load_3x3_tiles();
    
    uint8_t* di = tile_load_buffer;
    uint8_t dl = MEM8(ADDR_HERO_Y) - 1;
    uint16_t a0 = ADDR_PROXIMITY_MAP + MEM8(ADDR_HERO_X_VIEW) + 3;
    
    for (int i = 0; i < 4; i++) {
        uint16_t bx = a0 + (dl & 0x3F) * 36;
        
        for (int j = 0; j < 4; j++) {
            uint8_t al = MEM8(bx);
            if ((al & 0x80) == 0) {
                al = 0;
            }
            *di++ = al;
            bx++;
        }
        dl++;
    }
    _render_hero_3x3();
}


// Main tile refresh routine. Marks the tile cache as dirty for all tiles, 
// then iterates over the 28×19 viewport tilemap, re-rendering any tile 
// that has changed (dirty flag) or is animated. It also calls special handlers 
// for the top‑left and bottom‑right corner entities, 
// and for tiles that require animation updates based on cavern level.
// stub, gfmcga 
void Refresh_Dirty_Tiles_proc()
{

}


// Iterates through a list of active map entities (max 32) 
// and renders each one as a 16×16 sprite onto the viewport. 
// Entities that have expired (flag 0FFh) are removed. 
// Each entity is drawn using a mask table and an entity‑render‑function table 
// that defines the transparency bitplane.
// stub, gfmcga
void Active_Entity_Sprite_Renderer_proc()
{

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
 * Side-effects: tile_blit_mode, frame_ptr.
 */
// reference to frame_ptr should be passed in
// Checked
uint8_t Lookup_Monster_Tile_Attributes(uint8_t tile, uint16_t *frame_ptr) {
    uint8_t cl = MEM8(ADDR_PROXIMITY_LAYER2 + (tile & 0x7F));
    
    uint16_t bp = ADDR_MONSTERS_LIST + cl * 16; // monster struct pointer
    
    // each frame is 5 bytes (palette variant + 4 tile IDs)
    uint16_t offset = (MEM8(bp+6) & 0x0F) * 5; // (monster.anim_counter & 0x0F) * 5
    
    uint16_t si_base = (MEM8(bp+5) & 0x80) // monster.ai_flags bit7
        ? ADDR_MONSTER_AI_MOVE_RIGHT_FRAMES 
        : ADDR_MONSTER_AI_MOVE_LEFT_FRAMES;
    
    uint8_t flags = MEM8(bp+4) & 0x1F; // monster.flags
    *frame_ptr = offset + MEM16(si_base + flags * 2);
    
    uint8_t al = MEM8(*frame_ptr + 0); // 1st byte = palette variant
    
    if (!MEM8(ADDR_IS_BOSS_CAVERN) && (MEM8(bp+5) & 0x20)) {
        al += 3;
    }
    
    tile_blit_mode = al;
    return cl;
}


/* 
 * Renders one 8×8 tile slot into nine_unpacked_tiles[hero_frame_tile_idx × 64].
 *
 * The tile index is at nb_ptr (current position in tile_neighborhood_buffer):
 *   0        → clear the 64-byte slot (transparent / empty tile)
 *   non-zero → packed tile (1-based, 48 bytes at seg1:DUNGEON_TILE_PACKED_BASE)
 *
 * Called when tile_load_buffer shows no monsters near the current hero cell.
 */
void Render_Empty_Or_Cached_Tile(uint8_t *nb_ptr) {
    uint8_t  tile = *nb_ptr;
    uint8_t *dest = &nine_unpacked_tiles[hero_frame_tile_idx * 64];
    
    if (tile == 0) {
        Clear_Tile_Buffer(dest);
    } else {
        uint16_t src_seg1 = (tile - 1) * 48 + DUNGEON_TILE_PACKED_BASE;
        render_48bytes_packed_tile(src_seg1, dest);
    }
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
void Render_Tile_With_Palette(uint8_t tile, uint8_t *nb_ptr) {
    /* Background tile from the neighbourhood buffer */
    uint8_t bg_tile = *nb_ptr;
    if (bg_tile & 0x80)
        bg_tile = Translate_Tile_Index(bg_tile);  /* → proximity_second_layer[idx] */
    
    nibble_decode_lut = pal_decode_tbl[tile_blit_mode];
    
    uint16_t si_offset = DUNGEON_TILE_NIBBLE_BASE + tile * 32;
    uint16_t bp_offset = DUNGEON_TILE_MASK_BASE + tile * 8;
    uint8_t *dest = &nine_unpacked_tiles[hero_frame_tile_idx * 64];
    
    if (bg_tile != 0) {
        decode_and_render_tile_with_blitting(bg_tile, si_offset, bp_offset, dest);
    } else {
        render_nibble_compressed_tile(si_offset, dest);
    }
}

// In original MCGA version!
#define VIEWPORT_TOP_LEFT_VRAM_ADDR equ (48+14*320)

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
    hero_vram_base = VIEWPORT_TOP_LEFT_VRAM_ADDR +
                    ((uint16_t)MEM8(ADDR_HERO_HEAD_Y_VIEW) * 320
                       + (uint16_t)MEM8(ADDR_HERO_X_VIEW)
                    ) * 8; // for 8x8px tiles

    hero_frame_tile_idx = 0;

    /*
     * si : walks tile_neighborhood_buffer row-major (stride 3)
     * di : walks tile_load_buffer in a stride-4 grid; the 2×2 window is
     *      di[0], di[1], di[4], di[5] at each position.
     */
    uint8_t       *si = tile_neighborhood_buffer;
    const uint8_t *di = tile_load_buffer;
    // 0 1 2 3  ; outer0, inner: 0,1,4,5; 1,2,5,6; 2,3,6,7
    // 4 5 6 7  ; outer1, inner: 4,5,8,9; 5,6,9,A; 6,7,A,B
    // 8 9 A B  ; outer2, inner: 8,9,C,D; 9,A,D,E; A,B,E,F
    // C D E F

    for (int outer = 0; outer < 3; outer++) {
        for (int inner = 0; inner < 3; inner++) {

            /* Check the 2×2 proximity window for this cell */
            uint8_t any = di[0] | di[1] | di[4] | di[5];
            uint16_t frame_ptr;

            if (!any) {
                /*
                 * No monsters near this cell.
                 * Render the packed background tile (or clear if tile index 0).
                 */
                Render_Empty_Or_Cached_Tile(si);

            } else if (di[0]) {
                /*
                 * Monster occupies the upper-left neighbour.
                 * tile = frame_data byte 4 (frame_ptr[3]).
                 * Background = *si (tile_neighborhood_buffer[current]).
                 */
                Lookup_Monster_Tile_Attributes(di[0], &frame_ptr);
                Render_Tile_With_Palette(MEM8(frame_ptr + 3), si);

            } else if (di[1]) {
                /* Monster at upper-right: frame byte 3 */
                Lookup_Monster_Tile_Attributes(di[1], &frame_ptr);
                Render_Tile_With_Palette(MEM8(frame_ptr + 2), si);

            } else if (di[4]) {
                /* Monster at lower-left: frame byte 2 */
                Lookup_Monster_Tile_Attributes(di[4], &frame_ptr);
                Render_Tile_With_Palette(MEM8(frame_ptr + 1), si);

            } else { // di[5]
                /*
                 * Monster at lower-right (di[5]): frame byte 1.
                 *
                 * Unique side-effect: the neighbourhood cell is updated with
                 * the background tile from the Lookup (proximity_second_layer
                 * result), so that Render_Tile_With_Palette sees a positive
                 * (already-translated) background tile and skips Translate_Tile_Index.
                 */
                uint8_t bg_tile = Lookup_Monster_Tile_Attributes(di[5], &frame_ptr);
                *si = bg_tile;  /* update neighbourhood buffer */
                Render_Tile_With_Palette(MEM8(frame_ptr + 0), si);
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
// Checked
void _choose_hero_sprite(void)
{
    /* Set hero rendering palette based on current damage flash state */
    nibble_decode_lut = pal_decode_tbl[MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) & 3];

    const uint8_t facing_left = MEM8(ADDR_FACING) & 1;
    const uint8_t squat_flag = MEM8(ADDR_SQUAT_FLAG);
    const uint8_t hero_animation_phase = MEM8(ADDR_HERO_ANIM_PHASE);
    const uint8_t hero_hidden_flag = MEM8(ADDR_HERO_HIDDEN_FLAG);
    const uint8_t on_rope_flags = MEM8(ADDR_ON_ROPE_FLAGS);
    const uint8_t invincibility_flag = MEM8(ADDR_INVINCIBILITY_FLAG);

    /*
     * Layer 1: Back arm
     */
    if (!(invincibility_flag | on_rope_flags | hero_hidden_flag)) {

        /* Base: back arm follows the facing direction directly */
        uint16_t arm_si = facing_left ? FMAN_ARM_LEFT_BASE : FMAN_ARM_RIGHT_BASE;
        uint8_t do_render_arm = 0;
        uint8_t arm_cx = 9; // by default, render full frame of 9 tiles
        uint8_t arm_col = 0; // starting from 0
        uint8_t cat = get_player_shield_category(); // 0=no shield, 1=small, 2=large

        if (MEM8(ADDR_SHIELD_ANIM_ACTIVE)) {
            uint16_t phase_off = (MEM8(ADDR_SHIELD_ANIM_PHASE) >> 1) * 9;

            if (!facing_left) {
                /* Facing right + active shield → SHIELD_BACK_BASE */
                arm_si = FMAN_SHIELD_BACK_BASE + phase_off + (uint16_t)cat * (4 * 9);
            } else {
                /* Facing left + active shield */
                uint16_t off = phase_off + 36;
                switch (MEM8(ADDR_SHIELD_VARIANT_INDEX)) {
                    case 1:  off += 36; break;
                    case 2:  off  = 99; break;
                    default: break;
                }
                arm_si += off;
            }
            do_render_arm = 0xFF;

        } else {
            if (cat && !facing_left) {
                /* Facing right, holding shield (no active animation) */
                uint16_t off = 12 * 9 + (uint16_t)(squat_flag & 9);
                if (cat == 2) off += 3 * 9;
                arm_si += off;
                do_render_arm = 0xFF;

            } else if (!squat_flag && hero_animation_phase != 0x80) {
                /* No shield (or facing left): show walk arm on even phases only.
                 * The arm is visible when (hero_animation_phase + 2) & 3 is even.
                 *   phase 0 → shifted 2 (even, arm offset +18)
                 *   phase 1 → shifted 3 (odd,  skip)
                 *   phase 2 → shifted 0 (even, arm offset +0)
                 *   phase 3 → shifted 1 (odd,  skip) */
                uint8_t shifted = (hero_animation_phase + 2) & 3;
                if (!(shifted & 1)) {
                    arm_si += (uint16_t)shifted * 9;
                    do_render_arm = 0xFF;
                }
            }
            /* else: squat, idle, odd walk phase → no back arm rendered */
        }

        if (do_render_arm) {
            if (squat_flag) {
                arm_col = 3; // skip 3 upper tiles
                arm_cx  = 6; // render 6 tiles
            }
            hero_frame_tile_idx = arm_col;
            Render_Scrolling_Tile(arm_si, arm_cx);
        }
    } // layer 1

    /* 
     * Layer 2: Body
     */
    {
        const uint8_t *body_si;
        uint16_t body_off = 0;

        if (hero_hidden_flag) {
            /* Hiding in doorway: static open-door frame, no additional offset */
            body_si = FMAN_BODY_OPEN_DOOR;
        } else if (on_rope_flags) {
            /* On rope: use normal walk-animation phases (0..3) */
            body_si  = FMAN_BODY_ROPE_BASE;
            body_off = (uint16_t)(hero_animation_phase & 3) * 9;
        } else {
            body_si = facing_left ? FMAN_BODY_LEFT_BASE : FMAN_BODY_RIGHT_BASE;

            if (invincibility_flag) {
                /* Invincibility mode: frames start +10 from body base,
                 * then walk animation on top of that. */
                body_si += 10 * 9;
                body_off = (uint16_t)(hero_animation_phase & 3) * 9;
            } else if (squat_flag) {
                body_off = 5 * 9;
            } else if (MEM8(ADDR_JUMP_PHASE_FLAGS) & 0x80) {
                body_off = 7 * 9;
            } else if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT) {
                body_off = 8 * 9;
            } else if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_LEFT) {
                body_off = 9 * 9;
            } else if (MEM8(ADDR_JUMP_PHASE_FLAGS) == 0x7F) {
                body_off = 6 * 9;
            } else if (hero_animation_phase == 0x80) { // idle
                body_off = 4 * 9;
            } else {
                /* Normal walk animation: phases 0..3 */
                body_off = (uint16_t)(hero_animation_phase & 3) * 9;
            }
        }

        hero_frame_tile_idx = 0;
        Render_Scrolling_Tile(body_si + body_off, 9u);
    } // layer 2

    if (invincibility_flag)
        return; // no front arm, done

    /* 
     * Layer 3: Front arm (drawn over the body)
     * 
     * The front-arm uses the OPPOSITE sprite base from the back arm so that
     * the two arms bracket the body */
    {
        /* Note the intentional inversion vs. Layer 1 */
        const uint8_t *arm_si = facing_left ? FMAN_ARM_RIGHT_BASE : FMAN_ARM_LEFT_BASE;
        uint8_t cat = get_player_shield_category();

        if (on_rope_flags | hero_hidden_flag) {
            /* On rope or hidden: only show front layer if a shield is held */
            if (!cat) return;

            /* Small shield → +14 frames from arm base
             * Large shield → +17 frames from arm base */
            arm_si += (cat == 2) ? 17*9 : 14*9;

        } else if (MEM8(ADDR_SHIELD_ANIM_ACTIVE)) {
            uint16_t phase_off = (uint16_t)(MEM8(ADDR_SHIELD_ANIM_PHASE) >> 1) * 9;

            if (!facing_left) {
                /* Facing right + active shield front → SHIELD_FRONT_BASE */
                arm_si = FMAN_SHIELD_FRONT_BASE + phase_off + (uint16_t)cat * (4 * 9);
            } else {
                /* Facing left + active shield front */
                uint16_t off = phase_off + 4 * 9;
                switch (MEM8(ADDR_SHIELD_VARIANT_INDEX)) {
                    case 1:  off += 4 * 9;  break;
                    case 2:  off  = 11 * 9; break;
                    default: break;
                }
                arm_si += off;
            }
        } else if (facing_left) {
            if (cat) {
                /* Facing left, holding shield (no animation) */
                uint16_t off = (uint16_t)(squat_flag & 9) + 12 * 9;
                if (cat == 2) off += 3 * 9;
                arm_si += off;
            } else {
                /* Facing left, no shield: walk or idle arm */
                uint16_t off = 3 * 9;    /* default: squat / idle */
                if (!squat_flag && hero_animation_phase != 0x80)
                    off = (uint16_t)(hero_animation_phase & 3) * 9;
                arm_si += off;
            }

        } else {
            /* Facing right, no shield animation */
            uint16_t off = 3 * 9;        /* default: squat / idle */
            if (!squat_flag && hero_animation_phase != 0x80)
                off = (uint16_t)(hero_animation_phase & 3) * 9;
            arm_si += off;
        }

        if (squat_flag) {
            hero_frame_tile_idx = 3;
            Render_Scrolling_Tile(arm_si, 6);
        } else {
            hero_frame_tile_idx = 0;
            Render_Scrolling_Tile(arm_si, 9);
        }
    } // layer 3
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
 */
void Render_Scrolling_Tile(const uint8_t *sprite_header, uint8_t cx)
{
    for (; cx > 0u; cx--, sprite_header++, hero_frame_tile_idx++) {
        uint8_t tile = *sprite_header;
        if (tile == 0u)
            continue;   /* transparent slot – advance counter, no pixels */

        const uint8_t *src   = FMAN_SPRITE_PIXEL_BASE
                             + (uint16_t)tile * 32;
        const uint8_t *masks = DUNGEON_TILE_MASK_BASE
                             + (uint16_t)tile * 8;
        uint8_t *dst = nine_unpacked_tiles + (uint16_t)hero_frame_tile_idx * 64;

        render_2bpp_tile(src, masks, dst);
    }
}

// Modifies the value pointed to by ax_ptr (shifts it left by 4 bits).
// bp_out and dx_out should be passed in by the caller.
static void CalculateSpriteBitmask(uint16_t *ax_ptr, uint16_t *bp_out, uint16_t *dx_out) {
    uint16_t ax = *ax_ptr;
    uint16_t bp = 0;
    uint16_t dx = 0;
    
    // Extract top 2 bits (ax15, ax14)
    uint8_t bl = (ax >> 14) & 3;
    ax <<= 2;
    
    if (bl != 0) {
        bp |= 0x00FF;
        dx |= ((bl == 3 ? (transparency_mask_bitplane_f >> 8) : transparency_mask_bitplane_f) & 0xFF);
    }
    
    // Extract next 2 bits (ax13, ax12)
    bl = (ax >> 14) & 3;
    ax <<= 2;
    
    if (bl != 0) {
        bp |= 0xFF00;
        dx |= ((bl == 3 ? (transparency_mask_bitplane_f >> 8) : transparency_mask_bitplane_f) & 0xFF) << 8;
    }
    
    *ax_ptr = ax;
    *bp_out = bp;
    *dx_out = dx;
}

// Applies the calculated mask to VRAM. 
// All the rendering should be done in js, this is just direct translation of original
static inline void ApplyBitmask(uint16_t di_offset, uint16_t bp, uint16_t dx)
{
    uint16_t *vram_word = (uint16_t*)&vram[di_offset];
    *vram_word = (*vram_word & ~bp) | dx;
}


void Render_Sword_Overlay(void)
{
    if (!MEM8(ADDR_SWORD_SWING_FLAG)) {
        return;
    }

    MEM8(ADDR_SWORD_MOVEMENT_PHASE)++;
    uint8_t sword_movement_phase = MEM8(ADDR_SWORD_MOVEMENT_PHASE);
    uint8_t phase_idx = sword_movement_phase - 1;

    uint16_t di_offset = 0;
    uint16_t si_offset = 0; // sprite_composition_data
    uint16_t dx = 0;
    uint16_t offset_val = 0;
    uint8_t facing = MEM8(ADDR_FACING) & LEFT;

    switch (MEM8(ADDR_SWORD_HIT_TYPE)) {
        case 0: // Forward hit: phases 1..6, (5 and 6 are equal)
            if (sword_movement_phase >= 7) { // last phase: finish the swing
                MEM8(ADDR_SWORD_SWING_FLAG) = 0;
                sword_movement_phase = 0;
                return;
            }
            di_offset = facing ? 0x192 : 0x17E;
            si_offset = facing ? 0x0CE : 0x01E; // ← / →
            
            offset_val = *(uint16_t*)(sword_animation_gfx + di_offset + (phase_idx * 2));
            sword_sprite_offsets = offset_val;
            dx = (offset_val & 0xFF) * 320*8 + ((offset_val >> 8) * 8);
            break;
        case 1: // Overhead swing: phases 1..4
            if (sword_movement_phase >= 5) { // last phase: finish the swing
                MEM8(ADDR_SWORD_SWING_FLAG) = 0;
                sword_movement_phase = 0;
                return;
            }
            di_offset = facing ? 0x19E : 0x18A;
            si_offset = facing ? 0x12E : 0x07E; // ↑+← / ↑+→
            
            offset_val = *(uint16_t*)(sword_animation_gfx + di_offset + (phase_idx * 2));
            sword_sprite_offsets = offset_val;
            dx = (offset_val & 0xFF) * 320*8 + ((offset_val >> 8) * 8);
            break;
        default: // Downward thrust: single phase
            if (sword_movement_phase >= 5) {
                MEM8(ADDR_SWORD_SWING_FLAG) = 0;
                sword_movement_phase = 0;
                return;
            }
            si_offset = facing ? 0x16E : 0x0BE; // ↓+← / ↓+→
            sword_sprite_offsets = facing ? 0xFF01 : 0x0001;
            dx = facing ? (320 * 8 - 8) : (320 * 8);
            break;
    }

    uint16_t vram_di = hero_vram_base + dx;
    if (MEM8(ADDR_SQUAT_FLAG)) {
        vram_di += 320 * 8;
    }
    entity_vram_src = vram_di;

    if (MEM8(ADDR_SWORD_HIT_TYPE) == 2) {
        sword_phase_src = (uint8_t*)(uintptr_t)(sword_animation_gfx + si_offset);
    } else {
        sword_phase_src = (uint8_t*)(uintptr_t)(sword_animation_gfx + si_offset + (phase_idx * 16));
    }

    Sword_Overlay_EntryPoint();
}


void Sword_Overlay_EntryPoint(void)
{
    if (!MEM8(ADDR_SWORD_SWING_FLAG)) {
        return;
    }

    MEM8(ADDR_UI_ELEMENT_DIRTY) = 0xFF;

    Clear_Tile_Cache_Around_Hero();
    Copy4x4TilesFromScreenToShadowBuffer();

    uint8_t sword_idx = MEM8(ADDR_SWORD_TYPE) - 1;
    transparency_mask_bitplane_f = entity_render_tbl[sword_idx];

    uint16_t di = entity_vram_src;
    uint8_t* si = (uint8_t*)(uintptr_t)sword_phase_src;

    for (int col = 0; col < 4; col++) {
        uint16_t di_start = di;
        for (int row = 0; row < 4; row++) {
            uint8_t al = *si++;
            
            if (al == 0xFF) {
                // Transparent tile, skip rendering but advance VRAM pointer
                di += 320 * 8;
            } else {
                // Opaque tile: al acts as an index. Each tile is exactly 16 bytes (2 bits per pixel).
                uint16_t gfx_si = (uint16_t)(uintptr_t)sword_animation_gfx + (al * 16);
                
                for (int line = 0; line < 8; line++) {
                    uint16_t ax = *(uint16_t*)(uintptr_t)gfx_si;
                    gfx_si += 2;
                    
                    // xchg ah, al
                    ax = (ax >> 8) | (ax << 8);
                    
                    // Process 4 groups of 4 bits per line. 
                    // Each call consumes 4 bits from 'ax' by shifting it left.
                    uint16_t bp, dx;
                    CalculateSpriteBitmask(&ax, &bp, &dx);
                    ApplyBitmask(di, bp, dx);
                    
                    CalculateSpriteBitmask(&ax, &bp, &dx);
                    ApplyBitmask(di + 2, bp, dx);
                    
                    CalculateSpriteBitmask(&ax, &bp, &dx);
                    ApplyBitmask(di + 4, bp, dx);
                    
                    CalculateSpriteBitmask(&ax, &bp, &dx);
                    ApplyBitmask(di + 6, bp, dx);
                    
                    di += 320; // Advance to next scanline in VRAM
                }
            }
        }
        // Move to the next column (8 pixels to the right)
        di = di_start + 8;
    }
}

/////////////////

// ---- External global variables (declared in other translation units) ----


// --- High‑level rendering entry points ---
void render_hero_sword(void);

/* =================================================================== */

void render_hero_sword(void) {
    int threshold = 18 - (int)viewport_rows_remaining;
    int y = hero_head_y_in_viewport;

    if (!sword_swing_flag) {
        // Sword not swinging
        if ((y - 2) == threshold) {
            CopyTileBufferToVRAM();
        }
        return;
    }

    // Sword swinging
    if (threshold < (y - 5))
        return;

    if (threshold == (y - 5)) {
        Flush_Ui_Element_If_Dirty();
        CopyTileBufferToVRAM();
        return;
    }

    if (threshold == (y + 5)) {
        Sword_Overlay_EntryPoint();
    }
}

// Copies 9 hero tiles from nine_unpacked_tiles to VRAM
// This should be done in js, by drawing entire 3x3 tiles sprite from prepared fman spritesheet
void CopyTileBufferToVRAM(void) {
    if (MEM8(ADDR_HERO_SPRITE_HIDDEN))
        return;                     // already hidden, nothing to do

    MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0xFF;

    const uint8_t *src = nine_unpacked_tiles;
    for (int row = 0; row < 3; ++row) {
        for (int col = 0; col < 3; ++col) {
            uint16_t dest_off = hero_vram_base +
                                row * (320 * 8) +
                                col * 8;
            Copy_tile(dest_off, src);
            src += 64;   // next 8x8 tile
        }
    }
}

// All the rendering should be done in js, this is just direct translation of original
static void Copy_tile(uint16_t dest_off, const uint8_t *src) {
    for (int y = 0; y < 8; ++y) {
        memcpy(&vram[dest_off], src, 8);
        src += 8;
        dest_off += 320;
    }
}

void Flush_Ui_Element_If_Dirty(void) {
    if (!MEM8(ADDR_UI_ELEMENT_DIRTY))
        return;

    Blit32x32SpriteToVram();
    MEM8(ADDR_UI_ELEMENT_DIRTY) = 0;
}

// All the rendering should be done in js, this is just direct translation of original
static void Blit32x32SpriteToVram(void) {
    // entity_vram_src and VRAM shadow at offset 64064
    const uint8_t *src = &vram[64064];   // shadow buffer
    uint16_t dest_off = entity_vram_src;

    for (int y = 0; y < 32; ++y) {
        memcpy(&vram[dest_off], src, 32);
        src += 320;
        dest_off += 320;
    }
}

// copies 32x32 region from screen to shadow VRAM buffer
// This should be done in js, by operating entire 4x4 tiles sprites from prepared spritesheet, and js buffers
static void Copy4x4TilesFromScreenToShadowBuffer(void) {
    const uint8_t *src = &vram[entity_vram_src];
    uint8_t *dest = &vram[64064]; // shadow VRAM buffer, 1024 bytes

    for (int y = 0; y < 32; ++y) {
        memcpy(dest, src, 32);
        src += 320;
        dest += 32;
    }
}

/* ------------------------------------------------------------------- */
void Sword_Overlay_EntryPoint(void) {
    if (!MEM8(ADDR_SWORD_SWING_FLAG))
        return; // sword sheathed

    MEM8(ADDR_UI_ELEMENT_DIRTY) = 0xFF;

    Clear_Tile_Cache_Around_Hero();
    Copy4x4TilesFromScreenToShadowBuffer();    // save hero upper half

    // Choose transparency colour pair
    uint8_t type = MEM8(ADDR_SWORD_TYPE) - 1;      // 0‑based
    transparency_mask_bitplane_f = entity_render_tbl[type];

    const uint8_t *sword_gfx_base = sword_animation_gfx; // base of graphics data
    const uint8_t *phase = sword_phase_src;              // 4x4 tile indices

    uint16_t vram_off = entity_vram_src;                 // di

    for (int col = 0; col < 4; ++col) {
        uint16_t col_start = vram_off;
        for (int row = 0; row < 4; ++row) {
            uint8_t tile_idx = *phase++;
            if (tile_idx == 0xFF) {
                // Fully transparent tile
                vram_off += 320 * 8;
                continue;
            }

            // Opaque tile: tile graphics at base + tile_idx * 16
            const uint8_t *tile_gfx = sword_gfx_base + tile_idx * 16;

            // Draw 8 lines of this 8×8 tile
            for (int line = 0; line < 8; ++line) {
                uint16_t ax;    // used as 16‑bit work register
                uint16_t bp_mask, dx_color;

                // Load 2 bytes = 4 pixel pairs
                ax = *(uint16_t *)tile_gfx;
                tile_gfx += 2;

                // Swap bytes to process high byte first
                ax = (uint16_t)((ax >> 8) | (ax << 8));

                // Apply 4 pixel pairs to the VRAM word at [di], [di+2], [di+4], [di+6]
                uint16_t *vram_ptr = (uint16_t *)&vram[vram_off];
                for (int p = 0; p < 4; ++p) {
                    CalculateSpriteBitmask(&ax, &bp_mask, &dx_color);
                    bp_mask = ~bp_mask;
                    vram_ptr[0] = (vram_ptr[0] & bp_mask) | dx_color;
                    vram_ptr += 1;   // advance by 2 bytes = next word
                }

                vram_off += 320;
            }
            // After tile: loop continues, vram_off already points to start of next tile row
        }
        // Next column
        vram_off = col_start + 8;   // advance by one tile width (8 pixels)
    }
}


void Clear_Tile_Cache_Around_Hero()
{
    const uint8_t y_sub = (uint8_t)(sword_sprite_offsets & 0xFF);   /* low  byte */
    const uint8_t x_sub = (uint8_t)(sword_sprite_offsets >> 8);       /* high byte */
    uint8_t tile_row = (MEM8(ADDR_HERO_HEAD_Y_VIEW) + y_sub) & 0x3F;
    uint8_t tile_col = (uint8_t)(MEM8(ADDR_HERO_X_VIEW) + x_sub + 4);

    uint16_t si = MEM16(ADDR_VIEWPORT_LEFT_TOP) + (uint16_t)tile_row * 36 + tile_col;
    wrap_map_from_above(&si);

    for (int outer = 0; outer < 4; outer++) {
        for (int inner = 0; inner < 4; inner++) {
            // Bit 7 is a flag; mask it off to get the tile ID
            uint8_t tile_id = MEM8(si) & 0x7F;
            si++;
            tile_vram_cache[tile_id] = 0; // invalidate cache entry
        }
        si += 32; // 36-tile-wide row, we read 4 → skip remaining 32
        wrap_map_from_above(&si);
    }
}
