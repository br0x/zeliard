/**
 * boss-paguro.ts — TS port of src/zel2.c (Stage 9i): "Paguro" boss AI.
 * A 4×3 body-segment blob that idles along a reference column, runs a
 * 10-step movement-pattern attack sequence, and arms near/far shots gated
 * on anim phase and position. Two behavioral differences from Agar
 * (zela.c) are preserved: every hit plays SFX 36 with plain stat/2
 * damage (no heavy-segment rule), and the shot templates carry a
 * different projectile-type byte. The collect pass keeps the LAST hit
 * segment each frame (the original's first-hit guard is dead code);
 * quirk preserved.
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import { coordsToProxAddr } from './dungeon-entities.js';
import { isInProximityWindow } from './dungeon-monsters.js';
import { getStats, getRandom } from './dungeon-combat.js';

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

// ─── persistent state (byte_A5F6 .. byte_A602) ───

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

// unk_A603 staging buffer: (tile, frame) per 12 segment slots.
const bodyTile = new Uint8Array(12);
const bodyFrame = new Uint8Array(12);

// Written only, never read in this module (the armed-shot markers live
// inside the staging table's frame slots — see file header in zel2.c).
let byteA606 = 0;
let byteA60C = 0;
let byteA612 = 0;
let byteA618 = 0;
void byteA606; void byteA60C; void byteA612; void byteA618;

// byte_A4DB: per-anim_phase facing/body-tile id.
const MOVEMENT_FACING_TABLE = [2, 1, 0, 3, 4, 3, 0, 1];

// Projectile templates. Byte 2 is a projectile-type index into the
// DUNGEONS[] projectiles table (remap convention as the other bosses).
const PROJ_NEAR = [0, 0, 0, 0, 50, 4, 120, 0, 0, 0, 0, 0, 0];
const PROJ_FAR = [0, 0, 0, 0, 50, 0, 120, 0, 0, 0, 0, 0, 0];

// ─── boss_state_block accessors ───

function bossState(g: Uint8Array): number {
    return g16(g, BOSS_STATE_PTR);
}
function getBossX(g: Uint8Array): number {
    return g16(g, bossState(g) + 0);
}
function setBossX(g: Uint8Array, v: number): void {
    s16(g, bossState(g) + 0, v);
}
function getBossY(g: Uint8Array): number {
    return g8(g, bossState(g) + 2);
}
function setBossY(g: Uint8Array, v: number): void {
    s8(g, bossState(g) + 2, v);
}

/** Paguro_AI_reset (zel2.c:208). */
export function paguroAiReset(): void {
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
    byteA606 = 0;
    byteA60C = 0;
    byteA612 = 0;
    byteA618 = 0;
}

// ─── shared helpers ───

// The repeated "wrap (left_col_x + offset) against mapWidth" idiom.
function wrapCol(g: Uint8Array, offset: number): number {
    const left = g16(g, PROXIMITY_MAP_LEFT_COL);
    const width = g16(g, MAP_WIDTH);
    let v = (left + offset) & 0xffff;
    if (v >= width) v = (v - width) & 0xffff;
    return v;
}

// sub_A525: move right one step, blocked at x == 50.
function moveBossRight(g: Uint8Array): number {
    if (getBossX(g) === 50) return 0;
    setBossX(g, (getBossX(g) + 1) & 0xffff);
    return 1;
}

// sub_A534: move left one step, blocked at x == 17.
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

// sub_A339: nudge toward the reference column unless walled.
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

// funcs_A2F1 entries
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
// sub_A30C: falls through into move_boss_S in the original — resets the
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

// sub_A55D (damage half).
function applyDamageToBoss(g: Uint8Array, damage: number): void {
    let hp = getBossHpSafe(g) - damage;
    if (hp < 0) hp = 0;
    setBossHpSafe(g, hp);

    s8(g, BOSS_HEALTH_REQUEST, 0xff); // Draw_Boss_Health

    if (hp !== 0) return;
    if (g8(g, BOSS_BEING_HIT) !== 0) return; // death already started

    // No guard here against re-entering on a later frame if struck again
    // mid death-sequence (unlike zela.c) — reproduced as-is.
    s8(g, BOSS_BEING_HIT, 0xff);
    deathTimer = 0;
    projectileRequest = 0;
    browseProjectilesList(g);
}

function getBossHpSafe(g: Uint8Array): number {
    return g16(g, bossState(g) + 3);
}
function setBossHpSafe(g: Uint8Array, v: number): void {
    s16(g, bossState(g) + 3, v);
}

/** Browse_Projectiles equivalent (clears the projectile array). */
function browseProjectilesList(g: Uint8Array): void {
    s8(g, 0xeb80, 0xff);
}

// loc_A58B..loc_A5D9: flash/death sequence.
function hitFlashAndDeathStep(g: Uint8Array): void {
    if (deathTimer >= 0x28) { // death sequence finished
        s8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    s8(g, SPRITE_FLASH_FLAG, 0xff);
    deathTimer++;

    if (deathTimer >= 0x15) {
        animPhase = 2;
    } else {
        if (!(deathTimer & 3)) {
            s8(g, SOUND_FX_REQUEST, 40);
        }
        animPhase = (animPhase + 1) & 7;
    }

    stageBodySegments(animPhase);
    placeBossBodySegments(g);
}

// loc_A3B9 fill loop / loc_A5B7: fill the 12-slot staging table.
function stageBodySegments(phaseIdx: number): void {
    const tile = MOVEMENT_FACING_TABLE[phaseIdx & 7] ?? 0;
    for (let i = 0; i < 12; i++) {
        bodyTile[i] = tile;
        bodyFrame[i] = i;
    }
}

// loc_A458..loc_A4D1: lay out the 4×3 body segments.
function placeBossBodySegments(g: Uint8Array): void {
    segmentRenderIndex = 0;
    const base = g16(g, MONSTERS_LIST);
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
                s16(g, si + 0, x);                    // .currX
                s8(g, si + 2, y);                     // .currY
                s8(g, si + 3, lastColRelX);           // .m_x_rel
                s8(g, si + 4, bodyTile[stageIdx] ?? 0);  // .flags
                s8(g, si + 5, 0);                     // .ai_flags
                s8(g, si + 6, bodyFrame[stageIdx] ?? 0); // .anim_counter
                stageIdx++;

                const di = coordsToProxAddr(g, g8(g, si + 3), g8(g, si + 2));
                const oldTile = g8(g, di);
                s8(g, di, (segmentRenderIndex | 0x80) & 0xff);
                s8(g, PROXIMITY_LAYER2 + segmentRenderIndex, oldTile);

                si += 16;
                segmentRenderIndex++;
                y = (y + 2) & 0x3f;
            }
        }

        x = (x + 2) & 0xffff;
    }

    s16(g, si, 0xffff); // terminator
}

// sub_A4E3: patch both templates' dynamic fields and fire the selected shot.
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

/** Add_Projectile_To_Array equivalent. */
function addProjectile(g: Uint8Array, src: ArrayLike<number>): void {
    if ((g8(g, 0x9f1f) ?? 0) >= 32 - 1) return;
    let di = 0xeb80;
    while (g8(g, di) !== 0xff) di += PROJECTILE_STRUCT_SIZE;
    for (let i = 0; i < PROJECTILE_STRUCT_SIZE; i++) {
        s8(g, di + i, src[i] ?? 0);
    }
    di += PROJECTILE_STRUCT_SIZE;
    s8(g, di, 0xff);
    s8(g, 0x9f1f, (g8(g, 0x9f1f) + 1) & 0xff);
}

// loc_A444 / loc_A422
function nearShotPrepare(g: Uint8Array): void {
    byteA606 = 0x0e;
    byteA60C = 0x0f;
    if (animPhase !== 4) return;
    fireProjectile(g);
}
function farShotPrepare(g: Uint8Array): void {
    byteA612 = 0x0c;
    byteA618 = 0x0d;
    if (animPhase !== 0) return;
    fireProjectile(g);
}

// loc_A3EB: 1-in-2 chance to arm a shot when positioned appropriately.
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

// loc_A3B9: shared per-frame tail.
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

// loc_A380..loc_A3B9: asymmetric nudge toward the reference column.
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

// loc_A362: idle frame (or hit-flash re-entry).
function idleOrHitflashBranch(g: Uint8Array): void {
    if (g8(g, BOSS_BEING_HIT) !== 0) {
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

// loc_A2AF: advance the active sequence's movement pattern / pause.
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
    const base = g16(g, MONSTERS_LIST);
    let si = base;
    segmentRenderIndex = 0;
    pendingHitFlags = 0;

    for (;;) {
        if (g16(g, si + 0) === 0xffff) break; // .currX sentinel

        const win = isInProximityWindow(g, g16(g, si + 0));
        if (win.inside) {
            s8(g, si + 3, win.xRel);

            const di = coordsToProxAddr(g, g8(g, si + 3), g8(g, si + 2));
            s8(g, di, g8(g, PROXIMITY_LAYER2 + segmentRenderIndex));

            if ((g8(g, si + 5) & 0x40) !== 0) {
                if (!(pendingHitFlags & 0x80)) {
                    pendingHitFlags = g8(g, si + 5) & 0x1f;
                }
            }
        }

        segmentRenderIndex++;
        si += 16;
    }

    si = base;
    s16(g, si, 0xffff);
}

/** Paguro_AI (zel2.c:232) — entry point, called once per frame. */
export function paguroAi(g: Uint8Array, m: number): void {
    void m;

    collectHitAndRestoreTiles(g);

    // Apply damage from any segment struck last frame: SFX 36, plain
    // stat/2 damage — no heavy-segment rule (unlike Agar).
    if (pendingHitFlags !== 0) {
        const stat = getStats(g, pendingHitFlags & 0x1f);
        const dmg = (stat >> 1) & 0xffff;

        s8(g, SOUND_FX_REQUEST, 36);
        applyDamageToBoss(g, dmg);

        // Recoil further relative to the wrapped reference column.
        const col = wrapCol(g, 0x0f);
        if (getBossX(g) >= col) {
            moveBossRight(g);
            moveBossRight(g);
        } else {
            moveBossLeft(g);
            moveBossLeft(g);
        }
    }

    if (g8(g, BOSS_BEING_HIT) !== 0) {
        hitFlashAndDeathStep(g);
        return;
    }

    if (!attackActive) {
        const r = getRandom(g) & 0x0f;
        if (r !== 0 || g8(g, BOSS_BEING_HIT) !== 0) {
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

    // An already-active sequence reaches here WITHOUT the boss_being_hit
    // check — it keeps running even while the boss flashes from a hit.
    attackPatternStep(g);
}
