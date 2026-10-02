// @vitest-environment happy-dom
/**
 * The reported trip, with the game-sized amount of map data in memory.
 *
 * The game only downloads the cavern the hero is standing in. Every other graph in
 * the reachable set arrives on demand, and `findRoute` skips any door whose
 * destination graph is missing — so a route that has to leave the cavern was
 * reported as "no route found" while the map that would have carried it sat
 * unloaded. This asserts the screen now fetches what the route needs.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NavGraphStore, type NavRoute } from '../src/engine/nav/pathfinder.js';
import { ADDR_ACCESSORY, snapshotCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { MapScreen } from '../src/ui/map-screen.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { getGmem, memWrite8 } from '../src/core/ts-memory.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The game's situation: the current cavern in memory, the rest fetchable. */
function gameLikeStore(current: number, fetched: number[]): NavGraphStore {
    const cache = new Map<number, Uint8Array>();
    const bytes = (mapId: number): Uint8Array => {
        let b = cache.get(mapId);
        if (!b) {
            b = new Uint8Array(readFileSync(resolve(REPO, `web/public/${NAV_MAP_BY_ID.get(mapId)!.mdtPath}`)));
            cache.set(mapId, b);
        }
        return b;
    };
    return new NavGraphStore(
        (mapId) => (mapId === current ? bytes(mapId) : null),
        async (mapId) => { fetched.push(mapId); return bytes(mapId); },
    );
}

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {}, drawImage() {},
    fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, roundRect() {}, rect() {}, clip() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
} as unknown as CanvasRenderingContext2D;

describe('mp30 (185,19) -> (162,55) with only the current cavern in memory', () => {
    it('fetches the caverns the route needs and returns it', async () => {
        const fetched: number[] = [];
        const store = gameLikeStore(5, fetched);
        memWrite8(getGmem(), ADDR_ACCESSORY, 0);
        const caps = snapshotCapabilities(getGmem());
        const hero = { mapId: 5, col: 185, row: 19 };

        const picked: NavRoute[] = [];
        const screen = new MapScreen({
            canvas: { width: 672, height: 432 } as HTMLCanvasElement,
            ctx: CTX, store,
            heroPosition: () => hero,
            capabilities: () => caps,
            text: (k) => k,
            onExit: () => {},
            onPick: (r) => { picked.push(r); },
        });
        screen.enter({ heroMapId: 5, heroCol: 185, heroRow: 19 });
        screen.cursorCol = 162; screen.cursorRow = 55;
        await screen.choose(162, 55);

        expect(picked, 'the player walks this with no shoes at all').toHaveLength(1);
        const route = picked[0]!;
        console.log('route', route.points.length, 'pts, maps', JSON.stringify(route.maps),
            'equipment', route.equipment.length, 'fetched', JSON.stringify(fetched));
        expect(route.equipment, 'no shoes').toEqual([]);
        expect(route.points[0]).toMatchObject({ mapId: 5, col: 185, row: 19 });
        expect(route.points[route.points.length - 1]).toMatchObject({ mapId: 5, col: 161, row: 54 });
        // mp30 has no internal path, so it leaves for mp31, rides the lift at column 5
        // back up, and returns.
        expect(route.maps).toEqual([5, 6, 5, 6, 5]);

        // And the guide keeps it.
        const guide = new PathGuide({ store, heroPosition: () => hero, capabilities: () => caps });
        const last = route.points[route.points.length - 1]!;
        guide.setRoute(route, { mapId: last.mapId, col: last.col, row: last.row });
        for (const t of [1000, 2000, 3000]) guide.update(t);
        expect(guide.isActive).toBe(true);
        expect(guide.remaining().length).toBeGreaterThan(1);
    });

    it('the destination snaps, and the route leaves and re-enters mp30', async () => {
        const store = gameLikeStore(5, []);
        memWrite8(getGmem(), ADDR_ACCESSORY, 0);
        const caps = snapshotCapabilities(getGmem());
        const screen = new MapScreen({
            canvas: { width: 672, height: 432 } as HTMLCanvasElement,
            ctx: CTX, store,
            heroPosition: () => ({ mapId: 5, col: 185, row: 19 }),
            capabilities: () => caps,
            text: (k) => k,
            onExit: () => {},
            onPick: () => {},
        });
        screen.enter({ heroMapId: 5, heroCol: 185, heroRow: 19 });
        // (162,55) is not a standing position; the screen projects it onto one.
        const node = screen.snapToNode(162, 55);
        expect(node).toBeGreaterThanOrEqual(0);
        const g = store.get(5)!;
        expect([g.nodes[node]!.col, g.nodes[node]!.row]).toEqual([161, 54]);
    });
});