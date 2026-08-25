import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugMonsterAi2,
    debugMonsterAi3,
    debugSetEntropy,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { monsterAi2 as monsterAi2Local } from '../src/engine/eai2.js';
import { monsterAi3 as monsterAi3Local } from '../src/engine/eai3.js';
import { setEntropy } from '../src/engine/dungeon-combat.js';
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

const SCRATCH = 0xe9e0;

interface SeedOpts {
    type: number; // flags & 0x0F
    twin?: boolean; // seed the next record as a valid boarman bottom half
}

/**
 * One monster record at SCRATCH + idx*16 with domain constraints matching
 * what the original guarantees:
 * - ai_flags & 0x1F kept <= 8 (Get_Stats indexes byte_98BE; OOB in C).
 * - toad mid-jump (eai2 type 3, ai_state bit 0x08): anim_counter seeded
 *   2..5 — jump_angles[anim-2] is a 4-entry table.
 * - eai3 type1 crawl (ai_state bit 0x08): anim_counter <= 5 —
 *   type1_dir_table[old_anim] is a 6-entry table.
 */
function seedMonster(
    rand: () => number,
    idx: number,
    opts: SeedOpts,
): void {
    const m = SCRATCH + idx * 16;
    const aiState = rand() % 256;
    let animCounter = rand() % 256;

    const toadJump = opts.type === 3 && (aiState & 0x08) !== 0 && !opts.twin;
    // eai3 type1 in crawl: type1_dir_table[old_anim] is a 6-entry table and
    // in-game the cycle keeps the counter at 0..5.
    const crawler = !opts.twin && (aiState & 0x08) !== 0;
    if (toadJump) animCounter = 2 + (rand() % 4);
    else if (crawler) animCounter = rand() % 6;

    view[m] = rand() % 256; // currX lo
    view[m + 1] = rand() % 256; // currX hi
    view[m + 2] = rand() % 64; // currY
    let xRel = rand() % 36;
    // keep boarmans off the exact edge rows their guards special-case? no —
    // those are valid states. Keep x_rel in range only.
    void xRel;
    view[m + 3] = xRel;
    let flags = rand() % 256;
    flags = (flags & ~0x0f) | opts.type;
    if (opts.twin) flags |= 0x10; // big-monster marker on the top half
    view[m + 4] = flags;
    let aiFlags = rand() % 256;
    aiFlags = (aiFlags & ~0x1f) | (rand() % 9); // Get_Stats domain
    view[m + 5] = aiFlags;
    view[m + 6] = animCounter;
    view[m + 7] = rand() % 256; // state_flags
    view[m + 8] = rand() < 0.5 ? 0 : 1 + (rand() % 8); // hp
    view[m + 9] = aiState;
    view[m + 10] = rand() % 256; // ai_timer

    if (opts.twin) {
        // bottom half directly after the top half: sane position fields so
        // the twin writes land inside this record rather than garbage
        const t = m + 16;
        view[t + 2] = rand() % 64; // twin currY
        view[t + 3] = xRel; // twin m_x_rel mirrors the top half
        view[t + 5] = aiFlags; // twin ai_flags
    }
}

interface Case {
    ai: 'eai2' | 'eai3';
    seed: number;
}

const cases: Case[] = [];
for (let seed = 1; seed <= 300; seed++) cases.push({ ai: 'eai2', seed });
for (let seed = 1; seed <= 250; seed++) cases.push({ ai: 'eai3', seed });

describe.each([
    ['eai2', monsterAi2Local, debugMonsterAi2, cases.filter((c) => c.ai === 'eai2')],
    ['eai3', monsterAi3Local, debugMonsterAi3, cases.filter((c) => c.ai === 'eai3')],
])('stage 9c: %s parity vs real wasm', (name, tsFn, oracle, list) => {
    void name;

    it.each(list.map((c) => [c.seed] as const))(
        'seed %i matches wasm byte-for-byte',
        (seed) => {
            const isEai2 = oracle === debugMonsterAi2;
            const apply = (): number => {
                const rand = rng(seed * (isEai2 ? 15485863 : 32452843));
                applyBase(rand);

                view[0xc010] = SCRATCH & 0xff;
                view[0xc011] = SCRATCH >> 8;

                // type distribution per module
                const type = isEai2
                    ? [0, 1, 2, 3, 4, 5][rand() % 6]!
                    : rand() % 4;
                const twin = isEai2 && type === 0;

                seedMonster(rand, 0, { type, twin });
                // terminator after the used records (twin needs slot 1)
                view[SCRATCH + (twin ? 32 : 16)] = 0xff;
                view[SCRATCH + (twin ? 33 : 17)] = 0xff;

                view[0xff35] = rand() % 64; // HERO_Y
                view[0xff36] = frac(rand) < 0.15 ? 0xff : 0; // HERO_DAMAGE_THIS_FRAME

                // force deep paths periodically
                const m = SCRATCH;
                if (isEai2 && type === 0 && seed % 6 === 0) {
                    view[m + 0x15] = (view[m + 0x15] ?? 0) | 0x40; // twin hit flag
                }
                const currY = view[m + 2] ?? 0;
                if (!isEai2 && type === 2 && seed % 5 === 0) {
                    view[m + 9] = ((view[m + 9] ?? 0) & ~3) | 2; // aiming state
                    view[0xff35] = (currY + 63) & 0x3f; // hero within ±5 rows
                }
                return m;
            };

            const entropy = (seed * 46599) & 0xffff;

            apply();
            debugSetEntropy(entropy);
            const m = SCRATCH;
            if (isEai2) debugMonsterAi2(m);
            else debugMonsterAi3(m);
            const wMem = view.slice();

            apply();
            setEntropy(entropy);
            if (isEai2) monsterAi2Local(view, m);
            else monsterAi3Local(view, m);

            const d = firstDiff(wMem, view);
            if (d >= 0) {
                throw new Error(
                    `${name} seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]} (type=${(view[SCRATCH + 4] ?? 0) & 0xf})`,
                );
            }
            expect(d).toBe(-1);
        },
    );
});
