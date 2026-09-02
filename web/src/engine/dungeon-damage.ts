/**
 * dungeon-damage.ts — TS port of dungeon.c's hero-side damage pipeline
 * (Stage 8c slice 4 / folded into 8d prep).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - Draw_Hero_Health                      (render-request writer)
 *   - damage_hero                           (3008)
 *   - check_tile_contact_damage             (2895)
 *   - check_hero_contact_damage             (2908) — monster-contact scan,
 *     shield absorption/breaking, knockback-vector tail
 *   - aggressive_tiles_damage_table         (3021)
 *   - step_on_aggressive_ground             (3024)
 */

import { heroCoordsToAddrInProximity, getDstMonsterFlags } from './dungeon-hero.js';
import { isTileSafeToStay } from './dungeon-monsters.js';
import { wrapMapFromAbove, wrapMapFromBelow } from './dungeon-entities.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';

const PROX_COLS = 36;

// g_mem addresses
const HERO_HP = 0x90; // word
const SHIELD_TYPE = 0x93;
const SHIELD_HP = 0x94; // word
const CURRENT_ACCESSORY = 0x9e;
const INVINCIBILITY_FLAG = 0xe8;
const ACCUMULATED_DAMAGE = 0x9f12; // word
const KNOCKBACK_VECTOR = 0x9f0e; // 4 bytes
const BYTE_9F14 = 0x9f14;
const MONSTER_DAMAGE = 0xa010; // 16-byte table
const CAVERN_LEVEL = 0xc012;
const FACING = 0xc2;
const LEFT_FLAG = 1;
const IS_BOSS_CAVERN = 0xff34;
const BOSS_BEING_HIT = 0xff2e;
const HERO_DAMAGE_THIS_FRAME = 0xff36;
const ON_ROPE_FLAGS = 0xff39;
const SQUAT_FLAG = 0xff38;
const SOUND_FX_REQUEST = 0xff75;
const SHIELD_HP_RENDER_REQUEST = 0xff9a;
const HEALTH_BAR_REQUEST = 0xff99;
const NOTIFICATION_MSG_ID = 0xff96;
const NOTIFICATION_FLAG = 0xff97;

/** Notification id (zeliard.h). */
export const SHIELD_BROKEN_STR = 8;

/** Damage per cavern level − 1 (dungeon.c:3021). */
export const AGGRESSIVE_TILES_DAMAGE_TABLE: readonly number[] = [1, 1, 4, 8, 20, 20, 20, 20, 20];



/** Draw_Hero_Health: signal JS to redraw the life bar. */
export function drawHeroHealth(g: Uint8Array): void {
    memWrite8(g, HEALTH_BAR_REQUEST, 0xff);
}

/** damage_hero (dungeon.c:3008): subtract with clamp to 0. */
export function damageHero(g: Uint8Array, damage: number): void {
    const heroHp = memRead16(g, HERO_HP);
    let next: number;
    if (heroHp >= damage) {
        next = (heroHp - damage) & 0xffff;
    } else {
        next = 0;
    }
    memWrite16(g, HERO_HP, next);
    drawHeroHealth(g);
}

/**
 * check_tile_contact_damage (dungeon.c:2895): accumulate a non-flying
 * monster's contact damage; returns nonzero when a monster was hit.
 */
function checkTileContactDamage(g: Uint8Array, addr: number): number {
    const { flags, monsterStruct } = getDstMonsterFlags(g, addr);
    if (monsterStruct === 0) return 0; // no monster/item marker
    if ((flags & 0x40) !== 0) return 0; // flying
    const idx = flags & 0x0f;
    const dmg = memRead16(g, ACCUMULATED_DAMAGE);
    memWrite16(g, ACCUMULATED_DAMAGE, (dmg + memRead8(g, MONSTER_DAMAGE + idx)) & 0xffff);
    return 1;
}

/**
 * check_hero_contact_damage (dungeon.c:2908): scan the tiles around the
 * hero for touching monsters, apply contact damage through the shield,
 * then fold the knockback vector into the damage-this-frame flags.
 */
export function checkHeroContactDamage(g: Uint8Array): void {
    if (memRead8(g, IS_BOSS_CAVERN) !== 0 && memRead8(g, BOSS_BEING_HIT) !== 0) return;

    memWrite16(g, ACCUMULATED_DAMAGE, 0);

    let si = wrapMapFromBelow((heroCoordsToAddrInProximity(g) - 1) & 0xffff);
    const di = 0x9f0e; // ADDR_KNOCKBACK_VECTOR_9F0E

    let rows: number;
    if (memRead8(g, SQUAT_FLAG) === 0) {
        si = wrapMapFromBelow((si - PROX_COLS) & 0xffff);
        rows = 3;
    } else {
        rows = 2;
    }

    for (let tile = 0; tile < 4; tile++) {
        let scan = si;
        let found = 0;
        for (let row = 0; row < rows; row++) {
            if (checkTileContactDamage(g, scan) !== 0) {
                found = 1;
                break;
            }
            scan = wrapMapFromAbove((scan + PROX_COLS) & 0xffff);
        }

        memWrite8(g, di + tile, found !== 0 ? 0xff : 0);

        if (found !== 0 && memRead8(g, INVINCIBILITY_FLAG) === 0) {
            let damage = memRead16(g, ACCUMULATED_DAMAGE);

            // facing away from the monster means no shield block
            let noShield: boolean;
            if (tile < 2) noShield = (memRead8(g, FACING) & LEFT_FLAG) === 0;
            else noShield = (memRead8(g, FACING) & LEFT_FLAG) !== 0;

            if (noShield || memRead8(g, SHIELD_TYPE) === 0) {
                damageHero(g, damage);
                memWrite8(g, SOUND_FX_REQUEST, 9);
            } else {
                damage = damage >> 1;
                const shift = ((memRead8(g, SHIELD_TYPE) + 1) >> 1) & 0xff;
                damage = damage >> shift;

                const shieldHp = memRead16(g, SHIELD_HP);
                if (shieldHp < damage) {
                    memWrite8(g, SHIELD_TYPE, 0);
                    memWrite16(g, SHIELD_HP, 0);
                    renderShieldBroken(g);
                } else {
                    const left = shieldHp - damage;
                    memWrite16(g, SHIELD_HP, left);
                    if (left === 0) {
                        memWrite8(g, SHIELD_TYPE, 0);
                        renderShieldBroken(g);
                    }
                }
                memWrite8(g, SHIELD_HP_RENDER_REQUEST, 0xff);
                damageHero(g, damage);
                memWrite8(g, SOUND_FX_REQUEST, 8);
            }
        }

        si = (si + 1) & 0xffff;
    }

    const flags =
        (memRead8(g, KNOCKBACK_VECTOR) |
            memRead8(g, KNOCKBACK_VECTOR + 1) |
            memRead8(g, KNOCKBACK_VECTOR + 2) |
            memRead8(g, KNOCKBACK_VECTOR + 3)) & 0xff;
    memWrite8(g, BYTE_9F14, flags);
    memWrite8(g, HERO_DAMAGE_THIS_FRAME, flags);
    if (flags !== 0) drawHeroHealth(g);
}

function renderShieldBroken(g: Uint8Array): void {
    memWrite8(g, NOTIFICATION_MSG_ID, SHIELD_BROKEN_STR);
    memWrite8(g, NOTIFICATION_FLAG, 0xff);
}

/**
 * step_on_aggressive_ground (dungeon.c:3024): harmful-tile scan of the
 * hero's footprint; Pirika shoes grant immunity.
 */
export function stepOnAggressiveGround(g: Uint8Array): void {
    // Pirika shoes grant immunity
    if (memRead8(g, CURRENT_ACCESSORY) === 2 /* SHOES_PIRIKA */) return;

    let dangerFound = 0;

    let ptr = heroCoordsToAddrInProximity(g);

    let rowCount = 3;
    if (memRead8(g, SQUAT_FLAG) !== 0) {
        ptr = wrapMapFromAbove((ptr + PROX_COLS) & 0xffff);
        rowCount = 2;
    }

    for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < 3; col++) {
            const tile = memRead8(g, ptr);
            ptr = (ptr + 1) & 0xffff;
            if (isTileSafeToStay(g, tile) === 0) {
                dangerFound = 0xff;
            }
        }
        ptr = wrapMapFromAbove((ptr + PROX_COLS - 3) & 0xffff);
    }

    // not on a rope: also check the tile under the hero's centre column
    if (memRead8(g, ON_ROPE_FLAGS) === 0) {
        ptr = (ptr + 1) & 0xffff;
        const tile = memRead8(g, ptr);
        if (isTileSafeToStay(g, tile) === 0) {
            dangerFound = 0xff;
        }
    }

    if (dangerFound === 0) return;

    memWrite8(g, HERO_DAMAGE_THIS_FRAME, 0xff);
    memWrite8(g, SOUND_FX_REQUEST, 9);

    const dmg = AGGRESSIVE_TILES_DAMAGE_TABLE[(memRead8(g, CAVERN_LEVEL) - 1) & 0xff] ?? 1;
    damageHero(g, dmg);
}
