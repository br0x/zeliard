// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
    SAVE_PREFIX,
    SAVE_SIZE,
    decodeSave,
    deleteGameFromSlot,
    encodeSave,
    getSaveSlotNames,
    loadGame,
    loadGameFromSlot,
    saveGame,
    saveGameToSlot,
    type SaveStorage,
} from '../src/platform/save.js';

/** In-memory Storage fake mirroring the localStorage subset we use. */
function fakeStorage(): SaveStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => void data.set(k, v),
        removeItem: (k) => void data.delete(k),
        get length() { return data.size; },
        key: (i) => [...data.keys()][i] ?? null,
    };
}

describe('save codec', () => {
    it('round-trips arbitrary bytes', () => {
        const bytes = Uint8Array.from({ length: SAVE_SIZE }, (_, i) => (i * 37) % 256);
        expect(decodeSave(encodeSave(bytes))).toEqual(bytes);
    });

    it('rejects invalid base64', () => {
        expect(decodeSave('!!!not base64!!!')).toBeNull();
    });

    it('encodes to the same string as the legacy scheme', () => {
        // Legacy: String.fromCharCode(...data) then btoa
        const bytes = Uint8Array.from([0, 1, 2, 250, 255]);
        expect(encodeSave(bytes)).toBe(btoa(String.fromCharCode(...bytes)));
    });
});

describe('slot storage', () => {
    it('saves, lists, loads and deletes slots', () => {
        const storage = fakeStorage();
        const data = Uint8Array.from({ length: 16 }, (_, i) => i);
        saveGameToSlot('castle', data, storage);
        expect(getSaveSlotNames(storage)).toEqual(['castle']);
        expect(loadGameFromSlot('castle', storage)).toEqual(data);

        deleteGameFromSlot('castle', storage);
        expect(getSaveSlotNames(storage)).toEqual([]);
        expect(loadGameFromSlot('castle', storage)).toBeNull();
    });

    it('lists multiple slots sorted and prefixed correctly', () => {
        const storage = fakeStorage();
        saveGameToSlot('b', new Uint8Array(2), storage);
        saveGameToSlot('a', new Uint8Array(2), storage);
        expect(storage.data.has(`${SAVE_PREFIX}a`)).toBe(true);
        expect(getSaveSlotNames(storage)).toEqual(['a', 'b']);
    });

    it('returns null for missing or corrupt slots', () => {
        const storage = fakeStorage();
        expect(loadGameFromSlot('nope', storage)).toBeNull();
        storage.data.set(`${SAVE_PREFIX}bad`, '@@@');
        expect(loadGameFromSlot('bad', storage)).toBeNull();
    });
});

describe('legacy fixed-key API', () => {
    it('saveGame rejects wrong sizes without writing', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(saveGame(new Uint8Array(10))).toBe(false);
        spy.mockRestore();
        expect(localStorage.getItem('zeliard_save_01')).toBeNull();
    });

    it('loadGame returns exactly 256 bytes or null', () => {
        const data = Uint8Array.from({ length: SAVE_SIZE }, (_, i) => (255 - i) % 256);
        expect(saveGame(data)).toBe(true);
        expect(loadGame()).toEqual(data);

        // Corrupt stored payload -> null
        localStorage.setItem('zeliard_save_01', '@@@');
        expect(loadGame()).toBeNull();

        // Wrong decoded size -> null
        localStorage.setItem('zeliard_save_01', encodeSave(new Uint8Array(10)));
        expect(loadGame()).toBeNull();
    });
});
