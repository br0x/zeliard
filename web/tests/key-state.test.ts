import { describe, expect, it } from 'vitest';
import { clearKeys, keys, setKeyState } from '../src/input/key-state.js';

describe('setKeyState', () => {
    it('sets and clears each tracked key by e.code', () => {
        clearKeys();

        expect(setKeyState('ArrowUp', true)).toBe(true);
        expect(setKeyState('AltLeft', true)).toBe(true);
        setKeyState('Space', true);
        expect(keys.ArrowUp).toBe(true);
        expect(keys.Alt).toBe(true);
        expect(keys.Space).toBe(true);

        setKeyState('ArrowUp', false);
        setKeyState('AltRight', false); // either Alt code clears the flag
        expect(keys.ArrowUp).toBe(false);
        expect(keys.Alt).toBe(false);

        // keyup clears Space again
        setKeyState('Space', false);
        expect(keys.Space).toBe(false);
    });

    it('ignores untracked codes without touching state', () => {
        clearKeys();
        setKeyState('KeyZ', true);
        setKeyState('F1', true);
        expect(setKeyState('F5', true)).toBe(false);
        expect(Object.values(keys).every((v) => v === false || v === 0)).toBe(true);
    });

    it('clearKeys resets everything', () => {
        setKeyState('ArrowLeft', true);
        setKeyState('Enter', true);
        clearKeys();
        expect(keys.ArrowLeft).toBe(false);
        expect(keys.Enter).toBe(false);
    });
});
