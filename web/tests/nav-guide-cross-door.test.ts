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
import { isLoadedCavern } from '../src/engine/dungeon-items.js';
import { memWrite8 } from '../src/core/ts-memory.js';
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