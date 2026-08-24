/**
 * vertical-scenario.ts — shared deterministic scenario builders for the
 * Stage 8b slice-3 parity tests (not a test file itself).
 */
export const PROX = 0xe000;
export const PROX_BYTES = 36 * 64;

let view: Uint8Array;

/** Bind the wasm g_mem view for the scenario builders. */
export function bindView(v: Uint8Array): void {
    view = v;
}

/** Fractional helper: rand() yields uint32s, so compare via [0,1) floats. */
export function frac(rand: () => number): number {
    return rand() / 4294967296;
}

export function rng(seed: number): () => number {
    let x = seed >>> 0;
    return () => {
        x = (x * 1664525 + 1013904223) >>> 0;
        return x;
    };
}

/**
 * Packed-map bytes: a solid 0x55 stream (RLE case-1: count=2, tile=6, ONE
 * byte per step). Every column decodes from exactly 32 bytes with zero
 * out-of-window overshoot in BOTH scroll directions regardless of cursor
 * alignment — free-form bytes made the column decoder spray tiles outside
 * the proximity window and corrupt the scratch tables under test (this
 * hung the parity runs via the unbounded monsters-list scan).
 */
function fillPackedMap(): void {
    view.fill(0x55, 0xc01b, 0xc400);
    // packed end pointer word lands inside the filled region (wrap cases)
    view[0xc019] = 0x20;
    view[0xc01a] = 0xc3;
}

/**
 * Deterministic base dungeon scenario: seg1 classification lists, engine
 * state bytes, packed map, proximity window, monsters scratch table and
 * empty platform-list pointers.
 */
export function applyBase(rand: () => number): void {
    // seg1 passable-tiles list (24 entries)
    const passablePool = [0, 3, 6, 7, 8, 9, 0x10, 0x20, 0x30];
    for (let i = 0; i < 24; i++) view[0x18000 + i] = passablePool[rand() % 9]!;
    // slope tile lists (seg1 0x8018 left / 0x801c right, 4 entries, 0-term)
    const slopePool = [0x50, 0x51, 0x52, 0x53];
    for (let i = 0; i < 4; i++) {
        view[0x18018 + i] = frac(rand) < 0.6 ? slopePool[rand() % 4]! : 0;
        view[0x1801c + i] = frac(rand) < 0.6 ? slopePool[rand() % 4]! : 0;
    }
    // airflow list (seg1 0x8024)
    for (let i = 0; i < 12; i++) view[0x18024 + i] = rand() % 5 === 0 ? 3 : 0;

    // engine config + state
    const mapWidth = 40 + rand() % 160;
    view[0xc002] = mapWidth & 0xff;
    view[0xc003] = (mapWidth >> 8) & 0xff;
    view[0xc012] = [0, 1, 4, 5, 6, 7][rand() % 6]!; // cavern level (4 = slippery ice)
    view[0x9e] = rand() % 6; // accessory
    view[0x83] = 4 + rand() % 18; // hero x view
    view[0x84] = 2 + rand() % 25; // hero head y view
    const topRow = rand() % 40;
    view[0x82] = topRow;
    const vlt = 0xe000 + (topRow & 0x3f) * 36;
    view[0xff31] = vlt & 0xff;
    view[0xff32] = (vlt >> 8) & 0xff;
    const leftCol = rand() % mapWidth;
    view[0x80] = leftCol & 0xff;
    view[0x81] = (leftCol >> 8) & 0xff;

    view[0xc2] = rand() % 256; // facing
    view[0xff38] = frac(rand) < 0.2 ? 0xff : 0; // squat
    view[0xff39] = frac(rand) < 0.15 ? 0xff : 0; // on rope
    view[0xff3d] = frac(rand) < 0.5 ? (frac(rand) < 0.5 ? 0xff : 0x80) : 0; // jump phase
    view[0xff42] = rand() % 3; // slope direction
    view[0xe7] = frac(rand) < 0.3 ? 0x80 : rand() % 256; // anim phase
    view[0x9f08] = rand() % 256; // jump height counter
    view[0x9f09] = rand() % 5; // jump step counter
    view[0x9f0a] = rand() % 256; // frame ticks
    view[0x9f16] = rand() % 256; // ticks
    view[0x9f0c] = rand() % 4; // height above ground
    view[0x9f20] = rand() % 12; // slide ticks remaining
    view[0x9f21] = rand() % 16; // horiz movement accum
    view[0x9f22] = rand() % 3; // slide direction
    view[0x9f23] = rand() % 2; // slide direction lock
    view[0x9f18] = rand() % 256;
    view[0x9f19] = rand() % 256;
    view[0xff17] = rand() % 256; // input dirs
    view[0xff92] = rand() % 256; // render request
    view[0xff93] = rand() % 256; // render done

    // Normalize scratch in the safe band above the proximity window first;
    // the live tables below are written AFTER this so they survive.
    view.fill(0, 0xe9dc, 0xee00);

    // monsters list pointer → scratch table in the safe band above the
    // proximity window: column-decoder overshoot writes tiles outside the
    // window (down on backward scrolls, up on forward scrolls), so live
    // tables must sit where those writes can never reach.
    view[0xc010] = 0xe9e0 & 0xff;
    view[0xc011] = 0xe9e0 >> 8;
    let mi = 0xe9e0;
    for (let k = 0; k < 4; k++) {
        const mx = 20 + rand() % 60;
        view[mi] = mx & 0xff;
        view[mi + 1] = (mx >> 8) & 0xff;
        view[mi + 2] = (rand() * 64) & 0x3f;
        view[mi + 4] = rand() < 0.4 ? 0x80 : 0x00;
        view[mi + 5] = rand() % 256;
        mi += 16;
    }
    view[mi] = 0xff;
    view[mi + 1] = 0xff;

    fillPackedMap();

    // platform list pointers → scratch tables (same safe band as monsters)
    view[0xc004] = 0xea60 & 0xff;
    view[0xc005] = 0xea60 >> 8;
    view[0xc006] = 0xea90 & 0xff;
    view[0xc007] = 0xea90 >> 8;

    // enemy projectile list (13-byte slots, p_x_rel 0xFF terminates): keep a
    // well-formed list — the C scans walk it without bounds checks
    let pj = 0xeb80;
    for (let k = 0; k < 5; k++) {
        view[pj] = rand() % 40;
        for (let b = 1; b < 13; b++) view[pj + b] = Math.floor(rand() * 256);
        pj += 13;
    }
    view[pj] = 0xff;

    // proximity window: mostly air, mixed tiles/markers/platform variants
    const mix = [0, 1, 2, 6, 0xfd, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x50, 0x51];
    for (let i = 0; i < PROX_BYTES; i++) {
        view[PROX + i] =
            frac(rand) < 0.55 ? 0 : frac(rand) < 0.85 ? (mix[rand() % mix.length] ?? 0) : rand() % 256;
    }
}

interface PlacementInfo {
    absX: number;
    feetY: number;
    col: number;
    row: number;
}

/** Test-side mirror of abs_x_to_proximity_rel's bx computation. */
function relBx(absX: number): number {
    const proxLeft = (view[0x80] ?? 0) | ((view[0x81] ?? 0) << 8);
    const mapWidth = (view[0xc002] ?? 0) | ((view[0xc003] ?? 0) << 8);
    let d: number;
    if (absX >= proxLeft) d = (absX - proxLeft) & 0xffff;
    else if (absX > 33) d = absX;
    else d = (mapWidth - proxLeft + absX) & 0xffff;
    return d;
}

/** Window offset (0..2303) of hero_coords_to_addr_in_proximity's cell. */
export function heroBaseOff(): number {
    const xv = view[0x83] ?? 0;
    const headY = view[0x84] ?? 0;
    const topRow = view[0x82] ?? 0;
    return (((topRow & 0x3f) + headY) * 36 + xv + 4) % PROX_BYTES;
}

/**
 * Places a platform triple so the tile probed below the hero's feet is the
 * `variant` member of the dl..dl+2 family, clears the cells the platform
 * move loops inspect, and appends a matching sentinel entry to the
 * platform table so find_platform_under_hero always terminates.
 */
export function placePlatform(
    rand: () => number,
    kind: 'vertical' | 'collapsing',
    opts: { markerBelow?: boolean } = {},
): PlacementInfo {
    const dl = kind === 'vertical' ? 0x40 : 0x43;
    const variant = rand() % 3; // which of left/mid/right sits at the probe cell
    const dh = 1 - variant;

    const xv = view[0x83] ?? 0;
    const headY = view[0x84] ?? 0;
    const topRow = view[0x82] ?? 0;
    const mapWidth = (view[0xc002] ?? 0) | ((view[0xc003] ?? 0) << 8);

    // hero_coords_to_addr_in_proximity window offset: (topRow+headY) rows
    // down from the prox base, xv+4 columns right.
    const baseOff = (((topRow & 0x3f) + headY) * 36 + xv + 4) % PROX_BYTES;
    const feetOff = (baseOff + 3 * 36 + 1) % PROX_BYTES;
    view[PROX + feetOff] = dl + variant;

    let absX = (xv + 4 + dh) & 0xffff;
    absX = (absX + (((view[0x80] ?? 0) | ((view[0x81] ?? 0) << 8)))) & 0xffff;
    if (absX >= mapWidth) absX -= mapWidth;
    const feetY = (topRow + headY + 3) & 0x3f;

    const col = relBx(absX);
    const row = feetY;

    if (opts.markerBelow === true && col <= 34) {
        // put a monster marker directly below the platform's mid tile
        const id = 1 + (rand() % 3);
        view[PROX + ((((row + 1) & 0x3f) * 36) + col)] = 0x80 | id;
        // give the referenced monster struct sane flags/state bytes
        const m = 0xe9e0 + id * 16;
        view[m + 4] = 0x80;
        view[m + 5] = frac(rand) < 0.5 ? 0x20 : 0x00;
    } else if (col <= 34) {
        // clear the row below so the down-move path can proceed
        for (let c = col - 1; c <= col + 2; c++) {
            if (c >= 0 && c < 36) view[PROX + (((row + 1) & 0x3f) * 36) + c] = 0;
        }
    }

    if (kind === 'vertical') {
        // clear the two rows above so the up-move path can proceed
        for (const r of [(row + 63) & 0x3f, (row + 62) & 0x3f]) {
            for (let c = col; c <= col + 2; c++) {
                if (c < 36) view[PROX + r * 36 + c] = 0;
            }
        }
        // tile above the hero's head must be non-blocking for the grab check
        const aboveHead = (baseOff - 35 + PROX_BYTES) % PROX_BYTES;
        view[PROX + aboveHead] = frac(rand) < 0.3 ? 1 : 0;
    }

    // sentinel entry guaranteeing find_platform_under_hero terminates
    const listBase = kind === 'vertical' ? 0xea60 : 0xea90;
    let p = listBase;
    for (let k = 0; k < 3; k++) {
        const dx = (absX + 1 + k) & 0xffff;
        view[p] = dx & 0xff;
        view[p + 1] = (dx >> 8) & 0xff;
        view[p + 2] = (feetY + 1 + k) & 0x3f;
        p += 3;
    }
    view[p] = absX & 0xff;
    view[p + 1] = (absX >> 8) & 0xff;
    view[p + 2] = feetY;

    return { absX, feetY, col, row };
}

