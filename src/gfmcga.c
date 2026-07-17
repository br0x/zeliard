#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>

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
#define FMAN_SHIELD_BACK_BASE   ((2 * 13 + 4 + 1 + 2 * 18 + 12) * 9) // 79 * 9 = 0x2c7

#define FMAN_SPRITE_PIXEL_OFFSET   (0x0333)  /* hero sprite pixel start in seg1 */

// sword_animation_gfx: (1 of 3 datasets, per sword size, defined during dungeon init)
// tiles_pixel_data_offset    dw ?
// sword_reachability_offsets dw 14 dup(?)
// sprite_composition_data    db 22*16 dup (?)
// overlay_offsets            dw (6+4+6+4) dup (?)
// reachability_data0:
// ...
// reachability_dataN:
// ...
// tiles_pixel_data:
// ...
#define SWORD_COMPOSITION_DATA_START (15*2)
#define SWORD_FORWARD_RIGHT_BASE (0)
#define SWORD_OVERHEAD_RIGHT_BASE (6 * 16)
#define SWORD_DOWNWARD_RIGHT_BASE ((6 + 4) * 16)
#define SWORD_FORWARD_LEFT_BASE  (11 * 16)
#define SWORD_OVERHEAD_LEFT_BASE ((11 + 6) * 16)
#define SWORD_DOWNWARD_LEFT_BASE ((11 + 6 + 4) * 16)

#define SWORD_OFFSETS_DATA_START (15*2 + 22*16)
#define SWORD_OFFSETS_FORWARD_RIGHT (0)
#define SWORD_OFFSETS_OVERHEAD_RIGHT (6 * 2)
#define SWORD_OFFSETS_FORWARD_LEFT ((6 + 4) * 2)
#define SWORD_OFFSETS_OVERHEAD_LEFT ((6 + 4 + 6) * 2)

#define DUNGEON_TILE_PACKED_BASE (0x8030) // seg1-relative
#define DCHR_TILE_PACKED_BASE    (0x8C00) // seg1-relative
#define MONSTER_TILE_NIBBLE_BASE (0x4000) // seg1-relative
#define MONSTER_TILE_MASK_BASE   (0xA000) // seg1-relative
#define SWORD_ANIM_GFX_BASE      (0xB000) // seg1-relative
#define FMAN_TILE_MASK_BASE      (0xD000) // seg1-relative
#define FMAN_GFX_BASE            (0x6000) // seg1-relative

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
static uint8_t  hero_tile_col_idx;
static const uint8_t *nibble_decode_lut; // active palette LUT pointer
static uint8_t * tile_vram_cache[128]; // each element is a pointer to a 8x8 tile in VRAM

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

static const uint16_t boss_explosion_mask_variants[] = {
    0x1210, 0x3630, 0x3F38, 0x3630
};

// Note: the masks below (unlike the original) have swapped low and high bytes, to avoid xchg ah, al
static const uint16_t explosion_ring_phase0[] = {
    0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
    0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
    0b0000000000001011, 0b1101000000000000, 0b0000000001011111, 0b1111101000000000,
    0b0000000001111111, 0b1111111000000000, 0b0000000011111111, 0b1111111100000000,
    0b0000000011111111, 0b1111111100000000, 0b0000000001111111, 0b1111111000000000,
    0b0000000001011111, 0b1111101000000000, 0b0000000000001011, 0b1101000000000000,
    0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
    0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000
};

static const uint16_t explosion_ring_phase1[] = {
    0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
    0b0000000000101111, 0b1111010000000000, 0b0000000011111111, 0b1111111100000000,
    0b0000001111111111, 0b1111111111000000, 0b0000011111111111, 0b1111111111100000,
    0b0000111111111010, 0b0101111111110000, 0b0000111111110000, 0b0000111111110000,
    0b0000111111110000, 0b0000111111110000, 0b0000111111111010, 0b0101111111110000,
    0b0000011111111111, 0b1111111111100000, 0b0000001111111111, 0b1111111111000000,
    0b0000000011111111, 0b1111111100000000, 0b0000000000101111, 0b1111010000000000,
    0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000
};

static const uint16_t explosion_ring_phase2[] = {
    0b0000000000101111, 0b1111010000000000, 0b0000000101111111, 0b1111111010000000,
    0b0000011111111111, 0b1111111111100000, 0b0000111111111111, 0b1111111111110000,
    0b0011111111110100, 0b0010111111111100, 0b0111111110100000, 0b0000010111111110,
    0b0111111110000000, 0b0000000111111110, 0b1111111100000000, 0b0000000011111111,
    0b1111111100000000, 0b0000000011111111, 0b0111111110000000, 0b0000000111111110,
    0b0111111110100000, 0b0000010111111110, 0b0011111111110100, 0b0010111111111100,
    0b0000111111111111, 0b1111111111110000, 0b0000011111111111, 0b1111111111100000,
    0b0000000101111111, 0b1111111010000000, 0b0000000000101111, 0b1111010000000000
};

static const uint16_t explosion_ring_phase3[] = {
    0b0000000000101111, 0b1111010000000000, 0b0000000101111111, 0b1111111010000000,
    0b0000011111010000, 0b0000101111100000, 0b0000111100000000, 0b0000000011110000,
    0b0011110000000000, 0b0000000000111100, 0b0111100000000000, 0b0000000000011110,
    0b0111000000000000, 0b0000000000001110, 0b1111000000000000, 0b0000000000001111,
    0b1111000000000000, 0b0000000000001111, 0b0111000000000000, 0b0000000000001110,
    0b0111100000000000, 0b0000000000011110, 0b0011110000000000, 0b0000000000111100,
    0b0000111100000000, 0b0000000011110000, 0b0000011111010000, 0b0000101111100000,
    0b0000000101111111, 0b1111111010000000, 0b0000000000101111, 0b1111010000000000
};

static const uint16_t *const boss_explosion_ring_phases[] = {
    explosion_ring_phase3,
    explosion_ring_phase2,
    explosion_ring_phase1,
    explosion_ring_phase0
};
// VRAM buffer (320x200 bytes), in MCGA mode 13h starts at 0xA0000
// Provided here as stub, all the actual rendering should be done in js
uint8_t vram[320 * 200];
uint8_t vram_shadow[1536];
#define viewport_top_left_vram_offset (14*320 + 48)
#define viewport_top_right_vram_offset (14*320 + 48 + 27 * 8)

uint8_t get_random();
static uint8_t get_from_layer2(uint8_t al);
static void render_48bytes_packed_tile(const uint8_t *si, uint8_t *di);
static void decode_and_render_tile_with_blitting(uint8_t bg_tile, const uint8_t *si, const uint8_t *bp, uint8_t *di);
static void render_nibble_compressed_tile(const uint8_t *si, uint8_t *dst);
// void Sword_Overlay_EntryPoint();
static void render_tile_to_temp_buffer(const uint8_t *si, const uint8_t *bp, uint8_t *di);
// static void Copy4x4TilesFromScreenToShadowBuffer();
void Clear_Tile_Cache_Around_Hero();
void Flush_Ui_Element_If_Dirty();
void Copy_Hero_Frame_To_VRAM();
static void Copy_Tile_To_VRAM(uint16_t dest_off, const uint8_t *src);
static void render_tile_neighborhood_cell_internal(uint8_t **si, uint8_t **di, uint8_t **bp, uint16_t *dx);

uint8_t get_random()
{
    return rand() & 0xFF;
}

void Clear_Tile_Buffer(uint8_t *dest)
{
    memset(dest, 0, 64);
}

uint8_t get_player_shield_category()
{
    uint8_t shield_type = MEM8(ADDR_SHIELD_TYPE);
    if (shield_type == 0) return 0;
    return (shield_type >= 4) ? 2 : 1;
}

void load_3x3_tiles()
{
    uint16_t si = MEM16(ADDR_VIEWPORT_LEFT_TOP) + MEM8(ADDR_HERO_HEAD_Y_VIEW) * PROX_COLS + MEM8(ADDR_HERO_X_VIEW) + 4;
    wrap_map_from_above(&si);
    uint8_t *di = tile_neighborhood_buffer;
    for (int i = 0; i < 3; i++) {
        memmove(di, &g_mem[(si) & 0xFFFF], 3);
        si += PROX_COLS;
        wrap_map_from_above(&si);
        di += 3;
    }
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
        uint16_t bx = a0 + (dl & 0x3F) * PROX_COLS;
        
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
    
    uint16_t bp = ADDR_MONSTERS_LIST + tile * 16; // monster struct pointer
    
    // each frame is 5 bytes (palette variant + 4 tile IDs: tl, tr, bl, br)
    uint16_t offset = (MEM8(bp+6) & 0x0F) * 5; // (.anim_counter & 0x0F) * 5
    
    uint16_t si_base = (MEM8(bp+5) & 0x80) // .ai_flags bit7 = monster facing direction
        ? ADDR_MONSTER_AI_MOVE_RIGHT_FRAMES 
        : ADDR_MONSTER_AI_MOVE_LEFT_FRAMES;
    
    uint8_t flags = MEM8(bp+4) & 0x1F; // .flags
    // Note! In js we should create own lookup tables 
    // to map (.anim_counter, .ai_flags bit7, and .flags) to the correct frame
    *frame_ptr = offset + MEM16(si_base + flags * 2);
    
    uint8_t al = MEM8(*frame_ptr + 0); // 1st byte = palette variant
    
    if (!MEM8(ADDR_IS_BOSS_CAVERN) && (MEM8(bp+5) & 0x20)) { // .ai_flags
        al += 3;
    }
    
    tile_blit_mode = al;
    return cl;
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

// TODO: rendering should be handled by js
void Render_Sword_Overlay()
{
    if (!MEM8(ADDR_SWORD_SWING_FLAG)) {
        return;
    }

    MEM8(ADDR_SWORD_MOVEMENT_PHASE)++;
    uint8_t sword_movement_phase = MEM8(ADDR_SWORD_MOVEMENT_PHASE);
    uint8_t phase_idx = sword_movement_phase - 1;
    uint16_t di_offset = 0; // overlay_offset
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
            di_offset = facing 
                ? (SWORD_OFFSETS_DATA_START + SWORD_OFFSETS_FORWARD_LEFT)    // ←
                : (SWORD_OFFSETS_DATA_START + SWORD_OFFSETS_FORWARD_RIGHT);  // →
            si_offset = facing 
                ? (SWORD_COMPOSITION_DATA_START + SWORD_FORWARD_LEFT_BASE)   // ←
                : (SWORD_COMPOSITION_DATA_START + SWORD_FORWARD_RIGHT_BASE); // →
            
            offset_val = MEM16(SWORD_ANIM_GFX_BASE + di_offset + (phase_idx * 2));
            sword_sprite_offsets = offset_val;
            // VRAM offset:
            dx = (offset_val & 0xFF) * 320*8  // low byte: vertical tiles
                + ((offset_val >> 8) * 8);    // high byte: horizontal tiles
            break;
        case 1: // Overhead swing: phases 1..4
            if (sword_movement_phase >= 5) { // last phase: finish the swing
                MEM8(ADDR_SWORD_SWING_FLAG) = 0;
                sword_movement_phase = 0;
                return;
            }
            di_offset = facing 
                ? (SWORD_OFFSETS_DATA_START + SWORD_OFFSETS_OVERHEAD_LEFT)    // ↑+←
                : (SWORD_OFFSETS_DATA_START + SWORD_OFFSETS_OVERHEAD_RIGHT);  // ↑+→
            si_offset = facing 
                ? (SWORD_COMPOSITION_DATA_START + SWORD_OVERHEAD_LEFT_BASE)   // ↑+←
                : (SWORD_COMPOSITION_DATA_START + SWORD_OVERHEAD_RIGHT_BASE); // ↑+→
            
            offset_val = MEM16(SWORD_ANIM_GFX_BASE + di_offset + (phase_idx * 2));
            sword_sprite_offsets = offset_val;
            // VRAM offset:
            dx = (offset_val & 0xFF) * 320*8  // low byte: vertical tiles 
                + ((offset_val >> 8) * 8);    // high byte: horizontal tiles 
            break;
        default: // Downward thrust: single phase
            if (sword_movement_phase >= 5) {
                MEM8(ADDR_SWORD_SWING_FLAG) = 0;
                sword_movement_phase = 0;
                return;
            }
            si_offset = facing 
                ? (SWORD_COMPOSITION_DATA_START + SWORD_DOWNWARD_LEFT_BASE)   // ↓+←
                : (SWORD_COMPOSITION_DATA_START + SWORD_DOWNWARD_RIGHT_BASE); // ↓+→
            sword_sprite_offsets = facing 
                ? 0xFF01  // ↓+← hardcoded: +1 tile vertical, -1 tile horizontal
                : 0x0001; // ↓+→ hardcoded: +1 tile vertical, 0 tiles horizontal
            dx = facing ? (1 * 320 * 8 - 1 * 8) : (1 * 320 * 8 + 0 * 8);
            break;
    }

    // uint16_t vram_di = hero_vram_base + dx;
    // if (MEM8(ADDR_SQUAT_FLAG)) {
    //     vram_di += 320 * 8;
    // }
    // entity_vram_src = vram_di;

    if (MEM8(ADDR_SWORD_HIT_TYPE) == 2) { // downward thrust, single phase
        sword_phase_src = &g_mem[SWORD_ANIM_GFX_BASE + si_offset];
    } else {
        sword_phase_src = &g_mem[SWORD_ANIM_GFX_BASE + si_offset + (phase_idx * 16)];
    }

    // Sword_Overlay_EntryPoint(); // removed: sword rendering is handled by js
}



// Copies 9 hero tiles from nine_unpacked_tiles to VRAM
// This should be done in js, by combining the 3x3 tiles sprites from prepared fman spritesheet
// Checked
void Copy_Hero_Frame_To_VRAM()
{
    if (MEM8(ADDR_HERO_SPRITE_HIDDEN))
        return;                     // already hidden, nothing to do

    MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0xFF;

    // const uint8_t *src = nine_unpacked_tiles; // uint8_t nine_unpacked_tiles[576] (3x3 frame of 8x8px tiles)
    // for (int row = 0; row < 3; ++row) {
    //     for (int col = 0; col < 3; ++col) {
    //         uint16_t dest_off = hero_vram_base + row * (320 * 8) + col * 8;
    //         Copy_Tile_To_VRAM(dest_off, src);
    //         src += 64;   // next 8x8 tile
    //     }
    // }
}

// All the rendering should be done in js, this is just direct translation of original
// dest_off is VRAM offset, src is pointer to 64 bytes linear tile data
// Checked
static void Copy_Tile_To_VRAM(uint16_t dest_off, const uint8_t *src)
{
    // for (int y = 0; y < 8; ++y) {
    //     memcpy(&vram[dest_off], src, 8);
    //     src += 8;
    //     dest_off += 320;
    // }
}

void Flush_Ui_Element_If_Dirty() 
{
    if (!MEM8(ADDR_UI_ELEMENT_DIRTY))
        return;

    // Blit32x32SpriteToVram(); // removed: sword rendering is handled by js
    MEM8(ADDR_UI_ELEMENT_DIRTY) = 0;
}

// All the rendering should be done in js, this is just direct translation of original
// static void Blit32x32SpriteToVram()
// {
//     // entity_vram_src and VRAM shadow at offset 64064
//     const uint8_t *src = &vram_shadow[64];   // shadow buffer
//     uint16_t dest_off = entity_vram_src;

//     for (int y = 0; y < 32; ++y) {
//         memcpy(&vram[dest_off], src, 32);
//         src += 32;
//         dest_off += 320;
//     }
// }

// copies 32x32 region from screen to shadow VRAM buffer
// This should be done in js, by operating entire 4x4 tiles sprites from prepared spritesheet, and js buffers
// static void Copy4x4TilesFromScreenToShadowBuffer()
// {
//     const uint8_t *src = &vram[entity_vram_src];
//     uint8_t *dest = &vram_shadow[64]; // shadow VRAM buffer, 1024 bytes

//     for (int y = 0; y < 32; ++y) {
//         memcpy(dest, src, 32);
//         src += 320;
//         dest += 32;
//     }
// }

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

/*
 * ═════════════════════════════════════════════════════════════════════════════
 *  NOTICE: All functions below this comment have been moved to game.js.
 *  The C code is kept for reference only — it is no longer called.
 *  
 *  dungeon.c no longer calls Refresh_Dirty_Tiles(). The dungeon drawing 
 *  loop in game.js handles:
 *    - static tile rendering  (drawDungeonTiles)
 *    - entity overlay         (drawDungeonEntities, via enp1.png)
 *    - tile animation         (animateDungeonTiles, for caverns 5–8)
 *    - hero compositing       (drawDungeonHero)
 *    - sword overlay          (drawDungeonSword)
 *    - boss explosions        (Boss_Explosions_Renderer, kept in C for now)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Original C translation of the mode 13h (320x200x256) tile-refresh routines
 * from Zeliard's MCGA graphics driver.  Kept below as a reference / backup.
 *
 * IMPORTANT TRANSLATION NOTES / ASSUMPTIONS (from the original port):
 *
 * 1. Segments -> flat pointers.
 *    The original code juggles ds/es/cs to reach three different things:
 *      - the game's normal data 
 *      - the real VRAM / framebuffer (es = 0xA000)      -> here: VGA
 *      - a "seg1" blob holding packed/compressed tile graphics -> here: GFX
 *    I modeled the latter two as flat `uint8_t *` bases (declared extern in
 *    zeliard_tiles.h) and turned every "es:0xA000+off" / "ds:seg1+off" into
 *    "VGA + off" / "GFX + off". All addresses/offsets that were 16-bit words in the original, 
 *    are kept as uint16_t so the same wraparound arithmetic still applies.
 *
 * 2. vram_shadow_addr -> vram_shadow.
 *    The original composes a tile (background + optional sprite blit) into
 *    an off-screen scratch area inside real VRAM before copying it to its
 *    final destination with Copy_Tile_To_VRAM. I kept that as a plain `uint8_t *`
 *    pointing at >=64 bytes of scratch memory; it must be reachable the
 *    same way VGA is, since Copy_Tile_To_VRAM moves data from one into the other.
 *
 * 3. tile_cache_dirty_flags.
 *    The snippet only declares `tile_cache_dirty_flags db 0` (1 byte), but
 *    the code reads/writes up to 4 contiguous bytes from it. This must mean the full source has
 *    a small array/run of adjacent byte variables here that didn't make it
 *    into the snippet. I modeled it as a 4-byte array. It's
 *    used purely as short-lived scratch space (write old value, then read
 *    it back a few lines later), never persisted across calls, so this is
 *    safe regardless of the "real" layout.
 *
 * 4. Lookup_Monster_Tile_Attributes is sometimes called for its return
 *    value and sometimes called and its result immediately discarded by
 *    the original code (the call is made anyway - it evidently has a
 *    needed side effect, e.g. updating some monster-tracking state, that
 *    the original author didn't need the return value for at that call
 *    site). I preserved every call exactly, including the ones whose
 *    result is unused, with a comment marking which is which.
 *
 * 5. Render_Tile_Neighborhood_Cells opens with `call $+3`. That instruction
 *    pushes a return address equal to the very next instruction (its
 *    encoded displacement is 0) and "jumps" there, so execution falls
 *    into the function body as normal - but that pushed address is still
 *    sitting on the stack above the real caller's. When the function
 *    hits its `retn`, it pops *that* one first and jumps back into its
 *    own body (now with si/di/bp/dx already advanced one cell), running
 *    the whole thing a second time; only the second `retn` pops the real
 *    caller's address and actually returns. So every *single* call to
 *    Render_Tile_Neighborhood_Cells in the original renders two
 *    consecutive cells, not one - the second gated by tile_cache_dirty_
 *    flags[1] instead of [0] (and in a couple of call sites that second
 *    byte is forced to 0 beforehand, making that second cell render
 *    unconditionally). C has no equivalent of a function quietly running
 *    its own body twice via a borrowed return address, so I modeled this
 *    by writing Render_Tile_Neighborhood_Cells as a single-cell-and-
 *    advance helper and calling it *twice* at every site that calls it
 *    once in the original - same net effect, explicit instead of implicit.
 *
 * 6. Several places in Refresh_Dirty_Tiles unroll an identical per-column
 *    body 24+ times by hand (classic 8088-era optimization). I collapsed
 *    those back into plain `for` loops - same registers read/written in
 *    the same order, same number of iterations, just legible.
 *
 * 7. Cell index 0 (top-left) and the row-0/column-0 cell are deliberately
 *    visited twice: once by the optional corner-entity / dual-cache check,
 *    then unconditionally by the regular per-column path right after. This
 *    is intentional in the original (the corner check marks the cell as
 *    freshly drawn with the 0xFF sentinel so the regular path's own
 *    "already fresh" check no-ops on it) - it isn't a translation bug.
 */


uint8_t  hero_tile_row_idx;
uint8_t  render_counter; // incremented every Refresh_Dirty_Tiles, used to animate tiles every odd frame
uint16_t viewport_row_vram_offset;

/* See note 3 above. */
uint8_t  tile_cache_dirty_flags[4];

/*
 * Unpacks 3 source bytes into four 6-bit pixel values and writes them to
 * `dst[0..3]`, advancing both pointers (src by 3, dst by 4). This is the
 * "lodsw/lodsb; ... 3 bytes -> 4 pixels" block that both
 * render_48bytes_packed_tile and Dungeon_Static_Tile_Cached_Drawer perform identically;
 * I factored it out instead of duplicating the bit-twiddling twice.
 * `row_stride` is added to dst after every 8 pixels (one tile row); pass 0
 * for a contiguous destination (the shadow tile buffer) or 320-8 to skip
 * to the next screen line in a real 320-px-wide framebuffer.
 */
static void decode_packed_6bit_tile(const uint8_t *src, uint8_t *dst, int row_stride)
{
    for (int row = 0; row < 8; row++) {
        for (int group = 0; group < 2; group++) {
            uint8_t m0 = src[0];
            uint8_t m1 = src[1];
            uint8_t m2 = src[2];
            src += 3;

            dst[0] = (uint8_t)(m1 >> 2);
            dst[1] = (uint8_t)(((m1 & 0x03) << 4) | (m0 >> 4));
            dst[2] = (uint8_t)(((m0 & 0x0F) << 2) | (m2 >> 6));
            dst[3] = (uint8_t)(m2 & 0x3F);
            dst += 4;
        }
        dst += row_stride;
    }
}

/* VRAM-to-VRAM 8x8 tile copy (used when a tile has already been drawn
 * elsewhere on screen and can just be copied). */
// All the rendering should be done in js, this is just direct translation of original
static void copy_8x8_within_vram(const uint8_t *src, uint8_t *dst)
{
    for (int row = 0; row < 8; row++) {
        memcpy(dst, src, 8);
        src += 320;
        dst += 320;
    }
}

/* Blanks an 8x8 tile in VRAM. */
// All the rendering should be done in js, this is just direct translation of original
static void clear_8x8_tile_vram(uint8_t *dst)
{
    for (int row = 0; row < 8; row++) {
        memset(dst, 0, 8);
        dst += 320;
    }
}

/*
 * SI: source (packed, 48 bytes) -- AL: 6-bit packed bg tile idx, 0-based
 * DI: render address, contiguous (advances 64 bytes total, no row stride)
 */
static void render_48bytes_packed_tile(const uint8_t *src, uint8_t *dst)
{
    decode_packed_6bit_tile(src, dst, 0);
}

/*
 * AL: Tile Index (1-based; 0 = "no tile" -> blank)
 * DX: Screen destination address / 2
 *
 * Draws an 8x8 background-only tile straight to the VRAM, using
 * tile_vram_cache to avoid re-decoding a tile that's already been drawn
 * somewhere else on screen this pass (just copy the existing pixels
 * instead).
 */
static void Dungeon_Static_Tile_Cached_Drawer(uint8_t al, uint16_t dx)
{
    uint8_t *di = &vram[dx * 2];

    if (al == 0) {
        clear_8x8_tile_vram(di);
        return;
    }

    if (tile_vram_cache[al] != 0) { // tile was already decoded and cached
        uint8_t *si = tile_vram_cache[al];
        copy_8x8_within_vram(si, di);
        return;
    }

    uint8_t bg_idx = (uint8_t)(al - 1);
    tile_vram_cache[al] = di;

    // tile IDs 1..0x3f are mppN.grp tiles (seg1:0x8030..0x8BFF)
    // 0x40..0x66 are dchr.grp tiles (seg1:0x8C00..0x931F)
    const uint8_t *src = &g_mem[0x10000 + DUNGEON_TILE_PACKED_BASE + (uint16_t)bg_idx * 48];
    decode_packed_6bit_tile(src, di, 320 - 8);
}

/*
 * Input:  AX (by reference) holds up to 4 nibbles to translate;
 *         each call consumes the current top nibble and shifts AX left 4.
 * Output: translated pixel byte via nibble_decode_lut.
 */
// Checked
static uint8_t get_pixel_from_table_by_ax_hi_nibble(uint16_t *ax)
{
    uint8_t nibble = (uint8_t)((*ax >> 12) & 0x0F);
    *ax <<= 4;
    return nibble_decode_lut[nibble];
}

// All rendering should be done in js, this is just direct translation of original
/*
 * Input:  AX holds 4 nibbles to translate;
 * Translated pixel bytes are written to di destination
 */
// Checked
static void draw_4_pix_from_table_by_ax(uint8_t *di, uint16_t ax)
{
    for (int i = 0; i < 4; i++) {
        *di++ = get_pixel_from_table_by_ax_hi_nibble(&ax);
    }
}

// All rendering should be done in js, this is just direct translation of original
// src: points to compressed tile data (32 bytes)
// dst: destination buffer (64 bytes)
// Checked
static void render_nibble_compressed_tile(const uint8_t *src, uint8_t *dst)
{
    for (int i = 0; i < 8; i++) {
        uint16_t ax = (uint16_t)src[0] | ((uint16_t)src[1] << 8);
        draw_4_pix_from_table_by_ax(dst, ax);
        src += 2;

        ax = (uint16_t)src[0] | ((uint16_t)src[1] << 8);
        draw_4_pix_from_table_by_ax(dst, ax);
        src += 2;
    }
}

/*
 * Renders 4 pixels: 
 * `ax` supplies 4 nibbles (consumed/shifted one at a time via get_pixel_from_table_by_ax_hi_nibble), 
 * `dl` supplies 4 transparency mask bits (top bit first; shifted left after every pixel). 
 * Where the mask bit is 1, the existing background pixel at `*di` is kept; 
 * where it's 0, the translated sprite pixel is written. 
 * `di` is advanced by 4.
 */
// Checked
static void four_pixels_or_blit(uint8_t *dl, uint16_t *ax, uint8_t **di)
{
    for (int i = 0; i < 4; i++) {
        uint8_t mask = (uint8_t)((*dl & 0x80) ? 0xFF : 0x00);
        *dl <<= 1;

        uint8_t bg = **di & mask;
        // OR-blit the translated pixel
        **di = (uint8_t)(get_pixel_from_table_by_ax_hi_nibble(ax) | bg);
        (*di)++;
    }
}

/*
 * Renders an 8x8 nibble-packed tile on top of whatever is already in destination, using a 1-bit-per-pixel mask.
 * SI: tile data, 32 bytes (8 nibbles per 8px row) contiguous.
 * BP: points to transparency mask, 8 bytes (8 bits per 8px row) contiguous.
 * DI: temp. buffer destination, 8 bytes (1 row) at a time, contiguous (64 bytes total)
 */
// Checked
static void render_tile_to_temp_buffer(const uint8_t *si, const uint8_t *bp, uint8_t *di)
{
    for (int row = 0; row < 8; row++) {
        uint8_t dl = bp[row];

        uint16_t word = (uint16_t)(si[0] | (si[1] << 8));
        si += 2;
        four_pixels_or_blit(&dl, &word, &di);

        word = (uint16_t)(si[0] | (si[1] << 8));
        si += 2;
        four_pixels_or_blit(&dl, &word, &di);
    }
}

/*
 * Renders a background dungeon tile from mpp{i}.grp, 
 * then blends a sprite/overlay tile on top of it in place.
 * bg_tile: background tile idx + 1 (1-based, packed BG tile data at GFX+0x8030)
 * si: nibble-compressed sprite tile data (32 bytes)
 * bp: 8-byte transparency masks for the sprite
 * di: destination buffer, 8x8 = 64 bytes
 */
static void decode_and_render_tile_with_blitting(uint8_t bg_tile, const uint8_t *si, const uint8_t *bp, uint8_t *di)
{
    uint8_t bg_idx = (uint8_t)(bg_tile - 1);
    // tile IDs 1..0x3f are mppN.grp tiles (seg1:0x8030..0x8BFF)
    // 0x40..0x66 are dchr.grp tiles (seg1:0x8C00..0x931F)
    const uint8_t *bg_src = &g_mem[0x10000 + DUNGEON_TILE_PACKED_BASE + (uint16_t)bg_idx * 48];

    render_48bytes_packed_tile(bg_src, di); // draw background tile first
    render_tile_to_temp_buffer(si, bp, di); // then blit another tile on top
}

/* al: tile idx; masked to 7 bits then looked up. */
static uint8_t get_from_layer2(uint8_t al)
{
    al &= 0x7F;
    return MEM8(ADDR_PROXIMITY_LAYER2 + al);
}

/*
 * AL: 6-bit packed background tile idx (0 = none)
 * AH: nibble-compressed tile idx (sprite/overlay graphic, if any)
 * DX: VRAM destination address
 *
 * Picks the active nibble->pixel LUT from tile_blit_mode (plus whether a
 * sprite overlay is present), composes into the shadow buffer (background
 * only, or background+blitted sprite), then copies the result to its real
 * VRAM destination.
 */
static void Decode_And_Render_MonsterEntity_Tile_With_Blit(uint8_t al, uint8_t ah, uint16_t dx)
{
    uint8_t bl = tile_blit_mode;
    if (al != 0 && al < 0x80) {
        bl |= 0x80;
    }

    uint16_t tile_off = (uint16_t)(ah * 32);

    const uint8_t *si = &g_mem[0x10000 + MONSTER_TILE_NIBBLE_BASE + tile_off];          /* nibble-compressed monsters data (32 bytes = 64 nibbles per tile)  */
    const uint8_t *bp = &g_mem[0x10000 + MONSTER_TILE_MASK_BASE + (uint16_t)(tile_off >> 2)]; /* monsters transparency masks (8 Bytes per tile) */

    uint8_t blit_flag  = bl;        /* ch in the original */
    uint8_t mode_index = bl & 0x7F;
    nibble_decode_lut = pal_decode_tbl[mode_index];

    if (blit_flag >= 0x80) { // render monster/entity over the background
        decode_and_render_tile_with_blitting(al, si, bp, vram_shadow);
    } else { // background is empty, just render
        render_nibble_compressed_tile(si, vram_shadow);
    }

    Copy_Tile_To_VRAM(dx, vram_shadow);
}

/*
 * Renders two cells of a "neighborhood" of tiles used for entities and border/corner handling. 
 * *si -> nibble-compressed tile idx byte (overlay),
 * *di -> 6-bit packed background tile idx byte, 
 * *bp -> per-cell dirty/cache sentinel (0xFF/0xFC mean "already fresh, skip"). 
 * dx -> VRAM destination address
 * All four in/out pointers are advanced by the function before returning
 */
static void Render_Tile_Neighborhood_Cells(uint8_t **si, uint8_t **di, uint8_t **bp, uint16_t *dx)
{
    render_tile_neighborhood_cell_internal(si, di, bp, dx);
    render_tile_neighborhood_cell_internal(si, di, bp, dx);
}

/*
 * Renders single cell of a "neighborhood" of tiles used for entities and border/corner handling. 
 * *si -> nibble-compressed tile idx byte (overlay),
 * *di -> 6-bit packed background tile idx byte, 
 * *bp -> per-cell dirty/cache sentinel (0xFF/0xFC mean "already fresh, skip"). 
 * dx -> VRAM destination address
 * All four in/out pointers are advanced by the function before returning
 */
static void render_tile_neighborhood_cell_internal(uint8_t **si, uint8_t **di, uint8_t **bp, uint16_t *dx)
{
    if (**bp != 0xFF && **bp != 0xFC) {
        uint8_t ah = **si;
        uint8_t al = **di;
        if (al >= 0x80) { // monster/entity tile
            al = get_from_layer2(al);
        }
        Decode_And_Render_MonsterEntity_Tile_With_Blit(al, ah, *dx);
    }
    (*si)++;
    (*di)++;
    (*bp)++;
    *dx += 8;
}

/*
 * Handles the optional monster/entity overlay at the viewport's top-left
 * corner cell (ADDR_VIEWPORT_ENTITIES[0]). No-ops if that cell is already
 * marked processed (0xFF) or mid-animation (0xFC) from earlier this pass.
 */
// Checked
static void Render_Top_Left_Corner_Entity(uint16_t si)
{
    if (MEM8(ADDR_VIEWPORT_ENTITIES + 0) == 0xFF) return;
    if (MEM8(ADDR_VIEWPORT_ENTITIES + 0) == 0xFC) return;

    MEM8(ADDR_VIEWPORT_ENTITIES + 0) = 0xFF;
    // contains a monster/entity (checked before calling this function)
    uint8_t cl = MEM8(si);     // ┌───┐<- overlay entity   
    si += (36+1); // y++, x++     | ┌─┼────                
    wrap_map_from_above(&si);  // └─┼─┘<- background entity
                               //   |                      
    uint8_t al = MEM8(si); // background tile, possible also a monster/entity
    if (al & 0x80) {
        al = get_from_layer2(al); // original background tile
    }

    Lookup_Monster_Tile_Attributes(cl, &si); /* side effect only; result unused here */
    // si now points to the overlay monster's frame-data
    si += 3; // bottom right tile of the overlay monster 2x2 sprite
    uint8_t ah = MEM8(si);

    Decode_And_Render_MonsterEntity_Tile_With_Blit(al, ah, viewport_top_left_vram_offset);
}

/*
 * Handles the optional monster/entity overlay at the viewport's top-right
 * corner cell (ADDR_VIEWPORT_ENTITIES[27]). No-ops if that cell is already
 * marked processed (0xFF) or mid-animation (0xFC) from earlier this pass.
 */
// Checked
static void Render_Top_Right_Corner_Entity(uint16_t si)
{
    if (MEM8(ADDR_VIEWPORT_ENTITIES + 27) == 0xFF) return;
    if (MEM8(ADDR_VIEWPORT_ENTITIES + 27) == 0xFC) return;

    MEM8(ADDR_VIEWPORT_ENTITIES + 27) = 0xFF;

    //   ┌───┐ <- overlay entity
    // ──┼─┐ |
    //   └─┼─┘ <- background entity
    //     |  

    uint8_t cl = MEM8(si);
    si += 36;
    wrap_map_from_above(&si);

    uint8_t al = MEM8(si); // background tile, possible also a monster/entity
    if (al >= 0x80) {
        al = get_from_layer2(al);
    }

    Lookup_Monster_Tile_Attributes(cl, &si); /* side effect only; result unused here */

    si += 2; // bottom left tile of the monster 2x2 sprite
    uint8_t ah = MEM8(si);

    Decode_And_Render_MonsterEntity_Tile_With_Blit(al, ah, viewport_top_right_vram_offset);
}

/*
 * Renders one of the 27 regular top-row cells (columns 0..26) - and,
 * because the original's single call to Render_Tile_Neighborhood_Cells
 * actually runs that routine's body twice (see note 5 at the top of the
 * file), it *also* unconditionally renders column col+1 right alongside
 * it. `col` is also the index into ADDR_VIEWPORT_ENTITIES (note: column 0
 * overlaps with the top-left corner cell on purpose - see note 7).
 * si points to a tile with monster/entity (high bit set)
 */
static void Render_Tile_With_Attribute_Cache(uint16_t si, int col)
{
    uint8_t old_value = MEM8(ADDR_VIEWPORT_ENTITIES + col);
    MEM8(ADDR_VIEWPORT_ENTITIES + col) = 0xFF;
    MEM8(ADDR_VIEWPORT_ENTITIES + col + 1) = 0xFF;

    tile_cache_dirty_flags[0] = old_value;
    tile_cache_dirty_flags[1] = 0; /* forces the col+1 pass below to always render */

    uint16_t dest = (uint16_t)(viewport_top_left_vram_offset + col * 8);

// ┌───┐      ┌───┐       ┌───┐ <- overlay entity
// ├───┼──  ┌─┼───┼──   ──┼───┤
// ├───┘    | └───┘       └───┤ <- background entity
// |        |                 |

    uint8_t cl = MEM8(si); // overlay entity
    si += 36;
    wrap_map_from_above(&si);

    tile_neighborhood_buffer[0] = MEM8(si + 0);
    tile_neighborhood_buffer[1] = MEM8(si + 1);
    si += 2;

    Lookup_Monster_Tile_Attributes(cl, &si); /* side effect only; result unused here */

    si += 2; // bottom left tile of the monster 2x2 sprite

    uint8_t *nb_si = &g_mem[si]; // 2 bottom tiles (overlay)
    uint8_t *nb_di = tile_neighborhood_buffer; // 2 tiles (background)
    uint8_t *nb_bp = tile_cache_dirty_flags;
    Render_Tile_Neighborhood_Cells(&nb_si, &nb_di, &nb_bp, &dest); /* column col, col+1 */
}

/*
 * Handles column 0 of a regular (non-top) row: an optional entity overlay
 * spanning this row's column 0 *and* the same column one row down (hence
 * "dual"). 
 * `si` is the map pointer just after the entity/overlay byte was
 * read (lodsb) by the caller; Passed by value.
 * `di` is this row's column-0 cache slot in ADDR_VIEWPORT_ENTITIES.
 */
static void Render_Tile_With_Dual_Cache(uint16_t si, uint8_t *di)
{
    uint8_t old0 = *di;
    *di = 0xFF;
    uint8_t old1 = di[28]; /* same column, row below */
    di[28] = 0xFF;
    tile_cache_dirty_flags[0] = old0;
    tile_cache_dirty_flags[1] = old1;

    uint8_t cl = MEM8(si-1);  /* entity/overlay byte, re-read from memory */
    uint8_t bl = MEM8(si+0);   /* background tile idx, this row    */
    si += 36;
    wrap_map_from_above(&si);
    uint8_t bh = MEM8(si+0);   /* background tile idx, row below   */

    Lookup_Monster_Tile_Attributes(cl, &si); /* side effect only; result unused here */

    si++; // top right quadrant

    uint16_t dx = (uint16_t)(0 * 8 + viewport_row_vram_offset); /* column 0 */

    if (tile_cache_dirty_flags[0] != 0xFF && tile_cache_dirty_flags[0] != 0xFC) {
        uint8_t ah = MEM8(si+0); // overlay tile from top right quadrant
        uint8_t al = bl;
        if (al >= 0x80) al = get_from_layer2(al);
        Decode_And_Render_MonsterEntity_Tile_With_Blit(al, ah, dx);
    }

    dx = (uint16_t)(dx + 320*8); /* one tile-row down (320*8) */

    if (viewport_rows_remaining != 1 &&
        tile_cache_dirty_flags[1] != 0xFF && tile_cache_dirty_flags[1] != 0xFC) {
        si += 2;
        uint8_t ah = MEM8(si+0); // overlay tile from bottom right quadrant
        si++;
        uint8_t al = bh;
        if (al >= 0x80) al = get_from_layer2(al);
        Decode_And_Render_MonsterEntity_Tile_With_Blit(al, ah, dx);
    }
}

/*
 * Occasionally spawns an explosions when the boss is dead 
 * (max 32 entries, 4 bytes each, terminated by 0xFF).
 */
// Checked
static void Spawn_Boss_Explosion_Ring()
{
    if (hero_tile_row_idx >= 16) {
        return;
    }

    if ((get_random() & 0x0F) < 14) {
        return;
    }
    // continue with 1/8 probability
    uint8_t *di = &g_mem[(ADDR_BOSS_EXPLOSIONS_LIST & 0xFFFF)];
    int count = 0;
    while (*di != 0xFF) { // find the end of the list
        di += 4;
        count++;
    }

    if (count >= 32) { // max 32 explosions allowed
        return;
    }

    uint8_t al;
    do {
        al = get_random() & 3;
    } while (al == 3);
    // al = random in [0, 1, 2]
    al = (uint8_t)(al - 1);
    al = (uint8_t)(al + hero_tile_col_idx);
    if (al == 0xFF) {
        al = 4;
    }
    if (al >= 27) {
        al = 26;
    }
    *di++ = al; // [0] = x

    do {
        al = get_random() & 3;
    } while (al == 3);
    al = (uint8_t)(al - 1);
    al = (uint8_t)(al + hero_tile_row_idx);
    if (al == 0xFF) {
        al = 0;
    }
    *di++ = al; // [1] = y

    *di++ = 3; // [2] = frame
    *di++ = (uint8_t)(get_random() & 3); // [3] = variant
    *di++ = 0xFF; // terminator in next entity [0]
}

/*
 * Handles an entity/overlay tile at an arbitrary column: renders a 2x2
 * neighbourhood of cells - this row's [col, col+1], and (if there is a
 * row below) that row's [col, col+1] too - around it, sets
 * hero_tile_col_idx/hero_tile_row_idx from the column/row currently
 * being processed (used by Spawn_Boss_Explosion_Ring), and - in the boss cavern,
 * while the sprite-flash effect is active - may spawn a new wandering
 * monster nearby.
 * `si`/`di` are positioned exactly as left by the caller's comparison
 * loop (i.e. just past the bytes that were compared); `col` is the
 * current column (0..27).
 */
static void Render_Tile_With_Border_Check(uint16_t si, uint8_t *di, int col)
{
    uint8_t old_a = di[-1];
    uint8_t old_b = di[0];
    di[-1] = 0xFE;
    di[0]  = 0xFF;
    tile_cache_dirty_flags[0] = old_a;
    tile_cache_dirty_flags[1] = old_b;

    uint8_t old_c = di[27];
    uint8_t old_d = di[28];
    di[27] = 0xFF;
    di[28] = 0xFF;
    tile_cache_dirty_flags[2] = old_c;
    tile_cache_dirty_flags[3] = old_d;

    uint8_t cl = MEM8(si-1);
    tile_neighborhood_buffer[1] = MEM8(si+0);
    si += 36;
    wrap_map_from_above(&si);
    tile_neighborhood_buffer[2] = MEM8(si-1);
    tile_neighborhood_buffer[3] = MEM8(si+0);

    hero_tile_col_idx = (uint8_t)col;
    hero_tile_row_idx = (uint8_t)(18 - viewport_rows_remaining);

    uint16_t dx = (uint16_t)(col * 8 + viewport_row_vram_offset);

    tile_neighborhood_buffer[0] = Lookup_Monster_Tile_Attributes(cl, &si);

    uint8_t *nb_si = &g_mem[si];
    uint8_t *nb_di = tile_neighborhood_buffer;
    uint8_t *nb_bp = tile_cache_dirty_flags;
    /* Each of the original's two "calls" below doubles via the call-$+3
     * trick (see note 5 at the top of the file) into a col/col+1 pair. */
    Render_Tile_Neighborhood_Cells(&nb_si, &nb_di, &nb_bp, &dx); /* this row, col and col+1   */

    if (viewport_rows_remaining == 1) {
        return;
    }

    dx += (320*8-16);
    Render_Tile_Neighborhood_Cells(&nb_si, &nb_di, &nb_bp, &dx); /* row below, col and col+1  */

    if (MEM8(ADDR_IS_BOSS_CAVERN) && MEM8(ADDR_SPRITE_FLASH_FLAG)) { // boss is just defeated
        Spawn_Boss_Explosion_Ring();
    }
}

/*
 * Handles column 27 (the last column) of a regular row when its byte
 * tested as an entity/overlay tile - the counterpart to
 * Render_Tile_With_Dual_Cache for the *right* edge, covering this row's
 * column 27 and the same column one row down.
 */
static void Render_Tile_And_Update_Cache(uint16_t si, uint8_t *di, int col)
{
    uint8_t old_a = di[-1];
    di[-1] = 0xFE;
    tile_cache_dirty_flags[0] = old_a;

    uint8_t old_b = di[27]; /* same column, row below */
    di[27] = 0xFF;
    tile_cache_dirty_flags[1] = old_b;

    uint8_t cl = MEM8(si-1);
    si += 36;
    wrap_map_from_above(&si);

    uint8_t dl = MEM8(si-1);                              /* background idx, row below */
    uint8_t bl = Lookup_Monster_Tile_Attributes(cl, &si);   /* background idx, this row  */
    uint8_t bh = dl;

    uint16_t dx = (uint16_t)(col * 8 + viewport_row_vram_offset);

    if (tile_cache_dirty_flags[0] != 0xFF && tile_cache_dirty_flags[0] != 0xFC) {
        uint8_t ah = MEM8(si);
        uint8_t al = bl;
        if (al >= 0x80) al = get_from_layer2(al);
        Decode_And_Render_MonsterEntity_Tile_With_Blit(al, ah, dx);
    }

    dx += (320 * 8);

    if (viewport_rows_remaining != 1 &&
        tile_cache_dirty_flags[1] != 0xFF && tile_cache_dirty_flags[1] != 0xFC) {
        si += 2;
        uint8_t ah = MEM8(si);
        si++; // unused
        uint8_t al = bh;
        if (al >= 0x80) al = get_from_layer2(al);
        Decode_And_Render_MonsterEntity_Tile_With_Blit(al, ah, dx);
    }
}

/* 
 * Per-cavern-level animated tile types (water, gold or magma, heat, thorns). 
 * Each is only invoked for cavern_level 5..8, dispatched by cavern_level-5 through animate_mpp58_tiles[].
 * `si` points just past the tile's overlay byte in the proximity map, 
 * `di` just past its viewport buffer 28x19 cache byte (both si[-1]/di[-1] are the bytes of interest), 
 * matching how Process_Dirty_Tile_With_Animation calls these.
 */

// mpp5.grp: 0x1B↔0x1C - animated water tile
static void Animate_Water_Cavern5(uint16_t si, uint8_t *di)
{
    uint8_t al = (uint8_t)(MEM8(si-1) - 0x1B);
    if (al >= 2) {
        return;
    }
    di[-1] = 0xFE; // is animated
    if (!(render_counter & 1)) {
        return;
    }
    al = ((al + 1) & 1) + 0x1B;
    MEM8(si-1) = al;
}

// mpp6.grp: 0x1D..0x20 (shiny gold) and 0x21↔0x22 (magma) animated tiles
static void Animate_Gold_Magma_Cavern6(uint16_t si, uint8_t *di)
{
    uint8_t al = (uint8_t)(MEM8(si-1) - 0x1D);
    if (al >= 6) {
        return;
    }
    di[-1] = 0xFE; // is animated

    if (al >= 4) {
        al = (uint8_t)(((al + 1) & 1) + 0x21);
        MEM8(si-1) = al;
        return;
    }

    if (al == 0) { // 25% chance to skip the animation
        if ((get_random() & 3) != 0) {
            return;
        }
        al = 0;
    }

    al = (uint8_t)(((al + 1) & 3) + 0x1D);
    MEM8(si-1) = al;
}

// mpp7.grp: 0x2C↔0x2D (jet), 0x0C..0x10, 0x33..0x3D (hot) animated tiles
static void Animate_Hot_Cavern7(uint16_t si, uint8_t *di)
{
    uint8_t al = (uint8_t)(MEM8(si-1) - 0x2C);
    if (al < 2) {
        di[-1] = 0xFE;
        if (!(render_counter & 1)) {
            return;
        }
        al = (uint8_t)(((al + 1) & 1) + 0x2C);
        MEM8(si-1) = al;
        return;
    }

    al = MEM8(si-1);
    if (al >= 0x3E) {
        return;
    }

    uint8_t bl;
    switch (al) {
        case 0x0E: bl = 0x33; break;
        case 0x0D: bl = 0x36; break;
        case 0x0F: bl = 0x39; break;
        case 0x0C: bl = 0x3C; break;
        case 0x10: bl = 0x3D; break;
        default: {
            if (al < 0x33) {
                return;
            }
            uint8_t al2 = (uint8_t)(al - 0x33);
            switch (al2) {
                case 2:    bl = 0x0E; break; // 35→0E
                case 5:    bl = 0x0D; break; // 38→0D
                case 8:    bl = 0x0F; break; // 3B→0F
                case 9:    bl = 0x0C; break; // 3C→0C
                case 0x0A: bl = 0x10; break; // 3D→10
                default:   bl = (uint8_t)(al2 + 1 + 0x33); break; // 33→34, 34→35, 36→37, 37→38, 39→3A, 3A→3B
            }
            break;
        }
    }

    di[-1] = 0xFE;
    if (!(render_counter & 1)) {
        return;
    }
    MEM8(si-1) = bl;
}

// mpp8.grp: 0x25..0x28 (thorns) animated tiles
static void Animate_Thorn_Cavern8(uint16_t si, uint8_t *di)
{
    uint8_t al = (uint8_t)(MEM8(si-1) - 0x25);
    if (al >= 4) {
        return;
    }
    di[-1] = 0xFE;
    if (!(render_counter & 1)) {
        return;
    }
    al = (uint8_t)(((al + 1) & 3) + 0x25);
    MEM8(si-1) = al;
}

typedef void (*anim_func_t)(uint16_t si, uint8_t *di);
static const anim_func_t animate_mpp58_tiles[4] = {
    Animate_Water_Cavern5, // cavern level 5
    Animate_Gold_Magma_Cavern6, // cavern level 6
    Animate_Hot_Cavern7, // cavern level 7
    Animate_Thorn_Cavern8, // cavern level 8
};

/*
 * Called for every cell whose underlying map byte differs from its
 * cached value in ADDR_VIEWPORT_ENTITIES (or, for entity/overlay cells,
 * unconditionally). Routes entity cells to Render_Tile_With_Border_Check;
 * otherwise updates the tile's small redraw/animation state machine and,
 * for cavern levels 5..8, dispatches to the matching Animate_* routine.
 * `si`/`di` are positioned just past the compared bytes, 
 * `col` is the current column (0..27).
 * si: proximity map pointer
 * di: viewport buffer 29x18 pointer
 */
static void Process_Dirty_Tile_With_Animation(uint16_t si, uint8_t *di, int col)
{
    uint8_t al = MEM8(si-1);
    if (al >= 0x80) { // monster/entity tiles
        Render_Tile_With_Border_Check(si, di, col);
        return;
    }
    // FC -> FF -> FE -> valueFromMap
    if (di[-1] == 0xFC) {
        di[-1] = 0xFF;
    } else {
        uint8_t old = di[-1];
        di[-1] = 0xFE;
        if (old != 0xFF) {
            di[-1] = al;
            uint16_t dx = (uint16_t)(col * 8 + viewport_row_vram_offset);
            dx = (uint16_t)(dx >> 1);
            Dungeon_Static_Tile_Cached_Drawer(al, dx);
        }
        /* else: old di[-1] value was 0xFF -> skip the redraw */
    }

    if (MEM8(ADDR_CAVERN_LEVEL) < 5) {
        return;
    }
    int idx = MEM8(ADDR_CAVERN_LEVEL) - 5;
    if (idx >= 4) {
        return;
    }
    animate_mpp58_tiles[idx](si, di); // for cavern levels 5..8
}


/*
 * Iterates the list of active boss explosions (max 32, 4 bytes each,
 * terminated by a 0xFF - see Spawn_Boss_Explosion_Ring) and renders
 * each one as a 16x16 sprite into the viewport. Explosions are removed
 * from the list (by compacting the survivors over them) once their
 * lifetime counter runs out.
 *
 * Entity layout (4 bytes):
 *   [0] tile column (0..27)
 *   [1] tile row    (0..18)
 *   [2] remaining lifetime: counts down from 3 to 0, then the entity is
 *       dropped on the following pass; also doubles as an animation
 *       frame index (masked to 2 bits) selecting which of the 4
 *       boss_explosion_ring_phases bitmaps to use
 *   [3] per-entity variant fixed at spawn time (0..3), selects
 *       boss_explosion_mask_variants
 */
// Checked
void Boss_Explosions_Renderer()
{
    uint8_t *write = &g_mem[(ADDR_BOSS_EXPLOSIONS_LIST & 0xFFFF)]; /* di: compaction write cursor */
    uint8_t *read  = write; /* si: read cursor  */
 
    for (;;) {
        uint8_t col = read[0];
        if (col == 0xFF) { // col == 0xFF is terminator
            write[0] = 0xFF;
            return;
        }
 
        uint8_t row = read[1];
 
        /* Mark the 2x2 ADDR_VIEWPORT_ENTITIES block this sprite covers as
         * 0xFE ("mid-animation, handled specially") so the normal tile
         * redraw path leaves it alone. As in the original, this doesn't
         * bounds-check the row+1 write against the last viewport row, 
         * thats why we have 19 rows in the buffer for 28x18 viewport. */
        MEM8(ADDR_VIEWPORT_ENTITIES + row * 28 + col) = 0xFE;
        MEM8(ADDR_VIEWPORT_ENTITIES + row * 28 + col + 1) = 0xFE;
        MEM8(ADDR_VIEWPORT_ENTITIES + (row + 1) * 28 + col) = 0xFE;
        MEM8(ADDR_VIEWPORT_ENTITIES + (row + 1) * 28 + col + 1) = 0xFE;
 
        uint16_t dest = (uint16_t)(row * 320 * 8 + col * 8 + viewport_top_left_vram_offset);
 
        uint8_t variant = read[3];
        transparency_mask_bitplane_f = boss_explosion_mask_variants[variant];
 
        uint8_t frame = read[2] & 3;
        const uint16_t *mask_src = boss_explosion_ring_phases[frame]; // si
 
        uint8_t *di = &vram[dest];
        uint16_t bp, dx, *p;
        for (int r = 0; r < 16; r++) {
            uint16_t word0 = *mask_src++; // the masks (unlike the original) have pre-swapped low and high bytes (to avoid xchg ah, al)
            for (int w = 0; w < 4; w++) {
                CalculateSpriteBitmask(&word0, &bp, &dx);
                p = (uint16_t*)di;
                *p = (*p & ~bp) | dx; // render 2 pixels
                di += 2;
            }
 
            uint16_t word1 = *mask_src++; // the masks (unlike the original) have pre-swapped low and high bytes (to avoid xchg ah, al)
            for (int w = 0; w < 4; w++) {
                CalculateSpriteBitmask(&word1, &bp, &dx);
                p = (uint16_t*)di;
                *p = (*p & ~bp) | dx; // render 2 pixels
                di += 2;
            }
 
            di += (320 - 16);
        }
 
        read[2]--;
        if (read[2] != 0xFF) {
            memmove(write, read, 4);
            write += 4;
        }
        read += 4;
    }
}
