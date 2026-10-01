/**
 * platforms.mjs — platform tables plus the travel range of each platform.
 *
 * Travel ranges are computed by replaying the engine's own guards against the
 * decoded static map, so the graph builder never has to simulate anything.
 *
 * The three-cell platform occupies columns x .. x+2 and one row. When the hero
 * stands on it his head row is platformRow - 3, because findPlatformUnderHero
 * probes (heroLeftCol + 1, headY + 3) and identifies the mid tile there
 * (engine/dungeon-vertical.ts:253-344).
 *
 * Down — tryMovePlatformDown (engine/dungeon-vertical.ts:350-374):
 *   the three cells one row below must be EXACTLY tile 0, and the cell below-left
 *   must not hold a monster. It moves down one row and carries the hero.
 *
 * Up — tryMovePlatformUp (engine/dungeon-vertical.ts:380-422):
 *   the tile at (x + 1, headY - 1) must be non-blocking — one row above the hero's
 *   head — and the three cells one row above the platform must be tile 0. It then
 *   moves the platform up one row and calls moveHeroUp, carrying the hero.
 *
 * Both directions additionally need the hero's 3x3 box to be clear at the
 * resulting row, which is not something the engine tests because the hero is
 * already standing there; without it a platform could rise into a ceiling the
 * hero cannot occupy. Requiring it here means every emitted ride slot has a
 * standing position, so the graph builder can trust it.
 *
 * Collapsing platforms descend the same way and never rise
 * (heroCollapsePlatform, engine/dungeon-vertical.ts:472-484).
 *
 * Horizontal platforms oscillate between minX and maxX and carry the hero
 * (engine/dungeon-platforms.ts:127-167). Reachability is time-independent
 * because the hero can wait, so no range computation is needed beyond the span.
 */

import { MAP_HEIGHT } from './mdt.mjs';

/**
 * @param {object} cavern result of readCavern
 * @param {number[]} passable tile ids that are passable in this cavern
 * @param {number} mapHeight rows per map
 */
export function buildPlatforms(cavern, passable, mapHeight = MAP_HEIGHT) {
    const { tiles, header, verticalPlatforms, collapsingPlatforms, horizontalPlatforms } = cavern;
    const w = header.mapWidth;
    const pass = new Set(passable);

    const at = (x, y) => tiles[(((y % mapHeight) + mapHeight) % mapHeight) * w + (((x % w) + w) % w)];

    /** is_blocking_tile_simple: a tile below 0x49 blocks unless it is passable. */
    const solid = (x, y) => {
        const t = at(x, y);
        if (t >= 0x49) return false;
        const masked = t & 0x9f;
        if (masked === 0x90 || masked === 0x91) return true;
        return !pass.has(t);
    };

    /** The three cells the platform itself would occupy one row up/down. */
    const spanClear = (x, y) => at(x, y) === 0 && at(x + 1, y) === 0 && at(x + 2, y) === 0;

    /** The hero's 3x3 box at head row hy. */
    const boxFree = (x, hy) => {
        for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) {
                if (solid(x + i, hy + j)) return false;
            }
        }
        return true;
    };

    /** Hero head row for a platform sitting on row r. */
    const headFor = (r) => (r - 3 + mapHeight) % mapHeight;

    const descendFrom = (x, y) => {
        let bottom = y;
        while (bottom < mapHeight - 1
            && spanClear(x, bottom + 1)
            && boxFree(x, headFor(bottom + 1))) {
            bottom++;
        }
        return bottom;
    };
    const ascendFrom = (x, y) => {
        let top = y;
        while (top > 0
            && spanClear(x, top - 1)
            && boxFree(x, headFor(top - 1))) {
            top--;
        }
        return top;
    };

    const vertical = verticalPlatforms.map((p) => ({
        kind: 0,
        x: p.x,
        startY: p.y,
        topY: ascendFrom(p.x, p.y),
        bottomY: descendFrom(p.x, p.y),
    }));

    const collapsing = collapsingPlatforms.map((p) => ({
        kind: 1,
        x: p.x,
        startY: p.y,
        bottomY: descendFrom(p.x, p.y),
    }));

    const horizontal = horizontalPlatforms.map((p) => ({
        kind: 2,
        y: p.y,
        startX: p.x,
        minX: p.minX,
        maxX: p.maxX,
        /** Span length in columns; wraps the seam, e.g. 231 -> 11 on width 240. */
        cols: p.maxX >= p.minX ? p.maxX - p.minX + 1 : w - p.minX + p.maxX + 1,
        speed: p.speed,
        movingLeft: p.movingLeft,
    }));

    return { vertical, collapsing, horizontal };
}
