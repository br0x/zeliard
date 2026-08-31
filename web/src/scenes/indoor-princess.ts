/**
 * indoor-princess.ts — the princess's chamber scene.
 *
 * Pure fade-in/hold/fade-out image scene; when the demon has been defeated
 * (g_mem death flag 0xFF), holds for 2s and routes completion to the ending
 * demo instead of the normal building exit.
 */

import { IndoorSceneBase } from '../core/indoor-scene-base.js';
import type { IndoorSceneDependencies } from '../core/scene.js';
import { ADDR_DEATH_ALREADY_PROCESSED } from '../core/memory.js';

const PRINCESS_CHAMBER_PATH = 'assets/images/omoya/princess.png';
const PRINCESS_HOLD_MS      = 2000;

export interface PrincessSceneDependencies extends IndoorSceneDependencies {
    startEndingDemo?: (() => void) | null;
}

export class PrincessScene extends IndoorSceneBase {
    private image: HTMLImageElement | null = null;
    private readonly startEndingDemo: (() => void) | null;
    private revivePrincess = false;
    private shownStartTime = 0;

    constructor(context: PrincessSceneDependencies) {
        super(context);
        this.fadeInMs = 650;
        this.fadeOutMs = 450;
        this.startEndingDemo = context.startEndingDemo ?? null;
    }

    protected override onEnter(_now: number): void {
        this.shownStartTime = 0;
        if (this.readMemory) {
            const data = this.readMemory(ADDR_DEATH_ALREADY_PROCESSED, 1);
            if (data && data[0] === 0xFF) {
                this.revivePrincess = true;
            }
        }

        this._loadImage()
            .then(img => { this.image = img; })
            .catch(e => {
                console.error('[Princess] failed to load image:', e);
                this.finish();
            });
    }

    private _loadImage(): Promise<HTMLImageElement> {
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
    draw(now: number): boolean {
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

    protected override drawContent(_now: number, _alpha: number): void {
        if (this.image) {
            this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
        }
    }

    handleInput(key: string): void {
        if (key === 'Space' && this.phase === 'shown') {
            this.startFadeOut(performance.now());
        }
    }

    /**
     * When the princess is being revived (demon defeated), route the fade-out
     * completion to the ending demo instead of the normal building exit.
     */
    finish(): void {
        this.phase = 'idle';
        this.alpha = 0;
        if (this.revivePrincess && this.startEndingDemo) {
            this.startEndingDemo();
        } else if (this.finishCallback) {
            this.finishCallback();
        }
    }

    getName(): string {
        return 'In the Hut';
    }
}
