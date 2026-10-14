/**
 * nav-graph.ts — build the navigation graph for one cavern.
 *
 * A **node** is a standing position: the hero's left column and head row, an
 * open middle column, and ground beneath (geometry.isStanding). Three kinds:
 *
 *   GROUND  the hero can stand on it
 *   ROPE    a rope runs through his middle column at his head row and his body
 *           fits, so he can climb it
 *   RIDE    a platform slot from nav/platforms.ts
 *
 * An **edge** is one traversal the hero can perform, with a cost in ticks and the
 * capability it needs. Costs come from EDGE_COST.
 *
 * Two edge families are deliberately *static*. Platforms and currents both act
 * automatically, but neither makes reachability time-dependent — the hero can
 * always wait for a platform or hold on to a current — so they are folded into
 * the same graph rather than needing a clock.
 *
 * The airflow suppression rules are applied here, not in the pathfinder, because
 * they are properties of the geometry:
 *
 *   - a walk into a current that opposes it is impossible
 *     (dungeon-hero.ts:218-268), so no such edge exists;
 *   - while lifted the hero cannot fall or jump (dungeon-input.ts:524-525), so no
 *     fall or jump leaves a lift column, though he can always step sideways out;
 *   - a hero swept into a current is pushed, not dropped, so no fall ends inside
 *     one.
 */

import {
    NAV, EDGE, EDGE_COST, CAP, KEY_LION, KEY_ORDINARY, JUMP_TICK_PENALTY,
    blocksBody,
} from './types.js';
import { NavTileClassifier } from './attributes.js';
import {
    blockedByCounterCurrent, conveyorDir, flagsAt, heroCanStepSideways, heroInLift,
    isStanding, middleColumnFree, wrapCol, wrapRow,
} from './geometry.js';
import {
    JumpModel, LANDING_STRIDE, STEER_ALL, STEER_STRAIGHT, STEER_LEFT, STEER_RIGHT,
} from './jump.js';
import {
    buildPlatformModel, isLandingSlot, PLATFORM_HORIZONTAL, PLATFORM_VERTICAL,
    type PlatformModel,
} from './platforms.js';
import type { PlatformPlaces } from './platform-state.js';
import { NAV_KEYS } from '../../data/nav/nav-keys.js';
import { NAV_ACCESSORIES } from '../../data/nav/nav-accessories.js';
import { buildAirflowModel, type AirflowModel } from './airflows.js';
import {
    PORTALS, NAV_PORTALS_BY_MAP, NAV_DOOR_COUNT,
    NAV_BOSS_EXITS, NAV_BOSS_EXIT_BY_MAP,
} from '../../data/nav/nav-portals.js';
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
     * Cell -> the node a hero at that cell stands at: rope, then ride, then
     * ground. -1 where nothing can hold him.
     */
    readonly standOf: Int32Array;
    /**
     * Edge index -> the cell, as `row * mapWidth + col`, where an `EDGE.LIFT` hop
     * has the hero swept by a current.
     *
     * A lift edge is not a move between its two ends: the hero passes through
     * some cell an up current occupies and is carried straight up that column to
     * the exit, and that cell is neither end. A line drawn straight between the
     * two standing positions would run through whatever rock lies between them.
     */
    readonly liftSwept: ReadonlyMap<number, number>;
    /**
     * Per-node hazard flags, one entry per node: HAZARD_* bits describing what
     * the hero's 3x3 footprint touches there.
     *
     * Recorded on the geometry rather than baked into the edges, because whether
     * a crossing is allowed depends on what the hero is wearing: one graph serves
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
     * Node -> index into {@link NAV_BOSS_EXITS} for a node the arena's post-boss
     * door can be walked into from, or -1.
     *
     * A boss arena's own door table reads as empty, so this is the only way out of
     * one — and the exit has no column of its own. `load_place_and_reinit` stamps
     * the record's x0 with the column the hero is standing on when the boss dies
     * (engine/dungeon-cutover.ts:76-99), so the door appears wherever he is, and
     * every standing position on row `y0 + 1` is an exit.
     */
    readonly bossExitAtNode: Int32Array;
    /**
     * The key lying on each node: 0 none, 1 ordinary, 2 Lion-Head.
     *
     * A key is an item standing on the floor, so it needs no edge of its own — the
     * pickup fires from the ordinary alignment test while the hero walks over the
     * cell (`checkMonsterAlignedToHeroAndTick`, dungeon-monsters.ts:123).
     */
    readonly keyKindAt: Int8Array;
    /**
     * Where each key is *recorded*, as `row * mapWidth + col`, or -1.
     *
     * Not the node it hangs on. The engine collects from a window around the
     * record, so every key in the game is stored a row or two from the cell the
     * hero stands in — and asking whether a key is still on the floor has to be
     * about the record the engine holds.
     */
    readonly keyCellAt: Int32Array;
    /**
     * The pair of shoes lying on each node, as a `NavShoe`, or 0 for none.
     *
     * A pair is an item on the floor exactly as a key is. Unlike a key it is not
     * spent: it goes into the hero's inventory and stays, so the search only ever
     * *adds* a bit here.
     */
    readonly accessoryShoeAt: Int8Array;
    /**
     * Where each pair of shoes is *recorded*, as `row * mapWidth + col`, or -1.
     *
     * The same distinction as {@link keyCellAt}, and for the same reason.
     */
    readonly accessoryCellAt: Int32Array;
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
        /** Pairs of shoes the MDT lists for this map. */
        shoesFound: number;
        /** Of those, how many landed on a node. */
        shoesOnNodes: number;
        /** Pairs whose cell has no node within a cell — unreachable, and counted. */
        shoesDropped: number;
    };
}

/**
 * The node a key lying at `(col, row)` is collected on.
 *
 * The key's stored cell is the *item's*, not the hero's.
 * `checkMonsterAlignedToHeroAndTick` compares the hero's position against the
 * record and accepts him anywhere in a small window
 * (`dungeon-monsters.ts:123-152`): rows `row - 2 .. row + 1` and columns
 * `col - 2 .. col + 1`, both asymmetric because the engine walks the two axes in
 * opposite directions from the record. So the nearest node inside that window is
 * the cell the route should cross.
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
export function buildNavGraph(
    mapId: number,
    grid: NavTileGrid,
    /** Where this cavern's platforms stand right now, by left column. */
    places?: PlatformPlaces,
): NavGraph {
    const meta = NAV_MAP_BY_ID.get(mapId);
    if (!meta) throw new Error(`no map metadata for map ${mapId}`);
    const mapWidth = meta.mapWidth;
    if (grid.mapWidth !== mapWidth) {
        throw new Error(`grid width ${grid.mapWidth} does not match map ${mapId} width ${mapWidth}`);
    }
    const cells = mapWidth * 64;
    /** Short-way signed row delta across the seam; positive is down. Range [-32, 31]. */
    const rowDelta = (from: number, to: number): number => ((to - from + 32) & 63) - 32;
    /** Short-way signed column delta; mapWidth need not be a power of two. */
    const colDelta = (from: number, to: number): number => {
        const half = mapWidth >> 1;
        return ((((to - from + half) % mapWidth) + mapWidth) % mapWidth) - half;
    };
    const classifier = NavTileClassifier.forMap(mapId);
    const platforms = buildPlatformModel(mapId, grid, places);
    const currents = buildAirflowModel(mapId, grid);
    // A platform is a floor the hero can land on and nothing else, and it is not
    // in the static map at all, so the jump model has to be told where the slots
    // are. The mark goes on the cell the landing check reads — under the hero's
    // middle foot, three rows below his head.
    //
    // A platform is a landing surface only on the row it is standing at right now,
    // and that rule differs between the two families:
    //
    // A **vertical** platform moves up and down. It has one row, so `isLandingSlot`
    // — the row it is on — is the whole of it.
    //
    // A **horizontal** platform moves sideways at a fixed row. Every column of its
    // span is a row it *will be at*, and it goes there and comes back, so a hero
    // who falls anywhere along the span is landed on when it arrives under him.
    // The whole span is therefore landable.
    const platformCells = new Uint8Array(cells);
    for (const slot of platforms.slots) {
        if (slot.kind === PLATFORM_HORIZONTAL) {
            const platformRow = slot.platformRow ?? (slot.headRow + 3);
            platformCells[wrapRow(platformRow) * mapWidth + wrapCol(slot.leftCol + 1, mapWidth)] = 1;
            continue;
        }
        if (!isLandingSlot(slot)) continue;
        platformCells[wrapRow(slot.headRow + 3) * mapWidth + wrapCol(slot.leftCol + 1, mapWidth)] = 1;
    }
    // And the up currents, for the same reason: a hero who reaches one mid-flight
    // is taken by it rather than landing. The mask is `heroInLift` over the whole
    // map.
    const currentCells = new Uint8Array(cells);
    for (let row = 0; row < 64; row++) {
        for (let col = 0; col < mapWidth; col++) {
            if (heroInLift(grid, classifier, col, row)) currentCells[row * mapWidth + col] = 1;
        }
    }
    // `restingCells` is what makes the platform a thing rather than a place: the
    // three tiles it is standing on stop a flight, exactly as the map's own solid
    // tiles do.
    const jumps = new JumpModel(grid, classifier, platformCells, currentCells, platforms.restingCells);

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
            // and room for his **middle column** — not his whole body.
            //
            // `try_climb_rope` (dungeon-vertical.ts:198-239) asks exactly two
            // questions: is the cell at his middle column, head row a rope, and is
            // the one above it a rope so he can go on climbing. There is no body
            // test anywhere in it, so a hero hanging with a wall in his *side*
            // column is a position the game has.
            if (ropeAt(grid, col + 1, row) && middleColumnFree(grid, classifier, col, row)) {
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

    // A boss arena's way out. The post-boss door has no column, so it is offered
    // from every standing position on the row the engine matches on — heroAbsY - 1
    // === y0 — which is where the door will be standing when the boss dies.
    const bossExitAtNode = new Int32Array(nodes.length).fill(-1);
    const bossExitIndex = NAV_BOSS_EXIT_BY_MAP[mapId] ?? -1;
    if (bossExitIndex >= 0) {
        const row = (NAV_BOSS_EXITS[bossExitIndex]!.y0 + 1) & 0x3f;
        nodes.forEach((node, index) => {
            if (node.kind === NODE_GROUND && node.row === row) bossExitAtNode[index] = bossExitIndex;
        });
    }

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
     * Cell -> the node a hero occupying that cell is *at*, in the engine's own
     * order of precedence: a rope first, then a platform he is riding, then the
     * ground under him. This is `landingAt`'s answer, and it is the answer every
     * cell question needs.
     *
     * `groundOf` alone is not enough for the caller that asks "where is the hero":
     * a rope node is built from the rope in his middle column and does not need
     * ground, so every cell of a rope is absent from `groundOf`.
     */
    const standOf = new Int32Array(cells);
    for (let i = 0; i < cells; i++) {
        const rope = ropeOf[i]!;
        const ride = rideNodeOfCell[i]!;
        standOf[i] = rope >= 0 ? rope : (ride >= 0 ? ride : groundOf[i]!);
    }

    /**
     * Where the hero ends up if he arrives at this position: a rope he is holding
     * if there is one, a platform if one is there (it is what he lands on),
     * otherwise open ground.
     */
    const landingAt = (col: number, row: number): number => {
        const r = wrapRow(row);
        const cell = r * mapWidth + wrapCol(col, mapWidth);
        const rope = ropeOf[cell]!;
        if (rope >= 0) return rope;
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
    // Shoes, the same way: an item on the floor, placed on the node the hero
    // collects it from. There are four in the whole game and none is duplicated,
    // so a node can hold at most one pair and a bit per kind is enough to say what
    // the hero is carrying.
    //
    // The record cell is kept beside it for the reason `keyCellAt` exists: the
    // node a pickup snaps to is not the cell the engine holds it at, and
    // `shoePresent` is answered from the engine's own entity list.
    const accessoryShoeAt = new Int8Array(nodes.length);
    const accessoryCellAt = new Int32Array(nodes.length).fill(-1);
    let shoesOnNodes = 0;
    let shoesDropped = 0;
    for (const shoe of NAV_ACCESSORIES[mapId] ?? []) {
        const node = nodeForKey(groundOf, rideNodeOfCell, mapWidth, shoe.col, shoe.row);
        if (node < 0) {
            shoesDropped++;
            continue;
        }
        shoesOnNodes++;
        accessoryShoeAt[node] = shoe.shoe;
        accessoryCellAt[node] = wrapRow(shoe.row) * mapWidth + wrapCol(shoe.col, mapWidth);
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
    // Per-node [start, end) into traceCells. Nodes that never jump keep 0..0, so a
    // single shared offset array (which a skipped node left at 0) cannot alias
    // them onto the start of the buffer.
    const traceStart = new Int32Array(nodes.length);
    const traceEnd = new Int32Array(nodes.length);
    /** Where a node's trace stops being plain-jump cells and starts being Feruza-only. */
    const traceSplit = new Int32Array(nodes.length);
    let traceLen = 0;
    /**
     * `node * cells + cell` for every cell a node's jump edge lands on.
     *
     * A flight that ends in a current is already an edge: the jump lands on the
     * node inside it and the current's own edge carries on from there. Sweeping
     * the same cell again from the trace would add a second, cheaper edge that
     * skips the jump's cost, so the sweeps ask this first.
     */
    const jumpLanded = new Set<number>();

    /**
     * Silkarn's shoes, demanded by any move that *rises* over a slope.
     *
     * A slope is a ramp the hero slides down, and the engine slides him every
     * fourth tick unless he is holding uphill (`slope_assist_on_landing`,
     * dungeon-vertical.ts:563-599). So going *up* a slope is not a walk: it takes
     * the shoes.
     *
     * The engine reads exactly one cell for this: the tile under the hero's middle
     * foot (`getSlopeDirectionByTileUnderFeet`, dungeon-vertical.ts:539-561,
     * probing `heroCoords + 2*36 + 1`). The test here touches the same two cells
     * in either 3x3 box, which is the conservative direction.
     */
    const ascentOverSlope = (
        fromCol: number, fromRow: number, toCol: number, toRow: number, kind: number,
    ): boolean => {
        // Falls, drops, currents and doors can span more than half the cylinder,
        // so the short-way row delta says nothing about their direction. A fall
        // only ever goes down and a door is a teleport; neither is an ascent.
        if (kind === EDGE.FALL || kind === EDGE.DROP || kind === EDGE.LIFT
            || kind === EDGE.CARRY_L || kind === EDGE.CARRY_R || kind === EDGE.DOOR) return false;
        // Seam-aware: row 63 is one row *above* row 0.
        if (rowDelta(fromRow, toRow) >= 0) return false; // level or downhill: sliding helps
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
            if (ascentOverSlope(a.col, a.row, b.col, b.row, kind)) need |= CAP.SLOPE_STAND;
        }
        outgoing[from]!.push({ to, kind, cost, req: need, portal });
    };

    /**
     * Every jump available from a node, to a platform or to the ground.
     *
     * The reachable set is the engine's own: nav/jump.ts replays
     * `jump_press_handler`, `airborne_movement` and `check_floor_for_landing`
     * rather than testing an arc, because the engine tests no arc. What comes back
     * is a landing cell, a frame count, and how many rows the hero rose — the last
     * of which is what decides whether the hero needs Feruza shoes, and it is not
     * the same as the landing's height above the launch.
     *
     * Shared by ground nodes and ride slots: a hero standing on a platform can
     * jump off it exactly as he can from a ledge.
     */
    const addJumpEdges = (fromIndex: number, fromCol: number, fromRow: number): void => {
        const landings = jumps.landingsFrom(fromCol, fromRow);
        for (let i = 0; i < landings.length; i += LANDING_STRIDE) {
            const toCol = landings[i]!;
            const toRow = landings[i + 1]!;
            const to = landingAt(toCol, toRow);
            if (to < 0) continue;
            const target = nodes[to]!;
            // A landing the blow goes against is not a place he comes to rest in:
            // `check_airflows_on_hero` runs first every frame and shoves him two
            // columns before he has stood anywhere.
            if (pushedBack(fromIndex, toCol, to)) continue;
            // How far below the launch this landing is, with the seam counted.
            // Row 63 sits one row *above* row 0, so the raw `toRow - fromRow`
            // would read a hop from row 0 to row 63 as sixty-three rows down when
            // it is one row up.
            //
            // `rises` is how far the arc climbed before it turned over, so the
            // apex is `fromRow - rises` and the landing is `below` rows past it.
            const rises = landings[i + 3]!;
            const apex = wrapRow(fromRow - rises);
            const below = wrapRow(toRow - apex) - rises;
            // A rope he would land on *below* the cell he jumped from is not one
            // he catches: the arc has already turned over by then and the game
            // does not let him take the rope on the way down.
            if (target.kind === NODE_ROPE && below > 0) continue;
            // A landing he cannot see is not one he can aim at. The model lets a
            // jump drift one column per row it falls, so a jump that lands twelve
            // rows down is arithmetically reachable and practically a blind throw.
            if (below > 5) continue;
            const feruza = landings[i + 4] === 1;
            // Check if this ascending jump passes through any slope cells.
            // The engine's airborne_movement (dungeon-vertical.ts:563-599) calls
            // check_silkarn_shoes_and_slopes on every frame, which probes the tile
            // under the hero's middle foot and stops the slope shove if he has
            // Silkarn shoes.
            let req = feruza ? CAP.JUMP_HIGH : 0;
            // `below` is the landing's drop below the launch with the seam counted,
            // so negative means the landing is above the launch.
            if (below < 0) {
                // Get the flight path for this specific landing.
                const path = jumps.flightPath(fromCol, fromRow, toCol, toRow);
                for (let j = 0; j < path.length; j += 2) {
                    const col = path[j]!;
                    const row = path[j + 1]!;
                    // Check the middle foot position (col+1, row+2).
                    const f = flagsAt(grid, classifier, col + 1, row + 2);
                    if (f & (NAV.SLOPE_LEFT | NAV.SLOPE_RIGHT)) {
                        req |= CAP.SLOPE_STAND;
                        break;
                    }
                }
            }
            add(fromIndex, to,
                feruza ? EDGE.JUMP_HIGH : EDGE.JUMP,
                landings[i + 2]! + JUMP_TICK_PENALTY,
                req);
            jumpLanded.add(fromIndex * cells + wrapRow(toRow) * mapWidth + wrapCol(toCol, mapWidth));
        }
        // Keep where he went, so the current sweeps below can ask which cells the
        // flight passed through without walking it a second time.
        const trace = jumps.lastTrace();
        const at = traceLen;
        if (at + trace.length > traceCells.length) {
            const grown = new Int32Array(Math.max(at + trace.length, traceCells.length * 2));
            grown.set(traceCells);
            traceCells = grown;
        }
        traceCells.set(trace, at);
        traceLen = at + trace.length;
        traceStart[fromIndex] = at;
        traceEnd[fromIndex] = traceLen;
        traceSplit[fromIndex] = at + jumps.lastTracePlainCount() * 2;
    };

    /**
     * The cells one node's jump flew through, col/row pairs.
     *
     * Only jumpers have one; `check_airflows_on_hero` sweeps whatever the hero is
     * doing, but a current cannot catch a hero who is standing on a rope.
     */
    const traceAt = (
        index: number,
        visit: (col: number, row: number, tallOnly: boolean) => void,
    ): void => {
        for (let i = traceStart[index]!; i < traceEnd[index]!; i += 2) {
            visit(traceCells[i]!, traceCells[i + 1]!, i >= traceSplit[index]!);
        }
    };

    /**
     * Is this arrival somewhere the hero is pushed out of again, because he
     * drifted *against* the blow?
     *
     * A landing inside a sideways current is refused only when the flight goes the
     * way the current does not: coming with it he is carried through and put down
     * beyond the run of cells, while coming against it he never arrives at all.
     *
     * A landing in the same column is left alone: nothing is being pushed into him
     * sideways there.
     */
    const pushedBack = (fromIndex: number, toCol: number, toIndex: number): boolean => {
        const target = nodes[toIndex]!;
        const fromCol = nodes[fromIndex]!.col;
        const dir = conveyorDir(grid, classifier, target.col, target.row);
        // Short-way column delta: a drift from the last column to column 0 is east.
        const step = colDelta(fromCol, toCol);
        if (dir === 0 || step === 0) return false;
        return Math.sign(step) === -dir;
    };

    /**
     * Every landing a hero stepping off at `(col, row)` can fall to.
     *
     * @param skip a node already added by another edge, so one cell is not two edges
     */
    const addFalls = (
        fromIndex: number,
        col: number,
        row: number,
        skip: number,
        allow: number = STEER_ALL,
    ): void => {
        const landings = jumps.landingsFrom(col, row, 0, allow);
        for (let i = 0; i < landings.length; i += LANDING_STRIDE) {
            const to = landingAt(landings[i]!, landings[i + 1]!);
            if (to < 0 || to === skip) continue;
            // A hero swept into a current is pushed, not dropped, so a fall never
            // ends inside one — the lift edges from the cells the flight crosses
            // are what carries him instead.
            if (heroInLift(grid, classifier, nodes[to]!.col, nodes[to]!.row)) continue;
            // The same for a sideways current: he is shoved two columns before he
            // has stood anywhere, so a landing the blow goes against is somewhere
            // he is never at rest.
            if (pushedBack(fromIndex, landings[i]!, to)) continue;
            // A hero leaves a rope from the rung directly above where he is going.
            // The rope runs past him — it is the way down — so letting go while
            // there are still rungs below means falling blind past stairs he was
            // already standing on.
            //
            // One row of overshoot is allowed because that is what a drop onto the
            // tile beside the rope is; two is a decision to fall rather than to
            // climb, and there is no rung it saves.
            //
            // The rows are counted through the seam, so a rope whose fall wraps off
            // row 63 onto row 0 still reads as one row down.
            if (nodes[fromIndex]!.kind === NODE_ROPE && wrapRow(landings[i + 1]! - row) > 1) continue;
            // Frames, plus the columns he is carried sideways while in the air.
            // Both are frames to him, but without the second the pathfinder will
            // drift as far as a fall can carry him and then fall again.
            const across = Math.abs(nodes[to]!.col - col);
            const sideways = Math.min(across, mapWidth - across);
            add(fromIndex, to, EDGE.FALL, landings[i + 2]! + sideways);
        }
    };

    /**
     * The first landing at or below `row` in column `col`: platform or ground.
     *
     * The hero's 3x3 body has to fit in the whole column on the way down, or this
     * would scan 64 rows and happily return a landing fifteen rows below — through
     * solid rock.
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
    // cross-map ones are handed to the pathfinder through `portalAtNode`.
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

        // An up current in his middle column lifts him two rows a frame whatever
        // he is doing — `checkAirflowsOnHero` runs first every frame and
        // `airborneMovement` then returns early, so there is no gravity and no
        // landing to be had. A cell the current holds is therefore not a place he
        // can move *from* by ordinary means. What the engine still gives him is the
        // current itself and one horizontal move out of the column
        // (dungeon-input.ts:484-505), so those are the only two things offered here.
        const lifted = heroInLift(grid, classifier, node.col, node.row);

        // Walk. A current that opposes the direction makes the step impossible,
        // and while he is held he may only walk *out* of the column: a target the
        // same current holds is a cell he never comes to rest in.
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
        if (!lifted) addJumpEdges(index, node.col, node.row);

        // Step off a ledge. The hero steers while he is in the air, so a fall
        // reaches a whole slope of ground rather than one column. A hero swept
        // into a current is pushed, not dropped, so a fall never ends inside one;
        // `addFalls` sees to that.
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

        // Board a platform. This is a **one-tile step onto** the slot, not a
        // boarding in place, because that is what the engine does:
        // `moveHeroLeftIfNoObstacles` / `moveHeroRightIfNoObstacles` shift the hero
        // a column (engine/dungeon-hero.ts:218-275) and the platform's tile lands
        // under his middle foot in the same frame, so he is up on it one column to
        // the side of where he was standing.
        //
        // Both cases are kept. Same-cell is a real thing — a platform parked over
        // map ground is boarded where he already stands — and the step is how he
        // gets on when the platform comes to him. Neither happens while he is
        // carried up: the step needs a row to land on and he has none.
        for (let slotIndex = 0; slotIndex < platforms.slots.length; slotIndex++) {
            const slot = platforms.slots[slotIndex]!;
            if (slot.headRow !== node.row) continue;
            // Column distance across the seam: column 0 is next to the last column.
            const dc = colDelta(node.col, slot.leftCol);
            if (dc !== 0 && Math.abs(dc) !== 1) continue;
            const sdir = dc > 0 ? 1 : -1;
            if (dc !== 0 && !heroCanStepSideways(grid, classifier, node.col, node.row, sdir)) continue;
            if (dc !== 0
                && blockedByCounterCurrent(grid, classifier, slot.leftCol, node.row, sdir)) continue;
            const rideNode = rideOf[slotIndex]!;
            if (rideNode >= 0) add(index, rideNode, EDGE.BOARD, EDGE_COST.BOARD);
        }

        // A rope in an adjacent column: the engine centres on it with a step, and a
        // current that opposes the step makes that impossible, same as a walk.
        // The step is refused outright while he is lifted — and a rope he would
        // press Up onto is no different: `moveHeroUp` is already what the current
        // is doing to him, and he does not stop on it.
        for (const dir of [1, -1] as const) {
            const rope = ropeAtNode(node.col + dir, node.row);
            if (rope >= 0 && !blockedByCounterCurrent(grid, classifier, node.col + dir, node.row, dir)) {
                add(index, rope, EDGE.STEP, EDGE_COST.STEP);
            }
        }
        // A rope in his own middle column, at his own feet: `try_climb_rope`
        // probes exactly that cell first (dungeon-vertical.ts:199-202), so pressing
        // Up puts him straight on it with no step.
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

    // The descents a rope exit in `dir` may use: straight down, or drifting in the
    // direction he stepped and never the opposite one.
    const steerMask = (dir: number): number =>
        STEER_STRAIGHT | (dir > 0 ? STEER_RIGHT : STEER_LEFT);

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
        // rope frame finds no rope at his new middle column and puts him back in
        // the dungeon (dungeon-states.ts:258-280), where the cell he stepped to
        // stands or falls by the ordinary rules.
        //
        // This is the only way off a rope. `jump_press_handler` returns the moment
        // ON_ROPE_FLAGS is set (dungeon-hero.ts:322), so there is no jumping off
        // one; climbing is `try_climb_rope`'s `moveHeroUp`
        // (dungeon-vertical.ts:236).
        //
        // **The exit is two tiles, not one.** His head is centred over the rope, so
        // the rope is his *middle* column and the cell he lands on by stepping is
        // the one past it — which is the cliff edge. One tile only reaches the
        // rope's own column, and that is not a standing position. Where a wall
        // denies him the two-tile move he takes one, then falls beside the cliff
        // **holding the same key**, so the drift is in the direction he stepped
        // and never the opposite one.
        for (const dir of [1, -1] as const) {
            if (!heroCanStepSideways(grid, classifier, node.col, node.row, dir)) continue;
            if (blockedByCounterCurrent(grid, classifier, node.col + dir, node.row, dir)) continue;
            // Two tiles: the way onto the cliff edge.
            if (heroCanStepSideways(grid, classifier, node.col + dir, node.row, dir)) {
                const far = node.col + 2 * dir;
                const land = groundAt(far, node.row);
                if (land >= 0 && !blockedByCounterCurrent(grid, classifier, far, node.row, dir)) {
                    add(index, land, EDGE.STEP, EDGE_COST.STEP);
                }
                addFalls(index, far, node.row, land, steerMask(dir));
            }
            // One tile, then down in the same direction.
            const there = groundAt(node.col + dir, node.row);
            if (there >= 0) add(index, there, EDGE.STEP, EDGE_COST.STEP);
            addFalls(index, node.col + dir, node.row, there, steerMask(dir));
        }
        // And straight down off the foot of it, with no direction at all.
        addFalls(index, node.col, node.row, -1, STEER_STRAIGHT);
    });
    // Horizontal ride edges: per-cell spatial adjacency.
    // A horizontal platform's slots are per riding offset, so three of them can sit
    // in one cell — the offset says which of the platform's three tiles is under
    // the hero's middle column at his head row. The hero boards at the offset
    // matching his column, and rides along the platform by maintaining that offset.
    const horizontalSlotsByCell = new Map<number, number[]>();
    platforms.slots.forEach((slot, slotIndex) => {
        if (slot.kind !== PLATFORM_HORIZONTAL || rideOf[slotIndex]! < 0) return;
        const key = slot.headRow * mapWidth + wrapCol(slot.leftCol, mapWidth);
        const same = horizontalSlotsByCell.get(key);
        if (same) same.push(slotIndex);
        else horizontalSlotsByCell.set(key, [slotIndex]);
    });
    for (const [cell, sameCell] of horizontalSlotsByCell) {
        for (const dir of [1, -1] as const) {
            const beside = horizontalSlotsByCell.get(
                Math.floor(cell / mapWidth) * mapWidth + wrapCol((cell % mapWidth) + dir, mapWidth),
            );
            if (!beside) continue;
            for (const a of sameCell) {
                for (const b of beside) add(rideOf[a]!, rideOf[b]!, EDGE.RIDE_H, EDGE_COST.RIDE_H_SLOW);
            }
        }
    }

    // Ride slots.
    //
    // A horizontal platform's slots are per riding offset, so three of them can sit
    // in one cell. Horizontal platforms use spatial adjacency; vertical/collapsing
    // use next=down, prev=up.
    platforms.slots.forEach((slot, slotIndex) => {
        const index = rideOf[slotIndex]!;
        if (slot.kind !== PLATFORM_HORIZONTAL) {
            // Vertical/collapsing: next=down, prev=up
            const down = slot.next < 0 ? -1 : rideOf[slot.next]!;
            const up = slot.kind === PLATFORM_VERTICAL && slot.prev >= 0 ? rideOf[slot.prev]! : -1;
            add(index, down, EDGE.RIDE_V, EDGE_COST.RIDE_V);
            add(index, up, EDGE.RIDE_V, EDGE_COST.RIDE_V);
        } else {
            // Along the platform's own movement chain as well as by cell adjacency.
            //
            // A horizontal platform carries its rider one column per tick at a
            // *fixed* riding offset, and that is what `slot.next`/`slot.prev`
            // trace: the same offset, the next column over. Per-cell adjacency
            // cannot follow it when the head row changes, and it does change —
            // where the ceiling is under three tiles the hero has to crouch, his
            // head row drops one, and two cells in different rows are never
            // neighbours of the adjacency map.
            for (const neighbour of [slot.next, slot.prev]) {
                if (neighbour < 0) continue;
                const to = rideOf[neighbour]!;
                if (to < 0) continue;
                // The pair is already linked when both slots sit in neighbouring
                // cells of the same row; only the cross-row step is new.
                const other = platforms.slots[neighbour]!;
                if (other.headRow === slot.headRow
                    && Math.min(Math.abs(other.leftCol - slot.leftCol),
                        mapWidth - Math.abs(other.leftCol - slot.leftCol)) === 1) continue;
                add(index, to, EDGE.RIDE_H, EDGE_COST.RIDE_H_SLOW);
            }
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
        // airborne, so stepping over the side is a step and then a fall, and the
        // fall drifts: `airborne_movement` reads INPUT_DIRS every tick.
        for (const dir of [1, -1] as const) {
            if (!heroCanStepSideways(grid, classifier, slot.leftCol, slot.headRow, dir)) continue;
            const there = groundAt(slot.leftCol + dir, slot.headRow);
            if (there >= 0) add(index, there, EDGE.ALIGHT, EDGE_COST.ALIGHT);
            addFalls(index, slot.leftCol + dir, slot.headRow, there);
        }
        // Or jump off it. A platform is a launchpad: without these, a ride that
        // cannot be walked off sideways is a dead end.
        addJumpEdges(index, slot.leftCol, slot.headRow);
    });

    // ── current edges ────────────────────────────────────────────────────────
    // `checkAirflowsOnHero` runs every frame from mainUpdateRenderPre whatever the
    // hero is doing — grounded, on a rope, or in mid-air — and sweeps him whenever
    // an up current sits in his middle column at his head, body or feet row. So
    // the hero is very often lifted *while falling or jumping into* a jet rather
    // than while standing beside one, and a standing-positions-only node model
    // would miss most of them.
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
     * Keying by column alone mixes every current in that column: one cavern can
     * have two currents in the same column, and a hero swept at the top of one
     * would be offered the other's stop twenty-nine rows away. `LiftModel.topRow`
     * and `rows` say where each run starts and how far it reaches, which is what
     * identifies the one he is in.
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
        // `topRow` is the hero's *head* row at the top of the run, and the tiles
        // run from two rows below that to the end. He is swept while any of the
        // three is in his middle column, so the window a hero can be caught in is
        // head rows `topRow .. topRow + rows + 1` — three rows taller than the
        // tiles.
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
     * runs are a few tiles long, so the wrap cannot confuse up with down.
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
    const enterLift = (from: number, sweptCol: number, sweptRow: number, req = 0): void => {
        if (!isSwept(sweptCol, sweptRow)) return;
        const sweptCell = wrapRow(sweptRow) * mapWidth + wrapCol(sweptCol, mapWidth);
        for (const { stop, ticks } of liftStopsAt(sweptCol, sweptRow)) {
            add(from, stop, EDGE.LIFT, ticks + 1, req);
            // First sweep that reaches this stop wins: it is the one the drawn line
            // will show, and any other would be as true.
            let per = sweptByLift.get(from);
            if (!per) {
                per = new Map<number, number>();
                sweptByLift.set(from, per);
            }
            if (!per.has(stop)) per.set(stop, sweptCell);
        }
        reachedLifts.add(wrapCol(sweptCol, mapWidth));
    };

    /**
     * Which cell each lift edge has the hero swept at, by node pair.
     *
     * Keyed by node and target rather than by edge index because the edge does not
     * exist yet: the CSR index is only known when the edges are flattened, below.
     */
    const sweptByLift = new Map<number, Map<number, number>>();

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
        // A cell a jump edge already lands on is covered by that edge plus the lift
        // edge from the node inside the current; sweeping it here as well would give
        // a second, cheaper way in that skips the jump's own cost. A cell only the
        // tall jump reaches is swept with the Feruza requirement the jump itself
        // would have.
        traceAt(index, (col, row, tallOnly) => {
            const cell = wrapRow(row) * mapWidth + wrapCol(col, mapWidth);
            if (jumpLanded.has(index * cells + cell)) return;
            enterLift(index, col, row, tallOnly ? CAP.JUMP_HIGH : 0);
        });
    });

    for (let i = 0; i < currents.lifts.length; i++) {
        const entryCol = wrapCol(currents.lifts[i]!.x - 1, mapWidth);
        if (reachedLifts.has(entryCol)) graphDiagnostics.liftsReachable++;
        else graphDiagnostics.liftsUnreachable++;
    }

    // A conveyor sweeps him one way, and like a lift he is usually swept by
    // falling or jumping into it rather than by standing in it — the current acts
    // on his body every frame whatever he is doing. So the entry is found along
    // his arcs, the same way a lift's is.
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
     * is not offered as a way to get somewhere: the hero has to leave it on his
     * own terms with a jump or a fall, which is a separate edge from a real node.
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
            // Keyed by column *and row*. A conveyor carries the hero sideways
            // along its own row, so an exit twenty rows up is not an exit from it.
            const key = headRow * mapWidth + sweptCol;
            const list = conveyorExits.get(key) ?? [];
            list.push({ to: stand, ticks: exit.ticks });
            conveyorExits.set(key, list);
        }
    }

    const reachedConveyors = new Set<number>();
    nodes.forEach((node, index) => {
        const enterConveyor = (col: number, row: number, req = 0): void => {
            const dir = conveyorDirAt(col, row);
            if (dir === 0) return;
            const list = conveyorExits.get(wrapRow(row) * mapWidth + wrapCol(col, mapWidth));
            if (!list) return;
            const kind = dir === 1 ? EDGE.CARRY_L : EDGE.CARRY_R;
            for (const { to, ticks } of list) add(index, to, kind, ticks + 1, req);
            reachedConveyors.add(wrapCol(col, mapWidth));
        };
        // A hero an up current holds is not falling into anything: he rises two
        // rows a frame and `airborneMovement` returns before gravity, so neither
        // the step off the ledge nor the flight across the gap can put him on a
        // conveyor's line.
        if (heroInLift(grid, classifier, node.col, node.row)) return;
        enterConveyor(node.col, node.row);
        for (const dir of [1, -1] as const) {
            const land = fallTo(node.col + dir, node.row);
            for (let d = 1; d <= land.rows; d++) enterConveyor(node.col + dir, node.row + d);
        }
        traceAt(index, (col, row, tallOnly) => enterConveyor(col, row, tallOnly ? CAP.JUMP_HIGH : 0));
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
    const liftSwept = new Map<number, number>();
    for (let i = 0; i < outgoing.length; i++) {
        edgeOffsets[i] = flat.length;
        const swept = sweptByLift.get(i);
        for (const edge of outgoing[i]!) {
            flat.push(edge);
            byEdgeKind[edge.kind] = (byEdgeKind[edge.kind] ?? 0) + 1;
            if (edge.kind !== EDGE.LIFT) continue;
            const cell = swept?.get(edge.to);
            if (cell !== undefined) liftSwept.set(flat.length - 1, cell);
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
        mapId, mapWidth, nodes, edges: flat, edgeOffsets, groundOf, ropeOf, rideOf, standOf,
        liftSwept, nodeHazard, portalAtNode, bossExitAtNode, keyKindAt, keyCellAt,
        accessoryShoeAt, accessoryCellAt,
        platforms, currents, stats,
        diagnostics: {
            ...graphDiagnostics,
            keysFound: (NAV_KEYS[mapId] ?? []).length,
            keysOnNodes,
            keysDropped,
            shoesFound: (NAV_ACCESSORIES[mapId] ?? []).length,
            shoesOnNodes,
            shoesDropped,
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
 * Where the hero is swept for the lift edge between two nodes, as
 * `row * mapWidth + col`, or -1 when the two are not joined by a lift.
 *
 * The sweep is not on the edge — there is no room for it — so it is looked up by
 * finding the edge. A node has a handful of edges, and this is asked once per
 * drawn lift hop.
 */
export function liftSweptCell(graph: NavGraph, fromNode: number, toNode: number): number {
    if (fromNode < 0 || graph.liftSwept.size === 0) return -1;
    for (let i = graph.edgeOffsets[fromNode]!, e = graph.edgeOffsets[fromNode + 1]!; i < e; i++) {
        const edge = graph.edges[i]!;
        if (edge.kind !== EDGE.LIFT || edge.to !== toNode) continue;
        return graph.liftSwept.get(i) ?? -1;
    }
    return -1;
}

/**
 * Visit every edge leaving `index` without allocating.
 *
 * `edgesOf` slices, which is fine for a handful of nodes but not for a whole
 * cavern.
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
    return graph.standOf[r * graph.mapWidth + wrapCol(col, graph.mapWidth)]!;
}

/** Total doors on this map, for buffer sizing by the pathfinder. */
export function doorCountFor(mapId: number): number {
    return NAV_DOOR_COUNT[mapId] ?? 0;
}
