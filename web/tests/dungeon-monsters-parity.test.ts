import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugCheckAggressiveGround,
    debugCheckAlignedTick,
    debugHeroReset,
    debugMonsterActivation,
    debugUpdateAllMonsters,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { ADDR_PACKED_MAP_START, resetUnpackCursors, unpackCursors } from '../src/engine/unpack.js';
import {
    checkMonsterAlignedToHeroAndTick,
    checkMonsterOnAggressiveGround,
    monsterActivation,
    updateAllMonstersInMap,
} from '../src/engine/dungeon-monsters.js';
import {
    PROX,
    PROX_BYTES,
    applyBase,
    bindView,
    frac,
    rng,
} from './vertical-scenario.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

let view: Uint8Array;

beforeAll(() => {
    initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = getWasmMemory()!;
    bindView(view);
});

const MONSTERS_SCRATCH = 0xe9e0; // same band applyBase points the list at

interface MonSeed {
    x: number; // currX word (0xFFFF high byte marks inactive)
    y: number;
    flags: number;
    stateFlags: number;
    spwnX: number;
    spwnY: number;
    type_: number;
}

/** Deterministically build a monster table of n entries + terminator. */
function writeMonsterTable(rand: () => number, n: number): Array<MonSeed> {
    const seeds: MonSeed[] = [];
    let m = MONSTERS_SCRATCH;
    for (let i = 0; i < n; i++) {
        // spread spawn X across the map incl. wrap cases
        const spwnX = rand() % 160;
        const inactive = frac(rand) < 0.6;
        const big = frac(rand) < 0.2 && i < n - 1;
        const seed: MonSeed = {
            x: inactive ? (0xff00 | (rand() % 256)) : spwnX,
            y: rand() % 64,
            flags: rand() % 256,
            stateFlags: big ? 0x10 | (rand() % 16) : rand() % 16,
            spwnX,
            spwnY: rand() % 64,
            type_: rand() % 32,
        };
        seeds.push(seed);
        view[m] = seed.x & 0xff;
        view[m + 1] = (seed.x >> 8) & 0xff;
        view[m + 2] = seed.y;
        view[m + 3] = rand() % 256;
        view[m + 4] = seed.flags;
        view[m + 5] = rand() % 256;
        view[m + 6] = rand() % 256;
        view[m + 7] = seed.stateFlags;
        view[m + 8] = rand() % 256; // hp
        view[m + 9] = rand() % 256; // ai_state
        view[m + 10] = rand() % 256; // ai_timer
        view[m + 11] = spwnX & 0xff;
        view[m + 12] = (spwnX >> 8) & 0xff;
        view[m + 13] = seed.spwnY;
        view[m + 14] = seed.type_;
        view[m + 15] = rand() % 256; // counter
        m += 16;
    }
    view[m] = 0xff;
    view[m + 1] = 0xff;
    return seeds;
}

/** Full-g_mem comparison — strictest observable-behavior check. */
function firstDiff(a: Uint8Array, b: Uint8Array): number {
    for (let i = 0; i < a.length; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return i;
    }
    return -1;
}

function runWasm(call: () => number | null): { ret: number | null; mem: Uint8Array; cl: number; cr: number } {
    debugHeroReset();
    const ret = call();
    const mem = view.slice();
    resetUnpackCursors(ADDR_PACKED_MAP_START);
    return { ret, mem, cl: unpackCursors.proxLeft, cr: unpackCursors.proxRight };
}

describe('stage 8c monster lifecycle parity vs real wasm', () => {
    it('update_all_monsters_in_map matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 150; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 7919);
                applyBase(rand);
                view[0xc010] = MONSTERS_SCRATCH & 0xff;
                view[0xc011] = MONSTERS_SCRATCH >> 8;
                writeMonsterTable(rand, 4);
            };

            apply();
            const w = runWasm(() => {
                debugUpdateAllMonsters();
                return null;
            });

            apply();
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            updateAllMonstersInMap(view);
            const tMem = view.slice();

            if (w.cl !== unpackCursors.proxLeft || w.cr !== unpackCursors.proxRight) {
                throw new Error(`upd-monsters seed ${seed}: cursor drift`);
            }
            const d = firstDiff(w.mem, tMem);
            if (d >= 0) {
                throw new Error(
                    `upd-monsters seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${w.mem[d]} ts=${tMem[d]}`,
                );
            }
        }
    }, 60_000);

    it('monster_activation matches wasm across randomized scenarios', () => {
        let spawned = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): { m: number } => {
                const rand = rng(seed * 104729);
                applyBase(rand);
                view[0xc010] = MONSTERS_SCRATCH & 0xff;
                view[0xc011] = MONSTERS_SCRATCH >> 8;
                writeMonsterTable(rand, 5);
                // Force entry 0 into a valid activation scenario roughly
                // half the time (deep-path coverage); otherwise random.
                if (frac(rand) < 0.6) {
                    const m = MONSTERS_SCRATCH;
                    const big = frac(rand) < 0.35;
                    view[m + 1] = 0xff; // inactive
                    view[m + 7] = big ? 0x10 : 0x00;
                    if (big) view[m + 17] = 0xff; // second half inactive
                    const leftCol = view[0x80] ?? 0;
                    const spwnX = leftCol + 10; // mid-window
                    view[m + 11] = spwnX & 0xff;
                    view[m + 12] = (spwnX >> 8) & 0xff;
                    const topRow = view[0x82] ?? 0;
                    const spwnY = (topRow + 30 + rand() % 20) & 0x3f; // off-screen
                    view[m + 13] = spwnY;
                    view[m + 2] = rand() % 64;
                    view[m + 14] = big ? rand() % 32 : rand() % 16;
                    // clear the 3×3 occupancy scan area around the spawn point
                    const diOrig = 0xe000 + spwnY * 36 + 10;
                    for (let r = -1; r <= 1; r++) {
                        for (let c = -1; c <= 1; c++) {
                            const off = (diOrig + r * 36 + c - PROX) % PROX_BYTES;
                            view[PROX + (off + PROX_BYTES) % PROX_BYTES] = 0;
                        }
                    }
                    // occasionally plant a monster marker one row BELOW the
                    // scanned band (catches occupancy-loop bound mutations)
                    if (frac(rand) < 0.5) {
                        const off = (diOrig + 71 - PROX) % PROX_BYTES;
                        view[PROX + off] = 0x81;
                    }
                }
                // target the forced entry when it was set up
                void rand;
                return { m: MONSTERS_SCRATCH };
            };

            const a = apply();
            const before = view.slice();
            const w = runWasm(() => {
                debugMonsterActivation(a.m);
                return null;
            });
            {
                let diff = -1;
                for (let i = 0xe000; i < 0xee00; i++) {
                    if ((w.mem[i] ?? 0) !== (before[i] ?? 0)) { diff = i; break; }
                }
                if (diff >= 0) spawned++;
            }

            const b = apply();
            void b;
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            monsterActivation(view, a.m);
            const tMem = view.slice();

            const d = firstDiff(w.mem, tMem);
            if (d >= 0) {
                throw new Error(
                    `activation seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${w.mem[d]} ts=${tMem[d]}`,
                );
            }
        }
        expect(spawned).toBeGreaterThan(40); // scenario must reach the deep path
    }, 60_000);

    it('check_monster_aligned_to_hero_and_tick matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 250; seed++) {
            const apply = (): { m: number } => {
                const rand = rng(seed * 15485867);
                applyBase(rand);
                view[0xc010] = MONSTERS_SCRATCH & 0xff;
                view[0xc011] = MONSTERS_SCRATCH >> 8;
                writeMonsterTable(rand, 3);
                const entry = rand() % 3;
                const m = MONSTERS_SCRATCH + entry * 16;
                // Guarantee Y+X alignment and the active flag so the tick
                // throttle deep path runs every seed (random positioning
                // reaches it ~0.1% of the time).
                view[m + 7] = 0x80 | (rand() % 16);
                view[0xff35] = view[m + 2] ?? 0; // hero Y aligns
                const mxRel = view[m + 3] ?? 0;
                view[0x83] = (mxRel - 5) & 0xff; // hero x_view aligns at 2nd offset
                view[m + 15] = rand() % 8; // counter phase covers both masks
                view[0xe8] = frac(rand) < 0.85 ? 0 : 0xff; // invincibility flag
                return { m };
            };

            const a = apply();
            const w = runWasm(() => debugCheckAlignedTick(a.m));

            const b = apply();
            void b;
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            const t = checkMonsterAlignedToHeroAndTick(view, a.m);

            if ((w.ret ?? 0) !== t) {
                throw new Error(`aligned-tick seed ${seed}: ret wasm=${w.ret} ts=${t}`);
            }
            const tMem = view.slice();
            const d = firstDiff(w.mem, tMem);
            if (d >= 0) {
                throw new Error(
                    `aligned-tick seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${w.mem[d]} ts=${tMem[d]}`,
                );
            }
        }
    }, 60_000);

    it('check_monster_on_aggressive_ground matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): { m: number } => {
                const rand = rng(seed * 2333);
                applyBase(rand);
                view[0xc010] = MONSTERS_SCRATCH & 0xff;
                view[0xc011] = MONSTERS_SCRATCH >> 8;
                writeMonsterTable(rand, 3);
                // aggressive tile list (seg1 0x8020): random entries, 0-term
                const pool = [0x50, 0x51, 0x52, 0xfd];
                for (let i = 0; i < 4; i++) {
                    view[0x18020 + i] = frac(rand) < 0.6 ? pool[rand() % 4]! : 0;
                }
                // bias the tile under the monster toward the aggressive pool
                const entry = rand() % 3;
                const m = MONSTERS_SCRATCH + entry * 16;
                const di = 0xe000 + (((view[m + 2] ?? 0) & 0x3f) * 36) + ((view[m + 3] ?? 0) & 0xff);
                const below = 0xe000 + (((((view[m + 2] ?? 0) + 2) & 0x3f) * 36) + ((view[m + 3] ?? 0) & 0xff));
                void di;
                if (below < 0xe900) {
                    view[PROX + (below - PROX)] = pool[rand() % 4]!;
                } else {
                    view[below] = pool[rand() % 4]!;
                }
                return { m };
            };

            const a = apply();
            const w = runWasm(() => debugCheckAggressiveGround(a.m));

            const b = apply();
            void b;
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            const t = checkMonsterOnAggressiveGround(view, a.m);

            if ((w.ret ?? 0) !== t) {
                throw new Error(`aggr-ground seed ${seed}: ret wasm=${w.ret} ts=${t}`);
            }
            const tMem = view.slice();
            const d = firstDiff(w.mem, tMem);
            if (d >= 0) {
                throw new Error(
                    `aggr-ground seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${w.mem[d]} ts=${tMem[d]}`,
                );
            }
        }
    }, 60_000);
});
