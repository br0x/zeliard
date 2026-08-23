/**
 * dungeon-state.ts — TS ports of the dungeon state accessors (Stage 5e).
 *
 * Ports of wasm_dungeon_get_viewport_top / _get_state / _get_render_request /
 * _clear_render_request / _get_entity_table (src/dungeon.c:2035-2043).
 * All pure g_mem reads/writes.
 *
 * Not ported here: wasm_dungeon_get_entity_count returns the C global
 * `dungeon_entity_count`, which is not memory-visible; it moves with the
 * entity-table accessor layer in Stage 8.
 */

import {
    ADDR_DUNGEON_STATE,
    ADDR_MDT,
    ADDR_RENDER_DONE,
    ADDR_RENDER_REQUEST,
    ADDR_VIEWPORT_TOP_ROW,
} from '../wasm/memory.js';

/** src/dungeon.c: uint16_t wasm_dungeon_get_entity_table(void) { return MEM16(ADDR_MDT + 0x10); } */
const ENTITY_TABLE_WORD = ADDR_MDT + 0x10;

export function getViewportTop(gmem: Uint8Array): number {
    return gmem[ADDR_VIEWPORT_TOP_ROW] ?? 0;
}

export function getDungeonState(gmem: Uint8Array): number {
    return gmem[ADDR_DUNGEON_STATE] ?? 0;
}

export function getRenderRequest(gmem: Uint8Array): number {
    return gmem[ADDR_RENDER_REQUEST] ?? 0;
}

export function clearRenderRequest(gmem: Uint8Array): void {
    gmem[ADDR_RENDER_REQUEST] = 0;
    gmem[ADDR_RENDER_DONE] = 0xff;
}

export function getEntityTable(gmem: Uint8Array): number {
    return (gmem[ENTITY_TABLE_WORD] ?? 0) | ((gmem[ENTITY_TABLE_WORD + 1] ?? 0) << 8);
}
