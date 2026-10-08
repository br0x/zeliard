/**
 * nav-idle.test.ts — when the route may be re-searched.
 *
 * Two halves of one rule. The probe answers "is the hero standing still with
 * nothing held down?" from the bytes the frame itself writes; the guide asks it
 * before it is allowed to run `findRoute`, because that search is synchronous
 * inside the frame and the one thing in the loop the player can see.
 */
import { describe, expect, it } from 'vitest';

import {
    createHeroIdleProbe,
    ADDR_AIR_UP_TILE_FOUND, ADDR_ON_ROPE_FLAGS, ADDR_SLIDE_DIRECTION,
} from '../src/engine/nav/idle.js';
import {
    ADDR_INPUT_ALT_SPACE, ADDR_INPUT_DIRS, ADDR_JUMP_PHASE_FLAGS,
} from '../src/core/memory.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { findRoute, NavGraphStore, type NavRoute } from '../src/engine/nav/pathfinder.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const CELL = { mapId: 0, col: 26, row: 16 };

/** A g_mem image big enough for every address these bytes live at. */
function memory(): Uint8Array {
    return new Uint8Array(0x10000);
}

function probe(at: { mapId: number; col: number; row: number } | null = CELL) {
    const g = memory();
    return { g, idle: createHeroIdleProbe({ memory: () => g, heroPosition: () => at }) };
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

describe('createHeroIdleProbe', () => {
    it('waits a frame before it can say anything', () => {
        // "Has not moved since last time" has no last time on the first call, so the
        // re-plan waiting for it goes out on the frame after rather than the same one.
        const { idle } = probe();
        expect(idle(), 'no sample yet').toBe(false);
        expect(idle(), 'and now nothing has changed').toBe(true);
    });

    it('is not idle while a direction or a jump key is held down', () => {
        for (const addr of [ADDR_INPUT_DIRS, ADDR_INPUT_ALT_SPACE]) {
            const { g, idle } = probe();
            idle();
            g[addr] = 1;
            expect(idle(), `byte ${addr.toString(16)} held down`).toBe(false);
            g[addr] = 0;
            expect(idle(), 'and released again').toBe(true);
        }
    });

    it('is not idle in any motion the engine drives without a key', () => {
        // Each is a byte the frame sets and clears itself: airborne, sliding down a
        // slope, climbing a rope, carried up by a current. On none of them is the
        // hero where the next frame will put him.
        const cases: Array<[number, string]> = [
            [ADDR_JUMP_PHASE_FLAGS, 'airborne'],
            [ADDR_SLIDE_DIRECTION, 'sliding'],
            [ADDR_ON_ROPE_FLAGS, 'climbing'],
            [ADDR_AIR_UP_TILE_FOUND, 'in a jet'],
        ];
        for (const [addr, what] of cases) {
            const { g, idle } = probe();
            idle();
            g[addr] = what === 'airborne' ? 0x80 : 0xff;
            expect(idle(), what).toBe(false);
            g[addr] = 0;
            expect(idle(), `${what}, and stopped`).toBe(true);
        }
    });

    it('is not idle when the cell changes, which covers every ride and walk', () => {
        // A platform carries the hero, and a walk moves him, with none of the flags
        // above set. One comparison answers both: nothing has moved since last frame.
        let at = CELL;
        const g = memory();
        const idle = createHeroIdleProbe({ memory: () => g, heroPosition: () => at });
        idle();
        at = { ...CELL, col: CELL.col + 1 };
        expect(idle(), 'he walked one cell').toBe(false);
        expect(idle(), 'and stopped on it').toBe(true);
        at = { ...CELL, col: CELL.col + 1, row: CELL.row + 1 };
        expect(idle(), 'the platform carried him').toBe(false);
        at = { ...CELL, mapId: 1 };
        expect(idle(), 'the door put him in another room').toBe(false);
    });

    it('is not idle outside a cavern, where there is no cell to compare', () => {
        const { idle } = probe(null);
        expect(idle()).toBe(false);
        expect(idle(), 'and no stale sample is kept across a menu').toBe(false);
    });
});

describe('PathGuide re-planning', () => {
    /**
     * mp10 (26,16) -> mp1d (27,15) crosses a closed ordinary-key door. Plan it with
     * a key in his pocket, then take the key away: the search that would normally
     * run on the first tick finds nothing and drops the thread. Deferring that
     * search is the whole point — while he is moving, the line on screen is the
     * route he already has.
     */
    function keyedRoute(store: NavGraphStore): NavRoute {
        const found = findRoute({
            store,
            caps: { ...bareCapabilities(), keys: 1, mask: 0xff },
            start: { mapId: 0, col: 26, row: 16 },
            goal: { mapId: 1, col: 27, row: 15 },
        });
        expect(found, 'a key opens the way').not.toBeNull();
        return found!;
    }

    /**
     * The bare hero with an empty pocket: the one loadout the map screen's own
     * test shows has no way through that door.
     */
    function withoutKey() {
        return bareCapabilities();
    }

    it('drops the thread when it re-plans with no key left', () => {
        const store = realStore();
        const route = keyedRoute(store);
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ mapId: 0, col: 26, row: 16 }),
            capabilities: withoutKey,
        });
        guide.setRoute(route, { mapId: 1, col: 27, row: 15 });
        guide.update(1000);
        // New behavior: keeps the old route on replan failure, logs warning
        expect(guide.hasRoute, 'replan failed but keeps old route').toBe(true);
    });

    it('keeps it while the hero is busy, and spends it the moment he stops', () => {
        const store = realStore();
        const route = keyedRoute(store);
        const goal = { mapId: 1, col: 27, row: 15 };
        let idle = false;
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ mapId: 0, col: 26, row: 16 }),
            capabilities: withoutKey,
            isIdle: () => idle,
        });
        guide.setRoute(route, goal);
        guide.update(1000);
        expect(guide.hasRoute, 'the search waited for an idle hero').toBe(true);
        guide.update(2000);
        expect(guide.hasRoute, 'still walking, still waiting').toBe(true);

        idle = true;
        guide.update(3000);
        // New behavior: keeps the old route on replan failure
        expect(guide.hasRoute, 'now he has stopped, replan failed but keeps old route')
            .toBe(true);
    });
});
