/**
 * boss-scenario.ts — shared deterministic scenario builder for the
 * Stage 9f boss parity tests (not a test file itself).
 */
import { applyBase, bindView, frac, rng } from './vertical-scenario.js';

/** Scratch address of the seeded boss_state_block (+0 x word, +2 y, +3 hp word). */
export const BOSS_STATE = 0xb000;
/**
 * Monsters-list scratch for boss encounters. Unlike the Stage 8 suites
 * (≤8 entries), bosses render up to ~170 pseudo-monster entries per frame
 * (~2.7 KB); 0xe9e0 + that overruns 0xEB80 — the enemy-projectile list —
 * clobbering its 0xFF terminator, after which Add_Projectile_To_Array's
 * unbounded scan wraps into low memory. Park the list above everything
 * (projectiles end ≈0xED30, layer2 ends 0xEDA0): 0xF000 + 0xAA0 < 0xF800.
 */
export const SCRATCH = 0xb100;

export interface BossSeedOpts {
    /** Which boss: drives the pseudo-monster tile-value domain. */
    kind:
        | 'crab' | 'tako' | 'tori' | 'agar' | 'vista' | 'tarso'
        | 'paguro' | 'dragon' | 'alguien' | 'jashiin1' | 'jashiin2';
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
    // Dragon varies leftCol instead: its pose selection compares
    // (left+16)/(left+11) against boss_x, and with a fixed leftCol only
    // some branches would ever run.
    const xRange: Record<BossSeedOpts['kind'], [number, number]> = {
        crab: [16, 34],   // movement guards 16..49
        tako: [16, 34],
        tori: [16, 40],
        agar: [18, 32],   // movement guards 17..50
        vista: [12, 36],  // patrol limits 10..49; terrain idx boss_x-9 >= 1
        tarso: [17, 32],  // left wall 0x0E..0x0F, right bound 50
        paguro: [18, 32], // movement guards 17..50
        dragon: [17, 13], // bounds: blocked at x<=14 / x>30
        alguien: [12, 36],// move-2 guards: blocked at x-2<=9 / x+2>0x33
        jashiin1: [16, 24], // boss_x overwritten every frame (0x10/0x0D)
        jashiin2: [17, 28], // walk guards: blocked at x<=14 / x>53
    };
    const [xMin, xSpan] = xRange[opts.kind];
    const bossX = xMin + (rand() % xSpan);
    const bossY = rand() % 64;
    const leftCol = opts.kind === 'dragon' ? 14 + (rand() % 14) : 18;

    const mapWidth = (view[0xc002] ?? 0) | ((view[0xc003] ?? 0) << 8);
    if (leftCol >= mapWidth) throw new Error('scenario: mapWidth < 19');
    view[0x80] = leftCol & 0xff;
    view[0x81] = (leftCol >> 8) & 0xff;

    // Point the monsters list at the boss scratch table.
    view[0xc010] = SCRATCH & 0xff;
    view[0xc011] = SCRATCH >> 8;

    // Sword type: vista's heavy-hit path keys on sword type >= 4.
    view[0x92] = rand() % 7;

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

    // NOTE: no clear of the list region itself — both passes start from
    // identical leftovers and rewrite the rendered span contiguously up to
    // the fresh sentinel, so stale bytes beyond it are never observed.
    // Clearing here would instead wipe C-side statics that live in high
    // linear memory and persist across oracle calls.

    // Layer-2 tile backup: applyBase doesn't own it.
    view.fill(0, 0xed20, 0xed20 + 128);

    // Initialize the list region (fresh zeros both passes).
    view.fill(0, 0xb100, 0xba00);

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
        } else if (opts.kind === 'vista') {
            // eye body tiles; bit 3 set (0x08/0x09) marks vulnerable parts
            tile = frac(rand) < 0.3 ? 0x08 + (rand() % 2) : rand() % 8;
        } else if (opts.kind === 'agar' || opts.kind === 'paguro') {
            tile = rand() % 5; // movement_facing_table domain; agar id 4 = heavy
        } else if (opts.kind === 'dragon') {
            // zero low-nibble marks the vulnerable parts — seed both classes
            tile = frac(rand) < 0.35
                ? (frac(rand) < 0.5 ? 0x00 : 0x80)
                : rand() % 256;
        } else if (opts.kind === 'alguien') {
            // .flags == 5 exactly marks the vulnerable segment
            tile = frac(rand) < 0.25 ? 5 : rand() % 256;
        } else {
            tile = rand() % 256; // tarso/jashiin: flags derive from the byte
        }
        if (opts.kind === 'crab' && i === 0) tile = 0x14; // droplet prop: unbounded scan target
        view[si + 4] = tile;
        let aiFlags = rand() % 256;
        if (frac(rand) < 0.85) aiFlags &= ~(0x20 | 0x40) & 0xff; // mostly un-hit
        // Get_Stats domain: <= 8 hits the byte_98BE table, 9 has its own
        // formula; tarso's damage rules distinguish 1 / 9 / others, so its
        // seeded hit ids span 0..9.
        const statMax = opts.kind === 'tarso' ? 10 : 9;
        aiFlags = ((aiFlags & ~0x1f) | (rand() % statMax)) & 0xff;
        view[si + 5] = aiFlags;
        let animCounter = rand() % 256;
        // jashiin2's special hit class: flags low-5 zero AND anim low
        // nibble zero — seed matching pairs so the path is reachable.
        if (opts.kind === 'jashiin2' && (tile & 0x1f) === 0 && frac(rand) < 0.6) {
            animCounter &= ~0x0f & 0xff;
        }
        view[si + 6] = animCounter;
        si += 16;
    }
    view[si + 0] = 0xff; // .currX sentinel: end of list
    view[si + 1] = 0xff;

    // Kind-specific extra seeds.
    if (opts.kind === 'jashiin1') {
        view[0xe6] = 0xff; // IS_JASHIIN_CAVERN: script end clears it (observable)
    }
    if (opts.kind === 'jashiin2') {
        // Encounter-start latch: mostly started so the AI body actually runs.
        view[0xff21] = frac(rand) < 0.85 ? 0xff : 0;
    }

    return { bossX, d0: Math.abs(bossX - (leftCol + (view[0x83] ?? 0))) };
}
