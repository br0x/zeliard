/**
 * eai6.ts — TS port of src/eai6.c (Stage 9e): monster AI for five types,
 * selected by `flags & 0x0F`: 0=Type0 top half (twin at m+0x10; wanders
 * and fires a charge-up shot), 1=Type0 bottom half (no-op), 2=hovering/
 * diving flier that homes in vertically then steps diagonally, 3=grounded
 * hopper that patrols until aligned then leaps horizontally, 4=stationary
 * drop hazard.
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import {
    coordsToProxAddr,
    isBlocking,
    wrapMapFromAbove,
    wrapMapFromBelow,
    moveMonsterE,
    moveMonsterN,
    moveMonsterS,
    moveMonsterW,
    monsterMoveInDirection,
} from './dungeon-entities.js';
import {
    getRandom,
    heroHitsMonster,
    checkVerticalDistanceBetweenHeroAndMonster,
} from './dungeon-combat.js';
import { addProjectileToArray } from './dungeon-projectiles.js';

// g_mem addresses
const HERO_Y = 0xff35;
const MAP_WIDTH_ADDR = 0xc002; // word
const VIEWPORT_TOP_ROW = 0x82;
const SOUND_FX_REQUEST = 0xff75;

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

interface ProxResult {
    value: number;
    carry: boolean;
}

// byte_A75E/byte_A766: shared diagonal-step angle tables used by both
// Type2 states that walk the monster toward the hero (mostly horizontal,
// occasionally NE/SE or NW/SW). Angle encoding matches eai2.c's jump-angle
// tables (0=E,1=NE,3=NW,4=W,5=SW,7=SE).
const TYPE2_DIR_TABLE_RIGHT = [0, 0, 1, 0, 0, 0, 7, 0]; // byte_A75E
const TYPE2_DIR_TABLE_LEFT = [4, 4, 3, 4, 4, 4, 5, 4]; // byte_A766

/** Monster_AI_6 (eai6.c:128). */
export function monsterAi6(g: Uint8Array, m: number): void {
    switch (g8(g, m + 4) & 0x0f) { // .flags
        case 0: type0TopAi(g, m); return; // woman top half
        case 1: type0BottomAi(g, m); return; // woman bottom half (NOP)
        case 2: type2Ai(g, m); return; // ghost
        case 3: type3Ai(g, m); return; // chicken
        case 4: type4Ai(g, m); return; // falling ceiling
        default: return; // 5-entry jump table by design
    }
}

// ─── Type0 (top half runs the AI; bottom half is a passive twin) ───

// Bottom half: purely passive. All of its state is driven by
// type0TopAi through the twin struct writes described above.
function type0BottomAi(_g: Uint8Array, _m: number): void {
}

function type0TopAi(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 0x30); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags: this half was hit
        if ((g8(g, m + 5) & 0x1f) === 1) {
            type0DeathReaction(g, m); // loc_A4F7
            return;
        }
        s8(g, m + 5, g8(g, m + 5) & 0x9f); // clear the hit bits (0x20, 0x40)
    }

    s8(g, m + 0x15, g8(g, m + 0x15) & 0xbf); // twin.ai_flags: clear bit 0x40

    if (type0TryFall(g, m) === 0) return; // fell one row this frame, done

    if ((g8(g, m + 9) & 1) !== 0) { // .ai_state: charging up to fire
        type0ChargeTick(g, m); // loc_A48D
        return;
    }

    const pr = monsterToHeroProximityAndDirection4(g, m); // sub_A527
    if (pr.carry) {
        if ((g8(g, m + 0xa) & 0xf0) !== 0) { // .ai_timer: cooldown accumulated
            s8(g, m + 0xa, 0);
            s8(g, m + 6, 0);
            s8(g, m + 9, g8(g, m + 9) | 1); // begin charging
            type0EndSync(g, m);
            return;
        }
    }
    type0WanderStep(g, m); // loc_A447
}

// sub_A660: returns 1 when grounded (or at the strip edges / ledge flag),
// 0 after stepping both halves down one row.
function type0TryFall(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) === 0) return 1;     // .m_x_rel == 0 (left edge)
    if (g8(g, m + 3) === 0x23) return 1;  // .m_x_rel == 35 (right edge)

    if (type0CheckLedgeBelow(g, m) !== 0) return 1;

    s8(g, m + 2, (g8(g, m + 2) + 1) & 0x3f);       // .currY++
    s8(g, m + 0x12, (g8(g, m + 0x12) + 1) & 0x3f); // twin.currY++ (si+0x12)
    return 0;
}

// sub_A686: blocking tile 4 rows below (2 columns)? Otherwise bit 7 of
// the OR of both (passable) tiles — the original's final carry-out.
function type0CheckLedgeBelow(g: Uint8Array, m: number): number {
    let addr = coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2)); // .m_x_rel, .currY
    addr += 0x90; // 4 rows down (4 * 36-column proximity map)
    addr = wrapMapFromAbove(addr);

    for (let col = 0; col < 2; col++) {
        if (isBlocking(g, g8(g, addr + col)) !== 0) return 1;
    }
    const combined = (g8(g, addr) | g8(g, addr + 1)) & 0xff;
    return (combined & 0x80) !== 0 ? 1 : 0;
}

// sub_A556: step east (map-width wraparound), mirror X into the twin.
// 1 = blocked (right-edge guard or wall/ledge ahead).
function type0MoveEastAndSyncTwin(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) >= 0x22) return 1; // .m_x_rel >= 34

    if (type0CheckWallAheadE(g, m) !== 0) return 1;

    let newX = (g16(g, m) + 1) & 0xffff;
    if (newX === g16(g, MAP_WIDTH_ADDR)) newX = 0; // wrap
    s16(g, m, newX);      // .currX
    s16(g, m + 0x10, newX); // twin.currX
    s8(g, m + 3, (g8(g, m + 3) + 1) & 0xff);       // .m_x_rel
    s8(g, m + 0x13, (g8(g, m + 0x13) + 1) & 0xff); // twin.m_x_rel
    return 0;
}

// sub_A57C: wall 4 rows down / 2 columns right? Otherwise bit 7 of the
// OR of those 4 tiles plus the tile one row above the start (5 total).
function type0CheckWallAheadE(g: Uint8Array, m: number): number {
    let addr = (coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2)) + 2) & 0xffff;

    for (let i = 0; i < 4; i++) {
        if (isBlocking(g, g8(g, addr)) !== 0) return 1;
        addr += 0x24; // one row down (36-wide proximity map)
        addr = wrapMapFromAbove(addr);
    }

    let combined = 0;
    for (let i = 0; i < 5; i++) {
        addr -= 0x24;
        addr = wrapMapFromBelow(addr);
        combined |= g8(g, addr);
    }
    return (combined & 0x80) !== 0 ? 1 : 0;
}

// sub_A5DB: mirror image of move_east. 1 = blocked.
function type0MoveWestAndSyncTwin(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) < 2) return 1; // .m_x_rel < 2

    if (type0CheckWallAheadW(g, m) !== 0) return 1;

    let newX = (g16(g, m) - 1) & 0xffff;
    if (newX === 0xffff) newX = (g16(g, MAP_WIDTH_ADDR) - 1) & 0xffff; // wrap
    s16(g, m, newX);
    s16(g, m + 0x10, newX);
    s8(g, m + 3, (g8(g, m + 3) - 1) & 0xff);
    s8(g, m + 0x13, (g8(g, m + 0x13) - 1) & 0xff);
    return 0;
}

// sub_A601: mirror of check_wall_ahead_E looking 1 column left, with an
// extra 1-column shift before the backward OR-scan (as in the original).
function type0CheckWallAheadW(g: Uint8Array, m: number): number {
    let addr = (coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2)) - 1) & 0xffff;

    for (let i = 0; i < 4; i++) {
        if (isBlocking(g, g8(g, addr)) !== 0) return 1;
        addr += 0x24;
        addr = wrapMapFromAbove(addr);
    }

    addr -= 1;
    let combined = 0;
    for (let i = 0; i < 5; i++) {
        addr -= 0x24;
        addr = wrapMapFromBelow(addr);
        combined |= g8(g, addr);
    }
    return (combined & 0x80) !== 0 ? 1 : 0;
}

// loc_A4F7: propagate the "being hit" flag into the twin, then hand off
// to the common hero-hits-monster handler.
function type0DeathReaction(g: Uint8Array, m: number): void {
    let al = g8(g, m + 5) & 0x1f; // == 1 here
    al = (al & 0xbf) & 0xff;
    al = (al | 0x20) & 0xff;
    s8(g, m + 5, al);              // .ai_flags
    s8(g, m + 0x15, (al | 0x60) & 0xff); // twin.ai_flags
    heroHitsMonster(g, m);
}

// loc_A508: end-of-frame housekeeping; mirrors anim_counter into the
// twin's anim_counter, copies state bits (0x60) from .flags into the
// twin's .flags, and copies the facing bit into the twin's ai_flags.
function type0EndSync(g: Uint8Array, m: number): void {
    s8(g, m + 0x16, g8(g, m + 6)); // twin.anim_counter = .anim_counter

    const stateBits = g8(g, m + 4) & 0x60;
    s8(g, m + 0x14, ((g8(g, m + 0x14) & 0x9f) | stateBits) & 0xff); // twin.flags

    const facing = g8(g, m + 5) & 0x80;
    s8(g, m + 0x15, ((g8(g, m + 0x15) & 0x7f) | facing) & 0xff); // twin.ai_flags
}

// loc_A447: throttled random east/west wander step while not charging;
// direction re-rolled every call, facing updates only on success.
function type0WanderStep(g: Uint8Array, m: number): void {
    s8(g, m + 0xa, (g8(g, m + 0xa) + 1) & 0xff); // .ai_timer
    s8(g, m + 6, 1);  // .anim_counter
    s8(g, m + 4, (g8(g, m + 4) | 0x60) & 0xff); // .flags

    if ((getRandom(g) & 1) !== 0) {
        if (type0MoveWestAndSyncTwin(g, m) === 0) { // moved
            s8(g, m + 5, g8(g, m + 5) & 0x7f); // face left
        }
    } else {
        if (type0MoveEastAndSyncTwin(g, m) === 0) { // moved
            s8(g, m + 5, (g8(g, m + 5) | 0x80) & 0xff); // face right
        }
    }
    type0EndSync(g, m);
}

// loc_A48D: per-frame tick while charging; fires once the counter reaches
// 8, ends the charge once it wraps past 0xF.
function type0ChargeTick(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 0x0f); // .anim_counter

    if (g8(g, m + 6) === 0) {
        s8(g, m + 9, g8(g, m + 9) & 0xfe); // .ai_state: end the charge
        s8(g, m + 6, 1);
        s8(g, m + 4, (g8(g, m + 4) | 0x60) & 0xff); // .flags
        type0EndSync(g, m);
        return;
    }

    if (g8(g, m + 6) < 4) {
        type0EndSync(g, m);
        return;
    }

    s8(g, m + 4, g8(g, m + 4) & 0x1f); // .flags: clear hit/charge display bits
    if (g8(g, m + 6) === 8) {
        type0FireProjectile(g, m); // loc_A4A4 tail
    }
    type0EndSync(g, m);
}

// Fire-shot projectile templates (bytes 0-1 = X,Y, patched per shot).
// Byte 2 indexes DUNGEONS[rawMapId].projectiles (see the note in eai6.c:
// original raw base-tile 0x63 remapped to array index 0).
const type0ShotRight = [0, 0, 0, 0, 0x14, 0, 0x14, 0, 0, 0, 0, 0, 0];
const type0ShotLeft = [0, 0, 0, 0, 0x14, 4, 0x14, 0, 0, 0, 0, 0, 0];

// loc_A4A4 tail: patch and fire the single shot for the current facing.
function type0FireProjectile(g: Uint8Array, m: number): void {
    const x = g8(g, m + 3);                 // .m_x_rel
    const y = (g8(g, m + 2) + 1) & 0xff;    // .currY + 1

    type0ShotLeft[0] = x;
    type0ShotRight[0] = (x + 1) & 0xff;
    type0ShotLeft[1] = y;
    type0ShotRight[1] = y;

    const desc = (g8(g, m + 5) & 0x80) !== 0 ? type0ShotRight : type0ShotLeft; // .ai_flags
    addProjectileToArray(g, desc);
}

// sub_A527: 4-row vertical distance check + facing test (Type0's
// charge-alignment logic).
function monsterToHeroProximityAndDirection4(g: Uint8Array, m: number): ProxResult {
    const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    const absDy = (dy & 0x80) !== 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= 4) {
        return { value: 0xff, carry: false };
    }

    if (g8(g, m + 3) < 0x11) { // .m_x_rel: monster left of the hero
        return { value: 0x80, carry: (g8(g, m + 5) & 0x80) !== 0 }; // facing right => facing hero
    } else { // right of (or level with) the hero
        return { value: 0x00, carry: (g8(g, m + 5) & 0x80) === 0 }; // facing left => facing hero
    }
}

// ─── Type2 (hovering / diving flier) ───

function type2Ai(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 0x10); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags: was hit
        s8(g, m + 6, 3);      // .anim_counter
        s8(g, m + 9, 1);      // .ai_state
        heroHitsMonster(g, m);
        return;
    }

    if ((g8(g, m + 9) & 2) !== 0) { type2StateB(g, m); return; }   // loc_A78D
    if ((g8(g, m + 9) & 1) !== 0) { type2StateA(g, m); return; }   // loc_A76E
    if ((g8(g, m + 9) & 4) !== 0) { type2StateC(g, m); return; }   // loc_A815
    type2StateMain(g, m);                                          // loc_A6F0
}

// loc_A6F0: main "seek the hero's row" state.
function type2StateMain(g: Uint8Array, m: number): void {
    const pr = monsterToHeroProximityAndDirection8(g, m); // sub_A828

    if (!pr.carry) {
        if ((g8(g, m + 9) & 0x70) !== 0) { // .ai_state: throttle running
            type2MoveAndAnimate(g, m); // skip the vertical step
            return;
        }
        if (pr.value === 0xff) {
            const al = ((getRandom(g) << 1) & 0x80) & 0xff;
            s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | al) & 0xff); // random facing
        } else {
            s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | pr.value) & 0xff); // face the hero
        }
    }
    type2VerticalApproach(g, m); // loc_A718
}

// loc_A718: step one row toward the hero's Y, then fall into the
// diagonal movement/animation dispatch.
function type2VerticalApproach(g: Uint8Array, m: number): void {
    const diff = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    if (((diff << 24) >> 24) >= 0) {
        moveMonsterS(g, m);
    } else {
        moveMonsterN(g, m);
    }
    type2MoveAndAnimate(g, m);
}

// loc_A72C: throttled diagonal step toward the hero using the shared
// angle tables; flips facing if blocked.
function type2MoveAndAnimate(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 3);      // .anim_counter
    s8(g, m + 9, (g8(g, m + 9) + 0x10) & 0xff); // .ai_state throttle

    const idx = ((g8(g, m + 9) >> 4) & 7) & 0xff;
    const table = (g8(g, m + 5) & 0x80) !== 0 ? TYPE2_DIR_TABLE_RIGHT : TYPE2_DIR_TABLE_LEFT;
    const angle = table[idx] ?? 0;

    if (monsterMoveInDirection(g, m, angle) === 0) { // blocked
        s8(g, m + 5, g8(g, m + 5) ^ 0x80);
    }
}

// loc_A76E: brief "settle" state entered right after being hit, before
// moving on to state_b.
function type2StateA(g: Uint8Array, m: number): void {
    s8(g, m + 4, (g8(g, m + 4) | 0x60) & 0xff); // .flags

    s8(g, m + 6, (g8(g, m + 6) + 1) & 7); // .anim_counter
    if (g8(g, m + 6) >= 7) {
        s8(g, m + 6, 8);
        s8(g, m + 0xa, 0);  // .ai_timer
        s8(g, m + 9, 2);    // .ai_state
    }
}

// loc_A78D: secondary "seek" state (mirrors state_main but with a capped
// duration and a flipped facing convention).
function type2StateB(g: Uint8Array, m: number): void {
    s8(g, m + 0xa, (g8(g, m + 0xa) + 1) & 0xff); // .ai_timer
    if (g8(g, m + 0xa) >= 0x0f) {
        type2StateBEnd(g, m); // loc_A80C
        return;
    }

    const pr = monsterToHeroProximityAndDirection8(g, m); // sub_A828
    if (!pr.carry) {
        type2VerticalAndAnimateB(g, m); // loc_A7C2
        return;
    }

    if ((g8(g, m + 9) & 0x70) !== 0) {
        type2MoveAndAnimateB(g, m); // directly
        return;
    }

    if (pr.value === 0xff) {
        const al = ((getRandom(g) << 1) & 0x80) & 0xff;
        s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | al) & 0xff);
    } else {
        const al = (pr.value ^ 0x80) & 0xff; // flipped, unlike state_main
        s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | al) & 0xff);
    }
    type2VerticalAndAnimateB(g, m); // loc_A7C2
}

// loc_A7C2: state_b's vertical step (sign test reversed relative to
// type2_vertical_approach — reproduced exactly as in the original).
function type2VerticalAndAnimateB(g: Uint8Array, m: number): void {
    const diff = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    if (((diff << 24) >> 24) < 0) {
        moveMonsterS(g, m);
    } else {
        moveMonsterN(g, m);
    }
    type2MoveAndAnimateB(g, m);
}

// loc_A7D6: state_b's diagonal step/animate (anim_counter keeps bit 0x8
// set, distinguishing it from state_main's animation).
function type2MoveAndAnimateB(g: Uint8Array, m: number): void {
    s8(g, m + 6, (((g8(g, m + 6) + 1) & 3) | 8) & 0xff); // .anim_counter
    s8(g, m + 9, (g8(g, m + 9) + 0x10) & 0xff);           // .ai_state throttle

    const idx = ((g8(g, m + 9) >> 4) & 7) & 0xff;
    const table = (g8(g, m + 5) & 0x80) !== 0 ? TYPE2_DIR_TABLE_RIGHT : TYPE2_DIR_TABLE_LEFT;
    const angle = table[idx] ?? 0;

    if (monsterMoveInDirection(g, m, angle) === 0) { // blocked
        s8(g, m + 5, g8(g, m + 5) ^ 0x80);
    }
}

// loc_A80C: state_b timed out; snap into the recovery state.
function type2StateBEnd(g: Uint8Array, m: number): void {
    s8(g, m + 6, 0x0c); // .anim_counter
    s8(g, m + 9, 4);    // .ai_state
}

// loc_A815: recovery state; once anim_counter wraps back to 0, drop back
// to the default (state_main) behaviour.
function type2StateC(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 0x0f); // .anim_counter
    if (g8(g, m + 6) === 0) {
        s8(g, m + 9, 0);       // .ai_state
        s8(g, m + 4, g8(g, m + 4) & 0x1f); // .flags
    }
}

// ─── Type3 (grounded hopper) ───

function type3Ai(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 8); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags: was hit
        heroHitsMonster(g, m);
        return;
    }

    if ((g8(g, m + 9) & 1) !== 0) { // .ai_state: mid-jump
        type3StateJump(g, m); // loc_A8C3
        return;
    }

    if (moveMonsterS(g, m) === 0) { // grounded / couldn't descend
        type3AfterFallStep(g, m); // loc_A87A
    }
    // else: fell one row, nothing further this frame
}

// loc_A87A: once settled, check alignment; aligned → begin a jump,
// otherwise throttle and patrol.
function type3AfterFallStep(g: Uint8Array, m: number): void {
    const pr = monsterToHeroProximityAndDirection8(g, m); // sub_A828
    if (pr.carry) {
        type3BeginJump(g, m); // loc_A8BA
        return;
    }

    const sum = g8(g, m + 6) + 0x80;
    s8(g, m + 6, sum & 0xff);
    if (sum < 0x100) return; // just throttling this frame

    type3PatrolStep(g, m); // loc_A886
}

// loc_A886: one patrol step; facing flips when the step succeeds and on
// each low-nibble rollover of the patrol timer.
function type3PatrolStep(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xf3); // .anim_counter

    if ((g8(g, m + 5) & 0x80) !== 0) { // facing right
        if (moveMonsterE(g, m) === 0) {
            s8(g, m + 5, g8(g, m + 5) ^ 0x80);
        }
    } else { // facing left
        if (moveMonsterW(g, m) === 0) {
            s8(g, m + 5, g8(g, m + 5) ^ 0x80);
        }
    }

    s8(g, m + 0xa, (g8(g, m + 0xa) - 1) & 0xff); // .ai_timer
    if ((g8(g, m + 0xa) & 0x0f) === 0) {
        s8(g, m + 5, g8(g, m + 5) ^ 0x80);
    }
}

// loc_A8BA: switch into the jump state.
function type3BeginJump(g: Uint8Array, m: number): void {
    s8(g, m + 9, 1);    // .ai_state
    s8(g, m + 0xa, 0);  // .ai_timer
}

// loc_A8C3: per-frame step of an in-progress jump.
function type3StateJump(g: Uint8Array, m: number): void {
    if ((g8(g, m + 9) & 2) !== 0) { // .ai_state: recovering
        type3JumpRecover(g, m); // loc_A934
        return;
    }

    const pr = monsterToHeroProximityAndDirection8(g, m); // sub_A828 (only .value used)
    if (pr.value === 0xff) {
        type3JumpMaybeEnd(g, m); // loc_A914
        return;
    }

    s8(g, m + 6, 4); // .anim_counter

    if ((g8(g, m + 5) & 0x80) !== 0) { // facing right
        moveMonsterE(g, m);
        if (moveMonsterE(g, m) === 0) { // second step blocked
            if (type3CheckVerticalBlock(g, m) !== 0) { // sub_A947
                type3FlipAndRecover(g, m); // sub_A927 (tail call)
                return;
            }
        }
    } else { // facing left
        moveMonsterW(g, m);
        if (moveMonsterW(g, m) === 0) { // second step blocked
            if (type3CheckVerticalBlock(g, m) !== 0) { // sub_A947
                type3FlipAndRecover(g, m); // sub_A927 (tail call)
                return;
            }
        }
    }

    s8(g, m + 0xa, (g8(g, m + 0xa) + 1) & 0xff); // .ai_timer
    {
        // Original: "and al,0Fh; inc al; jnz sub_A927". Since al is masked
        // to 0..15 before the increment, the result can never be zero, so
        // this guarded call is effectively dead code in the original
        // binary — reproduced for fidelity rather than dropped.
        let al = g8(g, m + 0xa) & 0x0f;
        al = (al + 1) & 0xff;
        if (al === 0) {
            type3FlipAndRecover(g, m);
            return;
        }
    }

    if ((g8(g, m + 0xa) & 0x1f) === 0) {
        type3JumpMaybeEnd(g, m); // loc_A914
    }
}

// sub_A947: vertical deflect check for the jump. Ascending not yet
// recorded → nonzero when the down-step is blocked (CF semantics); once
// ascending is recorded → always "not blocked" (the original "or"
// unconditionally clears CF here).
function type3CheckVerticalBlock(g: Uint8Array, m: number): number {
    if ((g8(g, m + 9) & 4) === 0) { // .ai_state
        return moveMonsterS(g, m) === 0 ? 1 : 0;
    }
    moveMonsterN(g, m); // side effect only; result discarded
    return 0;
}

// sub_A927: flip facing and drop into the jump-recovery state.
function type3FlipAndRecover(g: Uint8Array, m: number): void {
    s8(g, m + 9, g8(g, m + 9) | 2);     // .ai_state
    s8(g, m + 5, g8(g, m + 5) ^ 0x80);  // .ai_flags: flip facing
    s8(g, m + 6, 5);                    // .anim_counter
}

// loc_A934: recovery countdown after a jump.
function type3JumpRecover(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff); // .anim_counter
    if ((g8(g, m + 6) & 7) === 0) {
        s8(g, m + 9, g8(g, m + 9) & 0xfd); // .ai_state
        s8(g, m + 6, 4);
    }
}

// loc_A914: end the jump once no longer aligned with the hero.
function type3JumpMaybeEnd(g: Uint8Array, m: number): void {
    const pr = monsterToHeroProximityAndDirection8(g, m); // sub_A828
    if (!pr.carry) {
        s8(g, m + 6, 0);   // .anim_counter
        s8(g, m + 9, 0);   // .ai_state
        s8(g, m + 0xa, 0); // .ai_timer
    }
}

// sub_A527/sub_A828: shared 8-row vertical distance check + facing test
// (used by Type2 and Type3).
function monsterToHeroProximityAndDirection8(g: Uint8Array, m: number): ProxResult {
    const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    const absDy = (dy & 0x80) !== 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= 8) {
        return { value: 0xff, carry: false };
    }

    if (g8(g, m + 3) < 0x11) { // .m_x_rel: monster left of the hero
        return { value: 0x80, carry: (g8(g, m + 5) & 0x80) !== 0 };
    } else {
        return { value: 0x00, carry: (g8(g, m + 5) & 0x80) === 0 };
    }
}

// ─── Type4 (stationary drop hazard — no HP of its own) ───

function type4Ai(g: Uint8Array, m: number): void {
    s8(g, m + 4, (g8(g, m + 4) | 0x20) & 0xff); // .flags: force "hit" bit every frame

    if ((g8(g, m + 9) & 2) !== 0) { // .ai_state: falling
        type4FallThrottle(g, m); // loc_A9B4
        return;
    }
    if ((g8(g, m + 9) & 1) !== 0) { // .ai_state: about to fall
        type4StartFall(g, m); // loc_A98C
        return;
    }

    if (g8(g, m + 3) < 8) return;     // .m_x_rel: hero not under it yet
    if (g8(g, m + 3) >= 0x13) return; // .m_x_rel: hero has passed it

    if ((getRandom(g) & 3) === 0) {
        s8(g, m + 9, g8(g, m + 9) | 1); // arm the drop
    }
}

// loc_A98C: descend one row per frame until floor; then begin the
// falling-crush sequence. Warning sound if close enough to viewport top.
function type4StartFall(g: Uint8Array, m: number): void {
    if (moveMonsterS(g, m) !== 0) return; // still descending; keep waiting

    s8(g, m + 9, g8(g, m + 9) | 2); // .ai_state
    s8(g, m + 6, 1);                // .anim_counter

    const topRow = (g8(g, VIEWPORT_TOP_ROW) - 1) & 0xff;
    const rel = (g8(g, m + 2) - topRow) & 0x3f; // .currY
    if (rel < 0x13) {
        s8(g, SOUND_FX_REQUEST, 0x21);
    }
}

// loc_A9B4: throttled fall animation; once complete, hand off to the
// generic proximity/vertical-distance check shared by the engine.
function type4FallThrottle(g: Uint8Array, m: number): void {
    const sum = g8(g, m + 6) + 0x80;
    s8(g, m + 6, sum & 0xff);
    if (sum < 0x100) return; // just throttling this frame

    s8(g, m + 6, (g8(g, m + 6) + 1) & 3);
    if (g8(g, m + 6) !== 0) return;

    s8(g, m + 7, ((g8(g, m + 7) & 0xf0) | 1) & 0xff);
    checkVerticalDistanceBetweenHeroAndMonster(g, m);
}
