/**
 * recorder.ts — record a live playthrough and diff it against the graph.
 *
 * The player: *"It will be much more productive if you implement recorder mode so I
 * can live play and copy-paste from console log."*
 *
 * A route the graph refuses is a claim about the game, and the way to settle one is
 * to watch the game do it. This samples the hero every frame — position, the input
 * the engine actually acted on, and the handful of state bytes that decide what a
 * frame does — and `report()` prints it next to the graph's own answer.
 *
 * What the report is for is the disagreement. Every hop the player made is looked
 * up in the graph and printed with what the graph calls it, so the line
 *
 *     *** (12,20) -> (13,19): NOT IN THE GRAPH, hero did it bare with input "up+right"
 *
 * names the exact hop to fix instead of leaving a whole cavern to be re-derived.
 *
 * Sampling is one function call per rendered frame and returns immediately unless
 * recording is on, so the mode costs nothing when it is off.
 */
import { memRead8, memRead16 } from '../../core/ts-memory.js';
import {
    ADDR_HERO_HEAD_Y_VIEW, ADDR_HERO_X_VIEW, ADDR_PLACE_MAP_ID,
    ADDR_PROXIMITY_MAP_LEFT_COL, ADDR_VIEWPORT_TOP_ROW,
} from '../../core/memory.js';
import { ADDR_ACCESSORY } from './capabilities.js';
import { NAV_MAP_BY_ID } from '../../data/nav/nav-maps.js';
import { edgesOf, nodeAt, type NavGraph } from './nav-graph.js';
import { CAP, EDGE_NAMES } from './types.js';

// g_mem addresses, spelled as the engine spells them.
const ADDR_INPUT_ALT_SPACE = 0xff16;
const ADDR_INPUT_DIRS = 0xff17;
const ADDR_SLIDE_DIRECTION = 0x9f22;
const ADDR_AIR_UP_TILE_FOUND = 0x9f15;
const ADDR_ON_ROPE_FLAGS = 0xff39;
const ADDR_JUMP_PHASE_FLAGS = 0xff3d;
const ADDR_SLOPE_DIRECTION = 0xff42;

// `INPUT_DIRS` bits, zeliard.h (engine/dungeon-input.ts:48-51).
const KEY_UP = 1;
const KEY_DOWN = 2;
const KEY_LEFT = 4;
const KEY_RIGHT = 8;
const ALT_SPACE_SPACE = 0x01;
const ALT_SPACE_ALT = 0x02;

/** Capability bit -> the shoes or key that grant it, for the report to name. */
const CAP_NAMES: ReadonlyArray<readonly [number, string]> = [
    [CAP.JUMP_HIGH, 'feruza'],
    [CAP.SLOPE_STAND, 'silkarn'],
    [CAP.GROUND_SAFE, 'pirika'],
    [CAP.ICE_SAFE, 'ruzeria'],
    [CAP.HEAT_SAFE, 'asbestos'],
    [CAP.KEY, 'a key'],
    [CAP.LION_KEY, 'a lion key'],
];

/**
 * The slice of {@link NavGraphStore} the recorder needs, so a test can hand it a
 * graph built from a synthetic cavern instead of a decoded MDT.
 */
export interface NavRecorderGraphs {
    get(mapId: number): NavGraph | null;
}

/** Where the recorder gets its readings. Injected so the module stays testable. */
export interface NavRecorderSource {
    /** The hero's map cell, or null outside a cavern. */
    readonly heroPosition: () => { mapId: number; col: number; row: number } | null;
    /** The engine's memory image. */
    readonly memory: () => Uint8Array;
    /** The graphs to diff against. Built lazily — decoding a cavern is not free. */
    readonly store: () => NavRecorderGraphs;
}

/** One standing position the hero occupied, and what he did while there. */
interface NavSample {
    mapId: number;
    col: number;
    row: number;
    /** Frames spent here. */
    frames: number;
    /** Every distinct input state seen while here, in the order they first appeared. */
    readonly inputs: string[];
    /** `on_rope` / `airborne` / `sliding` / `on_air` seen while here. */
    readonly states: Set<string>;
    /**
     * True while every frame here had the hero airborne — a cell he only flew
     * through. Cleared the moment a frame is spent on the ground, so a cell he
     * stood on and then jumped from is still a standing position.
     */
    flewThrough: boolean;
    /** The accessory worn while here, when it was not none. */
    accessory: number;
}

function inputNames(g: Uint8Array): string {
    const dirs = memRead8(g, ADDR_INPUT_DIRS);
    const alt = memRead8(g, ADDR_INPUT_ALT_SPACE);
    const parts: string[] = [];
    if ((dirs & KEY_UP) !== 0) parts.push('up');
    if ((dirs & KEY_DOWN) !== 0) parts.push('down');
    if ((dirs & KEY_LEFT) !== 0) parts.push('left');
    if ((dirs & KEY_RIGHT) !== 0) parts.push('right');
    if ((alt & ALT_SPACE_SPACE) !== 0) parts.push('space');
    if ((alt & ALT_SPACE_ALT) !== 0) parts.push('alt');
    return parts.length ? parts.join('+') : '-';
}

function stateNames(g: Uint8Array): string[] {
    const out: string[] = [];
    if (memRead8(g, ADDR_ON_ROPE_FLAGS) !== 0) out.push('on_rope');
    if (memRead8(g, ADDR_JUMP_PHASE_FLAGS) !== 0) out.push('airborne');
    if (memRead8(g, ADDR_SLIDE_DIRECTION) !== 0) out.push('sliding');
    if (memRead8(g, ADDR_SLOPE_DIRECTION) !== 0) out.push('on_slope');
    if (memRead8(g, ADDR_AIR_UP_TILE_FOUND) !== 0) out.push('on_air');
    return out;
}

/**
 * The hero's map cell, read from memory the way `heroMapPosition` in main.ts reads
 * it: the engine's own expression, proximity left column plus the viewport offset
 * and head row plus the viewport top (engine/dungeon-doors.ts:90-101).
 *
 * Only used when the injected `heroPosition` declines to answer, so the recorder
 * still works if it is wired before the map screen's dependencies exist.
 */
function readHero(g: Uint8Array): { mapId: number; col: number; row: number } | null {
    const mapId = memRead8(g, ADDR_PLACE_MAP_ID) & 0x7f;
    const meta = NAV_MAP_BY_ID.get(mapId);
    if (!meta) return null;
    const width = meta.mapWidth;
    const left = memRead16(g, ADDR_PROXIMITY_MAP_LEFT_COL) + memRead8(g, ADDR_HERO_X_VIEW) + 4;
    return {
        mapId,
        col: ((left % width) + width) % width,
        row: (memRead8(g, ADDR_VIEWPORT_TOP_ROW) + memRead8(g, ADDR_HERO_HEAD_Y_VIEW)) & 0x3f,
    };
}

/**
 * Records a playthrough and prints it beside the graph's own reading of it.
 *
 * Installed on `window` by main.ts, so the player drives it from the console:
 * `navRecorder.start()`, play, then `navRecorder.report()` and paste the output.
 */
export class NavRecorder {
    private samples: NavSample[] = [];
    private recording = false;

    constructor(private readonly source: NavRecorderSource) { }

    /** True while frames are being kept. */
    get running(): boolean {
        return this.recording;
    }

    /** Begin (or resume) recording. Anything already recorded is kept. */
    start(): void {
        this.recording = true;
    }

    /** Stop recording. The samples stay until `clear()`. */
    stop(): void {
        this.recording = false;
    }

    /** Forget everything recorded so far. */
    clear(): void {
        this.samples = [];
    }

    /**
     * Take one reading. Called once per rendered frame; returns immediately unless
     * recording is on.
     */
    sample(): void {
        if (!this.recording) return;
        const g = this.source.memory();
        const at = this.source.heroPosition() ?? readHero(g);
        if (!at) return;
        const input = inputNames(g);
        const last = this.samples[this.samples.length - 1];
        if (last && last.mapId === at.mapId && last.col === at.col && last.row === at.row) {
            last.frames++;
            if (!last.inputs.includes(input)) last.inputs.push(input);
            for (const s of stateNames(g)) last.states.add(s);
            if (!last.states.has('airborne')) last.flewThrough = false;
            const accessory = memRead8(g, ADDR_ACCESSORY);
            if (accessory !== 0) last.accessory = accessory;
            return;
        }
        const states = new Set(stateNames(g));
        this.samples.push({
            mapId: at.mapId,
            col: at.col,
            row: at.row,
            frames: 1,
            inputs: [input],
            states,
            flewThrough: states.has('airborne'),
            accessory: memRead8(g, ADDR_ACCESSORY),
        });
    }

    /** The samples as plain data, for a test to assert on. */
    get cells(): ReadonlyArray<{ mapId: number; col: number; row: number }> {
        return this.samples.map((s) => ({ mapId: s.mapId, col: s.col, row: s.row }));
    }

    /**
     * The whole recording as text: the visit order, the input that produced each
     * step, and every hop beside what the graph calls it.
     */
    report(): string {
        if (this.samples.length === 0) {
            return 'navRecorder: nothing recorded. navRecorder.start(), play, then navRecorder.report().';
        }
        const store = this.source.store();
        const lines: string[] = [];
        const maps = [...new Set(this.samples.map((s) => s.mapId))];
        const total = this.samples.reduce((n, s) => n + s.frames, 0);
        const accessory = this.samples.find((s) => s.accessory !== 0)?.accessory;
        lines.push(`=== nav recording: ${this.samples.length} cells, ${total} frames, maps ${
            maps.map((id) => `${NAV_MAP_BY_ID.get(id)?.nameKey ?? id}`).join(', ')
        } ===`);
        lines.push(`hero's accessory: ${
            accessory === undefined ? 'none' : `0x${accessory.toString(16)}`
        }`);
        lines.push('');

        lines.push('-- where the hero stood, in order, and what he pressed --');
        for (const s of this.samples) {
            const state = s.states.size ? `  [${[...s.states].join(' ')}]` : '';
            const worn = s.accessory !== 0 ? `  (wearing 0x${s.accessory.toString(16)})` : '';
            lines.push(`  map ${String(s.mapId).padStart(2)}  (${String(s.col).padStart(3)},${
                String(s.row).padStart(2)})  x${String(s.frames).padStart(4)}f  ${
                s.inputs.join(' then ')}${state}${worn}`);
        }

        lines.push('');
        lines.push('-- every hop, beside what the graph calls it --');
        const graphs = new Map<number, NavGraph | null>();
        const graphOf = (mapId: number): NavGraph | null => {
            if (!graphs.has(mapId)) graphs.set(mapId, store.get(mapId) ?? null);
            return graphs.get(mapId) ?? null;
        };
        let mismatches = 0;
        for (let i = 1; i < this.samples.length; i++) {
            const from = this.samples[i - 1]!;
            const to = this.samples[i]!;
            const here = `${NAV_MAP_BY_ID.get(from.mapId)?.nameKey ?? from.mapId}(${from.col},${from.row})`;
            const there = `${NAV_MAP_BY_ID.get(to.mapId)?.nameKey ?? to.mapId}(${to.col},${to.row})`;
            const pressed = to.inputs.join(' then ');
            if (from.mapId !== to.mapId) {
                lines.push(`  ${here} -> ${there}  CHANGED MAP  (pressed ${pressed})`);
                continue;
            }
            const graph = graphOf(from.mapId);
            if (!graph) {
                lines.push(`  ${here} -> ${there}  no graph for map ${from.mapId}`);
                mismatches++;
                continue;
            }
            const a = nodeAt(graph, from.col, from.row);
            const b = nodeAt(graph, to.col, to.row);
            if (a < 0 || b < 0) {
                // A cell the hero flew through. Mid-jump and mid-fall air has no
                // node and must not have one, so this is expected rather than a
                // disagreement — and it is the great majority of a recording, since
                // a walk is mostly air. Only a cell he *stood* on is worth flagging.
                const which = a < 0 ? from : to;
                if (!which.flewThrough) {
                    lines.push(`  *** ${here} -> ${there}: ${
                        a < 0 ? `${here} is not a standing position` : `${there} is not a standing position`
                    } in the graph, and the hero stood there with "${pressed}"`);
                    mismatches++;
                } else {
                    lines.push(`      ${here} -> ${there}  over ${which === from ? here : there} in flight`);
                }
                continue;
            }
            const edges = edgesOf(graph, a).filter((e) => e.to === b);
            if (edges.length === 0) {
                lines.push(`  *** ${here} -> ${there}: NO EDGE in the graph; hero did it bare `
                    + `with "${pressed}"`);
                mismatches++;
                continue;
            }
            const parts = edges
                .map((e) => {
                    const need = CAP_NAMES.filter(([bit]) => (e.req & bit) !== 0)
                        .map(([, name]) => name);
                    return `${EDGE_NAMES[e.kind]}${need.length ? ` needs ${need.join('+')}` : ' bare'}`;
                })
                .sort();
            lines.push(`  ${here} -> ${there}  ${parts.join(' | ')}  (pressed ${pressed})`);
        }

        lines.push('');
        lines.push(mismatches === 0
            ? '-- every hop between standing positions is in the graph --'
            : `-- ${mismatches} hop(s) the graph does not have; each *** line above is a bug in the graph --`);
        lines.push('');
        lines.push('raw cells: ' + this.samples
            .map((s) => `${s.mapId}:${s.col},${s.row}`)
            .join(' '));
        return lines.join('\n');
    }
}