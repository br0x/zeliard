import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDialogText, parseLocalizedDialog } from '../src/core/conversation-text.js';
import { encodeConversationText, type ConversationEndCode } from '../src/core/conversation-encode.js';

const MDT_BASE = 0xc000;
const TOWNS = ['cmap', 'mrmp', 'stmp', 'bsmp', 'hlmp', 'tmmp', 'drmp', 'llmp', 'prmp', 'esmp'];

const END_CODE_NAMES: Record<number, ConversationEndCode> = {
    0x81: 'yesNo',
    0x83: 'elfCrest',
    0x87: 'pattern5',
    0x89: 'purchase',
    0x8b: 'tear',
};

function u16(buf: Uint8Array, offset: number): number {
    return (buf[offset] ?? 0) | ((buf[offset + 1] ?? 0) << 8);
}

function readMdt(town: string): Uint8Array {
    const url = new URL(`../public/game/0/${town}.mdt`, import.meta.url);
    return new Uint8Array(readFileSync(url));
}

function conversationPointers(buf: Uint8Array): number[] {
    const tableOff = u16(buf, 0x0d) - MDT_BASE;
    const pointers: number[] = [];
    for (let i = 0; ; i++) {
        const entry = tableOff + i * 2;
        if (entry + 1 >= buf.length) break;
        const addr = u16(buf, entry);
        if (addr === 0) break;
        const off = addr - MDT_BASE;
        if (off < 0 || off >= buf.length) break;
        pointers.push(addr);
    }
    return pointers;
}

function originalBytes(buf: Uint8Array, absPtr: number): Uint8Array {
    const off = absPtr - MDT_BASE;
    const out: number[] = [];
    for (let i = off; i < buf.length; i++) {
        const b = buf[i]!;
        // Include the terminator byte so the comparison is byte-exact.
        if (b === 0xff || b === 0x00) { out.push(b); break; }
        if (b === 0x85) {
            // parseDialogText skips this no-op stub and keeps going.
            continue;
        }
        if (b in END_CODE_NAMES) { out.push(b); break; }
        if (b >= 0x82) { out.push(b); break; }
        out.push(b);
    }
    return new Uint8Array(out);
}

/** Mirror of tools/extract_mdt_text.py: decode a stream to raw text + endCode. */
function decode(buf: Uint8Array, absPtr: number): { text: string; endCode: ConversationEndCode | null } {
    const off = absPtr - MDT_BASE;
    let text = '';
    let endCode: ConversationEndCode | null = null;
    for (let i = off; i < buf.length; i++) {
        const b = buf[i]!;
        if (b === 0xff || b === 0x00) break;
        if (b in END_CODE_NAMES) { endCode = END_CODE_NAMES[b]!; break; }
        if (b === 0x85) continue;
        if (b >= 0x82) break;
        // Printable bytes are preserved verbatim (0x2F, 0x5C and 0x26 included).
        if (b >= 0x20) text += String.fromCharCode(b);
    }
    return { text, endCode };
}

describe('parseLocalizedDialog', () => {
    it('lays out Cyrillic text without dropping characters', () => {
        const parsed = parseLocalizedDialog('Привет, странник.', null);
        expect(parsed.pages).toEqual([['Привет, странник.']]);
    });

    it('treats / as a forced line break', () => {
        const parsed = parseLocalizedDialog('Первая строка./Вторая строка.', null);
        expect(parsed.pages).toEqual([['Первая строка.', 'Вторая строка.']]);
    });

    it('maps yesNo to hasYesNo and never emits an end code', () => {
        const parsed = parseLocalizedDialog('Берёшь?', 'yesNo');
        expect(parsed.hasYesNo).toBe(true);
        expect(parsed.endCode).toBeNull();
    });

    it('maps pattern5 and purchase to their control codes', () => {
        expect(parseLocalizedDialog('Текст', 'pattern5').endCode).toBe(0x87);
        expect(parseLocalizedDialog('Текст', 'purchase').endCode).toBe(0x89);
    });

    it('fires effect callbacks for elfCrest and tear', () => {
        let crest = 0;
        let tear = 0;
        parseLocalizedDialog('Держи.', 'elfCrest', { onElfCrest: () => { crest++; } });
        parseLocalizedDialog('Слеза!', 'tear', { onFinalTearCollected: () => { tear++; } });
        expect(crest).toBe(1);
        expect(tear).toBe(1);
    });

    it('wraps long Latin text the same way parseDialogText does', () => {
        const text = 'The quick brown fox jumps over the lazy dog and keeps running far away.';
        const localized = parseLocalizedDialog(text, null);
        const bytes = parseDialogText(new Uint8Array([...text].map((c) => c.charCodeAt(0))));
        expect(localized.pages).toEqual(bytes.pages);
    });
});

describe('NPC conversation extraction round-trip', () => {
    for (const town of TOWNS) {
        it(`${town}: re-encoded text parses to the same pages as the original bytes`, () => {
            const buf = readMdt(town);
            const pointers = conversationPointers(buf);
            expect(pointers.length).toBeGreaterThan(0);

            for (const ptr of pointers) {
                const { text, endCode } = decode(buf, ptr);
                const original = originalBytes(buf, ptr);
                const reencoded = encodeConversationText(text, endCode);

                // Byte-exact round trip unless the original carries bytes
                // below 0x20, which parseDialogText skips and the extractor
                // therefore does not preserve.
                const hasSkippedBytes = original
                    .slice(0, -1)
                    .some((b) => b < 0x20);
                if (!hasSkippedBytes) {
                    expect(reencoded).toEqual(original);
                }

                const expected = parseDialogText(original);
                const actual = parseDialogText(reencoded);
                expect(actual.pages).toEqual(expected.pages);
                expect(actual.hasYesNo).toBe(expected.hasYesNo);
                expect(actual.endCode).toBe(expected.endCode);
            }
        });
    }
});