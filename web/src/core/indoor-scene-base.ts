/**
 * indoor-scene-base.ts — Base class for indoor building scenes.
 * Handles fade-in / fade-out, dispatches to subclass drawContent().
 *
 * Implements the Scene contract from core/scene.ts; subclasses (king, bank,
 * weapon shop, …) override onEnter/drawContent/handleInput as needed.
 */

import type { FadePhase, IndoorSceneDependencies, Scene, Timestamp } from './scene.js';

export class IndoorSceneBase implements Scene {
    protected readonly canvas: HTMLCanvasElement;
    protected readonly ctx: CanvasRenderingContext2D;
    protected readonly readMemory: (offset: number, length: number) => Uint8Array | null;
    protected readonly writeMemory: (offset: number, data: Uint8Array) => void;
    protected readonly finishCallback: (() => void) | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy game.js callbacks
    protected readonly soundManager: any;
    protected readonly renderGoldHud: () => void;
    protected readonly renderAlmasHud: () => void;
    protected readonly drawLifeBar: () => void;
    protected readonly setLife: (value: number, maxHp?: number) => void;
    protected readonly renderSwordHud: () => void;
    protected readonly renderMagicHud: () => void;
    protected readonly renderShieldHud: () => void;

    protected phase: FadePhase = 'idle';
    protected alpha = 0;
    protected fadeStartAlpha = 0;
    protected startTime = 0;

    // Subclasses can override these timing values
    fadeInMs = 650;
    fadeOutMs = 450;

    constructor(deps: IndoorSceneDependencies) {
        this.canvas = deps.canvas;
        this.ctx = deps.ctx;
        this.readMemory = deps.readMemory;
        this.writeMemory = deps.writeMemory;
        this.finishCallback = deps.finishCallback ?? null;
        this.soundManager = deps.soundManager;
        this.renderGoldHud = deps.renderGoldHud;
        this.renderAlmasHud = deps.renderAlmasHud;
        this.drawLifeBar = deps.drawLifeBar;
        this.setLife = deps.setLife;
        this.renderSwordHud = deps.renderSwordHud;
        this.renderMagicHud = deps.renderMagicHud;
        this.renderShieldHud = deps.renderShieldHud;
    }

    /** Called by the scene manager when entering the building */
    enter(now: Timestamp = performance.now()): void {
        this.phase = 'fadeIn';
        this.startTime = now;
        this.alpha = 0;
        this.onEnter(now);
    }

    /** Override in subclass for custom init */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected onEnter(now: Timestamp): void {}

    /**
     * Main draw call. Returns false when the scene has fully ended and
     * the manager should remove it.
     */
    draw(now: Timestamp): boolean {
        let finished = false;
        if (this.phase === 'fadeIn') {
            this.alpha = Math.min(1, (now - this.startTime) / this.fadeInMs);
            if (this.alpha >= 1) {
                this.phase = 'shown';
                this.alpha = 1;
            }
        } else if (this.phase === 'shown') {
            this.alpha = 1;
        } else if (this.phase === 'fadeOut') {
            const t = Math.min(1, (now - this.startTime) / this.fadeOutMs);
            this.alpha = this.fadeStartAlpha * (1 - t);
            if (t >= 1) {
                this.finish();
                finished = true;
            }
        }

        if (!finished) {
            this.clearAndDraw(now, this.alpha);
        }
        return !finished;
    }

    /** Clear canvas and draw content with current alpha */
    protected clearAndDraw(now: Timestamp, alpha: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawContent(now, alpha);
        ctx.restore();
    }

    /** Subclass implements: draw everything (already alpha-applied) */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected drawContent(now: Timestamp, alpha: number): void {}

    /** Handle key input. Default: if Space, start fade out */
    handleInput(key: string): void {
        if (key === 'Space') {
            this.startFadeOut(performance.now());
        }
    }

    startFadeOut(now: Timestamp = performance.now()): void {
        if (this.phase === 'fadeOut') return;
        this.phase = 'fadeOut';
        this.startTime = now;
        this.fadeStartAlpha = this.alpha;
    }

    /** Called when fadeOut completes or forced finish */
    finish(): void {
        this.phase = 'idle';
        this.alpha = 0;
        if (this.finishCallback) this.finishCallback();
    }
}
