import { describe, expect, it } from 'vitest';
import { LinearMemory } from '../src/wasm/bridge.js';

/**
 * Unit tests for the memory-view lifecycle, using real WebAssembly.Memory
 * instances. Growth is simulated by swapping in a larger Memory (the release
 * wasm itself has fixed-size memory, so growth cannot be driven through it).
 */
describe('LinearMemory', () => {
    it('is not live before exports exist', () => {
        const lm = new LinearMemory(() => null, () => 0);
        expect(lm.isLive).toBe(false);
    });

    it('throws when accessing views before initialization', () => {
        const lm = new LinearMemory(() => null, () => 0);
        expect(() => lm.view).toThrow(/not initialized/i);
        expect(() => lm.abs).toThrow(/not initialized/i);
    });

    it('rebuilds the g_mem view when the base becomes known', () => {
        const memory = new WebAssembly.Memory({ initial: 1 });
        let base = 0;
        const lm = new LinearMemory(() => ({ memory }), () => base);

        lm.refresh();
        expect(lm.view.length).toBe(65536); // full view while base unknown

        new Uint8Array(memory.buffer)[300] = 0x42;
        base = 256;
        expect(lm.isLive).toBe(true);
        expect(lm.view.length).toBe(65536 - 256);
        expect(lm.view[44]).toBe(0x42); // absolute byte 300 = g_mem byte 44
    });

    it('rebuilds all views when the underlying buffer is replaced (grow)', () => {
        const small = new WebAssembly.Memory({ initial: 1 });
        let exportsObj: { memory: WebAssembly.Memory } = { memory: small };
        const lm = new LinearMemory(() => exportsObj, () => 0);

        lm.refresh();
        new Uint8Array(small.buffer)[5] = 7;
        expect(lm.view[5]).toBe(7);
        expect(lm.view.length).toBe(65536);

        // Simulate memory.grow(): fresh bigger Memory carrying over contents.
        // The old ArrayBuffer is detached exactly like after a real grow.
        const big = new WebAssembly.Memory({ initial: 2 });
        new Uint8Array(big.buffer).set(new Uint8Array(small.buffer));
        exportsObj = { memory: big };

        expect(lm.isLive).toBe(true);
        expect(lm.abs.length).toBe(131072);
        expect(lm.view.length).toBe(131072);
        expect(lm.view[5]).toBe(7); // content preserved through rebuild

        // Writable past the old end through the fresh view.
        lm.view[131071] = 9;
        expect(new Uint8Array(big.buffer)[131071]).toBe(9);
    });
});
