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
import { nodeAt } from '../src/engine/nav/nav-graph.js';
import { NAV_PLATFORMS } from '../src/data/nav/nav-platforms.js';
import { NAV_ACCESSORIES } from '../src/data/nav/nav-accessories.js';
import { NAV_KEYS } from '../src/data/nav/nav-keys.js';

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

/**
 * A store holding only the maps of one component, the way the game has one.
 *
 * `NavGraphStore` builds a graph the moment anybody asks, and its source answers for
 * every cavern on disk. In the browser it does not: `navGraphStore`'s source reads
 * the live `g_mem` for the cavern the hero is standing in and nothing else, and any
 * other is downloaded when the player browses to it — so `ensureComponent` is what
 * puts a level's maps in memory, and a search run from it sees its own component and
 * no more. A test that hands it every map measures a game that does not exist.
 */
function componentStore(mapIds: readonly number[]): NavGraphStore {
    const inside = new Set(mapIds);
    const cache = new Map<number, Uint8Array>();
    return new NavGraphStore((mapId) => {
        const meta = NAV_MAP_BY_ID.get(mapId);
        if (!meta || !inside.has(mapId)) return null;
        let hit = cache.get(mapId);
        if (!hit) {
            hit = new Uint8Array(readFileSync(resolve(REPO, `web/public/game/0/${meta.nameKey}.mdt`)));
            cache.set(mapId, hit);
        }
        return hit;
    });
}

/** The standing position the search sees for a cell, as a node index in `store`. */
function nodeOf(store: NavGraphStore, mapId: number, col: number, row: number): number {
    const graph = store.get(mapId);
    if (!graph) throw new Error(`no graph for map ${mapId}`);
    const node = nodeAt(graph, col, row);
    if (node < 0) throw new Error(`(${col},${row}) is not a standing position on map ${mapId}`);
    return node;
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

/** The canvas pixel at the centre of a cell of the map on screen. */
function pixelOf(screen: MapScreen, col: number, row: number): { x: number; y: number } {
    const { ox, oy, scale } = screen.originFor(screen.displayMapId);
    return {
        x: ox + col * scale + Math.floor(scale / 2),
        y: oy + row * scale + Math.floor(scale / 2),
    };
}

/** A standing position in mp10 far enough away to be worth walking to. */
function farNode(screen: MapScreen): { col: number; row: number } {
    const store = (screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
    const graph = store.get(0)!;
    for (let i = 0; i < graph.nodes.length; i++) {
        const node = graph.nodes[i]!;
        if (node.kind !== 0) continue;
        const d = Math.abs(node.col - HERO.col);
        if (d > 40 && d < 90) return { col: node.col, row: node.row };
    }
    throw new Error('no standing position in mp10 far from the hero');
}

/** A cell of mp10 with no standing position anywhere near it — a refusal. */
function unreachableCell(screen: MapScreen): { col: number; row: number } {
    const store = (screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
    const graph = store.get(0)!;
    for (let col = 0; col < graph.mapWidth; col++) {
        for (let row = 0; row < 64; row++) {
            if (screen.snapToNode(col, row) < 0) return { col, row };
        }
    }
    throw new Error('every cell of mp10 is within the snap radius of a node');
}

/** The hint line of one frame — a refusal while one is set, the controls after. */
function hintOf(h: Harness, now: number): string {
    const seen: string[] = [];
    const spy = vi.spyOn(CTX, 'fillText').mockImplementation(((t: string) => {
        seen.push(t);
    }) as never);
    h.draw(now);
    spy.mockRestore();
    return seen[seen.length - 1]!;          // the hint line is drawn last
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

    it('draws every platform, where the level data says it stands', async () => {
        // A platform is runtime state: `render_vertical_platforms_to_proximity` and its
        // two siblings stamp three tiles into the proximity map every frame, and none of
        // them is ever in the MDT. So the chart was a cavern with all of its machinery
        // missing — the player rides the row-30 platform at mp80 (203,27) and the map
        // shows the empty air he is standing in.
        //
        // They are drawn at the **default** position, which is where a cavern is entered
        // and where a platform snaps back to when its map is loaded again, so the chart
        // is the cavern the player meets. Where one travels is not drawn: a horizontal
        // platform has already started moving by the time the map opens, and a span it
        // is not on would be worse than nothing.
        // `drawSheetFrame` turns a frame index into a source cell before blitting, so
        // the frame is recovered from the source column: the platform sheet is one row
        // of 24px cells, and frame N sits at column N.
        const blits: { frame: number; dx: number; dy: number }[] = [];
        const inner = {
            ...CTX,
            drawImage: (_s: unknown, sx: number, _sy: number, _sw: number, _sh: number,
                dx: number, dy: number) => { blits.push({ frame: sx / 24, dx, dy }); },
        } as unknown as CanvasRenderingContext2D;
        const createElement = vi.spyOn(document, 'createElement').mockImplementation(
            (() => ({
                width: 0, height: 0, getContext: () => inner,
            } as unknown as HTMLCanvasElement)) as typeof document.createElement);

        const outer = { ...CTX, drawImage: () => {} } as unknown as CanvasRenderingContext2D;
        // Nine frames, one row — the platform sheet's real shape, so all three families
        // blit. Only the three triples' first frames are checked, because the two
        // families that start at frame 3 and 6 would need the sheet to hold them.
        const sheet = { width: 24 * 9, height: 24 } as HTMLImageElement;
        const h = harness({
            canvas: CANVAS, ctx: outer, tileSheets: async () => ({ tiles: sheet, platforms: sheet }),
        });
        h.draw();
        await new Promise((r) => { setTimeout(r, 0); });
        h.draw();
        createElement.mockRestore();

        const tables = NAV_PLATFORMS[HERO.mapId]!;
        // Three families, three different triples of the shared sheet: 0x40 vertical,
        // 0x43 collapsing, 0x46 horizontal (dungeon-vertical.ts, dungeon-platforms.ts).
        const wanted = [
            ...tables.vertical.map((p) => ({ col: p.x, row: p.startY, frame: 0 })),
            ...tables.collapsing.map((p) => ({ col: p.x, row: p.startY, frame: 3 })),
            ...tables.horizontal.filter((p) => p.speed !== 0)
                .map((p) => ({ col: p.startX, row: p.y, frame: 6 })),
        ];
        // The first tile of each platform is frame 0x40, 0x43 and 0x46 of the sheet,
        // and `drawSheetFrame` indexes the sheet from zero.
        expect(wanted.length, 'mp10 has platforms of all three kinds').toBeGreaterThan(3);
        const { scale } = (h.screen as unknown as {
            originFor: (id: number) => { ox: number; oy: number; scale: number };
        }).originFor(HERO.mapId);
        // The raster is a canvas of its own, so a blit carries chart-local coordinates;
        // `drawMap` places it on the sheet afterwards.
        const drawn = new Set(blits.map((b) => `${b.frame},${b.dx},${b.dy}`));
        for (const p of wanted) {
            const at = `${p.frame},${p.col * scale},${p.row * scale}`;
            expect(drawn.has(at), `a platform at column ${p.col}, row ${p.row}`).toBe(true);
        }
    });

    it('shows a platform even with no art to draw it with', () => {
        // The sheet is what tells a lift from a conveyor, not the chart's geometry, so
        // a screen with no sheets still marks them — in the class colour the raster
        // falls back to everywhere else.
        const fills: [number, number][] = [];
        const inner = {
            ...CTX,
            fillRect: (x: number, y: number) => { fills.push([x, y]); },
        } as unknown as CanvasRenderingContext2D;
        const createElement = vi.spyOn(document, 'createElement').mockImplementation(
            (() => ({
                width: 0, height: 0, getContext: () => inner,
            } as unknown as HTMLCanvasElement)) as typeof document.createElement);
        const outer = { ...CTX, drawImage: () => {} } as unknown as CanvasRenderingContext2D;
        const h = harness({ canvas: CANVAS, ctx: outer });
        h.draw();
        createElement.mockRestore();

        const p = NAV_PLATFORMS[HERO.mapId]!.vertical[0]!;
        const { scale } = (h.screen as unknown as {
            originFor: (id: number) => { ox: number; oy: number; scale: number };
        }).originFor(HERO.mapId);
        const painted = new Set(fills.map(([x, y]) => `${x},${y}`));
        for (let i = 0; i < 3; i++) {
            expect(painted.has(`${(p.x + i) * scale},${p.startY * scale}`),
                `a platform tile at column ${p.x + i}, row ${p.startY}`).toBe(true);
        }
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

    it('fits the chart inside the border, not edge to edge', () => {
        // `draw` strokes a 2px frame 4px in from the edge, so a chart may use
        // 660px and not 672. mp20 is 224 columns and 672/224 is 3.000: asking the
        // canvas for a width it does not have put the map straight over both sides
        // of the frame, and every other cavern clears it by 2px or more, which is
        // why only mp20 showed it.
        const BORDER = 6;
        const { screen } = harness();
        for (const meta of NAV_MAPS) {
            const { ox, scale } = screen.originFor(meta.id);
            expect(ox, `${meta.nameKey} left gap`).toBeGreaterThanOrEqual(BORDER);
            expect(672 - (ox + meta.mapWidth * scale), `${meta.nameKey} right gap`)
                .toBeGreaterThanOrEqual(BORDER);
        }
        expect(NAV_MAP_BY_ID.get(2)!.mapWidth, 'mp20 is 224 columns wide').toBe(224);
        expect(screen.scaleFor(2), 'and 224 * 3 is the whole canvas, so 2x it is')
            .toBe(2);
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

describe('the mouse aims, and only Enter spends the thread', () => {
    it('a click moves the target rectangle, and nothing else happens', () => {
        // The reported defect, verbatim: a click both aimed and confirmed, so
        // reaching for a spot spent the thread there. The click is now the same
        // gesture as an arrow key — it moves the rectangle and stops.
        const h = harness();
        const before = `${h.screen.cursorCol},${h.screen.cursorRow}`;
        const goal = farNode(h.screen);
        const { x, y } = pixelOf(h.screen, goal.col, goal.row);
        h.screen.handleClick(x, y);
        expect(`${h.screen.cursorCol},${h.screen.cursorRow}`, 'the rectangle moved')
            .toBe(`${goal.col},${goal.row}`);
        expect(before).not.toBe(`${goal.col},${goal.row}`);
        expect(h.picked(), 'and no route was planned').toHaveLength(0);
        expect(h.screen.active, 'and the screen is still open').toBe(true);
    });

    it('Enter commits the cell the click just set', async () => {
        const h = harness();
        const goal = farNode(h.screen);
        const { x, y } = pixelOf(h.screen, goal.col, goal.row);
        h.screen.handleClick(x, y);
        // `choose` is asynchronous — a route may need a cavern the game has not
        // downloaded yet — so the keypress only starts it.
        h.screen.handleKey('Enter', false, false, false);
        await vi.waitFor(() => expect(h.picked()).toHaveLength(1));
        const route = h.picked()[0] as { points: unknown[]; maps: number[] };
        const end = route.points[route.points.length - 1] as { col: number; row: number };
        expect([end.col, end.row], 'the route ends where the click aimed')
            .toEqual([goal.col, goal.row]);
        expect(route.maps).toEqual([0]);
        expect(h.screen.active, 'and the screen closes').toBe(false);
    });

    it('never lets the pointer drag the target along behind it', () => {
        // The target is a destination, not a cursor. It used to re-aim on every
        // `pointermove`, so sweeping the mouse across a 320-column chart to look
        // at it moved the thread's destination under the pointer. There is no
        // motion entry point to reintroduce that through, and nothing in the
        // composition root feeds pointer motion to the screen.
        expect(Object.getOwnPropertyNames(MapScreen.prototype))
            .not.toContain('handlePointer');
        const main = readFileSync(resolve(REPO, 'web/src/main.ts'), 'utf8');
        expect(main, 'no pointer-motion listener reaches the map screen')
            .not.toMatch(/addEventListener\(\s*['"`]pointermove/);
    });

    it('ignores a click that lands off the chart', () => {
        // A click below a trimmed chart, or beside it, is not a cell of the map
        // and must leave the destination the player already aimed.
        const h = harness();
        const before = `${h.screen.cursorCol},${h.screen.cursorRow}`;
        const { ox, oy, scale } = h.screen.originFor(0);
        h.screen.handleClick(ox - 4, oy + 10);
        h.screen.handleClick(ox + 10, oy - 4);
        h.screen.handleClick(ox + 10, oy + h.screen.chartedRows(0) * scale + 4);
        expect(`${h.screen.cursorCol},${h.screen.cursorRow}`).toBe(before);
        expect(h.picked()).toHaveLength(0);
    });

    it('still browses the map strip with a click', () => {
        // The strip is not a destination: clicking a tab is Tab's gesture, and it
        // changed maps when the click also confirmed, so it has to keep doing it.
        const h = harness();
        const first = h.screen.displayMapId;
        const count = NAV_REACHABLE[0]!.length;
        const slot = 672 / count;
        const index = NAV_REACHABLE[0]!.indexOf(first) + 1;
        h.screen.handleClick(slot * (index + 0.5), 28 + 13);
        expect(h.screen.displayMapId).toBe(NAV_REACHABLE[0]![index]);
        expect(h.picked(), 'browsing is not choosing').toHaveLength(0);
    });

it('clears the last refusal when the player aims somewhere else', async () => {
        // "That place is not passable." is about the cell it was asked for, and a
        // click has just moved the target off it.
        const h = harness({ text: (k: string) => k });
        const cell = unreachableCell(h.screen);
        h.draw(0);
        await h.screen.choose(cell.col, cell.row);
        expect(hintOf(h, 16)).toBe('map.noPath');

        const goal = farNode(h.screen);
        const { x, y } = pixelOf(h.screen, goal.col, goal.row);
        h.screen.handleClick(x, y);
        expect(hintOf(h, 16), 'the refusal was about the cell before this one')
            .toBe('map.hints');
    });
});

describe('a refusal reaches the player', () => {
    it('draws it at the time a map is actually opened', async () => {
        // The report, as a fact about the game: no refusal had ever been seen. `fail`
        // stamped the literal `2000` while `draw` is handed `performance.now()`, so
        // the message could only ever be on screen during the first two seconds of the
        // page's life — and the map is opened from the inventory, minutes into a
        // game. `now` was long past the deadline, so an unreachable destination was
        // reported by silence.
        const h = harness({ text: (k: string) => k });
        h.draw(60_000);
        const cell = unreachableCell(h.screen);
        await h.screen.choose(cell.col, cell.row);
        expect(h.picked()).toHaveLength(0);
        expect(hintOf(h, 60_016), 'one frame after the refusal').toBe('map.noPath');
    });

    it('gives the hint line back after two seconds', async () => {
        const h = harness({ text: (k: string) => k });
        h.draw(60_000);
        const cell = unreachableCell(h.screen);
        await h.screen.choose(cell.col, cell.row);
        expect(hintOf(h, 61_999), 'still up just before the deadline').toBe('map.noPath');
        expect(hintOf(h, 62_000), 'and gone at it').toBe('map.hints');
    });

    it('names the refusal that fits, and the screen stays open', async () => {
        // mp29 is mp90, behind a Lion-Head door and not in mp10's reachable set. A
        // standing position *on* mp29 is a valid destination the search refuses —
        // all four rungs, the last one carrying every key and every shoe in the
        // game — which is a different sentence from "no such cell", and the screen
        // has one line for it.
        const h = harness({ text: (k: string) => k });
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        const graph = store.get(29)!;
        const node = graph.nodes.find((n) => n.kind === 0)!;
        h.screen.displayMapId = 29;
        h.draw(60_000);
        await h.screen.choose(node.col, node.row);
        expect(hintOf(h, 60_016)).toBe('map.unreachable');
        expect(h.picked()).toHaveLength(0);
        expect(h.screen.active, 'a refusal leaves the screen open to try again').toBe(true);
    }, 120000);
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
        //
        // Which door is open is `doorOpen`'s answer to give. Without it the screen
        // does the honest thing instead: the west-gallery door at mp80 (57,15) is an
        // ordinary-key door and is now the only way out of the start region, so every
        // rung that can reach the journey fetches its key on the way and comes back
        // with `lockedDoors.ordinary === 1` and one key spent.
        const empty = harness({
            heroPosition: () => ({ mapId: 23, col: 111, row: 21 }),
            capabilities: () => bareCapabilities(),
            doorOpen: (mapId, x0, y0) => (mapId === 23 && x0 === 57 && y0 === 15 ? true : null),
        });
        const store = (empty.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        store.get(23);
        store.get(24);
        store.get(25);
        empty.screen.displayMapId = 24;
        await empty.screen.choose(124, 6);
        expect(empty.picked(), 'an open way through, no key needed').toHaveLength(1);
        const route = empty.picked()[0] as NavRoute;
        expect(route.lockedDoors.ordinary + route.lockedDoors.lion).toBe(0);
        expect(route.keysSpent.ordinary + route.keysSpent.lion).toBe(0);
    }, 120000);

    it('asks for nothing at all once the door is open and the key is spent', async () => {
        // The state after the boss. The player has been through the locked door at
        // mp10 (26,16), so that door now stands open for good — and the key they spent
        // on it is gone from the floor at mp10 (99,41), which is `keyPresent`'s whole
        // job to say.
        //
        // Nothing else changes: no accessory, an empty pocket, and no key anywhere to
        // fetch. So the keys rung cannot help and the shoes rung is the only thing left
        // — and it must not be reached, because the door is open and the route through
        // the boss arena needs nothing at all. Before `doorOpen` reached the search
        // (it was consulted only to draw the door on the chart) every rung below the
        // shoes one failed on that door and the screen offered the Feruza jump.
        const h = harness({
            heroPosition: () => ({ mapId: 0, col: 61, row: 7 }),
            capabilities: () => bareCapabilities(),
            keyPresent: () => false,
            doorOpen: (mapId, x0, y0) => (mapId === 0 && x0 === 26 && y0 === 15 ? true : null),
        });
        h.screen.displayMapId = 0;
        await h.screen.choose(128, 33);
        expect(h.picked(), 'a bare route exists and must be preferred').toHaveLength(1);
        const route = h.picked()[0] as NavRoute;
        expect(route.equipment, 'nothing to put on').toEqual([]);
        expect(route.lockedDoors.ordinary, 'the door is open, so it is not a locked door')
            .toBe(0);
        expect(route.keysSpent.ordinary, 'no key is spent on an open door').toBe(0);
        expect(route.maps, 'through the boss arena it leaves by').toContain(1);
    });

    it('asks for the keys before it asks for shoes', async () => {
        // mp10 (61,7) -> (128,33), the other town door's standing position, with an
        // empty pocket and nothing worn. There are two answers, and which one the
        // screen takes is a question of order, not of cost:
        //
        //   - bare, 752 points and cost 1030, via mp21 for the key at (99,41) and
        //     back through the locked door at (26,16) into the boss arena;
        //   - Feruza, 121 points and cost 167, a four-tile jump at (155,37) over the
        //     Silkarn slope that is the only other way into the row-33 corridor.
        //
        // The shoes rung used to be tried first, so it answered and the bare route
        // was never built — and a key is not a cost while an accessory is. A key is
        // in a drawer in the level and he picks it up on the way past; shoes mean
        // stopping to change what he is wearing. So keys come first, however much
        // further the detour.
        const h = harness({
            heroPosition: () => ({ mapId: 0, col: 61, row: 7 }),
            capabilities: () => bareCapabilities(),
        });
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        store.get(1);                     // the arena the bare route goes through
        store.get(3);                     // and mp21, where its key is
        h.screen.displayMapId = 0;
        await h.screen.choose(128, 33);
        expect(h.picked(), 'a bare route exists and must be preferred').toHaveLength(1);
        const route = h.picked()[0] as NavRoute;
        expect(route.equipment, 'no accessory on a route that needs none').toEqual([]);
        expect(route.keysSpent.ordinary, 'it spends the key it collects').toBe(1);
    });

    it('sends a journey that needs shoes and a key at the same time', async () => {
        // mp80 (111,21) -> mp82 (102,54) is short of both at once: shoes to leave
        // the shelf he is standing on, and the ordinary key for the door at (57,16).
        // Every rung below the first granted only its own axis — 2 and 4 the key, 3
        // and 3b the shoes, 4 the key again through `unlimitedKeys` but never the
        // shoes — so all five answered NULL and the screen reported `map.unreachable`
        // for a journey of 384 hops. A journey can be short of a key and of shoes
        // together, and no rung may assume otherwise.
        //
        // The pair it is short of has changed: the Silkarn ramp at mp80 columns
        // 82..86 was on every way out and is on none of them now, because the lifts
        // carry him the whole height of their travel and mp80 reaches mp82 through
        // the door at (166,31) as well as through the locked gallery door. Feruza
        // shoes are what the remaining way asks for — the four-row jump off the top
        // of the x=250 lift into the row-7 gallery — and the door still costs a key.
        const h = harness({
            heroPosition: () => ({ mapId: 23, col: 111, row: 21 }),
            capabilities: () => bareCapabilities(),
        });
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        store.get(25);
        h.screen.displayMapId = 25;
        await h.screen.choose(102, 54);
        expect(h.picked(), 'the way exists once shoes and keys are allowed together')
            .toHaveLength(1);
        const route = h.picked()[0] as NavRoute;
        expect(route.equipment.map((e) => e.label), 'a bare hero is sent in shoes')
            .toContain('feruza');
        expect(route.maps, 'mp80 -> mp82').toEqual(expect.arrayContaining([23, 25]));
    }, 120_000);

    it('fetches the pair on the floor rather than wearing one he cannot get', async () => {
        // mp50 (94,11) -> mp51 (192,17), a hero with no shoes and no keys. The report
        // was that the route led up the slope between mp51 (117,60) and mp51 (124,54):
        // *"Since hero does not have Silkarn shoes, he cannot climb up the slope, so
        // this hop should be disabled."* The hop was never offered to him — it is
        // gated, and a bare hero is refused it — but a route that walks him into it
        // was, and the graph was right to.
        //
        // The slope route is rung 3b: `planAccessories` grants every pair in the game
        // and reports what it used, which is right for a pair the player is already
        // carrying and nonsense for one he cannot reach. Level 5 has exactly one pair
        // lying in it, Pirika at mp50 (208,27), and the journey the player described is
        // that one: walk over the pair, cross mp51 (101,15) for the key, spend it on
        // the door at mp50 (132,54), and walk to the goal over aggressive ground.
        //
        // Rung 3 is the rung that finds it, and it could not, because `shoePresent` was
        // asked about the *node* the pair lands on and the engine's entity list reports
        // the *record*. All four pairs in the game are recorded one row above the node
        // the pickup snaps to, so every one of them read as already collected, rung 3
        // answered NULL, and the screen fell through to the slope.
        const store = componentStore([11, 12]);
        const h = harness({
            store,
            heroPosition: () => ({ mapId: 11, col: 94, row: 11 }),
            capabilities: () => bareCapabilities(),
            // `presentShoes` / `presentKeys` read the loaded cavern's entity list, and a
            // cavern that is not loaded is not known to be anything (main.ts:504-513).
            shoePresent: (mapId, col, row, shoe) => (mapId !== 11 && mapId !== 12)
                || NAV_ACCESSORIES[mapId]!.some(
                    (a) => a.col === col && a.row === row && a.shoe === shoe),
            keyPresent: (mapId, col, row, kind) => (mapId !== 11 && mapId !== 12)
                || NAV_KEYS[mapId]!.some((k) => k.col === col && k.row === row && k.kind === kind),
        });
        h.screen.displayMapId = 12;
        await h.screen.choose(192, 17);

        expect(h.picked(), 'the journey exists and the screen found it').toHaveLength(1);
        const route = h.picked()[0] as NavRoute;
        expect(route.crossesSlopes, 'and it is not the one over the slope').toBe(false);
        expect(route.equipment.map((e) => e.label), 'no pair he does not own is asked for')
            .not.toContain('silkarn');
        expect(route.equipment.map((e) => e.label)).not.toContain('feruza');
        // The three legs the player named, in the order they have to be in: the pair,
        // then the key, then the door the key opens.
        const shoeNode = nodeOf(store, 11, 208, 26);
        const keyNode = nodeOf(store, 12, 97, 15);
        const atPair = route.points.findIndex((p) => p.mapId === 11 && p.node === shoeNode);
        const atKey = route.points.findIndex((p) => p.mapId === 12 && p.node === keyNode);
        expect(atPair, 'walks over the Pirika pair').toBeGreaterThan(0);
        expect(atKey, 'and collects the key at mp51 (101,15)').toBeGreaterThan(0);
        expect(route.keysSpent.ordinary, 'and spends it on a closed door').toBe(1);
        expect(route.hops.some(
            (hop) => hop.from.mapId === 11 && hop.from.col === 131 && hop.from.row === 54,
        ), 'through the door at mp50 (132,54)').toBe(true);
        expect(route.crossesAggressiveGround, 'which is what the pair is for').toBe(true);
    }, 120_000);

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
        // Boss arenas are passages now, so nearly every cavern reaches nearly
        // every other: 29 is the widest set (from mp10). At 672px that is a 23px
        // slot, and the labels have to fit in it — a full "MP80" is five
        // characters and ran together into one unreadable line across the top.
        const widest = Math.max(...NAV_MAPS.map((m) => NAV_REACHABLE[m.id]!.length));
        expect(widest).toBe(29);
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
        // 29 of the 31: every boss arena is now a passage, so walking into one
        // carries the route into the cavern its exit opens onto. Only mp73, whose
        // post-boss door opens onto a town, and mpa0 stay out.
        expect(NAV_REACHABLE[0]).toHaveLength(29);
        expect(NAV_REACHABLE[0]).not.toContain(21);
        expect(NAV_REACHABLE[0]).not.toContain(30);
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

        const framesOf = (screen: MapScreen): number[] => {
            const seen = captureDoorBlits();
            screen.draw(0);
            vi.restoreAllMocks();
            return seen.map((b) => b.sx);
        };
        const asShipped = framesOf(mixed.screen);
        const open = framesOf(allOpen.screen);
        const shut = framesOf(allShut.screen);

        expect(new Set(asShipped).size).toBeGreaterThan(0);
        expect(asShipped).not.toEqual(open);
        expect(asShipped).not.toEqual(shut);
        // Both ends of the strip are represented, which is the point of asking.
        expect(open.some((sx) => !shut.includes(sx))).toBe(true);
        expect(shut.some((sx) => !open.includes(sx))).toBe(true);
    }, 120000);

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

    it('shows a transient message instead of the hint line while one is set', async () => {
        // The hint line is drawn every frame; a failure message replaces it only
        // for its lifetime, which is why it is drawn on top rather than stored.
        // Driving a real refusal is the whole point — the old version drew a frame
        // with no message set and asserted the *absence* of the thing under test.
        const seen: string[] = [];
        const h = harness({ text: (k: string) => k });
        const cell = unreachableCell(h.screen);
        h.draw(0);
        await h.screen.choose(cell.col, cell.row);
        const spy = vi.spyOn(CTX, 'fillText').mockImplementation(((t: string) => {
            seen.push(t);
        }) as never);
        h.draw(16);
        spy.mockRestore();
        expect(seen).not.toContain('map.hints');
        expect(seen[seen.length - 1], 'the refusal is the last line drawn')
            .toBe('map.noPath');
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
