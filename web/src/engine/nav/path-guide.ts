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
    findRoute, reachableMaps, type NavGraphStore, type NavPoint, type NavRoute,
} from './pathfinder.js';
import { nodeAt } from './nav-graph.js';
import { NavTileClassifier } from './attributes.js';
import { JumpModel } from './jump.js';
import { buildPlatformModel } from './platforms.js';

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
}

export class PathGuide {
    private route: NavRoute | null = null;
    private goal: { mapId: number; col: number; row: number } | null = null;
    private progress = 0;
    private lastPlanAt = 0;
    /** Capability mask and key counts the current route was planned against. */
    private plannedMask: CapabilityMask = -1;
    private plannedKeys = -1;
    private plannedLionKeys = -1;
    /**
     * True while a menu covers the cavern. The route stays live underneath — so
     * the chevrons are correct the moment the menus close — but nothing is drawn.
     */
    private dormant = false;
    /** Set once the goal is reached, so the route is cleared exactly once. */
    private arrived = false;

    constructor(private readonly deps: PathGuideDeps) {}

    /** A destination was chosen on the map screen. */
    setRoute(route: NavRoute, goal: { mapId: number; col: number; row: number }): void {
        this.route = route;
        this.goal = goal;
        this.progress = 0;
        this.arrived = false;
        this.plannedMask = -1;      // force the next update() to record the plan
        this.lastPlanAt = 0;
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
    cellsForHop(index: number): NavPoint[] {
        const route = this.route;
        if (!route) return [];
        const from = route.points[this.progress + index];
        const to = route.points[this.progress + index + 1];
        if (!from || !to) return [];
        const hop = route.hops[this.progress + index];
        if (!hop || from.mapId !== to.mapId) return [from, to];
        if (hop.kind !== EDGE.JUMP && hop.kind !== EDGE.JUMP_HIGH
            && hop.kind !== EDGE.FALL && hop.kind !== EDGE.DROP) return [from, to];
        const model = this.flightModel(from.mapId);
        if (!model) return [from, to];
        const path = model.flightPath(from.col, from.row, to.col, to.row);
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

    /** One jump model per map, built on first use — a hop that needs one. */
    private readonly flightModels = new Map<number, JumpModel | null>();

    private flightModel(mapId: number): JumpModel | null {
        const held = this.flightModels.get(mapId);
        if (held !== undefined) return held;
        const grid = this.deps.store.gridOf(mapId);
        if (!grid) {
            this.flightModels.set(mapId, null);
            return null;
        }
        // The same standing platform slots the graph gives the model, so a hop that
        // ends on a platform finds its flight.
        const surfaces = new Uint8Array(grid.mapWidth * 64);
        for (const slot of buildPlatformModel(mapId, grid).slots) {
            surfaces[(slot.headRow + 3) * grid.mapWidth
                + (((slot.leftCol + 1) % grid.mapWidth) + grid.mapWidth) % grid.mapWidth] = 1;
        }
        const model = new JumpModel(grid, NavTileClassifier.forMap(mapId), surfaces);
        this.flightModels.set(mapId, model);
        return model;
    }

    /**
     * Advance the reveal and re-plan when the world has changed under us.
     *
     * @param now performance.now()
     */
    update(now: number): void {
        if (!this.route || !this.goal) return;
        this.advanceProgress();

        const caps = this.deps.capabilities();
        const hero = this.deps.heroPosition();
        if (!hero) return;

        if (!this.needsReplan(now, caps, hero)) return;

        const next = findRoute({
            store: this.deps.store,
            caps,
            start: { mapId: hero.mapId, col: hero.col, row: hero.row },
            goal: this.goal,
        });
        this.lastPlanAt = now;
        if (!next) {
            // The hero is standing on a node here — `needsReplan` does not look for a
            // route from a cell he is only passing through — so a search that finds
            // nothing means the world really changed under the plan. Say so rather
            // than drawing a route that will not work.
            this.clear();
            return;
        }
        this.route = next;
        this.recordPlan(caps);
        // Keep the reveal pointed at the hero rather than restarting from zero.
        this.advanceProgress();
    }

    /** True when the route no longer reflects the world. */
    private needsReplan(now: number, caps: HeroCapabilities, hero: { mapId: number; col: number; row: number }): boolean {
        if (now - this.lastPlanAt < MIN_INTERVAL_MS) return false;
        if (this.plannedMask !== caps.mask) return true;
        if (this.plannedKeys !== caps.keys) return true;
        if (this.plannedLionKeys !== caps.lionKeys) return true;
        if (!this.goal || !reachableMaps(hero.mapId).includes(this.goal.mapId)) return true;
        // Mid-jump he is standing nowhere, and that is not drift: the route itself
        // sends him over gaps. Re-planning from a cell that is not a node can only
        // fail, so do not try until he lands.
        const graph = this.deps.store.get(hero.mapId);
        if (!graph || nodeAt(graph, hero.col, hero.row) < 0) return false;
        // Walking off the route: the hero should be near it.
        const points = this.route!.points;
        const from = Math.max(0, this.progress - 1);
        for (let i = from; i < points.length; i++) {
            const p = points[i]!;
            if (p.mapId !== hero.mapId) continue;
            const d = columnDelta(p.col, hero.col, this.deps.store.get(hero.mapId)?.mapWidth ?? hero.col + 1)
                + rowDelta(p.row, hero.row);
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
        const width = this.deps.store.get(hero.mapId)?.mapWidth ?? 1;
        const on = (point: NavPoint): boolean => point.mapId === hero.mapId
            && columnDelta(point.col, hero.col, width) === 0
            && rowDelta(point.row, hero.row) === 0;

        // Advance only once he has actually left the current point.
        while (this.progress + 1 < route.points.length
            && on(route.points[this.progress + 1]!)) {
            this.progress++;
        }
        // Reaching the last point ends the route; the destination ring is drawn on
        // the frame he arrives, then the overlay retires.
        if (on(route.points[this.progress]!) && this.progress === route.points.length - 1) {
            this.route = null;
            this.arrived = true;
        }
    }
}
