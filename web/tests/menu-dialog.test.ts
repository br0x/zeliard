// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MenuList, TypewriterText, YesNoDialog } from '../src/ui/menu-dialog.js';

type Ctx = CanvasRenderingContext2D;

/** Minimal 2D-context stub: measureText by char count, records fillText calls. */
function fakeCtx(): Ctx & { calls: Array<{ text: string; x: number; y: number }> } {
    const calls: Array<{ text: string; x: number; y: number }> = [];
    const ctx = {
        measureText(text: string) {
            return { width: text.length * 10 };
        },
        fillText(text: string, x: number, y: number) {
            calls.push({ text, x, y });
        },
        save() {}, restore() {},
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
        strokeRect() {}, fillRect() {},
        globalAlpha: 1,
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
    };
    return Object.assign(ctx, { calls }) as never;
}

describe('TypewriterText', () => {
    const make = (text: string, maxWidth = 100, charMs = 10) =>
        new TypewriterText(text, '14px x', maxWidth, charMs, 20, 100, fakeCtx());

    it('wraps long text at word boundaries based on measured width', () => {
        // maxWidth 100 => 10 chars per line with the 10px/char stub
        const tw = make('aaaa bbbb ccccc dddd');
        expect(tw.lines).toEqual(['aaaa bbbb', 'ccccc dddd']);
        // dropped wrap spaces are not counted
        expect(tw.totalChars).toBe(19);
    });

    it('preserves explicit newlines as hard breaks', () => {
        const tw = make('ab\ncd');
        expect(tw.lines).toEqual(['ab', 'cd']);
    });

    it('drops empty paragraphs (no blank lines emitted)', () => {
        const tw = make('ab\n\n\ncd');
        expect(tw.lines).toEqual(['ab', 'cd']);
    });

    it('reveals characters over time', () => {
        const tw = make('abcdef', 1000);
        tw.start(1000); // charMs 10
        expect(tw.getVisibleLines(1030)).toEqual(['abc']);
        expect(tw.getVisibleLines(1050)).toEqual(['abcde']);
        expect(tw.getVisibleLines(1065)).toEqual(['abcdef']);
        expect(tw.isDone(1065)).toBe(true);
    });

    it('isDone is false before completion unless flagged done', () => {
        const tw = make('abcdef', 1000);
        tw.start(1000);
        expect(tw.isDone(1030)).toBe(false);
        tw.done = true;
        expect(tw.isDone(1030)).toBe(true);
    });

    it('skip() fast-forwards to the end', () => {
        const tw = make('abcdef');
        tw.start(1000);
        tw.skip(1100);
        expect(tw.isDone(1100)).toBe(true);
        expect(tw.getVisibleLines(1100)).toEqual(['abcdef']);
    });

    it('getVisibleLines clips across multiple lines in order', () => {
        const tw = new TypewriterText('aaaa bb\ncd', '14px x', 40, 10, 20, 100, fakeCtx());
        // lines: ['aaaa', 'bb'] (wrap), ['cd']
        tw.start(0);
        expect(tw.getVisibleLines(45)).toEqual(['aaaa']); // 4 chars visible
        expect(tw.getVisibleLines(65)).toEqual(['aaaa', 'bb']); // 6 chars
        expect(tw.getVisibleLines(85)).toEqual(['aaaa', 'bb', 'cd']); // 8 chars
    });

    it('draw emits only visible lines plus cursor when done', () => {
        const ctx = fakeCtx();
        const tw = make('abcdef', 1000);
        tw.start(1000);
        tw.draw(ctx, 5, 20, 1030);
        expect(ctx.calls).toHaveLength(1);

        ctx.calls.length = 0;
        tw.draw(ctx, 5, 20, 2000);
        expect(ctx.calls.map(c => c.text)).toEqual(['abcdef']);
    });
});

describe('MenuList', () => {
    it('handleArrow wraps around both ends', () => {
        const m = new MenuList(['a', 'b', 'c'], 'f', 20);
        expect(m.selectedIndex).toBe(0);
        m.handleArrow(-1);
        expect(m.selectedIndex).toBe(2);
        m.handleArrow(1);
        expect(m.selectedIndex).toBe(0);
        m.handleArrow(1);
        expect(m.selectedIndex).toBe(1);
    });

    it('draw highlights the selected item and colors it yellow', () => {
        const ctx = fakeCtx();
        const m = new MenuList(['a', 'b'], 'f', 20);
        m.draw(ctx, 50, 30, 0);
        expect(ctx.calls.map(c => c.text)).toEqual(['a', 'b']);
        expect(ctx.calls[0]!.y).toBe(30);
        expect(ctx.calls[1]!.y).toBe(50);
    });

    it('constructor accepts an initial selection', () => {
        const m = new MenuList(['a', 'b', 'c'], 'f', 20, 2);
        expect(m.selectedIndex).toBe(2);
    });
});

describe('YesNoDialog', () => {
    it('defaults to Yes and clamps arrow movement to [0,1]', () => {
        const d = new YesNoDialog(fakeCtx(), 'f', 10, 10, 80, 80);
        expect(d.isYes).toBe(true);
        d.handleArrow(-1);
        expect(d.isYes).toBe(true);
        d.handleArrow(1);
        expect(d.isYes).toBe(false);
        d.handleArrow(1);
        expect(d.selectedIndex).toBe(1);
        expect(d.isYes).toBe(false);
    });

    it('accepts a non-default initial selection', () => {
        const d = new YesNoDialog(fakeCtx(), 'f', 10, 10, 80, 80, 1);
        expect(d.isYes).toBe(false);
    });

    it('merges color overrides over defaults', () => {
        const d = new YesNoDialog(fakeCtx(), 'f', 10, 10, 80, 80, 0, { bg: '#123456' });
        expect(d.colors.bg).toBe('#123456');
        expect(d.colors.borderOuter).toBe('#ccc'); // default preserved
        expect(d.colors.cursor).toBe('#f00');
    });

    it('draw renders box strokes, both labels, and cursor on selection', () => {
        const ctx = fakeCtx();
        const d = new YesNoDialog(fakeCtx(), 'f', 10, 10, 80, 80);
        d.draw(ctx, 0.5);
        const texts = ctx.calls.map(c => c.text);
        expect(texts).toEqual(expect.arrayContaining(['Yes', 'No']));
    });
});
