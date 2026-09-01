// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BankScene,
    ALMAS_RATES,
    BANK_MENU_ITEMS,
    ENTER_SEQ,
    EXIT_SEQ,
} from '../src/scenes/indoor-bank.js';
import type { IndoorSceneDependencies } from '../src/core/scene.js';
import { createLiveHeroState } from '../src/core/game-state.js';

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {},
    drawImage() {}, fillText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
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

const goldOf = (s: MemState) =>
    ((s.bytes.get(0x85) ?? 0) * 0x10000) +
    ((s.bytes.get(0x86) ?? 0) | ((s.bytes.get(0x87) ?? 0) << 8));
const setGold = (s: MemState, v: number) => {
    s.bytes.set(0x85, (v >>> 16) & 0xFF);
    s.bytes.set(0x86, v & 0xFF);
    s.bytes.set(0x87, (v >> 8) & 0xFF);
};
const bankOf = (s: MemState) =>
    ((s.bytes.get(0x88) ?? 0) * 0x10000) +
    ((s.bytes.get(0x89) ?? 0) | ((s.bytes.get(0x8A) ?? 0) << 8));
const setBank = (s: MemState, v: number) => {
    s.bytes.set(0x88, (v >>> 16) & 0xFF);
    s.bytes.set(0x89, v & 0xFF);
    s.bytes.set(0x8A, (v >> 8) & 0xFF);
};
const almasOf = (s: MemState) =>
    ((s.bytes.get(0x8B) ?? 0) | ((s.bytes.get(0x8C) ?? 0) << 8));
const setAlmas = (s: MemState, v: number) => {
    s.bytes.set(0x8B, v & 0xFF);
    s.bytes.set(0x8C, (v >> 8) & 0xFF);
};

describe('bank tables', () => {
    it('menu has the five original entries', () => {
        expect([...BANK_MENU_ITEMS]).toEqual([
            'Go outside', 'Exchange almas', 'Deposit money', 'Withdraw money', 'Check balance',
        ]);
    });

    it('enter sequence is writing pairs then notice frames; exit is exact reverse', () => {
        expect(ENTER_SEQ).toHaveLength(2 * 5 + 3);
        expect(EXIT_SEQ).toEqual([...ENTER_SEQ].reverse());
    });

    it('exchange rates cover all nine towns with [almas, gold] pairs', () => {
        expect(ALMAS_RATES).toHaveLength(9);
        for (const [from, to] of ALMAS_RATES) {
            expect(from).toBeGreaterThan(0);
            expect(to).toBeGreaterThan(0);
        }
        expect(ALMAS_RATES[6]).toEqual([4, 2]); // Llama's odd 4→2 rate preserved
    });
});

describe('BankScene transactions', () => {
    function stubImages(): void {
        class FakeImage {
            onload: (() => void) | null = null;
            src = '';
            constructor() { setTimeout(() => this.onload?.(), 0); }
        }
        vi.stubGlobal('Image', FakeImage);
    }

    async function enter(state: MemState, townId = 1) {
        state.bytes.set(0xC4, townId);
        stubImages();
        const clock = { ms: 50000 };
        vi.spyOn(performance, 'now').mockImplementation(() => clock.ms);
        const { deps } = makeDeps(state);
        const scene = new BankScene(deps);
        const s = scene as unknown as Record<string, unknown> & {
            bankPhase: string; menuSel: number; numAmount: number;
            numMode: string; numMax: number; _hadLargeSum: boolean; _hadLargeDeposit: boolean;
        };
        scene.enter(1000);
        await new Promise(r => setTimeout(r, 0));

        // run the entrance animation + dots + excuse-me to the menu
        let guard = 0;
        while (s.bankPhase !== 'menu' && guard++ < 500) {
            clock.ms += 100;
            scene.draw(clock.ms);
        }
        return { scene, s, clock, deps };
    }

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('reaches the menu after the entrance sequence', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 100);
        const env = await enter(state);
        expect(env.s.bankPhase).toBe('menu');
    });

    it('deposit moves hero gold into the bank and laughs at ≥1000', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 1500);
        const env = await enter(state);

        env.s.menuSel = 2; // Deposit
        env.scene.handleInput('Space');
        expect(env.s.bankPhase).toBe('numentry');
        expect(env.s.numMode).toBe('deposit');
        expect(env.s.numMax).toBe(1500);

        // enter amount 1200: ArrowLeft is +10 per press
        for (let i = 0; i < 120; i++) env.scene.handleInput('ArrowLeft');
        expect(env.s.numAmount).toBe(1200);
        env.scene.handleInput('Space'); // confirm

        expect(goldOf(state)).toBe(300);
        expect(bankOf(state)).toBe(1200);
        expect(env.s._hadLargeSum).toBe(true);   // laughing trigger
        expect(env.s._hadLargeDeposit).toBe(true);
        expect((env.scene as unknown as { animPhase: string }).animPhase).toBe('laughing');
    });

    it('withdraw transfers bank gold back and reports the balance', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 10);
        setBank(state, 500);
        const env = await enter(state);

        env.s.menuSel = 3; // Withdraw
        env.scene.handleInput('Space');
        expect(env.s.bankPhase).toBe('numentry');

        for (let i = 0; i < 2; i++) env.scene.handleInput('ArrowLeft'); // +10×2
        // overshoot attempt is clamped at numMax
        for (let i = 0; i < 100; i++) env.scene.handleInput('ArrowLeft');
        expect(env.s.numAmount).toBe(500);
        env.scene.handleInput('Space');

        expect(goldOf(state)).toBe(510);
        expect(bankOf(state)).toBe(0);
    });

    it('deposit of zero amount cancels via the confirm-with-zero guard', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 100);
        const env = await enter(state);
        env.s.menuSel = 2;
        env.scene.handleInput('Space');
        env.scene.handleInput('Space'); // confirm with numAmount=0 → cancel path
        expect(env.s.bankPhase).toBe('dialog'); // "state your business" dialog
    });

    it('exchanges almas at the town rate in full batches only', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setAlmas(state, 10);
        setGold(state, 0);
        const env = await enter(state);

        env.s.menuSel = 1; // Exchange almas
        env.scene.handleInput('Space');
        expect(env.s.bankPhase).toBe('confirm_exchange');

        env.scene.handleInput('Space'); // skip the rate-question typing
        env.clock.ms += 100;
        env.scene.handleInput('Space'); // Yes
        expect(goldOf(state)).toBe(60);           // 10 batches × 6 gold (Muralla)
    });

    it("Llama's 4-almas-per-2-gold rate leaves remainders untouched", async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setAlmas(state, 9);
        setGold(state, 5);
        const env = await enter(state, 7); // Llama

        env.s.menuSel = 1;
        env.scene.handleInput('Space');
        env.scene.handleInput('Space'); // skip typing
        env.clock.ms += 100;
        env.scene.handleInput('Space'); // Yes

        expect(almasOf(state)).toBe(1);  // 9 - 2×4
        expect(goldOf(state)).toBe(5 + 4); // 2 batches × 2 gold
    });

    it('balance check reports the account contents', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setBank(state, 1234);
        const env = await enter(state);
        env.s.menuSel = 4;
        env.scene.handleInput('Space');
        expect(env.s.bankPhase).toBe('dialog');
        expect(env.s._hadLargeDeposit).toBe(true); // even checking counts (byte_AD23)
    });
});
