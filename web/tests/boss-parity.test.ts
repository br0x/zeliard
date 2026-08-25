import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugCangrejoAi,
    debugCangrejoReset,
    debugPulpoAi,
    debugPulpoReset,
    debugPolloAi,
    debugPolloReset,
    debugAgarAi,
    debugAgarReset,
    debugVistaAi,
    debugVistaReset,
    debugTarsoAi,
    debugTarsoReset,
    debugSetEntropy,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { cangrejoAi, cangrejoAiReset } from '../src/engine/boss-crab.js';
import { pulpoAi, pulpoAiReset } from '../src/engine/boss-tako.js';
import { polloAi, polloAiReset } from '../src/engine/boss-tori.js';
import { agarAi, agarAiReset } from '../src/engine/boss-agar.js';
import { vistaAi, vistaAiReset } from '../src/engine/boss-vista.js';
import { tarsoAi, tarsoAiReset } from '../src/engine/boss-tarso.js';
import { setEntropy } from '../src/engine/dungeon-combat.js';
import { applyBossScenario, SCRATCH } from './boss-scenario.js';
import { frac, rng } from './vertical-scenario.js';
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

interface BossDef {
    name: string;
    kind: 'crab' | 'tako' | 'tori' | 'agar' | 'vista' | 'tarso';
    tsFn: (g: Uint8Array, m: number) => void;
    oracle: (m: number) => void;
    resetTs: () => void;
    resetWasm: () => void;
}

const BOSSES: BossDef[] = [
    { name: 'vista', kind: 'vista', tsFn: vistaAi, oracle: debugVistaAi, resetTs: vistaAiReset, resetWasm: debugVistaReset },
    { name: 'cangrejo', kind: 'crab', tsFn: cangrejoAi, oracle: debugCangrejoAi, resetTs: cangrejoAiReset, resetWasm: debugCangrejoReset },
    { name: 'pulpo', kind: 'tako', tsFn: pulpoAi, oracle: debugPulpoAi, resetTs: pulpoAiReset, resetWasm: debugPulpoReset },
    { name: 'pollo', kind: 'tori', tsFn: polloAi, oracle: debugPolloAi, resetTs: polloAiReset, resetWasm: debugPolloReset },
    { name: 'agar', kind: 'agar', tsFn: agarAi, oracle: debugAgarAi, resetTs: agarAiReset, resetWasm: debugAgarReset },
    { name: 'tarso', kind: 'tarso', tsFn: tarsoAi, oracle: debugTarsoAi, resetTs: tarsoAiReset, resetWasm: debugTarsoReset },
];

describe.each(BOSSES)('stage 9f: %s boss parity vs real wasm', (boss) => {
    /**
     * External hit-detection stand-in: after each AI frame, flag one live
     * pseudo-monster entry as struck (ai_flags |= 0x40). In-game this is
     * the sword-swing code; without it, the seeded last-frame hits are the
     * only ones ever processed (renders rewrite .ai_flags fresh each
     * frame), and the provoked/flinch/damage chains never run.
     */
    const injectHit = (seed: number, tick: number): void => {
        const rand = rng(seed * 977 + tick * 7919);
        if (frac(rand) >= 0.35) return;
        let di = SCRATCH;
        const candidates: number[] = [];
        while (((view[di] ?? 0) | ((view[di + 1] ?? 0) << 8)) !== 0xffff) {
            candidates.push(di);
            di += 16;
        }
        if (candidates.length === 0) return;
        const pick = candidates[rand() % candidates.length]!;
        view[pick + 5] = ((view[pick + 5] ?? 0) | 0x40) & 0xff;
    };

    it.each(Array.from({ length: Number(process.env.SEED_HI ?? 300) }, (_, i) => i + 1))(
        'seed %i matches wasm byte-for-byte',
        (seed) => {
            // Death sequences run ~40 frames; multi-phase approach/recoil/
            // volley chains span dozens of ticks — give each seed a long
            // budget. Overlay statics are reset per pass on BOTH sides.
            const repeats = Number(process.env.REPEATS ?? 48);

            applyBossScenario(view, seed, { kind: boss.kind });
            boss.resetWasm();
            debugSetEntropy((seed * 46599) & 0xffff);
            for (let r = 0; r < repeats; r++) {
                // Advance ANIM_TIMER deterministically: get_random mixes it
                // in, so a frozen timer makes the roll stream a fixed
                // arithmetic progression whose trigger positions correlate
                // with frame parity (starving odd-phase coverage).
                view[0xff1b] = (seed * 13 + r * 7) & 0xff;
                view[0xff1c] = (seed * 5 + r * 3) & 0xff;
                boss.oracle(SCRATCH);
                injectHit(seed, r);
            }
            const wMem = view.slice();
            applyBossScenario(view, seed, { kind: boss.kind });
            boss.resetTs();
            setEntropy((seed * 46599) & 0xffff);
            for (let r = 0; r < repeats; r++) {
                view[0xff1b] = (seed * 13 + r * 7) & 0xff;
                view[0xff1c] = (seed * 5 + r * 3) & 0xff;
                boss.tsFn(view, SCRATCH);
                injectHit(seed, r);
            }

            const d = firstDiff(wMem, view);
            if (d >= 0) {
                writeFileSync(
                    diagPath(`trace-boss-${boss.name}-${seed}.json`),
                    JSON.stringify({ firstDiffAddr: `0x${d.toString(16)}` }, null, 1),
                );
                throw new Error(
                    `${boss.name} seed ${seed}: g_mem differs at ` +
                    `0x${d.toString(16)} wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
            expect(d).toBe(-1);
        },
    );
});
