/**
 * path-overlay.ts — the chevron trail over the live cavern view.
 *
 * Draws the part of the Thread of Yaga's route that is still ahead of the hero,
 * as chevron tiles laid over the cavern background. Everything is clipped to the
 * 28x18 viewport, and because the guide already truncates the route at the hero's
 * progress, the per-frame cost does not grow with how long the route is.
 *
 * "Over the background" means exactly that: it is drawn after the cavern tiles and
 * before the entities and the hero, so monsters, items and the player always
 * render on top of it. A route that hid the things you have to react to would be
 * worse than no route.
 *
 * Sprite sheet: assets/images/chevrons.png, five 24x24 frames in one row —
 *
 *   0 right   1 up   2 left   3 down   4 destination ring
 *
 * Diagonals use the nearer cardinal rather than a rotated sprite: this is pixel
 * art rendered with imageSmoothingEnabled off, and a 45-degree rotation would
 * soften the pixels to buy a direction nobody reads off a chevron. The sequence of
 * chevrons still traces the path.
 */

import { TILE_SIZE, VIEW_COLS, VIEW_ROWS } from '../config/engine.js';
import { drawSheetFrame } from './sheets.js';
import { EDGE } from '../engine/nav/types.js';
import type { PathGuide } from '../engine/nav/path-guide.js';
import type { NavPoint } from '../engine/nav/pathfinder.js';

/** Frame indices, in the order they appear in chevrons.png. */
export const CHEVRON_RIGHT = 0;
export const CHEVRON_UP = 1;
export const CHEVRON_LEFT = 2;
export const CHEVRON_DOWN = 3;
export const CHEVRON_DESTINATION = 4;
export const CHEVRON_FRAMES = 5;
export const CHEVRON_FRAME_W = 24;
export const CHEVRON_FRAME_H = 24;

/** Sprite sheet path, relative to the site root like the other image assets. */
export const CHEVRON_SHEET = 'assets/images/chevrons.png';

/** One rendered chevron, for tests and debugging. */
export interface PlacedChevron {
    readonly x: number;
    readonly y: number;
    readonly frame: number;
    readonly mapId: number;
}

export interface PathOverlayEnv {
    ctx: CanvasRenderingContext2D;
    viewW(): number;
    viewH(): number;
    guide: PathGuide | null;
    /** Absolute map column the viewport's left edge starts at. */
    viewportLeftCol(): number;
    /** Absolute map row the viewport's top edge starts at. */
    viewportTopRow(): number;
    /** Map the hero is in, or null outside a cavern. */
    heroMapId(): number | null;
    /** Width of a map, for wrapping the column delta. */
    mapWidth(): number;
    chevrons: HTMLImageElement | null;
    /** Filled during draw, for tests: the chevrons that were placed. */
    placed: PlacedChevron[];
}

let env: PathOverlayEnv | null = null;

/** Wire the overlay once the composition root has its pieces. */
export function initPathOverlay(next: Omit<PathOverlayEnv, 'placed'>): void {
    env = { ...next, placed: [] };
}

/** Swap in the loaded sheet, or null while it is still loading. */
export function setChevronSheet(image: HTMLImageElement | null): void {
    if (!env) return;
    env.chevrons = image;
}

export function pathOverlayReady(): boolean {
    return env !== null && env.chevrons !== null;
}

/** Forget the route. */
export function clearPathOverlay(): void {
    env?.guide?.clear();
}

/** Signed column delta, taking the short way round the cylinder. */
function wrappedColumnDelta(from: number, to: number, mapWidth: number): number {
    let dx = to - from;
    if (dx > mapWidth / 2) dx -= mapWidth;
    else if (dx < -mapWidth / 2) dx += mapWidth;
    return dx;
}

/** Signed row delta, taking the short way round the 64-row cylinder. */
function wrappedRowDelta(from: number, to: number): number {
    let dy = to - from;
    if (dy > 32) dy -= 64;
    else if (dy < -32) dy += 64;
    return dy;
}

/**
 * The chevron frame for a step, or null when there is nothing to draw.
 *
 * The dominant axis wins for diagonals. A wrap-aware delta is used on both axes,
 * because a cavern is a cylinder and the step may cross the seam.
 */
export function chevronFor(
    from: { col: number; row: number },
    to: { col: number; row: number },
    mapWidth: number,
    destination: boolean,
): number | null {
    if (destination) return CHEVRON_DESTINATION;
    // Both deltas must be wrapped, sign included: 239 -> 0 on a 240-wide map is
    // one step east, and using the raw sign there points the chevron west.
    const dx = wrappedColumnDelta(from.col, to.col, mapWidth);
    const dy = wrappedRowDelta(from.row, to.row);
    if (dx === 0 && dy === 0) return null;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx > 0 ? CHEVRON_RIGHT : CHEVRON_LEFT;
    }
    // Rows count downwards, so a negative delta is upward.
    return dy < 0 ? CHEVRON_UP : CHEVRON_DOWN;
}

/** Where a chevron lands on the canvas, or null when it is off screen. */
function viewportPixel(
    point: NavPoint,
    mapId: number,
    heroMapId: number,
    viewportLeft: number,
    viewportTop: number,
    mapWidth: number,
): { x: number; y: number } | null {
    if (point.mapId !== heroMapId) return null;
    const raw = point.col - viewportLeft;
    const vx = ((raw % mapWidth) + mapWidth) % mapWidth;
    const vy = (((point.row - viewportTop) % 64) + 64) % 64;
    // Allow one tile of slack so a chevron at the border scrolls in rather than
    // popping into existence.
    if (vx < -1 || vx >= VIEW_COLS + 1) return null;
    if (vy < -1 || vy >= VIEW_ROWS + 1) return null;
    return { x: vx * TILE_SIZE, y: vy * TILE_SIZE };
}

/** Hard cap per frame, well above what a 28x18 viewport can show. */
const MAX_CHEVRONS = 64;

/**
 * Hops that carry the hero rather than walk him.
 *
 * No chevron is drawn for these. A ride slot is a platform tile, a swept cell is
 * mid-air, and a lift column is empty space: drawing along one produces a line of
 * arrows hanging in the scenery that no amount of walking reproduces. The hero is
 * carried through these; there is no instruction to give.
 */
const CARRIED_EDGES: ReadonlySet<number> = new Set([
    EDGE.RIDE_V, EDGE.RIDE_H, EDGE.BOARD, EDGE.ALIGHT, EDGE.DROP,
    EDGE.LIFT, EDGE.CARRY_L, EDGE.CARRY_R,
]);

/** Does this hop carry the hero instead of walking him? */
export function isCarriedHop(kind: number): boolean {
    return CARRIED_EDGES.has(kind);
}

export function drawPathOverlay(now: number): void {
    if (!env) return;
    env.placed.length = 0;
    const guide = env.guide;
    if (!guide || !env.chevrons || !guide.isActive) return;

    const heroMapId = env.heroMapId();
    if (heroMapId === null) return;
    const points = guide.remaining();
    if (points.length === 0) return;

    const mapWidth = env.mapWidth() || 1;
    const viewportLeft = env.viewportLeftCol();
    const viewportTop = env.viewportTopRow();
    const sheet = env.chevrons;

    const { ctx } = env;
    ctx.save();
    // Clip to the play area so nothing bleeds into the HUD or the borders.
    ctx.beginPath();
    ctx.rect(0, 0, env.viewW(), env.viewH());
    ctx.clip();

    let drawn = 0;
    for (let i = 0; i + 1 < points.length && drawn < MAX_CHEVRONS; i++) {
        const from = points[i]!;
        const to = points[i + 1]!;
        // A carried hop gets no arrow; the next walkable point does.
        if (isCarriedHop(guide.hopKindAt(i))) continue;
        const destination = i + 2 === points.length;
        const frame = chevronFor(from, to, mapWidth, destination);
        if (frame === null) continue;
        const at = viewportPixel(from, from.mapId, heroMapId, viewportLeft, viewportTop, mapWidth);
        if (!at) continue;
        drawSheetFrame(ctx, sheet, frame, CHEVRON_FRAME_W, CHEVRON_FRAME_H,
            CHEVRON_FRAMES, at.x, at.y, TILE_SIZE, TILE_SIZE);
        env.placed.push({ x: at.x, y: at.y, frame, mapId: from.mapId });
        drawn++;
    }
    ctx.restore();
    void now;
}
