// touch-controls.js – On-screen touch controls for the Zeliard web port.
//
// In "smartphone mode" this shows a D-pad left of the game, three action
// buttons to the right, and a digit pad for the speed-change dialog. All
// buttons drive the existing game input by dispatching synthetic keyboard
// events, so modal / inventory / conversation routing keeps working.
import { getSpeedChangePhase } from './game.js';

const useTouchControls =
    navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;

const heldCodes = new Set();

function sendKey(type, code) {
    window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code,
        bubbles: true,
        cancelable: true,
    }));
}

// Release every held key if the page loses focus/visibility, so a missed
// pointerup never leaves the game stuck with a button held down.
function releaseAllHeld() {
    if (heldCodes.size === 0) return;
    heldCodes.forEach(code => sendKey('keyup', code));
    heldCodes.clear();
    document.querySelectorAll('.touch-controls .pressed').forEach(el => {
        el.classList.remove('pressed');
    });
}
window.addEventListener('blur', releaseAllHeld);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllHeld();
});

// ─── D-pad / joystick (held buttons) ─────────────────────────────────────────
function bindHoldButton(btn) {
    const codes = btn.dataset.codes.split(',');
    const pointers = new Set();

    btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (pointers.size === 0) {
            btn.classList.add('pressed');
            codes.forEach(code => { heldCodes.add(code); sendKey('keydown', code); });
        }
        pointers.add(e.pointerId);
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });

    const release = e => {
        pointers.delete(e.pointerId);
        if (pointers.size === 0) {
            btn.classList.remove('pressed');
            codes.forEach(code => { heldCodes.delete(code); sendKey('keyup', code); });
        }
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
}

// ─── Action buttons (tap = press + release) ──────────────────────────────────
function bindTapButton(btn) {
    const code = btn.dataset.code;
    btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        btn.classList.add('pressed');
        heldCodes.add(code);
        sendKey('keydown', code);
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    const release = () => {
        btn.classList.remove('pressed');
        heldCodes.delete(code);
        sendKey('keyup', code);
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
}

// ─── Settings menu (F1/F2/F7/F8/F9) ──────────────────────────────────────────
function initSettingsMenu() {
    const toggle = document.getElementById('settings-toggle');
    const panel = document.getElementById('settings-panel');
    if (!toggle || !panel) return;

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
    });

    panel.querySelectorAll('button[data-key]').forEach(btn => {
        btn.addEventListener('click', () => {
            sendKey('keydown', btn.dataset.key);
            sendKey('keyup', btn.dataset.key);
            panel.classList.add('hidden');
        });
    });

    document.addEventListener('click', e => {
        if (panel.classList.contains('hidden')) return;
        if (panel.contains(e.target) || toggle.contains(e.target)) return;
        panel.classList.add('hidden');
    });
}

// ─── Speed-change digit pad (mobile F9) ──────────────────────────────────────
function initSpeedPad() {
    const pad = document.getElementById('speed-pad');
    if (!pad) return;

    pad.querySelectorAll('.speed-digit').forEach(btn => {
        btn.addEventListener('pointerdown', e => {
            e.preventDefault();
            sendKey('keydown', 'Digit' + btn.dataset.digit);
        });
    });

    const cancelBtn = pad.querySelector('#speed-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('pointerdown', e => {
            e.preventDefault();
            sendKey('keydown', 'Escape');
        });
    }

    const okBtn = pad.querySelector('#speed-ok');
    if (okBtn) {
        okBtn.addEventListener('pointerdown', e => {
            e.preventDefault();
            sendKey('keydown', 'Space');
            sendKey('keyup', 'Space');
        });
    }

    setInterval(() => {
        const phase = getSpeedChangePhase();
        if (phase === 1) {
            pad.classList.remove('hidden');
            pad.classList.add('phase-1');
        } else if (phase === 2) {
            pad.classList.remove('hidden');
            pad.classList.remove('phase-1');
        } else {
            pad.classList.add('hidden');
        }
    }, 200);
}

// ─── Fit the 1200px layout onto a phone screen ───────────────────────────────
function fitLayoutToViewport() {
    const wrapper = document.getElementById('layout-wrapper');
    if (!wrapper) return;

    const fit = () => {
        const w = wrapper.offsetWidth;
        const h = wrapper.offsetHeight;
        if (!w || !h) return;
        const pad = 8;
        const scale = Math.min(
            1,
            (window.innerWidth - pad) / w,
            (window.innerHeight - pad) / h
        );
        if (wrapper._fitScale !== scale) {
            wrapper._fitScale = scale;
            wrapper.style.transform = `scale(${scale})`;
            wrapper.style.transformOrigin = 'top center';
        }
    };

    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(fit).observe(wrapper);
    }
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init() {
    if (!useTouchControls) return;

    document.body.classList.add('touch-mode');

    initSettingsMenu();

    const joystick = document.getElementById('touch-joystick');
    const actions = document.getElementById('touch-actions');

    joystick?.querySelectorAll('.touch-dpad-btn').forEach(bindHoldButton);
    actions?.querySelectorAll('.touch-action-btn').forEach(bindTapButton);

    initSpeedPad();
    fitLayoutToViewport();
}

init();
