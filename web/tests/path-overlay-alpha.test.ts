/**
 * path-overlay-alpha.test.ts — how the chevron trail fades.
 *
 * The rule is distance along the route, and the bug this covers is that it was
 * measured along the *drawn* cells instead: whatever the viewport could not see
 * left the counter where it was. Everything past a door is in another room, so
 * every marker after it came out at the opacity of the last chevron before the
 * door — leading to the door and leading from it looked equally solid, which
 * reads as "don't go in".
 *
 * Two rules carry the fix, one per case: another room has no distance to show on
 * this one, so it takes the far end of the fade; everywhere else the fade is a
 * function of the cell's index alone, however many cells before it were off
 * screen when the frame was drawn.
 */
import { describe, expect, it } from 'vitest';

import {
    drawPathOverlay, initPathOverlay, setChevronSheet,
    chevronAlpha,
    CHEVRON_DESTINATION, CHEVRON_FRAME_W, CHEVRON_FRAME_H, CHEVRON_FRAMES,
} from '../src/render/path-overlay.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { TILE_SIZE, VIEW_COLS, VIEW_ROWS } from '../src/config/engine.js';
import type { NavPoint, NavRoute } from '../src/engine/nav/pathfinder.js';

interface Draw {
    x: number;
    y: number;
    frame: number;
    alpha: number;
}

/** A straight walk, one chevron per cell, so the step index is the cell index. */
function walk(mapId: number, cols: number[], row = 10, mapWidth = 240): NavRoute {
    const points: NavPoint[] = cols.map((col, i) => ({ mapId, col, row, node: i }));
    return {
        points,
        hops: points.slice(1).map((to, i) => ({ kind: 0, cost: 1, from: points[i]!, to })),
        cost: points.length - 1,
        keysSpent: { ordinary: 0, lion: 0 },
        keysGained: { ordinary: 0, lion: 0 },
        equipment: [],
        lockedDoors: { ordinary: 0, lion: 0 },
        maps: [mapId],
        crossesAggressiveGround: false,
        crossesSlopes: false,
        usesPlatforms: false,
        usesCurrents: false,
        expanded: points.length - 1,
    };
}

/** A route over an explicit point list — for one that leaves the map and comes back. */
function through(points: NavPoint[], maps: number[]): NavRoute {
    return {
        points,
        hops: points.slice(1).map((to, i) => ({ kind: 0, cost: 1, from: points[i]!, to })),
        cost: points.length - 1,
        keysSpent: { ordinary: 0, lion: 0 },
        keysGained: { ordinary: 0, lion: 0 },
        equipment: [],
        lockedDoors: { ordinary: 0, lion: 0 },
        maps,
        crossesAggressiveGround: false,
        crossesSlopes: false,
        usesPlatforms: false,
        usesCurrents: false,
        expanded: points.length - 1,
    };
}

/**
 * Out through the door at map 0 (12,10), across map 1, and back out at
 * map 0 (12,12) — a trip that goes in for a key and returns on the same row
 * it went in on, shifted here so the two legs can be told apart.
 */
function outAndBack(): NavRoute {
    return through([
        { mapId: 0, col: 10, row: 10, node: 0 },
        { mapId: 0, col: 11, row: 10, node: 1 },
        { mapId: 0, col: 12, row: 10, node: 2 },
        { mapId: 1, col: 3, row: 10, node: 3 },
        { mapId: 1, col: 4, row: 10, node: 4 },
        { mapId: 0, col: 12, row: 12, node: 5 },
        { mapId: 0, col: 11, row: 12, node: 6 },
        { mapId: 0, col: 10, row: 12, node: 7 },
    ], [0, 1]);
}


/** Draw one route and report the alpha each mark was drawn with, in order. */
function draw(route: NavRoute, at: { heroMapId: number; left: number; top: number }): Draw[] {
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
    const guide = new PathGuide({
        store: null as never,
        heroPosition: () => null,
        capabilities: () => null as never,
    });
    guide.setRoute(route, route.points[route.points.length - 1]!);
    initPathOverlay({
        ctx,
        viewW: () => VIEW_COLS * TILE_SIZE,
        viewH: () => VIEW_ROWS * TILE_SIZE,
        guide,
        viewportLeftCol: () => at.left,
        viewportTopRow: () => at.top,
        heroMapId: () => at.heroMapId,
        mapWidth: () => 240,
        chevrons: null,
    });
    setChevronSheet({
        width: CHEVRON_FRAME_W * CHEVRON_FRAMES,
        height: CHEVRON_FRAME_H,
    } as HTMLImageElement);
    drawPathOverlay(0);
    return drawn;
}

describe('the opacity of a chevron', () => {
    it('fades by how far along the route it is, even when the cells before it were off screen', () => {
        // The route starts eight cells past the viewport's left edge and walks into
        // it. Those eight are drawn as a marker on the border, and they still count:
        // the first cell the eye can actually see is the ninth, so it comes in at
        // nine rather than at full strength as if the line began there.
        const seen = draw(walk(0, [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105]), {
            heroMapId: 0, left: 100, top: 0,
        });
        // The destination ring is drawn at full strength by design — it is the one
        // mark that has to stay findable however far off the goal is — so it is not
        // part of the fade.
        const onScreen = seen.filter(
            (d) => d.y === 10 * TILE_SIZE && d.frame !== CHEVRON_DESTINATION,
        );
        expect(onScreen.length, 'the walk reaches the viewport').toBeGreaterThan(3);
        // Cells 90..98 sit left of the viewport (the normalized column wraps them off
        // screen), so they are drawn as border markers — and they still count. The
        // first cell the eye can see is the tenth of the route, not the first.
        expect(onScreen[0]!.alpha, 'cell 10 of the route')
            .toBeCloseTo(chevronAlpha(9), 5);
        expect(onScreen[0]!.alpha, 'and it is not full strength').toBeLessThan(1);
        // The far end of the same walk keeps fading rather than holding the first
        // cell's brightness all the way along.
        expect(onScreen[onScreen.length - 1]!.alpha)
            .toBeLessThan(onScreen[0]!.alpha);
    });

    it('sends the room beyond a door to the far end of the fade', () => {
        // Four cells in the hero's own room, then the route crosses into another:
        // those last three are drawn as markers on the border, and they must say only
        // "it leaves that way" — not repeat the brightness of the steps that led to
        // the door.
        const before = [0, 1, 2, 3];
        const after = [0, 1, 2, 3];
        const points: NavPoint[] = [
            ...before.map((col, i) => ({ mapId: 0, col, row: 10, node: i })),
            ...after.map((col, i) => ({ mapId: 1, col, row: 10, node: before.length + i })),
        ];
        const route: NavRoute = {
            points,
            hops: points.slice(1).map((to, i) => ({ kind: 0, cost: 1, from: points[i]!, to })),
            cost: points.length - 1,
            keysSpent: { ordinary: 0, lion: 0 },
            keysGained: { ordinary: 0, lion: 0 },
            equipment: [],
            lockedDoors: { ordinary: 0, lion: 0 },
            maps: [0, 1],
            crossesAggressiveGround: false,
            crossesSlopes: false,
            usesPlatforms: false,
            usesCurrents: false,
            expanded: points.length - 1,
        };
        const seen = draw(route, { heroMapId: 0, left: 0, top: 0 });
        expect(seen.length, 'the whole route draws something').toBeGreaterThan(4);
        const own = seen.slice(0, 4);
        const beyond = seen.slice(4);
        expect(beyond.length, 'the three cells past the door').toBe(3);
        expect(own.every((d) => d.alpha === 1), 'inside the room the line is solid')
            .toBe(true);
        expect(beyond.every((d) => d.alpha === chevronAlpha(15)),
            'past the door it is as faded as fifteen cells away').toBe(true);
    });

    it('keeps the way back out of an un-entered door at the far end of the fade', () => {
        // The route leaves this map for a key and comes back, and the hero is still
        // on the way in — he has missed the door by a few tiles. The return leg sits
        // on his own map and his own row, at real positions, so the ordinary fade
        // would render it as the next steps to take: a full-strength line running
        // out of an entrance he never entered.
        const seen = draw(outAndBack(), { heroMapId: 0, left: 0, top: 0 });
        const onRow = (row: number) => seen.filter(
            (d) => d.frame !== CHEVRON_DESTINATION && d.y === row * TILE_SIZE,
        );
        const inRoom = onRow(10);
        const wayOut = onRow(12);
        expect(inRoom.length, 'the walk up to the door').toBe(3);
        expect(wayOut.length, 'the way back out of it').toBe(2);
        expect(inRoom.every((d) => d.alpha === 1), 'up to the door the line is solid')
            .toBe(true);
        expect(wayOut.every((d) => d.alpha === chevronAlpha(15)),
            'out of a door he never entered is as faded as fifteen cells away')
            .toBe(true);
    });
});
