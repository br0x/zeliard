// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RestoreDialog, SaveDialog } from '../src/ui/save-restore.js';
import { SAVE_PREFIX } from '../src/platform/save.js';

function seedSlots(names: string[]): void {
    localStorage.clear();
    for (const n of names) {
        localStorage.setItem(SAVE_PREFIX + n, 'AAAA'); // any payload; dialog only reads names
    }
}

beforeEach(() => seedSlots(['beta', 'alpha']));

describe('SaveDialog', () => {
    it('starts with the name input active and empty', () => {
        const d = new SaveDialog(vi.fn(), vi.fn());
        expect(d.inputActive).toBe(true);
        expect(d.inputText).toBe('');
        expect(d.items).toEqual(['alpha', 'beta']);
        expect(d.showNewNameInput).toBe(true);
    });

    it('accepts characters into the name field up to 12 chars', () => {
        const d = new SaveDialog(vi.fn(), vi.fn());
        for (const ch of 'abcdefghijkl') d.handleKey(ch, 0);
        expect(d.inputText).toBe('abcdefghijkl');
        d.handleKey('x', 0); // over the limit
        expect(d.inputText).toBe('abcdefghijkl');
    });

    it('confirms the trimmed name on Enter only when non-empty', () => {
        const onSave = vi.fn();
        const d = new SaveDialog(onSave, vi.fn());
        d.handleKey(' ', 0); // a space alone trims to nothing
        d.handleKey('Enter', 0);
        expect(onSave).not.toHaveBeenCalled();

        d.inputText = ' hero ';
        d.handleKey('Enter', 0);
        expect(onSave).toHaveBeenCalledWith('hero');
    });

    it('Backspace deletes the last character', () => {
        const d = new SaveDialog(vi.fn(), vi.fn());
        d.handleKey('a', 0);
        d.handleKey('b', 0);
        d.handleKey('Backspace', 0);
        expect(d.inputText).toBe('a');
    });

    it('ArrowDown leaves the input, keeping the current list selection', () => {
        const d = new SaveDialog(vi.fn(), vi.fn());
        d.handleKey('ArrowDown', 0);
        expect(d.inputActive).toBe(false);
        expect(d.selectedIndex).toBe(0); // unchanged (legacy behavior)
    });

    it('ArrowUp from list top returns to the input field', () => {
        const d = new SaveDialog(vi.fn(), vi.fn());
        d.handleKey('ArrowDown', 0);
        d.handleKey('ArrowUp', 0);
        expect(d.inputActive).toBe(true);
    });

    it('typed characters while browsing jump back into input mode', () => {
        const d = new SaveDialog(vi.fn(), vi.fn());
        d.handleKey('ArrowDown', 0);
        d.handleKey('q', 0);
        expect(d.inputActive).toBe(true);
        expect(d.inputText).toBe('q');
    });

    it('Enter on a selected existing slot confirms that slot name', () => {
        const onSave = vi.fn();
        const d = new SaveDialog(onSave, vi.fn());
        d.handleKey('ArrowDown', 0); // leave input, list index 0
        d.handleKey('ArrowDown', 0); // select 'beta'
        d.handleKey('Enter', 0);
        expect(onSave).toHaveBeenCalledWith('beta');
    });

    it('Escape cancels', () => {
        const onCancel = vi.fn();
        const d = new SaveDialog(vi.fn(), onCancel);
        d.handleKey('Escape', 0);
        expect(onCancel).toHaveBeenCalled();
    });
});

describe('RestoreDialog', () => {
    it('lists Re-Start first and has no text input', () => {
        const d = new RestoreDialog(vi.fn(), vi.fn());
        expect(d.items).toEqual(['Re-Start', 'alpha', 'beta']);
        expect(d.showNewNameInput).toBe(false);
        expect(d.inputActive).toBe(false);
    });

    it('Enter on Re-Start confirms null (restart)', () => {
        const onRestore = vi.fn();
        const d = new RestoreDialog(onRestore, vi.fn());
        d.handleKey('Enter', 0);
        expect(onRestore).toHaveBeenCalledWith(null);
    });

    it('navigation wraps around the list', () => {
        const d = new RestoreDialog(vi.fn(), vi.fn());
        d.handleKey('ArrowUp', 0); // wrap to last
        expect(d.selectedIndex).toBe(2);
        d.handleKey('ArrowDown', 0); // wrap to first
        expect(d.selectedIndex).toBe(0);
    });

    it('Enter on a slot confirms its name', () => {
        const onRestore = vi.fn();
        const d = new RestoreDialog(onRestore, vi.fn());
        d.handleKey('ArrowDown', 0); // alpha
        d.handleKey('Enter', 0);
        expect(onRestore).toHaveBeenCalledWith('alpha');
    });

    it('refreshItems clamps selection when slots shrink', () => {
        const d = new RestoreDialog(vi.fn(), vi.fn());
        d.handleKey('ArrowUp', 0); // index 2
        seedSlots([]);
        d.refreshItems();
        expect(d.selectedIndex).toBe(0);
        expect(d.items).toEqual(['Re-Start']);
    });
});
