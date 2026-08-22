/**
 * key-state.ts — shared keyboard state for the game loop.
 *
 * A single mutable record of "currently held" action keys. The DOM event
 * handlers in game.js set/clear flags; the frame/tick loop reads the object
 * and forwards it to the wasm input latch via the bridge's inputSetKeys().
 *
 * Kept as a plain mutable singleton (not events) to mirror the original
 * game's polled keyboard latch semantics.
 */

import type { KeyState } from '../wasm/memory.js';

/** The live key state, mutated by input handlers and read every tick. */
export const keys: Required<KeyState> = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false,
    Enter: false,
    Alt: false,
    Escape: false,
};

/** Clear all held keys (e.g. when a modal opens or focus is lost). */
export function clearKeys(): void {
    keys.ArrowUp = false;
    keys.ArrowDown = false;
    keys.ArrowLeft = false;
    keys.ArrowRight = false;
    keys.Space = false;
    keys.Enter = false;
    keys.Alt = false;
    keys.Escape = false;
}

/**
 * Apply an e.code-style KeyboardEvent code to the key state.
 * @param pressed true on keydown, false on keyup
 * @returns true when the code mapped to a tracked key
 */
export function setKeyState(code: string, pressed: boolean): boolean {
    switch (code) {
        case 'Space': keys.Space = pressed; return true;
        case 'AltLeft':
        case 'AltRight': keys.Alt = pressed; return true;
        case 'Enter': keys.Enter = pressed; return true;
        case 'Escape': keys.Escape = pressed; return true;
        case 'ArrowUp': keys.ArrowUp = pressed; return true;
        case 'ArrowDown': keys.ArrowDown = pressed; return true;
        case 'ArrowLeft': keys.ArrowLeft = pressed; return true;
        case 'ArrowRight': keys.ArrowRight = pressed; return true;
        default: return false;
    }
}
