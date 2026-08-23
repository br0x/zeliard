// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    WitchcraftShopScene,
    MAGIC_ITEM_NAMES,
    MAGIC_ITEM_DESCRIPTIONS,
    MAGIC_PRICES_BY_TOWN,
    DEFAULT_MAGIC_BITMASKS,
    bitmaskToItemIndices,
    itemIndexToBit,
} from '../src/scenes/indoor-magic-shop.js';
import type { IndoorSceneDependencies } from '../src/core/scene.js';

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {},
    drawImage() {}, fillText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
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

const goldOf = (s: MemState) =>
    ((s.bytes.get(0x85) ?? 0) * 0x10000) +
    ((s.bytes.get(0x86) ?? 0) | ((s.bytes.get(0x87) ?? 0) << 8));
const setGold = (s: MemState, v: number) => {
    s.bytes.set(0x85, (v >>> 16) & 0xFF);
    s.bytes.set(0x86, v & 0xFF);
    s.bytes.set(0x87, (v >> 8) & 0xFF);
};

describe('magic-shop tables & helpers', () => {
    it('bitmaskToItemIndices maps bits 7..0 to item indices 0..7', () => {
        expect(bitmaskToItemIndices(0x80)).toEqual([0]);
        expect(bitmaskToItemIndices(0x01)).toEqual([7]);
        expect(bitmaskToItemIndices(0xFF)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(bitmaskToItemIndices(0x00)).toEqual([]);
    });

    it('itemIndexToBit mirrors the mask mapping', () => {
        for (let i = 0; i < 8; i++) {
            expect(itemIndexToBit(i)).toBe(0x80 >> i);
        }
    });

    it('every town has 8 prices and every item a name/description', () => {
        expect(MAGIC_PRICES_BY_TOWN).toHaveLength(9);
        for (const row of MAGIC_PRICES_BY_TOWN) expect(row).toHaveLength(8);
        expect(MAGIC_ITEM_NAMES).toHaveLength(8);
        expect(MAGIC_ITEM_DESCRIPTIONS).toHaveLength(8);
        expect(DEFAULT_MAGIC_BITMASKS).toHaveLength(9);
    });
});

describe('WitchcraftShopScene transactions', () => {
    const clock = { ms: 50000 };

    beforeEach(() => clock.ms = 50000);

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
        clock.ms = 50000;
        vi.spyOn(performance, 'now').mockImplementation(() => clock.ms);
        const { deps } = makeDeps(state);
        const scene = new WitchcraftShopScene(deps);
        const s = scene as unknown as Record<string, unknown> & {
            shopPhase: string; menuSel: number; subSel: number;
            subItems: number[]; exitAfterDialog: boolean;
        };
        scene.enter(1000);
        await new Promise(r => setTimeout(r, 0));
        // run entry animation to idle (4 frames × 400ms)
        for (let i = 0; i < 10; i++) { clock.ms += 500; scene.draw(clock.ms); }
        return { scene, s };
    }

    /** Drive from menu phase through typing skips into a target phase. */
    async function toMenu(env: Awaited<ReturnType<typeof enter>>) {
        let guard = 0;
        while (env.s.shopPhase !== 'menu' && guard++ < 50) { clock.ms += 200; env.scene.draw(clock.ms); }
        expect(env.s.shopPhase).toBe('menu');
        return env;
    }

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('buy: deducts gold, fills an empty slot and clears the stock bit', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 1000);
        setGold(state, 1000);
        const env = await toMenu(await enter(state));

        // open buy menu (menu item 1)
        env.s.menuSel = 1;
        env.scene.handleInput('Space');
        clock.ms += 3000;
        env.scene.draw(clock.ms); // finish question typing

        // pick first in-stock item
        env.s.subSel = 0;
        env.scene.handleInput('Space');
        clock.ms += 3000; env.scene.draw(clock.ms); // finish offer typing
        expect(env.s.shopPhase).toBe('confirm_buy');

        const itemIdx = env.s.subItems[0]!;
        const price = MAGIC_PRICES_BY_TOWN[0]![itemIdx]!;

        env.scene.handleInput('Space'); // confirm buy
        clock.ms += 3000; env.scene.draw(clock.ms);

        expect(goldOf(state)).toBe(1000 - price);
        expect(state.bytes.get(0xA6)).toBe(itemIdx + 1);      // first slot filled
        // (legacy buy does not mutate the shop's stock bitmask)
        expect(env.s.shopPhase).toBe('dialog');
    });

    it('buy without funds keeps gold and shows the refusal', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 0);
        const env = await toMenu(await enter(state));
        env.s.menuSel = 1;
        env.scene.handleInput('Space');
        clock.ms += 3000;
        env.scene.draw(clock.ms);

        env.s.subSel = 0;
        env.scene.handleInput('Space');
        clock.ms += 3000; env.scene.draw(clock.ms);

        env.scene.handleInput('Space'); // confirm despite no funds
        clock.ms += 3000; env.scene.draw(clock.ms);

        expect(goldOf(state)).toBe(0);
        expect(state.bytes.get(0xA6) ?? 0).toBe(0); // no slot written
    });

    it('sell: pays half price, clears the slot and restores the stock bit', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 100);
        state.bytes.set(0xA6, 5); // Holy Water of Acero (id 5) carried
        const env = await toMenu(await enter(state));

        env.s.menuSel = 2; // Sell item
        env.scene.handleInput('Space');
        clock.ms += 3000;
        env.scene.draw(clock.ms); // finish "what to sell" typing

        expect(env.s.subItems).toEqual([4]); // id 5 → 0-based index 4
        clock.ms += 3000; env.scene.draw(clock.ms); // finish "what to sell" typing
        env.scene.handleInput('Space');      // choose it
        clock.ms += 3000; env.scene.draw(clock.ms);
        expect(env.s.shopPhase).toBe('confirm_sell');

        const expectedSell = Math.floor(MAGIC_PRICES_BY_TOWN[0]![4]! / 2);

        // Yes/No cursor defaults to Yes — confirm
        env.scene.handleInput('Space');
        clock.ms += 3000; env.scene.draw(clock.ms);

        expect(goldOf(state)).toBe(100 + expectedSell);
        expect(state.bytes.get(0xA6)).toBe(0);                    // slot emptied
        expect((state.bytes.get(0xC9) ?? 0) & itemIndexToBit(4)).not.toBe(0); // back in stock
    });

    it('sell with empty inventory refuses politely', async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 50);
        const env = await toMenu(await enter(state));
        env.s.menuSel = 2;
        env.scene.handleInput('Space');
        clock.ms += 3000;
        env.scene.draw(clock.ms);
        expect(env.s.shopPhase).toBe('dialog');
    });

    it("Go outside sets exitAfterDialog then plays the reverse animation before fading", async () => {
        const state = { bytes: new Map<number, number>() };
        setGold(state, 0);
        const env = await toMenu(await enter(state));
        env.s.menuSel = 0;
        env.scene.handleInput('Space');
        clock.ms += 3000;
        env.scene.draw(clock.ms);
        expect(env.s.exitAfterDialog).toBe(true);

        // dialog confirm triggers exit animation
        let guard = 0;
        while ((env.scene as unknown as { magicAnimPhase: string }).magicAnimPhase !== 'exit' && guard++ < 20) {
            env.scene.handleInput('Space');
            clock.ms += 300;
            env.scene.draw(clock.ms);
        }
        expect((env.scene as unknown as { magicAnimPhase: string }).magicAnimPhase).toBe('exit');

        while ((env.scene as unknown as { phase: string }).phase !== 'fadeOut' && guard++ < 60) {
            clock.ms += 500;
            env.scene.draw(clock.ms);
        }
        expect((env.scene as unknown as { phase: string }).phase).toBe('fadeOut');
    });
});
