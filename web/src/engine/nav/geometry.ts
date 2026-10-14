/**
 * geometry.ts — the hero's occupancy tests against a decoded cavern.
 *
 * These are the geometric predicates every later stage needs, in one place, so
 * the graph builder, the platform model and the pathfinder cannot disagree about
 * whether the hero fits somewhere.
 *
 * The hero occupies a 3x3 block of tiles: columns `col .. col+2`, rows
 * `headRow .. headRow+2`, where `col` is his **left** column and `headRow` his
 * **head** row (render/dungeon.ts:738-757 draws a 72x72 frame over exactly those
 * nine cells). A standing position needs support under his middle foot and an
 * open middle column; the engine does not require the whole 3x3 to be clear.
 *
 * Both axes wrap: rows mod 64, columns mod mapWidth — a cavern is a cylinder in
 * both directions (engine/dungeon-hero.ts:112-215).
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
 * Conservative: it can only reject a position the engine might have allowed,
 * never accept one it would refuse. Callers that need the engine's own rule ask
 * for the specific probe instead.
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
 * Is there ground under the hero's middle foot?
 *
 * `check_floor_for_landing` (dungeon-vertical.ts:488-504) reads the cell under
 * the hero's middle column. A grounded hero's animation phase is 0x80 — set by
 * `init_on_ground` (dungeon-vertical.ts:124) — so for a standing position the
 * test that matters is the middle foot alone.
 */
export function groundBelow(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    return blocksBody(flagsAt(grid, classifier, col + HERO_MIDDLE_OFFSET, headRow + 3));
}

/**
 * `check_floor_for_landing` in full, for the frame a jump lands on.
 *
 * @param firstPose true for the one frame where the hero's animation phase is 0
 *   rather than 0x80 — the only time his outer two feet are consulted.
 */
export function canLand(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
    firstPose = false,
): boolean {
    if (groundBelow(grid, classifier, col, headRow)) return true;
    if (!firstPose) return false;
    const feet = headRow + 3;
    if (blocksBody(flagsAt(grid, classifier, col, feet))) return false;
    return blocksBody(flagsAt(grid, classifier, col + 2, feet));
}

/**
 * Can the hero come to rest here?
 *
 * The engine's standing test asks one thing: ground under his middle foot. It
 * does not ask whether the whole body fits — a side column may be inside rock.
 * What it does require is that the **middle column** is open over the three
 * rows, because every probe the jump and fall routines make reads that column.
 */
export function canRest(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    return middleColumnFree(grid, classifier, col, headRow)
        && groundBelow(grid, classifier, col, headRow);
}

/**
 * Is the hero's middle column open over his three rows?
 *
 * The whole of "is this a position in this game at all", with the support left
 * out. A platform supplies its own support, so a ride slot asks only this.
 */
export function middleColumnFree(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    for (let j = 0; j < 3; j++) {
        if (blocksBody(middleFlags(grid, classifier, col, headRow, j))) return false;
    }
    return true;
}

/**
 * Can the hero stand here? Held up, and not inside a wall.
 *
 * Ground under his middle foot is the usual answer. An up current is the other:
 * `check_airflows_on_hero` runs before `airborne_movement` in every frame
 * (dungeon-frame-pre.ts:88-113) and, finding a jet in his three rows, sets
 * `AIR_UP_TILE_FOUND`, which makes the landing check and the descent both
 * unreachable (dungeon-input.ts:515-517). A hero over a hole that a current
 * holds does not fall through it.
 */
export function isStanding(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    return middleColumnFree(grid, classifier, col, headRow)
        && (groundBelow(grid, classifier, col, headRow)
            || heroInLift(grid, classifier, col, headRow));
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
 * Which way the sideways current in this cell's middle column blows:
 * `-1` west, `+1` east, `0` for none.
 *
 * `check_airflows_on_hero` (dungeon-frame-pre.ts:65-72) reads the middle column
 * at `headRow`, `headRow + 1` and `headRow + 2` and calls `dispatchAirflows` on
 * each, so a current anywhere in those three rows owns the hero every frame.
 */
export function conveyorDir(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): -1 | 0 | 1 {
    for (const dy of [0, 1, 2]) {
        const flags = middleFlags(grid, classifier, col, headRow, dy);
        if (flags & NAV.AIRFLOW_LEFT) return -1;
        if (flags & NAV.AIRFLOW_RIGHT) return 1;
    }
    return 0;
}

/**
 * Does a sideways current sit in any of the three rows the engine probes?
 *
 * A cell a sideways current holds is not one the hero comes to rest in: the
 * moment he stops there he is pushed out again, so neither a step, a jump nor a
 * fall may *enter* it against the blow. The mirror of {@link heroInLift}.
 */
export function heroInConveyor(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
): boolean {
    return conveyorDir(grid, classifier, col, headRow) !== 0;
}

/**
 * Would walking into `col` put the hero against a current that opposes him?
 *
 * `isLeftAirflow` blocks a move to the right and `isRightAirflow` blocks a move
 * to the left (dungeon-hero.ts:218-268), and each is tested on the head, body and
 * feet rows. A current that pushes *with* him is not a barrier.
 *
 * Cavern 7 is the exception both predicates make first: `is_left_airflow` and
 * `is_right_airflow` return false outright there (dungeon-entities.ts:99-105), so
 * a level-7 conveyor is scenery and never blocks a step.
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
    if (classifier.cavernLevel() === 7) return false;
    for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
            const f = flagsAt(grid, classifier, col + i, headRow + j);
            const opposing = dir > 0 ? NAV.AIRFLOW_LEFT : NAV.AIRFLOW_RIGHT;
            if (f & opposing) return true;
        }
    }
    return false;
}

/**
 * May the hero shift one column sideways from where he is?
 *
 * This is `move_hero_right_if_no_obstacles` (asm/fight.asm:1370) and its mirror
 * (asm/fight.asm:1087), which is also what steers him in mid-air.
 *
 * Note which column each one tests. Going right it probes `heroTL + 2`, going
 * left `heroTL` — a column the hero *already* occupies, on the side he faces.
 * The column he is about to enter is never examined. So a hero can end a frame
 * one column inside rock, and cannot advance a second column into it.
 * `heroBoxFree` is the conservative reading.
 *
 * @param dir +1 to move right, -1 to move left
 */
export function heroCanStepSideways(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    col: number,
    headRow: number,
    dir: 1 | -1,
): boolean {
    const probe = dir > 0 ? col + 2 : col;
    const opposing = dir > 0 ? NAV.AIRFLOW_LEFT : NAV.AIRFLOW_RIGHT;
    const guard = classifier.cavernLevel() === 7;
    for (let j = 0; j < 3; j++) {
        const f = flagsAt(grid, classifier, probe, headRow + j);
        if (j === 0 ? blocksHead(f) : blocksBody(f)) return false;
        if (!guard && f & opposing) return false;
    }
    return true;
}
