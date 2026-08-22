/**
 * sheets.ts — sprite-sheet blitting.
 *
 * Draws one frame out of a horizontally-wrapped sheet (frames laid left to
 * right, `cols` per row) at 1:1 or scaled size. Guards against missing
 * sheets and frames that would read past the sheet edge. Extracted from
 * game.js (Stage 2).
 */

/** Minimal sheet description the blit math needs (any Image works). */
export interface SpriteSheet {
    width: number;
    height: number;
}

/**
 * Blit frame `frameIndex` of `sheet` to (dx, dy). Optional dw/dh scale the
 * draw; they default to the frame's native size. No-op when the sheet is
 * absent, the index is negative, or the frame rect exceeds the sheet bounds.
 */
export function drawSheetFrame(
    ctx: CanvasRenderingContext2D,
    sheet: SpriteSheet | null,
    frameIndex: number,
    frameW: number,
    frameH: number,
    cols: number,
    dx: number,
    dy: number,
    dw: number = frameW,
    dh: number = frameH,
): void {
    if (!sheet || frameIndex < 0) return;
    const sx = (frameIndex % cols) * frameW;
    const sy = Math.floor(frameIndex / cols) * frameH;
    if (sx + frameW > sheet.width || sy + frameH > sheet.height) return;
    ctx.drawImage(sheet as unknown as CanvasImageSource, sx, sy, frameW, frameH, dx, dy, dw, dh);
}
