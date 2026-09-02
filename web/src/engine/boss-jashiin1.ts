/**
 * boss-jashiin1.ts — TS port of src/mao1.c (Stage 9i): "Jashiin" room-1
 * AI. Not a fight: a scripted idle-animation cutscene (pose timeline with
 * dialog-box signals) that ends by clearing is_jashiin_cavern. Body parts
 * are non-hittable pseudo-monster entries laid out from per-pose tile +
 * mask tables; the mask tables rotate in place each frame (each byte
 * rotates exactly 8 times per render) and poses 3/6 deliberately alias
 * the same 6-byte mask array — preserved.
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import { coordsToProxAddr } from './dungeon-entities.js';
import { isInProximityWindow } from './dungeon-monsters.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';

// g_mem addresses
const MONSTERS_LIST = 0xc010; // word
const PROXIMITY_LAYER2 = 0xed20;
const BOSS_STATE_PTR = 0xa002; // word
const SOUND_FX_REQUEST = 0xff75;
const IS_JASHIIN_CAVERN = 0xe6;
const NOTIFICATION_MSG_ID = 0xff96;
const NOTIFICATION_FLAG = 0xff97;
const VIEWPORT_ENTITIES = 0xe900;
const VIEW_COLS = 28;

// JASHIIN_*_STR ids (zeliard.h).
const JASHIIN_FINALLY_STR = 20;
const JASHIIN_ENJOYED_STR = 21;
const JASHIIN_COMEON_STR = 22;



// ─── persistent state (byte_A599 .. byte_A59C) ───

let spriteWriteCursor = 0; // write cursor / layer2 index this frame
let currentColRelX = 0;
let currentPose = 0;       // persists across command frames
let scriptCursor = 0;

// ─── per-pose sprite layout tables ───

const TILES_POSE0 = [0x05, 0x03, 0x04, 0x02, 0x00, 0x01];
const TILES_POSE1 = [0x0d, 0x0e, 0x0b, 0x0c, 0x06, 0x07, 0x0a, 0x08, 0x09];
const TILES_POSE2 = [0x18, 0x16, 0x17, 0x12, 0x13, 0x14, 0x15, 0x11, 0x10, 0x0f];
const TILES_POSE3 = [0x23, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x19, 0x1a, 0x1b, 0x1c, 0x1d];
const TILES_POSE4 = [0x27, 0x23, 0x1e, 0x24, 0x25, 0x26, 0x22, 0x19, 0x1a, 0x1b, 0x1c, 0x1d];
const TILES_POSE5 = [0x2b, 0x2a, 0x23, 0x1e, 0x28, 0x29, 0x26, 0x22, 0x19, 0x1a, 0x1b, 0x1c, 0x1d];
const TILES_POSE6 = [0x23, 0x1e, 0x2e, 0x2f, 0x26, 0x22, 0x19, 0x2c, 0x2d, 0x1c, 0x1d];
const TILES_POSE7 = [0x32, 0x35, 0x1e, 0x31, 0x34, 0x37, 0x39, 0x19, 0x30, 0x33, 0x36, 0x38];
const TILES_POSE8 = [0x44, 0x42, 0x43, 0x45, 0x1e, 0x3f, 0x40, 0x41, 0x39, 0x19, 0x3a, 0x3b, 0x3c, 0x3e, 0x3d];
const TILES_POSE9 = [0x54, 0x55, 0x52, 0x53, 0x4f, 0x50, 0x51, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x19, 0x46, 0x47, 0x48, 0x49];
const TILES_POSEA = [0x61, 0x63, 0x65, 0x60, 0x62, 0x64, 0x5b, 0x5c, 0x5d, 0x5e, 0x4e, 0x56, 0x57, 0x58, 0x59, 0x5a];

const POSE_TILE_TABLES: ReadonlyArray<ReadonlyArray<number>> = [
    TILES_POSE0, TILES_POSE1, TILES_POSE2, TILES_POSE3,
    TILES_POSE4, TILES_POSE5, TILES_POSE6, TILES_POSE7,
    TILES_POSE8, TILES_POSE9, TILES_POSEA,
];

// Mutable mask tables, rotated in place by the render walk.
const MASK_A = Uint8Array.from([0x00, 0x00, 0x04, 0x0c, 0x08, 0x18]);
const MASK_B = Uint8Array.from([0x00, 0x00, 0x0c, 0x0c, 0x38, 0x18]);
const MASK_C = Uint8Array.from([0x00, 0x04, 0x0c, 0x3c, 0x18, 0x08]);
// byte_A557: shared by poses 3 and 6 (deliberate aliasing).
const MASK_D = Uint8Array.from([0x00, 0x00, 0x04, 0x7c, 0x7c, 0x00]);
const MASK_E = Uint8Array.from([0x00, 0x00, 0x14, 0x7c, 0x7c, 0x00]);
const MASK_F = Uint8Array.from([0x00, 0x20, 0x24, 0x7c, 0x7c, 0x00]);
const MASK_G = Uint8Array.from([0x00, 0x00, 0x30, 0x7c, 0x7c, 0x00]);
const MASK_H = Uint8Array.from([0x00, 0x20, 0x70, 0x7c, 0x7c, 0x08]);
const MASK_I = Uint8Array.from([0x60, 0x60, 0x70, 0x7c, 0x7c, 0x00]);
const MASK_J = Uint8Array.from([0x00, 0xe0, 0xe0, 0x7c, 0x7c, 0x00]);

const POSE_MASK_TABLES: ReadonlyArray<Uint8Array> = [
    MASK_A, MASK_B, MASK_C, MASK_D,
    MASK_E, MASK_F, MASK_D, MASK_G,
    MASK_H, MASK_I, MASK_J,
];

// Cutscene script: one entry consumed per frame. 0x00-0x7F selects a pose;
// commands have the top bit set. script_cursor is pre-incremented before
// indexing, so index 0 is never read.
const CUTSCENE_SCRIPT = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x01, 0x01,
    0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x03, 0x81, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
    0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
    0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0xc0, 0x03, 0x03, 0x03, 0x04, 0x04, 0x05, 0x82,
    0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
    0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
    0xc0, 0x05, 0x05, 0x06, 0x06, 0x07, 0xe0, 0x08, 0x08, 0x09, 0x09, 0x0a, 0x0a, 0x0a, 0xff,
];

/** Jashiin1_AI_reset (mao1.c:192). */
export function jashiin1AiReset(): void {
    spriteWriteCursor = 0;
    currentColRelX = 0;
    currentPose = 0;
    scriptCursor = 0;
}

// loc_A376: signal game.js to draw a dialog box with the text for the
// requested dialog (string id only; rendering stays JS-side).
function showDialogBox(g: Uint8Array, textIndex: number): void {
    const strIds = [JASHIIN_FINALLY_STR, JASHIIN_ENJOYED_STR, JASHIIN_COMEON_STR];
    if (textIndex >= 3) return; // defensive; script data only ever uses 0..2

    const id = strIds[textIndex] ?? 0;
    memWrite8(g, NOTIFICATION_MSG_ID, id);
    memWrite8(g, NOTIFICATION_FLAG, 0xff);
}

// loc_A3A2: blank a 26x2 tile block at viewport row 2, column 1 and clear
// the notification flag so game.js hides the box.
function clearDialogArea(g: Uint8Array): void {
    let dest = VIEWPORT_ENTITIES + 2 * VIEW_COLS + 1;

    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 26; col++) {
            memWrite8(g, dest + col, 0xfe);
        }
        dest = (dest + VIEW_COLS) & 0xffff;
    }

    memWrite8(g, NOTIFICATION_FLAG, 0);
}

// loc_A350: dispatch a cutscene command byte (top bit set).
function dispatchScriptCommand(g: Uint8Array, op: number): void {
    const group = op & 0xf0;

    if (group === 0x80) {
        showDialogBox(g, op & 0x0f);
    } else if (group === 0xc0) {
        clearDialogArea(g);
    } else if (group === 0xe0) {
        memWrite8(g, SOUND_FX_REQUEST, 56);
    } else if (op === 0xff) {
        memWrite8(g, IS_JASHIIN_CAVERN, 0);
    }
    // any other value: unrecognized command, silently ignored
}

// loc_A245..loc_A273: restore the proximity tiles last frame's entries
// overwrote.
function restorePreviousFrameSprites(g: Uint8Array): void {
    let si = memRead16(g, MONSTERS_LIST);
    spriteWriteCursor = 0;

    while (memRead16(g, si + 0) !== 0xffff) { // .currX sentinel
        const win = isInProximityWindow(g, memRead16(g, si + 0));
        if (win.inside) {
            memWrite8(g, si + 3, win.xRel);

            const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
            memWrite8(g, di, memRead8(g, PROXIMITY_LAYER2 + spriteWriteCursor));
        }

        spriteWriteCursor = (spriteWriteCursor + 1) & 0xff;
        si += 16;
    }
}

// loc_A290..loc_A34B: lay out the 6 body-part columns × up to 8 rows for
// the current pose.
function renderCurrentPose(g: Uint8Array): void {
    const bs = memRead16(g, BOSS_STATE_PTR);

    // Poses 0-2 face/stand one way, poses 3+ another.
    let colX = currentPose < 3 ? 0x10 : 0x0d;
    memWrite16(g, bs + 0, colX); // .boss_x

    spriteWriteCursor = 0;

    const tileTable = POSE_TILE_TABLES[currentPose] ?? [];
    const mask = POSE_MASK_TABLES[currentPose] ?? MASK_A;
    let ti = 0;

    const base = memRead16(g, MONSTERS_LIST);
    let si = base;

    for (let col = 0; col < 6; col++) {
        const win = isInProximityWindow(g, colX);
        currentColRelX = win.xRel;

        if (!win.inside) {
            // Out of view: still rotate through this column's 8 row-bits
            // and advance the tile pointer on set bits.
            for (let row = 0; row < 8; row++) {
                const carry = ((mask[col] ?? 0) & 0x80) !== 0 ? 1 : 0;
                mask[col] = (((mask[col] ?? 0) << 1) | carry) & 0xff;
                if (carry) ti++;
            }
        } else {
            for (let row = 0; row < 8; row++) {
                const carry = ((mask[col] ?? 0) & 0x80) !== 0 ? 1 : 0;
                mask[col] = (((mask[col] ?? 0) << 1) | carry) & 0xff;
                if (!carry) continue;

                const packed = tileTable[ti] ?? 0;
                memWrite16(g, si + 0, colX);                                    // .currX
                memWrite8(g, si + 2, (memRead8(g, bs + 2) + row * 2) & 0x3f);          // .currY
                memWrite8(g, si + 3, currentColRelX);                            // .m_x_rel
                memWrite8(g, si + 4, (packed >> 4) & 0x0f);                      // .flags
                memWrite8(g, si + 6, packed & 0x0f);                             // .anim_counter
                memWrite8(g, si + 5, 0);                                         // never hittable

                const di = coordsToProxAddr(g, memRead8(g, si + 3), memRead8(g, si + 2));
                const oldTile = memRead8(g, di);
                memWrite8(g, di, (spriteWriteCursor | 0x80) & 0xff);
                memWrite8(g, PROXIMITY_LAYER2 + spriteWriteCursor, oldTile);

                si += 16;
                spriteWriteCursor = (spriteWriteCursor + 1) & 0xff;
                ti++;
            }
        }

        colX = (colX + 2) & 0xffff;
    }

    memWrite16(g, si, 0xffff); // terminator after the last body-part segment
}

/** Jashiin1_AI (mao1.c:205) — entry point, called once per frame. */
export function jashiin1Ai(g: Uint8Array, m: number): void {
    void m;

    restorePreviousFrameSprites(g);

    // Reset this frame's sprite list before laying it out again.
    const base = memRead16(g, MONSTERS_LIST);
    memWrite16(g, base, 0xffff);

    scriptCursor = (scriptCursor + 1) & 0xff;
    const op = scriptCursor < CUTSCENE_SCRIPT.length
        ? CUTSCENE_SCRIPT[scriptCursor] ?? 0xff
        : 0xff; // defensive: the scene has ended long before the table runs out

    if (!(op & 0x80)) {
        currentPose = op; // plain pose byte
    } else {
        dispatchScriptCommand(g, op);
    }

    // (Re)draw the current pose every frame either way.
    renderCurrentPose(g);
}
