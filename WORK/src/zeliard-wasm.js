// zeliard-wasm.js - JavaScript bridge for Zeliard WASM module
// Uses native WebAssembly API (no Emscripten runtime required)

let wasmInstance = null;
let wasmMemory = null;
let wasmExports = null;
let gMemoryBase = 0;  // Offset of g_memory array in WASM linear memory

// Memory layout constants (must match zeliard.h)
// These are offsets within g_memory, not absolute WASM memory offsets
const MEM_MDT_DATA = 0xC000;
const MEM_PROXIMITY_MAP = 0xE000;
const MEM_VIEWPORT_BUFFER = 0xE900;
const MEM_SAVE_DATA = 0x0000;
const MEM_INPUT_BUFFER = 0xFF16; // 4 bytes
const MEMORY_SIZE = 64 * 1024 * 1024; // 64MB

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
        const wasmModule = await WebAssembly.instantiate(wasmBytes);

        wasmInstance = wasmModule.instance;
        wasmExports = wasmInstance.exports;

        // Get the exported memory
        if (wasmExports.memory) {
            wasmMemory = new Uint8Array(wasmExports.memory.buffer);
        } else {
            throw new Error('WASM module does not export memory');
        }

        // Get g_memory base address
        if (wasmExports.get_memory_base) {
            gMemoryBase = wasmExports.get_memory_base();
            console.log('g_memory base offset:', gMemoryBase, '(0x' + gMemoryBase.toString(16) + ')');
        } else {
            // Fallback: assume g_memory starts at 0
            gMemoryBase = 0;
            console.log('get_memory_base not exported, assuming g_memory at offset 0');
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

    const mdtStart = gMemoryBase + MEM_MDT_DATA;

    // Copy MDT data to WASM memory at 0xC000
    for (let i = 0; i < mdtData.length; i++) {
        wasmMemory[mdtStart + i] = mdtData[i];
    }

    // Call wasm_load_mdt with pointer and size
    if (wasmExports.wasm_load_mdt) {
        const result = wasmExports.wasm_load_mdt(mdtStart, mdtData.length);
        if (result === 0) {
            console.log('MDT loaded at 0x' + MEM_MDT_DATA.toString(16));
        } else {
            console.error('MDT load failed:', result);
        }
        return result;
    }

    return 0;
}

/**
 * Initialize cavern with spawn point
 * @param {number} spawnX - Hero spawn X coordinate
 * @param {number} spawnY - Hero spawn Y coordinate
 * @param {number} direction - 0=right, 1=left
 */
export function initCavern(spawnX, spawnY, direction) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }
    
    if (wasmExports.wasm_init_cavern) {
        wasmExports.wasm_init_cavern(spawnX, spawnY, direction);
    }
}

/**
 * Get MDT header data
 * @returns {object} MDT header with all offsets
 */
export function getMdtHeader() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    const offset = gMemoryBase + MEM_MDT_DATA;

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

    const header = getMdtHeader();
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
 * Get monster buffer (0xE900)
 * @returns {Uint8Array} View of monster buffer (28*19 bytes, 1 byte per monster)
 */
export function getMonsterBuffer() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    return new Uint8Array(wasmMemory.buffer, gMemoryBase + MEM_VIEWPORT_BUFFER, 28*19);
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

    return new Uint8Array(wasmMemory.buffer, gMemoryBase + MEM_PROXIMITY_MAP, 36 * 64);
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
 * Get hero position from WASM save data
 * @returns {object} Hero position {x, y, xInViewport, yInViewport}
 */
export function getHeroPosition() {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return null;
    }

    const offset = gMemoryBase + MEM_SAVE_DATA;

    function readU8(addr) { return wasmMemory[addr]; }
    function readU16(addr) { return wasmMemory[addr] | (wasmMemory[addr + 1] << 8); }
    
    return {
        hero_x_minus_18_abs: readU16(offset + 0x80),           // hero_x_minus_18_abs
        hero_y_rel: readU8(offset + 0x82),        // hero_y_rel
        hero_x_in_viewport: readU8(offset + 0x83),  // hero_x_in_viewport
        hero_head_y_in_viewport: readU8(offset + 0x84)   // hero_head_y_in_viewport
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
 * @param {number} x - Hero absolute X position (hero_x_minus_18_abs)
 * @param {number} y - Hero Y position (hero_y_rel)
 */
export function setHeroPosition(x, y) {
    if (!wasmMemory) {
        console.error('WASM not initialized');
        return;
    }

    const offset = gMemoryBase + MEM_SAVE_DATA;
    const heroStatsOffset = 0x80;  // Matches Fight.asm offset
    
    // Set hero_x_minus_18_abs (uint16 little-endian)
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
 * Call Cavern_Game_Init - main dungeon initialization
 */
export function Cavern_Game_Init() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }
    
    if (wasmExports.Cavern_Game_Init) {
        wasmExports.Cavern_Game_Init();
        console.log('Cavern_Game_Init called');
    }
}

/**
 * Unpack MDT map data into proximity map centered on hero
 */
export function unpack_map() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }
    
    if (wasmExports.unpack_map) {
        wasmExports.unpack_map();
        console.log(`unpack_map called`);
    }
}

/**
 * Unpack MDT map data into proximity map centered on hero
 * @param {number} heroX - Hero's absolute X coordinate
 * @param {number} heroY - Hero's absolute Y coordinate
 */
export function unpack_map_internal(heroX, heroY) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }
    
    if (wasmExports.unpack_map_internal) {
        wasmExports.unpack_map_internal(heroX, heroY);
        console.log(`unpack_map_internal called (heroX=${heroX}, heroY=${heroY})`);
    }
}

/**
 * Read raw bytes from WASM memory
 * @param {number} offset - Memory offset (relative to g_memory base)
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
 * @param {number} offset - Memory offset (relative to g_memory base)
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
 * @param {number} offset - Memory offset (relative to g_memory base)
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
 * Initialize input buffer
 * Call once at game startup
 */
export function inputInit() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.input_init) {
        wasmExports.input_init();
    }
}

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

    console.log('inputSetKeys called with:', keys, '0x' + keys.toString(16));
    
    if (wasmExports.input_set_keys) {
        wasmExports.input_set_keys(keys);
    } else {
        console.error('input_set_keys not exported!');
    }
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
 * Build input bitmask from JavaScript key state
 * Helper function to convert JS keys to WASM input flags
 * @param {object} keys - Object with boolean values for each key
 * @returns {number} Bitmask of pressed keys
 */
export function buildInputBitmask(keys) {
    let bitmask = INPUT_FLAGS.NONE;

    if (keys.ArrowUp) bitmask |= INPUT_FLAGS.UP;
    if (keys.ArrowDown) bitmask |= INPUT_FLAGS.DOWN;
    if (keys.ArrowLeft) bitmask |= INPUT_FLAGS.LEFT;
    if (keys.ArrowRight) bitmask |= INPUT_FLAGS.RIGHT;
    if (keys.Enter) bitmask |= INPUT_FLAGS.ENTER;
    if (keys.Space) bitmask |= INPUT_FLAGS.SPACE;
    if (keys.Alt) bitmask |= INPUT_FLAGS.ALT;
    if (keys.Escape) bitmask |= INPUT_FLAGS.ESC;

    return bitmask;
}

/**
 * Initialize transition from town to dungeon
 * @param {number} x hero_x_minus_18_abs
 * @param {number} y hero_y_rel
 * @param {number} c3 byte_C3
 * @param {number} cavern_id id of the cavern to enter
 */
export function townToDungeonTransition(x, y, c3, cavern_id) {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.town_to_dungeon_transition) {
        wasmExports.town_to_dungeon_transition(x, y, c3, cavern_id);
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
 * Called every frame to check for door/item interactions
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
 * Update combat state
 * Called every frame
 */
export function combatUpdate() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.combat_update) {
        wasmExports.combat_update();
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
 * Update boss battle
 * Called every frame during boss battle
 */
export function updateBossBattle() {
    if (!wasmExports) {
        console.error('WASM not initialized');
        return;
    }

    if (wasmExports.update_boss_battle) {
        wasmExports.update_boss_battle();
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
