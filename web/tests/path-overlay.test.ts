// @vitest-environment happy-dom
/**
 * path-overlay.test.ts — the chevron trail (phases 7 and 8).
 *
 * Two things matter and are easy to get wrong. The overlay must draw only the
 * part of the route still ahead of the hero, so it advances as he walks instead of
 * scrolling behind him; and it must be dormant while a menu covers the cavern, so
 * the player never walks into a screen they cannot see through — while the route
 * itself stays live, so the line is correct the instant the menus close.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    chevronFor, CHEVRON_RIGHT, CHEVRON_UP, CHEVRON_LEFT, CHEVRON_DOWN,
    CHEVRON_DESTINATION, CHEVRON_FRAMES, CHEVRON_FRAME_W, CHEVRON_FRAME_H, CHEVRON_SHEET,
} from '../src/render/path-overlay.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { chevronAlpha } from '../src/render/path-overlay.js';
import { EDGE } from '../src/engine/nav/types.js';
import type { NavNode } from '../src/engine/nav/nav-graph.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import {
    findRoute, NavGraphStore, type NavPoint, type NavRoute,
} from '../src/engine/nav/pathfinder.js';
import { allCapabilities } from '../src/engine/nav/capabilities.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** A route of straight horizontal steps, so progress tracking is predictable. */
function route(steps: number, mapWidth = 240, mapId = 0): NavRoute {
    const points: NavPoint[] = [];
    for (let i = 0; i <= steps; i++) {
        points.push({ mapId, col: (10 + i) % mapWidth, row: 20, node: i });
    }
    return {
        points,
        hops: points.slice(1).map((to, i) => ({
            kind: 0, cost: 1, from: points[i]!, to,
        })),
        cost: steps,
        keysSpent: { ordinary: 0, lion: 0 },
    keysGained: { ordinary: 0, lion: 0 },
    equipment: [],
    lockedDoors: { ordinary: 0, lion: 0 },
        maps: [mapId],
        crossesAggressiveGround: false,
        crossesSlopes: false,
        usesPlatforms: false,
        usesCurrents: false,
        expanded: steps,
    };
}

interface Harness {
    guide: PathGuide;
    store: NavGraphStore;
    hero: { mapId: number; col: number; row: number };
    caps: { mask: number; accessory: number; cavernLevel: number; keys: number; lionKeys: number };

    route: NavRoute;
}

function realStore(): NavGraphStore {
    const cache = new Map<number, Uint8Array>();
    return new NavGraphStore((mapId) => {
        const meta = NAV_MAP_BY_ID.get(mapId);
        if (!meta) return null;
        let hit = cache.get(mapId);
        if (!hit) {
            hit = new Uint8Array(readFileSync(resolve(REPO, `web/public/${meta.mdtPath}`)));
            cache.set(mapId, hit);
        }
        return hit;
    });
}

/** A standing position in mp10 with plenty of exits, and a real route from it. */
function harness(): Harness {
    const store = realStore();
    const graph = store.get(0)!;
    const w = graph.mapWidth;

    // A run of ten standing positions on one row, which gives a start, a goal
    // twelve tiles along, and a route between them that is nothing but steps. What
    // this file tests is the guide revealing a route one tile at a time, so the route
    // has to be made of single steps: "whatever the search prefers" would no longer
    // be a walk now that jumps and drifting falls reach so much further than a step.
    let from: NavNode | null = null;
    let goal: NavNode | null = null;
    for (let row = 0; row < 64 && !from; row++) {
        for (let col = 0; col < w - 10; col++) {
            let run = 0;
            while (run < 10 && graph.groundOf[row * w + ((col + run) % w)]! >= 0) run++;
            if (run < 10) { col += run; continue; }
            from = graph.nodes[graph.groundOf[row * w + col]!]!;
            goal = graph.nodes[graph.groundOf[row * w + col + 12]!]!;
            break;
        }
    }
    expect(from, 'mp10 should have a row of standing positions').not.toBeNull();
    expect(goal, 'mp10 should have a goal twelve tiles along it').not.toBeNull();

    const hero = { mapId: 0, col: from!.col, row: from!.row };
    const caps = { ...allCapabilities() };
    const route = findRoute({
        store, caps,
        start: { mapId: 0, col: hero.col, row: hero.row },
        goal: { mapId: 0, col: goal!.col, row: goal!.row },
    })!;
    expect(route.points.length).toBeGreaterThan(1);
    expect(route.hops.every((hop) => hop.kind === EDGE.WALK || hop.kind === EDGE.STEP)).toBe(true);

    const guide = new PathGuide({
        store,
        heroPosition: () => ({ ...hero }),
        capabilities: () => ({ ...caps }),
    });
    return { guide, store, hero, caps, route: route! };
}

describe('choosing a chevron for a step', () => {
    const at = (col: number, row: number) => ({ col, row });

    it('picks the cardinal frame for each direction', () => {
        expect(chevronFor(at(10, 20), at(11, 20), 240, false)).toBe(CHEVRON_RIGHT);
        expect(chevronFor(at(10, 20), at(9, 20), 240, false)).toBe(CHEVRON_LEFT);
        expect(chevronFor(at(10, 20), at(10, 19), 240, false)).toBe(CHEVRON_UP);
        expect(chevronFor(at(10, 20), at(10, 21), 240, false)).toBe(CHEVRON_DOWN);
    });

    it('wraps the column delta across the seam', () => {
        // 239 -> 0 on a 240-wide map is one step east, not 239 west.
        expect(chevronFor(at(239, 20), at(0, 20), 240, false)).toBe(CHEVRON_RIGHT);
        expect(chevronFor(at(0, 20), at(239, 20), 240, false)).toBe(CHEVRON_LEFT);
    });

    it('wraps the row delta across the 64-row boundary', () => {
        expect(chevronFor(at(10, 63), at(10, 0), 240, false)).toBe(CHEVRON_DOWN);
        expect(chevronFor(at(10, 0), at(10, 63), 240, false)).toBe(CHEVRON_UP);
    });

    it('lets the nearer cardinal win on a diagonal', () => {
        // More horizontal than vertical -> east.
        expect(chevronFor(at(10, 20), at(12, 21), 240, false)).toBe(CHEVRON_RIGHT);
        // More vertical -> down.
        expect(chevronFor(at(10, 20), at(11, 22), 240, false)).toBe(CHEVRON_DOWN);
    });

    it('draws the ring on the final waypoint and nothing for a zero step', () => {
        expect(chevronFor(at(10, 20), at(11, 20), 240, true)).toBe(CHEVRON_DESTINATION);
        expect(chevronFor(at(10, 20), at(10, 20), 240, false)).toBeNull();
    });
});

describe('the sprite sheet', () => {
    it('is five 24x24 frames in one row, in the order the overlay assumes', () => {
        const bytes = readFileSync(resolve(REPO, 'web/public', CHEVRON_SHEET));
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        expect(width).toBe(CHEVRON_FRAME_W * CHEVRON_FRAMES);
        expect(height).toBe(CHEVRON_FRAME_H);
    });

    it('has a destination frame, so a route can end in something', () => {
        expect(CHEVRON_DESTINATION).toBe(CHEVRON_FRAMES - 1);
    });
});

describe('reveal', () => {
    it('starts at the head and only draws what is ahead', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        expect(h.guide.remaining()).toHaveLength(h.route.points.length);
        expect(h.guide.remaining()[0]).toMatchObject({ col: h.hero.col, row: h.hero.row });
    });

    it('keeps the first chevron on the hero, so the step he takes is marked', () => {
        // The defect this pins: route steps are exactly one tile apart, so a
        // "within one tile" progress tolerance made the hero standing on point N
        // also count as being on point N+1. The reveal ran ahead, swallowed the
        // first arrows, and left the step that leaves the hero unmarked — which
        // reads on screen as chevrons pointing off into the scenery.
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });

        // The hero is standing where the route starts and has not moved.
        expect(h.route.points[0]!.col).toBe(h.hero.col);
        expect(h.route.points[0]!.row).toBe(h.hero.row);
        expect(h.guide.remaining()[0]).toMatchObject({ col: h.hero.col, row: h.hero.row });

        // And the first arrow points at the second point, which is a real step.
        const first = chevronFor(h.route.points[0]!, h.route.points[1]!, 240, false);
        expect(first, 'the step leaving the hero must have a chevron').not.toBeNull();
    });

    it('does not swallow two arrows in one tick on a one-tile-per-step route', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        const total = h.guide.remaining().length;
        h.guide.update(1000);
        // Standing still must not consume any arrows at all.
        expect(h.guide.remaining().length).toBe(total);
    });

    it('keeps the anchor on the hero, so every frame marks the step ahead', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        h.guide.update(1000);                 // plan, then settle the anchor

        for (const step of [1, 2, 3]) {
            const point = h.route.points[step];
            if (!point) break;
            h.hero.col = point.col;
            h.hero.row = point.row;
            // Within the throttle, so no re-plan: this isolates the reveal.
            h.guide.update(1000 + step * 100);
            expect(h.guide.remaining()[0],
                `after ${step} tile(s) the anchor should be the hero's cell`)
                .toMatchObject({ col: h.hero.col, row: h.hero.row });
        }
    });

    it('consumes exactly one point per tile walked, ignoring re-planning', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        h.guide.update(1000);                 // record the plan; anchor settled
        const before = h.guide.remaining().length;
        h.hero.col = h.route.points[1]!.col;
        h.hero.row = h.route.points[1]!.row;
        h.guide.update(1050);                 // inside the throttle: no re-plan
        expect(h.guide.remaining().length).toBe(before - 1);
    });

    it('advances as the hero walks, dropping the part already covered', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        const before = h.guide.remaining().length;
        // Walk to the second route point.
        const second = h.route.points[1]!;
        h.hero.col = second.col;
        h.hero.row = second.row;
        h.guide.update(2000);
        const after = h.guide.remaining().length;
        expect(after).toBeLessThan(before);
        expect(after).toBeGreaterThan(0);
    });

    it('clears the route once the hero reaches the end', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        h.hero.col = goal.col;
        h.hero.row = goal.row;
        h.guide.update(2000);
        expect(h.guide.hasRoute).toBe(false);
        expect(h.guide.remaining()).toHaveLength(0);
    });

    it('clears the route when he lands on the destination out of a hop', () => {
        // The reveal advances only while the hero is standing on each point in
        // turn, so the last hop being a jump or a fall means he never stands on the
        // point before the end — and the arrival test used to ask whether he was
        // standing on the *anchor*, so the route stayed up for good after he had
        // arrived. It has to ask whether he is on the last point.
        const h = harness();
        const points = h.route.points;
        const goal = points[points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        // Let the plan settle, so the route is the whole walk and the reveal is
        // anchored at its first point.
        h.guide.update(1000);
        expect(h.guide.hasRoute).toBe(true);
        expect(h.guide.remaining().length).toBe(points.length);
        // Then he jumps the rest of the way: on the destination, with the anchor a
        // dozen tiles behind him and nothing in between to advance over.
        h.hero.col = goal.col;
        h.hero.row = goal.row;
        h.guide.update(1050);
        expect(h.guide.hasRoute, 'the route should end at the destination').toBe(false);
        expect(h.guide.remaining()).toHaveLength(0);
    });
});

describe('the reveal starts at the hero', () => {
    it('follows him when a jump skips points on the line', () => {
        // The second screenshot: nothing drawn at the hero's feet, the line starting
        // in a wall. The anchor only moved when he stood *exactly* on the next point,
        // so any move that skipped one left it behind — and the reveal started
        // there, off screen or inside scenery.
        const h = harness();
        const pts = h.route.points;
        expect(pts.length).toBeGreaterThan(4);
        const guide = new PathGuide({
            store: h.store,
            heroPosition: () => ({ ...h.hero }),
            capabilities: () => allCapabilities(),
        });
        guide.setRoute(h.route, pts[pts.length - 1]!);
        // Put the hero three points along, as a jump would.
        const ahead = pts[3]!;
        h.hero.mapId = ahead.mapId;
        h.hero.col = ahead.col;
        h.hero.row = ahead.row;
        guide.update(600);
        const remaining = guide.remaining();
        // eslint-disable-next-line no-console
        console.log('DEBUG hero', JSON.stringify(h.hero), 'pts0..8',
            pts.slice(0, 9).map((p) => `${p.col},${p.row}`).join(' '),
            'remaining0', `${remaining[0]?.col},${remaining[0]?.row}`, 'hasRoute', guide.hasRoute);
        expect(remaining.length).toBeGreaterThan(0);
        expect(remaining[0], 'the reveal should start where the hero stands').toMatchObject({
            col: ahead.col, row: ahead.row,
        });
    });
});

describe('chevron opacity', () => {
    it('is solid for the next steps and nearly gone fifteen ahead', () => {
        // The route is one line but many decisions; equal weight made it unreadable.
        for (const ahead of [0, 1, 2, 3]) {
            expect(chevronAlpha(ahead), `${ahead} ahead`).toBe(1);
        }
        expect(chevronAlpha(4)).toBeLessThan(1);
        expect(chevronAlpha(9)).toBeGreaterThan(0.15);
        for (const ahead of [15, 16, 90, 400]) {
            expect(chevronAlpha(ahead), `${ahead} ahead`).toBeCloseTo(0.15, 5);
        }
        // And it only ever fades: never brighter further along.
        let last = 1;
        for (let ahead = 0; ahead < 40; ahead++) {
            const a = chevronAlpha(ahead);
            expect(a, `ahead ${ahead}`).toBeLessThanOrEqual(last + 1e-9);
            last = a;
        }
    });
});

describe('dormancy', () => {
    it('draws nothing while a menu covers the cavern', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        expect(h.guide.isActive).toBe(true);
        h.guide.setDormant(true);
        expect(h.guide.isActive).toBe(false);
        h.guide.setDormant(false);
        expect(h.guide.isActive).toBe(true);
    });

    it('keeps the route itself live while dormant', () => {
        // The line must be correct the moment the menus close, not stale.
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        h.guide.setDormant(true);
        const second = h.route.points[1]!;
        h.hero.col = second.col;
        h.hero.row = second.row;
        h.guide.update(3000);
        expect(h.guide.hasRoute).toBe(true);
        expect(h.guide.remaining().length).toBeLessThan(h.route.points.length);
    });
});

describe('keeping the route true', () => {
    it('re-plans when the hero changes shoes', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        h.guide.update(1000);              // records the plan
        // Drop a capability the plan was made with: high jump.
        h.caps.mask &= ~(1 << 1);
        expect(() => h.guide.update(2000)).not.toThrow();
        expect(h.guide.hasRoute).toBe(true);
    });

    it('does not re-plan more often than the throttle allows', () => {
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        h.guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        h.guide.update(1000);
        // A capability change 100 ms later must be ignored by the throttle.
        h.caps.mask &= ~(1 << 1);
        h.guide.update(1100);
        // The route is intact and still usable.
        expect(h.guide.hasRoute).toBe(true);
        expect(h.guide.remaining().length).toBeGreaterThan(0);
    });

    it('drops the route when the goal stops being reachable', () => {
        const h = harness();
        // A goal on a map with no door table at all cannot be routed to.
        h.guide.setRoute(h.route, { mapId: 29, col: 0, row: 0 });
        h.guide.update(1000);
        expect(h.guide.hasRoute).toBe(false);
    });

    it('keeps the route while the hero is in mid-air', () => {
        // The chevrons vanished when he jumped over the platform at (182,57): the
        // cell under him in mid-air is not a standing position, so the drift check
        // demanded a re-plan, the search from there found nothing, and the guide
        // cleared the route. A jump is how the route itself crosses gaps, so being
        // off the line is not drift and no re-plan is due.
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        const guide = new PathGuide({
            store: h.store,
            heroPosition: () => ({ mapId: 0, col: goal.col + 40, row: goal.row }),
            capabilities: () => allCapabilities(),
        });
        guide.setRoute(h.route, goal);
        guide.update(1000);
        expect(guide.hasRoute, 'a hero standing on no node is not drift').toBe(true);
        // Twenty seconds of it: long past the refresh interval, still standing
        // nowhere.
        for (let t = 2000; t <= 60_000; t += 2000) guide.update(t);
        expect(guide.hasRoute).toBe(true);
    });

    it('draws every cell a long hop covers, so the line has no gap', () => {
        // One chevron per hop put an arrow at the tile a jump left from and nothing
        // for the nine columns it crossed, which read on screen as a broken route.
        const store = realStore();
        const route = findRoute({
            store, caps: allCapabilities(),
            start: { mapId: 23, col: 113, row: 21 },
            goal: { mapId: 23, col: 151, row: 6 },
        });
        expect(route, 'the player route should resolve').not.toBeNull();
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ mapId: 23, col: 113, row: 21 }),
            capabilities: () => allCapabilities(),
        });
        guide.setRoute(route!, route!.points[route!.points.length - 1]!);

        // Every hop of two tiles or more must report the cells between its ends,
        // and the whole route must come out with no tile missing between the first
        // and last cell drawn.
        const gaps: string[] = [];
        let previous: NavPoint | null = null;
        const points = route!.points;
        for (let i = 0; i + 1 < points.length; i++) {
            const cells = guide.cellsForHop(i);
            if (cells.length < 2) continue;
            if (previous) {
                const d = Math.abs(previous.col - cells[0]!.col)
                    + Math.abs(previous.row - cells[0]!.row);
                if (d > 1) gaps.push(`${previous.col},${previous.row} -> ${cells[0]!.col},${cells[0]!.row}`);
            }
            previous = cells[cells.length - 1]!;
        }
        expect(gaps, 'chevron cells should join up hop to hop').toEqual([]);

        // And the jump over the airflow gap is one of them: nine columns, no bare
        // arrow at one end.
        const jump = route!.hops.findIndex((hop) => {
            if (hop.kind !== EDGE.JUMP && hop.kind !== EDGE.JUMP_HIGH) return false;
            const d = Math.abs(hop.from.col - hop.to.col);
            return d > 3;
        });
        expect(jump, 'the route should contain a multi-column jump').toBeGreaterThanOrEqual(0);
        expect(guide.cellsForHop(jump).length).toBeGreaterThan(3);
    });

    it('survives being told the hero is not in a cavern at all', () => {
        const guide = new PathGuide({
            store: realStore(),
            heroPosition: () => null,
            capabilities: () => allCapabilities(),
        });
        const h = harness();
        const goal = h.route.points[h.route.points.length - 1]!;
        guide.setRoute(h.route, { mapId: goal.mapId, col: goal.col, row: goal.row });
        expect(() => guide.update(1000)).not.toThrow();
        expect(guide.hasRoute).toBe(true);
    });
});

describe('the guide is optional plumbing', () => {
    it('does nothing before a route exists', () => {
        const h = harness();
        expect(() => h.guide.update(1000)).not.toThrow();
        expect(h.guide.isActive).toBe(false);
        expect(h.guide.remaining()).toHaveLength(0);
    });

    it('clear() empties it', () => {
        const h = harness();
        h.guide.setRoute(route(5), { mapId: 0, col: 15, row: 20 });
        h.guide.clear();
        expect(h.guide.hasRoute).toBe(false);
        expect(h.guide.isActive).toBe(false);
    });
});

describe('Q', () => {
    it('is routed to the guide only in an unpaused cavern', async () => {
        const { KeyRouter } = await import('../src/input/key-router.js');
        const calls: string[] = [];
        const make = (over: Record<string, unknown> = {}) => {
            const deps = {
                modalActive: () => false,
                inventoryOpen: () => false,
                mapScreenActive: () => false,
                introActive: () => false,
                endingActive: () => false,
                indoorScene: () => null,
                speedDialog: () => null,
                engineReady: () => true,
                gamePaused: () => false,
                gameMode: () => 'dungeon',
                conversationActive: () => false,
                toggleMusic: () => {},
                toggleSfx: () => {},
                openRestoreModal: () => {},
                openImportExportModal: () => {},
                startSpeedChange: () => {},
                cancelSpeedChange: () => {},
                finishSpeedChange: () => {},
                speedBeginSelect: () => {},
                setSpeedDigit: () => {},
                openInventory: () => {},
                setKey: () => calls.push('setKey'),
                resetInventoryCombo: () => {},
                clearActiveRoute: () => calls.push('clearActiveRoute'),
                modalHandleKey: () => false,
                mapHandleKey: () => false,
                inventoryHandleKey: () => false,
                introSkipPage: () => {},
                endingSkipPage: () => {},
                ...over,
            };
            return new KeyRouter(deps as never);
        };
        const evt = (code: string) => ({ code, repeat: false, ctrlKey: false, shiftKey: false });

        // In a cavern, unpaused: Q clears the route and never reaches the engine.
        make().keyDown(evt('KeyQ'), 1000);
        expect(calls).toEqual(['clearActiveRoute']);

        // Paused (a menu is up): Q is an ordinary key press, not a cancel.
        calls.length = 0;
        make({ gamePaused: () => true }).keyDown(evt('KeyQ'), 1000);
        expect(calls).toEqual(['setKey']);

        // In town: same.
        calls.length = 0;
        make({ gameMode: () => 'town' }).keyDown(evt('KeyQ'), 1000);
        expect(calls).toEqual(['setKey']);
    });
});
