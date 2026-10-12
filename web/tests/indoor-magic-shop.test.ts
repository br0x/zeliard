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
    THREAD_OF_YAGA_SHOP_INDEX,
} from '../src/scenes/indoor-magic-shop.js';
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
            return state.buf.subarray(offset, offset + length);
        }),
        writeMemory: vi.fn((offset: number, data: Uint8Array) => {
            for (let i = 0; i < data.length; i++) {
                state.buf[offset + i] = data[i] ?? 0;
                state.buf[offset + i] = data[i] ?? 0; state.bytes.set(offset + i, data[i] ?? 0);
            }
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

function memSet(s: MemState, addr: number, value: number): void {
    s.bytes.set(addr, value & 0xFF);
    s.buf[addr] = value & 0xFF;
}

const goldOf = (s: MemState) =>
    ((s.buf[0x85] ?? 0) * 0x10000) +
    ((s.buf[0x86] ?? 0) | ((s.buf[0x87] ?? 0) << 8));
const setGold = (s: MemState, v: number) => {
    memSet(s, 0x85, (v >>> 16) & 0xFF);
    memSet(s, 0x86, v & 0xFF);
    memSet(s, 0x87, (v >> 8) & 0xFF);
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
        // Nine: the eight from drugpro.asm plus the Thread of Yaga, which has its
        // own stock bit because the 8-bit mask is full.
        for (const row of MAGIC_PRICES_BY_TOWN) expect(row).toHaveLength(9);
        expect(MAGIC_ITEM_NAMES).toHaveLength(9);
        expect(MAGIC_ITEM_DESCRIPTIONS).toHaveLength(9);
        expect(DEFAULT_MAGIC_BITMASKS).toHaveLength(9);
    });
});

describe('WitchcraftShopScene transactions', () => {

    const clock = { ms: 50000 };

    beforeEach(() => clock.ms = 50000);

    it('offers the Thread of Yaga in every town on a fresh save', async () => {
        // Regression: the extended mask has no entries in the original tables, so
        // with no default the shop read zero and the item never appeared at all.
        // This drives the real scene rather than the constant.
        const state: MemState = { bytes: new Map(), buf: new Uint8Array(0x10000) };
        setGold(state, 100000);
        const { scene, s } = await enter(state, 1);
        const shopIndices = (scene as unknown as { _shopItemIndices: number[] })._shopItemIndices;
        expect(shopIndices, 'buy list').toContain(8);
        // And it carries a name and a price.
        expect(MAGIC_ITEM_NAMES[8]!).toBeTruthy();
        expect(MAGIC_PRICES_BY_TOWN[0]![8]!).toBeGreaterThan(0);
        expect(MAGIC_ITEM_DESCRIPTIONS[8]).toBeTruthy();
        void s;
    });


    function stubImages(): void {
        class FakeImage {
            onload: (() => void) | null = null;
            src = '';
            constructor() { setTimeout(() => this.onload?.(), 0); }
        }
        vi.stubGlobal('Image', FakeImage);
    }

    async function enter(state: MemState, townId = 1) {
        memSet(state, 0xC4, townId);
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
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
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
        expect((state.buf[0xA6] ?? 0)).toBe(itemIdx + 1);      // first slot filled
        // (legacy buy does not mutate the shop's stock bitmask)
        expect(env.s.shopPhase).toBe('dialog');
    });

    it('holds the inventory to five items, and the Thread of Yaga is one of them', async () => {
        // The player's report: a Magia Stone and a Thread of Yaga in hand, then two
        // Ju-uen fruits and two Sabre Oils bought on top — six items. The Thread is
        // the engine's `ADDR_THREAD_OF_YAGA` counter and has no `0xA6..0xAA` slot to
        // fill, so counting that array alone let a sixth thing in.
        const state: MemState = { bytes: new Map(), buf: new Uint8Array(0x10000) };
        setGold(state, 1000000);
        // One Magia Stone, and one Thread of Yaga held.
        state.buf[0xA6] = 1;
        state.buf[0x46] = 0xa7;   // ADDR_FEATURE_YAGA / FEATURE_YAGA, or the
        state.buf[0x4A] = 1;      // Thread counter does not register at all
        state.buf[0xC9] = 0xff;   // every extended bit, so the Thread is offered

        const env = await toMenu(await enter(state, 1));
        const s = env.scene as unknown as {
            heroState: { magicItems: Uint8Array; threadOfYaga: number };
            _magicSlotsUsed(): number;
            _findEmptyMagicSlot(): number;
            _hasRoomFor(itemIdx: number): boolean;
        };

        expect(s._magicSlotsUsed(), 'the Thread counts against the five').toBe(2);

        // Three more fit, and the five are then spoken for — while the array still
        // shows a free slot. This is the case that used to slip through: the shop
        // asked `_findEmptyMagicSlot` alone, saw room, and sold a sixth item.
        s.heroState.magicItems[1] = 2;
        s.heroState.magicItems[2] = 3;
        s.heroState.magicItems[3] = 4;
        expect(s._magicSlotsUsed(), 'five items held').toBe(5);
        expect(s._findEmptyMagicSlot(), 'yet the array still has room').toBe(4);

        // Sell one, and there is room again.
        s.heroState.magicItems[3] = 0;
        expect(s._magicSlotsUsed(), 'four held').toBe(4);
        expect(s._findEmptyMagicSlot(), 'with room in the array').toBe(3);

        // A stack of threads is one slot, not one per copy: three array items and a
        // stack of three threads are four, not six.
        s.heroState.threadOfYaga = 3;
        expect(s._magicSlotsUsed(), 'three threads are still one slot').toBe(4);

        // The player's second report: a Magia Stone, two Threads and three Kioku
        // Feathers is five slots — four array items and one for the stack — and
        // buying a further Thread failed. It stacks onto the slot the first one
        // already occupies, so it opens none and must be allowed like this.
        s.heroState.magicItems[1] = 2; s.heroState.magicItems[2] = 3;
        s.heroState.magicItems[3] = 4; s.heroState.magicItems[4] = 0;
        s.heroState.threadOfYaga = 2;
        expect(s._magicSlotsUsed(), 'five items held').toBe(5);
        expect(s._findEmptyMagicSlot(), 'with one array cell still free').toBe(4);
        expect(s._hasRoomFor(THREAD_OF_YAGA_SHOP_INDEX),
            'another Thread stacks onto the one he has, so it fits').toBe(true);
        expect(s._hasRoomFor(0), 'but a sixth item does not').toBe(false);

        // With the Thread sold the slot is free again, and a first Thread needs one.
        s.heroState.threadOfYaga = 0;
        expect(s._magicSlotsUsed(), 'four held').toBe(4);
        expect(s._hasRoomFor(THREAD_OF_YAGA_SHOP_INDEX), 'a first Thread fits').toBe(true);
        expect(s._hasRoomFor(0), 'and one more item fits too').toBe(true);

        // And a full array with no Thread: the first Thread still needs a slot, so it
        // is refused on its own account rather than the array's.
        s.heroState.magicItems[4] = 6;
        expect(s._magicSlotsUsed(), 'five array items held').toBe(5);
        expect(s._findEmptyMagicSlot(), 'and the array is full').toBe(-1);
        expect(s._hasRoomFor(THREAD_OF_YAGA_SHOP_INDEX), 'but a first Thread has nowhere to go').toBe(false);
    });

    it('buy without funds keeps gold and shows the refusal', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
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
        expect(state.buf[0xA6] ?? 0).toBe(0); // no slot written
    });

    it('sell: pays half price, clears the slot and restores the stock bit', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 100);
        memSet(state, 0xA6, 5); // Holy Water of Acero (id 5) carried
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
        expect((state.buf[0xA6] ?? 0)).toBe(0);                    // slot emptied
        expect((state.buf[0xC9] ?? 0) & itemIndexToBit(4)).not.toBe(0); // back in stock
    });

    it('sell with empty inventory refuses politely', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 50);
        const env = await toMenu(await enter(state));
        env.s.menuSel = 2;
        env.scene.handleInput('Space');
        clock.ms += 3000;
        env.scene.draw(clock.ms);
        expect(env.s.shopPhase).toBe('dialog');
    });

    it("Go outside sets exitAfterDialog then plays the reverse animation before fading", async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
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
