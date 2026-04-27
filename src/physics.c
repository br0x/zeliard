// physics.c - Hero physics (jump, rope)
// Port of Fight.asm sub_64BB (jump physics), sub_6DB1 (rope physics), and related functions

#include "zeliard.h"

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// ============================================================================
// Physics State Variables (from 0x9F20 region and 0xFF00 region)
// ============================================================================

// Jump state flags (byte_9F20 region)
// These control jump trajectory and state
static uint8_t byte_9F20 = 0;  // Jump timer/counter
static uint8_t byte_9F21 = 0;  // Jump state modifier
static uint8_t byte_9F22 = 0;  // Jump phase selector
static uint8_t byte_9F23 = 0;  // Jump flags

// Jump phase flags (from 0xFF00 region)
// 0x00 = on ground
// 0xFF = ascending (jumping up)
// 0x7F = descending (falling down)
// 0x80 = climbing down off rope
static uint8_t jump_phase_flags = 0;

// On rope flags (from 0xFF00 region)
// 0x00 = on ground
// 0xFF = on rope
// 0x80 = transition from rope to ground
static uint8_t on_rope_flags = 0;

// ============================================================================
// Constants
// ============================================================================

#define PROXIMITY_MAP_WIDTH  36
#define PROXIMITY_MAP_HEIGHT 64

// Tile types
#define TILE_EMPTY          0x00
#define TILE_ROPE           0x01
#define TILE_WATER          0x02
#define TILE_LADDER         0x08

// Jump states
#define JUMP_ON_GROUND      0x00
#define JUMP_ASCENDING      0xFF
#define JUMP_DESCENDING     0x7F
#define JUMP_CLIMB_DOWN     0x80

// Rope states
#define ROPE_ON_GROUND      0x00
#define ROPE_ON_ROPE        0xFF
#define ROPE_TRANSITION     0x80

// ============================================================================
// Forward Declarations
// ============================================================================

static void check_grab_rope(void);
static void process_rope_climb(void);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get hero position in proximity map
 * Returns offset in proximity map buffer
 */
static uint16_t hero_coords_to_addr_in_proximity(void) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    // hero_head_y_in_viewport = height above ground
    // hero_x_in_viewport = X position in viewport
    uint8_t y = save->hero_head_y_in_viewport;
    uint8_t x = save->hero_x_in_viewport;
    
    // Calculate offset: (y * 36) + x + 4 (viewport offset)
    uint16_t offset = (y * PROXIMITY_MAP_WIDTH) + x + 4;
    
    // Wrap if needed
    if (offset >= 0xE900) {
        offset -= 0x900;
    }
    
    return offset;
}

/**
 * Check if current tile is slippery (ice, etc.)
 * Returns 1 (ZF=0) if slippery, 0 (ZF=1) if not slippery
 * 
 * Port of Fight.asm set_zero_flag_if_slippery
 */
int set_zero_flag_if_slippery(void) {
    // Check if hero has Ruzeria Shoes (anti-ice accessory)
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    if (save->Ruzeria_Shoes == ACCESSORY_RUZERIA_SHOES) {
        // Has Ruzeria Shoes - not slippery
        return 0;  // ZF set (not slippery)
    }
    
    // Check current tile for ice/slippery properties
    uint16_t offset = hero_coords_to_addr_in_proximity();
    uint8_t tile = g_memory[MEM_PROXIMITY_MAP + offset];
    
    // Ice tiles are typically in a specific range
    // For now, check if tile is in slippery category
    // (This may need adjustment based on actual tile definitions)
    if (tile >= 0x40 && tile < 0x50) {
        // Potentially slippery tile
        return 1;  // ZF clear (slippery)
    }
    
    return 0;  // ZF set (not slippery)
}

/**
 * Check if hero is over a rope tile
 * Sets CF if current position is rope (tiles 0x00 or 0x01)
 * 
 * Port of Fight.asm is_over_rope (0x6BBD)
 * 
 * Logic from assembly:
 *   mov al, [si]      ; get tile
 *   dec al            ; al = tile - 1
 *   cmp al, 2         ; compare with 2
 *   ; CF set if tile-1 < 2, i.e., tile is 0 or 1
 */
int is_over_rope(void) {
    uint16_t offset = hero_coords_to_addr_in_proximity();
    uint8_t tile = g_memory[MEM_PROXIMITY_MAP + offset];
    
    // Check if tile is 0 or 1 (rope/empty)
    // Assembly does: dec al; cmp al, 2; sets CF if al < 2
    // This means CF set (return 1) if tile is 0 or 1
    if (tile <= 1) {
        return 1;  // CF set - over rope
    }
    
    return 0;  // CF clear - not over rope
}

/**
 * Check if a specific tile is a rope tile
 * @param tile Tile value to check
 * @return 1 if rope, 0 if not
 */
int is_rope_tile(uint8_t tile) {
    return (tile == TILE_ROPE);
}

/**
 * Check if a specific tile is a ladder tile
 * @param tile Tile value to check
 * @return 1 if ladder, 0 if not
 */
int is_ladder_tile(uint8_t tile) {
    return (tile == TILE_LADDER);
}

/**
 * Check if tile is passable for walking
 * @param tile Tile value to check
 * @return 1 if passable, 0 if not
 */
int is_walkable_tile(uint8_t tile) {
    // Use the collision system's passability check
    return if_passable_set_ZF(tile);
}

// ============================================================================
// Jump Physics
// ============================================================================

/**
 * Update jump state and trajectory
 * Port of Fight.asm sub_64BB (0x64BB)
 * 
 * Jump phase flags:
 * - 0x00: On ground
 * - 0xFF: Ascending (jumping up)
 * - 0x7F: Descending (falling down)
 * - 0x80: Climbing down off rope
 * 
 * This function:
 * 1. Checks if on slippery surface (returns early if so)
 * 2. Checks if already in jump state (returns early if so)
 * 3. Checks byte_9F20 for special states
 * 4. Updates jump trajectory based on phase
 */
void sub_64BB(void) {
    // Check if on slippery surface
    if (set_zero_flag_if_slippery()) {
        return;  // On slippery surface, don't process jump
    }
    
    // Check if already in jump state
    if (jump_phase_flags != JUMP_ON_GROUND) {
        return;  // Already jumping/falling
    }
    
    // Check byte_9F20 for special states
    if (byte_9F20 == 0) {
        return;  // No jump pending
    }
    
    // Decrement jump timer
    byte_9F20--;
    
    // Check tile above hero for obstacles
    uint16_t offset = hero_coords_to_addr_in_proximity();
    
    // Check tile above (offset + 0x6D = 109 bytes = ~3 rows up)
    uint16_t above_offset = offset + 0x6D;
    if (above_offset >= 0x0900) {
        above_offset -= 0x900;
    }
    
    uint8_t tile_above = g_memory[MEM_PROXIMITY_MAP + above_offset];
    
    // Check if tile is in range 0x40-0x48 (obstacle tiles)
    if (tile_above >= 0x40 && tile_above <= 0x48) {
        // Hit ceiling - cancel jump
        byte_9F20 = 0;
        return;
    }
    
    // Process jump based on phase selector
    uint8_t phase = byte_9F22;
    
    if (byte_9F23 & 0x01) {
        // Special jump mode
        if (phase == 1) {
            return;  // Special handling
        }
        // Fall through to sub_684C (very important proc - hero state machine)
        // This is a complex routine that handles hero state transitions
        (void)sub_684C();  // Return value ignored in this context
        return;
    }
    
    if (phase == 2) {
        // Another special mode
        return;
    }
    
    // Default: process normal jump via sub_66A5
    sub_66A5();
}

/**
 * Initialize jump
 * Sets jump_phase_flags to ascending state
 */
void start_jump(void) {
    // Can only jump if on ground
    if (jump_phase_flags != JUMP_ON_GROUND) {
        return;
    }
    
    // Check if on rope - can't jump while on rope
    if (on_rope_flags == ROPE_ON_ROPE) {
        return;
    }
    
    // Set jump state to ascending
    jump_phase_flags = JUMP_ASCENDING;
    
    // Initialize jump timer
    byte_9F20 = 10;  // Jump duration
    byte_9F21 = 0;
    byte_9F22 = 2;   // Normal jump phase
    byte_9F23 = 0;
}

/**
 * Update jump trajectory
 * Called each frame while jumping
 */
void update_jump_trajectory(void) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    if (jump_phase_flags == JUMP_ASCENDING) {
        // Moving up - decrease height
        if (save->hero_head_y_in_viewport > 0) {
            save->hero_head_y_in_viewport--;
        } else {
            // Reached peak - start descending
            jump_phase_flags = JUMP_DESCENDING;
        }
    } else if (jump_phase_flags == JUMP_DESCENDING) {
        // Moving down - increase height
        if (save->hero_head_y_in_viewport < 10) {
            save->hero_head_y_in_viewport++;
        } else {
            // Landed
            jump_phase_flags = JUMP_ON_GROUND;
            save->hero_head_y_in_viewport = 10;  // Reset to ground level
        }
    }
}

// ============================================================================
// Rope Physics
// ============================================================================

/**
 * Update rope position and state
 * Port of Fight.asm sub_6DB1 (rope physics)
 * 
 * This function handles:
 * - Climbing up/down ropes
 * - Transitioning between rope and ground
 * - Hanging from ropes
 */
void sub_6DB1(void) {
    // Check if on slippery surface
    if (set_zero_flag_if_slippery()) {
        return;  // Can't climb on slippery surfaces
    }
    
    // Check if already in jump state
    if (byte_9F20 != 0) {
        return;  // Can't climb while jumping
    }
    
    // Check if on rope
    if (on_rope_flags != ROPE_ON_GROUND) {
        // Already on rope - process climbing
        process_rope_climb();
        return;
    }
    
    // Check if standing over rope
    if (is_over_rope()) {
        // Check if down pressed to start climbing
        // (Input handling would set a flag here)
        // For now, just check if we should grab the rope
        check_grab_rope();
    }
}

/**
 * Check if hero should grab the rope
 * Called when standing over rope tile
 */
static void check_grab_rope(void) {
    // Check if down input is pressed
    // This would be set by input handling system
    // For now, stub - actual implementation depends on input system
    
    // If down pressed and over rope:
    // on_rope_flags = ROPE_ON_ROPE;
    // Start climbing animation
}

/**
 * Process rope climbing
 * Called when hero is on rope
 */
static void process_rope_climb(void) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    // Check rope state
    if (on_rope_flags == ROPE_TRANSITION) {
        // Transitioning from rope to ground
        // Check if transition complete
        if (save->hero_head_y_in_viewport >= 10) {
            // Reached ground
            on_rope_flags = ROPE_ON_GROUND;
            save->hero_head_y_in_viewport = 10;
            return;
        }
        
        // Continue descending
        save->hero_head_y_in_viewport++;
        return;
    }
    
    // On rope - process climbing
    // Check if at bottom of rope
    uint16_t offset = hero_coords_to_addr_in_proximity();
    uint16_t below_offset = offset + PROXIMITY_MAP_WIDTH;
    if (below_offset >= 0x0900) {
        below_offset -= 0x900;
    }
    
    uint8_t tile_below = g_memory[MEM_PROXIMITY_MAP + below_offset];
    
    // Check if ground below
    if (!is_rope_tile(tile_below) && !is_ladder_tile(tile_below)) {
        // Ground below - can drop down
        // Check if down input pressed
        // If so, start transition to ground
        on_rope_flags = ROPE_TRANSITION;
        return;
    }
    
    // Process up/down climbing
    // (Input handling would control this)
}

/**
 * Start climbing rope
 * Called when hero grabs a rope
 */
void start_climb_rope(void) {
    if (on_rope_flags != ROPE_ON_GROUND) {
        return;  // Already on rope
    }
    
    if (!is_over_rope()) {
        return;  // Not over rope
    }
    
    // Grab rope
    on_rope_flags = ROPE_ON_ROPE;
    
    // Adjust hero position to align with rope
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    save->hero_head_y_in_viewport = 10;  // Start at bottom
}

/**
 * Climb up on rope
 */
void climb_up_rope(void) {
    if (on_rope_flags != ROPE_ON_ROPE) {
        return;
    }
    
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    // Check if can climb higher
    if (save->hero_head_y_in_viewport > 0) {
        save->hero_head_y_in_viewport--;
    }
}

/**
 * Climb down on rope
 */
void climb_down_rope(void) {
    if (on_rope_flags != ROPE_ON_ROPE) {
        return;
    }
    
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    // Check if at bottom
    if (save->hero_head_y_in_viewport < 10) {
        save->hero_head_y_in_viewport++;
    } else {
        // At bottom - start transition to ground
        on_rope_flags = ROPE_TRANSITION;
    }
}

// ============================================================================
// Physics State Management
// ============================================================================

/**
 * Initialize physics state
 * Called when entering dungeon or respawning
 */
void physics_init(void) {
    // Reset all physics state
    byte_9F20 = 0;
    byte_9F21 = 0;
    byte_9F22 = 0;
    byte_9F23 = 0;
    jump_phase_flags = JUMP_ON_GROUND;
    on_rope_flags = ROPE_ON_GROUND;
    
    // Set hero to ground level
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    save->hero_head_y_in_viewport = 10;  // Ground level
}

/**
 * Update physics state
 * Called each game frame
 */
void physics_update(void) {
    // Update jump physics
    sub_64BB();
    
    // Update rope physics
    sub_6DB1();
    
    // Update jump trajectory if in air
    if (jump_phase_flags != JUMP_ON_GROUND) {
        update_jump_trajectory();
    }
}

// ============================================================================
// State Accessors
// ============================================================================

/**
 * Get jump phase flags
 * @return Current jump state
 */
uint8_t get_jump_phase_flags(void) {
    return jump_phase_flags;
}

/**
 * Set jump phase flags
 * @param flags New jump state
 */
void set_jump_phase_flags(uint8_t flags) {
    jump_phase_flags = flags;
}

/**
 * Get on rope flags
 * @return Current rope state
 */
uint8_t get_on_rope_flags(void) {
    return on_rope_flags;
}

/**
 * Set on rope flags
 * @param flags New rope state
 */
void set_on_rope_flags(uint8_t flags) {
    on_rope_flags = flags;
}

/**
 * Check if hero is on ground
 * @return 1 if on ground, 0 if in air or on rope
 */
int is_on_ground(void) {
    return (jump_phase_flags == JUMP_ON_GROUND) && (on_rope_flags == ROPE_ON_GROUND);
}

/**
 * Check if hero is in jump state
 * @return 1 if jumping/falling, 0 if on ground
 */
int is_jumping(void) {
    return (jump_phase_flags != JUMP_ON_GROUND);
}

/**
 * Check if hero is on rope
 * @return 1 if on rope, 0 if on ground
 */
int is_on_rope(void) {
    return (on_rope_flags != ROPE_ON_GROUND);
}

// ============================================================================
// Additional Physics Functions (stubs for complex routines)
// ============================================================================

/**
 * Jump trajectory calculation - variant
 * Port of Fight.asm sub_66A5
 * 
 * Alternative jump calculation routine
 * Implementation in hero_movement.c
 */
