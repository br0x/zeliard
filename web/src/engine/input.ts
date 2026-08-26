/**
 * input.ts — TS port of the polled-input latch fan-out.
 *
 * Port of set_input_keys (src/data.c). Pure function of its bitmask
 * argument and the g_mem view: no hidden state.
 *
 * C reference (data.c):
 *   dirs = bits 0..3 of keys, verbatim
 *   ADDR_F9_F7_F2_F1_KREJSNYQ_ESC_CTRL_SHIFT_ENTER = Enter bit ? 1 : 0
 *   ADDR_INPUT_ALT_SPACE                           = space bit | alt bit << 1
 */

import {
    ADDR_F9_F7_F2_F1_KREJSNYQ_ESC_CTRL_SHIFT_ENTER,
    ADDR_INPUT_ALT_SPACE,
    ADDR_INPUT_DIRS,
    INPUT_FLAGS,
} from '../core/memory.js';

export function setInputKeys(gmem: Uint8Array, keys: number): void {
    let dirs = 0;
    if (keys & INPUT_FLAGS.UP) dirs |= 0x01;
    if (keys & INPUT_FLAGS.DOWN) dirs |= 0x02;
    if (keys & INPUT_FLAGS.LEFT) dirs |= 0x04;
    if (keys & INPUT_FLAGS.RIGHT) dirs |= 0x08;

    gmem[ADDR_INPUT_DIRS] = dirs;
    gmem[ADDR_F9_F7_F2_F1_KREJSNYQ_ESC_CTRL_SHIFT_ENTER] =
        keys & INPUT_FLAGS.ENTER ? 1 : 0;
    gmem[ADDR_INPUT_ALT_SPACE] =
        ((keys & INPUT_FLAGS.SPACE ? 1 : 0) |
            (keys & INPUT_FLAGS.ALT ? 2 : 0));
}
