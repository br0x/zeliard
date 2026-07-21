// guerra_border_walls.js
//
// JS/canvas translation of the "guerra" spell's screen-effect primitives:
// Render_Viewport_Border_Walls, DrawDitheredPattern, RenderBorderRings,
// RenderBorderSegment, RenderOrthogonalSegments, DrawVerticalLine,
// DrawHorizontalLine, CalculateRowVRAMAddress.
//
// ============================================================================
// What the original assembly actually does (reverse-engineered)
// ============================================================================
//
// 1. DrawDitheredPattern XORs the byte 0x12 into every pixel of the 224x144
//    viewport (VIEW_COLS*8 x VIEW_ROWS*8) exactly once. The original looped
//    in an odd 8x18 stepped pattern purely because VGA writes were done a
//    row at a time with a fixed stride; every pixel still ends up touched
//    exactly once, so it's just a flat "invert this color" flash over the
//    whole viewport. Functionally equivalent to a simple nested loop, which
//    is what's implemented below (xorViewportFlash).
//
// 2. RenderBorderRings sets up 3 nested square boxes centered on the hero
//    (offsets -1/+25, -5/+33, -9/+41 pixels) and renders each with
//    RenderBorderSegment.
//
// 3. RenderBorderSegment draws a hollow rectangle (RenderOrthogonalSegments),
//    waits a frame, then grows the box by 12px on every side (clamped to the
//    viewport bounds), 9 times total -- an expanding "shockwave" ring.
//
// 4. RenderOrthogonalSegments draws top+bottom horizontal edges and
//    left+right vertical edges of a box (the original did this via register
//    reuse / procedure fallthrough; here it's just 4 explicit calls).
//
// 5. Render_Viewport_Border_Walls ties it together: XOR-flash the viewport
//    on (color 0x12), run the full 3-ring/9-step expanding animation in a
//    bright color (54), run the *exact same* animation again in color 0
//    (erasing the trail as a second wave chases the first), then XOR-flash
//    the viewport again -- which cancels the first flash (XOR of the same
//    value twice is a no-op), restoring the original screen.
//
// ============================================================================
// Assumed to be provided by the rest of the project
// ============================================================================
//
//   PALETTE                      -- Uint8Array/array of 256 [r,g,b] triples,
//                                    the VGA palette used elsewhere in the port.
//   ctx                          -- CanvasRenderingContext2D for the game canvas.
//   getViewportOrigin()          -- returns {x, y}: the canvas-pixel top-left
//                                    of the viewport (mirrors
//                                    viewport_top_left_vram_offset).
//   getHeroPixelPos()            -- returns {x, y}: hero_x_in_viewport*8,
//                                    hero_head_y_in_viewport*8 (pixel position
//                                    of the hero within the viewport).
//   waitForVBlankAndDelay()      -- returns a Promise that resolves after the
//                                    same pacing the original vblank-synced
//                                    delay gave each ring-expansion step.
//                                    A requestAnimationFrame-based default is
//                                    provided below; swap it out if the
//                                    project already has an equivalent.
//
// ============================================================================

const VIEWPORT_W = VIEW_COLS * 8; // 224
const VIEWPORT_H = VIEW_ROWS * 8; // 144

// --- default waitForVBlankAndDelay, only used if not already defined -------
if (typeof waitForVBlankAndDelay !== 'function') {
    var waitForVBlankAndDelay = function () {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    };
}

// ---------------------------------------------------------------------------
// Shadow indexed framebuffer for the viewport.
//
// XOR only makes sense against the underlying palette *index* (as the
// original VGA byte-plane write did), not against the final RGB pixel, so
// we keep a small index buffer for the viewport and resolve it through
// PALETTE whenever we flush to the canvas.
//
// On entry, this is seeded from whatever's already on the canvas (so the
// XOR flash correctly inverts the real game background/sprites rather than
// an empty buffer) using a nearest-palette-index lookup.
// ---------------------------------------------------------------------------

let _vramIndex = null; // Uint8Array(VIEWPORT_W * VIEWPORT_H), populated lazily

function _nearestPaletteIndex(r, g, b) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < PALETTE.length; i++) {
        const [pr, pg, pb] = PALETTE[i];
        const dist = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    }
    return best;
}

function _loadVramIndexFromCanvas() {
    const { x, y } = getViewportOrigin();
    const img = ctx.getImageData(x, y, VIEWPORT_W, VIEWPORT_H);
    _vramIndex = new Uint8Array(VIEWPORT_W * VIEWPORT_H);
    for (let p = 0; p < VIEWPORT_W * VIEWPORT_H; p++) {
        const o = p * 4;
        _vramIndex[p] = _nearestPaletteIndex(img.data[o], img.data[o + 1], img.data[o + 2]);
    }
}

function _flushVramIndexToCanvas(x0, y0, w, h) {
    const { x: originX, y: originY } = getViewportOrigin();
    const img = ctx.createImageData(w, h);
    for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
            const colorIndex = _vramIndex[(y0 + row) * VIEWPORT_W + (x0 + col)];
            const [r, g, b] = PALETTE[colorIndex];
            const o = (row * w + col) * 4;
            img.data[o] = r;
            img.data[o + 1] = g;
            img.data[o + 2] = b;
            img.data[o + 3] = 255;
        }
    }
    ctx.putImageData(img, originX + x0, originY + y0);
}

// ---------------------------------------------------------------------------
// xorViewportFlash — asm: DrawDitheredPattern
//
// XORs a fixed color index across the entire viewport, once per pixel.
// ---------------------------------------------------------------------------
function xorViewportFlash(colorIndex) {
    if (!_vramIndex) _loadVramIndexFromCanvas();

    for (let y = 0; y < VIEWPORT_H; y++) {
        for (let x = 0; x < VIEWPORT_W; x++) {
            _vramIndex[y * VIEWPORT_W + x] ^= colorIndex;
        }
    }
    _flushVramIndexToCanvas(0, 0, VIEWPORT_W, VIEWPORT_H);
}

// ---------------------------------------------------------------------------
// drawHorizontalLine — asm: DrawHorizontalLine
//
// Draws row `y` from x0 up to (but NOT including) x1, matching the
// original's `rep stosb` byte count of (dl - bl). Aborts (no-op) if the row
// is at y==0 or y>=VIEWPORT_H-1, matching the original's edge guard.
// ---------------------------------------------------------------------------
function drawHorizontalLine(x0, x1, y, colorIndex) {
    if (x1 < x0) [x0, x1] = [x1, x0];

    if (y === 0 || y >= VIEWPORT_H - 1) return; // off the top/bottom border

    if (x0 === 0) x0 = 1;
    if (x1 >= VIEWPORT_W - 2) x1 = VIEWPORT_W - 2;

    if (!_vramIndex) _loadVramIndexFromCanvas();

    for (let x = x0; x < x1; x++) {
        _vramIndex[y * VIEWPORT_W + x] = colorIndex;
    }
    _flushVramIndexToCanvas(x0, y, Math.max(0, x1 - x0), 1);
}

// ---------------------------------------------------------------------------
// drawVerticalLine — asm: DrawVerticalLine
//
// Draws column `x` from y0 up to AND INCLUDING y1 (the original's byte
// count was (dh - bh + 1)). Aborts (no-op) if the column is at x==0 or
// x>=VIEWPORT_W-1.
// ---------------------------------------------------------------------------
function drawVerticalLine(x, y0, y1, colorIndex) {
    if (y1 < y0) [y0, y1] = [y1, y0];

    if (x === 0 || x >= VIEWPORT_W - 1) return; // off the left/right border

    if (y0 === 0) y0 = 1;
    if (y1 >= VIEWPORT_H - 2) y1 = VIEWPORT_H - 3;

    if (!_vramIndex) _loadVramIndexFromCanvas();

    for (let y = y0; y <= y1; y++) {
        _vramIndex[y * VIEWPORT_W + x] = colorIndex;
    }
    _flushVramIndexToCanvas(x, y0, 1, Math.max(0, y1 - y0 + 1));
}

// ---------------------------------------------------------------------------
// renderOrthogonalSegments — asm: RenderOrthogonalSegments
//
// Draws a hollow rectangle outline for {left, top, right, bottom}.
// ---------------------------------------------------------------------------
function renderOrthogonalSegments(box, colorIndex) {
    const { left, top, right, bottom } = box;

    drawHorizontalLine(left, right, top, colorIndex);
    drawHorizontalLine(left, right, bottom, colorIndex);
    drawVerticalLine(left, top, bottom, colorIndex);
    drawVerticalLine(right, top, bottom, colorIndex);
}

// ---------------------------------------------------------------------------
// renderBorderSegment — asm: RenderBorderSegment
//
// Draws `box`, waits a frame, grows it by 12px on every side (clamped to
// the viewport), and repeats for 9 steps total -- one expanding ring.
// ---------------------------------------------------------------------------
async function renderBorderSegment(box, colorIndex) {
    let { left, top, right, bottom } = box;

    for (let step = 0; step < 9; step++) {
        renderOrthogonalSegments({ left, top, right, bottom }, colorIndex);

        left = left - 12 >= 0 ? left - 12 : 0;
        top = top - 12 >= 0 ? top - 12 : 0;
        right = right + 12 <= 0xff ? right + 12 : 0xff;
        bottom = bottom + 12 <= 0xff ? bottom + 12 : 0xff;

        await waitForVBlankAndDelay();
    }
}

// ---------------------------------------------------------------------------
// renderBorderRings — asm: RenderBorderRings
//
// Sets up 3 nested boxes centered on the hero and animates each as an
// expanding ring.
// ---------------------------------------------------------------------------
async function renderBorderRings(colorIndex) {
    const { x: heroX, y: heroY } = getHeroPixelPos();

    const boxes = [
        { inset: 1, span: 0x19 }, // 25
        { inset: 5, span: 0x21 }, // 33
        { inset: 9, span: 0x29 }, // 41
    ].map(({ inset, span }) => ({
        left: heroX - inset,
        top: heroY - inset,
        right: heroX - inset + span,
        bottom: heroY - inset + span,
    }));

    for (const box of boxes) {
        await renderBorderSegment(box, colorIndex);
    }
}

// ---------------------------------------------------------------------------
// renderViewportBorderWalls — asm: Render_Viewport_Border_Walls
//
// Top-level "guerra" visual effect: flash the viewport, animate 3 expanding
// rings in a bright color, animate the same rings again in "erase" color to
// wipe the trail, then flash the viewport again (cancelling the first
// flash).
// ---------------------------------------------------------------------------
async function renderViewportBorderWalls() {
    const FLASH_COLOR = 0x12;
    const RING_COLOR = 54;
    const ERASE_COLOR = 0;

    xorViewportFlash(FLASH_COLOR);

    await renderBorderRings(RING_COLOR);
    await renderBorderRings(ERASE_COLOR);

    xorViewportFlash(FLASH_COLOR);
}
