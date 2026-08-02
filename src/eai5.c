/*
 * Monster AI for the 5 monster types handled by this AI overlay
 * (monster.flags & 0x0F):
 *   0 -> "Sentry" top half    (man_top_ai)    - drives itself
 *        *and* the paired bottom-half segment stored immediately
 *        after it in the monster array (see "twin" note below). Paces
 *        toward the center of the proximity window and periodically
 *        fires a single projectile toward the hero.
 *   1 -> "Sentry" bottom half (man_bottom_ai) - purely
 *        passive: every field it needs (position, facing, animation)
 *        is written directly by the top half's AI, so its own AI proc
 *        is a no-op.
 *   2 -> a ground monster that, when a nearby free monster slot is
 *        available, teleports that slot's monster ("partner") to
 *        appear just off-screen next to the hero (red_egg_ai).
 *   3 -> a ground monster with a walk/charge-dash behaviour
 *        (eyeball_ai).
 *   4 -> a flying monster that climbs, hovers, dives at the hero, then
 *        climbs back up (vestlet_ai).
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - "m" is the monster pointer, i.e. the original "si".
 * - The monster struct is 16 (0x10) bytes long. The "Sentry" (case 0/1)
 *   is drawn as two stacked sprites (top half / bottom half) that
 *   occupy two consecutive slots in the monster array; the top half's
 *   AI pokes the bottom half's fields directly by adding 0x10 to its
 *   own offsets:
 *       m+0x10 == twin.currX        m+0x12 == twin.currY
 *       m+0x13 == twin.m_x_rel      m+0x15 == twin.ai_flags
 *       m+0x16 == twin.anim_counter
 *   These are accessed below exactly as in the original (si+0x10 etc.),
 *   with a comment at each use.
 * - Every helper below that mirrors an asm "proc" which the caller
 *   tested with jb/jnb (carry) returns an int that IS the carry flag:
 *   nonzero (1) means CF=1 (the original jb branch), 0 means CF=0
 *   (jnb branch) - EXCEPT for the shared, pre-existing utility
 *   functions declared in zeliard.h (move_monster_*, is_blocking,
 *   Find_Monsters_Near_Hero, ...), which keep the normal "nonzero
 *   means it happened / succeeded" C convention already established
 *   by eai1.c / eai2.c.
 * - monster_to_hero_proximity_and_direction mirrors sub_A5C2: a fixed
 *   4-row vertical distance check plus a facing-direction check,
 *   returning both a "value" byte and a carry flag exactly as the
 *   original sub does (analogous to, but not identical in threshold
 *   to, sub_A8F4 in eai2.c, which uses a 5-row range).
 */

#include "zeliard.h"

/*
 * Small helpers / tables
 */

typedef struct {
    uint8_t value; /* AL on return */
    int     carry; /* CF on return (1 = set) */
} ProxResult;

/*
 * Forward declarations
 */
static void man_top_ai(uint16_t m);
static void man_bottom_ai(uint16_t m);
static void red_egg_ai(uint16_t m);
static void eyeball_ai(uint16_t m);
static void vestlet_ai(uint16_t m);

/* Shared helpers */
static ProxResult monster_to_hero_proximity_and_direction(uint16_t m); /* sub_A5C2 */

/* Sentry (twin) helpers */
static int  check_grounded_or_step_down(uint16_t m);        /* sub_A56A */
static int  check_ledge_below(uint16_t m);                   /* sub_A590 */
static int  move_east_and_sync_twin(uint16_t m);              /* sub_A460 */
static int  check_wall_ahead_E(uint16_t m);                    /* sub_A486 */
static int  move_west_and_sync_twin(uint16_t m);                /* sub_A4E5 */
static int  check_wall_ahead_W(uint16_t m);                      /* sub_A50B */
static void man_hit_reaction(uint16_t m);                 /* loc_A435 */
static void man_end_of_frame_sync(uint16_t m);                  /* loc_A449 */
static void man_normal_state(uint16_t m);                        /* loc_A36D */
static void man_maybe_start_attack(uint16_t m);                   /* loc_A3B6 */
static void man_patrol_step(uint16_t m);                           /* loc_A381 */
static void man_align_to_center_column(uint16_t m);                 /* loc_A391 */
static void man_attack_step(uint16_t m);                             /* loc_A3D2 */
static void man_fire_projectile(uint16_t m);                           /* loc_A3F2 */

/* Type 2 helpers */
static void red_egg_hit_check(uint16_t m);                    /* loc_A604 */
static void red_egg_try_teleport_partner(uint16_t m);          /* loc_A641 */
static void red_egg_teleport_west(uint16_t m, uint16_t partner, uint8_t idx, uint16_t own_addr);  /* loc_A667.. */
static void red_egg_teleport_east(uint16_t m, uint16_t partner, uint8_t idx, uint16_t own_addr);   /* loc_A6D9.. */
static void red_egg_finalize_teleported_partner(uint16_t m, uint16_t partner, uint8_t idx);         /* loc_A749 */
static void red_egg_move_and_state(uint16_t m);                /* loc_A780 */
static void red_egg_dive_state(uint16_t m);                     /* loc_A7FF */
static void red_egg_after_fall_step(uint16_t m);                 /* loc_A7A9 */
static void red_egg_face_toward_hero_row(uint16_t m, uint8_t val); /* loc_A7B8 */
static void red_egg_aligned_row(uint16_t m);                        /* loc_A7D7 */
static void red_egg_try_move_west_then_east(uint16_t m);              /* loc_A7DE */
static void red_egg_try_move_east_then_west(uint16_t m);                /* loc_A7EA */

/* Type 3 helpers */
static void eyeball_after_fall(uint16_t m);          /* loc_A83D */
static void eyeball_walk_cycle(uint16_t m);           /* loc_A83D (ai_state&2) */
static void eyeball_maybe_start_charge(uint16_t m);    /* loc_A87A */
static void eyeball_prewalk_timer(uint16_t m);          /* loc_A89B */
static void eyeball_throttled_step(uint16_t m);          /* loc_A8B4 */
static void eyeball_single_step(uint16_t m);              /* loc_A8BB */
static void eyeball_charge_dash(uint16_t m);               /* loc_A8DB */

/* Type 4 helpers */
static void vestlet_search_state(uint16_t m);      /* default state */
static void vestlet_cycle_anim(uint16_t m);          /* loc_A958 */
static void vestlet_fly_step(uint16_t m);              /* loc_A966 */
static void vestlet_after_fly_throttle(uint16_t m);      /* loc_A972 */
static void vestlet_dive_state(uint16_t m);                /* loc_A993 */
static void vestlet_dive_step(uint16_t m);                   /* loc_A9A0 */
static void vestlet_dive_advance(uint16_t m);                  /* loc_A9AD */
static void vestlet_climb_state(uint16_t m);                     /* loc_A9BC */
static void vestlet_climb_ne(uint16_t m);                          /* loc_A9BC (m_x_rel<=0x10) */
static void vestlet_climb_nw(uint16_t m);                            /* loc_A9DD */


/*
 * Monster_AI_5 - entry point (mirrors sub_A337's switch on
 * monster.flags & 0x0F; only cases 0..4 exist in the original jump
 * table jpt_A341).
 */
void Monster_AI_5(uint16_t m)
{
    switch (MEM8(m+4) & 0x0F) { // .flags
        case 0: man_top_ai(m);    return;
        case 1: man_bottom_ai(m); return;
        case 2: red_egg_ai(m);    return;
        case 3: eyeball_ai(m);    return;
        case 4: vestlet_ai(m);    return;
        default:
            /* Original jump table only has 5 entries; monster.flags
             * low nibble is only ever 0..4 for this AI module. */
            return;
    }
}


/*
 * sub_A5C2: shared proximity+facing check used by both the Sentry
 * (case 0) and the Charger (case 3). Checks whether the hero is
 * within 4 rows vertically and, if so, whether the monster is already
 * facing the hero.
 */
static ProxResult monster_to_hero_proximity_and_direction(uint16_t m)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t abs_dy = (dy & 0x80) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= 4) {
        return (ProxResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m+3) < 0x11) { // .m_x_rel: monster to the left of the hero
        return (ProxResult){ .value = 0x80, .carry = (MEM8(m+5) & 0x80) != 0 }; // facing right => facing the hero
    } else { // monster at/right of the hero
        return (ProxResult){ .value = 0x00, .carry = (MEM8(m+5) & 0x80) == 0 }; // facing left => facing the hero
    }
}


/*
 * "Sentry" (top half runs the AI; bottom half is a passive twin)
 */

static void man_top_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 0x18; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: this half was hit
        man_hit_reaction(m);
        return;
    }

    if (!check_grounded_or_step_down(m)) return; /* CF=0: fell one row this frame, done */

    if (MEM8(m+9) & 1) { // .ai_state: currently attacking
        man_attack_step(m);
        return;
    }

    man_normal_state(m);
}

/* Boarman-bottom-style passive twin: all of its state is driven by
 * man_top_ai through the "twin" struct writes described above. */
static void man_bottom_ai(uint16_t m)
{
    (void)m;
}

/* sub_A56A: tries to step one row down (with a mirrored update of the
 * twin's currY); also treats sitting exactly on the left/right edge of
 * the proximity strip (m_x_rel == 0 or 0x23) as "grounded". Returns 1
 * if the monster did NOT step down (caller should run walk/attack
 * logic this frame), 0 if it fell one row (caller stops). */
static int check_grounded_or_step_down(uint16_t m)
{
    if (MEM8(m+3) == 0) return 1;     // .m_x_rel == 0 (left edge)
    if (MEM8(m+3) == 0x23) return 1;  // .m_x_rel == 35 (right edge)

    if (check_ledge_below(m)) return 1; // solid ground (or ledge flag) below

    MEM8(m+2) = (MEM8(m+2) + 1) & 0x3F;       // .currY++
    MEM8(m+0x12) = (MEM8(m+0x12) + 1) & 0x3F; // twin.currY++ (si+0x12)
    return 0;
}

/* sub_A590: looks 4 rows below the monster (2 columns wide) for a
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

/* sub_A460: move one column east (with map-width wraparound) and
 * mirror the new X position into the twin. Returns 1 if blocked (near
 * the right edge of the wander range, or a wall/ledge ahead), 0 if it
 * moved. */
static int move_east_and_sync_twin(uint16_t m)
{
    if (MEM8(m+3) >= 0x22) return 1; // .m_x_rel >= 34: too close to the right edge

    if (check_wall_ahead_E(m)) return 1; // sub_A486: wall/ledge blocks the step

    uint16_t new_x = (uint16_t)(MEM16(m+0) + 1);
    if (new_x == MEM16(ADDR_MAP_WIDTH)) new_x = 0; // wrap
    MEM16(m+0) = new_x;      // .currX
    MEM16(m+0x10) = new_x;   // twin.currX
    MEM8(m+3)++;             // .m_x_rel
    MEM8(m+0x13)++;          // twin.m_x_rel
    return 0;
}

/* sub_A486: looks 4 rows straight down, 2 columns to the right of the
 * monster, for a wall that would block an eastward step. Returns 1 if
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

/* sub_A4E5: move one column west (with map-width wraparound) and
 * mirror the new X position into the twin. Returns 1 if blocked, 0 if
 * it moved. */
static int move_west_and_sync_twin(uint16_t m)
{
    if (MEM8(m+3) < 2) return 1; // .m_x_rel < 2: too close to the left edge

    if (check_wall_ahead_W(m)) return 1; // sub_A50B: wall/ledge blocks the step

    uint16_t new_x = (uint16_t)(MEM16(m+0) - 1);
    if (new_x == 0xFFFF) new_x = (uint16_t)(MEM16(ADDR_MAP_WIDTH) - 1); // wrap
    MEM16(m+0) = new_x;     // .currX
    MEM16(m+0x10) = new_x;  // twin.currX
    MEM8(m+3)--;            // .m_x_rel
    MEM8(m+0x13)--;         // twin.m_x_rel
    return 0;
}

/* sub_A50B: mirror image of check_wall_ahead_E, looking 1 column to
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

/* loc_A435: reached when the top half has just been hit. Forces the
 * hit-bit on for both halves (and the "twin recently hit" bits) before
 * handing off to the common hero-hits-monster handler. */
static void man_hit_reaction(uint16_t m)
{
    uint8_t al = (uint8_t)((MEM8(m+5) & 0xBF) | 0x20); // .ai_flags, hit-bit forced on, bit6 cleared
    MEM8(m+5) = al;
    MEM8(m+0x15) = al | 0x60; // twin.ai_flags
    Hero_Hits_monster(m);
}

/* loc_A449: end-of-frame housekeeping; mirrors anim_counter into the
 * twin's anim_counter, and copies the facing bit into the twin's
 * ai_flags, leaving the twin's other ai_flags bits untouched. */
static void man_end_of_frame_sync(uint16_t m)
{
    MEM8(m+0x16) = MEM8(m+6); // twin.anim_counter = .anim_counter
    uint8_t facing = (uint8_t)(MEM8(m+5) & 0x80); // .ai_flags facing bit
    MEM8(m+0x15) = (uint8_t)(facing | (MEM8(m+0x15) & 0x7F)); // twin.ai_flags
}

/* loc_A36D (ai_state&1 == 0): decide whether to start an attack, or
 * throttle toward the next patrol step. */
static void man_normal_state(uint16_t m)
{
    ProxResult pr = monster_to_hero_proximity_and_direction(m); // sub_A5C2
    if (pr.carry) {
        man_maybe_start_attack(m); // loc_A3B6
        return;
    }

    int sum = MEM8(m+6) + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum >= 0x100) { // throttle due this frame
        man_patrol_step(m); // loc_A381
    } else {
        man_end_of_frame_sync(m); // loc_A449
    }
}

/* loc_A3B6: reached when already facing the hero and in range; 25%
 * chance (and only on a specific animation phase) to begin the attack
 * windup, otherwise just patrol. */
static void man_maybe_start_attack(uint16_t m)
{
    if (get_random() & 0xC0) { // 75% chance: skip the attack this frame
        man_patrol_step(m);
        return;
    }
    if ((uint8_t)(~MEM8(m+6)) & 3) { // only trigger on a specific anim phase
        man_patrol_step(m);
        return;
    }
    MEM8(m+9) |= 1;  // .ai_state: begin attack
    MEM8(m+6) = 8;    // .anim_counter
    man_end_of_frame_sync(m); // loc_A449
}

/* loc_A381: throttled patrol tick; only steps every 4th animation
 * frame. */
static void man_patrol_step(uint16_t m)
{
    MEM8(m+6) = (MEM8(m+6) + 1) & 7; // .anim_counter
    if (MEM8(m+6) & 3) {
        man_end_of_frame_sync(m); // loc_A449: not due yet
        return;
    }
    man_align_to_center_column(m); // loc_A391
}

/* loc_A391: walks toward the center of the proximity window (column
 * 0x10), flipping to face the direction of travel. */
static void man_align_to_center_column(uint16_t m)
{
    if (MEM8(m+3) > 0x10) { // .m_x_rel: right of center -> approach west
        if (move_west_and_sync_twin(m) == 0) { // moved
            MEM8(m+5) &= 0x7F; // face left
        }
    } else { // at/left of center -> approach east
        if (move_east_and_sync_twin(m) == 0) { // moved
            MEM8(m+5) |= 0x80; // face right
        }
    }
    man_end_of_frame_sync(m); // loc_A449
}

/* loc_A3D2: per-frame windup while attacking; fires at animation
 * phase 0xB, ends the attack at phase 0xC. */
static void man_attack_step(uint16_t m)
{
    int sum = MEM8(m+6) + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) { // not due yet
        man_end_of_frame_sync(m); // loc_A449
        return;
    }

    MEM8(m+6)++; // .anim_counter
    uint8_t phase = MEM8(m+6) & 0x0F;
    if (phase == 0x0B) {
        man_fire_projectile(m); // loc_A3F2 (ends with loc_A449 itself)
        return;
    }
    if (phase == 0x0C) {
        MEM8(m+9) &= 0xFE; // .ai_state: end the attack
        MEM8(m+6) = 3;
    }
    man_end_of_frame_sync(m); // loc_A449
}

/* The original byte_A41B/A428 put the raw base tile index 0xB1 here.
 * In this JS port byte 2 is a *projectile-type index* into the DUNGEONS[]
 * `projectiles` table (same remap as eai2/eai3: toad=1, boarman=0,
 * earthworm=0); mp50/mp51 define the Sentry's shot as group 0, whose
 * frames [0x31,0x32,0x33,0x34] are exactly the tiles the original
 * computes from base tile 0xB1. */
static uint8_t man_shot_right[13] = { 0,0, 0, 0, 0x14, 0, 0x28, 0,0,0,0,0,0 }; // byte_A41B/A41C (facing right, dir=0)
static uint8_t man_shot_left[13]  = { 0,0, 0, 0, 0x14, 4, 0x28, 0,0,0,0,0,0 }; // byte_A428/A429 (facing left, dir=4)

/* loc_A3F2: fires a single projectile in the direction the monster is
 * currently facing. */
static void man_fire_projectile(uint16_t m)
{
    uint8_t x = MEM8(m+3);                 // .m_x_rel
    uint8_t y = (uint8_t)(MEM8(m+2) + 1);  // .currY + 1

    man_shot_left[0]  = x;
    man_shot_left[1]  = y;
    man_shot_right[0] = (uint8_t)(x + 1);
    man_shot_right[1] = y;

    uint8_t *desc = (MEM8(m+5) & 0x80) ? man_shot_right : man_shot_left; // .ai_flags facing
    Add_Projectile_To_Array(desc);

    man_end_of_frame_sync(m); // loc_A449
}


/*
 * Type 2 - teleports a nearby free monster slot to appear beside the
 * hero when hit (and not already mid-teleport).
 */

static void red_egg_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 0x10; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: being hit
        red_egg_hit_check(m);
        return;
    }
    red_egg_move_and_state(m); // loc_A780
}

/* loc_A604: some hit types kill/damage the monster outright; anything
 * else clears the hit flag and either resumes normal movement (if
 * already mid-teleport-sequence) or attempts a teleport. */
static void red_egg_hit_check(uint16_t m)
{
    uint8_t hit_type = MEM8(m+5) & 0x1F;
    if (hit_type == 4 || hit_type == 5 || hit_type == 8 ||
        (hit_type == 1 && MEM8(ADDR_SWORD_TYPE) == SWORD_ENCHANTMENT)) {
        Hero_Hits_monster(m);
        return;
    }

    MEM8(m+5) &= 0xDF; // .ai_flags: clear the hit bit
    if (MEM8(m+9) & 2) { // .ai_state
        red_egg_move_and_state(m); // loc_A780
        return;
    }
    red_egg_try_teleport_partner(m); // loc_A641
}

/* loc_A641: find a free monster slot near the hero and, if found,
 * attempt to teleport it into view on whichever side this monster is
 * facing. */
static void red_egg_try_teleport_partner(uint16_t m)
{
    uint16_t partner;
    uint8_t idx;
    if (Find_Monsters_Near_Hero(m, &partner, &idx)) { // returns 1 when NO free slot is found
        red_egg_move_and_state(m); // loc_A780
        return;
    }

    uint16_t own_addr = coords_to_prox_addr(MEM8(m+3), MEM8(m+2)); // .m_x_rel, .currY

    if (MEM8(m+5) & 0x80) { // facing right
        red_egg_teleport_east(m, partner, idx, own_addr); // loc_A6D9..
    } else {
        red_egg_teleport_west(m, partner, idx, own_addr); // loc_A667..
    }
}

/* loc_A667..loc_A749 (facing-left variant): checks a 2-wide x 3-tall
 * clear area two columns to the right and one row above the monster,
 * and if clear, teleports the partner there. */
static void red_egg_teleport_west(uint16_t m, uint16_t partner, uint8_t idx, uint16_t own_addr)
{
    int8_t signed_x = (int8_t)MEM8(m+3); // .m_x_rel
    if (signed_x < 0) { red_egg_move_and_state(m); return; } // never true in practice
    if ((uint8_t)signed_x >= 0x20) { red_egg_move_and_state(m); return; }

    // ..01
    // Ee23
    // ee45
    uint16_t addr = (uint16_t)(own_addr + 2 - PROX_COLS); // start from point 0
    wrap_map_from_below(&addr);

    for (int row = 0; row < 3; row++) {
        // check tile at point 0, 2, 4
        if (is_blocking(MEM8(addr))) { red_egg_move_and_state(m); return; }
        addr++; // check tile at point 1, 3, 5
        if (is_blocking(MEM8(addr))) { red_egg_move_and_state(m); return; }
        addr += (PROX_COLS - 1); // return to column 0, 2, 4
        wrap_map_from_above(&addr);
    }

    addr -= (2 * PROX_COLS); // back to point 2
    wrap_map_from_below(&addr);

    uint8_t old_tile = MEM8(addr);
    MEM8(addr) = (uint8_t)(idx | 0x80);
    MEM8(ADDR_PROXIMITY_LAYER2 + idx) = old_tile;

    uint16_t new_x = (uint16_t)(MEM16(m+0) + 2);
    if (new_x >= MEM16(ADDR_MAP_WIDTH)) new_x -= MEM16(ADDR_MAP_WIDTH);

    MEM16(partner+0) = new_x;
    MEM8(partner+3) = (uint8_t)(MEM8(m+3) + 2);

    red_egg_finalize_teleported_partner(m, partner, idx); // loc_A749
}

/* loc_A6D9..loc_A749 (facing-right variant): mirror image of
 * red_egg_teleport_west, checking the area two columns to the left. */
static void red_egg_teleport_east(uint16_t m, uint16_t partner, uint8_t idx, uint16_t own_addr)
{
    uint8_t x = MEM8(m+3); // .m_x_rel
    if ((int8_t)x < 0) { red_egg_move_and_state(m); return; } // never true in practice
    if (x < 4) { red_egg_move_and_state(m); return; }

    // 01.
    // 23.Ee
    // 45.ee
    uint16_t addr = (uint16_t)(own_addr - PROX_COLS - 3); // start from point 0
    wrap_map_from_below(&addr);

    for (int row = 0; row < 3; row++) {
        // check tile at point 0, 2, 4
        if (is_blocking(MEM8(addr))) { red_egg_move_and_state(m); return; }
        addr++; // check tile at point 1, 3, 5
        if (is_blocking(MEM8(addr))) { red_egg_move_and_state(m); return; }
        addr += (PROX_COLS - 1); // return to column 0, 2, 4
        wrap_map_from_above(&addr);
    }

    addr -= (2 * PROX_COLS - 1); // back to point 3
    wrap_map_from_below(&addr);

    uint8_t old_tile = MEM8(addr);
    MEM8(addr) = (uint8_t)(idx | 0x80);
    MEM8(ADDR_PROXIMITY_LAYER2 + idx) = old_tile;

    uint16_t new_x = MEM16(m+0);
    if (new_x >= 2) {
        new_x -= 2;
    } else {
        new_x = (uint16_t)(new_x + MEM16(ADDR_MAP_WIDTH) - 2);
    }

    MEM16(partner+0) = new_x;
    MEM8(partner+3) = (uint8_t)(MEM8(m+3) - 2);

    red_egg_finalize_teleported_partner(m, partner, idx); // loc_A749
}

/* loc_A749: common tail for both teleport variants - initializes the
 * partner's remaining fields and, if the partner's index was beyond
 * the current monster count, flags this monster to resume normal
 * movement next frame. */
static void red_egg_finalize_teleported_partner(uint16_t m, uint16_t partner, uint8_t idx)
{
    MEM8(partner+2) = MEM8(m+2); // .currY
    MEM8(partner+4) = (uint8_t)(MEM8(m+4) | 0x60); // .flags
    MEM8(partner+5) = (uint8_t)(MEM8(m+5) & 0x80); // .ai_flags: just the facing bit
    MEM8(partner+6) = 4;          // .anim_counter
    MEM8(partner+7) = MEM8(m+7);  // .state_flags
    MEM8(partner+8) = 0;          // .hp
    MEM8(partner+9) = 2;          // .ai_state
    MEM8(partner+10) = 0;         // .ai_timer

    if (MEM8(ADDR_MONSTER_INDEX) < idx) {
        MEM8(m+9) |= 1; // .ai_state
    }
}

/* loc_A780: generic movement, then a small state machine gating a
 * "dive" animation. */
static void red_egg_move_and_state(uint16_t m)
{
    if(move_monster_NWE_if_on_airflow(m)) return;

    uint8_t old_state = MEM8(m+9);
    MEM8(m+9) &= 0xFE;
    if (old_state & 1) return; /* one-shot flag consumed; stop this frame */

    if (MEM8(m+9) & 2) {
        red_egg_dive_state(m); // loc_A7FF
        return;
    }

    MEM8(m+6) = (uint8_t)((MEM8(m+6) + 1) & 0xF3); // .anim_counter
    if (move_monster_S(m)) return; // moved down (airborne) -> stop this frame
    red_egg_after_fall_step(m); // loc_A7A9: grounded -> run the dive counter
}

/* loc_A7FF */
static void red_egg_dive_state(uint16_t m)
{
    MEM8(m+6) = (MEM8(m+6) + 1) & 7;
    if (MEM8(m+6) != 0) return;
    MEM8(m+9) &= 0xFD; // .ai_state
    MEM8(m+4) &= 0x9F; // .flags
}

/* loc_A7A9 */
static void red_egg_after_fall_step(uint16_t m)
{
    uint8_t val = (uint8_t)(MEM8(m+6) - 0x10);
    MEM8(m+6) = val;
    if (val & 0xF0) return; // still counting down
    red_egg_face_toward_hero_row(m, val); // loc_A7B8
}

/* loc_A7B8: once the counter runs out, turn to face the hero's row
 * (or approach it) if not already aligned. */
static void red_egg_face_toward_hero_row(uint16_t m, uint8_t val)
{
    MEM8(m+6) = (uint8_t)(val | 0x40); // .anim_counter

    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    if (hero_y == MEM8(m+2) || (uint8_t)((hero_y + 1) & 0x3F) == MEM8(m+2)) {
        red_egg_aligned_row(m); // loc_A7D7
        return;
    }

    if (MEM8(m+5) & 0x80) { // facing right
        red_egg_try_move_east_then_west(m); // loc_A7EA
    } else {
        red_egg_try_move_west_then_east(m); // loc_A7DE
    }
}

/* loc_A7D7 */
static void red_egg_aligned_row(uint16_t m)
{
    if (MEM8(m+3) <= 0x11) { // .m_x_rel
        red_egg_try_move_east_then_west(m); // loc_A7EA
        return;
    }
    red_egg_try_move_west_then_east(m); // loc_A7DE
}

/* loc_A7DE: face left and try to step west; on success, also try the
 * east/west follow-up chain. */
static void red_egg_try_move_west_then_east(uint16_t m)
{
    MEM8(m+5) &= 0x7F; // face left
    if (move_monster_W(m)) return; // moved -> stop this frame
    red_egg_try_move_east_then_west(m); // loc_A7EA: blocked -> try the other way
}

/* loc_A7EA: face right and try to step east; on success, face left
 * again and try one final step west (loc_A7F6, tail call). */
static void red_egg_try_move_east_then_west(uint16_t m)
{
    MEM8(m+5) |= 0x80; // face right
    if (move_monster_E(m)) return; // moved -> stop this frame
    MEM8(m+5) &= 0x7F; // face left
    move_monster_W(m); // loc_A7F6: blocked -> one final step west, result unused
}


/*
 * Type 3 - ground monster with a walk/charge-dash behaviour.
 */

static void eyeball_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 8; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    if(move_monster_NWE_if_on_airflow(m)) return;

    if (MEM8(m+9) & 4) { // .ai_state: charge-dash mode
        eyeball_charge_dash(m); // loc_A8DB
        return;
    }

    /* loc_A835: move_monster_S returns CF=0 on success (moved down) and
     * CF=1 on blocked, so the "jb loc_A83D" in the asm means the walk/
     * charge AI only runs while GROUNDED; while airborne it just falls. */
    if (move_monster_S(m)) return; // moved down (airborne) -> stop this frame
    eyeball_after_fall(m); // loc_A83D
}

/* loc_A83D */
static void eyeball_after_fall(uint16_t m)
{
    if (!(MEM8(m+9) & 2)) {
        eyeball_prewalk_timer(m); // loc_A89B
        return;
    }
    eyeball_walk_cycle(m);
}

/* loc_A83D (ai_state&2 branch): advances/reverses an 8-phase walk
 * animation, flipping the direction bit at each end, and triggers a
 * charge-decision check when facing changes. */
static void eyeball_walk_cycle(uint16_t m)
{
    uint8_t phase = MEM8(m+6) & 7;
    if (phase == 0) MEM8(m+9) &= 0xFE;
    if (phase == 4) MEM8(m+9) |= 1;

    if (MEM8(m+9) & 1) {
        MEM8(m+6)--;
    } else {
        MEM8(m+6)++;
    }

    phase = MEM8(m+6) & 7;
    if (phase == 0) {
        MEM8(m+5) &= 0x7F; // face left
    } else if (phase == 4) {
        MEM8(m+5) |= 0x80; // face right
    } else {
        return; // mid-cycle, wait
    }
    eyeball_maybe_start_charge(m); // loc_A87A
}

/* loc_A87A: if now facing and near the hero, begin a charge; else 50%
 * chance to reset back to the base walking state. */
static void eyeball_maybe_start_charge(uint16_t m)
{
    ProxResult pr = monster_to_hero_proximity_and_direction(m); // sub_A5C2
    if (pr.carry) {
        MEM8(m+9) = 4;   // .ai_state: begin charge
        MEM8(m+10) = 0;   // .ai_timer
        return;
    }
    if (!(get_random() & 0x80)) return; // 50% chance: do nothing
    MEM8(m+9) = 0;   // .ai_state: reset
    MEM8(m+10) = 0;   // .ai_timer
}

/* loc_A89B: counts up while not yet aligned/close to the hero; once
 * close (regardless of facing), starts the walk-cycle mode; always
 * also runs the movement throttle. */
static void eyeball_prewalk_timer(uint16_t m)
{
    ProxResult pr = monster_to_hero_proximity_and_direction(m); // sub_A5C2
    if (pr.carry) {
        MEM8(m+9) = 4;
        MEM8(m+10) = 0;
        return;
    }
    MEM8(m+10)++; // .ai_timer
    if ((pr.value & 7) == 0) { // 0 or 0x80: close; 0xFF: far
        MEM8(m+9) |= 2;
    }
    eyeball_throttled_step(m); // loc_A8B4
}

/* loc_A8B4 */
static void eyeball_throttled_step(uint16_t m)
{
    int sum = MEM8(m+6) + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) return; // not due yet
    eyeball_single_step(m); // loc_A8BB
}

/* loc_A8BB: one step in the current facing direction; on success,
 * flags the walk-cycle mode to begin. */
static void eyeball_single_step(uint16_t m)
{
    if (MEM8(m+5) & 0x80) { // facing right
        if (move_monster_E(m)) MEM8(m+9) = 2;
    } else {
        if (move_monster_W(m)) MEM8(m+9) = 2;
    }
}

/* loc_A8DB: counts up to the charge, then dashes two steps at once. */
static void eyeball_charge_dash(uint16_t m)
{
    MEM8(m+10)++; // .ai_timer
    if (MEM8(m+10) < 5) {
        eyeball_single_step(m); // loc_A8BB
        return;
    }
    MEM8(m+6) = 5; // .anim_counter
    if (MEM8(m+5) & 0x80) { // facing right
        move_monster_E(m);
        if (move_monster_E(m)) {
            MEM8(m+9) = 2;
            MEM8(m+6) = 4;
        }
    } else {
        move_monster_W(m);
        if (move_monster_W(m)) {
            MEM8(m+9) = 2;
            MEM8(m+6) = 0;
        }
    }
}


/*
 * Type 4 - flying monster: hover/search, dive at the hero, climb back
 * up.
 */

static void vestlet_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 8; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags
        Hero_Hits_monster(m);
        return;
    }

    if(move_monster_NWE_if_on_airflow(m)) return;

    if (MEM8(m+9) & 1) {
        vestlet_dive_state(m); // loc_A993
        return;
    }
    if (MEM8(m+9) & 2) {
        vestlet_climb_state(m); // loc_A9BC
        return;
    }
    vestlet_search_state(m);
}

/* default state: if close to the center column (0x10..0x12), begin a
 * dive; otherwise keep cycling the hover animation. */
static void vestlet_search_state(uint16_t m)
{
    if (MEM8(m+3) <= 0x0F || MEM8(m+3) > 0x12) { // .m_x_rel
        vestlet_cycle_anim(m); // loc_A958
        return;
    }
    MEM8(m+9) |= 1; // .ai_state: begin dive
    MEM8(m+6) = 4;   // .anim_counter
    vestlet_fly_step(m); // loc_A966
}

/* loc_A958 */
static void vestlet_cycle_anim(uint16_t m)
{
    uint8_t low = (uint8_t)((MEM8(m+6) + 1) & 3);
    MEM8(m+6) = (uint8_t)((MEM8(m+6) & 0xF0) | low);
    vestlet_fly_step(m); // loc_A966
}

/* loc_A966 */
static void vestlet_fly_step(uint16_t m)
{
    move_monster_N(m); // result unused

    int sum = MEM8(m+6) + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) return; // not due yet
    vestlet_after_fly_throttle(m); // loc_A972
}

/* loc_A972: nudges sideways toward the center column, with a
 * follow-up check in the opposite direction on success (same
 * oscillation pattern as red_egg's row-alignment chain). */
static void vestlet_after_fly_throttle(uint16_t m)
{
    if (MEM8(m+3) > 0x10) { // .m_x_rel
        if (!move_monster_W(m)) move_monster_E(m);
        return;
    }
    if (!move_monster_E(m)) move_monster_W(m);
}

/* loc_A993: dive animation; only actually descends once the low 3
 * bits of anim_counter reach 5. */
static void vestlet_dive_state(uint16_t m)
{
    uint8_t phase = MEM8(m+6) & 7;
    if (phase < 5) {
        MEM8(m+6)++; // full-byte increment (not masked), as in the original
        return;
    }
    vestlet_dive_step(m); // loc_A9A0
}

/* loc_A9A0 */
static void vestlet_dive_step(uint16_t m)
{
    move_monster_S(m); // first attempt, result unused
    if (move_monster_S(m)) return; // second attempt moved -> keep diving
    vestlet_dive_advance(m); // loc_A9AD: grounded -> advance the dive counter
}

/* loc_A9AD */
static void vestlet_dive_advance(uint16_t m)
{
    MEM8(m+6) = (MEM8(m+6) + 1) & 7;
    if (MEM8(m+6) != 0) return;
    MEM8(m+9) = 2; // .ai_state: dive finished, begin climb
}

/* loc_A9BC: climb back up, diagonally toward the center column. */
static void vestlet_climb_state(uint16_t m)
{
    if (MEM8(m+3) > 0x10) { // .m_x_rel
        vestlet_climb_nw(m); // loc_A9DD
        return;
    }
    vestlet_climb_ne(m);
}

static void vestlet_climb_ne(uint16_t m)
{
    move_monster_N(m); // result unused
    if (move_monster_NE(m)) return; // moved -> stop this frame
    if (move_monster_N(m)) return;  // moved -> stop this frame
    MEM8(m+9) &= 0xFD; // .ai_state: both blocked -> climb finished
}

/* loc_A9DD */
static void vestlet_climb_nw(uint16_t m)
{
    move_monster_N(m); // result unused
    if (move_monster_NW(m)) return; // moved -> stop this frame
    if (move_monster_N(m)) return;  // moved -> stop this frame
    MEM8(m+9) &= 0xFD; // .ai_state: both blocked -> climb finished
}
