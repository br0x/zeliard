// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpeningIntro, buildTimeline } from '../src/scenes/opening-intro.js';

function makeCtx(): CanvasRenderingContext2D {
    return {
        save() {}, restore() {},
        fillRect() {}, clearRect() {}, drawImage() {}, fillText() {},
        beginPath() {}, rect() {}, clip() {},
        measureText: (t: string) => ({ width: t.length * 10 }),
        imageSmoothingEnabled: false,
        fillStyle: '', font: '', globalAlpha: 1, textAlign: '', textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
}

function makeIntro() {
    const screen = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 400;
    canvas.getContext = (() => makeCtx()) as never;
    const onComplete = vi.fn();
    const intro = new OpeningIntro({ screen, canvas, onComplete });
    return { intro, screen, canvas, onComplete };
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('buildTimeline structure', () => {
    it('produces the full 21-step intro', () => {
        const tl = buildTimeline({});
        expect(tl).toHaveLength(21);
        expect(tl[0]!.type).toBe('fadeInImage');   // logo
        expect(tl[1]!.type).toBe('scrollText');    // story
        expect(tl[2]!.type).toBe('gemExplosion');
        expect(tl[3]!.type).toBe('spriteAnim');
        expect(tl[6]!.type).toBe('scrollText');    // credits
        expect(tl[7]!.type).toBe('balcony');
        expect(tl[11]!.type).toBe('dualDialogue'); // king & duke
        expect(tl[20]!.type).toBe('scrollText');   // final scroll
    });

    it('credits step is flagged and has no background image', () => {
        const tl = buildTimeline({});
        expect(tl[6]!.isCredits).toBe(true);
        expect(tl[6]!.backgroundImage).toBeNull();
    });

    it('the final scroll is marked so the intro finishes afterwards', () => {
        const tl = buildTimeline({});
        expect(tl[20]!.finalScroll).toBe(true);
    });

    it('typed scenes carry their sub-scene line arrays', () => {
        const tl = buildTimeline({});
        const balconyScene = tl[9] as { subScenes: Array<{ lines: string[] }> };
        expect(balconyScene.subScenes).toHaveLength(3);
        for (const sub of balconyScene.subScenes) {
            expect(Array.isArray(sub.lines)).toBe(true);
        }
    });
});

describe('OpeningIntro lifecycle', () => {
    it('starts inactive and finish() before start() is a no-op', () => {
        const { intro, onComplete } = makeIntro();
        expect(intro.active).toBe(false);
        intro.finish();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('skipPage routes to credits (step 6) from early steps', async () => {
        const { intro } = makeIntro();
        (intro as unknown as { active: boolean }).active = true;
        const entered: number[] = [];
        (intro as unknown as { _enterStep: (i: number) => void })._enterStep =
            (i: number) => { entered.push(i); };
        (intro as unknown as { stepIndex: number }).stepIndex = 0;

        intro.skipPage();
        expect(entered).toEqual([6]);
    });

    it('skipPage on the credits step advances to the balcony', async () => {
        const { intro } = makeIntro();
        (intro as unknown as { active: boolean }).active = true;
        const entered: number[] = [];
        (intro as unknown as { _enterStep: (i: number) => void })._enterStep =
            (i: number) => { entered.push(i); };
        (intro as unknown as { stepIndex: number }).stepIndex = 6;

        intro.skipPage();
        expect(entered).toEqual([7]);
    });

    it('skipPage after the balcony finishes the whole intro', () => {
        const { intro, onComplete } = makeIntro();
        (intro as unknown as { active: boolean }).active = true;
        (intro as unknown as { stepIndex: number }).stepIndex = 8;
        intro.skipPage();
        expect(intro.active).toBe(false);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });
});

describe('text layout helpers', () => {
    function helpers(intro?: OpeningIntro) {
        const { intro: made } = makeIntro();
        const obj = (intro ?? made) as unknown as Record<string, (...args: never[]) => unknown>;
        return obj;
    }

    it('_wrapText splits at word boundaries tracking char offsets', () => {
        const h = helpers();
        const lines = h._wrapText!('aaaa bbbb ccccc dddd' as never, 100 as never) as Array<{ text: string; start: number }>;
        // 10px/char stub → maxWidth 100 fits 10 chars per line
        expect(lines.map(l => l.text)).toEqual(['aaaa bbbb', 'ccccc dddd']);
        expect(lines.map(l => l.start)).toEqual([0, 10]);
    });

    it('_buildQuotedMap marks only quoted spans', () => {
        const h = helpers();
        const map = h._buildQuotedMap!('ab "cd" ef' as never) as boolean[];
        expect(map.slice(0, 3)).toEqual([false, false, false]);
        expect(map.slice(3, 7)).toEqual([true, true, true, true]); // "cd"
        expect(map.slice(7)).toEqual([false, false, false]);
    });

    it('_getCanvasEdgeRay shoots to the nearest edge along an angle', () => {
        const { intro } = makeIntro();
        const ray = (intro as unknown as { _getCanvasEdgeRay(x: number, y: number, a: number): { dx: number; dy: number } })
            ._getCanvasEdgeRay(320, 200, 0);
        // straight right → exits at x=640 → dx=320, dy=0
        expect(ray.dx).toBeCloseTo(320);
        expect(ray.dy).toBeCloseTo(0);
    });
});
