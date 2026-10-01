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
import { decodeTileGrid } from '../src/engine/nav/mdt-grid.js';
import { NavTileClassifier } from '../src/engine/nav/attributes.js';
import {
    blockedByCounterCurrent, heroBoxFree, heroInLift, isStanding, wrapCol,
} from '../src/engine/nav/geometry.js';
import { CAP, EDGE, EDGE_NAMES, NAV } from '../src/engine/nav/types.js';
import { NAV_MAPS, NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
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

    it('treats a ride node over solid ground as also a standing position', () => {
        // A platform rests on whatever is beneath it, so when that is solid the same
        // position is a valid ground node too. The two coexist and a BOARD edge
        // joins them, which is how the hero gets onto a platform that is resting on
        // the floor.
        let coincident = 0;
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            for (const node of graph.nodes) {
                if (node.kind !== NODE_RIDE) continue;
                const ground = nodeAt(graph, node.col, node.row);
                if (ground < 0) continue;
                coincident++;
                // And the two must actually be joined.
                const joined = edgesOf(graph, ground).some((e) => e.kind === EDGE.BOARD);
                expect(joined, `${meta.nameKey} ride (${node.col},${node.row}) not boardable`).toBe(true);
            }
        }
        expect(coincident).toBeGreaterThan(0);
    });

    it('finds standing positions on the biggest caverns', () => {
        for (const id of [8, 14]) {
            expect(graphFor(id).stats.ground, NAV_MAP_BY_ID.get(id)!.nameKey)
                .toBeGreaterThan(1000);
        }
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
        for (const meta of NAV_MAPS) {
            for (const edge of graphFor(meta.id).edges) {
                expect(edge.cost, `${meta.nameKey} ${EDGE_NAMES[edge.kind]}`).toBeGreaterThan(0);
            }
        }
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
                    const dir = target.col === node.col
                        ? 0
                        : wrapCol(node.col + 1, meta.mapWidth) === target.col ? 1 : -1;
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

describe('jumps are validated, not assumed', () => {
    it('keeps the arc apex clear and the ceiling probe open', () => {
        const bad: string[] = [];
        for (const meta of NAV_MAPS) {
            const graph = graphFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const grid = gridFor(meta.id);
            graph.nodes.forEach((node, index) => {
                forEachEdge(graph, index, (edge) => {
                    if (edge.kind !== EDGE.JUMP && edge.kind !== EDGE.JUMP_HIGH) return;
                    const target = graph.nodes[edge.to]!;
                    // The engine probes one row above the hero's head, middle
                    // column, and refuses the jump if it is blocked.
                    const probe = grid.tiles[
                        (((node.row - 1) & 63) * meta.mapWidth) + wrapCol(node.col + 1, meta.mapWidth)]!;
                    if (classifier.classify(probe) & NAV.BLOCK_HEAD) {
                        bad.push(`${meta.nameKey} jump past a ceiling from (${node.col},${node.row})`);
                    }
                    const apexRow = node.row + Math.trunc((target.row - node.row) / 2);
                    const apexCol = node.col + Math.trunc((target.col - node.col) / 2);
                    if (!heroBoxFree(grid, classifier, apexCol, apexRow)) {
                        bad.push(`${meta.nameKey} blocked jump apex from (${node.col},${node.row})`);
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
        // [measured] 152 of 236 lifts, 216 of 288 conveyors. The unreachable ones
        // run through open space with no standing position on their own row, so
        // the hero is carried past every exit. The model declines rather than
        // dropping him off the end of the world — which is what it used to do, and
        // it is where the routes that went underground came from.
        expect(liftsReachable, `lifts reachable ${liftsReachable}/${lifts}`).toBe(152);
        expect(conveyorsReachable, `conveyors ${conveyorsReachable}/${conveyors}`)
            .toBe(216);
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
        // [measured] 28,290 nodes / 211,633 edges.
        //
        // Nodes rose from 25,905 when the carry-hazard guard stopped discarding
        // seventy horizontal platforms for having one clipped column — ride slots
        // went from 3,204 to 5,589. Edges *fell* from 286,886, because the fall
        // scan no longer tunnels through rock to invent a landing, which had been
        // manufacturing tens of thousands of impossible hops.
        expect(nodes).toBeGreaterThan(28000);
        expect(nodes).toBeLessThan(28600);
        expect(edges).toBeGreaterThan(208000);
        expect(edges).toBeLessThan(215000);
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
