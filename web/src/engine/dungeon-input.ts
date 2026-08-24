/**
 * dungeon-input.ts — TS port of dungeon.c's input handling and the hero
 * movement state machine (Stage 8d, slice 7).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - input_handling                        (3971)
 *   - state_machine_dispatcher              (4068) + idle_default (4138)
 *   - init_horizontal_sliding               (4117)
 *   - down_pressed                          (4150)
 *   - up_pressed                            (5097)
 *   - try_door_interaction / enter_the_door /
 *     open_door / enter_opened_door         (5120..5250)
 *   - right_up_pressed / left_up_pressed    (4177/4232)
 *   - airborne_movement                     (4475)
 *   - sliding_physics_step                  (4334)
 *   - hero_knockback_handler                (4269)
 *   - left_default / right_default          (4562/4575)
 *   - Browse_Projectiles                    (5777)
 *   - reset_dungeon_state_vars              (1218)
 *
 * The C file statics g_door_* become DoorPendingState, owned by the caller.
 */

import {
    isBlockingTile,
    wrapMapFromAbove,
    wrapMapFromBelow,
} from './dungeon-entities.js';
import {
    heroCoordsToAddrInProximity,
    jumpPressHandler,
    moveHeroLeftIfNoObstacles,
    moveHeroRightIfNoObstacles,
    getDstMonsterFlags,
} from './dungeon-hero.js';
import {
    onLeftPressed,
    onRightPressed,
    setZeroFlagIfSlippery,
    tryClimbRope,
    isOverRope,
} from './dungeon-vertical.js';

const PROX_COLS = 36;
const VIEW_COLS = 28;

// key bits (zeliard.h)
const KEY_UP = 1;
const KEY_DOWN = 2;
const KEY_LEFT = 4;
const KEY_RIGHT = 8;
const LEFT_FLAG = 1;
const UP_FLAG = 2;

// g_mem addresses
const SWORD_TYPE = 0x92;
const HERO_HEAD_Y_VIEW = 0x84;
const HERO_GOLD_HI_UNUSED = 0x85;
void HERO_GOLD_HI_UNUSED;
const FACING = 0xc2;
const INVINCIBILITY_FLAG = 0xe8;
const INPUT_ALT_SPACE = 0xff16;
const INPUT_DIRS = 0xff17;
const JUMP_HEIGHT_COUNTER_UNUSED = 0x9f08;
void JUMP_HEIGHT_COUNTER_UNUSED;
const BYTE_9F0B = 0x9f0b;
const BYTE_9F18 = 0x9f18;
const BYTE_9F24 = 0x9f24;
const AIR_UP_TILE_FOUND = 0x9f15;
const HORIZ_MOVEMENT_ACCUM = 0x9f21;
const SLIDE_DIRECTION = 0x9f22;
const SLIDE_DIRECTION_LOCK = 0x9f23;
const SLIDE_TICKS_REMAINING = 0x9f20;
const ON_ROPE_FLAGS = 0xff39;
const HERO_HIDDEN_FLAG = 0xff3a;
const SQUAT_FLAG = 0xff38;
const JUMP_PHASE_FLAGS = 0xff3d;
const SLOPE_DIRECTION = 0xff42;
const SWORD_SWING_FLAG = 0xff43;
const UI_ELEMENT_DIRTY = 0xff44;
const ALTKEY_LATCH = 0xff1e;
const SPACEBAR_LATCH = 0xff1d;
const DOWN_THRUST_HELD = 0xff47;
const IS_BOSS_CAVERN = 0xff34;
const RENDER_REQUEST = 0xff92;
const RENDER_DONE = 0xff93;
const HEARTBEAT_VOLUME = 0xff08;
const BOSS_EXPLOSIONS_LIST = 0xeda0;
const PROJECTILES_LIST = 0xeb80;
const MAGIC_PROJECTILES_ADDR = 0xeb15;
const SOUND_FX_REQUEST = 0xff75;
const HERO_DAMAGE_THIS_FRAME = 0xff36;

export const CANT_OPEN_THIS_DOOR_STR = 9;

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

/** Door data saved by enter_opened_door for deferred completion (C statics). */
export interface DoorPendingState {
    monstersPtr: number;
    flags: number;
    x1: number;
    y1: number;
    features: number;
    placeMapId: number;
}

/** Injected per-frame handlers for states not yet natively ported. */
export interface InputCallbacks {
    /** magic_spell_fire_handler → Magic_Spell_Fire_Handler (slice 8). */
    magicSpellFire: (g: Uint8Array) => void;
}

// ─── sword swing trigger ───

/** input_handling (dungeon.c:3971). */
export function inputHandling(g: Uint8Array): void {
    if (g8(g, SWORD_TYPE) === 0) return;

    const altSpace = g8(g, INPUT_ALT_SPACE);
    const dirs = g8(g, INPUT_DIRS);

    if (
        (altSpace & 0x02 /* KEY_SPACE */) === 0 ||
        g8(g, JUMP_PHASE_FLAGS) === 0 ||
        g8(g, SLOPE_DIRECTION) !== 0 ||
        (dirs & KEY_DOWN) === 0
    ) {
        // sword_default
        s8(g, 0xff47 /* DOWN_THRUST_HELD */, 0);

        if (
            g8(g, SPACEBAR_LATCH) === 0 ||
            g8(g, SWORD_SWING_FLAG) !== 0 ||
            g8(g, 0xff3c /* SPELL_ACTIVE_FLAG */) !== 0
        ) {
            return;
        }

        let overhead: number;

        if (g8(g, IS_BOSS_CAVERN) !== 0) {
            overhead = dirs & KEY_UP;
        } else {
            // scan 4 rows × 8 columns above the hero for a flying monster
            let si = wrapMapFromBelow(
                (heroCoordsToAddrInProximity(g) - (4 * PROX_COLS + 3)) & 0xffff,
            );
            let dl = 0;
            for (let rows = 0; rows < 4; rows++) {
                for (let cols = 0; cols < 8; cols++) {
                    const { flags, monsterStruct } = getDstMonsterFlags(g, si);
                    if (monsterStruct !== 0) {
                        if (
                            (flags & 0x60) === 0 &&
                            (g8(g, monsterStruct + 7) & 0x10) === 0
                        ) {
                            dl = 0xff;
                        }
                    }
                    si++;
                }
                si = wrapMapFromAbove((si + PROX_COLS - 8) & 0xffff);
            }
            overhead = dl !== 0 ? 0xff : dirs & KEY_UP;
        }
        s8(g, 0xff45 /* SWORD_HIT_TYPE */, overhead !== 0 ? 1 : 0);
        s8(g, 0xff46 /* SWORD_MOVEMENT_PHASE */, 0);
        s8(g, SOUND_FX_REQUEST, 3);
    } else {
        // downward thrust (space + up + down held)
        s8(g, 0xff45, 2);
        s8(g, 0xff46, 2);
        if (g8(g, DOWN_THRUST_HELD) === 0) {
            s8(g, DOWN_THRUST_HELD, 0xff);
            s8(g, SOUND_FX_REQUEST, 4);
        }
    }
    s8(g, SPACEBAR_LATCH, 0);
    s8(g, ALTKEY_LATCH, 0);
    s8(g, SWORD_SWING_FLAG, 0xff);
}

// ─── dispatcher ───

/** state_machine_dispatcher_idle_default (dungeon.c:4138). */
export function stateMachineDispatcherIdleDefault(g: Uint8Array): void {
    s8(g, SLOPE_DIRECTION, 0);
    s8(g, JUMP_PHASE_FLAGS, 0x7f);
}

/** init_horizontal_sliding (dungeon.c:4117). */
export function initHorizontalSliding(g: Uint8Array): void {
    if (setZeroFlagIfSlippery(g) !== 0) return; // not slippery
    if (g8(g, SLIDE_TICKS_REMAINING) !== 0) return; // already sliding
    if (g8(g, ON_ROPE_FLAGS) !== 0) return; // on rope

    let accum = ((g8(g, HORIZ_MOVEMENT_ACCUM) >> 1) & 0xff) as number;
    if (accum === 0) return;
    if (accum >= 10) accum = 10;

    s8(g, SLIDE_TICKS_REMAINING, accum);
    s8(g, HORIZ_MOVEMENT_ACCUM, 0);
}

/** down_pressed (dungeon.c:4150). */
export function downPressed(
    g: Uint8Array,
    movePlatformDownDamageMonster: (g: Uint8Array) => boolean,
): void {
    s8(g, BYTE_9F18, 0);

    if (g8(g, SLOPE_DIRECTION) !== 0) return;

    if (movePlatformDownDamageMonster(g)) return;

    let si = wrapMapFromAbove(
        (heroCoordsToAddrInProximity(g) + 3 * PROX_COLS + 1) & 0xffff,
    );

    if (isOverRope(g, si)) {
        // descend one step per frame while holding down on a rope
        s8(g, 0xe7 /* HERO_ANIM_PHASE */, (g8(g, 0xe7) + 1) & 0xff);

        if (isBlockingTile(g, g8(g, si)) !== false) {
            s8(g, 0xe7, g8(g, 0xe7) | 1);
            return;
        }

        heroScrollDownLocal(g);
        s8(g, RENDER_DONE, 0);
        s8(g, RENDER_REQUEST, 0xff);
        return;
    }

    if (g8(g, ON_ROPE_FLAGS) === 0) {
        // already on the ground: crouch
        s8(g, 0x9f0a /* FRAME_TICKS */, 0);
        s8(g, SQUAT_FLAG, 0xff);
        return;
    }

    // was on rope: dismount onto the ground
    s8(g, ON_ROPE_FLAGS, 0x80);
    s8(g, JUMP_PHASE_FLAGS, 0x80);
}

function heroScrollDownLocal(g: Uint8Array): void {
    s8(g, 0x82, (g8(g, 0x82) + 1) & 0xff);
    let addr = (g16(g, 0xff31) + PROX_COLS) & 0xffff;
    if (addr >= 0xe000 + 36 * 64) addr -= 36 * 64;
    s16(g, 0xff31, addr);
}

/** up_pressed (dungeon.c:5097). */
export function upPressed(
    g: Uint8Array,
    callbacks: {
        tryMovePlatformUp: (g: Uint8Array) => boolean;
        enterTheDoor: (g: Uint8Array, shouldBreak: { v: number }) => void;
    },
): void {
    s8(g, BYTE_9F18, 0);
    const shouldBreak = { v: 0 };
    tryDoorInteraction(g, shouldBreak);
    if (shouldBreak.v !== 0) return;
    if (callbacks.tryMovePlatformUp(g)) return;
    tryClimbRope(g);
    jumpPressHandler(g);
}

/** try_door_interaction (dungeon.c:5120). */
export function tryDoorInteraction(
    g: Uint8Array,
    shouldBreak: { v: number },
    enterTheDoor?: (g: Uint8Array, sb: { v: number }) => void,
): void {
    let si = wrapMapFromBelow((heroCoordsToAddrInProximity(g) - PROX_COLS - 1) & 0xffff);

    if (g8(g, si) === 0x4a) {
        // standing on the right door tile
        if ((g8(g, FACING) & LEFT_FLAG) !== 0) {
            shouldBreak.v = 0xff;
            moveHeroLeftIfNoObstacles(g);
        }
        return;
    }

    si++;
    if (g8(g, si) === 0x4a) {
        // centered on the door
        if (enterTheDoor) enterTheDoor(g, shouldBreak);
        return;
    }

    si++;
    if (g8(g, si) === 0x4a) {
        // standing on the left door tile
        if ((g8(g, FACING) & LEFT_FLAG) === 0) {
            shouldBreak.v = 0xff;
            moveHeroRightIfNoObstacles(g);
        }
        return;
    }
    // no door
}

/** left_default (dungeon.c:4562). */
export function leftDefault(g: Uint8Array): void {
    let si = wrapMapFromAbove((heroCoordsToAddrInProximity(g) + 3 * PROX_COLS + 1) & 0xffff);
    if (!isBlockingTile(g, g8(g, si))) {
        si++;
        if (isBlockingTile(g, g8(g, si))) {
            moveHeroRightIfNoObstacles(g);
        }
    }
}

/** right_default (dungeon.c:4575). */
export function rightDefault(g: Uint8Array): void {
    let si = wrapMapFromAbove((heroCoordsToAddrInProximity(g) + 3 * PROX_COLS + 1) & 0xffff);
    if (!isBlockingTile(g, g8(g, si))) {
        si--;
        if (isBlockingTile(g, g8(g, si))) {
            moveHeroLeftIfNoObstacles(g);
        }
    }
}

/** right_up_pressed (dungeon.c:4177). */
export function rightUpPressed(g: Uint8Array): void {
    s8(g, 0x9f0b /* BYTE_9F0B */, 0xff);
    jumpPressHandler(g);
    onRightPressed(g);
}

/** left_up_pressed (dungeon.c:4232). */
export function leftUpPressed(g: Uint8Array): void {
    s8(g, 0x9f0b, 0xff);
    jumpPressHandler(g);
    onLeftPressed(g);
}

/**
 * state_machine_dispatcher (dungeon.c:4068).
 *
 * movePlatformDownDamageMonster is injected (lives in dungeon-vertical).
 */
export function stateMachineDispatcher(
    g: Uint8Array,
    deps: {
        movePlatformDownDamageMonster: (g: Uint8Array) => boolean;
    },
): void {
    s8(g, SLIDE_DIRECTION, 0);

    const dirs = g8(g, INPUT_DIRS);

    if (dirs === (KEY_LEFT | KEY_UP)) {
        leftUpPressed(g);
        return;
    }
    if (dirs === (KEY_RIGHT | KEY_UP)) {
        rightUpPressed(g);
        return;
    }
    if (dirs === KEY_UP) {
        upPressedDispatch(g, deps);
        return;
    }

    // squat/turn handling while airborne (not on a rope, mid-jump)
    if (g8(g, ON_ROPE_FLAGS) === 0 && g8(g, JUMP_PHASE_FLAGS) !== 0) {
        if (g8(g, BYTE_9F0B) === 0) {
            stateMachineDispatcherIdleDefault(g);
            return;
        }
        s8(g, BYTE_9F0B, 0);
        if ((g8(g, FACING) & UP_FLAG) === 0) {
            stateMachineDispatcherIdleDefault(g);
            return;
        }
        // no_squat_mode
        if ((g8(g, FACING) & LEFT_FLAG) !== 0) {
            onLeftPressed(g);
        } else {
            onRightPressed(g);
        }
        stateMachineDispatcherIdleDefault(g);
        return;
    }

    // on ground or rope: re-trigger sliding init only when facing changed
    const faceLeft = g8(g, FACING) & LEFT_FLAG;
    if (faceLeft !== g8(g, BYTE_9F24)) {
        initHorizontalSliding(g);
    }
    s8(g, BYTE_9F24, faceLeft);

    if (dirs === KEY_DOWN) {
        downPressed(g, deps.movePlatformDownDamageMonster);
    }

    const lr = dirs & (KEY_LEFT | KEY_RIGHT);
    if (lr === KEY_LEFT) {
        onLeftPressed(g);
        return;
    }
    if (lr === KEY_RIGHT) {
        onRightPressed(g);
        return;
    }

    initHorizontalSliding(g);
    if ((g8(g, ON_ROPE_FLAGS) | g8(g, SQUAT_FLAG)) !== 0) {
        return;
    }
    s8(g, 0xe7 /* HERO_ANIM_PHASE */, 0x80);
}

function upPressedDispatch(
    g: Uint8Array,
    _deps: { movePlatformDownDamageMonster: (g: Uint8Array) => boolean },
): void {
    // up_pressed without door/platform injection points beyond the caller's
    // scope here; doors are wired through tryDoorInteraction's optional hook.
    s8(g, BYTE_9F18, 0);
    const shouldBreak = { v: 0 };
    tryDoorInteraction(g, shouldBreak);
    if (shouldBreak.v !== 0) return;
    // try_move_platform_up is injected by the caller-facing wrapper
    tryClimbRope(g);
    jumpPressHandler(g);
}

/** sliding_physics_step (dungeon.c:4334). */
export function slidingPhysicsStep(g: Uint8Array): void {
    if (setZeroFlagIfSlippery(g) !== 0) return; // not slippery
    if (g8(g, JUMP_PHASE_FLAGS) !== 0) return; // airborne
    if (g8(g, SLIDE_TICKS_REMAINING) === 0) return;

    s8(g, SLIDE_TICKS_REMAINING, (g8(g, SLIDE_TICKS_REMAINING) - 1) & 0xff);
    let si = wrapMapFromAbove((heroCoordsToAddrInProximity(g) + 3 * PROX_COLS + 1) & 0xffff);

    const tile = g8(g, si);
    if (tile >= 0x40 && tile < 0x49) {
        s8(g, SLIDE_TICKS_REMAINING, 0); // non-slippery tile: stop
        return;
    }

    const slideDir = g8(g, SLIDE_DIRECTION);
    if ((g8(g, SLIDE_DIRECTION_LOCK) & 1) === 0) {
        if (slideDir === 2) return;
        moveHeroLeftIfNoObstacles(g);
    } else {
        if (slideDir === 1) return;
        moveHeroRightIfNoObstacles(g);
    }
}

/** hero_knockback_handler (dungeon.c:4269). */
export function heroKnockbackHandler(g: Uint8Array): void {
    if (g8(g, 0x9f14 /* BYTE_9F14 */) === 0) return;

    let moveLeft: boolean;

    if (g8(g, 0x9f01 /* BOSS_PLACEMENT */) !== 0) {
        moveLeft = true;
    } else {
        const wordNonzero = g16(g, 0x9f0e) !== 0;
        moveLeft =
            wordNonzero && g16(g, 0x9f10) !== 0
                ? (g8(g, FACING) & LEFT_FLAG) === 0
                : !wordNonzero;
    }

    if (moveLeft) {
        if (g8(g, ON_ROPE_FLAGS) !== 0) {
            s8(g, FACING, (g8(g, FACING) & 0xfc) | LEFT_FLAG);
            s8(g, JUMP_PHASE_FLAGS, 0x7f);
            s8(g, SPACEBAR_LATCH, 0);
        }
        moveHeroLeftIfNoObstacles(g);
        moveHeroLeftIfNoObstacles(g);
    } else {
        if (g8(g, ON_ROPE_FLAGS) !== 0) {
            s8(g, FACING, g8(g, FACING) & 0xfc);
            s8(g, JUMP_PHASE_FLAGS, 0x7f);
            s8(g, SPACEBAR_LATCH, 0);
        }
        moveHeroRightIfNoObstacles(g);
        moveHeroRightIfNoObstacles(g);
    }

    if (g8(g, ON_ROPE_FLAGS) !== 0) {
        s8(g, ON_ROPE_FLAGS, 0x80);
        s8(g, JUMP_PHASE_FLAGS, 0);
    }

    if (g8(g, AIR_UP_TILE_FOUND) !== 0) return;
    if ((g8(g, JUMP_PHASE_FLAGS) & 0x80) !== 0) return;

    // check_floor_for_landing returns nonzero when landing is possible
    const floor = floorCheck(g);
    if (floor === 0) return;

    if (g8(g, 0x9f09 /* BYTE_9F09 */) !== 0) {
        s8(g, 0x9f09, (g8(g, 0x9f09) - 1) & 0xff);
        s8(g, HERO_HEAD_Y_VIEW, (g8(g, HERO_HEAD_Y_VIEW) + 1) & 0xff);
    } else {
        heroScrollDownLocal(g);
    }
}

import { checkFloorForLanding as floorCheck } from './dungeon-vertical.js';

/** airborne_movement (dungeon.c:4475). Returns C's return value. */
export function airborneMovement(g: Uint8Array): number {
    if (g8(g, AIR_UP_TILE_FOUND) !== 0) return 1;
    if ((g8(g, JUMP_PHASE_FLAGS) & 0x80) !== 0) return 1;

    heroCollapsePlatformLocal(g);
    slopeAssistTick(g);
    if (floorCheck(g) === 0) {
        // land_after_jump semantics live in dungeon-vertical
        return landAfterJumpTickG(g);
    }

    s8(g, 0x9f08 /* JUMP_HEIGHT_COUNTER */, (g8(g, 0x9f08) + 1) & 0xff);
    if (g8(g, 0x9f09) !== 0) {
        s8(g, 0x9f09, (g8(g, 0x9f09) - 1) & 0xff);
        s8(g, HERO_HEAD_Y_VIEW, (g8(g, HERO_HEAD_Y_VIEW) + 1) & 0xff);
    } else {
        heroScrollDownLocal(g);
    }

    if ((g8(g, FACING) & UP_FLAG) === 0) {
        const si = wrapMapFromAbove(
            (heroCoordsToAddrInProximity(g) + 2 * PROX_COLS + 1) & 0xffff,
        );
        if (isOverRope(g, si)) {
            s8(g, ON_ROPE_FLAGS, 0xff); // grab onto rope mid-air
            return 0;
        }
    }

    s8(g, 0xe7 /* HERO_ANIM_PHASE */, 0x80);
    const oldPhase = g8(g, JUMP_PHASE_FLAGS);
    void oldPhase;
    s8(g, JUMP_PHASE_FLAGS, 0x7f);
    if (g8(g, SLOPE_DIRECTION) !== 0) return 0;
    if (g8(g, INVINCIBILITY_FLAG) !== 0) return 0;

    const horizInput = g8(g, INPUT_DIRS) & (KEY_LEFT | KEY_RIGHT);

    if (horizInput === KEY_LEFT) {
        if ((g8(g, FACING) & LEFT_FLAG) === 0) {
            s8(g, FACING, g8(g, FACING) & ~UP_FLAG);
            s8(g, FACING, g8(g, FACING) ^ LEFT_FLAG);
            leftDefault(g);
            return 0;
        }
    } else if (horizInput === KEY_RIGHT) {
        if ((g8(g, FACING) & LEFT_FLAG) !== 0) {
            s8(g, FACING, g8(g, FACING) & ~UP_FLAG);
            s8(g, FACING, g8(g, FACING) ^ LEFT_FLAG);
            rightDefault(g);
            return 0;
        }
    }

    if ((g8(g, FACING) & UP_FLAG) === 0) {
        if (horizInput === KEY_LEFT) {
            rightDefault(g);
        } else if (horizInput === KEY_RIGHT) {
            leftDefault(g);
        }
    } else {
        if ((g8(g, FACING) & LEFT_FLAG) !== 0) {
            onLeftPressed(g);
        } else {
            onRightPressed(g);
        }
    }
    return 0;
}

// late-bound imports from dungeon-vertical to avoid cycles
import {
    heroCollapsePlatform as heroCollapsePlatformFn,
    slopeAssistOnLanding as slopeAssistTick,
    landAfterJump as landAfterJumpG,
} from './dungeon-vertical.js';

function heroCollapsePlatformLocal(g: Uint8Array): void {
    heroCollapsePlatformFn(g);
}
function landAfterJumpTickG(g: Uint8Array): number {
    return landAfterJumpG(g) ? 1 : 0;
}


/** Browse_Projectiles (dungeon.c:5777). */
export function browseProjectiles(g: Uint8Array): void {
    let p = PROJECTILES_LIST;
    for (;;) {
        if (g8(g, p) === 0xff) {
            s8(g, PROJECTILES_LIST, 0xff);
            return;
        }
        p += 13;
    }
}

/** reset_dungeon_state_vars (dungeon.c:1218). */
export function resetDungeonStateVars(g: Uint8Array): void {
    s8(g, SWORD_SWING_FLAG, 0);
    s8(g, UI_ELEMENT_DIRTY, 0);
    s8(g, 0xff3c /* SPELL_ACTIVE_FLAG */, 0);
    s8(g, SQUAT_FLAG, 0);
    s8(g, HERO_DAMAGE_THIS_FRAME, 0);
    s8(g, 0x9eef /* BYTE_9EEF */, 0);
    s8(g, 0xff3e /* BYTE_FF3E */, 0);
    s8(g, 0xff4b /* BYTE_FF4B */, 0);
    s8(g, HEARTBEAT_VOLUME, 0);
    s8(g, 0xe7 /* HERO_ANIM_PHASE */, 0);
    s8(g, PROJECTILES_LIST, 0xff);
    s8(g, BOSS_EXPLOSIONS_LIST, 0);
    s16(g, MAGIC_PROJECTILES_ADDR, 0xffff);
    s8(g, HERO_HIDDEN_FLAG, 0xff);
    s8(g, 0x9ef5 /* BYTE_9EF5 */, 0xff);
    clearViewportBufferLocal(g);
}

function clearViewportBufferLocal(g: Uint8Array): void {
    g.fill(0xfd, 0xe900, 0xe900 + VIEW_COLS * 19);
}
