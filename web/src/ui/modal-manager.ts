/**
 * modal-manager.ts — lifecycle + key routing for the top-level modal dialogs
 * (save/restore, import/export).
 *
 * Legacy contract preserved from game.js:
 *   - at most one modal at a time; open() while active is a no-op
 *   - keydown codes are translated for the dialog ("KeyA"→"a", "Digit5"→"5",
 *     "Space"→" ") before handleKey(); handled keys report true so the caller
 *     preventDefaults
 *   - the manager draws nothing itself; callers invoke draw() when compositing
 */

export interface Modal {
    /** Handle a translated key. Returns true when the key was consumed. */
    handleKey(key: string, now: number): boolean;
    /** True while the dialog's text-input field is focused (on-screen keyboard). */
    inputActive?: boolean;
    draw(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void;
}

/** Translate an e.code value into the character/dialog key it represents. */
export function translateKeyForDialog(code: string): string {
    if (code.startsWith('Key')) return code[3].toLowerCase(); // 'KeyA' -> 'a'
    if (code.startsWith('Digit')) return code[5]; // 'Digit1' -> '1'
    if (code === 'Space') return ' ';
    return code; // Backspace, ArrowUp/Down, Enter, Escape stay unchanged
}

export class ModalManager {
    private current: Modal | null = null;

    get isActive(): boolean {
        return this.current !== null;
    }

    get currentModal(): Modal | null {
        return this.current;
    }

    /** True while the active modal's text-input field is focused. */
    get isInputActive(): boolean {
        return this.current !== null && this.current.inputActive === true;
    }

    /**
     * Show a modal. Ignored if another modal is already open (legacy guard —
     * callers additionally gate on their own conditions).
     */
    open(modal: Modal): void {
        if (this.current) return;
        this.current = modal;
    }

    close(): void {
        this.current = null;
    }

    /**
     * Route a KeyboardEvent.code to the active modal.
     * @returns true when the modal consumed the key (caller preventDefaults).
     */
    handleKey(code: string, now: number): boolean {
        if (!this.current) return false;
        return this.current.handleKey(translateKeyForDialog(code), now);
    }

    draw(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
        this.current?.draw(ctx, width, height, now);
    }
}
