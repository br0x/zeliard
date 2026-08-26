/**
 * dungeon-runtime.ts — shared runtime statics for the dungeon engine.
 *
 * The C dungeon statics (`g_is_from_town`, `saved_y_view_init`,
 * `saved_door_x1`, `g_skip_roka_run` — dungeon.c:1823-1840) and the
 * door-pending block (dungeon.c:1847-1852) have exactly one TS owner:
 * the init family (dungeon-init.ts) and the tick both read/write these
 * singletons, so there is no mirror to synchronize.
 *
 * The composition root resets the store at boot.
 */

import type { DungeonRuntimeStatics } from './dungeon-states.js';
import type { DoorPendingState } from './dungeon-doors.js';

export function createDungeonRuntimeStatics(): DungeonRuntimeStatics {
    return {
        isFromTown: false,
        savedYViewInit: 10,
        savedDoorX1: 0,
        skipRokaRun: false,
    };
}

export function createDoorPendingState(): DoorPendingState {
    return {
        monstersPtr: 0,
        flags: 0,
        x1: 0,
        y1: 0,
        features: 0,
        placeMapId: 0,
    };
}

/** Shared singletons used by the dispatched dungeon implementations. */
export const dungeonRuntimeStatics = createDungeonRuntimeStatics();
export const doorPendingState = createDoorPendingState();

/**
 * Reset to boot defaults (mirrors the C statics' initial values). Called by
 * main.ts when a new game starts; every `wasm_dungeon_init` rewrites the
 * transition-relevant fields itself.
 */
export function resetDungeonRuntimeState(): void {
    Object.assign(dungeonRuntimeStatics, createDungeonRuntimeStatics());
    Object.assign(doorPendingState, createDoorPendingState());
}
