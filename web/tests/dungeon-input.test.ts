import { describe, expect, it } from 'vitest';
import {
    ADDR_INPUT_ALT_SPACE,
    ADDR_INPUT_DIRS,
    ADDR_JUMP_PHASE_FLAGS,
    ADDR_SOUND_FX_REQUEST,
    ADDR_SPACEBAR_LATCH,
    ADDR_SLOPE_DIRECTION,
    ADDR_SWORD_HIT_TYPE,
    ADDR_SWORD_MOVEMENT_PHASE,
    ADDR_SWORD_SWING_FLAG,
    ADDR_SWORD_TYPE,
    INPUT_FLAGS,
} from '../src/core/memory.js';
import { inputHandling } from '../src/engine/dungeon-input.js';
import { setInputKeys } from '../src/engine/input.js';

describe('inputHandling sword downward thrust', () => {
    function makeDungeonMemory(): Uint8Array {
        const g = new Uint8Array(0x10000);
        g[ADDR_SWORD_TYPE] = 1;
        g[ADDR_JUMP_PHASE_FLAGS] = 0x7f;
        return g;
    }

    it('uses the Space bit from ADDR_INPUT_ALT_SPACE to start downward thrust', () => {
        const g = makeDungeonMemory();
        setInputKeys(g, INPUT_FLAGS.SPACE | INPUT_FLAGS.DOWN);

        inputHandling(g);

        expect(g[ADDR_INPUT_ALT_SPACE]).toBe(0x01);
        expect(g[ADDR_INPUT_DIRS]).toBe(0x02);
        expect(g[ADDR_SWORD_HIT_TYPE]).toBe(2);
        expect(g[ADDR_SWORD_MOVEMENT_PHASE]).toBe(2);
        expect(g[ADDR_SWORD_SWING_FLAG]).toBe(0xff);
        expect(g[ADDR_SOUND_FX_REQUEST]).toBe(4);
    });

    it('does not treat Alt as Space for downward thrust', () => {
        const g = makeDungeonMemory();
        setInputKeys(g, INPUT_FLAGS.ALT | INPUT_FLAGS.DOWN);

        inputHandling(g);

        expect(g[ADDR_INPUT_ALT_SPACE]).toBe(0x02);
        expect(g[ADDR_SLOPE_DIRECTION]).toBe(0);
        expect(g[ADDR_SPACEBAR_LATCH]).toBe(0);
        expect(g[ADDR_SWORD_HIT_TYPE]).toBe(0);
        expect(g[ADDR_SWORD_SWING_FLAG]).toBe(0);
    });
});
