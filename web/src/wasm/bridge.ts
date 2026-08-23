/**
 * bridge.ts — TypeScript bridge for the Zeliard WASM engine module.
 *
 * Uses the native WebAssembly API (no Emscripten runtime required). The C
 * side shares its `g_mem` array with JS through exported linear memory; the
 * layout constants live in memory.ts and must match src/zeliard.h.
 *
 * Ported 1:1 from zeliard-wasm.js in Stage 1 of MIGRATION_PLAN.md — export
 * names, signatures and return-value quirks are preserved so legacy modules
 * keep working unchanged.
 */

import {
    ADDR_BOSS_STATE_PTR,
    ADDR_MDT,
    ADDR_TRAJECTORIES,
    MEM_SAVE_DATA,
    REACH_LISTS_OFFSET,
    REACH_TABLE_OFFSET,
    SEG1_BASE,
    keyStateToBitmask,
} from './memory.js';
import type { CavernMdtHeader, KeyState, TownMdtHeader, TownPendingTransition } from './memory.js';

/**
 * Typed view of the WASM instance exports. Every entry corresponds to a
 * function listed in EXPORTED_FUNCTIONS in the Makefile (plus memory).
 */
export interface ZeliardExports {
    memory: WebAssembly.Memory;
    wasm_init(): void;
    get_memory_base(): number;
    wasm_get_mem_ptr(): number;
    wasm_town_init(): void;
    wasm_town_set_return_before_main_loop(enabled: number): void;
    wasm_town_entry_disabling_edge_scroll(): void;
    wasm_town_entry_enabling_edge_scroll(): void;
    wasm_town_update(): void;
    wasm_town_full_tick(): void;
    wasm_set_input_keys(bitmask: number): void;
    wasm_set_scroll_floor_right_8px(fn: number): void;
    wasm_set_scroll_floor_left_8px(fn: number): void;
    wasm_set_scroll_ceiling_right_4px(fn: number): void;
    wasm_set_scroll_ceiling_left_4px(fn: number): void;
    wasm_town_complete_transition(): void;
    wasm_get_pending_transition_map(): number;
    wasm_get_pending_transition_pat(): number;
    wasm_get_pending_transition_dir(): number;
    wasm_init_c015_obj_if_exists(): void;
    wasm_town_conversation_finish(): void;
    wasm_town_building_finish(): void;
    wasm_dungeon_init(mapId: number, isFromTown: number): void;
    wasm_dungeon_update(): void;
    wasm_dungeon_full_tick(): void;
    wasm_dungeon_get_viewport_top(): number;
    wasm_dungeon_get_entity_table(): number;
    wasm_dungeon_get_entity_count(): number;
    wasm_dungeon_get_state(): number;
    wasm_dungeon_get_render_request(): number;
    wasm_dungeon_clear_render_request(): void;
    wasm_finish_rokademo_transition(): void;
}

let wasmInstance: WebAssembly.Instance | null = null;
let wasmExports: ZeliardExports | null = null;

/** Offset of g_mem array within WASM linear memory. */
let gMemoryBase = 0;

/**
 * Owns the cached views over WASM linear memory.
 *
 * Memory is fixed-size in the current build, but if it ever grows
 * (memory.grow) its ArrayBuffer is detached and every view over it becomes
 * invalid. refresh() re-validates against the live buffer and the current
 * g_mem base, rebuilding both views when either changed. Injectable getters
 * keep the class unit-testable.
 */
export class LinearMemory {
    private full: Uint8Array | null = null;
    private gmem: Uint8Array | null = null;
    private gmemBaseUsed = -1;

    constructor(
        private readonly getExports: () => { memory?: unknown } | null,
        private readonly getBase: () => number,
    ) {}

    /** Re-validate cached views against the live memory buffer and base. */
    refresh(): boolean {
        const exports = this.getExports() as { memory?: WebAssembly.Memory } | null;
        if (!exports?.memory) return false;

        const bufferChanged = !this.full || this.full.buffer !== exports.memory.buffer;
        const baseChanged = this.gmemBaseUsed !== this.getBase();
        if (bufferChanged || !this.gmem || baseChanged) {
            // Memory grew, first access, or base became known: rebuild.
            this.full = new Uint8Array(exports.memory.buffer);
            this.gmem = this.full.subarray(this.getBase());
            this.gmemBaseUsed = this.getBase();
        }
        return true;
    }

    get isLive(): boolean {
        return this.refresh();
    }

    /** Absolute-addressing view (index 0 = start of linear memory). */
    get abs(): Uint8Array {
        if (!this.full) throw new Error('WASM not initialized');
        return this.full;
    }

    /** g_mem-relative view (index 0 = start of g_mem). */
    get view(): Uint8Array {
        if (!this.gmem) throw new Error('WASM not initialized');
        return this.gmem;
    }
}

const mem = new LinearMemory(
    () => wasmExports,
    () => gMemoryBase,
);

function createImportObject(): Record<string, (...args: never[]) => void> {
    // Provide a stub for any missing import so the debug module loads without error
    const target: Record<string, (...args: never[]) => void> = {};
    const handler: ProxyHandler<Record<string, (...args: never[]) => void>> = {
        get(tgt, prop) {
            const key = String(prop);
            if (!(key in tgt)) {
                // Return a no-op function for any missing function import
                tgt[key] = () => {};
            }
            return tgt[key];
        },
    };
    return new Proxy(target, handler);
}

function instantiate(bytes: ArrayBuffer | Uint8Array): WebAssembly.Instance {    // js_log: import called by C's debug_log/debug_printf
    const jsLog = (ptr: number): void => {
        if (!wasmExports?.memory) return;
        const memAbs = new Uint8Array(wasmExports.memory.buffer);
        let str = '';
        let p = ptr;
        while (memAbs[p] !== 0 && str.length < 1024) {
            str += String.fromCharCode(memAbs[p++] ?? 0);
        }
        console.log('[WASM]', str);
    };

    const importObject = {
        env: Object.assign(createImportObject(), { js_log: jsLog }),
    };

    const wasmModule = new WebAssembly.Module(bytes as BufferSource);
    return new WebAssembly.Instance(wasmModule, importObject);
}

function finishInit(instance: WebAssembly.Instance): WebAssembly.Instance {
    wasmInstance = instance;
    wasmExports = instance.exports as unknown as ZeliardExports;

    if (!wasmExports.memory) {
        throw new Error('WASM module does not export memory');
    }
    mem.refresh();

    // Get g_mem base address
    if (typeof wasmExports.get_memory_base === 'function') {
        gMemoryBase = wasmExports.get_memory_base();
        console.log('g_mem base offset:', gMemoryBase, '(0x' + gMemoryBase.toString(16) + ')');
    } else {
        // Fallback: assume g_mem starts at 0
        gMemoryBase = 0;
        console.log('get_memory_base not exported, assuming g_mem at offset 0');
    }

    // Call wasm_init to initialize memory
    if (typeof wasmExports.wasm_init === 'function') {
        wasmExports.wasm_init();
    }

    console.log('Zeliard WASM module initialized');
    console.log('Memory size:', mem.abs.length, 'bytes');
    return wasmInstance;
}

/**
 * Initialize the WASM module from raw bytes (used by tests and any host that
 * cannot `fetch` relative URLs).
 */
export function initWasmFromBytes(wasmBytes: ArrayBuffer | Uint8Array): WebAssembly.Instance {
    if (wasmInstance) return wasmInstance;
    try {
        return finishInit(instantiate(wasmBytes));
    } catch (error) {
        console.error('Failed to initialize WASM:', error);
        throw error;
    }
}

/**
 * Initialize the WASM module.
 * Call this once at game startup.
 */
export async function initWasm(url = 'build/zeliard.wasm'): Promise<WebAssembly.Instance> {
    if (wasmInstance) {
        return wasmInstance;
    }

    try {
        // Load WASM file
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load WASM: ${response.status}`);
        }
        return initWasmFromBytes(await response.arrayBuffer());
    } catch (error) {
        console.error('Failed to initialize WASM:', error);
        throw error;
    }
}

// After wasmExports is available
export const setScrollFloorRight8px = (fn: number): void =>
    void wasmExports!.wasm_set_scroll_floor_right_8px(fn);
export const setScrollFloorLeft8px = (fn: number): void =>
    void wasmExports!.wasm_set_scroll_floor_left_8px(fn);
export const setScrollCeilingRight4px = (fn: number): void =>
    void wasmExports!.wasm_set_scroll_ceiling_right_4px(fn);
export const setScrollCeilingLeft4px = (fn: number): void =>
    void wasmExports!.wasm_set_scroll_ceiling_left_4px(fn);

/**
 * Check whether the loaded WASM module exports a function.
 */
export function hasWasmExport(name: string): boolean {
    const exports = wasmExports as Partial<Record<string, unknown>> | null;
    return !!(exports && exports[name]);
}

/** Runtime base address of g_mem within linear memory (0 until initialized). */
export function getGmemBase(): number {
    return gMemoryBase;
}

/**
 * Get a Uint8Array view of the WASM linear memory, offset to the g_mem
 * array so that callers can index with game-relative offsets.
 * SoundManager uses this to poll shared bytes such as 0xFF75.
 * The view is cached and rebuilt when WASM memory grows; do not retain
 * the returned array across calls into WASM that may grow memory.
 *
 * @returns WASM g_mem memory view, or null if the WASM module is not initialized.
 */
export function getWasmMemory(): Uint8Array | null {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return null;
    }
    return mem.view;
}

/**
 * Initialize town memory/proc state.
 */
export function townInit(): void {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    wasmExports.wasm_town_init?.();
}

/**
 * When enabled, town entry returns after bootstrapping instead of entering
 * the original blocking DOS main loop.
 */
export function townSetReturnBeforeMainLoop(enabled: boolean): void {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    wasmExports.wasm_town_set_return_before_main_loop?.(enabled ? 1 : 0);
}

/**
 * Run town_entry_disabling_edge_scroll.
 */
export function townEntryDisablingEdgeScroll(): void {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (!wasmExports.wasm_town_entry_disabling_edge_scroll) {
        throw new Error('wasm_town_entry_disabling_edge_scroll is not exported');
    }

    wasmExports.wasm_town_entry_disabling_edge_scroll();
}

/**
 * Run town_entry_enabling_edge_scroll.
 */
export function townEntryEnablingEdgeScroll(): void {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (!wasmExports.wasm_town_entry_enabling_edge_scroll) {
        throw new Error('wasm_town_entry_enabling_edge_scroll is not exported');
    }

    wasmExports.wasm_town_entry_enabling_edge_scroll();
}

// run init_c015_obj_if_exists
export function initC015ObjIfExists(): void {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (!wasmExports.wasm_init_c015_obj_if_exists) {
        throw new Error('wasm_init_c015_obj_if_exists is not exported');
    }

    wasmExports.wasm_init_c015_obj_if_exists();
}

/**
 * Run one extracted town main-loop update.
 */
export function townUpdate(): void {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    wasmExports.wasm_town_update?.();
}

/**
 * Advance town timer counters that originally lived in the DOS ISR.
 */
export function townFullTick(): void {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    wasmExports.wasm_town_full_tick?.();
}

/**
 * Load MDT file data into WASM memory at 0xC000.
 * @param mdtData Raw MDT file data
 * @param mdtPath Path used for logging only
 * @returns 0 on success, -1 on error
 */
export function loadMdt(mdtData: Uint8Array, mdtPath: string): number {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return -1;
    }

    mem.abs.set(mdtData, gMemoryBase + ADDR_MDT);

    console.log('MDT loaded: ' + mdtPath);

    return 0;
}

export function loadSaveState(saveState: Uint8Array): number | undefined {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return undefined;
    }

    const saveStart = gMemoryBase + MEM_SAVE_DATA;
    const abs = mem.abs;

    // Copy saveState to WASM memory at 0, zero-padding to 256 bytes
    for (let i = 0; i < saveState.length; i++) {
        abs[saveStart + i] = saveState[i] ?? 0;
    }
    for (let i = 0; i < 256 - saveState.length; i++) {
        abs[saveStart + saveState.length + i] = 0;
    }

    return 0;
}

function readU16(addr: number): number {
    const abs = mem.abs;
    return (abs[addr] ?? 0) | ((abs[addr + 1] ?? 0) << 8);
}

/**
 * Get MDT header data for dungeons.
 */
export function getCavernMdtHeader(): CavernMdtHeader | null {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return null;
    }

    const offset = gMemoryBase + ADDR_MDT;

    return {
        map_width: readU16(offset + 2),
        vert_platforms_offset: readU16(offset + 4),
        air_streams_offset: readU16(offset + 6),
        horiz_platforms_offset: readU16(offset + 8),
        doors_offset: readU16(offset + 10),
        items_check_offset: readU16(offset + 12),
        cavern_name_offset: readU16(offset + 14),
        monsters_offset: readU16(offset + 16),
    };
}

/**
 * Get MDT header data for towns.
 */
export function getTownMdtHeader(): TownMdtHeader | null {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return null;
    }

    const offset = gMemoryBase + ADDR_MDT;

    return {
        town_descriptor_offset: readU16(offset + 0),
        map_width: readU16(offset + 2),
        town_name_offset: readU16(offset + 4),
        town_id: mem.abs[offset + 6] ?? 0,
        town_transition_table: readU16(offset + 7),
        doors_offset: readU16(offset + 9),
        dungeon_entrance_table: readU16(offset + 0xb),
        npc_conversations_offset: readU16(offset + 0xd),
        npc_array_offset: readU16(offset + 0xf),
        npc_patrol_boundaries: readU16(offset + 0x11),
        word_c015: readU16(offset + 0x15),
        town_tiles: readU16(offset + 0x17),
    };
}

/**
 * Read a Pascal string (length byte + characters) from a "name info"
 * structure. Callers add 3 to skip the rendering-info metadata bytes.
 */
function getNameFromNameInfo(nameOffset: number): string {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return '';
    }

    const abs = mem.abs;
    const nameLength = abs[nameOffset] ?? 0;
    let name = '';

    for (let i = 0; i < nameLength; i++) {
        name += String.fromCharCode(abs[nameOffset + 1 + i] ?? 0).replace('\\', '\u02BC');
    }

    return name;
}

/**
 * Get cavern name from loaded MDT.
 *
 * Header offsets are relative to MDT base (0xc000).
 * The rendering info structure has 3 bytes of metadata,
 * followed by Pascal string (length byte + characters).
 */
export function getCavernName(): string {
    if (!mem.isLive) return '';
    // Add 3 to skip rendering info metadata and point to Pascal string length
    const nameOffset = gMemoryBase + readU16(gMemoryBase + ADDR_MDT + 0x0e) + 3;
    return getNameFromNameInfo(nameOffset);
}

/**
 * Get town name from loaded MDT.
 *
 * Header offsets are relative to MDT base (0xc000).
 * The rendering info structure has 3 bytes of metadata,
 * followed by Pascal string (length byte + characters).
 */
export function getTownName(): string {
    if (!mem.isLive) return '';
    // Add 3 to skip rendering info metadata and point to Pascal string length
    const nameOffset = gMemoryBase + readU16(gMemoryBase + ADDR_MDT + 0x04) + 3;
    return getNameFromNameInfo(nameOffset);
}

/**
 * Get boss name from the boss state pointer table.
 * Offset 11 is intentionally different from the original 13 bytes,
 * and we don't need the 3 bytes of coords metadata.
 */
export function getBossName(): string {
    if (!mem.isLive) return '';

    const bossStatePtr = readU16(gMemoryBase + ADDR_BOSS_STATE_PTR);
    const namePtr = bossStatePtr + 11;
    return getNameFromNameInfo(gMemoryBase + namePtr);
}

/**
 * Get music track id from loaded MDT.
 * First word of header points to mdt_descriptor; track id is bits 5..1 of byte 0.
 *
 * @returns track id, or '' when the engine is not initialized.
 */
export function getMusicTrackId(): number | '' {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return '';
    }

    const musicIdOffset = gMemoryBase + readU16(gMemoryBase + ADDR_MDT + 0);

    return ((mem.abs[musicIdOffset] ?? 0) >> 1) & 0x0f;
}

/**
 * Get town background type from loaded MDT.
 * @returns 00 -> ympd, 01 -> ckpd; or '' when unavailable.
 */
export function getTownBackgroundType(): number | '' {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return '';
    }

    const header = getTownMdtHeader();
    if (!header || header.town_descriptor_offset === 0) {
        return '';
    }

    // Header offset is relative to 0xc000, so actual WASM memory address is:
    // gMemoryBase + header.town_descriptor_offset
    const backgroundTypeOffset = gMemoryBase + header.town_descriptor_offset + 3;

    return mem.abs[backgroundTypeOffset] ?? 0;
}

/**
 * Get town pattern Id from loaded MDT.
 * @returns 00 -> cpat, 01 -> mpat, 02 -> dpat; or '' when unavailable.
 */
export function getTownPatId(): number | '' {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return '';
    }

    // Header offset is relative to 0xc000, so actual WASM memory address is:
    // gMemoryBase + header.town_descriptor_offset
    const patIdOffset = gMemoryBase + readU16(gMemoryBase + ADDR_MDT) + 4;

    return mem.abs[patIdOffset] ?? 0;
}

export function setSpecialTileList(tileIds: ArrayLike<number>): void {
    if (!mem.isLive) {
        console.error('WASM memory not ready');
        return;
    }

    // List lives at seg1:0x9000 — a safe scratch area well past the
    // pattern data (seg1:0x8000-0x807F) and the pointer word itself.
    const SEG1_OFFSET = 0x9000; // seg1-relative offset of list data
    const listGmemAddr = gMemoryBase + SEG1_BASE + SEG1_OFFSET; // absolute index into wasmMemory

    // Write count + tile bytes at seg1:0x9000
    mem.abs[listGmemAddr] = tileIds.length;
    for (let i = 0; i < tileIds.length; i++) {
        mem.abs[listGmemAddr + 1 + i] = tileIds[i] ?? 0;
    }

    // Write the pointer word at seg1:0x8002.
    // C reads it with SEG1_16(0x8002) and uses the result as a seg1-relative
    // offset, so store the seg1-relative value 0x9000 (little-endian).
    const ptrGmemAddr = gMemoryBase + SEG1_BASE + 0x8002;
    mem.abs[ptrGmemAddr] = SEG1_OFFSET & 0xff; // lo = 0x00
    mem.abs[ptrGmemAddr + 1] = (SEG1_OFFSET >> 8) & 0xff; // hi = 0x90
}

export function setDungeonPassableTiles(tileIds: ArrayLike<number>): void {
    if (!mem.isLive) {
        console.error('WASM memory not ready');
        return;
    }

    writeFixedList(tileIds, 0x8000, 24); // 24 tile bytes (zero padded) at seg1:0x8000
}

export function setDungeonSlopeTilesLeft(tileIds: ArrayLike<number>): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    writeFixedList(tileIds, 0x8018, 4); // 4 tile bytes (zero padded) at seg1:0x8018
}

export function setDungeonSlopeTilesRight(tileIds: ArrayLike<number>): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    writeFixedList(tileIds, 0x801c, 4); // 4 tile bytes (zero padded) at seg1:0x801C
}

export function setDungeonAggressiveGround(tileIds: ArrayLike<number>): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    writeFixedList(tileIds, 0x8020, 4); // 4 tile bytes (zero padded) at seg1:0x8020
}

export function setDungeonAirflows(tileIds: ArrayLike<number>): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    writeFixedList(tileIds, 0x8024, 12); // 12 tile bytes (zero padded) at seg1:0x8024
}

/** Zero-padded fixed-size byte list at a seg1-relative offset. */
function writeFixedList(items: ArrayLike<number>, seg1Offset: number, size: number): void {
    const listGmemAddr = gMemoryBase + SEG1_BASE + seg1Offset;
    const count = Math.min(items.length, size);

    for (let i = 0; i < count; i++) {
        mem.abs[listGmemAddr + i] = items[i] ?? 0;
    }
    for (let i = count; i < size; i++) {
        mem.abs[listGmemAddr + i] = 0;
    }
}

export function setDungeonMonsterXp(xp: ArrayLike<number>): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    const listGmemAddr = gMemoryBase + 0xa008; // absolute index into wasmMemory

    for (let i = 0; i < 8; i++) {
        mem.abs[listGmemAddr + i] = xp[i] ?? 0;
    }
}

export function setDungeonMonsterDamage(damage: Uint8Array): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    mem.abs.set(damage, gMemoryBase + 0xa010);
}

/**
 * Death-descriptor tables.
 *
 * Layout in g_mem:
 *   0xA006:   WORD pointer -> dispatch array (0xA0C0)
 *   0xA0C0:   8 WORD pointers -> individual 4-byte descriptor tables
 *   0xA0E0+:  individual descriptor tables (each 4 bytes)
 */
export function setDeathDescriptors(descriptors: ReadonlyArray<ArrayLike<number>>): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    const abs = mem.abs;
    const ptrAddr = gMemoryBase + 0xa006; // WORD: pointer to dispatch array
    const arrayAddr = gMemoryBase + 0xa0c0; // 8 WORD dispatch array
    let tableAddr = gMemoryBase + 0xa0e0; // first descriptor table

    // Store the pointer (0xA0C0 as little-endian WORD)
    abs[ptrAddr] = 0xc0;
    abs[ptrAddr + 1] = 0xa0;

    for (let i = 0; i < 8; i++) {
        const desc = descriptors[i];
        if (!desc || desc.length === 0) {
            // Empty slot: store null pointer
            abs[arrayAddr + i * 2] = 0;
            abs[arrayAddr + i * 2 + 1] = 0;
        } else {
            // Store pointer to this table
            const off = tableAddr - gMemoryBase;
            abs[arrayAddr + i * 2] = off & 0xff;
            abs[arrayAddr + i * 2 + 1] = (off >> 8) & 0xff;

            // Write the 4 descriptor bytes
            for (let j = 0; j < 4; j++) {
                abs[tableAddr + j] = desc[j] || 0;
            }
            tableAddr += 4;
        }
    }
}

/**
 * Trajectories definitions written back-to-back at ADDR_TRAJECTORIES
 * (each entry consumed sequentially by the C side).
 */
export function setTrajectories(trajectories: ReadonlyArray<ArrayLike<number>>): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    let tableAddr = gMemoryBase + ADDR_TRAJECTORIES;

    for (let i = 0; i < trajectories.length; i++) {
        const traj = trajectories[i];
        if (!traj || traj.length === 0) {
            continue;
        }
        const len = traj.length;
        for (let j = 0; j < len; j++) {
            mem.abs[tableAddr + j] = traj[j] || 0;
        }
        tableAddr += len;
    }
}

/**
 * Read raw bytes from WASM memory.
 * @returns Bytes from memory (a view sharing g_mem), or null when uninitialized.
 */
export function readMemory(offset: number, length: number): Uint8Array | null {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return null;
    }

    // subarray() shares the cached g_mem view instead of allocating a fresh
    // Uint8Array from the detached-then-resized underlying buffer.
    return mem.view.subarray(offset, offset + length);
}

/**
 * Write bytes to WASM memory.
 * @param offset Memory offset (relative to g_mem base)
 * @param data Bytes to write
 */
export function writeMemory(offset: number, data: Uint8Array): void {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return;
    }

    mem.view.set(data, offset);
}

/**
 * Debug: dump memory region as hex.
 */
export function debugDump(offset: number, length: number): string {
    if (!mem.isLive) {
        console.error('WASM not initialized');
        return '';
    }

    let hex = '';
    for (let i = 0; i < length; i++) {
        if (i > 0 && i % 16 === 0) {
            console.log(hex);
            hex = '';
        }
        hex += (mem.abs[gMemoryBase + offset + i] ?? 0).toString(16).padStart(2, '0') + ' ';
    }
    if (hex) {
        console.log(hex);
    }
    return hex;
}

// ============================================================================
// Input Handling API
// ============================================================================

/**
 * Set current key state.
 * @param keys Bitmask-producing key state object (INPUT_FLAGS semantics)
 */
export function inputSetKeys(keys: KeyState): void {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }
    const bitmask = keyStateToBitmask(keys);

    if (wasmExports.wasm_set_input_keys) {
        wasmExports.wasm_set_input_keys(bitmask);
    }
}

export function getTownPendingTransitionFlag(): number {
    if (!mem.isLive) return 0;
    return mem.abs[gMemoryBase + 0xfff4] ?? 0;
}

export function getTownPendingTransition(): TownPendingTransition | null {
    if (!mem.isLive) return null;
    const base = gMemoryBase;
    return {
        mapId: mem.abs[base + 0xfff1] ?? 0, // dest map id (0x80 already set)
        patId: mem.abs[base + 0xfff2] ?? 0,
        goingLeft: (mem.abs[base + 0xfff3] ?? 0) !== 0,
    };
}

export function townCompleteTransition(): void {
    wasmExports?.wasm_town_complete_transition?.();
}

export function townFinishConversation(): void {
    wasmExports?.wasm_town_conversation_finish?.();
}

export function townFinishBuilding(): void {
    wasmExports?.wasm_town_building_finish?.();
}

export function dungeonInit(mapId: number, isFromTown: number | boolean): void {
    wasmExports?.wasm_dungeon_init?.(mapId, Number(isFromTown));
}

export function dungeonUpdate(): void {
    wasmExports?.wasm_dungeon_update?.();
}

export function dungeonFullTick(): void {
    wasmExports?.wasm_dungeon_full_tick?.();
}

export function dungeonGetViewportTop(): number {
    return wasmExports?.wasm_dungeon_get_viewport_top?.() ?? 0;
}

export function dungeonGetEntityTable(): number {
    return wasmExports?.wasm_dungeon_get_entity_table?.() ?? 0;
}

export function dungeonGetEntityCount(): number {
    return wasmExports?.wasm_dungeon_get_entity_count?.() ?? 0;
}

export function dungeonGetState(): number {
    return wasmExports?.wasm_dungeon_get_state?.() ?? 0;
}

export function dungeonGetRenderRequest(): number {
    return wasmExports?.wasm_dungeon_get_render_request?.() ?? 0;
}

export function dungeonClearRenderRequest(): void {
    wasmExports?.wasm_dungeon_clear_render_request?.();
}

export function finishRokademoTransition(): void {
    wasmExports?.wasm_finish_rokademo_transition?.();
}

/**
 * Convert the JS sword-reach object into the layout expected by
 * apply_sword_hit_to_map_tiles() and write it to WASM memory.
 *
 * @param reachObj Sword reachability object with even-numbered keys 0..26;
 * each value is an FF-terminated reachability list for that phase. Empty
 * arrays at indices 12 and 14 exist for alignment purposes only.
 */
export function setDungeonSwordReach(reachObj: Readonly<Record<number, ArrayLike<number>>>): void {
    if (!mem.isLive) {
        console.error('WASM memory not ready');
        return;
    }

    const seg1Base = gMemoryBase + SEG1_BASE;
    let tablePtr = seg1Base + REACH_TABLE_OFFSET;

    // Write all byte lists contiguously starting at REACH_LISTS_OFFSET
    let listWritePtr = seg1Base + REACH_LISTS_OFFSET;

    // The possible indices (even numbers 0..26)
    for (let idx = 0; idx <= 26; idx += 2) {
        const bytes = reachObj[idx] ?? [];
        // Compute offset BEFORE writing, so the table entry points to the START of this list
        const off = listWritePtr - seg1Base;
        for (let i = 0; i < bytes.length; i++) {
            mem.abs[listWritePtr++] = bytes[i] ?? 0;
        }
        // Write the jump table at REACH_TABLE_OFFSET
        // (14 entries, each a 16-bit little-endian seg1-relative offset)
        // For empty entries idx=12 and idx=14, write any value (it will be ignored
        // by apply_sword_hit_to_map_tiles)
        mem.abs[tablePtr++] = off & 0xff;
        mem.abs[tablePtr++] = (off >> 8) & 0xff;
    }
}
