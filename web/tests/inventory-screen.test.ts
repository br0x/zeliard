// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryScreen, SHIELD_HP_VALUES, XP_TABLE, SPELL_NAMES } from '../src/ui/inventory-screen.js';
import type { InventoryDeps } from '../src/ui/inventory-screen.js';

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {}, drawImage() {},
    fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, roundRect() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
} as unknown as CanvasRenderingContext2D;

const CANVAS = { width: 672, height: 432 } as HTMLCanvasElement;

interface MemState { bytes: Map<number, number> }

function makeState(): MemState {
    const s = { bytes: new Map<number, number>() };
    // a typical mid-game hero
    setBytes(s, 0x90, 100);  // HP
    setBytes(s, 0xB2, 200);  // max HP
    setBytes(s, 0x92, 1);    // sword type
    setBytes(s, 0x93, 1);    // shield type
    setBytes(s, 0x94, 20);   // shield HP lo
    setBytes(s, 0x96, 80);   // shield max HP lo
    setBytes(s, 0x98, 3);    // keys
    setBytes(s, 0x9D, 1);    // current spell (Espada)
    setBytes(s, 0xAB, 5);    // Espada count (current charges)
    setBytes(s, 0xB4, 9);    // Espada max count

    setBytes(s, 0xB5, 7);    // saeta count
    setBytes(s, 0xBB, 1);    // Espada active
    setBytes(s, 0xBC, 1);    // Saeta active
    setBytes(s, 0xA6, 1);    // item slot 0: Ken'ko potion
    setBytes(s, 0xA7, 6);    // item slot 1: Holy Water
    setBytes(s, 0x8D, 4);    // level
    setWord(s, 0x8E, 900);   // XP
    setWord(s, 0x8B, 25);    // almas
    return s;
}
function setBytes(s: MemState, addr: number, v: number): void { s.bytes.set(addr, v & 0xFF); }
function setWord(s: MemState, addr: number, v: number): void {
    s.bytes.set(addr, v & 0xFF);
    s.bytes.set(addr + 1, (v >> 8) & 0xFF);
}
const wordOf = (s: MemState, addr: number) =>
    (s.bytes.get(addr) ?? 0) | ((s.bytes.get(addr + 1) ?? 0) << 8);

function makeDeps(state: MemState) {
    const playSfx = vi.fn();
    const deps: InventoryDeps = {
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
        soundManager: { playSfx: playSfx, stopMusic: vi.fn(), playMusic: vi.fn(), _currentTrack: 7 },
        onExit: vi.fn(),
    };
    return { deps, playSfx };
}

async function make(env: { deps: InventoryDeps; playSfx: ReturnType<typeof vi.fn>; state: MemState }) {
    const scr = new InventoryScreen(env.deps);
    // stub asset loading (no real images in tests)
    Object.assign(scr as unknown as { sheetsReady: boolean }, { sheetsReady: true });
    scr.enter();
    return scr;
}

let state: MemState;
let envs: ReturnType<typeof makeDeps>;

beforeEach(() => {
    state = makeState();
    envs = makeDeps(state);
});

describe('InventoryScreen data snapshot', () => {
    it('enter() reads spells, wearables and items from g_mem', async () => {
        const scr = await make({ deps: envs.deps, playSfx: envs.playSfx, state });
        const d = (scr as unknown as { data: InventoryDataLike }).data;
        expect(d.spells).toEqual([1, 2]);           // two active spell slots
        expect(d.spellCounts).toEqual([5, 0]);
        expect(d.spellMaxCounts).toEqual([9, 7]);
        expect(d.items).toEqual([0, 1, 6]);         // no-use + potion + water
        expect(d.currentTab ?? 0).toBeDefined();
        expect(scr.currentTab).toBe(0);
        // selection snaps to the equipped spell
        expect(scr.selectedIndices[0]).toBe(0);
    });

    it('exit() restores music and fires the exit callback', async () => {
        const scr = await make({ deps: envs.deps, playSfx: envs.playSfx, state });
        scr.exit();
        expect(scr.active).toBe(false);
        expect(envs.deps.onExit).toHaveBeenCalled();
        expect((envs.deps.soundManager as { playMusic: ReturnType<typeof vi.fn> }).playMusic)
            .toHaveBeenCalledWith(7, 0.3);
    });
});

type InventoryDataLike = Record<string, unknown>;

describe('item use effects', () => {
    async function withItem(id: number): Promise<InventoryScreen> {
        state.bytes.set(0xA6, id);
        state.bytes.set(0xA7, 0);
        const scr = await make({ deps: envs.deps, playSfx: envs.playSfx, state });
        scr.handleInput('ArrowDown'); // tab to USE panel
        // navigate to first real item (index 1)
        scr.selectedIndices[2] = 1;
        return scr;
    }

    async function useItem(id: number) {
        const scr = await withItem(id);
        scr.handleInput('Space'); // use
        return scr;
    }

    it("Ken'ko potion heals up to the max", async () => {
        state.bytes.set(0x90, 150); // hp
        await useItem(1);
        expect(wordOf(state, 0x90)).toBe(200);      // clamped at max
        expect(state.bytes.get(0xFF99)).toBe(0xFF); // health bar redraw request
    });

    it("Juu-en fruit fully heals", async () => {
        state.bytes.set(0x90, 10);
        await useItem(2);
        expect(wordOf(state, 0x90)).toBe(200);
    });

    it('Elixir refills only the current spell', async () => {
        await useItem(3);
        expect(state.bytes.get(0xAB)).toBe(9); // Espada back to its max
        expect(state.bytes.get(0xAC) ?? 0).toBe(0); // Saeta untouched
    });

    it('Chikara powder refills every spell', async () => {
        state.bytes.set(0xAB, 0);
        state.bytes.set(0xAC, 0);
        await useItem(4);
        expect(state.bytes.get(0xAB)).toBe(9);
        expect(state.bytes.get(0xAC)).toBe(7);
    });

    it('Sabre oil bumps the enchant counter', async () => {
        await useItem(7);
        expect(state.bytes.get(0xE4)).toBe(1);
    });

    it('Kioku feather empties the used slot and exits shortly after', async () => {
        vi.useFakeTimers();
        try {
            const scr = await useItem(8);
            vi.advanceTimersByTime(700);
            expect(state.bytes.get(0xA6)).toBe(0);
            expect(envs.deps.onExit).toHaveBeenCalled();
            void scr;
        } finally {
            vi.useRealTimers();
        }
    });

    it('using an item consumes it from the slots', async () => {
        await useItem(1);
        expect(state.bytes.get(0xA6)).toBe(0);
    });

    it('Holy Water repairs the shield by the tier value without exceeding max', async () => {
        await useItem(6);
        const expected = Math.min(80, 20 + (SHIELD_HP_VALUES[1 - 1] || 0));
        expect(wordOf(state, 0x94)).toBe(expected);
    });
});

describe('navigation & debug combo', () => {
    it('tab switching skips empty panels', async () => {
        const scr = await make({ deps: envs.deps, playSfx: envs.playSfx, state });
        // wearables are empty in this fixture → ArrowDown skips to the items tab
        scr.handleInput('ArrowDown');
        expect(scr.currentTab).toBe(2);
        // and ArrowUp returns
        scr.handleInput('ArrowUp');
        expect(scr.currentTab).toBe(0);
    });

    it('Ctrl+Shift+S then E opens the debug popup on the items tab', async () => {
        const scr = await make({ deps: envs.deps, playSfx: envs.playSfx, state });
        scr.currentTab = 2;
        expect(scr.handleKey('KeyS', true, true, false)).toBe(true);
        expect(scr.handleKey('KeyE', true, true, false)).toBe(true);
        expect(scr.debugPopup).toBe(true);
        // any non-modifier key closes it
        scr.handleKey('Space', false, false, false);
        expect(scr.debugPopup).toBe(false);
    });

    it('unhandled keys report false', async () => {
        const scr = await make({ deps: envs.deps, playSfx: envs.playSfx, state });
        expect(scr.handleKey('KeyQ', false, false, false)).toBe(false);
    });
});

describe('inventory tables', () => {
    it('XP table and spell names match the original', () => {
        expect(XP_TABLE[0]).toBe(50);
        expect(XP_TABLE).toHaveLength(16);
        expect(SPELL_NAMES.join(',')).toBe('Espada,Saeta,Fuego,Lanzar,Rascar,Agua,Guerra');
    });
});
