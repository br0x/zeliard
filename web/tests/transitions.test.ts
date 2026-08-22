import { describe, expect, it } from 'vitest';
import {
    computeTownScrollFromAbsoluteX,
    encodeBossState,
    getTownMapWidth,
    resolveMusicTrack,
} from '../src/core/transitions.js';

describe('getTownMapWidth', () => {
    it('reads the little-endian word at MDT offset 2', () => {
        const mdt = new Uint8Array([0x10, 0x00, 0x84, 0x03]); // width = 0x0384
        expect(getTownMapWidth(mdt)).toBe(0x384);
    });

    it('returns 0 for missing or truncated data', () => {
        expect(getTownMapWidth(null)).toBe(0);
        expect(getTownMapWidth(undefined)).toBe(0);
        expect(getTownMapWidth(new Uint8Array(3))).toBe(0);
    });
});

describe('computeTownScrollFromAbsoluteX (fight.asm edge locking)', () => {
    const MAP_W = 132;

    it('free-scrolling: hero pinned at viewport column 13', () => {
        // ax = 100 - 17 = 83 ≤ 255 → middle
        expect(computeTownScrollFromAbsoluteX(100, MAP_W)).toEqual({
            proxLeft: 83,
            heroViewX: 13,
        });
        // last non-right-edge column
        expect(computeTownScrollFromAbsoluteX(MAP_W - 13, MAP_W)).toEqual({
            proxLeft: MAP_W - 13 - 17,
            heroViewX: 13,
        });
    });

    it('right-edge lock: viewport freezes at the map\'s rightmost column', () => {
        // carry = 1 (mapWidth >= PROX_COLS=36), left_col = 132-36 = 96
        const r = computeTownScrollFromAbsoluteX(130, MAP_W);
        expect(r.proxLeft).toBe(96);
        expect(r.heroViewX).toBe(130 - 96 - 1 - 3);

        const r2 = computeTownScrollFromAbsoluteX(119 + 1, MAP_W);
        expect(r2.proxLeft).toBe(96);
        expect(r2.heroViewX).toBe((120 - 96 - 1) - 3);
    });

    it('left-edge lock: viewport at column 0, hero 4 tiles from the left', () => {
        // hero_x < 17 wraps to a large uint16 in the original
        expect(computeTownScrollFromAbsoluteX(10, MAP_W)).toEqual({
            proxLeft: 0,
            heroViewX: 6,
        });
        expect(computeTownScrollFromAbsoluteX(0, MAP_W)).toEqual({
            proxLeft: 0,
            heroViewX: -4,   // legacy parity: not clamped here
        });
    });

    it('wrap boundary: hero_x == 17 takes the lock branch with ax == 0', () => {
        expect(computeTownScrollFromAbsoluteX(17, MAP_W)).toEqual({
            proxLeft: 0,
            heroViewX: 13,   // 17 - 4
        });
    });

    it('small maps (< PROX_COLS) keep the legacy no-carry arithmetic', () => {
        // carry = 0, left_col = 30 - 36 = -6
        const r = computeTownScrollFromAbsoluteX(25, 30);
        expect(r.proxLeft).toBe(-6);
        expect(r.heroViewX).toBe(25 + 6 - 3);
    });
});

describe('resolveMusicTrack', () => {
    it('maps town themes', () => {
        expect(resolveMusicTrack(0)).toBe('mgt1');
        expect(resolveMusicTrack(1)).toBe('ugm1');
        expect(resolveMusicTrack(2)).toBe('mgt2');
        expect(resolveMusicTrack(3)).toBe('ugm2');
    });

    it('maps every cavern theme', () => {
        expect(resolveMusicTrack(4)).toContain('Malicia');
        expect(resolveMusicTrack(7)).toContain('Escarcha');
        expect(resolveMusicTrack(11)).toContain('Absor');
    });

    it('falls back to the first town theme for unknown values', () => {
        expect(resolveMusicTrack(99)).toBe('mgt1');
        expect(resolveMusicTrack(-1)).toBe('mgt1');
        expect(resolveMusicTrack(null)).toBe('mgt1');
        expect(resolveMusicTrack(undefined)).toBe('mgt1');
    });

    it('accepts numeric strings like the engine reports them', () => {
        expect(resolveMusicTrack('2')).toBe('mgt2');
    });
});

describe('encodeBossState', () => {
    it('encodes the Cangrejo descriptor into the g_mem block layout', () => {
        const { block, namePascal } = encodeBossState({
            bossX: 0x2b,
            bossY: 0x0c,
            bossHP: 150,
            xpReward: 120,
            arenaCenterX: 12,
            bossPlacement: 0,
            almasReward: 150,
            bossName: 'Cangrejo',
        });

        expect([...block]).toEqual([
            0x2b, 0x00,       // +0 bossX word
            0x0c,             // +2 bossY
            150 & 0xff, 0,    // +3 HP word
            120 & 0xff, 0,    // +5 XP word
            12,               // +7 arenaCenterX
            0,                // +8 placement
            150 & 0xff, 0,    // +9 almas word
        ]);
        expect(block.length).toBe(11);

        // Pascal-prefixed name at +11
        expect(namePascal[0]).toBe(8);
        expect(new TextDecoder().decode(namePascal.subarray(1))).toBe('Cangrejo');
    });

    it('truncates words to 16 bits like the original byte stores', () => {
        const { block } = encodeBossState({
            bossX: 0x1234,
            bossY: 0,
            bossHP: 0xabcd,
            xpReward: 0,
            arenaCenterX: 0,
            bossPlacement: 0,
            almasReward: 0,
            bossName: '',
        });
        expect(block[0]).toBe(0x34);
        expect(block[1]).toBe(0x12);
        expect(block[3]).toBe(0xcd);
        expect(block[4]).toBe(0xab);
    });
});
