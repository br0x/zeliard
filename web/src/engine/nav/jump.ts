/**
 * jump.ts — what a single jump can reach, taken from the engine's own jump.
 *
 * Three routines implement a jump and nothing else:
 *
 *   jump_press_handler        engine/dungeon-hero.ts:319-360
 *   airborne_movement         engine/dungeon-input.ts:524-600
 *   check_floor_for_landing   engine/dungeon-vertical.ts:488-504
 *
 * Everything below is those routines read in the order the hero meets them. The
 * previous model was not: it wanted his whole 3x3 body clear at the apex, which
 * corresponds to no code in the game and rejects the ordinary hop up onto a
 * ledge, because at the top of such a jump his feet are level with the very
 * surface he is landing on.
 *
 * ── the frame ───────────────────────────────────────────────────────────────
 * `dungeonFinishNormalFrame` calls `airborne_movement` first and only calls
 * `state_machine_dispatcher` when it returns nonzero (dungeon-states.ts:122-124).
 * While the hero is rising, `jump_phase_flags` is 0xFF and `airborne_movement`
 * returns at once (dungeon-input.ts:526) — so the whole rise is driven by held
 * input, through the dispatcher.
 *
 * ── 1. the rise ─────────────────────────────────────────────────────────────
 *     if (BYTE_9F09 >= JUMP_HEIGHT_INCLUDING_SHOES) -> stop rising   (hero:327)
 *     else if (!isBlockingTile(tile at heroTL - 35)) -> up one row   (hero:334-343)
 *     else if (BYTE_9F09 != 0)                    -> stop rising    (hero:351)
 *     else                                        -> no jump at all  (hero:357)
 *
 * `heroTL` is the proximity address of the hero's top-left cell and the address
 * is `row * 36 + col`, so `heroTL - 35` is one row up and one column right: the
 * cell above the middle of his head. That single cell is the only obstruction
 * the rise ever consults — nothing about the rest of his body, and nothing at
 * the height he is rising *through*. He comes up past the lip of the ledge he is
 * jumping onto because the engine never asks.
 *
 * A jump needs at least one rise (the last branch leaves him grounded with his
 * head against a ceiling), so a jump from a tunnel roof is not a jump.
 *
 * ── 2. the sideways step ────────────────────────────────────────────────────
 * One column per frame, on every frame of the flight:
 *
 *   - on a rise, because `right_up_pressed` calls `jump_press_handler` and then
 *     `on_right_pressed` (dungeon-input.ts:337), so the step follows the rise in
 *     the same frame;
 *   - on the frame the rise stops, for the same reason;
 *   - on every descent frame, because `airborne_movement` re-reads `INPUT_DIRS`
 *     itself (dungeon-input.ts:568) — the hero can change his mind in flight,
 *     and the frame he spends turning around is a frame he still descends.
 *
 * There is no frame that is neither a rise nor a descent, so a jump covers
 * sideways at most `rises + 1 + descents` columns: one per rise, one on the
 * frame the rise stops, one per row he falls. The probe is the engine's own,
 * `heroCanStepSideways`.
 *
 * ── 3. the descent ──────────────────────────────────────────────────────────
 * One row per frame with no test at all — `BYTE_9F09--` and
 * `HERO_HEAD_Y_VIEW++`, or `hero_scroll_down` once that counter is spent
 * (dungeon-input.ts:536-541). The only thing that stops it is the landing check,
 * which runs at the top of each frame, before the row is added.
 *
 * Note what is *not* here: the engine never asks whether the hero's body fits. Not
 * on the way up (only the cell above his head), not on a sideways step (one column,
 * and not the one he is entering), not on the way down (no test at all), not on
 * landing (one cell, under his middle foot). A ledge jump in mp80 clips a column of
 * rock on the way up and lands with the hero's feet inside a floor; the game allows
 * it, so a model that refuses it refuses the player's route.
 *
 * ── 4. the landing ──────────────────────────────────────────────────────────
 * `check_floor_for_landing` is reproduced in geometry.canLand. The hero lands
 * when there is ground under his middle foot; in the single frame where his
 * animation phase is 0 rather than 0x80 — the pose a rise leaves him in — his
 * outer two feet are consulted too, which is how he stops over a one-tile gap.
 * Landing clears `JUMP_PHASE_FLAGS` and the flight is over.
 *
 * A platform counts as ground here and appears nowhere in the static map, so the
 * model is told where the standing slots are and treats those cells as a floor.
 * That is the engine's own split: a platform tile is 0x40..0x48, which
 * `is_blocking_tile_simple` stops at and `is_blocking_tile` lets through, so it
 * blocks the feet and not the head — he lands on it and can rise through it.
 *
 * So a landing ends the flight: the hero cannot drift past a row he would land
 * on. A long jump is a long fall that stops at the first ground, not a glide,
 * and that is what makes this a search rather than an offset table.
 *
 * ── what this does not model ────────────────────────────────────────────────
 * A rope caught mid-flight (`airborne_movement` grabs one at the hero's feet and
 * stops the fall, dungeon-input.ts:543-551): ignored, so a flight may pass
 * through a rope where the game would have him climb it — the graph's rope nodes
 * carry CLIMB edges, and a step sideways off one. There is no jump off a rope at
 * all: `jump_press_handler` returns while ON_ROPE_FLAGS is set
 * (dungeon-hero.ts:322). Slopes
 * (`slope_assist_on_landing`), crumbling platforms (`hero_collapse_platform`) and
 * ice (`set_zero_flag_if_slippery`) are separate graph families and are likewise
 * left to them. Jumps out of a current are suppressed by the graph (§7.4 of the
 * plan), because `check_airflows_on_hero` runs first and owns the hero.
 */

import { JUMP_HEIGHT_DEFAULT, JUMP_HEIGHT_FERUZA, NAV, blocksBody, blocksHead } from './types.js';
import { NavTileClassifier } from './attributes.js';
import { ROWS, wrapCol, wrapRow } from './geometry.js';
import type { NavTileGrid } from './mdt-grid.js';

/**
 * Which sideways descents a search may use, as a mask.
 *
 * A flight picks one at take-off and keeps it — see {@link JumpModel.descend} — so
 * every search runs three descents and these say which of them count.
 */
export const STEER_ALL = 0b111;
export const STEER_STRAIGHT = 0b001;
export const STEER_LEFT = 0b010;
export const STEER_RIGHT = 0b100;

/** The three descents, in the order they are searched. */
const STEER_ORDER = [0, -1, 1] as const;

/**
 * The rises a hop can have, shortest first.
 *
 * A jump rises, so these are the two the graph asks for. A fall does not: the hero
 * steps off something and drops, which is `landingsFrom(col, row, 0)` — a flight with
 * no rise at all. A rise of 0 is not a smaller jump, it is the other question the
 * engine can be asked, and a hop that came from that question cannot be found without
 * asking it again.
 *
 * Falls search 0 first because that is the flight they are, and the search hands back
 * the *first* flight that reaches the landing: the cheapest one should be found first.
 */
export const JUMP_RISE_HEIGHTS: readonly number[] = [JUMP_HEIGHT_DEFAULT, JUMP_HEIGHT_FERUZA];
export const FALL_RISE_HEIGHTS: readonly number[] = [0, JUMP_HEIGHT_DEFAULT, JUMP_HEIGHT_FERUZA];

/** Is this descent one of the ones `allow` permits? */
function steerAllowed(steer: number, allow: number): boolean {
    if (steer === 0) return (allow & STEER_STRAIGHT) !== 0;
    if (steer < 0) return (allow & STEER_LEFT) !== 0;
    return (allow & STEER_RIGHT) !== 0;
}

/** Ints per landing in the array {@link JumpModel.landingsFrom} hands back. */
export const LANDING_STRIDE = 5;

/** Ints per queued descent state: col, row, ticks, first-pose. */
const QUEUE_STRIDE = 4;

/** Ints per recorded rise end: col, row, rows risen, then the column at each rise. */
const START_STRIDE = 8;

/** Columns a chain can hold: one per row of rise, the most Feruza shoes give. */
const RISE_SLOTS = 5;

/** One decoded landing, for callers that would rather not index by hand. */
export interface JumpLanding {
    /** Hero left column. */
    readonly col: number;
    /** Hero head row. */
    readonly row: number;
    /** Frames from take-off to the landing check that ended the flight. */
    readonly ticks: number;
    /** Rows risen, which is what decides whether Feruza shoes are needed. */
    readonly rises: number;
    /** True when only Feruza shoes reach this landing. */
    readonly feruza: boolean;
}

/** Read landing `i` out of a `landingsFrom` result. */
export function readLanding(landings: Int32Array, i: number): JumpLanding {
    const o = i * LANDING_STRIDE;
    return {
        col: landings[o]!,
        row: landings[o + 1]!,
        ticks: landings[o + 2]!,
        rises: landings[o + 3]!,
        feruza: landings[o + 4] === 1,
    };
}

/**
 * One cavern's jump reachability.
 *
 * Built once per map and queried once per node, so everything it needs is
 * preallocated. The five masks below are the engine's predicates evaluated over the
 * whole map once each, because the descent asks them millions of times: a search
 * that re-derived them per state spent its time in modular arithmetic.
 */
export class JumpModel {
    private readonly mapWidth: number;
    private readonly cells: number;
    /** Classified flags over the whole map, `row * mapWidth + col`. */
    private readonly flag: Uint16Array;
    /** Cavern 7's currents do not push, so none of them blocks a step. */
    private readonly guardCurrents: boolean;
    /** Where a standing platform slot can be: the feet land there, nothing blocks. */
    private readonly platform: Uint8Array;
    /**
     * Where an up current holds him, so a flight through it ends there.
     *
     * `heroInLift`'s shape over the whole map, for the same reason `platform` is
     * handed in: the model cannot see currents on its own.
     */
    private readonly held: Uint8Array;
    /** 1 where the landing check would stop him, in the pose a descent has. */
    private readonly landsMoving: Uint8Array;
    /** 1 where it would stop him in the pose a rise leaves him in. */
    private readonly landsFirst: Uint8Array;
    /** 1 where a step to the right / left would not be blocked. */
    private readonly stepRight: Uint8Array;
    private readonly stepLeft: Uint8Array;
    /**
     * 1 where `left_default` / `right_default` would push a falling hero sideways.
     *
     * Once `airborne_movement` has spent the landing frame's `oldPhase === 0` call
     * to `on_left/right_pressed` it clears `UP_FLAG`, and every later frame of a
     * plain fall takes the branch that runs the slope helpers instead of the free
     * move. Those helpers only step when the cell under his middle foot is open
     * *and* the cell under the foot he is stepping onto is solid rock
     * (`dungeon-input.ts:312-331`) — a hero with nothing under him at all cannot
     * be steered, however open the air beside him is.
     *
     * Indexed by the head row the frame advanced to, `row * mapWidth + col`, where
     * `col` is his left column *before* the step.
     */
    private readonly driftRight: Uint8Array;
    private readonly driftLeft: Uint8Array;
    /**
     * 1 where a hero falling at this cell can still reach a landing.
     *
     * A fall that reaches no landing is a fall out of the world, so those states
     * are worthless. Without this the search walks a hero down the full height of
     * a cavern with nothing to land on, once per node.
     */
    private readonly canLand: Uint8Array;

    /** Descent worklist, {@link QUEUE_STRIDE} ints per state. */
    private readonly queue: Int32Array;
    /** Queue slot each state came from, for {@link flightPath}. */
    private readonly queueParent: Int32Array;
    /** Columns the hero can be at part-way through a rise, with their chains. */
    private readonly riseA = new Int32Array(16);
    private readonly riseB = new Int32Array(16);
    private readonly chainA = new Int32Array(16 * START_STRIDE);
    private readonly chainB = new Int32Array(16 * START_STRIDE);
    /** Where rises ended this query: {@link START_STRIDE} ints each. */
    private readonly starts: Int32Array = new Int32Array(192 * START_STRIDE);
    /** Landing {@link flightPath} is looking for, and where it was reached. */
    private wantCell = -1;
    private pathEnd = -1;
    private found = false;
    private path: Int32Array = new Int32Array(256);
    private pathCount = 0;

    /** Records for each jump height, in its own buffer, stamped per query. */
    private readonly record: RecordSet[] = [];
    /** The set the current {@link flight} is recording into. */
    private current!: RecordSet;
    /** Descent dedupe, keyed by cell and first-pose. */
    private readonly seen: Int32Array;
    private generation = 0;

    /** Merged landings for the current query. */
    private out: Int32Array = new Int32Array(1024);
    private outCount = 0;
    /** Cells a traced flight passed through, two ints each. */
    private trace: Int32Array = new Int32Array(512);
    private traceCount = 0;
    private readonly traceStamp: Int32Array;
    private traceGen = 0;
    private tracing = false;

    /**
     * @param platforms 1 where a standing platform slot can put the hero's feet, in
     *   the same `row * mapWidth + col` indexing as the tile grid. Optional, because
     *   a cavern with no platforms needs nothing.
     * @param resting 1 where a platform is standing right now, which is solid rock
     *   the hero cannot pass through. It cannot come from the tile grid, because a
     *   platform's position is engine memory rather than map data.
     */
    constructor(
        grid: NavTileGrid,
        classifier: NavTileClassifier,
        platforms?: Uint8Array,
        currents?: Uint8Array,
        resting?: Uint8Array,
    ) {
        this.mapWidth = grid.mapWidth;
        this.cells = grid.mapWidth * ROWS;
        this.flag = new Uint16Array(this.cells);
        for (let i = 0; i < this.cells; i++) {
            // A platform's resting cells are solid as far as geometry is concerned:
            // the hero stands on one and is stopped by one. `is_blocking_tile_simple`
            // is the predicate that stops at a platform tile, and BLOCK_BODY is it.
            this.flag[i] = classifier.classify(grid.tiles[i]!)
                | (resting?.[i] === 1 ? NAV.BLOCK_BODY : 0);
        }
        this.platform = platforms ?? new Uint8Array(this.cells);
        this.held = currents ?? new Uint8Array(this.cells);
        this.guardCurrents = classifier.cavernLevel() === 7;
        this.record.push({
            out: new Int32Array(320), count: 0, gen: 0,
            stamp: new Int32Array(this.cells), slot: new Int32Array(this.cells),
        }, {
            out: new Int32Array(320), count: 0, gen: 0,
            stamp: new Int32Array(this.cells), slot: new Int32Array(this.cells),
        });
        // Six slots per cell: first-pose or not, times one per locked steer.
        this.seen = new Int32Array(this.cells * 6);
        this.traceStamp = new Int32Array(this.cells);
        this.queue = new Int32Array(this.cells * 2 * QUEUE_STRIDE);
        this.queueParent = new Int32Array(this.cells * 2);

        this.landsMoving = new Uint8Array(this.cells);
        this.landsFirst = new Uint8Array(this.cells);
        this.stepRight = new Uint8Array(this.cells);
        this.stepLeft = new Uint8Array(this.cells);
        this.driftRight = new Uint8Array(this.cells);
        this.driftLeft = new Uint8Array(this.cells);
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < this.mapWidth; col++) {
                const cell = row * this.mapWidth + col;
                if (this.landsIn(col, row, false)) this.landsMoving[cell] = 1;
                if (this.landsIn(col, row, true)) this.landsFirst[cell] = 1;
                if (this.stepIn(col, row, 1)) this.stepRight[cell] = 1;
                if (this.stepIn(col, row, -1)) this.stepLeft[cell] = 1;
                // Both slope helpers read the cell under his middle foot first and
                // give up when it is solid, so the two masks share it.
                if (blocksHead(this.at(col + 1, row + 3))) continue;
                if (blocksHead(this.at(col + 2, row + 3))) this.driftRight[cell] = 1;
                if (blocksHead(this.at(col, row + 3))) this.driftLeft[cell] = 1;
            }
        }
        this.canLand = this.solveCanLand();
    }

    /** Flags of one cell, both axes wrapped. */
    private at(col: number, row: number): number {
        return this.flag[wrapRow(row) * this.mapWidth + wrapCol(col, this.mapWidth)]!;
    }

    /** Record a position the hero passes through, while tracing. */
    private noteCell(col: number, row: number, cell: number): void {
        if (!this.tracing) return;
        if (this.traceStamp[cell] === this.traceGen) return;
        this.traceStamp[cell] = this.traceGen;
        if ((this.traceCount + 1) * 2 > this.trace.length) {
            const grown = new Int32Array(this.trace.length * 2);
            grown.set(this.trace);
            this.trace = grown;
        }
        this.trace[this.traceCount * 2] = col;
        this.trace[this.traceCount * 2 + 1] = row;
        this.traceCount++;
    }

    /**
     * The rise's only test: is the cell above the middle of the hero's head open?
     *
     * `jump_press_handler` reads `heroTL - 35`, one row up and one column right of
     * his top-left cell, with `is_blocking_tile` — the head-row predicate.
     */
    private headroom(col: number, headRow: number): boolean {
        return !blocksHead(this.at(col + 1, headRow - 1));
    }

/**
     * `move_hero_right_if_no_obstacles` and its mirror. See geometry.ts.
     */
    private stepIn(col: number, headRow: number, dir: number): boolean {
        const w = this.mapWidth;
        const probe = wrapCol(dir > 0 ? col + 2 : col, w);
        const opposing = dir > 0 ? NAV.AIRFLOW_LEFT : NAV.AIRFLOW_RIGHT;
        const f = this.flag;
        let cell = wrapRow(headRow) * w + probe;
        if (blocksHead(f[cell]!)) return false;
        if (!this.guardCurrents && f[cell]! & opposing) return false;
        cell = cell < this.cells - w ? cell + w : cell - (ROWS - 1) * w;
        if (blocksBody(f[cell]!)) return false;
        if (!this.guardCurrents && f[cell]! & opposing) return false;
        cell = cell < this.cells - w ? cell + w : cell - (ROWS - 1) * w;
        if (blocksBody(f[cell]!)) return false;
        if (!this.guardCurrents && f[cell]! & opposing) return false;
        return true;
    }

    /**
     * `check_floor_for_landing`: does a hero here stop falling?
     *
     * @param firstPose true on the frame a rise hands over to the descent, when the
     *   hero's animation phase is 0 and his outer two feet are consulted too.
     */
    /**
     * Does a falling hero catch a rope on this frame?
     *
     * `airborne_movement` lands the frame first and only then probes for a rope, and
     * both probes read the *same* cell: the one under his middle foot, three rows
     * below his head (`dungeon-input.ts:509-546`). So a rope is caught exactly when
     * the landing check has already failed on that cell, and the hero ends the
     * frame **one row lower than where the check was**, hanging on it.
     *
     * That is what the player did at mp10: he stepped off the ledge at `(110,7)`,
     * and the frames after were `(111,8)` then `(111,9)` with `ON_ROPE_FLAGS` set —
     * the catch at `(112,11)`, three rows below the head at `(111,8)`. Nothing in the
     * graph could follow him: a flight ended on ground or on a platform, never on a
     * rope, so every rope in a cavern was unreachable from above. The recording is
     * `WORK/DOC/level1.txt`; the analysis is §23.3.
     */
    private catchesRope(col: number, headRow: number): boolean {
        return (this.at(col + 1, headRow + 3) & NAV.ROPE) !== 0;
    }

    private landsIn(col: number, headRow: number, firstPose: boolean): boolean {
        const w = this.mapWidth;
        const feet = wrapRow(headRow + 3) * w;
        const f = this.flag;
        if (this.platform[wrapCol(col + 1, w) + feet] === 1) return true;
        if (blocksBody(f[wrapCol(col + 1, w) + feet]!)) return true;
        if (!firstPose) return false;
        if (!blocksBody(f[wrapCol(col, w) + feet]!)) return false;
        return blocksBody(f[wrapCol(col + 2, w) + feet]!);
    }

    /** Would a step sideways from here be blocked? Both coordinates already wrapped. */
    private stepAt(col: number, row: number, dir: number): boolean {
        return (dir > 0 ? this.stepRight : this.stepLeft)[row * this.mapWidth + col] === 1;
    }

    /**
     * Where a falling hero can still get to ground.
     *
     * True at a cell where he lands outright, or where he can fall one row — with
     * or without a sideways step — to somewhere he can. A cell only depends on the
     * row below, so one descending pass settles everything except across the
     * wrap; the loop ends after the second.
     */
    private solveCanLand(): Uint8Array {
        const width = this.mapWidth;
        const reach = new Uint8Array(this.cells);
        let changed = true;
        while (changed) {
            changed = false;
            for (let row = ROWS - 1; row >= 0; row--) {
                const below = wrapRow(row + 1) * width;
                const here = row * width;
                for (let col = 0; col < width; col++) {
                    const cell = here + col;
                    if (reach[cell] === 1) continue;
                    if (this.landsMoving[cell] === 1) {
                        reach[cell] = 1;
                        changed = true;
                        continue;
                    }
                    // A rope under his middle foot ends the flight one row lower, so
                    // a cell above one is still worth visiting — without this the
                    // descent is never enqueued there and the catch never happens.
                    if (this.catchesRope(col, row)) {
                        reach[cell] = 1;
                        changed = true;
                        continue;
                    }
                    if (reach[below + col] === 1) {
                        reach[cell] = 1;
                        changed = true;
                        continue;
                    }
                    for (const dir of [1, -1]) {
                        if (reach[below + wrapCol(col + dir, width)] !== 1) continue;
                        if (!this.stepAt(wrapCol(col, width), wrapRow(row + 1), dir)) continue;
                        reach[cell] = 1;
                        changed = true;
                        break;
                    }
                }
            }
        }
        return reach;
    }

    /**
     * Every landing one jump from `(col, row)` can reach.
     *
     * Both jump heights run and merge. A plain jump needs nothing, so a landing
     * the plain jump also reaches is not repeated as a Feruza one: the cheap edge
     * already exists for every hero.
     *
     * `height = 0` asks the other question the engine can be asked, which is what
     * happens when the hero steps off something rather than jumping: no rise, then
     * the same fall, with the same steering. That is "fall down left, fall down
     * right" from a rope, and a straight `fallTo` cannot express it — the hero
     * chooses a column every row he is in the air.
     *
     * The result is a view on a buffer this model reuses — read it before asking
     * again.
     */
    landingsFrom(
        col: number,
        row: number,
        height: number = JUMP_HEIGHT_FERUZA,
        allow: number = STEER_ALL,
    ): Int32Array {
        const gen = ++this.generation;
        this.traceGen = gen;
        this.traceCount = 0;
        this.tracing = true;
        // Both heights share one dedupe set. A landing the plain jump reaches is
        // always the cheaper of the two — every landing below one rise's end costs
        // the same whatever path it takes, so fewer rows risen is fewer frames —
        // so there is nothing for the tall jump to add on ground the short one
        // already covers, and re-walking it would only cost time.
        this.flight(col, row, Math.min(height, JUMP_HEIGHT_DEFAULT), 0, gen, allow);
        const plain = this.record[0]!;
        if (height > JUMP_HEIGHT_DEFAULT) this.flight(col, row, height, 1, gen, allow);
        else this.record[1]!.count = 0;
        this.tracing = false;
        const high = this.record[1]!;

        this.outCount = 0;
        for (let i = 0; i < plain.count; i++) this.copyLanding(plain.out, i, false);
        for (let i = 0; i < high.count; i++) {
            const o = i * LANDING_STRIDE;
            const cell = wrapRow(high.out[o + 1]!) * this.mapWidth
                + wrapCol(high.out[o]!, this.mapWidth);
            // Reachable without the shoes already: the cheap edge stands.
            if (plain.stamp[cell] === gen && plain.slot[cell] !== 0) continue;
            this.copyLanding(high.out, i, true);
        }
        return this.out.subarray(0, this.outCount * LANDING_STRIDE);
    }

    /**
     * Every position the jump just asked about passed through, two ints each.
     *
     * What `check_airflows_on_hero` sees the hero in, frame by frame, for both jump
     * heights. The graph needs it to decide where a current can catch a jump: a jet
     * is entered by being swept, so the positions that matter are the ones he
     * actually occupies, not an arc sampled between two landings. It is the union
     * over every flight from that cell, which is why a hop that lands somewhere
     * wants {@link flightPath} instead.
     *
     * Valid until the next {@link landingsFrom} — it is the same search, so the
     * cells come for free and asking again separately would walk the flight twice.
     */
    lastTrace(): Int32Array {
        return this.trace.subarray(0, this.traceCount * 2);
    }

    /**
     * The cells one flight through, as col/row pairs.
     *
     * The descent only, from where the rise ended to the landing: the rise is the
     * one part of a jump the engine never tests the hero's body against, so it can
     * carry him through a ledge lip and there is nothing to check. The descent is
     * the part that travels, and this is the one path through it that ends at the
     * landing asked for — the trace is the union over every flight from the same
     * cell, which includes flights that go somewhere else entirely.
     *
     * Empty when no flight from `(col, row)` lands there. A view on a reused buffer.
     */
    flightPath(
        col: number,
        row: number,
        landingCol: number,
        landingRow: number,
        fromRope = false,
        allow: number = STEER_ALL,
        /**
         * The rises to search, shortest first. {@link JUMP_RISE_HEIGHTS} for a jump,
         * {@link FALL_RISE_HEIGHTS} for a fall — which is the question the graph asked
         * when it built the hop, and a flight found under one of those is not a flight
         * the other can take.
         */
        heights: readonly number[] = JUMP_RISE_HEIGHTS,
    ): Int32Array {
        const width = this.mapWidth;
        this.wantCell = wrapRow(landingRow) * width + wrapCol(landingCol, width);
        this.pathCount = 0;
        this.found = false;
        this.current = this.record[0]!;
        this.current.gen = ++this.generation;

        // Shortest rise first, for the same reason the landings search uses it: the
        // first flight that reaches the cell is the cheapest one.
        for (const height of heights) {
            for (const steer of STEER_ORDER) {
                if (!steerAllowed(steer, allow)) continue;
                // The rise is searched with the same intent as the descent, exactly as
                // `flight` does it, so the path handed back is one whole flight.
                const starts = this.collectStarts(col, row, height, steer);
                for (let i = 0; i < starts; i++) {
                    const o = i * START_STRIDE;
                    this.descend(this.starts[o]!, this.starts[o + 1]!, this.starts[o + 2]!, true, steer);
                    if (this.found) {
                        this.writePath(o);
                        return this.path.subarray(0, this.pathCount * 2);
                    }
                }
            }
        }
        return this.path.subarray(0, 0);
    }

    /**
     * Walk the parent chain back out of the queue and emit the cells.
     *
     * Every cell the flight occupies, rise and fall alike: the engine's tests mean
     * the hero can clip scenery on the way up as well as on the way down, so
     * neither is separable from the other.
     */
    private writePath(startOffset: number): void {
        const chain: number[] = [];
        let at = this.pathEnd;
        while (at >= 0) {
            const o = at * QUEUE_STRIDE;
            chain.push(this.queue[o]!, this.queue[o + 1]!);
            at = this.queueParent[o]!;
        }
        chain.push(this.starts[startOffset]!, this.starts[startOffset + 1]!);
        // Pair-wise: reversing the flat array would swap the columns and the rows.
        for (let i = 0, j = chain.length - 2; i < j; i += 2, j -= 2) {
            const c0 = chain[i]!;
            const r0 = chain[i + 1]!;
            chain[i] = chain[j]!;
            chain[i + 1] = chain[j + 1]!;
            chain[j] = c0;
            chain[j + 1] = r0;
        }
        const startRow = this.starts[startOffset + 1]!;
        this.pathCount = 0;
        // The rise, one cell per row the hero climbed, then the fall. Both are part
        // of the flight: leaving the rise out put a hole at the take-off of every
        // jump, and the line only looked continuous where he never left the ground.
        const rises = this.starts[startOffset + 2]!;
        for (let k = 0; k <= rises; k++) {
            this.pushPath(
                this.starts[startOffset + 3 + k]!,
                wrapRow(startRow + rises - k),
            );
        }
        for (let i = 0; i < chain.length; i += 2) {
            this.pushPath(chain[i]!, chain[i + 1]!);
        }
    }

    private pushPath(col: number, row: number): void {
        if ((this.pathCount + 1) * 2 > this.path.length) {
            const grown = new Int32Array(this.path.length * 2);
            grown.set(this.path);
            this.path = grown;
        }
        this.path[this.pathCount * 2] = col;
        this.path[this.pathCount * 2 + 1] = row;
        this.pathCount++;
    }

    private copyLanding(src: Int32Array, i: number, feruza: boolean): void {
        if ((this.outCount + 1) * LANDING_STRIDE > this.out.length) {
            const grown = new Int32Array(this.out.length * 2);
            grown.set(this.out);
            this.out = grown;
        }
        const dst = this.outCount * LANDING_STRIDE;
        const from = i * LANDING_STRIDE;
        this.out[dst] = src[from]!;
        this.out[dst + 1] = src[from + 1]!;
        this.out[dst + 2] = src[from + 2]!;
        this.out[dst + 3] = src[from + 3]!;
        this.out[dst + 4] = feruza ? 1 : 0;
        this.outCount++;
    }

    /**
     * One jump height's whole flight: the rise, then every descent it can end in.
     *
     * @param which 0 for a plain jump, 1 for Feruza; picks the record set.
     */
    private flight(col: number, row: number, height: number, which: 0 | 1, gen: number, allow: number): void {
        const width = this.mapWidth;
        const set = this.record[which]!;
        set.count = 0;
        set.gen = gen;
        this.current = set;
        // ── the flights ───────────────────────────────────────────────────────
        // One lateral intent per flight: the direction he holds from the instant he
        // presses jump until he lands. The rise drifts that way where it can, and
        // the descent continues the same way, so **a flight that went up to the
        // right can never come down to the left**.
        //
        // Searching the rise once with all three descents attached is what produced
        // that. The mp30 leg `(2,21) -> (184,47)` traced as
        // `(2,21) (3,20) (4,19) (5,19) (4,20) (3,21) ...` — two rows up and to the
        // right, then a twenty-two column descent to the left, which is not a flight
        // the hero can take. He presses one direction and gets one flight.
        for (const steer of STEER_ORDER) {
            if (!steerAllowed(steer, allow)) continue;
            const starts = this.collectStarts(col, row, height, steer);
            // Each rise's end is searched on its own, in the order the rise produced
            // them: shortest rise first. Every landing below one start costs the same
            // number of ticks whatever path it takes, so searching in that order is
            // what keeps a cell's recorded cost the best one available.
            for (let i = 0; i < starts; i++) {
                const o = i * START_STRIDE;
                const sCol = this.starts[o]!;
                const sRow = this.starts[o + 1]!;
                if (this.canLand[wrapRow(sRow) * width + wrapCol(sCol, width)] === 0) continue;
                this.descend(sCol, sRow, this.starts[o + 2]!, false, steer);
            }
        }
    }

    /**
     * Where the rise can end, one record per way it can end: col, row, rows
     * risen, then the column he was at for each of those rows.
     *
     * `front` holds the columns the hero can be at after `r` rises, so his head is
     * on `row - r`. Every frame either lifts him one row — if the cell above the
     * middle of his head is open — or ends the rise, and either way a sideways step
     * may follow it. The rise ends at the height cap (`r === height`) or at a
     * ceiling, and the descent begins from wherever he ended up.
     */
    private collectStarts(col: number, row: number, height: number, steer: number): number {
        const width = this.mapWidth;
        let front = this.riseA;
        let back = this.riseB;
        let frontChain = this.chainA;
        let backChain = this.chainB;
        let count = 1;
        front[0] = col;
        frontChain[3] = col;
        let starts = 0;

        for (let rises = 0; rises <= height; rises++) {
            const at = row - rises;
            const here = wrapRow(at);
            const capped = rises === height;
            let next = 0;
            for (let i = 0; i < count; i++) {
                const from = i * START_STRIDE;
                const c = wrapCol(front[i]!, width);
                this.noteCell(c, here, here * width + c);
                // A rise of no rows is no jump at all: with his head against a
                // ceiling the engine leaves the hero grounded (dungeon-hero.ts:357).
                const open = !capped && this.headroom(c, at);
                if (open) {
                    const up = wrapRow(at - 1);
                    next = this.pushRise(back, backChain, next, c, frontChain, from, rises + 1);
                    // Only the direction he is holding: the rise and the descent
                    // are one flight, not two independent choices.
                    if (steer !== 0 && this.stepAt(c, up, steer)) {
                        const nc = wrapCol(c + steer, width);
                        next = this.pushRise(back, backChain, next, nc, frontChain, from, rises + 1);
                        this.noteCell(nc, up, up * width + nc);
                    }
                    continue;
                }
                if (!capped && rises < 1) continue;
                // The rise stops on this frame — ceiling or height cap. He still
                // steps sideways, and the descent begins where he ends up.
                starts = this.pushStart(starts, c, at, rises, frontChain, from);
                if (steer !== 0 && this.stepAt(c, here, steer)) {
                    const nc = wrapCol(c + steer, width);
                    starts = this.pushStart(starts, nc, at, rises, frontChain, from);
                    this.noteCell(nc, here, here * width + nc);
                }
            }
            const swap = front;
            front = back;
            back = swap;
            const swapChain = frontChain;
            frontChain = backChain;
            backChain = swapChain;
            count = next;
        }
        return starts;
    }

    private pushStart(
        count: number,
        col: number,
        row: number,
        rises: number,
        chain: Int32Array,
        from: number,
    ): number {
        if ((count + 1) * START_STRIDE > this.starts.length) return count;
        const o = count * START_STRIDE;
        this.starts[o] = col;
        this.starts[o + 1] = row;
        this.starts[o + 2] = rises;
        for (let k = 0; k < RISE_SLOTS; k++) this.starts[o + 3 + k] = chain[from + 3 + k]!;
        return count + 1;
    }

    /**
     * Add a column to the rise frontier, keeping the chain of columns that reached
     * it — the rise is part of the flight and the drawn line has to show it.
     */
    private pushRise(
        list: Int32Array,
        chain: Int32Array,
        count: number,
        col: number,
        fromChain: Int32Array,
        from: number,
        riseIdx: number,
    ): number {
        for (let i = 0; i < count; i++) if (list[i] === col) return count;
        if (count >= list.length || (count + 1) * START_STRIDE > chain.length) return count;
        list[count] = col;
        for (let k = 0; k < START_STRIDE; k++) chain[count * START_STRIDE + k] = fromChain[from + k]!;
        chain[count * START_STRIDE + 3 + riseIdx] = col;
        return count + 1;
    }

    /**
     * Fall from one rise's end until the hero stops.
     *
     * The landing check runs before the row is added, so a state means "still
     * falling here": either the check ends the flight, or he drops a row and may
     * step sideways — unless nothing can be landed on from there, which is what
     * {@link canLand} rules out.
     *
     * No rope is involved: a hero holding one cannot jump at all, and the graph
     * gives rope nodes a step sideways instead (see nav-graph.ts).
     */
    private descend(
        col: number,
        headRow: number,
        rises: number,
        track: boolean,
        steer: number,
    ): void {
        const width = this.mapWidth;
        // Frames so far: one per rise, plus the frame on which the rise stopped.
        const ticks = rises + 1;
        let head = 0;
        let tail = 0;
        tail = this.enqueue(tail, col, headRow, ticks, true, -1);

        while (head < tail) {
            const o = head * QUEUE_STRIDE;
            head++;
            const c = this.queue[o]!;
            const r = this.queue[o + 1]!;
            const t = this.queue[o + 2]!;
            const firstPose = this.queue[o + 3] === 1;
            const cell = r * width + c;
            // One lane per locked steer, or the second descent would be thrown away
            // by marks the first left behind: they share a generation, so a
            // generation-scoped dedupe would let only one of the three run.
            const steerLane = steer > 0 ? 2 : steer < 0 ? 1 : 0;
            const seenKey = (cell * 2 + (firstPose ? 1 : 0)) * 3 + steerLane;
            if (this.seen[seenKey] === this.current.gen) continue;
            this.seen[seenKey] = this.current.gen;
            this.noteCell(c, r, cell);
            // An up current ends a flight before the landing check is ever reached.
            // `check_airflows_on_hero` runs at the top of the frame
            // (dungeon-frame-pre.ts:88-113) and, finding a jet in the hero's three
            // rows, sets `AIR_UP_TILE_FOUND` — which is what `airborne_movement`
            // returns on (dungeon-input.ts:515-517), so neither the landing check nor
            // the descent ever runs. The hero is simply taken.
            //
            // This is how mp81's row 6 corridor is entered at all: a hero standing at
            // (135,16) jumps, and the frame his head reaches (135,14) the current at
            // (136,14) grabs him and carries him to (135,6). Without it the flight
            // sails on past the current, finds no ground under its middle foot, and
            // lands back where it started — which is why (124,6) had no route at all.
            if (this.held[cell] === 1) {
                if (track && cell === this.wantCell) {
                    this.pathEnd = head - 1;
                    this.found = true;
                    return;
                }
                this.noteLanding(cell, c, r, t + 1, rises);
                continue;
            }
            if ((firstPose ? this.landsFirst : this.landsMoving)[cell] === 1) {
                if (track && cell === this.wantCell) {
                    this.pathEnd = head - 1;
                    this.found = true;
                    return;
                }
                this.noteLanding(cell, c, r, t + 1, rises);
                continue;
            }

            // No floor under his middle foot, and a rope in that same cell: he grabs
            // it. The row moved down before the probe, so he ends one row below
            // where the check ran, and the sideways step after it never happens.
            if (this.catchesRope(c, r)) {
                const nr = wrapRow(r + 1);
                const nc = wrapCol(c, width);
                const ncell = nr * width + nc;
                if (track && ncell === this.wantCell) {
                    this.pathEnd = head - 1;
                    this.found = true;
                    return;
                }
                this.noteLanding(ncell, nc, nr, t + 1, rises);
                continue;
            }

            // One sideways direction for the whole flight, decided at take-off,
            // and no switching back to straight afterwards.
            //
            // A jump goes up in the direction it was pressed, and from the apex it
            // comes down at 45 degrees **in that same direction** — up+right descends
            // right, up+left descends left. Holding a key, the hero moves that way or
            // is stopped by something: `on_left_pressed` calls `initOnGround` and
            // returns when the step is blocked (dungeon-vertical.ts:127-136). He does
            // not get to *choose* to drop straight down and then start drifting, so
            // straight is the fallback when the step is blocked and never an
            // alternative to it.
            //
            // Offering both on every frame is what let a flight slide down five rows
            // of open air and then turn: the mp30 trace for `(0,21) -> (184,47)` was
            // `(0,21) (1,20) (2,19) (3,19) (3,20) ... (3,24) (2,25) (1,26) ...`, a
            // twenty-three column diagonal that the hero cannot fly, and it was the
            // leg the player reported.
            const below = wrapRow(r + 1);
            const fallTo = below * width;
            // A plain fall gets one free sideways step: the frame it starts on is
            // `oldPhase === 0`, which calls `on_left/right_pressed` outright, and
            // that block clears `UP_FLAG` on the way out. Every later frame of the
            // fall runs `left_default`/`right_default` instead, so a step that needs
            // more than an open lane also needs floor under the foot he is moving
            // onto — see {@link driftRight}. A jump is left alone: it descends with
            // `UP_FLAG` still set from the ascent and keeps the free move.
            const steered = steer !== 0
                && this.stepAt(c, below, steer)
                && (rises !== 0 || firstPose || this.driftAt(c, below, steer));
            if (steered) {
                const nc = wrapCol(c + steer, width);
                if (this.canLand[fallTo + nc] === 1) tail = this.enqueue(tail, nc, below, t + 1, false, head - 1);
            } else if (this.canLand[fallTo + c] === 1) {
                tail = this.enqueue(tail, c, below, t + 1, false, head - 1);
            }
        }
    }

    /** Would a falling hero's slope helper permit the step? */
    private driftAt(col: number, row: number, dir: number): boolean {
        return (dir > 0 ? this.driftRight : this.driftLeft)[row * this.mapWidth + col] === 1;
    }

    private enqueue(
        tail: number,
        col: number,
        row: number,
        ticks: number,
        firstPose: boolean,
        parent: number,
    ): number {
        const o = tail * QUEUE_STRIDE;
        this.queue[o] = col;
        this.queue[o + 1] = row;
        this.queue[o + 2] = ticks;
        this.queue[o + 3] = firstPose ? 1 : 0;
        this.queueParent[o] = parent;
        return tail + 1;
    }

    /** Remember where a flight ends here, keeping the cheapest flight that does. */
    private noteLanding(
        cell: number,
        col: number,
        row: number,
        ticks: number,
        rises: number,
    ): void {
        const set = this.current;
        if (set.stamp[cell] !== set.gen) {
            set.stamp[cell] = set.gen;
            set.slot[cell] = 0;
        }
        const held = set.slot[cell]!;
        if (held !== 0 && set.out[held + 2]! <= ticks) return;
        if (held === 0) {
            if ((set.count + 1) * LANDING_STRIDE > set.out.length) return;
            const o = set.count * LANDING_STRIDE;
            set.out[o] = col;
            set.out[o + 1] = row;
            set.out[o + 2] = ticks;
            set.out[o + 3] = rises;
            set.slot[cell] = o;
            set.count++;
            return;
        }
        set.out[held] = col;
        set.out[held + 1] = row;
        set.out[held + 2] = ticks;
        set.out[held + 3] = rises;
    }
}

/** One jump height's landings, with a per-query stamp and slot per cell. */
interface RecordSet {
    /** Landings, {@link LANDING_STRIDE} ints each. */
    readonly out: Int32Array;
    count: number;
    /** Which query wrote this cell's record. */
    readonly stamp: Int32Array;
    /** Offset of this cell's record in `out`, or 0. */
    readonly slot: Int32Array;
    /** Query id currently being recorded. */
    gen: number;
}