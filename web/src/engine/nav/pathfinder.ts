

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

import { EDGE, EDGE_COST, KEY_LION, KEY_ORDINARY } from './types.js';
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

/** A shoe the route needs, and where it first needs it. */
export interface NavRequirement {
    /** Accessory id, as `ACCESSORY_*` in capabilities.ts. */
    readonly accessory: number;
    /** Locale key naming it, e.g. `items.silkarn`. */
    readonly label: string;
    /** The point on the route where it is first required. */
    readonly at: NavPoint;
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
    /** Keys the route *spends* opening doors. */
    readonly keysSpent: { ordinary: number; lion: number };
    /**
     * Keys the route picks up on the way, by kind.
     *
     * Only non-zero when the search was told it may collect: without that the route
     * walks past whatever lies on the floor, which is what a route drawn for the keys
     * already in the pocket means.
     */
    readonly keysGained: { ordinary: number; lion: number };
    /**
     * Shoes the route needs, in the order it needs them, with the point each is
     * first required at. Empty when the hero can walk the whole route as he is.
     */
    readonly equipment: readonly NavRequirement[];
    /**
     * Locked doors on the route, by kind — how many keys the journey *needs*.
     *
     * This is what makes "the destination needs one key" a fact rather than a
     * shrug, and it is the first thing to know when a route cannot be drawn because
     * the hero's pocket is empty.
     */
    readonly lockedDoors: { ordinary: number; lion: number };
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
/**
 * The bits that mean "wear these shoes": every ability the accessory grants, keys
 * excluded because a key is something he picks up rather than puts on.
 */
const SHOE_BITS: readonly (readonly [number, number, string])[] = [
    [CAP.JUMP_HIGH, 1, 'feruza'],
    [CAP.SLOPE_STAND, 3, 'silkarn'],
    [CAP.GROUND_SAFE, 2, 'pirika'],
    [CAP.ICE_SAFE, 4, 'ruzeria'],
    [CAP.HEAT_SAFE, 5, 'asbestos'],
];

/** The mask that lets the search plan a route the hero can walk in shoes. */
const SHOE_MASK = SHOE_BITS.reduce((mask, [bit]) => mask | bit, 0);

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
    /** What the edge required; meaningless at the start. */
    readonly viaReq: number;
}

/**
 * Pack a state into one number.
 *
 * Node counts are per map and well under 2^18 even for the largest cavern, so
 * node < 2^18, keys < 8 and 31 maps pack losslessly into a double.
 */
const NODE_LIMIT = 1 << 18;
/**
 * Six bits per key counter, so both are held counts rather than a single spent
 * total: a state that picks a key up and a state that did not are different
 * states, which is the whole point of the dimension. 63 of each is not a practical
 * limit — a route through 63 locked doors is not a route — and `holdCap` enforces
 * it by saturating rather than overflowing into the neighbouring field, which
 * would collide states and turn the search into a wrong answer instead of an error.
 */
const stateKey = (s: State): number =>
    s.mapId * NODE_LIMIT * 4096 + s.node * 4096 + s.keysOrd * 64 + s.keysLion;

/** Most keys of one kind a state may hold. Saturating, so the key stays unique. */
const HOLD_CAP = 63;

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
    /**
     * Plan for shoes the hero can put on, rather than refusing those hops.
     *
     * A high jump wants Feruza shoes, a slope wants Silkarn's, and the hero can
     * change accessory in a shop, so refusing them makes the route take the long way
     * round something he could simply walk over. With this set, the search may use
     * them and the route says which ones and where, in order — *wear Silkarn shoes,
     * jump on the slope, wear Feruza shoes again* — because a route that needs three
     * changes of shoes is a different journey from one that needs none, and the
     * player has to be told.
     *
     * Keys are not equipment and stay a resource: they must already be in hand.
     */
    readonly planAccessories?: boolean;
    /**
     * Route as if the hero were carrying every key in the game: locked doors cost
     * nothing and the counters are seeded at the cap.
     *
     * This is the first of the three stages in §19.3. Its answer is the *shape* of
     * the journey, and counting the locked doors on it says how many keys the player
     * needs before the second stage is worth running.
     */
    readonly unlimitedKeys?: boolean;
    /**
     * Let the route go and collect keys on the way: stepping onto a node with a key
     * on it grants one, and a locked door spends one.
     *
     * Off by default, so every existing route keeps its meaning: without it the
     * search may only spend what the hero already holds, which is what a route drawn
     * for the pocket he has actually got can promise.
     */
    readonly collectKeys?: boolean;
    /**
     * Whether a key is still lying at `(mapId, col, row)`. Defaults to "yes".
     *
     * A key the player has already taken is not in the world — the engine drops it
     * from the list at dungeon init (`remove_accomplished_items`,
     * engine/dungeon-init.ts:75) — so a table entry means "there was one here",
     * not "there is one here now".
     */
    readonly keyPresent?: (mapId: number, col: number, row: number, kind: 0 | 1) => boolean;
    /**
     * Only collect keys on maps of this cavern level.
     *
     * §19.3 stage two: "in the nearby maps of the same cavern level". A key on
     * another level is reachable only through a door, and routing the detour through
     * one produces a journey no player would draw.
     */
    readonly keyCavernLevel?: number;
}

const DEFAULT_LIMIT = 400000;

/**
 * The key count after stepping onto `node`: a key lying there is picked up, because
 * that is what walking over it does (`flag_16` / `flag_17`,
 * engine/dungeon-items.ts:339-350). Only when the search is allowed to collect, the
 * key is still there, and the map is on the level the hero is on.
 *
 * Saturating at {@link HOLD_CAP} keeps `stateKey` injective; a route that wanted a
 * 64th key is not a route, and the saturated state is the same for every route that
 * wanted one.
 */
function keysAfterPickup(
    graph: NavGraph,
    state: State,
    node: number,
    options: FindRouteOptions,
): number {
    if (!options.collectKeys) return state.keysOrd;
    // Only an *ordinary* key counts here: a Lion-Head key is a different resource
    // and must not open an ordinary door. Granting both was a silent way to walk
    // through a locked cavern.
    if (graph.keyKindAt[node] !== KEY_ORDINARY) return state.keysOrd;
    if (options.keyCavernLevel !== undefined) {
        const meta = NAV_MAP_BY_ID.get(state.mapId);
        if (meta && meta.cavernLevel !== options.keyCavernLevel) return state.keysOrd;
    }
    // Asked about the key's *record*, not the node: the two differ on every key in
    // the game, and the record is what the engine holds.
    const cell = graph.keyCellAt[node]!;
    if (options.keyPresent && !options.keyPresent(
        state.mapId, cell % graph.mapWidth, (cell / graph.mapWidth) | 0, 0,
    )) {
        return state.keysOrd;
    }
    return Math.min(state.keysOrd + 1, HOLD_CAP);
}

function keysLionAfterPickup(
    graph: NavGraph,
    state: State,
    node: number,
    options: FindRouteOptions,
): number {
    if (!options.collectKeys) return state.keysLion;
    if (graph.keyKindAt[node] !== KEY_LION) return state.keysLion;
    if (options.keyCavernLevel !== undefined) {
        const meta = NAV_MAP_BY_ID.get(state.mapId);
        if (meta && meta.cavernLevel !== options.keyCavernLevel) return state.keysLion;
    }
    const cell = graph.keyCellAt[node]!;
    if (options.keyPresent && !options.keyPresent(
        state.mapId, cell % graph.mapWidth, (cell / graph.mapWidth) | 0, 1,
    )) return state.keysLion;
    return Math.min(state.keysLion + 1, HOLD_CAP);
}

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
    const unlimitedKeys = options.unlimitedKeys === true;
    // When the route may count on shoes the hero can put on, the search treats those
    // abilities as available and reports what it used.
    const effective: HeroCapabilities = options.planAccessories
        ? { ...caps, mask: caps.mask | SHOE_MASK }
        : caps;

    // stateKey is not injective across maps, so keep the best cost per key in a Map.
    const best = new Map<number, number>();
    const settled = new Set<number>();
    const states: State[] = [];
    const indexOfState = new Map<number, number>();
    const open = new Heap();

    const initial: State = {
        mapId: start.mapId, node: startNode, viaReq: 0,
        keysOrd: options.unlimitedKeys ? HOLD_CAP : Math.min(caps.keys, HOLD_CAP),
        keysLion: options.unlimitedKeys ? HOLD_CAP : Math.min(caps.lionKeys, HOLD_CAP),
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
            if (!permitted(edge.req, edge.to, hazard, effective)) continue;
            relax(
                current, currentIndex, current.mapId, edge.to, edge.kind, edge.cost, edge.req,
                keysAfterPickup(graph, current, edge.to, options),
                keysLionAfterPickup(graph, current, edge.to, options),
                states, best, settled, indexOfState,
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
                // A closed door with the Lion-Head feature bit costs a Lion-Head key.
                // Under `unlimitedKeys` the search is told to assume every key in the
                // game, so it pays nothing and does not decrement.
                if (!unlimitedKeys) {
                    if (keysLion < 1) continue;
                    keysLion--;
                }
                cost = EDGE_COST.DOOR_LOCKED;
            } else if (portal.key === 1) {
                if (!unlimitedKeys) {
                    if (keysOrd < 1) continue;
                    keysOrd--;
                }
                cost = EDGE_COST.DOOR_LOCKED;
            }
            // portal.key === 0 is an open door: walked through, costing nothing.
            relax(
                current, currentIndex, portal.destMapId, landing, EDGE.DOOR, cost,
                portal.key === 2 ? CAP.LION_KEY : (portal.key === 1 ? CAP.KEY : 0),
                keysOrd, keysLion, states, best, settled, indexOfState,
                open, goalGraph, goalNode,
            );
        }
    }

    if (goalState < 0) return null;
    const route = describeRoute(states, goalState, store, unlimitedKeys);
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
    req: number,
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
        parent: parentIndex, via: kind, viaCost: cost, viaReq: req,
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

/** The shoes an edge's requirement asks for, if any. */
function shoeFor(req: number): { accessory: number; label: string } | null {
    for (const [bit, accessory, label] of SHOE_BITS) {
        if ((req & bit) !== 0) return { accessory, label };
    }
    return null;
}

/** Walk the predecessor chain into a NavRoute. */
function describeRoute(
    states: State[],
    goalState: number,
    store: NavGraphStore,
    /** The search was told to assume every key in the game. */
    assumeKeys = false,
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

    // Counted from the hops rather than from the counters, so every number describes
    // the route the player is shown: a locked door costs one key of its kind, and a
    // Shoes, in the order the route needs them. A hop that requires one is a hop the
    // hero can only take equipped, so the route says so rather than letting him walk
    // into a slope that throws him back down the hill.
    const equipment: NavRequirement[] = [];
    for (let i = 1; i < chain.length; i++) {
        const worn = shoeFor(chain[i]!.viaReq);
        if (!worn) continue;
        const last = equipment[equipment.length - 1];
        if (last && last.accessory === worn.accessory) continue;
        equipment.push({ accessory: worn.accessory, label: worn.label, at: points[i]! });
    }

    // pickup is a hop that raised a counter.
    const lockedDoors = { ordinary: 0, lion: 0 };
    const picked = { ordinary: 0, lion: 0 };
    for (let i = 1; i < chain.length; i++) {
        if (chain[i]!.keysOrd > chain[i - 1]!.keysOrd) picked.ordinary++;
        if (chain[i]!.keysLion > chain[i - 1]!.keysLion) picked.lion++;
    }
    for (let i = 1; i < chain.length; i++) {
        const via = chain[i]!.via;
        if (via !== EDGE.DOOR) continue;
        // The portal belongs to the map the hop *leaves*, so both the graph and the
        // node come from the previous state.
        const graph = store.get(chain[i - 1]!.mapId)!;
        const portalIndex = graph.portalAtNode[chain[i - 1]!.node]!;
        if (portalIndex < 0) continue;
        const portal = PORTALS[portalIndex]!;
        if (!portal) continue;
        if (portal.key === 2) lockedDoors.lion++;
        else if (portal.key === 1) lockedDoors.ordinary++;
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
        // Under `unlimitedKeys` the keys were assumed rather than fetched, so nothing
        // was taken and nothing was picked up; `lockedDoors` is then what the
        // journey *needs*.
        keysSpent: assumeKeys ? { ordinary: 0, lion: 0 } : { ...lockedDoors },
        keysGained: assumeKeys ? { ordinary: 0, lion: 0 } : picked,
        equipment,
        lockedDoors,
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
