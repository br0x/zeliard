/**
 * memory.ts — Zeliard WASM linear-memory layout (single source of truth).
 *
 * The C engine owns a flat `g_mem` array inside WASM linear memory and shares
 * it with JS. All constants here are *offsets within g_mem* (not absolute
 * addresses); the bridge adds the runtime `get_memory_base()` offset.
 *
 * IMPORTANT: every constant must match its counterpart in src/zeliard.h.
 * tests/bridge.test.ts cross-checks a subset against the header text so the
 * two sides cannot drift silently.
 */

/** Size of g_mem in C: 64KB * 4 segments (zeliard.h). */
export const MEMORY_SIZE = 64 * 1024 * 1024;

/** seg1 base offset: MEM8_1/MEM16_1 access g_mem[addr + SEG1_BASE]. */
export const SEG1_BASE = 0x10000;

/** 256 bytes — Save data (xxx.sav), zeliard.h MEM_SAVE_DATA. */
export const MEM_SAVE_DATA = 0x0000;

/** MDT dungeon/town data, zeliard.h ADDR_MDT. */
export const ADDR_MDT = 0xC000;

/** WORD pointer to boss state struct. */
export const ADDR_BOSS_STATE_PTR = 0xA002;

/** Trajectories definitions (each entry terminated by 0xFF byte... see setTrajectories). */
export const ADDR_TRAJECTORIES = 0xA531;

/** Town pending-transition scratch bytes (written by wasm town code). */
export const ADDR_TOWN_TRANSITION_MAP = 0xFFF1;
export const ADDR_TOWN_TRANSITION_PAT = 0xFFF2;
export const ADDR_TOWN_TRANSITION_DIR = 0xFFF3;
export const ADDR_TOWN_TRANSITION_FLAG = 0xFFF4;

/**
 * Sword-reach tables written by setDungeonSwordReach, consumed by
 * apply_sword_hit_to_map_tiles(): 14 little-endian seg1-relative pointers at
 * REACH_TABLE_OFFSET, followed by the FF-terminated reach lists.
 */
export const REACH_TABLE_OFFSET = 0xB002; // 14 pointers (28 bytes) 0xB002..0xB01D
export const REACH_LISTS_OFFSET = 0xB01E; // actual byte lists (grows forward)

// Input flags (bitmask) — must match InputFlags enum in zeliard.h.
export const INPUT_FLAGS = {
    NONE: 0x00,
    UP: 0x01,
    DOWN: 0x02,
    LEFT: 0x04,
    RIGHT: 0x08,
    ENTER: 0x10,
    SPACE: 0x20,
    ALT: 0x40,
    ESC: 0x80,
} as const;

export type InputFlagName = Exclude<keyof typeof INPUT_FLAGS, 'NONE'>;

/** Key-state object as produced by the input layer (game.js key tracking). */
export interface KeyState {
    ArrowUp?: boolean | number;
    ArrowDown?: boolean | number;
    ArrowLeft?: boolean | number;
    ArrowRight?: boolean | number;
    Enter?: boolean | number;
    Space?: boolean | number;
    Alt?: boolean | number;
    Escape?: boolean | number;
}

/** Pure mapping from JS key state to the INPUT_FLAGS bitmask sent to wasm. */
export function keyStateToBitmask(keys: KeyState): number {
    let bitmask: number = INPUT_FLAGS.NONE;

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

/** MDT header for dungeon maps (offsets are u16 LE words from the MDT start). */
export interface CavernMdtHeader {
    map_width: number;
    vert_platforms_offset: number;
    air_streams_offset: number;
    horiz_platforms_offset: number;
    doors_offset: number;
    items_check_offset: number;
    cavern_name_offset: number;
    monsters_offset: number;
}

/**
 * MDT header for town maps.
 *
 * NOTE on pointer fields (descriptor/name/tables): they are seg0-ABSOLUTE
 * addresses, not MDT-relative — the MDT occupies 0xC000..0xFFFF of the
 * original 64K segment, so a pointer to MDT offset 0x30 is stored as 0xC030.
 * The bridge relies on this in getTownName/getCavernName/getMusicTrackId.
 */
export interface TownMdtHeader {
    town_descriptor_offset: number;
    map_width: number;
    town_name_offset: number;
    town_id: number;
    town_transition_table: number;
    doors_offset: number;
    dungeon_entrance_table: number;
    npc_conversations_offset: number;
    npc_array_offset: number;
    npc_patrol_boundaries: number;
    word_c015: number;
    town_tiles: number;
}

/** Pending town map transition, read from g_mem scratch bytes. */
export interface TownPendingTransition {
    /** destination map id */
    mapId: number;
    patId: number;
    goingLeft: boolean;
}
