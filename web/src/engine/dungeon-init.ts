/**
 * dungeon-init.ts — TS port of dungeon.c's init/transition family
 * (Stage 8d slice-10 redo). Owning these writers in TS is what removes the
 * wasm↔TS split-brain around the C statics: `prepare_dungeon` writes both
 * g_mem and the shared DungeonRuntimeStatics, so under cutover the tick's
 * view of the statics is produced by the same code that produced g_mem.
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - remove_accomplished_items            (1218)
 *   - hero_left_16_down_1                  (1242)
 *   - process_mdt_descriptor               (1256)
 *   - prepare_dungeon                      (1887)
 *   - wasm_dungeon_init                    (1798)
 *   - wasm_finish_rokademo_transition      (1857)
 *
 * JS-side work stays injected: asset loads are stubs exactly as in the C
 * reference; `load_eai_module` is a function-pointer select with no g_mem
 * effect until Stage 9 ports the AI bodies; `mainUpdateRender` (the
 * BYTE_9F27 branch of Cavern_Game_Init) and `processHeroDeath` are bound by
 * the composition root via dungeon-state-machine/dungeon-frame.
 */

import {
    afterRunAnimation,
    rokaRun,
    DUNGEON_STATE_ROKA_RUN,
    DUNGEON_STATE_BOSS_ENCOUNTER,
    DUNGEON_STATE_JASHIIN_CUTSCENE,
} from './dungeon-state-machine.js';
import { resetDungeonStateVars } from './dungeon-input.js';
import type { DungeonRuntimeStatics } from './dungeon-states.js';

// g_mem addresses (dungeon.c defines / zeliard.h)
const LEFT_COL_NUM = 0x80; // word — proximity map left column number
const HERO_X_VIEW = 0x83;
const VIEWPORT_TOP_ROW = 0x82;
const MSD_INDEX = 0xc8;
const MAP_WIDTH = 0xc002; // word
const ACHIEVEMENTS_TABLE = 0xc00c; // word pointer
const MDT = 0xc000; // word pointer to mdt_descriptor
const HERO_Y_VIEW_INIT = 0xc016;
const PLACE_MAP_ID = 0xc4;
const DOOR_TARGET_Y = 0x9f1c;
const HERO_X_IN_PROXIMITY_MAP = 0x9f1a; // word
const BYTE_9EED = 0x9eed;
const BYTE_9EF5 = 0x9ef5;
const MMAN_GRP_INDEX = 0x9ef6;
const BYTE_9EFA = 0x9efa;
const BYTE_9EFB = 0x9efb;
const EAI_BIN_INDEX = 0x9efe;
const ENP_GRP_INDEX = 0x9eff;
const BYTE_9F02 = 0x9f02;
const BYTE_9F2E = 0x9f2e;
const HERO_HIDDEN_FLAG = 0xff3a;
const BYTE_FF24 = 0xff24;
const DUNGEON_STATE = 0xff90;
const DUNGEON_FRAME_PHASE = 0xff91;
const RENDER_REQUEST = 0xff92;
const RENDER_DONE = 0xff93;
const DEATH_COUNTER = 0xff95;
const DUNGEON_SUBSTATE = 0xff9b;
const DUNGEON_SUBSTATE_PHASE = 0xff9c;
const ROKA_COLOR = 0xff9e;
const EXIT_FLAG = 0xffe2;
const PENDING_DUNGEON_MAP = 0xfffc;
const PENDING_DUNGEON_FLAG = 0xfffd;
// ADDR_MAGIA_STONE_SPRITE0..3 (zeliard.h): 4 sprites, 7 bytes each
const MAGIA_STONE_SPRITES = [0xeb60, 0xeb67, 0xeb6e, 0xeb75];

function g8(g: Uint8Array, addr: number): number {
    return g[addr & 0xffff] ?? 0;
}

function s8(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
}

function g16(g: Uint8Array, addr: number): number {
    return (g[addr & 0xffff] ?? 0) | ((g[(addr + 1) & 0xffff] ?? 0) << 8);
}

function s16(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
    g[(addr + 1) & 0xffff] = (v >> 8) & 0xff;
}

/** remove_accomplished_items (dungeon.c:1218). */
export function removeAccomplishedItems(g: Uint8Array): void {
    let si = g16(g, ACHIEVEMENTS_TABLE);
    for (;;) {
        let di = g16(g, si);
        if (di === 0xffff) break;
        si += 3;
        if ((g8(g, si - 1) & g8(g, di)) !== 0) { // move_loop
            for (;;) {
                di = g16(g, si);
                if (di === 0xffff) break; // null address
                s16(g, di, g16(g, si + 2));
                si += 4;
            }
        } else { // skip_loop
            while (g16(g, si) !== 0xffff) {
                si += 4;
            }
        }
        si += 2;
    }
}

/** hero_left_16_down_1 (dungeon.c:1242). */
export function heroLeft16Down1(g: Uint8Array): void {
    const x = g16(g, HERO_X_IN_PROXIMITY_MAP);
    const w = g16(g, MAP_WIDTH);
    s16(g, LEFT_COL_NUM, ((x < 16 ? x + w : x) - 16) & 0xffff);
    s8(
        g,
        VIEWPORT_TOP_ROW,
        (g8(g, DOOR_TARGET_Y) + 1 - g8(g, HERO_Y_VIEW_INIT)) & 0x3f,
    );
}

/** process_mdt_descriptor (dungeon.c:1256). */
export function processMdtDescriptor(
    g: Uint8Array,
    descr0: number,
    descrPtr1: number,
): void {
    // memmove(&g_mem[ADDR_MMAN_GRP_INDEX], &g_mem[descr_ptr1], 4)
    for (let i = 0; i < 4; i++) {
        g[(MMAN_GRP_INDEX + i) & 0xffff] = g[(descrPtr1 + i) & 0xffff] ?? 0;
    }
    let idx = (descr0 >> 1) & 0x0f;
    if (idx !== g8(g, MSD_INDEX)) {
        s8(g, BYTE_FF24, 10);
        s8(g, MSD_INDEX, idx);
    } else {
        idx = 0xff;
    }
    s8(g, BYTE_9EFA, idx);
    s8(g, BYTE_9EFB, 0xff);
}

/**
 * prepare_dungeon (dungeon.c:1887). Writes g_mem AND the shared statics
 * (mirroring the C file statics), so callers must pass the live singleton.
 */
export function prepareDungeon(
    g: Uint8Array,
    isFromTown: boolean,
    statics: DungeonRuntimeStatics,
    callbacks?: PrepareDungeonCallbacks,
): void {
    // memset(&g_mem[ADDR_BYTE_9EED], 0, ADDR_BYTE_9F2E - ADDR_BYTE_9EED - 1);
    g.fill(0, BYTE_9EED, BYTE_9EED + (BYTE_9F2E - BYTE_9EED - 1));
    s8(g, BYTE_9EF5, 0xff);
    s8(g, EAI_BIN_INDEX, 0xff);
    s8(g, ENP_GRP_INDEX, 0xff);
    // Only reset on actual town re-entry, not during door transitions.
    statics.isFromTown = isFromTown;
    if (isFromTown) statics.savedYViewInit = 10;
    resetDungeonStateVars(g);
    // Only reset magia stones on town→dungeon entry, not cavern→cavern doors
    if (isFromTown) {
        for (const sprite of MAGIA_STONE_SPRITES) s8(g, sprite, 0xff);
    }
    s8(g, HERO_HIDDEN_FLAG, 0);
    // load 'fman.grp' into fman_gfx → done in JS

    const mdtDescr = g16(g, MDT);
    const al = g8(g, mdtDescr);
    processMdtDescriptor(g, al, mdtDescr + 1);
    // Clear_Viewport_proc(): JS-side stub

    // Recalculate proximity map left column using the new MDT's width;
    // saved_door_x1 survives the memset above (it zeroes 0x9F1A).
    const x = statics.savedDoorX1 & 0xffff;
    const w = g16(g, MAP_WIDTH);
    s16(g, LEFT_COL_NUM, ((x < 16 ? x + w : x) - 16) & 0xffff);
    // Reset hero viewport X to dungeon default (12).
    s8(g, HERO_X_VIEW, 12);
    // res_dispatcher_proc("roka.grp", 0x18000): JS-side stub
    if (isFromTown) {
        s8(g, ROKA_COLOR, 0); // Render_Roca_Tilemap(0): always cyan from town
    }

    const mapId = g8(g, PLACE_MAP_ID);
    if ((mapId & 0x80) === 0) {
        removeAccomplishedItems(g);
    }
    // load_eai_module(map_id & 0x7F): AI function-pointer select — no g_mem
    // effect; becomes a registry select when Stage 9 lands.

    // Town→boss cavern entries show only the encounter flash (the original
    // never plays the roka run here).
    const isBossCavern = (g8(g, mdtDescr) & 0x80) !== 0;
    if (statics.skipRokaRun || (isFromTown && isBossCavern)) {
        // Post-rokademo cavern entry, or town→boss entry: finalize directly.
        statics.skipRokaRun = false;
        afterRunAnimation(g, statics, callbacks?.mainUpdateRender);
    } else {
        rokaRun(g);
        // after_run_animation() runs via the DUNGEON_STATE_ROKA_RUN handler
    }
}

/**
 * wasm_dungeon_init (dungeon.c:1798).
 */
export function wasmDungeonInit(
    g: Uint8Array,
    mapId: number,
    isFromTown: boolean,
    statics: DungeonRuntimeStatics,
    callbacks?: PrepareDungeonCallbacks,
): void {
    void mapId;
    prepareDungeon(g, isFromTown, statics, callbacks);

    s8(g, EXIT_FLAG, 0);
    // prepare_dungeon may have finalized directly into a boss cavern
    // (town→boss skips the roka run), in which case Cavern_Game_Init set the
    // state to BOSS_ENCOUNTER for the JS encounter flash. Preserve that;
    // only force NORMAL when no roka run and no encounter were started.
    const state = g8(g, DUNGEON_STATE);
    if (
        state !== DUNGEON_STATE_ROKA_RUN &&
        state !== DUNGEON_STATE_BOSS_ENCOUNTER &&
        state !== DUNGEON_STATE_JASHIIN_CUTSCENE
    ) {
        s8(g, DUNGEON_STATE, 0 /* DUNGEON_STATE_NORMAL */);
    }
    s8(g, DUNGEON_FRAME_PHASE, 0);
    s8(g, RENDER_REQUEST, 0xff);
    s8(g, RENDER_DONE, 0);
    s8(g, DEATH_COUNTER, 0);
    s8(g, DUNGEON_SUBSTATE, 0);
    s8(g, DUNGEON_SUBSTATE_PHASE, 0);
}

/**
 * wasm_finish_rokademo_transition (dungeon.c:1857). Called by the
 * composition root once the tear-collection demo animation finished.
 */
export function finishRokademoTransition(
    g: Uint8Array,
    statics: DungeonRuntimeStatics,
    callbacks?: PrepareDungeonCallbacks,
): void {
    s8(g, ENP_GRP_INDEX, 0xff);
    s8(g, EAI_BIN_INDEX, 0xff);
    s8(g, BYTE_9EFA, g8(g, MSD_INDEX));
    s8(g, BYTE_9F02, 0xff);
    // load_cavern_sprites_ai_music(): JS loads assets
    afterRunAnimation(g, statics, callbacks?.mainUpdateRender);

    // After the final (Jashiin) demo the hero is meant to die: let the death
    // sequence play out instead of re-entering this dungeon.
    const state = g8(g, DUNGEON_STATE);
    if (state >= 2 /* DEATH_FALL */ && state <= 4 /* DEATH_FADE */) {
        return;
    }

    const placeMapId = g8(g, PLACE_MAP_ID);
    if ((placeMapId & 0x80) === 0) {
        s8(g, PENDING_DUNGEON_MAP, placeMapId);
        s8(g, PENDING_DUNGEON_FLAG, 0xff);
        s8(g, DUNGEON_STATE, 6 /* DUNGEON_STATE_EXIT */);
        // load_eai_module(place_map_id): no-op until Stage 9
        // The demo already showed the hero running in — don't play a roka
        // run when prepare_dungeon re-initializes the target cavern below.
        statics.skipRokaRun = true;
    }
}

/** Injected JS-side work for the init family. */
export interface PrepareDungeonCallbacks {
    /**
     * main_update_render — the BYTE_9F27 branch of Cavern_Game_Init.
     * Bound by the composition root to the dispatched frame pipeline.
     */
    mainUpdateRender?: (g: Uint8Array) => void;
}
