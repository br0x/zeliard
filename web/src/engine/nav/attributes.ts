/**
 * attributes.ts — per-cavern tile classification.
 *
 * Passability is not a property of a tile id: it is a 24-entry per-cavern table
 * that the engine pushes into seg1 at 0x8000 (core/ts-memory.ts:124-147), and the
 * engine resolves a tile through it at runtime. Those tables are pre-calculated
 * per map by tools/build-nav.mjs into web/src/data/nav/nav-tiles.ts, and this
 * module turns them into a single 64-entry flag lookup so classifying a cell is
 * one array read rather than a 24-way scan.
 *
 * The two blocking bits deliberately reproduce the engine's *two* different
 * predicates, which disagree over the platform band:
 *
 *   is_blocking_tile         (dungeon-entities.ts:73)   tile >= 0x40 passes
 *   is_blocking_tile_simple  (dungeon-entities.ts:89)   tile >= 0x49 passes
 *
 * so a platform tile (0x40..0x48) blocks the body but not the head — which is why
 * the hero can stand on one. Collapsing both into a single SOLID bit would lose
 * that. For the *static* map the two agree, because the RLE is 6-bit and no tile
 * above 0x3F can appear; `staticTilesAreSixBit` asserts exactly that.
 */

import { NAV, AIRFLOW_NONE, AIRFLOW_UP, AIRFLOW_LEFT, AIRFLOW_RIGHT } from './types.js';
import { NAV_TILES, type NavTileTables } from '../../data/nav/nav-tiles.js';
import { NAV_MAP_BY_ID } from '../../data/nav/nav-maps.js';

/**
 * One entry per possible tile byte.
 *
 * The packed map is 6-bit, but tile ids up to 0xFF are meaningful at runtime —
 * platforms 0x40..0x48, door frame 0x49..0x60, and entity markers at 0x80 | n
 * (dungeon-entities.ts:63-97). The table therefore covers the whole byte, so
 * `classify` is total and never has to fall back for a tile the engine can see.
 */
export const TILE_COUNT = 0x100;

/** The range a packed map can actually produce: the RLE is 6-bit. */
export const STATIC_TILE_COUNT = 0x40;

/** The 24 passable slots the engine writes, matching seg1:0x8000..0x8017. */
const PASSABLE_SLOTS = 24;

/** Split the 12-slot airflow table into three zero-terminated groups. */
export function airflowGroups(airflows: readonly number[]): {
    up: Set<number>;
    left: Set<number>;
    right: Set<number>;
} {
    const group = (lo: number): Set<number> => {
        const out = new Set<number>();
        for (let i = lo; i < lo + 4; i++) {
            const v = airflows[i] ?? 0;
            if (v === 0) break;
            out.add(v);
        }
        return out;
    };
    return { up: group(0), left: group(4), right: group(8) };
}

/**
 * lookup_shared (dungeon.c:1512) — the shared tail of both blocking predicates.
 * Returns true when blocking.
 */
function lookupShared(tile: number, passable: Set<number>): boolean {
    if (passable.has(tile)) return false;
    const masked = tile & 0x9f;
    // 0x90 and 0x91 are hard-blocked even when they would otherwise pass.
    if (masked === 0x90 || masked === 0x91) return true;
    // bit 7 marks an entity on the proximity map; those are not solid.
    return (masked & 0x80) === 0;
}

/**
 * Tile classification for one cavern.
 *
 * Immutable after construction and safe to share; build it once per map and keep
 * it next to the decoded tile grid.
 */
export class NavTileClassifier {
    /** Lookup by map id. */
    private static readonly cache = new Map<number, NavTileClassifier>();

    /**
     * 256 entries, indexed by tile id.
     *
     * Uint16Array, not Uint8Array: the flags reach bit 11 (DOOR_TRIGGER), and an
     * 8-bit table would silently truncate BLOCK_HEAD and every flag above it to
     * zero — which reads as "nothing blocks" rather than as an error.
     */
    private readonly flags: Uint16Array;

    private constructor(
        readonly mapId: number,
        private readonly passable: Set<number>,
        private readonly tables: NavTileTables,
    ) {
        const currents = airflowGroups(tables.airflows);
        const slopeLeft = new Set(tables.slopeLeft);
        const slopeRight = new Set(tables.slopeRight);
        const aggressive = new Set(tables.aggressive);

        this.flags = new Uint16Array(TILE_COUNT);
        for (let tile = 0; tile < TILE_COUNT; tile++) {
            let f = 0;
            if (tile === 0) f |= NAV.EMPTY;
            if (tile === 1 || tile === 2) f |= NAV.ROPE;
            if (slopeLeft.has(tile)) f |= NAV.SLOPE_LEFT;
            if (slopeRight.has(tile)) f |= NAV.SLOPE_RIGHT;
            if (aggressive.has(tile)) f |= NAV.AGGRESSIVE;

            // Precedence matters: a tile listed in two groups takes the first, so
            // that a future tileset edit cannot silently change its direction.
            if (currents.up.has(tile)) f |= NAV.AIRFLOW_UP;
            else if (currents.left.has(tile)) f |= NAV.AIRFLOW_LEFT;
            else if (currents.right.has(tile)) f |= NAV.AIRFLOW_RIGHT;

            // The two blocking predicates, kept separate on purpose.
            const blockHead = tile < 0x40 ? lookupShared(tile, this.passable) : false;
            const blockBody = tile < 0x49
                ? (this.passable.has(tile)
                    ? false
                    : (tile & 0x80) !== 0x80)
                : false;
            if (blockHead) f |= NAV.BLOCK_HEAD;
            if (blockBody) f |= NAV.BLOCK_BODY;

            if (tile >= 0x40 && tile <= 0x48) f |= NAV.PLATFORM;
            if (tile === 0x4a) f |= NAV.DOOR_TRIGGER;

            this.flags[tile] = f;
        }
    }

    /** Build, or return the cached classifier, for a map id. */
    static forMap(mapId: number): NavTileClassifier {
        const cached = NavTileClassifier.cache.get(mapId);
        if (cached) return cached;
        const tables = NAV_TILES[mapId];
        if (!tables) throw new Error(`no generated tile tables for map ${mapId}`);
        const built = new NavTileClassifier(mapId, new Set(tables.passable), tables);
        NavTileClassifier.cache.set(mapId, built);
        return built;
    }

    /**
     * Build a classifier over explicit tables, bypassing the cache.
     *
     * Used to exercise rules the shipped tilesets never trigger — notably a tile
     * listed in two airflow groups, where the up-before-left-before-right
     * precedence is currently unobservable.
     */
    static fromTables(mapId: number, tables: NavTileTables): NavTileClassifier {
        return new NavTileClassifier(mapId, new Set(tables.passable), tables);
    }

    /** Drop cached classifiers, e.g. after regenerating the nav data. */
    static clearCache(): void {
        NavTileClassifier.cache.clear();
    }

    /** Flags for a tile id. Ids outside a byte are clamped, never read past. */
    classify(tile: number): number {
        if (tile < 0 || tile >= TILE_COUNT) return NAV.BLOCK_HEAD | NAV.BLOCK_BODY;
        return this.flags[tile]!;
    }

    /** Which way this tile pushes the hero, mirroring get_airflow_direction. */
    airflowDirection(tile: number): number {
        if (tile === 0) return AIRFLOW_NONE;
        const f = this.classify(tile);
        if (f & NAV.AIRFLOW_UP) return AIRFLOW_UP;
        if (f & NAV.AIRFLOW_LEFT) return AIRFLOW_LEFT;
        if (f & NAV.AIRFLOW_RIGHT) return AIRFLOW_RIGHT;
        return AIRFLOW_NONE;
    }

    /** The cavern's level, which selects ice (4) and heat (7) behaviour. */
    cavernLevel(): number {
        return NAV_MAP_BY_ID.get(this.mapId)?.cavernLevel ?? 0;
    }

    /** The cavern's attribute tables, for callers that need the raw lists. */
    attributeTables(): NavTileTables {
        return this.tables;
    }

    /**
     * True when the two blocking predicates agree for this map.
     *
     * They agree over the whole static map because the RLE is 6-bit and nothing
     * above 0x3F can appear; they diverge only over the platform band, which is
     * runtime-only. Callers building a static graph may use a single SOLID bit.
     */
    staticTilesAgree(): boolean {
        for (let tile = 0; tile < STATIC_TILE_COUNT; tile++) {
            const f = this.classify(tile);
            const head = (f & NAV.BLOCK_HEAD) !== 0;
            const body = (f & NAV.BLOCK_BODY) !== 0;
            if (head !== body) return false;
        }
        return true;
    }

    /** The 64-entry flag table, for bulk classification. Do not mutate. */
    table(): Readonly<Uint16Array> {
        return this.flags;
    }
}

/**
 * Number of passable slots a cavern may declare.
 *
 * The engine writes into a fixed 24-byte window and zero-pads
 * (core/ts-memory.ts:113-122), so a longer list would be silently truncated.
 */
export const PASSABLE_TABLE_SIZE = PASSABLE_SLOTS;
