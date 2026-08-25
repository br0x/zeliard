/*
 * Monster AI for the five monster slots handled by the EAI7 overlay.
 * The low nibble of monster.flags selects the behaviour:
 *
 *   0 -> paired ranged monster, active/top slot (HP 0x10)
 *   1 -> passive twin slot driven by type 0
 *   2 -> paired ranged monster, active/top slot (HP 0x40)
 *   3 -> passive twin slot driven by type 2
 *   4 -> grounded leaping monster (HP 8)
 *
 * Translation conventions follow eai6.c:
 *
 * - m is the original SI monster pointer. A monster record is 16 bytes.
 * - For paired monsters, m + 0x10 is the passive twin record. The active
 *   monster writes the twin's position, facing and animation directly.
 * - Local helpers translated from assembly routines whose callers use JB/JNB
 *   return the original carry flag: 1 means CF set, 0 means CF clear.
 * - Existing engine movement functions keep their established C convention:
 *   nonzero means the move succeeded, zero means it was blocked.
 * - Projectile descriptor byte 2 is remapped from the original raw tile IDs
 *   0x2f..0x32 to web-port projectile array indices 0..3, in tile order.
 */

#include "zeliard.h"


typedef struct {
    uint8_t value; /* AL on return */
    int carry;     /* CF on return */
} ProxResult;


/* Overlay-global preferred firing distances. The original stores these as
 * byte_A491/byte_A492 and shares them among all type-0 instances. */
static uint8_t type0_right_distance = 8;
static uint8_t type0_left_distance  = 8;

/* Test-only accessor (Stage 9e parity tests): pin both distances so the
 * wasm oracle and the TS port start each pass from identical state. */
void eai7_set_distances(uint8_t right, uint8_t left)
{
    type0_right_distance = right;
    type0_left_distance = left;
}


/* Type-4 trajectory tables (direction encoding:
 * 0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE). */
/* The original two seven-byte ledge tables are adjacent. XLAT can legally
 * use index 7 when ai_state bit 0x80 shifts the phase, thereby reading the
 * first byte of the following table. The eighth entries below encode that
 * deliberate overlap without invoking out-of-bounds C behaviour. */
static const uint8_t type4_ledge_right[8] = { 1, 1, 0, 0, 0, 7, 7, 3 }; /* A8B1 + A8B8[0] */
static const uint8_t type4_ledge_left[8]  = { 3, 3, 4, 4, 4, 5, 5, 2 }; /* A8B8 + A8BF[0] */
static const uint8_t type4_wall_right[8]  = { 2, 1, 1, 0, 0, 7, 7, 6 }; /* byte_A8BF */
static const uint8_t type4_wall_left[8]   = { 2, 3, 3, 4, 4, 5, 5, 6 }; /* byte_A8C7 */


/* Projectile descriptors. Bytes 0 and 1 are patched with X/Y before firing.
 * The original descriptor type bytes 0x2f..0x32 are raw sprite/tile IDs; the
 * web renderer expects an index into the dungeon's projectile definition list. */
enum {
    EAI7_PROJECTILE_2F = 0,
    EAI7_PROJECTILE_30 = 1,
    EAI7_PROJECTILE_31 = 2,
    EAI7_PROJECTILE_32 = 3,
};

static uint8_t type0_shot_right[13] = { 0, 0, EAI7_PROJECTILE_30, 0, 0x14, 0, 0x28, 0, 0, 0, 0, 0, 0 };
static uint8_t type0_shot_left[13]  = { 0, 0, EAI7_PROJECTILE_2F, 0, 0x14, 4, 0x28, 0, 0, 0, 0, 0, 0 };
static uint8_t type2_shot_right[13] = { 0, 0, EAI7_PROJECTILE_32, 0, 0x14, 0, 0x28, 0, 0, 0, 0, 0, 0 };
static uint8_t type2_shot_left[13]  = { 0, 0, EAI7_PROJECTILE_31, 0, 0x14, 4, 0x28, 0, 0, 0, 0, 0, 0 };


static void type0_ai(uint16_t m);
static void type2_ai(uint16_t m);
static void type4_ai(uint16_t m);
static void passive_twin_ai(uint16_t m);

static void paired_hit_reaction(uint16_t m);
static void paired_sync(uint16_t m);
static int paired_try_fall(uint16_t m);
static int paired_has_ground_below(uint16_t m);
static int paired_move_east(uint16_t m);
static int paired_move_west(uint16_t m);
static int paired_wall_or_ledge_east(uint16_t m);
static int paired_wall_or_ledge_west(uint16_t m);

static ProxResult proximity_and_facing_5(uint16_t m);
static ProxResult proximity_and_facing_6(uint16_t m);

static void type0_wander(uint16_t m);
static void type0_attack_tick(uint16_t m);
static void type0_fire(uint16_t m);
static void type0_prepare_attack(uint16_t m, uint8_t state_bits);

static void type2_wander(uint16_t m);
static void type2_attack_tick(uint16_t m);
static void type2_fire(uint16_t m);

static void type4_ground_step(uint16_t m);
static void type4_trajectory_step(uint16_t m);


void Monster_AI_7(uint16_t m)
{
    switch (MEM8(m + 4) & 0x0F) { /* .flags */
        case 0: type0_ai(m); return;
        case 1: passive_twin_ai(m); return;
        case 2: type2_ai(m); return;
        case 3: passive_twin_ai(m); return;
        case 4: type4_ai(m); return;
        default:
            /* The original jump table contains exactly five entries. */
            return;
    }
}


static void passive_twin_ai(uint16_t m)
{
    (void)m;
}


/* loc_A5F5 / loc_A71E: normalize a hit on a paired sprite and propagate the
 * active hit/death bits to its passive twin before invoking common combat. */
static void paired_hit_reaction(uint16_t m)
{
    uint8_t al = MEM8(m + 0x15);       /* twin.ai_flags */
    al = (uint8_t)((al & 0xBF) | 0x20);
    MEM8(m + 5) = al;                  /* active.ai_flags */
    MEM8(m + 0x15) = (uint8_t)(al | 0x60);
    Hero_Hits_monster(m);
}


/* loc_A47A / loc_A732: mirror animation and facing into the passive twin. */
static void paired_sync(uint16_t m)
{
    MEM8(m + 0x16) = MEM8(m + 6); /* twin.anim_counter */
    MEM8(m + 0x15) = (uint8_t)((MEM8(m + 0x15) & 0x7F) |
                               (MEM8(m + 5) & 0x80));
}


/* sub_A59D: return CF=1 if grounded (including proximity-map edges), or
 * CF=0 after moving both halves down by one row. */
static int paired_try_fall(uint16_t m)
{
    if (MEM8(m + 3) == 0 || MEM8(m + 3) == 0x23) return 1;
    if (paired_has_ground_below(m)) return 1;

    MEM8(m + 2) = (uint8_t)(MEM8(m + 2) + 1) & 0x3F;
    MEM8(m + 0x12) = (uint8_t)(MEM8(m + 0x12) + 1) & 0x3F;
    return 0;
}


/* sub_A5C3: inspect the two tiles four rows below the paired monster. */
static int paired_has_ground_below(uint16_t m)
{
    uint16_t addr = coords_to_prox_addr(MEM8(m + 3), MEM8(m + 2));
    addr = (uint16_t)(addr + 0x90); /* four rows in a 36-column map */
    wrap_map_from_above(&addr);

    if (is_blocking(MEM8(addr)) || is_blocking(MEM8(addr + 1))) return 1;

    return ((MEM8(addr) | MEM8(addr + 1)) & 0x80) != 0;
}


/* sub_A493: CF=1 means blocked, CF=0 means both halves moved east. */
static int paired_move_east(uint16_t m)
{
    if (MEM8(m + 3) >= 0x22) return 1;
    if (paired_wall_or_ledge_east(m)) return 1;

    uint16_t x = (uint16_t)(MEM16(m) + 1);
    if (x == MEM16(ADDR_MAP_WIDTH)) x = 0;

    MEM16(m) = x;
    MEM16(m + 0x10) = x;
    MEM8(m + 3)++;
    MEM8(m + 0x13)++;
    return 0;
}


/* sub_A4B9: four-tile wall scan, then a five-tile ledge/attribute scan. */
static int paired_wall_or_ledge_east(uint16_t m)
{
    uint16_t addr = (uint16_t)(coords_to_prox_addr(MEM8(m + 3), MEM8(m + 2)) + 2);

    for (int i = 0; i < 4; i++) {
        if (is_blocking(MEM8(addr))) return 1;
        addr = (uint16_t)(addr + 0x24);
        wrap_map_from_above(&addr);
    }

    uint8_t combined = 0;
    for (int i = 0; i < 5; i++) {
        addr = (uint16_t)(addr - 0x24);
        wrap_map_from_below(&addr);
        combined |= MEM8(addr);
    }
    return (combined & 0x80) != 0;
}


/* sub_A518: CF=1 means blocked, CF=0 means both halves moved west. */
static int paired_move_west(uint16_t m)
{
    if (MEM8(m + 3) < 2) return 1;
    if (paired_wall_or_ledge_west(m)) return 1;

    uint16_t x = (uint16_t)(MEM16(m) - 1);
    if (x == 0xFFFF) x = (uint16_t)(MEM16(ADDR_MAP_WIDTH) - 1);

    MEM16(m) = x;
    MEM16(m + 0x10) = x;
    MEM8(m + 3)--;
    MEM8(m + 0x13)--;
    return 0;
}


/* sub_A53E: west-facing mirror of sub_A4B9. */
static int paired_wall_or_ledge_west(uint16_t m)
{
    uint16_t addr = (uint16_t)(coords_to_prox_addr(MEM8(m + 3), MEM8(m + 2)) - 1);

    for (int i = 0; i < 4; i++) {
        if (is_blocking(MEM8(addr))) return 1;
        addr = (uint16_t)(addr + 0x24);
        wrap_map_from_above(&addr);
    }

    addr--;
    uint8_t combined = 0;
    for (int i = 0; i < 5; i++) {
        addr = (uint16_t)(addr - 0x24);
        wrap_map_from_below(&addr);
        combined |= MEM8(addr);
    }
    return (combined & 0x80) != 0;
}


static ProxResult proximity_and_facing(uint16_t m, uint8_t max_distance)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m + 2));
    uint8_t abs_dy = (dy & 0x80) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= max_distance) {
        return (ProxResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m + 3) < 0x11) {
        return (ProxResult){
            .value = 0x80,
            .carry = (MEM8(m + 5) & 0x80) != 0
        };
    }

    return (ProxResult){
        .value = 0,
        .carry = (MEM8(m + 5) & 0x80) == 0
    };
}


static ProxResult proximity_and_facing_5(uint16_t m)
{
    return proximity_and_facing(m, 5); /* sub_A609 */
}


static ProxResult proximity_and_facing_6(uint16_t m)
{
    return proximity_and_facing(m, 6); /* sub_A882 */
}


/* ------------------------------------------------------------------------- */
/* Type 0: paired ranged monster with variable preferred firing distance. */

static void type0_ai(uint16_t m)
{
    if (MEM8(m + 8) == 0) MEM8(m + 8) = 0x10;

    if ((MEM8(m + 5) & 0x20) || (MEM8(m + 0x15) & 0x40)) {
        paired_hit_reaction(m);
        return;
    }

    if (!paired_try_fall(m)) return;

    if (MEM8(m + 9) & 1) {
        type0_attack_tick(m);
        return;
    }

    ProxResult pr = proximity_and_facing_5(m);
    if (!pr.carry) {
        if (pr.value != 0xFF) MEM8(m + 5) ^= 0x80;
        type0_wander(m);
        return;
    }

    /* Face toward the hero according to horizontal position. At x_rel == 17
     * the original chooses right-facing. */
    MEM8(m + 5) &= 0x7F;
    if (MEM8(m + 3) <= 0x11) MEM8(m + 5) |= 0x80;

    uint8_t distance;
    uint8_t preferred;
    int blocked;

    if (MEM8(m + 5) & 0x80) {
        distance = (uint8_t)(0x11 - MEM8(m + 3));
        preferred = type0_right_distance;

        if (distance == preferred) {
            type0_prepare_attack(m, 1);
            return;
        }

        if (distance < preferred) {
            blocked = paired_move_west(m); /* back away from hero */
            if (blocked) {
                if (get_random() & 1) return; /* original bypasses twin sync */
                type0_prepare_attack(m, 3);
                return;
            }
            MEM8(m + 6) = (uint8_t)(MEM8(m + 6) - 1) & 3;
            paired_sync(m);
            return;
        }

        blocked = paired_move_east(m); /* close distance */
    } else {
        distance = (uint8_t)(MEM8(m + 3) - 0x11);
        preferred = type0_left_distance;

        if (distance == preferred) {
            type0_prepare_attack(m, 1);
            return;
        }

        if (distance < preferred) {
            blocked = paired_move_east(m); /* back away from hero */
            if (blocked) {
                if (get_random() & 1) return; /* original bypasses twin sync */
                type0_prepare_attack(m, 3);
                return;
            }
            MEM8(m + 6) = (uint8_t)(MEM8(m + 6) - 1) & 3;
            paired_sync(m);
            return;
        }

        blocked = paired_move_west(m); /* close distance */
    }

    if (blocked) {
        type0_prepare_attack(m, 1);
        return;
    }

    MEM8(m + 6) = (uint8_t)(MEM8(m + 6) + 1) & 3;
    paired_sync(m);
}


/* loc_A342: half-rate wandering when the hero is not lined up. */
static void type0_wander(uint16_t m)
{
    uint16_t sum = (uint16_t)MEM8(m + 6) + 0x80;
    MEM8(m + 6) = (uint8_t)sum;

    if (sum >= 0x100) {
        MEM8(m + 6) = (uint8_t)(MEM8(m + 6) + 1) & 3;

        if (MEM8(m + 5) & 0x80) {
            if (paired_move_east(m)) MEM8(m + 5) &= 0x7F;
        } else {
            if (paired_move_west(m)) MEM8(m + 5) |= 0x80;
        }
    }

    paired_sync(m);
}


/* loc_A3DF / loc_A40A setup. state_bits is 1 for the normal firing state and
 * 3 for the blocked-retreat variant; both execute the same animation, but the
 * original preserves the otherwise-unused bit 1 until the attack ends. */
static void type0_prepare_attack(uint16_t m, uint8_t state_bits)
{
    if (state_bits == 1) {
        type0_right_distance = (uint8_t)((get_random() & 3) + 7);
        type0_left_distance  = (uint8_t)((get_random() & 3) + 7);

        if (!proximity_and_facing_5(m).carry) {
            paired_sync(m);
            return;
        }
    }

    MEM8(m + 9) |= state_bits;
    MEM8(m + 6) = 4;
    paired_sync(m);
}


/* loc_A41E: unthrottled attack animation; fire on frame 6, finish on 8. */
static void type0_attack_tick(uint16_t m)
{
    MEM8(m + 6)++;

    if (MEM8(m + 6) == 6) {
        type0_fire(m);
    } else if (MEM8(m + 6) == 8) {
        MEM8(m + 9) &= 0xFC;
        MEM8(m + 6) = 0;
    }

    paired_sync(m);
}


static void type0_fire(uint16_t m)
{
    uint8_t x = MEM8(m + 3);
    uint8_t y = (uint8_t)(MEM8(m + 2) + 1);

    type0_shot_left[0] = x;
    type0_shot_right[0] = (uint8_t)(x + 1);
    type0_shot_left[1] = y;
    type0_shot_right[1] = y;

    Add_Projectile_To_Array((MEM8(m + 5) & 0x80) ?
                            type0_shot_right : type0_shot_left);
}


/* ------------------------------------------------------------------------- */
/* Type 2: paired ranged monster that patrols around viewport centre. */

static void type2_ai(uint16_t m)
{
    if (MEM8(m + 8) == 0) MEM8(m + 8) = 0x40;

    if (MEM8(m + 5) & 0x20) {
        paired_hit_reaction(m);
        return;
    }

    MEM8(m + 0x15) &= 0xBF;

    if (!paired_try_fall(m)) return;

    if (MEM8(m + 9) & 1) {
        type2_attack_tick(m);
        return;
    }

    ProxResult pr = proximity_and_facing_5(m);
    if (pr.carry &&
        (get_random() & 0xC0) == 0 &&
        (MEM8(m + 6) & 1) != 0) {
        MEM8(m + 9) |= 1;
        MEM8(m + 6) = 4;
        paired_sync(m);
        return;
    }

    type2_wander(m);
}


/* loc_A661: half-rate animation and movement every other animation phase. */
static void type2_wander(uint16_t m)
{
    uint16_t sum = (uint16_t)MEM8(m + 6) + 0x80;
    MEM8(m + 6) = (uint8_t)sum;

    if (sum >= 0x100) {
        MEM8(m + 6) = (uint8_t)(MEM8(m + 6) + 1) & 3;

        if ((MEM8(m + 6) & 1) == 0) {
            if (MEM8(m + 3) > 0x10) {
                if (!paired_move_west(m)) MEM8(m + 5) &= 0x7F;
            } else {
                if (!paired_move_east(m)) MEM8(m + 5) |= 0x80;
            }
        }
    }

    paired_sync(m);
}


/* loc_A6BB: throttled firing animation. */
static void type2_attack_tick(uint16_t m)
{
    uint16_t sum = (uint16_t)MEM8(m + 6) + 0x80;
    MEM8(m + 6) = (uint8_t)sum;

    if (sum >= 0x100) {
        MEM8(m + 6)++;
        uint8_t phase = MEM8(m + 6) & 7;

        if (phase == 6) {
            type2_fire(m);
        } else if (phase == 0) {
            MEM8(m + 9) &= 0xFE;
            MEM8(m + 6) = 3;
        }
    }

    paired_sync(m);
}


static void type2_fire(uint16_t m)
{
    uint8_t x = MEM8(m + 3);
    uint8_t y = (uint8_t)(MEM8(m + 2) + 1);

    type2_shot_left[0] = x;
    type2_shot_right[0] = (uint8_t)(x + 1);
    type2_shot_left[1] = y;
    type2_shot_right[1] = y;

    Add_Projectile_To_Array((MEM8(m + 5) & 0x80) ?
                            type2_shot_right : type2_shot_left);
}


/* ------------------------------------------------------------------------- */
/* Type 4: grounded patrol monster with ledge/wall trajectory sequences. */

static void type4_ai(uint16_t m)
{
    if (!check_monster_on_aggressive_ground(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }

    if (MEM8(m + 8) == 0) MEM8(m + 8) = 8;

    if (MEM8(m + 5) & 0x20) {
        Hero_Hits_monster(m);
        return;
    }

    if (MEM8(m + 9) & 0x18) {
        type4_trajectory_step(m);
        return;
    }

    /* The original branches into ground logic when move_monster_S reports a
     * blocked downward step; a successful fall consumes the frame. */
    if (move_monster_S(m)) return;

    type4_ground_step(m);
}


static void type4_ground_step(uint16_t m)
{
    if (!(MEM8(m + 9) & 2)) {
        ProxResult pr = proximity_and_facing_6(m);
        if (!pr.carry && pr.value != 0xFF) {
            MEM8(m + 5) = (uint8_t)((MEM8(m + 5) & 0x7F) | pr.value);
            MEM8(m + 9) |= 2;
            return;
        }
    }

    /* Probe two rows down and one column toward the current facing. A clear
     * tile starts the ledge trajectory (state bit 0x08). */
    uint16_t probe = coords_to_prox_addr(MEM8(m + 3), MEM8(m + 2));
    probe = (uint16_t)(probe + 0x48 + ((MEM8(m + 5) & 0x80) ? 1 : 0));
    wrap_map_from_above(&probe);

    if (!is_blocking(MEM8(probe))) {
        MEM8(m + 6) = 0;
        MEM8(m + 9) |= 8;
        return;
    }

    MEM8(m + 6) = (uint8_t)(MEM8(m + 6) + 1) & 3;

    if (!(MEM8(m + 9) & 2)) {
        uint16_t sum = (uint16_t)MEM8(m + 0x0A) + 0x10;
        MEM8(m + 0x0A) = (uint8_t)sum;
        if (sum >= 0x100) {
            MEM8(m + 9) ^= 0x80;
            return;
        }
    }

    if (proximity_and_facing_6(m).carry) {
        MEM8(m + 9) &= 0xFD;
    }

    if (MEM8(m + 5) & 0x80) {
        move_monster_E(m);
        if (move_monster_E(m)) return;
    } else {
        move_monster_W(m);
        if (move_monster_W(m)) return;
    }

    MEM8(m + 6) = 0;
    MEM8(m + 9) |= 0x10;
}


/* loc_A818: execute one step from one of four direction tables. State bits
 * 5..7 form the table phase; adding 0x20 advances that phase exactly as in
 * the byte-sized assembly state variable. */
static void type4_trajectory_step(uint16_t m)
{
    MEM8(m + 9) = (uint8_t)(MEM8(m + 9) + 0x20);

    if (!(MEM8(m + 9) & 0x20)) {
        uint8_t old_anim = MEM8(m + 6);
        uint8_t low = (uint8_t)(old_anim + 1) & 3;

        if (low == 0) {
            MEM8(m + 9) = 0;
            MEM8(m + 6) = 3;
            (void)move_monster_S(m);
            return;
        }

        MEM8(m + 6) = (uint8_t)((old_anim & 0xF0) | low);
    }

    uint8_t index = (uint8_t)((((MEM8(m + 9) >> 5) & 7) - 1) & 7);
    const uint8_t *table;

    if (MEM8(m + 5) & 0x80) {
        table = (MEM8(m + 9) & 0x10) ? type4_wall_right : type4_ledge_right;
    } else {
        table = (MEM8(m + 9) & 0x10) ? type4_wall_left : type4_ledge_left;
    }

    if (!monster_move_in_direction(m, table[index])) {
        MEM8(m + 9) = 0;
        if (MEM8(m + 6) == 0) return;
        MEM8(m + 6) = 3;
    }
}
