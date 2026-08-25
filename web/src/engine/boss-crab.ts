/**
 * boss-crab.ts — TS port of src/crab.c (Stage 9f): "Cangrejo" boss AI.
 * The boss lays out 6 body rows × 10 columns of hittable pseudo-monster
 * entries into the shared monsters table each frame (tile index in
 * .flags, hit-flash bit 0x20 / struck bit 0x40 in .ai_flags), walks /
 * recoil / acid-drop phases, and an ink-droplet spawn driven by the
 * flags==0x14 "boss prop" entry.
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import {
    coordsToProxAddr,
} from './dungeon-entities.js';
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

// ─── persistent state ───

let activeSpriteCount = 0;
let hitMonsterFlags = 0;
// Packed: bit 7 = hit part's monster.flags & 0x10 (facing left);
// bits 4-0 = ai_flags & 0x1F of the part that was hit this frame.
let bodyAnimState = 0;
// Selects which body column-layout table to use (0-8 -> normal;
// 9 -> acid drip). Also drives the leg-cycle animation.
let crabEntityRow = 0;
let movementDirectionFlag = 0; // 0x00 = left; 0xFF = right
let movementTickCounter = 0;
let phaseAcidDropping = 0;
let acidStepIndex = 0; // 1..8 into ACID_APPROACH_BODY_STATES
let phaseRecoil = 0;
let recoilStepIndex = 0; // 0..3
let phasePlacingDroplet = 0;
let descentSeqIndex = 0;
let phaseSpawningDroplet = 0;
let spawnSeqIndex = 0;
let dropletTargetX = 0;
let dropletTargetY = 0;
let deathTimer = 0;

/** Cangrejo_AI_reset (crab.c:139). */
export function cangrejoAiReset(): void {
    activeSpriteCount = 0;
    hitMonsterFlags = 0;
    bodyAnimState = 0;
    crabEntityRow = 0;
    movementDirectionFlag = 0;
    movementTickCounter = 0;
    phaseAcidDropping = 0;
    acidStepIndex = 0;
    phaseRecoil = 0;
    recoilStepIndex = 0;
    phasePlacingDroplet = 0;
    descentSeqIndex = 0;
    phaseSpawningDroplet = 0;
    spawnSeqIndex = 0;
    dropletTargetX = 0;
    dropletTargetY = 0;
    deathTimer = 0;
}

// ─── layout tables ───

const CRAB_LAYOUT_NORMAL = [
    0xFF, 0xFF, 0xFF, 0x00, 0xFF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0x02, 0xFF, 0x03, 0xFF, 0x04, 0xFF, 0x05, 0xFF, 0x06, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0x07, 0xFF, 0x10, 0xFF, 0x11, 0xFF, 0x12, 0xFF, 0x08, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
];
const CRAB_LAYOUT_ACID_DRIP = [
    0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0x03, 0xFF, 0xFF, 0xFF, 0x05, 0xFF, 0xFF, 0xFF,
    0x02, 0xFF, 0xFF, 0xFF, 0x14, 0xFF, 0xFF, 0xFF, 0x06, 0xFF,
    0xFF, 0xFF, 0x90, 0xFF, 0xFF, 0xFF, 0x12, 0xFF, 0xFF, 0xFF,
    0xFF, 0x07, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x08, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
];
const BODY_STATE_TO_LAYOUT: ReadonlyArray<readonly number[]> = [
    CRAB_LAYOUT_NORMAL, CRAB_LAYOUT_NORMAL, CRAB_LAYOUT_NORMAL,
    CRAB_LAYOUT_NORMAL, CRAB_LAYOUT_NORMAL, CRAB_LAYOUT_NORMAL,
    CRAB_LAYOUT_NORMAL, CRAB_LAYOUT_NORMAL, CRAB_LAYOUT_NORMAL,
    CRAB_LAYOUT_ACID_DRIP,
];

const ACID_APPROACH_BODY_STATES = [7, 7, 8, 8, 8, 8, 8, 6];
const ACID_DESCENT_SEQUENCE = [
    0xF1, 0xF1, 0xF1, 0xF1, 0xF1, 0xF8, 0xF8, 0xF8, 0xF2, 0xF2, 0xF2, 0xF2, 0xF2, 0xFF,
];
const RECOIL_BODY_STATES = [7, 8, 8, 0];
const ACID_DROPLET_SPAWN_SEQUENCE = [0x80, 0x80, 0x80, 0x80, 0x80, 0x81, 0x82, 0x03, 0x04, 0xFF];

// ─── helpers ───

// boss_move_left: 1 if blocked (already at min X, 16).
function bossMoveLeft(g: Uint8Array): number {
    const bossState = g16(g, BOSS_STATE_PTR);
    if (g16(g, bossState + 0) !== 16) { // .boss_x
        s16(g, bossState + 0, (g16(g, bossState + 0) - 1) & 0xffff);
        return 0;
    }
    return 1;
}

// boss_move_right: 1 if blocked (already at max X, 49).
function bossMoveRight(g: Uint8Array): number {
    const bossState = g16(g, BOSS_STATE_PTR);
    if (g16(g, bossState + 0) !== 49) { // .boss_x
        s16(g, bossState + 0, (g16(g, bossState + 0) + 1) & 0xffff);
        return 0;
    }
    return 1;
}

// loc_A45C
function startAcidApproach(g: Uint8Array): void {
    acidStepIndex = 0;
    phaseAcidDropping = 0xff;
    acidApproachStep(g); // falls straight through into loc_A466
}

// loc_A466
function acidApproachStep(g: Uint8Array): void {
    acidStepIndex++;
    if (acidStepIndex === 8) {
        triggerAcidDrop(g);
        return;
    }
    bodyAnimState = ACID_APPROACH_BODY_STATES[acidStepIndex] ?? 0;
    renderBodyEntities(g);
}

// trigger_acid_drop / loc_A4B9
function triggerAcidDrop(g: Uint8Array): void {
    const bossState = g16(g, BOSS_STATE_PTR);
    if (!phasePlacingDroplet) {
        // first entry: pick a target column and initial movement direction
        const leftPlus12 = (g16(g, PROXIMITY_MAP_LEFT_COL) + 12) & 0xffff;
        const mapW = g16(g, MAP_WIDTH);
        const bound = leftPlus12 < mapW ? leftPlus12 : (leftPlus12 - mapW) & 0xffff;

        movementDirectionFlag = ((g16(g, bossState + 0) + 5) & 0xffff) < bound ? 0xff : 0x00; // .boss_x
        phaseAcidDropping = 0;
        descentSeqIndex = 0;
        phasePlacingDroplet = 0xff;
    }

    // loc_A4B9: per-tick descent step
    bodyAnimState = 9;

    const seq = ACID_DESCENT_SEQUENCE[descentSeqIndex] ?? 0;
    if (seq === 0xff) {
        beginRecoil(g);
        return;
    }

    const nibble = seq & 0x0f;
    if (nibble !== 8) {
        const shifted = nibble >> 1;
        const carryOut = nibble & 1;
        const step = (shifted - carryOut) & 0xff;
        s8(g, bossState + 2, (g8(g, bossState + 2) + step) & 0x3f);
    }

    if ((seq & 0xf0) !== 0) {
        if (movementDirectionFlag !== 0) {
            bossMoveRight(g);
        } else {
            bossMoveLeft(g);
        }
    }

    renderBodyEntities(g);
    descentSeqIndex++;
}

// begin_recoil / loc_A5D3
function beginRecoil(g: Uint8Array): void {
    if (!phaseRecoil) {
        movementDirectionFlag = ~movementDirectionFlag & 0xff;
        phasePlacingDroplet = 0;
        recoilStepIndex = 0;
        phaseRecoil = 0xff;
    }

    bodyAnimState = RECOIL_BODY_STATES[recoilStepIndex] ?? 0;
    recoilStepIndex++;
    if (recoilStepIndex === 4) {
        phaseRecoil = 0;
    }
    renderBodyEntities(g);
}

// death_sequence_handler: runs every frame once ADDR_BOSS_BEING_HIT is set.
function deathSequenceHandler(g: Uint8Array): void {
    if (deathTimer >= 0x28) {
        s8(g, BOSS_IS_DEAD, 0xff);
        return;
    }

    if (deathTimer < 0x1e && !(deathTimer & 1)) {
        s8(g, SOUND_FX_REQUEST, 35);
    }

    s8(g, SPRITE_FLASH_FLAG, 0xff);

    if (deathTimer >= 0x14) {
        deathTimer++;
        bodyAnimState = 8;
        renderBodyEntities(g);
        return;
    }

    deathTimer++;
    if (movementDirectionFlag !== 0) {
        // wiggle the body back down
        bodyAnimState = (bodyAnimState - 1) & 0xff;
        if (bodyAnimState === 0xff) {
            bodyAnimState = 0;
            movementDirectionFlag = 0;
        }
    } else {
        // wiggle the body up
        bodyAnimState++;
        if (bodyAnimState >= 6) {
            bodyAnimState = 5;
            movementDirectionFlag = 0xff;
        }
    }
    renderBodyEntities(g);
}

// apply_damage_to_boss: subtract damage (clamped), redraw health bar,
// start death sequence the first time HP reaches 0.
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

// render_body_entities (+ render_droplets_entities continuation)
function renderBodyEntities(g: Uint8Array): void {
    const bossState = g16(g, BOSS_STATE_PTR);
    const layout = BODY_STATE_TO_LAYOUT[bodyAnimState] ?? CRAB_LAYOUT_NORMAL;
    crabEntityRow = g8(g, bossState + 2); // .boss_y

    const base = g16(g, MONSTERS_LIST);
    let si = base;
    activeSpriteCount = 0;

    for (let row = 0; row < 6; row++) {
        const rowLayout = layout.slice(row * 10, row * 10 + 10);
        let colX = g16(g, bossState + 0); // .boss_x

        for (let col = 0; col < 10; col++) {
            s16(g, si + 0, colX); // .currX (tentative)

            const win = isInProximityWindow(g, colX);
            if (win.inside) {
                const rel = win.xRel;
                const tile = rowLayout[col] ?? 0xff;
                if (tile !== 0xff) {
                    s8(g, si + 4, tile);             // .flags <- part/tile index
                    s8(g, si + 2, crabEntityRow);    // .currY
                    s8(g, si + 3, rel);              // .m_x_rel
                    s8(g, si + 5, hitMonsterFlags !== 0 ? 0x20 : 0x00); // .ai_flags: hit-flash
                    s8(g, si + 6, bodyAnimState);    // .anim_counter

                    const di = coordsToProxAddr(g, g8(g, si + 3), g8(g, si + 2));
                    const oldTile = g8(g, di);
                    s8(g, di, (activeSpriteCount | 0x80) & 0xff);
                    s8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);

                    activeSpriteCount++;
                    si += 16;
                }
            }

            colX = (colX + 1) & 0xffff;
        }

        crabEntityRow = (crabEntityRow + 1) & 0x3f;
    }

    s16(g, si, 0xffff); // terminator after the last written sprite

    // --- render_droplets_entities: acid-droplet spawn/placement continuation ---
    if (!phaseSpawningDroplet) {
        if (!phasePlacingDroplet) {
            return;
        }
        // placing_droplet: find the boss's dedicated acid-droplet visual
        // entry (a fixed monster.flags == 0x14 "boss prop") and drive its
        // animation from the descent sequence.
        let di = base;
        while (g8(g, di + 4) !== 0x14) { // .flags
            di += 16;
        }
        s8(g, di + 6, descentSeqIndex); // .anim_counter
        if (descentSeqIndex !== 4) return;

        spawnSeqIndex = 0;
        phaseSpawningDroplet = 0xff;
        dropletTargetX = (g16(g, bossState + 0) + 4) & 0xffff;
        dropletTargetY = (g8(g, bossState + 2) + 3) & 0x3f;
    }

    // spawn_tick:
    const seq = ACID_DROPLET_SPAWN_SEQUENCE[spawnSeqIndex] ?? 0;
    spawnSeqIndex++;
    if (seq === 0xff) {
        phaseSpawningDroplet = 0;
        return;
    }
    if ((seq & 0x80) !== 0) {
        dropletTargetY = (dropletTargetY + 1) & 0x3f;
    }

    const win = isInProximityWindow(g, dropletTargetX);
    if (!win.inside) return; // out of range: skip this tick

    s16(g, si + 0, dropletTargetX);       // .currX
    s8(g, si + 2, dropletTargetY);        // .currY
    s8(g, si + 3, win.xRel);              // .m_x_rel
    s8(g, si + 4, 0x35);                  // .flags: droplet sprite/tile index
    s8(g, si + 6, (seq & 0x7f) & 0xff);   // .anim_counter
    s8(g, si + 5, 0);                     // .ai_flags
    s16(g, si + 16, 0xffff);              // fresh terminator right after this entry

    const addr = coordsToProxAddr(g, g8(g, si + 3), g8(g, si + 2));
    const oldTile = g8(g, addr);
    s8(g, addr, (activeSpriteCount | 0x80) & 0xff);
    s8(g, PROXIMITY_LAYER2 + activeSpriteCount, oldTile);
}

/** Cangrejo_AI (crab.c:163) — entry point, called once per frame. */
export function cangrejoAi(g: Uint8Array, m: number): void {
    void m;
    const base = g16(g, MONSTERS_LIST);
    let si = base;
    activeSpriteCount = 0;
    hitMonsterFlags = 0;

    // Walk last frame's boss-part pseudo-monster entries: restore the
    // proximity-map tiles they overwrote, and pick up any hit flagged by
    // the external hit-detection code (ai_flags bit 0x40).
    for (;;) {
        if (g16(g, si + 0) === 0xffff) break; // .currX sentinel

        const win = isInProximityWindow(g, g16(g, si + 0));
        if (win.inside) {
            s8(g, si + 3, win.xRel); // .m_x_rel

            const di = coordsToProxAddr(g, g8(g, si + 3), g8(g, si + 2));
            s8(g, di, g8(g, PROXIMITY_LAYER2 + activeSpriteCount));

            if ((g8(g, si + 5) & 0x40) !== 0) { // struck this frame
                if (!(hitMonsterFlags & 0x80)) { // only record the first hit found
                    let al = g8(g, si + 5) & 0x1f;
                    if ((g8(g, si + 4) & 0x10) !== 0) al |= 0x80; // .flags: facing left
                    hitMonsterFlags = al;
                }
            }
        }

        activeSpriteCount++;
        si += 16;
    }

    // Reset the sprite table; render_body_entities() repopulates it.
    si = base;
    s16(g, si, 0xffff);

    if (g8(g, BOSS_BEING_HIT) === 0 && hitMonsterFlags !== 0) {
        const al = hitMonsterFlags;
        const stat = getStats(g, al & 0x1f);
        let damage = (stat << 2) & 0xffff;
        if ((al & 0x80) !== 0) damage = (damage << 1) & 0xffff;

        applyDamageToBoss(g, damage);
        s8(g, SOUND_FX_REQUEST, 34);

        let bound = (g16(g, PROXIMITY_MAP_LEFT_COL) + 12) & 0xffff;
        const mapW = g16(g, MAP_WIDTH);
        if (bound >= mapW) bound = mapW;

        const bossState = g16(g, BOSS_STATE_PTR);
        if ((g16(g, bossState + 0) + 5) < bound) { // .boss_x
            bossMoveLeft(g);
            bossMoveLeft(g);
        } else {
            bossMoveRight(g);
            bossMoveRight(g);
        }
    }

    if (phasePlacingDroplet) { triggerAcidDrop(g); return; }
    if (phaseRecoil) { beginRecoil(g); return; }
    if (g8(g, BOSS_BEING_HIT) !== 0) { deathSequenceHandler(g); return; }
    if (phaseAcidDropping) { acidApproachStep(g); return; }

    if ((getRandom(g) & 7) === 0) {
        startAcidApproach(g);
        return;
    }

    if (movementDirectionFlag === 0) { // moving left
        movementTickCounter++;
        if (movementTickCounter & 1) { renderBodyEntities(g); return; }

        if (bossMoveLeft(g) !== 0) { // blocked at the left bound
            movementDirectionFlag = 0xff;
        }
        bodyAnimState++;
        if (bodyAnimState >= 6) bodyAnimState = 0;
        renderBodyEntities(g);
    } else { // moving right
        movementTickCounter++;
        if (movementTickCounter & 1) { renderBodyEntities(g); return; }

        if (bossMoveRight(g) !== 0) { // blocked at the right bound
            movementDirectionFlag = 0;
        }
        bodyAnimState = (bodyAnimState - 1) & 0xff;
        if (bodyAnimState === 0xff) bodyAnimState = 5;
        renderBodyEntities(g);
    }
}
