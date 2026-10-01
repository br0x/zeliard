/**
 * pathfinder.ts — A* across a cavern component.
 *
 * The graph is per-map; a route may cross a dozen of them, so a search node is
 * `(mapId, localNode, keysSpentOrdinary, keysSpentLion)`. The key counters are
 * part of the state rather than a large edge penalty, because spending a key is
 * irreversible — a route that "borrows" three keys and needs four is not a route,
 * and no amount of extra cost makes it one. In practice the counters stay small:
 * the hero holds a handful of keys and the graph holds 163 doors.
 *
 * The heuristic is the octile distance within a map and zero across maps. That is
 * admissible — there is no useful lower bound between two caverns, since a door
 * may put the hero anywhere in the next one — and it keeps the search from
 * degenerating into Dijkstra once a route leaves the starting map.
 *
 * Capability pruning happens here rather than in the graph, so one graph serves
 * every loadout:
 *   - an edge whose `req` the hero cannot satisfy is not expanded;
 *   - a node standing on aggressive ground is not entered without Pirika shoes;
 *   - crossing a locked door spends a key, and a state that cannot pay is dropped.
 *
 * Town doors are never edges, so a route can never leave a cavern by one.
 */

import { EDGE, EDGE_COST } from './types.js';
import type { HeroCapabilities } from './capabilities.js';
import { hasCap } from './capabilities.js';
import { CAP } from './types.js';
import {
    HAZARD_AGGRESSIVE, HAZARD_SLOPE, buildNavGraph, nodeAt, type NavGraph,
} from './nav-graph.js';
import { decodeTileGrid, type NavTileGrid } from './mdt-grid.js';
import { PORTALS } from '../../data/nav/nav-portals.js';
import { NAV_MAP_BY_ID, NAV_REACHABLE } from '../../data/nav/nav-maps.js';

/** One standing position on a route. */
export interface NavPoint {
    readonly mapId: number;
    /** Hero left column. */
    readonly col: number;
    /** Hero head row. */
    readonly row: number;
    /** Node index within that map's graph. */
    readonly node: number;
}

/** One hop of a route, mirroring the edge that produced it. */
export interface NavHop {
    readonly kind: number;
    readonly cost: number;
    readonly from: NavPoint;
    readonly to: NavPoint;
}

export interface NavRoute {
    readonly points: readonly NavPoint[];
    readonly hops: readonly NavHop[];
    /** Total cost in game ticks, one tick per tile of movement. */
    readonly cost: number;
    /** Keys the route spends opening doors. */
    readonly keysSpent: { ordinary: number; lion: number };
    /** Maps visited, in order, with consecutive duplicates collapsed. */
    readonly maps: readonly number[];
    /** Hazards the route's footprints touch, for a warning on the map screen. */
    readonly crossesAggressiveGround: boolean;
    readonly crossesSlopes: boolean;
    readonly usesPlatforms: boolean;
    readonly usesCurrents: boolean;
    /** Nodes expanded before the goal was settled. Diagnostic only. */
    readonly expanded: number;
}

// ── graph cache ─────────────────────────────────────────────────────────────

export interface NavGridSource {
    /** Raw MDT bytes for a map, or null while it is not available. */
    (mapId: number): Uint8Array | null;
}

/**
 * Fetches a map's MDT on demand.
 *
 * The game only downloads the cavern it is standing in, but a route may cross a
 * dozen others, and the map screen may browse all of them. Injected rather than
 * assumed, so the engine layer stays free of I/O.
 */
export type NavGridFetcher = (mapId: number) => Promise<Uint8Array | null>;

/**
 * Builds each map's graph once and keeps it.
 *
 * Building is ~70 ms for the largest cavern, so this is only ever filled for the
 * maps of one component at a time. `drop` is there for the mode change that
 * throws them away.
 */
export class NavGraphStore {
    private readonly graphs = new Map<number, NavGraph>();
    private readonly grids = new Map<number, NavTileGrid>();
    /** Maps whose MDT failed to decode, so they are not retried every frame. */
    private readonly failed = new Set<number>();
    /** Bytes obtained from the fetcher, kept so `get` can see them. */
    private readonly fetched = new Map<number, Uint8Array>();

    constructor(
        private readonly source: NavGridSource,
        private readonly fetcher?: NavGridFetcher,
    ) {}

    /**
     * Make sure a map's data is in memory, fetching it if needed.
     *
     * @returns true when the graph is available afterwards
     */
    async load(mapId: number): Promise<boolean> {
        if (this.graphs.has(mapId)) return true;
        // Already in memory (the cavern the hero is standing in): just build it.
        // Going straight to `graphs.has` here would report "unavailable" for a
        // map whose bytes are right there but whose graph was never built.
        if (this.source(mapId) || !this.fetcher) return this.get(mapId) !== null;
        try {
            const bytes = await this.fetcher(mapId);
            if (!bytes) return false;
            this.fetched.set(mapId, bytes);
        } catch {
            return false;   // a missing or unreadable map simply is not offered
        }
        return this.get(mapId) !== null;
    }

    /**
     * Graph for a map, building it on first use.
     *
     * Returns null when the MDT is unavailable **or malformed**. A decoder
     * failure must not escape: this is called from the key handler, and an
     * exception there would surface as an uncaught error and swallow the key press
     * rather than just declining to offer the map.
     */
    get(mapId: number): NavGraph | null {
        const cached = this.graphs.get(mapId);
        if (cached) return cached;
        if (this.failed.has(mapId)) return null;
        // Bytes fetched on demand take precedence over the source, so a fetcher
        // does not have to publish into the source's own cache.
        const bytes = this.fetched.get(mapId) ?? this.source(mapId);
        if (!bytes) return null;
        try {
            const grid = decodeTileGrid(bytes, 0, mapId);
            this.grids.set(mapId, grid);
            const graph = buildNavGraph(mapId, grid);
            this.graphs.set(mapId, graph);
            return graph;
        } catch (err) {
            // Remember the failure so a broken map is not retried every frame.
            this.failed.add(mapId);
            console.warn(`[nav] map ${mapId} could not be decoded; excluding it`, err);
            return null;
        }
    }

    /** Preload a map's graph, e.g. while the map screen is opening. */
    warm(mapId: number): void {
        this.get(mapId);
    }

    /**
     * The decoded tile grid for a map, without exposing the whole graph.
     *
     * The store already holds one from building the graph, so this costs nothing
     * and gives the map screen the tiles it needs to draw the cavern.
     */
    gridOf(mapId: number): NavTileGrid | null {
        this.get(mapId);
        return this.grids.get(mapId) ?? null;
    }

    has(mapId: number): boolean {
        return this.graphs.has(mapId);
    }

    get size(): number {
        return this.graphs.size;
    }

    drop(mapId: number): void {
        this.graphs.delete(mapId);
        this.grids.delete(mapId);
        this.fetched.delete(mapId);
        this.failed.delete(mapId);
    }

    clear(): void {
        this.graphs.clear();
        this.grids.clear();
        this.fetched.clear();
        this.failed.clear();
    }

    /** True when a map's data could not be decoded. */
    isBroken(mapId: number): boolean {
        return this.failed.has(mapId);
    }
}

// ── binary heap ─────────────────────────────────────────────────────────────

/** A search state, packed so it can live in typed arrays. */
interface State {
    readonly mapId: number;
    readonly node: number;
    readonly keysOrd: number;
    readonly keysLion: number;
    readonly g: number;
    readonly f: number;
    /** Index of the predecessor state, or -1 at the start. */
    readonly parent: number;
    /** Edge kind taken to get here; meaningless at the start. */
    readonly via: number;
    readonly viaCost: number;
}

/**
 * Pack a state into one number.
 *
 * Node counts are per map and well under 2^18 even for the largest cavern, so
 * node < 2^18, keys < 8 and 31 maps pack losslessly into a double.
 */
const NODE_LIMIT = 1 << 18;
const stateKey = (s: State): number =>
    s.mapId * NODE_LIMIT * 64 + s.node * 64 + s.keysOrd * 8 + s.keysLion;

/** Min-heap over `f`. */
class Heap {
    private readonly items: State[] = [];

    get size(): number {
        return this.items.length;
    }

    push(state: State): void {
        const items = this.items;
        items.push(state);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent]!.f <= items[i]!.f) break;
            [items[parent], items[i]] = [items[i]!, items[parent]!];
            i = parent;
        }
    }

    pop(): State | undefined {
        const items = this.items;
        if (items.length === 0) return undefined;
        const top = items[0]!;
        const last = items.pop()!;
        if (items.length > 0) {
            items[0] = last;
            let i = 0;
            for (;;) {
                const l = i * 2 + 1;
                const r = l + 1;
                let smallest = i;
                if (l < items.length && items[l]!.f < items[smallest]!.f) smallest = l;
                if (r < items.length && items[r]!.f < items[smallest]!.f) smallest = r;
                if (smallest === i) break;
                [items[smallest], items[i]] = [items[i]!, items[smallest]!];
                i = smallest;
            }
        }
        return top;
    }
}

// ── search ──────────────────────────────────────────────────────────────────

export interface FindRouteOptions {
    /** Graph source. Only maps the MDT is loaded for can be searched. */
    readonly store: NavGraphStore;
    readonly caps: HeroCapabilities;
    /** Where the hero stands. */
    readonly start: { mapId: number; col: number; row: number };
    /** Where the player clicked. Must resolve to a node; see nearestNode. */
    readonly goal: { mapId: number; col: number; row: number };
    /**
     * Maps the route may use. Defaults to NAV_REACHABLE for the start map, so a
     * route can never be plotted through a town.
     */
    readonly maps?: readonly number[];
    /** Give up after this many nodes expanded. Guards against a pathological map. */
    readonly maxExpanded?: number;
}

const DEFAULT_LIMIT = 400000;

/**
 * Octile distance within a map, zero across maps.
 *
 * Zero across maps is admissible because a door can land the hero anywhere in the
 * destination cavern, so no positive lower bound exists between two maps.
 */
function heuristic(mapId: number, node: number, goal: NavGraph, goalNode: number): number {
    if (mapId !== goal.mapId) return 0;
    const a = goal.nodes[node]!;
    const b = goal.nodes[goalNode]!;
    const w = goal.mapWidth;
    let dx = Math.abs(a.col - b.col);
    const half = w / 2;
    if (dx > half) dx = w - dx;
    const dy = Math.abs(a.row - b.row);
    const ddy = Math.min(dy, 64 - dy);
    // Octile: diagonal moves cost sqrt(2), so scale by 2 to stay integral.
    return Math.max(dx, dy) + Math.round((Math.SQRT2 - 1) * Math.min(dx, ddy) * 2) / 2;
}

/**
 * Is this hop permitted for this hero?
 *
 * Two independent gates: the edge's declared requirement, and whether the landing
 * puts the hero on ground he cannot safely walk.
 */
function permitted(
    edgeReq: number,
    targetNode: number,
    hazard: Uint8Array,
    caps: HeroCapabilities,
): boolean {
    if ((edgeReq & ~caps.mask) !== 0) return false;
    if (!hasCap(caps, CAP.GROUND_SAFE) && (hazard[targetNode]! & HAZARD_AGGRESSIVE)) {
        return false;
    }
    return true;
}

/** Find a route, or null when the goal is unreachable with what the hero has. */
export function findRoute(options: FindRouteOptions): NavRoute | null {
    const { store, caps, start, goal } = options;
    const limit = options.maxExpanded ?? DEFAULT_LIMIT;

    const startGraph = store.get(start.mapId);
    const goalGraph = store.get(goal.mapId);
    if (!startGraph || !goalGraph) return null;

    const startNode = nodeAt(startGraph, start.col, start.row);
    const goalNode = nodeAt(goalGraph, goal.col, goal.row);
    if (startNode < 0 || goalNode < 0) return null;

    const maps = new Set(options.maps ?? NAV_REACHABLE[start.mapId] ?? [start.mapId]);

    // stateKey is not injective across maps, so keep the best cost per key in a Map.
    const best = new Map<number, number>();
    const settled = new Set<number>();
    const states: State[] = [];
    const indexOfState = new Map<number, number>();
    const open = new Heap();

    const initial: State = {
        mapId: start.mapId, node: startNode, keysOrd: 0, keysLion: 0,
        g: 0, f: heuristic(start.mapId, startNode, goalGraph, goalNode),
        parent: -1, via: -1, viaCost: 0,
    };
    states.push(initial);
    indexOfState.set(stateKey(initial), 0);
    best.set(stateKey(initial), 0);
    open.push(initial);

    let expanded = 0;
    let goalState = -1;

    while (open.size > 0) {
        const current = open.pop()!;
        const key = stateKey(current);
        if (settled.has(key)) continue;
        settled.add(key);
        const currentIndex = indexOfState.get(key)!;
        expanded++;
        if (expanded > limit) break;

        if (current.mapId === goal.mapId && current.node === goalNode) {
            goalState = currentIndex;
            break;
        }

        const graph = store.get(current.mapId)!;
        const hazard = graph.nodeHazard;

        // ── hops inside this map ──
        const from = graph.edgeOffsets[current.node]!;
        const to = graph.edgeOffsets[current.node + 1]!;
        for (let i = from; i < to; i++) {
            const edge = graph.edges[i]!;
            if (!permitted(edge.req, edge.to, hazard, caps)) continue;
            relax(
                current, currentIndex, current.mapId, edge.to, edge.kind, edge.cost,
                current.keysOrd, current.keysLion, states, best, settled, indexOfState,
                open, goalGraph, goalNode,
            );
        }

        // ── a door onto another map ──
        const portalIndex = graph.portalAtNode[current.node]!;
        if (portalIndex >= 0) {
            const portal = PORTALS[portalIndex]!;
            if (portal.toTown || !maps.has(portal.destMapId)) continue;
            const dest = store.get(portal.destMapId);
            if (!dest) continue;
            // The hero's left column is the portal's arrival, in standing terms.
            const landing = nodeAt(dest, portal.toX, portal.toY);
            if (landing < 0) continue;
            let keysOrd = current.keysOrd;
            let keysLion = current.keysLion;
            let cost: number = EDGE_COST.DOOR;
            if (portal.key === 2) {
                if (keysLion >= caps.lionKeys) continue;
                keysLion++;
                cost = EDGE_COST.DOOR_LOCKED;
            } else if (portal.key === 1) {
                if (keysOrd >= caps.keys) continue;
                keysOrd++;
                cost = EDGE_COST.DOOR_LOCKED;
            }
            relax(
                current, currentIndex, portal.destMapId, landing, EDGE.DOOR, cost,
                keysOrd, keysLion, states, best, settled, indexOfState,
                open, goalGraph, goalNode,
            );
        }
    }

    if (goalState < 0) return null;
    const route = describeRoute(states, goalState, store);
    return { ...route, expanded };
}

/** Push a successor unless a cheaper route to the same state is already queued. */
function relax(
    parent: State,
    parentIndex: number,
    mapId: number,
    node: number,
    kind: number,
    cost: number,
    keysOrd: number,
    keysLion: number,
    states: State[],
    best: Map<number, number>,
    settled: Set<number>,
    indexOfState: Map<number, number>,
    open: Heap,
    goalGraph: NavGraph,
    goalNode: number,
): void {
    const g = parent.g + cost;
    const candidate: State = {
        mapId, node, keysOrd, keysLion, g,
        f: g + heuristic(mapId, node, goalGraph, goalNode),
        parent: parentIndex, via: kind, viaCost: cost,
    };
    const key = stateKey(candidate);
    const seen = best.get(key);
    if (seen !== undefined && seen <= g) return;
    best.set(key, g);
    if (settled.has(key)) return;
    indexOfState.set(key, states.length);
    states.push(candidate);
    open.push(candidate);
}

/** Walk the predecessor chain into a NavRoute. */
function describeRoute(
    states: State[],
    goalState: number,
    store: NavGraphStore,
): NavRoute {
    const chain: State[] = [];
    for (let i = goalState; i >= 0; i = states[i]!.parent) {
        chain.push(states[i]!);
        if (states[i]!.parent < 0) break;
    }
    chain.reverse();

    const points: NavPoint[] = chain.map((s) => {
        const graph = store.get(s.mapId)!;
        const node = graph.nodes[s.node]!;
        return { mapId: s.mapId, col: node.col, row: node.row, node: s.node };
    });

    const hops: NavHop[] = [];
    let usesPlatforms = false;
    let usesCurrents = false;
    let crossesAggressiveGround = false;
    let crossesSlopes = false;
    if (chain.length === 0) throw new Error('describeRoute: empty chain');
    for (let i = 1; i < chain.length; i++) {
        const from = points[i - 1]!;
        const to = points[i]!;
        hops.push({ kind: chain[i]!.via, cost: chain[i]!.viaCost, from, to });
        if (chain[i]!.via === EDGE.RIDE_V || chain[i]!.via === EDGE.RIDE_H
            || chain[i]!.via === EDGE.BOARD || chain[i]!.via === EDGE.ALIGHT
            || chain[i]!.via === EDGE.DROP) {
            usesPlatforms = true;
        }
        if (chain[i]!.via === EDGE.LIFT || chain[i]!.via === EDGE.CARRY_L
            || chain[i]!.via === EDGE.CARRY_R) {
            usesCurrents = true;
        }
        const graph = store.get(to.mapId)!;
        const hazard = graph.nodeHazard[to.node]!;
        if (hazard & HAZARD_AGGRESSIVE) crossesAggressiveGround = true;
        if (hazard & HAZARD_SLOPE) crossesSlopes = true;
    }

    const maps: number[] = [];
    for (const p of points) {
        if (maps[maps.length - 1] !== p.mapId) maps.push(p.mapId);
    }

    const last = chain[chain.length - 1]!;
    return {
        points,
        hops,
        cost: last.g,
        keysSpent: { ordinary: last.keysOrd, lion: last.keysLion },
        maps,
        crossesAggressiveGround,
        crossesSlopes,
        usesPlatforms,
        usesCurrents,
        expanded: 0,
    };
}

/** Maps the hero can be routed between from a given map. */
export function reachableMaps(mapId: number): readonly number[] {
    return NAV_REACHABLE[mapId] ?? [mapId];
}

/** Name of a map, for diagnostics and test failure messages. */
export function mapName(mapId: number): string {
    return NAV_MAP_BY_ID.get(mapId)?.nameKey ?? `map${mapId}`;
}
