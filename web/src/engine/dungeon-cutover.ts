/**
 * dungeon-cutover.ts — Stage 8d runtime cutover: serves the dungeon tick
 * and the init/transition exports (`wasm_dungeon_init`,
 * `wasm_finish_rokademo_transition`) from TS, mirroring the Stage 7c town
 * cutover. Verified by golden-replay + live E2E (the C tick mutates statics
 * that memory snapshots cannot rewind, so shadow dual-run is not
 * applicable). `zeliard_ports=wasm` restores the pure-wasm path;
 * `dispatch.reset()` keeps wasm as instant fallback.
 *
 * Statics ownership: the singletons live in dungeon-runtime.ts and are
 * written by dungeon-init.ts's ports of prepare_dungeon /
 * finish_rokademo_transition — the same functions that write g_mem — so
 * there is no wasm↔TS mirror to get out of sync.
 */

import type { DispatchableEngine } from '../wasm/dispatch.js';
import type { ViewAccessor } from '../wasm/parity/ports.js';
import {
    bindMainUpdateRender,
    bindProcessHeroDeath,
    dungeonUpdate,
    rokaRun,
} from './dungeon-state-machine.js';
import {
    dungeonUpdateNormal,
    dungeonUpdateRope,
    dungeonUpdateDeathFall,
    dungeonUpdateDeathFlash,
    dungeonUpdateDeathFade,
    dungeonUpdateJashiinCutscene,
} from './dungeon-states.js';
import {
    movePlatformDownDamageMonster,
    tryMovePlatformUp,
} from './dungeon-vertical.js';
import { enterTheDoor, dungeonCompleteDoorTransition } from './dungeon-doors.js';
import {
    finishRokademoTransition,
    heroLeft16Down1,
    processMdtDescriptor,
    removeAccomplishedItems,
    wasmDungeonInit,
    type PrepareDungeonCallbacks,
} from './dungeon-init.js';
import {
    doorPendingState,
    dungeonRuntimeStatics as statics,
} from './dungeon-runtime.js';
import { loadEaiModule } from './eai-registry.js';
import { mainUpdateRender, processHeroDeath } from './dungeon-frame.js';

function requireView(getView: ViewAccessor): Uint8Array {
    const view = getView();
    if (!view) throw new Error('g_mem view unavailable for TS port');
    return view;
}

const doorCbs = {
    // game_loop_render_and_timing(0): full frame redraw with the hero hidden
    gameLoopRenderAndTiming: (g: Uint8Array): void => mainUpdateRender(g, frameCallbacks),
    rokaRun: (g: Uint8Array): void => rokaRun(g),
    // load_eai_module — registry select + boss reset (dungeon.c:303)
    loadEaiModule: (_g: Uint8Array, placeMapId: number): void => {
        loadEaiModule(placeMapId);
    },
};

const frameCallbacks = {
    bringInventoryWindow: (_g: Uint8Array): void => undefined, // key-router handles Enter in JS
    loadPlaceAndReinit: (_g: Uint8Array): void => undefined, // set via setLoadPlaceAndReinit
};

/**
 * Inject the composition root's `load_place_and_reinit` (boss-reward
 * transition: JS-side asset reloads then Cavern_Game_Init re-entry).
 */
export function setLoadPlaceAndReinit(
    fn: (g: Uint8Array) => void,
): void {
    frameCallbacks.loadPlaceAndReinit = fn;
    deps.loadPlaceAndReinit = fn;
}

// Late-bound hooks for Cavern_Game_Init's BYTE_9F27 branch and loc_6266
// death check (avoids an import cycle inside dungeon-state-machine).
bindMainUpdateRender((g) => mainUpdateRender(g, frameCallbacks));
bindProcessHeroDeath(processHeroDeath);

const deps = {
    movePlatformDownDamageMonster: (g: Uint8Array): boolean =>
        movePlatformDownDamageMonster(g),
    tryMovePlatformUp: (g: Uint8Array): boolean => tryMovePlatformUp(g),
    enterTheDoor: (g: Uint8Array, sb: { v: number }): void =>
        enterTheDoor(g, sb, doorPendingState, doorCbs),
    loadPlaceAndReinit: (g: Uint8Array): void => frameCallbacks.loadPlaceAndReinit(g),
    bringInventoryWindow: (g: Uint8Array): void => frameCallbacks.bringInventoryWindow(g),
};

// state handler table satisfying StateHandlers
const handlers = {
    updateNormal(g: Uint8Array): void {
        dungeonUpdateNormal(g, statics, deps, frameCallbacks);
    },
    updateRope(g: Uint8Array): void {
        dungeonUpdateRope(g, statics, deps, frameCallbacks);
    },
    updateDeathFall(g: Uint8Array): void {
        dungeonUpdateDeathFall(g, frameCallbacks);
    },
    updateDeathFlash(g: Uint8Array): void {
        dungeonUpdateDeathFlash(g, frameCallbacks);
    },
    updateDeathFade(g: Uint8Array): void {
        dungeonUpdateDeathFade(g, frameCallbacks, deps.loadPlaceAndReinit);
    },
    completeDoorTransition(g: Uint8Array): void {
        // dungeon_complete_door_transition phase 2 (DOOR_PENDING state)
        dungeonCompleteDoorTransition(g, doorPendingState, statics, {
            ...doorCbs,
            removeAccomplishedItems,
            heroLeft16Down1,
            processMdtDescriptor,
        });
    },
    updateJashiinCutscene(g: Uint8Array): void {
        dungeonUpdateJashiinCutscene(g, statics, deps, frameCallbacks);
    },
};

/** Shared init callbacks for the dispatched init-family implementations. */
function initCallbacks(): PrepareDungeonCallbacks {
    return {
        mainUpdateRender: (g) => mainUpdateRender(g, frameCallbacks),
    };
}

/**
 * Build the TS `wasm_dungeon_update` implementation.
 */
export function makeDungeonUpdate(
    getView: ViewAccessor,
): DispatchableEngine['wasm_dungeon_update'] {
    return (): void => {
        const g = requireView(getView);
        dungeonUpdate(g, handlers, statics);
    };
}

/**
 * Build the TS `wasm_dungeon_init` implementation (prepare_dungeon +
 * post-init fixups).
 */
export function makeDungeonInit(
    getView: ViewAccessor,
): DispatchableEngine['wasm_dungeon_init'] {
    return (mapId: number, isFromTown: number | boolean): void => {
        const g = requireView(getView);
        wasmDungeonInit(g, mapId, !!isFromTown, statics, initCallbacks());
    };
}

/**
 * Build the TS `wasm_finish_rokademo_transition` implementation.
 */
export function makeFinishRokademoTransition(
    getView: ViewAccessor,
): DispatchableEngine['wasm_finish_rokademo_transition'] {
    return (): void => {
        const g = requireView(getView);
        finishRokademoTransition(g, statics, initCallbacks());
    };
}
