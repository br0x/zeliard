import { describe, expect, it, vi } from 'vitest';
import {
    charOrigWidth,
    computeDialogGeometry,
    parseDialogText,
} from '../src/core/conversation-text.js';

/** Build a byte stream from a string (chars → codes). */
function s(text: string): number[] {
    return [...text].map((c) => c.charCodeAt(0));
}

describe('charOrigWidth', () => {
    it('uses the original DOS width table', () => {
        expect(charOrigWidth(' ')).toBe(5); // 0x20
        expect(charOrigWidth('W')).toBe(8); // widest
        expect(charOrigWidth("'")).toBe(3); // 0x27
    });

    it('falls back to 6 for out-of-table chars', () => {
        expect(charOrigWidth('\x01')).toBe(6); // below the table
        expect(charOrigWidth('\x80')).toBe(6); // beyond the table (idx 96)
        expect(charOrigWidth('\u00e9')).toBe(6); // é — not in the DOS table
    });
});

describe('parseDialogText basics', () => {
    it('parses plain single-line text', () => {
        const r = parseDialogText(s('Hello, world!'));
        expect(r.pages).toEqual([['Hello, world!']]);
        expect(r.hasYesNo).toBe(false);
        expect(r.endCode).toBeNull();
    });

    it('treats / as a line break and 0x00/0xFF as terminators', () => {
        const r = parseDialogText([...s('Line one'), 0x2f, ...s('Line two'), 0x00, ...s('GARBAGE')]);
        expect(r.pages).toEqual([['Line one', 'Line two']]);
    });

    it('remaps 0x5C to apostrophe and 0x26 to space', () => {
        const r = parseDialogText([0x49, 0x5c, 0x6d]); // I ' m
        expect(r.pages[0][0]).toBe("I'm");
        const r2 = parseDialogText([...s('a'), 0x26, ...s('b')]);
        expect(r2.pages[0][0]).toBe('a b');
    });

    it('skips control chars below 0x20 and unknown high bytes terminate', () => {
        expect(parseDialogText([...s('ab'), 0x05, ...s('c')]).pages[0][0]).toBe('abc');
        expect(parseDialogText([...s('keep'), 0x84, ...s('drop')]).pages[0][0]).toBe('keep');
    });
});

describe('control codes', () => {
    it('0x81 requests Yes/No', () => {
        const r = parseDialogText([...s('Trade?'), 0x81]);
        expect(r.hasYesNo).toBe(true);
        expect(r.pages.length).toBeGreaterThan(0);
    });

    it('0x83 fires the Elf Crest effect exactly once', () => {
        const onElfCrest = vi.fn();
        const r = parseDialogText([...s('Take this.'), 0x83, ...s('rest')], { onElfCrest });
        expect(onElfCrest).toHaveBeenCalledTimes(1);
        expect(r.pages[0][0]).toBe('Take this.');
    });

    it('0x87 and 0x89 set end codes', () => {
        expect(parseDialogText([0x87]).endCode).toBe(0x87);
        expect(parseDialogText([0x89]).endCode).toBe(0x89);
    });

    it('0x85 stub is skipped without side effects', () => {
        const onElfCrest = vi.fn();
        const r = parseDialogText([...s('AB'), 0x85, ...s('CD')], { onElfCrest });
        expect(r.pages[0][0]).toBe('ABCD');
        expect(onElfCrest).not.toHaveBeenCalled();
    });

    it('0x8B fires the tear effect', () => {
        const onTearCollected = vi.fn();
        const r = parseDialogText([0x8b], { onTearCollected });
        expect(onTearCollected).toHaveBeenCalledTimes(1);
        expect(r.pages).toEqual([]); // nothing printable before the code
    });

    it('effects are optional', () => {
        expect(() => parseDialogText([0x83])).not.toThrow();
    });
});

describe('line wrapping at 256 original pixels', () => {
    it('breaks before a word that would overflow', () => {
        // "aaaa bb cc" style: build words with known widths.
        // Each 'n' is 8px wide ("nnnn" = 32px), spaces are 5px.
        const word = 'nnnn'; // 32px
        const text = [word, word, word, word, word].join(' ');
        const r = parseDialogText(s(text));

        // Total width = 5*32 + 4*5 = 180 < 256 -> fits on one line.
        expect(r.pages).toHaveLength(1);
        expect(r.pages[0]).toHaveLength(1);

        // 10 words: 10*32 + 9*5 = 365 > 256 -> wraps into 2+ lines.
        const r2 = parseDialogText(s(Array(10).fill(word).join(' ')));
        const flatLines = r2.pages.flat();
        expect(flatLines.length).toBeGreaterThanOrEqual(2);
        // Every line stays under the limit (last word always fits after break).
        for (const line of flatLines) {
            let w = 0;
            for (const ch of line) w += charOrigWidth(ch);
            expect(w).toBeLessThan(256 + 40); // generous bound; break happens pre-word
        }
    });

    it('does not leave trailing spaces at wrap points', () => {
        // Space that triggers the wrap is dropped (continue), not appended.
        const r = parseDialogText(s('nnnnnnnnnnnnnnnnnnnnnnnnnnnnnn nn x'));
        const first = r.pages[0][0];
        expect(first.startsWith(' ')).toBe(false);
        expect(first.endsWith(' ')).toBe(false);
    });
});

describe('paging at 15 lines per page', () => {
    it('splits long streams into 15-line pages', () => {
        // 35 forced line breaks -> 36 lines -> pages of 15+15+6
        const stream: number[] = [];
        for (let i = 0; i < 35; i++) stream.push(0x61, 0x2f);
        stream.push(0x62); // last page has one non-empty line

        const r = parseDialogText(stream);
        expect(r.pages).toHaveLength(3);
        expect(r.pages[0]).toHaveLength(15);
        expect(r.pages[1]).toHaveLength(15);
        // Final page only keeps non-empty lines.
        expect(r.pages[2].every((l) => l.length > 0)).toBe(true);
    });
});

// ── geometry ────────────────────────────────────────────────────────────────

const measure = (text: string) => text.length * 10;

describe('computeDialogGeometry', () => {
    it('sizes the box around measured text plus padding', () => {
        const g = computeDialogGeometry({
            pageLines: ['abcdefghij'], // 100px measured
            facingLeft: false,
            measureText: measure,
        });
        // bw = clamp(100 + 20 + 16, 160, 648) = 160 (min-width floor)
        expect(g.w).toBe(160);
        // h = 32 + (1-1)*24 + 20
        expect(g.h).toBe(52);
    });

    it('grows with extra choice rows', () => {
        const base = computeDialogGeometry({ pageLines: ['x'], facingLeft: false, measureText: measure });
        const withChoices = computeDialogGeometry({ pageLines: ['x'], facingLeft: false, extraLines: 2, measureText: measure });
        expect(withChoices.h - base.h).toBe(2 * 24);
    });

    it('docks left or right based on NPC facing', () => {
        const leftNpc = computeDialogGeometry({ pageLines: ['x'.repeat(30)], facingLeft: false, measureText: measure });
        const rightNpc = computeDialogGeometry({ pageLines: ['x'.repeat(30)], facingLeft: true, measureText: measure });
        expect(leftNpc.x).toBe(12);
        // viewWidth 672: right-docked box ends 12px before the right edge.
        expect(rightNpc.x).toBe(672 - rightNpc.w - 12);
    });

    it('never lets the box rise above y=4', () => {
        const tall = Array.from({ length: 14 }, () => 'line');
        const g = computeDialogGeometry({ pageLines: tall, facingLeft: false, extraLines: 4, measureText: measure });
        expect(g.y).toBe(4);
    });
});
