/**
 * save-file.ts — .sav file import/export via the browser file dialogs.
 *
 * DOM-only companions to platform/save.ts: downloading a slot as a file and
 * picking a .sav file for import (with size validation). Callbacks are
 * injected so the caller owns game-state effects.
 */

export const SAVE_FILE_EXTENSION = '.sav';
export const SAVE_FILE_SIZE = 256;

/** Lazily-created hidden <input type="file"> used to pick a save file. */
let fileInput: HTMLInputElement | null = null;

function ensureSaveFileInput(): HTMLInputElement {
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.setAttribute('type', 'file');
        fileInput.setAttribute('accept', SAVE_FILE_EXTENSION);
        fileInput.style.display = 'none';
    }
    // Re-attach if something wiped the DOM (tests, hot-module reload).
    if (!fileInput.isConnected) {
        document.body.appendChild(fileInput);
    }
    return fileInput;
}

/**
 * Download raw save bytes as `<slotName>.sav`.
 */
export function downloadSaveFile(slotName: string, data: Uint8Array): void {
    const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slotName}${SAVE_FILE_EXTENSION}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`Exported slot "${slotName}" to ${slotName}${SAVE_FILE_EXTENSION}`);
}

/**
 * Open a file picker and hand the selected .sav contents to `onFileSelected`.
 *
 * The picker is ignored when `canImport()` returns false. Invalid payloads
 * (wrong size, unreadable) are reported to the user and never reach the
 * callback.
 *
 * @param opts.expectedSize defaults to SAVE_FILE_SIZE
 */
export function pickSaveFile(
    onFileSelected: (data: Uint8Array, fileName: string) => void | Promise<void>,
    opts: {
        canImport?: () => boolean;
        onInvalid?: (reason: 'size' | 'error', detail?: unknown) => void;
        expectedSize?: number;
    } = {},
): void {
    const { canImport = () => true, onInvalid = () => {}, expectedSize = SAVE_FILE_SIZE } = opts;

    if (!canImport()) {
        console.warn('Engine not ready, cannot import.');
        return;
    }

    const input = ensureSaveFileInput();
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const data = new Uint8Array(await file.arrayBuffer());
            if (data.length !== expectedSize) {
                onInvalid('size');
                return;
            }
            await onFileSelected(data, file.name);
            console.log(`Imported and restored from ${file.name}`);
        } catch (err) {
            console.error('Import failed:', err);
            onInvalid('error', err);
        } finally {
            input.value = '';
        }
    };
    input.click();
}
