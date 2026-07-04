/* 
 * eai1.c - translated from eai1.asm
 *
 * Monster AI for the 4 monster types handled by this AI overlay:
 *   monster.flags & 0x0F == 0  ->  Bat   (flags00 in the original)
 *   monster.flags & 0x0F == 1  ->  Slug  (flags01)
 *   monster.flags & 0x0F == 2  ->  Frog  (flags10)
 *   monster.flags & 0x0F == 3  ->  Rat   (flags11)
 *
 * Translation conventions used below
 * ------------------------------------------------------------------
 * - "m" is the monster pointer, i.e. the original "si".
 * - Every helper below that mirrors an asm "proc" which the caller tested
 *   with jb/jnb (carry) returns an int that IS the carry flag: nonzero (1)
 *   means CF=1 (the original jb branch), 0 means CF=0 (jnb branch). This
 *   applies to move_monster_*, monster_move_in_direction and
 *   Check_collision_in_direction below.
 * - check_monster_on_aggressive_ground mirrors a jnz test: it returns
 *   nonzero exactly when the original code took the "jnz" branch (ZF=0).
 * - is_blocking, check_collision_E2 and
 *   check_collision_W2 keep the signature/semantics already declared
 *   in zeliard.h.
 * - rat_hero_proximity_and_direction / frog_hero_proximity_and_direction
 *   originally returned a value in AL *and* a carry flag that the two call
 *   sites use independently; both are captured in ProximityResult below.
 */

#include "zeliard.h"



/* ============================================================================
 * Small helpers / tables
 * ============================================================================
 */

/* Carries both outputs (AL, CF) of rat_hero_proximity_and_direction /
 * frog_hero_proximity_and_direction, since both are used independently by
 * different call sites in the original code. */
typedef struct {
    uint8_t value; /* AL on return */
    int     carry; /* CF on return (1 = set) */
} ProximityResult;

static inline uint8_t rol8(uint8_t v, unsigned n)
{
    n &= 7;
    if (n == 0) return v;
    return (uint8_t)((v << n) | (v >> (8 - n)));
}

/* jump_angles_*: used while a Frog or Rat is mid-jump (ai_state bit 0x08). */
static const uint8_t jump_angles_right[4] = { 1, 0, 0, 7 }; /* NE, E,  E,  SE */
static const uint8_t jump_angles_left[4]  = { 3, 4, 4, 5 }; /* NW, W,  W,  SW */

/* rat_jump_angles_*: used while a Rat is "hopping" (ai_state bit 0x10). */
static const uint8_t rat_jump_angles_right[8] = { 2, 1, 1, 0, 0, 7, 7, 6 };
static const uint8_t rat_jump_angles_left[8]  = { 2, 3, 3, 4, 4, 5, 5, 6 };

/* ============================================================================
 * Forward declarations
 * ============================================================================
 */
static void ai_flags00(uint16_t m); /* Bat  */
static void ai_flags01(uint16_t m); /* Slug */
static void ai_flags10(uint16_t m); /* Frog */
static void ai_flags11(uint16_t m); /* Rat  */

static void bat_step_throttle(uint16_t m);
static void bat_ai_state_00(uint16_t m);
static void bat_ai_state_40(uint16_t m);
static void bat_ai_state_80(uint16_t m);
static void bat_ai_state_c0(uint16_t m);

static void rat_ai_jump_step(uint16_t m); /* loc_A649 */
static void rat_ai_hop_step(uint16_t m);  /* loc_A690 */

static ProximityResult rat_hero_proximity_and_direction(uint16_t m);
static ProximityResult frog_hero_proximity_and_direction(uint16_t m);

/* 
 * Monster_AI - entry point (matches void Monster_AI(Monster* m); in zeliard.h)
 * Called from dungeon.c monsters_spawning and place_monster_in_proximity_and_run_ai
 * ============================================================================
 */
void Monster_AI(uint16_t m)
{
    switch (MEM8(m+4) & 0x0F) { // .flags
        case 0: ai_flags00(m); return; /* Bat  */
        case 1: ai_flags01(m); return; /* Slug */
        case 2: ai_flags10(m); return; /* Frog */
        case 3: ai_flags11(m); return; /* Rat  */
        default:
            /* Original jump table only has 4 entries; monster.flags low
             * nibble is only ever 0..3 for this AI module by design. */
            return;
    }
}

/* ============================================================================
 * Bat  (flags00)
 * ============================================================================
 */
static void ai_flags00(uint16_t m)
{
    if (!check_monster_on_aggressive_ground(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    if (MEM8(m+8) == 0) MEM8(m+8) = 2; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    switch ((MEM8(m+9) >> 6) & 3) { // .ai_state
        case 0: bat_ai_state_00(m); break;
        case 1: bat_ai_state_40(m); break;
        case 2: bat_ai_state_80(m); break;
        case 3: bat_ai_state_c0(m); break;
    }
}

static void bat_step_throttle(uint16_t m)
{
    MEM8(m+6) = (MEM8(m+6) + 1) & 7; // .anim_counter
    if (MEM8(m+6) == 7) {
        MEM8(m+6) = 3;
    }
}

/* ai_state == 0x00: flying up, looking for a spot to dive */
static void bat_ai_state_00(uint16_t m)
{
    move_monster_N(m); /* return value unused, as in the original */

    if (MEM8(m+6) != 0) { // .anim_counter
        MEM8(m+6) -= 0x10;
        return;
    }

    uint8_t al = MEM8(m+3) - 17; // .m_x_rel
    if (al >= 10) {
        al = (uint8_t)(17 - MEM8(m+3));
        if (al >= 7) {
            MEM8(m+6) = 0;
            return;
        }
    }
    MEM8(m+9) = 0x40; // .ai_state
    MEM8(m+6) = 0;
}

/* ai_state == 0x40: short pause before diving */
static void bat_ai_state_40(uint16_t m)
{
    MEM8(m+6) = (MEM8(m+6) + 1) & 7;
    if (MEM8(m+6) == 3) { // .anim_counter
        MEM8(m+9) = 0x80; // .ai_state
    }
}

/* ai_state == 0x80: diving toward the hero */
static void bat_ai_state_80(uint16_t m)
{
    bat_step_throttle(m);

    if (MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) != 0) {
        MEM8(m+9) = 0xC0; // .ai_state
        return;
    }

    uint8_t al = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    al = (uint8_t)(al + 21) & 0x3F;

    if (al < 18) goto loc_A350;
    if (al < 24) goto loc_A32A;

    /* al >= 24: try SE/SW diagonal first */
    if (MEM8(m+3) == 0x11 || MEM8(m+3) == 0x10) goto loc_A376; // .m_x_rel
    if (MEM8(m+3) < 0x10) {
        if (move_monster_SE(m)) goto loc_A338;
        MEM8(m+5) |= 0x80; // .ai_flags
        return;
    } else {
        if (move_monster_SW(m)) goto loc_A344;
        MEM8(m+5) &= 0x7F;
        return;
    }

loc_A32A:
    if (MEM8(m+3) == 0x11 || MEM8(m+3) == 0x10) goto loc_A376; // .m_x_rel
    if (MEM8(m+3) < 0x10) goto loc_A338;
    goto loc_A344;

loc_A338:
    if (move_monster_E(m)) goto loc_A376;
    MEM8(m+5) |= 0x80; // .ai_flags
    return;

loc_A344:
    if (move_monster_W(m)) goto loc_A376;
    MEM8(m+5) &= 0x7F; // .ai_flags
    return;

loc_A350:
    if (MEM8(m+3) == 0x11 || MEM8(m+3) == 0x10) goto loc_A376; // .m_x_rel
    if (MEM8(m+3) < 0x10) {
        if (move_monster_NE(m)) goto loc_A338;
        MEM8(m+5) |= 0x80; // .ai_flags
        return;
    } else {
        if (move_monster_NW(m)) goto loc_A344;
        MEM8(m+5) &= 0x7F;
        return;
    }

loc_A376:
    if (move_monster_S(m)) {
        MEM8(m+9) = 0xC0; // .ai_state
    }
}

/* ai_state == 0xC0: climbing back up */
static void bat_ai_state_c0(uint16_t m)
{
    if (MEM8(m+9) & 0x20) goto loc_A3BD; // .ai_state

    bat_step_throttle(m);
    if (MEM8(m+5) & 0x80) { // .ai_flags
        if (move_monster_NE(m)) {     /* blocked */
            MEM8(m+5) &= 0x7F; // .ai_flags
            goto loc_A3AC;
        }
        return;
    } else {
        if (move_monster_NW(m)) {     /* blocked */
            MEM8(m+5) |= 0x80; // .ai_flags
            goto loc_A3AC;
        }
        return;
    }

loc_A3AC:
    if (move_monster_N(m)) {          /* blocked */
        MEM8(m+9) |= 0x20; // .ai_state
        MEM8(m+6) = 2; // .anim_counter
    }
    return;

loc_A3BD:
    MEM8(m+6) = (MEM8(m+6) - 1) & 7; // .anim_counter
    if (MEM8(m+6) == 0) {
        MEM8(m+6) = 0x70;
        MEM8(m+9) = 0; // .ai_state
    }
}

/* ============================================================================
 * Slug (flags01)
 * ============================================================================
 */
static void ai_flags01(uint16_t m)
{
    if (!check_monster_on_aggressive_ground(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    if (MEM8(m+8) == 0) MEM8(m+8) = 2; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    if (!move_monster_S(m)) return; /* CF=0 (success) -> stop here */

    MEM8(m+6) = (MEM8(m+6) + 0x41) & 0xC3; // .anim_counter
    if (MEM8(m+6) & 0xF0) return;

    if (MEM8(m+3) < 17) { // .m_x_rel
        if (move_monster_E(m)) return; /* blocked */
        MEM8(m+5) |= 0x80; // .ai_flags
    } else {
        if (move_monster_W(m)) return; /* blocked */
        MEM8(m+5) &= 0x7F; // .ai_flags
    }
}

/* ============================================================================
 * Frog (flags10)
 * ============================================================================
 */
static void ai_flags10(uint16_t m)
{
    ProximityResult pr;
    uint8_t ah, al, angle;
    const uint8_t *angle_table;

    if (!check_monster_on_aggressive_ground(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    if (MEM8(m+8) == 0) MEM8(m+8) = 1; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    if (MEM8(m+9) & 0x08) goto loc_A4A2; /* already mid-jump */ // .ai_state

    MEM8(m+6) = (MEM8(m+6) + 0x21) & 0xE1; // .anim_counter
    if (!move_monster_S(m)) return; /* CF=0 success -> stop */

    /* loc_A476: blocked moving south, decide whether to start a jump */
    pr = frog_hero_proximity_and_direction(m);
    if (pr.carry) goto loc_A49A;
    if (MEM8(m+6) & 0xE0) return; // .anim_counter

    /* loc_A483 */
    pr = frog_hero_proximity_and_direction(m);
    if (pr.value == 0xFF) goto loc_A49A;

    MEM8(m+5) = ((MEM8(m+5) & 0x7F) | pr.value); // .ai_flags
    MEM8(m+6) = 2; // .anim_counter
    MEM8(m+9) |= 0x08; // .ai_state
    return;

loc_A49A:
    MEM8(m+6) = 2; // .anim_counter
    MEM8(m+9) |= 0x08; // .ai_state
    /* fallthrough */

loc_A4A2:
    ah = MEM8(m+6); // .anim_counter
    al = (uint8_t)(ah + 1) & 7;
    if (al >= 7) goto loc_A4DB;

    MEM8(m+6) = (uint8_t)(al | (ah & 0xF0)); // .anim_counter

    angle_table = (MEM8(m+5) & 0x80) ? jump_angles_right : jump_angles_left; // .ai_flags
    angle = angle_table[(uint8_t)(ah - 2)];

    if (monster_move_in_direction(m, angle)) { /* blocked */
        pr = frog_hero_proximity_and_direction(m);
        if (!pr.carry) {
            MEM8(m+5) ^= 0x80; // .ai_flags
        }
        goto loc_A4DB;
    }
    return;

loc_A4DB:
    MEM8(m+9) &= 0xF7;
    MEM8(m+6) = 0; // .anim_counter
    move_monster_S(m);
}

/* ============================================================================
 * Rat (flags11)
 * ============================================================================
 */
static void ai_flags11(uint16_t m)
{
    ProximityResult pr;

    if (!check_monster_on_aggressive_ground(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    if (MEM8(m+8) == 0) MEM8(m+8) = 1; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    if (MEM8(m+9) & 0x08) { rat_ai_jump_step(m); return; } // .ai_state
    if (MEM8(m+9) & 0x10) { rat_ai_hop_step(m);  return; }

    if (!move_monster_S(m)) return; /* CF=0 success -> stop */

    /* loc_A552 */
    if (!(MEM8(m+9) & 0x04)) goto loc_A5C5; // .ai_state

    MEM8(m+6) = (uint8_t)((MEM8(m+6) & 0xF1) | 0x04); // .anim_counter

    pr = rat_hero_proximity_and_direction(m);
    if (pr.value == 0xFF) goto loc_A57B;

    MEM8(m+5) = ((MEM8(m+5) & 0x7F) | pr.value);
    MEM8(m+6) = 0; // .anim_counter
    MEM8(m+9) = ((MEM8(m+9) | 0x02) & 0xFB); // .ai_state
    return;

loc_A57B: {
        uint8_t old = MEM8(m+6); // .anim_counter
        MEM8(m+6) = (uint8_t)(old + 0x40);
        if (old < 0xC0) return; /* CF=0 -> stop */

        /* loc_A582 */
        uint8_t v = (uint8_t)(((MEM8(m+6) + 1) & 1) + 4); // .anim_counter
        MEM8(m+6) = v;

        uint8_t old_state = MEM8(m+9); // .ai_state
        MEM8(m+9) = (uint8_t)(old_state + 0x40);
        if (old_state < 0xC0) return; /* CF=0 -> stop */
    }

    /* loc_A595: time to pick a new random direction */
    MEM8(m+9) &= 0xFB; // .ai_state
    MEM8(m+5) &= 0x7F; // .ai_flags
    {
        uint8_t r = (uint8_t)(get_random() & 0x80);
        MEM8(m+5) |= r; // .ai_flags
        if (r != 0) {
            if (check_collision_E2(m)) { /* blocked */
                MEM8(m+5) &= 0x7F; // .ai_flags
            }
        } else {
            if (check_collision_W2(m)) { /* blocked */
                MEM8(m+5) |= 0x80; // .ai_flags
            }
        }
    }
    return;

loc_A5C5: {
        uint16_t addr = coords_to_prox_addr(MEM8(m+3), MEM8(m+2)); // .m_x_rel, .currY

        uint16_t lookahead = 36*2;
        if (MEM8(m+5) & 0x80) lookahead++; // .ai_flags
        addr = (uint16_t)(addr + lookahead);

        wrap_map_from_above(&addr);
        uint8_t tile = MEM8(addr);

        if (!is_blocking(tile)) goto loc_A5F4;

        MEM8(m+6) = 0; // .anim_counter
        MEM8(m+9) |= 0x08; // .ai_state
        return;
    }

loc_A5F4:
    MEM8(m+6) = (MEM8(m+6) + 1) & 3; // .anim_counter
    if (MEM8(m+9) & 0x02) goto loc_A60C; // .ai_state
    {
        uint8_t old_timer = MEM8(m+10); // .ai_timer
        MEM8(m+10) = (old_timer + 0x10);
        if (old_timer < 0xF0) goto loc_A60C; /* CF=0 -> jump ahead */
    }
    MEM8(m+9) |= 0x04; // .ai_state
    return;

loc_A60C:
    pr = rat_hero_proximity_and_direction(m);
    if (pr.carry) {
        MEM8(m+5) &= 0xFD; // .ai_flags
        MEM8(m+10) = 0; // .ai_timer
    }

    /* loc_A619 */
    if (MEM8(m+5) & 0x80) { // .ai_flags
        if (move_monster_E(m)) { /* blocked */
            MEM8(m+6) = 0; // .anim_counter
            MEM8(m+9) = ((MEM8(m+9) | 0x10) & 0x1F); // .ai_state
        }
    } else {
        if (move_monster_W(m)) { /* blocked */
            MEM8(m+6) = 0; // .anim_counter
            MEM8(m+9) = ((MEM8(m+9) | 0x10) & 0x1F); // .ai_state
        }
    }
}

/* loc_A649: per-frame step while ai_state bit 0x08 ("jumping") is set */
static void rat_ai_jump_step(uint16_t m)
{
    uint8_t ah = MEM8(m+6); // .anim_counter
    uint8_t al = (uint8_t)(ah + 1) & 3;

    if (al == 0) {
        /* loc_A683: jump finished */
        MEM8(m+9) &= 0xF7; // .ai_state
        MEM8(m+6) = 3; // .anim_counter
        move_monster_S(m);
        return;
    }

    MEM8(m+6) = ((ah & 0xF0) | al); // .anim_counter

    const uint8_t *angle_table = (MEM8(m+5) & 0x80) ? jump_angles_right : jump_angles_left; // .ai_flags
    uint8_t angle = angle_table[MEM8(m+6)]; // .anim_counter

    if (Check_collision_in_direction(m, angle)) { /* blocked */
        MEM8(m+9) = ((MEM8(m+9) & 0xF7) | 0x04);
        return;
    }
    monster_move_in_direction(m, angle);
}

/* loc_A690: per-frame step while ai_state bit 0x10 ("hopping") is set */
static void rat_ai_hop_step(uint16_t m)
{
    MEM8(m+9) = (uint8_t)(MEM8(m+9) + 0x20); // .ai_state

    if (!(MEM8(m+9) & 0x20)) { // .ai_state
        uint8_t ah = MEM8(m+6); // .anim_counter
        uint8_t al = (uint8_t)(ah + 1) & 3;

        if (al == 0) {
            /* loc_A6E3: hop finished */
            MEM8(m+9) &= 0xEF; // .ai_state
            MEM8(m+6) = 3; // .anim_counter
            move_monster_S(m);
            return;
        }
        MEM8(m+6) = ((ah & 0xF0) | al); // .anim_counter
    }

    /* loc_A6AD */
    uint8_t idx = rol8(MEM8(m+9), 3); // .ai_state
    idx = (uint8_t)(idx - 1) & 7;

    const uint8_t *angle_table = (MEM8(m+5) & 0x80) ? rat_jump_angles_right : rat_jump_angles_left; // .ai_flags
    uint8_t angle = angle_table[idx];

    if (monster_move_in_direction(m, angle)) { /* blocked: loc_A6CF */
        MEM8(m+9) = ((MEM8(m+9) & 0xEF) | 0x04); // .ai_state
        if (MEM8(m+6) != 0) { // .anim_counter
            MEM8(m+6) = 3;
        }
    }
}

/* ============================================================================
 * Proximity helpers shared by Frog/Rat
 * ============================================================================
 */
static ProximityResult rat_hero_proximity_and_direction(uint16_t m)
{
    uint8_t raw = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t al  = (raw & 0x80) ? (uint8_t)(-(int8_t)raw) : raw;

    if (al >= 6) {
        return (ProximityResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m+3) < 17) { // .m_x_rel
        int carry = (MEM8(m+5) & 0x80) != 0; // .ai_flags
        return (ProximityResult){ .value = 0x80, .carry = carry };
    } else {
        int carry = (MEM8(m+5) & 0x80) == 0; // .ai_flags
        return (ProximityResult){ .value = 0x00, .carry = carry };
    }
}

static ProximityResult frog_hero_proximity_and_direction(uint16_t m)
{
    uint8_t raw = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t al  = (raw & 0x80) ? (uint8_t)(-(int8_t)raw) : raw;

    if (al >= 8) {
        return (ProximityResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m+3) < 17) { // .m_x_rel
        int carry = (MEM8(m+5) & 0x80) != 0; // .ai_flags
        return (ProximityResult){ .value = 0x80, .carry = carry };
    } else {
        int carry = (MEM8(m+5) & 0x80) == 0; // .ai_flags
        return (ProximityResult){ .value = 0x00, .carry = carry };
    }
}
