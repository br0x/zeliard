import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugHeroReset,
    debugProjectilesCollisionProcessing,
    debugRenderSwordOverlay,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import {
    projectilesCollisionProcessing,
    renderSwordOverlay,
} from '../src/engine/dungeon-projectiles.js';
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
    // Compare only the game-addressable window (seg0 + seg1). Beyond it the
    // view exposes C internals (packed-cursor globals etc.) that the TS
    // side intentionally keeps as module state.
    const limit = Math.min(a.length, b.length, 0x20000);
    for (let i = 0; i < limit; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return i;
    }
    return -1;
}

/** Seed the enemy-projectile list: n live slots + terminator. */
function seedProjectiles(rand: () => number, n: number): void {
    // Zero the entire list region: compaction leaves stale bytes past the
    // terminator, and those leftovers differ between the two parity passes.
    view.fill(0, 0xeb80, 0xeb80 + 13 * 32 + 1);
    let p = 0xeb80;
    for (let i = 0; i < n; i++) {
        // x_rel: mix of in-hero-column, zero (dropped), and random values
        const roll = rand() % 6;
        if (roll === 0) view[p] = 0; // will be dropped unless vram bit pending
        else if (roll <= 3) view[p] = (view[0x83] ?? 0) + 4 + (rand() % 2); // hero column (common: exercises hits)
        else view[p] = rand() % 250;
        view[p + 1] = rand() % 64;
        view[p + 2] = rand() % 256;
        view[p + 3] = rand() % 8; // trajectory step count
        view[p + 4] = rand() % 16; // max step count
        view[p + 5] = rand() % 256; // trajectory dir bits
        view[p + 6] = 1 + (rand() % 32); // damage
        const vramHiBit = frac(rand) < 0.15 ? 0x80 : 0;
        view[p + 7] = rand() % 256;
        view[p + 8] = vramHiBit; // sets MEM16(p+7) & 0x8000 when 0x80
        // curved path pointer → scratch table at 0xd600
        view[p + 9] = 0x00;
        view[p + 10] = 0xd6;
        view[p + 11] = rand() % 256;
        for (let b = 12; b < 13; b++) view[p + b] = rand() % 256;
        p += 13;
    }
    view[p] = 0xff;

    // curved path data: a few steps then terminator
    for (let k = 0; k < 6; k++) view[0xd600 + k] = rand() % 256;
    view[0xd606] = 0xff;

    // hero/shield/facing state
    const hp = 500 + rand() % 40000; // must be seeded: HP starts at 0
    view[0x90] = hp & 0xff;
    view[0x91] = (hp >> 8) & 0xff;
    view[0x93] = frac(rand) < 0.5 ? 1 + (rand() % 4) : 0;
    view[0xc2] = rand() % 256;
    view[0xff38] = frac(rand) < 0.3 ? 0xff : 0;
    view[0xff39] = frac(rand) < 0.1 ? 0xff : 0;
    view[0xff43] = frac(rand) < 0.5 ? 0xff : 0; // swinging
    view[0xff45] = rand() % 3;
    view[0xff46] = rand() % 8;
    view[0xff75] = 0;
    view[0xff36] = 0;
    view[0x9f14] = 0;
    view[0x9f1f] = 0;
}

describe('stage 8d slice-5 enemy projectiles parity vs real wasm', () => {
    it('projectiles_collision_processing matches wasm across randomized scenarios', async () => {
        let hits = 0;
        for (let seed = 1; seed <= 250; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 15485863);
                applyBase(rand);
                require("fs").writeSync(1, "[DBG real] 0x83=" + view[0x83]);
    seedProjectiles(rand, 3 + (rand() % 3));
                // hero position near the projectiles' rows/columns
                view[0x84] = rand() % 64;
                view[0x82] = rand() % 40;
                view[0xff75] = 0;
                view[0xff36] = 0;
                view[0x9f14] = 0;
                view[0x9f1f] = 0;
            };

            apply();
            const snap = view.slice();
            if (seed === 5) {
                // slot #2 decision trace
                const p2 = 0xeb9a;
                const xv = view[p2] ?? 0, yv = view[p2 + 1] ?? 0;
                const cell = 0xe000 + (yv & 63) * 36 + (xv & 255);
                const tile = view[cell] ?? 0;
                const { lookupShared } = await import('../src/engine/dungeon-entities.js');
                const band = ((view[0x82] ?? 0) + (view[0x84] ?? 0)) & 0xff;
                require('fs').writeSync(1,
                    `[slot2] x=${xv} y=${yv} cell=0x${cell.toString(16)} tile=0x${tile.toString(16)} ` +
                    `blockingExt=${tile < 0x49 ? lookupShared(view, tile) : 0} ` +
                    `band=${band},${(band + 1) & 63},${(band + 2) & 63} squat=${view[0xff38]} shield=${view[0x93]} facing=${view[0xc2]}\n`);
            }
            const preHp = view[0x90] ?? 0;
            debugHeroReset();
            debugProjectilesCollisionProcessing();
            const wMem = view.slice();
            if ((wMem[0x90] ?? 0) !== preHp) hits++;

            // TS self-check: second TS pass on identical state must match
            // the first exactly (catches hidden module state).
            view.set(snap);
            const tsMem1 = (() => {
                resetUnpackCursors(0xc01b);
                projectilesCollisionProcessing(view);
                return view.slice();
            })();
            view.set(snap);
            resetUnpackCursors(0xc01b);
            projectilesCollisionProcessing(view);
            const dSelf = firstDiff(tsMem1, view.slice());
            if (seed === 1) {
                // inspect the mystery write region
                const nz: string[] = [];
                for (let i = 0x4fe00; i < 0x4fec0; i++) {
                    if ((wMem[i] ?? 0) !== (snap[i] ?? 0)) nz.push(`0x${i.toString(16)}:${snap[i]}->${wMem[i]}`);
                }
                require('fs').writeSync(1, `[region] ${nz.join(' ')}\n`);
            }
            if (dSelf >= 0) {
                throw new Error(`proj-collide seed ${seed}: TS NONDETERMINISM at 0x${dSelf.toString(16)}`);
            }

            view.set(snap);
            resetUnpackCursors(0xc01b);
            projectilesCollisionProcessing(view);

            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                const dump = (mem: Uint8Array): string => {
                    const out: string[] = [];
                    let p = 0xeb80;
                    for (;;) {
                        if ((mem[p] ?? 0) === 0xff) { out.push(`END@0x${p.toString(16)}+${mem[p + 1] ?? 0}`); break; }
                        out.push(`[${p.toString(16)}]x=${mem[p]} y=${mem[p + 1]} st=${mem[p + 3]} dir=0x${mem[p + 5]?.toString(16)}`);
                        p += 13;
                        if (out.length > 40) break;
                    }
                    return out.join(' | ');
                };
                require('fs').writeSync(1,
                    `wasm: ${dump(wMem)}\nts:   ${dump(view)}\n`);
                throw new Error(
                    `proj-collide seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
        expect(hits).toBeGreaterThan(10); // hero-hit path must be exercised
        // (row-band matches are inherently rare: ~3/64 rows × move offset;
        // 14+ seeds still drive the full shield/knockback resolution)
    }, 180_000);

    it('render_sword_overlay phase machine matches wasm', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 40503);
                applyBase(rand);
                view[0xff43] = frac(rand) < 0.7 ? 0xff : 0; // swinging
                view[0xff45] = rand() % 3; // hit type
                view[0xff46] = rand() % 10; // movement phase
            };

            apply();
            debugHeroReset();
            debugRenderSwordOverlay();
            const wMem = view.slice();

            apply();
            renderSwordOverlay(view);

            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `sword-overlay seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
    });
});
