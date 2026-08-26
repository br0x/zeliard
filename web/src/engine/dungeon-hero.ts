/**
 * dungeon-hero.ts — TS port of dungeon.c's horizontal hero movement
 * pipeline (Stage 8b, slice 1).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - get_dst_monster_flags                (1583-1597)
 *   - move_hero_right_if_no_obstacles      (1600-1633)
 *   - move_hero_left_if_no_obstacles       (1635-1666)
 *   - hero_moves_right / hero_moves_left   (1668-1757) — proximity-window
 *     slide (byte-exact memmove via copyWithin), incremental column unpack
 *     through the packed-map cursors shared with engine/unpack.ts, enemy
 *     projectile x-shifts, and monster edge re-marking from the monsters
 *     list.
 *   - every_projectile_moves_left/right_in_viewport (5658-5680)
 *   - hero_interaction_check               (1762-1785)
 *   - hero_coords_to_addr_in_proximity     (1384-1392)
 */


import { SEG1_BASE } from '../core/memory.js';
import {
    isBlockingTile,
    isBlockingTileSimple,
    isLeftAirflow,
    isRightAirflow,
} from './dungeon-entities.js';
import {
    ADDR_PACKED_MAP_END_PTR,
    ADDR_PACKED_MAP_START,
    unpackColumnBackward,
    unpackColumnForward,
    unpackCursors,
    unpackStepBackward,
    unpackStepForward,
} from './unpack.js';

const PROX_COLS = 36;
const DUNGEON_HEIGHT = 64;
const ADDR_PROXIMITY_MAP = 0xe000;
const PROJECTILES_LIST = 0xeb80; // 13-byte slots, p_x_rel 0xFF terminates
const MONSTERS_LIST = 0xc010; // word ptr, 16-byte entries, x=0xFFFF terminates
const MONSTER_INDEX = 0xff4a; // byte

const LEFT_COL = 0x80; // word — proximity map left column
const HERO_XV = 0x83;
const HERO_HEAD_Y_VIEW = 0x84;
const SQUAT_FLAG = 0xff38;
const VIEWPORT_LEFT_TOP = 0xff31; // word

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

/** coords_to_prox_addr (dungeon.c:1375). */
function coordsToProxAddr(x: number, y: number): number {
    return (ADDR_PROXIMITY_MAP + (y & 0x3f) * PROX_COLS + (x & 0xff)) & 0xffff;
}

/** wrap_map_from_above (dungeon.c:1359). */
function wrapMapFromAbove(addr: number): number {
    return addr >= ADDR_PROXIMITY_MAP + PROX_COLS * DUNGEON_HEIGHT
        ? addr - PROX_COLS * DUNGEON_HEIGHT
        : addr;
}

/** wrap_map_from_below (dungeon.c:1366). */
function wrapMapFromBelow(addr: number): number {
    return addr < ADDR_PROXIMITY_MAP ? addr + PROX_COLS * DUNGEON_HEIGHT : addr;
}

/** hero_coords_to_addr_in_proximity (dungeon.c:1384). */
export function heroCoordsToAddrInProximity(g: Uint8Array): number {
    const headY = g8(g, HERO_HEAD_Y_VIEW);
    const viewX = g8(g, HERO_XV);
    let addr =
        g16(g, VIEWPORT_LEFT_TOP) + headY * PROX_COLS + viewX + 4;
    addr = wrapMapFromAbove(addr);
    return addr;
}

/** get_dst_monster_flags (dungeon.c:1583) — returns [flags, monsterStruct]. */
export function getDstMonsterFlags(
    g: Uint8Array,
    si: number,
): { flags: number; monsterStruct: number } {
    let tile = g8(g, si);
    if ((tile & 0x80) === 0) {
        return { flags: tile, monsterStruct: 0 };
    }
    tile &= 0x7f;
    const addr = (g16(g, MONSTERS_LIST) + tile * 16) & 0xffff;
    return { flags: g8(g, addr + 4), monsterStruct: addr };
}

/** every_projectile_moves_left_in_viewport (dungeon.c:5658). */
export function everyProjectileMovesLeftInViewport(g: Uint8Array): void {
    for (let p = PROJECTILES_LIST; ; p += 13) {
        if (g8(g, p) === 0xff) return;
        if (g8(g, p) !== 0) s8(g, p, g8(g, p) - 1);
    }
}

/** every_projectile_moves_right_in_viewport (dungeon.c:5669). */
export function everyProjectileMovesRightInViewport(g: Uint8Array): void {
    for (let p = PROJECTILES_LIST; ; p += 13) {
        if (g8(g, p) === 0xff) return;
        if (g8(g, p) !== 0) s8(g, p, g8(g, p) + 1);
    }
}

/** hero_moves_right (dungeon.c:1668). */
export function heroMovesRight(g: Uint8Array): void {
    let leftCol = (g16(g, LEFT_COL) + 1) & 0xffff;
    const mapWidth = g16(g, 0xc002);
    s16(g, LEFT_COL, leftCol);

    leftCol = (leftCol + (PROX_COLS - 1)) & 0xffff;
    if (leftCol === mapWidth) {
        unpackCursors.proxRight = (ADDR_PACKED_MAP_END_PTR + 1) & 0xffff;
    }

    // memmove(dest, dest+1, N-1): slide the whole window one byte back.
    const n = PROX_COLS * DUNGEON_HEIGHT;
    g.copyWithin(ADDR_PROXIMITY_MAP, ADDR_PROXIMITY_MAP + 1, ADDR_PROXIMITY_MAP + n);

    let si = (unpackCursors.proxRight + 1) & 0xffff;
    si = unpackColumnForward(g, si, ADDR_PROXIMITY_MAP + PROX_COLS - 1);
    unpackCursors.proxRight = (si - 1) & 0xffff;

    leftCol = g16(g, LEFT_COL);
    if (leftCol === mapWidth) {
        s16(g, LEFT_COL, 0);
        si = ADDR_PACKED_MAP_START;
    } else {
        // skip column forward
        si = unpackCursors.proxLeft;
        let dh = 0;
        do {
            const st = unpackStepForward(g, si);
            si = st.ptr;
            dh += st.count;
        } while (dh < DUNGEON_HEIGHT);
    }
    unpackCursors.proxLeft = si;

    everyProjectileMovesLeftInViewport(g);
    s8(g, MONSTER_INDEX, 0);

    let markCol = (g16(g, LEFT_COL) + PROX_COLS - 1) & 0xffff;
    if (markCol >= mapWidth) markCol -= mapWidth;

    let siM = g16(g, MONSTERS_LIST);
    for (;;) {
        const currX = g16(g, siM);
        if (currX === 0xffff) break;
        const idx = g8(g, MONSTER_INDEX);
        if (((currX >> 8) & 0xff) !== 0xff && currX === markCol) {
            const currY = g8(g, siM + 2);
            const prox = coordsToProxAddr(PROX_COLS - 1, currY);
            s8(g, prox, idx | 0x80);
        }
        s8(g, MONSTER_INDEX, (idx + 1) & 0xff);
        siM += 16;
    }
}

/** hero_moves_left (dungeon.c:1713). */
export function heroMovesLeft(g: Uint8Array): void {
    let leftCol = (g16(g, LEFT_COL) - 1) & 0xffff;
    const mapWidth = g16(g, 0xc002);
    if (leftCol === 0xffff) {
        leftCol = (mapWidth - 1) & 0xffff;
        unpackCursors.proxLeft = g16(g, ADDR_PACKED_MAP_END_PTR);
    }
    s16(g, LEFT_COL, leftCol);

    // memmove(dest+1, dest, N-1): slide the window one byte forward.
    const n = PROX_COLS * DUNGEON_HEIGHT;
    g.copyWithin(ADDR_PROXIMITY_MAP + 1, ADDR_PROXIMITY_MAP, ADDR_PROXIMITY_MAP + n - 1);

    let si = (unpackCursors.proxLeft - 1) & 0xffff;
    si = unpackColumnBackward(g, si, ADDR_PROXIMITY_MAP + PROX_COLS * (DUNGEON_HEIGHT - 1));
    unpackCursors.proxLeft = (si + 1) & 0xffff;

    si = (g16(g, ADDR_PACKED_MAP_END_PTR) - 1) & 0xffff;
    leftCol = g16(g, LEFT_COL);
    if (leftCol + PROX_COLS !== mapWidth) {
        // skip column backward
        si = unpackCursors.proxRight;
        let dh = 0;
        do {
            const st = unpackStepBackward(g, si);
            si = st.ptr;
            dh += st.count;
        } while (dh < DUNGEON_HEIGHT);
    }
    unpackCursors.proxRight = si;

    everyProjectileMovesRightInViewport(g);
    s8(g, MONSTER_INDEX, 0);

    let siM = g16(g, MONSTERS_LIST);
    for (;;) {
        const currX = g16(g, siM);
        if (currX === 0xffff) break;
        const idx = g8(g, MONSTER_INDEX);
        if (((currX >> 8) & 0xff) !== 0xff && currX === leftCol) {
            const currY = g8(g, siM + 2);
            const prox = coordsToProxAddr(0, currY);
            s8(g, prox, idx | 0x80);
        }
        s8(g, MONSTER_INDEX, (idx + 1) & 0xff);
        siM += 16;
    }
}

/** move_hero_right_if_no_obstacles (dungeon.c:1600). 0xFF = moved. */
export function moveHeroRightIfNoObstacles(g: Uint8Array): number {
    const si0 = heroCoordsToAddrInProximity(g) + 2;
    let si = wrapMapFromBelow(si0 - PROX_COLS);
    for (let i = 0; i < 4; i++) {
        const { flags } = getDstMonsterFlags(g, si);
        if ((flags & 0x80) !== 0) return 0; // destroyable wall to the right
        si = wrapMapFromAbove(si + PROX_COLS);
    }
    si = si0;
    if (g8(g, SQUAT_FLAG) === 0) {
        // head level: needs 2 checks
        const tile = g8(g, si);
        if (isBlockingTile(g, tile)) return 0;
        if (isLeftAirflow(g, tile)) return 0;
    }
    // body and feet levels
    for (let i = 0; i < 2; i++) {
        si = wrapMapFromAbove(si + PROX_COLS);
        const tile = g8(g, si);
        if (isBlockingTileSimple(g, tile) !== 0) return 0;
        if (isLeftAirflow(g, tile)) return 0;
    }
    heroMovesRight(g);
    return 0xff;
}

/** move_hero_left_if_no_obstacles (dungeon.c:1635). 0xFF = moved. */
export function moveHeroLeftIfNoObstacles(g: Uint8Array): number {
    const si0 = heroCoordsToAddrInProximity(g);
    let si = wrapMapFromBelow(si0 - PROX_COLS);
    si -= 1; // tile NW of hero top-left
    for (let i = 0; i < 4; i++) {
        const { flags } = getDstMonsterFlags(g, si);
        if ((flags & 0x80) !== 0) return 0; // destroyable wall to the left
        si = wrapMapFromAbove(si + PROX_COLS);
    }
    si = si0;
    if (g8(g, SQUAT_FLAG) === 0) {
        const tile = g8(g, si);
        if (isBlockingTile(g, tile)) return 0;
        if (isRightAirflow(g, tile)) return 0;
    }
    for (let i = 0; i < 2; i++) {
        si = wrapMapFromAbove(si + PROX_COLS);
        const tile = g8(g, si);
        if (isBlockingTileSimple(g, tile) !== 0) return 0;
        if (isRightAirflow(g, tile)) return 0;
    }
    heroMovesLeft(g);
    return 0xff;
}

/**
 * hero_interaction_check (dungeon.c:1762) — hero walked into a wall:
 * pick the slide direction based on the blocking shape.
 */
export function heroInteractionCheck(g: Uint8Array): void {
    if (g8(g, SQUAT_FLAG) !== 0) return;
    if (g8(g, JUMP_PHASE_FLAGS) !== 0) return;
    let si = heroCoordsToAddrInProximity(g);
    let tile = g8(g, si);
    if (!isBlockingTile(g, tile)) return;
    si += 2;
    tile = g8(g, si);
    if (!isBlockingTile(g, tile)) return;
    si = wrapMapFromAbove(si + PROX_COLS);
    tile = g8(g, si);
    if (!isBlockingTile(g, tile)) {
        heroMovesRight(g);
    } else {
        heroMovesLeft(g);
    }
}

// seg1 re-export for tests that need to seed the passable/airflow lists
// relative to the same base the C build uses.
export const SEG1_BASE_ADDR = SEG1_BASE;

// ─── vertical mechanics: jump press (dungeon.c:2107) ───

const SLIDE_TICKS_REMAINING = 0x9f20;
const ON_ROPE_FLAGS = 0xff39;
const JUMP_PHASE_FLAGS = 0xff3d;
const SLOPE_DIRECTION = 0xff42;
const BYTE_9F09 = 0x9f09; // vertical scroll offset / jump step counter
const HEIGHT_ABOVE_GROUND = 0x9f0c;
const JUMP_HEIGHT_INCLUDING_SHOES = 0x9f0d;
const UP_FLAG = 2; // FACING bit 1

/** move_hero_up (dungeon.c:1394): viewport scrolls up one row. */
export function moveHeroUp(g: Uint8Array): void {
    s8(g, 0x82, (g8(g, 0x82) - 1) & 0xff); // ADDR_VIEWPORT_TOP_ROW
    let addr = g16(g, VIEWPORT_LEFT_TOP);
    addr = wrapMapFromBelow(addr - PROX_COLS);
    s16(g, VIEWPORT_LEFT_TOP, addr);
}

/**
 * jump_press_handler (dungeon.c:2107) — Space pressed while grounded/
 * airborne: advance slide counter, start/continue/terminate jumps.
 */
export function jumpPressHandler(g: Uint8Array): void {
    s8(g, SLIDE_TICKS_REMAINING, Math.min((g8(g, SLIDE_TICKS_REMAINING) + 1) & 0xff, 10));

    if (g8(g, ON_ROPE_FLAGS) !== 0) return;

    s8(g, SQUAT_FLAG, 0);

    // Max jump height reached → descend
    if (g8(g, BYTE_9F09) >= g8(g, JUMP_HEIGHT_INCLUDING_SHOES)) {
        s8(g, SLOPE_DIRECTION, 0);
        s8(g, JUMP_PHASE_FLAGS, 0x7f);
        return;
    }

    // Tile above the hero's head (3×3 matrix top-left offset −35)
    const tilePtr = wrapMapFromBelow(heroCoordsToAddrInProximity(g) - 35);
    const tileAbove = g8(g, tilePtr);

    if (!isBlockingTile(g, tileAbove)) {
        // Clear above: ascend
        s8(g, 0xe7, 0); // HERO_ANIM_PHASE
        s8(g, 0xc2, g8(g, 0xc2) & ~UP_FLAG); // FACING clear Up bit
        s8(g, JUMP_PHASE_FLAGS, 0xff); // ascending
        s8(g, HEIGHT_ABOVE_GROUND, g8(g, JUMP_HEIGHT_INCLUDING_SHOES) >> 1);
        s8(g, BYTE_9F09, (g8(g, BYTE_9F09) + 1) & 0xff);

        if (g8(g, HERO_HEAD_Y_VIEW) >= 7) {
            s8(g, HERO_HEAD_Y_VIEW, g8(g, HERO_HEAD_Y_VIEW) - 1);
        } else {
            moveHeroUp(g);
        }
    } else {
        if (g8(g, BYTE_9F09) !== 0) {
            // mid-jump → descend
            s8(g, SLOPE_DIRECTION, 0);
            s8(g, JUMP_PHASE_FLAGS, 0x7f);
            return;
        }
        // idle against ceiling
        s8(g, 0xe7, 0x80);
    }
}

