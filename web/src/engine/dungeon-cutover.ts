/**
 * dungeon-cutover.ts — Runtime cutover: serves the dungeon tick and the
 * init/transition exports (`dungeonInit`, `finishRokademoTransition`) from TS.
 *
 * Statics ownership: the singletons live in dungeon-runtime.ts and are
 * written by dungeon-init.ts's ports of prepare_dungeon /
 * finish_rokademo_transition — the same functions that write g_mem.
 */


import {
    bindMainUpdateRender,
    bindProcessHeroDeath,
    clearHeroInViewport,
    cavernGameInit,
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
import { heroCoordsToAddrInProximity } from './dungeon-hero.js';
import { processDoors } from './dungeon-frame-pre.js';
import {
    mainUpdateRender,
    processHeroDeath,
} from './dungeon-frame.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';

// ─── load_place_and_reinit (dungeon.c:932) ───
//
// Post-boss-reward cavern restart: restore the saved eai/enp indices from
// the MDT descriptor, clear the boss flags, run the MDT initializer list,
// recompute the (defeat) door position, and re-enter Cavern_Game_Init.
// Asset loads are stubs, exactly as in the C translation.
function loadPlaceAndReinit(g: Uint8Array): void {
    if (memRead8(g, 0xe8 /* INVINCIBILITY_FLAG */) !== 0) return;

    const mdt = memRead16(g, 0xc000); // mdt_buffer → descriptor pointer
    memWrite8(g, 0x9efe /* EAI_BIN_INDEX */, memRead8(g, mdt + 6)); // .boss_ai
    memWrite8(g, 0x9eff /* ENP_GRP_INDEX */, memRead8(g, mdt + 7)); // .saved_enp_grp_idx
    // (eai/enp loads + tile decompression are JS-side stubs, as in C)

    memWrite8(g, 0xff34 /* IS_BOSS_CAVERN */, 0);
    memWrite8(g, 0xffa0 /* BOSS_MODE */, 0);

    // Optional initializers from MDT descriptor+8 (addr/value word pairs).
    let si = (mdt + 8) & 0xffff;
    for (;;) {
        const addr = memRead16(g, si);
        if (addr === 0xffff) break;
        memWrite16(g, addr, memRead16(g, si + 2));
        si = (si + 4) & 0xffff;
    }

    // Position and spawn the new door.
    const heroTl = heroCoordsToAddrInProximity(g);
    let absX = (memRead16(g, 0x80) + memRead8(g, 0x83)) & 0xffff;
    if (memRead8(g, (heroTl - 5) & 0xffff) !== 0) absX = (absX + 9) & 0xffff;
    const mapW = memRead16(g, 0xc002);
    if (absX >= mapW) absX -= mapW;
    si = memRead16(g, 0xc00a /* DOORS_LIST */);
    memWrite16(g, si + 0, absX); // door[0].x0
    processDoors(g);
    // screen_flash_overlay(): stub
    clearHeroInViewport(g);

    memWrite8(g, 0x9f1e /* BOSS_REWARD_PROCESSED */, 0);
    cavernGameInit(g, statics); // default mainUpdateRender hook already bound
}

function requireView(getView: () => Uint8Array | null): Uint8Array {
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
    loadPlaceAndReinit: (g: Uint8Array): void => loadPlaceAndReinit(g),
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
    getView: () => Uint8Array | null,
): () => void {
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
    getView: () => Uint8Array | null,
): (mapId: number, isFromTown: number | boolean) => void {
    return (mapId: number, isFromTown: number | boolean): void => {
        const g = requireView(getView);
        wasmDungeonInit(g, mapId, !!isFromTown, statics, initCallbacks());
    };
}

/**
 * Build the TS `wasm_finish_rokademo_transition` implementation.
 */
export function makeFinishRokademoTransition(
    getView: () => Uint8Array | null,
): () => void {
    return (): void => {
        const g = requireView(getView);
        finishRokademoTransition(g, statics, initCallbacks());
    };
}
