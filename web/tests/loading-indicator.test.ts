import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawLoadingIndicator } from '../src/ui/loading-indicator.js';
import { setLocale } from '../src/locale/index.js';
import { DUNGEON_DCHR_SHEET_PATH } from '../src/data/assets.js';
import { TILE_SIZE } from '../src/config/engine.js';

interface Blit { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

function makeCtx() {
    const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
    const blits: Blit[] = [];
    const texts: { text: string; x: number; y: number }[] = [];
    const ctx = {
        fillStyle: '#000',
        font: '',
        imageSmoothingEnabled: true,
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'alphabetic' as CanvasTextBaseline,
        fillRect(x: number, y: number, w: number, h: number) {
            rects.push({ x, y, w, h, fill: ctx.fillStyle });
        },
        fillText(text: string, x: number, y: number) {
            texts.push({ text, x, y });
        },
        drawImage(_src: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
            blits.push({ sx, sy, sw, sh, dx, dy, dw, dh });
        },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, blits, texts };
}

/** Stands in for the loaded dchr sheet (936x24 = 39 tiles of 24x24). */
const SHEET = { width: 936, height: 24 };

const WIDTH = 672;
const HEIGHT = 432;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

describe('drawLoadingIndicator', () => {
    afterEach(() => setLocale('en'));

    it('clears the whole canvas before drawing', () => {
        const { ctx, rects } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0, SHEET);
        expect(rects).toEqual([{ x: 0, y: 0, w: WIDTH, h: HEIGHT, fill: '#000' }]);
    });

    it('blits the Magia Stone — frame 0x26 of the dchr sheet — centred at 2x', () => {
        const { ctx, blits } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0, SHEET);

        expect(blits).toHaveLength(1);
        expect(blits[0]).toEqual({
            sx: 0x26 * 24, sy: 0, sw: 24, sh: 24,
            dx: CX - 24, dy: CY - 24, dw: 48, dh: 48,
        });
        expect(blits[0]!.sx + blits[0]!.sw).toBe(SHEET.width);
        expect(blits[0]!.dw).toBe(TILE_SIZE * 2);
    });

    it('asks for nearest-neighbour so the upscaled art stays crisp', () => {
        const { ctx } = makeCtx();
        ctx.imageSmoothingEnabled = true;
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0, SHEET);
        expect(ctx.imageSmoothingEnabled).toBe(false);
    });

    it('bobs the sprite and returns to the resting offset after a full cycle', () => {
        const offsets = [0, 1, 2, 3].map(step => {
            const { ctx, blits } = makeCtx();
            drawLoadingIndicator(ctx, WIDTH, HEIGHT, step * 110, SHEET);
            return blits[0]!.dy - (CY - 24);
        });
        expect(offsets).toEqual([0, -5, -10, -5]);

        const { ctx, blits } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 4 * 110, SHEET);
        expect(blits[0]!.dy).toBe(CY - 24);
    });

    it('keeps every sprite position pixel-aligned', () => {
        for (let step = 0; step < 4; step++) {
            const { ctx, blits } = makeCtx();
            drawLoadingIndicator(ctx, WIDTH, HEIGHT, step * 110, SHEET);
            expect(Number.isInteger(blits[0]!.dx)).toBe(true);
            expect(Number.isInteger(blits[0]!.dy)).toBe(true);
        }
    });

    it('still shows the label while the sheet is still loading', () => {
        const { ctx, blits, texts } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0, null);
        expect(blits).toHaveLength(0);
        expect(texts).toHaveLength(1);
        expect(texts[0]!.text).toBe('LOADING');
    });

    it('labels the spinner in the active locale', () => {
        const en = makeCtx();
        drawLoadingIndicator(en.ctx, WIDTH, HEIGHT, 0, SHEET);
        expect(en.texts[0]!.text).toBe('LOADING');
        expect(en.texts[0]!.x).toBe(CX);
        // Sits below the sprite so the two never overlap.
        expect(en.texts[0]!.y).toBeGreaterThan(CY + 24);

        setLocale('ru');
        const ru = makeCtx();
        drawLoadingIndicator(ru.ctx, WIDTH, HEIGHT, 0, SHEET);
        expect(ru.texts[0]!.text).toBe('ЗАГРУЗКА');
    });

    it('restores the shared canvas text state', () => {
        const { ctx } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0, SHEET);
        expect(ctx.textAlign).toBe('left');
        expect(ctx.textBaseline).toBe('alphabetic');
    });
});

describe('startLoadingIndicator / stopLoadingIndicator', () => {
    const pending = new Map<number, FrameRequestCallback>();
    let nextId: number;
    let created: FakeImage[];

    class FakeImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';
        naturalWidth = 0;
        naturalHeight = 0;
        width = 0;
        height = 0;
    }

    /**
     * The module keeps its RAF id and sprite-request flag across calls, so each
     * test needs a fresh instance to observe the first start().
     */
    async function freshModule() {
        vi.resetModules();
        return await import('../src/ui/loading-indicator.js');
    }

    beforeEach(() => {
        nextId = 1;
        created = [];
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            const id = nextId++;
            pending.set(id, cb);
            return id;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
        vi.stubGlobal('Image', class extends FakeImage {
            constructor() { super(); created.push(this); }
        });
    });

    afterEach(() => {
        pending.clear();
        vi.unstubAllGlobals();
    });

    /** Fire the newest queued frame, the way the browser dequeues it. */
    function runFrame(now: number): void {
        const entry = [...pending.entries()].pop()!;
        pending.delete(entry[0]);
        entry[1](now);
    }

    it('paints every frame until stopped', async () => {
        const { startLoadingIndicator, stopLoadingIndicator } = await freshModule();
        const { ctx, rects } = makeCtx();
        startLoadingIndicator(ctx, WIDTH, HEIGHT);
        expect(pending.size).toBe(1);

        runFrame(0);
        runFrame(90);
        runFrame(180);
        expect(rects.filter(r => r.w === WIDTH && r.h === HEIGHT).length).toBe(3);
        expect(pending.size).toBe(1);

        stopLoadingIndicator();
        expect(pending.size).toBe(0);
    });

    it('requests the sprite sheet once, so it loads alongside the other assets', async () => {
        const { startLoadingIndicator } = await freshModule();
        const { ctx } = makeCtx();
        startLoadingIndicator(ctx, WIDTH, HEIGHT);
        startLoadingIndicator(ctx, WIDTH, HEIGHT);

        expect(created).toHaveLength(1);
        expect(created[0]!.src).toBe(DUNGEON_DCHR_SHEET_PATH);
    });

    it('blits the sheet once it has loaded', async () => {
        const { startLoadingIndicator, loadingSprite } = await freshModule();
        const { ctx, blits } = makeCtx();
        startLoadingIndicator(ctx, WIDTH, HEIGHT);

        expect(loadingSprite()).toBeNull();
        expect(blits).toHaveLength(0);

        created[0]!.width = SHEET.width;
        created[0]!.height = SHEET.height;
        created[0]!.onload?.();

        runFrame(0);
        expect(loadingSprite()).toBe(created[0]);
        expect(blits).toHaveLength(1);
        expect(blits[0]!.sx).toBe(0x26 * TILE_SIZE);
    });

    it('survives a failed sheet load', async () => {
        const { startLoadingIndicator, loadingSprite } = await freshModule();
        const { ctx, blits, texts } = makeCtx();
        startLoadingIndicator(ctx, WIDTH, HEIGHT);
        created[0]!.onerror?.();

        runFrame(0);
        expect(loadingSprite()).toBeNull();
        expect(blits).toHaveLength(0);
        expect(texts[0]!.text).toBe('LOADING');
    });

    it('is idempotent and tolerates stopping when not running', async () => {
        const { startLoadingIndicator, stopLoadingIndicator } = await freshModule();
        const { ctx } = makeCtx();
        startLoadingIndicator(ctx, WIDTH, HEIGHT);
        startLoadingIndicator(ctx, WIDTH, HEIGHT);
        expect(pending.size).toBe(1);

        stopLoadingIndicator();
        stopLoadingIndicator();
        expect(pending.size).toBe(0);
    });
});