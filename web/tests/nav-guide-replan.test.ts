/**
 * nav-guide-replan.test.ts — the guide re-plans under the state the map screen used.
 *
 * The Thread of Yaga is spent the moment a destination is picked, and from then on the
 * chevrons are drawn by `PathGuide`, which **re-plans** the route from wherever the hero
 * has got to rather than replaying the one the screen handed over. So the two searches
 * have to agree about the world — and when they disagree the guide asks a *stricter*
 * question, finds nothing, and `PathGuide.update` clears the route. That is the whole
 * thread disappearing on the first frame after it is spent, which is worse than drawing
 * a wrong line: there is nothing to look at at all.
 *
 * Two ways this happened, both about state the screen knew and the guide did not:
 *
 *  1. **The key a route fetches.** A fresh mp10(61,7) to mp10(128,33) has no route with
 *     an empty pocket, so the screen answers at its "collect the keys" rung and hands
 *     over a route that walks to the key at mp10(99,41). Re-planned without that flag,
 *     with an empty pocket and a locked door, there is no route — and the thread went.
 *  2. **The door a key opened.** A key is spent once and its door is then open for good,
 *     so after the boss the locked door at mp10(26,16) is open and the key is gone from
 *     the floor. Re-planned against the level data, which says the door shipped locked,
 *     the search again found nothing.
 *
 * Both are carried now: the screen hands the guide the plan that produced the route
 * (`NavRoutePlan`), and the guide replays it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NavGraphStore, findRoute } from '../src/engine/nav/pathfinder.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function realStore(): NavGraphStore {
    const cache = new Map<number, Uint8Array>();
    return new NavGraphStore((mapId) => {
        const meta = NAV_MAP_BY_ID.get(mapId);
        if (!meta) return null;
        let hit = cache.get(mapId);
        if (!hit) {
            hit = new Uint8Array(readFileSync(resolve(REPO, `web/public/game/0/${meta.nameKey}.mdt`)));
            cache.set(mapId, hit);
        }
        return hit;
    });
}

/** The boss door's own record cell in mp10; the hero stands at (26,16) to use it. */
const BOSS_DOOR: readonly [number, number] = [26, 15];
const OPEN_DOOR = (mapId: number, x0: number, y0: number): boolean | null =>
    (mapId === 0 && x0 === BOSS_DOOR[0] && y0 === BOSS_DOOR[1]) ? true : null;

const START = { mapId: 0, col: 61, row: 7 };
const GOAL = { mapId: 0, col: 128, row: 33 };

/** What the map screen hands the guide with a route from its "collect keys" rung. */
const FRESH_PLAN = { collectKeys: true } as const;

describe('the guide and the map screen must agree about the world', () => {
    it('a route that fetches a key keeps it, because the plan says so', () => {
        const store = realStore();
        const caps = bareCapabilities();
        const START = { mapId: 0, col: 61, row: 7 };
        const GOAL = { mapId: 0, col: 128, row: 33 };
        const route = findRoute({ store, caps, collectKeys: true, start: START, goal: GOAL });
        expect(route, 'the screen answers at the keys rung for a fresh hero').not.toBeNull();
        expect(route!.keysGained.ordinary, 'and the route fetches the key').toBe(1);
        expect(findRoute({ store, caps, start: START, goal: GOAL }),
            'while an empty pocket has no route at all').toBeNull();

        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...START }),
            capabilities: () => caps,
        });
        guide.setRoute(route!, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row }, FRESH_PLAN);
        guide.update(1_000_000);
        expect(guide.hasRoute, 'the re-plan repeats the plan and keeps the route').toBe(true);
        expect(guide.isActive, 'and the chevrons draw').toBe(true);
    });

    it('and without the plan the same route is kept on replan failure', () => {
        const store = realStore();
        const caps = bareCapabilities();
        const START = { mapId: 0, col: 61, row: 7 };
        const GOAL = { mapId: 0, col: 128, row: 33 };
        const route = findRoute({ store, caps, collectKeys: true, start: START, goal: GOAL })!;
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...START }),
            capabilities: () => caps,
        });
        guide.setRoute(route, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row });
        guide.update(1_000_000);
        // New behavior: keeps the old route on replan failure
        expect(guide.hasRoute, 'replan failed but keeps old route').toBe(true);
    });
});

describe('the guide and the map screen must agree about doors', () => {
    it('a route through an open door survives the first re-plan', () => {
        const store = realStore();
        // The post-boss state: the door stands open, and the key that opened it is
        // spent and gone from the floor, so no search may fetch one.
        const route = findRoute({
            store, caps: bareCapabilities(), doorOpen: OPEN_DOOR,
            keyPresent: () => false, start: START, goal: GOAL,
        });
        expect(route, 'the map screen finds a bare route through the open door').not.toBeNull();
        expect(route!.maps, 'and it goes through the boss arena').toContain(1);

        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...START }),
            capabilities: () => bareCapabilities(),
            doorOpen: OPEN_DOOR,
        });
        guide.setRoute(route!, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row },
            { doorOpen: OPEN_DOOR });
        expect(guide.hasRoute, 'the route is set').toBe(true);

        guide.update(1_000_000);
        expect(guide.hasRoute, 'the re-plan found it again and kept it').toBe(true);
        expect(guide.isActive, 'and the chevrons are drawing').toBe(true);
    });

    it('and without it there is no route at all, so the guide keeps the old one', () => {
        // The shape of the bug this guards, kept as the second half of the pair: the
        // blind search finds nothing, but the guide now keeps the old route instead
        // of clearing it.
        const store = realStore();
        const caps = bareCapabilities();
        const route = findRoute({
            store, caps, doorOpen: OPEN_DOOR, keyPresent: () => false, start: START, goal: GOAL,
        })!;
        expect(findRoute({ store, caps, keyPresent: () => false, start: START, goal: GOAL }),
            'without the door state there is no bare route').toBeNull();

        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...START }),
            capabilities: () => caps,
        });
        guide.setRoute(route, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row });
        guide.update(1_000_000);
        // New behavior: keeps the old route on replan failure
        expect(guide.hasRoute, 'and the guide keeps it').toBe(true);
    });

    it('a doorOpen on the deps answers for a route set without a plan', () => {
        // An older caller that hands the guide a bare route still gets the live door
        // state, so the fallback in `doorState` is load-bearing and not dead code.
        const store = realStore();
        const route = findRoute({
            store, caps: bareCapabilities(), doorOpen: OPEN_DOOR,
            keyPresent: () => false, start: START, goal: GOAL,
        })!;
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...START }),
            capabilities: () => bareCapabilities(),
            doorOpen: OPEN_DOOR,
        });
        guide.setRoute(route, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row });
        guide.update(1_000_000);
        expect(guide.hasRoute, 'the fallback keeps it').toBe(true);
    });
});
