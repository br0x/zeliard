/**
 * rokademo.ts — Tear of Esmesanti collection demo state machine.
 *
 * Runs after the hero defeats a dungeon boss and exits the boss room: the
 * hero runs to the middle of the cavern, draws his sword in a salute, the
 * Tear bursts into sparkles that fly up to its slot on the mole strip above
 * the canvas, then he sheaths and runs off.
 *
 * Pure time-driven machine: all side effects (SFX, tear theme, tear overlay)
 * are injected via `RokademoDeps`; drawing stays with the caller, which reads
 * the public fields (state, animPhase, sparkleFrame, fly, ...). Ported
 * verbatim from game.js (Stage 2).
 */

import { TILE_SIZE, VIEW_COLS } from '../config/engine.js';
import { MOLE_IMG_H, TEAR_SLOTS_BLUE, TEAR_SLOT_RED } from '../data/assets.js';

export const DMAN_FRAME_W = 72;
export const DMAN_FRAME_H = 72;
export const DMAN_SHEET_COLS = 13;
export const ROKADEMO_RUN_STEPS = 13;
export const ROKADEMO_CENTER_DX = (VIEW_COLS * TILE_SIZE - DMAN_FRAME_W) / 2;  // 300
export const ROKADEMO_HERO_Y = 12 * TILE_SIZE;                                 // 288
export const ROKADEMO_TEAR_CENTER = { x: 336, y: 235 };

export const ROKADEMO_TIMING = {
    runStepMs:     90,   // per run step (13 steps)
    standMs:       500,
    drawPhaseMs:   180,  // per draw-sword phase (5,6,7,8)
    saluteMs:      600,
    flashMs:       120,  // per small-sparkle frame
    burstMs:       260,  // per wide-sparkle burst frame
    flyTotalMs:    6200, // total flight time of the sparkle to the mole slot (~7s, like the original)
    flyFrameMs:    170,  // per alternating 2/3 sparkle frame during flight (orig: 2 steps = 169ms)
    pingEveryMs:   500,  // play "ping" roughly every half second of flight (orig: 6 steps ≈ 507ms)
    landBurstMs:   260,  // wide burst over the mole slot
    landFlashMs:   130,  // per fade sparkle over the placed tear
    sheathPhaseMs: 180,  // per sheathing phase (8,7,6,5)
    sheathPauseMs: 500,
    runoffStepMs:  90,   // per run-off step (13 steps)
    tearMusicTimeoutMs: 16000, // fail-safe: continue the demo if tear.ogg never finishes
} as const;

export type RokademoStateName =
    | 'run' | 'stand' | 'draw' | 'salute'
    | 'sparkleStart' | 'sparkleBurst' | 'sparkleFlash' | 'sparkleFly'
    | 'sparkleLand' | 'sparkleLandFlash' | 'tearMusic'
    | 'sheath' | 'runoff';

/** States in which the drawn sword overlay is visible. */
export const SWORD_VISIBLE_STATES: ReadonlySet<string> = new Set([
    'salute', 'sparkleStart', 'sparkleBurst', 'sparkleFlash',
    'sparkleFly', 'sparkleLand', 'sparkleLandFlash', 'tearMusic',
]);

export function rokademoSwordFrame(type: number): number {
    if (type <= 3) return 10;   // small sword (training / wise man's / spirit)
    if (type <= 5) return 11;   // medium sword (knight's / illumination)
    return 12;                  // large sword (enchantment)
}

/**
 * Tear slots are the top-left corner of the tear on the mole strip; this
 * returns the visual center so the flying sparkle lands on the placed tear.
 * Coordinates are integers — the Bresenham stepper only ever moves by ±1 per
 * step. The mole strip sits ABOVE the canvas, so y is negative (the sparkle
 * flies out of the canvas top toward the slot).
 */
export function rokademoSlotCenter(slot: { x: number; y: number }, isRed: boolean): { x: number; y: number } {
    const w = isRed ? 31 : 19;
    const h = isRed ? 34 : 25;
    return {
        x: Math.round(slot.x + w / 2),
        y: Math.round(-MOLE_IMG_H + slot.y + h / 2),
    };
}

/**
 * The landing sparkle itself must be visible, so clamp the burst/flash center
 * back inside the canvas (w/h are the sparkle's sprite dimensions).
 */
export function rokademoLandCenter(
    slotC: { x: number; y: number },
    w: number,
    h: number,
    viewW: number,
    viewH: number,
): { x: number; y: number } {
    return {
        x: Math.min(Math.max(slotC.x, w / 2), viewW - w / 2),
        y: Math.min(Math.max(slotC.y, h / 2), viewH - h / 2),
    };
}

export interface Bresenham {
    x: number; y: number;
    x0: number; y0: number;
    x1: number; y1: number;
    dx: number; dy: number;
    sx: number; sy: number;
    err: number;
}

export function initBresenham(x0: number, y0: number, x1: number, y1: number): Bresenham {
    return {
        x: x0, y: y0, x0, y0, x1, y1,
        dx: Math.abs(x1 - x0),
        dy: Math.abs(y1 - y0),
        sx: x0 < x1 ? 1 : -1,
        sy: y0 < y1 ? 1 : -1,
        err: Math.abs(x1 - x0) - Math.abs(y1 - y0),
    };
}

/** One Bresenham step; returns true when the target row (y <= 0) is reached. */
export function stepBresenham(b: Bresenham): boolean {
    const e2 = 2 * b.err;
    if (e2 > -b.dy) { b.err -= b.dy; b.x += b.sx; }
    if (e2 < b.dx)  { b.err += b.dx; b.y += b.sy; }
    return b.y <= 0;
}

export interface RokademoDeps {
    playSfx(id: number): void;
    /** Show `count` tears on the mole-strip overlay (idempotent in game.js). */
    setTearOverlayCount(count: number): void;
    /** Whether the tear theme can be played at all. */
    hasAudio(): boolean;
    /** Play the Tear theme once; call onEnded when it finishes. */
    playTearMusic(onEnded: () => void): void;
}

export interface RokademoGeometry {
    /** Canvas width/height used for run-off and land-clamp math. */
    viewW: number;
    viewH: number;
}

export class RokaDemo {
    tearCount = 0;
    isRed = false;
    slot: { x: number; y: number } = { x: 0, y: 0 };
    swordType = 1;
    animPhase = 0;
    tearVisible = true;
    sparkleFrame = 0;
    burstFrame = 0;
    fly: Bresenham | null = null;
    done = false;
    state: RokademoStateName = 'run';
    stateStart = 0;
    step = 0;

    private lastStompStep = -1;
    private lastPingStep = -1;
    private tearMusicDone = false;

    private readonly deps: RokademoDeps;
    private readonly geom: RokademoGeometry;

    constructor(deps: RokademoDeps, geom: RokademoGeometry) {
        this.deps = deps;
        this.geom = geom;
    }

    /**
     * Begin the demo for the given raw tear count / sword type (clamped here,
     * exactly like the legacy start). The new tear is already counted by the
     * wasm roka entrypoint, so the overlay shows only the previously
     * collected tears until the sparkle lands.
     */
    start(rawTearCount: number, rawSwordType: number, now: number): void {
        const tearCount = Math.max(1, Math.min(rawTearCount, 9));
        this.tearCount = tearCount;
        this.isRed = tearCount >= 9;
        this.slot = tearCount >= 9
            ? TEAR_SLOT_RED
            : TEAR_SLOTS_BLUE[tearCount - 1]!;
        this.swordType = Math.max(1, Math.min(6, rawSwordType || 1));
        this.animPhase = 0;
        this.tearVisible = true;
        this.sparkleFrame = 0;
        this.burstFrame = 0;
        this.fly = null;
        this.done = false;
        this.lastStompStep = -1;
        this.lastPingStep = -1;
        this.deps.setTearOverlayCount(tearCount - 1);
        this.setState('run', now);
    }

    update(now: number): void {
        const T = ROKADEMO_TIMING;
        const dt = now - this.stateStart;
        switch (this.state) {
            case 'run': {
                this.step = Math.min(ROKADEMO_RUN_STEPS, Math.floor(dt / T.runStepMs));
                this.animPhase = this.step & 3;
                if (this.step % 2 === 1 && this.lastStompStep !== this.step) {
                    this.lastStompStep = this.step;
                    this.deps.playSfx(26);
                }
                if (this.step >= ROKADEMO_RUN_STEPS) {
                    this.setState('stand', now);
                    this.animPhase = 4;
                }
                break;
            }
            case 'stand':
                this.animPhase = 4;
                if (dt >= T.standMs) {
                    this.setState('draw', now);
                    this.animPhase = 5;
                }
                break;
            case 'draw': {
                const i = Math.min(4, Math.floor(dt / T.drawPhaseMs));
                this.animPhase = 5 + i;
                if (dt >= 4 * T.drawPhaseMs) {
                    this.setState('salute', now);
                    this.animPhase = 9;
                }
                break;
            }
            case 'salute':
                this.animPhase = 9;
                if (dt >= T.saluteMs) {
                    this.setState('sparkleStart', now);
                    this.sparkleFrame = 0;
                }
                break;
            case 'sparkleStart':
                this.animPhase = 9;
                this.sparkleFrame = Math.min(1, Math.floor(dt / T.flashMs));
                if (dt >= 2 * T.flashMs) {
                    this.setState('sparkleBurst', now);
                    this.burstFrame = 0;
                    this.deps.playSfx(27);
                }
                break;
            case 'sparkleBurst':
                this.animPhase = 9;
                this.burstFrame = Math.min(1, Math.floor(dt / T.burstMs));
                if (dt >= 2 * T.burstMs) {
                    this.tearVisible = false;   // the tear bursts and flies to the mole
                    this.setState('sparkleFlash', now);
                    this.sparkleFrame = 0;
                }
                break;
            case 'sparkleFlash':
                this.animPhase = 9;
                this.sparkleFrame = Math.min(3, Math.floor(dt / T.flashMs));
                if (dt >= 4 * T.flashMs) {
                    this.setState('sparkleFly', now);
                    const c = rokademoSlotCenter(this.slot, this.isRed);
                    this.fly = initBresenham(
                        ROKADEMO_TEAR_CENTER.x, ROKADEMO_TEAR_CENTER.y,
                        c.x, c.y
                    );
                }
                break;
            case 'sparkleFly': {
                this.animPhase = 9;
                if (this.fly) {
                    // The flight is time-based, not framerate-bound: the
                    // sparkle travels the whole path in flyTotalMs regardless
                    // of refresh rate (the original waits ~84.5ms per step on
                    // a 236.7Hz timer).
                    const totalSteps = Math.max(
                        Math.abs(this.fly.x1 - this.fly.x0),
                        Math.abs(this.fly.y1 - this.fly.y0)
                    );
                    const targetStep = Math.min(totalSteps,
                        Math.floor(dt / T.flyTotalMs * totalSteps));
                    while (this.step < targetStep) {
                        this.step++;
                        if (stepBresenham(this.fly)) {
                            this.setState('sparkleLand', now);
                            this.burstFrame = 0;
                            this.deps.playSfx(27);
                            break;
                        }
                    }
                    // Alternating 2/3 sparkle frame, ~170ms each like the original.
                    this.sparkleFrame = 2 + ((Math.floor(dt / T.flyFrameMs)) & 1);
                    // "ping" roughly every half second of flight, like the original.
                    const pings = Math.floor(dt / T.pingEveryMs);
                    if (pings > this.lastPingStep) {
                        this.lastPingStep = pings;
                        this.deps.playSfx(28);
                    }
                } else {
                    this.setState('sparkleLand', now);
                    this.burstFrame = 0;
                }
                break;
            }
            case 'sparkleLand':
                this.animPhase = 9;
                this.burstFrame = Math.min(1, Math.floor(dt / T.landBurstMs));
                if (dt >= 2 * T.landBurstMs) {
                    this.deps.setTearOverlayCount(this.tearCount);   // the tear appears in its mole slot
                    this.setState('sparkleLandFlash', now);
                    this.sparkleFrame = 4;
                }
                break;
            case 'sparkleLandFlash': {
                this.animPhase = 9;
                this.sparkleFrame = Math.max(0, 4 - Math.floor(dt / T.landFlashMs));
                if (dt >= 4 * T.landFlashMs) {
                    // The Tear is in place: hold the salute while the Tear
                    // theme plays once; only finish the salute once it ended.
                    this.setState('tearMusic', now);
                    this.tearMusicDone = false;
                    if (this.deps.hasAudio()) {
                        this.deps.playTearMusic(() => { this.tearMusicDone = true; });
                    } else {
                        this.tearMusicDone = true;   // audio unavailable: don't stall the demo
                    }
                }
                break;
            }
            case 'tearMusic':
                this.animPhase = 9;   // keep saluting while the Tear theme plays
                if (this.tearMusicDone || dt >= T.tearMusicTimeoutMs) {
                    this.setState('sheath', now);
                }
                break;
            case 'sheath': {
                const i = Math.min(4, Math.floor(dt / T.sheathPhaseMs));
                this.animPhase = 9 - i;   // 9,8,7,6,5
                if (dt >= 4 * T.sheathPhaseMs + T.sheathPauseMs) {
                    this.setState('runoff', now);
                }
                break;
            }
            case 'runoff':
                this.step = Math.min(ROKADEMO_RUN_STEPS, Math.floor(dt / T.runoffStepMs));
                this.animPhase = this.step & 3;
                if (this.step % 2 === 1 && this.lastStompStep !== this.step) {
                    this.lastStompStep = this.step;
                    this.deps.playSfx(26);
                }
                if (this.step >= ROKADEMO_RUN_STEPS) {
                    this.done = true;
                }
                break;
        }
    }

    /** Hero sprite x-offset for the current run/run-off step. */
    heroDx(): number {
        const center = ROKADEMO_CENTER_DX;
        const s = Math.min(ROKADEMO_RUN_STEPS, this.step + 1);
        if (this.state === 'runoff') {
            const end = this.geom.viewW - DMAN_FRAME_W;
            return Math.round(center + (end - center) * s / ROKADEMO_RUN_STEPS);
        }
        return Math.round(center * s / ROKADEMO_RUN_STEPS);
    }

    private setState(state: RokademoStateName, now: number): void {
        this.state = state;
        this.stateStart = now;
        this.step = 0;
    }
}
