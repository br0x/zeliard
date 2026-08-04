/*
 * Monster AI for the 5 monster types handled by this AI overlay
 * (monster.flags & 0x0F); see monster_xp/monster_damage in the
 * original overlay header (100/80, 100/80, 50/40, 50/40, 0/80):
 *   0 -> "Type0" top half     (type0_top_ai)    - drives itself *and*
 *        the paired passive half stored immediately after it in the
 *        monster array (see "twin" note below). HP defaults to 0x30.
 *   1 -> "Type0" bottom half  (type0_bottom_ai) - purely passive: every
 *        field it needs (position, facing, animation) is written
 *        directly by the top half's AI, so its own AI proc is a no-op.
 *   2 -> "Type2" (monster2_ai) - a hovering/diving flier that homes in
 *        vertically on the hero's row then steps diagonally toward
 *        him (sub_A6B8). HP defaults to 0x10.
 *   3 -> "Type3" (monster3_ai) - a grounded hopper that patrols until
 *        it lines up with the hero, then leaps horizontally at him
 *        (sub_A857). HP defaults to 8.
 *   4 -> "Type4" (monster4_ai) - a stationary hazard with no HP of its
 *        own (it forces its own "hit" bit on every frame); it waits
 *        for the hero to be under it, drops, then falls back into a
 *        generic proximity check (sub_A95F).
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - "m" is the monster pointer, i.e. the original "si".
 * - The monster struct is 16 bytes long. Type0 is drawn as two
 *   stacked sprites (top half / bottom half) that occupy two
 *   consecutive slots in the monster array; the top half's AI pokes
 *   the bottom half's fields directly by adding 0x10 to its own
 *   offsets:
 *       m+0x10 == twin.currX        m+0x12 == twin.currY
 *       m+0x13 == twin.m_x_rel      m+0x14 == twin.flags
 *       m+0x15 == twin.ai_flags     m+0x16 == twin.anim_counter
 *   These are accessed below exactly as in the original (si+0x10 etc.),
 *   with a comment at each use.
 * - Every helper below that mirrors an asm "proc" which the caller
 *   tested with jb/jnb (carry) returns an int that IS the carry flag:
 *   nonzero (1) means CF=1 (the original jb branch), 0 means CF=0
 *   (jnb branch) - EXCEPT for the shared, pre-existing utility
 *   functions declared in zeliard.h (move_monster_*,
 *   monster_move_in_direction, Check_Vertical_Distance_Between_Hero_And_Monster,
 *   is_blocking, ...), which keep the normal "nonzero means it
 *   happened / succeeded" C convention already established by eai1.c
 *   and eai2.c.
 * - monster_to_hero_proximity_and_direction_4 (sub_A527) and
 *   monster_to_hero_proximity_and_direction_8 (sub_A828) mirror the
 *   shared helper of the same shape seen in eai2.c
 *   (monster_to_hero_proximity_and_direction / sub_A8F4): a fixed
 *   vertical-distance check (4 rows for Type0, 8 rows for Type2/3,
 *   the latter literally shared between both jump-table cases in the
 *   original), returning whether the monster already faces the hero.
 */

#include "zeliard.h"



/*
 * Small helpers
 */

typedef struct {
    uint8_t value; /* AL on return */
    int     carry; /* CF on return (1 = set) */
} ProxResult;

/* byte_A75E/byte_A766: shared diagonal-step angle tables used by both
 * Type2 states that walk the monster toward the hero (mostly
 * horizontal, occasionally NE/SE or NW/SW). Angle encoding matches
 * eai2.c's jump-angle tables (0=E,1=NE,3=NW,4=W,5=SW,7=SE). */
static const uint8_t type2_dir_table_right[8] = { 0, 0, 1, 0, 0, 0, 7, 0 }; // byte_A75E
static const uint8_t type2_dir_table_left[8]  = { 4, 4, 3, 4, 4, 4, 5, 4 }; // byte_A766

/*
 * Forward declarations
 */
static void type0_top_ai(uint16_t m);
static void type0_bottom_ai(uint16_t m);
static void monster2_ai(uint16_t m);
static void monster3_ai(uint16_t m);
static void monster4_ai(uint16_t m);

/* Shared proximity helpers */
static ProxResult monster_to_hero_proximity_and_direction_4(uint16_t m); /* sub_A527 */
static ProxResult monster_to_hero_proximity_and_direction_8(uint16_t m); /* sub_A828 */

/* Type0 (twin pair) helpers */
static int  type0_try_fall(uint16_t m);                    /* sub_A660 */
static int  type0_check_ledge_below(uint16_t m);            /* sub_A686 */
static int  type0_move_east_and_sync_twin(uint16_t m);        /* sub_A556 */
static int  type0_check_wall_ahead_E(uint16_t m);              /* sub_A57C */
static int  type0_move_west_and_sync_twin(uint16_t m);           /* sub_A5DB */
static int  type0_check_wall_ahead_W(uint16_t m);                 /* sub_A601 */
static void type0_death_reaction(uint16_t m);                      /* loc_A4F7 */
static void type0_end_sync(uint16_t m);                              /* loc_A508 */
static void type0_wander_step(uint16_t m);                            /* loc_A447 */
static void type0_charge_tick(uint16_t m);                              /* loc_A48D */
static void type0_fire_projectile(uint16_t m);                           /* loc_A4A4 tail */

/* Type2 (hovering flier) helpers */
static void type2_state_main(uint16_t m);      /* loc_A6F0 */
static void type2_vertical_approach(uint16_t m); /* loc_A718 */
static void type2_move_and_animate(uint16_t m);   /* loc_A72C */
static void type2_state_a(uint16_t m);              /* loc_A76E */
static void type2_state_b(uint16_t m);                /* loc_A78D */
static void type2_vertical_and_animate_b(uint16_t m);   /* loc_A7C2 */
static void type2_move_and_animate_b(uint16_t m);         /* loc_A7D6 */
static void type2_state_b_end(uint16_t m);                  /* loc_A80C */
static void type2_state_c(uint16_t m);                        /* loc_A815 */

/* Type3 (ground hopper) helpers */
static void type3_after_fall_step(uint16_t m);   /* loc_A87A */
static void type3_patrol_step(uint16_t m);         /* loc_A886 */
static void type3_begin_jump(uint16_t m);            /* loc_A8BA */
static void type3_state_jump(uint16_t m);              /* loc_A8C3 */
static int  type3_check_vertical_block(uint16_t m);      /* sub_A947 */
static void type3_flip_and_recover(uint16_t m);            /* sub_A927 */
static void type3_jump_recover(uint16_t m);                  /* loc_A934 */
static void type3_jump_maybe_end(uint16_t m);                  /* loc_A914 */

/* Type4 (stationary drop hazard) helpers */
static void type4_start_fall(uint16_t m);      /* loc_A98C */
static void type4_fall_throttle(uint16_t m);     /* loc_A9B4 */


/*
 * Monster_AI_6 - entry point (matches void Monster_AI(uint16_t m); as
 * used throughout the game engine / dungeon.c)
 */
void Monster_AI_6(uint16_t m)
{
    switch (MEM8(m+4) & 0x0F) { // .flags
        case 0: type0_top_ai(m);    return;
        case 1: type0_bottom_ai(m); return;
        case 2: monster2_ai(m);     return;
        case 3: monster3_ai(m);     return;
        case 4: monster4_ai(m);     return;
        default:
            /* Original jump table only has 5 entries; monster.flags low
             * nibble is only ever 0..4 for this AI module by design. */
            return;
    }
}


/*
 * Type0 (top half runs the AI; bottom half is a passive twin)
 */

/* Bottom half: purely passive. All of its state is driven by
 * type0_top_ai through the "twin" struct writes described above. */
static void type0_bottom_ai(uint16_t m)
{
    (void)m;
}

static void type0_top_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 0x30; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: this half was hit
        if ((MEM8(m+5) & 0x1F) == 1) {
            type0_death_reaction(m); // loc_A4F7
            return;
        }
        MEM8(m+5) &= 0x9F; // clear the hit bits (0x20, 0x40), keep the rest
    }

    MEM8(m+0x15) &= 0xBF; // twin.ai_flags: clear bit 0x40 unconditionally

    if (!type0_try_fall(m)) return; /* CF=0: fell one row this frame, done */

    if (MEM8(m+9) & 1) { // .ai_state: currently charging up to fire
        type0_charge_tick(m); // loc_A48D
        return;
    }

    ProxResult pr = monster_to_hero_proximity_and_direction_4(m); // sub_A527
    if (pr.carry) {
        if (MEM8(m+0xA) & 0xF0) { // .ai_timer: cooldown has accumulated
            MEM8(m+0xA) = 0;
            MEM8(m+6) = 0;
            MEM8(m+9) |= 1; // begin charging
            type0_end_sync(m);
            return;
        }
    }
    type0_wander_step(m); // loc_A447
}

/* sub_A660: tries to step one row down (with a mirrored update of the
 * twin's currY); also treats sitting exactly on the left/right edge of
 * the proximity strip (m_x_rel == 0 or 0x23) as "grounded". Returns 1
 * if it did NOT step down (caller should run walk/attack logic this
 * frame), 0 if it fell one row (caller stops). */
static int type0_try_fall(uint16_t m)
{
    if (MEM8(m+3) == 0) return 1;     // .m_x_rel == 0 (left edge)
    if (MEM8(m+3) == 0x23) return 1;  // .m_x_rel == 35 (right edge)

    if (type0_check_ledge_below(m)) return 1; // solid ground (or ledge flag) below

    MEM8(m+2) = (MEM8(m+2) + 1) & 0x3F;       // .currY++
    MEM8(m+0x12) = (MEM8(m+0x12) + 1) & 0x3F; // twin.currY++ (si+0x12)
    return 0;
}

/* sub_A686: looks 4 rows below (2 columns wide) for a blocking tile.
 * Returns 1 if a blocking tile is found in either column (solid
 * ground); otherwise returns bit 7 of the two (passable) tile values
 * OR'd together, mirroring the original's final "add al,al" carry-out. */
static int type0_check_ledge_below(uint16_t m)
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

/* sub_A556: move one column east (with map-width wraparound) and
 * mirror the new X position into the twin. Returns 1 if blocked (near
 * the right edge of the wander range, or a wall/ledge ahead), 0 if it
 * moved. */
static int type0_move_east_and_sync_twin(uint16_t m)
{
    if (MEM8(m+3) >= 0x22) return 1; // .m_x_rel >= 34: too close to the right edge

    if (type0_check_wall_ahead_E(m)) return 1; // sub_A57C: wall/ledge blocks the step

    uint16_t new_x = (uint16_t)(MEM16(m+0) + 1);
    if (new_x == MEM16(ADDR_MAP_WIDTH)) new_x = 0; // wrap
    MEM16(m+0) = new_x;      // .currX
    MEM16(m+0x10) = new_x;   // twin.currX
    MEM8(m+3)++;             // .m_x_rel
    MEM8(m+0x13)++;          // twin.m_x_rel
    return 0;
}

/* sub_A57C: looks 4 rows straight down, 2 columns to the right, for a
 * wall that would block an eastward step. Returns 1 if a blocking
 * tile is found in those 4 rows; otherwise returns bit 7 of the OR of
 * those 4 tiles plus the tile one row above the start (5 tiles
 * total), mirroring the original's final carry-out. */
static int type0_check_wall_ahead_E(uint16_t m)
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

/* sub_A5DB: move one column west (with map-width wraparound) and
 * mirror the new X position into the twin. Returns 1 if blocked, 0 if
 * it moved. */
static int type0_move_west_and_sync_twin(uint16_t m)
{
    if (MEM8(m+3) < 2) return 1; // .m_x_rel < 2: too close to the left edge

    if (type0_check_wall_ahead_W(m)) return 1; // sub_A601: wall/ledge blocks the step

    uint16_t new_x = (uint16_t)(MEM16(m+0) - 1);
    if (new_x == 0xFFFF) new_x = (uint16_t)(MEM16(ADDR_MAP_WIDTH) - 1); // wrap
    MEM16(m+0) = new_x;     // .currX
    MEM16(m+0x10) = new_x;  // twin.currX
    MEM8(m+3)--;            // .m_x_rel
    MEM8(m+0x13)--;         // twin.m_x_rel
    return 0;
}

/* sub_A601: mirror image of type0_check_wall_ahead_E, looking 1 column
 * to the left instead of 2 to the right, with an extra 1-column shift
 * applied before the backward OR-scan (exactly as in the original). */
static int type0_check_wall_ahead_W(uint16_t m)
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

/* loc_A4F7: reached when the top half's own low-5-bit sub-state was
 * exactly 1 (i.e. it has just been fully hit); propagates a "being
 * hit" flag into the twin before handing off to the common
 * hero-hits-monster handler. */
static void type0_death_reaction(uint16_t m)
{
    uint8_t al = (uint8_t)(MEM8(m+5) & 0x1F); // == 1 here
    al = (uint8_t)((al & 0xBF) | 0x20);
    MEM8(m+5) = al;              // .ai_flags
    al |= 0x60;
    MEM8(m+0x15) = al;           // twin.ai_flags
    Hero_Hits_monster(m);
}

/* loc_A508: end-of-frame housekeeping; mirrors anim_counter into the
 * twin's anim_counter, copies the state bits (0x60) from .flags into
 * the twin's .flags, and copies the facing bit into the twin's
 * ai_flags, leaving the twin's other bits untouched. */
static void type0_end_sync(uint16_t m)
{
    MEM8(m+0x16) = MEM8(m+6); // twin.anim_counter = .anim_counter

    uint8_t al = (uint8_t)(MEM8(m+4) & 0x60);
    MEM8(m+0x14) = (uint8_t)((MEM8(m+0x14) & 0x9F) | al); // twin.flags

    al = (uint8_t)(MEM8(m+5) & 0x80);
    MEM8(m+0x15) = (uint8_t)((MEM8(m+0x15) & 0x7F) | al); // twin.ai_flags facing bit
}

/* loc_A447: throttled random east/west wander step while not (yet)
 * charging; the direction is re-rolled every call, and the facing bit
 * only updates when the chosen step actually succeeds. */
static void type0_wander_step(uint16_t m)
{
    MEM8(m+0xA)++; // .ai_timer
    MEM8(m+6) = 1;  // .anim_counter
    MEM8(m+4) |= 0x60; // .flags

    if (get_random() & 1) {
        if (!type0_move_west_and_sync_twin(m)) { // moved
            MEM8(m+5) &= 0x7F; // face left
        }
    } else {
        if (!type0_move_east_and_sync_twin(m)) { // moved
            MEM8(m+5) |= 0x80; // face right
        }
    }
    type0_end_sync(m);
}

/* loc_A48D: per-frame tick while charging up to fire; fires once the
 * counter reaches 8, ends the charge once it wraps past 0xF. */
static void type0_charge_tick(uint16_t m)
{
    MEM8(m+6) = (uint8_t)(MEM8(m+6) + 1) & 0x0F; // .anim_counter

    if (MEM8(m+6) == 0) {
        MEM8(m+9) &= 0xFE; // .ai_state: end the charge
        MEM8(m+6) = 1;
        MEM8(m+4) |= 0x60; // .flags
        type0_end_sync(m);
        return;
    }

    if (MEM8(m+6) < 4) {
        type0_end_sync(m);
        return;
    }

    MEM8(m+4) &= 0x1F; // .flags: clear the hit/charge display bits
    if (MEM8(m+6) == 8) {
        type0_fire_projectile(m); // loc_A4A4 tail
    }
    type0_end_sync(m);
}

/* Fire-shot projectile templates (bytes 0-1 = X,Y, patched per shot;
 * remainder copied verbatim from the original data segment). The
 * "right" template (facing right) fires from one column further right
 * than the "left" template. */
static uint8_t type0_shot_right[13] = { 0, 0, 0x63, 0, 0x14, 0, 0x14, 0, 0, 0, 0, 0, 0 }; // byte_A4DD/A4DE
static uint8_t type0_shot_left[13]  = { 0, 0, 0x63, 0, 0x14, 4, 0x14, 0, 0, 0, 0, 0, 0 }; // byte_A4EA/A4EB

/* loc_A4A4 tail: patches and fires the single shot appropriate to the
 * current facing. */
static void type0_fire_projectile(uint16_t m)
{
    uint8_t x = MEM8(m+3);                 // .m_x_rel
    uint8_t y = (uint8_t)(MEM8(m+2) + 1);  // .currY + 1

    type0_shot_left[0]  = x;
    type0_shot_right[0] = (uint8_t)(x + 1);
    type0_shot_left[1]  = y;
    type0_shot_right[1] = y;

    uint8_t *desc = (MEM8(m+5) & 0x80) ? type0_shot_right : type0_shot_left; // .ai_flags
    Add_Projectile_To_Array(desc);
}

/* sub_A527: 4-row vertical distance check + facing test, shared by
 * Type0's charge-alignment logic. */
static ProxResult monster_to_hero_proximity_and_direction_4(uint16_t m)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t abs_dy = (dy & 0x80) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= 4) {
        return (ProxResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m+3) < 0x11) { // .m_x_rel: monster to the left of the hero
        return (ProxResult){ .value = 0x80, .carry = (MEM8(m+5) & 0x80) != 0 }; // facing right => facing the hero
    } else { // monster to the right of (or level with) the hero
        return (ProxResult){ .value = 0x00, .carry = (MEM8(m+5) & 0x80) == 0 }; // facing left => facing the hero
    }
}


/*
 * Type2 (hovering / diving flier)
 */
static void monster2_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 0x10; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: was hit
        MEM8(m+6) = 3;      // .anim_counter
        MEM8(m+9) = 1;      // .ai_state
        Hero_Hits_monster(m);
        return;
    }

    if (MEM8(m+9) & 2) { type2_state_b(m); return; }    // loc_A78D
    if (MEM8(m+9) & 1) { type2_state_a(m); return; }     // loc_A76E
    if (MEM8(m+9) & 4) { type2_state_c(m); return; }     // loc_A815
    type2_state_main(m);                                 // loc_A6F0
}

/* loc_A6F0: main "seek the hero's row" state. */
static void type2_state_main(uint16_t m)
{
    ProxResult pr = monster_to_hero_proximity_and_direction_8(m); // sub_A828

    if (!pr.carry) {
        if (MEM8(m+9) & 0x70) { // .ai_state: throttle counter still running
            type2_move_and_animate(m); // loc_A72C directly, skip the vertical step
            return;
        }
        if (pr.value == 0xFF) {
            uint8_t al = (uint8_t)(get_random() << 1) & 0x80;
            MEM8(m+5) = (uint8_t)((MEM8(m+5) & 0x7F) | al); // random facing
        } else {
            MEM8(m+5) = (uint8_t)((MEM8(m+5) & 0x7F) | pr.value); // face the hero
        }
    }
    type2_vertical_approach(m); // loc_A718
}

/* loc_A718: step one row toward the hero's Y, then fall into the
 * diagonal movement/animation dispatch. */
static void type2_vertical_approach(uint16_t m)
{
    uint8_t diff = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    if ((int8_t)diff >= 0) {
        move_monster_S(m);
    } else {
        move_monster_N(m);
    }
    type2_move_and_animate(m);
}

/* loc_A72C: throttled diagonal step toward the hero using the shared
 * angle tables; flips facing if the step is blocked. */
static void type2_move_and_animate(uint16_t m)
{
    MEM8(m+6) = (uint8_t)(MEM8(m+6) + 1) & 3; // .anim_counter
    MEM8(m+9) = (uint8_t)(MEM8(m+9) + 0x10);  // .ai_state: throttle counter

    uint8_t idx = (uint8_t)((MEM8(m+9) >> 4) & 7);
    const uint8_t *table = (MEM8(m+5) & 0x80) ? type2_dir_table_right : type2_dir_table_left;
    uint8_t angle = table[idx];

    if (!monster_move_in_direction(m, angle)) { // blocked
        MEM8(m+5) ^= 0x80;
    }
}

/* loc_A76E: brief "settle" state entered right after being hit, before
 * moving on to state_b. */
static void type2_state_a(uint16_t m)
{
    MEM8(m+4) |= 0x60; // .flags

    MEM8(m+6) = (uint8_t)(MEM8(m+6) + 1) & 7; // .anim_counter
    if (MEM8(m+6) >= 7) {
        MEM8(m+6) = 8;
        MEM8(m+0xA) = 0;  // .ai_timer
        MEM8(m+9) = 2;    // .ai_state
    }
}

/* loc_A78D: secondary "seek" state (mirrors state_main but with a
 * capped duration and a flipped facing convention). */
static void type2_state_b(uint16_t m)
{
    MEM8(m+0xA)++; // .ai_timer
    if (MEM8(m+0xA) >= 0x0F) {
        type2_state_b_end(m); // loc_A80C
        return;
    }

    ProxResult pr = monster_to_hero_proximity_and_direction_8(m); // sub_A828
    if (!pr.carry) {
        type2_vertical_and_animate_b(m); // loc_A7C2
        return;
    }

    if (MEM8(m+9) & 0x70) {
        type2_move_and_animate_b(m); // loc_A7D6 directly
        return;
    }

    if (pr.value == 0xFF) {
        uint8_t al = (uint8_t)(get_random() << 1) & 0x80;
        MEM8(m+5) = (uint8_t)((MEM8(m+5) & 0x7F) | al);
    } else {
        uint8_t al = (uint8_t)(pr.value ^ 0x80); // note: flipped, unlike state_main
        MEM8(m+5) = (uint8_t)((MEM8(m+5) & 0x7F) | al);
    }
    type2_vertical_and_animate_b(m); // loc_A7C2
}

/* loc_A7C2: state_b's vertical step (sign test reversed relative to
 * type2_vertical_approach - reproduced exactly as in the original). */
static void type2_vertical_and_animate_b(uint16_t m)
{
    uint8_t diff = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    if ((int8_t)diff < 0) {
        move_monster_S(m);
    } else {
        move_monster_N(m);
    }
    type2_move_and_animate_b(m);
}

/* loc_A7D6: state_b's diagonal step/animate (anim_counter keeps bit
 * 0x8 set, distinguishing it from state_main's animation). */
static void type2_move_and_animate_b(uint16_t m)
{
    MEM8(m+6) = (uint8_t)(((MEM8(m+6) + 1) & 3) | 8); // .anim_counter
    MEM8(m+9) = (uint8_t)(MEM8(m+9) + 0x10);           // .ai_state throttle

    uint8_t idx = (uint8_t)((MEM8(m+9) >> 4) & 7);
    const uint8_t *table = (MEM8(m+5) & 0x80) ? type2_dir_table_right : type2_dir_table_left;
    uint8_t angle = table[idx];

    if (!monster_move_in_direction(m, angle)) { // blocked
        MEM8(m+5) ^= 0x80;
    }
}

/* loc_A80C: state_b timed out; snap into the recovery state. */
static void type2_state_b_end(uint16_t m)
{
    MEM8(m+6) = 0x0C; // .anim_counter
    MEM8(m+9) = 4;     // .ai_state
}

/* loc_A815: recovery state; once the animation counter wraps back to
 * 0, drop back to the default (state_main) behaviour. */
static void type2_state_c(uint16_t m)
{
    MEM8(m+6) = (uint8_t)(MEM8(m+6) + 1) & 0x0F; // .anim_counter
    if (MEM8(m+6) == 0) {
        MEM8(m+9) = 0;      // .ai_state
        MEM8(m+4) &= 0x1F;  // .flags
    }
}


/*
 * Type3 (grounded hopper)
 */
static void monster3_ai(uint16_t m)
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 8; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: was hit
        Hero_Hits_monster(m);
        return;
    }

    if (MEM8(m+9) & 1) { // .ai_state: mid-jump
        type3_state_jump(m); // loc_A8C3
        return;
    }

    if (move_monster_S(m)) { // still actively descending this frame
        type3_after_fall_step(m); // loc_A87A
    }
    /* else: blocked/grounded, nothing further this frame */
}

/* loc_A87A: once grounded/settled, check alignment with the hero; if
 * aligned, begin a jump. Otherwise throttle and patrol. */
static void type3_after_fall_step(uint16_t m)
{
    ProxResult pr = monster_to_hero_proximity_and_direction_8(m); // sub_A828
    if (pr.carry) {
        type3_begin_jump(m); // loc_A8BA
        return;
    }

    int sum = MEM8(m+6) + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) return; // just throttling this frame

    type3_patrol_step(m); // loc_A886
}

/* loc_A886: one patrol step; the facing bit flips only when the step
 * in the current facing direction actually succeeds, and again
 * whenever the patrol timer's low nibble rolls over. */
static void type3_patrol_step(uint16_t m)
{
    MEM8(m+6) = (uint8_t)(MEM8(m+6) + 1) & 0xF3; // .anim_counter

    if (MEM8(m+5) & 0x80) { // facing right
        if (move_monster_E(m)) {
            MEM8(m+5) ^= 0x80;
        }
    } else { // facing left
        if (move_monster_W(m)) {
            MEM8(m+5) ^= 0x80;
        }
    }

    MEM8(m+0xA)--; // .ai_timer
    if ((MEM8(m+0xA) & 0x0F) == 0) {
        MEM8(m+5) ^= 0x80;
    }
}

/* loc_A8BA: switch into the jump state. */
static void type3_begin_jump(uint16_t m)
{
    MEM8(m+9) = 1;    // .ai_state
    MEM8(m+0xA) = 0;  // .ai_timer
}

/* loc_A8C3: per-frame step of an in-progress jump. */
static void type3_state_jump(uint16_t m)
{
    if (MEM8(m+9) & 2) { // .ai_state: recovering from a jump
        type3_jump_recover(m); // loc_A934
        return;
    }

    ProxResult pr = monster_to_hero_proximity_and_direction_8(m); // sub_A828 (only .value used here)
    if (pr.value == 0xFF) {
        type3_jump_maybe_end(m); // loc_A914
        return;
    }

    MEM8(m+6) = 4; // .anim_counter

    if (MEM8(m+5) & 0x80) { // facing right
        move_monster_E(m);
        if (move_monster_E(m)) { // second step succeeded
            if (type3_check_vertical_block(m)) { // sub_A947
                type3_flip_and_recover(m); // sub_A927 (tail call in the original)
                return;
            }
        }
    } else { // facing left
        move_monster_W(m);
        if (move_monster_W(m)) { // second step succeeded
            if (type3_check_vertical_block(m)) { // sub_A947
                type3_flip_and_recover(m); // sub_A927 (tail call in the original)
                return;
            }
        }
    }

    MEM8(m+0xA)++; // .ai_timer
    {
        /* Original: "and al,0Fh; inc al; jnz sub_A927". Since al is
         * masked to 0..15 before the increment, the result can never
         * be zero, so this guarded call is effectively dead code in
         * the original binary - reproduced here for fidelity rather
         * than silently dropped. */
        uint8_t al = (uint8_t)(MEM8(m+0xA) & 0x0F);
        al++;
        if (al == 0) {
            type3_flip_and_recover(m);
            return;
        }
    }

    if ((MEM8(m+0xA) & 0x1F) == 0) {
        type3_jump_maybe_end(m); // loc_A914
    }
}

/* sub_A947: checks whether the jump should be deflected vertically.
 * While still ascending (bit 0x4 of .ai_state clear) this simply
 * mirrors move_monster_S's own result; once ascending has been
 * recorded (bit 0x4 set) it always reports "not blocked" regardless
 * of whether the upward step itself succeeded (the original's "or"
 * instruction unconditionally clears the carry flag here). */
static int type3_check_vertical_block(uint16_t m)
{
    if (!(MEM8(m+9) & 4)) { // .ai_state
        return move_monster_S(m);
    }
    move_monster_N(m); /* side effect only; result intentionally discarded */
    return 0;
}

/* sub_A927: flip facing and drop into the jump-recovery state. */
static void type3_flip_and_recover(uint16_t m)
{
    MEM8(m+9) |= 2;   // .ai_state
    MEM8(m+5) ^= 0x80; // .ai_flags: flip facing
    MEM8(m+6) = 5;      // .anim_counter
}

/* loc_A934: recovery countdown after a jump; once the low 3 bits of
 * the animation counter wrap, clear the recovery bit and resume. */
static void type3_jump_recover(uint16_t m)
{
    MEM8(m+6)++; // .anim_counter
    if ((MEM8(m+6) & 7) == 0) {
        MEM8(m+9) &= 0xFD; // .ai_state
        MEM8(m+6) = 4;
    }
}

/* loc_A914: end the jump (back to ground state) once no longer
 * correctly aligned with the hero. */
static void type3_jump_maybe_end(uint16_t m)
{
    ProxResult pr = monster_to_hero_proximity_and_direction_8(m); // sub_A828
    if (!pr.carry) {
        MEM8(m+6) = 0;   // .anim_counter
        MEM8(m+9) = 0;   // .ai_state
        MEM8(m+0xA) = 0; // .ai_timer
    }
}

/* sub_A527/sub_A828: shared 8-row vertical distance check + facing
 * test, used by both Type2 and Type3 (identical shape to Type0's
 * 4-row version, and to eai2.c's monster_to_hero_proximity_and_direction). */
static ProxResult monster_to_hero_proximity_and_direction_8(uint16_t m)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t abs_dy = (dy & 0x80) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= 8) {
        return (ProxResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m+3) < 0x11) { // .m_x_rel: monster to the left of the hero
        return (ProxResult){ .value = 0x80, .carry = (MEM8(m+5) & 0x80) != 0 }; // facing right => facing the hero
    } else { // monster to the right of (or level with) the hero
        return (ProxResult){ .value = 0x00, .carry = (MEM8(m+5) & 0x80) == 0 }; // facing left => facing the hero
    }
}


/*
 * Type4 (stationary drop hazard - no HP of its own)
 */
static void monster4_ai(uint16_t m)
{
    MEM8(m+4) |= 0x20; // .flags: force the "hit" bit every frame (no real HP)

    if (MEM8(m+9) & 2) { // .ai_state: falling
        type4_fall_throttle(m); // loc_A9B4
        return;
    }
    if (MEM8(m+9) & 1) { // .ai_state: about to fall
        type4_start_fall(m); // loc_A98C
        return;
    }

    if (MEM8(m+3) < 8) return;    // .m_x_rel: hero not under it yet
    if (MEM8(m+3) >= 0x13) return; // .m_x_rel: hero has passed it

    if ((get_random() & 3) == 0) {
        MEM8(m+9) |= 1; // arm the drop
    }
}

/* loc_A98C: begin falling once there's room to drop; plays a warning
 * sound if the drop lands close enough to the top of the viewport. */
static void type4_start_fall(uint16_t m)
{
    if (!move_monster_S(m)) return; // blocked, can't start falling yet

    MEM8(m+9) |= 2;  // .ai_state
    MEM8(m+6) = 1;    // .anim_counter

    uint8_t top_row = (uint8_t)(MEM8(ADDR_VIEWPORT_TOP_ROW) - 1);
    uint8_t rel = (uint8_t)(MEM8(m+2) - top_row) & 0x3F; // .currY
    if (rel < 0x13) {
        MEM8(ADDR_SOUND_FX_REQUEST) = 0x21;
    }
}

/* loc_A9B4: throttled fall animation; once it completes a full cycle,
 * hand off to the generic proximity/vertical-distance check shared by
 * the rest of the engine. */
static void type4_fall_throttle(uint16_t m)
{
    int sum = MEM8(m+6) + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) return; // just throttling this frame

    MEM8(m+6) = (uint8_t)(MEM8(m+6) + 1) & 3;
    if (MEM8(m+6) != 0) return;

    MEM8(m+7) = (uint8_t)((MEM8(m+7) & 0xF0) | 1);
    Check_Vertical_Distance_Between_Hero_And_Monster(m);
}
