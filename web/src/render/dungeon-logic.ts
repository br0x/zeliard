/**
 * dungeon-logic.ts — pure decision helpers extracted from the dungeon
 * renderer (Stage 2). The memory walks and canvas blits stay in game.js;
 * these functions hold the actual rules and are unit-testable.
 */

import { ADDR_PROXIMITY_MAP } from '../wasm/memory.js';
import { PROX_SIZE } from '../config/engine.js';

/**
 * Sprite-sheet frame for a fired spell projectile.
 *
 * Sheet layout (48px frames): rows per spell index, first half facing one
 * way, second half the other; spell 4 (static) has a single frame.
 */
export function getMagicFrameIndex(spellIndex: number, mpDir: boolean, animFrame: number): number {
    if (spellIndex === 0) return animFrame;
    if (spellIndex === 1 && mpDir) return 3 + animFrame;
    if (spellIndex === 1) return 6 + animFrame;
    if (spellIndex === 2 && mpDir && animFrame === 0) return 9;
    if (spellIndex === 2 && !mpDir && animFrame === 0) return 10;
    if (spellIndex === 2) return 10 + animFrame;
    if (spellIndex === 3 && mpDir) return 15 + animFrame;
    if (spellIndex === 3) return 18 + animFrame;
    if (spellIndex === 4) return 21;
    if (spellIndex === 5 && mpDir) return 22 + animFrame;
    if (spellIndex === 5) return 25 + animFrame;
    return 0;
}

/** Wrap an absolute address back into the circular proximity map window. */
export function wrapProximityAddress(
    addr: number,
    base: number = ADDR_PROXIMITY_MAP,
    size: number = PROX_SIZE,
): number {
    return base + ((((addr - base) % size) + size) % size);
}

export interface TileAnimContext {
    /** Cavern id 5..8 selects the animation rule set. */
    cavernLevel: number;
    /** True on odd render ticks (half the animations advance only then). */
    oddTick: boolean;
    /** Random source (tile 0x1D in gold caverns pauses 75% of the time). */
    rng?: () => number;
}

/**
 * Advance one proximity-map tile through its cavern animation cycle.
 * Returns the replacement tile id, or null when this tile doesn't animate
 * (or is paused this tick).
 *
 * Rule sets mirror the C handlers:
 * - Cavern 5 (water):   mpp5.grp 0x1B ↔ 0x1C, odd ticks only
 * - Cavern 6 (gold):    0x1D..0x20 shiny cycle (0x1D pauses 75%),
 *                       0x21 ↔ 0x22 melted-gold blink
 * - Cavern 7 (hot):     0x2C ↔ 0x2D jet (odd ticks); chains starting at
 *                       0x0C..0x0E/0x10 → 0x33..0x3D advancing +1, ending at
 *                       fixed cells
 * - Cavern 8 (thorns):  0x25..0x28 cycle, odd ticks only
 */
export function nextAnimatedTile(tile: number, ctx: TileAnimContext): number | null {
    const { cavernLevel, oddTick } = ctx;
    const rng = ctx.rng ?? Math.random;

    // Entity markers are not animated; their background lives in layer 2.
    if (tile & 0x80) return null;

    let nextTile: number;
    if (cavernLevel === 5) {
        // Animate_Water_Cavern5; mpp5.grp: 0x1B↔0x1C - animated water tile
        if (!oddTick || (tile !== 0x1b && tile !== 0x1c)) return null;
        nextTile = tile === 0x1b ? 0x1c : 0x1b;
    } else if (cavernLevel === 6) {
        // Animate_Gold_Cavern6; 0x1D..0x20 (shiny), 0x21↔0x22 (melted)
        const phase = tile - 0x1d;
        if (phase < 0 || phase >= 6) return null;
        if (phase >= 4) {
            nextTile = ((phase + 1) & 1) + 0x21;
        } else {
            // Tile 1D pauses 75% of the time in the original.
            if (phase === 0 && (Math.floor(rng() * 65536) & 3) !== 0) return null;
            nextTile = ((phase + 1) & 3) + 0x1d;
        }
    } else if (cavernLevel === 7) {
        // Animate_Hot_Cavern7; 0x2C↔0x2D (jet), chain tiles 0x33..0x3D
        if (!oddTick) return null;
        if (tile === 0x2c || tile === 0x2d) {
            nextTile = tile === 0x2c ? 0x2d : 0x2c;
        } else {
            const starts: Record<number, number> = {
                0x0e: 0x33,
                0x0d: 0x36,
                0x0f: 0x39,
                0x0c: 0x3c,
                0x10: 0x3d,
            };
            if (Object.hasOwn(starts, tile)) {
                nextTile = starts[tile]!;
            } else if (tile >= 0x33 && tile < 0x3e) {
                const ends: Record<number, number> = {
                    0x35: 0x0e,
                    0x38: 0x0d,
                    0x3b: 0x0f,
                    0x3c: 0x0c,
                    0x3d: 0x10,
                };
                nextTile = Object.hasOwn(ends, tile) ? ends[tile]! : tile + 1;
            } else {
                return null;
            }
        }
    } else {
        // Animate_Thorn_Cavern8; mpp8.grp: 0x25..0x28 animated tiles
        const phase = tile - 0x25;
        if (!oddTick || phase < 0 || phase >= 4) return null;
        nextTile = ((phase + 1) & 3) + 0x25;
    }

    return nextTile;
}
