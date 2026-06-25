#ifndef ZELIARD_DUNGEON_H
#define ZELIARD_DUNGEON_H

#include <stdint.h>

typedef struct DungeonMonster DungeonMonster;

void wasm_dungeon_init(uint8_t map_id);
void wasm_dungeon_update(void);
void wasm_dungeon_full_tick(void);
uint32_t wasm_dungeon_get_full_map_ptr(void);
uint8_t wasm_dungeon_get_viewport_top(void);
uint16_t wasm_dungeon_get_entity_table(void);
uint16_t wasm_dungeon_get_entity_count(void);
uint8_t wasm_dungeon_get_sword_frame(void);
uint8_t wasm_dungeon_get_exit_map(void);
uint8_t wasm_dungeon_get_frame_phase(void);
uint8_t wasm_dungeon_get_state(void);
void wasm_dungeon_set_input_dirs(uint8_t dirs);
uint8_t wasm_dungeon_get_render_request(void);
void wasm_dungeon_clear_render_request(void);
uint8_t wasm_dungeon_get_exit_map_id(void);

void dungeon_ai_update_monster(DungeonMonster *m, uint16_t hero_x, uint8_t hero_y);
int dungeon_can_stand_at(uint16_t x, uint8_t y);
static uint16_t hero_abs_x(void);
static void set_hero_abs_x(uint16_t x);
static uint8_t get_tile_at(uint16_t x, uint8_t y);
static int is_passable_tile(uint8_t tile);
static void proximity_scroll_right(uint16_t new_left_col);
static void proximity_scroll_left(uint16_t new_right_col);
static void update_view_top(void);

#endif
