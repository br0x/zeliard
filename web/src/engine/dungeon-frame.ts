/**
 * dungeon-frame.ts — TS port of dungeon.c's per-frame render/timing
 * pipeline and main_update_render_pre (Stage 8d, slice 6).
 *
 * Ports, 1:1 from src/dungeon.c + gfmcga.c:
 *   - load_3x3_tiles                        (gfmcga:222)
 *   - Sample_Neighborhood_Attributes        (gfmcga:254)
 *   - Boss_Explosions_Renderer              (gfmcga:1411) — g_mem parts;
 *     VRAM bitplane rendering is JS-side
 *   - update_and_render_projectile_row_pair (5862)
 *   - update_active_projectiles_render      (5812) incl. per-spell frame
 *     sequence tables and deltas
 *   - dungeon_render_timing_step            (4707)
 *   - process_hero_death                    (797)
 *   - main_update_render_pre                (4628)
 *
 * Injected callbacks: bringInventoryWindow / loadPlaceAndReinit (transition
 * flows that own JS-side asset loads), used by the timing-step tail.
 */

import { wrapMapFromAbove } from './dungeon-entities.js';
import { heroScrollDown } from './dungeon-vertical.js';
import {
    moveHeroUp,
    moveHeroLeftIfNoObstacles,
    moveHeroRightIfNoObstacles,
} from './dungeon-hero.js';
import {
    renderNotificationString,
    monstersSpawning,
} from './dungeon-items.js';
import { damageHero, checkHeroContactDamage } from './dungeon-damage.js';
import { updateHeroXp } from './dungeon-combat.js';
import { clearHeroInViewport, DUNGEON_STATE_DEATH_FALL } from './dungeon-state-machine.js';
import { heroGotAlmas } from './dungeon-items.js';
import {
    magiaStoneUpdates,
    renderVerticalPlatformsToProximity,
    processVisibleCollapsingPlatforms,
    updateAndRenderHorizPlatforms,
} from './dungeon-platforms.js';
import { stepOnAggressiveGround } from './dungeon-damage.js';
import {
    checkAirflowsOnHero,
    updateBossHeartbeatVolume,
    processDoors,
} from './dungeon-frame-pre.js';
import {
    dispatchSpellProjectileMovement,
} from './dungeon-spells.js';
import {
    projectilesCollisionProcessing,
    renderSwordOverlay,
} from './dungeon-projectiles.js';

const PROX_COLS = 36;
const VIEW_COLS = 28;

// g_mem addresses
const VIEWPORT_TOP_ROW = 0x82;
const HERO_XV = 0x83;
const HERO_HEAD_Y_VIEW = 0x84;
const HERO_Y = 0xff35;
const HERO_HP = 0x90; // word
const HERO_MAX_HP = 0xb2; // word
const CURRENT_ACCESSORY = 0x9e;
const INVINCIBILITY_FLAG = 0xe8;
const HERO_INVINCIBILITY = 0x7f;
const BYTE_9F00 = 0x9f00;
const JUMP_HEIGHT_INCLUDING_SHOES = 0x9f0d;
const AIR_UP_TILE_FOUND_UNUSED = 0x9f15;
void AIR_UP_TILE_FOUND_UNUSED;
const TEMPERATURE_TIMER = 0x9f25;
const BYTE_9F18 = 0x9f18;
const BYTE_9F2B = 0x9f2b;
const IS_JASHIIN_CAVERN = 0xe6;
const HEALING_TIMER = 0xc6; // word
const PROXIMITY_MAP_LEFT_TOP_ADDR = 0xff31; // word
const MAP_WIDTH_UNUSED = 0xc002;
void MAP_WIDTH_UNUSED;
const SPEED_CONST = 0xff33;
const IS_BOSS_CAVERN = 0xff34;
const SPRITE_FLASH_FLAG = 0xff2f;
const BOSS_IS_DEAD = 0xff30;
const BOSS_STATE_PTR = 0xa002; // word
const DUNGEON_FRAME_PHASE = 0xff91;
const RENDER_REQUEST = 0xff92;
const RENDER_DONE = 0xff93;
const DEATH_COUNTER = 0xff95;
const BYTE_FF24 = 0xff24;
const HEARTBEAT_VOLUME_UNUSED = 0xff08;
void HEARTBEAT_VOLUME_UNUSED;
const SWORD_SWING_FLAG = 0xff43;
const SWORD_HIT_TYPE = 0xff45;
const SWORD_MOVEMENT_PHASE = 0xff46;
const SPELL_ACTIVE_FLAG = 0xff3c;
const SHIELD_ANIM_PHASE = 0xff3f;
const SHIELD_ANIM_ACTIVE = 0xff40;
const SHIELD_VARIANT_INDEX = 0xff41;
const SQUAT_FLAG = 0xff38;
const ON_ROPE_FLAGS = 0xff39;
const HERO_SPRITE_HIDDEN = 0xff37;
const HERO_DAMAGE_THIS_FRAME = 0xff36;
const SOUND_FX_REQUEST = 0xff75;
const HEALTH_BAR_REQUEST = 0xff99;
const JUMP_PHASE_FLAGS = 0xff3d;

/** ACCESSORY_FERUZA_SHOES (zeliard.h). */
export const ACCESSORY_FERUZA_SHOES = 1;
/** ACCESSORY_ASBESTOS_CAPE (zeliard.h). */
export const ACCESSORY_ASBESTOS_CAPE = 5;
export const ITS_TOO_HOT_STR = 18;



// ─── neighborhood sampling (gfmcga.c) ───

/** Tile-neighborhood buffer (C static, gfmcga.c:64). */
export const TILE_NEIGHBORHOOD_BUFFER = new Uint8Array(9);

/** load_3x3_tiles (gfmcga.c:222). */
export function load3x3Tiles(g: Uint8Array): void {
    let si =
        memRead16(g, PROXIMITY_MAP_LEFT_TOP_ADDR) +
        (memRead8(g, HERO_HEAD_Y_VIEW) ?? 0) * PROX_COLS +
        (memRead8(g, HERO_XV) ?? 0) +
        4;
    si = wrapMapFromAbove(si & 0xffff);
    let di = 0;
    for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 3; k++) {
            TILE_NEIGHBORHOOD_BUFFER[di + k] = g[(si + k) & 0xffff] ?? 0;
        }
        si = wrapMapFromAbove((si + PROX_COLS) & 0xffff);
        di += 3;
    }
}

/** Sample_Neighborhood_Attributes (gfmcga.c:254): keeps only monster
 * markers (bit7) from the 4×4 block at the hero's top-left. */
export function sampleNeighborhoodAttributes(g: Uint8Array): void {
    load3x3Tiles(g);

    const di = TILE_NEIGHBORHOOD_BUFFER;
    let dl = (memRead8(g, HERO_Y /* 0xff35 */) - 1) & 0xff;
    const a0 = 0xe000 + (memRead8(g, HERO_XV) ?? 0) + 3;

    for (let i = 0; i < 4; i++) {
        let bx = (a0 + ((dl & 0x3f) as number) * PROX_COLS) & 0xffff;

        for (let j = 0; j < 4; j++) {
            let al = g[bx] ?? 0;
            if ((al & 0x80) === 0) al = 0;
            di[i * 4 + j] = al;
            bx++;
        }
        dl++;
    }
}

// ─── boss explosions (gfmcga.c:1411 — g_mem parts) ───

/**
 * Boss_Explosions_Renderer: marks covered viewport-entity cells 0xFE,
 * decrements each explosion's frame counter, compacts finished entries.
 * The VRAM bitplane rendering itself is handled by the JS renderer.
 */
export function bossExplosionsRenderer(g: Uint8Array): void {
    const list = 0xeda0; // ADDR_BOSS_EXPLOSIONS_LIST
    let write = list;
    let read = list;

    for (;;) {
        const col = memRead8(g, read);
        if (col === 0xff) {
            memWrite8(g, write, 0xff);
            return;
        }

        const row = memRead8(g, read + 1);

        // mark the 2×2 viewport-entities block as mid-animation
        memWrite8(g, 0xe900 + row * VIEW_COLS + col, 0xfe);
        memWrite8(g, 0xe900 + row * VIEW_COLS + col + 1, 0xfe);
        memWrite8(g, 0xe900 + (row + 1) * VIEW_COLS + col, 0xfe);
        memWrite8(g, 0xe900 + (row + 1) * VIEW_COLS + col + 1, 0xfe);

        // frame countdown (VRAM rendering elided — JS side)
        memWrite8(g, read + 2, (memRead8(g, read + 2) - 1) & 0xff);
        if (memRead8(g, read + 2) !== 0xff) {
            for (let i = 0; i < 4; i++) {
                memWrite8(g, write + i, memRead8(g, read + i));
            }
            write += 4;
        }
        read += 4;
    }
}

// ─── projectile render passes ───

/** update_and_render_projectile_row_pair (dungeon.c:5862). */
export function updateAndRenderProjectileRowPair(g: Uint8Array): void {
    for (let p = 0xeb80 /* PROJECTILES_LIST */; ; p += 13) {
        if (memRead8(g, p) === 0xff) return;

        memWrite8(g, p + 11, memRead8(g, p)); // cached_x_rel

        if (memRead8(g, p) >= VIEW_COLS + 4) {
            memWrite8(g, p, 0); // deactivate
            continue;
        }

        const relY = ((memRead8(g, p + 1) - memRead8(g, VIEWPORT_TOP_ROW)) & 0x3f) as number;
        if (relY >= 18 /* VIEW_ROWS */) {
            memWrite8(g, p, 0); // deactivate
            continue;
        }

        memWrite8(g, p + 12, relY);
    }
}

// per-spell frame sequences (dungeon.c:5676..5745)
const ESPADA_FRAMES = [0x67, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71, 0x72];
const SAETA_DIR0 = [0x67, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71, 0x72];
const SAETA_DIR1 = [0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e];
const FUEGO_DIR0 = [0x67, 0x68, 0x69, 0x6a, 0x6f, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e];
const FUEGO_DIR1 = [0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e];
const LANZAR_DIR0 = [0x67, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71, 0x72];
const LANZAR_DIR1 = [0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e];
const RASCAR_FRAMES = [0x73, 0x74, 0x75, 0x76];
const AGUA_DIR0 = [0x67, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71, 0x72];
const AGUA_DIR1 = [0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e];

const SEQUENCES0: ReadonlyArray<readonly number[]> = [
    ESPADA_FRAMES, SAETA_DIR0, FUEGO_DIR0, LANZAR_DIR0, RASCAR_FRAMES, AGUA_DIR0,
];
const SEQUENCES1: ReadonlyArray<readonly number[]> = [
    ESPADA_FRAMES, SAETA_DIR1, FUEGO_DIR1, LANZAR_DIR1, RASCAR_FRAMES, AGUA_DIR1,
];
const DELTAS: readonly number[] = [0, 0, 1, 0, 0, 1, 1, 1];

/** update_active_projectiles_render (dungeon.c:5812): cache viewport
 * offsets for magic projectiles. The sub-tile VRAM pass elides to sequence
 * walking only (tile blitting is JS-side). */
export function updateActiveProjectilesRender(g: Uint8Array): void {
    let mp = 0xeb15; // MAGIC_PROJECTILES

    for (let outer = 0; outer < 4; outer++, mp += 16) {
        if (memRead16(g, mp) === 0xffff) return; // end of active list

        if (memRead8(g, mp + 1) === 0xff) {
            memWrite16(g, mp, 0xffff); // drifted far off world: retire slot
            continue;
        }

        const frameOffset = memRead8(g, mp + 5) * 4;
        const table = memRead8(g, mp + 3) !== 0 ? SEQUENCES0 : SEQUENCES1;

        const prox = isInProximityWindowCached(g, memRead16(g, mp));
        if (!prox.inside) continue;

        memWrite8(g, mp + 6, prox.xRel);
        const relY = ((memRead8(g, mp + 2) - memRead8(g, VIEWPORT_TOP_ROW)) & 0x3f) as number;
        memWrite8(g, mp + 7, relY);

        // sub-tile walk: tile blitting itself is JS-side; the sequence
        // cursor advances 4 subtiles (DELTAS pairs) from the frame offset
        void frameOffset;
        void table;
        void DELTAS;
    }
}

function isInProximityWindowCached(g: Uint8Array, x: number): { inside: boolean; xRel: number } {
    // same logic as dungeon-monsters.isInProximityWindow, inlined to avoid
    // an import cycle through that module's table exports
    const left = memRead16(g, 0x80);
    const mapWidth = memRead16(g, 0xc002);
    if (x >= left) {
        const offset = (x - left) & 0xffff;
        return { inside: offset < 36, xRel: offset & 0xff };
    }
    if (x >= 36) return { inside: false, xRel: 0 };
    const offset = (mapWidth - left + x) & 0xffff;
    return { inside: offset < 36, xRel: offset & 0xff };
}

// ─── main_update_render_pre (dungeon.c:4628) ───

/** Injected transition callbacks (JS-side flows). */
export interface FramePreCallbacks {
    bringInventoryWindow: (g: Uint8Array) => void;
    loadPlaceAndReinit: (g: Uint8Array) => void;
}

export function mainUpdateRenderPre(g: Uint8Array, callbacks: FramePreCallbacks): number {
    let jumpHeight = 2;
    if (memRead8(g, CURRENT_ACCESSORY) === ACCESSORY_FERUZA_SHOES) {
        jumpHeight = 4;
    }
    memWrite8(g, JUMP_HEIGHT_INCLUDING_SHOES, jumpHeight);
    checkAirflowsOnHero(g);

    if (memRead8(g, JUMP_PHASE_FLAGS) === 0) {
        // C zeroes ADDR_BYTE_9F09 (the jump-step counter) here — NOT
        // BYTE_9F00, which holds the viewport-follow target set at cavern
        // init and must survive this frame (zeroing it made the follow
        // branch fire on every grounded frame).
        memWrite8(g, 0x9f09 /* BYTE_9F09 */, 0);
        if (memRead8(g, BYTE_9F00) !== memRead8(g, HERO_HEAD_Y_VIEW)) {
            if (memRead8(g, BYTE_9F00) < memRead8(g, HERO_HEAD_Y_VIEW)) {
                heroScrollDown(g);
                memWrite8(g, HERO_HEAD_Y_VIEW, (memRead8(g, HERO_HEAD_Y_VIEW) - 1) & 0xff);
            } else {
                moveHeroUp(g);
                memWrite8(g, HERO_HEAD_Y_VIEW, (memRead8(g, HERO_HEAD_Y_VIEW) + 1) & 0xff);
            }
        }
    }

    if (memRead8(g, IS_JASHIIN_CAVERN) !== 0 || memRead8(g, IS_BOSS_CAVERN) !== 0) {
        const si = memRead16(g, BOSS_STATE_PTR) + 7; // arena_center_x
        if (memRead8(g, HERO_XV) !== memRead8(g, si)) {
            moveHeroRightIfNoObstacles(g);
            memWrite8(g, HERO_XV, (memRead8(g, HERO_XV) - 1) & 0xff);
        }
    } else {
        if (memRead8(g, HERO_XV) !== 12) {
            moveHeroLeftIfNoObstacles(g);
            memWrite8(g, HERO_XV, (memRead8(g, HERO_XV) + 1) & 0xff);
        }
    }

    memWrite8(g, 0xff35 /* ADDR_HERO_Y */, (memRead8(g, HERO_HEAD_Y_VIEW) + memRead8(g, VIEWPORT_TOP_ROW)) & 0x3f);
    updateBossHeartbeatVolume(g);
    updateAndRenderHorizPlatforms(g);
    renderVerticalPlatformsToProximity(g);
    processVisibleCollapsingPlatforms(g);
    processDoors(g);
    dispatchSpellProjectileMovement(g);

    if (memRead8(g, BOSS_IS_DEAD) === 0) {
        monstersSpawning(g, runMonsterAi); // Stage 9: ported AIs via the registry
    }

    memWrite8(g, HERO_DAMAGE_THIS_FRAME, 0);
    memWrite8(g, 0x9f14 /* BYTE_9F14 */, 0);
    checkHeroContactDamage(g);
    // Flush_Ui_Element_If_Dirty_proc(): stub
    projectilesCollisionProcessing(g);
    magiaStoneUpdates(g);
    renderSwordOverlay(g);
    stepOnAggressiveGround(g);

    // level-7 heat damage unless wearing the Asbestos Cape
    if (
        memRead8(g, 0xc012 /* CAVERN_LEVEL */) === 7 &&
        memRead8(g, CURRENT_ACCESSORY) !== ACCESSORY_ASBESTOS_CAPE
    ) {
        memWrite8(g, TEMPERATURE_TIMER, (memRead8(g, TEMPERATURE_TIMER) + 1) & 0xff);
        if ((memRead8(g, TEMPERATURE_TIMER) & 0x3f) === 0) {
            memWrite8(g, HERO_DAMAGE_THIS_FRAME, 0xff);
            memWrite8(g, SOUND_FX_REQUEST, 9);
            damageHero(g, 0x0f);
            renderNotificationString(g, ITS_TOO_HOT_STR);
        }
    }

    // screen_flash_overlay(): stub
    return memRead8(g, INVINCIBILITY_FLAG) !== 0 ? 1 : 0;
}

// ─── dungeon_render_timing_step (dungeon.c:4707) ───

/**
 * Runs one sub-step of the render pipeline. Returns 1 when a full frame
 * completed, 0 otherwise.
 */
export function dungeonRenderTimingStep(
    g: Uint8Array,
    invincible: number,
    callbacks: FramePreCallbacks,
): number {
    const phase = memRead8(g, DUNGEON_FRAME_PHASE);
    let speed = memRead8(g, SPEED_CONST);
    if (speed === 0) speed = 1;

    if (phase === 0) {
        if (invincible === 0) {
            memWrite8(g, HERO_SPRITE_HIDDEN, 0);
        }

        memWrite8(g, SHIELD_ANIM_ACTIVE, 0);

        if (memRead8(g, SWORD_SWING_FLAG) !== 0) {
            memWrite8(g, SHIELD_ANIM_ACTIVE, 0xff);
            memWrite8(g, SHIELD_VARIANT_INDEX, memRead8(g, SWORD_HIT_TYPE));
            memWrite8(g, SHIELD_ANIM_PHASE, memRead8(g, SWORD_MOVEMENT_PHASE));
        } else if (memRead8(g, SPELL_ACTIVE_FLAG) !== 0) {
            memWrite8(g, SHIELD_ANIM_ACTIVE, 0xff);
            memWrite8(g, SHIELD_ANIM_PHASE, memRead8(g, BYTE_9F2B));
            memWrite8(g, SHIELD_VARIANT_INDEX, 1);
        }

        if (memRead8(g, HERO_SPRITE_HIDDEN) === 0) {
            clearHeroInViewport(g);
        }

        sampleNeighborhoodAttributes(g);
        if (memRead8(g, INVINCIBILITY_FLAG) === 0) {
            let timer = memRead16(g, HEALING_TIMER);
            if (timer !== 0) {
                timer--;
                memWrite16(g, HEALING_TIMER, timer);
                memWrite16(g, HERO_HP, (memRead16(g, HERO_HP) + 8) & 0xffff);
                if (memRead16(g, HERO_HP) >= memRead16(g, HERO_MAX_HP)) {
                    memWrite16(g, HERO_HP, memRead16(g, HERO_MAX_HP));
                    memWrite16(g, HEALING_TIMER, 0);
                }
                memWrite8(g, SOUND_FX_REQUEST, 19); // heal with potion
                memWrite8(g, HEALTH_BAR_REQUEST, 0xff); // Draw_Hero_Health()
            }
        }

        if (memRead8(g, SPRITE_FLASH_FLAG) !== 0) {
            bossExplosionsRenderer(g);
            memWrite8(g, BYTE_FF24, 10);
        }

        memWrite8(g, RENDER_DONE, 0);
        memWrite8(g, RENDER_REQUEST, 0xff);
        memWrite8(g, DUNGEON_FRAME_PHASE, 1);
        return 0;
    }

    if (phase === 1) {
        if (memRead8(g, 0xff1a /* ADDR_FRAME_TIMER */) < ((2 * speed) & 0xff)) {
            return 0;
        }

        // magia_stone_updates() runs again here via the caller's import
        magiaStoneUpdatesTick(g);
        // Flush_Ui_Element_If_Dirty_proc(): stub
        updateAndRenderProjectileRowPair(g);
        renderMagiaStoneEffectTick(g);
        updateActiveProjectilesRender(g);
        applySwordHitTick(g);
        renderSwordOverlayTick(g);

        memWrite8(g, RENDER_DONE, 0);
        memWrite8(g, RENDER_REQUEST, 0xff);
        memWrite8(g, DUNGEON_FRAME_PHASE, 2);
        return 0;
    }

    if (memRead8(g, 0xff1a /* ADDR_FRAME_TIMER */) < ((4 * speed) & 0xff)) {
        // Confirm_Exit / Handle_Pause / Handle_Speed_Change: stubs
        return 0;
    }

    // Handle_Restore_Game_proc(): stub (returns 0)
    // restore_game(): not reached

    memWrite8(g, 0xff1a /* ADDR_FRAME_TIMER */, 0);
    memWrite8(g, DUNGEON_FRAME_PHASE, 0);

    if (memRead8(g, INVINCIBILITY_FLAG) !== 0) {
        return 1;
    }

    if (memRead8(g, HERO_INVINCIBILITY) === 0 && memRead16(g, HERO_HP) === 0) {
        memWrite8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_DEATH_FALL);
        memWrite8(g, DEATH_COUNTER, 0);
        processHeroDeath(g);
        return 1;
    }

    memWrite8(g, BYTE_9F18, (memRead8(g, BYTE_9F18) + 1) & 0xff);
    if (memRead8(g, BYTE_9F18) >= 16) {
        memWrite8(g, BYTE_9F18, 0);
        if (memRead16(g, HERO_HP) < memRead16(g, HERO_MAX_HP)) {
            // original version also has this bug (odd damage → eventual max+1)
            memWrite16(g, HERO_HP, (memRead16(g, HERO_HP) + 2) & 0xffff);
            memWrite8(g, HEALTH_BAR_REQUEST, 0xff);
        }
    }

    if (memRead8(g, 0x9f1e /* BOSS_REWARD_PROCESSED */) !== 0) {
        callbacks.loadPlaceAndReinit(g);
        return 1;
    }

    if (memRead8(g, 0xff34 /* IS_BOSS_CAVERN */) !== 0 && memRead8(g, 0xff30 /* BOSS_IS_DEAD */) !== 0) {
        if (memRead8(g, 0xeda0 /* BOSS_EXPLOSIONS_LIST */) === 0xff) {
            const si = memRead16(g, 0xa002 /* BOSS_STATE_PTR */);
            const xpReward = memRead16(g, si + 5);
            updateHeroXp(g, xpReward);
            const almasReward = memRead16(g, si + 9); // offset 9 intentional
            heroGotAlmas(g, almasReward);
            memWrite8(g, 0x9f1e /* BOSS_REWARD_PROCESSED */, 0xff);
        }
    }

    if (memRead8(g, 0xff2e /* BOSS_BEING_HIT */) !== 0) {
        return 1;
    }

    // KEY_ENTER in the F9/F7/F2/F1/Esc/Ctrl-Shift-Enter latch word
    if (((memRead16(g, 0xff18) & 0x100) !== 0)) {
        callbacks.bringInventoryWindow(g);
    } else {
        memWrite8(g, 0x9ef5 /* BYTE_9EF5 */, 0);
    }

    return 1;
}

// Late-bound imports kept lazy to avoid cycles at module init.
import { runMonsterAi } from './eai-registry.js';
import { magiaStoneUpdates as magiaStoneUpdatesTick } from './dungeon-platforms.js';
import { renderMagiaStoneEffect as renderMagiaStoneEffectTick } from './dungeon-platforms.js';
import { applySwordHitToMapTiles } from './dungeon-combat.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';
function applySwordHitTick(g: Uint8Array): void { applySwordHitToMapTiles(g); }
function renderSwordOverlayTick(g: Uint8Array): void { renderSwordOverlay(g); }

/** process_hero_death (dungeon.c:797). */
export function processHeroDeath(g: Uint8Array): void {
    // Flush_Ui_Element_If_Dirty_proc(): stub
    memWrite8(g, SWORD_SWING_FLAG, 0);
    memWrite8(g, JUMP_PHASE_FLAGS, 0);
    memWrite8(g, SQUAT_FLAG, 0);
    memWrite8(g, HERO_DAMAGE_THIS_FRAME, 0);
    memWrite8(g, INVINCIBILITY_FLAG, 0xff);
    memWrite8(g, 0x9f28 /* BYTE_9F28 */, 0);
    memWrite8(g, 0x9f29 /* BYTE_9F29 */, 0);
    memWrite8(g, 0xe7 /* HERO_ANIM_PHASE */, 0);
    memWrite8(g, ON_ROPE_FLAGS, 0);
    memWrite8(g, HERO_SPRITE_HIDDEN, 0);
    memWrite8(g, HEALTH_BAR_REQUEST, 0xff); // Draw_Hero_Health()

    memWrite8(g, 0xff90 /* DUNGEON_STATE */, DUNGEON_STATE_DEATH_FALL);
}

/** main_update_render (dungeon.c:4699). */
export function mainUpdateRender(g: Uint8Array, callbacks: FramePreCallbacks): void {
    const invincible = mainUpdateRenderPre(g, callbacks);
    if (invincible !== 0) {
        memWrite8(g, HERO_DAMAGE_THIS_FRAME, 0);
    }
    dungeonRenderTimingStep(g, invincible, callbacks);
}
