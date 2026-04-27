// collision.c - 8-directional collision detection
// Port of Fight.asm collision detection routines

#include "zeliard.h"

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// ============================================================================
// Constants
// ============================================================================

#define PROXIMITY_MAP_WIDTH  36   // Full proximity map width (columns)
#define PROXIMITY_MAP_HEIGHT 64   // Full proximity map height (rows)

// ============================================================================
// Global Variables (from 0xFF00 region)
// ============================================================================

// Danger type for special collision handling (from Fight.asm)
static uint8_t danger_type = 0;  // byte_FF10 in original

// ============================================================================
// Tile Passability Table
// ============================================================================

/*
 * Passable tiles (0x00-0x48):
 * These tiles allow movement through them.
 * 
 * From Fight.asm 8000h table (24 bytes scanned with REPNE SCASB):
 * 00 01 02 08 09 0A 0B 0C 0F 10 11 12 13 14 15 16 17 18 19 00 00 00 00 00
 * 
 * Meaning:
 * 0x00 - Empty air
 * 0x01 - Rope/ladder
 * 0x02 - Water?
 * 0x08-0x0C - Various passable terrain
 * 0x0F-0x19 - Additional passable tiles
 * 
 * Non-passable:
 * 0x03-0x07 - Walls/solid terrain
 * 0x0D-0x0E - Solid blocks
 * 0x1A-0x48 - Various solid tiles
 * 0x49-0x7F - Unknown/special tiles
 * 0x80-0xFF - Items, monsters, entities (always non-passable)
 */

static const uint8_t passable_tiles[] = {
    0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x0B, 0x0C,
    0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
    0x17, 0x18, 0x19
};

#define PASSABLE_TILE_COUNT (sizeof(passable_tiles) / sizeof(passable_tiles[0]))

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a tile is passable
 * Returns 1 (ZF=1 in assembly) if passable, 0 (ZF=0) if not passable
 * 
 * Port of Fight.asm if_passable_set_ZF (0x94E1)
 * 
 * Logic:
 * - If tile >= 0x80: non-passable (item/monster)
 * - If tile >= 0x73: non-passable
 * - If tile in passable_tiles list: passable
 * - Otherwise: non-passable
 */
int if_passable_set_ZF(uint8_t tile) {
    // Tiles >= 0x80 are items/monsters - always non-passable
    if (tile >= 0x80) {
        return 0;  // NZ (non-passable)
    }
    
    // Tiles 0x73-0x7F are non-passable
    if (tile >= 0x73) {
        return 0;  // NZ (non-passable)
    }
    
    // Check if tile is in the passable list
    for (uint8_t i = 0; i < PASSABLE_TILE_COUNT; i++) {
        if (passable_tiles[i] == tile) {
            return 1;  // Z (passable)
        }
    }
    
    return 0;  // NZ (non-passable)
}

/**
 * Wrap proximity map pointer from above
 * If pointer >= 0xE900, subtract 0x900
 *
 * Port of Fight.asm wrap_map_from_above
 */
uint16_t wrap_map_from_above(uint16_t offset) {
// proximity_map   db 900h dup(?)
// viewport_buffer_28x19 db ? // 0x214 bytes

    if (offset >= 0x900) {
        return offset - 0x900;
    }
    return offset;
}

/**
 * Wrap proximity map pointer from below
 * If offset < 0xE000, add 0x900
 *
 * Port of Fight.asm wrap_map_from_below
 */
uint16_t wrap_map_from_below(uint16_t offset) {
    if (offset < 0) {
        return offset + 0x900;
    }
    return offset;
}

/**
 * Get tile from proximity map
 */
static inline uint8_t get_proximity_tile(uint16_t offset) {
    return g_memory[MEM_PROXIMITY_MAP + (offset & 0x08FF)];
}

/**
 * Check collision to the East including danger type 5
 * Helper for check_collision_E2
 * 
 * Port of Fight.asm check_collision_E_including_danger5 (0x92EB)
 */
static int check_collision_E_including_danger5(uint16_t offset) {
    uint8_t tile = get_proximity_tile(offset);
    
    // Check if tile is passable
    if (!if_passable_set_ZF(tile)) {
        return 1;  // Collision (CF set)
    }
    
    // Check for danger type 5 (special hazard)
    if (danger_type == 5) {
        // Additional category check for danger 5
        // For now, treat as passable if we got here
        return 0;
    }
    
    return 0;  // No collision (CF clear)
}

/**
 * Check collision to the West including danger type 5
 * Helper for check_collision_W2
 * 
 * Port of Fight.asm check_collision_W_including_danger5 (0x9341)
 */
static int check_collision_W_including_danger5(uint16_t offset) {
    uint8_t tile = get_proximity_tile(offset);
    
    // Check if tile is passable
    if (!if_passable_set_ZF(tile)) {
        return 1;  // Collision (CF set)
    }
    
    // Check for danger type 5 (special hazard)
    if (danger_type == 5) {
        // Additional category check for danger 5
        // For now, treat as passable if we got here
        return 0;
    }
    
    return 0;  // No collision (CF clear)
}

// ============================================================================
// 8-Directional Collision Detection Functions
// ============================================================================

/*
 * All collision functions follow the same pattern:
 * - Input: Entity position (typically in a register like SI pointing to monster struct)
 * - Check tiles in the specified direction
 * - Return: 1 (CF set) if collision detected, 0 (CF clear) if passable
 * 
 * The "2" suffix indicates checking 2 tiles ahead (for entity width/height)
 */

/**
 * Check collision to the East (right)
 * Checks tiles at (+2, -1), (+2, 0), (+2, +1)
 * 
 * Port of Fight.asm check_collision_E2 (0x92B4)
 */
int check_collision_E2(uint8_t x, uint8_t y) {
    // Convert to proximity map offset
    uint16_t base_offset = coords_to_proximity_offset(x, y);
    
    // Check (+2, 0) - same row, 2 tiles east
    uint16_t offset = base_offset + 2;
    if (check_collision_E_including_danger5(offset)) {
        return 1;  // Collision
    }
    
    // Check (+2, +1) - one row below, 2 tiles east
    offset = base_offset + 2 + PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap
    }
    if (check_collision_E_including_danger5(offset)) {
        return 1;  // Collision
    }
    
    // Check (+2, -1) - one row above, 2 tiles east
    // Combine all three tiles and check if any has high bit set
    uint8_t tile_e_0 = get_proximity_tile(base_offset + 2);
    uint8_t tile_e_p1 = get_proximity_tile(base_offset + 2 + PROXIMITY_MAP_WIDTH);
    uint8_t tile_e_m1_offset = base_offset + 2 - PROXIMITY_MAP_WIDTH;
    if (base_offset < PROXIMITY_MAP_WIDTH) {
        tile_e_m1_offset += 0x900;  // Wrap from below
    }
    uint8_t tile_e_m1 = get_proximity_tile(tile_e_m1_offset);
    
    // CF set if any tile has high bit set (negative value)
    if ((tile_e_0 | tile_e_p1 | tile_e_m1) & 0x80) {
        return 1;  // Collision
    }
    
    return 0;  // No collision
}

/**
 * Check collision to the West (left)
 * Checks tiles at (-1, 0), (-1, +1), (-2, -1), (-2, 0), (-2, +1)
 * 
 * Port of Fight.asm check_collision_W2 (0x930A)
 */
int check_collision_W2(uint8_t x, uint8_t y) {
    // Convert to proximity map offset
    uint16_t base_offset = coords_to_proximity_offset(x, y);
    
    // Check (-1, 0) - same row, 1 tile west
    uint16_t offset = base_offset - 1;
    if (check_collision_W_including_danger5(offset)) {
        return 1;  // Collision
    }
    
    // Check (-1, +1) - one row below, 1 tile west
    offset = base_offset - 1 + PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap
    }
    if (check_collision_W_including_danger5(offset)) {
        return 1;  // Collision
    }
    
    // Check (-2, +1), (-2, 0), (-2, -1) - combine and check high bit
    uint8_t tile_w2_p1 = get_proximity_tile(base_offset - 2 + PROXIMITY_MAP_WIDTH);
    uint8_t tile_w2_0 = get_proximity_tile(base_offset - 2);
    uint8_t tile_w2_m1_offset = base_offset - 2 - PROXIMITY_MAP_WIDTH;
    if (base_offset < PROXIMITY_MAP_WIDTH) {
        tile_w2_m1_offset += 0x900;  // Wrap from below
    }
    uint8_t tile_w2_m1 = get_proximity_tile(tile_w2_m1_offset);
    
    // CF set if any tile has high bit set
    if ((tile_w2_p1 | tile_w2_0 | tile_w2_m1) & 0x80) {
        return 1;  // Collision
    }
    
    return 0;  // No collision
}

/**
 * Check collision to the North (up)
 * Checks tiles at (0, -1), (+1, -1), (-1, -2), (0, -2), (+1, -2)
 * 
 * Port of Fight.asm check_collision_N2 (0x9362)
 */
int check_collision_N2(uint8_t x, uint8_t y) {
    // Convert to proximity map offset
    uint16_t base_offset = coords_to_proximity_offset(x, y);
    
    // Check (0, -1) - one row above, same column
    uint16_t offset = base_offset - PROXIMITY_MAP_WIDTH;
    if (offset < 0) {
        offset += 0x900;  // Wrap from below
    }
    uint8_t tile_n = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_n)) {
        return 1;  // Collision
    }
    
    // Check (+1, -1) - one row above, one column east
    offset = base_offset - PROXIMITY_MAP_WIDTH + 1;
    if (offset < PROXIMITY_MAP_WIDTH) {
        offset += 0x900;  // Wrap from below
    }
    uint8_t tile_ne = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_ne)) {
        return 1;  // Collision
    }
    
    // Check (-1, -2), (0, -2), (+1, -2) - combine and check high bit
    uint16_t offset2 = base_offset - 2 * PROXIMITY_MAP_WIDTH;
    if (offset2 < 2 * PROXIMITY_MAP_WIDTH) {
        offset2 += 0x900;  // Wrap from below
    }
    uint8_t tile_nw2 = get_proximity_tile(offset2 - 1);
    uint8_t tile_n2 = get_proximity_tile(offset2);
    uint8_t tile_ne2 = get_proximity_tile(offset2 + 1);
    
    // CF set if any tile has high bit set
    if ((tile_nw2 | tile_n2 | tile_ne2) & 0x80) {
        return 1;  // Collision
    }
    
    return 0;  // No collision
}

/**
 * Check collision to the South (down)
 * Checks tiles at (0, +2), (+1, +2), (-1, +2)
 * 
 * Port of Fight.asm check_collision_S2 (0x939A)
 */
int check_collision_S2(uint8_t x, uint8_t y) {
    // Convert to proximity map offset
    uint16_t base_offset = coords_to_proximity_offset(x, y);
    
    // Check (0, +2) - two rows below, same column
    uint16_t offset = base_offset + 2 * PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_s2 = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_s2)) {
        return 1;  // Collision
    }
    
    // Check (+1, +2) - two rows below, one column east
    offset = base_offset + 2 * PROXIMITY_MAP_WIDTH + 1;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_se2 = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_se2)) {
        return 1;  // Collision
    }
    
    // Check (-1, +2) - two rows below, one column west
    // Combine all three and check high bit
    offset = base_offset + 2 * PROXIMITY_MAP_WIDTH - 1;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_sw2 = get_proximity_tile(offset);
    
    // CF set if any tile has high bit set
    if ((tile_s2 | tile_se2 | tile_sw2) & 0x80) {
        return 1;  // Collision
    }
    
    return 0;  // No collision
}

/**
 * Check collision to the North-East (diagonal up-right)
 * Checks tiles at (+2, 0), (+2, -1), (+1, -1), (+2, -2), (+1, -2), (0, -2)
 * 
 * Port of Fight.asm check_collision_NE2 (0x93C5)
 */
int check_collision_NE2(uint8_t x, uint8_t y) {
    // Convert to proximity map offset
    uint16_t base_offset = coords_to_proximity_offset(x, y);
    
    // Check (+2, 0) - same row, 2 tiles east
    uint16_t offset = base_offset + 2;
    uint8_t tile_e2 = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_e2)) {
        return 1;  // Collision
    }
    
    // Check (+2, -1) - one row above, 2 tiles east
    offset = base_offset + 2 - PROXIMITY_MAP_WIDTH;
    if (offset < PROXIMITY_MAP_WIDTH) {
        offset += 0x900;  // Wrap from below
    }
    uint8_t tile_e2_n = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_e2_n)) {
        return 1;  // Collision
    }
    
    // Check (+1, -1) - one row above, 1 tile east
    offset = base_offset + 1 - PROXIMITY_MAP_WIDTH;
    if (offset < PROXIMITY_MAP_WIDTH) {
        offset += 0x900;  // Wrap from below
    }
    uint8_t tile_e_n = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_e_n)) {
        return 1;  // Collision
    }
    
    // Check (+2, -2), (+1, -2), (0, -2) - combine and check high bit
    uint16_t offset2 = base_offset - 2 * PROXIMITY_MAP_WIDTH;
    if (offset2 < 2 * PROXIMITY_MAP_WIDTH) {
        offset2 += 0x900;  // Wrap from below
    }
    uint8_t tile_e2_n2 = get_proximity_tile(offset2 + 2);
    uint8_t tile_e_n2 = get_proximity_tile(offset2 + 1);
    uint8_t tile_n2 = get_proximity_tile(offset2);
    
    uint8_t combined = tile_e2 | tile_e2_n | tile_e_n | tile_e2_n2 | tile_e_n2 | tile_n2;
    if (combined & 0x80) {
        return 1;  // Collision
    }
    
    return 0;  // No collision
}

/**
 * Check collision to the South-East (diagonal down-right)
 * Checks tiles at (+2, 0), (+2, +1), (+2, +2), (+1, +2), (0, +2)
 * 
 * Port of Fight.asm check_collision_SE2 (0x940C)
 */
int check_collision_SE2(uint8_t x, uint8_t y) {
    // Convert to proximity map offset
    uint16_t base_offset = coords_to_proximity_offset(x, y);
    
    // Check (+2, 0) - same row, 2 tiles east
    uint16_t offset = base_offset + 2;
    uint8_t tile_e2 = get_proximity_tile(offset);
    
    // Check (+2, +1) - one row below, 2 tiles east
    offset = base_offset + 2 + PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_e2_s = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_e2_s)) {
        return 1;  // Collision
    }
    
    // Check (+2, +2) - two rows below, 2 tiles east
    offset = base_offset + 2 + 2 * PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_e2_s2 = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_e2_s2)) {
        return 1;  // Collision
    }
    
    // Check (+1, +2) - two rows below, 1 tile east
    offset = base_offset + 1 + 2 * PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_e_s2 = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_e_s2)) {
        return 1;  // Collision
    }
    
    // Check (0, +2) - two rows below, same column
    // Combine all and check high bit
    offset = base_offset + 2 * PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_s2 = get_proximity_tile(offset);
    
    uint8_t combined = tile_e2 | tile_e2_s | tile_e2_s2 | tile_e_s2 | tile_s2;
    if (combined & 0x80) {
        return 1;  // Collision
    }
    
    return 0;  // No collision
}

/**
 * Check collision to the North-West (diagonal up-left)
 * Checks tiles at (-1, 0), (-2, 0), (-2, -1), (-1, -1), (0, -1), (-2, -2), (-1, -2)
 * 
 * Port of Fight.asm check_collision_NW2 (0x9452)
 */
int check_collision_NW2(uint8_t x, uint8_t y) {
    // Convert to proximity map offset
    uint16_t base_offset = coords_to_proximity_offset(x, y);
    
    // Check (-1, 0) - same row, 1 tile west
    uint16_t offset = base_offset - 1;
    uint8_t tile_w = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_w)) {
        return 1;  // Collision
    }
    
    // Check (-2, 0) - same row, 2 tiles west
    offset = base_offset - 2;
    uint8_t tile_w2 = get_proximity_tile(offset);
    
    // Check (-2, -1) - one row above, 2 tiles west
    offset = base_offset - 2 - PROXIMITY_MAP_WIDTH;
    if (offset < PROXIMITY_MAP_WIDTH) {
        offset += 0x900;  // Wrap from below
    }
    uint8_t tile_w2_n = get_proximity_tile(offset);
    
    // Check (-1, -1) - one row above, 1 tile west
    offset = base_offset - 1 - PROXIMITY_MAP_WIDTH;
    if (offset < PROXIMITY_MAP_WIDTH) {
        offset += 0x900;  // Wrap from below
    }
    uint8_t tile_w_n = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_w_n)) {
        return 1;  // Collision
    }
    
    // Check (0, -1) - one row above, same column
    offset = base_offset - PROXIMITY_MAP_WIDTH;
    if (offset < PROXIMITY_MAP_WIDTH) {
        offset += 0x900;  // Wrap from below
    }
    uint8_t tile_n = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_n)) {
        return 1;  // Collision
    }
    
    // Check (-2, -2), (-1, -2), (0, -2) - combine and check high bit
    uint16_t offset2 = base_offset - 2 * PROXIMITY_MAP_WIDTH;
    if (offset2 < 2 * PROXIMITY_MAP_WIDTH) {
        offset2 += 0x900;  // Wrap from below
    }
    uint8_t tile_w2_n2 = get_proximity_tile(offset2 - 2);
    uint8_t tile_w_n2 = get_proximity_tile(offset2 - 1);
    uint8_t tile_n2 = get_proximity_tile(offset2);
    
    uint8_t combined = tile_w | tile_w2 | tile_w2_n | tile_w_n | tile_n | tile_w2_n2 | tile_w_n2 | tile_n2;
    if (combined & 0x80) {
        return 1;  // Collision
    }
    
    return 0;  // No collision
}

/**
 * Check collision to the South-West (diagonal down-left)
 * Checks tiles at (-2, 0), (-2, +1), (-1, +1), (-1, +2), (0, +2), (-2, +2)
 * 
 * Port of Fight.asm check_collision_SW2 (0x949A)
 */
int check_collision_SW2(uint8_t x, uint8_t y) {
    // Convert to proximity map offset
    uint16_t base_offset = coords_to_proximity_offset(x, y);
    
    // Check (-2, 0) - same row, 2 tiles west
    uint16_t offset = base_offset - 2;
    uint8_t tile_w2 = get_proximity_tile(offset);
    
    // Check (-2, +1) - one row below, 2 tiles west
    offset = base_offset - 2 + PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_w2_s = get_proximity_tile(offset);
    
    // Check (-1, +1) - one row below, 1 tile west
    offset = base_offset - 1 + PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_w_s = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_w_s)) {
        return 1;  // Collision
    }
    
    // Check (-1, +2) - two rows below, 1 tile west
    offset = base_offset - 1 + 2 * PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_w_s2 = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_w_s2)) {
        return 1;  // Collision
    }
    
    // Check (0, +2) - two rows below, same column
    offset = base_offset + 2 * PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_s2 = get_proximity_tile(offset);
    if (!if_passable_set_ZF(tile_s2)) {
        return 1;  // Collision
    }
    
    // Check (-2, +2) - two rows below, 2 tiles west
    // Combine all and check high bit
    offset = base_offset - 2 + 2 * PROXIMITY_MAP_WIDTH;
    if (offset >= 0x0900) {
        offset -= 0x900;  // Wrap from above
    }
    uint8_t tile_w2_s2 = get_proximity_tile(offset);
    
    uint8_t combined = tile_w2 | tile_w2_s | tile_w_s | tile_w_s2 | tile_s2 | tile_w2_s2;
    if (combined & 0x80) {
        return 1;  // Collision
    }
    
    return 0;  // No collision
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Set the current danger type (for special hazard collision handling)
 */
void set_danger_type(uint8_t type) {
    danger_type = type;
}

/**
 * Get the current danger type
 */
uint8_t get_danger_type(void) {
    return danger_type;
}

// ============================================================================
// MonsterEntry Wrapper Functions (for monster_ai.c compatibility)
// ============================================================================

/*
 * These wrappers extract position from MonsterEntry and call the coordinate-based functions.
 * This maintains compatibility with existing monster_ai.c code.
 */

/**
 * Check collision to the East (wrapper for MonsterEntry)
 */
int check_collision_E2_monster(MonsterEntry* m) {
    return check_collision_E2((uint8_t)m->currX, (uint8_t)m->currY);
}

/**
 * Check collision to the West (wrapper for MonsterEntry)
 */
int check_collision_W2_monster(MonsterEntry* m) {
    return check_collision_W2((uint8_t)m->currX, (uint8_t)m->currY);
}

/**
 * Check collision to the North (wrapper for MonsterEntry)
 */
int check_collision_N2_monster(MonsterEntry* m) {
    return check_collision_N2((uint8_t)m->currX, (uint8_t)m->currY);
}

/**
 * Check collision to the South (wrapper for MonsterEntry)
 */
int check_collision_S2_monster(MonsterEntry* m) {
    return check_collision_S2((uint8_t)m->currX, (uint8_t)m->currY);
}

/**
 * Check collision to the North-East (wrapper for MonsterEntry)
 */
int check_collision_NE2_monster(MonsterEntry* m) {
    return check_collision_NE2((uint8_t)m->currX, (uint8_t)m->currY);
}

/**
 * Check collision to the South-East (wrapper for MonsterEntry)
 */
int check_collision_SE2_monster(MonsterEntry* m) {
    return check_collision_SE2((uint8_t)m->currX, (uint8_t)m->currY);
}

/**
 * Check collision to the North-West (wrapper for MonsterEntry)
 */
int check_collision_NW2_monster(MonsterEntry* m) {
    return check_collision_NW2((uint8_t)m->currX, (uint8_t)m->currY);
}

/**
 * Check collision to the South-West (wrapper for MonsterEntry)
 */
int check_collision_SW2_monster(MonsterEntry* m) {
    return check_collision_SW2((uint8_t)m->currX, (uint8_t)m->currY);
}
