import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugHeroReset,
    debugMagiaStoneUpdates,
    debugProcessCollapsingPlatforms,
    debugRenderMagiaStoneEffect,
    debugRenderVerticalPlatforms,
    debugUpdateAndRenderHorizPlatforms,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import {
    magiaStoneUpdates,
    processVisibleCollapsingPlatforms,
    renderMagiaStoneEffect,
    renderVerticalPlatformsToProximity,
    updateAndRenderHorizPlatforms,
} from '../src/engine/dungeon-platforms.js';
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';
import { resetUnpackCursors } from '../src/engine/unpack.js';

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

/** Seed the seg1 lists + platform tables shared by these scenarios. */
function seedTables(rand: () => number): void {
    // seg1 passable/aggressive lists (platform carry uses blocking checks)
    const pool = [0, 3, 6, 7, 8, 9];
    for (let i = 0; i < 24; i++) view[0x18000 + i] = pool[rand() % 9]!;
    // horizontal platform list: 3 × 7-byte entries + terminator
    view[0xc008] = 0x40;
    view[0xc009] = 0xea; // table at 0xea40 (safe band)
    let p = 0xea40;
    for (let i = 0; i < 3; i++) {
        const speed = rand() % 4; // 0=static,1=slow,2/3=normal
        const x = frac(rand) < 0.8 ? leftColSafe() + (rand() % 36) : rand() % 200;
        const dirPause = rand() % 256;
        const minX = rand() % 160;
        const maxX = minX + 10 + (rand() % 60);
        view[p] = x & 0xff;
        view[p + 1] = ((speed << 6) | (x >> 8)) & 0xff;
        view[p + 2] = dirPause;
        view[p + 3] = minX & 0xff;
        view[p + 4] = (minX >> 8) & 0xff;
        view[p + 5] = maxX & 0xff;
        view[p + 6] = (maxX >> 8) & 0xff;
        p += 7;
    }
    view[p] = 0xff;
    view[p + 1] = 0xff;
    // vertical platforms: 2 × 3-byte entries + terminator
    view[0xc004] = 0x80;
    view[0xc005] = 0xeb; // 0xeb80 is projectiles… use 0xea90
    view[0xc004] = 0x90;
    view[0xc005] = 0xea; // 0xea90
    p = 0xea90;
    for (let i = 0; i < 2; i++) {
        const x = leftColSafe() + (rand() % 36);
        view[p] = x & 0xff;
        view[p + 1] = (x >> 8) & 0xff;
        view[p + 2] = rand() % 64;
        p += 3;
    }
    view[p] = 0xff;
    view[p + 1] = 0xff;
    // collapsing platforms: 2 entries + terminator
    view[0xc006] = 0xb0;
    view[0xc007] = 0xea; // 0xeab0
    p = 0xeab0;
    for (let i = 0; i < 2; i++) {
        const x = leftColSafe() + (rand() % 36);
        view[p] = x & 0xff;
        view[p + 1] = (x >> 8) & 0xff;
        view[p + 2] = rand() % 64;
        p += 3;
    }
    view[p] = 0xff;
    view[p + 1] = 0xff;
}

function leftColSafe(): number {
    return view[0x80] ?? 0;
}

describe('stage 8d slice-2 platform/magia parity vs real wasm', () => {
    it('update_and_render_horiz_platforms matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 150; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 7919);
                applyBase(rand);
                seedTables(rand);
                // hero state driving platform-carry movement
                view[0x83] = 4 + (rand() % 18); // hero x view
                view[0x84] = 2 + (rand() % 25); // head y view
                view[0xff3d] = frac(rand) < 0.8 ? 0 : 0xff; // jump phase
                view[0xff39] = frac(rand) < 0.9 ? 0 : 0xff; // on rope
                view[0x9f07] = rand() % 256; // slow-platform tick counter
            };

            apply();
            debugHeroReset();
            debugUpdateAndRenderHorizPlatforms();
            const wMem = view.slice();

            apply();
            resetUnpackCursors(0xc01b);
            updateAndRenderHorizPlatforms(view);

            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `horiz-platforms seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
    }, 120_000);

    it('render_vertical_platforms + collapsing platforms match wasm', () => {
        for (let seed = 1; seed <= 150; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 104729);
                applyBase(rand);
                seedTables(rand);
            };

            apply();
            debugHeroReset();
            debugRenderVerticalPlatforms();
            debugProcessCollapsingPlatforms();
            const wMem = view.slice();

            apply();
            renderVerticalPlatformsToProximity(view);
            processVisibleCollapsingPlatforms(view);

            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `vert/collapse seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
    }, 60_000);

    it('magia stone updates + effect match wasm across randomized scenarios', () => {
        let active = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 15485863);
                applyBase(rand);
                // 4 × 7-byte magia sprite slots
                for (let i = 0; i < 28; i++) view[0xeb60 + i] = rand() % 256;
                // keep some slots inactive
                for (const slot of [0, 1, 2, 3]) {
                    if (frac(rand) < 0.25) view[0xeb60 + slot * 7] = 0xff;
                    else if (frac(rand) < 0.25) view[0xeb60 + slot * 7 + 2] = 0; // no shots
                }
                view[0xff34] = frac(rand) < 0.85 ? 0 : 0xff; // boss cavern gate
                view[0xff30] = frac(rand) < 0.9 ? 0 : 0xff; // boss dead gate
            };

            apply();
            debugHeroReset();
            debugMagiaStoneUpdates();
            debugRenderMagiaStoneEffect();
            const wMem = view.slice();

            apply();
            magiaStoneUpdates(view);
            renderMagiaStoneEffect(view);

            // coverage: count seeds where any stone stayed active
            for (let i = 0; i < 4; i++) {
                if ((view[0xeb60 + i * 7] ?? 0xff) !== 0xff) {
                    active++;
                    break;
                }
            }

            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `magia seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
        expect(active).toBeGreaterThan(100); // orbit paths must be exercised
    }, 120_000);
});

