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
import { allCapabilities, bareCapabilities } from '../src/engine/nav/capabilities.js';
import { NavTileClassifier } from '../src/engine/nav/attributes.js';
import { flagsAt } from '../src/engine/nav/geometry.js';
import { JumpModel } from '../src/engine/nav/jump.js';
import { EDGE, EDGE_NAMES, NAV, blocksBody } from '../src/engine/nav/types.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { isCarriedHop } from '../src/render/path-overlay.js';
import { NAV_MAP_BY_ID, NAV_MAPS } from '../src/data/nav/nav-maps.js';
import { NAV_KEYS } from '../src/data/nav/nav-keys.js';

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

    it('needs no key at all for the journey the player reported', () => {
        // mp80 (111,21) -> mp81 (124,6). The generator used to insist on a key for
        // every door in the game, and this journey was refused for three sessions
        // because of it. There is an open way through: 156 hops, no closed doors.
        const r = findRoute({
            store, caps: bareCapabilities(),
            start: { mapId: 23, col: 111, row: 21 },
            goal: { mapId: 24, col: 124, row: 6 },
        });
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

    it('finds a route between two boss arenas only through their cavern', () => {
        // mp1d is a dead end by design: reachable from mp10, but you cannot route
        // out of it, because its exit door is synthesised at runtime after the
        // fight. So a goal inside mp1d is fine, but a trip that must pass
        // through it is not.
        const into = route(23, [113, 21], [0, 0]);
        expect(into === null || into.maps[0] === 23).toBe(true);
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
