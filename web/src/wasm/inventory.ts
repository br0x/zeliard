/**
 * inventory.ts — engine inventory & porting tracker (Stage 5a).
 *
 * A machine-readable ownership map of the wasm/C engine, consumed by every
 * later Phase B stage:
 *
 *  - ENGINE_REGIONS: every g_mem region — owner subsystem, access notes,
 *    and the stage when the state stops being shared linear memory.
 *  - ENGINE_EXPORTS: every function in `ZeliardExports` — owner subsystem,
 *    regions read/written, and the stage that ports it to TS.
 *  - exportsForStage(): per-stage work lists for the porting tracker.
 *
 * Structural tests in tests/inventory.test.ts are the drift guard: every
 * numeric constant exported by memory.ts must be claimed by exactly one
 * region, regions must not silently overlap, and every export name must be
 * listed exactly once (enforced at compile time below AND against the real
 * wasm binary in tests).
 */

import type { ZeliardExports } from './bridge.js';
import { SEG1_BASE } from './memory.js';

/** Engine subsystems — the porting units of Phase B stages 6–10. */
export type Subsystem =
    | 'glue' // boot / memory plumbing; deleted with the bridge in Stage 10
    | 'town' // town.c
    | 'dungeon' // dungeon.c core (physics, scrolling, entity table)
    | 'enemies' // eai1-8.c + boss files
    | 'data' // unpack.c / data.c / graphics decoders
    | 'render' // render-request consumers (magia sprites, layer-2 map)
    | 'audio'
    | 'save';
/** Stage that owns moving an export/state to TS. */
export type PortStage = 5 | 6 | 7 | 8 | 9 | 10;

export interface MemoryRegion {
    /** Stable identifier referenced by ExportEntry.reads/writes. */
    name: string;
    /** Start address, inclusive. Interpreted relative to `segment`. */
    start: number;
    /** End address, exclusive. */
    end: number;
    /**
     * 0 = offsets are direct g_mem addresses; 1 = offsets are seg1-relative
     * (the C SEG1_16 accessors add 0x10000).
     */
    segment: 0 | 1;
    owner: Subsystem;
    description: string;
    /** Stage when this state stops being shared linear memory. */
    portStage: PortStage;
    /** Names of other regions this intentionally overlaps (none today). */
    overlaps?: readonly string[];
}

export type EngineExportName = Exclude<keyof ZeliardExports, 'memory'>;

export interface ExportEntry {
    name: EngineExportName;
    /** Human-readable C signature summary. */
    signature: string;
    owner: Subsystem;
    /** Region names (ENGINE_REGIONS.name) this export reads. */
    reads: readonly string[];
    /** Region names this export writes. */
    writes: readonly string[];
    /** Stage that ports this export to TS. */
    portStage: PortStage;
    notes: string;
}

// ============================================================================
// g_mem regions
//
// Extents marked "approximate upper bound" bound scratch areas whose true
// size is defined by runtime data (e.g. FF-terminated lists); only the start
// addresses are load-bearing for the drift guard.
// ============================================================================

export const ENGINE_REGIONS: readonly MemoryRegion[] = [
    {
        name: 'save-state',
        start: 0x0000,
        end: 0x0100,
        segment: 0,
        owner: 'save',
        description:
            '256-byte save image (MEM_SAVE_DATA): hero stats (gold/almas/xp/hp/sword/shield), ' +
            'quest flags (king spoken, caliente/falter items, crests, tear count), spell counts, ' +
            'current place map id. Codec lives in platform/save.ts since Stage 2.',
        portStage: 10,
    },
    {
        name: 'heartbeat-volume',
        start: 0xff08,
        end: 0xff09,
        segment: 0,
        owner: 'audio',
        description: 'Boss-heartbeat volume byte written by dungeon code, polled by SoundManager.',
        portStage: 8,
    },
    {
        name: 'input-latches',
        start: 0xff16,
        end: 0xff19,
        segment: 0,
        owner: 'glue',
        description:
            'Polled input latches written by _set_input_keys: 0xFF16 alt/space, 0xFF17 dirs ' +
            '(up/down/left/right bits), 0xFF18 word F9/F7/F2/F1/KREJSNYQ/Esc/Ctrl/Shift/Enter. ' +
            'Space/Alt edge latches are also poked directly from main.ts.',
        portStage: 5,
    },
    {
        name: 'dungeon-runtime-flags',
        start: 0xff1a,
        end: 0xff50,
        segment: 0,
        owner: 'dungeon',
        description:
            'Per-frame dungeon simulation flags: frame timer, spacebar/altkey latches, sprite ' +
            'flash, boss-dead flag, viewport-left-top word, speed constant, boss-cavern flag, ' +
            'hero visibility/squat/rope/jump/spell/shield-anim/slope/sword-swing state.',
        portStage: 8,
    },
    {
        name: 'sfx-request',
        start: 0xff75,
        end: 0xff76,
        segment: 0,
        owner: 'audio',
        description: 'SFX request byte: engine writes a request, SoundManager plays and clears it.',
        portStage: 8,
    },
    {
        name: 'engine-semaphores',
        start: 0xff90,
        end: 0xffa6,
        segment: 0,
        owner: 'glue',
        description:
            'JS↔wasm communication semaphores: dungeon state/frame phase, render/done requests ' +
            '(viewport, gold, almas, health bar, shield hp, boss health, magic left, sword gfx), ' +
            'death counter, notification id/flag, roka phase/color, boss mode, cavern sign flag/index.',
        portStage: 10,
    },
    {
        name: 'exit-death-flags',
        start: 0xffe2,
        end: 0xffe4,
        segment: 0,
        owner: 'dungeon',
        description:
            'Cavern exit flag (0xFFE2) and hero death flag (0xFFE3), polled by main.ts to end the scene.',
        portStage: 8,
    },
    {
        name: 'town-transition-scratch',
        start: 0xfff1,
        end: 0xfff5,
        segment: 0,
        owner: 'town',
        description:
            'Pending town→town/town→dungeon transition bytes: dest map id, pat id, direction, flag.',
        portStage: 7,
    },
    {
        name: 'scene-flow-flags',
        start: 0xfff5,
        end: 0xfffe,
        segment: 0,
        owner: 'town',
        description:
            'Scene-flow coordination: conversation active, building active + dest id, pending ' +
            'dungeon map id + flag. Written by town code, consumed by main.ts orchestrators.',
        portStage: 7,
    },
    {
        name: 'boss-state-ptr',
        start: 0xa002,
        end: 0xa004,
        segment: 0,
        owner: 'enemies',
        description: 'WORD pointer to the active boss descriptor block (name read via getBossName).',
        portStage: 9,
    },
    {
        name: 'monster-config',
        start: 0xa006,
        end: 0xa0c0,
        segment: 0,
        owner: 'enemies',
        description:
            'Per-cavern monster configuration written from TS before dungeon_init: dispatch ' +
            'pointer (0xA006), XP table (0xA008..), damage table (0xA010..). Approximate upper bound.',
        portStage: 9,
    },
    {
        name: 'death-descriptors',
        start: 0xa0c0,
        end: 0xa100,
        segment: 0,
        owner: 'enemies',
        description:
            'Death-descriptor tables: WORD pointer at 0xA006 targets dispatch array of 8 WORD ' +
            'pointers (0xA0C0) into individual 4-byte descriptors (0xA0E0+).',
        portStage: 9,
    },
    {
        name: 'trajectories',
        start: 0xa531,
        end: 0xa900,
        segment: 0,
        owner: 'enemies',
        description:
            'Enemy/boss movement trajectory definitions written back-to-back, each terminated ' +
            'per setTrajectories(). Approximate upper bound.',
        portStage: 9,
    },
    {
        name: 'boss-state-block',
        start: 0x9d00,
        end: 0xa000,
        segment: 0,
        owner: 'enemies',
        description:
            'Active boss encounter state: descriptor block at 0x9D00 (encoded by encodeBossState), ' +
            'guerra flag 0x9EED, 0x9F00 scratch, placement 0x9F01, hero-x-in-proximity word, door target/features.',
        portStage: 9,
    },
    {
        name: 'mdt-window',
        start: 0xc000,
        end: 0xe000,
        segment: 0,
        owner: 'data',
        description:
            'Loaded MDT file image (loadMdt copies raw bytes here): header words (descriptor/name/' +
            'tables pointers, seg0-absolute), tile maps, NPC/conversation data. Parsed today by ' +
            'bridge getters; Stage 6 moves parsing onto Uint8Array.',
        portStage: 6,
    },
    {
        name: 'proximity-map',
        start: 0xe000,
        end: 0xe900,
        segment: 0,
        owner: 'dungeon',
        description: '36×64 circular proximity-window tile buffer scanned by renderer and logic.',
        portStage: 8,
    },
    {
        name: 'viewport-entities-cache',
        start: 0xe900,
        end: 0xeb15,
        segment: 0,
        owner: 'dungeon',
        description: '28×19 viewport entity-marker cache built each tick from the proximity map.',
        portStage: 8,
    },
    {
        name: 'magic-projectiles',
        start: 0xeb15,
        end: 0xeb55,
        segment: 0,
        owner: 'dungeon',
        description: '4 slots × 16 bytes of hero magic projectile state.',
        portStage: 8,
    },
    {
        name: 'magia-stone-sprites',
        start: 0xeb60,
        end: 0xeb80,
        segment: 0,
        owner: 'render',
        description: 'Magia stone sprite rows (4 sprites × 7 bytes) read by the dungeon renderer.',
        portStage: 8,
    },
    {
        name: 'enemy-projectiles',
        start: 0xeb80,
        end: 0xed20,
        segment: 0,
        owner: 'enemies',
        description: '13 entries × 32 bytes of enemy projectile state, 0xFF-terminated list.',
        portStage: 9,
    },
    {
        name: 'layer2-tile-map',
        start: 0xed20,
        end: 0xedA0,
        segment: 0,
        owner: 'render',
        description: '128-byte layer-2 tile mapping used when blitting the proximity window.',
        portStage: 8,
    },
    {
        name: 'boss-explosions-list',
        start: 0xeda0,
        end: 0xee20,
        segment: 0,
        owner: 'enemies',
        description: 'Up to 32 explosion entities (4 bytes each) spawned on boss death.',
        portStage: 9,
    },
    {
        name: 'sword-reach-tables',
        start: 0xb002,
        end: 0xb400,
        segment: 1,
        owner: 'dungeon',
        description:
            'seg1:0xB002 jump table (14 seg1-relative WORDs) → FF-terminated reachability lists ' +
            'at seg1:0xB01E+, written by setDungeonSwordReach for apply_sword_hit_to_map_tiles(). ' +
            'Approximate upper bound on the lists.',
        portStage: 8,
    },
    {
        name: 'dungeon-config-lists',
        start: 0x8000,
        end: 0x8030,
        segment: 1,
        owner: 'dungeon',
        description:
            'seg1 config lists written from TS before dungeon_init: passable tiles (24B at 0x8000), ' +
            'slope tiles left/right (4B each), aggressive ground (4B), airflows (12B), plus the ' +
            'special-tile-list pointer word at 0x8002.',
        portStage: 8,
    },
    {
        name: 'special-tile-list',
        start: 0x9000,
        end: 0x9040,
        segment: 1,
        owner: 'dungeon',
        description: 'seg1:0x9000 count + tile-id bytes pointed to by the word at seg1:0x8002.',
        portStage: 8,
    },
] as const;

// ============================================================================
// Exported functions
//
// The compile-time guard below makes tsc fail if an export of ZeliardExports
// is missing from this list; the test suite additionally checks it against
// the live wasm binary.
// ============================================================================

export const ENGINE_EXPORT_ENTRIES: readonly ExportEntry[] = [
    {
        name: 'wasm_init',
        signature: 'void wasm_init(void)',
        owner: 'glue',
        reads: [],
        writes: [],
        portStage: 10,
        notes: 'Bootstraps C statics; disappears together with the binary.',
    },
    {
        name: 'get_memory_base',
        signature: 'uint32 get_memory_base(void)',
        owner: 'glue',
        reads: [],
        writes: [],
        portStage: 10,
        notes: 'Returns g_mem base within linear memory; bridge-only concern.',
    },
    {
        name: 'wasm_get_mem_ptr',
        signature: 'uint32 wasm_get_mem_ptr(void)',
        owner: 'glue',
        reads: [],
        writes: [],
        portStage: 10,
        notes: 'Legacy g_mem pointer accessor; unused by TS code.',
    },
    {
        name: 'wasm_debug_unpack_map',
        signature: 'void wasm_debug_unpack_map(void)',
        owner: 'glue',
        reads: ['mdt-window'],
        writes: ['proximity-map', 'dungeon-runtime-flags'],
        portStage: 10,
        notes: 'Test-only unpack_map oracle for Stage 6 parity tests; no game code calls it.',
    },
    {
        name: 'wasm_set_door_x1',
        signature: 'void wasm_set_door_x1(uint16_t x1)',
        owner: 'town',
        reads: [],
        writes: [],
        portStage: 8,
        notes: 'Bridges the town→dungeon door-x C global across prepare_dungeon; disappears at Stage 8.',
    },
    {
        name: 'wasm_debug_monster_move',
        signature: 'uint8_t wasm_debug_monster_move(uint16_t m, uint8_t dir)',
        owner: 'enemies',
        reads: ['proximity-map', 'mdt-window'],
        writes: [],
        portStage: 9,
        notes: 'Test-only monster_move_in_direction oracle for Stage 8a parity tests.',
    },
    {
        name: 'wasm_debug_check_collision',
        signature: 'uint8_t wasm_debug_check_collision(uint16_t m, uint8_t dir)',
        owner: 'enemies',
        reads: ['proximity-map'],
        writes: [],
        portStage: 9,
        notes: 'Test-only collision oracle for Stage 8a parity tests.',
    },
    {
        name: 'wasm_debug_hero_reset',
        signature: 'void wasm_debug_hero_reset(void)',
        owner: 'dungeon',
        reads: [],
        writes: [],
        portStage: 10,
        notes: 'Test-only packed-cursor reset for Stage 8b parity sequences.',
    },
    {
        name: 'wasm_debug_move_hero_right',
        signature: 'uint8_t wasm_debug_move_hero_right(void)',
        owner: 'dungeon',
        reads: ['proximity-map'],
        writes: ['proximity-map', 'enemy-projectiles'],
        portStage: 8,
        notes: 'Test-only move_hero_right_if_no_obstacles oracle (Stage 8b parity tests).',
    },
    {
        name: 'wasm_debug_move_hero_left',
        signature: 'uint8_t wasm_debug_move_hero_left(void)',
        owner: 'dungeon',
        reads: ['proximity-map'],
        writes: ['proximity-map', 'enemy-projectiles'],
        portStage: 8,
        notes: 'Test-only move_hero_left_if_no_obstacles oracle (Stage 8b parity tests).',
    },
    {
        name: 'wasm_debug_get_packed_cursors',
        signature: 'void wasm_debug_get_packed_cursors(void)',
        owner: 'dungeon',
        reads: [],
        writes: [],
        portStage: 10,
        notes: 'Test-only packed-cursor dump for Stage 8b cursor-desync triage.',
    },
    {
        name: 'wasm_debug_jump_press',
        signature: 'void wasm_debug_jump_press(void)',
        owner: 'dungeon',
        reads: ['proximity-map'],
        writes: ['proximity-map'],
        portStage: 8,
        notes: 'Test-only jump_press_handler oracle (Stage 8b vertical parity tests).',
    },
    {
        name: 'wasm_debug_try_climb_rope',
        signature: 'void wasm_debug_try_climb_rope(void)',
        owner: 'dungeon',
        reads: ['proximity-map', 'mdt-window'],
        writes: ['proximity-map', 'enemy-projectiles'],
        portStage: 8,
        notes: 'Test-only try_climb_rope oracle (Stage 8b slice-3 parity tests).',
    },
    {
        name: 'wasm_debug_platform_up',
        signature: 'uint8_t wasm_debug_platform_up(void)',
        owner: 'dungeon',
        reads: ['proximity-map'],
        writes: ['proximity-map'],
        portStage: 8,
        notes: 'Test-only try_move_platform_up oracle (Stage 8b slice-3 parity tests).',
    },
    {
        name: 'wasm_debug_platform_collapse',
        signature: 'void wasm_debug_platform_collapse(void)',
        owner: 'dungeon',
        reads: ['proximity-map'],
        writes: ['proximity-map'],
        portStage: 8,
        notes: 'Test-only hero_collapse_platform oracle (Stage 8b slice-3 parity tests).',
    },
    {
        name: 'wasm_debug_check_floor',
        signature: 'uint8_t wasm_debug_check_floor(void)',
        owner: 'dungeon',
        reads: ['proximity-map'],
        writes: [],
        portStage: 8,
        notes: 'Test-only check_floor_for_landing oracle (Stage 8b slice-3 parity tests).',
    },
    {
        name: 'wasm_debug_land_after_jump',
        signature: 'uint8_t wasm_debug_land_after_jump(void)',
        owner: 'dungeon',
        reads: [],
        writes: [],
        portStage: 8,
        notes: 'Test-only land_after_jump oracle (Stage 8b slice-3 parity tests).',
    },
    {
        name: 'wasm_debug_slope_assist',
        signature: 'void wasm_debug_slope_assist(void)',
        owner: 'dungeon',
        reads: ['proximity-map', 'mdt-window'],
        writes: ['proximity-map', 'enemy-projectiles'],
        portStage: 8,
        notes: 'Test-only slope_assist_on_landing oracle (Stage 8b slice-3 parity tests).',
    },
    {
        name: 'wasm_debug_move_platform_down',
        signature: 'uint8_t wasm_debug_move_platform_down(void)',
        owner: 'dungeon',
        reads: ['proximity-map'],
        writes: ['proximity-map'],
        portStage: 8,
        notes: 'Test-only move_platform_down_damage_monster oracle (Stage 8b slice-3 parity tests).',
    },
    {
        name: 'wasm_debug_update_all_monsters',
        signature: 'void wasm_debug_update_all_monsters(void)',
        owner: 'enemies',
        reads: ['proximity-map', 'monster-config'],
        writes: ['proximity-map'],
        portStage: 9,
        notes: 'Test-only update_all_monsters_in_map oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_monster_activation',
        signature: 'void wasm_debug_monster_activation(uint16_t m)',
        owner: 'enemies',
        reads: ['proximity-map', 'monster-config'],
        writes: ['proximity-map', 'monster-config'],
        portStage: 9,
        notes: 'Test-only monster_activation oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_check_aligned_tick',
        signature: 'uint8_t wasm_debug_check_aligned_tick(uint16_t m)',
        owner: 'enemies',
        reads: [],
        writes: ['monster-config'],
        portStage: 9,
        notes: 'Test-only check_monster_aligned_to_hero_and_tick oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_check_aggressive_ground',
        signature: 'uint8_t wasm_debug_check_aggressive_ground(uint16_t m)',
        owner: 'enemies',
        reads: ['proximity-map'],
        writes: [],
        portStage: 9,
        notes: 'Test-only check_monster_on_aggressive_ground oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_apply_sword_hit',
        signature: 'void wasm_debug_apply_sword_hit(void)',
        owner: 'enemies',
        reads: ['proximity-map', 'sword-reach-tables', 'monster-config'],
        writes: ['monster-config'],
        portStage: 9,
        notes: 'Test-only apply_sword_hit_to_map_tiles oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_hero_hits_monster',
        signature: 'void wasm_debug_hero_hits_monster(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only Hero_Hits_monster oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_get_stats',
        signature: 'uint8_t wasm_debug_get_stats(uint8_t al)',
        owner: 'enemies',
        reads: [],
        writes: [],
        portStage: 9,
        notes: 'Test-only Get_Stats oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_update_hero_xp',
        signature: 'void wasm_debug_update_hero_xp(uint16_t amount)',
        owner: 'enemies',
        reads: [],
        writes: [],
        portStage: 9,
        notes: 'Test-only update_hero_XP oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_set_entropy',
        signature: 'void wasm_debug_set_entropy(uint16_t v)',
        owner: 'glue',
        reads: [],
        writes: [],
        portStage: 10,
        notes: 'Test-only pin of the get_random entropy accumulator (outside g_mem).',
    },
    {
        name: 'wasm_debug_monsters_spawning',
        signature: 'void wasm_debug_monsters_spawning(void)',
        owner: 'enemies',
        reads: ['proximity-map', 'monster-config'],
        writes: ['proximity-map', 'monster-config'],
        portStage: 9,
        notes: 'Test-only monsters_spawning oracle, AI injected as no-op.',
    },
    {
        name: 'wasm_debug_place_monster_run_ai',
        signature: 'void wasm_debug_place_monster_run_ai(uint16_t m)',
        owner: 'enemies',
        reads: ['proximity-map', 'monster-config'],
        writes: ['proximity-map', 'monster-config'],
        portStage: 9,
        notes: 'Test-only place_monster_in_proximity_and_run_ai oracle.',
    },
    {
        name: 'wasm_debug_flag_10',
        signature: 'void wasm_debug_flag_10(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_11',
        signature: 'void wasm_debug_flag_11(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_12',
        signature: 'void wasm_debug_flag_12(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_13',
        signature: 'void wasm_debug_flag_13(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_14',
        signature: 'void wasm_debug_flag_14(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_16',
        signature: 'void wasm_debug_flag_16(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_17',
        signature: 'void wasm_debug_flag_17(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_18',
        signature: 'void wasm_debug_flag_18(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_19',
        signature: 'void wasm_debug_flag_19(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_1a',
        signature: 'void wasm_debug_flag_1a(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_1c',
        signature: 'void wasm_debug_flag_1c(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_1d',
        signature: 'void wasm_debug_flag_1d(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_flag_1e',
        signature: 'void wasm_debug_flag_1e(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_chest_handler',
        signature: 'void wasm_debug_chest_handler(uint16_t m)',
        owner: 'enemies',
        reads: ['monster-config', 'death-descriptors'],
        writes: ['monster-config', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only item/chest handler oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_set_dungeon_statics',
        signature: 'void wasm_debug_set_dungeon_statics(uint8_t, uint8_t)',
        owner: 'glue',
        reads: [],
        writes: [],
        portStage: 8,
        notes: 'Test-only pin of the g_is_from_town / saved_y_view_init statics.',
    },
    {
        name: 'wasm_debug_dungeon_update',
        signature: 'void wasm_debug_dungeon_update(void)',
        owner: 'dungeon',
        reads: ['proximity-map'],
        writes: ['proximity-map'],
        portStage: 8,
        notes: 'Test-only wasm_dungeon_update dispatcher oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_update_and_render_horiz_platforms',
        signature: 'void wasm_debug_update_and_render_horiz_platforms(void)',
        owner: 'enemies',
        reads: ['proximity-map', 'monster-config'],
        writes: ['proximity-map', 'monster-config'],
        portStage: 9,
        notes: 'Test-only horizontal-platform tick oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_render_vertical_platforms',
        signature: 'void wasm_debug_render_vertical_platforms(void)',
        owner: 'enemies',
        reads: ['proximity-map'],
        writes: ['proximity-map'],
        portStage: 9,
        notes: 'Test-only vertical-platform render oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_process_collapsing_platforms',
        signature: 'void wasm_debug_process_collapsing_platforms(void)',
        owner: 'enemies',
        reads: ['proximity-map'],
        writes: ['proximity-map'],
        portStage: 9,
        notes: 'Test-only collapsing-platform render oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_magia_stone_updates',
        signature: 'void wasm_debug_magia_stone_updates(void)',
        owner: 'enemies',
        reads: ['proximity-map', 'magia-stone-sprites'],
        writes: ['proximity-map', 'magia-stone-sprites'],
        portStage: 9,
        notes: 'Test-only magia_stone_updates oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_render_magia_stone_effect',
        signature: 'void wasm_debug_render_magia_stone_effect(void)',
        owner: 'enemies',
        reads: ['magia-stone-sprites'],
        writes: ['magia-stone-sprites'],
        portStage: 9,
        notes: 'Test-only render_magia_stone_effect oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_dispatch_spell_movement',
        signature: 'void wasm_debug_dispatch_spell_movement(void)',
        owner: 'enemies',
        reads: ['magic-projectiles', 'proximity-map'],
        writes: ['magic-projectiles', 'monster-config'],
        portStage: 9,
        notes: 'Test-only spell projectile movement oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_projectiles_collision_processing',
        signature: 'void wasm_debug_projectiles_collision_processing(void)',
        owner: 'enemies',
        reads: ['enemy-projectiles', 'proximity-map'],
        writes: ['enemy-projectiles', 'sfx-request'],
        portStage: 9,
        notes: 'Test-only projectiles_collision_processing oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_render_sword_overlay',
        signature: 'void wasm_debug_render_sword_overlay(void)',
        owner: 'dungeon',
        reads: [],
        writes: [],
        portStage: 9,
        notes: 'Test-only Render_Sword_Overlay oracle — observable state is phase/flag only.',
    },
    {
        name: 'wasm_debug_check_airflows_on_hero',
        signature: 'void wasm_debug_check_airflows_on_hero(void)',
        owner: 'enemies',
        reads: ['proximity-map'],
        writes: [],
        portStage: 9,
        notes: 'Test-only check_airflows_on_hero oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_update_boss_heartbeat_volume',
        signature: 'void wasm_debug_update_boss_heartbeat_volume(void)',
        owner: 'enemies',
        reads: [],
        writes: [],
        portStage: 9,
        notes: 'Test-only boss heartbeat volume oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_process_doors',
        signature: 'void wasm_debug_process_doors(void)',
        owner: 'enemies',
        reads: ['proximity-map'],
        writes: ['proximity-map'],
        portStage: 9,
        notes: 'Test-only process_doors oracle (Stage 8d parity tests).',
    },
    {
        name: 'wasm_debug_check_hero_contact_damage',
        signature: 'void wasm_debug_check_hero_contact_damage(void)',
        owner: 'enemies',
        reads: ['proximity-map', 'monster-config', 'death-descriptors'],
        writes: ['sfx-request'],
        portStage: 9,
        notes: 'Test-only check_hero_contact_damage oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_step_on_aggressive_ground',
        signature: 'void wasm_debug_step_on_aggressive_ground(void)',
        owner: 'enemies',
        reads: ['proximity-map'],
        writes: ['sfx-request'],
        portStage: 9,
        notes: 'Test-only step_on_aggressive_ground oracle (Stage 8c parity tests).',
    },
    {
        name: 'wasm_debug_get_random',
        signature: 'uint8_t wasm_debug_get_random(void)',
        owner: 'glue',
        reads: [],
        writes: [],
        portStage: 10,
        notes: 'Test-only get_random oracle; advances the entropy accumulator.',
    },
    {
        name: 'wasm_debug_get_entropy',
        signature: 'uint16_t wasm_debug_get_entropy(void)',
        owner: 'glue',
        reads: [],
        writes: [],
        portStage: 10,
        notes: 'Test-only read of the get_random entropy accumulator.',
    },
    {
        name: 'wasm_set_input_keys',
        signature: 'void wasm_set_input_keys(uint8_t keys)',
        owner: 'glue',
        reads: [],
        writes: ['input-latches'],
        portStage: 5,
        notes: 'Bitmask fan-out into the three input latch bytes (data.c). First leaf port.',
    },
    {
        name: 'wasm_set_scroll_floor_right_8px',
        signature: 'void wasm_set_scroll_floor_right_8px(void (*fn)(void))',
        owner: 'town',
        reads: [],
        writes: [],
        portStage: 5,
        notes: 'Installs a scroll proc into g_town_procs; port = TS owns the proc slot.',
    },
    {
        name: 'wasm_set_scroll_floor_left_8px',
        signature: 'void wasm_set_scroll_floor_left_8px(void (*fn)(void))',
        owner: 'town',
        reads: [],
        writes: [],
        portStage: 5,
        notes: 'See floor-right variant.',
    },
    {
        name: 'wasm_set_scroll_ceiling_right_4px',
        signature: 'void wasm_set_scroll_ceiling_right_4px(void (*fn)(void))',
        owner: 'town',
        reads: [],
        writes: [],
        portStage: 5,
        notes: 'See floor-right variant.',
    },
    {
        name: 'wasm_set_scroll_ceiling_left_4px',
        signature: 'void wasm_set_scroll_ceiling_left_4px(void (*fn)(void))',
        owner: 'town',
        reads: [],
        writes: [],
        portStage: 5,
        notes: 'See floor-right variant.',
    },
    {
        name: 'wasm_town_init',
        signature: 'void wasm_town_init(void)',
        owner: 'town',
        reads: ['mdt-window', 'dungeon-config-lists', 'special-tile-list'],
        writes: ['scene-flow-flags'],
        portStage: 7,
        notes: 'Town bootstrapping incl. proc table consumption.',
    },
    {
        name: 'wasm_town_set_return_before_main_loop',
        signature: 'void wasm_town_set_return_before_main_loop(int enabled)',
        owner: 'town',
        reads: [],
        writes: [],
        portStage: 7,
        notes: 'Sets the flag making town entry return instead of entering the DOS loop.',
    },
    {
        name: 'wasm_town_entry_disabling_edge_scroll',
        signature: 'void wasm_town_entry_disabling_edge_scroll(void)',
        owner: 'town',
        reads: ['mdt-window'],
        writes: ['town-transition-scratch', 'scene-flow-flags'],
        portStage: 7,
        notes: 'Building-entry path.',
    },
    {
        name: 'wasm_town_entry_enabling_edge_scroll',
        signature: 'void wasm_town_entry_enabling_edge_scroll(void)',
        owner: 'town',
        reads: ['mdt-window'],
        writes: ['town-transition-scratch', 'scene-flow-flags'],
        portStage: 7,
        notes: 'Street re-entry path.',
    },
    {
        name: 'wasm_town_update',
        signature: 'void wasm_town_update(void)',
        owner: 'town',
        reads: ['input-latches', 'mdt-window'],
        writes: [
            'town-transition-scratch',
            'scene-flow-flags',
            'sfx-request',
            'engine-semaphores',
        ],
        portStage: 7,
        notes: 'One extracted town main-loop tick: NPC AI, conversations, transitions.',
    },
    {
        name: 'wasm_town_full_tick',
        signature: 'void wasm_town_full_tick(void)',
        owner: 'town',
        reads: [],
        writes: ['dungeon-runtime-flags'],
        portStage: 7,
        notes: 'Advances DOS-ISR timer counters.',
    },
    {
        name: 'wasm_town_complete_transition',
        signature: 'void wasm_town_complete_transition(void)',
        owner: 'town',
        reads: ['town-transition-scratch'],
        writes: ['town-transition-scratch'],
        portStage: 7,
        notes: 'Clears pending-transition scratch after main.ts applied it.',
    },
    {
        name: 'wasm_get_pending_transition_map',
        signature: 'int wasm_get_pending_transition_map(void)',
        owner: 'town',
        reads: ['town-transition-scratch'],
        writes: [],
        portStage: 5,
        notes: 'Pure g_mem reader (0xFFF1).',
    },
    {
        name: 'wasm_get_pending_transition_pat',
        signature: 'int wasm_get_pending_transition_pat(void)',
        owner: 'town',
        reads: ['town-transition-scratch'],
        writes: [],
        portStage: 5,
        notes: 'Pure g_mem reader (0xFFF2).',
    },
    {
        name: 'wasm_get_pending_transition_dir',
        signature: 'int wasm_get_pending_transition_dir(void)',
        owner: 'town',
        reads: ['town-transition-scratch'],
        writes: [],
        portStage: 5,
        notes: 'Pure g_mem reader (0xFFF3).',
    },
    {
        name: 'wasm_init_c015_obj_if_exists',
        signature: 'void wasm_init_c015_obj_if_exists(void)',
        owner: 'town',
        reads: ['mdt-window'],
        writes: [],
        portStage: 7,
        notes: 'Spawns the word_c015 object when the MDT defines one.',
    },
    {
        name: 'wasm_town_conversation_finish',
        signature: 'void wasm_town_conversation_finish(void)',
        owner: 'town',
        reads: ['scene-flow-flags'],
        writes: ['scene-flow-flags'],
        portStage: 7,
        notes: 'Resumes town flow after a conversation closes.',
    },
    {
        name: 'wasm_town_building_finish',
        signature: 'void wasm_town_building_finish(void)',
        owner: 'town',
        reads: ['scene-flow-flags'],
        writes: ['scene-flow-flags'],
        portStage: 7,
        notes: 'Resumes street flow after leaving a building scene.',
    },
    {
        name: 'wasm_dungeon_init',
        signature: 'void wasm_dungeon_init(int mapId, int isFromTown)',
        owner: 'dungeon',
        reads: ['mdt-window', 'monster-config', 'death-descriptors', 'sword-reach-tables', 'dungeon-config-lists', 'trajectories'],
        writes: [
            'proximity-map',
            'viewport-entities-cache',
            'dungeon-runtime-flags',
            'boss-state-block',
            'boss-state-ptr',
            'engine-semaphores',
        ],
        portStage: 8,
        notes: 'Loads a cavern: proximity window, entity table, boss placement.',
    },
    {
        name: 'wasm_dungeon_update',
        signature: 'void wasm_dungeon_update(void)',
        owner: 'dungeon',
        reads: ['input-latches', 'proximity-map', 'enemy-projectiles', 'magic-projectiles'],
        writes: [
            'proximity-map',
            'viewport-entities-cache',
            'dungeon-runtime-flags',
            'enemy-projectiles',
            'magic-projectiles',
            'sfx-request',
            'heartbeat-volume',
            'engine-semaphores',
        ],
        portStage: 8,
        notes: 'Main dungeon tick: physics/collision, entities, combat, render requests.',
    },
    {
        name: 'wasm_dungeon_full_tick',
        signature: 'void wasm_dungeon_full_tick(void)',
        owner: 'dungeon',
        reads: [],
        writes: ['dungeon-runtime-flags'],
        portStage: 8,
        notes: 'ISR-counter analogue of town_full_tick.',
    },
    {
        name: 'wasm_dungeon_get_viewport_top',
        signature: 'int wasm_dungeon_get_viewport_top(void)',
        owner: 'dungeon',
        reads: ['dungeon-runtime-flags'],
        writes: [],
        portStage: 5,
        notes: 'Pure g_mem reader.',
    },
    {
        name: 'wasm_dungeon_get_entity_table',
        signature: 'int wasm_dungeon_get_entity_table(void)',
        owner: 'dungeon',
        reads: [],
        writes: [],
        portStage: 8,
        notes: 'Returns linear-memory pointer into the entity table; ported with the table accessor layer.',
    },
    {
        name: 'wasm_dungeon_get_entity_count',
        signature: 'int wasm_dungeon_get_entity_count(void)',
        owner: 'dungeon',
        reads: [],
        writes: [],
        portStage: 5,
        notes: 'Pure reader of entity-table bookkeeping.',
    },
    {
        name: 'wasm_dungeon_get_state',
        signature: 'int wasm_dungeon_get_state(void)',
        owner: 'dungeon',
        reads: ['engine-semaphores'],
        writes: [],
        portStage: 5,
        notes: 'Reads ADDR_DUNGEON_STATE semaphore (death/boss/roka phases).',
    },
    {
        name: 'wasm_dungeon_get_render_request',
        signature: 'int wasm_dungeon_get_render_request(void)',
        owner: 'dungeon',
        reads: ['engine-semaphores'],
        writes: [],
        portStage: 8,
        notes: 'Render-request semaphore reader.',
    },
    {
        name: 'wasm_dungeon_clear_render_request',
        signature: 'void wasm_dungeon_clear_render_request(void)',
        owner: 'dungeon',
        reads: [],
        writes: ['engine-semaphores'],
        portStage: 8,
        notes: 'Acknowledges the render request.',
    },
    {
        name: 'wasm_finish_rokademo_transition',
        signature: 'void wasm_finish_rokademo_transition(void)',
        owner: 'dungeon',
        reads: ['mdt-window'],
        writes: ['proximity-map', 'dungeon-runtime-flags', 'engine-semaphores'],
        portStage: 8,
        notes: 'Tears-of-Esmesanti demo handoff back into the next cavern.',
    },
];

/**
 * Compile-time exhaustiveness guard: fails to compile if any export of
 * `ZeliardExports` (besides `memory`) is missing from ENGINE_EXPORT_ENTRIES.
 */
type MissingExports = Exclude<
    EngineExportName,
    (typeof ENGINE_EXPORT_ENTRIES)[number]['name']
>;
export const EXPORT_LIST_IS_EXHAUSTIVE: [MissingExports] extends [never]
    ? true
    : ['ENGINE_EXPORT_ENTRIES is missing exports'] = true;

// ============================================================================
// Tracker helpers
// ============================================================================

const regionByName = new Map(
    ENGINE_REGIONS.map((r) => [r.name, r] as const),
);

/** Look up a region by name; throws on unknown names (typo guard). */
export function getRegion(name: string): MemoryRegion {
    const region = regionByName.get(name);
    if (!region) throw new Error(`Unknown memory region: ${name}`);
    return region;
}

/** All export entries ported in (or before) the given stage. */
export function exportsForStage(stage: PortStage): ExportEntry[] {
    return ENGINE_EXPORT_ENTRIES.filter((e) => e.portStage === stage);
}

/** Regions whose shared-memory state is retired in the given stage. */
export function regionsForStage(stage: PortStage): MemoryRegion[] {
    return ENGINE_REGIONS.filter((r) => r.portStage === stage);
}

/** Absolute g_mem address of a region's start (applies the seg1 offset). */
export function regionAbsoluteStart(region: MemoryRegion): number {
    return region.segment === 1 ? SEG1_BASE + region.start : region.start;
}
