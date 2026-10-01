/**
 * platforms.ts — the runtime platform model.
 *
 * Turns the pre-calculated tables in data/nav/nav-platforms.ts into concrete
 * **ride slots**: the positions the hero can actually occupy while riding, each
 * validated against the decoded map. The graph builder (phase 3) then links them.
 *
 * Three families, all hero-usable (see docs/PATHFINDER_PLAN.md §2.7):
 *
 *   vertical     a lift the hero drives with Up and Down, carrying him either way
 *                (dungeon-vertical.ts:380-467)
 *   collapsing   descends one row per frame while he is aboard, never rises
 *                (dungeon-vertical.ts:472-484)
 *   horizontal   fully automated, oscillating between minX and maxX, carrying him
 *                (dungeon-platforms.ts:127-167)
 *
 * None of them makes reachability time-dependent — the hero can always wait — so
 * they fold into a static graph rather than needing a clock.
 *
 * Geometry: a platform occupies columns `x .. x+2` and one row.
 * `findPlatformUnderHero` probes the hero's middle column and identifies the mid
 * tile there, which makes the table's `x` the platform's left column and the
 * hero's left column equal to it (dungeon-vertical.ts:253-344). The standing
 * position aboard is therefore `(leftCol = x, headRow = platformRow - 3)`.
 *
 * Horizontal platforms are looser: `heroOnHorizPlatform` carries the hero when any
 * of his three columns matches the platform's mapped column, which works out to
 * his left column being within one of the platform's left cell, so a horizontal
 * slot allows `leftCol = platformCol - 1 .. platformCol + 1`.
 *
 * The carry itself is not guaranteed. `updateHorizPlatformCoords` moves the hero
 * with `moveHeroRightIfNoObstacles`, and that call *fails* when something is in the
 * way — while the platform moves regardless. A horizontal platform is therefore
 * modelled only where every column of its span has a clear standing position, so
 * it can never slide out from under him.
 */

import { NAV_PLATFORMS, type NavPlatformTables } from '../../data/nav/nav-platforms.js';
import { NAV_MAP_BY_ID } from '../../data/nav/nav-maps.js';
import type { NavTileGrid } from './mdt-grid.js';
import { NavTileClassifier } from './attributes.js';
import { blocksBody, flagsAt, heroBoxFree, wrapCol, wrapRow } from './geometry.js';

/** Platform families, matching the `kind` field in nav-platforms.ts. */
export const PLATFORM_VERTICAL = 0;
export const PLATFORM_COLLAPSING = 1;
export const PLATFORM_HORIZONTAL = 2;

export const REASON_FROZEN = 'frozen (speed 0): a static ledge, not a lift';
export const REASON_UNCLEAR_SPAN =
    'span has no clear standing position, so it would slide out from under the hero';
export const REASON_SINGLE_ROW = 'only one rideable row, so it cannot move';

/**
 * One position the hero can ride at.
 *
 * Vertical and collapsing slots are indexed by row, horizontal ones by column.
 * `next` and `prev` are indices into the same platform's slot list, so riding along
 * a platform is a walk over adjacent slots.
 */
export interface RideSlot {
    /** Index into `slotsByPlatform`. */
    readonly platform: number;
    readonly kind: number;
    /** Row for vertical and collapsing, column for horizontal. */
    readonly pos: number;
    /** Where the hero stands while aboard. */
    readonly leftCol: number;
    readonly headRow: number;
    /**
     * How the hero sits on a horizontal platform, in columns from the platform's
     * own left cell: -1 hanging off the left, 0 centred, 1 off the right.
     *
     * This is what identifies a riding position. `leftCol` alone does not: at
     * platform columns 149, 150 and 151 the hero can all stand at left column
     * 150 (with offsets +1, 0 and -1), so three distinct slots share one cell.
     * Linking rides by left column therefore joined two slots where the hero had
     * not moved at all, and he could never travel along the platform.
     */
    readonly offset: number;
    /** Adjacent slots along the platform, or -1 where the ride ends. Mutated
     *  once while the model is built, then read-only. */
    next: number;
    prev: number;
}

export interface PlatformModel {
    readonly mapId: number;
    /** Every valid ride slot on the map. */
    readonly slots: readonly RideSlot[];
    /** Slot indices per platform, ascending along the platform. */
    readonly slotsByPlatform: readonly (readonly number[])[];
    /** Platforms deliberately given no ride edges, with the reason. */
    readonly inertPlatforms: readonly { platform: number; reason: string }[];
}

/** Can the hero stand here with the platform cell counted as ground? */
function standingAboard(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    leftCol: number,
    headRow: number,
): boolean {
    if (!heroBoxFree(grid, classifier, leftCol, headRow)) return false;
    // The platform sits on the feet row, so that row must be clear, not solid.
    for (let i = 0; i < 3; i++) {
        if (blocksBody(flagsAt(grid, classifier, leftCol + i, headRow + 2))) return false;
    }
    return true;
}

/** Inclusive row range as an array. */
function range(from: number, to: number): number[] {
    const out: number[] = [];
    for (let i = from; i <= to; i++) out.push(i);
    return out;
}

/** Build the platform model for one map from its decoded tile grid. */
export function buildPlatformModel(mapId: number, grid: NavTileGrid): PlatformModel {
    const tables: NavPlatformTables | undefined = NAV_PLATFORMS[mapId];
    const meta = NAV_MAP_BY_ID.get(mapId);
    if (!tables) throw new Error(`no generated platform tables for map ${mapId}`);
    const classifier = NavTileClassifier.forMap(mapId);
    const mapWidth = meta?.mapWidth ?? grid.mapWidth;

    const slots: RideSlot[] = [];
    const slotsByPlatform: number[][] = [];
    const inertPlatforms: { platform: number; reason: string }[] = [];

    /** Append one platform's slots and return their indices. */
    const emit = (indices: number[]): void => {
        slotsByPlatform.push(indices);
    };

    // ── vertical and collapsing ────────────────────────────────────────────
    for (const p of tables.vertical) {
        const local: number[] = [];
        for (const row of range(p.topY, p.bottomY)) {
            const headRow = wrapRow(row - 3);
            if (!standingAboard(grid, classifier, p.x, headRow)) continue;
            local.push(slots.length);
            slots.push({
                platform: slotsByPlatform.length,
                kind: PLATFORM_VERTICAL,
                pos: wrapRow(row),
                leftCol: p.x,
                offset: 0,
                headRow,
                next: -1,
                prev: -1,
            });
        }
        chain(slots, local);
        if (local.length < 2) inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_SINGLE_ROW });
        emit(local);
    }

    for (const p of tables.collapsing) {
        const local: number[] = [];
        // startY downwards only: heroCollapsePlatform never raises it.
        for (const row of range(p.startY, p.bottomY)) {
            const headRow = wrapRow(row - 3);
            if (!standingAboard(grid, classifier, p.x, headRow)) continue;
            local.push(slots.length);
            slots.push({
                platform: slotsByPlatform.length,
                kind: PLATFORM_COLLAPSING,
                pos: wrapRow(row),
                leftCol: p.x,
                offset: 0,
                headRow,
                next: -1,
                prev: -1,
            });
        }
        chain(slots, local);
        if (local.length < 2) inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_SINGLE_ROW });
        emit(local);
    }

    // ── horizontal ─────────────────────────────────────────────────────────
    for (const p of tables.horizontal) {
        if (p.speed === 0) {
            // Frozen: a static ledge the hero stands on, not a lift.
            inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_FROZEN });
            emit([]);
            continue;
        }
        const headRow = wrapRow(p.y - 3);
        const columns = Array.from({ length: p.cols }, (_, i) => wrapCol(p.minX + i, mapWidth));

        // For each column of the span, which riding offsets are usable?
        const usable = new Map<number, { slot: number; leftCol: number; offset: number }[]>();
        for (const column of columns) {
            const standing: { slot: number; leftCol: number; offset: number }[] = [];
            for (const offset of [-1, 0, 1]) {
                const leftCol = wrapCol(column + offset, mapWidth);
                if (!standingAboard(grid, classifier, leftCol, headRow)) continue;
                const index = slots.length;
                slots.push({
                    platform: slotsByPlatform.length,
                    kind: PLATFORM_HORIZONTAL,
                    pos: column,
                    leftCol,
                    offset,
                    headRow,
                    next: -1,
                    prev: -1,
                });
                standing.push({ slot: index, leftCol, offset });
            }
            usable.set(column, standing);
        }

        if (usable.size === 0 || [...usable.values()].every((s) => s.length === 0)) {
            // No part of the span can hold the hero, so there is no ride at all.
            inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_UNCLEAR_SPAN });
            emit([]);
            continue;
        }
        // Any column where the hero's body does not fit simply has no slot. The
        // ride is still real across the columns that do fit — which is most of
        // them. Refusing the whole platform because one column of a thirteen-wide
        // span is clipped is far too blunt: it threw away the very platform mp80's
        // upper route is built around, and with it the whole level.
        //
        // What still matters is that a ride is only ever linked between two
        // columns that both have a valid position, so the chain cannot ask the
        // hero to stand somewhere he cannot fit.

        // Ride along the span, linking columns that share a riding offset.
        const local: number[] = [];
        for (const column of columns) {
            for (const { slot } of usable.get(column)!) local.push(slot);
        }
        for (let i = 0; i + 1 < columns.length; i++) {
            const from = usable.get(columns[i]!)!;
            const to = usable.get(columns[i + 1]!)!;
            // Link by RIDING OFFSET, not by the hero's left column. Riding from
            // platform column i to i+1 with the same offset carries the hero one
            // column along, which is the whole point of the platform. Matching
            // left column instead pairs two slots where he is already standing,
            // so the ride goes nowhere.
            for (const a of from) {
                for (const b of to) {
                    if (a.offset === b.offset) link(slots, a.slot, b.slot);
                }
            }
        }
        emit(local);
    }

    return { mapId, slots, slotsByPlatform, inertPlatforms };
}

/** Point each slot at the next along a one-dimensional platform. */
function chain(slots: RideSlot[], local: readonly number[]): void {
    for (let i = 0; i + 1 < local.length; i++) link(slots, local[i]!, local[i + 1]!);
}

/** Point two slots at each other as adjacent along a platform. */
function link(slots: RideSlot[], a: number, b: number): void {
    slots[a]!.next = b;
    slots[b]!.prev = a;
}
