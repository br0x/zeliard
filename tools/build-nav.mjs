/**
 * build-nav.mjs — generate web/src/data/nav/*.ts from the shipped cavern data.
 *
 * Usage:
 *   node tools/build-nav.mjs            # write the modules
 *   node tools/build-nav.mjs --check    # fail if the committed output is stale
 *
 * Inputs
 *   web/public/game/0/mp*.mdt          map geometry, doors, platforms
 *   web/src/data/dungeons.ts           per-map tile attribute tables
 *   tools/GrpViewer/mpp*.grp.unp        original tileset headers, drift guard only
 *
 * Outputs (committed):
 *   web/src/data/nav/nav-maps.ts       map metadata and graph components
 *   web/src/data/nav/nav-portals.ts    door records, normalised to standing spots,
 *                                       plus the post-boss door of every arena
 *   web/src/data/nav/nav-tiles.ts      per-cavern attribute tables
 *   web/src/data/nav/nav-platforms.ts  platform tables plus precomputed travel ranges
 *   web/src/data/nav/nav-keys.ts       key pickups, so the search can go and get them
 *   web/src/data/nav/nav-accessories.ts shoe pickups, which are not spendable
 *   web/src/data/nav/nav-airflows.ts   current tables plus lift columns and conveyor runs
 *   web/src/data/nav/index.ts          shared constants and the barrel
 *
 * See docs/PATHFINDER_PLAN.md §6.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCavern, MAP_HEIGHT } from './navlib/mdt.mjs';
import { loadDungeonsSource, diffAgainstTileset } from './navlib/dungeons-source.mjs';
import { buildGraph } from './navlib/graph-model.mjs';
import { buildPlatforms } from './navlib/platforms.mjs';
import { buildAirflows } from './navlib/airflows.mjs';
import { emitArray, emitLookup, lit, writeModule, INDENT } from './navlib/emit.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(REPO, 'web/src/data/nav');
const CHECK_ONLY = process.argv.includes('--check');

const MAP_COUNT = 31;
const TOWNS = 9;

// ── load ────────────────────────────────────────────────────────────────────

const source = loadDungeonsSource();

const maps = [];
for (let id = 0; id < MAP_COUNT; id++) {
    const src = source.get(id);
    const mdtPath = resolve(REPO, 'web/public', src.mdtPath);
    maps.push({ id, src, cavern: readCavern(new Uint8Array(readFileSync(mdtPath))) });
}

// ── derive ──────────────────────────────────────────────────────────────────

const platforms = new Map();
const airflows = new Map();
const keys = new Map();
const SHOE_KIND = { feruza: 1, pirika: 2, silkarn: 3, ruzeria: 4 };
const accessories = new Map();
for (const { id, cavern } of maps) {
    platforms.set(id, buildPlatforms(cavern, source.get(id).passable, MAP_HEIGHT));
    airflows.set(id, buildAirflows(cavern, MAP_HEIGHT, source.get(id).airflows ?? []));
    keys.set(id, cavern.keys);
    accessories.set(id, cavern.accessories);
}

// ── validate ────────────────────────────────────────────────────────────────

const problems = [];
/** Informational: doors whose d_place_map_id bit 7 is redundantly set. */
const redundantDestBit = [];
/** Informational: doors that have no mutual partner in the original data. */
const oneWayPortals = [];

for (const { id, src, cavern } of maps) {
    const header = cavern.header;
    const width = header.mapWidth;

    if (!(width > 0)) problems.push(`map ${id}: bad mapWidth ${width}`);
    if (cavern.tiles.length !== width * MAP_HEIGHT) {
        problems.push(`map ${id}: decoded ${cavern.tiles.length} tiles, expected ${width * MAP_HEIGHT}`);
    }
    if (!/^game\/0\/mp[0-9a-f]+\.mdt$/i.test(src.mdtPath)) {
        problems.push(`map ${id}: unexpected mdtPath '${src.mdtPath}'`);
    }
    if (src.passable.length === 0) problems.push(`map ${id}: empty passableTiles`);

    for (const d of cavern.doors) {
        // Bit 7 of d_place_map_id is redundant and inconsistent in the shipped
        // data: set on mp50's two town doors, clear on the other 13. The engine
        // never reads it — it ORs the bit in itself once y1 === 0xFF has already
        // identified a town door (engine/dungeon-doors.ts:250-252). So y1 is the
        // only town test and the stored bit is masked off.
        if (d.destMapIdRaw & 0x80) redundantDestBit.push(`map ${id} (${d.x0},${d.y0})`);

        // x0 lives on the source map and must fit it.
        if (d.x0 >= width) problems.push(`map ${id}: door x0=${d.x0} exceeds width ${width}`);

        // Town doors keep a stale d_place_map_id; the emitter overwrites it with -1.
        if (d.toTown) continue;

        if (d.destMapId >= MAP_COUNT) {
            problems.push(`map ${id}: door (${d.x0},${d.y0}) points at map ${d.destMapId}`);
            continue;
        }
        // x1 is an absolute X on the DESTINATION map, so it can legitimately
        // exceed the source width — mp30 is 204 wide and has a door whose x1 is
        // 205, arriving in the 224-wide mp20.
        const destWidth = maps[d.destMapId].cavern.header.mapWidth;
        if (d.x1 >= destWidth) {
            problems.push(
                `map ${id}: door (${d.x0},${d.y0}) -> map ${d.destMapId} `
                + `x1=${d.x1} exceeds the destination width ${destWidth}`,
            );
        }
    }

    problems.push(...diffAgainstTileset(src.tilesheetPath, src).map((p) => `map ${id}: ${p}`));
}

// ── maps ────────────────────────────────────────────────────────────────────

const mapWidthOf = maps.map((m) => m.cavern.header.mapWidth);

// ── boss exits ──────────────────────────────────────────────────────────────
// A boss arena's door table reads as a bare 0xFFFF sentinel, so its doors never
// reach `portalItems`. The exit is not missing though: it is the record the
// cavern's post-boss initialiser list installs, and only its COLUMN is written
// at runtime (`load_place_and_reinit`, engine/dungeon-cutover.ts:76-99). See
// readPostBossDoor in tools/navlib/mdt.mjs.

const bossExitItems = [];
for (const { id, cavern } of maps) {
    const d = cavern.postBossDoor;
    if (!d) continue;
    const label = () => `${maps[id].src.mdtPath.split('/').pop()} -> map ${d.destMapId}`;
    if (cavern.doors.length > 0) {
        problems.push(`map ${id}: has a post-boss door but its door table is not empty`);
        continue;
    }
    if (d.toTown) {
        // mp73's post-boss door opens onto a town, which is never routed through.
        bossExitItems.push({ mapId: id, y0: d.y0, toTown: true, destMapId: -1, destX: -1, destY: -1, key: 0, rokademo: d.rokademo, exitFacesLeft: d.exitFacesLeft, color: d.color });
        continue;
    }
    if (d.destMapId >= MAP_COUNT) {
        problems.push(`map ${id}: post-boss door points at map ${d.destMapId}`);
        continue;
    }
    if (d.x1 >= maps[d.destMapId].cavern.header.mapWidth) {
        problems.push(`${label()}: post-boss x1=${d.x1} exceeds the destination width`);
        continue;
    }
    bossExitItems.push({
        mapId: id,
        y0: d.y0,
        toTown: false,
        destMapId: d.destMapId,
        destX: d.x1,
        destY: (d.y1 + 1) & 0x3f,
        key: d.open ? 0 : (d.needsLionKey ? 2 : 1),
        rokademo: d.rokademo,
        exitFacesLeft: d.exitFacesLeft,
        color: d.color,
    });
}

// ── portals ─────────────────────────────────────────────────────────────────

const portalItems = [];
for (const { id, cavern } of maps) {
    for (const d of cavern.doors) {
        portalItems.push({
            mapId: id,
            x0: d.x0,
            y0: d.y0,
            toTown: d.toTown,
            destMapId: d.toTown ? -1 : d.destMapId,
            destX: d.toTown ? -1 : d.x1,
            destY: d.toTown ? -1 : d.y1,
            // An *open* door is walked through and costs nothing
            // (`enterOpenedDoor`, dungeon-doors.ts:110-112); only a closed one
            // calls `openDoor`, which spends a Lion-Head key when the feature bit
            // says so and an ordinary key otherwise (dungeon-doors.ts:122-131).
            // [measured] 139 of the 163 doors in the game are open.
            key: d.open ? 0 : (d.needsLionKey ? 2 : 1),
            rokademo: d.rokademo,
            exitFacesLeft: d.exitFacesLeft,
            color: d.color,
            // Standing position on the source side. enterTheDoor matches
            // heroAbsX === x0 and heroAbsY - 1 === y0 (engine/dungeon-doors.ts:90),
            // so the departure cell is (x0, y0 + 1).
            fromX: d.x0,
            fromY: (d.y0 + 1) & 0x3f,
            // Arrival: heroLeft16Down1 places the hero at (x1, y1 + 1)
            // (engine/dungeon-init.ts:97-107) — the same convention.
            toX: d.toTown ? -1 : d.x1,
            toY: d.toTown ? -1 : (d.y1 + 1) & 0x3f,
            // Set below: the destination map has no door table at all.
            deadEnd: false,
            // Set below: no door on the destination map leads back here.
            oneWay: false,
        });
    }
}

const graph = buildGraph(portalItems, MAP_COUNT, bossExitItems);

// Flag the one-way portals the topology pass found. deadEnd = the far map has no
// door table at all (a boss arena); oneWay = a different door occupies the
// arrival cell, so the link cannot be reversed.
for (const i of graph.deadEnd) portalItems[i].deadEnd = true;
for (const i of graph.oneWay) portalItems[i].oneWay = true;

const mapItems = maps.map(({ id, src, cavern }) => {
    const base = src.mdtPath.split('/').pop() ?? '';
    return {
        id,
        mdtPath: src.mdtPath,
        nameKey: base.replace(/\.mdt$/i, ''),
        cavernLevel: cavern.header.cavernLevel,
        mapWidth: cavern.header.mapWidth,
        component: graph.sccOf[id],
        /**
         * No door table at all. True for the 8 boss arenas and for the three
         * warp-only rooms (mp73, mp90, mpa0), so this is NOT a "boss room" flag —
         * see isBossArena for that.
         */
        isDoorless: cavern.doors.length === 0,
        /** The 8 MP<W>D arenas, by file-name convention (tools/MDTViewer constants.py:165). */
        isBossArena: /^mp[0-9a-f]+d$/i.test(base.replace(/\.mdt$/i, '')),
    };
});

const componentItems = graph.sccs.map((c) => ({
    id: c.id,
    maps: c.maps,
    portalPairs: graph.pairs.filter(([a]) => c.maps.includes(portalItems[a].mapId)),
    tiles: c.maps.reduce((sum, m) => sum + mapWidthOf[m] * MAP_HEIGHT, 0),
}));

// Every map a route can be plotted to, indexed by map id. The map strip uses
// this; scc() is the narrower "can also come back" group.
const reachableItems = maps.map((m) => graph.reachableFrom(m.id));

if (problems.length > 0) {
    console.error('nav build failed:\n  ' + problems.join('\n  '));
    process.exit(1);
}

// ── derive table payloads ───────────────────────────────────────────────────

const TILE_SLOTS = 12;
const pad = (arr) => {
    const out = arr.slice();
    while (out.length < TILE_SLOTS) out.push(0);
    return out;
};
const tileItems = {};
for (const { id, src } of maps) {
    tileItems[id] = {
        passable: src.passable,
        slopeLeft: src.slopeLeft ?? [],
        slopeRight: src.slopeRight ?? [],
        aggressive: src.aggressive ?? [],
        // Fixed 12 slots so the runtime never slices defensively.
        airflows: pad(Array.from({ length: TILE_SLOTS }, (_, k) => src.airflows?.[k] ?? 0)),
    };
}
const platformItems = {};
const airflowItems = {};
for (const { id } of maps) {
    platformItems[id] = platforms.get(id);
    // buildAirflows also returns a classifier closure for the graph builder;
    // only the serialisable tables are emitted.
    const a = airflows.get(id);
    airflowItems[id] = {
        up: a.up, left: a.left, right: a.right, lifts: a.lifts, conveyors: a.conveyors,
    };
}

// ── emit ────────────────────────────────────────────────────────────────────

const navPortals = writeModule(resolve(OUT_DIR, 'nav-portals.ts'), [
    `/** 0 = no key, 1 = ordinary key, 2 = Lion-Head key. */
export type PortalKeyKind = 0 | 1 | 2;

/**
 * One door, with both ends pre-normalised to a hero standing position.
 *
 * A standing position is (hero left column, hero head row). enterTheDoor matches
 * heroAbsX === x0 and heroAbsY - 1 === y0 (engine/dungeon-doors.ts:90-101), so
 * the departure cell is (x0, y0 + 1); heroLeft16Down1 places the hero at
 * (x1, y1 + 1) on arrival (engine/dungeon-init.ts:97-107).
 */
export interface NavPortal {
    readonly mapId: number;
    readonly x0: number;
    readonly y0: number;
    /** y1 === 0xFF: the door leads to a town and is never routed through. */
    readonly toTown: boolean;
    /** -1 when toTown; the file's own field is stale for those doors. */
    readonly destMapId: number;
    readonly destX: number;
    readonly destY: number;
    readonly key: PortalKeyKind;
    /** d_features bit 7 — the boss was just defeated; one-way. */
    readonly rokademo: boolean;
    readonly exitFacesLeft: boolean;
    readonly color: number;
    /** Standing position on the source side. */
    readonly fromX: number;
    readonly fromY: number;
    /** Standing position on the destination side; -1 when toTown. */
    readonly toX: number;
    readonly toY: number;
    /**
     * True when the destination map has no door table at all — a boss arena or
     * a Jashiin room. The route may enter but must never leave by this door.
     * A boss arena's way out is BOSS_EXITS, not a portal of its own.
     */
    readonly deadEnd: boolean;
    /**
     * True when no door on the destination map leads back to this one, so the
     * route may cross outwards but never back through this portal.
     */
    readonly oneWay: boolean;
}
`,
    emitArray('PORTALS', 'NavPortal', portalItems),
    `/** Portal indices grouped by source map, ascending. */
export const NAV_PORTALS_BY_MAP: readonly (readonly number[])[] = [
${INDENT}${maps.map((m) => {
        const idx = portalItems.map((p, i) => (p.mapId === m.id ? i : -1)).filter((i) => i >= 0);
        return `[${idx.join(', ')}]`;
    }).join(`,\n${INDENT}`)},
];
`,
    `/** Doors per map, so the graph builder can size its buffers. */
export const NAV_DOOR_COUNT: readonly number[] = [
${INDENT}${maps.map((m) => String(m.cavern.doors.length)).join(`,\n${INDENT}`)},
];
`,
    `/**
 * The way out of a boss arena, which the arena's own door table does not describe.
 *
 * An arena's \`doors\` pointer aims at a bare 0xFFFF sentinel, so a route that only
 * walked doors found it doorless and stopped there. It is not: when the boss dies,
 * \`load_place_and_reinit\` swaps the door-table pointer for a second list
 * (engine/dungeon-cutover.ts:76-99, list at the cavern descriptor + 8) and then
 * writes ONE word into it — the record's x0, stamped with the column the hero is
 * standing on.
 *
 * So this is a door with no column: everything else about it is file data, and the
 * hero leaves by walking into the door that appears where he happens to be standing.
 * The graph therefore offers it from EVERY standing position on row \`y0 + 1\`, which
 * is the row enterTheDoor matches on (heroAbsY - 1 === y0, dungeon-doors.ts:90).
 * [measured] every one of the ten answers opens back onto the cavern its arena
 * belongs to: mp1d onto mp10 at (141,33), mp2d onto mp20 at (190,48),
 * mp8d onto mp84 at (16,52), mp73 onto a town, mpa0 onto itself.
 */
export interface NavBossExit {
    /** The arena. */
    readonly mapId: number;
    /** d_y0 of the record: the hero stands on row y0 + 1 to walk into it. */
    readonly y0: number;
    /** y1 === 0xFF: the exit opens onto a town, so it is never routed through. */
    readonly toTown: boolean;
    readonly destMapId: number;
    readonly destX: number;
    readonly destY: number;
    readonly key: PortalKeyKind;
    readonly rokademo: boolean;
    readonly exitFacesLeft: boolean;
    readonly color: number;
}

`,
    emitArray('NAV_BOSS_EXITS', 'NavBossExit', bossExitItems),
    `/** Index into NAV_BOSS_EXITS per map id, -1 where there is no post-boss door. */
export const NAV_BOSS_EXIT_BY_MAP: readonly number[] = [
${INDENT}${maps.map((m) => String(bossExitItems.findIndex((e) => e.mapId === m.id))).join(`,\n${INDENT}`)},
];
`,
], CHECK_ONLY);

const navMaps = writeModule(resolve(OUT_DIR, 'nav-maps.ts'), [
    `/** Map metadata needed by the navigation graph. */
export interface NavMapMeta {
    /** DUNGEONS key. */
    readonly id: number;
    readonly mdtPath: string;
    /** Locale key for the cavern name, resolved via t('dungeon.names.<key>'). */
    readonly nameKey: string;
    /**
     * MDT header byte 0x12. 1..9 drive ice (4), heat (7) and the aggressive
     * damage table index; mpa0 stores 10, which the engine's table lookup falls
     * back to 1 for (engine/dungeon-damage.ts:216-217).
     */
    readonly cavernLevel: number;
    readonly mapWidth: number;
    /** Connected component id, cut at town doors. */
    readonly component: number;
    /**
     * No door table at all. True for the 8 boss arenas AND for the three
     * warp-only rooms (mp73, mp90, mpa0) — this is a topology fact, not a genre.
     */
    readonly isDoorless: boolean;
    /** The 8 MP<W>D arenas, by file-name convention. These have no ropes. */
    readonly isBossArena: boolean;
}

/** A connected component of the cavern graph. */
export interface NavComponent {
    readonly id: number;
    /** DUNGEON ids that are members of this component. */
    readonly maps: readonly number[];
    /**
     * Indices into PORTALS, one entry per traversable door: [outbound, inbound].
     * A door into a 0-door map is absent — it is a terminal edge.
     */
    readonly portalPairs: readonly (readonly [number, number])[];
    readonly tiles: number;
}
`,
    emitArray('NAV_MAPS', 'NavMapMeta', mapItems),
    emitLookup('NAV_MAP_BY_ID', 'NAV_MAPS', 'NavMapMeta', 'e.id'),
    `/** Tiles per map, for sizing the graph builder's buffers. */
export const NAV_MAP_TILES: readonly number[] = [
${INDENT}${maps.map((m) => String(m.cavern.tiles.length)).join(`,\n${INDENT}`)},
];
`,
    emitArray('NAV_COMPONENTS', 'NavComponent', componentItems),
    `/**
 * Maps a route can be plotted to, indexed by map id.
 *
 * Follows outbound doors everywhere and inbound doors only where the two are
 * mutual, so a boss arena stays selectable as a destination without being
 * treated as two-way. Always a superset of the owning component's maps.
 */
export const NAV_REACHABLE: readonly (readonly number[])[] = [
${INDENT}${reachableItems.map((r) => (r.length ? `[${r.join(', ')}]` : '[]')).join(`,\n${INDENT}`)},
];
`,
], CHECK_ONLY);

const navTiles = writeModule(resolve(OUT_DIR, 'nav-tiles.ts'), [
    `/**
 * Per-cavern tile attribute tables.
 *
 * These mirror mppX.grp.unp bytes 0x00-0x2F and are what main.ts pushes into
 * seg1 at 0x8000 (core/ts-memory.ts:124-147). They are per-map overrides, not
 * tileset defaults: every boss room shares its world's mppX.grp but declares
 * empty slope, aggressive and airflow tables, because an arena has no hazards.
 */
export interface NavTileTables {
    /** 24 entries. A tile id is passable iff it appears here. */
    readonly passable: readonly number[];
    readonly slopeLeft: readonly number[];
    readonly slopeRight: readonly number[];
    readonly aggressive: readonly number[];
    /** 4 up, then 4 left, then 4 right; zero-filled, zero-terminated per group. */
    readonly airflows: readonly number[];
}
`,
    `export const NAV_TILES: Readonly<Record<number, NavTileTables>> = ${lit(tileItems, 0)};\n`,
], CHECK_ONLY);

const navPlatforms = writeModule(resolve(OUT_DIR, 'nav-platforms.ts'), [
    `/**
 * A vertical platform the hero operates with Up/Down. It is a bidirectional lift
 * over a fixed column: both moves carry the hero with the platform
 * (engine/dungeon-vertical.ts:380-467).
 */
export interface NavVerticalPlatform {
    readonly kind: 0;
    /** Platform LEFT column; the platform spans x .. x+2. */
    readonly x: number;
    readonly startY: number;
    /** Highest row reachable going up, and lowest going down. */
    readonly topY: number;
    readonly bottomY: number;
}

/**
 * A collapsing platform: descends one row per frame while the hero is aboard and
 * never rises (engine/dungeon-vertical.ts:472-484).
 */
export interface NavCollapsingPlatform {
    readonly kind: 1;
    readonly x: number;
    readonly startY: number;
    readonly bottomY: number;
}

/**
 * A horizontal platform: fully automated, oscillating between minX and maxX and
 * carrying the hero (engine/dungeon-platforms.ts:127-167). Reachability is
 * time-independent because the hero can wait.
 */
export interface NavHorizontalPlatform {
    readonly kind: 2;
    readonly y: number;
    readonly startX: number;
    readonly minX: number;
    readonly maxX: number;
    /** Span length in columns; wraps the seam, e.g. 231 -> 11 on width 240. */
    readonly cols: number;
    /** 0 frozen (a static ledge), 1 every other tick, 2-3 every tick. */
    readonly speed: number;
    readonly movingLeft: boolean;
}

export type NavPlatform = NavVerticalPlatform | NavCollapsingPlatform | NavHorizontalPlatform;

export interface NavPlatformTables {
    readonly vertical: readonly NavVerticalPlatform[];
    readonly collapsing: readonly NavCollapsingPlatform[];
    readonly horizontal: readonly NavHorizontalPlatform[];
}
`,
    `export const NAV_PLATFORMS: Readonly<Record<number, NavPlatformTables>> = ${lit(platformItems, 0)};\n`,
], CHECK_ONLY);

const navAirflows = writeModule(resolve(OUT_DIR, 'nav-airflows.ts'), [
    `/**
 * A column that lifts the hero 2 rows per frame with NO collision test
 * (engine/dungeon-frame-pre.ts:40-58). The run deliberately includes solid
 * tiles: the lift ignores solidity, so a jet's decorative upper cells are
 * exactly what carries the hero through them.
 */
export interface NavLiftColumn {
    readonly x: number;
    readonly toY: number;
    readonly fromY: number;
    /** Ride length in rows, 1..64. */
    readonly rows: number;
}

/** A current that sweeps the hero 2 columns per frame, one way only. */
export interface NavConveyorRun {
    readonly y: number;
    readonly x0: number;
    readonly x1: number;
    readonly cols: number;
    /** 1 sweeps left, 2 sweeps right. */
    readonly dir: 1 | 2;
}

export interface NavAirflowTables {
    /** 4 up, 4 left, 4 right; zero-terminated per group. */
    readonly up: readonly number[];
    readonly left: readonly number[];
    readonly right: readonly number[];
    readonly lifts: readonly NavLiftColumn[];
    readonly conveyors: readonly NavConveyorRun[];
}
`,
    `export const NAV_AIRFLOWS: Readonly<Record<number, NavAirflowTables>> = ${lit(airflowItems, 0)};\n`,
], CHECK_ONLY);

const navAccessories = writeModule(resolve(OUT_DIR, 'nav-accessories.ts'), [
    `/** Which pair a pickup hands over: 1 Feruza, 2 Pirika, 3 Silkarn, 4 Ruzeria. */
export type NavShoe = 1 | 2 | 3 | 4;

/** The pair's name as the game spells it, for the route's own list. */
export const NAV_SHOE_LABEL: Readonly<Record<NavShoe, string>> = {
    1: 'Feruza', 2: 'Pirika', 3: 'Silkarn', 4: 'Ruzeria',
};

/** A pair lying on the floor, which the hero collects by walking over the cell. */
export interface NavAccessory {
    /** Hero left column. */
    readonly col: number;
    /** Hero head row. */
    readonly row: number;
    readonly shoe: NavShoe;
}

/**
 * Shoe pickups per map, read from the MDT's 16-byte entity records.
 *
 * A pair is an item in the cavern like a key is, but it is not a key. Walking over
 * it puts it in the hero's inventory (put_shoes_to_inventory,
 * engine/dungeon-items.ts:182-187) and it stays there: he may wear any pair he is
 * carrying, or none, and changing costs nothing and takes no time. So a route may
 * collect a pair and keep it, and may collect two, which is what a slope and a
 * four-tile jump in one journey needs.
 *
 * There are four in the whole game and no more, so no pair is ever duplicated:
 * Ruzeria on level 4, Pirika on level 5, and Silkarn and Feruza on level 6. Which
 * pair a level-6 0x1A record is was decided by the cavern level at pickup time
 * (flag1a, engine/dungeon-items.ts:436-458), not by anything in the record, so the
 * level is resolved here.
 */
export const NAV_ACCESSORIES: Readonly<Record<number, readonly NavAccessory[]>> = {
${INDENT}${maps.map((m) => {
        const list = accessories.get(m.id);
        if (!list || list.length === 0) return null;
        const items = list.map((a) => `{ col: ${a.col}, row: ${a.row}, shoe: ${SHOE_KIND[a.shoe]} }`);
        return `${m.id}: [${items.join(', ')}]`;
    }).filter(Boolean).join(`,\n${INDENT}`)},
};
`,
], CHECK_ONLY);

const navKeys = writeModule(resolve(OUT_DIR, 'nav-keys.ts'), [
    `/** A key lying on the floor: the hero collects it by walking over the cell. */
export interface NavKey {
    /** Hero left column. */
    readonly col: number;
    /** Hero head row. */
    readonly row: number;
    /** 0 an ordinary key (flag_16), 1 a Lion-Head key (flag_17). */
    readonly kind: 0 | 1;
}

/**
 * Key pickups per map, read from the MDT's 16-byte entity records.
 *
 * The cell is already a hero standing position, so a key needs no edge of its own:
 * the pickup fires from the ordinary alignment test while he walks over it, and the
 * route therefore passes through the cell without being told to.
 *
 * A key the player has already taken is not in this table's world: the engine drops
 * it from the list at dungeon init (remove_accomplished_items,
 * engine/dungeon-init.ts:75). So a table entry means "there is a key here in the
 * original data", not "there is a key here now" — the search is told which are
 * still present.
 */
export const NAV_KEYS: Readonly<Record<number, readonly NavKey[]>> = {
${INDENT}${maps.map((m) => {
        const list = keys.get(m.id);
        if (!list || list.length === 0) return null;
        const items = list.map((k) => `{col: ${k.col}, row: ${k.row}, kind: ${k.kind === 'lion' ? 1 : 0}}`);
        return `${m.id}: [${items.join(', ')}]`;
    }).filter(Boolean).join(`,\n${INDENT}`)},
};
`,
    `/** Key count per map, ordered by id, for sizing. */
export const NAV_KEY_COUNT: readonly number[] = [
${INDENT}${maps.map((m) => String(keys.get(m.id)?.length ?? 0)).join(`,\n${INDENT}`)},
];
`,
], CHECK_ONLY);

const index = writeModule(resolve(OUT_DIR, 'index.ts'), [
    `/** Rows in every cavern map; fixed by the MDT format. */
export const NAV_MAP_HEIGHT = ${MAP_HEIGHT};

/** Cavern maps in the game. */
export const NAV_MAP_COUNT = ${MAP_COUNT};

/** Towns, which bound the shop stock tables. */
export const NAV_TOWN_COUNT = ${TOWNS};
`,
    `export type { NavMapMeta, NavComponent } from './nav-maps.js';
export { NAV_MAPS, NAV_MAP_BY_ID, NAV_MAP_TILES, NAV_COMPONENTS } from './nav-maps.js';

export type { NavPortal, NavBossExit, PortalKeyKind } from './nav-portals.js';
export { PORTALS, NAV_PORTALS_BY_MAP, NAV_DOOR_COUNT, NAV_BOSS_EXITS, NAV_BOSS_EXIT_BY_MAP } from './nav-portals.js';

export type { NavTileTables } from './nav-tiles.js';
export { NAV_TILES } from './nav-tiles.js';

export type {
    NavPlatform, NavPlatformTables,
    NavVerticalPlatform, NavCollapsingPlatform, NavHorizontalPlatform,
} from './nav-platforms.js';
export { NAV_PLATFORMS } from './nav-platforms.js';
export { NAV_KEYS, NAV_KEY_COUNT } from './nav-keys.js';

export type { NavAirflowTables, NavLiftColumn, NavConveyorRun } from './nav-airflows.js';
export { NAV_AIRFLOWS } from './nav-airflows.js';
`,
], CHECK_ONLY);

// ── report ──────────────────────────────────────────────────────────────────

const written = [navMaps, navPortals, navTiles, navPlatforms, navAirflows, index];
const stale = written.filter((w) => w.changed);
const rel = (p) => p.slice(REPO.length + 1);

if (oneWayPortals.length > 0) {
    console.warn(
        `note: ${oneWayPortals.length} door(s) have no mutual partner and are one-way in the `
        + `original data: ${oneWayPortals.join(', ')}`,
    );
}

if (redundantDestBit.length > 0) {
    console.warn(
        `note: ${redundantDestBit.length} door(s) carry a redundant d_place_map_id bit 7 `
        + `(ignored; y1 === 0xFF is the town test): ${redundantDestBit.join(', ')}`,
    );
}

if (CHECK_ONLY) {
    if (stale.length > 0) {
        console.error(
            'generated nav data is stale — run: node tools/build-nav.mjs\n  ' + stale.map((w) => rel(w.path)).join('\n  '),
        );
        process.exit(1);
    }
    console.log('nav data is up to date');
} else {
    console.log(JSON.stringify({
        maps: maps.length,
        portals: portalItems.length,
        portalsToTown: portalItems.filter((p) => p.toTown).length,
        lionKeyPortals: portalItems.filter((p) => p.key === 2).length,
        deadEndPortals: portalItems.filter((p) => p.deadEnd).length,
        oneWayPortals: portalItems.filter((p) => p.oneWay).length,
        bossExits: bossExitItems.length,
        bossExitsToTown: bossExitItems.filter((e) => e.toTown).length,
        components: graph.sccs.length,
        tiles: maps.reduce((acc, m) => acc + m.cavern.tiles.length, 0),
        verticalPlatforms: maps.reduce((acc, m) => acc + platforms.get(m.id).vertical.length, 0),
        collapsingPlatforms: maps.reduce((acc, m) => acc + platforms.get(m.id).collapsing.length, 0),
        horizontalPlatforms: maps.reduce((acc, m) => acc + platforms.get(m.id).horizontal.length, 0),
        liftColumns: maps.reduce((acc, m) => acc + airflows.get(m.id).lifts.length, 0),
        conveyorRuns: maps.reduce((acc, m) => acc + airflows.get(m.id).conveyors.length, 0),
    }, null, 2));
    console.log(stale.length === 0 ? 'nothing to write (already current)' : `wrote ${stale.length} file(s):`);
    for (const w of stale) console.log('  ' + rel(w.path));
}
