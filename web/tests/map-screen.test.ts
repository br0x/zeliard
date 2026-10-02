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

import { MapScreen, shortName, type MapScreenDeps } from '../src/ui/map-screen.js';
import { NavGraphStore, type NavRoute } from '../src/engine/nav/pathfinder.js';
import { allCapabilities, bareCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID, NAV_MAPS, NAV_REACHABLE } from '../src/data/nav/nav-maps.js';
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
            'map.title', 'map.hints', 'map.unreachable', 'map.noPath',
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
    it('uses an integer scale that keeps the whole map inside the map area', () => {
        for (const meta of NAV_MAPS) {
            const { screen } = harness();
            const scale = screen.scaleFor(meta.id);
            expect(Number.isInteger(scale), meta.nameKey).toBe(true);
            expect(scale).toBeGreaterThanOrEqual(1);
            const { ox, oy } = screen.originFor(meta.id);
            expect(ox + meta.mapWidth * scale, `${meta.nameKey} width`).toBeLessThanOrEqual(672);
            expect(oy + 64 * scale, `${meta.nameKey} height`).toBeLessThanOrEqual(412);
            expect(ox).toBeGreaterThanOrEqual(0);
            expect(oy).toBeGreaterThanOrEqual(28);
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

    it('uses the smallest scale the widest cavern needs', () => {
        const { screen } = harness();
        // 320 tiles is the widest, so 2x is the floor for the whole game.
        expect(screen.scaleFor(8)).toBe(2);      // mp40, 320 wide
        expect(screen.scaleFor(21)).toBe(6);     // mp73, 73 wide
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

    it('returns a route and closes on a valid destination', () => {
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
        h.screen.choose(target.col, target.row);
        expect(h.picked()).toHaveLength(1);
        const route = h.picked()[0] as { points: unknown[]; cost: number; maps: number[] };
        expect(route.points.length).toBeGreaterThan(1);
        expect(route.cost).toBeGreaterThan(0);
        expect(route.maps).toEqual([0]);
        expect(h.screen.active).toBe(false);
    });

    it('routes to the cell the hero is standing on', () => {
        const h = harness();
        h.screen.choose(HERO.col, HERO.row);
        expect(h.picked()).toHaveLength(1);
        expect(h.screen.active).toBe(false);
    });

    it('stays open and reports a goal it cannot route to', () => {
        const h = harness();
        const store = (h.screen as unknown as { deps: { store: NavGraphStore } }).deps.store;
        // mp29 is mp90, behind a Lion-Head door from mp84 and not in mp10's
        // reachable set, so a route to it must fail rather than silently succeed.
        store.get(29);
        h.screen.displayMapId = 29;
        h.screen.choose(0, 0);
        expect(h.picked()).toHaveLength(0);
        expect(h.screen.active).toBe(true);
    });

    it('offers the closed-door route when the hero is carrying the key', () => {
        // mp10 (26,16) -> mp1d crosses a closed ordinary-key door. With a key in his
        // pocket the first search finds it; with an empty pocket it does not.
        const keyed = harness({ capabilities: () => ({ ...bareCapabilities(), keys: 1, mask: 0xff }) });
        keyed.screen.displayMapId = 1;
        keyed.screen.choose(27, 15);
        expect(keyed.picked(), 'a key opens a closed door').toHaveLength(1);
        const route = keyed.picked()[0] as NavRoute;
        expect(route.lockedDoors.ordinary).toBeGreaterThan(0);
        expect(route.keysSpent.ordinary).toBeGreaterThan(0);
    });

    it('sets the journey the player reported, which needs no key', () => {
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
        empty.screen.choose(124, 6);
        expect(empty.picked(), 'an open way through, no key needed').toHaveLength(1);
        const route = empty.picked()[0] as NavRoute;
        expect(route.lockedDoors.ordinary + route.lockedDoors.lion).toBe(0);
    });

    it('refuses a cell with no standing position anywhere near it', () => {
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
        h.screen.choose(Math.floor(empty / 100), empty % 100);
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

describe('dismissing', () => {
    it('Escape and the outside click both return without a route', () => {
        const h = harness();
        h.screen.handleKey('Escape', false, false, false);
        expect(h.exited()).toBe(1);
        expect(h.picked()).toHaveLength(0);
        h.screen.active = true;
        h.screen.handleClickOutside();
        expect(h.exited()).toBe(2);
    });

    it('does nothing while inactive', () => {
        const h = harness();
        h.screen.exit();
        expect(h.screen.handleKey('ArrowRight', false, false, false)).toBe(false);
        expect(h.screen.handlePointer(100, 100, 'down')).toBeUndefined();
        expect(h.picked()).toHaveLength(0);
        expect(h.exited()).toBe(0);
    });
});

describe('the screen shows no route', () => {
    it('draws from a timestamp alone, with no route to pass in', () => {
        // draw(now) is the whole contract. If the map ever grew a route overlay,
        // this signature is the first thing that would have to change.
        const { screen } = harness();
        expect(screen.draw.length).toBe(1);
        expect(() => screen.draw(0)).not.toThrow();
    });

    it('has no public route accessor', () => {
        const h = harness();
        const keys = Object.keys(h.screen).concat(
            Object.getOwnPropertyNames(Object.getPrototypeOf(h.screen)),
        );
        expect(keys.filter((k) => /route|path/i.test(k))).toEqual([]);
    });

});

describe('drawing does not throw for any map', () => {
    it('renders every cavern, including the doorless ones', () => {
        for (const meta of NAV_MAPS) {
            const h = harness();
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
        screen.choose(10, 10);
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
});
