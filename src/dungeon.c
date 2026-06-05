#include <stdint.h>
#include <string.h>

#include "zeliard.h"
#include "dungeon.h"

#define MEM8(addr)   (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)  (*(uint16_t *)&g_mem[(addr) & 0xFFFF])


#define ADDR_BOSS_CAVERN_SPECIAL      0x9F01u
#define ADDR_PACKED_MAP_PTR_MINUS     0x9F04u  // word: packed_map_ptr_for_prox_left
#define ADDR_PACKED_MAP_PTR_PLUS      0x9F06u  // word: packed_map_ptr_for_prox_right
#define ADDR_JUMP_HEIGHT_COUNTER      0x9F08u
#define ADDR_BYTE_9F09                0x9F09u  // vertical scroll offset
#define ADDR_HEIGHT_ABOVE_GROUND      0x9F0Cu
#define ADDR_FERUZA_SHOES_FOUR_TWO    0x9F0Du  // normally 2, Feruza shoes set to 4
#define ADDR_KNOCKBACK_VECTOR_X       0x9F0Eu  // word
#define ADDR_KNOCKBACK_VECTOR_Y       0x9F10u  // word
#define ADDR_HIT_THIS_FRAME           0x9F14u
#define ADDR_AIR_UP_TILE_FOUND        0x9F15u
#define ADDR_HERO_X_IN_PROXIMITY_MAP  0x9F1Au // word
#define ADDR_SLIDE_TICKS_REMAINING    0x9F20u
#define ADDR_HORIZ_MOVEMENT_ACCUM     0x9F21u
#define ADDR_SLIDE_DIRECTION          0x9F22u  // 1=right, 2=left
#define ADDR_SLIDE_DIRECTION_LOCK     0x9F23u  // 1=right movement

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
#define ADDR_INPUT_DIRS          0xFF17u  // ____right_left_down_up
#define ADDR_ENTER_KEYS          0xFF18u
#define ADDR_FRAME_TIMER         0xFF1Au
#define ADDR_SPACEBAR_LATCH      0xFF1Du
#define ADDR_VIEWPORT_LEFT_TOP   0xFF31u  // word: address in proximity map for top-left of viewport
#define ADDR_HERO_Y              0xFF35u   // hero_y_absolute (byte)
#define ADDR_JUMP_PHASE_FLAGS    0xFF3Du
#define ADDR_ON_ROPE_FLAGS       0xFF39u
#define ADDR_SLOPE_DIRECTION     0xFF42u  // 1=right, 2=left
#define ADDR_TICK_COUNTER        0xFF50u
#define ADDR_SOUND_FX_REQUEST    0xFF75u

#define ADDR_DUNGEON_VIEW_TOP    0xFFE0u
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


static uint16_t dungeon_map_width;
static uint16_t dungeon_entity_count;

static uint16_t ptr_to_off(uint16_t ptr)
{
    return ptr >= ADDR_MDT ? (uint16_t)(ptr - ADDR_MDT) : ptr;
}

// Wrap functions exactly as in f_map.inc
static void wrap_map_from_above(uint16_t *si) {
    if (*si >= PROXIMITY_END) {
        *si -= PROXIMITY_SIZE;
    }
}

static void wrap_map_from_below(uint16_t *si) {
    if (*si < ADDR_PROXIMITY) {
        *si += PROXIMITY_SIZE;
    }
}

// Convert (x, y) in proximity coordinates (x 0..35, y 0..63) to address
static uint16_t coords_to_prox_addr(uint8_t x, uint8_t y) {
    y &= 0x3F;
    return ADDR_PROXIMITY + (uint16_t)y * 36 + x;
}

// Hero's top-left tile address in proximity map (from f_map.inc)
// Use macro MEM to access actual data at this address
static uint16_t hero_coords_to_addr_in_proximity(void) {
    uint8_t head_y = MEM8(ADDR_HERO_HEAD_Y_VIEW);
    uint8_t view_x = MEM8(ADDR_HERO_X_VIEW);
    uint16_t base = MEM16(ADDR_VIEWPORT_LEFT_TOP);
    uint16_t addr = base + head_y * 36 + view_x + 4;
    wrap_map_from_above(&addr);
    return addr; // within 0xe000-0xe8ff
}

// Move viewport up one row (when hero jumps or climbs)
static void move_hero_up(void) {
    uint8_t top = MEM8(ADDR_VIEWPORT_TOP_ROW);
    if (top > 0) {
        top--;
        MEM8(ADDR_VIEWPORT_TOP_ROW) = top;
        MEM8(ADDR_DUNGEON_VIEW_TOP) = top;   // keep drawing variable in sync
    }
    uint16_t addr = MEM16(ADDR_VIEWPORT_LEFT_TOP);
    addr -= 36;
    wrap_map_from_below(&addr);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;
}

// Move viewport down one row (when falling)
static void hero_scroll_down(void) {
    uint8_t top = MEM8(ADDR_VIEWPORT_TOP_ROW);
    if (top < DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON) {
        top++;
        MEM8(ADDR_VIEWPORT_TOP_ROW) = top;
        MEM8(ADDR_DUNGEON_VIEW_TOP) = top;
    }
    uint16_t addr = MEM16(ADDR_VIEWPORT_LEFT_TOP);
    addr += 36;
    wrap_map_from_above(&addr);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;
}

// Update hero's absolute Y and adjust viewport if needed (called after vertical movement)
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

// ----------------------------------------------------------------------
// Move left (scroll map right) with obstacle checks
// Returns 1 if movement succeeded, 0 if blocked.
// ----------------------------------------------------------------------
// Horizontal movement – centered scrolling (hero_x_in_viewport constant)
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
    proximity_scroll_right(new_left);   // shift map right, fill new leftmost column
    MEM8(ADDR_FACING) = 1;              // face left
    // Absolute X updates automatically via hero_abs_x()
    return 1;
}

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
    proximity_scroll_left((new_left + PROX_COLS - 1) % map_width);
    MEM8(ADDR_FACING) = 0;
    return 1;
}

// ----------------------------------------------------------------------
// Jumping and airborne physics
// ----------------------------------------------------------------------
static void start_jump(void) {
    uint8_t feruza = (MEM8(ADDR_CURRENT_ACCESSORY) == SHOES_FERUZA) ? 4 : 2;
    MEM8(ADDR_FERUZA_SHOES_FOUR_TWO) = feruza;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0xFF;
    MEM8(ADDR_HEIGHT_ABOVE_GROUND) = feruza >> 1;
    MEM8(ADDR_JUMP_HEIGHT_COUNTER) = 0;
    MEM8(ADDR_SQUAT_FLAG) = 0;
    move_hero_up(); // first step upward
}

// Airborne update – uses hero_scroll_down on descent
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
static void apply_knockback(void) {
    if (MEM8(ADDR_HIT_THIS_FRAME) == 0) return;
    MEM8(ADDR_HIT_THIS_FRAME) = 0;
    int16_t vx = MEM16(ADDR_KNOCKBACK_VECTOR_X);
    int16_t vy = MEM16(ADDR_KNOCKBACK_VECTOR_Y);
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
    // copy_proximity_column(new_left_col, 0);
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
    // copy_proximity_column(new_right_col, PROX_COLS - 1);
}

// ----------------------------------------------------------------------
// Hero movement and collision
// ----------------------------------------------------------------------

// is_non_blocking_tile family. 
// Original assembly code returns ZF or NZ, we return 0 or nonzero values instead.
uint8_t is_non_blocking_tile(uint8_t tile)
{
    return (tile < 0x40) ? lookup_shared(tile) : tile;
}

static uint8_t is_non_blocking_tile_extended(uint8_t tile) 
{
    return (tile < 0x49) ? lookup_shared(tile) : tile;
}

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

static uint8_t is_right_airflow(uint8_t tile) {
    if (MEM8(ADDR_CAVERN_LEVEL) != 7) 
        return 0; // level 7, no airflows
    return get_airflow_direction(tile) == AIRFLOW_RIGHT;
}

// original assembly code returns CF as True, NC as False
static uint8_t is_left_airflow(uint8_t tile) {
    if (MEM8(ADDR_CAVERN_LEVEL) != 7) 
        return 0; // level 7, no airflows
    return get_airflow_direction(tile) == AIRFLOW_LEFT;
}

// Is input tile an airflow?
// Output: 0xff (no airflow)
//         0 (Up), 1 (Left), 2 (Right)
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

// Return 0 if cannot move right
uint8_t move_hero_right_if_no_obstacles()
{
    uint16_t si = hero_coords_to_addr_in_proximity() + 2;
    uint16_t di = si;
    si -= 36;
    wrap_map_from_below(&si);
    for (int i = 0; i < 4; i++) {
        uint8_t flags;
        uint8_t ret = get_dst_monster_flags(si, &flags);
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
    return hero_moves_right();
}

// Return 0 if cannot move left
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
    return hero_moves_left();
}

uint8_t hero_moves_right()
{
    uint16_t left_col = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + 1;
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = left_col;
    left_col += (PROX_COLS - 1);
    if (left_col == MEM16(ADDR_MAP_WIDTH)) {
        packed_map_ptr_for_prox_right = MEM16(ADDR_PACKED_MAP_END_PTR) + 1;
    }
    uint8_t* dest = &MEM8(ADDR_PROXIMITY_MAP);
    memmove(dest, dest + 1, PROX_COLS * DUNGEON_HEIGHT - 1);
    uint16_t si = packed_map_ptr_for_prox_right + 1; // check!! Should be offset to pass as 2nd arg to unpack_column
    uint16_t di = &MEM8(ADDR_PROXIMITY_MAP) + PROX_COLS - 1;
    unpack_column(&g_mem[ADDR_PACKED_MAP_START], &si, dest); // orig: SI = packed map pointer; DI = proximity_map + col_offset
    packed_map_ptr_for_prox_right = si - 1;
    // ...

    return 0;
}

uint8_t hero_moves_left()
{
    return 0;
}

static uint8_t get_tile_at(uint16_t x, uint8_t y)
{
    if (x >= MEM16(ADDR_MAP_WIDTH)) return 0xFF;
    if (y >= DUNGEON_HEIGHT) return 0xFF;
    return 0; // stub
}

int dungeon_can_stand_at(uint16_t x, uint8_t y)
{
    if (y >= DUNGEON_HEIGHT - 1) return 0;
    return is_non_blocking_tile(get_tile_at(x, y)) &&
           is_non_blocking_tile(get_tile_at(x, (uint8_t)(y + 1)));
}

// Hero's absolute X coordinate (from proximity left column + center column)
static uint16_t hero_abs_x(void) {
    return MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + HERO_PROX_COL;
}

// Set hero's absolute X (centered, does NOT change viewport X)
static void set_hero_abs_x(uint16_t x) {
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);
    if (map_width == 0) return;
    x %= map_width;
    uint16_t left = x - HERO_PROX_COL;
    MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) = left;
}

// Only used during init and after teleporting
static void sync_viewport_from_hero(void) {
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint8_t top = 0;
    if (hero_y > 9) top = hero_y - 9;
    if (top > DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON)
        top = DUNGEON_HEIGHT - VIEW_ROWS_DUNGEON;
    MEM8(ADDR_VIEWPORT_TOP_ROW) = top;
    MEM8(ADDR_DUNGEON_VIEW_TOP) = top;
    MEM8(ADDR_HERO_HEAD_Y_VIEW) = hero_y - top;
    // Recompute viewport_left_top_addr from top (col 4)
    uint16_t addr = coords_to_prox_addr(4, top);
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = addr;
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
    MEM8(ADDR_DUNGEON_VIEW_TOP) = top;
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

void wasm_dungeon_update(void)
{
    if (!MEM8(ADDR_DUNGEON_ACTIVE)) return;

    update_hero();
    update_sword();
    check_doors();
    update_monsters();
    MEM8(ADDR_FRAME_TIMER) = 0;
}

void wasm_dungeon_full_tick(void)
{
    MEM8(ADDR_FRAME_TIMER)++;
}

uint8_t wasm_dungeon_get_viewport_top(void) { return MEM8(ADDR_DUNGEON_VIEW_TOP); }
uint16_t wasm_dungeon_get_entity_table(void) { return MEM16(ADDR_MDT + 0x10); }
uint16_t wasm_dungeon_get_entity_count(void) { return dungeon_entity_count; }
uint8_t wasm_dungeon_get_sword_frame(void) { return MEM8(ADDR_DUNGEON_SWING_FRAME); }
uint8_t wasm_dungeon_get_exit_map(void) { return MEM8(ADDR_DUNGEON_EXIT_MAP); }
