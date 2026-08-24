/**
 * dungeon-spells.ts — TS port of dungeon.c's magic-projectile movement
 * family (Stage 8d, slice 4).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - Dispatch_Spell_Projectile_Movement    (6461)
 *   - espada_move / saeta_move / fuego_move /
 *     rascar_move / agua_move               (6490..6600)
 *   - projectile_step_x_by_direction        (6608)
 *   - advance_projectile_anim_frame         (6622)
 *   - projectile_step_and_animate           (6630)
 *   - despawn_projectile_slots              (6640)
 *   - monster_is_in_spawn_range_and_clear   (6655)
 *   - mark_proximity_monster_as_spell_target(6690)
 *
 * Magic projectile records are 16 bytes at ADDR_MAGIC_PROJECTILES:
 *   +0 x_rel (word), +2 y_rel, +3 dir, +4 life_timer,
 *   +5 anim_frame, +8..15 vram tile words (unused by movement).
 */

import {
    coordsToProxAddr,
    isBlockingTile,
    wrapMapFromAbove,
    wrapMapFromBelow,
} from './dungeon-entities.js';
import { isInProximityWindow } from './dungeon-monsters.js';
import { getDstMonsterFlags } from './dungeon-hero.js';

const PROX_COLS = 36;
const MAGIC_PROJECTILE_STRIDE = 0x10;

// g_mem addresses
const MAP_WIDTH = 0xc002; // word
const CURRENT_MAGIC_SPELL = 0x9d;
const BYTE_9F2A = 0x9f2a;
const IS_BOSS_CAVERN = 0xff34;
const BOSS_BEING_HIT = 0xff2e;
const BYTE_FF3E = 0xff3e;
const MAGIC_PROJECTILES = 0xeb15;

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

// mp field accessors
function mpXRel(g: Uint8Array, si: number): number {
    return g16(g, si);
}
function mpSetXRel(g: Uint8Array, si: number, v: number): void {
    s16(g, si, v);
}
function mpYRel(g: Uint8Array, si: number): number {
    return g8(g, si + 2);
}
function mpDir(g: Uint8Array, si: number): number {
    return g8(g, si + 3);
}
function mpLifeTimer(g: Uint8Array, si: number): number {
    return g8(g, si + 4);
}
function mpAnimFrame(g: Uint8Array, si: number): number {
    return g8(g, si + 5);
}

/** Dispatch_Spell_Projectile_Movement (dungeon.c:6461). */
export function dispatchSpellProjectileMovement(g: Uint8Array): void {
    if (g8(g, BYTE_FF3E) === 0) return;

    const si = MAGIC_PROJECTILES;
    const spell = (g8(g, CURRENT_MAGIC_SPELL) - 1) & 0xff; // 0..6

    switch (spell) {
        case 0: espadaMove(g, si); break;
        case 1: saetaMove(g, si); break;
        case 2: fuegoMove(g, si); break;
        case 3: saetaMove(g, si); break; // lanzar reuses saeta's movement
        case 4: rascarMove(g, si); break;
        case 5: aguaMove(g, si); break;
        case 6: /* guerra: no per-frame movement */ break;
    }
}

/** espada_move (dungeon.c:6490). */
export function espadaMove(g: Uint8Array, si: number): void {
    if ((mpDir(g, si) & 0x80) !== 0) {
        despawnProjectileSlots(g, si, 1);
        return;
    }

    const life = (mpLifeTimer(g, si) + 1) & 0xff;
    s8(g, si + 4, life); // C increments before the expiry check
    if (life >= 5) {
        despawnProjectileSlots(g, si, 1);
        return;
    }

    projectileStepAndAnimate(g, si);

    if (monsterIsInSpawnRangeAndClear(g, si)) {
        s8(g, si + 3, mpDir(g, si) | 0x80); // hit: mark for despawn next tick
    }
}

/** saeta_move (dungeon.c:6507). */
export function saetaMove(g: Uint8Array, si: number): void {
    const life = (mpLifeTimer(g, si) + 1) & 0xff;
    s8(g, si + 4, life);
    if (life >= 10) {
        despawnProjectileSlots(g, si, 1);
        return;
    }

    projectileStepAndAnimate(g, si);
    monsterIsInSpawnRangeAndClear(g, si);
}

/** fuego_move (dungeon.c:6527). */
export function fuegoMove(g: Uint8Array, si: number): void {
    const life = (mpLifeTimer(g, si) + 1) & 0xff;
    s8(g, si + 4, life);
    if (life >= 12) {
        despawnProjectileSlots(g, si, 1);
        return;
    }

    if (life < 4) {
        // still horizontal phase, no animation change yet
        projectileStepXByDirection(g, si);
        monsterIsInSpawnRangeAndClear(g, si);
        return;
    }
    // life = 4..11
    s8(g, si + 5, ((mpAnimFrame(g, si) & 3) + 1) & 0xff);

    // condition always true here (literal assembly translation)
    {
        const prox = isInProximityWindow(g, mpXRel(g, si));
        if (prox.inside && prox.xRel < 33) {
            let di = wrapMapFromAbove(
                (coordsToProxAddr(g, prox.xRel, mpYRel(g, si)) + 2 * PROX_COLS) & 0xffff,
            );

            if (!isBlockingTile(g, g8(g, di)) && !isBlockingTile(g, g8(g, di + 1))) {
                s8(g, si + 2, (mpYRel(g, si) + 1) & 0x3f);
            }
        }
    }

    monsterIsInSpawnRangeAndClear(g, si);
}

/** rascar_move (dungeon.c:6561): advances all 4 beam slots each frame. */
export function rascarMove(g: Uint8Array, si: number): void {
    const life = (mpLifeTimer(g, si) + 1) & 0xff;
    s8(g, si + 4, life);
    if (life >= 12) {
        despawnProjectileSlots(g, si, 4);
        return;
    }

    for (let i = 0; i < 4; i++) {
        s8(g, si + 2, (mpYRel(g, si) + 2) & 0x3f);
        monsterIsInSpawnRangeAndClear(g, si);
        si += MAGIC_PROJECTILE_STRIDE;
    }
}

/** agua_move (dungeon.c:6576): advances all 3 bubble slots each frame. */
export function aguaMove(g: Uint8Array, si: number): void {
    const life = (mpLifeTimer(g, si) + 1) & 0xff;
    s8(g, si + 4, life);
    if (life >= 10) {
        despawnProjectileSlots(g, si, 3);
        return;
    }

    for (let i = 0; i < 3; i++) {
        projectileStepAndAnimate(g, si);
        monsterIsInSpawnRangeAndClear(g, si);
        si += MAGIC_PROJECTILE_STRIDE;
    }
}

// ─── shared helpers ───

/** projectile_step_x_by_direction (dungeon.c:6608). */
export function projectileStepXByDirection(g: Uint8Array, si: number): void {
    // dir bit0 == 0 → step -2; bit0 == 1 → step +2
    const step = (mpDir(g, si) & 1) * 4 - 2;
    let x = mpXRel(g, si) + step;

    const mapWidth = g16(g, MAP_WIDTH);
    if (x < 0) x += mapWidth;
    else if (x >= mapWidth) x -= mapWidth;

    mpSetXRel(g, si, x & 0xffff);
}

/** advance_projectile_anim_frame (dungeon.c:6622). */
function advanceProjectileAnimFrame(g: Uint8Array, si: number): void {
    let frame = (mpAnimFrame(g, si) + 1) & 0xff;
    if (frame >= 3) frame = 0;
    s8(g, si + 5, frame);
}

/** projectile_step_and_animate (asm sub_8BC2, dungeon.c:6630). */
function projectileStepAndAnimate(g: Uint8Array, si: number): void {
    advanceProjectileAnimFrame(g, si);
    projectileStepXByDirection(g, si);
}

/**
 * despawn_projectile_slots (dungeon.c:6640): clear the spell's trailing
 * slot(s) and mark the spell inactive.
 */
export function despawnProjectileSlots(g: Uint8Array, si: number, slotCount: number): void {
    for (let i = 0; i < slotCount; i++) {
        mpSetXRel(g, (si + i * MAGIC_PROJECTILE_STRIDE) & 0xffff, 0xff00);
    }

    s8(g, BYTE_FF3E, 0);
}

/**
 * monster_is_in_spawn_range_and_clear (dungeon.c:6655): mark any monster in
 * the projectile's 3×3 neighborhood as a spell target.
 */
export function monsterIsInSpawnRangeAndClear(g: Uint8Array, si: number): number {
    if (g8(g, IS_BOSS_CAVERN) !== 0 && g8(g, BOSS_BEING_HIT) !== 0) return 0;

    const prox = isInProximityWindow(g, mpXRel(g, si));
    if (!prox.inside) return 0; // outside the visible proximity window

    const relX = prox.xRel;
    if (((relX - 2) & 0xff) >= 0x20) return 0; // too close to the window edge

    const di = coordsToProxAddr(g, relX, mpYRel(g, si));
    let scan = wrapMapFromBelow((di - 37) & 0xffff);

    let anyHit = 0;
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            if (markProximityMonsterAsSpellTarget(g, scan) !== 0) anyHit = 1;
            scan = (scan + 1) & 0xffff;
        }
        scan = (scan + 33) & 0xffff; // complete the 36-wide row stride
        scan = wrapMapFromAbove(scan);
    }

    return anyHit;
}

/**
 * mark_proximity_monster_as_spell_target (dungeon.c:6690).
 */
export function markProximityMonsterAsSpellTarget(g: Uint8Array, addr: number): number {
    const { flags, monsterStruct } = getDstMonsterFlags(g, addr);
    if (monsterStruct === 0) return 0; // nothing there

    if ((flags & 0x20) !== 0) return 0; // flying/immune target

    if ((g8(g, monsterStruct + 5) & 0x20) !== 0) return 0; // already targeted this frame

    let ai = g8(g, monsterStruct + 5);
    ai = (ai | 0x40) & 0xe0; // keep status bits, set "hit" bit
    ai |= (g8(g, CURRENT_MAGIC_SPELL) + 1) & 0xff; // low bits: which spell hit it
    s8(g, monsterStruct + 5, ai);

    s8(g, BYTE_9F2A, 0xff);
    return 1;
}
