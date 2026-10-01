/**
 * airflows.ts — the runtime current model.
 *
 * Turns the pre-calculated tables in data/nav/nav-airflows.ts into concrete
 * **current regions**: the lifts that carry the hero upward and the conveyors that
 * sweep him sideways, each resolved against the decoded map.
 *
 * How a current acts (engine/dungeon-frame-pre.ts:40-71): every frame
 * `checkAirflowsOnHero` probes the hero's **middle column** at three rows — feet,
 * body, head — and `dispatchAirflows` responds:
 *
 *   up    moveHeroUp() x2                  2 rows per frame, NO collision test
 *   left  moveHeroLeftIfNoObstacles() x2    2 columns per frame, collision-checked
 *   right moveHeroRightIfNoObstacles() x2   2 columns per frame, collision-checked
 *
 * Two consequences the graph must respect, both handled in nav/graph rather than
 * here (docs/PATHFINDER_PLAN.md §7.4):
 *
 *   - the lift passes through solid geometry, so a lift run is collected over
 *     every up tile regardless of passability;
 *   - while lifted the hero cannot fall or jump, but can step sideways out.
 *
 * This module's job is to say *where* the hero can be taken and *where* he can get
 * off. Reachable set aside, the hero waits, so no clock is needed.
 *
 * The level-5 monster rule — where a left current is a wall for monsters
 * (dungeon-entities.ts:160-172) — is deliberately not modelled: monsters are not
 * obstacles here.
 */

import { NAV_AIRFLOWS, type NavAirflowTables } from '../../data/nav/nav-airflows.js';
import { NAV_MAP_BY_ID } from '../../data/nav/nav-maps.js';
import type { NavTileGrid } from './mdt-grid.js';
import { NavTileClassifier } from './attributes.js';
import { NAV } from './types.js';
import { heroBoxFree, heroInLift, wrapCol, wrapRow } from './geometry.js';

/** Rows per tick a lift and a conveyor move the hero. */
export const LIFT_ROWS_PER_TICK = 2;
export const CONVEYOR_COLS_PER_TICK = 2;

/** A cell the hero can be lifted from, and the row he arrives at if he holds on. */
export interface LiftStop {
    /** Hero left column. */
    readonly leftCol: number;
    /** Hero head row at this stop. */
    readonly headRow: number;
    /** Cost in ticks to be carried from the previous stop. */
    readonly ticks: number;
    /** True when the hero can stand here and leave the current. */
    readonly escapable: boolean;
}

export interface LiftModel {
    /** The current's column; the hero's middle column rides over it. */
    readonly x: number;
    readonly stops: readonly LiftStop[];
    /** Row the hero reaches if he holds on to the top of the run. */
    readonly topRow: number;
    readonly rows: number;
}

export interface ConveyorModel {
    readonly y: number;
    readonly dir: number;
    readonly columns: readonly number[];
    /** Columns from which the hero can step off, with the column he lands on. */
    readonly exits: readonly { fromColumn: number; toColumn: number; ticks: number }[];
}

export interface AirflowModel {
    readonly mapId: number;
    readonly lifts: readonly LiftModel[];
    readonly conveyors: readonly ConveyorModel[];
}

/** Can the hero stand at this position? */
function standing(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    leftCol: number,
    headRow: number,
): boolean {
    return heroBoxFree(grid, classifier, leftCol, headRow);
}

/**
 * Build the current model for one map.
 *
 * A lift column is the hero's **middle** column, so a lift sitting at map column `c`
 * is ridden with `leftCol = c - 1`.
 */
export function buildAirflowModel(mapId: number, grid: NavTileGrid): AirflowModel {
    const tables: NavAirflowTables | undefined = NAV_AIRFLOWS[mapId];
    const meta = NAV_MAP_BY_ID.get(mapId);
    if (!tables) throw new Error(`no generated airflow tables for map ${mapId}`);
    const classifier = NavTileClassifier.forMap(mapId);
    const mapWidth = meta?.mapWidth ?? grid.mapWidth;

    const lifts: LiftModel[] = [];
    for (const lift of tables.lifts) {
        // The hero rides with his middle column over the current, so a lift at map
        // column `x` is ridden with his left column at `x - 1`.
        const leftCol = wrapCol(lift.x - 1, mapWidth);

        // `fromY` is the lowest row of the run. The current must sit *inside* the
        // hero's three probed rows — head, body, feet — so the lowest position he
        // can be lifted from has the current under his feet, at headRow = fromY-2.
        // (Platforms use row-3 because the platform is beneath him; a current is
        // the one thing that acts on his body.)
        const stops: LiftStop[] = [];
        const visited = new Set<number>();
        let headRow = wrapRow(lift.fromY - 2);
        for (let step = 0; step <= lift.rows + 4; step++) {
            if (visited.has(headRow)) break;    // wrapped all the way round
            visited.add(headRow);
            stops.push({
                leftCol,
                headRow,
                ticks: step * LIFT_ROWS_PER_TICK,
                escapable: standing(grid, classifier, leftCol, headRow),
            });
            // Hold on only while the engine would still be lifting him.
            if (!stillLifted(grid, classifier, leftCol, headRow)) break;
            headRow = wrapRow(headRow - LIFT_ROWS_PER_TICK);
        }
        if (stops.length === 0) continue;
        lifts.push({
            x: lift.x,
            stops,
            topRow: wrapRow(lift.toY - 2),
            rows: lift.rows,
        });
    }

    const conveyors: ConveyorModel[] = [];
    for (const run of tables.conveyors) {
        const columns = Array.from({ length: run.cols }, (_, i) => wrapCol(run.x0 + i, mapWidth));
        const exits: { fromColumn: number; toColumn: number; ticks: number }[] = [];
        // He is swept downstream and can step off at any column where a standing
        // position exists; the sweep is collision-checked in game, so an exit is
        // only offered where the hero could actually be at that column.
        for (let i = 0; i < columns.length; i++) {
            const column = columns[i]!;
            // A current acts on the hero's body, so the cell must be inside his
            // three probed rows: the lowest place he can be swept from has it
            // under his feet, at headRow = y - 2. (Platforms use row-3.)
            if (!standing(grid, classifier, column, wrapRow(run.y - 2))) continue;
            exits.push({
                fromColumn: column,
                toColumn: column,
                ticks: Math.ceil(i / CONVEYOR_COLS_PER_TICK),
            });
        }
        if (exits.length === 0) continue;
        conveyors.push({ y: run.y, dir: run.dir, columns, exits });
    }

    return { mapId, lifts, conveyors };
}

/**
 * Is the hero still in a lift at this head row?
 *
 * `checkAirflowsOnHero` probes his middle column at three rows — head, body, feet —
 * and stops the moment none of them holds an up current. The lift moves him two
 * rows per tick, so the probe walks up in steps of two.
 */
function stillLifted(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    leftCol: number,
    headRow: number,
): boolean {
    return heroInLift(grid, classifier, leftCol, headRow);
}

/** Re-exported so a caller can classify a cell without a second import. */
export { NAV };
