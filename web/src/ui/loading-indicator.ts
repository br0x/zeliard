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
 * while the engine is not ready. Both share one painter, so the look and the
 * animation phase are identical.
 *
 * The indicator is the Magia Stone sprite (the last tile of the dchr sheet,
 * the same one drawDungeonMagiaStones blits) orbiting the canvas centre
 * through eight slots above a localized label.
 */
import { t } from '../locale/index.js';
import { drawSheetFrame, type SpriteSheet } from '../render/sheets.js';
import { DUNGEON_DCHR_SHEET_PATH } from '../data/assets.js';
import { TILE_SIZE } from '../config/engine.js';

/** The dchr sheet is a single row of 24x24 tiles. */
const SHEET_COLUMNS = 39;
/** Frame 0x26 — the Magia Stone, same index as dungeon.ts drawDungeonMagiaStones. */
const MAGIA_STONE_FRAME = 0x26;
/** Drawn at 2x: 48x48 on a 672x432 canvas, crisp with smoothing off. */
const SPRITE_SCALE = 2;
const SPRITE_SIZE = TILE_SIZE * SPRITE_SCALE;

/** Orbit slots the sprite steps through before repeating, as in the old ring. */
const ORBIT_SLOTS = 8;
/** Distance from the canvas centre to the sprite centre, in canvas pixels. */
const ORBIT_RADIUS = 56;
/** Milliseconds per slot — deliberately slow, to match the game. */
const FRAME_MS = 110;

/** Clearance between the orbit's lowest point and the label. */
const LABEL_GAP = 32;
const LABEL_Y = ORBIT_RADIUS + SPRITE_SIZE / 2 + LABEL_GAP;

const FONT = '24px "Press Start 2P", monospace';
const BACKGROUND = '#000';
const LABEL_COLOR = '#0df';

/**
 * Orbit angle for an animation step: one 45 degree slot per step, starting at
 * twelve o'clock and turning clockwise.
 */
function orbitAngle(step: number): number {
    const slot = ((step % ORBIT_SLOTS) + ORBIT_SLOTS) % ORBIT_SLOTS;
    return -Math.PI / 2 + (slot / ORBIT_SLOTS) * Math.PI * 2;
}

let sprite: HTMLImageElement | null = null;
let spriteRequested = false;

/**
 * Load the sprite sheet once. Called as the spinner starts so the image
 * request runs in parallel with the rest of the boot chain instead of
 * delaying it.
 */
function ensureSprite(): void {
    if (spriteRequested) return;
    spriteRequested = true;
    const img = new Image();
    img.onload = () => { sprite = img; };
    img.onerror = () => { sprite = null; };
    img.src = DUNGEON_DCHR_SHEET_PATH;
}

/** The loaded sheet, or null while it is still in flight or has failed. */
export function loadingSprite(): SpriteSheet | null {
    return sprite;
}

/**
 * Paint one spinner frame: black backdrop, Magia Stone one orbit slot further
 * on, localized label. `now` is a performance.now() timestamp.
 *
 * `sheet` defaults to the sheet this module loaded; tests pass their own.
 */
export function drawLoadingIndicator(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    now: number,
    sheet: SpriteSheet | null = loadingSprite(),
): void {
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    if (sheet) {
        const angle = orbitAngle(Math.floor(now / FRAME_MS));
        // Nearest-neighbour keeps the 24x24 art crisp at 2x.
        ctx.imageSmoothingEnabled = false;
        drawSheetFrame(
            ctx, sheet, MAGIA_STONE_FRAME, TILE_SIZE, TILE_SIZE, SHEET_COLUMNS,
            Math.round(cx + Math.cos(angle) * ORBIT_RADIUS - SPRITE_SIZE / 2),
            Math.round(cy + Math.sin(angle) * ORBIT_RADIUS - SPRITE_SIZE / 2),
            SPRITE_SIZE, SPRITE_SIZE,
        );
    }

    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(t('hud.loading'), cx, cy + LABEL_Y);

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
    ensureSprite();
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