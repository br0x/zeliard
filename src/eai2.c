/*
 * eai2.c - translated from eai2.asm
 *
 * Monster AI for the 6 monster types handled by this AI overlay
 * (monster.flags & 0x0F):
 *   0 -> Boarman-top     (boarman_top_ai)    - drives itself *and* the
 *        paired Boarman-bottom segment stored immediately after it in
 *        the monster array (see "twin" note below).
 *   1 -> Boarman-bottom  (boarman_bottom_ai) - purely passive: every
 *        field it needs (position, facing, animation) is written
 *        directly by the Boarman-top's AI, so its own AI proc is a
 *        no-op.
 *   2 -> Blue Slime      (blue_slime_ai)
 *   3 -> Red Toad        (red_toad_ai)
 *   4,5-> Green Bat / Magic Bat (bat_ai) - both flying enemies share
 *        the exact same AI routine (identical to the "Bat" AI already
 *        translated in eai1.c).
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - "m" is the monster pointer, i.e. the original "si".
 * - The monster struct is 0x10 (16) bytes long. Boarman is drawn as two
 *   stacked sprites (top half / bottom half) that occupy two
 *   consecutive slots in the monster array; the top half's AI pokes
 *   the bottom half's fields directly by adding 0x10 to its own
 *   offsets:
 *       m+0x10 == twin.currX        m+0x12 == twin.currY
 *       m+0x13 == twin.m_x_rel      m+0x15 == twin.ai_flags
 *       m+0x16 == twin.anim_counter
 *   These are accessed below exactly as in the original (si+0x10 etc.),
 *   with a comment at each use.
 * - Every helper below that mirrors an asm "proc" which the caller
 *   tested with jb/jnb (carry) returns an int that IS the carry flag:
 *   nonzero (1) means CF=1 (the original jb branch), 0 means CF=0
 *   (jnb branch) - EXCEPT for the shared, pre-existing utility
 *   functions declared in zeliard.h (move_monster_*,
 *   monster_move_in_direction, check_monster_on_aggressive_ground,
 *   is_blocking, ...), which keep the normal "nonzero means it
 *   happened / succeeded" C convention already established by eai1.c.
 * - monster_to_hero_proximity_and_direction mirrors sub_A8F4, which is
 *   shared verbatim by the Boarman and the Red Toad in the original
 *   (a fixed 5-row vertical distance check; c.f.
 *   frog_rat_to_hero_proximity_and_direction in eai1.c, which is the
 *   same idea with a caller-supplied distance).
 * - The projectile-descriptor byte arrays (Boarman's twin spears, the
 *   Red Toad's tongue shot) are kept as raw byte buffers copied
 *   verbatim from the original data segment; their internal field
 *   layout is opaque to this AI logic and consumed by
 *   Add_Projectile_To_Array, assumed declared elsewhere.
 */

#include "zeliard.h"



/*
 * Small helpers / tables
 */

typedef struct {
    uint8_t value; /* AL on return */
    int     carry; /* CF on return (1 = set) */
} ProxResult;

/* jump_angles_*: NE,E,E,SE / NW,W,W,SW - identical tables to the ones
 * used by the Frog and Rat in eai1.c, reused here by the Red Toad. */
static const uint8_t toad_jump_angles_right[4] = { 1, 0, 0, 7 };
static const uint8_t toad_jump_angles_left[4]  = { 3, 4, 4, 5 };

/*
 * Forward declarations
 */
static void boarman_top_ai(uint16_t m);
static void boarman_bottom_ai(uint16_t m);
static void blue_slime_ai(uint16_t m);
static void red_toad_ai(uint16_t m);
static void bat_ai(uint16_t m);

/* Boarman helpers */
static int  boarman_try_fall(uint16_t m);                  /* sub_A653 */
static int  check_ledge_below(uint16_t m);                  /* sub_A679 */
static int  move_east_and_sync_twin(uint16_t m);             /* sub_A549 */
static int  check_wall_ahead_E(uint16_t m);                   /* sub_A56F */
static int  move_west_and_sync_twin(uint16_t m);               /* sub_A5CE */
static int  check_wall_ahead_W(uint16_t m);                     /* sub_A5F4 */
static void boarman_hit_reaction(uint16_t m);                    /* loc_A6AB */
static void boarman_end_of_frame_sync(uint16_t m);                /* loc_A6BF */
static void boarman_patrol_step(uint16_t m);                       /* loc_A3BC.. */
static void boarman_align_to_attack_position(uint16_t m);            /* loc_A3F0.. */
static void boarman_reroll_and_maybe_charge(uint16_t m);               /* loc_A459 */
static void boarman_random_flinch(uint16_t m);                          /* loc_A488 */
static void boarman_fire_spears(uint16_t m);                              /* loc_A4BA */
static ProxResult monster_to_hero_proximity_and_direction(uint16_t m);      /* sub_A8F4 */

/* Blue Slime helpers */
static void slime_hop_direction(uint16_t m);                /* loc_A72C/loc_A760 */

/* Red Toad helpers */
static void toad_grounded(uint16_t m);                       /* loc_A7ED.. */
static void toad_maybe_start_windup(uint16_t m);              /* loc_A811 */
static void toad_jump_step(uint16_t m);                        /* loc_A82B.. */
static void toad_end_jump(uint16_t m);                           /* loc_A864 */
static void toad_windup_and_shoot(uint16_t m);                    /* loc_A871.. */
static void toad_post_shot_recover(uint16_t m);                    /* loc_A8BC */

/* Bat helpers (identical logic to eai1.c's bat_ai state machine) */
static void bat_step_throttle(uint16_t m);                   /* sub_AA8D */
static void bat_state0(uint16_t m);                           /* loc_A95E */
static void bat_state1(uint16_t m);                            /* loc_A989 */
static void bat_state2(uint16_t m);                             /* loc_A99C */
static void bat_state3(uint16_t m);                              /* loc_AA3C */
static void bat_dive_end(uint16_t m);                             /* loc_AA2F */
static void bat_step_E(uint16_t m);                                /* loc_A9F1 */
static void bat_step_W(uint16_t m);                                 /* loc_A9FD */


/*
 * Monster_AI - entry point (matches void Monster_AI(uint16_t m); as used
 * throughout the game engine / dungeon.c)
 */
void Monster_AI_2(uint16_t m)
{
    switch (MEM8(m+4) & 0x0F) { // .flags
        case 0: boarman_top_ai(m);    return;
        case 1: boarman_bottom_ai(m); return;
        case 2: blue_slime_ai(m);     return;
        case 3: red_toad_ai(m);       return;
        case 4: bat_ai(m);            return;
        case 5: bat_ai(m);            return;
        default:
            /* Original jump table only has 6 entries; monster.flags low
             * nibble is only ever 0..5 for this AI module by design. */
            return;
    }
}

/* Boarman-bottom: purely passive. All of its state is driven by
 * boarman_top_ai through the "twin" struct writes described above. */
static void boarman_bottom_ai(uint16_t m)
{
    (void)m;
}


/* ============================================================================
 * Boarman (top half runs the AI; bottom half is a passive twin)
 */

static void boarman_top_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 8; // .hp

    if ((MEM8(m+5) & 0x20) ||      // .ai_flags: this half was hit
        (MEM8(m+0x15) & 0x40)) {   // twin.ai_flags: the other half was hit
        boarman_hit_reaction(m);
        return;
    }

    if (!boarman_try_fall(m)) return; /* CF=0: fell one row this frame, done */

    if (MEM8(m+9) & 1) { // .ai_state: currently charging up to attack
        MEM8(m+6)++; // .anim_counter
        if (MEM8(m+6) == 6) {
            boarman_fire_spears(m);
        } else if (MEM8(m+6) == 8) {
            MEM8(m+9) &= 0xFC; // .ai_state: end the charge
            MEM8(m+6) = 0;
        }
        boarman_end_of_frame_sync(m);
        return;
    }

    ProxResult pr = monster_to_hero_proximity_and_direction(m);
    if (!pr.carry) {
        if (pr.value != 0xFF) {
            MEM8(m+5) ^= 0x80; // .ai_flags: flip facing towards the hero
        }
        boarman_patrol_step(m);
    } else {
        boarman_align_to_attack_position(m);
    }
}

/* sub_A653: tries to step one row down (with a mirrored update of the
 * twin's currY); also treats sitting exactly on the left/right edge of
 * the proximity strip (m_x_rel == 0 or 0x23) as "grounded". Returns 1
 * if the Boarman did NOT step down (caller should run walk/attack
 * logic this frame), 0 if it fell one row (caller stops). */
static int boarman_try_fall(uint16_t m)
{
    if (MEM8(m+3) == 0) return 1;     // .m_x_rel == 0 (left edge)
    if (MEM8(m+3) == 0x23) return 1;  // .m_x_rel == 35 (right edge)

    if (check_ledge_below(m)) return 1; // solid ground (or ledge flag) below

    MEM8(m+2) = (MEM8(m+2) + 1) & 0x3F;       // .currY++
    MEM8(m+0x12) = (MEM8(m+0x12) + 1) & 0x3F; // twin.currY++ (si+0x12)
    return 0;
}

/* sub_A679: looks 4 rows below the Boarman (2 columns wide) for a
 * blocking tile. Returns 1 if a blocking tile is found in either
 * column (solid ground); otherwise returns bit 7 of the two (passable)
 * tile values OR'd together, mirroring the original's final
 * "add al,al" carry-out. */
static int check_ledge_below(uint16_t m)
{
    uint16_t addr = coords_to_prox_addr(MEM8(m+3), MEM8(m+2)); // .m_x_rel, .currY
    addr += 0x90; // 4 rows down (4 * 36-column proximity map)
    wrap_map_from_above(&addr);

    for (int col = 0; col < 2; col++) {
        if (is_blocking(MEM8(addr + col))) return 1;
    }
    uint8_t combined = (uint8_t)(MEM8(addr + 0) | MEM8(addr + 1));
    return (combined & 0x80) != 0;
}

/* sub_A549: move Boarman-top one column east (with map-width
 * wraparound) and mirror the new X position into the twin. Returns 1
 * if blocked (near the right edge of the wander range, or a wall/ledge
 * ahead), 0 if it moved. */
static int move_east_and_sync_twin(uint16_t m)
{
    if (MEM8(m+3) >= 0x22) return 1; // .m_x_rel >= 34: too close to the right edge

    if (check_wall_ahead_E(m)) return 1; // sub_A56F: wall/ledge blocks the step

    uint16_t new_x = (uint16_t)(MEM16(m+0) + 1);
    if (new_x == MEM16(ADDR_MAP_WIDTH)) new_x = 0; // wrap
    MEM16(m+0) = new_x;      // .currX
    MEM16(m+0x10) = new_x;   // twin.currX
    MEM8(m+3)++;             // .m_x_rel
    MEM8(m+0x13)++;          // twin.m_x_rel
    return 0;
}

/* sub_A56F: looks 4 rows straight down, 2 columns to the right of the
 * Boarman, for a wall that would block an eastward step. Returns 1 if
 * a blocking tile is found in those 4 rows; otherwise returns bit 7 of
 * the OR of those 4 tiles plus the tile one row above the start (5
 * tiles total), mirroring the original's final carry-out. */
static int check_wall_ahead_E(uint16_t m)
{
    uint16_t addr = (uint16_t)(coords_to_prox_addr(MEM8(m+3), MEM8(m+2)) + 2);

    for (int i = 0; i < 4; i++) {
        if (is_blocking(MEM8(addr))) return 1;
        addr += 0x24; // one row down (36-wide proximity map)
        wrap_map_from_above(&addr);
    }

    uint8_t combined = 0;
    for (int i = 0; i < 5; i++) {
        addr -= 0x24;
        wrap_map_from_below(&addr);
        combined |= MEM8(addr);
    }
    return (combined & 0x80) != 0;
}

/* sub_A5CE: move Boarman-top one column west (with map-width
 * wraparound) and mirror the new X position into the twin. Returns 1
 * if blocked, 0 if it moved. */
static int move_west_and_sync_twin(uint16_t m)
{
    if (MEM8(m+3) < 2) return 1; // .m_x_rel < 2: too close to the left edge

    if (check_wall_ahead_W(m)) return 1; // sub_A5F4: wall/ledge blocks the step

    uint16_t new_x = (uint16_t)(MEM16(m+0) - 1);
    if (new_x == 0xFFFF) new_x = (uint16_t)(MEM16(ADDR_MAP_WIDTH) - 1); // wrap
    MEM16(m+0) = new_x;     // .currX
    MEM16(m+0x10) = new_x;  // twin.currX
    MEM8(m+3)--;            // .m_x_rel
    MEM8(m+0x13)--;         // twin.m_x_rel
    return 0;
}

/* sub_A5F4: mirror image of check_wall_ahead_E, looking 1 column to
 * the left instead of 2 to the right, with an extra 1-column shift
 * applied before the backward OR-scan (exactly as in the original). */
static int check_wall_ahead_W(uint16_t m)
{
    uint16_t addr = (uint16_t)(coords_to_prox_addr(MEM8(m+3), MEM8(m+2)) - 1);

    for (int i = 0; i < 4; i++) {
        if (is_blocking(MEM8(addr))) return 1;
        addr += 0x24;
        wrap_map_from_above(&addr);
    }

    addr -= 1;
    uint8_t combined = 0;
    for (int i = 0; i < 5; i++) {
        addr -= 0x24;
        wrap_map_from_below(&addr);
        combined |= MEM8(addr);
    }
    return (combined & 0x80) != 0;
}

/* loc_A6AB: reached when either half of the Boarman has just been hit.
 * Propagates a "being hit" flag into both halves before handing off to
 * the common hero-hits-monster handler. */
static void boarman_hit_reaction(uint16_t m)
{
    uint8_t al = (uint8_t)((MEM8(m+0x15) & 0xBF) | 0x20); // twin.ai_flags, hit-bit forced on
    MEM8(m+5) = al;              // .ai_flags
    MEM8(m+0x15) = al | 0x60;    // twin.ai_flags
    Hero_Hits_monster(m);
}

/* loc_A6BF: end-of-frame housekeeping for the Boarman-top; mirrors its
 * own anim_counter into the twin's anim_counter, and copies its own
 * facing bit into the twin's ai_flags, leaving the twin's other
 * ai_flags bits untouched. */
static void boarman_end_of_frame_sync(uint16_t m)
{
    MEM8(m+0x16) = MEM8(m+6); // twin.anim_counter = .anim_counter
    uint8_t facing = (uint8_t)(MEM8(m+5) & 0x80); // .ai_flags facing bit
    MEM8(m+0x15) = (uint8_t)(facing | (MEM8(m+0x15) & 0x7F)); // twin.ai_flags
}

/* loc_A3BC..loc_A3E9: throttled east/west patrol step while not yet
 * aligned with the hero. */
static void boarman_patrol_step(uint16_t m)
{
    int sum = MEM8(m+6) + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) { // CF=0: no overflow, just throttling this frame
        boarman_end_of_frame_sync(m);
        return;
    }

    MEM8(m+6) = (MEM8(m+6) + 1) & 3; // .anim_counter

    if (!(MEM8(m+5) & 0x80)) { // facing left: try stepping west
        if (move_west_and_sync_twin(m)) { // blocked
            MEM8(m+5) |= 0x80; // flip to face right
        }
    } else { // facing right: try stepping east
        if (move_east_and_sync_twin(m)) { // blocked
            MEM8(m+5) &= 0x7F; // flip to face left
        }
    }
    boarman_end_of_frame_sync(m);
}

/* Random per-frame "how close should I stand" thresholds (loc_A459
 * re-rolls these); shared by all Boarman instances, exactly as in the
 * original (they are file-scope bytes, not per-monster fields). */
static uint8_t boarman_align_gap_right = 8; // byte_A6D6
static uint8_t boarman_align_gap_left  = 8; // byte_A6D7

/* loc_A3F0..loc_A44A: walks the Boarman toward/away from the anchor
 * column (0x11) to settle at a random standoff distance before
 * charging. */
static void boarman_align_to_attack_position(uint16_t m)
{
    MEM8(m+5) &= 0x7F; // .ai_flags: tentatively face left

    if (MEM8(m+3) <= 0x11) { // .m_x_rel <= 17: at/left of the anchor column
        MEM8(m+5) |= 0x80;   // face right (towards the anchor)
    }

    if (MEM8(m+5) & 0x80) {
        /* facing right: m_x_rel <= 0x11 */
        uint8_t gap = (uint8_t)(0x11 - MEM8(m+3));
        if (gap == boarman_align_gap_right) {
            boarman_reroll_and_maybe_charge(m);
            return;
        }
        if (gap < boarman_align_gap_right) {
            /* already close: back off further west */
            if (move_west_and_sync_twin(m)) { // blocked
                boarman_random_flinch(m);
                return;
            }
            MEM8(m+6) = (MEM8(m+6) - 1) & 3;
            boarman_end_of_frame_sync(m);
            return;
        }
        /* still far: approach east */
        if (move_east_and_sync_twin(m)) { // blocked
            boarman_reroll_and_maybe_charge(m);
            return;
        }
        MEM8(m+6) = (MEM8(m+6) + 1) & 3;
        boarman_end_of_frame_sync(m);
        return;
    }

    /* facing left: m_x_rel > 0x11 */
    uint8_t gap = (uint8_t)(MEM8(m+3) - 0x11);
    if (gap == boarman_align_gap_left) {
        boarman_reroll_and_maybe_charge(m);
        return;
    }
    if (gap < boarman_align_gap_left) {
        /* already close: back off further east */
        if (move_east_and_sync_twin(m)) { // blocked
            boarman_random_flinch(m);
            return;
        }
        MEM8(m+6) = (MEM8(m+6) - 1) & 3;
        boarman_end_of_frame_sync(m);
        return;
    }
    /* still far: approach west */
    if (move_west_and_sync_twin(m)) { // blocked
        boarman_reroll_and_maybe_charge(m);
        return;
    }
    MEM8(m+6) = (MEM8(m+6) + 1) & 3;
    boarman_end_of_frame_sync(m);
}

/* loc_A459: re-roll the standoff-distance thresholds, then check
 * whether the Boarman is now aligned closely enough with the hero to
 * begin a charge. */
static void boarman_reroll_and_maybe_charge(uint16_t m)
{
    boarman_align_gap_right = (uint8_t)(((get_random() & 3) - 1) + 8);
    boarman_align_gap_left  = (uint8_t)(((get_random() & 3) - 2) + 9);

    ProxResult pr = monster_to_hero_proximity_and_direction(m);
    if (pr.carry) {
        MEM8(m+9) |= 1;  // .ai_state: begin charge
        MEM8(m+6) = 4;    // .anim_counter
    }
    boarman_end_of_frame_sync(m);
}

/* loc_A488: reached when a positioning step was blocked; 50% chance to
 * do nothing, otherwise begin a charge anyway. */
static void boarman_random_flinch(uint16_t m)
{
    if (get_random() & 1) {
        return; /* 50% chance: do nothing this frame */
    }
    MEM8(m+9) |= 3;  // .ai_state: begin charge
    MEM8(m+6) = 4;    // .anim_counter
    boarman_end_of_frame_sync(m);
}

/* Fixed-position spear-throw descriptors, patched with (x,y) before
 * each shot. The top half throws an "arcing" spear whose per-frame
 * direction comes from spear_angles_right/left; the bottom half throws
 * a simpler, differently-tagged spear (byte_A517/A518 and
 * byte_A524/A525 in the original). Field meanings beyond position and
 * the angle-table pointer are internal to Add_Projectile_To_Array and
 * are not modeled further here - they are copied verbatim from the
 * original data segment. */
static const uint8_t spear_angles_right[12] = { 1,1,1,0,0,7,7,7,7,7,7,0xFF }; // byte_A531
static const uint8_t spear_angles_left[12]  = { 3,3,3,4,4,5,5,5,5,5,5,0xFF }; // byte_A53D

typedef struct {
    uint8_t x, y;
    uint8_t mid[7];              // 0x9A,0,0xFF,0x40,8,0,0 (verbatim)
    const uint8_t *angle_table;  // byte_A531 or byte_A53D
    uint8_t tail[2];             // 0,0
} BoarmanArcSpear;

static BoarmanArcSpear spear_top_right = { 0,0, {0x9A,0,0xFF,0x40,8,0,0}, spear_angles_right, {0,0} }; // byte_A4FD
static BoarmanArcSpear spear_top_left  = { 0,0, {0x9A,0,0xFF,0x40,8,0,0}, spear_angles_left,  {0,0} }; // byte_A50A

static uint8_t spear_bottom_right[13] = { 0,0, 0x9A,0,7,0,0x14,0,0,0,0,0,0 }; // byte_A517/A518
static uint8_t spear_bottom_left[13]  = { 0,0, 0x9A,0,7,4,0x14,0,0,0,0,0,0 }; // byte_A524/A525

/* loc_A4BA: fires the Boarman's paired spears (one from each half). */
static void boarman_fire_spears(uint16_t m)
{
    uint8_t x = MEM8(m+3);                 // .m_x_rel
    uint8_t y = (uint8_t)(MEM8(m+2) + 2);  // .currY + 2

    spear_top_left.x = x;      spear_top_left.y = y;
    spear_bottom_left[0] = x;  spear_bottom_left[1] = y;
    spear_top_right.x = (uint8_t)(x + 1);      spear_top_right.y = y;
    spear_bottom_right[0] = (uint8_t)(x + 1);  spear_bottom_right[1] = y;

    void *bx = &spear_top_right;
    void *ax = &spear_bottom_right;
    if (!(MEM8(m+5) & 0x80)) { // facing left
        bx = &spear_top_left;
        ax = &spear_bottom_left;
    }
    if (MEM8(m+9) & 2) { // .ai_state: alternate the pairing
        bx = ax;
    }
    Add_Projectile_To_Array(bx);
}

/* sub_A8F4: shared by the Boarman and the Red Toad. Checks whether the
 * hero is within 5 rows vertically and, if so, whether the monster is
 * already facing the hero. */
static ProxResult monster_to_hero_proximity_and_direction(uint16_t m)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t abs_dy = (dy & 0x80) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= 5) {
        return (ProxResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m+3) < 0x11) { // .m_x_rel: monster to the left of the hero
        int carry = (MEM8(m+5) & 0x80) != 0; // facing right = facing the hero
        return (ProxResult){ .value = 0x80, .carry = carry };
    } else { // monster to the right of (or level with) the hero
        int carry = (MEM8(m+5) & 0x80) == 0; // facing left = facing the hero
        return (ProxResult){ .value = 0x00, .carry = carry };
    }
}


/* ============================================================================
 * Blue Slime
 */
static void blue_slime_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 4; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    if (move_monster_S(m)) return; /* still falling */

    if (!(MEM8(m+9) & 1)) { // .ai_state: waiting to start a hop
        MEM8(m+6) = (MEM8(m+6) + 1) & 7; // .anim_counter
        if (MEM8(m+6) != 0) return;

        MEM8(m+9) |= 1;
        MEM8(m+9) &= 0xFD;
        MEM8(m+10) = 0; // .ai_timer
        return;
    }

    if (!(MEM8(m+9) & 2)) { // .ai_state: hop windup
        MEM8(m+6) = (uint8_t)((MEM8(m+10) & 3) + 8); // .anim_counter
        MEM8(m+10)++; // .ai_timer
        if (MEM8(m+10) != 8) return;

        MEM8(m+9) |= 2;
        slime_hop_direction(m);
        return;
    }

    /* mid-hop */
    MEM8(m+6) = (uint8_t)((MEM8(m+10) & 3) + 8);
    MEM8(m+10)++;
    if (MEM8(m+10) == 0x0C) {
        MEM8(m+9) &= 0xFE; // .ai_state: hop finished
        MEM8(m+6) = 0;
    }
}

/* loc_A72C/loc_A760: pick a random side, then step toward whichever
 * direction is open, based on a tile roughly two columns ahead. */
static void slime_hop_direction(uint16_t m)
{
    int8_t r = (int8_t)get_random();
    uint16_t addr = coords_to_prox_addr(MEM8(m+3), MEM8(m+2)); // .m_x_rel, .currY

    if (r < 0) {
        addr += 0x47;
        wrap_map_from_above(&addr);
        if (is_blocking(MEM8(addr))) {
            move_monster_W(m);
        } else {
            move_monster_E(m);
        }
    } else {
        addr += 0x4A;
        wrap_map_from_above(&addr);
        if (is_blocking(MEM8(addr))) {
            move_monster_E(m);
        } else {
            move_monster_W(m);
        }
    }
}


/* ============================================================================
 * Red Toad
 */
static void red_toad_ai(uint16_t m)
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

    if (MEM8(m+9) & 2) { // .ai_state: recovering after a shot
        toad_post_shot_recover(m);
        return;
    }
    if (MEM8(m+9) & 4) { // .ai_state: winding up to shoot
        toad_windup_and_shoot(m);
        return;
    }

    if (!(MEM8(m+9) & 8)) { // .ai_state: not jumping
        MEM8(m+6) = (MEM8(m+6) + 0x21) & 0xE1; // .anim_counter
        if (move_monster_S(m)) return; /* still falling */
        toad_grounded(m);
        return;
    }

    toad_jump_step(m);
}

/* loc_A7ED: while grounded, either react to being close & facing the
 * hero, or keep animating / turn to face the hero once the current
 * animation cycle finishes. */
static void toad_grounded(uint16_t m)
{
    ProxResult pr = monster_to_hero_proximity_and_direction(m);
    if (pr.carry) {
        toad_maybe_start_windup(m);
        return;
    }
    if (MEM8(m+6) & 0xE0) return; /* still busy animating */

    pr = monster_to_hero_proximity_and_direction(m);
    if (pr.value == 0xFF) {
        toad_maybe_start_windup(m);
        return;
    }
    MEM8(m+5) = (MEM8(m+5) & 0x7F) | pr.value; // .ai_flags: face the hero
    MEM8(m+6) = 2;      // .anim_counter
    MEM8(m+9) |= 8;      // .ai_state: begin a jump
}

/* loc_A811: 50% chance to start a jump right away, otherwise begin
 * winding up for a shot instead. */
static void toad_maybe_start_windup(uint16_t m)
{
    if (get_random() & 1) {
        MEM8(m+6) = 2;    // .anim_counter
        MEM8(m+9) |= 8;   // .ai_state: begin jump
        toad_jump_step(m); // the original falls straight through into the jump step
        return;
    }
    MEM8(m+9) |= 4;  // .ai_state: begin windup-to-shoot
    MEM8(m+10) = 0;  // .ai_timer
}

/* loc_A82B: per-frame step of an in-progress jump (mirrors
 * frog_jump_step / rat_ai_jump_step in eai1.c). */
static void toad_jump_step(uint16_t m)
{
    uint8_t ah = MEM8(m+6); // .anim_counter (old value)
    uint8_t al = (uint8_t)(ah + 1) & 7;

    if (al >= 7) {
        toad_end_jump(m);
        return;
    }

    MEM8(m+6) = (uint8_t)(al | (ah & 0xF0)); // .anim_counter

    const uint8_t *angle_table = (MEM8(m+5) & 0x80) // .ai_flags
        ? toad_jump_angles_right // 1,0,0,7 ; NE,E,E,SE
        : toad_jump_angles_left; // 3,4,4,5 ; NW,W,W,SW
    uint8_t angle = angle_table[(uint8_t)(ah - 2)];

    if (monster_move_in_direction(m, angle)) {
        /* moved fine: check whether this hop has brought the toad
         * close enough to the hero to cut the jump short */
        ProxResult pr = monster_to_hero_proximity_and_direction(m);
        if (!pr.carry) {
            MEM8(m+5) ^= 0x80; // .ai_flags: flip facing
        }
        toad_end_jump(m);
    }
    /* else: blocked this sub-step, try again next frame */
}

/* loc_A864: end the jump and fall back to the ground. */
static void toad_end_jump(uint16_t m)
{
    MEM8(m+9) &= 0xF7; // .ai_state: clear the jump bit
    MEM8(m+6) = 0;      // .anim_counter
    move_monster_S(m);
}

/* Tongue-shot projectile templates (bytes 0-1 = X,Y, patched per shot;
 * the remainder is the fixed template copied verbatim from the
 * original data segment). */
static uint8_t toad_shot_desc_right[13] = { 0,0, 0x9E,0,6,0,0x14,0,0,0,0,0,0 }; // byte_A8D2/A8D3 (facing right)
static uint8_t toad_shot_desc_left[13]  = { 0,0, 0x9E,0,6,4,0x14,0,0,0,0,0,0 }; // byte_A8DF/A8E0 (facing left)

/* loc_A871: windup timer before firing the tongue shot. */
static void toad_windup_and_shoot(uint16_t m)
{
    MEM8(m+10)++; // .ai_timer
    MEM8(m+6) = (MEM8(m+6) + 1) & 1; // .anim_counter
    if (MEM8(m+10) != 4) return;

    MEM8(m+6) = 7; // .anim_counter

    uint8_t y = (uint8_t)((MEM8(m+2) + 1) & 0x3F); // .currY + 1, wrapped
    toad_shot_desc_left[0]  = MEM8(m+3);           // .m_x_rel
    toad_shot_desc_left[1]  = y;
    toad_shot_desc_right[0] = (uint8_t)(MEM8(m+3) + 1);
    toad_shot_desc_right[1] = y;

    uint8_t *desc = (MEM8(m+5) & 0x80) ? toad_shot_desc_right : toad_shot_desc_left; // .ai_flags
    Add_Projectile_To_Array(desc);

    MEM8(m+9) &= 0xFB; // .ai_state: clear windup bit
    MEM8(m+9) |= 2;    // .ai_state: enter recovery
    MEM8(m+10) = 0;    // .ai_timer
}

/* loc_A8BC: recovery pause after firing, before returning to normal
 * ground behaviour. */
static void toad_post_shot_recover(uint16_t m)
{
    MEM8(m+10)++; // .ai_timer
    MEM8(m+6) = (MEM8(m+6) + 1) & 1; // .anim_counter
    if (MEM8(m+10) == 6) {
        MEM8(m+9) &= 0xFD; // .ai_state: recovery finished
    }
}


/* ============================================================================
 * Bat (Green Bat / Magic Bat share this AI; logic is identical to
 * "Bat" in eai1.c, reproduced here since this is a separate overlay).
 */
static void bat_ai(uint16_t m)
{
    if (!check_monster_on_aggressive_ground(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }

    if (MEM8(m+8) == 0) MEM8(m+8) = 3; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    switch ((MEM8(m+9) >> 6) & 3) { // .ai_state (top 2 bits)
        case 0: bat_state0(m); break;
        case 1: bat_state1(m); break;
        case 2: bat_state2(m); break;
        case 3: bat_state3(m); break;
    }
}

static void bat_step_throttle(uint16_t m)
{
    MEM8(m+6) = (MEM8(m+6) + 1) & 7; // .anim_counter
    if (MEM8(m+6) == 7) {
        MEM8(m+6) = 3;
    }
}

/* ai_state top bits == 0: flying up, looking for a spot to dive */
static void bat_state0(uint16_t m)
{
    move_monster_N(m); /* return value unused, as in the original */

    if (MEM8(m+6) != 0) { // .anim_counter
        MEM8(m+6) -= 0x10;
        return;
    }

    uint8_t al = (uint8_t)(MEM8(m+3) - 0x11); // .m_x_rel
    if (al >= 0x0A) {
        al = (uint8_t)(0x11 - MEM8(m+3));
        if (al >= 7) {
            MEM8(m+6) = 0;
            return;
        }
    }
    MEM8(m+9) = 0x40; // .ai_state
    MEM8(m+6) = 0;
}

/* ai_state top bits == 1: short pause before diving */
static void bat_state1(uint16_t m)
{
    MEM8(m+6) = (MEM8(m+6) + 1) & 7;
    if (MEM8(m+6) == 3) { // .anim_counter
        MEM8(m+9) = 0x80; // .ai_state
    }
}

/* loc_AA2F: attempt to dive south; if blocked, snap to climbing-up state. */
static void bat_dive_end(uint16_t m)
{
    if (!move_monster_S(m)) { /* blocked: can't descend further */
        MEM8(m+9) = 0xC0; // .ai_state
    }
}

/* loc_A9F1: try moving east; if blocked, fall back to diving south. */
static void bat_step_E(uint16_t m)
{
    if (!move_monster_E(m)) { /* blocked */
        bat_dive_end(m);
    } else {
        MEM8(m+5) |= 0x80; // .ai_flags: facing right
    }
}

/* loc_A9FD: try moving west; if blocked, fall back to diving south. */
static void bat_step_W(uint16_t m)
{
    if (!move_monster_W(m)) { /* blocked */
        bat_dive_end(m);
    } else {
        MEM8(m+5) &= 0x7F; // .ai_flags: facing left
    }
}

/* ai_state top bits == 2: diving toward the hero */
static void bat_state2(uint16_t m)
{
    bat_step_throttle(m);

    if (MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) != 0) {
        MEM8(m+9) = 0xC0; // .ai_state
        return;
    }

    uint8_t al = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    al = (uint8_t)(al + 0x15) & 0x3F;

    if (al < 0x12) {
        if (MEM8(m+3) == 0x11 || MEM8(m+3) == 0x10) { // .m_x_rel
            bat_dive_end(m);
            return;
        }
        if (MEM8(m+3) < 0x10) {
            if (!move_monster_NE(m)) { bat_step_E(m); return; }
            MEM8(m+5) |= 0x80; // .ai_flags
        } else {
            if (!move_monster_NW(m)) { bat_step_W(m); return; }
            MEM8(m+5) &= 0x7F; // .ai_flags
        }
        return;
    }

    if (al < 0x18) {
        if (MEM8(m+3) == 0x11 || MEM8(m+3) == 0x10) { // .m_x_rel
            bat_dive_end(m);
            return;
        }
        if (MEM8(m+3) < 0x10) {
            bat_step_E(m);
        } else {
            bat_step_W(m);
        }
        return;
    }

    /* al >= 0x18: try SE/SW diagonal first */
    if (MEM8(m+3) == 0x11 || MEM8(m+3) == 0x10) { // .m_x_rel
        bat_dive_end(m);
        return;
    }
    if (MEM8(m+3) < 0x10) {
        if (!move_monster_SE(m)) { bat_step_E(m); return; }
        MEM8(m+5) |= 0x80; // .ai_flags
    } else {
        if (!move_monster_SW(m)) { bat_step_W(m); return; }
        MEM8(m+5) &= 0x7F; // .ai_flags
    }
}

/* ai_state top bits == 3: climbing back up */
static void bat_state3(uint16_t m)
{
    if (MEM8(m+9) & 0x20) { // .ai_state
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

    if (!move_monster_N(m)) { /* blocked */
        MEM8(m+9) |= 0x20; // .ai_state
        MEM8(m+6) = 2;      // .anim_counter
    }
}
