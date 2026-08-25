import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugMonsterAi4,
    debugMonsterAi5,
    debugSetEntropy,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { monsterAi4 as monsterAi4Local } from '../src/engine/eai4.js';
import { monsterAi5 as monsterAi5Local } from '../src/engine/eai5.js';
import { setEntropy } from '../src/engine/dungeon-combat.js';
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';
import { diagPath } from './diag-path.js';

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
    type: number;
    twin?: boolean; // boarman-style top half (sentry top for eai5)
}

/**
 * One monster record with the domain constraints the original guarantees:
 * - ai_flags & 0x1F kept <= 8 (Get_Stats domain; OOB in C beyond).
 * - green-egg linked mode (ai_state bit 0x40 on m+7 is seeded off here —
 *   linking runs through the hit path only) and counters left free: no
 *   table-indexed lookups exist in this module.
 */
function seedMonster(rand: () => number, idx: number, opts: SeedOpts): void {
    const m = SCRATCH + idx * 16;
    // eai4's arrow type indexes its 8-row direction tables by the FULL
    // ai_state byte; in-game it only ever holds 0..7 (set by the tables
    // themselves), so constrain accordingly to avoid C-side OOB reads.
    const aiState = opts.type === 4 ? rand() % 8 : rand() % 256;
    const animCounter = rand() % 256;

    view[m] = rand() % 256; // currX lo
    view[m + 1] = rand() % 256; // currX hi
    view[m + 2] = rand() % 64; // currY
    view[m + 3] = rand() % 36; // m_x_rel
    let flags = rand() % 256;
    flags = (flags & ~0x0f) | opts.type;
    view[m + 4] = flags;
    let aiFlags = rand() % 256;
    aiFlags = (aiFlags & ~0x1f) | (rand() % 9); // Get_Stats domain
    if (opts.twin) flags |= 0x10; // big-monster marker on the top half
    view[m + 5] = aiFlags;
    view[m + 6] = animCounter;
    view[m + 7] = rand() & ~0x40 & 0xff; // state_flags (linking bit off)
    view[m + 8] = rand() < 0.5 ? 0 : 1 + (rand() % 8); // hp
    view[m + 9] = aiState;
    view[m + 10] = rand() % 256; // ai_timer

    if (opts.twin) {
        const t = m + 16;
        view[t + 2] = rand() % 64; // twin currY
        view[t + 3] = rand() % 36; // twin m_x_rel
        view[t + 5] = aiFlags; // twin ai_flags
    }
}

interface Case {
    ai: 'eai4' | 'eai5';
    seed: number;
}


const cases: Case[] = [];
for (let seed = 1; seed <= 300; seed++) cases.push({ ai: 'eai4', seed });
for (let seed = 1; seed <= 300; seed++) cases.push({ ai: 'eai5', seed });

describe.each([
    ['eai4', monsterAi4Local, debugMonsterAi4, cases.filter((c) => c.ai === 'eai4')],
    ['eai5', monsterAi5Local, debugMonsterAi5, cases.filter((c) => c.ai === 'eai5')],
])('stage 9d: %s parity vs real wasm', (_name, tsFn, oracle, list) => {
    const isEai4 = oracle === debugMonsterAi4;

    it.each(list.map((c) => [c.seed] as const))(
        'seed %i matches wasm byte-for-byte',
        async (seed) => {
            const apply = (): void => {
                const rand = rng(seed * (isEai4 ? 2654435 : 40503));
                applyBase(rand);

                view[0xc010] = SCRATCH & 0xff;
                view[0xc011] = SCRATCH >> 8;

                // type distribution per module
                const type = isEai4
                    ? [0, 1, 2, 3, 3, 4][rand() % 6]!
                    : [0, 1, 2, 3, 4][rand() % 5]!;
                const twin = type === 0;
                seedMonster(rand, 0, { type, twin });
                view[SCRATCH + (twin ? 32 : 16)] = 0xff;
                view[SCRATCH + (twin ? 33 : 17)] = 0xff;

                view[0xff35] = rand() % 64; // HERO_Y
                view[0xff36] = frac(rand) < 0.15 ? 0xff : 0; // HERO_DAMAGE_THIS_FRAME

                // Reset engine-owned counters/lists that applyBase doesn't
                // cover — otherwise the second (TS) pass inherits the
                // first (wasm) pass's leftovers.
                view[0x9f1f] = 0; // LAST_PROJECTILE_INDEX
                view.fill(0, 0xeb80, 0xed20);
                view[0xeb80] = 0xff; // empty projectile list
            };

                const m = SCRATCH;
                const tracing = process.env.EAI_TRACE !== undefined && seed === Number(process.env.EAI_TRACE);
                const eaiLog: string[] = [];
                const logLine = (sLine: string): void => { eaiLog.push(sLine); };
                if (tracing) {
                    (globalThis as Record<string, unknown>).__eai5trace = logLine;
                }
                const wCalls: string[] = [];
                const tCalls: string[] = [];

                const snap = (): string =>
                    `${Array.from(view.slice(m, m + 12)).join(',')}|hy=${view[0xff35]}|cnt=${view[0x9f1f]}|py5=${view[0xeb81]}`;

                const entropy = (seed * 46599) & 0xffff;
                // State machines like the Sentry's windup→fire span multiple
                // frames: run several consecutive calls per seed (entropy
                // pinned once, then evolving identically on both sides).
                const repeats = ((seed % 6) + 1) * 3;
                let firstDivergedCall = -1;

                apply();
                if (tracing) logLine(`setup [${Array.from(view.slice(m, m + 12)).join(',')}]`);
                debugSetEntropy(entropy);
                for (let r = 0; r < repeats; r++) {
                    if (tracing) wCalls.push(snap());
                    if (isEai4) debugMonsterAi4(m);
                    else debugMonsterAi5(m);
                    if (tracing) wCalls.push(`post ${snap()}`);
                }
                const wMem = view.slice();

                apply();
                setEntropy(entropy);
                for (let r = 0; r < repeats; r++) {
                    if (tracing) {
                        const before = snap();
                        if (isEai4) monsterAi4Local(view, m);
                        else monsterAi5Local(view, m);
                        tCalls.push(before);
                        tCalls.push(`post ${snap()}`);
                        if (firstDivergedCall < 0) {
                            const idx = tCalls.length - 2;
                            if (wCalls[idx] !== undefined && wCalls[idx] !== tCalls[idx]) {
                                firstDivergedCall = Math.floor(idx / 2);
                            }
                        }
                    } else {
                        if (isEai4) monsterAi4Local(view, m);
                        else monsterAi5Local(view, m);
                    }
                }

                const d = firstDiff(wMem, view);
                if (d >= 0) {
                    const mod = isEai4 ? 'eai4' : 'eai5';
                    const fs = await import('node:fs');
                    fs.writeFileSync(diagPath(`trace-${mod}-${seed}.json`), JSON.stringify({
                        wasmPass: wCalls,
                        tsPass: tCalls,
                        fireLog: eaiLog,
                    }, null, 1));
                    if (eaiLog.length > 0) {
                        fs.writeFileSync(diagPath('eai45-fire.log'), eaiLog.join('\n'));
                    }
                    throw new Error(
                        `${mod} seed ${seed}: g_mem differs at ` +
                        `0x${d.toString(16)} wasm=${wMem[d]} ts=${view[d]} ` +
                        `(type=${(view[SCRATCH + 4] ?? 0) & 0xf})`,
                    );
                }
                if (eaiLog.length > 0) {
                    const fs = await import('node:fs');
                    fs.writeFileSync(
                        diagPath(`eai45-fire-${isEai4 ? 'e4' : 'e5'}-${seed}.log`),
                        eaiLog.join('\n'),
                    );
                }
                expect(d).toBe(-1);
            },
        );
    });
