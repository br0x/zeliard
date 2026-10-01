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
    NAV, EDGE, EDGE_COST, CAP,
    JUMP_HEIGHT_DEFAULT, JUMP_HEIGHT_FERUZA,
    blocksBody,
} from './types.js';
import { NavTileClassifier } from './attributes.js';
import {
    blockedByCounterCurrent, flagsAt, heroBoxFree, heroInLift, isStanding, wrapCol, wrapRow,
} from './geometry.js';
import { buildPlatformModel, type PlatformModel } from './platforms.js';
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
    };
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
    const ropeAtNode = (col: number, row: number): number => {
        const r = wrapRow(row);
        return ropeOf[r * mapWidth + wrapCol(col, mapWidth)]!;
    };

    // ── edges ───────────────────────────────────────────────────────────────
    /** Per-node edge lists, flattened into CSR at the end. */
    const outgoing: NavEdge[][] = nodes.map(() => []);

    const add = (from: number, to: number, kind: number, cost: number, req = 0, portal = -1): void => {
        if (to < 0 || to === from) return;
        outgoing[from]!.push({ to, kind, cost, req, portal });
    };

    /** Jump offsets the plan allows: dx across, dh up or down. */
    const jumpOffsets = (height: number): [number, number][] => {
        const out: [number, number][] = [];
        for (let dx = -3; dx <= 3; dx++) {
            for (let dh = -height; dh <= 3; dh++) {
                if (dx !== 0 || dh !== 0) out.push([dx, dh]);
            }
        }
        return out;
    };
    const normalJumps = jumpOffsets(JUMP_HEIGHT_DEFAULT);
    const highJumps = jumpOffsets(JUMP_HEIGHT_FERUZA);

    /**
     * Can the hero jump from here to `to`?
     *
     * Conservative by construction: the landing must be a node, the arc's apex must
     * be clear for his whole body, and the ceiling probe the engine makes at
     * `heroTL - 35` (one row above his head, middle column) must be open.
     */
    const canJump = (from: NavNode, to: NavNode): boolean => {
        // The engine's ceiling probe: one row above the head, middle column.
        if (blocksBody(flagsAt(grid, classifier, from.col + 1, from.row - 1))) return false;
        // The apex of the arc, where the hero is highest.
        const apexRow = from.row + Math.trunc((to.row - from.row) / 2);
        const apexCol = from.col + Math.trunc((to.col - from.col) / 2);
        if (!heroBoxFree(grid, classifier, apexCol, apexRow)) return false;
        // The whole swept body, not just the apex. A jump crosses one column per
        // tick, so a three-column jump really does pass through the two in
        // between; checking only the apex let routes whose arc clipped a wall
        // through, and the chevrons for them were drawn in the scenery.
        return jumpSweepClear(from, to);
    };

    /**
     * Every jump available from a node, to a platform or to the ground.
     *
     * Shared by ground nodes and ride slots: a hero standing on a platform can
     * jump off it exactly as he can from a ledge.
     */
    const addJumpEdges = (from: NavNode, fromIndex: number, high: boolean): void => {
        const offsets = high ? highJumps : normalJumps;
        for (const [dx, dh] of offsets) {
            // The high jump only adds the rows a plain jump cannot reach.
            if (high && dh >= -JUMP_HEIGHT_DEFAULT) continue;
            const to = landingAt(from.col + dx, from.row + dh);
            if (to < 0 || to === fromIndex) continue;
            const target = nodes[to]!;
            if (!canJump(from, target)) continue;
            add(fromIndex, to,
                high ? EDGE.JUMP_HIGH : EDGE.JUMP,
                (high ? EDGE_COST.JUMP_HIGH : EDGE_COST.JUMP) + Math.abs(dx) + Math.abs(dh),
                high ? CAP.JUMP_HIGH : 0);
        }
    };

    /** Is the hero's 3x3 body clear everywhere along the straight line from -> to? */
    const jumpSweepClear = (from: NavNode, to: NavNode): boolean => {
        const dCol = to.col - from.col;
        const dRow = to.row - from.row;
        if (dCol === 0 && dRow === 0) return false;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dCol), Math.abs(dRow)) * 4));
        for (let s = 0; s <= steps; s++) {
            const col = from.col + Math.round((dCol * s) / steps);
            const row = from.row + Math.round((dRow * s) / steps);
            if (!heroBoxFree(grid, classifier, col, row)) return false;
        }
        return true;
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
        if (!lifted) {
            addJumpEdges(node, index, false);
            addJumpEdges(node, index, true);
        }

        // Step off a ledge. A hero swept into a current is pushed, not dropped, so
        // a fall never ends inside one.
        if (!lifted) {
            for (const dir of [1, -1] as const) {
                const land = fallTo(node.col + dir, node.row);
                if (land.node < 0) continue;
                if (heroInLift(grid, classifier, nodes[land.node]!.col, nodes[land.node]!.row)) continue;
                add(index, land.node, EDGE.FALL, land.rows);
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

        // A rope in an adjacent column: the engine centres on it with a step.
        for (const dir of [1, -1] as const) {
            const rope = ropeAtNode(node.col + dir, node.row);
            if (rope >= 0) add(index, rope, EDGE.STEP, EDGE_COST.STEP);
        }

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
        const land = fallTo(node.col, node.row);
        if (land.node >= 0) add(index, land.node, EDGE.FALL, land.rows + 1);
    });

    // Ride slots.
    platforms.slots.forEach((slot, slotIndex) => {
        const index = rideOf[slotIndex]!;
        if (index < 0) return;
        for (const [next, kind, cost] of [
            [slot.next, slot.kind === 2 ? EDGE.RIDE_H : EDGE.RIDE_V,
                slot.kind === 2 ? EDGE_COST.RIDE_H_SLOW : EDGE_COST.RIDE_V],
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
        // Or jump off it. A platform is a launchpad: without these, a ride that
        // cannot be walked off sideways is a dead end, and the level's whole upper
        // route was unreachable because of it.
        addJumpEdges(nodes[index]!, index, false);
        addJumpEdges(nodes[index]!, index, true);
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

    // Stops of every lift the hero could be carried to, keyed by the lift's column
    // so a swept position can be matched to it.
    const stopsByColumn = new Map<number, { stop: number; ticks: number }[]>();
    for (const lift of currents.lifts) {
        const entryCol = wrapCol(lift.x - 1, mapWidth);
        const list = stopsByColumn.get(entryCol) ?? [];
        for (const stop of lift.stops) {
            if (!stop.escapable) continue;
            if (groundAt(stop.leftCol, stop.headRow) < 0) continue;
            list.push({ stop: groundAt(stop.leftCol, stop.headRow), ticks: stop.ticks });
        }
        stopsByColumn.set(entryCol, list);
    }

    const graphDiagnostics = {
        liftsReachable: 0, liftsUnreachable: 0,
        conveyorsReachable: 0, conveyorsUnreachable: 0,
    };
    const reachedLifts = new Set<number>();

    /** Send the hero from `from` to a lift he can be swept by on his way. */
    const enterLift = (from: number, sweptCol: number, sweptRow: number): void => {
        if (!isSwept(sweptCol, sweptRow)) return;
        const list = stopsByColumn.get(wrapCol(sweptCol, mapWidth));
        if (!list) return;
        for (const { stop, ticks } of list) {
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
        // Jumping through it.
        for (const [dx, dh] of normalJumps) {
            if (dh < 0) continue;   // only downward arcs matter for a lift
            const apexRow = node.row + Math.trunc(dh / 2);
            enterLift(index, node.col + dx, apexRow);
            enterLift(index, node.col + dx, node.row + dh);
        }
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
            const list = conveyorExits.get(sweptCol) ?? [];
            list.push({ to: stand, ticks: exit.ticks });
            conveyorExits.set(sweptCol, list);
        }
    }

    const reachedConveyors = new Set<number>();
    nodes.forEach((node, index) => {
        const enterConveyor = (col: number, row: number): void => {
            const dir = conveyorDirAt(col, row);
            if (dir === 0) return;
            const list = conveyorExits.get(wrapCol(col, mapWidth));
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
        for (const [dx, dh] of normalJumps) {
            if (dh < 0) continue;
            enterConveyor(node.col + dx, node.row + Math.trunc(dh / 2));
            enterConveyor(node.col + dx, node.row + dh);
        }
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
        nodeHazard, portalAtNode, platforms, currents, stats,
        diagnostics: graphDiagnostics,
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
