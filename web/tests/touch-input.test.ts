// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initTouchControls, nameKeyEvent, NAME_CONTROL_KEYS } from '../src/input/touch-input.js';

/** Recorded synthetic keyboard events dispatched on window. */
const keyEvents: Array<{ type: string; code: string }> = [];

// One persistent listener for the whole suite (added once).
window.addEventListener('keydown', e => keyEvents.push({ type: 'keydown', code: (e as KeyboardEvent).code }));
window.addEventListener('keyup', e => keyEvents.push({ type: 'keyup', code: (e as KeyboardEvent).code }));

function recordedKeys() {
    return keyEvents.map(e => `${e.type}:${e.code}`);
}

function makeButton(className: string, data: Record<string, string>): HTMLElement {
    const btn = document.createElement('button');
    btn.className = className;
    for (const [k, v] of Object.entries(data)) btn.dataset[k] = v;
    return btn;
}

function press(btn: HTMLElement, pointerId = 1): void {
    const e = new Event('pointerdown') as Event & { pointerId: number; preventDefault: () => void };
    Object.assign(e, { pointerId });
    e.preventDefault = vi.fn();
    btn.dispatchEvent(e);
}

function release(btn: HTMLElement, pointerId = 1): void {
    const e = new Event('pointerup') as Event & { pointerId: number };
    Object.assign(e, { pointerId });
    btn.dispatchEvent(e);
}

const deps = {
    getSpeedChangePhase: vi.fn(() => 0),
    getModalInputActive: vi.fn(() => false),
};

function setupJoystick(): HTMLElement {
    document.body.innerHTML = '<div id="touch-joystick"></div>';
    const pad = document.getElementById('touch-joystick')!;
    const btn = makeButton('touch-dpad-btn', { codes: 'ArrowLeft,KeyZ' });
    pad.appendChild(btn);
    return btn;
}

function setupActions(id: string): HTMLElement {
    document.body.innerHTML = `<div id="${id}"></div>`;
    const wrap = document.getElementById(id)!;
    const btn = makeButton('touch-action-btn', { code: 'Space' });
    wrap.appendChild(btn);
    return btn;
}

function setupSpeedPad(): { pad: HTMLElement; digit: HTMLElement; ok: HTMLElement; cancel: HTMLElement } {
    document.body.innerHTML = `
        <div id="speed-pad" class="hidden">
            <button class="speed-digit" data-digit="7">7</button>
            <button id="speed-cancel">CANCEL</button>
            <button id="speed-ok">OK</button>
        </div>`;
    return {
        pad: document.getElementById('speed-pad')!,
        digit: document.querySelector('.speed-digit') as HTMLElement,
        ok: document.getElementById('speed-ok')!,
        cancel: document.getElementById('speed-cancel')!,
    };
}

beforeEach(() => {
    document.body.innerHTML = '';
    keyEvents.length = 0;
    deps.getSpeedChangePhase.mockClear();
    deps.getModalInputActive.mockClear();
});

describe('nameKeyEvent label mapping', () => {
    it('maps letters to Key codes and digits to Digit codes', () => {
        expect(nameKeyEvent('A')).toEqual({ code: 'KeyA', key: 'A' });
        expect(nameKeyEvent('Z')).toEqual({ code: 'KeyZ', key: 'Z' });
        expect(nameKeyEvent('5')).toEqual({ code: 'Digit5', key: '5' });
        expect(nameKeyEvent('0')).toEqual({ code: 'Digit0', key: '0' });
    });

    it('returns null for non-alphanumeric labels', () => {
        expect(nameKeyEvent('⌫')).toBeNull();
        expect(nameKeyEvent('!')).toBeNull();
    });

    it('control labels map to editing keys', () => {
        expect(NAME_CONTROL_KEYS['⌫']).toBe('Backspace');
        expect(NAME_CONTROL_KEYS['␣']).toBe('Space');
        expect(NAME_CONTROL_KEYS['❌']).toBe('Escape');
        expect(NAME_CONTROL_KEYS['✅']).toBe('Enter');
    });
});

describe('initTouchControls D-pad (held buttons)', () => {
    it('pointerdown presses all bound codes once; repeat downs do not re-send', () => {
        const btn = setupJoystick();
        initTouchControls(deps);
        press(btn);
        expect(recordedKeys()).toEqual(['keydown:ArrowLeft', 'keydown:KeyZ']);

        const count = keyEvents.length;
        press(btn, 2); // second finger
        expect(keyEvents.length).toBe(count);
    });

    it('pointerup releases only when the last pointer lifts', () => {
        const btn = setupJoystick();
        initTouchControls(deps);
        press(btn);
        press(btn, 2);
        keyEvents.length = 0;
        release(btn); // one finger still down
        expect(recordedKeys().filter(k => k.startsWith('keyup'))).toEqual([]);

        release(btn, 2);
        expect(recordedKeys().filter(k => k.startsWith('keyup'))).toEqual([
            'keyup:ArrowLeft',
            'keyup:KeyZ',
        ]);
    });

    it('adds and removes the pressed class with the hold state', () => {
        const btn = setupJoystick();
        initTouchControls(deps);
        press(btn);
        expect(btn.classList.contains('pressed')).toBe(true);
        release(btn);
        expect(btn.classList.contains('pressed')).toBe(false);
    });
});

describe('initTouchControls action buttons (tap)', () => {
    it('tap sends keydown immediately and keyup on release', () => {
        const btn = setupActions('touch-actions');
        initTouchControls(deps);
        press(btn);
        expect(recordedKeys()).toEqual(['keydown:Space']);
        release(btn);
        expect(recordedKeys()).toEqual(['keydown:Space', 'keyup:Space']);
    });

    it('binds the intro actions container too', () => {
        const btn = setupActions('intro-actions');
        initTouchControls(deps);
        press(btn);
        expect(keyEvents.filter(e => e.type === 'keydown').map(e => e.code)).toEqual(['Space']);
    });
});

describe('initTouchControls speed pad', () => {
    it('digit buttons send their Digit keydown', () => {
        setupSpeedPad();
        initTouchControls(deps);
        press(document.querySelector('.speed-digit') as HTMLElement);
        expect(recordedKeys()).toEqual(['keydown:Digit7']);
    });

    it('cancel sends Escape keydown; OK sends a full Space tap', () => {
        const { ok, cancel } = setupSpeedPad();
        initTouchControls(deps);
        press(cancel);
        press(ok);
        expect(recordedKeys()).toEqual(['keydown:Escape', 'keydown:Space', 'keyup:Space']);
    });

    it('visibility follows the speed-dialog phase via the injected getter', async () => {
        vi.useFakeTimers();
        try {
            deps.getSpeedChangePhase.mockReturnValue(1);
            const { pad } = setupSpeedPad();
            initTouchControls(deps);

            vi.advanceTimersByTime(250);
            expect(pad.classList.contains('hidden')).toBe(false);
            expect(pad.classList.contains('phase-1')).toBe(true);

            deps.getSpeedChangePhase.mockReturnValue(2);
            vi.advanceTimersByTime(250);
            expect(pad.classList.contains('hidden')).toBe(false);
            expect(pad.classList.contains('phase-1')).toBe(false);

            deps.getSpeedChangePhase.mockReturnValue(0);
            vi.advanceTimersByTime(250);
            expect(pad.classList.contains('hidden')).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('initTouchControls name pad', () => {
    it('builds the A-Z/0-9 rows plus control row inside #name-pad', () => {
        document.body.innerHTML = '<div id="name-pad"></div>';
        deps.getModalInputActive.mockReturnValue(false);
        vi.useFakeTimers();
        try {
            initTouchControls(deps);
            const pad = document.getElementById('name-pad')!;
            const rows = pad.querySelectorAll('.name-pad-row');
            expect(rows).toHaveLength(5); // 4 alphanumeric + 1 control
            const allKeys = pad.querySelectorAll('.name-key');
            expect(allKeys).toHaveLength(10 + 10 + 9 + 7 + 4);

            // tapping a generated letter key emits KeyX
            const qKey = [...pad.querySelectorAll('.name-key')]
                .find(b => b.textContent === 'Q') as HTMLElement;
            press(qKey);
            expect(recordedKeys()).toEqual(['keydown:KeyQ']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('toggles hidden based on getModalInputActive polling', () => {
        document.body.innerHTML = '<div id="name-pad"></div>';
        deps.getModalInputActive.mockReturnValue(true);
        vi.useFakeTimers();
        try {
            initTouchControls(deps);
            const pad = document.getElementById('name-pad')!;
            vi.advanceTimersByTime(250);
            expect(pad.classList.contains('hidden')).toBe(false);

            deps.getModalInputActive.mockReturnValue(false);
            vi.advanceTimersByTime(250);
            expect(pad.classList.contains('hidden')).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});
