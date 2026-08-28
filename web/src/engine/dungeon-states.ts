/**
 * dungeon-states.ts — TS port of the remaining dungeon.c per-state frame
 * handlers (Stage 8d, slice 10): NORMAL, ROPE, DEATH_FALL/FLASH/FADE and
 * JASHIIN cutscene. Composes already-ported primitives from
 * dungeon-frame.ts, dungeon-input.ts and dungeon-vertical.ts.
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - dungeon_finish_normal_frame          (4904)
 *   - dungeon_update_normal                (4931)
 *   - dungeon_update_jashiin_cutscene      (4952)
 *   - dungeon_finish_rope_frame            (5030)
 *   - dungeon_update_rope                  (5056)
 *   - dungeon_death_frame_step             (818)
 *   - dungeon_update_death_fall            (832)
 *   - dungeon_update_death_flash           (847)
 *   - dungeon_update_death_fade + transit_to_sage (874..930)
 */

import {
    DUNGEON_STATE_NORMAL,
    DUNGEON_STATE_ROPE,
    DUNGEON_STATE_EXIT,
} from './dungeon-state-machine.js';
import {
    mainUpdateRenderPre,
    dungeonRenderTimingStep,
    type FramePreCallbacks,
} from './dungeon-frame.js';
import {
    airborneMovement,
    heroKnockbackHandler,
    inputHandling,
    slidingPhysicsStep,
    stateMachineDispatcher,
} from './dungeon-input.js';
import { magicSpellFireHandler as magicSpellFireDispatch } from './dungeon-spell-fire.js';
import { updateHeroXp } from './dungeon-combat.js';

const PROX_COLS = 36;
const CASTLE_RESURRECTION_X = 40;

// g_mem addresses
const VIEWPORT_TOP_ROW = 0x82;
const HERO_XV = 0x83;
const HERO_LEVEL = 0x8d;
const HERO_HP = 0x90; // word
const HERO_MAX_HP = 0xb2; // word
const HERO_ALMAS = 0x8b; // word
const HERO_GOLD_HI = 0x85;
const HERO_GOLD_LO = 0x86; // word
const DEATH_ALREADY_PROCESSED = 0x49;
const TEAR_X = 0xc013; // word
const PLACE_MAP_ID = 0xc4;
const BYTE_9F28 = 0x9f28;
const BYTE_9F29 = 0x9f29;
/** ADDR_FRAME_TICKS (0x9F0A) — squat-clear counter in the finish-frame step
 * (dungeon.c:4914); NOT the global ADDR_FRAME_TIMER at 0xFF1A. */
const FRAME_TICKS = 0x9f0a;
const FACING = 0xc2;
const UP_FLAG = 2;
const IS_JASHIIN_CAVERN = 0xe6;
const SQUAT_FLAG = 0xff38;
const ON_ROPE_FLAGS = 0xff39;
const HERO_SPRITE_HIDDEN = 0xff37;
const JUMP_PHASE_FLAGS = 0xff3d;
const SLOPE_DIRECTION = 0xff42;
const SWORD_SWING_FLAG = 0xff43;
const SLIDE_TICKS_REMAINING = 0x9f20;
const HORIZ_MOVEMENT_ACCUM = 0x9f21;
const SPACEBAR_LATCH = 0xff1d;
const ALTKEY_LATCH = 0xff1e;
const DUNGEON_FRAME_PHASE = 0xff91;
const RENDER_REQUEST = 0xff92;
const RENDER_DONE = 0xff93;
const DEATH_COUNTER = 0xff95;
const BYTE_FF24 = 0xff24;
const HEARTBEAT_VOLUME = 0xff08;
const INVINCIBILITY_FLAG = 0xe8;
const HERO_X_IN_PROXIMITY_MAP = 0x9f1a; // word

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

/** C statics spanning multiple frames (dungeon.c:1823-1836). */
export interface DungeonRuntimeStatics {
    isFromTown: boolean;
    savedYViewInit: number;
    savedDoorX1: number;
    skipRokaRun: boolean;
}

export interface StateFrameDeps {
    /** move_platform_down_damage_monster — lives in dungeon-vertical. */
    movePlatformDownDamageMonster: (g: Uint8Array) => boolean;
    tryMovePlatformUp: (g: Uint8Array) => boolean;
    enterTheDoor: (g: Uint8Array, shouldBreak: { v: number }) => void;
    loadPlaceAndReinit: (g: Uint8Array) => void;
    bringInventoryWindow: (g: Uint8Array) => void;
}

// ─── dungeon_finish_normal_frame (dungeon.c:4904) ───

export function dungeonFinishNormalFrame(
    g: Uint8Array,
    deps: StateFrameDeps,
    callbacks: FramePreCallbacks,
): void {
    // magic_spell_fire_handler()
    magicSpellFireHandlerLocal(g);

    heroInteractionCheck(g);
    heroKnockbackHandler(g);

    s8(g, FRAME_TICKS, (g8(g, FRAME_TICKS) + 1) & 0xff);
    if (g8(g, FRAME_TICKS) === 2) {
        s8(g, SQUAT_FLAG, 0);
    }

    if ((g8(g, 0xff17 /* INPUT_DIRS */) & 2 /* KEY_DOWN */) !== 0) {
        s8(g, FACING, g8(g, FACING) & ~UP_FLAG);
    }

    if (airborneMovementTick(g) !== 0) {
        stateMachineDispatcherTick(g, deps);
    }

    if (g8(g, ON_ROPE_FLAGS) !== 0) {
        s8(g, 0xff90 /* DUNGEON_STATE */, 1 /* ROPE */);
    }

    s8(g, RENDER_DONE, 0);
    s8(g, RENDER_REQUEST, 0xff);
}

// late-bound wrappers to avoid import cycles at module init

const spellFireInitCbs = {
    initMagicProjectile: (gg: Uint8Array, si: number) => { initMagicProjectileImpl(gg, si); },
    initRascar: (gg: Uint8Array, si: number) => { initRascarImpl(gg, si); },
    initAgua: (gg: Uint8Array, si: number) => { initAguaImpl(gg, si); },
    initGuerra: (gg: Uint8Array, si: number) => { initGuerraImpl(gg, si); },
};
function magicSpellFireHandlerLocal(g: Uint8Array): void {
    magicSpellFireDispatch(g, spellFireInitCbs);
}
import {
    initMagicProjectile as initMagicProjectileImpl,
    initRascar as initRascarImpl,
    initAgua as initAguaImpl,
    initGuerra as initGuerraImpl,
} from './dungeon-spell-fire.js';

function airborneMovementTick(g: Uint8Array): number {
    return airborneMovement(g);
}

function stateMachineDispatcherTick(
    g: Uint8Array,
    deps: StateFrameDeps,
): void {
    stateMachineDispatcher(g, {
        movePlatformDownDamageMonster: deps.movePlatformDownDamageMonster,
        tryMovePlatformUp: deps.tryMovePlatformUp,
        enterTheDoor: deps.enterTheDoor,
    });
}

// ─── dungeon_update_normal (dungeon.c:4931) ───

export function dungeonUpdateNormal(
    g: Uint8Array,
    statics: DungeonRuntimeStatics,
    deps: StateFrameDeps,
    callbacks: FramePreCallbacks,
): void {
    if (g8(g, DUNGEON_FRAME_PHASE) === 0) {
        if (g8(g, ON_ROPE_FLAGS) !== 0) {
            s8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_ROPE);
            dungeonUpdateRope(g, statics, deps, callbacks);
            return;
        }

        inputHandling(g);
        slidingPhysicsStep(g);
        const invincible = mainUpdateRenderPre(g, callbacks);
        if (invincible !== 0) {
            s8(g, 0xff36 /* HERO_DAMAGE_THIS_FRAME */, 0);
        }
        dungeonRenderTimingStep(g, invincible, callbacks);
        return;
    }

    const invincible = g8(g, INVINCIBILITY_FLAG) !== 0 ? 1 : 0;
    if (dungeonRenderTimingStep(g, invincible, callbacks) !== 0) {
        if (g8(g, 0xff90) === DUNGEON_STATE_NORMAL) {
            dungeonFinishNormalFrame(g, deps, callbacks);
        } else if (g8(g, 0xff90) === DUNGEON_STATE_ROPE) {
            dungeonFinishRopeFrame(g, deps);
        }
    }
}

/** dungeon_update_jashiin_cutscene (dungeon.c:4952). */
export function dungeonUpdateJashiinCutscene(
    g: Uint8Array,
    statics: DungeonRuntimeStatics,
    deps: StateFrameDeps,
    callbacks: FramePreCallbacks,
): void {
    if (g8(g, DUNGEON_FRAME_PHASE) === 0) {
        const invincible = mainUpdateRenderPre(g, callbacks);
        if (invincible !== 0) {
            s8(g, 0xff36, 0);
        }
        dungeonRenderTimingStep(g, invincible, callbacks);
        return;
    }

    const invincible = g8(g, INVINCIBILITY_FLAG) !== 0 ? 1 : 0;
    if (dungeonRenderTimingStep(g, invincible, callbacks) === 0) return;

    if (g8(g, IS_JASHIIN_CAVERN) !== 0) return; // still in cutscene room 1

    // Cutscene done → set up room 2 (mpa0). Hero feet at TOP+HEAD+3; mpa0
    // floor row 18 with HEAD=12 → TOP must be 3. saved_y_view_init=12 turns
    // after_run_animation's adjustment into a no-op.
    s16(g, HERO_X_IN_PROXIMITY_MAP, 24);
    statics.savedDoorX1 = 24;
    s8(g, HERO_XV, 12);
    s8(g, BYTE_9F00_UNUSED(), 12);
    s8(g, VIEWPORT_TOP_ROW, 3);
    statics.savedYViewInit = 12;

    statics.skipRokaRun = true; // prepare_dungeon finalizes directly

    s8(g, PLACE_MAP_ID, 30); // mpa0.mdt, Jashiin room 2
    s8(g, 0xfffc /* PENDING_DUNGEON_MAP */, 30);
    s8(g, 0xfffd /* PENDING_DUNGEON_FLAG */, 0xff);
    // NOTE: Do NOT set DUNGEON_EXIT_FLAG here — that would trigger
    // initTownFromDungeon (town path).  The asm jashiin_place flow stays
    // inside Cavern_Game_Init and loads room 2 via the PENDING_DUNGEON_FLAG
    // → handleDungeonTransition path, same as a dungeon-to-dungeon door.
    s8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_EXIT);
}

function BYTE_9F00_UNUSED(): number {
    return 0x9f00;
}

// ─── rope mode ───

/** dungeon_finish_rope_frame (dungeon.c:5030). */
export function dungeonFinishRopeFrame(g: Uint8Array, deps?: StateFrameDeps): void {
    heroKnockbackHandler(g);
    // state_machine_dispatcher needs platform-down dep via caller scope;
    // use a neutral dispatcher wrapper through the exported signature.
    stateMachineDispatcherRope(g, deps);

    if (g8(g, ON_ROPE_FLAGS) === 0xff) {
        let si = wrapCheck(heroCoordsToAddr(g) + 1);
        if (isOverRopeTick(g, si)) {
            s8(g, RENDER_DONE, 0);
            s8(g, RENDER_REQUEST, 0xff);
            return;
        }
        si = wrapCheck(si + PROX_COLS);
        if (isOverRopeTick(g, si)) {
            s8(g, RENDER_DONE, 0);
            s8(g, RENDER_REQUEST, 0xff);
            return;
        }
    }

    s8(g, FACING, g8(g, FACING) & ~UP_FLAG);
    s8(g, ON_ROPE_FLAGS, 0);
    s8(g, SPACEBAR_LATCH, 0);
    s8(g, ALTKEY_LATCH, 0);
    s8(g, SLIDE_TICKS_REMAINING, 0);
    s8(g, HORIZ_MOVEMENT_ACCUM, 0);
    s8(g, 0xe7 /* HERO_ANIM_PHASE */, 0x7f);
    s8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_NORMAL);
    s8(g, RENDER_DONE, 0);
    s8(g, RENDER_REQUEST, 0xff);
}

import { isOverRope as isOverRopeTick, setZeroFlagIfSlippery as slipperyCheck } from './dungeon-vertical.js';
import { heroCoordsToAddrInProximity as heroCoordsToAddr, heroInteractionCheck } from './dungeon-hero.js';
import { movePlatformDownDamageMonster as movePlatformDownImpl } from './dungeon-vertical.js';

function stateMachineDispatcherRope(
    g: Uint8Array,
    deps?: StateFrameDeps,
): void {
    stateMachineDispatcher(g, {
        movePlatformDownDamageMonster: (gg) => movePlatformDownImpl(gg),
        tryMovePlatformUp: deps?.tryMovePlatformUp,
        enterTheDoor: deps?.enterTheDoor,
    });
}

function wrapCheck(addr: number): number {
    let a = addr & 0xffff;
    while (a >= 0xe000 + 36 * 64) a -= 36 * 64;
    return a;
}
void slipperyCheck;

/** dungeon_update_rope (dungeon.c:5056). */
export function dungeonUpdateRope(
    g: Uint8Array,
    _statics: DungeonRuntimeStatics,
    deps: StateFrameDeps,
    callbacks: FramePreCallbacks,
): void {
    if (g8(g, DUNGEON_FRAME_PHASE) === 0) {
        s8(g, SQUAT_FLAG, 0);
        s8(g, JUMP_PHASE_FLAGS, 0);
        s8(g, SLOPE_DIRECTION, 0);
        s8(g, 0xff3c /* SPELL_ACTIVE_FLAG */, 0);
        // Flush_Ui_Element_If_Dirty_proc(): stub
        s8(g, SWORD_SWING_FLAG, 0);

        const invincible = mainUpdateRenderPre(g, callbacks);
        if (invincible !== 0) {
            s8(g, 0xff36, 0);
        }
        dungeonRenderTimingStep(g, invincible, callbacks);
        return;
    }

    const invincible = g8(g, INVINCIBILITY_FLAG) !== 0 ? 1 : 0;
    if (dungeonRenderTimingStep(g, invincible, callbacks) !== 0) {
        if (g8(g, 0xff90) === DUNGEON_STATE_ROPE) {
            dungeonFinishRopeFrame(g, deps);
        }
    }
}

// ─── death sequence ───

/** dungeon_death_frame_step (dungeon.c:818). */
export function dungeonDeathFrameStep(
    g: Uint8Array,
    callbacks: FramePreCallbacks,
): number {
    if (g8(g, DUNGEON_FRAME_PHASE) === 0) {
        const invincible = mainUpdateRenderPre(g, callbacks);
        if (invincible !== 0) {
            s8(g, 0xff36, 0);
        }
        dungeonRenderTimingStep(g, invincible, callbacks);
        return 0;
    }
    const invincible = g8(g, INVINCIBILITY_FLAG) !== 0 ? 1 : 0;
    return dungeonRenderTimingStep(g, invincible, callbacks);
}

/** dungeon_update_death_fall (dungeon.c:832). */
export function dungeonUpdateDeathFall(
    g: Uint8Array,
    callbacks: FramePreCallbacks,
): void {
    if (dungeonDeathFrameStep(g, callbacks) === 0) return;

    s8(g, 0xe7 /* HERO_ANIM_PHASE */, 0);
    s8(g, ON_ROPE_FLAGS, 0);
    s8(g, HERO_SPRITE_HIDDEN, 0);

    if (airborneMovementTick(g) !== 0) {
        s8(g, HERO_SPRITE_HIDDEN, 0);
        s8(g, 0xff90 /* DUNGEON_STATE */, 3 /* DEATH_FLASH */);
        s8(g, DEATH_COUNTER, 0);
    }
}

/** dungeon_update_death_flash (dungeon.c:847). */
export function dungeonUpdateDeathFlash(
    g: Uint8Array,
    callbacks: FramePreCallbacks,
): void {
    if (dungeonDeathFrameStep(g, callbacks) === 0) return;

    s8(g, HERO_SPRITE_HIDDEN, 0);

    if (g8(g, 0xe7 /* HERO_ANIM_PHASE */) === 2) {
        s8(g, BYTE_9F29, (g8(g, BYTE_9F29) + 1) & 0xff);
        if ((g8(g, BYTE_9F29) & 0x0f) === 0) {
            s8(g, BYTE_FF24, 8);
            s8(g, 0xff90 /* DUNGEON_STATE */, 4 /* DEATH_FADE */);
            s8(g, DEATH_COUNTER, 0);
            return;
        }
        if ((g8(g, BYTE_9F29) & 1) === 0) return;
        s8(g, HERO_SPRITE_HIDDEN, 0xff);
        return;
    }

    s8(g, BYTE_9F28, (g8(g, BYTE_9F28) + 1) & 0xff);
    if ((g8(g, BYTE_9F28) & 7) !== 0) return;

    const al = (g8(g, 0xe7) + 1) & 3;
    if (al === 3) return;
    s8(g, 0xe7, al);
}

/** transit_to_sage (dungeon.c:~920). */
export function transitToSage(g: Uint8Array): void {
    s8(g, HEARTBEAT_VOLUME, 0);
    s8(g, PLACE_MAP_ID, g8(g, 0xc5 /* LAST_SAGE_VISITED */));
    s8(g, BOSS_MODE_ADDR(), 0);

    s16(g, HERO_X_IN_PROXIMITY_MAP, g16(g, TEAR_X));

    s8(g, 0xffe3 /* HERO_DEATH_FLAG */, 0xff);
    s8(g, 0xffe2 /* DUNGEON_EXIT_FLAG */, 0xff);
    s8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_EXIT);
}

function BOSS_MODE_ADDR(): number {
    return 0xffa0;
}

/** dungeon_update_death_fade (dungeon.c:874). */
export function dungeonUpdateDeathFade(
    g: Uint8Array,
    callbacks: FramePreCallbacks,
    loadPlaceAndReinit: (g: Uint8Array) => void,
): void {
    if (dungeonDeathFrameStep(g, callbacks) === 0) return;

    const i = g8(g, DEATH_COUNTER);
    s8(g, HERO_SPRITE_HIDDEN, (i & 1) !== 0 ? 0 : 0xff);
    s8(g, DEATH_COUNTER, (i + 1) & 0xff);

    if (i >= 29) {
        if (g8(g, DEATH_ALREADY_PROCESSED) !== 0) {
            s8(g, 0xc5 /* LAST_SAGE_VISITED */, 0x80);
            // Felishika Castle plaza spawn (cmap column 40)
            s16(g, TEAR_X, CASTLE_RESURRECTION_X);
        } else {
            const xpGain = (127 - g8(g, HERO_LEVEL) * 2) & 0xffff;
            updateHeroXp(g, xpGain);
            s8(g, HERO_GOLD_HI, 0);
            s16(g, HERO_GOLD_LO, 0);
            s16(g, HERO_ALMAS, (g16(g, HERO_ALMAS) >> 1) & 0xffff);
        }

        s16(g, HERO_HP, g16(g, HERO_MAX_HP));
        transitToSage(g);
    }
    void loadPlaceAndReinit;
}
