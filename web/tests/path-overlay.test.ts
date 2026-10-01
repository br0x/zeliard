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
    let start = -1;
    for (let i = 0; i < graph.nodes.length; i++) {
        const n = graph.nodes[i]!;
        if (n.kind !== 0) continue;
        if (graph.edgeOffsets[i + 1]! - graph.edgeOffsets[i]! >= 6) { start = i; break; }
    }
    expect(start, 'mp10 should have a well-connected standing position').toBeGreaterThanOrEqual(0);
    const from = graph.nodes[start]!;

    // A real goal a short walk away on the same map.
    let goalNode = -1;
    for (let i = 0; i < graph.nodes.length && goalNode < 0; i++) {
        const n = graph.nodes[i]!;
        if (n.kind !== 0) continue;
        const d = Math.min(Math.abs(n.col - from.col), graph.mapWidth - Math.abs(n.col - from.col));
        if (d > 8 && d < 20 && Math.abs(n.row - from.row) < 4) goalNode = i;
    }
    expect(goalNode, 'mp10 should have a reachable goal nearby').toBeGreaterThanOrEqual(0);
    const goal = graph.nodes[goalNode]!;

    const hero = { mapId: 0, col: from.col, row: from.row };
    const caps = { ...allCapabilities() };
    const route = findRoute({
        store, caps,
        start: { mapId: hero.mapId, col: hero.col, row: hero.row },
        goal: { mapId: 0, col: goal.col, row: goal.row },
    })!;
    expect(route.points.length).toBeGreaterThan(1);

    const guide = new PathGuide({
        store,
        heroPosition: () => ({ ...hero }),
        capabilities: () => ({ ...caps }),
    });
    return { guide, store, hero, caps, route };
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
