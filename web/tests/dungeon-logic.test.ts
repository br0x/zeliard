import { describe, expect, it } from 'vitest';
import {
    getMagicFrameIndex,
    nextAnimatedTile,
    wrapProximityAddress,
} from '../src/render/dungeon-logic.js';
import { ADDR_PROXIMITY_MAP } from '../src/core/memory.js';
import { PROX_SIZE } from '../src/config/engine.js';

// ─── magic projectile frames ─────────────────────────────────────────────────

describe('getMagicFrameIndex', () => {
    it('spell 0: straight animation frames', () => {
        expect(getMagicFrameIndex(0, false, 0)).toBe(0);
        expect(getMagicFrameIndex(0, true, 2)).toBe(2);
    });

    it('spell 1: direction selects the second/third row', () => {
        expect(getMagicFrameIndex(1, true, 0)).toBe(3);
        expect(getMagicFrameIndex(1, true, 2)).toBe(5);
        expect(getMagicFrameIndex(1, false, 1)).toBe(7);
    });

    it('spell 2: frame 0 is a fixed pose per direction, then advances', () => {
        expect(getMagicFrameIndex(2, true, 0)).toBe(9);
        expect(getMagicFrameIndex(2, false, 0)).toBe(10);
        expect(getMagicFrameIndex(2, true, 1)).toBe(11);
        expect(getMagicFrameIndex(2, false, 2)).toBe(12);
    });

    it('spell 3: direction rows like spell 1', () => {
        expect(getMagicFrameIndex(3, true, 1)).toBe(16);
        expect(getMagicFrameIndex(3, false, 0)).toBe(18);
    });

    it('spell 4: single static frame; unknown spells fall back to 0', () => {
        expect(getMagicFrameIndex(4, true, 5)).toBe(21);
        expect(getMagicFrameIndex(6, false, 3)).toBe(0);
    });

    it('spell 5: direction rows after spell 4', () => {
        expect(getMagicFrameIndex(5, true, 0)).toBe(22);
        expect(getMagicFrameIndex(5, false, 2)).toBe(27);
    });
});

// ─── proximity map wrapping ───────────────────────────────────────────────────

describe('wrapProximityAddress', () => {
    it('leaves in-range addresses unchanged', () => {
        expect(wrapProximityAddress(ADDR_PROXIMITY_MAP)).toBe(ADDR_PROXIMITY_MAP);
        expect(wrapProximityAddress(ADDR_PROXIMITY_MAP + PROX_SIZE - 1))
            .toBe(ADDR_PROXIMITY_MAP + PROX_SIZE - 1);
    });

    it('wraps forward past the end of the circular window', () => {
        const wrapped = wrapProximityAddress(ADDR_PROXIMITY_MAP + PROX_SIZE + 5);
        expect(wrapped).toBe(ADDR_PROXIMITY_MAP + 5);
    });

    it('wraps negative offsets (row scan starts at col -1) into the window end', () => {
        const wrapped = wrapProximityAddress(ADDR_PROXIMITY_MAP - 3);
        expect(wrapped).toBe(ADDR_PROXIMITY_MAP + PROX_SIZE - 3);
    });
});

// ─── animated tile rules ──────────────────────────────────────────────────────

describe('nextAnimatedTile — cavern 5 (water)', () => {
    const ctx = { cavernLevel: 5 };

    it('toggles water tiles only on odd ticks', () => {
        expect(nextAnimatedTile(0x1b, { ...ctx, oddTick: true })).toBe(0x1c);
        expect(nextAnimatedTile(0x1c, { ...ctx, oddTick: true })).toBe(0x1b);
        expect(nextAnimatedTile(0x1b, { ...ctx, oddTick: false })).toBeNull();
    });

    it('ignores non-water tiles and entity markers', () => {
        expect(nextAnimatedTile(0x15, { ...ctx, oddTick: true })).toBeNull();
        expect(nextAnimatedTile(0x80 | 0x1b, { ...ctx, oddTick: true })).toBeNull();
    });
});

describe('nextAnimatedTile — cavern 6 (gold)', () => {
    const always = { rng: () => 1.0 };      // floor(65536)&3 === 0 → never pauses
    const never = { rng: () => 0.999999 };  // &3 !== 0 → always pauses
    const ctx = { cavernLevel: 6, oddTick: true, ...always };

    it('cycles shiny gold 0x1D..0x20 and blinks melted 0x21↔0x22', () => {
        expect(nextAnimatedTile(0x1d, ctx)).toBe(0x1e);
        expect(nextAnimatedTile(0x1e, ctx)).toBe(0x1f);
        expect(nextAnimatedTile(0x20, ctx)).toBe(0x1d);   // (3+1)&3 wraps to phase 0
        expect(nextAnimatedTile(0x21, ctx)).toBe(0x22);
        expect(nextAnimatedTile(0x22, ctx)).toBe(0x21);
    });

    it('tile 0x1D pauses 75% of the time (rng-gated)', () => {
        expect(nextAnimatedTile(0x1d, { ...ctx, ...never })).toBeNull();
        expect(nextAnimatedTile(0x1f, { ...ctx, ...never })).not.toBeNull();   // other phases unaffected
    });

    it('ignores non-animated tiles', () => {
        expect(nextAnimatedTile(0x10, ctx)).toBeNull();
        expect(nextAnimatedTile(0x24, ctx)).toBeNull();
    });
});

describe('nextAnimatedTile — cavern 7 (hot)', () => {
    const ctx = { cavernLevel: 7, oddTick: true };

    it('toggles the jet pair on odd ticks only', () => {
        expect(nextAnimatedTile(0x2c, ctx)).toBe(0x2d);
        expect(nextAnimatedTile(0x2d, ctx)).toBe(0x2c);
        expect(nextAnimatedTile(0x2c, { ...ctx, oddTick: false })).toBeNull();
    });

    it('starters jump to their chain entry points', () => {
        expect(nextAnimatedTile(0x0e, ctx)).toBe(0x33);
        expect(nextAnimatedTile(0x0d, ctx)).toBe(0x36);
        expect(nextAnimatedTile(0x0f, ctx)).toBe(0x39);
        expect(nextAnimatedTile(0x0c, ctx)).toBe(0x3c);
        expect(nextAnimatedTile(0x10, ctx)).toBe(0x3d);
    });

    it('chain tiles advance +1 until an end cell returns them home', () => {
        expect(nextAnimatedTile(0x33, ctx)).toBe(0x34);
        expect(nextAnimatedTile(0x34, ctx)).toBe(0x35);
        expect(nextAnimatedTile(0x35, ctx)).toBe(0x0e);   // end cell
        expect(nextAnimatedTile(0x38, ctx)).toBe(0x0d);
        expect(nextAnimatedTile(0x3b, ctx)).toBe(0x0f);
        expect(nextAnimatedTile(0x3c, ctx)).toBe(0x0c);
        expect(nextAnimatedTile(0x3d, ctx)).toBe(0x10);
        expect(nextAnimatedTile(0x3e, ctx)).toBeNull();   // past the chain
    });
});

describe('nextAnimatedTile — cavern 8 (thorns)', () => {
    const ctx = { cavernLevel: 8 };

    it('cycles thorn tiles on odd ticks only', () => {
        expect(nextAnimatedTile(0x25, { ...ctx, oddTick: true })).toBe(0x26);
        expect(nextAnimatedTile(0x28, { ...ctx, oddTick: true })).toBe(0x25);
        expect(nextAnimatedTile(0x26, { ...ctx, oddTick: false })).toBeNull();
        expect(nextAnimatedTile(0x24, { ...ctx, oddTick: true })).toBeNull();
    });
});
