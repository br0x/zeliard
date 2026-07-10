/* 
 * eai1.c - translated from eai1.asm
 *
 * Monster AI for the 4 monster types handled by this AI overlay:
 *   monster.flags & 0x0F == 0  ->  Bat   (bat_ai in the original)
 *   monster.flags & 0x0F == 1  ->  Slug  (slug_ai)
 *   monster.flags & 0x0F == 2  ->  Frog  (frog_ai)
 *   monster.flags & 0x0F == 3  ->  Rat   (rat_ai)
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
 * - frog_rat_to_hero_proximity_and_direction
 *   originally returned a value in AL *and* a carry flag that the two call
 *   sites use independently; both are captured in ProximityResult below.
 */

#include "zeliard.h"



/* 
 * Small helpers / tables
 */

/* Carries both outputs (AL, CF) of frog_rat_to_hero_proximity_and_direction, 
 * since both are used independently by different call sites in the original code. */
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

/* 
 * Forward declarations
 */
static void bat_ai(uint16_t m);
static void slug_ai(uint16_t m);
static void frog_ai(uint16_t m);
static void rat_ai(uint16_t m);

static void bat_step_throttle(uint16_t m);
static void bat_ai_state_00(uint16_t m);
static void bat_ai_state_40(uint16_t m);
static void bat_ai_state_80(uint16_t m);
static void bat_ai_state_c0(uint16_t m);

static void frog_jump_step(uint16_t m);
static void rat_ai_jump_step(uint16_t m); /* loc_A649 */
static void rat_ai_hop_step(uint16_t m);  /* loc_A690 */

static ProximityResult frog_rat_to_hero_proximity_and_direction(uint16_t m, uint8_t distance);

/* 
 * Monster_AI - entry point (matches void Monster_AI(Monster* m); in zeliard.h)
 * Called from dungeon.c monsters_spawning and place_monster_in_proximity_and_run_ai
 */
void Monster_AI(uint16_t m)
{
    switch (MEM8(m+4) & 0x0F) { // .flags
        case 0: bat_ai(m); return;
        case 1: slug_ai(m); return;
        case 2: frog_ai(m); return;
        case 3: rat_ai(m); return;
        default:
            /* Original jump table only has 4 entries; monster.flags low
             * nibble is only ever 0..3 for this AI module by design. */
            return;
    }
}

static void bat_ai(uint16_t m)
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
        MEM8(m+6) -= 16;
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

/* loc_A376: attempt to dive south; if blocked, snap to climbing-up state. */
static void bat_dive_end(uint16_t m)
{
    if (!move_monster_S(m)) { /* blocked: can't descend further */
        MEM8(m+9) = 0xC0; // .ai_state
    }
}

/* loc_A338: try moving east; if blocked, fall back to diving south. */
static void bat_step_E(uint16_t m)
{
    if (!move_monster_E(m)) { /* blocked */
        bat_dive_end(m);
    } else {
        MEM8(m+5) |= 0x80; // .ai_flags; facing right
    }
}

/* loc_A344: try moving west; if blocked, fall back to diving south. */
static void bat_step_W(uint16_t m)
{
    if (!move_monster_W(m)) { /* blocked */
        bat_dive_end(m);
    } else {
        MEM8(m+5) &= 0x7F; // .ai_flags; facing left
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

    if (al < 18) {
        /* --- loc_A350 --- */
        if (MEM8(m+3) == 17 || MEM8(m+3) == 16) { // .m_x_rel
            bat_dive_end(m); 
            return; 
        }
        if (MEM8(m+3) < 16) {
            if (!move_monster_NE(m)) { /* blocked */
                bat_step_E(m); 
                return; 
            }
            MEM8(m+5) |= 0x80; // .ai_flags
        } else { // m_x_rel > 17
            if (!move_monster_NW(m)) { /* blocked */
                bat_step_W(m); 
                return; 
            }
            MEM8(m+5) &= 0x7F; // .ai_flags
        }
        return;
    }

    if (al < 24) {
        /* --- loc_A32A --- */
        if (MEM8(m+3) == 17 || MEM8(m+3) == 16) { // .m_x_rel 
            bat_dive_end(m); 
            return; 
        }
        if (MEM8(m+3) < 16) {
            bat_step_E(m);
        } else { // m_x_rel > 17
            bat_step_W(m);
        }
        return;
    }

    /* al >= 24: try SE/SW diagonal first */
    if (MEM8(m+3) == 17 || MEM8(m+3) == 16) { // .m_x_rel
        bat_dive_end(m); 
        return; 
    }
    if (MEM8(m+3) < 16) {
        if (!move_monster_SE(m)) {  /* blocked */
            bat_step_E(m); 
            return; 
        }
        MEM8(m+5) |= 0x80; // .ai_flags
    } else { // m_x_rel > 17
        if (!move_monster_SW(m)) {  /* blocked */
            bat_step_W(m); 
            return; 
        }
        MEM8(m+5) &= 0x7F; // .ai_flags
    }
}

/* ai_state == 0xC0: climbing back up */
static void bat_ai_state_c0(uint16_t m)
{
    if (MEM8(m+9) & 0x20) { // .ai_state
        /* --- loc_A3BD --- */
        MEM8(m+6) = (MEM8(m+6) - 1) & 7; // .anim_counter
        if (MEM8(m+6) == 0) {
            MEM8(m+6) = 0x70;
            MEM8(m+9) = 0; // .ai_state
        }
        return;
    }

    bat_step_throttle(m);

    uint8_t blocked_diag;
    if (MEM8(m+5) & 0x80) { // .ai_flags
        blocked_diag = !move_monster_NE(m);
        if (blocked_diag) {
            MEM8(m+5) &= 0x7F; // .ai_flags
        }
    } else {
        blocked_diag = !move_monster_NW(m);
        if (blocked_diag) {
            MEM8(m+5) |= 0x80; // .ai_flags
        }
    }

    if (!blocked_diag) return;

    /* --- loc_A3AC --- */
    if (!move_monster_N(m)) { /* blocked */
        MEM8(m+9) |= 0x20; // .ai_state
        MEM8(m+6) = 2;      // .anim_counter
    }
}

/* ============================================================================
 * Slug
 */
static void slug_ai(uint16_t m)
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

    if (move_monster_S(m)) return; // free falling

    MEM8(m+6) = (MEM8(m+6) + 0x41) & 0xC3; // .anim_counter
    if (MEM8(m+6) & 0xF0) return;

    if (MEM8(m+3) < 17) { // .m_x_rel
        if (!move_monster_E(m)) return; /* blocked */
        MEM8(m+5) |= 0x80; // .ai_flags; set faced right
    } else {
        if (!move_monster_W(m)) return; /* blocked */
        MEM8(m+5) &= 0x7F; // .ai_flags; set faced left
    }
}

/* Executes one frame of an already-started jump.
 * Corresponds to loc_A4A2..loc_A4DB in the original. */
static void frog_jump_step(uint16_t m)
{
    uint8_t ah = MEM8(m+6); // .anim_counter
    uint8_t al = (uint8_t)(ah + 1) & 7;

    if (al < 7) {
        MEM8(m+6) = (uint8_t)(al | (ah & 0xF0)); // .anim_counter

        const uint8_t *angle_table = (MEM8(m+5) & 0x80)        // .ai_flags
            ? jump_angles_right // 1, 0, 0, 7 ; ↗→→↘
            : jump_angles_left; // 3, 4, 4, 5 ; ↙←←↖
        uint8_t angle = angle_table[(uint8_t)(ah - 2)];

        if (monster_move_in_direction(m, angle)) {
            return; /* moved fine, jump continues next frame */
        }

        /* blocked mid-jump: maybe reverse direction */
        ProximityResult pr = frog_rat_to_hero_proximity_and_direction(m, 8);
        if (!pr.carry) {
            MEM8(m+5) ^= 0x80; // .ai_flags
        }
        /* fall through: jump animation is finished */
    }

    /* loc_A4DB: end of jump */
    MEM8(m+9) &= 0xF7; // .ai_state
    MEM8(m+6) = 0;      // .anim_counter
    move_monster_S(m);
}

static void frog_ai(uint16_t m)
{
    if (!check_monster_on_aggressive_ground(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }

    if (MEM8(m+8) == 0) MEM8(m+8) = 1; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    if (MEM8(m+9) & 0x08) { // already mid-jump
        frog_jump_step(m);
        return;
    }

    MEM8(m+6) = (MEM8(m+6) + 0x21) & 0xE1; // .anim_counter
    if (move_monster_S(m)) return; /* moved south fine, nothing more to do */

    /* Blocked moving south: decide whether to start a jump. */
    uint8_t start_jump = 0;

    ProximityResult pr = frog_rat_to_hero_proximity_and_direction(m, 8);
    if (pr.carry) {
        start_jump = 1;
    } else if (!(MEM8(m+6) & 0xE0)) {
        pr = frog_rat_to_hero_proximity_and_direction(m, 8);
        if (pr.value == 0xFF) {
            start_jump = 1;
        } else {
            MEM8(m+5) = (MEM8(m+5) & 0x7F) | pr.value; // .ai_flags
            MEM8(m+6) = 2;                              // .anim_counter
            MEM8(m+9) |= 0x08;                           // .ai_state
        }
    }
    /* else: anim_counter still busy, do nothing this frame (implicit return) */

    if (start_jump) {
        MEM8(m+6) = 2;      // .anim_counter
        MEM8(m+9) |= 0x08;  // .ai_state
        frog_jump_step(m);
    }
}

static void rat_ai(uint16_t m)
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

    if (MEM8(m+9) & 0x08) {  // .ai_state
        rat_ai_jump_step(m); 
        return; 
    }
    if (MEM8(m+9) & 0x10) {  // .ai_state
        rat_ai_hop_step(m);  
        return; 
    }

    if (move_monster_S(m)) return; /* CF=0 success -> stop */

    if (!(MEM8(m+9) & 0x04)) { // .ai_state
        /* --- wandering branch (was loc_A5C5) --- */

        uint16_t addr = coords_to_prox_addr(MEM8(m+3), MEM8(m+2)); // .m_x_rel, .currY
        uint16_t lookahead = 36 * 2;
        if (MEM8(m+5) & 0x80) lookahead++; // .ai_flags
        addr = (uint16_t)(addr + lookahead);

        wrap_map_from_above(&addr);
        uint8_t tile = MEM8(addr);

        if (!is_blocking(tile)) { // pit ahead
            MEM8(m+6) = 0;      // .anim_counter
            MEM8(m+9) |= 0x08;  // .ai_state
            return;
        }

        /* loc_A5F4 */ // solid ground ahead
        MEM8(m+6) = (MEM8(m+6) + 1) & 3; // .anim_counter

        if (!(MEM8(m+9) & 0x02)) { // .ai_state
            uint8_t old_timer = MEM8(m+10); // .ai_timer
            MEM8(m+10) = old_timer + 0x10;
            if (old_timer < 0xF0) {
                /* falls through to loc_A60C below */
            } else {
                MEM8(m+9) |= 0x04; // .ai_state
                return;
            }
        }

        /* loc_A60C */
        pr = frog_rat_to_hero_proximity_and_direction(m, 6);
        if (pr.carry) {
            MEM8(m+5) &= 0xFD;  // .ai_flags
            MEM8(m+10) = 0;     // .ai_timer
        }

        if (MEM8(m+5) & 0x80) { // .ai_flags
            if (!move_monster_E(m)) { /* blocked */
                MEM8(m+6) = 0;                            // .anim_counter
                MEM8(m+9) = (MEM8(m+9) | 0x10) & 0x1F;     // .ai_state
            }
        } else {
            if (!move_monster_W(m)) { /* blocked */
                MEM8(m+6) = 0;                            // .anim_counter
                MEM8(m+9) = (MEM8(m+9) | 0x10) & 0x1F;     // .ai_state
            }
        }
        return;
    }

    /* --- chasing branch (was inline after the goto loc_A5C5 check) --- */

    MEM8(m+6) = (uint8_t)((MEM8(m+6) & 0xF1) | 0x04); // .anim_counter

    pr = frog_rat_to_hero_proximity_and_direction(m, 6);
    if (pr.value != 0xFF) { // hero within ±6 vertically; 0 if monster to the right of hero, 80h if to the left
        MEM8(m+5) = (MEM8(m+5) & 0x7F) | pr.value; // .ai_flags: set facing towards hero
        MEM8(m+6) = 0;                             // .anim_counter
        MEM8(m+9) = (MEM8(m+9) | 0x02) & 0xFB;     // .ai_state
        return;
    }

    /* loc_A57B */
    uint8_t old = MEM8(m+6); // .anim_counter
    MEM8(m+6) = (uint8_t)(old + 0x40);
    if (old < 0xC0) return; /* CF=0 -> stop */

    /* loc_A582 */
    uint8_t v = (uint8_t)(((MEM8(m+6) + 1) & 1) + 4); // .anim_counter
    MEM8(m+6) = v;

    uint8_t old_state = MEM8(m+9); // .ai_state
    MEM8(m+9) = (uint8_t)(old_state + 0x40);
    if (old_state < 0xC0) return; /* CF=0 -> stop */

    /* loc_A595: time to pick a new random direction */
    MEM8(m+9) &= 0xFB; // .ai_state
    MEM8(m+5) &= 0x7F; // .ai_flags

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

    const uint8_t *angle_table = (MEM8(m+5) & 0x80) // .ai_flags
        ? jump_angles_right // 1, 0, 0, 7 ; ↗→→↘
        : jump_angles_left; // 3, 4, 4, 5 ; ↙←←↖
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

    const uint8_t *angle_table = (MEM8(m+5) & 0x80) // .ai_flags
        ? rat_jump_angles_right // 2, 1, 1, 0, 0, 7, 7, 6  ;  ↑↗↗→→↘↘↓
        : rat_jump_angles_left; // 2, 3, 3, 4, 4, 5, 5, 6  ;  ↓↙↙←←↖↖↑
    uint8_t angle = angle_table[idx];

    if (!monster_move_in_direction(m, angle)) { /* blocked: loc_A6CF */
        MEM8(m+9) = ((MEM8(m+9) & 0xEF) | 0x04); // .ai_state
        if (MEM8(m+6) != 0) { // .anim_counter
            MEM8(m+6) = 3;
        }
    }
}

/* 
 * Proximity helpers shared by Frog/Rat
 */

// NC, al=FF if monster is too far from hero vertically
// CF if monster faced towards hero, al = 0 if monster to the right of hero, 80h if to the left
static ProximityResult frog_rat_to_hero_proximity_and_direction(uint16_t m, uint8_t distance)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t abs_dy  = (dy & 0x80) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= distance) {
        // monster too far away vertically from hero
        return (ProximityResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m+3) < 17) { // .m_x_rel
        int carry = (MEM8(m+5) & 0x80) != 0; // .ai_flags (bit 7 is facing direction (1=right, 0=left))
        // monster to the left of hero; carry if facing right
        return (ProximityResult){ .value = 0x80, .carry = carry };
    } else {
        int carry = (MEM8(m+5) & 0x80) == 0; // .ai_flags
        // monster to the right of hero; carry if facing left
        return (ProximityResult){ .value = 0x00, .carry = carry };
    }
}
