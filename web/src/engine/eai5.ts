/**
 * eai5.ts — TS port of src/eai5.c (Stage 9d): monster AI for five types,
 * selected by `flags & 0x0F`: 0=Sentry top half (twin at m+0x10; paces
 * toward window center and fires at the hero), 1=Sentry bottom (no-op),
 * 2=Red Egg (teleports a free monster slot beside the hero when hit),
 * 3=Eyeball (walk/charge-dash), 4=Vistlet (fly/dive/climb).
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import {
    coordsToProxAddr,
    getAirflowDirection,
    isBlocking,
    wrapMapFromAbove,
    wrapMapFromBelow,
    moveMonsterE,
    moveMonsterN,
    moveMonsterNE,
    moveMonsterNW,
    moveMonsterS,
    moveMonsterW,
} from './dungeon-entities.js';
import {
    getRandom,
    heroHitsMonster,
} from './dungeon-combat.js';
import { addProjectileToArray } from './dungeon-projectiles.js';
import { findMonstersNearHero } from './eai4.js';

// g_mem addresses
const HERO_Y = 0xff35;
const MONSTER_INDEX_ADDR = 0xff4a;
const PROXIMITY_LAYER2 = 0xed20;
const SWORD_TYPE = 0x92;
const SWORD_ENCHANTMENT = 6;
const PROX_COLS = 36;

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

// ─── move_monster_NWE_if_on_airflow (dungeon.c:6750) ───

function moveMonsterNweIfOnAirflow(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2); // .currY
    const xRel = g8(g, m + 3); // .m_x_rel
    let di = coordsToProxAddr(g, xRel, y) + PROX_COLS;
    di = wrapMapFromAbove(di);

    for (let i = 0; i < 2; i++) {
        const tile = g8(g, di + i);
        const dir = getAirflowDirection(g, tile);
        if (dir === 0xff) continue;
        switch (dir) {
            case 0: moveMonsterN(g, m); moveMonsterN(g, m); break;
            case 1: moveMonsterW(g, m); moveMonsterW(g, m); break;
            case 2: moveMonsterE(g, m); moveMonsterE(g, m); break;
        }
        return 1;
    }
    return 0;
}

/** Monster_AI_5 (eai5.c:127). */
export function monsterAi5(g: Uint8Array, m: number): void {
    switch (g8(g, m + 4) & 0x0f) {
        case 0: manTopAi(g, m); return;
        case 1: manBottomAi(g, m); return;
        case 2: redEggAi(g, m); return;
        case 3: eyeballAi(g, m); return;
        case 4: vistletAi(g, m); return;
        default: return; // 5-entry jump table by design
    }
}

// ─── Shared proximity check (sub_A5C2): fixed 4-row variant ───

function monsterToHeroProximityAndDirection(g: Uint8Array, m: number): ProxResult {
    const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff; // .currY
    const absDy = (dy & 0x80) !== 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= 4) return { value: 0xff, carry: false };

    if (g8(g, m + 3) < 0x11) {
        return { value: 0x80, carry: (g8(g, m + 5) & 0x80) !== 0 };
    } else {
        return { value: 0x00, carry: (g8(g, m + 5) & 0x80) === 0 };
    }
}

// ─── Sentry (top half runs the AI; bottom half is a passive twin) ───

function manTopAi(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 0x18); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // this half was hit
        manHitReaction(g, m);
        return;
    }

    if (checkGroundedOrStepDown(g, m) === 0) return; // fell one row

    if ((g8(g, m + 9) & 1) !== 0) { // attacking
        manAttackStep(g, m);
        return;
    }

    manNormalState(g, m);
}

// Passive twin: driven entirely by manTopAi's twin writes.
function manBottomAi(_g: Uint8Array, _m: number): void {
    return;
}

// sub_A56A: returns 1 when grounded, 0 when it stepped down.
function checkGroundedOrStepDown(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) === 0) return 1; // left edge
    if (g8(g, m + 3) === 0x23) return 1; // right edge

    if (checkLedgeBelow(g, m) !== 0) return 1;

    s8(g, m + 2, (g8(g, m + 2) + 1) & 0x3f); // .currY++
    s8(g, m + 0x12, (g8(g, m + 0x12) + 1) & 0x3f); // twin.currY++
    return 0;
}

// sub_A590: blocking tile 4 rows below (2 columns)?
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

// sub_A460: step east, mirroring X into the twin. 1 = blocked.
function moveEastAndSyncTwin(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) >= 0x22) return 1;

    if (checkWallAheadE(g, m) !== 0) return 1;

    let newX = (g16(g, m) + 1) & 0xffff;
    if (newX === g16(g, MAP_WIDTH_ADDR)) newX = 0;
    s16(g, m, newX);
    s16(g, m + 0x10, newX);
    s8(g, m + 3, (g8(g, m + 3) + 1) & 0xff);
    s8(g, m + 0x13, (g8(g, m + 0x13) + 1) & 0xff);
    return 0;
}

const MAP_WIDTH_ADDR = 0xc002; // word

// sub_A486: wall 4 rows down / 2 columns right?
function checkWallAheadE(g: Uint8Array, m: number): number {
    let addr = (coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2)) + 2) & 0xffff;

    for (let i = 0; i < 4; i++) {
        if (isBlocking(g, g8(g, addr)) !== 0) return 1;
        addr += 0x24;
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

// sub_A4E5: step west, mirroring X into the twin. 1 = blocked.
function moveWestAndSyncTwin(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) < 2) return 1;

    if (checkWallAheadW(g, m) !== 0) return 1;

    let newX = (g16(g, m) - 1) & 0xffff;
    if (newX === 0xffff) newX = (g16(g, MAP_WIDTH_ADDR) - 1) & 0xffff;
    s16(g, m, newX);
    s16(g, m + 0x10, newX);
    s8(g, m + 3, (g8(g, m + 3) - 1) & 0xff);
    s8(g, m + 0x13, (g8(g, m + 0x13) - 1) & 0xff);
    return 0;
}

// sub_A50B: mirror of check_wall_ahead_E looking 1 column left.
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

// loc_A435: hit-bit forced on for both halves, then common handler.
function manHitReaction(g: Uint8Array, m: number): void {
    const al = ((g8(g, m + 5) & 0xbf) | 0x20) & 0xff;
    s8(g, m + 5, al);
    s8(g, m + 0x15, (al | 0x60) & 0xff);
    heroHitsMonster(g, m);
}

// loc_A449: mirror anim_counter + facing bit into the twin.
function manEndOfFrameSync(g: Uint8Array, m: number): void {
    s8(g, m + 0x16, g8(g, m + 6)); // twin.anim_counter
    const facing = g8(g, m + 5) & 0x80;
    s8(g, m + 0x15, (facing | (g8(g, m + 0x15) & 0x7f)) & 0xff);
}

// loc_A36D: decide attack vs throttled patrol.
function manNormalState(g: Uint8Array, m: number): void {
    const pr = monsterToHeroProximityAndDirection(g, m); // sub_A5C2
    if (pr.carry) {
        manMaybeStartAttack(g, m); // loc_A3B6
        return;
    }

    const sum = g8(g, m + 6) + 0x80;
    s8(g, m + 6, sum & 0xff);
    if (sum >= 0x100) {
        manPatrolStep(g, m); // loc_A381
    } else {
        manEndOfFrameSync(g, m); // loc_A449
    }
}

// loc_A3B6: facing the hero in range — 25% chance to begin the windup.
function manMaybeStartAttack(g: Uint8Array, m: number): void {
    if ((getRandom(g) & 0xc0) !== 0) { // 75%: skip
        manPatrolStep(g, m);
        return;
    }
    if ((~g8(g, m + 6)) & 3) { // only on a specific anim phase
        manPatrolStep(g, m);
        return;
    }
    s8(g, m + 9, g8(g, m + 9) | 1); // begin attack
    s8(g, m + 6, 8); // .anim_counter
    manEndOfFrameSync(g, m);
}

// loc_A381: steps every 4th animation frame.
function manPatrolStep(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 7); // .anim_counter
    if ((g8(g, m + 6) & 3) !== 0) {
        manEndOfFrameSync(g, m); // not due yet
        return;
    }
    manAlignToCenterColumn(g, m); // loc_A391
}

// loc_A391: walk toward window center column 0x10.
function manAlignToCenterColumn(g: Uint8Array, m: number): void {
    if (g8(g, m + 3) > 0x10) { // right of center → approach west
        if (moveWestAndSyncTwin(g, m) === 0) {
            s8(g, m + 5, g8(g, m + 5) & 0x7f); // face left
        }
    } else { // at/left of center → approach east
        if (moveEastAndSyncTwin(g, m) === 0) {
            s8(g, m + 5, g8(g, m + 5) | 0x80); // face right
        }
    }
    manEndOfFrameSync(g, m); // loc_A449
}

// loc_A3D2: windup; fires at phase 0xB, ends at phase 0xC.
function manAttackStep(g: Uint8Array, m: number): void {
    const sum = g8(g, m + 6) + 0x80;
    s8(g, m + 6, sum & 0xff);
    if (sum < 0x100) {
        manEndOfFrameSync(g, m);
        return;
    }

    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff); // .anim_counter
    const phase = g8(g, m + 6) & 0x0f;
    if (phase === 0x0b) {
        manFireProjectile(g, m); // ends with end-of-frame sync itself
        return;
    }
    if (phase === 0x0c) {
        s8(g, m + 9, g8(g, m + 9) & 0xfe); // end the attack
        s8(g, m + 6, 3);
    }
    manEndOfFrameSync(g, m);
}

// byte_A41B/A428: projectile templates. Byte 2 is a projectile-type index
// (see the note in eai5.c about base tile 0xB1 vs group-0 remap).
const manShotRight = [0, 0, 0, 0, 0x14, 0, 0x28, 0, 0, 0, 0, 0, 0]; // facing right
const manShotLeft = [0, 0, 0, 0, 0x14, 4, 0x28, 0, 0, 0, 0, 0, 0]; // facing left

// loc_A3F2: fire a single projectile in the current facing direction.
function manFireProjectile(g: Uint8Array, m: number): void {
    const x = g8(g, m + 3); // .m_x_rel
    const y = (g8(g, m + 2) + 1) & 0xff; // .currY + 1

    manShotLeft[0] = x;
    manShotLeft[1] = y;
    manShotRight[0] = (x + 1) & 0xff;
    manShotRight[1] = y;

    const desc = (g8(g, m + 5) & 0x80) !== 0 ? manShotRight : manShotLeft;
    addProjectileToArray(g, desc);

    manEndOfFrameSync(g, m); // loc_A449
}

// ─── Type 2 — Red Egg: teleports a partner slot beside the hero when hit ───

function redEggAi(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 0x10); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // being hit
        redEggHitCheck(g, m); // loc_A604
        return;
    }
    redEggMoveAndState(g, m); // loc_A780
}

// loc_A604: some hit types damage outright; else clear the flag and
// either resume movement or attempt a teleport.
function redEggHitCheck(g: Uint8Array, m: number): void {
    const hitType = g8(g, m + 5) & 0x1f;
    if (
        hitType === 4 || hitType === 5 || hitType === 8 ||
        (hitType === 1 && g8(g, SWORD_TYPE) === SWORD_ENCHANTMENT)
    ) {
        heroHitsMonster(g, m);
        return;
    }

    s8(g, m + 5, g8(g, m + 5) & 0xdf); // clear the hit bit
    if ((g8(g, m + 9) & 2) !== 0) { // .ai_state
        redEggMoveAndState(g, m); // loc_A780
        return;
    }
    redEggTryTeleportPartner(g, m); // loc_A641
}

// loc_A641: find a free slot; teleport it into view on the facing side.
function redEggTryTeleportPartner(g: Uint8Array, m: number): void {
    const partner = { v: 0 };
    const idx = { v: 0 };
    if (findMonstersNearHero(g, m, partner, idx) !== 0) { // no free slot
        redEggMoveAndState(g, m); // loc_A780
        return;
    }

    const ownAddr = coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2));

    if ((g8(g, m + 5) & 0x80) !== 0) { // facing right
        redEggTeleportEast(g, m, partner.v, idx.v, ownAddr);
    } else {
        redEggTeleportWest(g, m, partner.v, idx.v, ownAddr);
    }
}

// loc_A667..loc_A749 (facing-left variant): check a 2×3 clear area two
// columns right / one row above, then teleport the partner there.
function redEggTeleportWest(
    g: Uint8Array, m: number, partner: number, idx: number, ownAddr: number,
): void {
    const signedX = (g8(g, m + 3) << 24) >> 24;
    if (signedX < 0) { redEggMoveAndState(g, m); return; }
    if ((signedX & 0xff) >= 0x20) { redEggMoveAndState(g, m); return; }

    // ..01
    // Ee23
    // ee45
    let addr = (ownAddr + 2 - PROX_COLS) & 0xffff; // start from point 0
    addr = wrapMapFromBelow(addr);

    for (let row = 0; row < 3; row++) {
        if (isBlocking(g, g8(g, addr)) !== 0) { redEggMoveAndState(g, m); return; }
        addr = (addr + 1) & 0xffff; // points 1, 3, 5
        if (isBlocking(g, g8(g, addr)) !== 0) { redEggMoveAndState(g, m); return; }
        addr += PROX_COLS - 1; // back to column 0, 2, 4
        addr = wrapMapFromAbove(addr);
    }

    addr = wrapMapFromBelow((addr - 2 * PROX_COLS) & 0xffff); // back to point 2

    const oldTile = g8(g, addr);
    s8(g, addr, (idx | 0x80) & 0xff);
    s8(g, PROXIMITY_LAYER2 + idx, oldTile);

    let newX = (g16(g, m) + 2) & 0xffff;
    if (newX >= g16(g, MAP_WIDTH_ADDR)) newX -= g16(g, MAP_WIDTH_ADDR);

    s16(g, partner, newX);
    s8(g, partner + 3, (g8(g, m + 3) + 2) & 0xff);

    redEggFinalizeTeleportedPartner(g, m, partner, idx); // loc_A749
}

// loc_A6D9..loc_A749 (facing-right variant): mirror image, two columns left.
function redEggTeleportEast(
    g: Uint8Array, m: number, partner: number, idx: number, ownAddr: number,
): void {
    const x = g8(g, m + 3); // .m_x_rel
    if (((x << 24) >> 24) < 0) { redEggMoveAndState(g, m); return; } // never in practice
    if (x < 4) { redEggMoveAndState(g, m); return; }

    // 01.
    // 23.Ee
    // 45.ee
    let addr = (ownAddr - PROX_COLS - 3) & 0xffff; // start from point 0
    addr = wrapMapFromBelow(addr);

    for (let row = 0; row < 3; row++) {
        if (isBlocking(g, g8(g, addr)) !== 0) { redEggMoveAndState(g, m); return; }
        addr = (addr + 1) & 0xffff; // points 1, 3, 5
        if (isBlocking(g, g8(g, addr)) !== 0) { redEggMoveAndState(g, m); return; }
        addr += PROX_COLS - 1; // back to column 0, 2, 4
        addr = wrapMapFromAbove(addr);
    }

    addr = wrapMapFromBelow((addr - (2 * PROX_COLS - 1)) & 0xffff); // back to point 3

    const oldTile = g8(g, addr);
    s8(g, addr, (idx | 0x80) & 0xff);
    s8(g, PROXIMITY_LAYER2 + idx, oldTile);

    let newX = g16(g, m);
    if (newX >= 2) {
        newX -= 2;
    } else {
        newX = newX + g16(g, MAP_WIDTH_ADDR) - 2;
    }

    s16(g, partner, newX);
    s8(g, partner + 3, (g8(g, m + 3) - 2) & 0xff);

    redEggFinalizeTeleportedPartner(g, m, partner, idx); // loc_A749
}

// loc_A749: initialize the teleported partner's fields.
function redEggFinalizeTeleportedPartner(g: Uint8Array, m: number, partner: number, idx: number): void {
    s8(g, partner + 2, g8(g, m + 2)); // .currY
    s8(g, partner + 4, (g8(g, m + 4) | 0x60) & 0xff); // .flags
    s8(g, partner + 5, g8(g, m + 5) & 0x80); // just the facing bit
    s8(g, partner + 6, 4); // .anim_counter
    s8(g, partner + 7, g8(g, m + 7)); // .state_flags
    s8(g, partner + 8, 0); // .hp
    s8(g, partner + 9, 2); // .ai_state
    s8(g, partner + 10, 0); // .ai_timer

    if (g8(g, MONSTER_INDEX_ADDR) < idx) {
        s8(g, m + 9, g8(g, m + 9) | 1); // resume movement next frame
    }
}

// loc_A780: generic movement, then the dive-gating state machine.
function redEggMoveAndState(g: Uint8Array, m: number): void {
    if (moveMonsterNweIfOnAirflow(g, m) !== 0) return;

    const oldState = g8(g, m + 9);
    s8(g, m + 9, g8(g, m + 9) & 0xfe);
    if ((oldState & 1) !== 0) return; // one-shot flag consumed

    if ((g8(g, m + 9) & 2) !== 0) {
        redEggDiveState(g, m); // loc_A7FF
        return;
    }

    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xf3); // .anim_counter
    if (moveMonsterS(g, m) !== 0) return; // airborne
    redEggAfterFallStep(g, m); // loc_A7A9
}

// loc_A7FF
function redEggDiveState(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 7); // .anim_counter
    if (g8(g, m + 6) !== 0) return;
    s8(g, m + 9, g8(g, m + 9) & 0xfd); // .ai_state
    s8(g, m + 4, g8(g, m + 4) & 0x9f); // .flags
}

// loc_A7A9
function redEggAfterFallStep(g: Uint8Array, m: number): void {
    const val = (g8(g, m + 6) - 0x10) & 0xff;
    s8(g, m + 6, val);
    if ((val & 0xf0) !== 0) return; // still counting down
    redEggFaceTowardHeroRow(g, m, val); // loc_A7B8
}

// loc_A7B8: counter ran out — face/approach the hero's row.
function redEggFaceTowardHeroRow(g: Uint8Array, m: number, val: number): void {
    s8(g, m + 6, val | 0x40); // .anim_counter

    const heroY = g8(g, HERO_Y);
    if (heroY === g8(g, m + 2) || ((heroY + 1) & 0x3f) === g8(g, m + 2)) {
        redEggAlignedRow(g, m); // loc_A7D7
        return;
    }

    if ((g8(g, m + 5) & 0x80) !== 0) { // facing right
        redEggTryMoveEastThenWest(g, m); // loc_A7EA
    } else {
        redEggTryMoveWestThenEast(g, m); // loc_A7DE
    }
}

// loc_A7D7
function redEggAlignedRow(g: Uint8Array, m: number): void {
    if (g8(g, m + 3) <= 0x11) { // .m_x_rel
        redEggTryMoveEastThenWest(g, m); // loc_A7EA
        return;
    }
    redEggTryMoveWestThenEast(g, m); // loc_A7DE
}

// loc_A7DE: face left, step west; blocked → try the other way.
function redEggTryMoveWestThenEast(g: Uint8Array, m: number): void {
    s8(g, m + 5, g8(g, m + 5) & 0x7f); // face left
    if (moveMonsterW(g, m) !== 0) return;
    redEggTryMoveEastThenWest(g, m); // loc_A7EA
}

// loc_A7EA: face right, step east; blocked → face left and step west.
function redEggTryMoveEastThenWest(g: Uint8Array, m: number): void {
    s8(g, m + 5, g8(g, m + 5) | 0x80); // face right
    if (moveMonsterE(g, m) !== 0) return;
    s8(g, m + 5, g8(g, m + 5) & 0x7f); // face left
    moveMonsterW(g, m); // loc_A7F6: result unused
}

// ─── Type 3 — Eyeball: walk/charge-dash ───

function eyeballAi(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 8); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags: hit
        heroHitsMonster(g, m);
        return;
    }

    if (moveMonsterNweIfOnAirflow(g, m) !== 0) return;

    if ((g8(g, m + 9) & 4) !== 0) { // charge-dash mode
        eyeballChargeDash(g, m); // loc_A8DB
        return;
    }

    // move_monster_S success = airborne → only run the walk AI grounded.
    if (moveMonsterS(g, m) !== 0) return;
    eyeballAfterFall(g, m); // loc_A83D
}

// loc_A83D
function eyeballAfterFall(g: Uint8Array, m: number): void {
    if ((g8(g, m + 9) & 2) === 0) {
        eyeballPrewalkTimer(g, m); // loc_A89B
        return;
    }
    eyeballWalkCycle(g, m);
}

// walk cycle: advance/reverse an 8-phase animation, flip the direction
// bit at each end, and check for a charge on facing change.
function eyeballWalkCycle(g: Uint8Array, m: number): void {
    let phase = g8(g, m + 6) & 7;
    if (phase === 0) s8(g, m + 9, g8(g, m + 9) & 0xfe);
    if (phase === 4) s8(g, m + 9, g8(g, m + 9) | 1);

    if ((g8(g, m + 9) & 1) !== 0) {
        s8(g, m + 6, (g8(g, m + 6) - 1) & 0xff);
    } else {
        s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
    }

    phase = g8(g, m + 6) & 7;
    if (phase === 0) {
        s8(g, m + 5, g8(g, m + 5) & 0x7f); // face left
    } else if (phase === 4) {
        s8(g, m + 5, g8(g, m + 5) | 0x80); // face right
    } else {
        return; // mid-cycle, wait
    }
    eyeballMaybeStartCharge(g, m); // loc_A87A
}

// loc_A87A: facing+near → charge; else 50% reset to base state.
function eyeballMaybeStartCharge(g: Uint8Array, m: number): void {
    const pr = monsterToHeroProximityAndDirection(g, m); // sub_A5C2
    if (pr.carry) {
        s8(g, m + 9, 4); // begin charge
        s8(g, m + 10, 0); // .ai_timer
        return;
    }
    if ((getRandom(g) & 0x80) === 0) return; // 50%: do nothing
    s8(g, m + 9, 0); // reset
    s8(g, m + 10, 0);
}

// loc_A89B: pre-walk timer + throttled step.
function eyeballPrewalkTimer(g: Uint8Array, m: number): void {
    const pr = monsterToHeroProximityAndDirection(g, m); // sub_A5C2
    if (pr.carry) {
        s8(g, m + 9, 4);
        s8(g, m + 10, 0);
        return;
    }
    s8(g, m + 10, (g8(g, m + 10) + 1) & 0xff); // .ai_timer
    if ((pr.value & 7) === 0) { // 0 or 0x80: close; 0xFF: far
        s8(g, m + 9, g8(g, m + 9) | 2);
    }
    eyeballThrottledStep(g, m); // loc_A8B4
}

// loc_A8B4
function eyeballThrottledStep(g: Uint8Array, m: number): void {
    const sum = g8(g, m + 6) + 0x80;
    s8(g, m + 6, sum & 0xff);
    if (sum < 0x100) return; // not due yet
    eyeballSingleStep(g, m); // loc_A8BB
}

// loc_A8BB: step in the current facing direction.
function eyeballSingleStep(g: Uint8Array, m: number): void {
    if ((g8(g, m + 5) & 0x80) !== 0) { // facing right
        if (moveMonsterE(g, m) === 0) s8(g, m + 9, 2);
    } else {
        if (moveMonsterW(g, m) === 0) s8(g, m + 9, 2);
    }
}

// loc_A8DB: charge countdown, then double-step dashes until blocked.
function eyeballChargeDash(g: Uint8Array, m: number): void {
    s8(g, m + 10, (g8(g, m + 10) + 1) & 0xff); // .ai_timer
    if (g8(g, m + 10) < 5) {
        eyeballSingleStep(g, m); // loc_A8BB
        return;
    }
    s8(g, m + 6, 5); // .anim_counter
    if ((g8(g, m + 5) & 0x80) !== 0) { // facing right
        moveMonsterE(g, m);
        if (moveMonsterE(g, m) === 0) { // second step blocked
            s8(g, m + 9, 2);
            s8(g, m + 6, 4);
        }
    } else {
        moveMonsterW(g, m);
        if (moveMonsterW(g, m) === 0) { // second step blocked
            s8(g, m + 9, 2);
            s8(g, m + 6, 0);
        }
    }
}

// ─── Type 4 — Vistlet: fly/dive/climb ───

function vistletAi(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 8); // .hp

    if ((g8(g, m + 5) & 0x20) !== 0) { // .ai_flags
        heroHitsMonster(g, m);
        return;
    }

    if (moveMonsterNweIfOnAirflow(g, m) !== 0) return;

    if ((g8(g, m + 9) & 1) !== 0) {
        vistletDiveState(g, m); // loc_A993
        return;
    }
    if ((g8(g, m + 9) & 2) !== 0) {
        vistletClimbState(g, m); // loc_A9BC
        return;
    }
    vistletSearchState(g, m);
}

// default state: near window center (0x10..0x12) → dive; else hover.
function vistletSearchState(g: Uint8Array, m: number): void {
    if (g8(g, m + 3) <= 0x0f || g8(g, m + 3) > 0x12) { // .m_x_rel
        vistletCycleAnim(g, m); // loc_A958
        return;
    }
    s8(g, m + 9, g8(g, m + 9) | 1); // begin dive
    s8(g, m + 6, 4); // .anim_counter
    vistletFlyStep(g, m); // loc_A966
}

// loc_A958
function vistletCycleAnim(g: Uint8Array, m: number): void {
    const low = (g8(g, m + 6) + 1) & 3;
    s8(g, m + 6, (g8(g, m + 6) & 0xf0) | low);
    vistletFlyStep(g, m); // loc_A966
}

// loc_A966
function vistletFlyStep(g: Uint8Array, m: number): void {
    moveMonsterN(g, m); // result unused

    const sum = g8(g, m + 6) + 0x80;
    s8(g, m + 6, sum & 0xff);
    if (sum < 0x100) return; // not due yet
    vistletAfterFlyThrottle(g, m); // loc_A972
}

// loc_A972: nudge toward the center column with opposite follow-up.
function vistletAfterFlyThrottle(g: Uint8Array, m: number): void {
    if (g8(g, m + 3) > 0x10) { // .m_x_rel
        if (moveMonsterW(g, m) === 0) moveMonsterE(g, m);
        return;
    }
    if (moveMonsterE(g, m) === 0) moveMonsterW(g, m);
}

// loc_A993: dive anim; descends once low 3 bits of anim_counter reach 5.
function vistletDiveState(g: Uint8Array, m: number): void {
    const phase = g8(g, m + 6) & 7;
    if (phase < 5) {
        s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff); // full-byte increment, as in C
        return;
    }
    vistletDiveStep(g, m); // loc_A9A0
}

// loc_A9A0
function vistletDiveStep(g: Uint8Array, m: number): void {
    moveMonsterS(g, m); // first attempt, result unused
    if (moveMonsterS(g, m) !== 0) return; // second attempt moved → keep diving
    vistletDiveAdvance(g, m); // loc_A9AD
}

// loc_A9AD
function vistletDiveAdvance(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 7); // .anim_counter
    if (g8(g, m + 6) !== 0) return;
    s8(g, m + 9, 2); // dive finished, begin climb
}

// loc_A9BC: climb back up diagonally toward the center column.
function vistletClimbState(g: Uint8Array, m: number): void {
    if (g8(g, m + 3) > 0x10) { // .m_x_rel
        vistletClimbNw(g, m); // loc_A9DD
        return;
    }
    vistletClimbNe(g, m);
}

function vistletClimbNe(g: Uint8Array, m: number): void {
    moveMonsterN(g, m); // result unused
    if (moveMonsterNE(g, m) !== 0) return;
    if (moveMonsterN(g, m) !== 0) return;
    s8(g, m + 9, g8(g, m + 9) & 0xfd); // both blocked → climb finished
}

// loc_A9DD
function vistletClimbNw(g: Uint8Array, m: number): void {
    moveMonsterN(g, m); // result unused
    if (moveMonsterNW(g, m) !== 0) return;
    if (moveMonsterN(g, m) !== 0) return;
    s8(g, m + 9, g8(g, m + 9) & 0xfd); // both blocked → climb finished
}
