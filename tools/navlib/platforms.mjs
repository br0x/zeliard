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
 *   the tile above the middle of his head must be non-blocking, and the three cells
 *   one row above the platform *and* the three cells two rows above it must be tile
 *   0. It then moves the platform up one row and calls moveHeroUp, carrying the hero.
 *
 * That is the whole of it. There is no test of the hero's body anywhere in either
 * routine, and one used to sit on top of them here: a 3x3 box-clear test, written
 * down as "not something the engine tests because the hero is already standing
 * there". It was wrong twice over — nine cells where the engine asks one, and nine
 * for *every* row when the engine asks its head-row question of a single column — and
 * it cost every vertical lift on the level rows it really travels. On mp80 seven of
 * the eight were cut short and the x=250 lift stopped at row 15 when the engine takes
 * it to 13; the player rode it there, and the route to mp80 `(244,7)` goes off the top
 * of it. `headClear` is the engine's own question in its place, and
 * `nav-platform-model` re-derives the range from these rules and compares.
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

    /**
     * The one cell a rise is allowed to be stopped by: the hero's head row itself.
     *
     * `try_move_platform_up` reads `heroCoordsToAddrInProximity - 35` — one row above
     * the head, one column right of his top-left, so the hero's middle column — and
     * `is_blocking_tile` is the head-row predicate. The hero is still at the platform's
     * *old* row when it reads it, so that probe lands exactly on the head row the move
     * would give him: a platform cannot rise to `platformRow` under a ceiling.
     */
    const headClear = (x, platformRow) => !solid(x + 1, headFor(platformRow));

    /** Hero head row for a platform sitting on row r. */
    const headFor = (r) => (r - 3 + mapHeight) % mapHeight;

    /**
     * Walk one row at a time in `step` (+1 down, -1 up) until a guard fails.
     *
     * The rows are a cylinder: both engine writes mask with `& 0x3f`
     * (dungeon-vertical.ts `tryMovePlatformUp`/`Down`), so row 0 ascends into
     * row 63 and row 63 descends into row 0. The walk therefore cannot be
     * bounded by `0` / `mapHeight - 1`; it stops only on a guard, or on coming
     * back to where it started — a platform that could travel the whole circle,
     * which no range pair can express, so the caller is told.
     *
     * @returns the last row reached, or `null` on a full circle.
     */
    const travel = (x, y, step) => {
        let at = y;
        for (;;) {
            const next = (at + step + mapHeight) % mapHeight;
            if (next === y) return null;
            if (!spanClear(x, next)) return at;
            // Up also needs the row the feet move into clear, and the one cell above
            // the head: `try_move_platform_up` checks `bx` at row-1 and `si` at
            // row-2 across the platform's width before it writes anything.
            if (step < 0) {
                if (!spanClear(x, (next - 1 + mapHeight) % mapHeight)) return at;
                if (!headClear(x, next)) return at;
            }
            at = next;
        }
    };

    /** topY/bottomY, or the widest arc expressible if the platform circles. */
    const arc = (x, y) => {
        const up = travel(x, y, -1);
        const down = travel(x, y, 1);
        if (up !== null && down !== null) return { topY: up, bottomY: down };
        console.warn(`platform x=${x} startY=${y} travels the whole cylinder`);
        return { topY: y, bottomY: (y - 1 + mapHeight) % mapHeight };
    };

    const vertical = verticalPlatforms.map((p) => ({
        kind: 0,
        x: p.x,
        startY: p.y,
        ...arc(p.x, p.y),
    }));

    const collapsing = collapsingPlatforms.map((p) => ({
        kind: 1,
        x: p.x,
        startY: p.y,
        bottomY: travel(p.x, p.y, 1) ?? (p.y - 1 + mapHeight) % mapHeight,
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
