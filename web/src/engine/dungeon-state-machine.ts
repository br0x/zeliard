/**
 * dungeon-state-machine.ts — TS port of dungeon.c's dungeon update
 * dispatcher and the roka-run / cavern-init transition family.
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - dungeon_update               (1986) — the DUNGEON_STATE switch.
 *     States whose per-frame logic is delegated to injected handlers
 *     (NORMAL, ROPE, death fall/flash/fade, DOOR_PENDING, JASHIIN cutscene).
 *   - roka_run                     (1949)
 *   - dungeon_update_roka_run      (1961)
 *   - after_run_animation          (5138)
 *   - Cavern_Game_Init             (5179)
 *   - clear_viewport_buffer        (1185)
 *   - clear_hero_in_viewport       (590)
 *
 * The C file statics `saved_y_view_init` / `g_is_from_town` are mirrored in
 * a DungeonStatics object owned by the caller (they are written at dungeon
 * entry and survive across frames).
 */

import { unpackMap } from './unpack.js';
import { updateAllMonstersInMap } from './dungeon-monsters.js';

// DUNGEON_STATE values (zeliard.h)
export const DUNGEON_STATE_NORMAL = 0;
export const DUNGEON_STATE_ROPE = 1;
export const DUNGEON_STATE_DEATH_FALL = 2;
export const DUNGEON_STATE_DEATH_FLASH = 3;
export const DUNGEON_STATE_DEATH_FADE = 4;
export const DUNGEON_STATE_BOSS_ENCOUNTER = 5;
export const DUNGEON_STATE_EXIT = 6;
export const DUNGEON_STATE_ROKA_RUN = 7;
export const DUNGEON_STATE_DOOR_PENDING = 8;
export const DUNGEON_STATE_ROKADEMO = 9;
export const DUNGEON_STATE_JASHIIN_CUTSCENE = 10;

// g_mem addresses
const LEFT_COL_NUM = 0x80; // word — proximity map left column number
const HERO_XV = 0x83;
const HERO_HEAD_Y_VIEW = 0x84;
const FACING = 0xc2;
const LEFT_RUN = 0xc3;
const PLACE_MAP_ID = 0xc4;
const LEFT_FLAG = 1;
const IS_JASHIIN_CAVERN = 0xe6;
const BYTE_9F00 = 0x9f00;
const MDT = 0xc000; // word pointer to mdt_descriptor
const HERO_Y_VIEW_INIT = 0xc016;
const VIEWPORT_TOP_ROW = 0x82;
const PROJECTILES_LIST = 0xeb80;
const MAGIC_PROJECTILES = 0xeb15; // word
const ROKA_PHASE = 0xff9d;
const DUNGEON_STATE = 0xff90;
const DUNGEON_FRAME_PHASE = 0xff91;
const RENDER_REQUEST = 0xff92;
const RENDER_DONE = 0xff93;
const DEATH_ALREADY_PROCESSED = 0x49;
const BYTE_9F02 = 0x9f02;
const BYTE_9F27_ADDR = 0x9f27;
const SPACEBAR_LATCH = 0xff1d;
const ALTKEY_LATCH = 0xff1e;
/** ADDR_FRAME_TIMER — the global tick counter at 0xFF1A (NOT the dungeon
 * frame-ticks byte at 0x9F0A). */
const FRAME_TIMER = 0xff1a;
const MAO2_START_LATCH = 0xff21;
const GOLD_RENDER_REQUEST = 0xff94;
const BOSS_MODE = 0xffa0;

function g8(g: Uint8Array, addr: number): number {
    return g[addr & 0xffff] ?? 0;
}

function s8(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
}

function g16(g: Uint8Array, addr: number): number {
    return (g[addr & 0xffff] ?? 0) | ((g[(addr + 1) & 0xffff] ?? 0) << 8);
}

function s16(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
    g[(addr + 1) & 0xffff] = (v >> 8) & 0xff;
}

/** C statics that live outside g_mem (dungeon.c:1823/1835). */
export interface DungeonStatics {
    isFromTown: boolean;
    savedYViewInit: number;
}

// Late-bound composition-root hooks (avoid an import cycle with
// dungeon-frame.ts, which imports this module's state constants). Bound by
// dungeon-cutover.ts when the dispatched implementation is created.
let mainUpdateRenderHook: ((g: Uint8Array) => void) | undefined;
export function bindMainUpdateRender(fn: (g: Uint8Array) => void): void {
    mainUpdateRenderHook = fn;
}
let processHeroDeathHook: ((g: Uint8Array) => void) | undefined;
export function bindProcessHeroDeath(fn: (g: Uint8Array) => void): void {
    processHeroDeathHook = fn;
}

/**
 * Injected per-frame handlers for states whose internals are not ported
 * yet — later 8d slices replace them with native ports.
 */
export interface StateHandlers {
    updateNormal: (g: Uint8Array) => void;
    updateRope: (g: Uint8Array) => void;
    updateDeathFall: (g: Uint8Array) => void;
    updateDeathFlash: (g: Uint8Array) => void;
    updateDeathFade: (g: Uint8Array) => void;
    completeDoorTransition: (g: Uint8Array) => void;
    updateJashiinCutscene: (g: Uint8Array) => void;
}

/** clear_viewport_buffer (dungeon.c:1185). */
export function clearViewportBuffer(g: Uint8Array): void {
    g.fill(0xfd, 0xe900, 0xe900 + 28 * 19);
}

/** clear_hero_in_viewport (dungeon.c:590): blank the hero's 3×3 cells. */
export function clearHeroInViewport(g: Uint8Array): void {
    let di =
        0xe900 +
        (g8(g, HERO_HEAD_Y_VIEW) ?? 0) * 28 +
        (g8(g, HERO_XV) ?? 0);
    di &= 0xffff;
    for (let i = 0; i < 3; i++) {
        g.fill(0xff, di, di + 3);
        di += 28 - 3;
    }
}

/** roka_run (dungeon.c:1949): begin the post-boss run-out animation. */
export function rokaRun(g: Uint8Array): void {
    s8(g, ROKA_PHASE, 0);
    s8(g, FRAME_TIMER, 0); // ADDR_FRAME_TIMER (0xFF1A)
    s8(g, DUNGEON_STATE, DUNGEON_STATE_ROKA_RUN);
    if ((g8(g, LEFT_RUN) & 1) !== 0) {
        s8(g, FACING, g8(g, FACING) | LEFT_FLAG);
    } else {
        s8(g, FACING, g8(g, FACING) & ~LEFT_FLAG);
    }
}

/**
 * after_run_animation (dungeon.c:5138): final dungeon or town setup once
 * the roka-run finishes. Asset-loading procs that the web port handles in
 * JS (Reassemble_3_Planes, Load_Magic_Spell_Sprite_Group,
 * load_cavern_sprites_ai_music, Clear_Viewport) are no-ops here exactly as
 * they are in the reference C port.
 */
export function afterRunAnimation(
    g: Uint8Array,
    statics: DungeonStatics,
    mainUpdateRender: ((g: Uint8Array) => void) | undefined = mainUpdateRenderHook,
): void {
    if ((g8(g, PLACE_MAP_ID) & 0x80) !== 0) {
        // town — signal game.js to init town entry
        s8(g, 0xffe2 /* DUNGEON_EXIT_FLAG */, 0xff);
        s8(g, DUNGEON_STATE, DUNGEON_STATE_EXIT);
        return;
    }

    // dungeon
    const mdtDescr = g16(g, MDT);
    const mdtDesc0 = g8(g, mdtDescr);
    // load_cavern_sprites_ai_music(): stub — JS loads assets
    s8(g, 0xff34 /* IS_BOSS_CAVERN */, (mdtDesc0 & 0x80) !== 0 ? 0xff : 0);
    s8(g, IS_JASHIIN_CAVERN, (mdtDesc0 & 0x40) !== 0 ? 0xff : 0);
    s8(g, 0xff2e /* BOSS_BEING_HIT */, 0);
    s8(g, 0xff2f /* SPRITE_FLASH_FLAG */, 0);
    // Clear_Viewport_proc(): stub — JS clears the canvas

    s8(g, HERO_XV, 12);
    const heroHeadY = g8(g, HERO_Y_VIEW_INIT);
    s8(g, HERO_HEAD_Y_VIEW, heroHeadY);
    s8(g, BYTE_9F00, heroHeadY);

    // For cavern→cavern doors the hero keeps the old map's absolute height;
    // town→dungeon entries keep the viewport_top_row set up by
    // request_dungeon_transition.
    if (!statics.isFromTown) {
        s8(
            g,
            VIEWPORT_TOP_ROW,
            (g8(g, VIEWPORT_TOP_ROW) + statics.savedYViewInit - heroHeadY) & 0x3f,
        );
    }
    s8(g, 0xe7 /* HERO_ANIM_PHASE */, 0x80);
    // Reassemble_3_Planes_To_Packed_Bitmap_proc stubs ×2
    // Load_Magic_Spell_Sprite_Group_proc stub

    cavernGameInit(g, statics, mainUpdateRender);
}

/** Cavern_Game_Init (dungeon.c:5373). */
export function cavernGameInit(
    g: Uint8Array,
    statics: DungeonStatics,
    mainUpdateRender: ((g: Uint8Array) => void) | undefined = mainUpdateRenderHook,
): void {
    s8(g, 0x9f20 /* SLIDE_TICKS_REMAINING */, 0);
    s8(g, 0x9f21 /* HORIZ_MOVEMENT_ACCUM */, 0);
    s8(g, 0x9f22 /* SLIDE_DIRECTION */, 0);
    s8(g, PROJECTILES_LIST, 0xff);
    s8(g, 0xeda0 /* BOSS_EXPLOSIONS_LIST */, 0xff);
    s16(g, MAGIC_PROJECTILES, 0xffff);
    s8(g, 0xff2e /* BOSS_BEING_HIT */, 0);
    s8(g, 0xff2f /* SPRITE_FLASH_FLAG */, 0);
    s8(g, 0xff30 /* BOSS_IS_DEAD */, 0);
    s8(g, 0x9f01 /* BOSS_PLACEMENT */, 0);

    if (g8(g, 0xff34 /* IS_BOSS_CAVERN */) !== 0) {
        // render_hud_bars_with_enemy(): body fully commented out → no-op
        s8(g, 0x9f02 /* BYTE_9F02 */, 0xff);
        // Render_Animated_Tile_Strip_proc / Update_Local_Attribute_Cache /
        // Copy_Tile_Buffer_To_VRAM: stubs
        s8(g, 0xff37 /* HERO_SPRITE_HIDDEN */, 0);
        clearHeroInViewport(g);
        s8(g, 0x9f02, 0);

        // Override enp_grp_idx with boss_grp from the mdt descriptor
        const si = g16(g, MDT);
        const bossGrp = g8(g, si + 5);
        s8(g, si + 4, bossGrp);

        // Jashiin room 2 (mpa0) enters straight from the room-1 cutscene:
        // fight starts immediately, no encounter flash.
        if ((g8(g, PLACE_MAP_ID) & 0x7f) === 30) {
            // render_boss_hud() — asm draws boss name + max/current HP bars
            // directly into VRAM.  In the JS port we trigger the health bar
            // render via the deferred BOSS_HEALTH_REQUEST flag so the HUD
            // layer picks it up on the next frame.
            const bossStatePtr = g16(g, 0xa002 /* ADDR_BOSS_STATE_PTR */);
            s8(g, 0x9f01 /* BOSS_PLACEMENT */, g8(g, bossStatePtr + 8));
            s8(g, 0xffa0 /* BOSS_MODE */, 0xff);
            s8(g, 0xff9f /* BOSS_HEALTH_REQUEST */, 0xff);
            s8(g, MAO2_START_LATCH, 0xff);
            s8(g, DUNGEON_STATE, DUNGEON_STATE_NORMAL);
        } else {
            s8(g, DUNGEON_STATE, DUNGEON_STATE_BOSS_ENCOUNTER);
        }
    } else {
        // regular cavern path
        s8(g, BOSS_MODE, 0);
        // Print_Gold_Decimal()
        s8(g, GOLD_RENDER_REQUEST, 0xff);
    }

    if (
        g8(g, IS_JASHIIN_CAVERN) !== 0 &&
        (g8(g, PLACE_MAP_ID) & 0x7f) === 29
    ) {
        // Jashiin room 1 (mp90): cutscene only
        s8(g, 0x9f26, 0xff);
        s16(g, LEFT_COL_NUM, 41);
        s8(g, HERO_XV, 5);
        unpackMap(g);
        clearViewportBuffer(g);
        s8(g, DUNGEON_STATE, DUNGEON_STATE_JASHIIN_CUTSCENE);
    } else {
        // non-Jashiin cavern startup
        unpackMap(g);
        if (g8(g, 0x9f27) !== 0) {
            clearViewportBuffer(g);
            if (mainUpdateRender) mainUpdateRender(g);
            s8(g, 0x9f26, 0);
        } else {
            // if (IS_BOSS_CAVERN) { Render_Viewport_Tiles_proc(); } — stub
            clearViewportBuffer(g);
            updateAllMonstersInMap(g);
        }
        // loc_6266
        if (g8(g, DEATH_ALREADY_PROCESSED) !== 0) {
            processHeroDeathHook?.(g);
            return;
        }
        // not_dead
        if (g8(g, BYTE_9F02) !== 0) {
            s8(g, BYTE_9F02, 0);
            // int60h_music(FN0_INIT_PLAY_MUSIC)
        }
    }

    s8(g, SPACEBAR_LATCH, 0);
    s8(g, ALTKEY_LATCH, 0);
    s8(g, FRAME_TIMER, 0);
    s8(g, BYTE_9F27_ADDR, 0);

    // main_loop(); // decoupled — driven by the composition root
}

/**
 * dungeon_update_roka_run (dungeon.c:1961).
 */
export function dungeonUpdateRokaRun(
    g: Uint8Array,
    statics: DungeonStatics,
): void {
    // advance one phase every 16 full ticks (~33ms per step, ~1.76s total).
    // Paced on ADDR_FRAME_TIMER (0xFF1A), incremented by dungeonFullTick.
    if ((g8(g, FRAME_TIMER) & 15) !== 0) return;
    const phase = g8(g, ROKA_PHASE);
    if (phase >= 25) {
        afterRunAnimation(g, statics);
        if (g8(g, DUNGEON_STATE) === DUNGEON_STATE_ROKA_RUN) {
            s8(g, DUNGEON_STATE, DUNGEON_STATE_NORMAL);
        }
        s8(g, DUNGEON_FRAME_PHASE, 0);
        s8(g, RENDER_REQUEST, 0xff);
        s8(g, RENDER_DONE, 0);
        return;
    }
    s8(g, ROKA_PHASE, (phase + 1) & 0xff);
    s8(g, 0xe7 /* HERO_ANIM_PHASE */, (g8(g, 0xe7) + 1) & 0xff);
    s8(g, RENDER_DONE, 0);
    s8(g, RENDER_REQUEST, 0xff);
}

/**
 * wasm_dungeon_update (dungeon.c:1986): the per-frame state switch.
 *
 * Native states: ROKA_RUN, ROKADEMO, EXIT, BOSS_ENCOUNTER.
 * Delegated states: NORMAL, ROPE, DEATH_*, DOOR_PENDING, JASHIIN.
 */
export function dungeonUpdate(
    g: Uint8Array,
    handlers: StateHandlers,
    statics: DungeonStatics,
): void {
    switch (g8(g, DUNGEON_STATE)) {
        case DUNGEON_STATE_ROKA_RUN:
            dungeonUpdateRokaRun(g, statics);
            break;
        case DUNGEON_STATE_ROKADEMO:
            // Tear-collection demo animated entirely by JS
            break;
        case DUNGEON_STATE_ROPE:
            handlers.updateRope(g);
            break;
        case DUNGEON_STATE_DEATH_FALL:
            handlers.updateDeathFall(g);
            break;
        case DUNGEON_STATE_DEATH_FLASH:
            handlers.updateDeathFlash(g);
            break;
        case DUNGEON_STATE_DEATH_FADE:
            handlers.updateDeathFade(g);
            break;
        case DUNGEON_STATE_DOOR_PENDING:
            handlers.completeDoorTransition(g);
            break;
        case DUNGEON_STATE_EXIT:
            return;
        case DUNGEON_STATE_BOSS_ENCOUNTER:
            // encounter animation handled by JS renderer
            break;
        case DUNGEON_STATE_JASHIIN_CUTSCENE:
            handlers.updateJashiinCutscene(g);
            break;
        case DUNGEON_STATE_NORMAL:
        default:
            handlers.updateNormal(g);
            break;
    }
}
