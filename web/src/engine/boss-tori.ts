/**
 * boss-tori.ts — TS port of src/tori.c (Stage 9f): "Pollo" boss AI.
 * Dive-charge attack, projectile wind-up, hit/recover bookkeeping and the
 * death sequence; each frame builds up to 9 columns × 8 rows of body-part
 * pseudo-monster sprites from pose pools consumed in shape-mask bit order
 * (the mask bytes rotate in place exactly as in the original; aliased
 * slots share one underlying array on purpose).
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import { coordsToProxAddr } from './dungeon-entities.js';
import { isInProximityWindow } from './dungeon-monsters.js';
import { getStats, getRandom } from './dungeon-combat.js';
import { addProjectileToArray } from './dungeon-projectiles.js';
import { browseProjectiles } from './dungeon-doors.js';
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
const MAP_WIDTH = 0xc002; // word
const BOSS_HEALTH_REQUEST = 0xff9f;



// ─── persistent state (byte_A78A .. byte_A79B) ───

let approachPhase = 0;        // wing-flap phase while closing/opening distance
let recentlyHitFlag = 0;
let attacking = 0;            // 0xFF while the dive-charge is in progress
let attackPhase = 0;          // 0..3 sub-phase counter
let recovering = 0;           // 0xFF while climbing back to hover height
let tickDiv3 = 0;             // 0..2 counter
let flapPhase = 0;            // generic wing-flap phase 0..3
let hitResult = 0;            // bit 0x80 heavy hit; bits 0x1F stat index
let deathTimer = 0;           // 0..0x28 during the death sequence
let hitFlashTimer = 0;
let moveTick = 0;             // distance-based movement runs every other frame
let charging = 0;             // 0xFF while winding up before a dive-charge
let windupFlaps = 0;
let deathEntryFlag = 0;       // 0xFF once death uses the "recovering" pose
let projectileCharging = 0;   // 0xFF while winding up to fire a projectile
let attackDuration = 0;       // remaining dive-charge duration

// byte_A79C: 72-byte scratch layout buffer (9 columns × 8 rows).
const BYTE_A79C = new Uint8Array(72);

/** Pollo_AI_reset (tori.c:211). */
export function polloAiReset(): void {
    approachPhase = 0;
    recentlyHitFlag = 0;
    attacking = 0;
    attackPhase = 0;
    recovering = 0;
    tickDiv3 = 0;
    flapPhase = 0;
    hitResult = 0;
    deathTimer = 0;
    hitFlashTimer = 0;
    moveTick = 0;
    charging = 0;
    windupFlaps = 0;
    deathEntryFlag = 0;
    projectileCharging = 0;
    attackDuration = 0;
}

// ─── pose tables (off_A64D / off_A6CB) ───

const POOL_0 = [0x00, 0x30];
const POOL_1 = [0x01, 0x30];
const POOL_2 = [0x80, 0x70, 0x90];
const POOL_3 = [0x71, 0x81];
const POOL_4 = [0x72, 0x82];
const POOL_5 = [0x73, 0x83];
const POOL_6 = [0x50, 0x60];
const POOL_7 = [0x51, 0x61];
const POOL_8 = [0x52, 0x62];
const POOL_9 = [0x53, 0x63];
const POOL_10 = [0x10, 0x40, 0x20];
const POOL_11 = [0x17, 0x46, 0x26];
const POOL_12 = [0x18, 0x47, 0x27];
const POOL_13 = [0x02, 0x11, 0xA0, 0xC0, 0x21, 0x41, 0xE0, 0x31, 0xB0, 0xD0];
const POOL_14 = [0x02, 0x12, 0x22, 0x42, 0xB1, 0x32, 0xA1, 0xC1, 0xD1];
const POOL_15 = [0x02, 0x33, 0xB2, 0x13, 0x43, 0xC2, 0x23, 0xA2, 0xD2];
const POOL_16 = [0x02, 0x14, 0x44, 0xC3, 0x24, 0xA3, 0xC1, 0xD1, 0x34, 0xB3];
const POOL_17 = [0x03, 0x25, 0x15, 0x35, 0xA4, 0xD3, 0x45, 0xB4, 0xE1, 0xC4];
const POOL_18 = [0x04, 0x25, 0x16, 0x35, 0xA4, 0xC5, 0x45, 0xB5, 0xD4, 0xE2];

const POSE_TILE_POOLS: ReadonlyArray<readonly number[]> = [
    POOL_0, POOL_1, POOL_2, POOL_3, POOL_4, POOL_5, POOL_6, POOL_7, POOL_8, POOL_9,
    POOL_10, POOL_11, POOL_12, POOL_13, POOL_14, POOL_15, POOL_16, POOL_17, POOL_18,
];

// pose_shape_masks[i]: 9 bytes per column, rotated in place every call.
// Several slots deliberately alias the same array — as in the original.
const MASK_A = Uint8Array.of(0, 0, 0x50, 0, 0, 0, 0, 0, 0);                 // idx 0,1
const MASK_B = Uint8Array.of(0, 0, 0, 0, 0, 0, 4, 0x0C, 0);                 // idx 2
const MASK_C = Uint8Array.of(0, 0, 0, 0, 0, 0, 4, 0, 4);                    // idx 3,4,5
const MASK_D = Uint8Array.of(0, 0, 0, 4, 4, 0, 0, 0, 0);                    // idx 6..9
const MASK_E = Uint8Array.of(0, 0, 0, 0, 0x50, 0, 0x40, 0, 0);              // idx 10
const MASK_F = Uint8Array.of(0, 0, 0, 0, 0x50, 0, 0x20, 0, 0);              // idx 11
const MASK_G = Uint8Array.of(0, 0, 0, 0, 0x50, 0x20, 0, 0, 0);              // idx 12
const MASK_H = Uint8Array.of(0x10, 0, 0x10, 0x0A, 0xA1, 0x4A, 0, 0, 0);     // idx 13
const MASK_I = Uint8Array.of(0x20, 0, 0x20, 0x54, 0, 0x55, 0, 0, 0);        // idx 14
const MASK_J = Uint8Array.of(0x10, 5, 0x10, 5, 0x10, 5, 0, 0, 0);           // idx 15
const MASK_K = Uint8Array.of(0x20, 0, 0x50, 4, 0x50, 5, 0x50, 0, 0);        // idx 16
const MASK_L = Uint8Array.of(4, 0, 0x14, 0, 0x54, 0, 0x54, 0, 0x10);        // idx 17
const MASK_M = Uint8Array.of(4, 0, 0x14, 0, 0x54, 0, 0x54, 0, 4);           // idx 18

const POSE_SHAPE_MASKS: ReadonlyArray<Uint8Array> = [
    MASK_A, MASK_A, MASK_B, MASK_C, MASK_C, MASK_C, MASK_D, MASK_D, MASK_D, MASK_D,
    MASK_E, MASK_F, MASK_G, MASK_H, MASK_I, MASK_J, MASK_K, MASK_L, MASK_M,
];

// tori_projectile_template: x_rel/y overwritten per shot.
const TORI_PROJECTILE_TEMPLATE = [
    0x00, 0x00,
    0x00, 0x00, 0x32, 0x04, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

// ─── helpers ───

// sub_A552: consume pose bytes from pool `idx` in shape-mask bit order.
function selectPose(idx: number): void {
    const pool = POSE_TILE_POOLS[idx] ?? [];
    const shape = POSE_SHAPE_MASKS[idx] ?? MASK_A;
    let src = 0;

    for (let col = 0; col < 9; col++) {
        for (let bit = 0; bit < 8; bit++) {
            const carry = ((shape[col] ?? 0) & 0x80) !== 0 ? 1 : 0;
            shape[col] = (((shape[col] ?? 0) << 1) | carry) & 0xff;
            if (carry) {
                BYTE_A79C[col * 8 + bit] = pool[src++] ?? 0;
            }
        }
    }
}

// sub_A57B: returns 1 on every 3rd call.
function tickEvery3rd(): number {
    tickDiv3++;
    if (tickDiv3 === 3) {
        tickDiv3 = 0;
        return 1;
    }
    return 0;
}

// sub_A58F: decrement boss_x guarded at min 0x0D. 1 = moved.
function moveBossXLeftMin0D(g: Uint8Array): number {
    const bossState = memRead16(g, BOSS_STATE_PTR);
    if (memRead8(g, bossState + 0) < 0x0d) return 0;
    memWrite8(g, bossState + 0, (memRead8(g, bossState + 0) - 1) & 0xff);
    return 1;
}

// sub_A59D: decrement boss_x guarded at min 0x11. 1 = moved.
function moveBossXLeftMin11(g: Uint8Array): number {
    const bossState = memRead16(g, BOSS_STATE_PTR);
    if (memRead8(g, bossState + 0) < 0x11) return 0;
    memWrite8(g, bossState + 0, (memRead8(g, bossState + 0) - 1) & 0xff);
    return 1;
}

// sub_A5AB: increment boss_x guarded at max 0x30. 1 = moved.
function moveBossXRightMax30(g: Uint8Array): number {
    const bossState = memRead16(g, BOSS_STATE_PTR);
    if (memRead8(g, bossState + 0) >= 0x30) return 0;
    memWrite8(g, bossState + 0, (memRead8(g, bossState + 0) + 1) & 0xff);
    return 1;
}

// sub_A5BA: subtract damage (clamped), redraw health bar, start death.
function applyDamageToBoss(g: Uint8Array, damage: number): void {
    const bossState = memRead16(g, BOSS_STATE_PTR);
    let hp = memRead16(g, bossState + 3) - damage; // int32 in C
    if (hp < 0) hp = 0;
    memWrite16(g, bossState + 3, hp);

    memWrite8(g, BOSS_HEALTH_REQUEST, 0xff); // Draw_Boss_Health

    if (hp !== 0) return;

    memWrite8(g, BOSS_BEING_HIT, 0xff);
    browseProjectiles(g);
    charging = 0;
    projectileCharging = 0;
    windupFlaps = 0;

    if (attacking) {
        deathTimer = 0;
        attacking = 0;
        attackPhase = 0;
        recovering = 0xff;
    }
}

// loc_A60A: death sequence — flash/flap ~0x14 frames then recover-pose.
function deathSequenceStep(g: Uint8Array): void {
    const al = deathTimer;

    if (al >= 0x28) { // death sequence finished
        memWrite8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    memWrite8(g, SPRITE_FLASH_FLAG, 0xff);
    recentlyHitFlag = 1;
    deathTimer++;

    if (al < 0x14) {
        tickEvery3rd();
        flapPhase = (flapPhase + 1) & 3;
        memWrite8(g, SOUND_FX_REQUEST, 44);
    } else {
        deathEntryFlag = 0xff;
        attackPhase = 1;
    }

    renderBossSpriteFrame(g);
}

// loc_A455: build this frame's body-part sprites into the monsters table.
function renderBossSpriteFrame(g: Uint8Array): void {
    const bossState = memRead16(g, BOSS_STATE_PTR);
    let rowBase = memRead8(g, bossState + 2); // boss_y snapshot

    BYTE_A79C.fill(0xff);

    if (deathEntryFlag || recovering) {
        selectPose(0x11 + (attackPhase & 1));
    } else if (attacking) {
        selectPose(0x0d + (attackPhase & 3));
        rowBase = (rowBase + (attackPhase & 1)) & 0xff;
    } else {
        selectPose(recentlyHitFlag);
        selectPose((approachPhase + 6) & 0xff);
        selectPose((tickDiv3 + 0x0a) & 0xff);
        selectPose((flapPhase + 2) & 0xff);
    }

    let di = memRead16(g, MONSTERS_LIST);
    let colx = memRead16(g, bossState + 0); // boss_x
    let segCount = 0;

    for (let col = 0; col < 9; col++) {
        const win = isInProximityWindow(g, colx);
        if (win.inside) {
            for (let row = 0; row < 8; row++) {
                const v = BYTE_A79C[col * 8 + row] ?? 0xff;
                if (v !== 0xff) {
                    memWrite16(g, di + 0, colx);                              // .currX
                    memWrite8(g, di + 2, (rowBase + row) & 0x3f);             // .currY
                    memWrite8(g, di + 3, win.xRel);                           // .m_x_rel
                    memWrite8(g, di + 4, (v >> 4) & 0x0f);                    // .flags <- pose high nibble
                    memWrite8(g, di + 6, v);                                  // .anim_counter <- whole pose
                    memWrite8(g, di + 5, hitResult ? 0x20 : 0x00);            // .ai_flags

                    const mapOff = coordsToProxAddr(g, memRead8(g, di + 3), memRead8(g, di + 2));
                    const oldTile = memRead8(g, mapOff);
                    memWrite8(g, mapOff, (segCount | 0x80) & 0xff);
                    memWrite8(g, PROXIMITY_LAYER2 + segCount, oldTile);

                    di += 16;
                    segCount++;
                }
            }
        }
        colx = (colx + 1) & 0xffff;
    }

    memWrite16(g, di, 0xffff); // terminator after the last segment
}

/** Pollo_AI (tori.c:235) — entry point, called once per frame. */
export function polloAi(g: Uint8Array, m: number): void {
    void m;
    const base = memRead16(g, MONSTERS_LIST);

    // Walk last frame's body-part entries, restore proximity tiles and
    // pick the highest-priority hit this frame.
    hitResult = 0;
    {
        let si = base;
        let idx = 0;

        while (memRead16(g, si) !== 0xffff) { // .currX sentinel
            const win = isInProximityWindow(g, memRead16(g, si + 0));
            if (win.inside) {
                memWrite8(g, si + 3, win.xRel); // .m_x_rel

                const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
                memWrite8(g, di, memRead8(g, PROXIMITY_LAYER2 + idx));

                if ((memRead8(g, si + 5) & 0x40) !== 0 && !(hitResult & 0x80)) {
                    let al = memRead8(g, si + 5) & 0x1f;
                    if (memRead8(g, si + 4) === 0) al |= 0x80; // heavy/priority part
                    hitResult = al;
                }
            }

            idx++;
            si += 16;
        }
    }

    memWrite16(g, base, 0xffff); // reset the table; render repopulates it below

    // Apply damage for this frame's hit, if any.
    if (hitResult !== 0) {
        const al = hitResult;
        const stat = getStats(g, al & 0x1f);
        let damage = (stat << 1) & 0xffff; // bx = stat*2
        if ((al & 0x80) !== 0) damage = (damage << 2) & 0xffff; // heavy: stat*8

        memWrite8(g, SOUND_FX_REQUEST, 41);
        applyDamageToBoss(g, damage);

        if (attacking) {
            attacking = 0;
            attackPhase = 0;
            recovering = 0xff;
        } else {
            moveBossXRightMax30(g);
        }
        hitFlashTimer = 4;
    }

    // Recently-hit flash-flag bookkeeping.
    recentlyHitFlag = 0;
    if (hitFlashTimer !== 0) {
        hitFlashTimer--;
        recentlyHitFlag = 1;
    }

    const bossState = memRead16(g, BOSS_STATE_PTR);

    // Dive-charge attack in progress.
    if (attacking) {
        if (memRead8(g, bossState + 2) !== 0x0e) memWrite8(g, bossState + 2, (memRead8(g, bossState + 2) - 1) & 0xff);

        attackPhase = (attackPhase + 1) & 3;
        if (attackPhase === 2) memWrite8(g, SOUND_FX_REQUEST, 43);

        let cancel = 1;
        if (moveBossXLeftMin11(g) !== 0) {
            if (attackDuration !== 0) {
                attackDuration--;
                cancel = hitResult !== 0 ? 1 : 0; // hit mid-attack cancels early
            }
        }
        if (cancel) {
            attacking = 0;
            attackPhase = 0;
            recovering = 0xff;
            memWrite8(g, SOUND_FX_REQUEST, 42);
        }
        renderBossSpriteFrame(g);
        return;
    }

    // Recovering back to hover height after an attack.
    if (recovering) {
        if (attackPhase === 1) {
            recovering = 0;
        } else {
            attackPhase = 1;
            if (memRead8(g, bossState + 2) !== 0x12) {
                memWrite8(g, bossState + 2, (memRead8(g, bossState + 2) + 1) & 0xff);
                attackPhase = 0;
                moveBossXLeftMin0D(g);
            }
        }
        renderBossSpriteFrame(g);
        return;
    }

    // Winding up wing-flaps before a dive-charge attack.
    if (charging) {
        flapPhase = (flapPhase + 1) & 3;
        if (!tickEvery3rd()) {
            renderBossSpriteFrame(g);
            return;
        }
        if (windupFlaps < 4) {
            windupFlaps++;
            memWrite8(g, SOUND_FX_REQUEST, 42);
            hitFlashTimer = 4;
        } else {
            charging = 0;
            attackPhase = 0;
            attacking = 0xff;
            attackDuration = 0x0f;
        }
        renderBossSpriteFrame(g);
        return;
    }

    // Winding up to fire a projectile.
    if (projectileCharging) {
        if (!tickEvery3rd()) {
            renderBossSpriteFrame(g);
            return;
        }
        if (windupFlaps < 2) {
            windupFlaps++;
            memWrite8(g, SOUND_FX_REQUEST, 42);
            hitFlashTimer = 2;
        } else {
            const win = isInProximityWindow(g, (memRead16(g, bossState + 0) + 4) & 0xffff);
            TORI_PROJECTILE_TEMPLATE[0] = win.xRel;
            TORI_PROJECTILE_TEMPLATE[1] = (memRead8(g, bossState + 2) + 4) & 0x3f;
            addProjectileToArray(g, TORI_PROJECTILE_TEMPLATE);
            projectileCharging = 0;
        }
        renderBossSpriteFrame(g);
        return;
    }

    // Death sequence takes over once the boss has been struck to 0 HP.
    if (memRead8(g, BOSS_BEING_HIT) !== 0) {
        deathSequenceStep(g);
        return;
    }

    // Idle movement / attack-decision logic.
    flapPhase = (flapPhase + 1) & 3;

    if (hitResult !== 0 && memRead8(g, bossState + 0) >= 0x14) {
        charging = 0xff;
        windupFlaps = 0;
    }

    if (!charging) {
        if ((getRandom(g) & 0x0f) === 0) {
            projectileCharging = 0xff;
            windupFlaps = 0;
        }
    }

    moveTick++;
    if (moveTick & 1) { // movement only runs every other frame
        renderBossSpriteFrame(g);
        return;
    }

    let heroCol = (memRead8(g, PROXIMITY_MAP_LEFT_COL) + memRead8(g, HERO_X_VIEW)) & 0xff;
    const mapWidth = memRead16(g, MAP_WIDTH);
    if (heroCol >= mapWidth) heroCol -= mapWidth;

    const bl = (memRead8(g, bossState + 0) - heroCol) & 0xff;

    if (bl > 0x0c) {
        // Boss far ahead of the hero: flap toward closing the gap.
        approachPhase = (approachPhase + 1) & 3;
        moveBossXLeftMin0D(g);
        // falls through to the random charge-trigger check
    } else if (bl < 0x0c) {
        // Too close: back away.
        approachPhase = (approachPhase - 1) & 3;
        if (moveBossXRightMax30(g) === 0) {
            charging = 0xff;
            windupFlaps = 0;
        }
        renderBossSpriteFrame(g);
        return;
    }
    // bl == 0x0C falls through to the random charge-trigger check.

    if ((getRandom(g) & 0x1f) !== 0) {
        renderBossSpriteFrame(g);
        return;
    }
    charging = 0xff;
    windupFlaps = 0;

    renderBossSpriteFrame(g);
}
