/**
 * path-guide.ts — owns the active route and keeps it honest.
 *
 * The Thread of Yaga reveals a route once; everything after that is keeping it
 * true. The hero's shoes change, doors open, he wanders off the path — a route
 * computed once and drawn forever would lie. So the guide watches for the events
 * that invalidate it and re-plans, throttled so a held direction key cannot turn
 * a walk into a pathfinding loop.
 *
 * The overlay itself lives in render/path-overlay.ts and asks this for the part
 * still ahead of the hero.
 */

import type { CapabilityMask } from './types.js';
import { EDGE } from './types.js';
import type { HeroCapabilities } from './capabilities.js';
import {
    findRoute, reachableMaps, SHOE_MASK, type NavGraphStore, type NavPoint, type NavRoute,
    type NavRoutePlan,
} from './pathfinder.js';
import { nodeAt } from './nav-graph.js';
import { NavTileClassifier } from './attributes.js';
import {
    FALL_RISE_HEIGHTS, JUMP_RISE_HEIGHTS, JumpModel, STEER_ALL,
} from './jump.js';
import { buildPlatformModel, isLandingSlot } from './platforms.js';
import { liftSweptCell } from './nav-graph.js';
import { NAV_MAP_BY_ID } from '../../data/nav/nav-maps.js';
import { heroInLift, wrapCol, wrapRow } from './geometry.js';

/** Re-plan when the hero has drifted this far from the route, in tiles. */
const DRIFT_TOLERANCE = 3;

/** Even with nothing to invalidate, refresh this often so the line stays right. */
const REFRESH_MS = 20_000;

/** Never re-plan more often than this. */
const MIN_INTERVAL_MS = 500;

/** Cyclic distance between two columns on a cavern cylinder. */
function columnDelta(a: number, b: number, mapWidth: number): number {
    const raw = Math.abs(a - b);
    return Math.min(raw, mapWidth - raw);
}

/** Cyclic distance between two rows on a 64-row cylinder. */
function rowDelta(a: number, b: number): number {
    const raw = Math.abs(a - b);
    return Math.min(raw, 64 - raw);
}

export interface PathGuideDeps {
    /** Graph store, for re-planning across the component. */
    store: NavGraphStore;
    /** Where the hero is, or null outside a cavern. */
    heroPosition: () => { mapId: number; col: number; row: number } | null;
    /** The hero's current abilities. */
    capabilities: () => HeroCapabilities;
    /**
     * Whether a door stands open right now, or null when the answer is not known.
     *
     * The guide **re-plans** the route from wherever the hero has got to, and it has
     * to plan it under the same assumptions the map screen did or the two disagree.
     * A key is spent once and its door is then open for good, so a re-plan that fell
     * back to the level data would price an already-open door as locked — and with the
     * key spent and gone from the floor there would be nothing to fetch, so the search
     * would find no route at all. The guide drops its route when that happens
     * (`update`), which is the whole thread vanishing on the first frame after it is
     * spent.
     *
     * Optional, and null is the normal answer for any cavern but the loaded one.
     */
    doorOpen?: (mapId: number, x0: number, y0: number) => boolean | null;
}

/** What the shoes are called, from the accessory ids. */
const ACCESSORY_NAMES: Record<number, string> = {
    1: 'Feruza shoes',
    2: 'Pirika shoes',
    3: 'Silkarn shoes',
    4: 'Ruzeria shoes',
    5: 'Asbestos cape',
};

/** Map widths, so a line between two positions knows where the seam is. */
const MAP_WIDTHS = new Map<number, number>();

/** Width of a cavern in tiles, for the cylindrical arithmetic. */
function mapWidthOf(mapId: number): number {
    const width = NAV_MAP_BY_ID.get(mapId)?.mapWidth;
    if (width) MAP_WIDTHS.set(mapId, width);
    return width ?? 256;
}

/**
 * The cells a straight line between two positions covers, one tile at a time.
 *
 * For the moves the flight model does not replay — a ride, a lift, a door, a step —
 * the hero travels the whole way, so the line is drawn the whole way. Skipping these
 * is what left the drawn route broken across every door and every current in it.
 */
function lineCells(from: NavPoint, to: NavPoint): NavPoint[] {
    const cells: NavPoint[] = [{ ...from }];
    if (from.mapId !== to.mapId) {
        // A door between maps: he steps through it, and the room on the other side is
        // drawn from its own arrival, so the two ends are the honest line.
        cells.push({ ...to });
        return cells;
    }
    const mapWidth = MAP_WIDTHS.get(from.mapId) ?? 256;
    let dCol = to.col - from.col;
    if (dCol > mapWidth / 2) dCol -= mapWidth;
    else if (dCol < -mapWidth / 2) dCol += mapWidth;
    let dRow = to.row - from.row;
    if (dRow > 32) dRow -= 64;
    else if (dRow < -32) dRow += 64;
    const steps = Math.max(Math.abs(dCol), Math.abs(dRow));
    for (let s = 1; s <= steps; s++) {
        const col = from.col + Math.round((dCol * s) / steps);
        const row = from.row + Math.round((dRow * s) / steps);
        cells.push({
            mapId: from.mapId,
            col: ((col % mapWidth) + mapWidth) % mapWidth,
            row: ((row % 64) + 64) % 64,
            node: -1,
        });
    }
    return cells;
}

/**
 * The flight behind a fall, asked from every place the graph could have asked from.
 *
 * `addFalls` builds a fall from the columns to either side of the hero, so the flight
 * that produced a given fall edge began one column from where the hero was standing.
 * The overlay only knows the hop's two ends, and the hero's own column is not one of
 * them, so it is asked as well. Whichever start finds the landing first is the flight
 * that was drawn, and its first cell is one column over — which is true, and which
 * `cellsForHop` already draws a chevron for.
 *
 * Only fall-shaped hops are asked three times; a jump is always from his own cell.
 */
function fallPath(model: JumpModel, from: NavPoint, to: NavPoint, mapWidth: number): Int32Array {
    for (const [dc, dr] of FALL_STARTS) {
        const path = model.flightPath(
            wrapCol(from.col + dc, mapWidth), wrapRow(from.row + dr),
            to.col, to.row, false, STEER_ALL, FALL_RISE_HEIGHTS,
        );
        if (path.length >= 4) return path;
    }
    return EMPTY_FLIGHT;
}

/** Empty result of {@link fallPath}: no flight from any of the starts reaches it. */
const EMPTY_FLIGHT = new Int32Array(0);

/**
 * Where a falling hero can begin, relative to the cell he is standing on: his own
 * column, either side of it, and the column past him and one row up, which is where
 * `addFalls` starts the fall off a rope.
 */
const FALL_STARTS: readonly (readonly [number, number])[] = [
    [0, 0], [-1, 0], [1, 0], [1, -1],
];

export class PathGuide {
    private route: NavRoute | null = null;
    private goal: { mapId: number; col: number; row: number } | null = null;
    /**
     * What the route was planned under, from the map screen. Replayed on every
     * re-plan, so the guide never asks a stricter question than the one the route
     * itself answers. See {@link PathGuide.setRoute}.
     */
    private plan: NavRoutePlan = {};
    private progress = 0;
    private lastPlanAt = 0;
    /** Capability mask and key counts the current route was planned against. */
    private plannedMask: CapabilityMask = -1;
    private plannedKeys = -1;
    private plannedLionKeys = -1;
    /** The platform positions the current route was planned against. */
    private lastPlatformVersion = '';
    /**
     * True while a menu covers the cavern. The route stays live underneath — so
     * the chevrons are correct the moment the menus close — but nothing is drawn.
     */
    private dormant = false;
    /** Set once the goal is reached, so the route is cleared exactly once. */
    private arrived = false;

    constructor(private readonly deps: PathGuideDeps) {}

    /** A destination was chosen on the map screen. */
    setRoute(
        route: NavRoute,
        goal: { mapId: number; col: number; row: number },
        /**
         * What the route was planned under — whether it goes to fetch a key or a pair,
         * and which doors stand open. The map screen knows which of its four rungs
         * answered and says so here, because the re-plan below has to repeat it.
         */
        plan: NavRoutePlan = {},
    ): void {
        this.route = route;
        this.goal = goal;
        this.plan = plan;
        this.progress = 0;
        this.arrived = false;
        this.plannedMask = -1;      // force the next update() to record the plan
        this.lastPlanAt = 0;
    }

    /**
     * The door state to re-plan under: the plan's own if it carries one, otherwise the
     * live callback, otherwise nothing and the level data answers.
     */
    private doorState(): { doorOpen?: (mapId: number, x0: number, y0: number) => boolean | null } {
        if (this.plan.doorOpen) return { doorOpen: this.plan.doorOpen };
        if (this.deps.doorOpen) return { doorOpen: this.deps.doorOpen };
        return {};
    }

    /** Forget the route; the overlay draws nothing. */
    clear(): void {
        this.route = null;
        this.goal = null;
        this.progress = 0;
        this.arrived = false;
        this.plannedMask = -1;
    }

    get isActive(): boolean {
        return this.route !== null && !this.dormant && !this.arrived;
    }

    get hasRoute(): boolean {
        return this.route !== null;
    }

    /** Hide the overlay without losing the route. */
    setDormant(dormant: boolean): void {
        this.dormant = dormant;
    }

    /**
     * The kind of hop taken from `remaining()` index `index`.
     *
     * -1 at the last point, which has no hop. The overlay uses this to leave
     * carried segments unmarked: a platform ride or a swept cell is not
     * something the player walks.
     */
    hopKindAt(index: number): number {
        if (!this.route) return -1;
        const point = this.route.points[this.progress + index];
        if (!point) return -1;
        const hop = this.route.hops[this.progress + index];
        return hop ? hop.kind : -1;
    }

    /** The part of the route still ahead of the hero, in order. */
    remaining(): readonly NavPoint[] {
        if (!this.route) return [];
        const points = this.route.points;
        if (this.progress >= points.length) return [];
        return points.slice(this.progress);
    }

    /**
     * Every cell one hop is drawn through, so a long hop is a line and not a gap.
     *
     * One chevron per hop put an arrow at the tile a jump *left* from and nothing at
     * all for the nine columns it covered, which read on screen as a broken route
     * exactly where the player had drawn a continuous one. A jump and a fall cover
     * many cells, and the cells they cover are known exactly: nav/jump.ts replays
     * the same descent the graph is built from, so this asks it where the hero
     * actually goes rather than joining the ends with a line.
     */
    /**
     * The shoes this route needs, in order, as a phrase for the log: `Silkarn shoes at
     * (21,21), Feruza shoes at (23,16)`.
     *
     * A route that wants three changes of shoe is a different journey from one that
     * wants none, and the player has to be told which they are being sent on.
     */
    equipment(): string {
        const route = this.route;
        if (!route || route.equipment.length === 0) return '';
        return route.equipment
            .map((need) => `${ACCESSORY_NAMES[need.accessory] ?? 'shoes'}`
                + ` at (${need.at.col},${need.at.row})`)
            .join(', ');
    }

    cellsForHop(index: number): NavPoint[] {
        const route = this.route;
        if (!route) return [];
        const from = route.points[this.progress + index];
        const to = route.points[this.progress + index + 1];
        if (!from || !to) return [];
        const hop = route.hops[this.progress + index];
        if (!hop || from.mapId !== to.mapId) return [from, to];
        if (hop.kind === EDGE.LIFT) return this.liftCells(from, to);
        if (hop.kind !== EDGE.JUMP && hop.kind !== EDGE.JUMP_HIGH
            && hop.kind !== EDGE.FALL && hop.kind !== EDGE.DROP) {
            return lineCells(from, to);
        }
        const model = this.flightModel(from.mapId);
        if (!model) return [from, to];
        // Asked the way the graph asked when it built this hop, which is not the way
        // this function's arguments suggest. A jump leaves from the hero's own cell and
        // rises. A fall does neither: `addFalls` asks the model from the column *beside*
        // him — he is already one column over when he starts dropping, and he chooses a
        // column every row after that — and with no rise at all. A rise of 0 is not a
        // smaller jump but a different question, and the wrong column is a third one, so
        // asking either way wrong finds nothing. Then the overlay falls back to a
        // straight line between the hop's two ends, and a ten-row fall becomes one
        // diagonal drawn through whatever rock happens to be beside it.
        const falls = hop.kind === EDGE.FALL || hop.kind === EDGE.DROP;
        const heights = falls ? FALL_RISE_HEIGHTS : JUMP_RISE_HEIGHTS;
        const path = falls
            ? fallPath(model, from, to, mapWidthOf(from.mapId))
            : model.flightPath(from.col, from.row, to.col, to.row, false, STEER_ALL, heights);
        if (path.length < 4) return [from, to];
        const cells: NavPoint[] = [{ mapId: from.mapId, col: from.col, row: from.row, node: -1 }];
        // The flight starts where the rise ended, which is above and beside where
        // the hero took off; the line has to begin at the tile he is standing on.
        if (path[0] !== from.col || path[1] !== from.row) {
            cells.push({ mapId: from.mapId, col: path[0]!, row: path[1]!, node: -1 });
        }
        for (let i = 2; i < path.length; i += 2) {
            cells.push({ mapId: from.mapId, col: path[i]!, row: path[i + 1]!, node: -1 });
        }
        return cells;
    }

    /**
     * The two legs of a lift, which is what a lift is.
     *
     * `enterLift` does not mean the hero moves from one cell to another. It means he
     * reaches a cell an up current occupies — walking off a ledge into it, or passing
     * through it mid-jump — and is then carried **straight up that column** to the
     * exit, one row at a time, for as long as he is in the current. The swept cell is
     * neither end of the edge: mp82 has `LIFT (23,0) -> (9,21)`, seventeen columns and
     * twenty-one rows apart with the current in column 9.
     *
     * So a line between the two ends is twenty-two tiles of fiction, and it goes
     * through whatever rock lies between two standing positions. This draws the two
     * legs instead — the approach, as the flight it is, then the climb — and only
     * falls back to the straight line when the sweep is not recorded.
     */
    private liftCells(from: NavPoint, to: NavPoint): NavPoint[] {
        const graph = this.deps.store.peek(from.mapId);
        const sweptCell = graph ? liftSweptCell(graph, from.node, to.node) : -1;
        if (!graph || sweptCell < 0) return lineCells(from, to);
        const width = graph.mapWidth;
        const sweptCol = sweptCell % width;
        const sweptRow = (sweptCell - sweptCol) / width;
        const at = (col: number, row: number): NavPoint =>
            ({ mapId: from.mapId, col: wrapCol(col, width), row: wrapRow(row), node: -1 });
        const cells: NavPoint[] = [at(from.col, from.row)];

        // The approach: whatever flight puts him in the current. A jump is tried
        // first because a swept cell is most often somewhere along an arc, and the
        // fall the same way a fall hop is — from beside him, with no rise.
        const model = this.flightModel(from.mapId);
        const approach = model?.flightPath(
            from.col, from.row, sweptCol, sweptRow, false, STEER_ALL, JUMP_RISE_HEIGHTS,
        ) ?? EMPTY_FLIGHT;
        if (approach.length >= 4) {
            for (let i = 0; i < approach.length; i += 2) {
                cells.push(at(approach[i]!, approach[i + 1]!));
            }
        } else if (model) {
            const viaFall = fallPath(model, from, at(sweptCol, sweptRow), width);
            for (let i = 0; i < viaFall.length; i += 2) {
                cells.push(at(viaFall[i]!, viaFall[i + 1]!));
            }
        }
        // Then the climb: straight up the current's own column, which is the only
        // direction an up current carries him.
        let row = sweptRow;
        while (row !== to.row) {
            row = wrapRow(row - 1);
            cells.push(at(sweptCol, row));
        }
        if (cells[cells.length - 1]!.row !== to.row || cells[cells.length - 1]!.col !== to.col) {
            cells.push(at(to.col, to.row));
        }
        return cells;
    }

    /** One jump model per map, built on first use — a hop that needs one. */
    private readonly flightModels = new Map<number, JumpModel | null>();

    private flightModel(mapId: number): JumpModel | null {
        // The cache first, and the width from map metadata rather than from a graph:
        // this runs per drawn hop per frame, and a `get` here would rebuild the cavern
        // whenever a platform had moved since the last one.
        const cached = this.flightModels.get(mapId);
        if (cached !== undefined) return cached;
        mapWidthOf(mapId);
        const grid = this.deps.store.gridOf(mapId);
        if (!grid) {
            this.flightModels.set(mapId, null);
            return null;
        }
        // The same two masks the graph gives the model. A hop that ends on a platform
        // or in a current is a real flight, and leaving either mask out means those
        // hops cannot be replayed — the overlay falls back to the hop's two ends and
        // the drawn line has a hole exactly where the route is most interesting.
        //
        // The third is where the platforms are *right now*, so a hop replays against
        // the platform the route was planned with. The guide drops its flight models
        // whenever that changes, so the two cannot drift apart.
        const classifier = NavTileClassifier.forMap(mapId);
        const platformModel = buildPlatformModel(mapId, grid, this.deps.store.platformPlaces(mapId));
        const surfaces = new Uint8Array(grid.mapWidth * 64);
        for (const slot of platformModel.slots) {
            if (!isLandingSlot(slot)) continue;
            surfaces[(slot.headRow + 3) * grid.mapWidth
                + wrapCol(slot.leftCol + 1, grid.mapWidth)] = 1;
        }
        const currents = new Uint8Array(grid.mapWidth * 64);
        for (let row = 0; row < 64; row++) {
            for (let col = 0; col < grid.mapWidth; col++) {
                if (heroInLift(grid, classifier, col, row)) currents[row * grid.mapWidth + col] = 1;
            }
        }
        const model = new JumpModel(
            grid, classifier, surfaces, currents, platformModel.restingCells,
        );
        this.flightModels.set(mapId, model);
        return model;
    }

    /**
     * Advance the reveal and re-plan when the world has changed under us.
     *
     * @param now performance.now()
     */
    update(now: number): void {
        // Any throw here happens inside the per-frame update, so it takes the rest of
        // the frame's work with it — the chevrons simply stop, with nothing on screen
        // to say why. Say it instead.
        try {
            this.tick(now);
        } catch (err) {
            const hero = this.deps.heroPosition();
            console.warn(`[path] update failed at ${hero ? `${hero.mapId}:(${hero.col},${hero.row})` : 'unknown'}`
                + ` with ${this.remaining().length} points left:`, err);
        }
    }

    private tick(now: number): void {
        if (!this.route || !this.goal) return;
        this.advanceProgress();
        // Arriving clears the route and raises the `arrived` latch. Returning here is
        // what stops the tick falling into `needsReplan` with no route to inspect —
        // which it did, once per arrival, throwing out of the per-frame update and
        // taking the rest of the frame's work with it.
        if (!this.route || this.arrived) return;

        const caps = this.deps.capabilities();
        const hero = this.deps.heroPosition();
        if (!hero) return;

        // A route that counts on shoes the hero can put on was planned against the
        // augmented mask, so keeping it honest has to use the same one: re-searching
        // bare would drop every feruza/silkarn/pirika route on the first tick after
        // the thread is spent. Once the hero actually wears the needed accessory the
        // augmented mask equals his real mask, so this stays correct either way.
        const wantsShoes = (this.route.equipment?.length ?? 0) > 0;
        const planCaps: HeroCapabilities = wantsShoes
            ? { ...caps, mask: caps.mask | SHOE_MASK }
            : caps;

        if (!this.needsReplan(now, planCaps, hero)) return;

        const next = findRoute({
            store: this.deps.store,
            caps: planCaps,
            start: { mapId: hero.mapId, col: hero.col, row: hero.row },
            goal: this.goal,
            // The same assumptions the map screen planned under: a route that fetches a
            // key or a pair still has to fetch it, and a door that stood open when the
            // thread was spent still stands open. Without them this search asks a
            // stricter question than the one that produced the route, finds nothing,
            // and clears the thread on the first frame.
            ...this.plan,
            // A route set without a plan still gets the live door state, if there is
            // one, so a door that has been opened is never priced as locked.
            ...this.doorState(),
        });
        this.lastPlanAt = now;
        if (!next) {
            // The hero is standing on a node here — `needsReplan` does not look for a
            // route from a cell he is only passing through — so a search that finds
            // nothing means the world really changed under the plan. Say so, and say
            // where it gave up, rather than drawing a route that will not work and
            // leaving the player with no clue why the line stopped.
            console.warn(`[path] dropped: no route from map${hero.mapId} (${hero.col},${hero.row})`
                + ` to map${this.goal.mapId} (${this.goal.col},${this.goal.row})`);
            this.clear();
            return;
        }
        this.route = next;
        this.recordPlan(planCaps);
        this.lastPlatformVersion = this.platformVersion();
        // The flight models were built for the arrangement that route was planned
        // against, so a hop replayed through one of them now draws an arc the hero no
        // longer flies. Drop them and let the next hop rebuild.
        this.flightModels.clear();
        // `progress` is an index into the *old* point list, and the new route is a
        // different list, so carrying it over left the reveal starting wherever that
        // number happened to fall — a jump that skipped three points re-planned from
        // where the hero stood and still began its arrows three tiles past him, off
        // screen or inside scenery. The new route is searched from the hero, so its
        // first point is his cell: re-anchor there and the line starts at his feet.
        this.progress = 0;
        this.advanceProgress();
    }

    /**
     * An identity for every platform's position across the maps the route touches.
     *
     * A route planned against a different signature was drawn over a different world:
     * the platform the graph treated as solid has moved, and the row it offered as a
     * landing is not the one it is at. So a difference here is enough on its own to
     * re-plan, ahead of any interval.
     */
    private platformVersion(): string {
        const parts: string[] = [];
        for (const mapId of this.route?.maps ?? []) {
            const places = [...this.deps.store.platformPlaces(mapId)]
                .sort((a, b) => a[0] - b[0]);
            for (const [x, y] of places) parts.push(`${mapId}:${x}:${y}`);
        }
        return parts.join(',');
    }

    /** True when the route no longer reflects the world. */
    private needsReplan(now: number, caps: HeroCapabilities, hero: { mapId: number; col: number; row: number }): boolean {
        // First: can a route be planned from here at all? Mid-jump, and **mid-ride**,
        // he is standing nowhere the search could start from, and that is not drift —
        // the route itself is what put him there. A lift is the sharp case: his row
        // changes every frame he climbs, so re-planning on the platform would fire
        // every frame and always come back empty, which is not a slower route but no
        // route at all, and the guide drops what it was drawing. `peek` rather than
        // `get`, so asking the question does not rebuild the cavern to answer it.
        const graph = this.deps.store.peek(hero.mapId);
        if (!graph || nodeAt(graph, hero.col, hero.row) < 0) return false;

        // A platform the hero has just driven is a new wall and a new ledge, so the
        // route is stale the moment it moves and no waiting interval should hold it
        // back. The store has the live rows, so a differing signature is a real move
        // rather than a stale plan.
        if (this.lastPlatformVersion !== this.platformVersion()) return true;

        if (now - this.lastPlanAt < MIN_INTERVAL_MS) return false;
        if (this.plannedMask !== caps.mask) return true;
        if (this.plannedKeys !== caps.keys) return true;
        if (this.plannedLionKeys !== caps.lionKeys) return true;
        if (!this.goal || !reachableMaps(hero.mapId).includes(this.goal.mapId)) return true;
        // Walking off the route: the hero should be near it.
        const points = this.route?.points;
        if (!points) return false;
        const from = Math.max(0, this.progress - 1);
        for (let i = from; i < points.length; i++) {
            const p = points[i]!;
            if (p.mapId !== hero.mapId) continue;
            const d = columnDelta(p.col, hero.col, graph.mapWidth) + rowDelta(p.row, hero.row);
            if (d <= DRIFT_TOLERANCE) return false;
        }
        return now - this.lastPlanAt >= REFRESH_MS;
    }

    /**
     * Remember what the current plan assumed, so drift can be detected.
     *
     * Door state is deliberately not tracked: a door cannot be closed in play, and
     * a route through a locked door already assumes the key, so opening it later
     * cannot invalidate the plan. The refresh interval picks up anything else.
     */
    private recordPlan(caps: HeroCapabilities): void {
        this.plannedMask = caps.mask;
        this.plannedKeys = caps.keys;
        this.plannedLionKeys = caps.lionKeys;
    }

    /**
     * Keep the reveal anchored to the point the hero is standing on.
     *
     * `progress` is the index of the route point he currently occupies, so the
     * chevron drawn there marks the step he is about to take. Two earlier
     * attempts were wrong in ways that showed on screen:
     *
     *   - matching "within one tile" let the hero standing on point N also count as
     *     being on point N+1, because route steps are exactly one tile apart. The
     *     reveal ran ahead and swallowed the first arrows.
     *   - counting a point as reached the moment he stood on it moved the anchor
     *     past the hero, so the arrow for the step leaving him was never drawn and
     *     the path appeared to start in mid-air, pointing into the scenery.
     *
     * Both positions are integers from the same g_mem expression, so the match is
     * exact and there is no rounding to absorb.
     */
    private advanceProgress(): void {
        const route = this.route;
        if (!route) return;
        const hero = this.deps.heroPosition();
        if (!hero) return;
        // Metadata, not `store.get`: this runs every tick, and asking for a graph here
        // would rebuild the hero's cavern on every row of a lift ride.
        const width = mapWidthOf(hero.mapId);
        const on = (point: NavPoint): boolean => point.mapId === hero.mapId
            && columnDelta(point.col, hero.col, width) === 0
            && rowDelta(point.row, hero.row) === 0;

        /**
         * Put the anchor on the hero, not on the last point he stood on exactly.
         *
         * Requiring exact occupancy meant that any move that skipped a point — a
         * jump, a fall, a platform carrying him — left the anchor where it was. The
         * reveal then started somewhere behind him, its first cells were off screen
         * or behind, and **nothing was drawn at his feet**: the line appeared to start
         * in the middle of a wall, which is the state in the player's second
         * screenshot. Looking for his own cell along the route finds it wherever the
         * skipped points left it, and a hero in mid-air — matching nothing — keeps the
         * anchor he had rather than losing the line.
         */
        for (let i = this.progress; i < route.points.length; i++) {
            if (!on(route.points[i]!)) continue;
            this.progress = i;
            break;
        }
        // Reaching the destination ends the route. This is checked against the last
        // point directly, not against the anchor: there is nothing after the last
        // point for the loop above to advance to, so a hero standing on it used to
        // leave the reveal one step short of the end and the chevrons stayed up for
        // good.
        const last = route.points.length - 1;
        if (on(route.points[last]!)) {
            this.route = null;
            this.arrived = true;
        }
    }
}
