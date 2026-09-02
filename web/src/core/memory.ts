/**
 * memory.ts — Zeliard g_mem layout (single source of truth).
 *
 * All constants here are *offsets within g_mem* (the 256KB Uint8Array
 * owned by ts-memory.ts). The original layout was derived from the C
 * engine's linear memory (zeliard.h); constants are now consumed only
 * by the TS engine modules.
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

/** Polled-input latch bytes written by _set_input_keys (zeliard.h 0xFF16..18). */
export const ADDR_INPUT_ALT_SPACE = 0xff16;
export const ADDR_INPUT_DIRS = 0xff17;
export const ADDR_F9_F7_F2_F1_KREJSNYQ_ESC_CTRL_SHIFT_ENTER = 0xff18;

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
export const ADDR_BYTE4                     = 0x04;     // bit7 set by control code 0x8B (endgame: final Tear of Esmesanti delivered)
export const ADDR_CALIENTE_ITEMS            = 0x34;     // bit7 = spoke to girl after Paguro; bit6 = bought Asbestos Cape
export const ADDR_FALTER_ITEMS              = 0x45;     // bit7 = Pureza warp building used (0xFF dest id)
export const ADDR_DEATH_ALREADY_PROCESSED   = 0x49;
export const ADDR_PROXIMITY_MAP_LEFT_COL    = 0x80;
export const ADDR_VIEWPORT_TOP_ROW          = 0x82;      // byte, viewport top in proximity map
export const ADDR_HERO_X_VIEW               = 0x83;
export const ADDR_HERO_ALMAS                = 0x8b;
export const ADDR_HERO_LEVEL                = 0x8d;
export const ADDR_HERO_HP                   = 0x90;
export const ADDR_SWORD_TYPE                = 0x92;
export const ADDR_ELF_CREST                 = 0x9A;     // 0xFF = obtained from citizen after defeating Paguro
export const ADDR_HERO_CREST                = 0x9C;     // 0xFF = Hero's Crest obtained
export const ADDR_TEAR_COUNT                = 0xA0;
export const ADDR_FACING                    = 0xC2;
export const ADDR_PLACE_MAP_ID              = 0xC4;
export const ADDR_LAST_SAGE_VISITED         = 0xC5;

// Engine-internal addresses (not in save image, used by dungeon engine)
export const ADDR_HERO_Y                   = 0xFF35; // hero absolute Y position
export const ADDR_BOSS_BEING_HIT           = 0xFF2E;
export const ADDR_ANIM_TIMER               = 0xFF1B; // word

export const ADDR_BOSS_STATE_BLOCK        = 0x9D00;
export const ADDR_BYTE_9EED               = 0x9EED; // set on casting "guerra"
export const ADDR_MONSTER_XP_TABLE        = 0xA008; // 8 bytes
export const ADDR_MONSTER_DAMAGE_TABLE    = 0xA010; // 8 bytes
export const ADDR_BOSS_PLACEMENT          = 0x9F01;
export const ADDR_HERO_X_IN_PROXIMITY_MAP = 0x9F1A; // word


export const ADDR_TOWN_DESCRIPTOR_PTR     = 0xC000;
export const ADDR_MAP_WIDTH               = 0xC002; // word (from MDT)
export const ADDR_NPC_CONVERSATIONS       = 0xC00D;
export const ADDR_NPC_ARRAY_PTR           = 0xC00F;
export const ADDR_MONSTERS_LIST           = 0xC010; // word — pointer to monster table (16-byte entries)
export const ADDR_CAVERN_LEVEL            = 0xC012;
export const ADDR_TEAR_X                  = 0xC013; // word
export const ADDR_CAVERN_SIGNS_INFO       = 0xC017; // word
export const ADDR_PROXIMITY_MAP           = 0xE000; // 36*64 circular buffer
export const ADDR_MAGIC_PROJECTILES       = 0xEB15; // 4 slots × 16 bytes each
export const ADDR_MAGIA_STONE_SPRITE0     = 0xEB60; // magia stone sprite 0 (7 bytes each, 4 sprites)
export const ADDR_MAGIA_STONE_SPRITE1     = 0xEB67;
export const ADDR_MAGIA_STONE_SPRITE2     = 0xEB6E;
export const ADDR_MAGIA_STONE_SPRITE3     = 0xEB75;
export const ADDR_PROJECTILES_LIST        = 0xEB80; // 13×32 bytes, terminated by 0xFF (enemy projectiles)
export const ADDR_PROXIMITY_LAYER2        = 0xED20; // 128 bytes layer-2 tile mapping
export const ADDR_BOSS_EXPLOSIONS_LIST    = 0xEDA0; // up to 32 entities (4 bytes each)
export const ADDR_FRAME_TIMER             = 0xFF1A;
export const ADDR_SPACEBAR_LATCH          = 0xFF1D  // byte
export const ADDR_ALTKEY_LATCH            = 0xFF1E  // byte
export const ADDR_VIEWPORT_LEFT_TOP       = 0xFF31; // word; address within proximity map, corresponding to viewport row 0, column -4; 0E000h .. 0E8FFh
export const ADDR_SPEED_CONST             = 0xFF33;
export const ADDR_JUMP_PHASE_FLAGS        = 0xFF3D;
export const ADDR_SLOPE_DIRECTION         = 0xFF42; // 1=right, 2=left, 0=none
export const ADDR_SWORD_SWING_FLAG        = 0xFF43;
export const ADDR_SWORD_HIT_TYPE          = 0xFF45;
export const ADDR_SWORD_MOVEMENT_PHASE    = 0xFF46;
export const ADDR_SOUND_FX_REQUEST        = 0xFF75;
export const ADDR_HEARTBEAT_VOLUME        = 0xFF08; // boss-heartbeat volume; not part of a saved scene
// Semaphores for js-wasm communication
export const ADDR_DUNGEON_STATE           = 0xFF90;
export const ADDR_DUNGEON_FRAME_PHASE     = 0xFF91;
export const ADDR_RENDER_REQUEST          = 0xFF92;
export const ADDR_RENDER_DONE             = 0xFF93;
export const ADDR_GOLD_RENDER_REQUEST     = 0xFF94;
export const ADDR_DEATH_COUNTER           = 0xFF95;
export const ADDR_ALMAS_RENDER_REQUEST    = 0xFF98;
export const ADDR_HEALTH_BAR_REQUEST      = 0xFF99;
export const ADDR_SHIELD_HP_RENDER_REQUEST = 0xFF9A;
export const ADDR_ROKA_COLOR              = 0xFF9E;
export const ADDR_BOSS_HEALTH_REQUEST     = 0xFF9F;
export const ADDR_BOSS_MODE               = 0xFFA0;
export const ADDR_MAGIC_LEFT_RENDER_REQUEST = 0xFFA3;
export const ADDR_SWORD_RENDER_REQUEST     = 0xFFA4;
export const ADDR_SWORD_GFX_RELOAD_REQUEST = 0xFFA5;
export const ADDR_DUNGEON_EXIT_FLAG       = 0xFFE2;
export const ADDR_HERO_DEATH_FLAG         = 0xFFE3;

export const ADDR_PENDING_TRANSITION_FLAG = 0xFFF4;
export const ADDR_CONVERSATION_ACTIVE     = 0xFFF5;
export const ADDR_BUILDING_ACTIVE         = 0xFFFA;
export const ADDR_BUILDING_DEST_ID        = 0xFFFB;
export const ADDR_PENDING_DUNGEON_MAP     = 0xFFFC;
export const ADDR_PENDING_DUNGEON_FLAG    = 0xFFFD;
export const ADDR_SCROLL_FLAG             = 0xFFF0;

export const DUNGEON_STATE_DEATH_FALL = 2;
export const DUNGEON_STATE_DEATH_FADE = 4;
export const DUNGEON_STATE_BOSS_ENCOUNTER = 5;
export const DUNGEON_STATE_ROKA_RUN = 7;
export const DUNGEON_STATE_ROKADEMO = 9;
