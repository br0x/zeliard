/*
 * Monster AI for the 5 monster types handled by EAI8.
 *
 * Translation conventions follow eai6.c:
 * - m is the monster pointer (the original SI).
 * - monster structs are 16 bytes; type 0 controls a passive twin at m+0x10.
 * - shared C movement helpers return nonzero when movement succeeds, whereas
 *   many original asm callers tested CF where CF=1 meant blocked.  Those tests
 *   are inverted explicitly below.
 * - helpers translated from sub_A72B/sub_A75D preserve AL/AH/CF explicitly.
 */

#include "zeliard.h"

typedef struct {
    uint8_t value;     /* AL */
    uint8_t distance;  /* AH */
    int carry;         /* CF */
} ProxResult8;

static void type0_ai(uint16_t m);
static void type1_ai(uint16_t m);
static void type2_ai(uint16_t m);
static void type3_ai(uint16_t m);
static void type4_ai(uint16_t m);

static void type0_anim_step(uint16_t m);                 /* sub_A343 */
static int  type0_move_east(uint16_t m);                 /* sub_A379: 1=blocked */
static int  type0_check_east(uint16_t m);                /* sub_A39F: 1=blocked */
static int  type0_move_west(uint16_t m);                 /* sub_A3FE: 1=blocked */
static int  type0_check_west(uint16_t m);                /* sub_A424: 1=blocked */
static void type0_sync_twin(uint16_t m);                 /* loc_A352 */
static void type0_hit(uint16_t m);                       /* loc_A365 */

static void type3_update_facing_and_maybe_fire(uint16_t m); /* sub_A5FE */
static uint8_t type3_anim_step(uint16_t m);                 /* sub_A680 */
static void type3_fire_tick(uint16_t m);                    /* loc_A620 */

static ProxResult8 proximity_8(uint16_t m);               /* sub_A72B */
static ProxResult8 proximity_5(uint16_t m);               /* sub_A75D */

static const uint8_t type4_dir_right[8] = { 0, 0, 1, 0, 0, 0, 7, 0 }; /* unk_A71B */
static const uint8_t type4_dir_left[8]  = { 4, 4, 3, 4, 4, 4, 5, 4 }; /* unk_A723 */

/* Projectile descriptors from byte_A666 and byte_A673.  X/Y are patched
 * immediately before Add_Projectile_To_Array(). */
static uint8_t type3_shot_right[13] = {
    0, 0, 0x2A, 0, 0x12, 0, 0x50, 0, 0, 0, 0, 0, 0
};
static uint8_t type3_shot_left[13] = {
    0, 0, 0x2B, 0, 0x12, 4, 1, 0, 0, 0, 0, 0, 0
};

void Monster_AI_8(uint16_t m)
{
    switch (MEM8(m + 4) & 0x0F) {
        case 0: type0_ai(m); return;
        case 1: type1_ai(m); return;
        case 2: type2_ai(m); return;
        case 3: type3_ai(m); return;
        case 4: type4_ai(m); return;
        default: return;
    }
}

/* ------------------------------------------------------------------------- */
/* Type 0: large two-slot monster.  The second slot is passive. */

static void type1_ai(uint16_t m)
{
    (void)m;
}

static void type0_ai(uint16_t m)
{
    if (MEM8(m + 8) == 0)
        MEM8(m + 8) = 0x64;

    if (MEM8(m + 5) & 0x20) {
        type0_hit(m);
        return;
    }

    /* twin.ai_flags: clear bit 0x40 every frame */
    MEM8(m + 0x15) &= 0xBF;

    if (!(MEM8(m + 9) & 1)) {
        /* add 0x80; call sub_A343 only on 8-bit carry */
        uint8_t old = MEM8(m + 6);
        MEM8(m + 6) = (uint8_t)(old + 0x80);
        if (old & 0x80)
            type0_anim_step(m);

        MEM8(m + 0x0A) = 0;

        ProxResult8 pr = proximity_5(m);
        if (!pr.carry) {
            if (pr.value != 0xFF) {
                MEM8(m + 5) &= 0x7F;
                MEM8(m + 5) |= pr.value;
            }
        } else if (pr.distance < 0x0F) {
            MEM8(m + 9) |= 1;
        }

        type0_sync_twin(m);
        return;
    }

    /* charging / walking burst */
    MEM8(m + 0x0A)++;
    if (MEM8(m + 0x0A) == 0x10) {
        MEM8(m + 9) &= 0xFE;
        type0_sync_twin(m);
        return;
    }

    if (!(MEM8(m + 5) & 0x80)) {
        if (type0_move_west(m)) {
            MEM8(m + 9) &= 0xFE;
            type0_sync_twin(m);
            return;
        }
    } else {
        if (type0_move_east(m)) {
            MEM8(m + 9) &= 0xFE;
            type0_sync_twin(m);
            return;
        }
    }

    type0_anim_step(m);
    type0_sync_twin(m);
}

static void type0_anim_step(uint16_t m)
{
    MEM8(m + 6)++;
    if (MEM8(m + 6) >= 6)
        MEM8(m + 6) = 0;
}

static void type0_sync_twin(uint16_t m)
{
    MEM8(m + 0x16) = MEM8(m + 6); /* twin.anim_counter */

    uint8_t facing = MEM8(m + 5) & 0x80;
    MEM8(m + 0x15) = (uint8_t)((MEM8(m + 0x15) & 0x7F) | facing);
}

static void type0_hit(uint16_t m)
{
    uint8_t al = MEM8(m + 5);
    al = (uint8_t)((al & 0xBF) | 0x20);
    MEM8(m + 5) = al;
    MEM8(m + 0x15) = (uint8_t)(al | 0x60);
    Hero_Hits_monster(m);
}

static int type0_move_east(uint16_t m)
{
    if (MEM8(m + 3) >= 0x22)
        return 1;

    if (type0_check_east(m))
        return 1;

    uint16_t x = (uint16_t)(MEM16(m) + 1);
    if (x == MEM16(ADDR_MAP_WIDTH))
        x = 0;

    MEM16(m) = x;
    MEM16(m + 0x10) = x;
    MEM8(m + 3)++;
    MEM8(m + 0x13)++;
    return 0;
}

static int type0_check_east(uint16_t m)
{
    uint16_t addr = (uint16_t)(coords_to_prox_addr(MEM8(m + 3), MEM8(m + 2)) + 2);

    for (int i = 0; i < 4; ++i) {
        if (is_blocking(MEM8(addr)))
            return 1;
        addr += 36;
        wrap_map_from_above(&addr);
    }

    addr -= 36;
    wrap_map_from_below(&addr);

    uint8_t al = MEM8(addr);
    for (int i = 0; i < 4; ++i) {
        addr -= 36;
        wrap_map_from_below(&addr);
        al |= MEM8(addr);
    }

    return (al & 0x80) != 0;
}

static int type0_move_west(uint16_t m)
{
    if (MEM8(m + 3) < 2)
        return 1;

    if (type0_check_west(m))
        return 1;

    uint16_t x = (uint16_t)(MEM16(m) - 1);
    if (x == 0xFFFF)
        x = (uint16_t)(MEM16(ADDR_MAP_WIDTH) - 1);

    MEM16(m) = x;
    MEM16(m + 0x10) = x;
    MEM8(m + 3)--;
    MEM8(m + 0x13)--;
    return 0;
}

static int type0_check_west(uint16_t m)
{
    uint16_t addr = (uint16_t)(coords_to_prox_addr(MEM8(m + 3), MEM8(m + 2)) - 1);

    for (int i = 0; i < 4; ++i) {
        if (is_blocking(MEM8(addr)))
            return 1;
        addr += 36;
        wrap_map_from_above(&addr);
    }

    addr--;
    addr -= 36;
    wrap_map_from_below(&addr);

    uint8_t al = MEM8(addr);
    for (int i = 0; i < 4; ++i) {
        addr -= 36;
        wrap_map_from_below(&addr);
        al |= MEM8(addr);
    }

    return (al & 0x80) != 0;
}

/* ------------------------------------------------------------------------- */
/* Type 2: grounded horizontal mover. */

static void type2_ai(uint16_t m)
{
    if (MEM8(m + 8) == 0)
        MEM8(m + 8) = 0x30;

    if (MEM8(m + 5) & 0x20) {
        Hero_Hits_monster(m);
        return;
    }

    /* Original continues only when downward movement is blocked. */
    if (move_monster_S(m))
        return;

    if (!(MEM8(m + 9) & 1)) {
        ProxResult8 pr = proximity_5(m);
        MEM8(m + 9) = pr.carry ? 1 : 0;

        if (pr.value != 0xFF) {
            MEM8(m + 5) &= 0x7F;
            MEM8(m + 5) |= pr.value;
        }

        uint8_t old = MEM8(m + 6);
        MEM8(m + 6) = (uint8_t)(old + 0x80);
        if (!(old & 0x80))
            return;

        MEM8(m + 6) = (uint8_t)((MEM8(m + 6) + 1) & 7);

        if (!(MEM8(m + 5) & 0x80)) {
            if (!move_monster_W(m)) {
                MEM8(m + 9) = 0;
                MEM8(m + 5) ^= 0x80;
                return;
            }
            MEM8(m + 5) &= 0x7F;
        } else {
            if (!move_monster_E(m)) {
                MEM8(m + 9) = 0;
                MEM8(m + 5) ^= 0x80;
                return;
            }
            MEM8(m + 5) |= 0x80;
        }
        return;
    }

    MEM8(m + 0x0A)--;
    if ((MEM8(m + 0x0A) & 3) == 0) {
        ProxResult8 pr = proximity_5(m);
        MEM8(m + 9) = pr.carry ? 1 : 0;
        if (pr.value != 0xFF) {
            MEM8(m + 5) &= 0x7F;
            MEM8(m + 5) |= pr.value;
        }
    }

    MEM8(m + 6) = (uint8_t)((MEM8(m + 6) + 1) & 7);

    if (!(MEM8(m + 5) & 0x80)) {
        if (!move_monster_W(m)) {
            MEM8(m + 9) = 0;
            return;
        }
        MEM8(m + 5) &= 0x7F;
    } else {
        if (!move_monster_E(m)) {
            MEM8(m + 9) = 0;
            return;
        }
        MEM8(m + 5) |= 0x80;
    }
}

/* ------------------------------------------------------------------------- */
/* Type 3: grounded walker with a short projectile attack sequence. */

static void type3_ai(uint16_t m)
{
    if (MEM8(m + 8) == 0)
        MEM8(m + 8) = 0x40;

    if (MEM8(m + 5) & 0x20) {
        Hero_Hits_monster(m);
        return;
    }

    if (move_monster_S(m))
        return;

    if (MEM8(m + 9) & 4) {
        type3_fire_tick(m);
        return;
    }

    if (!(MEM8(m + 9) & 1)) {
        type3_update_facing_and_maybe_fire(m);

        uint8_t old = MEM8(m + 6);
        MEM8(m + 6) = (uint8_t)(old + 0x80);
        if (!(old & 0x80))
            return;

        if (type3_anim_step(m) != 0)
            return;

        if ((get_random() & 3) == 0) {
            MEM8(m + 9) = 1;
            MEM8(m + 0x0A) = 0;
        }
        return;
    }

    if (MEM8(m + 9) & 2) {
        MEM8(m + 9) &= 0xFE;
        MEM8(m + 6) = 0;
        return;
    }

    type3_anim_step(m);
    MEM8(m + 0x0A)++;
    if (MEM8(m + 0x0A) != 8)
        return;

    MEM8(m + 9) |= 2;

    /* The original code computes/wraps a proximity-map address here but then
     * reads [DI] after XCHG DI,SI, which is the monster struct's first byte.
     * Preserve that observable instruction semantics rather than silently
     * replacing it with an inferred tile lookup. */
    uint8_t probe = MEM8(m);

    if ((int8_t)get_random() >= 0) {
        if (is_blocking(probe))
            move_monster_E(m);
        else
            move_monster_W(m);
    } else {
        if (is_blocking(probe))
            move_monster_W(m);
        else
            move_monster_E(m);
    }
}

static void type3_update_facing_and_maybe_fire(uint16_t m)
{
    ProxResult8 pr = proximity_5(m);
    if (pr.value == 0xFF)
        return;

    MEM8(m + 5) &= 0x7F;
    MEM8(m + 5) |= pr.value;

    if ((get_random() & 7) == 0) {
        MEM8(m + 9) |= 4;
        MEM8(m + 0x0A) = 0;
    }
}

static uint8_t type3_anim_step(uint16_t m)
{
    uint8_t al = (uint8_t)(MEM8(m + 6) + 1);
    if (al >= 3)
        al = 0;
    MEM8(m + 6) = al;
    return al;
}

static void type3_fire_tick(uint16_t m)
{
    MEM8(m + 6) = 3;
    MEM8(m + 0x0A)++;
    if (MEM8(m + 0x0A) != 3)
        return;

    MEM8(m + 6) = 4;

    uint8_t x = MEM8(m + 3);
    uint8_t y = (uint8_t)(MEM8(m + 2) & 0x3F);

    type3_shot_left[0] = x;
    type3_shot_right[0] = (uint8_t)(x + 1);
    type3_shot_left[1] = y;
    type3_shot_right[1] = y;

    Add_Projectile_To_Array((MEM8(m + 5) & 0x80) ? type3_shot_right : type3_shot_left);

    MEM8(m + 9) &= 0xFB;
    MEM8(m + 9) |= 2;
    MEM8(m + 0x0A) = 0;
}

/* ------------------------------------------------------------------------- */
/* Type 4: hovering seeker, structurally similar to EAI6 type 2. */

static void type4_ai(uint16_t m)
{
    if (MEM8(m + 8) == 0)
        MEM8(m + 8) = 0x60;

    if (MEM8(m + 5) & 0x20) {
        Hero_Hits_monster(m);
        return;
    }

    MEM8(m + 6)++;
    MEM8(m + 6) &= 3;

    uint8_t old_timer = MEM8(m + 0x0A);
    MEM8(m + 0x0A) = (uint8_t)(old_timer + 0x80);
    if (!(old_timer & 0x80))
        return;

    ProxResult8 pr = proximity_8(m);

    if (!pr.carry) {
        if (!(MEM8(m + 9) & 0x70)) {
            if (pr.value == 0xFF) {
                uint8_t facing = (uint8_t)((get_random() << 1) & 0x80);
                MEM8(m + 5) = (uint8_t)((MEM8(m + 5) & 0x7F) | facing);
            } else {
                MEM8(m + 5) = (uint8_t)((MEM8(m + 5) & 0x7F) | pr.value);
            }
        }

        uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m + 2));
        if ((int8_t)dy < 0)
            move_monster_N(m);
        else
            move_monster_S(m);
    } else {
        uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m + 2));
        if ((int8_t)dy < 0)
            move_monster_N(m);
        else
            move_monster_S(m);
    }

    MEM8(m + 9) = (uint8_t)(MEM8(m + 9) + 0x10);
    uint8_t idx = (uint8_t)((MEM8(m + 9) >> 4) & 7);
    const uint8_t *table = (MEM8(m + 5) & 0x80) ? type4_dir_right : type4_dir_left;

    if (!monster_move_in_direction(m, table[idx]))
        MEM8(m + 5) ^= 0x80;
}

/* ------------------------------------------------------------------------- */
/* Shared proximity/facing helpers. */

static ProxResult8 proximity_8(uint16_t m)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m + 2));
    uint8_t abs_dy = ((int8_t)dy < 0) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= 8)
        return (ProxResult8){ 0xFF, 0, 0 };

    uint8_t al = (uint8_t)(0x10 - MEM8(m + 3));
    if ((int8_t)al >= 0) {
        uint8_t ah = al;
        int cf = (MEM8(m + 5) & 0x80) != 0;
        return (ProxResult8){ 0x80, ah, cf };
    }

    /* Unlike sub_A75D, sub_A72B does not negate AL in this branch and does
     * not assign AH before returning.  AH is irrelevant to all EAI8 callers. */
    int cf = (MEM8(m + 5) & 0x80) == 0;
    return (ProxResult8){ 0x00, 0, cf };
}

static ProxResult8 proximity_5(uint16_t m)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m + 2));
    uint8_t abs_dy = ((int8_t)dy < 0) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= 5)
        return (ProxResult8){ 0xFF, 0, 0 };

    uint8_t al = (uint8_t)(0x11 - MEM8(m + 3));
    if ((int8_t)al >= 0) {
        uint8_t ah = al;
        int cf = (MEM8(m + 5) & 0x80) != 0;
        return (ProxResult8){ 0x80, ah, cf };
    }

    al = (uint8_t)(-al);
    uint8_t ah = al;
    int cf = (MEM8(m + 5) & 0x80) == 0;
    return (ProxResult8){ 0x00, ah, cf };
}
