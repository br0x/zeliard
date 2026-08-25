import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugSetDungeonStatics,
    debugSetSkipRokaRun,
    getWasmMemory,
    initWasmFromBytes,
    setDoorX1,
} from '../src/wasm/bridge.js';
import {
    finishRokademoTransition,
    heroLeft16Down1,
    processMdtDescriptor,
    removeAccomplishedItems,
    wasmDungeonInit,
} from '../src/engine/dungeon-init.js';
import { bindProcessHeroDeath } from '../src/engine/dungeon-state-machine.js';
import { processHeroDeath } from '../src/engine/dungeon-frame.js';
import { applyBase, bindView, rng } from './vertical-scenario.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

let view: Uint8Array;
type WasmFn = (...args: never[]) => unknown;
/** The raw wasm export surface (union-typed; narrowed per call site). */
let exports: Record<string, WasmFn>;

beforeAll(() => {
    const instance = initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    exports = instance.exports as unknown as Record<string, WasmFn>;
    view = getWasmMemory()!;
    bindView(view);
    // Bind the Cavern_Game_Init loc_6266 death hook so the TS side runs the
    // same code the wasm oracle does when DEATH_ALREADY_PROCESSED is set.
    bindProcessHeroDeath(processHeroDeath);
});

function firstDiff(a: Uint8Array, b: Uint8Array): number {
    for (let i = 0; i < a.length; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return i;
    }
    return -1;
}

// ─── scenario builder ─────────────────────────────────────────────────────────

// Achievement-table scratch. All g_mem pointer words are uint16 seg0 values,
// so the table must live below 0x10000. The proximity window (0xE000+) is
// untouched by prepare_dungeon's memset/reset/clear steps and
// remove_accomplished_items runs BEFORE unpackMap overwrites the window.
const ACH_TBL = 0xe700;
const ACH_FLAG_ADDR = 0xe760; // flag byte probed by remove_accomplished_items
const ACH_REWRITE_ADDR = 0xe780; // word target of inner-list rewrites

type AchMode = 'empty' | 'matched-empty' | 'matched-rewrite' | 'unmatched-rewrite';

interface InitOpts {
    seed: number;
    isFromTown: boolean;
    bossCavern?: boolean;
    jashiinRoom1?: boolean;
    skipRokaRun?: boolean;
    savedDoorX1: number;
    placeMapId: number;
    achMode?: AchMode;
}

/**
 * Deterministic dungeon-init scenario. Everything the init family reads is
 * seeded here; both passes re-seed identically so any divergence is a port
 * bug, not leftover state.
 */
function applyInitScenario(opts: InitOpts): void {
    const rand = rng(opts.seed);
    applyBase(rand);

    // Extend the solid 0x55 packed stream well past applyBase's 0xC400 end:
    // unpack_map's column-skip walk (`do..while (dh < 64)`) loops forever on
    // a 0x80 byte (zero-count segment), and a wide PROXIMITY_MAP_LEFT_COL
    // (saved_door_x1 < 16 wrap cases) makes it consume up to ~4.4 kB before
    // the prox window even starts. 0x55 decodes as count=3 segments, so any
    // alignment is safe as long as the walk stays inside the stream.
    // Largest possible skip: left_col < map_width ≤ 199 → 199×22B ≈ 4378B,
    // ending below 0xD12F; the 36-column unpack adds ≤ 800B more.
    view.fill(0x55, 0xc400, 0xd600);

    // MDT descriptor pointer → 0xC040 inside the MDT window
    view[0xc000] = 0x40;
    view[0xc001] = 0xc0;
    let desc0 = rand() % 256;
    desc0 = opts.bossCavern ? (desc0 | 0x80) : (desc0 & ~0x80);
    desc0 = opts.jashiinRoom1 ? (desc0 | 0x40) : (desc0 & ~0x40);
    view[0xc040] = desc0;
    // Desc filler MUST decode as benign RLE segments: these bytes sit inside
    // the packed map, and unpack's step loops never terminate on a zero-count
    // segment (0x80 | n) — random filler hung whole sweeps. 0x55 = count 3.
    for (let i = 1; i < 27; i++) view[0xc040 + i] = 0x55;

    // loc_6266 death check off (covered by a directed case below)
    view[0x49] = 0;
    // BYTE_9F27 branch off (prepare_dungeon's memset also zeroes it)
    view[0x9f27] = 0;
    // MSD_INDEX is read by process_mdt_descriptor — seed it so the second
    // (TS) pass doesn't inherit the first (wasm) pass's write.
    view[0xc8] = rand() % 16;

    // place_map_id (target of this entry)
    view[0xc4] = opts.placeMapId;

    // transition outputs: seed deterministically so a missing write on one
    // side shows up as a diff instead of inheriting the other pass's result
    view[0xffe2] = 0; // EXIT flag
    view[0xfffc] = 0; // PENDING_DUNGEON_MAP
    view[0xfffd] = 0; // PENDING_DUNGEON_FLAG
    view[0xff90] = rand() % 11; // DUNGEON_STATE
    view[0x9f0a] = rand() % 256; // FRAME_TIMER

    // Monsters scratch table ABOVE the viewport buffer (0xE900..0xEB14):
    // Cavern_Game_Init clears that band before update_all_monsters_in_map
    // walks the list, so a live table inside it loses its 0xFFFF terminator.
    // With the uniform packed stream, column overshoot stays ≤2 rows past the
    // window (< 0xE950), so 0xEB20 is safe; magia sprites start at 0xEB60.
    const MTL = 0xeb20;
    view[0xc010] = MTL & 0xff;
    view[0xc011] = MTL >> 8;
    let mi = MTL;
    for (let k = 0; k < 3; k++) {
        const mx = rand() % 200;
        view[mi] = mx & 0xff;
        view[mi + 1] = (mx >> 8) & 0xff;
        view[mi + 2] = rand() % 64; // currY
        view[mi + 3] = 0; // m_x_rel (recomputed)
        mi += 16;
    }
    view[mi] = 0xff;
    view[mi + 1] = 0xff;

    // achievements table per mode (walked only when place_map_id bit7 == 0)
    const mask = rand() % 256 || 0x20;
    view[ACH_FLAG_ADDR] = mask;
    let p = ACH_TBL;
    const matched =
        opts.achMode === 'matched-empty' || opts.achMode === 'matched-rewrite';
    const rewrite = opts.achMode === 'matched-rewrite' || opts.achMode === 'unmatched-rewrite';
    view[p++] = ACH_FLAG_ADDR & 0xff;
    view[p++] = ACH_FLAG_ADDR >> 8;
    view[p++] = matched ? mask : 0x01; // probe bit 0; flag byte has bit 0 clear
    if (!matched) view[ACH_FLAG_ADDR] = mask & ~1; // guarantee the probe fails
    if (rewrite) {
        // one inner rewrite entry + terminator (both loops must terminate)
        view[p++] = ACH_REWRITE_ADDR & 0xff;
        view[p++] = ACH_REWRITE_ADDR >> 8;
        view[p++] = 0x34;
        view[p++] = 0x12;
    }
    view[p++] = 0xff;
    view[p++] = 0xff;
    view[p++] = 0xff; // table terminator (word)
    view[p++] = 0xff;

    // deterministic rewrite-target pre-state so both passes start equal
    view[ACH_REWRITE_ADDR] = 0xcd;
    view[ACH_REWRITE_ADDR + 1] = 0xab;
}

/** Pins for the C statics before invoking the wasm oracle. */
function pinWasmStatics(opts: InitOpts): void {
    setDoorX1(opts.savedDoorX1);
    debugSetDungeonStatics(opts.isFromTown ? 1 : 0, 10);
    debugSetSkipRokaRun(opts.skipRokaRun ? 1 : 0);
}

/** Fresh TS statics matching the pins. */
function tsStatics(opts: InitOpts): Parameters<typeof wasmDungeonInit>[3] {
    return {
        isFromTown: false, // prepare_dungeon rewrites it on both sides
        savedYViewInit: 10,
        savedDoorX1: opts.savedDoorX1,
        skipRokaRun: opts.skipRokaRun ?? false,
    };
}

// ─── wasm_dungeon_init parity ─────────────────────────────────────────────────

describe('stage 8d slice-10 redo: wasm_dungeon_init parity vs real wasm', () => {
    const cases: InitOpts[] = [];
    // town→regular cavern entries, saved_door_x1 sweep incl. the x<16 wrap case
    for (let seed = 1; seed <= 30; seed++) {
        cases.push({
            seed,
            isFromTown: true,
            savedDoorX1: seed <= 5 ? seed - 1 : (seed * 37) % 200,
            placeMapId: 1 + (seed % 20),
            achMode: seed % 4 === 0 ? 'empty'
                : seed % 4 === 1 ? 'matched-empty'
                : seed % 4 === 2 ? 'matched-rewrite' : 'unmatched-rewrite',
        });
    }
    // town→boss cavern (finalize directly, no roka run)
    for (let seed = 31; seed <= 45; seed++) {
        cases.push({
            seed,
            isFromTown: true,
            bossCavern: true,
            savedDoorX1: (seed * 53) % 300,
            placeMapId: 1 + (seed % 28),
            achMode: seed % 2 === 0 ? 'matched-empty' : 'empty',
        });
    }
    // cavern→cavern doors: skip-roka-run latch pinned and unpinned
    for (let seed = 46; seed <= 75; seed++) {
        cases.push({
            seed,
            isFromTown: false,
            skipRokaRun: seed % 2 === 0,
            bossCavern: seed % 5 === 0,
            savedDoorX1: (seed * 29) % 250,
            placeMapId: 1 + (seed % 20),
            achMode: seed % 3 === 0 ? 'unmatched-rewrite' : 'empty',
        });
    }
    // Jashiin room 1 cutscene entry
    for (let seed = 76; seed <= 80; seed++) {
        cases.push({
            seed,
            isFromTown: seed % 2 === 0,
            jashiinRoom1: true,
            savedDoorX1: seed * 7,
            placeMapId: 29,
            achMode: 'empty',
        });
    }

    it.each(cases.map((c) => [c.seed, c] as const))(
        'scenario seed %i matches wasm byte-for-byte',
        (_seed, opts) => {
            // wasm oracle pass
            applyInitScenario(opts);
            pinWasmStatics(opts);
            (exports.wasm_dungeon_init as (m: number, t: number) => void)(opts.placeMapId & 0x7f, opts.isFromTown ? 1 : 0);
            const wMem = view.slice();

            // TS pass from an identical re-seed
            applyInitScenario(opts);
            wasmDungeonInit(view, opts.placeMapId & 0x7f, opts.isFromTown, tsStatics(opts));

            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `init seed ${opts.seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]} (opts ${JSON.stringify(opts)})`,
                );
            }
            expect(d).toBe(-1);
        },
    );

    it('mutation guard: dropping the left-column recompute diverges', () => {
        // sanity that the comparison actually observes PROXIMITY_MAP_LEFT_COL:
        // run two different savedDoorX1 values (<16 wrap path) and assert the
        // resulting left column differs — proves the field is exercised.
        const leftColAfter = (opts: InitOpts): number => {
            applyInitScenario(opts);
            pinWasmStatics(opts);
            (exports.wasm_dungeon_init as (m: number, t: number) => void)(3, 1);
            return view[0x80]! | (view[0x81]! << 8);
        };
        applyInitScenario({ seed: 99, isFromTown: true, savedDoorX1: 0, placeMapId: 3 });
        const mapWidth = view[0xc002]! | (view[0xc003]! << 8);
        const a = leftColAfter({ seed: 99, isFromTown: true, savedDoorX1: 0, placeMapId: 3 });
        const b = leftColAfter({
            seed: 99,
            isFromTown: true,
            savedDoorX1: (mapWidth - 5) & 0xffff,
            placeMapId: 3,
        });
        expect(b).toBe((mapWidth - 5 - 16) & 0xffff);
        expect(a).not.toBe(b);
    });
});

// ─── wasm_finish_rokademo_transition parity ───────────────────────────────────

describe('stage 8d slice-10 redo: finish_rokademo_transition parity vs real wasm', () => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8])('rokademo finish seed %i matches wasm', (seed) => {
        const opts: InitOpts = {
            seed: 1000 + seed,
            isFromTown: false,
            bossCavern: seed % 3 === 0,
            savedDoorX1: seed * 11,
            placeMapId: seed % 2 === 0 ? 5 : 0x80 | 2, // alternate dungeon/town target
            achMode: 'matched-empty',
        };
        const staticsForTs = (): Parameters<typeof finishRokademoTransition>[1] => ({
            isFromTown: false,
            savedYViewInit: 7,
            savedDoorX1: opts.savedDoorX1,
            skipRokaRun: false,
        });

        // wasm pass (statics pinned via the debug setters)
        applyInitScenario(opts);
        debugSetDungeonStatics(0, 7);
        debugSetSkipRokaRun(0);
        (exports.wasm_finish_rokademo_transition as () => void)();
        const wMem = view.slice();
        const wState = view[0xff90];

        // TS pass
        applyInitScenario(opts);
        const tsStaticsObj = staticsForTs();
        finishRokademoTransition(view, tsStaticsObj);

        expect(view[0xff90]).toBe(wState);
        const d = firstDiff(wMem, view.slice());
        if (d >= 0) {
            throw new Error(
                `rokademo-finish seed ${opts.seed}: g_mem differs at 0x${d.toString(16)} ` +
                `wasm=${wMem[d]} ts=${view[d]}`,
            );
        }
        // behavioral latch check: a dungeon target must arm the skip latch so
        // the following prepare_dungeon finalizes directly (dungeon.c:1883).
        if ((opts.placeMapId & 0x80) === 0 && wState !== undefined &&
            (wState < 2 || wState > 4)) {
            expect(tsStaticsObj.skipRokaRun).toBe(true);
        }
    });

    it('death-path early return: DEATH_ALREADY_PROCESSED routes through process_hero_death identically', () => {
        const opts: InitOpts = {
            seed: 2001,
            isFromTown: false,
            bossCavern: false,
            savedDoorX1: 42,
            placeMapId: 6,
            achMode: 'empty',
        };
        // wasm pass — loc_6266 sees the flag and calls process_hero_death,
        // putting Cavern_Game_Init into DUNGEON_STATE_DEATH_FALL; the finish
        // transition then returns early without arming the pending flags.
        applyInitScenario(opts);
        view[0x49] = 0xff;
        view[0xfffc] = 0;
        view[0xfffd] = 0;
        debugSetDungeonStatics(0, 7);
        debugSetSkipRokaRun(0);
        (exports.wasm_finish_rokademo_transition as () => void)();
        const wMem = view.slice();
        expect(view[0xff90]).toBe(2 /* DEATH_FALL */);
        expect(view[0xfffc] /* PENDING_DUNGEON_MAP */).not.toBe(6);

        // TS pass
        applyInitScenario(opts);
        view[0x49] = 0xff;
        finishRokademoTransition(view, {
            isFromTown: false,
            savedYViewInit: 7,
            savedDoorX1: opts.savedDoorX1,
            skipRokaRun: false,
        });

        expect(view[0xff90]).toBe(2);
        const d = firstDiff(wMem, view.slice());
        if (d >= 0) {
            throw new Error(
                `death-path: g_mem differs at 0x${d.toString(16)} ` +
                `wasm=${wMem[d]} ts=${view[d]}`,
            );
        }
    });
});

// ─── directed helper tests ────────────────────────────────────────────────────

describe('init-family helpers', () => {
    it('heroLeft16Down1 recomputes left column and viewport top row', () => {
        view.fill(0, 0, 0x100);
        view[0x80] = 0; view[0x81] = 0; // overwritten below
        view[0x9f1a] = 5; view[0x9f1b] = 0; // hero x < 16
        view[0xc002] = 100; view[0xc003] = 0; // map width
        view[0x9f1c] = 14; // door target y
        view[0xc016] = 12; // HERO_Y_VIEW_INIT
        view[0x82] = 0;
        heroLeft16Down1(view);
        expect(view[0x80]! | (view[0x81]! << 8)).toBe(89); // 5+100-16
        expect(view[0x82]).toBe((14 + 1 - 12) & 0x3f); // 3

        view[0x9f1a] = 60; view[0x9f1b] = 0; // hero x ≥ 16
        heroLeft16Down1(view);
        expect(view[0x80]! | (view[0x81]! << 8)).toBe(44); // 60-16
    });

    it('processMdtDescriptor copies 4 bytes and remaps the msd index', () => {
        view.fill(0, 0xc8, 0xd0);
        view[0xc8] = 3; // MSD_INDEX
        view.fill(0, 0x9ef6, 0x9f00);
        view[0xff24] = 0;
        view[0x9efa] = 0;
        view[0x9efb] = 0;
        view[0xc041] = 10; view[0xc042] = 11; view[0xc043] = 12; view[0xc044] = 13;
        processMdtDescriptor(view, (3 << 1) | 1, 0xc041); // idx 3 == current
        expect([view[0x9ef6], view[0x9ef7], view[0x9ef8], view[0x9ef9]]).toEqual([10, 11, 12, 13]);
        expect(view[0xc8]).toBe(3); // unchanged
        expect(view[0x9efa]).toBe(0xff); // idx forced to 0xff
        expect(view[0x9efb]).toBe(0xff);
        expect(view[0xff24]).toBe(0); // no reload request

        processMdtDescriptor(view, (5 << 1) | 0, 0xc041); // idx 5 != current
        expect(view[0xc8]).toBe(5);
        expect(view[0x9efa]).toBe(5);
        expect(view[0xff24]).toBe(10);
    });

    it('removeAccomplishedItems applies only matched entries', () => {
        // table + targets must be seg0-resident (< 0x10000): the achievements
        // pointer is a uint16
        const tbl = 0xe600;
        const flagA = 0xe640;
        const flagB = 0xe650;
        const dstA = 0xe660;
        const dstB = 0xe670;
        view[flagA] = 0xf0;
        view[flagB] = 0x00; // unmatched
        view[dstA] = 0x00; view[dstA + 1] = 0x00;
        view[dstB] = 0x00; view[dstB + 1] = 0x00;
        let p = tbl;
        // entry A: matched, one rewrite {dstA ← 0x1234}
        view[p++] = flagA & 0xff; view[p++] = flagA >> 8; view[p++] = 0xf0;
        view[p++] = dstA & 0xff; view[p++] = dstA >> 8; view[p++] = 0x34; view[p++] = 0x12;
        view[p++] = 0xff; view[p++] = 0xff;
        // entry B: unmatched, skipped rewrite list still walked to terminator
        view[p++] = flagB & 0xff; view[p++] = flagB >> 8; view[p++] = 0x0f;
        view[p++] = dstB & 0xff; view[p++] = dstB >> 8; view[p++] = 0x99; view[p++] = 0x99;
        view[p++] = 0xff; view[p++] = 0xff;
        // terminator
        view[p++] = 0xff; view[p++] = 0xff;
        view[0xc00c] = tbl & 0xff;
        view[0xc00d] = tbl >> 8;

        removeAccomplishedItems(view);
        expect(view[dstA]! | (view[dstA + 1]! << 8)).toBe(0x1234);
        expect(view[dstB]! | (view[dstB + 1]! << 8)).toBe(0);
    });
});
