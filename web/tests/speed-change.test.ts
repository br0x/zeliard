import { describe, expect, it } from 'vitest';
import {
    SpeedChangeDialog,
    displayedSpeed,
} from '../src/core/speed-change.js';

describe('SpeedChangeDialog state machine', () => {
    it('starts inactive with touchPhase -1', () => {
        const d = new SpeedChangeDialog();
        expect(d.isActive).toBe(false);
        expect(d.touchPhase).toBe(-1);
        expect(d.snapshot).toEqual({ active: false, phase: 0, digit: -1 });
    });

    it('begin() activates at phase 0', () => {
        const d = new SpeedChangeDialog();
        d.begin();
        expect(d.isActive).toBe(true);
        expect(d.currentPhase).toBe(0);
        expect(d.touchPhase).toBe(0);
    });

    it('beginSelect only arms from phase 0', () => {
        const d = new SpeedChangeDialog();
        // Before begin: ignored
        expect(d.beginSelect()).toBe(false);

        d.begin();
        expect(d.beginSelect()).toBe(true);
        expect(d.currentPhase).toBe(1);

        // Already selecting: no-op
        expect(d.beginSelect()).toBe(false);
    });

    it('selectDigit only accepts a digit in phase 1 and moves to phase 2', () => {
        const d = new SpeedChangeDialog();
        d.begin();

        // Phase 0: digit selection not yet allowed
        expect(d.selectDigit(5)).toBe(false);

        d.beginSelect();
        expect(d.selectDigit(7)).toBe(true);
        expect(d.selectedDigit).toBe(7);
        expect(d.currentPhase).toBe(2);

        // Phase 2: further digits ignored
        expect(d.selectDigit(3)).toBe(false);
        expect(d.selectedDigit).toBe(7);
    });

    it('confirm only closes from phase 2', () => {
        const d = new SpeedChangeDialog();
        d.begin();
        expect(d.confirm()).toBe(false); // phase 0

        d.beginSelect();
        expect(d.confirm()).toBe(false); // phase 1

        d.selectDigit(2);
        expect(d.confirm()).toBe(true); // phase 2 -> closed
        expect(d.isActive).toBe(false);
        expect(d.snapshot).toEqual({ active: false, phase: 0, digit: -1 });
    });

    it('finish()/cancel works from any state and is idempotent', () => {
        const d = new SpeedChangeDialog();
        d.finish(); // inactive: no-op
        expect(d.isActive).toBe(false);

        d.begin();
        d.beginSelect();
        d.finish();
        expect(d.isActive).toBe(false);

        d.begin(); // can restart cleanly
        expect(d.currentPhase).toBe(0);
        d.finish();
        d.finish();
        expect(d.isActive).toBe(false);
    });
});

describe('displayedSpeed (stored byte -> 0-9 value)', () => {
    it('inverts the stored constant', () => {
        expect(displayedSpeed(10 - 5)).toBe(5);
        expect(displayedSpeed(10 - 9)).toBe(9);
        expect(displayedSpeed(10 - 1)).toBe(1);
    });

    it('falls back to speed 5 for a zero/missing byte', () => {
        expect(displayedSpeed(0)).toBe(5);
    });
});
