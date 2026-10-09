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
 *
 * The mirror of that rule is the door. The anchor searched *only* forward, so a
 * hero who walked straight back out of a door he had just used left it sitting on
 * the far side — on a map he was no longer standing in — where `remaining()`
 * begins on a foreign point and the overlay draws nothing at all. Re-entering the
 * same door did not bring the chevrons back, which is the player's third defect.
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
function guideFor(hero: { mapId: number; col: number; row: number }, route = downAndBackUp()): {
    guide: PathGuide;
    moveTo: (col: number, row: number, mapId?: number) => void;
    tick: () => void;
} {
    const here = { ...hero };
    const guide = new PathGuide({
        store: new NavGraphStore(() => null),
        heroPosition: () => ({ ...here }),
        capabilities: () => bareCapabilities(),
    });
    guide.setRoute(route, route.points[route.points.length - 1]!);
    let now = 1_000;
    return {
        guide,
        moveTo: (col, row, mapId) => {
            here.col = col;
            here.row = row;
            if (mapId !== undefined) here.mapId = mapId;
        },
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

/** Two caverns joined by one door, and then — in `throughTheDoorAndBack` — joined again. */
function throughTheDoor(mapsAfterTheDoor: NavPoint[]): NavRoute {
    const points: NavPoint[] = [
        { mapId: 0, col: 5, row: 10, node: 0 },
        { mapId: 0, col: 6, row: 10, node: 1 },
        ...mapsAfterTheDoor,
    ];
    return {
        points,
        hops: points.slice(1).map((to, i) => ({ kind: 0, cost: 1, from: points[i]!, to })),
        cost: points.length - 1,
        keysSpent: { ordinary: 0, lion: 0 },
        keysGained: { ordinary: 0, lion: 0 },
        equipment: [],
        lockedDoors: { ordinary: 0, lion: 0 },
        maps: [...new Set(points.map((p) => p.mapId))],
        crossesAggressiveGround: false,
        crossesSlopes: false,
        usesPlatforms: false,
        usesCurrents: false,
        expanded: 0,
    };
}

/** One crossing of the door, and four rooms past it. */
const acrossTheDoor = (): NavRoute => throughTheDoor([
    { mapId: 1, col: 7, row: 10, node: 2 },
    { mapId: 1, col: 8, row: 10, node: 3 },
    { mapId: 1, col: 9, row: 10, node: 4 },
    { mapId: 1, col: 10, row: 10, node: 5 },
]);

/** The same door crossed a *second* time, later in the route. */
const backThroughTheDoor = (): NavRoute => throughTheDoor([
    { mapId: 1, col: 7, row: 10, node: 2 },
    { mapId: 1, col: 8, row: 10, node: 3 },
    { mapId: 0, col: 30, row: 10, node: 4 },
    { mapId: 0, col: 31, row: 10, node: 5 },
    { mapId: 1, col: 32, row: 10, node: 6 },
]);

describe('a hero who walks back out of the door the route took him through', () => {
    it('follows him back to the room he is standing in', () => {
        const { guide, moveTo, tick } = guideFor(
            { mapId: 0, col: 5, row: 10 },
            acrossTheDoor(),
        );
        tick();
        moveTo(6, 10);
        tick();
        moveTo(7, 10, 1);
        tick();
        expect(guide.remaining()[0], 'the crossing puts the anchor inside')
            .toMatchObject({ mapId: 1, col: 7, row: 10 });

        // Straight back out again, before taking a single step in the far room.
        moveTo(6, 10, 0);
        tick();
        expect(guide.remaining()[0], 'the anchor comes back out with him')
            .toMatchObject({ mapId: 0, col: 6, row: 10 });
        expect(guide.remaining().length, 'and the way on is still ahead of him')
            .toBeGreaterThan(1);

        // And going in again finds it, rather than leaving him with nothing drawn.
        moveTo(7, 10, 1);
        tick();
        expect(guide.remaining()[0], 're-entering puts the anchor back inside')
            .toMatchObject({ mapId: 1, col: 7, row: 10 });
    });

    it('takes the visit he is near, not the one the route reaches later', () => {
        const { guide, moveTo, tick } = guideFor(
            { mapId: 0, col: 5, row: 10 },
            backThroughTheDoor(),
        );
        tick();
        moveTo(6, 10);
        tick();
        moveTo(7, 10, 1);
        tick();
        moveTo(6, 10, 0);
        tick();
        expect(guide.remaining()[0], 'the far visit of his room is not where he is')
            .toMatchObject({ mapId: 0, col: 6, row: 10 });
        expect(guide.remaining()[1], 'so the door is what the trail points at')
            .toMatchObject({ mapId: 1, col: 7, row: 10 });
    });
});
