/**
 * dungeon-frame-pre.ts — TS port of the remaining main_update_render_pre
 * subsystems (Stage 8d, slice 3).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - check_airflows_on_hero                (4643)
 *   - dispatch_airflows                     (4877)
 *   - update_boss_heartbeat_volume          (2454)
 *   - process_doors                         (2855) + calc_object_viewport_
 *     x_offset (2845) + move_if_dst_high_bit_zero (2849) + door tile tables
 */

import { heroCoordsToAddrInProximity, moveHeroUp } from './dungeon-hero.js';
import { HEARTBEAT_DISTANCE_ATTENUATION } from './heartbeat-table.js';
import { getAirflowDirection } from './dungeon-entities.js';
import {
    moveHeroLeftIfNoObstacles,
} from './dungeon-hero.js';
import { moveHeroRightIfNoObstacles } from './dungeon-hero.js';
import { wrapMapFromAbove, wrapMapFromBelow } from './dungeon-entities.js';

const PROX_COLS = 36;

// g_mem addresses
const AIR_UP_TILE_FOUND = 0x9f15;
const JUMP_PHASE_FLAGS = 0xff3d;
const HERO_ANIM_PHASE = 0xe7;
const HERO_Y = 0xff35;
const TEAR_X = 0xc013; // word
const TEAR_Y = 0xc015;
const HEARTBEAT_VOLUME = 0xff08;
const MAP_WIDTH = 0xc002; // word
const DOORS_LIST = 0xc00a; // word pointer

function g8(g: Uint8Array, addr: number): number {
    return g[addr & 0xffff] ?? 0;
}

function s8(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
}

function g16(g: Uint8Array, addr: number): number {
    return (g[addr & 0xffff] ?? 0) | ((g[(addr + 1) & 0xffff] ?? 0) << 8);
}


// ─── airflows ───

/** dispatch_airflows (dungeon.c:4877). */
export function dispatchAirflows(g: Uint8Array, si: number): void {
    const tile = g8(g, si);
    const dir = getAirflowDirection(g, tile);
    if (dir === 0xff) return;

    switch (dir) {
        case 0: // up
            moveHeroUp(g);
            moveHeroUp(g);
            s8(g, AIR_UP_TILE_FOUND, 0xff);
            s8(g, JUMP_PHASE_FLAGS, 0); // no jumps while flying
            s8(g, HERO_ANIM_PHASE, 0x80); // idle
            break;
        case 1: // left
            moveHeroLeftIfNoObstacles(g);
            moveHeroLeftIfNoObstacles(g);
            break;
        case 2: // right
            moveHeroRightIfNoObstacles(g);
            moveHeroRightIfNoObstacles(g);
            break;
    }
}

/** check_airflows_on_hero (dungeon.c:4643). */
export function checkAirflowsOnHero(g: Uint8Array): void {
    s8(g, AIR_UP_TILE_FOUND, 0);
    let si = wrapMapFromAbove((heroCoordsToAddrInProximity(g) + 2 * PROX_COLS + 1) & 0xffff);
    for (let i = 0; i < 3; i++) {
        dispatchAirflows(g, si);
        si = wrapMapFromBelow((si - PROX_COLS) & 0xffff);
    }
}

// ─── boss heartbeat ───

/** heartbeat_squares[i] = i² for i in 0..15 (dungeon.c:2246). */
export const HEARTBEAT_SQUARES: readonly number[] = [
    0, 1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225,
];

// heartbeat_distance_attenuation lives in ./heartbeat-table.ts (verbatim).

/**
 * update_boss_heartbeat_volume (dungeon.c:2454): distance-attenuated
 * heartbeat volume based on the hero's position vs the Tear.
 */
export function updateBossHeartbeatVolume(g: Uint8Array): void {
    // tear_x == 0xFFFF means the boss is dead and the Tear already acquired.
    if ((g16(g, TEAR_X) & 0xffff) === 0xffff) {
        s8(g, HEARTBEAT_VOLUME, 0);
        return;
    }

    // relative column of the Tear inside the 36-wide window (wrap-aware)
    let rel: number;
    {
        const tearX = g16(g, TEAR_X);
        const proxLeft = g16(g, 0x80);
        if (tearX >= proxLeft) {
            rel = (tearX - proxLeft) & 0xffff;
        } else if (tearX > 35) {
            s8(g, HEARTBEAT_VOLUME, 0);
            return;
        } else {
            rel = (g16(g, MAP_WIDTH) - proxLeft + tearX) & 0xffff;
        }
    }
    if (rel > 35) {
        s8(g, HEARTBEAT_VOLUME, 0);
        return;
    }

    // horizontal distance |hero column - tear column|
    const heroCol = (g8(g, 0x83) + 4) & 0xff;
    let dx = heroCol - rel;
    if (dx < 0) dx = -dx;

    // vertical distance, wrapping the 64-row map
    const heroY = g8(g, HERO_Y);
    const tearY = g8(g, TEAR_Y);
    const dyFwd = (heroY - tearY) & 0x3f;
    const dyRev = (tearY - heroY) & 0x3f;
    const dy = dyRev < dyFwd ? dyRev : dyFwd;

    if (dx >= 16 || dy >= 16) {
        s8(g, HEARTBEAT_VOLUME, 0);
        return;
    }

    const dist2 = (HEARTBEAT_SQUARES[dx]! + HEARTBEAT_SQUARES[dy]!) & 0xff;
    if (dist2 < HEARTBEAT_SQUARES[dx]!) {
        // dist² > 255 (carry out of uint8)
        s8(g, HEARTBEAT_VOLUME, 0);
        return;
    }

    s8(g, HEARTBEAT_VOLUME, HEARTBEAT_DISTANCE_ATTENUATION[dist2] ?? 0);
}

// ─── doors ───

/** Door tile tables (dungeon.c:2795/2801). Row 0 byte [2] is patched at
 * runtime with the door's color; these are C file statics — mutable. */
export const CLOSED_DOOR_TILES: number[] = [
    0x49, 0x4a, 0x61, 0x4b, 0x4c,
    0x4d, 0x4f, 0x50, 0x51, 0x4e,
    0x5f, 0x52, 0x53, 0x54, 0x60,
    0x5f, 0x55, 0x56, 0x57, 0x60,
];

export const OPENED_DOOR_TILES: number[] = [
    0x49, 0x4a, 0x61, 0x4b, 0x4c,
    0x4d, 0x58, 0x00, 0x59, 0x4e,
    0x5f, 0x5a, 0x00, 0x5b, 0x60,
    0x5f, 0x5c, 0x5d, 0x5e, 0x60,
];

export interface ViewportXOffset {
    col: number;
    /** C carry: true when off-screen. */
    offscreen: boolean;
}

/** calc_object_viewport_x_offset (dungeon.c:2845). */
export function calcObjectViewportXOffset(g: Uint8Array, x: number): ViewportXOffset {
    const mapWidth = g16(g, MAP_WIDTH);
    const x3 = (x + 3) & 0xffff;
    const x3w = x3 >= mapWidth ? x3 - mapWidth : x3;
    const proxLeft = g16(g, 0x80);

    if (x3w >= proxLeft) {
        const col = x3w - proxLeft;
        return { col, offscreen: col > 39 };
    }
    if (x3w <= 39) {
        const col = (mapWidth - proxLeft + x3w) & 0xffff;
        return { col, offscreen: col > 39 };
    }
    return { col: x3w, offscreen: true };
}

/** move_if_dst_high_bit_zero (dungeon.c:2849). */
function moveIfDstHighBitZero(g: Uint8Array, dst: number, srcVal: number): void {
    if ((g8(g, dst) & 0x80) === 0) s8(g, dst, srcVal);
}

/** process_doors (dungeon.c:2855): stamp door tiles into the proximity map. */
export function processDoors(g: Uint8Array): void {
    let door = g16(g, DOORS_LIST);

    for (;;) {
        const x0 = g16(g, door);
        if (x0 === 0xffff) return; // end-of-list marker

        const vp = calcObjectViewportXOffset(g, x0);

        if (!vp.offscreen) {
            const dFlags = g8(g, door + 3);
            const doorColor = ((dFlags & 7) + 0x61) & 0xff;
            CLOSED_DOOR_TILES[2] = doorColor;
            OPENED_DOOR_TILES[2] = doorColor;

            let di = coordsToProxAddrForDoors(g, 0, g8(g, door + 2));
            const doorCol = vp.col & 0xff;
            const isOpen = (dFlags & 0x80) !== 0;
            let list: number[];
            let srcIdx: number;
            let colCount: number;

            if (doorCol >= 4) {
                // left edge fully on screen; clip right edge against viewport
                colCount = Math.min(40 - doorCol, 5) & 0xff;
                di += doorCol - 4;
                list = isOpen ? OPENED_DOOR_TILES : CLOSED_DOOR_TILES;
                srcIdx = 0;
            } else {
                // left edge clipped off the left side
                list = isOpen ? OPENED_DOOR_TILES : CLOSED_DOOR_TILES;
                srcIdx = 4 - doorCol;
                colCount = (doorCol + 1) & 0xff;
            }

            for (let row = 0; row < 4; row++) {
                const origDi = di;
                const origSrc = srcIdx;

                for (let col = 0; col < colCount; col++) {
                    moveIfDstHighBitZero(g, di & 0xffff, list[srcIdx] ?? 0);
                    di++;
                    srcIdx++;
                }
                di = origDi + PROX_COLS; // next row, same column start
                di = rewrap(di);
                srcIdx = origSrc + 5; // advance source by one tile row
            }
        }

        door += 12;
    }
}

function rewrap(addr: number): number {
    // mirrors wrap_map_from_above on a possibly unmasked address
    let a = addr & 0xffff;
    if (a >= 0xe000 + 36 * 64) a -= 36 * 64;
    return a;
}

function coordsToProxAddrForDoors(g: Uint8Array, x: number, y: number): number {
    return (0xe000 + (y & 0x3f) * PROX_COLS + (x & 0xff)) & 0xffff;
}
