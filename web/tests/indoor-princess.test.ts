// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrincessScene } from '../src/scenes/indoor-princess.js';
import type { IndoorSceneDependencies } from '../src/core/scene.js';
import { createLiveHeroState } from '../src/core/game-state.js';

const CTX = {
    save() {}, restore() {}, fillRect() {}, drawImage() {},
    fillText() {},
} as unknown as CanvasRenderingContext2D;

const CANVAS = { width: 672, height: 432 } as HTMLCanvasElement;

function makeDeps(overrides: Partial<IndoorSceneDependencies> & {
    memory?: Record<number, number>;
    startEndingDemo?: () => void;
} = {}) {
    const buf = new Uint8Array(0x10000);
    const mem = overrides.memory ?? {};
    for (const [k, v] of Object.entries(mem)) buf[Number(k)] = v & 0xFF;
    return {
        canvas: CANVAS,
        ctx: CTX,
        heroState: createLiveHeroState(buf),
        readMemory: vi.fn((offset: number, length: number) => buf.subarray(offset, offset + length)),
        writeMemory: vi.fn(),
        finishCallback: vi.fn(),
        soundManager: {},
        renderGoldHud: vi.fn(),
        renderAlmasHud: vi.fn(),
        drawLifeBar: vi.fn(),
        setLife: vi.fn(),
        renderSwordHud: vi.fn(),
        renderMagicHud: vi.fn(),
        renderShieldHud: vi.fn(),
        ...overrides,
    } as IndoorSceneDependencies;
}

/** Stub the global Image so _loadImage resolves immediately. */
function stubImage(): void {
    class FakeImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';
        width = 672;
        height = 432;
        constructor() {
            setTimeout(() => this.onload?.(), 0);
        }
    }
    vi.stubGlobal('Image', FakeImage);
}

beforeEach(() => {
    document.body.innerHTML = '';
    // deterministic clock: the scene's handleInput()/startFadeOut() defaults
    // call performance.now()
    vi.spyOn(performance, 'now').mockReturnValue(2000);
});
afterEach(() => {
    vi.unstubAllGlobals();
});

async function enterWith(depsOverrides: Parameters<typeof makeDeps>[0] = {}) {
    stubImage();
    const deps = makeDeps(depsOverrides);
    const scene = new PrincessScene(deps);
    // expose protected state through any-cast for lifecycle assertions
    const s = scene as unknown as {
        phase: string; alpha: number; revivePrincess: boolean; image: unknown;
    };
    scene.enter(1000);
    await new Promise(r => setTimeout(r, 0)); // let the image promise settle
    return { scene, s, deps };
}

describe('PrincessScene entry', () => {
    it('fades in over 650ms', async () => {
        const { scene, s } = await enterWith();
        expect(s.phase).toBe('fadeIn');
        scene.draw(1000);
        expect(s.alpha).toBe(0);
        scene.draw(1400); // ~60% through
        expect(s.alpha).toBeCloseTo(400 / 650, 1);
        scene.draw(1700);
        expect(s.phase).toBe('shown');
        expect(s.alpha).toBe(1);
    });

    it('does not set revivePrincess when the death flag is clear', async () => {
        const { s } = await enterWith({ memory: {} });
        expect(s.revivePrincess).toBe(false);
    });

    it('sets revivePrincess when g_mem death flag is 0xFF', async () => {
        const { s } = await enterWith({ memory: { [0x49]: 0xFF } });
        expect(s.revivePrincess).toBe(true);
    });

    it('finishes immediately when the image fails to load', async () => {
        class BrokenImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            src = '';
            constructor() {
                setTimeout(() => this.onerror?.(), 0);
            }
        }
        vi.stubGlobal('Image', BrokenImage);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const deps = makeDeps({});
        const scene = new PrincessScene(deps);
        scene.enter(1000);
        await new Promise(r => setTimeout(r, 0));
        expect(deps.finishCallback as ReturnType<typeof vi.fn>).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

describe('PrincessScene normal completion (demon alive)', () => {
    it('Space during shown starts fade-out; completion hits finishCallback', async () => {
        const { scene, s, deps } = await enterWith();
        scene.draw(2000); // fully shown
        scene.handleInput('Space');
        expect(s.phase).toBe('fadeOut');

        // still fading at 200ms into a 450ms fade
        expect(scene.draw(2200)).toBe(true);
        // done after 450ms
        expect(scene.draw(2460)).toBe(false);
        expect(deps.finishCallback).toHaveBeenCalledTimes(1);
    });
});

describe('PrincessScene revive path (demon defeated)', () => {
    it('holds for 2s then auto-fades-out and routes to startEndingDemo', async () => {
        const startEndingDemo = vi.fn();
        const { scene, s, deps } = await enterWith({ memory: { [0x49]: 0xFF }, startEndingDemo });
        scene.draw(2000);
        scene.draw(3000); // inside hold window (started at first shown draw)
        expect(s.phase).toBe('shown');

        scene.draw(5100); // 2000ms past hold start + margin
        expect(s.phase).toBe('fadeOut');

        scene.draw(6500); // fade completes and scene reports finished
        expect(startEndingDemo).toHaveBeenCalledTimes(1);
        expect(deps.finishCallback).not.toHaveBeenCalled();
        expect(deps.finishCallback).not.toHaveBeenCalled();
    });

    it('finish() falls back to finishCallback when no startEndingDemo given', async () => {
        const { scene, deps } = await enterWith({ memory: { [0x49]: 0xFF } });
        (scene as unknown as { finish: () => void }).finish();
        expect(deps.finishCallback).toHaveBeenCalledTimes(1);
    });
});

describe('PrincessScene naming', () => {
    it('reports its building name', async () => {
        const { scene } = await enterWith();
        expect((scene as unknown as { getName: () => string }).getName()).toBe('In the Hut');
    });
});
