import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugMonsterAi6,
    debugMonsterAi7,
    debugMonsterAi8,
    debugSetEai7Distances,
    debugSetEntropy,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { monsterAi6 as monsterAi6Local } from '../src/engine/eai6.js';
import { monsterAi7 as monsterAi7Local, setEai7Distances } from '../src/engine/eai7.js';
import { monsterAi8 as monsterAi8Local } from '../src/engine/eai8.js';
import { setEntropy } from '../src/engine/dungeon-combat.js';
import { applyEai678Scenario, SCRATCH } from './eai678-scenario.js';
import { diagPath } from './diag-path.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

let view: Uint8Array;

beforeAll(() => {
    initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = getWasmMemory()!;
});

function firstDiff(a: Uint8Array, b: Uint8Array): number {
    for (let i = 0; i < a.length; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return i;
    }
    return -1;
}

interface ModuleDef {
    name: 'eai6' | 'eai7' | 'eai8';
    tsFn: (g: Uint8Array, m: number) => void;
    oracle: (m: number) => void;
    /** Pin eai7's overlay-global preferred firing distances (TS side). */
    pinTs?: (right: number, left: number) => void;
    /** ...and the same statics on the wasm-oracle side. */
    pinWasm?: (right: number, left: number) => void;
}

const MODULES: ModuleDef[] = [
    { name: 'eai6', tsFn: monsterAi6Local, oracle: debugMonsterAi6 },
    {
        name: 'eai7',
        tsFn: monsterAi7Local,
        oracle: debugMonsterAi7,
        pinTs: setEai7Distances,
        pinWasm: debugSetEai7Distances,
    },
    { name: 'eai8', tsFn: monsterAi8Local, oracle: debugMonsterAi8 },
];

describe.each(MODULES)('stage 9e: %s parity vs real wasm', (mod) => {
    it.each(Array.from({ length: 400 }, (_, i) => i + 1))(
        'seed %i matches wasm byte-for-byte',
        (seed) => {
            const seedRandMult = mod.name === 'eai7' ? 40503 : 2654435;
            // eai7's preferred firing distances are overlay globals that
            // persist across calls on BOTH sides — each pass must pin them
            // to identical per-seed values or the distance comparisons
            // diverge from call one.
            let pinRight = 0;
            let pinLeft = 0;

            const m = SCRATCH;
            const snap = (): string =>
                `${Array.from(view.slice(m, m + 12)).join(',')}|tw=${Array.from(view.slice(m + 16, m + 23)).join(',')}|hy=${view[0xff35]}|pj=${view[0x9f1f]}`;

            // State machines span multiple frames: run several consecutive
            // calls per seed (entropy pinned once per pass, then evolving
            // identically on both sides). The longer runs matter for eai7
            // type0: an attack cycle consumes ~5 ticks, so short runs never
            // reach a post-re-roll firing-distance comparison.
            const repeats = ((seed % 6) + 1) * 8;
            const entropy = (seed * 46599) & 0xffff;

            const wCalls: string[] = [];
            const tCalls: string[] = [];

            applyEai678Scenario(view, seed, seedRandMult, mod.name);

            if (mod.pinWasm && mod.pinTs) {
                // Pin the firing distances to the monster's seeded initial
                // hero-distance so the very first aligned tick hits the
                // `distance == preferred` equality and runs
                // type0_prepare_attack's distance re-roll — with generic
                // 5..12 pins that path fires only ~14 times per 2.6k ticks,
                // leaving the post-re-roll comparisons unexercised.
                const d0 = Math.abs((view[SCRATCH + 3] ?? 0) - 0x11);
                pinRight = d0 & 0xff;
                pinLeft = d0 & 0xff;
            }

            mod.pinWasm?.(pinRight, pinLeft);
            debugSetEntropy(entropy);
            for (let r = 0; r < repeats; r++) {
                wCalls.push(`pre ${snap()}`);
                mod.oracle(m);
                wCalls.push(`post ${snap()}`);
            }
            const wMem = view.slice();

            applyEai678Scenario(view, seed, seedRandMult, mod.name);
            mod.pinTs?.(pinRight, pinLeft);
            setEntropy(entropy);
            for (let r = 0; r < repeats; r++) {
                tCalls.push(`pre ${snap()}`);
                mod.tsFn(view, m);
                tCalls.push(`post ${snap()}`);
            }

            const d = firstDiff(wMem, view);
            if (d >= 0) {
                writeFileSync(
                    diagPath(`trace-${mod.name}-${seed}.json`),
                    JSON.stringify({
                        firstDiffAddr: `0x${d.toString(16)}`,
                        wasmPass: wCalls,
                        tsPass: tCalls,
                    }, null, 1),
                );
                throw new Error(
                    `${mod.name} seed ${seed}: g_mem differs at ` +
                    `0x${d.toString(16)} wasm=${wMem[d]} ts=${view[d]} ` +
                    `(type=${(view[SCRATCH + 4] ?? 0) & 0xf})`,
                );
            }
            expect(d).toBe(-1);
        },
    );
});
