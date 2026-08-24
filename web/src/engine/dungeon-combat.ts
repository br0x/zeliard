/**
 * dungeon-combat.ts — TS port of dungeon.c's combat & monster-death
 * pipeline (Stage 8c, slice 2).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - get_random                             (zela.c — entropy LFSR-ish accumulator)
 *   - Get_Stats                              (3736)
 *   - apply_sword_hit_to_map_tiles           (700)
 *   - Hero_Hits_monster                      (3725)
 *   - monster_split_or_die                   (3697)
 *   - Check_Vertical_Distance_Between_Hero_And_Monster (3706)
 *   - update_hero_XP                         (999)
 * plus the sword_damages / byte_98BE stat tables.
 *
 * The RNG is the original asm/stick.asm entropy accumulator: a uint16
 * static mixed with ADDR_ANIM_TIMER. The static lives outside g_mem, so it
 * is mirrored here as module state with getEntropy/setEntropy accessors
 * (the C side exposes the same via wasm_debug_set_entropy for parity
 * tests).
 */

import { SEG1_BASE } from '../wasm/memory.js';
import {
    heroCoordsToAddrInProximity,
    getDstMonsterFlags,
} from './dungeon-hero.js';
import { wrapMapFromAbove, wrapMapFromBelow } from './dungeon-entities.js';

const PROX_COLS = 36;

// g_mem addresses (zeliard.h / dungeon.c defines)
const VIEWPORT_TOP_ROW = 0x82;
const HERO_LEVEL = 0x8d;
const HERO_XP = 0x8e; // word
const FACING = 0xc2;
const LEFT_FLAG = 1;
const BYTE_E4 = 0xe4;
const SQUAT_FLAG = 0xff38;
const IS_BOSS_CAVERN = 0xff34;
const BOSS_BEING_HIT = 0xff2e;
const ANIM_TIMER = 0xff1b; // word
const SOUND_FX_REQUEST = 0xff75;
const SWORD_SWING_FLAG = 0xff43;
const SWORD_HIT_TYPE = 0xff45; // 0=forward, 1=overhead, 2=downward thrust
const SWORD_MOVEMENT_PHASE = 0xff46;
const DEATH_DESCRIPTORS_PTR = 0xa006; // word
const XP_FOR_MONSTER = 0xa008;

const REACH_TABLE_SEG1 = 0xb002; // seg1-based

/** Sword damage table indexed by sword_type-1 (dungeon.c:81). */
export const SWORD_DAMAGES: readonly number[] = [1, 2, 4, 8, 32, 127];

/** Static stat table byte_98BE (dungeon.c:82), indexed by al-2 for al=2..8. */
export const BYTE_98BE: readonly number[] = [2, 4, 8, 16, 32, 64, 255];

function g8(g: Uint8Array, addr: number): number {
    return g[addr & 0xffff] ?? 0;
}

function s8(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
}

function g16(g: Uint8Array, addr: number): number {
    return (g[addr & 0xffff] ?? 0) | ((g[(addr + 1) & 0xffff] ?? 0) << 8);
}

function s16(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
    g[(addr + 1) & 0xffff] = (v >> 8) & 0xff;
}

function seg16(g: Uint8Array, addr: number): number {
    return (g[(SEG1_BASE + addr) & 0xffffff] ?? 0) |
        ((g[(SEG1_BASE + addr + 1) & 0xffffff] ?? 0) << 8);
}

// ─── RNG (asm/stick.asm:1168 entropy accumulator) ───

let entropyAccum = 0;

export function getEntropy(): number {
    return entropyAccum;
}

export function setEntropy(v: number): void {
    entropyAccum = v & 0xffff;
}

/**
 * get_random (zela.c): mixes ADDR_ANIM_TIMER into the uint16 entropy
 * accumulator and returns the low byte. Mirrors the asm carry chain
 * exactly: al = lo+hi (with carry into ah), then += entropy_accum.
 */
export function getRandom(g: Uint8Array): number {
    const anim = g16(g, ANIM_TIMER);
    let al = anim & 0xff;
    let ah = (anim >> 8) & 0xff;
    const carry = ((al + ah) >>> 8) & 0xff;
    al = (al + ah) & 0xff;
    ah = (ah + carry) & 0xff;
    const result = (((ah << 8) | al) + entropyAccum) & 0xffff;
    entropyAccum = result;
    return result & 0xff;
}

// ─── stat lookup ───

/**
 * Get_Stats (dungeon.c:3736).
 * al=0 → defense-ish (hero_level/2)+1; al=1 → total sword damage;
 * al=9 → (hero_level+1)*4 saturated; al=2..8 → byte_98BE[al-2].
 */
export function getStats(g: Uint8Array, al: number): number {
    if (al === 0) {
        return ((g8(g, HERO_LEVEL) >> 1) + 1) & 0xff;
    }

    if (al === 1) {
        // Sword damage: base + level/2, × difficulty, ×2 downward; saturating
        const base = SWORD_DAMAGES[g8(g, 0x92) /* SWORD_TYPE */ - 1] ?? 0;
        const halfLevel = g8(g, HERO_LEVEL) >> 1;
        const sum = base + halfLevel;
        let ah: number;
        if (sum > 0xff) {
            ah = 0xff;
        } else {
            const product = sum * ((g8(g, BYTE_E4) + 1) & 0xff);
            ah = product > 0xff ? 0xff : product;
        }
        if (g8(g, SWORD_HIT_TYPE) === 2) {
            const doubled = ah * 2;
            ah = doubled > 0xff ? 0xff : doubled & 0xff;
        }
        return ah & 0xff;
    }

    if (al === 9) {
        const temp = (g8(g, HERO_LEVEL) + 1) * 4;
        return temp > 0xff ? 0xff : temp & 0xff;
    }

    // al = 2..8
    return BYTE_98BE[(al - 2) & 0xff] ?? 0;
}

// ─── sword swing vs map tiles ───

/**
 * apply_sword_hit_to_map_tiles (dungeon.c:700): walks the per-phase reach
 * list (seg1 table at 0xB002) from the hero's tile and marks every hit
 * monster/item's ai_flags with the "hit this frame" bits (0x41).
 */
export function applySwordHitToMapTiles(g: Uint8Array): void {
    if (g8(g, SWORD_SWING_FLAG) === 0) return;
    if (g8(g, IS_BOSS_CAVERN) !== 0 && g8(g, BOSS_BEING_HIT) !== 0) return;

    // hero top-left proximity tile, adjusted up 3 rows when squatting else 4
    let si = heroCoordsToAddrInProximity(g);
    const rows = g8(g, SQUAT_FLAG) !== 0 ? 3 : 4;
    si = wrapMapFromBelow((si - rows * PROX_COLS) & 0xffff);

    // index into the reachability pointer table:
    // right phases 0..5 fwd, 6..9 overhead, 10 down-thrust; left adds 16
    const dir = g8(g, FACING) & LEFT_FLAG;
    const dir16 = (dir << 4) & 0xff;
    const swordHitType = g8(g, SWORD_HIT_TYPE);
    const phase = g8(g, SWORD_MOVEMENT_PHASE);
    let result = dir16;
    switch (swordHitType) {
        case 0:
            result += phase; // 0..5 or 16..21
            break;
        case 1:
            result += phase + 6; // 6..9 or 22..25
            break;
        default:
            result += 10; // 10 or 26
            break;
    }
    const idx = result & 0xfe;

    const reachTable = REACH_TABLE_SEG1;
    const listOff = seg16(g, reachTable + idx);

    // walk the FF-terminated offset list (seg1 data)
    let listPtr = (SEG1_BASE + listOff) & 0xffffff;
    for (;;) {
        const offsetByte = g[listPtr] ?? 0;
        listPtr++;
        if (offsetByte === 0xff) return;

        si = wrapMapFromAbove((si + offsetByte) & 0xffff);

        const { flags, monsterStruct } = getDstMonsterFlags(g, si);
        if (monsterStruct === 0) continue; // no monster/item marker here
        if ((flags & 0x20) !== 0) continue;
        const aiFlags = g8(g, monsterStruct + 5);
        if ((aiFlags & 0x20) !== 0) continue;

        // mark hit: keep bits 7-5, set bit6 + bit0
        s8(g, monsterStruct + 5, (aiFlags & 0xe0) | 0x41);
    }
}

// ─── monster death & XP ───

/** update_hero_XP (dungeon.c:999): saturating word add to hero XP. */
export function updateHeroXp(g: Uint8Array, amount: number): void {
    const xp = g16(g, HERO_XP);
    let next: number;
    if (amount > ((0xffff - xp) & 0xffff)) {
        next = 0xffff;
    } else {
        next = (xp + amount) & 0xffff;
    }
    s16(g, HERO_XP, next);
}

/**
 * Check_Vertical_Distance_Between_Hero_And_Monster (dungeon.c:3706):
 * switches the monster into its death animation; plays SFX 7 when it dies
 * near enough to the viewport top.
 */
export function checkVerticalDistanceBetweenHeroAndMonster(g: Uint8Array, m: number): void {
    s8(g, m + 6, 0); // anim_counter
    s8(g, m + 4, g8(g, m + 4) | 0x68); // flags |= death animation bits
    s8(g, m + 5, g8(g, m + 5) & 0x80); // clear AI flags except bit7
    if ((g8(g, m + 7) & 0x10) !== 0 && (g8(g, m + 4) & 1) === 0) {
        s8(g, m + 6, 0x80);
        s8(g, m + 16 + 6, 0);
        s8(g, m + 16 + 4, g8(g, m + 16 + 4) | 0x68);
        s8(g, m + 16 + 5, g8(g, m + 16 + 5) & 0x80);
    }
    const al = (g8(g, m + 2) - g8(g, VIEWPORT_TOP_ROW) + 1) & 0x3f;
    if (al < 19) {
        s8(g, SOUND_FX_REQUEST, 7);
    }
}

/**
 * monster_split_or_die (dungeon.c:3697): awards XP (small monsters only,
 * from the XP table indexed by flags&7... flags&0x0F per source) and kills.
 */
export function monsterSplitOrDie(g: Uint8Array, m: number): void {
    const flags = g8(g, m + 4);
    if ((flags & 0x10) === 0) {
        const xp = g8(g, XP_FOR_MONSTER + (flags & 0x0f));
        updateHeroXp(g, xp);
    }
    checkVerticalDistanceBetweenHeroAndMonster(g, m);
}

/**
 * Hero_Hits_monster (dungeon.c:3725): applies one sword hit. Damage comes
 * from Get_Stats(ai_flags&0x1F); surviving monsters lose HP (SFX 6),
 * lethal hits pick a death descriptor (random unless downward thrust) and
 * die via monster_split_or_die.
 */
export function heroHitsMonster(g: Uint8Array, m: number): void {
    const al = g8(g, m + 5) & 0x1f;
    const ah = getStats(g, al);
    const hp = g8(g, m + 8);
    if (hp > ah) {
        s8(g, m + 8, hp - ah);
        s8(g, SOUND_FX_REQUEST, 6);
        return;
    }

    const pickDeathDescriptor = (): number => {
        let di = g16(g, DEATH_DESCRIPTORS_PTR);
        const bl = g8(g, m + 4) & 7;
        di = g16(g, di + bl * 2);
        const sel = g8(g, SWORD_HIT_TYPE) === 2 ? 0 : getRandom(g) & 3;
        return g8(g, di + sel);
    };

    if ((g8(g, m + 4) & 1) === 0 && (g8(g, m + 7) & 0x10) !== 0) {
        // big monster
        if ((g8(g, m + 16 + 7) & 0x0f) !== 0) {
            monsterSplitOrDie(g, m);
            return;
        }
        const al2 = pickDeathDescriptor();
        s8(g, m + 16 + 7, (g8(g, m + 16 + 7) & 0xf0) | al2);
        monsterSplitOrDie(g, m);
        return;
    }
    if ((g8(g, m + 7) & 0x0f) !== 0) {
        monsterSplitOrDie(g, m);
        return;
    }
    const al2 = pickDeathDescriptor();
    s8(g, m + 7, (g8(g, m + 7) & 0xf0) | (al2 & 0x0f));
    monsterSplitOrDie(g, m);
}
