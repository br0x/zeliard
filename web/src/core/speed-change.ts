/**
 * speed-change.ts — game-speed dialog (F9) state machine.
 *
 * Pure state transitions; DOM/canvas drawing and side-effects stay in
 * the caller. Mirrors the legacy flow:
 *   start()        → active, phase 0 ("press F9 again" prompt released)
 *   beginSelect()  → phase 1 (waiting for a digit)
 *   selectDigit(d) → phase 2 (digit echoed, waiting for confirmation)
 *   confirm()      → finishes (any movement/action key in phase 2)
 *   cancel()       → Escape during phase 1 aborts
 */

export type SpeedPhase = 0 | 1 | 2;

export interface SpeedSnapshot {
    readonly active: boolean;
    readonly phase: SpeedPhase;
    readonly digit: number;
}

export class SpeedChangeDialog {
    private activeState = false;
    private phaseState: SpeedPhase = 0;
    private digitState = -1;

    get snapshot(): SpeedSnapshot {
        return { active: this.activeState, phase: this.phaseState, digit: this.digitState };
    }

    get isActive(): boolean {
        return this.activeState;
    }

    /** -1 when inactive; otherwise the current phase (consumed by touch UI). */
    get touchPhase(): number {
        return this.activeState ? this.phaseState : -1;
    }

    get currentPhase(): SpeedPhase {
        return this.phaseState;
    }

    get selectedDigit(): number {
        return this.digitState;
    }

    /** Enter the dialog at phase 0. Caller owns all preconditions/guards. */
    begin(): void {
        this.activeState = true;
        this.phaseState = 0;
        this.digitState = -1;
    }

    /**
     * F9 released during phase 0: arm digit selection.
     * @returns true when the transition applied.
     */
    beginSelect(): boolean {
        if (!this.activeState || this.phaseState !== 0) return false;
        this.phaseState = 1;
        return true;
    }

    /**
     * A digit was chosen while in phase 1.
     * @returns true when accepted (caller then applies the wasm side-effects).
     */
    selectDigit(digit: number): boolean {
        if (!this.activeState || this.phaseState !== 1) return false;
        this.digitState = digit;
        this.phaseState = 2;
        return true;
    }

    /**
     * Any action/movement key during phase 2 confirms and closes.
     * @returns true when the key confirmed (caller preventDefaults).
     */
    confirm(): boolean {
        if (!this.activeState || this.phaseState !== 2) return false;
        this.finish();
        return true;
    }

    /** Close from any state (no-op when inactive). */
    finish(): void {
        this.activeState = false;
        this.phaseState = 0;
        this.digitState = -1;
    }
}

/** Convert the stored constant back to the displayed 0–9 speed value. */
export function displayedSpeed(speedConstByte: number): number {
    return 10 - (speedConstByte || 5);
}
