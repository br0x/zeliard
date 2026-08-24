/**
 * dungeon-items.ts — TS port of dungeon.c's item/chest dispatch and the
 * per-frame monster spawn tick (Stage 8c, slice 3).
 *
 * Ports, 1:1 from src/dungeon.c:
 *   - render_notification_string            (3039)
 *   - Print_Gold_Decimal / Print_Almas_Decimal / res_dispatcher_fn4 /
 *     Render_Sword_Item_Sprite_20x18        (render-request writers)
 *   - hero_got_gold                         (3053)
 *   - monsters_spawning                     (3067) — main AI tick
 *   - mark_collected                        (3146)
 *   - pickup_common                         (3155)
 *   - put_shoes_to_inventory                (3166)
 *   - flag_10                               (3174)  drop-item trigger
 *   - flag_11                               (3205)  projectile spawner
 *   - flag_12                               (3242)  delay animation
 *   - flag_13                               (3250)  item pickup + chest gold
 *   - flag_14_15_1b                         (3301)  almas orbs
 *   - flag_16 / flag_17                     (3320)  keys
 *   - flag_18 / flag_19                     (3334)  potions
 *   - flag_1a                               (3410)  cavern shoes
 *   - flag_1c                               (3352)  dungeon sign
 *   - flag_1d / flag_1e                     (3368)  crest / Feruza shoes
 *   - default_0toF_handler                  (3433)  chest animation dispatch
 *   - place_monster_in_proximity_and_run_ai (3420 doc; body ~3510)
 *
 * The per-monster AI bodies (eai1..eai8.c) arrive in Stage 9 and are
 * injected here as a `monsterAi` callback.
 */

import {
    coordsToProxAddr,
    monsterMoveInDirection,
    wrapMapFromAbove,
} from './dungeon-entities.js';
import {
    checkMonsterAlignedToHeroAndTick,
    isInProximityWindow,
    monsterActivation,
} from './dungeon-monsters.js';

const PROX_COLS = 36;

// g_mem addresses
const HERO_XV = 0x83;
const HERO_GOLD_HI = 0x85;
const HERO_GOLD_LO = 0x86; // word
const HERO_LEVEL_UNUSED = 0x8d;
void HERO_LEVEL_UNUSED;
const SWORD_TYPE = 0x92;
const CREST_OF_GLORY = 0x9b;
const FERUZA_SHOES = 0xa1; // 0-terminated accessory array
const HERO_MAX_HP = 0xb2; // word
const HEALING_TIMER = 0xc6; // word
const FACING = 0xc2;
const LEFT_FLAG = 1;
const IS_JASHIIN_CAVERN = 0xe6;
const ANIM_TIMER_HI_UNUSED = 0xff1c;
void ANIM_TIMER_HI_UNUSED;
const MONSTERS_LIST = 0xc010; // word pointer
const CAVERN_LEVEL = 0xc012;
const PROXIMITY_LAYER2 = 0xed20;
const HERO_Y = 0xff35;
const IS_BOSS_CAVERN = 0xff34;
const MONSTER_INDEX = 0xff4a;
const SOUND_FX_REQUEST = 0xff75;
const GOLD_RENDER_REQUEST = 0xff94;
const NOTIFICATION_MSG_ID = 0xff96;
const NOTIFICATION_FLAG = 0xff97;
const ALMAS_RENDER_REQUEST = 0xff98;
const CAVERN_SIGN_FLAG = 0xffa1;
const CAVERN_SIGN_IDX = 0xffa2;
const SWORD_RENDER_REQUEST = 0xffa4;
const SWORD_GFX_RELOAD_REQUEST = 0xffa5;

/** Notification string ids (zeliard.h). */
export const STR = {
    YOU_GET_50_GOLD: 1,
    YOU_GET_100_GOLD: 2,
    YOU_GET_500_GOLD: 3,
    YOU_GET_1000_GOLD: 4,
    YOU_GET_KEY: 5,
    YOU_HAVE_RECOVERED: 6,
    YOU_HAVE_RECOVERED_FULL: 7,
    SHIELD_BROKEN: 8,
    CANT_OPEN_THIS_DOOR: 9,
    NOTHING_IN_THE_BOX: 10,
    GET_HEROS_CREST: 11,
    GET_RUZERIA_SHOES: 12,
    YOU_GET_GLORY_CREST: 13,
    GET_PIRIKA_SHOES: 14,
    GET_FERUZA_SHOES: 15,
    GET_SILKARN_SHOES: 16,
    GET_ENCHANTMENT_SWORD: 17,
    ITS_TOO_HOT: 18,
    GET_LIONS_HEAD_KEY: 19,
    JASHIIN_FINALLY: 20,
} as const;

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

/** move one tile south (move_monster_S = direction 6). */
function moveMonsterS(g: Uint8Array, m: number): number {
    return monsterMoveInDirection(g, m, 6);
}

// ─── render-request writers ───

export function renderNotificationString(g: Uint8Array, strIdx: number): void {
    s8(g, NOTIFICATION_MSG_ID, strIdx);
    s8(g, NOTIFICATION_FLAG, 0xff);
}

function printGoldDecimal(g: Uint8Array): void {
    s8(g, GOLD_RENDER_REQUEST, 0xff);
}

function printAlmasDecimal(g: Uint8Array): void {
    s8(g, ALMAS_RENDER_REQUEST, 0xff);
}

function signalEnchantmentSwordGfx(g: Uint8Array): void {
    s8(g, SWORD_GFX_RELOAD_REQUEST, 0xff);
}

function renderSwordItemSprite(g: Uint8Array): void {
    s8(g, SWORD_RENDER_REQUEST, 0xff);
}

// ─── gold / almas ───

/** hero_got_gold (dungeon.c:3053): 32-bit gold += ax with carry. */
export function heroGotGold(g: Uint8Array, ax: number): void {
    const lo = (g16(g, HERO_GOLD_LO) + ax) & 0xffff;
    s16(g, HERO_GOLD_LO, lo);
    if (lo < (ax & 0xffff)) {
        s8(g, HERO_GOLD_HI, (g8(g, HERO_GOLD_HI) + 1) & 0xff);
    }
    printGoldDecimal(g);
}

function heroGotAlmas(g: Uint8Array, amount: number): void {
    const almas = g16(g, 0x8b); // ADDR_HERO_ALMAS word
    let next: number;
    if (amount > ((0xffff - almas) & 0xffff)) {
        next = 0xffff;
    } else {
        next = (almas + amount) & 0xffff;
    }
    s16(g, 0x8b, next);
    printAlmasDecimal(g);
}

// ─── collection helpers ───

/** mark_collected (dungeon.c:3146). */
export function markCollected(g: Uint8Array, m: number): void {
    s16(g, m, 0xff00);
    if ((g8(g, m + 7) & 0x20) !== 0) {
        const addr = g16(g, m + 11); // spwnX is a save-flag ADDRESS here
        if (addr !== 0xffff) {
            s8(g, addr, (g8(g, addr) | g8(g, m + 13)) & 0xff);
            s16(g, m + 11, 0xffff);
        }
    }
}

/** pickup_common (dungeon.c:3155): move south, gate on alignment, notify. */
function pickupCommon(g: Uint8Array, m: number, msgId: number): number {
    moveMonsterS(g, m);
    if (checkMonsterAlignedToHeroAndTick(g, m) !== 0) return 0;

    s8(g, SOUND_FX_REQUEST, 17);
    renderNotificationString(g, msgId);
    return 0xff;
}

/** put_shoes_to_inventory (dungeon.c:3166). */
function putShoesToInventory(g: Uint8Array, m: number, shoeType: number): void {
    let slot = FERUZA_SHOES;
    while (g8(g, slot) !== 0) slot++;
    s8(g, slot, shoeType);
    markCollected(g, m);
}

// ─── item handlers ───

/** flag_10 (dungeon.c:3174): drop-item trigger. */
export function flag10(g: Uint8Array, m: number): void {
    if ((g8(g, m + 10) & 1) === 0) {
        if ((g8(g, m + 5) & 0x20) === 0) return;

        s8(g, SOUND_FX_REQUEST, 18);
        s8(g, m + 5, g8(g, m + 5) & 0x90);
        s8(g, m + 4, g8(g, m + 4) & 0x7f);
        s8(g, m + 4, g8(g, m + 4) | 0x60);
        s8(g, m + 10, g8(g, m + 10) | 1);
    }

    // Animate
    s8(g, m + 6, (g8(g, m + 6) + 0x80) & 0xff);
    if ((g8(g, m + 6) & 0x80) === 0) {
        s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
        if (g8(g, m + 6) >= 4) {
            s8(g, m + 6, 0);
            let aiState = g8(g, m + 9);
            if (aiState !== 0) {
                if ((aiState & 0x10) !== 0) {
                    aiState |= 0x60; // NOTE: local var only, never stored (asm-faithful)
                    s8(g, m + 7, g8(g, m + 7) | 0x80);
                    s8(g, m + 15, 0);
                }
                s8(g, m + 4, aiState);
                s8(g, m + 5, g8(g, m + 5) & 0x80);
                s8(g, m + 9, 0);
            } else {
                markCollected(g, m);
            }
        }
    }
}

/** flag_11 (dungeon.c:3205): projectile spawner aimed at the hero's row. */
export function flag11(g: Uint8Array, m: number): void {
    if ((g8(g, m + 10) & 1) === 0) {
        const ah = (g8(g, m + 2) - 3) & 0x3f;
        if (ah !== g8(g, HERO_Y)) return;

        // item under hero feet
        let al = (g8(g, HERO_XV) + 3) & 0xff;
        al += ((g8(g, FACING) & LEFT_FLAG) !== 0 ? 1 : 0) * 2;

        for (let i = 0; i < 2; i++) {
            if (al === g8(g, m + 3)) {
                s8(g, SOUND_FX_REQUEST, 18);
                s8(g, m + 10, g8(g, m + 10) | 1);
                return;
            }
            al++;
        }
        return;
    }

    // armed: move south, animate
    s8(g, m + 4, g8(g, m + 4) & 0x7f);
    moveMonsterS(g, m);
    s8(g, m + 6, (g8(g, m + 6) + 0x80) & 0xff);
    if ((g8(g, m + 6) & 0x80) === 0) {
        s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
        if (g8(g, m + 6) >= 4) {
            s8(g, m + 6, 0);
            markCollected(g, m);
        }
    }
}

/** flag_12 (dungeon.c:3242): delay animation. */
export function flag12(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
    if (g8(g, m + 6) === 3) markCollected(g, m);
}

/** flag_13 (dungeon.c:3250): item pickup (contact collision) + chests. */
export function flag13(g: Uint8Array, m: number): void {
    if (checkMonsterAlignedToHeroAndTick(g, m) !== 0) return;

    s8(g, SOUND_FX_REQUEST, 20);
    if ((g8(g, m + 6) & 0x0f) === 0) {
        let aiState = g8(g, m + 9);
        if ((aiState & 0x10) !== 0) {
            aiState |= 0x60; // local only (asm-faithful)
            s8(g, m + 7, g8(g, m + 7) | 0x80);
            s8(g, m + 15, 0);
        }
        s8(g, m + 4, aiState);
        s8(g, m + 9, 0);
        return;
    }
    // chest
    markCollected(g, m);
    const chestType = g8(g, m + 6) & 0x0f;
    switch (chestType) {
        case 1:
            renderNotificationString(g, STR.YOU_GET_50_GOLD);
            heroGotGold(g, 50);
            break;
        case 2:
            renderNotificationString(g, STR.YOU_GET_100_GOLD);
            heroGotGold(g, 100);
            break;
        case 3:
            renderNotificationString(g, STR.NOTHING_IN_THE_BOX);
            break;
        case 4:
            renderNotificationString(g, STR.YOU_GET_500_GOLD);
            heroGotGold(g, 500);
            break;
        case 5:
            renderNotificationString(g, STR.YOU_GET_1000_GOLD);
            heroGotGold(g, 1000);
            break;
        case 6:
            renderNotificationString(g, STR.YOU_GET_GLORY_CREST);
            s8(g, CREST_OF_GLORY, 0xff);
            break;
        case 7: {
            renderNotificationString(g, STR.GET_ENCHANTMENT_SWORD);
            s8(g, SWORD_TYPE, 6);
            renderSwordItemSprite(g);
            signalEnchantmentSwordGfx(g);
            break;
        }
        default:
            break;
    }
}

/** flag_14_15_1b (dungeon.c:3301): falling almas orbs. */
export function flag14_15_1b(g: Uint8Array, m: number): void {
    moveMonsterS(g, m);
    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
    s8(g, m + 6, g8(g, m + 6) & 3);

    if (checkMonsterAlignedToHeroAndTick(g, m) !== 0) return;

    s8(g, SOUND_FX_REQUEST, 16);
    const price = g8(g, m + 4) & 0x0f;
    if (price === 4) heroGotAlmas(g, 1);
    else if (price === 5) heroGotAlmas(g, 10);
    else heroGotAlmas(g, 100);

    markCollected(g, m);
}

/** flag_16 (dungeon.c:3320): ordinary key. */
export function flag16(g: Uint8Array, m: number): void {
    if (pickupCommon(g, m, STR.YOU_GET_KEY) === 0) return;
    s8(g, 0x98 /* KEYS_AMOUNT */, (g8(g, 0x98) + 1) & 0xff);
    markCollected(g, m);
}

/** flag_17 (dungeon.c:3328): lion's head key. */
export function flag17(g: Uint8Array, m: number): void {
    if (pickupCommon(g, m, STR.GET_LIONS_HEAD_KEY) === 0) return;
    s8(g, 0x99 /* LION_KEYS_AMOUNT */, (g8(g, 0x99) + 1) & 0xff);
    markCollected(g, m);
}

/** flag_18 (dungeon.c:3334): small potion (red). */
export function flag18(g: Uint8Array, m: number): void {
    if (checkMonsterAlignedToHeroAndTick(g, m) !== 0) return;
    renderNotificationString(g, STR.YOU_HAVE_RECOVERED);
    s8(g, 0xc6 /* HEALING_TIMER lo */, (g8(g, 0xc6) + 10) & 0xff); // byte access in original!
    markCollected(g, m);
}

/** flag_19 (dungeon.c:3342): large potion (blue). */
export function flag19(g: Uint8Array, m: number): void {
    moveMonsterS(g, m);
    if (checkMonsterAlignedToHeroAndTick(g, m) !== 0) return;
    renderNotificationString(g, STR.YOU_HAVE_RECOVERED_FULL);
    const amount = ((g16(g, HERO_MAX_HP) >> 3) + 1) & 0xffff;
    s16(g, HEALING_TIMER, (g16(g, HEALING_TIMER) + amount) & 0xffff);
    markCollected(g, m);
}

/** flag_1c (dungeon.c:3352): dungeon sign display/timeout. */
export function flag1c(g: Uint8Array, m: number): void {
    s8(g, m + 15, 0);
    if ((g8(g, m + 9) & 1) === 0) {
        if (checkMonsterAlignedToHeroAndTick(g, m) !== 0) return;

        s8(g, SOUND_FX_REQUEST, 17);
        s8(g, m + 7, g8(g, m + 7) | 0x80);
        s8(g, m + 9, g8(g, m + 9) | 1);
        s8(g, m + 10, 235);
        const idx = g8(g, m + 6);
        renderCavernSigns(g, idx);
    } else {
        if (g8(g, m + 10) === 0) {
            s8(g, m + 9, g8(g, m + 9) & ~1);
            s8(g, CAVERN_SIGN_FLAG, 0);
        } else {
            s8(g, m + 10, (g8(g, m + 10) + 1) & 0xff);
        }
    }
}

function renderCavernSigns(g: Uint8Array, idx: number): void {
    s8(g, CAVERN_SIGN_IDX, idx);
    s8(g, CAVERN_SIGN_FLAG, 0xff);
}

/** flag_1d (dungeon.c:3368): hero's crest. */
export function flag1d(g: Uint8Array, m: number): void {
    if (pickupCommon(g, m, STR.GET_HEROS_CREST) === 0) return;
    s8(g, CREST_OF_GLORY, 0xff);
    markCollected(g, m);
}

/** flag_1e (dungeon.c:3376): Feruza shoes pickup. */
export function flag1e(g: Uint8Array, m: number): void {
    if (pickupCommon(g, m, STR.GET_FERUZA_SHOES) === 0) return;
    putShoesToInventory(g, m, 1);
}

/** flag_1a (dungeon.c:3384): cavern-level-dependent shoes. */
export function flag1a(g: Uint8Array, m: number): void {
    const level = (g8(g, CAVERN_LEVEL) - 4) & 0xff;
    let shoeStr: number;
    let shoeType: number;

    switch (level) {
        case 0:
            shoeType = 4;
            shoeStr = STR.GET_RUZERIA_SHOES;
            break;
        case 1:
            shoeType = 2;
            shoeStr = STR.GET_PIRIKA_SHOES;
            break;
        default:
            shoeType = 3;
            shoeStr = STR.GET_SILKARN_SHOES;
            break;
    }

    if (pickupCommon(g, m, shoeStr) === 0) return;
    putShoesToInventory(g, m, shoeType);
}

/**
 * default_0toF_handler (dungeon.c:3433): chest animation dispatch with the
 * sub-type state machine (gold amounts, glory crest, enchantment sword).
 */
export function default0toFHandler(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 0x80) & 0xff);
    if ((g8(g, m + 6) & 0x80) !== 0) return;

    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
    if (g8(g, m + 6) !== 3) return;

    s8(g, m + 15, 0);
    if ((g8(g, m + 7) & 0x40) !== 0) {
        s8(g, m + 7, g8(g, m + 7) & ~0x40);
        // reset another monster (index from ai_timer)
        const idx = g8(g, m + 10);
        const other = (g16(g, MONSTERS_LIST) + idx * 16) & 0xffff;
        s8(g, other + 2, 0);
    }
    if ((g8(g, m + 7) & 0x10) === 0 || (g8(g, m + 4) & 1) !== 0) {
        s8(g, m + 6, 0);
        s8(g, m + 4, 0x72);
        const stateNibble = g8(g, m + 7) & 0x0f;
        if (stateNibble === 0) return;
        if (stateNibble === 1) {
            markCollected(g, m);
            return;
        }
        s8(g, m + 7, g8(g, m + 7) | 0x80);
        s8(g, m + 15, 4);
        s8(g, m + 4, stateNibble);
        s8(g, m + 5, g8(g, m + 5) & 0x80);
        s8(g, m + 7, g8(g, m + 7) & 0xf0);
    } else {
        markCollected(g, m);
    }
}

// ─── dispatcher + spawn tick ───

export type MonsterAiFn = (g: Uint8Array, m: number) => void;

/**
 * place_monster_in_proximity_and_run_ai: stamps the monster into the
 * proximity map (restoring layer-2 backups), then runs its AI or dispatches
 * the item/chest handler by flags bits 4:0.
 */
export function placeMonsterInProximityAndRunAi(
    g: Uint8Array,
    m: number,
    monsterAi: MonsterAiFn,
): void {
    const di = coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2));
    let al = g8(g, m + 5) & ~0x20;
    if ((al & 0x40) !== 0) {
        if ((g8(g, m + 4) & 0x20) === 0) al |= 0x20;
        al &= ~0x40;
    }
    s8(g, m + 5, al);
    const bl = g8(g, MONSTER_INDEX);

    // restore previously saved second-layer entry for this monster
    s8(g, di, g8(g, PROXIMITY_LAYER2 + bl));

    // big monster lower half restoration
    if ((g8(g, m + 4) & 0x11) === 0 && (g8(g, m + 7) & 0x10) !== 0) {
        const di2 = wrapMapFromAbove((di + 2 * PROX_COLS) & 0xffff);
        const bl2 = (g8(g, MONSTER_INDEX) + 1) & 0xff;
        s8(g, di2, g8(g, PROXIMITY_LAYER2 + bl2));
    }

    // run AI or handle items
    if ((g8(g, m + 4) & 0x18) === 0) {
        monsterAi(g, m);
        return;
    }

    const flags = g8(g, m + 4) & 0x1f;
    if (flags >= 0x10) {
        switch (flags) {
            case 0x10: flag10(g, m); break;
            case 0x11: flag11(g, m); break;
            case 0x12: flag12(g, m); break;
            case 0x13: flag13(g, m); break;
            case 0x14:
            case 0x15:
            case 0x1b: flag14_15_1b(g, m); break;
            case 0x16: flag16(g, m); break;
            case 0x17: flag17(g, m); break;
            case 0x18: flag18(g, m); break;
            case 0x19: flag19(g, m); break;
            case 0x1a: flag1a(g, m); break;
            case 0x1c: flag1c(g, m); break;
            case 0x1d: flag1d(g, m); break;
            case 0x1e: flag1e(g, m); break;
            default: break; // 0x1F
        }
    } else {
        default0toFHandler(g, m);
    }
}

/**
 * monsters_spawning (dungeon.c:3067): the per-frame monster tick — stamp
 * in-window monsters into the proximity map, run their AI, drive spawn
 * activation via counter overflow.
 */
export function monstersSpawning(
    g: Uint8Array,
    monsterAi: MonsterAiFn,
): void {
    let m = g16(g, MONSTERS_LIST);
    if (g8(g, IS_BOSS_CAVERN) !== 0 || g8(g, IS_JASHIIN_CAVERN) !== 0) {
        // entire AI handled by boss procedure
        monsterAi(g, m);
        return;
    }

    s8(g, MONSTER_INDEX, 0);

    for (;;) {
        const currX = g16(g, m);
        if (currX === 0xffff) return;

        s8(g, m + 3, 0xff); // m_x_rel: not in proximity yet

        if (((currX >> 8) & 0xff) !== 0xff) {
            const prox = isInProximityWindow(g, currX);
            if (prox.inside) {
                s8(g, m + 3, prox.xRel);
                placeMonsterInProximityAndRunAi(g, m, monsterAi);
                const cx = g16(g, m);
                if (((cx >> 8) & 0xff) !== 0xff) {
                    const y = g8(g, m + 2);
                    const relx = g8(g, m + 3);
                    const di = coordsToProxAddr(g, relx, y);
                    const bl = g8(g, MONSTER_INDEX);
                    const al = (bl | 0x80) & 0xff;
                    const old = g8(g, di);
                    s8(g, di, al);
                    s8(g, PROXIMITY_LAYER2 + bl, old);

                    // big monster lower half
                    if ((g8(g, m + 4) & 0x11) === 0 && (g8(g, m + 7) & 0x10) !== 0) {
                        const di2 = wrapMapFromAbove((di + 2 * PROX_COLS) & 0xffff);
                        const bl2 = (g8(g, MONSTER_INDEX) + 1) & 0xff;
                        const al2 = (bl2 | 0x80) & 0xff;
                        const old2 = g8(g, di2);
                        s8(g, di2, al2);
                        s8(g, PROXIMITY_LAYER2 + bl2, old2);
                    }
                }
            }
        }

        if ((g8(g, m + 7) & 0x20) === 0) {
            // not yet active: count down to activation via counter overflow
            const c = (g8(g, m + 15) + 1) & 0xff;
            if (c !== 0) {
                s8(g, m + 15, c);
            } else {
                monsterActivation(g, m);
            }
        }

        s8(g, MONSTER_INDEX, (g8(g, MONSTER_INDEX) + 1) & 0xff);
        m += 16;
    }
}
