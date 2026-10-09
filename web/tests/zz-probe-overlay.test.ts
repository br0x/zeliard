// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    drawPathOverlay, initPathOverlay, setChevronSheet,
    CHEVRON_FRAME_W, CHEVRON_FRAME_H, CHEVRON_FRAMES, CHEVRON_DESTINATION,
} from '../src/render/path-overlay.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { NavGraphStore, findRoute, type NavRoute, type NavPoint } from '../src/engine/nav/pathfinder.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { TILE_SIZE, VIEW_COLS, VIEW_ROWS } from '../src/config/engine.js';

const LOG = '/tmp/opencode/probe-overlay.log';
const log = (...a: unknown[]) => appendFileSync(LOG, a.map(String).join(' ') + '\n');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function realStore(): NavGraphStore {
    return new NavGraphStore((id) => {
        const meta = NAV_MAP_BY_ID.get(id);
        if (!meta) return null;
        return new Uint8Array(readFileSync(resolve(REPO, `web/public/${meta.mdtPath}`)));
    });
}

interface Draw { x: number; y: number; frame: number; alpha: number }

function slice(route: NavRoute, from: number): NavRoute {
    const points = route.points.slice(from);
    return {
        ...route, points, hops: route.hops.slice(from),
        maps: [...new Set(points.map((p) => p.mapId))],
    };
}

describe('overlay at the mp82 door', () => {
    it('draws the run from mp82 (174,10) to the mp81 key', () => {
        const store = realStore();
        const route = findRoute({
            store, caps: bareCapabilities(),
            start: { mapId: 23, col: 111, row: 21 },
            goal: { mapId: 23, col: 227, row: 34 },
            collectKeys: true, planAccessories: true,
        })!;
        expect(route).not.toBeNull();

        // The entry into mp82 at (174,10) from mp81 (151,16) whose route then
        // walks on to the key: the first such hop (the visit that fetches it).
        let entry = -1;
        for (let i = 1; i < route.points.length; i++) {
            const p = route.points[i]!;
            const q = route.points[i - 1]!;
            if (p.mapId === 25 && p.col === 174 && p.row === 10
                && q.mapId === 24 && q.col === 151 && q.row === 16) { entry = i; break; }
        }
        expect(entry).toBeGreaterThan(0);
        log(`entry index=${entry}`);

        const sliced = slice(route, entry);
        // Cells he walks on mp82 before leaving for mp81, plus the first mp81 cells.
        sliced.points.slice(0, 90).forEach((p, i) => log(`  p[${i}] ${p.mapId}(${p.col},${p.row})`));

        const hero: NavPoint = sliced.points[0]!;
        const here = { ...hero };
        const guide = new PathGuide({
            store,
            heroPosition: () => here,
            capabilities: () => bareCapabilities(),
        });
        guide.setRoute(sliced, sliced.points[sliced.points.length - 1]!);
        guide.update(0);
        log(`remaining=${guide.remaining().length} first=${guide.remaining()[0]?.mapId}:${guide.remaining()[0]?.col},${guide.remaining()[0]?.row}`);

        const drawn: Draw[] = [];
        const ctx = {
            globalAlpha: 1,
            save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
            drawImage(this: { globalAlpha: number }, ...args: unknown[]) {
                drawn.push({
                    x: args[5] as number, y: args[6] as number,
                    frame: Math.floor((args[2] as number) / CHEVRON_FRAME_H) * CHEVRON_FRAMES
                        + Math.floor((args[1] as number) / CHEVRON_FRAME_W),
                    alpha: this.globalAlpha,
                });
            },
        } as unknown as CanvasRenderingContext2D;

        initPathOverlay({
            ctx,
            viewW: () => VIEW_COLS * TILE_SIZE,
            viewH: () => VIEW_ROWS * TILE_SIZE,
            guide,
            viewportLeftCol: () => hero.col - 14,
            viewportTopRow: () => hero.row - 9,
            heroMapId: () => here.mapId,
            mapWidth: () => 240,
            chevrons: null,
        });
        setChevronSheet({
            width: CHEVRON_FRAME_W * CHEVRON_FRAMES, height: CHEVRON_FRAME_H,
        } as HTMLImageElement);
        drawPathOverlay(0);
        log(`placed=${drawn.length}`);
        drawn.forEach((d) => {
            const col = Math.round(d.x / TILE_SIZE - 1 + (hero.col - 14));
            const row = Math.round(d.y / TILE_SIZE + (hero.row - 9));
            log(`  mark col=${col} row=${row} frame=${d.frame === CHEVRON_DESTINATION ? '@' : d.frame} alpha=${d.alpha.toFixed(2)}`);
        });
        expect(true).toBe(true);
    }, 120000);
});
