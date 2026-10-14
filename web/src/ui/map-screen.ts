/**
 * map-screen.ts — the full-screen cavern map, for picking a destination.
 *
 * The screen exists for exactly one purpose: choosing where to go. It draws no
 * route — revealing the path before the player has committed to a destination
 * would spoil the cavern — and confirming a point with Enter closes it straight
 * back to the inventory, whose usage message confirms the Thread was spent. The
 * route itself appears only once the player leaves the inventory; see
 * render/path-overlay.ts.
 *
 * Aiming and committing are separate. A click puts the target rectangle on a
 * cell, exactly as an arrow key does, and does nothing else; Enter — the key the
 * hint line names — is what spends the Thread.
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
 * The map is the cavern at the largest scale that fits its chart — the rows of
 * it that have anything on them — inside the border rather than edge to edge:
 * `S = min(660/W, 336/charted)`. The scale is fractional, because the chart is
 * drawn as one scaled blit of a native-resolution offscreen canvas: the
 * browser's filter sees the whole picture, so adjacent tiles cannot show a
 * seam and the fit can be exact. Drawing tiles individually at a fractional
 * scale would give each one its own rounded edges and leave hairlines between
 * neighbours, which is why the scale used to be floored to an integer — at the
 * cost of a band of unused space along the axis that was rounded down. A cavern
 * 73 tiles wide or less is not asked to fit all 64 of its rows: a boss arena is
 * two thirds solid rock and fills the chart with only the rows that hold
 * anything.
 */

import { NAV_MAP_BY_ID, NAV_REACHABLE } from '../data/nav/nav-maps.js';
import { NAV_MAP_HEIGHT } from '../data/nav/index.js';
import { PORTALS, NAV_PORTALS_BY_MAP } from '../data/nav/nav-portals.js';
import { NAV_PLATFORMS } from '../data/nav/nav-platforms.js';
import { NavTileClassifier } from '../engine/nav/attributes.js';
import { PLATFORM_WIDTH } from '../engine/nav/platforms.js';
import { wrapCol } from '../engine/nav/geometry.js';
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
 * The strip is drawn first and the map second, so a chart that centred its top
 * edge on the strip's top would paint over the tabs.
 */
const AREA_TOP = STRIP_TOP + STRIP_H;   // 54
const AREA_H = 336;                     // 54..390, clear of the status line
const STATUS_TOP = 394;
const HINT_TOP = 414;
/**
 * How far inside the canvas edge the border sits, and what is left to draw in.
 *
 * `draw` strokes a 2px frame 4px in from the edge, so the map has to fit 660px
 * and not 672 — the difference is what makes a map that lands exactly on the
 * canvas edge (mp20 is 224 columns) run over the frame.
 */
const BORDER_INSET = 6;
const MAP_W = VIEW_W - 2 * BORDER_INSET;   // 660
/**
 * How long a refusal stays on the hint line.
 *
 * Long enough to read a route of words, short enough that the controls are back
 * before the player looks up from the map.
 */
const REFUSAL_MS = 2000;
const SNAP_RADIUS = 2;       // tiles searched outward for a valid standing spot
/**
 * Rasters kept. One per map, at native sheet resolution — see {@link rasterize}
 * — so a wide cavern is tens of megabytes. Two is enough to cover a tab step in
 * each direction without keeping a whole component's worth of pixels alive.
 */
const LRU_RASTERS = 2;

/** A cavern tile is `TILE_SIZE` in the game's sheets — 24x24. */
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
 * Rows of rock a boss arena's chart carries below the hero's floor.
 *
 * `art` ends a chart on the last row holding anything that is not rock or void,
 * and in four of the eight arenas that is the hero's own floor — so the arena is
 * drawn with a single row of rock under him and reads as hanging in the void.
 * The other four already reach further down on their own. See
 * {@link MapScreen.chartedRows}.
 */
const ARENA_ROCK_ROWS = 2;

/**
 * Where a cavern's chart starts on its 64-row ring.
 *
 * mp90's room is cut across the seam: rows 62 and 63 of the ring are the top of
 * its starfield and rows 0..15 are the rest of it, with 46 rows of empty ring
 * between. A chart that began at row 0 therefore drew a room two thirds of whose
 * height was void, and held the cavern at 5x to do it. Starting at row 62 joins
 * the room back into one run, which is the run the live view shows.
 *
 * Only mp90 needs it. In every other cavern the content starts at row 0, so the
 * empty rows all fall at the bottom where they cost nothing to trim.
 */
const CHART_FIRST_ROW: Readonly<Record<string, number>> = { mp90: 62 };

/**
 * Rock kept under a hero's feet, past the one floor row every chart already
 * draws, for the caverns that are not a boss arena.
 *
 * mp90's floor is two solid rows, 14 and 15, and the trim stopped on the first of
 * them — the room stood on the edge of its own chart. It is the only cavern that
 * needs this; see {@link ARENA_ROCK_ROWS} for the arenas.
 */
const CHART_ROCK_ROWS: Readonly<Record<string, number>> = { mp90: 1 };

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

/**
 * How one map lands in the chart area, at draw time.
 *
 * `scale` is pixels per tile and is fractional: the chart is one scaled blit of
 * the 1:1 raster (see {@link MapScreen.drawMap}), so the browser's filter sees
 * the whole picture and there is no seam for an integer to hide. `ox`/`oy` are
 * the map's top-left corner in canvas pixels; `w`/`h` its drawn size. `ox`/`oy`
 * are subpixel on purpose — rounding them reintroduces the off-by-a-pixel edge
 * the fractional scale exists to remove.
 */
interface MapFit {
    readonly scale: number;
    readonly ox: number;
    readonly oy: number;
    readonly w: number;
    readonly h: number;
}

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
     * `plan` says which rung of the ladder answered, so the guide that keeps
     * drawing the thread can re-plan under the same assumptions. Without it a
     * route that went to fetch a key is re-planned as though the hero were
     * already holding one, and with an empty pocket that search finds nothing
     * and the thread is dropped.
     */
    onPick: (route: NavRoute, plan: NavRoutePlan) => void;
    /**
     * Whether a key is still lying where the generated table says there was one.
     *
     * A key the player has already taken is not in the world — the engine drops
     * it from the list at dungeon init (engine/dungeon-init.ts:75). The
     * composition root answers from the save; without it the screen assumes
     * every key is still there, which is right for a fresh game.
     */
    keyPresent?: (mapId: number, col: number, row: number, kind: 0 | 1) => boolean;
    /**
     * Whether a pair of shoes is still lying where the generated table says.
     *
     * Same reason as {@link keyPresent} — the engine drops an item the player has
     * already taken from the entity list at dungeon init
     * (engine/dungeon-init.ts:75) — and the same default: with nothing to ask,
     * every pair is assumed to be there, which is right for a fresh game.
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
    /**
     * The 1:1 raster of each chart, keyed by map id.
     *
     * Built at native sheet resolution — `mapWidth * 24` by `charted * 24` — and
     * scaled down at draw time, so the fit can be fractional without the raster
     * ever being rebuilt for it. The old code baked the integer scale into the
     * raster, which meant every change of fit was a full rebuild and forced the
     * scale to be an integer at all.
     */
    private readonly rasters = new Map<number, HTMLCanvasElement>();
    private readonly rasterOrder: number[] = [];
    /** Rows each charted cavern keeps, by map. Measured once the grid is here. */
    private readonly charted = new Map<number, number>();
    private readonly pendingRasters = new Set<number>();
    /** Doors composited at 1:1, keyed by `open_colour` — see {@link doorCanvasFor}. */
    private readonly doorCanvases = new Map<string, HTMLCanvasElement>();
    private loading = false;
    private message = '';
    private messageUntil = 0;
    /**
     * The clock `draw` was last called with, in its own units (ms).
     *
     * The screen has exactly one timer — the transient refusal message — and it
     * has to be stamped from the same clock `drawHint` compares it against.
     * Recorded in `draw` rather than read from `performance` here, so the two
     * ends cannot drift apart and a test drives both with one number.
     */
    private clock = 0;
    /** The hero's map when the screen opened; the reachable set is keyed off it. */
    private heroMapId = 0;
    /**
     * Loading every cavern the route may use, once.
     *
     * The game only holds the MDT of the cavern the hero is standing in, so a
     * store that has never been asked for another map reports `null` for it — and
     * `findRoute` skips any door whose destination graph is missing. That silently
     * deleted every route that needs to leave the map, and it is not a rare shape:
     * a cavern with two chambers and no internal path between them is one door
     * away from a route, and the door's destination is a map this screen has to
     * fetch before it can be searched.
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
        const row = this.chartRowOn(snapshot.heroMapId, snapshot.heroRow);
        this.cursorRow = row < 0 ? 0 : Math.min(row, this.chartedRows(snapshot.heroMapId) - 1);
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
     * arena is cut into, drawn as near-black, which held every boss map at a
     * fraction of the width fit, to draw two thirds of nothing.
     *
     * Two things end a chart, and the deeper of them wins. The first is a row
     * holding a tile that is neither void nor rock. The second is a standing row,
     * and it carries three more rows than it counts: the hero's box is three rows
     * tall (`heroBoxFree`, geometry.ts:69) and the floor he stands on is the row
     * after his feet, so a cell at row R is standing on row R + 3 — cut that off
     * and the narrow caverns draw their arenas with the ground the hero is stood
     * on missing off the bottom, which is the one tile the chart cannot do
     * without.
     *
     * A standing row is not counted when its support comes round the ring instead:
     * R + 3 past the last row is row 0's rock reached by wrapping, which is an
     * island in the graph, with no route into it from the arena. Counting those
     * would hold the arenas at a fraction of the width fit for rows nobody can
     * reach.
     *
     * A boss arena takes {@link ARENA_ROCK_ROWS} more still. The floor the hero
     * stands on is the last row an arena like mp1d, mp2d, mp5d or mp7d has
     * anything on, so without them the arena is drawn on one row of rock with
     * nothing under it. `art` already carries the other four arenas down past
     * that, which is why the extra rows leave them alone.
     * {@link CHART_ROCK_ROWS} is the same thing for a cavern that is not an arena.
     *
     * Rows are counted from the chart's own first row, not from row 0 — see
     * {@link CHART_FIRST_ROW} — and a chart row is a position on the chart, not a
     * row of the ring. {@link ringRowOf} and {@link MapScreen.chartRowOn} are
     * the two conversions.
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
        for (let chartRow = 0; chartRow < NAV_MAP_HEIGHT; chartRow++) {
            const row = ringRowOf(mapId, chartRow);
            for (let col = 0; col < grid.mapWidth; col++) {
                const flags = classifier.classify(grid.tiles[row * grid.mapWidth + col] ?? 0);
                if ((flags & TRIMMED) === 0) { art = chartRow + 1; break; }
            }
        }

        const meta = NAV_MAP_BY_ID.get(mapId);
        const floorRows = (meta?.isBossArena ? ARENA_ROCK_ROWS : 0)
            + (CHART_ROCK_ROWS[String(meta?.nameKey)] ?? 0);
        let standing = 0;
        for (const node of graph?.nodes ?? []) {
            if (node.row + HERO_BOX_ROWS >= NAV_MAP_HEIGHT) continue;
            const chartRow = (node.row - chartFirstRow(mapId) + NAV_MAP_HEIGHT) % NAV_MAP_HEIGHT;
            standing = Math.max(standing, chartRow + 1 + HERO_BOX_ROWS + floorRows);
        }

        const charted = Math.max(art, standing, 1);
        this.charted.set(mapId, charted);
        return charted;
    }

    /**
     * Where a row of the ring falls on this cavern's chart, or -1 when the chart
     * does not reach it.
     */
    chartRowOn(mapId: number, ringRow: number): number {
        const chartRow = (ringRow - chartFirstRow(mapId) + NAV_MAP_HEIGHT) % NAV_MAP_HEIGHT;
        return chartRow < this.chartedRows(mapId) ? chartRow : -1;
    }

    /**
     * Where a map lands in the chart area.
     *
     * The scale is the largest one that fits both axes and is deliberately
     * fractional: the map is drawn as one scaled blit of the 1:1 raster (see
     * {@link drawMap}), so the browser's filter sees the whole picture and no
     * two tiles have to line up. The previous integer floor existed only because
     * the chart was drawn tile by tile — each tile rounded its own edges and a
     * fractional scale left hairlines between neighbours — and it cost a visible
     * band of unused space along whichever axis bound the fit.
     */
    private fitFor(mapId: number): MapFit {
        const width = NAV_MAP_BY_ID.get(mapId)?.mapWidth ?? 1;
        const rows = this.chartedRows(mapId);
        const scale = Math.min(MAP_W / width, AREA_H / rows);
        const w = width * scale;
        const h = rows * scale;
        return {
            scale,
            w,
            h,
            // Centred in the canvas. `w` is at most `MAP_W`, so `VIEW_W - w` is at
            // least `2 * BORDER_INSET` and the map never touches the frame.
            ox: (VIEW_W - w) / 2,
            oy: AREA_TOP + (AREA_H - h) / 2,
        };
    }

    /** Map cell under a canvas pixel, or null when the click missed the chart. */
    tileFromCanvas(x: number, y: number): { col: number; row: number } | null {
        const fit = this.fitFor(this.displayMapId);
        if (x < fit.ox || y < fit.oy) return null;
        const col = Math.floor((x - fit.ox) / fit.scale);
        const chartRow = Math.floor((y - fit.oy) / fit.scale);
        const width = NAV_MAP_BY_ID.get(this.displayMapId)?.mapWidth ?? 0;
        if (chartRow < 0 || chartRow >= this.chartedRows(this.displayMapId) || col < 0 || col >= width) return null;
        return { col, row: ringRowOf(this.displayMapId, chartRow) };
    }

    // ── input ─────────────────────────────────────────────────────────────────

    /**
     * A click on the screen, in canvas space.
     *
     * The caller maps client pixels to canvas pixels, because the layout can be
     * CSS-scaled on touch devices (input/touch-input.ts:277-352).
     *
     * A click aims, and only aims: it puts the target rectangle on the cell under
     * the pointer and leaves the screen open, exactly as an arrow key does.
     * Enter commits — and the mouse does neither.
     *
     * There is deliberately no pointer-motion path — `handleClick` is the whole
     * API, and the caller registers no `pointermove` listener for it. The target
     * is a destination, not a cursor, and one that trailed the pointer meant that
     * merely sweeping across a 320-column chart to look at it re-aimed the thread.
     */
    handleClick(canvasX: number, canvasY: number): void {
        if (!this.active) return;
        // The strip is Tab's, and a click on it browses exactly as it always did.
        if (canvasY < STRIP_TOP + STRIP_H) { this.clickStrip(canvasX, canvasY); return; }
        const t = this.tileFromCanvas(canvasX, canvasY);
        if (!t) return;
        const chartRow = this.chartRowOn(this.displayMapId, t.row);
        if (chartRow < 0) return;
        this.cursorCol = t.col;
        this.cursorRow = chartRow;
        // Whatever the last refusal said was about the cell before this one.
        this.clearMessage();
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
                if (!repeat) void this.choose(this.cursorCol, ringRowOf(this.displayMapId, this.cursorRow));
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

        // Four rungs, and the order is what makes the screen's answer the route
        // the player asked for rather than merely the shortest one. Shoes cost the
        // hero nothing — he changes them between steps, so a route that needs them
        // is never refused — but the route this feature exists to produce is one
        // that needs nothing at all, so a route with no accessory on it is built
        // first and the shoe route is the last thing offered.
        //
        // The order matters because the bare route and the shod route can be very
        // different journeys: a bare route may cross to another cavern for a key,
        // and the shoe route may be a single jump over the slope. Asked with the
        // shoes rung first the screen would offer the shorter, shoe-dependent route
        // and never build the bare one.

        // Every search below is told which doors stand open, not just which keys are
        // in the pocket. A key is spent once and its door is open for good after
        // that, so a hero who has been through a locked door once must still be able
        // to plan a route back through it — and with the key gone from the floor
        // there is nothing left to fetch.
        const doors = this.deps.doorOpen
            ? { doorOpen: this.deps.doorOpen }
            : {};

        // Fetching a key on the way goes with every rung below the first, because a
        // journey can be short of a key *and* of shoes at once. Rung 2 still runs
        // on its own first, so a journey the keys alone cover is never sent in
        // shoes, and every plan carries `keyPresent` because the search under it
        // did.
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

        // 3. Shoes. A pair is an item lying in the cavern, so the honest answer is
        //    to walk to one and pick it up — the hero may wear whichever pair he is
        //    carrying, or none, and changing costs nothing, so `equipment` is the
        //    plan: *collect these here, put them on here, take them off again*.
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

        // 3b. No pair within reach — but the inventory is not per cavern. A pair
        //     picked up on some other level is still in it, so the shoes rung may
        //     also mean "he is wearing some already", and there is nothing to walk
        //     to.
        const worn = findRoute({
            store: this.deps.store, caps, start: from, goal: to,
            planAccessories: true, ...keyFetch, ...doors,
        });
        if (worn) return this.accept(worn, { planAccessories: true, ...keyFetch, ...doors });

        // 4. Neither. As if he were carrying every key in the game and wearing every
        //    pair in it: that is the shape of the journey, and the locked doors on it
        //    are how many keys it needs. Only the message is left to read off it. It
        //    must take the shoes too — `unlimitedKeys` only seeds the key counters,
        //    so without them the slopes and four-tile jumps refuse the search
        //    outright and the journey's shape is never drawn.
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
        // A deadline on the screen's own clock, not a constant — see {@link clock}.
        this.messageUntil = this.clock + REFUSAL_MS;
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
     * A cached offscreen canvas holding the whole cavern at native sheet
     * resolution.
     *
     * Built asynchronously when the cavern's tile sheets are supplied: a sheet is
     * an image, and a screen that draws synchronously cannot wait for one. The
     * first frame or two of a newly opened map has no raster and draws the cursor
     * alone; the image is cached by the loader, so it is quick.
     *
     * The raster is not scaled by the fit. It is at 1:1 — one tile is
     * {@link MAP_TILE_PX} square — and the fit is applied at draw time, so a
     * fractional fit costs nothing to compute and never rebuilds the raster.
     */
    private rasterFor(mapId: number): HTMLCanvasElement | null {
        const hit = this.rasters.get(mapId);
        if (hit) return hit;

        if (this.deps.tileSheets && !this.pendingRasters.has(mapId)) {
            this.pendingRasters.add(mapId);
            void this.buildRaster(mapId);
        } else if (!this.deps.tileSheets) {
            const grid = this.deps.store.gridOf(mapId);
            if (!grid) return null;
            const built = this.rasterize(mapId, grid, null);
            this.rememberRaster(mapId, built);
            return built;
        }
        return null;
    }

    private async buildRaster(mapId: number): Promise<void> {
        try {
            const sheets = await this.deps.tileSheets!(mapId);
            const grid = this.deps.store.gridOf(mapId);
            if (sheets && grid) this.rememberRaster(mapId, this.rasterize(mapId, grid, sheets));
        } catch {
            // A missing sheet leaves the map without a raster, not broken.
        } finally {
            this.pendingRasters.delete(mapId);
        }
    }

    private rememberRaster(mapId: number, canvas: HTMLCanvasElement): void {
        this.rasters.set(mapId, canvas);
        this.rasterOrder.push(mapId);
        while (this.rasterOrder.length > LRU_RASTERS) {
            const drop = this.rasterOrder.shift()!;
            this.rasters.delete(drop);
        }
    }

    /**
     * Paint the cavern at native sheet resolution, over its charted rows.
     *
     * `drawStaticTile` (render/dungeon.ts:210) is the reference: tile id 0 is
     * black, ids 1..n are frames of the cavern sheet, and ids 0x40.. are frames of
     * the platform sheet. Anything else has no art and falls back to the class
     * colour.
     *
     * The raster stops at the last charted row rather than running the full ring:
     * the rows below are rock and void, and they would only be drawn and thrown
     * away. It is deliberately *not* drawn at the fitted scale — the fit is
     * fractional, and per-tile `drawImage` at a fractional scale leaves hairlines
     * between tiles because each one rounds its own edges. A single scaled blit of
     * this canvas (see {@link drawMap}) has no neighbours to line up.
     */
    private rasterize(
        mapId: number,
        grid: NavTileGrid,
        sheets: MapTileSheets | null,
    ): HTMLCanvasElement {
        const classifier = NavTileClassifier.forMap(mapId);
        const rows = this.chartedRows(mapId);
        const P = MAP_TILE_PX;
        const canvas = document.createElement('canvas');
        canvas.width = grid.mapWidth * P;
        canvas.height = rows * P;
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        ctx.imageSmoothingEnabled = false;

        const tiles = sheets?.tiles ?? null;
        const tileCols = tiles ? Math.floor(tiles.width / P) : 0;
        const tileCount = tiles ? tileCols * Math.floor(tiles.height / P) : 0;
        const platforms = sheets?.platforms ?? null;
        const platCols = platforms ? Math.floor(platforms.width / P) : 0;
        const platCount = platforms ? platCols * Math.floor(platforms.height / P) : 0;

        for (let row = 0; row < rows; row++) {
            const gridRow = ringRowOf(mapId, row);
            for (let col = 0; col < grid.mapWidth; col++) {
                const id = grid.tiles[gridRow * grid.mapWidth + col]!;
                const x = col * P;
                const y = row * P;
                let drawn = false;
                if (id === 0) {
                    ctx.fillStyle = COL.empty;
                    ctx.fillRect(x, y, P, P);
                    drawn = true;
                } else if (tiles && id >= 1 && id <= tileCount) {
                    drawSheetFrame(ctx, tiles, id - 1, P, P, tileCols, x, y, P, P);
                    drawn = true;
                } else if (platforms && id >= 0x40 && id - 0x40 < platCount) {
                    drawSheetFrame(ctx, platforms, id - 0x40, P, P, platCols, x, y, P, P);
                    drawn = true;
                }
                // Anything else has no art in the sheet — one map's tile 20 runs
                // past its own — and falls through to the class colour below.
                if (drawn) continue;
                const flags = classifier.classify(id);
                ctx.fillStyle = colourFor(flags);
                ctx.fillRect(x, y, P, P);
            }
        }
        // Platforms, where the level data says they stand. They are runtime state
        // and appear nowhere in the MDT — `render_vertical_platforms_to_proximity`
        // and its two siblings stamp them into the proximity map every frame — so
        // the chart would otherwise be a cavern with all of its machinery missing.
        //
        // The default position is the right one to draw, because it is the one the
        // cavern is entered at and the one a platform snaps back to when its map
        // is loaded again (`platform-state.ts`), so the chart is the cavern as the
        // player will meet it. Where they *travel* is a fact about the level the
        // chart does not claim: a horizontal platform has already begun to move by
        // the time the map is open, and drawing a span it is not on would be worse
        // than drawing nothing.
        this.paintPlatforms(ctx, mapId, grid.mapWidth, rows, platforms, platCols, platCount);

        return canvas;
    }

    /**
     * Every platform this cavern has, drawn where its record says it stands.
     *
     * Three tiles each, and the three families are three different triples of the
     * shared platform sheet — `0x40..0x42` vertical, `0x43..0x45` collapsing,
     * `0x46..0x48` horizontal (dungeon-vertical.ts:341-366,
     * dungeon-platforms.ts:234-243) — so the art tells them apart for free. A
     * screen without the sheet falls back to one colour: it is the sheet that
     * tells a lift from a conveyor, not the chart's own geometry.
     *
     * Rows outside the chart are left out rather than clipped: the chart is cut at
     * the last row with anything on it (see {@link chartedRows}), and a platform
     * below that is in rock nobody is ever shown.
     */
    private paintPlatforms(
        ctx: CanvasRenderingContext2D,
        mapId: number,
        mapWidth: number,
        rows: number,
        sheet: HTMLImageElement | null,
        sheetCols: number,
        sheetCount: number,
    ): void {
        const tables = NAV_PLATFORMS[mapId];
        if (!tables) return;
        const P = MAP_TILE_PX;
        const at = (left: number, ringY: number, frame0: number): void => {
            const row = (ringY - chartFirstRow(mapId) + NAV_MAP_HEIGHT) % NAV_MAP_HEIGHT;
            if (row >= rows) return;
            const x = wrapCol(left, mapWidth) * P;
            const y = row * P;
            for (let i = 0; i < PLATFORM_WIDTH; i++) {
                const dx = x + i * P;
                // A platform that would run off the right of the chart is a
                // cylinder: it wraps, exactly as the columns of the cavern itself
                // do.
                const dx2 = dx >= mapWidth * P ? dx - mapWidth * P : dx;
                const frame = frame0 + i;
                if (sheet && frame - DCHR_BASE_TILE < sheetCount) {
                    drawSheetFrame(ctx, sheet, frame - DCHR_BASE_TILE, P, P, sheetCols,
                        dx2, y, P, P);
                } else {
                    ctx.fillStyle = COL.platform;
                    ctx.fillRect(dx2, y, P, P);
                }
            }
        };
        for (const p of tables.vertical) at(p.x, p.startY, DCHR_BASE_TILE);
        for (const p of tables.collapsing) at(p.x, p.startY, DCHR_BASE_TILE + 3);
        for (const p of tables.horizontal) {
            // speed 0 is a frozen platform: a static ledge, not machinery, and the
            // model declines to move the hero on it (platforms.ts REASON_FROZEN).
            if (p.speed === 0) continue;
            at(p.startX, p.y, DCHR_BASE_TILE + 6);
        }
    }

    // ── drawing ───────────────────────────────────────────────────────────────

    draw(now: number): void {
        if (!this.active) return;
        this.clock = now;
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
        // past the chart: a door on the row above the arena's top wraps to the
        // bottom of the ring, and the marker would land on the status line. Clip
        // to what the chart actually shows.
        const fit = this.fitFor(this.displayMapId);
        const chartBottom = fit.oy + fit.h;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, fit.oy, VIEW_W, chartBottom - fit.oy);
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
        const cavernKey = name ? `dungeon.names.${String(name.nameKey)}` : '';
        ctx.fillText(cavernKey ? this.deps.text(cavernKey) : '', VIEW_W - 16, 14);
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
        const fit = this.fitFor(this.displayMapId);
        if (raster) {
            // One scaled blit of the whole chart. The browser's filter sees the
            // whole picture, so a fractional scale does not show the hairlines
            // that per-tile draws at the same scale would: two tiles drawn
            // individually each round their own edges, and the rounding does not
            // line up.
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(raster, fit.ox, fit.oy, fit.w, fit.h);
            ctx.imageSmoothingEnabled = false;
        } else {
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
    }

    /** Doors, and the hero. Nothing else — no route. */
    private drawMarkers(ctx: CanvasRenderingContext2D): void {
        const fit = this.fitFor(this.displayMapId);
        const sheet = this.ensureDoorSheet();
        if (sheet) {
            const cols = Math.floor(sheet.width / MAP_TILE_PX);
            for (const index of NAV_PORTALS_BY_MAP[this.displayMapId] ?? []) {
                const p = PORTALS[index]!;
                this.drawDoor(ctx, sheet, cols, p, fit);
            }
        }

        const hero = this.deps.heroPosition();
        if (!hero || hero.mapId !== this.displayMapId) return;
        const heroRow = this.chartRowOn(this.displayMapId, hero.row);
        if (heroRow < 0) return;
        const s = fit.scale;
        const hx = fit.ox + hero.col * s;
        const hy = fit.oy + heroRow * s;
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
     * One door composited at native resolution, cached by open/closed and colour.
     *
     * Drawing the 5x4 composite as twenty individual scaled tiles would give each
     * tile its own rounded edges and leave hairlines inside a single door; the
     * composite is composited once at 1:1 and the whole frame is scaled as one
     * picture, the same way the chart itself is.
     */
    private doorCanvasFor(
        sheet: HTMLImageElement,
        cols: number,
        open: boolean,
        color: number,
    ): HTMLCanvasElement {
        const key = `${open ? 'o' : 'c'}_${color}`;
        const hit = this.doorCanvases.get(key);
        if (hit) return hit;
        const P = MAP_TILE_PX;
        const canvas = document.createElement('canvas');
        canvas.width = DOOR_W * P;
        canvas.height = DOOR_H * P;
        const off = canvas.getContext('2d')!;
        off.imageSmoothingEnabled = false;
        const tiles = open ? OPENED_DOOR_TILES : CLOSED_DOOR_TILES;
        for (let row = 0; row < DOOR_H; row++) {
            for (let col = 0; col < DOOR_W; col++) {
                const i = row * DOOR_W + col;
                const x = col * P;
                const y = row * P;
                // The roka colour sits in the middle of the lintel, and is the one
                // tile of the composite that is not frame or doorway.
                if (i === ROKA_COLOUR_INDEX) {
                    off.fillStyle = rokaColour(color);
                    off.fillRect(x, y, P, P);
                    continue;
                }
                const id = tiles[i]!;
                // Tile 0 is the black void in front of an open doorway, and the
                // map behind it is whatever the cavern drew.
                if (id === 0) {
                    off.fillStyle = COL.empty;
                    off.fillRect(x, y, P, P);
                    continue;
                }
                drawSheetFrame(off, sheet, id - DCHR_BASE_TILE, P, P, cols, x, y, P, P);
            }
        }
        this.doorCanvases.set(key, canvas);
        return canvas;
    }

    /**
     * Blit one door at the fit's scale, exactly as the cavern view stamps it.
     *
     * The composite is 5x4 tiles and hangs one column to the left of the hero's
     * standing cell, with the trigger tile at the door record's own cell — so the
     * portal's `fromX`/`fromY` is the cell the hero stands on, and the frame starts
     * one column left and one row above it.
     *
     * A cavern is a cylinder, and the door's 5x4 footprint can straddle either
     * seam. Drawing it as one blit would then need two more for the wrapped
     * halves; drawing it cell by cell is simpler and the source is the 1:1 door
     * canvas, so each cell is crisp within itself.
     */
    private drawDoor(
        ctx: CanvasRenderingContext2D,
        sheet: HTMLImageElement,
        cols: number,
        p: (typeof PORTALS)[number],
        fit: MapFit,
    ): void {
        const open = this.deps.doorOpen?.(p.mapId, p.x0, p.y0) ?? (p.key === 0);
        const doorCanvas = this.doorCanvasFor(sheet, cols, open, p.color);
        const mapId = this.displayMapId;
        const width = NAV_MAP_BY_ID.get(mapId)?.mapWidth ?? 1;
        const rows = this.chartedRows(mapId);
        const P = MAP_TILE_PX;
        const left = p.fromX - 1;
        const top = p.fromY - 1;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        for (let row = 0; row < DOOR_H; row++) {
            const mapRow = (((top + row) % NAV_MAP_HEIGHT) + NAV_MAP_HEIGHT) % NAV_MAP_HEIGHT;
            const chartRow = (mapRow - chartFirstRow(mapId) + NAV_MAP_HEIGHT) % NAV_MAP_HEIGHT;
            if (chartRow >= rows) continue;
            for (let col = 0; col < DOOR_W; col++) {
                const mapCol = (((left + col) % width) + width) % width;
                const dstX = fit.ox + mapCol * fit.scale;
                const dstY = fit.oy + chartRow * fit.scale;
                ctx.drawImage(
                    doorCanvas,
                    col * P, row * P, P, P,
                    dstX, dstY, fit.scale, fit.scale,
                );
            }
        }
        ctx.imageSmoothingEnabled = false;
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
        const fit = this.fitFor(this.displayMapId);
        const s = Math.max(2, fit.scale);
        const x = fit.ox + this.cursorCol * fit.scale;
        const y = fit.oy + this.cursorRow * fit.scale;
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
            `${this.deps.text('map.dest')} ${this.cursorCol},${ringRowOf(this.displayMapId, this.cursorRow)}`,
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

/** The first row of `mapId`'s ring its chart starts on — see {@link CHART_FIRST_ROW}. */
function chartFirstRow(mapId: number): number {
    return CHART_FIRST_ROW[String(NAV_MAP_BY_ID.get(mapId)?.nameKey)] ?? 0;
}

/** The ring row a chart row is drawn from. */
function ringRowOf(mapId: number, chartRow: number): number {
    return (chartFirstRow(mapId) + chartRow) % NAV_MAP_HEIGHT;
}

/**
 * A tab label short enough to fit: `mp80.mdt` -> `80`, `mp5d.mdt` -> `5D`
 *
 * Full localized cavern's name is displayed in the title bar.
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
