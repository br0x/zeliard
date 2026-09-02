// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    WeaponShopScene,
    SWORD_NAMES,
    SHIELD_NAMES,
    SHIELD_MAX_HP,
    WEAPON_PRICES_BY_TOWN,
    WEAPON_ITEM_DESCRIPTIONS,
    DEFAULT_SWORD_BITMASKS,
    weaponBitmaskToItemIndices,
} from '../src/scenes/indoor-weapon-shop.js';
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
                memSet(state, offset + i, data[i] ?? 0);
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

describe('weapon shop tables', () => {
    it('names/descriptions/prices line up', () => {
        expect(SWORD_NAMES).toHaveLength(6);
        expect(SHIELD_NAMES).toHaveLength(6);
        expect(WEAPON_ITEM_DESCRIPTIONS).toHaveLength(12); // 6 swords + 6 shields
        expect(WEAPON_PRICES_BY_TOWN).toHaveLength(9);
        for (const row of WEAPON_PRICES_BY_TOWN) expect(row).toHaveLength(12);
    });

    it('shield max HP table matches the original', () => {
        expect([...SHIELD_MAX_HP]).toEqual([30, 80, 180, 300, 300, 600]);
    });

    it('sword bitmask helper covers 6 items', () => {
        expect(weaponBitmaskToItemIndices(0xFF)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(weaponBitmaskToItemIndices(0xC0)).toEqual([0, 1]);
        expect(DEFAULT_SWORD_BITMASKS[4]).toBe(0x70);
    });
});

describe('WeaponShopScene transactions', () => {
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
        const clock = { ms: 50000 };
        vi.spyOn(performance, 'now').mockImplementation(() => clock.ms);
        const { deps } = makeDeps(state);
        const scene = new WeaponShopScene(deps);
        const s = scene as unknown as Record<string, unknown> & {
            shopPhase: string; menuSel: number; subSel: number; subItems: number[];
            subKind: string; townIdx: number; boughtSomething: boolean;
        };
        scene.enter(1000);
        await new Promise(r => setTimeout(r, 0));

        let guard = 0;
        while (s.shopPhase !== 'menu' && guard++ < 100) {
            clock.ms += 150;
            scene.draw(clock.ms);
        }
        return { scene, s, clock };
    }

    /** Press Space until the given phase is reached (skips typing). */
    function spaceUntil(env: Awaited<ReturnType<typeof enter>>, phase: string): void {
        let guard = 0;
        while (env.s.shopPhase !== phase && guard++ < 30) {
            env.scene.handleInput('Space');
            env.clock.ms += 3000;
            env.scene.draw(env.clock.ms);
        }
    }

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('buying a sword with a trade-in charges the net price', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 5000);
        memSet(state, 0x92, 1); // currently owns Training sword (id 1)
        const env = await enter(state);

        env.s.menuSel = 2; // Buy weapon
        env.scene.handleInput('Space');
        env.clock.ms += 3000; env.scene.draw(env.clock.ms); // finish question

        // pick Spirit sword? default stock in Muralla = [0,1]; pick index 1 (Wise man's)
        env.s.subItems = env.s.subItems ?? [];
        const targetIdx = 1;
        env.s.subSel = env.s.subItems.indexOf(targetIdx);
        expect(env.s.subSel).toBeGreaterThanOrEqual(0);

        env.scene.handleInput('Space'); // select
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);
        expect(env.s.shopPhase).toBe('confirm_buy');

        const price = WEAPON_PRICES_BY_TOWN[0]![targetIdx]!;
        const tradeIn = Math.floor(WEAPON_PRICES_BY_TOWN[0]![0]! / 2); // Training sword / 2
        const goldBefore = goldOf(state);

        env.scene.handleInput('Space'); // Yes
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);

        expect(goldOf(state)).toBe(goldBefore - (price - tradeIn));
        expect(state.buf[0x92] ?? 0).toBe(targetIdx + 1);
        expect(state.buf[0xD2] ?? 0).toBe(DEFAULT_SWORD_BITMASKS[0]! | 0x80); // old sword back in stock
        expect(env.s.boughtSomething).toBe(true);
    });

    it("buying the sword you already own gets you the salesman's brush-off", async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 5000);
        memSet(state, 0x92, 1); // owns Training sword
        const env = await enter(state);
        env.s.menuSel = 2;
        env.scene.handleInput('Space');
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);

        env.s.subSel = 0; // Training sword again
        env.scene.handleInput('Space');
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);
        expect(env.s.shopPhase).toBe('dialog');
        expect(goldOf(state)).toBe(5000); // no charge
    });

    it('buying a shield sets its max/current HP from the table', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 40000);
        const env = await enter(state);

        env.s.menuSel = 3; // Buy shield
        env.scene.handleInput('Space');
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);

        env.s.subItems = env.s.subItems ?? [];
        const targetShield = 1; // Wise man's shield — Muralla default stock [Clay, Wise man's]
        const shieldPos = env.s.subItems.indexOf(targetShield);
        expect(shieldPos).toBeGreaterThanOrEqual(0);
        env.s.subSel = shieldPos;

        env.scene.handleInput('Space');
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);
        spaceUntil(env, 'confirm_buy');

        const price = WEAPON_PRICES_BY_TOWN[0]![6 + targetShield]!;
        const before = goldOf(state);
        env.scene.handleInput('Space'); // Yes
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);

        expect(state.buf[0x93] ?? 0).toBe(targetShield + 1); // equipped id
        const maxHp = (state.buf[0x96] ?? 0) | ((state.buf[0x97] ?? 0) << 8);
        expect(maxHp).toBe(SHIELD_MAX_HP[targetShield]!);
        expect(goldOf(state)).toBe(before - price); // no trade-in, no old shield
    });

    it('repair costs ceil((max-hp)/2) and restores the shield', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 1000);
        memSet(state, 0x93, 2);           // Wise man's shield
        memSet(state, 0x96, 80); memSet(state, 0x97, 0);   // max 80
        memSet(state, 0x94, 31); memSet(state, 0x95, 0);   // hp 31
        const env = await enter(state);

        env.s.menuSel = 1; // Repair shield
        env.scene.handleInput('Space');
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);
        spaceUntil(env, 'confirm_repair');

        env.scene.handleInput('Space'); // Yes
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);
        // wait out the 1600ms "repair complete" timer
        await new Promise(r => setTimeout(r, 1700));
        env.clock.ms += 2000; env.scene.draw(env.clock.ms);

        expect(goldOf(state)).toBe(1000 - Math.ceil((80 - 31) / 2)); // ceil(49/2)=25 → 975
        const hp = (state.buf[0x94] ?? 0) | ((state.buf[0x95] ?? 0) << 8);
        expect(hp).toBe(80);
    });

    it('Crest of Glory trade in Tumba grants the Knight\'s sword', async () => {
        const state = { bytes: new Map<number, number>(), buf: new Uint8Array(0x10000) };
        setGold(state, 0);
        memSet(state, 0x24, 0x01);       // cementar_1: not yet traded
        memSet(state, 0x9B, 0x05);       // carrying Crest of Glory
        const env = await enter(state, 5); // Tumba (town id 5 → idx 4)

        expect(env.s.townIdx).toBe(4);
        expect(env.s.shopPhase).toBe('crest_trade');

        env.scene.handleInput('Space'); // confirm question typing
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);
        spaceUntil(env, 'confirm_crest');
        env.scene.handleInput('Space'); // Yes
        env.clock.ms += 3000; env.scene.draw(env.clock.ms);

        expect(state.buf[0x24] ?? 0).toBe(0x03);          // traded bit set
        expect(state.buf[0x9B] ?? 0).toBe(0);             // crest consumed
        expect(state.buf[0x92] ?? 0).toBe(4);             // Knight's sword equipped
        expect(env.s.exitAfterDialog).toBe(true);
    });
});
