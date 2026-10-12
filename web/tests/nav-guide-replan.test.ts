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
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    NavGraphStore, findRoute, type NavPoint, type NavRoute,
} from '../src/engine/nav/pathfinder.js';
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

describe('a re-plan that finds nothing does not become a loop', () => {
    // The guide searches again the moment a platform moves, ahead of every waiting
    // interval — rightly, since the row a platform offers as a landing has changed
    // under the route. What it did not do was record that it had *asked* when the
    // answer was nothing: the platform signature was only written after a successful
    // search, so it stayed stale, `needsReplan` kept answering true, and the guide
    // ran one synchronous `findRoute` after another for as long as the hero stood
    // still. That is the freeze the player hit on mp81 after driving its platform up.
    it('asks again only when the world changes, not on every frame', { timeout: 120_000 }, () => {
        const store = realStore();
        const caps = bareCapabilities();
        const route = findRoute({ store, caps, collectKeys: true, start: START, goal: GOAL })!;
        expect(route, 'the screen answers at the keys rung').not.toBeNull();

        const warns: string[] = [];
        const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
            warns.push(args.map(String).join(' '));
        });
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...START }),
            capabilities: () => caps,
        });
        // Set without the plan that found the route, so every re-plan asks the
        // stricter question and finds nothing.
        guide.setRoute(route, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row });

        // A platform on the route moves (mp81 = map 24), and he stands there watching it.
        store.setPlatformPlaces(24, new Map([[0, 1]]));
        for (let t = 1; t <= 200; t++) guide.update(1_000_000 + t);

        expect(warns.length, `one search, not one per frame:\n${warns.slice(0, 5).join('\n')}`)
            .toBe(1);
        expect(guide.hasRoute, 'the old route is kept throughout').toBe(true);
        spy.mockRestore();
    });
});

describe('a route the hero can no longer pay for is re-planned at once', () => {
    // The player's journey: mp80 (111,21) to mp80 (227,34), past the locked door at
    // mp81 (236,5), fetching the key for it. It used to be two doors and two keys —
    // the west gallery at mp80 (57,16) was on the way as well — but mp80 now reaches
    // mp82 through the door at (166,31) and the row-32 gallery, so the gallery is not
    // on the way and the journey costs the one key the mp81 door needs.
    //
    // He came back to mp82 (174,10) — the doorway onto mp81 — with the second key
    // still on the floor at mp81 (125,36), and the chevrons told him to go straight
    // through it into mp81 and on to the door at mp81 (236,5), which is shut and
    // which he has nothing to open it with. "As if I had the key, but I still have
    // to pick it up." Opening the inventory fixed it, and that is the tell: the guide
    // *knew* the route was stale — `needsReplan` had been answering true the whole
    // way — and the only thing it was waiting for was `isIdle`, which the player
    // granted by releasing the direction key.
    //
    // So the route it is holding is the one a search with one key in the pocket
    // produces from mp81 (53,18): straight out through the door at mp82 (174,10),
    // on to mp81 (227,60), and through the locked door at mp81 (236,5) — fetching
    // nothing, because as far as that search was concerned there was a key to spend.
    const START = { mapId: 23, col: 111, row: 21 };
    const GOAL = { mapId: 23, col: 227, row: 34 };
    /** Where the door at mp82 (174,9) puts him, on his way to the key. */
    const ARRIVAL = { mapId: 24, col: 53, row: 18 };
    const PLAN = { collectKeys: true, planAccessories: true } as const;

    /**
     * What the guide thinks it is short of, asked the way `tick` asks it.
     *
     * `keysShort` is the question that decayed in the player's log, so it is what these
     * tests assert on. `remaining().length` cannot: the anchor moves as he walks, and a
     * short tail proves nothing about whether the route was replaced.
     */
    function shortfall(guide: PathGuide, keys: number, lionKeys = 0): number {
        return (guide as unknown as { keysShort(caps: unknown): number })
            .keysShort({ ...bareCapabilities(), keys, lionKeys });
    }

    /**
     * One store for the search and the guide, as the composition root does it: the
     * guide reads the caverns the route crosses out of the same cache the search filled,
     * and a store of its own would have nothing in it.
     */
    function guideWith(store: NavGraphStore, route: NavRoute, keys: number, idle: boolean) {
        const hero = { ...ARRIVAL };
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...hero }),
            capabilities: () => ({ ...bareCapabilities(), keys }),
            // The hero is walking: a direction key is held, so the guide may not
            // spend a frame on a search. That is the whole of the report.
            isIdle: () => idle,
        });
        guide.setRoute(route, GOAL, PLAN);
        return guide;
    }

    it('the route that walks into the shut door is the one a search with a key finds',
        { timeout: 120_000 }, () => {
            const store = realStore();
            const route = findRoute({
                store, caps: { ...bareCapabilities(), keys: 1 },
                start: ARRIVAL, goal: GOAL, ...PLAN,
            })!;
            expect(route, 'mp81 (53,18) with one key held').not.toBeNull();
            expect(route.keysGained.ordinary, 'it fetches nothing — it has a key to spend')
                .toBe(0);
            expect(route.lockedDoors.ordinary, 'and the shut door at mp81 (236,5) is on it')
                .toBe(1);
        });

    it('is thrown away the moment the pocket stops covering it, hero walking or not',
        { timeout: 120_000 }, () => {
            const store = realStore();
            const route = findRoute({
                store, caps: { ...bareCapabilities(), keys: 1 },
                start: ARRIVAL, goal: GOAL, ...PLAN,
            })!;
            const guide = guideWith(store, route, 0, false);
            guide.update(1_000_000);

            expect(guide.hasRoute, 'a route is still drawn').toBe(true);
            const rest = findRoute({
                store, caps: bareCapabilities(), start: ARRIVAL, goal: GOAL, ...PLAN,
            })!;
            // The re-plan is asked from where the hero stands, so what it found is
            // the journey an empty pocket can actually finish.
            expect(guide.remaining().length, 'and it is the journey that fetches the key')
                .toBe(rest.points.length);
            expect(guide.remaining().length, 'which is longer: out to the key and back')
                .toBeGreaterThan(route.points.length);
        });

    it('so the door at mp82 (174,10) leads to the key again, not out of it',
        { timeout: 120_000 }, () => {
            // The player's report, as a position and a picture. He arrives at the
            // doorway onto mp81 and the trail points back out of it — the leg that
            // only makes sense once the key is in his pocket, which it is not.
            const store = realStore();
            const route = findRoute({
                store, caps: { ...bareCapabilities(), keys: 1 },
                start: ARRIVAL, goal: GOAL, ...PLAN,
            })!;
            const door = route.points.findIndex((p) => p.mapId === 25 && p.col === 174 && p.row === 10);
            expect(door, 'the route runs through the door he arrives at').toBeGreaterThan(0);
            expect(route.points[door + 1], 'and out of it, as if he had the key')
                .toMatchObject({ mapId: 24, col: 227, row: 60 });

            const hero = { mapId: 25, col: 174, row: 10 };
            const guide = new PathGuide({
                store,
                heroPosition: () => ({ ...hero }),
                capabilities: () => ({ ...bareCapabilities(), keys: 0 }),
                isIdle: () => false,
            });
            guide.setRoute(route, GOAL, PLAN);
            guide.update(1_000_000);

            const [first, second] = guide.remaining();
            expect(first, 'the anchor is on the door he is standing at')
                .toMatchObject({ mapId: 25, col: 174, row: 10 });
            expect(second, 'and the next step is west towards the key, not through the door')
                .toMatchObject({ mapId: 25, col: 173, row: 10 });
        });

    it('does not count a key the hero has already walked over as one still coming',
        { timeout: 120_000 }, () => {
            // The line from the player's console that settled the report:
            //
            //   hero=24:(151,16) anchor=770/876 ... keys=0 gained=2/0 spent=2/0 short=-1
            //
            // An 876-point route that fetches two keys, with an empty pocket, standing
            // on a locked door and one shut door still ahead — and the guard called it
            // covered, because `keysGained` is a total for the whole journey and both
            // fetches were already behind the anchor. It counted the key he had
            // already walked over as one still to come, so the shortfall came out at
            // -1, no re-plan went out, and the route drew him through the door at
            // mp82 (174,10) into mp81 (227,60) and on to the shut door at mp81 (236,5).
            //
            // The same shape on the journey the test already has: hold the whole trip,
            // walk him on to the shut door at mp81 (236,5), and give the guide an empty
            // pocket. The key he fetched at mp81 (125,36) is a long way behind him by
            // then, and the door he is standing in front of is not.
            //
            // The walk has to end *in front of* the door rather than a step past the key,
            // because a key is collected from the cell the hero stands on: re-planning
            // while he is still on it answers honestly, and there is nothing to be short
            // of. That is the guard working, not failing.
            const store = realStore();
            const journey = findRoute({
                store, caps: bareCapabilities(), start: START, goal: GOAL, ...PLAN,
            })!;
            // Two, not one: with mp81's interior cut off from the non-passable
            // stretch of row 62 at columns 153-158, the mp81 key is no longer within
            // reach without first crossing mp80's shut door at (57,16). See
            // `clearOfPlatform` in jump.ts.
            expect(journey.keysGained.ordinary, 'the journey fetches a key for each shut door').toBe(2);
            const lastKey = journey.points.findIndex((p) => p.mapId === 24
                && p.col === 125 && p.row === 36);
            expect(lastKey, 'and the mp81 key is on it').toBeGreaterThan(0);
            // The mp81 key is fetched *after* the first shut door now, so what holds
            // is the pocket: every door is paid for out of keys already in hand.
            // `pick` walks the route the way the guide does.
            let pocket = 0;
            let overdrawn = -1;
            for (let i = 0; i < journey.hops.length; i++) {
                for (const p of journey.picks) if (p.at <= i) pocket++;
                if (journey.hops[i]!.doorKey === 1) pocket--;
                if (pocket < 0 && overdrawn < 0) overdrawn = i;
            }
            expect(overdrawn, 'never overdrawn on the way').toBe(-1);
            const shut = journey.hops.findIndex((h) => h.doorKey === 1);
            expect(shut, 'and the doors it opens are on it').toBeGreaterThanOrEqual(0);
            const past = shut - 1;
            expect(journey.points[past], 'which is the cell in front of it').toBeDefined();

            const hero = { ...journey.points[0]! };
            const guide = new PathGuide({
                store,
                heroPosition: () => ({ ...hero }),
                // An empty pocket throughout, so the pickup on the cell at mp81 (125,36)
                // does not register: the key is behind him and he has nothing.
                capabilities: () => bareCapabilities(),
                // Walking the whole way. Waiting for him to stop is what let the wrong
                // line stand for the whole leg.
                isIdle: () => false,
            });
            guide.setRoute(journey, GOAL, PLAN);
            let clock = 1_000;
            for (let i = 0; i <= past; i++) {
                const step = journey.points[i]!;
                hero.mapId = step.mapId; hero.col = step.col; hero.row = step.row;
                clock += 500;
                guide.update(clock);
            }

            expect(shortfall(guide, 0),
                'one key short: the shut door at mp81 (236,5) with nothing to open it'
                + ' and the key he walked over behind him').toBe(1);
            expect(shortfall(guide, 1), 'and not short once it is in his pocket').toBe(0);
        });

    it('answers the same way with no cavern graph in hand at all', { timeout: 180_000 }, () => {
        // The player log showed the guard working and then quietly giving up:
        //
        //   anchor=770/876 keys=0 gained=2/0 spent=2/0 short=0 askedShort=1
        //   ... the same route, the same anchor, a moment later ...
        //
        // `askedShort=1` is a shortfall this guide had already found and recorded.
        // `short=0` is what it answered on the next frame. Nothing about the route or the
        // pocket had changed — what had changed was the *store*, which `reset` empties on
        // every change of cavern. A cavern with no graph in hand read as having no shut
        // door, so the question that is supposed to catch a route he cannot walk was
        // answered from a map that was never there.
        //
        // So the walk below empties the store on every single tick, which is the state
        // the guide is genuinely in most of the time, and the shortfall must not move.
        const store = realStore();
        const journey = findRoute({
            store, caps: bareCapabilities(), start: START, goal: GOAL, ...PLAN,
        })!;
        expect(journey.keysGained.ordinary, 'one key per shut door').toBe(2);
        const lastKey = journey.points.findIndex((p) => p.mapId === 24
            && p.col === 125 && p.row === 36);
        expect(lastKey).toBeGreaterThan(0);
        // Walk him on to the shut door itself, for the reason the test above gives:
        // a key is collected from the cell he stands on, so a hero still on it is not
        // short of anything.
        // The **last** shut door is the one the mp81 key pays for, and the mp81 key
        // now comes after the first shut door on the way there — see the test above.
        const shut = journey.hops.map((h) => h.doorKey === 1).lastIndexOf(true);
        expect(shut).toBeGreaterThan(lastKey);

        const hero = { ...journey.points[0]! };
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...hero }),
            capabilities: () => bareCapabilities(),
            isIdle: () => false,
        });
        guide.setRoute(journey, GOAL, PLAN);
        let clock = 1_000;
        for (let i = 0; i <= shut - 1; i++) {
            const step = journey.points[i]!;
            hero.mapId = step.mapId; hero.col = step.col; hero.row = step.row;
            clock += 500;
            // `syncPlatformPlaces` does this on every cavern change, and the guide must
            // not depend on a graph surviving it.
            store.reset();
            guide.update(clock);
        }

        expect(shortfall(guide, 0),
            'the same shortfall as with every graph in hand: one shut door, nothing to'
            + ' open it, and no key left on the floor ahead of him').toBe(1);
    });

    it('and does not let an ordinary key stand in for a Lion-Head one', () => {
        // The two pockets are counted separately because the game has exactly one
        // Lion-Head key and one Lion-Head door, and an ordinary key must not open it.
        // A route is built here rather than found, because no journey in the level data
        // puts a Lion-Head door and an ordinary key on the same stretch.
        const at = (col: number, row: number, node: number): NavPoint =>
            ({ mapId: 0, col, row, node });
        const from = at(1, 10, 0);
        const to = at(2, 10, 1);
        const route: NavRoute = {
            points: [from, to],
            hops: [{ kind: 0, cost: 4, from, to, doorKey: 2 }],
            cost: 4,
            keysSpent: { ordinary: 0, lion: 1 },
            keysGained: { ordinary: 0, lion: 0 },
            picks: [],
            equipment: [],
            lockedDoors: { ordinary: 0, lion: 1 },
            maps: [0],
            crossesAggressiveGround: false,
            crossesSlopes: false,
            usesPlatforms: false,
            usesCurrents: false,
            expanded: 0,
        };
        const hero = { ...from };
        const guide = new PathGuide({
            store: new NavGraphStore(() => null),
            heroPosition: () => ({ ...hero }),
            capabilities: () => ({ ...bareCapabilities(), keys: 9 }),
            isIdle: () => false,
        });
        guide.setRoute(route, to);
        expect(shortfall(guide, 9),
            'nine ordinary keys and no Lion-Head one: the Lion-Head door is unpayable')
            .toBe(1);
        const withLion = new PathGuide({
            store: new NavGraphStore(() => null),
            heroPosition: () => ({ ...hero }),
            capabilities: () => ({ ...bareCapabilities(), keys: 9, lionKeys: 1 }),
            isIdle: () => false,
        });
        withLion.setRoute(route, to);
        expect(shortfall(withLion, 9, 1),
            'which is not short once the Lion-Head key is held')
            .toBe(0);
    });

    it('and asks about it once, not once a frame', { timeout: 120_000 }, () => {
        // The freeze the player hit on mp81 was a re-plan that fired every frame
        // because the ask was never recorded. This one bypasses the idle gate, so it
        // has to be recorded, or it is exactly that freeze with a new cause.
        const store = realStore();
        const route = findRoute({
            store, caps: { ...bareCapabilities(), keys: 1 },
            start: ARRIVAL, goal: GOAL, ...PLAN,
        })!;
        const warns: string[] = [];
        const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
            warns.push(args.map(String).join(' '));
        });
        try {
            const guide = new PathGuide({
                store,
                heroPosition: () => ({ ...ARRIVAL }),
                capabilities: () => ({ ...bareCapabilities(), keys: 0 }),
                isIdle: () => false,
            });
            // Set without the plan that found the route, so the re-plan asks the
            // stricter question — no fetching — and finds nothing. That is the state
            // the shortfall has to be remembered in: a failure is still an ask.
            guide.setRoute(route, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row });
            for (let t = 1; t <= 300; t++) guide.update(1_000_000 + t);
            expect(warns.length, `one search, not one per frame:\n${warns.slice(0, 3).join('\n')}`)
                .toBe(1);
        } finally {
            spy.mockRestore();
        }
    });

    it('and a route the pocket does cover is left alone until the hero stops', () => {
        const store = realStore();
        const route = findRoute({
            store, caps: bareCapabilities(), start: ARRIVAL, goal: GOAL, ...PLAN,
        })!;
        expect(route.keysGained.ordinary, 'with an empty pocket it fetches the key')
            .toBe(1);
        const guide = guideWith(store, route, 0, false);
        expect(shortfall(guide, 0),
            'and nothing is short: the shut door ahead is paid for by the key lying'
            + ' between here and it, which is ahead of the hero for once').toBe(0);
        guide.update(1_000_000);
        expect(guide.remaining().length, 'nothing changed, so the route stands')
            .toBe(route.points.length);
    });

    it('and counts a key ahead as well as a door, per pocket', () => {
        // The whole journey from the top: one shut door ahead, one key ahead, an empty
        // pocket. Short only if the pickup is counted, and a pickup is the half that is
        // not a door — it can only come from the route itself, which is why `findRoute`
        // names the points its keys lie on rather than leaving a consumer to go and
        // look for them.
        const store = realStore();
        const journey = findRoute({
            store, caps: bareCapabilities(), start: START, goal: GOAL, ...PLAN,
        })!;
        expect(journey.lockedDoors.ordinary, 'two shut doors on it').toBe(2);
        expect(journey.picks.length, 'and a key for each').toBe(2);
        expect(journey.picks.every((p) => p.kind === 0), 'ordinary').toBe(true);

        const hero = { ...journey.points[0]! };
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...hero }),
            capabilities: () => bareCapabilities(),
            isIdle: () => false,
        });
        guide.setRoute(journey, GOAL, PLAN);
        expect(shortfall(guide, 0), 'the key ahead pays for the door').toBe(0);
        expect(shortfall(guide, 1), 'and one in the pocket').toBe(0);

        // Past the first fetch and the door it opened, with nothing to show for it:
        // one door and one key still ahead of him.
        const door = journey.hops.findIndex((h) => h.doorKey === 1);
        expect(door, 'the journey pays for a door').toBeGreaterThan(0);
        const pastDoor = { ...journey.points[door + 1]! };
        const after = new PathGuide({
            store,
            heroPosition: () => ({ ...pastDoor }),
            capabilities: () => bareCapabilities(),
            isIdle: () => false,
        });
        after.setRoute(journey, GOAL, PLAN);
        // Through the door, the fetch that paid for it is behind him: one shut door and
        // one key left ahead of him, which is a journey he can still finish.
        (after as unknown as { progress: number }).progress = door + 1;
        expect(shortfall(after, 0),
            'one shut door ahead, one key ahead to pay for it').toBe(0);
        // One step back — standing *in front of* that door again, with the fetch behind
        // him — and the key that paid for it no longer counts. This is the whole defect:
        // `keysGained` is a total for the journey, and a total still counts a key he
        // walked over an hour ago, so an empty pocket in front of a locked door read as
        // covered.
        (after as unknown as { progress: number }).progress = door;
        expect(shortfall(after, 0), 'the same route, one step earlier, is one short').toBe(1);
    });
});
