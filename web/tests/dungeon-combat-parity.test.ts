import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugApplySwordHit,
    debugGetEntropy,
    debugGetRandom,
    debugGetStats,
    debugHeroHitsMonster,
    debugHeroReset,
    debugSetEntropy,
    debugUpdateHeroXp,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import {
    ADDR_PACKED_MAP_START,
    resetUnpackCursors,
} from '../src/engine/unpack.js';
import {
    applySwordHitToMapTiles,
    getEntropy,
    getRandom,
    getStats,
    heroHitsMonster,
    setEntropy,
    updateHeroXp,
} from '../src/engine/dungeon-combat.js';
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

let view: Uint8Array;

beforeAll(() => {
    initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = getWasmMemory()!;
    bindView(view);
});

/** Full-g_mem comparison — strictest observable-behavior check. */
function firstDiff(a: Uint8Array, b: Uint8Array): number {
    for (let i = 0; i < a.length; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return i;
    }
    return -1;
}

function runWasm(call: () => void): Uint8Array {
    debugHeroReset();
    call();
    const mem = view.slice();
    resetUnpackCursors(ADDR_PACKED_MAP_START);
    return mem;
}

/**
 * Seeds the seg1 sword-reach table at 0xB002 with 32 lists pointing into
 * scratch at 0xB100, each list being a few random offsets + terminator.
 */
function seedReachTable(rand: () => number): void {
    for (let i = 0; i < 28; i++) {
        const listOff = 0xb100 + i * 12;
        view[0x10000 + 0xb002 + i * 2] = listOff & 0xff;
        view[0x10000 + 0xb002 + i * 2 + 1] = (listOff >> 8) & 0xff;
        let p = listOff;
        const n = rand() % 6;
        for (let k = 0; k < n; k++) view[0x10000 + p++] = 1 + (rand() % 80);
        view[0x10000 + p] = 0xff;
    }
}

describe('stage 8c combat parity vs real wasm', () => {
    it('get_random matches wasm across seeded entropy states', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const rand = rng(seed * 2654435761);
            applyBase(rand);
            const anim = rand() % 65536;
            view[0xff1b] = anim & 0xff;
            view[0xff1c] = (anim >> 8) & 0xff;
            const entropy = rand() % 65536;

            debugSetEntropy(entropy);
            const w = debugGetRandom();

            setEntropy(entropy);
            const t = getRandom(view);

            if (w !== t) throw new Error(`get-random seed ${seed}: wasm=${w} ts=${t}`);
            if (debugGetEntropy() !== getEntropy()) {
                throw new Error(`get-random seed ${seed}: entropy diverged`);
            }

            // sequence check: five consecutive rolls must stay in lockstep
            for (let k = 0; k < 5; k++) {
                const wv = debugGetRandom();
                const tv = getRandom(view);
                if (wv !== tv) throw new Error(`get-random seq seed ${seed}.${k}`);
            }
        }
    });

    it('Get_Stats matches wasm across all inputs and stat states', () => {
        for (let seed = 1; seed <= 120; seed++) {
            const rand = rng(seed * 40503);
            applyBase(rand);
            view[0x8d] = rand() % 256; // hero level
            view[0x92] = 1 + (rand() % 6); // sword type
            view[0xe4] = rand() % 256; // difficulty multiplier
            view[0xff45] = rand() % 3; // sword hit type

            for (const al of [0, 1, 2, 4, 8, 9, 10]) {
                const w = debugGetStats(al);
                const t = getStats(view, al);
                if ((w ?? 0) !== t) throw new Error(`stats seed ${seed} al=${al}: wasm=${w} ts=${t}`);
            }
        }
    });

    it('update_hero_XP matches wasm across saturating amounts', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const setup = (): void => {
                const rand = rng(seed * 6971);
                applyBase(rand);
                const xp = rand() % 65536;
                view[0x8e] = xp & 0xff;
                view[0x8f] = (xp >> 8) & 0xff;
            };

            setup();
            debugUpdateHeroXp(300);
            const wMem = view.slice();

            setup();
            updateHeroXp(view, 300);
            const d = firstDiff(wMem, view.slice());
            if (d >= 0) throw new Error(`xp seed ${seed}: differs at 0x${d.toString(16)}`);
        }
    });

    it('apply_sword_hit_to_map_tiles matches wasm across randomized scenarios', () => {
        let hits = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 32452843);
                applyBase(rand);
                seedReachTable(rand);
                view[0xc010] = 0xe9e0 & 0xff;
                view[0xc011] = 0xe9e0 >> 8;
                // monster table: 3 entries with markers planted near the hero
                let m = 0xe9e0;
                for (let i = 0; i < 3; i++) {
                    view[m] = rand() % 256;
                    view[m + 1] = rand() % 256;
                    view[m + 2] = rand() % 64;
                    view[m + 3] = rand() % 36;
                    view[m + 4] = rand() % 256;
                    view[m + 5] = rand() % 256;
                    m += 16;
                }
                view[m] = 0xff;
                view[m + 1] = 0xff;
                // swing state: mostly swinging, mix of types/phases/facing
                view[0xff43] = frac(rand) < 0.85 ? 0xff : 0;
                view[0xff34] = frac(rand) < 0.85 ? 0 : 0xff;
                view[0xff2e] = frac(rand) < 0.85 ? 0 : 0xff;
                view[0xff45] = rand() % 3;
                view[0xff46] = rand() % 6;
                view[0xc2] = frac(rand) < 0.5 ? 0 : 1;
                view[0xff38] = frac(rand) < 0.3 ? 0xff : 0;
            };

            const before = (): number => {
                let n = 0;
                for (let i = 0xe9e0; i < 0xea20; i++) if (((view[i] ?? 0) & 0x41) === 0x41) n++;
                return n;
            };

            apply();
            const pre = before();
            const wMem = runWasm(() => debugApplySwordHit());

            apply();
            const preT = before();
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            applySwordHitToMapTiles(view);

            if (pre !== preT) throw new Error(`sword seed ${seed}: precondition drift`);
            if (pre > 0 || true) void hits;
            // count post-hit marks on both sides
            const countMarks = (mem: Uint8Array): number => {
                let n = 0;
                for (let i = 0xe9e0; i < 0xea20; i++) if (((mem[i] ?? 0) & 0x41) === 0x41) n++;
                return n;
            };
            if (countMarks(wMem) > 0) hits++;
            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `sword seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
        expect(hits).toBeGreaterThan(20); // deep path must be exercised
    }, 60_000);

    it('Hero_Hits_monster matches wasm across randomized scenarios', () => {
        let lethal = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): { m: number; entropy: number } => {
                const rand = rng(seed * 15485863);
                applyBase(rand);
                // Death descriptors: PTR word at 0xA006 → table of 8 word
                // pointers at 0xA100, each → a 4-byte descriptor list in seg1.
                view[0xa006] = 0x00;
                view[0xa007] = 0xa1;
                for (let i = 0; i < 8; i++) {
                    const off = 0xb200 + i * 8;
                    view[0xa100 + i * 2] = off & 0xff;
                    view[0xa101 + i * 2] = (off >> 8) & 0xff;
                    for (let k = 0; k < 4; k++) view[off + k] = rand() % 256;
                }
                // stat inputs for Get_Stats
                view[0x8d] = rand() % 256; // hero level
                view[0x92] = 1 + (rand() % 6); // sword type
                view[0xe4] = rand() % 256; // difficulty multiplier
                const heroXp = rand() % 65536; // must be reset between passes
                view[0x8e] = heroXp & 0xff;
                view[0x8f] = (heroXp >> 8) & 0xff;
                const m = 0xe9e0;
                const big = frac(rand) < 0.4;
                view[m + 4] = big ? rand() % 16 : rand() % 256; // flags
                // ai_flags: low nibble drives the Get_Stats selector — keep
                // it in 0..9 (the documented domain; higher indexes read
                // past the static table in C)
                view[m + 5] = rand() % 10;
                view[m + 7] = big ? 0x10 | (rand() % 16) : rand() % 256; // state_flags
                view[m + 8] = rand() % 256; // hp
                view[m + 2] = rand() % 64; // currY
                view[0x82] = rand() % 40; // viewport top row
                view[0xff75] = 0; // SFX request
                // Force a small-monster lethal scenario half the time so
                // the small-path death descriptor write is exercised.
                if (frac(rand) < 0.5) {
                    view[m + 4] = rand() % 256; // flags (bit4 clear = small)
                    view[m + 7] = 0x00; // no death nibble yet, not big
                }
                const anim = rand() % 65536;
                view[0xff1b] = anim & 0xff;
                view[0xff1c] = (anim >> 8) & 0xff;
                view[0xff45] = rand() % 3; // sword hit type
                const entropy = rand() % 65536;
                return { m, entropy };
            };

            const a = apply();
            debugHeroReset();
            debugSetEntropy(a.entropy);
            debugHeroHitsMonster(a.m);
            const wEnt = debugGetEntropy();
            const wMem = view.slice();

            apply();
            setEntropy(a.entropy);
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            heroHitsMonster(view, a.m);

            if (getEntropy() !== wEnt) {
                throw new Error(`hits seed ${seed}: entropy diverged`);
            }
            // count lethal outcomes (death bits set in flags)
            if (((view[a.m + 4] ?? 0) & 0x68) !== 0) lethal++;
            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                const f = (mem: Uint8Array): string =>
                    `flags=${mem[a.m + 4] ?? 0} ai=${mem[a.m + 5] ?? 0} sf=${mem[a.m + 7] ?? 0} ` +
                    `sf2=${mem[a.m + 23] ?? 0} hp=${mem[a.m + 8] ?? 0} sfx=${mem[0xff75] ?? 0} ` +
                    `xp=${(mem[0x8e] ?? 0) | ((mem[0x8f] ?? 0) << 8)}`;
                throw new Error(
                    `hits seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}\n  wasm: ${f(wMem)}\n  ts:   ${f(view)}`,
                );
            }
        }
        expect(lethal).toBeGreaterThan(40); // death path must be exercised
    }, 60_000);
});
