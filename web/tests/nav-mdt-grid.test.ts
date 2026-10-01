/**
 * nav-mdt-grid.test.ts — the runtime tile decoder.
 *
 * The important test in this file is `case 0 reads the tile from the NEXT byte`.
 * The original research prototypes decoded `tile = token`, which produces a grid
 * that looks plausible and is entirely wrong: solid and empty tiles swap, the
 * caverns lose their caves, and the error is invisible until a pathfinder routes
 * the hero through walls. asm/fight.asm `unpack_forward_case0` is explicit —
 * `inc bh` for the count, then `inc si` and `mov bl, [si]` for the tile.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    NavGridError,
    NavGridCache,
    PACKED_MAP_OFFSET,
    decodeTileGrid,
    readMapWidth,
    tileAt,
    tileAtUnwrapped,
    wrapCol,
    wrapRow,
} from '../src/engine/nav/mdt-grid.js';
import { MAP_HEIGHT } from '../src/engine/unpack.js';
import { NAV_MAPS, NAV_MAP_TILES } from '../src/data/nav/nav-maps.js';
import { NAV_TILES } from '../src/data/nav/nav-tiles.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readMdt = (name: string): Uint8Array =>
    new Uint8Array(readFileSync(resolve(REPO, `web/public/game/0/${name}.mdt`)));

/** Assemble a fake MDT image whose packed map holds exactly the given bytes. */
function fakeMdt(mapWidth: number, packed: number[]): Uint8Array {
    const bytes = new Uint8Array(PACKED_MAP_OFFSET + packed.length + 8);
    bytes[2] = mapWidth & 0xff;
    bytes[3] = (mapWidth >> 8) & 0xff;
    bytes.set(packed, PACKED_MAP_OFFSET);
    return bytes;
}

// ── RLE encoders, one per opcode ────────────────────────────────────────────
/** Case 0: count in the token, tile in the FOLLOWING byte. */
const run0 = (count: number, tile: number): number[] => [(count - 1) & 0x3f, tile];
/**
 * Case 1: opcode 01 in the top bits, count in bits 4-5 (+2), tile in bits 0-3
 * (+1). The opcode bits are not optional — without them a short run encodes as
 * case 0 and silently means something else, which is what these helpers are
 * here to make impossible.
 *
 * The 4-bit tile field caps this opcode at tiles 1..16, so the encoder refuses
 * anything larger rather than truncating it into a different tile.
 */
const run1 = (count: number, tile: number): number[] => {
    if (count < 2 || count > 5) throw new RangeError(`case 1 count ${count} out of range 2..5`);
    if (tile < 1 || tile > 16) throw new RangeError(`case 1 tile ${tile} out of range 1..16`);
    return [0x40 | (((count - 2) << 4) & 0x30) | ((tile - 1) & 0x0f)];
};
/** Case 2: a run of empty tiles. */
const run2 = (count: number): number[] => [0x80 | (count & 0x3f)];
/** Case 3: one tile, opcode in the top two bits. */
const single = (tile: number): number[] => [0xc0 | (tile & 0x3f)];

/** Rows a packed byte range covers, per the opcode table. */
function rowsCovered(packed: number[]): number {
    let rows = 0;
    let p = 0;
    while (p < packed.length) {
        const token = packed[p]!;
        switch (token >> 6) {
            case 0: rows += (token & 0x3f) + 1; p += 2; break;
            case 1: rows += ((token >> 4) & 3) + 2; p += 1; break;
            case 2: rows += token & 0x3f; p += 1; break;
            default: rows += 1; p += 1; break;
        }
    }
    return rows;
}

/**
 * Build one column's packed bytes, padded with empty runs to the required 64
 * rows. The format has no end-of-column marker, so a real encoder must always
 * land exactly on 64 — and so must a test fixture.
 */
function col(...runs: number[][]): number[] {
    const out = runs.flat();
    let rows = rowsCovered(out);
    while (rows < MAP_HEIGHT) {
        const n = Math.min(0x3f, MAP_HEIGHT - rows);
        out.push(...run2(n));
        rows += n;
    }
    return out;
}

/** Decode `count` columns of packed bytes. */
const decodeColumns = (columns: number[][], mapId = 0) =>
    decodeTileGrid(fakeMdt(columns.length, columns.flat()), columns.length, mapId);

describe('RLE opcodes', () => {
    it('case 0 reads the tile from the NEXT byte, not the token', () => {
        // token 0x03 -> count 4; the tile is the following byte 0x25.
        const grid = decodeColumns([col(run0(4, 0x25))]);
        expect([...grid.tiles.slice(0, 4)]).toEqual([0x25, 0x25, 0x25, 0x25]);
        // A `tile = token` decoder would have produced 0x03 here instead.
        expect(grid.tiles[0]).not.toBe(0x03);
    });

    it('case 0 can encode tile 0, which a `tile = token` decoder would lose', () => {
        const grid = decodeColumns([col(run0(8, 0))]);
        expect([...grid.tiles.slice(0, 8)]).toEqual(new Array(8).fill(0));
    });

    it('case 0 separates two adjacent runs by token value', () => {
        // Two runs whose tokens differ but whose tiles are equal is impossible to
        // write by hand, so use distinct tiles to prove the pairing is positional.
        const grid = decodeColumns([col(run0(3, 0x0a), run0(2, 0x0b))]);
        expect([...grid.tiles.slice(0, 5)]).toEqual([0x0a, 0x0a, 0x0a, 0x0b, 0x0b]);
    });

    it('case 1 packs the count into bits 4-5 and the tile into bits 0-3, offset by one', () => {
        // tile 1 is encoded as 0, so count 2 tile 1 -> (0 << 4) | 0 = 0x00.
        const grid = decodeColumns([col(run1(2, 1))]);
        expect([...grid.tiles.slice(0, 2)]).toEqual([1, 1]);
        // count 5 tile 16 -> (3 << 4) | 15 = 0x3F
        const grid2 = decodeColumns([col(run1(5, 16))]);
        expect([...grid2.tiles.slice(0, 5)]).toEqual(new Array(5).fill(16));
    });

    it('case 2 is a run of empty tiles', () => {
        const grid = decodeColumns([col(run2(63))]);
        expect([...grid.tiles.slice(0, 63)]).toEqual(new Array(63).fill(0));
    });

    it('case 3 is a single tile, opcode included in the low six bits', () => {
        const grid = decodeColumns([col(single(0x3f), single(0x01))]);
        expect(grid.tiles[0]).toBe(0x3f);
        expect(grid.tiles[1]).toBe(0x01);
    });

    it('mixes opcodes within one column', () => {
        // Tile 0x12 exceeds case 1's 4-bit field, so use 0x0c here; run1 throws
        // rather than truncating.
        const grid = decodeColumns([col(run0(10, 0x08), run2(20), run1(5, 0x0c), single(0x33))]);
        expect(grid.tiles[0]).toBe(0x08);
        expect(grid.tiles[9]).toBe(0x08);
        expect(grid.tiles[10]).toBe(0);
        expect(grid.tiles[29]).toBe(0);
        expect(grid.tiles[30]).toBe(0x0c);
        expect(grid.tiles[34]).toBe(0x0c);
        expect(grid.tiles[35]).toBe(0x33);
        expect(grid.tiles.length).toBe(MAP_HEIGHT);
    });

    it('refuses to encode a tile or count the opcode cannot hold', () => {
        expect(() => run1(5, 0x12)).toThrow(/out of range/);
        expect(() => run1(7, 4)).toThrow(/out of range/);
    });

    it('pads a short column with empty tiles, as a real encoder must', () => {
        expect(rowsCovered([...run0(10, 0x08)])).toBe(10);
        expect(rowsCovered(col(run0(10, 0x08)))).toBe(MAP_HEIGHT);
        const grid = decodeColumns([col(run0(10, 0x08))]);
        expect([...grid.tiles.slice(10, 15)]).toEqual(new Array(5).fill(0));
    });

    it('throws rather than reading past the image', () => {
        // A column that stops at 10 rows with nothing left to decode.
        expect(() => decodeTileGrid(fakeMdt(4, run0(10, 0x08)), 4, 7))
            .toThrow(/ran past the end/);
    });
});

describe('grid geometry', () => {
    it('is row-major, so row * mapWidth + col indexes a cell', () => {
        const grid = decodeColumns([
            col(run0(64, 0x11)), col(run0(64, 0x22)), col(run0(64, 0x33)),
        ]);
        for (let row = 0; row < MAP_HEIGHT; row++) {
            expect(tileAtUnwrapped(grid, 0, row)).toBe(0x11);
            expect(tileAtUnwrapped(grid, 1, row)).toBe(0x22);
            expect(tileAtUnwrapped(grid, 2, row)).toBe(0x33);
        }
    });

    it('reads mapWidth from the header when not given', () => {
        const bytes = readMdt('mp10');
        expect(readMapWidth(bytes)).toBe(240);
        const grid = decodeTileGrid(bytes, 0, 0);
        expect(grid.mapWidth).toBe(240);
        expect(grid.tiles.length).toBe(240 * MAP_HEIGHT);
    });

    it('rejects a map width of zero', () => {
        expect(() => readMapWidth(new Uint8Array(64))).toThrow(NavGridError);
    });

    it('wraps both axes, because a cavern is a cylinder', () => {
        expect(wrapRow(0)).toBe(0);
        expect(wrapRow(64)).toBe(0);
        expect(wrapRow(-1)).toBe(63);
        expect(wrapRow(130)).toBe(2);
        expect(wrapCol(0, 10)).toBe(0);
        expect(wrapCol(10, 10)).toBe(0);
        expect(wrapCol(-1, 10)).toBe(9);
        expect(wrapCol(13, 10)).toBe(3);
    });

    it('tileAt wraps, tileAtUnwrapped does not', () => {
        const grid = decodeColumns([
            col(run0(64, 0x0a)), col(run0(64, 0x0b)),
            col(run0(64, 0x0c)), col(run0(64, 0x0d)),
        ]);
        expect(tileAt(grid, 4, 0)).toBe(0x0a);       // column 4 wraps to 0
        expect(tileAt(grid, -1, 0)).toBe(0x0d);      // column -1 wraps to 3
        expect(tileAt(grid, 0, -1)).toBe(0x0a);      // row -1 wraps to 63
        expect(tileAtUnwrapped(grid, 1, 0)).toBe(0x0b);
    });
});

describe('all 31 shipped caverns', () => {
    it('decodes to the size the generated data declares', () => {
        for (const meta of NAV_MAPS) {
            const grid = decodeTileGrid(readMdt(meta.nameKey), 0, meta.id);
            expect(grid.mapWidth, meta.nameKey).toBe(meta.mapWidth);
            expect(grid.tiles.length, meta.nameKey).toBe(NAV_MAP_TILES[meta.id]);
        }
    });

    it('uses only 6-bit tile ids', () => {
        for (const meta of NAV_MAPS) {
            const grid = decodeTileGrid(readMdt(meta.nameKey), 0, meta.id);
            for (const t of grid.tiles) {
                expect(t, `${meta.nameKey} has a tile above 0x3F`).toBeLessThan(0x40);
            }
        }
    });

    it('agrees with the extractor byte for byte', () => {
        // The extractor and the runtime must not drift: one decodes at build time,
        // the other in the browser, from the same bytes but separate code.
        for (const meta of NAV_MAPS) {
            const grid = decodeTileGrid(readMdt(meta.nameKey), 0, meta.id);
            const rows = decodeForComparison(meta.nameKey);
            for (let i = 0; i < grid.tiles.length; i++) {
                if (grid.tiles[i] !== rows[i]) {
                    throw new Error(`${meta.nameKey}: tile ${i} differs (${grid.tiles[i]} vs ${rows[i]})`);
                }
            }
        }
    });

    it('places a plausible amount of solid and open space in every cavern', () => {
        // A coarse sanity band only. The sharp guards are the byte-for-byte
        // comparison against the extractor above and the rope test below; this
        // one exists to catch a wholesale mis-decode, which would put every
        // ratio far outside any plausible range. Boss arenas are genuinely
        // mostly open (mp5d is 9% solid), so the band has to admit them.
        for (const meta of NAV_MAPS) {
            const grid = decodeTileGrid(readMdt(meta.nameKey), 0, meta.id);
            const passable = new Set(NAV_TILES[meta.id]!.passable);
            let solid = 0;
            for (const t of grid.tiles) if (!passable.has(t)) solid++;
            const ratio = solid / grid.tiles.length;
            expect(ratio, `${meta.nameKey} solid ratio`).toBeGreaterThan(0.02);
            expect(ratio, `${meta.nameKey} solid ratio`).toBeLessThan(0.98);
        }
    });

    it('separates the 8 boss arenas from every other cavern', () => {
        // Boss arenas are built rooms with no vertical traversal; every other map
        // has rope tiles. This is a sharp, data-backed split — unlike "arenas are
        // mostly open", which is false here: mp1d is 88% solid and mp5d is 9%.
        const arenas = NAV_MAPS.filter((m) => m.isBossArena);
        expect(arenas.map((m) => m.nameKey)).toEqual([
            'mp1d', 'mp2d', 'mp3d', 'mp4d', 'mp5d', 'mp6d', 'mp7d', 'mp8d',
        ]);
        for (const meta of arenas) {
            const grid = decodeTileGrid(readMdt(meta.nameKey), 0, meta.id);
            const ropes = [...grid.tiles].filter((t) => t === 1 || t === 2).length;
            expect(ropes, `${meta.nameKey} is an arena and has no rope`).toBe(0);
        }
        for (const meta of NAV_MAPS.filter((m) => !m.isBossArena)) {
            const grid = decodeTileGrid(readMdt(meta.nameKey), 0, meta.id);
            const ropes = [...grid.tiles].filter((t) => t === 1 || t === 2).length;
            expect(ropes, `${meta.nameKey} rope tiles`).toBeGreaterThan(0);
        }
    });

    it('keeps the doorless set larger than the arena set', () => {
        // mp73 (Paguro's hut), mp90 and mpa0 are doorless but are not arenas:
        // they are reached by a warp building or the ending, not by a door.
        const doorless = NAV_MAPS.filter((m) => m.isDoorless).map((m) => m.nameKey);
        expect(doorless).toEqual([
            'mp1d', 'mp2d', 'mp3d', 'mp4d', 'mp5d', 'mp6d',
            'mp73', 'mp7d', 'mp8d', 'mp90', 'mpa0',
        ]);
        const arenas = new Set(NAV_MAPS.filter((m) => m.isBossArena).map((m) => m.nameKey));
        expect(doorless.filter((n) => !arenas.has(n))).toEqual(['mp73', 'mp90', 'mpa0']);
    });
});

describe('NavGridCache', () => {
    const mdt = (): Uint8Array => readMdt('mp10');

    it('decodes once and returns the same grid afterwards', () => {
        const cache = new NavGridCache();
        expect(cache.size).toBe(0);
        const first = cache.load(0, mdt());
        expect(cache.size).toBe(1);
        expect(cache.get(0)).toBe(first);
        const second = cache.load(0, mdt());
        expect(second).toBe(first);
        expect(cache.size).toBe(1);
    });

    it('keys by map id, so two maps do not collide', () => {
        const cache = new NavGridCache();
        const a = cache.load(0, mdt());
        const b = cache.load(29, readMdt('mp90'));
        expect(a.mapWidth).toBe(240);
        expect(b.mapWidth).toBe(42);
        expect(cache.size).toBe(2);
    });

    it('drops and clears', () => {
        const cache = new NavGridCache();
        cache.load(0, mdt());
        cache.load(1, readMdt('mp1d'));
        expect(cache.has(0)).toBe(true);
        cache.drop(0);
        expect(cache.has(0)).toBe(false);
        expect(cache.size).toBe(1);
        cache.clear();
        expect(cache.size).toBe(0);
        expect(cache.get(1)).toBeUndefined();
    });

    it('lets a caller override the width', () => {
        const cache = new NavGridCache();
        const grid = cache.load(0, mdt(), 240);
        expect(grid.mapWidth).toBe(240);
    });
});

/** Decode with the build-time extractor, which lives outside web/. */
function decodeForComparison(name: string): Uint8Array {
    const toolsRequire = createRequire(import.meta.url);
    const { decodePackedMap } = toolsRequire('../../tools/navlib/mdt.mjs') as {
        decodePackedMap(bytes: Uint8Array, mapWidth: number): Uint8Array;
    };
    const bytes = readMdt(name);
    return decodePackedMap(bytes, bytes[2]! | (bytes[3]! << 8));
}


/**
 * Independent check against WORK/LEVELS.
 *
 * WORK/LEVELS/MP*.TXT is a human-readable dump of the same maps, each tile stored
 * as `chr(tile + 0x20)` so it can be viewed as text. It is a completely separate
 * encode of the same source data, so agreeing with it is the strongest available
 * evidence that the RLE decoder is right — it would have to be wrong in exactly
 * the same way twice.
 *
 * Two of the 31 dumps are damaged, and the damage is characterised below rather
 * than tolerated blindly, so a *different* bad dump fails this test too:
 *
 *   mp10  30 rows truncated on the right. They match from column 0, so they are
 *         short, not shifted, and nothing in them is compared — the one hole in
 *         this cross-check, and it is counted rather than passed over
 *   mp90  9 characters above the 6-bit range, all 'h' in one 3x3 block of empty
 *         space at columns 8-10, rows 11-13; no cell is actually wrong
 *
 * `mp80` used to be a third: a route drawn over the map in `< ^ > v`, which is not
 * an independent encode at all. It has been repaired, so it is now compared cell
 * for cell like the other 29.
 */
describe('agreement with the WORK/LEVELS text dumps', () => {
    const LEVELS = resolve(REPO, 'WORK/LEVELS');
    const SHIFT = 0x20;
    const available = existsSync(LEVELS);

    interface Verdict {
        readonly name: string;
        readonly compared: number;
        readonly mismatched: number;
        readonly outOfRange: number;
        readonly truncatedRows: number;
        readonly badPositions: readonly string[];
    }

    /** Read a dump: split on LF, drop one stray CR per row. */
    function dumpRows(nameKey: string): string[] {
        const raw = readFileSync(resolve(LEVELS, `${nameKey.toUpperCase()}.TXT`), 'latin1').split('\n');
        while (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
        return raw.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
    }

    function verifyAll(): Verdict[] {
        const verdicts: Verdict[] = [];
        for (const meta of NAV_MAPS) {
            const text = resolve(LEVELS, `${meta.nameKey.toUpperCase()}.TXT`);
            if (!existsSync(text)) continue;
            const rows = dumpRows(meta.nameKey);
            const grid = decodeTileGrid(readMdt(meta.nameKey), 0, meta.id);
            let compared = 0;
            let mismatched = 0;
            let outOfRange = 0;
            let truncatedRows = 0;
            const badPositions: string[] = [];
            for (let row = 0; row < rows.length; row++) {
                if (rows[row]!.length < meta.mapWidth) {
                    truncatedRows++;
                    continue;
                }
                for (let col = 0; col < meta.mapWidth; col++) {
                    const code = rows[row]!.charCodeAt(col) - SHIFT;
                    if (code < 0 || code > 0x3f) {
                        outOfRange++;
                        badPositions.push(`(${col},${row})`);
                        continue;
                    }
                    compared++;
                    if (grid.tiles[row * meta.mapWidth + col] !== code) {
                        mismatched++;
                        badPositions.push(`(${col},${row})`);
                    }
                }
            }
            verdicts.push({
                name: meta.nameKey, compared, mismatched, outOfRange, truncatedRows, badPositions,
            });
        }
        return verdicts;
    }

    // WORK/LEVELS is a research folder rather than a build input, so a checkout
    // without it should skip this block instead of failing.
    it.skipIf(!available)('covers all 31 maps', () => {
        expect(verifyAll()).toHaveLength(31);
    });

    it.skipIf(!available)('matches every undamaged dump on every cell', () => {
        // Every cell of every row of 29 dumps. mp10 has 30 short rows whose tails
        // are not compared at all, and mp90 has nine characters outside the
        // encoding, so neither is a clean map even though every cell either of them
        // *does* compare matches.
        const whole = verifyAll().filter((v) => v.badPositions.length === 0 && v.truncatedRows === 0);
        expect(whole).toHaveLength(29);
        const names = whole.map((v) => v.name);
        for (const altered of ['mp10', 'mp90']) {
            expect(names).not.toContain(altered);
        }
    });

    it.skipIf(!available)('compares the whole cavern set, not a sample', () => {
        const total = verifyAll().reduce((a, v) => a + v.compared, 0);
        // 31 maps x 64 rows. A loose lower bound stops the test passing
        // vacuously if the dumps stop decoding.
        expect(total).toBeGreaterThan(298000);
    });

    it.skipIf(!available)('confines every discrepancy to the two altered dumps', () => {
        const damaged = verifyAll()
            .filter((v) => v.badPositions.length > 0 || v.truncatedRows > 0)
            .map((v) => v.name);
        expect(damaged).toEqual(['mp10', 'mp90']);
    });

    it.skipIf(!available)('MP10.TXT compares clean over the rows it has', () => {
        // It used to lose the tail of 30 rows *and* carry five characters above the
        // 6-bit range and four wrong cells. The bad characters are gone; the short
        // rows are not, so they are the whole of its remaining damage.
        const v = verifyAll().find((x) => x.name === 'mp10')!;
        expect(v.outOfRange).toBe(0);
        expect(v.mismatched).toBe(0);
        expect(v.truncatedRows).toBe(30);
    });

    it.skipIf(!available)('shows that MP10 rows are truncated, not shifted', () => {
        // A row that lost its tail still matches from column 0; a shifted row would
        // need an offset to line up. This rules out a layout mismatch as the cause
        // of the short rows.
        const rows = dumpRows('mp10');
        const grid = decodeTileGrid(readMdt('mp10'), 240, 0);
        const short: { row: number; line: string }[] = [];
        for (let row = 0; row < rows.length; row++) {
            if (rows[row]!.length > 0 && rows[row]!.length < 240) short.push({ row, line: rows[row]! });
        }
        expect(short).toHaveLength(30);
        for (const { row, line } of short) {
            let comparable = 0;
            let matched = 0;
            for (let col = 0; col < line.length; col++) {
                const code = line.charCodeAt(col) - SHIFT;
                if (code < 0 || code > 0x3f) continue;
                comparable++;
                if (grid.tiles[row * 240 + col] === code) matched++;
            }
            expect(matched, `row ${row} of ${line.length} chars`).toBe(comparable);
        }
    });

    it.skipIf(!available)('characterises the damage in MP90.TXT', () => {
        const v = verifyAll().find((x) => x.name === 'mp90')!;
        expect(v.truncatedRows).toBe(0);
        expect(v.mismatched).toBe(0);
        expect(v.outOfRange).toBe(9);
        // All nine sit in one 3x3 block of empty space.
        expect([...v.badPositions].sort()).toEqual([
            '(10,11)', '(10,12)', '(10,13)',
            '(8,11)', '(8,12)', '(8,13)',
            '(9,11)', '(9,12)', '(9,13)',
        ]);
    });

});
