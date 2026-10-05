/**
 * nav-recorder.test.ts — the live-play recorder against the graph.
 *
 * The recorder exists because a route the graph refuses is a claim about the game,
 * and the way to settle one is to watch the game do it. These tests are about the
 * part that has to be trustworthy for that to work: that it keeps the visit order,
 * that it keeps the input that produced each step, and — the whole point — that it
 * names a hop the graph does not have instead of quietly dropping it.
 *
 * The cavern here is a synthetic one built through the same `buildNavGraph` the
 * product uses, so a hop can be constructed that the graph really does refuse: a
 * bare floor with a wall between two ledges, and the hero teleported over it.
 */
import { describe, expect, it } from 'vitest';

import { memWrite8, memWrite16 } from '../src/core/ts-memory.js';
import { buildNavGraph, nodeAt, type NavGraph } from '../src/engine/nav/nav-graph.js';
import { NavRecorder, type NavRecorderGraphs } from '../src/engine/nav/recorder.js';
import type { NavTileGrid } from '../src/engine/nav/mdt-grid.js';
import { EDGE } from '../src/engine/nav/types.js';

const SOLID = 0x05;
const ROPE = 0x01;
const MAP_ID = 0;
const ROWS = 64;

/** mp10's width, so the graph builder accepts this grid for map 0. */
const WIDTH = 240;

/**
 * A cavern with a floor along row 32 — so a hero's head sits at row 29, his feet at
 * 31 and the middle foot finds the floor at 32 — and a hole in it at column 10, with
 * a rope in the hole. A hero standing at (4,29) and one at (16,29) are then two
 * ledges apart with nothing but a rope between them.
 */
function cavern(): NavTileGrid {
    const tiles = new Uint8Array(WIDTH * ROWS);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < WIDTH; c++) tiles[r * WIDTH + c] = 0x00;
    }
    for (let c = 0; c < WIDTH; c++) tiles[32 * WIDTH + c] = SOLID;
    tiles[32 * WIDTH + 10] = 0x00;                 // the hole
    for (let r = 28; r <= 31; r++) tiles[r * WIDTH + 10] = ROPE;   // and a rope in it
    return { tiles, mapWidth: WIDTH, mapId: MAP_ID };
}

function memory(): Uint8Array {
    const g = new Uint8Array(0x20000);
    memWrite16(g, 0xc002, WIDTH);       // map width
    memWrite8(g, 0xc4, MAP_ID);         // place map id
    return g;
}

/**
 * Put the hero's head at map column `col`, row `row`, pressing `dirs`.
 *
 * The engine reads the map column as window-left + hero_x + 4
 * (engine/dungeon-doors.ts:90-101), so the window is moved instead of the hero:
 * hero_x stays 0 here and the window carries the column.
 */
function place(g: Uint8Array, col: number, row: number, dirs: number): void {
    memWrite16(g, 0x80, col - 4);       // proximity window left column
    memWrite8(g, 0x83, 0);              // hero_x in the window
    memWrite8(g, 0x82, 0);              // viewport top row
    memWrite8(g, 0x84, row);            // head row in view
    memWrite8(g, 0xff17, dirs);
}

describe('NavRecorder', () => {
    function recorder(graph: NavGraph): { rec: NavRecorder; g: Uint8Array } {
        const g = memory();
        const graphs: NavRecorderGraphs = { get: (id) => (id === MAP_ID ? graph : null) };
        const rec = new NavRecorder({
            heroPosition: () => {
                const left = (g[0x80]! | (g[0x81]! << 8)) + g[0x83]! + 4;
                return {
                    mapId: g[0xc4]! & 0x7f,
                    col: ((left % WIDTH) + WIDTH) % WIDTH,
                    row: (g[0x82]! + g[0x84]!) & 0x3f,
                };
            },
            memory: () => g,
            store: () => graphs,
        });
        return { rec, g };
    }

    it('keeps nothing until it is started', () => {
        const graph = buildNavGraph(MAP_ID, cavern());
        const { rec, g } = recorder(graph);
        place(g, 4, 29, 8);
        rec.sample();
        rec.sample();
        expect(rec.running).toBe(false);
        expect(rec.cells).toEqual([]);
        expect(rec.report()).toContain('nothing recorded');
    });

    it('keeps the visit order and dedupes a standing hero', () => {
        const graph = buildNavGraph(MAP_ID, cavern());
        const { rec, g } = recorder(graph);
        rec.start();
        place(g, 4, 29, 8);
        rec.sample();
        rec.sample();
        rec.sample();
        expect(rec.cells).toEqual([{ mapId: MAP_ID, col: 4, row: 29 }]);
        place(g, 5, 29, 8);
        rec.sample();
        expect(rec.cells).toEqual([
            { mapId: MAP_ID, col: 4, row: 29 },
            { mapId: MAP_ID, col: 5, row: 29 },
        ]);
        rec.stop();
        place(g, 6, 29, 8);
        rec.sample();
        expect(rec.cells).toHaveLength(2);
    });

    it('records which way the hero was pressing at each cell', () => {
        const graph = buildNavGraph(MAP_ID, cavern());
        const { rec, g } = recorder(graph);
        rec.start();
        place(g, 4, 29, 8);      // right
        rec.sample();
        place(g, 4, 29, 4);      // left, still standing there
        rec.sample();
        memWrite8(g, 0xff17, 9);     // up + right
        rec.sample();
        place(g, 5, 29, 9);
        rec.sample();
        const text = rec.report();
        expect(text).toContain('right then left then up+right');
        expect(text).toContain('up+right');
    });

    it('names a hop the graph does not have', () => {
        // The point of the whole module. Rock between the two ledges, so the graph
        // has no edge across column 10 — and the hero walks it anyway.
        const graph = buildNavGraph(MAP_ID, cavern());
        expect(nodeAt(graph, 4, 29)).toBeGreaterThanOrEqual(0);
        expect(nodeAt(graph, 16, 29)).toBeGreaterThanOrEqual(0);
        const a = nodeAt(graph, 4, 29);
        const b = nodeAt(graph, 16, 29);
        const across = graph.edges
            .slice(graph.edgeOffsets[a]!, graph.edgeOffsets[a + 1]!)
            .filter((e) => e.to === b);
        expect(across, 'the synthetic cavern already connects the ledges').toEqual([]);

        const { rec, g } = recorder(graph);
        rec.start();
        place(g, 4, 29, 9);
        rec.sample();
        place(g, 16, 29, 9);
        rec.sample();
        const text = rec.report();
        expect(text).toContain('mp10(4,29) -> mp10(16,29)');
        expect(text).toContain('NO EDGE in the graph');
        expect(text).toContain('up+right');
        expect(text).toContain('hop(s) the graph does not have');
        void EDGE;
    });

    it('says which ability a hop the graph does have costs', () => {
        const graph = buildNavGraph(MAP_ID, cavern());
        const { rec, g } = recorder(graph);
        rec.start();
        place(g, 4, 29, 8);
        rec.sample();
        place(g, 5, 29, 8);
        rec.sample();
        const text = rec.report();
        expect(text).toContain('mp10(4,29) -> mp10(5,29)');
        expect(text).toContain('bare');
        expect(text).toContain('every hop between standing positions is in the graph');
    });

    it('calls a cell he flew over a flight, not a disagreement', () => {
        // Most of a recording is air. A cell with no node that the hero was
        // airborne in is expected — it has no node on purpose — and reporting it as
        // a missing node buries the one line that matters.
        const grid = cavern();
        const graph = buildNavGraph(MAP_ID, grid);
        const { rec, g } = recorder(graph);
        rec.start();
        place(g, 4, 29, 8);
        rec.sample();
        memWrite8(g, 0xff3d, 1);   // JUMP_PHASE_FLAGS: airborne
        place(g, 20, 25, 8);       // mid-air: no node, and must not have one
        rec.sample();
        memWrite8(g, 0xff3d, 0);
        place(g, 22, 29, 8);
        rec.sample();
        const text = rec.report();
        expect(nodeAt(graph, 20, 25)).toBe(-1);
        expect(text).toContain('in flight');
        expect(text).not.toContain('NO EDGE');
        expect(text).toContain('every hop between standing positions is in the graph');
    });

    it('says so when a cell the hero stood on is not a standing position', () => {
        // Flying over a cell the graph has no node for is normal in the game — the
        // hero passes through the air — so the report must distinguish that from a
        // missing edge rather than lumping them together.
        const grid = cavern();
        const graph = buildNavGraph(MAP_ID, grid);
        const { rec, g } = recorder(graph);
        rec.start();
        place(g, 4, 29, 8);
        rec.sample();
        place(g, 20, 25, 8);     // mid-air, no floor under him
        rec.sample();
        expect(nodeAt(graph, 20, 25)).toBe(-1);
        const text = rec.report();
        expect(text).toContain('is not a standing position');
    });

    it('notes a change of map rather than calling it a hop', () => {
        const graph = buildNavGraph(MAP_ID, cavern());
        const { rec, g } = recorder(graph);
        rec.start();
        place(g, 4, 29, 8);
        rec.sample();
        memWrite8(g, 0xc4, 2);       // walked through a door
        rec.sample();
        expect(rec.report()).toContain('CHANGED MAP');
    });

    it('prints the raw cells so a recording can be pasted back in', () => {
        const graph = buildNavGraph(MAP_ID, cavern());
        const { rec, g } = recorder(graph);
        rec.start();
        place(g, 4, 29, 8);
        rec.sample();
        place(g, 5, 29, 8);
        rec.sample();
        rec.clear();
        expect(rec.cells).toEqual([]);
        expect(rec.report()).toContain('nothing recorded');
    });
});