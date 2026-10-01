// @vitest-environment happy-dom
/**
 * nav-thread-of-yaga.test.ts — the Thread of Yaga as a consumable item.
 *
 * The item is real content, so it has to behave like one: it must appear on the
 * USE tab when owned, be spent exactly once per use, never disturb the five
 * generic item slots, be sold in every town, and survive a save round trip in
 * bytes that are genuinely free.
 *
 * Two of those are subtler than they look. The magic-item array is full and
 * cannot grow, so this item lives in its own counter; and `putShoesToInventory`
 * scans forward from 0xA1 for a zero, walking into 0xA6 when the shoe slots are
 * full, so an item stored anywhere in 0xA1..0xFF would eventually be picked up as
 * a shoe. Both are asserted below.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { InventoryScreen, THREAD_OF_YAGA_ID, type InventoryDeps } from '../src/ui/inventory-screen.js';
import {
    MAGIC_ITEM_NAMES, MAGIC_ITEM_DESCRIPTIONS, MAGIC_PRICES_BY_TOWN,
    THREAD_OF_YAGA_SHOP_INDEX, THREAD_OF_YAGA_BIT, DEFAULT_MAGIC_MASKS_EXT,
} from '../src/scenes/indoor-magic-shop.js';
import {
    ADDR_THREAD_OF_YAGA, ADDR_MAGIC_MASKS_EXT, ADDR_FEATURE_YAGA,
} from '../src/core/memory.js';
import {
    createLiveHeroState, createLiveDungeonState, readHeroState, writeHeroState,
} from '../src/core/game-state.js';
import { getGmem, memWrite8, loadSaveState } from '../src/core/ts-memory.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {}, drawImage() {},
    fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, roundRect() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
} as unknown as CanvasRenderingContext2D;
const CANVAS = { width: 672, height: 432 } as HTMLCanvasElement;

// ── the save representation ─────────────────────────────────────────────────

describe('storage', () => {
    it('lives in bytes the engine does not use', () => {
        // 0xA1..0xFF is dangerous: the shoe pickup scans forward from 0xA1 for a
        // zero and the cape purchase scans 0xA1..0xFF, so anything in there can
        // be swallowed as another item type.
        expect(ADDR_THREAD_OF_YAGA).toBeLessThan(0xa1);
        expect(ADDR_MAGIC_MASKS_EXT).toBeLessThan(0xa1);
        // Nine stock bytes for nine towns.
        expect(ADDR_MAGIC_MASKS_EXT + 9).toBeLessThan(0xa1);
    });

    it('does not collide with any address the engine declares', () => {
        // Scan the engine for g_mem constants in the low page and make sure ours
        // is the only thing there. A future edit that starts using 0x4A would
        // silently corrupt the item count.
        const files = [
            'src/core/memory.ts', 'src/core/game-state.ts', 'src/core/ts-memory.ts',
            'src/engine/dungeon-entities.ts', 'src/engine/dungeon-doors.ts',
            'src/engine/dungeon-vertical.ts',
            'src/engine/dungeon-frame.ts', 'src/engine/dungeon-frame-pre.ts',
            'src/engine/dungeon-input.ts', 'src/engine/dungeon-items.ts',
            'src/engine/dungeon-platforms.ts', 'src/engine/dungeon-states.ts',
            'src/engine/dungeon-init.ts', 'src/engine/dungeon-damage.ts',
            'src/engine/dungeon-monsters.ts', 'src/engine/dungeon-hero.ts',
            'src/engine/dungeon-projectiles.ts', 'src/engine/dungeon-spells.ts',
        ];
        const mine = new Set([ADDR_THREAD_OF_YAGA]);
        for (let i = 0; i < 9; i++) mine.add(ADDR_MAGIC_MASKS_EXT + i);

        const clashes: string[] = [];
        for (const rel of files) {
            const src = readFileSync(resolve(REPO, 'web', rel), 'utf8');
            // Only constants declared as addresses, not data-table values.
            for (const m of src.matchAll(/^\s*(?:export\s+)?const\s+[A-Z_0-9]+\s*=\s*(0x[0-9a-fA-F]+);/gm)) {
                const addr = Number.parseInt(m[1] ?? '0x0', 16);
                if (addr > 0xff) continue;
                if (mine.has(addr) && rel !== 'src/core/memory.ts') clashes.push(`${rel}: ${addr}`);
            }
        }
        expect(clashes).toEqual([]);
    });

    it('round-trips through HeroState', () => {
        const g = getGmem();
        loadSaveState(new Uint8Array(256));
        memWrite8(g, ADDR_FEATURE_YAGA, 0xa7);
        memWrite8(g, ADDR_THREAD_OF_YAGA, 7);
        for (let t = 0; t < 9; t++) memWrite8(g, ADDR_MAGIC_MASKS_EXT + t, (t & 1) ? 0x80 : 0);

        const h = readHeroState(g);
        expect(h.threadOfYaga).toBe(7);
        expect(Array.from(h.magicMasksExt)).toEqual([0, 0x80, 0, 0x80, 0, 0x80, 0, 0x80, 0]);

        loadSaveState(new Uint8Array(256));
        writeHeroState(g, h);
        expect(g[ADDR_THREAD_OF_YAGA]).toBe(7);
        expect(g[ADDR_MAGIC_MASKS_EXT + 1]).toBe(0x80);
    });

    it('reads a save without the marker as "not owned", whatever it holds', () => {
        const g = getGmem();
        // An old save has no marker, and 0x4A is unclaimed by the original game —
        // but it can still hold whatever the engine left there mid-play, so the
        // marker is what decides, not the byte's value.
        const old = new Uint8Array(256);
        old[0x90] = 100;
        old[0x4a] = 0x5a;                 // plausible leftover
        for (let t = 0; t < 9; t++) old[0x4b + t] = 0xff;
        loadSaveState(old);
        const h = readHeroState(g);
        expect(h.threadOfYaga).toBe(0);
        expect(Array.from(h.magicMasksExt).every((v) => v === 0)).toBe(true);
    });

    it('round-trips the item when the marker is present', () => {
        const g = getGmem();
        loadSaveState(new Uint8Array(256));
        memWrite8(g, ADDR_FEATURE_YAGA, 0xa7);
        memWrite8(g, ADDR_THREAD_OF_YAGA, 5);
        memWrite8(g, ADDR_MAGIC_MASKS_EXT + 6, 0x80);
        const h = readHeroState(g);
        expect(h.threadOfYaga).toBe(5);
        expect(h.magicMasksExt[6]).toBe(0x80);
    });

    it('writes the marker only when the item is relevant', () => {
        const g = getGmem();
        // Nothing owned: the save must not gain a byte it never had, because the
        // image round-trips byte for byte.
        loadSaveState(new Uint8Array(256));
        let h = readHeroState(g);
        writeHeroState(g, h);
        expect(g[ADDR_FEATURE_YAGA]).toBe(0);

        loadSaveState(new Uint8Array(256));
        h = readHeroState(g);
        h.threadOfYaga = 2;
        writeHeroState(g, h);
        expect(g[ADDR_FEATURE_YAGA]).toBe(0xa7);
        expect(g[ADDR_THREAD_OF_YAGA]).toBe(2);
    });

    it('starts a new game with nothing owned and nothing in stock', () => {
        loadSaveState(new Uint8Array(256));   // a clean 256-byte image
        const h = createLiveHeroState(getGmem());
        expect(h.threadOfYaga).toBe(0);
        expect(Array.from(h.magicMasksExt).every((v) => v === 0)).toBe(true);
    });

    it('keeps the count visible as a live view of memory', () => {
        const g = getGmem();
        loadSaveState(new Uint8Array(256));
        const h = createLiveHeroState(g);
        expect(h.threadOfYaga).toBe(0);
        memWrite8(g, ADDR_FEATURE_YAGA, 0xa7);
        memWrite8(g, ADDR_THREAD_OF_YAGA, 4);
        expect(h.threadOfYaga).toBe(4);
        memWrite8(g, ADDR_THREAD_OF_YAGA, 0);
        expect(h.threadOfYaga).toBe(0);
    });
});

// ── the inventory panel ─────────────────────────────────────────────────────

interface Harness {
    screen: InventoryScreen;
    opened: () => number;
    onExit: () => void;
}

function harness(): Harness {
    const g = getGmem();
    loadSaveState(new Uint8Array(256));
    // Mark the image as knowing about the item, so the live view will read it.
    memWrite8(g, ADDR_FEATURE_YAGA, 0xa7);
    memWrite8(g, 0x90, 100);
    memWrite8(g, 0xb2, 200);
    memWrite8(g, 0x92, 1);
    memWrite8(g, 0x93, 1);
    memWrite8(g, 0x94, 20);
    memWrite8(g, 0x96, 80);
    memWrite8(g, 0x8d, 4);
    let opened = 0;
    const deps: InventoryDeps = {
        canvas: CANVAS,
        ctx: CTX,
        heroState: createLiveHeroState(g),
        dungeon: createLiveDungeonState(g),
        readMemory: null,
        writeMemory: null,
        soundManager: { playSfx: vi.fn(), setMusicMuted: vi.fn(), setSfxMuted: vi.fn() },
        onExit: () => {},
        onOpenMapScreen: () => { opened++; },
    };
    const screen = new InventoryScreen(deps);
    return { screen, opened: () => opened, onExit: () => {} };
}

/** Reach into the private panel the same way its own key handler does. */
function useItem(screen: InventoryScreen, id: number): void {
    // Position the USE-tab cursor on the entry for `id` and press Space.
    const data = (screen as unknown as { data: { items: number[] } }).data;
    const index = data.items.indexOf(id);
    if (index < 0) throw new Error(`item ${id} is not listed`);
    (screen as unknown as { selectedIndices: number[] }).selectedIndices[2] = index;
    (screen as unknown as { currentTab: number }).currentTab = 2;
    (screen as unknown as { _useItem: () => void })._useItem();
}

function listedItems(screen: InventoryScreen): number[] {
    return (screen as unknown as { data: { items: number[] } }).data.items;
}

describe('the inventory panel', () => {
    let h: Harness;
    beforeEach(() => { h = harness(); });

    it('lists the item only while it is owned', () => {
        h.screen.enter();
        expect(listedItems(h.screen)).not.toContain(THREAD_OF_YAGA_ID);

        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 2;
        (h.screen as unknown as { _readGameData: () => void })._readGameData();
        expect(listedItems(h.screen)).toContain(THREAD_OF_YAGA_ID);
    });

    it('lists it alongside the generic slots, not instead of them', () => {
        const g = getGmem();
        memWrite8(g, 0xa6, 1);   // Ken'ko Potion in a generic slot
        memWrite8(g, 0xa7, 6);   // Holy Water in another
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 1;
        h.screen.enter();
        const items = listedItems(h.screen);
        expect(items).toContain(0);
        expect(items).toContain(1);
        expect(items).toContain(6);
        expect(items).toContain(THREAD_OF_YAGA_ID);
    });

    it('offers the thread to the map screen without spending it yet', () => {
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 3;
        h.screen.enter();
        useItem(h.screen, THREAD_OF_YAGA_ID);
        // The map opened, but nothing is spent until a destination is chosen.
        expect(h.opened()).toBe(1);
        expect(state.threadOfYaga).toBe(3);
        expect(h.screen.isThreadPending).toBe(true);
    });

    it('spends the thread when a destination is committed', () => {
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 3;
        h.screen.enter();
        useItem(h.screen, THREAD_OF_YAGA_ID);
        h.screen.commitThreadOfYaga();
        expect(state.threadOfYaga).toBe(2);
        expect(h.screen.isThreadPending).toBe(false);
        expect(listedItems(h.screen)).toContain(THREAD_OF_YAGA_ID);
        const data = (h.screen as unknown as { data: { items: number[] } }).data;
        expect(data.items.length).toBeGreaterThan(1);   // the NO USE sentinel plus it
    });

    it('gives the thread back when no destination is chosen', () => {
        // Pressing Escape on the map must not cost a thread.
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 2;
        h.screen.enter();
        useItem(h.screen, THREAD_OF_YAGA_ID);
        h.screen.cancelThreadOfYaga();
        expect(state.threadOfYaga).toBe(2);
        expect(h.screen.isThreadPending).toBe(false);
    });

    it('gives the thread back when the inventory is left instead', () => {
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 2;
        h.screen.enter();
        useItem(h.screen, THREAD_OF_YAGA_ID);
        h.screen.exit();
        expect(state.threadOfYaga).toBe(2);
    });

    it('cannot open the map twice from one use', () => {
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 3;
        h.screen.enter();
        useItem(h.screen, THREAD_OF_YAGA_ID);
        useItem(h.screen, THREAD_OF_YAGA_ID);
        expect(h.opened()).toBe(1);
    });

    it('committing with nothing owned spends nothing', () => {
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 1;
        h.screen.enter();
        useItem(h.screen, THREAD_OF_YAGA_ID);
        h.screen.cancelThreadOfYaga();
        state.threadOfYaga = 0;
        h.screen.commitThreadOfYaga();
        expect(state.threadOfYaga).toBe(0);
    });

    it('never touches a generic item slot', () => {
        const g = getGmem();
        memWrite8(g, 0xa6, 1);
        memWrite8(g, 0xa7, 6);
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 2;
        h.screen.enter();
        useItem(h.screen, THREAD_OF_YAGA_ID);
        h.screen.commitThreadOfYaga();
        // Spending a Thread must not consume the Ken'ko Potion beside it.
        expect(g[0xa6]).toBe(1);
        expect(g[0xa7]).toBe(6);
    });

    it('refuses to use when nothing is owned', () => {
        h.screen.enter();
        // Force the cursor onto it as if it were listed.
        const data = (h.screen as unknown as { data: { items: number[] } }).data;
        data.items.push(THREAD_OF_YAGA_ID);
        const state = (h.screen as unknown as { heroState: { threadOfYaga: number } }).heroState;
        state.threadOfYaga = 0;
        useItem(h.screen, THREAD_OF_YAGA_ID);
        expect(state.threadOfYaga).toBe(0);
        expect(h.opened()).toBe(0);
        expect(h.screen.isThreadPending).toBe(false);
    });
});

// ── the magic shop ──────────────────────────────────────────────────────────

describe('the magic shop', () => {
    it('sells it in every town, at a significant price', () => {
        expect(MAGIC_PRICES_BY_TOWN).toHaveLength(9);
        for (const [town, row] of MAGIC_PRICES_BY_TOWN.entries()) {
            expect(row).toHaveLength(9);
            const price = row[THREAD_OF_YAGA_SHOP_INDEX]!;
            // Higher than every consumable in the same row.
            const cheapest = Math.min(...row.slice(0, 8));
            expect(price, `town ${town}`).toBeGreaterThan(cheapest);
        }
        // And flat across towns, so it is never a bargain somewhere.
        const prices = new Set(MAGIC_PRICES_BY_TOWN.map((r) => r[THREAD_OF_YAGA_SHOP_INDEX]));
        expect(prices.size).toBe(1);
    });

    it('has a name and a description for it', () => {
        expect(MAGIC_ITEM_NAMES).toHaveLength(9);
        expect(MAGIC_ITEM_DESCRIPTIONS).toHaveLength(9);
        expect(MAGIC_ITEM_NAMES[THREAD_OF_YAGA_SHOP_INDEX]).toBeTruthy();
        expect(MAGIC_ITEM_DESCRIPTIONS[THREAD_OF_YAGA_SHOP_INDEX]).toBeTruthy();
    });

    it('has its own stock bit, outside the full 8-bit mask', () => {
        expect(THREAD_OF_YAGA_BIT).toBe(0x80);
        // The generic mask is already 8 bits wide and every bit is used.
        expect(THREAD_OF_YAGA_SHOP_INDEX).toBe(8);
    });

    it('is stocked in every town by default', () => {
        // The bug this pins: the extended mask has no entries in the original
        // tables, so without an explicit default an untouched save reads zero and
        // the item never appears in any shop.
        expect(DEFAULT_MAGIC_MASKS_EXT).toHaveLength(9);
        for (const [town, mask] of DEFAULT_MAGIC_MASKS_EXT.entries()) {
            expect(mask & THREAD_OF_YAGA_BIT, `town ${town}`).toBeTruthy();
        }
    });
});

// ── localisation ────────────────────────────────────────────────────────────

describe('localisation', () => {
    for (const locale of ['en', 'ru', 'isv']) {
        it(`${locale} names the item everywhere it appears`, () => {
            const json = JSON.parse(
                readFileSync(resolve(REPO, `web/src/locale/${locale}.json`), 'utf8'),
            ) as {
                inventory: { itemNames: string[]; itemUseText: string[] };
                indoor: { magicShop: { itemNames: string[]; itemDescriptions: string[] } };
            };
            expect(json.inventory.itemNames).toHaveLength(10);   // index 0 is "no use"
            expect(json.inventory.itemUseText).toHaveLength(10);
            expect(json.indoor.magicShop.itemNames).toHaveLength(9);
            expect(json.indoor.magicShop.itemDescriptions).toHaveLength(9);
            expect(json.inventory.itemNames[THREAD_OF_YAGA_ID]).toBeTruthy();
            expect(json.inventory.itemUseText[THREAD_OF_YAGA_ID]).toBeTruthy();
            expect(json.indoor.magicShop.itemNames[THREAD_OF_YAGA_SHOP_INDEX]).toBeTruthy();
            expect(json.indoor.magicShop.itemDescriptions[THREAD_OF_YAGA_SHOP_INDEX]).toBeTruthy();
        });
    }
});

// ── artwork ─────────────────────────────────────────────────────────────────

describe('artwork', () => {
    it('has its own sheet, so magic_items.png keeps its eight frames', () => {
        const itemSheet = readFileSync(resolve(REPO, 'web/public/assets/images/magic_items.png'));
        const pathSheet = readFileSync(resolve(REPO, 'web/public/assets/images/path_items.png'));
        const widthOf = (b: Buffer) => b.readUInt32BE(16);
        expect(widthOf(itemSheet)).toBe(48 * 8);
        expect(widthOf(pathSheet)).toBe(48);
        expect(itemSheet.readUInt32BE(20)).toBe(48);
        expect(pathSheet.readUInt32BE(20)).toBe(48);
    });
});
