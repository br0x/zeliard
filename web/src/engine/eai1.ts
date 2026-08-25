/**
 * eai1.ts — TS port of src/eai1.c (Stage 9b): monster AI for four types,
 * selected by `flags & 0x0F`: 0=Bat, 1=Slug, 2=Frog, 3=Rat.
 *
 * Ported 1:1; carry-flag conventions preserved (movers return nonzero on
 * success, 0 when blocked). Uses the Stage 8a movement/collision primitives
 * and the Stage 8c combat helpers.
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
    checkCollisionE2,
    checkCollisionW2,
    checkCollisionInDirection,
    monsterMoveInDirection,
} from './dungeon-entities.js';
import { checkMonsterOnAggressiveGround } from './dungeon-monsters.js';
import {
    checkVerticalDistanceBetweenHeroAndMonster,
    getRandom,
    heroHitsMonster,
} from './dungeon-combat.js';

// g_mem addresses
const HERO_Y = 0xff35;
const HERO_DAMAGE_THIS_FRAME = 0xff36;

function g8(g: Uint8Array, addr: number): number {
    return g[addr & 0xffff] ?? 0;
}

function s8(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
}

/** AL + CF outputs of frog_rat_to_hero_proximity_and_direction. */
interface ProximityResult {
    value: number;
    carry: boolean;
}

function rol8(v: number, n: number): number {
    n &= 7;
    if (n === 0) return v & 0xff;
    return (((v << n) | (v >>> (8 - n))) & 0xff) as number;
}

/** Jump-angle tables (Frog/Rat mid-jump, ai_state bit 0x08). */
const JUMP_ANGLES_RIGHT = [1, 0, 0, 7]; // NE E E SE
const JUMP_ANGLES_LEFT = [3, 4, 4, 5]; // NW W W SW
/** Rat hop tables (ai_state bit 0x10). */
const RAT_JUMP_ANGLES_RIGHT = [2, 1, 1, 0, 0, 7, 7, 6]; // ↑↗↗→→↘↘↓
const RAT_JUMP_ANGLES_LEFT = [2, 3, 3, 4, 4, 5, 5, 6]; // ↓↙↙←←↖↖↑

/** Monster_AI_1 (eai1.c:82). */
export function monsterAi1(g: Uint8Array, m: number): void {
    switch (g8(g, m + 4) & 0x0f) {
        case 0: batAi(g, m); return;
        case 1: slugAi(g, m); return;
        case 2: frogAi(g, m); return;
        case 3: ratAi(g, m); return;
        default: return; // jump table only has 4 entries by design
    }
}

// ─── Bat ───

function batAi(g: Uint8Array, m: number): void {
    if (checkMonsterOnAggressiveGround(g, m) === 0) {
        checkVerticalDistanceBetweenHeroAndMonster(g, m);
        return;
    }
    if (g8(g, m + 8) === 0) s8(g, m + 8, 2); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags
        heroHitsMonster(g, m);
        return;
    }

    switch ((g8(g, m + 9) >> 6) & 3) { // .ai_state
        case 0: batAiState00(g, m); break;
        case 1: batAiState40(g, m); break;
        case 2: batAiState80(g, m); break;
        case 3: batAiStateC0(g, m); break;
    }
}

function batStepThrottle(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 7); // .anim_counter
    if (g8(g, m + 6) === 7) s8(g, m + 6, 3);
}

/** ai_state == 0x00: flying up, looking for a spot to dive. */
function batAiState00(g: Uint8Array, m: number): void {
    moveMonsterN(g, m); // return value unused

    if (g8(g, m + 6) !== 0) { // .anim_counter
        s8(g, m + 6, (g8(g, m + 6) - 16) & 0xff);
        return;
    }

    let al = (g8(g, m + 3) - 17) & 0xff; // .m_x_rel
    if (al >= 10) {
        al = (17 - g8(g, m + 3)) & 0xff;
        if (al >= 7) {
            s8(g, m + 6, 0);
            return;
        }
    }
    s8(g, m + 9, 0x40); // .ai_state
    s8(g, m + 6, 0);
}

/** ai_state == 0x40: short pause before diving. */
function batAiState40(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 7); // .anim_counter
    if (g8(g, m + 6) === 3) s8(g, m + 9, 0x80); // .ai_state
}

/** loc_A376: attempt to dive south; if blocked, snap to climbing-up state. */
function batDiveEnd(g: Uint8Array, m: number): void {
    if (moveMonsterS(g, m) === 0) s8(g, m + 9, 0xc0); // .ai_state
}

/** loc_A338: try east; if blocked, fall back to diving south. */
function batStepE(g: Uint8Array, m: number): void {
    if (moveMonsterE(g, m) === 0) {
        batDiveEnd(g, m);
    } else {
        s8(g, m + 5, g8(g, m + 5) | 0x80); // facing right
    }
}

/** loc_A344: try west; if blocked, fall back to diving south. */
function batStepW(g: Uint8Array, m: number): void {
    if (moveMonsterW(g, m) === 0) {
        batDiveEnd(g, m);
    } else {
        s8(g, m + 5, g8(g, m + 5) & 0x7f); // facing left
    }
}

/** ai_state == 0x80: diving toward the hero. */
function batAiState80(g: Uint8Array, m: number): void {
    batStepThrottle(g, m);

    if (g8(g, HERO_DAMAGE_THIS_FRAME) !== 0) {
        s8(g, m + 9, 0xc0); // .ai_state
        return;
    }

    let al = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    al = (al + 21) & 0x3f;

    if (al < 18) {
        // loc_A350
        const rel = g8(g, m + 3);
        if (rel === 17 || rel === 16) { batDiveEnd(g, m); return; }
        if (rel < 16) {
            if (moveMonsterNE(g, m) === 0) { batStepE(g, m); return; }
            s8(g, m + 5, g8(g, m + 5) | 0x80);
        } else { // m_x_rel > 17
            if (moveMonsterNW(g, m) === 0) { batStepW(g, m); return; }
            s8(g, m + 5, g8(g, m + 5) & 0x7f);
        }
        return;
    }

    if (al < 24) {
        // loc_A32A
        const rel = g8(g, m + 3);
        if (rel === 17 || rel === 16) { batDiveEnd(g, m); return; }
        if (rel < 16) batStepE(g, m);
        else batStepW(g, m);
        return;
    }

    // al >= 24: try SE/SW diagonal first
    const rel = g8(g, m + 3);
    if (rel === 17 || rel === 16) { batDiveEnd(g, m); return; }
    if (rel < 16) {
        if (moveMonsterSE(g, m) === 0) { batStepE(g, m); return; }
        s8(g, m + 5, g8(g, m + 5) | 0x80);
    } else {
        if (moveMonsterSW(g, m) === 0) { batStepW(g, m); return; }
        s8(g, m + 5, g8(g, m + 5) & 0x7f);
    }
}

/** ai_state == 0xC0: climbing back up. */
function batAiStateC0(g: Uint8Array, m: number): void {
    if ((g8(g, m + 9) & 0x20) !== 0) { // .ai_state
        // loc_A3BD
        s8(g, m + 6, (g8(g, m + 6) - 1) & 7); // .anim_counter
        if (g8(g, m + 6) === 0) {
            s8(g, m + 6, 0x70);
            s8(g, m + 9, 0);
        }
        return;
    }

    batStepThrottle(g, m);

    let blockedDiag: boolean;
    if ((g8(g, m + 5) & 0x80) !== 0) { // .ai_flags
        blockedDiag = moveMonsterNE(g, m) === 0;
        if (blockedDiag) s8(g, m + 5, g8(g, m + 5) & 0x7f);
    } else {
        blockedDiag = moveMonsterNW(g, m) === 0;
        if (blockedDiag) s8(g, m + 5, g8(g, m + 5) | 0x80);
    }

    if (!blockedDiag) return;

    // loc_A3AC
    if (moveMonsterN(g, m) === 0) {
        s8(g, m + 9, g8(g, m + 9) | 0x20); // .ai_state
        s8(g, m + 6, 2); // .anim_counter
    }
}

// ─── Slug ───

function slugAi(g: Uint8Array, m: number): void {
    if (checkMonsterOnAggressiveGround(g, m) === 0) {
        checkVerticalDistanceBetweenHeroAndMonster(g, m);
        return;
    }
    if (g8(g, m + 8) === 0) s8(g, m + 8, 2); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags
        heroHitsMonster(g, m);
        return;
    }

    if (moveMonsterS(g, m) !== 0) return; // free falling

    s8(g, m + 6, (g8(g, m + 6) + 0x41) & 0xc3); // .anim_counter
    if ((g8(g, m + 6) & 0xf0) !== 0) return;

    if (g8(g, m + 3) < 17) { // .m_x_rel
        if (moveMonsterE(g, m) === 0) return;
        s8(g, m + 5, g8(g, m + 5) | 0x80); // faced right
    } else {
        if (moveMonsterW(g, m) === 0) return;
        s8(g, m + 5, g8(g, m + 5) & 0x7f); // faced left
    }
}

// ─── Frog ───

/** One frame of an already-started jump (loc_A4A2..loc_A4DB). */
function frogJumpStep(g: Uint8Array, m: number): void {
    const ah = g8(g, m + 6); // .anim_counter
    const al = (ah + 1) & 7;

    if (al < 7) {
        s8(g, m + 6, al | (ah & 0xf0));

        const angleTable = (g8(g, m + 5) & 0x80) !== 0 ? JUMP_ANGLES_RIGHT : JUMP_ANGLES_LEFT;
        const angle = angleTable[(ah - 2) & 0xff] ?? 0;

        if (monsterMoveInDirection(g, m, angle) !== 0) {
            return; // moved fine, jump continues next frame
        }

        // blocked mid-jump: maybe reverse direction
        const pr = frogRatToHeroProximityAndDirection(g, m, 8);
        if (!pr.carry) {
            s8(g, m + 5, g8(g, m + 5) ^ 0x80); // .ai_flags
        }
        // fall through: jump animation is finished
    }

    // loc_A4DB: end of jump
    s8(g, m + 9, g8(g, m + 9) & 0xf7); // .ai_state
    s8(g, m + 6, 0); // .anim_counter
    moveMonsterS(g, m);
}

function frogAi(g: Uint8Array, m: number): void {
    if (checkMonsterOnAggressiveGround(g, m) === 0) {
        checkVerticalDistanceBetweenHeroAndMonster(g, m);
        return;
    }

    if (g8(g, m + 8) === 0) s8(g, m + 8, 1); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags
        heroHitsMonster(g, m);
        return;
    }

    if ((g8(g, m + 9) & 0x08) !== 0) { // already mid-jump
        frogJumpStep(g, m);
        return;
    }

    s8(g, m + 6, (g8(g, m + 6) + 0x21) & 0xe1); // .anim_counter
    if (moveMonsterS(g, m) !== 0) return;

    // Blocked moving south: decide whether to start a jump.
    let startJump = false;

    let pr = frogRatToHeroProximityAndDirection(g, m, 8);
    if (pr.carry) {
        startJump = true;
    } else if ((g8(g, m + 6) & 0xe0) === 0) {
        pr = frogRatToHeroProximityAndDirection(g, m, 8);
        if (pr.value === 0xff) {
            startJump = true;
        } else {
            s8(g, m + 5, (g8(g, m + 5) & 0x7f) | pr.value); // .ai_flags
            s8(g, m + 6, 2); // .anim_counter
            s8(g, m + 9, g8(g, m + 9) | 0x08); // .ai_state
        }
    }
    // else: anim_counter still busy, do nothing this frame

    if (startJump) {
        s8(g, m + 6, 2); // .anim_counter
        s8(g, m + 9, g8(g, m + 9) | 0x08); // .ai_state
        frogJumpStep(g, m);
    }
}

// ─── Rat ───

function ratAi(g: Uint8Array, m: number): void {
    if (checkMonsterOnAggressiveGround(g, m) === 0) {
        checkVerticalDistanceBetweenHeroAndMonster(g, m);
        return;
    }

    if (g8(g, m + 8) === 0) s8(g, m + 8, 1); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags
        heroHitsMonster(g, m);
        return;
    }

    if ((g8(g, m + 9) & 0x08) !== 0) { ratAiJumpStep(g, m); return; }
    if ((g8(g, m + 9) & 0x10) !== 0) { ratAiHopStep(g, m); return; }

    if (moveMonsterS(g, m) !== 0) return;

    if ((g8(g, m + 9) & 0x04) === 0) {
        // wandering branch (loc_A5C5)

        let addr = coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2));
        let lookahead = 36 * 2;
        if ((g8(g, m + 5) & 0x80) !== 0) lookahead++;
        addr = (addr + lookahead) & 0xffff;

        addr = wrapMapFromAbove(addr);
        const tile = g8(g, addr);

        if (isBlocking(g, tile) === 0) { // pit ahead
            s8(g, m + 6, 0); // .anim_counter
            s8(g, m + 9, g8(g, m + 9) | 0x08); // .ai_state
            return;
        }

        // loc_A5F4: solid ground ahead
        s8(g, m + 6, (g8(g, m + 6) + 1) & 3); // .anim_counter

        if ((g8(g, m + 9) & 0x02) === 0) { // .ai_state
            const oldTimer = g8(g, m + 10); // .ai_timer
            s8(g, m + 10, (oldTimer + 0x10) & 0xff);
            if (oldTimer >= 0xf0) {
                s8(g, m + 9, g8(g, m + 9) | 0x04); // .ai_state
                return;
            }
            // falls through to loc_A60C below
        }

        // loc_A60C
        const pr = frogRatToHeroProximityAndDirection(g, m, 6);
        if (pr.carry) {
            s8(g, m + 5, g8(g, m + 5) & 0xfd); // .ai_flags
            s8(g, m + 10, 0); // .ai_timer
        }

        if ((g8(g, m + 5) & 0x80) !== 0) { // .ai_flags
            if (moveMonsterE(g, m) === 0) {
                s8(g, m + 6, 0);
                s8(g, m + 9, (g8(g, m + 9) | 0x10) & 0x1f);
            }
        } else {
            if (moveMonsterW(g, m) === 0) {
                s8(g, m + 6, 0);
                s8(g, m + 9, (g8(g, m + 9) | 0x10) & 0x1f);
            }
        }
        return;
    }

    // chasing branch

    s8(g, m + 6, (g8(g, m + 6) & 0xf1) | 0x04); // .anim_counter

    const pr = frogRatToHeroProximityAndDirection(g, m, 6);
    if (pr.value !== 0xff) {
        s8(g, m + 5, (g8(g, m + 5) & 0x7f) | pr.value); // face hero
        s8(g, m + 6, 0);
        s8(g, m + 9, (g8(g, m + 9) | 0x02) & 0xfb);
        return;
    }

    // loc_A57B
    const oldAnim = g8(g, m + 6);
    s8(g, m + 6, (oldAnim + 0x40) & 0xff);
    if (oldAnim < 0xc0) return; // carry clear -> stop

    // loc_A582
    const v = (((g8(g, m + 6) + 1) & 1) + 4) & 0xff;
    s8(g, m + 6, v);

    const oldState = g8(g, m + 9);
    s8(g, m + 9, (oldState + 0x40) & 0xff);
    if (oldState < 0xc0) return; // carry clear -> stop

    // loc_A595: pick a new random direction
    s8(g, m + 9, g8(g, m + 9) & 0xfb); // .ai_state
    s8(g, m + 5, g8(g, m + 5) & 0x7f); // .ai_flags

    const r = getRandom(g) & 0x80;
    s8(g, m + 5, g8(g, m + 5) | r); // .ai_flags
    if (r !== 0) {
        if (checkCollisionE2(g, m) !== 0) {
            s8(g, m + 5, g8(g, m + 5) & 0x7f);
        }
    } else {
        if (checkCollisionW2(g, m) !== 0) {
            s8(g, m + 5, g8(g, m + 5) | 0x80);
        }
    }
}

/** loc_A649: per-frame step while ai_state bit 0x08 ("jumping") is set. */
function ratAiJumpStep(g: Uint8Array, m: number): void {
    const ah = g8(g, m + 6); // .anim_counter
    const al = (ah + 1) & 3;

    if (al === 0) {
        // loc_A683: jump finished
        s8(g, m + 9, g8(g, m + 9) & 0xf7); // .ai_state
        s8(g, m + 6, 3); // .anim_counter
        moveMonsterS(g, m);
        return;
    }

    s8(g, m + 6, (ah & 0xf0) | al); // .anim_counter

    const angleTable = (g8(g, m + 5) & 0x80) !== 0 ? JUMP_ANGLES_RIGHT : JUMP_ANGLES_LEFT;
    const angle = angleTable[g8(g, m + 6)] ?? 0;

    if (checkCollisionInDirection(g, m, angle) !== 0) {
        s8(g, m + 9, (g8(g, m + 9) & 0xf7) | 0x04);
        return;
    }
    monsterMoveInDirection(g, m, angle);
}

/** loc_A690: per-frame step while ai_state bit 0x10 ("hopping") is set. */
function ratAiHopStep(g: Uint8Array, m: number): void {
    s8(g, m + 9, (g8(g, m + 9) + 0x20) & 0xff); // .ai_state

    if ((g8(g, m + 9) & 0x20) === 0) { // .ai_state
        const ah = g8(g, m + 6); // .anim_counter
        const al = (ah + 1) & 3;

        if (al === 0) {
            // loc_A6E3: hop finished
            s8(g, m + 9, g8(g, m + 9) & 0xef); // .ai_state
            s8(g, m + 6, 3); // .anim_counter
            moveMonsterS(g, m);
            return;
        }
        s8(g, m + 6, (ah & 0xf0) | al); // .anim_counter
    }

    // loc_A6AD
    let idx = rol8(g8(g, m + 9), 3); // .ai_state
    idx = (idx - 1) & 7;

    const angleTable = (g8(g, m + 5) & 0x80) !== 0 ? RAT_JUMP_ANGLES_RIGHT : RAT_JUMP_ANGLES_LEFT;
    const angle = angleTable[idx] ?? 0;

    if (monsterMoveInDirection(g, m, angle) === 0) { // blocked: loc_A6CF
        s8(g, m + 9, (g8(g, m + 9) & 0xef) | 0x04); // .ai_state
        if (g8(g, m + 6) !== 0) s8(g, m + 6, 3); // .anim_counter
    }
}

/** Shared Frog/Rat helper (eai1.c:591). */
function frogRatToHeroProximityAndDirection(
    g: Uint8Array,
    m: number,
    distance: number,
): ProximityResult {
    const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    const absDy = (dy & 0x80) !== 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= distance) {
        return { value: 0xff, carry: false }; // too far vertically
    }

    if (g8(g, m + 3) < 17) { // .m_x_rel — monster left of hero
        const carry = (g8(g, m + 5) & 0x80) !== 0; // carry if facing right
        return { value: 0x80, carry };
    } else {
        const carry = (g8(g, m + 5) & 0x80) === 0; // carry if facing left
        return { value: 0x00, carry };
    }
}
