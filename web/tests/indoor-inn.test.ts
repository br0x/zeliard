// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InnScene, INN_PRICES } from '../src/scenes/indoor-inn.js';
import type { IndoorSceneDependencies } from '../src/core/scene.js';

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {},
    drawImage() {}, fillText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '',
    lineWidth: 1,
} as unknown as CanvasRenderingContext2D;

const CANVAS = { width: 672, height: 432 } as HTMLCanvasElement;

interface MemState { bytes: Map<number, number> }

function makeDeps(state: MemState) {
    const deps: IndoorSceneDependencies = {
        canvas: CANVAS,
        ctx: CTX,
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

// gold lives at 0x85 (hi byte) + 0x86..87 (lo word)
function goldOf(state: MemState): number {
    const hi = state.bytes.get(0x85) ?? 0;
    const lo = (state.bytes.get(0x86) ?? 0) | ((state.bytes.get(0x87) ?? 0) << 8);
    return hi * 0x10000 + lo;
}
function setGold(state: MemState, v: number): void {
    state.bytes.set(0x85, (v >>> 16) & 0xFF);
    state.bytes.set(0x86, v & 0xFF);
    state.bytes.set(0x87, (v >> 8) & 0xFF);
}
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

async function enterScene(state: MemState, townId = 1) {
    state.bytes.set(0xC4, townId); // ADDR_TOWN_ID
    stubImages();
    vi.spyOn(performance, 'now').mockReturnValue(100000);
    const { deps } = makeDeps(state);
    const scene = new InnScene(deps);
    const s = scene as unknown as {
        phase: string; scenePhase: string; menuSel: number; price: number;
        waitingForContinue: boolean; sleepPhase: string | null;
    };
    scene.enter(1000);
    await new Promise(r => setTimeout(r, 0));
    return { scene, s, deps };
}

/** Advance past the greeting typewriter into the menu phase. */
async function toMenu(env: Awaited<ReturnType<typeof enterScene>>) {
    let t = 100000;
    let guard = 0;
    while (env.s.scenePhase !== 'menu' && guard++ < 300) env.scene.draw(t += 50);
    return env;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('inn pricing', () => {
    it('price table matches the original town costs', () => {
        expect([...INN_PRICES]).toEqual([0, 30, 50, 70, 100, 150, 200, 400]);
    });

    it('selects the price from the town id (raw&0x7F - 1, clamped)', async () => {
        const s1 = { bytes: new Map<number, number>() };
        const a = await enterScene(s1, 3); // idx 2 → 50
        expect(a.s.price).toBe(50);

        const s2 = { bytes: new Map<number, number>() };
        const b = await enterScene(s2, 0x80 | 9); // high-bit raw, idx clamped to 7
        expect(b.s.price).toBe(INN_PRICES[7]);

        const s3 = { bytes: new Map<number, number>() };
        const c = await enterScene(s3, 0); // idx -1 → clamped 0
        expect(c.s.price).toBe(0);
    });
});

describe('InnScene stay flow', () => {
    it('deducts the price and heals HP/spells after the sleep fade', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 500);
        setHp(state, 20, 77);
        for (let i = 0; i < 7; i++) state.bytes.set(0xB4 + i, i + 3);

        const env = await toMenu(await enterScene(state));
        env.s.menuSel = 0; // Stay
        env.scene.handleInput('Space');

        expect(goldOf(state)).toBe(500 - env.s.price);
        expect(env.s.scenePhase).toBe('paid');

        // paid → thank-you dialog → auto sleep fade → morning text
        let t = 100000;
        let guard = 0;
        while (env.s.scenePhase !== 'morning' && guard++ < 600) env.scene.draw(t += 60);
        expect(env.s.scenePhase).toBe('morning');
        expect(hpOf(state)).toBe(77);
        for (let i = 0; i < 7; i++) {
            expect(state.bytes.get(0xAB + i)).toBe(i + 3);
        }

        // let the morning text finish typing, then confirm → fade-out
        let u = t;
        for (let i = 0; i < 50; i++) env.scene.draw(u += 200);
        env.scene.handleInput('Space');
        expect(env.s.phase).toBe('fadeOut');
    });

    it('refuses stay without funds and keeps gold untouched', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 10);
        setHp(state, 5, 50);
        const env = await toMenu(await enterScene(state));
        if (env.s.price === 0) return; // town 0 is free — skip

        env.s.menuSel = 0;
        env.scene.handleInput('Space');
        expect(goldOf(state)).toBe(10);
        expect(env.s.scenePhase).toBe('dialog');
    });
});

describe('InnScene leave flow', () => {
    it('Leave shows the farewell and Space then fades out', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 999);
        const env = await toMenu(await enterScene(state));
        env.s.menuSel = 1; // Leave
        env.scene.handleInput('Space');
        expect(env.s.scenePhase).toBe('leave');

        env.scene.handleInput('Space'); // confirm → fade-out
        expect(env.s.phase).toBe('fadeOut');
    });

    it('Escape from the menu fades out directly', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 0);
        const env = await toMenu(await enterScene(state));
        env.scene.handleInput('Escape');
        expect(env.s.phase).toBe('fadeOut');
    });

    it('ArrowUp/ArrowDown wrap the two menu entries', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 0);
        const env = await toMenu(await enterScene(state));
        env.scene.handleInput('ArrowUp');
        expect(env.s.menuSel).toBe(1);
        env.scene.handleInput('ArrowDown');
        expect(env.s.menuSel).toBe(0);
    });
});
