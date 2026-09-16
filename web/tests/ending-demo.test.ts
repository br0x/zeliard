// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EndingDemo, parseDialogueScript } from '../src/scenes/ending-demo.js';
import { setLocale } from '../src/locale/index.js';

function makeCtx(): CanvasRenderingContext2D {
    return {
        save() {}, restore() {},
        fillRect() {}, clearRect() {}, drawImage() {}, fillText() {},
        beginPath() {}, rect() {}, clip() {}, arc() {},
        measureText: (t: string) => ({ width: t.length * 10 }),
        imageSmoothingEnabled: false,
        fillStyle: '', font: '', globalAlpha: 1, textAlign: '', textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
}

function makeDemo() {
    const screen = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 400;
    canvas.getContext = (() => makeCtx()) as never;
    const onComplete = vi.fn();
    const soundManager = { stopMusic: vi.fn(), playMusic: vi.fn() };
    const demo = new EndingDemo({ screen, canvas, onComplete, soundManager });
    return { demo, screen, canvas, onComplete, soundManager };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('EndingDemo lifecycle', () => {
    it('starts inactive; finish() before start() is a no-op', () => {
        const { demo, onComplete } = makeDemo();
        expect(demo.active).toBe(false);
        demo.finish();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('skipPage() finishes the whole demo (single-skip contract)', () => {
        const { demo, onComplete, screen } = makeDemo();
        (demo as unknown as { active: boolean }).active = true;
        screen.classList.remove('hidden');

        demo.skipPage();

        expect(demo.active).toBe(false);
        expect(screen.classList.contains('hidden')).toBe(true);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('finish() hides the intro screen and fires the completion callback', () => {
        const { demo, onComplete, screen } = makeDemo();
        (demo as unknown as { active: boolean }).active = true;
        screen.classList.remove('hidden');

        demo.finish();

        expect(demo.active).toBe(false);
        expect(screen.classList.contains('hidden')).toBe(true);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('silences music on start (the outro track starts at the castle scene)', async () => {
        vi.useFakeTimers();
        try {
            const { demo, soundManager } = makeDemo();
            // stub asset loading so start() doesn't fetch
            (demo as unknown as { _loadAssets: () => Promise<void> })._loadAssets =
                async () => { /* stubbed */ };
            (demo as unknown as { _enterStep: (i: number) => void })._enterStep = () => {};
            const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);

            await demo.start();

            expect(demo.active).toBe(true);
            expect(soundManager.stopMusic).toHaveBeenCalledWith(0);
            expect(rafSpy).toHaveBeenCalled();
            rafSpy.mockRestore();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('pure helpers', () => {
    function helpers(demo?: EndingDemo) {
        const { demo: made } = makeDemo();
        return (demo ?? made) as unknown as Record<string, (...args: never[]) => unknown>;
    }

    it('_wrapText splits at word boundaries tracking char offsets', () => {
        const h = helpers();
        const lines = h._wrapText!('aaaa bbbb ccccc dddd' as never, 100 as never) as Array<{ text: string; start: number }>;
        expect(lines.map(l => l.text)).toEqual(['aaaa bbbb', 'ccccc dddd']);
        expect(lines.map(l => l.start)).toEqual([0, 10]);
    });

    it('_buildQuotedMap marks only quoted spans', () => {
        const h = helpers();
        const map = h._buildQuotedMap!('ab "cd" ef' as never) as boolean[];
        expect(map.slice(3, 7)).toEqual([true, true, true, true]);
        expect(map[0]).toBe(false);
        expect(map[9]).toBe(false);
    });

    it('_easeOutCubic decelerates toward 1', () => {
        const h = helpers();
        const ease = h._easeOutCubic as (t: number) => number;
        expect(ease(0)).toBe(0);
        expect(ease(1)).toBe(1);
        expect(ease(0.5)).toBeGreaterThan(0.5);   // fast start
        expect(ease(0.5)).toBeLessThan(1);
        expect(ease(0.9)).toBeGreaterThan(ease(0.5));
    });
});

describe('ending demo localization', () => {
    const script = new Uint8Array([
        0xF3, 0x41, 0x42, 0x43, 0x20, 0x44, 0x45, 0xF5, 0x46, 0x47, 0xFD,
    ]);

    it('overlays localized text while preserving command structure', () => {
        const english = parseDialogueScript(script);
        const russian = parseDialogueScript(script, ['ПРИВЕТ МИР']);

        const englishText = english.filter((c) => c.type === 'text');
        const russianText = russian.filter((c) => c.type === 'text');
        expect(englishText).toHaveLength(1);
        expect(russianText).toHaveLength(1);
        expect(englishText[0]!.text).toBe('ABC DEFG'); // 0xF5 holds don't split text
        expect(russianText[0]!.text).toBe('ПРИВЕТ МИР');

        // control commands are preserved one-for-one
        expect(russian.map((c) => c.type)).toEqual(english.map((c) => c.type));
    });

    it('keeps hold offsets inside the localized text length', () => {
        const russian = parseDialogueScript(script, ['ПРИВЕТ МИР']);
        const text = russian.find((c) => c.type === 'text')!;
        for (const hold of text.holds) {
            expect(hold.at).toBeGreaterThanOrEqual(0);
            expect(hold.at).toBeLessThanOrEqual('ПРИВЕТ МИР'.length);
        }
    });

    it('_initDialogueState uses the active locale dialogue', () => {
        setLocale('ru');
        const { demo } = makeDemo();
        const state: Record<string, unknown> = {};
        (demo as unknown as { _initDialogueState: (s: unknown, script: unknown, lines?: string[]) => void })
            ._initDialogueState(state, script, ['ЛОКАЛЬ']);
        const commands = state.commands as Array<Record<string, unknown>>;
        const text = commands.find((c) => c.type === 'text')!;
        expect(text.text).toBe('ЛОКАЛЬ');
    });
});
