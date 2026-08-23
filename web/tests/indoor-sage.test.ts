// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    SageScene,
    SAGE_LEVEL_REWARDS,
    SAGE_MAX_LEVEL_BY_TOWN,
    SAGE_XP_TABLE,
} from '../src/scenes/indoor-sage.js';
import type { SageSceneDependencies } from '../src/scenes/indoor-sage.js';

const CTX = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {},
    drawImage() {}, fillText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    arc() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    canvas: { width: 672, height: 432 },
    globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
} as unknown as CanvasRenderingContext2D;

const CANVAS = { width: 672, height: 432 } as HTMLCanvasElement;

interface MemState { bytes: Map<number, number> }

function makeDeps(state: MemState) {
    const deps: SageSceneDependencies = {
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
        saveGame: vi.fn(() => true),
    };
    return { deps };
}

function stubImages(): void {
    class FakeImage {
        onload: (() => void) | null = null;
        src = '';
        constructor() { setTimeout(() => this.onload?.(), 0); }
    }
    vi.stubGlobal('Image', FakeImage);
}

async function enterScene(state: MemState) {
    stubImages();
    const { deps } = makeDeps(state);
    const scene = new SageScene(deps);
    const s = scene as unknown as Record<string, unknown> & {
        sagePhase: string; townIdx: number; exitAfterDialog: boolean;
    };
    scene.enter(1000);
    await new Promise(r => setTimeout(r, 0));
    return { scene, s };
}

/** Level byte 0x8D, XP word 0x8E..8F, town id 0xC4, spoken bits 0xE5. */
function setProgress(state: MemState, opts: { townId?: number | undefined; level?: number | undefined; xp?: number; spoken?: number } = {}) {
    if (opts.townId !== undefined) state.bytes.set(0xC4, opts.townId);
    state.bytes.set(0x8D, opts.level ?? 0);
    const xp = opts.xp ?? 0;
    state.bytes.set(0x8E, xp & 0xFF);
    state.bytes.set(0x8F, (xp >> 8) & 0xFF);
    if (opts.spoken !== undefined) state.bytes.set(0xE5, opts.spoken);
}

beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(performance, 'now').mockReturnValue(50000);
});

describe('SageScene entry routing', () => {
    it('first visit plays the town intro and marks the spoken bit', async () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 3 }); // Hajjar, bit 0x20
        const { s } = await enterScene(state);
        expect(s.sagePhase).toBe('intro');
        expect(s.townIdx).toBe(2);
        expect(state.bytes.get(0xE5)).toBe(0x20);
    });

    it('return visit skips straight to the menu', async () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 3, spoken: 0x20 });
        const { s } = await enterScene(state);
        expect(s.sagePhase).toBe('menu');
    });

    it('death entry clears the invincibility flag and exits after dialog', async () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 3, spoken: 0x20 });
        state.bytes.set(0xE8, 0xFF);
        const { scene, s } = await enterScene(state);
        expect(state.bytes.get(0xE8)).toBe(0);
        expect(s.sagePhase).toBe('dialog');
        expect(s.exitAfterDialog).toBe(true);

        // let typing finish, then two Spaces (skip guard + confirm)
        let t = 50000;
        for (let i = 0; i < 100; i++) scene.draw(t += 100);
        scene.handleInput('Space');
        scene.handleInput('Space');
        expect((scene as unknown as { phase: string }).phase).toBe('fadeOut');
    });

    it('reports the per-town sage name', async () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 2 });
        const { scene } = await enterScene(state);
        expect((scene as unknown as { getName(): string }).getName()).toBe('The Sage Yasmin');
    });
});

describe('intro spell activation', () => {
    it('Space after the intro grants the town spell slot', async () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 3, level: 1, xp: 0 }); // town idx 2 → spell 2 (Saeta)
        const { scene, s } = await enterScene(state);
        // finish typing then acknowledge
        let t = 50000;
        for (let i = 0; i < 200; i++) scene.draw(t += 100);
        scene.handleInput('Space'); // skip any residual typing
        scene.handleInput('Space'); // confirm

        expect(s.sagePhase).toBe('menu');
        expect(state.bytes.get(0x9D)).toBe(2);           // current spell
        expect(state.bytes.get(0xBB + 2 - 1)).toBe(0xFF); // espada active flag
    });

    it('town 1 intro grants nothing (legacy guard)', async () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 1 });
        const { scene } = await enterScene(state);
        let t = 50000;
        for (let i = 0; i < 200; i++) scene.draw(t += 100);
        scene.handleInput('Space');
        scene.handleInput('Space');
        expect(state.bytes.get(0x9D) ?? 0).toBe(0);
    });
});

describe('level-up logic (_checkLevelUp / _applyLevelUp)', () => {
    function checkLevelUp(scene: SageScene): number {
        return (scene as unknown as { _checkLevelUp(): number })._checkLevelUp();
    }
    function applyLevelUp(scene: SageScene): void {
        (scene as unknown as { _applyLevelUp(): void })._applyLevelUp();
    }

    it('threshold quartiles map to result buckets 0..4', () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 1, level: 0 });
        const threshold = SAGE_XP_TABLE[0]!; // 50
        const cases: Array<[number, number]> = [
            [Math.floor(threshold / 2) - 1, 0],   // < q2
            [Math.floor(threshold / 2), 1],       // ≥ q2, < q3
            [threshold - Math.floor(threshold / 4), 2], // ≥ q3, < threshold
            [threshold, 3],
        ];
        return enterScene(state).then(({ scene }) => {
            for (const [xp, want] of cases) {
                state.bytes.set(0x8E, xp & 0xFF);
                state.bytes.set(0x8F, (xp >> 8) & 0xFF);
                expect(checkLevelUp(scene)).toBe(want);
            }
        });
    });

    it('caps the impartable level by town (result 4)', () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 1, level: SAGE_MAX_LEVEL_BY_TOWN[0] }); // town 0 caps at 3
        state.bytes.set(0x8E, 0xE8); state.bytes.set(0x8F, 0x03); // xp 1000 ≥ threshold
        return enterScene(state).then(({ scene }) => {
            expect(checkLevelUp(scene)).toBe(4);
        });
    });

    it('applies the reward table on level-up', () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 1, level: 2, xp: 300 }); // threshold for lvl2 is 300
        const reward = SAGE_LEVEL_REWARDS[2]!;
        return enterScene(state).then(({ scene }) => {
            applyLevelUp(scene);
            expect(state.bytes.get(0x8D)).toBe(3);
            // max HP word at 0xB2
            expect((state.bytes.get(0xB2) ?? 0) | ((state.bytes.get(0xB3) ?? 0) << 8)).toBe(reward.hp);
            // inventory spells copied
            for (let i = 0; i < 7; i++) {
                expect(state.bytes.get(0xB4 + i)).toBe(reward.spells[i]);
            }
        });
    });

    it('carries leftover XP into the next level without exceeding its threshold', () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 1, level: 0, xp: SAGE_XP_TABLE[0]! + 999 });
        return enterScene(state).then(({ scene }) => {
            applyLevelUp(scene);
            expect(state.bytes.get(0x8D)).toBe(1);
            const xp = (state.bytes.get(0x8E) ?? 0) | ((state.bytes.get(0x8F) ?? 0) << 8);
            expect(xp).toBe(Math.min(SAGE_XP_TABLE[0]! + 999 - SAGE_XP_TABLE[0]!, SAGE_XP_TABLE[1]! - 1));
        });
    });
});

describe('Record Experience', () => {
    it('falls back to injected saveGame when window.openSaveModal is absent', async () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 3, spoken: 0x20 });
        const { scene, s } = await enterScene(state);
        const saveGame = (scene as unknown as { saveGame: ReturnType<typeof vi.fn> }).saveGame;
        (scene as unknown as { _activateMenuItem(sel: number, now: number): void })
            ._activateMenuItem(3, 50000);

        expect(saveGame).toHaveBeenCalledTimes(1);
        const snapArg = saveGame.mock.calls[0]![0] as Uint8Array;
        expect(snapArg).toHaveLength(256);
        expect(s.sagePhase).toBe('dialog');
        expect(s.exitAfterDialog).toBe(false);
    });
});

describe('power-queue machinery (_startPowerQueue / _tickPowerQueue)', () => {
    interface SageInternals {
        _startPowerQueue(q: string[]): void;
        _tickPowerQueue(now: number): void;
        powerQueue: string[] | null;
        powerQueueIndex: number;
        powerQueueSentenceEnds: Set<number>;
        powerLineAdvanceAt: number | string | null;
        dlgBuffer: string[];
        _pendingLine: string | null;
        typewriter: { isDone(now: number): boolean } | null;
    }

    function internals(scene: SageScene): SageInternals {
        return scene as unknown as SageInternals;
    }

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('flattens sentences into wrapped lines and records sentence ends', async () => {
        setProgress({ bytes: new Map<number, number>() }, { townId: 3, spoken: 0x20 });
        const scene = await enterScene({ bytes: new Map<number, number>() }).then(e => e.scene);
        const t = internals(scene);
        // two short "sentences", each fits on one line
        t._startPowerQueue(['Short one.', 'Also short.']);
        expect(t.powerQueue).toEqual(['Short one.', 'Also short.']);
        expect(t.powerQueueSentenceEnds.has(0)).toBe(true);
        expect(t.powerQueueSentenceEnds.has(1)).toBe(true);
        expect(t.powerQueueIndex).toBe(1); // first line already showing
    });

    it('pauses at sentence ends until the line finishes typing plus the delay', async () => {
        const state = { bytes: new Map<number, number>() };
        setProgress(state, { townId: 3, spoken: 0x20 });
        const scene = (await enterScene(state)).scene;
        const t = internals(scene);
        t._startPowerQueue(['Aaa.', 'Bbb.']);
        (scene as unknown as { sagePhase: string }).sagePhase = 'power_anim';
        // typing not done yet → stays put
        t._tickPowerQueue(1000);
        expect(t.powerQueueIndex).toBe(1);
        // done typing → schedules the inter-sentence delay
        vi.mocked(performance.now).mockReturnValue(1000);
        (t.typewriter as unknown as { isDone: () => boolean }).isDone = () => true;
        t._tickPowerQueue(1000);
        expect(typeof t.powerLineAdvanceAt).toBe('number');
        const resumeAt = t.powerLineAdvanceAt as number;
        expect(resumeAt).toBeGreaterThan(1000);
        // before the delay elapses: still waiting
        t._tickPowerQueue(resumeAt - 1);
        expect(t.powerQueueIndex).toBe(1);
        // after it elapses: advances to line 2
        t._tickPowerQueue(resumeAt + 1);
        expect(t.powerQueueIndex).toBe(2);
    });
});
