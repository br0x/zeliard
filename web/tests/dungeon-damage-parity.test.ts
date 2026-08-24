import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugCheckHeroContactDamage,
    debugHeroReset,
    debugStepOnAggressiveGround,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { ADDR_PACKED_MAP_START, resetUnpackCursors } from '../src/engine/unpack.js';
import {
    checkHeroContactDamage,
    stepOnAggressiveGround,
} from '../src/engine/dungeon-damage.js';
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

let view: Uint8Array;

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

describe('stage 8c hero damage parity vs real wasm', () => {
    it('check_hero_contact_damage matches wasm across randomized scenarios', () => {
        let damaged = 0;
        for (let seed = 1; seed <= 250; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 15485867);
                applyBase(rand);
                // monster contact table (16 entries of per-subtype damage)
                for (let i = 0; i < 16; i++) view[0xa010 + i] = rand() % 32;
                // monsters near the hero: markers with varied flags
                const xv = view[0x83] ?? 0;
                const headY = view[0x84] ?? 0;
                const topRow = view[0x82] ?? 0;
                const baseOff = (((topRow & 0x3f) + headY) * 36 + xv + 4) % 2304;
                // hero scan region: base-1-36 .. base+3*36+2 — plant markers
                const markerOff = (baseOff + 2304 + Math.floor(rand() * 8) * 36 - 37) % 2304;
                const id = rand() % 4;
                view[0xe000 + markerOff] = 0x80 | id; // marker with flags low nibble
                if (frac(rand) < 0.5) view[0xe000 + ((markerOff + 1) % 2304)] = 0xc0 | id; // flying (bit6)
                // monster structs: flags at +4 (bit6=flying), hp etc.
                view[0xc010] = 0xe9e0 & 0xff;
                view[0xc011] = 0xe9e0 >> 8;
                let m = 0xe9e0;
                for (let k = 0; k < 4; k++) {
                    view[m + 4] = rand() % 256;
                    m += 16;
                }
                view[m] = 0xff;
                view[m + 1] = 0xff;
                // shield & facing & squat state
                view[0x93] = frac(rand) < 0.5 ? 1 + (rand() % 4) : 0;
                view[0x94] = rand() % 256; // shield hp lo (word)
                view[0x95] = rand() % 256;
                view[0xc2] = rand() % 256; // facing
                view[0xff38] = frac(rand) < 0.3 ? 0xff : 0; // squat
                view[0xe8] = frac(rand) < 0.85 ? 0 : 0xff; // invincibility
                view[0xff34] = 0; // boss cavern off (oracle runs real boss AI otherwise)
                view[0xff2e] = 0;
                view[0xff75] = 0; // sfx
                view[0xff96] = 0; view[0xff97] = 0;
                view[0xff99] = 0; view[0xff9a] = 0;
                view[0x9f12] = rand() % 256; view[0x9f13] = rand() % 256; // accum damage pre
                const hp = 200 + rand() % 40000; // hero HP must be seeded: applyBase doesn't own it
                view[0x90] = hp & 0xff;
                view[0x91] = (hp >> 8) & 0xff;
            };

            apply();
            const before = view.slice();
            debugHeroReset();
            debugCheckHeroContactDamage();
            const wMem = view.slice();
            const preHp = (before[0x90] ?? 0) | ((before[0x91] ?? 0) << 8);
            const wHp = (wMem[0x90] ?? 0) | ((wMem[0x91] ?? 0) << 8);
            const wChanged = wHp !== preHp;

            apply();
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            checkHeroContactDamage(view);

            if (wChanged) damaged++;
            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `contact seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
        expect(damaged).toBeGreaterThan(60); // deep paths must be exercised
    }, 120_000);

    it('step_on_aggressive_ground matches wasm across randomized scenarios', () => {
        let damaged = 0;
        for (let seed = 1; seed <= 250; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 2333);
                applyBase(rand);
                // aggressive tile list (seg1 0x8020): random entries, 0-term
                const pool = [0x50, 0x51, 0x52, 0xfd];
                for (let i = 0; i < 4; i++) {
                    view[0x18020 + i] = frac(rand) < 0.6 ? pool[rand() % 4]! : 0;
                }
                // plant aggressive tiles across the hero footprint
                const xv = view[0x83] ?? 0;
                const headY = view[0x84] ?? 0;
                const topRow = view[0x82] ?? 0;
                const baseOff = (((topRow & 0x3f) + headY) * 36 + xv + 4) % 2304;
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                        if (frac(rand) < 0.5) {
                            view[0xe000 + ((baseOff + r * 36 + c) % 2304)] = pool[rand() % 4]!;
                        }
                    }
                }
                view[0x9e] = frac(rand) < 0.5 ? 2 : rand() % 6; // accessory (Pirika immunity)
                view[0xff38] = frac(rand) < 0.3 ? 0xff : 0; // squat
                view[0xff39] = frac(rand) < 0.15 ? 0xff : 0; // on rope
                // cavern level >= 1: the C table lookup is [level-1], so
                // level 0 would read one byte before the table (latent
                // out-of-bounds in the reference port)
                view[0xc012] = 1 + (rand() % 8);
                const hp2 = 200 + rand() % 40000;
                view[0x90] = hp2 & 0xff;
                view[0x91] = (hp2 >> 8) & 0xff;
                view[0xff75] = 0;
                view[0xff36] = 0; // damage this frame
                view[0xff99] = 0;
            };

            apply();
            const preHp = view[0x90] ?? 0;
            debugHeroReset();
            debugStepOnAggressiveGround();
            const wHp = view[0x90] ?? 0;
            const wMem = view.slice();

            apply();
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            stepOnAggressiveGround(view);

            if (wHp !== preHp) damaged++;
            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `aggr seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
        expect(damaged).toBeGreaterThan(40); // damage path must be exercised
    }, 120_000);
});
