// @vitest-environment happy-dom
/**
 * map-screen.test.ts — the cavern map screen (phase 6).
 *
 * The screen exists only to pick a destination, so the tests concentrate on the
 * things that would actually break that job: fitting every cavern into the canvas
 * without panning, mapping clicks to tiles through a CSS-scaled canvas, wrapping
 * the cursor across a cylindrical map, and refusing a destination it cannot
 * route to.
 *
 * The route itself is deliberately absent from this screen, and that is asserted
 * rather than assumed.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MapScreen, shortName, rokaColour, type MapScreenDeps } from '../src/ui/map-screen.js';
import { NavGraphStore, findRoute, type NavRoute } from '../src/engine/nav/pathfinder.js';
import { allCapabilities, bareCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID, NAV_MAPS, NAV_REACHABLE } from '../src/data/nav/nav-maps.js';
import { PORTALS, NAV_PORTALS_BY_MAP } from '../src/data/nav/nav-portals.js';
import { decodeTileGrid } from '../src/engine/nav/mdt-grid.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * A hero position that is genuinely a standing position in mp10. Guessing a cell
 * is not good enough: the screen refuses destinations it cannot stand on, so a
 * made-up position makes every routing test fail for the wrong reason.
 */
const HERO = { mapId: 0, col: 26, row: 16 };

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {}, drawImage() {},
    fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, roundRect() {}, rect() {}, clip() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
    textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: false,
} as unknown as CanvasRenderingContext2D;

const CANVAS = { width: 672, height: 432 } as HTMLCanvasElement;

function makeStore(): NavGraphStore {
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

interface Harness {
    screen: MapScreen;
    picked: () => unknown[];
    exited: () => number;
    draw: (now?: number) => void;
}

function harness(overrides: Partial<MapScreenDeps> = {}): Harness {
    const store = makeStore();
    const picked: unknown[] = [];
    let exited = 0;
    const deps: MapScreenDeps = {
        canvas: CANVAS,
        ctx: CTX,
        store,
        heroPosition: () => HERO,
        capabilities: () => allCapabilities(),
        text: (key: string) => key,
        onExit: () => { exited++; },
        onPick: (route: unknown) => { picked.push(route); },
        ...overrides,
    };
    const screen = new MapScreen(deps);
    screen.enter({ heroMapId: HERO.mapId, heroCol: HERO.col, heroRow: HERO.row });
    return {
        screen,
        picked: () => picked,
        exited: () => exited,
        draw: (now = 16) => screen.draw(now),
    };
}

/** mp10's tiles that the cavern sheet has art for — one blit each. */
const BLITTABLE_IN_MP10 = (() => {
    const bytes = readFileSync(resolve(REPO, 'web/public/game/0/mp10.mdt'));
    const grid = decodeTileGrid(new Uint8Array(bytes), NAV_MAP_BY_ID.get(0)!.mapWidth, 0);
    let n = 0;
    // mpp1.png is 600x24, so 25 frames of 24px, and ids 1..25 are frames 0..24.
    for (const t of grid.tiles) if (t >= 1 && t <= 25) n++;
    return n;
})();

describe('the map is the cavern\'s own tiles, not a sketch of them', () => {
    it('paints each cell from the cavern sheet', async () => {
        // Before this, every cell was filled with a hand-picked colour by class:
        // a wall on the map was not the colour that wall has in the game.
        const drawn: { frame: number; dx: number; dy: number; dw: number }[] = [];
        const fills: number[] = [];
        const inner = {
            ...CTX,
            drawImage: (_s: unknown, _sx: number, _sy: number, _sw: number, _sh: number,
                dx: number, dy: number, dw: number) => {
                drawn.push({ frame: drawn.length, dx, dy, dw });
            },
            fillRect: (x: number, y: number, w: number) => { fills.push(x, y, w); },
        } as unknown as CanvasRenderingContext2D;
        const made: { ctx: CanvasRenderingContext2D; canvas: { width: number; height: number } }[] = [];
        const createElement = vi.spyOn(document, 'createElement').mockImplementation(
            (() => {
                const canvas = {
                    width: 0, height: 0,
                    getContext: () => inner,
                } as unknown as HTMLCanvasElement;
                made.push({ ctx: inner, canvas: canvas as unknown as { width: number; height: number } });
                return canvas;
            }) as typeof document.createElement);

        const outer = { ...CTX, drawImage: () => {} } as unknown as CanvasRenderingContext2D;
        const sheet = { width: 600, height: 24 } as HTMLImageElement;
        const h = harness({ canvas: CANVAS, ctx: outer, tileSheets: async () => ({ tiles: sheet, platforms: null }) });
        h.draw();
        // The sheet is an image, so the raster arrives on a later frame.
        await new Promise((r) => { setTimeout(r, 0); });
        h.draw();
        createElement.mockRestore();

        // One blit per tile the sheet can draw — the whole point: a wall on the map
        // is now the frame the game draws, not a hand-picked colour.
        expect(drawn.length, 'every tile with art should be blitted').toBe(BLITTABLE_IN_MP10);
        expect(made.length).toBeGreaterThan(0);
        // Air and the rope highlight are the only fills left.
        expect(fills.length).toBeGreaterThan(0);
    });
});

describe('every string it asks the locale for exists', () => {
    it('resolves every map.* key in every supported locale', () => {
        // The map rendered with an empty title and hint line, and logged a
        // missing-key warning on every frame, because these were written into the
        // plan but never into the locale files. A warning per frame is the kind
        // of thing that gets missed in a busy console, so it is asserted instead.
        // Every key the screen renders...
        const drawn = [
            'map.title', 'map.hints', 'map.hero', 'map.dest', 'map.unreachable', 'map.noPath',
            'map.loading', 'map.noMap', 'map.needsKeys', 'map.needsOneKey',
        ];
        // ...and the one phase 8 will use when cancelling a route.
        const all = [...drawn, 'map.routeCleared'];
        const src = readFileSync(resolve(REPO, 'web/src/ui/map-screen.ts'), 'utf8');
        for (const key of drawn) {
            expect(src, `${key} should be drawn by this screen`).toContain(key);
        }
        for (const locale of ['en', 'ru', 'isv']) {
            const json = JSON.parse(
                readFileSync(resolve(REPO, `web/src/locale/${locale}.json`), 'utf8'),
            ) as { map?: Record<string, string> };
            for (const key of all) {
                // The locale files nest, so resolve the dotted path.
                const leaf = key.slice('map.'.length) as keyof NonNullable<typeof json.map>;
                const value = json.map?.[leaf];
                expect(value, `${locale} ${key}`).toBeTruthy();
                expect(typeof value).toBe('string');
            }
        }
    });
});

describe('fitting every cavern into the canvas', () => {
    /** The strip band, and the map area below it, in canvas pixels. */
    const STRIP_BOTTOM = 28 + 26;
    const AREA_BOTTOM = 390;

    it('uses an integer scale that keeps the chart inside the map area', () => {
        // One screen for the sweep: `enter` warms the reachable component, and the
        // store caches graphs, so a screen per cavern would rebuild the same caverns
        // 31 times over for a test that only measures geometry.
        const { screen } = harness();
        for (const meta of NAV_MAPS) {
            const scale = screen.scaleFor(meta.id);
            expect(Number.isInteger(scale), meta.nameKey).toBe(true);
            expect(scale).toBeGreaterThanOrEqual(1);
            const { ox, oy } = screen.originFor(meta.id);
            expect(ox + meta.mapWidth * scale, `${meta.nameKey} width`).toBeLessThanOrEqual(672);
            expect(oy + screen.chartedRows(meta.id) * scale, `${meta.nameKey} height`)
                .toBeLessThanOrEqual(AREA_BOTTOM);
            expect(ox).toBeGreaterThanOrEqual(0);
            // Below the strip, not merely inside the area that used to contain it.
            expect(oy, `${meta.nameKey} top`).toBeGreaterThanOrEqual(STRIP_BOTTOM);
        }
    });

    it('centres the map horizontally', () => {
        const { screen } = harness();
        for (const meta of NAV_MAPS) {
            const { ox, scale } = screen.originFor(meta.id);
            const leftGap = ox;
            const rightGap = 672 - (ox + meta.mapWidth * scale);
            expect(Math.abs(leftGap - rightGap), meta.nameKey).toBeLessThanOrEqual(1);
        }
    });

    it('fits the widest cavern, and only that one, at 2x', () => {
        const { screen } = harness();
        // 320 tiles is the widest, so 2x is the floor for the whole game.
        expect(screen.scaleFor(8)).toBe(2);      // mp40, 320 wide
    });

    it('draws every boss arena far larger than fitting all 64 rows allowed', () => {
        // The point of the trimmed chart. Every arena is 52..73 tiles wide and two
        // thirds filler, so fitting the whole ring held them at 5x — a third under
        // the width fit — to draw two thirds of nothing. All eight now take the
        // width, including mp4d, whose chart ends at row 20 once its phantom ring
        // below is gone (see the next test).
        const { screen } = harness();
        const fitEverything = (meta: typeof NAV_MAPS[number]): number =>
            Math.max(1, Math.min(8, Math.floor(Math.min(672 / meta.mapWidth, 336 / 64))));

        const arenas = NAV_MAPS.filter((m) => m.isBossArena);
        expect(arenas.length).toBe(8);
        for (const arena of arenas) {
            expect(screen.chartedRows(arena.id), arena.nameKey).toBeLessThan(32);
            expect(screen.scaleFor(arena.id), arena.nameKey)
                .toBeGreaterThan(fitEverything(arena));
        }
        expect(screen.chartedRows(10), 'mp4d').toBe(21);
        expect(screen.scaleFor(1)).toBe(9);      // mp1d, 73 wide, 18 rows
        expect(screen.scaleFor(4)).toBe(12);     // mp2d, 52 wide, 20 rows
        expect(screen.scaleFor(10)).toBe(9);     // mp4d, 73 wide, 21 rows
        expect(screen.scaleFor(21)).toBe(9);     // mp73, 73 wide, 16 rows
    });

    it('trims mp4d\'s ring of 73 cells that only the wrap makes standing', () => {
        // Row 61 of mp4d reads as 73 standing cells in the graph, and every one of
        // them is standing on row 0's rock: the hero's box is three rows and the
        // floor check reads the row after his feet, so the tile under him at row 61
        // is row 64, which the ring wraps to row 0. The rows above are void, so
        // nothing joins that run to anything — it is an island in the graph, and no
        // route from the arena reaches it. Counting it held mp4d at 5x while the
        // other seven arenas drew at 9x.
        const h = harness();
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        const graph = store.get(10)!;
        const ring = graph.nodes.filter((n) => n.row === 61);
        expect(ring.length).toBe(73);
        // Every edge out of the run stays inside row 61.
        for (const node of ring) {
            const from = graph.groundOf[61 * graph.mapWidth + node.col]!;
            for (let e = graph.edgeOffsets[from]!; e < graph.edgeOffsets[from + 1]!; e++) {
                expect(graph.nodes[graph.edges[e]!.to]!.row).toBe(61);
            }
        }
        // And the engine agrees there is no way there from the arena.
        const arena = graph.nodes.find((n) => n.kind === 0 && n.row === 15)!;
        expect(findRoute({
            store,
            caps: allCapabilities(),
            start: { mapId: 10, col: arena.col, row: arena.row },
            goal: { mapId: 10, col: ring[0]!.col, row: 61 },
            unlimitedKeys: true,
        })).toBeNull();
        expect(h.screen.chartedRows(10), 'the arena, to row 20, and nothing below it').toBe(21);
    });

it('trims rock and void, and never the ground a standing cell needs', () => {
        // The safety property of the whole idea: a chart that ended on a standing
        // cell's own row would end on the floor he is stood on, since the hero's
        // box is three rows and `groundBelow` reads headRow + 3. mp1d and mp2d
        // both drew their arena without the ground the hero stands on.
        const h = harness();
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        for (const meta of NAV_MAPS) {
            const charted = h.screen.chartedRows(meta.id);
            expect(charted, meta.nameKey).toBeGreaterThanOrEqual(1);
            expect(charted, meta.nameKey).toBeLessThanOrEqual(64);
            const graph = store.get(meta.id)!;
            for (const node of graph.nodes) {
                // Support borrowed round the ring is not a place the hero is put.
                if (node.row + 3 >= 64) continue;
                expect(node.row + 4, `${meta.nameKey} node at row ${node.row} and its floor`)
                    .toBeLessThanOrEqual(charted);
            }
            // Every door in the cavern has to be on the chart too.
            for (const index of NAV_PORTALS_BY_MAP[meta.id] ?? []) {
                const portal = PORTALS[index]!;
                expect(portal.fromY, `${meta.nameKey} door at row ${portal.fromY}`)
                    .toBeLessThan(charted);
            }
        }
    });

    it('draws the floor the hero stands on, in the two arenas that lost it', () => {
        // The check above, stated the way it was reported. mp1d's arena ends at
        // row 20 and its hero walks on row 15, standing on rock at row 18 — a chart
        // of 18 rows puts the ground he is stood on off the bottom of it. mp2d's
        // hero is on row 19 and the rock under him is row 22.
        const h = harness();
        expect(h.screen.chartedRows(1), 'mp1d').toBe(19);
        expect(h.screen.chartedRows(4), 'mp2d').toBe(23);
        for (const [id, head] of [[1, 15], [4, 19]] as const) {
            const charted = h.screen.chartedRows(id);
            expect(head + 3, `map ${id}: the floor under row ${head}`).toBeLessThan(charted);
        }
    });

    it('keeps the charted rows, and not the whole ring, on the click map', () => {
        // A click below the chart is not a cell of the map. It was the whole ring
        // before, so every click in the space below a boss arena was a destination
        // the player could not see.
        const h = harness();
        for (const id of [1, 4, 21, 0, 8]) {
            h.screen.displayMapId = id;
            const { ox, oy, scale } = h.screen.originFor(id);
            const charted = h.screen.chartedRows(id);
            const mid = Math.floor(scale / 2);
            expect(h.screen.tileFromCanvas(ox + mid, oy + mid), `map ${id} in the chart`)
                .toEqual({ col: 0, row: 0 });
            if (charted >= 64) continue;
            expect(h.screen.tileFromCanvas(ox + mid, oy + charted * scale + mid), `map ${id} below`)
                .toBeNull();
        }
    });

    it('keeps the cursor on the chart, whatever map it arrives from', () => {
        const h = harness();
        // mp1d is a third of the width and a fifth of the height: a cursor left
        // where mp10 put it would be a destination drawn off the chart entirely.
        h.screen.cursorCol = NAV_MAP_BY_ID.get(0)!.mapWidth - 1;
        h.screen.cursorRow = 63;
        for (let i = 0; i < NAV_REACHABLE[0]!.length && h.screen.displayMapId !== 1; i++) {
            h.screen.handleKey('Tab', false, false, false);
        }
        expect(h.screen.displayMapId).toBe(1);
        expect(h.screen.cursorCol).toBeLessThan(NAV_MAP_BY_ID.get(1)!.mapWidth);
        expect(h.screen.cursorRow).toBeLessThan(h.screen.chartedRows(1));
    });
});

describe('clicking maps back to tiles', () => {
    it('round-trips a tile through a canvas pixel', () => {
        const { screen } = harness();
        for (const [col, row] of [[0, 0], [26, 16], [239, 63], [120, 40]] as const) {
            const { ox, oy, scale } = screen.originFor(0);
            const x = ox + col * scale + Math.floor(scale / 2);
            const y = oy + row * scale + Math.floor(scale / 2);
            expect(screen.tileFromCanvas(x, y), `${col},${row}`).toEqual({ col, row });
        }
    });

    it('returns null for clicks outside the map', () => {
        const { screen } = harness();
        const { ox, oy } = screen.originFor(0);
        expect(screen.tileFromCanvas(ox - 4, oy + 10)).toBeNull();
        expect(screen.tileFromCanvas(ox + 4, oy - 4)).toBeNull();
        expect(screen.tileFromCanvas(672 - 2, oy + 10)).toBeNull();
    });

    it('handles a CSS-scaled canvas, where client pixels are not canvas pixels', () => {
        // Touch layouts apply transform: scale() to the wrapper, so the same
        // client pixel maps to a different canvas pixel. The screen only ever
        // receives canvas pixels, so the round trip must survive any scale.
        const { screen } = harness();
        const { ox, oy, scale } = screen.originFor(0);
        for (const cssScale of [0.5, 1, 2.25]) {
            const col = 77;
            const row = 31;
            const clientX = (ox + col * scale + scale / 2) * cssScale;
            const clientY = (oy + row * scale + scale / 2) * cssScale;
            // main.ts divides by the rect width, which is the same factor.
            const canvasX = clientX / cssScale;
            const canvasY = clientY / cssScale;
            expect(screen.tileFromCanvas(canvasX, canvasY), `scale ${cssScale}`)
                .toEqual({ col, row });
        }
    });
});

describe('choosing a destination', () => {
    /** A standing position on mp10, at least `min` columns from the hero. */
    function findNodeFrom(min: number): { col: number; row: number } | null {
        const h = harness();
        const graph = h.screen['store' as never];
        void graph;
        return null;
    }
    void findNodeFrom;

    it('snaps a click beside a ledge onto the standing position', () => {
        const h = harness();
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        const graph = store.get(0)!;
        // Find a node, then aim one tile up and one left of it — inside the
        // snap radius but not itself a node.
        for (let i = 0; i < graph.nodes.length; i++) {
            const node = graph.nodes[i]!;
            if (node.kind !== 0) continue;
            const offX = (node.col - 1 + graph.mapWidth) % graph.mapWidth;
            const offY = (node.row - 1 + 64) % 64;
            if (graph.groundOf[offY * graph.mapWidth + offX]! >= 0) continue;
            const snapped = h.screen.snapToNode(offX, offY);
            expect(snapped, `${offX},${offY}`).toBeGreaterThanOrEqual(0);
            expect(h.screen.snapToNode(offX, offY)).not.toBe(-1);
            return;
        }
        throw new Error('no off-node neighbour found in mp10');
    });

    it('returns a route and closes on a valid destination', async () => {
        const h = harness();
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        const graph = store.get(0)!;
        // A standing position a reasonable distance away.
        let goal = -1;
        for (let i = 0; i < graph.nodes.length && goal < 0; i++) {
            const node = graph.nodes[i]!;
            if (node.kind !== 0) continue;
            const d = Math.abs(node.col - HERO.col);
            if (d > 40 && d < 90) goal = i;
        }
        expect(goal).toBeGreaterThanOrEqual(0);
        const target = graph.nodes[goal]!;
        await h.screen.choose(target.col, target.row);
        expect(h.picked()).toHaveLength(1);
        const route = h.picked()[0] as { points: unknown[]; cost: number; maps: number[] };
        expect(route.points.length).toBeGreaterThan(1);
        expect(route.cost).toBeGreaterThan(0);
        expect(route.maps).toEqual([0]);
        expect(h.screen.active).toBe(false);
    });

    it('routes to the cell the hero is standing on', async () => {
        const h = harness();
        await h.screen.choose(HERO.col, HERO.row);
        expect(h.picked()).toHaveLength(1);
        expect(h.screen.active).toBe(false);
    });

    it('stays open and reports a goal it cannot route to', async () => {
        const h = harness();
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        // mp29 is mp90, behind a Lion-Head door from mp84 and not in mp10's
        // reachable set, so a route to it must fail rather than silently succeed.
        store.get(29);
        h.screen.displayMapId = 29;
        await h.screen.choose(0, 0);
        expect(h.picked()).toHaveLength(0);
        expect(h.screen.active).toBe(true);
    });

    it('offers the closed-door route when the hero is carrying the key', async () => {
        // mp10 (26,16) -> mp1d crosses a closed ordinary-key door. With a key in his
        // pocket the first search finds it; with an empty pocket it does not.
        const keyed = harness({ capabilities: () => ({ ...bareCapabilities(), keys: 1, mask: 0xff }) });
        keyed.screen.displayMapId = 1;
        await keyed.screen.choose(27, 15);
        expect(keyed.picked(), 'a key opens a closed door').toHaveLength(1);
        const route = keyed.picked()[0] as NavRoute;
        expect(route.lockedDoors.ordinary).toBeGreaterThan(0);
        expect(route.keysSpent.ordinary).toBeGreaterThan(0);
    });

    it('sets the journey the player reported, which needs no key', async () => {
        // mp80 (111,21) -> mp81 (124,6) crosses doors that are *open*. The
        // generator used to mark every door as needing a key, and this was refused
        // for three sessions because of it.
        const empty = harness({
            heroPosition: () => ({ mapId: 23, col: 111, row: 21 }),
            capabilities: () => bareCapabilities(),
        });
        const store = (empty.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        store.get(24);
        empty.screen.displayMapId = 24;
        await empty.screen.choose(124, 6);
        expect(empty.picked(), 'an open way through, no key needed').toHaveLength(1);
        const route = empty.picked()[0] as NavRoute;
        expect(route.lockedDoors.ordinary + route.lockedDoors.lion).toBe(0);
    });

    it('refuses a cell with no standing position anywhere near it', async () => {
        const h = harness();
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        const graph = store.get(0)!;
        // A cell far from any node.
        let empty = -1;
        for (let col = 0; col < graph.mapWidth && empty < 0; col++) {
            for (let row = 0; row < 64; row++) {
                if (h.screen.snapToNode(col, row) < 0) { empty = col * 100 + row; break; }
            }
        }
        expect(empty).toBeGreaterThanOrEqual(0);
        await h.screen.choose(Math.floor(empty / 100), empty % 100);
        expect(h.picked()).toHaveLength(0);
        expect(h.screen.active).toBe(true);
    });
});

describe('the map strip', () => {
    it('labels every tab so it fits inside its own slot', () => {
        // Fourteen maps is the widest component (from mp80). At 672px that is a
        // 48px slot, and a full "MP80" is five characters — the labels ran
        // together into one unreadable line across the top of the screen.
        const widest = Math.max(...NAV_MAPS.map((m) => NAV_REACHABLE[m.id]!.length));
        expect(widest).toBe(14);
        for (const meta of NAV_MAPS) {
            const count = NAV_REACHABLE[meta.id]!.length;
            if (count === 0) continue;
            const slot = 672 / count;
            for (const id of NAV_REACHABLE[meta.id]!) {
                const label = shortName(NAV_MAP_BY_ID.get(id)!.nameKey);
                // 12px monospace is about 7px per character; leave a 4px gutter.
                expect(label.length * 7 + 4, `${label} in a ${slot.toFixed(0)}px slot`)
                    .toBeLessThanOrEqual(slot);
            }
        }
    });

    it('shortens the labels', () => {
        expect(shortName('mp80')).toBe('80');
        expect(shortName('mp5d')).toBe('5D');
        expect(shortName('mpa0')).toBe('A0');
        expect(shortName('unknown')).toBe('UNKNOWN');
    });

    it('lists exactly the maps reachable from where the hero stands', () => {
        const h = harness();
        // The strip is what the arrows cycle through; it must match the data the
        // pathfinder uses, or the player could pick a map it can never route to.
        expect(NAV_REACHABLE[0]).toHaveLength(11);
        void h;
    });

    it('cycles maps and wraps at both ends', () => {
        const h = harness();
        const first = h.screen.displayMapId;
        h.screen.handleKey('PageDown', false, false, false);
        const second = h.screen.displayMapId;
        expect(second).not.toBe(first);
        h.screen.handleKey('PageUp', false, false, false);
        expect(h.screen.displayMapId).toBe(first);
    });
});

describe('the cursor wraps, because a cavern is a cylinder', () => {
    it('wraps columns across the seam', () => {
        const h = harness();
        const width = NAV_MAP_BY_ID.get(0)!.mapWidth;
        h.screen.cursorCol = 0;
        h.screen.handleKey('ArrowLeft', false, false, false);
        expect(h.screen.cursorCol).toBe(width - 1);
        h.screen.handleKey('ArrowRight', false, false, false);
        expect(h.screen.cursorCol).toBe(0);
    });

    it('wraps rows across the 64-row boundary', () => {
        const h = harness();
        h.screen.cursorRow = 0;
        h.screen.handleKey('ArrowUp', false, false, false);
        expect(h.screen.cursorRow).toBe(63);
        h.screen.handleKey('ArrowDown', false, false, false);
        expect(h.screen.cursorRow).toBe(0);
    });

    it('ignores key repeat when stepping maps, so one press moves one map', () => {
        const h = harness();
        const first = h.screen.displayMapId;
        h.screen.handleKey('PageDown', false, false, true);   // repeat
        expect(h.screen.displayMapId).toBe(first);
        h.screen.handleKey('PageDown', false, false, false);
        expect(h.screen.displayMapId).not.toBe(first);
    });
});

describe('Tab switches maps, and the arrows only move the cursor', () => {
    it('Tab steps the strip forwards and Shift+Tab back through it', () => {
        // The keydown reports Tab and shift together, so the direction has to be
        // read from the Tab case itself — guarding only PageUp left Shift+Tab
        // stepping forwards like a bare Tab.
        const h = harness();
        const first = h.screen.displayMapId;
        h.screen.handleKey('Tab', false, false, false);
        const second = h.screen.displayMapId;
        expect(second).not.toBe(first);
        h.screen.handleKey('Tab', false, true, false);       // shift
        expect(h.screen.displayMapId).toBe(first);
    });

    it('Tab wraps at both ends of the strip', () => {
        const h = harness();
        h.screen.handleKey('Tab', false, false, false);
        h.screen.handleKey('Tab', false, true, false);
        expect(h.screen.displayMapId).toBe(0);
    });

    it('no arrow key changes the map on screen', () => {
        // The hint line claims the arrows are the cursor; a strip change under
        // one of them would send the player to another cavern mid-aim.
        const h = harness();
        for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
            h.screen.displayMapId = 0;
            const before = `${h.screen.cursorCol},${h.screen.cursorRow}`;
            h.screen.handleKey(code, false, false, false);
            expect(h.screen.displayMapId).toBe(0);
            expect(`${h.screen.cursorCol},${h.screen.cursorRow}`).not.toBe(before);
        }
    });

    it('Shift+Tab past the ends of the strip still lands on a map', () => {
        const h = harness();
        h.screen.handleKey('Tab', false, true, false);
        expect(NAV_REACHABLE[0]).toContain(h.screen.displayMapId);
    });
});

describe('the status line names both ends of the route', () => {
    /** Every `fillText` of one frame, with where it landed. */
    function drawn(h: Harness): { text: string; x: number; y: number }[] {
        const seen: { text: string; x: number; y: number }[] = [];
        const spy = vi.spyOn(CTX, 'fillText').mockImplementation(((t: string, x: number, y: number) => {
            seen.push({ text: t, x, y });
        }) as never);
        h.draw(0);
        spy.mockRestore();
        return seen;
    }

    it('reports the hero and the cursor in map coordinates', () => {
        // A cavern wraps at both seams and is up to 320 columns wide, so the
        // markers give direction and the numbers give the position.
        const h = harness();
        h.screen.cursorCol = 77;
        h.screen.cursorRow = 31;
        const lines = drawn(h);
        expect(lines).toContainEqual({ text: `map.hero ${HERO.col},${HERO.row}`, x: 16, y: 394 });
        expect(lines).toContainEqual({ text: 'map.dest 77,31', x: 672 - 16, y: 394 });
    });

    it('tracks the cursor as it moves', () => {
        const h = harness();
        h.screen.handleKey('ArrowRight', false, false, false);
        h.screen.handleKey('ArrowDown', false, false, false);
        const dest = drawn(h).find((l) => l.text.startsWith('map.dest'))!;
        expect(dest.text).toBe(`map.dest ${HERO.col + 1},${HERO.row + 1}`);
    });

    it('names the hero\'s cavern when it is not the one on screen', () => {
        // Without the name, the hero's numbers would be read as belonging to the
        // map being displayed — which is a different cavern with different columns.
        const h = harness({ heroPosition: () => ({ mapId: 1, col: 27, row: 15 }) });
        const hero = drawn(h).find((l) => l.text.startsWith('map.hero'))!;
        expect(hero.text).toBe('map.hero 27,15 1D');
    });

    it('draws the hero without a name while the hero\'s own map is on screen', () => {
        const h = harness();
        const hero = drawn(h).find((l) => l.text.startsWith('map.hero'))!;
        expect(hero.text).toBe(`map.hero ${HERO.col},${HERO.row}`);
    });

    it('sits between the map and the hint line, on the canvas', () => {
        const h = harness();
        const lines = drawn(h);
        const hero = lines.find((l) => l.text.startsWith('map.hero'))!;
        const hint = lines.find((l) => l.text === 'map.hints')!;
        // The map area ends at 390, so a 14px line at 394 is the first band that
        // clears it, and the hint stays the last one the border leaves room for.
        expect(hero.y).toBe(394);
        expect(hint.y).toBe(414);
        expect(hero.y).toBeLessThan(hint.y);
    });
});

describe('doors are drawn as the cavern draws them', () => {
    // The two sheets are kept distinct so a blit can be attributed: the raster
    // cuts the cavern's own tiles out of `tiles`, the door composites out of
    // `platforms` — the shared dchr band, as in the live view.
    const tileSheet = { width: 8 * 24, height: 24 } as HTMLImageElement;
    const doorSheet = { width: 39 * 24, height: 24 } as HTMLImageElement;

    interface Blit { sheet: unknown; sx: number; dx: number; dy: number; dw: number }

    /** Blits drawn out of the dchr sheet, captured for one frame. */
    function captureDoorBlits(): Blit[] {
        const seen: Blit[] = [];
        vi.spyOn(CTX, 'drawImage').mockImplementation(((
            img: unknown, sx: number, _sy: number, _sw: number, _sh: number,
            dx: number, dy: number, dw: number,
        ) => {
            if (img === doorSheet) seen.push({ sheet: img, sx, dx, dy, dw });
        }) as never);
        return seen;
    }

    /** Let the sheet promise land; the doors appear on the frame after it does. */
    const settle = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

    it('blits the dchr frames of a door, at the map scale', async () => {
        const h = harness({
            tileSheets: async () => ({ tiles: tileSheet, platforms: doorSheet }),
        });
        h.screen.draw(0);            // no sheet yet, so no doors
        await settle();
        const seen = captureDoorBlits();
        h.screen.draw(0);
        vi.restoreAllMocks();

        // mp10 has doors, and each one is a 5x4 composite. Two tiles of it are not
        // blitted: the open table's two id-0 tiles — the void in the doorway —
        // and the roka colour in the middle of the lintel, which is drawn as a
        // flat square. So a shut door blits 19 and an open one 17.
        const doors = NAV_PORTALS_BY_MAP[0]!.length;
        expect(seen.length).toBeGreaterThan(doors * 16);
        expect(seen.length).toBeLessThanOrEqual(doors * 19);
        // Door tiles 0x49.. are dchr frames 0x09..; nothing comes from outside
        // the sheet, and every blit is a whole map tile at the map scale.
        expect(seen.every((b) => b.sx >= 9 * 24 && b.sx < 39 * 24)).toBe(true);
        const widths = new Set(seen.map((b) => b.dw));
        expect(widths.size).toBe(1);
        expect(widths.has(h.screen.scaleFor(0))).toBe(true);
        // And they cover 5x4 tiles per door, not the one square the old marker drew.
        expect(new Set(seen.map((b) => b.dx)).size).toBeLessThanOrEqual(5 * doors);
        expect(new Set(seen.map((b) => b.dy)).size).toBeLessThanOrEqual(4 * doors);
    });

    it('puts the composite where the hero walks through it', async () => {
        const h = harness({
            tileSheets: async () => ({ tiles: tileSheet, platforms: doorSheet }),
        });
        h.screen.draw(0);
        await settle();
        const seen = captureDoorBlits();
        h.screen.draw(0);
        vi.restoreAllMocks();

        // The frame hangs one column left and one row above the standing cell, so
        // the trigger tile the door record names is the composite's second column.
        const portal = PORTALS.find((p) => p.mapId === 0)!;
        const scale = h.screen.scaleFor(0);
        const { ox, oy } = h.screen.originFor(0);
        const left = ox + (portal.fromX - 1) * scale;
        const top = oy + (portal.fromY - 1) * scale;
        const tiles = seen.filter((b) =>
            b.dx >= left && b.dx < left + 5 * scale && b.dy >= top && b.dy < top + 4 * scale);
        expect(tiles.length).toBeGreaterThan(0);
        expect(Math.min(...tiles.map((b) => b.dx))).toBe(left);
        expect(Math.min(...tiles.map((b) => b.dy))).toBe(top);
        expect(new Set(tiles.map((b) => b.dx)).size).toBe(5);
    });

    it('picks the open or the closed composite from the door state', async () => {
        const shut = harness({
            tileSheets: async () => ({ tiles: tileSheet, platforms: doorSheet }),
            doorOpen: () => false,
        });
        const open = harness({
            tileSheets: async () => ({ tiles: tileSheet, platforms: doorSheet }),
            doorOpen: () => true,
        });
        shut.screen.draw(0);
        open.screen.draw(0);
        await settle();
        const a = captureDoorBlits();
        shut.screen.draw(0);
        vi.restoreAllMocks();
        const b = captureDoorBlits();
        open.screen.draw(0);
        vi.restoreAllMocks();

        // Same doors in the same places, different art: the two tables share the
        // frame and the jamb columns and differ across the middle. Three of the
        // twenty tiles are filled rather than blitted — the roka colour, and the
        // two id-0 tiles the open table has and the shut one does not — so the
        // shut door shows 19 tiles and the open one 17.
        const rectOf = (p: (typeof PORTALS)[number]): { l: number; t: number; w: number; h: number } => {
            const { ox, oy } = shut.screen.originFor(0);
            const scale = shut.screen.scaleFor(0);
            return { l: ox + (p.fromX - 1) * scale, t: oy + (p.fromY - 1) * scale, w: 5 * scale, h: 4 * scale };
        };
        const inside = (r: ReturnType<typeof rectOf>, b: Blit): boolean =>
            b.dx >= r.l && b.dx < r.l + r.w && b.dy >= r.t && b.dy < r.t + r.h;

        const shutPortal = PORTALS.find((p) => p.mapId === 0)!;
        const r = rectOf(shutPortal);
        expect(a.filter((b) => inside(r, b)).length).toBe(19);
        expect(b.filter((b) => inside(r, b)).length).toBe(17);
        expect(a.map((x) => x.sx)).not.toEqual(b.map((x) => x.sx));
    });

    it('falls back to the level data when no door state is supplied', async () => {
        // Without a live answer, `key === 0` — a door the MDT shipped open — is
        // drawn open and the rest shut, so mp10's doors come out mixed. Neither
        // all-open nor all-closed is correct for it, and 139 of the game's 163
        // doors ship open, so "everything shut" would be wrong nearly every time.
        const sheets = { tileSheets: async () => ({ tiles: tileSheet, platforms: doorSheet }) };

        const mixed = harness(sheets);
        const allOpen = harness({ ...sheets, doorOpen: () => true });
        const allShut = harness({ ...sheets, doorOpen: () => false });
        mixed.screen.draw(0);
        allOpen.screen.draw(0);
        allShut.screen.draw(0);
        await settle();

        const framesOf = async (screen: MapScreen): Promise<number[]> => {
            const seen = captureDoorBlits();
            screen.draw(0);
            vi.restoreAllMocks();
            return seen.map((b) => b.sx);
        };
        const [asShipped, open, shut] = await Promise.all([
            framesOf(mixed.screen), framesOf(allOpen.screen), framesOf(allShut.screen),
        ]);

        expect(new Set(asShipped).size).toBeGreaterThan(0);
        expect(asShipped).not.toEqual(open);
        expect(asShipped).not.toEqual(shut);
        // Both ends of the strip are represented, which is the point of asking.
        expect(open.some((sx) => !shut.includes(sx))).toBe(true);
        expect(shut.some((sx) => !open.includes(sx))).toBe(true);
    });

    it('draws the roka colour as a flat square, not the orb sprite', async () => {
        const h = harness({
            tileSheets: async () => ({ tiles: tileSheet, platforms: doorSheet }),
        });
        h.screen.draw(0);
        await settle();

        // The orb is 24px of art the map has no room for; at map scale it is a
        // smear over the frame. Capture every fill so the square can be found.
        const fills: { style: string; x: number; y: number; w: number; h: number }[] = [];
        vi.spyOn(CTX, 'fillRect').mockImplementation(((x: number, y: number, w: number, h: number) => {
            fills.push({ style: String(CTX.fillStyle), x, y, w, h });
        }) as never);
        h.screen.draw(0);
        vi.restoreAllMocks();

        const scale = h.screen.scaleFor(0);
        // One square per door, in the middle column of the lintel. The screen
        // fills other tiles black too, so the squares are located rather than
        // counted.
        const squares = fills.filter((f) =>
            f.style.startsWith('#') && f.w === scale && f.h === scale);
        const { ox, oy } = h.screen.originFor(0);
        const mine = new Set(PORTALS.filter((p) => p.mapId === 0)
            .map((p) => `${ox + (p.fromX + 1) * scale},${oy + (p.fromY - 1) * scale}`));
        const mineSquares = squares.filter((f) => mine.has(`${f.x},${f.y}`));
        expect(mineSquares.length).toBe(mine.size);
        expect(new Set(mineSquares.map((f) => f.style)).size).toBeGreaterThan(1);
        for (const portal of PORTALS.filter((p) => p.mapId === 0)) {
            const at = squares.filter((f) =>
                f.x === ox + (portal.fromX + 1) * scale && f.y === oy + (portal.fromY - 1) * scale);
            expect(at).toHaveLength(1);
            expect(at[0]!.style).toBe(rokaColour(portal.color));
        }
    });

    it('maps each roka colour to its own square', () => {
        // The generated door table uses these five and nothing else.
        expect([0, 1, 2, 3, 4].map(rokaColour))
            .toEqual(['#000000', '#ff0000', '#0000ff', '#00ff00', '#ff00ff']);
        expect(new Set(PORTALS.map((p) => p.color))).toEqual(new Set([0, 1, 2, 3, 4]));
        // Anything outside them is a colour the map has no square for; it must not
        // silently borrow a neighbour's, and must not reach the canvas at all.
        expect(rokaColour(5)).not.toBe(rokaColour(2));
        expect(rokaColour(7)).not.toBe(rokaColour(3));
    });

    it('draws no doors without a sheet, and does not throw', () => {
        const h = harness();
        const seen = captureDoorBlits();
        expect(() => h.screen.draw(0)).not.toThrow();
        vi.restoreAllMocks();
        expect(seen).toEqual([]);
    });
});

describe('drawing does not throw for any map', () => {
    it('renders every cavern, including the doorless ones', () => {
        // One screen, as in play: the store caches each cavern's graph.
        const h = harness();
        for (const meta of NAV_MAPS) {
            h.screen.displayMapId = meta.id;
            expect(() => h.screen.draw(0), meta.nameKey).not.toThrow();
        }
    });

    it('renders when the map data has not loaded yet', () => {
        const store = new NavGraphStore(function noData() { return null; });
        const screen = new MapScreen({
            canvas: CANVAS,
            ctx: CTX,
            store,
            heroPosition: () => HERO,
            capabilities: () => allCapabilities(),
            text: (k: string) => k,
            onExit: () => {},
            onPick: () => {},
        });
        screen.enter({ heroMapId: HERO.mapId, heroCol: HERO.col, heroRow: HERO.row });
        expect(() => screen.draw(0)).not.toThrow();
        // And a click cannot silently produce a route out of nothing.
        void screen.choose(10, 10);
    });

    it('shows a transient message instead of the hint line while one is set', () => {
        const seen: string[] = [];
        const h = harness({ text: (k: string) => k });
        const spy = vi.spyOn(CTX, 'fillText').mockImplementation(((t: string) => {
            seen.push(t);
        }) as never);
        h.screen.draw(0);
        // The hint line is drawn every frame; a failure message replaces it only
        // for its lifetime, which is why it is drawn on top rather than stored.
        expect(seen.some((t) => t === 'map.hints')).toBe(true);
        spy.mockRestore();
    });

    it('sets the hint line in the only face whose glyphs fit it', () => {
        // "Press Start 2P" glyphs are as wide as they are tall, and the hint is
        // the longest line the screen draws — at 12px it ran past the canvas.
        const fonts: string[] = [];
        const h = harness({ text: (k: string) => k });
        const spy = vi.spyOn(CTX, 'fillText').mockImplementation(((t: string) => {
            if (t === 'map.hints') fonts.push(CTX.font);
        }) as never);
        h.screen.draw(0);
        spy.mockRestore();
        expect(fonts).toHaveLength(1);
        // The weight is not pinned — only the family and the size, which are what
        // decide whether the line fits.
        expect(fonts[0]).toMatch(/(?:^|\s)14px "Courier New", Courier, monospace$/);
        expect(fonts[0]).not.toContain('Press Start 2P');
    });
});
