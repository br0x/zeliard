/**
 * platforms.ts — the runtime platform model.
 *
 * Turns the pre-calculated tables in data/nav/nav-platforms.ts into concrete
 * **ride slots**: the positions the hero can occupy while riding, each validated
 * against the decoded map. The graph builder then links them.
 *
 * Three families, all hero-usable:
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
 * `identify_platform_tile` also answers `x - 1` and `x + 1` — a hero hanging off
 * either side of the three-tile ledge is aboard too. Only `x` is modelled here,
 * because the live row of a lift is read out of `g_mem` as `{ absX, y }` keyed
 * by column: two lifts a column apart cannot be told apart, and widening the
 * offsets would make every neighbouring pair share a key.
 *
 * Horizontal platforms use `leftCol = platformCol - 2 .. platformCol`
 * (see {@link HORIZONTAL_RIDE_OFFSETS}). A horizontal platform is modelled only
 * where every column of its span has a clear standing position, so it can never
 * slide out from under the hero.
 *
 * ── where a platform is a thing and not a place ─────────────────────────────
 * A platform is one object standing in one row right now. So the model reports
 * two things about that one row. `restingCells` marks the three tiles the
 * platform occupies as solid, because it is rock while it is there and a flight
 * must not pass through it. And `places` says which row each platform was found
 * at, so that only *that* slot is a landing surface — every other position it
 * has ever been is reachable by riding and not by jumping.
 *
 * Horizontal platforms are the exception: they sweep their span continuously and
 * the hero can wait for them, so they have no "where it is standing".
 */

import { NAV_PLATFORMS, type NavPlatformTables } from '../../data/nav/nav-platforms.js';
import { NAV_MAP_BY_ID } from '../../data/nav/nav-maps.js';
import type { NavTileGrid } from './mdt-grid.js';
import { NavTileClassifier } from './attributes.js';
import { ROWS, blocksBody, flagsAt, middleColumnFree, wrapCol, wrapRow } from './geometry.js';
import type { PlatformPlaces } from './platform-state.js';

/** Platform families, matching the `kind` field in nav-platforms.ts. */
export const PLATFORM_VERTICAL = 0;
export const PLATFORM_COLLAPSING = 1;
export const PLATFORM_HORIZONTAL = 2;

export const REASON_FROZEN = 'frozen (speed 0): a static ledge, not a lift';
export const REASON_UNCLEAR_SPAN =
    'span has no clear standing position, so it would slide out from under the hero';
export const REASON_SINGLE_ROW = 'only one rideable row, so it cannot move';
export const REASON_UNBOARDABLE =
    'no row where the hero can stand on it, so he can never get aboard and it can never move';

/**
 * Where a hero may sit relative to a horizontal platform's own left cell.
 *
 * `heroOnHorizPlatform` (engine/dungeon-platforms.ts:107-112) carries him when
 * any of his three columns equals the platform's `x`, which is
 * `leftCol = platformCol - 2 .. platformCol`.
 */
/**
 * How many tiles wide a platform is.
 *
 * Three for every family: `update_and_render_horiz_platforms` draws
 * `0x46 0x47 0x48`, `render_vertical_platforms_to_proximity` draws
 * `0x40 0x41 0x42` and `process_visible_collapsing_platforms` draws
 * `0x43 0x44 0x45`. A horizontal platform's `cols` is the length of the span it
 * travels, which is a different number and much larger.
 */
export const PLATFORM_WIDTH = 3;

export const HORIZONTAL_RIDE_OFFSETS: readonly number[] = [-2, -1, 0];

/**
 * One position the hero can ride at.
 *
 * Vertical and collapsing slots are indexed by row, horizontal ones by column.
 * `next` and `prev` are indices into the same platform's slot list, so riding
 * along a platform is a walk over adjacent slots.
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
     * For horizontal platforms: the platform's fixed tile row (where it travels).
     * For vertical/collapsing: undefined.
     * Used to compute the correct landing row regardless of crouching.
     */
    readonly platformRow?: number;
    /**
     * How the hero sits on a horizontal platform, in columns from the platform's
     * own left cell — see {@link HORIZONTAL_RIDE_OFFSETS}.
     *
     * This is what identifies a riding position. `leftCol` alone does not: at
     * platform columns 149, 150 and 151 the hero can all stand at left column
     * 149 (with offsets 0, -1 and -2), so three distinct slots share one cell.
     */
    readonly offset: number;
    /**
     * Is this the position the platform is standing at *right now*?
     *
     * A platform is three (or thirteen) solid tiles and the hero comes down on
     * top of it, so the only row it can be landed on is the row it is at. Every
     * other position along its travel is somewhere he can be **carried** to and
     * cannot jump onto.
     */
    readonly atRest: boolean;
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
    /**
     * The cells each platform occupies where it is *resting*, as a solid obstacle.
     *
     * A platform's position is engine memory, not map data: the MDT cell it
     * occupies right now is ordinary empty air, so the hero's flight model has
     * to be told where it is standing or it flies straight through it.
     */
    readonly restingCells: Uint8Array;
    /**
     * The row of each platform as this build found it, by left column. Recorded
     * so a caller can see what the graph assumed and rebuild when the hero moves
     * one.
     */
    readonly places: ReadonlyMap<number, number>;
}

/**
 * Can a hero *land* on this slot, rather than only reach it by riding?
 *
 * A platform is solid tiles and the hero comes down on top of it, so the only
 * surface it offers is the row (or, for a horizontal platform, the column) it is
 * standing at right now.
 */
export function isLandingSlot(slot: RideSlot): boolean {
    return slot.atRest;
}

/**
 * Can the hero be aboard a vertical or collapsing platform at this head row?
 *
 * The engine finds the platform by reading the tile under the hero's **middle**
 * foot and never looks at the rest of his body, so a lift will raise a hero
 * whose left or right column is inside rock. The middle column is all he needs.
 *
 * The hero is standing **on** the platform, so the platform's own three cells at
 * that row have to be clear too. Without that test the model mints riding
 * positions for lifts that cannot hold one.
 */
function aboardLift(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    leftCol: number,
    headRow: number,
): boolean {
    return middleColumnFree(grid, classifier, leftCol, headRow);
}

/**
 * Can the hero be riding a horizontal platform with his head on `headRow`?
 *
 * A horizontal platform moves the hero by calling
 * `move_hero_left_if_no_obstacles` / `move_hero_right_if_no_obstacles`
 * (dungeon-platforms.ts:264-300), which take one column of the hero — the one he
 * faces — and test it. The two rows under his head are all that is ever
 * consulted, and the test is skipped entirely on the head row while he is
 * squatting (dungeon-hero.ts:227, :255).
 *
 * Squatting is free: `down_pressed` sets `SQUAT_FLAG` and nothing else
 * (dungeon-input.ts:239-244), and the only two writers of the viewport row are
 * the jump-up step and the rope descent. A crouching hero is a standing hero
 * whose head-row cell is exempt — he does not get a row lower.
 */
function ridingAboard(
    grid: NavTileGrid,
    classifier: NavTileClassifier,
    leftCol: number,
    headRow: number,
): boolean {
    for (let i = 0; i < 3; i++) {
        if (blocksBody(flagsAt(grid, classifier, leftCol + i, headRow + 1))) return false;
        if (blocksBody(flagsAt(grid, classifier, leftCol + i, headRow + 2))) return false;
    }
    return true;
}

/**
 * Inclusive row range as an array, across the cylinder.
 *
 * A lift's travel is an arc, not an interval: it can cross row 0 coming from row
 * 63, so `topY` may sit numerically above `bottomY`. Walking `from -> to` modulo
 * `ROWS` gives that arc and is identical to a plain `from <= to` interval
 * wherever the range did not wrap.
 */
function range(from: number, to: number): number[] {
    const out: number[] = [];
    for (let i = from; ; i = (i + 1) % ROWS) {
        out.push(i);
        if (i === to || out.length > ROWS) break;
    }
    return out;
}

/** Build the platform model for one map from its decoded tile grid. */
export function buildPlatformModel(
    mapId: number,
    grid: NavTileGrid,
    /**
     * Where the platforms are right now, by left column. Defaults to the
     * generated `startY`, which is where they stand when a cavern is entered and
     * where they go back to when it is entered again.
     */
    places?: PlatformPlaces,
): PlatformModel {
    const tables: NavPlatformTables | undefined = NAV_PLATFORMS[mapId];
    const meta = NAV_MAP_BY_ID.get(mapId);
    if (!tables) throw new Error(`no generated platform tables for map ${mapId}`);
    const classifier = NavTileClassifier.forMap(mapId);
    const mapWidth = meta?.mapWidth ?? grid.mapWidth;
    const restingCells = new Uint8Array(mapWidth * ROWS);
    const where = new Map<number, number>();

    const slots: RideSlot[] = [];
    const slotsByPlatform: number[][] = [];
    const inertPlatforms: { platform: number; reason: string }[] = [];

    /** Mark the tiles a platform is standing on right now. */
    const rest = (leftCol: number, row: number, cols: number): void => {
        for (let i = 0; i < cols; i++) {
            restingCells[row * mapWidth + wrapCol(leftCol + i, mapWidth)] = 1;
        }
    };

    /**
     * A vertical or collapsing platform: three solid tiles at its current row,
     * and a note of where that is so the graph can be rebuilt when the hero moves
     * it.
     */
    const place = (leftCol: number, row: number): number => {
        const at = wrapRow(row);
        rest(leftCol, at, 3);
        where.set(wrapCol(leftCol, mapWidth), at);
        return at;
    };

    /** Append one platform's slots and return their indices. */
    const emit = (indices: number[]): void => {
        slotsByPlatform.push(indices);
    };

    // ── vertical and collapsing ────────────────────────────────────────────
    for (const p of tables.vertical) {
        const rowNow = place(p.x, places?.get(p.x) ?? p.startY);
        const local: number[] = [];
        for (const row of range(p.topY, p.bottomY)) {
            const headRow = wrapRow(row - 3);
            if (!aboardLift(grid, classifier, p.x, headRow)) continue;
            local.push(slots.length);
            slots.push({
                platform: slotsByPlatform.length,
                kind: PLATFORM_VERTICAL,
                pos: wrapRow(row),
                leftCol: p.x,
                offset: 0,
                headRow,
                atRest: wrapRow(row) === rowNow,
                next: -1,
                prev: -1,
            });
        }
        if (!local.some((i) => slots[i]!.atRest)) {
            // A lift the hero can never stand on is a thing, not a place. He
            // boards one by landing on it, and the only row he can land on is the
            // one it is standing at now — so with no `atRest` slot there is no way
            // aboard, and every slot below is a position he cannot reach.
            inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_UNBOARDABLE });
            slots.length -= local.length;
            emit([]);
            continue;
        }
        chain(slots, local);
        if (local.length < 2) inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_SINGLE_ROW });
        emit(local);
    }

    for (const p of tables.collapsing) {
        const rowNow = place(p.x, places?.get(p.x) ?? p.startY);
        const local: number[] = [];
        // From where it stands now downwards only: heroCollapsePlatform never
        // raises it, so rows between `startY` and `rowNow` can never be reached
        // again.
        for (const row of range(rowNow, p.bottomY)) {
            const headRow = wrapRow(row - 3);
            if (!aboardLift(grid, classifier, p.x, headRow)) continue;
            local.push(slots.length);
            slots.push({
                platform: slotsByPlatform.length,
                kind: PLATFORM_COLLAPSING,
                pos: wrapRow(row),
                leftCol: p.x,
                offset: 0,
                headRow,
                atRest: wrapRow(row) === wrapRow(rowNow),
                next: -1,
                prev: -1,
            });
        }
        if (!local.some((i) => slots[i]!.atRest)) {
            inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_UNBOARDABLE });
            slots.length -= local.length;
            emit([]);
            continue;
        }
        chain(slots, local);
        if (local.length < 2) inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_SINGLE_ROW });
        emit(local);
    }

    // ── horizontal ─────────────────────────────────────────────────────────
    // A horizontal platform is standing somewhere too — at `startX`, and nowhere
    // else, because the hero cannot drive it and the live rows are only kept for
    // the vertical and collapsing lists. So it is pinned there like any other:
    // solid where it is, and landable only where it is. Its *span* is still
    // rideable end to end, and that is the part waiting buys.
    for (const p of tables.horizontal) {
        // THREE tiles, not `p.cols`. `cols` is the length of the span the platform
        // travels, which is what the ride is made of; the platform itself is the
        // three tiles `update_and_render_horiz_platforms` draws
        // (dungeon-platforms.ts:234-243).
        if (p.speed !== 0) rest(wrapCol(p.startX, mapWidth), wrapRow(p.y), PLATFORM_WIDTH);
        if (p.speed === 0) {
            // Frozen: a static ledge the hero stands on, not a lift.
            inertPlatforms.push({ platform: slotsByPlatform.length, reason: REASON_FROZEN });
            emit([]);
            continue;
        }
        const headRow = wrapRow(p.y - 3);
        const columns = Array.from({ length: p.cols }, (_, i) => wrapCol(p.minX + i, mapWidth));

        // For each column of the span, which riding offsets are usable?
        //
        // `heroOnHorizPlatform` (engine/dungeon-platforms.ts:107-112) carries the
        // hero when *any* of his three columns equals the platform's own left
        // cell, so his left column is `platformCol - 2 .. platformCol` — the
        // platform hangs off his right.
        const usable = new Map<number, { slot: number; leftCol: number; offset: number }[]>();
        for (const column of columns) {
            const standing: { slot: number; leftCol: number; offset: number }[] = [];
            for (const offset of HORIZONTAL_RIDE_OFFSETS) {
                const leftCol = wrapCol(column + offset, mapWidth);
                if (!ridingAboard(grid, classifier, leftCol, headRow)) continue;
                const index = slots.length;
                slots.push({
                    platform: slotsByPlatform.length,
                    kind: PLATFORM_HORIZONTAL,
                    pos: column,
                    leftCol,
                    offset,
                    headRow,
                    platformRow: p.y,
                    // The platform is drawn at `startX` until the hero drives it,
                    // which for a horizontal one he never does, and the live rows
                    // are only read for the vertical and collapsing lists. So this
                    // is always the position it was found at.
                    atRest: column === wrapCol(p.startX, mapWidth),
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
        // ride is still real across the columns that do fit.

        // Ride along the span, linking columns that share a riding offset.
        const local: number[] = [];
        for (const column of columns) {
            for (const { slot } of usable.get(column)!) local.push(slot);
        }
        // Horizontal platforms move either left or right. The hero rides in the
        // direction the platform moves: if movingLeft, edges go right-to-left.
        if (p.movingLeft) {
            for (let i = columns.length - 1; i > 0; i--) {
                const from = usable.get(columns[i]!)!;
                const to = usable.get(columns[i - 1]!)!;
                for (const a of from) {
                    for (const b of to) {
                        if (a.offset === b.offset) link(slots, a.slot, b.slot);
                    }
                }
            }
        } else {
            for (let i = 0; i + 1 < columns.length; i++) {
                const from = usable.get(columns[i]!)!;
                const to = usable.get(columns[i + 1]!)!;
                for (const a of from) {
                    for (const b of to) {
                        if (a.offset === b.offset) link(slots, a.slot, b.slot);
                    }
                }
            }
        }
        emit(local);
    }

    return { mapId, slots, slotsByPlatform, inertPlatforms, restingCells, places: where };
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
