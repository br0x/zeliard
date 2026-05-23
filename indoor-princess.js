import { IndoorSceneBase } from './indoor-base.js';

const PRINCESS_CHAMBER_PATH = 'assets/images/omoya/princess.png';

export class PrincessScene extends IndoorSceneBase {
    constructor(context) {
        super(context);
        this.image = null;
        this.fadeInMs = 650;
        this.fadeOutMs = 450;
    }

    async onEnter(now) {
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
}
