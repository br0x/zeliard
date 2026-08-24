import { beforeAll, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugCheckFloor,
    debugGetPackedCursors,
    debugHeroReset,
    debugLandAfterJump,
    debugMovePlatformDown,
    debugPlatformCollapse,
    debugPlatformUp,
    debugSlopeAssist,
    debugTryClimbRope,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import { ADDR_PACKED_MAP_START, resetUnpackCursors, unpackCursors } from '../src/engine/unpack.js';
import {
    checkFloorForLanding,
    heroCollapsePlatform,
    landAfterJump,
    movePlatformDownDamageMonster,
    slopeAssistOnLanding,
    tryClimbRope,
    tryMovePlatformUp,
} from '../src/engine/dungeon-vertical.js';
import { PROX, PROX_BYTES, applyBase, bindView, frac, heroBaseOff, placePlatform, rng } from './vertical-scenario.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

let view: Uint8Array;

beforeAll(() => {
    initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = getWasmMemory()!;
    bindView(view);
});

/** Full-g_mem comparison: strictest possible observable-behavior check. */
function firstDiff(a: Uint8Array, b: Uint8Array): number {
    for (let i = 0; i < a.length; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return i;
    }
    return -1;
}

interface RunResult {
    ret: number | null;
    mem: Uint8Array;
    cursorL: number;
    cursorR: number;
}

function runWasm(fnName: string, call: () => number | null): RunResult {
    debugHeroReset();
    const ret = call();
    debugGetPackedCursors();
    const r: RunResult = {
        ret,
        mem: view.slice(),
        cursorL: ((view[0xb101] ?? 0) << 8) | (view[0xb100] ?? 0),
        cursorR: ((view[0xb103] ?? 0) << 8) | (view[0xb102] ?? 0),
    };
    void fnName;
    return r;
}

function runTs(call: (g: Uint8Array) => number | void): RunResult {
    resetUnpackCursors(ADDR_PACKED_MAP_START);
    const ret = call(view);
    return {
        ret: typeof ret === 'number' ? ret : null,
        mem: view.slice(),
        cursorL: unpackCursors.proxLeft,
        cursorR: unpackCursors.proxRight,
    };
}

function expectParity(seed: number, tag: string, w: RunResult, t: RunResult): void {
    if (w.ret !== t.ret) {
        throw new Error(`${tag} seed ${seed}: return wasm=${w.ret} ts=${t.ret}`);
    }
    if (w.cursorL !== t.cursorL || w.cursorR !== t.cursorR) {
        throw new Error(
            `${tag} seed ${seed}: cursors wasm L=0x${w.cursorL.toString(16)} R=0x${w.cursorR.toString(16)} ts L=0x${t.cursorL.toString(16)} R=0x${t.cursorR.toString(16)}`,
        );
    }
    const d = firstDiff(w.mem, t.mem);
    if (d >= 0) {
        const ctxW = Array.from(w.mem.slice(d - 2, d + 3))
            .map((x) => x?.toString(16))
            .join(' ');
        const ctxT = Array.from(t.mem.slice(d - 2, d + 3))
            .map((x) => x?.toString(16))
            .join(' ');
        throw new Error(
            `${tag} seed ${seed}: g_mem differs at 0x${d.toString(16)} wasm=[${ctxW}] ts=[${ctxT}]`,
        );
    }
}

describe('stage 8b slice-3 vertical mechanics parity vs real wasm', () => {
    it('try_climb_rope matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 250; seed++) {
            const applyWithRope = (): void => {
                const rand = rng(seed * 2654435761);
                applyBase(rand);
                // bias a rope tile onto/near the hero head cell
                const baseOff = heroBaseOff();
                const spot = rand() % 3; // head, left, right
                const tile = frac(rand) < 0.75 ? (1 + (rand() % 2)) : 6;
                view[PROX + ((baseOff + (spot === 0 ? 1 : spot === 1 ? 0 : 2)) % PROX_BYTES)] = tile;
            };

            applyWithRope();
            const w = runWasm('try_climb_rope', () => {
                debugTryClimbRope();
                return null;
            });

            applyWithRope();
            const t = runTs((g) => tryClimbRope(g));

            expectParity(seed, 'climb-rope', w, t);
        }
    }, 30_000);

    it('try_move_platform_up matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 150; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 40503);
                applyBase(rand);
                placePlatform(rand, 'vertical');
                view[0xff39] = frac(rand) < 0.85 ? 0 : 0xff; // mostly not on rope
            };

            apply();
            const w = runWasm('platform_up', () => debugPlatformUp());

            apply();
            const t = runTs((g) => (tryMovePlatformUp(g) ? 0xff : 0));

            expectParity(seed, 'platform-up', w, t);
        }
    }, 30_000);

    it('hero_collapse_platform matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 150; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 1046527);
                applyBase(rand);
                placePlatform(rand, 'collapsing');
            };

            apply();
            const w = runWasm('platform_collapse', () => {
                debugPlatformCollapse();
                return null;
            });

            apply();
            const t = runTs((g) => {
                heroCollapsePlatform(g);
            });

            expectParity(seed, 'collapse', w, t);
        }
    }, 30_000);

    it('move_platform_down_damage_monster matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 150; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 6971);
                applyBase(rand);
                placePlatform(rand, 'vertical', { markerBelow: frac(rand) < 0.5 });
            };

            apply();
            const w = runWasm('platform_down', () => debugMovePlatformDown());

            apply();
            const t = runTs((g) => (movePlatformDownDamageMonster(g) ? 0xff : 0));

            expectParity(seed, 'platform-down', w, t);
        }
    }, 30_000);

    it('check_floor_for_landing matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 15485863);
                applyBase(rand);
                // bias landing-relevant cells below the feet
                const feetOff = (heroBaseOff() + 109) % PROX_BYTES;
                const pool = [0, 0, 6, 0xfd, 0x40, 1];
                view[PROX + feetOff] = pool[rand() % pool.length]!;
                view[PROX + ((feetOff + PROX_BYTES - 1) % PROX_BYTES)] =
                    pool[rand() % pool.length]!;
            };

            apply();
            const w = runWasm('check_floor', () => debugCheckFloor());

            apply();
            const t = runTs((g) => checkFloorForLanding(g));

            expectParity(seed, 'check-floor', w, t);
        }
    }, 30_000);

    it('land_after_jump matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 120; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 2251);
                applyBase(rand);
            };

            apply();
            const w = runWasm('land_after_jump', () => debugLandAfterJump());

            apply();
            const t = runTs((g) => (landAfterJump(g) ? 1 : 0));

            expectParity(seed, 'land', w, t);
        }
    }, 30_000);

    it('slope_assist_on_landing matches wasm across randomized scenarios', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 32452843);
                applyBase(rand);
                // put a slope tile under the hero's feet half the time
                if (frac(rand) < 0.5) {
                    const probeOff = (heroBaseOff() + 2 * 36 + 1) % PROX_BYTES;
                    view[PROX + probeOff] = [0x50, 0x51, 0x52, 0x53][rand() % 4]!;
                }
            };

            apply();
            const w = runWasm('slope_assist', () => {
                debugSlopeAssist();
                return null;
            });

            apply();
            const t = runTs((g) => {
                slopeAssistOnLanding(g);
            });

            expectParity(seed, 'slope-assist', w, t);
        }
    }, 30_000);
});
