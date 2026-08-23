import { describe, expect, it } from 'vitest';
import {
    layoutConversationBox,
    drawConversationBox,
    type ConversationDrawState,
} from '../src/ui/conversation-draw.js';
import { TEXT_FIRST_BASELINE, TEXT_LINE_HEIGHT, TEXT_BOTTOM_PAD } from '../src/core/conversation-text.js';

interface Call { op: string; args: unknown[] }

function fakeCtx(measureWidths?: Record<string, number>) {
    const calls: Call[] = [];
    const ctx = {
        save: () => calls.push({ op: 'save', args: [] }),
        restore: () => calls.push({ op: 'restore', args: [] }),
        fillRect: (...args: unknown[]) => calls.push({ op: 'fillRect', args }),
        strokeRect: (...args: unknown[]) => calls.push({ op: 'strokeRect', args }),
        fillText: (...args: unknown[]) => calls.push({ op: 'fillText', args }),
        set font(v: string) { calls.push({ op: 'font', args: [v] }); },
        set fillStyle(v: string) { calls.push({ op: 'fillStyle', args: [v] }); },
        set strokeStyle(v: string) { calls.push({ op: 'strokeStyle', args: [v] }); },
        measureText: (line: string) => ({
            width: measureWidths?.[line] ?? line.length * 12,
        }),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function textCalls(calls: Call[]) {
    return calls.filter((c) => c.op === 'fillText') as Array<Call & { args: [string, number, number] }>;
}

function state(overrides: Partial<ConversationDrawState> = {}): ConversationDrawState {
    return {
        active: true,
        pages: [['Hello', 'World']],
        page: 0,
        purchaseMode: false,
        purchaseCursor: 0,
        yesNoMode: false,
        yesNoCursor: 0,
        facingLeft: false,
        boxX: 10,
        boxY: 20,
        boxW: 300,
        boxH: 100,
        ...overrides,
    };
}

describe('drawConversationBox', () => {
    it('no-ops when inactive or when there are no pages', () => {
        const a = fakeCtx();
        drawConversationBox(a.ctx, state({ active: false }));
        const b = fakeCtx();
        drawConversationBox(b.ctx, state({ pages: [] }));
        expect(a.calls).toHaveLength(0);
        expect(b.calls).toHaveLength(0);
    });

    it('draws the dialog rect and each page line at legacy offsets', () => {
        const f = fakeCtx();
        drawConversationBox(f.ctx, state());

        const rects = f.calls.filter((c) => c.op === 'fillRect');
        expect(rects).toEqual([{ op: 'fillRect', args: [10, 20, 300, 100] }]);
        const texts = textCalls(f.calls);
        expect(texts.slice(0, 2)).toEqual([
            { op: 'fillText', args: ['Hello', 26, 52] }, // x + 16, y + 32 + i * 24
            { op: 'fillText', args: ['World', 26, 76] },
        ]);
        expect(f.calls.some((c) => c.op === 'font' && c.args[0] === '20px "Courier New", monospace')).toBe(true);
    });

    it('falls back to default geometry when box fields are zero', () => {
        const f = fakeCtx();
        drawConversationBox(
            f.ctx,
            state({ pages: [['A']], boxX: 0, boxY: 0, boxW: 0, boxH: 0 }),
        );
        const rects = f.calls.filter((c) => c.op === 'fillRect');
        expect(rects).toEqual([{ op: 'fillRect', args: [10, 10, 300, 100] }]);
    });

    it('shows the more-pages indicator only below the last page', () => {
        const more = fakeCtx();
        drawConversationBox(more.ctx, state({ pages: [['A'], ['B']], page: 0 }));
        let texts = textCalls(more.calls);
        expect(texts.at(-1)?.args[0]).toBe('▼');
        expect(texts.at(-1)?.args[1]).toBe(10 + 300 - 24);
        expect(texts.at(-1)?.args[2]).toBe(20 + 100 - 12);

        const last = fakeCtx();
        drawConversationBox(last.ctx, state({ pages: [['A'], ['B']], page: 1 }));
        texts = textCalls(last.calls);
        expect(texts.some((t) => t.args[0] === '▼')).toBe(false);
    });

    it('draws Yes/No options with cursor highlight', () => {
        const f = fakeCtx();
        drawConversationBox(
            f.ctx,
            state({ pages: [['Choose.']], yesNoMode: true, yesNoCursor: 1 }),
        );
        const texts = textCalls(f.calls);
        const baseY = 20 + TEXT_FIRST_BASELINE + 1 * TEXT_LINE_HEIGHT + 8;
        expect(texts.map((t) => t.args[0])).toEqual(['Choose.', 'Yes', 'No', '►']);
        expect(texts[1]!.args).toEqual(['Yes', 42, baseY]);
        expect(texts[3]!.args).toEqual(['►', 22, baseY + TEXT_LINE_HEIGHT]); // cursor on row 1
        const styles = f.calls
            .filter((c) => c.op === 'fillStyle')
            .map((c) => c.args[0]);
        expect(styles).toContain('#ffcc00');
        expect(styles).toContain('#ccc');
    });

    it('draws Take/No-Take purchase options with cursor highlight', () => {
        const f = fakeCtx();
        drawConversationBox(
            f.ctx,
            state({
                pages: [['It\'s not free...']],
                purchaseMode: true,
                purchaseCursor: 0,
            }),
        );
        const texts = textCalls(f.calls);
        expect(texts.map((t) => t.args[0])).toEqual(["It's not free...", 'Take', 'No Take', '►']);
        expect(texts[3]!.args[2]).toBe(20 + TEXT_FIRST_BASELINE + TEXT_LINE_HEIGHT + 8); // cursor row 0
    });
});

describe('layoutConversationBox', () => {
    it('measures the current page through ctx and writes back boxX/Y/W/H', () => {
        const line = 'x'.repeat(30); // measured at 360px
        const f = fakeCtx({ [line]: 360 });
        const s = state({ pages: [[line]] });

        layoutConversationBox(f.ctx, s);

        // bw = max(measured + 2*10 padding + 16, 160), bx = 12, by = 308 - bh
        expect(s.boxW).toBe(396);
        expect(s.boxX).toBe(12);
        expect(s.boxH).toBe(TEXT_FIRST_BASELINE + TEXT_BOTTOM_PAD); // 1 line
        expect(s.boxY).toBe(13 * 24 - 4 - s.boxH);

        // Measurement happens with the layout font inside save/restore.
        const fonts = f.calls.filter((c) => c.op === 'font').map((c) => c.args[0]);
        expect(fonts).toEqual(["20px 'Courier New', monospace"]);
        const ops = f.calls.map((c) => c.op);
        expect(ops[0]).toBe('save');
        expect(ops.at(-1)).toBe('restore');
    });

    it('docks to the right edge when facingLeft', () => {
        const f = fakeCtx();
        const s = state({ pages: [['A']], facingLeft: true });
        layoutConversationBox(f.ctx, s);
        expect(s.boxX).toBe(672 - s.boxW - 12);
    });

    it('uses extraLines to grow the box (choice rows)', () => {
        const f = fakeCtx();
        const s = state({ pages: [['A']] });
        layoutConversationBox(f.ctx, s, 2);
        const f2 = fakeCtx();
        const s2 = state({ pages: [['A']] });
        layoutConversationBox(f2.ctx, s2);
        expect(s.boxH).toBe(s2.boxH + 2 * TEXT_LINE_HEIGHT);
    });
});
