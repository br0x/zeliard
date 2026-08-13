import { IndoorSceneBase } from './indoor-base.js';

const PRINCESS_CHAMBER_PATH = 'assets/images/omoya/princess.png';
const PRINCESS_HOLD_MS      = 2000;

const ADDR_DEATH_ALREADY_PROCESSED = 0x49;

export class PrincessScene extends IndoorSceneBase {
    constructor(context) {
        super(context);
        this.image = null;
        this.fadeInMs = 650;
        this.fadeOutMs = 450;
        this.startEndingDemo = context.startEndingDemo;
        this.revivePrincess = false;
        this.shownStartTime = 0;
    }

    async onEnter(now) {
        this.shownStartTime = 0;
        if (this.readMemory) {
            const death = this.readMemory(ADDR_DEATH_ALREADY_PROCESSED, 1)[0];
            if (death === 0xFF) {
                this.revivePrincess = true;
            }
        }

        try {
            this.image = await this._loadImage();
        } catch (e) {
            console.error('[Princess] failed to load image:', e);
            this.finish();
        }
    }

    _loadImage() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load princess image'));
            img.src = PRINCESS_CHAMBER_PATH;
        });
    }

    /**
     * After the fade-in completes, if the demon has been defeated, hold for
     * 2 seconds before fading out so the ending demo can take over.
     */
    draw(now) {
        if (this.phase === 'shown' && this.revivePrincess) {
            if (!this.shownStartTime) {
                this.shownStartTime = now;
            }
            if (now - this.shownStartTime >= PRINCESS_HOLD_MS) {
                this.startFadeOut(now);
            }
        }
        return super.draw(now);
    }

    drawContent(now, alpha) {
        if (this.image) {
            this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
        }
    }

    handleInput(key) {
        if (key === 'Space' && this.phase === 'shown') {
            this.startFadeOut(performance.now());
        }
    }

    /**
     * When the princess is being revived (demon defeated), route the fade-out
     * completion to the ending demo instead of the normal building exit.
     */
    finish() {
        this.phase = 'idle';
        this.alpha = 0;
        if (this.revivePrincess && this.startEndingDemo) {
            this.startEndingDemo();
        } else if (this.finishCallback) {
            this.finishCallback();
        }
    }

    getName() {
        return 'In the Hut';
    }
}
