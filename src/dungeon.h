#ifndef ZELIARD_DUNGEON_H
#define ZELIARD_DUNGEON_H

#include <stdint.h>

typedef struct DungeonMonster DungeonMonster;

void wasm_dungeon_init(uint8_t map_id, uint8_t is_from_town);
void wasm_dungeon_update(void);
void wasm_dungeon_full_tick(void);
uint8_t wasm_dungeon_get_viewport_top(void);
uint16_t wasm_dungeon_get_entity_table(void);
uint16_t wasm_dungeon_get_entity_count(void);
uint8_t wasm_dungeon_get_state(void);
uint8_t wasm_dungeon_get_render_request(void);
void wasm_dungeon_clear_render_request(void);

#endif
