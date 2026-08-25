/**
 * eai678-scenario.ts — shared deterministic scenario builder for the
 * Stage 9e eai6/eai7/eai8 parity tests (not a test file itself).
 */
import { coordsToProxAddr, wrapMapFromAbove, wrapMapFromBelow } from '../src/engine/dungeon-entities.js';
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';

export const SCRATCH = 0xe9e0;

export interface SeedOpts {
    type: number;
    twin: boolean; // paired/top-half monster with a passive twin at m+0x10
}

/**
 * One monster record with the domain constraints the original guarantees:
 * - ai_flags & 0x1F kept <= 8 (Get_Stats indexes byte_98BE — OOB in C
 *   beyond the table; every hit path here runs Hero_Hits_monster).
 * - No other counter is table-indexed in these modules: eai6 type2 and
 *   eai8 type4 index their direction tables with `(ai_state >> 4) & 7`
 *   (always in-bounds), eai7 type4 uses `(((ai_state >> 5) & 7) - 1) & 7`,
 *   so ai_state stays free.
 */
export function seedMonster(view: Uint8Array, rand: () => number, idx: number, opts: SeedOpts): void {
    const m = SCRATCH + idx * 16;

    view[m] = rand() % 256; // currX lo
    view[m + 1] = rand() % 256; // currX hi
    view[m + 2] = rand() % 64; // currY
    view[m + 3] = rand() % 36; // m_x_rel
    let flags = rand() % 256;
    flags = (flags & ~0x0f) | opts.type;
    if (opts.twin) flags |= 0x10; // big-monster marker on the top half
    view[m + 4] = flags;
    let aiFlags = rand() % 256;
    // Keep the hit/death bits (0x20 on the active half, 0x40 which for
    // eai7 type0 also triggers the hit path via the twin) clear ~85% of
    // the time — a permanently-set hit bit routes every tick into the
    // hit-reaction branch and starves the movement/attack state machines.
    if (frac(rand) < 0.85) aiFlags &= ~(0x20 | 0x40) & 0xff;
    aiFlags = ((aiFlags & ~0x1f) | (rand() % 9)) & 0xff; // Get_Stats domain
    view[m + 5] = aiFlags;
    view[m + 6] = rand() % 256; // anim_counter
    view[m + 7] = rand() % 256; // state_flags
    view[m + 8] = rand() < 0.5 ? 0 : 1 + (rand() % 8); // hp
    view[m + 9] = rand() % 256; // ai_state
    view[m + 10] = rand() % 256; // ai_timer

    if (opts.twin) {
        const t = m + 16;
        view[t + 2] = rand() % 64; // twin currY
        view[t + 3] = rand() % 36; // twin m_x_rel
        view[t + 4] = (flags & ~0x0f) & 0xff; // twin flags (type nibble off)
        view[t + 5] = aiFlags; // twin ai_flags
    }
}

/** Build the scenario for one parity case (mirrors main.ts-free engine boot). */
export function applyEai678Scenario(
    view: Uint8Array,
    seed: number,
    seedRandMult: number,
    moduleName: 'eai6' | 'eai7' | 'eai8',
): void {
    bindView(view);
    const rand = rng(seed * seedRandMult);
    applyBase(rand);

    view[0xc010] = SCRATCH & 0xff;
    view[0xc011] = SCRATCH >> 8;

    // Seed HERO_Y first, then place the monster within ±5 rows of it —
    // fully-random Ys align with the hero (< 5 rows) only ~14% of the
    // time, starving every proximity-gated branch (eai7's firing-distance
    // logic in particular).
    const heroY = rand() % 64;
    view[0xff35] = heroY;

    const type = [0, 1, 2, 3, 4][rand() % 5]!;
    const twin = type === 0 || (moduleName === 'eai7' && type === 2);
    seedMonster(view, rand, 0, { type, twin });
    view[SCRATCH + 2] = (heroY + (rand() % 11) - 5) & 0x3f;
    view[SCRATCH + (twin ? 32 : 16)] = 0xff;
    view[SCRATCH + (twin ? 33 : 17)] = 0xff;

    if (moduleName === 'eai7' && type === 0) {
        // Face the seeded monster toward the hero up front: the firing
        // distance logic runs only when the proximity check reports
        // "already facing" (pr.carry), and waiting for the wander step's
        // random flip starves the prepare-attack/re-roll path.
        const xr = view[SCRATCH + 3] ?? 0;
        view[SCRATCH + 5] =
            ((view[SCRATCH + 5] ?? 0) & ~0x80 | (xr < 0x11 ? 0x80 : 0)) & 0xff;

        // Open corridor: the e/w wall scans look at columns xr±{1,2} over
        // rows y-1..y+3. Walled-in monsters freeze in place and their hero
        // distance never sweeps through the firing-distance boundary
        // values, leaving the post-re-roll comparisons unexercised.
        view[0x18000] = 6; // guarantee tile 6 counts as passable
        const y = view[SCRATCH + 2] ?? 0;
        const baseCell = coordsToProxAddr(view, xr, y);
        for (let dx = -3; dx <= 3; dx++) {
            for (let row = -1; row <= 3; row++) {
                let cell = (baseCell + dx + row * 36) & 0xffff;
                cell = row >= 0 ? wrapMapFromAbove(cell) : wrapMapFromBelow(cell);
                view[cell] = 6;
            }
        }
    }

    if (moduleName === 'eai8' && type === 3) {
        // Force the walking-burst probe path: it needs bit0 pre-set,
        // ai_timer near the 8-tick trigger, AND eight consecutive grounded
        // ticks (p ≈ 0.4^8 unforced — unreachable with random tiles).
        view[SCRATCH + 9] = ((view[SCRATCH + 9] ?? 0) | 1) & 0xff;
        view[SCRATCH + 10] = 6 + (rand() % 3);
        const below = coordsToProxAddr(view, view[SCRATCH + 3] ?? 0, view[SCRATCH + 2] ?? 0);
        view[(below + 36) & 0xffff] = 0xf0; // solid floor one row down
        view[(below + 37) & 0xffff] = 0xf0;
    }

    // Give the monster solid ground ~70% of the time: without it the
    // paired/flying types spend most ticks falling one row and the
    // multi-frame state machines (eai7's firing-distance logic in
    // particular) never get enough consecutive grounded frames to reach
    // their interesting branches.
    if (frac(rand) < 0.7) {
        const base = coordsToProxAddr(view, view[SCRATCH + 3] ?? 0, view[SCRATCH + 2] ?? 0);
        const addr = wrapMapFromAbove((base + 0x90) & 0xffff); // 4 rows down
        view[addr] = 0xf0; // blocking, ≥ 0x49 with bit7 set
        view[(addr + 1) & 0xffff] = 0xf0;
    }

    // Reset engine-owned counters/lists that applyBase doesn't cover —
    // otherwise the second (TS) pass inherits the first (wasm) pass's
    // leftovers.
    view[0x9f1f] = 0; // LAST_PROJECTILE_INDEX
    view.fill(0, 0xeb80, 0xed20);
    view[0xeb80] = 0xff; // empty projectile list
}
