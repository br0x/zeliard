/**
 * dungeon-projectiles.ts — TS port of dungeon.c's enemy-projectile
 * collision/movement pipeline (Stage 8d, slice 5).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - projectiles_collision_processing       (5912)
 *   - sub_846F                               (5952) per-projectile collision
 *   - check_tile/row helpers + funcs_85B9 / funcs_857D tables
 *   - projectile_advance_position            (6153)
 *   - projectile_read_curved_path_step       (6174)
 * plus gfmcga.c Render_Sword_Overlay (357) — observable state is only the
 * movement-phase advance and swing-flag termination.
 *
 * Enemy projectile records are 13 bytes at ADDR_PROJECTILES_LIST:
 *   +0 x_rel, +1 y_rel, +2 ?, +3 trajectory_step_count,
 *   +4 max_step_count, +5 trajectory_dir (bits0-2 dir, bit3 ?, bit6 curved),
 *   +6 damage, +7 vram word d (bit15 = pending), +9 curved path ptr (word)
 */

import { damageHero } from './dungeon-damage.js';
import { coordsToProxAddr, lookupShared } from './dungeon-entities.js';

const PROJECTILE_STRUCT_SIZE = 13;

// g_mem addresses
const VIEWPORT_TOP_ROW = 0x82;
const HERO_XV = 0x83;
const HERO_HEAD_Y_VIEW = 0x84;
const SHIELD_TYPE = 0x93;
const FACING = 0xc2;
const SQUAT_FLAG = 0xff38;
const ON_ROPE_FLAGS = 0xff39;
const HERO_DAMAGE_THIS_FRAME = 0xff36;
const SWORD_SWING_FLAG = 0xff43;
const SWORD_HIT_TYPE = 0xff45;
const SWORD_MOVEMENT_PHASE = 0xff46;
const SOUND_FX_REQUEST = 0xff75;
const KNOCKBACK_VECTOR = 0x9f0e; // 4 bytes (two words)
const BYTE_9F14 = 0x9f14;
const LAST_PROJECTILE_INDEX = 0x9f1f;
const PROJECTILES_LIST = 0xeb80;

const SHIELD_HONOR = 4;

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

// ─── sword overlay (gfmcga.c:357 — VRAM parts are JS-side stubs) ───

export function renderSwordOverlay(g: Uint8Array): void {
    if (g8(g, SWORD_SWING_FLAG) === 0) return;

    const phase = (g8(g, SWORD_MOVEMENT_PHASE) + 1) & 0xff;
    s8(g, SWORD_MOVEMENT_PHASE, phase);
    const hitType = g8(g, SWORD_HIT_TYPE);

    // forward: phases 1..6; overhead/downward: phases 1..4
    if ((hitType === 0 && phase >= 7) || (hitType !== 0 && phase >= 5)) {
        s8(g, SWORD_SWING_FLAG, 0);
    }
}

// ─── trajectory movement ───

function incX(g: Uint8Array, p: number): void { s8(g, p, (g8(g, p) + 1) & 0xff); }
function decX(g: Uint8Array, p: number): void { s8(g, p, (g8(g, p) - 1) & 0xff); }
function incY(g: Uint8Array, p: number): void { s8(g, p + 1, (g8(g, p + 1) + 1) & 0xff); }
function decY(g: Uint8Array, p: number): void { s8(g, p + 1, (g8(g, p + 1) - 1) & 0xff); }
// fallthrough reuse mirrors the original (incX_decY falls into incX)
function incXDecY(g: Uint8Array, p: number): void { decY(g, p); incX(g, p); }
function decXDecY(g: Uint8Array, p: number): void { decY(g, p); decX(g, p); }
function incXIncY(g: Uint8Array, p: number): void { incY(g, p); incX(g, p); }
function decXIncY(g: Uint8Array, p: number): void { incY(g, p); decX(g, p); }

const FUNCS_85B9: Array<(g: Uint8Array, p: number) => void> = [
    incX, incXDecY, decY, decXDecY, decX, decXIncY, incY, incXIncY,
];

/** projectile_read_curved_path_step (dungeon.c:6174). */
export function readCurvedPathStep(g: Uint8Array, p: number): boolean {
    const step = g8(g, p + 3);
    const path = g16(g, p + 9);
    let al = g8(g, path + step);

    if (al === 0xff) {
        s8(g, p + 128, 0); // why 128? (asm-faithful)
        return false;
    }

    al &= 7;
    s8(g, p + 5, (g8(g, p + 5) & 0xf8) | al);
    return true;
}

/** projectile_advance_position (dungeon.c:6153). */
export function projectileAdvancePosition(g: Uint8Array, p: number): void {
    if ((g8(g, p + 5) & 0x40) !== 0) {
        if (!readCurvedPathStep(g, p)) return; // curved path exhausted
    }

    const dir = g8(g, p + 5) & 7;
    FUNCS_85B9[dir]!(g, p);
    s8(g, p + 1, g8(g, p + 1) & 0x3f);
}

// ─── hero-row checks ───

function checkYEqProjectileRow(g: Uint8Array, p: number, al: number): boolean {
    return al === g8(g, p + 1);
}

function checkPrevYEqProjectileRow(g: Uint8Array, p: number, al: number): boolean {
    al = (al - 1) & 0x3f;
    return checkYEqProjectileRow(g, p, al);
}

function checkNextYEqProjectileRow(g: Uint8Array, p: number, al: number): boolean {
    al = (al + 1) & 0x3f;
    return checkYEqProjectileRow(g, p, al);
}

const FUNCS_857D: Array<(g: Uint8Array, p: number, al: number) => boolean> = [
    checkYEqProjectileRow,
    checkPrevYEqProjectileRow,
    checkPrevYEqProjectileRow,
    checkPrevYEqProjectileRow,
    checkYEqProjectileRow,
    checkNextYEqProjectileRow,
    checkNextYEqProjectileRow,
    checkNextYEqProjectileRow,
];

/** projectile_y_vs_hero_row_dispatch (dungeon.c:6147). */
export function projectileYVsHeroRowDispatch(g: Uint8Array, p: number, al: number): boolean {
    const dir = g8(g, p + 5) & 7;
    al &= 0x3f;
    return FUNCS_857D[dir]!(g, p, al);
}

// ─── per-projectile collision (sub_846F, dungeon.c:5952) ───

/** is_blocking_tile_extended (dungeon.c:1475). */
function isBlockingTileExtended(g: Uint8Array, tile: number): number {
    if (tile < 0x49) return lookupShared(g, tile);
    return 0;
}

export function projectileCollisionStep(g: Uint8Array, p: number): void {
    projectileAdvancePosition(g, p);

    const dirByte = g8(g, p + 5);

    if ((dirByte & 0x08) === 0) {
        if (g8(g, p) === 0) return; // .p_x_rel

        // static-tile collision check
        {
            const y = g8(g, p + 1);
            const x = g8(g, p);
            const cell = coordsToProxAddr(g, x, y);
            const tile = g8(g, cell);

            if (isBlockingTileExtended(g, tile) !== 0) {
                s8(g, p, 0);
                return;
            }
        }
    }

    // loc_8490: does the projectile's row line up with the hero band?
    let rowMatch = false;
    {
        let al = (g8(g, VIEWPORT_TOP_ROW) + g8(g, HERO_HEAD_Y_VIEW)) & 0xff;

        if (g8(g, SQUAT_FLAG) === 0) {
            al &= 0x3f;
            if (al === g8(g, p + 1)) {
                rowMatch = true;
            }
        }

        if (!rowMatch) {
            for (let cx = 2; cx > 0; cx--) {
                al = (al + 1) & 0x3f;
                if (al === g8(g, p + 1)) {
                    rowMatch = true;
                    break;
                }
            }
        }
    }
    if (!rowMatch) return;

    // loc_84B4: does the projectile's column line up with the hero?
    {
        let al = (g8(g, HERO_XV) + 4) & 0xff;
        if ((g8(g, FACING) & 1) !== 0) al++;
        if (al !== g8(g, p)) {
            al = (al + 1) & 0xff;
            if (al !== g8(g, p)) return; // column mismatch: no hit
        }
    }

    hitConfirmed(g, p);
}

/** loc_84CD: hit confirmed — projectile is consumed either way. */
function hitConfirmed(g: Uint8Array, p: number): void {
    // projectile is consumed either way
    s8(g, p, 0);

    if (
        g8(g, SHIELD_TYPE) !== 0 &&
        g8(g, SWORD_SWING_FLAG) === 0 &&
        g8(g, ON_ROPE_FLAGS) === 0
    ) {
        const dir = g8(g, p + 5) & 7;

        if (dir !== 2 && dir !== 6) {
            if (dir === 0 || dir === 1 || dir === 7) {
                if ((g8(g, FACING) & 1) !== 0) {
                    shieldBlockCheck(g, p);
                    return;
                }
                // not shielded from this direction → damage
            } else {
                // dir == 3, 4, or 5
                if ((g8(g, FACING) & 1) === 0) {
                    shieldBlockCheck(g, p);
                    return;
                }
                // not shielded from this direction → damage
            }
        }
    }

    applyDamageAndKnockback(g, p);
}

/** loc_854F: shield may block depending on tier and hero row. */
function shieldBlockCheck(g: Uint8Array, p: number): void {
    if (g8(g, SHIELD_TYPE) >= SHIELD_HONOR) {
        blockedByShield(g);
        return;
    }

    let al = (g8(g, VIEWPORT_TOP_ROW) + g8(g, HERO_HEAD_Y_VIEW)) & 0xff;
    al++;
    if (g8(g, SQUAT_FLAG) !== 0) al++;

    if (!projectileYVsHeroRowDispatch(g, p, al)) {
        applyDamageAndKnockback(g, p); // row mismatch: shield didn't intercept
        return;
    }

    blockedByShield(g);
}

function blockedByShield(g: Uint8Array): void {
    s8(g, SOUND_FX_REQUEST, 10);
}

/** loc_850E: apply damage + knockback direction. */
function applyDamageAndKnockback(g: Uint8Array, p: number): void {
    const damage = g8(g, p + 6) & 0xffff;
    damageHero(g, damage);

    s8(g, SOUND_FX_REQUEST, 9);
    s8(g, BYTE_9F14, 0xff);
    s8(g, HERO_DAMAGE_THIS_FRAME, 0xff);

    let bx = 0xffff;
    let cx = 0xffff;

    const dir = g8(g, p + 5) & 7;
    if (dir !== 2 && dir !== 6) {
        bx = 0;
        if (!(dir === 0 || dir === 1 || dir === 7)) {
            const tmp = cx;
            cx = bx;
            bx = tmp;
        }
    }

    s16(g, KNOCKBACK_VECTOR, cx); // ADDR_KNOCKBACK_VECTOR_9F0E
    s16(g, KNOCKBACK_VECTOR + 2, bx); // ADDR_KNOCKBACK_VECTOR_9F10
}

// ─── list processing (dungeon.c:5912) ───

/**
 * projectiles_collision_processing: walk the active-projectile list, run
 * collision handling per entry, and compact in place.
 */
export function projectilesCollisionProcessing(g: Uint8Array): void {
    let read = PROJECTILES_LIST;
    let write = PROJECTILES_LIST;

    s8(g, LAST_PROJECTILE_INDEX, 0);

    for (;;) {
        const x = g8(g, read);

        const needsProcessing =
            x !== 0 || (g16(g, read + 7) & 0x8000) !== 0;

        if (!needsProcessing) {
            read += PROJECTILE_STRUCT_SIZE; // drop this slot
            continue;
        }

        if (x === 0xff) {
            // finalize the compacted list right at the write cursor
            s8(g, write, 0xff);
            return;
        }

        s8(g, read + 3, (g8(g, read + 3) + 1) & 0xff); // step count++
        projectileCollisionStep(g, read);

        // rep movsb 13 bytes
        for (let i = 0; i < PROJECTILE_STRUCT_SIZE; i++) {
            g[(write + i) & 0xffff] = g[(read + i) & 0xffff] ?? 0;
        }

        if ((g8(g, write + 5) & 0x40) === 0) {
            if (g8(g, write + 3) >= g8(g, write + 4)) {
                s8(g, write, 0); // .p_x_rel
            }
        }

        s8(g, LAST_PROJECTILE_INDEX, (g8(g, LAST_PROJECTILE_INDEX) + 1) & 0xff);
        write += PROJECTILE_STRUCT_SIZE;
        read += PROJECTILE_STRUCT_SIZE;
    }
}
