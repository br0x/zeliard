/**
 * boss-alguien.ts — TS port of src/akma.c (Stage 9i): "Alguien" boss AI.
 * A flying blob that crawls along arena walls climbing row by row,
 * flipping direction at the top and starting a sweep-attack telegraph
 * whose execution spawns a fan of hitboxes (ground sweep vs diagonal
 * sweep per attack pattern, mirrored by flight phase). The pose mask
 * tables are rotated in place every frame exactly like the original's
 * `rol [bp],1` consumption (each byte rotates exactly 8 times per call,
 * so tables end each call where they started).
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
const HERO_X_VIEW = 0x83;
const MAP_WIDTH = 0xc002; // word
const BOSS_HEALTH_REQUEST = 0xff9f;



// ─── persistent state (byte_AA1E .. byte_AA29) ───

let activeSpriteCount = 0; // monsters_table write cursor this frame
let hitFlags = 0;          // packed result of last frame's hit pass
let animPhase = 0;         // cycles 0..2
let flightPhase = 0;       // 0 / 0xFF
let lastRelX = 0;
let frameCounter = 0;
let overlayFrame = 0;
let attackActive = 0;      // 0xFF while the sweep cycle runs
let attackStep = 0;        // up during telegraph, down during execution
let attackHolding = 0;     // 0xFF once firing
let attackPattern = 0;     // 0 ground sweep, 1 diagonal sweep
let deathTimer = 0;

// "Limb grid": single contiguous 13×16 = 208-byte scratch buffer.
const LIMB_GRID_SIZE = 208;
const limbGrid = new Uint8Array(LIMB_GRID_SIZE);

// Offsets into limb_grid matching the original sub-labels.
const GRID_OFF_AA33 = 9;   // secondary overlay slot, flight_phase == 0
const GRID_OFF_AA67 = 61;  // arm overlay base, flight_phase != 0
const GRID_OFF_AA87 = 93;  // arm overlay base, flight_phase == 0
const GRID_OFF_AAD3 = 169; // secondary overlay slot, flight_phase != 0

// ─── pose layout/mask tables ───

const LAYOUT_A7FA = [0x00, 0x50, 0x10, 0x13, 0x12, 0x11, 0x01, 0x02, 0x51, 0x14, 0x15, 0x16, 0x17, 0x18, 0x03, 0x04, 0x19, 0x1a, 0x1b, 0x1c, 0x05, 0x06, 0x1d, 0x1e, 0x07];
const LAYOUT_A813 = [0x10, 0x15, 0x07, 0x11, 0x12, 0x13, 0x14, 0x05, 0x06, 0x16, 0x17, 0x18, 0x19, 0x03, 0x04, 0x1a, 0x1b, 0x1c, 0x1d, 0x01, 0x02, 0x50, 0x1e, 0x00, 0x51];
const LAYOUT_A82C = [0x00, 0x50, 0x20, 0x01, 0x02, 0x51, 0x21, 0x22, 0x03, 0x04, 0x23, 0x24, 0x08, 0x09, 0x25, 0x26];
const LAYOUT_A83C = [0x20, 0x21, 0x08, 0x22, 0x23, 0x09, 0x24, 0x25, 0x03, 0x04, 0x26, 0x01, 0x02, 0x50, 0x00, 0x51];
const LAYOUT_A84C = [0x00, 0x50, 0x27, 0x01, 0x02, 0x51, 0x28, 0x29, 0x03, 0x04, 0x2a, 0x2b, 0x05, 0x06, 0x07, 0x2c, 0x2d, 0x2e];
const LAYOUT_A85E = [0x2e, 0x2c, 0x2d, 0x07, 0x2a, 0x2b, 0x05, 0x06, 0x28, 0x29, 0x03, 0x04, 0x27, 0x01, 0x02, 0x50, 0x00, 0x51];

// off_A7EE (flight_phase == 0)
const LAYOUT_TABLES_PHASE0: ReadonlyArray<ReadonlyArray<number>> = [LAYOUT_A7FA, LAYOUT_A82C, LAYOUT_A84C];
// off_A7F4 (flight_phase != 0)
const LAYOUT_TABLES_PHASE1: ReadonlyArray<ReadonlyArray<number>> = [LAYOUT_A813, LAYOUT_A83C, LAYOUT_A85E];

// Pose mask tables: 13 groups × 2 bytes = 26 bytes each. NOT const:
// rotated in place every frame by populate_limb_grid().
const MASK_A87C = Uint8Array.from([0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x2a, 0xa8, 0x40, 0x00, 0x2a, 0xb0, 0x00, 0x00, 0x56, 0x30, 0x88, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const MASK_A896 = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0x10, 0x56, 0x30, 0x00, 0x00, 0x2a, 0xb0, 0x40, 0x00, 0x2a, 0xa8, 0x04, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00]);
const MASK_A8B0 = Uint8Array.from([0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x02, 0xa8, 0x00, 0x00, 0x02, 0xb0, 0x00, 0x00, 0x01, 0x50, 0x00, 0x10, 0x00, 0xa0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const MASK_A8CA = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0xa0, 0x00, 0x10, 0x01, 0x50, 0x00, 0x00, 0x02, 0xb0, 0x00, 0x00, 0x02, 0xa8, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00]);
const MASK_A8E4 = Uint8Array.from([0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x02, 0xa8, 0x00, 0x00, 0x02, 0xb0, 0x00, 0x00, 0x0a, 0x30, 0x00, 0x10, 0x0a, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
const MASK_A8FE = Uint8Array.from([0x04, 0x00, 0x00, 0x00, 0x0a, 0x00, 0x00, 0x10, 0x0a, 0x30, 0x00, 0x00, 0x02, 0xb0, 0x00, 0x00, 0x02, 0xa8, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00]);

// off_A870 (flight_phase == 0)
const MASK_TABLES_PHASE0: ReadonlyArray<Uint8Array> = [MASK_A87C, MASK_A8B0, MASK_A8E4];
// off_A876 (flight_phase != 0)
const MASK_TABLES_PHASE1: ReadonlyArray<Uint8Array> = [MASK_A896, MASK_A8CA, MASK_A8FE];

// Small overlay tables: two alternating 10-byte "arm" variants (selected
// by frame_counter parity); 5 "secondary" bytes each (selected by
// overlay_frame).
const OVERLAY_ARM_A918 = [0xff, 0x30, 0xff, 0xff, 0xff, 0x31, 0x32, 0xff, 0xff, 0xff, 0xff, 0xff, 0x33, 0x34, 0xff, 0x35, 0x36, 0xff, 0xff, 0xff];
const OVERLAY_ARM_A92C = [0x30, 0xff, 0xff, 0x31, 0xff, 0xff, 0xff, 0x32, 0xff, 0xff, 0x33, 0xff, 0xff, 0x35, 0x34, 0x36, 0xff, 0xff, 0xff, 0xff];
const OVERLAY_SECONDARY_A940 = [0x40, 0x41, 0x42, 0x43, 0x44, 0x43, 0x45, 0x43, 0x46, 0x43];
const OVERLAY_SECONDARY_A94A = [0x40, 0x41, 0x42, 0x43, 0x44, 0x47, 0x45, 0x43, 0x46, 0x43];

// Flight-path Y-lookup tables: indexed by (boss_x_low - 10) >> 1.
const PATH_Y_A954 = [0x3c, 0x3c, 0x3d, 0x3e, 0x3f, 0x3f, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01];
const PATH_Y_A969 = [0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x3f, 0x3f, 0x3e, 0x3d, 0x3c, 0x3c];

/** Draw_Boss_Health equivalent. */
function drawBossHealth(g: Uint8Array): void {
    memWrite8(g, BOSS_HEALTH_REQUEST, 0xff);
}

/** Alguien_AI_reset (akma.c:213). flight_phase starts at 0xFF. */
export function alguienAiReset(): void {
    activeSpriteCount = 0;
    hitFlags = 0;
    animPhase = 0;
    flightPhase = 0xff;
    lastRelX = 0;
    frameCounter = 0;
    overlayFrame = 0;
    attackActive = 0;
    attackStep = 0;
    attackHolding = 0;
    attackPattern = 0;
    deathTimer = 0;
    limbGrid.fill(0xff);
}

// sub_A97E: subtract damage (clamped), redraw health, start death at 0.
function applyDamageToBoss(g: Uint8Array, damage: number): void {
    const bs = memRead16(g, BOSS_STATE_PTR);
    let hp = (memRead16(g, bs + 3) - damage) & 0xffff;
    if ((hp & 0x8000) !== 0) hp = 0; // int16 clamp at 0
    memWrite16(g, bs + 3, hp);

    drawBossHealth(g);

    if (memRead16(g, bs + 3) !== 0) return;
    if (memRead8(g, BOSS_BEING_HIT) !== 0) return; // death already started

    deathTimer = 0;
    attackActive = 0;
    memWrite8(g, BOSS_BEING_HIT, 0xff);
}

// loc_A9B0: thrash ~30 frames, hold a fixed pose ~10 more, then die.
function deathSequenceStep(g: Uint8Array): void {
    if (deathTimer >= 0x28) {
        memWrite8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    memWrite8(g, SPRITE_FLASH_FLAG, 0xff);
    const prev = deathTimer;
    deathTimer = (deathTimer + 1) & 0xff;

    if (prev < 0x1e) { // thrash phase
        animPhase = (animPhase + 1) % 3;

        frameCounter = (frameCounter + 1) & 0xff;
        overlayFrame = (overlayFrame + 1) & 1;

        if ((frameCounter & 3) === 0) {
            memWrite8(g, SOUND_FX_REQUEST, 55);
        }
    } else { // hold phase: freeze on a fixed pose
        animPhase = 1;
        overlayFrame = 1;
    }

    renderFrame(g);
}

// sub_A4D4: move 2 tiles left; fails once x-2 would be <= 9.
function tryMoveBossLeft(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    const x = (memRead16(g, bs + 0) - 2) & 0xffff;
    if (x <= 9) return 0;
    memWrite16(g, bs + 0, x);
    return 1;
}

// sub_A4E6: move 2 tiles right; fails once x+2 would exceed 0x33.
function tryMoveBossRight(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    const x = (memRead16(g, bs + 0) + 2) & 0xffff;
    if (x > 0x33) return 0;
    memWrite16(g, bs + 0, x);
    return 1;
}

// Shared hero-edge test behind loc_A3F5/loc_A46E. `invert` mirrors the
// second call site's extra `not al` before masking.
function computeEdgeFlag(g: Uint8Array, threshold: number, invert: boolean): number {
    const heroX = (memRead16(g, PROXIMITY_MAP_LEFT_COL) + memRead8(g, HERO_X_VIEW)) & 0xffff;
    const mapWidth = memRead16(g, MAP_WIDTH);
    const v = heroX >= mapWidth ? (heroX - mapWidth) & 0xffff : heroX;
    const below = v < threshold ? 1 : 0;
    return invert ? (below ^ 1) : below;
}

// Shared tail of both top-of-climb transitions: flip phase, start the
// sweep-attack telegraph, play the transition sound, pick the pattern.
function startAttackTelegraph(g: Uint8Array, newFlightPhase: number, edgeThreshold: number, invertEdge: boolean): void {
    flightPhase = newFlightPhase;
    attackHolding = 0;
    attackStep = 0;
    attackActive = 0xff;
    memWrite8(g, SOUND_FX_REQUEST, 52);
    attackPattern = computeEdgeFlag(g, edgeThreshold, invertEdge);
}

// loc_A492..loc_A4C2: count the telegraph up to a pattern-dependent
// threshold (7 or 8 frames), then back down to 0.
function updateAttackTelegraph(g: Uint8Array): void {
    void g;
    if (!attackActive) return;

    overlayFrame = (attackPattern + 2) & 0xff;

    if (attackHolding) {
        attackStep = (attackStep - 1) & 0xff;
        if (attackStep === 0) attackActive = 0;
    } else {
        attackStep = (attackStep + 1) & 0xff;
        const threshold = ((attackPattern !== 0 ? 0 : 1) + 7) & 0xff;
        if (attackStep >= threshold) attackHolding = 0xff;
    }
}

// sub_A7CC: lay out one body pose; the mask is consumed MSB-first with an
// in-place rotate-left per bit (net identity over a full call).
function populateLimbGrid(layout: ReadonlyArray<number>, mask: Uint8Array): void {
    let di = 0;
    let li = 0;
    let mi = 0;
    for (let col = 0; col < 13; col++) {
        for (let sub = 0; sub < 2; sub++) {
            for (let bit = 0; bit < 8; bit++) {
                const carry = ((mask[mi] ?? 0) & 0x80) !== 0 ? 1 : 0;
                mask[mi] = (((mask[mi] ?? 0) << 1) | carry) & 0xff;
                if (carry) limbGrid[di] = layout[li++] ?? 0xff;
                di++;
            }
            mi++;
        }
    }
}

// loc_A53C..loc_A54C: overlay a 5-slot "arm" fragment, alternating between
// 2 baked variants by frame_counter parity.
function applyOverlayArm(): void {
    let di: number;
    let src: ReadonlyArray<number>;
    let si: number;
    if (flightPhase) { di = GRID_OFF_AA67; src = OVERLAY_ARM_A92C; }
    else { di = GRID_OFF_AA87; src = OVERLAY_ARM_A918; }

    si = (frameCounter & 1) !== 0 ? 0x0a : 0x00;

    for (let i = 0; i < 5; i++) {
        limbGrid[di] = src[si] ?? 0xff;
        limbGrid[di + 1] = src[si + 1] ?? 0xff;
        si += 2;
        di += 16;
    }
}

// loc_A566 continuation: overlay a 2-slot "secondary" fragment selected
// by overlay_frame.
function applyOverlaySecondary(): void {
    let di: number;
    let src: ReadonlyArray<number>;
    if (flightPhase) { di = GRID_OFF_AAD3; src = OVERLAY_SECONDARY_A94A; }
    else { di = GRID_OFF_AA33; src = OVERLAY_SECONDARY_A940; }

    const idx = (overlayFrame * 2) & 0xff;
    limbGrid[di] = src[idx] ?? 0xff;
    limbGrid[di + 16] = src[idx + 1] ?? 0xff;
}

// loc_A58B..loc_A613: walk the limb grid, turning each non-0xFF slot into
// a hittable pseudo-monster entry. Returns the cursor past the last entry.
function renderBodyAndEmitSprites(g: Uint8Array): number {
    const bs = memRead16(g, BOSS_STATE_PTR);
    let si = memRead16(g, MONSTERS_LIST);
    let gridDi = 0;

    activeSpriteCount = 0;
    let x = memRead16(g, bs + 0); // .boss_x

    for (let col = 0; col < 13; col++) {
        const win = isInProximityWindow(g, x);
        lastRelX = win.xRel;

        if (win.inside) {
            for (let row = 0; row < 16; row++, gridDi++) {
                const cell = limbGrid[gridDi] ?? 0xff;
                if (cell === 0xff) continue;

                memWrite16(g, si + 0, x);                                          // .currX
                memWrite8(g, si + 2, (memRead8(g, bs + 2) + row) & 0x3f);                 // .currY
                memWrite8(g, si + 3, lastRelX);                                     // .m_x_rel
                memWrite8(g, si + 4, (cell >> 4) & 0xff);                           // .flags
                memWrite8(g, si + 6, cell);                                         // .anim_counter
                let ai = flightPhase & 0x80;
                if (hitFlags !== 0) ai |= 0x20;                              // hit-flash
                memWrite8(g, si + 5, ai);                                           // .ai_flags

                const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
                const oldTile = memRead8(g, di);
                memWrite8(g, di, (activeSpriteCount | 0x80) & 0xff);
                memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

                si += 16;
                activeSpriteCount = (activeSpriteCount + 1) & 0xff;
            }
        } else {
            gridDi += 16;
        }

        x = (x + 1) & 0xffff;
    }

    return si;
}

// sub_A78A: append one sweep-attack hitbox entry at (x,y).
function spawnHitbox(g: Uint8Array, si: number, x: number, y: number, tile: number, anim: number): number {
    memWrite16(g, si + 0, x);                              // .currX
    memWrite8(g, si + 2, y & 0x3f);                        // .currY
    memWrite8(g, si + 3, lastRelX);                        // .m_x_rel
    memWrite8(g, si + 4, tile);                            // .flags
    memWrite8(g, si + 6, anim);                            // .anim_counter
    memWrite8(g, si + 5, flightPhase & 0x80);              // .ai_flags

    const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
    const oldTile = memRead8(g, di);
    memWrite8(g, di, (activeSpriteCount | 0x80) & 0xff);
    memWrite8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

    activeSpriteCount = (activeSpriteCount + 1) & 0xff;
    return si + 16;
}

// loc_A613..loc_A785: while the sweep-attack executes (attack_active &&
// attack_step != 0), spawn a fan of attack_step hitboxes advancing outward
// from the boss; all but the closest use one anim, the last another.
function emitAttackHitboxes(g: Uint8Array, siArg: number): void {
    let si = siArg;
    if (!attackActive || attackStep === 0) {
        memWrite16(g, si, 0xffff);
        return;
    }

    const bs = memRead16(g, BOSS_STATE_PTR);
    const bx0 = memRead16(g, bs + 0);
    const by0 = memRead8(g, bs + 2);
    const steps = attackStep;

    if (!attackPattern) {
        // Shallow ground sweep, dy=+1 per dx=2 step.
        let x = flightPhase ? (bx0 + 0x0b) & 0xffff : bx0;
        let y = (by0 + 9) & 0xff;
        const dx = flightPhase ? 2 : -2;

        for (let i = 1; i < steps; i++) {
            x = (x + dx) & 0xffff;
            y = (y + 1) & 0xff;
            const win = isInProximityWindow(g, x);
            if (win.inside) {
                lastRelX = win.xRel;
                si = spawnHitbox(g, si, x, y, 0x26, 0x03);
            }
        }
        x = (x + dx) & 0xffff;
        y = (y + 1) & 0xff;
        const win = isInProximityWindow(g, x);
        if (win.inside) {
            lastRelX = win.xRel;
            si = spawnHitbox(g, si, x, y, 0x26, 0x02);
        }
    } else {
        // Steep diagonal sweep, dy=+2 per dx=2 step.
        let x = flightPhase ? (bx0 + 0x0a) & 0xffff : (bx0 + 1) & 0xffff;
        let y = (by0 + 9) & 0xff;
        const dx = flightPhase ? 2 : -2;

        for (let i = 1; i < steps; i++) {
            x = (x + dx) & 0xffff;
            y = (y + 2) & 0xff;
            const win = isInProximityWindow(g, x);
            if (win.inside) {
                lastRelX = win.xRel;
                si = spawnHitbox(g, si, x, y, 0x26, 0x07);
            }
        }
        x = (x + dx) & 0xffff;
        y = (y + 2) & 0xff;
        const win = isInProximityWindow(g, x);
        if (win.inside) {
            lastRelX = win.xRel;
            si = spawnHitbox(g, si, x, y, 0x26, 0x06);
        }
    }

    memWrite16(g, si, 0xffff);
}

// loc_A4F7..loc_A785 shared render tail.
function renderFrame(g: Uint8Array): void {
    limbGrid.fill(0xff);

    {
        const layoutSet = flightPhase ? LAYOUT_TABLES_PHASE1 : LAYOUT_TABLES_PHASE0;
        const maskSet = flightPhase ? MASK_TABLES_PHASE1 : MASK_TABLES_PHASE0;
        const idx = animPhase & 3;
        populateLimbGrid(layoutSet[idx] ?? [], maskSet[idx] ?? MASK_A87C);
    }

    applyOverlayArm();
    applyOverlaySecondary();

    const si = renderBodyAndEmitSprites(g);
    emitAttackHitboxes(g, si);
}

/** Alguien_AI (akma.c:233) — entry point, called once per frame. */
export function alguienAi(g: Uint8Array, m: number): void {
    void m;

    const base = memRead16(g, MONSTERS_LIST);
    let si = base;
    activeSpriteCount = 0;
    hitFlags = 0;

    // Walk last frame's pseudo-monster entries, restore tiles, pick up the
    // FIRST hit flagged this frame.
    for (;;) {
        if (memRead16(g, si + 0) === 0xffff) break;

        const win = isInProximityWindow(g, memRead16(g, si + 0));
        if (win.inside) {
            memWrite8(g, si + 3, win.xRel);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            memWrite8(g, di, memRead8(g, PROXIMITY_LAYER2 + activeSpriteCount));

            if ((memRead8(g, si + 5) & 0x40) !== 0) {
                if ((hitFlags & 0x80) === 0) { // only record the first hit found
                    let al = memRead8(g, si + 5) & 0x1f;
                    if (memRead8(g, si + 4) === 5) al |= 0x80; // vulnerable segment marker
                    hitFlags = al;
                }
            }
        }

        activeSpriteCount = (activeSpriteCount + 1) & 0xff;
        si += 16;
    }

    si = base;
    memWrite16(g, si, 0xffff);

    if (hitFlags !== 0) {
        const stat = getStats(g, hitFlags & 0x1f);
        memWrite8(g, SOUND_FX_REQUEST, 34);
        applyDamageToBoss(g, stat);
    }

    if (memRead8(g, BOSS_BEING_HIT) !== 0) {
        deathSequenceStep(g);
        return;
    }

    // Normal per-frame animation & movement bookkeeping.
    overlayFrame = 0;

    animPhase = (animPhase + 1) % 3;
    if (animPhase === 1) memWrite8(g, SOUND_FX_REQUEST, 43);

    frameCounter = (frameCounter + 1) & 0xff;

    let recomputeY = false;

    if (!flightPhase) {
        // Crawling toward the left wall.
        if (tryMoveBossLeft(g) !== 0) {
            recomputeY = true;
        } else {
            // Hit the left wall -- climb one row.
            const bs = memRead16(g, BOSS_STATE_PTR);
            const y = (memRead8(g, bs + 2) - 2) & 0x3f;
            memWrite8(g, bs + 2, y);
            if (y === 0x3d) {
                // Reached the top -- flip to the returning phase, start a
                // sweep-attack telegraph, then run the Y-lookup.
                startAttackTelegraph(g, 0xff, 0x28, false);
                recomputeY = true;
            }
            // else: the Y-lookup must NOT run after a plain mid-wall climb.
        }
    } else {
        // Crawling toward the right wall.
        if (tryMoveBossRight(g) !== 0) {
            recomputeY = true;
        } else {
            const bs = memRead16(g, BOSS_STATE_PTR);
            const y = (memRead8(g, bs + 2) - 2) & 0x3f;
            memWrite8(g, bs + 2, y);
            if (y === 0x3d) {
                startAttackTelegraph(g, 0, 0x14, true);
                recomputeY = true;
            }
        }
    }

    // Recompute boss_y from boss_x via the flight-path table (only after a
    // successful move or a top-of-climb flip).
    if (recomputeY) {
        const bs = memRead16(g, BOSS_STATE_PTR);
        const table = flightPhase ? PATH_Y_A954 : PATH_Y_A969;
        const bxLow = memRead16(g, bs + 0) & 0xff;
        const idx = ((bxLow - 0x0a) >> 1) & 0xff;
        memWrite8(g, bs + 2, table[idx] ?? 0);
    }

    updateAttackTelegraph(g);
    renderFrame(g);
}
