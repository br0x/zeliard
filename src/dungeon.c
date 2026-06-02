#include <stdint.h>
#include <string.h>

#include "zeliard.h"
#include "dungeon.h"

#define MEM8(addr)   (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)  (*(uint16_t *)&g_mem[(addr) & 0xFFFF])

#define ADDR_MDT                 0xC000u
#define ADDR_PROXIMITY           0xE000u
#define ADDR_VIEWPORT_ENTITIES   0xE900u

#define ADDR_HERO_PROX_LEFT      0x0080u
#define ADDR_HERO_Y              0x0082u
#define ADDR_HERO_X_VIEW         0x0083u
#define ADDR_HERO_HEAD_Y_VIEW    0x0084u
#define ADDR_SWORD_TYPE          0x0092u
#define ADDR_SHIELD_TYPE         0x0093u
#define ADDR_FACING              0x00C2u
#define ADDR_PLACE_MAP_ID        0x00C4u
#define ADDR_HERO_ANIM_PHASE     0x00E7u

#define ADDR_INPUT_ALT_SPACE     0xFF16u
#define ADDR_INPUT_DIRS          0xFF17u
#define ADDR_ENTER_KEYS          0xFF18u
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

#define DUNGEON_FULL_MAP_ADDR    0x30000u
#define DUNGEON_HEIGHT           64u
#define PROX_COLS                36u
#define VIEW_COLS_DUNGEON        28u
#define VIEW_ROWS_DUNGEON        18u
#define HERO_VIEW_COL            14u
#define HERO_PROX_COL            18u
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

static uint16_t rd16(uint16_t addr)
{
    return (uint16_t)(MEM8(addr) | ((uint16_t)MEM8(addr + 1) << 8));
}

static void wr16(uint16_t addr, uint16_t value)
{
    MEM8(addr) = (uint8_t)value;
    MEM8(addr + 1) = (uint8_t)(value >> 8);
}

static uint16_t ptr_to_off(uint16_t ptr)
{
    return ptr >= ADDR_MDT ? (uint16_t)(ptr - ADDR_MDT) : ptr;
}

static uint8_t full_map_get(uint16_t x, uint8_t y)
{
    if (!dungeon_map_width) return 0;
    x = (uint16_t)(x % dungeon_map_width);
    y &= 0x3F;
    return g_mem[DUNGEON_FULL_MAP_ADDR + (uint32_t)x * DUNGEON_HEIGHT + y];
}

static void full_map_set(uint16_t x, uint8_t y, uint8_t tile)
{
    if (!dungeon_map_width) return;
    x = (uint16_t)(x % dungeon_map_width);
    y &= 0x3F;
    g_mem[DUNGEON_FULL_MAP_ADDR + (uint32_t)x * DUNGEON_HEIGHT + y] = tile;
}

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

int dungeon_can_stand_at(uint16_t x, uint8_t y)
{
    if (y >= DUNGEON_HEIGHT - 1) return 0;
    uint8_t body = full_map_get(x, y);
    uint8_t feet = full_map_get(x, (uint8_t)(y + 1));
    return is_passable_tile(body) && is_passable_tile(feet);
}

static void unpack_full_map(void)
{
    uint16_t si = 0x001B;
    memset(&g_mem[DUNGEON_FULL_MAP_ADDR], 0, (uint32_t)dungeon_map_width * DUNGEON_HEIGHT);

    for (uint16_t col = 0; col < dungeon_map_width; col++) {
        uint8_t row = 0;
        while (row < DUNGEON_HEIGHT && si < MAX_MDT_BYTES) {
            uint8_t b = MEM8(ADDR_MDT + si);
            uint8_t op = b >> 6;
            uint8_t rep = 1;
            uint8_t tile = 0;

            if (op == 0) {
                rep = (uint8_t)(b + 1);
                si++;
                tile = MEM8(ADDR_MDT + si);
            } else if (op == 1) {
                rep = (uint8_t)(((b >> 4) & 3) + 2);
                tile = (uint8_t)((b & 0x0F) + 1);
            } else if (op == 2) {
                rep = (uint8_t)(b & 0x3F);
                tile = 0;
                if (rep == 0) {
                    si++;
                    continue;
                }
            } else {
                tile = (uint8_t)(b & 0x3F);
                rep = 1;
            }

            si++;
            for (uint8_t i = 0; i < rep && row < DUNGEON_HEIGHT; i++) {
                full_map_set(col, row++, tile);
            }
        }
    }
}

static void refresh_proximity_map(void)
{
    uint16_t left = MEM16(ADDR_HERO_PROX_LEFT);

    for (uint16_t col = 0; col < PROX_COLS; col++) {
        uint16_t map_x = (uint16_t)(left + col);
        for (uint8_t row = 0; row < DUNGEON_HEIGHT; row++) {
            MEM8(ADDR_PROXIMITY + col * DUNGEON_HEIGHT + row) = full_map_get(map_x, row);
        }
    }
}

static void refresh_viewport_entities(void)
{
    memset(&g_mem[ADDR_VIEWPORT_ENTITIES], 0, VIEW_COLS_DUNGEON * (VIEW_ROWS_DUNGEON + 1));

    uint16_t left = (uint16_t)(MEM16(ADDR_HERO_PROX_LEFT) + 4);
    uint8_t top = MEM8(ADDR_DUNGEON_VIEW_TOP);
    uint16_t table = rd16(ADDR_MDT + 0x10);
    uint16_t off = ptr_to_off(table);
    dungeon_entity_count = 0;

    while (off + sizeof(DungeonMonster) <= MAX_MDT_BYTES) {
        DungeonMonster *m = (DungeonMonster *)&g_mem[ADDR_MDT + off];
        if (m->curr_x == 0xFFFF) break;
        dungeon_entity_count++;

        if (m->curr_x >= left && m->curr_x < left + VIEW_COLS_DUNGEON &&
            m->curr_y >= top && m->curr_y < top + VIEW_ROWS_DUNGEON) {
            uint8_t vx = (uint8_t)(m->curr_x - left);
            uint8_t vy = (uint8_t)(m->curr_y - top);
            MEM8(ADDR_VIEWPORT_ENTITIES + vy * VIEW_COLS_DUNGEON + vx) = (uint8_t)dungeon_entity_count;
        }
        off = (uint16_t)(off + sizeof(DungeonMonster));
    }
}

static uint16_t hero_abs_x(void)
{
    return (uint16_t)(MEM16(ADDR_HERO_PROX_LEFT) + HERO_PROX_COL);
}

static void set_hero_abs_x(uint16_t x)
{
    if (!dungeon_map_width) return;
    x = (uint16_t)(x % dungeon_map_width);
    wr16(ADDR_HERO_PROX_LEFT, (uint16_t)(x - HERO_PROX_COL));
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
    uint8_t dirs = MEM8(ADDR_INPUT_DIRS);
    uint8_t alt_space = MEM8(ADDR_INPUT_ALT_SPACE);
    uint16_t x = hero_abs_x();
    uint8_t y = MEM8(ADDR_HERO_Y);
    uint8_t moved = 0;

    if (dirs & 0x04) {
        uint16_t nx = (uint16_t)(x - 1);
        if (dungeon_can_stand_at(nx, y)) {
            x = nx;
            MEM8(ADDR_FACING) = 1;
            moved = 1;
        }
    } else if (dirs & 0x08) {
        uint16_t nx = (uint16_t)(x + 1);
        if (dungeon_can_stand_at(nx, y)) {
            x = nx;
            MEM8(ADDR_FACING) = 0;
            moved = 1;
        }
    }

    if (dirs & 0x01) {
        if (y > 0 && dungeon_can_stand_at(x, (uint8_t)(y - 1))) {
            y--;
            moved = 1;
        }
    } else if (dirs & 0x02) {
        if (y < DUNGEON_HEIGHT - 2 && dungeon_can_stand_at(x, (uint8_t)(y + 1))) {
            y++;
            moved = 1;
        }
    }

    if ((alt_space & 0x01) || MEM8(ADDR_SPACEBAR_LATCH)) {
        if (MEM8(ADDR_DUNGEON_SWING_TMR) == 0 && MEM8(ADDR_SWORD_TYPE) != 0) {
            MEM8(ADDR_DUNGEON_SWING_TMR) = 18;
            MEM8(ADDR_SOUND_FX_REQUEST) = 0x10;
        }
        MEM8(ADDR_SPACEBAR_LATCH) = 0;
    }

    set_hero_abs_x(x);
    MEM8(ADDR_HERO_Y) = y;
    MEM8(ADDR_HERO_ANIM_PHASE) = moved ? (uint8_t)((MEM8(ADDR_HERO_ANIM_PHASE) + 1) & 3) : 0x80;
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
    uint16_t table = rd16(ADDR_MDT + 0x10);
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

    uint16_t table = rd16(ADDR_MDT + 0x0A);
    uint16_t off = ptr_to_off(table);
    uint16_t hx = hero_abs_x();
    uint8_t hy = MEM8(ADDR_HERO_Y);

    while (off + 12 <= MAX_MDT_BYTES) {
        uint16_t x0 = rd16(ADDR_MDT + off);
        if (x0 == 0xFFFF) break;
        uint8_t y0 = MEM8(ADDR_MDT + off + 2);
        uint8_t map_id = MEM8(ADDR_MDT + off + 4);
        uint16_t x1 = rd16(ADDR_MDT + off + 5);
        uint16_t y1 = rd16(ADDR_MDT + off + 7);

        if (hx >= x0 - 1 && hx <= x0 + 1 && hy >= y0 - 1 && hy <= y0 + 2) {
            if (y1 == 0x00FF) {
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

void wasm_dungeon_init(uint8_t map_id, uint16_t spawn_x, uint8_t spawn_y, uint8_t direction)
{
    dungeon_map_width = rd16(ADDR_MDT + 0x02);
    if (dungeon_map_width == 0 || dungeon_map_width > 1024) dungeon_map_width = 240;

    unpack_full_map();

    if (spawn_x == 0xFFFF) spawn_x = 0x3D;
    if (spawn_y == 0xFF) spawn_y = 6;

    MEM8(ADDR_DUNGEON_ACTIVE) = 1;
    MEM8(ADDR_DUNGEON_EXIT_FLAG) = 0;
    MEM8(ADDR_DUNGEON_SWING_TMR) = 0;
    MEM8(ADDR_DUNGEON_SWING_FRAME) = 0xFF;
    MEM8(ADDR_PLACE_MAP_ID) = (uint8_t)(map_id | 0x80);
    MEM8(ADDR_FACING) = direction ? 1 : 0;
    MEM8(ADDR_HERO_X_VIEW) = HERO_VIEW_COL;

    set_hero_abs_x(spawn_x);
    MEM8(ADDR_HERO_Y) = spawn_y;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0x80;
    update_view_top();
    refresh_proximity_map();
    refresh_viewport_entities();
}

void wasm_dungeon_update(void)
{
    if (!MEM8(ADDR_DUNGEON_ACTIVE)) return;

    update_hero();
    update_sword();
    check_doors();
    update_monsters();
    update_view_top();
    refresh_proximity_map();
    refresh_viewport_entities();
    MEM8(ADDR_FRAME_TIMER) = 0;
}

void wasm_dungeon_full_tick(void)
{
    MEM8(ADDR_FRAME_TIMER)++;
}

uint32_t wasm_dungeon_get_full_map_ptr(void) { return DUNGEON_FULL_MAP_ADDR; }
uint8_t wasm_dungeon_get_viewport_top(void) { return MEM8(ADDR_DUNGEON_VIEW_TOP); }
uint16_t wasm_dungeon_get_entity_table(void) { return rd16(ADDR_MDT + 0x10); }
uint16_t wasm_dungeon_get_entity_count(void) { return dungeon_entity_count; }
uint8_t wasm_dungeon_get_sword_frame(void) { return MEM8(ADDR_DUNGEON_SWING_FRAME); }
uint8_t wasm_dungeon_get_exit_flag(void) { return MEM8(ADDR_DUNGEON_EXIT_FLAG); }
uint8_t wasm_dungeon_get_exit_map(void) { return MEM8(ADDR_DUNGEON_EXIT_MAP); }
void wasm_dungeon_clear_exit(void) { MEM8(ADDR_DUNGEON_EXIT_FLAG) = 0; }

uint8_t wasm_get_pending_dungeon_flag(void) { return MEM8(ADDR_PENDING_DUNGEON_FLAG); }
uint8_t wasm_get_pending_dungeon_map(void) { return MEM8(ADDR_PENDING_DUNGEON_MAP); }
void wasm_clear_pending_dungeon(void) { MEM8(ADDR_PENDING_DUNGEON_FLAG) = 0; }

int wasm_load_mdt(const uint8_t *mdt_data, uint32_t mdt_size)
{
    if (!mdt_data || mdt_size > MAX_MDT_BYTES) return -1;
    memcpy(&g_mem[ADDR_MDT], mdt_data, mdt_size);
    return 0;
}
