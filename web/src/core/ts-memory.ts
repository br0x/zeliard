/**
 * ts-memory.ts — TS-owned game memory buffer.
 *
 * The engine modules operate on a plain Uint8Array passed as parameter `g`.
 * This module owns that buffer and provides the accessor functions that
 * main.ts, renderers, and UI modules consume.
 */

import {
    MEM_SAVE_DATA,
    ADDR_MDT,
    SEG1_BASE,
    REACH_TABLE_OFFSET,
    REACH_LISTS_OFFSET,
    ADDR_TRAJECTORIES,
    ADDR_MONSTER_XP_TABLE,
    ADDR_MONSTER_DAMAGE_TABLE,
} from './memory.js';

/** Size of g_mem in bytes (64KB × 4 segments, matching zeliard.h). */
export const GMEM_SIZE = 0x40000;

/** The game memory buffer — 256KB Uint8Array, zeroed at init. */
export const g_mem = new Uint8Array(GMEM_SIZE);

/** Accessor: returns the raw g_mem buffer. */
export function getGmem(): Uint8Array {
    return g_mem;
}

/** Zero the entire game memory buffer. Replaces wasm_town_init's memset. */
export function zeroMemory(): void {
    g_mem.fill(0);
}

/**
 * Load a 256-byte save state into g_mem[0x0000..0x00FF].
 * Zero-pads short data to 256 bytes; truncates data longer than 256 bytes.
 * Matches bridge.ts loadSaveState.
 */
export function loadSaveState(saveData: Uint8Array): void {
    const saveStart = MEM_SAVE_DATA; // always 0
    const writeLen = Math.min(saveData.length, 256);
    for (let i = 0; i < writeLen; i++) {
        g_mem[saveStart + i] = saveData[i] ?? 0;
    }
    for (let i = writeLen; i < 256; i++) {
        g_mem[saveStart + i] = 0;
    }
}

/**
 * Copy MDT data into g_mem at ADDR_MDT (0xC000).
 * Matches bridge.ts loadMdt.
 */
export function loadMdtToBuffer(mdtData: Uint8Array): void {
    g_mem.set(mdtData, ADDR_MDT);
}

/**
 * Write a tile list to seg1:0x9000 (the special-tile scratch area).
 * Matches bridge.ts setSpecialTileList.
 *
 * Format: count byte + tile IDs (no terminator — count-prefixed).
 * Also writes the pointer word at seg1:0x8002 so the C-style
 * tileInSpecialList() can locate the list.
 */
export function setSpecialTileListToBuffer(tileIds: ArrayLike<number>): void {
    const SEG1_OFFSET = 0x9000;
    const listAddr = SEG1_BASE + SEG1_OFFSET;

    // Write count + tile bytes at seg1:0x9000
    g_mem[listAddr] = tileIds.length;
    for (let i = 0; i < tileIds.length; i++) {
        g_mem[listAddr + 1 + i] = (tileIds[i] ?? 0) & 0xff;
    }

    // Write the pointer word at seg1:0x8002 (little-endian seg1-relative offset).
    const ptrAddr = SEG1_BASE + 0x8002;
    g_mem[ptrAddr] = SEG1_OFFSET & 0xff;
    g_mem[ptrAddr + 1] = (SEG1_OFFSET >> 8) & 0xff;
}

/**
 * Write sword-reach tables into seg1 at REACH_TABLE_OFFSET/REACH_LISTS_OFFSET.
 * Matches bridge.ts setDungeonSwordReach.
 */
export function setDungeonSwordReachToBuffer(
    reachObj: Readonly<Record<number, ArrayLike<number>>>,
): void {
    let tablePtr = SEG1_BASE + REACH_TABLE_OFFSET;
    let listWritePtr = SEG1_BASE + REACH_LISTS_OFFSET;

    // Iterate indices 0..26 (even only) matching the C loop
    for (let idx = 0; idx <= 26; idx += 2) {
        const bytes = reachObj[idx] ?? [];
        // seg1-relative offset of the list start
        const off = listWritePtr - SEG1_BASE;
        for (let i = 0; i < bytes.length; i++) {
            g_mem[listWritePtr++] = (bytes[i] ?? 0) & 0xff;
        }
        // Table entry: 16-bit LE seg1-relative offset
        g_mem[tablePtr++] = off & 0xff;
        g_mem[tablePtr++] = (off >> 8) & 0xff;
    }
}

// ─── Dungeon config setup functions ──────────────────────────────────────────
// These write parsed dungeon configuration data into g_mem at fixed offsets.
// Matches bridge.ts writeFixedList and per-function implementations.

/** Zero-padded fixed-size byte list at a seg1-relative offset. */
function writeFixedList(items: ArrayLike<number>, seg1Offset: number, size: number): void {
    const addr = SEG1_BASE + seg1Offset;
    const count = Math.min(items.length, size);
    for (let i = 0; i < count; i++) {
        g_mem[addr + i] = (items[i] ?? 0) & 0xff;
    }
    for (let i = count; i < size; i++) {
        g_mem[addr + i] = 0;
    }
}

/** Passable tile IDs → seg1:0x8000 (24 bytes). */
export function setDungeonPassableTilesToBuffer(tileIds: ArrayLike<number>): void {
    writeFixedList(tileIds, 0x8000, 24);
}

/** Slope-left tile IDs → seg1:0x8018 (4 bytes). */
export function setDungeonSlopeTilesLeftToBuffer(tileIds: ArrayLike<number>): void {
    writeFixedList(tileIds, 0x8018, 4);
}

/** Slope-right tile IDs → seg1:0x801C (4 bytes). */
export function setDungeonSlopeTilesRightToBuffer(tileIds: ArrayLike<number>): void {
    writeFixedList(tileIds, 0x801C, 4);
}

/** Aggressive-ground tile IDs → seg1:0x8020 (4 bytes). */
export function setDungeonAggressiveGroundToBuffer(tileIds: ArrayLike<number>): void {
    writeFixedList(tileIds, 0x8020, 4);
}

/** Airflow tile IDs → seg1:0x8024 (12 bytes). */
export function setDungeonAirflowsToBuffer(tileIds: ArrayLike<number>): void {
    writeFixedList(tileIds, 0x8024, 12);
}

/** Monster XP table → g_mem[ADDR_MONSTER_XP_TABLE] (8 bytes). */
export function setDungeonMonsterXpToBuffer(xp: ArrayLike<number>): void {
    for (let i = 0; i < 8; i++) {
        g_mem[ADDR_MONSTER_XP_TABLE + i] = (xp[i] ?? 0) & 0xff;
    }
}

/** Monster damage table → g_mem[ADDR_MONSTER_DAMAGE_TABLE] (8 bytes). */
export function setDungeonMonsterDamageToBuffer(damage: ArrayLike<number>): void {
    for (let i = 0; i < 8; i++) {
        g_mem[ADDR_MONSTER_DAMAGE_TABLE + i] = (damage[i] ?? 0) & 0xff;
    }
}

/**
 * Death-descriptor tables → g_mem[0xA006..0xA0E0+].
 * Layout: 0xA006 = WORD ptr to dispatch array (0xA0C0),
 * 0xA0C0 = 8 WORD pointers → individual 4-byte descriptor tables at 0xA0E0+.
 */
export function setDeathDescriptorsToBuffer(
    descriptors: ReadonlyArray<ArrayLike<number>>,
): void {
    const ptrAddr = 0xa006;
    const arrayAddr = 0xa0c0;
    let tableAddr = 0xa0e0;

    // Pointer to dispatch array (0xA0C0 as LE word)
    g_mem[ptrAddr] = 0xc0;
    g_mem[ptrAddr + 1] = 0xa0;

    for (let i = 0; i < 8; i++) {
        const desc = descriptors[i];
        if (!desc || desc.length === 0) {
            g_mem[arrayAddr + i * 2] = 0;
            g_mem[arrayAddr + i * 2 + 1] = 0;
        } else {
            // Pointer is g_mem-relative (base is 0)
            g_mem[arrayAddr + i * 2] = tableAddr & 0xff;
            g_mem[arrayAddr + i * 2 + 1] = (tableAddr >> 8) & 0xff;
            for (let j = 0; j < 4; j++) {
                g_mem[tableAddr + j] = (desc[j] ?? 0) & 0xff;
            }
            tableAddr += 4;
        }
    }
}

/**
 * Trajectory data → g_mem at ADDR_TRAJECTORIES (0xA531).
 * Each trajectory is a byte array, written contiguously.
 */
export function setTrajectoriesToBuffer(
    trajectories: ReadonlyArray<ArrayLike<number>>,
): void {
    let addr = ADDR_TRAJECTORIES;
    for (let i = 0; i < trajectories.length; i++) {
        const traj = trajectories[i];
        if (!traj || traj.length === 0) continue;
        for (let j = 0; j < traj.length; j++) {
            g_mem[addr + j] = (traj[j] ?? 0) & 0xff;
        }
        addr += traj.length;
    }
}

// ─── Low-level accessors ─────────────────────────────────────────────────────
// These replace the bridge-backed gMem/readU8/readU16 in main.ts and the
// env-injected accessors for renderers/UI.

/** Single-byte read at addr. */
export function gMemAt(addr: number): number {
    return g_mem[addr] ?? 0;
}

/** Single-byte read (alias for gMemAt). */
export function readU8(addr: number): number {
    return g_mem[addr] ?? 0;
}

/** Little-endian 16-bit read at addr. */
export function readU16(addr: number): number {
    return (g_mem[addr] ?? 0) | ((g_mem[addr + 1] ?? 0) << 8);
}

/** Bulk read: returns a copy of g_mem[offset..offset+length]. */
export function readMemory(offset: number, length: number): Uint8Array {
    return g_mem.slice(offset, offset + length);
}

/** Bulk write: copies data into g_mem at offset. */
export function writeMemory(offset: number, data: Uint8Array | number[]): void {
    for (let i = 0; i < data.length; i++) {
        g_mem[offset + i] = (data[i] ?? 0) & 0xff;
    }
}
