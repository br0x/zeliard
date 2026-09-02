/**
 * boss-agar.ts — TS port of src/zela.c (Stage 9g): "Agar" boss AI.
 * A 4×3 body-segment blob that idles along a reference column, runs a
 * 10-step movement-pattern attack sequence (north/south steps with
 * alignment nudges, ending in a fall-through south step), and arms
 * near/far shots gated on anim phase and position. The collect pass
 * keeps the LAST hit segment each frame, not the first — the original's
 * "already recorded" guard can never fire (pending flags are always
 * masked 0x1F); quirk preserved.
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
const MAP_WIDTH = 0xc002; // word
const BOSS_HEALTH_REQUEST = 0xff9f;

const PROJECTILE_STRUCT_SIZE = 13;



// ─── persistent state (byte_A603 .. byte_A625) ───

let animPhase = 0;                 // facing/animation phase, cycles 0..7
let projectileRequest = 0;         // 0 none; 1 near armed; 2 far armed
let attackActive = 0;              // 0 idle; 0xFF/0x7F sequence running
let approachSideFlag = 0;
let attackPending = 0;             // 0 advance pattern; else pause counting
let patternStepIndex = 0;
let movementPatternSubcounter = 0;
let segmentRenderIndex = 0;        // write cursor / layer2 index
let idleAlignCounter = 2;          // triggers anim_phase++ every other frame
let pendingHitFlags = 0;
let lastColRelX = 0;
let deathTimer = 0;
let boundaryReachedFlag = 0;

// word_A610 staging buffer: (tile, frame) per 12 segment slots.
const bodyTile = new Uint8Array(12);
const bodyFrame = new Uint8Array(12);

// Written only, never read in this module (consumed by a generic
// explosion/attack-telegraph renderer elsewhere) — kept as state bytes.
let byteA613 = 0;
let byteA619 = 0;
let byteA61F = 0;
let byteA625 = 0;
void byteA613; void byteA619; void byteA61F; void byteA625;

// byte_A4EA: per-anim_phase facing/body-tile id.
const MOVEMENT_FACING_TABLE = [2, 1, 0, 3, 4, 3, 0, 1];

// Projectile templates. Byte 2 is a projectile-type index into the
// DUNGEONS[] projectiles table (original raw base tiles 0x15/0x14 remapped
// to group 0, as in zela.c).
const PROJ_NEAR = [0, 0, 0, 0, 50, 4, 80, 0, 0, 0, 0, 0, 0];
const PROJ_FAR = [0, 0, 0, 0, 50, 0, 80, 0, 0, 0, 0, 0, 0];

// ─── boss_state_block accessors ───

function bossState(g: Uint8Array): number {
    return memRead16(g, BOSS_STATE_PTR);
}
function getBossX(g: Uint8Array): number {
    return memRead16(g, bossState(g) + 0);
}
function setBossX(g: Uint8Array, v: number): void {
    memWrite16(g, bossState(g) + 0, v);
}
function getBossY(g: Uint8Array): number {
    return memRead8(g, bossState(g) + 2);
}
function setBossY(g: Uint8Array, v: number): void {
    memWrite8(g, bossState(g) + 2, v);
}

/** Agar_AI_reset (zela.c:182). */
export function agarAiReset(): void {
    animPhase = 0;
    projectileRequest = 0;
    attackActive = 0;
    approachSideFlag = 0;
    attackPending = 0;
    patternStepIndex = 0;
    movementPatternSubcounter = 0;
    segmentRenderIndex = 0;
    idleAlignCounter = 2;
    pendingHitFlags = 0;
    lastColRelX = 0;
    deathTimer = 0;
    boundaryReachedFlag = 0;
    byteA613 = 0;
    byteA619 = 0;
    byteA61F = 0;
    byteA625 = 0;
}

// ─── shared helpers ───

// The repeated "wrap (left_col_x + offset) against mapWidth" idiom.
function wrapCol(g: Uint8Array, offset: number): number {
    const left = memRead16(g, PROXIMITY_MAP_LEFT_COL);
    const width = memRead16(g, MAP_WIDTH);
    let v = (left + offset) & 0xffff;
    if (v >= width) v = (v - width) & 0xffff;
    return v;
}

// sub_A534: move right one step, blocked at x == 50.
function moveBossRight(g: Uint8Array): number {
    if (getBossX(g) === 50) return 0;
    setBossX(g, (getBossX(g) + 1) & 0xffff);
    return 1;
}

// sub_A543: move left one step, blocked at x == 17.
function moveBossLeft(g: Uint8Array): number {
    if (getBossX(g) === 17) return 0;
    setBossX(g, (getBossX(g) - 1) & 0xffff);
    return 1;
}

function moveBossN(g: Uint8Array): void {
    setBossY(g, (getBossY(g) - 1) & 0x3f);
}
function moveBossS(g: Uint8Array): void {
    setBossY(g, (getBossY(g) + 1) & 0x3f);
}

// loc_A348..loc_A367: nudge toward the reference column unless walled.
function alignmentAdjust(g: Uint8Array): void {
    if (boundaryReachedFlag) return;

    const col = wrapCol(g, 0x0c);
    if (getBossX(g) === col) return;

    if (approachSideFlag) {
        if (moveBossLeft(g) === 0) boundaryReachedFlag = 0xff;
    } else {
        if (moveBossRight(g) === 0) boundaryReachedFlag = 0xff;
    }
}

// funcs_A300 entries
function movementStep0(g: Uint8Array): void {
    moveBossN(g);
}
function movementStepNAlign(g: Uint8Array): void {
    moveBossN(g);
    alignmentAdjust(g);
}
function movementStepAlignOnly(g: Uint8Array): void {
    alignmentAdjust(g);
}
function movementStepSAlign(g: Uint8Array): void {
    moveBossS(g);
    alignmentAdjust(g);
}
// sub_A31B: falls through into move_boss_S in the original — resets the
// attack-sequence flags AND performs a south step, no alignment after.
function movementStepFinalize(g: Uint8Array): void {
    attackActive = 0x7f;
    attackPending = 0x7f;
    boundaryReachedFlag = 0;
    moveBossS(g);
}

const MOVEMENT_STEPS: ReadonlyArray<(g: Uint8Array) => void> = [
    movementStep0,
    movementStepNAlign, movementStepNAlign, movementStepNAlign,
    movementStepAlignOnly, movementStepAlignOnly,
    movementStepSAlign, movementStepSAlign, movementStepSAlign,
    movementStepFinalize,
];

// sub_A56C (damage half).
function applyDamageToBoss(g: Uint8Array, damage: number): void {
    let hp = getBossHpSafe(g) - damage;
    if (hp < 0) hp = 0;
    setBossHpSafe(g, hp);

    memWrite8(g, BOSS_HEALTH_REQUEST, 0xff); // Draw_Boss_Health

    if (hp !== 0) return;
    if (memRead8(g, BOSS_BEING_HIT) !== 0) return; // death already started

    memWrite8(g, BOSS_BEING_HIT, 0xff);
    deathTimer = 0;
    projectileRequest = 0;
    browseProjectilesList(g);
}

function getBossHpSafe(g: Uint8Array): number {
    return memRead16(g, bossState(g) + 3);
}
function setBossHpSafe(g: Uint8Array, v: number): void {
    memWrite16(g, bossState(g) + 3, v);
}

/** Browse_Projectiles equivalent (clears the projectile array). */
function browseProjectilesList(g: Uint8Array): void {
    memWrite8(g, 0xeb80, 0xff);
}

// loc_A59A..loc_A5E8: flash/death sequence.
function hitFlashAndDeathStep(g: Uint8Array): void {
    if (deathTimer >= 0x28) { // death sequence finished
        memWrite8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    memWrite8(g, SPRITE_FLASH_FLAG, 0xff);
    deathTimer++;

    if (deathTimer >= 0x15) {
        animPhase = 2;
    } else {
        if (!(deathTimer & 3)) {
            memWrite8(g, SOUND_FX_REQUEST, 40);
        }
        animPhase = (animPhase + 1) & 7;
    }

    stageBodySegments(animPhase);
    placeBossBodySegments(g);
}

// loc_A3DA / loc_A5D5: fill the 12-slot staging table for the phase.
function stageBodySegments(phaseIdx: number): void {
    const tile = MOVEMENT_FACING_TABLE[phaseIdx & 7] ?? 0;
    for (let i = 0; i < 12; i++) {
        bodyTile[i] = tile;
        bodyFrame[i] = i;
    }
}

// loc_A467..loc_A4E0: lay out the 4×3 body segments.
function placeBossBodySegments(g: Uint8Array): void {
    segmentRenderIndex = 0;
    const base = memRead16(g, MONSTERS_LIST);
    let si = base;
    let x = getBossX(g);
    let stageIdx = 0;

    for (let col = 0; col < 4; col++) {
        const win = isInProximityWindow(g, x);
        lastColRelX = win.xRel;

        if (!win.inside) {
            stageIdx += 3; // skip this column's 3 staging entries
        } else {
            let y = getBossY(g);
            for (let row = 0; row < 3; row++) {
                memWrite16(g, si + 0, x);                    // .currX
                memWrite8(g, si + 2, y);                     // .currY
                memWrite8(g, si + 3, lastColRelX);           // .m_x_rel
                memWrite8(g, si + 4, bodyTile[stageIdx] ?? 0);  // .flags
                memWrite8(g, si + 5, 0);                     // .ai_flags
                memWrite8(g, si + 6, bodyFrame[stageIdx] ?? 0); // .anim_counter
                stageIdx++;

                const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
                const oldTile = memRead8(g, di);
                memWrite8(g, di, (segmentRenderIndex | 0x80) & 0xff);
                memWrite8(g, PROXIMITY_LAYER2 + segmentRenderIndex, oldTile);

                si += 16;
                segmentRenderIndex++;
                y = (y + 2) & 0x3f;
            }
        }

        x = (x + 2) & 0xffff;
    }

    memWrite16(g, si, 0xffff); // terminator
}

// sub_A4F2: patch both templates' dynamic fields and fire the selected shot.
function fireProjectile(g: Uint8Array): void {
    const y = (getBossY(g) + 3) & 0x3f;
    PROJ_FAR[1] = y;
    PROJ_NEAR[1] = y;

    PROJ_NEAR[0] = isInProximityWindow(g, (getBossX(g) + 1) & 0xffff).xRel;
    PROJ_FAR[0] = isInProximityWindow(g, (getBossX(g) + 7) & 0xffff).xRel;

    const tmpl = projectileRequest === 1 ? PROJ_NEAR : PROJ_FAR;
    addProjectile(g, tmpl);
    projectileRequest = 0;
}

/** Add_Projectile_To_Array (dungeon.c:5631). */
function addProjectile(g: Uint8Array, src: ArrayLike<number>): void {
    if ((memRead8(g, 0x9f1f) ?? 0) >= 32 - 1) return;
    let di = 0xeb80;
    while (memRead8(g, di) !== 0xff) di += PROJECTILE_STRUCT_SIZE;
    for (let i = 0; i < PROJECTILE_STRUCT_SIZE; i++) {
        memWrite8(g, di + i, src[i] ?? 0);
    }
    di += PROJECTILE_STRUCT_SIZE;
    memWrite8(g, di, 0xff);
    memWrite8(g, 0x9f1f, (memRead8(g, 0x9f1f) + 1) & 0xff);
}

// loc_A453 / loc_A431
function nearShotPrepare(g: Uint8Array): void {
    byteA613 = 0x0e;
    byteA619 = 0x0f;
    if (animPhase !== 4) return;
    fireProjectile(g);
}
function farShotPrepare(g: Uint8Array): void {
    byteA61F = 0x0c;
    byteA625 = 0x0d;
    if (animPhase !== 0) return;
    fireProjectile(g);
}

// loc_A3FA: 1-in-2 chance to arm a shot when positioned appropriately.
function randomProjectileTriggerCheck(g: Uint8Array): void {
    const r = getRandom(g);
    if (r & 1) return; // 50%: no roll this frame

    const col = wrapCol(g, 18);
    if (getBossX(g) >= col) {
        if (animPhase !== 2) return;
        projectileRequest = 1;
        nearShotPrepare(g);
        return;
    }

    const col2 = (col - 2) & 0xffff;
    if (((getBossX(g) + 7) & 0xffff) >= col2) return; // too far: abort
    if (animPhase !== 6) return;

    projectileRequest = 2;
    farShotPrepare(g);
}

// loc_A3C8: shared per-frame tail.
function renderAndProjectileTail(g: Uint8Array): void {
    stageBodySegments(animPhase);

    if (!attackActive) {
        if (projectileRequest === 0) {
            randomProjectileTriggerCheck(g);
        } else if (projectileRequest === 1) {
            nearShotPrepare(g);
        } else {
            farShotPrepare(g);
        }
    }

    placeBossBodySegments(g);
}

// loc_A38F..loc_A3BE: asymmetric nudge toward the reference column.
function idlePositionSync(g: Uint8Array): void {
    const col = wrapCol(g, 0x12);

    if (col >= getBossX(g)) {
        if (animPhase === 4) {
            if (moveBossRight(g) === 0) boundaryReachedFlag = 0xff;
        }
    } else {
        if (animPhase === 0) {
            if (moveBossLeft(g) === 0) boundaryReachedFlag = 0xff;
        }
    }
}

// loc_A371: idle frame (or hit-flash re-entry).
function idleOrHitflashBranch(g: Uint8Array): void {
    if (memRead8(g, BOSS_BEING_HIT) !== 0) {
        hitFlashAndDeathStep(g);
        return;
    }

    idleAlignCounter--;
    if (idleAlignCounter === 0) {
        idleAlignCounter = 2;
        animPhase = (animPhase + 1) & 7;
    }

    idlePositionSync(g);
    renderAndProjectileTail(g);
}

// loc_A2BE: advance the active sequence's movement pattern / pause.
function attackPatternStep(g: Uint8Array): void {
    animPhase = (animPhase + 2) & 6;

    if (attackPending !== 0) {
        movementPatternSubcounter = (movementPatternSubcounter + 1) & 3;
        if (movementPatternSubcounter === 0) {
            attackPending = 0;
            if (!(attackActive & 0x80)) {
                attackActive = 0;
            }
        }
    } else {
        const idx = patternStepIndex;
        patternStepIndex++;
        (MOVEMENT_STEPS[idx] ?? movementStep0)(g);
    }

    renderAndProjectileTail(g);
}

// loc_A1C4..loc_A207: walk last frame's segments, restore tiles, pick up
// hits (last hit wins — the original's first-hit guard is dead code).
function collectHitAndRestoreTiles(g: Uint8Array): void {
    const base = memRead16(g, MONSTERS_LIST);
    let si = base;
    segmentRenderIndex = 0;
    pendingHitFlags = 0;

    for (;;) {
        if (memRead16(g, si + 0) === 0xffff) break; // .currX sentinel

        const win = isInProximityWindow(g, memRead16(g, si + 0));
        if (win.inside) {
            memWrite8(g, si + 3, win.xRel);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            memWrite8(g, di, memRead8(g, PROXIMITY_LAYER2 + segmentRenderIndex));

            if ((memRead8(g, si + 5) & 0x40) !== 0) {
                if (!(pendingHitFlags & 0x80)) {
                    pendingHitFlags = memRead8(g, si + 5) & 0x1f;
                }
            }
        }

        segmentRenderIndex++;
        si += 16;
    }

    si = base;
    memWrite16(g, si, 0xffff);
}

/** Agar_AI (zela.c:206) — entry point, called once per frame. */
export function agarAi(g: Uint8Array, m: number): void {
    void m;

    collectHitAndRestoreTiles(g);

    // Apply damage from any segment struck last frame.
    if (pendingHitFlags !== 0) {
        const raw = pendingHitFlags;
        const stat = getStats(g, raw & 0x1f);
        let dmg = (stat >> 1) & 0xffff;

        if (raw === 4) { // segment id 4: "heavy" hit
            dmg = (dmg * 4) & 0xffff;
            memWrite8(g, SOUND_FX_REQUEST, 36);
        } else {
            memWrite8(g, SOUND_FX_REQUEST, 37);
        }

        applyDamageToBoss(g, dmg);

        // Recoil further in the direction relative to the wrapped column.
        const col = wrapCol(g, 0x0f);
        if (getBossX(g) >= col) {
            moveBossRight(g);
            moveBossRight(g);
        } else {
            moveBossLeft(g);
            moveBossLeft(g);
        }
    }

    if (memRead8(g, BOSS_BEING_HIT) !== 0) {
        hitFlashAndDeathStep(g);
        return;
    }

    if (!attackActive) {
        const r = getRandom(g) & 0x0f;
        if (r !== 0 || memRead8(g, BOSS_BEING_HIT) !== 0) {
            idleOrHitflashBranch(g);
            return;
        }

        // Trigger a fresh attack sequence.
        attackActive = 0xff;
        attackPending = 0xff;
        approachSideFlag = 0xff;
        patternStepIndex = 0;
        movementPatternSubcounter = 0;

        const col = wrapCol(g, 0x0e);
        if (getBossX(g) < col) approachSideFlag = 0;
    }

    attackPatternStep(g);
}
