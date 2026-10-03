/**
 * nav-graph.test.ts — the navigation graph builder (phase 3).
 *
 * The graph is the thing every later stage trusts, so these tests check the
 * *invariants* rather than reproducing the builder: that a node is a position the
 * hero can occupy, that an edge is a traversal the engine actually permits, and
 * that the three airflow suppression rules of docs/PATHFINDER_PLAN.md §7.4 hold.
 *
 * Anything that says "no" here would send the player into rock or let a current
 * throw him the wrong way, so the checks are deliberately exhaustive over all 31
 * caverns rather than sampled.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    buildNavGraph, edgesOf, forEachEdge, nodeAt,
    NODE_GROUND, NODE_ROPE, NODE_RIDE,
} from '../src/engine/nav/nav-graph.js';
import { buildPlatformModel, isLandingSlot } from '../src/engine/nav/platforms.js';
import { liftSweptCell } from '../src/engine/nav/nav-graph.js';import { decodeTileGrid } from '../src/engine/nav/mdt-grid.js';
import { NavTileClassifier } from '../src/engine/nav/attributes.js';
import { JumpModel, LANDING_STRIDE, readLanding } from '../src/engine/nav/jump.js';
import {
    blockedByCounterCurrent, heroBoxFree, heroInLift, isStanding, wrapCol,
} from '../src/engine/nav/geometry.js';
import { CAP, EDGE, EDGE_NAMES } from '../src/engine/nav/types.js';
import { NAV_MAPS, NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { NAV_PLATFORMS } from '../src/data/nav/nav-platforms.js';
import { PORTALS } from '../src/data/nav/nav-portals.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const gridFor = (mapId: number) => {
    const meta = NAV_MAP_BY_ID.get(mapId)!;
    return decodeTileGrid(
        new Uint8Array(readFileSync(resolve(REPO, `web/public/game/0/${meta.nameKey}.mdt`))),
        0, mapId,
    );
};

/** Built once per map; the builder is deterministic and the suite needs them all. */
const graphs = new Map<number, ReturnType<typeof buildNavGraph>>();
for (const meta of NAV_MAPS) graphs.set(meta.id, buildNavGraph(meta.id, gridFor(meta.id)));
const graphFor = (mapId: number) => graphs.get(mapId)!;

describe('nodes are positions the hero can occupy', () => {
    it('gives every ground node a free body and support', () => {
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const grid = gridFor(meta.id);
            for (const node of graph.nodes) {
                if (node.kind !== NODE_GROUND) continue;
                expect(isStanding(grid, classifier, node.col, node.row),
                    `${meta.nameKey} (${node.col},${node.row})`).toBe(true);
            }
        }
    });

    it('gives every rope node a rope through his middle column and a free body', () => {
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const grid = gridFor(meta.id);
            for (const node of graph.nodes) {
                if (node.kind !== NODE_ROPE) continue;
                // tryClimbRope probes heroCoords + 1: the middle column at the
                // hero's HEAD row (dungeon-vertical.ts:199-202).
                const tile = grid.tiles[node.row * meta.mapWidth + wrapCol(node.col + 1, meta.mapWidth)]!;
                expect(tile === 1 || tile === 2,
                    `${meta.nameKey} rope (${node.col},${node.row}) tile ${tile}`).toBe(true);
                expect(heroBoxFree(grid, classifier, node.col, node.row),
                    `${meta.nameKey} rope box`).toBe(true);
            }
        }
    });

    it('never carries a hero off a rope against the direction he stepped', () => {
        // Leaving a rope is two tiles in the direction he steps, because his head is
        // centred over the rope and the rope is his middle column — the cliff edge is
        // the cell past it. Where a wall denies him the two-tile move he takes one and
        // then falls holding the same key, so he may drift **that** way, which is one
        // column per row of descent, and never the other.
        //
        // (Before the two-tile move was modelled, 6,874 of mp30's 13,387 rope-exit
        // edges moved four columns or more sideways and most of those were drifts in
        // whichever direction happened to be shortest.)
        const IS_FALL: number[] = [EDGE.FALL];
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const width = meta.mapWidth;
            for (const node of graph.nodes) {
                if (node.kind !== NODE_ROPE) continue;
                const index = graph.nodes.indexOf(node);
                forEachEdge(graph, index, (edge) => {
                    const to = graph.nodes[edge.to]!;
                    const raw = to.col - node.col;
                    const lateral = ((raw % width) + width * 1.5) % width - width * 0.5;
                    // The exit itself: two tiles at most.
                    if (!IS_FALL.includes(edge.kind)) {
                        expect(Math.abs(lateral),
                            `${meta.nameKey} rope (${node.col},${node.row}) -> `
                            + `(${to.col},${to.row}) steps ${lateral} columns`).toBeLessThanOrEqual(2);
                        return;
                    }
                    // A fall: the two-tile exit, one more column for the first pose as
                    // it leaves the rope row, then 45 degrees — and never drifting back
                    // across the rope, because the descent is locked to the direction he
                    // stepped in.
                    const descent = (((to.row - node.row) % 64) + 64) % 64;
                    expect(Math.abs(lateral),
                        `${meta.nameKey} rope (${node.col},${node.row}) -> `
                        + `(${to.col},${to.row}) drifts ${lateral} columns over ${descent} rows`)
                        .toBeLessThanOrEqual(3 + descent);
                });
            }
        }
    });

    it('gives every ride node a slot from the platform model', () => {
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const slots = graph.platforms.slots;
            let rideNodes = 0;
            for (const node of graph.nodes) {
                if (node.kind !== NODE_RIDE) continue;
                rideNodes++;
                const slot = slots[node.platform]!;
                expect(slot.leftCol).toBe(node.col);
                expect(slot.headRow).toBe(node.row);
            }
            expect(rideNodes).toBe(slots.length);
        }
    });

    it('leaves a platform reachable from something', () => {
        // The hero gets onto a platform two ways in the engine: he lands on it — a
        // platform tile blocks `is_blocking_tile_simple`, so the floor check stops
        // him there — or he rides there from another slot. `landingAt` prefers the
        // platform over the ground at a cell, and the jump model is handed the
        // standing slots so a flight can end on one.
        //
        // What it cannot do is walk on: `move_hero_right_if_no_obstacles` tests the
        // body, and a platform blocks it. So a slot's only entries are those two,
        // and the ones with neither are platform positions nothing can reach.
        //
        // [measured] 5107 of 5589 slots have an entry. Before the jump model was
        // derived from the engine, 5403 did — but the extra entries were jumps whose
        // arcs the old apex test had invented, and the 29 BOARD edges that
        // disappeared with them went to ground nodes the hero cannot stand on: a
        // platform occupies its own row, so there is never static ground under one.
        let live = 0;
        let total = 0;
        void nodeAt;
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const entries = new Set<number>();
            for (let from = 0; from < graph.nodes.length; from++) {
                forEachEdge(graph, from, (edge) => entries.add(edge.to));
            }
            for (let i = 0; i < graph.nodes.length; i++) {
                if (graph.nodes[i]!.kind !== NODE_RIDE) continue;
                total++;
                if (entries.has(i)) live++;
            }
        }
        expect(total).toBe(5589);
        // 367 dead slots, from three corrections.
        //
        // First, a vertical lift used to be linked along `slot.next` only, which walks
        // the chain in one direction, so every lift could be ridden down but never up
        // and the top of it had no way in: 194 to 185.
        //
        // Then a slot became a landing surface only where its platform is standing.
        // That is one slot among the vertical and collapsing families — `chain` already
        // links every slot of a multi-row platform to its neighbour, so riding is the
        // entry that survives, and landing was only ever the entry for a platform with
        // a single rideable row.
        //
        // And 181 more among horizontal platforms, which is the same rule and the
        // correction that came with it. A horizontal platform is standing at its
        // `startX` like any other, so only that column of its span is a landing; the
        // rest is rideable and boardable from beside it, and no longer a place a
        // falling hero can be dropped onto. Those slots were reachable before by a
        // flight that ends in mid-air over a platform fifteen columns from where it
        // is. mp10's row-43 platform is the case: `(6,32) -> (7,40)` was a fall onto
        // column 9 of a platform standing at column 7, and then a run of two-column
        // "rides" along a span he had no way to be on.
        expect(live, 'ride slots with no entry at all').toBe(5222);
        expect(total - live, 'ride slots nothing can land on or ride to').toBe(367);
    });

    it('finds standing positions on the biggest caverns', () => {
        for (const id of [8, 14]) {
            expect(graphFor(id).stats.ground, NAV_MAP_BY_ID.get(id)!.nameKey)
                .toBeGreaterThan(1000);
        }
    });

    it('remembers where every lift has the hero swept', () => {
        // A lift edge has to carry the cell the hero is swept at, because that cell is
        // what the drawn line is: the approach is a flight to it, and the rest is
        // straight up its column. Without it the overlay can only join the two ends,
        // which is a straight line through the cavern.
        let lifts = 0;
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            graph.nodes.forEach((node, from) => {
                forEachEdge(graph, from, (edge) => {
                    if (edge.kind !== EDGE.LIFT) return;
                    lifts++;
                    const swept = liftSweptCell(graph, from, edge.to);
                    expect(swept, `${meta.nameKey} LIFT (${node.col},${node.row}) -> `
                        + `(${graph.nodes[edge.to]!.col},${graph.nodes[edge.to]!.row})`)
                        .toBeGreaterThanOrEqual(0);
                    // An up current only carries him up its own column, so the sweep
                    // and the exit must share one.
                    expect(swept % meta.mapWidth, 'the exit is in the swept column')
                        .toBe(graph.nodes[edge.to]!.col);
                    expect(heroInLift(gridFor(meta.id), NavTileClassifier.forMap(meta.id),
                        swept % meta.mapWidth, (swept / meta.mapWidth) | 0),
                    'and the hero really is swept there').toBe(true);
                });
            });
        }
        expect(lifts, 'the game has lifts').toBeGreaterThan(8000);
    });

    it('will not fly a jump onto a lift that is standing somewhere else', () => {
        // The reported case: mp80 `(6,37) -> (1,33) JUMP_HIGH`, where the column 1
        // lift rests at row 34 and the arc went straight through `(3,34)` to land on
        // top of it. A platform is three solid tiles — it stops
        // `is_blocking_tile_simple`, so the model marks its resting cells the same way
        // the map's own rock — and it offers a landing only on the row it is at.
        //
        // Deliberately *not* stated as "no flight crosses a platform tile". The engine
        // tests one cell on a rise and one column on a step, so a hero does clip
        // scenery in a real jump — jump.ts says so, and a model that refused it would
        // refuse the player's route. What must not happen is landing on the far side
        // of a platform, which is what this checks.
        const meta = NAV_MAP_BY_ID.get(23)!;
        const graph = graphFor(23);
        const lift = NAV_PLATFORMS[23]!.vertical.find((p) => p.x === 1)!;
        expect(lift.startY, 'the lift rests at row 34').toBe(34);

        // Its three tiles are solid, so nothing can pass through them.
        const solidAt = (col: number, row: number): boolean =>
            graph.platforms.restingCells[row * meta.mapWidth + col] === 1;
        expect([1, 2, 3].map((c) => solidAt(c, 34))).toEqual([true, true, true]);

        // And only its resting row is a landing surface.
        const slots = graph.platforms.slots.filter(
            (s) => s.kind !== 2 && s.leftCol === 1,
        );
        expect(slots.length, 'the lift has slots all along its travel').toBeGreaterThan(1);
        const landing = slots.filter((s) => isLandingSlot(s));
        expect(landing.map((s) => s.pos)).toEqual([34]);

        // So the reported arc is gone: nothing from (6,37) reaches any of its slots.
        const from = nodeAt(graph, 6, 37);
        expect(from, 'the reported take-off is a standing position').toBeGreaterThanOrEqual(0);
        const reached = new Set<string>();
        forEachEdge(graph, from!, (edge) => {
            const node = graph.nodes[edge.to]!;
            if (slots.some((s) => s.headRow === node.row)) reached.add(`${node.col},${node.row}`);
        });
        expect([...reached]).toEqual([]);
    });
});

describe('edge integrity', () => {
    it('points every edge at a real node, never at itself', () => {
        // Accumulate rather than assert per edge: 200k expect() calls would cost
        // seconds of runner overhead for no extra information.
        const bad: string[] = [];
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            for (let from = 0; from < graph.nodes.length; from++) {
                forEachEdge(graph, from, (edge) => {
                    if (edge.to < 0 || edge.to >= graph.nodes.length || edge.to === from) {
                        if (bad.length < 10) {
                            bad.push(`${meta.nameKey}: ${from} -> ${edge.to}`);
                        }
                    }
                });
            }
        }
        expect(bad).toEqual([]);
    });

    it('charges a positive cost on every edge', () => {
        // Collected and asserted once: there are 800,000-odd edges across the game,
        // and an `expect` per edge took longer than the test timeout on its own.
        const bad: string[] = [];
        for (const meta of NAV_MAPS) {
            for (const edge of graphFor(meta.id).edges) {
                if (edge.cost > 0) continue;
                bad.push(`${meta.nameKey} ${EDGE_NAMES[edge.kind]} costs ${edge.cost}`);
            }
        }
        expect(bad).toEqual([]);
    });

    it('keeps the CSR offsets consistent with the edge list', () => {
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            expect(graph.edgeOffsets.length).toBe(graph.nodes.length + 1);
            expect(graph.edgeOffsets[0]).toBe(0);
            expect(graph.edgeOffsets[graph.nodes.length]).toBe(graph.edges.length);
            let total = 0;
            for (let i = 0; i < graph.nodes.length; i++) {
                expect(graph.edgeOffsets[i + 1]!).toBeGreaterThanOrEqual(graph.edgeOffsets[i]!);
                total += graph.edgeOffsets[i + 1]! - graph.edgeOffsets[i]!;
            }
            expect(total).toBe(graph.edges.length);
        }
    });

    it('records only real portal indices on door edges', () => {
        for (const meta of NAV_MAPS) {
            for (const edge of graphFor(meta.id).edges) {
                if (edge.kind !== EDGE.DOOR) continue;
                const portal = PORTALS[edge.portal]!;
                expect(portal.mapId).toBe(meta.id);
                expect(portal.toTown).toBe(false);
                // A single map's grid can only carry a door that stays on the map.
                expect(portal.destMapId).toBe(meta.id);
            }
        }
    });

    it('charges more for a locked door and demands the right key', () => {
        for (const meta of NAV_MAPS) {
            for (const edge of graphFor(meta.id).edges) {
                if (edge.kind !== EDGE.DOOR) continue;
                const portal = PORTALS[edge.portal]!;
                if (portal.key === 2) {
                    expect(edge.cost).toBeGreaterThan(44);
                    expect(edge.req & CAP.LION_KEY).toBeTruthy();
                } else if (portal.key === 1) {
                    expect(edge.cost).toBe(44);
                    expect(edge.req & CAP.KEY).toBeTruthy();
                } else {
                    expect(edge.req).toBe(0);
                }
            }
        }
    });
});

describe('the airflow suppression rules', () => {
    it('never walks into a current that opposes the move', () => {
        const bad: string[] = [];
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const grid = gridFor(meta.id);
            graph.nodes.forEach((node, index) => {
                forEachEdge(graph, index, (edge) => {
                    if (edge.kind !== EDGE.WALK && edge.kind !== EDGE.STEP) return;
                    const target = graph.nodes[edge.to]!;
                    // Signed, and by however many columns: leaving a rope is a two-tile
                    // move, so testing `node.col + 1 === target.col` would call a
                    // rightward exit leftward and flag every current it moved with.
                    const raw = target.col - node.col;
                    const shift = ((raw % meta.mapWidth) + meta.mapWidth * 1.5) % meta.mapWidth
                        - meta.mapWidth * 0.5;
                    const dir = shift > 0 ? 1 : shift < 0 ? -1 : 0;
                    if (dir === 0) return;
                    if (blockedByCounterCurrent(grid, classifier, target.col, target.row, dir)) {
                        bad.push(`${meta.nameKey} (${node.col},${node.row})->(${target.col},${target.row})`);
                    }
                });
            });
        }
        expect(bad).toEqual([]);
    });

    it('never falls or jumps out of a lift column', () => {
        const bad: string[] = [];
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const grid = gridFor(meta.id);
            graph.nodes.forEach((node, index) => {
                if (!heroInLift(grid, classifier, node.col, node.row)) return;
                forEachEdge(graph, index, (edge) => {
                    if (edge.kind === EDGE.FALL || edge.kind === EDGE.JUMP || edge.kind === EDGE.JUMP_HIGH) {
                        bad.push(`${meta.nameKey} (${node.col},${node.row}) has ${EDGE_NAMES[edge.kind]}`);
                    }
                });
            });
        }
    });

    it('never drops the hero into a current, because a current pushes', () => {
        const bad: string[] = [];
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const grid = gridFor(meta.id);
            graph.nodes.forEach((_, index) => {
                forEachEdge(graph, index, (edge) => {
                    if (edge.kind !== EDGE.FALL) return;
                    const target = graph.nodes[edge.to]!;
                    if (heroInLift(grid, classifier, target.col, target.row)) {
                        bad.push(`${meta.nameKey} fall into a lift at (${target.col},${target.row})`);
                    }
                });
            });
        }
        expect(bad).toEqual([]);
    });

    it('still lets the hero step sideways out of a lift', () => {
        let escape = 0;
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const grid = gridFor(meta.id);
            graph.nodes.forEach((node, index) => {
                if (!heroInLift(grid, classifier, node.col, node.row)) return;
                for (const edge of edgesOf(graph, index)) {
                    if (edge.kind === EDGE.WALK || edge.kind === EDGE.LIFT) escape++;
                }
            });
        }
        expect(escape).toBeGreaterThan(0);
    });
});

describe('jumps are the model\'s, not a table of guesses', () => {
    it('offers every jump edge the model finds', () => {
        // The graph used to enumerate offsets in a box and test an apex of its own
        // inventing. It now replays the engine's jump (see nav/jump.ts), so the
        // check is that the two agree: every edge in the graph is a landing the model
        // produces, and the model is asked the same way for every cavern.
        const bad: string[] = [];
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const grid = gridFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
// The same masks the graph hands the model, so a jump onto a platform
            // or into an up current is compared as a landing rather than reported
            // missing. A platform is marked under the hero's middle foot, three rows
            // below the slot, and only where the platform is standing right now; a
            // current is marked wherever `heroInLift` holds him. The tiles the
            // platforms are standing on come along too, or a flight the graph
            // refused because it passed through one looks possible here.
            const platforms = buildPlatformModel(meta.id, grid);
            const slots = new Uint8Array(meta.mapWidth * 64);
            for (const slot of platforms.slots) {
                if (!isLandingSlot(slot)) continue;
                slots[(slot.headRow + 3) * meta.mapWidth + wrapCol(slot.leftCol + 1, meta.mapWidth)] = 1;
            }
            const currents = new Uint8Array(meta.mapWidth * 64);
            for (let row = 0; row < 64; row++) {
                for (let col = 0; col < meta.mapWidth; col++) {
                    if (heroInLift(grid, classifier, col, row)) currents[row * grid.mapWidth + col] = 1;
                }
            }
            const model = new JumpModel(grid, classifier, slots, currents, platforms.restingCells);
            graph.nodes.forEach((node, index) => {

                let offered: Set<string> | null = null;
                forEachEdge(graph, index, (edge) => {
                    if (edge.kind !== EDGE.JUMP && edge.kind !== EDGE.JUMP_HIGH) return;
                    const target = graph.nodes[edge.to]!;
                    if (offered === null) {
                        // Rope nodes have no jumps at all: `jump_press_handler`
                        // returns while ON_ROPE_FLAGS is set, so there is nothing to
                        // ask the model for.
                        const landings = model.landingsFrom(node.col, node.row);
                        offered = new Set<string>();
                        for (let i = 0; i < landings.length; i += LANDING_STRIDE) {
                            const l = readLanding(landings, i / LANDING_STRIDE);
                            offered.add(`${l.col},${l.row}`);
                        }
                    }
                    if (!offered.has(`${target.col},${target.row}`)) {
                        bad.push(`${meta.nameKey} (${node.col},${node.row}) -> `
                            + `(${target.col},${target.row}) is not a landing the model gives`);
                    }
                });
            });
        }
        expect(bad).toEqual([]);
    }, 120000);

    it('covers no more ground than the frames it takes', () => {
        // The engine moves him one column and one row per frame and nothing else, so
        // a jump cannot cross further than its own length, and it always costs at
        // least a rise, the frame the rise stops on, and the landing check.
        const bad: string[] = [];
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            graph.nodes.forEach((node, index) => {
                forEachEdge(graph, index, (edge) => {
                    if (edge.kind !== EDGE.JUMP && edge.kind !== EDGE.JUMP_HIGH) return;
                    const target = graph.nodes[edge.to]!;
                    const across = Math.min(
                        Math.abs(node.col - target.col),
                        meta.mapWidth - Math.abs(node.col - target.col),
                    );
                    const up = Math.min(
                        Math.abs(node.row - target.row),
                        64 - Math.abs(node.row - target.row),
                    );
                    // One frame per rise, one for the frame the rise stopped on, and
                    // one for the landing check. A one-row hop stopped by a ceiling
                    // is the cheapest there is.
                    if (edge.cost < 3) {
                        bad.push(`${meta.nameKey} (${node.col},${node.row}) costs ${edge.cost}`);
                    }
                    if (across + 1 > edge.cost) {
                        bad.push(`${meta.nameKey} (${node.col},${node.row}) -> `
                            + `(${target.col},${target.row}) crosses ${across} columns in ${edge.cost} frames`);
                    }
                    if (up > edge.cost - 2) {
                        bad.push(`${meta.nameKey} (${node.col},${node.row}) -> `
                            + `(${target.col},${target.row}) rises ${up} rows in ${edge.cost} frames`);
                    }
                });
            });
        }
        expect(bad).toEqual([]);
    });

    it('only emits JUMP_HIGH for rows a plain jump cannot reach', () => {
        for (const meta of NAV_MAPS) {
            for (const edge of graphFor(meta.id).edges) {
                if (edge.kind !== EDGE.JUMP_HIGH) continue;
                expect(edge.req & CAP.JUMP_HIGH).toBeTruthy();
            }
        }
    });

    it('reaches further with JUMP_HIGH than with JUMP alone', () => {
        expect(graphFor(0).stats.byEdgeKind[EDGE.JUMP_HIGH] ?? 0).toBeGreaterThan(0);
    });
});

describe('slopes', () => {
    it('demands Silkarn shoes to climb and never to slide', () => {
        for (const meta of NAV_MAPS) {
            for (const edge of graphFor(meta.id).edges) {
                if (edge.kind === EDGE.SLOPE_UP) expect(edge.req & CAP.SLOPE_STAND).toBeTruthy();
                if (edge.kind === EDGE.SLOPE_DOWN) expect(edge.req).toBe(0);
            }
        }
    });
});

describe('platforms and currents are reachable in the graph', () => {
    it('links ride nodes along their platform', () => {
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            let linked = 0;
            graph.nodes.forEach((node, index) => {
                if (node.kind !== NODE_RIDE) return;
                for (const edge of edgesOf(graph, index)) {
                    if (edge.kind === EDGE.RIDE_V || edge.kind === EDGE.RIDE_H) linked++;
                }
            });
            if (graph.stats.ride > 0) expect(linked, meta.nameKey).toBeGreaterThan(0);
        }
    });

    it('can drop off every ride node', () => {
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            let ride = 0;
            let drop = 0;
            graph.nodes.forEach((_, index) => {
                if (graph.nodes[index]!.kind !== NODE_RIDE) return;
                ride++;
                for (const edge of edgesOf(graph, index)) {
                    if (edge.kind === EDGE.DROP || edge.kind === EDGE.ALIGHT) drop++;
                }
            });
            if (ride === 0) continue;
            expect(drop, `${meta.nameKey} ${ride} ride nodes`).toBeGreaterThan(0);
        }
    });

    it('reaches most lifts and conveyors somewhere across the game', () => {
        // Not every jet is usable: a current running through open space with no
        // standing position, rope or arc through it cannot be entered, and a
        // standing-positions-only node model cannot represent "airborne but
        // swept". The per-map shortfall is recorded in diagnostics.
        let lifts = 0;
        let liftsReachable = 0;
        let conveyors = 0;
        let conveyorsReachable = 0;
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            lifts += graph.currents.lifts.length;
            liftsReachable += graph.diagnostics.liftsReachable;
            conveyors += graph.currents.conveyors.length;
            conveyorsReachable += graph.diagnostics.conveyorsReachable;
        }
        expect(lifts).toBeGreaterThan(200);
        expect(conveyors).toBeGreaterThan(250);
        // [measured] 183 of 236 lifts, 198 of 288 conveyors. Lifts went up from 152
        // because a jet is now entered by the positions a jump actually flies
        // through, which is most of them: `lastTrace` walks the flight the model
        // built rather than sampling an arc between two landings. Conveyors went
        // down from 216 for the other side of the same change — the old sample
        // included cells no flight visits, and a conveyor he is not in does not
        // carry him. The unreachable ones run through open space with no standing
        // position on their own row, so the hero is carried past every exit. The
        // model declines rather than dropping him off the end of the world.
        expect(liftsReachable, `lifts reachable ${liftsReachable}/${lifts}`).toBe(235);
        expect(conveyorsReachable, `conveyors ${conveyorsReachable}/${conveyors}`)
            .toBe(206);
        expect(graphFor(0).stats.byEdgeKind[EDGE.LIFT] ?? 0).toBe(0);   // mp10 has no currents
        expect((graphFor(19).stats.byEdgeKind[EDGE.CARRY_L] ?? 0)
            + (graphFor(19).stats.byEdgeKind[EDGE.CARRY_R] ?? 0)).toBeGreaterThan(0);
    });

    it('emits both conveyor directions where both are present', () => {
        // A cave with left- and right-pushing runs must carry both kinds, and the
        // kind must be chosen from the tile the hero is actually swept by.
        let left = 0;
        let right = 0;
        for (const meta of NAV_MAPS) {
            left += graphFor(meta.id).stats.byEdgeKind[EDGE.CARRY_L] ?? 0;
            right += graphFor(meta.id).stats.byEdgeKind[EDGE.CARRY_R] ?? 0;
        }
        expect(left).toBeGreaterThan(0);
        expect(right).toBeGreaterThan(0);
    });
});

describe('the cavern is a cylinder', () => {
    it('has walk edges across the column seam', () => {
        let seams = 0;
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            graph.nodes.forEach((node, index) => {
                for (const edge of edgesOf(graph, index)) {
                    const target = graph.nodes[edge.to]!;
                    if (target.row !== node.row) continue;
                    const adjacent = wrapCol(node.col + 1, meta.mapWidth) === target.col
                        || wrapCol(node.col - 1, meta.mapWidth) === target.col;
                    if (adjacent) seams++;
                }
            });
        }
        expect(seams).toBeGreaterThan(0);
    });

    it('wraps rows without ever leaving the grid', () => {
        for (const meta of NAV_MAPS) {
            for (const node of graphFor(meta.id).nodes) {
                expect(node.row).toBeGreaterThanOrEqual(0);
                expect(node.row).toBeLessThan(64);
                expect(node.col).toBeGreaterThanOrEqual(0);
                expect(node.col).toBeLessThan(meta.mapWidth);
            }
        }
    });
});

describe('size and build cost', () => {
    it('matches the projections in the plan', () => {
        let nodes = 0;
        let edges = 0;
        for (const meta of NAV_MAPS) {
            nodes += graphFor(meta.id).stats.nodes;
            edges += graphFor(meta.id).stats.edges;
        }
        // [measured] 29,917 nodes / 1,081,449 edges.
        //
        // Nodes fell from 28,290 when `groundBelow` was corrected to the engine's own
        // landing test: a position with ground under the hero's left foot and open air
        // under the other two is not one he can stand on — the floor check finds
        // nothing under his middle foot and drops him a row on the next frame. Those
        // 958 nodes were pass-through positions, not stands.
        //
        // Edges rose from 211,633 for the opposite reason. A jump used to be an
        // offset table: a landing within three columns and three rows, gated on an
        // apex box that corresponded to no code in the game. Replaying the engine's
        // jump finds every cell a flight can actually end on — about twenty per node
        // instead of seven — including the ones the offset table could never have
        // guessed, like a jump that rises past its landing and falls back to it.
        // Most of the new edges are JUMP; none is a wider shortcut than the frames it
        // takes, which the check above proves for all of them.
        expect(nodes).toBeGreaterThan(29800);
        expect(nodes).toBeLessThan(30000);
        // Was 1,080,257, then 1,029,620 once each descent was locked to the launch
        // direction. Locking the falls off a rope removed the rest of the steering:
        // 6,874 of mp30's rope-exit edges alone were long diagonal descents the hero
        // cannot take, and the same search is still correct for a ledge, which does
        // leave him airborne.
        expect(edges).toBeGreaterThan(500000);
        expect(edges).toBeLessThan(560000);
    });

    it('builds the largest cavern within the plan\'s budget', () => {
        // [measured] mp10 at ~70 ms. The plan budgeted "well under 100 ms" for the
        // whole cavern set, and the graph is built lazily per map, so this is
        // comfortably inside it.
        const grid = gridFor(0);
        const started = Date.now();
        buildNavGraph(0, grid);
        expect(Date.now() - started).toBeLessThan(300);
    });

    it('gives a doorless map a small graph', () => {
        for (const meta of NAV_MAPS.filter((m) => m.isDoorless)) {
            const graph = graphFor(meta.id);
            expect(graph.stats.ride, meta.nameKey).toBe(0);
            expect(graph.stats.byEdgeKind[EDGE.RIDE_V] ?? 0, meta.nameKey).toBe(0);
            expect(graph.stats.byEdgeKind[EDGE.CARRY_L] ?? 0, meta.nameKey).toBe(0);
            expect(graph.stats.byEdgeKind[EDGE.LIFT] ?? 0, meta.nameKey).toBe(0);
        }
    });
});
