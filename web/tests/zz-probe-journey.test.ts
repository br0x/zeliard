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
import { NavGraphStore, findRoute, type NavRoutePlan, type NavPoint } from '../src/engine/nav/pathfinder.js';
import { bareCapabilities, type HeroCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { TILE_SIZE, VIEW_COLS, VIEW_ROWS } from '../src/config/engine.js';

const LOG = '/tmp/opencode/probe-journey.log';
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

const KEY_CELLS = new Set(['25:26:47', '24:125:36']);
const LOCKED_DOORS = new Set(['23:57:16', '24:236:5']);

describe('the whole journey with replans', () => {
    it('keeps chevrons in front of him', () => {
        const store = realStore();
        const route = findRoute({
            store, caps: bareCapabilities(),
            start: { mapId: 23, col: 111, row: 21 },
            goal: { mapId: 23, col: 227, row: 34 },
            collectKeys: true, planAccessories: true,
        })!;
        expect(route).not.toBeNull();

        const collected = new Set<string>();
        let keys = 0;
        const caps = (): HeroCapabilities => ({ ...bareCapabilities(), keys });
        const keyPresent = (mapId: number, col: number, row: number): boolean =>
            !collected.has(`${mapId}:${col}:${row}`);
        const plan: NavRoutePlan = {
            collectKeys: true, planAccessories: true, keyPresent,
            doorOpen: () => false,
        };

        const hero: NavPoint = { ...route.points[0]! };
        const guide = new PathGuide({
            store,
            heroPosition: () => hero,
            capabilities: caps,
            isIdle: () => true,
        });
        guide.setRoute(route, route.points[route.points.length - 1]!, plan);

        const ctx = {
            globalAlpha: 1,
            save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
            drawImage(this: { globalAlpha: number }, ...args: unknown[]) {
                draws.push({
                    x: args[5] as number, y: args[6] as number,
                    frame: Math.floor((args[2] as number) / CHEVRON_FRAME_H) * CHEVRON_FRAMES
                        + Math.floor((args[1] as number) / CHEVRON_FRAME_W),
                    alpha: this.globalAlpha,
                });
            },
        } as unknown as CanvasRenderingContext2D;
        const draws: Draw[] = [];
        setChevronSheet({
            width: CHEVRON_FRAME_W * CHEVRON_FRAMES, height: CHEVRON_FRAME_H,
        } as HTMLImageElement);

        let now = 0;
        let tick = 0;
        let lastAnchor = 0;
        const anomalies: string[] = [];
        while (tick++ < 4000) {
            now += 600;
            guide.update(now);
            const rem = guide.remaining();
            if (rem.length === 0) { log(`tick ${tick} ARRIVED/CLEARED keys=${keys}`); break; }

            const anchor = rem[0]!;
            if (Math.abs((guide as unknown as { progress: number }).progress - lastAnchor) > 60) {
                log(`tick ${tick} ANCHOR JUMP ${lastAnchor} -> ${(guide as unknown as { progress: number }).progress}`
                    + ` hero=${hero.mapId}:${hero.col},${hero.row}`);
            }
            lastAnchor = (guide as unknown as { progress: number }).progress;

            // Draw every tick on mp82, every 4th elsewhere.
            const draw = hero.mapId === 25 || tick % 4 === 0;
            let onMap = 0;
            let onMapAhead = 0;
            if (draw) {
                for (const p of rem) if (p.mapId === hero.mapId) { onMapAhead++; }
                draws.length = 0;
                initPathOverlay({
                    ctx,
                    viewW: () => VIEW_COLS * TILE_SIZE,
                    viewH: () => VIEW_ROWS * TILE_SIZE,
                    guide,
                    viewportLeftCol: () => hero.col - 14,
                    viewportTopRow: () => hero.row - 9,
                    heroMapId: () => hero.mapId,
                    mapWidth: () => NAV_MAP_BY_ID.get(hero.mapId)?.mapWidth ?? 240,
                    chevrons: null,
                });
                setChevronSheet({
                    width: CHEVRON_FRAME_W * CHEVRON_FRAMES, height: CHEVRON_FRAME_H,
                } as HTMLImageElement);
                drawPathOverlay(now);
                onMap = draws.filter((d) => d.frame !== CHEVRON_DESTINATION).length;
                const missing = onMapAhead > 0 && onMap === 0;
                const atDoor = hero.mapId === 25 && hero.col === 174 && hero.row === 10;
                if (missing || atDoor) {
                    const firsts = rem.slice(0, 4).map((p) => `${p.mapId}:(${p.col},${p.row})`).join(' ');
                    const line = `tick ${tick} hero=${hero.mapId}:(${hero.col},${hero.row})`
                        + ` anchor=${lastAnchor}/${rem.length} first=[${firsts}]`
                        + ` onMapAhead=${onMapAhead} marks=${onMap}`
                        + (missing ? ' ** MISSING **' : '');
                    log(line);
                    if (missing) anomalies.push(line);
                }
            }

            // Walk one cell along whatever route he now has.
            const stepTo = rem.length > 1 ? rem[1]! : rem[0]!;
            if (stepTo.mapId !== hero.mapId) {
                log(`tick ${tick} CROSS ${hero.mapId}:(${hero.col},${hero.row})`
                    + ` -> ${stepTo.mapId}:(${stepTo.col},${stepTo.row}) keys=${keys}`);
                const fromKey = `${hero.mapId}:${hero.col}:${hero.row}`;
                if (LOCKED_DOORS.has(fromKey)) keys = Math.max(0, keys - 1);
            }
            hero.mapId = stepTo.mapId;
            hero.col = stepTo.col;
            hero.row = stepTo.row;
            if (hero.mapId === 25) {
                log(`tick ${tick} on mp82 (${hero.col},${hero.row})`);
            }
            const cellKey = `${hero.mapId}:${hero.col}:${hero.row}`;
            if (KEY_CELLS.has(cellKey) && !collected.has(cellKey)) {
                collected.add(cellKey);
                keys++;
                log(`tick ${tick} KEY picked ${cellKey} keys=${keys}`);
            }
        }
        log(`done keys=${keys} collected=[${[...collected].join(' ')}] anomalies=${anomalies.length}`);
        expect(anomalies.length).toBe(0);
    }, 600000);
});
