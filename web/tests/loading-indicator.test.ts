import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    drawLoadingIndicator,
    startLoadingIndicator,
    stopLoadingIndicator,
} from '../src/ui/loading-indicator.js';
import { setLocale } from '../src/locale/index.js';

interface Rect { x: number; y: number; w: number; h: number; fill: string }

function makeCtx() {
    const rects: Rect[] = [];
    const texts: { text: string; x: number; y: number }[] = [];
    const ctx = {
        fillStyle: '#000',
        font: '',
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'alphabetic' as CanvasTextBaseline,
        fillRect(x: number, y: number, w: number, h: number) {
            rects.push({ x, y, w, h, fill: ctx.fillStyle });
        },
        fillText(text: string, x: number, y: number) {
            texts.push({ text, x, y });
        },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, texts };
}

const WIDTH = 672;
const HEIGHT = 432;

describe('drawLoadingIndicator', () => {
    afterEach(() => setLocale('en'));

    it('clears the whole canvas before drawing the spinner', () => {
        const { ctx, rects } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0);
        expect(rects[0]).toEqual({ x: 0, y: 0, w: WIDTH, h: HEIGHT, fill: '#000' });
    });

    it('draws a ring of blocks around the canvas centre', () => {
        const { ctx, rects } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0);

        const blocks = rects.slice(1);
        expect(blocks.length).toBe(8);
        expect(blocks.every(b => b.w === 16 && b.h === 16)).toBe(true);
        // Every block sits on the 56px orbit, up to the pixel-snapping below.
        for (const b of blocks) {
            const dx = b.x + b.w / 2 - WIDTH / 2;
            const dy = b.y + b.h / 2 - HEIGHT / 2;
            expect(Math.abs(Math.hypot(dx, dy) - 56)).toBeLessThan(2);
        }
        // Blocks are pixel-aligned, never on a half-pixel edge.
        expect(blocks.every(b => Number.isInteger(b.x) && Number.isInteger(b.y))).toBe(true);
    });

    it('rotates one step per frame interval and returns after a full turn', () => {
        const { ctx, rects } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0);
        const base = rects.slice(1).map(b => `${b.x},${b.y}`);

        const advanced = makeCtx();
        drawLoadingIndicator(advanced.ctx, WIDTH, HEIGHT, 90);
        const next = advanced.rects.slice(1).map(b => `${b.x},${b.y}`);
        expect(next).not.toEqual(base);

        const full = makeCtx();
        drawLoadingIndicator(full.ctx, WIDTH, HEIGHT, 8 * 90);
        expect(full.rects.slice(1).map(b => `${b.x},${b.y}`)).toEqual(base);
    });

    it('produces a distinct frame for every step of a full turn', () => {
        // Regression guard: tying the colour index to the same slot as the
        // angle paints one static image no matter how far the clock advanced.
        const signatures = new Set<string>();
        for (let step = 0; step < 8; step++) {
            const { ctx, rects } = makeCtx();
            drawLoadingIndicator(ctx, WIDTH, HEIGHT, step * 90);
            signatures.add(rects.slice(1).map(b => `${b.x},${b.y}:${b.fill}`).join('|'));
        }
        expect(signatures.size).toBe(8);
    });

    it('carries the colour trail with the rotation', () => {
        const a = makeCtx();
        drawLoadingIndicator(a.ctx, WIDTH, HEIGHT, 0);
        const b = makeCtx();
        drawLoadingIndicator(b.ctx, WIDTH, HEIGHT, 90);
        // Advancing a step shifts the palette: block i takes block i-1's hue.
        expect(a.rects[1]!.fill).not.toBe(b.rects[1]!.fill);
    });

    it('labels the spinner in the active locale', () => {
        const en = makeCtx();
        drawLoadingIndicator(en.ctx, WIDTH, HEIGHT, 0);
        expect(en.texts).toHaveLength(1);
        expect(en.texts[0]!.text).toBe('LOADING');
        expect(en.texts[0]!.x).toBe(WIDTH / 2);

        setLocale('ru');
        const ru = makeCtx();
        drawLoadingIndicator(ru.ctx, WIDTH, HEIGHT, 0);
        expect(ru.texts[0]!.text).toBe('ЗАГРУЗКА');
    });

    it('restores the shared canvas text state', () => {
        const { ctx } = makeCtx();
        drawLoadingIndicator(ctx, WIDTH, HEIGHT, 0);
        expect(ctx.textAlign).toBe('left');
        expect(ctx.textBaseline).toBe('alphabetic');
    });
});

describe('startLoadingIndicator / stopLoadingIndicator', () => {
    const pending = new Map<number, FrameRequestCallback>();
    let nextId: number;

    beforeEach(() => {
        nextId = 1;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            const id = nextId++;
            pending.set(id, cb);
            return id;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
    });

    afterEach(() => {
        stopLoadingIndicator();
        pending.clear();
        vi.unstubAllGlobals();
    });

    /** Fire the newest queued frame, the way the browser dequeues it. */
    function runFrame(now: number): void {
        const entry = [...pending.entries()].pop()!;
        pending.delete(entry[0]);
        entry[1](now);
    }

    it('paints every frame until stopped', () => {
        const { ctx, rects } = makeCtx();
        startLoadingIndicator(ctx, WIDTH, HEIGHT);
        expect(pending.size).toBe(1);

        runFrame(0);
        runFrame(90);
        runFrame(180);
        // Three frames painted, each re-queued exactly once.
        expect(rects.filter(r => r.w === WIDTH && r.h === HEIGHT).length).toBe(3);
        expect(pending.size).toBe(1);

        stopLoadingIndicator();
        expect(pending.size).toBe(0);
    });

    it('is idempotent and tolerates stopping when not running', () => {
        const { ctx } = makeCtx();
        startLoadingIndicator(ctx, WIDTH, HEIGHT);
        startLoadingIndicator(ctx, WIDTH, HEIGHT);
        expect(pending.size).toBe(1);

        stopLoadingIndicator();
        stopLoadingIndicator();
        expect(pending.size).toBe(0);
    });
});