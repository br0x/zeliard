// touch-controls.js – On-screen touch controls for the Zeliard web port.
//
// In "smartphone mode" this shows a D-pad left of the game, three action
// buttons to the right, and a digit pad for the speed-change dialog. All
// buttons drive the existing game input by dispatching synthetic keyboard
// events, so modal / inventory / conversation routing keeps working.
import { getSpeedChangePhase, getModalInputActive } from '../main.js';

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

// ─── Fullscreen toggle (hide browser chrome on smartphones) ───────────────────
async function enterFullscreen() {
    const elem = document.documentElement;

    if (elem.requestFullscreen) {
        await elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen(); // Safari
    }
}

function initFullscreenToggle() {
    const btn = document.getElementById('fullscreen-toggle');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        try {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
            } else {
                await enterFullscreen();
            }
        } catch (err) {
            console.warn('[Fullscreen] failed:', err);
        }
    });
}

// ─── Cancel / Back (Esc) button ───────────────────────────────────────────────
function initEscapeToggle() {
    const btn = document.getElementById('escape-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
        sendKey('keydown', 'Escape');
        sendKey('keyup', 'Escape');
    });
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
        const fsBtn = document.getElementById('fullscreen-toggle');
        if (panel.contains(e.target) || toggle.contains(e.target) || fsBtn?.contains(e.target)) return;
        panel.classList.add('hidden');
    });
}

// ─── Save-name on-screen keyboard (mobile) ───────────────────────────────────
// The save dialog's name field only accepts real keyboard events, which a
// phone has no way to produce — so show a tappable A-Z/0-9 pad and feed it
// through the same synthetic-keyboard channel as the other touch controls.
const NAME_KEY_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

function nameKeyEvent(label) {
    if (/^[A-Z]$/.test(label)) return { code: 'Key' + label, key: label };
    if (/^[0-9]$/.test(label)) return { code: 'Digit' + label, key: label };
    return null;
}

const NAME_CONTROL_KEYS = {
    '⌫': 'Backspace',
    '␣': 'Space',
    '❌': 'Escape',
    '✅': 'Enter',
};

function makeNameKey(label, extraClass = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'name-key' + (extraClass ? ' ' + extraClass : '');
    btn.textContent = label;
    btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        const code = (nameKeyEvent(label)?.code) ?? NAME_CONTROL_KEYS[label];
        if (code) sendKey('keydown', code);
    });
    return btn;
}

function initNamePad() {
    const pad = document.getElementById('name-pad');
    if (!pad) return;

    for (const row of NAME_KEY_ROWS) {
        const rowEl = document.createElement('div');
        rowEl.className = 'name-pad-row';
        for (const label of row) rowEl.appendChild(makeNameKey(label));
        pad.appendChild(rowEl);
    }

    const controlRow = document.createElement('div');
    controlRow.className = 'name-pad-row';
    controlRow.appendChild(makeNameKey('⌫', 'name-key--wide'));
    controlRow.appendChild(makeNameKey('␣', 'name-key--wide'));
    controlRow.appendChild(makeNameKey('❌', 'name-key--cancel'));
    controlRow.appendChild(makeNameKey('✅', 'name-key--ok'));
    pad.appendChild(controlRow);

    setInterval(() => {
        pad.classList.toggle('hidden', !getModalInputActive());
    }, 200);
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

    const apply = () => {
        if (wrapper.classList.contains('hidden')) return;

        // Measure the natural (unscaled) content bounds of the flex children.
        const prev = wrapper.style.transform;
        wrapper.style.transform = 'none';
        const wRect = wrapper.getBoundingClientRect();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const el of wrapper.children) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            minX = Math.min(minX, r.left - wRect.left);
            maxX = Math.max(maxX, r.right - wRect.left);
            minY = Math.min(minY, r.top - wRect.top);
            maxY = Math.max(maxY, r.bottom - wRect.top);
        }
        wrapper.style.transform = prev;
        if (!isFinite(minX)) return;

        const cw = maxX - minX;
        const ch = maxY - minY;
        const pad = 8;
        const scale = Math.min(
            1,
            (window.innerWidth - pad) / cw,
            (window.innerHeight - pad) / ch
        );

        // translate+scale around the wrapper's top-left so the scaled
        // content stays centered in the viewport.
        const tx = window.innerWidth / 2 - wRect.left - scale * (minX + maxX) / 2;
        const ty = window.innerHeight / 2 - wRect.top - scale * (minY + maxY) / 2;
        const t = scale >= 1 ? 'none' : `translate(${tx}px, ${ty}px) scale(${scale})`;

        if (wrapper._fitTransform !== t) {
            wrapper._fitTransform = t;
            wrapper.style.transformOrigin = '0 0';
            wrapper.style.transform = t;
        }
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('load', apply);
    if (typeof ResizeObserver !== 'undefined') {
        // The wrapper's own box stops changing once content settles, so
        // observe the children too – otherwise a measurement taken while the
        // game/canvas was still sizing up is never corrected.
        const ro = new ResizeObserver(apply);
        ro.observe(wrapper);
        for (const el of wrapper.children) ro.observe(el);
    }

    // The game content keeps sizing up during the intro/startup, and no
    // resize/observer event is guaranteed to fire once the wrapper's own box
    // is stable. Poll briefly while the layout is visible so the fit
    // converges after the canvas/HUD reach their final size.
    const startedAt = performance.now();
    const poll = () => {
        if (wrapper.classList.contains('hidden')) {
            requestAnimationFrame(poll);
            return;
        }
        apply();
        if (performance.now() - startedAt < 10000) {
            requestAnimationFrame(poll);
        }
    };
    requestAnimationFrame(poll);
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init() {
    if (!useTouchControls) return;

    document.body.classList.add('touch-mode');

    initSettingsMenu();
    initFullscreenToggle();
    initEscapeToggle();

    const joystick = document.getElementById('touch-joystick');
    const actions = document.getElementById('touch-actions');
    const introActions = document.getElementById('intro-actions');

    joystick?.querySelectorAll('.touch-dpad-btn').forEach(bindHoldButton);
    actions?.querySelectorAll('.touch-action-btn').forEach(bindTapButton);
    introActions?.querySelectorAll('.touch-action-btn').forEach(bindTapButton);

    initSpeedPad();
    initNamePad();
    fitLayoutToViewport();
}

init();
