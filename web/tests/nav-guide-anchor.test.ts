/**
 * nav-guide-anchor.test.ts — the anchor may not jump onto a later visit of his cell.
 *
 * A route is a list of *visits*, and a visit can pass the same cell twice without
 * leaving the map: down a rope and straight back up it. The anchor searched
 * forward for the hero's own cell and took the first hit, which for a cell the
 * route only reaches on the way **back** is the ascent — a hundred points past
 * where he is standing.
 *
 * That is what the player hit on the rope at mp82: the chevrons went west, down
 * the rope, and halfway they reversed — up the shaft and east to the door. The
 * trail had not turned round; the anchor had leapt onto the return leg, so the
 * descent he was climbing sat *behind* it and was never drawn.
 *
 * The rule under test: the search stops a bounded distance past where the visit
 * begins, so a cell that appears only much later is not his position, it is a
 * coincidence.
 */
import { describe, expect, it } from 'vitest';

import { NavGraphStore } from '../src/engine/nav/pathfinder.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import type { NavPoint, NavRoute } from '../src/engine/nav/pathfinder.js';

/**
 * An approach, a jump to the rope's mouth, forty rows down, thirty-nine back up,
 * and then east past (10,10) — the one cell in the journey that appears only on
 * the return.
 */
function downAndBackUp(): NavRoute {
    const points: NavPoint[] = [
        { mapId: 0, col: 13, row: 10, node: 0 },
        { mapId: 0, col: 12, row: 10, node: 1 },
    ];
    for (let row = 11; row <= 50; row++) points.push({ mapId: 0, col: 10, row, node: points.length });
    for (let row = 49; row >= 11; row--) points.push({ mapId: 0, col: 10, row, node: points.length });
    points.push({ mapId: 0, col: 10, row: 10, node: points.length });
    points.push({ mapId: 0, col: 9, row: 10, node: points.length });
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
        expanded: 0,
    };
}

/** The guide only needs somewhere to ask about platforms; the route is handed over. */
function guideFor(hero: { mapId: number; col: number; row: number }): {
    guide: PathGuide;
    moveTo: (col: number, row: number) => void;
    tick: () => void;
} {
    const here = { ...hero };
    const guide = new PathGuide({
        store: new NavGraphStore(() => null),
        heroPosition: () => ({ ...here }),
        capabilities: () => bareCapabilities(),
    });
    guide.setRoute(downAndBackUp(), { mapId: 0, col: 9, row: 10 });
    let now = 1_000;
    return {
        guide,
        moveTo: (col, row) => { here.col = col; here.row = row; },
        tick: () => { now += 100; guide.update(now); },
    };
}

describe('the anchor stays on the leg the hero is actually walking', () => {
    it('does not let the return leg claim the rope the descent has not finished', () => {
        const { guide, moveTo, tick } = guideFor({ mapId: 0, col: 13, row: 10 });
        tick();
        moveTo(12, 10);
        tick();
        expect(guide.remaining()[0], 'the anchor tracks him to the take-off')
            .toMatchObject({ col: 12, row: 10 });

        // The jump lands at the rope's mouth, one row above where the route starts
        // going down. (10,10) is not on the descent at all — it is the cell the
        // route passes when it comes back east, sixty points later.
        moveTo(10, 10);
        tick();
        expect(guide.remaining()[0], 'the later occurrence is not where he is')
            .toMatchObject({ col: 12, row: 10 });
        expect(guide.remaining()[1], 'so the descent is still what is drawn next')
            .toMatchObject({ col: 10, row: 11 });
    });

    it('keeps following him down once he is on the route again', () => {
        const { guide, moveTo, tick } = guideFor({ mapId: 0, col: 10, row: 11 });
        tick();
        expect(guide.remaining()[0]).toMatchObject({ col: 10, row: 11 });

        moveTo(10, 15);
        tick();
        expect(guide.remaining()[0], 'a fall of four rows moves the anchor four')
            .toMatchObject({ col: 10, row: 15 });

        moveTo(10, 40);
        tick();
        expect(guide.remaining()[0], 'and it keeps up all the way down')
            .toMatchObject({ col: 10, row: 40 });
    });
});
