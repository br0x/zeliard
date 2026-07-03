// zeliard-wasm.js - JavaScript bridge for Zeliard WASM module
// Uses native WebAssembly API (no Emscripten runtime required)

let wasmInstance = null;
let wasmMemory = null;
let wasmExports = null;
let gMemoryBase = 0;  // Offset of g_mem array in WASM linear memory

// Memory layout constants (must match zeliard.h)
// These are offsets within g_mem, not absolute WASM memory offsets
const ADDR_MDT = 0xC000;
const ADDR_PROXIMITY_MAP = 0xE000;
const ADDR_VIEWPORT_ENTITIES = 0xE900;
const MEM_SAVE_DATA = 0x0000;
const MEM_INPUT_BUFFER = 0xFF16; // 4 bytes
const MEMORY_SIZE = 64 * 1024 * 1024; // 64MB
const SEG1_BASE = 0x10000;

// Input flags (bitmask) - must match InputFlags enum in zeliard.h
const INPUT_FLAGS = {
    NONE: 0x00,
    UP: 0x01,
    DOWN: 0x02,
    LEFT: 0x04,
    RIGHT: 0x08,
    ENTER: 0x10,
    SPACE: 0x20,
    ALT: 0x40,
    ESC: 0x80
};

function createImportObject() {
    // Provide a stub for any missing import so the debug module loads without error
    const handler = {
        get(target, prop) {
            if (!(prop in target)) {
                // Return a no-op function for any missing function import
                target[prop] = () => {};
            }
            return target[prop];
        }
    };
    return new Proxy({}, handler);
}

/**
 * Initialize the WASM module
 * Call this once at game startup
 */
export async function initWasm() {
    if (wasmInstance) {
        return wasmInstance;
    }

    try {
        // Load WASM file
        const response = await fetch('build/zeliard.wasm');
        if (!response.ok) {
            throw new Error(`Failed to load WASM: ${response.status}`);
        }

        const wasmBytes = await response.arrayBuffer();

        // js_log: import called by C's debug_log/debug_printf
        const jsLog = (ptr) => {
            if (!wasmExports?.memory) return;
            const mem = new Uint8Array(wasmExports.memory.buffer);
            let str = '';
            let p = ptr;
            while (mem[p] !== 0 && str.length < 1024) {
                str += String.fromCharCode(mem[p++]);
            }
            console.log('[WASM]', str);
        };

        const importObject = {
            env: Object.assign(createImportObject(), { js_log: jsLog })
        };
        const wasmModule = await WebAssembly.instantiate(wasmBytes, importObject);

        wasmInstance = wasmModule.instance;
        wasmExports = wasmInstance.exports;

        // Get the exported memory
        if (wasmExports.memory) {
            wasmMemory = new Uint8Array(wasmExports.memory.buffer);
        } else {
            throw new Error('WASM module does not export memory');
        }

        // Get g_mem base address
        if (wasmExports.get_memory_base) {
            gMemoryBase = wasmExports.get_memory_base();
            console.log('g_mem base offset:', gMemoryBase, '(0x' + gMemoryBase.toString(16) + ')');
        } else {
            // Fallback: assume g_mem starts at 0
            gMemoryBase = 0;
            console.log('get_memory_base not exported, assuming g_mem at offset 0');
        }

        // Call wasm_init to initialize memory
        if (wasmExports.wasm_init) {
            wasmExports.wasm_init();
        }

        console.log('Zeliard WASM module initialized');
        console.log('Memory size:', wasmMemory.length, 'bytes');
        return wasmInstance;

    } catch (error) {
        console.error('Failed to initialize WASM:', error);
        throw error;
    }
}

// After wasmExports is available
export const setScrollFloorRight8px = (fn) => wasmExports.wasm_set_scroll_floor_right_8px(fn);
export const setScrollFloorLeft8px  = (fn) => wasmExports.wasm_set_scroll_floor_left_8px(fn);
export const setScrollCeilingRight4px = (fn) => wasmExports.wasm_set_scroll_ceiling_right_4px(fn);
export const setScrollCeilingLeft4px  = (fn) => wasmExports.wasm_set_scroll_ceiling_left_4px(fn);

/**
 * Check whether the loaded WASM module exports a function.
 * @param {string} name - Export name to check.
 * @returns {boolean} true when present.
 */
export function hasWasmExport(name) {
    return !!(wasmExports && wasmExports[name]);
}

/**
 * Get a Uint8Array view of the WASM linear memory, offset to the g_mem
 * array so that callers can index with game-relative offsets.
 * SoundManager uses this to poll shared bytes such as 0xFF75.
 * @returns {Uint8Array|null} WASM g_mem memory view.
 */
export function getWasmMemory() {
    if (!wasmExports?.memory) {
        console.error('WASM not initialized');
        return null;
    }

    if (!wasmMemory || wasmMemory.buffer !== wasmExports.memory.buffer) {
        wasmMemory = new Uint8Array(wasmExports.memory.buffer);
    }

    return wasmMemory.subarray(gMemoryBase);
}

/**
 * Initialize town memory/proc state.
 */
export function townInit() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    wasmExports.wasm_town_init?.();
}

/**
 * When enabled, town entry returns after bootstrapping instead of entering
 * the original blocking DOS main loop.
 * @param {boolean} enabled
 */
export function townSetReturnBeforeMainLoop(enabled) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    wasmExports.wasm_town_set_return_before_main_loop?.(enabled ? 1 : 0);
}

/**
 * Run town_entry_disabling_edge_scroll.
 */
export function townEntryDisablingEdgeScroll() {
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
export function townEntryEnablingEdgeScroll() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (!wasmExports.wasm_town_entry_enabling_edge_scroll) {
        throw new Error('wasm_town_entry_enabling_edge_scroll is not exported');
    }

    wasmExports.wasm_town_entry_enabling_edge_scroll();
}

/**
 * Run one extracted town main-loop update.
 */
export function townUpdate() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    wasmExports.wasm_town_update?.();
}

/**
 * Advance town timer counters that originally lived in the DOS ISR.
 */
export function townFullTick() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    wasmExports.wasm_town_full_tick?.();
}

/**
 * Load MDT file data into WASM memory at 0xC000
 * @param {Uint8Array} mdtData - Raw MDT file data
 * @returns {number} 0 on success, -1 on error
 */
export function loadMdt(mdtData) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return -1;
    }

    const mdtStart = gMemoryBase + ADDR_MDT;

    // Copy MDT data to WASM memory at 0xC000
    for (let i = 0; i < mdtData.length; i++) {
        wasmMemory[mdtStart + i] = mdtData[i];
    }
    console.log('MDT loaded at 0x' + ADDR_MDT.toString(16));

    return 0;
}

export function loadSaveState(saveState) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    const saveStart = gMemoryBase + MEM_SAVE_DATA;

    // Copy saveState to WASM memory at 0
    for (let i = 0; i < saveState.length; i++) {
        wasmMemory[saveStart + i] = saveState[i];
    }

    return 0;
}

/**
 * Get MDT header data for dungeons
 * @returns {object} MDT header with all offsets
 */
export function getCavernMdtHeader() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    const offset = gMemoryBase + ADDR_MDT;

    // Read uint16 values from memory (little-endian)
    function readU16(addr) {
        return wasmMemory[addr] | (wasmMemory[addr + 1] << 8);
    }

    return {
        map_width: readU16(offset + 2),
        vert_platforms_offset: readU16(offset + 4),
        air_streams_offset: readU16(offset + 6),
        horiz_platforms_offset: readU16(offset + 8),
        doors_offset: readU16(offset + 10),
        items_check_offset: readU16(offset + 12),
        cavern_name_offset: readU16(offset + 14),
        monsters_offset: readU16(offset + 16)
    };
}

/**
 * Get MDT header data for towns
 * @returns {object} MDT header with all offsets
 */
export function getTownMdtHeader() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    const offset = gMemoryBase + ADDR_MDT;

    const readU8 = (addr) => wasmMemory[addr];
    // Read uint16 values from memory (little-endian)
    function readU16(addr) {
        return wasmMemory[addr] | (wasmMemory[addr + 1] << 8);
    }

    return {
        town_descriptor_offset: readU16(offset + 0),
        map_width: readU16(offset + 2),
        town_name_offset: readU16(offset + 4),
        town_id: readU8(offset + 6),
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
 * Get cavern name from loaded MDT
 * @returns {string} Cavern name
 *
 * Header offsets are relative to MDT base (0xc000).
 * The rendering info structure has 3 bytes of metadata,
 * followed by Pascal string (length byte + characters).
 */
export function getCavernName() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return '';
    }

    const header = getCavernMdtHeader();
    if (!header || header.cavern_name_offset === 0) {
        return '';
    }

    // Header offset is relative to 0xc000, so actual WASM memory address is:
    // gMemoryBase + header.cavern_name_offset
    // Add 3 to skip rendering info metadata and point to Pascal string length
    const nameOffset = gMemoryBase + header.cavern_name_offset + 3;
    const nameLength = wasmMemory[nameOffset];
    let name = '';

    for (let i = 0; i < nameLength; i++) {
        name += String.fromCharCode(wasmMemory[nameOffset + 1 + i]);
    }

    return name;
}

/**
 * Get town name from loaded MDT
 * @returns {string} Town name
 *
 * Header offsets are relative to MDT base (0xc000).
 * The rendering info structure has 3 bytes of metadata,
 * followed by Pascal string (length byte + characters).
 */
export function getTownName() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return '';
    }

    const header = getTownMdtHeader();
    if (!header || header.town_name_offset === 0) {
        return '';
    }

    // Header offset is relative to 0xc000, so actual WASM memory address is:
    // gMemoryBase + header.town_name_offset
    // Add 3 to skip rendering info metadata and point to Pascal string length
    const nameOffset = gMemoryBase + header.town_name_offset + 3;
    const nameLength = wasmMemory[nameOffset];
    let name = '';

    for (let i = 0; i < nameLength; i++) {
        name += (String.fromCharCode(wasmMemory[nameOffset + 1 + i]).replace('\\', "ʼ"));
    }

    return name;
}

/**
 * Get town music track id from loaded MDT
 * @returns {number} trackId
 *
 * Header offsets are relative to MDT base (0xc000).
 * First word of header points to town_descriptor, and track id is in bits 5..1 of byte 0.
 */
export function getTownMusicTrack() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return '';
    }

    const header = getTownMdtHeader();
    if (!header || header.town_descriptor_offset === 0) {
        return '';
    }

    // Header offset is relative to 0xc000, so actual WASM memory address is:
    // gMemoryBase + header.town_descriptor_offset
    const musicIdOffset = gMemoryBase + header.town_descriptor_offset + 0;

    return (wasmMemory[musicIdOffset] >> 1) & 0x3;
}

/**
 * Get town background type from loaded MDT
 * @returns {number} 00 -> ympd, 01 -> ckpd
 *
 * Header offsets are relative to MDT base (0xc000).
 * First word of header points to town_descriptor, and background type is in byte 3.
 */
export function getTownBackgroundType() {
    if (!wasmMemory) {
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

    return wasmMemory[backgroundTypeOffset];
}

/**
 * Get town pattern Id from loaded MDT
 * @returns {number} 00 -> cpat, 01 ->mpat, 02 -> dpat
 *
 * Header offsets are relative to MDT base (0xc000).
 * First word of header points to town_descriptor, and patId is in byte 4.
 */
export function getTownPatId() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return '';
    }

    const header = getTownMdtHeader();
    if (!header || header.town_descriptor_offset === 0) {
        return '';
    }

    // Header offset is relative to 0xc000, so actual WASM memory address is:
    // gMemoryBase + header.town_descriptor_offset
    const patIdOffset = gMemoryBase + header.town_descriptor_offset + 4;

    return wasmMemory[patIdOffset];
}

export function setSpecialTileList(tileIds) {
    if (!wasmMemory) {
        console.error('WASM memory not ready');
        return;
    }

    // List lives at seg1:0x9000 — a safe scratch area well past the
    // pattern data (seg1:0x8000–0x807F) and the pointer word itself.
    const SEG1_OFFSET  = 0x9000;          // seg1-relative offset of list data
    const listGmemAddr = gMemoryBase + SEG1_BASE + SEG1_OFFSET; // absolute index into wasmMemory

    // Write count + tile bytes at seg1:0x9000
    wasmMemory[listGmemAddr] = tileIds.length;
    for (let i = 0; i < tileIds.length; i++) {
        wasmMemory[listGmemAddr + 1 + i] = tileIds[i];
    }

    // Write the pointer word at seg1:0x8002.
    // C reads it with SEG1_16(0x8002) and uses the result as a seg1-relative
    // offset, so store the seg1-relative value 0x9000 (little-endian).
    const ptrGmemAddr = gMemoryBase + SEG1_BASE + 0x8002;
    wasmMemory[ptrGmemAddr]     = SEG1_OFFSET & 0xFF;        // lo = 0x00
    wasmMemory[ptrGmemAddr + 1] = (SEG1_OFFSET >> 8) & 0xFF; // hi = 0x90
}

export function setDungeonPassableTiles(tileIds) {
    if (!wasmMemory) {
        console.error('WASM memory not ready');
        return;
    }

    const SEG1_OFFSET  = 0x8000; // seg1-relative offset of list data
    const listGmemAddr = gMemoryBase + SEG1_BASE + SEG1_OFFSET; // absolute index into wasmMemory

    // 24 tile bytes (zero padded) at seg1:0x8000
    for (let i = 0; i < tileIds.length; i++) {
        wasmMemory[listGmemAddr + i] = tileIds[i];
    }
    for (let i = 0; i < (24 - tileIds.length); i++) {
        wasmMemory[listGmemAddr + tileIds.length + i] = 0;
    }
}

export function setDungeonSlopeTilesLeft(tileIds) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return;
    }

    const SEG1_OFFSET  = 0x8018; // seg1-relative offset of list data
    const listGmemAddr = gMemoryBase + SEG1_BASE + SEG1_OFFSET; // absolute index into wasmMemory

    // 4 tile bytes (zero padded) at seg1:0x8018
    for (let i = 0; i < tileIds.length; i++) {
        wasmMemory[listGmemAddr + i] = tileIds[i];
    }
    for (let i = 0; i < (4 - tileIds.length); i++) {
        wasmMemory[listGmemAddr + tileIds.length + i] = 0;
    }
}

export function setDungeonSlopeTilesRight(tileIds) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return;
    }

    const SEG1_OFFSET  = 0x801C; // seg1-relative offset of list data
    const listGmemAddr = gMemoryBase + SEG1_BASE + SEG1_OFFSET; // absolute index into wasmMemory

    // 4 tile bytes (zero padded) at seg1:0x801С
    for (let i = 0; i < tileIds.length; i++) {
        wasmMemory[listGmemAddr + i] = tileIds[i];
    }
    for (let i = 0; i < (4 - tileIds.length); i++) {
        wasmMemory[listGmemAddr + tileIds.length + i] = 0;
    }
}

export function setDungeonAggressiveGround(tileIds) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return;
    }

    const SEG1_OFFSET  = 0x8020; // seg1-relative offset of list data
    const listGmemAddr = gMemoryBase + SEG1_BASE + SEG1_OFFSET; // absolute index into wasmMemory

    // 4 tile bytes (zero padded) at seg1:0x8020
    for (let i = 0; i < tileIds.length; i++) {
        wasmMemory[listGmemAddr + i] = tileIds[i];
    }
    for (let i = 0; i < (4 - tileIds.length); i++) {
        wasmMemory[listGmemAddr + tileIds.length + i] = 0;
    }
}

export function setDungeonAirflows(tileIds) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return;
    }

    const SEG1_OFFSET  = 0x8024; // seg1-relative offset of list data
    const listGmemAddr = gMemoryBase + SEG1_BASE + SEG1_OFFSET; // absolute index into wasmMemory

    // 12 tile bytes (zero padded) at seg1:0x8024
    for (let i = 0; i < tileIds.length; i++) {
        wasmMemory[listGmemAddr + i] = tileIds[i];
    }
    for (let i = 0; i < (12 - tileIds.length); i++) {
        wasmMemory[listGmemAddr + tileIds.length + i] = 0;
    }
}

/**
 * Get monster buffer (0xE900)
 * @returns {Uint8Array} View of monster buffer (28*19 bytes, 1 byte per monster)
 */
export function getMonsterBuffer() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    return new Uint8Array(wasmMemory.buffer, gMemoryBase + ADDR_VIEWPORT_ENTITIES, 28*19);
}

/**
 * Get proximity map (0xE000)
 * @returns {Uint8Array} View of proximity map (36x64 = 2304 bytes)
 */
export function getProximityMap() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    return new Uint8Array(wasmMemory.buffer, gMemoryBase + ADDR_PROXIMITY_MAP, 36 * 64);
}

/**
 * Get save data
 * @returns {object} Save data structure
 */
export function getSaveData() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    const offset = gMemoryBase + MEM_SAVE_DATA;

    function readU8(addr) { return wasmMemory[addr]; }
    function readU16(addr) { return wasmMemory[addr] | (wasmMemory[addr + 1] << 8); }

    return {
        hero_level: readU8(offset + 0x8D),
        hero_hp: readU16(offset + 0x90),
        heroMaxHp: readU16(offset + 0xB2),
        hero_gold: readU16(offset + 0x86),
        hero_almas: readU16(offset + 0x8B),
        sword_type: readU8(offset + 0x92),
        shield_type: readU8(offset + 0x93),
        starting_direction: readU8(offset + 0xC2)
    };
}

/**
 * Get input debug counter - verifies input code is running
 * @returns {number} Counter value
 */
export function inputGetDebugCounter() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.input_get_debug_counter) {
        return wasmExports.input_get_debug_counter();
    }
    return 0;
}

/**
 * Get debug input received by state machine
 * @returns {object} Debug info
 */
export function getStateMachineDebug() {
    if (!wasmMemory) {
        return null;
    }
    
    const offset = gMemoryBase;
    const marker = wasmMemory[offset + 0xFFB5];
    const locMarker = wasmMemory[offset + 0xFFC1];
    const collisionMarker = wasmMemory[offset + 0xFFD2];
    
    const result = {
        input_received: wasmMemory[offset + 0xFFB0],
        on_rope_flags: wasmMemory[offset + 0xFFB1],
        jump_phase_flags: wasmMemory[offset + 0xFFB2],
        starting_direction: wasmMemory[offset + 0xFFB3],
        squat_bit: wasmMemory[offset + 0xFFB4]
    };
    
    if (locMarker === 0xCD) {
        result.loc_663E_starting_dir = wasmMemory[offset + 0xFFC0];
        result.loc_663E_step = wasmMemory[offset + 0xFFC2];
        result.collision_result = wasmMemory[offset + 0xFFC3];
        result.slippery = wasmMemory[offset + 0xFFC4];
    }
    
    if (collisionMarker === 0xDD) {
        result.hero_x_viewport = wasmMemory[offset + 0xFFD0];
        result.hero_y_viewport = wasmMemory[offset + 0xFFD1];
        result.di_offset = wasmMemory[offset + 0xFFD3] | (wasmMemory[offset + 0xFFD4] << 8);
        result.collision_step = wasmMemory[offset + 0xFFD5];
        result.tile_at_si = wasmMemory[offset + 0xFFD6];
        result.tile_below = wasmMemory[offset + 0xFFD7];
    }
    
    return result;
}

/**
 * Get input debug data
 * @returns {object|null} Input debug info
 */
export function getInputDebug() {
    if (!wasmMemory) {
        return null;
    }
    
    const offset = gMemoryBase;
    
    // Read from input buffer at 0xFF16
    const inputBufferValue = wasmMemory[offset + 0xFF16];
    
    return {
        input_buffer: inputBufferValue,
        gMemoryBase: gMemoryBase
    };
}

/**
 * Set hero position in WASM save data
 * @param {number} x - Hero absolute X position (proximity_map_left_col_x)
 * @param {number} y - Hero Y position (hero_y_rel)
 */
export function setHeroPosition(x, y) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return;
    }

    const offset = gMemoryBase + MEM_SAVE_DATA;
    const heroStatsOffset = 0x80;  // Matches Fight.asm offset
    
    // Set proximity_map_left_col_x (uint16 little-endian)
    wasmMemory[offset + heroStatsOffset] = x & 0xFF;
    wasmMemory[offset + heroStatsOffset + 1] = (x >> 8) & 0xFF;
    
    // Set hero_y_rel (uint8)
    wasmMemory[offset + heroStatsOffset + 2] = y & 0xFF;
    
    // Set hero_x_in_viewport to 16 (center of 36-column proximity map)
    wasmMemory[offset + heroStatsOffset + 3] = 16;
    
    // Set hero_head_y_in_viewport (height above ground, typically 2-4)
    wasmMemory[offset + heroStatsOffset + 4] = 4;
}

/**
 * Run one game frame update
 */
export function update() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }
    
    if (wasmExports.wasm_update) {
        wasmExports.wasm_update();
    }
}

/**
 * Read raw bytes from WASM memory
 * @param {number} offset - Memory offset (relative to g_mem base)
 * @param {number} length - Number of bytes to read
 * @returns {Uint8Array} Bytes from memory
 */
export function readMemory(offset, length) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    return new Uint8Array(wasmMemory.buffer, gMemoryBase + offset, length);
}

/**
 * Write bytes to WASM memory
 * @param {number} offset - Memory offset (relative to g_mem base)
 * @param {Uint8Array} data - Bytes to write
 */
export function writeMemory(offset, data) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return;
    }

    for (let i = 0; i < data.length; i++) {
        wasmMemory[gMemoryBase + offset + i] = data[i];
    }
}

/**
 * Debug: dump memory region as hex
 * @param {number} offset - Memory offset (relative to g_mem base)
 * @param {number} length - Number of bytes to dump
 * @returns {string} Hex dump
 */
export function debugDump(offset, length) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return '';
    }

    let hex = '';
    for (let i = 0; i < length; i++) {
        if (i > 0 && i % 16 === 0) {
            console.log(hex);
            hex = '';
        }
        hex += wasmMemory[gMemoryBase + offset + i].toString(16).padStart(2, '0') + ' ';
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
 * Update input state (compute edge-triggered inputs)
 * Call every frame before reading input
 */
export function inputUpdate() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.input_update) {
        wasmExports.input_update();
    }
}

/**
 * Set current key state
 * @param {number} keys - Bitmask of currently pressed keys (INPUT_FLAGS)
 */
export function inputSetKeys(keys) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }
    let bitmask = INPUT_FLAGS.NONE;

    if (keys.ArrowUp) bitmask |= INPUT_FLAGS.UP;
    if (keys.ArrowDown) bitmask |= INPUT_FLAGS.DOWN;
    if (keys.ArrowLeft) bitmask |= INPUT_FLAGS.LEFT;
    if (keys.ArrowRight) bitmask |= INPUT_FLAGS.RIGHT;
    if (keys.Enter) bitmask |= INPUT_FLAGS.ENTER;
    if (keys.Space) bitmask |= INPUT_FLAGS.SPACE;
    if (keys.Alt) bitmask |= INPUT_FLAGS.ALT;
    if (keys.Escape) bitmask |= INPUT_FLAGS.ESC;

    // if (wasmExports.input_set_keys) {
    //     wasmExports.input_set_keys(bitmask);
    // } else 
    if (wasmExports.wasm_town_set_input_keys) {
        wasmExports.wasm_town_set_input_keys(bitmask);
    } else {
        // writeTownInputBytes(bitmask);
    }
}

function writeTownInputBytes(keys) {
    if (!wasmMemory) return;

    const offset = gMemoryBase;
    let dirs = 0;
    if (keys & INPUT_FLAGS.UP) dirs |= 0x01;
    if (keys & INPUT_FLAGS.DOWN) dirs |= 0x02;
    if (keys & INPUT_FLAGS.LEFT) dirs |= 0x04;
    if (keys & INPUT_FLAGS.RIGHT) dirs |= 0x08;

    wasmMemory[offset + 0xFF17] = dirs;
    wasmMemory[offset + 0xFF18] = (keys & INPUT_FLAGS.ENTER) ? 0x01 : 0x00;
    wasmMemory[offset + 0xFF16] =
        ((keys & INPUT_FLAGS.SPACE) ? 0x01 : 0x00) |
        ((keys & INPUT_FLAGS.ALT) ? 0x02 : 0x00);
}

/**
 * Get current key state
 * @returns {number} Bitmask of currently held keys
 */
export function inputGetCurrentKeys() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.input_get_current_keys) {
        return wasmExports.input_get_current_keys();
    }
    return 0;
}

/**
 * Get keys pressed this frame (edge-triggered)
 * @returns {number} Bitmask of keys pressed this frame only
 */
export function inputGetPressedKeys() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.input_get_pressed_keys) {
        return wasmExports.input_get_pressed_keys();
    }
    return 0;
}

/**
 * Get keys released this frame (edge-triggered)
 * @returns {number} Bitmask of keys released this frame only
 */
export function inputGetReleasedKeys() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.input_get_released_keys) {
        return wasmExports.input_get_released_keys();
    }
    return 0;
}

/**
 * Check if a key was pressed this frame (edge-triggered)
 * @param {number} key - Key flag to check (INPUT_FLAGS.UP, etc.)
 * @returns {boolean} true if pressed this frame
 */
export function inputIsKeyPressed(key) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return false;
    }

    if (wasmExports.input_is_key_pressed) {
        return wasmExports.input_is_key_pressed(key) !== 0;
    }
    return false;
}

/**
 * Check if a key is currently held down
 * @param {number} key - Key flag to check (INPUT_FLAGS.UP, etc.)
 * @returns {boolean} true if held
 */
export function inputIsKeyHeld(key) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return false;
    }

    if (wasmExports.input_is_key_held) {
        return wasmExports.input_is_key_held(key) !== 0;
    }
    return false;
}

/**
 * Check if a key was released this frame (edge-triggered)
 * @param {number} key - Key flag to check (INPUT_FLAGS.UP, etc.)
 * @returns {boolean} true if released this frame
 */
export function inputIsKeyReleased(key) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return false;
    }

    if (wasmExports.input_is_key_released) {
        return wasmExports.input_is_key_released(key) !== 0;
    }
    return false;
}

/**
 * Get input buffer as Uint8Array view
 * @returns {Uint8Array} View of input buffer (256 bytes)
 */
export function getInputBuffer() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    return new Uint8Array(wasmMemory.buffer, gMemoryBase + MEM_INPUT_BUFFER, 256);
}

/**
 * Initialize transition from town to dungeon
 * @param {number} x proximity_map_left_col_x
 * @param {number} y hero_y_rel
 * @param {number} dir is_left_run
 * @param {number} cavern_id id of the cavern to enter
 */
export function townToDungeonTransition(x, y, dir, cavern_id) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.town_to_dungeon_transition) {
        wasmExports.town_to_dungeon_transition(x, y, dir, cavern_id);
    }
}

// ============================================================================
// Hero Movement API
// ============================================================================

/**
 * Initialize hero movement state machine
 */
export function heroMovementInit() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.hero_movement_init) {
        wasmExports.hero_movement_init();
    }
}

/**
 * Update hero movement state machine
 * Call every frame
 */
export function heroMovementUpdate() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.hero_movement_update) {
        wasmExports.hero_movement_update();
    }
}

/**
 * Get current hero direction
 * @returns {number} 1=right, -1=left, 0=none
 */
export function heroGetDirection() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.hero_get_direction) {
        return wasmExports.hero_get_direction();
    }
    return 0;
}

/**
 * Get current hero state
 * @returns {number} Hero state enum value
 */
export function heroGetState() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.hero_get_state) {
        return wasmExports.hero_get_state();
    }
    return 0;
}

/**
 * Check if hero is moving
 * @returns {boolean} true if moving
 */
export function heroIsMoving() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return false;
    }

    if (wasmExports.hero_is_moving) {
        return wasmExports.hero_is_moving() !== 0;
    }
    return false;
}

/**
 * Update all horizontal platforms
 * Called every frame to move platforms back and forth
 */
export function updateHorizontalPlatforms() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.update_horizontal_platforms) {
        wasmExports.update_horizontal_platforms();
    }
}

/**
 * Hero interaction check
 * Called every rAF frame to check for door/item interactions
 */
export function heroInteractionCheck() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.hero_interaction_check) {
        wasmExports.hero_interaction_check();
    }
}

// ============================================================================
// Combat API
// ============================================================================

/**
 * Initialize combat system
 */
export function combatInit() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.combat_init) {
        wasmExports.combat_init();
    }
}

/**
 * Get combat timer (death animation timer)
 * @returns {number} Timer value (0-7)
 */
export function getCombatTimer() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.get_combat_timer) {
        return wasmExports.get_combat_timer();
    }
    return 0;
}

/**
 * Set combat flag
 * @param {number} value Flag value
 */
export function setCombatFlag(value) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.set_combat_flag) {
        wasmExports.set_combat_flag(value);
    }
}

// ============================================================================
// Boss Battle API
// ============================================================================

/**
 * Initialize boss battle
 * Called when entering a boss cavern
 */
export function initBossBattle() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.init_boss_battle) {
        wasmExports.init_boss_battle();
    }
}

/**
 * Deal damage to boss
 * @param {number} damage Amount of damage
 */
export function bossTakeDamage(damage) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.boss_take_damage) {
        wasmExports.boss_take_damage(damage);
    }
}

/**
 * Get current boss HP
 * @returns {number} Current HP
 */
export function getBossHp() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.get_boss_hp) {
        return wasmExports.get_boss_hp();
    }
    return 0;
}

/**
 * Get boss max HP
 * @returns {number} Maximum HP
 */
export function getBossMaxHp() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return 0;
    }

    if (wasmExports.get_boss_max_hp) {
        return wasmExports.get_boss_max_hp();
    }
    return 0;
}

/**
 * Check if boss is defeated
 * @returns {boolean} true if defeated
 */
export function isBossDefeated() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return false;
    }

    if (wasmExports.is_boss_defeated) {
        return wasmExports.is_boss_defeated() !== 0;
    }
    return false;
}

export function getTownPendingTransitionFlag() {
    if (!wasmMemory) return 0;
    return wasmMemory[gMemoryBase + 0xFFF4];
}

export function getTownPendingTransition() {
    if (!wasmMemory) return null;
    const base = gMemoryBase;
    return {
        mapId:     wasmMemory[base + 0xFFF1],  // dest map id (0x80 already set)
        patId:     wasmMemory[base + 0xFFF2],
        goingLeft: wasmMemory[base + 0xFFF3] !== 0,
    };
}

export function townCompleteTransition() {
    wasmExports?.wasm_town_complete_transition?.();
}

export function townFinishConversation() {
    wasmExports?.wasm_town_conversation_finish?.();
}

export function townFinishBuilding() {
    wasmExports?.wasm_town_building_finish?.();
}

export function dungeonInit(mapId) {
    wasmExports?.wasm_dungeon_init?.(mapId);
}

export function dungeonUpdate() {
    wasmExports?.wasm_dungeon_update?.();
}

export function dungeonFullTick() {
    wasmExports?.wasm_dungeon_full_tick?.();
}

export function dungeonGetViewportTop() {
    return wasmExports?.wasm_dungeon_get_viewport_top?.() ?? 0;
}

export function dungeonGetFullMapPtr() {
    return wasmExports?.wasm_dungeon_get_full_map_ptr?.() ?? 0x30000;
}

export function dungeonGetEntityTable() {
    return wasmExports?.wasm_dungeon_get_entity_table?.() ?? 0;
}

export function dungeonGetEntityCount() {
    return wasmExports?.wasm_dungeon_get_entity_count?.() ?? 0;
}

export function dungeonGetState() {
    return wasmExports?.wasm_dungeon_get_state?.() ?? 0;
}

export function dungeonGetRenderRequest() {
    return wasmExports?.wasm_dungeon_get_render_request?.() ?? 0;
}

export function dungeonClearRenderRequest() {
    wasmExports?.wasm_dungeon_clear_render_request?.();
}

// seg1-based offsets
const REACH_TABLE_OFFSET = 0xB002;  // 14 pointers (28 bytes) 0xB002..0xB01D
const REACH_LISTS_OFFSET = 0xB01E;  // actual byte lists (grows forward)

/**
 * Convert the JS sword‑reach object into the layout expected by
 * apply_sword_hit_to_map_tiles() and write it to WASM memory.
 *
 * @param {Object} reachObj - Sword reachability object with keys 0,2,4,…,26, 
 * Each value is an array of bytes representing the reachability list for that phase, FF-terminated.
 * Empty arrays 12 and 14 provided for alignment purposes only.
 */
export function setDungeonSwordReach(reachObj) {
    if (!wasmMemory) {
        console.error('WASM memory not ready');
        return;
    }

    const seg1Base = gMemoryBase + SEG1_BASE;
    let tablePtr = seg1Base + REACH_TABLE_OFFSET;

    // Write all byte lists contiguously starting at REACH_LISTS_OFFSET
    let listWritePtr = seg1Base + REACH_LISTS_OFFSET;

    // The possible indices (even numbers 0..26)
    for (let idx = 0; idx <= 26; idx += 2) {
        let bytes = reachObj[idx];
        // Compute offset BEFORE writing, so the table entry points to the START of this list
        const off = listWritePtr - seg1Base;
        for (let i = 0; i < bytes.length; i++) {
            wasmMemory[listWritePtr++] = bytes[i];
        }
        // Write the jump table at REACH_TABLE_OFFSET
        // (14 entries, each a 16‑bit little‑endian seg1‑relative offset)
        // For empty entries idx=12 and idx=14, write any value (it will be ignored by apply_sword_hit_to_map_tiles)
        wasmMemory[tablePtr++] = off & 0xFF;
        wasmMemory[tablePtr++] = (off >> 8) & 0xFF;
    }
}
