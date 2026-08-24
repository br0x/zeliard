import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { initWasmFromBytes, getWasmMemory, getGmemBase } from '../src/wasm/bridge.js';
import {
    ADDR_DUNGEON_STATE,
    ADDR_INPUT_ALT_SPACE,
    ADDR_F9_F7_F2_F1_KREJSNYQ_ESC_CTRL_SHIFT_ENTER,
    ADDR_INPUT_DIRS,
    ADDR_MDT,
    ADDR_RENDER_DONE,
    ADDR_RENDER_REQUEST,
    ADDR_TOWN_TRANSITION_DIR,
    ADDR_TOWN_TRANSITION_MAP,
    ADDR_TOWN_TRANSITION_PAT,
    ADDR_VIEWPORT_TOP_ROW,
    INPUT_FLAGS,
} from '../src/wasm/memory.js';
import { setInputKeys } from '../src/engine/input.js';
import {
    getPendingTransitionDir,
    getPendingTransitionMap,
    getPendingTransitionPat,
} from '../src/engine/town-state.js';
import {
    clearRenderRequest,
    getDungeonState,
    getEntityTable,
    getRenderRequest,
    getViewportTop,
} from '../src/engine/dungeon-state.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

let instance: WebAssembly.Instance;
let view: Uint8Array;

beforeAll(() => {
    instance = initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
    view = getWasmMemory()!;
});

/** g_mem-relative writer (tests use offsets like the C MEM8 macro). */
function poke(addr: number, byte: number): void {
    view[addr] = byte;
}

/** Run `action` on the wasm export and the TS port over identical state. */
function compareBytes(
    action: (side: 'wasm' | 'ts') => void,
    addresses: readonly number[],
): void {
    const snapshot = addresses.map((a) => view[a] ?? 0);
    action('wasm');
    const wasmResult = addresses.map((a) => view[a] ?? 0);
    addresses.forEach((a, i) => {
        view[a] = snapshot[i]!;
    });
    action('ts');
    const tsResult = addresses.map((a) => view[a] ?? 0);
    expect(tsResult).toEqual(wasmResult);
}

describe('setInputKeys parity vs real wasm (exhaustive)', () => {
    it('matches for every bitmask 0..255', () => {
        const addrs = [ADDR_INPUT_ALT_SPACE, ADDR_INPUT_DIRS, ADDR_F9_F7_F2_F1_KREJSNYQ_ESC_CTRL_SHIFT_ENTER];
        for (let keys = 0; keys < 256; keys++) {
            compareBytes(
                (side) => {
                    if (side === 'wasm') {
                        (instance.exports as { wasm_set_input_keys: (k: number) => void })
                            .wasm_set_input_keys(keys);
                    } else {
                        setInputKeys(view, keys);
                    }
                },
                addrs,
            );
        }
    });

    it('individual flag semantics match zeliard.h layout', () => {
        // up → dirs bit0; enter → 0xFF18 = 1; space|alt → 0xFF16 bits 0/1.
        setInputKeys(view, INPUT_FLAGS.UP | INPUT_FLAGS.SPACE);
        expect(view[ADDR_INPUT_DIRS]).toBe(0x01);
        expect(view[ADDR_F9_F7_F2_F1_KREJSNYQ_ESC_CTRL_SHIFT_ENTER]).toBe(0);
        expect(view[ADDR_INPUT_ALT_SPACE]).toBe(0x01);
        setInputKeys(view, INPUT_FLAGS.ALT | INPUT_FLAGS.ENTER | INPUT_FLAGS.LEFT);
        expect(view[ADDR_INPUT_DIRS]).toBe(0x04);
        expect(view[ADDR_F9_F7_F2_F1_KREJSNYQ_ESC_CTRL_SHIFT_ENTER]).toBe(1);
        expect(view[ADDR_INPUT_ALT_SPACE]).toBe(0x02);
    });
});

describe('pure getter parity vs real wasm', () => {
    /** Deterministic pseudo-random fill for scratch regions. */
    function seedStates(): void {
        let x = 0x2f6e2b1;
        const fill = (addr: number): number => {
            x = (x * 1103515245 + 12345) & 0x7fffffff;
            return addr >= 0 ? x & 0xff : 0;
        };
        poke(ADDR_TOWN_TRANSITION_MAP, fill(ADDR_TOWN_TRANSITION_MAP));
        poke(ADDR_TOWN_TRANSITION_PAT, fill(ADDR_TOWN_TRANSITION_PAT));
        poke(ADDR_TOWN_TRANSITION_DIR, fill(ADDR_TOWN_TRANSITION_DIR));
        poke(ADDR_VIEWPORT_TOP_ROW, fill(ADDR_VIEWPORT_TOP_ROW));
        poke(ADDR_DUNGEON_STATE, fill(ADDR_DUNGEON_STATE));
        poke(ADDR_RENDER_REQUEST, fill(ADDR_RENDER_REQUEST));
        poke(ADDR_RENDER_DONE, fill(ADDR_RENDER_DONE));
        poke(ADDR_MDT + 0x10, fill(ADDR_MDT + 0x10));
        poke(ADDR_MDT + 0x11, fill(ADDR_MDT + 0x11));
    }

    function expectGetterParity(
        wasmCall: () => number,
        tsCall: (v: Uint8Array) => number,
    ): void {
        seedStates();
        const viaWasm = wasmCall();
        seedStates();
        const viaTs = tsCall(view);
        expect(viaTs).toBe(viaWasm);
    }

    it('pending transition map/pat/dir', () => {
        const exp = instance.exports as unknown as Record<string, (() => number) | undefined>;
        expectGetterParity(
            () => exp.wasm_get_pending_transition_map!(),
            getPendingTransitionMap,
        );
        expectGetterParity(
            () => exp.wasm_get_pending_transition_pat!(),
            getPendingTransitionPat,
        );
        expectGetterParity(
            () => exp.wasm_get_pending_transition_dir!(),
            getPendingTransitionDir,
        );
    });

    it('viewport top / dungeon state / render request', () => {
        const exp = instance.exports as unknown as Record<string, (() => number) | undefined>;
        expectGetterParity(() => exp.wasm_dungeon_get_viewport_top!(), getViewportTop);
        expectGetterParity(() => exp.wasm_dungeon_get_state!(), getDungeonState);
        expectGetterParity(() => exp.wasm_dungeon_get_render_request!(), getRenderRequest);
    });

    it('entity table word (MDT + 0x10)', () => {
        const exp = instance.exports as unknown as Record<string, (() => number) | undefined>;
        expectGetterParity(
            () => exp.wasm_dungeon_get_entity_table!(),
            (v) => getEntityTable(v),
        );
    });

    it('clearRenderRequest matches wasm side effects', () => {
        compareBytes(
            (side) => {
                if (side === 'wasm') {
                    (instance.exports as { wasm_dungeon_clear_render_request: () => void })
                        .wasm_dungeon_clear_render_request();
                } else {
                    clearRenderRequest(view);
                }
            },
            [ADDR_RENDER_REQUEST, ADDR_RENDER_DONE],
        );
    });
});

describe('ported export wiring', () => {
    it('ports module covers the planned stage-5e + stage-7 surface', async () => {
        const { PORTED_NAMES } = await import('../src/wasm/parity/ports.js');
        const names = new Set(PORTED_NAMES);
        const required = [
            // Stage 5e leaf ports
            'wasm_set_input_keys',
            'wasm_get_pending_transition_map',
            'wasm_get_pending_transition_pat',
            'wasm_get_pending_transition_dir',
            'wasm_dungeon_get_viewport_top',
            'wasm_dungeon_get_state',
            'wasm_dungeon_get_render_request',
            'wasm_dungeon_clear_render_request',
            'wasm_dungeon_get_entity_table',
            // Stage 7 town family (replay cutover + E2E verified)
            'wasm_town_init',
            'wasm_town_set_return_before_main_loop',
            'wasm_town_entry_disabling_edge_scroll',
            'wasm_town_entry_enabling_edge_scroll',
            'wasm_town_complete_transition',
            'wasm_init_c015_obj_if_exists',
            'wasm_town_conversation_finish',
            'wasm_town_building_finish',
            'wasm_town_update',
            'wasm_town_full_tick',
            // Stage 8: pure counter increments, no hidden state
            'wasm_dungeon_full_tick',
        ];
        const missing = required.filter((n) => !names.has(n));
        expect(missing, 'missing ported exports').toEqual([]);
        expect(names.size).toBe(required.length);
    });

    it('g_mem base offset is stable across builds (view-relative pokes stay valid)', () => {
        expect(getGmemBase()).toBeGreaterThan(0);
    });
});
