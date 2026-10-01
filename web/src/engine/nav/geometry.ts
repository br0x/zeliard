/**
 * geometry.ts — the hero's occupancy tests against a decoded cavern.
 *
 * These are the geometric predicates every later stage needs, in one place, so the
 * graph builder (phase 3), the platform model (phase 2) and the pathfinder (phase
 * 4) cannot disagree about whether the hero fits somewhere.
 *
 * The hero occupies a 3x3 block of tiles: columns `col .. col+2`, rows
 * `headRow .. headRow+2`, where `col` is his **left** column and `headRow` his
 * **head** row (render/dungeon.ts:738-757 draws a 72x72 frame over exactly those
 * nine cells). A standing position therefore needs all nine cells free AND ground
 * beneath his feet.
 *
 * Both axes wrap: rows mod 64, columns mod mapWidth — a cavern is a cylinder in
 * both directions (engine/dungeon-hero.ts:112-215).
 *
 * Note on the head row: the engine checks `is_blocking_tile` at a single cell
 * there, and probes slightly asymmetrically left versus right
 * (moveHeroRightIfNoObstacles tests the column the hero already occupies, its
 * right edge; heroInteractionCheck compensates). This module tests the whole
 * head row, which is the conservative reading — it can only reject a position the
 * engine might have allowed, never accept one it would refuse.
 */

import { MAP_HEIGHT } from '../unpack.js';
import { NAV, blocksHead, blocksBody } from './types.js';

// Re-exported so the platform and current models share one import for the
// predicates they lean on most.
export { blocksBody, blocksHead };
import { NavTileClassifier } from './attributes.js';
import { tileAt, type NavTileGrid } from './mdt-grid.js';

/** Rows in a cavern. */
export const ROWS = MAP_HEIGHT;

/** Wrap a row into 0..63. */
export function wrapRow(row: number): number {
    return ((row % ROWS) + ROWS) % ROWS;
}

/** Wrap a column into 0..mapWidth-1. */
export function wrapCol(col: number, mapWidth: number): number {
    return ((col % mapWidth) + mapWidth) % mapWidth;
}

/** Flags of one cell, wrapping both axes. */
export function flagsAt(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    row: number,
): number {
    return classifier.classify(tileAt(grid, col, row));
}

/**
 * Is the hero's 3x3 box clear of blocking tiles?
 *
 * The head row uses `BLOCK_HEAD` and the body and feet rows `BLOCK_BODY`, matching
 * the engine's two predicates. For the static map the two agree, so this reduces
 * to one test; they differ only over the platform band, which never appears here.
 */
export function heroBoxFree(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
            const f = flagsAt(grid, classifier, col + i, headRow + j);
            if (j === 0 ? blocksHead(f) : blocksBody(f)) return false;
        }
    }
    return true;
}

/**
 * Is there ground under the hero's feet?
 *
 * `check_floor_for_landing` (dungeon-vertical.ts:488-504) probes the row beneath
 * his feet across his own three columns, and allows landing when the hero's pose
 * is the standing one even over a hole in the middle. Requiring solid ground
 * under the left or middle column is the conservative form of that.
 */
export function groundBelow(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    const feet = headRow + 3;
    return blocksBody(flagsAt(grid, classifier, col, feet))
        || blocksBody(flagsAt(grid, classifier, col + 1, feet));
}

/** Can the hero stand here? Box clear and supported. */
export function isStanding(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    return heroBoxFree(grid, classifier, col, headRow) && groundBelow(grid, classifier, col, headRow);
}

/** Is this cell one the hero could occupy at all, ignoring support? */
export function isOpen(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    row: number,
): boolean {
    return !blocksBody(flagsAt(grid, classifier, col, row));
}

/**
 * The column the hero's middle sits over — the one the engine probes for ropes
 * and currents. `tryClimbRope` and `checkAirflowsOnHero` both read the hero's
 * middle column, not his left.
 */
export const HERO_MIDDLE_OFFSET = 1;

/** Flags at the hero's middle column, `headRow + dy`. */
export function middleFlags(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
    dy = 0,
): number {
    return flagsAt(grid, classifier, col + HERO_MIDDLE_OFFSET, headRow + dy);
}

/** Does an up current sit in any of the three rows the engine probes? */
export function heroInLift(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    for (const dy of [0, 1, 2]) {
        if (middleFlags(grid, classifier, col, headRow, dy) & NAV.AIRFLOW_UP) return true;
    }
    return false;
}

/**
 * Would walking into `col` put the hero against a current that opposes him?
 *
 * `isLeftAirflow` blocks a move to the right and `isRightAirflow` blocks a move
 * to the left (dungeon-hero.ts:218-268), and each is tested on the head, body and
 * feet rows. A current that pushes *with* him is not a barrier.
 *
 * @param dir +1 walking right, -1 walking left
 */
export function blockedByCounterCurrent(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
    dir: 1 | -1,
): boolean {
    for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
            const f = flagsAt(grid, classifier, col + i, headRow + j);
            const opposing = dir > 0 ? NAV.AIRFLOW_LEFT : NAV.AIRFLOW_RIGHT;
            if (f & opposing) return true;
        }
    }
    return false;
}
