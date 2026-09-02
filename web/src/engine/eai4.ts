/**
 * eai4.ts — TS port of src/eai4.c (Stage 9d): monster AI for five
 * jump-table cases (`flags & 0x0F`): 0=Turtle (surface-clinging patroller
 * with bitmask ai_state + trajectory drift), 1=Green Egg (two-tile linking
 * monster, sword-hit absorption), 2/3=Icicle (dormant trap), 4=Arrow
 * (preset-path crawler confined to an x-band).
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import {
    coordsToProxAddr,
    isBlocking,
    wrapMapFromAbove,
    wrapMapFromBelow,
    moveMonsterE,
    moveMonsterS,
    moveMonsterSE,
    moveMonsterSW,
    moveMonsterW,
    monsterMoveInDirection,
} from './dungeon-entities.js';
import { checkVerticalDistanceBetweenHeroAndMonster, getRandom, heroHitsMonster } from './dungeon-combat.js';
import { isInProximityWindow } from './dungeon-monsters.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';

// g_mem addresses
const HERO_Y = 0xff35;
const MONSTERS_LIST = 0xc010; // word pointer
const MONSTER_INDEX = 0xff4a;
const PROXIMITY_LAYER2 = 0xed20;
const SWORD_TYPE = 0x92;
const SWORD_ENCHANTMENT = 6;



// trajectory_right / trajectory_left (eai4.c:88-89): 8-entry direction
// cycles used by the turtle's settle-drift.
const TRAJECTORY_RIGHT = [2, 1, 1, 0, 0, 7, 7, 6];
const TRAJECTORY_LEFT = [2, 3, 3, 4, 4, 5, 5, 6];

// unk_A756 / unk_A7CE: per-ai_state rows of 5 candidate
// (direction, next_ai_state, next_anim_counter) triplets.
const ARROW_TABLE_LEFT = [
    6,2,1,  7,1,2,  0,0,0,  1,7,3,  2,6,1,
    5,3,3,  6,2,1,  7,1,2,  0,0,0,  1,7,3,
    4,4,0,  5,3,3,  6,2,1,  7,1,2,  0,0,0,
    3,5,2,  4,4,0,  5,3,3,  6,2,1,  7,1,2,
    2,6,1,  3,5,2,  4,4,0,  5,3,3,  6,2,1,
    1,7,3,  2,6,1,  3,5,2,  4,4,0,  5,3,3,
    0,0,0,  1,7,3,  2,6,1,  3,5,2,  4,4,0,
    7,1,2,  0,0,0,  1,7,3,  2,6,1,  3,5,2,
];

const ARROW_TABLE_RIGHT = [
    6,6,0,  5,7,3,  4,0,0,  3,1,2,  2,2,0,
    5,7,2,  4,0,0,  3,1,2,  2,2,1,  1,3,2,
    4,0,1,  3,1,2,  2,2,1,  1,3,3,  0,4,1,
    3,1,3,  2,2,1,  1,3,3,  0,4,0,  7,5,3,
    2,2,0,  1,3,3,  0,4,0,  7,5,2,  6,6,0,
    1,3,2,  0,4,0,  7,5,2,  6,6,1,  5,7,2,
    0,4,1,  7,5,2,  6,6,1,  5,7,3,  4,0,1,
    7,5,3,  6,6,1,  5,7,3,  4,0,0,  3,1,3,
];

/**
 * Find_Monsters_Near_Hero (dungeon.c:6719): scan the monsters table for a
 * usable partner slot near the hero. Returns 0 when a slot was found
 * (outPartner/outIdx set), nonzero when none exists. Mirrors the C
 * convention here: nonzero = not found.
 */
export function findMonstersNearHero(
    g: Uint8Array,
    m: number,
    outPartner: { v: number },
    outIdx: { v: number },
): number {
    outPartner.v = memRead16(g, MONSTERS_LIST);
    outIdx.v = 0;
    for (;;) {
        const entryX = memRead16(g, outPartner.v);
        if (entryX === 0xffff) return 1; // .currX terminator

        if (memRead16(g, outPartner.v + 11) !== 0xffff) { // .spwnX set
            // keep scanning
        } else if (memRead8(g, outPartner.v + 1) === 0xff) { // currX high byte
            // loc_98F4 equivalent
            if (memRead8(g, outPartner.v + 2) !== 0x7f) {
                return 0;
            }
        } else {
            const win = isInProximityWindow(g, entryX);
            if (!win.inside) {
                if ((memRead8(g, outPartner.v + 4) & 0x10) === 0) {
                    return 0;
                }
            }
        }

        // loc_98ED: advance to next entry
        outIdx.v = (outIdx.v + 1) & 0xff;
        outPartner.v = (outPartner.v + 16) & 0xffff;
    }
}

/** Monster_AI_4 (eai4.c:158). */
export function monsterAi4(g: Uint8Array, m: number): void {
    switch (memRead8(g, m + 4) & 0x0f) {
        case 0: turtleAi(g, m); return;
        case 1: greenEggAi(g, m); return;
        case 2:
        case 3: icicleAi(g, m); return; // shared in the original jump table
        case 4: arrowAi(g, m); return;
        default: return; // 5-entry jump table by design
    }
}

// ─── Type 0 — surface-clinging patroller ───

function turtleAi(g: Uint8Array, m: number): void { // loc_A281
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 8); // .hp

    if ((memRead8(g, m + 5) & 0x20) !== 0) { // hit
        heroHitsMonster(g, m);
        return;
    }

    if ((memRead8(g, m + 9) & 8) !== 0) { turtleSettle(g, m); return; }
    if ((memRead8(g, m + 9) & 4) !== 0) { turtleBounceDash(g, m); return; }

    if (moveMonsterS(g, m) !== 0) return; // still falling

    turtleLanded(g, m); // loc_A2B0
}

// loc_A2B0: grounded — dispatch on the remaining two ai_state bits.
function turtleLanded(g: Uint8Array, m: number): void {
    if ((memRead8(g, m + 9) & 1) !== 0) { turtleSnapForward(g, m); return; }
    if ((memRead8(g, m + 9) & 2) !== 0) { turtleSnapBackward(g, m); return; }
    turtlePatrol(g, m); // loc_A2BF
}

// loc_A2BF: throttled patrol; re-center on the anchor when aligned.
function turtlePatrol(g: Uint8Array, m: number): void {
    const a = memRead8(g, m + 6); // .anim_counter
    const combined = (((a + 1) & 7) | (a & 0xf0)) & 0xff;
    const sum = combined + 0x80;
    memWrite8(g, m + 6, sum & 0xff);
    if (sum < 0x100) return; // throttling

    // loc_A2D5: vertical alignment with the hero
    const heroY = memRead8(g, HERO_Y);
    const myY = memRead8(g, m + 2);
    if (heroY === myY || ((heroY + 1) & 0x3f) === myY) {
        turtleAligned(g, m); // loc_A2EF
        return;
    }

    if ((memRead8(g, m + 5) & 0x80) !== 0) turtleGoEast(g, m);
    else turtleGoWest(g, m);
}

// loc_A2EF: aligned — occasionally trigger the bounce-dash, otherwise
// head back to the anchor column (0x11).
function turtleAligned(g: Uint8Array, m: number): void {
    if ((getRandom(g) & 3) === 0) memWrite8(g, m + 9, 5); // .ai_state
    if (memRead8(g, m + 3) < 0x11) turtleGoEast(g, m);
    else turtleGoWest(g, m);
}

// loc_A302: face left and step west; wall bump requests the bounce dash.
function turtleGoWest(g: Uint8Array, m: number): void {
    memWrite8(g, m + 5, memRead8(g, m + 5) & 0x7f); // face left
    if (moveMonsterW(g, m) !== 0) return;
    memWrite8(g, m + 9, 9); // .ai_state
}

// loc_A313: face right and step east; same wall-bump handling.
function turtleGoEast(g: Uint8Array, m: number): void {
    memWrite8(g, m + 5, memRead8(g, m + 5) | 0x80); // face right
    if (moveMonsterE(g, m) !== 0) return;
    memWrite8(g, m + 9, 9); // .ai_state
}

// loc_A324: ai_state bit 0x1 — short forward snap.
function turtleSnapForward(g: Uint8Array, m: number): void {
    let low = memRead8(g, m + 6) & 0x0f; // .anim_counter low nibble
    if (low < 8) {
        memWrite8(g, m + 6, 8);
        return;
    }
    low = (low + 1) & 0xff;
    memWrite8(g, m + 6, low);
    if (low !== 0x0b) return;

    memWrite8(g, m + 6, low | 0x10);
    memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfe); // .ai_state
}

// loc_A346: mirror of snap_forward, counting down instead of up.
function turtleSnapBackward(g: Uint8Array, m: number): void {
    let low = memRead8(g, m + 6) & 0x0f;
    if (low >= 0x0c) {
        memWrite8(g, m + 6, 0x0b);
        return;
    }
    low = (low - 1) & 0xff;
    memWrite8(g, m + 6, low);
    if (low !== 8) return;

    memWrite8(g, m + 6, low | 0x10);
    memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfd); // .ai_state
}

// loc_A368: ai_state bit 0x4 — double-speed diagonal dash off the surface.
function turtleBounceDash(g: Uint8Array, m: number): void {
    let v = (memRead8(g, m + 6) & 0x0f) + 1; // .anim_counter
    if (v < 0x0f) {
        memWrite8(g, m + 6, v);
        return;
    }
    if (v >= 0x10) v = 0x0e;
    memWrite8(g, m + 6, v);

    if ((memRead8(g, m + 5) & 0x80) !== 0) { // facing right
        moveMonsterSE(g, m);
        if (moveMonsterSE(g, m) !== 0) return;
        moveMonsterE(g, m);
        if (moveMonsterE(g, m) !== 0) return;
        memWrite8(g, m + 5, memRead8(g, m + 5) & 0x7f); // face left
    } else { // facing left
        moveMonsterSW(g, m);
        if (moveMonsterSW(g, m) !== 0) return;
        moveMonsterW(g, m);
        if (moveMonsterW(g, m) !== 0) return;
        memWrite8(g, m + 5, memRead8(g, m + 5) | 0x80); // face right
    }

    // loc_A3C4: fully blocked both ways — settle into the next state
    memWrite8(g, m + 6, 0x1d);
    memWrite8(g, m + 9, 2); // .ai_state
}

// loc_A3CD: settle — high-nibble delay while free-falling, then step2.
function turtleSettle(g: Uint8Array, m: number): void {
    let low = (memRead8(g, m + 6) + 1) & 0x0f; // .anim_counter
    if (low >= 0x0d) low = 0x0b;
    memWrite8(g, m + 6, low);

    if ((memRead8(g, m + 0x0a) & 1) !== 0) { // initial delay already elapsed
        turtleSettleStep2(g, m); // loc_A3F8
        return;
    }

    moveMonsterS(g, m);
    memWrite8(g, m + 9, (memRead8(g, m + 9) + 0x10) & 0xff); // high-nibble delay counter
    if ((memRead8(g, m + 9) & 0xf0) !== 0) return; // still counting
    memWrite8(g, m + 0x0a, memRead8(g, m + 0x0a) | 1); // delay elapsed
}

// loc_A3F8: one plain E/W step before switching to trajectory drift.
function turtleSettleStep2(g: Uint8Array, m: number): void {
    if ((memRead8(g, m + 0x0a) & 4) !== 0) { // .ai_timer
        turtleSettleTrajectory(g, m); // loc_A412
        return;
    }
    memWrite8(g, m + 0x0a, memRead8(g, m + 0x0a) | 4);
    if ((memRead8(g, m + 0x0a) & 8) !== 0) {
        moveMonsterW(g, m);
    } else {
        moveMonsterE(g, m);
    }
}

// loc_A412: trajectory-driven drift; counter wrap resets to snap-backward.
function turtleSettleTrajectory(g: Uint8Array, m: number): void {
    const traj = (memRead8(g, m + 5) & 0x80) !== 0 ? TRAJECTORY_RIGHT : TRAJECTORY_LEFT;

    let al = memRead8(g, m + 9); // .ai_state
    al = ((al << 3) | (al >>> 5)) & 0xff; // rol al,1 (×3)
    const idx = al & 7;

    memWrite8(g, m + 9, (memRead8(g, m + 9) + 0x20) & 0xff); // .ai_state
    if ((memRead8(g, m + 9) & 0xe0) === 0) {
        memWrite8(g, m + 0x0a, 0); // .ai_timer
        memWrite8(g, m + 9, 2); // .ai_state
    }

    if (monsterMoveInDirection(g, m, traj[idx] ?? 0) !== 0) return;

    const hi = memRead8(g, m + 9) & 0xe0; // .ai_state
    if (hi !== 0 && hi < 0xc0) {
        memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80); // flip facing
    }
}

// ─── Type 1 — two-tile linking monster ───

function greenEggAi(g: Uint8Array, m: number): void { // loc_A466
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 0x10); // .hp

    if ((memRead8(g, m + 5) & 0x20) === 0) { // not hit
        greenEggCommon(g, m); // loc_A4EC
        return;
    }

    const al = memRead8(g, m + 5) & 0x1f; // hit-type code
    if (al === 4 || al === 5 || al === 8) {
        heroHitsMonster(g, m);
        return;
    }
    if (al === 1 && memRead8(g, SWORD_TYPE) === SWORD_ENCHANTMENT) {
        heroHitsMonster(g, m);
        return;
    }
    if ((memRead8(g, m + 6) & 1) !== 0) { // odd frame
        heroHitsMonster(g, m);
        return;
    }

    // loc_A4B1: hit absorbed — clear the hit flag and try to link up.
    memWrite8(g, m + 5, memRead8(g, m + 5) & 0xdf); // .ai_flags
    if ((memRead8(g, m + 7) & 0x40) === 0) { // not already linked
        const partner = { v: 0 };
        const idx = { v: 0 };
        if (findMonstersNearHero(g, m, partner, idx) === 0) {
            memWrite16(g, partner.v, 0xff00);
            if ((memRead8(g, partner.v + 7) & 0x40) !== 0) {
                memWrite8(g, partner.v + 7, memRead8(g, partner.v + 7) & 0xbf);
                const otherIdx = memRead8(g, partner.v + 0x0a);
                const other = (memRead16(g, MONSTERS_LIST) + otherIdx * 0x10) & 0xffff;
                memWrite8(g, other + 2, 0);
            }
            memWrite8(g, partner.v + 2, 0x7f);
            memWrite8(g, m + 0x0a, idx.v);
            memWrite8(g, m + 7, memRead8(g, m + 7) | 0x40);
        }
    }

    greenEggCommon(g, m); // loc_A4EC
}

// loc_A4EC: skip a frame right after the grow-bit was set.
function greenEggCommon(g: Uint8Array, m: number): void {
    const bitSet = (memRead8(g, m + 9) & 1) !== 0; // .ai_state
    memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfe);
    if (bitSet) return;

    greenEggMove(g, m); // loc_A4F9
}

// loc_A4F9: unlinked monsters walk; linked ones run growth logic.
function greenEggMove(g: Uint8Array, m: number): void {
    if ((memRead8(g, m + 7) & 0x40) !== 0) { // linked
        greenEggLinkedMove(g, m); // loc_A56C
        return;
    }

    const a = memRead8(g, m + 6); // .anim_counter
    const low = (a + 1) & 3;
    const high = a & 0xf0;
    memWrite8(g, m + 6, high | low);

    greenEggFallAndPatrol(g, m); // loc_A514
}

// loc_A514: fall, then rock towards the hero row / anchor column.
function greenEggFallAndPatrol(g: Uint8Array, m: number): void {
    if (moveMonsterS(g, m) !== 0) return; // still falling

    memWrite8(g, m + 6, (memRead8(g, m + 6) - 0x10) & 0xff); // landing countdown
    if ((memRead8(g, m + 6) & 0xf0) !== 0) return;

    memWrite8(g, m + 6, memRead8(g, m + 6) | 0x40); // landed

    const heroY = memRead8(g, HERO_Y);
    const myY = memRead8(g, m + 2); // .currY
    const aligned = heroY === myY || ((heroY + 1) & 0x3f) === myY;

    if (!aligned) {
        if ((memRead8(g, m + 5) & 0x80) !== 0) greenEggBounceEast(g, m);
        else greenEggBounceWest(g, m);
        return;
    }

    // aligned — head back towards the anchor column
    if (memRead8(g, m + 3) <= 0x10) greenEggBounceEast(g, m);
    else greenEggBounceWest(g, m);
}

// loc_A54B: step west, falling back to east on failure.
function greenEggBounceWest(g: Uint8Array, m: number): void {
    memWrite8(g, m + 5, memRead8(g, m + 5) & 0x7f); // face left
    if (moveMonsterW(g, m) !== 0) return;
    greenEggBounceEast(g, m); // loc_A557
}

// loc_A557: step east, falling back to a single west attempt on failure.
function greenEggBounceEast(g: Uint8Array, m: number): void {
    memWrite8(g, m + 5, memRead8(g, m + 5) | 0x80); // face right
    if (moveMonsterE(g, m) !== 0) return;
    memWrite8(g, m + 5, memRead8(g, m + 5) & 0x7f); // face left
    moveMonsterW(g, m);
}

// loc_A56C: linked monster — 3-bit walk cycle; at wrap 6, (re)position
// the partner half ahead of / behind this one depending on facing.
function greenEggLinkedMove(g: Uint8Array, m: number): void {
    const a = memRead8(g, m + 6); // .anim_counter
    const low = (a + 1) & 7;
    const high = a & 0xf0;
    memWrite8(g, m + 6, high | low);
    if (low !== 6) {
        greenEggFallAndPatrol(g, m); // loc_A514
        return;
    }

    const partnerIdx = memRead8(g, m + 0x0a);
    const partner = (memRead16(g, MONSTERS_LIST) + partnerIdx * 0x10) & 0xffff;
    const prox = coordsToProxAddr(g, memRead8(g, m + 3), memRead8(g, m + 2));

    if ((memRead8(g, m + 5) & 0x80) !== 0) { // facing right
        const x = (memRead8(g, m + 3) << 24) >> 24; // int8_t
        if (x < 0) { greenEggFallAndPatrol(g, m); return; }
        if ((x & 0xff) < 3) { greenEggFallAndPatrol(g, m); return; }
        if (greenEggCheckRoom(g, prox, 0x27) !== 0) { greenEggFallAndPatrol(g, m); return; } // blocked
        greenEggGrowRight(g, m, partner, prox);
    } else { // facing left
        const x = (memRead8(g, m + 3) << 24) >> 24;
        if (x < 0) { greenEggFallAndPatrol(g, m); return; }
        if ((x & 0xff) >= 0x21) { greenEggFallAndPatrol(g, m); return; }
        if (greenEggCheckRoom(g, prox, 0x23) !== 0) { greenEggFallAndPatrol(g, m); return; } // blocked
        greenEggGrowLeft(g, m, partner, prox);
    }
}

// sub_A679: probe a 3×3 proximity block for room to grow into.
// Returns nonzero when blocked (matching the original CF=1).
function greenEggCheckRoom(g: Uint8Array, prox: number, offset: number): number {
    let addr = (prox - offset) & 0xffff;
    addr = wrapMapFromBelow(addr);

    for (let row = 0; row < 3; row++) {
        if (isBlocking(g, memRead8(g, addr)) !== 0) return 1;
        if (isBlocking(g, memRead8(g, addr + 1)) !== 0) return 1;
        if (isBlocking(g, memRead8(g, addr + 2)) !== 0) return 1;
        addr += 0x24; // PROX_COLS
        addr = wrapMapFromAbove(addr);
    }
    return 0;
}

// loc_A5C1: grow/reposition the partner two tiles to the left.
function greenEggGrowLeft(g: Uint8Array, m: number, partner: number, prox: number): void {
    const mapAddr = prox + 2;
    const layerVal = memRead8(g, mapAddr); // covered background tile
    memWrite8(g, mapAddr, (memRead8(g, m + 0x0a) | 0x80) & 0xff); // stamp partner entity id

    memWrite8(g, partner + 4, memRead8(g, m + 4) & 0x1f); // inherit species sub-type

    let x = (memRead16(g, m) + 2) & 0xffff;
    const mapWidth = memRead16(g, 0xc002); // ADDR_MAP_WIDTH word
    let dx = (mapWidth - 1 - x) & 0xffff;
    if (x > ((mapWidth - 1) & 0xffff)) { // wrapped past the right edge
        dx = ~dx & 0xffff;
        x = dx;
    }
    memWrite16(g, partner, x);

    memWrite8(g, partner + 3, (memRead8(g, m + 3) + 2) & 0xff); // .m_x_rel

    memWrite8(g, m + 6, 0x16); // this half's sprite
    memWrite8(g, partner + 6, 0x17); // partner sprite

    greenEggFinishLink(g, m, partner, layerVal);
}

// loc_A618: mirror of grow_left, growing to the right instead.
function greenEggGrowRight(g: Uint8Array, m: number, partner: number, prox: number): void {
    const mapAddr = prox - 2;
    const layerVal = memRead8(g, mapAddr);
    memWrite8(g, mapAddr, (memRead8(g, m + 0x0a) | 0x80) & 0xff);

    memWrite8(g, partner + 4, memRead8(g, m + 4) & 0x1f);

    let x = ((memRead16(g, m) - 2) << 16) >> 16; // int16_t
    if (x < 0) {
        x += memRead16(g, 0xc002) /* MAP_WIDTH */ << 16 >> 16;
    }
    memWrite16(g, partner, x);

    memWrite8(g, partner + 3, (memRead8(g, m + 3) - 2) & 0xff); // .m_x_rel

    memWrite8(g, m + 6, 0x17);
    memWrite8(g, partner + 6, 0x16);

    greenEggFinishLink(g, m, partner, layerVal);
}

// loc_A64C: shared tail of grow_left/right — sync the partner's row,
// stash the covered tile, reset partner fields, clear growth bit.
function greenEggFinishLink(g: Uint8Array, m: number, partner: number, savedLayerVal: number): void {
    memWrite8(g, partner + 2, memRead8(g, m + 2)); // .currY

    const idx = memRead8(g, m + 0x0a); // partner entity id
    memWrite8(g, PROXIMITY_LAYER2 + idx, savedLayerVal);

    memWrite8(g, partner + 7, 0);
    memWrite8(g, partner + 8, 0);
    memWrite8(g, partner + 9, 0);
    memWrite8(g, m + 7, memRead8(g, m + 7) & 0xbf); // clear "growth in progress"

    if (memRead8(g, MONSTER_INDEX) < memRead8(g, m + 0x0a)) {
        memWrite8(g, partner + 9, memRead8(g, partner + 9) | 1); // process later this frame
    }
}

// ─── Type 2/3 — dormant trap ───

function icicleAi(g: Uint8Array, m: number): void { // loc_A6B1
    memWrite8(g, m + 4, memRead8(g, m + 4) | 0x20); // .flags

    if ((memRead8(g, m + 9) & 1) !== 0) { // already awake
        icicleActive(g, m); // loc_A6DB
        return;
    }

    // dormant: only consider waking while the hero is in an x-band
    const x = memRead8(g, m + 3); // .m_x_rel
    if (x < 8) return;
    if (x >= 0x13) return;

    if ((getRandom(g) & 3) !== 0) return;

    memWrite8(g, m + 6, 1); // .anim_counter
    memWrite8(g, m + 9, memRead8(g, m + 9) | 1); // wake up
}

// loc_A6DB: awake — free-fall once, then hand off to the shared
// vertical-distance check.
function icicleActive(g: Uint8Array, m: number): void {
    if (moveMonsterS(g, m) !== 0) return;

    memWrite8(g, m + 7, (memRead8(g, m + 7) & 0xf0) | 1);
    checkVerticalDistanceBetweenHeroAndMonster(g, m);
}

// ─── Type 4 — preset-path crawler ───

function arrowAi(g: Uint8Array, m: number): void { // loc_A6F0
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 2); // .hp

    if ((memRead8(g, m + 5) & 0x20) !== 0) { // hit
        heroHitsMonster(g, m);
        return;
    }

    const x = memRead8(g, m + 3); // .m_x_rel
    if (x < 3) return;
    if (x >= 0x21) return;

    const used = arrowTryDirections(g, m); // sub_A71C
    if (used === 3) {
        arrowTryDirections(g, m); // original tail-calls itself again
    }
}

// sub_A71C: try up to 5 preset (dir, next_state, next_anim) triplets;
// returns the remaining-attempts count at success, or 0 (facing flipped).
function arrowTryDirections(g: Uint8Array, m: number): number {
    const table = (memRead8(g, m + 5) & 0x80) !== 0 ? ARROW_TABLE_RIGHT : ARROW_TABLE_LEFT;
    const rowBase = (memRead8(g, m + 9) ?? 0) * 15; // .ai_state

    for (let remaining = 5; remaining > 0; remaining--) {
        const entryIdx = rowBase + (5 - remaining) * 3;
        const dir = table[entryIdx] ?? 0;
        if (monsterMoveInDirection(g, m, dir) !== 0) {
            memWrite8(g, m + 9, table[entryIdx + 1] ?? 0); // .ai_state
            memWrite8(g, m + 6, table[entryIdx + 2] ?? 0); // .anim_counter
            return remaining;
        }
    }

    memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80); // flip facing, nothing worked
    return 0;
}
