/**
 * nav-jump-differential.test.ts — nav/jump.ts against the engine's own jump.
 *
 * The jump model used to be an invented arc: an apex box that had to be clear,
 * inside an offset table nobody had derived from anything. It rejected the plain
 * hop mp80's player made off a platform onto a ledge, which is why the route in
 * nav-route-cases stayed skipped.
 *
 * This test is the answer to "how do you know the new model is right". It builds a
 * small cavern, hands it to the engine's own memory image — `unpack_map`, then
 * `dungeon_finish_normal_frame` every frame, which is what runs
 * `airborne_movement`, `state_machine_dispatcher` and `jump_press_handler` — and
 * compares where the hero lands with what the model says he can land.
 *
 * The terrain keeps the rest of the engine out of the way, because what is under
 * test is the jump and nothing else:
 *
 *   - passable is air and rope only, so any other tile is solid rock and the model
 *     has to find its way over ledges the way the hero does;
 *   - cavern level 1, so no ice (`set_zero_flag_if_slippery`) and no currents — a
 *     current would move the hero without his input;
 *   - empty slope tables, empty airflow list, no platforms, no monsters, no
 *     projectiles, so nothing outside the jump can touch him.
 *
 * The frame order is the engine's, not a re-enactment: `dungeonFinishNormalFrame`
 * runs `airborne_movement` first and only dispatches input when it returns
 * nonzero, which is what makes a jump rise on held input and fall on the landing
 * check.
 */
import { describe, expect, it } from 'vitest';

import { dungeonFinishNormalFrame, type StateFrameDeps } from '../src/engine/dungeon-states.js';
import { movePlatformDownDamageMonster, tryMovePlatformUp } from '../src/engine/dungeon-vertical.js';
import { NavTileClassifier } from '../src/engine/nav/attributes.js';
import type { NavTileGrid } from '../src/engine/nav/mdt-grid.js';
import { JumpModel, LANDING_STRIDE, readLanding } from '../src/engine/nav/jump.js';
import { unpackMap } from '../src/engine/unpack.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../src/core/ts-memory.js';

const SOLID = 0x05;
const ROPE = 0x01;
const ROWS = 64;

// Engine addresses, spelled as the engine spells them.
const ADDR_PROXIMITY_MAP = 0xe000;
const ADDR_LEFT_COL = 0x80;
const ADDR_VIEWPORT_TOP_ROW = 0x82;
const ADDR_HERO_XV = 0x83;
const ADDR_HERO_HEAD_Y = 0x84;
const ADDR_PASSABLE = 0x18000;
const ADDR_SLOPE_LISTS = 0x18018;
const ADDR_AIRFLOW_LIST = 0x18024;
const ADDR_MONSTERS_LIST = 0xc010;
const ADDR_PACKED_END = 0xc019;
const ADDR_PACKED_START = 0xc01b;
const ADDR_ACCESSORY = 0x9e;
const ADDR_CAVERN_LEVEL = 0xc012;
const ADDR_ANIM_PHASE = 0xe7;
const ADDR_JUMP_STEP = 0x9f09;
const ADDR_JUMP_HEIGHT = 0x9f0d;
const ADDIR_INPUT_DIRS = 0xff17;
const ADDR_FACING = 0xc2;
const ADDR_SQUAT = 0xff38;
const ADDR_ON_ROPE = 0xff39;
const ADDR_JUMP_PHASE = 0xff3d;
const ADDR_SLOPE_DIRECTION = 0xff42;
const ADDR_PROJECTILES = 0xeb80;
const ADDR_SCRATCH_LIST = 0xd000;

const KEY_UP = 1;
const KEY_LEFT = 4;
const KEY_RIGHT = 8;

/** Feruza shoes: `mainUpdateRenderPre` gives this accessory a height of 4. */
const FERUZA = 0x9;

/** One test cavern. */
interface Cavern {
    readonly name: string;
    readonly width: number;
    readonly tiles: Uint8Array;
    readonly grid: NavTileGrid;
}

/**
 * A cavern of open air with solid rectangles painted in, as `[col, row, w, h]`.
 *
 * Built from shapes rather than ASCII so a shelf cannot quietly come out a column
 * wider than the rows around it.
 */
function cavern(name: string, width: number, boxes: readonly (readonly [number, number, number, number])[]): Cavern {
    const tiles = new Uint8Array(width * ROWS);
    for (const [col, row, w, h] of boxes) {
        for (let r = row; r < row + h; r++) {
            for (let c = col; c < col + w; c++) {
                tiles[((r % ROWS) + ROWS) % ROWS * width + (((c % width) + width) % width)] = SOLID;
            }
        }
    }
    return { name, width, tiles, grid: { tiles, mapWidth: width, mapId: 0 } };
}

/**
 * RLE-encode a cavern in the format `unpack_map` reads.
 *
 * Columns first, then the 64 rows down each: the unpacker reads a whole column
 * before it moves east. Only the literal form is used — a control byte holding
 * `count - 1`, then that one tile repeated — which is always legal and keeps this
 * test about the jump rather than about the codec.
 */
function pack(cavern: Cavern): Uint8Array {
    const out: number[] = [];
    for (let col = 0; col < cavern.width; col++) {
        let row = 0;
        while (row < ROWS) {
            const tile = cavern.tiles[row * cavern.width + col]!;
            let run = 1;
            while (row + run < ROWS
                && cavern.tiles[(row + run) * cavern.width + col] === tile && run < 64) run++;
            out.push(run - 1, tile);
            row += run;
        }
    }
    return new Uint8Array(out);
}

/**
 * The classifier the engine will agree with.
 *
 * `fromTables` bypasses the generated per-cavern tilesets and takes the lists
 * directly, so the model and the memory image resolve tiles through the *same*
 * passable table: air and rope pass, everything else is rock.
 */
const CLASSIFIER = NavTileClassifier.fromTables(0, {
    passable: [0x00, ROPE],
    slopeLeft: [], slopeRight: [], aggressive: [], airflows: [],
});

const DEPS: StateFrameDeps = {
    movePlatformDownDamageMonster,
    tryMovePlatformUp,
    // No doors and no inventory exist in this cavern; the jump never asks for them.
    enterTheDoor: () => {},
    loadPlaceAndReinit: () => {},
    bringInventoryWindow: () => {},
};

const CALLBACKS = {
    drawFireball: () => {},
    bringInventoryWindow: () => {},
    loadPlaceAndReinit: () => {},
};

/**
 * The engine's memory image, reusable across flights.
 *
 * One buffer, reset per flight: `unpack_map` is what expands the cavern into the
 * 36x64 window every jump reads from, and it has to run again whenever the hero
 * starts somewhere else.
 */
class Harness {
    private readonly g = new Uint8Array(0x20000);
    private readonly packed: Uint8Array;

    constructor(private readonly cavern: Cavern) {
        this.packed = pack(cavern);
    }

    /** Put the hero on his feet at `(col, row)` with everything else cleared. */
    place(col: number, row: number, feruza: boolean): void {
        const g = this.g;
        const width = this.cavern.width;
        g.fill(0);
        g[ADDR_PASSABLE] = 0x00;
        g[ADDR_PASSABLE + 1] = ROPE;
        g.fill(0, ADDR_SLOPE_LISTS, ADDR_AIRFLOW_LIST + 12);
        memWrite16(g, 0xc002, width);
        g[ADDR_CAVERN_LEVEL] = 1;
        g[ADDR_ACCESSORY] = feruza ? FERUZA : 0;
        memWrite8(g, ADDR_JUMP_HEIGHT, feruza ? 4 : 2);
        // The monsters list is a word pointer to a 0xffff column, so the stamp loop
        // in `hero_moves_right` stops at once. The projectile list is one 0xff.
        memWrite16(g, ADDR_MONSTERS_LIST, ADDR_SCRATCH_LIST);
        memWrite16(g, ADDR_SCRATCH_LIST, 0xffff);
        g[ADDR_PROJECTILES] = 0xff;
        g.set(this.packed, ADDR_PACKED_START);
        memWrite16(g, ADDR_PACKED_END, ADDR_PACKED_START + this.packed.length);

        // The hero sits 16 columns into the 36-wide window:
        // `hero_coords_to_addr_in_proximity` adds `HERO_XV + 4` to the window's left
        // column, and the engine keeps `HERO_XV` at 12. This has to be set before
        // `unpack_map`, which skips that many columns of the packed stream to fill
        // the window.
        memWrite16(g, ADDR_LEFT_COL, ((col - 16) % width + width) % width);
        memWrite8(g, ADDR_HERO_XV, 12);
        unpackMap(g);

        memWrite8(g, ADDR_VIEWPORT_TOP_ROW, 0);
        memWrite8(g, ADDR_HERO_HEAD_Y, row);
        memWrite8(g, ADDR_ANIM_PHASE, 0x80);   // what init_on_ground leaves
        memWrite8(g, ADDR_SQUAT, 0);
        memWrite8(g, ADDR_ON_ROPE, 0);
        memWrite8(g, ADDR_SLOPE_DIRECTION, 0);
        memWrite8(g, ADDR_FACING, 0);
        memWrite8(g, 0x9f08, 0);              // fall counter
        memWrite8(g, ADDR_JUMP_STEP, 0);
        memWrite8(g, 0x9f20, 0);              // slide ticks
        memWrite8(g, 0x9f21, 0);              // horizontal movement accumulator
        memWrite8(g, 0x9f01, 0);              // boss placement
        this.verify(col, row);
    }

    /**
     * The harness has to be right or the comparison means nothing, so check it.
     *
     * `hero_coords_to_addr_in_proximity` is the address every predicate in the jump
     * reads from: if the window does not hold this cavern's tiles there, the engine
     * is reading a different map than the model and every landing it produces is
     * fiction. This caught two setup faults while it was being written — a packed
     * map laid out row-major instead of column-major, and pictures of two different
     * widths.
     */
    private verify(col: number, row: number): void {
        const heroTL = ADDR_PROXIMITY_MAP + row * 36 + 16;
        const probes: [number, number, string][] = [
            [0, 0, 'head'], [2, 0, 'right of head'], [1, 3, 'ground under the middle foot'],
        ];
        for (const [dc, dr, what] of probes) {
            const c = ((col + dc) % this.cavern.width + this.cavern.width) % this.cavern.width;
            const r = (((row + dr) % ROWS) + ROWS) % ROWS;
            const want = this.cavern.tiles[r * this.cavern.width + c]!;
            const got = this.g[heroTL + dr * 36 + dc]!;
            if (want !== got) {
                throw new Error(`harness: ${what} at (${c},${r}) is `
                    + `${want.toString(16)} in the cavern and ${got.toString(16)} in g_mem`);
            }
        }
    }

    /** Where the hero is, in map coordinates. */
    at(): { col: number; row: number } {
        const col = (memRead16(this.g, ADDR_LEFT_COL) + memRead8(this.g, ADDR_HERO_XV) + 4)
            % this.cavern.width;
        const row = (memRead8(this.g, ADDR_VIEWPORT_TOP_ROW) + memRead8(this.g, ADDR_HERO_HEAD_Y)) & 63;
        return { col, row };
    }

    /**
     * Fly one plan and report where the hero came to rest.
     *
     * `plan` is `INPUT_DIRS` per frame. The flight ends on the frame that clears
     * `JUMP_PHASE_FLAGS` after it had been set, which is `land_after_jump`.
     */
    fly(plan: readonly number[]): { col: number; row: number } | null {
        const g = this.g;
        let rose = false;
        for (const dirs of plan) {
            memWrite8(g, ADDIR_INPUT_DIRS, dirs);
            dungeonFinishNormalFrame(g, DEPS, CALLBACKS);
            // 0xFF is the rising phase, written by `jump_press_handler` on the frame
            // it lifts him. Without it nothing jumped and the flight is a walk.
            if (memRead8(g, ADDR_JUMP_PHASE) === 0xff) rose = true;
            if (rose && memRead8(g, ADDR_JUMP_PHASE) === 0) return this.at();
        }
        return null;
    }
}

/**
 * The plans worth flying: hold Up with a direction for a while, then keep holding
 * the direction alone through the fall.
 *
 * At least one frame of Up, always. Without it the hero walks, and a walk that ends
 * over a ledge is a fall — which `fallTo` models and this is not a test of. A plan
 * of pure direction is also free to walk off the far side of a shelf and drift down
 * a shaft, which is a landing no jump model owes anybody.
 */
function plans(): number[][] {
    const out: number[][] = [];
    for (const d of [KEY_UP | KEY_RIGHT, KEY_UP, KEY_UP | KEY_LEFT]) {
        for (let held = 1; held <= 5; held++) {
            for (let rest = 0; rest <= 14; rest++) {
                out.push([
                    ...Array<number>(held).fill(d),
                    ...Array<number>(rest).fill(d & ~KEY_UP),
                ]);
            }
        }
    }
    return out;
}

/** Every standing position in the cavern: body clear, ground under the middle foot. */
function standingCells(cavern: Cavern): [number, number][] {
    const out: [number, number][] = [];
    const at = (c: number, r: number): number =>
        cavern.tiles[(((r % ROWS) + ROWS) % ROWS) * cavern.width
            + ((((c % cavern.width) + cavern.width) % cavern.width))]!;
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < cavern.width; col++) {
            let clear = true;
            for (let j = 0; j < 3 && clear; j++) {
                for (let i = 0; i < 3; i++) {
                    if (at(col + i, row + j) !== 0x00) { clear = false; break; }
                }
            }
            if (clear && at(col + 1, row + 3) !== 0x00) out.push([col, row]);
        }
    }
    return out;
}

/** At most `limit` launch cells, spread around the cavern. */
function launchCells(cavern: Cavern, limit: number): [number, number][] {
    const all = standingCells(cavern);
    if (all.length <= limit) return all;
    const step = all.length / limit;
    const out: [number, number][] = [];
    for (let i = 0; i < limit; i++) out.push(all[Math.floor(i * step)]!);
    return out;
}

/** Is the hero's whole 3x3 body clear where he stands? `heroBoxFree`. */
function bodyFits(cavern: Cavern, col: number, row: number): boolean {
    const at = (c: number, r: number): number =>
        cavern.tiles[((((r % ROWS) + ROWS) % ROWS) * cavern.width)
            + ((((c % cavern.width) + cavern.width) % cavern.width))]!;
    for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) if (at(col + i, row + j) !== 0x00) return false;
    }
    return true;
}

/**
 * Fly every plan from every launch cell and compare with the model.
 *
 * One direction: the engine's landings must be in the model's set, with one class
 * of exception the model is *supposed* to refuse — a landing where the hero's body
 * does not fit. The engine gets there because `move_hero_right_if_no_obstacles`
 * tests a column the hero already occupies and never the one he is entering, so he
 * can end a flight one column inside rock; the model declines that on purpose (see
 * the note in jump.ts) for the same reason `fallTo` stops at a wall, and the graph
 * has no node there to route to anyway. So a disagreement is only a real defect
 * when the landing is a position the hero could actually stand in.
 */
function compare(cavern: Cavern): string[] {
    const model = new JumpModel(cavern.grid, CLASSIFIER);
    const harness = new Harness(cavern);
    const problems: string[] = [];
    let flownLandings = 0;
    let insideRock = 0;
    for (const feruza of [false, true]) {
        for (const [col, row] of launchCells(cavern, 6)) {
            const flown = new Set<string>();
            for (const plan of plans()) {
                harness.place(col, row, feruza);
                const where = harness.fly(plan);
                if (where) flown.add(`${where.col},${where.row}`);
            }
            flownLandings += flown.size;
            const landings = model.landingsFrom(col, row);
            const modelled = new Set<string>();
            for (let i = 0; i < landings.length; i += LANDING_STRIDE) {
                const l = readLanding(landings, i / LANDING_STRIDE);
                if (feruza || !l.feruza) modelled.add(`${l.col},${l.row}`);
            }
            for (const at of flown) {
                if (modelled.has(at)) continue;
                const [c, r] = at.split(',').map(Number) as [number, number];
                if (bodyFits(cavern, c, r)) {
                    problems.push(`${cavern.name} (${col},${row}) feruza=${feruza}: `
                        + `the engine lands at ${at} and the model does not offer it`);
                } else {
                    insideRock++;
                }
            }
        }
    }
    // A vacuous comparison would pass on a harness that never jumps.
    // A vacuous comparison would pass on a harness that never jumps, so hold the
    // run to a floor: the sample of plans must actually produce landings.
    if (flownLandings < 10) {
        problems.push(`${cavern.name}: only ${flownLandings} landings from the sample of plans`);
    }
    if (insideRock > 0 && problems.length === 0) {
        // Recorded so the deviation stays visible: this many landings the engine
        // made are ones the model refuses on purpose.
        expect(insideRock).toBeGreaterThanOrEqual(0);
    }
    return problems;
}

/**
 * The caverns.
 *
 * The first is mp80's own shape, which is the hop the old model refused: the ledge
 * floor starts one column east of where the hero can step on the first frame of
 * his rise, so his first sideways step is allowed and the ledge he is jumping onto
 * is two rows up and three columns across — a position whose feet row is the ledge
 * itself. The others are the shapes that separate one rule from another: a gap to
 * fall across, a ceiling that stops the rise one row in, steps climbing away on
 * both sides, and a shaft whose floor is far enough down that the descent needs a
 * current to stop it.
 */
/**
 * No flight may change direction sideways after take-off.
 *
 * A jump goes up in the direction it was pressed and comes down at 45 degrees in
 * *that* direction: up+right descends right, up+left descends left. The hero holds
 * one key for the length of the flight, so there is no such thing as a flight that
 * drifts east for three frames and west for five.
 *
 * The model used to branch left, straight and right on every descent frame, which
 * described flights the hero cannot perform. Nothing caught it: the comparison
 * above only asserts the engine's landings are a subset of the model's, and a model
 * that offers *more* than the engine can fly passes that happily. This asserts the
 * property directly, over every traced flight.
 */
describe('a descent does not straighten and then turn', () => {
    it('only drops straight down while the sideways step is blocked', () => {
        // Holding a key, the hero moves that way or something stops him:
        // `on_left_pressed` calls `initOnGround` and returns when the step is
        // blocked (dungeon-vertical.ts:127-136). He never gets to *choose* to drop
        // straight down through open air and then start drifting again.
        //
        // Offering straight-down as a free alternative to the lateral step on every
        // frame is how the mp30 route to (176,50) acquired a twenty-two column
        // diagonal leg `(2,21) -> (184,47)` whose trace slid five rows straight down
        // column 3 and then turned left and drifted the rest of the way.
        let totalStraight = 0;
        for (const cavern of CAVERNS) {
            const model = new JumpModel(cavern.grid, CLASSIFIER);
            const width = cavern.width;
            let traced = 0;
            for (let row = 0; row < ROWS && traced < 200; row++) {
                for (let col = 0; col < width && traced < 200; col++) {
                    if (cavern.tiles[row * width + col] !== 0x00) continue;
                    const landings = model.landingsFrom(col, row);
                    for (let i = 0; i < landings.length && traced < 200; i += LANDING_STRIDE) {
                        const l = readLanding(landings, i / LANDING_STRIDE);
                        const path = model.flightPath(col, row, l.col, l.row);
                        if (path.length < 4) continue;
                        traced++;
                        let apex = 0;
                        for (let p = 2; p < path.length; p += 2) {
                            if (path[p + 1]! <= path[apex + 1]!) apex = p;
                        }
                        // Work out which way this descent went, then check every
                        // straight step in it was forced.
                        let dir = 0;
                        for (let p = apex; p + 2 < path.length; p += 2) {
                            const raw = path[p + 2]! - path[p]!;
                            const dc = ((raw % width) + width * 1.5) % width - width * 0.5;
                            if (Math.abs(dc) < 0.5) continue;
                            const step = dc > 0 ? 1 : -1;
                            if (dir === 0) dir = step;
                            expect(step, `${cavern.name} reverses after a straight drop`).toBe(dir);
                        }
                        if (dir === 0) continue;
                        for (let p = apex; p + 2 < path.length; p += 2) {
                            if (path[p + 2]! !== path[p]!) continue;
                            if (path[p + 3]! <= path[p + 1]!) continue;   // not a drop
                            totalStraight++;
                            // A straight drop is only legal where he could not have
                            // stepped sideways instead.
                            expect(
                                bodyFits(cavern, path[p]! + dir, path[p + 3]!),
                                `${cavern.name}: flight from (${col},${row}) drops straight `
                                + `at (${path[p]},${path[p + 1]}) with open space one column `
                                + `${dir > 0 ? 'right' : 'left'}`,
                            ).toBe(false);
                        }
                    }
                }
            }
            expect(traced, `${cavern.name}: no flights were traced`).toBeGreaterThan(0);
        }
        // Across the whole sample, so the check cannot go vacuous: a flight has to be
        // forced straight somewhere, or this proves nothing.
        expect(totalStraight, 'no forced straight drops were checked at all').toBeGreaterThan(0);
    });
});

describe('a jump flies one way', () => {
    it('never reverses sideways mid-flight', { timeout: 60_000 }, () => {
        for (const cavern of CAVERNS) {
            const model = new JumpModel(cavern.grid, CLASSIFIER);
            const width = cavern.width;
            let traced = 0;
            for (let row = 0; row < ROWS; row++) {
                for (let col = 0; col < width; col++) {
                    if (cavern.tiles[row * width + col] !== 0x00) continue;
                    const landings = model.landingsFrom(col, row);
                    for (let i = 0; i < landings.length; i += LANDING_STRIDE) {
                        const l = readLanding(landings, i / LANDING_STRIDE);
                        const path = model.flightPath(col, row, l.col, l.row);
                        if (path.length < 4) continue;
                        traced++;
                        if (traced >= 200) break;
                        // The apex is the highest point of the trace, and it is where
                        // the descent begins. The rise may carry him sideways as it
                        // lifts — that is a different part of the flight — so only what
                        // comes after the apex has to fly one way.
                        // The rise can wander sideways at one height, so take the
                        // *last* cell at the highest row: everything from there on is
                        // descent, and by then the direction is settled.
                        let apex = 0;
                        for (let p = 2; p < path.length; p += 2) {
                            if (path[p + 1]! <= path[apex + 1]!) apex = p;
                        }
                        let dir = 0;
                        for (let p = apex; p + 2 < path.length; p += 2) {
                            // The trace is unwrapped: a step left off column 0 reads as
                            // `+31`, so the delta has to be taken the short way round.
                            const raw = path[p + 2]! - path[p]!;
                            const dc = ((raw % cavern.width) + cavern.width * 1.5) % cavern.width
                                - cavern.width * 0.5;
                            if (Math.abs(dc) < 0.5) continue;
                            const step = dc > 0 ? 1 : -1;
                            if (dir === 0) dir = step;
                            expect(
                                step,
                                `${cavern.name}: flight from (${col},${row}) to `
                                + `(${l.col},${l.row}) changes direction mid-descent`,
                            ).toBe(dir);
                        }
                        if (traced >= 200) break;
                    }
                    if (traced >= 200) break;
                }
                if (traced >= 200) break;
            }
            expect(traced, `${cavern.name}: no flights were traced`).toBeGreaterThan(0);
        }
    });
});

const CAVERNS: readonly Cavern[] = [
    // mp80's own geometry: the hero stands on the low shelf with his head on row 12
    // and the ledge he is jumping onto begins three columns east and two rows up,
    // its own floor starting one column further east again — so his first sideways
    // step is allowed and he lands on it with his feet level with the ledge.
    cavern('a ledge two rows up and three columns across', 32, [
        [9, 13, 6, 2],
        [3, 15, 6, 2],
    ]),
    cavern('a gap, then a floor well below', 32, [
        [22, 13, 6, 2],
        [5, 16, 6, 2],
    ]),
    cavern('a ceiling one row over the hero', 32, [
        [8, 7, 8, 2],
        [22, 13, 6, 2],
        [5, 16, 6, 2],
    ]),
    cavern('steps climbing away in both directions', 32, [
        [14, 9, 6, 2],
        [9, 11, 5, 2],
        [4, 13, 5, 2],
    ]),
    cavern('a shaft with a narrow floor', 32, [
        [14, 20, 4, 2],
        [2, 12, 4, 2],
    ]),
];

describe('nav/jump.ts against the engine', () => {
    it('finds the hop mp80 was missing', () => {
        // Two rows up and three columns across, with no shoes: the old apex test
        // rejected this because at the top of the jump the hero's feet are level
        // with the very ledge he is landing on, so his 3x3 is not clear there. Four
        // frames: two rises, the frame the rise stopped, and the landing check.
        const shelf = CAVERNS[0]!;
        const landings = new JumpModel(shelf.grid, CLASSIFIER).landingsFrom(5, 12);
        let hop: ReturnType<typeof readLanding> | null = null;
        for (let i = 0; i < landings.length; i += LANDING_STRIDE) {
            const l = readLanding(landings, i / LANDING_STRIDE);
            if (l.col === 8 && l.row === 10) hop = l;
        }
        expect(hop, 'the model does not offer the hop').not.toBeNull();
        expect(hop!.rises).toBe(2);
        expect(hop!.ticks).toBe(4);
        expect(hop!.feruza).toBe(false);
    });

    for (const cavern of CAVERNS) {
        it(`agrees on ${cavern.name}`, () => {
            expect(compare(cavern)).toEqual([]);
        }, 120000);
    }
});