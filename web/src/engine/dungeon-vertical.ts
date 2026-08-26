/**
 * dungeon-vertical.ts — TS port of dungeon.c's vertical mechanics
 * (Stage 8b, slice 3).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - hero_scroll_down                     (1404)
 *   - try_climb_rope                       (1419) — incl. on_left_pressed /
 *     on_right_pressed (4240 / 4185), init_on_ground (4222),
 *     set_zero_flag_if_slippery (2093) and is_over_rope (4067)
 *   - identify_platform_tile               (1067)
 *   - find_platform_under_hero             (1083) — incl. abs_x_to_proximity_rel
 *     (2329)
 *   - put_dl_to_proximity_layered          (2382)
 *   - try_move_platform_down               (1108)
 *   - try_move_platform_up                 (1133)
 *   - move_platform_down_damage_monster    (4027)
 *   - hero_collapse_platform               (2171)
 *   - check_floor_for_landing              (2188)
 *   - land_after_jump                      (2216)
 *   - get_slope_direction_by_tile_under_feet (4441)
 *   - slope_assist_on_landing              (4394)
 *
 * C file statics stay in g_mem; no hidden TS state.
 */

import { SEG1_BASE } from '../core/memory.js';
import {
    coordsToProxAddr,
    isBlockingTile,
    isBlockingTileSimple,
    wrapMapFromAbove,
    wrapMapFromBelow,
} from './dungeon-entities.js';
import {
    getDstMonsterFlags,
    heroCoordsToAddrInProximity,
    moveHeroLeftIfNoObstacles,
    moveHeroRightIfNoObstacles,
    moveHeroUp,
} from './dungeon-hero.js';

const PROX_COLS = 36;

// g_mem addresses (mirroring zeliard.h / dungeon.c defines)
const LEFT_COL_NUM = 0x80; // word — proximity map left column number
const VIEWPORT_TOP_ROW = 0x82;
const HERO_XV = 0x83;
const HERO_HEAD_Y_VIEW = 0x84;
const CURRENT_ACCESSORY = 0x9e;
const FACING = 0xc2;
const HERO_ANIM_PHASE = 0xe7;
const MAP_WIDTH = 0xc002; // word
const VERTICAL_PLATFORMS_LIST = 0xc004; // word ptr, 3-byte entries {absX word, y}
const COLLAPSING_PLATFORMS_LIST = 0xc006; // word ptr, same entry layout
const CAVERN_LEVEL = 0xc012;
const PROXIMITY_LAYER2 = 0xed20; // per-monster second layer, 128 bytes
const JUMP_HEIGHT_COUNTER = 0x9f08;
const FRAME_TICKS = 0x9f0a;
const HEIGHT_ABOVE_GROUND = 0x9f0c;
const TICKS = 0x9f16;
const BYTE_9F18 = 0x9f18;
const BYTE_9F19 = 0x9f19;
const SLIDE_TICKS_REMAINING = 0x9f20;
const HORIZ_MOVEMENT_ACCUM = 0x9f21;
const SLIDE_DIRECTION = 0x9f22;
const SLIDE_DIRECTION_LOCK = 0x9f23;
const INPUT_DIRS = 0xff17;
const SQUAT_FLAG = 0xff38;
const ON_ROPE_FLAGS = 0xff39;
const JUMP_PHASE_FLAGS = 0xff3d;
const SLOPE_DIRECTION = 0xff42;
const RENDER_REQUEST = 0xff92;
const RENDER_DONE = 0xff93;

// seg1-based slope tile lists (4 entries each, 0-terminated)
const SLOPE_TILES_LEFT = 0x8018;
const SLOPE_TILES_RIGHT = 0x801c;

// flag / constant values from zeliard.h
const LEFT_FLAG = 1;
const UP_FLAG = 2;
const SLIDE_RIGHT = 1;
const SLIDE_LEFT = 2;
const SLOPE_RIGHT = 1;
const SLOPE_LEFT = 2;
const ACCESSORY_RUZERIA_SHOES = 4;
const ACCESSORY_SILKARN_SHOES = 3;
const KEY_LEFT = 4;
const KEY_RIGHT = 8;

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

/** seg1 byte read (MEM8_1 in the C port). */
function seg8(g: Uint8Array, addr: number): number {
    return g[(SEG1_BASE + addr) & 0xffffff] ?? 0;
}

/** hero_scroll_down (dungeon.c:1404). */
export function heroScrollDown(g: Uint8Array): void {
    s8(g, VIEWPORT_TOP_ROW, (g8(g, VIEWPORT_TOP_ROW) + 1) & 0xff);
    let addr = (g16(g, 0xff31) + PROX_COLS) & 0xffff; // ADDR_VIEWPORT_LEFT_TOP
    addr = wrapMapFromAbove(addr);
    s16(g, 0xff31, addr);
}

/** is_over_rope (dungeon.c:4067). Rope tiles are 1 and 2. */
export function isOverRope(g: Uint8Array, si: number): boolean {
    const tile = g8(g, si);
    return tile === 1 || tile === 2;
}

/** set_zero_flag_if_slippery (dungeon.c:2093). 0 = slippery. */
export function setZeroFlagIfSlippery(g: Uint8Array): number {
    if (
        g8(g, CAVERN_LEVEL) === 4 &&
        g8(g, CURRENT_ACCESSORY) !== ACCESSORY_RUZERIA_SHOES
    ) {
        return 0;
    }
    return 0xff;
}

/** init_on_ground (dungeon.c:4222). */
export function initOnGround(g: Uint8Array): void {
    s8(g, FACING, g8(g, FACING) & ~UP_FLAG);
    if (g8(g, ON_ROPE_FLAGS) === 0 && g8(g, JUMP_PHASE_FLAGS) === 0) {
        s8(g, HERO_ANIM_PHASE, 0x80);
    }
}

/** on_right_pressed (dungeon.c:4185). */
export function onRightPressed(g: Uint8Array): void {
    s8(g, BYTE_9F18, 0);
    if ((g8(g, FACING) & LEFT_FLAG) !== 0) {
        s8(g, FACING, g8(g, FACING) ^ LEFT_FLAG);
        return;
    }
    if (g8(g, SQUAT_FLAG) !== 0) return;

    if (
        g8(g, SLOPE_DIRECTION) === SLOPE_LEFT ||
        moveHeroRightIfNoObstacles(g) === 0
    ) {
        initOnGround(g);
        return;
    }

    s8(g, SLIDE_DIRECTION, SLIDE_RIGHT);
    if (g8(g, ON_ROPE_FLAGS) !== 0) return;

    if (setZeroFlagIfSlippery(g) === 0 && g8(g, SLIDE_TICKS_REMAINING) === 0) {
        s8(g, SLIDE_DIRECTION_LOCK, 1); // right movement locked
        s8(g, HORIZ_MOVEMENT_ACCUM, (g8(g, HORIZ_MOVEMENT_ACCUM) + 1) & 0xff);
    }

    s8(g, FACING, g8(g, FACING) | UP_FLAG);
    if (g8(g, JUMP_PHASE_FLAGS) !== 0) return;

    s8(g, HERO_ANIM_PHASE, (g8(g, HERO_ANIM_PHASE) + 1) & 0x7f);
    s8(g, BYTE_9F19, 0);
}

/** on_left_pressed (dungeon.c:4240). */
export function onLeftPressed(g: Uint8Array): void {
    s8(g, BYTE_9F18, 0);
    if ((g8(g, FACING) & LEFT_FLAG) === 0) {
        s8(g, FACING, g8(g, FACING) ^ LEFT_FLAG);
        return;
    }

    if (g8(g, SQUAT_FLAG) !== 0) return;

    if (
        g8(g, SLOPE_DIRECTION) === SLOPE_RIGHT ||
        moveHeroLeftIfNoObstacles(g) === 0
    ) {
        initOnGround(g);
        return;
    }

    s8(g, SLIDE_DIRECTION, SLIDE_LEFT);
    if (g8(g, ON_ROPE_FLAGS) !== 0) return;

    if (setZeroFlagIfSlippery(g) === 0 && g8(g, SLIDE_TICKS_REMAINING) === 0) {
        s8(g, SLIDE_DIRECTION_LOCK, 0); // left movement unlocked
        s8(g, HORIZ_MOVEMENT_ACCUM, (g8(g, HORIZ_MOVEMENT_ACCUM) + 1) & 0xff);
    }

    s8(g, FACING, g8(g, FACING) | UP_FLAG);
    if (g8(g, JUMP_PHASE_FLAGS) !== 0) return;

    s8(g, HERO_ANIM_PHASE, (g8(g, HERO_ANIM_PHASE) + 1) & 0x7f);
    s8(g, BYTE_9F19, 0);
}

/**
 * try_climb_rope (dungeon.c:1419): grab a rope above/next to the hero's
 * head and start climbing. Side steps toward a off-center rope go through
 * the same on_left/right_pressed state machine handlers.
 */
export function tryClimbRope(g: Uint8Array): void {
    let si = heroCoordsToAddrInProximity(g);
    si++; // hero head tile

    if (!isOverRope(g, si)) {
        // Check tile to the left of head
        si--;
        if (isOverRope(g, si)) {
            if ((g8(g, FACING) & LEFT_FLAG) !== 0) {
                onLeftPressed(g); // move left to center on rope
            }
            return;
        }

        // Check tile to the right of head (restore head + 1 more)
        si += 2;
        if (isOverRope(g, si)) {
            if ((g8(g, FACING) & LEFT_FLAG) === 0) {
                onRightPressed(g); // move right to center on rope
            }
            return;
        }
        return; // no rope found
    }

    s8(g, ON_ROPE_FLAGS, 0xff);
    s8(g, SQUAT_FLAG, 0);

    si = (heroCoordsToAddrInProximity(g) - 35) & 0xffff; // tile above head
    si = wrapMapFromBelow(si);

    s8(g, HERO_ANIM_PHASE, (g8(g, HERO_ANIM_PHASE) - 1) & 0xff);

    if (!isOverRope(g, si)) {
        s8(g, HERO_ANIM_PHASE, g8(g, HERO_ANIM_PHASE) | 1);
        return;
    }

    moveHeroUp(g);
    s8(g, RENDER_DONE, 0);
    s8(g, RENDER_REQUEST, 0xff);
}

export interface PlatformTileMatch {
    /** true when the tile at si is part of the dl..dl+2 platform triple. */
    isPlatform: boolean;
    /** hero offset on platform: {1, 0, -1} for {left, mid, right} variant. */
    dh: number;
}

/**
 * identify_platform_tile (dungeon.c:1067). The three variants of a platform
 * row all sit in the SAME cell: dl=left variant, dl+1=mid, dl+2=right.
 * C returned ZF when it IS a platform; here isPlatform carries that.
 */
export function identifyPlatformTile(
    g: Uint8Array,
    si: number,
    dl: number,
): PlatformTileMatch {
    const tile = g8(g, si);
    let dh = 1;
    if (dl === tile) return { isPlatform: true, dh };
    dh--;
    if (dl + 1 === tile) return { isPlatform: true, dh };
    dh--;
    // C returns ZF (= platform found) exactly when the third variant matches
    return { isPlatform: dl + 2 === tile, dh };
}

export interface AbsProxRel {
    ax: number;
    bx: number;
    /** C carry flag: true when the cell is off the visible window width. */
    cf: boolean;
}

/** abs_x_to_proximity_rel (dungeon.c:2329). */
export function absXToProximityRel(g: Uint8Array, x: number): AbsProxRel {
    let d: number;
    const proxLeft = g16(g, LEFT_COL_NUM);

    if (x >= proxLeft) {
        d = (x - proxLeft) & 0xffff;
    } else if (x > 33) {
        d = x;
    } else {
        d = (g16(g, MAP_WIDTH) - proxLeft + x) & 0xffff;
    }

    return { ax: (33 - d) & 0xffff, bx: d, cf: d > 33 };
}

/**
 * put_dl_to_proximity_layered (dungeon.c:2382): write `tile` unless the
 * cell holds a monster marker (bit7), in which case route it to that
 * monster's layer-2 slot instead.
 */
export function putDlToProximityLayered(
    g: Uint8Array,
    tile: number,
    dst: number,
): void {
    if ((g8(g, dst) & 0x80) !== 0) {
        const monsterId = g8(g, dst) & 0x7f;
        s8(g, PROXIMITY_LAYER2 + monsterId, tile);
    } else {
        s8(g, dst, tile);
    }
}

export interface PlatformLocation {
    /** pointer to the found table entry ({absX word, y byte}, 3 bytes). */
    entryPtr: number;
    /** proximity map address of the platform's left tile. */
    proxAddr: number;
}

/**
 * find_platform_under_hero (dungeon.c:1083). Scans `listPtr` until the
 * entry matching the hero's absolute position (the caller guarantees one
 * exists — the original tables always contain the hero's row).
 */
export function findPlatformUnderHero(
    g: Uint8Array,
    listPtr: number,
    dh: number,
): PlatformLocation {
    let absX = (g8(g, HERO_XV) + 4 + dh) & 0xffff;
    absX = (absX + g16(g, LEFT_COL_NUM)) & 0xffff;
    const mapWidth = g16(g, MAP_WIDTH);
    if (absX >= mapWidth) absX -= mapWidth;

    const feetY =
        (g8(g, VIEWPORT_TOP_ROW) + g8(g, HERO_HEAD_Y_VIEW) + 3) & 0x3f;

    let p = listPtr;
    for (;;) {
        if (g16(g, p) === absX && g8(g, p + 2) === feetY) break;
        p += 3;
    }

    const rel = absXToProximityRel(g, absX);
    const proxAddr = coordsToProxAddr(g, rel.bx & 0xff, g8(g, p + 2));

    return { entryPtr: p, proxAddr };
}

/**
 * try_move_platform_down (dungeon.c:1108). Returns true (C carry set) when
 * the platform moved down one row.
 */
export function tryMovePlatformDown(
    g: Uint8Array,
    di: number,
    platformProx: number,
    dl: number,
): boolean {
    const bxSave = platformProx;
    let si = wrapMapFromAbove((platformProx + PROX_COLS - 1) & 0xffff);
    if ((g8(g, si) & 0x80) !== 0) return false;

    for (let i = 0; i < 3; i++) {
        si = (si + 1) & 0xffff;
        if (g8(g, si) !== 0) return false;
    }

    si = wrapMapFromAbove((bxSave + PROX_COLS) & 0xffff);

    for (let i = 0; i < 3; i++) {
        putDlToProximityLayered(g, (dl + i) & 0xff, (si + i) & 0xffff);
        putDlToProximityLayered(g, 0, (bxSave + i) & 0xffff);
    }

    s8(g, di + 2, (g8(g, di + 2) + 1) & 0x3f);
    return true;
}

/**
 * try_move_platform_up (dungeon.c:1133). Returns true (0xFF in C) when the
 * vertical platform under the hero moved up one row.
 */
export function tryMovePlatformUp(g: Uint8Array): boolean {
    if (g8(g, ON_ROPE_FLAGS) !== 0) return false;

    let si = (heroCoordsToAddrInProximity(g) - 35) & 0xffff;
    si = wrapMapFromBelow(si);
    if (isBlockingTile(g, g8(g, si))) return false;

    si = wrapMapFromAbove((si + PROX_COLS * 4) & 0xffff);

    const match = identifyPlatformTile(g, si, 0x40);
    if (!match.isPlatform) return false;

    const di = g16(g, VERTICAL_PLATFORMS_LIST);
    const found = findPlatformUnderHero(g, di, match.dh);
    const savedProx = found.proxAddr;

    let bx = wrapMapFromBelow((found.proxAddr - PROX_COLS) & 0xffff);
    let siCheck = wrapMapFromBelow((bx - PROX_COLS) & 0xffff);

    for (let i = 0; i < 3; i++) {
        if ((g8(g, siCheck) & 0x80) !== 0) return false;
        if (g8(g, bx) !== 0) return false;
        siCheck = (siCheck + 1) & 0xffff;
        bx = (bx + 1) & 0xffff;
    }

    const platformProx = savedProx;
    si = wrapMapFromBelow((platformProx - PROX_COLS) & 0xffff);

    const dl = 0x40;
    for (let i = 0; i < 3; i++) {
        putDlToProximityLayered(g, (dl + i) & 0xff, (si + i) & 0xffff);
        putDlToProximityLayered(g, 0, (platformProx + i) & 0xffff);
    }

    s8(g, found.entryPtr + 2, (g8(g, found.entryPtr + 2) - 1) & 0x3f);

    s8(g, HERO_ANIM_PHASE, 0x80);
    s8(g, JUMP_PHASE_FLAGS, 0);
    moveHeroUp(g);

    return true;
}

/**
 * move_platform_down_damage_monster (dungeon.c:4027): lower the vertical
 * platform under the hero; any monster directly below gets flattened.
 * Returns true when the platform moved (caller then scrolls down).
 */
export function movePlatformDownDamageMonster(g: Uint8Array): boolean {
    if (g8(g, ON_ROPE_FLAGS) !== 0) return false;

    let si = heroCoordsToAddrInProximity(g);
    si = wrapMapFromAbove((si + 3 * PROX_COLS + 1) & 0xffff);

    const match = identifyPlatformTile(g, si, 0x40);
    if (!match.isPlatform) return false;

    const di = g16(g, VERTICAL_PLATFORMS_LIST);
    const found = findPlatformUnderHero(g, di, match.dh);

    if (tryMovePlatformDown(g, found.entryPtr, found.proxAddr, 0x40)) {
        s8(g, HERO_ANIM_PHASE, 0x80);
        heroScrollDown(g);
        return true;
    }

    for (let i = -1; i < 3; i++) {
        const pos = wrapMapFromAbove(
            (found.proxAddr + PROX_COLS + i) & 0xffff,
        );
        const { flags, monsterStruct } = getDstMonsterFlags(g, pos);
        if (monsterStruct !== 0) {
            if (
                (flags & 0x60) === 0 &&
                (g8(g, monsterStruct + 5) & 0x20) === 0
            ) {
                s8(
                    g,
                    monsterStruct + 5,
                    (g8(g, monsterStruct + 5) & 0xe0) | 0x40,
                );
            }
            break;
        }
    }
    return false;
}

/** hero_collapse_platform (dungeon.c:2171): crumble the collapsing
 * platform under the hero, if any (collapsing platforms share the
 * vertical-platform table layout, list at 0xC006). */
export function heroCollapsePlatform(g: Uint8Array): void {
    let si = heroCoordsToAddrInProximity(g);
    si = wrapMapFromAbove((si + 3 * PROX_COLS + 1) & 0xffff);

    const match = identifyPlatformTile(g, si, 0x43);
    if (!match.isPlatform) return;

    const di = g16(g, COLLAPSING_PLATFORMS_LIST);
    const found = findPlatformUnderHero(g, di, match.dh);
    if (tryMovePlatformDown(g, found.entryPtr, found.proxAddr, 0x43)) {
        heroScrollDown(g);
    }
}

/** check_floor_for_landing (dungeon.c:2188). Returns 0xFF when landing is
 * possible, 0 when blocked from below. */
export function checkFloorForLanding(g: Uint8Array): number {
    const base = heroCoordsToAddrInProximity(g);
    const di = wrapMapFromAbove((base + 3 * PROX_COLS + 1) & 0xffff);
    let si = di;
    // check directly below hero feet, then below hero left side
    if ((getDstMonsterFlags(g, si).flags & 0x80) !== 0) return 0;
    si = (si - 1) & 0xffff;
    if ((getDstMonsterFlags(g, si).flags & 0x80) !== 0) return 0;
    si = di;
    if (isBlockingTileSimple(g, g8(g, si)) !== 0) return 0;
    if (g8(g, HERO_ANIM_PHASE) === 0x80) return 0xff;
    si = (si - 1) & 0xffff;
    if (isBlockingTileSimple(g, g8(g, si)) === 0) return 0xff;
    si = (si + 2) & 0xffff;
    if (isBlockingTileSimple(g, g8(g, si)) !== 0) return 0;
    return 0xff;
}

/**
 * land_after_jump (dungeon.c:2216). Returns true to call
 * state_machine_dispatcher afterwards, false to skip straight back to the
 * main loop (the C version encodes this as its return value).
 */
export function landAfterJump(g: Uint8Array): boolean {
    if ((g8(g, JUMP_PHASE_FLAGS) ^ 0x7f) !== 0) {
        return true; // still airborne — re-enter the dispatcher
    }

    const oldHeight = g8(g, JUMP_HEIGHT_COUNTER);

    s8(g, JUMP_PHASE_FLAGS, 0); // on ground
    s8(g, FRAME_TICKS, 0);
    s8(g, JUMP_HEIGHT_COUNTER, 0);
    s8(g, HERO_ANIM_PHASE, 0x80);

    if (g8(g, SLOPE_DIRECTION) !== 0) {
        return false;
    }

    if (oldHeight >= 2) {
        s8(g, SQUAT_FLAG, 0xff); // squat after landing from a big height
    }
    return false;
}

/** Slope directions per zeliard.h. */
export const SLOPE_NONE = 0;
export const SLOPE_DIRECTION_RIGHT = SLOPE_RIGHT;
export const SLOPE_DIRECTION_LEFT = SLOPE_LEFT;

/**
 * get_slope_direction_by_tile_under_feet (dungeon.c:4441).
 * Returns 2 (left slope /), 1 (right slope \) or 0 (not a slope).
 */
export function getSlopeDirectionByTileUnderFeet(
    g: Uint8Array,
    si: number,
): number {
    const tile = g8(g, si);

    for (let i = 0; i < 4; i++) {
        const sl = seg8(g, SLOPE_TILES_LEFT + i);
        if (sl === 0) break;
        if (tile === sl) return SLOPE_LEFT;
    }

    for (let i = 0; i < 4; i++) {
        const sl = seg8(g, SLOPE_TILES_RIGHT + i);
        if (sl === 0) break;
        if (tile === sl) return SLOPE_RIGHT;
    }

    return SLOPE_NONE;
}

/** slope_assist_on_landing (dungeon.c:4394): slide the hero down a slope
 * they just landed on (Silkarn shoes climb instead). */
export function slopeAssistOnLanding(g: Uint8Array): void {
    s8(g, SLOPE_DIRECTION, 0);

    const si = wrapMapFromAbove(
        (heroCoordsToAddrInProximity(g) + 2 * PROX_COLS + 1) & 0xffff,
    );

    const dl = getSlopeDirectionByTileUnderFeet(g, si);
    if (dl === 0) return;

    s8(g, FACING, g8(g, FACING) & ~UP_FLAG);
    s8(g, SLOPE_DIRECTION, dl);

    if (g8(g, HEIGHT_ABOVE_GROUND) !== 0) {
        // check_silkarn_shoes_and_slopes
        if (g8(g, CURRENT_ACCESSORY) === ACCESSORY_SILKARN_SHOES) return;
        s8(g, HEIGHT_ABOVE_GROUND, (g8(g, HEIGHT_ABOVE_GROUND) - 1) & 0xff);
        if (g8(g, SLOPE_DIRECTION) === SLOPE_RIGHT) {
            moveHeroRightIfNoObstacles(g);
        } else {
            moveHeroLeftIfNoObstacles(g);
        }
        return;
    }

    // height_above_ground == 0: slide every 4th tick unless holding uphill
    const oldTicks = g8(g, TICKS);
    s8(g, TICKS, (oldTicks + 1) & 0xff);
    if ((oldTicks & 3) !== 0) return;
    const keys = g8(g, INPUT_DIRS);
    if (g8(g, SLOPE_DIRECTION) === SLOPE_RIGHT) {
        if ((keys & KEY_LEFT) === 0) moveHeroRightIfNoObstacles(g);
    } else {
        if ((keys & KEY_RIGHT) === 0) moveHeroLeftIfNoObstacles(g);
    }
}
