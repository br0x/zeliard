import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import en from '../src/locale/en.json';

const MDT_BASE = 0xc000;
const SIGNS_TABLE_OFF = 0x17;
const MAX_SIGNS = 64;

/**
 * Dungeons with a sign pointer table. All other dungeon MDTs leave +0x17 at 0,
 * which the extractor treats as "no signs".
 */
const DUNGEONS_WITH_SIGNS = ['mp20', 'mp30'];

function u16(buf: Uint8Array, offset: number): number {
    return (buf[offset] ?? 0) | ((buf[offset + 1] ?? 0) << 8);
}

function readMdt(dungeon: string): Uint8Array {
    const url = new URL(`../public/game/0/${dungeon}.mdt`, import.meta.url);
    return new Uint8Array(readFileSync(url));
}

function ptrToOffset(ptr: number, size: number): number | null {
    if (ptr === 0 || ptr === 0xffff || ptr < MDT_BASE) return null;
    const off = ptr - MDT_BASE;
    return off < size ? off : null;
}

/** Mirror of tools/extract_dungeon_signs.py: decode one descriptor. */
function decodeSign(buf: Uint8Array, descOff: number): { xDelta: number; text: string }[] | null {
    const lines: { xDelta: number; text: string }[] = [];
    let i = descOff + 2;
    while (i < buf.length) {
        const xDelta = buf[i]!;
        i++;
        let text = '';
        let done = false;
        while (i < buf.length) {
            const b = buf[i]!;
            i++;
            if (b === 0xff) { done = true; break; }
            if (b === 0x2f) break;
            if (b === 0x5c) text += "'";
            else if (b >= 0x20) text += String.fromCharCode(b);
        }
        lines.push({ xDelta, text });
        if (done) return lines;
    }
    return null;
}

function signsFromMdt(dungeon: string): Record<string, { xDelta: number; text: string }[]> {
    const buf = readMdt(dungeon);
    const out: Record<string, { xDelta: number; text: string }[]> = {};
    const tableOff = ptrToOffset(u16(buf, SIGNS_TABLE_OFF), buf.length);
    if (tableOff === null) return out;

    for (let idx = 0; idx < MAX_SIGNS; idx++) {
        const entryOff = tableOff + idx * 2;
        if (entryOff + 1 >= buf.length) break;
        const descOff = ptrToOffset(u16(buf, entryOff), buf.length);
        if (descOff === null) break;
        const lines = decodeSign(buf, descOff);
        if (!lines || lines.length === 0) break;
        out[`${dungeon}.sign.${idx}`] = lines;
    }
    return out;
}

describe('dungeon sign extraction', () => {
    for (const dungeon of DUNGEONS_WITH_SIGNS) {
        it(`${dungeon}: en.json sign lines match the MDT descriptor bytes`, () => {
            const fromMdt = signsFromMdt(dungeon);
            expect(Object.keys(fromMdt).length).toBeGreaterThan(0);

            for (const [key, lines] of Object.entries(fromMdt)) {
                const localized = en.dungeon.signs[key as keyof typeof en.dungeon.signs];
                expect(localized, `en.json missing ${key}`).toBeDefined();
                expect(localized).toEqual(lines);
            }
        });
    }

    it('dungeons without a sign table contribute no sign keys', () => {
        for (const dungeon of ['mp10', 'mp1d', 'mp21', 'mp90']) {
            expect(Object.keys(signsFromMdt(dungeon))).toHaveLength(0);
        }
    });
});