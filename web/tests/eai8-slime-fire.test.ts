/**
 * eai8-slime-fire.test.ts — regression coverage for the EAI8 type 3 (slime)
 * projectile gate.
 *
 * The original `sub_A75D` measures the hero-to-monster row distance in 8
 * bits, so a slime on row 0 of a 64-row cavern is blind to a hero whose head
 * row is 63 — the case in mp80.mdt's top corridor, where the floor is row 2
 * and the 3-tile-tall hero's head row is therefore 63. The port slides the
 * delta over 6 bits for the slime's fire roll only; medusa (type 0) and crab
 * (type 2) keep the 1:1 8-bit rule.
 */
import { describe, expect, it } from 'vitest';
import { monsterAi8 } from '../src/engine/eai8.js';
import { dungeonFullTick } from '../src/engine/dungeon-tick.js';
import { setEntropy } from '../src/engine/dungeon-combat.js';
import {
    getGmem,
    setDungeonPassableTilesToBuffer,
    setDungeonSlopeTilesLeftToBuffer,
    setDungeonSlopeTilesRightToBuffer,
    setDungeonAggressiveGroundToBuffer,
    setDungeonAirflowsToBuffer,
} from '../src/core/ts-memory.js';

const PROX = 0xe000;
const PROX_COLS = 36;
const MONSTER = 0xef00; // scratch record, clear of prox window/proj list
const PROJECTILES_LIST = 0xeb80;
const LAST_PROJECTILE_INDEX = 0x9f1f;
const HERO_Y = 0xff35;
const ANIM_TIMER_HI = 0xff1c;

/** Floor two rows under `monsterY` so the grounded AI branch runs. */
function buildScenario(type: number, monsterY: number, xRel: number): Uint8Array {
    const g = getGmem();
    g.fill(0);

    setDungeonPassableTilesToBuffer([0x00, 0x01, 0x02]);
    setDungeonSlopeTilesLeftToBuffer([]);
    setDungeonSlopeTilesRightToBuffer([]);
    setDungeonAggressiveGroundToBuffer([]);
    setDungeonAirflowsToBuffer([]);

    // 0 = passable everywhere, then a solid band under the monster
    for (let i = PROX; i < PROX + PROX_COLS * 64; i++) g[i] = 0x00;
    const floorRow = (monsterY + 2) & 0x3f;
    for (let dx = -1; dx <= 1; dx++) {
        g[PROX + floorRow * PROX_COLS + ((xRel + dx + PROX_COLS) % PROX_COLS)] = 0x30;
    }

    g[MONSTER] = 0x40; // currX lo — only the walk-burst probe reads this
    g[MONSTER + 1] = 0x00;
    g[MONSTER + 2] = monsterY & 0x3f;
    g[MONSTER + 3] = xRel;
    g[MONSTER + 4] = type & 0x0f;
    g[MONSTER + 5] = 0x00; // ai_flags: facing + no hit flag
    g[MONSTER + 6] = 0x00; // anim_counter
    g[MONSTER + 7] = 0x00; // state_flags
    g[MONSTER + 8] = 0x00; // hp
    g[MONSTER + 9] = 0x00; // ai_state
    g[MONSTER + 10] = 0x00; // ai_timer

    g[PROJECTILES_LIST] = 0xff; // empty projectile list
    g[LAST_PROJECTILE_INDEX] = 0;
    g[0xe8] = 0; // invincibility flag
    g[0xff1b] = 0;
    g[ANIM_TIMER_HI] = 0;
    setEntropy(0x1234);

    return g;
}

/** Run the AI for `frames` ticks; true once a shot has been appended. */
function firesWithin(type: number, monsterY: number, heroY: number, frames = 400): boolean {
    const g = buildScenario(type, monsterY, 16);
    g[HERO_Y] = heroY & 0x3f;

    for (let i = 0; i < frames; i++) {
        dungeonFullTick(g);
        monsterAi8(g, MONSTER);
        if (g[PROJECTILES_LIST] !== 0xff) return true;
    }
    return false;
}

describe('eai8 type 3 (slime) fire gate uses 64-row wrap', () => {
    it('shoots a hero standing on the floor of the row-0 corridor (head row 63)', () => {
        // The mp80 case: monster row 0, corridor floor row 2, hero head row 63.
        expect(firesWithin(3, 0, 63)).toBe(true);
    });

    it('shoots across the wrap from the far side too (hero head row 60)', () => {
        expect(firesWithin(3, 0, 60)).toBe(true);
    });

    it('still shoots a hero that was already in range without wrapping (row 2)', () => {
        expect(firesWithin(3, 0, 2)).toBe(true);
    });

    it('does not shoot a hero 5+ rows away, measured circularly', () => {
        expect(firesWithin(3, 0, 5)).toBe(false); // 5 rows down
        expect(firesWithin(3, 0, 59)).toBe(false); // 5 rows up through the wrap
        expect(firesWithin(3, 0, 30)).toBe(false); // far side of the cavern
    });

    it('leaves the type 2 (crab) proximity rule on the original 8-bit delta', () => {
        // The crab has no shot, so watch the branch its ai_state update takes:
        // 1 = hero near. On row 0 with the hero's head at 63 the original
        // reports "not near", so the chase bit must stay clear.
        const g = buildScenario(2, 0, 16);
        g[HERO_Y] = 63;
        for (let i = 0; i < 400; i++) {
            dungeonFullTick(g);
            monsterAi8(g, MONSTER);
            if ((g[MONSTER + 9] ?? 0) & 1) break;
        }
        expect((g[MONSTER + 9] ?? 0) & 1).toBe(0);

        // A crab on an ordinary row still chases a nearby hero — the rule is
        // alive, just unchanged for types other than 3.
        const g2 = buildScenario(2, 30, 16);
        g2[HERO_Y] = 32;
        let chased = false;
        for (let i = 0; i < 400 && !chased; i++) {
            dungeonFullTick(g2);
            monsterAi8(g2, MONSTER);
            chased = ((g2[MONSTER + 9] ?? 0) & 1) === 1;
        }
        expect(chased).toBe(true);
    });
});
