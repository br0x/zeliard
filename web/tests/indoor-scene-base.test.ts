import { describe, expect, it, vi } from 'vitest';
import { IndoorSceneBase } from '../src/core/indoor-scene-base.js';
import type { IndoorSceneDependencies } from '../src/core/scene.js';

/** Minimal fake 2D context (only what clearAndDraw touches). */
function fakeCtx() {
    return {
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(),
        textBaseline: '',
        globalAlpha: 1,
        fillStyle: '',
    };
}

function makeScene() {
    const ctx = fakeCtx();
    const deps = {
        canvas: { width: 320, height: 200 },
        ctx,
        readMemory: () => null,
        writeMemory: () => {},
        finishCallback: vi.fn(),
        soundManager: {},
        renderGoldHud: vi.fn(),
        renderAlmasHud: vi.fn(),
        drawLifeBar: vi.fn(),
        setLife: vi.fn(),
        renderSwordHud: vi.fn(),
        renderMagicHud: vi.fn(),
        renderShieldHud: vi.fn(),
    } as unknown as IndoorSceneDependencies;

    const drawn: Array<{ now: number; alpha: number }> = [];
    class TestScene extends IndoorSceneBase {
        constructor() {
            super(deps);
            this.fadeInMs = 100;
            this.fadeOutMs = 50;
        }
        protected drawContent(now: number, alpha: number): void {
            drawn.push({ now, alpha });
        }
    }
    return { scene: new TestScene(), drawn, ctx, finishCallback: deps.finishCallback as ReturnType<typeof vi.fn> };
}

describe('IndoorSceneBase fade lifecycle', () => {
    it('fades in over fadeInMs then holds', () => {
        const { scene, drawn } = makeScene();
        scene.enter(0);

        expect(scene.draw(0)).toBe(true); // alpha 0
        expect(scene.draw(50)).toBe(true); // halfway
        expect(drawn.at(-1)!.alpha).toBeCloseTo(0.5);
        expect(scene.draw(100)).toBe(true);
        expect(drawn.at(-1)!.alpha).toBe(1); // fully shown
        expect(scene.draw(500)).toBe(true); // holds indefinitely
        expect(drawn.at(-1)!.alpha).toBe(1);
    });

    it('handleInput Space starts fade-out; draw reports completion', () => {
        const { scene } = makeScene();
        const spy = vi.spyOn(scene, 'startFadeOut');

        scene.handleInput('Space');
        expect(spy).toHaveBeenCalledTimes(1);

        // Drive the fade with deterministic timestamps.
        scene.enter(0);
        scene.draw(100); // shown
        scene.startFadeOut(100);
        expect(scene.draw(125)).toBe(true); // mid-fade
        expect(scene.draw(150)).toBe(false); // t=1 -> finished
    });

    it('finish() resets phase and invokes the finish callback', () => {
        const { scene, finishCallback } = makeScene();
        scene.enter(0);
        scene.startFadeOut(0);
        scene.finish();
        expect(finishCallback).toHaveBeenCalled();
    });

    it('fade-out starts from the current alpha, not 1', () => {
        const { scene, drawn } = makeScene();
        scene.enter(0);
        scene.draw(0); // interrupted during fade-in at alpha ~0
        scene.handleInput('Space');
        scene.draw(10);
        // fadeStartAlpha was captured low, so alpha stays below it and decays.
        expect(drawn.every((d) => d.alpha <= 0.5)).toBe(true);
    });
});
