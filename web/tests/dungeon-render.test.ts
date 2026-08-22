import { describe, expect, it } from 'vitest';
import {
    resolveBodyFrame,
    resolveBackArmFrame,
    resolveFrontArmFrame,
    type HeroVisualState,
} from '../src/render/dungeon.js';

const base: HeroVisualState = {
    facingLeft: false,
    animPhase: 0,
    invincible: false,
    squat: false,
    onRope: false,
    hidden: false,
    jump: 0,
    shieldAnimActive: false,
    shieldPhase: 0,
    shieldVariant: 0,
    slope: 0,
    shieldCategory: 0,
};

describe('resolveBodyFrame', () => {
    it('hidden wins over everything', () => {
        expect(resolveBodyFrame({ ...base, hidden: true, onRope: true })).toBe(30);
    });

    it('rope climbing cycles frames 26..29', () => {
        expect(resolveBodyFrame({ ...base, onRope: true, animPhase: 2 })).toBe(28);
        expect(resolveBodyFrame({ ...base, onRope: true, facingLeft: true })).toBe(26);
    });

    it('facing selects the base row (right 0, left 13)', () => {
        expect(resolveBodyFrame({ ...base })).toBe(0);
        expect(resolveBodyFrame({ ...base, facingLeft: true })).toBe(13);
    });

    it('state priority: invincible > squat > jump-bit > slope > full-jump > stand pose', () => {
        expect(resolveBodyFrame({ ...base, invincible: true, animPhase: 3 })).toBe(13);
        expect(resolveBodyFrame({ ...base, squat: true })).toBe(5);
        expect(resolveBodyFrame({ ...base, jump: 0x80 })).toBe(7);
        expect(resolveBodyFrame({ ...base, slope: 2 })).toBe(9);
        expect(resolveBodyFrame({ ...base, jump: 0x7f })).toBe(6);
        expect(resolveBodyFrame({ ...base, animPhase: 0x80 })).toBe(4);
    });

    it('walk cycle uses the low two bits of the animation phase', () => {
        expect(resolveBodyFrame({ ...base, animPhase: 3 })).toBe(3);
        expect(resolveBodyFrame({ ...base, facingLeft: true, animPhase: 2 })).toBe(15);
    });
});

describe('resolveBackArmFrame', () => {
    it('invisible while invincible / on rope / hidden', () => {
        for (const flag of ['invincible', 'onRope', 'hidden'] as const) {
            expect(resolveBackArmFrame({ ...base, [flag]: true })).toBeNull();
        }
    });

    it('shield swing rows depend on category and direction', () => {
        expect(resolveBackArmFrame({ ...base, shieldAnimActive: true, shieldPhase: 4, shieldCategory: 1 }))
            .toBe(79 + 2 + 4);          // right-facing: 79 + phase/2 + cat*4
        expect(resolveBackArmFrame({ ...base, facingLeft: true, shieldAnimActive: true, shieldCategory: 0 }))
            .toBe(49 + 4);              // left base + (phase/2=0) + 4
        expect(resolveBackArmFrame({ ...base, facingLeft: true, shieldAnimActive: true, shieldVariant: 2 }))
            .toBe(49 + 11);
        expect(resolveBackArmFrame({ ...base, facingLeft: true, shieldAnimActive: true, shieldVariant: 1 }))
            .toBe(49 + 4 + 4);
    });

    it('standing shield hold applies only to right-facing heroes', () => {
        expect(resolveBackArmFrame({ ...base, shieldCategory: 2 }))
            .toBe(31 + 12 + 3);
        expect(resolveBackArmFrame({ ...base, facingLeft: true, shieldCategory: 2 }))
            .not.toBeNull();
    });

    it('walk alternation follows ((animPhase+2)&3)&1', () => {
        expect(resolveBackArmFrame({ ...base, animPhase: 0x80 })).toBeNull();   // stand pose
        expect(resolveBackArmFrame({ ...base, animPhase: 0 })).toBe(33);        // phase 2 → even
        expect(resolveBackArmFrame({ ...base, animPhase: 1 })).toBeNull();      // phase 3 → odd
    });

    it('arm walk parity matches ((animPhase+2)&3)&1 gate', () => {
        // animPhase 1 → phase 3 → odd → null; animPhase 2 → phase 0 → arm 31
        expect(resolveBackArmFrame({ ...base, animPhase: 1 })).toBeNull();
        expect(resolveBackArmFrame({ ...base, animPhase: 2 })).toBe(31);
    });
});

describe('resolveFrontArmFrame', () => {
    it('hidden by invincibility', () => {
        expect(resolveFrontArmFrame({ ...base, invincible: true })).toBeNull();
    });

    it('rope/hidden show a held shield only when one is equipped', () => {
        expect(resolveFrontArmFrame({ ...base, onRope: true })).toBeNull();
        expect(resolveFrontArmFrame({ ...base, onRope: true, shieldCategory: 1 })).toBe(31 + 14);
        expect(resolveFrontArmFrame({ ...base, onRope: true, shieldCategory: 2 })).toBe(31 + 17);
        expect(resolveFrontArmFrame({ ...base, hidden: true, facingLeft: true, shieldCategory: 1 })).toBe(49 + 14);
    });

    it('shield swing mirrors the back arm with a different row base', () => {
        expect(resolveFrontArmFrame({ ...base, facingLeft: true, shieldAnimActive: true, shieldPhase: 6, shieldCategory: 1 }))
            .toBe(67 + 3 + 4);
        expect(resolveFrontArmFrame({ ...base, shieldAnimActive: true, shieldVariant: 1, shieldPhase: 2 }))
            .toBe(31 + 9);   // phase 1 + 4 base offset + 4 variant-1 offset
    });

    it('left-facing standing shield hold; squat/stand-pose pin arm at +3', () => {
        expect(resolveFrontArmFrame({ ...base, facingLeft: true, shieldCategory: 2 }))
            .toBe(49 + 12 + 3);
        expect(resolveFrontArmFrame({ ...base, facingLeft: false, shieldCategory: 2 }))
            .not.toBe(31 + 12 + 3);
        expect(resolveFrontArmFrame({ ...base, squat: true })).toBe(34);
        expect(resolveFrontArmFrame({ ...base, animPhase: 0x80 })).toBe(34);
        expect(resolveFrontArmFrame({ ...base, animPhase: 3 })).toBe(31 + 3);
    });
});
