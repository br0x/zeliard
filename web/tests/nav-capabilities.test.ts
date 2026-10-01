/**
 * nav-capabilities.test.ts — the hero's ability snapshot.
 *
 * These are the rules that decide what a route is allowed to do, read from the
 * same `g_mem` addresses the engine uses. Two of them are easy to get wrong and
 * are pinned deliberately: the key counters are adjacent bytes and must not be
 * read as a word, and ice and heat protections are only granted on the cavern
 * level where they mean anything.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
    snapshotCapabilities, hasCap, describeCaps, allCapabilities, bareCapabilities,
    ACCESSORY_FERUZA, ACCESSORY_PIRIKA, ACCESSORY_SILKARN,
    ACCESSORY_RUZERIA, ACCESSORY_ASBESTOS, ACCESSORY_NONE,
    ADDR_KEYS, ADDR_LION_KEYS, ADDR_ACCESSORY, ADDR_CAVERN_LEVEL,
    LEVEL_ICE, LEVEL_HEAT,
} from '../src/engine/nav/capabilities.js';
import { CAP } from '../src/engine/nav/types.js';
import { getGmem, memWrite8 } from '../src/core/ts-memory.js';

function dress(accessory: number, keys = 0, lionKeys = 0, cavernLevel = 1) {
    const g = getGmem();
    memWrite8(g, ADDR_ACCESSORY, accessory);
    memWrite8(g, ADDR_KEYS, keys);
    memWrite8(g, ADDR_LION_KEYS, lionKeys);
    memWrite8(g, ADDR_CAVERN_LEVEL, cavernLevel);
    return snapshotCapabilities(g);
}

describe('reading the hero', () => {
    it('grants only rope climbing to a bare hero', () => {
        const caps = dress(ACCESSORY_NONE);
        expect(caps.mask).toBe(CAP.CLIMB);
        expect(hasCap(caps, CAP.JUMP_HIGH)).toBe(false);
        expect(caps.accessory).toBe(ACCESSORY_NONE);
    });

    it('grants each wearable its own ability', () => {
        expect(hasCap(dress(ACCESSORY_FERUZA), CAP.JUMP_HIGH)).toBe(true);
        expect(hasCap(dress(ACCESSORY_PIRIKA), CAP.GROUND_SAFE)).toBe(true);
        expect(hasCap(dress(ACCESSORY_SILKARN), CAP.SLOPE_STAND)).toBe(true);
    });

    it('grants exactly one ability per wearable', () => {
        const bits = [CAP.JUMP_HIGH, CAP.GROUND_SAFE, CAP.SLOPE_STAND, CAP.ICE_SAFE, CAP.HEAT_SAFE];
        for (const accessory of [ACCESSORY_FERUZA, ACCESSORY_PIRIKA, ACCESSORY_SILKARN]) {
            const mask = dress(accessory).mask;
            expect(bits.filter((b) => (mask & b) !== 0)).toHaveLength(1);
        }
    });
});

describe('ice and heat only where they exist', () => {
    it('withholds ice protection outside cavern level 4', () => {
        // There is no ice to resist anywhere else, so claiming the protection
        // would be a lie the map screen would act on.
        for (const level of [1, 2, 3, 5, 6, 8, 9]) {
            expect(hasCap(dress(ACCESSORY_RUZERIA, 0, 0, level), CAP.ICE_SAFE),
                `level ${level}`).toBe(false);
        }
        expect(hasCap(dress(ACCESSORY_RUZERIA, 0, 0, LEVEL_ICE), CAP.ICE_SAFE)).toBe(true);
    });

    it('withholds heat protection outside cavern level 7', () => {
        for (const level of [1, 4, 6, 8]) {
            expect(hasCap(dress(ACCESSORY_ASBESTOS, 0, 0, level), CAP.HEAT_SAFE),
                `level ${level}`).toBe(false);
        }
        expect(hasCap(dress(ACCESSORY_ASBESTOS, 0, 0, LEVEL_HEAT), CAP.HEAT_SAFE)).toBe(true);
    });

    it('still grants high jump and slope climbing on every level', () => {
        for (const level of [1, 4, 7, 10]) {
            expect(hasCap(dress(ACCESSORY_FERUZA, 0, 0, level), CAP.JUMP_HIGH), `level ${level}`).toBe(true);
            expect(hasCap(dress(ACCESSORY_SILKARN, 0, 0, level), CAP.SLOPE_STAND), `level ${level}`).toBe(true);
        }
    });

    it('reads the cavern level from memory, and lets a caller override it', () => {
        dress(ACCESSORY_ASBESTOS, 0, 0, LEVEL_HEAT);
        expect(snapshotCapabilities(getGmem()).mask & CAP.HEAT_SAFE).toBeTruthy();
        // The override exists so a route can be planned for a map the hero is not
        // standing in.
        expect(snapshotCapabilities(getGmem(), 1).mask & CAP.HEAT_SAFE).toBeFalsy();
    });
});

describe('keys', () => {
    it('grants the key bits only when a key is held', () => {
        expect(hasCap(dress(ACCESSORY_NONE, 0, 0), CAP.KEY)).toBe(false);
        expect(hasCap(dress(ACCESSORY_NONE, 0, 0), CAP.LION_KEY)).toBe(false);
        expect(hasCap(dress(ACCESSORY_NONE, 1, 0), CAP.KEY)).toBe(true);
        expect(hasCap(dress(ACCESSORY_NONE, 0, 1), CAP.LION_KEY)).toBe(true);
        expect(hasCap(dress(ACCESSORY_NONE, 3, 2), CAP.KEY) && hasCap(dress(ACCESSORY_NONE, 3, 2), CAP.LION_KEY)).toBe(true);
    });

    it('does not smear the two counters together', () => {
        // 0x98 and 0x99 are adjacent bytes. Reading them as one word would turn a
        // single Lion-Head key into 256 ordinary keys.
        const caps = dress(ACCESSORY_NONE, 0, 1);
        expect(caps.keys).toBe(0);
        expect(caps.lionKeys).toBe(1);

        const two = dress(ACCESSORY_NONE, 1, 0);
        expect(two.keys).toBe(1);
        expect(two.lionKeys).toBe(0);

        const both = dress(ACCESSORY_NONE, 4, 2);
        expect(both.keys).toBe(4);
        expect(both.lionKeys).toBe(2);
    });

    it('reads the counters as single bytes, so 255 is the maximum', () => {
        const caps = dress(ACCESSORY_NONE, 255, 255);
        expect(caps.keys).toBe(255);
        expect(caps.lionKeys).toBe(255);
    });
});

describe('descriptions', () => {
    beforeEach(() => {
        dress(ACCESSORY_NONE);
    });

    it('names the innate ability only for a bare hero', () => {
        expect(describeCaps(snapshotCapabilities(getGmem()))).toEqual(['climb']);
    });

    it('names each granted ability', () => {
        expect(describeCaps(dress(ACCESSORY_FERUZA, 1, 1)).sort())
            .toEqual(['climb', 'high jump', 'key', 'lion key']);
        expect(describeCaps(dress(ACCESSORY_SILKARN, 0, 0, LEVEL_ICE)).sort())
            .toEqual(['climb', 'climb slopes']);
    });
});

describe('synthetic capability sets', () => {
    it('bareCapabilities grants nothing but climbing', () => {
        expect(bareCapabilities().mask).toBe(CAP.CLIMB);
        expect(bareCapabilities().keys).toBe(0);
    });

    it('allCapabilities grants everything and saturates the key counters', () => {
        const caps = allCapabilities();
        for (const bit of [CAP.CLIMB, CAP.JUMP_HIGH, CAP.SLOPE_STAND, CAP.GROUND_SAFE,
            CAP.ICE_SAFE, CAP.HEAT_SAFE, CAP.KEY, CAP.LION_KEY]) {
            expect(hasCap(caps, bit)).toBe(true);
        }
        expect(caps.keys).toBeGreaterThanOrEqual(163);
        expect(caps.lionKeys).toBeGreaterThanOrEqual(163);
    });
});
