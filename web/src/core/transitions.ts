/**
 * transitions.ts — pure helpers for town/dungeon transition flows.
 *
 * Extracted from game.js (Stage 2): the asm-parity viewport scroll math
 * used when re-entering a town, the music-track mapping shared by all
 * transition entry points, the boss state block encoder, and the MDT
 * map-width reader. The async orchestration (asset loading, wasm calls)
 * stays with the caller in game.js until render/ has an owner.
 */

import { PROX_COLS } from '../config/engine.js';

/** Map width word from a town MDT header (little-endian at offset 2). */
export function getTownMapWidth(mdt: Uint8Array | null | undefined): number {
    if (!mdt || mdt.length < 4) return 0;
    return (mdt[2] ?? 0) | ((mdt[3] ?? 0) << 8);
}

/**
 * Compute the town viewport scroll after re-entry from an absolute hero X
 * (proximity-map column). Edge-locking logic from fight.asm
 * (edge_locking_scrolling_window):
 *
 * - right edge: hero within 13 columns of the map's right edge → freeze the
 *   viewport so the rightmost column stays visible;
 * - left edge: hero_x - 17 wraps past 255 (16-bit) → freeze at column 0,
 *   hero sits 4 tiles from the left;
 * - middle: free scrolling — the hero always appears at viewport column 13.
 */
export function computeTownScrollFromAbsoluteX(
    heroProxX: number,
    mapWidth: number,
): { proxLeft: number; heroViewX: number } {
    let heroViewX = 13;
    let proxLeft = 0;

    if (heroProxX > mapWidth - 13) {
        // ── Right-edge lock ──────────────────────────────────────────────
        const carry = mapWidth >= PROX_COLS ? 1 : 0;
        const left_col = mapWidth - PROX_COLS;

        proxLeft = left_col;
        heroViewX = heroProxX - left_col - carry - 3;
    } else {
        // Subtract 17; the result wraps to a large uint16 when hero_x < 17,
        // which is exactly what `or ah, ah / jnz` detected in the original.
        const ax = (heroProxX + 65536 - 17) & 0xffff;

        if (ax > 255) {
            // ── Left-edge lock ───────────────────────────────────────────
            proxLeft = 0;
            heroViewX = heroProxX - 4;
        } else {
            // ── Middle (free scrolling) ──────────────────────────────────
            proxLeft = ax;   // hero_x_in_proximity_map - 17
            heroViewX = 13;
        }
    }
    return { proxLeft, heroViewX };
}

/**
 * Resolve the background-music track id reported by the engine into an
 * audio-file key. Town themes (mgt/ugm variants) for ids 0..3, cavern
 * themes for 4..11; unknown values fall back to the first town theme.
 */
export function resolveMusicTrack(type: number | string | null | undefined): string {
    const map: Record<number, string> = {
        0: 'mgt1',
        1: 'ugm1',
        2: 'mgt2',
        3: 'ugm2',
        4: 'Zeliard-04-CavernOfMalicia',
        5: 'Zeliard-08-CavernOfPeligro',
        6: 'Zeliard-10-CavernOfMadera',
        7: 'Zeliard-11-CavernOfEscarcha',
        8: 'Zeliard-09-CavernOfCorroer',
        9: 'Zeliard-13-CavernOfTesoro',
        10: 'Zeliard-12-CavernOfCaliente',
        11: 'Zeliard-14-CavernOfAbsor',
    };
    return map[Number(type)] ?? 'mgt1';
}

// ─── Boss state block ─────────────────────────────────────────────────────────

/** Layout of one dungeon's boss descriptor in data/dungeons.ts. */
export interface BossState {
    /** Boss absolute X in the proximity map (+0, word). */
    bossX: number;
    /** Boss Y row (+2). */
    bossY: number;
    /** Boss HP (+3, word). */
    bossHP: number;
    /** XP reward (+5, word). */
    xpReward: number;
    /** Arena center column (+7). */
    arenaCenterX: number;
    /** Boss placement variant (+8). */
    bossPlacement: number;
    /** Almas reward (+9, word). */
    almasReward: number;
    /** Pascal-prefixed name written at +11. */
    bossName: string;
}

export interface EncodedBossState {
    /** Bytes written to ADDR_BOSS_STATE_BLOCK..+10. */
    block: Uint8Array;
    /** Pascal-string bytes written at ADDR_BOSS_STATE_BLOCK+11. */
    namePascal: Uint8Array;
}

/** Encode a boss descriptor into the g_mem layout expected by the engine. */
export function encodeBossState(bossState: BossState): EncodedBossState {
    const block = new Uint8Array(11);
    block[0] = bossState.bossX & 0xff;
    block[1] = (bossState.bossX >> 8) & 0xff;            // +0 word
    block[2] = bossState.bossY;                          // +2
    block[3] = bossState.bossHP & 0xff;
    block[4] = (bossState.bossHP >> 8) & 0xff;           // +3 word
    block[5] = bossState.xpReward & 0xff;
    block[6] = (bossState.xpReward >> 8) & 0xff;         // +5 word
    block[7] = bossState.arenaCenterX;                   // +7
    block[8] = bossState.bossPlacement;                  // +8
    block[9] = bossState.almasReward & 0xff;
    block[10] = (bossState.almasReward >> 8) & 0xff;     // +9 word

    const bytes = new TextEncoder().encode(bossState.bossName);
    const namePascal = new Uint8Array(1 + bytes.length);
    namePascal[0] = bytes.length;
    namePascal.set(bytes, 1);

    return { block, namePascal };
}
