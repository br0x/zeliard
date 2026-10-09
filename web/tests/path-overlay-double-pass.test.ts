/**
 * path-overlay-double-pass.test.ts — a route that walks the same tiles twice.
 *
 * The Thread of Yaga is a list of *visits*, not a set of cells. Fetching a key
 * across a cavern and spending it back the way he came draws the outbound run of
 * tiles and the inbound one on top of each other, cell for cell: mp82's row-35
 * corridor is walked from the portal at (88,35) down to the key at (26,47) and
 * then straight back through the same door.
 *
 * The overlay painted in draw order, so the second pass won. The line at the
 * hero's feet pointed back out the door he had not opened, and because the
 * second pass sits a hundred cells further along the route it arrived at the far
 * end of the fade — which took the outbound chevrons down with it. The player's
 * report was that the path to the key disappeared and only the way back to the
 * door was left: both halves are this one defect.
 *
 * The first visit is always the one ahead of him, because `remaining()` is
 * ordered. So the first paint wins, and the line turns round on its own once the
 * anchor has moved past the outbound run — which is the key being picked up.
 */
import { describe, expect, it } from 'vitest';

import {
    drawPathOverlay, initPathOverlay, setChevronSheet,
    CHEVRON_RIGHT, CHEVRON_LEFT, CHEVRON_DESTINATION,
    CHEVRON_FRAME_W, CHEVRON_FRAME_H, CHEVRON_FRAMES,
} from '../src/render/path-overlay.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { NavGraphStore } from '../src/engine/nav/pathfinder.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import { TILE_SIZE, VIEW_COLS, VIEW_ROWS } from '../src/config/engine.js';
import type { NavPoint, NavRoute } from '../src/engine/nav/pathfinder.js';

interface Draw {
    x: number;
    y: number;
    frame: number;
    alpha: number;
}

const ROW = 10;
const MAP_WIDTH = 240;

/**
 * Out over `outCols`, then straight back over the same cells and one further on.
 *
 * It ends one cell past where he stands, so the guide does not read the last
 * point as an arrival and clear the route under the test.
 */
function outAndBack(outCols: number[], backCols: number[]): NavRoute {
    const points: NavPoint[] = [...outCols, ...backCols]
        .map((col, i) => ({ mapId: 0, col, row: ROW, node: i }));
    return {
        points,
        hops: points.slice(1).map((to, i) => ({ kind: 0, cost: 1, from: points[i]!, to })),
        cost: points.length - 1,
        keysSpent: { ordinary: 0, lion: 0 },
        keysGained: { ordinary: 0, lion: 0 },
        equipment: [],
        lockedDoors: { ordinary: 0, lion: 0 },
        maps: [0],
        crossesAggressiveGround: false,
        crossesSlopes: false,
        usesPlatforms: false,
        usesCurrents: false,
        expanded: points.length - 1,
    };
}

/**
 * Draw the route from `hero` and report every mark, in paint order.
 *
 * `progress` is left wherever the guide's own anchor puts it, so standing the
 * hero at the turnaround is what a key in his pocket looks like.
 */
function draw(route: NavRoute, hero: NavPoint): Draw[] {
    const drawn: Draw[] = [];
    const ctx = {
        globalAlpha: 1,
        save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
        drawImage(this: { globalAlpha: number }, ...args: unknown[]) {
            const sx = args[1] as number;
            const sy = args[2] as number;
            drawn.push({
                x: args[5] as number,
                y: args[6] as number,
                frame: Math.floor(sy / CHEVRON_FRAME_H) * CHEVRON_FRAMES
                    + Math.floor(sx / CHEVRON_FRAME_W),
                alpha: this.globalAlpha,
            });
        },
    } as unknown as CanvasRenderingContext2D;

    const here = { ...hero };
    // A store that answers "no graph here", which keeps `needsReplan` from
    // asking for a search this test has no data to run.
    const guide = new PathGuide({
        store: new NavGraphStore(() => null),
        heroPosition: () => here,
        capabilities: () => bareCapabilities(),
    });
    guide.setRoute(route, route.points[route.points.length - 1]!);
    guide.update(0);

    initPathOverlay({
        ctx,
        viewW: () => VIEW_COLS * TILE_SIZE,
        viewH: () => VIEW_ROWS * TILE_SIZE,
        guide,
        viewportLeftCol: () => 0,
        viewportTopRow: () => 0,
        heroMapId: () => hero.mapId,
        mapWidth: () => MAP_WIDTH,
        chevrons: null,
    });
    setChevronSheet({
        width: CHEVRON_FRAME_W * CHEVRON_FRAMES,
        height: CHEVRON_FRAME_H,
    } as HTMLImageElement);
    drawPathOverlay(0);
    return drawn;
}

/** The mark left on one cell, in paint order (the last one is what shows). */
function onCell(drawn: Draw[], col: number): Draw | undefined {
    const x = (col + 1) * TILE_SIZE;
    return drawn.filter((d) => d.x === x && d.y === ROW * TILE_SIZE
        && d.frame !== CHEVRON_DESTINATION).pop();
}

describe('a route that walks the same corridor twice', () => {
    it('leads to the key on the outbound run, not back out the door', () => {
        // 20 → 16 for the key, then 16 → 20 over the very same cells.
        const route = outAndBack([20, 19, 18, 17, 16], [17, 18, 19, 20, 21]);
        const seen = draw(route, { mapId: 0, col: 20, row: ROW, node: 0 });

        for (const col of [20, 19, 18, 17]) {
            const mark = onCell(seen, col);
            expect(mark, `cell ${col} is on the line`).toBeDefined();
            expect(mark!.frame, `cell ${col} points along the run to the key`)
                .toBe(CHEVRON_LEFT);
            expect(mark!.alpha, `cell ${col} is not at the far end of the fade`)
                .toBeGreaterThan(0.5);
        }
        // Only the turnaround faces the other way, because there the next step
        // really is back the way he came.
        expect(onCell(seen, 16)!.frame).toBe(CHEVRON_RIGHT);
    });

    it('turns round once he has the key, so the way back is what is drawn', () => {
        const route = outAndBack([20, 19, 18, 17, 16], [17, 18, 19, 20, 21]);
        const seen = draw(route, { mapId: 0, col: 16, row: ROW, node: 4 });

        for (const col of [17, 18, 19, 20]) {
            const mark = onCell(seen, col);
            expect(mark, `cell ${col} is on the line`).toBeDefined();
            expect(mark!.frame, `cell ${col} points back out through the door`)
                .toBe(CHEVRON_RIGHT);
        }
    });
});
