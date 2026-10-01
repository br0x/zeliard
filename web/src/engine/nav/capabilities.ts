/**
 * capabilities.ts — snapshot what the hero can currently do.
 *
 * The navigation graph is deliberately capability-free: one graph serves every
 * loadout, and what a route may do is decided here, at search time. That matters
 * because the graph is expensive to build (~70 ms for the largest cavern) and
 * cheap to reuse — the hero's shoes change, the terrain does not.
 *
 * Everything is read from `g_mem`, using the same addresses the engine uses:
 *
 *   0x98  ordinary key count        dungeon-doors.ts:40
 *   0x99  Lion-Head key count      dungeon-doors.ts:41
 *   0x9E  equipped accessory id     dungeon-vertical.ts:87-88
 *   0xC012 cavern level            dungeon-frame.ts:359
 *
 * Accessory codes are from asm/common.inc:36-40:
 *
 *   1 Feruza   high jump          2 Pirika  aggressive ground
 *   3 Silkarn  climb slopes       4 Ruzeria no ice sliding
 *   5 Asbestos heat immunity
 *
 * Two of them only matter on particular cavern levels, and gating them on level
 * keeps the mask honest: ice sliding exists only on cavern level 4
 * (`setZeroFlagIfSlippery`, dungeon-vertical.ts:110-118) and heat only on level 7
 * (`dungeon-frame.ts:357-369). A hero wearing Ruzeria shoes in cavern 1 has no ice
 * to resist, so ICE_SAFE is not granted.
 */

import { CAP, type CapabilityMask } from './types.js';
import { memRead8 } from '../../core/ts-memory.js';

/** Accessory ids, from asm/common.inc:36-40. */
export const ACCESSORY_NONE = 0;
export const ACCESSORY_FERUZA = 1;
export const ACCESSORY_PIRIKA = 2;
export const ACCESSORY_SILKARN = 3;
export const ACCESSORY_RUZERIA = 4;
export const ACCESSORY_ASBESTOS = 5;

/** Cavern levels on which ice and heat exist. */
export const LEVEL_ICE = 4;
export const LEVEL_HEAT = 7;

export const ADDR_KEYS = 0x98;
export const ADDR_LION_KEYS = 0x99;
export const ADDR_ACCESSORY = 0x9e;
export const ADDR_CAVERN_LEVEL = 0xc012;

/** A hero's abilities at one moment, plus the counts a route may spend. */
export interface HeroCapabilities {
    readonly mask: CapabilityMask;
    /** Equipped accessory id, or ACCESSORY_NONE. */
    readonly accessory: number;
    /** Cavern level, which selects ice and heat behaviour. */
    readonly cavernLevel: number;
    /** Ordinary keys held — each locked door spends one. */
    readonly keys: number;
    /** Lion-Head keys held. */
    readonly lionKeys: number;
}

/** Does this capability set include `bit`? */
export function hasCap(caps: HeroCapabilities, bit: number): boolean {
    return (caps.mask & bit) !== 0;
}

/** Every bit set in the mask, for tests and for the map screen's legend. */
export function describeCaps(caps: HeroCapabilities): string[] {
    const names: [number, string][] = [
        [CAP.CLIMB, 'climb'],
        [CAP.JUMP_HIGH, 'high jump'],
        [CAP.SLOPE_STAND, 'climb slopes'],
        [CAP.GROUND_SAFE, 'safe ground'],
        [CAP.ICE_SAFE, 'no ice slide'],
        [CAP.HEAT_SAFE, 'heat proof'],
        [CAP.KEY, 'key'],
        [CAP.LION_KEY, 'lion key'],
    ];
    return names.filter(([bit]) => hasCap(caps, bit)).map(([, name]) => name);
}

/**
 * Read the hero's abilities from `g_mem`.
 *
 * @param g the 64 KB memory image
 * @param cavernLevelOverride use this instead of reading 0xC012, for tests and
 *        for planning a route on a map the hero is not currently in
 */
export function snapshotCapabilities(
    g: Uint8Array,
    cavernLevelOverride?: number,
): HeroCapabilities {
    const accessory = memRead8(g, ADDR_ACCESSORY) & 0xff;
    const cavernLevel = cavernLevelOverride ?? (memRead8(g, ADDR_CAVERN_LEVEL) & 0xff);
    // Single bytes: 0x98 and 0x99 are adjacent key counters, so a word read here
    // would smear one into the other. The engine reads them with memRead8 too.
    const keys = memRead8(g, ADDR_KEYS) & 0xff;
    const lionKeys = memRead8(g, ADDR_LION_KEYS) & 0xff;

    let mask: CapabilityMask = CAP.CLIMB;
    if (accessory === ACCESSORY_FERUZA) mask |= CAP.JUMP_HIGH;
    if (accessory === ACCESSORY_SILKARN) mask |= CAP.SLOPE_STAND;
    if (accessory === ACCESSORY_PIRIKA) mask |= CAP.GROUND_SAFE;
    // Ice and heat exist only on their cavern levels, so the mask does not claim
    // the protection where there is nothing to resist.
    if (accessory === ACCESSORY_RUZERIA && cavernLevel === LEVEL_ICE) mask |= CAP.ICE_SAFE;
    if (accessory === ACCESSORY_ASBESTOS && cavernLevel === LEVEL_HEAT) mask |= CAP.HEAT_SAFE;
    if (keys > 0) mask |= CAP.KEY;
    if (lionKeys > 0) mask |= CAP.LION_KEY;

    return { mask, accessory, cavernLevel, keys, lionKeys };
}

/**
 * Capabilities with every wearable granted, for previews and for the
 * "what is reachable at all" question the map screen asks before the hero has the
 * shoes. Ice and heat are granted because a route may cross another cavern.
 */
export function allCapabilities(): HeroCapabilities {
    let mask: CapabilityMask = CAP.CLIMB | CAP.JUMP_HIGH | CAP.SLOPE_STAND
        | CAP.GROUND_SAFE | CAP.ICE_SAFE | CAP.HEAT_SAFE | CAP.KEY | CAP.LION_KEY;
    // Saturate the key counters so every locked door on any route is affordable.
    return { mask, accessory: ACCESSORY_NONE, cavernLevel: LEVEL_HEAT, keys: 255, lionKeys: 255 };
}

/** Capabilities with nothing but innate movement — the bare hero. */
export function bareCapabilities(): HeroCapabilities {
    return { mask: CAP.CLIMB, accessory: ACCESSORY_NONE, cavernLevel: 1, keys: 0, lionKeys: 0 };
}
