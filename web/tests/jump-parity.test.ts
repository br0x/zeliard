import { beforeAll, expect, it } from 'vitest';
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));
const LOG = '/tmp/opencode/jump-parity.log';

let view: Uint8Array;

beforeAll(async () => {
    vi.resetModules();
    const mod = await import('../src/wasm/bridge.js');
    mod.initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = mod.getWasmMemory()!;
});

/** Bytes the jump handler may read or mutate. */
const WATCHED = [
    0x9f20, 0xff39, 0xff38, 0x9f09, 0x9f0d, 0x9f0c, 0xff42, 0xff3d,
    0xe7, 0xc2, 0x84, 0x82, 0xff31, 0xff32,
] as const;

function rng(seed: number): () => number {
    let x = seed >>> 0;
    return () => {
        x = (x * 1664525 + 1013904223) >>> 0;
        return x;
    };
}

function applyScenario(rand: () => number): void {
    const tilePool = [0, 1, 2, 6];
    for (let i = 0; i < 24; i++) view[0x18000 + i] = tilePool[rand() % 4] ?? 0;
    const afPool = [3];
    for (let i = 0; i < 12; i++) view[0x18024 + i] = rand() % 5 === 0 ? (afPool[0] ?? 0) : 0;
    view[0xc002] = 94; // map width
    // jump-relevant state
    view[0x9f20] = Math.floor(rand() * 12); // slide ticks
    view[0xff39] = rand() < 0.2 ? 1 : 0; // on rope
    view[0xff38] = rand() < 0.2 ? 1 : 0; // squat
    view[0x9f09] = rand() < 0.5 ? 0 : Math.floor(rand() * 5); // jump step counter
    view[0x9f0d] = rand() < 0.5 ? 2 : 4; // jump height (feruza shoes)
    view[0x84] = rand() < 0.15 ? 6 : 7 + Math.floor(rand() * 25); // head y view (near-top case!)
    view[0xc2] = Math.floor(rand() * 256); // facing (up bit matters)
    view[0xe7] = Math.floor(rand() * 256); // anim phase
    const topRow = Math.floor(rand() * 40);
    const vlt = 0xe000 + (topRow & 0x3f) * 36;
    view[0xff31] = vlt & 0xff;
    view[0xff32] = (vlt >> 8) & 0xff;
    // prox window with blocking/marker mix
    const tileMix = [0, 1, 2, 6, 0xfd];
    for (let i = 0; i < 2304; i++) view[0xe000 + i] = rand() < 0.5 ? (tileMix[rand() % 5] ?? 0) : Math.floor(rand() * 256);
}

function watchedSnapshot(): Array<[number, number]> {
    return WATCHED.map((a) => [a, view[a] ?? 0] as [number, number]);
}

it('jump_press_handler parity vs real wasm', async () => {
    const { jumpPressHandler } = await import('../src/engine/dungeon-hero.js');
    const { debugJumpPress } = await import('../src/wasm/bridge.js');

    let checked = 0;
    const lines: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
        // wasm pass
        applyScenario(rng(seed * 2654435761));
        debugJumpPress();
        const viaWasm = watchedSnapshot();

        // restore + ts pass (identical fresh rng)
        applyScenario(rng(seed * 2654435761));
        jumpPressHandler(view);

        const t = Object.fromEntries(watchedSnapshot());
        for (const [addr, wv] of viaWasm) {
            const tv = t[addr];
            if (wv !== tv) {
                lines.push(`seed ${seed}: addr 0x${addr.toString(16)} wasm=${wv} ts=${tv}`);
                break;
            }
        }
        checked++;
    }
    appendFileSync(LOG, `checked=${checked}\n${lines.join('\n')}\n`);
    if (lines.length > 0) console.error('JUMP PARITY FAILURES:\n' + lines.slice(0, 10).join('\n'));
    expect(lines.filter((l) => l.startsWith('seed')).length).toBe(0);
}, 30_000);
