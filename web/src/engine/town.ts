/**
 * town.ts — TS port of src/town.c's tick family.
 *
 * Ports town_update/town_full_tick and everything they reach:
 * town_main_loop_step, hero movement + collision, door detection, edge
 * transitions, spacebar/special-NPC conversation triggers, the full NPC AI
 * table, head-tile save/restore, the inventory-key path, and the
 * pending-wait machinery. Semantics are ported 1:1 from the C (itself a
 * reconstruction of the original asm), including uint16 pointer arithmetic
 * quirks.
 *
 * C file statics become TownTickState owned here: door-pending animation,
 * pending frame waits. The dungeon-handoff `saved_door_x1` C global is
 * written via setDoorX1() at the moment request_dungeon_transition fires.
 */

import { SEG1_BASE } from '../core/memory.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';

// ─── g_mem-relative addresses (zeliard.h / town.c) ───
const INPUT_ALT_SPACE = 0xff16;
const INPUT_DIRS = 0xff17;
const ENTER_WORD = 0xff18; // bit0 = Enter
const FRAME_TMR = 0xff1a;
const ANIM_TIMER = 0xff1b;
const SPACEBAR = 0xff1d;
const ALTKEY = 0xff1e;
const SCROLL_REQUEST = 0xfff0;
const CONV_ACTIVE = 0xfff5;
const CONV_NPC_ADDR = 0xfff6; // word
const CONV_SAVED_AI = 0xfff8;
const CONV_SAVED_FACING = 0xfff9;
const TRANS_MAP = 0xfff1;
const TRANS_PAT = 0xfff2;
const TRANS_DIR = 0xfff3;
const TRANS_FLAG = 0xfff4;
const BUILDING_ACTIVE = 0xfffa;
const BUILDING_DEST_ID = 0xfffb;
const PENDING_DUNGEON_MAP = 0xfffc;
const PENDING_DUNGEON_FLAG = 0xfffd;
const TICK_COUNTER = 0xff50; // word
const PROX_START = 0xff2a; // word
const SPEED_C = 0xff33;
const BYTE_FF24 = 0xff24;
const SFX_REQUEST = 0xff75;

const LEFT_COL = 0x80; // word
const HERO_XV = 0x83;
const FACING = 0xc2; // bit0: 1 = facing left
const LEFT_RUN = 0xc3;
const PLACE_MAP_ID = 0xc4;
const HERO_ANIM = 0xe7;
const DISABLE_EDGE_SCROLL = 0x7c43;
const MIDDLE_LYR = 0x7c45;
const HERO_MOVED = 0x7c4b;
const DIALOG_EXIT = 0x7c5c;

const MAP_WIDTH = 0xc002; // word
const DOORS_LIST = 0xc009; // word ptr
const TOWN_TRANSITION_TABLE = 0xc007; // word ptr
const DUNGEON_ENTRANCE_TABLE = 0xc00b; // word ptr
const NPC_ARRAY = 0xc00f; // word ptr
const NPC_PATROL_BOUNDARIES = 0xc011; // word ptr
const TOWN_TILES = 0xc017;
const NPC_HEAD_TILES = 0xc01c;

const VIEWPORT_BUFFER = 0xe000;
/** seg1-relative pointer word to the special (non-passable) tile list. */
const SPECIAL_TILE_LIST_PTR = 0x8002;
const NPC_RECORD_SIZE = 8;
const NPC_TERMINATOR = 0xffff;
const PROX_COLS = 28;

// ─── seg1 accessors — mirrors of C's SEG1_8/SEG1_16 macros (town.c:85-86).
// NOTE: g8/g16 mask addresses to 16 bits, so they must NEVER be handed a
// seg1-based address (0x10000+): the read would silently truncate to seg0.
function seg1_8(g: Uint8Array, off: number): number {
    return g[SEG1_BASE + (off & 0xffff)] ?? 0;
}

function seg1_16(g: Uint8Array, off: number): number {
    const base = SEG1_BASE + (off & 0xffff);
    return (g[base] ?? 0) | ((g[base + 1] ?? 0) << 8);
}

// ─── little-endian accessors with DOS uint16 address masking ───



/** uint16 decrement/increment with wraparound (C pointer arithmetic). */
const dec16 = (v: number): number => (v - 1) & 0xffff;
const inc16 = (v: number): number => (v + 1) & 0xffff;

export interface ExternalHooks {
    /** Push the town→dungeon door x into the still-wasm prepare_dungeon. */
    setDoorX1(x: number): void;
}

// ─── C file statics ───

export interface TownTickState {
    doorPendingAnim: boolean;
    doorPendingDest: number; // 0xFF = none
    updateActive: boolean;
    pendingWait: boolean;
    pendingWaitTarget: number;
    /** g_town_return_before_main_loop */
    returnBeforeMainLoop: boolean;
}

export function createTownTickState(): TownTickState {
    return {
        doorPendingAnim: false,
        doorPendingDest: 0xff,
        updateActive: false,
        pendingWait: false,
        pendingWaitTarget: 0,
        returnBeforeMainLoop: false,
    };
}

/** Shared state for the dispatched implementations (mirrors C statics). */
export const townTickState = createTownTickState();

let hooks: ExternalHooks = {
    setDoorX1: () => {
        throw new Error('setDoorX1 hook not installed');
    },
};

export function installTownHooks(h: Partial<ExternalHooks>): void {
    hooks = { ...hooks, ...h };
}

// ─── small lookups ───

/** check_tile_in_special_list: tile ∈ seg1 count-prefixed special list. */
function tileInSpecialList(g: Uint8Array, tile: number): boolean {
    const si = seg1_16(g, SPECIAL_TILE_LIST_PTR);
    const count = seg1_8(g, si);
    if (count === 0) return false;
    for (let i = 0; i < count; i++) {
        if (seg1_8(g, si + 1 + i) === tile) return true;
    }
    return false;
}

/** find_non_passable_npc_at_x_pos: n_x == x && n_flags bit6. */
function findNonPassableNpcAtX(g: Uint8Array, x: number): number | null {
    let si = memRead16(g, NPC_ARRAY);
    for (;;) {
        const nx = memRead16(g, si);
        if (nx === NPC_TERMINATOR) return null;
        if (nx === x && (memRead8(g, si + 6) & 0x40) !== 0) return si;
        si += NPC_RECORD_SIZE;
    }
}

function findFirstNpcAtX(g: Uint8Array, dx: number): number {
    let si = memRead16(g, NPC_ARRAY);
    // find_first_npc_at_x_after_current: scans until n_x == dx. The C loops
    // forever if absent (every conversation target exists); we bound it so
    // a broken fixture fails loudly instead of hanging CI.
    for (let guard = 0; guard < 0x10000; guard++) {
        if (memRead16(g, si) === dx) return si;
        si += NPC_RECORD_SIZE;
    }
    throw new Error(`no NPC at x=${dx}`);
}

// ─── NPC head-tile save/restore ───

function saveHeadLevelTilesInNpcs(g: Uint8Array): void {
    let si = memRead16(g, NPC_ARRAY);
    for (;;) {
        const bx = memRead16(g, si);
        if (bx === NPC_TERMINATOR) return;
        const tileAddr = NPC_HEAD_TILES + bx * 8;
        const head = memRead8(g, tileAddr);
        memWrite8(g, tileAddr, 0xfd);
        memWrite8(g, si + 3, head); // n_head_tile
        si += NPC_RECORD_SIZE;
    }
}

function restoreHeadLevelTilesFromNpcs(g: Uint8Array): void {
    let si = memRead16(g, NPC_ARRAY);
    for (;;) {
        const bx = memRead16(g, si);
        if (bx === NPC_TERMINATOR) return;
        const head = memRead8(g, si + 3);
        if (head !== 0xfd) {
            memWrite8(g, TOWN_TILES + 5 + bx * 8, head);
        }
        si += NPC_RECORD_SIZE;
    }
}

// ─── NPC AI table ───

function npcBobInPlace(g: Uint8Array, si: number): void {
    let al = memRead8(g, si + 4);
    al = (al + 0x10) & 0xff;
    memWrite8(g, si + 4, al);
    const ch = al;
    if ((al & 0x30) === 0) {
        memWrite8(g, si + 4, (ch + 1) & 1);
    }
}

function npcFaceHero(g: Uint8Array, si: number): void {
    const heroAbs = ((memRead8(g, HERO_XV) + 4) & 0xffff) + memRead16(g, LEFT_COL);
    const dx = memRead16(g, si);
    if (heroAbs >= dx) {
        memWrite8(g, si + 2, memRead8(g, si + 2) & 0x7f); // face right
    } else {
        memWrite8(g, si + 2, memRead8(g, si + 2) | 0x80); // face left
    }
}

function npcLookAtHeroAndBob(g: Uint8Array, si: number): void {
    npcFaceHero(g, si);
    npcBobInPlace(g, si);
}

function patrolBetweenBoundaries(g: Uint8Array, si: number, dxPtr: { v: number }, ch: number): void {
    memWrite8(g, si + 4, (ch + 1) & 0x0f);

    const patrolBx = memRead16(g, NPC_PATROL_BOUNDARIES);
    if ((memRead8(g, si + 2) & 0x80) !== 0) {
        // moving left
        dxPtr.v = dec16(dxPtr.v);
        if (dxPtr.v <= memRead16(g, patrolBx)) {
            memWrite8(g, si + 2, memRead8(g, si + 2) & 0x7f); // turn right
        }
    } else {
        // moving right
        dxPtr.v = inc16(dxPtr.v);
        if (dxPtr.v > memRead16(g, patrolBx + 2)) {
            memWrite8(g, si + 2, memRead8(g, si + 2) | 0x80); // turn left
        }
    }
}

function patrolBounceAtPhase(g: Uint8Array, si: number, dxPtr: { v: number }, chIn: number): void {
    const ch = (chIn + 1) & 0xff;
    memWrite8(g, si + 4, ch & 0x0f);

    if ((ch & 7) === 0) {
        memWrite8(g, si + 2, memRead8(g, si + 2) ^ 0x80);
        return;
    }
    if ((memRead8(g, si + 2) & 0x80) !== 0) dxPtr.v = dec16(dxPtr.v);
    else dxPtr.v = inc16(dxPtr.v);
}

function npcAiFor(aiType: number, g: Uint8Array, si: number, dxPtr: { v: number }): void {
    switch (aiType) {
        case 0:
            npcLookAtHeroAndBob(g, si);
            break;
        case 1:
        case 2: {
            // patrol_1bit / patrol_2bit: advance phase; move every 2nd/4th call
            let al = (memRead8(g, si + 4) + 0x10) & 0xff;
            memWrite8(g, si + 4, al);
            const ch = al;
            const mask = aiType === 1 ? 0x10 : 0x30;
            if ((al & mask) === 0) patrolBetweenBoundaries(g, si, dxPtr, ch);
            break;
        }
        case 3:
            npcFaceHero(g, si);
            break;
        case 4:
            npcBobInPlace(g, si);
            break;
        case 5:
        case 6: {
            let al = (memRead8(g, si + 4) + 0x10) & 0xff;
            memWrite8(g, si + 4, al);
            const ch = al;
            const mask = aiType === 5 ? 0x10 : 0x30;
            if ((al & mask) === 0) patrolBounceAtPhase(g, si, dxPtr, ch);
            break;
        }
        default:
            break; // ai_type 7 = static; ≥8 never dispatched (C guards < 8)
    }
}

function updateNpcs(g: Uint8Array): void {
    restoreHeadLevelTilesFromNpcs(g);
    let si = memRead16(g, NPC_ARRAY);
    for (;;) {
        const dx = memRead16(g, si);
        if (dx === NPC_TERMINATOR) {
            saveHeadLevelTilesInNpcs(g);
            return;
        }
        const aiType = memRead8(g, si + 5);
        const dxPtr = { v: dx };
        if (aiType < 8) npcAiFor(aiType, g, si, dxPtr);
        memWrite16(g, si, dxPtr.v);
        si += NPC_RECORD_SIZE;
    }
}

// ─── frame-wait machinery ───

function clear6HeroTilesInViewportBuffer(g: Uint8Array): void {
    const vpCol = memRead8(g, HERO_XV);
    if (vpCol >= 27) return;

    const di = VIEWPORT_BUFFER + vpCol * 8 + 5;
    memWrite8(g, di + 0, 0xff);
    memWrite8(g, di + 1, 0xff);
    memWrite8(g, di + 2, 0xff);
    memWrite8(g, di + 5, 0xff);
    memWrite8(g, di + 6, 0xff);
    memWrite8(g, di + 7, 0xff);
}

/**
 * game_loop_with_frame_wait. When driven from the JS main loop
 * (updateActive) the timer has already reached target: reset FRAME_TMR.
 * Otherwise arm a pending wait that townFullTick completes.
 */
function gameLoopWithFrameWait(g: Uint8Array, st: TownTickState): void {
    clear6HeroTilesInViewportBuffer(g);
    const target = (memRead8(g, SPEED_C) * 4) & 0xff;

    if (st.updateActive) {
        memWrite8(g, FRAME_TMR, 0);
        return;
    }

    st.pendingWait = true;
    st.pendingWaitTarget = target;
}

/** town_complete_wait — procs are unregistered in the web build (no-op). */
function townCompleteWait(g: Uint8Array, st: TownTickState): void {
    if (!st.pendingWait) return;
    memWrite8(g, FRAME_TMR, 0);
    st.pendingWait = false;
    st.pendingWaitTarget = 0;
}

// ─── conversation triggers ───

function startNpcConversation(g: Uint8Array, siAddr: number): void {
    // Clear bit 7 of n_flags so conversation only triggers once per entry
    memWrite8(g, siAddr + 6, memRead8(g, siAddr + 6) & 0x7f);
    memWrite16(g, CONV_NPC_ADDR, siAddr);
    memWrite8(g, CONV_ACTIVE, 1);
    memWrite8(g, SFX_REQUEST, 30);
}

function makeNpcFaceHeroAndFreeze(g: Uint8Array, npcSi: number): void {
    memWrite8(g, CONV_SAVED_FACING, memRead8(g, npcSi + 2));
    memWrite8(g, CONV_SAVED_AI, memRead8(g, npcSi + 5));

    memWrite8(g, npcSi + 5, 7); // freeze: AI = 7 (static)
    if ((memRead8(g, FACING) & 1) !== 0) {
        memWrite8(g, npcSi + 2, memRead8(g, npcSi + 2) & 0x7f); // face right
    } else {
        memWrite8(g, npcSi + 2, memRead8(g, npcSi + 2) | 0x80); // face left
    }
}

/** hero_spacebar_interaction */
function heroSpacebarInteraction(g: Uint8Array): void {
    if (memRead8(g, SPACEBAR) === 0) return;
    memWrite8(g, SPACEBAR, 0);

    const viewportCol = (memRead8(g, HERO_XV) + 4) & 0xffff;
    const bx = ((viewportCol * 8 + 5) & 0xffff) + memRead16(g, PROX_START);
    let absX = ((viewportCol + memRead16(g, LEFT_COL)) & 0xffff);

    const delta = (memRead8(g, FACING) & 1) !== 0 ? -1 : 1;
    absX += delta;

    let foundTile = false;
    for (let i = 1; i <= 3; i++) {
        if (memRead8(g, (bx + 8 * delta * i) & 0xffff) === 0xfd) {
            foundTile = true;
            break;
        }
        absX += delta;
    }
    if (!foundTile) return;

    const npcSi = findFirstNpcAtX(g, absX & 0xffff);
    if ((memRead8(g, npcSi + 6) & 0xc0) !== 0) return; // busy NPC

    makeNpcFaceHeroAndFreeze(g, npcSi);
    memWrite8(g, npcSi + 4, memRead8(g, npcSi + 4) | 1); // n_anim_phase
    startNpcConversation(g, npcSi);
}

/** check_special_npc_conversation */
function checkSpecialNpcConversation(g: Uint8Array): void {
    const viewportCol = (memRead8(g, HERO_XV) + 4) & 0xffff;
    const bx = ((viewportCol * 8 + 5) & 0xffff) + memRead16(g, PROX_START);
    let absX = ((viewportCol + memRead16(g, LEFT_COL)) & 0xffff);

    const delta = (memRead8(g, FACING) & 1) !== 0 ? -2 : 2;
    absX += delta;
    if (memRead8(g, (bx + 8 * delta) & 0xffff) !== 0xfd) return;

    const npcSi = findFirstNpcAtX(g, absX & 0xffff);
    // NPC must face TOWARD the hero
    if ((memRead8(g, FACING) & 1) !== 0) {
        if ((memRead8(g, npcSi + 2) & 0x80) !== 0) return;
    } else {
        if ((memRead8(g, npcSi + 2) & 0x80) === 0) return;
    }
    if ((memRead8(g, npcSi + 6) & 0x80) === 0) return;

    makeNpcFaceHeroAndFreeze(g, npcSi);

    memWrite8(g, DIALOG_EXIT, 0xff);
    startNpcConversation(g, npcSi);
}

// ─── transitions ───

/** request_dungeon_transition */
function requestDungeonTransition(g: Uint8Array, destMapId: number): void {
    const tbl = (memRead16(g, DUNGEON_ENTRANCE_TABLE) + destMapId * 5) & 0xffff;
    const x = memRead16(g, tbl);
    hooks.setDoorX1(x); // preserved across prepare_dungeon's memset
    const mapWidth = memRead16(g, MAP_WIDTH);
    memWrite16(g, LEFT_COL, x >= 16 ? x - 16 : x - 16 + mapWidth);
    const y = memRead8(g, tbl + 2);
    memWrite8(g, 0x82, (y - 10) & 0x3f); // ADDR_VIEWPORT_TOP_ROW
    const dir = memRead8(g, tbl + 3);
    memWrite8(g, LEFT_RUN, (dir & 1) !== 0 ? 0xff : 0);
    const placeMapId = memRead8(g, tbl + 4);
    memWrite8(g, PLACE_MAP_ID, placeMapId);
    memWrite8(g, 0x06, 0xff); // ADDR_ENTERED_CAVERN
    memWrite8(g, SPACEBAR, 0);
    memWrite8(g, ALTKEY, 0);
    memWrite8(g, INPUT_DIRS, 0);
    memWrite8(g, INPUT_ALT_SPACE, 0);
    memWrite8(g, PENDING_DUNGEON_MAP, placeMapId);
    memWrite8(g, PENDING_DUNGEON_FLAG, 0xff);
}

/** town_up_pressed — door lookup + begin door animation. */
function townUpPressed(g: Uint8Array, st: TownTickState): void {
    memWrite8(g, HERO_ANIM, memRead8(g, HERO_ANIM) | 1);

    const heroX = (memRead16(g, LEFT_COL) + memRead8(g, HERO_XV) + 4) & 0xffff;
    let si = memRead16(g, DOORS_LIST);

    for (;;) {
        const doorX = memRead16(g, si);
        if (doorX === NPC_TERMINATOR) return;
        if (doorX === heroX || doorX === ((heroX + 1) & 0xffff) || doorX === ((heroX - 1) & 0xffff)) {
            break;
        }
        si += 3; // door struct size
    }

    memWrite8(g, HERO_ANIM, 4);
    restoreHeadLevelTilesFromNpcs(g);

    // Back-facing frame for ~SPEED_C*4 ticks; completion happens in
    // townMainLoopStep once FRAME_TMR passes the threshold.
    memWrite8(g, FRAME_TMR, 0);
    st.doorPendingDest = memRead8(g, si + 2);
    st.doorPendingAnim = true;
}

/** swap_a000_c000_buffers: exchange 2 KB between seg1:0xA000 and seg1:0xC000. */
function swapA000C000Buffers(g: Uint8Array): void {
    const a = SEG1_BASE + 0xa000;
    const c = SEG1_BASE + 0xc000;
    for (let i = 0; i < 0x800; i++) {
        const tmp = g[c + i] ?? 0;
        g[c + i] = g[a + i] ?? 0;
        g[a + i] = tmp;
    }
}

/** handle_inventory_key — Enter opens the inventory overlay. */
function handleInventoryKey(g: Uint8Array, st: TownTickState): void {
    if ((memRead8(g, ENTER_WORD) & 0x01) === 0) return;
    memWrite8(g, SFX_REQUEST, 0x0b);
    // clear_viewport / inventory_overlay / backup_upper_town_3_tiles are
    // unregistered procs in the web build; the buffer swaps and the
    // 0xFE fill are real.
    swapA000C000Buffers(g);
    swapA000C000Buffers(g);
    g.fill(0xfe, VIEWPORT_BUFFER, VIEWPORT_BUFFER + 0xe0);
    gameLoopWithFrameWait(g, st);
    memWrite8(g, SPACEBAR, 0);
    memWrite8(g, ALTKEY, 0);
}

/** handle_edge_screen_transition */
function handleEdgeScreenTransition(g: Uint8Array, st: TownTickState): void {
    const vpX = memRead8(g, HERO_XV);
    const goingLeft = vpX === 0xff;
    const goingRight = vpX === 27;
    if (!goingLeft && !goingRight) return;

    restoreHeadLevelTilesFromNpcs(g);
    memWrite8(g, FRAME_TMR, 40);
    gameLoopWithFrameWait(g, st);

    let si = memRead16(g, TOWN_TRANSITION_TABLE);
    for (;;) {
        const flags = memRead8(g, si);
        if (goingLeft && !(flags & 1)) {
            si += 4;
            continue;
        }
        if (goingRight && (flags & 1)) {
            si += 4;
            continue;
        }
        break;
    }

    const flags = memRead8(g, si);
    const destMap = memRead8(g, si + 1);
    const patNew = memRead8(g, si + 3);

    if ((flags & 0xfe) !== 0) {
        // some towns at the map edge transit to the dungeon
        requestDungeonTransition(g, destMap);
        return;
    }

    // Signal JS to load resources asynchronously
    const destId = (destMap | 0x80) & 0xff;
    memWrite8(g, PLACE_MAP_ID, destId);

    if (goingLeft) {
        memWrite8(g, HERO_XV, 26);
        memWrite16(g, LEFT_COL, 0);
    } else {
        memWrite8(g, HERO_XV, 0);
        memWrite16(g, LEFT_COL, 0);
    }

    memWrite8(g, TRANS_MAP, destId);
    memWrite8(g, TRANS_PAT, patNew);
    memWrite8(g, TRANS_DIR, goingLeft ? 1 : 0);
    memWrite8(g, TRANS_FLAG, 0xff);
}

// ─── the tick itself ───

/** town_main_loop_step */
export function townMainLoopStep(g: Uint8Array, st: TownTickState): void {
    // Pending door animation: freeze logic until FRAME_TMR expires.
    if (st.doorPendingAnim) {
        if (memRead8(g, FRAME_TMR) >= ((memRead8(g, SPEED_C) * 14) & 0xff)) {
            st.doorPendingAnim = false;
            const destId = st.doorPendingDest;
            st.doorPendingDest = 0xff;
            if (destId === 0xff) {
                // warp building: reuse the building handshake.
                memWrite8(g, BYTE_FF24, 4);
                memWrite8(g, BUILDING_DEST_ID, 0xff);
                memWrite8(g, BUILDING_ACTIVE, 1);
                memWrite8(g, SFX_REQUEST, 0x32);
                memWrite8(g, SPACEBAR, 0);
                memWrite8(g, ALTKEY, 0);
                memWrite8(g, INPUT_DIRS, 0);
                memWrite8(g, INPUT_ALT_SPACE, 0);
            } else if (destId >= 8) {
                requestDungeonTransition(g, destId - 8);
            } else {
                memWrite8(g, BYTE_FF24, 4);
                memWrite8(g, BUILDING_DEST_ID, destId);
                memWrite8(g, BUILDING_ACTIVE, 1);
                memWrite8(g, SFX_REQUEST, 0x32);
                memWrite8(g, SPACEBAR, 0);
                memWrite8(g, ALTKEY, 0);
                memWrite8(g, INPUT_DIRS, 0);
                memWrite8(g, INPUT_ALT_SPACE, 0);
            }
        }
        return;
    }

    // update_npcs_and_render(): NPC AI + the per-frame timer reset
    // (game_loop_with_frame_wait resets FRAME_TMR when driven by the
    // JS main loop).
    updateNpcsAndRender(g, st);

    if (memRead8(g, CONV_ACTIVE) !== 0) return;
    if (memRead8(g, BUILDING_ACTIVE) !== 0) return;

    handleInventoryKey(g, st);
    handleEdgeScreenTransition(g, st);
    heroSpacebarInteraction(g);

    checkSpecialNpcConversation(g);
    memWrite8(g, HERO_MOVED, 0);

    const dirs = memRead8(g, INPUT_DIRS);

    if (dirs === 0x01) {
        // Up pressed → enter door
        memWrite8(g, HERO_ANIM, memRead8(g, HERO_ANIM) | 1);
        townUpPressed(g, st);
    } else if ((dirs & 0x0c) === 0x04) {
        // Left pressed
        const bx = (((memRead8(g, HERO_XV) + 3) * 8) & 0xffff) + memRead16(g, PROX_START);
        const tile = memRead8(g, (bx + 7) & 0xffff);
        if (!tileInSpecialList(g, tile)) {
            const tx = ((memRead8(g, HERO_XV) + 4) + memRead16(g, LEFT_COL) - 1) & 0xffff;
            if (findNonPassableNpcAtX(g, tx) === null) {
                memWrite8(g, HERO_ANIM, (memRead8(g, HERO_ANIM) + 1) & 3);
                memWrite8(g, FACING, memRead8(g, FACING) | 1); // face left
                if (memRead8(g, HERO_XV) >= 11) {
                    memWrite8(g, HERO_XV, memRead8(g, HERO_XV) - 1);
                } else if (memRead16(g, LEFT_COL) !== 0) {
                    memWrite16(g, LEFT_COL, dec16(memRead16(g, LEFT_COL)));
                    memWrite16(g, PROX_START, (memRead16(g, PROX_START) - 8) & 0xffff);
                    memWrite8(g, SCROLL_REQUEST, memRead8(g, SCROLL_REQUEST) | 0x01);
                    if (memRead8(g, MIDDLE_LYR) === 1) {
                        memWrite8(g, SCROLL_REQUEST, memRead8(g, SCROLL_REQUEST) | 0x04);
                    }
                } else {
                    memWrite8(g, HERO_XV, memRead8(g, HERO_XV) - 1);
                }
                memWrite8(g, HERO_MOVED, 0xff);
            }
        }
    } else if ((dirs & 0x0c) === 0x08) {
        // Right pressed
        const bx = (((memRead8(g, HERO_XV) + 6) * 8) & 0xffff) + memRead16(g, PROX_START);
        const tile = memRead8(g, (bx + 7) & 0xffff);
        if (!tileInSpecialList(g, tile)) {
            const tx = ((memRead8(g, HERO_XV) + 4) + memRead16(g, LEFT_COL) + 1) & 0xffff;
            if (findNonPassableNpcAtX(g, tx) === null) {
                memWrite8(g, HERO_ANIM, (memRead8(g, HERO_ANIM) + 1) & 3);
                memWrite8(g, FACING, memRead8(g, FACING) & ~1); // face right
                if (memRead8(g, HERO_XV) < 16) {
                    memWrite8(g, HERO_XV, memRead8(g, HERO_XV) + 1);
                } else {
                    const rightLimit = (memRead16(g, MAP_WIDTH) - 35) & 0xffff;
                    if (memRead16(g, LEFT_COL) + 1 === rightLimit) {
                        memWrite8(g, HERO_XV, memRead8(g, HERO_XV) + 1);
                    } else {
                        memWrite16(g, LEFT_COL, inc16(memRead16(g, LEFT_COL)));
                        memWrite16(g, PROX_START, (memRead16(g, PROX_START) + 8) & 0xffff);
                        memWrite8(g, SCROLL_REQUEST, memRead8(g, SCROLL_REQUEST) | 0x02);
                        if (memRead8(g, MIDDLE_LYR) === 1) {
                            memWrite8(g, SCROLL_REQUEST, memRead8(g, SCROLL_REQUEST) | 0x08);
                        }
                    }
                }
                memWrite8(g, HERO_MOVED, 0xff);
            }
        }
    } else {
        memWrite8(g, HERO_ANIM, memRead8(g, HERO_ANIM) | 1);
        memWrite8(g, HERO_MOVED, 0xff);
    }
}

/** wasm_town_update */
export function townUpdate(g: Uint8Array, st: TownTickState = townTickState): void {
    st.updateActive = true;
    townMainLoopStep(g, st);
    st.updateActive = false;
}

/** wasm_town_full_tick — ISR counters + pending-wait completion. */
export function townFullTick(g: Uint8Array, st: TownTickState = townTickState): void {
    memWrite8(g, FRAME_TMR, (memRead8(g, FRAME_TMR) + 1) & 0xff);
    memWrite16(g, TICK_COUNTER, (memRead16(g, TICK_COUNTER) + 1) & 0xffff);
    memWrite16(g, ANIM_TIMER, (memRead16(g, ANIM_TIMER) + 1) & 0xffff);

    if (st.pendingWait && memRead8(g, FRAME_TMR) >= st.pendingWaitTarget) {
        townCompleteWait(g, st);
    }
}

// ─── boot / entry family (wasm_town_init + town_entry_common) ───

/** Size of g_mem in the C build (data.c: uint8_t g_mem[0x40000]). */
const GMEM_SIZE = 0x40000;

const IS_DEATH_PROCESSED = 0x49;
const INVINCIBILITY_FLAG = 0xe8;
const SWORD_ENCHANTMENT_LEVEL = 0xe4;
const BYTE_9F = 0x9f;
const PAT_ID = 0x7c46;
const TOWN_DESCRIPTOR = 0xc000;
const WORD_C015 = 0xc015;

/** wasm_town_init — zero g_mem, reset statics, default speed. */
export function townInit(g: Uint8Array, st: TownTickState = townTickState): void {
    g.fill(0, 0, GMEM_SIZE);
    st.returnBeforeMainLoop = false;
    st.updateActive = false;
    st.doorPendingAnim = false;
    st.doorPendingDest = 0xff;
    st.pendingWait = false;
    st.pendingWaitTarget = 0;
    memWrite8(g, SPEED_C, 5);
}

export function townSetReturnBeforeMainLoop(
    g: Uint8Array,
    enabled: boolean,
    st: TownTickState = townTickState,
): void {
    void g;
    st.returnBeforeMainLoop = enabled;
}

/**
 * init_c015_obj_if_exists — conditional MDT patch list:
 * list of {dst(word), flag(byte), then word/byte pairs until 0xFFFF}.
 */
export function initC015ObjIfExists(g: Uint8Array): void {
    let si = memRead16(g, WORD_C015);
    for (;;) {
        const dst = memRead16(g, si);
        si += 2;
        if (dst === 0xffff) return;

        const flag = memRead8(g, si);
        si += 1;
        if ((flag & memRead8(g, dst)) === 0) {
            for (;;) {
                const w = memRead16(g, si);
                si += 2;
                if (w === 0xffff) break;
                si += 1;
            }
            continue;
        }
        for (;;) {
            const d2 = memRead16(g, si);
            si += 2;
            if (d2 === 0xffff) break;
            const val = memRead8(g, si);
            si += 1;
            memWrite8(g, d2, val);
        }
    }
}

/**
 * town_entry_common — port of the C entry path. Render/load procs are
 * unregistered in the web build and become no-ops exactly like CALL_PROC.
 * Runs update_npcs_and_render with updateActive=false, which ARMS a pending
 * frame wait completed by townFullTick — the boot-time behavior that gates
 * the first frames in town.
 */
function townEntryCommon(g: Uint8Array, st: TownTickState): void {
    // load_hero_town_sprite / apply_sprite_mask / clear_viewport: no-op procs

    memWrite8(g, HERO_ANIM, 0);

    // DEATH_DONE (ADDR_IS_DEATH_PROCESSED) only gates no-op music procs here.
    void memRead8(g, IS_DEATH_PROCESSED);

    // Parse town descriptor: [0]=msd_index, NPC entries, FF, middle-layer, pat_id
    {
        let si = memRead16(g, TOWN_DESCRIPTOR);
        si++;
        while (memRead8(g, si) !== 0xff) si++;
        si++; // skip FF
        // ADDR_TOWN_HAS_MIDDLE_LAYER / ADDR_PAT_ID writes below
        memWrite8(g, 0x7c45, memRead8(g, si));
        si++;
        memWrite8(g, PAT_ID, memRead8(g, si));
    }

    memWrite8(g, 0x7c44, 0); // EDGE_SCROLL_ENABLED = 0

    const invinc = memRead8(g, INVINCIBILITY_FLAG) !== 0;
    if (!invinc) {
        const middleLyr = memRead8(g, MIDDLE_LYR);
        const disableEdgeScroll = memRead8(g, DISABLE_EDGE_SCROLL);
        if ((middleLyr & 1) !== 0 && disableEdgeScroll === 0) {
            memWrite8(g, 0x7c44, 0xff);
        }
        // backup_upper_town_3_tiles / adlib_fn0: no-op procs
    }

    // --- town_entry_internal ---
    initC015ObjIfExists(g);
    memWrite8(g, SPACEBAR, 0);
    memWrite8(g, ALTKEY, 0);
    memWrite8(g, SWORD_ENCHANTMENT_LEVEL, 0);
    memWrite8(g, BYTE_9F, 0);

    // clear_hud_bar / render_* procs: no-ops in the web build

    // Re-read pat_id after second FF-scan
    {
        let si = memRead16(g, TOWN_DESCRIPTOR);
        si++;
        while (memRead8(g, si) !== 0xff) si++;
        si += 2; // skip FF and middle-layer
        memWrite8(g, PAT_ID, memRead8(g, si));
    }

    // render_pascal_string_1 proc: no-op

    {
        const leftCol = memRead16(g, LEFT_COL);
        memWrite16(g, PROX_START, (leftCol * 8 + TOWN_TILES) & 0xffff);
    }

    saveHeadLevelTilesInNpcs(g);

    if (invinc) {
        // Sage resurrection branch is fully commented out in the C.
        return;
    }

    // fill first 224 bytes of viewport buffer with 0xFE
    g.fill(0xfe, VIEWPORT_BUFFER, VIEWPORT_BUFFER + 224);

    updateNpcsAndRender(g, st);

    if (memRead8(g, 0x7c44) !== 0) {
        // Edge-scroll pan ×5 via scroll procs — unregistered in web → no-op,
        // but each iteration still runs update_npcs_and_render.
        const isLeft = (memRead8(g, FACING) & 1) !== 0;
        void isLeft;
        for (let i = 0; i < 5; i++) {
            updateNpcsAndRender(g, st);
        }
    }

    memWrite8(g, HERO_MOVED, 0);

    // DEATH_DONE music proc: no-op
}

function updateNpcsAndRender(g: Uint8Array, st: TownTickState): void {
    updateNpcs(g);
    gameLoopWithFrameWait(g, st);
}

/** wasm_town_entry_disabling_edge_scroll */
export function townEntryDisablingEdgeScroll(
    g: Uint8Array,
    st: TownTickState = townTickState,
): void {
    memWrite8(g, DISABLE_EDGE_SCROLL, 0xff);
    townEntryCommon(g, st);
}

/** wasm_town_entry_enabling_edge_scroll */
export function townEntryEnablingEdgeScroll(
    g: Uint8Array,
    st: TownTickState = townTickState,
): void {
    memWrite8(g, DISABLE_EDGE_SCROLL, 0);
    townEntryCommon(g, st);
}

/** wasm_town_complete_transition — finish a town→town edge transition. */
export function townCompleteTransition(g: Uint8Array, st: TownTickState = townTickState): void {
    const destId = memRead8(g, TRANS_MAP);
    const patNew = memRead8(g, TRANS_PAT);
    const goingLeft = memRead8(g, TRANS_DIR) !== 0;
    void destId;

    memWrite8(g, TRANS_FLAG, 0);

    initC015ObjIfExists(g);

    if (patNew !== memRead8(g, PAT_ID)) {
        memWrite8(g, PAT_ID, patNew);
    }

    const mapWidth = memRead16(g, MAP_WIDTH);
    if (goingLeft) {
        memWrite8(g, HERO_XV, 26);
        memWrite16(g, LEFT_COL, (mapWidth - 36) & 0xffff);
    } else {
        memWrite8(g, HERO_XV, 0);
        memWrite16(g, LEFT_COL, 0);
    }
    const leftCol = memRead16(g, LEFT_COL);
    memWrite16(g, PROX_START, (leftCol * 8 + TOWN_TILES) & 0xffff);

    memWrite8(g, FACING, goingLeft ? 1 : 0);

    saveHeadLevelTilesInNpcs(g);

    memWrite8(g, SPACEBAR, 0);
    memWrite8(g, ALTKEY, 0);
    memWrite8(g, SWORD_ENCHANTMENT_LEVEL, 0);
    memWrite8(g, BYTE_9F, 0);
}

/** wasm_town_conversation_finish — restore frozen NPC, clear flag. */
export function townConversationFinish(g: Uint8Array): void {
    if (memRead8(g, CONV_ACTIVE) === 0) return;
    const npcAddr = memRead16(g, CONV_NPC_ADDR);
    if (npcAddr !== 0 && npcAddr !== 0xffff) {
        memWrite8(g, npcAddr + 5, memRead8(g, CONV_SAVED_AI));
        memWrite8(g, npcAddr + 2, memRead8(g, CONV_SAVED_FACING));
    }
    memWrite8(g, CONV_ACTIVE, 0);
}

/** wasm_town_building_finish — clear building latch. */
export function townBuildingFinish(g: Uint8Array): void {
    memWrite8(g, BUILDING_ACTIVE, 0);
    memWrite8(g, BUILDING_DEST_ID, 0xff);
    memWrite8(g, SPACEBAR, 0);
    memWrite8(g, ALTKEY, 0);
    memWrite8(g, INPUT_DIRS, 0);
    memWrite8(g, INPUT_ALT_SPACE, 0);
    memWrite8(g, HERO_ANIM, 1);
}

/** Unused-import guards for constants referenced by documentation only. */
export const TOWN_PORT_CONSTANTS = {
    PROX_COLS,
    DISABLE_EDGE_SCROLL,
};
