import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEG1_BASE } from '../src/wasm/memory.js';
import { ShadowHarness } from '../src/wasm/parity/shadow.js';
import { regionAbsoluteStart } from '../src/wasm/inventory.js';

/** Synthetic g_mem big enough for seg1 regions used here. */
function makeGmem(): Uint8Array {
    return new Uint8Array(SEG1_BASE + 0x10000);
}

const VOID_NAME = 'wasm_town_full_tick';
const COUNTED_NAME = 'wasm_dungeon_get_viewport_top';
const TOWN_UPDATE = 'wasm_town_update';

let consoleErrors: string[] = [];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    consoleErrors = [];
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        consoleErrors.push(args.join(' '));
    });
});

afterEach(() => {
    consoleErrorSpy.mockRestore();
});

describe('ShadowHarness', () => {
    it('records no divergence when both sides agree', () => {
        const gmem = makeGmem();
        const harness = new ShadowHarness(() => gmem);
        // Both implementations bump the same latch byte identically.
        const bump = (): void => {
            gmem[0xff17] = (gmem[0xff17]! + 1) & 0xff;
        };
        const wrapped = harness.wrap(VOID_NAME, bump, bump, { regions: ['input-latches'] });

        wrapped();
        wrapped();

        expect(harness.statsFor(VOID_NAME).calls).toBe(2);
        expect(harness.isClean()).toBe(true);
        expect(harness.totals().divergences).toBe(0);
        expect(consoleErrors).toEqual([]);
    });

    it('detects byte mismatches with region-relative offsets', () => {
        const gmem = makeGmem();
        const harness = new ShadowHarness(() => gmem);
        const wrapped = harness.wrap(
            VOID_NAME,
            () => {
                gmem[0xff16] = 0x01;
                gmem[0xff18] = 0xaa;
            },
            () => {
                gmem[0xff16] = 0x01;
                gmem[0xff18] = 0xbb; // differs
            },
            { regions: ['input-latches'] },
        );

        wrapped();

        const stats = harness.statsFor(VOID_NAME);
        expect(stats.divergences).toHaveLength(1);
        const div = stats.divergences[0]!;
        expect(div.kind).toBe('memory');
        expect(div.diffs).toEqual([{ region: 'input-latches', offset: 2, wasm: 0xaa, ts: 0xbb }]);
        expect(div.wasmDump).toMatch(/01 00 aa/);
        expect(div.tsDump).toMatch(/01 00 bb/);
        expect(consoleErrors.length).toBeGreaterThan(0);
    });

    it('detects return-value mismatches via Object.is by default', () => {
        const gmem = makeGmem();
        const harness = new ShadowHarness(() => gmem);
        const wrapped = harness.wrap(
            COUNTED_NAME,
            () => 5,
            () => 6,
            { regions: [] },
        );

        expect(wrapped()).toBe(5); // game still sees the wasm result

        const div = harness.statsFor(COUNTED_NAME).divergences[0]!;
        expect(div.kind).toBe('return');
        expect(div.wasmReturn).toBe(5);
        expect(div.tsReturn).toBe(6);
    });

    it('honors a custom return comparator', () => {
        const gmem = makeGmem();
        const harness = new ShadowHarness(() => gmem);
        const compareReturn = vi.fn(<R>(a: R, b: R) => Math.abs(Number(a) - Number(b)) <= 2);
        const wrapped = harness.wrap(
            COUNTED_NAME,
            () => 10,
            () => 11,
            { regions: [], compareReturn },
        );

        wrapped();

        expect(compareReturn).toHaveBeenCalledWith(10, 11);
        expect(harness.isClean()).toBe(true);
    });

    it('restores pre-state so the TS side sees what wasm saw', () => {
        const gmem = makeGmem();
        gmem[0xff17] = 0x42;
        const harness = new ShadowHarness(() => gmem);
        let seenByTs: number[] = [];
        const wrapped = harness.wrap(
            VOID_NAME,
            () => {
                gmem[0xff17] = 0xff; // wasm scribbles
                gmem[0xff18] = 0x77;
            },
            () => {
                seenByTs = [gmem[0xff17]!, gmem[0xff18]!];
            },
            { regions: ['input-latches'] },
        );

        wrapped();

        // TS observed the pristine pre-state, not wasm's writes.
        expect(seenByTs).toEqual([0x42, 0x00]);
        // And after the dual run the memory holds the TS side's output —
        // which here equals "untouched", i.e. restored then left alone.
        expect(gmem[0xff17]).toBe(0x42);
    });

    it('maps seg1 regions through SEG1_BASE', () => {
        const gmem = makeGmem();
        const listAbs = SEG1_BASE + 0x9000; // special-tile-list absolute start
        const harness = new ShadowHarness(() => gmem);
        const wrapped = harness.wrap(
            VOID_NAME,
            () => {
                gmem[listAbs] = 3;
                gmem[listAbs + 1] = 0x10;
            },
            () => {
                gmem[listAbs] = 3;
                gmem[listAbs + 1] = 0x20; // differs at region offset 1
            },
            { regions: ['special-tile-list'] },
        );

        wrapped();

        const div = harness.statsFor(VOID_NAME).divergences[0]!;
        expect(regionAbsoluteStart({ name: 'x', start: 0x9000, end: 0x9040, segment: 1, owner: 'dungeon', description: '', portStage: 8 })).toBe(listAbs);
        expect(div.kind).toBe('memory');
        expect(div.diffs).toEqual([
            { region: 'special-tile-list', offset: 1, wasm: 0x10, ts: 0x20 },
        ]);
    });

    it('caps recorded diffs per divergence', () => {
        const gmem = makeGmem();
        const harness = new ShadowHarness(() => gmem);
        const wrappedWide = harness.wrap(
            TOWN_UPDATE,
            () => {
                for (let i = 0; i < 40; i++) gmem[0xff1a + i] = i & 0xff;
            },
            () => {
                for (let i = 0; i < 40; i++) gmem[0xff1a + i] = (i & 0xff) ^ 0xff;
            },
            { regions: ['dungeon-runtime-flags'], maxDiffs: 4 },
        );

        wrappedWide();

        const div = harness.statsFor(TOWN_UPDATE).divergences[0]!;
        expect(div.diffs).toHaveLength(4);
        expect(div.kind).toBe('memory');
    });

    it('runs wasm passthrough when there is no memory view', () => {
        const harness = new ShadowHarness(() => null);
        const wasmSide = vi.fn(() => 9);
        const tsSide = vi.fn();
        const wrapped = harness.wrap(COUNTED_NAME, wasmSide, tsSide, { regions: ['input-latches'] });

        expect(wrapped()).toBe(9);
        expect(wasmSide).toHaveBeenCalledTimes(1);
        expect(tsSide).not.toHaveBeenCalled();
        expect(harness.statsFor(COUNTED_NAME).calls).toBe(0);
        expect(harness.isClean()).toBe(true);
    });

    it('reset clears all stats', () => {
        const gmem = makeGmem();
        const harness = new ShadowHarness(() => gmem);
        const wrapped = harness.wrap(COUNTED_NAME, () => 1, () => 2, { regions: [] });
        wrapped();

        harness.reset();

        expect(harness.totals()).toEqual({ calls: 0, divergences: 0 });
        expect(harness.statsFor(COUNTED_NAME)).toEqual({ calls: 0, divergences: [] });
    });
});
