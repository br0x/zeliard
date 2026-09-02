/**
 * dungeon-doors.ts — TS port of dungeon.c's door interaction and
 * transition flows (Stage 8d, slice 9).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - enter_the_door                        (5140)
 *   - open_door                             (5195)
 *   - enter_opened_door                     (5217)
 *   - dungeon_complete_door_transition      (5250)
 *   - reset helpers used by the above
 *
 * The C file statics g_door_* become DoorPendingState (caller-owned).
 */

import {
    renderNotificationString,
} from './dungeon-items.js';
import { DUNGEON_STATE_DOOR_PENDING, DUNGEON_STATE_EXIT } from './dungeon-state-machine.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';


// g_mem addresses
const HERO_XV = 0x83;
const HERO_HEAD_Y_VIEW = 0x84;
const HERO_ANIM_PHASE = 0xe7;
const HORIZ_MOVEMENT_ACCUM = 0x9f21;
const BYTE_9F19 = 0x9f19;
const LEFT_RUN = 0xc3;
const MSD_INDEX = 0xc8;
const ENP_GRP_INDEX = 0x9eff;
const EAI_BIN_INDEX = 0x9efe;
const MAP_WIDTH = 0xc002; // word
const LEFT_COL_NUM = 0x80; // word
const MONSTERS_LIST = 0xc010; // word pointer
const MDT = 0xc000; // word pointer
const HERO_Y_VIEW_INIT = 0xc016;
const DOORS_LIST = 0xc00a; // word pointer
const VIEWPORT_TOP_ROW = 0x82;
const PLACE_MAP_ID_ADDR = 0xc4;
const KEYS_AMOUNT = 0x98;
const LION_KEYS_AMOUNT = 0x99;
const HERO_X_IN_PROXIMITY_MAP = 0x9f1a; // word
const DOOR_TARGET_Y = 0x9f1c;
const DOOR_FEATURES = 0x9f1d;
const FRAME_TIMER = 0xff1a; // ADDR_FRAME_TIMER (the door-wait + back-frame delay counter)
const SPEED_CONST = 0xff33;
const SOUND_FX_REQUEST = 0xff75;
const ROKA_COLOR = 0xff9e;
const RENDER_DONE = 0xff93;
const RENDER_REQUEST = 0xff92;
const FACING = 0xc2;
const LEFT_FLAG = 0x01; // FACING bit 0 (matches dungeon-input's LEFT_FLAG)
const TEAR_COUNT = 0xa0;
const ROKA_PHASE = 0xff9d;
const DUNGEON_STATE_ROKADEMO = 9;
const PENDING_DUNGEON_MAP_UNUSED = 0xff22;
void PENDING_DUNGEON_MAP_UNUSED;

export const CANT_OPEN_THIS_DOOR_STR = 9;



/** Door data saved by enter_opened_door for deferred completion. */
export interface DoorPendingState {
    monstersPtr: number;
    flags: number;
    x1: number;
    y1: number;
    features: number;
    placeMapId: number;
}

export interface DoorCallbacks {
    /** game_loop_render_and_timing(0) — redraw everything, hero hidden. */
    gameLoopRenderAndTiming: (g: Uint8Array, invincible: number) => void;
    /** roka_run() — begin post-boss run animation. */
    rokaRun: (g: Uint8Array) => void;
    /** load_eai_module(place_map_id). */
    loadEaiModule: (g: Uint8Array, placeMapId: number) => void;
}

/** enter_the_door (dungeon.c:5140). */
export function enterTheDoor(
    g: Uint8Array,
    shouldBreak: { v: number },
    state: DoorPendingState,
    callbacks: DoorCallbacks,
): void {
    // hero absolute X
    let x = (memRead16(g, LEFT_COL_NUM) + (memRead8(g, HERO_XV) ?? 0) + 4) & 0xffff;
    const w = memRead16(g, MAP_WIDTH);
    if (x >= w) x -= w;

    // absolute y
    const y =
        ((memRead8(g, HERO_HEAD_Y_VIEW) - 1 + (memRead8(g, VIEWPORT_TOP_ROW) ?? 0)) & 0x3f);

    for (let si = memRead16(g, DOORS_LIST); memRead16(g, si) !== 0xffff; si += 12) {
        if (
            x === memRead16(g, si) &&
            y === memRead8(g, si + 2)
        ) {
            shouldBreak.v = 0xff;
            if ((memRead8(g, si + 3) & 0x80) !== 0) {
                enterOpenedDoor(g, si, state, callbacks);
            } else {
                if (openDoor(g, si)) return; // success
                // failed to open
                memWrite8(g, HERO_ANIM_PHASE, 0x80);
                memWrite8(g, HORIZ_MOVEMENT_ACCUM, 0);
                if (memRead8(g, BYTE_9F19) !== 0) return;
                memWrite8(g, BYTE_9F19, 0xff);
                memWrite8(g, SOUND_FX_REQUEST, 22);
                renderNotificationString(g, CANT_OPEN_THIS_DOOR_STR);
                return;
            }
        }
    }
}

/** open_door (dungeon.c:5195): returns nonzero on success. */
export function openDoor(g: Uint8Array, si: number): number {
    if ((memRead8(g, si + 8) & 1) !== 0) {
        // lion head key needed
        if (memRead8(g, LION_KEYS_AMOUNT) === 0) return 0;
        memWrite8(g, LION_KEYS_AMOUNT, (memRead8(g, LION_KEYS_AMOUNT) - 1) & 0xff);
    } else {
        // ordinary key needed
        if (memRead8(g, KEYS_AMOUNT) === 0) return 0;
        memWrite8(g, KEYS_AMOUNT, (memRead8(g, KEYS_AMOUNT) - 1) & 0xff);
    }

    memWrite8(g, SOUND_FX_REQUEST, 21);
    memWrite8(g, si + 3, memRead8(g, si + 3) | 0x80); // d_flags open bit
    const achievementAddr = memRead16(g, si + 9);
    const achievementFlag = memRead8(g, si + 11);
    memWrite8(g, achievementAddr, (memRead8(g, achievementAddr) | achievementFlag) & 0xff);
    return 0xff;
}

/** Browse_Projectiles equivalent used by enter_opened_door. */
function clearViewportBufferLocal(g: Uint8Array): void {
    g.fill(0xfd, 0xe900, 0xe900 + 28 * 19);
}

export function browseProjectiles(g: Uint8Array): void {
    let p = 0xeb80;
    for (;;) {
        if (memRead8(g, p) === 0xff) {
            memWrite8(g, 0xeb80, 0xff);
            return;
        }
        p += 13;
    }
}


/**
 * enter_opened_door (dungeon.c:5217): save door data for deferred
 * completion, show the back-facing frame.
 */
export function enterOpenedDoor(
    g: Uint8Array,
    si: number,
    state: DoorPendingState,
    callbacks: DoorCallbacks,
): void {
    const bx = memRead16(g, si + 9);
    if (bx !== 0xffff) {
        memWrite8(g, bx, (memRead8(g, bx) | memRead8(g, si + 11)) & 0xff);
    }

    browseProjectiles(g);
    clearViewportBufferLocal(g);
    // Flush_Ui_Element_If_Dirty_proc(): stub

    // reset_dungeon_state_vars() minus viewport clear (done above)
    memWrite8(g, 0xff43 /* SWORD_SWING_FLAG */, 0);
    memWrite8(g, 0xff44 /* UI_ELEMENT_DIRTY */, 0);
    memWrite8(g, 0xff3c /* SPELL_ACTIVE_FLAG */, 0);
    memWrite8(g, 0xff38 /* SQUAT_FLAG */, 0);
    memWrite8(g, 0xff36 /* HERO_DAMAGE_THIS_FRAME */, 0);
    memWrite8(g, 0x9eef, 0);
    memWrite8(g, 0xff3e, 0);
    memWrite8(g, 0xff4b, 0);
    memWrite8(g, 0xff08 /* HEARTBEAT_VOLUME */, 0);
    memWrite8(g, HERO_ANIM_PHASE, 0);
    memWrite8(g, 0xeb80, 0xff); // PROJECTILES_LIST terminator
    memWrite8(g, BOSS_EXPLOSIONS_LIST_ADDR, 0);
    memWrite16(g, MAGIC_PROJECTILES_ADDR, 0xffff);
    memWrite8(g, 0xff3a /* HERO_HIDDEN_FLAG */, 0xff);
    memWrite8(g, 0x9ef5, 0xff);
    clearViewportBufferLocal(g);

    callbacks.gameLoopRenderAndTiming(g, 0); // back frame; hero hidden

    // save door data for deferred completion
    state.monstersPtr = memRead16(g, MONSTERS_LIST);
    state.flags = memRead8(g, si + 3);
    state.x1 = memRead16(g, si + 5);
    state.y1 = memRead8(g, si + 7);
    state.features = memRead8(g, si + 8);
    state.placeMapId = memRead8(g, si + 4);

    // FRAME_TIMER reset so the back-frame delay starts from zero
    memWrite8(g, FRAME_TIMER, 0);
    memWrite8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_DOOR_PENDING);
}

const BOSS_EXPLOSIONS_LIST_ADDR = 0xeda0;
const MAGIC_PROJECTILES_ADDR = 0xeb15;

/**
 * dungeon_complete_door_transition (dungeon.c:5250): phase 2 of the
 * opened-door transition.
 */
export function dungeonCompleteDoorTransition(
    g: Uint8Array,
    state: DoorPendingState,
    statics: { savedYViewInit: number; savedDoorX1: number },
    callbacks: DoorCallbacks & {
        removeAccomplishedItems: (g: Uint8Array) => void;
        heroLeft16Down1: (g: Uint8Array) => void;
        processMdtDescriptor: (g: Uint8Array, desc0: number, descrPtr: number) => void;
    },
): void {
    // wait SPEED_C*14 ≈ 70 ticks ≈ 296ms at default speed
    if (memRead8(g, FRAME_TIMER) < ((memRead8(g, SPEED_CONST) * 14) & 0xff)) {
        return;
    }

    // clear monster table
    memWrite16(g, state.monstersPtr, 0xffff);

    // door data saved by enter_opened_door
    const doorFlags = state.flags;
    const rokaColor = doorFlags & 7;
    const x1 = state.x1;
    memWrite16(g, HERO_X_IN_PROXIMITY_MAP, x1);
    // Preserve across prepare_dungeon's memset (which zeroes 0x9F1A) so it
    // can recalculate PROXIMITY_MAP_LEFT_COL with the new MDT's width.
    statics.savedDoorX1 = x1;
    const y1 = state.y1;
    memWrite8(g, DOOR_TARGET_Y, y1);
    const isLeftRun = ((doorFlags >> 6) & 1) !== 0;
    memWrite8(g, LEFT_RUN, isLeftRun ? 1 : 0);
    const doorFeatures = state.features;
    memWrite8(g, DOOR_FEATURES, doorFeatures);
    let placeMapId = state.placeMapId;
    if (y1 === 0xff) {
        placeMapId |= 0x80; // door leads to town
    }
    memWrite8(g, PLACE_MAP_ID_ADDR, placeMapId);

    // load_mdt(): stub — real MDT loaded in game.js

    if ((placeMapId & 0x80) === 0) {
        callbacks.removeAccomplishedItems(g);
    }

    // save old HERO_Y_VIEW_INIT before hero_left_16_down_1 uses it
    statics.savedYViewInit = memRead8(g, HERO_Y_VIEW_INIT);

    callbacks.heroLeft16Down1(g);

    // NB! This still reads the old MDT since load_mdt() is a stub.
    const mdtDescr = memRead16(g, MDT);
    const mdtDesc0 = memRead8(g, mdtDescr);
    memWrite8(g, ROKA_COLOR, rokaColor); // Render_Roca_Tilemap(roka_color)
    if ((mdtDesc0 & 1) === 0) {
        memWrite8(g, MSD_INDEX, 0xff);
        memWrite8(g, 0xff24, 10);
    } else {
        callbacks.processMdtDescriptor(g, mdtDesc0, mdtDescr + 1);
    }

    memWrite8(g, 0xff3a /* HERO_HIDDEN_FLAG */, 0);
    memWrite8(g, 0x9ef5, 0xff);
    memWrite8(g, 0xeb80, 0xff); // PROJECTILES_LIST terminator

    if ((doorFeatures & 0x80) !== 0) {
        // just defeated the boss → tear-collection demo follows
        callbacks.removeAccomplishedItems(g);
        // load_resource("rokademo.bin", ...): JS-side asset load

        // roka_entrypoint (dungeon.c:1271): tear count + demo state setup.
        // The DUNGEON_STATE_ROKADEMO write is what hands control to the
        // JS-side animation; omitting it wedges the door in DOOR_PENDING.
        let tears = (memRead8(g, TEAR_COUNT) + 1) & 0xff;
        if (tears > 9) tears = 9;
        memWrite8(g, TEAR_COUNT, tears);
        memWrite8(g, ROKA_PHASE, 0);
        memWrite8(g, FRAME_TIMER, 0);
        memWrite8(g, HERO_ANIM_PHASE, 0);
        memWrite8(g, FACING, memRead8(g, FACING) & ~LEFT_FLAG);
        memWrite8(g, LEFT_RUN, 0);
        memWrite8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_ROKADEMO);
        memWrite8(g, RENDER_DONE, 0);
        memWrite8(g, RENDER_REQUEST, 0xff);

        memWrite8(g, ENP_GRP_INDEX, 0xff);
        memWrite8(g, EAI_BIN_INDEX, 0xff);
        memWrite8(g, 0x9efa, memRead8(g, MSD_INDEX));
        memWrite8(g, 0x9f02, 0xff);
        // load_cavern_sprites_ai_music(): stub
        // demo plays in DUNGEON_STATE_ROKADEMO; wasm_finish_rokademo_transition
        // runs when the JS-side animation finishes
    } else {
        callbacks.rokaRun(g);
    }

    if (!(doorFeatures & 0x80) && (placeMapId & 0x80) === 0) {
        memWrite8(g, 0xfffc /* PENDING_DUNGEON_MAP */, placeMapId);
        memWrite8(g, 0xfffd /* PENDING_DUNGEON_FLAG */, 0xff);
        memWrite8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_EXIT);
        callbacks.loadEaiModule(g, placeMapId & 0x7f);
    }
}

