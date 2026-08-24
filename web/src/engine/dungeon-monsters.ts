/**
 * dungeon-monsters.ts — TS port of dungeon.c's monster lifecycle pipeline
 * (Stage 8c, slice 1).
 *
 * Monster table entry layout (16 bytes, SI register in the original code):
 *   +0  currX      (word; high byte 0xFF = inactive/collected)
 *   +2  currY
 *   +3  m_x_rel    (X relative to the proximity window, 0xFF = off-window)
 *   +4  flags / type_   (bit4+ set = item/chest, low nibble = subtype)
 *   +5  ai_flags
 *   +6  anim_counter
 *   +7  state_flags (bit7 = spawned/marker, bit4 = big monster)
 *   +8  hp
 *   +9  ai_state
 *   +10 ai_timer
 *   +11 spwnX      (word spawn point; 0xFFFF = none)
 *   +13 spwnY
 *   +14 type_      (spawn-time copy of flags)
 *   +15 counter    (AI tick throttle)
 *
 * Big monsters occupy two consecutive entries; the second half is reached
 * via m+16+field.
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - is_in_proximity_window                 (5441)
 *   - update_all_monsters_in_map             (5384)
 *   - check_monster_aligned_to_hero_and_tick (516)
 *   - monster_activation                     (3505)
 *   - check_monster_on_aggressive_ground     (3667) + is_tile_safe_to_stay
 *
 * The per-monster AI bodies themselves are eai1..eai8.c (Stage 9); item /
 * chest dispatch (flag_10..1e, default_0toF_handler) lands in a later 8c
 * slice.
 */

import { SEG1_BASE } from '../wasm/memory.js';
import {
    coordsToProxAddr,
    wrapMapFromAbove,
    wrapMapFromBelow,
} from './dungeon-entities.js';

const PROX_COLS = 36;

const LEFT_COL_NUM = 0x80; // word — proximity map left column number
const VIEWPORT_TOP_ROW = 0x82;
const HERO_XV = 0x83;
const INVINCIBILITY_FLAG = 0xe8;
const MAP_WIDTH = 0xc002; // word
const MONSTERS_LIST = 0xc010; // word pointer
const PROXIMITY_LAYER2 = 0xed20; // 128-byte per-monster backup layer
const HERO_Y = 0xff35; // hero_y_absolute
const MONSTER_INDEX = 0xff4a;

const AGGRESSIVE_TILES = 0x8020; // seg1-based, 4 entries, 0-terminated

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

/** seg1 byte read (MEM8_1 in the C port). */
function seg8(g: Uint8Array, addr: number): number {
    return g[(SEG1_BASE + addr) & 0xffffff] ?? 0;
}

export interface ProximityWindowCheck {
    /** true when x lies inside the 36-column window (C returns NC). */
    inside: boolean;
    /** X relative to the window (valid when inside). */
    xRel: number;
}

/**
 * is_in_proximity_window (dungeon.c:5441). Checks whether map X lies within
 * the 36-column proximity window, handling world wraparound (the four
 * documented cases: window at map start, middle, end, straddling the edge).
 */
export function isInProximityWindow(g: Uint8Array, x: number): ProximityWindowCheck {
    const left = g16(g, LEFT_COL_NUM);
    const mapWidth = g16(g, MAP_WIDTH);
    if (x >= left) {
        // Cases 1a, 1b, 2d, 2e, 3g, 4j
        const offset = (x - left) & 0xffff;
        return { inside: offset < PROX_COLS, xRel: offset & 0xff };
    } else {
        // Cases 2c, 3f, 4h, 4i
        if (x >= PROX_COLS) return { inside: false, xRel: 0 };
        const offset = (mapWidth - left + x) & 0xffff;
        return { inside: offset < PROX_COLS, xRel: offset & 0xff };
    }
}

/**
 * update_all_monsters_in_map (dungeon.c:5384): rebuild pass run before the
 * render tick — clears the layer-2 backup, walks the whole monster table,
 * and re-markers every in-window monster into the proximity map.
 */
export function updateAllMonstersInMap(g: Uint8Array): void {
    g.fill(0, PROXIMITY_LAYER2, PROXIMITY_LAYER2 + 128);
    s8(g, MONSTER_INDEX, 0);
    let si = g16(g, MONSTERS_LIST);
    for (;;) {
        const x = g16(g, si);
        if (x === 0xffff) break;
        if (((x >> 8) & 0xff) !== 0xff) {
            s8(g, si + 3, 0xff); // m_x_rel = off-window
            const { inside, xRel } = isInProximityWindow(g, x);
            if (inside) {
                s8(g, si + 3, xRel);
                const addr = coordsToProxAddr(g, xRel, g8(g, si + 2));
                s8(g, addr, g8(g, MONSTER_INDEX) | 0x80);
            }
        }
        s8(g, MONSTER_INDEX, (g8(g, MONSTER_INDEX) + 1) & 0xff);
        si += 16;
    }
}

/**
 * check_monster_aligned_to_hero_and_tick (dungeon.c:516).
 *
 * Returns 1 (C carry set) when the monster's AI must NOT run this tick:
 * not Y-aligned with the hero, not X-aligned, or throttled by its tick
 * counter. Returns 0 (carry clear) when the caller should run Monster_AI.
 * Side effects: clears the spawned marker (state_flags bit7) when the
 * monster is not aligned, increments the tick counter otherwise.
 */
export function checkMonsterAlignedToHeroAndTick(g: Uint8Array, m: number): number {
    if (g8(g, INVINCIBILITY_FLAG) !== 0) return 1;

    // Y alignment: hero_y_absolute within the 4 rows below currY+2
    let ah = (g8(g, m + 2) + 2) & 0xff;
    let yMatch = false;
    for (let cx = 4; cx !== 0; cx--) {
        ah = (ah - 1) & 0x3f;
        if (ah === g8(g, HERO_Y)) {
            yMatch = true;
            break;
        }
    }
    if (!yMatch) {
        s8(g, m + 7, g8(g, m + 7) & 0x7f);
        return 1;
    }

    // X alignment: hero_x_view+4 equals one of 4 offsets from m_x_rel-3
    const al = (g8(g, HERO_XV) + 4) & 0xff;
    ah = (g8(g, m + 3) - 3) & 0xff;
    let xMatch = false;
    for (let cx = 4; cx !== 0; cx--) {
        ah = (ah + 1) & 0xff;
        if (ah === al) {
            xMatch = true;
            break;
        }
    }
    if (!xMatch) {
        s8(g, m + 7, g8(g, m + 7) & 0x7f);
        return 1;
    }

    if ((g8(g, m + 7) & 0x80) !== 0) {
        // active: tick counter, run AI every 8th tick
        s8(g, m + 15, (g8(g, m + 15) + 1) & 0xff);
        return (g8(g, m + 15) & 0x07) !== 0 ? 1 : 0;
    }
    return 0; // inactive: fall through to AI immediately (asm clc)
}

/**
 * monster_activation (dungeon.c:3505): spawns a monster from its spawn
 * point once the hero comes close enough. Handles both regular monsters
 * (3×3 occupancy scan) and big two-entry monsters (5×3 scan, double
 * marker, both halves initialized).
 */
export function monsterActivation(g: Uint8Array, m: number): void {
    // monster must currently be deactivated ("item" state: currX high = FF)
    if (g8(g, m + 1) !== 0xff) return;

    // big monsters occupy two consecutive entries; the second half must
    // also be deactivated
    if ((g8(g, m + 7) & 0x10) !== 0 && g8(g, m + 16 + 1) !== 0xff) return;

    // must have a defined respawn point
    const spwnX = g16(g, m + 11);
    if (spwnX === 0xffff) return;

    // hero must be within proximity range (excluding window edges)
    const prox = isInProximityWindow(g, spwnX);
    if (!prox.inside) return;
    const bl = prox.xRel;
    if (bl === 0 || bl === 35) return;

    // skip if the spawn row is on-screen (within 24 rows below the viewport
    // top) AND the horizontal distance isn't right at the detection edge —
    // avoids visibly popping a monster in front of the hero
    let al = (g8(g, VIEWPORT_TOP_ROW) - 2) & 0x3f;
    al = (g8(g, m + 13) - al) & 0x3f;
    if (al < 24 && bl >= 3 && bl < 32) return;

    if ((g8(g, m + 7) & 0x10) === 0) {
        /* ---------------- regular (small) monster ---------------- */
        s8(g, m + 3, bl);

        const diOrig = coordsToProxAddr(g, bl, g8(g, m + 13));
        let di = wrapMapFromBelow((diOrig - (PROX_COLS + 1)) & 0xffff);
        let occupancy = 0;
        for (let row = 0; row < 3; row++) {
            occupancy |= g8(g, di) | g8(g, di + 1) | g8(g, di + 2);
            di = wrapMapFromAbove((di + PROX_COLS) & 0xffff);
        }

        if ((occupancy & 0x80) !== 0) return; // 3×3 area already has a monster

        s8(g, diOrig, g8(g, MONSTER_INDEX) | 0x80);
        s16(g, m, g16(g, m + 11)); // currX = spwnX
        s8(g, m + 2, g8(g, m + 13)); // currY = spwnY
        s8(g, m + 4, g8(g, m + 14)); // flags = type_
        s8(g, m + 6, 0x10);
        s8(g, m + 5, 0);
        s8(g, m + 9, 0);
        s8(g, m + 10, 0);
        s8(g, m + 8, 0);

        s8(g, PROXIMITY_LAYER2 + g8(g, MONSTER_INDEX), 0);
    } else {
        /* ---------------- big monster (2 table entries) ---------------- */

        if ((g8(g, m + 14) & 1) !== 0) return;

        s8(g, m + 3, bl);
        s8(g, m + 16 + 3, bl);

        const diOrig = coordsToProxAddr(g, bl, g8(g, m + 13));
        let di = wrapMapFromBelow((diOrig - (PROX_COLS + 1)) & 0xffff);
        let occupancy = 0;
        for (let row = 0; row < 5; row++) {
            occupancy |= g8(g, di) | g8(g, di + 1) | g8(g, di + 2);
            di = wrapMapFromAbove((di + PROX_COLS) & 0xffff);
        }

        if ((occupancy & 0x80) !== 0) return;

        let al = (g8(g, MONSTER_INDEX) | 0x80) & 0xff;
        di = diOrig;
        s8(g, di, al);
        di = wrapMapFromAbove((di + PROX_COLS * 2) & 0xffff);
        // asm increments AL itself: marker is (idx|0x80)+1 with uint8 wrap
        s8(g, di, (al + 1) & 0xff);

        const ax = g16(g, m + 11); // spwnX
        s16(g, m, ax);
        s16(g, m + 16, ax);
        al = g8(g, m + 13); // spwnY
        s8(g, m + 2, al);
        s8(g, m + 16 + 2, (al + 2) & 0x3f);
        al = g8(g, m + 14); // type_
        s8(g, m + 4, al);
        s8(g, m + 16 + 4, (al + 1) & 0xff);
        s8(g, m + 6, 0x10);
        s8(g, m + 16 + 6, 0x10);
        s8(g, m + 5, 0);
        s8(g, m + 16 + 5, 0);
        s8(g, m + 9, 0);
        s8(g, m + 16 + 9, 0);
        s8(g, m + 10, 0);
        s8(g, m + 16 + 10, 0);
        s8(g, m + 8, 0);
        s8(g, m + 16 + 8, 0);
        s8(g, m + 16 + 7, g8(g, m + 16 + 7) & 0xf0);
        // clears the backup tile for BOTH halves (bx and bx+1): word write
        s16(g, PROXIMITY_LAYER2 + g8(g, MONSTER_INDEX), 0);
    }
}

/**
 * is_tile_safe_to_stay (dungeon.c:3809). Returns 0 when the tile matches an
 * entry in the seg1 aggressive-tiles list (hurts to stand on), 0xFF when
 * safe (list terminator or no match).
 */
export function isTileSafeToStay(g: Uint8Array, tile: number): number {
    for (let i = 0; i < 4; i++) {
        const aggr = seg8(g, AGGRESSIVE_TILES + i);
        if (aggr === 0) return 0xff; // end of list, no match
        if (tile === aggr) return 0;
    }
    return 0xff;
}

/**
 * check_monster_on_aggressive_ground (dungeon.c:3667): reads the tile two
 * rows below the monster's anchor cell. Returns 0 when unsafe.
 */
export function checkMonsterOnAggressiveGround(g: Uint8Array, m: number): number {
    const y = g8(g, m + 2);
    const xRel = g8(g, m + 3);
    let di = wrapMapFromAbove((coordsToProxAddr(g, xRel, y) + 2 * PROX_COLS) & 0xffff);
    const tile = g8(g, di);
    return isTileSafeToStay(g, tile);
}
