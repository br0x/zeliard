import { beforeEach, describe, expect, it } from 'vitest';
import {
    RokaDemo,
    ROKADEMO_CENTER_DX,
    ROKADEMO_HERO_Y,
    ROKADEMO_RUN_STEPS,
    ROKADEMO_TEAR_CENTER,
    SWORD_VISIBLE_STATES,
    rokademoSwordFrame,
    rokademoSlotCenter,
    rokademoLandCenter,
    initBresenham,
    stepBresenham,
} from '../src/core/roka-demo.js';
import { TEAR_SLOTS_BLUE, TEAR_SLOT_RED } from '../src/data/assets.js';

// ─── pure helpers ─────────────────────────────────────────────────────────────

describe('rokademoSwordFrame', () => {
    it('maps sword tiers to sheet frames', () => {
        expect(rokademoSwordFrame(1)).toBe(10);
        expect(rokademoSwordFrame(3)).toBe(10);
        expect(rokademoSwordFrame(4)).toBe(11);
        expect(rokademoSwordFrame(5)).toBe(11);
        expect(rokademoSwordFrame(6)).toBe(12);
    });
});

describe('rokademoSlotCenter', () => {
    it('computes blue tear centers (mole strip above canvas → negative y)', () => {
        // w=19, h=25
        expect(rokademoSlotCenter({ x: 49, y: 6 }, false)).toEqual({
            x: Math.round(49 + 9.5),
            y: Math.round(-42 + 6 + 12.5),
        });
    });

    it('computes the red tear center with its larger sprite', () => {
        // w=31, h=34
        const c = rokademoSlotCenter(TEAR_SLOT_RED, true);
        expect(c.x).toBe(Math.round(320 + 15.5));
        expect(c.y).toBe(Math.round(-42 + 1 + 17));
    });
});

describe('rokademoLandCenter', () => {
    it('clamps the sparkle back inside the canvas', () => {
        // slot center above the top edge must clamp to half-height
        const c = rokademoLandCenter({ x: 100, y: -24 }, 48, 48, 672, 312);
        expect(c.x).toBe(100);
        expect(c.y).toBe(24);

        const c2 = rokademoLandCenter({ x: 4, y: 300 }, 192, 48, 672, 312);
        expect(c2.x).toBe(96);       // w/2
        expect(c2.y).toBe(288);      // viewH - h/2
    });
});

describe('bresenham stepper', () => {
    it('initializes deltas and error term', () => {
        const b = initBresenham(10, 20, 3, 2);
        expect(b.dx).toBe(7);
        expect(b.dy).toBe(18);
        expect(b.sx).toBe(-1);
        expect(b.sy).toBe(-1);
        expect(b.err).toBe(7 - 18);
        expect(b.x).toBe(10);
        expect(b.y).toBe(20);
    });

    it('reaches y <= 0 exactly at the target row', () => {
        const b = initBresenham(
            ROKADEMO_TEAR_CENTER.x, ROKADEMO_TEAR_CENTER.y,
            rokademoSlotCenter(TEAR_SLOTS_BLUE[0]!, false).x,
            rokademoSlotCenter(TEAR_SLOTS_BLUE[0]!, false).y,
        );
        let steps = 0;
        let landed = false;
        while (steps < 10000 && !(landed = stepBresenham(b))) steps++;
        expect(landed).toBe(true);
        expect(b.y).toBeLessThanOrEqual(0);
        expect(b.x).toBeGreaterThanOrEqual(Math.min(b.x0, b.x1));
        expect(b.x).toBeLessThanOrEqual(Math.max(b.x0, b.x1));
    });
});

// ─── state machine ────────────────────────────────────────────────────────────

type Deps = {
    sfx: number[];
    overlays: number[];
    hasAudio: boolean;
    resolveTearMusic: boolean;
};

function makeDemo(d: Deps) {
    let onEnded: (() => void) | null = null;
    const demo = new RokaDemo({
        playSfx: (id) => d.sfx.push(id),
        setTearOverlayCount: (n) => d.overlays.push(n),
        hasAudio: () => d.hasAudio,
        playTearMusic: (cb) => { onEnded = cb; },
    }, { viewW: 672, viewH: 312 });
    const statesSeen: string[] = [];

    /** Advance in 30ms ticks until done (or budget exhausted). */
    function run(from: number): number {
        let t = from;
        while (!demo.done && t < from + 90_000) {
            demo.update(t);
            if (statesSeen.at(-1) !== demo.state) statesSeen.push(demo.state);
            if (demo.state === 'tearMusic' && onEnded) {
                if (d.resolveTearMusic) onEnded();
                else break;   // leave the machine parked for timeout tests
            }
            t += 30;
        }
        return t;
    }
    return { demo, run, statesSeen };
}

const FULL_SEQUENCE = [
    'run', 'stand', 'draw', 'salute',
    'sparkleStart', 'sparkleBurst', 'sparkleFlash', 'sparkleFly',
    'sparkleLand', 'sparkleLandFlash', 'tearMusic', 'sheath', 'runoff',
];

describe('RokaDemo full walk (blue tear)', () => {
    let d: Deps;
    beforeEach(() => {
        d = { sfx: [], overlays: [], hasAudio: true, resolveTearMusic: true };
    });

    it('walks every state in order and ends done', () => {
        const { demo, run, statesSeen } = makeDemo(d);
        demo.start(3, 2, 1000);
        run(1000);

        expect(demo.done).toBe(true);
        expect(statesSeen).toEqual(FULL_SEQUENCE);
    });

    it('shows only previously collected tears until the sparkle lands', () => {
        const { demo, run } = makeDemo(d);
        demo.start(3, 2, 1000);
        expect(d.overlays).toEqual([2]);   // tearCount - 1
        run(1000);
        expect(d.overlays).toEqual([2, 3]); // then the new tear appears
    });

    it('plays stomp/burst/land/ping SFX in the right phases', () => {
        const { demo, run } = makeDemo(d);
        demo.start(3, 2, 1000);
        run(1000);
        // 26: footsteps during run and runoff (odd steps)
        // 27: twice — burst start and landing
        // 28: flight pings (~every 500ms of a 6200ms flight)
        expect(d.sfx.filter((s) => s === 27).length).toBe(2);
        expect(d.sfx.filter((s) => s === 28).length).toBeGreaterThanOrEqual(10);
        expect(d.sfx.filter((s) => s === 26).length).toBeGreaterThan(4);
        expect(d.sfx.every((s) => [26, 27, 28].includes(s))).toBe(true);
    });

    it('hides the tear after the burst and salutes through the Tear theme', () => {
        const { demo, run } = makeDemo(d);
        demo.start(3, 2, 1000);
        run(1000);
        expect(demo.tearVisible).toBe(false);
        expect(SWORD_VISIBLE_STATES.has('tearMusic')).toBe(true);
    });

    it('moves the hero to center during salute, then off-screen right during runoff', () => {
        const { demo, run } = makeDemo(d);
        demo.start(3, 2, 1000);
        // advance into stand/salute
        let t = 1000;
        while (demo.state !== 'salute' && t < 5000) { demo.update(t); t += 30; }
        // During non-run states the drawer substitutes ROKADEMO_CENTER_DX
        // (heroDx() is only consulted for run/runoff, like the legacy code).
        expect(['run', 'runoff'].includes(demo.state)).toBe(false);
        run(t);
        expect(demo.state).toBe('runoff');
        expect(demo.heroDx()).toBeGreaterThan(ROKADEMO_CENTER_DX);
        expect(demo.heroDx()).toBeLessThanOrEqual(672 - 72);
    });

    it('keeps hero y constant at the legacy value', () => {
        expect(ROKADEMO_HERO_Y).toBe(288);
        expect(ROKADEMO_RUN_STEPS).toBe(13);
        expect(ROKADEMO_CENTER_DX).toBe(300);
    });
});

describe('RokaDemo start clamping', () => {
    it('clamps tear count to 1..9 and picks slots/colors accordingly', () => {
        const d: Deps = { sfx: [], overlays: [], hasAudio: true, resolveTearMusic: true };
        const a = new RokaDemo(noopDeps(d), { viewW: 672, viewH: 312 });
        a.start(0, 0, 0);
        expect(a.tearCount).toBe(1);
        expect(a.isRed).toBe(false);
        expect(a.slot).toEqual(TEAR_SLOTS_BLUE[0]);
        expect(a.swordType).toBe(1);          // || 1 fallback
        expect(d.overlays).toEqual([0]);

        const b = new RokaDemo(noopDeps(d), { viewW: 672, viewH: 312 });
        b.start(12, 99, 0);
        expect(b.tearCount).toBe(9);
        expect(b.isRed).toBe(true);
        expect(b.slot).toEqual(TEAR_SLOT_RED);
        expect(b.swordType).toBe(6);
    });

    function noopDeps(d: Deps) {
        return {
            playSfx: (id: number) => d.sfx.push(id),
            setTearOverlayCount: (n: number) => d.overlays.push(n),
            hasAudio: () => d.hasAudio,
            playTearMusic: (_cb: () => void) => {},
        };
    }
});

describe('RokaDemo audio edge cases', () => {
    it('does not stall when audio is unavailable', () => {
        const d: Deps = { sfx: [], overlays: [], hasAudio: false, resolveTearMusic: false };
        const { demo, run } = makeDemo(d);
        demo.start(1, 1, 0);
        run(0);
        expect(demo.done).toBe(true);
    });

    it('fail-safe: continues after the 16s tear-music timeout', () => {
        const d: Deps = { sfx: [], overlays: [], hasAudio: true, resolveTearMusic: false };
        const { demo } = makeDemo(d);
        demo.start(1, 1, 0);
        // advance to tearMusic state
        let t = 0;
        while (demo.state !== 'tearMusic' && t < 30_000) { demo.update(t); t += 30; }
        expect(demo.state).toBe('tearMusic');
        // park just under the timeout
        const T = 16_000;
        demo.update(t + T - 200);
        expect(demo.state).toBe('tearMusic');
        demo.update(t + T + 200);
        expect(demo.state).toBe('sheath');
    });
});
