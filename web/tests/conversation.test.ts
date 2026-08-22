import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ConversationManager,
    ASBESTOS_CAPE_ITEM_ID,
    ASBESTOS_CAPE_PRICE,
} from '../src/core/conversation.js';

const ADDR_NPC_ADDR_LATCH = 0xfff6;
const ADDR_CALIENTE_ITEMS = 0x34;
const ADDR_PLACE_MAP_ID = 0xc4;
const ADDR_HERO_CREST = 0x9c;
const ADDR_SPACEBAR_LATCH = 0xff1d;
const LLAMA_TOWN_ID = 7;

/** Conversation streams may mix text and control-code bytes. */
type Stream = (string | number)[];
function toBytes(stream: Stream): Uint8Array {
    const out: number[] = [];
    for (const part of stream) {
        if (typeof part === 'number') out.push(part);
        else out.push(...[...part].map((c) => c.charCodeAt(0)));
    }
    return new Uint8Array(out);
}

function makeFixture(conversations: Record<number, Stream>) {
    const buf = new Uint8Array(0x10000);
    let almas = 5000;

    const townFinishConversation = vi.fn();
    const renderAlmasHud = vi.fn();
    const layout = vi.fn();

    const deps = {
        readMemory: (offset: number, length: number) => buf.subarray(offset & 0xffff, (offset & 0xffff) + length),
        writeMemory: (offset: number, data: ArrayLike<number>) => {
            for (let i = 0; i < data.length; i++) buf[(offset + i) & 0xffff] = data[i];
        },
        getNpcConversationRaw: (id: number) => {
            const stream = conversations[id];
            return stream ? toBytes(stream) : null;
        },
        townFinishConversation,
        getHeroAlmasValue: () => almas,
        setHeroAlmasValue: (v: number) => void (almas = v),
        renderAlmasHud,
        layout,
    };
    const mgr = new ConversationManager(deps);
    return { mgr, buf, townFinishConversation, renderAlmasHud, layout, getAlmas: () => almas, setAlmas: (v: number) => void (almas = v) };
}

function pressSpace(f: ReturnType<typeof makeFixture>) {
    f.buf[ADDR_SPACEBAR_LATCH] = 1;
}

function tick(f: ReturnType<typeof makeFixture>, up = false, down = false) {
    f.mgr.handleTick(up, down);
}

describe('startFromWasm', () => {
    it('starts the NPC pattern and lays out the box', () => {
        const f = makeFixture({ 0: ['Hello stranger.'] });
        f.buf[ADDR_NPC_ADDR_LATCH] = 0; // npcAddr 0 -> npcId 0

        f.mgr.startFromWasm();
        expect(f.mgr.active).toBe(true);
        expect(f.mgr.pages).toEqual([['Hello stranger.']]);
        expect(f.layout).toHaveBeenCalledWith(false);
        expect(f.townFinishConversation).not.toHaveBeenCalled();
    });

    it('finishes immediately when the pattern is empty/missing', () => {
        const f = makeFixture({});
        f.mgr.startFromWasm();
        expect(f.mgr.active).toBe(false);
        expect(f.townFinishConversation).toHaveBeenCalledTimes(1);
    });

    it('reroutes bought-out cape merchant (npc 3) in Llama to pattern 9', () => {
        const f = makeFixture({
            3: ['Buy a cape?'],
            9: ['Cape talk.'],
        });
        f.buf[ADDR_CALIENTE_ITEMS] = 0x40; // bit6 = cape already bought
        f.buf[0x200 + 7] = 3; // NPC struct id
        f.buf[ADDR_NPC_ADDR_LATCH] = 0x00;
        f.buf[ADDR_NPC_ADDR_LATCH + 1] = 0x02; // addr 0x200
        f.buf[ADDR_PLACE_MAP_ID] = LLAMA_TOWN_ID;

        f.mgr.startFromWasm();
        expect(f.mgr.pages).toEqual([['Cape talk.']]);
    });

    it('keeps npc 3 elsewhere even when the cape is owned', () => {
        const f = makeFixture({ 3: ['Buy a cape?'] });
        f.buf[ADDR_CALIENTE_ITEMS] = 0x40;
        f.buf[0x200 + 7] = 3;
        f.buf[ADDR_NPC_ADDR_LATCH] = 0x00;
        f.buf[ADDR_NPC_ADDR_LATCH + 1] = 0x02;
        f.buf[ADDR_PLACE_MAP_ID] = 1; // not Llama

        f.mgr.startFromWasm();
        expect(f.mgr.pages).toEqual([['Buy a cape?']]);
    });

    it('swaps Yes/No text for Hero Crest holders (pattern 14)', () => {
        const f = makeFixture({
            0: ['Trade?', 0x81],
            14: ['Crest phrasing.'],
        });
        f.buf[ADDR_HERO_CREST] = 0xff;

        f.mgr.startFromWasm();
        // The replacement pattern's own stream defines the new flags.
        expect(f.mgr.hasYesNo).toBe(false);
        expect(f.mgr.pages).toEqual([['Crest phrasing.']]);
    });

    it('reads facing direction from the NPC struct', () => {
        const f = makeFixture({ 0: ['Hi'] });
        f.buf[0x300 + 7] = 0; // npcId 0
        f.buf[0x300 + 2] = 0x80; // face-left flag
        f.buf[ADDR_NPC_ADDR_LATCH] = 0x00;
        f.buf[ADDR_NPC_ADDR_LATCH + 1] = 0x03; // addr 0x300

        f.mgr.startFromWasm();
        expect(f.mgr.facingLeft).toBe(0x80); // raw byte preserved like legacy
        expect(f.layout).toHaveBeenLastCalledWith(0x80);
    });
});

describe('paging', () => {
    it('space advances pages, closing only on the last', () => {
        const lines = Array.from({ length: 17 }, (_, i) => `L${i}`).join('/');
        const f = makeFixture({ 0: [lines.replace(/\//g, '/' )] , 1: [] });
        // Rebuild with explicit breaks: 17 lines -> 15-line page + remainder.
        const f2 = makeFixture({ 0: Array.from({ length: 16 }, (_, i) => [`L${i}`, '/']).flat() });

        f2.mgr.startFromWasm();
        expect(f2.mgr.pages.length).toBeGreaterThanOrEqual(2);

        while (f2.mgr.page < f2.mgr.pages.length - 1) {
            const before = f2.mgr.page;
            pressSpace(f2);
            tick(f2);
            expect(f2.mgr.page).toBe(before + 1);
        }
        pressSpace(f2);
        tick(f2);
        expect(f2.mgr.active).toBe(false);
    });
});

describe('yes/no flow', () => {
    function yesNoFixture() {
        return makeFixture({
            0: ['Trade?', '/', '', 0x81],
            12: ['You got it!'],
            13: ['Maybe later.'],
        });
    }

    it('last-page space opens the choice instead of closing', () => {
        const f = yesNoFixture();
        f.mgr.startFromWasm();
        pressSpace(f);
        tick(f);
        expect(f.mgr.yesNoMode).toBe(true);
        expect(f.mgr.yesNoCursor).toBe(0);
        expect(f.mgr.active).toBe(true);
        expect(f.layout).toHaveBeenCalledWith(f.mgr.facingLeft, 2);
    });

    it('cursor clamps between 0 and 1 via direction edges', () => {
        const f = yesNoFixture();
        f.mgr.startFromWasm();
        pressSpace(f);
        tick(f);

        tick(f, false, true); // down edge
        expect(f.mgr.yesNoCursor).toBe(1);
        tick(f, false, true); // already at bottom
        expect(f.mgr.yesNoCursor).toBe(1);
        tick(f, true, false); // up edge
        expect(f.mgr.yesNoCursor).toBe(0);
        tick(f, true, false); // already at top
        expect(f.mgr.yesNoCursor).toBe(0);
    });

    it('answering closes, finishes wasm state, then shows the response pattern', () => {
        const f = yesNoFixture();
        f.mgr.startFromWasm();
        pressSpace(f);
        tick(f); // open choice
        f.townFinishConversation.mockClear();

        tick(f, false, true); // move to "No"
        pressSpace(f);
        tick(f); // confirm

        expect(f.townFinishConversation).toHaveBeenCalled();
        expect(f.mgr.active).toBe(true);
        expect(f.mgr.pages).toEqual([['Maybe later.']]);
        expect(f.mgr.yesNoMode).toBe(false);
    });
});

describe('Asbestos Cape purchase flow', () => {
    function purchaseFixture(almas?: number) {
        const f = makeFixture({
            0: ['Take it?', 0x89],
            5: ['Not free though...'],
            6: ['Refused.'],
            7: ['No almas.'],
            8: ['Pleasure doing business.'],
        });
        if (almas !== undefined) f.setAlmas(almas);
        return f;
    }

    it('end code 0x89 enters purchase mode with two options', () => {
        const f = purchaseFixture();
        f.mgr.startFromWasm();
        pressSpace(f);
        tick(f);
        expect(f.mgr.purchaseMode).toBe(true);
        expect(f.mgr.purchaseCursor).toBe(0);
        expect(f.mgr.active).toBe(true);
        expect(f.layout).toHaveBeenCalledWith(f.mgr.facingLeft, 2);
    });

    it('"Take" deducts almas, sets flags, inserts item, shows receipt', () => {
        const f = purchaseFixture(ASBESTOS_CAPE_PRICE + 100);
        f.mgr.startFromWasm();
        pressSpace(f);
        tick(f); // enter purchase mode

        pressSpace(f);
        tick(f); // confirm "Take" (cursor 0)

        expect(f.getAlmas()).toBe(100);
        expect(f.renderAlmasHud).toHaveBeenCalled();
        expect(f.buf[ADDR_CALIENTE_ITEMS] & 0x40).toBe(0x40);
        expect(f.buf[0xa1]).toBe(ASBESTOS_CAPE_ITEM_ID); // first empty slot
        expect(f.mgr.pages).toEqual([['Pleasure doing business.']]);
    });

    it('"Take" without almas shows the poorhouse pattern and keeps money', () => {
        const f = purchaseFixture(ASBESTOS_CAPE_PRICE - 1);
        f.mgr.startFromWasm();
        pressSpace(f);
        tick(f);

        pressSpace(f);
        tick(f);
        expect(f.mgr.pages).toEqual([['No almas.']]);
        expect(f.getAlmas()).toBe(ASBESTOS_CAPE_PRICE - 1);
        expect(f.buf[0xa1]).toBe(0);
    });

    it('"No Take" refuses without touching gold or inventory', () => {
        const f = purchaseFixture();
        f.mgr.startFromWasm();
        pressSpace(f);
        tick(f); // enter purchase mode

        tick(f, false, true); // cursor down -> "No Take"
        pressSpace(f);
        tick(f); // confirm

        expect(f.mgr.pages).toEqual([['Refused.']]);
        expect(f.buf[0xa1]).toBe(0);
        expect(f.getAlmas()).toBe(5000);
    });
});

describe('end code 0x87 chain', () => {
    it('loads the follow-up pattern once', () => {
        const f = makeFixture({
            0: ['Part one', 0x87],
            5: ['Part two'],
        });
        f.mgr.startFromWasm();
        pressSpace(f);
        tick(f);
        expect(f.mgr.pages).toEqual([['Part two']]);
        expect(f.mgr.endCode).toBeNull();
    });
});
