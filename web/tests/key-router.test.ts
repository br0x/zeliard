import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyRouter, KeyEdgeLatches, type KeyEventLike } from '../src/input/key-router.js';

function makeRouter(overrides: Record<string, unknown> = {}) {
    const calls: string[] = [];
    const base = {
        // state queries (defaults: nothing active, ready, town)
        modalActive: () => false,
        inventoryOpen: () => false,
        introActive: () => false,
        endingActive: () => false,
        indoorScene: () => null as { handleInput: (k: string, r: boolean) => void } | null,
        speedDialog: () => null as null | { isActive: boolean; currentPhase: number; selectDigit: (d: number) => boolean },
        engineReady: () => true,
        gamePaused: () => false,
        gameMode: () => 'town',
        conversationActive: () => false,
        // commands
        toggleMusic: () => calls.push('toggleMusic'),
        toggleSfx: () => calls.push('toggleSfx'),
        openRestoreModal: () => calls.push('openRestoreModal'),
        openImportExportModal: () => calls.push('openImportExportModal'),
        startSpeedChange: () => calls.push('startSpeedChange'),
        cancelSpeedChange: () => calls.push('cancelSpeedChange'),
        finishSpeedChange: () => calls.push('finishSpeedChange'),
        speedBeginSelect: () => calls.push('speedBeginSelect'),
        setSpeedDigit: (digit: number) => calls.push(`setSpeedDigit:${digit}`),
        openInventory: () => calls.push('openInventory'),
        setKey: (code: string, down: boolean) => calls.push(`setKey:${code}:${down}`),
        resetInventoryCombo: () => calls.push('resetInventoryCombo'),
        modalHandleKey: vi.fn(() => true),
        inventoryHandleKey: vi.fn(() => true),
        introSkipPage: () => calls.push('introSkipPage'),
        endingSkipPage: () => calls.push('endingSkipPage'),
    };
    const deps = Object.assign(base, overrides) as typeof base;
    return { router: new KeyRouter(deps), calls, deps };
}

const ev = (code: string, o: Partial<KeyEventLike> = {}): KeyEventLike =>
    ({ code, repeat: false, ctrlKey: false, shiftKey: false, ...o });

describe('KeyRouter.function keys', () => {
    let r: ReturnType<typeof makeRouter>;
    beforeEach(() => { r = makeRouter(); });

    it('F1/F2 toggle music/sfx on first press only', () => {
        expect(r.router.keyDown(ev('F1'), 0)).toBe(false);
        expect(r.router.keyDown(ev('F2'), 0)).toBe(false);
        expect(r.calls).toEqual(['toggleMusic', 'toggleSfx']);
        r.calls.length = 0;
        r.router.keyDown(ev('F1', { repeat: true }), 0);
        expect(r.calls).toEqual([]);
    });

    it('F7 opens restore unless a modal is up or the game is paused', () => {
        r.router.keyDown(ev('F7'), 0);
        expect(r.calls).toEqual(['openRestoreModal']);

        const blocked = makeRouter({ modalActive: () => true });
        blocked.router.keyDown(ev('F7'), 0);
        expect(blocked.calls).toEqual([]);

        const paused = makeRouter({ gamePaused: () => true });
        paused.router.keyDown(ev('F7'), 0);
        expect(paused.calls).toEqual([]);
    });

    it('F8 additionally requires an engine-ready state', () => {
        const notReady = makeRouter({ engineReady: () => false });
        notReady.router.keyDown(ev('F8'), 0);
        expect(notReady.calls).toEqual([]);

        r.router.keyDown(ev('F8'), 0);
        expect(r.calls).toEqual(['openImportExportModal']);
    });

    it('F9 starts the speed dialog in gameplay modes only', () => {
        r.router.keyDown(ev('F9'), 0);
        expect(r.calls).toEqual(['startSpeedChange']);

        for (const mode of ['intro', 'title']) {
            const m = makeRouter({ gameMode: () => mode });
            m.router.keyDown(ev('F9'), 0);
            expect(m.calls).toEqual([]);
        }

        const repeat = makeRouter();
        repeat.router.keyDown(ev('F9', { repeat: true }), 0);
        // legacy parity: a repeated F9 skips the shortcut branch and latches
        expect(repeat.calls).toEqual(['setKey:F9:true']);
    });
});

describe('KeyRouter.overlay priority', () => {
    it('routes to the modal before anything else and propagates consumption', () => {
        const r = makeRouter({
            modalActive: () => true,
            inventoryOpen: () => true,
            modalHandleKey: vi.fn(() => true),
        });
        expect(r.router.keyDown(ev('KeyA'), 123)).toBe(true);
        expect(r.deps.modalHandleKey).toHaveBeenCalledWith('KeyA', 123);
        expect(r.deps.inventoryHandleKey).not.toHaveBeenCalled();

        const pass = makeRouter({ modalActive: () => true, modalHandleKey: vi.fn(() => false) });
        expect(pass.router.keyDown(ev('KeyA'), 0)).toBe(false);
    });

    it('routes to the inventory next (ctrl/shift/repeat passed through)', () => {
        const r = makeRouter({ inventoryOpen: () => true });
        r.router.keyDown(ev('KeyC', { ctrlKey: true, shiftKey: true, repeat: true }), 0);
        expect(r.deps.inventoryHandleKey).toHaveBeenCalledWith('KeyC', true, true, true);
        expect(r.calls.filter((c) => c.startsWith('setKey'))).toEqual([]);
    });

    it('Space skips intro/ending pages', () => {
        const intro = makeRouter({ introActive: () => true });
        expect(intro.router.keyDown(ev('Space'), 0)).toBe(false);
        expect(intro.calls).toContain('introSkipPage');

        const ending = makeRouter({ endingActive: () => true });
        ending.router.keyDown(ev('Space'), 0);
        expect(ending.calls).toContain('endingSkipPage');
    });

    it('updates polled key state and forwards scene input indoors', () => {
        const handleInput = vi.fn();
        const r = makeRouter({ indoorScene: () => ({ handleInput }) });

        r.router.keyDown(ev('Space'), 0);
        r.router.keyDown(ev('ArrowLeft', { repeat: true }), 0);   // arrows forward even on repeat
        r.router.keyDown(ev('KeyX'), 0);                          // unknown keys just latch

        expect(handleInput.mock.calls).toEqual([['Space', false], ['ArrowLeft', true]]);
        expect(r.calls[0]).toBe('setKey:Space:true');
        expect(r.calls.at(-1)).toBe('setKey:KeyX:true');
    });

    it('does not forward repeated confirm keys to indoor scenes', () => {
        const handleInput = vi.fn();
        const r = makeRouter({ indoorScene: () => ({ handleInput }) });
        r.router.keyDown(ev('Enter', { repeat: true }), 0);
        r.router.keyDown(ev('Escape', { repeat: true }), 0);
        expect(handleInput).not.toHaveBeenCalled();
    });
});

describe('KeyRouter.speed dialog phases', () => {
    it('phase 1: Escape cancels, accepted digits write speed, rejected digits do not', () => {
        let accept = true;
        const r = makeRouter({
            speedDialog: () => ({ isActive: true, currentPhase: 1, selectDigit: () => accept }),
        });

        expect(r.router.keyDown(ev('Escape'), 0)).toBe(true);
        expect(r.calls).toContain('cancelSpeedChange');

        expect(r.router.keyDown(ev('Digit5'), 0)).toBe(true);
        expect(r.calls).toContain('setSpeedDigit:5');

        accept = false;
        r.calls.length = 0;
        expect(r.router.keyDown(ev('Digit3'), 0)).toBe(false);
        expect(r.calls).toEqual([]);

        expect(r.router.keyDown(ev('KeyZ'), 0)).toBe(false);
        expect(r.router.keyDown(ev('Digit'), 0)).toBe(false);
    });

    it('phase 2: confirm keys finish, other keys are swallowed', () => {
        const r = makeRouter({
            speedDialog: () => ({ isActive: true, currentPhase: 2, selectDigit: () => true }),
        });
        expect(r.router.keyDown(ev('Space'), 0)).toBe(true);
        expect(r.calls).toContain('finishSpeedChange');

        r.calls.length = 0;
        expect(r.router.keyDown(ev('KeyQ'), 0)).toBe(false);
        expect(r.calls).toEqual([]);
    });

    it('phase 0 swallows keys without action (waits for keyup)', () => {
        const r = makeRouter({
            speedDialog: () => ({ isActive: true, currentPhase: 0, selectDigit: () => true }),
        });
        expect(r.router.keyDown(ev('Space'), 0)).toBe(false);
        expect(r.calls).toEqual([]);
    });
});

describe('KeyRouter.gameplay defaults', () => {
    it('Enter opens the inventory in town/dungeon unless conversing', () => {
        const r = makeRouter();
        expect(r.router.keyDown(ev('Enter'), 0)).toBe(true);
        expect(r.calls).toContain('openInventory');

        const conversing = makeRouter({ conversationActive: () => true });
        expect(conversing.router.keyDown(ev('Enter'), 0)).toBe(false);
        expect(conversing.calls).toEqual(['setKey:Enter:true']);

        const notReady = makeRouter({ engineReady: () => false });
        notReady.router.keyDown(ev('Enter'), 0);
        expect(notReady.calls).toEqual(['setKey:Enter:true']);
    });

    it('plain movement keys just update key state', () => {
        const r = makeRouter();
        expect(r.router.keyDown(ev('ArrowRight'), 0)).toBe(false);
        expect(r.calls).toEqual(['setKey:ArrowRight:true']);
    });
});

describe('KeyRouter.keyUp', () => {
    it('F9 release begins digit selection from phase 0 only', () => {
        const r = makeRouter({
            speedDialog: () => ({ isActive: true, currentPhase: 0, selectDigit: () => true }),
        });
        r.router.keyUp(ev('F9'));
        expect(r.calls).toContain('speedBeginSelect');

        const later = makeRouter({
            speedDialog: () => ({ isActive: true, currentPhase: 1, selectDigit: () => true }),
        });
        later.router.keyUp(ev('F9'));
        expect(later.calls).toEqual(['setKey:F9:false']);
    });

    it('releasing Ctrl/Shift resets the inventory debug combo', () => {
        const r = makeRouter({ inventoryOpen: () => true });
        r.router.keyUp(ev('ControlLeft'));
        expect(r.calls).toContain('resetInventoryCombo');
        expect(r.calls).toContain('setKey:ControlLeft:false');

        const closed = makeRouter();
        closed.router.keyUp(ev('ShiftRight'));
        expect(closed.calls).not.toContain('resetInventoryCombo');
    });
});

describe('KeyEdgeLatches', () => {
    it('fires once per press edge, not while held', () => {
        let spaceEdges = 0;
        let altEdges = 0;
        const latches = new KeyEdgeLatches(() => spaceEdges++, () => altEdges++);

        latches.update(true, false);   // press space
        latches.update(true, false);   // still held
        latches.update(true, true);    // alt joins
        latches.update(false, true);   // release space
        latches.update(true, true);    // space again → new edge

        expect(spaceEdges).toBe(2);
        expect(altEdges).toBe(1);
    });

    it('reset() forces the next poll to re-fire edges without writing', () => {
        let spaceEdges = 0;
        const latches = new KeyEdgeLatches(() => spaceEdges++, () => {});

        latches.update(true, false);
        latches.reset();
        latches.update(true, false);   // treated as a fresh press

        expect(spaceEdges).toBe(2);
    });
});
