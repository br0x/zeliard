/**
 * dungeon-platforms.ts — TS port of dungeon.c's platform & magia-stone
 * subsystems consumed by main_update_render_pre (Stage 8d, slice 2).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - horiz_platform_proximity_x_offset     (2354)
 *   - put_dl_to_proximity_layered           (2382) — re-exported from
 *     dungeon-vertical.ts where it was first ported
 *   - hero_on_horiz_platform                (2396)
 *   - update_horiz_platform_coords          (2428)
 *   - update_slow_horiz_platform_coords     (2478)
 *   - update_and_render_horiz_platforms     (2495)
 *   - render_vertical_platforms_to_proximity(2566)
 *   - process_visible_collapsing_platforms  (2591)
 *   - magia_stone_updates                   (2647)
 *   - render_magia_stone_effect             (2670)
 *
 * Platform table entries are 7 bytes:
 *   horiz: +0 x_and_flags (word: bits14-15 speed, bits0-13 x),
 *          +2 y_and_flags (bit7 dir, bit6 pause), +3 min_x, +5 max_x
 *   vertical/collapsing: 3 bytes {x word, y byte}
 */

import {
    coordsToProxAddr,
    wrapMapFromAbove,
    wrapMapFromBelow,
} from './dungeon-entities.js';
import { absXToProximityRel, putDlToProximityLayered } from './dungeon-vertical.js';
import {
    moveHeroLeftIfNoObstacles,
    moveHeroRightIfNoObstacles,
} from './dungeon-hero.js';

const PROX_COLS = 36;

// g_mem addresses
const VIEWPORT_TOP_ROW_UNUSED = 0x82;
void VIEWPORT_TOP_ROW_UNUSED;
const HERO_XV = 0x83;
const HERO_HEAD_Y_VIEW = 0x84;
const BYTE_9F07 = 0x9f07;
const MAP_WIDTH = 0xc002; // word
const HORIZ_PLATFORMS_LIST = 0xc008; // word pointer
const COLLAPSING_PLATFORMS_LIST = 0xc006; // word pointer
const MAGIA_STONE_SPRITE0 = 0xeb60; // 4 × 7-byte sprites
const ON_ROPE_FLAGS = 0xff39;
const JUMP_PHASE_FLAGS = 0xff3d;

/** circle_delta_x / circle_delta_y (dungeon.c:613). */
export const CIRCLE_DELTA_X: readonly number[] = [2, 2, 3, 4, 5, 6, 7, 8, 8, 8, 7, 6, 5, 4, 3, 2];
export const CIRCLE_DELTA_Y: readonly number[] = [1, 0, -1, -2, -2, -2, -1, 0, 1, 2, 3, 4, 4, 4, 3, 2];



export interface AbsProxRelCf {
    ax: number;
    bx: number;
    /** true when bx exceeds the window width (C carry set → off-window). */
    cf: boolean;
}

/**
 * horiz_platform_proximity_x_offset (dungeon.c:2354): like
 * abs_x_to_proximity_rel but shifts x by +2 first and thresholds at 37.
 */
export function horizPlatformProximityXOffset(g: Uint8Array, x: number): AbsProxRelCf {
    let xw = (x + 2) & 0xffff;
    const mapWidth = memRead16(g, MAP_WIDTH);
    if (xw >= mapWidth) {
        xw = (xw - mapWidth) & 0xffff;
    }

    let d: number;
    const proxLeft = memRead16(g, 0x80);

    if (xw >= proxLeft) {
        d = (xw - proxLeft) & 0xffff;
    } else if (xw > 37) {
        d = xw;
    } else {
        d = (mapWidth - proxLeft + xw) & 0xffff;
    }

    return { ax: (37 - d) & 0xffff, bx: d, cf: d > 37 };
}

/**
 * hero_on_horiz_platform (dungeon.c:2396): returns TRUE when the hero is
 * NOT standing on this platform (C carry convention).
 */
export function heroOnHorizPlatform(g: Uint8Array, si: number): boolean {
    if (((memRead8(g, JUMP_PHASE_FLAGS) | memRead8(g, ON_ROPE_FLAGS)) & 0xff) !== 0) {
        return true; // airborne / on a rope: platform doesn't apply
    }

    const heroRow = (memRead8(g, HERO_HEAD_Y_VIEW) + memRead8(g, 0x82 /* VIEWPORT_TOP_ROW */) + 3) & 0x3f;
    const platformRow = memRead8(g, si + 2) & 0x3f;
    if (heroRow !== platformRow) return true;

    const rel = absXToProximityRel(g, memRead16(g, si) & 0x3fff);
    if (rel.bx > 33) return true; // C: carry set when off-window

    const platformCol = rel.ax & 0xff;
    let heroCol = (memRead8(g, HERO_XV) + 4) & 0xff;

    for (let i = 0; i < 3; i++) {
        if (heroCol === platformCol) {
            return false; // hero is standing on one of the 3 platform tiles
        }
        heroCol = (heroCol + 1) & 0xff;
    }
    return true;
}

/**
 * update_horiz_platform_coords (dungeon.c:2428): advance a horizontal
 * platform one step, carrying the hero along unless blocked.
 */
export function updateHorizPlatformCoords(g: Uint8Array, si: number, x: number): void {
    const oldYFlags = memRead8(g, si + 2);
    memWrite8(g, si + 2, memRead8(g, si + 2) & 0xbf); // clear the "paused" bit

    if ((oldYFlags & 0x40) !== 0) {
        // platform was paused; this tick only un-pauses it
        return;
    }

    let newX: number;
    let boundary: number;
    const mapWidth = memRead16(g, MAP_WIDTH);

    if ((memRead8(g, si + 2) & 0x80) === 0) {
        // moving right
        newX = (x + 1) & 0xffff;
        if (newX === mapWidth) {
            newX = 0;
        }

        if (!heroOnHorizPlatform(g, si)) {
            moveHeroRightIfNoObstacles(g);
        }
        boundary = memRead16(g, si + 5); // max_x
    } else {
        // moving left
        if (x === 0) {
            newX = (mapWidth - 1) & 0xffff;
        } else {
            newX = (x - 1) & 0xffff;
        }

        if (!heroOnHorizPlatform(g, si)) {
            moveHeroLeftIfNoObstacles(g);
        }
        boundary = memRead16(g, si + 3); // min_x
    }

    // store new_x into x_and_flags preserving the top-2 flag bits
    const oldHi = (memRead16(g, si) >> 8) & 0xff;
    const newHi = ((oldHi & 0xc0) | ((newX >> 8) & 0xff)) & 0xff;
    memWrite16(g, si, ((newHi << 8) | (newX & 0xff)) & 0xffff);

    if (boundary === newX) {
        memWrite8(g, si + 2, memRead8(g, si + 2) ^ 0x80); // reverse direction
        memWrite8(g, si + 2, memRead8(g, si + 2) | 0x40); // pause for a few ticks
    }
}

/** update_slow_horiz_platform_coords (dungeon.c:2478): every other tick. */
export function updateSlowHorizPlatformCoords(g: Uint8Array, si: number, x: number): void {
    if ((memRead8(g, BYTE_9F07) & 1) !== 0) {
        updateHorizPlatformCoords(g, si, x);
    }
}

/**
 * update_and_render_horiz_platforms (dungeon.c:2495): clear old footprints,
 * advance each horizontal platform, draw the new footprint.
 */
export function updateAndRenderHorizPlatforms(g: Uint8Array): void {
    memWrite8(g, BYTE_9F07, (memRead8(g, BYTE_9F07) + 1) & 0xff);

    let si = memRead16(g, HORIZ_PLATFORMS_LIST);
    for (;;) {
        const xAndFlags = memRead16(g, si);
        if (xAndFlags === 0xffff) return; // end-of-list sentinel

        const x = xAndFlags & 0x3fff;

        // clear the platform's previous footprint from the proximity map
        const off = horizPlatformProximityXOffset(g, x);
        if (!off.cf) {
            const d = off.bx;
            let count: number;
            let col: number;
            const row = memRead8(g, si + 2);
            let di: number;

            if (d >= 2) {
                const d2 = (d - 2) & 0xffff;
                if (d2 < 34) {
                    // fully inside the visible strip
                    count = 3;
                    col = d2 & 0xff;
                    di = coordsToProxAddr(g, col, row);
                } else {
                    // straddles the right edge of the strip
                    const rem = (d2 - 34) & 0xffff;
                    di = coordsToProxAddr(g, 34, row);
                    di = (di + rem) & 0xffff;
                    count = (2 - rem) & 0xff;
                }
            } else {
                // straddles the left edge of the strip
                count = (d + 1) & 0xff;
                di = coordsToProxAddr(g, 0, row);
            }

            for (let i = count; i !== 0; i--) {
                putDlToProximityLayered(g, 0, di & 0xffff);
                di++;
            }
        }

        // advance the platform's position/state (if it's time to move)
        const curX = memRead16(g, si) & 0x3fff;
        const speedFlags = (memRead16(g, si) >> 14) & 3;
        if (speedFlags !== 0) {
            if (speedFlags === 1) updateSlowHorizPlatformCoords(g, si, curX);
            else updateHorizPlatformCoords(g, si, curX);
        }

        // draw the platform at its (possibly new) position
        const rel = absXToProximityRel(g, memRead16(g, si) & 0x3fff);
        if (!rel.cf) {
            // C: !abs_x_to_proximity_rel(...) — carry clear means in-window
            const diBase = coordsToProxAddr(g, rel.bx & 0xff, memRead8(g, si + 2));
            let tile = 0x46; // horizontal platform tiles: 0x46, 0x47, 0x48
            for (let i = 0; i < 3; i++) {
                putDlToProximityLayered(g, tile, (diBase + i) & 0xffff);
                tile++;
            }
        }

        si += 7;
    }
}

/**
 * render_vertical_platforms_to_proximity (dungeon.c:2566).
 */
export function renderVerticalPlatformsToProximity(g: Uint8Array): void {
    let si = memRead16(g, 0xc004 /* VERTICAL_PLATFORMS_LIST */);
    for (;;) {
        const x = memRead16(g, si);
        if (x === 0xffff) return;
        const y = memRead8(g, si + 2);
        const rel = absXToProximityRel(g, x);
        if (!rel.cf) {
            let di = coordsToProxAddr(g, rel.bx & 0xff, y);
            let tile = 0x40;
            for (let i = 0; i < 3; i++) {
                putDlToProximityLayered(g, tile, di & 0xffff);
                di++;
                tile++;
            }
        }
        si += 3;
    }
}

/**
 * process_visible_collapsing_platforms (dungeon.c:2591).
 */
export function processVisibleCollapsingPlatforms(g: Uint8Array): void {
    let si = memRead16(g, COLLAPSING_PLATFORMS_LIST);
    for (;;) {
        const x = memRead16(g, si);
        if (x === 0xffff) return;
        const rel = absXToProximityRel(g, x);
        if (!rel.cf) {
            let di = coordsToProxAddr(g, rel.bx & 0xff, memRead8(g, si + 2));
            let tile = 0x43; // collapsing platform tiles: 0x43, 0x44, 0x45
            for (let i = 0; i < 3; i++) {
                putDlToProximityLayered(g, tile, di & 0xffff);
                di++;
                tile++;
            }
        }
        si += 3;
    }
}

// ─── magia stones ───

function proximityCellInjectSpellTarget(g: Uint8Array, spiritBase: number, proxAddr: number): void {
    const activeShots = memRead8(g, spiritBase + 2);
    if (activeShots === 0) return;

    const { flags, monsterStruct } = getDstMonsterFlagsSafe(g, proxAddr);
    if (monsterStruct === 0) return;
    if ((flags & 0x20) !== 0) return;
    const aiFlags = memRead8(g, monsterStruct + 5);
    if ((aiFlags & 0x20) !== 0) return;
    memWrite8(g, monsterStruct + 5, (aiFlags & 0xe0) | 0x49);
    memWrite8(g, spiritBase + 2, (activeShots - 1) & 0xff);
}

// local import shim to avoid a cycle with dungeon-hero
import { getDstMonsterFlags } from './dungeon-hero.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';
function getDstMonsterFlagsSafe(g: Uint8Array, addr: number) {
    return getDstMonsterFlags(g, addr);
}

function magiaStoneSpritePlaceInProximityRows(
    g: Uint8Array,
    spiritBase: number,
    proxAddr: number,
): void {
    if (memRead8(g, 0xff34 /* IS_BOSS_CAVERN */) !== 0 && memRead8(g, 0xff30 /* BOSS_IS_DEAD */) !== 0) return;

    proximityCellInjectSpellTarget(g, spiritBase, proxAddr & 0xffff);
    proximityCellInjectSpellTarget(g, spiritBase, (proxAddr + 1) & 0xffff);

    const nextCell = wrapMapFromAbove((proxAddr + PROX_COLS) & 0xffff);
    proximityCellInjectSpellTarget(g, spiritBase, nextCell);
}

/** magia_stone_updates (dungeon.c:2647): orbit the stones, mark targets. */
export function magiaStoneUpdates(g: Uint8Array): void {
    for (let i = 0; i < 4; i++) {
        const base = MAGIA_STONE_SPRITE0 + i * 7;
        let orbitPhase = memRead8(g, base);
        if (orbitPhase === 0xff) continue;

        const orbitSpeed = memRead8(g, base + 1);
        orbitPhase = (orbitPhase + orbitSpeed) & 0x0f;
        memWrite8(g, base, orbitPhase);

        const heroX = memRead8(g, HERO_XV);
        const heroY = memRead8(g, HERO_HEAD_Y_VIEW);
        const viewportTop = memRead8(g, 0x82);
        const stoneMapX = (heroX + CIRCLE_DELTA_X[orbitPhase]!) & 0xff;
        const stoneMapY = ((heroY + CIRCLE_DELTA_Y[orbitPhase]! + viewportTop) & 0xff) as number;
        let proxAddr = coordsToProxAddr(g, stoneMapX, stoneMapY);
        proxAddr = wrapMapFromBelow((proxAddr - 37) & 0xffff);
        magiaStoneSpritePlaceInProximityRows(g, base, proxAddr);
    }
}

/** render_magia_stone_effect (dungeon.c:2670): viewport-space positions. */
export function renderMagiaStoneEffect(g: Uint8Array): void {
    for (let i = 0; i < 4; i++) {
        const base = MAGIA_STONE_SPRITE0 + i * 7;
        const orbitPhase = memRead8(g, base);
        if (orbitPhase === 0xff) continue;

        if (memRead8(g, base + 2) === 0) {
            memWrite8(g, base, 0xff);
            memWrite16(g, base + 3, 0);
            memWrite8(g, base + 5, 0);
            memWrite8(g, base + 6, 0);
            continue;
        }

        const phase = orbitPhase & 0x0f;
        const heroX = memRead8(g, HERO_XV);
        const heroY = memRead8(g, HERO_HEAD_Y_VIEW);
        memWrite8(g, base + 5, (heroX + CIRCLE_DELTA_X[phase]!) & 0xff);
        memWrite8(g, base + 6, (heroY + CIRCLE_DELTA_Y[phase]!) & 0x3f);
        memWrite16(g, base + 3, 0x8000);
    }
}
