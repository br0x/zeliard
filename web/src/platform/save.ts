/**
 * save.ts — save-game persistence: base64 codec + localStorage slots.
 *
 * Save data is a fixed 256-byte blob (the original Zeliard .sav format).
 * Slots live in localStorage under `zeliard_save_<name>`; the legacy
 * default key `zeliard_save_01` is kept for compatibility with old saves.
 *
 * Storage is injectable so tests can run without a browser.
 */

export const SAVE_PREFIX = 'zeliard_save_';
export const SAVE_SIZE = 256;
export const DEFAULT_SAVE_KEY = 'zeliard_save_01';

/** Minimal subset of Storage used here (allows fakes in tests). */
export interface SaveStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    readonly length: number;
    key(index: number): string | null;
}

/**
 * Encode raw save bytes as base64 (the on-disk/localStorage format).
 * Uses the same String.fromCharCode(...data) expansion as the legacy code.
 */
export function encodeSave(data: Uint8Array): string {
    const binary = String.fromCharCode(...data);
    return btoa(binary);
}

/**
 * Decode base64 save data back to bytes.
 * @returns decoded bytes, or null when the payload is not valid base64.
 */
export function decodeSave(base64: string): Uint8Array | null {
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch {
        return null;
    }
}

function slotKey(slotName: string): string {
    return SAVE_PREFIX + slotName;
}

/** List saved slot names (without prefix), sorted. */
export function getSaveSlotNames(storage: SaveStorage = localStorage): string[] {
    const slots: string[] = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(SAVE_PREFIX)) {
            slots.push(key.slice(SAVE_PREFIX.length));
        }
    }
    slots.sort();
    return slots;
}

/** Store raw save bytes in a named slot (base64-encoded). Data must be exactly SAVE_SIZE bytes. */
export function saveGameToSlot(
    slotName: string,
    data: Uint8Array,
    storage: SaveStorage = localStorage,
): boolean {
    if (data.length !== SAVE_SIZE) {
        console.error(`saveGameToSlot: expected ${SAVE_SIZE} bytes, got ${data.length}`);
        return false;
    }
    storage.setItem(slotKey(slotName), encodeSave(data));
    return true;
}

/** Delete a named save slot. */
export function deleteGameFromSlot(slotName: string, storage: SaveStorage = localStorage): void {
    storage.removeItem(slotKey(slotName));
}

/**
 * Load raw save bytes from a named slot.
 * @returns exactly SAVE_SIZE bytes, or null when missing, the wrong size, or corrupt.
 */
export function loadGameFromSlot(slotName: string, storage: SaveStorage = localStorage): Uint8Array | null {
    const base64 = storage.getItem(slotKey(slotName));
    if (!base64) return null;
    const bytes = decodeSave(base64);
    if (!bytes) {
        console.error('Failed to load save', slotName);
        return null;
    }
    if (bytes.length !== SAVE_SIZE) {
        console.error(`loadGameFromSlot(${slotName}): expected ${SAVE_SIZE} bytes, got ${bytes.length}`);
        return null;
    }
    return bytes;
}

/**
 * Save game data under a fixed key (legacy single-slot API).
 * Data must be exactly SAVE_SIZE bytes; invalid sizes are rejected.
 */
export function saveGame(saveData: Uint8Array, saveKey = DEFAULT_SAVE_KEY): boolean {
    if (saveData.length !== SAVE_SIZE) {
        console.error(`saveGame: expected ${SAVE_SIZE} bytes, got ${saveData.length}`);
        return false;
    }
    const base64 = encodeSave(saveData);
    localStorage.setItem(saveKey, base64);
    console.log('Game saved (base64,', base64.length, 'chars).');
    return true;
}

/**
 * Load game data from a fixed key (legacy single-slot API).
 * @returns exactly SAVE_SIZE bytes, or null when missing/invalid/corrupt.
 */
export function loadGame(saveKey = DEFAULT_SAVE_KEY): Uint8Array | null {
    const base64 = localStorage.getItem(saveKey);
    if (!base64) return null;
    const bytes = decodeSave(base64);
    if (!bytes) {
        console.error('loadGame: failed to decode save data');
        return null;
    }
    if (bytes.length !== SAVE_SIZE) return null;
    console.log('Game loaded.');
    return bytes;
}
