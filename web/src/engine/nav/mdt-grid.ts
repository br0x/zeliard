/**
 * mdt-grid.ts — decode a cavern's full tile grid from its MDT image.
 *
 * The engine only ever holds a 36-column sliding window of a cavern
 * (`g_mem[0xE000]`, engine/unpack.ts:152-183). A pathfinder needs the whole
 * `mapWidth × 64` grid, so this expands the packed column-major RLE stream at
 * MDT offset 0x1B into a flat row-major array.
 *
 * RLE format, per column, filling 64 rows (asm/fight.asm:2222-2266
 * `unpack_forward_case0`..`unpack_forward_case3`):
 *
 *   token >> 6 == 0   count = token + 1,        tile = NEXT byte     (2 bytes)
 *   token >> 6 == 1   count = (token>>4 & 3)+2, tile = (token & 15)+1 (1 byte)
 *   token >> 6 == 2   count = token & 63,       tile = 0             (1 byte)
 *   token >> 6 == 3   count = 1,                tile = token & 63    (1 byte)
 *
 * The `tile = NEXT byte` reading of case 0 is the one that matters. Decoding
 * `tile = token` instead yields a grid that looks plausible and is entirely
 * wrong — every solid/empty distinction shifts — and the original research
 * prototypes made exactly that mistake. Two assertions guard it:
 * `tests/nav-mdt-grid.test.ts` checks case 0 directly against a hand-built
 * stream, and `tests/nav-data.test.ts` cross-checks the shipped decode.
 *
 * Grid layout is row-major, index `row * mapWidth + col`, so that
 * `row * mapWidth + col` matches the addressing the extractor used and the
 * platform and airflow ranges in nav-platforms.ts / nav-airflows.ts were
 * computed against.
 *
 * Rows wrap mod 64 and columns mod mapWidth — a cavern is a cylinder in both
 * axes — so callers must wrap on access rather than rely on bounds.
 */

import { MAP_HEIGHT, ADDR_PACKED_MAP_START } from '../unpack.js';
import { parseCavernMdtHeader, MDT_BASE } from '../mdt.js';

export class NavGridError extends Error {}

/**
 * Byte offset of the packed map inside the MDT file.
 *
 * `ADDR_PACKED_MAP_START` is the *g_mem* address 0xC01B, where the engine loads
 * the whole image (engine/unpack.ts:28). A raw MDT file is only a few KB, so
 * indexing one with that constant reads past the end immediately — deriving the
 * file offset from MDT_BASE keeps the two tied together and cannot drift.
 */
export const PACKED_MAP_OFFSET = ADDR_PACKED_MAP_START - MDT_BASE;

// 0xC01B - 0xC000 = 0x1B, per asm/dungeon.inc:153 and tools/MDTViewer/core/decoder.py.
if (PACKED_MAP_OFFSET !== 0x1b) {
    throw new NavGridError(
        `packed map offset derived as ${PACKED_MAP_OFFSET}, expected 0x1b — `
        + 'MDT_BASE or ADDR_PACKED_MAP_START changed',
    );
}

/** A decoded cavern tile grid. */
export interface NavTileGrid {
    readonly mapId: number;
    readonly mapWidth: number;
    /** Length `mapWidth * 64`, index `row * mapWidth + col`. */
    readonly tiles: Uint8Array;
}

/** Wrap a row into 0..63. */
export function wrapRow(row: number): number {
    return ((row % MAP_HEIGHT) + MAP_HEIGHT) % MAP_HEIGHT;
}

/** Wrap a column into 0..mapWidth-1. */
export function wrapCol(col: number, mapWidth: number): number {
    return ((col % mapWidth) + mapWidth) % mapWidth;
}

/** Read the map width out of a cavern MDT image. */
export function readMapWidth(bytes: Uint8Array): number {
    const width = parseCavernMdtHeader(bytes).map_width;
    if (!(width > 0)) throw new NavGridError(`cavern MDT reports map width ${width}`);
    return width;
}

/**
 * Expand the packed map into a row-major grid.
 *
 * @param bytes raw cavern MDT image
 * @param mapWidth from the header, or pass 0 to read it
 * @param mapId recorded on the result, for diagnostics and cache keys
 */
export function decodeTileGrid(bytes: Uint8Array, mapWidth = 0, mapId = -1): NavTileGrid {
    const width = mapWidth > 0 ? mapWidth : readMapWidth(bytes);
    const tiles = new Uint8Array(width * MAP_HEIGHT);
    let p = PACKED_MAP_OFFSET;

    for (let col = 0; col < width; col++) {
        let row = 0;
        while (row < MAP_HEIGHT) {
            const token = bytes[p];
            if (token === undefined) {
                throw new NavGridError(
                    `map ${mapId}: packed map ran past the end of the image at column ${col}, row ${row}`,
                );
            }
            let tile: number;
            let count: number;
            switch (token >> 6) {
                case 0:
                    // count from the token, tile from the FOLLOWING byte.
                    tile = bytes[p + 1] ?? 0;
                    count = (token & 0x3f) + 1;
                    p += 2;
                    break;
                case 1:
                    tile = (token & 0x0f) + 1;
                    count = ((token >> 4) & 3) + 2;
                    p += 1;
                    break;
                case 2:
                    tile = 0;
                    count = token & 0x3f;
                    p += 1;
                    break;
                default:
                    tile = token & 0x3f;
                    count = 1;
                    p += 1;
                    break;
            }
            for (let i = 0; i < count && row < MAP_HEIGHT; i++, row++) {
                tiles[row * width + col] = tile;
            }
        }
    }

    return { mapId, mapWidth: width, tiles };
}

/** Tile at a map position, wrapping both axes. */
export function tileAt(grid: NavTileGrid, col: number, row: number): number {
    return grid.tiles[wrapRow(row) * grid.mapWidth + wrapCol(col, grid.mapWidth)]!;
}

/** Same as {@link tileAt} but for a caller that already wrapped. */
export function tileAtUnwrapped(grid: NavTileGrid, col: number, row: number): number {
    return grid.tiles[row * grid.mapWidth + col]!;
}

/**
 * Per-session cache of decoded grids.
 *
 * A pathfinder may touch every map of a component, but the map screen only ever
 * needs a few at once, so this is an unbounded map that the caller is free to
 * clear on a mode change. Decoding is ~0.5 ms for a 20k-tile map, so a miss is
 * cheap enough that eviction is not worth the complexity yet.
 */
export class NavGridCache {
    private readonly grids = new Map<number, NavTileGrid>();

    /** Number of maps currently decoded. */
    get size(): number {
        return this.grids.size;
    }

    has(mapId: number): boolean {
        return this.grids.has(mapId);
    }

    /** Decode `bytes` for `mapId`, or return the cached grid. */
    load(mapId: number, bytes: Uint8Array, mapWidth = 0): NavTileGrid {
        const cached = this.grids.get(mapId);
        if (cached) return cached;
        const grid = decodeTileGrid(bytes, mapWidth, mapId);
        this.grids.set(mapId, grid);
        return grid;
    }

    /** Return a cached grid, or undefined if the map has not been decoded. */
    get(mapId: number): NavTileGrid | undefined {
        return this.grids.get(mapId);
    }

    /** Drop one map, e.g. when leaving a component. */
    drop(mapId: number): void {
        this.grids.delete(mapId);
    }

    clear(): void {
        this.grids.clear();
    }
}
