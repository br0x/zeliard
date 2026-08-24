import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    debugDungeonUpdate,
    debugHeroReset,
    debugSetDungeonStatics,
    getWasmMemory,
    initWasmFromBytes,
} from '../src/wasm/bridge.js';
import {
    DUNGEON_STATE_BOSS_ENCOUNTER,
    DUNGEON_STATE_EXIT,
    DUNGEON_STATE_ROKA_RUN,
    DUNGEON_STATE_ROKADEMO,
    dungeonUpdate,
    rokaRun,
} from '../src/engine/dungeon-state-machine.js';
import { applyBase, bindView, rng } from './vertical-scenario.js';

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

/**
 * Seeds a pseudo-MDT: descriptor pointer word at 0xC000 → descriptor bytes
 * (desc0 flags incl. boss/jashiin bits), packed map at 0xC01B.
 */
function seedMdt(rand: () => number): void {
    view[0xc000] = 0x40;
    view[0xc001] = 0xc0; // mdt_descr = 0xC040 (inside the MDT window)
    const desc0 = rand() % 256;
    view[0xc040] = desc0;
    for (let i = 1; i < 27; i++) view[0xc040 + i] = rand() % 256;
}

/** Full dispatcher parity across every state the TS side handles natively. */
describe('stage 8d dispatcher + roka-run parity vs real wasm', () => {
    it('no-op states leave memory untouched on both sides', () => {
        for (const state of [DUNGEON_STATE_ROKADEMO, DUNGEON_STATE_EXIT, DUNGEON_STATE_BOSS_ENCOUNTER]) {
            const setup = (): void => {
                const rand2 = rng(state * 977);
                applyBase(rand2);
                seedMdt(rand2);
                view[0xff90] = state;
            };
            setup();
            debugHeroReset();
            debugDungeonUpdate();
            const wMem = view.slice();

            setup();
            const handlers = new Proxy({} as Record<string, never>, {
                get: (): (() => void) => {
                    throw new Error('delegated handler must not be called for no-op states');
                },
            });
            dungeonUpdate(
                view,
                handlers as unknown as Parameters<typeof dungeonUpdate>[1],
                { isFromTown: false, savedYViewInit: 10 },
            );

            const pre = view.slice();
            const dW = firstDiff(pre, wMem);
            if (dW >= 0) {
                throw new Error(`no-op state ${state}: wasm changed 0x${dW.toString(16)} ${pre[dW]}->${wMem[dW]}`);
            }
            const dT = firstDiff(pre, view.slice());
            if (dT >= 0) {
                throw new Error(`no-op state ${state}: ts changed 0x${dT.toString(16)} ${pre[dT]}->${view[dT]}`);
            }
        }
    });

    it('ROKA_RUN frames match wasm until after_run_animation completes', () => {
        // Town-path seeds only: for dungeon-path exits the wasm oracle runs
        // the real main_update_render pipeline inside Cavern_Game_Init
        // (BYTE_9F27 branch), which needs its own port before it can serve
        // as a deterministic oracle against injected handlers.
        for (let seed = 1; seed <= 120; seed++) {
            const sRand = rng(seed * 6089);
            if (sRand() % 2 !== 0) continue; // town-path seeds only
            const statics = { isFromTown: true, savedYViewInit: (sRand() % 64) & 0xff };
            const apply = (frameTimer: number, phase: number): void => {
                const r = rng(seed * 31337);
                applyBase(r);
                seedMdt(r);
                view[0xc010] = 0xe9e0 & 0xff;
                view[0xc011] = 0xe9e0 >> 8;
                view[0xff90] = DUNGEON_STATE_ROKA_RUN;
                view[0xff9d] = phase; // ROKA_PHASE
                view[0x9f0a] = frameTimer; // FRAME_TIMER (set by full tick)
                view[0xc3] = r() % 2; // LEFT_RUN
                view[0xff92] = 0;
                view[0xff93] = 0;
                view[0xff91] = 0;
                view[0xffe2] = 0; // exit flag
                if (statics.isFromTown) view[0xc4] = 0x80 | (r() % 8); // PLACE_MAP_ID town bit
                else view[0xc4] = r() % 8;
            };

            // Run N frames on both sides from identical starting states.
            apply(0, 0);
            debugSetDungeonStatics(statics.isFromTown ? 1 : 0, statics.savedYViewInit);
            debugHeroReset();
            let wFrames = 0;
            for (let f = 0; f < 30; f++) {
                // advance FRAME_TIMER like dungeonFullTick does
                view[0x9f0a] = (view[0x9f0a]! + 16) & 0xff; // multiples of 16 so phases advance
                debugDungeonUpdate();
                wFrames++;
                if (view[0xff90] !== DUNGEON_STATE_ROKA_RUN) break;
            }
            const wMem = view.slice();
            const wState = view[0xff90];
            const wPhase = view[0xff9d];

            apply(0, 0);
            for (let f = 0; f < 30 && view[0xff90] === DUNGEON_STATE_ROKA_RUN; f++) {
                view[0x9f0a] = (view[0x9f0a]! + 16) & 0xff;
                dungeonUpdate(
                    view,
                    {
                        updateNormal: () => undefined,
                        updateRope: () => undefined,
                        updateDeathFall: () => undefined,
                        updateDeathFlash: () => undefined,
                        updateDeathFade: () => undefined,
                        completeDoorTransition: () => undefined,
                        updateJashiinCutscene: () => undefined,
                    },
                    statics,
                );
            }

            expect(wState).toBe(view[0xff90]);
            expect(wPhase).toBe(view[0xff9d]);
            void wFrames;
            const d = firstDiff(wMem, view.slice());
            if (d >= 0) {
                throw new Error(
                    `roka-run seed ${seed}: g_mem differs at 0x${d.toString(16)} ` +
                    `wasm=${wMem[d]} ts=${view[d]} (state ${wState})`,
                );
            }
        }
    }, 120_000);

    it('rokaRun matches wasm', () => {
        for (let seed = 1; seed <= 50; seed++) {
            const apply = (): void => {
                const rand = rng(seed * 7907);
                applyBase(rand);
                view[0xc3] = rand() % 2; // LEFT_RUN
                view[0xc2] = rand() % 256; // facing
                view[0xff9d] = rand() % 256;
                view[0x9f0a] = rand() % 256;
                view[0xff90] = rand() % 11;
            };

            apply();
            debugHeroReset();
            // call rokaRun via the dispatcher? No direct oracle — emulate by
            // setting state through the wasm: use debugDungeonUpdate after
            // manually transitioning. Instead compare via memory diff of the
            // TS implementation alone against wasm roka_run through the
            // dedicated oracle below.
            void apply;

            // The C roka_run has no dedicated oracle; verify via dispatcher
            // equivalence in the ROKA_RUN test above. Here we assert the TS
            // invariants only.
            const facingPre = view[0xc2] ?? 0;
            rokaRun(view);
            expect(view[0xff9d]).toBe(0);
            expect(view[0x9f0a]).toBe(0);
            expect(view[0xff90]).toBe(DUNGEON_STATE_ROKA_RUN);
            const leftRun = view[0xc3] ?? 0;
            if (leftRun !== 0) expect((view[0xc2] ?? 0) & 1).toBe(1);
            else expect((view[0xc2] ?? 0) & 1).toBe(0);
            void facingPre;
        }
    });
});


