#include <stdint.h>
#include <string.h>

#include "zeliard.h"
#include "dungeon.h"

#define MEM8(addr)   (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)  (*(uint16_t *)&g_mem[(addr) & 0xFFFF])

#define ADDR_HERO_PROX_LEFT      0x0080u
#define ADDR_PROXIMITY_MAP_LEFT_COL  0x80u

#define ADDR_HERO_Y              0x0082u
#define ADDR_HERO_X_VIEW         0x0083u
#define ADDR_HERO_HEAD_Y_VIEW    0x0084u
#define ADDR_SWORD_TYPE          0x0092u
#define ADDR_SHIELD_TYPE         0x0093u
#define ADDR_FACING              0x00C2u
#define ADDR_PLACE_MAP_ID        0x00C4u
#define ADDR_HERO_ANIM_PHASE     0x00E7u

#define ADDR_HERO_X_IN_PROXIMITY_MAP 0x9F1Au // word

// MDT layout
#define ADDR_MDT                 0xC000u
#define ADDR_MDT_DESCRIPTOR      0xC000u
#define ADDR_MAP_WIDTH           0xC002u
#define ADDR_VERTICAL_PLATFORMS_TABLE 0xC004u
#define ADDR_COLLAPSING_PLATFORMS_TABLE 0xC006u
#define ADDR_HORIZ_PLATFORMS_TABLE 0xC008u
#define ADDR_DOORS_TABLE         0xC00Au
#define ADDR_ACHIEVEMENTS_TABLE  0xC00Cu
#define ADDR_CAVERN_NAME_INFO    0xC00Eu
#define ADDR_MONSTERS_TABLE      0xC010u
#define ADDR_CAVERN_LEVEL        0xC012u
#define ADDR_TEAR_X              0xC013u
#define ADDR_TEAR_Y              0xC015u
#define ADDR_HERO_HEAD_Y_IN_VIEWPORT_INITIAL_FROM_MDT 0xC016u
#define ADDR_CAVERN_SIGNS_INFO   0xC017u
#define ADDR_PACKED_MAP_END_PTR  0xC019u
#define ADDR_PACKED_MAP_START    0xC01Bu

// Dungeon rendering buffers
#define ADDR_PROXIMITY           0xE000u          // 36*64 bytes
#define ADDR_VIEWPORT_ENTITIES   0xE900u

#define ADDR_INPUT_ALT_SPACE     0xFF16u
#define ADDR_INPUT_DIRS          0xFF17u  // ____right_left_down_up
#define ADDR_ENTER_KEYS          0xFF18u

#define DUNGEON_FULL_MAP_ADDR    0x30000u         // full map buffer
#define PROX_COLS                36
#define DUNGEON_HEIGHT           64
#define VIEW_COLS_DUNGEON        28
#define VIEW_ROWS_DUNGEON        18
#define HERO_VIEW_COL            14               // hero x in viewport (columns)
#define HERO_PROX_COL            18               // hero x in proximity (columns)

// Input / frame
#define ADDR_FRAME_TIMER         0xFF1Au
#define ADDR_SPACEBAR_LATCH      0xFF1Du
#define ADDR_SOUND_FX_REQUEST    0xFF75u

#define ADDR_DUNGEON_VIEW_TOP    0xFFE0u
#define ADDR_DUNGEON_ACTIVE      0xFFE1u
#define ADDR_DUNGEON_EXIT_FLAG   0xFFE2u
#define ADDR_DUNGEON_EXIT_MAP    0xFFE3u
#define ADDR_DUNGEON_SWING_TMR   0xFFE4u
#define ADDR_DUNGEON_SWING_FRAME 0xFFE5u

#define ADDR_PENDING_DUNGEON_MAP  0xFFFCu
#define ADDR_PENDING_DUNGEON_FLAG 0xFFFDu
#define MAX_MDT_BYTES            0x4000u

#define ADDR_CURRENT_ACCESSORY        0x009Eu
#define ADDR_INVINCIBILITY_FLAG       0x00E8u
#define ADDR_BOSS_CAVERN_SPECIAL      0x9F01u
#define ADDR_PACKED_MAP_PTR_MINUS     0x9F04u  // word: packed_map_ptr_for_hero_x_minus_18
#define ADDR_PACKED_MAP_PTR_PLUS      0x9F06u  // word: packed_map_ptr_for_hero_x_plus_18
#define ADDR_JUMP_HEIGHT_COUNTER      0x9F08u
#define ADDR_BYTE_9F09                0x9F09u  // vertical scroll offset
#define ADDR_HEIGHT_ABOVE_GROUND      0x9F0Cu
#define ADDR_FERUZA_SHOES_FOUR_TWO    0x9F0Du  // normally 2, Feruza shoes set to 4
#define ADDR_KNOCKBACK_VECTOR_X       0x9F0Eu  // word
#define ADDR_KNOCKBACK_VECTOR_Y       0x9F10u  // word
#define ADDR_HIT_THIS_FRAME           0x9F14u
#define ADDR_AIR_UP_TILE_FOUND        0x9F15u
#define ADDR_SLIDE_TICKS_REMAINING    0x9F20u
#define ADDR_HORIZ_MOVEMENT_ACCUM     0x9F21u
#define ADDR_SLIDE_DIRECTION          0x9F22u  // 1=right, 2=left
#define ADDR_SLIDE_DIRECTION_LOCK     0x9F23u  // 1=right movement
#define ADDR_CAVERN_LEVEL             0xC012u
#define ADDR_VIEWPORT_LEFT_TOP_ADDR   0xFF31u  // word: address in proximity map for top-left of viewport
#define ADDR_JUMP_PHASE_FLAGS         0xFF3Du
#define ADDR_ON_ROPE_FLAGS            0xFF39u
#define ADDR_SQUAT_FLAG               0xFF38u
#define ADDR_SLOPE_DIRECTION          0xFF42u  // 1=right, 2=left
#define ADDR_TICK_COUNTER             0xFF50u

// Constants
#define SLOPE_NONE  0
#define SLOPE_RIGHT 1
#define SLOPE_LEFT  2
#define ROPE_TILE_1 1
#define ROPE_TILE_2 2
#define LEFT_SLOPE_TILE  11
#define RIGHT_SLOPE_TILE 12
#define ICE_TILE_START   0x40
#define ICE_TILE_END     0x48
#define SHOES_FERUZA        1
#define SHOES_RUZERIA       4


struct DungeonMonster {
    uint16_t curr_x;
    uint8_t curr_y;
    uint8_t x_rel;
    uint8_t flags;
    uint8_t ai_flags;
    uint8_t anim_counter;
    uint8_t state_flags;
    uint8_t hp;
    uint8_t ai_state;
    uint8_t ai_timer;
    uint16_t spawn_x;
    uint8_t spawn_y;
    uint8_t type;
    uint8_t counter;
};

static uint16_t dungeon_map_width;
static uint16_t dungeon_entity_count;

static uint16_t ptr_to_off(uint16_t ptr)
{
    return ptr >= ADDR_MDT ? (uint16_t)(ptr - ADDR_MDT) : ptr;
}


// Helper: get address in proximity map for world coordinates
static uint16_t world_to_proximity_addr(uint16_t x, uint8_t y) {
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t col = (x - left + PROX_COLS) % PROX_COLS;
    return ADDR_PROXIMITY + col * DUNGEON_HEIGHT + y;
}

// Helper: check if a tile is a rope (ID 1 or 2)
static int is_rope_tile(uint8_t tile) {
    return tile == ROPE_TILE_1 || tile == ROPE_TILE_2;
}

// Helper: check if tile is a slope and return direction
static int get_slope_direction(uint8_t tile) {
    if (tile == LEFT_SLOPE_TILE) return SLOPE_LEFT;
    if (tile == RIGHT_SLOPE_TILE) return SLOPE_RIGHT;
    return SLOPE_NONE;
}

// Helper: check if tile is ice (for sliding)
static int is_ice_tile(uint8_t tile) {
    return tile >= ICE_TILE_START && tile <= ICE_TILE_END;
}

// Helper: get tile type from proximity map (including monster bit)
static uint8_t get_proximity_tile(uint16_t world_x, uint8_t world_y) {
    uint16_t addr = world_to_proximity_addr(world_x, world_y);
    return MEM8(addr);
}

// Helper: check if a monster occupies a given world tile
static int is_monster_at(uint16_t world_x, uint8_t world_y) {
    uint8_t tile = get_proximity_tile(world_x, world_y);
    return (tile & 0x80) != 0;
}

// Helper: get the airflow direction for a tile (used in wind caverns)
// Returns 0=up,1=left,2=right, 0xFF=none
static uint8_t get_airflow_direction(uint8_t tile) {
    // This would need actual mapping from tile IDs to airflow.
    // For now, stub – will be filled later from original data.
    // In original, it reads from a table at seg1:8010h.
    // We'll return 0xFF (no airflow) as placeholder.
    return 0xFF;
}

// ----------------------------------------------------------------------
// Move left (scroll map right) with obstacle checks
// Returns 1 if movement succeeded, 0 if blocked.
// ----------------------------------------------------------------------
static int try_move_left(void) {
    uint16_t hero_x = hero_abs_x();
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);

    // Compute the new left column after moving left
    uint16_t new_left = left - 1;
    if (new_left >= map_width) new_left = map_width - 1;   // wrap around

    // World X coordinate of the column that will be just to the left of hero
    uint16_t check_x = (hero_x - 1 + map_width) % map_width;

    // Check the 4 tiles (rows hero_y-1 .. hero_y+2) at check_x for obstacles
    for (int i = 0; i < 4; i++) {
        int8_t y_off = i - 1;   // -1,0,1,2
        uint8_t check_y = hero_y + y_off;
        if (check_y >= DUNGEON_HEIGHT) continue;

        if (is_monster_at(check_x, check_y)) return 0;
        uint8_t tile = get_tile_at(check_x, check_y);
        if (!is_passable_tile(tile)) return 0;
        if (MEM8(ADDR_CAVERN_LEVEL) != 7) {
            uint8_t airflow = get_airflow_direction(tile);
            if (airflow == 2) return 0;   // right‑flow wind blocks left movement
        }
    }

    // If not squatting, also check the tile where the hero's head will be
    uint8_t squat = MEM8(ADDR_SQUAT_FLAG);
    if (!squat) {
        uint8_t tile = get_tile_at(check_x, hero_y);
        if (!is_passable_tile(tile)) return 0;
        if (MEM8(ADDR_CAVERN_LEVEL) != 7 && get_airflow_direction(tile) == 2) return 0;
    } else {
        // Squatting: check two tiles below the head
        for (int i = 0; i < 2; i++) {
            uint8_t tile = get_tile_at(check_x, hero_y + 1 + i);
            if (!is_passable_tile(tile)) return 0;
            if (MEM8(ADDR_CAVERN_LEVEL) != 7 && get_airflow_direction(tile) == 2) return 0;
        }
    }

    // Perform scroll
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = new_left;
    proximity_scroll_right(new_left);   // shift map right, fill new leftmost column
    // Hero's viewport X stays the same (centered)
    MEM8(ADDR_FACING) = 1;              // face left
    // Update absolute X (hero_abs_x = new_left + HERO_PROX_COL)
    set_hero_abs_x((new_left + HERO_PROX_COL) % map_width);
    return 1;
}

static int try_move_right(void) {
    uint16_t hero_x = hero_abs_x();
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);

    uint16_t new_left = left + 1;
    if (new_left >= map_width) new_left = 0;   // wrap around

    uint16_t check_x = (hero_x + 1) % map_width;

    // Check the 4 tiles to the right (rows hero_y-1 .. hero_y+2)
    for (int i = 0; i < 4; i++) {
        int8_t y_off = i - 1;
        uint8_t check_y = hero_y + y_off;
        if (check_y >= DUNGEON_HEIGHT) continue;

        if (is_monster_at(check_x, check_y)) return 0;
        uint8_t tile = get_tile_at(check_x, check_y);
        if (!is_passable_tile(tile)) return 0;
        if (MEM8(ADDR_CAVERN_LEVEL) != 7) {
            uint8_t airflow = get_airflow_direction(tile);
            if (airflow == 1) return 0;   // left‑flow wind blocks right movement
        }
    }

    uint8_t squat = MEM8(ADDR_SQUAT_FLAG);
    if (!squat) {
        uint8_t tile = get_tile_at(check_x, hero_y);
        if (!is_passable_tile(tile)) return 0;
        if (MEM8(ADDR_CAVERN_LEVEL) != 7 && get_airflow_direction(tile) == 1) return 0;
    } else {
        for (int i = 0; i < 2; i++) {
            uint8_t tile = get_tile_at(check_x, hero_y + 1 + i);
            if (!is_passable_tile(tile)) return 0;
            if (MEM8(ADDR_CAVERN_LEVEL) != 7 && get_airflow_direction(tile) == 1) return 0;
        }
    }

    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = new_left;
    proximity_scroll_left((new_left + PROX_COLS - 1) % map_width); // rightmost column
    MEM8(ADDR_FACING) = 0;
    set_hero_abs_x((new_left + HERO_PROX_COL) % map_width);
    return 1;
}

// ----------------------------------------------------------------------
// Up movement (jump, rope climb, or move up when not jumping)
// ----------------------------------------------------------------------
static void try_move_up(void) {
    uint16_t hero_x = hero_abs_x();
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    if (hero_y == 0) return;
    if (dungeon_can_stand_at(hero_x, hero_y - 1)) {
        MEM8(ADDR_HERO_Y) = hero_y - 1;
        // Adjust viewport if near top
        update_view_top();
    }
}

static void try_move_down(void) {
    uint16_t hero_x = hero_abs_x();
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    if (hero_y >= DUNGEON_HEIGHT - 1) return;
    if (dungeon_can_stand_at(hero_x, hero_y + 1)) {
        MEM8(ADDR_HERO_Y) = hero_y + 1;
        update_view_top();
    }
}

// ----------------------------------------------------------------------
// Jumping and airborne physics
// ----------------------------------------------------------------------
static void start_jump(void) {
    uint8_t feruza = (MEM8(ADDR_CURRENT_ACCESSORY) == SHOES_FERUZA) ? 4 : 2;
    MEM8(ADDR_FERUZA_SHOES_FOUR_TWO) = feruza;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0xFF;  // ascending
    MEM8(ADDR_HEIGHT_ABOVE_GROUND) = feruza >> 1;  // 2 or 1
    MEM8(ADDR_JUMP_HEIGHT_COUNTER) = 0;
    MEM8(ADDR_SQUAT_FLAG) = 0;
    // Move hero up one pixel if head not at top
    if (MEM8(ADDR_HERO_HEAD_Y_VIEW) > 0) {
        MEM8(ADDR_HERO_HEAD_Y_VIEW)--;
    } else {
        // scroll viewport up
        uint8_t top = MEM8(ADDR_DUNGEON_VIEW_TOP);
        if (top > 0) {
            MEM8(ADDR_DUNGEON_VIEW_TOP) = top - 1;
            MEM8(ADDR_HERO_HEAD_Y_VIEW) = MEM8(ADDR_HERO_Y) - (top - 1);
        }
    }
}

static void update_airborne(void) {
    uint8_t phase = MEM8(ADDR_JUMP_PHASE_FLAGS);
    if (phase == 0) return;  // not airborne

    // Check for landing
    uint16_t x = hero_abs_x();
    uint8_t y = MEM8(ADDR_HERO_Y);
    if (dungeon_can_stand_at(x, y + 1)) {
        // Land
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
        MEM8(ADDR_JUMP_HEIGHT_COUNTER) = 0;
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
        // Small squat on high fall
        if (MEM8(ADDR_HEIGHT_ABOVE_GROUND) >= 2) {
            MEM8(ADDR_SQUAT_FLAG) = 0xFF;
        }
        return;
    }

    // Ascending phase
    if (phase == 0xFF) {
        uint8_t height = MEM8(ADDR_HEIGHT_ABOVE_GROUND);
        if (height > 0) {
            MEM8(ADDR_HEIGHT_ABOVE_GROUND) = height - 1;
            // Move hero up
            if (MEM8(ADDR_HERO_HEAD_Y_VIEW) > 0) {
                MEM8(ADDR_HERO_HEAD_Y_VIEW)--;
            } else {
                uint8_t top = MEM8(ADDR_DUNGEON_VIEW_TOP);
                if (top > 0) {
                    MEM8(ADDR_DUNGEON_VIEW_TOP) = top - 1;
                    MEM8(ADDR_HERO_HEAD_Y_VIEW) = MEM8(ADDR_HERO_Y) - (top - 1);
                }
            }
            // In-air steering (left/right)
            uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
            if (dirs & 0x04) try_move_left();
            else if (dirs & 0x08) try_move_right();
        } else {
            // Switch to descending
            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
        }
    } else if (phase == 0x7F) { // descending
        // Move hero down (gravity)
        if (MEM8(ADDR_HERO_HEAD_Y_VIEW) < VIEW_ROWS_DUNGEON - 1) {
            MEM8(ADDR_HERO_HEAD_Y_VIEW)++;
        } else {
            uint8_t top = MEM8(ADDR_DUNGEON_VIEW_TOP);
            if (top < DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON) {
                MEM8(ADDR_DUNGEON_VIEW_TOP) = top + 1;
                MEM8(ADDR_HERO_HEAD_Y_VIEW) = MEM8(ADDR_HERO_Y) - (top + 1);
            }
        }
        // In-air steering
        uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
        if (dirs & 0x04) try_move_left();
        else if (dirs & 0x08) try_move_right();
    }
}

// ----------------------------------------------------------------------
// Rope climbing
// ----------------------------------------------------------------------
static void try_climb_rope(void) {
    uint16_t x = hero_abs_x();
    uint8_t y = MEM8(ADDR_HERO_Y);
    // Check tile above head
    if (y > 0 && is_rope_tile(get_tile_at(x, y - 1))) {
        MEM8(ADDR_ON_ROPE_FLAGS) = 0xFF;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
        MEM8(ADDR_SQUAT_FLAG) = 0;
        // Climb up one step
        if (MEM8(ADDR_HERO_HEAD_Y_VIEW) > 0) {
            MEM8(ADDR_HERO_HEAD_Y_VIEW)--;
        } else {
            uint8_t top = MEM8(ADDR_DUNGEON_VIEW_TOP);
            if (top > 0) {
                MEM8(ADDR_DUNGEON_VIEW_TOP) = top - 1;
                MEM8(ADDR_HERO_HEAD_Y_VIEW) = MEM8(ADDR_HERO_Y) - (top - 1);
            }
        }
        MEM8(ADDR_HERO_Y) = y - 1;
    }
}

static void update_on_rope(void) {
    uint8_t rope_flags = MEM8(ADDR_ON_ROPE_FLAGS);
    if (rope_flags == 0) return;
    if (rope_flags == 0xFF) {
        // On rope, moving up/down with input
        uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
        if (dirs & 0x01) { // up
            uint16_t x = hero_abs_x();
            uint8_t y = MEM8(ADDR_HERO_Y);
            if (y > 0 && is_rope_tile(get_tile_at(x, y - 1))) {
                MEM8(ADDR_HERO_Y) = y - 1;
                update_view_top();
            }
        } else if (dirs & 0x02) { // down
            uint16_t x = hero_abs_x();
            uint8_t y = MEM8(ADDR_HERO_Y);
            if (y < DUNGEON_HEIGHT - 1 && is_rope_tile(get_tile_at(x, y + 1))) {
                MEM8(ADDR_HERO_Y) = y + 1;
                update_view_top();
            } else {
                // Dismount rope
                MEM8(ADDR_ON_ROPE_FLAGS) = 0x80;  // transition
                MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x80;
            }
        }
    } else if (rope_flags == 0x80) {
        // Transition to ground
        MEM8(ADDR_ON_ROPE_FLAGS) = 0;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    }
}

// ----------------------------------------------------------------------
// Ice sliding
// ----------------------------------------------------------------------
static void update_ice_slide(void) {
    if (MEM8(ADDR_CAVERN_LEVEL) != 4) return;
    if (MEM8(ADDR_CURRENT_ACCESSORY) == SHOES_RUZERIA) return;
    uint8_t slide_ticks = MEM8(ADDR_SLIDE_TICKS_REMAINING);
    if (slide_ticks == 0) return;
    MEM8(ADDR_SLIDE_TICKS_REMAINING) = slide_ticks - 1;

    uint8_t dir = MEM8(ADDR_SLIDE_DIRECTION);
    if (dir == 1) try_move_right();
    else if (dir == 2) try_move_left();

    // Check if still on ice; if not, stop sliding
    uint16_t x = hero_abs_x();
    uint8_t y = MEM8(ADDR_HERO_Y);
    if (!is_ice_tile(get_tile_at(x, y))) {
        MEM8(ADDR_SLIDE_TICKS_REMAINING) = 0;
    }
}

// ----------------------------------------------------------------------
// Slopes
// ----------------------------------------------------------------------
static void update_slope(void) {
    uint8_t slope = MEM8(ADDR_SLOPE_DIRECTION);
    if (slope == SLOPE_NONE) return;
    uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
    // Only slide if not holding opposite direction
    if (slope == SLOPE_RIGHT && !(dirs & 0x08)) {
        try_move_right();
    } else if (slope == SLOPE_LEFT && !(dirs & 0x04)) {
        try_move_left();
    }
}

// ----------------------------------------------------------------------
// Knockback
// ----------------------------------------------------------------------
static void apply_knockback(void) {
    if (MEM8(ADDR_HIT_THIS_FRAME) == 0) return;
    MEM8(ADDR_HIT_THIS_FRAME) = 0;
    int16_t vx = MEM16(ADDR_KNOCKBACK_VECTOR_X);
    int16_t vy = MEM16(ADDR_KNOCKBACK_VECTOR_Y);
    if (vx != 0 || vy != 0) {
        // Horizontal knockback
        for (int i = 0; i < 2; i++) {
            if (vx < 0) try_move_left();
            else if (vx > 0) try_move_right();
        }
        // Vertical knockback (usually small)
        if (vy < 0) try_move_up();
        else if (vy > 0) try_move_down();
    }
    // Clear rope if on it
    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0xFF) {
        MEM8(ADDR_ON_ROPE_FLAGS) = 0x80;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
    }
}

void update_hero(void) {
    // First, handle knockback from previous hit
    apply_knockback();

    // Update state machines
    update_on_rope();
    update_airborne();
    update_ice_slide();
    update_slope();

    // If we are in a special state (rope, airborne, sliding, knockback), no further input this frame?
    // Actually the original handles input inside each state. We'll handle input only if on ground and not special.
    uint8_t jump_phase = MEM8(ADDR_JUMP_PHASE_FLAGS);
    uint8_t rope_flags = MEM8(ADDR_ON_ROPE_FLAGS);
    uint8_t slide_ticks = MEM8(ADDR_SLIDE_TICKS_REMAINING);

    if (jump_phase != 0 || rope_flags != 0 || slide_ticks != 0) {
        // Already handled by state updates
        return;
    }

    // Ground movement
    uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
    uint8_t alt_space = MEM8(ADDR_INPUT_ALT_SPACE);

    // Jump (up press)
    if (dirs & 0x01) {
        // Check if we can jump (tile above clear)
        uint16_t x = hero_abs_x();
        uint8_t y = MEM8(ADDR_HERO_Y);
        if (y > 0 && is_passable_tile(get_tile_at(x, y - 1))) {
            start_jump();
            return;
        } else {
            // Try to climb rope
            try_climb_rope();
            return;
        }
    }

    // Crouch (down press)
    if (dirs & 0x02) {
        MEM8(ADDR_SQUAT_FLAG) = 0xFF;
        // Possibly move down if on platform? We'll just squat.
        return;
    } else {
        MEM8(ADDR_SQUAT_FLAG) = 0;
    }

    // Horizontal movement
    int moved = 0;
    if (dirs & 0x04) {
        moved = try_move_left();
    } else if (dirs & 0x08) {
        moved = try_move_right();
    }

    // Update animation phase
    if (moved) {
        uint8_t anim = MEM8(ADDR_HERO_ANIM_PHASE);
        anim = (anim + 1) & 3;
        MEM8(ADDR_HERO_ANIM_PHASE) = anim;
    } else {
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
    }

    // Sword swing (space/alt) – unchanged from original
    if ((alt_space & 0x01) || MEM8(ADDR_SPACEBAR_LATCH)) {
        if (MEM8(ADDR_DUNGEON_SWING_TMR) == 0 && MEM8(ADDR_SWORD_TYPE) != 0) {
            MEM8(ADDR_DUNGEON_SWING_TMR) = 18;
            MEM8(ADDR_SOUND_FX_REQUEST) = 0x10;
        }
        MEM8(ADDR_SPACEBAR_LATCH) = 0;
    }
}

// ----------------------------------------------------------------------
// Also update the other existing functions to maintain viewport
// ----------------------------------------------------------------------
// (keep update_view_top, update_sword, check_doors, update_monsters as before)


// ----------------------------------------------------------------------
// RLE unpack helpers (forward only, used to build full map)
// ----------------------------------------------------------------------
static void unpack_step_forward(uint16_t *si, uint8_t *rep, uint8_t *tile)
{
    uint8_t b = MEM8(*si);
    uint8_t op = b >> 6;
    if (op == 0) {
        *rep = (b & 0x3F) + 1;
        (*si)++;
        *tile = MEM8(*si);
    } else if (op == 1) {
        *rep = ((b >> 4) & 3) + 2;
        *tile = (b & 0x0F) + 1;
    } else if (op == 2) {
        *rep = b & 0x3F;
        *tile = 0;
        if (*rep == 0) {
            (*si)++;
            return;
        }
    } else { // op == 3
        *rep = 1;
        *tile = b & 0x3F;
    }
    (*si)++;
}

static void unpack_column_forward(uint16_t *si, uint8_t col, uint8_t *full_map, uint16_t map_width)
{
    uint8_t row = 0;
    while (row < DUNGEON_HEIGHT) {
        uint8_t rep, tile;
        unpack_step_forward(si, &rep, &tile);
        for (uint8_t i = 0; i < rep && row < DUNGEON_HEIGHT; i++) {
            full_map[(uint32_t)col * DUNGEON_HEIGHT + row] = tile;
            row++;
        }
    }
}

// Unpack entire map from MDT packed data into full_map buffer
static void unpack_full_map(uint16_t map_width, uint8_t *full_map)
{
    uint16_t si = ADDR_PACKED_MAP_START;
    memset(full_map, 0, (uint32_t)map_width * DUNGEON_HEIGHT);

    for (uint16_t col = 0; col < map_width; col++) {
        unpack_column_forward(&si, col, full_map, map_width);
    }
}

// ----------------------------------------------------------------------
// Proximity window management (copy columns from full map)
// ----------------------------------------------------------------------
static void copy_proximity_column(uint16_t src_col, uint8_t prox_col)
{
    uint32_t src_base = DUNGEON_FULL_MAP_ADDR + (uint32_t)src_col * DUNGEON_HEIGHT;
    uint16_t dst_base = ADDR_PROXIMITY + prox_col * DUNGEON_HEIGHT;
    memcpy(&g_mem[dst_base], &g_mem[src_base], DUNGEON_HEIGHT);
}

static void copy_proximity_window(uint16_t left_col)
{
    for (uint8_t col = 0; col < PROX_COLS; col++) {
        uint16_t src_col = (uint16_t)(left_col + col);
        if (src_col >= MEM16(ADDR_MAP_WIDTH)) src_col -= MEM16(ADDR_MAP_WIDTH);
        copy_proximity_column(src_col, col);
    }
}

// Shift proximity map columns right (when moving left) and fill new left column
static void proximity_scroll_right(uint16_t new_left_col)
{
    // Shift columns right by 1 (backward copy)
    uint16_t src = ADDR_PROXIMITY + (PROX_COLS - 2) * DUNGEON_HEIGHT;
    uint16_t dst = ADDR_PROXIMITY + (PROX_COLS - 1) * DUNGEON_HEIGHT;
    for (uint8_t i = PROX_COLS - 1; i > 0; i--) {
        memmove(&g_mem[dst], &g_mem[src], DUNGEON_HEIGHT);
        src -= DUNGEON_HEIGHT;
        dst -= DUNGEON_HEIGHT;
    }
    // Fill new leftmost column
    copy_proximity_column(new_left_col, 0);
}

// Shift proximity map columns left (when moving right) and fill new right column
static void proximity_scroll_left(uint16_t new_right_col)
{
    // Shift columns left by 1 (forward copy)
    uint16_t src = ADDR_PROXIMITY + DUNGEON_HEIGHT;
    uint16_t dst = ADDR_PROXIMITY;
    for (uint8_t i = 0; i < PROX_COLS - 1; i++) {
        memmove(&g_mem[dst], &g_mem[src], DUNGEON_HEIGHT);
        src += DUNGEON_HEIGHT;
        dst += DUNGEON_HEIGHT;
    }
    // Fill new rightmost column
    copy_proximity_column(new_right_col, PROX_COLS - 1);
}

// ----------------------------------------------------------------------
// Hero movement and collision (simplified for WASM)
// ----------------------------------------------------------------------
static int is_passable_tile(uint8_t tile)
{
    static const uint8_t passable[] = {
        0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x0B, 0x0C,
        0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
        0x17, 0x18, 0x19
    };

    if (tile >= 0x49) return 0;
    for (unsigned i = 0; i < sizeof(passable); i++) {
        if (tile == passable[i]) return 1;
    }
    return 0;
}

static uint8_t get_tile_at(uint16_t x, uint8_t y)
{
    if (x >= MEM16(ADDR_MAP_WIDTH)) return 0xFF;
    if (y >= DUNGEON_HEIGHT) return 0xFF;
    uint32_t addr = DUNGEON_FULL_MAP_ADDR + (uint32_t)x * DUNGEON_HEIGHT + y;
    return g_mem[addr];
}

int dungeon_can_stand_at(uint16_t x, uint8_t y)
{
    if (y >= DUNGEON_HEIGHT - 1) return 0;
    return is_passable_tile(get_tile_at(x, y)) &&
           is_passable_tile(get_tile_at(x, (uint8_t)(y + 1)));
}

// static void refresh_proximity_map(void)
// {
//     uint16_t left = MEM16(ADDR_HERO_PROX_LEFT);

//     for (uint16_t col = 0; col < PROX_COLS; col++) {
//         uint16_t map_x = (uint16_t)(left + col);
//         for (uint8_t row = 0; row < DUNGEON_HEIGHT; row++) {
//             MEM8(ADDR_PROXIMITY + col * DUNGEON_HEIGHT + row) = full_map_get(map_x, row);
//         }
//     }
// }

// static void refresh_viewport_entities(void)
// {
//     memset(&g_mem[ADDR_VIEWPORT_ENTITIES], 0, VIEW_COLS_DUNGEON * (VIEW_ROWS_DUNGEON + 1));

//     uint16_t left = (uint16_t)(MEM16(ADDR_HERO_PROX_LEFT) + 4);
//     uint8_t top = MEM8(ADDR_DUNGEON_VIEW_TOP);
//     uint16_t table = rd16(ADDR_MDT + 0x10);
//     uint16_t off = ptr_to_off(table);
//     dungeon_entity_count = 0;

//     while (off + sizeof(DungeonMonster) <= MAX_MDT_BYTES) {
//         DungeonMonster *m = (DungeonMonster *)&g_mem[ADDR_MDT + off];
//         if (m->curr_x == 0xFFFF) break;
//         dungeon_entity_count++;

//         if (m->curr_x >= left && m->curr_x < left + VIEW_COLS_DUNGEON &&
//             m->curr_y >= top && m->curr_y < top + VIEW_ROWS_DUNGEON) {
//             uint8_t vx = (uint8_t)(m->curr_x - left);
//             uint8_t vy = (uint8_t)(m->curr_y - top);
//             MEM8(ADDR_VIEWPORT_ENTITIES + vy * VIEW_COLS_DUNGEON + vx) = (uint8_t)dungeon_entity_count;
//         }
//         off = (uint16_t)(off + sizeof(DungeonMonster));
//     }
// }

static uint16_t hero_abs_x(void)
{
    return (uint16_t)(MEM16(ADDR_HERO_PROX_LEFT) + HERO_PROX_COL);
}

static void set_hero_abs_x(uint16_t x) {
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);
    if (map_width == 0) return;
    x %= map_width;
    uint16_t left = (uint16_t)(x - HERO_PROX_COL);
    MEM16(ADDR_HERO_PROX_LEFT) = left;
}

static void update_view_top(void)
{
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint8_t top = 0;
    if (hero_y > 9) top = (uint8_t)(hero_y - 9);
    if (top > DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON) {
        top = DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON;
    }
    MEM8(ADDR_DUNGEON_VIEW_TOP) = top;
    MEM8(ADDR_HERO_HEAD_Y_VIEW) = (uint8_t)(hero_y - top);
}

static void update_sword(void)
{
    uint8_t timer = MEM8(ADDR_DUNGEON_SWING_TMR);
    if (!timer) {
        MEM8(ADDR_DUNGEON_SWING_FRAME) = 0xFF;
        return;
    }

    timer--;
    MEM8(ADDR_DUNGEON_SWING_TMR) = timer;
    MEM8(ADDR_DUNGEON_SWING_FRAME) = (uint8_t)((17 - timer) / 2);
}

static void update_monsters(void)
{
    uint16_t table = MEM16(ADDR_MDT + 0x10);
    uint16_t off = ptr_to_off(table);
    uint16_t hx = hero_abs_x();
    uint8_t hy = MEM8(ADDR_HERO_Y);

    while (off + sizeof(DungeonMonster) <= MAX_MDT_BYTES) {
        DungeonMonster *m = (DungeonMonster *)&g_mem[ADDR_MDT + off];
        if (m->curr_x == 0xFFFF) break;
        dungeon_ai_update_monster(m, hx, hy);
        off = (uint16_t)(off + sizeof(DungeonMonster));
    }
}

static void check_doors(void)
{
    if (!(MEM8(ADDR_INPUT_DIRS) & 0x01)) return;

    uint16_t table = MEM16(ADDR_MDT + 0x0A); // doors_table_addr
    uint16_t off = ptr_to_off(table);
    uint16_t hx = hero_abs_x();
    uint8_t hy = MEM8(ADDR_HERO_Y);

    while (off + 12 <= MAX_MDT_BYTES) {
        uint16_t x0 = MEM16(ADDR_MDT + off);
        if (x0 == 0xFFFF) break; // list terminator
        uint8_t y0 = MEM8(ADDR_MDT + off + 2);
        uint8_t map_id = MEM8(ADDR_MDT + off + 4);
        uint16_t x1 = MEM16(ADDR_MDT + off + 5);
        uint8_t y1 = MEM8(ADDR_MDT + off + 7);

        // Check if hero overlaps the door (x0-1..x0+1, y0-1..y0+2)
        if (hx >= x0 - 1 && hx <= x0 + 1 && hy >= y0 - 1 && hy <= y0 + 2) {
            MEM16(ADDR_HERO_X_IN_PROXIMITY_MAP) = x1;
            if (y1 == 0xFF) { // door to town
                MEM8(ADDR_DUNGEON_EXIT_MAP) = map_id;
                MEM8(ADDR_DUNGEON_EXIT_FLAG) = 0xFF;
                return;
            }
            set_hero_abs_x(x1);
            MEM8(ADDR_HERO_Y) = (uint8_t)y1;
            return;
        }
        off = (uint16_t)(off + 12);
    }
}

// ----------------------------------------------------------------------
// Exported WASM functions
// ----------------------------------------------------------------------
void wasm_dungeon_init(uint8_t map_id, uint16_t spawn_x, uint8_t spawn_y, uint8_t direction)
{
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);
    if (map_width == 0) return;

    // Unpack full map into DUNGEON_FULL_MAP_ADDR
    unpack_full_map(map_width, &g_mem[DUNGEON_FULL_MAP_ADDR]);

    // Set initial proximity window
    uint16_t left = (uint16_t)(spawn_x - HERO_PROX_COL);
    MEM16(ADDR_HERO_PROX_LEFT) = left;
    MEM8(ADDR_HERO_X_VIEW) = HERO_VIEW_COL;
    MEM8(ADDR_HERO_Y) = spawn_y;
    MEM8(ADDR_FACING) = direction ? 1 : 0;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;

    copy_proximity_window(left);
    update_view_top();

    MEM8(ADDR_DUNGEON_ACTIVE) = 1;
    MEM8(ADDR_DUNGEON_EXIT_FLAG) = 0;
    MEM8(ADDR_DUNGEON_SWING_TMR) = 0;
    MEM8(ADDR_DUNGEON_SWING_FRAME) = 0xFF;
    MEM8(ADDR_PLACE_MAP_ID) = map_id;
}

void wasm_dungeon_update(void)
{
    if (!MEM8(ADDR_DUNGEON_ACTIVE)) return;

    update_hero();
    update_sword();
    check_doors();
    update_monsters();
    update_view_top();
    // refresh_proximity_map();
    // refresh_viewport_entities();
    MEM8(ADDR_FRAME_TIMER) = 0;
}

void wasm_dungeon_full_tick(void)
{
    MEM8(ADDR_FRAME_TIMER)++;
}

uint32_t wasm_dungeon_get_full_map_ptr(void) { return DUNGEON_FULL_MAP_ADDR; }
uint8_t wasm_dungeon_get_viewport_top(void) { return MEM8(ADDR_DUNGEON_VIEW_TOP); }
uint16_t wasm_dungeon_get_entity_table(void) { return MEM16(ADDR_MDT + 0x10); }
uint16_t wasm_dungeon_get_entity_count(void) { return dungeon_entity_count; }
uint8_t wasm_dungeon_get_sword_frame(void) { return MEM8(ADDR_DUNGEON_SWING_FRAME); }
uint8_t wasm_dungeon_get_exit_map(void) { return MEM8(ADDR_DUNGEON_EXIT_MAP); }

int wasm_load_mdt(const uint8_t *mdt_data, uint32_t mdt_size)
{
    if (!mdt_data || mdt_size > MAX_MDT_BYTES) return -1;
    memcpy(&g_mem[ADDR_MDT], mdt_data, mdt_size);
    return 0;
}
