// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { ModalManager, translateKeyForDialog, type Modal } from '../src/ui/modal-manager.js';

function fakeModal(overrides: Partial<Modal> = {}) {
    const modal = {
        handleKey: vi.fn(() => false),
        draw: vi.fn(),
    };
    return Object.assign(modal, overrides);
}

const CTX = {} as CanvasRenderingContext2D;

describe('translateKeyForDialog', () => {
    it('converts letter and digit codes to characters', () => {
        expect(translateKeyForDialog('KeyA')).toBe('a');
        expect(translateKeyForDialog('Digit5')).toBe('5');
        expect(translateKeyForDialog('Space')).toBe(' ');
    });

    it('leaves dialog navigation keys unchanged', () => {
        expect(translateKeyForDialog('Backspace')).toBe('Backspace');
        expect(translateKeyForDialog('ArrowUp')).toBe('ArrowUp');
        expect(translateKeyForDialog('Enter')).toBe('Enter');
        expect(translateKeyForDialog('Escape')).toBe('Escape');
    });
});

describe('ModalManager lifecycle', () => {
    it('starts inactive; open/close toggles state', () => {
        const mgr = new ModalManager();
        expect(mgr.isActive).toBe(false);

        const modal = fakeModal();
        mgr.open(modal);
        expect(mgr.isActive).toBe(true);
        expect(mgr.currentModal).toBe(modal);

        mgr.close();
        expect(mgr.isActive).toBe(false);
        expect(mgr.currentModal).toBeNull();
    });

    it('ignores open() while a modal is active (legacy guard)', () => {
        const mgr = new ModalManager();
        const first = fakeModal();
        const second = fakeModal();

        mgr.open(first);
        mgr.open(second);
        expect(mgr.currentModal).toBe(first);
    });

    it('close() on an empty manager is a no-op', () => {
        const mgr = new ModalManager();
        expect(() => mgr.close()).not.toThrow();
    });
});

describe('ModalManager key routing', () => {
    it('returns false when no modal is active', () => {
        const mgr = new ModalManager();
        expect(mgr.handleKey('KeyA', 0)).toBe(false);
    });

    it('routes translated keys to the active modal', () => {
        const mgr = new ModalManager();
        const modal = fakeModal({ handleKey: vi.fn(() => true) });
        mgr.open(modal);

        expect(mgr.handleKey('KeyZ', 123)).toBe(true);
        expect(modal.handleKey).toHaveBeenCalledWith('z', 123);

        mgr.handleKey('Digit1', 124);
        expect(modal.handleKey).toHaveBeenLastCalledWith('1', 124);

        mgr.handleKey('Backspace', 125);
        expect(modal.handleKey).toHaveBeenLastCalledWith('Backspace', 125);
    });

    it('reports false when the modal does not consume the key', () => {
        const mgr = new ModalManager();
        mgr.open(fakeModal()); // handleKey returns false
        expect(mgr.handleKey('Escape', 0)).toBe(false);
    });
});

describe('ModalManager input-active tracking (on-screen keyboard)', () => {
    it('reflects inputActive of the current modal only', () => {
        const mgr = new ModalManager();
        expect(mgr.isInputActive).toBe(false);

        mgr.open(fakeModal({ inputActive: false }));
        expect(mgr.isInputActive).toBe(false);

        mgr.close();
        mgr.open(fakeModal({ inputActive: true }));
        expect(mgr.isInputActive).toBe(true);

        // After close, no longer active even though last modal had input focus.
        mgr.close();
        expect(mgr.isInputActive).toBe(false);
    });
});

describe('ModalManager drawing', () => {
    it('draws the active modal with forwarded parameters', () => {
        const mgr = new ModalManager();
        mgr.draw(CTX, 320, 200, 42); // no-op when inactive

        const modal = fakeModal();
        mgr.open(modal);
        mgr.draw(CTX, 320, 200, 42);
        expect(modal.draw).toHaveBeenCalledWith(CTX, 320, 200, 42);
    });
});
