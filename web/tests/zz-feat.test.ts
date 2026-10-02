import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NAV_MAPS } from '../src/data/nav/nav-maps.js';
import { diagPath } from './diag-path.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
describe('feature bits', () => {
    it('every door record in the game', () => {
        const lines: string[] = [];
        let bit0 = 0, bit0WithAch = 0, noAch = 0, closed = 0, open = 0;
        for (const meta of NAV_MAPS) {
            const b = new Uint8Array(readFileSync(resolve(REPO, 'web/public', meta.mdtPath)));
            const u16 = (o: number) => b[o]! | (b[o + 1]! << 8);
            const ptr = u16(0x0a) - 0xc000;
            const bound = u16(0x0c) - 0xc000;
            for (let i = ptr; i + 11 < bound; i += 12) {
                if (u16(i) === 0xffff) break;
                const flags = b[i + 3]!;
                const feat = b[i + 8]!;
                const ach = u16(i + 9);
                const isOpen = (flags & 0x80) !== 0;
                if (isOpen) open++; else closed++;
                if (feat & 1) {
                    bit0++;
                    const hasAch = ach !== 0xffff;
                    if (hasAch) bit0WithAch++;
                    lines.push(`bit0=1 ${meta.nameKey} door (${u16(i)},${b[i + 2]!}) -> mp${b[i + 4]}`
                        + ` openBit=${isOpen} achWord=0x${ach.toString(16)} achFlag=0x${b[i + 11]!.toString(16)}`);
                } else if (ach === 0xffff && !isOpen) {
                    noAch++;
                }
            }
        }
        lines.unshift(`doors: ${open} open, ${closed} closed; feature bit0 set on ${bit0}`
            + ` of which ${bit0WithAch} have a real achievement word;`
            + ` closed doors with no achievement word: ${noAch}`);
        writeFileSync(diagPath('feat.txt'), lines.join('\n'));
        expect(lines.length).toBeGreaterThan(0);
    });
});
