/**
 * mdt.mjs — MDT (cavern map) reader for the pathfinder build-time extractor.
 *
 * Layout of a dungeon MDT, loaded at seg0 0xC000 (see asm/dungeon.inc:136-153
 * and tools/MDTViewer/core/decoder.py:5-30):
 *
 *   +0x00 word  descriptor
 *   +0x02 word  map width
 *   +0x04 word  vertical platforms   ptr (3-byte entries, 0xFFFF sentinel)
 *   +0x06 word  collapsing platforms ptr (3-byte entries, 0xFFFF sentinel)
 *   +0x08 word  horizontal platforms ptr (7-byte entries, 0xFFFF sentinel)
 *   +0x0A word  doors                ptr (12-byte entries, 0xFFFF sentinel)
 *   +0x0C word  accomplished items   ptr
 *   +0x0E word  cavern name
 *   +0x10 word  monsters             ptr (16-byte entries, 0xFFFF sentinel)
 *   +0x12 byte  cavern level
 *   +0x13 word  tear X
 *   +0x15 byte  tear Y
 *   +0x17 word  signs
 *   +0x19 word  packed map end
 *   +0x1B       packed map data — column-major RLE, 64 rows per column
 *
 * All pointer fields are seg0-absolute (the MDT occupies 0xC000..0xFFFF), so
 * file offset = pointer - 0xC000.
 */

/** Absolute g_mem address the MDT image is loaded at. */
export const MDT_BASE = 0xc000;

/** Rows in every cavern map. Fixed at 64 by the format. */
export const MAP_HEIGHT = 64;

export class MdtError extends Error {}

function word(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8)) & 0xffff;
}

/** Convert a seg0-absolute pointer to a file offset, or null if unusable. */
export function ptrToOffset(ptr, byteLength) {
    if (ptr === 0) return null;
    const off = ptr - MDT_BASE;
    if (off < 0 || off + 1 > byteLength) return null;
    return off;
}

/** Parse the 19-byte cavern header. */
export function readMdtHeader(bytes) {
    return {
        mapWidth: word(bytes, 0x02),
        vertPlatforms: word(bytes, 0x04),
        collapsingPlatforms: word(bytes, 0x06),
        horizPlatforms: word(bytes, 0x08),
        doors: word(bytes, 0x0a),
        itemsCheck: word(bytes, 0x0c),
        cavernName: word(bytes, 0x0e),
        monsters: word(bytes, 0x10),
        cavernLevel: bytes[0x12] & 0xff,
        tearX: word(bytes, 0x13),
        tearY: bytes[0x15] & 0xff,
        signs: word(bytes, 0x17),
        packedMapEnd: word(bytes, 0x19),
    };
}

/**
 * Expand the packed tile grid to a full mapWidth x 64 array, row-major.
 *
 * Mirrors unpack_step_forward / unpack_column_forward in asm/fight.asm:2219-2266
 * and engine/unpack.ts:39-102. Columns intentionally tolerate overshoot past 64
 * rows exactly as the original does; the excess is discarded here because the
 * extractor wants a clean rectangular grid.
 *
 * @param bytes raw MDT image
 * @param mapWidth from the header
 * @returns Uint8Array of length mapWidth * 64, index = row * mapWidth + col
 */
export function decodePackedMap(bytes, mapWidth) {
    if (mapWidth <= 0) throw new MdtError(`mapWidth must be positive, got ${mapWidth}`);
    const tiles = new Uint8Array(mapWidth * MAP_HEIGHT);
    let p = 0x1b;
    for (let col = 0; col < mapWidth; col++) {
        let row = 0;
        while (row < MAP_HEIGHT) {
            const b = bytes[p];
            if (b === undefined) throw new MdtError(`packed map overran at col ${col} row ${row}`);
            let tile;
            let count;
            switch (b >> 6) {
                case 0:
                    tile = bytes[p + 1] & 0xff;
                    count = (b & 0x3f) + 1;
                    p += 2;
                    break;
                case 1:
                    tile = (b & 0x0f) + 1;
                    count = ((b >> 4) & 3) + 2;
                    p += 1;
                    break;
                case 2:
                    tile = 0;
                    count = b & 0x3f;
                    p += 1;
                    break;
                default:
                    tile = b & 0x3f;
                    count = 1;
                    p += 1;
                    break;
            }
            for (let i = 0; i < count && row < MAP_HEIGHT; i++, row++) {
                tiles[row * mapWidth + col] = tile;
            }
        }
    }
    return tiles;
}

/**
 * 12-byte door records, 0xFFFF-terminated.
 *
 * Fields follow asm/dungeon.inc:32-39 and engine/dungeon-doors.ts:83-118.
 * `bound` is the offset of the next table in the file and exists purely to stop
 * a malformed list from running into unrelated data.
 */
export function readDoors(bytes, doorsPtr, bound) {
    const start = ptrToOffset(doorsPtr, bytes.length);
    if (start === null) return [];
    const out = [];
    for (let i = start; i + 11 < (bound ?? bytes.length); i += 12) {
        const x0 = word(bytes, i);
        if (x0 === 0xffff) break;
        const y0 = bytes[i + 2] & 0xff;
        const flags = bytes[i + 3] & 0xff;
        const destMapIdRaw = bytes[i + 4] & 0xff;
        const x1 = word(bytes, i + 5);
        const y1 = bytes[i + 7] & 0xff;
        const features = bytes[i + 8] & 0xff;
        out.push({
            x0,
            y0,
            flags,
            open: (flags & 0x80) !== 0,
            exitFacesLeft: (flags & 0x40) !== 0,
            color: flags & 0x07,
            /** Raw d_place_map_id byte. Bit 7 is never set in the shipped files. */
            destMapIdRaw,
            destMapId: destMapIdRaw & 0x7f,
            x1,
            y1,
            /** y1 === 0xFF means the door leads to a town (dungeon-doors.ts:250). */
            toTown: y1 === 0xff,
            needsLionKey: (features & 0x01) !== 0,
            rokademo: (features & 0x80) !== 0,
            features,
        });
    }
    return out;
}

/** 3-byte `{x: word, y: byte}` entries — vertical and collapsing platforms. */
export function readVerticalPlatforms(bytes, ptr, bound) {
    const start = ptrToOffset(ptr, bytes.length);
    if (start === null) return [];
    const out = [];
    for (let i = start; i + 2 < (bound ?? bytes.length); i += 3) {
        const x = word(bytes, i);
        if (x === 0xffff) break;
        out.push({ x, y: bytes[i + 2] & 0x3f });
    }
    return out;
}

/**
 * 7-byte horizontal-platform entries (dungeon-platforms.ts:12-18).
 *
 *   +0 word x_and_flags — bits 15-14 speed (0 frozen, 1 every other tick,
 *                         2-3 every tick), bits 13-0 current x
 *   +2 byte y_and_flags  — bit 7 direction (1 = moving left), bit 6 paused
 *   +3 word min_x
 *   +5 word max_x
 */
export function readHorizontalPlatforms(bytes, ptr, bound) {
    const start = ptrToOffset(ptr, bytes.length);
    if (start === null) return [];
    const out = [];
    for (let i = start; i + 6 < (bound ?? bytes.length); i += 7) {
        const xAndFlags = word(bytes, i);
        if (xAndFlags === 0xffff) break;
        const yAndFlags = bytes[i + 2] & 0xff;
        out.push({
            x: xAndFlags & 0x3fff,
            speed: (xAndFlags >> 14) & 0x03,
            y: yAndFlags & 0x3f,
            movingLeft: (yAndFlags & 0x80) !== 0,
            paused: (yAndFlags & 0x40) !== 0,
            minX: word(bytes, i + 3),
            maxX: word(bytes, i + 5),
        });
    }
    return out;
}

/** Convenience: header + everything the extractor needs, in one pass. */
export function readCavern(bytes) {
    const header = readMdtHeader(bytes);
    // Bounds come from the header's own pointer order, so a truncated or
    // malformed list can never spill into the next table.
    const bVert = ptrToOffset(header.collapsingPlatforms, bytes.length);
    const bColl = ptrToOffset(header.horizPlatforms, bytes.length);
    const bHoriz = ptrToOffset(header.doors, bytes.length);
    const bDoors = ptrToOffset(header.itemsCheck, bytes.length);

    return {
        header,
        tiles: decodePackedMap(bytes, header.mapWidth),
        doors: readDoors(bytes, header.doors, bDoors ?? bytes.length),
        verticalPlatforms: readVerticalPlatforms(bytes, header.vertPlatforms, bVert ?? bytes.length),
        collapsingPlatforms: readVerticalPlatforms(bytes, header.collapsingPlatforms, bColl ?? bytes.length),
        horizontalPlatforms: readHorizontalPlatforms(bytes, header.horizPlatforms, bHoriz ?? bytes.length),
    };
}
