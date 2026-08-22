/**
 * key-router.ts — priority routing of keyboard events.
 *
 * Owns the dispatch order used by game.js's window keydown/keyup listeners:
 * function-key shortcuts (F1/F2/F7/F8/F9), then whichever overlay is active
 * (modal → inventory → intro/ending skip → indoor scene → speed dialog),
 * then the Enter-opens-inventory rule, and finally the polled key state.
 *
 * Pure decision logic: every action is an injected dep, and `keyDown`
 * returns whether the browser event should preventDefault. The DOM
 * listeners in game.js are a thin adapter. Ported verbatim (Stage 2).
 */

export interface KeyEventLike {
    code: string;
    repeat: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
}

export interface IndoorSceneHandle {
    handleInput(key: string, repeat: boolean): void;
}

export interface SpeedDialogHandle {
    isActive: boolean;
    currentPhase: number;
    selectDigit(digit: number): boolean;
}

export interface KeyRouterDeps {
    // ── state queries ──
    modalActive(): boolean;
    inventoryOpen(): boolean;
    introActive(): boolean;
    endingActive(): boolean;
    indoorScene(): IndoorSceneHandle | null;
    speedDialog(): SpeedDialogHandle | null;
    engineReady(): boolean;
    gamePaused(): boolean;
    gameMode(): string;
    conversationActive(): boolean;

    // ── commands ──
    toggleMusic(): void;
    toggleSfx(): void;
    openRestoreModal(): void;
    openImportExportModal(): void;
    startSpeedChange(): void;
    cancelSpeedChange(): void;
    finishSpeedChange(): void;
    speedBeginSelect(): void;
    /** Digit chosen in the speed dialog (writes SPEED_CONST + SFX in game.js). */
    setSpeedDigit(digit: number): void;
    openInventory(): void;
    setKey(code: string, down: boolean): void;
    resetInventoryCombo(): void;

    // ── sinks with their own key handling ──
    /** Modal manager; args (code, nowMs). Returns consumed. */
    modalHandleKey(code: string, now: number): boolean;
    /** Inventory screen; args (code, ctrl, shift, repeat). Returns consumed. */
    inventoryHandleKey(code: string, ctrl: boolean, shift: boolean, repeat: boolean): boolean;
    introSkipPage(): void;
    endingSkipPage(): void;
}

/** Codes whose default browser behavior is always suppressed. */
export const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
    'F1', 'F2', 'F7', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Enter', 'Escape',
]);

const CONFIRM_KEYS = ['Space', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export class KeyRouter {
    private readonly deps: KeyRouterDeps;

    constructor(deps: KeyRouterDeps) {
        this.deps = deps;
    }

    /**
     * Route a keydown. Returns true when the caller must call
     * e.preventDefault() on the DOM event.
     */
    keyDown(e: KeyEventLike, now: number): boolean {
        const d = this.deps;

        if (e.code === 'F1') {
            if (!e.repeat) d.toggleMusic();
            return false;
        }

        if (e.code === 'F2') {
            if (!e.repeat) d.toggleSfx();
            return false;
        }

        if (e.code === 'F7') {
            if (!d.modalActive() && !d.gamePaused()) d.openRestoreModal();
            return false;
        }

        if (e.code === 'F8') {
            if (!d.modalActive() && !d.gamePaused() && d.engineReady()) d.openImportExportModal();
            return false;
        }

        if (e.code === 'F9' && !e.repeat) {
            if (!d.speedDialog()?.isActive && !d.modalActive() && !d.gamePaused() &&
                d.engineReady() && (d.gameMode() === 'town' || d.gameMode() === 'dungeon')) {
                d.startSpeedChange();
            }
            return false;
        }

        // If a modal is active, route keys to it (translation happens in the manager)
        if (d.modalActive()) {
            return d.modalHandleKey(e.code, now);
        }

        // If inventory screen is open, route keys to it
        if (d.inventoryOpen()) {
            return d.inventoryHandleKey(e.code, e.ctrlKey, e.shiftKey, e.repeat);
        }

        if (d.introActive() && e.code === 'Space') {
            d.introSkipPage();
            return false;
        }

        if (d.endingActive() && e.code === 'Space') {
            d.endingSkipPage();
            return false;
        }

        const indoor = d.indoorScene();
        if (indoor) {
            d.setKey(e.code, true);

            if (e.code === 'Space' && !e.repeat) indoor.handleInput('Space', e.repeat);
            else if (e.code === 'Enter' && !e.repeat) indoor.handleInput('Enter', e.repeat);
            else if (e.code === 'Escape' && !e.repeat) indoor.handleInput('Escape', e.repeat);
            else if (e.code === 'ArrowUp') indoor.handleInput('ArrowUp', e.repeat);
            else if (e.code === 'ArrowDown') indoor.handleInput('ArrowDown', e.repeat);
            else if (e.code === 'ArrowLeft') indoor.handleInput('ArrowLeft', e.repeat);
            else if (e.code === 'ArrowRight') indoor.handleInput('ArrowRight', e.repeat);
            return false;
        }

        // Route keys to speed change dialog while active
        const speed = d.speedDialog();
        if (speed?.isActive) {
            if (speed.currentPhase === 1) {
                if (e.code === 'Escape') {
                    d.cancelSpeedChange();
                    return true;
                }
                if (e.code.startsWith('Digit') && e.code.length === 6) {
                    const digit = parseInt(e.code[5], 10);
                    if (digit >= 0 && digit <= 9 && speed.selectDigit(digit)) {
                        d.setSpeedDigit(digit);
                        return true;
                    }
                    return false;
                }
                return false;
            } else if (speed.currentPhase === 2) {
                if (CONFIRM_KEYS.includes(e.code)) {
                    d.finishSpeedChange();
                    return true;
                }
                return false;
            }
            return false;
        }
        // Open inventory on Enter in town or dungeon (not during conversation)
        if (e.code === 'Enter' && !e.repeat && d.engineReady() && !d.modalActive() &&
            !d.conversationActive() && (d.gameMode() === 'town' || d.gameMode() === 'dungeon')) {
            d.openInventory();
            return true;
        }

        d.setKey(e.code, true);
        return false;
    }

    /** Route a keyup (no preventDefault semantics). */
    keyUp(e: KeyEventLike): void {
        const d = this.deps;

        if (e.code === 'F9' && d.speedDialog()?.isActive && d.speedDialog()?.currentPhase === 0) {
            d.speedBeginSelect();
        }

        if (d.inventoryOpen() &&
            (e.code === 'ControlLeft' || e.code === 'ControlRight' ||
             e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
            d.resetInventoryCombo();
        }

        d.setKey(e.code, false);
    }
}

/**
 * Space/Alt edge detector feeding the wasm input latches (polled from the
 * slow tick, separate from the event router). `reset()` clears the edge
 * state without writing latches — used when scenes swallow a held key.
 */
export class KeyEdgeLatches {
    private lastSpace = false;
    private lastAlt = false;

    constructor(
        private readonly onSpaceEdge: () => void,
        private readonly onAltEdge: () => void,
    ) {}

    update(spaceDown: boolean, altDown: boolean): void {
        if (spaceDown && !this.lastSpace) this.onSpaceEdge();
        if (altDown && !this.lastAlt) this.onAltEdge();
        this.lastSpace = spaceDown;
        this.lastAlt = altDown;
    }

    reset(): void {
        this.lastSpace = false;
        this.lastAlt = false;
    }
}
