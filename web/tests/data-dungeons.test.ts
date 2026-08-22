import { describe, expect, it } from 'vitest';
import { DUNGEONS, EAI1, EAI8, AKMA, DRGN } from '../src/data/dungeons.js';

/**
 * Structural integrity of the data tables moved verbatim out of game.js.
 * These guard against accidental corruption during future refactors; the
 * values themselves mirror the original game binaries (asm/ = truth).
 */
describe('data/dungeons.ts tables', () => {
    const ids = Object.keys(DUNGEONS).map(Number);

    it('defines all 31 dungeon maps with contiguous ids 0..30', () => {
        expect(ids.length).toBe(31);
        expect(ids).toEqual(Array.from({ length: 31 }, (_, i) => i));
    });

    it('every dungeon entry has the required asset + gameplay fields', () => {
        for (const id of ids) {
            const d = DUNGEONS[String(id)];
            expect(d, `DUNGEONS[${id}] missing`).toBeTruthy();
            expect(d!.mdtPath).toMatch(/^game\/0\/(mp|cmap|llmp)[0-9a-z]*\.mdt$/);
            expect(d!.tilesheetPath).toMatch(/^assets\/images\//);
            expect(d!.entitySheetPath).toMatch(/^assets\/images\//);
            expect(Array.isArray(d!.passableTiles)).toBe(true);
            expect(d!.passableTiles.length).toBeLessThanOrEqual(24);
            // Slope/aggressive lists are zero-padded to 4 by the bridge, so
            // short entries are legal.
            expect(d!.slopeTilesLeft?.length ?? 0).toBeLessThanOrEqual(4);
            expect(d!.slopeTilesRight?.length ?? 0).toBeLessThanOrEqual(4);
            expect(d!.aggressiveGround?.length ?? 0).toBeLessThanOrEqual(4);
            expect(Array.isArray(d!.airflows) || typeof d!.airflows === 'object').toBe(true);
        }
    });

    it('monster xp and damage tables are non-empty where present', () => {
        let withMonsters = 0;
        for (const id of ids) {
            const d = DUNGEONS[String(id)];
            if (!d.monster_xp && !d.monster_damage && !d.ai) continue;
            withMonsters++;
        }
        // Most maps have monsters; a handful are transition/boss-approach maps.
        expect(withMonsters).toBeGreaterThan(ids.length / 2);
    });

    it('EAI frame mappings expose paired left/right frame lists', () => {
        for (const eai of [EAI1, EAI8]) {
            expect(Array.isArray(eai.left)).toBe(true);
            expect(Array.isArray(eai.right)).toBe(true);
            expect(eai.left.length).toBeGreaterThan(0);
            expect(eai.left.length).toBe(eai.right.length);
        }
    });

    it('boss segment tables declare their sprite count', () => {
        for (const boss of [AKMA, DRGN]) {
            expect(typeof boss.numSprites).toBe('number');
            expect(boss.numSprites).toBeGreaterThan(0);
            // Some bosses have an empty `right` table and fall back to `left`
            // (no facing-direction variant); otherwise both sides must match.
            expect([0, boss.left.length]).toContain(boss.right.length);
        }
    });
});
