/**
 * eai3.ts — TS port of src/eai3.c (Stage 9c): monster AI for four types,
 * selected by `flags & 0x0F`: 0=airborne wanderer (8-state machine with
 * diagonal dodge sequence), 1=grounded crawler (per-facing direction
 * table), 2=stationary shooter (peek/windup/fire/recover), 3=grounded
 * chaser (patrol + face-hero).
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import {
    coordsToProxAddr,
    isBlocking,
    wrapMapFromAbove,
    moveMonsterE,
    moveMonsterN,
    moveMonsterNE,
    moveMonsterNW,
    moveMonsterS,
    moveMonsterSE,
    moveMonsterSW,
    moveMonsterW,
    checkCollisionN2,
    monsterMoveInDirection,
} from './dungeon-entities.js';
import { heroHitsMonster } from './dungeon-combat.js';
import { addProjectileToArray } from './dungeon-projectiles.js';
import { memRead8, memWrite8 } from '../core/ts-memory.js';

// g_mem addresses
const HERO_Y = 0xff35;

interface ProxResult {
    value: number;
    carry: boolean;
}

interface DistResult {
    value: number; // AL
    dist: number; // AH (only meaningful when value !== 0xFF)
    carry: boolean;
}

// byte_A4E4 / byte_A4EA: per-facing direction cycle for type1's crawl.
const TYPE1_DIR_TABLE_RIGHT = [1, 1, 0, 0, 7, 7]; // NE NE E E SE SE
const TYPE1_DIR_TABLE_LEFT = [3, 3, 4, 4, 5, 5]; // NW NW W W SW SW

// Projectile templates fired by type2 (bytes 0-1 patched per shot).
const type2ShotRight = [0, 0, 0, 0, 0x0f, 0, 0x28, 0, 0, 0, 0, 0, 0]; // byte_A654/A655
const type2ShotLeft = [0, 0, 0, 0, 0x0f, 4, 0x28, 0, 0, 0, 0, 0, 0]; // byte_A661/A662

/** Monster_AI_3 (eai3.c:96). */
export function monsterAi3(g: Uint8Array, m: number): void {
    switch (memRead8(g, m + 4) & 0x0f) {
        case 0: type0Ai(g, m); return;
        case 1: type1Ai(g, m); return;
        case 2: type2Ai(g, m); return;
        case 3: type3Ai(g, m); return;
        default: return; // 4-entry jump table by design
    }
}

// ─── Type 0 — airborne wanderer ───

function type0Ai(g: Uint8Array, m: number): void { // loc_A2C8
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 2); // .hp

    if ((memRead8(g, m + 5) & 0x20) !== 0) { // .ai_flags: hit
        heroHitsMonster(g, m);
        return;
    }

    switch (memRead8(g, m + 9) & 7) { // .ai_state
        case 0: type0State0(g, m); return;
        case 1: type0State1(g, m); return;
        case 2: type0State2(g, m); return;
        case 3: type0State3(g, m); return;
        case 4: type0State4(g, m); return;
        case 5: type0State5(g, m); return;
        case 6: type0State6(g, m); return;
        case 7: type0State7(g, m); return;
    }
}

// loc_A34D: back to normal ground patrol.
function type0ResetPatrol(g: Uint8Array, m: number): void {
    memWrite8(g, m + 9, 1); // .ai_state
    memWrite8(g, m + 6, 8); // .anim_counter
}

// loc_A327/loc_A33F: bounce off a wall — flip facing; may drop to patrol.
function type0TurnAround(g: Uint8Array, m: number): void {
    const timer = memRead8(g, m + 0x0a); // .ai_timer
    memWrite8(g, m + 0x0a, 0);
    memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80); // flip facing
    if ((timer & 1) === 0) {
        type0ResetPatrol(g, m);
    }
}

// loc_A2F9: patrol step with occasional turn-around.
function type0State0(g: Uint8Array, m: number): void {
    memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 7); // .anim_counter

    if (checkCollisionN2(g, m) === 0) {
        type0ResetPatrol(g, m);
        return;
    }
    if ((memRead8(g, m + 6) & 1) === 0) return; // only act on odd frames

    const x = memRead8(g, m + 3); // .m_x_rel
    if (x >= 0x12 && x < 0x15) {
        type0ResetPatrol(g, m);
        return;
    }

    if ((memRead8(g, m + 5) & 0x80) === 0) { // facing left
        if (moveMonsterW(g, m) === 0) type0TurnAround(g, m);
    } else { // facing right
        if (moveMonsterE(g, m) === 0) type0TurnAround(g, m);
    }
}

// loc_A356: fall one row, then advance to the dodge setup.
function type0State1(g: Uint8Array, m: number): void {
    if (moveMonsterS(g, m) === 0) {
        memWrite8(g, m + 9, 2); // .ai_state
        memWrite8(g, m + 6, 9); // .anim_counter
    }
}

// loc_A367: enter the diagonal-dodge sequence.
function type0State2(g: Uint8Array, m: number): void {
    memWrite8(g, m + 9, 3); // .ai_state
    memWrite8(g, m + 6, 0x0a); // .anim_counter
    memWrite8(g, m + 0x0a, 0); // .ai_timer
}

// loc_A374: one NW/NE dodge step, switching state after the first step.
function type0State3(g: Uint8Array, m: number): void {
    if (memRead8(g, m + 0x0a) === 1) { // .ai_timer
        memWrite8(g, m + 9, 4); // .ai_state
        memWrite8(g, m + 0x0a, 0xff);
    }
    memWrite8(g, m + 6, 0x0b); // .anim_counter

    if ((memRead8(g, m + 5) & 0x80) === 0) { // facing left
        memWrite8(g, m + 0x0a, (memRead8(g, m + 0x0a) + 1) & 0xff);
        if (moveMonsterNW(g, m) === 0) memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80);
    } else { // facing right
        memWrite8(g, m + 0x0a, (memRead8(g, m + 0x0a) + 1) & 0xff);
        if (moveMonsterNE(g, m) === 0) memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80);
    }
}

// loc_A3AC: continue the dodge with a plain W/E step.
function type0State4(g: Uint8Array, m: number): void {
    if (memRead8(g, m + 0x0a) === 1) memWrite8(g, m + 9, 5); // .ai_timer / .ai_state

    memWrite8(g, m + 6, 8); // .anim_counter

    if ((memRead8(g, m + 5) & 0x80) === 0) { // facing left
        memWrite8(g, m + 0x0a, (memRead8(g, m + 0x0a) + 1) & 0xff);
        if (moveMonsterW(g, m) === 0) memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80);
    } else { // facing right
        memWrite8(g, m + 0x0a, (memRead8(g, m + 0x0a) + 1) & 0xff);
        if (moveMonsterE(g, m) === 0) memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80);
    }
}

// loc_A3E0: SW/SE diagonal drop back down towards patrol height.
function type0State5(g: Uint8Array, m: number): void {
    memWrite8(g, m + 6, 8); // .anim_counter

    const blocked = (memRead8(g, m + 5) & 0x80) !== 0
        ? moveMonsterSE(g, m) === 0
        : moveMonsterSW(g, m) === 0;
    if (blocked) {
        memWrite8(g, m + 6, 9); // .anim_counter
        memWrite8(g, m + 9, 6); // .ai_state
    }
}

// loc_A405: one-frame pause before the final climb-back-up step.
function type0State6(g: Uint8Array, m: number): void {
    memWrite8(g, m + 6, 0x0a); // .anim_counter
    memWrite8(g, m + 9, 7); // .ai_state
}

// loc_A40E: climb back up (NW/NE), ceiling check, then return to patrol.
function type0State7(g: Uint8Array, m: number): void {
    memWrite8(g, m + 6, 8); // .anim_counter

    if ((memRead8(g, m + 5) & 0x80) === 0) { // facing left
        if (moveMonsterNW(g, m) !== 0) return; // moved NW, done this frame

        // blocked NW — check if we hit the ceiling
        if (checkCollisionN2(g, m) !== 0) {
            // loc_A42C: back to full patrol
            memWrite8(g, m + 9, 0);
            memWrite8(g, m + 6, 0);
            memWrite8(g, m + 0x0a, 1);
        } else {
            memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80); // keep climbing, flip facing
        }
    } else { // facing right
        if (moveMonsterNE(g, m) !== 0) return; // moved NE, done this frame

        // blocked NE — try moving N instead
        if (moveMonsterN(g, m) === 0) {
            // blocked N too — reached the ceiling, back to full patrol
            memWrite8(g, m + 9, 0);
            memWrite8(g, m + 6, 0);
            memWrite8(g, m + 0x0a, 1);
        } else {
            memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80); // keep climbing, flip facing
        }
    }
}

// ─── Type 1 — grounded crawler ───

function type1Ai(g: Uint8Array, m: number): void { // loc_A44D
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 2); // .hp

    if ((memRead8(g, m + 5) & 0x20) !== 0) { // .ai_flags: hit
        heroHitsMonster(g, m);
        return;
    }

    if ((memRead8(g, m + 9) & 8) === 0) { // not yet in the crawl cycle
        if ((memRead8(g, m + 9) & 4) === 0) { // pick an initial facing
            memWrite8(g, m + 5, memRead8(g, m + 5) | 0x80); // tentatively face right
            if (memRead8(g, m + 3) >= 0x11) { // too far right of the anchor
                memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80); // face left instead
            }
        }

        if (moveMonsterS(g, m) !== 0) return; // still falling

        // loc_A484: grounded — throttle the landing animation
        const sum = (memRead8(g, m + 6) & 0xf0) + 0x80;
        memWrite8(g, m + 6, sum & 0xff);
        if (sum >= 0x100) {
            memWrite8(g, m + 6, 0);
            memWrite8(g, m + 9, memRead8(g, m + 9) | 8); // enter the crawl cycle
        }
        return;
    }

    // loc_A498: crawling — cycle through the direction table
    memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfb); // .ai_state

    const oldAnim = memRead8(g, m + 6); // pre-increment value used as table index
    memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 7);
    if (memRead8(g, m + 6) >= 6) {
        memWrite8(g, m + 6, 0);
        memWrite8(g, m + 9, memRead8(g, m + 9) & 0xf7); // .ai_state
    }

    const dirTable = (memRead8(g, m + 5) & 0x80) !== 0 ? TYPE1_DIR_TABLE_RIGHT : TYPE1_DIR_TABLE_LEFT;
    const dir = dirTable[oldAnim] ?? 0;
    if (monsterMoveInDirection(g, m, dir) !== 0) return; // moved

    memWrite8(g, m + 9, memRead8(g, m + 9) & 0xf7); // .ai_state
    if (memRead8(g, m + 6) === 1) {
        memWrite8(g, m + 9, memRead8(g, m + 9) | 4); // .ai_state
        memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80); // flip facing
    }
    memWrite8(g, m + 6, 0);
    moveMonsterS(g, m); // tail call, result unused
}

// ─── Type 2 — stationary shooter ───

function type2Ai(g: Uint8Array, m: number): void { // loc_A4F0
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 4); // .hp

    if ((memRead8(g, m + 5) & 0x20) !== 0) { // .ai_flags: hit
        heroHitsMonster(g, m);
        return;
    }

    if (moveMonsterS(g, m) !== 0) return; // still falling

    switch (memRead8(g, m + 9) & 3) { // .ai_state
        case 0: type2State0(g, m); return;
        case 1: type2State1(g, m); return;
        case 2: type2State2(g, m); return;
        case 3: type2State3(g, m); return;
    }
}

// loc_A521: idle/peek state.
function type2State0(g: Uint8Array, m: number): void {
    memWrite8(g, m + 4, memRead8(g, m + 4) | 0x60); // .flags

    const sum = memRead8(g, m + 6) + 0x80;
    memWrite8(g, m + 6, sum & 0xff);
    if (sum < 0x100) return; // throttling

    memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 1); // .anim_counter
    if (memRead8(g, m + 6) !== 0) return;

    memWrite8(g, m + 0x0a, (memRead8(g, m + 0x0a) + 1) & 0xff); // .ai_timer
    if (memRead8(g, m + 0x0a) >= 7) {
        memWrite8(g, m + 9, 1); // .ai_state
        memWrite8(g, m + 6, 2); // .anim_counter
    }

    // Probe the tile just ahead and step into cover or bounce off it,
    // flipping facing.
    if ((memRead8(g, m + 5) & 0x80) !== 0) { // facing right
        let addr = coordsToProxAddr(g, memRead8(g, m + 3), memRead8(g, m + 2));
        addr += 0x4a;
        addr = wrapMapFromAbove(addr);
        if (isBlocking(g, memRead8(g, addr)) !== 0) {
            moveMonsterE(g, m);
        } else {
            memWrite8(g, m + 5, memRead8(g, m + 5) & 0x7f);
            moveMonsterW(g, m);
        }
    } else { // facing left
        let addr = coordsToProxAddr(g, memRead8(g, m + 3), memRead8(g, m + 2));
        addr += 0x47;
        addr = wrapMapFromAbove(addr);
        if (isBlocking(g, memRead8(g, addr)) !== 0) {
            moveMonsterW(g, m);
        } else {
            memWrite8(g, m + 5, memRead8(g, m + 5) | 0x80);
            moveMonsterE(g, m);
        }
    }
}

// loc_A5A3: brief windup before aiming at the hero.
function type2State1(g: Uint8Array, m: number): void {
    memWrite8(g, m + 4, memRead8(g, m + 4) & 0x1f); // .flags
    memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 0xff); // .anim_counter
    if (memRead8(g, m + 6) === 5) {
        memWrite8(g, m + 9, 2); // .ai_state
        memWrite8(g, m + 0x0a, 0); // .ai_timer
    }
}

// loc_A5BA: aiming — fire once aligned, give up after a few tries.
function type2State2(g: Uint8Array, m: number): void {
    if ((memRead8(g, m + 9) & 0x80) !== 0) { // already committed to recovery
        type2EnterRecovery(g, m);
        return;
    }

    const sum = memRead8(g, m + 6) + 0x40;
    memWrite8(g, m + 6, sum & 0xff);
    if (sum < 0x100) return; // throttling

    memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80); // flip facing

    const pr = type2ProxCheck(g, m); // sub_A625
    if (pr.carry) {
        type2Fire(g, m); // loc_A5E3
        return;
    }

    memWrite8(g, m + 0x0a, (memRead8(g, m + 0x0a) + 1) & 0xff); // .ai_timer
    if (memRead8(g, m + 0x0a) === 3) {
        type2EnterRecovery(g, m);
    }
}

// loc_A5DA: give up aiming and settle back down.
function type2EnterRecovery(g: Uint8Array, m: number): void {
    memWrite8(g, m + 9, 3); // .ai_state
    memWrite8(g, m + 6, 5); // .anim_counter
}

// loc_A5E3: fire a projectile towards the hero.
function type2Fire(g: Uint8Array, m: number): void {
    memWrite8(g, m + 6, 6); // .anim_counter
    memWrite8(g, m + 9, memRead8(g, m + 9) | 0x80); // .ai_state

    const x = memRead8(g, m + 3); // .m_x_rel
    type2ShotLeft[0] = x;
    type2ShotRight[0] = (x + 1) & 0xff;

    const y = memRead8(g, m + 2) & 0x3f; // .currY
    type2ShotLeft[1] = y;
    type2ShotRight[1] = y;

    const desc = (memRead8(g, m + 5) & 0x80) !== 0 ? type2ShotRight : type2ShotLeft;
    addProjectileToArray(g, desc);
}

// loc_A612: recovering after a shot; then back to idle.
function type2State3(g: Uint8Array, m: number): void {
    memWrite8(g, m + 6, (memRead8(g, m + 6) - 1) & 0xff); // .anim_counter
    if (memRead8(g, m + 6) === 1) {
        memWrite8(g, m + 9, 0); // .ai_state
        memWrite8(g, m + 0x0a, 0); // .ai_timer
    }
}

// sub_A625: hero within 5 rows AND monster already facing them?
function type2ProxCheck(g: Uint8Array, m: number): ProxResult {
    const dy = (memRead8(g, HERO_Y) - memRead8(g, m + 2)) & 0xff; // .currY
    const absDy = (dy & 0x80) !== 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= 5) {
        return { value: 0xff, carry: false };
    }

    if (memRead8(g, m + 3) < 0x11) { // left of the hero
        return { value: 0x80, carry: (memRead8(g, m + 5) & 0x80) !== 0 };
    } else { // at/right of the hero
        return { value: 0x00, carry: (memRead8(g, m + 5) & 0x80) === 0 };
    }
}

// ─── Type 3 — grounded chaser ───

function type3Ai(g: Uint8Array, m: number): void { // loc_A66E
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 4); // .hp

    if ((memRead8(g, m + 5) & 0x20) !== 0) { // .ai_flags: hit
        heroHitsMonster(g, m);
        return;
    }

    const oldAnim = memRead8(g, m + 6); // saved across the fall attempt
    memWrite8(g, m + 6, 0);
    if (moveMonsterS(g, m) !== 0) return; // still falling

    memWrite8(g, m + 6, oldAnim); // restore

    if ((memRead8(g, m + 9) & 1) !== 0) { // already engaged/patrolling
        type3Patrol(g, m); // loc_A6C2
        return;
    }

    memWrite8(g, m + 6, 1); // .anim_counter
    memWrite8(g, m + 0x0a, 0); // .ai_timer

    const dr = type3ProxCheck(g, m); // sub_A701
    if (dr.carry) {
        if (dr.dist < 0x0a) {
            memWrite8(g, m + 9, memRead8(g, m + 9) | 1); // begin patrol/engage
        }
        return;
    }
    if (dr.value === 0xff) return;
    memWrite8(g, m + 5, (memRead8(g, m + 5) & 0x7f) | dr.value); // face the hero
}

// loc_A6C2: patrol step — plain step then diagonal fallback; blocked on
// both = escaped. Advances the walk animation; gives up after 0x14 frames.
function type3Patrol(g: Uint8Array, m: number): void {
    memWrite8(g, m + 0x0a, (memRead8(g, m + 0x0a) + 1) & 0xff); // .ai_timer
    if (memRead8(g, m + 0x0a) === 0x14) {
        memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfe); // stop patrolling
        return;
    }

    if ((memRead8(g, m + 5) & 0x80) === 0) { // facing left
        if (moveMonsterW(g, m) === 0) {
            if (moveMonsterNW(g, m) === 0) {
                memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfe); // escaped
                return;
            }
        }
    } else { // facing right
        if (moveMonsterE(g, m) === 0) {
            if (moveMonsterNE(g, m) === 0) {
                memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfe); // escaped
                return;
            }
        }
    }

    // loc_A6F2: advance the walking animation
    memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 0xff); // .anim_counter
    if (memRead8(g, m + 6) >= 6) {
        memWrite8(g, m + 6, 1);
    }
}

// sub_A701: hero within 6 rows? distance from anchor column 0x11 plus
// which way to face towards the hero (carry=1 when already facing them).
function type3ProxCheck(g: Uint8Array, m: number): DistResult {
    const dy = (memRead8(g, HERO_Y) - memRead8(g, m + 2)) & 0xff; // .currY
    const absDy = (dy & 0x80) !== 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= 6) {
        return { value: 0xff, dist: 0, carry: false };
    }

    if (memRead8(g, m + 3) <= 0x11) { // at/left of the anchor column
        const dx = (0x11 - memRead8(g, m + 3)) & 0xff;
        const facingRight = (memRead8(g, m + 5) & 0x80) !== 0;
        return { value: 0x80, dist: dx, carry: facingRight };
    } else { // right of the anchor column
        const dx = (memRead8(g, m + 3) - 0x11) & 0xff;
        const facingLeft = (memRead8(g, m + 5) & 0x80) === 0;
        return { value: 0x00, dist: dx, carry: facingLeft };
    }
}
