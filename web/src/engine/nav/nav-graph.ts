/**
 * nav-graph.ts — build the navigation graph for one cavern.
 *
 * A **node** is a standing position: the hero's left column and head row, a 3x3
 * body that fits there, and ground beneath (geometry.isStanding). Three kinds:
 *
 *   GROUND  the hero can stand on it
 *   ROPE    a rope runs through his middle column at his head row
 *           (dungeon-vertical.ts:199-202 probes heroCoords+1, which is exactly
 *           that cell) and his body fits, so he can climb it
 *   RIDE    a platform slot from nav/platforms.ts
 *
 * An **edge** is one traversal the hero can perform, with a cost in ticks and the
 * capability it needs. Costs come from EDGE_COST: one tick moves him one tile, a
 * jump costs twice its ceiling, and currents move him two tiles per tick so their
 * distance is halved.
 *
 * Two edge families are deliberately *static*. Platforms and currents both act
 * automatically, but neither makes reachability time-dependent — the hero can
 * always wait for a platform or hold on to a current — so they are folded into
 * the same graph rather than needing a clock.
 *
 * The airflow suppression rules of the plan (§7.4) are applied here, not in the
 * pathfinder, because they are properties of the geometry:
 *
 *   - a walk into a current that opposes it is impossible
 *     (dungeon-hero.ts:218-268), so no such edge exists;
 *   - while lifted the hero cannot fall or jump (dungeon-input.ts:524-525), so no
 *     fall or jump leaves a lift column, though he can always step sideways out;
 *   - a hero swept into a current is pushed, not dropped, so no fall ends inside one.
 */

import {
    NAV, EDGE, EDGE_COST, CAP, KEY_LION, KEY_ORDINARY,
    blocksBody,
} from './types.js';
import { NavTileClassifier } from './attributes.js';
import {
    blockedByCounterCurrent, flagsAt, heroBoxFree, heroCanStepSideways, heroInLift,
    isStanding, wrapCol, wrapRow,
} from './geometry.js';
import { JumpModel, LANDING_STRIDE } from './jump.js';
import { buildPlatformModel, type PlatformModel } from './platforms.js';
import { NAV_KEYS } from '../../data/nav/nav-keys.js';
import { buildAirflowModel, type AirflowModel } from './airflows.js';
import { PORTALS, NAV_PORTALS_BY_MAP, NAV_DOOR_COUNT } from '../../data/nav/nav-portals.js';
import { NAV_MAP_BY_ID } from '../../data/nav/nav-maps.js';
import type { NavTileGrid } from './mdt-grid.js';

export const NODE_GROUND = 0;
export const NODE_ROPE = 1;
export const NODE_RIDE = 2;

/** Bits in NavGraph.nodeHazard. */
export const HAZARD_AGGRESSIVE = 1 << 0;
export const HAZARD_CURRENT = 1 << 1;
export const HAZARD_SLOPE = 1 << 2;
export const HAZARD_ROPE = 1 << 3;

export const NODE_NAMES: Readonly<Record<number, string>> = Object.freeze({
    [NODE_GROUND]: 'ground',
    [NODE_ROPE]: 'rope',
    [NODE_RIDE]: 'ride',
});

export interface NavNode {
    readonly kind: number;
    /** Hero left column. */
    readonly col: number;
    /** Hero head row. */
    readonly row: number;
    /** Ride slot index, or -1. */
    readonly platform: number;
}

export interface NavEdge {
    /** Target node index. */
    readonly to: number;
    readonly kind: number;
    readonly cost: number;
    /** Capability bits required; 0 means always possible. */
    readonly req: number;
    /** Portal index when kind is DOOR, else -1. */
    readonly portal: number;
}

export interface NavGraphStats {
    readonly nodes: number;
    readonly edges: number;
    readonly ground: number;
    readonly rope: number;
    readonly ride: number;
    readonly byEdgeKind: Readonly<Record<number, number>>;
}

export interface NavGraph {
    readonly mapId: number;
    readonly mapWidth: number;
    readonly nodes: readonly NavNode[];
    readonly edges: readonly NavEdge[];
    /** CSR offsets into `edges`, length nodes.length + 1. */
    readonly edgeOffsets: Int32Array;
    /** Cell -> ground node index, or -1. Length mapWidth * 64. */
    readonly groundOf: Int32Array;
    /** Cell -> rope node index, or -1. */
    readonly ropeOf: Int32Array;
    /** Ride slot index -> node index, or -1. */
    readonly rideOf: Int32Array;
    /**
     * Per-node hazard flags, one entry per node: HAZARD_* bits describing what
     * the hero's 3x3 footprint touches there.
     *
     * Recorded on the geometry rather than baked into the edges, because whether a
     * crossing is allowed depends on what the hero is wearing: one graph serves
     * every loadout and the pathfinder prunes at search time.
     */
    readonly nodeHazard: Uint8Array;
    /**
     * Node -> portal index for a door departing that node, or -1.
     *
     * Intra-map doors also appear as EDGE.DOOR edges; this lets the pathfinder
     * find the ones that cross to another map, which a single map's grid cannot
     * represent.
     */
    readonly portalAtNode: Int32Array;
    /**
     * The key lying on each node: 0 none, 1 ordinary, 2 Lion-Head.
     *
     * A key is an item standing on the floor, so it needs no edge of its own — the
     * pickup fires from the ordinary alignment test while the hero walks over the
     * cell (`checkMonsterAlignedToHeroAndTick`, dungeon-monsters.ts:123). The search
     * credits a key when it steps onto a node with one, and the route therefore
     * passes through the cell without being told to.
     */
    readonly keyKindAt: Int8Array;
    /**
     * Where each key is *recorded*, as `row * mapWidth + col`, or -1.
     *
     * Not the node it hangs on. The engine collects from a window around the
     * record, so every key in the game is stored a row or two from the cell the hero
     * stands in — which is why this exists: asking whether a key is still on the
     * floor has to be about the record the engine holds, not about the node the route
     * walks through. Getting that wrong makes every key look already collected.
     */
    readonly keyCellAt: Int32Array;
    readonly platforms: PlatformModel;
    readonly currents: AirflowModel;
    readonly stats: NavGraphStats;
    /**
     * Lifts the graph can enter, and lifts it cannot. A lift is unreachable when
     * no node exists at the column the engine would sweep, which happens where a
     * jet runs through open space with nothing to stand or climb on.
     */
    readonly diagnostics: {
        liftsReachable: number;
        liftsUnreachable: number;
        conveyorsReachable: number;
        conveyorsUnreachable: number;
        /** Keys the MDT lists for this map. */
        keysFound: number;
        /** Of those, how many landed on a node, directly or after a one-cell snap. */
        keysOnNodes: number;
        /** Keys whose cell has no node within a cell — unreachable, and counted. */
        keysDropped: number;
    };
}

/**
 * The node a key lying at `(col, row)` is collected on.
 *
 * The key's stored cell is the *item's*, not the hero's. `checkMonsterAlignedToHeroAndTick`
 * compares the hero's position against the record and accepts him anywhere in a small
 * window (`dungeon-monsters.ts:123-152`): rows `row - 2 .. row + 1` and columns
 * `col - 2 .. col + 1`, both asymmetric because the engine walks the two axes in
 * opposite directions from the record. So the nearest node inside that window is
 * the cell the route should cross — walking over it collects the key, because the
 * pickup fires from this same test.
 *
 * mp10's key is stored at (99,41) and the standing position next to it is (99,40):
 * a hero one row higher. That is the window, not an off-by-one.
 *
 * -1 when nothing is in range, which is counted rather than dropped in silence.
 */
function nodeForKey(
    groundOf: Int32Array,
    rideNodeOfCell: Int32Array,
    mapWidth: number,
    col: number,
    row: number,
): number {
    let best = -1;
    let bestDistance = 99;
    for (let dr = -2; dr <= 1; dr++) {
        for (let dc = -2; dc <= 1; dc++) {
            const cell = wrapRow(row + dr) * mapWidth + wrapCol(col + dc, mapWidth);
            const ground = groundOf[cell]!;
            const ride = rideNodeOfCell[cell]!;
            const node = ground >= 0 ? ground : ride;
            if (node < 0) continue;
            // Ground first, then distance: standing over the key is better than a
            // platform a step away.
            const distance = (ground >= 0 ? 0 : 8) + Math.abs(dr) + Math.abs(dc);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = node;
            }
        }
    }
    return best;
}

/**
 * The rope cell the engine probes for a hero standing here: his middle column at
 * his head row (dungeon-vertical.ts:199-202, `heroCoords + 1`).
 *
 * The column wraps, so probing at the seam must not read into the next row.
 */
function ropeAt(grid: NavTileGrid, col: number, row: number): boolean {
    const tile = grid.tiles[row * grid.mapWidth + wrapCol(col, grid.mapWidth)]!;
    return tile === 1 || tile === 2;
}

/** Build the navigation graph for one map from its decoded tile grid. */
export function buildNavGraph(mapId: number, grid: NavTileGrid): NavGraph {
    const meta = NAV_MAP_BY_ID.get(mapId);
    if (!meta) throw new Error(`no map metadata for map ${mapId}`);
    const mapWidth = meta.mapWidth;
    if (grid.mapWidth !== mapWidth) {
        throw new Error(`grid width ${grid.mapWidth} does not match map ${mapId} width ${mapWidth}`);
    }
    const cells = mapWidth * 64;
    const classifier = NavTileClassifier.forMap(mapId);
    const platforms = buildPlatformModel(mapId, grid);
    const currents = buildAirflowModel(mapId, grid);
    // A platform is a floor the hero can land on and nothing else, and it is not in
    // the static map at all, so the jump model has to be told where the slots are.
    // The mark goes on the cell the landing check reads — under the hero's middle
    // foot, three rows below his head. A slot's `headRow` is the platform row minus
    // three, so the platform tile itself is at `headRow + 3`; marking the slot cell
    // instead would tell the model a hero lands one row too high and never on it.
    const platformCells = new Uint8Array(cells);
    for (const slot of platforms.slots) {
        platformCells[(slot.headRow + 3) * mapWidth + wrapCol(slot.leftCol + 1, mapWidth)] = 1;
    }
    // And the up currents, for the same reason: a hero who reaches one mid-flight is
    // taken by it rather than landing. The mask is `heroInLift` over the whole map,
    // i.e. an up current in the hero's three rows at each cell.
    const currentCells = new Uint8Array(cells);
    for (let row = 0; row < 64; row++) {
        for (let col = 0; col < mapWidth; col++) {
            if (heroInLift(grid, classifier, col, row)) currentCells[row * mapWidth + col] = 1;
        }
    }
    const jumps = new JumpModel(grid, classifier, platformCells, currentCells);

    const nodes: NavNode[] = [];
    const groundOf = new Int32Array(cells).fill(-1);
    const ropeOf = new Int32Array(cells).fill(-1);
    const rideOf = new Int32Array(platforms.slots.length).fill(-1);

    // ── nodes ───────────────────────────────────────────────────────────────
    for (let row = 0; row < 64; row++) {
        for (let col = 0; col < mapWidth; col++) {
            const cell = row * mapWidth + col;
            if (isStanding(grid, classifier, col, row)) {
                groundOf[cell] = nodes.length;
                nodes.push({ kind: NODE_GROUND, col, row, platform: -1 });
            }
            // A rope node needs the rope through his middle column at his head row
            // and room for his body; it does not need ground, because he is
            // holding on.
            if (ropeAt(grid, col + 1, row) && heroBoxFree(grid, classifier, col, row)) {
                ropeOf[cell] = nodes.length;
                nodes.push({ kind: NODE_ROPE, col, row, platform: -1 });
            }
        }
    }
    platforms.slots.forEach((slot, index) => {
        rideOf[index] = nodes.length;
        nodes.push({
            kind: NODE_RIDE, col: slot.leftCol, row: slot.headRow, platform: index,
        });
    });

    const portalAtNode = new Int32Array(nodes.length).fill(-1);

    // A ride slot can never also be a ground node: the platform occupies the feet
    // row, and a ground node needs support one row *below* the feet. So a platform
    // mid-air is only reachable by landing on it, and landings must consider ride
    // slots as targets as well as ground.
    const rideNodeOfCell = new Int32Array(cells).fill(-1);
    platforms.slots.forEach((slot, index) => {
        const cell = slot.headRow * mapWidth + wrapCol(slot.leftCol, mapWidth);
        if (rideNodeOfCell[cell] === -1) rideNodeOfCell[cell] = rideOf[index]!;
    });

    /**
     * Where the hero ends up if he arrives at this position: a platform if one is
     * there (it is what he lands on), otherwise open ground.
     */
    const landingAt = (col: number, row: number): number => {
        const r = wrapRow(row);
        const cell = r * mapWidth + wrapCol(col, mapWidth);
        const ride = rideNodeOfCell[cell]!;
        return ride >= 0 ? ride : groundOf[cell]!;
    };

    const groundAt = (col: number, row: number): number => {
        const r = wrapRow(row);
        return groundOf[r * mapWidth + wrapCol(col, mapWidth)]!;
    };

    // Keys. The table lists every key in the original data; whether one is still
    // lying there depends on the save (engine/dungeon-init.ts:75 drops collected
    // ones at dungeon init), so the graph carries them all and the search is told
    // which are present.
    const keyKindAt = new Int8Array(nodes.length);
    const keyCellAt = new Int32Array(nodes.length).fill(-1);
    let keysOnNodes = 0;
    let keysDropped = 0;
    for (const key of NAV_KEYS[mapId] ?? []) {
        const kind = key.kind === 1 ? KEY_LION : KEY_ORDINARY;
        const node = nodeForKey(groundOf, rideNodeOfCell, mapWidth, key.col, key.row);
        if (node < 0) {
            keysDropped++;
            continue;
        }
        if (keyKindAt[node] === 0) keysOnNodes++;
        keyKindAt[node] = kind;
        keyCellAt[node] = wrapRow(key.row) * mapWidth + wrapCol(key.col, mapWidth);
    }
    const ropeAtNode = (col: number, row: number): number => {
        const r = wrapRow(row);
        return ropeOf[r * mapWidth + wrapCol(col, mapWidth)]!;
    };

    // ── edges ───────────────────────────────────────────────────────────────
    /** Per-node edge lists, flattened into CSR at the end. */
    const outgoing: NavEdge[][] = nodes.map(() => []);

    /** Where each node's jump flight went, col/row pairs, see {@link traceAt}. */
    let traceCells = new Int32Array(4096);
    const traceOffset = new Int32Array(nodes.length + 1);


    /**
     * Silkarn's shoes, demanded by any move that *rises* over a slope.
     *
     * A slope is a ramp the hero slides down, and the engine slides him every fourth
     * tick unless he is holding uphill (`slope_assist_on_landing`,
     * dungeon-vertical.ts:563-599) — while airborne it is `check_silkarn_shoes_and_slopes`
     * that stops the shove. So going *up* a slope is not a walk: it takes the shoes.
     *
     * This lives in `add` rather than in one generator because the generators cannot
     * be trusted to remember it. The `STEP` generator emitted `(50,59) -> (51,58)`
     * and the jump generator `(51,58) -> (54,56)` on mp30 with no requirement at all,
     * and the route that used them claimed a bare hero could cross a slope — which
     * the player reported as unwalkable, correctly. The dedicated `SLOPE_UP` edge was
     * gated, but these two were not, because the slope they cross is under the hero's
     * *feet* rather than in the column he is stepping into.
     *
     * The test is deliberately the conservative direction: an ascent that touches a
     * slope anywhere in either 3x3 box is treated as needing the shoes. That can
     * refuse a rise a bare hero could make, and never the reverse.
     */
    const ascentOverSlope = (fromCol: number, fromRow: number, toCol: number, toRow: number): boolean => {
        if (toRow >= fromRow) return false;              // level or downhill: sliding helps
        // The engine reads exactly one cell: the tile under the hero's middle foot,
        // `getSlopeDirectionByTileUnderFeet` (dungeon-vertical.ts:539-561) probing
        // `heroCoords + 2*36 + 1`. Two cells, not nine — asking about the whole box
        // would gate every rise that merely happens to pass near a slope.
        return boxTouchesSlope(fromCol + 1, fromRow + 2)
            || boxTouchesSlope(toCol + 1, toRow + 2);
    };
    const boxTouchesSlope = (col: number, row: number): boolean => {
        const f = flagsAt(grid, classifier, col, row);
        return (f & (NAV.SLOPE_LEFT | NAV.SLOPE_RIGHT)) !== 0;
    };

    const add = (from: number, to: number, kind: number, cost: number, req = 0, portal = -1): void => {
        if (to < 0 || to === from) return;
        // Every node in this graph is on this map, so both endpoints have cells.
        let need = req;
        if ((need & CAP.SLOPE_STAND) === 0) {
            const a = nodes[from]!;
            const b = nodes[to]!;
            if (ascentOverSlope(a.col, a.row, b.col, b.row)) need |= CAP.SLOPE_STAND;
        }
        outgoing[from]!.push({ to, kind, cost, req: need, portal });
    };

    /**
     * Every jump available from a node, to a platform or to the ground.
     *
     * The reachable set is the engine's own: nav/jump.ts replays `jump_press_handler`,
     * `airborne_movement` and `check_floor_for_landing` rather than testing an
     * arc, because the engine tests no arc. What comes back is a landing cell, a
     * frame count, and how many rows the hero rose — the last of which is what
     * decides whether the hero needs Feruza shoes, and it is not the same as the
     * landing's height above the launch, since a jump can rise past its landing
     * and fall back to it.
     *
     * Shared by ground nodes and ride slots: a hero standing on a platform can
     * jump off it exactly as he can from a ledge.
     */
    const addJumpEdges = (fromIndex: number, fromCol: number, fromRow: number): void => {
        const landings = jumps.landingsFrom(fromCol, fromRow);
        for (let i = 0; i < landings.length; i += LANDING_STRIDE) {
            const to = landingAt(landings[i]!, landings[i + 1]!);
            const feruza = landings[i + 4] === 1;
            add(fromIndex, to,
                feruza ? EDGE.JUMP_HIGH : EDGE.JUMP,
                landings[i + 2]!,
                feruza ? CAP.JUMP_HIGH : 0);
        }
        // Keep where he went, so the current sweeps below can ask which cells the
        // flight passed through without walking it a second time.
        const trace = jumps.lastTrace();
        const at = traceOffset[fromIndex]!;
        if (at + trace.length > traceCells.length) {
            const grown = new Int32Array(Math.max(at + trace.length, traceCells.length * 2));
            grown.set(traceCells);
            traceCells = grown;
        }
        traceCells.set(trace, at);
        traceOffset[fromIndex + 1] = at + trace.length;
    };

    /**
     * The cells one node's jump flew through, col/row pairs.
     *
     * Only jumpers have one; `check_airflows_on_hero` sweeps whatever the hero is
     * doing, but a current cannot catch a hero who is standing on a rope.
     */
    const traceAt = (index: number, visit: (col: number, row: number) => void): void => {
        for (let i = traceOffset[index]!; i < traceOffset[index + 1]!; i += 2) {
            visit(traceCells[i]!, traceCells[i + 1]!);
        }
    };

    /**
     * Every landing a hero stepping off at `(col, row)` can fall to.
     *
     * @param skip a node already added by another edge, so one cell is not two edges
     */
    const addFalls = (fromIndex: number, col: number, row: number, skip: number): void => {
        const landings = jumps.landingsFrom(col, row, 0);
        for (let i = 0; i < landings.length; i += LANDING_STRIDE) {
            const to = landingAt(landings[i]!, landings[i + 1]!);
            if (to < 0 || to === skip) continue;
            // A hero swept into a current is pushed, not dropped, so a fall never ends
            // inside one — the lift edges from the cells the flight crosses are what
            // carries him instead.
            if (heroInLift(grid, classifier, nodes[to]!.col, nodes[to]!.row)) continue;
            // Frames, plus the columns he is carried sideways while in the air. Both
            // are frames to him, but without the second the pathfinder will drift
            // as far as a fall can carry him and then fall again — a route that walks
            // west along a corridor comes out as a row of two-column "falls" that
            // never fall. The player drew the walk.
            const across = Math.abs(nodes[to]!.col - col);
            const sideways = Math.min(across, mapWidth - across);
            add(fromIndex, to, EDGE.FALL, landings[i + 2]! + sideways);
        }
    };

    /**
     * The first landing at or below `row` in column `col`: platform or ground.
     *
     * The hero's 3x3 body has to fit in the whole column on the way down. Without
     * that check this scanned 64 rows for any node at all and happily returned a
     * landing fifteen rows below — straight through solid rock. That produced
     * "fall" and conveyor edges that left the hero inside a wall, and the chevrons
     * for them pointed into the scenery.
     */
    const fallTo = (col: number, row: number): { node: number; rows: number } => {
        for (let d = 1; d <= 64; d++) {
            const at = row + d;
            // Anything solid in the way stops the fall there. A landing is the
            // first free cell whose cell below is occupied.
            if (!columnClear(col, at)) return { node: -1, rows: 0 };
            const node = landingAt(col, at);
            if (node >= 0) return { node, rows: d };
        }
        return { node: -1, rows: 0 };
    };

    /** Is the hero's 3-wide body free in this column at this row? */
    const columnClear = (col: number, row: number): boolean => {
        for (let i = 0; i < 3; i++) {
            if (blocksBody(flagsAt(grid, classifier, col + i, row))) return false;
        }
        return true;
    };

    /** Slope tiles a step would cross, in either direction. */
    const slopeFlags = (col: number, row: number): number => flagsAt(grid, classifier, col, row);

    // Doors whose source side is on this map. Intra-map doors become edges here;
    // cross-map ones are handed to the pathfinder through `portalAtNode`, which
    // walks the component's portal pairs rather than a single map's grid.
    const portalByFromNode = new Map<number, number>();
    for (const portalIndex of NAV_PORTALS_BY_MAP[mapId] ?? []) {
        const portal = PORTALS[portalIndex]!;
        const node = groundAt(portal.fromX, portal.fromY);
        if (node >= 0) {
            portalByFromNode.set(node, portalIndex);
            portalAtNode[node] = portalIndex;
        }
    }

    // Ground nodes.
    nodes.forEach((node, index) => {
        if (node.kind !== NODE_GROUND) return;

        // Walk. A current that opposes the direction makes the step impossible.
        for (const dir of [1, -1] as const) {
            const to = groundAt(node.col + dir, node.row);
            if (to < 0) continue;
            if (blockedByCounterCurrent(grid, classifier, node.col + dir, node.row, dir)) continue;
            add(index, to, EDGE.WALK, EDGE_COST.WALK);
        }

        // A one-tile step up or down.
        for (const dir of [1, -1] as const) {
            for (const dr of [1, -1] as const) {
                const to = groundAt(node.col + dir, node.row + dr);
                if (to < 0) continue;
                if (blockedByCounterCurrent(grid, classifier, node.col + dir, node.row + dr, dir)) continue;
                add(index, to, EDGE.STEP, EDGE_COST.STEP);
            }
        }

        // Jumps. Suppressed while an up current holds him.
        const lifted = heroInLift(grid, classifier, node.col, node.row);
        if (!lifted) addJumpEdges(index, node.col, node.row);

        // Step off a ledge. The hero steers while he is in the air, so a fall
        // reaches a whole slope of ground rather than one column — which is how the
        // player crosses into the moving platform in mp80, one column west of the
        // edge he walked off. A hero swept into a current is pushed, not dropped,
        // so a fall never ends inside one; `addFalls` sees to that.
        if (!lifted) {
            for (const dir of [1, -1] as const) {
                addFalls(index, node.col + dir, node.row, -1);
            }
        }

        // Slopes. Climbing one needs Silkarn shoes; sliding down does not.
        for (const dir of [1, -1] as const) {
            const flags = slopeFlags(node.col + dir, node.row);
            if (flags & NAV.SLOPE_LEFT || flags & NAV.SLOPE_RIGHT) {
                const up = groundAt(node.col + dir, node.row - 1);
                if (up >= 0) {
                    add(index, up, EDGE.SLOPE_UP, EDGE_COST.SLOPE_UP, CAP.SLOPE_STAND);
                }
                const down = groundAt(node.col + dir, node.row + 1);
                if (down >= 0) {
                    add(index, down, EDGE.SLOPE_DOWN, EDGE_COST.SLOPE_DOWN);
                }
            }
        }

        // Board a platform whose slot occupies this exact position.
        for (let slotIndex = 0; slotIndex < platforms.slots.length; slotIndex++) {
            const slot = platforms.slots[slotIndex]!;
            if (slot.leftCol !== node.col || slot.headRow !== node.row) continue;
            const rideNode = rideOf[slotIndex]!;
            if (rideNode >= 0) add(index, rideNode, EDGE.BOARD, EDGE_COST.BOARD);
        }

        // A rope in an adjacent column: the engine centres on it with a step, and a
        // current that opposes the step makes that impossible, same as a walk.
        for (const dir of [1, -1] as const) {
            const rope = ropeAtNode(node.col + dir, node.row);
            if (rope >= 0 && !blockedByCounterCurrent(grid, classifier, node.col + dir, node.row, dir)) {
                add(index, rope, EDGE.STEP, EDGE_COST.STEP);
            }
        }
        // A rope in his own middle column, at his own feet: `try_climb_rope`
        // probes exactly that cell first (dungeon-vertical.ts:199-202), so
        // pressing Up puts him straight on it with no step. mp80's player does
        // this at the foot of the column 91 rope to leave the start ledge.
        const under = ropeAtNode(node.col, node.row);
        if (under >= 0) add(index, under, EDGE.CLIMB, EDGE_COST.CLIMB);

        // A door on this cell. A town door is never routed through; a door onto
        // another map is left to the pathfinder, which follows the component's
        // portal pairs. Only a door within this map becomes an edge here.
        const portalIndex = portalByFromNode.get(index);
        if (portalIndex !== undefined) {
            const portal = PORTALS[portalIndex]!;
            if (!portal.toTown && portal.destMapId === mapId) {
                const to = groundAt(portal.toX, portal.toY);
                if (to >= 0) {
                    const locked = portal.key !== 0;
                    add(index, to, EDGE.DOOR,
                        locked ? EDGE_COST.DOOR_LOCKED : EDGE_COST.DOOR,
                        locked ? (portal.key === 2 ? CAP.LION_KEY : CAP.KEY) : 0,
                        portalIndex);
                }
            }
        }
    });

    // Rope nodes.
    nodes.forEach((node, index) => {
        if (node.kind !== NODE_ROPE) return;
        for (const dr of [1, -1] as const) {
            const to = ropeAtNode(node.col, node.row + dr);
            if (to >= 0) add(index, to, EDGE.CLIMB, EDGE_COST.CLIMB);
        }
        // Step off the rope onto the ground beneath, or alongside it.
        const same = groundAt(node.col, node.row);
        if (same >= 0) add(index, same, EDGE.STEP, EDGE_COST.STEP);
        // Step off it, left or right. `on_right_pressed` moves him one column and
        // then returns because he is on a rope (dungeon-vertical.ts:139,146); the
        // rope frame finds no rope at his new middle column and puts him back in the
        // dungeon (dungeon-states.ts:258-280), where the cell he stepped to stands or
        // falls by the ordinary rules.
        //
        // This is the only way off a rope. `jump_press_handler` returns the moment
        // ON_ROPE_FLAGS is set (dungeon-hero.ts:322), so there is no jumping off one;
        // climbing is `try_climb_rope`'s `moveHeroUp` (dungeon-vertical.ts:236), and
        // leaving is one step sideways.
        for (const dir of [1, -1] as const) {
            if (!heroCanStepSideways(grid, classifier, node.col, node.row, dir)) continue;
            const there = groundAt(node.col + dir, node.row);
            if (there >= 0) add(index, there, EDGE.STEP, EDGE_COST.STEP);
            // Off the side and down. He picks a column every row he is in the air
            // (`airborne_movement` reads INPUT_DIRS each tick), so the fall from one
            // column reaches a whole slope of ground — which is how the gallery in
            // mp80 is reached from the top of the rope, and a straight `fallTo` does
            // not see it.
            addFalls(index, node.col + dir, node.row, there);
        }
        // And straight down off the foot of it.
        addFalls(index, node.col, node.row, -1);
    });

    // Ride slots.
    platforms.slots.forEach((slot, slotIndex) => {
        const index = rideOf[slotIndex]!;
        if (index < 0) return;
        for (const [next, kind, cost] of [
            [slot.next, slot.kind === 2 ? EDGE.RIDE_H : EDGE.RIDE_V,
                slot.kind === 2 ? EDGE_COST.RIDE_H_SLOW : EDGE_COST.RIDE_V],
            // A vertical lift carries him either way, because he drives it with Up
            // and Down (dungeon-vertical.ts:380-467). `chain` links every adjacent
            // pair both ways, but `next` alone walks the chain in one direction only
            // — down — so a lift could be ridden down and never up. That is how the
            // mp31 lift at column 5 lost its route: the hero jumps on at (5,23),
            // presses Up, and the graph had no edge to (5,22) or anywhere above it.
            //
            // A collapsing platform is deliberately *not* linked upwards: it descends
            // one row per frame and never rises (dungeon-vertical.ts:472-484).
            // A horizontal platform is fully automated, and the hero can always wait
            // for it to come back, so one direction already spans both.
            [slot.kind === 0 ? slot.prev : -1, EDGE.RIDE_V, EDGE_COST.RIDE_V],
        ] as [number, number, number][]) {
            const to = next < 0 ? -1 : rideOf[next]!;
            add(index, to, kind, cost);
        }
        // Leave the platform: sideways onto ground at his own height, or upward.
        for (const dir of [1, -1] as const) {
            const to = groundAt(slot.leftCol + dir, slot.headRow);
            if (to >= 0) add(index, to, EDGE.ALIGHT, EDGE_COST.ALIGHT);
        }
        const up = groundAt(slot.leftCol, slot.headRow - 1);
        if (up >= 0) add(index, up, EDGE.ALIGHT, EDGE_COST.ALIGHT);
        // Or simply drop off it.
        const drop = fallTo(slot.leftCol, slot.headRow);
        if (drop.node >= 0) add(index, drop.node, EDGE.DROP, drop.rows);
        // Or walk off the edge and fall. A hero on a platform is standing, not
        // airborne, so stepping over the side is a step and then a fall, and the fall
        // drifts: `airborne_movement` reads INPUT_DIRS every tick. In mp80 that is
        // the whole last leg of the player's route — ride the platform to
        // (149,51), walk right off it, and fall thirteen rows, through the seam at
        // row 63, into (149,6).
        for (const dir of [1, -1] as const) {
            if (!heroCanStepSideways(grid, classifier, slot.leftCol, slot.headRow, dir)) continue;
            const there = groundAt(slot.leftCol + dir, slot.headRow);
            if (there >= 0) add(index, there, EDGE.ALIGHT, EDGE_COST.ALIGHT);
            addFalls(index, slot.leftCol + dir, slot.headRow, there);
        }
        // Or jump off it. A platform is a launchpad: without these, a ride that
        // cannot be walked off sideways is a dead end, and the level's whole upper
        // route was unreachable because of it.
        addJumpEdges(index, slot.leftCol, slot.headRow);
    });

    // ── current edges ────────────────────────────────────────────────────────
    // `checkAirflowsOnHero` runs every frame from mainUpdateRenderPre whatever the
    // hero is doing — grounded, on a rope, or in mid-air — and sweeps him whenever
    // an up current sits in his middle column at his head, body or feet row. So the
    // hero is very often lifted *while falling or jumping into* a jet rather than
    // while standing beside one, and a standing-positions-only node model would miss
    // most of them.
    //
    // Sweep a mask first: sweptAt(col,row) is a single array read, so testing a
    // whole arc is cheap.
    const sweptAt = new Uint8Array(cells);
    for (let col = 0; col < mapWidth; col++) {
        for (let row = 0; row < 64; row++) {
            if (heroInLift(grid, classifier, col, row)) sweptAt[row * mapWidth + col] = 1;
        }
    }
    const isSwept = (col: number, row: number): boolean =>
        sweptAt[wrapRow(row) * mapWidth + wrapCol(col, mapWidth)] === 1;

    /**
     * Stops of every lift the hero could be carried to, keyed by the lift's column
     * *and the run it belongs to*.
     *
     * Keying by column alone mixes every current in that column: mp80's column 96
     * has two, one reaching rows 21-29 and one 44-50, and a hero swept at row 21 was
     * offered the second run's stop at row 50 — an **upward** current carrying him
     * twenty-nine rows *down*. `LiftModel.topRow` and `rows` say where each run
     * starts and how far it reaches, which is what identifies the one he is in.
     */
    type LiftExit = { stop: number; ticks: number; headRow: number };
    /**
     * `span` is how many rows of head position the run covers: the tiles run from
     * two rows below `topRow`, and a hero is swept while any of the three rows of
     * his body is in the current, so the swept window is `rows + 2` tall.
     */
    const stopsByRun = new Map<number, { span: number; stops: LiftExit[] }[]>();
    for (const lift of currents.lifts) {
        const entryCol = wrapCol(lift.x - 1, mapWidth);
        const list = stopsByRun.get(entryCol) ?? [];
        // `topRow` is the hero's *head* row at the top of the run, and the tiles run
        // from two rows below that to the end. He is swept while any of the three is
        // in his middle column, so the window a hero can be caught in is head rows
        // `topRow .. topRow + rows + 1` — three rows taller than the tiles.
        const span = lift.rows + 2;
        const stops: LiftExit[] = [];
        for (const stop of lift.stops) {
            if (!stop.escapable) continue;
            const node = groundAt(stop.leftCol, stop.headRow);
            if (node < 0) continue;
            stops.push({ stop: node, ticks: stop.ticks, headRow: stop.headRow });
        }
        list.push({ span, stops });
        stopsByRun.set(entryCol, list);
    }

    /**
     * The lifts a hero at `(sweptCol, sweptRow)` can be carried up by.
     *
     * Two rules, and both are about direction. An up current only carries him
     * *up*, so a stop at or below where he was swept is not an exit; and a current
     * only reaches its own run, so a stop further above than the run is tall is
     * another current's. Both are measured as a distance in rows that wraps — the
     * runs are a few tiles long, so the wrap cannot confuse up with down, and the
     * bound is what keeps one run from offering another's stops.
     *
     * mp80's column 96 is the case that mattered: two currents in one column, one
     * reaching rows 21-29 and one 44-50. Keyed by column alone, a hero swept at row
     * 21 was offered the second run's stop at row 50 — an upward current carrying
     * him twenty-nine rows *down*, which the player rightly called impossible.
     */
    const liftStopsAt = (sweptCol: number, sweptRow: number): { stop: number; ticks: number }[] => {
        const runs = stopsByRun.get(wrapCol(sweptCol, mapWidth));
        if (!runs) return [];
        const out: { stop: number; ticks: number }[] = [];
        for (const run of runs) {
            for (const exit of run.stops) {
                const up = wrapRow(sweptRow - exit.headRow);
                if (up < 1 || up > run.span) continue;
                out.push({ stop: exit.stop, ticks: exit.ticks });
            }
        }
        return out;
    };

    const graphDiagnostics = {
        liftsReachable: 0, liftsUnreachable: 0,
        conveyorsReachable: 0, conveyorsUnreachable: 0,
    };
    const reachedLifts = new Set<number>();

    /** Send the hero from `from` to a lift he can be swept by on his way. */
    const enterLift = (from: number, sweptCol: number, sweptRow: number): void => {
        if (!isSwept(sweptCol, sweptRow)) return;
        for (const { stop, ticks } of liftStopsAt(sweptCol, sweptRow)) {
            add(from, stop, EDGE.LIFT, ticks + 1);
        }
        reachedLifts.add(wrapCol(sweptCol, mapWidth));
    };

    nodes.forEach((node, index) => {
        // Standing in it, or climbing through it.
        enterLift(index, node.col, node.row);
        // Walking off a ledge into it.
        for (const dir of [1, -1] as const) {
            const land = fallTo(node.col + dir, node.row);
            for (let d = 1; d <= land.rows; d++) {
                enterLift(index, node.col + dir, node.row + d);
            }
        }
        // Flying through it. A jump puts him in a great many cells, and the sweep
        // is by position, so it is every one of them.
        if (heroInLift(grid, classifier, node.col, node.row)) return;
        traceAt(index, (col, row) => enterLift(index, col, row));
    });

    for (let i = 0; i < currents.lifts.length; i++) {
        const entryCol = wrapCol(currents.lifts[i]!.x - 1, mapWidth);
        if (reachedLifts.has(entryCol)) graphDiagnostics.liftsReachable++;
        else graphDiagnostics.liftsUnreachable++;
    }

    // A conveyor sweeps him one way, and like a lift he is usually swept by
    // falling or jumping into it rather than by standing in it — the current acts
    // on his body every frame whatever he is doing. So the entry is found along his
    // arcs, the same way a lift's is.
    //
    // Direction per position: 1 left, 2 right, 0 none. A position is "in" a
    // conveyor when his middle column holds a conveyor tile.
    const conveyorAt = new Uint8Array(cells);
    for (let col = 0; col < mapWidth; col++) {
        for (let row = 0; row < 64; row++) {
            const flags = flagsAt(grid, classifier, col + 1, row);
            if (flags & NAV.AIRFLOW_LEFT) conveyorAt[row * mapWidth + col] = 1;
            else if (flags & NAV.AIRFLOW_RIGHT) conveyorAt[row * mapWidth + col] = 2;
        }
    }
    const conveyorDirAt = (col: number, row: number): number =>
        conveyorAt[wrapRow(row) * mapWidth + wrapCol(col, mapWidth)]!;

    /**
     * Exits of every conveyor, keyed by the hero's left column while swept.
     *
     * While a conveyor holds him he is airborne — it pushes him sideways every
     * frame — so the swept position is only a *body-clear* cell, not a standing
     * position. A ride therefore only offers an exit where the conveyor's own row
     * actually offers a standing position. A conveyor in open space has none, and
     * is not offered as a way to get somewhere: the hero has to leave it on his own
     * terms with a jump or a fall, which is a separate edge from a real node.
     *
     * Reaching for the first landing *below* the swept cell instead — which this
     * used to do — turns every conveyor into "swept sideways, then plummet", and
     * that is how a route came to run twenty rows underground.
     */
    const conveyorExits = new Map<number, { to: number; ticks: number }[]>();
    for (const run of currents.conveyors) {
        const headRow = wrapRow(run.y - 2);
        for (const exit of run.exits) {
            // While swept, the current is in his middle column.
            const sweptCol = wrapCol(exit.fromColumn - 1, mapWidth);
            if (!columnClear(sweptCol, headRow)) continue;
            const stand = groundAt(sweptCol, headRow);
            if (stand < 0) continue;
            // Keyed by column *and row*. A conveyor carries the hero sideways along
            // its own row, so an exit twenty rows up is not an exit from it — and
            // keying by column alone offered him one, which is how a route came to
            // cross a room in a current that only moves along one line.
            const key = headRow * mapWidth + sweptCol;
            const list = conveyorExits.get(key) ?? [];
            list.push({ to: stand, ticks: exit.ticks });
            conveyorExits.set(key, list);
        }
    }

    const reachedConveyors = new Set<number>();
    nodes.forEach((node, index) => {
        const enterConveyor = (col: number, row: number): void => {
            const dir = conveyorDirAt(col, row);
            if (dir === 0) return;
            const list = conveyorExits.get(wrapRow(row) * mapWidth + wrapCol(col, mapWidth));
            if (!list) return;
            const kind = dir === 1 ? EDGE.CARRY_L : EDGE.CARRY_R;
            for (const { to, ticks } of list) add(index, to, kind, ticks + 1);
            reachedConveyors.add(wrapCol(col, mapWidth));
        };
        enterConveyor(node.col, node.row);
        for (const dir of [1, -1] as const) {
            const land = fallTo(node.col + dir, node.row);
            for (let d = 1; d <= land.rows; d++) enterConveyor(node.col + dir, node.row + d);
        }
        if (heroInLift(grid, classifier, node.col, node.row)) return;
        traceAt(index, (col, row) => enterConveyor(col, row));
    });

    for (let i = 0; i < currents.conveyors.length; i++) {
        const entryCol = wrapCol(currents.conveyors[i]!.columns[0]! - 1, mapWidth);
        if (reachedConveyors.has(entryCol)) graphDiagnostics.conveyorsReachable++;
        else graphDiagnostics.conveyorsUnreachable++;
    }

    // ── flatten to CSR ───────────────────────────────────────────────────────
    const edgeOffsets = new Int32Array(nodes.length + 1);
    const flat: NavEdge[] = [];
    const byEdgeKind: Record<number, number> = {};
    for (let i = 0; i < outgoing.length; i++) {
        edgeOffsets[i] = flat.length;
        for (const edge of outgoing[i]!) {
            flat.push(edge);
            byEdgeKind[edge.kind] = (byEdgeKind[edge.kind] ?? 0) + 1;
        }
    }
    edgeOffsets[nodes.length] = flat.length;

    // What each node's footprint touches, so the pathfinder can gate on it and the
    // map screen can warn about it.
    const nodeHazard = new Uint8Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        let h = 0;
        for (let j = 0; j < 3; j++) {
            for (let k = 0; k < 3; k++) {
                const f = flagsAt(grid, classifier, node.col + k, node.row + j);
                if (f & NAV.AGGRESSIVE) h |= HAZARD_AGGRESSIVE;
                if (f & (NAV.AIRFLOW_UP | NAV.AIRFLOW_LEFT | NAV.AIRFLOW_RIGHT)) h |= HAZARD_CURRENT;
                if (f & (NAV.SLOPE_LEFT | NAV.SLOPE_RIGHT)) h |= HAZARD_SLOPE;
                if (f & NAV.ROPE) h |= HAZARD_ROPE;
            }
        }
        nodeHazard[i] = h;
    }

    const stats: NavGraphStats = {
        nodes: nodes.length,
        edges: flat.length,
        ground: countKind(nodes, NODE_GROUND),
        rope: countKind(nodes, NODE_ROPE),
        ride: countKind(nodes, NODE_RIDE),
        byEdgeKind,
    };

    return {
        mapId, mapWidth, nodes, edges: flat, edgeOffsets, groundOf, ropeOf, rideOf,
        nodeHazard, portalAtNode, keyKindAt, keyCellAt, platforms, currents, stats,
        diagnostics: {
            ...graphDiagnostics,
            keysFound: (NAV_KEYS[mapId] ?? []).length,
            keysOnNodes,
            keysDropped,
        },
    };
}

function countKind(nodes: readonly NavNode[], kind: number): number {
    let n = 0;
    for (const node of nodes) if (node.kind === kind) n++;
    return n;
}

/** Edges leaving `index`, as a subarray of the flat edge list. */
export function edgesOf(graph: NavGraph, index: number): NavEdge[] {
    return graph.edges.slice(graph.edgeOffsets[index]!, graph.edgeOffsets[index + 1]!);
}

/**
 * Visit every edge leaving `index` without allocating.
 *
 * `edgesOf` slices, which is fine for a handful of nodes but not for a whole
 * cavern: at ~26k nodes and ~200k edges the copies dominate.
 */
export function forEachEdge(
    graph: NavGraph,
    index: number,
    visit: (edge: NavEdge, from: number) => void,
): void {
    const from = graph.edgeOffsets[index]!;
    const to = graph.edgeOffsets[index + 1]!;
    for (let i = from; i < to; i++) visit(graph.edges[i]!, index);
}

/** Total edges leaving any node in `indexes`. */
export function edgeCountAt(graph: NavGraph, indexes: Iterable<number>): number {
    let n = 0;
    for (const i of indexes) n += graph.edgeOffsets[i + 1]! - graph.edgeOffsets[i]!;
    return n;
}

/** The node a standing position maps to, or -1. */
export function nodeAt(graph: NavGraph, col: number, row: number): number {
    const r = wrapRow(row);
    return graph.groundOf[r * graph.mapWidth + wrapCol(col, graph.mapWidth)]!;
}

/** Total doors on this map, for buffer sizing by the pathfinder. */
export function doorCountFor(mapId: number): number {
    return NAV_DOOR_COUNT[mapId] ?? 0;
}
