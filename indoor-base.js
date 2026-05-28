/**
 * indoor-base.js – Base class for indoor building scenes.
 * Handles fade‑in / fade‑out, dispatches to subclass drawContent().
 */
export class IndoorSceneBase {
    constructor({
        canvas,
        ctx,
        readMemory,
        writeMemory,
        finishCallback,
        soundManager,
        drawLifeBar,
        setLife,
        renderMagicHud,
    }) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.readMemory = readMemory;
        this.writeMemory = writeMemory;
        this.finishCallback = finishCallback;
        this.soundManager = soundManager;
        this.drawLifeBar = drawLifeBar;
        this.setLife = setLife;
        this.renderMagicHud = renderMagicHud;

        this.phase = 'idle';
        this.alpha = 0;
        this.fadeStartAlpha = 0;
        this.startTime = 0;

        // Subclasses can override these timing values
        this.fadeInMs = 650;
        this.fadeOutMs = 450;
    }

    /** Called by game.js when entering the building */
    enter(now = performance.now()) {
        this.phase = 'fadeIn';
        this.startTime = now;
        this.alpha = 0;
        this.onEnter(now);
    }

    /** Override in subclass for custom init */
    onEnter(now) {}

    /**
     * Main draw call. Returns false when the scene has fully ended and
     * the manager should remove it.
     */
    draw(now) {
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
    clearAndDraw(now, alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawContent(now, alpha);
        ctx.restore();
    }

    /** Subclass implements: draw everything (already alpha‑applied) */
    drawContent(now, alpha) {}

    /** Handle key input. Default: if Space, start fade out */
    handleInput(key) {
        if (key === 'Space') {
            this.startFadeOut(performance.now());
        }
    }

    startFadeOut(now = performance.now()) {
        if (this.phase === 'fadeOut') return;
        this.phase = 'fadeOut';
        this.startTime = now;
        this.fadeStartAlpha = this.alpha;
    }

    /** Called when fadeOut completes or forced finish */
    finish() {
        this.phase = 'idle';
        this.alpha = 0;
        if (this.finishCallback) this.finishCallback();
    }
}
