/**
 * nav-keys-extraction.test.ts — stage 1 of §19: the keys are where the data says.
 *
 * The whole key-routing feature rests on one binary format that this project had
 * never read: the 16-byte entity records in an MDT's monster table, where the
 * ordinary key (`flag_16`) and the Lion-Head key (`flag_17`) live among the
 * monsters. `tools/navlib/mdt.mjs:readKeys` parses it, and this test is what makes
 * the parse trustworthy — the two coordinates the player supplied are the only
 * independent check that exists, and the pickup window in the engine is four rows
 * and ±4 columns, so "near" would not be enough.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NAV_KEYS } from '../src/data/nav/nav-keys.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function mdt(nameKey: string): Uint8Array {
    const meta = NAV_MAP_BY_ID.get([...NAV_MAP_BY_ID.values()].find((m) => m.nameKey === nameKey)!.id)!;
    return new Uint8Array(readFileSync(resolve(REPO, 'web/public', meta.mdtPath)));
}

describe('key extraction', () => {
    it('puts an ordinary key at mp10 (99,41)', () => {
        expect(NAV_KEYS[0]).toEqual([{ col: 99, row: 41, kind: 0 }]);
    });

    it('puts a Lion-Head key at mp80 (150,7)', () => {
        expect(NAV_KEYS[23]).toEqual([{ col: 150, row: 7, kind: 1 }]);
    });

    it('is a standalone encode of the same bytes the graph is built from', () => {
        // The generated table must not drift from the MDTs: walk the entity records
        // here as well, with the arithmetic written out longhand, and require the
        // two to agree. A change to `readKeys` that silently reinterprets a field
        // would fail this rather than quietly move every key in the game.
        for (const meta of NAV_MAP_BY_ID.values()) {
            const bytes = mdt(meta.nameKey);
            const monsters = (bytes[0x10]! | (bytes[0x11]! << 8)) - 0xc000;
            const found: string[] = [];
            for (let i = monsters; i + 15 < bytes.length; i += 16) {
                const x = bytes[i]! | (bytes[i + 1]! << 8);
                if (x === 0xffff) break;
                const flags = bytes[i + 4]! & 0x1f;
                if (flags !== 0x16 && flags !== 0x17) continue;
                found.push(`${x & 0xff},${bytes[i + 2]!},${flags === 0x16 ? 0 : 1}`);
            }
            const table = (NAV_KEYS[meta.id] ?? []).map((k) => `${k.col},${k.row},${k.kind}`);
            expect(table, `${meta.nameKey} key table`).toEqual(found);
        }
    });

    it('has keys only where the maps say, and never a Lion-Head key invented', () => {
        let ordinary = 0;
        let lion = 0;
        for (const list of Object.values(NAV_KEYS)) {
            for (const key of list) (key.kind === 1 ? lion++ : ordinary++);
        }
        // [measured] over all 31 caverns: 17 ordinary, 1 Lion-Head, in 12 maps.
        expect(ordinary).toBe(17);
        expect(lion).toBe(1);
    });

    it('leaves every key inside its map', () => {
        for (const [id, list] of Object.entries(NAV_KEYS)) {
            const meta = NAV_MAP_BY_ID.get(Number(id))!;
            for (const key of list) {
                expect(key.col, `${meta.nameKey} (${key.col},${key.row}) column`)
                    .toBeGreaterThanOrEqual(0);
                expect(key.col).toBeLessThan(meta.mapWidth);
                expect(key.row).toBeGreaterThanOrEqual(0);
                expect(key.row).toBeLessThan(64);
            }
        }
    });
});