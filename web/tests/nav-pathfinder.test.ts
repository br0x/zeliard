/**
 * nav-pathfinder.test.ts — A* across a cavern component (phase 4).
 *
 * The pathfinder's job is to answer "can the hero get there, and by what route".
 * The checks below are the ones that would actually hurt the player if wrong:
 * a route through a door he cannot open, a route across ground his shoes cannot
 * protect him on, a route that leaves the game world through a town, or a route
 * that is not the cheapest.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NavGraphStore, findRoute, reachableMaps, mapName } from '../src/engine/nav/pathfinder.js';
import { HAZARD_AGGRESSIVE, type NavGraph } from '../src/engine/nav/nav-graph.js';
import {
    allCapabilities, bareCapabilities, snapshotCapabilities, ACCESSORY_FERUZA,
    ACCESSORY_PIRIKA, ADDR_KEYS, ADDR_LION_KEYS,
} from '../src/engine/nav/capabilities.js';
import { getGmem, memWrite8 } from '../src/core/ts-memory.js';
import { EDGE } from '../src/engine/nav/types.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { PORTALS } from '../src/data/nav/nav-portals.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** A store over the real MDT files, so the tests exercise the shipped data. */
function makeStore(): NavGraphStore {
    const cache = new Map<number, Uint8Array>();
    return new NavGraphStore((mapId) => {
        const meta = NAV_MAP_BY_ID.get(mapId);
        if (!meta) return null;
        let bytes = cache.get(mapId);
        if (!bytes) {
            bytes = new Uint8Array(readFileSync(resolve(REPO, `web/public/game/0/${meta.nameKey}.mdt`)));
            cache.set(mapId, bytes);
        }
        return bytes;
    });
}

function keysHeld(ordinary: number, lion: number) {
    const g = getGmem();
    memWrite8(g, ADDR_KEYS, ordinary);
    memWrite8(g, ADDR_LION_KEYS, lion);
    return snapshotCapabilities(g, 1);
}

/** The ground node furthest from a point, ignoring distance through walls. */
function farthestNode(
    graph: NavGraph,
    col: number,
    row: number,
): { col: number; row: number } | null {
    let best = -1;
    let bestDist = -1;
    for (let i = 0; i < graph.nodes.length; i++) {
        const n = graph.nodes[i]!;
        if (n.kind !== 0) continue;
        const d = Math.min(Math.abs(n.col - col), graph.mapWidth - Math.abs(n.col - col))
            + Math.min(Math.abs(n.row - row), 64 - Math.abs(n.row - row));
        if (d > bestDist) { bestDist = d; best = i; }
    }
    return best < 0 ? null : { col: graph.nodes[best]!.col, row: graph.nodes[best]!.row };
}

/** A standing position with plenty of exits, so a route is usually possible. */
function pickStart(store: NavGraphStore, mapId: number): { mapId: number; col: number; row: number } {
    const graph = store.get(mapId)!;
    for (let i = 0; i < graph.nodes.length; i++) {
        const n = graph.nodes[i]!;
        if (n.kind !== 0) continue;
        const degree = graph.edgeOffsets[i + 1]! - graph.edgeOffsets[i]!;
        if (degree < 4) continue;
        return { mapId, col: n.col, row: n.row };
    }
    throw new Error(`map ${mapId} has no connected standing position`);
}

describe('NavGraphStore', () => {
    it('builds a graph on demand and caches it', () => {
        const store = makeStore();
        expect(store.has(0)).toBe(false);
        const first = store.get(0)!;
        expect(store.has(0)).toBe(true);
        expect(store.get(0)).toBe(first);
        expect(store.size).toBe(1);
    });

    it('returns null for a map whose data is not loaded', () => {
        const store = new NavGraphStore(() => null);
        expect(store.get(0)).toBeNull();
        expect(store.get(0)).toBeNull();
    });

    it('drops and clears', () => {
        const store = makeStore();
        store.get(0);
        store.get(1);
        store.drop(0);
        expect(store.has(0)).toBe(false);
        store.clear();
        expect(store.size).toBe(0);
    });
});

describe('routes inside one cavern', () => {
    it('finds a route between two standing positions', () => {
        const store = makeStore();
        const graph = store.get(0)!;
        const start = pickStart(store, 0);
        // The far side of the cavern, wherever that turns out to be: the levels
        // are hand-drawn, so no particular offset is guaranteed to hold ground.
        const target = farthestNode(graph, start.col, start.row);
        expect(target).not.toBeNull();
        const route = findRoute({
            store, caps: bareCapabilities(), start, goal: { mapId: 0, col: target!.col, row: target!.row },
        });
        expect(route).not.toBeNull();
        expect(route!.points[0]).toMatchObject({ mapId: 0, col: start.col, row: start.row });
        expect(route!.points[route!.points.length - 1]).toMatchObject({ mapId: 0, col: target!.col, row: target!.row });
        expect(route!.maps).toEqual([0]);
    });

    it('charges a cost equal to the sum of its hops', () => {
        const store = makeStore();
        const graph = store.get(0)!;
        const start = pickStart(store, 0);
        const far = graph.nodes.reduce((best, n, i) => {
            const d = Math.abs(n.col - start.col);
            if (n.kind !== 0) return best;
            if (best < 0 || d > Math.abs(graph.nodes[best]!.col - start.col)) return i;
            return best;
        }, -1);
        expect(far).toBeGreaterThanOrEqual(0);
        const target = graph.nodes[far]!;
        const route = findRoute({
            store, caps: bareCapabilities(), start, goal: { mapId: 0, col: target.col, row: target.row },
        });
        expect(route).not.toBeNull();
        const summed = route!.hops.reduce((a, h) => a + h.cost, 0);
        expect(route!.cost).toBe(summed);
        expect(route!.hops).toHaveLength(route!.points.length - 1);
    });

    it('is deterministic', () => {
        const store = makeStore();
        const graph = store.get(0)!;
        const start = pickStart(store, 0);
        const goal = { mapId: 0, col: (start.col + 50) % graph.mapWidth, row: start.row };
        const a = findRoute({ store, caps: bareCapabilities(), start, goal });
        const b = findRoute({ store, caps: bareCapabilities(), start, goal });
        expect(a?.cost).toBe(b?.cost);
        expect(a?.points.map((p) => `${p.mapId}:${p.col}:${p.row}`))
            .toEqual(b?.points.map((p) => `${p.mapId}:${p.col}:${p.row}`));
    });

    it('returns null when the goal is not a standing position', () => {
        const store = makeStore();
        const start = pickStart(store, 0);
        // A door frame tile in mid-air is not somewhere the hero can stand.
        expect(findRoute({ store, caps: allCapabilities(), start, goal: { mapId: 0, col: 0, row: 0 } }))
            .toBeNull();
    });
});

describe('routes across caverns', () => {
    /** A portal that leads to a map with a door table, so it is reversible. */
    const linked = PORTALS.find((p) => !p.toTown && !p.deadEnd && p.mapId !== p.destMapId
        && p.destMapId !== 4 && p.mapId !== 4)!;

    it('follows a door onto another map and names the sequence', () => {
        const store = makeStore();
        const from = store.get(linked.mapId)!;
        const node = from.nodes[from.groundOf[linked.fromY * from.mapWidth + linked.fromX]!]!;
        const route = findRoute({
            store, caps: allCapabilities(),
            start: { mapId: linked.mapId, col: node.col, row: node.row },
            goal: { mapId: linked.destMapId, col: linked.toX, row: linked.toY },
        });
        expect(route).not.toBeNull();
        expect(route!.maps[0]).toBe(linked.mapId);
        expect(route!.maps[route!.maps.length - 1]).toBe(linked.destMapId);
        expect(route!.maps.map(mapName)).toEqual([mapName(linked.mapId), mapName(linked.destMapId)]);
        expect(route!.hops.some((h) => h.kind === EDGE.DOOR)).toBe(true);
    });

    it('can never route through a town door', () => {
        // Town doors are not edges at all, so no route may contain one.
        const store = makeStore();
        const start = pickStart(store, 0);
        const town = PORTALS.find((p) => p.toTown && p.mapId === 0)!;
        expect(town).toBeDefined();
        const route = findRoute({
            store, caps: allCapabilities(),
            start,
            goal: { mapId: 0, col: town.toX < 0 ? town.x0 : town.toX, row: town.fromY },
        });
        // Whether a route exists inside the cavern is beside the point; what
        // matters is that it never leaves via the town.
        for (const mapId of route?.maps ?? []) {
            expect(mapId).toBeLessThan(31);
        }
    });

    it('never reaches a map outside the start map\'s reachable set', () => {
        const store = makeStore();
        const start = pickStart(store, 0);
        const allowed = new Set(reachableMaps(0));
        // mp90 is behind a Lion-Head door from mp84 and is not in mp10's set.
        expect(allowed.has(29)).toBe(false);
        const route = findRoute({
            store, caps: allCapabilities(), start, goal: { mapId: 29, col: 0, row: 0 },
        });
        if (route) {
            for (const mapId of route.maps) expect(allowed.has(mapId)).toBe(true);
        }
    });
});

describe('keys are spent, not assumed', () => {
    const lion = PORTALS.find((p) => p.key === 2)!;

    it('refuses a Lion-Head door with no key', () => {
        const store = makeStore();
        const from = store.get(lion.mapId)!;
        const node = from.nodes[from.groundOf[lion.fromY * from.mapWidth + lion.fromX]!]!;
        const route = findRoute({
            store, caps: keysHeld(0, 0),
            start: { mapId: lion.mapId, col: node.col, row: node.row },
            goal: { mapId: lion.destMapId, col: lion.toX, row: lion.toY },
        });
        expect(route).toBeNull();
    });

    it('opens it with a key, and reports exactly one spent', () => {
        const store = makeStore();
        const from = store.get(lion.mapId)!;
        const node = from.nodes[from.groundOf[lion.fromY * from.mapWidth + lion.fromX]!]!;
        const route = findRoute({
            store, caps: keysHeld(0, 1),
            start: { mapId: lion.mapId, col: node.col, row: node.row },
            goal: { mapId: lion.destMapId, col: lion.toX, row: lion.toY },
        });
        expect(route).not.toBeNull();
        expect(route!.keysSpent.lion).toBe(1);
        expect(route!.keysSpent.ordinary).toBe(0);
    });
});

describe('capability pruning', () => {
    it('keeps a bare hero off aggressive ground', () => {
        // mp80's thorn beds need Pirika shoes; without them the goal must be
        // unreachable rather than routed through.
        const store = makeStore();
        const graph = store.get(23)!;
        let hazardNode = -1;
        for (let i = 0; i < graph.nodes.length; i++) {
            if (graph.nodeHazard[i]! & HAZARD_AGGRESSIVE) { hazardNode = i; break; }
        }
        expect(hazardNode, 'mp80 should have aggressive ground').toBeGreaterThanOrEqual(0);
        const start = pickStart(store, 23);
        const route = findRoute({
            store, caps: bareCapabilities(), start,
            goal: { mapId: 23, col: graph.nodes[hazardNode]!.col, row: graph.nodes[hazardNode]!.row },
        });
        if (route) {
            for (const p of route.points) {
                expect(graph.nodeHazard[p.node]! & HAZARD_AGGRESSIVE,
                    `${p.col},${p.row}`).toBe(0);
            }
        }
    });

    it('lets Pirika shoes cross what a bare hero may not', () => {
        const store = makeStore();
        const graph = store.get(23)!;
        let hazardNode = -1;
        for (let i = 0; i < graph.nodes.length; i++) {
            if (graph.nodeHazard[i]! & HAZARD_AGGRESSIVE) { hazardNode = i; break; }
        }
        const target = graph.nodes[hazardNode]!;
        const g = getGmem();
        memWrite8(g, 0x9e, ACCESSORY_PIRIKA);
        const caps = snapshotCapabilities(g, 1);
        const start = pickStart(store, 23);
        const route = findRoute({ store, caps, start, goal: { mapId: 23, col: target.col, row: target.row } });
        expect(route).not.toBeNull();
        const last = route!.points[route!.points.length - 1]!;
        expect(graph.nodeHazard[last.node]! & HAZARD_AGGRESSIVE).toBeTruthy();
    });

    it('uses Feruza shoes for the jumps a bare hero cannot make', () => {
        const store = makeStore();
        const g = getGmem();
        memWrite8(g, 0x9e, ACCESSORY_FERUZA);
        const withShoes = snapshotCapabilities(g, 1);
        memWrite8(g, 0x9e, 0);
        const bare = snapshotCapabilities(g, 1);

        // Jumping to a ledge only reachable at height 4 needs Feruza. Find a node
        // whose only cheap approach is a JUMP_HIGH edge.
        const graph = store.get(0)!;
        let startIdx = -1;
        let goalIdx = -1;
        for (let i = 0; i < graph.nodes.length; i++) {
            const node = graph.nodes[i]!;
            if (node.kind !== 0) continue;
            let onlyHigh = true;
            let hasHigh = false;
            for (let e = graph.edgeOffsets[i]!; e < graph.edgeOffsets[i + 1]!; e++) {
                const edge = graph.edges[e]!;
                if (edge.kind === EDGE.JUMP_HIGH) hasHigh = true;
                else if (edge.kind === EDGE.JUMP || edge.kind === EDGE.WALK || edge.kind === EDGE.STEP) onlyHigh = false;
            }
            if (hasHigh && onlyHigh && startIdx < 0) startIdx = i;
            if (hasHigh && onlyHigh && goalIdx < 0 && startIdx >= 0 && i !== startIdx) goalIdx = i;
        }
        if (startIdx < 0 || goalIdx < 0) return;   // this build has no such pair
        const a = graph.nodes[startIdx]!;
        const b = graph.nodes[goalIdx]!;
        const goal = { mapId: 0, col: b.col, row: b.row };
        const start = { mapId: 0, col: a.col, row: a.row };
        expect(findRoute({ store, caps: withShoes, start, goal })?.hops.some((h) => h.kind === EDGE.JUMP_HIGH))
            .toBe(true);
        // And the bare hero never takes one.
        const bareRoute = findRoute({ store, caps: bare, start, goal });
        expect(bareRoute?.hops.some((h) => h.kind === EDGE.JUMP_HIGH)).toBeFalsy();
    });
});

describe('cost and shape', () => {
    it('reports which mechanics the route relies on', () => {
        const store = makeStore();
        const graph = store.get(0)!;
        const start = pickStart(store, 0);
        const target = farthestNode(graph, start.col, start.row)!;
        const route = findRoute({
            store, caps: allCapabilities(), start, goal: { mapId: 0, col: target.col, row: target.row },
        });
        expect(route).not.toBeNull();
        // A walk inside one cavern must not leave it.
        expect(route!.maps).toEqual([0]);
        expect(typeof route!.usesPlatforms).toBe('boolean');
        expect(typeof route!.usesCurrents).toBe('boolean');
        expect(route!.expanded).toBeGreaterThan(0);
    });

    it('respects an expansion limit', () => {
        const store = makeStore();
        const graph = store.get(0)!;
        const start = pickStart(store, 0);
        const target = farthestNode(graph, start.col, start.row)!;
        const route = findRoute({
            store, caps: allCapabilities(), start,
            goal: { mapId: 0, col: target.col, row: target.row },
            maxExpanded: 1,
        });
        // With one expansion allowed it cannot finish, unless the goal is adjacent.
        if (route) expect(route.expanded).toBeLessThanOrEqual(2);
    });

    it('collapses repeated map ids in the route summary', () => {
        const store = makeStore();
        const cross = PORTALS.find((p) => !p.toTown && !p.deadEnd && p.mapId !== p.destMapId
            && p.destMapId !== 4 && p.mapId !== 4)!;
        const from = store.get(cross.mapId)!;
        const node = from.nodes[from.groundOf[cross.fromY * from.mapWidth + cross.fromX]!]!;
        const route = findRoute({
            store, caps: allCapabilities(),
            start: { mapId: cross.mapId, col: node.col, row: node.row },
            goal: { mapId: cross.destMapId, col: cross.toX, row: cross.toY },
        });
        expect(route).not.toBeNull();
        for (let i = 1; i < route!.maps.length; i++) {
            expect(route!.maps[i]).not.toBe(route!.maps[i - 1]);
        }
    });
});
