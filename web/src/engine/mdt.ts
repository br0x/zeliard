/**
 * mdt.ts — TS port of the MDT parsing the bridge does over g_mem (Stage 6a).
 *
 * Operates on the RAW MDT file bytes instead of the wasm linear-memory
 * window. The two coordinate systems differ by a constant: header pointer
 * fields are seg0-absolute (0xC000-based, see memory.ts TownMdtHeader note),
 * so file offset = absolute address − MDT_BASE.
 *
 * Semantics are ported 1:1 from bridge.ts's getters (themselves ported from
 * the C/asm readers); tests/parse-mdt-parity.test.ts verifies them against
 * the wasm-derived values for every .mdt asset shipped in public/game.
 */

import type { CavernMdtHeader, TownMdtHeader } from '../wasm/memory.js';

/** Absolute seg0 address where the MDT image is placed in g_mem. */
export const MDT_BASE = 0xc000;

function u16(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/**
 * Read a Pascal string (length byte + chars) from a "name info" structure
 * pointed to by a seg0-absolute pointer; skips `metaSkip` metadata bytes.
 * Mirrors bridge getNameFromNameInfo incl. the backslash remap.
 */
function readPascalName(bytes: Uint8Array, absPointer: number): string {
    let offset = absPointer - MDT_BASE;
    const length = bytes[offset] ?? 0;
    let name = '';
    for (let i = 0; i < length; i++) {
        name += String.fromCharCode(bytes[offset + 1 + i] ?? 0).replace('\\', '\u02BC');
    }
    return name;
}

export function parseTownMdtHeader(bytes: Uint8Array): TownMdtHeader {
    return {
        town_descriptor_offset: u16(bytes, 0),
        map_width: u16(bytes, 2),
        town_name_offset: u16(bytes, 4),
        town_id: bytes[6] ?? 0,
        town_transition_table: u16(bytes, 7),
        doors_offset: u16(bytes, 9),
        dungeon_entrance_table: u16(bytes, 0x0b),
        npc_conversations_offset: u16(bytes, 0x0d),
        npc_array_offset: u16(bytes, 0x0f),
        npc_patrol_boundaries: u16(bytes, 0x11),
        word_c015: u16(bytes, 0x15),
        town_tiles: u16(bytes, 0x17),
    };
}

export function parseCavernMdtHeader(bytes: Uint8Array): CavernMdtHeader {
    return {
        map_width: u16(bytes, 2),
        vert_platforms_offset: u16(bytes, 4),
        air_streams_offset: u16(bytes, 6),
        horiz_platforms_offset: u16(bytes, 8),
        doors_offset: u16(bytes, 10),
        items_check_offset: u16(bytes, 12),
        cavern_name_offset: u16(bytes, 14),
        monsters_offset: u16(bytes, 16),
    };
}

export function getTownName(bytes: Uint8Array): string {
    // Add 3 to skip rendering-info metadata and point at the Pascal length.
    return readPascalName(bytes, u16(bytes, 4) + 3);
}

export function getCavernName(bytes: Uint8Array): string {
    return readPascalName(bytes, u16(bytes, 0x0e) + 3);
}

/**
 * Music track id: first header word points at the mdt_descriptor;
 * track id is bits 5..1 of its byte 0. Returns '' when the pointer is
 * missing (mirrors the bridge's uninitialized quirk).
 */
export function getMusicTrackId(bytes: Uint8Array): number | '' {
    const descriptorOffset = u16(bytes, 0);
    const offset = descriptorOffset - MDT_BASE;
    if (offset < 0 || offset >= bytes.length) return '';
    return ((bytes[offset] ?? 0) >> 1) & 0x0f;
}

/** @returns 00 -> ympd, 01 -> ckpd; or '' when the descriptor is absent. */
export function getTownBackgroundType(bytes: Uint8Array): number | '' {
    const offset = u16(bytes, 0);
    if (offset === 0) return '';
    return bytes[offset - MDT_BASE + 3] ?? 0;
}

/** @returns 00 -> cpat, 01 -> mpat, 02 -> dpat; or '' when absent. */
export function getTownPatId(bytes: Uint8Array): number | '' {
    const offset = u16(bytes, 0);
    if (offset === 0) return '';
    return bytes[offset - MDT_BASE + 4] ?? 0;
}
