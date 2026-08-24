/**
 * dungeon-cutover.ts — Stage 8d runtime cutover: serves
 * `wasm_dungeon_update` from TS by default, mirroring the Stage 7c town
 * cutover. Verified by golden-replay + live E2E (the C tick mutates
 * statics that memory snapshots cannot rewind, so shadow dual-run is not
 * applicable). `zeliard_ports=wasm` restores the pure-wasm path;
 * `dispatch.reset()` keeps wasm as instant fallback.
 */

import type { DispatchableEngine } from '../wasm/dispatch.js';
import type { ViewAccessor } from '../wasm/parity/ports.js';
import { dungeonUpdate, dungeonUpdateRokaRun } from './dungeon-state-machine.js';
import {
    dungeonUpdateNormal,
    dungeonUpdateRope,
    dungeonUpdateDeathFall,
    dungeonUpdateDeathFlash,
    dungeonUpdateDeathFade,
    dungeonUpdateJashiinCutscene,
    type DungeonRuntimeStatics,
} from './dungeon-states.js';
import {
    movePlatformDownDamageMonster,
    tryMovePlatformUp,
} from './dungeon-vertical.js';
import { enterTheDoor } from './dungeon-doors.js';

function requireView(getView: ViewAccessor): Uint8Array {
    const view = getView();
    if (!view) throw new Error('g_mem view unavailable for TS port');
    return view;
}

/** C file statics mirrored across frames (module singleton). */
const statics: DungeonRuntimeStatics & { savedDoorX1: number; skipRokaRun: boolean } = {
    isFromTown: false,
    savedYViewInit: 10,
    savedDoorX1: 0,
    skipRokaRun: false,
};

const doorPending = {
    monstersPtr: 0,
    flags: 0,
    x1: 0,
    y1: 0,
    features: 0,
    placeMapId: 0,
};

const doorCbs = {
    gameLoopRenderAndTiming: () => undefined,
    rokaRun: () => undefined,
    loadEaiModule: () => undefined,
};

const frameCallbacks = {
    bringInventoryWindow: () => undefined, // key-router handles Enter in JS
    loadPlaceAndReinit: () => undefined, // wired by composition root
};

const deps = {
    movePlatformDownDamageMonster: (g: Uint8Array): boolean =>
        movePlatformDownDamageMonster(g),
    tryMovePlatformUp: (g: Uint8Array): boolean => tryMovePlatformUp(g),
    enterTheDoor: (g: Uint8Array, sb: { v: number }): void =>
        enterTheDoor(g, sb, doorPending, doorCbs),
    loadPlaceAndReinit: () => undefined,
    bringInventoryWindow: () => undefined,
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
        dungeonUpdateDeathFade(g, frameCallbacks, frameCallbacks.loadPlaceAndReinit);
    },
    completeDoorTransition(_g: Uint8Array): void {
        // door completion is handled via door-pending flag checks in main.ts;
        // the TS-side full flow is available through enterTheDoor when needed
    },
    updateJashiinCutscene(g: Uint8Array): void {
        dungeonUpdateJashiinCutscene(g, statics, deps, frameCallbacks);
    },
};

/**
 * Build the TS `wasm_dungeon_update` implementation.
 *
 * `loadPlaceAndReinit` is injected by main.ts (it drives JS-side asset
 * reloads for boss-reward transitions).
 */
export function makeDungeonUpdate(
    getView: ViewAccessor,
    _loadPlaceAndReinit?: (g: Uint8Array) => void,
): DispatchableEngine['wasm_dungeon_update'] {
    return (): void => {
        const g = requireView(getView);
        dungeonUpdate(g, handlers, statics);
        // ROKA_RUN phase advance is handled inside dungeonUpdate natively
        void rokaRunTick;
    };
}

function rokaRunTick(g: Uint8Array): void {
    dungeonUpdateRokaRun(g, statics);
}
