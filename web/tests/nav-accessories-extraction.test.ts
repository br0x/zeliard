/**
 * nav-accessories-extraction.test.ts — the pairs of shoes are where the data says.
 *
 * A pair is an item in the cavern, the same 16-byte entity record a key is, and it
 * is read out of the same table (`tools/navlib/mdt.mjs:readAccessories`). What makes
 * it different from a key is *which* pair it is: a `0x1E` record is always Feruza, but
 * a `0x1A` record hands over whatever the cavern level decides
 * (`flag1a`, engine/dungeon-items.ts:436-458), so the level has to be resolved at
 * extraction time and cannot be a lookup in the record. Getting that wrong would
 * place two different pairs at the same coordinates.
 *
 * The four coordinates and four names below are the player's, and are the only
 * independent check that the parse is right.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NAV_ACCESSORIES, NAV_SHOE_LABEL } from '../src/data/nav/nav-accessories.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function idOf(nameKey: string): number {
    return [...NAV_MAP_BY_ID.values()].find((m) => m.nameKey === nameKey)!.id;
}
function mdt(nameKey: string): Uint8Array {
    const meta = NAV_MAP_BY_ID.get(idOf(nameKey))!;
    return new Uint8Array(readFileSync(resolve(REPO, 'web/public', meta.mdtPath)));
}

/** The player's four records, as given: file, column, row, and the pair it is. */
const REPORTED: ReadonlyArray<[string, number, number, string]> = [
    ['mp40', 177, 13, 'Ruzeria'],
    ['mp50', 208, 27, 'Pirika'],
    ['mp60', 201, 13, 'Silkarn'],
    ['mp62', 27, 26, 'Feruza'],
];

describe('shoe extraction', () => {
    it.each(REPORTED)('%s (%i,%i) is a pair of %s', (nameKey, col, row, label) => {
        const list = NAV_ACCESSORIES[idOf(nameKey)] ?? [];
        expect(list, `${nameKey} has no pairs`).toHaveLength(1);
        expect(list[0]!.col).toBe(col);
        expect(list[0]!.row).toBe(row);
        expect(NAV_SHOE_LABEL[list[0]!.shoe]).toBe(label);
    });

    it('is a standalone decode of the same bytes, written out longhand', () => {
        // The generated table must not drift from the MDTs. Walk the entity records
        // here too, with the arithmetic spelled out, and require the two to agree — a
        // change to `readAccessories` that misreads a field fails here instead of
        // quietly moving every pair in the game.
        const found = new Map<string, string>();
        for (const meta of NAV_MAP_BY_ID.values()) {
            const bytes = mdt(meta.nameKey);
            const level = bytes[0x12]!;
            const levelShoe = ((level - 4) & 0xff) === 0 ? 'Ruzeria'
                : ((level - 4) & 0xff) === 1 ? 'Pirika' : 'Silkarn';
            // The monster table pointer is a seg0 pointer; its offset is ptr - 0xC000.
            const start = (bytes[0x10]! | (bytes[0x11]! << 8)) - 0xc000;
            for (let i = start; i + 15 < bytes.length; i += 16) {
                const x = bytes[i]! | (bytes[i + 1]! << 8);
                if (x === 0xffff) break;
                const handler = [bytes[i + 4]! & 0x1f, bytes[i + 9]! & 0x1f]
                    .find((h) => h === 0x1a || h === 0x1e);
                if (handler === undefined) continue;
                found.set(`${meta.nameKey}:${x & 0xff},${bytes[i + 2]! & 0xff}`,
                    handler === 0x1e ? 'Feruza' : levelShoe);
            }
        }
        expect(found.size, 'pairs found by hand').toBe(REPORTED.length);
        for (const [nameKey, col, row, label] of REPORTED) {
            expect(found.get(`${nameKey}:${col},${row}`), `${nameKey} (${col},${row})`)
                .toBe(label);
        }
    });

    it('there are four pairs in the whole game and no cavern has two', () => {
        // Nothing in the data is a duplicate, so the hero never collects the same pair
        // twice and one bit per kind is the whole of the inventory state.
        let total = 0;
        for (const [id, list] of Object.entries(NAV_ACCESSORIES)) {
            expect(list.length, `cavern ${id} has more than one pair`).toBeLessThanOrEqual(1);
            total += list.length;
        }
        expect(total).toBe(4);
    });

    it('resolves the level-dependent pair from the cavern level, not the record', () => {
        // The two `0x1A` records in the shipped data are byte-identical in every
        // field except the coordinates, and they are different pairs — mp50 is level 5
        // and mp60 is level 6. If this ever read the pair out of the record instead,
        // both would come out the same and the test below would pass by accident.
        const pirika = NAV_ACCESSORIES[idOf('mp50')]![0]!;
        const silkarn = NAV_ACCESSORIES[idOf('mp60')]![0]!;
        expect(NAV_MAP_BY_ID.get(idOf('mp50'))!.cavernLevel).toBe(5);
        expect(NAV_MAP_BY_ID.get(idOf('mp60'))!.cavernLevel).toBe(6);
        expect(pirika.shoe).not.toBe(silkarn.shoe);
        expect(NAV_SHOE_LABEL[pirika.shoe]).toBe('Pirika');
        expect(NAV_SHOE_LABEL[silkarn.shoe]).toBe('Silkarn');
    });

    it('leaves every pair inside its cavern', () => {
        for (const [id, list] of Object.entries(NAV_ACCESSORIES)) {
            const meta = NAV_MAP_BY_ID.get(Number(id))!;
            for (const a of list) {
                expect(a.col, `${meta.nameKey} (${a.col},${a.row}) column`).toBeGreaterThanOrEqual(0);
                expect(a.col).toBeLessThan(meta.mapWidth);
                expect(a.row).toBeGreaterThanOrEqual(0);
                expect(a.row).toBeLessThan(64);
            }
        }
    });
});