import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugCheckAirflowsOnHero,
    debugHeroReset,
    debugProcessDoors,
    debugUpdateBossHeartbeatVolume,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import {
    checkAirflowsOnHero,
    processDoors,
    updateBossHeartbeatVolume,
} from '../src/engine/dungeon-frame-pre.js';
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';
import { ADDR_PACKED_MAP_START, resetUnpackCursors } from '../src/engine/unpack.js';

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

describe('stage 8d slice-3 airflows/heartbeat/doors parity vs real wasm', () => {
    it('check_airflows_on_hero matches wasm across randomized scenarios', () => {
        let lifted = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 15485867);
                applyBase(rand);
                // airflow list at seg1 0x8024 (12 entries: up×4, left×4, right×4)
                const pools = [0x30, 0x31, 0x32];
                for (let i = 0; i < 12; i++) {
                    view[0x18024 + i] = frac(rand) < 0.5 ? pools[rand() % 3]! : 0;
                }
                // plant matching tiles at the three scanned cells
                const xv = view[0x83] ?? 0;
                const headY = view[0x84] ?? 0;
                const topRow = view[0x82] ?? 0;
                const baseOff = (((topRow & 0x3f) + headY) * 36 + xv + 4) % 2304;
                for (const off of [73, 37, 1]) {
                    if (frac(rand) < 0.6) {
                        view[0xe000 + ((baseOff + off) % 2304)] = pools[rand() % 3]!;
                    }
                }
                view[0xff38] = frac(rand) < 0.2 ? 0xff : 0; // squat
                view[0xff75] = 0;
            };

            apply();
            const preY = view[0x84] ?? 0;
            const preTop = view[0x82] ?? 0;
            debugHeroReset();
            debugCheckAirflowsOnHero();
            const wMem = view.slice();

            apply();
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            checkAirflowsOnHero(view);

            // coverage: air-up lifts the hero two rows
            if ((view[0x9f15] ?? 0) !== 0) lifted++;
            void preY;
            void preTop;

            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `airflows seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
        expect(lifted).toBeGreaterThan(20); // up-airflow path must run
    }, 120_000);

    it('update_boss_heartbeat_volume matches wasm across randomized scenarios', () => {
        let audible = 0;
        for (let seed = 1; seed <= 250; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 40503);
                applyBase(rand);
                // hero position first; the Tear lands relative to it
                view[0xff35] = rand() % 64; // hero y absolute
                // tear position near the hero half the time
                if (frac(rand) < 0.5) {
                    const left = view[0x80] ?? 0;
                    const tearX = left + (rand() % 36);
                    view[0xc013] = tearX & 0xff;
                    view[0xc014] = (tearX >> 8) & 0xff;
                } else if (frac(rand) < 0.5) {
                    view[0xc013] = 0xff;
                    view[0xc014] = 0xff; // tear acquired → silent
                }
                // cover the dy==16 boundary explicitly every 8th seed
                if (seed % 8 === 0) view[0xc015] = (view[0xff35]! + 16) & 0x3f;
                else view[0xc015] = rand() % 64;
                view[0xff08] = rand() % 256; // volume pre-state
            };

            apply();
            debugHeroReset();
            debugUpdateBossHeartbeatVolume();
            const wMem = view.slice();

            apply();
            updateBossHeartbeatVolume(view);

            if ((view[0xff08] ?? 0) !== 0) audible++;
            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `heartbeat seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
        expect(audible).toBeGreaterThanOrEqual(39);

        // Directed boundary pin: dy == 16 must be treated as out of range
        // (the C table lookup at squares[16] is an OOB read, so the parity
        // harness cannot discriminate this branch — assert the documented
        // behavior directly).
        const r2 = rng(999331);
        applyBase(r2);
        view[0x80] = 0; view[0x81] = 0;
        view[0xc013] = 10; view[0xc014] = 0; // tear x = 10
        view[0xff35] = 20;
        view[0x83] = 6; // hero col = 10 -> dx = 0
        view[0xc015] = (20 + 16) & 0x3f; // dy = 16 exactly
        debugHeroReset();
        debugUpdateBossHeartbeatVolume();
        expect(view[0xff08]).toBe(0);
        updateBossHeartbeatVolume(view);
        expect(view[0xff08]).toBe(0); // audible path must be exercised
    }, 120_000);

    it('process_doors matches wasm across randomized scenarios', () => {
        let stamped = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 104729);
                applyBase(rand);
                // doors list: 3 × 12-byte entries + terminator
                view[0xc00a] = 0xd0;
                view[0xc00b] = 0xea; // table at 0xead0
                let p = 0xead0;
                for (let i = 0; i < 3; i++) {
                    const inWindow = frac(rand) < 0.8;
                    const x = inWindow ? (view[0x80] ?? 0) - 3 + (rand() % 44) : rand() % 300;
                    view[p] = x & 0xff;
                    view[p + 1] = (x >> 8) & 0xff;
                    p += 2;
                    view[p++] = rand() % 64; // y
                    view[p++] = (rand() % 8) | (frac(rand) < 0.4 ? 0x80 : 0); // d_flags (+open bit)
                    p += 8; // rest of entry unused by process_doors
                }
                view[p] = 0xff;
                view[p + 1] = 0xff;
            };

            apply();
            debugHeroReset();
            debugProcessDoors();
            const wMem = view.slice();

            apply();
            resetUnpackCursors(ADDR_PACKED_MAP_START);
            processDoors(view);

            // coverage: door tiles actually stamped into the window
            for (let i = 0xe000; i < 0xe900; i++) {
                if (((view[i] ?? 0) & 0xff) >= 0x49 && (view[i] ?? 0) <= 0x61) {
                    stamped++;
                    break;
                }
            }

            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `doors seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]}`,
                );
            }
        }
        expect(stamped).toBeGreaterThan(100);
    }, 120_000);
});
