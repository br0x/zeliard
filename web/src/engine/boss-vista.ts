/**
 * boss-vista.ts — TS port of src/meda.c (Stage 9g): "Vista" boss AI
 * (floating eye). Patrols the ceiling on a fixed terrain-height profile,
 * dives at the hero when he drifts into a trigger band and climbs back
 * up, fires a two-shot volley every wing-flap cycle, and renders a 14×12
 * body grid from four overlays (main body, secondary part,
 * direction-zone pose, wing-flap animation) whose shape masks rotate in
 * place — the 5 wing slots alias 3 physical arrays deliberately.
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import { coordsToProxAddr } from './dungeon-entities.js';
import { isInProximityWindow } from './dungeon-monsters.js';
import { getStats } from './dungeon-combat.js';
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
const MAP_WIDTH = 0xc002; // word
const BOSS_HEALTH_REQUEST = 0xff9f;
const SWORD_TYPE = 0x92;

const PROJECTILE_STRUCT_SIZE = 13;



// ─── persistent state (byte_A72F .. byte_A737) ───

let activeSpriteCount = 0;   // monsters-table write cursor this frame
let hitFlags = 0;            // bit 7 heavy segment (flags bit 3); bits 4-0 stat idx
let directionZone = 0;       // 0..4 hero quadrant; 5 = death pose
let animFrame = 0;           // wing-flap step 0..4; reaching 4 fires
let deathTimer = 0;          // 0..0x40 during the death sequence
let verticalState = 0;       // 0 patrol; 0xFF diving; 0x7F climbing
let diveDelay = 0;           // freeze-frame countdown before a dive moves
let horizDir = 0;            // 0 patrolling left; 0xFF right
let cooldown = 0;            // frames to skip after firing a volley

// byte_A738: flat 14×12 body grid (24 bytes per column).
const GRID_COLS = 14;
const GRID_ROWS = 12;
const GRID_STRIDE = 24; // 12 rows × 2 bytes
const BODY_GRID = new Uint8Array(GRID_COLS * GRID_STRIDE);

/** Vista_AI_reset (meda.c:217). Shape masks are intentionally NOT reset
 * (they're restored by full re-rotation each frame), matching precedent. */
export function vistaAiReset(): void {
    activeSpriteCount = 0;
    hitFlags = 0;
    directionZone = 0;
    animFrame = 0;
    deathTimer = 0;
    verticalState = 0;
    diveDelay = 0;
    horizDir = 0;
    cooldown = 0;
}

// ─── layout/shape tables (meda.c transcriptions) ───

// unk_A5DC / unk_A606: main body, 13 columns from grid (col 0, row 0)
const LAYOUT_BODY1 = [
    0, 7, 0, 8, 0, 9, 0, 0, 0, 2, 0, 0x0a, 0, 0x0b, 0, 0x0c, 0, 3, 1, 7,
    0, 4, 0, 5, 1, 9, 0, 6, 0, 0x0d, 0, 0x0e, 0, 0x0f, 0, 1, 1, 0, 1, 1, 1, 2,
];
const SHAPE_BODY1 = Uint8Array.of(0x2a, 0x80, 0x55, 0x00, 0x41, 0x00, 0x40, 0x00, 0x41, 0x00, 0x55, 0x80, 0x2a);

// unk_A613 / unk_A623: secondary body part, 11 columns from (col 1, row 8)
const LAYOUT_BODY2 = [1, 3, 1, 4, 0x0e, 2, 0x0e, 0, 0x0e, 1, 0x0e, 3, 1, 5, 1, 6];
const SHAPE_BODY2 = Uint8Array.of(0xc0, 0x10, 0x40, 0, 0, 0, 0, 0, 0x40, 0x10, 0xc0);

// off_A62E: direction-dependent overlay, 6 tables from (col 4, row 3);
// all six share one mutable mask (unk_A682), as in the original.
const LAYOUT_DIR = [
    [1, 0x0a, 1, 0x0d, 1, 0x0b, 1, 0x0e, 1, 0x0c, 1, 0x0f],
    [2, 0, 2, 3, 2, 1, 2, 4, 2, 2, 2, 5],
    [2, 6, 2, 9, 2, 7, 2, 0x0a, 2, 8, 2, 0x0b],
    [2, 0x0c, 2, 0x0f, 2, 0x0d, 3, 0, 2, 0x0e, 3, 1],
    [3, 2, 3, 5, 3, 3, 3, 6, 3, 4, 3, 7],
    [3, 8, 3, 0x0b, 3, 9, 3, 0x0c, 3, 0x0a, 3, 0x0d],
];
const SHAPE_DIRECTION = Uint8Array.of(0xa0, 0, 0xa0, 0, 0xa0);

// off_A687 / off_A6C7: wing-flap overlay, 5 frames from (col 4, row 7).
// Slots 0,1,4 alias one array — deliberate, matches off_A6C7 exactly.
const LAYOUT_WING = [
    [0x0e, 6, 0x0e, 4, 1, 8, 0x0e, 5, 0x0e, 7],
    [0x0e, 6, 0x0e, 8, 3, 0x0e, 0x0e, 9, 0x0e, 7],
    [0x0e, 0x0c, 0x0e, 0x0a, 0x0e, 0x0d, 1, 8, 0x0e, 0x0b, 0x0e, 7],
    [0x0e, 6, 0x0e, 0x0e, 0x0f, 0, 1, 8, 0x0e, 0x0f, 0x0e, 7],
    [0x0e, 6, 0x0f, 1, 1, 8, 0x0f, 2, 0x0e, 7],
];
const SHAPE_WING_A = Uint8Array.of(0x10, 0x20, 0x80, 0x20, 0x10); // unk_A6D1
const SHAPE_WING_B = Uint8Array.of(0x10, 0x30, 0x80, 0x20, 0x10); // unk_A6D6
const SHAPE_WING_C = Uint8Array.of(0x10, 0x28, 0x80, 0x20, 0x10); // unk_A6DB
const WING_SHAPE_TABLES: ReadonlyArray<Uint8Array> = [
    SHAPE_WING_A, SHAPE_WING_A, SHAPE_WING_B, SHAPE_WING_C, SHAPE_WING_A,
];

// byte_A6ED: ceiling-height profile indexed by (boss_x - 9).
const TERRAIN_HEIGHT_TABLE = [
    0x0c, 0x0b, 0x0a, 9, 8,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    8, 9, 0x0a, 0x0b, 0x0c,
];

// Projectile template: x_rel/y patched per shot. Byte 2 is a projectile-
// type index (original raw base tile 0x30 remapped to group 0, as meda.c).
const PROJECTILE_TEMPLATE = [0, 0, 0, 0, 0x32, 6, 0x50, 0, 0, 0, 0, 0, 0];

// ─── helpers ───

// sub_A575: subtract damage (clamped), redraw bar, start death once.
function applyDamageToBoss(g: Uint8Array, damage: number): void {
    const bs = memRead16(g, BOSS_STATE_PTR);
    let hp = (memRead16(g, bs + 3) - damage) << 16 >> 16; // int16_t
    if (hp < 0) hp = 0;
    memWrite16(g, bs + 3, hp);

    memWrite8(g, BOSS_HEALTH_REQUEST, 0xff); // Draw_Boss_Health

    if (memRead16(g, bs + 3) !== 0) return;
    if (memRead8(g, BOSS_BEING_HIT) !== 0) return;

    deathTimer = 0;
    memWrite8(g, BOSS_BEING_HIT, 0xff);
    browseProjectilesList(g);
}

/** Browse_Projectiles equivalent (clears the projectile array). */
function browseProjectilesList(g: Uint8Array): void {
    memWrite8(g, 0xeb80, 0xff);
}

// loc_A5A6: death sequence — thrash 32 frames, death pose 32 more.
function deathSequenceStep(g: Uint8Array): void {
    if (deathTimer >= 0x40) {
        memWrite8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    memWrite8(g, SPRITE_FLASH_FLAG, 0xff);
    deathTimer++;

    if (deathTimer < 0x20) {
        animFrame = 0;
        computeDirectionZone(g);
        buildFrameSpriteList(g);
        memWrite8(g, SOUND_FX_REQUEST, 35);
        return;
    }

    directionZone = 5;
    buildFrameSpriteList(g);
}

// sub_A42B: step boss_x left by 1; 0 at the left limit (x < 10).
function bossStepLeft(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    if (memRead8(g, bs + 0) < 10) return 0;
    memWrite8(g, bs + 0, (memRead8(g, bs + 0) - 1) & 0xff);
    return 1;
}

// sub_A41D: step boss_x right by 1; 0 at the right limit (x >= 49).
function bossStepRight(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    if (memRead8(g, bs + 0) >= 49) return 0;
    memWrite8(g, bs + 0, (memRead8(g, bs + 0) + 1) & 0xff);
    return 1;
}

// sub_A412: step boss_y down; 1 once the dive bottoms out (y >= 11).
function bossDescendOne(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    const y = (memRead8(g, bs + 2) + 1) & 0xff;
    memWrite8(g, bs + 2, y);
    return y >= 11 ? 1 : 0;
}

// sub_A408: step boss_y up; 1 once past the top row (y < 7).
function bossAscendOne(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    const y = (memRead8(g, bs + 2) - 1) & 0xff;
    memWrite8(g, bs + 2, y);
    return y < 7 ? 1 : 0;
}

// loc_A291..loc_A317: normal per-frame movement.
function updateBossPosition(g: Uint8Array): void {
    const bs = memRead16(g, BOSS_STATE_PTR);
    let useTerrainY = true;

    if (verticalState === 0) {
        if (memRead8(g, bs + 2) === 7) {
            let bx = (memRead16(g, PROXIMITY_MAP_LEFT_COL) + 0x10) & 0xffff;
            if (bx >= memRead16(g, MAP_WIDTH)) bx = (bx - memRead16(g, MAP_WIDTH)) & 0xffff;

            const bxBoss = memRead16(g, bs + 0);
            if (((bxBoss + 4) & 0xffff) < bx && ((bxBoss + 6) & 0xffff) >= bx) {
                diveDelay = 3;
                verticalState = 0xff;
            }
        }

        if (horizDir === 0) {
            if (bossStepLeft(g) === 0) horizDir = 0xff;
        } else {
            if (bossStepRight(g) === 0) horizDir = 0;
        }
    } else {
        if (diveDelay !== 0) {
            diveDelay--;
        } else {
            if ((verticalState & 0x80) !== 0) {
                if (bossDescendOne(g) !== 0) verticalState = 0x7f;
            } else {
                if (bossAscendOne(g) !== 0) verticalState = 0;
            }
            useTerrainY = false;
        }
    }

    if (useTerrainY) {
        const idx = (memRead8(g, bs + 0) - 9) & 0xff;
        memWrite8(g, bs + 2, TERRAIN_HEIGHT_TABLE[idx] ?? 0);
    }
}

// sub_A358: pick the direction zone for the body-pose overlay.
function computeDirectionZone(g: Uint8Array): void {
    const bs = memRead16(g, BOSS_STATE_PTR);
    let bx = (memRead16(g, PROXIMITY_MAP_LEFT_COL) + 0x10) & 0xffff;
    if (bx >= memRead16(g, MAP_WIDTH)) bx = (bx - memRead16(g, MAP_WIDTH)) & 0xffff;

    const bossX = memRead16(g, bs + 0);

    if ((((bossX + 1) & 0xffff) < bx) && (((bossX + 10) & 0xffff) >= bx)) {
        directionZone = 2;
        return;
    }

    if ((((bossX - 6) & 0xffff) < bx) && (((bossX + 17) & 0xffff) >= bx)) {
        directionZone = ((bossX + 7) & 0xffff) < ((bx + 1) & 0xffff) ? 3 : 1;
        return;
    }

    directionZone = ((bossX + 7) & 0xffff) < ((bx + 1) & 0xffff) ? 4 : 0;
}

// sub_A3C1: fire the two-shot volley; skip shots outside the viewport.
function fireProjectiles(g: Uint8Array): void {
    const bs = memRead16(g, BOSS_STATE_PTR);
    const bossX = memRead16(g, bs + 0);
    const bossY = memRead8(g, bs + 2);

    const winA = isInProximityWindow(g, (bossX + 6) & 0xffff);
    if (winA.inside) {
        PROJECTILE_TEMPLATE[0] = winA.xRel;
        PROJECTILE_TEMPLATE[1] = (bossY + 12) & 0x3f;
        addProjectile(g, PROJECTILE_TEMPLATE);
    }

    const winB = isInProximityWindow(g, (bossX + 7) & 0xffff);
    if (!winB.inside) return;

    PROJECTILE_TEMPLATE[0] = winB.xRel;
    PROJECTILE_TEMPLATE[1] = (bossY + 10) & 0x3f;
    addProjectile(g, PROJECTILE_TEMPLATE);
}

/** Add_Projectile_To_Array (dungeon.c:5631). */
function addProjectile(g: Uint8Array, src: ArrayLike<number>): void {
    if (memRead8(g, 0x9f1f) >= 32 - 1) return;
    let di = 0xeb80;
    while (memRead8(g, di) !== 0xff) di += PROJECTILE_STRUCT_SIZE;
    for (let i = 0; i < PROJECTILE_STRUCT_SIZE; i++) {
        memWrite8(g, di + i, src[i] ?? 0);
    }
    di += PROJECTILE_STRUCT_SIZE;
    memWrite8(g, di, 0xff);
    memWrite8(g, 0x9f1f, (memRead8(g, 0x9f1f) + 1) & 0xff);
}

// sub_A539: consume mask bytes (rotating in place), writing (tile,anim)
// pairs into the body grid — flat pointer walk preserved verbatim,
// including any spill past GRID_ROWS (never exercised by shipped masks).
function placeBodyPart(
    g: Uint8Array,
    layout: ReadonlyArray<number>,
    shape: Uint8Array,
    maskCount: number,
    colBase: number,
    rowBase: number,
): void {
    void g;
    let layoutIdx = 0;
    let di = colBase * GRID_STRIDE + rowBase * 2;

    for (let i = 0; i < maskCount; i++) {
        for (let bit = 0; bit < 8; bit++) {
            const carry = ((shape[i] ?? 0) & 0x80) !== 0 ? 1 : 0;
            shape[i] = (((shape[i] ?? 0) << 1) | carry) & 0xff;
            if (carry) {
                BODY_GRID[di] = layout[layoutIdx] ?? 0;
                BODY_GRID[di + 1] = layout[layoutIdx + 1] ?? 0;
                layoutIdx += 2;
            }
            di += 2;
        }
        di += 8;
    }
}

// sub_A438: rebuild the grid from the 4 overlays, then spawn sprites.
function buildFrameSpriteList(g: Uint8Array): void {
    BODY_GRID.fill(0xff);

    placeBodyPart(g, LAYOUT_BODY1, SHAPE_BODY1, 13, 0, 0);
    placeBodyPart(g, LAYOUT_BODY2, SHAPE_BODY2, 11, 1, 8);
    placeBodyPart(g, LAYOUT_DIR[directionZone] ?? LAYOUT_DIR[0]!, SHAPE_DIRECTION, 5, 4, 3);
    placeBodyPart(g, LAYOUT_WING[animFrame] ?? LAYOUT_WING[0]!, WING_SHAPE_TABLES[animFrame] ?? SHAPE_WING_A, 5, 4, 7);

    activeSpriteCount = 0;

    const bs = memRead16(g, BOSS_STATE_PTR);
    let di = memRead16(g, MONSTERS_LIST);
    let colX = memRead16(g, bs + 0);
    let gridOff = 0;

    for (let col = 0; col < GRID_COLS; col++) {
        const win = isInProximityWindow(g, colX);

        for (let row = 0; row < GRID_ROWS; row++) {
            const tile = BODY_GRID[gridOff + row * 2] ?? 0xff;
            const anim = BODY_GRID[gridOff + row * 2 + 1] ?? 0xff;

            if (win.inside && tile !== 0xff) {
                memWrite16(g, di + 0, colX);                                  // .currX
                memWrite8(g, di + 2, (memRead8(g, bs + 2) + row) & 0x3f);           // .currY
                memWrite8(g, di + 3, win.xRel);                               // .m_x_rel
                memWrite8(g, di + 4, tile);                                   // .flags <- tile idx
                memWrite8(g, di + 6, anim);                                   // .anim_counter
                memWrite8(g, di + 5, hitFlags !== 0 ? 0x20 : 0x00);           // .ai_flags

                const px = coordsToProxAddr(g, memRead8(g, di + 3), memRead8(g, di + 2));
                const oldTile = memRead8(g, px);
                memWrite8(g, px, (activeSpriteCount | 0x80) & 0xff);
                memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

                di += 16;
                activeSpriteCount++;
            }
        }

        colX = (colX + 1) & 0xffff;
        gridOff += GRID_STRIDE;
    }

    memWrite16(g, di, 0xffff);
}

/** Vista_AI (meda.c:233) — entry point, called once per frame. */
export function vistaAi(g: Uint8Array, m: number): void {
    void m; // ignores the generic monster-index parameter, as Pulpo_AI

    const base = memRead16(g, MONSTERS_LIST);
    let si = base;
    activeSpriteCount = 0;
    hitFlags = 0;

    // Walk last frame's body segments: restore proximity tiles, pick up
    // hits (first only).
    for (;;) {
        if (memRead16(g, si + 0) === 0xffff) break; // .currX sentinel

        const win = isInProximityWindow(g, memRead16(g, si + 0));
        if (win.inside) {
            memWrite8(g, si + 3, win.xRel);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            memWrite8(g, di, memRead8(g, PROXIMITY_LAYER2 + activeSpriteCount));

            if ((memRead8(g, si + 5) & 0x40) !== 0) { // struck this frame
                if (!(hitFlags & 0x80)) { // first hit only
                    let al = memRead8(g, si + 5) & 0x1f;
                    if ((memRead8(g, si + 4) & 0x08) !== 0) al |= 0x80; // vulnerable segment
                    hitFlags = al;
                }
            }
        }

        activeSpriteCount++;
        si += 16;
    }

    // Reset the sprite table; build_frame_sprite_list() repopulates it.
    si = base;
    memWrite16(g, si, 0xffff);

    const request = hitFlags & 0x1f;
    if (request !== 0) {
        const stat = getStats(g, request);
        let damage = (stat >> 3) & 0xffff;

        if (request === 1 && memRead8(g, SWORD_TYPE) >= 4) {
            damage = (damage << 5) & 0xffff; // ×32 total
            memWrite8(g, SOUND_FX_REQUEST, 0x2d);
        } else {
            memWrite8(g, SOUND_FX_REQUEST, 0x2e);
        }

        applyDamageToBoss(g, damage);
    }

    if (memRead8(g, BOSS_BEING_HIT) !== 0) {
        deathSequenceStep(g);
        return;
    }

    // Normal, alive-and-well per-frame behavior.
    updateBossPosition(g);
    computeDirectionZone(g);

    if (cooldown !== 0) {
        cooldown--;
    } else {
        animFrame++;
        if (animFrame === 5) {
            cooldown = 3;
            animFrame = 0;
        }
        if (animFrame === 4) {
            fireProjectiles(g);
        }
    }

    buildFrameSpriteList(g);
}
