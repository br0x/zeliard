import { beforeAll, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugHeroReset,
    debugMonstersSpawning,
    debugPlaceMonsterRunAi,
    debugRunItemHandler,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { ADDR_PACKED_MAP_START, resetUnpackCursors } from '../src/engine/unpack.js';
import {
    default0toFHandler,
    flag10,
    flag11,
    flag12,
    flag13,
    flag14_15_1b,
    flag16,
    flag17,
    flag18,
    flag19,
    flag1a,
    flag1c,
    flag1d,
    flag1e,
    monstersSpawning,
    placeMonsterInProximityAndRunAi,
} from '../src/engine/dungeon-items.js';
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

let view: Uint8Array;
const M = 0xe9e0; // monster scratch entry (same band applyBase uses)

beforeAll(() => {
    initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = getWasmMemory()!;
    bindView(view);
});

function firstDiff(a: Uint8Array, b: Uint8Array): number {
    for (let i = 0; i < a.length; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return i;
    }
    return -1;
}

const noOpAi = (): void => undefined;

/** Compare full g_mem between the wasm oracle pass and the TS pass. */
function expectMemParity(tag: string, seed: number, wMem: Uint8Array): void {
    const d = firstDiff(wMem, view.slice());
    if (d >= 0) {
        throw new Error(
            `${tag} seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
            `wasm=${wMem[d]} ts=${view[d]}`,
        );
    }
}

/** Handler → TS implementation map. */
const TS_HANDLERS: Record<string, (g: Uint8Array, m: number) => void> = {
    '10': flag10,
    '11': flag11,
    '12': flag12,
    '13': flag13,
    '14': flag14_15_1b,
    '16': flag16,
    '17': flag17,
    '18': flag18,
    '19': flag19,
    '1a': flag1a,
    '1c': flag1c,
    '1d': flag1d,
    '1e': flag1e,
    chest: default0toFHandler,
};

describe('stage 8c item dispatch parity vs real wasm', () => {
    // Each handler runs over randomized monster fields; the AI-tick gating
    // inside pickup_common/flag_13/14 etc. is driven by randomized hero
    // position so both aligned and unaligned paths execute.
    const HANDLERS = ['10', '11', '12', '13', '14', '16', '17', '18', '19', '1a', '1c', '1d', '1e', 'chest'];

    for (const handler of HANDLERS) {
        it(`item handler ${handler} matches wasm across randomized scenarios`, () => {
            for (let seed = 1; seed <= 60; seed++) {
                const apply = (): void => {
                    const rand = rng(seed * 7919 + handler.charCodeAt(0) + handler.length * 31);
                    applyBase(rand);
                    // monster entry fields
                    for (let i = 0; i < 16; i++) view[M + i] = rand() % 256;
                    // hero state driving alignment checks
                    view[0x83] = rand() % 256; // hero x view
                    view[0xff35] = rand() % 64; // hero y absolute
                    view[0xe8] = frac(rand) < 0.85 ? 0 : 0xff; // invincibility
                    view[0x82] = rand() % 40; // viewport top row
                    // gold / almas / keys start values
                    view[0x86] = rand() % 256; view[0x87] = rand() % 256;
                    view[0x85] = rand() % 4;
                    view[0x88] = rand() % 256; view[0x89] = rand() % 256;
                    view[0x8b] = rand() % 256; view[0x8c] = rand() % 256; // hero almas word
                    view[0x98] = rand() % 256; view[0x99] = rand() % 256;
                    view[0xb2] = rand() % 256; view[0xb3] = rand() % 256;
                    view[0xc6] = rand() % 256; view[0xc7] = rand() % 256;
                    view[0xa1] = 0; // shoes array terminator
                    // Force the AI-tick alignment deep path: hero Y/X line up
                    // with the monster (after its south move where applicable).
                    const moved = ['16', '17', '19', '1a', '1d', '1e', '14'].includes(handler);
                    view[0xe8] = 0; // not invincible
                    view[0xff35] = ((view[M + 2] ?? 0) + (moved ? 1 : 0)) % 64;
                    view[0x83] = ((view[M + 3] ?? 0) - 5) & 0xff;
                    // cycle every chest subtype deterministically for '13'
                    if (handler === '13') {
                        view[M + 6] = (seed % 16) + (rand() % 2) * 16;
                    }
                    view[0xc012] = rand() % 8; // cavern level
                    view[0xff75] = 0; // sfx
                    view[0xff96] = 0; view[0xff97] = 0; // notification
                    view[0xff94] = 0; view[0xff98] = 0; // gold/almas render reqs
                    view[0xffa1] = 0; view[0xffa2] = 0; view[0xffa4] = 0; view[0xffa5] = 0;
                };

                apply();
                debugHeroReset();
                debugRunItemHandler(handler, M);
                const wMem = runSnapshot();

                apply();
                resetUnpackCursors(ADDR_PACKED_MAP_START);
                TS_HANDLERS[handler]!(view, M);

                expectMemParity(`item-${handler}`, seed, wMem);
            }
        }, 30_000);
    }

    it('place_monster_run_ai matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 120; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 40503);
                applyBase(rand);
                view[0xc010] = 0xe9e0 & 0xff;
                view[0xc011] = 0xe9e0 >> 8;
                for (let i = 0; i < 16; i++) view[M + i] = rand() % 256;
                // Always in the item/chest dispatch range (flags&0x18 != 0):
                // regular-monster AI bodies are Stage 9 and injected as a
                // no-op on both sides here.
                view[M + 4] = 0x08 + (rand() % 0x18);
                view[0xff4a] = rand() % 8; // monster index
            };

            apply();
            debugHeroReset();
            debugPlaceMonsterRunAi(M);
            const wMem = runSnapshot();

            apply();
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            placeMonsterInProximityAndRunAi(view, M, noOpAi);

            expectMemParity('place-run-ai', seed, wMem);
        }
    }, 30_000);

    it('monsters_spawning matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 104729);
                applyBase(rand);
                view[0xc010] = 0xe9e0 & 0xff;
                view[0xc011] = 0xe9e0 >> 8;
                // 3-entry table with varied states
                let m = 0xe9e0;
                for (let i = 0; i < 3; i++) {
                    const active = frac(rand) >= 0.5;
                    if (active) {
                        // mostly inside the proximity window so stamping and
                        // item dispatch actually execute
                        const left = view[0x80] ?? 0;
                        const inWin = frac(rand) < 0.8;
                        const x = inWin ? left + (rand() % 36) : left + 40 + (rand() % 60);
                        view[m] = x & 0xff;
                        view[m + 1] = (x >> 8) & 0xff;
                    } else {
                        view[m] = rand() % 256;
                        view[m + 1] = 0xff; // inactive
                    }
                    view[m + 2] = rand() % 64;
                    view[m + 3] = rand() % 36;
                    // item/chest range; every 2nd value keeps bit0 clear so
                    // big-monster two-entry stamping paths also trigger
                    // ALWAYS item/chest range (&0x18 != 0): the wasm oracle
                    // would otherwise run real eai AI against our no-op.
                    if (frac(rand) < 0.5) view[m + 4] = 0x08 + 2 * (rand() % 4);
                    else view[m + 4] = 0x18 + (rand() % 8);
                    view[m + 5] = rand() % 256;
                    view[m + 6] = rand() % 256;
                    // bit4 (big) set ~half the time; bit5 varies → activation gate
                    if (frac(rand) < 0.5) view[m + 7] = 0x10 | (rand() % 16);
                    else view[m + 7] = rand() % 16;
                    view[m + 11] = rand() % 160;
                    view[m + 12] = rand() % 256;
                    view[m + 13] = rand() % 64;
                    view[m + 14] = rand() % 32;
                    view[m + 15] = rand() % 256;
                    m += 16;
                }
                view[m] = 0xff;
                view[m + 1] = 0xff;
                // boss/jashiin gates MUST stay off: they delegate the whole
                // tick to real eai AI on the wasm side
                view[0xff34] = 0;
                view[0xe6] = 0;
                view[0xff4a] = 0;
            };

            apply();
            debugHeroReset();
            debugMonstersSpawning();
            const wMem = runSnapshot();

            apply();
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            monstersSpawning(view, noOpAi);

            expectMemParity('spawning', seed, wMem);
        }
    }, 60_000);
});

/** Snapshot AFTER resetting TS cursors to mirror the wasm-side dump. */
function runSnapshot(): Uint8Array {
    resetUnpackCursors(ADDR_PACKED_MAP_START);
    return view.slice();
}
