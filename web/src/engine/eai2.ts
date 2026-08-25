/**
 * eai2.ts — TS port of src/eai2.c (Stage 9c): monster AI for six types,
 * selected by `flags & 0x0F`: 0=Boarman-top (drives its passive bottom
 * twin at m+0x10), 1=Boarman-bottom (no-op), 2=Blue Slime, 3=Red Toad,
 * 4/5=Green/Magic Bat (same AI as eai1's bat, hp=3).
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
    moveMonsterNE,
    moveMonsterNW,
    moveMonsterS,
    moveMonsterSE,
    moveMonsterSW,
    moveMonsterW,
    monsterMoveInDirection,
} from './dungeon-entities.js';
import { checkMonsterOnAggressiveGround } from './dungeon-monsters.js';
import {
    checkVerticalDistanceBetweenHeroAndMonster,
    getRandom,
    heroHitsMonster,
} from './dungeon-combat.js';
import { addProjectileToArray } from './dungeon-projectiles.js';

// g_mem addresses
const HERO_Y = 0xff35;
const HERO_DAMAGE_THIS_FRAME = 0xff36;
const MAP_WIDTH = 0xc002; // word
const ADDR_TRAJECTORIES = 0xa531;

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

/** Red Toad jump angles (same tables as the Frog in eai1). */
const TOAD_JUMP_ANGLES_RIGHT = [1, 0, 0, 7];
const TOAD_JUMP_ANGLES_LEFT = [3, 4, 4, 5];

/** Monster_AI_2 (eai2.c:104). */
export function monsterAi2(g: Uint8Array, m: number): void {
    switch (g8(g, m + 4) & 0x0f) {
        case 0: boarmanTopAi(g, m); return;
        case 1: boarmanBottomAi(g, m); return;
        case 2: blueSlimeAi(g, m); return;
        case 3: redToadAi(g, m); return;
        case 4:
        case 5: batAi(g, m); return;
        default: return; // 6-entry jump table by design
    }
}

// ─── Boarman ───

/** Boarman-bottom: purely passive — driven via the twin writes. */
function boarmanBottomAi(_g: Uint8Array, _m: number): void {
    return;
}

function boarmanTopAi(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 8); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0 || (g8(g, m + 0x15) & 0x40) !== 0) {
        boarmanHitReaction(g, m);
        return;
    }

    if (boarmanTryFall(g, m) === 0) return; // fell one row this frame

    if ((g8(g, m + 9) & 1) !== 0) { // charging up to attack
        s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
        if (g8(g, m + 6) === 6) {
            boarmanFireSpears(g, m);
        } else if (g8(g, m + 6) === 8) {
            s8(g, m + 9, g8(g, m + 9) & 0xfc);
            s8(g, m + 6, 0);
        }
        boarmanEndOfFrameSync(g, m);
        return;
    }

    const pr = monsterToHeroProximityAndDirection(g, m);
    if (!pr.carry) {
        if (pr.value !== 0xff) {
            s8(g, m + 5, g8(g, m + 5) ^ 0x80); // face the hero
        }
        boarmanPatrolStep(g, m);
    } else {
        boarmanAlignToAttackPosition(g, m);
    }
}

/** sub_A653: returns 1 when grounded (walk/attack logic), 0 when it fell. */
function boarmanTryFall(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) === 0) return 1; // left edge
    if (g8(g, m + 3) === 0x23) return 1; // right edge

    if (checkLedgeBelow(g, m) !== 0) return 1;

    s8(g, m + 2, (g8(g, m + 2) + 1) & 0x3f); // .currY++
    s8(g, m + 0x12, (g8(g, m + 0x12) + 1) & 0x3f); // twin.currY++
    return 0;
}

/** sub_A679: blocking tile 4 rows below (2 columns)? */
function checkLedgeBelow(g: Uint8Array, m: number): number {
    let addr = coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2));
    addr += 0x90; // 4 rows down
    addr = wrapMapFromAbove(addr);

    for (let col = 0; col < 2; col++) {
        if (isBlocking(g, g8(g, addr + col)) !== 0) return 1;
    }
    const combined = (g8(g, addr) | g8(g, addr + 1)) & 0xff;
    return (combined & 0x80) !== 0 ? 1 : 0;
}

/** sub_A549: step east, mirroring X into the twin. 1 = blocked. */
function moveEastAndSyncTwin(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) >= 0x22) return 1;

    if (checkWallAheadE(g, m) !== 0) return 1;

    let newX = (g16(g, m) + 1) & 0xffff;
    if (newX === g16(g, MAP_WIDTH)) newX = 0;
    s16(g, m, newX);
    s16(g, m + 0x10, newX);
    s8(g, m + 3, (g8(g, m + 3) + 1) & 0xff);
    s8(g, m + 0x13, (g8(g, m + 0x13) + 1) & 0xff);
    return 0;
}

/** sub_A56F: wall 4 rows down / 2 columns right of the Boarman? */
function checkWallAheadE(g: Uint8Array, m: number): number {
    let addr = (coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2)) + 2) & 0xffff;

    for (let i = 0; i < 4; i++) {
        if (isBlocking(g, g8(g, addr)) !== 0) return 1;
        addr += 0x24; // one row down
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

/** sub_A5CE: step west, mirroring X into the twin. 1 = blocked. */
function moveWestAndSyncTwin(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) < 2) return 1;

    if (checkWallAheadW(g, m) !== 0) return 1;

    let newX = (g16(g, m) - 1) & 0xffff;
    if (newX === 0xffff) newX = (g16(g, MAP_WIDTH) - 1) & 0xffff;
    s16(g, m, newX);
    s16(g, m + 0x10, newX);
    s8(g, m + 3, (g8(g, m + 3) - 1) & 0xff);
    s8(g, m + 0x13, (g8(g, m + 0x13) - 1) & 0xff);
    return 0;
}

/** sub_A5F4: mirror of check_wall_ahead_E looking 1 column left. */
function checkWallAheadW(g: Uint8Array, m: number): number {
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

/** loc_A6AB: either half hit → propagate flags, then the common handler. */
function boarmanHitReaction(g: Uint8Array, m: number): void {
    const al = ((g8(g, m + 0x15) & 0xbf) | 0x20) & 0xff;
    s8(g, m + 5, al);
    s8(g, m + 0x15, (al | 0x60) & 0xff);
    heroHitsMonster(g, m);
}

/** loc_A6BF: mirror anim_counter + facing bit into the twin. */
function boarmanEndOfFrameSync(g: Uint8Array, m: number): void {
    s8(g, m + 0x16, g8(g, m + 6)); // twin.anim_counter
    const facing = g8(g, m + 5) & 0x80;
    s8(g, m + 0x15, (facing | (g8(g, m + 0x15) & 0x7f)) & 0xff);
}

/** loc_A3BC..: throttled east/west patrol step. */
function boarmanPatrolStep(g: Uint8Array, m: number): void {
    const sum = g8(g, m + 6) + 0x80;
    s8(g, m + 6, sum & 0xff);
    if (sum < 0x100) { // no overflow: throttle only this frame
        boarmanEndOfFrameSync(g, m);
        return;
    }

    s8(g, m + 6, (g8(g, m + 6) + 1) & 3); // .anim_counter

    if ((g8(g, m + 5) & 0x80) === 0) { // facing left
        if (moveWestAndSyncTwin(g, m) !== 0) {
            s8(g, m + 5, g8(g, m + 5) | 0x80); // flip to face right
        }
    } else {
        if (moveEastAndSyncTwin(g, m) !== 0) {
            s8(g, m + 5, g8(g, m + 5) & 0x7f); // flip to face left
        }
    }
    boarmanEndOfFrameSync(g, m);
}

// Random per-frame standoff thresholds (byte_A6D6/A6D7) — file-scope
// statics shared by all Boarmans, exactly as in the original.
let boarmanAlignGapRight = 8;
let boarmanAlignGapLeft = 8;

/** loc_A3F0..: walk toward/away from the anchor column (0x11). */
function boarmanAlignToAttackPosition(g: Uint8Array, m: number): void {
    s8(g, m + 5, g8(g, m + 5) & 0x7f); // tentatively face left

    if (g8(g, m + 3) <= 0x11) {
        s8(g, m + 5, g8(g, m + 5) | 0x80); // face right towards the anchor
    }

    if ((g8(g, m + 5) & 0x80) !== 0) {
        // facing right: m_x_rel <= 0x11
        const gap = (0x11 - g8(g, m + 3)) & 0xff;
        if (gap === boarmanAlignGapRight) {
            boarmanRerollAndMaybeCharge(g, m);
            return;
        }
        if (gap < boarmanAlignGapRight) {
            if (moveWestAndSyncTwin(g, m) !== 0) { // back off west
                boarmanRandomFlinch(g, m);
                return;
            }
            s8(g, m + 6, (g8(g, m + 6) - 1) & 3);
            boarmanEndOfFrameSync(g, m);
            return;
        }
        if (moveEastAndSyncTwin(g, m) !== 0) { // approach east
            boarmanRerollAndMaybeCharge(g, m);
            return;
        }
        s8(g, m + 6, (g8(g, m + 6) + 1) & 3);
        boarmanEndOfFrameSync(g, m);
        return;
    }

    // facing left: m_x_rel > 0x11
    const gap = (g8(g, m + 3) - 0x11) & 0xff;
    if (gap === boarmanAlignGapLeft) {
        boarmanRerollAndMaybeCharge(g, m);
        return;
    }
    if (gap < boarmanAlignGapLeft) {
        if (moveEastAndSyncTwin(g, m) !== 0) { // back off east
            boarmanRandomFlinch(g, m);
            return;
        }
        s8(g, m + 6, (g8(g, m + 6) - 1) & 3);
        boarmanEndOfFrameSync(g, m);
        return;
    }
    if (moveWestAndSyncTwin(g, m) !== 0) { // approach west
        boarmanRandomFlinch(g, m);
        return;
    }
    s8(g, m + 6, (g8(g, m + 6) + 1) & 3);
    boarmanEndOfFrameSync(g, m);
}

/** loc_A459: re-roll standoff thresholds; charge when aligned. */
function boarmanRerollAndMaybeCharge(g: Uint8Array, m: number): void {
    boarmanAlignGapRight = (((getRandom(g) & 3) - 1) + 8) & 0xff;
    boarmanAlignGapLeft = (((getRandom(g) & 3) - 2) + 9) & 0xff;

    const pr = monsterToHeroProximityAndDirection(g, m);
    if (pr.carry) {
        s8(g, m + 9, g8(g, m + 9) | 1); // begin charge
        s8(g, m + 6, 4);
    }
    boarmanEndOfFrameSync(g, m);
}

/** loc_A488: blocked while positioning — 50% flinch, else charge anyway. */
function boarmanRandomFlinch(g: Uint8Array, m: number): void {
    if ((getRandom(g) & 1) !== 0) return;
    s8(g, m + 9, g8(g, m + 9) | 3); // .ai_state
    s8(g, m + 6, 4);
    boarmanEndOfFrameSync(g, m);
}

// Projectile templates (file statics; bytes 0-1 patched per shot).
const spearRight = [0, 0, 0, 0, 0xff, 0x40, 8, 0, 0, 0, 0, 0, 0]; // byte_A4FD
const spearLeft = [0, 0, 0, 0, 0xff, 0x40, 8, 0, 0, 0, 0, 0, 0]; // byte_A50A
const spearSimpleRight = [0, 0, 0, 0, 7, 0, 0x14, 0, 0, 0, 0, 0, 0]; // byte_A517
const spearSimpleLeft = [0, 0, 0, 0, 7, 4, 0x14, 0, 0, 0, 0, 0, 0]; // byte_A524

/** loc_A4BA: fire the Boarman's paired spears (one per half). */
function boarmanFireSpears(g: Uint8Array, m: number): void {
    const x = g8(g, m + 3); // .m_x_rel
    const y = (g8(g, m + 2) + 2) & 0xff; // .currY + 2

    spearLeft[0] = x;
    spearLeft[1] = y;
    spearRight[0] = (x + 1) & 0xff;
    spearRight[1] = y;
    spearRight[9] = ADDR_TRAJECTORIES & 0xff;
    spearRight[10] = (ADDR_TRAJECTORIES >> 8) & 0xff;
    spearLeft[9] = (ADDR_TRAJECTORIES + 12) & 0xff;
    spearLeft[10] = ((ADDR_TRAJECTORIES + 12) >> 8) & 0xff;

    spearSimpleLeft[0] = x;
    spearSimpleLeft[1] = y;
    spearSimpleRight[0] = (x + 1) & 0xff;
    spearSimpleRight[1] = y;

    let bx = spearRight;
    if ((g8(g, m + 5) & 0x80) === 0) bx = spearLeft; // facing left
    if ((g8(g, m + 9) & 2) !== 0) bx = bx === spearRight ? spearSimpleRight : spearSimpleLeft;
    addProjectileToArray(g, bx);
}

/** sub_A8F4: shared by Boarman and Red Toad (fixed 5-row check). */
function monsterToHeroProximityAndDirection(g: Uint8Array, m: number): ProxResult {
    const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    const absDy = (dy & 0x80) !== 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= 5) return { value: 0xff, carry: false };

    if (g8(g, m + 3) < 0x11) {
        return { value: 0x80, carry: (g8(g, m + 5) & 0x80) !== 0 };
    } else {
        return { value: 0x00, carry: (g8(g, m + 5) & 0x80) === 0 };
    }
}
// Blue Slime

function blueSlimeAi(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 4); // .hp
    if ((g8(g, m + 5) & 0x20) !== 0) {
        heroHitsMonster(g, m);
        return;
    }
    if (moveMonsterS(g, m) !== 0) return; // still falling

    if ((g8(g, m + 9) & 1) === 0) { // waiting to start a hop
        s8(g, m + 6, (g8(g, m + 6) + 1) & 7); // .anim_counter
        if (g8(g, m + 6) !== 0) return;
        s8(g, m + 9, g8(g, m + 9) | 1);
        s8(g, m + 9, g8(g, m + 9) & 0xfd);
        s8(g, m + 10, 0); // .ai_timer
        return;
    }

    if ((g8(g, m + 9) & 2) === 0) { // hop windup
        s8(g, m + 6, ((g8(g, m + 10) & 3) + 8) & 0xff);
        s8(g, m + 10, (g8(g, m + 10) + 1) & 0xff); // .ai_timer
        if (g8(g, m + 10) !== 8) return;
        s8(g, m + 9, g8(g, m + 9) | 2);
        slimeHopDirection(g, m);
        return;
    }

    // mid-hop
    s8(g, m + 6, ((g8(g, m + 10) & 3) + 8) & 0xff);
    s8(g, m + 10, (g8(g, m + 10) + 1) & 0xff);
    if (g8(g, m + 10) === 0x0c) {
        s8(g, m + 9, g8(g, m + 9) & 0xfe); // hop finished
        s8(g, m + 6, 0);
    }
}

// loc_A72C/loc_A760: pick a side based on a tile ~2 columns ahead.
function slimeHopDirection(g: Uint8Array, m: number): void {
    const r = getRandom(g);
    const rSigned = (r << 24) >> 24; // int8_t
    let addr = coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2));

    if (rSigned < 0) {
        addr += 0x47;
        addr = wrapMapFromAbove(addr);
        if (isBlocking(g, g8(g, addr)) !== 0) moveMonsterW(g, m);
        else moveMonsterE(g, m);
    } else {
        addr += 0x4a;
        addr = wrapMapFromAbove(addr);
        if (isBlocking(g, g8(g, addr)) !== 0) moveMonsterE(g, m);
        else moveMonsterW(g, m);
    }
}
// Red Toad

function redToadAi(g: Uint8Array, m: number): void {
    if (checkMonsterOnAggressiveGround(g, m) === 0) {
        checkVerticalDistanceBetweenHeroAndMonster(g, m);
        return;
    }
    if (g8(g, m + 8) === 0) s8(g, m + 8, 2); // .hp
    if ((g8(g, m + 5) & 0x20) !== 0) {
        heroHitsMonster(g, m);
        return;
    }
    if ((g8(g, m + 9) & 2) !== 0) { toadPostShotRecover(g, m); return; }
    if ((g8(g, m + 9) & 4) !== 0) { toadWindupAndShoot(g, m); return; }
    if ((g8(g, m + 9) & 8) !== 0) { toadJumpStep(g, m); return; }
    s8(g, m + 6, (g8(g, m + 6) + 0x21) & 0xe1); // .anim_counter
    if (moveMonsterS(g, m) !== 0) return;
    toadGrounded(g, m); // loc_A7ED
}

// loc_A7ED: react to hero proximity while grounded.
function toadGrounded(g: Uint8Array, m: number): void {
    let pr = monsterToHeroProximityAndDirection(g, m);
    if (pr.carry) {
        toadMaybeStartWindup(g, m);
        return;
    }
    if ((g8(g, m + 6) & 0xe0) !== 0) return; // still busy animating

    pr = monsterToHeroProximityAndDirection(g, m);
    if (pr.value === 0xff) {
        toadMaybeStartWindup(g, m);
        return;
    }
    s8(g, m + 5, (g8(g, m + 5) & 0x7f) | pr.value); // face the hero
    s8(g, m + 6, 2);
    s8(g, m + 9, g8(g, m + 9) | 8); // begin a jump
}

// loc_A811: 50% jump now, else wind up for a shot.
function toadMaybeStartWindup(g: Uint8Array, m: number): void {
    if ((getRandom(g) & 1) !== 0) {
        s8(g, m + 6, 2);
        s8(g, m + 9, g8(g, m + 9) | 8);
        toadJumpStep(g, m); // original falls through into the jump step
        return;
    }
    s8(g, m + 9, g8(g, m + 9) | 4); // begin windup-to-shoot
    s8(g, m + 10, 0);
}

// loc_A82B: per-frame step of an in-progress jump.
function toadJumpStep(g: Uint8Array, m: number): void {
    const ah = g8(g, m + 6); // old value
    const al = (ah + 1) & 7;

    if (al >= 7) {
        toadEndJump(g, m); // loc_A864
        return;
    }

    s8(g, m + 6, al | (ah & 0xf0));

    const angleTable = (g8(g, m + 5) & 0x80) !== 0 ? TOAD_JUMP_ANGLES_RIGHT : TOAD_JUMP_ANGLES_LEFT;
    const angle = angleTable[(ah - 2) & 0xff] ?? 0;

    if (monsterMoveInDirection(g, m, angle) !== 0) {
        return; // moved fine, jump continues next frame
    }

    // blocked mid-jump: maybe reverse direction, then land
    const pr = monsterToHeroProximityAndDirection(g, m);
    if (!pr.carry) {
        s8(g, m + 5, g8(g, m + 5) ^ 0x80);
    }
    toadEndJump(g, m);
}

// loc_A864: end the jump and fall back down.
function toadEndJump(g: Uint8Array, m: number): void {
    s8(g, m + 9, g8(g, m + 9) & 0xf7);
    s8(g, m + 6, 0);
    moveMonsterS(g, m);
}

// Fire-shot templates (bytes 0-1 patched per shot).
const toadShotDescRight = [0, 0, 1, 0, 6, 0, 20, 0, 0, 0, 0, 0, 0]; // byte_A8D2
const toadShotDescLeft = [0, 0, 1, 0, 6, 4, 20, 0, 0, 0, 0, 0, 0]; // byte_A8DF

// loc_A871: windup timer before spitting the fire shot.
function toadWindupAndShoot(g: Uint8Array, m: number): void {
    s8(g, m + 10, (g8(g, m + 10) + 1) & 0xff); // .ai_timer
    s8(g, m + 6, (g8(g, m + 6) + 1) & 1); // .anim_counter
    if (g8(g, m + 10) !== 4) return;

    s8(g, m + 6, 7);

    const y = (g8(g, m + 2) + 1) & 0x3f; // .currY + 1
    toadShotDescLeft[0] = g8(g, m + 3); // .m_x_rel
    toadShotDescLeft[1] = y;
    toadShotDescRight[0] = (g8(g, m + 3) + 1) & 0xff; // right side of body
    toadShotDescRight[1] = y;

    const desc = (g8(g, m + 5) & 0x80) !== 0 ? toadShotDescRight : toadShotDescLeft;
    addProjectileToArray(g, desc);

    s8(g, m + 9, g8(g, m + 9) & 0xfb); // clear windup bit
    s8(g, m + 9, g8(g, m + 9) | 2); // enter recovery
    s8(g, m + 10, 0);
}

// loc_A8BC: recovery pause after firing.
function toadPostShotRecover(g: Uint8Array, m: number): void {
    s8(g, m + 10, (g8(g, m + 10) + 1) & 0xff); // .ai_timer
    s8(g, m + 6, (g8(g, m + 6) + 1) & 1); // .anim_counter
    if (g8(g, m + 10) === 6) {
        s8(g, m + 9, g8(g, m + 9) & 0xfd); // recovery finished
    }
}
// Bat (Green/Magic Bat share this AI; identical logic to eai1's bat, hp=3)

function batAi(g: Uint8Array, m: number): void {
    if (checkMonsterOnAggressiveGround(g, m) === 0) {
        checkVerticalDistanceBetweenHeroAndMonster(g, m);
        return;
    }
    if (g8(g, m + 8) === 0) s8(g, m + 8, 3); // .hp
    if ((g8(g, m + 5) & 0x20) !== 0) {
        heroHitsMonster(g, m);
        return;
    }
    switch ((g8(g, m + 9) >> 6) & 3) { // .ai_state (top 2 bits)
        case 0: batState0(g, m); break;
        case 1: batState1(g, m); break;
        case 2: batState2(g, m); break;
        case 3: batState3(g, m); break;
    }
}

function batStepThrottle(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 7); // .anim_counter
    if (g8(g, m + 6) === 7) s8(g, m + 6, 3);
}

// ai_state top bits == 0: flying up, looking for a dive spot.
function batState0(g: Uint8Array, m: number): void {
    moveMonsterN(g, m); // return value unused

    if (g8(g, m + 6) !== 0) { // .anim_counter
        s8(g, m + 6, (g8(g, m + 6) - 0x10) & 0xff);
        return;
    }

    let al = (g8(g, m + 3) - 0x11) & 0xff; // .m_x_rel
    if (al >= 0x0a) {
        al = (0x11 - g8(g, m + 3)) & 0xff;
        if (al >= 7) {
            s8(g, m + 6, 0);
            return;
        }
    }
    s8(g, m + 9, 0x40); // .ai_state
    s8(g, m + 6, 0);
}

// ai_state top bits == 1: short pause before diving.
function batState1(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 7);
    if (g8(g, m + 6) === 3) s8(g, m + 9, 0x80); // .ai_state
}

// loc_AA2F: dive south; blocked -> climb-up state.
function batDiveEnd(g: Uint8Array, m: number): void {
    if (moveMonsterS(g, m) === 0) s8(g, m + 9, 0xc0); // .ai_state
}

// loc_A9F1: try east; blocked -> dive south.
function batStepE(g: Uint8Array, m: number): void {
    if (moveMonsterE(g, m) === 0) {
        batDiveEnd(g, m);
    } else {
        s8(g, m + 5, g8(g, m + 5) | 0x80); // facing right
    }
}

// loc_A9FD: try west; blocked -> dive south.
function batStepW(g: Uint8Array, m: number): void {
    if (moveMonsterW(g, m) === 0) {
        batDiveEnd(g, m);
    } else {
        s8(g, m + 5, g8(g, m + 5) & 0x7f); // facing left
    }
}

// ai_state top bits == 2: diving toward the hero.
function batState2(g: Uint8Array, m: number): void {
    batStepThrottle(g, m);

    if (g8(g, HERO_DAMAGE_THIS_FRAME) !== 0) {
        s8(g, m + 9, 0xc0); // .ai_state
        return;
    }

    let al = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    al = (al + 0x15) & 0x3f;

    const rel = g8(g, m + 3);

    if (al < 0x12) {
        if (rel === 0x11 || rel === 0x10) { batDiveEnd(g, m); return; }
        if (rel < 0x10) {
            if (moveMonsterNE(g, m) === 0) { batStepE(g, m); return; }
            s8(g, m + 5, g8(g, m + 5) | 0x80);
        } else {
            if (moveMonsterNW(g, m) === 0) { batStepW(g, m); return; }
            s8(g, m + 5, g8(g, m + 5) & 0x7f);
        }
        return;
    }

    if (al < 0x18) {
        if (rel === 0x11 || rel === 0x10) { batDiveEnd(g, m); return; }
        if (rel < 0x10) batStepE(g, m);
        else batStepW(g, m);
        return;
    }

    // al >= 0x18: SE/SW diagonal first
    if (rel === 0x11 || rel === 0x10) { batDiveEnd(g, m); return; }
    if (rel < 0x10) {
        if (moveMonsterSE(g, m) === 0) { batStepE(g, m); return; }
        s8(g, m + 5, g8(g, m + 5) | 0x80);
    } else {
        if (moveMonsterSW(g, m) === 0) { batStepW(g, m); return; }
        s8(g, m + 5, g8(g, m + 5) & 0x7f);
    }
}

// ai_state top bits == 3: climbing back up.
function batState3(g: Uint8Array, m: number): void {
    if ((g8(g, m + 9) & 0x20) !== 0) { // .ai_state
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

    if (moveMonsterN(g, m) === 0) {
        s8(g, m + 9, g8(g, m + 9) | 0x20); // .ai_state
        s8(g, m + 6, 2); // .anim_counter
    }
}
