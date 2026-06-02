#ifndef ZELIARD_DUNGEON_H
#define ZELIARD_DUNGEON_H

#include <stdint.h>

typedef struct DungeonMonster DungeonMonster;

void wasm_dungeon_init(uint8_t map_id, uint16_t spawn_x, uint8_t spawn_y, uint8_t direction);
void wasm_dungeon_update(void);
void wasm_dungeon_full_tick(void);
uint32_t wasm_dungeon_get_full_map_ptr(void);
uint8_t wasm_dungeon_get_viewport_top(void);
uint16_t wasm_dungeon_get_entity_table(void);
uint16_t wasm_dungeon_get_entity_count(void);
uint8_t wasm_dungeon_get_sword_frame(void);
uint8_t wasm_dungeon_get_exit_flag(void);
uint8_t wasm_dungeon_get_exit_map(void);
void wasm_dungeon_clear_exit(void);

uint8_t wasm_get_pending_dungeon_flag(void);
uint8_t wasm_get_pending_dungeon_map(void);
void wasm_clear_pending_dungeon(void);

void dungeon_ai_update_monster(DungeonMonster *m, uint16_t hero_x, uint8_t hero_y);
int dungeon_can_stand_at(uint16_t x, uint8_t y);

#endif
