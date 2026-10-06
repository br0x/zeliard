/**
 * map-screen.ts — the full-screen cavern map, for picking a destination.
 *
 * The screen exists for exactly one purpose: choosing where to go. It draws no
 * route — revealing the path before the player has committed to a destination
 * would spoil the cavern — and picking a point closes it straight back to the
 * inventory, whose usage message confirms the thread was spent. The route itself
 * appears only once the player leaves the inventory; see render/path-overlay.ts.
 *
 * It follows the shape of InventoryScreen rather than the `Modal` contract,
 * because it needs raw `KeyboardEvent.code` (Modal translates `KeyA` to `a`) and
 * pointer coordinates, which Modal has no channel for. Like the inventory it is
 * its own slot rather than a ModalManager occupant, so it can sit *on top of* the
 * inventory while both are open.
 *
 * Layout, all in the fixed 672x432 canvas space:
 *
 *   y  0..26   border and title
 *   y 28..54   map strip — the caverns this one can be routed through
 *   y 54..390  map area, below the strip
 *   y 394..410 status line: where the hero stands, where the cursor points
 *   y 414..430 hint line
 *
 * The map is the cavern at an integer scale that fits its chart, the rows of it
 * that have anything on them:
 * `S = floor(min(672/W, 336/charted))`, clamped to 1..12. The widest cavern is
 * 320 tiles, so S is 2 there and everything fits without panning or zooming. A
 * cavern 73 tiles wide or less is not asked to fit all 64 of its rows: a boss
 * arena is two thirds solid rock and draws at 9x, or 12x at 52 tiles wide.
 */

import { NAV_MAP_BY_ID, NAV_REACHABLE } from '../data/nav/nav-maps.js';
import { NAV_MAP_HEIGHT } from '../data/nav/index.js';
import { PORTALS, NAV_PORTALS_BY_MAP } from '../data/nav/nav-portals.js';
import { NavTileClassifier } from '../engine/nav/attributes.js';
import { NAV } from '../engine/nav/types.js';
import { CLOSED_DOOR_TILES, OPENED_DOOR_TILES } from '../engine/dungeon-frame-pre.js';
import {
    findRoute, type NavGraphStore, type NavRoute, type NavRoutePlan,
} from '../engine/nav/pathfinder.js';
import type { NavTileGrid } from '../engine/nav/mdt-grid.js';
import type { HeroCapabilities } from '../engine/nav/capabilities.js';
import { drawSheetFrame } from '../render/sheets.js';
import { TILE_SIZE } from '../config/engine.js';

const VIEW_W = 672;
const VIEW_H = 432;
const STRIP_TOP = 28;
const STRIP_H = 26;
/**
 * The map area starts under the strip, not at it.
 *
 * Both used to share `y 28..412`, which only works while the map is shorter than
 * the strip: a cavern scaled to fill all 384px centres its top edge on y 28 and
 * paints straight over the tabs. Only the height-bound caverns ever got that far
 * — the eight boss arenas and the one normal cavern as narrow as they are — and
 * the strip is drawn first, so the map won.
 */
const AREA_TOP = STRIP_TOP + STRIP_H;   // 54
const AREA_H = 336;                     // 54..390, clear of the status line
const STATUS_TOP = 394;
const HINT_TOP = 414;
/**
 * Ceiling on the display scale.
 *
 * High enough for the narrowest cavern to fill the width, which is what trimming
 * the chart buys: only mp2d (52 tiles) is actually held back by this.
 */
const MAX_SCALE = 12;
const SNAP_RADIUS = 2;       // tiles searched outward for a valid standing spot
const LRU_RASTERS = 4;

/** A cavern tile is `TILE_SIZE` in the game's sheets — 24x24; the map scales down. */
const MAP_TILE_PX = TILE_SIZE;

/**
 * Rows a standing cell carries below its own.
 *
 * The hero's box is three rows tall (`heroBoxFree`, nav/geometry.ts:69) and the
 * floor check reads the row after his feet — `headRow + 3`, nav/geometry.ts:118 —
 * so a chart that ends on his row ends on the tile he is stood on.
 */
const HERO_BOX_ROWS = 3;

/**
 * The tiles a chart is trimmed of: the void, and the rock a cavern is cut into.
 *
 * Both are drawn, but neither is anything a player aims at, and in a boss cavern
 * they are most of the map. See {@link MapScreen.chartedRows}.
 */
const TRIMMED = NAV.EMPTY | NAV.BLOCK_HEAD | NAV.BLOCK_BODY;

/**
 * The door composite: 5 tiles wide, 4 tall, blitted from the shared dchr sheet.
 *
 * The tile ids themselves are `CLOSED_DOOR_TILES` / `OPENED_DOOR_TILES` in
 * engine/dungeon-frame-pre.ts — the same tables the live view stamps into the
 * proximity map — so a door here is the door there, at the map's own scale.
 */
const DOOR_W = 5;
const DOOR_H = 4;
/** First tile id of the dchr band; `TILE_ID - 0x40` is its frame index. */
const DCHR_BASE_TILE = 0x40;
/** The one tile of the composite that is neither frame nor doorway: roka colour. */
const ROKA_COLOUR_INDEX = 2;

const FONT_TITLE = 'bold 18px "Courier New", Courier, monospace';
const FONT_SMALL = '14px "Courier New", Courier, monospace';

/**
 * The hint line, in the only face that fits it.
 *
 * "Press Start 2P" is a pixel font whose glyphs are as wide as they are tall, and
 * the hint is the longest line the screen draws: at 12px it ran past the canvas.
 * Courier's 0.6em advance is a third narrower, and 14px still reads at a glance.
 */
const FONT_HINT = 'bold 14px "Courier New", Courier, monospace';

/**
 * The status line, one step down from the hint line.
 *
 * Both are read in the same glance as the map itself, so they share a face; the
 * line is regular weight and sits a band above the hint, because it reports
 * state rather than explaining the controls.
 */
const FONT_STATUS = '14px "Courier New", Courier, monospace';

/** Colours for the scaled raster, by tile class. */
const COL = {
    floor: '#2f3b52',
    rope: '#c8a24a',
    slope: '#6b7a99',
    aggressive: '#7a2f2f',
    platform: '#4a6f8f',
    solid: '#101018',
    empty: '#000000',
} as const;

/** The two sheets a cavern's own tiles are cut from. */
export interface MapTileSheets {
    /** `DUNGEONS[mapId].tilesheetPath` — tile ids 1..n are frames of it. */
    tiles: HTMLImageElement;
    /** The shared platform sheet — tile ids 0x40.. are frames of it. */
    platforms: HTMLImageElement | null;
}

export interface MapScreenDeps {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    /** Graph store, used for both the raster's tiles and the route search. */
    store: NavGraphStore;
    /**
     * The cavern's own tiles, loaded on demand.
     *
     * The map is the real cavern: the same sheet `drawStaticTile` blits in the
     * live view, so a wall on the map is the colour that wall has in the game.
     * Optional, and the screen falls back to flat classes without it.
     */
    tileSheets?: (mapId: number) => Promise<MapTileSheets | null>;
    /** Where the hero is standing, in map coordinates. */
    heroPosition: () => { mapId: number; col: number; row: number } | null;
    /** The hero's abilities, for the route search. */
    capabilities: () => HeroCapabilities;
    /** Names, resolved by the composition root so this module has no locale import. */
    text: (key: string) => string;
    /** Dismissed without choosing — back to the inventory. */
    onExit: () => void;
    /**
     * A destination was chosen; the route is already computed.
     *
     * `plan` says which rung of the ladder answered, so the guide that keeps drawing
     * the thread can re-plan under the same assumptions. Without it a route that went
     * to fetch a key is re-planned as though the hero were already holding one, and
     * with an empty pocket that search finds nothing and the thread is dropped.
     */
    onPick: (route: NavRoute, plan: NavRoutePlan) => void;
    /**
     * Whether a key is still lying where the generated table says there was one.
     *
     * A key the player has already taken is not in the world — the engine drops it
     * from the list at dungeon init (engine/dungeon-init.ts:75). The composition
     * root answers from the save; without it the screen assumes every key is
     * still there, which is right for a fresh game.
     */
    keyPresent?: (mapId: number, col: number, row: number, kind: 0 | 1) => boolean;
    /**
     * Whether a pair of shoes is still lying where the generated table says.
     *
     * Same reason as {@link keyPresent} — the engine drops an item the player has
     * already taken from the entity list at dungeon init (engine/dungeon-init.ts:75) —
     * and the same default: with nothing to ask, every pair is assumed to be there,
     * which is right for a fresh game.
     */
    shoePresent?: (mapId: number, col: number, row: number, shoe: number) => boolean;
    /**
     * Whether a door stands open right now, or null when the answer is not known.
     *
     * The cavern a door is on is not necessarily the one the hero stands in, and
     * the engine keeps a door table only for the loaded cavern, so this is asked
     * per door and may decline. Without it a door is drawn from its level data:
     * a door the MDT shipped open, which is 139 of the 163 in the game.
     */
    doorOpen?: (mapId: number, x0: number, y0: number) => boolean | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy SoundManager
    soundManager?: any;
}

export interface MapScreenSnapshot {
    /** The cavern map the hero is standing in. */
    readonly heroMapId: number;
    readonly heroCol: number;
    readonly heroRow: number;
}

export class MapScreen {
    active = false;
    /** Which map of the component is on screen. */
    displayMapId = 0;
    /** Cursor position, in map coordinates of the displayed map. */
    cursorCol = 0;
    cursorRow = 0;

    private readonly maps: number[] = [];
    private stripIndex = 0;
    private readonly rasters = new Map<string, HTMLCanvasElement>();
    private readonly rasterOrder: string[] = [];
    /** Rows each charted cavern keeps, by map. Measured once the grid is here. */
    private readonly charted = new Map<number, number>();
    private readonly pendingRasters = new Set<string>();
    private loading = false;
    private message = '';
    private messageUntil = 0;
    /** The hero's map when the screen opened; the reachable set is keyed off it. */
    private heroMapId = 0;
    /**
     * Loading every cavern the route may use, once.
     *
     * The game only holds the MDT of the cavern the hero is standing in, so a store
     * that has never been asked for another map reports `null` for it — and
     * `findRoute` skips any door whose destination graph is missing. That silently
     * deleted every route that needs to leave the map, and it is not a rare shape:
     * **mp30 has no internal path at all** from `(185,19)` to `(161,54)`, because the
     * two cells are in different chambers and the way through is via mp31. Asked for
     * that destination, the screen reported "No route found." while mp31's graph sat
     * unloaded behind a door the player could have walked through.
     */
    private componentReady: Promise<unknown> | null = null;
    /**
     * The shared dchr sheet, for the door composites.
     *
     * Doors are drawn live rather than baked into the raster: opening one changes
     * it, and a raster is cached for as long as the screen lives. The sheet is the
     * same image `buildRaster` already loads for the platform tiles, so the first
     * frame after a map is shown has no doors and the frames after it do.
     */
    private doorSheet: HTMLImageElement | null = null;
    private doorSheetWanted = false;

    constructor(private readonly deps: MapScreenDeps) {}

    /** Called when the item is used. `snapshot` says where the hero is. */
    enter(snapshot: MapScreenSnapshot): void {
        this.active = true;
        this.loading = false;
        this.message = '';
        this.displayMapId = snapshot.heroMapId;
        this.heroMapId = snapshot.heroMapId;
        this.cursorCol = snapshot.heroCol;
        this.cursorRow = snapshot.heroRow;
        this.refreshStrip(snapshot.heroMapId);
        this.stripIndex = Math.max(0, this.maps.indexOf(snapshot.heroMapId));
        this.clearMessage();
        // Start fetching the rest of the component now, while the player is still
        // reading the map. By the time a destination is picked this has usually
        // finished, and `choose` waits for it either way.
        void this.ensureComponent();
    }

    /**
     * Every cavern the hero can be routed through, fetched and graphed.
     *
     * Memoized, so a screen opened and closed repeatedly does not refetch, and
     * concurrent calls share one pass. A map that fails to load is simply absent
     * from the search — the same as before, and no worse.
     */
    private ensureComponent(): Promise<unknown> {
        if (!this.componentReady) {
            const ids = reachableFor(this.heroMapId);
            this.componentReady = Promise.all(ids.map((id) => this.deps.store.load(id)));
        }
        return this.componentReady;
    }

    exit(): void {
        this.active = false;
    }

    // ── geometry ─────────────────────────────────────────────────────────────

    /**
     * How many of a cavern's 64 rows the chart has any business drawing.
     *
     * The rows are a ring — a cavern is a cylinder — so all 64 of them are real
     * whether or not anything is in them, and the map used to fit all 64 whatever
     * that cost. In a boss arena most of them are the solid body of the rock the
     * arena is cut into, drawn as near-black, which held every boss map at 5x: a
     * third under the width fit, to draw two thirds of nothing.
     *
     * Two things end a chart, and the deeper of them wins. The first is a row
     * holding a tile that is neither void nor rock. The second is a standing row,
     * and it carries three more rows than it counts: the hero's box is three rows
     * tall (`heroBoxFree`, geometry.ts:69) and the floor he stands on is the row
     * after his feet, so a cell at row R is standing on row R + 3 — cut that off
     * and mp1d and mp2d drew their arenas with the ground the hero is stood on
     * missing off the bottom, which is the one tile the chart cannot do without.
     *
     * A standing row is not counted when its support comes round the ring instead:
     * R + 3 past the last row is row 0's rock reached by wrapping, which is mp4d's
     * row 61 — 73 cells with forty rows of void above their heads, and an island in
     * the graph, with no route into it from the arena. Counting those is what held
     * the arenas at 5x while the width fit allowed 9x.
     */
    chartedRows(mapId: number): number {
        const cached = this.charted.get(mapId);
        if (cached !== undefined) return cached;
        const grid = this.deps.store.gridOf(mapId);
        // Nothing measured yet: chart the whole ring, which is what this did before.
        if (!grid) return NAV_MAP_HEIGHT;
        const classifier = NavTileClassifier.forMap(mapId);
        const graph = this.deps.store.get(mapId);

        let art = 0;
        for (let row = 0; row < NAV_MAP_HEIGHT; row++) {
            for (let col = 0; col < grid.mapWidth; col++) {
                const flags = classifier.classify(grid.tiles[row * grid.mapWidth + col] ?? 0);
                if ((flags & TRIMMED) === 0) { art = row + 1; break; }
            }
        }

        let standing = 0;
        for (const node of graph?.nodes ?? []) {
            if (node.row + HERO_BOX_ROWS >= NAV_MAP_HEIGHT) continue;
            standing = Math.max(standing, node.row + 1 + HERO_BOX_ROWS);
        }

        const charted = Math.max(art, standing, 1);
        this.charted.set(mapId, charted);
        return charted;
    }

    /** Integer scale that fits this map's chart in the map area. */
    scaleFor(mapId: number): number {
        const width = NAV_MAP_BY_ID.get(mapId)?.mapWidth ?? 1;
        const s = Math.floor(Math.min(VIEW_W / width, AREA_H / this.chartedRows(mapId)));
        return Math.max(1, Math.min(MAX_SCALE, s));
    }

    /** Top-left canvas pixel of the scaled map. */
    originFor(mapId: number): { ox: number; oy: number; scale: number } {
        const scale = this.scaleFor(mapId);
        const width = NAV_MAP_BY_ID.get(mapId)?.mapWidth ?? 1;
        const ox = Math.round((VIEW_W - width * scale) / 2);
        const rows = this.chartedRows(mapId);
        const oy = AREA_TOP + Math.round((AREA_H - rows * scale) / 2);
        return { ox, oy, scale };
    }

    /** Map cell under a canvas pixel, or null when the click missed the chart. */
    tileFromCanvas(x: number, y: number): { col: number; row: number } | null {
        const { ox, oy, scale } = this.originFor(this.displayMapId);
        if (x < ox || y < oy) return null;
        const col = Math.floor((x - ox) / scale);
        const row = Math.floor((y - oy) / scale);
        const width = NAV_MAP_BY_ID.get(this.displayMapId)?.mapWidth ?? 0;
        if (row < 0 || row >= this.chartedRows(this.displayMapId) || col < 0 || col >= width) return null;
        return { col, row };
    }

    // ── input ─────────────────────────────────────────────────────────────────

    /**
     * A canvas-space pointer event.
     *
     * The caller maps client pixels to canvas pixels, because the layout can be
     * CSS-scaled on touch devices (input/touch-input.ts:277-352).
     */
    handlePointer(canvasX: number, canvasY: number, kind: 'down' | 'move'): void {
        if (!this.active) return;
        if (kind === 'move') {
            const t = this.tileFromCanvas(canvasX, canvasY);
            if (t) { this.cursorCol = t.col; this.cursorRow = t.row; }
            return;
        }
        // A click in the map area picks a destination.
        if (canvasY < STRIP_TOP + STRIP_H) { this.clickStrip(canvasX, canvasY); return; }
        const t = this.tileFromCanvas(canvasX, canvasY);
        if (!t) return;
        void this.choose(t.col, t.row);
    }

    /** A click outside the map dismisses, matching the rest of the UI. */
    handleClickOutside(): void {
        if (this.active) this.deps.onExit();
    }

    handleKey(code: string, ctrl: boolean, shift: boolean, repeat: boolean): boolean {
        if (!this.active) return false;
        const width = NAV_MAP_BY_ID.get(this.displayMapId)?.mapWidth ?? 1;
        // The chart is trimmed, so the ring it shows is shorter than the cavern's:
        // the cursor wraps within what is on the map, and cannot walk off it.
        const rows = this.chartedRows(this.displayMapId);
        switch (code) {
            // Every arrow moves the destination point; the map strip is Tab's.
            case 'ArrowLeft':
                this.cursorCol = (this.cursorCol - 1 + width) % width;
                return true;
            case 'ArrowRight':
                this.cursorCol = (this.cursorCol + 1) % width;
                return true;
            case 'ArrowUp':
                this.cursorRow = (this.cursorRow - 1 + rows) % rows;
                return true;
            case 'ArrowDown':
                this.cursorRow = (this.cursorRow + 1) % rows;
                return true;
            // Tab steps the map strip forwards and Shift+Tab back through it. The
            // shift guard has to sit on Tab itself: the keydown reports both keys
            // at once, so testing `shift` only on PageUp left Shift+Tab stepping
            // forwards like a bare Tab.
            case 'Tab':
                if (!repeat) this.stepStrip(shift ? -1 : 1);
                return true;
            case 'PageDown':
                if (!repeat) this.stepStrip(1);
                return true;
            case 'PageUp':
                if (!repeat) this.stepStrip(-1);
                return true;
            case 'Enter':
            case ' ':
                if (!repeat) void this.choose(this.cursorCol, this.cursorRow);
                return true;
            case 'Escape':
                if (!repeat) this.deps.onExit();
                return true;
            default:
                break;
        }
        void ctrl;
        return false;
    }

    // ── choosing a destination ───────────────────────────────────────────────

    /**
     * Compute a route to a cell and, if there is one, close the screen.
     *
     * The cell is snapped to the nearest standing position, so a click on the
     * wall beside a ledge still means "there".
     *
     * Async because a route may leave the cavern: the destination is often only
     * reachable through a door into a map whose MDT the game has not downloaded,
     * and searching before that arrives reports "no route" for a journey that
     * exists. See {@link ensureComponent}.
     */
    async choose(col: number, row: number): Promise<void> {
        if (this.loading) return;
        const hero = this.deps.heroPosition();
        if (!hero) { this.fail(this.deps.text('map.noMap')); return; }
        const graph = this.deps.store.get(this.displayMapId);
        if (!graph) { this.fail(this.deps.text('map.noMap')); return; }

        const target = this.snapToNode(col, row);
        if (target < 0) { this.fail(this.deps.text('map.noPath')); return; }

        // Every map this route could use, not just the one on screen.
        await this.ensureComponent();
        // A browse during the wait can have changed which map is on screen, and the
        // node snapped above belongs to the map that was showing when it was taken.
        const onScreen = this.deps.store.get(this.displayMapId);
        if (!onScreen || this.displayMapId !== graph.mapId) {
            this.fail(this.deps.text('map.noMap'));
            return;
        }

        const node = onScreen.nodes[target]!;
        const from = { mapId: hero.mapId, col: hero.col, row: hero.row };
        const to = { mapId: this.displayMapId, col: node.col, row: node.row };
        const caps = this.deps.capabilities();

        // Four rungs, and the order is what makes the screen's answer the route the
        // player asked for rather than merely the shortest one. Shoes cost the hero
        // nothing — he changes them between steps, so a route that needs them is
        // never refused — but the route this feature exists to produce is one that
        // needs nothing at all, so a route with no accessory on it is built first and
        // the shoe route is the last thing offered.
        //
        // mp10 is the case that fixes the order. From (61,7) to the town door at
        // (128,33) there are two answers: the bare one, 752 points and cost 1030,
        // which crosses to mp21 for the key at (99,41), comes back, spends it on the
        // locked door at (26,16) and leaves the boss arena at (141,33); and the shoe
        // one, 121 points and cost 167, a Feruza four-tile jump at (155,37) over the
        // Silkarn slope, which is the corridor's only other way in. Asked with the
        // shoes rung first the screen offered the 121, and the bare route was never
        // built at all.

        // Every search below is told which doors stand open, not just which keys are
        // in the pocket. A key is spent once and its door is open for good after
        // that, so a hero who has been through a locked door once must still be able
        // to plan a route back through it — and with the key gone from the floor there
        // is nothing left to fetch. `doorOpen` already answered this to draw the door
        // on the chart; the search asks it too.
        const doors = this.deps.doorOpen
            ? { doorOpen: this.deps.doorOpen }
            : {};

        // Fetching a key on the way goes with every rung below the first, because a
        // journey can be short of a key *and* of shoes at once. mp80's west gallery
        // is exactly that: Silkarn shoes to climb the ramp at columns 82..86, and the
        // ordinary key for the door at (57,16). When each rung granted only its own
        // axis, all five answered NULL for it and the screen said `map.unreachable`
        // for a route of 384 hops. Rung 2 still runs on its own first, so a journey
        // the keys alone cover is never sent in shoes — that order is what
        // `asks for the keys before it asks for shoes` pins down — and every plan
        // carries `keyPresent` because the search under it did.
        const keyFetch = {
            collectKeys: true,
            ...(this.deps.keyPresent ? { keyPresent: this.deps.keyPresent } : {}),
        };

        // 1. What he has: the keys in his pocket, the doors as they stand, and the
        //    accessory he is wearing.
        const held = findRoute({
            store: this.deps.store, caps, start: from, goal: to, ...doors,
        });
        if (held) return this.accept(held, { ...doors });

        // 2. Fetching the keys on the way. Deliberately *not* bounded by cavern
        //    level: the game's one Lion-Head key is on level 8 and its one Lion-Head
        //    door on level 6, so a same-level rule would make that door unopenable
        //    by any route at all.
        const collected = findRoute({
            store: this.deps.store, caps, start: from, goal: to,
            ...keyFetch,
            ...doors,
        });
        if (collected) {
            return this.accept(collected, { ...keyFetch, ...doors });
        }

        // 3. Shoes. A pair is an item lying in the cavern, so the honest answer is to
        //    walk to one and pick it up — the hero may wear whichever pair he is
        //    carrying, or none, and changing costs nothing, so `equipment` is the plan:
        //    *collect these here, put them on here, take them off again*.
        const shod = findRoute({
            store: this.deps.store, caps, start: from, goal: to, collectAccessories: true,
            ...(this.deps.shoePresent ? { shoePresent: this.deps.shoePresent } : {}),
            ...keyFetch,
            ...doors,
        });
        if (shod) {
            const shoes = this.deps.shoePresent ? { shoePresent: this.deps.shoePresent } : {};
            return this.accept(shod, {
                collectAccessories: true, ...shoes, ...keyFetch, ...doors,
            });
        }

        // 3b. No pair within reach — but the inventory is not per cavern. A pair picked
        //     up on some other level is still in it, so the shoes rung may also mean
        //     "he is wearing some already", and there is nothing to walk to. This is
        //     what answers for mp10's town door: the Silkarn pair is a level away, and
        //     the slope into the row-33 corridor is a four-tile Feruza jump.
        const worn = findRoute({
            store: this.deps.store, caps, start: from, goal: to,
            planAccessories: true, ...keyFetch, ...doors,
        });
        if (worn) return this.accept(worn, { planAccessories: true, ...keyFetch, ...doors });

        // 4. Neither. As if he were carrying every key in the game and wearing every
        //    pair in it: that is the shape of the journey, and the locked doors on it
        //    are how many keys it needs. Only the message is left to read off it. It
        //    must take the shoes too — `unlimitedKeys` only seeds the key counters, so
        //    without them the ramp at mp80 (82..86) refuses the search outright and
        //    the journey's shape is never drawn.
        const open = findRoute({
            store: this.deps.store, caps, start: from, goal: to,
            unlimitedKeys: true, planAccessories: true, ...doors,
        });
        if (!open) { this.fail(this.deps.text('map.unreachable')); return; }

        // Reachable, but the keys are not on this level to be had.
        const needed = open.lockedDoors.ordinary + open.lockedDoors.lion;
        this.fail(this.deps.text(needed === 1 ? 'map.needsOneKey' : 'map.needsKeys'));
    }

    /** Take a route and close the screen. */
    private accept(route: NavRoute, plan: NavRoutePlan = {}): void {
        this.deps.soundManager?.playSfx?.(12);
        this.active = false;
        this.deps.onPick(route, plan);
    }

    /** Nearest standing position to a cell, searched outward. -1 if none nearby. */
    snapToNode(col: number, row: number): number {
        const graph = this.deps.store.get(this.displayMapId);
        if (!graph) return -1;
        const width = graph.mapWidth;
        for (let r = 0; r <= SNAP_RADIUS; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    // Only the ring at this radius, so nearer cells win.
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const node = graph.groundOf[
                        (((row + dy) % NAV_MAP_HEIGHT) + NAV_MAP_HEIGHT) % NAV_MAP_HEIGHT * width
                        + (((col + dx) % width) + width) % width
                    ]!;
                    if (node >= 0) return node;
                }
            }
        }
        return -1;
    }

    private fail(message: string): void {
        this.message = message;
        this.messageUntil = 2000;
        this.deps.soundManager?.playSfx?.(22);
    }

    private clearMessage(): void {
        this.message = '';
        this.messageUntil = 0;
    }

    // ── map strip ─────────────────────────────────────────────────────────────

    /** Maps the player may browse: everything reachable without a town. */
    private refreshStrip(heroMapId: number): void {
        this.maps.length = 0;
        for (const id of reachableFor(heroMapId)) this.maps.push(id);
        if (!this.maps.includes(this.displayMapId)) this.displayMapId = heroMapId;
    }

    private stepStrip(delta: number): void {
        if (this.maps.length === 0) return;
        this.stripIndex = (this.stripIndex + delta + this.maps.length) % this.maps.length;
        this.showMap(this.maps[this.stripIndex]!);
    }

    private clickStrip(canvasX: number, canvasY: number): void {
        if (this.maps.length === 0) return;
        const top = STRIP_TOP;
        if (canvasY < top || canvasY >= top + STRIP_H) return;
        const slot = VIEW_W / this.maps.length;
        const index = Math.floor(canvasX / slot);
        if (index < 0 || index >= this.maps.length) return;
        this.stripIndex = index;
        this.showMap(this.maps[index]!);
    }

    private showMap(mapId: number): void {
        this.displayMapId = mapId;
        this.clearMessage();
        // The next chart may be narrower and shorter than the cell the cursor is
        // on — a boss arena is a third of the width and a fifth of the height — and
        // a cursor outside its chart is a destination the player cannot see.
        const width = NAV_MAP_BY_ID.get(mapId)?.mapWidth ?? 1;
        this.cursorCol = Math.min(this.cursorCol, width - 1);
        this.cursorRow = Math.min(this.cursorRow, this.chartedRows(mapId) - 1);
        void this.ensureMap(mapId);
    }

    private async ensureMap(mapId: number): Promise<void> {
        if (this.deps.store.get(mapId)) return;
        this.loading = true;
        await this.deps.store.load(mapId);
        this.loading = false;
    }

    // ── raster ────────────────────────────────────────────────────────────────

    /**
     * A cached offscreen canvas holding the whole cavern at its display scale.
     *
     * Built asynchronously when the cavern's tile sheets are supplied: a sheet is
     * an image, and a screen that draws synchronously cannot wait for one. The
     * first frame or two of a newly opened map has no raster and draws the cursor
     * alone; the image is cached by the loader, so it is quick.
     */
    private rasterFor(mapId: number): HTMLCanvasElement | null {
        const scale = this.scaleFor(mapId);
        const key = `${mapId}@${scale}`;
        const hit = this.rasters.get(key);
        if (hit) return hit;

        if (this.deps.tileSheets && !this.pendingRasters.has(key)) {
            this.pendingRasters.add(key);
            void this.buildRaster(mapId, key, scale);
        } else if (!this.deps.tileSheets) {
            const grid = this.deps.store.gridOf(mapId);
            if (!grid) return null;
            const built = this.rasterize(mapId, grid, scale, null);
            this.rememberRaster(key, built);
            return built;
        }
        return null;
    }

    private async buildRaster(mapId: number, key: string, scale: number): Promise<void> {
        try {
            const sheets = await this.deps.tileSheets!(mapId);
            const grid = this.deps.store.gridOf(mapId);
            if (sheets && grid) this.rememberRaster(key, this.rasterize(mapId, grid, scale, sheets));
        } catch {
            // A missing sheet leaves the map without a raster, not broken.
        } finally {
            this.pendingRasters.delete(key);
        }
    }

    private rememberRaster(key: string, canvas: HTMLCanvasElement): void {
        this.rasters.set(key, canvas);
        this.rasterOrder.push(key);
        while (this.rasterOrder.length > LRU_RASTERS) {
            const drop = this.rasterOrder.shift()!;
            this.rasters.delete(drop);
        }
    }

    /**
     * Paint the cavern at `scale`, from its own tiles, over its charted rows.
     *
     * `drawStaticTile` (render/dungeon.ts:210) is the reference: tile id 0 is
     * black, ids 1..n are frames of the cavern sheet, and ids 0x40.. are frames of
     * the platform sheet. Anything else has no art and falls back to the class
     * colour, which is all this function knew how to do before.
     *
     * The raster stops at the last charted row rather than running the full ring:
     * the rows below are rock and void, and a boss cavern at 12x is a canvas of
     * 62,400 near-black pixels that would be drawn and thrown away every frame.
     */
    private rasterize(
        mapId: number,
        grid: NavTileGrid,
        scale: number,
        sheets: MapTileSheets | null,
    ): HTMLCanvasElement {
        const classifier = NavTileClassifier.forMap(mapId);
        const rows = this.chartedRows(mapId);
        const canvas = document.createElement('canvas');
        canvas.width = grid.mapWidth * scale;
        canvas.height = rows * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        ctx.imageSmoothingEnabled = false;

        const tiles = sheets?.tiles ?? null;
        const tileCols = tiles ? Math.floor(tiles.width / MAP_TILE_PX) : 0;
        const tileCount = tiles ? tileCols * Math.floor(tiles.height / MAP_TILE_PX) : 0;
        const platforms = sheets?.platforms ?? null;
        const platCols = platforms ? Math.floor(platforms.width / MAP_TILE_PX) : 0;
        const platCount = platforms ? platCols * Math.floor(platforms.height / MAP_TILE_PX) : 0;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < grid.mapWidth; col++) {
                const id = grid.tiles[row * grid.mapWidth + col]!;
                const x = col * scale;
                const y = row * scale;
                let drawn = false;
                if (id === 0) {
                    ctx.fillStyle = COL.empty;
                    ctx.fillRect(x, y, scale, scale);
                    drawn = true;
                } else if (tiles && id >= 1 && id <= tileCount) {
                    drawSheetFrame(ctx, tiles, id - 1, MAP_TILE_PX, MAP_TILE_PX,
                        tileCols, x, y, scale, scale);
                    drawn = true;
                } else if (platforms && id >= 0x40 && id - 0x40 < platCount) {
                    drawSheetFrame(ctx, platforms, id - 0x40, MAP_TILE_PX, MAP_TILE_PX,
                        platCols, x, y, scale, scale);
                    drawn = true;
                }
                // Anything else has no art in the sheet — one map's tile 20 runs
                // past its own — and falls through to the class colour below, which
                // is all this function could do before.
                if (drawn) continue;
                const flags = classifier.classify(id);
                ctx.fillStyle = colourFor(flags);
                ctx.fillRect(x, y, scale, scale);
            }
        }
        // Rope runs read better with a highlight along their length.
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < grid.mapWidth; col++) {
                if (!(classifier.classify(grid.tiles[row * grid.mapWidth + col]!) & 2 /* ROPE */)) continue;
                ctx.fillRect(col * scale, row * scale, scale, Math.max(1, scale >> 1));
            }
        }
        return canvas;
    }

    // ── drawing ───────────────────────────────────────────────────────────────

    draw(now: number): void {
        if (!this.active) return;
        const { ctx } = this.deps;
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, VIEW_W - 8, VIEW_H - 8);

        this.drawTitle(ctx);
        this.drawStrip(ctx);
        this.drawMap(ctx);
        // Doors and the cursor are placed by map row, and a cavern's ring reaches
        // past the chart: mp4d's walkable ring at row 61 draws on a chart 62 rows
        // deep, while a door on the row above the arena's top wraps to row 63. Clip
        // to what the chart actually shows, or a marker lands on the status line.
        const { oy, scale } = this.originFor(this.displayMapId);
        const chartBottom = oy + this.chartedRows(this.displayMapId) * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, oy, VIEW_W, chartBottom - oy);
        ctx.clip();
        this.drawMarkers(ctx);
        this.drawCursor(ctx);
        ctx.restore();
        this.drawStatus(ctx);
        this.drawHint(ctx, now);
        ctx.restore();
    }

    private drawTitle(ctx: CanvasRenderingContext2D): void {
        const name = NAV_MAP_BY_ID.get(this.displayMapId);
        ctx.fillStyle = '#0ee';
        ctx.font = FONT_TITLE;
        ctx.textBaseline = 'top';
        ctx.fillText(this.deps.text('map.title'), 16, 10);
        ctx.fillStyle = '#eee';
        ctx.font = FONT_SMALL;
        ctx.textAlign = 'right';
        ctx.fillText(name ? String(name.nameKey).toUpperCase() : '', VIEW_W - 16, 14);
        ctx.textAlign = 'left';
    }

    private drawStrip(ctx: CanvasRenderingContext2D): void {
        if (this.maps.length === 0) return;
        const slot = VIEW_W / this.maps.length;
        const top = STRIP_TOP;
        ctx.font = FONT_SMALL;
        ctx.textBaseline = 'top';
        for (let i = 0; i < this.maps.length; i++) {
            const id = this.maps[i]!;
            const name = NAV_MAP_BY_ID.get(id);
            const x = i * slot;
            const isCurrent = i === this.stripIndex;
            const isHero = this.deps.heroPosition()?.mapId === id;
            ctx.fillStyle = isCurrent ? 'rgba(0,238,238,0.18)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(x, top, slot, STRIP_H);
            if (isCurrent) {
                ctx.strokeStyle = '#0ee';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, top + 1, slot - 2, STRIP_H - 2);
            }
            ctx.fillStyle = isHero ? '#ff0' : '#ccc';
            ctx.textAlign = 'center';
            // Short labels, and clipped to the slot. A full "MP80" is five
            // characters, which does not fit once a component reaches fourteen
            // maps — the tabs ran together into one unreadable line.
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 2, top, slot - 4, STRIP_H);
            ctx.clip();
            ctx.fillText(shortName(name ? String(name.nameKey) : '?'), x + slot / 2, top + 7);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }

    private drawMap(ctx: CanvasRenderingContext2D): void {
        const raster = this.rasterFor(this.displayMapId);
        const { ox, oy, scale } = this.originFor(this.displayMapId);
        if (raster) ctx.drawImage(raster, ox, oy);
        else {
            // Data still loading, or unreadable: say so rather than draw nothing.
            // A raster also waits on the cavern's tile sheet, which is an image.
            const waiting = this.loading || this.pendingRasters.size > 0;
            ctx.fillStyle = '#444';
            ctx.font = FONT_SMALL;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.deps.text(waiting ? 'map.loading' : 'map.noMap'), VIEW_W / 2, AREA_TOP + AREA_H / 2);
            ctx.textAlign = 'left';
        }
        void scale;
    }

    /** Doors, and the hero. Nothing else — no route. */
    private drawMarkers(ctx: CanvasRenderingContext2D): void {
        const { ox, oy, scale } = this.originFor(this.displayMapId);
        const s = Math.max(1, scale);
        const sheet = this.ensureDoorSheet();
        if (sheet) {
            const cols = Math.floor(sheet.width / MAP_TILE_PX);
            for (const index of NAV_PORTALS_BY_MAP[this.displayMapId] ?? []) {
                const p = PORTALS[index]!;
                this.drawDoor(ctx, sheet, cols, p, ox, oy, scale);
            }
        }

        const hero = this.deps.heroPosition();
        if (!hero || hero.mapId !== this.displayMapId) return;
        const hx = ox + hero.col * scale;
        const hy = oy + hero.row * scale;
        // A small bright wedge, pointing up, so it reads as "you are here".
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.moveTo(hx + s / 2, hy + s * 0.15);
        ctx.lineTo(hx + s * 0.85, hy + s * 0.85);
        ctx.lineTo(hx + s * 0.15, hy + s * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /**
     * Blit one door at display scale, exactly as the cavern view stamps it.
     *
     * The composite is 5x4 tiles and hangs one column to the left of the hero's
     * standing cell, with the trigger tile at the door record's own cell — so the
     * portal's `fromX`/`fromY` is the cell the hero stands on, and the frame starts
     * one column left and one row above it.
     */
    private drawDoor(
        ctx: CanvasRenderingContext2D,
        sheet: HTMLImageElement,
        cols: number,
        p: (typeof PORTALS)[number],
        ox: number,
        oy: number,
        scale: number,
    ): void {
        const open = this.deps.doorOpen?.(p.mapId, p.x0, p.y0) ?? (p.key === 0);
        const tiles = open ? OPENED_DOOR_TILES : CLOSED_DOOR_TILES;
        const left = p.fromX - 1;
        const top = p.fromY - 1;
        // A cavern is a cylinder: 64 rows in a ring, and columns that wrap at the
        // map width. A door on either seam is still a door.
        const width = NAV_MAP_BY_ID.get(this.displayMapId)?.mapWidth ?? 1;

        for (let row = 0; row < DOOR_H; row++) {
            const mapRow = (((top + row) % NAV_MAP_HEIGHT) + NAV_MAP_HEIGHT) % NAV_MAP_HEIGHT;
            for (let col = 0; col < DOOR_W; col++) {
                const i = row * DOOR_W + col;
                const mapCol = (((left + col) % width) + width) % width;
                const x = ox + mapCol * scale;
                const y = oy + mapRow * scale;
                // The roka colour sits in the middle of the lintel, and is the one
                // tile of the composite that is not frame or doorway.
                if (i === ROKA_COLOUR_INDEX) {
                    ctx.fillStyle = rokaColour(p.color);
                    ctx.fillRect(x, y, scale, scale);
                    continue;
                }
                const id = tiles[i]!;
                // Tile 0 is the black void in front of an open doorway, and the
                // map behind it is whatever the cavern drew.
                if (id === 0) {
                    ctx.fillStyle = COL.empty;
                    ctx.fillRect(x, y, scale, scale);
                    continue;
                }
                drawSheetFrame(ctx, sheet, id - DCHR_BASE_TILE, MAP_TILE_PX, MAP_TILE_PX,
                    cols, x, y, scale, scale);
            }
        }
    }

    /**
     * The shared dchr sheet, fetched on first use and kept.
     *
     * `tileSheets` already resolves it — it is the platform band of the same sheet
     * the raster cuts its tiles from — and `loadImageOnce` caches by URL, so this
     * is one promise shared with the raster rather than a second download. Returns
     * null for the frame or two before it lands, which is also what a screen
     * without sheets draws.
     */
    private ensureDoorSheet(): HTMLImageElement | null {
        if (this.doorSheet || this.doorSheetWanted || !this.deps.tileSheets) return this.doorSheet;
        this.doorSheetWanted = true;
        void this.deps.tileSheets(this.displayMapId)
            .then((sheets) => { this.doorSheet = sheets?.platforms ?? null; })
            .catch(() => { /* a missing sheet leaves the doors off, not the screen */ });
        return null;
    }

    private drawCursor(ctx: CanvasRenderingContext2D): void {
        const { ox, oy, scale } = this.originFor(this.displayMapId);
        const s = Math.max(2, scale);
        const x = ox + this.cursorCol * scale;
        const y = oy + this.cursorRow * scale;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(1, Math.floor(s / 3));
        ctx.strokeRect(x - ctx.lineWidth, y - ctx.lineWidth, s + ctx.lineWidth * 2, s + ctx.lineWidth * 2);
    }

    /**
     * Where the hero stands, and where the cursor is pointing.
     *
     * Both ends of the route as numbers, because the cavern is a cylinder of 64
     * rows and up to 320 columns wrapping at both seams: the marker and the cursor
     * give direction, not position, and the player cannot read "left" off a map
     * that wraps without knowing the column.
     *
     * The two ends are coloured as the marks that locate them — yellow for the
     * hero wedge, cyan for the cursor — and sit at opposite ends of the line so
     * they never collide on a wide map, where the coordinate labels are longest.
     */
    private drawStatus(ctx: CanvasRenderingContext2D): void {
        ctx.font = FONT_STATUS;
        ctx.textBaseline = 'top';
        const hero = this.deps.heroPosition();
        if (hero) {
            // A cavern is only worth naming when it is not the one on screen: bare
            // numbers from another map would be read as this map's.
            const heroMap = NAV_MAP_BY_ID.get(hero.mapId);
            const away = hero.mapId === this.displayMapId || !heroMap
                ? ''
                : ` ${shortName(String(heroMap.nameKey))}`;
            ctx.fillStyle = '#ff0';
            ctx.fillText(`${this.deps.text('map.hero')} ${hero.col},${hero.row}${away}`, 16, STATUS_TOP);
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0ee';
        ctx.fillText(
            `${this.deps.text('map.dest')} ${this.cursorCol},${this.cursorRow}`,
            VIEW_W - 16, STATUS_TOP,
        );
        ctx.textAlign = 'left';
    }

    private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
        ctx.font = FONT_HINT;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#fff';
        const text = now < this.messageUntil && this.message
            ? this.message
            : this.deps.text('map.hints');
        ctx.fillText(text, 16, HINT_TOP);
    }
}

/**
 * A door's roka colour as a flat square.
 *
 * The cavern view stamps an orb sprite from dchr.png at the centre of the door
 * frame, but the map is drawn at a fraction of that size: the orb arrives as a
 * couple of pixels of mud sitting on top of the frame, reading as noise rather
 * than as a door. The colour is the only part of it that carries meaning — it is
 * what tells one door from another at a glance — so the map draws just that.
 *
 * The five entries are the colours the generated door table actually uses; white
 * stands in for anything else rather than silently borrowing a neighbour's.
 */
const ROKA_COLOURS: readonly string[] =
    ['#000000', '#ff0000', '#0000ff', '#00ff00', '#ff00ff'];

export function rokaColour(color: number): string {
    return ROKA_COLOURS[color] ?? '#ffffff';
}

/** Reachable maps for a hero standing on `mapId` — the component's map strip. */
function reachableFor(mapId: number): readonly number[] {
    return NAV_REACHABLE[mapId] ?? [mapId];
}

/**
 * A tab label short enough to fit: `mp80` -> `80`, `mp5d` -> `5D`.
 *
 * The full name is redundant on every tab because only one is meaningful at a
 * time, and the title bar already shows the current map in full.
 */
export function shortName(nameKey: string): string {
    return nameKey.replace(/^mp/i, '').toUpperCase();
}

/** Tile class to flat colour, matching the key in the plan. */
function colourFor(flags: number): string {
    if (flags & 2 /* ROPE */) return COL.rope;
    if (flags & (4 | 8) /* SLOPE_LEFT | SLOPE_RIGHT */) return COL.slope;
    if (flags & 16 /* AGGRESSIVE */) return COL.aggressive;
    if (flags & 1024 /* PLATFORM */) return COL.platform;
    if (flags & 1 /* EMPTY */) return COL.empty;
    if (flags & 256 /* BLOCK_HEAD */) return COL.solid;
    return COL.floor;
}
