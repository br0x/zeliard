// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ChurchScene,
    COMMON_SCRIPT,
    WAIT_250_MS,
    HEAL_TICK_MS,
    ANIM_32_TICK_MS,
    buildChurchScript,
} from '../src/scenes/indoor-church.js';
import type { IndoorSceneDependencies } from '../src/core/scene.js';
import { createLiveHeroState } from '../src/core/game-state.js';

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {},
    drawImage() {}, fillText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '',
    lineWidth: 1,
} as unknown as CanvasRenderingContext2D;

const CANVAS = { width: 672, height: 432 } as HTMLCanvasElement;

interface MemState { bytes: Map<number, number>; buf: Uint8Array }

function makeDeps(state: MemState) {
    const deps: IndoorSceneDependencies = {
        canvas: CANVAS,
        ctx: CTX,
        heroState: createLiveHeroState(state.buf),
        readMemory: vi.fn((offset: number, length: number) => {
            const out = new Uint8Array(length);
            for (let i = 0; i < length; i++) out[i] = state.bytes.get(offset + i) ?? 0;
            return out;
        }),
        writeMemory: vi.fn((offset: number, data: Uint8Array) => {
            for (let i = 0; i < data.length; i++) state.bytes.set(offset + i, data[i] ?? 0);
        }),
        finishCallback: vi.fn(),
        soundManager: {},
        renderGoldHud: vi.fn(),
        renderAlmasHud: vi.fn(),
        drawLifeBar: vi.fn(),
        setLife: vi.fn(),
        renderSwordHud: vi.fn(),
        renderMagicHud: vi.fn(),
        renderShieldHud: vi.fn(),
    };
    return { deps };
}

/** Live HP accessors over the shared memory map (little-endian word at 0x90). */
function hpOf(state: MemState): number {
    return (state.bytes.get(0x90) ?? 0) | ((state.bytes.get(0x91) ?? 0) << 8);
}
function setHp(state: MemState, hp: number, max = hp): void {
    state.bytes.set(0x90, hp & 0xFF);
    state.bytes.set(0x91, (hp >> 8) & 0xFF);
    state.bytes.set(0xB2, max & 0xFF);
    state.bytes.set(0xB3, (max >> 8) & 0xFF);
}

function stubImages(): void {
    class FakeImage {
        onload: (() => void) | null = null;
        src = '';
        constructor() { setTimeout(() => this.onload?.(), 0); }
    }
    vi.stubGlobal('Image', FakeImage);
}

async function enterScene(state: MemState) {
    stubImages();
    const { deps } = makeDeps(state);
    const scene = new ChurchScene(deps);
    const s = scene as unknown as {
        sceneReady: boolean; waitingForContinue: boolean;
        blessPhase: string; healPhase: string; dlgQueue: string[];
    };
    Object.defineProperty(s, 'dlgQueue', {
        get() { return (scene as unknown as { _dlgQueue: string[] })._dlgQueue; },
    });
    scene.enter(1000);
    await new Promise(r => setTimeout(r, 0));
    return { scene, s, deps };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('buildChurchScript', () => {
    it('full-HP path: tired text + restore + common tail', () => {
        const script = buildChurchScript(100, 100);
        // 'common' is a single step spliced at runtime
        expect(script.map(st => st.op)).toEqual(['clear', 'text', 'restore', 'common']);
    });

    it('wounded path: weary → two waits → holy → heal_restore → common', () => {
        const script = buildChurchScript(40, 100);
        expect(script.map(st => st.op)).toEqual([
            'clear', 'text', 'wait', 'wait', 'text', 'heal_restore', 'common',
        ]);
        const waits = script.filter(st => st.op === 'wait');
        expect(waits).toHaveLength(2);
        expect((waits[0] as { ms: number }).ms).toBe(WAIT_250_MS);
    });

    it('common tail ends with bless → continue → exit', () => {
        const ops = COMMON_SCRIPT.map(st => st.op);
        expect(ops.slice(-3)).toEqual(['bless', 'continue', 'exit']);
    });
});

describe('ChurchScene scripted flow', () => {
    it('runs the wounded script: heals to max in +8 steps, restores spells, waits for continue', async () => {
        const state: MemState = { bytes: new Map(), buf: new Uint8Array(0x10000) };
        setHp(state, 30, 60);
        // inventory spells to copy into the active bank
        for (let i = 0; i < 7; i++) state.bytes.set(0xB4 + i, i + 1);

        const { scene, s } = await enterScene(state);
        expect(s.sceneReady).toBe(true);

        // draw until healing starts
        let t = 1000;
        let guard = 0;
        while ((scene as unknown as { blockedBy: string | null }).blockedBy !== 'heal_restore' && guard++ < 200) {
            scene.draw(t += 100);
        }
        expect(s.healPhase).toBe('healing');

        // each heal tick adds 8 HP every ~84.6ms
        while ((scene as unknown as { blockedBy: string | null }).blockedBy === 'heal_restore' && guard++ < 500) {
            scene.draw(t += 50);
        }
        expect(hpOf(state)).toBe(60); // clamped at max
        // active spells copied from inventory
        for (let i = 0; i < 7; i++) {
            expect(state.bytes.get(0xAB + i)).toBe(i + 1);
        }
        expect(s.healPhase).toBe('idle');

        // continue through the remaining script until the continuation wait
        while (!s.waitingForContinue && guard++ < 600) scene.draw(t += 100);
        expect(s.waitingForContinue).toBe(true);

        // Space acknowledges and the script proceeds to exit → fade-out
        scene.handleInput('Space');
        expect(s.waitingForContinue).toBe(false);
        while ((scene as unknown as { phase: string }).phase !== 'fadeOut' && guard++ < 700) scene.draw(t += 100);
        expect((scene as unknown as { phase: string }).phase).toBe('fadeOut');
    });

    it('full-HP path does not trigger healing', async () => {
        const state: MemState = { bytes: new Map(), buf: new Uint8Array(0x10000) };
        setHp(state, 99, 99);
        const { scene } = await enterScene(state);
        let t = 1000;
        for (let i = 0; i < 300; i++) scene.draw(t += 50);
        expect(s_healPhase(scene)).toBe('idle');
    });

    it('blessing animation plays through its stages before unblocking the script', async () => {
        const state: MemState = { bytes: new Map(), buf: new Uint8Array(0x10000) };
        setHp(state, 100, 100); // full-HP script reaches bless via common tail
        const { scene, s } = await enterScene(state);
        let t = 1000;
        let guard = 0;
        while (s.blessPhase !== 'playing' && guard++ < 400) scene.draw(t += 100);
        expect(s.blessPhase).toBe('playing');
        while (s.blessPhase !== 'done' && guard++ < 800) scene.draw(t += 50);
        expect(s.blessPhase).toBe('done');
        expect((scene as unknown as { blockedBy: string | null }).blockedBy).toBeNull();
    });

    it('Space does nothing when not waiting for continue', async () => {
        const state: MemState = { bytes: new Map(), buf: new Uint8Array(0x10000) };
        setHp(state, 10, 10);
        const { scene, s } = await enterScene(state);
        scene.handleInput('Space');
        expect(s.waitingForContinue).toBe(false);
    });

    it('reports its building name', async () => {
        const state: MemState = { bytes: new Map(), buf: new Uint8Array(0x10000) };
        setHp(state, 1, 2);
        const { scene } = await enterScene(state);
        expect((scene as unknown as { getName: () => string }).getName()).toBe('The Church');
    });
});

function s_healPhase(scene: ChurchScene): string {
    return (scene as unknown as { healPhase: string }).healPhase;
}

// re-exported constants sanity (asm timing parity)
describe('church timing constants', () => {
    it('derives ticks from the 236.7 Hz engine frame', () => {
        expect(ANIM_32_TICK_MS).toBeCloseTo(32 * 1000 / 236.7, 5);
        expect(HEAL_TICK_MS).toBeCloseTo(20 * 1000 / 236.7, 5);
        expect(WAIT_250_MS).toBeCloseTo(250 * 1000 / 236.7, 3);
    });
});
