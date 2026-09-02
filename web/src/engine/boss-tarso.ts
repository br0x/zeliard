/**
 * boss-tarso.ts — TS port of src/lega.c (Stage 9g): "Tarso" ("Lega")
 * boss AI. A walker that advances left through an 8-step animation
 * (stepping on specific frames), retreats right after being hit while
 * far left, and fires an arcing projectile via a charge state machine;
 * renders an 8×10 tile buffer from layout/shape mask pairs (shape masks
 * rotate in place; slots 8/9 deliberately alias one array), patches head
 * tiles, and appends its live projectile sprite to the monsters table.
 *
 * Ported 1:1; carry conventions as in eai1.ts — note boss_move_left/
 * right here return values stored DIRECTLY into back_flag (0xFF =
 * walled / moved, respectively), unlike other bosses' helpers.
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
const BOSS_HEALTH_REQUEST = 0xff9f;



// ─── persistent state ───

let activeSpriteCount = 0;
let hitSegment = 0;        // ai_flags&0x1F of the last hit found this frame
let deathTimer = 0;
let animStep = 0;
let headAnim = 0;
let walkCycle = 0;
let colRelX = 0;
let backFlag = 0;
let backTimer = 0;
let chargeFlag = 0;
let chargeSubstep = 0;
let projectileFlag = 0;
let projectileX = 0;       // word
let projectileY = 0;
let projectileAnim = 0;
let projectileCounter = 0;
let projectileDone = 0;

// ─── AI helper tables ───

// byte_A41B
const WALK_CYCLE_TO_HEAD_ANIM = [0, 1, 2, 1];
// byte_A41F: animation steps that trigger left movement
const LEFT_MOVE_STEPS = [2, 5, 6, 7, 0];
// byte_A424: animation steps used by the backward/right movement loop
const RIGHT_MOVE_STEPS = [1, 3, 6, 7, 7];
// byte_A69B: death thrash animation steps
const DEATH_THRASH_STEPS = [0, 1, 2, 3, 6, 7, 6, 3, 2, 1];
// byte_A6BC: reachable only in a near-dead path; kept for fidelity
const DEATH_HEAD_ANIM_TABLE = [3, 3, 4, 4, 5, 5];

// Projectile velocity table (byte_A5D8/A5D9 pairs); each byte added to
// the low byte of X / to Y as an unsigned byte add (0xFF acts as -1).
const PROJECTILE_VEL_TABLE = [
    0xFF, 0x00,
    0xFF, 0x00,
    0xFF, 0x01,
    0x00, 0x02,
    0xFF, 0x02,
    0x00, 0x02,
    0xFF, 0x02,
    0xFF, 0xFE,
    0xFF, 0x00,
    0xFF, 0x02,
    0xFF, 0xFF,
    0xFF, 0x00,
    0xFF, 0x01,
    0xFF, 0x00,
    0xFF, 0x00,
    0xFF, 0x00,
    0xFF, 0x00,
];

// ─── body layout tables (off_A6C8) ───

const LAYOUT_A6DC = [0x11, 0x10, 0x12, 0x13, 0x14, 0x15, 0x16];
const LAYOUT_A6E3 = [0x11, 0x17, 0x19, 0x10, 0x12, 0x18, 0x1A, 0x1B, 0x1C];
const LAYOUT_A6EC = [0x1D, 0x1F, 0x21, 0x23, 0x10, 0x1E, 0x20, 0x22, 0x24, 0x25];
const LAYOUT_A6F6 = [0x29, 0x2A, 0x27, 0x26, 0x28, 0x10, 0x1E, 0x20, 0x22, 0x24, 0x25];
const LAYOUT_A701 = [0x32, 0x30, 0x2D, 0x31, 0x2B, 0x2E, 0x10, 0x1E, 0x20, 0x2C, 0x2F];
const LAYOUT_A70C = [0x3D, 0x3A, 0x3C, 0x3B, 0x33, 0x10, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];
const LAYOUT_A718 = [0x42, 0x43, 0x40, 0x44, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46];
const LAYOUT_A722 = [0x58, 0x59, 0x5A, 0x4F, 0x50, 0x52, 0x54, 0x56, 0x51, 0x53, 0x55, 0x57];
const LAYOUT_A72E = [0xCA, 0x42, 0x47, 0x40, 0x48, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46];
const LAYOUT_A739 = [0xCE, 0x42, 0x4D, 0x40, 0x4C, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46];

const LAYOUT_TABLES: ReadonlyArray<readonly number[]> = [
    LAYOUT_A6DC, LAYOUT_A6E3, LAYOUT_A6EC, LAYOUT_A6F6, LAYOUT_A701,
    LAYOUT_A70C, LAYOUT_A718, LAYOUT_A722, LAYOUT_A72E, LAYOUT_A739,
];

// ─── body shape/mask tables (off_A744) ───
// Mutated in place (`rol byte ptr [bp],1`). Slots 8/9 deliberately alias.

const SHAPE_A758 = Uint8Array.of(0x00, 0x00, 0x00, 0x00, 0x20, 0xAB, 0x01, 0x00);
const SHAPE_A760 = Uint8Array.of(0x00, 0x00, 0x00, 0x00, 0x2C, 0xAD, 0x01, 0x00);
const SHAPE_A768 = Uint8Array.of(0x00, 0x00, 0x00, 0x00, 0x2B, 0x80, 0x2B, 0x01);
const SHAPE_A770 = Uint8Array.of(0x00, 0x00, 0x05, 0x10, 0x28, 0x80, 0x2B, 0x01);
const SHAPE_A778 = Uint8Array.of(0x08, 0x04, 0x18, 0x00, 0x28, 0x80, 0x2B, 0x00);
const SHAPE_A780 = Uint8Array.of(0x00, 0x02, 0x14, 0x10, 0x20, 0xA8, 0x0C, 0x03);
const SHAPE_A788 = Uint8Array.of(0x00, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01);
const SHAPE_A790 = Uint8Array.of(0x00, 0x00, 0x00, 0x00, 0x0B, 0xAB, 0x53, 0x00);
const SHAPE_A798 = Uint8Array.of(0x01, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01);

const SHAPE_TABLES: ReadonlyArray<Uint8Array> = [
    SHAPE_A758, SHAPE_A760, SHAPE_A768, SHAPE_A770, SHAPE_A778,
    SHAPE_A780, SHAPE_A788, SHAPE_A790, SHAPE_A798,
    SHAPE_A798, // deliberate alias, matches original
];

// Initial contents for reset, matching a fresh overlay load.
const SHAPE_INIT: ReadonlyArray<readonly number[]> = [
    [0x00, 0x00, 0x00, 0x00, 0x20, 0xAB, 0x01, 0x00],
    [0x00, 0x00, 0x00, 0x00, 0x2C, 0xAD, 0x01, 0x00],
    [0x00, 0x00, 0x00, 0x00, 0x2B, 0x80, 0x2B, 0x01],
    [0x00, 0x00, 0x05, 0x10, 0x28, 0x80, 0x2B, 0x01],
    [0x08, 0x04, 0x18, 0x00, 0x28, 0x80, 0x2B, 0x00],
    [0x00, 0x02, 0x14, 0x10, 0x20, 0xA8, 0x0C, 0x03],
    [0x00, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01],
    [0x00, 0x00, 0x00, 0x00, 0x0B, 0xAB, 0x53, 0x00],
    [0x01, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01],
    [0x01, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01],
];

// ─── small helpers ───

// `repne scasb` against a small byte table; nonzero if present.
function byteInTable(tbl: ReadonlyArray<number>, n: number, val: number): number {
    for (let i = 0; i < n; i++) {
        if ((tbl[i] ?? 0) === val) return 1;
    }
    return 0;
}

// sub_A429: move one pixel left; stores 0xFF into back_flag at x <= 0x0E.
function bossMoveLeft(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    const ax = (memRead16(g, bs + 0) - 1) & 0xffff;
    memWrite16(g, bs + 0, ax);
    return ax <= 0x0e ? 0xff : 0x00;
}

// sub_A43B: move one pixel right if within x <= 50; back_flag gets 0xFF
// on success, 0 when blocked (caller does cmc; sbb al,al).
function bossMoveRight(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    const ax = (memRead16(g, bs + 0) + 1) & 0xffff;
    if (ax <= 50) {
        memWrite16(g, bs + 0, ax);
        return 0xff;
    }
    return 0x00;
}

// ─── damage / death (sub_A644) ───

function applyDamageToBoss(g: Uint8Array, damage: number): void {
    const bs = memRead16(g, BOSS_STATE_PTR);
    let hp = memRead16(g, bs + 3);

    if (hp > damage) {
        hp = (hp - damage) & 0xffff;
    } else {
        hp = 0;
    }

    memWrite16(g, bs + 3, hp);
    memWrite8(g, BOSS_HEALTH_REQUEST, 0xff); // Draw_Boss_Health

    if (hp !== 0) return;

    // Unlike tako.c, no boss_being_hit guard: HP already zero restarts
    // the death timer. Matches sub_A644 exactly.
    deathTimer = 0;
    projectileFlag = 0;
    memWrite8(g, BOSS_BEING_HIT, 0xff);
}

// loc_A66E: death sequence.
function deathSequenceStep(g: Uint8Array): void {
    if (deathTimer >= 40) {
        memWrite8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    memWrite8(g, SPRITE_FLASH_FLAG, 0xff);
    deathTimer++;

    if (deathTimer < 10) {
        const al = DEATH_THRASH_STEPS[deathTimer] ?? 0;
        animStep = al;

        if (al >= 3) {
            memWrite8(g, SOUND_FX_REQUEST, 51);
        }

        updateWalkCycleAndRender(g); // original jumps to loc_A39F here
    } else {
        let al: number;
        // Only reached with death_timer >= 10, so al effectively always
        // becomes 6; table lookup preserved for structural fidelity.
        if (deathTimer < 6) {
            al = DEATH_HEAD_ANIM_TABLE[deathTimer] ?? 0;
        } else {
            al = 6;
        }

        headAnim = al;
        renderBodyAndProjectile(g);
    }
}

// ─── projectile state machine (loc_A553 continuation) ───

function updateProjectile(g: Uint8Array): void {
    if (!projectileFlag) return;

    if (!projectileDone) {
        // If the projectile reached the left side, switch to ending anim.
        if ((projectileX & 0xff) < 18) {
            projectileDone = 0xff;
            projectileAnim = 3;
            memWrite8(g, SOUND_FX_REQUEST, 66);
            return;
        }

        let idx = projectileCounter;
        // The original counter freezes at 0x10; clamp is safety only.
        if (idx > 16) idx = 16;

        const dx = PROJECTILE_VEL_TABLE[idx * 2 + 0] ?? 0;
        const dy = PROJECTILE_VEL_TABLE[idx * 2 + 1] ?? 0;

        // Adds dx to the LOW BYTE of projectile_x only.
        projectileX = (projectileX & 0xff00) | (((projectileX & 0xff) + dx) & 0xff);
        projectileY = (projectileY + dy) & 0xff;

        if (projectileCounter < 16) {
            projectileCounter++;
        }

        // Sprite frame cycles 0..2.
        projectileAnim++;
        if (projectileAnim >= 3) {
            projectileAnim = 0;
        }

        if (
            projectileCounter === 9 ||
            projectileCounter === 12 ||
            projectileCounter === 15
        ) {
            memWrite8(g, SOUND_FX_REQUEST, 49);
        }
    } else {
        // Ending animation; holds a few frames then clears the flag.
        projectileAnim++;
        if (projectileAnim >= 6) {
            projectileFlag = 0;
        }
    }
}

// ─── movement / animation state machines ───

// loc_A2DA: normal left-moving animation path (back_flag == 0).
function normalLeftMovement(g: Uint8Array): void {
    backTimer = 0x3c;

    animStep = (animStep + 1) & 7;

    const al = animStep;

    if (byteInTable(LEFT_MOVE_STEPS, 5, al) !== 0) {
        backFlag = bossMoveLeft(g);

        if (al === 7) {
            backFlag = bossMoveLeft(g);
        }
    }
}

// loc_A316: backward/right movement path.
function backRightMovement(g: Uint8Array): void {
    const t = (backTimer - 1) & 0xff;
    backTimer = t;

    if (t === 0) {
        backFlag = 0;
        return;
    }

    // Original loops back to loc_A323 for table values 1 and 7.
    for (;;) {
        let al = animStep;

        if (al === 0) al = 8;
        if (al === 6) al = (al - 2) & 0xff;

        al = (al - 1) & 0xff;
        animStep = al;

        if (byteInTable(RIGHT_MOVE_STEPS, 5, al) === 0) {
            return;
        }

        backFlag = bossMoveRight(g);

        if (al === 6) {
            backFlag = bossMoveRight(g);
            return;
        }

        if (al === 3) {
            backFlag = bossMoveRight(g);
            return;
        }

        // cmp al,3 / jnz loc_A323: values 1 and 7 repeat the loop.
        if (al !== 1 && al !== 7) {
            return;
        }
    }
}

// loc_A35F: possibly start the charge/projectile attack.
function maybeStartCharge(g: Uint8Array): void {
    if (backFlag) return;
    if (animStep !== 6) return;
    if ((getRandom(g) & 1) !== 0) return;
    if (projectileFlag) return;

    const bs = memRead16(g, BOSS_STATE_PTR);
    // mov ax, boss_x / sub ax, 20 / jb loc_A39F
    if (memRead16(g, bs + 0) < 20) return;

    chargeFlag = 0xff;
    chargeSubstep = 0;
    // byte_A7BE = 0 written in the original but never read by the AI.

    animStep = 8;
    memWrite8(g, SOUND_FX_REQUEST, 48);
}

// loc_A3B5: charge attack state machine.
function chargeStateMachine(g: Uint8Array): void {
    chargeSubstep++;

    switch ((chargeSubstep - 1) & 0xff) {
        case 0: {
            headAnim = 6;
            animStep = 8;
            projectileFlag = 0xff;

            const bs = memRead16(g, BOSS_STATE_PTR);
            projectileX = (memRead16(g, bs + 0) + 4) & 0xffff;
            projectileY = memRead8(g, bs + 2) & 0x3f;

            projectileAnim = 0;
            projectileCounter = 0;
            projectileDone = 0;

            renderBodyAndProjectile(g);
            return;
        }
        case 1:
            headAnim = 7;
            animStep = 6;
            renderBodyAndProjectile(g);
            return;
        case 2:
            headAnim = 0;
            chargeFlag = 0;
            animStep = 6;
            renderBodyAndProjectile(g);
            return;
        default:
            // The original switch has three cases and clears charge_flag
            // in case 2, so this is unreachable; keep rendering safe.
            renderBodyAndProjectile(g);
            return;
    }
}

// loc_A39F: update head/walk cycle, then render.
function updateWalkCycleAndRender(g: Uint8Array): void {
    walkCycle = (walkCycle + 1) & 3;
    headAnim = WALK_CYCLE_TO_HEAD_ANIM[walkCycle] ?? 0;

    renderBodyAndProjectile(g);
}

// ─── rendering (loc_A44C .. end) ───

function renderBodyAndProjectile(g: Uint8Array): void {
    const buffer = new Uint8Array(80).fill(0xff);

    const tableIdx = animStep;

    const layout = LAYOUT_TABLES[tableIdx] ?? LAYOUT_A6DC;
    const shape = SHAPE_TABLES[tableIdx] ?? SHAPE_A758;

    // Copy layout tiles into buffer rows 2..9 (copy starts at offset +2;
    // each column occupies 10 bytes, +2 padding between columns).
    let layoutPos = 0;
    let di = 2;

    for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 8; row++) {
            const carry = ((shape[col] ?? 0) & 0x80) !== 0 ? 1 : 0;

            // rol byte ptr [bp],1
            shape[col] = (((shape[col] ?? 0) << 1) | carry) & 0xff;

            if (carry) {
                buffer[di] = layout[layoutPos++] ?? 0xff;
            }

            di++;
        }

        di += 2; // padding between columns
    }

    // Patch head tiles. First write at offset 0x28 (+1 when anim_step is
    // 6 or >= 8), second at first_write_offset + 20.
    let al = (headAnim << 1) & 0xff;
    let headDi = 0x28;

    if (animStep === 6 || animStep >= 8) {
        headDi++;
    }

    buffer[headDi] = al;
    headDi += 20;
    al = (al + 1) & 0xff;
    buffer[headDi] = al;

    // Convert buffer cells into pseudo-monster entries.
    activeSpriteCount = 0;

    const base = memRead16(g, MONSTERS_LIST);
    let si = base;

    const bs = memRead16(g, BOSS_STATE_PTR);
    let colX = memRead16(g, bs + 0);
    const bossY = memRead8(g, bs + 2);

    let bufIdx = 0;

    for (let col = 0; col < 8; col++) {
        const win = isInProximityWindow(g, colX);

        if (win.inside) {
            colRelX = win.xRel;

            for (let row = 0; row < 10; row++) {
                const tile = buffer[bufIdx + row] ?? 0xff;

                if (tile === 0xff) continue;

                memWrite16(g, si + 0, colX);                          // .currX
                memWrite8(g, si + 2, (bossY + row) & 0x3f);           // .currY
                memWrite8(g, si + 3, colRelX);                        // .m_x_rel
                memWrite8(g, si + 6, tile);                           // .anim_counter

                // Flags packing: bit0x80 -> 0x60, plus (tile >> 4) & 7.
                let flags = 0;
                if ((tile & 0x80) !== 0) {
                    flags |= 0x60;
                }
                flags = (flags | ((tile >> 4) & 7)) & 0xff;

                memWrite8(g, si + 4, flags);
                memWrite8(g, si + 5, hitSegment !== 0 ? 0x20 : 0x00);

                const diAddr = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
                const oldTile = memRead8(g, diAddr);
                memWrite8(g, diAddr, (activeSpriteCount | 0x80) & 0xff);
                memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

                si += 16;
                activeSpriteCount++;
            }
        }

        colX = (colX + 1) & 0xffff;
        bufIdx += 10;
    }

    // sub_A5FA: append the live projectile sprite, if visible.
    if (projectileFlag) {
        const win = isInProximityWindow(g, projectileX);

        if (win.inside) {
            memWrite16(g, si + 0, projectileX);       // .currX
            memWrite8(g, si + 2, projectileY);        // .currY
            memWrite8(g, si + 3, win.xRel);           // .m_x_rel
            memWrite8(g, si + 4, 0x26);               // .flags
            memWrite8(g, si + 5, 0x00);               // .ai_flags
            memWrite8(g, si + 6, projectileAnim);     // .anim_counter

            const diAddr = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            const oldTile = memRead8(g, diAddr);
            memWrite8(g, diAddr, (activeSpriteCount | 0x80) & 0xff);
            memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

            si += 16;
            activeSpriteCount++;
        }
    }

    memWrite16(g, si, 0xffff);

    // Projectile movement happens after the sprite table is finalized.
    updateProjectile(g);
}

/** Tarso_AI_reset (lega.c:903) — also restores mutable shape masks. */
export function tarsoAiReset(): void {
    activeSpriteCount = 0;
    hitSegment = 0;
    deathTimer = 0;
    animStep = 0;
    headAnim = 0;
    walkCycle = 0;
    colRelX = 0;
    backFlag = 0;
    backTimer = 0;
    chargeFlag = 0;
    chargeSubstep = 0;
    projectileFlag = 0;
    projectileX = 0;
    projectileY = 0;
    projectileAnim = 0;
    projectileCounter = 0;
    projectileDone = 0;

    // Restore mutable shape masks (fresh overlay load). Slot 9 aliases
    // slot 8's array; both initial rows agree, so double-writing is fine.
    for (let i = 0; i < 10; i++) {
        const shape = SHAPE_TABLES[i]!;
        const init = SHAPE_INIT[i]!;
        for (let j = 0; j < 8; j++) {
            shape[j] = init[j]!;
        }
    }
}

/** Tarso_AI (lega.c:938; original Lega_AI_proc) — entry point. */
export function tarsoAi(g: Uint8Array, m: number): void {
    void m;

    const base = memRead16(g, MONSTERS_LIST);
    let si = base;

    activeSpriteCount = 0;
    hitSegment = 0;

    // Walk last frame's pseudo-monster entries: restore proximity tiles,
    // pick up hits. Unlike tako.c, EVERY hit overwrites hit_segment.
    for (;;) {
        if (memRead16(g, si + 0) === 0xffff) break; // .currX sentinel

        const win = isInProximityWindow(g, memRead16(g, si + 0));
        if (win.inside) {
            memWrite8(g, si + 3, win.xRel);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            memWrite8(g, di, memRead8(g, PROXIMITY_LAYER2 + activeSpriteCount));

            if ((memRead8(g, si + 5) & 0x40) !== 0) {
                hitSegment = memRead8(g, si + 5) & 0x1f;
            }
        }

        activeSpriteCount++;
        si += 16;
    }

    // Reset the sprite table; render_body_and_projectile() repopulates it.
    si = base;
    memWrite16(g, si, 0xffff);

    // Process hit, if any. Damage: 1 → double, 9 → normal, else stat/8.
    if (hitSegment !== 0) {
        const stat = getStats(g, hitSegment);
        let damage = stat;

        if (hitSegment === 1) {
            damage = (damage << 1) & 0xffff;
        } else if (hitSegment !== 9) {
            damage = (damage >> 3) & 0xffff;
        }

        applyDamageToBoss(g, damage);

        memWrite8(g, SOUND_FX_REQUEST, 47);

        // Hit while fairly far left → start the backward/recover state.
        const bs = memRead16(g, BOSS_STATE_PTR);
        if ((memRead16(g, bs + 0) & 0xff) < 0x2f) {
            backTimer = 0x14;
            backFlag = 0xff;
        }
    }

    // Death sequence has priority over normal AI.
    if (memRead8(g, BOSS_BEING_HIT) !== 0) {
        deathSequenceStep(g);
        return;
    }

    // Charge state machine has priority over normal movement.
    if (chargeFlag) {
        chargeStateMachine(g);
        return;
    }

    // Skip normal movement while the projectile attack is in its early
    // phase; continue to common animation/rendering either way.
    if (!(projectileFlag !== 0 && projectileCounter < 0x0d)) {
        if (!backFlag) {
            normalLeftMovement(g);
        } else {
            backRightMovement(g);
        }
    }

    // Common: maybe start charge, update head anim, render.
    maybeStartCharge(g);
    updateWalkCycleAndRender(g);
}
