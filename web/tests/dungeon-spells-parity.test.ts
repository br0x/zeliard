import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugDispatchSpellMovement,
    debugHeroReset,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { dispatchSpellProjectileMovement } from '../src/engine/dungeon-spells.js';
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

/** Seed the magic-projectile array (7 slots × 16 bytes) + spell state. */
function seedProjectiles(rand: () => number): void {
    // spell selection 1..7 (guerra = 6+1 → no movement)
    const spellRoll = rand() % 7;
    view[0x9d] = (spellRoll === 6 ? 6 : spellRoll) + 1;
    if (spellRoll === 6) view[0x9d] = 7; // guerra
    view[0xff3e] = frac(rand) < 0.85 ? 0xff : 0; // spell active flag
    view[0x9f2a] = 0; // scratch mark flag

    let p = 0xeb15;
    for (let slot = 0; slot < 7; slot++) {
        const xRel = rand() % 200;
        view[p] = xRel & 0xff;
        view[p + 1] = (xRel >> 8) & 0xff;
        view[p + 2] = rand() % 64; // y_rel
        view[p + 3] = rand() % 256; // dir (bit7 hit-mark, bit0 direction)
        view[p + 4] = rand() % 16; // life timer (mostly pre-expiry)
        view[p + 5] = rand() % 256; // anim frame
        for (let b = 6; b < 16; b++) view[p + b] = rand() % 256;
        p += 16;
    }
    // monsters list for the target-marking path
    view[0xc010] = 0xe9e0 & 0xff;
    view[0xc011] = 0xe9e0 >> 8;
    let m = 0xe9e0;
    for (let k = 0; k < 4; k++) {
        const inWindow = frac(rand) < 0.7;
        const x = inWindow ? (view[0x80] ?? 0) + 4 + (rand() % 28) : rand() % 250;
        view[m] = x & 0xff;
        view[m + 1] = (x >> 8) & 0xff;
        view[m + 2] = rand() % 64;
        view[m + 4] = rand() % 160; // flags (bit6 flying sometimes)
        m += 16;
    }
    view[m] = 0xff;
    view[m + 1] = 0xff;
}

describe('stage 8d slice-4 spell projectile parity vs real wasm', () => {
    it('dispatch_spell_projectile_movement matches wasm across randomized scenarios', () => {
        let moved = 0;
        for (let seed = 1; seed <= 300; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 15485863);
                applyBase(rand);
                seedProjectiles(rand);
                view[0xff34] = frac(rand) < 0.9 ? 0 : 0xff; // boss cavern gate
                view[0xff2e] = frac(rand) < 0.9 ? 0 : 0xff; // boss being hit gate
            };

            apply();
            const before = view.slice();
            debugHeroReset();
            debugDispatchSpellMovement();
            const wMem = view.slice();
            let wChanged = false;
            for (let i = 0; i < wMem.length; i++) {
                if ((wMem[i] ?? 0) !== (before[i] ?? 0)) { wChanged = true; break; }
            }

            apply();
            dispatchSpellProjectileMovement(view);

            if (wChanged) moved++;
            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `spells seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]} (spell=${view[0x9d]})`,
                );
            }
        }
        expect(moved).toBeGreaterThan(150); // movement paths must be exercised
    }, 120_000);
});
