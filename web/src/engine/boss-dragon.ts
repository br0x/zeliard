/**
 * boss-dragon.ts — TS port of src/drgn.c (Stage 9i): "Dragon" boss AI.
 * A 29×10 composited body (sparse layout buffer → pseudo-monster entries)
 * with pose tables, motion-driven appendages, a windup + breath/flame
 * attack extension, hit reactions and a flash death sequence. The
 * composite_layer masks are consumed MSB-first without in-place mutation
 * (the asm rotates each byte exactly 8 times per call — net identity).
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
const BOSS_HEALTH_REQUEST = 0xff9f;



// ─── persistent state (byte_AA53 .. byte_AA68) ───

let composeRow = 0;
let composeCol = 0;
let currentRelX = 0;
let breathActive = 0;
let breathFrame = 0;
let deathTimer = 0;
let activeSpriteCount = 0;
let hitMonsterFlags = 0;
let pose = 0;               // 0..10
let animPhase = 0;
let motionPhase = 0;
let movementAccum = 0;
let moveRightAfterHit = 0;
let moveRightTicks = 0;
let breathWindup = 0;
let windupBasePose = 0;
let windupCounter = 0;
let breathCounter = 0;
let vulnerableHit = 0;
let reactionVariant = 0;
let reactionIndex = 0;
let reactionActive = 0;

// unk_AA69: 29-column × 10-row compositing surface (asm clears 320 bytes,
// only the first 290 rendered).
const layoutBuffer = new Uint8Array(320);

// ─── AI-consumed sprite/layout data ───

// Main body, indexed by pose 0..10.
const BODY_799 = [0x00, 0x02, 0x01, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16];
const BODY_7A4 = [0x00, 0x02, 0x06, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16];
const BODY_7AF = [0x00, 0x03, 0x01, 0x2e, 0x11, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16];
const BODY_7BA = [0x00, 0x03, 0x06, 0x2e, 0x11, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16];
const BODY_7C5 = [0x05, 0x04, 0x19, 0x18, 0x13, 0x1a, 0x14, 0x15, 0x17, 0x16];
const BODY_7CF = [0x07, 0x04, 0x76, 0x77, 0x18, 0x13, 0x1a, 0x14, 0x15, 0x17, 0x16];
const BODY_7DA = [0x05, 0x04, 0x1c, 0x1b, 0x1d, 0x1e, 0x1f, 0x20, 0x22, 0x16];
const BODY_7E4 = [0x00, 0x02, 0x01, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x21];
const BODY_7EF = [0x00, 0x02, 0x06, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x21];
const BODY_7FA = [0x00, 0x03, 0x01, 0x2a, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x21];
const BODY_805 = [0x00, 0x03, 0x06, 0x2a, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x21];
const BODY_TILES: ReadonlyArray<ReadonlyArray<number>> = [
    BODY_799, BODY_7AF, BODY_7A4, BODY_7BA, BODY_7C5, BODY_7CF,
    BODY_7DA, BODY_7E4, BODY_7FA, BODY_7EF, BODY_805,
];

const BODY_MASK_826 = [0, 0, 0, 0x80, 0x40, 0x80, 0x20, 0x80, 0x50, 0x16, 0, 4];
const BODY_MASK_832 = [0, 0, 0, 0x80, 0x20, 0x80, 0x20, 0x80, 0x50, 0x16, 0, 4];
const BODY_MASK_83E = [0, 0, 0, 0, 0, 0x20, 0x80, 0x20, 0x90, 0x36, 0, 4];
const BODY_MASK_84A = [0, 0, 0, 0, 0, 0x20, 0x80, 0x30, 0x90, 0x36, 0, 4];
const BODY_MASK_856 = [0, 0, 8, 0x20, 0x10, 0x20, 0x10, 0, 0x18, 0x0a, 0, 4];
const BODY_MASK_862 = [8, 4, 8, 4, 8, 4, 8, 4, 0, 6, 0, 4];
const BODY_MASK_86E = [8, 2, 8, 4, 8, 4, 8, 4, 0, 6, 0, 4];
const BODY_MASKS: ReadonlyArray<ReadonlyArray<number>> = [
    BODY_MASK_826, BODY_MASK_832, BODY_MASK_826, BODY_MASK_832,
    BODY_MASK_83E, BODY_MASK_84A, BODY_MASK_856, BODY_MASK_862,
    BODY_MASK_86E, BODY_MASK_862, BODY_MASK_86E,
];

// Small fixed three-tile overlay at row 25, column 8.
const DETAIL_TILES = [0x2b, 0x2c, 0x2d];
const DETAIL_MASK = [0x80, 0x00, 0x80, 0x80];

// Motion-dependent left and right appendages.
const LIMB_889 = [0x50, 0x51, 0x52, 0x54, 0x53, 0x55];
const LIMB_88F = [0x56, 0x57, 0x58, 0x5a, 0x59, 0x5b];
const LIMB_895 = [0x5c, 0x5d, 0x5f, 0x5e, 0x60];
const LIMB_TILES: ReadonlyArray<ReadonlyArray<number>> = [LIMB_889, LIMB_88F, LIMB_895, LIMB_88F];

const LIMB_MASK_8A2 = [0x20, 0, 0x20, 0, 0xa0, 0, 0xa0];
const LIMB_MASK_8A9 = [0, 0x20, 0x20, 0, 0xa0, 0, 0xa0];
const LIMB_MASK_8B0 = [0, 0, 0x20, 0, 0xa0, 0, 0xa0];
const LIMB_MASKS: ReadonlyArray<ReadonlyArray<number>> = [LIMB_MASK_8A2, LIMB_MASK_8A9, LIMB_MASK_8B0, LIMB_MASK_8A9];

const RLIMB_8BF = [0x75, 0x62, 0x63, 0x64, 0x73, 0x65, 0x74, 0x66];
const RLIMB_8C7 = [0x75, 0x67, 0x63, 0x69, 0x73, 0x6a, 0x74, 0x68];
const RLIMB_8CF = [0x61, 0x6b, 0x6c, 0x70, 0x73, 0x71, 0x74, 0x72];
const RLIMB_TILES: ReadonlyArray<ReadonlyArray<number>> = [RLIMB_8BF, RLIMB_8C7, RLIMB_8CF, RLIMB_8C7];
const RLIMB_MASK = [0xa0, 0, 0xa0, 0, 0xa0, 0, 0xa0];

// Animation-phase overlay, selected by anim_phase & 1.
const ANIM_8E2 = [0x36, 0x35, 0x37, 0x3c, 0x30, 0x38, 0x3d, 0x31, 0x39, 0x3e, 0x32, 0x3a, 0x3b, 0x33, 0x34];
const ANIM_8F1 = [0x40, 0x41, 0x46, 0x42, 0x47, 0x4a, 0x43, 0x48, 0x4b, 0x49, 0x44, 0x45];
const ANIM_TILES: ReadonlyArray<ReadonlyArray<number>> = [ANIM_8E2, ANIM_8F1];
const ANIM_MASK_901 = [0x10, 0x40, 0x28, 0x80, 0x28, 0x80, 0x28, 0x80, 0x30, 0x80, 0x80];
const ANIM_MASK_90C = [0x10, 0, 0x28, 0, 0x58, 0, 0x58, 0x10, 0x40, 0, 0x40];
const ANIM_MASKS: ReadonlyArray<ReadonlyArray<number>> = [ANIM_MASK_901, ANIM_MASK_90C];

// Breath/flame extension for poses < 6.
const FLAME_L0 = [0x80];
const FLAME_L1 = [0x83, 0x82, 0x81];
const FLAME_L2 = [0x8a, 0x89, 0x86, 0x87, 0x85, 0x88, 0x84];
const FLAME_L3 = [0x8d, 0x8e, 0x8c, 0x8f, 0x8b, 0x81];
const FLAME_LEFT_TILES: ReadonlyArray<ReadonlyArray<number>> = [FLAME_L0, FLAME_L1, FLAME_L2, FLAME_L3];
const FLAME_LEFT_MASK0 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x80];
const FLAME_LEFT_MASK1 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10, 0, 0x40, 0x80];
const FLAME_LEFT_MASK2 = [0, 0, 0, 0, 0, 8, 0, 8, 0, 0x18, 0x20, 8, 0x80];
const FLAME_LEFT_MASK3 = [0, 0, 0, 0, 0, 8, 0, 8, 0x10, 8, 0x20, 0, 0x80];
const FLAME_LEFT_MASKS: ReadonlyArray<ReadonlyArray<number>> = [
    FLAME_LEFT_MASK0, FLAME_LEFT_MASK1, FLAME_LEFT_MASK2, FLAME_LEFT_MASK3,
];

// Breath/flame extension for poses >= 6.
const FLAME_R0 = [0x90, 0x91];
const FLAME_R1 = [0x92, 0x93, 0x94];
const FLAME_R2 = [0x95, 0x96, 0x97, 0x98, 0x96, 0x99];
const FLAME_R3 = [0x9a, 0x9b, 0x9b, 0x9c, 0x9b, 0x9d];
const FLAME_RIGHT_TILES: ReadonlyArray<ReadonlyArray<number>> = [FLAME_R0, FLAME_R1, FLAME_R2, FLAME_R3];
const FLAME_RIGHT_MASK0 = [0, 0, 0, 0, 0, 0, 0, 0, 0x20, 0x20, 0, 0, 0];
const FLAME_RIGHT_MASK1 = [0, 0, 0, 0, 0, 0x20, 0, 0x20, 0, 0x20, 0, 0, 0];
const FLAME_RIGHT_MASK2 = [0x20, 0x20, 0, 0x20, 0, 0x20, 0, 0x20, 0, 0x20, 0, 0, 0];
const FLAME_RIGHT_MASKS: ReadonlyArray<ReadonlyArray<number>> = [
    FLAME_RIGHT_MASK0, FLAME_RIGHT_MASK1, FLAME_RIGHT_MASK2, FLAME_RIGHT_MASK2,
];

const REACTION_LOW_POSE = [10, 9, 6, 3, 2, 3, 0x82];
const REACTION_HIGH_POSE = [3, 2, 3, 2, 1, 3, 0x82];

// ─── boss_state_block accessors ───

function bossStateAddr(g: Uint8Array): number {
    return memRead16(g, BOSS_STATE_PTR);
}

// Carry-style movement helpers: return 1 on success, 0 when the 14..30
// horizontal bound prevented it.
function moveBossLeft(g: Uint8Array): number {
    const b = bossStateAddr(g);
    const x = (memRead16(g, b + 0) - 1) & 0xffff;
    if (x <= 14) return 0;
    memWrite16(g, b + 0, x);
    return 1;
}

function moveBossRight(g: Uint8Array): number {
    const b = bossStateAddr(g);
    const x = (memRead16(g, b + 0) + 1) & 0xffff;
    if (x > 30) return 0;
    memWrite16(g, b + 0, x);
    return 1;
}

/** Dragon_AI_reset (drgn.c:183). */
export function dragonAiReset(): void {
    composeRow = composeCol = currentRelX = 0;
    breathActive = breathFrame = deathTimer = 0;
    activeSpriteCount = hitMonsterFlags = 0;
    pose = animPhase = motionPhase = movementAccum = 0;
    moveRightAfterHit = moveRightTicks = 0;
    breathWindup = windupBasePose = windupCounter = breathCounter = 0;
    vulnerableHit = reactionVariant = reactionIndex = reactionActive = 0;
}

/** Draw_Boss_Health equivalent. */
function drawBossHealth(g: Uint8Array): void {
    memWrite8(g, BOSS_HEALTH_REQUEST, 0xff);
}

// sub_A9B4: subtract damage (saturating), redraw health, start death at 0.
function applyDamageToBoss(g: Uint8Array, damage: number): void {
    const b = bossStateAddr(g);
    let hp = memRead16(g, b + 3);
    hp = damage > hp ? 0 : (hp - damage) & 0xffff;
    memWrite16(g, b + 3, hp);

    drawBossHealth(g);
    if (hp !== 0) return;

    deathTimer = 0;
    memWrite8(g, BOSS_BEING_HIT, 0xff);
    vulnerableHit = 0;
    reactionIndex = 0;
    breathActive = 0;
    breathWindup = 0;
}

// sub_A758: composite one sparse tile layer into layout_buffer.
function compositeLayer(tiles: ReadonlyArray<number>, masks: ReadonlyArray<number>, rows: number): void {
    let di = composeRow * 10 + composeCol;
    let t = 0;

    for (let r = 0; r < rows; r++) {
        const mask = masks[r] ?? 0;
        for (let bit = 0; bit < 8; bit++) {
            if ((mask & (0x80 >> bit)) !== 0) {
                layoutBuffer[di] = tiles[t++] ?? 0xff;
            }
            di++;
        }
        di += 2;
    }
}

// loc_A542: build the composite image, convert occupied cells into
// pseudo-monsters, optionally append the flame pseudo-monsters.
function renderDragon(g: Uint8Array): void {
    layoutBuffer.fill(0xff);

    // Main body.
    composeRow = 0;
    composeCol = 1;
    compositeLayer(BODY_TILES[pose] ?? [], BODY_MASKS[pose] ?? [], 12);

    // Phase-dependent overlay.
    composeRow = 12;
    composeCol = 0;
    {
        const idx = animPhase & 1;
        compositeLayer(ANIM_TILES[idx] ?? [], ANIM_MASKS[idx] ?? [], 11);
    }

    // Left appendage.
    composeRow = 9;
    composeCol = 6;
    {
        const idx = motionPhase & 3;
        compositeLayer(LIMB_TILES[idx] ?? [], LIMB_MASKS[idx] ?? [], 7);
    }

    // Right appendage.
    composeRow = 17;
    composeCol = 6;
    {
        const idx = motionPhase & 3;
        compositeLayer(RLIMB_TILES[idx] ?? [], RLIMB_MASK, 7);
    }

    // Fixed detail.
    composeRow = 25;
    composeCol = 8;
    compositeLayer(DETAIL_TILES, DETAIL_MASK, 4);

    activeSpriteCount = 0;
    const b = bossStateAddr(g);
    let x = memRead16(g, b + 0);
    let si = memRead16(g, MONSTERS_LIST);
    let cell = 0;

    for (let col = 0; col < 29; col++, x = (x + 1) & 0xffff, cell += 10) {
        const win = isInProximityWindow(g, x);
        currentRelX = win.xRel;
        if (!win.inside) continue;

        for (let row = 0; row < 10; row++) {
            const tile = layoutBuffer[cell + row] ?? 0xff;
            if (tile === 0xff) continue;

            memWrite16(g, si + 0, x);
            memWrite8(g, si + 2, (memRead8(g, b + 2) + row) & 0x3f);
            memWrite8(g, si + 3, currentRelX);

            let flags = (tile >> 4) & 0xff;
            if (memRead8(g, BOSS_BEING_HIT) === 0) flags |= 0x80;
            memWrite8(g, si + 4, flags);
            memWrite8(g, si + 6, tile);
            memWrite8(g, si + 5, hitMonsterFlags !== 0 ? 0x20 : 0x00);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            const oldTile = memRead8(g, di);
            memWrite8(g, di, (activeSpriteCount | 0x80) & 0xff);
            memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

            si += 16;
            activeSpriteCount++;
        }
    }

    memWrite16(g, si, 0xffff);
    if (!breathActive) return;

    let flameTiles: ReadonlyArray<number>;
    let flameMasks: ReadonlyArray<number>;
    let ft = 0;
    if (pose < 6) {
        flameTiles = FLAME_LEFT_TILES[breathFrame & 3] ?? [];
        flameMasks = FLAME_LEFT_MASKS[breathFrame & 3] ?? [];
    } else {
        flameTiles = FLAME_RIGHT_TILES[breathFrame & 3] ?? [];
        flameMasks = FLAME_RIGHT_MASKS[breathFrame & 3] ?? [];
    }

    x = (memRead16(g, b + 0) - 10) & 0xffff;
    if (pose === 5) x = (x + 4) & 0xffff;

    for (let col = 0; col < 13; col++, x = (x + 1) & 0xffff) {
        const mask = flameMasks[col] ?? 0;
        const win = isInProximityWindow(g, x);
        currentRelX = win.xRel;

        for (let row = 0; row < 8; row++) {
            if ((mask & (0x80 >> row)) === 0) continue;

            if (win.inside) {
                const tile = flameTiles[ft] ?? 0;
                memWrite16(g, si + 0, x);
                memWrite8(g, si + 2, (memRead8(g, b + 2) + row + 4) & 0x3f);
                memWrite8(g, si + 3, currentRelX);
                memWrite8(g, si + 4, ((tile >> 4) | 0x20) & 0xff);
                memWrite8(g, si + 6, tile);
                memWrite8(g, si + 5, 0);

                const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
                const oldTile = memRead8(g, di);
                memWrite8(g, di, (activeSpriteCount | 0x80) & 0xff);
                memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

                si += 16;
                activeSpriteCount++;
            }

            // The tile pointer advances for every set mask bit, including
            // columns outside the proximity window.
            ft++;
        }
    }

    memWrite16(g, si, 0xffff);
}

// loc_A9F2: flash/thrash then hold before signalling death.
function deathSequenceStep(g: Uint8Array): void {
    if (deathTimer >= 40) {
        memWrite8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    memWrite8(g, SPRITE_FLASH_FLAG, 0xff);
    deathTimer++;

    if (deathTimer < 30) {
        animPhase = (animPhase + 1) & 0xff;
        pose = (2 + (animPhase & 1)) & 0xff;
        if ((animPhase & 3) === 0) {
            memWrite8(g, SOUND_FX_REQUEST, 55);
        }
    } else {
        animPhase = 1;
        pose = 10;
    }

    renderDragon(g);
}

/** Dragon_AI (drgn.c:197) — entry point, called once per frame. */
export function dragonAi(g: Uint8Array, m: number): void {
    void m;

    const base = memRead16(g, MONSTERS_LIST);
    let si = base;
    activeSpriteCount = 0;
    hitMonsterFlags = 0;

    // Restore proximity tiles overwritten by last frame's pseudo-monsters,
    // retaining the first struck Dragon part.
    for (;;) {
        if (memRead16(g, si + 0) === 0xffff) break;

        const win = isInProximityWindow(g, memRead16(g, si + 0));
        if (win.inside) {
            memWrite8(g, si + 3, win.xRel);
            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            memWrite8(g, di, memRead8(g, PROXIMITY_LAYER2 + activeSpriteCount));

            if ((memRead8(g, si + 5) & 0x40) !== 0 && (hitMonsterFlags & 0x80) === 0) {
                let al = memRead8(g, si + 5) & 0x1f;
                // A zero low-nibble in .flags marks the vulnerable parts.
                if ((memRead8(g, si + 4) & 0x1f) === 0) al |= 0x80;
                hitMonsterFlags = al;
            }
        }

        activeSpriteCount = (activeSpriteCount + 1) & 0xff;
        si += 16;
    }

    si = base;
    memWrite16(g, si, 0xffff);

    if (hitMonsterFlags !== 0) {
        const al = hitMonsterFlags;
        const type = al & 0x1f;
        let damage = getStats(g, type);

        // stat/2; request types >= 2 lose another /4.
        damage >>= 1;
        if ((al & 0x7f) >= 2) damage >>= 2;

        if ((al & 0x80) !== 0) {
            vulnerableHit = 0xff;
            memWrite8(g, SOUND_FX_REQUEST, 52);
            damage = (damage << 1) & 0xffff;
        } else {
            moveRightAfterHit = 0xff;
            memWrite8(g, SOUND_FX_REQUEST, 53);
        }

        applyDamageToBoss(g, damage);

        if (vulnerableHit !== 0) {
            reactionVariant = pose < 6 ? 1 : 0;
            reactionIndex = 0;
            breathActive = 0;
            breathWindup = 0;
            moveRightAfterHit = 0xff;
            reactionActive = 0xff;
            moveRightTicks = 8;
        }
        vulnerableHit = 0;
    }

    if (memRead8(g, BOSS_BEING_HIT) !== 0) {
        deathSequenceStep(g);
        return;
    }

    animPhase = (animPhase + 1) & 0xff;

    if (breathActive !== 0) {
        memWrite8(g, SOUND_FX_REQUEST, 54);
        let next = (breathFrame + 1) & 0xff;
        if (next >= 4) next = 2;
        breathFrame = next;
        breathCounter++;
        if (breathCounter >= 10) breathActive = 0;
        renderDragon(g);
        return;
    }

    if (breathWindup !== 0) {
        windupCounter = (windupCounter + 1) & 0xff;
        pose = (windupBasePose + (windupCounter & 1)) & 0xff;
        if (windupCounter >= 6) {
            pose = (windupBasePose + 1) & 0xff;
            breathFrame = 0;
            breathCounter = 0;
            breathWindup = 0;
            breathActive = 0xff;
            memWrite8(g, SOUND_FX_REQUEST, 54);
        }
        renderDragon(g);
        return;
    }

    // A carry from adding 0x80 occurs every second call: horizontal
    // movement and motion_phase updates happen only on those frames.
    {
        const old = movementAccum;
        movementAccum = (movementAccum + 0x80) & 0xff;
        if (movementAccum < old) {
            if (!moveRightAfterHit) {
                if (moveBossLeft(g) !== 0) motionPhase = (motionPhase + 1) & 0xff;
            } else {
                moveRightTicks = (moveRightTicks - 1) & 0xff;
                if (moveRightTicks === 0) {
                    moveRightAfterHit = 0;
                } else {
                    moveRightAfterHit = moveBossRight(g) !== 0 ? 0xff : 0;
                    motionPhase = (motionPhase - 1) & 0xff;
                }
            }
        }
    }

    if (reactionActive !== 0) {
        const seq = reactionVariant ? REACTION_LOW_POSE : REACTION_HIGH_POSE;
        let next = seq[reactionIndex] ?? 0;
        reactionIndex = (reactionIndex + 1) & 0xff;
        if ((next & 0x80) !== 0) {
            next &= 0x7f;
            reactionActive = 0;
        }
        pose = next;
        renderDragon(g);
        return;
    }

    // 1/4 random chance to start the breath wind-up, but only from poses
    // 0, 4, or 7.
    if ((getRandom(g) & 0xc0) === 0 && (pose === 0 || pose === 4 || pose === 7)) {
        windupBasePose = pose;
        windupCounter = 0;
        breathWindup = 0xff;
        renderDragon(g);
        return;
    }

    // Select a standing pose from Dragon X relative to the viewport
    // (low-byte comparisons only, as in the original).
    {
        const x = memRead16(g, bossStateAddr(g) + 0) & 0xff;
        const left = memRead8(g, PROXIMITY_MAP_LEFT_COL);
        let edge = (left + 16) & 0xff;

        if (edge < x) {
            pose = pose < 6 ? 6 : 7;
        } else {
            edge = (edge - 5) & 0xff;
            if (edge >= x) pose = pose < 7 ? 4 : 6;
            else pose = pose < 7 ? 0 : 6;
        }
    }

    renderDragon(g);
}
