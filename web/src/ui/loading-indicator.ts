/**
 * loading-indicator.ts — animated "please wait" overlay for the game canvas.
 *
 * Two windows leave the canvas black while there is nothing to draw yet:
 *
 *   1. Boot: the canvas is revealed when the opening intro finishes, but the
 *      first `loop()` frame is only requested after audio, level data and
 *      sprites are loaded — seconds of loading, and the main loop is not
 *      running yet, so draw() cannot cover it.
 *   2. Map transitions: `engineReady` is cleared while the next level's data
 *      and assets are fetched, and the loop keeps running with nothing to
 *      render.
 *
 * `startLoadingIndicator` owns a private RAF loop for the boot window;
 * `drawLoadingIndicator` is the single-frame version main.ts draw() calls
 * while the engine is not ready. Both share one painter so the look and the
 * animation phase are identical.
 */
import { t } from '../locale/index.js';

/** Blocks in the rotating ring. */
const BLOCKS = 8;
/** Block edge length in canvas pixels (the canvas is a 672x432 pixel buffer). */
const BLOCK_SIZE = 16;
/** Orbit radius of the ring centre, in canvas pixels. */
const RING_RADIUS = 56;
/** Milliseconds per animation step — deliberately slow, to match the game. */
const FRAME_MS = 90;
/** Vertical distance from the ring centre to the label baseline-ish middle. */
const LABEL_OFFSET = 56;

const FONT = '24px "Press Start 2P", monospace';
const BACKGROUND = '#000';
const LABEL_COLOR = '#fc6';

/**
 * Dimming trail, indexed by distance behind the leading block: index 0 is the
 * head, the last is the tail fading into the background.
 */
const COLORS = [
    '#fff3b0',
    '#fc6',
    '#e09030',
    '#a86020',
    '#703c14',
    '#4a280e',
    '#2a180a',
    '#1a0e06',
] as const;

/**
 * Paint one spinner frame: black backdrop, rotating ring, localized label.
 * `now` is a performance.now() timestamp.
 */
export function drawLoadingIndicator(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    now: number,
): void {
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const step = Math.floor(now / FRAME_MS) % BLOCKS;

    for (let i = 0; i < BLOCKS; i++) {
        // Block i orbits one slot per step, while its colour is indexed by how
        // far it trails the leading block — so the bright head sweeps around
        // the ring instead of the whole palette rotating rigidly.
        const slot = (i + step) % BLOCKS;
        const trail = (step - i + BLOCKS) % BLOCKS;
        const angle = (slot / BLOCKS) * Math.PI * 2;
        ctx.fillStyle = COLORS[trail]!;
        // Round so the blocks stay pixel-aligned instead of landing on
        // half-pixel edges at every orbit position.
        ctx.fillRect(
            Math.round(cx + Math.cos(angle) * RING_RADIUS - BLOCK_SIZE / 2),
            Math.round(cy + Math.sin(angle) * RING_RADIUS - BLOCK_SIZE / 2),
            BLOCK_SIZE,
            BLOCK_SIZE,
        );
    }

    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(t('hud.loading'), cx, cy + RING_RADIUS + LABEL_OFFSET);

    // The game canvas is shared with every renderer — restore the defaults so
    // the next draw() is unaffected.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

let frameId = 0;

/**
 * Run the spinner on its own RAF loop. Idempotent, and independent of the
 * main game loop — it is stopped by stopLoadingIndicator() when that loop
 * takes over.
 */
export function startLoadingIndicator(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
): void {
    if (frameId) return;
    const tick = (now: number): void => {
        drawLoadingIndicator(ctx, width, height, now);
        frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
}

/** Stop the spinner loop if it is running. Leaves the last frame on screen. */
export function stopLoadingIndicator(): void {
    if (!frameId) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
}