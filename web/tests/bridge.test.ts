import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    hasWasmExport,
    initWasmFromBytes,
    inputSetKeys,
    loadMdt,
    loadSaveState,
    getGmemBase,
    getTownMdtHeader,
    getCavernMdtHeader,
    getTownName,
    getCavernName,
    getMusicTrackId,
    getTownBackgroundType,
    getTownPatId,
    getWasmMemory,
    readMemory,
    writeMemory,
} from '../src/wasm/bridge.js';
import type { ZeliardExports } from '../src/wasm/bridge.js';
import {
    ADDR_MDT,
    INPUT_FLAGS,
    MEM_SAVE_DATA,
    keyStateToBitmask,
} from '../src/wasm/memory.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));
const ZELIARD_H_PATH = fileURLToPath(new URL('../../src/zeliard.h', import.meta.url));
const TOWN_MDT_PATH = fileURLToPath(new URL('../public/game/0/cmap.mdt', import.meta.url));

// ============================================================================
// Pre-init behavior (module state is a singleton, so these must run first)
// ============================================================================

describe('bridge before initialization', () => {
    it('reports no exports', () => {
        expect(hasWasmExport('wasm_init')).toBe(false);
    });

    it('returns null memory view', () => {
        expect(getWasmMemory()).toBeNull();
    });

    it('loadMdt fails gracefully', () => {
        expect(loadMdt(new Uint8Array(4), 'x.mdt')).toBe(-1);
    });
});

// ============================================================================
// Memory map vs src/zeliard.h (drift guard)
// ============================================================================

describe('memory layout constants match zeliard.h', () => {
    const header = readFileSync(ZELIARD_H_PATH, 'utf8');

    function defineValue(name: string): number {
        const m = header.match(new RegExp(`#define\\s+${name}\\s+(0x[0-9A-Fa-f]+|\\d+)`));
        expect(m, `#define ${name} not found in zeliard.h`).toBeTruthy();
        return Number(m![1]);
    }

    it('ADDR_MDT matches', () => {
        expect(ADDR_MDT).toBe(defineValue('ADDR_MDT'));
    });

    it('MEM_SAVE_DATA matches', () => {
        expect(MEM_SAVE_DATA).toBe(defineValue('MEM_SAVE_DATA'));
    });

    it('INPUT_FLAGS bits match the InputFlags enum in zeliard.h', () => {
        // Enum values from zeliard.h (kept literal here so any change on either
        // side breaks this test instead of silently corrupting input).
        expect(INPUT_FLAGS.UP).toBe(0x01);
        expect(INPUT_FLAGS.DOWN).toBe(0x02);
        expect(INPUT_FLAGS.LEFT).toBe(0x04);
        expect(INPUT_FLAGS.RIGHT).toBe(0x08);
        expect(INPUT_FLAGS.ENTER).toBe(0x10);
        expect(INPUT_FLAGS.SPACE).toBe(0x20);
        expect(INPUT_FLAGS.ALT).toBe(0x40);
        expect(INPUT_FLAGS.ESC).toBe(0x80);
    });
});

// ============================================================================
// Pure input mapping
// ============================================================================

describe('keyStateToBitmask', () => {
    it('maps no keys to NONE', () => {
        expect(keyStateToBitmask({})).toBe(INPUT_FLAGS.NONE);
    });

    it('maps each key to its flag bit', () => {
        expect(keyStateToBitmask({ ArrowUp: true })).toBe(INPUT_FLAGS.UP);
        expect(keyStateToBitmask({ ArrowDown: true })).toBe(INPUT_FLAGS.DOWN);
        expect(keyStateToBitmask({ ArrowLeft: true })).toBe(INPUT_FLAGS.LEFT);
        expect(keyStateToBitmask({ ArrowRight: true })).toBe(INPUT_FLAGS.RIGHT);
        expect(keyStateToBitmask({ Enter: true })).toBe(INPUT_FLAGS.ENTER);
        expect(keyStateToBitmask({ Space: true })).toBe(INPUT_FLAGS.SPACE);
        expect(keyStateToBitmask({ Alt: true })).toBe(INPUT_FLAGS.ALT);
        expect(keyStateToBitmask({ Escape: true })).toBe(INPUT_FLAGS.ESC);
    });

    it('combines simultaneous keys', () => {
        expect(keyStateToBitmask({ ArrowUp: true, ArrowRight: true, Space: true })).toBe(
            INPUT_FLAGS.UP | INPUT_FLAGS.RIGHT | INPUT_FLAGS.SPACE,
        );
    });
});

// ============================================================================
// Integration against the real wasm build
// ============================================================================

describe('bridge against real zeliard.wasm', () => {
    let instance: WebAssembly.Instance;
    let exports: ZeliardExports;

    beforeAll(() => {
        // Silence the bridge's startup logging in test output.
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        instance = initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
        exports = instance.exports as unknown as ZeliardExports;
    });

    it('exposes exports and the g_mem base offset', () => {
        expect(hasWasmExport('wasm_town_full_tick')).toBe(true);
        expect(getGmemBase()).toBe(exports.get_memory_base());
        expect(getGmemBase()).toBeGreaterThan(0);
    });

    it('readMemory/writeMemory round-trip through the shared g_mem view', () => {
        const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
        writeMemory(0x20000, data);
        expect(readMemory(0x20000, 4)).toEqual(data);
    });

    it('loadMdt copies MDT bytes to ADDR_MDT', () => {
        const fake = new Uint8Array(32).fill(0xab);
        expect(loadMdt(fake, 'test.mdt')).toBe(0);
        expect(readMemory(ADDR_MDT, 32)).toEqual(fake);
    });

    it('inputSetKeys reaches the g_mem input latch bytes', () => {
        // Latch addresses from zeliard.h / data.c wasm_set_input_keys():
        //   0xFF16 ALT_SPACE (space -> bit0, alt -> bit1)
        //   0xFF17 directions (up/down/left/right bits 0..3)
        //   0xFF18 Enter flag (bit set when keys & ENTER)
        const view = () => getWasmMemory()!;

        inputSetKeys({ ArrowUp: true, Space: true });
        expect(view()[0xff17]).toBe(0x01); // up only
        expect(view()[0xff16]).toBe(0x01); // space
        expect(view()[0xff18]).toBe(0);

        inputSetKeys({ ArrowRight: true, Alt: true, Enter: true });
        expect(view()[0xff17]).toBe(0x08); // right only
        expect(view()[0xff16]).toBe(0x02); // alt
        expect(view()[0xff18]).toBe(1);

        inputSetKeys({});
        expect(view()[0xff17]).toBe(0);
        expect(view()[0xff16]).toBe(0);
        expect(view()[0xff18]).toBe(0);
    });

    it('loadSaveState zero-pads to 256 bytes at g_mem start', () => {
        const save = Uint8Array.from({ length: 10 }, (_, i) => i + 1);
        expect(loadSaveState(save)).toBe(0);
        const view = readMemory(MEM_SAVE_DATA, 256)!;
        expect(view.subarray(0, 10)).toEqual(save);
        expect(view.subarray(10, 256)).toEqual(new Uint8Array(246));
    });

    it('has fixed-size linear memory in the release build', () => {
        // The Makefile does not pass -s ALLOW_MEMORY_GROWTH, so memory cannot
        // grow at runtime. The bridge's rebuild-on-grow path is covered by the
        // LinearMemory unit tests above/below.
        expect(() => exports.memory.grow(1)).toThrow();
    });

    // -- MDT parsing on a hand-crafted fixture --------------------------------

    it('parses town MDT header, names, music id, background and pattern id', () => {
        // NOTE: pointer fields in MDT headers are seg0-absolute (the MDT sits
        // at 0xC000 in the original 64K segment), so a pointer to MDT offset
        // 0x20 is stored as 0xC020.
        const mdt = new Uint8Array(64);
        const u8 = (off: number, v: number) => (mdt[off] = v);
        const u16 = (off: number, v: number) => {
            mdt[off] = v & 0xff;
            mdt[off + 1] = (v >> 8) & 0xff;
        };

        u16(0x00, 0xc020); // town descriptor / music pointer
        u16(0x02, 40); // map_width
        u16(0x04, 0xc030); // town name info offset (+3 skips metadata)
        u8(0x06, 5); // town_id
        u16(0x07, 0x0040); // town transition table
        u16(0x09, 0x0050); // doors
        u16(0x0b, 0x0060); // dungeon entrance table
        u16(0x0d, 0x3070); // npc conversations (byte 0x0E doubles as cavern name lo)
        u16(0x0f, 0x80c0); // npc array (byte 0x0F doubles as cavern name hi)
        u16(0x11, 0x0090); // patrol boundaries
        u16(0x15, 0x1234); // word_c015
        u16(0x17, 0x00a0); // town tiles
        u8(0x20, 0x0a); // music byte: (0x0A >> 1) & 0xF = 5
        u8(0x23, 1); // background type (ympd/ckpd)
        u8(0x24, 2); // pat id
        // Name info at seg0 0xC030 (= MDT bytes 0x30..): 3 metadata bytes + Pascal string
        u8(0x30, 1);
        u8(0x31, 2);
        u8(0x32, 3);
        u8(0x33, 4); // length
        'TOWN'.split('').forEach((ch, i) => u8(0x34 + i, ch.charCodeAt(0)));

        expect(loadMdt(mdt, 'fixture.mdt')).toBe(0);

        expect(getTownMdtHeader()).toEqual({
            town_descriptor_offset: 0xc020,
            map_width: 40,
            town_name_offset: 0xc030,
            town_id: 5,
            town_transition_table: 0x40,
            doors_offset: 0x50,
            dungeon_entrance_table: 0x60,
            npc_conversations_offset: 0x3070,
            npc_array_offset: 0x80c0,
            npc_patrol_boundaries: 0x90,
            word_c015: 0x1234,
            town_tiles: 0xa0,
        });

        expect(getTownName()).toBe('TOWN');
        expect(getCavernName()).toBe('TOWN'); // same name-info cell in this fixture
        expect(getMusicTrackId()).toBe(5);
        expect(getTownBackgroundType()).toBe(1);
        expect(getTownPatId()).toBe(2);

        // Cavern header reads aligned u16s that straddle the unaligned town
        // header words — hence the shifted values below.
        expect(getCavernMdtHeader()).toEqual({
            map_width: 40,
            vert_platforms_offset: 0xc030,
            air_streams_offset: 0x4005,
            horiz_platforms_offset: 0x5000,
            doors_offset: 0x6000,
            items_check_offset: 0x7000,
            cavern_name_offset: 0xc030,
            monsters_offset: 0x9080,
        });
    });

    // -- Sanity against a real game asset -------------------------------------

    it('parses the real cmap.mdt town map consistently', () => {
        const bytes = new Uint8Array(readFileSync(TOWN_MDT_PATH));
        expect(loadMdt(bytes, 'game/0/cmap.mdt')).toBe(0);

        const header = getTownMdtHeader()!;
        expect(header.map_width).toBeGreaterThan(0);
        expect(header.town_descriptor_offset).toBeGreaterThan(0);

        const name = getTownName();
        expect(name.length).toBeGreaterThan(0);
        expect(/^[\x20-\x7e\u02BC]*$/.test(name)).toBe(true);

        const track = getMusicTrackId();
        expect(typeof track).toBe('number');
        expect(track).toBeGreaterThanOrEqual(0);
        expect(track).toBeLessThanOrEqual(15);
    });
});
