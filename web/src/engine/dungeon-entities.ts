/**
 * dungeon-entities.ts — TS port of dungeon.c's monster movement and
 * collision primitives (Stage 8a).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - increment/decrement X/Y           (lines 86-107)
 *   - move_monster_{E,NE,N,NW,W,SW,S,SE}(111-181)
 *   - monster_move_in_direction         (187-208)
 *   - check_collision_{E,W,N,S,NE,SE,NW,SW}2 (250-513)
 *   - Check_collision_in_direction      (516-530)
 * plus the tile-classification helpers they depend on:
 *   - coords_to_prox_addr / wrap_map_from_above / below
 *   - is_blocking_tile / _extended / _simple / is_blocking / lookup_shared
 *   - get_airflow_direction (+ left/right wrappers)
 *
 * All addresses are g_mem-relative; seg1 data (passable/airflow tile lists)
 * lives at SEG1_BASE offsets. Semantics quirks preserved: uint16 address
 * masking, proximity-window row wrapping, marker-bit (0x80) monster
 * detection, and the wind-tunnel (cavern level 5) airflow blocking.
 */

import { SEG1_BASE } from '../core/memory.js';

// ─── addresses ───
const ADDR_PROXIMITY_MAP = 0xe000;
const PROX_COLS = 36;
const PROXIMITY_SIZE = PROX_COLS * 64; // 0x900
const ADDR_MAP_WIDTH = 0xc002; // word
const ADDR_CAVERN_LEVEL = 0xc012;
const SEG1_PASSABLE_TILES = seg1(0x8000); // 24 bytes
const SEG1_AIRFLOW_TILES = seg1(0x8024); // 4×up, 4×left, 4×right

const AIRFLOW_NONE = 0xff;
const AIRFLOW_UP = 0;
const AIRFLOW_LEFT = 1;
const AIRFLOW_RIGHT = 2;

function seg1(offset: number): number {
    return SEG1_BASE + offset;
}

function g8(g: Uint8Array, addr: number): number {
    return g[addr & 0xffff] ?? 0;
}

/** seg1 reads must NOT be truncated to 16 bits (seg1 lives past 0x10000). */
function seg8(g: Uint8Array, addr: number): number {
    return g[addr & 0xffffff] ?? 0;
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

// ─── proximity geometry ───

/** coords_to_prox_addr (dungeon.c:1375). */
export function coordsToProxAddr(g: Uint8Array, x: number, y: number): number {
    const yy = y & 0x3f;
    return (ADDR_PROXIMITY_MAP + yy * PROX_COLS + (x & 0xff)) & 0xffff;
}

/** wrap_map_from_above (dungeon.c:1359). */
export function wrapMapFromAbove(addr: number): number {
    return addr >= ADDR_PROXIMITY_MAP + PROXIMITY_SIZE
        ? addr - PROXIMITY_SIZE
        : addr;
}

/** wrap_map_from_below (dungeon.c:1366). */
export function wrapMapFromBelow(addr: number): number {
    return addr < ADDR_PROXIMITY_MAP ? addr + PROXIMITY_SIZE : addr;
}

// ─── tile classification ───

/** lookup_shared (dungeon.c:1512). Returns 1 = blocking. */
export function lookupShared(g: Uint8Array, tile: number): number {
    for (let i = 0; i < 24; i++) {
        if (tile === seg8(g, SEG1_PASSABLE_TILES + i)) return 0;
    }
    const masked = tile & 0x9f;
    if (masked === 0x90 || masked === 0x91) return 0xff;
    return (masked & 0x80) === 0 ? 1 : 0;
}

/** is_blocking_tile (dungeon.c:1469). */
export function isBlockingTile(g: Uint8Array, tile: number): boolean {
    return tile < 0x40 ? lookupShared(g, tile) !== 0 : false;
}

/** is_blocking (dungeon.c:1497). */
export function isBlocking(g: Uint8Array, tile: number): number {
    if (tile < 0x49) {
        for (let i = 0; i < 24; i++) {
            if (tile === seg8(g, SEG1_PASSABLE_TILES + i)) return 0;
        }
        return 0xff;
    }
    return tile & 0x80;
}

/** is_blocking_tile_simple (dungeon.c:1482) — kept for parity completeness. */
export function isBlockingTileSimple(g: Uint8Array, tile: number): number {
    if (tile < 0x49) {
        for (let i = 0; i < 24; i++) {
            if (tile === seg8(g, SEG1_PASSABLE_TILES + i)) return 0;
        }
        return (tile & 0x80) !== 0x80 ? 1 : 0;
    }
    return 0;
}

/** is_right_airflow (dungeon.c:1525) — level 7 caverns have no airflows. */
export function isRightAirflow(g: Uint8Array, tile: number): boolean {
    if (g8(g, ADDR_CAVERN_LEVEL) === 7) return false;
    return getAirflowDirection(g, tile) === AIRFLOW_RIGHT;
}

/** is_left_airflow (dungeon.c:1533) — level 7 caverns have no airflows. */
export function isLeftAirflow(g: Uint8Array, tile: number): boolean {
    if (g8(g, ADDR_CAVERN_LEVEL) === 7) return false;
    return getAirflowDirection(g, tile) === AIRFLOW_LEFT;
}

/** get_airflow_direction (dungeon.c:1543). */
export function getAirflowDirection(g: Uint8Array, tile: number): number {
    if (tile !== 0) {
        for (let i = 0; i < 4; i++) {
            const af = seg8(g, SEG1_AIRFLOW_TILES + i);
            if (af === 0) break;
            if (tile === af) return AIRFLOW_UP;
        }
        for (let i = 0; i < 4; i++) {
            const af = seg8(g, SEG1_AIRFLOW_TILES + 4 + i);
            if (af === 0) break;
            if (tile === af) return AIRFLOW_LEFT;
        }
        for (let i = 0; i < 4; i++) {
            const af = seg8(g, SEG1_AIRFLOW_TILES + 8 + i);
            if (af === 0) break;
            if (tile === af) return AIRFLOW_RIGHT;
        }
    }
    return AIRFLOW_NONE;
}

// ─── monster struct field helpers ───
// Record layout: +0 currX (word), +2 currY, +3 m_x_rel, +6 flags, +7 state_flags

function incrementX(g: Uint8Array, m: number): void {
    let ax = (g16(g, m) + 1) & 0xffff;
    const mapWidth = g16(g, ADDR_MAP_WIDTH);
    if (ax >= mapWidth) ax -= mapWidth;
    s16(g, m, ax);
    s8(g, m + 3, (g8(g, m + 3) + 1) & 0xff);
}

function decrementX(g: Uint8Array, m: number): void {
    const ax = g16(g, m);
    s16(g, m, ax === 0 ? (g16(g, ADDR_MAP_WIDTH) - 1) & 0xffff : ax - 1);
    s8(g, m + 3, (g8(g, m + 3) - 1) & 0xff);
}

function incrementY(g: Uint8Array, m: number): void {
    s8(g, m + 2, (g8(g, m + 2) + 1) & 0x3f);
}

function decrementY(g: Uint8Array, m: number): void {
    s8(g, m + 2, (g8(g, m + 2) - 1) & 0x3f);
}

// ─── wind-tunnel danger checks (E/W) ───

function collisionEIncludingDanger5(g: Uint8Array, proxAddr: number): boolean {
    const tile = g8(g, proxAddr);
    if (isBlocking(g, tile) !== 0) return true;
    if (g8(g, ADDR_CAVERN_LEVEL) !== 5) return false;
    return getAirflowDirection(g, tile) === AIRFLOW_LEFT;
}

function collisionWIncludingDanger5(g: Uint8Array, proxAddr: number): boolean {
    const tile = g8(g, proxAddr);
    if (isBlocking(g, tile) !== 0) return true;
    if (g8(g, ADDR_CAVERN_LEVEL) !== 5) return false;
    return getAirflowDirection(g, tile) === AIRFLOW_RIGHT;
}

// ─── 2×2 footprint collision checks ───

export function checkCollisionE2(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = coordsToProxAddr(g, xRel, y) + 2;

    if (collisionEIncludingDanger5(g, di)) return 0xff; // (+2, 0)

    di = wrapMapFromAbove(di + PROX_COLS);
    if (collisionEIncludingDanger5(g, di)) return 0xff; // (+2, +1)

    // monster/item markers: bit7 on (+2,-1), (+2,0), (+2,+1)
    let markers = g8(g, di); // (+2, +1)
    di = wrapMapFromBelow(di - PROX_COLS);
    markers |= g8(g, di); // (+2, 0)
    di = wrapMapFromBelow(di - PROX_COLS);
    markers |= g8(g, di); // (+2, -1)
    if ((markers & 0x80) !== 0) return 0xff;

    return 0;
}

export function checkCollisionW2(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = coordsToProxAddr(g, xRel, y) - 1;

    if (collisionWIncludingDanger5(g, di)) return 0xff; // (-1, 0)

    di = wrapMapFromAbove(di + PROX_COLS);
    if (collisionWIncludingDanger5(g, di)) return 0xff; // (-1, +1)

    di -= 1;
    let markers = g8(g, di); // (-2, +1)
    di = wrapMapFromBelow(di - PROX_COLS);
    markers |= g8(g, di); // (-2, 0)
    di = wrapMapFromBelow(di - PROX_COLS);
    markers |= g8(g, di); // (-2, -1)
    if ((markers & 0x80) !== 0) return 0xff;

    return 0;
}

export function checkCollisionN2(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = wrapMapFromBelow(coordsToProxAddr(g, xRel, y) - PROX_COLS);
    if (isBlocking(g, g8(g, di)) !== 0) return 0xff; // (0, -1)
    if (isBlocking(g, g8(g, di + 1)) !== 0) return 0xff; // (+1, -1)

    di = wrapMapFromBelow(di - PROX_COLS);
    const markers = g8(g, di - 1) | g8(g, di) | g8(g, di + 1);
    if ((markers & 0x80) !== 0) return 0xff;

    return 0;
}

export function checkCollisionS2(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = wrapMapFromAbove(coordsToProxAddr(g, xRel, y) + PROX_COLS * 2);
    if (isBlocking(g, g8(g, di)) !== 0) return 0xff; // (0, 2)
    if (isBlocking(g, g8(g, di + 1)) !== 0) return 0xff; // (+1, 2)

    const markers = g8(g, di - 1) | g8(g, di) | g8(g, di + 1);
    if ((markers & 0x80) !== 0) return 0xff;

    return 0;
}

export function checkCollisionNE2(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = coordsToProxAddr(g, xRel, y) + 2;

    if (isBlocking(g, g8(g, di)) !== 0) return 0xff; // (2, 0)
    let markers = g8(g, di);

    di = wrapMapFromBelow(di - PROX_COLS);
    if (isBlocking(g, g8(g, di)) !== 0) return 0xff; // (2, -1)
    markers |= g8(g, di);

    if (isBlocking(g, g8(g, di - 1)) !== 0) return 0xff; // (1, -1)

    di = wrapMapFromBelow(di - PROX_COLS);
    markers |= g8(g, di) | g8(g, di - 1) | g8(g, di - 2);
    if ((markers & 0x80) !== 0) return 0xff;

    return 0;
}

export function checkCollisionSE2(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = coordsToProxAddr(g, xRel, y) + 2;
    let markers = g8(g, di); // (+2, 0)

    di = wrapMapFromAbove(di + PROX_COLS);
    if (isBlocking(g, g8(g, di)) !== 0) return 0xff; // (2, 1)
    markers |= g8(g, di);

    di = wrapMapFromAbove(di + PROX_COLS);
    if (isBlocking(g, g8(g, di)) !== 0) return 0xff; // (2, 2)
    markers |= g8(g, di);

    if (isBlocking(g, g8(g, di - 1)) !== 0) return 0xff; // (1, 2)

    markers |= g8(g, di - 1) | g8(g, di - 2);
    if ((markers & 0x80) !== 0) return 0xff;

    return 0;
}

export function checkCollisionNW2(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = coordsToProxAddr(g, xRel, y) - 1;

    if (isBlocking(g, g8(g, di)) !== 0) return 0xff; // (-1, 0)
    let markers = g8(g, di - 1); // (-2, 0)

    di = wrapMapFromBelow(di - PROX_COLS);
    if (isBlocking(g, g8(g, di)) !== 0) return 0xff; // (-1, -1)
    if (isBlocking(g, g8(g, di + 1)) !== 0) return 0xff; // (0, -1)
    markers |= g8(g, di - 1); // (-2, -1)

    di = wrapMapFromBelow(di - PROX_COLS);
    markers |= g8(g, di - 1) | g8(g, di) | g8(g, di + 1);
    if ((markers & 0x80) !== 0) return 0xff;

    return 0;
}

export function checkCollisionSW2(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = coordsToProxAddr(g, xRel, y) - 2;

    let markers = g8(g, di); // (-2, 0)

    di = wrapMapFromAbove(di + PROX_COLS);
    markers |= g8(g, di); // (-2, 1)
    if (isBlocking(g, g8(g, di + 1)) !== 0) return 0xff; // (-1, 1)

    di = wrapMapFromAbove(di + PROX_COLS);
    if (isBlocking(g, g8(g, di + 1)) !== 0) return 0xff; // (-1, 2)
    if (isBlocking(g, g8(g, di + 2)) !== 0) return 0xff; // (0, 2)

    markers |= g8(g, di) | g8(g, di + 1) | g8(g, di + 2);
    if ((markers & 0x80) !== 0) return 0xff;

    return 0;
}

/** Check_collision_in_direction (dungeon.c:516). dir 0=E … 7=SE. */
export function checkCollisionInDirection(g: Uint8Array, m: number, dir: number): number {
    switch (dir & 7) {
        case 0: return checkCollisionE2(g, m);
        case 1: return checkCollisionNE2(g, m);
        case 2: return checkCollisionN2(g, m);
        case 3: return checkCollisionNW2(g, m);
        case 4: return checkCollisionW2(g, m);
        case 5: return checkCollisionSW2(g, m);
        case 6: return checkCollisionS2(g, m);
        default: return checkCollisionSE2(g, m);
    }
}

// ─── directional moves ───

function moveE(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) < 34 && checkCollisionE2(g, m) === 0) {
        incrementX(g, m);
        return 0xff;
    }
    return 0;
}

function moveNE(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) < 34 && checkCollisionNE2(g, m) === 0) {
        incrementX(g, m);
        decrementY(g, m);
        return 0xff;
    }
    return 0;
}

function moveN(g: Uint8Array, m: number): number {
    const xRel = g8(g, m + 3);
    if (xRel !== 0 && xRel !== 35 && checkCollisionN2(g, m) === 0) {
        decrementY(g, m);
        return 0xff;
    }
    return 0;
}

function moveNW(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) >= 2 && checkCollisionNW2(g, m) === 0) {
        decrementX(g, m);
        decrementY(g, m);
        return 0xff;
    }
    return 0;
}

function moveW(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) >= 2 && checkCollisionW2(g, m) === 0) {
        decrementX(g, m);
        return 0xff;
    }
    return 0;
}

function moveSW(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) >= 2 && checkCollisionSW2(g, m) === 0) {
        decrementX(g, m);
        incrementY(g, m);
        return 0xff;
    }
    return 0;
}

function moveS(g: Uint8Array, m: number): number {
    const xRel = g8(g, m + 3);
    if (xRel !== 0 && xRel !== 35 && checkCollisionS2(g, m) === 0) {
        incrementY(g, m);
        return 0xff;
    }
    return 0;
}

function moveSE(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) < 34 && checkCollisionSE2(g, m) === 0) {
        incrementX(g, m);
        incrementY(g, m);
        return 0xff;
    }
    return 0;
}

// Exported directional movers (move_monster_* in dungeon.c) — used by the
// Stage 9 eai modules. Nonzero (=0xFF) on success, 0 when blocked.
export const moveMonsterE = moveE;
export const moveMonsterNE = moveNE;
export const moveMonsterN = moveN;
export const moveMonsterNW = moveNW;
export const moveMonsterW = moveW;
export const moveMonsterSW = moveSW;
export const moveMonsterS = moveS;
export const moveMonsterSE = moveSE;

/** monster_move_in_direction (dungeon.c:187). dir 0=E … 7=SE; 0xFF on success. */
export function monsterMoveInDirection(g: Uint8Array, m: number, dir: number): number {
    switch (dir & 7) {
        case 0: return moveE(g, m);
        case 1: return moveNE(g, m);
        case 2: return moveN(g, m);
        case 3: return moveNW(g, m);
        case 4: return moveW(g, m);
        case 5: return moveSW(g, m);
        case 6: return moveS(g, m);
        default: return moveSE(g, m);
    }
}
