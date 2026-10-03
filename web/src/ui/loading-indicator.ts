/**
 * loading-indicator.ts — animated "please wait" overlay for the game canvas.
 *
 * One window leaves the canvas black while there is nothing to draw yet: boot.
 * The canvas is revealed when the opening intro finishes, but the first
 * `loop()` frame is only requested after audio, level data and sprites are
 * loaded — seconds of loading, and the main loop is not running yet, so
 * draw() cannot cover it.
 *
 * `startLoadingIndicator` owns a private RAF loop for exactly that window and
 * `stopLoadingIndicator` hands the canvas back to the main loop. Map
 * transitions deliberately do not use it: `engineReady` is cleared while the
 * next level loads, but the loop keeps running and the last game frame simply
 * stays on screen.
 *
 * The indicator is the Magia Stone sprite (the last tile of the dchr sheet,
 * the same one drawDungeonMagiaStones blits) chasing itself clockwise around
 * the canvas centre: eight copies, one per orbit slot, fading from fully
 * opaque at the head to fully transparent at the tail, above a localized
 * label.
 */
import { t } from '../locale/index.js';
import { drawSheetFrame, type SpriteSheet } from '../render/sheets.js';
import { DUNGEON_DCHR_SHEET_PATH } from '../data/assets.js';
import { TILE_SIZE } from '../config/engine.js';

/** The dchr sheet is a single row of 24x24 tiles. */
const SHEET_COLUMNS = 39;
/** Frame 0x26 — the Magia Stone, same index as dungeon.ts drawDungeonMagiaStones. */
const MAGIA_STONE_FRAME = 0x26;
const SPRITE_SIZE = TILE_SIZE;

/** Orbit slots the sprite trail covers, one copy each — as in the old ring. */
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

/**
 * Opacity of the copy `index` steps back along the trail: 1 at the head, 0 at
 * the tail, evenly spaced in between.
 */
function trailAlpha(index: number): number {
    return (ORBIT_SLOTS - 1 - index) / (ORBIT_SLOTS - 1);
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
 * Paint one spinner frame: black backdrop, the fading Magia Stone trail,
 * localized label. `now` is a performance.now() timestamp.
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
        const step = Math.floor(now / FRAME_MS);
        // Nearest-neighbour keeps the pixel art crisp.
        ctx.imageSmoothingEnabled = false;
        // Head first, then the copies trailing one slot behind it, each dimmer
        // than the last until the tail fades out completely.
        for (let i = 0; i < ORBIT_SLOTS; i++) {
            const angle = orbitAngle(step - i);
            ctx.globalAlpha = trailAlpha(i);
            drawSheetFrame(
                ctx, sheet, MAGIA_STONE_FRAME, TILE_SIZE, TILE_SIZE, SHEET_COLUMNS,
                Math.round(cx + Math.cos(angle) * ORBIT_RADIUS - SPRITE_SIZE / 2),
                Math.round(cy + Math.sin(angle) * ORBIT_RADIUS - SPRITE_SIZE / 2),
                SPRITE_SIZE, SPRITE_SIZE,
            );
        }
        // The game canvas is shared with every renderer — restore the default so
        // the next draw() is unaffected.
        ctx.globalAlpha = 1;
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