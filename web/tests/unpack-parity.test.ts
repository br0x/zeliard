import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { diagPath } from './diag-path.js';
import { fileURLToPath } from 'node:url';

import {
    debugUnpackMap,
    getWasmMemory,
    initWasmFromBytes,
    loadMdt,
} from '../src/wasm/bridge.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { unpackMap } from '../src/engine/unpack.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

const PROX_ADDR = 0xe000;
const PROX_BYTES = 36 * 64;

let view: Uint8Array;

beforeAll(() => {
    initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = getWasmMemory()!;
});

function g16(addr: number): number {
    return (view[addr] ?? 0) | ((view[addr + 1] ?? 0) << 8);
}

function loadMdtOnly(mapId: number): void {
    const cfg = DUNGEONS[String(mapId)]!;
    const bytes = new Uint8Array(readFileSync(PUBLIC + cfg.mdtPath));
    expect(loadMdt(bytes, cfg.mdtPath)).toBe(0);
}

/**
 * Run both implementations over the same inputs and compare.
 * The C oracle is wasm_debug_unpack_map: unpack_map() with none of
 * dungeon_init's side effects (entity markers etc.), so the comparison
 * isolates the decoder itself.
 */
function expectUnpackParity(mapId: number): void {
    // Deterministic viewport state (top row is masked to 6 bits by the C).
    view[0x82] = 19;
    view[0x83] = 0; // hero x view — not consumed by unpack_map

    debugUnpackMap();
    const goldenProx = view.slice(PROX_ADDR, PROX_ADDR + PROX_BYTES);
    const goldenVlt = g16(0xff31);

    view.fill(0, PROX_ADDR, PROX_ADDR + PROX_BYTES);
    view.fill(0, 0xff31, 0xff33);

    unpackMap(view);

    const diffs: string[] = [];
    for (let i = 0; i < PROX_BYTES; i++) {
        const g = goldenProx[i] ?? 0;
        const t = view[PROX_ADDR + i] ?? 0;
        if (g !== t && diffs.length < 10) {
            diffs.push(`col${i % 36} row${Math.floor(i / 36)}: wasm=${g} ts=${t}`);
        }
    }
    if (diffs.length > 0) {
        writeFileSync(diagPath('unpack-parity-diff.log'), `${mapId}: ${diffs.join('; ')}\n`, { flag: 'a' });
    }

    expect(Array.from(view.slice(PROX_ADDR, PROX_ADDR + PROX_BYTES)))
        .toEqual(Array.from(goldenProx));
    expect(g16(0xff31)).toBe(goldenVlt);
}

const DUNGEON_IDS = Object.keys(DUNGEONS)
    .map(Number)
    .sort((a, b) => a - b);

describe.each(DUNGEON_IDS)('unpack parity: dungeon %i', (mapId) => {
    beforeAll(() => {
        loadMdtOnly(mapId);
    });

    it('matches at left column 0', () => {
        view[0x80] = 0;
        view[0x81] = 0;
        expectUnpackParity(mapId);
    });

    it('matches at a mid-map left column', () => {
        const width = g16(0xc002);
        const cx = Math.max(0, Math.min(width - 36, Math.floor(width / 2)));
        view[0x80] = cx & 0xff;
        view[0x81] = (cx >> 8) & 0xff;
        expectUnpackParity(mapId);
    });

    it('matches wrapping around the right map edge', () => {
        const width = g16(0xc002);
        // Start near the end so the 36-column window must wrap.
        const cx = Math.max(0, width - 10);
        view[0x80] = cx & 0xff;
        view[0x81] = (cx >> 8) & 0xff;
        expectUnpackParity(mapId);
    });
});
