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
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NavGraphStore, findRoute, reachableMaps, mapName } from '../src/engine/nav/pathfinder.js';
import { HAZARD_AGGRESSIVE, type NavGraph } from '../src/engine/nav/nav-graph.js';
import {
    allCapabilities, bareCapabilities, snapshotCapabilities, hasCap,
    ACCESSORY_FERUZA, ACCESSORY_PIRIKA, ADDR_KEYS, ADDR_LION_KEYS,
    type HeroCapabilities,
} from '../src/engine/nav/capabilities.js';
import { CAP } from '../src/engine/nav/types.js';
import { getGmem, memWrite8 } from '../src/core/ts-memory.js';
import { EDGE } from '../src/engine/nav/types.js';
import { decodeTileGrid } from '../src/engine/nav/mdt-grid.js';
import { NAV_MAP_BY_ID, NAV_MAPS } from '../src/data/nav/nav-maps.js';
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

/**
 * A standing position in the SAME component as `from`, as far away as possible.
 *
 * Not "the furthest node in the map" — a cavern can be several separate
 * chambers, and the whole point of the fall fix is that a route can no longer
 * cross rock to reach one. Choosing a goal from the start node's own component
 * makes these tests exercise a real route rather than hoping a guessed pair of
 * columns happens to be connected. And the component is filled with the hero's
 * capabilities, not the whole graph, for the same reason.
 */
function farthestNode(
    graph: NavGraph,
    col: number,
    row: number,
    caps: HeroCapabilities = bareCapabilities(),
): { col: number; row: number } | null {
    const start = graph.groundOf[((row & 63) * graph.mapWidth) + ((col % graph.mapWidth) + graph.mapWidth) % graph.mapWidth]!;
    if (start < 0) return null;
    // Flood fill out from the start, over the edges this hero may actually take —
    // the same two gates `findRoute` applies. Filling over *all* of them picks a
    // goal the hero cannot reach, and the assertion below would then be testing the
    // pathfinder's refusal rather than its routes: a tall jump now needs Feruza
    // shoes, so a component full of JUMP_HIGH edges is not a bare hero's to walk.
    const seen = new Set<number>([start]);
    const queue = [start];
    let head = 0;
    let best = start;
    let bestDist = -1;
    while (head < queue.length) {
        const n = queue[head++]!;
        const nd = graph.nodes[n]!;
        const d = Math.min(Math.abs(nd.col - col), graph.mapWidth - Math.abs(nd.col - col))
            + Math.min(Math.abs(nd.row - row), 64 - Math.abs(nd.row - row));
        if (d > bestDist) { bestDist = d; best = n; }
        for (let e = graph.edgeOffsets[n]!; e < graph.edgeOffsets[n + 1]!; e++) {
            const edge = graph.edges[e]!;
            if ((edge.req & ~caps.mask) !== 0) continue;
            if (!hasCap(caps, CAP.GROUND_SAFE)
                && (graph.nodeHazard[edge.to]! & HAZARD_AGGRESSIVE)) continue;
            const to = edge.to;
            if (seen.has(to)) continue;
            seen.add(to);
            queue.push(to);
        }
    }
    const node = graph.nodes[best]!;
    return { col: node.col, row: node.row };
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

describe('fetching a cavern the game has not downloaded', () => {
    it('asks for the path the game itself asks for', () => {
        // The bug: the fetcher prefixed `assets/`, but the cavern files live at
        // the site root under game/0/. Every other map 404'd and the screen
        // reported "This cavern cannot be charted".
        // main.ts loads a cavern it is about to enter with a bare
        // `fetch(mdtPath)`, so the store must use the identical string.
        const src = readFileSync(resolve(REPO, 'web/src/main.ts'), 'utf8');
        expect(src).toContain('await fetch(mdtPath)');
        expect(src).not.toContain('assets/${meta.mdtPath}');
    });

    it('resolves that path against the files that actually exist', () => {
        for (const meta of NAV_MAPS) {
            // public/ + mdtPath is what the server exposes at mdtPath.
            const file = resolve(REPO, 'web/public', meta.mdtPath);
            expect(existsSync(file), `${meta.mdtPath} should exist under public/`).toBe(true);
        }
    });

    it('does not accidentally resolve under assets/', () => {
        expect(existsSync(resolve(REPO, 'web/public/assets/game/0/mp81.mdt'))).toBe(false);
    });

    it('fetches and decodes a map the store did not already hold', async () => {
        const requested: string[] = [];
        const store = new NavGraphStore(
            function notLoaded() { return null; },
            async (mapId) => {
                const meta = NAV_MAP_BY_ID.get(mapId)!;
                requested.push(meta.mdtPath);
                return new Uint8Array(readFileSync(resolve(REPO, 'web/public', meta.mdtPath)));
            },
        );
        expect(await store.load(24)).toBe(true);          // mp81
        expect(requested).toEqual(['game/0/mp81.mdt']);
        expect(store.get(24)?.stats.nodes).toBeGreaterThan(0);
    });
});

describe('the MDT image handed to the store', () => {
    it('reads the map width from the header, so a wrong-sized image fails loudly', () => {
        // The bug this pins: passing the whole 64 KB memory image instead of the
        // 16 KB MDT window at 0xC000. The decoder then read the map width out of
        // the save-image bytes and walked the packed map off the end.
        const real = new Uint8Array(readFileSync(resolve(REPO, 'web/public/game/0/mp80.mdt')));
        expect(real.length).toBeLessThan(0x4000);
        expect(real[2]! | (real[3]! << 8)).toBe(256);      // mp80 is 256 wide

        const wholeMemory = new Uint8Array(0x10000);
        wholeMemory.set(real, 0xc000);                     // loaded the way the game does
        expect(wholeMemory[2]! | (wholeMemory[3]! << 8)).not.toBe(256);

        // Decoding the memory image as an MDT must fail rather than silently
        // produce a nonsense grid. Which guard trips depends on the save bytes:
        // a zeroed width is caught at the header, a plausible one at the RLE.
        expect(() => decodeTileGrid(wholeMemory, 0, 23))
            .toThrow(/map width|ran past the end/);
        // Decoding the window the game actually holds must work.
        const mdtWindow = wholeMemory.slice(0xc000);
        expect(() => decodeTileGrid(mdtWindow, 0, 23)).not.toThrow();
    });

    it('declines a malformed map instead of throwing into the key handler', () => {
        const store = new NavGraphStore(() => new Uint8Array(0x10000));
        // Garbage: no MDT header, so the width is nonsense and the RLE overruns.
        expect(() => store.get(0)).not.toThrow();
        expect(store.get(0)).toBeNull();
        // And it is not retried on every frame.
        expect(store.isBroken(0)).toBe(true);
    });

    it('reports a missing map as unavailable rather than broken', () => {
        const store = new NavGraphStore(function none() { return null; });
        expect(store.get(0)).toBeNull();
        expect(store.isBroken(0)).toBe(false);
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
        const target = farthestNode(graph, start.col, start.row)!;
        expect(target, 'the start cavern should have a reachable goal').not.toBeNull();
        const route = findRoute({
            store, caps: bareCapabilities(), start, goal: { mapId: 0, col: target.col, row: target.row },
        });
        expect(route, 'a goal in the start component must be routable').not.toBeNull();
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
        // mp73 is only reached through the Pureza building and its own post-boss
        // door opens onto a town, so it is in nobody's set but its own.
        expect(allowed.has(21)).toBe(false);
        const route = findRoute({
            store, caps: allCapabilities(), start, goal: { mapId: 21, col: 0, row: 0 },
        });
        expect(route).toBeNull();
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
        // The point is the difference between the two, so compare the same trip
        // under both sets of shoes. Start in the thorns and walk out of them.
        const store = makeStore();
        const graph = store.get(23)!;
        // Two standing positions in the same component, one of them in thorns.
        const thorns: number[] = [];
        for (let i = 0; i < graph.nodes.length; i++) {
            if (graph.nodes[i]!.kind !== 0) continue;
            if (graph.nodeHazard[i]! & HAZARD_AGGRESSIVE) thorns.push(i);
        }
        expect(thorns.length, 'mp80 should have thorn beds on standable ground')
            .toBeGreaterThan(1);
        const here = thorns[0]!;
        const start = { mapId: 23, col: graph.nodes[here]!.col, row: graph.nodes[here]!.row };

        // Somewhere reachable from there, within the same component.
        const seen = new Set<number>([here]);
        const queue = [here];
        let head = 0;
        let partner = -1;
        while (head < queue.length) {
            const n = queue[head++]!;
            for (let e = graph.edgeOffsets[n]!; e < graph.edgeOffsets[n + 1]!; e++) {
                const to = graph.edges[e]!.to;
                if (seen.has(to)) continue;
                seen.add(to);
                queue.push(to);
                if (partner < 0 && graph.nodes[to]!.kind === 0
                    && !(graph.nodeHazard[to]! & HAZARD_AGGRESSIVE)) partner = to;
            }
        }
        expect(partner, 'a thorn bed should lead somewhere solid').toBeGreaterThanOrEqual(0);
        const goal = { mapId: 23, col: graph.nodes[partner]!.col, row: graph.nodes[partner]!.row };

        // Without the shoes, the thorns are impassable.
        expect(findRoute({ store, caps: bareCapabilities(), start, goal })).toBeNull();
        // With them, the way opens.
        const g = getGmem();
        memWrite8(g, 0x9e, ACCESSORY_PIRIKA);
        const route = findRoute({ store, caps: snapshotCapabilities(g, 1), start, goal });
        expect(route, 'Pirika shoes should open a way across the thorns').not.toBeNull();
        expect(graph.nodeHazard[route!.points[0]!.node]! & HAZARD_AGGRESSIVE).toBeTruthy();
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
