/**
 * boss-scenario.ts — shared deterministic scenario builder for the
 * Stage 9f boss parity tests (not a test file itself).
 */
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';

/** Scratch address of the seeded boss_state_block (+0 x word, +2 y, +3 hp word). */
export const BOSS_STATE = 0xb000;
export const SCRATCH = 0xe9e0;

export interface BossSeedOpts {
    /** Which boss: drives the pseudo-monster tile-value domain. */
    kind: 'crab' | 'tako' | 'tori';
}

/**
 * Build one deterministic boss-encounter frame state:
 * - boss_state_block in g_mem scratch, pointer installed at 0xA002;
 * - proximity window repositioned so several boss columns are visible
 *   (and some out of view, exercising the skip branches);
 * - a handful of "last frame's" pseudo-monster entries in the monsters
 *   list (crab always includes its flags==0x14 acid-droplet prop — that
 *   scan is unbounded);
 * - boss flags (BOSS_BEING_HIT) occasionally set to reach death sequences;
 * - layer-2 backup zeroed (applyBase doesn't own it).
 *
 * Domain constraints mirrored from the original guarantees:
 * - ai_flags & 0x1F kept <= 8 (Get_Stats indexes byte_98BE — OOB beyond);
 * - crab/tako segments carry tile indices in their own sprite domains.
 */
export function applyBossScenario(
    view: Uint8Array,
    seed: number,
    opts: BossSeedOpts,
): { bossX: number; d0: number } {
    bindView(view);
    const rand = rng(seed * 6007);
    applyBase(rand);

    // Boss arena placement: pick boss_x inside the movement guards' range.
    // The proximity window is pinned at 18: crab's acid-droplet scan walks
    // the monster list unbounded until it finds a flags==0x14 part, which
    // lives at column boss_x+4 — leftCol=18 keeps that column inside the
    // 36-column window for EVERY legal boss_x (16..49). Without this, a
    // long leftward descent walks the prop out of view and the wasm oracle
    // hangs in that scan (latent UB the real game avoids via arena bounds).
    const bossX = 16 + (rand() % 34);
    const bossY = rand() % 64;
    const leftCol = 18;

    const mapWidth = (view[0xc002] ?? 0) | ((view[0xc003] ?? 0) << 8);
    if (leftCol >= mapWidth) throw new Error('scenario: mapWidth < 19');
    view[0x80] = leftCol & 0xff;
    view[0x81] = (leftCol >> 8) & 0xff;

    // boss_state_block
    view[BOSS_STATE + 0] = bossX & 0xff;
    view[BOSS_STATE + 1] = (bossX >> 8) & 0xff;
    view[BOSS_STATE + 2] = bossY;
    const hpBig = frac(rand) < 0.75;
    const hp = hpBig ? 0x100 + (rand() % 0x200) : 1 + (rand() % 24);
    view[BOSS_STATE + 3] = hp & 0xff;
    view[BOSS_STATE + 4] = (hp >> 8) & 0xff;
    view[0xa002] = BOSS_STATE & 0xff;
    view[0xa003] = BOSS_STATE >> 8;

    // Engine flags: exercise the death sequences sometimes.
    view[0xff2e] = frac(rand) < 0.2 ? 0xff : 0; // BOSS_BEING_HIT
    view[0xff30] = 0;                            // BOSS_IS_DEAD
    view[0xff2f] = 0;                            // SPRITE_FLASH_FLAG

    // Reset engine-owned counters/lists that applyBase doesn't cover —
    // otherwise the second (TS) pass inherits the first (wasm) pass's
    // leftovers (tori fires into this list).
    view[0x9f1f] = 0; // LAST_PROJECTILE_INDEX
    view.fill(0, 0xeb80, 0xed20);
    view[0xeb80] = 0xff; // empty projectile list

    // Layer-2 tile backup: applyBase doesn't own it.
    view.fill(0, 0xed20, 0xed20 + 128);

    // Last frame's pseudo-monster entries.
    const entryCount = 3 + (rand() % 4); // 3..6 entries
    let si = SCRATCH;
    for (let i = 0; i < entryCount; i++) {
        const x = (leftCol + (rand() % 44) - 4) & 0xffff;
        view[si + 0] = x & 0xff;
        view[si + 1] = (x >> 8) & 0xff;
        view[si + 2] = (bossY + (rand() % 12)) & 0x3f; // .currY
        view[si + 3] = rand() % 36;                    // .m_x_rel (recomputed anyway)
        let tile: number;
        if (opts.kind === 'tako') {
            // tentacle tile indices; sometimes the vulnerable >=0x0E ones
            tile = frac(rand) < 0.3 ? 0x0e + (rand() % 3) : rand() % 6;
        } else if (opts.kind === 'tori') {
            tile = rand() % 16; // pose high nibble domain
        } else {
            // crab part tiles from its layout tables (incl. the 0x14 prop)
            tile = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                0x10, 0x11, 0x12, 0x14, 0x90][rand() % 14]!;
        }
        if (opts.kind === 'crab' && i === 0) tile = 0x14; // droplet prop: unbounded scan target
        view[si + 4] = tile;
        let aiFlags = rand() % 256;
        if (frac(rand) < 0.85) aiFlags &= ~(0x20 | 0x40) & 0xff; // mostly un-hit
        aiFlags = ((aiFlags & ~0x1f) | (rand() % 9)) & 0xff;     // Get_Stats domain
        view[si + 5] = aiFlags;
        view[si + 6] = rand() % 256; // .anim_counter
        si += 16;
    }
    view[si + 0] = 0xff; // .currX sentinel: end of list
    view[si + 1] = 0xff;

    return { bossX, d0: Math.abs(bossX - (leftCol + (view[0x83] ?? 0))) };
}
