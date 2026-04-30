// hero_movement.c - Hero movement state machine
// EXACT port of Fight.asm 0x6343 state_machine_dispatcher and all sub-functions
//
// This module provides frame-accurate hero movement matching the original DOS game

#include "zeliard.h"

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// Physics functions
extern void sub_64BB(void);
extern void sub_6DB1(void);
extern int is_over_rope(void);
extern int is_on_ground(void);
extern int is_on_rope(void);
extern uint8_t get_jump_phase_flags(void);
extern uint8_t get_on_rope_flags(void);
extern void set_jump_phase_flags(uint8_t flags);
extern void set_on_rope_flags(uint8_t flags);

// Collision functions
extern int check_collision_E2(uint8_t x, uint8_t y);
extern int check_collision_W2(uint8_t x, uint8_t y);
extern int check_collision_N2(uint8_t x, uint8_t y);
extern int check_collision_S2(uint8_t x, uint8_t y);
extern int if_passable_set_ZF(uint8_t tile);
extern int set_zero_flag_if_slippery(void);

// Map functions
extern uint16_t coords_to_proximity_offset(uint8_t x, uint8_t y);
extern uint16_t wrap_map_from_above(uint16_t offset);
extern uint16_t wrap_map_from_below(uint16_t offset);
extern void unpack_column(uint8_t* packed, uint16_t* pos, uint8_t* dest);
extern uint16_t get_map_width(void);

// Rendering
extern void main_update_render(void);

// ============================================================================
// Constants
// ============================================================================

#define PROXIMITY_MAP_WIDTH  36
#define PROXIMITY_MAP_HEIGHT 64
#define MEM_PROXIMITY_MAP    0xE000
#define MEM_SAVE_DATA        0x0000

// Input flags (from interrupt 61h in original, now from input buffer)
#define INPUT_UP_MASK       0x01
#define INPUT_DOWN_MASK     0x02
#define INPUT_LEFT_MASK     0x04
#define INPUT_RIGHT_MASK    0x08

// ============================================================================
// Global State Variables (from 0x9F00 region)
// ============================================================================

// 0x9F00 region - Hero movement state
static uint8_t byte_9F09 = 0;     // Jump counter/timer
static uint8_t byte_9F0A = 0;     // Unknown state flag
static uint8_t byte_9F0B = 0;     // Direction lock flag (0xFF = locked)
static uint8_t byte_9F0C = 0;     // Feruza shoes jump modifier
static uint8_t byte_9F18 = 0;     // Movement state flag
static uint8_t byte_9F19 = 0;     // Movement completion flag
static uint8_t byte_9F20 = 0;     // Movement timer/counter
static uint8_t byte_9F21 = 0;     // Movement acceleration
static uint8_t byte_9F22 = 0;     // Direction indicator (1=right, 2=left)
static uint8_t byte_9F23 = 0;     // Direction state
static uint8_t byte_9F24 = 0;     // Previous direction state

// Additional global flags
static uint8_t byte_FF38 = 0;     // Rope transition flag
static uint8_t byte_FF42 = 0;     // Boss battle mode flag
static uint8_t danger_type = 0;   // Danger type for special hazards

// Debug variables
static uint8_t debug_input_received = 0;

// Frame-based movement timing (to slow down on modern fast PCs)
// Original game ran at ~60 FPS with movement every 4-6 frames
static uint8_t movement_frame_counter = 0;
static const uint8_t MOVEMENT_FRAME_DELAY = 5;  // Move every 5 frames

/**
 * Check if enough frames have passed for movement
 * Returns 1 if movement is allowed, 0 if should wait
 */
static int can_move_this_frame(void) {
    movement_frame_counter++;
    if (movement_frame_counter >= MOVEMENT_FRAME_DELAY) {
        movement_frame_counter = 0;
        return 1;
    }
    return 0;
}

// ============================================================================
// Helper Functions
// ============================================================================

static SaveData* get_save_data(void) {
    return (SaveData*)&g_memory[MEM_SAVE_DATA];
}

static uint8_t* get_proximity_map(void) {
    return &g_memory[MEM_PROXIMITY_MAP];
}

// Get tile at proximity map offset
static uint8_t get_tile_at_offset(uint16_t offset);

// Check if tile is non-blocking
static int is_non_blocking_tile(uint8_t tile);

// Get monster flags at position
static uint8_t get_dst_monster_flags(uint16_t si);

// Check vertical distance for platform
static int sub_7FDC(void);

// Move platform up (declared in zeliard.h)
void move_platform_up(void);

// Move platform down (declared in zeliard.h)
int move_platform_down(void);

// Sub 65C5
static void sub_65C5(void);

// Sub 7A83
static void sub_7A83(void);

// Sub 864E
static void sub_864E(void);

// Get category
static int get_category(uint8_t al);

// Sub 6E1B
static int sub_6E1B(uint8_t al);

// Move hero up
static void move_hero_up(void);

// Forward declarations for sub_684C helpers
static int sub_6942(uint16_t si);

// Forward declarations for hero movement
static int hero_moves_left(void);
static int hero_moves_right(void);

// Forward declarations for sub_65C5 helpers
static int is_over_rope_at(uint16_t si);
static void climb_to_rope_from_ground(void);

// ============================================================================
// Helper Function Implementations
// ============================================================================

/**
 * Get tile at proximity map offset (0...0x900)
 */
static uint8_t get_tile_at_offset(uint16_t offset) {
    uint8_t* map = get_proximity_map();
    return map[offset];
}

/**
 * Check if tile is non-blocking
 * Port of Fight.asm 0x6DE5
 */
static int is_non_blocking_tile(uint8_t tile) {
    // Tiles < 0x40 are non-blocking
    return (tile < 0x40) ? 1 : 0;
}

/**
 * Get monster flags at position
 * Port of Fight.asm get_dst_monster_flags
 * Returns monster flags, bit 7 indicates monster presence
 */
static uint8_t get_dst_monster_flags(uint16_t si) {
    // Read tile at position
    uint8_t tile = get_tile_at_offset(si);

    // Check if tile contains monster (bit 7 set = monster ID)
    if (tile & 0x80) {
        return tile;  // Monster present
    }

    return 0;  // No monster
}

/**
 * Update monster positions in rightmost column after scrolling left
 * Port of Fight.asm 0x6915-0x6941
 * 
 * Iterates through monster table and updates proximity map for monsters
 * at the right margin (x = hero_x + 35 in proximity map = column 35)
 */
void update_monsters_for_right_scroll(void) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    MDTHeader* mdt_header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    
    // Calculate right margin X position (column 35 in proximity map)
    uint16_t bx = save->hero_x_minus_18_abs + 36 - 1;  // hero_x + 35
    
    // Handle wraparound
    uint16_t ax = bx;
    uint16_t map_width = get_map_width();
    if (ax >= map_width) {
        bx = ax - map_width;
    }
    
    // Get monster table address (0xC010 + monsters_offset)
    uint16_t monster_table_addr = MEM_MDT_DATA + mdt_header->monsters_offset;
    
    // Iterate through monster table
    uint8_t monster_index = 0;
    uint16_t si = monster_table_addr;
    
    while (1) {
        // Read monster currX (2 bytes)
        uint16_t monster_x = g_memory[si] | (g_memory[si + 1] << 8);
        
        // Check for end of monsters marker (0xFFFF)
        if (monster_x == 0xFFFF) {
            break;
        }
        
        // Check if this is a special monster (ah = 0xFF)
        uint8_t monster_ah = g_memory[si + 1];
        if (monster_ah != 0xFF) {
            // Check if monster X matches right margin
            if (monster_x == bx) {
                // Get monster Y from currY (offset 2 in monster struct)
                uint8_t monster_y = g_memory[si + 2];
                
                // Calculate proximity map offset
                // di = (y * 36) + x + 0xE000, where x = 35 (rightmost column)
                uint16_t di = (monster_y * 36) + 35 + MEM_PROXIMITY_MAP;
                
                // Set tile to monster_index | 0x80
                g_memory[di] = monster_index | 0x80;
            }
        }
        
        // Next monster (each monster is 16 bytes = 0x10)
        monster_index++;
        si += 0x10;
    }
}

/**
 * Update monster positions in leftmost column after scrolling right
 * Port of Fight.asm 0x677A-0x67A1
 * 
 * Iterates through monster table and updates proximity map for monsters
 * at the left margin (x = 0 in proximity map)
 */
void update_monsters_for_left_scroll(void) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    MDTHeader* mdt_header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    
    // Calculate left margin X position (column 0 in proximity map)
    uint16_t bx = save->hero_x_minus_18_abs;  // hero_x (leftmost column = 0)
    
    // Get monster table address (0xC010 + monsters_offset)
    uint16_t monster_table_addr = MEM_MDT_DATA + mdt_header->monsters_offset;
    
    // Iterate through monster table
    uint8_t monster_index = 0;
    uint16_t si = monster_table_addr;
    
    while (1) {
        // Read monster currX (2 bytes)
        uint16_t monster_x = g_memory[si] | (g_memory[si + 1] << 8);
        
        // Check for end of monsters marker (0xFFFF)
        if (monster_x == 0xFFFF) {
            break;
        }
        
        // Check if this is a special monster (ah = 0xFF)
        uint8_t monster_ah = g_memory[si + 1];
        if (monster_ah != 0xFF) {
            // Check if monster X matches left margin
            if (monster_x == bx) {
                // Get monster Y from currY (offset 2 in monster struct)
                uint8_t monster_y = g_memory[si + 2];
                
                // Calculate proximity map offset
                // di = (y * 36) + x + 0xE000, where x = 0 (leftmost column)
                uint16_t di = (monster_y * 36) + 0 + MEM_PROXIMITY_MAP;
                
                // Set tile to monster_index | 0x80
                g_memory[di] = monster_index | 0x80;
            }
        }
        
        // Next monster (each monster is 16 bytes = 0x10)
        monster_index++;
        si += 0x10;
    }
}

/**
 * Check vertical distance for platform
 * Port of Fight.asm sub_7FDC
 * Returns 1 if platform is below hero, 0 otherwise
 */
static int sub_7FDC(void) {
    SaveData* save = get_save_data();
    MDTHeader* mdt_header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    
    // Get hero's absolute position
    uint8_t hero_x = save->hero_x_in_viewport + 4 + save->hero_x_minus_18_abs;
    uint8_t hero_y = save->hero_y_rel + save->hero_head_y_in_viewport + 3;
    hero_y &= 0x3F;  // Clamp Y to 0-63
    
    // Search vertical platforms table for platform under hero
    uint16_t di = MEM_MDT_DATA + mdt_header->vert_platforms_offset;
    
    while (1) {
        // Read platform X (2 bytes)
        uint16_t plat_x = g_memory[di] | (g_memory[di + 1] << 8);
        
        // Check for end marker (0xFFFF)
        if (plat_x == 0xFFFF) {
            return 0;  // No platform found
        }
        
        // Read platform Y (1 byte at offset 2)
        uint8_t plat_y = g_memory[di + 2];
        
        // Check if platform is under hero
        if (plat_x == hero_x && plat_y == hero_y) {
            return 1;  // Platform found under hero
        }
        
        // Next platform (3 bytes each)
        di += 3;
    }
}

/**
 * Move platform up
 * Port of Fight.asm 0x8074 move_platform_up
 * 
 * Moves the vertical platform under the hero up by 1 tile
 * Only works if hero is not on rope and not blocked above
 */
void move_platform_up(void) {
    SaveData* save = get_save_data();
    
    // Check if on rope - can't move platform if on rope
    if (get_on_rope_flags() != 0) {
        return;
    }
    
    // Get hero position in proximity map
    uint16_t si = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );
    
    // Check tile above and to the right (si - 36 + 1)
    si -= 36 - 1;
    si = wrap_map_from_below(si);
    
    uint8_t tile = get_tile_at_offset(si);
    
    // Check if tile above is non-blocking
    if (!is_non_blocking_tile(tile)) {
        return;  // Hero is blocked above
    }
    
    // Check 4 rows above for platform tiles (0x40, 0x41, 0x42)
    si += 36 * 4;
    si = wrap_map_from_above(si);
    
    // Check for platform tiles
    int found_platform = 0;
    for (uint8_t dl = 0x40; dl <= 0x42; dl++) {
        if (get_tile_at_offset(si) == dl) {
            found_platform = 1;
            break;
        }
    }
    
    if (!found_platform) {
        return;  // No platform found
    }
    
    // Find platform in vertical platforms table
    MDTHeader* mdt_header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    uint16_t di = MEM_MDT_DATA + mdt_header->vert_platforms_offset;
    
    uint8_t hero_x = save->hero_x_in_viewport + 4 + save->hero_x_minus_18_abs;
    uint8_t hero_y = save->hero_y_rel + save->hero_head_y_in_viewport + 3;
    hero_y &= 0x3F;
    
    while (1) {
        uint16_t plat_x = g_memory[di] | (g_memory[di + 1] << 8);
        if (plat_x == 0xFFFF) {
            return;  // End of table, platform not found
        }
        
        uint8_t plat_y = g_memory[di + 2];
        
        if (plat_x == hero_x && plat_y == hero_y) {
            break;  // Platform found
        }
        
        di += 3;
    }
    
    // Move platform up: decrement Y coordinate
    // Platform Y is stored with bits 6-7 as flags, so mask with 0x3F
    g_memory[di + 2] = (g_memory[di + 2] - 1) & 0x3F;
    
    // Set flags
    save->byte_E7 = 0x80;
    set_jump_phase_flags(0);  // On ground
    
    // Move hero up
    move_hero_up();
}

/**
 * Move platform down
 * Port of Fight.asm 0x8024 move_platform_down
 * 
 * Moves the vertical platform under the hero down by 1 tile
 * Returns with carry set if successful, carry clear if blocked
 */
int move_platform_down(void) {
    SaveData* save = get_save_data();
    MDTHeader* mdt_header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    
    // Find platform under hero
    uint8_t hero_x = save->hero_x_in_viewport + 4 + save->hero_x_minus_18_abs;
    uint8_t hero_y = save->hero_y_rel + save->hero_head_y_in_viewport + 3;
    hero_y &= 0x3F;
    
    uint16_t di = MEM_MDT_DATA + mdt_header->vert_platforms_offset;
    
    while (1) {
        uint16_t plat_x = g_memory[di] | (g_memory[di + 1] << 8);
        if (plat_x == 0xFFFF) {
            return 0;  // End of table, platform not found
        }

        uint8_t plat_y = g_memory[di + 2];

        if (plat_x == hero_x && plat_y == hero_y) {
            // Get platform position in proximity map
            uint16_t si = coords_to_proximity_offset(hero_x, plat_y);

            // Check if platform is blocked below (3 rows down)
            uint16_t check_si = si;
            check_si += 36 - 1;
            check_si = wrap_map_from_above(check_si);

            if (get_tile_at_offset(check_si) & 0x80) {
                return 0;  // Blocked below (monster or other obstacle)
            }

            // Check 3 tiles across platform width
            for (uint8_t cx = 3; cx > 0; cx--) {
                check_si++;
                if (get_tile_at_offset(check_si) != 0) {
                    return 0;  // Blocked
                }
            }

            // Move platform down: increment Y coordinate
            g_memory[di + 2] = (g_memory[di + 2] + 1) & 0x3F;

            return 1;  // Success (carry set)
        }

        di += 3;
    }

    return 0;  // Platform not found
}

/**
 * Hero interaction check
 * Port of Fight.asm 0x63DA hero_interaction_check
 *
 * Checks tiles around hero and triggers movement based on what's found:
 * - Checks current tile, tile+2, and tile+36 (one row down)
 * - If tiles are non-blocking, moves hero left or right
 *
 * This is used for automatic hero movement when interacting with doors/items.
 * It should only trigger in specific situations, not during normal gameplay.
 */
void hero_interaction_check(void) {
    SaveData* save = get_save_data();

    // Check byte_FF38 - if set, skip interaction check
    if (byte_FF38 != 0) {
        return;
    }

    // Check jump_phase_flags - if jumping, skip interaction check
    if (get_jump_phase_flags() != 0) {
        return;
    }

    // Get hero position in proximity map
    uint16_t si = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );

    // Check current tile
    uint8_t tile = get_tile_at_offset(si);
    if (!is_non_blocking_tile(tile)) {
        return;  // Current tile is blocking
    }

    // Check tile at si+2 (2 tiles to the right)
    si += 2;
    tile = get_tile_at_offset(si);
    if (!is_non_blocking_tile(tile)) {
        return;  // Tile+2 is blocking
    }

    // Check tile at si+36 (one row down from tile+2)
    si += 36;
    si = wrap_map_from_above(si);
    tile = get_tile_at_offset(si);

    // Only trigger movement if there's an actual obstacle or trigger
    // In open space (all tiles 0x00), don't auto-move
    if (tile != 0) {
        if (!is_non_blocking_tile(tile)) {
            // Tile below is blocking - move hero left
            hero_moves_left();
        } else {
            // Tile below is passable but not empty - might be a trigger
            // Only move if tile value indicates a special zone (> 0x00 and < 0x40)
            // For now, skip auto-movement in open areas
        }
    }
}

/**
 * Sub 7A83
 */
static void sub_7A83(void) {
    // Stub
}

/**
 * Sub 65C5 - Climb to rope from ground
 * Port of Fight.asm 0x65C5
 * 
 * Checks if hero is near a rope, centers on it, and climbs to it
 */
static void sub_65C5(void) {
    SaveData* save = get_save_data();
    
    // Get hero position in proximity map
    uint16_t si = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );
    
    // Check tile at si+1 (one tile to the right)
    si++;
    if (is_over_rope_at(si)) {
        climb_to_rope_from_ground();
        return;
    }
    
    // Check tile at si-1 (original position)
    si--;
    if (is_over_rope_at(si)) { // hero is 1 tile to the left of the rope
        // Check direction
        if (save->starting_direction & 1) {
            // Facing right, move right
            hero_moves_right();
        }
        return;
    }
    
    // Check tile at si+2 (two tiles to the right)
    si++;
    si++;
    if (is_over_rope_at(si)) { // hero is 1 tile to the right of the rope
        // Check direction
        if (!(save->starting_direction & 1)) {
            // Facing left, move left
            hero_moves_left();
        }
        return;
    }
}

/**
 * Check if tile at offset is a rope
 */
static int is_over_rope_at(uint16_t si) {
    uint8_t tile = get_tile_at_offset(si);
    return (tile == 0x01);  // Rope tile
}

/**
 * Climb to rope from ground
 */
static void climb_to_rope_from_ground(void) {
    SaveData* save = get_save_data();
    
    set_on_rope_flags(0xFF);  // On rope
    byte_FF38 = 0;
    
    // Climb up until reaching rope
    while (1) {
        uint16_t si = coords_to_proximity_offset(
            save->hero_x_in_viewport,
            save->hero_head_y_in_viewport
        );
        si -= 35;  // Move up one row
        si = wrap_map_from_below(si);
        
        save->byte_E7--;
        
        if (!is_over_rope_at(si)) {
            save->byte_E7 |= 1;
            return;
        }
        
        move_hero_up();
        main_update_render();
        
        if (save->byte_E7 & 1) {
            return;
        }
    }
}

/**
 * Sub 864E - Monster update
 */
static void sub_864E(void) {
    // Stub - monster update
}

// ============================================================================
// Horizontal Platform Movement
// ============================================================================

/**
 * Horizontal platform structure (7 bytes)
 * From Fight.asm horiz_platform
 * Format in MDT (little-endian):
 *   x_and_flags: 2 bytes (bits 0-13: X, bits 14-15: speed)
 *   y_and_flags: 1 byte (bits 0-5: Y, bit 6: pause, bit 7: direction)
 *   min_x: 2 bytes
 *   max_x: 2 bytes
 */
typedef struct {
    uint16_t x_and_flags;  // Bits 0-13: X position, Bits 14-15: speed
    uint8_t  y_and_flags;  // Bit 6: pause flag, Bit 7: direction (0=right, 1=left)
    uint16_t min_x;        // Minimum X boundary
    uint16_t max_x;        // Maximum X boundary
} __attribute__((packed)) HorizPlatform;

/**
 * Update horizontal platform coordinates
 * Port of Fight.asm 0x8252 update_horiz_platform_coords
 * 
 * Moves platform based on direction and speed
 * Reverses direction at min/max boundaries
 */
static void update_horiz_platform_coords(HorizPlatform* plat) {
    uint16_t x = plat->x_and_flags & 0x3FFF;  // Extract X position
    uint8_t direction = (plat->y_and_flags >> 7) & 1;  // Bit 7: direction
    uint8_t speed = (plat->x_and_flags >> 14) & 3;  // Bits 14-15: speed
    
    // Check if platform is paused (bit 6 set)
    if (plat->y_and_flags & 0x40) {
        return;  // Platform is paused
    }
    
    // Move platform based on direction
    if (direction == 0) {
        // Moving right
        x++;
        
        // Check for map wraparound
        uint16_t map_width = get_map_width();
        if (x >= map_width) {
            x = 0;
        }
        
        // Check if reached max_x boundary
        if (x == plat->max_x) {
            // Reverse direction and pause
            plat->y_and_flags ^= 0x80;  // Toggle direction bit
            plat->y_and_flags |= 0x40;  // Set pause flag
        }
    } else {
        // Moving left
        if (x == 0) {
            x = get_map_width() - 1;  // Wrap around
        } else {
            x--;
        }
        
        // Check if reached min_x boundary
        if (x == plat->min_x) {
            // Reverse direction and pause
            plat->y_and_flags ^= 0x80;  // Toggle direction bit
            plat->y_and_flags |= 0x40;  // Set pause flag
        }
    }
    
    // Update platform position with speed bits preserved
    plat->x_and_flags = (plat->x_and_flags & 0xC000) | (x & 0x3FFF);
}

/**
 * Check if hero is on horizontal platform
 * Port of Fight.asm sub_82B4
 * 
 * Returns 1 if hero is on platform, 0 otherwise
 */
static int hero_on_horizontal_platform(HorizPlatform* plat) {
    SaveData* save = get_save_data();
    
    // Check if hero is jumping or on rope
    if (get_jump_phase_flags() != 0 || get_on_rope_flags() != 0) {
        return 0;
    }
    
    // Check if hero Y matches platform Y
    uint8_t hero_y = save->hero_head_y_in_viewport + save->hero_y_rel + 3;
    hero_y &= 0x3F;
    
    uint8_t plat_y = plat->y_and_flags & 0x3F;
    
    if (hero_y != plat_y) {
        return 0;
    }
    
    // Check if hero X is within platform bounds (3 tiles wide)
    uint16_t plat_x = plat->x_and_flags & 0x3FFF;
    uint8_t hero_x = save->hero_x_in_viewport + 4;
    
    for (int i = 0; i < 3; i++) {
        if (hero_x == (plat_x + i)) {
            return 1;  // Hero is on platform
        }
    }
    
    return 0;
}

/**
 * Convert absolute map X to viewport-relative X for proximity map rendering
 * Port of Fight.asm 0x82F8 map_abs_x_to_viewport_rel
 * Returns viewport-relative X (0-35) or -1 if outside viewport
 */
static int abs_x_to_viewport_x(uint16_t abs_x) {
    SaveData* save = get_save_data();
    uint16_t hero_x = save->hero_x_minus_18_abs;
    
    // Calculate relative to hero position
    int16_t rel_x = (int16_t)abs_x - (int16_t)hero_x;
    
    // Viewport shows columns 0-35 (36 columns total)
    if (rel_x < 0 || rel_x > 35) {
        return -1;  // Outside viewport
    }
    
    return (int)rel_x;
}

/**
 * Clear horizontal platform from proximity map
 * Port of Fight.asm 0x8204 clear_next_platform_tile
 */
static void clear_horizontal_platform(HorizPlatform* plat) {
    uint16_t abs_x = plat->x_and_flags & 0x3FFF;
    uint8_t y_raw = plat->y_and_flags;
    uint8_t y = y_raw & 0x3F;  // Mask out bits 6-7 (pause flag and direction)
    
    SaveData* save = get_save_data();
    uint16_t hero_abs_x = save->hero_x_minus_18_abs;
    uint8_t hero_viewport_x = save->hero_x_in_viewport;
    
    // The proximity map spans from (hero_abs_x - hero_viewport_x) to (hero_abs_x - hero_viewport_x + 35)
    uint16_t map_start_x = hero_abs_x - hero_viewport_x;
    uint16_t map_end_x = map_start_x + 35;
    
    // Clear 3 tiles of old platform position
    for (int i = 0; i < 3; i++) {
        uint16_t platform_abs_x = abs_x + i;
        
        // Handle map wrapping for platform position
        uint16_t wrapped_platform_x = platform_abs_x;
        while (wrapped_platform_x >= get_map_width()) {
            wrapped_platform_x -= get_map_width();
        }
        
        // Check if platform is within the proximity map window
        int in_viewport = 0;
        if (map_start_x <= map_end_x) {
            // Normal case: window doesn't cross boundary
            if (wrapped_platform_x >= map_start_x && wrapped_platform_x <= map_end_x) {
                in_viewport = 1;
            }
        } else {
            // Window crosses boundary: check both segments
            if (wrapped_platform_x >= map_start_x || wrapped_platform_x <= map_end_x) {
                in_viewport = 1;
            }
        }
        
        // Debug: write to memory if we're about to clear
        if (in_viewport && y < 64) {
            int16_t viewport_x = (int16_t)wrapped_platform_x - (int16_t)map_start_x;
            if (viewport_x < 0) {
                viewport_x += 36;
            }
            
            uint16_t offset = (y * 36) + (uint8_t)viewport_x;
            if (offset < 2304) {
                g_memory[MEM_PROXIMITY_MAP + offset] = 0x00;
                // Debug marker
                g_memory[0xFF10 + i] = 0x01;  // Mark that we cleared this tile
            }
        } else {
            g_memory[0xFF10 + i] = 0x00;  // Mark as not cleared
        }
    }
}

/**
 * Draw horizontal platform in proximity map
 * Port of Fight.asm 0x8236 loc_8236
 */
static void draw_horizontal_platform(HorizPlatform* plat) {
    uint16_t abs_x = plat->x_and_flags & 0x3FFF;
    uint8_t y_raw = plat->y_and_flags;
    uint8_t y = y_raw & 0x3F;  // Mask out bits 6-7 (pause flag and direction)
    
    SaveData* save = get_save_data();
    uint16_t hero_abs_x = save->hero_x_minus_18_abs;
    uint8_t hero_viewport_x = save->hero_x_in_viewport;
    
    // The proximity map spans from (hero_abs_x - hero_viewport_x) to (hero_abs_x - hero_viewport_x + 35)
    uint16_t map_start_x = hero_abs_x - hero_viewport_x;
    uint16_t map_end_x = map_start_x + 35;
    
    // Debug: log what we're drawing
    static uint8_t draw_debug_done = 0;
    if (!draw_debug_done) {
        draw_debug_done = 1;
        g_memory[0xFF20] = abs_x & 0xFF;
        g_memory[0xFF21] = (abs_x >> 8) & 0xFF;
        g_memory[0xFF22] = y;
        g_memory[0xFF23] = map_start_x & 0xFF;
        g_memory[0xFF24] = (map_start_x >> 8) & 0xFF;
        g_memory[0xFF25] = map_end_x & 0xFF;
        g_memory[0xFF26] = (map_end_x >> 8) & 0xFF;
        g_memory[0xFF27] = 0xAA;  // Marker
    }
    
    // Draw 3 tiles: 0x46, 0x47, 0x48 (platform tiles)
    for (int i = 0; i < 3; i++) {
        uint16_t platform_abs_x = abs_x + i;
        
        // Handle map wrapping for platform position
        uint16_t wrapped_platform_x = platform_abs_x;
        while (wrapped_platform_x >= get_map_width()) {
            wrapped_platform_x -= get_map_width();
        }
        
        // Check if platform is within the proximity map window
        int in_viewport = 0;
        if (map_start_x <= map_end_x) {
            // Normal case: window doesn't cross boundary
            if (wrapped_platform_x >= map_start_x && wrapped_platform_x <= map_end_x) {
                in_viewport = 1;
            }
        } else {
            // Window crosses boundary: check both segments
            if (wrapped_platform_x >= map_start_x || wrapped_platform_x <= map_end_x) {
                in_viewport = 1;
            }
        }
        
        if (in_viewport && y < 64) {
            // Calculate viewport column
            int16_t viewport_x = (int16_t)wrapped_platform_x - (int16_t)map_start_x;
            if (viewport_x < 0) {
                viewport_x += 36;
            }
            
            uint16_t offset = (y * 36) + (uint8_t)viewport_x;
            if (offset < 2304) {
                g_memory[MEM_PROXIMITY_MAP + offset] = 0x46 + i;
            }
        }
    }
}

/**
 * Update all horizontal platforms
 * Port of Fight.asm 0x81AE sub_81AE
 *
 * Called every frame to update platform positions
 */
void update_horizontal_platforms(void) {
    static uint8_t frame_counter = 0;
    frame_counter++;

    MDTHeader* mdt_header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    // The offsets in MDT header are absolute addresses in g_memory space
    uint16_t plat_addr = mdt_header->horiz_platforms_offset;
    
    SaveData* save = get_save_data();

    while (1) {
        HorizPlatform* plat = (HorizPlatform*)&g_memory[plat_addr];

        // Check for end marker (0xFFFF)
        if (plat->x_and_flags == 0xFFFF) {
            break;
        }

        // Clear old platform position
        clear_horizontal_platform(plat);

        // Update platform position based on speed
        uint8_t speed = (plat->x_and_flags >> 14) & 3;

        if (speed == 1 || speed == 2) {
            // Moving platform - update every frame
            update_horiz_platform_coords(plat);
        } else if (speed == 3 && (frame_counter & 1)) {
            // Slow platform - update every other frame
            update_horiz_platform_coords(plat);
        }

        // Draw platform at new position
        draw_horizontal_platform(plat);

        // Move to next platform (7 bytes each)
        plat_addr += 7;
    }
}

/**
 * Get category - Categorize tile against game tables
 * Port of Fight.asm 0x76F6
 * Returns: 0=category 0, 1=category 1, 2=category 2, -1=not found
 * 
 * Category tables are at seg1:8024-802F (12 bytes total)
 * From WORK/MPP1.GRP offset 0x24: all 12 bytes are ZEROES for level 1
 * Different levels may have different category tables loaded
 * 
 * Category 0: 8024-8027 (4 bytes) - all 0x00 in MP10.MDT
 * Category 1: 8028-802B (4 bytes) - all 0x00 in MP10.MDT
 * Category 2: 802C-802F (4 bytes) - all 0x00 in MP10.MDT
 */
static int get_category(uint8_t tile) {
    if (tile == 0) {
        return -1;  // Empty tile, no category
    }

    // Category tables from seg1:8024-802F
    // All zeroes for MP10.MDT (Cavern Malicia), but may differ in other levels
    static const uint8_t category0[] = {0x00, 0x00, 0x00, 0x00};  // 8024-8027
    static const uint8_t category1[] = {0x00, 0x00, 0x00, 0x00};  // 8028-802B
    static const uint8_t category2[] = {0x00, 0x00, 0x00, 0x00};  // 802C-802F

    // Check category 0
    for (int i = 0; i < 4 && category0[i] != 0; i++) {
        if (category0[i] == tile) {
            return 0;
        }
    }

    // Check category 1
    for (int i = 0; i < 4 && category1[i] != 0; i++) {
        if (category1[i] == tile) {
            return 1;
        }
    }

    // Check category 2
    for (int i = 0; i < 4 && category2[i] != 0; i++) {
        if (category2[i] == tile) {
            return 2;
        }
    }

    return -1;  // Not found in any category
}

/**
 * Sub 6E1B - Check if tile is passable (in game segment table)
 * Port of Fight.asm 0x6E1B
 * 
 * The table at seg1:8000h contains 24 bytes of passable tiles.
 * Values: 00 01 02 08 09 0A 0B 0C 0F 10 11 12 13 14 15 16 17 18 19 00 00 00 00 00
 * 
 * Returns 1 (ZF=0 in assembly, passable) if:
 * - Tile >= 0x49 (high tiles are passable), OR
 * - Tile is in the 24-byte table (empty space, rope, etc.), OR
 * - Tile has bit 7 set (monster/special)
 * 
 * Returns 0 (ZF=1 in assembly, solid/blocking) otherwise.
 */
static int sub_6E1B(uint8_t al) {
    // Tiles >= 0x49 are considered passable
    if (al >= 0x49) {
        return 1;  // Passable
    }

    // Check the 24-byte table at seg1:8000h
    // Values: 00 01 02 08 09 0A 0B 0C 0F 10 11 12 13 14 15 16 17 18 19 00 00 00 00 00
    static const uint8_t passable_table[24] = {
        0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x0B, 0x0C,
        0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
        0x17, 0x18, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00
    };
    
    for (int i = 0; i < 24; i++) {
        if (passable_table[i] == al) {
            return 1;  // Found in table - passable
        }
    }

    // Check high bit (monster/special tile - passable)
    if (al & 0x80) {
        return 1;  // Passable (monster)
    }

    return 0;  // Not in table, no high bit - solid/blocking
}

/**
 * Move hero up
 */
static void move_hero_up(void) {
    SaveData* save = get_save_data();
    if (save->hero_head_y_in_viewport < 255) {
        save->hero_head_y_in_viewport++;
    }
}


/**
 * sub_6942 - Check danger type and tile category
 * Port of Fight.asm 0x6942
 * Returns 1 (carry clear) if safe, 0 (carry set) if dangerous
 */
static int sub_6942(uint16_t si) {
    if (danger_type != 7) {
        return 1;  // Clear carry - not a danger check
    }
    
    uint8_t tile = get_tile_at_offset(si);
    int category = get_category(tile);
    
    // Category check: cl-1, if zero then category 1 (safe)
    if (category != 1) {
        return 0;  // Set carry - dangerous
    }
    
    return 1;  // Clear carry - safe
}

// ============================================================================
// Core Functions - Exact ports from Fight.asm
// ============================================================================

/**
 * Sub 684C (very important proc) - returns negative if blocked
 * Port of Fight.asm 0x684C
 * This is the "hero_moves_right" function that handles:
 * - Collision check for moving right
 * - Map scrolling when hero moves
 * - Monster position updates
 */
int sub_684C(void) {
    // Check frame timing - only move every N frames
    if (!can_move_this_frame()) {
        return 1;  // Not blocked, but not moving this frame
    }
    
    SaveData* save = get_save_data();

    // Get hero position in proximity map
    uint16_t si = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );

    // Check 2 tiles to the right (x+2)
    si += 2;
    uint16_t di = si;

    // Move up one row (y-1)
    si -= 36;
    si = wrap_map_from_below(si);

    // Check 4 rows above for monster flags
    for (uint8_t cx = 4; cx > 0; cx--) {
        uint8_t flags = get_dst_monster_flags(si);
        if (flags & 0x80) {
            return -1;  // Collision with monster (carry set)
        }
        si += 36;  // Move down one row
        si = wrap_map_from_above(si);
    }

    si = di;

    // Check byte_FF38 (rope transition flag)
    if (byte_FF38 == 0) {
        uint8_t tile = get_tile_at_offset(si);

        // Check if tile is non-blocking
        if (!is_non_blocking_tile(tile)) {
            return -1;  // Collision (carry set)
        }

        // Check danger type
        if (!sub_6942(si)) {
            return -1;  // Collision (carry set)
        }
    }

    // Check 2 more rows below
    for (uint8_t cx = 2; cx > 0; cx--) {
        si += 36;  // Move down one row
        si = wrap_map_from_above(si);

        uint8_t tile = get_tile_at_offset(si);

        // Check tile category
        if (!sub_6E1B(tile)) {
            return -1;  // Collision (carry set)
        }

        // Check danger type
        if (!sub_6942(si)) {
            return -1;  // Collision (carry set)
        }
    }

    // All collision checks passed - actually move hero right
    hero_moves_right();

    return 0;  // Success (carry clear)
}

/**
 * hero_moves_left - Move hero left with collision check and map scrolling
 * Port of Fight.asm 0x66F8..0x67a2 hero_moves_left
 * This handles:
 * - Decrement hero X
 * - Collision check for moving left
 * - Map scrolling right when hero moves left
 * - Monster position updates
 */
static int hero_moves_left(void) {
    SaveData* save = get_save_data();

    // Check for wraparound BEFORE decrementing
    int wrapping = (save->hero_x_minus_18_abs == 0) ? 1 : 0;

    // Decrement hero X
    save->hero_x_minus_18_abs--;
    uint16_t si;
    uint16_t map_width = get_map_width();

    // Handle wraparound
    if (wrapping) {
        save->hero_x_minus_18_abs = map_width - 1;
        // Wrap to end: use packed_map_end_ptr (Fight.asm 0x670A-0x670E)
        si = packed_map_end_ptr;
    } else {
        // Normal scroll: use packed_map_ptr_for_hero_x_minus_18
        si = packed_map_ptr_for_hero_x_minus_18;
    }

    // Scroll proximity map right (with wrapping if needed)
    uint8_t* proximity_map = &g_memory[MEM_PROXIMITY_MAP];

    // Step 1: Move all bytes right by 1 (exact rep movsb with std from assembly)
    // std sets decrement flag so movsb goes backwards
    // si = proximity_map + 36*64 - 2, di = proximity_map + 36*64 - 1, cx = 36*64-1
    // This shifts the entire 2304-byte buffer right by 1 byte
    for (int i = (36 * 64 - 1); i > 0; i--) {
        proximity_map[i] = proximity_map[i - 1];
    }

    // Step 2: Unpack new leftmost column (column 0) from packed data (going backwards)
    // Get packed data pointer
    uint8_t* packed = &g_memory[MEM_MDT_DATA + PACKED_MAP_START];

    // points to the last byte of packed column
    si--;

    // Unpack column directly to leftmost column of proximity map
    // Column-major order: dest[0], dest[36], dest[72], ...
    // di = proximity_map + 36*(64-1) = start of column 0, last row
    uint16_t di = 36 * 63;  // Start at bottom of column 0
    uint8_t dl = 0;  // Row counter

    do {
        uint8_t tile, count;
        unpack_step_backward(packed, &si, &tile, &count);
        dl += count;

        // Fill 'count' bytes with 'tile' value, going UP the column
        while (count > 0) {
            proximity_map[di] = tile;
            di -= 36;  // Move up one row
            count--;
        }
    } while (dl < 64);

    // Store packed position
    si++;
    packed_map_ptr_for_hero_x_minus_18 = si;


    // Step 3: Update right column pointer (skip backwards over one column)
    si = packed_map_end_ptr - 1;

    // we need to prepare pointer also for unpacking rightmost column of proximity map
    // they both need to be in sync (36 columns apart)
    if (save->hero_x_minus_18_abs + 36 != map_width) {
        si = packed_map_ptr_for_hero_x_plus_18;
        // Unpack and discard one column's worth of data
        uint8_t dh = 0;
        while (dh < 64) {
            uint8_t tile, count;
            unpack_step_backward(packed, &si, &tile, &count); // si-- inside
            dh += count;
        }
    }
    packed_map_ptr_for_hero_x_plus_18 = si;

    // Step 4: Update monster positions in leftmost column
    // TODO: every_slot_moves_left_in_viewport()
    update_monsters_for_left_scroll();

    return 0;  // Success
}

/**
 * hero_moves_right - Move hero right with collision check and map scrolling
 * Port of Fight.asm 68A0..6941 hero_moves_right
 * This handles:
 * - Increment hero X
 * - Collision check for moving right
 * - Map scrolling left when hero moves right
 * - Monster position updates
 */
static int hero_moves_right(void) {
    SaveData* save = get_save_data();

    // Increment hero X
    save->hero_x_minus_18_abs++;

    // Scroll proximity map left (handles wraparound internally)
    uint8_t* proximity_map = &g_memory[MEM_PROXIMITY_MAP];
    uint16_t si;

    // Check if we're wrapping to the start of the map
    uint16_t map_width = get_map_width();
    int wrapping = (save->hero_x_minus_18_abs + 35 == map_width) ? 1 : 0;
    if (wrapping) {
        packed_map_ptr_for_hero_x_plus_18 = packed_map_end_ptr + 1;
    }

    // Step 1: Move all bytes left by 1 (exact rep movsb from assembly)
    // si = proximity_map + 1, di = proximity_map, cx = 36*64-1
    // This shifts the entire 2304-byte buffer left by 1 byte
    for (int i = 0; i < (36 * 64 - 1); i++) {
        proximity_map[i] = proximity_map[i + 1];
    }
    si = packed_map_ptr_for_hero_x_plus_18 + 1;

    // Step 2: Unpack new rightmost column (column 35)
    // Get packed data pointer
    uint8_t* packed = &g_memory[MEM_MDT_DATA + PACKED_MAP_START];

    // Unpack column directly to rightmost column of proximity map
    // di = proximity_map + 36 - 1 = proximity_map + 35 (column 35, row 0)
    // unpack_column writes to di, di+36, di+72, ... (column-major)
    unpack_column(packed, &si, &proximity_map[35]);

    // Decrement and store packed position
    packed_map_ptr_for_hero_x_plus_18 = si - 1;

    if (save->hero_x_minus_18_abs != map_width) {
        si = packed_map_ptr_for_hero_x_minus_18;
        // Unpack and discard one column's worth of data
        uint8_t dh = 0;
        while (dh < 64) {
            uint8_t tile, count;
            unpack_step_forward(packed, &si, &tile, &count);
            dh += count;
        }
    } else {
        save->hero_x_minus_18_abs = 0;
        si = packed_map_start;
    }

    // Step 3: Update left column pointer
    packed_map_ptr_for_hero_x_minus_18 = si;

    // Step 4: Update monster positions in rightmost column
    // Monsters at the right proximity margin need their tile updated
    // TODO: every_slot_moves_left_in_viewport()
    update_monsters_for_right_scroll();

    return 0;  // Success
}

// Sub 6B2E - Move hero and viewport down
static void sub_6B2E(void) {
// inc     ds:hero_y_rel   ; hero goes down
// mov     si, ds:map_hero_row_start ; viewport goes down too
// add     si, 36
// call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
// mov     ds:map_hero_row_start, si

    SaveData* save = get_save_data();
    save->hero_y_rel++;

    uint16_t si = map_hero_row_start; // 0...0x900
    si += 36;
    si = wrap_map_from_above(si);
    map_hero_row_start = si;
}

/**
 * sub_66A5 - Jump trajectory variant / collision check
 * Port of Fight.asm 0x66A5
 * Checks collision for left movement
 */
void sub_66A5(void) {
    SaveData* save = get_save_data();
    
    uint16_t di = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );
    uint16_t si = di;
    si -= 36;
    si = wrap_map_from_below(si);
    si--;
    
    // Check 4 rows for monster flags
    for (uint8_t cx = 4; cx > 0; cx--) {
        uint8_t flags = get_dst_monster_flags(si);
        if (flags & 0x80) {
            return;  // Collision
        }
        si += 36;
        si = wrap_map_from_above(si);
    }
    
    si = di;
    
    if (byte_FF38 == 0) {
        uint8_t tile = get_tile_at_offset(si);
        if (!is_non_blocking_tile(tile)) {
            return;  // Collision
        }
        
        if (!sub_6942(si)) {
            return;  // Collision
        }
    }
    
    // Check 2 more rows down
    for (uint8_t cx = 2; cx > 0; cx--) {
        si += 36;
        si = wrap_map_from_above(si);
        
        uint8_t tile = get_tile_at_offset(si);
        if (!sub_6E1B(tile)) {
            return;  // Collision
        }
        
        if (!sub_6942(si)) {
            return;  // Collision
        }
    }
    
    // No collision - movement allowed
    // This would set flags to allow movement
}

// loc_6837 - Movement blocked handler
static void loc_6837(void) {
    // Stub - handle blocked movement
}

// sub_67A3 - Check danger type
// Port of Fight.asm 0x67A3
// Returns 1 (carry clear) if movement is allowed, 0 (carry set) if blocked
static int sub_67A3(uint16_t si) {
    // If danger_type != 7, return carry CLEAR (allow movement)
    if (danger_type != 7) {
        return 1;  // Carry clear - safe to move
    }
    
    // danger_type == 7, check tile category
    uint8_t tile = get_tile_at_offset(si);
    int category = get_category(tile);
    
    // If category == 2, return carry CLEAR (allow movement)
    if (category == 2) {
        return 1;  // Carry clear - safe to move
    }
    
    // Otherwise return carry SET (block movement)
    return 0;  // Carry set - collision
}

// Forward declarations for mutual recursion
static void loc_663E(void);
static void loc_67C6(void);
static void sub_6824(void);

// ============================================================================
// Core Functions - Exact ports from Fight.asm
// ============================================================================

/**
 * sub_6508 - Direction change logic
 * Port of Fight.asm 0x6508
 */
static void sub_6508(void) {
    // Call set_zero_flag_if_slippery
    int slippery = set_zero_flag_if_slippery();
    if (!slippery) {
        return;  // ZF=0, return immediately
    }
    
    // Check byte_9F20
    if (byte_9F20 != 0) {
        return;
    }
    
    // Check on_rope_flags
    if (get_on_rope_flags() != 0) {
        return;
    }
    
    // Process byte_9F21
    uint8_t al = byte_9F21;
    al >>= 1;
    
    if (al == 0) {
        return;
    }
    
    // Cap at 10
    if (al > 10) {
        al = 10;
    }
    
    byte_9F20 = al;
    byte_9F21 = 0;
}

/**
 * sub_6545 - Jump initiation helper
 * Port of Fight.asm 0x6545
 */
static void sub_6545(void) {
    byte_9F20++;
    
    if (byte_9F20 < 10) {
        // Continue jump initiation
    } else {
        byte_9F20 = 10;
    }
    
    // Check if on rope
    if (get_on_rope_flags() != 0) {
        return;
    }
    
    byte_FF38 = 0;
    
    SaveData* save = get_save_data();
    
    // Check Feruza Shoes jump height
    if (byte_9F09 >= save->Feruza_Shoes) {
        return;
    }
    
    // Get tile above hero
    uint16_t si = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );
    si -= 35;  // Move up one row
    si = wrap_map_from_below(si);
    
    uint8_t tile = get_tile_at_offset(si);
    
    // Check if tile is non-blocking
    if (!is_non_blocking_tile(tile)) {
        // Start jump
        save->byte_E7 = 0;
        save->starting_direction &= 0xFD;  // Clear bit 1
        set_jump_phase_flags(0xFF);  // Ascending
        
        // Set jump height based on Feruza Shoes
        byte_9F0C = save->Feruza_Shoes >> 1;
        byte_9F09++;
        
        // Move hero up if needed
        if (save->hero_head_y_in_viewport < 7) {
            move_hero_up();
            return;
        }
        
        save->hero_head_y_in_viewport--;
        return;
    }
    
    // Check if jump already started
    if (byte_9F09 != 0) {
        return;
    }
    
    // Check on_rope_flags again
    if (get_on_rope_flags() != 0) {
        // Transition from rope
        set_on_rope_flags(0x80);
        set_jump_phase_flags(0x80);
        return;
    }
    
    // Continue jump
    set_jump_phase_flags(0xFF);
    byte_9F0C = save->Feruza_Shoes >> 1;
    byte_9F09++;
    
    if (save->hero_head_y_in_viewport < 7) {
        move_hero_up();
    } else {
        save->hero_head_y_in_viewport--;
    }
}

/**
 * up_pressed - Handle up key press (jump)
 * Port of Fight.asm 0x6537
 */
static void up_pressed(void) {
    byte_9F18 = 0;
    sub_7A83();
    move_platform_up();
    sub_65C5();
}

/**
 * down_pressed - Handle down key press (squat/climb down)
 * Port of Fight.asm 0x6AC9
 */
static void down_pressed(void) {
    byte_9F18 = 0;
    
    SaveData* save = get_save_data();
    
    if (byte_FF42 != 0) {
        return;
    }
    
climb_off_rope_to_ground:
    sub_7FDC();
    
    uint16_t si = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );
    si += 109;  // 3*36+1 (down and right)
    si = wrap_map_from_above(si);
    
    // Check if over rope
    if (is_over_rope()) {
        // Still over rope
        if (get_on_rope_flags() == 0) {
            // Was on rope, now transitioning
            set_on_rope_flags(0x80);
            set_jump_phase_flags(0x80);
            return;
        }
        
        byte_9F0A = 0;
        byte_FF38 = 0xFF;
        return;
    }
    
    // Not over rope
    uint16_t si2 = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );
    si2 += 109;
    si2 = wrap_map_from_above(si2);
    
    save->byte_E7++;
    
    uint8_t tile = get_tile_at_offset(si2);
    
    if (!is_non_blocking_tile(tile)) {
        save->byte_E7 |= 1;
        return;
    }
    
    sub_6B2E();
    main_update_render();
    
    if (save->byte_E7 & 1) {
        return;
    }
    
    goto climb_off_rope_to_ground;
}

/**
 * sub_66A5_wrapper - Check collision for LEFT movement
 * Port of Fight.asm 0x66A5
 * Returns 1 (carry clear) if can move left, 0 (carry set) if blocked
 * After checking, if clear, it also moves the hero left and scrolls the map
 */
static int sub_66A5_wrapper(void) {
    // Check frame timing - only move every N frames
    if (!can_move_this_frame()) {
        return 1;  // Not blocked, but not moving this frame
    }
    
    SaveData* save = get_save_data();

    uint16_t di = coords_to_proximity_offset(
        save->hero_x_in_viewport,
        save->hero_head_y_in_viewport
    );
    
    uint16_t si = di;
    si -= 36;
    si = wrap_map_from_below(si);
    si--;  // Check left (x-1)

    // Check 4 rows for monster flags
    for (uint8_t cx = 4; cx > 0; cx--) {
        uint8_t flags = get_dst_monster_flags(si);
        if (flags & 0x80) {
            return 0;  // Collision (carry set)
        }
        si += 36;
        si = wrap_map_from_above(si);
    }

    si = di;

    if (byte_FF38 == 0) {
        uint8_t tile = get_tile_at_offset(si);
        if (!is_non_blocking_tile(tile)) {
            return 1;  // No collision, can move (carry clear)
        }

        if (!sub_67A3(si)) {
            return 0;  // Collision (carry set)
        }
    }

    // Check 2 more rows down
    for (uint8_t cx = 2; cx > 0; cx--) {
        si += 36;
        si = wrap_map_from_above(si);

        uint8_t tile = get_tile_at_offset(si);
        if (!sub_6E1B(tile)) {
            return 0;  // Collision (carry set)
        }

        if (!sub_67A3(si)) {
            return 0;  // Collision (carry set)
        }
    }

    // All checks passed - actually move hero LEFT
    hero_moves_left();

    return 1;  // Success (carry clear)
}

/**
 * sub_6824 - Toggle direction
 * Port of Fight.asm 0x6824
 */
static void sub_6824(void) {
    SaveData* save = get_save_data();
    save->starting_direction ^= 1;
    
    if (get_on_rope_flags() != 0) {
        return;
    }
    
    save->byte_E7 = 0x80;
}

/**
 * left_up_pressed - Handle left+up diagonal (jump left)
 * Port of Fight.asm 0x6634
 */
static void left_up_pressed(void) {
    byte_9F0B = 0xFF;
    sub_6545();
    
    // Fall through to loc_663E
    loc_663E();
}

/**
 * right_up_pressed - Handle right+up diagonal (jump right)
 * Port of Fight.asm 0x67BC
 */
static void right_up_pressed(void) {
    byte_9F0B = 0xFF;
    sub_6545();
    
    // Fall through to loc_67C6
    loc_67C6();
}

/**
 * loc_663E - Hero moves LEFT (called when LEFT arrow is pressed)
 * Port of Fight.asm 0x663E
 */
static void loc_663E(void) {
    byte_9F18 = 0;

    SaveData* save = get_save_data();

    // Check direction - if facing right (bit 0 set), need to turn around
    if (save->starting_direction & 1) {
        sub_6824();
        return;
    }

    // Facing left - check collision and move left
    // Check byte_FF38
    if (byte_FF38 != 0) {
        return;
    }

    // Check byte_FF42
    if (byte_FF42 == 1) {
        loc_6837();
        return;
    }

    // Check collision for LEFT movement
    if (!sub_66A5_wrapper()) {
        loc_6837();
        return;
    }

    byte_9F22 = 2;  // Moving left (matches assembly)

    // Check on_rope_flags
    if (get_on_rope_flags() != 0) {
        return;
    }

    // Check slippery
    if (!set_zero_flag_if_slippery()) {
        if (byte_9F20 == 0) {
            byte_9F23 = 1;
            byte_9F21++;
        }
    }

    save->starting_direction |= 2;

    // Check jump_phase_flags
    if (get_jump_phase_flags() != 0) {
        return;
    }

    save->byte_E7++;
    save->byte_E7 &= 0x7F;
    byte_9F19 = 0;
}

/**
 * loc_67C6 - Hero moves RIGHT (called when RIGHT arrow is pressed)
 * Port of Fight.asm 0x67C6
 */
static void loc_67C6(void) {
    byte_9F18 = 0;

    SaveData* save = get_save_data();

    // Check direction - if facing left (bit 0 clear), need to turn around
    if (!(save->starting_direction & 1)) {
        sub_6824();
        return;
    }

    // Facing right - check collision and move right
    // Check byte_FF38
    if (byte_FF38 != 0) {
        return;
    }

    // Check byte_FF42
    if (byte_FF42 == 2) {
        loc_6837();
        return;
    }

    // Call sub_684C for RIGHT movement
    if (sub_684C() < 0) {
        loc_6837();
        return;
    }

    byte_9F22 = 1;  // Moving right (matches assembly)

    // Check on_rope_flags
    if (get_on_rope_flags() != 0) {
        return;
    }

    // Check slippery
    if (!set_zero_flag_if_slippery()) {
        if (byte_9F20 == 0) {
            byte_9F23 = 0;
            byte_9F21++;
        }
    }

    save->starting_direction |= 2;

    // Check jump_phase_flags
    if (get_jump_phase_flags() != 0) {
        return;
    }

    save->byte_E7++;
    save->byte_E7 &= 0x7F;
    byte_9F19 = 0;
}

/**
 * state_machine_dispatcher - Main input dispatcher
 * Port of Fight.asm 0x6343
 */
void state_machine_dispatcher(void) {
    byte_9F22 = 0;

    // Get input from WASM input buffer (instead of int 61h)
    uint8_t al = input_get_current_keys();

    uint8_t on_rope = get_on_rope_flags();
    uint8_t jump_flags = get_jump_phase_flags();
    SaveData* save = get_save_data();
    uint8_t starting_dir = save->starting_direction;
    uint8_t squat_bit = starting_dir & 0x10;

    // Check for left+up (101b = 5)
    if (al == (INPUT_LEFT_MASK | INPUT_UP_MASK)) {
        left_up_pressed();
        return;
    }

    // Check for right+up (1001b = 9)
    if (al == (INPUT_RIGHT_MASK | INPUT_UP_MASK)) {
        right_up_pressed();
        return;
    }

    // Check for up only (1)
    if (al == INPUT_UP_MASK) {
        up_pressed();
        return;
    }

    // Save input state
    uint8_t ah = al;

    // Check if on rope or jumping
    if (on_rope != 0) {
        goto loc_6399;
    }

    if (jump_flags == 0) {
        // Hero is on ground - process normal movement
        goto loc_6399;
    }

    // Hero is jumping - check for direction change lock
    if (byte_9F0B != 0) {
        goto loc_65BA;
    }

    // Clear byte_9F0B
    byte_9F0B = 0;

    // Check squat mode bit (special squat state)
    if (!squat_bit) {
        // Not in squat mode - process normal movement
        goto loc_6399;
    }

    // In squat mode - check direction
    if (starting_dir & 1) {
        loc_663E();
    } else {
        loc_67C6();
    }
    return;

loc_6399:
    // Push ax
    al = starting_dir & 1;

    if (al != byte_9F24) {
        byte_9F24 = al;
        sub_6508();
    }

    // Pop ax
    al = ah;

    // Push ax
    if (al == INPUT_DOWN_MASK) {
        down_pressed();
    }

    // Pop ax
    al &= 0x0C;

    if (al == INPUT_LEFT_MASK) {
        loc_663E();
        return;
    }

    if (al == INPUT_RIGHT_MASK) {
        loc_67C6();
        return;
    }

    // No direction input
    sub_6508();

    al = get_on_rope_flags();
    al |= byte_FF38;

    if (al != 0) {
        return;
    }

    save->byte_E7 = 0x80;
    return;

loc_65BA:
    // Jump/rope transition handling
    // Stub for now
    return;
}

// Export debug function
uint8_t get_debug_input_received(void) {
    return debug_input_received;
}

// ============================================================================
// Public API
// ============================================================================


/**
 * Initialize hero movement state
 */
void hero_movement_init(void) {
    SaveData* save = get_save_data();
    
    // Clear all state variables
    byte_9F09 = 0;
    byte_9F0A = 0;
    byte_9F0B = 0;
    byte_9F0C = 0;
    byte_9F18 = 0;
    byte_9F19 = 0;
    byte_9F20 = 0;
    byte_9F21 = 0;
    byte_9F22 = 0;
    byte_9F23 = 0;
    byte_9F24 = 0;
    byte_FF38 = 0;
    byte_FF42 = 0;
    danger_type = 0;
    save->byte_E7 = 0;
    
    // Initialize direction from save data
    if (save->starting_direction == 0) {
        save->starting_direction = 2;  // Default facing right
    }
}

/**
 * Update hero movement state machine
 * Called every frame - main entry point
 */
void hero_movement_update(void) {
    // Call the state machine dispatcher
    state_machine_dispatcher();
    
    // Update physics
    sub_64BB();  // Jump physics
    sub_6DB1();  // Rope physics
    
    // Process movement timers
    if (byte_9F20 > 0) {
        byte_9F20--;
    }
}

/**
 * Get current hero direction
 * @return starting_direction value (bit 0: 0=left, 1=right; bit 1: set when moving)
 */
int hero_get_direction(void) {
    SaveData* save = get_save_data();
    return save->starting_direction;
}

/**
 * Set hero direction
 * @param direction 1=right, -1=left
 */
void hero_set_direction(int direction) {
    SaveData* save = get_save_data();
    
    if (direction > 0) {
        save->starting_direction |= 1;
    } else {
        save->starting_direction &= ~1;
    }
}

/**
 * Get current hero state
 * @return Hero state enum value
 */
int hero_get_state(void) {
    if (get_jump_phase_flags() != 0) {
        return 2;  // Jumping
    }
    if (get_on_rope_flags() != 0) {
        return 3;  // Climbing
    }
    if (byte_9F18 != 0) {
        return 4;  // Squatting
    }
    if (byte_9F20 != 0 || byte_9F21 != 0) {
        return 1;  // Walking
    }
    return 0;  // Idle
}

/**
 * Check if hero is moving
 * @return 1 if moving, 0 if idle
 */
int hero_is_moving(void) {
    return (byte_9F20 != 0 || byte_9F21 != 0 || byte_9F22 != 0);
}

/**
 * Check if hero can change direction
 * @return 1 if can change, 0 if in turn delay
 */
int hero_can_change_direction(void) {
    return (byte_9F20 == 0 && byte_9F0B == 0);
}

/**
 * Force hero state (for debugging/testing)
 * @param state New state to set
 */
void hero_set_state(int state) {
    (void)state;
    // Stub - direct state setting not supported in exact port
}
