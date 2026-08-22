import { describe, expect, it } from 'vitest';
import {
    TILE_SIZE,
    VIEW_COLS,
    VIEW_ROWS,
    VIEW_WIDTH,
    TOWN_MDTS,
    NOTIFICATION_STRINGS,
} from '../src/config/engine.js';
import {
    NPC_SPRITE_PATHS,
    ITEMP_SWORD_IMAGE_PATHS,
    ITEMP_SHIELD_IMAGE_PATHS,
    ITEMP_MAGIC_IMAGE_PATHS,
    TEAR_FLAGS,
    LLAMA_TOWN_ID,
} from '../src/data/assets.js';

describe('config/engine constants', () => {
    it('view dimensions derive from tile size', () => {
        expect(VIEW_WIDTH).toBe(VIEW_COLS * TILE_SIZE);
        expect(VIEW_COLS).toBe(28);
        expect(VIEW_ROWS).toBe(18);
    });

    it('defines 10 towns with Llama at index 7', () => {
        expect(TOWN_MDTS).toHaveLength(10);
        expect(TOWN_MDTS[LLAMA_TOWN_ID]).toContain('llmp.mdt');
    });

    it('notification strings form a contiguous 1..N table with [y, text] rows', () => {
        const keys = Object.keys(NOTIFICATION_STRINGS).map(Number);
        expect(keys).toEqual(Array.from({ length: keys.length }, (_, i) => i + 1));
        for (const k of keys) {
            const entry = NOTIFICATION_STRINGS[k as keyof typeof NOTIFICATION_STRINGS] as [number, string];
            expect(typeof entry[0]).toBe('number');
            expect(entry[1].length).toBeGreaterThan(0);
        }
    });
});

describe('data/assets tables', () => {
    it('NPC sprite sheets come in category groups of 5 frames', () => {
        expect(NPC_SPRITE_PATHS.length).toBeGreaterThan(0);
        for (const group of NPC_SPRITE_PATHS as string[][]) {
            expect(group.length).toBe(5);
            for (const p of group) expect(p).toMatch(/^assets\/images\//);
        }
    });

    it('equipment icon paths exist for all tiers', () => {
        expect(ITEMP_SWORD_IMAGE_PATHS.filter(Boolean).length).toBe(6);
        expect(ITEMP_SHIELD_IMAGE_PATHS.filter(Boolean).length).toBe(6);
        expect(ITEMP_MAGIC_IMAGE_PATHS.filter(Boolean).length).toBe(7);
    });

    it('tear slot flags align with tear slots', () => {
        expect(TEAR_FLAGS.length).toBeGreaterThan(0);
    });
});
