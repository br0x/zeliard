#include <stdint.h>
#include <string.h>

#include "zeliard.h"
#include "dungeon.h"

#define MEM8(addr)   (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)  (*(uint16_t *)&g_mem[(addr) & 0xFFFF])

#define ADDR_HERO_PROX_LEFT      0x0080u
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

static void set_hero_abs_x(uint16_t x)
{
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);
    if (map_width == 0) return;
    x %= map_width;
    uint16_t left = (uint16_t)(x - HERO_PROX_COL);
    MEM16(ADDR_HERO_PROX_LEFT) = left;
    MEM8(ADDR_HERO_X_VIEW) = HERO_VIEW_COL;
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

static void update_hero(void)
{
    uint8_t dirs = MEM8(ADDR_INPUT_DIRS);          // right/left/down/up bits
    uint8_t alt_space = MEM8(ADDR_INPUT_ALT_SPACE);     // alt/space bits
    uint16_t x = MEM16(ADDR_HERO_PROX_LEFT) + HERO_PROX_COL;
    uint8_t y = MEM8(ADDR_HERO_Y);
    uint8_t moved = 0;
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);

    // Left / Right movement with viewport scrolling
    if (dirs & 0x04) {                    // left
        uint8_t vp_x = MEM8(ADDR_HERO_X_VIEW);
        if (vp_x > 0) {
            // normal movement without scrolling
            uint16_t new_x = (uint16_t)(x - 1 + map_width) % map_width;
            if (dungeon_can_stand_at(new_x, y)) {
                set_hero_abs_x(new_x);
                moved = 1;
                MEM8(ADDR_FACING) = 1;    // face left
            }
        } else {
            // try to scroll proximity map left
            uint16_t left = MEM16(ADDR_HERO_PROX_LEFT);
            if (left > 0) {
                left--;
                MEM16(ADDR_HERO_PROX_LEFT) = left;
                uint16_t new_left_col = left;
                proximity_scroll_right(new_left_col);
                // hero x in viewport stays 0 (now at left edge)
                moved = 1;
                MEM8(ADDR_FACING) = 1;
            } else {
                // edge of map, cannot scroll, normal movement if possible
                uint16_t new_x = (uint16_t)(x - 1 + map_width) % map_width;
                if (dungeon_can_stand_at(new_x, y)) {
                    set_hero_abs_x(new_x);
                    moved = 1;
                    MEM8(ADDR_FACING) = 1;
                }
            }
        }
    } else if (dirs & 0x08) {             // right
        uint8_t vp_x = MEM8(ADDR_HERO_X_VIEW);
        if (vp_x < 27) {
            uint16_t new_x = (x + 1) % map_width;
            if (dungeon_can_stand_at(new_x, y)) {
                set_hero_abs_x(new_x);
                moved = 1;
                MEM8(ADDR_FACING) = 0;    // face right
            }
        } else {
            uint16_t left = MEM16(ADDR_HERO_PROX_LEFT);
            uint16_t max_left = (uint16_t)(map_width - PROX_COLS);
            if (left < max_left) {
                left++;
                MEM16(ADDR_HERO_PROX_LEFT) = left;
                uint16_t new_right_col = (uint16_t)(left + PROX_COLS - 1);
                if (new_right_col >= map_width) new_right_col -= map_width;
                proximity_scroll_left(new_right_col);
                moved = 1;
                MEM8(ADDR_FACING) = 0;
            } else {
                uint16_t new_x = (x + 1) % map_width;
                if (dungeon_can_stand_at(new_x, y)) {
                    set_hero_abs_x(new_x);
                    moved = 1;
                    MEM8(ADDR_FACING) = 0;
                }
            }
        }
    }

    // Up / Down movement
    if (dirs & 0x01) {                    // up
        if (y > 0 && dungeon_can_stand_at(x, (uint8_t)(y - 1))) {
            y--;
            moved = 1;
        }
    } else if (dirs & 0x02) {             // down
        if (y < DUNGEON_HEIGHT - 1 && dungeon_can_stand_at(x, (uint8_t)(y + 1))) {
            y++;
            moved = 1;
        }
    }

    // Sword swing (space/alt)
    if ((alt_space & 0x01) || MEM8(ADDR_SPACEBAR_LATCH)) {
        if (MEM8(ADDR_DUNGEON_SWING_TMR) == 0 && MEM8(ADDR_SWORD_TYPE) != 0) {
            MEM8(ADDR_DUNGEON_SWING_TMR) = 18;
            MEM8(ADDR_SOUND_FX_REQUEST) = 0x10;
        }
        MEM8(ADDR_SPACEBAR_LATCH) = 0;
    }

    MEM8(ADDR_HERO_Y) = y;
    MEM8(ADDR_HERO_ANIM_PHASE) = moved ? (uint8_t)((MEM8(ADDR_HERO_ANIM_PHASE) + 1) & 3) : 0x80;
    update_view_top();
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
