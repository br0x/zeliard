#include <stdint.h>
#include <string.h>

#include "zeliard.h"
#include "dungeon.h"

#define MEM8(addr)   (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)  (*(uint16_t *)&g_mem[(addr) & 0xFFFF])

#define ADDR_BYTE_9EF5                0x9EF5  // byte
#define ADDR_BYTE_9F00                0x9F00
#define ADDR_BYTE_9F01                0x9F01
#define ADDR_PACKED_MAP_PTR_MINUS     0x9F04  // word: packed_map_ptr_for_prox_left
#define ADDR_PACKED_MAP_PTR_PLUS      0x9F06  // word: packed_map_ptr_for_prox_right
#define ADDR_JUMP_HEIGHT_COUNTER      0x9F08
#define ADDR_BYTE_9F09                0x9F09  // vertical scroll offset
#define ADDR_FRAME_TICKS              0x9F0A
#define ADDR_BYTE_9F0B                0x9F0B
#define ADDR_HEIGHT_ABOVE_GROUND      0x9F0C
#define ADDR_JUMP_HEIGHT_INCLUDING_SHOES  0x9F0D  // normally 2, Feruza shoes set to 4
#define ADDR_KNOCKBACK_VECTOR_9F0E    0x9F0E  // word
#define ADDR_KNOCKBACK_VECTOR_9F10       0x9F10  // word
#define ADDR_BYTE_9F14                0x9F14
#define ADDR_AIR_UP_TILE_FOUND        0x9F15
#define ADDR_BYTE_9F18                0x9F18
#define ADDR_BYTE_9F19                0x9F19
#define ADDR_HERO_X_IN_PROXIMITY_MAP  0x9F1A // word
#define ADDR_BYTE_9F1E                0x9F1E  // byte
#define ADDR_SLIDE_TICKS_REMAINING    0x9F20
#define ADDR_HORIZ_MOVEMENT_ACCUM     0x9F21
#define ADDR_SLIDE_DIRECTION          0x9F22  // 1=right, 2=left
#define ADDR_SLIDE_DIRECTION_LOCK     0x9F23  // 1=right movement
#define ADDR_TEMPERATURE_TIMER        0x9F25  // temperature_timer
#define ADDR_9F2B                     0x9F2B  // byte

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
// Proximity map bounds
#define PROXIMITY_SIZE            0x900u   // 36*64
#define PROXIMITY_END             (ADDR_PROXIMITY + PROXIMITY_SIZE)
#define ADDR_VIEWPORT_ENTITIES   0xE900u

#define ADDR_INPUT_ALT_SPACE     0xFF16u
#define ADDR_FRAME_TIMER         0xFF1Au
#define ADDR_VIEWPORT_LEFT_TOP   0xFF31u  // word: address in proximity map for top-left of viewport
#define ADDR_HERO_Y              0xFF35u   // hero_y_absolute (byte)
#define ADDR_TICK_COUNTER        0xFF50u
#define ADDR_SOUND_FX_REQUEST    0xFF75u

#define ADDR_DUNGEON_ACTIVE      0xFFE1u
#define ADDR_DUNGEON_EXIT_FLAG   0xFFE2u
#define ADDR_DUNGEON_EXIT_MAP    0xFFE3u
#define ADDR_DUNGEON_SWING_TMR   0xFFE4u
#define ADDR_DUNGEON_SWING_FRAME 0xFFE5u

#define ADDR_PENDING_DUNGEON_MAP  0xFFFCu
#define ADDR_PENDING_DUNGEON_FLAG 0xFFFDu


#define ADDR_PASSABLE_TILES       0x18000u
#define ADDR_AIRFLOW_TILES        0x18024u
#define MAX_MDT_BYTES            0x4000u
#define PROX_COLS                36
#define DUNGEON_HEIGHT           64
#define VIEW_COLS_DUNGEON        28
#define VIEW_ROWS_DUNGEON        18
#define HERO_VIEW_COL            13               // hero x in viewport (columns)
#define HERO_PROX_COL            17               // hero x in proximity (columns)
// Constants
#define SLOPE_NONE  0
#define SLOPE_RIGHT 1
#define SLOPE_LEFT  2
#define SLIDE_RIGHT 1
#define SLIDE_LEFT  2
#define ROPE_TILE_1 1
#define ROPE_TILE_2 2
#define LEFT_SLOPE_TILE  11
#define RIGHT_SLOPE_TILE 12
#define ICE_TILE_START   0x40
#define ICE_TILE_END     0x48
#define SHOES_FERUZA        1
#define SHOES_RUZERIA       4
#define AIRFLOW_UP          0
#define AIRFLOW_LEFT        1
#define AIRFLOW_RIGHT       2
#define KEY_ENTER     1
#define LEFT  1
#define UP    2


static uint16_t dungeon_map_width;
static uint16_t dungeon_entity_count;

// TODO: remove (AI hallucinations)
static uint16_t ptr_to_off(uint16_t ptr)
{
    return ptr >= ADDR_MDT ? (uint16_t)(ptr - ADDR_MDT) : ptr;
}

// Checked
static void wrap_map_from_above(uint16_t *si) {
    if (*si >= PROXIMITY_END) {
        *si -= PROXIMITY_SIZE;
    }
}

// Checked
static void wrap_map_from_below(uint16_t *si) {
    if (*si < ADDR_PROXIMITY) {
        *si += PROXIMITY_SIZE;
    }
}

// Convert (x, y) in proximity coordinates (x 0..35, y 0..63) to address
// Port of original coords_in_ax_to_proximity_map_addr_in_di
// TODO: remove (AI hallucinations)
static uint16_t coords_to_prox_addr(uint8_t x, uint8_t y) {
    y &= 0x3F;
    return ADDR_PROXIMITY + (uint16_t)(y & 0x3F) * PROX_COLS + x;
}

// Hero's top-left tile address in proximity map (from f_map.inc)
// Use macro MEM to access actual data at this address
// Checked
static uint16_t hero_coords_to_addr_in_proximity(void) {
    uint8_t head_y = MEM8(ADDR_HERO_HEAD_Y_VIEW);
    uint8_t view_x = MEM8(ADDR_HERO_X_VIEW);
    uint16_t addr = MEM16(ADDR_VIEWPORT_LEFT_TOP) + head_y * 36 + view_x + 4;
    wrap_map_from_above(&addr);
    return addr; // within 0xe000-0xe8ff
}

// Move viewport up one row (when hero jumps or climbs)
// Checked
static void move_hero_up(void) {
    MEM8(ADDR_VIEWPORT_TOP_ROW)--;
    uint16_t addr = MEM16(ADDR_VIEWPORT_LEFT_TOP);
    addr -= 36;
    wrap_map_from_below(&addr);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;
}

// Move viewport down one row (when falling)
// Checked
static void hero_scroll_down(void) {
    MEM8(ADDR_VIEWPORT_TOP_ROW)++;
    uint16_t addr = MEM16(ADDR_VIEWPORT_LEFT_TOP);
    addr += 36;
    wrap_map_from_above(&addr);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;
}

// Update hero's absolute Y and adjust viewport if needed (called after vertical movement)
// TODO: remove (AI hallucinations)
static void set_hero_y(uint8_t y) {
    MEM8(ADDR_HERO_Y) = y;
    uint8_t top = MEM8(ADDR_VIEWPORT_TOP_ROW);
    if (y < top) {
        move_hero_up();
    } else if (y >= top + VIEW_ROWS_DUNGEON) {
        hero_scroll_down();
    }
    // Update derived value for drawing
    MEM8(ADDR_HERO_HEAD_Y_VIEW) = y - MEM8(ADDR_VIEWPORT_TOP_ROW);
}

// Helper: get address in proximity map for world coordinates
// TODO: remove (AI hallucinations)
static uint16_t world_to_proximity_addr(uint16_t x, uint8_t y) {
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t col = (x - left + PROX_COLS) % PROX_COLS;
    return ADDR_PROXIMITY + col * DUNGEON_HEIGHT + y;
}

// Helper: check if a tile is a rope (ID 1 or 2)
// TODO: remove (AI hallucinations)
static int is_rope_tile(uint8_t tile) {
    return tile == ROPE_TILE_1 || tile == ROPE_TILE_2;
}

// Helper: check if tile is ice (for sliding)
// TODO: remove (AI hallucinations)
static int is_ice_tile(uint8_t tile) {
    return tile >= ICE_TILE_START && tile <= ICE_TILE_END;
}

// Helper: get tile type from proximity map (including monster bit)
// TODO: remove (AI hallucinations)
static uint8_t get_proximity_tile(uint16_t world_x, uint8_t world_y) {
    uint16_t addr = world_to_proximity_addr(world_x, world_y);
    return MEM8(addr);
}

// Helper: check if a monster occupies a given world tile
// TODO: remove (AI hallucinations)
static int is_monster_at(uint16_t world_x, uint8_t world_y) {
    uint8_t tile = get_proximity_tile(world_x, world_y);
    return (tile & 0x80) != 0;
}

// ----------------------------------------------------------------------
// Move left (scroll map right) with obstacle checks
// Returns 1 if movement succeeded, 0 if blocked.
// ----------------------------------------------------------------------
// Horizontal movement – centered scrolling (hero_x_in_viewport constant)
// TODO: remove (AI hallucinations)
static int try_move_left(void) {
    uint16_t hero_x = hero_abs_x();
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);

    // New left column after moving left
    uint16_t new_left = left - 1;
    if (new_left >= map_width) new_left = map_width - 1; // wrap

    // World X of the column just left of hero
    uint16_t check_x = (hero_x - 1 + map_width) % map_width;

    // Check 4 tiles (rows hero_y-1 .. hero_y+2) at check_x
    for (int i = 0; i < 4; i++) {
        int8_t y_off = i - 1;
        uint8_t check_y = hero_y + y_off;
        if (check_y >= DUNGEON_HEIGHT) continue;
        if (is_monster_at(check_x, check_y)) return 0;
        uint8_t tile = get_tile_at(check_x, check_y);
        if (!is_non_blocking_tile(tile)) return 0;
        if (MEM8(ADDR_CAVERN_LEVEL) != 7) {
            uint8_t airflow = get_airflow_direction(tile);
            if (airflow == 2) return 0; // right-flow wind blocks left movement
        }
    }

    uint8_t squat = MEM8(ADDR_SQUAT_FLAG);
    if (!squat) {
        uint8_t tile = get_tile_at(check_x, hero_y);
        if (!is_non_blocking_tile(tile)) return 0;
        if (MEM8(ADDR_CAVERN_LEVEL) != 7 && get_airflow_direction(tile) == 2) return 0;
    } else {
        for (int i = 0; i < 2; i++) {
            uint8_t tile = get_tile_at(check_x, hero_y + 1 + i);
            if (!is_non_blocking_tile(tile)) return 0;
            if (MEM8(ADDR_CAVERN_LEVEL) != 7 && get_airflow_direction(tile) == 2) return 0;
        }
    }

    // Perform scroll
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = new_left;
    // proximity_scroll_right(new_left);   // shift map right, fill new leftmost column
    MEM8(ADDR_FACING) = 1;              // face left
    // Absolute X updates automatically via hero_abs_x()
    return 1;
}

// TODO: remove (AI hallucinations)
static int try_move_right(void) {
    uint16_t hero_x = hero_abs_x();
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);

    uint16_t new_left = left + 1;
    if (new_left >= map_width) new_left = 0;

    uint16_t check_x = (hero_x + 1) % map_width;

    for (int i = 0; i < 4; i++) {
        int8_t y_off = i - 1;
        uint8_t check_y = hero_y + y_off;
        if (check_y >= DUNGEON_HEIGHT) continue;
        if (is_monster_at(check_x, check_y)) return 0;
        uint8_t tile = get_tile_at(check_x, check_y);
        if (!is_non_blocking_tile(tile)) return 0;
        if (MEM8(ADDR_CAVERN_LEVEL) != 7) {
            uint8_t airflow = get_airflow_direction(tile);
            if (airflow == 1) return 0; // left-flow wind blocks right movement
        }
    }

    uint8_t squat = MEM8(ADDR_SQUAT_FLAG);
    if (!squat) {
        uint8_t tile = get_tile_at(check_x, hero_y);
        if (!is_non_blocking_tile(tile)) return 0;
        if (MEM8(ADDR_CAVERN_LEVEL) != 7 && get_airflow_direction(tile) == 1) return 0;
    } else {
        for (int i = 0; i < 2; i++) {
            uint8_t tile = get_tile_at(check_x, hero_y + 1 + i);
            if (!is_non_blocking_tile(tile)) return 0;
            if (MEM8(ADDR_CAVERN_LEVEL) != 7 && get_airflow_direction(tile) == 1) return 0;
        }
    }

    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = new_left;
    // proximity_scroll_left((new_left + PROX_COLS - 1) % map_width);
    MEM8(ADDR_FACING) = 0;
    return 1;
}

// ----------------------------------------------------------------------
// Jumping and airborne physics
// ----------------------------------------------------------------------
// TODO: remove (AI hallucinations)
static void start_jump(void) {
    uint8_t feruza = (MEM8(ADDR_CURRENT_ACCESSORY) == SHOES_FERUZA) ? 4 : 2;
    MEM8(ADDR_JUMP_HEIGHT_INCLUDING_SHOES) = feruza;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0xFF;
    MEM8(ADDR_HEIGHT_ABOVE_GROUND) = feruza >> 1;
    MEM8(ADDR_JUMP_HEIGHT_COUNTER) = 0;
    MEM8(ADDR_SQUAT_FLAG) = 0;
    move_hero_up(); // first step upward
}

// Airborne update – uses hero_scroll_down on descent
// TODO: remove (AI hallucinations)
static void update_airborne(void) {
    uint8_t phase = MEM8(ADDR_JUMP_PHASE_FLAGS);
    if (phase == 0) return;

    uint16_t x = hero_abs_x();
    uint8_t y = MEM8(ADDR_HERO_Y);
    if (dungeon_can_stand_at(x, y + 1)) {
        // Land
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
        MEM8(ADDR_JUMP_HEIGHT_COUNTER) = 0;
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
        if (MEM8(ADDR_HEIGHT_ABOVE_GROUND) >= 2) {
            MEM8(ADDR_SQUAT_FLAG) = 0xFF;
        }
        return;
    }

    if (phase == 0xFF) { // ascending
        uint8_t height = MEM8(ADDR_HEIGHT_ABOVE_GROUND);
        if (height > 0) {
            MEM8(ADDR_HEIGHT_ABOVE_GROUND) = height - 1;
            move_hero_up();
            // In-air steering
            uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
            if (dirs & 0x04) try_move_left();
            else if (dirs & 0x08) try_move_right();
        } else {
            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F; // descending
        }
    } else if (phase == 0x7F) { // descending
        hero_scroll_down();
        uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
        if (dirs & 0x04) try_move_left();
        else if (dirs & 0x08) try_move_right();
    }
}

// ----------------------------------------------------------------------
// Rope climbing
// ----------------------------------------------------------------------
// TODO: replace with actual code (AI hallucinations)
static void try_climb_rope(void) {
    uint16_t x = hero_abs_x();
    uint8_t y = MEM8(ADDR_HERO_Y);
    if (y > 0 && is_rope_tile(get_tile_at(x, y - 1))) {
        MEM8(ADDR_ON_ROPE_FLAGS) = 0xFF;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
        MEM8(ADDR_SQUAT_FLAG) = 0;
        move_hero_up();
        set_hero_y(y - 1);
    }
}

// Rope update – uses move_hero_up / hero_scroll_down
// TODO: remove (AI hallucinations)
static void update_on_rope(void) {
    uint8_t rope_flags = MEM8(ADDR_ON_ROPE_FLAGS);
    if (rope_flags == 0) return;
    if (rope_flags == 0xFF) {
        uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
        if (dirs & 0x01) { // up
            uint16_t x = hero_abs_x();
            uint8_t y = MEM8(ADDR_HERO_Y);
            if (y > 0 && is_rope_tile(get_tile_at(x, y - 1))) {
                move_hero_up();
                set_hero_y(y - 1);
            }
        } else if (dirs & 0x02) { // down
            uint16_t x = hero_abs_x();
            uint8_t y = MEM8(ADDR_HERO_Y);
            if (y < DUNGEON_HEIGHT - 1 && is_rope_tile(get_tile_at(x, y + 1))) {
                hero_scroll_down();
                set_hero_y(y + 1);
            } else {
                MEM8(ADDR_ON_ROPE_FLAGS) = 0x80;
                MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x80;
            }
        }
    } else if (rope_flags == 0x80) {
        MEM8(ADDR_ON_ROPE_FLAGS) = 0;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    }
}

// Ice sliding – uses try_move_left/right
// TODO: remove (AI hallucinations)
static void update_ice_slide(void) {
    if (MEM8(ADDR_CAVERN_LEVEL) != 4) return;
    if (MEM8(ADDR_CURRENT_ACCESSORY) == SHOES_RUZERIA) return;
    uint8_t slide_ticks = MEM8(ADDR_SLIDE_TICKS_REMAINING);
    if (slide_ticks == 0) return;
    MEM8(ADDR_SLIDE_TICKS_REMAINING) = slide_ticks - 1;
    uint8_t dir = MEM8(ADDR_SLIDE_DIRECTION);
    if (dir == 1) try_move_right();
    else if (dir == 2) try_move_left();
    uint16_t x = hero_abs_x();
    uint8_t y = MEM8(ADDR_HERO_Y);
    if (!is_ice_tile(get_tile_at(x, y))) {
        MEM8(ADDR_SLIDE_TICKS_REMAINING) = 0;
    }
}

// ----------------------------------------------------------------------
// Slopes
// ----------------------------------------------------------------------
// TODO: remove (AI hallucinations)
static void update_slope(void) {
    uint8_t slope = MEM8(ADDR_SLOPE_DIRECTION);
    if (slope == SLOPE_NONE) return;
    uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
    if (slope == SLOPE_RIGHT && !(dirs & 0x08)) {
        try_move_right();
    } else if (slope == SLOPE_LEFT && !(dirs & 0x04)) {
        try_move_left();
    }
}

// ----------------------------------------------------------------------
// Knockback
// ----------------------------------------------------------------------
// TODO: remove (AI hallucinations)
static void apply_knockback(void) {
    if (MEM8(ADDR_BYTE_9F14) == 0) return;
    MEM8(ADDR_BYTE_9F14) = 0;
    int16_t vx = MEM16(ADDR_KNOCKBACK_VECTOR_9F0E);
    int16_t vy = MEM16(ADDR_KNOCKBACK_VECTOR_9F10);
    if (vx != 0 || vy != 0) {
        for (int i = 0; i < 2; i++) {
            if (vx < 0) try_move_left();
            else if (vx > 0) try_move_right();
        }
        if (vy < 0) move_hero_up();
        else if (vy > 0) hero_scroll_down();
    }
    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0xFF) {
        MEM8(ADDR_ON_ROPE_FLAGS) = 0x80;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
    }
}

// TODO: remove (AI hallucinations)
void update_hero(void) {
    apply_knockback();
    update_on_rope();
    update_airborne();
    update_ice_slide();
    update_slope();

    uint8_t jump_phase = MEM8(ADDR_JUMP_PHASE_FLAGS);
    uint8_t rope_flags = MEM8(ADDR_ON_ROPE_FLAGS);
    uint8_t slide_ticks = MEM8(ADDR_SLIDE_TICKS_REMAINING);
    if (jump_phase != 0 || rope_flags != 0 || slide_ticks != 0) {
        return;
    }

    uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
    uint8_t alt_space = MEM8(ADDR_INPUT_ALT_SPACE);

    if (dirs & 0x01) { // up
        uint16_t x = hero_abs_x();
        uint8_t y = MEM8(ADDR_HERO_Y);
        if (y > 0 && is_non_blocking_tile(get_tile_at(x, y - 1))) {
            start_jump();
            return;
        } else {
            try_climb_rope();
            return;
        }
    }

    if (dirs & 0x02) { // down
        MEM8(ADDR_SQUAT_FLAG) = 0xFF;
        return;
    } else {
        MEM8(ADDR_SQUAT_FLAG) = 0;
    }

    int moved = 0;
    if (dirs & 0x04) moved = try_move_left();
    else if (dirs & 0x08) moved = try_move_right();

    if (moved) {
        uint8_t anim = MEM8(ADDR_HERO_ANIM_PHASE);
        anim = (anim + 1) & 3;
        MEM8(ADDR_HERO_ANIM_PHASE) = anim;
    } else {
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
    }

    // Sword swing
    if ((alt_space & 0x01) || MEM8(ADDR_SPACEBAR_LATCH)) {
        if (MEM8(ADDR_DUNGEON_SWING_TMR) == 0 && MEM8(ADDR_SWORD_TYPE) != 0) {
            MEM8(ADDR_DUNGEON_SWING_TMR) = 18;
            MEM8(ADDR_SOUND_FX_REQUEST) = 0x10;
        }
        MEM8(ADDR_SPACEBAR_LATCH) = 0;
    }
}



// ----------------------------------------------------------------------
// Hero movement and collision
// ----------------------------------------------------------------------

// is_non_blocking_tile family. 
// Original assembly code returns ZF or NZ, we return 0 or nonzero values instead.
// Checked
uint8_t is_non_blocking_tile(uint8_t tile)
{
    return (tile < 0x40) ? lookup_shared(tile) : tile;
}

// Checked
static uint8_t is_non_blocking_tile_extended(uint8_t tile) 
{
    return (tile < 0x49) ? lookup_shared(tile) : tile;
}

// Original returns ZF, we will check for 0 on caller side
// Checked
static uint8_t is_non_blocking_tile_simple(uint8_t tile) 
{
    if (tile < 0x49) {
        for (int i = 0; i < 24; i++) {
            if (tile == MEM8(ADDR_PASSABLE_TILES + i)) {
                return 0;
            }
        }
        return tile & 0x80;
    } else {
        return tile;
    }
}

// Checked
uint8_t lookup_shared(uint8_t tile)
{
    for (int i = 0; i < 24; i++) {
        if (tile == MEM8(ADDR_PASSABLE_TILES + i)) {
            return 0;
        }
    }
    uint8_t masked = tile & 0x9F;
    if (masked == 0x90 || masked == 0x91) return 0xff;
    return masked & 0x80;
}

// Checked
static uint8_t is_right_airflow(uint8_t tile) {
    if (MEM8(ADDR_CAVERN_LEVEL) != 7) 
        return 0; // level 7, no airflows
    return get_airflow_direction(tile) == AIRFLOW_RIGHT;
}

// original assembly code returns CF as True, NC as False
// Checked
static uint8_t is_left_airflow(uint8_t tile) {
    if (MEM8(ADDR_CAVERN_LEVEL) != 7) 
        return 0; // level 7, no airflows
    return get_airflow_direction(tile) == AIRFLOW_LEFT;
}

// Is input tile an airflow?
// Output: 0xff (no airflow)
//         0 (Up), 1 (Left), 2 (Right)
// Checked
uint8_t get_airflow_direction(uint8_t tile)
{
    if (tile != 0) {
        for (int i = 0; i < 4; i++) {
            uint8_t af = MEM8(ADDR_AIRFLOW_TILES + i);
            if (af == 0) 
                break;
            if (tile == af) {
                return AIRFLOW_UP;
            }
        }
        for (int i = 0; i < 4; i++) {
            uint8_t af = MEM8(ADDR_AIRFLOW_TILES + 4 + i);
            if (af == 0) 
                break;
            if (tile == af) {
                return AIRFLOW_LEFT;
            }
        }
        for (int i = 0; i < 4; i++) {
            uint8_t af = MEM8(ADDR_AIRFLOW_TILES + 8 + i);
            if (af == 0) 
                break;
            if (tile == af) {
                return AIRFLOW_RIGHT;
            }
        }
    }
    return 0xFF;
}

// Reads one byte from the proximity map at [SI].
// If bit 7 is clear: CF=1 (no monster/item).
// If bit 7 is set: the low 7 bits are a monster_index (0-127).
//   Looks up monsters_table_addr + index*16 to get the monster struct.
//   Returns AL = monster.flags, BX = pointer to monster struct.
//   CF (no monster/item) => return 0
//   NC if monster/item; AL = monster.flags => return 0xff
// ===========================================================================
// Checked
uint8_t get_dst_monster_flags(uint16_t si, uint8_t* flags)
{
    uint8_t tile = MEM8(si);
    if (tile & 0x80 == 0) {
        *flags = tile;
        return 0;
    }

    tile &= 0x7F; // monster id
    uint16_t addr = MEM16(ADDR_MONSTERS_LIST) + tile * 16;
    Monster *m = (Monster *)&g_mem[addr];
    *flags = m->flags;
    return 0xFF;
}

// Return 0 if cannot move right (original assembly returned CF)
// Checked
uint8_t move_hero_right_if_no_obstacles()
{
    uint16_t si = hero_coords_to_addr_in_proximity() + 2;
    uint16_t di = si;
    si -= 36;
    wrap_map_from_below(&si);
    for (int i = 0; i < 4; i++) {
        uint8_t flags;
        get_dst_monster_flags(si, &flags);
        if (flags & 0x80) return 0; // destroyable wall to the right of hero, can't move
        si += 36;
        wrap_map_from_above(&si);
    }
    si = di;
    if (MEM8(ADDR_SQUAT_FLAG) == 0) {
        // head level: needs 2 checks
        uint8_t tile = MEM8(si);
        if (is_non_blocking_tile(tile)) return 0; // blocking tile to the right of hero, can't move
        if (is_left_airflow(tile)) return 0; // left-flow wind blocks right movement
    }
    // head-level checks finished, now body and feet
    for (int i = 0; i < 2; i++) {
        si += 36;
        wrap_map_from_above(&si);
        uint8_t tile = MEM8(si);
        if (is_non_blocking_tile_simple(tile)) return 0;
        if (is_left_airflow(tile)) return 0;
    }
    hero_moves_right();
    return 0xff;
}

// Return 0 if cannot move left
// Checked
uint8_t move_hero_left_if_no_obstacles()
{
    uint16_t si = hero_coords_to_addr_in_proximity();
    uint16_t di = si;
    si -= 36;
    wrap_map_from_below(&si);
    si--; // tile NW of hero top left
    for (int i = 0; i < 4; i++) {
        uint8_t flags;
        uint8_t ret = get_dst_monster_flags(si, &flags);
        if (flags & 0x80) return 0; // destroyable wall to the left of hero, can't move
        si += 36;
        wrap_map_from_above(&si);
    }
    si = di;
    if (MEM8(ADDR_SQUAT_FLAG) == 0) { // not squatting
        // head level: needs 2 checks
        uint8_t tile = MEM8(si);
        if (is_non_blocking_tile(tile)) return 0;
        if (is_right_airflow(tile)) return 0;
    }
    // head-level checks finished, now body and feet
    for (int i = 0; i < 2; i++) {
        si += 36;
        wrap_map_from_above(&si);
        uint8_t tile = MEM8(si);
        if (is_non_blocking_tile_simple(tile)) return 0;
        if (is_right_airflow(tile)) return 0;
    }
    hero_moves_left();
    return 0xff;
}

// Checked
void hero_moves_right()
{
    uint16_t left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + 1;
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = left_col;
    left_col += (PROX_COLS - 1);
    if (left_col == mapWidth) {
        packed_map_ptr_for_prox_right = MEM16(ADDR_PACKED_MAP_END_PTR) + 1;
    }
    uint8_t* dest = &g_mem[ADDR_PROXIMITY_MAP];
    memmove(dest, dest + 1, PROX_COLS * DUNGEON_HEIGHT - 1);
    uint16_t si = packed_map_ptr_for_prox_right + 1; // check!!
    uint8_t *di = &g_mem[ADDR_PROXIMITY_MAP + PROX_COLS - 1];
    unpack_column(&si, di);
    packed_map_ptr_for_prox_right = si - 1;
    left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    if (left_col == mapWidth) {
        MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = 0;
        si = ADDR_PACKED_MAP_START;
    } else { // skip column
        si = packed_map_ptr_for_prox_left;
        uint8_t dh = 0;
        do {
            uint8_t tile, count;
            unpack_step_forward(&si, &tile, &count);
            dh += count;
        } while (dh < 64);
    }
    packed_map_ptr_for_prox_left = si;
    every_projectile_moves_left_in_viewport();
    MEM8(ADDR_MONSTER_INDEX) = 0;
    left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + PROX_COLS - 1;
    if (left_col >= mapWidth) {
        left_col -= mapWidth;
    }
    si = MEM16(ADDR_MONSTERS_LIST);
    for(;;) {
        uint16_t currX = MEM16(si + 0);
        if (currX == 0xFFFF) break;
        if ((currX >> 8) != 0xFF && currX == left_col) {
            uint8_t currY = MEM8(si + 2);
            uint16_t prox = coords_to_prox_addr(35, currY);
            uint8_t idx = MEM8(ADDR_MONSTER_INDEX);
            MEM8(prox) = (idx | 0x80);
            MEM8(ADDR_MONSTER_INDEX) = idx + 1;
            si += 16;
        }
    }
}

// Checked
void hero_moves_left()
{
    uint16_t left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) - 1;
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    if (left_col == 0xffff) {
        left_col = mapWidth - 1;
        packed_map_ptr_for_prox_left = MEM16(ADDR_PACKED_MAP_END_PTR);
    }
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = left_col;
    // proximity_map_scrolls_right
    uint8_t* dest = &g_mem[ADDR_PROXIMITY_MAP];
    memmove(dest + 1, dest, PROX_COLS * DUNGEON_HEIGHT - 1);
    uint16_t si = packed_map_ptr_for_prox_left - 1; // check!!
    uint8_t *di = &g_mem[ADDR_PROXIMITY_MAP + PROX_COLS * (DUNGEON_HEIGHT - 1)];
    // fill_column_backward
    unpack_column_backward(&si, di);
    packed_map_ptr_for_prox_left = si + 1;
    si = MEM16(ADDR_PACKED_MAP_END_PTR) - 1;
    left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    if (left_col + PROX_COLS != mapWidth) {
        // skip column
        si = packed_map_ptr_for_prox_right;
        uint8_t dh = 0;
        do {
            uint8_t tile, count;
            unpack_step_backward(&si, &tile, &count);
            dh += count;
        } while (dh < 64);
    }
    packed_map_ptr_for_prox_right = si;
    every_projectile_moves_right_in_viewport();
    MEM8(ADDR_MONSTER_INDEX) = 0;
    // left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    si = MEM16(ADDR_MONSTERS_LIST);
    for(;;) {
        uint16_t currX = MEM16(si + 0);
        if (currX == 0xFFFF) break;
        if ((currX >> 8) != 0xFF && currX == left_col) {
            uint8_t currY = MEM8(si + 2);
            uint16_t prox = coords_to_prox_addr(0, currY);
            uint8_t idx = MEM8(ADDR_MONSTER_INDEX);
            MEM8(prox) = (idx | 0x80);
            MEM8(ADDR_MONSTER_INDEX) = idx + 1;
            si += 16;
        }
    }
}

// stub
void every_projectile_moves_left_in_viewport()
{

}

// stub
void every_projectile_moves_right_in_viewport()
{

}

// Checked
void hero_interaction_check(void)
{
    if (MEM8(ADDR_SQUAT_FLAG)) return;
    if (MEM8(ADDR_JUMP_PHASE_FLAGS)) return;
    uint16_t si = hero_coords_to_addr_in_proximity();
    uint8_t tile = MEM8(si);
    if (is_non_blocking_tile(tile) == 0) return;
    si += 2;
    tile = MEM8(si);
    if (is_non_blocking_tile(tile) == 0) return;
    si += 36;
    wrap_map_from_above(&si);
    tile = MEM8(si);
    if (is_non_blocking_tile(tile) == 0) {
        hero_moves_right();
    } else {
        hero_moves_left();
    }
}

// TODO: remove (AI hallucinations)
static uint8_t get_tile_at(uint16_t x, uint8_t y)
{
    if (x >= MEM16(ADDR_MAP_WIDTH)) return 0xFF;
    if (y >= DUNGEON_HEIGHT) return 0xFF;
    return 0; // stub
}

// TODO: remove (AI hallucinations)
int dungeon_can_stand_at(uint16_t x, uint8_t y)
{
    if (y >= DUNGEON_HEIGHT - 1) return 0;
    return is_non_blocking_tile(get_tile_at(x, y)) &&
           is_non_blocking_tile(get_tile_at(x, (uint8_t)(y + 1)));
}

// Hero's absolute X coordinate (from proximity left column + center column)
// TODO: remove (AI hallucinations)
static uint16_t hero_abs_x(void) {
    return MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + HERO_PROX_COL;
}

// Set hero's absolute X (centered, does NOT change viewport X)
// TODO: remove (AI hallucinations)
static void set_hero_abs_x(uint16_t x) {
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);
    if (map_width == 0) return;
    x %= map_width;
    uint16_t left = x - HERO_PROX_COL;
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = left;
}

// Only used during init and after teleporting
// TODO: remove (AI hallucinations)
static void sync_viewport_from_hero(void) {
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint8_t top = 0;
    if (hero_y > 9) top = hero_y - 9;
    if (top > DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON)
        top = DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON;
    MEM8(ADDR_VIEWPORT_TOP_ROW) = top;
    MEM8(ADDR_VIEWPORT_TOP_ROW) = top;
    MEM8(ADDR_HERO_HEAD_Y_VIEW) = hero_y - top;
    // Recompute viewport_left_top_addr from top (col 4)
    uint16_t addr = coords_to_prox_addr(4, top);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;
}

// TODO: remove (AI hallucinations)
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

// TODO: remove (AI hallucinations)
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

// TODO: remove (AI hallucinations)
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
            // Teleport hero
            set_hero_abs_x(x1);
            MEM8(ADDR_HERO_Y) = y1;
            sync_viewport_from_hero();
            return;
        }
        off = (uint16_t)(off + 12);
    }
}

// ----------------------------------------------------------------------
// Exported WASM functions
// ----------------------------------------------------------------------
// Initialization: unpack full map and setup proximity/viewport
// FIXME!
void wasm_dungeon_init(uint8_t map_id, uint16_t spawn_x, uint8_t spawn_y, uint8_t direction) {
    unpack_map();

    // Set initial proximity window centered on spawn point
    uint16_t left = spawn_x - HERO_PROX_COL;  // HERO_PROX_COL is now 16
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = left;
    MEM8(ADDR_HERO_X_VIEW) = HERO_VIEW_COL;
    MEM8(ADDR_HERO_Y) = spawn_y;
    MEM8(ADDR_FACING) = direction ? 1 : 0;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;

    // copy_proximity_window(left);

    // Compute initial viewport top row (centered vertically)
    uint8_t top = 0;
    if (spawn_y > 9) top = spawn_y - 9;
    if (top > DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON)
        top = DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON;
    MEM8(ADDR_VIEWPORT_TOP_ROW) = top;
    MEM8(ADDR_VIEWPORT_TOP_ROW) = top;
    MEM8(ADDR_HERO_HEAD_Y_VIEW) = spawn_y - top;

    // Calculate viewport_left_top_addr = coords_to_prox_addr(4, top)
    uint16_t addr = coords_to_prox_addr(4, top);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;

    MEM8(ADDR_DUNGEON_ACTIVE) = 1;
    MEM8(ADDR_DUNGEON_EXIT_FLAG) = 0;
    MEM8(ADDR_DUNGEON_SWING_TMR) = 0;
    MEM8(ADDR_DUNGEON_SWING_FRAME) = 0xFF;
    MEM8(ADDR_PLACE_MAP_ID) = map_id;
}

// FIXME!
void wasm_dungeon_update(void)
{
    if (!MEM8(ADDR_DUNGEON_ACTIVE)) return;

    update_hero();
    update_sword();
    check_doors();
    update_monsters();
    MEM8(ADDR_FRAME_TIMER) = 0;
}

// FIXME!
void wasm_dungeon_full_tick(void)
{
    MEM8(ADDR_FRAME_TIMER)++;
}

uint8_t wasm_dungeon_get_viewport_top(void) { return MEM8(ADDR_VIEWPORT_TOP_ROW); }
uint16_t wasm_dungeon_get_entity_table(void) { return MEM16(ADDR_MDT + 0x10); }
uint16_t wasm_dungeon_get_entity_count(void) { return dungeon_entity_count; }
uint8_t wasm_dungeon_get_sword_frame(void) { return MEM8(ADDR_DUNGEON_SWING_FRAME); }
uint8_t wasm_dungeon_get_exit_map(void) { return MEM8(ADDR_DUNGEON_EXIT_MAP); }

// gemini:

// Checked
int8_t set_zero_flag_if_slippery(void) {
    if (MEM8(ADDR_CAVERN_LEVEL) == 4 && MEM8(ADDR_CURRENT_ACCESSORY) != ACCESSORY_RUZERIA_SHOES) {
        return 0;
    }
    return 0xff;
}

// Assembly internal route functions / variables
// TODO: remove (AI hallucinations)
static uint8_t ticks_counter = 0; // Local counter mapping 'ds:ticks' inside slope logic

// Stubs for missing functional procedures
// stub
void jump_press_handler(void) {}

// TODO: replace with actual code (AI hallucinations)
void flip_facing_direction(void) {
    MEM8(ADDR_FACING) ^= 1;
}

// stub
void hero_collapse_platform(void) {}

// CF: false (blocked from below), NC: true (can move down)
uint8_t check_floor_for_landing() {
    uint16_t si = hero_coords_to_addr_in_proximity();
    si += 3*36+1;
    wrap_map_from_above(&si);
    uint16_t di = si;
    uint8_t flags;
    get_dst_monster_flags(si, &flags); // check directly below hero feet
    if (flags & 0x80) return 0;
    si--;
    get_dst_monster_flags(si, &flags); // check below hero left side
    if (flags & 0x80) return 0;
    si = di;
    uint8_t tile = MEM8(si);
    if (is_non_blocking_tile_simple(tile)) return 0;
    if (MEM8(ADDR_HERO_ANIM_PHASE) == 0x80) return 0xff;
    si--;
    tile = MEM8(si);
    if (!is_non_blocking_tile_simple(tile)) return 0xff;
    si += 2;
    tile = MEM8(si);
    if (is_non_blocking_tile_simple(tile)) return 0;
    return 0xFF;
}

// TODO: replace with actual code (AI hallucinations)
void land_after_jump(void) {
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
}

// stub
void update_boss_heartbeat_volume(void) {}

// stub
void update_and_render_horiz_platforms(void) {}

// stub
void render_vertical_platforms_to_proximity(void) {}

// stub
void process_visible_collapsing_platforms(void) {}

// stub
void process_doors(void) {}

// stub
void dispatch_spell_projectile_movement(void) {}

// stub
void monsters_spawning(void) {}

// stub
void check_hero_contact_damage(void) {}

// stub
void Flush_Ui_Element_If_Dirty_proc(void) {}

// stub
void projectiles_collision_processing(void) {}

// stub
void monsters_updates(void) {}

// stub
void Render_Scrolling_Transition_Overlay_proc(void) {}

// stub
void step_on_aggressive_ground(void) {}

// stub
void damage_hero(uint16_t amount) {}

// stub
void render_notification_string(const char* str) {}

// stub
void screen_flash_overlay(void) {}

// stub
void input_handling(void) {}

// stub
void magic_spell_fire_handler(void) {}

// stub
void state_machine_dispatcher(void) {}

// INT 61h emulation mapping standard input flags (____right_left_down_up)
// TODO: remove (AI hallucinations)
static uint8_t bios_get_input_keys(void) {
    return MEM8(0xFF17u);
}

// ============================================================================
// main_loop — per-frame game loop
// ============================================================================
// Checked
void main_loop(void) {
    // test on_rope_flags
    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0) {
        input_handling();
        sliding_physics_step();
        main_update_render();
        magic_spell_fire_handler();
        hero_interaction_check();
        hero_knockback_handler();

        MEM8(ADDR_FRAME_TICKS)++;
        if (MEM8(ADDR_FRAME_TICKS) == 2) {
            MEM8(ADDR_SQUAT_FLAG) = 0;
        }
        // check input keys buffer
        if (MEM8(ADDR_INPUT_DIRS) & 2) {
            MEM8(ADDR_FACING) &= ~2;
        }
        airborne_movement();
        state_machine_dispatcher();
    } else { // over_rope path
        for (;;) {
            MEM8(ADDR_SQUAT_FLAG) = 0;
            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
            MEM8(ADDR_SLOPE_DIRECTION) = 0;
            MEM8(ADDR_SPELL_ACTIVE_FLAG) = 0;
            Flush_Ui_Element_If_Dirty_proc();
            MEM8(ADDR_SWORD_SWING_FLAG) = 0;
            main_update_render();
            hero_knockback_handler();
            state_machine_dispatcher();
            if (MEM8(ADDR_ON_ROPE_FLAGS) != 0xFF) break;
            uint16_t si = hero_coords_to_addr_in_proximity() + 1; // hero head
            if (is_over_rope(si)) continue;
            si += 36; // body level
            wrap_map_from_above(&si);
            if (!is_over_rope(si)) break;
        }
        MEM8(ADDR_FACING) &= ~2;
        MEM8(ADDR_ON_ROPE_FLAGS) = 0;
        MEM8(ADDR_SPACEBAR_LATCH) = 0;
        MEM8(ADDR_ALTKEY_LATCH) = 0;
        MEM8(ADDR_SLIDE_TICKS_REMAINING) = 0;
        MEM8(ADDR_HORIZ_MOVEMENT_ACCUM) = 0;
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x7F;
    }
    // in original, loop to main_loop again. We manage it on caller side.
}

// Checked
uint8_t is_over_rope(uint16_t si)
{
    uint8_t tile = MEM8(si);
    if (tile == 1 || tile == 2) return 0xFF;
    return 0;
}

// ============================================================================
// Exported Core Assembly Functions
// ============================================================================
// Checked
void hero_knockback_handler(void)
{
    if (MEM8(ADDR_BYTE_9F14) == 0) {
        return;
    }

    uint8_t moveLeft;

    if (MEM8(ADDR_BYTE_9F01) != 0) {
        moveLeft = 0xff; // true
    } else {
        uint8_t word9F0E_nonzero = MEM16(ADDR_KNOCKBACK_VECTOR_9F0E) != 0;

        moveLeft = word9F0E_nonzero && (MEM16(ADDR_KNOCKBACK_VECTOR_9F10) != 0) 
            ? (MEM8(ADDR_FACING) & LEFT) == 0 
            : !word9F0E_nonzero;
    }

    if (moveLeft) {
        if (MEM8(ADDR_ON_ROPE_FLAGS)) {
            MEM8(ADDR_FACING) = (MEM8(ADDR_FACING) & 0xFC) | LEFT;

            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
            MEM8(ADDR_SPACEBAR_LATCH) = 0;
        }

        move_hero_left_if_no_obstacles();
        move_hero_left_if_no_obstacles();
    } else {
        if (MEM8(ADDR_ON_ROPE_FLAGS))
        {
            MEM8(ADDR_FACING) &= 0xFC;

            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
            MEM8(ADDR_SPACEBAR_LATCH) = 0;
        }

        move_hero_right_if_no_obstacles();
        move_hero_right_if_no_obstacles();
    }

    if (MEM8(ADDR_ON_ROPE_FLAGS)) {
        MEM8(ADDR_ON_ROPE_FLAGS) = 0x80;
        MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    }

    if (MEM8(ADDR_AIR_UP_TILE_FOUND) != 0)
        return;

    if (MEM8(ADDR_JUMP_PHASE_FLAGS) & 0x80) {
        return;
    }

    if (!check_floor_for_landing()) return;

    if (MEM8(ADDR_BYTE_9F09) != 0) {
        MEM8(ADDR_BYTE_9F09)--;
        MEM8(ADDR_HERO_HEAD_Y_VIEW)++;
        return;
    } else {
        hero_scroll_down();
    }
}

// Checked
void sliding_physics_step(void) {
    if (set_zero_flag_if_slippery() != 0) {
        return; // NZ: not slippery
    }

    if (MEM8(ADDR_JUMP_PHASE_FLAGS) != 0) {
        return; // airborne
    }

    if (MEM8(ADDR_SLIDE_TICKS_REMAINING) == 0) {
        return;
    }

    MEM8(ADDR_SLIDE_TICKS_REMAINING)--;
    uint16_t si = hero_coords_to_addr_in_proximity();
    si += (3 * 36 + 1); // target tile directly below feet matrix center
    wrap_map_from_above(&si);

    uint8_t tile = MEM8(si);
    if (tile >= 0x40 && tile < 0x49) {
        MEM8(ADDR_SLIDE_TICKS_REMAINING) = 0; // stepped on non-slippery tile, stop sliding
        return;
    }

    // on the ice
    uint8_t slide_dir = MEM8(ADDR_SLIDE_DIRECTION);
    if ((MEM8(ADDR_SLIDE_DIRECTION_LOCK) & 1) == 0) {
        if (slide_dir == 2) return;
        move_hero_left_if_no_obstacles();
    } else {
        if (slide_dir == 1) return;
        move_hero_right_if_no_obstacles();
    }
}

// Checked
void right_up_pressed(void) {
    MEM8(ADDR_BYTE_9F0B) = 0xFF;
    jump_press_handler();
    on_right_pressed();
}

// Checked
void on_right_pressed() {
    MEM8(ADDR_BYTE_9F18) = 0;
    if (MEM8(ADDR_FACING) & LEFT) {
        flip_facing_direction();
        return;
    }
    if (MEM8(ADDR_SQUAT_FLAG) != 0) {
        return;
    }

    if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_LEFT || 
            move_hero_right_if_no_obstacles() == 0) { // CF emulation check
        init_on_ground();
        return;
    }

    MEM8(ADDR_SLIDE_DIRECTION) = SLIDE_RIGHT;
    if (MEM8(ADDR_ON_ROPE_FLAGS) != 0) {
        return;
    }

    if (set_zero_flag_if_slippery() == 0 && MEM8(ADDR_SLIDE_TICKS_REMAINING) == 0) {
        MEM8(ADDR_SLIDE_DIRECTION_LOCK) = 1; // right movement locked
        MEM8(ADDR_HORIZ_MOVEMENT_ACCUM)++;
    }

    MEM8(ADDR_FACING) |= UP;
    if (MEM8(ADDR_JUMP_PHASE_FLAGS) != 0) {
        return;
    }

    MEM8(ADDR_HERO_ANIM_PHASE) = (MEM8(ADDR_HERO_ANIM_PHASE) + 1) & 0x7F;
    MEM8(ADDR_BYTE_9F19) = 0;
}

// Checked
void init_on_ground() 
{
    // stub
    MEM8(ADDR_FACING) &= ~UP;
    if (MEM8(ADDR_ON_ROPE_FLAGS) == 0 && MEM8(ADDR_JUMP_PHASE_FLAGS) == 0) {
        MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
    }
}

// Checked
void left_up_pressed(void) {
    MEM8(ADDR_BYTE_9F0B) = 0xFF;
    jump_press_handler();
    on_left_pressed();
}

// Checked
void on_left_pressed() {
    MEM8(ADDR_BYTE_9F18) = 0;
    if (!(MEM8(ADDR_FACING) & LEFT)) {
        flip_facing_direction();
        return;
    }

    if (MEM8(ADDR_SQUAT_FLAG) != 0) {
        return;
    }

    if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT || 
            move_hero_left_if_no_obstacles() == 0) { // CF emulation check
        init_on_ground();
        return;
    }

    MEM8(ADDR_SLIDE_DIRECTION) = SLIDE_LEFT;
    if (MEM8(ADDR_ON_ROPE_FLAGS) != 0) {
        return;
    }

    if (set_zero_flag_if_slippery() == 0 && MEM8(ADDR_SLIDE_TICKS_REMAINING) == 0) {
        MEM8(ADDR_SLIDE_DIRECTION_LOCK) = 0; // left movement unlocked
        MEM8(ADDR_HORIZ_MOVEMENT_ACCUM)++;
    }

    MEM8(ADDR_FACING) |= UP;
    if (MEM8(ADDR_JUMP_PHASE_FLAGS) != 0) {
        return;
    }

    MEM8(ADDR_HERO_ANIM_PHASE) = (MEM8(ADDR_HERO_ANIM_PHASE) + 1) & 0x7F;
    MEM8(ADDR_BYTE_9F19) = 0;
}

//
void airborne_movement(void) {
    if (MEM8(ADDR_AIR_UP_TILE_FOUND) != 0) {
        return;
    }
    if (MEM8(ADDR_JUMP_PHASE_FLAGS) & 0x80) {
        return;
    }

    hero_collapse_platform();
    // Custom logic simulating slope assist on landing
    // Handles reading tiles under feet and checking forced sliding down
    {
        MEM8(ADDR_SLOPE_DIRECTION) = 0;
        uint16_t si_slope = hero_coords_to_addr_in_proximity() + (2 * 36 + 1);
        wrap_map_from_above(&si_slope);
        
        // Emulated checking: get slope direction from tile
        uint8_t target_tile = MEM8(si_slope);
        uint8_t dl_dir = 0;
        if (target_tile == LEFT_SLOPE_TILE) dl_dir = SLOPE_LEFT;
        else if (target_tile == RIGHT_SLOPE_TILE) dl_dir = SLOPE_RIGHT;

        if (dl_dir != 0) {
            MEM8(ADDR_FACING) &= 0xFD; // mask vertical inputs out
            MEM8(ADDR_SLOPE_DIRECTION) = dl_dir;
            if (MEM8(ADDR_HEIGHT_ABOVE_GROUND) == 0) {
                uint8_t current_ticks = ticks_counter++;
                if ((current_ticks & 3) == 0) {
                    uint8_t input = bios_get_input_keys();
                    if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT) {
                        if (!(input & 0x04)) move_hero_right_if_no_obstacles();
                    } else {
                        if (!(input & 0x08)) move_hero_left_if_no_obstacles();
                    }
                }
            } else {
                if (MEM8(ADDR_CURRENT_ACCESSORY) != ACCESSORY_SILKARN_SHOES) {
                    MEM8(ADDR_HEIGHT_ABOVE_GROUND)--;
                    if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT) {
                        move_hero_right_if_no_obstacles();
                    } else {
                        move_hero_left_if_no_obstacles();
                    }
                }
            }
        }
    }

    uint8_t cf = 0, zf = 0;
    check_floor_for_landing_internal(&cf, &zf);
    if (cf == 0) {
        land_after_jump();
        return;
    }

// loc_6978:
    MEM8(ADDR_JUMP_HEIGHT_COUNTER)++;
    if (MEM8(ADDR_BYTE_9F09) != 0) {
        MEM8(ADDR_BYTE_9F09)--;
        MEM8(ADDR_HERO_HEAD_Y_IN_VIEWPORT_INITIAL_FROM_MDT)++;
        zf = 0; // popped flags condition simulation
    } else {
        zf = 1;
    }

    if (zf != 0) { // popped conditional fall off cliff check
        hero_scroll_down();
    }

// loc_6993:
    if (!(MEM8(ADDR_FACING) & 2)) {
        uint16_t si = hero_coords_to_addr_in_proximity() + (36 * 2 + 1);
        wrap_map_from_above(&si);
        if (is_rope_tile(MEM8(si))) {
            MEM8(ADDR_ON_ROPE_FLAGS) = 0xFF; // Grab onto rope mid-air
            return;
        }
    }

// loc_69AE:
    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
    uint8_t old_phase = MEM8(ADDR_JUMP_PHASE_FLAGS);
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0x7F;
    if (MEM8(ADDR_SLOPE_DIRECTION) != 0) return;
    if (MEM8(ADDR_INVINCIBILITY_FLAG) != 0) return;

    if (old_phase == 0) {
        if (MEM8(ADDR_FACING) & 1) {
            left_up_pressed();
        } else {
            right_up_pressed();
        }
        MEM8(ADDR_FACING) &= 0xFD;
        return;
    }

// read_keys_buffer:
    uint8_t input_keys = bios_get_input_keys();
    uint8_t horiz_input = input_keys & 0x0C;

    if (horiz_input == 0x04) { // left_pressed
        if (!(MEM8(ADDR_FACING) & 1)) {
            MEM8(ADDR_FACING) &= 0xFD;
            flip_facing_direction();
        }
        // loc_6A1E:
        uint16_t si = hero_coords_to_addr_in_proximity() + (3 * 36 + 1);
        wrap_map_from_above(&si);
        if (is_non_blocking_tile(MEM8(si)) == 0) {
            if (is_non_blocking_tile(MEM8(si + 1)) != 0) {
                move_hero_right_if_no_obstacles();
            }
        }
        return;
    }
    
    if (horiz_input == 0x08) { // right_pressed
        if (MEM8(ADDR_FACING) & 1) {
            MEM8(ADDR_FACING) &= 0xFD;
            flip_facing_direction();
        }
        // loc_6A4A:
        uint16_t si = hero_coords_to_addr_in_proximity() + (3 * 36 + 1);
        wrap_map_from_above(&si);
        if (is_non_blocking_tile(MEM8(si)) == 0) {
            if (is_non_blocking_tile(MEM8(si - 1)) != 0) {
                move_hero_left_if_no_obstacles();
            }
        }
        return;
    }

// loc_69F2:
    if (MEM8(ADDR_FACING) & 0x01) { // UP mask flag checking matching layout
        if (horiz_input == 0x04) {
            left_up_pressed();
        } else if (horiz_input == 0x08) {
            right_up_pressed();
        }
    }
}

void slope_assist_on_landing(void) {
    MEM8(ADDR_SLOPE_DIRECTION) = 0;

    uint16_t si = hero_coords_to_addr_in_proximity();
    si += 2*36 + 1;
    wrap_map_from_above(&si);

    uint8_t dl;
    // get_slope_direction_by_tile_under_feet returns NZ if slope, ZF if none.
    // In C we simulate: if returns 0 -> no slope.
    if (get_slope_direction_by_tile_under_feet(si, &dl) == 0) return;

    MEM8(ADDR_FACING) &= ~2;
    MEM8(ADDR_SLOPE_DIRECTION) = dl;

    if (MEM8(ADDR_HEIGHT_ABOVE_GROUND) != 0) {
        if (MEM8(ADDR_CURRENT_ACCESSORY) == ACCESSORY_SILKARN_SHOES) return;
        MEM8(ADDR_HEIGHT_ABOVE_GROUND)--;
        if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT) {
            move_hero_right_if_no_obstacles();
        } else {
            move_hero_left_if_no_obstacles();
        }
        return;
    }

    // height_above_ground == 0
    ticks_counter++;
    if ((ticks_counter & 3) != 0) return;

    uint8_t keys = bios_get_input_keys();
    if (MEM8(ADDR_SLOPE_DIRECTION) == SLOPE_RIGHT) {
        if ((keys & 0x08) == 0) move_hero_right_if_no_obstacles();
    } else {
        if ((keys & 0x04) == 0) move_hero_left_if_no_obstacles();
    }
}

void check_airflows_on_hero()
{
    MEM8(ADDR_AIR_UP_TILE_FOUND) = 0;
    uint16_t si = hero_coords_to_addr_in_proximity();
    si += 2 * PROX_COLS + 1;
    wrap_map_from_above(&si);
    for (int i = 0; i < 3; i++) {
        dispatch_airflows(si);
        si -= PROX_COLS;
        wrap_map_from_below(&si);
    }
}

// TODO: move rendering to js
void main_update_render(void) {
    uint8_t jump_height = 2;
    if (MEM8(ADDR_CURRENT_ACCESSORY) == ACCESSORY_FERUZA_SHOES) {
        jump_height = 4;
    }
    MEM8(ADDR_JUMP_HEIGHT_INCLUDING_SHOES) = jump_height;
    check_airflows_on_hero();

    if (MEM8(ADDR_JUMP_PHASE_FLAGS) == 0) {
        MEM8(ADDR_BYTE_9F09) = 0;
        if (MEM8(ADDR_BYTE_9F00) != MEM8(ADDR_HERO_HEAD_Y_VIEW)) {
            if (MEM8(ADDR_BYTE_9F00) < MEM8(ADDR_HERO_HEAD_Y_VIEW)) {
                hero_scroll_down();
                MEM8(ADDR_HERO_HEAD_Y_VIEW)--;
            } else {
                move_hero_up();
                MEM8(ADDR_HERO_HEAD_Y_VIEW)++;
            }
        }
    }

    if (MEM8(ADDR_IS_JASHIIN_CAVERN) != 0 || MEM8(ADDR_IS_BOSS_CAVERN) != 0) {
        uint16_t si = MEM16(ADDR_BOSS_STATE_PTR) + 7; // arena_center_x; e.g. 12 for Crab
        if (MEM8(ADDR_HERO_X_VIEW) != MEM8(si)) {
            move_hero_right_if_no_obstacles();
            MEM8(ADDR_HERO_X_VIEW)--;
        }
    } else {
        if (MEM8(ADDR_HERO_X_VIEW) != 12) {
            move_hero_left_if_no_obstacles();
            MEM8(ADDR_HERO_X_VIEW)++;
        }
    }

    MEM8(ADDR_HERO_Y) = (MEM8(ADDR_HERO_HEAD_Y_VIEW) + MEM8(ADDR_VIEWPORT_TOP_ROW)) & 0x3F;
    update_boss_heartbeat_volume();
    update_and_render_horiz_platforms();
    render_vertical_platforms_to_proximity();
    process_visible_collapsing_platforms();
    process_doors();
    dispatch_spell_projectile_movement();

    if (MEM8(ADDR_BOSS_IS_DEAD) == 0) {
        monsters_spawning();
    }

    MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
    MEM8(ADDR_BYTE_9F14) = 0;
    check_hero_contact_damage();
    Flush_Ui_Element_If_Dirty_proc(); // request canvas redraw, todo
    projectiles_collision_processing();
    monsters_updates();
    Render_Scrolling_Transition_Overlay_proc(); // something familiar... sword?
    step_on_aggressive_ground();

    if (MEM8(ADDR_CAVERN_LEVEL) == 7 && MEM8(ADDR_CURRENT_ACCESSORY) != ACCESSORY_ASBESTOS_CAPE) { // heat damage
        MEM8(ADDR_TEMPERATURE_TIMER)++;
        if ((MEM8(ADDR_TEMPERATURE_TIMER) & 0x3F) == 0) {
            MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0xFF;
            MEM8(ADDR_SOUND_FX_REQUEST) = 9;
            damage_hero(0x0F);
            render_notification_string("It's too hot !!");
        }
    }

    screen_flash_overlay();
    if (MEM8(ADDR_INVINCIBILITY_FLAG) != 0) {
        MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
        game_loop_render_and_timing(1);
    } else {
        game_loop_render_and_timing(0);
    }
}

// ============================================================================
// Rendering + timing portion of the per-frame cycle.
// TODO: move handling to js
// ============================================================================
void game_loop_render_and_timing(uint8_t invincible)
{
    if (!invincible) {
        MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;
    }
    // Locals for timing loops
    uint8_t cl;
    uint16_t ax;

    MEM8(ADDR_SHIELD_ANIM_ACTIVE) = 0;

    // Sword swing active?
    if (MEM8(ADDR_SWORD_SWING_FLAG) != 0) {
        MEM8(ADDR_SHIELD_ANIM_ACTIVE) = 0xFF;
        MEM8(ADDR_SHIELD_VARIANT_INDEX) = MEM8(ADDR_SWORD_HIT_TYPE);
        MEM8(ADDR_SHIELD_ANIM_PHASE) = MEM8(ADDR_SWORD_MOVEMENT_PHASE);
    } else if (MEM8(ADDR_SPELL_ACTIVE_FLAG) != 0) {
        MEM8(ADDR_SHIELD_ANIM_ACTIVE) = 0xFF;
        MEM8(ADDR_SHIELD_ANIM_PHASE) = MEM8(ADDR_9F2B);
        MEM8(ADDR_SHIELD_VARIANT_INDEX) = 1;
    }

    if (MEM8(ADDR_HERO_SPRITE_HIDDEN) == 0) {
        clear_hero_in_viewport();          // stub
    }

    Sample_Neighborhood_Attributes_proc(); // builds attribute cache for viewport tiles
    // Check from here!!!
    if (MEM8(ADDR_INVINCIBILITY_FLAG) == 0) {
        uint16_t timer = MEM16(ADDR_HEALING_TIMER);
        if (timer != 0) {
            timer--;
            MEM16(ADDR_HEALING_TIMER) = timer;
            MEM16(ADDR_HERO_HP) += 8;      // faster HP restoration (potions ?)
            if (MEM16(ADDR_HERO_HP) >= MEM16(ADDR_HERO_MAX_HP)) {
                MEM16(ADDR_HERO_HP) = MEM16(ADDR_HERO_MAX_HP);
                MEM16(ADDR_HEALING_TIMER) = 0;
            }
            MEM8(ADDR_SOUND_FX_REQUEST) = 19;
            Draw_Hero_Health_proc();
        }
    }

    Refresh_Dirty_Tiles_proc();            // redraw tile changes to VRAM

    if (MEM8(ADDR_SPRITE_FLASH_FLAG) != 0) {
        // combine 3x3 body, 3x3 left hand (with or without shield), 3x3 right hand from fman.grp
        // with optional 4x4 sword from sword.grp into complete hero image, depending on animation phase
        Active_Entity_Sprite_Renderer_proc();
        MEM8(ADDR_BYTE_FF24) = 10;
    }

    // Timing loop 1: wait until frame_timer >= speed_const * 2
    while (MEM8(ADDR_FRAME_TIMER) < 2*MEM8(ADDR_SPEED_CONST)) {
        // busy wait
    }

    monsters_updates();                    // second pass – commit sprite positions
    Flush_Ui_Element_If_Dirty_proc();
    update_and_render_projectile_row_pair();
    render_and_collision_pass_row();
    update_active_projectiles_render();
    apply_sword_hit_to_map_tiles();
    Render_Scrolling_Transition_Overlay_proc();

    // Timing loop 2: wait until frame_timer >= speed_const * 4
    // Inner loop – process dialog/pause/joystick/restore while waiting for frame timer
    do {
        Confirm_Exit_Dialog_proc(); // Ctrl+Q dialog
        Handle_Pause_State_proc(); // Esc dialog
        Handle_Speed_Change_proc(); // F9 dialog
        // Joystick_Calibration_proc(); // Ctrl+J dialog
        // Joystick_Deactivator_proc();
        if (Handle_Restore_Game_proc()) { // F7 dialog: original returns CF if restore requested
            restore_game();
        }
    } while (MEM8(ADDR_FRAME_TIMER) < 4*MEM8(ADDR_SPEED_CONST));

    MEM8(ADDR_FRAME_TIMER) = 0;

    if (MEM8(ADDR_INVINCIBILITY_FLAG) != 0) {
        return;
    }

    // Hero death check
    if (MEM8(ADDR_HERO_INVINCIBILITY) == 0 && MEM16(ADDR_HERO_HP) == 0) {
        process_hero_death();
        return;
    }

    // Passive HP regeneration (every 16 frames)
    MEM8(ADDR_BYTE_9F18)++;               // byte_9F18 (frame counter)
    if (MEM8(ADDR_BYTE_9F18) >= 16) {
        MEM8(ADDR_BYTE_9F18) = 0;
        if (MEM16(ADDR_HERO_HP) < MEM16(ADDR_HERO_MAX_HP)) {
            MEM16(ADDR_HERO_HP) += 2;
            Draw_Hero_Health_proc();
        }
    }

    // Check for pending map load
    if (MEM8(ADDR_BYTE_9F1E) != 0) {
        load_place_and_reinit();
        return;
    }

    // Boss defeat reward (XP + almas)
    if (MEM8(ADDR_IS_BOSS_CAVERN) != 0 && MEM8(ADDR_BOSS_IS_DEAD) != 0) {
        if (MEM8(ADDR_ACTIVE_ENTITY_TABLE) == 0xFF) {
            uint16_t si = MEM16(ADDR_BOSS_STATE_PTR);
            uint16_t xp_reward = MEM16(si + 5); // xp_reward
            update_hero_XP(xp_reward);
            uint16_t almas_reward = MEM16(si + 11); // almas_reward
            hero_got_almas(almas_reward);
            MEM8(ADDR_BYTE_9F1E) = 0xFF;
        }
    }

    // If boss is being hit, exit early (skip inventory check)
    if (MEM8(ADDR_BOSS_BEING_HIT) != 0) {
        return;
    }

    // Inventory key (ENTER) handling
    if (MEM16(ADDR_F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter) & KEY_ENTER) {
        bring_inventory_window();
    } else {
        MEM8(ADDR_BYTE_9EF5) = 0;
    }
}

// dispatch_airflows and helper tables
// ============================================================================
void dispatch_airflows(uint16_t si) {
    uint8_t tile = MEM8(si);
    uint8_t dir = get_airflow_direction(tile);
    if (dir == 0xFF) return;

    switch (dir) {
        case 0: // up
            move_hero_up();
            move_hero_up();
            MEM8(ADDR_AIR_UP_TILE_FOUND) = 0xFF;
            MEM8(ADDR_JUMP_PHASE_FLAGS) = 0; // no jumps while flying
            MEM8(ADDR_HERO_ANIM_PHASE) = 0x80; // idle
            break;
        case 1: // left
            move_hero_left_if_no_obstacles();
            move_hero_left_if_no_obstacles();
            break;
        case 2: // right
            move_hero_right_if_no_obstacles();
            move_hero_right_if_no_obstacles();
            break;
    }
}

// ============================================================================
// try_door_interaction — handle hero stepping onto a door tile
// 49 4A 61 4B 4C
// 4D 58 00 59 4E
// 5F 5A 00 5B 60
// 5F 5C 5D 5E 60
// This matrix 5x4 tiles describes the door frame
// ============================================================================
void try_door_interaction(void)
{
    uint16_t si = hero_coords_to_addr_in_proximity();
    si -= 36 + 1;                       // x--, y--
    wrap_map_from_below(&si);

    // Check three adjacent tiles for a door (0x4A)
    if (MEM8(si) == 0x4A) {
        // on_the_right_door_tile
        if ((MEM8(ADDR_FACING) & 1) == 0) {
            // pop ax (discard return address) and jump to move right
            move_hero_right_if_no_obstacles();
        }
        return;
    }

    si++;
    if (MEM8(si) == 0x4A) {
        // enter_the_door — this is the main door handling block
        goto enter_the_door;
    }

    si++;
    if (MEM8(si) == 0x4A) {
        // on_the_left_door_tile
        if (MEM8(ADDR_FACING) & 1) {
            move_hero_left_if_no_obstacles();
        }
        return;
    }
    return; // no door

enter_the_door:
    {
        // Compute hero absolute X (proximity_map_left_col_x + hero_x_in_viewport + 4)
        uint16_t ax = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
        uint8_t bl = MEM8(ADDR_HERO_X_VIEW);
        bl += 4;
        ax += bl;                       // hero_x_absolute

        uint16_t bx = MEM16(ADDR_MAP_WIDTH);
        bx--;
        if (bx >= ax) {
            // no_wrap
        } else {
            bx = ~bx;
            ax = bx;
        }

        uint8_t bl2 = MEM8(ADDR_HERO_HEAD_Y_VIEW);
        bl2--;
        bl2 += MEM8(ADDR_VIEWPORT_TOP_ROW);
        bl2 &= 0x3F;                    // hero_y_absolute (wrapped)

        si = MEM16(ADDR_DOORS_TABLE);   // doors_table_addr

next_door1:
        if (MEM16(si) == 0xFFFF) return; // end of doors marker

        if (ax == MEM16(si + 0) && bl2 == MEM8(si + 2)) {
            // match found
            // pop ax (discard return address)
            if (MEM8(si + 3) & 0x80) { // door.d_flags bit 7 = open
                goto door_is_open;
            } else {
                // try to open door
                if (open_door(si) == 0) { // CF clear = success
                    return;
                }
                // failed to open (carry set)
                MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
                MEM8(ADDR_HORIZ_MOVEMENT_ACCUM) = 0;
                if (MEM8(ADDR_BYTE_9F19) != 0) return;
                MEM8(ADDR_BYTE_9F19) = 0xFF;
                MEM8(ADDR_SOUND_FX_REQUEST) = 22;
                render_notification_string("CAN'T OPEN THIS DOOR");
                return;
            }
        }
        si += 12;                       // sizeof(door)
        goto next_door1;

door_is_open:
        {
            uint16_t bx = MEM16(si + 9);   // d_save_achievement_addr
            if (bx != 0xFFFF) {
                uint8_t al = MEM8(si + 11); // d_achievement_flag
                MEM8(bx) |= al;
            }

            // push si (save door pointer)
            Browse_Projectiles();          // clears projectile array
            clear_viewport_buffer();
            Flush_Ui_Element_If_Dirty_proc();
            reset_dungeon_state_vars();
            game_loop_render_and_timing(); // redraw everything

            // Clear monster table (write 0xFFFF at monsters_table_addr)
            uint16_t monsters_ptr = MEM16(ADDR_MONSTERS_TABLE);
            MEM16(monsters_ptr) = 0xFFFF;

            // pop si (restore door pointer)
            uint8_t door_flags = MEM8(si + 3);
            uint8_t door_type = door_flags & 7;
            uint16_t x1 = MEM16(si + 5);
            uint8_t y1 = MEM8(si + 7);
            uint8_t door_features = MEM8(si + 8);
            uint8_t place_map_id = MEM8(si + 4);
            uint8_t is_left_run = (door_flags >> 6) & 1;

            // Set up transition globals
            MEM16(ADDR_HERO_X_IN_PROXIMITY_MAP) = x1;
            MEM8(ADDR_DOOR_TARGET_Y) = y1;
            MEM8(ADDR_IS_LEFT_RUN) = is_left_run;
            MEM8(ADDR_DOOR_FEATURES) = door_features;

            if (y1 == 0xFF) {
                place_map_id |= 0x80;   // door leads to town
            }
            MEM8(ADDR_PLACE_MAP_ID) = place_map_id;

            // Load new MDT (map descriptor table)
            // fn1_load_mdt_idx_ah
            load_mdt(place_map_id & 0x7F);

            if (place_map_id & 0x80) {
                // it's a town – skip item removal
            } else {
                remove_accomplished_items();
            }

            // Position hero
            hero_left_16_down_1();          // sets hero_x_in_viewport = 0x0C, hero_head_y_in_viewport = 1

            // Check MDT descriptor bit 0 (town vs dungeon)
            uint16_t mdt_ptr = MEM16(ADDR_MDT);
            uint8_t mdt_desc = MEM8(mdt_ptr);   // b7b6_msd_idx_b0
            if ((mdt_desc & 1) == 0) {
                // Town map – load Roca graphics
                if (mdt_desc & 2) {
                    // Load vfs_roka_grp_2 (town set 2)
                    load_resource(2, vfs_roka_grp_2, packed_tile_ptr);
                } else {
                    // Load vfs_roka_grp_1 (town set 1)
                    load_resource(2, vfs_roka_grp_1, packed_tile_ptr);
                }
                Reassemble_3_Planes_To_Packed_Bitmap_proc(packed_tile_ptr, 0x80);
                Render_Roca_Tilemap_proc(door_type);
                // set mman_grp_index = 0xFF, byte_FF24 = 0x0A
                MEM8(ADDR_MMAN_GRP_INDEX) = 0xFF;
                MEM8(0xFF24) = 0x0A;
            } else {
                // Dungeon map – load proper graphics
                if (mdt_desc & 2) {
                    load_resource(2, vfs_roka_grp_2, packed_tile_ptr);
                } else {
                    load_resource(2, vfs_roka_grp_1, packed_tile_ptr);
                }
                Reassemble_3_Planes_To_Packed_Bitmap_proc(packed_tile_ptr, 0x80);
                Render_Roca_Tilemap_proc(door_type);
                process_mdt_descriptor(mdt_desc);
            }

            // Clear hero hidden flag
            MEM8(ADDR_HERO_HIDDEN_FLAG) = 0;
            MEM8(0x9EF5) = 0xFF;
            MEM8(ADDR_PROJECTILES_ARRAY) = 0xFF;

            if (door_features & 0x80) {
                // Special town transition with rocademo.bin
                load_resource(3, rokademo_bin, 0xA000); // load to seg1:A000
                roca_entrypoint();
                MEM8(ADDR_ENP_GRP_INDEX) = 0xFF;
                MEM8(ADDR_EAI_BIN_INDEX) = 0xFF;
                MEM8(ADDR_BYTE_9EFA) = MEM8(ADDR_MSD_INDEX);
                MEM8(0x9F02) = 0xFF;
                load_cavern_sprites_ai_music();
                // load fman.grp for hero in dungeon
                load_resource(2, vfs_fman_grp, fman_gfx);
                Decompress_Tile_Data_proc(fman_gfx + 0x333, hero_transparency_masks, 230);
                goto after_run_animation;
            }

            // Animate hero running into the new map
            if (MEM8(ADDR_IS_LEFT_RUN) != 0) {
                // run to the left
                MEM8(ADDR_FACING) |= 1;   // face left
                uint16_t bx = 0x406E;     // starting screen X
                for (int cx = 26; cx > 0; cx--) {
                    MEM8(ADDR_HERO_ANIM_PHASE)++;
                    Update_Local_Attribute_Cache_proc();
                    bx -= 2;
                    Calculate_Tile_VRAM_Address_proc(bx);
                    sleep_loop_handle_system_keys();
                    bx += 4;
                    Draw_Bordered_Rectangle_proc(0x218, 0, 0, 0, 0); // clears area
                }
                Draw_Bordered_Rectangle_proc(0x618, 0, 0, 0, 0);
            } else {
                // run to the right
                MEM8(ADDR_FACING) &= ~1;  // face right
                uint16_t bx = 0xA6E;
                for (int cx = 26; cx > 0; cx--) {
                    MEM8(ADDR_HERO_ANIM_PHASE)++;
                    Update_Local_Attribute_Cache_proc();
                    bx += 2;
                    Calculate_Tile_VRAM_Address_proc(bx);
                    sleep_loop_handle_system_keys();
                    Draw_Bordered_Rectangle_proc(0x218, 0, 0, 0, 0);
                }
                Draw_Bordered_Rectangle_proc(0x618, 0, 0, 0, 0);
            }

after_run_animation:
            // Final dungeon or town setup
            mdt_desc = MEM8(ADDR_MDT);
            if (mdt_desc & 1) {
                // dungeon
                load_cavern_sprites_ai_music();
                mdt_desc = MEM8(ADDR_MDT);
                uint8_t ah = mdt_desc;
                ah <<= 1;
                uint8_t bl = (ah & 0x80) ? 0xFF : 0;
                MEM8(ADDR_IS_BOSS_CAVERN) = bl;
                ah <<= 1;
                bl = (ah & 0x80) ? 0xFF : 0;
                MEM8(ADDR_IS_JASHIIN_CAVERN) = bl;
                MEM8(ADDR_BOSS_BEING_HIT) = 0;
                MEM8(ADDR_SPRITE_FLASH_FLAG) = 0;
                Clear_Viewport_proc();
                MEM8(ADDR_HERO_X_VIEW) = 0x0C;
                MEM8(ADDR_HERO_HEAD_Y_VIEW) = MEM8(ADDR_HERO_HEAD_Y_IN_VIEWPORT_INITIAL_FROM_MDT);
                MEM8(ADDR_BYTE_9F00) = MEM8(ADDR_HERO_HEAD_Y_VIEW);
                MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
                Reassemble_3_Planes_To_Packed_Bitmap_proc(0x8030, 0x66);
                NoOperation_proc();
                Load_Magic_Spell_Sprite_Group_proc();
                Reassemble_3_Planes_To_Packed_Bitmap_proc(/* magic sprite data */, 24);
                Cavern_Game_Init();
            } else {
                // town
                uint8_t mman_idx = MEM8(ADDR_MDT + 1);
                uint16_t offset = mman_idx * 11;
                uint16_t si2 = offset + vfs_mman_grp;
                load_resource(2, si2, 0x4000);
                // Transfer to town code
                edge_locking_scrolling_window();  // sets proximity_map_left_col_x and hero_x_in_viewport
                uint8_t msd_idx = (MEM8(ADDR_MDT) >> 1) & 0x1F;
                MEM8(ADDR_MSD_INDEX) = msd_idx;
                offset = msd_idx * 11;
                si2 = offset + vfs_mgt1_msd;
                load_resource(5, si2, 0x3000);   // load music
                // fn0_swap_town_vs_cavern_gfx_drv_and_jmp_bx
                swap_to_town_graphics_and_jump(0);
            }
        }
    }
}

void update_horiz_platform_coords(uint16_t si) {
    // si points to a horiz_platform struct
    uint8_t cl = MEM8(si + 2); // y_and_flags
    MEM8(si + 2) &= 0xBF;      // clear pause bit

    if (cl & 0x40) return;     // paused

    uint16_t ax = MEM16(si);   // x (low byte of x_and_flags)
    if (MEM8(si + 2) & 0x80) {
        // leftward
        ax--;
        if (ax == 0xFFFF) {
            ax = MEM16(ADDR_MAP_WIDTH) - 1;
        }
        // hero_on_horiz_platform check omitted (stub)
        MEM16(si) = (ax & 0xFF) | (MEM16(si) & 0xFF00);
        if (MEM16(si + 4) == ax) {
            MEM8(si + 2) ^= 0x80; // change direction
            MEM8(si + 2) |= 0x40; // pause
        }
    } else {
        // rightward
        ax++;
        MEM16(si) = (ax & 0xFF) | (MEM16(si) & 0xFF00);
        if (MEM16(si + 6) == ax) {
            MEM8(si + 2) ^= 0x80;
            MEM8(si + 2) |= 0x40;
        }
    }
}

