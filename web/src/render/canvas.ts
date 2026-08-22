/**
 * canvas.ts — game canvas bootstrap.
 *
 * The game renders to a fixed internal resolution (28×18 tiles of 24px =
 * 672×432); display scaling is CSS (`image-rendering: pixelated` in
 * styles.css), so there is intentionally no JS resize/integer-scaling layer.
 */

import { TILE_SIZE, VIEW_COLS, VIEW_ROWS } from '../config/engine.js';

/** Internal render resolution (matches the original EGA-era viewport). */
export const GAME_VIEW_WIDTH = VIEW_COLS * TILE_SIZE;   // 672
export const GAME_VIEW_HEIGHT = VIEW_ROWS * TILE_SIZE;  // 432

/**
 * Prepare the main game canvas: fix its internal resolution and disable
 * image smoothing (pixel-art blits must stay crisp). Returns the 2D context.
 */
export function setupGameCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    canvas.width = GAME_VIEW_WIDTH;
    canvas.height = GAME_VIEW_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.imageSmoothingEnabled = false;
    return ctx;
}
