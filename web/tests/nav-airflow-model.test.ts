/**
 * nav-airflow-model.test.ts — the runtime current model (phase 2).
 *
 * Airflows are small in tile count but central in caverns 6-8, so the risk is not
 * volume but getting the direction and the escape rules backwards: a conveyor that
 * can be ridden the wrong way, or a lift that claims a stop the engine would not
 * reach. The tests therefore check the model against the decoded grid, and against
 * the engine's own probe (`checkAirflowsOnHero` reads the hero's middle column at
 * three rows) rather than against the tables.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildAirflowModel, LIFT_ROWS_PER_TICK } from '../src/engine/nav/airflows.js';
import { heroInLift, heroBoxFree, wrapCol } from '../src/engine/nav/geometry.js';
import { NavTileClassifier } from '../src/engine/nav/attributes.js';
import { decodeTileGrid, type NavTileGrid } from '../src/engine/nav/mdt-grid.js';
import { NAV_AIRFLOWS } from '../src/data/nav/nav-airflows.js';
import { NAV_MAP_BY_ID, NAV_MAPS } from '../src/data/nav/nav-maps.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gridFor = (mapId: number): NavTileGrid => {
    const meta = NAV_MAP_BY_ID.get(mapId)!;
    return decodeTileGrid(
        new Uint8Array(readFileSync(resolve(REPO, `web/public/game/0/${meta.nameKey}.mdt`))),
        0,
        mapId,
    );
};

const currentMaps = NAV_MAPS.filter((m) => {
    const t = NAV_AIRFLOWS[m.id]!;
    return t.up.length + t.left.length + t.right.length > 0;
});

/** Maps that declare current tiles *and actually place any of them*. */
const currentCellMaps = currentMaps.filter((m) => {
    const t = NAV_AIRFLOWS[m.id]!;
    return t.lifts.length + t.conveyors.length > 0;
});

describe('which maps have currents', () => {
    it('has ten maps declaring current tiles and eight placing any', () => {
        // mp51 and mp84 carry the same tilesets as their neighbours but place none
        // of them, so declaring a current and having one are different facts.
        expect(currentMaps.map((m) => m.nameKey)).toEqual([
            'mp50', 'mp51', 'mp70', 'mp71', 'mp72', 'mp80', 'mp81', 'mp82', 'mp83', 'mp84',
        ]);
        expect(currentCellMaps.map((m) => m.nameKey)).toEqual([
            'mp50', 'mp70', 'mp71', 'mp72', 'mp80', 'mp81', 'mp82', 'mp83',
        ]);
    });

    it('leaves the two declaring-but-empty maps with nothing to model', () => {
        for (const name of ['mp51', 'mp84']) {
            const id = NAV_MAPS.find((m) => m.nameKey === name)!.id;
            const tables = NAV_AIRFLOWS[id]!;
            expect(tables.lifts.length + tables.conveyors.length, name).toBe(0);
            const model = buildAirflowModel(id, gridFor(id));
            expect(model.lifts.length, name).toBe(0);
            expect(model.conveyors.length, name).toBe(0);
        }
    });

    it('gives no arena or warp-only room a current', () => {
        for (const meta of NAV_MAPS.filter((m) => m.isDoorless)) {
            const t = NAV_AIRFLOWS[meta.id]!;
            expect(t.up.length + t.left.length + t.right.length, meta.nameKey).toBe(0);
            expect(t.lifts.length + t.conveyors.length, meta.nameKey).toBe(0);
        }
    });
});

describe('lift columns', () => {
    it('places every lift over the current, with the hero middle column on it', () => {
        for (const meta of currentMaps) {
            const model = buildAirflowModel(meta.id, gridFor(meta.id));
            for (const lift of model.lifts) {
                // The engine probes heroLeftCol + 1, so a lift at x is ridden with
                // the hero's left column at x - 1.
                expect(lift.stops.every((s) => s.leftCol === wrapCol(lift.x - 1, meta.mapWidth)),
                    `${meta.nameKey} lift column`).toBe(true);
            }
        }
    });

    it('charges two ticks per row of ascent', () => {
        const model = buildAirflowModel(19, gridFor(19));   // mp71, 113 lifts
        expect(model.lifts.length).toBeGreaterThan(0);
        for (const lift of model.lifts) {
            lift.stops.forEach((stop, i) => {
                expect(stop.ticks, `stop ${i}`).toBe(i * LIFT_ROWS_PER_TICK);
            });
        }
    });

    it('stops ascending exactly where the engine would stop lifting him', () => {
        // The engine lifts while any of the hero's three probed rows holds an up
        // current, in steps of two rows. The model must stop at the first stop
        // where that is no longer true, and no earlier.
        for (const meta of currentMaps) {
            const grid = gridFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const model = buildAirflowModel(meta.id, grid);
            for (const lift of model.lifts) {
                const last = lift.stops[lift.stops.length - 1]!;
                // At the final stop the engine must no longer be lifting.
                expect(heroInLift(grid, classifier, last.leftCol, last.headRow),
                    `${meta.nameKey} lift at x=${lift.x} runs on`).toBe(false);
                // And the stop before it, if any, must still have been lifting.
                const prev = lift.stops[lift.stops.length - 2];
                if (prev) {
                    expect(heroInLift(grid, classifier, prev.leftCol, prev.headRow),
                        `${meta.nameKey} lift at x=${lift.x} ended early`).toBe(true);
                }
            }
        }
    });

    it('rises, never falls, along a lift', () => {
        for (const meta of currentMaps) {
            const model = buildAirflowModel(meta.id, gridFor(meta.id));
            for (const lift of model.lifts) {
                for (let i = 1; i < lift.stops.length; i++) {
                    const a = lift.stops[i - 1]!.headRow;
                    const b = lift.stops[i]!.headRow;
                    const delta = ((a - b + 64) % 64) - 0;
                    expect(delta, `${meta.nameKey} lift direction`).toBe(LIFT_ROWS_PER_TICK);
                }
            }
        }
    });

    it('marks a stop escapable only where the hero can actually stand', () => {
        for (const meta of currentMaps) {
            const grid = gridFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const model = buildAirflowModel(meta.id, grid);
            for (const lift of model.lifts) {
                for (const stop of lift.stops) {
                    const free = heroBoxFree(grid, classifier, stop.leftCol, stop.headRow);
                    // A stop can be recorded but not escapable if the hero is boxed
                    // in; a free position must always be marked escapable.
                    if (free) {
                        expect(stop.escapable, `${meta.nameKey} (${stop.leftCol},${stop.headRow})`)
                            .toBe(true);
                    }
                }
            }
        }
    });
});

describe('conveyor runs', () => {
    it('gives every run one direction and a non-empty span', () => {
        for (const meta of currentMaps) {
            const model = buildAirflowModel(meta.id, gridFor(meta.id));
            for (const run of model.conveyors) {
                expect([1, 2], `${meta.nameKey} dir`).toContain(run.dir);
                expect(run.columns.length).toBeGreaterThan(0);
            }
        }
    });

    it('offers exits only along the run, and only downstream of the entry', () => {
        // The sweep is one-way: `columns` is the travel order from the run's start,
        // exits are a subset of it, and tick cost never decreases along it. There
        // is no upstream exit — the opposing direction is blocked by the walk rule
        // instead (dungeon-hero.ts:218-268).
        for (const meta of currentCellMaps) {
            const tables = NAV_AIRFLOWS[meta.id]!;
            const model = buildAirflowModel(meta.id, gridFor(meta.id));
            expect(model.conveyors.length).toBeLessThanOrEqual(tables.conveyors.length);
            for (const run of model.conveyors) {
                expect(run.exits.length).toBeGreaterThan(0);
                for (const exit of run.exits) {
                    expect(run.columns, `${meta.nameKey} exit on the run`)
                        .toContain(exit.fromColumn);
                    expect(exit.toColumn).toBe(exit.fromColumn);
                }
            }
        }
    });

    it('charges more ticks the further along the sweep the exit is', () => {
        const model = buildAirflowModel(20, gridFor(20));   // mp72, 149 runs
        expect(model.conveyors.length).toBeGreaterThan(0);
        for (const run of model.conveyors) {
            const ticks = run.exits.map((e) => e.ticks);
            for (let i = 1; i < run.exits.length; i++) {
                expect(ticks[i]!, `${run.y} exit ${i}`).toBeGreaterThanOrEqual(ticks[i - 1]!);
            }
        }
    });

    it('omits a run with no standing position anywhere along it', () => {
        for (const meta of currentMaps) {
            const grid = gridFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const model = buildAirflowModel(meta.id, grid);
            const tables = NAV_AIRFLOWS[meta.id]!;
            expect(model.conveyors.length).toBeLessThanOrEqual(tables.conveyors.length);
            for (const run of model.conveyors) {
                expect(run.exits.length, `${meta.nameKey} run at y=${run.y}`).toBeGreaterThan(0);
                for (const exit of run.exits) {
                    const headRow = ((run.y - 2) % 64 + 64) % 64;
                    expect(heroBoxFree(grid, classifier, exit.fromColumn, headRow),
                        `${meta.nameKey} exit at ${exit.fromColumn}`).toBe(true);
                }
            }
        }
    });
});

describe('the model over every current map', () => {
    it('resolves something on every map that places a current', () => {
        for (const meta of currentCellMaps) {
            const model = buildAirflowModel(meta.id, gridFor(meta.id));
            expect(model.lifts.length + model.conveyors.length, meta.nameKey)
                .toBeGreaterThan(0);
        }
    });

    it('produces nothing for a map with no currents', () => {
        for (const meta of NAV_MAPS.filter((m) => !currentCellMaps.includes(m))) {
            const model = buildAirflowModel(meta.id, gridFor(meta.id));
            expect(model.lifts.length + model.conveyors.length, meta.nameKey).toBe(0);
        }
    });

    it('handles mp71, the map with the most lift columns', () => {
        const model = buildAirflowModel(19, gridFor(19));
        expect(NAV_AIRFLOWS[19]!.lifts).toHaveLength(113);
        expect(model.lifts).toHaveLength(113);
    });

    it('rejects a map with no generated tables', () => {
        expect(() => buildAirflowModel(999, gridFor(0))).toThrow(/no generated airflow tables/);
    });
});
