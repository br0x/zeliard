/**
 * touch-input.ts – On-screen touch controls for the Zeliard web port.
 *
 * In "smartphone mode" this shows a D-pad left of the game, three action
 * buttons to the right, and a digit pad for the speed-change dialog. All
 * buttons drive the existing game input by dispatching synthetic keyboard
 * events, so modal / inventory / conversation routing keeps working.
 *
 * The binding logic lives in initTouchControls(deps) so tests can drive it
 * with fakes; main.ts calls it at boot on touch devices.
 */

export interface TouchInputDeps {
    /** Current speed-change dialog phase (0 = closed). */
    getSpeedChangePhase(): number;
    /** True while a modal dialog's text-input field has focus. */
    getModalInputActive(): boolean;
}

export type SendKeyFn = (type: 'keydown' | 'keyup', code: string) => void;

const heldCodes = new Set<string>();

/** Send a synthetic keyboard event through the window (game input channel). */
function makeSendKey(target: Window): SendKeyFn {
    return (type, code) => {
        target.dispatchEvent(new KeyboardEvent(type, {
            code,
            key: code,
            bubbles: true,
            cancelable: true,
        }));
    };
}

/** Release every held key if the page loses focus/visibility, so a missed
 *  pointerup never leaves the game stuck with a button held down. */
function releaseAllHeld(sendKey: SendKeyFn, doc: Document): void {
    if (heldCodes.size === 0) return;
    heldCodes.forEach(code => sendKey('keyup', code));
    heldCodes.clear();
    doc.querySelectorAll('.touch-controls .pressed').forEach(el => {
        el.classList.remove('pressed');
    });
}

// ─── D-pad / joystick (held buttons) ─────────────────────────────────────────
function bindHoldButton(btn: HTMLElement, sendKey: SendKeyFn): void {
    const codes = (btn.dataset.codes ?? '').split(',');
    const pointers = new Set<number>();

    btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (pointers.size === 0) {
            btn.classList.add('pressed');
            codes.forEach(code => { heldCodes.add(code); sendKey('keydown', code); });
        }
        pointers.add(e.pointerId);
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });

    const release = (e: PointerEvent) => {
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
function bindTapButton(btn: HTMLElement, sendKey: SendKeyFn): void {
    const code = btn.dataset.code ?? '';
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

interface FullscreenDocument extends Document {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
}

interface FullscreenElement extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
}

// ─── Fullscreen toggle (hide browser chrome on smartphones) ───────────────────
async function enterFullscreen(doc: Document): Promise<void> {
    const elem = doc.documentElement as FullscreenElement;

    if (elem.requestFullscreen) {
        await elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen(); // Safari
    }
}

function initFullscreenToggle(doc: Document): void {
    const btn = doc.getElementById('fullscreen-toggle');
    if (!btn) return;
    const fdoc = doc as FullscreenDocument;
    btn.addEventListener('click', async () => {
        try {
            if (doc.fullscreenElement || fdoc.webkitFullscreenElement) {
                await (doc.exitFullscreen?.() ?? fdoc.webkitExitFullscreen?.());
            } else {
                await enterFullscreen(doc);
            }
        } catch (err) {
            console.warn('[Fullscreen] failed:', err);
        }
    });
}

// ─── Cancel / Back (Esc) button ───────────────────────────────────────────────
function initEscapeToggle(sendKey: SendKeyFn, doc: Document): void {
    const btn = doc.getElementById('escape-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
        sendKey('keydown', 'Escape');
        sendKey('keyup', 'Escape');
    });
}

// ─── Settings menu (F1/F2/F7/F8/F9) ──────────────────────────────────────────
function initSettingsMenu(sendKey: SendKeyFn, doc: Document): void {
    const toggle = doc.getElementById('settings-toggle');
    const panel = doc.getElementById('settings-panel');
    if (!toggle || !panel) return;

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
    });

    panel.querySelectorAll('button[data-key]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = (btn as HTMLElement).dataset.key;
            if (!key) return;
            sendKey('keydown', key);
            sendKey('keyup', key);
            panel.classList.add('hidden');
        });
    });

    doc.addEventListener('click', e => {
        if (panel.classList.contains('hidden')) return;
        const fsBtn = doc.getElementById('fullscreen-toggle');
        const target = e.target instanceof Node ? e.target : null;
        if (!target) return;
        if (panel.contains(target) || toggle.contains(target) || (fsBtn && fsBtn.contains(target))) return;
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
] as const;

/** Alphanumeric label → synthetic KeyboardEvent code ("A"→"KeyA", "5"→"Digit5"). */
export function nameKeyEvent(label: string): { code: string; key: string } | null {
    if (/^[A-Z]$/.test(label)) return { code: 'Key' + label, key: label };
    if (/^[0-9]$/.test(label)) return { code: 'Digit' + label, key: label };
    return null;
}

/** Control-label → KeyboardEvent.code mapping used by the name pad. */
export const NAME_CONTROL_KEYS: Readonly<Record<string, string>> = {
    '⌫': 'Backspace',
    '␣': 'Space',
    '❌': 'Escape',
    '✅': 'Enter',
};

function makeNameKey(label: string, sendKey: SendKeyFn, doc: Document, extraClass = ''): HTMLButtonElement {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'name-key' + (extraClass ? ' ' + extraClass : '');
    btn.textContent = label;
    btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        const code = nameKeyEvent(label)?.code ?? NAME_CONTROL_KEYS[label];
        if (code) sendKey('keydown', code);
    });
    return btn;
}

function initNamePad(deps: TouchInputDeps, sendKey: SendKeyFn, doc: Document): void {
    const pad = doc.getElementById('name-pad');
    if (!pad) return;

    for (const row of NAME_KEY_ROWS) {
        const rowEl = doc.createElement('div');
        rowEl.className = 'name-pad-row';
        for (const label of row) rowEl.appendChild(makeNameKey(label, sendKey, doc));
        pad.appendChild(rowEl);
    }

    const controlRow = doc.createElement('div');
    controlRow.className = 'name-pad-row';
    controlRow.appendChild(makeNameKey('⌫', sendKey, doc, 'name-key--wide'));
    controlRow.appendChild(makeNameKey('␣', sendKey, doc, 'name-key--wide'));
    controlRow.appendChild(makeNameKey('❌', sendKey, doc, 'name-key--cancel'));
    controlRow.appendChild(makeNameKey('✅', sendKey, doc, 'name-key--ok'));
    pad.appendChild(controlRow);

    setInterval(() => {
        pad.classList.toggle('hidden', !deps.getModalInputActive());
    }, 200);
}

// ─── Speed-change digit pad (mobile F9) ──────────────────────────────────────
function initSpeedPad(deps: TouchInputDeps, sendKey: SendKeyFn, doc: Document): void {
    const pad = doc.getElementById('speed-pad');
    if (!pad) return;

    pad.querySelectorAll<HTMLElement>('.speed-digit').forEach(btn => {
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
        const phase = deps.getSpeedChangePhase();
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
function fitLayoutToViewport(win: Window, doc: Document): void {
    const wrapper = doc.getElementById('layout-wrapper');
    if (!wrapper) return;
    const wrapperEl = wrapper as HTMLElement & { _fitTransform?: string };

    const apply = () => {
        if (wrapperEl.classList.contains('hidden')) return;

        // Measure the natural (unscaled) content bounds of the flex children.
        const prev = wrapperEl.style.transform;
        wrapperEl.style.transform = 'none';
        const wRect = wrapperEl.getBoundingClientRect();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const el of wrapperEl.children) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            minX = Math.min(minX, r.left - wRect.left);
            maxX = Math.max(maxX, r.right - wRect.left);
            minY = Math.min(minY, r.top - wRect.top);
            maxY = Math.max(maxY, r.bottom - wRect.top);
        }
        wrapperEl.style.transform = prev;
        if (!isFinite(minX)) return;

        const cw = maxX - minX;
        const ch = maxY - minY;
        const pad = 8;
        const scale = Math.min(
            1,
            (win.innerWidth - pad) / cw,
            (win.innerHeight - pad) / ch
        );

        // translate+scale around the wrapper's top-left so the scaled
        // content stays centered in the viewport.
        const tx = win.innerWidth / 2 - wRect.left - scale * (minX + maxX) / 2;
        const ty = win.innerHeight / 2 - wRect.top - scale * (minY + maxY) / 2;
        const t = scale >= 1 ? 'none' : `translate(${tx}px, ${ty}px) scale(${scale})`;

        if (wrapperEl._fitTransform !== t) {
            wrapperEl._fitTransform = t;
            wrapperEl.style.transformOrigin = '0 0';
            wrapperEl.style.transform = t;
        }
    };

    apply();
    win.addEventListener('resize', apply);
    win.addEventListener('orientationchange', apply);
    win.addEventListener('load', apply);
    if (typeof ResizeObserver !== 'undefined') {
        // The wrapper's own box stops changing once content settles, so
        // observe the children too – otherwise a measurement taken while the
        // game/canvas was still sizing up is never corrected.
        const ro = new ResizeObserver(apply);
        ro.observe(wrapperEl);
        for (const el of wrapperEl.children) ro.observe(el);
    }

    // The game content keeps sizing up during the intro/startup, and no
    // resize/observer event is guaranteed to fire once the wrapper's own box
    // is stable. Poll briefly while the layout is visible so the fit
    // converges after the canvas/HUD reach their final size.
    const startedAt = performance.now();
    const poll = () => {
        if (wrapperEl.classList.contains('hidden')) {
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

/** Activate smartphone-mode controls. No-op-safe to call once at boot. */
export function initTouchControls(deps: TouchInputDeps): void {
    const sendKey = makeSendKey(window);

    document.body.classList.add('touch-mode');

    initSettingsMenu(sendKey, document);
    initFullscreenToggle(document);
    initEscapeToggle(sendKey, document);

    const joystick = document.getElementById('touch-joystick');
    const actions = document.getElementById('touch-actions');
    const introActions = document.getElementById('intro-actions');

    joystick?.querySelectorAll<HTMLElement>('.touch-dpad-btn').forEach(btn => bindHoldButton(btn, sendKey));
    actions?.querySelectorAll<HTMLElement>('.touch-action-btn').forEach(btn => bindTapButton(btn, sendKey));
    introActions?.querySelectorAll<HTMLElement>('.touch-action-btn').forEach(btn => bindTapButton(btn, sendKey));

    initSpeedPad(deps, sendKey, document);
    initNamePad(deps, sendKey, document);
    fitLayoutToViewport(window, document);

    // Release held keys on blur/visibility loss.
    window.addEventListener('blur', () => releaseAllHeld(sendKey, document));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) releaseAllHeld(sendKey, document);
    });
}

/** True on coarse-pointer touch devices (phones/tablets). */
export function detectTouchDevice(win: Navigator & { maxTouchPoints: number }, docWindow: Window): boolean {
    return win.maxTouchPoints > 0 && docWindow.matchMedia('(pointer: coarse)').matches;
}
