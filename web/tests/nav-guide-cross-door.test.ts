/**
 * nav-guide-cross-door.test.ts — the thread survives a door.
 *
 * A route across the component is longer than one cavern, and the guide re-plans it
 * from whichever cavern the hero is standing in. Anything the re-plan is told about
 * the world has to be true of *that* cavern, or the second cavern of the journey is
 * where the chevrons stop.
 *
 * The trap is that the engine only knows the cavern it has loaded: `presentKeys` and
 * `presentShoes` walk that cavern's entity list and nothing else. A caller that holds
 * such a list and answers from it *without looking at the map it was asked about* says
 * something true of the wrong cavern — and here that was the difference between a route
 * that survives a door and one that dies at the first one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NavGraphStore, findRoute } from '../src/engine/nav/pathfinder.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import {
    isLoadedCavern, keyIsPresent, markCollected, presentKeys, presentShoes, shoeIsPresent,
} from '../src/engine/dungeon-items.js';
import { memWrite8, memWrite16 } from '../src/core/ts-memory.js';
import { ADDR_PLACE_MAP_ID } from '../src/core/memory.js';
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

const START = { mapId: 0, col: 61, row: 7 };
const GOAL = { mapId: 0, col: 128, row: 33 };

describe('isLoadedCavern', () => {
    it('is true only for the cavern in memory', () => {
        const g = new Uint8Array(0x10000);
        memWrite8(g, ADDR_PLACE_MAP_ID, 0x83);      // bit 7 set, as the game sets it
        expect(isLoadedCavern(g, 3), '0x83 & 0x7f is 3').toBe(true);
        expect(isLoadedCavern(g, 0)).toBe(false);
        expect(isLoadedCavern(g, 16)).toBe(false);
    });
});

describe('the floor is read when it is asked about, not when it was written down', () => {
    // A cavern's entity list, 16 bytes a record, terminated by `x === 0xffff`.
    const LIST = 0xd000;
    const MONSTERS_LIST = 0xc010;
    const CAVERN_LEVEL = 0xc012;
    const KEY_HANDLER = 0x16;
    const SHOE_HANDLER = 0x1a;

    function cavern(records: { col: number; row: number; handler: number }[]): Uint8Array {
        const g = new Uint8Array(0x10000);
        memWrite16(g, MONSTERS_LIST, LIST);
        records.forEach((r, i) => {
            const m = LIST + i * 16;
            memWrite16(g, m, r.col);
            memWrite8(g, m + 2, r.row);
            memWrite8(g, m + 4, r.handler);
        });
        memWrite16(g, LIST + records.length * 16, 0xffff);
        return g;
    }

    const withKey = () => cavern([
        { col: 89, row: 44, handler: KEY_HANDLER },
        { col: 149, row: 44, handler: KEY_HANDLER },
    ]);
    const withShoe = () => {
        const g = cavern([{ col: 208, row: 27, handler: SHOE_HANDLER }]);
        memWrite8(g, CAVERN_LEVEL, 5);   // level 5's pair is Pirika
        return g;
    };

    it('finds what is lying there', () => {
        const g = withKey();
        expect(keyIsPresent(g, 89, 44, 0)).toBe(true);
        expect(keyIsPresent(g, 149, 44, 0)).toBe(true);
        expect(keyIsPresent(g, 89, 44, 1), 'and nothing that is not').toBe(false);
        expect(keyIsPresent(g, 90, 44, 0)).toBe(false);
        expect(presentKeys(g)).toEqual(new Set(['89,44,0', '149,44,0']));
    });

    it('stops saying a key is there the moment he picks it up', () => {
        // The player's mp20 thread: he walks to the key at `(89,44)` to open the door
        // at `(95,36)`, and the frame after he steps on it the guide re-plans. Read
        // from a snapshot taken when he walked into the cavern, that key is still on
        // the floor for the rest of the session — and the re-plan goes back for it.
        const g = withKey();
        markCollected(g, LIST);
        expect(keyIsPresent(g, 89, 44, 0), 'the key he is carrying').toBe(false);
        expect(presentKeys(g), 'and the whole-cavern answer agrees').toEqual(new Set(['149,44,0']));
        expect(keyIsPresent(g, 149, 44, 0), 'while the one he has not taken still is')
            .toBe(true);
    });

    it('says the same for a pair of shoes', () => {
        const g = withShoe();
        expect(shoeIsPresent(g, 208, 27, 2)).toBe(true);
        expect(shoeIsPresent(g, 208, 27, 1)).toBe(false);
        markCollected(g, LIST);
        expect(shoeIsPresent(g, 208, 27, 2), 'the pair he put on').toBe(false);
        expect(presentShoes(g).size).toBe(0);
    });

    it('ends at the end of the list rather than at a collected record', () => {
        // `mark_collected` writes `0xff00`, and the terminator is `0xffff`; a walk
        // that only knows the second one runs on into the rest of the list.
        const g = cavern([
            { col: 89, row: 44, handler: KEY_HANDLER },
            { col: 149, row: 44, handler: KEY_HANDLER },
            { col: 7, row: 30, handler: KEY_HANDLER },
        ]);
        markCollected(g, LIST);
        expect(presentKeys(g), 'the two behind the collected one are still found')
            .toEqual(new Set(['149,44,0', '7,30,0']));
    });
});

describe('the thread crosses a door', () => {
    /** A `keyPresent` built the honest way: it only knows the loaded cavern. */
    function keyPresentForLoadedCavern(loadedMapId: number, onItsFloor: ReadonlySet<string>) {
        return (mapId: number, col: number, row: number, kind: number): boolean =>
            mapId !== loadedMapId || onItsFloor.has(`${col},${row},${kind}`);
    }

    it('mp10(61,7) to mp10(128,33) goes through mp21 and mp1d', () => {
        const store = realStore();
        const route = findRoute({
            store, caps: bareCapabilities(), collectKeys: true, start: START, goal: GOAL,
        })!;
        expect(route.maps, 'it crosses into other caverns and back').toEqual([0, 3, 0, 1, 0]);
    });

    it('and keeps drawing once the hero is on the far side of the first door', () => {
        const store = realStore();
        const caps = bareCapabilities();
        const route = findRoute({
            store, caps, collectKeys: true, start: START, goal: GOAL,
        })!;
        // The landing after the first door: mp21, where the thread must carry on.
        const crossed = route.points.findIndex((p) => p.mapId !== START.mapId);
        expect(crossed, 'there is a first foreign point').toBeGreaterThan(0);
        const there = route.points[crossed]!;
        expect(there.mapId).toBe(3);

        // The hero is now in mp21, which holds no keys, so its list is empty. The key
        // the route fetches is in mp10 — which is no longer the loaded cavern, and so
        // is not known to be empty.
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ mapId: there.mapId, col: there.col, row: there.row }),
            capabilities: () => caps,
        });
        guide.setRoute(route, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row }, {
            collectKeys: true,
            keyPresent: keyPresentForLoadedCavern(there.mapId, new Set()),
        });
        guide.update(1_000_000);
        expect(guide.hasRoute, 'the re-plan from the far side kept the route').toBe(true);
        expect(guide.isActive, 'and the chevrons keep drawing').toBe(true);
    });

    it('but answering about the wrong cavern keeps the old route', () => {
        // The shape of the bug, kept as the other half of the pair: a callback that
        // ignores the map it was asked about reports mp10's key as collected, and the
        // re-plan from mp21 finds nothing. New behavior: keeps the old route.
        const store = realStore();
        const caps = bareCapabilities();
        const route = findRoute({
            store, caps, collectKeys: true, start: START, goal: GOAL,
        })!;
        const there = route.points.find((p) => p.mapId !== START.mapId)!;

        const guide = new PathGuide({
            store,
            heroPosition: () => ({ mapId: there.mapId, col: there.col, row: there.row }),
            capabilities: () => caps,
        });
        guide.setRoute(route, { mapId: GOAL.mapId, col: GOAL.col, row: GOAL.row }, {
            collectKeys: true,
            // Answers from mp21's (empty) floor whatever map it is asked about.
            keyPresent: (_mapId, col, row, kind) => new Set<string>().has(`${col},${row},${kind}`),
        });
        guide.update(1_000_000);
        // New behavior: keeps the old route on replan failure
        expect(guide.hasRoute, 'replan failed but keeps old route').toBe(true);
    });
});