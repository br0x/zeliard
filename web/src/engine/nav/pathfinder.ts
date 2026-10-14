/**
 * pathfinder.ts — A* across a cavern component.
 *
 * The graph is per-map; a route may cross a dozen of them, so a search node is
 * `(mapId, localNode, keysSpentOrdinary, keysSpentLion)`. The key counters are
 * part of the state rather than a large edge penalty, because spending a key is
 * irreversible — a route that "borrows" three keys and needs four is not a route.
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
import { samePlatformPlaces, type PlatformPlaces } from './platform-state.js';
import { PORTALS, NAV_BOSS_EXITS } from '../../data/nav/nav-portals.js';
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

/**
 * One hop of a route, mirroring the edge that produced it.
 *
 * `doorKey` is the key kind a crossing costs: 0 none (an open door, or not a
 * door), 1 ordinary, 2 Lion-Head. The cost says *that* a door was locked; this
 * says which pocket paid for it. A consumer that has to answer "can he still open
 * what is left of this?" from the route alone needs both.
 */
export interface NavHop {
    readonly kind: number;
    readonly cost: number;
    readonly from: NavPoint;
    readonly to: NavPoint;
    readonly doorKey: number;
}

/** A key the route collects, as an index into {@link NavRoute.points}. */
export interface NavPick {
    /** Index of the standing position the key lies on. */
    readonly at: number;
    /** 0 ordinary, 1 Lion-Head — the pocket it goes into. */
    readonly kind: number;
}

/**
 * What a route was planned under, so a later search can repeat it.
 *
 * `findRoute` answers differently depending on these: a route planned with
 * `collectKeys` walks to a key the hero does not have, and re-planning it without
 * that flag asks for a route from a hero who still has nothing. The door state is
 * here for the same reason: a door the player has opened is open for good and
 * costs nothing.
 */
export type NavRoutePlan = Pick<FindRouteOptions,
    'collectKeys' | 'collectAccessories' | 'planAccessories'
    | 'keyPresent' | 'shoePresent' | 'doorOpen'>;

export interface NavRoute {
    readonly points: readonly NavPoint[];
    readonly hops: readonly NavHop[];
    /** Total cost in game ticks, one tick per tile of movement. */
    readonly cost: number;
    /** Keys the route *spends* opening doors. */
    readonly keysSpent: { ordinary: number; lion: number };
    /** Keys the route picks up on the way, by kind. */
    readonly keysGained: { ordinary: number; lion: number };
    /**
     * Shoes the route needs, in the order it needs them, with the point each is
     * first required at. Empty when the hero can walk the whole route as he is.
     */
    readonly equipment: readonly NavRequirement[];
    /** Locked doors on the route, by kind — how many keys the journey *needs*. */
    readonly lockedDoors: { ordinary: number; lion: number };
    /** The keys this route collects, as point indices. */
    readonly picks: readonly NavPick[];
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
export const SHOE_MASK = SHOE_BITS.reduce((mask, [bit]) => mask | bit, 0);

/** Handed back for a cavern nobody has reported a platform position for. */
const NO_PLATFORM_PLACES: PlatformPlaces = new Map();

export class NavGraphStore {
    private readonly graphs = new Map<number, NavGraph>();
    private readonly grids = new Map<number, NavTileGrid>();
    /** Maps whose MDT failed to decode, so they are not retried every frame. */
    private readonly failed = new Set<number>();
    /** Bytes obtained from the fetcher, kept so `get` can see them. */
    private readonly fetched = new Map<number, Uint8Array>();
    /**
     * Where each cavern's platforms stand, by left column.
     *
     * A reading of engine memory, not of map data, and it is read for whichever
     * cavern the hero is standing in — so it holds every other cavern at whatever
     * arrangement he last left it in, mid-ride included. See {@link reset}.
     */
    private readonly places = new Map<number, PlatformPlaces>();

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
     * Record where a cavern's platforms stand.
     *
     * A platform is three solid tiles the hero drives up and down, and a graph
     * built a moment ago can be wrong twice over: it may have drawn a solid wall
     * where the platform has since gone, or offered a landing on the far side of a
     * platform that has since moved under him.
     *
     * The graph is *not* dropped here, only marked by comparison: `get` rebuilds
     * it the next time anybody asks.
     *
     * @returns true when anything moved, so the caller can re-plan
     */
    setPlatformPlaces(mapId: number, places: PlatformPlaces): boolean {
        const before = this.places.get(mapId);
        if (before && samePlatformPlaces(before, places)) return false;
        const graph = this.graphs.get(mapId);
        // The reading is recorded first and the answer worked out afterwards,
        // because the two questions are different. The first report is news even
        // when it agrees with `startY`: nothing has been said before, so the graph
        // in hand was built on the generated assumption.
        const first = !before;
        this.places.set(mapId, new Map(places));
        if (first) return true;
        return !(graph && samePlatformPlaces(graph.platforms.places, places));
    }

    /**
     * Where a cavern's platforms stand as of the last reading.
     *
     * Empty until something has told the store, and empty means "wherever the
     * generated `startY` says".
     */
    platformPlaces(mapId: number): PlatformPlaces {
        return this.places.get(mapId) ?? NO_PLATFORM_PLACES;
    }

    /**
     * The graph if one has been built, without building one.
     *
     * For the questions where building costs far more than the answer: "is the
     * hero standing on a node?" is asked every tick, and a lift ride changes the
     * platform arrangement on every one of them.
     */
    peek(mapId: number): NavGraph | null {
        return this.graphs.get(mapId) ?? null;
    }

    /**
     * Graph for a map, building it on first use.
     *
     * Returns null when the MDT is unavailable **or malformed**. A decoder failure
     * must not escape: this is called from the key handler, and an exception there
     * would surface as an uncaught error and swallow the key press.
     */
    get(mapId: number): NavGraph | null {
        const places = this.places.get(mapId);
        const cached = this.graphs.get(mapId);
        if (cached) {
            // A graph built over an older arrangement is not merely stale, it is
            // wrong: the platform it treated as solid has moved, and the row it
            // offered as a landing is not the one the platform is at.
            if (!places || samePlatformPlaces(cached.platforms.places, places)) return cached;
            this.graphs.delete(mapId);
        }
        if (this.failed.has(mapId)) return null;
        // Bytes fetched on demand take precedence over the source, so a fetcher
        // does not have to publish into the source's own cache.
        const bytes = this.fetched.get(mapId) ?? this.source(mapId);
        if (!bytes) return null;
        try {
            const grid = decodeTileGrid(bytes, 0, mapId);
            this.grids.set(mapId, grid);
            const graph = buildNavGraph(mapId, grid, places);
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
        this.places.clear();
    }

    /**
     * Forget every reading taken out of live engine memory.
     *
     * A graph is built from map data *and* from where the platforms stood when it
     * was asked for, and only the second half is a reading of the machine. It is
     * also a reading of the *current* cavern and of nothing else.
     *
     * That is stale the moment the world is replaced. A platform snaps back to
     * `startY` when its cavern is entered through a door, so the arrangement the
     * store remembers is not the one the hero will find. Restoring a save is
     * exactly that, and so is any other tear-down that does not go through the
     * dungeon frame.
     *
     * Map *data* is left alone.
     */
    reset(): void {
        this.graphs.clear();
        this.grids.clear();
        this.places.clear();
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
    /** Pairs picked up and still carried: one bit per `NavShoe`, zero when none. */
    readonly shoes: number;
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
 * node < 2^18, keys < 64, the shoe mask < 16 and 31 maps pack losslessly into a
 * double.
 */
const NODE_LIMIT = 1 << 18;
/**
 * Six bits per key counter, so both are held counts rather than a single spent
 * total: a state that picks a key up and a state that did not are different
 * states, which is the whole point of the dimension. `holdCap` enforces it by
 * saturating rather than overflowing into the neighbouring field.
 */
const stateKey = (s: State): number =>
    s.mapId * NODE_LIMIT * 65536 + s.node * 65536 + s.shoes * 4096
    + s.keysOrd * 64 + s.keysLion;

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

/**
 * Where to plot from or to, before the graph resolves it to a node.
 *
 * `findRoute` takes these rather than {@link NavPoint}s on purpose: the hero's
 * position is known as a cell, and `nodeAt` turns it into a node index.
 */
export interface NavEndpoint {
    readonly mapId: number;
    readonly col: number;
    readonly row: number;
}

export interface FindRouteOptions {
    /** Graph source. Only maps the MDT is loaded for can be searched. */
    readonly store: NavGraphStore;
    readonly caps: HeroCapabilities;
    /** Where the hero stands. */
    readonly start: NavEndpoint;
    /** Where the player clicked. Must resolve to a node; see nearestNode. */
    readonly goal: NavEndpoint;
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
     * Changing shoes costs the hero nothing and takes no time, so a route that
     * needs them is a real route. With this set the search may use them, and the
     * route says which ones and where, in order.
     */
    readonly planAccessories?: boolean;
    /**
     * Let the route go and pick a pair of shoes up on the way, the way
     * {@link collectKeys} lets it go and get a key.
     *
     * A pair is an item lying in the cavern: walking over it puts it in the hero's
     * inventory and it stays there. Unlike a key, nothing is spent, so the search
     * only ever adds a pair.
     */
    readonly collectAccessories?: boolean;
    /**
     * Is a pair still lying where the generated table says, or has the player
     * taken it? The table is the original data, and the engine drops a collected
     * item at dungeon init (engine/dungeon-init.ts:75).
     */
    readonly shoePresent?: (
        mapId: number, col: number, row: number, shoe: number,
    ) => boolean;
    /**
     * Route as if the hero were carrying every key in the game: locked doors cost
     * nothing and the counters are seeded at the cap.
     *
     * Its answer is the *shape* of the journey, and counting the locked doors on it
     * says how many keys the player needs before the second stage is worth running.
     */
    readonly unlimitedKeys?: boolean;
    /**
     * Let the route go and collect keys on the way: stepping onto a node with a key
     * on it grants one, and a locked door spends one.
     *
     * Off by default, so without it the search may only spend what the hero already
     * holds.
     */
    readonly collectKeys?: boolean;
    /**
     * Whether a key is still lying at `(mapId, col, row)`. Defaults to "yes".
     *
     * A key the player has already taken is not in the world — the engine drops it
     * from the list at dungeon init (`remove_accomplished_items`,
     * engine/dungeon-init.ts:75) — so a table entry means "there was one here", not
     * "there is one here now".
     */
    /**
     * Does the door at `(mapId, x0, y0)` stand open right now, or null for unknown.
     *
     * A key is spent once and its door is then open for good. Asking only about
     * keys makes a hero who has been through a locked door once unable to plan a
     * route back through it.
     *
     * Null means the answer is not known — the engine keeps a door table for the
     * loaded cavern only — and the level data is used instead.
     */
    readonly doorOpen?: (mapId: number, x0: number, y0: number) => boolean | null;
    readonly keyPresent?: (mapId: number, col: number, row: number, kind: 0 | 1) => boolean;
    /**
     * Only collect keys on maps of this cavern level.
     *
     * A key on another level is reachable only through a door, and routing the
     * detour through one produces a journey no player would draw.
     */
    readonly keyCavernLevel?: number;
}

const DEFAULT_LIMIT = 400000;

/**
 * The key count after stepping onto `node`: a key lying there is picked up,
 * because that is what walking over it does (`flag_16` / `flag_17`,
 * engine/dungeon-items.ts:339-350). Only when the search is allowed to collect,
 * the key is still there, and the map is on the level the hero is on.
 *
 * Saturating at {@link HOLD_CAP} keeps `stateKey` injective.
 */
function keysAfterPickup(
    graph: NavGraph,
    state: State,
    node: number,
    options: FindRouteOptions,
): number {
    if (!options.collectKeys) return state.keysOrd;
    // Only an *ordinary* key counts here: a Lion-Head key is a different resource
    // and must not open an ordinary door.
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
 * The pairs the hero is carrying after stepping onto `node`.
 *
 * A pair is added, never removed: it is an inventory, not a purse. There are four
 * in the whole game and none is duplicated, so a bit per kind is the whole state.
 */
function shoesAfterPickup(
    graph: NavGraph,
    state: State,
    node: number,
    options: FindRouteOptions,
): number {
    if (!options.collectAccessories) return state.shoes;
    const shoe = graph.accessoryShoeAt[node]!;
    if (shoe === 0) return state.shoes;
    const bit = 1 << (shoe - 1);
    if ((state.shoes & bit) !== 0) return state.shoes;
    // Asked about the pair's *record*, not the node, exactly as a key is.
    const cell = graph.accessoryCellAt[node]!;
    if (options.shoePresent && !options.shoePresent(
        state.mapId, cell % graph.mapWidth, (cell / graph.mapWidth) | 0, shoe,
    )) {
        return state.shoes;
    }
    return state.shoes | bit;
}

/**
 * The pairs the hero is already wearing when the route starts, as the same bit
 * mask {@link shoesAfterPickup} uses — so a pair he has on counts from the first
 * step and does not have to be walked to.
 */
function wornShoeMask(caps: HeroCapabilities): number {
    let shoes = 0;
    for (const [bit, accessory] of SHOE_BITS) {
        if ((caps.mask & bit) !== 0) shoes |= 1 << (accessory - 1);
    }
    return shoes;
}

/** The capabilities a state's carried pairs add to what he already wears. */
function maskWithShoes(caps: HeroCapabilities, shoes: number): HeroCapabilities {
    let mask = caps.mask;
    if (shoes !== 0) {
        for (const [bit, accessory] of SHOE_BITS) {
            if ((shoes & (1 << (accessory - 1))) !== 0) mask |= bit;
        }
    }
    return mask === caps.mask ? caps : { ...caps, mask };
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
    const route = search(options);
    if (!options.collectKeys) return route;
    // The one-shot answer is checked before it is believed, because a key is on
    // the floor until he walks over it *once* and the search's counter cannot tell
    // the difference — see {@link claimsAreOnTheFloor}.
    if (route && claimsAreOnTheFloor(route, options)) return route;
    return searchViaKey(options);
}

/**
 * Does every key the route claims to have picked up exist on the floor?
 *
 * `keysAfterPickup` is a function of the node the hero steps onto, not of the path
 * he took to it: walk over a key and the counter goes up, walk back over it and it
 * goes up again. The engine's is not like that — a key is *there* until he walks
 * over it, and then it is in his pocket and not there any more (`flag_16`,
 * dungeon-items.ts:414) — so a search that walks over one key twice collects two.
 *
 * The check is the engine's own: walk the route's points, count each key record
 * once however many times the hero crosses it, and ask whether there are that
 * many.
 */
function claimsAreOnTheFloor(route: NavRoute, options: FindRouteOptions): boolean {
    // Under `unlimitedKeys` the keys were assumed rather than fetched, so nothing
    // is claimed and nothing is counted; there is nothing here to doubt.
    if (route.keysGained.ordinary === 0 && route.keysGained.lion === 0) return true;
    const walked = { ordinary: 0, lion: 0 };
    const taken = new Set<string>();
    // From 1: `describeRoute` counts a pickup as a counter *rise*, so the cell he
    // starts on is not one the route claims anything for.
    for (let i = 1; i < route.points.length; i++) {
        const point = route.points[i]!;
        const graph = options.store.get(point.mapId);
        if (!graph) continue;
        const kind = keyOnFloor(graph, point, options, taken);
        if (kind === KEY_ORDINARY) walked.ordinary++;
        else if (kind === KEY_LION) walked.lion++;
        if (kind !== 0) taken.add(`${point.mapId}/${point.node}`);
    }
    return walked.ordinary >= route.keysGained.ordinary
        && walked.lion >= route.keysGained.lion;
}

/**
 * A journey that has to fetch keys and then *come back and use them* does not fit
 * in one frontier.
 *
 * The state dimension that holds keys is what makes a pickup visible to the rest
 * of the journey, and it is also what makes such a journey unfindable in practice.
 * The search settles every state it can reach while still holding no key before it
 * ever sees one — and "still holding no key" covers the whole of every cavern on
 * the level, because nothing about the goal tells it which of them is worth
 * leaving alone.
 *
 * So split it. The *shape* of what is left is asked for first, under
 * `unlimitedKeys`, where keys are free and the state space has no key dimension at
 * all — that answers in a few thousand expansions and says how many keys the rest
 * of the journey costs. If he is carrying that many, the rest is one ordinary
 * search and this is over. Otherwise a key of a kind he is short of is tried as a
 * *waypoint*: walk to it, count the keys lying where he walks, subtract the ones
 * the walk spent, and ask the same question again from where he now stands — one
 * key deeper, until the rest of the journey is payable.
 *
 * Each leg is walked with `collectKeys` off on purpose: the pickup dimension is
 * the part that floods, and a leg whose goal is a key does not need it. The keys
 * are counted from the points the leg actually visits.
 */

/** Keys the journey may go and fetch before it gives up on it. */
const MAX_KEY_FETCHES = 3;

/** Waypoints tried at each fetch, cheapest first; deeper fetches try fewer. */
const KEY_FETCH_TRIES = [6, 4, 4];

function searchViaKey(options: FindRouteOptions): NavRoute | null {
    const { keyPresent: _keyPresent, ...plain } = options;
    // With every key free there is nothing to go and fetch: the one-shot search
    // above failed on its budget rather than on a key, and the pickup dimension —
    // which still branches, and still floods — is all that is missing.
    if (options.unlimitedKeys) {
        const { collectKeys: _collectKeys, ...held } = plain;
        return search(held);
    }
    return fetchNextKey(options, plain, new Set(), 0);
}

/**
 * The rest of the journey, fetched one key at a time.
 *
 * `taken` holds every key node already walked over on the way here, so the next
 * fetch cannot ask for a key he has taken; `depth` is how many keys were fetched
 * to get here, and bounds the branching each fetch costs.
 */
function fetchNextKey(
    options: FindRouteOptions,
    plain: FindRouteOptions,
    taken: ReadonlySet<string>,
    depth: number,
): NavRoute | null {
    const { store, caps, start, goal } = options;

    // What is left of the journey, and which keys it costs. `unlimitedKeys` seeds
    // the counters and pays for nothing, so `lockedDoors` is the demand and the
    // key dimension never branches: this is the cheap question.
    const shape = search({ ...plain, collectKeys: false, unlimitedKeys: true, caps, start, goal });
    if (!shape) return null;
    const needOrdinary = shape.lockedDoors.ordinary;
    const needLion = shape.lockedDoors.lion;

    // He already carries what the rest costs. Then nothing is missing and the
    // one-shot search failed on its budget rather than on a key.
    if (caps.keys >= needOrdinary && caps.lionKeys >= needLion) {
        const { collectKeys: _collectKeys, ...held } = plain;
        const direct = search({ ...held, caps, start, goal });
        if (direct) return direct;
        // The shape counts the doors on *a* route, not on every route: when it
        // promised keys he has and the honest search still fails, the journey
        // costs more keys than the shape does, and fetching is the answer.
        if (needOrdinary + needLion === 0) return null;
    }

    if (depth >= MAX_KEY_FETCHES) return null;

    // Every key of a needed kind he could still pick up, scored by how far out of
    // the way it is. The score search is the same cheap one as the shape.
    const maps = [...(options.maps ?? NAV_REACHABLE[start.mapId] ?? [start.mapId])];
    const candidates: { point: NavPoint; lion: boolean; score: number }[] = [];
    for (const mapId of maps) {
        const graph = store.get(mapId);
        if (!graph) continue;
        for (let node = 0; node < graph.nodes.length; node++) {
            const kind = graph.keyKindAt[node]!;
            if (kind !== KEY_LION && kind !== KEY_ORDINARY) continue;
            const lion = kind === KEY_LION;
            // Only a kind the journey still costs is worth a leg for.
            if (lion ? needLion === 0 : needOrdinary === 0) continue;
            if (taken.has(`${mapId}/${node}`)) continue;
            const cell = graph.keyCellAt[node]!;
            if (cell < 0) continue;
            const col = cell % graph.mapWidth;
            const row = (cell / graph.mapWidth) | 0;
            // Asked about the key's *record*, not its node, the same way the pickup
            // itself is.
            if (options.keyPresent && !options.keyPresent(mapId, col, row, lion ? 1 : 0)) continue;
            const node2 = graph.nodes[node]!;
            const point: NavPoint = { mapId, col: node2.col, row: node2.row, node };
            const scored = search({
                ...plain, collectKeys: false, unlimitedKeys: true, caps, start, goal: point,
            });
            if (!scored) continue;
            candidates.push({ point, lion, score: scored.cost });
        }
    }
    candidates.sort((a, b) => a.score - b.score);

    let best: NavRoute | null = null;
    const tries = KEY_FETCH_TRIES[Math.min(depth, KEY_FETCH_TRIES.length - 1)]!;
    for (const candidate of candidates.slice(0, tries)) {
        // Walk to the key as if he means to pick nothing up: the pickup dimension
        // is what floods, and the key is where the walk ends, so the accounting
        // below counts it without the search branching on it.
        const leg = search({
            ...plain, collectKeys: false, unlimitedKeys: false, caps, start,
            goal: candidate.point,
        });
        if (!leg) continue;
        const picked = keysAlong(leg, taken, options);
        const keys = caps.keys + picked.ordinary - leg.keysSpent.ordinary;
        const lionKeys = caps.lionKeys + picked.lion - leg.keysSpent.lion;
        if (keys < 0 || lionKeys < 0) continue;
        const onward = fetchNextKey(
            { ...options, caps: { ...caps, keys, lionKeys }, start: candidate.point },
            plain, picked.visited, depth + 1,
        );
        if (!onward) continue;
        // The leg was walked without the pickup dimension, so it reports none: the
        // keys it went over are counted here, the waypoint at its end included —
        // and *named*, because a consumer part-way along the joined route has to
        // know which of them are still ahead of it.
        const joined = concatRoutes({
            ...leg,
            picks: picked.picks,
            keysGained: {
                ordinary: leg.keysGained.ordinary + picked.ordinary,
                lion: leg.keysGained.lion + picked.lion,
            },
        }, onward);
        if (!best || joined.cost < best.cost) best = joined;
    }
    return best;
}

/**
 * Keys the hero picks up walking `leg`, which was planned as if they were not
 * there.
 *
 * Every key node the leg's points go over is one he walks over, and walking over a
 * key is what takes it (`keysAfterPickup`) — the key at the leg's end among them,
 * which is the whole reason the leg was walked. `taken` already holds the ones
 * earlier legs took, so a key is counted exactly once however many legs pass it.
 */
function keysAlong(
    leg: NavRoute,
    taken: ReadonlySet<string>,
    options: FindRouteOptions,
): { ordinary: number; lion: number; visited: Set<string>; picks: NavPick[] } {
    let ordinary = 0;
    let lion = 0;
    const visited = new Set(taken);
    const picks: NavPick[] = [];
    for (let i = 1; i < leg.points.length; i++) {
        const point = leg.points[i]!;
        const graph = options.store.get(point.mapId);
        if (!graph) continue;
        const kind = keyOnFloor(graph, point, options, visited);
        if (kind === 0) continue;
        visited.add(`${point.mapId}/${point.node}`);
        picks.push({ at: i, kind: kind === KEY_LION ? 1 : 0 });
        if (kind === KEY_LION) lion++;
        else ordinary++;
    }
    return { ordinary, lion, visited, picks };
}

/**
 * The kind of key the hero picks up by standing on `point`, or 0 when he picks up
 * none.
 *
 * The same two questions `keysAfterPickup` asks, asked the same way round: the
 * map's **record** rather than the node the route walks through, the level the
 * search is allowed to detour to, and the save's own answer to whether it is still
 * lying there. `taken` holds the keys already counted, so one record is worth one
 * key however many times the hero crosses it.
 */
function keyOnFloor(
    graph: NavGraph,
    point: NavPoint,
    options: FindRouteOptions,
    taken: ReadonlySet<string>,
): 0 | 1 | 2 {
    const cell = graph.keyCellAt[point.node] ?? -1;
    if (cell < 0) return 0;
    const kind = graph.keyKindAt[point.node]!;
    if (kind !== KEY_LION && kind !== KEY_ORDINARY) return 0;
    if (taken.has(`${point.mapId}/${point.node}`)) return 0;
    if (options.keyCavernLevel !== undefined) {
        const meta = NAV_MAP_BY_ID.get(point.mapId);
        if (meta && meta.cavernLevel !== options.keyCavernLevel) return 0;
    }
    const col = cell % graph.mapWidth;
    const row = (cell / graph.mapWidth) | 0;
    if (options.keyPresent && !options.keyPresent(
        point.mapId, col, row, kind === KEY_LION ? 1 : 0,
    )) return 0;
    return kind;
}

/**
 * Splice two routes that meet at a node into the one journey they are.
 *
 * The second starts where the first ended — the key's own node — so its first
 * point is dropped and its hops are appended. Everything counted is summed rather
 * than recomputed: both halves were built by `describeRoute`, which already
 * counted them from the hops, and the pickup at the join belongs to the first half
 * alone because the second was searched with the key already in the pocket.
 */
function concatRoutes(first: NavRoute, second: NavRoute): NavRoute {
    const points = [...first.points, ...second.points.slice(1)];
    const hops = [...first.hops, ...second.hops];
    const sum = (a: { ordinary: number; lion: number }, b: { ordinary: number; lion: number }) =>
        ({ ordinary: a.ordinary + b.ordinary, lion: a.lion + b.lion });
    const maps: number[] = [];
    for (const p of points) if (maps[maps.length - 1] !== p.mapId) maps.push(p.mapId);
    // The second half's points start where the first half's do, minus the one
    // point they share, so its pickups move by the same amount.
    const offset = first.points.length - 1;
    const picks: NavPick[] = [
        ...first.picks,
        ...second.picks.map((pick) => ({ at: pick.at + offset, kind: pick.kind })),
    ];
    const equipment = [...first.equipment];
    for (const e of second.equipment) {
        const last = equipment[equipment.length - 1];
        if (last && last.accessory === e.accessory) continue;
        equipment.push(e);
    }
    return {
        points,
        hops,
        cost: first.cost + second.cost,
        keysSpent: sum(first.keysSpent, second.keysSpent),
        keysGained: sum(first.keysGained, second.keysGained),
        equipment,
        lockedDoors: sum(first.lockedDoors, second.lockedDoors),
        picks,
        maps,
        crossesAggressiveGround: first.crossesAggressiveGround || second.crossesAggressiveGround,
        crossesSlopes: first.crossesSlopes || second.crossesSlopes,
        usesPlatforms: first.usesPlatforms || second.usesPlatforms,
        usesCurrents: first.usesCurrents || second.usesCurrents,
        expanded: first.expanded + second.expanded,
    };
}

/** One search. {@link findRoute} wraps this and adds the key decomposition. */
function search(options: FindRouteOptions): NavRoute | null {
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
    // When the route may count on shoes the hero can put on, the search treats
    // those abilities as available and reports what it used.
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
        shoes: wornShoeMask(caps),
        g: 0, f: heuristic(start.mapId, startNode, goalGraph, goalNode),
        parent: -1, via: -1, viaCost: 0,
    };
    states.push(initial);
    indexOfState.set(stateKey(initial), 0);
    best.set(stateKey(initial), 0);
    open.push(initial);

    let expanded = 0;
    let goalState = -1;

    /**
     * Step through a door onto another map: `keyReq` is the capability the door
     * costs (CAP.KEY, CAP.LION_KEY, or 0 for an open door), and the landing is
     * already a standing position on the far side.
     *
     * Both door kinds go through here — an MDT door record, and the post-boss door
     * a boss arena grows — because the game spends a key the same way for either.
     */
    const crossDoor = (
        current: State,
        currentIndex: number,
        destMapId: number,
        toX: number,
        toY: number,
        keyReq: number,
        /**
         * Where the door this is sits, so `doorOpen` can be asked about it. The MDT
         * portal is a door record and has both; a boss arena's exit has no record
         * at all, and is always open — it exists only because the boss died.
         */
        door: { mapId: number; x0: number; y0: number } | null,
    ): void => {
        if (destMapId < 0 || !maps.has(destMapId)) return;
        const dest = store.get(destMapId);
        if (!dest) return;
        // The hero's left column is the portal's arrival, in standing terms.
        const landing = nodeAt(dest, toX, toY);
        if (landing < 0) return;
        let keysOrd = current.keysOrd;
        let keysLion = current.keysLion;
        let cost: number = EDGE_COST.DOOR;
        // An open door is walked through, costing nothing — and a door the player
        // has already opened is open, whatever the level data says it shipped as.
        const isOpen = door !== null
            ? (options.doorOpen?.(door.mapId, door.x0, door.y0) ?? keyReq === 0)
            : true;
        if (isOpen) {
            relax(
                current, currentIndex, destMapId, landing, EDGE.DOOR, EDGE_COST.DOOR, 0,
                keysOrd, keysLion, current.shoes, states, best, settled, indexOfState,
                open, goalGraph, goalNode,
            );
            return;
        }
        if (keyReq === CAP.LION_KEY) {
            // A closed door with the Lion-Head feature bit costs a Lion-Head key.
            // Under `unlimitedKeys` the search is told to assume every key in the
            // game, so it pays nothing and does not decrement.
            if (!unlimitedKeys) {
                if (keysLion < 1) return;
                keysLion--;
            }
            cost = EDGE_COST.DOOR_LOCKED;
        } else if (keyReq === CAP.KEY) {
            if (!unlimitedKeys) {
                if (keysOrd < 1) return;
                keysOrd--;
            }
            cost = EDGE_COST.DOOR_LOCKED;
        }
        relax(
            current, currentIndex, destMapId, landing, EDGE.DOOR, cost, keyReq,
            keysOrd, keysLion, current.shoes, states, best, settled, indexOfState,
            open, goalGraph, goalNode,
        );
    };

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
        // What he can do here is what he wears *or* what he is carrying: he changes
        // shoes between steps for nothing, so a pair picked up earlier in the route
        // opens its hops later in it.
        const able = maskWithShoes(effective, current.shoes);

        // ── hops inside this map ──
        const from = graph.edgeOffsets[current.node]!;
        const to = graph.edgeOffsets[current.node + 1]!;
        for (let i = from; i < to; i++) {
            const edge = graph.edges[i]!;
            if (!permitted(edge.req, edge.to, hazard, able)) continue;
            relax(
                current, currentIndex, current.mapId, edge.to, edge.kind, edge.cost, edge.req,
                keysAfterPickup(graph, current, edge.to, options),
                keysLionAfterPickup(graph, current, edge.to, options),
                shoesAfterPickup(graph, current, edge.to, options),
                states, best, settled, indexOfState,
                open, goalGraph, goalNode,
            );
        }

        // ── a door onto another map ──
        const portalIndex = graph.portalAtNode[current.node]!;
        if (portalIndex >= 0) {
            const portal = PORTALS[portalIndex]!;
            crossDoor(current, currentIndex, portal.destMapId, portal.toX, portal.toY,
                portal.key === 2 ? CAP.LION_KEY : (portal.key === 1 ? CAP.KEY : 0),
                { mapId: current.mapId, x0: portal.x0, y0: portal.y0 });
        }

        // ── the door a boss arena grows when its boss dies ──
        // The arena has no door of its own in the file, and the exit's column is
        // stamped from wherever the hero is standing, so the graph offers it from
        // every standing position on the door's row (nav-graph.ts bossExitAtNode).
        const exitIndex = graph.bossExitAtNode[current.node]!;
        if (exitIndex >= 0) {
            const exit = NAV_BOSS_EXITS[exitIndex]!;
            // A boss arena's exit has no door record: it is the door the arena
            // grows when the boss dies, so it is always open and there is nothing
            // to ask.
            crossDoor(current, currentIndex, exit.destMapId, exit.destX, exit.destY,
                exit.key === 2 ? CAP.LION_KEY : (exit.key === 1 ? CAP.KEY : 0), null);
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
    shoes: number,
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
        mapId, node, keysOrd, keysLion, shoes, g,
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
        // What a crossing costs: 0 for anything but a shut door, and for a door the
        // player has already opened — walked through for nothing, which is the same
        // answer `viaReq` gives. Which pocket it draws from is not recoverable from
        // the hop's endpoints later, so it is kept on the hop.
        let doorKey = 0;
        if (chain[i]!.via === EDGE.DOOR && chain[i]!.viaReq !== 0) {
            const fromGraph = store.get(chain[i - 1]!.mapId)!;
            const fromPortal = fromGraph.portalAtNode[chain[i - 1]!.node]!;
            doorKey = fromPortal >= 0 ? (PORTALS[fromPortal]?.key ?? 0) : 0;
        }
        hops.push({ kind: chain[i]!.via, cost: chain[i]!.viaCost, from, to, doorKey });
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

    // Shoes, in the order the route needs them: every number here describes the
    // route the player is shown. A hop that requires a pair is a hop the hero can
    // only take equipped. A hop may ask for two pairs at once — a four-tile jump
    // whose ascent crosses a slope wants Feruza and Silkarn together.
    const equipment: NavRequirement[] = [];
    for (let i = 1; i < chain.length; i++) {
        const req = chain[i]!.viaReq;
        for (const [bit, accessory, label] of SHOE_BITS) {
            if ((req & bit) === 0) continue;
            const last = equipment[equipment.length - 1];
            if (last && last.accessory === accessory) continue;
            equipment.push({ accessory, label, at: points[i]! });
        }
    }

    // Counted from the hops rather than from the counters, so every number
    // describes the route the player is shown.
    const lockedDoors = { ordinary: 0, lion: 0 };
    const picked = { ordinary: 0, lion: 0 };
    const picks: NavPick[] = [];
    for (let i = 1; i < chain.length; i++) {
        if (chain[i]!.keysOrd > chain[i - 1]!.keysOrd) {
            picked.ordinary++;
            picks.push({ at: i, kind: 0 });
        }
        if (chain[i]!.keysLion > chain[i - 1]!.keysLion) {
            picked.lion++;
            picks.push({ at: i, kind: 1 });
        }
    }
    for (let i = 1; i < chain.length; i++) {
        const via = chain[i]!.via;
        if (via !== EDGE.DOOR) continue;
        // A door that stood open costs nothing, so it is not a locked door on this
        // route and no key was spent on it.
        if (chain[i]!.viaReq === 0) continue;
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
        // Under `unlimitedKeys` the keys were assumed rather than fetched, so
        // nothing was taken and nothing was picked up; `lockedDoors` is then what
        // the journey *needs*.
        keysSpent: assumeKeys ? { ordinary: 0, lion: 0 } : { ...lockedDoors },
        keysGained: assumeKeys ? { ordinary: 0, lion: 0 } : picked,
        equipment,
        lockedDoors,
        picks: assumeKeys ? [] : picks,
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
