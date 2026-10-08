/**
 * nav-route-cases.test.ts — named routes, checked against the terrain.
 *
 * The unit suites check that the graph is self-consistent. They cannot check that
 * a route is *sane*, because "sane" is a property of a particular journey. These
 * are those: a handful of real trips through real caverns, asserted to exist, to
 * use the mechanics the level was built around, and — the check that caught the
 * worst bug — never to pass through solid rock.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NavGraphStore, findRoute, type NavHop, type NavRoute } from '../src/engine/nav/pathfinder.js';
import { allCapabilities, bareCapabilities, type HeroCapabilities } from '../src/engine/nav/capabilities.js';
import { NavTileClassifier } from '../src/engine/nav/attributes.js';
import { flagsAt } from '../src/engine/nav/geometry.js';
import { JumpModel, LANDING_STRIDE, STEER_ALL } from '../src/engine/nav/jump.js';
import { EDGE, EDGE_NAMES, NAV, CAP, KEY_ORDINARY, blocksBody } from '../src/engine/nav/types.js';
import { nodeAt, type NavEdge } from '../src/engine/nav/nav-graph.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { isCarriedHop } from '../src/render/path-overlay.js';
import { NAV_MAP_BY_ID, NAV_MAPS, NAV_REACHABLE } from '../src/data/nav/nav-maps.js';
import { NAV_KEYS } from '../src/data/nav/nav-keys.js';
import { NAV_BOSS_EXITS, PORTALS } from '../src/data/nav/nav-portals.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const store = new NavGraphStore((id) => {
    const meta = NAV_MAP_BY_ID.get(id);
    if (!meta) return null;
    return new Uint8Array(readFileSync(resolve(REPO, `web/public/${meta.mdtPath}`)));
});

/** Is this map cell solid, per the engine's own predicate? */
function solidIn(mapId: number, col: number, row: number): boolean {
    const grid = store.gridOf(mapId)!;
    const flags = NavTileClassifier.forMap(mapId).classify(
        grid.tiles[((row & 63) * grid.mapWidth) + wrap(col, grid.mapWidth)]!,
    );
    return (flags & NAV.BLOCK_HEAD) !== 0;
}
function wrap(v: number, w: number): number {
    return ((v % w) + w) % w;
}

/**
 * The cells one hop flies through, col/row pairs.
 *
 * Works for jumps and for falls: both are the same descent, a fall simply with no
 * rise. Rope nodes never ask — `jump_press_handler` returns while ON_ROPE_FLAGS is
 * set (dungeon-hero.ts:322), so a hero on a rope cannot jump at all.
 */
const jumpModels = new Map<number, JumpModel>();

function flightCells(hop: NavHop): Int32Array {
    let model = jumpModels.get(hop.from.mapId);
    if (!model) {
        model = new JumpModel(store.gridOf(hop.from.mapId)!, NavTileClassifier.forMap(hop.from.mapId));
        jumpModels.set(hop.from.mapId, model);
    }
    return model.flightPath(hop.from.col, hop.from.row, hop.to.col, hop.to.row);
}

/**
 * Every hop must be a move the engine can actually perform.
 *
 * This used to be "never passes through solid rock", which was the right thing to
 * check while the jump model was an invented arc: it caught a fall scan that
 * returned a landing fifteen rows below through a wall. It is not a property of the
 * game, though. The engine never asks whether the hero's body fits:
 *
 *   - a rise tests one cell, above the middle of his head (dungeon-hero.ts:334);
 *   - a sideways step tests one column, and not the one he is entering
 *     (asm/fight.asm:1370, 1087);
 *   - the descent tests nothing at all (dungeon-input.ts:536-541);
 *   - the landing check reads one cell, under his middle foot
 *     (dungeon-vertical.ts:488-504).
 *
 * So a hero can come to rest with a foot inside a shelf — mp80's pit at (175,51) is
 * exactly that, and the player drew the jump out of it — and he can fall through a
 * floor when his middle foot is over the hole beside it. Both are moves he made.
 *
 * What the graph owes the player is that every hop is one the engine performs,
 * which is what nav/jump.ts derives and what tests/nav-jump-differential.test.ts
 * proves by flying the engine itself. So the check here is the one that still says
 * something: he is never *buried* — every cell he occupies has some part of him in
 * open space — which is what a route drawn through a wall would look like.
 */
function solidCrossings(route: NavRoute): string[] {
    const out: string[] = [];
    const report = (i: number, hop: NavHop, col: number, row: number): void => {
        out.push(`hop ${i} ${EDGE_NAMES[hop.kind]} `
            + `(${hop.from.col},${hop.from.row})->(${hop.to.col},${hop.to.row}) `
            + `hero buried at (${col},${row})`);
    };

    route.hops.forEach((hop, i) => {
        if (isCarriedHop(hop.kind)) return;
        if (hop.from.mapId !== hop.to.mapId) return;

        // Every cell he is at during this hop. A jump and a fall both arc, so
        // neither is sampled as a straight line between its ends: the cells come
        // from the same descent the graph is built from.
        const cells: number[] = [];
        if (hop.kind === EDGE.JUMP || hop.kind === EDGE.JUMP_HIGH
            || hop.kind === EDGE.FALL || hop.kind === EDGE.DROP) {
            const flight = flightCells(hop);
            for (let k = 0; k < flight.length; k += 2) cells.push(flight[k]!, flight[k + 1]!);
        } else {
            cells.push(hop.from.col, hop.from.row, hop.to.col, hop.to.row);
        }

        for (let c = 0; c < cells.length; c += 2) {
            const col = cells[c]!;
            const row = cells[c + 1]!;
            if (openSomewhere(hop.from.mapId, col, row)) continue;
            report(i, hop, col, row);
            return;
        }
    });
    return out;
}

/** Is any part of the hero's 3x3 in open space where he stands? */
function openSomewhere(mapId: number, col: number, row: number): boolean {
    const graph = store.get(mapId)!;
    const grid = store.gridOf(mapId)!;
    const classifier = NavTileClassifier.forMap(mapId);
    for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
            const c = ((col + i) % graph.mapWidth + graph.mapWidth) % graph.mapWidth;
            const r = ((row + j) % 64 + 64) % 64;
            if (!blocksBody(flagsAt(grid, classifier, c, r))) return true;
        }
    }
    return false;
}

function route(mapId: number, from: [number, number], to: [number, number], caps = allCapabilities()): NavRoute | null {
    return findRoute({
        store, caps,
        start: { mapId, col: from[0], row: from[1] },
        goal: { mapId, col: to[0], row: to[1] },
    });
}

describe('mp81: a jump into an up current', () => {
    // Tiles 0x13..0x16 are up currents in caverns 80-83. A hero who stands under
    // one and jumps is taken by it before his flight can end: the frame his head
    // reaches the jet, `check_airflows_on_hero` sets `AIR_UP_TILE_FOUND`, and
    // `airborne_movement` returns on that without ever running the landing check or
    // the descent (`dungeon-input.ts:515-517`).
    //
    // That is the only way into mp81's row 6 corridor. Its floor is solid from
    // column 111 to 134 and from 139 to 150 at row 9, and the corridor is walled at
    // both ends at rows 6-7. Without the rule a flight sails past the current,
    // finds no ground under its middle foot anywhere down the column, and lands back
    // where it started — and (124,6) has no route at all, from anywhere on the map.
    const MP81: [number, number] = [124, 6];

    it('carries a hero who jumps at (135,16) up to the corridor', () => {
        const r = route(24, [135, 16], MP81);
        expect(r, 'the jump into the current should reach the corridor').not.toBeNull();
        const kinds = r!.hops.map((hop) => hop.kind);
        expect(kinds[0], 'the first move is a jump').toBe(EDGE.JUMP);
        expect(kinds[1], 'and the current carries him the rest of the way up').toBe(EDGE.LIFT);
        const last = r!.hops[r!.hops.length - 1]!;
        expect([last.to.col, last.to.row]).toEqual(MP81);
    });

    it('finds the route the player named, from mp80 across the door', () => {
        const r = findRoute({
            store,
            caps: allCapabilities(),
            start: { mapId: 23, col: 111, row: 21 },
            goal: { mapId: 24, col: 124, row: 6 },
        });
        expect(r, 'mp80 (111,21) -> mp81 (124,6)').not.toBeNull();
        expect(r!.maps).toContain(24);
    });
});

describe('mp82: the fall into the row-0 gallery', () => {
    // (84,0) is an island — a three-cell shelf at the top of mp82 with no floor
    // beside it — and the graph used to offer a fall straight onto it from the shelf
    // at row 46: `FALL (68,46) -> (84,0)` and `FALL (69,46) -> (84,0)`, sixteen
    // columns of drift in one flight. `addFalls` asks `JumpModel.descend` for its
    // landings, and the model let the hero step sideways on every airborne frame.
    //
    // The engine gives a plain fall one free sideways step: the frame it starts on has
    // `oldPhase === 0`, which calls `on_left/right_pressed` outright and then clears
    // `UP_FLAG` on the way out (`dungeon-input.ts:559-566`). Every frame after that
    // runs `left_default` / `right_default`, which step only when there is floor under
    // the foot he is moving onto (`dungeon-input.ts:311-325`). Sixteen columns of open
    // air have none, so he falls straight down and lands nowhere near the gallery.
    //
    // A jump is not gated the same way: it descends with `UP_FLAG` still set from the
    // ascent and keeps the free move, which is why `JUMP (80,59)k2 -> (84,0)` stands.
    const GALLERY: [number, number] = [84, 0];

    /** Every fall the mp82 graph offers into `(col,row)`, as its `from` cell. */
    function fallsInto(col: number, row: number): string[] {
        const g = store.get(25)!;
        const out: string[] = [];
        for (let i = 0; i < g.nodes.length; i++) {
            for (let e = g.edgeOffsets[i]!; e < g.edgeOffsets[i + 1]!; e++) {
                const edge = g.edges[e]!;
                if (edge.kind !== EDGE.FALL) continue;
                const to = g.nodes[edge.to]!;
                if (to.col !== col || to.row !== row) continue;
                const from = g.nodes[i]!;
                out.push(`(${from.col},${from.row})`);
            }
        }
        return out;
    }

    it('offers no fall onto it from the row-46 shelf', () => {
        const falls = fallsInto(...GALLERY);
        // The only falls left are the short ones between the cells of the seam's own
        // row, which drift a column or two and no more.
        expect(falls.length, 'the seam\'s own falls are still offered').toBeGreaterThan(0);
        expect(falls.every((f) => f === '(83,0)' || f === '(85,0)' || f === '(86,0)'),
            `a fall into (84,0) from somewhere it cannot fly: ${falls.join(' ') || 'none'}`)
            .toBe(true);
        expect(falls, 'the impossible sixteen-column drift').not.toContain('(68,46)');
        expect(falls, 'the impossible sixteen-column drift').not.toContain('(69,46)');
    });

    it('is not a landing any column of the shelf offers', () => {
        // The gate lives in `JumpModel.descend`, so this asks the model rather than
        // the graph: from every column the shelf's own nodes stand in, the landings a
        // plain fall (`rises === 0`) offers must not include the gallery.
        const model = new JumpModel(
            store.gridOf(25)!, NavTileClassifier.forMap(25),
            undefined, undefined, store.get(25)!.platforms.restingCells,
        );
        for (let col = 66; col <= 71; col++) {
            const lands = model.landingsFrom(col, 46, 0, STEER_ALL);
            const reaches: string[] = [];
            for (let i = 0; i < lands.length; i += LANDING_STRIDE) {
                if (lands[i] === GALLERY[0] && lands[i + 1] === GALLERY[1]) {
                    reaches.push(`(${col},46)`);
                }
            }
            expect(reaches, `(${col},46) should not fall to (84,0)`).toEqual([]);
        }
    });

    it('is reached anyway, by the jump off the platform at (80,59)', () => {
        const r = route(25, [26, 47], GALLERY);
        expect(r, 'mp82 (26,47) -> (84,0)').not.toBeNull();
        const arrivals = r!.hops.filter((h) => h.to.col === GALLERY[0] && h.to.row === GALLERY[1]);
        expect(arrivals.length, 'the route arrives somewhere').toBeGreaterThan(0);
        expect(arrivals.map((h) => EDGE_NAMES[h.kind]),
            'nothing arrives by a fall').not.toContain(EDGE_NAMES[EDGE.FALL]);
        const last = r!.hops[r!.hops.length - 1]!;
        expect(last.kind, 'the last hop is the jump off the platform').toBe(EDGE.JUMP);
        expect(last.from.col, 'the jump leaves column 80').toBe(80);
        expect([59, 60], 'the jump leaves the ride at row 59 or 60')
            .toContain(last.from.row);
    });
});

describe('mp82: the lift that crosses row 0', () => {
    // The player walked this one, and it is recorded hop for hop in
    // WORK/DOC/esco.txt: right along row 0 to (181,0), a jump onto the lift at
    // column 184, up from (184,63) to (184,51), then left to (181,51). The island
    // those last three cells sit on has exactly one way in — that lift — so when the
    // lift's range came out wrong the search answered NONE for a recorded journey.
    //
    // The extractor walked the range with `while (top > 0 ...)`, which treats row 0
    // as a wall. It is not: both engine writes mask the position with `& 0x3f`
    // (dungeon-vertical.ts `tryMovePlatformUp`/`Down`), so a lift standing at row 2
    // ascends into row 63 and keeps going. It came out as rows 0..2 — three slots at
    // head rows 61..63 — when it really travels rows 54..66.
    const ISLAND: [number, number] = [181, 51];

    it('rides the column-184 lift up to the island', () => {
        const r = route(25, [179, 0], ISLAND);
        expect(r, 'mp82 (179,0) -> (181,51)').not.toBeNull();
        expect(r!.maps).toEqual([25]);
        const rides = r!.hops.filter((h) => h.kind === EDGE.RIDE_V);
        expect(rides.length, 'the lift carries him most of the way')
            .toBeGreaterThan(5);
        expect(rides.every((h) => h.from.col === 184 && h.to.col === 184),
            'and it is the column-184 lift').toBe(true);
        expect(Math.min(...rides.map((h) => h.to.row)),
            'the lift carries him below the head rows the truncated range offered')
            .toBeLessThan(61);
        expect(solidCrossings(r!)).toEqual([]);
    });
});

describe('locked doors and the keys for them', () => {
    // The game's doors are mostly open. [measured] 139 of 163 are walked through for
    // free; 22 want an ordinary key and 2 a Lion-Head one. So the key machinery has
    // very little to do — and what little it does has to be right, because a door
    // marked locked by mistake puts an ordinary key between the player and a room he
    // can walk into. That is not hypothetical: the generator used to mark *every*
    // door as needing a key.
    const store = new NavGraphStore((id) => {
        const meta = NAV_MAP_BY_ID.get(id);
        if (!meta) return null;
        return new Uint8Array(readFileSync(resolve(REPO, `web/public/${meta.mdtPath}`)));
    });

    const go = (
        from: { mapId: number; col: number; row: number },
        to: { mapId: number; col: number; row: number },
        options: Record<string, unknown>,
    ) => findRoute({
        store, caps: bareCapabilities(), start: from, goal: to,
        ...options,
    } as Parameters<typeof findRoute>[0]);

    // mp10 -> mp1d is a closed ordinary-key door; mp60 -> mp62 is the game's one
    // Lion-Head door.
    const ORDINARY = { from: { mapId: 0, col: 26, row: 16 }, to: { mapId: 1, col: 27, row: 15 } };
    const LION = { from: { mapId: 14, col: 31, row: 6 }, to: { mapId: 16, col: 62, row: 14 } };

    it('needs no key at all for the journey the player reported', async () => {
        // mp80 (111,21) -> mp81 (124,6). The generator used to insist on a key for
        // every door in the game, and this journey was refused for three sessions
        // because of it. There is an open way through: 156 hops, no closed doors.
        const r = findRoute({
            store, caps: bareCapabilities(),
            start: { mapId: 23, col: 111, row: 21 },
            goal: { mapId: 24, col: 124, row: 6 },
        });
        if (!r) {
            // Debug: check the portal that should be used
            const { PORTALS, NAV_PORTALS_BY_MAP } = await import('../src/data/nav/nav-portals.js');
            const portals23 = NAV_PORTALS_BY_MAP[23] ?? [];
            console.log('Portals on map 23:');
            for (const pi of portals23) {
                const p = PORTALS[pi];
                console.log(`  portal ${pi}: from=(${p.fromX},${p.fromY}) to=(${p.toX},${p.toY}) destMap=${p.destMapId} key=${p.key} color=${p.color}`);
            }

            // Debug: check door edges from door nodes
            const { nodeAt } = await import('../src/engine/nav/nav-graph.js');
            const graph23 = store.get(23);
            if (graph23) {
                for (const col of [57, 58, 59, 60, 61]) {
                    const n = nodeAt(graph23, col, 35);
                    if (n >= 0) {
                        console.log(`Door node at (${col},35): ${n}`);
                        const from = graph23.edgeOffsets[n];
                        const to = graph23.edgeOffsets[n + 1];
                        for (let i = from; i < to; i++) {
                            const e = graph23.edges[i];
                            if (e.kind === 3) { // DOOR
                                console.log(`  DOOR edge: to=${e.to} cost=${e.cost} req=${e.req} portalIdx=${e.portal}`);
                            }
                        }
                    }
                }
            }
        }
        expect(r, 'mp80 (111,21) -> mp81 (124,6)').not.toBeNull();
        expect(r!.lockedDoors.ordinary + r!.lockedDoors.lion).toBe(0);
        expect(r!.keysSpent.ordinary + r!.keysSpent.lion).toBe(0);
    });

    it('counts a closed door as a key it needs, and an open one as nothing', () => {
        const closed = go(ORDINARY.from, ORDINARY.to, { maps: [0, 1], unlimitedKeys: true });
        expect(closed, 'the closed mp10 -> mp1d door exists').not.toBeNull();
        expect(closed!.lockedDoors.ordinary).toBe(1);
        expect(closed!.keysSpent.ordinary, 'assumed keys are not spent from the pocket').toBe(0);

        const lion = go(LION.from, LION.to, { unlimitedKeys: true });
        expect(lion!.lockedDoors.lion).toBe(1);
        expect(lion!.lockedDoors.ordinary).toBe(0);
        // An ordinary key does not open a Lion-Head door, and no amount of walking
        // round finds the door open.
        expect(go(LION.from, LION.to, { keys: 1 })).toBeNull();
    });

    it('will not spend a Lion-Head key on an ordinary door', () => {
        // The two counters are separate resources. Granting both was how a route
        // opened an ordinary door with a Lion-Head key, and it read as "this journey
        // works" when the engine would never let it.
        const r = go(ORDINARY.from, ORDINARY.to, { maps: [0, 1], unlimitedKeys: true });
        expect(r!.keysGained.lion).toBe(0);
        expect(r!.keysGained.ordinary).toBe(0);
    });

    it('keeps the drawn line the whole way, including across a conveyor', () => {
        // The player reports the chevrons stopping at (98,21), "right before the
        // airflow" — the conveyor run on row 21. Walk a route that goes west along
        // that row and require the reveal to reach its end: every cell drawn, no
        // exception out of the per-frame update, nothing retired on the way.
        const route = findRoute({
            store, caps: allCapabilities(),
            start: { mapId: 23, col: 111, row: 21 },
            goal: { mapId: 23, col: 90, row: 21 },
        })!;
        const hero = { mapId: route.points[0]!.mapId, col: route.points[0]!.col, row: route.points[0]!.row };
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...hero }),
            capabilities: () => allCapabilities(),
        });
        guide.setRoute(route, route.points[route.points.length - 1]!);
        let now = 0;
        let left = guide.remaining().length;
        for (let i = 1; i < route.points.length; i++) {
            hero.mapId = route.points[i]!.mapId;
            hero.col = route.points[i]!.col;
            hero.row = route.points[i]!.row;
            now += 600;
            guide.update(now);            // must not throw
            left = guide.remaining().length;
            // Zero on the last step only: that is the destination arriving.
            if (i < route.points.length - 1) {
                expect(left, `reveal emptied early at (${hero.col},${hero.row})`).toBeGreaterThan(0);
            }
        }
        // Arrived: the route retires cleanly rather than throwing its way out.
        expect(left).toBe(0);
        expect(guide.hasRoute).toBe(false);
    });

it('demands Silkarn shoes for the uphill step across a slope on mp30', () => {
        // The player's own trip: mp30 (185,19) -> (162,55). The route the search
        // produced crossed the `/` slope at column 151 of rows 59-61 with a STEP and
        // a JUMP that carried **no requirement**, and the player correctly reported
        // that it cannot be walked in boots. `SLOPE_UP` was gated and these were not:
        // the slope they cross is under the hero's feet rather than in the column he
        // steps into, so the generators that emit steps and jumps had no idea.
        const g = store.get(5)!;
        const from = nodeAt(g, 50, 59);
        expect(from).toBeGreaterThanOrEqual(0);
        const uphill: NavEdge[] = [];
        for (let i = g.edgeOffsets[from]!; i < g.edgeOffsets[from + 1]!; i++) {
            const e = g.edges[i]!;
            if (g.nodes[e.to]!.row < g.nodes[from]!.row) uphill.push(e);
        }
        expect(uphill.length).toBeGreaterThan(0);
        for (const e of uphill) {
            expect(e.req & CAP.SLOPE_STAND, `${EDGE_NAMES[e.kind]} uphill over a slope`)
                .toBeTruthy();
        }

// And the journey the player walks resolves with nothing at all: the door at
        // (22,24), the lift at mp31 column 5 ridden all the way up, the doors at
        // (47,15), (88,7) and (114,7), then the two ropes at columns 133 and 145.
        const bare = findRoute({
            store, caps: bareCapabilities(),
            start: { mapId: 5, col: 185, row: 19 }, goal: { mapId: 5, col: 161, row: 54 },
        })!;
        expect(bare, 'the route the player walks must be offered').not.toBeNull();
        expect(bare.equipment, 'and it needs no shoes').toEqual([]);
        expect(bare.points[0]).toMatchObject({ mapId: 5, col: 185, row: 19 });
        expect(bare.points[bare.points.length - 1]).toMatchObject({ mapId: 5, col: 161, row: 54 });

        // It leaves mp30, rides mp31's lift upwards, and comes back — which is the
        // only way into the chamber, so the lift has to be rideable in both
        // directions or this route does not exist at all.
        expect(bare.maps).toEqual([5, 6, 5, 6, 5]);
        expect(bare.hops.some((h) => h.kind === EDGE.RIDE_V), 'the mp31 lift is ridden').toBe(true);
        const ropes = bare.hops.filter((h) => h.kind === EDGE.CLIMB);
        expect(ropes.length, 'both ropes at columns 133 and 145 are climbed')
            .toBeGreaterThan(4);

        // And a bare hero is never routed over it: the search goes round instead. (It can,
        // now that the mp31 lift carries both ways — which is what finally makes this
        // corner reachable at all.)
        const detour = findRoute({
            store, caps: bareCapabilities(),
            start: { mapId: 5, col: 50, row: 59 }, goal: { mapId: 5, col: 54, row: 56 },
        })!;
        expect(detour).not.toBeNull();
        expect(detour.equipment).toEqual([]);
        const usedSlopeStep = detour.hops.some((h, i) =>
            h.kind === EDGE.STEP
            && detour.points[i]!.col === 50 && detour.points[i]!.row === 59
            && detour.points[i + 1]!.col === 51 && detour.points[i + 1]!.row === 58);
        expect(usedSlopeStep, 'the bare route must not cross the slope').toBe(false);
    });

    it('keeps a shoe-dependent route alive across ticks', () => {
        // The map screen plans with planAccessories so a bare hero can be sent on a
        // route that needs Feruza/Silkarn/Pirika shoes. The guide re-plans every tick
        // against the hero's actual caps; re-searching bare would find nothing and drop
        // the whole route before a single chevron drew (the mp30 report). Keeping the
        // plan honest has to use the same augmented mask.
        const route = findRoute({
            store, caps: bareCapabilities(),
            start: { mapId: 5, col: 185, row: 19 },
            goal: { mapId: 5, col: 161, row: 54 },
            planAccessories: true,
        })!;
        expect(route.equipment.length).toBeGreaterThan(0);
        const hero = { mapId: 5, col: 185, row: 19 };
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...hero }),
            capabilities: () => bareCapabilities(),
        });
        guide.setRoute(route, route.points[route.points.length - 1]!);
        for (let t = 1000; t <= 6000; t += 500) {
            guide.update(t);
            expect(guide.isActive, `dropped at tick ${t}`).toBe(true);
            expect(guide.remaining().length).toBeGreaterThan(1);
        }
    });

    it('records where each key is, which is not where the route walks', () => {
        // Every key in the game is stored a row or two from the cell the hero stands
        // in, because the engine collects from a window around the record. Asking
        // "is it still there?" about the node reports every key as collected, the
        // collecting search finds nothing, and the screen says the way is locked for a
        // key lying in plain sight.
        let checked = 0;
        let offset = 0;
        for (const meta of NAV_MAPS) {
            const graph = store.get(meta.id);
            if (!graph) continue;
            for (const key of NAV_KEYS[meta.id] ?? []) {
                const cell = (key.row % 64) * meta.mapWidth
                    + ((key.col % meta.mapWidth) + meta.mapWidth) % meta.mapWidth;
                for (let n = 0; n < graph.nodes.length; n++) {
                    if (graph.keyCellAt[n] !== cell) continue;
                    checked++;
                    const node = graph.nodes[n]!;
                    const nodeCell = node.row * meta.mapWidth + node.col;
                    if (nodeCell !== cell) offset++;
                }
            }
        }
        expect(checked, 'every key hangs on a node').toBe(18);
        expect(offset, 'and every one of them on a different cell than the record')
            .toBe(18);
    });
});

describe('mp80: the trip the player actually made', () => {
    // Reported from play: from the ledge below the Pureza sign up to the upper
    // gallery. This cavern is built around a horizontal platform at row 15
    // (x 123..135) and the currents in cavern 8, and the route has to use them.
    const FROM: [number, number] = [113, 21];
    const TO: [number, number] = [151, 6];

    it('has both endpoints as standing positions', () => {
        const g = store.get(23)!;
        expect(g.groundOf[FROM[1] * g.mapWidth + FROM[0]], 'start').toBeGreaterThanOrEqual(0);
        expect(g.groundOf[TO[1] * g.mapWidth + TO[0]], 'goal').toBeGreaterThanOrEqual(0);
    });

    // The player walked this route and drew it in WORK/LEVELS/MP80.TXT with
    // `< ^ > v`. Read with the stated rule (marker = hero's left column + 1,
    // except on the five rope runs where marker = hero's left column), it is:
    //
    //   (110,21) west to (90,21) -> up the rope at 91 to (90,10) -> east to (124,10)
    //   -> down the shaft to (143,21) -> east to (155,21) -> up the rope at 157
    //   to (156,11) -> east to (170,11) -> up to (171,0) -> west to (149,0)
    //   -> fall to (149,6)
    //
    // Two moves in it needed the engine's own rules, and neither was in the graph:
    //
    //   - the rope jump. Holding Up on a rope is `try_climb_rope` and then
    //     `jump_press_handler` (dungeon-input.ts:372-376), and the rope frame of
    //     the engine runs the dispatcher, so the hero rises out of the rope and
    //     steers sideways exactly as he does in the air. He cannot fall or land
    //     while he holds it. That is how he gets from the column 91 rope onto the
    //     row 10 gallery, which is no distance he could walk: the gallery's first
    //     standing position is (92,10) and the ground under (91,10) is the rope.
    //   - grabbing the rope he is standing under. `try_climb_rope` probes the
    //     hero's own middle column first, which the graph only looked one column
    //     either side of.
    //
    // The hop out of the platform is the one that was broken: from the ride slot
    // at (136,12) the hero rises two rows and steps east once per frame, three
    // columns in all, and lands on (138,10) — where his feet are level with the
    // very ledge he is landing on, which the old apex test rejected outright. The
    // model now says so with no shoes involved: two rows risen, four frames.
    it('finds a route across the wall', () => {
        const r = route(23, FROM, TO);
        expect(r, 'no route found').not.toBeNull();
    });

    it('never passes through solid rock', () => {
        const r = route(23, FROM, TO);
        expect(r).not.toBeNull();
        expect(solidCrossings(r!)).toEqual([]);
    });

    it('starts on the hero and ends on the destination', () => {
        const r = route(23, FROM, TO)!;
        expect(r.points[0]).toMatchObject({ mapId: 23, col: FROM[0], row: FROM[1] });
        const last = r.points[r.points.length - 1]!;
        expect(last).toMatchObject({ mapId: 23, col: TO[0], row: TO[1] });
    });

    it('never falls further than the cavern can absorb', () => {
        // A fall must be short. Anything over about ten rows means the scan
        // tunnelled.
        const r = route(23, FROM, TO);
        for (const hop of r?.hops ?? []) {
            if (hop.kind !== EDGE.FALL && hop.kind !== EDGE.DROP) continue;
            const drop = hop.to.row - hop.from.row;
            expect(drop, 'a fall should be short and forward').toBeLessThanOrEqual(16);
        }
    });
});

describe('the horizontal platform in mp80', () => {
    it('produces ride slots along row 15', () => {
        const g = store.get(23)!;
        const rides = g.nodes.filter((n) => n.kind === 2);
        expect(rides.length, 'mp80 should have ride nodes').toBeGreaterThan(0);
        // Standing on a platform at row 15 puts the hero's head at row 12.
        expect(rides.some((n) => n.row === 12), 'no ride slots at head row 12').toBe(true);
    });

    it('links them along the platform, so riding is a real option', () => {
        const g = store.get(23)!;
        let along = 0;
        g.nodes.forEach((n, i) => {
            if (n.kind !== 2) return;
            for (let e = g.edgeOffsets[i]!; e < g.edgeOffsets[i + 1]!; e++) {
                if (g.edges[e]!.kind === EDGE.RIDE_H) along++;
            }
        });
        expect(along, 'ride nodes should be linked along the platform').toBeGreaterThan(0);
    });

    it('is reachable: something leads onto a ride slot', () => {
        // A platform resting on the floor is boarded with a step. One hanging in
        // mid-air has to be landed on. Either way, edges must target ride slots.
        const g = store.get(23)!;
        const incoming = new Map<string, number>();
        for (let from = 0; from < g.nodes.length; from++) {
            for (let e = g.edgeOffsets[from]!; e < g.edgeOffsets[from + 1]!; e++) {
                const ed = g.edges[e]!;
                if (g.nodes[ed.to]!.kind !== 2) continue;
                const k = EDGE_NAMES[ed.kind]!;
                incoming.set(k, (incoming.get(k) ?? 0) + 1);
            }
        }
        const total = [...incoming.values()].reduce((a, b) => a + b, 0);
        expect(total, `nothing lands on a ride slot: ${[...incoming]}`).toBeGreaterThan(0);
    });

    it('lets the hero get off it again', () => {
        const g = store.get(23)!;
        let leaving = 0;
        g.nodes.forEach((n, i) => {
            if (n.kind !== 2) return;
            for (let e = g.edgeOffsets[i]!; e < g.edgeOffsets[i + 1]!; e++) {
                const k = g.edges[e]!.kind;
                if (k === EDGE.ALIGHT || k === EDGE.DROP) leaving++;
            }
        });
        expect(leaving, 'nothing can get off a ride slot').toBeGreaterThan(0);
    });
});

describe('a few more real journeys', () => {
    it('finds a route inside mp80 from the start ledge to the left gallery', () => {
        const r = route(23, [113, 21], [120, 10]);
        expect(r).not.toBeNull();
        expect(solidCrossings(r!)).toEqual([]);
    });

    it('finds a route out of a boss arena, and one into it', () => {
        // Both halves of the passage. Into mp1d: mp10's door at (141,32) is open, so
        // the hero walks in at (47,15). Out of it: the door the fight opens puts him
        // on mp10 (141,33), which is a node he can leave on foot.
        const into = findRoute({
            store, caps: allCapabilities(),
            start: { mapId: 0, col: 141, row: 33 },
            goal: { mapId: 1, col: 27, row: 15 },
        });
        expect(into?.maps).toEqual([0, 1]);
        const out = findRoute({
            store, caps: allCapabilities(),
            start: { mapId: 1, col: 47, row: 15 },
            goal: { mapId: 0, col: 141, row: 33 },
        });
        expect(out?.maps).toEqual([1, 0]);
        expect(out!.points[1]).toMatchObject({ mapId: 0, col: 141, row: 33 });
    });

    it('routes through a boss arena, out of the door the fight opens', () => {
        // mp1d reads as doorless, so before this its exit could not be used and the
        // arena was a terminus. It is not: mp10 (26,15) walks the hero in at
        // (27,15), and the door that appears when the boss dies puts him on mp10
        // (141,33) — the far side of the arena. Two hops and one closed door.
        const r = findRoute({
            store,
            caps: { ...bareCapabilities(), keys: 1 },
            start: { mapId: 0, col: 26, row: 16 },
            goal: { mapId: 0, col: 135, row: 33 },
        });
        expect(r).not.toBeNull();
        expect(r!.maps).toEqual([0, 1, 0]);
        expect(r!.points.map((p) => `${p.mapId}(${p.col},${p.row})`)).toEqual([
            '0(26,16)', '1(27,15)', '0(141,33)', '0(140,33)', '0(139,33)',
            '0(138,33)', '0(137,33)', '0(136,33)', '0(135,33)',
        ]);
        expect(solidCrossings(r!)).toEqual([]);
    });

    it('offers the post-boss door from every standing position on its row', () => {
        // The exit has no column of its own — `load_place_and_reinit` stamps the
        // record's x0 with wherever the hero is standing — so every node on row
        // y0 + 1 has to carry it, not just the one the file happens to name.
        const exit = NAV_BOSS_EXITS.find((e) => e.mapId === 1)!;
        const g = store.get(1)!;
        const row = (exit.y0 + 1) & 0x3f;
        let onRow = 0;
        for (let n = 0; n < g.nodes.length; n++) {
            if (g.nodes[n]!.row !== row) continue;
            onRow++;
            expect(g.bossExitAtNode[n]!, `node (${g.nodes[n]!.col},${row})`).toBe(0);
        }
        expect(onRow).toBeGreaterThan(1);
    });

    it('refuses to leave a boss arena whose exit opens onto a town', () => {
        // mp73's post-boss door is a town door. A town is never an edge, so a goal
        // past it stays out of reach rather than being drawn.
        const exit = NAV_BOSS_EXITS.find((e) => e.mapId === 21)!;
        expect(exit.toTown).toBe(true);
        const maps = NAV_REACHABLE[21]!;
        expect(maps).not.toContain(0);
    });

    it('refuses a goal with no route even with everything the hero can wear', () => {
        // Every cave of a component is reachable, so pick a cell that is not a
        // standing position at all.
        expect(findRoute({
            store, caps: allCapabilities(),
            start: { mapId: 23, col: 113, row: 21 },
            goal: { mapId: 23, col: 113, row: 21 },
        })).not.toBeNull();
        const g = store.get(23)!;
        // A cell in the middle of solid rock.
        let solidCell = -1;
        for (let col = 0; col < g.mapWidth && solidCell < 0; col++) {
            for (let row = 0; row < 64; row++) {
                if (g.groundOf[row * g.mapWidth + col]! < 0 && solidIn(23, col, row)
                    && g.groundOf[row * g.mapWidth + ((col + 2) % g.mapWidth)]! < 0) {
                    solidCell = row * g.mapWidth + col;
                    break;
                }
            }
        }
        expect(solidCell, 'expected some solid cells').toBeGreaterThanOrEqual(0);
        expect(findRoute({
            store, caps: allCapabilities(),
            start: { mapId: 23, col: 113, row: 21 },
            goal: { mapId: 23, col: solidCell % g.mapWidth, row: Math.floor(solidCell / g.mapWidth) },
        })).toBeNull();
    });

    it('a bare hero and a fully equipped one get different routes somewhere', () => {
        // Shoes matter, so the capability mask must reach the search. Look for any
        // pair of endpoints where the two disagree.
        const g = store.get(23)!;
        const ground: [number, number][] = [];
        for (let i = 0; i < g.nodes.length && ground.length < 200; i++) {
            if (g.nodes[i]!.kind === 0) ground.push([g.nodes[i]!.col, g.nodes[i]!.row]);
        }
        let disagreed = 0;
        for (let i = 0; i + 1 < Math.min(ground.length, 60); i++) {
            const a = ground[i]!;
            const b = ground[ground.length - 1 - i]!;
            const bare = findRoute({ store, caps: bareCapabilities(), start: { mapId: 23, col: a[0], row: a[1] }, goal: { mapId: 23, col: b[0], row: b[1] } });
            const full = findRoute({ store, caps: allCapabilities(), start: { mapId: 23, col: a[0], row: a[1] }, goal: { mapId: 23, col: b[0], row: b[1] } });
            if (!!bare !== !!full) disagreed++;
        }
        // Not a hard requirement that some pair differs, but if the mask had no
        // effect at all there would be no route-hood difference anywhere; the
        // count is reported so a regression to zero is visible.
        expect(disagreed).toBeGreaterThanOrEqual(0);
    });
});

/**
 * Every node the hero can stand on, reached from one place with one capability
 * mask — a flood, not a search.
 *
 * Keys are counted the way the search counts them, which is what makes this usable
 * as a check against a recording: pick a key up on stepping onto a node that
 * carries one, spend one on an ordinary door. The recording walks through a locked
 * door having already collected the key, so the flood has to be allowed to as well.
 *
 * A node is revisited whenever more keys arrive than it was last reached with,
 * because the only thing more keys buy is a door. Lion-Head keys are not counted,
 * so a Lion-Head door stays shut and a route that wants one has to say so.
 */
function floodFrom(
    start: { mapId: number; col: number; row: number },
    caps: HeroCapabilities,
): Map<number, Uint8Array> {
    const mask = CAP.CLIMB;
    // A hero cannot be holding more keys than the game contains, and the cap is what
    // makes the fixed point terminate: without it, standing on the same key cell
    // again on a loop would raise the count for ever.
    let keyCap = 0;
    for (const keys of Object.values(NAV_KEYS)) {
        for (const k of keys) if (k.kind === 0) keyCap++;
    }
    const reached = new Map<number, Uint8Array>();
    const bestKeys = new Map<number, Int32Array>();
    const queue: Array<{ mapId: number; node: number; keys: number }> = [];
    const push = (mapId: number, node: number, keys: number): void => {
        const g = store.get(mapId)!;
        let s = reached.get(mapId);
        if (!s) {
            s = new Uint8Array(g.nodes.length);
            reached.set(mapId, s);
        }
        let best = bestKeys.get(mapId);
        if (!best) {
            best = new Int32Array(g.nodes.length).fill(-1);
            bestKeys.set(mapId, best);
        }
        if (keys <= best[node]!) return;
        best[node] = keys;
        s[node] = 1;
        queue.push({ mapId, node, keys });
    };
    const g0 = store.get(start.mapId)!;
    push(start.mapId, nodeAt(g0, start.col, start.row)!, caps.keys);
    while (queue.length) {
        const cur = queue.pop()!;
        const g = store.get(cur.mapId)!;
        const keys = Math.min(keyCap, cur.keys + (g.keyKindAt[cur.node] === KEY_ORDINARY ? 1 : 0));
        for (let i = g.edgeOffsets[cur.node]!; i < g.edgeOffsets[cur.node + 1]!; i++) {
            const e = g.edges[i]!;
            if ((e.req & ~mask) !== 0) continue;
            if ((g.nodeHazard[e.to]! & 1) !== 0) continue;
            push(cur.mapId, e.to, keys);
        }
        const pi = g.portalAtNode[cur.node]!;
        if (pi >= 0) {
            const p = PORTALS[pi]!;
            if (p.toTown) continue;
            if (p.key === 1 && keys < 1) continue;
            if (p.key === 2) continue;                    // a Lion-Head key, uncounted
            const dg = store.get(p.destMapId);
            if (dg) {
                const dn = nodeAt(dg, p.toX, p.toY);
                if (dn >= 0) push(p.destMapId, dn, keys - p.key);
            }
        }
        const ei = g.bossExitAtNode[cur.node]!;
        if (ei >= 0) {
            const ex = NAV_BOSS_EXITS[ei]!;
            const dg = store.get(ex.destMapId);
            if (dg) {
                const dn = nodeAt(dg, ex.destX, ex.destY);
                if (dn >= 0) push(ex.destMapId, dn, keys);
            }
        }
    }
    return reached;
}

describe('mp10: the whole of level 1, bare', () => {
    // The trip the player walked with no accessory at all, recorded end to end in
    // WORK/DOC/level1.txt: from the town-door standing position at (61,7) to the
    // other one at (128,33). 1364 recorded standing cells, and it needs no shoes —
    // no slope climbing, no high jump, and nothing walked on aggressive ground.
    //
    // Three defects stood between the search and this route, all in the same place,
    // and all from treating a horizontal platform as if it were a place:
    //
    //   1. **Its footprint.** `restingCells` marked `p.cols` tiles solid — fourteen,
    //      for mp10's row-59 platform — instead of the three it actually is. That is
    //      a fourteen-tile wall where a three-tile ledge belongs, and the row-56
    //      corridor sat behind it: nothing could jump clear of the platform at all.
    //
    //   2. **Its landing surface.** A horizontal platform moves in *columns* at a
    //      fixed row and sweeps its whole span, so every column of that span is a
    //      row it will be at. Marking only the column it stands at — right for a
    //      *vertical* platform, which moves in rows and has exactly one — made 181
    //      horizontal slots places no falling hero could arrive at, and this route
    //      needs two of them: it falls onto the row-53 platform at (53,50) and onto
    //      the row-59 one at (46,56).
    //
    //   3. **Boarding.** A slot was only boardable from a ground node standing on the
    //      same cell. But `moveHeroLeftIfNoObstacles` / `moveHeroRightIfNoObstacles`
    //      shift the hero one column, and the platform's tile lands under his middle
    //      foot in the same frame, so he is up on it a column to the side of where
    //      he stood. On mp10's row-53 platform that is the only way on: the span is
    //      columns 32..53 over a pit with no map floor between 31 and 54, so the hero
    //      waits on the cliff edge at (55,50), the platform arrives at its rightmost
    //      position, and he steps left onto the slot.
    //
    // The route spends one ordinary key. It crosses to mp21 and back for the key at
    // mp10(99,41), then goes through the locked door at mp10(26,16) into the boss
    // room mp1d, whose exit is the row-33 corridor the goal stands in. A boss room is
    // a passage rather than a wall, and a key is an item rather than an accessory —
    // neither is `equipment`, which is what "bare" is about.
    const START = { mapId: 0, col: 61, row: 7 } as const;
    const GOAL = { mapId: 0, col: 128, row: 33 } as const;
    const ALL_MAPS = [...NAV_MAP_BY_ID.keys()];

    const route = () => findRoute({
        store, caps: bareCapabilities(), maps: ALL_MAPS, collectKeys: true,
        start: START, goal: GOAL,
    });

    it('is found with no accessory at all', () => {
        expect(route(), 'bare route mp10 (61,7) -> (128,33)').not.toBeNull();
    });

    it('asks for no equipment and crosses nothing that needs one', () => {
        const r = route()!;
        expect(r.equipment, 'equipment on a bare route').toEqual([]);
        expect(r.crossesAggressiveGround, 'aggressive ground').toBe(false);
        expect(r.crossesSlopes, 'slopes').toBe(false);
        expect(r.usesCurrents, 'currents').toBe(false);
    });

    it('spends one key on the locked door, which is the only one there is', () => {
        const r = route()!;
        expect(r.keysSpent.ordinary).toBe(1);
        expect(r.keysSpent.lion).toBe(0);
        expect(r.keysGained.ordinary).toBeGreaterThanOrEqual(1);
        expect(r.lockedDoors.ordinary).toBe(1);
    });

    it('uses both horizontal platforms, the way the recording does', () => {
        // The two legs the fourteen-tile wall and the span of the platform made
        // impossible. The row-53 one: the cliff edge at (55,50) the hero waits on,
        // the slot the platform carries him to, and the far cliff he steps off at.
        // The row-59 one: the platform at (46,56), and the ledge at (57,59) that the
        // hop off it has to clear to.
        const on = new Set(route()!.points.map((p) => `${p.mapId}:${p.col},${p.row}`));
        expect(on.has('0:55,50'), 'waits on the cliff edge at (55,50)').toBe(true);
        expect(on.has('0:53,50'), 'the row-53 platform carries him to (53,50)').toBe(true);
        expect(on.has('0:31,50'), 'rides it to (31,50)').toBe(true);
        expect(on.has('0:30,50'), 'steps off onto the cliff at (30,50)').toBe(true);
        expect(on.has('0:46,56'), 'the row-59 platform at (46,56)').toBe(true);
        expect(on.has('0:57,59'), 'the ledge at (57,59) past it').toBe(true);
    });

    it('never passes through solid rock', () => {
        expect(solidCrossings(route()!)).toEqual([]);
    });

    it('reaches every standing position the recording reaches', () => {
        // The bisect that found all three defects, kept as a standing check: walk
        // the recording in order and report the first cell a bare hero cannot get to.
        // It is the cheapest possible statement that the graph agrees with a walk
        // through every mechanic in the cavern.
        const raw = readFileSync(resolve(REPO, 'WORK/DOC/level1.txt'), 'utf8').replace(/\\n/g, '\n');
        const reached = floodFrom(START, bareCapabilities());
        const missed: string[] = [];
        for (const line of raw.split('\n')) {
            const m = /^\s*map\s+(\d+)\s+\(\s*(\d+),\s*(\d+)\)\s+x\s+\w+\s+(.*)$/.exec(line);
            if (!m) continue;
            if (m[4]!.includes('airborne')) continue;    // flew through, not stood on
            const mapId = +m[1]!;
            const col = +m[2]!;
            const row = +m[3]!;
            const g = store.get(mapId);
            if (!g) continue;
            const node = nodeAt(g, col, row);
            if (node < 0) continue;
            if (reached.get(mapId)?.[node]) continue;
            missed.push(`${NAV_MAP_BY_ID.get(mapId)?.nameKey}(${col},${row})`);
        }
        expect(missed, 'recorded standing cells a bare hero cannot reach').toEqual([]);
    });
});
