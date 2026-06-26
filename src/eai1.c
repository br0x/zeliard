/* ============================================================================
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
 * - Check_Monster_Ids_Two_Rows_Below_Monster mirrors a jnz test: it returns
 *   nonzero exactly when the original code took the "jnz" branch (ZF=0).
 * - if_passable_set_ZF, check_collision_E2_monster and
 *   check_collision_W2_monster keep the signature/semantics already declared
 *   in zeliard.h.
 * - rat_hero_proximity_and_direction / frog_hero_proximity_and_direction
 *   originally returned a value in AL *and* a carry flag that the two call
 *   sites use independently; both are captured in ProximityResult below.
 *
 * Functions assumed to be implemented elsewhere
 * ------------------------------------------------------------------
 * These are not declared in zeliard.h, so I'm declaring them here with the
 * signatures implied by how eai1.asm calls them. Adjust if the real
 * signatures differ.
 * ============================================================================
 */

#include "zeliard.h"

/* ---- shared monster-AI helpers (presumably shared by other eaiN.asm ports) */
extern int  Check_Monster_Ids_Two_Rows_Below_Monster(Monster *m);
extern void Check_Vertical_Distance_Between_Hero_And_Monster(Monster *m);

/* ---- movement primitives: return CF (1 = blocked/failed, 0 = success) */
extern int move_monster_N(Monster *m);
extern int move_monster_S(Monster *m);
extern int move_monster_E(Monster *m);
extern int move_monster_W(Monster *m);
extern int move_monster_NE(Monster *m);
extern int move_monster_NW(Monster *m);
extern int move_monster_SE(Monster *m);
extern int move_monster_SW(Monster *m);

/* angle: 0=E, counter-clockwise in 45-degree steps 
 * (0=E,1=NE,2=N,3=NW,4=W, 5=SW,6=S,7=SE) - same encoding as the angle tables below. 
 * Both return CF (1 = blocked). */
extern int monster_move_in_direction(Monster *m, uint8_t angle);
extern int Check_collision_in_direction(Monster *m, uint8_t angle);

extern uint8_t get_random(void);

/* Proximity-map helpers. coords_in_ax_to_proximity_map_offset_in_di returns
 * the original "di" as a raw conceptual address; wrap_map_from_above(uint16_t*)
 * is already declared in zeliard.h and adjusts that address in place. */
extern uint16_t coords_in_ax_to_proximity_map_offset_in_di(uint16_t ax);

/* I don't have visibility into how the proximity map is exposed in your C
 * port outside of the 0x00-0xFF / 0xFF00-0xFFFF MEM8/MEM16 ranges, so this
 * is my one open assumption: a byte-peek into proximity-map space by raw
 * address, analogous to wasm_get_proximity_map(). Replace with whatever
 * accessor you actually use if this isn't it. */
extern uint8_t proximity_map_peek(uint16_t addr);

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
static void ai_flags00(Monster *m); /* Bat  */
static void ai_flags01(Monster *m); /* Slug */
static void ai_flags10(Monster *m); /* Frog */
static void ai_flags11(Monster *m); /* Rat  */

static void bat_step_throttle(Monster *m);
static void bat_ai_state_00(Monster *m);
static void bat_ai_state_40(Monster *m);
static void bat_ai_state_80(Monster *m);
static void bat_ai_state_c0(Monster *m);

static void rat_ai_jump_step(Monster *m); /* loc_A649 */
static void rat_ai_hop_step(Monster *m);  /* loc_A690 */

static ProximityResult rat_hero_proximity_and_direction(Monster *m);
static ProximityResult frog_hero_proximity_and_direction(Monster *m);

/* ============================================================================
 * Monster_AI - entry point (matches void Monster_AI(Monster* m); in zeliard.h)
 * Called from dungeon.c monsters_spawning and place_monster_in_proximity_and_run_ai
 * ============================================================================
 */
void Monster_AI(Monster *m)
{
    switch (m->flags & 0x0F) {
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
static void ai_flags00(Monster *m)
{
    if (!Check_Monster_Ids_Two_Rows_Below_Monster(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    if (m->hp == 0) m->hp = 2;

    if (m->ai_flags & 0x20) {
        Hero_Hits_monster(m, MEM8(ADDR_MONSTER_INDEX));
        return;
    }

    switch ((m->ai_state >> 6) & 3) {
        case 0: bat_ai_state_00(m); break;
        case 1: bat_ai_state_40(m); break;
        case 2: bat_ai_state_80(m); break;
        case 3: bat_ai_state_c0(m); break;
    }
}

static void bat_step_throttle(Monster *m)
{
    m->anim_counter = (uint8_t)(m->anim_counter + 1) & 7;
    if (m->anim_counter == 7) {
        m->anim_counter = 3;
    }
}

/* ai_state == 0x00: flying up, looking for a spot to dive */
static void bat_ai_state_00(Monster *m)
{
    move_monster_N(m); /* return value unused, as in the original */

    if (m->anim_counter != 0) {
        m->anim_counter -= 0x10;
        return;
    }

    uint8_t al = (uint8_t)(m->x_rel - 17);
    if (al >= 10) {
        al = (uint8_t)(17 - m->x_rel);
        if (al >= 7) {
            m->anim_counter = 0;
            return;
        }
    }
    m->ai_state = 0x40;
    m->anim_counter = 0;
}

/* ai_state == 0x40: short pause before diving */
static void bat_ai_state_40(Monster *m)
{
    m->anim_counter = (uint8_t)(m->anim_counter + 1) & 7;
    if (m->anim_counter == 3) {
        m->ai_state = 0x80;
    }
}

/* ai_state == 0x80: diving toward the hero */
static void bat_ai_state_80(Monster *m)
{
    bat_step_throttle(m);

    if (MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) != 0) {
        m->ai_state = 0xC0;
        return;
    }

    uint8_t al = (uint8_t)(MEM8(ADDR_HERO_Y) - m->curr_y);
    al = (uint8_t)(al + 21) & 0x3F;

    if (al < 18) goto loc_A350;
    if (al < 24) goto loc_A32A;

    /* al >= 24: try SE/SW diagonal first */
    if (m->x_rel == 0x11 || m->x_rel == 0x10) goto loc_A376;
    if (m->x_rel < 0x10) {
        if (move_monster_SE(m)) goto loc_A338;
        m->ai_flags |= 0x80;
        return;
    } else {
        if (move_monster_SW(m)) goto loc_A344;
        m->ai_flags &= 0x7F;
        return;
    }

loc_A32A:
    if (m->x_rel == 0x11 || m->x_rel == 0x10) goto loc_A376;
    if (m->x_rel < 0x10) goto loc_A338;
    goto loc_A344;

loc_A338:
    if (move_monster_E(m)) goto loc_A376;
    m->ai_flags |= 0x80;
    return;

loc_A344:
    if (move_monster_W(m)) goto loc_A376;
    m->ai_flags &= 0x7F;
    return;

loc_A350:
    if (m->x_rel == 0x11 || m->x_rel == 0x10) goto loc_A376;
    if (m->x_rel < 0x10) {
        if (move_monster_NE(m)) goto loc_A338;
        m->ai_flags |= 0x80;
        return;
    } else {
        if (move_monster_NW(m)) goto loc_A344;
        m->ai_flags &= 0x7F;
        return;
    }

loc_A376:
    if (move_monster_S(m)) {
        m->ai_state = 0xC0;
    }
}

/* ai_state == 0xC0: climbing back up */
static void bat_ai_state_c0(Monster *m)
{
    if (m->ai_state & 0x20) goto loc_A3BD;

    bat_step_throttle(m);
    if (m->ai_flags & 0x80) {
        if (move_monster_NE(m)) {     /* blocked */
            m->ai_flags &= 0x7F;
            goto loc_A3AC;
        }
        return;
    } else {
        if (move_monster_NW(m)) {     /* blocked */
            m->ai_flags |= 0x80;
            goto loc_A3AC;
        }
        return;
    }

loc_A3AC:
    if (move_monster_N(m)) {          /* blocked */
        m->ai_state |= 0x20;
        m->anim_counter = 2;
    }
    return;

loc_A3BD:
    m->anim_counter = (uint8_t)(m->anim_counter - 1) & 7;
    if (m->anim_counter == 0) {
        m->anim_counter = 0x70;
        m->ai_state = 0;
    }
}

/* ============================================================================
 * Slug (flags01)
 * ============================================================================
 */
static void ai_flags01(Monster *m)
{
    if (!Check_Monster_Ids_Two_Rows_Below_Monster(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    if (m->hp == 0) m->hp = 2;

    if (m->ai_flags & 0x20) {
        Hero_Hits_monster(m, MEM8(ADDR_MONSTER_INDEX));
        return;
    }

    if (!move_monster_S(m)) return; /* CF=0 (success) -> stop here */

    m->anim_counter = (uint8_t)(m->anim_counter + 0x41) & 0xC3;
    if (m->anim_counter & 0xF0) return;

    if (m->x_rel < 17) {
        if (move_monster_E(m)) return; /* blocked */
        m->ai_flags |= 0x80;
    } else {
        if (move_monster_W(m)) return; /* blocked */
        m->ai_flags &= 0x7F;
    }
}

/* ============================================================================
 * Frog (flags10)
 * ============================================================================
 */
static void ai_flags10(Monster *m)
{
    ProximityResult pr;
    uint8_t ah, al, angle;
    const uint8_t *angle_table;

    if (!Check_Monster_Ids_Two_Rows_Below_Monster(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    if (m->hp == 0) m->hp = 1;

    if (m->ai_flags & 0x20) {
        Hero_Hits_monster(m, MEM8(ADDR_MONSTER_INDEX));
        return;
    }

    if (m->ai_state & 0x08) goto loc_A4A2; /* already mid-jump */

    m->anim_counter = (uint8_t)(m->anim_counter + 0x21) & 0xE1;
    if (!move_monster_S(m)) return; /* CF=0 success -> stop */

    /* loc_A476: blocked moving south, decide whether to start a jump */
    pr = frog_hero_proximity_and_direction(m);
    if (pr.carry) goto loc_A49A;
    if (m->anim_counter & 0xE0) return;

    /* loc_A483 */
    pr = frog_hero_proximity_and_direction(m);
    if (pr.value == 0xFF) goto loc_A49A;

    m->ai_flags = (uint8_t)((m->ai_flags & 0x7F) | pr.value);
    m->anim_counter = 2;
    m->ai_state |= 0x08;
    return;

loc_A49A:
    m->anim_counter = 2;
    m->ai_state |= 0x08;
    /* fallthrough */

loc_A4A2:
    ah = m->anim_counter;
    al = (uint8_t)(ah + 1) & 7;
    if (al >= 7) goto loc_A4DB;

    m->anim_counter = (uint8_t)(al | (ah & 0xF0));

    angle_table = (m->ai_flags & 0x80) ? jump_angles_right : jump_angles_left;
    angle = angle_table[(uint8_t)(ah - 2)];

    if (monster_move_in_direction(m, angle)) { /* blocked */
        pr = frog_hero_proximity_and_direction(m);
        if (!pr.carry) {
            m->ai_flags ^= 0x80;
        }
        goto loc_A4DB;
    }
    return;

loc_A4DB:
    m->ai_state &= 0xF7;
    m->anim_counter = 0;
    move_monster_S(m);
}

/* ============================================================================
 * Rat (flags11)
 * ============================================================================
 */
static void ai_flags11(Monster *m)
{
    ProximityResult pr;

    if (!Check_Monster_Ids_Two_Rows_Below_Monster(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    if (m->hp == 0) m->hp = 1;

    if (m->ai_flags & 0x20) {
        Hero_Hits_monster(m, MEM8(ADDR_MONSTER_INDEX));
        return;
    }

    if (m->ai_state & 0x08) { rat_ai_jump_step(m); return; }
    if (m->ai_state & 0x10) { rat_ai_hop_step(m);  return; }

    if (!move_monster_S(m)) return; /* CF=0 success -> stop */

    /* loc_A552 */
    if (!(m->ai_state & 0x04)) goto loc_A5C5;

    m->anim_counter = (uint8_t)((m->anim_counter & 0xF1) | 0x04);

    pr = rat_hero_proximity_and_direction(m);
    if (pr.value == 0xFF) goto loc_A57B;

    m->ai_flags = (uint8_t)((m->ai_flags & 0x7F) | pr.value);
    m->anim_counter = 0;
    m->ai_state = (uint8_t)((m->ai_state | 0x02) & 0xFB);
    return;

loc_A57B: {
        uint8_t old = m->anim_counter;
        m->anim_counter = (uint8_t)(old + 0x40);
        if (old < 0xC0) return; /* CF=0 -> stop */

        /* loc_A582 */
        uint8_t v = (uint8_t)(((m->anim_counter + 1) & 1) + 4);
        m->anim_counter = v;

        uint8_t old_state = m->ai_state;
        m->ai_state = (uint8_t)(old_state + 0x40);
        if (old_state < 0xC0) return; /* CF=0 -> stop */
    }

    /* loc_A595: time to pick a new random direction */
    m->ai_state &= 0xFB;
    m->ai_flags &= 0x7F;
    {
        uint8_t r = (uint8_t)(get_random() & 0x80);
        m->ai_flags |= r;
        if (r != 0) {
            if (check_collision_E2_monster(m)) { /* blocked */
                m->ai_flags &= 0x7F;
            }
        } else {
            if (check_collision_W2_monster(m)) { /* blocked */
                m->ai_flags |= 0x80;
            }
        }
    }
    return;

loc_A5C5: {
        /* word-read of (curr_y, x_rel) exactly as "word ptr [si+monster.currY]" did */
        uint16_t ax = (uint16_t)m->curr_y | ((uint16_t)m->x_rel << 8);
        uint16_t addr = coords_in_ax_to_proximity_map_offset_in_di(ax);

        uint16_t lookahead = 0x48;
        if (m->ai_flags & 0x80) lookahead++;
        addr = (uint16_t)(addr + lookahead);

        wrap_map_from_above(&addr);
        uint8_t tile = proximity_map_peek(addr);

        if (!if_passable_set_ZF(tile)) goto loc_A5F4;

        m->anim_counter = 0;
        m->ai_state |= 0x08;
        return;
    }

loc_A5F4:
    m->anim_counter = (uint8_t)(m->anim_counter + 1) & 3;
    if (m->ai_state & 0x02) goto loc_A60C;
    {
        uint8_t old_timer = m->ai_timer;
        m->ai_timer = (uint8_t)(old_timer + 0x10);
        if (old_timer < 0xF0) goto loc_A60C; /* CF=0 -> jump ahead */
    }
    m->ai_state |= 0x04;
    return;

loc_A60C:
    pr = rat_hero_proximity_and_direction(m);
    if (pr.carry) {
        m->ai_flags &= 0xFD;
        m->ai_timer = 0;
    }

    /* loc_A619 */
    if (m->ai_flags & 0x80) {
        if (move_monster_E(m)) { /* blocked */
            m->anim_counter = 0;
            m->ai_state = (uint8_t)((m->ai_state | 0x10) & 0x1F);
        }
    } else {
        if (move_monster_W(m)) { /* blocked */
            m->anim_counter = 0;
            m->ai_state = (uint8_t)((m->ai_state | 0x10) & 0x1F);
        }
    }
}

/* loc_A649: per-frame step while ai_state bit 0x08 ("jumping") is set */
static void rat_ai_jump_step(Monster *m)
{
    uint8_t ah = m->anim_counter;
    uint8_t al = (uint8_t)(ah + 1) & 3;

    if (al == 0) {
        /* loc_A683: jump finished */
        m->ai_state &= 0xF7;
        m->anim_counter = 3;
        move_monster_S(m);
        return;
    }

    m->anim_counter = (uint8_t)((ah & 0xF0) | al);

    const uint8_t *angle_table = (m->ai_flags & 0x80) ? jump_angles_right : jump_angles_left;
    uint8_t angle = angle_table[m->anim_counter];

    if (Check_collision_in_direction(m, angle)) { /* blocked */
        m->ai_state = (uint8_t)((m->ai_state & 0xF7) | 0x04);
        return;
    }
    monster_move_in_direction(m, angle);
}

/* loc_A690: per-frame step while ai_state bit 0x10 ("hopping") is set */
static void rat_ai_hop_step(Monster *m)
{
    m->ai_state = (uint8_t)(m->ai_state + 0x20);

    if (!(m->ai_state & 0x20)) {
        uint8_t ah = m->anim_counter;
        uint8_t al = (uint8_t)(ah + 1) & 3;

        if (al == 0) {
            /* loc_A6E3: hop finished */
            m->ai_state &= 0xEF;
            m->anim_counter = 3;
            move_monster_S(m);
            return;
        }
        m->anim_counter = (uint8_t)((ah & 0xF0) | al);
    }

    /* loc_A6AD */
    uint8_t idx = rol8(m->ai_state, 3);
    idx = (uint8_t)(idx - 1) & 7;

    const uint8_t *angle_table = (m->ai_flags & 0x80) ? rat_jump_angles_right : rat_jump_angles_left;
    uint8_t angle = angle_table[idx];

    if (monster_move_in_direction(m, angle)) { /* blocked: loc_A6CF */
        m->ai_state = (uint8_t)((m->ai_state & 0xEF) | 0x04);
        if (m->anim_counter != 0) {
            m->anim_counter = 3;
        }
    }
}

/* ============================================================================
 * Proximity helpers shared by Frog/Rat
 * ============================================================================
 */
static ProximityResult rat_hero_proximity_and_direction(Monster *m)
{
    uint8_t raw = (uint8_t)(MEM8(ADDR_HERO_Y) - m->curr_y);
    uint8_t al  = (raw & 0x80) ? (uint8_t)(-(int8_t)raw) : raw;

    if (al >= 6) {
        return (ProximityResult){ .value = 0xFF, .carry = 0 };
    }

    if (m->x_rel < 17) {
        int carry = (m->ai_flags & 0x80) != 0;
        return (ProximityResult){ .value = 0x80, .carry = carry };
    } else {
        int carry = (m->ai_flags & 0x80) == 0;
        return (ProximityResult){ .value = 0x00, .carry = carry };
    }
}

static ProximityResult frog_hero_proximity_and_direction(Monster *m)
{
    uint8_t raw = (uint8_t)(MEM8(ADDR_HERO_Y) - m->curr_y);
    uint8_t al  = (raw & 0x80) ? (uint8_t)(-(int8_t)raw) : raw;

    if (al >= 8) {
        return (ProximityResult){ .value = 0xFF, .carry = 0 };
    }

    if (m->x_rel < 17) {
        int carry = (m->ai_flags & 0x80) != 0;
        return (ProximityResult){ .value = 0x80, .carry = carry };
    } else {
        int carry = (m->ai_flags & 0x80) == 0;
        return (ProximityResult){ .value = 0x00, .carry = carry };
    }
}
