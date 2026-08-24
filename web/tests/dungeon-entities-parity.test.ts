import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { debugCheckCollision, debugMonsterMove, getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import {
    checkCollisionInDirection,
    monsterMoveInDirection,
} from '../src/engine/dungeon-entities.js';


const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

const PROX = 0xe000;
const PROX_BYTES = 36 * 64;
const MONSTER = 0xa400; // scratch record address (not used by boot state)
const RECORD_BYTES = 8;

let view: Uint8Array;

let instance: WebAssembly.Instance;

beforeAll(() => {
    instance = initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = getWasmMemory()!;
});

/** Deterministic LCG so failures are reproducible. */
function rng(seed: number): () => number {
    let x = seed >>> 0;
    return () => {
        x = (x * 1664525 + 1013904223) >>> 0;
        return x;
    };
}

interface Scenario {
    cavernLevel: number;
    mapWidth: number;
    accessory: number;
}

function applyScenario(rand: () => number, sc: Scenario): void {
    // Passable tile list (24 bytes at seg1:0x8000): small tile ids.
    for (let i = 0; i < 24; i++) view[0x18000 + i] = (rand() * 0x50) & 0xff;
    // Airflow lists: 4 up + 4 left + 4 right, 0-terminated groups.
    for (let i = 0; i < 12; i++) view[0x18024 + i] = rand() < 0.3 ? ((rand() * 0x50) & 0xff) : 0;
    // Cavern level + accessory (level 4 slip check uses accessory).
    view[0xc012] = sc.cavernLevel;
    view[0x9e] = sc.accessory;
    // Map width word.
    view[0xc002] = sc.mapWidth & 0xff;
    view[0xc003] = (sc.mapWidth >> 8) & 0xff;
    // Proximity window: full byte range to stress blocking/marker paths.
    for (let i = 0; i < PROX_BYTES; i++) view[PROX + i] = (rand() * 256) & 0xff;
    // Monster record: x within map, y in window, x_rel anywhere in 0..35.
    const x = Math.floor(rand() * sc.mapWidth);
    view[MONSTER] = x & 0xff;
    view[MONSTER + 1] = (x >> 8) & 0xff;
    view[MONSTER + 2] = (rand() * 64) & 0x3f;
    view[MONSTER + 3] = (rand() * 36) & 0xff;
    view[MONSTER + 4] = rand() * 256;
    view[MONSTER + 5] = rand() * 256;
    view[MONSTER + 6] = rand() * 256;
    view[MONSTER + 7] = rand() * 256;
}

function recordSnapshot(): number[] {
    return Array.from(view.slice(MONSTER, MONSTER + RECORD_BYTES));
}

function restoreRecord(snap: number[]): void {
    view.set(snap, MONSTER);
}

describe('stage 8a movement/collision parity vs real wasm', () => {
    it('monster_move_in_direction matches wasm across randomized scenarios', () => {
        let checked = 0;
        for (let seed = 1; seed <= 120; seed++) {
            const rand = rng(seed * 7919);
            const sc: Scenario = {
                cavernLevel: [0, 1, 4, 5, 6, 7][seed % 6]!,
                mapWidth: 40 + Math.floor(rand() * 160),
                accessory: [0, 4][seed % 2]!,
            };
            applyScenario(rand, sc);
            for (let dir = 0; dir < 8; dir++) {
                const snap = recordSnapshot();
                const viaWasm = debugMonsterMove(MONSTER, dir);
                const wasmAfter = recordSnapshot();
                restoreRecord(snap);
                const viaTs = monsterMoveInDirection(view, MONSTER, dir);
                expect(viaTs).toBe(viaWasm);
                expect(recordSnapshot()).toEqual(wasmAfter);
                checked++;
            }
        }
        expect(checked).toBe(960);
    });

    it('check_collision_in_direction matches wasm across randomized scenarios', () => {
        let checked = 0;
        for (let seed = 500; seed <= 700; seed++) {
            const rand = rng(seed * 104729);
            const sc: Scenario = {
                cavernLevel: [0, 3, 5, 7][seed % 4]!,
                mapWidth: 40 + Math.floor(rand() * 160),
                accessory: [0, 4][seed % 2]!,
            };
            applyScenario(rand, sc);
            for (let dir = 0; dir < 8; dir++) {
                const viaWasm = debugCheckCollision(MONSTER, dir);
                const viaTs = checkCollisionInDirection(view, MONSTER, dir);
                expect(viaTs & 0xff).toBe(viaWasm & 0xff);
                checked++;
            }
        }
        expect(checked).toBe(1608);
    });
});


describe('dungeon full tick parity', () => {
    it('counter increments match wasm exactly', async () => {
        const { dungeonFullTick } = await import('../src/engine/dungeon-tick.js');
        const exp = instance.exports as unknown as Record<string, () => void>;
        // deterministic starting counters
        view[0xff1a] = 0xf8;
        view[0xff50] = 0xfd;
        view[0xff51] = 0x02;
        view[0xff1b] = 0xfe;
        view[0xff1c] = 0x11;
        const before = {
            f: [view[0xff1a], view[0xff1b], view[0xff1c]],
            t: [view[0xff50], view[0xff51]],
        };
        (exp['wasm_dungeon_full_tick'] as () => void)();
        const wasmAfter = [view[0xff1a], view[0xff1b], view[0xff1c], view[0xff50], view[0xff51]];
        // restore
        view[0xff1a] = before.f[0]!;
        view[0xff1b] = before.f[1]!;
        view[0xff1c] = before.f[2]!;
        view[0xff50] = before.t[0]!;
        view[0xff51] = before.t[1]!;
        dungeonFullTick(view);
        expect([view[0xff1a], view[0xff1b], view[0xff1c], view[0xff50], view[0xff51]]).toEqual(wasmAfter);
    });
});
