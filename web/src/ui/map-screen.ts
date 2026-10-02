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
 *   y 28..412  map strip at the top, map area below
 *   y 414..430 hint line
 *
 * The map is the cavern at an integer scale that fits: `S = floor(min(672/W,
 * 432/64))`, clamped to 1..8. The widest cavern is 320 tiles, so S is 2 and
 * everything fits without panning or zooming.
 */

import { NAV_MAP_BY_ID, NAV_REACHABLE } from '../data/nav/nav-maps.js';
import { NAV_MAP_HEIGHT } from '../data/nav/index.js';
import { PORTALS, NAV_PORTALS_BY_MAP } from '../data/nav/nav-portals.js';
import { NavTileClassifier } from '../engine/nav/attributes.js';
import { findRoute, type NavGraphStore, type NavRoute } from '../engine/nav/pathfinder.js';
import type { NavTileGrid } from '../engine/nav/mdt-grid.js';
import type { HeroCapabilities } from '../engine/nav/capabilities.js';
import { drawSheetFrame } from '../render/sheets.js';
import { TILE_SIZE } from '../config/engine.js';

const VIEW_W = 672;
const VIEW_H = 432;
const STRIP_H = 26;
const AREA_TOP = 28;
const AREA_H = 384;          // 28..412
const HINT_TOP = 414;
const MAX_SCALE = 8;
const SNAP_RADIUS = 2;       // tiles searched outward for a valid standing spot
const LRU_RASTERS = 4;

/** A cavern tile is `TILE_SIZE` in the game's sheets — 24x24; the map scales down. */
const MAP_TILE_PX = TILE_SIZE;

const FONT_TITLE = '18px "Press Start 2P", monospace';
const FONT_SMALL = '12px "Press Start 2P", monospace';

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
    /** A destination was chosen; the route is already computed. */
    onPick: (route: NavRoute) => void;
    /**
     * Whether a key is still lying where the generated table says there was one.
     *
     * A key the player has already taken is not in the world — the engine drops it
     * from the list at dungeon init (engine/dungeon-init.ts:75). The composition
     * root answers from the save; without it the screen assumes every key is
     * still there, which is right for a fresh game.
     */
    keyPresent?: (mapId: number, col: number, row: number, kind: 0 | 1) => boolean;
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

    /** Integer scale that fits this map in the map area. */
    scaleFor(mapId: number): number {
        const width = NAV_MAP_BY_ID.get(mapId)?.mapWidth ?? 1;
        const s = Math.floor(Math.min(VIEW_W / width, AREA_H / NAV_MAP_HEIGHT));
        return Math.max(1, Math.min(MAX_SCALE, s));
    }

    /** Top-left canvas pixel of the scaled map. */
    originFor(mapId: number): { ox: number; oy: number; scale: number } {
        const scale = this.scaleFor(mapId);
        const width = NAV_MAP_BY_ID.get(mapId)?.mapWidth ?? 1;
        const ox = Math.round((VIEW_W - width * scale) / 2);
        const oy = AREA_TOP + Math.round((AREA_H - NAV_MAP_HEIGHT * scale) / 2);
        return { ox, oy, scale };
    }

    /** Map cell under a canvas pixel, or null when the click missed the map. */
    tileFromCanvas(x: number, y: number): { col: number; row: number } | null {
        const { ox, oy, scale } = this.originFor(this.displayMapId);
        if (x < ox || y < oy) return null;
        const col = Math.floor((x - ox) / scale);
        const row = Math.floor((y - oy) / scale);
        const width = NAV_MAP_BY_ID.get(this.displayMapId)?.mapWidth ?? 0;
        if (row < 0 || row >= NAV_MAP_HEIGHT || col < 0 || col >= width) return null;
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
        if (canvasY < AREA_TOP + STRIP_H) { this.clickStrip(canvasX, canvasY); return; }
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
        switch (code) {
            case 'ArrowLeft':
                this.cursorCol = (this.cursorCol - 1 + width) % width;
                return true;
            case 'ArrowRight':
                this.cursorCol = (this.cursorCol + 1) % width;
                return true;
            case 'ArrowUp':
                this.cursorRow = (this.cursorRow - 1 + NAV_MAP_HEIGHT) % NAV_MAP_HEIGHT;
                return true;
            case 'ArrowDown':
                this.cursorRow = (this.cursorRow + 1) % NAV_MAP_HEIGHT;
                return true;
            case 'PageDown':
            case 'Tab':
                if (!repeat) this.stepStrip(1);
                return true;
            case 'PageUp':
                if (!shift) this.stepStrip(-1);
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

        // 1. With the keys in his pocket: the route as it stands today.
        const held = findRoute({ store: this.deps.store, caps, start: from, goal: to });
        if (held) return this.accept(held);

        // 1b. The same, counting on shoes the player can put on. A slope wants
        //     Silkarn's and a four-tile jump wants Feruza's, and the hero can change
        //     accessory in a shop — so refusing those hops makes the route walk the
        //     long way round something he could stride over. The route says which
        //     shoes it needs and where.
        const shod = findRoute({
            store: this.deps.store, caps, start: from, goal: to, planAccessories: true,
        });
        if (shod) return this.accept(shod);

        // 2. As if he were carrying every key in the game. That is the shape of the
        //    journey, and the locked doors on it are how many keys it needs.
        const open = findRoute({
            store: this.deps.store, caps, start: from, goal: to, unlimitedKeys: true,
        });
        if (!open) { this.fail(this.deps.text('map.unreachable')); return; }

        // 3. Going to get them. The search is already bounded by the component — no
        //    route leaves it — and deliberately *not* by cavern level: the game's one
        //    Lion-Head key is on level 8 and its one Lion-Head door on level 6, so a
        //    same-level rule would make that door unopenable by any route at all.
        const collected = findRoute({
            store: this.deps.store, caps, start: from, goal: to,
            collectKeys: true,
            ...(this.deps.keyPresent ? { keyPresent: this.deps.keyPresent } : {}),
        });
        if (collected) return this.accept(collected);

        // Reachable, but the keys are not on this level to be had.
        const needed = open.lockedDoors.ordinary + open.lockedDoors.lion;
        this.fail(this.deps.text(needed === 1 ? 'map.needsOneKey' : 'map.needsKeys'));
    }

    /** Take a route and close the screen. */
    private accept(route: NavRoute): void {
        this.deps.soundManager?.playSfx?.(12);
        this.active = false;
        this.deps.onPick(route);
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
        const top = AREA_TOP;
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
     * Paint the whole cavern at `scale`, from its own tiles.
     *
     * `drawStaticTile` (render/dungeon.ts:210) is the reference: tile id 0 is
     * black, ids 1..n are frames of the cavern sheet, and ids 0x40.. are frames of
     * the platform sheet. Anything else has no art and falls back to the class
     * colour, which is all this function knew how to do before.
     */
    private rasterize(
        mapId: number,
        grid: NavTileGrid,
        scale: number,
        sheets: MapTileSheets | null,
    ): HTMLCanvasElement {
        const classifier = NavTileClassifier.forMap(mapId);
        const canvas = document.createElement('canvas');
        canvas.width = grid.mapWidth * scale;
        canvas.height = NAV_MAP_HEIGHT * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        ctx.imageSmoothingEnabled = false;

        const tiles = sheets?.tiles ?? null;
        const tileCols = tiles ? Math.floor(tiles.width / MAP_TILE_PX) : 0;
        const tileCount = tiles ? tileCols * Math.floor(tiles.height / MAP_TILE_PX) : 0;
        const platforms = sheets?.platforms ?? null;
        const platCols = platforms ? Math.floor(platforms.width / MAP_TILE_PX) : 0;
        const platCount = platforms ? platCols * Math.floor(platforms.height / MAP_TILE_PX) : 0;

        for (let row = 0; row < NAV_MAP_HEIGHT; row++) {
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
        for (let row = 0; row < NAV_MAP_HEIGHT; row++) {
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
        this.drawMarkers(ctx);
        this.drawCursor(ctx);
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
        const top = AREA_TOP;
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

    /** Doors and town exits. The hero. Nothing else — no route. */
    private drawMarkers(ctx: CanvasRenderingContext2D): void {
        const { ox, oy, scale } = this.originFor(this.displayMapId);
        const s = Math.max(1, scale);
        for (const index of NAV_PORTALS_BY_MAP[this.displayMapId] ?? []) {
            const p = PORTALS[index]!;
            // The door record's cell is one row above the hero's head, so the
            // trigger tile is drawn at the standing position below it.
            const x = ox + p.fromX * scale;
            const y = oy + p.fromY * scale;
            ctx.fillStyle = p.toTown ? '#f80' : '#8f8';
            ctx.fillRect(x, y, s, s);
            if (p.toTown) {
                ctx.fillStyle = '#000';
                ctx.fillRect(x, y + (s >> 1), s, Math.max(1, s >> 2));
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

    private drawCursor(ctx: CanvasRenderingContext2D): void {
        const { ox, oy, scale } = this.originFor(this.displayMapId);
        const s = Math.max(2, scale);
        const x = ox + this.cursorCol * scale;
        const y = oy + this.cursorRow * scale;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(1, Math.floor(s / 3));
        ctx.strokeRect(x - ctx.lineWidth, y - ctx.lineWidth, s + ctx.lineWidth * 2, s + ctx.lineWidth * 2);
    }

    private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
        ctx.font = FONT_SMALL;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ccc';
        const text = now < this.messageUntil && this.message
            ? this.message
            : this.deps.text('map.hints');
        ctx.fillText(text, 16, HINT_TOP);
    }
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
