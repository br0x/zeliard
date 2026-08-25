/**
 * boss-tako.ts — TS port of src/tako.c (Stage 9f): "Pulpo" boss AI.
 * Lays out up to 7 tentacle columns × 8 rows of hittable pseudo-monster
 * segments (tile/anim pairs consumed from the layout tables in shape-mask
 * bit order), plus the ink-droplet volley spawner, retract/flinch flourish
 * and death sequence. The shape-mask bytes are rotated in place exactly as
 * in the original; several of the 32 table slots deliberately alias the
 * same underlying array — that aliasing is preserved on purpose.
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import { coordsToProxAddr } from './dungeon-entities.js';
import { isInProximityWindow } from './dungeon-monsters.js';
import { getStats } from './dungeon-combat.js';

// g_mem addresses
const MONSTERS_LIST = 0xc010; // word
const PROXIMITY_LAYER2 = 0xed20;
const BOSS_STATE_PTR = 0xa002; // word
const BOSS_BEING_HIT = 0xff2e;
const BOSS_IS_DEAD = 0xff30;
const SPRITE_FLASH_FLAG = 0xff2f;
const SOUND_FX_REQUEST = 0xff75;
const BOSS_HEALTH_REQUEST = 0xff9f;

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

// ─── persistent state (byte_AA9A .. byte_AAA1) ───

let activeSpriteCount = 0;      // monsters-table write cursor this frame
let hitMonsterFlags = 0;        // bit 7 heavy segment; bits 4-0 stat index
let colRelX = 0;                // proximity-relative X of current column
let tentacleAnimStep = 0;       // cycles 0..7
let animGroupOffset = 0;        // 0 / 8 / 16 — never decreases
let retractState = 0;           // bit 0x10 flinch active; low nibble counter
let inkSquirtState = 0;         // bit 0x80 volley; 0x40 windup; 0x20 toggle
let deathTimer = 0;             // 0..40 during the death sequence
let inkTargetX = 0;             // world X column of the current volley
let inkTargetY = 0;             // world Y row of the current volley

/** Pulpo_AI_reset (tako.c:210). */
export function pulpoAiReset(): void {
    activeSpriteCount = 0;
    hitMonsterFlags = 0;
    colRelX = 0;
    tentacleAnimStep = 0;
    animGroupOffset = 0;
    retractState = 0;
    inkSquirtState = 0;
    deathTimer = 0;
    inkTargetX = 0;
    inkTargetY = 0;
}

// ─── tentacle layout tables (tile, anim_counter pairs), byte_A5BD.. ───

const LAYOUT_A5BD = [0,0, 0,1, 0,2, 0,3, 0,4, 0,5, 15,0, 0,6, 0,7, 0,8, 0,10, 0,11, 0,12, 0,13, 0,14, 0,15, 1,0, 1,1, 1,2];
const LAYOUT_A5E3 = [1,14, 1,15, 2,0, 2,1, 2,2, 15,1, 0,6, 1,5, 0,8, 1,6, 1,7, 0,12, 1,8, 1,9, 0,15, 1,3, 1,1, 1,2];
const LAYOUT_A607 = [2,3, 2,4, 2,5, 2,6, 15,2, 0,9, 2,7, 0,8, 1,6, 1,7, 0,12, 0,13, 0,14, 0,15, 1,3, 1,4, 1,2];
const LAYOUT_A629 = [2,8, 2,9, 2,10, 2,11, 2,6, 15,3, 0,9, 2,12, 0,8, 0,10, 0,11, 0,12, 1,8, 1,9, 0,15, 1,0, 1,4, 1,2];
const LAYOUT_A64D = [2,13, 2,14, 2,15, 3,0, 2,6, 15,4, 0,6, 2,12, 0,8, 1,12, 1,13, 0,12, 1,10, 1,11, 0,15, 1,0, 1,1, 1,2];
const LAYOUT_A671 = [3,1, 3,2, 3,3, 3,4, 2,6, 15,5, 0,6, 2,7, 0,8, 1,6, 1,7, 0,12, 1,8, 1,9, 0,15, 1,3, 1,1, 1,2];
const LAYOUT_A695 = [3,5, 3,6, 3,7, 3,8, 2,6, 15,6, 0,9, 2,7, 0,8, 1,6, 1,7, 0,12, 0,13, 0,14, 0,15, 1,3, 1,4, 1,2];
const LAYOUT_A6B9 = [3,9, 3,10, 14,1, 3,12, 2,2, 15,7, 0,9, 0,7, 0,8, 0,10, 0,11, 0,12, 1,8, 1,9, 0,15, 1,0, 1,4, 1,2];
const LAYOUT_A6DD = [0,0, 0,1, 5,6, 3,13, 3,14, 15,8, 0,6, 0,7, 0,8, 0,10, 0,11, 0,12, 0,13, 0,14, 0,15, 1,0, 1,1, 1,2];
const LAYOUT_A701 = [1,14, 3,15, 2,0, 4,0, 4,1, 15,9, 0,6, 1,5, 0,8, 1,6, 1,7, 0,12, 1,8, 1,9, 0,15, 1,3, 1,1, 1,2];
const LAYOUT_A725 = [2,3, 4,2, 4,3, 2,6, 15,10, 0,9, 2,7, 0,8, 1,6, 1,7, 0,12, 0,13, 0,14, 0,15, 1,3, 1,4, 1,2];
const LAYOUT_A747 = [4,4, 4,5, 2,6, 15,11, 0,9, 2,12, 0,8, 0,10, 0,11, 0,12, 1,8, 1,9, 0,15, 1,0, 1,4, 1,2];
const LAYOUT_A767 = [2,14, 4,6, 2,6, 15,12, 0,6, 2,12, 0,8, 1,12, 1,13, 0,12, 1,10, 1,11, 0,15, 1,0, 1,1, 1,2];
const LAYOUT_A787 = [3,1, 4,7, 3,3, 4,8, 2,6, 15,13, 0,6, 2,7, 0,8, 1,6, 1,7, 0,12, 1,8, 1,9, 0,15, 1,3, 1,1, 1,2];
const LAYOUT_A7AB = [3,5, 3,7, 4,9, 2,6, 15,14, 0,9, 2,7, 0,8, 1,6, 1,7, 0,12, 0,13, 0,14, 0,15, 1,3, 1,4, 1,2];
const LAYOUT_A7CD = [3,9, 14,1, 4,10, 4,11, 15,15, 0,9, 0,7, 0,8, 0,10, 0,11, 0,12, 1,8, 1,9, 0,15, 1,0, 1,4, 1,2];
const LAYOUT_A7EF = [4,12, 14,0, 0,6, 0,7, 0,8, 0,10, 0,11, 0,12, 0,13, 0,14, 0,15, 1,0, 1,1, 1,2];
const LAYOUT_A80B = [4,11, 14,0, 0,6, 1,5, 0,8, 1,6, 1,7, 0,12, 1,8, 1,9, 0,15, 1,3, 1,1, 1,2];
const LAYOUT_A827 = [4,13, 14,0, 0,9, 2,7, 0,8, 1,6, 1,7, 0,12, 0,13, 0,14, 0,15, 1,3, 1,4, 1,2];
const LAYOUT_A843 = [4,13, 14,0, 0,9, 2,12, 0,8, 0,10, 0,11, 0,12, 1,8, 1,9, 0,15, 1,0, 1,4, 1,2];
const LAYOUT_A85F = [4,13, 14,0, 0,6, 2,12, 0,8, 1,12, 1,13, 0,12, 1,10, 1,11, 0,15, 1,0, 1,1, 1,2];
const LAYOUT_A87B = [4,13, 14,0, 0,6, 2,7, 0,8, 1,6, 1,7, 0,12, 1,8, 1,9, 0,15, 1,3, 1,1, 1,2];
const LAYOUT_A897 = [4,13, 14,0, 0,9, 2,7, 0,8, 1,6, 1,7, 0,12, 0,13, 0,14, 0,15, 1,3, 1,4, 1,2];
const LAYOUT_A8B3 = [4,11, 14,0, 0,9, 0,7, 0,8, 0,10, 0,11, 0,12, 1,8, 1,9, 0,15, 1,0, 1,4, 1,2];
const LAYOUT_A8CF = [4,14, 3,11, 0,6, 4,15, 5,0, 0,10, 0,11, 0,12, 0,13, 0,14, 0,15, 1,0, 1,1, 1,2];
const LAYOUT_A8EB = [5,1, 3,11, 0,6, 5,2, 5,0, 1,6, 1,7, 0,12, 1,8, 1,9, 0,15, 1,3, 1,1, 1,2];
const LAYOUT_A907 = [5,3, 3,11, 0,9, 5,4, 5,0, 1,6, 1,7, 0,12, 0,13, 0,14, 0,15, 1,3, 1,4, 1,2];
const LAYOUT_A923 = [5,3, 3,11, 0,9, 5,5, 5,0, 0,10, 0,11, 0,12, 1,8, 1,9, 0,15, 1,0, 1,4, 1,2];
const LAYOUT_A93F = [5,3, 3,11, 0,6, 5,5, 5,0, 1,12, 1,13, 0,12, 1,10, 1,11, 0,15, 1,0, 1,1, 1,2];
const LAYOUT_A95B = [5,3, 3,11, 0,6, 5,4, 5,0, 1,6, 1,7, 0,12, 1,8, 1,9, 0,15, 1,3, 1,1, 1,2];
const LAYOUT_A977 = [5,3, 3,11, 0,9, 5,4, 5,0, 1,6, 1,7, 0,12, 0,13, 0,14, 0,15, 1,3, 1,4, 1,2];
const LAYOUT_A993 = [5,1, 3,11, 0,9, 4,15, 5,0, 0,10, 0,11, 0,12, 1,8, 1,9, 0,15, 1,0, 1,4, 1,2];

// ─── tentacle row-visibility bitmasks (rotated in place every frame;
// each byte does a full 8-rotation pass per call so its value is restored
// by the time the call returns). ───

const SHAPE_A9EF = Uint8Array.of(0xE0, 0x60, 0x60, 0xE0, 0xE0, 0xE0, 0xE0);
const SHAPE_A9F6 = Uint8Array.of(0x60, 0x60, 0x60, 0xE0, 0xE0, 0xE0, 0xE0);
const SHAPE_A9FD = Uint8Array.of(0x60, 0x20, 0x60, 0xE0, 0xE0, 0xE0, 0xE0);
const SHAPE_AA04 = Uint8Array.of(0xC0, 0x60, 0x60, 0xE0, 0xE0, 0xE0, 0xE0);
const SHAPE_AA0B = Uint8Array.of(0x20, 0x20, 0x60, 0xE0, 0xE0, 0xE0, 0xE0);
const SHAPE_AA12 = Uint8Array.of(0x40, 0x60, 0x60, 0xE0, 0xE0, 0xE0, 0xE0);
const SHAPE_AA19 = Uint8Array.of(0x00, 0x00, 0x60, 0xE0, 0xE0, 0xE0, 0xE0);

const TENTACLE_LAYOUT_TABLES: ReadonlyArray<readonly number[]> = [
    LAYOUT_A5BD, LAYOUT_A5E3, LAYOUT_A607, LAYOUT_A629,
    LAYOUT_A64D, LAYOUT_A671, LAYOUT_A695, LAYOUT_A6B9,
    LAYOUT_A6DD, LAYOUT_A701, LAYOUT_A725, LAYOUT_A747,
    LAYOUT_A767, LAYOUT_A787, LAYOUT_A7AB, LAYOUT_A7CD,
    LAYOUT_A7EF, LAYOUT_A80B, LAYOUT_A827, LAYOUT_A843,
    LAYOUT_A85F, LAYOUT_A87B, LAYOUT_A897, LAYOUT_A8B3,
    LAYOUT_A8CF, LAYOUT_A8EB, LAYOUT_A907, LAYOUT_A923,
    LAYOUT_A93F, LAYOUT_A95B, LAYOUT_A977, LAYOUT_A993,
];

// Deliberately aliased in several slots — matches the original data layout.
const TENTACLE_SHAPE_TABLES: ReadonlyArray<Uint8Array> = [
    SHAPE_A9EF, SHAPE_A9F6, SHAPE_A9FD, SHAPE_A9F6,
    SHAPE_A9F6, SHAPE_A9F6, SHAPE_A9F6, SHAPE_A9F6,
    SHAPE_AA04, SHAPE_A9F6, SHAPE_A9FD, SHAPE_AA0B,
    SHAPE_AA0B, SHAPE_A9F6, SHAPE_AA12, SHAPE_AA12,
    SHAPE_AA19, SHAPE_AA19, SHAPE_AA19, SHAPE_AA19,
    SHAPE_AA19, SHAPE_AA19, SHAPE_AA19, SHAPE_AA19,
    SHAPE_AA19, SHAPE_AA19, SHAPE_AA19, SHAPE_AA19,
    SHAPE_AA19, SHAPE_AA19, SHAPE_AA19, SHAPE_AA19,
];

// Ink-droplet volley countdown table (byte_AA20): 24 rows × 4 columns.
const INK_SPAWN_COUNTDOWN_TABLE = [
    0,0,0,0, 1,0,0,0, 2,0,0,0, 2,0,3,0, 2,0,3,0, 2,0,3,0,
    2,0,3,0, 2,0,3,0, 2,0,3,0, 2,0,3,0, 2,0,3,0, 2,0,3,0,
    2,0,3,0, 2,0,3,0, 2,0,3,0, 2,0,3,0, 2,0,4,0, 3,0,0,4,
    3,0,0,0, 5,0,0,0, 0,6,
];

// ─── helpers ───

// sub_A503: subtract damage (clamped at 0), redraw health bar, start the
// death sequence the first time HP reaches 0.
function applyDamageToBoss(g: Uint8Array, damage: number): void {
    const bossState = g16(g, BOSS_STATE_PTR);
    let hp = (g16(g, bossState + 3) - damage) << 16 >> 16; // int16_t
    if (hp < 0) hp = 0;
    s16(g, bossState + 3, hp);

    s8(g, BOSS_HEALTH_REQUEST, 0xff); // Draw_Boss_Health

    if (g16(g, bossState + 3) !== 0) return;
    if (g8(g, BOSS_BEING_HIT) !== 0) return; // death sequence already started

    deathTimer = 0;
    s8(g, BOSS_BEING_HIT, 0xff);
}

// loc_A530: death sequence — thrash ~32 frames, hold ~8 more.
function deathSequenceStep(g: Uint8Array): void {
    inkSquirtState = 0;

    if (deathTimer >= 40) { // 0x28: death sequence finished
        s8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    s8(g, SPRITE_FLASH_FLAG, 0xff);

    let dl: number;
    if (deathTimer < 32) { // 0x20: violent thrash phase
        deathTimer++;
        tentacleAnimStep = (tentacleAnimStep + 1) & 7;
        dl = (((deathTimer & 1) << 3) + animGroupOffset) & 0xff;
        s8(g, SOUND_FX_REQUEST, 40);
    } else { // slow-down phase
        deathTimer++;
        dl = (animGroupOffset + 8) & 0xff;
    }

    renderTentaclesAndInk(g, dl);
}

// loc_A3E3..loc_A4FE: lay out tentacle segments and spawn ink droplets.
function renderTentaclesAndInk(g: Uint8Array, dl: number): void {
    activeSpriteCount = 0;

    const tableIdx = (tentacleAnimStep + dl) & 0xff;
    const layoutFull = TENTACLE_LAYOUT_TABLES[tableIdx] ?? [];
    const shapeTable = TENTACLE_SHAPE_TABLES[tableIdx] ?? SHAPE_A9EF;
    let layoutIdx = 0;

    const base = g16(g, MONSTERS_LIST);
    let si = base;
    const bossState = g16(g, BOSS_STATE_PTR);
    let colX = g16(g, bossState + 0); // .boss_x

    for (let col = 0; col < 7; col++) {
        const win = isInProximityWindow(g, colX);
        colRelX = win.xRel;

        const shape = shapeTable.subarray(col, col + 1); // aliasing preserved

        if (!win.inside) {
            // Out of view: still rotate through this column's 8 row-bits
            // and advance the layout pointer for every set bit.
            for (let row = 0; row < 8; row++) {
                const carry = ((shape[0] ?? 0) & 0x80) !== 0 ? 1 : 0;
                shape[0] = (((shape[0] ?? 0) << 1) | carry) & 0xff;
                if (carry) layoutIdx += 2;
            }
        } else {
            for (let row = 0; row < 8; row++) {
                const carry = ((shape[0] ?? 0) & 0x80) !== 0 ? 1 : 0;
                shape[0] = (((shape[0] ?? 0) << 1) | carry) & 0xff;
                if (carry) {
                    s16(g, si + 0, colX);                                          // .currX
                    s8(g, si + 2, ((row * 2) + g8(g, bossState + 2)) & 0x3f);      // .currY
                    s8(g, si + 3, colRelX);                                        // .m_x_rel
                    s8(g, si + 4, layoutFull[layoutIdx] ?? 0);                     // .flags <- tile idx
                    s8(g, si + 6, layoutFull[layoutIdx + 1] ?? 0);                 // .anim_counter
                    s8(g, si + 5, hitMonsterFlags !== 0 ? 0x20 : 0x00);            // .ai_flags

                    const di = coordsToProxAddr(g, g8(g, si + 3), g8(g, si + 2));
                    const oldTile = g8(g, di);
                    s8(g, di, (activeSpriteCount | 0x80) & 0xff);
                    s8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

                    si += 16;
                    layoutIdx += 2;
                    activeSpriteCount++;
                }
            }
        }

        colX = (colX + 2) & 0xffff;
    }

    s16(g, si, 0xffff); // terminator after the last tentacle segment

    // --- loc_A492: ink-droplet volley spawn continuation ---
    if ((inkSquirtState & 0x80) !== 0) {
        const rowIndex = ((inkSquirtState & 0x1f) - 1) & 0xff;
        let x = inkTargetX;

        for (let i = 0; i < 4; i++, x = (x + 1) & 0xffff) {
            const countdown = INK_SPAWN_COUNTDOWN_TABLE[rowIndex * 4 + i] ?? 0;
            const win = isInProximityWindow(g, x);
            if (!win.inside) continue;

            const remaining = countdown;
            if (remaining === 0) continue;

            s16(g, si + 0, x);                       // .currX
            s8(g, si + 2, inkTargetY);               // .currY
            s8(g, si + 3, win.xRel);                 // .m_x_rel
            s8(g, si + 4, 0x30);                     // .flags: ink droplet
            s8(g, si + 6, (remaining - 1) & 0xff);   // .anim_counter
            s8(g, si + 5, 0);                        // .ai_flags

            const di = coordsToProxAddr(g, g8(g, si + 3), g8(g, si + 2));
            const oldTile = g8(g, di);
            s8(g, di, (activeSpriteCount | 0x80) & 0xff);
            s8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

            si += 16;
            activeSpriteCount++;
        }
    }

    s16(g, si, 0xffff);
}

/** Pulpo_AI (tako.c:227) — entry point, called once per frame. */
export function pulpoAi(g: Uint8Array, m: number): void {
    void m;
    const base = g16(g, MONSTERS_LIST);
    let si = base;
    activeSpriteCount = 0;
    hitMonsterFlags = 0;

    // Walk last frame's tentacle-segment pseudo-monster entries: restore
    // proximity tiles and pick up hits (first one only).
    for (;;) {
        if (g16(g, si + 0) === 0xffff) break; // .currX sentinel

        const win = isInProximityWindow(g, g16(g, si + 0));
        if (win.inside) {
            s8(g, si + 3, win.xRel); // .m_x_rel

            const di = coordsToProxAddr(g, g8(g, si + 3), g8(g, si + 2));
            s8(g, di, g8(g, PROXIMITY_LAYER2 + activeSpriteCount));

            if ((g8(g, si + 5) & 0x40) !== 0) { // struck this frame
                if (!(hitMonsterFlags & 0x80)) { // first hit only
                    let al = g8(g, si + 5) & 0x1f;
                    if (g8(g, si + 4) >= 0x0e) al |= 0x80; // vulnerable segment
                    hitMonsterFlags = al;
                }
            }
        }

        activeSpriteCount++;
        si += 16;
    }

    // Reset the sprite table; render_tentacles_and_ink() repopulates it.
    si = base;
    s16(g, si, 0xffff);

    if (hitMonsterFlags !== 0) {
        const al = hitMonsterFlags;
        const stat = getStats(g, al & 0x1f);
        let damage = (stat << 1) & 0xffff; // bx = stat*2

        if ((al & 0x80) !== 0) {
            s8(g, SOUND_FX_REQUEST, 36);
            damage = (damage << 1) & 0xffff; // vulnerable: stat*4 total
        } else {
            s8(g, SOUND_FX_REQUEST, 37);
        }

        applyDamageToBoss(g, damage);

        // First two hits after entering a new "provoked" phase step the
        // animation-table group forward (0 -> 8 -> 16) and kick off the
        // retract/flinch flourish.
        if (!(retractState & 0x10) && animGroupOffset !== 0x10) {
            animGroupOffset += 8;
            retractState = 0x10;
            inkSquirtState |= 0x20;
            s8(g, SOUND_FX_REQUEST, 38);
        }
    }

    if (g8(g, BOSS_BEING_HIT) !== 0) {
        deathSequenceStep(g);
        return;
    }

    // --- normal animation, flinch bookkeeping, ink-squirt state machine ---
    tentacleAnimStep = (tentacleAnimStep + 1) & 7;

    let dl = animGroupOffset;

    if ((retractState & 0x10) !== 0) {
        retractState ^= 0x20;
        if (!(retractState & 0x20)) dl -= 8;

        const hi = retractState & 0xf0;
        const lo = (retractState + 1) & 0x0f;
        retractState = hi | lo;
        if (lo === 0) {
            retractState &= 0xef;
            inkSquirtState &= 0xdf;
        }
    }

    if (dl === 0x10) {
        if ((inkSquirtState & 0x40) !== 0) {
            const ah0 = (0x20 ^ inkSquirtState) & 0xff;
            const al = (ah0 + 1) & 3;
            const ah = ((ah0 & 0xe0) | al) & 0xff;
            inkSquirtState = ah;
            if (al === 0) {
                inkSquirtState = 0xa0;
                const bossState = g16(g, BOSS_STATE_PTR);
                inkTargetX = (g16(g, bossState + 0) + 4) & 0xffff;          // .boss_x + 4
                inkTargetY = (g8(g, bossState + 2) + 4) & 0x3f;             // .boss_y + 4
                s8(g, SOUND_FX_REQUEST, 39);
            }
        }

        if (!(inkSquirtState & 0xa0) && !(retractState & 0x10)) {
            inkSquirtState |= 0x40; // begin the arm wind-up
        }

        if (!(inkSquirtState & 0x20)) dl += 8;

        if ((inkSquirtState & 0x80) !== 0) {
            const ah = (inkSquirtState + 1) & 0x1f;
            inkSquirtState = ((inkSquirtState & 0xe0) | ah) & 0xff;
            inkTargetX = (inkTargetX - 1) & 0xffff;
            if (ah === 0x19) {
                inkSquirtState = 0; // volley finished
            }
        }
    }

    renderTentaclesAndInk(g, dl & 0xff);
}
