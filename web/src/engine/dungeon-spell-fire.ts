/**
 * dungeon-spell-fire.ts — TS port of dungeon.c's magic spell firing and
 * projectile spawn routines (Stage 8d, slice 8).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - Magic_Spell_Fire_Handler              (6274)
 *   - init_magic_projectile                 (6335)
 *   - init_rascar                           (6362)
 *   - init_agua                             (6390)
 *   - init_guerra                           (6413)
 */

import { wrapMapFromAbove, wrapMapFromBelow } from './dungeon-entities.js';
import { getRandom } from './dungeon-combat.js';
import { markProximityMonsterAsSpellTarget } from './dungeon-spells.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';

const MAGIC_PROJECTILE_STRIDE = 0x10;

// g_mem addresses
const VIEWPORT_TOP_ROW = 0x82;
const HERO_XV = 0x83;
const HERO_HEAD_Y_VIEW = 0x84;
const CURRENT_MAGIC_SPELL = 0x9d;
const SPELLS_ESPADA = 0xab; // number of spells left per type
const FACING = 0xc2;
const SQUAT_FLAG = 0xff38;
const IS_BOSS_CAVERN = 0xff34;
const BOSS_BEING_HIT = 0xff2e;
const PROXIMITY_MAP_LEFT_TOP = 0xff31; // word
const BYTE_9EED = 0x9eed;
const BYTE_9EEE = 0x9eee;
const BYTE_FF3E = 0xff3e;
const ALTKEY_LATCH = 0xff1e;
const SPACEBAR_LATCH = 0xff1d;
const SOUND_FX_REQUEST = 0xff75;



/** Injected to break the cycle into dungeon-frame (guerra re-render). */
export interface SpellFireCallbacks {
    /** main_update_render() — invoked by guerra after border-wall flag. */
    mainUpdateRender: (g: Uint8Array) => void;
}

/**
 * Magic_Spell_Fire_Handler (dungeon.c:6274): cast start → charge-up →
 * fire. Charge counter increases by 2 each call so it always lands on
 * exactly 4 before it would reach 6.
 */
export function magicSpellFireHandler(
    g: Uint8Array,
    callbacks: {
        initMagicProjectile: (g: Uint8Array, si: number) => void;
        initRascar: (g: Uint8Array, si: number) => void;
        initAgua: (g: Uint8Array, si: number) => void;
        initGuerra: (g: Uint8Array, si: number) => void;
    },
): void {
    if (memRead8(g, CURRENT_MAGIC_SPELL) === 0) return;

    if (memRead8(g, 0xff3c /* SPELL_ACTIVE_FLAG */) === 0) {
        // not casting: check whether Alt was just pressed
        if (memRead8(g, ALTKEY_LATCH) === 0) return;

        memWrite8(g, SPACEBAR_LATCH, 0);
        memWrite8(g, ALTKEY_LATCH, 0);

        if (memRead8(g, 0xff43 /* SWORD_SWING_FLAG */) !== 0) return; // mid sword-swing
        if (memRead8(g, BYTE_FF3E) !== 0) return; // projectile still active

        memWrite8(g, 0x9f2b /* BYTE_9F2B */, 0);
        memWrite8(g, 0xff3c, 0xff);
        memWrite8(g, SOUND_FX_REQUEST, 23);
        return;
    }

    // already casting: advance charge-up counter (+2 per call)
    const counter = (memRead8(g, 0x9f2b) + 2) & 0xff;
    memWrite8(g, 0x9f2b, counter);

    if (counter !== 4) {
        if (counter >= 6) {
            memWrite8(g, 0xff3c, 0); // charge expired without firing
        }
        return;
    }

    // charge complete: fire
    const spell = (memRead8(g, CURRENT_MAGIC_SPELL) - 1) & 0xff; // 0..6

    if (memRead8(g, SPELLS_ESPADA + spell) === 0) return; // out of charges

    memWrite8(g, SPELLS_ESPADA + spell, (memRead8(g, SPELLS_ESPADA + spell) - 1) & 0xff);
    memWrite8(g, 0xffa3 /* MAGIC_LEFT_RENDER_REQUEST */, 0xff);
    memWrite8(g, SOUND_FX_REQUEST, 24);

    const si = 0xeb15; // MAGIC_PROJECTILES
    memWrite8(g, BYTE_FF3E, 0xff);

    switch (spell) {
        case 0: callbacks.initMagicProjectile(g, si); break;
        case 1: callbacks.initMagicProjectile(g, si); break;
        case 2: callbacks.initMagicProjectile(g, si); break;
        case 3: callbacks.initMagicProjectile(g, si); break;
        case 4: callbacks.initRascar(g, si); break;
        case 5: callbacks.initAgua(g, si); break;
        case 6: callbacks.initGuerra(g, si); break;
    }
}

// ─── spawners ───

/**
 * init_magic_projectile (dungeon.c:6335): single slot from the hero's
 * facing/position. Used by espada/saeta/fuego/lanzar and as a building
 * block by init_agua.
 */
export function initMagicProjectile(g: Uint8Array, si: number): void {
    const facing = memRead8(g, FACING);
    // dir encoding (NOT(facing) & 1): 0=LEFT, 1=RIGHT
    const dir = (~facing & 1) & 0xff;
    memWrite8(g, si + 3, dir);

    let y = ((memRead8(g, SQUAT_FLAG) & 1) +
        (memRead8(g, HERO_HEAD_Y_VIEW) ?? 0) +
        (memRead8(g, VIEWPORT_TOP_ROW) ?? 0)) & 0xff;
    y &= 0x3f;
    memWrite8(g, si + 2, y);

    let xInProx = ((memRead8(g, HERO_XV) ?? 0) + 4) & 0xff;
    xInProx = (xInProx + ((~dir & 1) & 0xff)) & 0xff;

    let x = ((xInProx + memRead16(g, 0x80)) & 0xffff);
    const mapWidth = memRead16(g, 0xc002);
    if (x >= mapWidth) x -= mapWidth;
    memWrite16(g, si, x);

    for (const off of [8, 10, 12, 14]) {
        memWrite16(g, si + off, memRead16(g, si + off) & 0x00ff);
    }

    memWrite8(g, si + 4, 0); // life timer
    memWrite8(g, si + 5, 0); // anim frame

    // terminate the active list right after this slot
    memWrite16(g, si + MAGIC_PROJECTILE_STRIDE, 0xffff);
}

/** init_rascar (dungeon.c:6362): 4 beam slots across the screen width. */
export function initRascar(g: Uint8Array, siBase: number): void {
    let si = siBase;
    for (let beam = 0; beam < 4; beam++) {
        // x = left_col + {26,20,14,8}
        let x = (6 * (4 - beam) + 2 + memRead16(g, 0x80)) & 0xffff;
        const mapWidth = memRead16(g, 0xc002);
        if (x >= mapWidth) x -= mapWidth;
        memWrite16(g, si, x);

        let y = getRandom(g) & 3;
        y = ((memRead8(g, VIEWPORT_TOP_ROW) - 3 - y) & 0x3f) as number;
        y &= 0x3f;
        memWrite8(g, si + 2, y);

        for (const off of [8, 10, 12, 14]) {
            memWrite16(g, si + off, memRead16(g, si + off) & 0x00ff);
        }
        memWrite8(g, si + 4, 0);
        memWrite8(g, si + 5, 0);

        si += MAGIC_PROJECTILE_STRIDE;
    }
}

/** init_agua (dungeon.c:6390): 3 slots in a vertical spread. */
export function initAgua(g: Uint8Array, si: number): void {
    const base = si;
    let s = si;

    for (let i = 0; i < 3; i++) {
        initMagicProjectile(g, s);
        s += MAGIC_PROJECTILE_STRIDE;
    }

    memWrite8(g, base + 2, (memRead8(g, base + 2) - 2) & 0x3f);
    memWrite8(
        g,
        base + 2 + MAGIC_PROJECTILE_STRIDE,
        (memRead8(g, base + 2 + MAGIC_PROJECTILE_STRIDE) + 2) & 0x3f,
    );
}

/**
 * init_guerra (dungeon.c:6413): instantly marks every monster/item in the
 * 36×19 band above the hero as hit, unless a boss is mid-reaction.
 * Render_Viewport_Border_Walls_proc is a JS-side flag no-op.
 */
export function initGuerra(
    g: Uint8Array,
    _si: number,
    callbacks?: { mainUpdateRender?: (g: Uint8Array) => void },
): void {
    memWrite8(g, BYTE_9EED, 0xff);
    memWrite8(g, BYTE_9EEE, 0xff);

    if (!(memRead8(g, IS_BOSS_CAVERN) !== 0 && memRead8(g, BOSS_BEING_HIT) !== 0)) {
        let scan = wrapMapFromBelow((memRead16(g, PROXIMITY_MAP_LEFT_TOP) - 36) & 0xffff);

        for (let row = 0; row < 19; row++) {
            for (let col = 0; col < 36; col++) {
                if ((memRead8(g, scan) & 0x80) !== 0) {
                    markProximityMonsterAsSpellTarget(g, scan);
                }
                scan = (scan + 1) & 0xffff;
            }
            scan = wrapMapFromAbove(scan & 0xffff);
        }
    }

    memWrite8(g, BYTE_FF3E, 0);
    memWrite8(g, SOUND_FX_REQUEST, 25);
    // Render_Viewport_Border_Walls_proc(): JS-side flag consumer — no-op here
    memWrite8(g, ALTKEY_LATCH, 0);
    if (callbacks?.mainUpdateRender) {
        // clear_viewport_buffer + main_update_render on the C side
        callbacks.mainUpdateRender(g);
    }
}
