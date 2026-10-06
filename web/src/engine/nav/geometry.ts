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
 * there, and probes asymmetrically depending on which way he is going
 * (`heroCanStepSideways` below is that probe verbatim). This module tests the
 * whole head row for `heroBoxFree`, which is the conservative reading — it can
 * only reject a position the engine might have allowed, never accept one it
 * would refuse. Callers that need the engine's own rule ask for the specific
 * probe instead.
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
 * Is the hero held up where he stands?
 *
 * `check_floor_for_landing` (dungeon-vertical.ts:488-504) is the only test the
 * engine makes for "the hero is on the ground", and it runs every frame from
 * `airborne_movement` whatever he is doing. Its reading, from asm/fight.asm:1920:
 *
 *   middle foot solid                 -> holding            (stc; retn at loc_6B97)
 *   else hero_animation_phase == 0x80 -> falling            (clc at loc_6B9E)
 *   else left foot not solid          -> falling            (retn at loc_6BD2)
 *   else right foot solid             -> holding            (stc; retn at loc_6BCC)
 *   else                              -> falling
 *
 * A grounded hero's animation phase is 0x80 — `init_on_ground` writes exactly
 * that (dungeon-vertical.ts:124) — so the test that matters for a standing
 * position is the first one: ground under the **middle** column.
 *
 * The wider "left or middle" rule this replaced was a guess, and it invented
 * standing positions the hero cannot occupy: with a ledge under his left foot
 * and open air under the other two, `move_hero_right_if_no_obstacles` lets him
 * walk there, and the very next frame the floor check finds nothing under his
 * middle and drops him a row. He passes through such a cell; he never stops on
 * it. mp80's west gallery is one: the player walked east along row 10 off a
 * ledge at column 141 and fell down the shaft there rather than standing on it.
 *
 * The `|| right foot` clause of the last two branches is consulted only in the
 * pose the hero is in for exactly one frame after a rise (`jump_press_handler`
 * clears his animation phase, dungeon-hero.ts:339) and `land_after_jump` sets it
 * back to 0x80 immediately (dungeon-vertical.ts:521). It is a landing spot for a
 * frame, never a node. It is kept here as {@link canLand} because jump.ts needs
 * it verbatim.
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
 * `check_floor_for_landing` is the only test the engine makes for it, and it asks
 * one thing: is there ground under his middle foot? It does not ask whether his
 * body fits — so the hero comes to rest with a foot in rock whenever the middle one
 * lands on something, and the walk out of such a place is the game's to solve, not
 * the graph's. mp80's pit at (175,51) is that case: the row 53 shelf ends at
 * column 175, so his middle foot finds the floor at (176,54) while his left foot is
 * in the shelf. He leaves it by jumping — the rise takes him to (175,50), where
 * `move_hero_left_if_no_obstacles` finds his column clear — and the player drew
 * exactly that.
 *
 * So a node is "the hero stops here", and the body is asked about in the one place
 * the engine itself assumes it: his **middle column**. Every probe the jump and
 * the fall make reads that column — the landing check (dungeon-vertical.ts:488), the
 * ceiling above his head (`heroTL - 35`, one column right), the rope at his middle
 * and the two cells `left_default`/`right_default` look at while he is falling
 * (dungeon-input.ts:563-576) — so a cell whose middle column is inside rock is not
 * a position in this game at all, only a number in a grid. A hero may legitimately
 * have a *side* in rock; he may not have his middle in it.
 *
 * Holding up: ground under his middle foot, or an up current — see
 * {@link isStanding}.
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

/** Is the hero's middle column open over his three rows? */
function middleColumnFree(
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
 * Ground under his middle foot is the usual answer. An up current is the other
 * one, and it is not a small one: `check_airflows_on_hero` runs before
 * `airborne_movement` in every frame (dungeon-frame-pre.ts:88-113) and, finding a
 * jet in his three rows, sets `AIR_UP_TILE_FOUND`, which makes the landing check
 * and the descent both unreachable (dungeon-input.ts:515-517). A hero over a hole
 * that a current holds does not fall through it.
 *
 * mp80's row 21 is the case: at columns 94-96 the floor tile is `0x13`, which is
 * both passable and an up current, so the floor check finds nothing under the
 * middle foot — but `0x13` at his feet row holds him up, and the player walks west
 * along row 21 from column 100 to 91 through those three columns. Without this,
 * the walk breaks there and the only way across is a jump.
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
 * each, so a current anywhere in those three rows owns the hero every frame —
 * two columns sideways, with no test beyond the one `move_hero_*_if_no_obstacles`
 * makes.
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
 * A cell a sideways current holds is not one he comes to rest in: the moment he
 * stops there he is pushed out of it again, so neither a step, a jump nor a fall
 * may *enter* it against the blow. The mirror of {@link heroInLift}, which is
 * what stops a fall ending inside a jet.
 *
 * mp82's row-44 gallery is the case the player found: a current blowing west
 * across columns 137..141 sealed the corridor, and the graph still offered
 * `WALK (134,44) -> (142,44)` across it — and, once that was closed, a chain of
 * `FALL` edges drifting two columns east a hop through the same seal.
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
 * (asm/fight.asm:1087), which is also what steers him in mid-air: both
 * `left_up_pressed` (dungeon-input.ts:341) and the in-flight branch of
 * `airborne_movement` (dungeon-input.ts:574, 591) end in one of these calls.
 *
 * Note which column each one tests. Going right it probes `heroTL + 2`, going
 * left `heroTL` — in both cases a column the hero *already* occupies, on the
 * side he faces. The column he is about to enter is never examined; `hero_moves_right`
 * simply shifts the window and puts him there. `hero_interaction_check`, which
 * would push him back out, bails out while he is airborne (dungeon-hero.ts:276)
 * and so never corrects a flight.
 *
 * The consequence is that a hero can end a frame one column inside rock, and can
 * never advance a second column into it, because the next step tests the column
 * he just entered. Anything that wants the conservative reading — is this whole
 * 3x3 clear — wants {@link heroBoxFree} instead.
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
