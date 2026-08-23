import { describe, expect, it } from 'vitest';
import { setupGameCanvas, GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT } from '../src/render/canvas.js';
import { drawSheetFrame } from '../src/render/sheets.js';
import {
    BOSS_EXPLOSION_RING_DATA,
    BOSS_EXPLOSION_COLORS,
    getExplosionRingCanvas,
    type RingDocument,
    type RingSurface,
} from '../src/render/explosion-ring.js';
import { TILE_SIZE, VIEW_COLS, VIEW_ROWS } from '../src/config/engine.js';

// ─── render/canvas ────────────────────────────────────────────────────────────

describe('setupGameCanvas', () => {
    function makeCanvas(getContextResult: unknown = {}) {
        const ctxStub = Object.assign({ imageSmoothingEnabled: true }, getContextResult);
        const canvas = {
            width: 0,
            height: 0,
            getContext: () => ctxStub,
        };
        return { canvas: canvas as unknown as HTMLCanvasElement, ctx: ctxStub };
    }

    it('fixes the internal resolution to VIEW_COLS×VIEW_ROWS tiles', () => {
        expect(GAME_VIEW_WIDTH).toBe(VIEW_COLS * TILE_SIZE);
        expect(GAME_VIEW_HEIGHT).toBe(VIEW_ROWS * TILE_SIZE);

        const { canvas, ctx } = makeCanvas();
        const returned = setupGameCanvas(canvas);
        expect(canvas.width).toBe(672);
        expect(canvas.height).toBe(VIEW_ROWS * TILE_SIZE);
        expect(returned).toBe(ctx);
    });

    it('disables image smoothing for crisp pixel blits', () => {
        const { canvas, ctx } = makeCanvas();
        setupGameCanvas(canvas);
        expect(ctx.imageSmoothingEnabled).toBe(false);
    });

    it('throws when no 2D context is available', () => {
        const canvas = { width: 0, height: 0, getContext: () => null };
        expect(() => setupGameCanvas(canvas as unknown as HTMLCanvasElement)).toThrow();
    });
});

// ─── render/sheets ────────────────────────────────────────────────────────────

describe('drawSheetFrame', () => {
    function makeCtx() {
        const calls: unknown[][] = [];
        const ctx = { drawImage: (...args: unknown[]) => calls.push(args) };
        return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
    }

    const sheet = { width: 96, height: 48 };   // 4 cols × 2 rows of 24px frames

    it('computes the source rect from frameIndex and cols', () => {
        const { ctx, calls } = makeCtx();
        drawSheetFrame(ctx, sheet, 0, 24, 24, 4, 10, 20);
        drawSheetFrame(ctx, sheet, 5, 24, 24, 4, 0, 0);
        expect(calls[0]).toEqual([sheet, 0, 0, 24, 24, 10, 20, 24, 24]);
        expect(calls[1]).toEqual([sheet, 24, 24, 24, 24, 0, 0, 24, 24]); // col 1, row 1
    });

    it('skips frames that would read past the sheet bounds', () => {
        const { ctx, calls } = makeCtx();
        drawSheetFrame(ctx, sheet, 8, 24, 24, 4, 0, 0);    // row 2 — past height
        drawSheetFrame(ctx, sheet, -1, 24, 24, 4, 0, 0);   // negative index
        drawSheetFrame(ctx, null, 0, 24, 24, 4, 0, 0);     // missing sheet
        expect(calls).toHaveLength(0);
    });

    it('scales via optional dw/dh, defaulting to the native frame size', () => {
        const { ctx, calls } = makeCtx();
        drawSheetFrame(ctx, sheet, 2, 24, 24, 4, 5, 6, 48, 48);
        expect(calls[0]).toEqual([sheet, 48, 0, 24, 24, 5, 6, 48, 48]);
    });
});

// ─── render/explosion-ring ────────────────────────────────────────────────────

function makeRingDoc(): RingDocument & { built: Array<RingSurface & { imageData?: { data: Uint8ClampedArray } }> } {
    const built: Array<RingSurface & { imageData?: { data: Uint8ClampedArray } }> = [];
    return {
        built,
        createElement(): RingSurface & { imageData?: { data: Uint8ClampedArray } } {
            const surface: RingSurface & { imageData?: { data: Uint8ClampedArray }; width: number; height: number } = {
                width: 0,
                height: 0,
                getContext: () => ({
                    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
                    putImageData: (img: { data: Uint8ClampedArray }) => { surface.imageData = img; },
                }),
            };
            built.push(surface);
            return surface;
        },
    };
}

describe('explosion ring data (gfmcga.c decode)', () => {
    it('decodes four phases of 256 palette values (0–3)', () => {
        expect(BOSS_EXPLOSION_RING_DATA).toHaveLength(4);
        for (const px of BOSS_EXPLOSION_RING_DATA) {
            expect(px).toHaveLength(256);
            expect(Math.max(...px)).toBeLessThanOrEqual(3);
        }
    });

    it('every phase carries content (decay changes shape, not just count)', () => {
        const lit = (px: Uint8Array) => px.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
        expect(BOSS_EXPLOSION_RING_DATA.map(lit).every((c) => c > 0)).toBe(true);
    });

    it('matches the manual 2bpp decode of a known word', () => {
        // Phase 3 (most intact), word 8 = 0b0000000000001011 packs pixels 64..71;
        // the final two 2-bit pairs are 10 and 11 → values 2 and 3.
        const px = BOSS_EXPLOSION_RING_DATA[3]!;
        expect(px[70]).toBe(2);
        expect(px[71]).toBe(3);
        expect(px[64]).toBe(0);
    });
});

describe('getExplosionRingCanvas', () => {
    it('pre-renders an opaque, scaled ring and caches per (variant, phase, scale)', () => {
        const doc = makeRingDoc();
        const scale = TILE_SIZE / 8;   // 3, like game.js uses

        const a = getExplosionRingCanvas(0, 3, scale, doc);
        const again = getExplosionRingCanvas(0, 3, scale, doc);
        expect(again).toBe(a);                       // cached
        expect(doc.built).toHaveLength(1);

        const other = getExplosionRingCanvas(0, 2, scale, doc);
        expect(other).not.toBe(a);
        expect(doc.built).toHaveLength(2);

        const surface = doc.built[0]!;
        expect(surface.width).toBe(16 * scale);
        expect(surface.height).toBe(16 * scale);

        // Every lit source pixel becomes a scale×scale opaque block.
        const data = surface.imageData!.data;
        const litPixels = BOSS_EXPLOSION_RING_DATA[3]!.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
        let opaque = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] === 255) opaque++;
        expect(opaque).toBe(litPixels * scale * scale);
    });

    it('maps value 3 to the outer color and 1/2 to the inner color', () => {
        const doc = makeRingDoc();
        getExplosionRingCanvas(2, 3, 1, doc);   // magenta variant
        const data = doc.built[0]!.imageData!.data;

        const colors = BOSS_EXPLOSION_COLORS[2]!;
        let sawInner = false;
        let sawOuter = false;
        for (let p = 0; p < 256; p++) {
            const v = BOSS_EXPLOSION_RING_DATA[3]![p];
            if (v === 0) continue;
            const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
            if (v === 3) {
                expect([r, g, b]).toEqual(colors.outer);
                sawOuter = true;
            } else {
                expect([r, g, b]).toEqual(colors.inner);
                sawInner = true;
            }
        }
        expect(sawInner).toBe(true);
        expect(sawOuter).toBe(true);
    });
});
