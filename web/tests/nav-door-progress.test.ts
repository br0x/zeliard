/**
 * nav-door-progress.test.ts — where the reveal is anchored when a route leaves the
 * map and comes back.
 *
 * A route that goes in through a door to find something and comes back out visits
 * the hero's map twice. The anchor used to search the whole point list for his
 * cell, find the *later* visit, and start the reveal on the way out of a door he
 * had never entered — the chevrons then came out of the entrance at full strength
 * and read as "keep walking past it".
 */
import { describe, expect, it } from 'vitest';

import { PathGuide } from '../src/engine/nav/path-guide.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import type { NavGraphStore, NavPoint, NavRoute } from '../src/engine/nav/pathfinder.js';

const GOAL = { mapId: 0, col: 10, row: 12 };

/**
 * Out through the door at map 0 (12,10), across map 1, and back out at
 * map 0 (12,12) — the shape of a trip that goes in for a key.
 */
function outAndBack(): NavRoute {
    const points: NavPoint[] = [
        { mapId: 0, col: 10, row: 10, node: 0 },
        { mapId: 0, col: 11, row: 10, node: 1 },
        { mapId: 0, col: 12, row: 10, node: 2 },
        { mapId: 1, col: 3, row: 10, node: 3 },
        { mapId: 1, col: 4, row: 10, node: 4 },
        { mapId: 0, col: 12, row: 12, node: 5 },
        { mapId: 0, col: 11, row: 12, node: 6 },
        { mapId: 0, col: 10, row: 12, node: 7 },
    ];
    return {
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
}

/**
 * A guide whose store answers nothing, so a tick can anchor the reveal without a
 * search. `needsReplan` returns the moment `peek` comes up empty.
 */
function guideAt(hero: { mapId: number; col: number; row: number }): PathGuide {
    return new PathGuide({
        store: { peek: () => null } as unknown as NavGraphStore,
        heroPosition: () => hero,
        capabilities: bareCapabilities,
    });
}

describe('the anchor when a route leaves the map and comes back', () => {
    it('does not jump to the way out when the hero misses the door', () => {
        // He walked left past the entrance without going in, and is now standing on
        // a cell the *return* leg also uses. Finding that cell put the anchor on the
        // far side of the door and drew the way out at full strength.
        const guide = guideAt({ mapId: 0, col: 11, row: 12 });
        guide.setRoute(outAndBack(), GOAL);
        guide.update(1000);
        expect(guide.remaining()[0], 'the anchor stays before the door')
            .toMatchObject({ mapId: 0, col: 10, row: 10 });
        expect(guide.hasRoute).toBe(true);
    });

    it('still walks the anchor along the way in', () => {
        for (const [col, row, want] of [
            [10, 10, { col: 10, row: 10 }],
            [11, 10, { col: 11, row: 10 }],
            [12, 10, { col: 12, row: 10 }],
        ] as const) {
            const guide = guideAt({ mapId: 0, col, row });
            guide.setRoute(outAndBack(), GOAL);
            guide.update(1000);
            expect(guide.remaining()[0], `standing on (${col},${row})`)
                .toMatchObject(want);
        }
    });

    it('carries the anchor across a door he did walk through', () => {
        // The exception: the anchor is left on the map he has just left, and the
        // point he is standing on is the arrival cell. Skipping the tail of the old
        // map is what finds him.
        const guide = guideAt({ mapId: 1, col: 3, row: 10 });
        guide.setRoute(outAndBack(), GOAL);
        guide.update(1000);
        expect(guide.remaining()[0], 'the anchor is the arrival cell')
            .toMatchObject({ mapId: 1, col: 3, row: 10 });
    });
});
