/**
 * airflows.mjs — current tables, lift columns and conveyor runs.
 *
 * Semantics come from engine/dungeon-frame-pre.ts:40-71 and §2.12 of the plan:
 *
 *   checkAirflowsOnHero probes the hero's MIDDLE column (heroLeftCol + 1) at
 *   three rows — feet, body, head — every frame, and dispatchAirflows responds:
 *
 *     up    -> moveHeroUp() x2                      (2 rows/frame, NO collision test)
 *     left  -> moveHeroLeftIfNoObstacles() x2       (2 cols/frame, collision-checked)
 *     right -> moveHeroRightIfNoObstacles() x2      (2 cols/frame, collision-checked)
 *
 * Two consequences the graph must respect:
 *
 *   1. The lift ignores solidity, so a lift run is collected over every up-tile
 *      in the column regardless of whether it is passable. A jet is usually
 *      drawn as solid decoration above a single passable cell, and that solid
 *      part is exactly what the lift carries the hero through.
 *   2. Currents block movement against themselves — isLeftAirflow in
 *      moveHeroRightIfNoObstacles and isRightAirflow in the left-hand version
 *      (dungeon-hero.ts:231, 238, 258, 264). That is a constraint on the WALK
 *      generator, handled in nav-graph, not here.
 *
 * Classification order is up, then left, then right, and tile 0 is never a
 * current — exactly getAirflowDirection (dungeon-entities.ts:112-131). A tile
 * listed in two groups takes the first; no shipped tile is double-listed, so the
 * precedence is currently unobservable but must be preserved.
 */

import { MAP_HEIGHT } from './mdt.mjs';

export const AIRFLOW_NONE = -1;
export const AIRFLOW_UP = 0;
export const AIRFLOW_LEFT = 1;
export const AIRFLOW_RIGHT = 2;

/** Split the 12-byte seg1 table into three zero-terminated groups of four. */
export function splitAirflowTables(airflows) {
    const group = (lo) => {
        const out = [];
        for (let i = lo; i < lo + 4; i++) {
            const v = airflows[i] ?? 0;
            if (v === 0) break;
            out.push(v);
        }
        return out;
    };
    return { up: group(0), left: group(4), right: group(8) };
}

/**
 * Build a per-tile-direction classifier for one cavern.
 * @returns {(tile:number) => number} AIRFLOW_NONE / UP / LEFT / RIGHT
 */
export function makeClassifier({ up, left, right }) {
    return (tile) => {
        if (tile === 0) return AIRFLOW_NONE;
        if (up.includes(tile)) return AIRFLOW_UP;
        if (left.includes(tile)) return AIRFLOW_LEFT;
        if (right.includes(tile)) return AIRFLOW_RIGHT;
        return AIRFLOW_NONE;
    };
}

/**
 * @param {object} cavern result of readCavern
 * @param {number} mapHeight rows per map
 * @param {number[]} airflows raw 12-byte table from dungeons.ts
 */
export function buildAirflows(cavern, mapHeight = MAP_HEIGHT, airflows = []) {
    const tables = splitAirflowTables(airflows);
    const { tiles, header } = cavern;
    const w = header.mapWidth;
    const dirAt = (x, y) => {
        const tile = tiles[(((y % mapHeight) + mapHeight) % mapHeight) * w
            + ((((x % w) + w) % w))];
        if (tile === 0) return AIRFLOW_NONE;
        if (tables.up.includes(tile)) return AIRFLOW_UP;
        if (tables.left.includes(tile)) return AIRFLOW_LEFT;
        if (tables.right.includes(tile)) return AIRFLOW_RIGHT;
        return AIRFLOW_NONE;
    };

    // Maximal cyclic runs of up-tiles per column.
    const lifts = [];
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < mapHeight; y++) {
            if (dirAt(x, y) !== AIRFLOW_UP) continue;
            let len = 1;
            while (len < mapHeight && dirAt(x, y + len) === AIRFLOW_UP) len++;
            // fromY is the lowest row, toY the highest. `rows` is what the ride
            // costs; the ascent wraps when the run straddles row 0.
            lifts.push({ x, fromY: (y + len - 1) % mapHeight, toY: y, rows: len });
            y += len - 1;
        }
    }

    // Maximal cyclic runs of left/right-tiles per row. `cols` is the ride length.
    const conveyors = [];
    const addConveyors = (wanted, dir) => {
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < w; x++) {
                if (dirAt(x, y) !== wanted) continue;
                let len = 1;
                while (len < w && dirAt(x + len, y) === wanted) len++;
                conveyors.push({ y, x0: x, x1: (x + len - 1) % w, cols: len, dir });
                x += len - 1;
            }
        }
    };
    addConveyors(AIRFLOW_LEFT, 1);
    addConveyors(AIRFLOW_RIGHT, 2);

    return { ...tables, lifts, conveyors, classifier: makeClassifier(tables) };
}
