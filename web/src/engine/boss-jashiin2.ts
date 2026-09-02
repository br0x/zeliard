/**
 * boss-jashiin2.ts — TS port of src/mao2.c (Stage 9i): "Jashiin" room-2
 * (mpa0) AI. A 6×9 pseudo-monster body grid with a one-time encounter
 * latch (0xFF21), an intro teleport/pose sequence, chase/walk/jump AI,
 * two independent projectile attacks, an HP<200 regeneration phase, and a
 * flash death sequence. Body-layout masks are scanned MSB-first without
 * in-place mutation (the asm rotates each byte exactly 8 times per call —
 * net identity).
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import { coordsToProxAddr } from './dungeon-entities.js';
import { isInProximityWindow } from './dungeon-monsters.js';
import { getStats, getRandom } from './dungeon-combat.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';

// g_mem addresses
const MONSTERS_LIST = 0xc010; // word
const PROXIMITY_LAYER2 = 0xed20;
const BOSS_STATE_PTR = 0xa002; // word
const BOSS_BEING_HIT = 0xff2e;
const BOSS_IS_DEAD = 0xff30;
const SPRITE_FLASH_FLAG = 0xff2f;
const SOUND_FX_REQUEST = 0xff75;
const PROXIMITY_MAP_LEFT_COL = 0x80; // word
const HERO_X_VIEW = 0x83;
const MAP_WIDTH = 0xc002; // word (low byte used by this module)
const MAO2_START_LATCH = 0xff21; // byte — encounter-start latch



// ─── persistent state: byte_AC1B .. byte_AC38 ───

let animIndex = 0;
let activeSpriteCount = 0;
let hitFlags = 0;
let facingLeft = 0;         // 00 / FF
let relX = 0;
let deathTimer = 0;
let encounterStarted = 0;
let tileFlagsOr = 0;        // normally 0, sometimes 0x60
let introActive = 0;
let introVariant = 0;       // 0/1
let introCounter = 0;
let appendPtr = 0;          // word
let shot1Active = 0;
let shot1X = 0;
let shot1Y = 0;
let shot1Facing = 0;
let shot1Age = 0;
let shot2Active = 0;
let shot2X = 0;
let shot2Y = 0;
let shot2Facing = 0;
let shot2Age = 0;
let regenPhase = 0;
let jumpActive = 0;
let jumpStep = 0;
let movedThisFrame = 0;
let attackAnimActive = 0;
let attackAnimStep = 0;
let regenTimer = 0;

// AC39..AC6E: 6 columns × 9 bytes.
const bodyGrid = new Uint8Array(54);

// AC46F
const INTRO_ANIM_TABLE = [0, 0, 7, 7, 9, 10, 10, 11, 11, 12];

// AC666. Each jump step is 3 bytes: horizontal flag, signed Y delta, anim.
// The byte after the final triple doubles as the 0x80 sentinel.
const JUMP_TABLE = [
    0, 0, 4,
    0, 0, 4,
    0, 0xfe, 5,
    1, 0xfe, 5,
    1, 0xfe, 5,
    1, 0, 6,
    1, 0, 6,
    1, 0, 6,
    1, 2, 6,
    1, 2, 6,
    1, 2, 6,
    0, 0, 4,
    0, 0, 4,
    0, 0, 0,
    0x80,
];

// ─── body layout tables read by build_body_grid ───

const L0 = [0x02, 0x06, 0x04, 0x00, 0x01, 0x03, 0x05, 0x07];
const L1 = [0x02, 0x00, 0x01, 0x08, 0x09, 0x0a, 0x0b];
const L2 = [0x10, 0x12, 0x11, 0x00, 0x0c, 0x0d, 0x0e, 0x0f];
const L3 = [0x16, 0x17, 0x00, 0x0c, 0x13, 0x14, 0x15];
const L4 = [0x02, 0x1a, 0x1b, 0x00, 0x01, 0x18, 0x19, 0x1c];
const L5 = [0x02, 0x22, 0x23, 0x00, 0x01, 0x1d, 0x1e, 0x20];
const L6 = [0x02, 0x1a, 0x00, 0x01, 0x18, 0x24, 0x25];
const L7 = [0x27, 0x28, 0x06, 0x04, 0x00, 0x26, 0x03, 0x05, 0x07];
const L8 = [0x2b, 0x2a, 0x06, 0x04, 0x00, 0x29, 0x03, 0x05, 0x07];
const L9 = [0x2d, 0x2c, 0x06, 0x04, 0x00, 0x29, 0x03, 0x05, 0x07];
const L10 = [0x31, 0x32, 0x00, 0x01, 0x2e, 0x2f, 0x30];
const L11 = [0x27, 0x33, 0x32, 0x00, 0x26, 0x2e, 0x2f, 0x30];
const L12 = [0x2b, 0x2a, 0x34, 0x32, 0x00, 0x29, 0x2e, 0x2f, 0x30];
const L13 = [0x36, 0x2c, 0x35, 0x32, 0x00, 0x29, 0x2e, 0x2f, 0x30];

// Left-facing layouts: off_A957
const LEFT_LAYOUTS: ReadonlyArray<ReadonlyArray<number>> = [
    L0, L1, L2, L3, L4, L5, L6, L7, L8, L9, L10, L11, L12, L13,
];

const R0 = [0x05, 0x00, 0x01, 0x03, 0x04, 0x06, 0x02, 0x07];
const R1 = [0x0b, 0x00, 0x01, 0x08, 0x09, 0x0a, 0x02];
const R2 = [0x0f, 0x00, 0x0c, 0x0d, 0x0e, 0x11, 0x10, 0x12];
const R3 = [0x00, 0x0c, 0x13, 0x14, 0x15, 0x17, 0x16];
const R4 = [0x1c, 0x00, 0x01, 0x18, 0x19, 0x1a, 0x1b, 0x02];
const R5 = [0x22, 0x00, 0x01, 0x1d, 0x1e, 0x20, 0x21, 0x02];
const R6 = [0x00, 0x01, 0x18, 0x24, 0x25, 0x1a, 0x02];
const R7 = [0x05, 0x00, 0x26, 0x03, 0x04, 0x06, 0x27, 0x28, 0x07];
const R8 = [0x05, 0x00, 0x29, 0x03, 0x04, 0x06, 0x2a, 0x07, 0x2b];
const R9 = [0x05, 0x00, 0x29, 0x03, 0x04, 0x06, 0x2c, 0x07, 0x2d];
const R10 = [0x30, 0x00, 0x01, 0x2e, 0x2f, 0x31, 0x32];
const R11 = [0x30, 0x00, 0x26, 0x2e, 0x2f, 0x27, 0x33, 0x32];
const R12 = [0x30, 0x00, 0x29, 0x2e, 0x2f, 0x2a, 0x34, 0x32, 0x2b];
const R13 = [0x30, 0x00, 0x29, 0x2e, 0x2f, 0x2c, 0x35, 0x32, 0x36];

// Right-facing layouts: off_A9E4
const RIGHT_LAYOUTS: ReadonlyArray<ReadonlyArray<number>> = [
    R0, R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13,
];

// Shape masks: six bytes per animation, scanned MSB-first (the asm's
// 8-rotations-per-byte leave the value unchanged).
const LEFT_MASKS: ReadonlyArray<ReadonlyArray<number>> = [
    [0x00, 0x00, 0x11, 0x04, 0xaa, 0x01],
    [0x00, 0x00, 0x10, 0x00, 0xab, 0x01],
    [0x00, 0x00, 0x09, 0x02, 0xaa, 0x01],
    [0x00, 0x00, 0x10, 0x04, 0xab, 0x00],
    [0x00, 0x00, 0x08, 0x03, 0x55, 0x01],
    [0x00, 0x00, 0x10, 0x05, 0xaa, 0x02],
    [0x00, 0x00, 0x10, 0x04, 0xab, 0x00],
    [0x00, 0x00, 0x31, 0x04, 0xaa, 0x01],
    [0x40, 0x00, 0x41, 0x04, 0xaa, 0x01],
    [0x00, 0x10, 0x21, 0x04, 0xaa, 0x01],
    [0x00, 0x00, 0x05, 0x00, 0x2b, 0x01],
    [0x00, 0x00, 0x0d, 0x00, 0x2b, 0x01],
    [0x10, 0x00, 0x15, 0x00, 0x2b, 0x01],
    [0x00, 0x04, 0x0d, 0x00, 0x2b, 0x01],
];

const RIGHT_MASKS: ReadonlyArray<ReadonlyArray<number>> = [
    [0x01, 0xaa, 0x04, 0x11, 0x00, 0x00],
    [0x01, 0xab, 0x00, 0x10, 0x00, 0x00],
    [0x01, 0xaa, 0x02, 0x09, 0x00, 0x00],
    [0x00, 0xab, 0x04, 0x10, 0x00, 0x00],
    [0x01, 0x55, 0x03, 0x08, 0x00, 0x00],
    [0x02, 0xaa, 0x05, 0x10, 0x00, 0x00],
    [0x00, 0xab, 0x04, 0x10, 0x00, 0x00],
    [0x01, 0xaa, 0x04, 0x31, 0x00, 0x00],
    [0x01, 0xaa, 0x04, 0x41, 0x00, 0x40],
    [0x01, 0xaa, 0x04, 0x21, 0x10, 0x00],
    [0x01, 0x2b, 0x00, 0x05, 0x00, 0x00],
    [0x01, 0x2b, 0x00, 0x0d, 0x00, 0x00],
    [0x01, 0x2b, 0x00, 0x15, 0x00, 0x10],
    [0x01, 0x2b, 0x00, 0x0d, 0x04, 0x00],
];

// ─── boss_state_block accessors ───

function bossState(g: Uint8Array): number {
    return memRead16(g, BOSS_STATE_PTR);
}
function bossXGet(g: Uint8Array): number {
    return memRead16(g, bossState(g) + 0);
}
function bossXSet(g: Uint8Array, v: number): void {
    memWrite16(g, bossState(g) + 0, v);
}
function bossYGet(g: Uint8Array): number {
    return memRead8(g, bossState(g) + 2);
}
function bossYSet(g: Uint8Array, v: number): void {
    memWrite8(g, bossState(g) + 2, v);
}
function bossHpGet(g: Uint8Array): number {
    return memRead16(g, bossState(g) + 3);
}
function bossHpSet(g: Uint8Array, v: number): void {
    memWrite16(g, bossState(g) + 3, v);
}

/** Draw_Boss_Health equivalent. */
function drawBossHealth(g: Uint8Array): void {
    memWrite8(g, 0xff9f, 0xff);
}

/** Jashiin2_AI_reset (mao2.c:195). */
export function jashiin2AiReset(): void {
    animIndex = 0;
    activeSpriteCount = 0;
    hitFlags = 0;
    facingLeft = 0;
    relX = 0;
    deathTimer = 0;
    encounterStarted = 0;
    tileFlagsOr = 0;
    introActive = 0;
    introVariant = 0;
    introCounter = 0;
    appendPtr = 0;
    shot1Active = 0;
    shot1X = 0; shot1Y = 0; shot1Facing = 0; shot1Age = 0;
    shot2Active = 0;
    shot2X = 0; shot2Y = 0; shot2Facing = 0; shot2Age = 0;
    regenPhase = 0;
    jumpActive = 0; jumpStep = 0; movedThisFrame = 0;
    attackAnimActive = 0; attackAnimStep = 0;
    regenTimer = 0;
    bodyGrid.fill(0);
}

// sub_A691: returns original carry: 1 = blocked.
function moveLeftOne(g: Uint8Array): number {
    const x = (bossXGet(g) - 1) & 0xffff;

    // Succeeds only while new X > 14.
    if (x <= 14) return 1;

    bossXSet(g, x);
    movedThisFrame = 0;
    return 0;
}

// sub_A6A7: succeeds while new X <= 53.
function moveRightOne(g: Uint8Array): number {
    const x = (bossXGet(g) + 1) & 0xffff;

    if (x > 53) return 1;

    bossXSet(g, x);
    movedThisFrame = 0;
    return 0;
}

function startShot1(g: Uint8Array): void {
    shot1Age = 0;
    shot1Active = 0xff;
    shot1Facing = facingLeft;

    shot1X = (bossXGet(g) + (facingLeft & 5)) & 0xff;
    shot1Y = (bossYGet(g) + 4) & 0x3f;
    memWrite8(g, SOUND_FX_REQUEST, 58);
}

function startShot2(g: Uint8Array): void {
    shot2Age = 0;
    shot2Active = 0xff;
    shot2Facing = facingLeft;

    shot2X = (bossXGet(g) + (facingLeft & 8) - 1) & 0xff;
    shot2Y = (bossYGet(g) + 4) & 0x3f;
    memWrite8(g, SOUND_FX_REQUEST, 58);
}

function buildBodyGrid(): void {
    bodyGrid.fill(0xff);

    let idx = animIndex;
    if (idx >= 14) idx = 13; // defensive only; original tables have 14

    const layout = facingLeft ? RIGHT_LAYOUTS[idx] ?? [] : LEFT_LAYOUTS[idx] ?? [];
    const mask = facingLeft ? RIGHT_MASKS[idx] ?? [] : LEFT_MASKS[idx] ?? [];

    let layoutPos = 0;
    let dst = 0;

    for (let col = 0; col < 6; ++col) {
        const bits = mask[col] ?? 0;

        for (let row = 0; row < 8; ++row) {
            if ((bits & (0x80 >> row)) !== 0) {
                bodyGrid[dst] = layout[layoutPos++] ?? 0xff;
            }
            dst++;
        }
        dst++; // ninth byte in each 9-byte column
    }
}

function renderBodyAndAttacks(g: Uint8Array): void {
    buildBodyGrid();

    // Original special-case patch for animation 5.
    if (animIndex === 5) {
        if (facingLeft) {
            bodyGrid[8] = 0x23;   // AC41
            bodyGrid[17] = 0x1f;  // AC4A
        } else {
            bodyGrid[44] = 0x1f;  // AC65
            bodyGrid[53] = 0x21;  // AC6E
        }
    }

    let si = appendPtr;
    let worldX = bossXGet(g);

    for (let col = 0; col < 6; ++col, worldX = (worldX + 1) & 0xffff) {
        const win = isInProximityWindow(g, worldX);
        if (!win.inside) continue;

        relX = win.xRel;

        for (let row = 0; row < 9; ++row) {
            const cell = bodyGrid[col * 9 + row] ?? 0xff;
            if (cell === 0xff) continue;

            memWrite16(g, si + 0, worldX);
            memWrite8(g, si + 2, (bossYGet(g) + row) & 0x3f);
            memWrite8(g, si + 3, relX);

            // High nibble of cell becomes .flags (optionally OR 0x60);
            // the entire cell becomes .anim_counter.
            memWrite8(g, si + 4, ((cell >> 4) | tileFlagsOr) & 0xff);
            memWrite8(g, si + 6, cell);
            let ai = facingLeft & 0x80;
            if (hitFlags !== 0) ai |= 0x20;
            memWrite8(g, si + 5, ai);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            const oldTile = memRead8(g, di);
            memWrite8(g, di, (activeSpriteCount | 0x80) & 0xff);
            memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

            si += 16;
            activeSpriteCount = (activeSpriteCount + 1) & 0xff;
        }
    }

    appendPtr = si;
    memWrite16(g, si, 0xffff);

    renderAttackEntities(g);
}

function renderAttackEntities(g: Uint8Array): void {
    let si = appendPtr;

    // ---- attack entity 1: tile 0x24 ----
    if (shot1Active) {
        if (shot1Age < 9) {
            if (shot1Age < 3) {
                shot1Y = (shot1Y + 1) & 0x3f;
            }
            shot1X = (shot1X + (shot1Facing !== 0 ? 1 : -1)) & 0xff;
        }

        const win = isInProximityWindow(g, shot1X);
        if (win.inside) {
            memWrite16(g, si + 0, shot1X);
            memWrite8(g, si + 2, shot1Y);
            memWrite8(g, si + 3, win.xRel);
            memWrite8(g, si + 4, 0x24);

            let anim = 0;
            if (shot1Age >= 3) {
                anim = ((shot1Age & 3) + 1) & 0xff;
            }
            memWrite8(g, si + 6, anim);
            memWrite8(g, si + 5, shot1Facing & 0x80);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            const oldTile = memRead8(g, di);
            memWrite8(g, di, (activeSpriteCount | 0x80) & 0xff);
            memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

            si += 16;
            activeSpriteCount = (activeSpriteCount + 1) & 0xff;
        }

        shot1Age = (shot1Age + 1) & 0xff;
        if (shot1Age >= 11) {
            shot1Active = 0;
        }
    }

    memWrite16(g, si, 0xffff);

    // ---- attack entity 2: tile 0x25 ----
    if (shot2Active) {
        let anim = 0;

        if (shot2Age < 3) {
            shot2Y = (shot2Y + 1) & 0x3f;
            anim = 2;
        }

        shot2X = (shot2X + (shot2Facing !== 0 ? 1 : -1)) & 0xff;

        const win = isInProximityWindow(g, shot2X);
        if (win.inside) {
            memWrite16(g, si + 0, shot2X);
            memWrite8(g, si + 2, shot2Y);
            memWrite8(g, si + 3, win.xRel);
            memWrite8(g, si + 4, 0x25);
            memWrite8(g, si + 6, anim);
            memWrite8(g, si + 5, shot2Facing & 0x80);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            const oldTile = memRead8(g, di);
            memWrite8(g, di, (activeSpriteCount | 0x80) & 0xff);
            memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

            si += 16;
            activeSpriteCount = (activeSpriteCount + 1) & 0xff;
        }

        shot2Age = (shot2Age + 1) & 0xff;

        // Terminates when X leaves [0x10,0x39), irrespective of age.
        if (shot2X < 0x10 || shot2X >= 0x39) {
            shot2Active = 0;
        }
    }

    memWrite16(g, si, 0xffff);
    appendPtr = si;
}

function damageBoss(g: Uint8Array, damage: number): void {
    let hp = bossHpGet(g);
    hp = damage > hp ? 0 : (hp - damage) & 0xffff;
    bossHpSet(g, hp);

    drawBossHealth(g);

    if (hp === 0 && memRead8(g, BOSS_BEING_HIT) === 0) {
        deathTimer = 0;
        shot1Active = 0;
        shot2Active = 0;
        memWrite8(g, BOSS_BEING_HIT, 0xff);
    }
}

function maybeRegenerate(g: Uint8Array): void {
    if (bossHpGet(g) === 800) return;

    let hp = (bossHpGet(g) + 80) & 0xffff;

    if (hp > 800) {
        hp = 800;
        regenPhase = 0;
        introCounter = 10;
        introActive = 0xff;
        tileFlagsOr = 0x60;
    }

    bossHpSet(g, hp);
    memWrite8(g, SOUND_FX_REQUEST, 60);
    drawBossHealth(g);
}

function chooseSpawnPosition(g: Uint8Array): void {
    bossYSet(g, 9);

    // shr al,1 / sbb al,al => 00 if original bit0=0, FF if bit0=1
    facingLeft = (getRandom(g) & 1) !== 0 ? 0xff : 0x00;

    const mapW = memRead8(g, MAP_WIDTH);
    const left = memRead16(g, PROXIMITY_MAP_LEFT_COL) & 0xff;

    let x = ((~facingLeft & 0x14) + left + 4) & 0xff;
    if (x >= mapW) x = (x - mapW) & 0xff;
    bossXSet(g, x);

    if (x >= 16 && x < 53) return;

    facingLeft = ~facingLeft & 0xff;
    x = ((~facingLeft & 0x14) + left + 4) & 0xff;
    if (x >= mapW) x = (x - mapW) & 0xff;
    bossXSet(g, x);
}

// regen-phase chase/jump/attack state machine: sub_A4C9
function activePhase(g: Uint8Array): void {
    regenTimer = (regenTimer + 1) & 0xff;
    if ((regenTimer & 0x1f) === 0) maybeRegenerate(g);

    if (jumpActive) {
        const i = jumpStep * 3;
        const horizontal = JUMP_TABLE[i] ?? 0;

        if (horizontal) {
            if (!facingLeft) {
                moveLeftOne(g);
                moveLeftOne(g);
            } else {
                moveRightOne(g);
                moveRightOne(g);
            }
        }

        const dy = (JUMP_TABLE[i + 1] ?? 0) << 24 >> 24; // int8
        bossYSet(g, (bossYGet(g) + dy) & 0x3f);
        animIndex = JUMP_TABLE[i + 2] ?? 0;
        jumpStep = (jumpStep + 1) & 0xff;

        if ((JUMP_TABLE[i + 3] ?? 0) === 0x80) jumpActive = 0;

        renderBodyAndAttacks(g);
        return;
    }

    if (attackAnimActive) {
        const old = attackAnimStep;
        attackAnimStep = (attackAnimStep + 1) & 0xff;
        animIndex = INTRO_ANIM_TABLE[old] ?? 0;

        if (animIndex === 9) {
            attackAnimActive = 0;
            startShot1(g);
        }

        renderBodyAndAttacks(g);
        return;
    }

    if (shot1Active) {
        renderBodyAndAttacks(g);
        return;
    }

    // Hero absolute X = proximity-left + hero viewport X + 3, wrapped.
    let heroX = (memRead16(g, PROXIMITY_MAP_LEFT_COL) + memRead8(g, HERO_X_VIEW) + 3) & 0xff;
    const mapW = memRead8(g, MAP_WIDTH);
    if (heroX >= mapW) heroX = (heroX - mapW) & 0xff;

    facingLeft = bossXGet(g) < heroX ? 0xff : 0x00;

    let distance: number;
    if (!facingLeft) distance = (bossXGet(g) - heroX) & 0xfe;
    else distance = (heroX - bossXGet(g)) & 0xfe;

    if (distance === 8) {
        // fall through to loc_A5CD
    } else if (distance < 8) {
        let blocked: number;

        if (!facingLeft) {
            animIndex = (animIndex - 1) & 3;
            if (!(animIndex & 1)) moveRightOne(g);
            blocked = moveRightOne(g);
        } else {
            animIndex = (animIndex - 1) & 3;
            if (!(animIndex & 1)) moveLeftOne(g);
            blocked = moveLeftOne(g);
        }

        // Successful walking bypasses the stationary/random-attack logic.
        if (!blocked) {
            renderBodyAndAttacks(g);
            return;
        }

        jumpStep = 0;
        jumpActive = 0xff;
    } else {
        let blocked: number;

        if (!facingLeft) {
            animIndex = (animIndex + 1) & 3;
            if (animIndex & 1) moveLeftOne(g);
            blocked = moveLeftOne(g);
        } else {
            animIndex = (animIndex + 1) & 3;
            if (animIndex & 1) moveRightOne(g);
            blocked = moveRightOne(g);
        }

        if (!blocked) {
            renderBodyAndAttacks(g);
            return;
        }

        jumpStep = 0;
        jumpActive = 0xff;
    }

    // loc_A5CD: only reached when exactly 8 units away, or when walking
    // hit an arena boundary and converted into a jump.
    {
        const prev = movedThisFrame;
        movedThisFrame = 0xff;

        if (!prev) {
            renderBodyAndAttacks(g);
            return;
        }

        animIndex &= 0xfe;
        if ((getRandom(g) & 0x0f) === 0) {
            attackAnimStep = 0;
            attackAnimActive = 0xff;
        }
    }

    renderBodyAndAttacks(g);
}

const DEATH_ANIM = [8, 8, 8, 12, 12, 12, 13, 13, 11, 11];

function deathSequence(g: Uint8Array): void {
    const old = deathTimer;

    if (old >= 40) {
        memWrite8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    if ((old & 7) === 0) {
        memWrite8(g, SOUND_FX_REQUEST, 35);
    }

    memWrite8(g, SPRITE_FLASH_FLAG, 0xff);
    deathTimer = (deathTimer + 1) & 0xff;

    if (old >= 20) {
        renderBodyAndAttacks(g);
        return;
    }

    animIndex = DEATH_ANIM[old >> 1] ?? 0;
    renderBodyAndAttacks(g);
}

/** Jashiin2_AI (mao2.c:219) — entry point, called once per frame. */
export function jashiin2Ai(g: Uint8Array, m: number): void {
    void m;

    const base = memRead16(g, MONSTERS_LIST);
    let si = base;

    activeSpriteCount = 0;
    hitFlags = 0;

    // Restore every pseudo-monster tile left by the previous frame and
    // capture at most the first hit.
    for (;;) {
        if (memRead16(g, si + 0) === 0xffff) break;

        const win = isInProximityWindow(g, memRead16(g, si + 0));
        if (win.inside) {
            memWrite8(g, si + 3, win.xRel);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            memWrite8(g, di, memRead8(g, PROXIMITY_LAYER2 + activeSpriteCount));

            if (!(hitFlags & 0x80) && (memRead8(g, si + 5) & 0x40) !== 0) {
                let al = memRead8(g, si + 5) & 0x1f;

                // A body cell whose tile flags low 5 bits are zero AND whose
                // animation counter low nibble is zero is the special hit
                // class marked by bit 7.
                if ((memRead8(g, si + 4) & 0x1f) === 0 && (memRead8(g, si + 6) & 0x0f) === 0) {
                    al |= 0x80;
                }
                hitFlags = al;
            }
        }

        activeSpriteCount = (activeSpriteCount + 1) & 0xff;
        si += 16;
    }

    memWrite16(g, base, 0xffff);
    appendPtr = base;
    activeSpriteCount = 0;

    if (hitFlags !== 0) {
        const request = hitFlags & 0x1f;
        let damage = (getStats(g, request) >> 1) & 0xffff;

        // Exact assembly behavior: only AL == 1 avoids the second shift.
        // A special-class hit has bit 7 set, so it takes both shifts too.
        if (hitFlags !== 1) damage >>= 1;

        damageBoss(g, damage);
        memWrite8(g, SOUND_FX_REQUEST, 57);

        if (bossHpGet(g) < 200) regenPhase = 0xff;
    }

    if (memRead8(g, BOSS_BEING_HIT) !== 0) {
        deathSequence(g);
        return;
    }

    // One-time encounter latch from byte_FF21.
    if (!encounterStarted) {
        if (memRead8(g, MAO2_START_LATCH) !== 0) encounterStarted = 0xff;
        return;
    }

    if (regenPhase) {
        activePhase(g);
        return;
    }

    if (!introActive) {
        if (shot1Active || shot2Active) {
            renderAttackEntities(g);
            return;
        }

        chooseSpawnPosition(g);
        introCounter = 0;
        introActive = 0xff;
        introVariant = (getRandom(g) >> 7) & 1;
    }

    introCounter = (introCounter + 1) & 0xff;

    if (introCounter < 6) {
        if (introCounter & 1) {
            renderAttackEntities(g);
            return;
        }

        memWrite8(g, SOUND_FX_REQUEST, 59);
        tileFlagsOr = 0x60;
        animIndex = introVariant * 10;
        renderBodyAndAttacks(g);
        return;
    }

    if (introCounter < 11) {
        const idx = introVariant * 5 + (introCounter - 6);
        animIndex = INTRO_ANIM_TABLE[idx] ?? 0;
        tileFlagsOr = 0;

        if (animIndex === 9) startShot1(g);
        if (animIndex === 12) startShot2(g);

        renderBodyAndAttacks(g);
        return;
    }

    if (introCounter < 17) {
        if (introCounter & 1) {
            renderAttackEntities(g);
            return;
        }
        memWrite8(g, SOUND_FX_REQUEST, 59);
        tileFlagsOr = 0x60;
        renderBodyAndAttacks(g);
        return;
    }

    introActive = 0;
    renderAttackEntities(g);
}
