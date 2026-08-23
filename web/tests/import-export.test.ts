// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportExportDialog, type ImportExportMode } from '../src/ui/import-export.js';
import { SAVE_PREFIX } from '../src/platform/save.js';

function seedSlots(names: string[]): void {
    localStorage.clear();
    for (const n of names) {
        localStorage.setItem(SAVE_PREFIX + n, 'AAAA');
    }
}

beforeEach(() => seedSlots(['alpha', 'beta', 'gamma']));

function make(overrides: {
    onExportSlot?: (s: string) => void;
    onImportFromFile?: () => void;
    onDeleteSlot?: (s: string) => void;
    onCancel?: () => void;
} = {}) {
    return new ImportExportDialog(
        overrides.onExportSlot ?? vi.fn(),
        overrides.onImportFromFile ?? vi.fn(),
        overrides.onDeleteSlot ?? vi.fn(),
        overrides.onCancel ?? vi.fn(),
    );
}

describe('ImportExportDialog mode switching', () => {
    it('starts in export mode with slots refreshed', () => {
        const d = make();
        expect(d.mode).toBe('export');
        expect(d.slots).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('ArrowLeft/ArrowRight cycle the three modes in both directions', () => {
        const d = make();
        d.handleKey('ArrowRight', 0);
        expect(d.mode).toBe('import');
        d.handleKey('ArrowRight', 0);
        expect(d.mode).toBe('delete');
        d.handleKey('ArrowRight', 0);
        expect(d.mode).toBe('export');
        d.handleKey('ArrowLeft', 0);
        expect(d.mode).toBe('delete');
    });

    it('Escape always cancels', () => {
        const onCancel = vi.fn();
        const d = make({ onCancel });
        d.handleKey('Escape', 0);
        expect(onCancel).toHaveBeenCalled();
    });
});

describe('ImportExportDialog export mode', () => {
    it('navigates slots with wrap and fires onExportSlot on Enter', () => {
        const onExportSlot = vi.fn();
        const d = make({ onExportSlot });
        d.handleKey('ArrowDown', 0); // beta
        d.handleKey('Enter', 0);
        expect(onExportSlot).toHaveBeenCalledWith('beta');
    });

    it('wraps up from the first slot to the last', () => {
        const onExportSlot = vi.fn();
        const d = make({ onExportSlot });
        d.handleKey('ArrowUp', 0); // wraps to gamma
        d.handleKey('Enter', 0);
        expect(onExportSlot).toHaveBeenCalledWith('gamma');
    });

    it('Enter with no slots is a consumed no-op', () => {
        seedSlots([]);
        const onExportSlot = vi.fn();
        const d = make({ onExportSlot });
        expect(d.handleKey('Enter', 0)).toBe(true);
        expect(onExportSlot).not.toHaveBeenCalled();
    });

    it('unrecognized keys are not consumed', () => {
        const d = make();
        expect(d.handleKey('KeyQ', 0)).toBe(false);
    });
});

describe('ImportExportDialog import mode', () => {
    it('Enter triggers the file picker callback', () => {
        const onImportFromFile = vi.fn();
        const d = make({ onImportFromFile });
        d.handleKey('ArrowRight', 0);
        d.handleKey('Enter', 0);
        expect(onImportFromFile).toHaveBeenCalled();
    });

    it('arrow up/down are ignored in import mode (legacy behavior)', () => {
        const d = make();
        d.handleKey('ArrowRight', 0);
        expect(d.handleKey('ArrowUp', 0)).toBe(false);
        expect(d.selectedSlotIndex).toBe(0);
    });
});

describe('ImportExportDialog delete mode', () => {
    it('Enter opens a confirmation instead of deleting immediately', () => {
        const onDeleteSlot = vi.fn();
        const d = make({ onDeleteSlot });
        d.handleKey('ArrowRight', 0);
        d.handleKey('ArrowRight', 0);
        d.handleKey('Enter', 0);
        expect(d.confirmDeleteSlot).toBe('alpha');
        expect(onDeleteSlot).not.toHaveBeenCalled();
    });

    it("'y' / Enter confirms the delete and refreshes the slot list", () => {
        const onDeleteSlot = vi.fn((s: string) => {
            localStorage.removeItem(SAVE_PREFIX + s);
        });
        const d = make({ onDeleteSlot });
        d.handleKey('ArrowRight', 0);
        d.handleKey('ArrowRight', 0); // delete mode
        d.handleKey('ArrowDown', 0); // beta
        d.handleKey('Enter', 0); // confirm prompt
        d.handleKey('y', 0);
        expect(onDeleteSlot).toHaveBeenCalledWith('beta');
        expect(d.confirmDeleteSlot).toBeNull();
        expect(d.slots).toEqual(['alpha', 'gamma']);
    });

    it("'n' / Escape dismisses the confirmation without deleting", () => {
        const onDeleteSlot = vi.fn();
        for (const key of ['n', 'N', 'Escape'] as const) {
            const d = make({ onDeleteSlot });
            d.handleKey('ArrowRight', 0);
            d.handleKey('ArrowRight', 0);
            d.handleKey('Enter', 0);
            expect(d.handleKey(key, 0)).toBe(true);
            expect(d.confirmDeleteSlot).toBeNull();
            expect(onDeleteSlot).not.toHaveBeenCalled();
        }
    });

    it('while confirming, every other key is swallowed', () => {
        const d = make();
        d.handleKey('ArrowRight', 0);
        d.handleKey('ArrowRight', 0);
        d.handleKey('Enter', 0);
        expect(d.handleKey('q', 0)).toBe(true);
        expect(d.confirmDeleteSlot).toBe('alpha');
    });

    it("uppercase 'Y' confirms too", () => {
        const onDeleteSlot = vi.fn();
        const d = make({ onDeleteSlot });
        d.handleKey('ArrowRight', 0);
        d.handleKey('ArrowRight', 0);
        d.handleKey('Enter', 0);
        d.handleKey('Y', 0);
        expect(onDeleteSlot).toHaveBeenCalledWith('alpha');
    });
});

describe('ImportExportDialog scroll clamping (9+ slots)', () => {
    it('keeps the selection visible within an 8-row window', () => {
        seedSlots(['s1','s2','s3','s4','s5','s6','s7','s8','s9']);
        const d: ReturnType<typeof make> & { scrollOffset: number; mode: ImportExportMode } = make() as never;
        for (let i = 0; i < 8; i++) d.handleKey('ArrowDown', 0);
        expect(d.selectedSlotIndex).toBe(8);
        expect(d.scrollOffset).toBe(1); // window scrolled down one
        d.handleKey('ArrowUp', 0);
        d.handleKey('ArrowUp', 0);
        expect(d.selectedSlotIndex).toBe(6);
        // with 9 slots and an 8-row window, offset 1 is the minimum clamp
        expect(d.scrollOffset).toBe(1);
    });

    it('refreshSlots clamps the selection after external deletion', () => {
        const onDeleteSlot = vi.fn((s: string) => localStorage.removeItem(SAVE_PREFIX + s));
        const d = make({ onDeleteSlot });
        d.handleKey('ArrowUp', 0); // gamma (last)
        d.handleKey('ArrowRight', 0);
        d.handleKey('ArrowRight', 0);
        d.handleKey('Enter', 0); // confirm gamma
        d.handleKey('y', 0);
        expect(d.slots).toEqual(['alpha', 'beta']);
        expect(d.selectedSlotIndex).toBe(1); // clamped to new last
    });
});
