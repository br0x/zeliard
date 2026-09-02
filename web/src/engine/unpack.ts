/**
 * unpack.ts — TS port of src/unpack.c (Stage 6b): the MDT packed-map RLE
 * expander that fills the dungeon proximity map.
 *
 * Semantics are ported 1:1 from the C (itself a reconstruction of
 * Fight.asm), including its quirks:
 *  - pointers are uint16 and wrap at 0x10000;
 *  - columns intentionally tolerate overshoot past 64 rows (writes spill
 *    into the next column exactly like the original);
 *  - the horizontal-scroll helpers keep the two packed-data cursors
 *    (prox-left/prox-right) that dungeon.c's hero_moves_left/right consume.
 *
 * All addresses are g_mem-relative, matching memory.ts constants.
 */

import {
    ADDR_MDT,
    ADDR_PROXIMITY_MAP,
    ADDR_VIEWPORT_LEFT_TOP,
    ADDR_VIEWPORT_TOP_ROW,
} from '../core/memory.js';

import { memRead8, memRead16 } from '../core/ts-memory.js';

export const PROXIMITY_MAP_WIDTH = 36;
export const MAP_HEIGHT = 64;
/** Packed map data offset inside the MDT image (zeliard.h ADDR_PACKED_MAP_START). */
export const ADDR_PACKED_MAP_START = 0xc01b;
/** WORD pointing behind the last byte of packed map (zeliard.h 0xC019). */
export const ADDR_PACKED_MAP_END_PTR = 0xc019;
const ADDR_PROXIMITY_MAP_LEFT_COL = 0x80;

export interface UnpackStep {
    ptr: number;
    tile: number;
    count: number;
}

/** Decode one RLE segment going forward (Fight.asm unpack_step_forward). */
export function unpackStepForward(mem: Uint8Array, ptr: number): UnpackStep {
    const byte = memRead8(mem, ptr);
    ptr = (ptr + 1) & 0xffff;
    switch (byte >> 6) {
        case 0: {
            const tile = memRead8(mem, ptr);
            ptr = (ptr + 1) & 0xffff;
            return { ptr, tile, count: (byte + 1) & 0xff };
        }
        case 1:
            return { ptr, tile: ((byte & 0x0f) + 1) & 0xff, count: ((byte & 0x30) >> 4) + 2 };
        case 2:
            return { ptr, tile: 0, count: byte & 0x3f };
        default:
            return { ptr, tile: byte & 0x3f, count: 1 };
    }
}

/** Decode one RLE segment going backward (Fight.asm unpack_step_backward). */
export function unpackStepBackward(mem: Uint8Array, ptr: number): UnpackStep {
    const byte = memRead8(mem, ptr);
    ptr = (ptr - 1) & 0xffff;
    switch (byte >> 6) {
        case 0: {
            const tile = byte;
            const count = (memRead8(mem, ptr) + 1) & 0xff;
            ptr = (ptr - 1) & 0xffff;
            return { ptr, tile, count };
        }
        case 1:
            return { ptr, tile: ((byte & 0x0f) + 1) & 0xff, count: ((byte & 0x30) >> 4) + 2 };
        case 2:
            return { ptr, tile: 0, count: byte & 0x3f };
        default:
            return { ptr, tile: byte & 0x3f, count: 1 };
    }
}

/**
 * Unpack one 64-row column into the proximity map, column-major
 * (dest[0], dest[36], …). Returns the packed pointer after the column.
 */
export function unpackColumnForward(
    mem: Uint8Array,
    packedPtr: number,
    destAddr: number,
): number {
    let row = 0;
    let ptr = packedPtr;
    // NOTE: dest persists across segments (C keeps the pointer across the
    // outer loop); resetting per segment was the Stage 6b port bug.
    let dest = destAddr;
    while (row < MAP_HEIGHT) {
        const step = unpackStepForward(mem, ptr);
        ptr = step.ptr;
        row += step.count;
        for (let n = step.count; n > 0; n--) {
            mem[dest] = step.tile;
            dest += PROXIMITY_MAP_WIDTH;
        }
    }
    return ptr;
}

/** Backward variant used when scrolling left (dungeon.c hero_moves_left). */
export function unpackColumnBackward(
    mem: Uint8Array,
    packedPtr: number,
    destAddr: number,
): number {
    let row = 0;
    let ptr = packedPtr;
    let dest = destAddr;
    while (row < MAP_HEIGHT) {
        const step = unpackStepBackward(mem, ptr);
        ptr = step.ptr;
        row += step.count;
        for (let n = step.count; n > 0; n--) {
            mem[dest] = step.tile;
            dest -= PROXIMITY_MAP_WIDTH;
        }
    }
    return ptr;
}

/** Skip one full 64-row column of packed data without writing. */
export function skipColumnForward(mem: Uint8Array, packedPtr: number): number {
    let ptr = packedPtr;
    let rows = 0;
    do {
        const step = unpackStepForward(mem, ptr);
        ptr = step.ptr;
        rows += step.count;
    } while (rows < MAP_HEIGHT);
    return ptr;
}

/**
 * The two packed-data cursors maintained across incremental scrolls
 * (C globals packed_map_ptr_for_prox_left/right).
 */
export const unpackCursors = {
    proxLeft: 0,
    proxRight: 0,
};

/** Test/parity helper: pin both cursors to a known packed offset. */
export function resetUnpackCursors(addr: number): void {
    unpackCursors.proxLeft = addr;
    unpackCursors.proxRight = addr;
}

/**
 * Full proximity-map expansion — port of unpack_map(). Reads the current
 * left-column/viewport state from g_mem and writes the 36×64 tile window
 * plus the viewport-left-top word. Updates the shared scroll cursors.
 */
export function unpackMap(mem: Uint8Array): void {
    const cx = memRead16(mem, ADDR_PROXIMITY_MAP_LEFT_COL);

    let ptr = ADDR_PACKED_MAP_START;
    for (let x = 0; x < cx; x++) {
        ptr = skipColumnForward(mem, ptr);
    }
    unpackCursors.proxLeft = ptr;

    let ax = cx;
    const mapWidth = memRead16(mem, ADDR_MDT + 2);

    for (let col = 0; col < PROXIMITY_MAP_WIDTH; col++) {
        ptr = unpackColumnForward(mem, ptr, ADDR_PROXIMITY_MAP + col);
        ax = (ax + 1) & 0xffff;
        if (ax === mapWidth) {
            ptr = ADDR_PACKED_MAP_START;
            ax = 0;
        }
    }

    const endAddr = ax === 0 ? memRead16(mem, ADDR_PACKED_MAP_END_PTR) : ptr;
    unpackCursors.proxRight = (endAddr - 1) & 0xffff;
    const vlt = ADDR_PROXIMITY_MAP + (memRead8(mem, ADDR_VIEWPORT_TOP_ROW) & 0x3f) * PROXIMITY_MAP_WIDTH;
    mem[ADDR_VIEWPORT_LEFT_TOP] = vlt & 0xff;
    mem[ADDR_VIEWPORT_LEFT_TOP + 1] = (vlt >> 8) & 0xff;
}
