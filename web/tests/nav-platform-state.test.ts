/**
 * nav-platform-state.test.ts — where the platforms are, and the graph that follows.
 *
 * A vertical or collapsing platform is three solid tiles the hero drives up and down,
 * and the cavern puts every one of them back at `startY` when he enters through a
 * door. That is engine memory rather than map data, so the navigation model is told
 * where the platforms are instead of assuming it, and the graph is rebuilt when they
 * move. What that buys is in nav-platform-model.test.ts and nav-graph.test.ts; this is
 * the plumbing, from `g_mem` through to a route that follows a lift up.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    COLLAPSING_PLATFORMS_LIST, VERTICAL_PLATFORMS_LIST,
    readPlatformPlaces, samePlatformPlaces,
} from '../src/engine/nav/platform-state.js';
import { NavGraphStore, findRoute } from '../src/engine/nav/pathfinder.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { allCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { NAV_PLATFORMS } from '../src/data/nav/nav-platforms.js';
import { getGmem, memWrite8, memWrite16, zeroMemory } from '../src/core/ts-memory.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function storeFor(mapId: number): NavGraphStore {
    const bytes = new Uint8Array(readFileSync(
        resolve(REPO, `web/public/${NAV_MAP_BY_ID.get(mapId)!.mdtPath}`),
    ));
    return new NavGraphStore((id) => (id === mapId ? bytes : null));
}

describe('reading the live rows out of g_mem', () => {
    it('walks a three-byte list and stops at 0xffff', () => {
        const g = getGmem();
        zeroMemory();
        const list = 0x2000;
        memWrite16(g, VERTICAL_PLATFORMS_LIST, list);
        // { absX word, y byte } × 3, then the terminator.
        const entries: [number, number][] = [[5, 26], [169, 49], [0x1234, 7]];
        entries.forEach(([x, y], i) => {
            memWrite16(g, list + i * 3, x);
            memWrite8(g, list + i * 3 + 2, y);
        });
        memWrite16(g, list + 9, 0xffff);
        // Whatever is past the terminator must not be read: this is a decoy.
        memWrite16(g, list + 12, 77);
        memWrite8(g, list + 14, 12);

        expect([...readPlatformPlaces(g)]).toEqual([[5, 26], [169, 49], [0x1234, 7]]);
    });

    it('reads both lists into one answer, and nothing from an uninitialised one', () => {
        const g = getGmem();
        zeroMemory();
        const vertical = 0x3000;
        const collapsing = 0x4000;
        memWrite16(g, VERTICAL_PLATFORMS_LIST, vertical);
        memWrite16(g, vertical, 17);
        memWrite8(g, vertical + 2, 24);
        memWrite16(g, vertical + 3, 0xffff);
        memWrite16(g, COLLAPSING_PLATFORMS_LIST, collapsing);
        memWrite16(g, collapsing, 124);
        memWrite8(g, collapsing + 2, 41);
        memWrite16(g, collapsing + 3, 0xffff);
        expect([...readPlatformPlaces(g)]).toEqual([[17, 24], [124, 41]]);

        // mp83 has both families, and a pointer left at zero means the cavern has none.
        zeroMemory();
        expect(readPlatformPlaces(g).size).toBe(0);
    });

    it('says when two readings differ', () => {
        expect(samePlatformPlaces(new Map([[5, 26]]), new Map([[5, 26]]))).toBe(true);
        expect(samePlatformPlaces(new Map([[5, 26]]), new Map([[5, 25]]))).toBe(false);
        expect(samePlatformPlaces(new Map([[5, 26]]), new Map([[5, 26], [9, 3]]))).toBe(false);
    });
});

describe('the graph follows the platform', () => {
    // mp31's lift at column 5 rests at row 26 — which is where the player's own route
    // boards it, at the slot `(5,23)`. There is a second lift in the cavern, at column
    // 169, and the store is told about both or it is only half told.
    const mapId = 6;
    const lift = NAV_PLATFORMS[mapId]!.vertical.find((p) => p.x === 5)!;
    const other = NAV_PLATFORMS[mapId]!.vertical.find((p) => p.x === 169)!;
    const start = { mapId, col: 9, row: 24 };
    const goal = { mapId, col: 28, row: 60 };

    it('starts a cavern with every lift at its startY', () => {
        const store = storeFor(mapId);
        expect(lift.startY).toBe(26);
        expect([...store.platformPlaces(mapId)]).toEqual([]);
        expect([...store.get(mapId)!.platforms.places])
            .toEqual([[5, lift.startY], [169, other.startY]]);
    });

    it('rebuilds when a row changes, and not when it does not', () => {
        const store = storeFor(mapId);
        const before = store.get(mapId)!;
        const resting = new Map([[5, lift.startY], [169, other.startY]]);
        // The first report is news even when it agrees with `startY`: nothing has been
        // said before, so the graph in hand was built on an assumption.
        expect(store.setPlatformPlaces(mapId, resting)).toBe(true);
        expect(store.setPlatformPlaces(mapId, new Map(resting))).toBe(false);
        const still = store.get(mapId)!;
        expect(still, 'nothing moved, so nothing was rebuilt').toBe(store.get(mapId));

        expect(store.setPlatformPlaces(mapId, new Map([[5, lift.topY], [169, other.startY]])))
            .toBe(true);
        const after = store.get(mapId)!;
        expect(after, 'a moved lift is a different world').not.toBe(before);
        expect([...after.platforms.places]).toEqual([[5, lift.topY], [169, other.startY]]);
        // The tiles it used to stand on are open air again, and the ones it stands on
        // now are solid.
        expect(after.platforms.restingCells[26 * after.mapWidth + 6]).toBe(0);
        expect(after.platforms.restingCells[lift.topY * after.mapWidth + 6]).toBe(1);
    });

    it('re-plans the drawn route the moment the lift moves, mid-interval', () => {
        // A lift the hero is riding moves under him every row he climbs, so waiting out
        // a refresh interval would leave the chevrons drawn over the old world. Two rows
        // is enough to show it: the lift is still boardable, and the route is a different
        // one, because he rides two rows less of it.
        const store = storeFor(mapId);
        const caps = allCapabilities();
        const route = findRoute({ store, caps, start, goal });
        expect(route, 'the lift at (5,23) is what gets him up to the row-15 ledge')
            .not.toBeNull();
        const guide = new PathGuide({ store, heroPosition: () => start, capabilities: () => caps });
        guide.setRoute(route!, { ...goal });
        guide.update(1000);
        const planned = guide.remaining().length;

        store.setPlatformPlaces(mapId, new Map([[5, lift.startY - 2], [169, other.startY]]));
        // No interval has elapsed. The lift being somewhere else is reason enough.
        guide.update(1100);
        const replanned = guide.remaining().length;
        expect(replanned, 'the route was drawn against a lift that has since moved')
            .not.toBe(planned);

        const fresh = findRoute({ store, caps, start, goal });
        expect(fresh, 'the journey is still possible, two rows lower for the lift')
            .not.toBeNull();
        expect(replanned).toBe(fresh!.points.length);
    });

    it('keeps drawing the route while the hero rides it', () => {
        // The regression, and the reason the platform version is checked *after* whether
        // a route can be planned at all: a hero on a lift is on the platform, not
        // standing anywhere the search could start from. Re-planning every row of the
        // climb came back empty — no route from a cell that is not a ground node — and
        // the guide drops what it is drawing when a plan comes back empty. The chevrons
        // vanished the moment the lift moved.
        const store = storeFor(mapId);
        const caps = allCapabilities();
        const route = findRoute({ store, caps, start: { mapId, col: 9, row: 24 }, goal });
        expect(route).not.toBeNull();

        let hero = { mapId, col: 5, row: lift.startY - 3 };
        const guide = new PathGuide({ store, heroPosition: () => hero, capabilities: () => caps });
        guide.setRoute(route!, { ...goal });
        let t = 1000;
        guide.update(t);
        expect(guide.isActive).toBe(true);

        // Count how often the guide asks the store for a graph. A rebuild is the
        // largest thing in the frame, and a ride changes the arrangement every row.
        let builds = 0;
        const realGet = store.get.bind(store);
        const counted = new Proxy(store, {
            get: (target, prop, receiver) => {
                if (prop === 'get') return (id: number): ReturnType<typeof realGet> => {
                    builds++;
                    return realGet(id);
                };
                return Reflect.get(target, prop, receiver) as unknown;
            },
        });
        const watched = new PathGuide({
            store: counted, heroPosition: () => hero, capabilities: () => caps,
        });
        watched.setRoute(route!, { ...goal });

        const riding: number[] = [];
        for (let row = lift.startY; row >= lift.startY - 6; row--) {
            store.setPlatformPlaces(mapId, new Map([[5, row], [169, other.startY]]));
            // The engine carries the hero with the platform in the same tick.
            hero = { mapId, col: 5, row: (row - 3 + 64) % 64 };
            t += 16;
            watched.update(t);
            watched.cellsForHop(0);      // what the overlay asks of it every frame
            riding.push(watched.remaining().length);
            expect(watched.isActive, `still drawing at platform row ${row}`).toBe(true);
        }
        // The line shortens by one row at a time as he climbs: the route was drawn for
        // this ride and he is following it, not being re-planned under his feet.
        expect(riding).toEqual([...riding].sort((a, b) => b - a));
        expect(riding[0]! - riding[riding.length - 1]!).toBe(6);
        expect(builds, 'a ride must not rebuild the cavern it is riding')
            .toBe(0);
    });
});
