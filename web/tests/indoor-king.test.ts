// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    KingScene,
    KING_DIALOG_SCRIPTS,
    KING_GOLD_GIFT_LINE,
    buildDialogPages,
    selectKingDialogKey,
} from '../src/scenes/indoor-king.js';
import type { IndoorSceneDependencies } from '../src/core/scene.js';
import { createLiveHeroState } from '../src/core/game-state.js';

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {},
    drawImage() {}, fillText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '',
    lineWidth: 1, textAlign: '', textBaseline: '',
} as unknown as CanvasRenderingContext2D;

const CANVAS = { width: 672, height: 432 } as HTMLCanvasElement;

function makeMemory(flags: Record<number, number>) {
    return (offset: number, length: number) => {
        const out = new Uint8Array(length);
        for (let i = 0; i < length; i++) out[i] = flags[offset + i] ?? 0;
        return out;
    };
}

function makeDeps(overrides: {
    flags?: Record<number, number>;
    gold?: number; // 24-bit hero gold (lo at 0x86, hi at 0x85)
    readMemory?: IndoorSceneDependencies['readMemory'];
} = {}) {
    const writes: Array<{ offset: number; data: number[] }> = [];
    let gold = overrides.gold ?? 0;
    const heroBuf = new Uint8Array(0x10000);
    const applyFlags = (flags: Record<number, number>) => {
        for (const [k, v] of Object.entries(flags)) {
            heroBuf[Number(k)] = v & 0xFF;
        }
    };
    const applyGold = (v: number) => {
        heroBuf[0x85] = (v >>> 16) & 0xFF;
        heroBuf[0x86] = v & 0xFF;
        heroBuf[0x87] = (v >> 8) & 0xFF;
    };
    applyFlags(overrides.flags ?? {});
    applyGold(gold);
    const deps: IndoorSceneDependencies = {
        canvas: CANVAS,
        ctx: CTX,
        heroState: createLiveHeroState(heroBuf),
        readMemory: overrides.readMemory ?? ((offset, length) => {
            if (offset === 0x86) return new Uint8Array([heroBuf[0x86] ?? 0, heroBuf[0x87] ?? 0]);
            if (offset === 0x85) return new Uint8Array([heroBuf[0x85] ?? 0]);
            return heroBuf.subarray(offset, offset + length);
        }),
        writeMemory: vi.fn((offset: number, data: Uint8Array) => {
            writes.push({ offset, data: [...data] });
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
    return { deps, writes, heroBuf };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('selectKingDialogKey', () => {
    const SPOKE = 0x05, ENTERED = 0x06, DEATH = 0x49;

    it('firstAudience before any progress', () => {
        expect(selectKingDialogKey(makeMemory({}))).toBe('firstAudience');
    });

    it('reminder as soon as the king was spoke to (cavern not entered)', () => {
        expect(selectKingDialogKey(makeMemory({ [SPOKE]: 1 }))).toBe('reminder');
    });

    it('reminder once the king was visited but cavern not entered', () => {
        expect(selectKingDialogKey(makeMemory({ [SPOKE]: 0xFF }))).toBe('reminder');
    });

    it('afterCavern once the cavern has been entered', () => {
        expect(selectKingDialogKey(makeMemory({ [SPOKE]: 1, [ENTERED]: 1 }))).toBe('afterCavern');
    });

    it('victory after the demon is defeated', () => {
        expect(selectKingDialogKey(makeMemory({ [SPOKE]: 1, [ENTERED]: 1, [DEATH]: 1 }))).toBe('victory');
    });

    it('falls back to firstAudience without a memory reader', () => {
        expect(selectKingDialogKey(null)).toBe('firstAudience');
    });
});

describe('buildDialogPages', () => {
    it('falls back to the first-audience script for unknown keys (legacy ||)', () => {
        const { pages } = buildDialogPages(CTX, 'nonexistent');
        expect(pages.flat().join(' ')).toContain('Brave Duke Garland');
    });

    it('wraps long paragraphs into ≤4-line pages', () => {
        const { pages } = buildDialogPages(CTX, 'afterCavern');
        for (const page of pages) {
            expect(page.length).toBeLessThanOrEqual(4);
        }
        // joined content preserves all words
        const joined = pages.flat().join(' ');
        for (const para of KING_DIALOG_SCRIPTS.afterCavern) {
            for (const word of para.split(/\s+/)) {
                expect(joined).toContain(word);
            }
        }
    });

    it('marks the gold-award page in the first-audience script', () => {
        const { pages, goldAwardPage } = buildDialogPages(CTX, 'firstAudience');
        expect(goldAwardPage).toBeGreaterThanOrEqual(0);
        expect(goldAwardPage).toBeLessThan(pages.length);
        expect(pages[goldAwardPage]!.join(' ')).toContain('bestow upon you');
    });

    it('does not mark a gold page in other scripts', () => {
        expect(buildDialogPages(CTX, 'reminder').goldAwardPage).toBe(-1);
        expect(KING_DIALOG_SCRIPTS.reminder.join()).not.toContain(KING_GOLD_GIFT_LINE);
    });
});

describe('KingScene audience flow', () => {
    function stubImages(): void {
        class FakeImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            src = '';
            constructor() { setTimeout(() => this.onload?.(), 0); }
        }
        vi.stubGlobal('Image', FakeImage);
    }

    async function enter(depsOverrides: Parameters<typeof makeDeps>[0] = {}) {
        stubImages();
        const { deps, writes, heroBuf } = makeDeps(depsOverrides);
        const scene = new KingScene(deps);
        const s = scene as unknown as {
            phase: string; king: {
                page: number; pageStart: number; pages: string[][]; dialogKey: string;
                goldAwardPage: number; goldAward: unknown;
            };
        };
        scene.enter(1000);
        await new Promise(r => setTimeout(r, 0));
        return { scene, s, deps, writes, heroBuf };
    }

    async function enterAndSkipEntry(depsOverrides: Parameters<typeof makeDeps>[0] = {}) {
        const env = await enter(depsOverrides);
        // entry animation: 5 frames * 350ms
        env.scene.draw(1000);
        env.scene.draw(1000 + 5 * 350);
        expect(env.s.phase).toBe('kingDialog');
        return env;
    }

    it('runs the entry animation then switches to dialog phase', async () => {
        await enterAndSkipEntry();
    });

    it('Space during typing fast-forwards the current page instead of advancing', async () => {
        const { scene, s } = await enterAndSkipEntry();
        const before = s.king.pageStart;
        scene.handleInput('Space'); // performance.now() ≈ small; still < totalChars*30ms
        expect(s.king.page).toBe(0);
        expect(s.king.pageStart).not.toBe(before); // fast-forwarded
    });

    it('first audience awards 1000 gold in 10 steps with SFX requests', async () => {
        const { scene, s, deps, writes, heroBuf } = await enterAndSkipEntry();
        expect(s.king.dialogKey).toBe('firstAudience');

        // advance through pages until the gold award starts
        let guard = 0;
        while (s.phase !== 'kingGoldAward' && guard++ < 20) {
            scene.draw(100000 + guard); // finish typing instantly
            scene.handleInput('Space');
        }
        expect(s.phase).toBe('kingGoldAward');

        // first step applied immediately on start
        expect(deps.renderGoldHud).toHaveBeenCalled();
        // step every 100ms until 10 steps done
        for (let t = 101000; t <= 102000; t += 50) {
            scene.draw(t);
        }
        // all 10 steps applied → spoke flag written, back to dialog
        const sfxCount = writes.filter(w => w.offset === 0xFF75 && w.data[0] === 67).length;
        expect(sfxCount).toBeGreaterThanOrEqual(9);
        expect(writes.some(w => w.offset === 0x05 && w.data[0] === 0xFF) || heroBuf[0x05] === 0xFF).toBe(true);
        expect(s.king.goldAward).toBeNull();
    });

    it('skips the gold award when the king was already spoken to', async () => {
        const { scene, s } = await enterAndSkipEntry({ flags: { 0x05: 0xFF } });
        // jump straight onto the gold award page
        s.king.page = s.king.goldAwardPage;
        scene.draw(100000); // finish typing
        scene.handleInput('Space');
        expect(s.phase).not.toBe('kingGoldAward'); // advanced normally
    });

    it('advances pages on Space after typing completes and fades out after the last', async () => {
        const { scene, s } = await enterAndSkipEntry({ flags: { 0x05: 0xFF } });
        let guard = 0;
        while (s.phase !== 'fadeOut' && guard++ < 20) {
            scene.draw(200000 + guard * 100000);
            scene.handleInput('Space');
        }
        expect(s.phase).toBe('fadeOut');
    });

    it('reports its building name', async () => {
        const { scene } = await enter();
        expect((scene as unknown as { getName: () => string }).getName()).toBe('King of Felishika');
    });

    it('finishes via callback when images fail to load', async () => {
        class BrokenImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            src = '';
            constructor() { setTimeout(() => this.onerror?.(), 0); }
        }
        vi.stubGlobal('Image', BrokenImage);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { deps } = makeDeps({});
        const scene = new KingScene(deps);
        scene.enter(1000);
        await new Promise(r => setTimeout(r, 0));
        expect(deps.finishCallback).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
