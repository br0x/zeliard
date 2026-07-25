/*
 * eai3.c - translated from eai3.asm
 *
 * Monster AI for the 4 monster types handled by this AI overlay
 * (monster.flags & 0x0F):
 *   0 -> "type0" - an airborne wanderer driven by an 8-state state
 *        machine (monster.ai_state & 7) that free-falls, patrols back
 *        and forth, then breaks into a diagonal N/NE/NW/SE/SW dodge
 *        sequence before settling back into patrol.
 *   1 -> "type1" - a grounded creature that free-falls, then cycles
 *        through a small per-facing direction table
 *        (monster_move_in_direction) to crawl along the ground.
 *   2 -> "type2" - a stationary shooter: it free-falls, peeks out of
 *        cover by probing the tile ahead of it, then winds up and
 *        fires a projectile at the hero before retreating again.
 *   3 -> "type3" - a grounded chaser: it free-falls, then either
 *        patrols back and forth (with an occasional diagonal escape
 *        move) or, once close enough to the hero, turns to face them.
 *
 * Translation conventions (same as eai2.c)
 * ------------------------------------------------------------------
 * - "m" is the monster pointer, i.e. the original "si".
 * - Every helper below that mirrors an original asm "proc" which the
 *   caller tested with jb/jnb (carry) returns an int that IS the carry
 *   flag: nonzero (1) means CF=1 (the original jb branch), 0 means
 *   CF=0 (jnb branch) - EXCEPT for the shared, pre-existing utility
 *   functions declared in zeliard.h (move_monster_*,
 *   monster_move_in_direction, check_collision_N2, is_blocking, ...),
 *   which keep the normal "nonzero means it happened / succeeded" C
 *   convention already established by eai1.c / eai2.c.
 * - The large move/death animation-frame tables and the monster_xp /
 *   monster_damage tables that sit at the top of eai3.asm are pure
 *   data blobs consumed directly by the renderer from the overlay's
 *   fixed memory addresses (ADDR_MONSTER_AI_MOVE_LEFT_FRAMES etc, see
 *   zeliard.h); they are loaded verbatim elsewhere and are not part of
 *   this AI logic, so (as with eai2.c) they are not reproduced here.
 */

#include "zeliard.h"



/*
 * Small helpers / tables
 */

typedef struct {
    uint8_t value; /* AL on return */
    int     carry; /* CF on return (1 = set) */
} ProxResult;

typedef struct {
    uint8_t value; /* AL on return */
    uint8_t dist;  /* AH on return (only meaningful when value != 0xFF) */
    int     carry; /* CF on return (1 = set) */
} DistResult;

/* byte_A4E4 / byte_A4EA: per-facing direction cycle used by type1 while
 * crawling (indices 0..5, selected by the *previous* frame's
 * anim_counter, exactly as in the original xlat). */
static const uint8_t type1_dir_table_right[6] = { 1, 1, 0, 0, 7, 7 }; /* byte_A4E4 */ // ↗↗→→↘↘
static const uint8_t type1_dir_table_left[6]  = { 3, 3, 4, 4, 5, 5 }; /* byte_A4EA */ // ↙↙←←↖↖

/* Projectile templates fired by type2 (byte_A654/A655 = facing-right
 * shot, byte_A661/A662 = facing-left shot); bytes 0-1 (x,y) are patched
 * per shot, the remainder is copied verbatim from the original data
 * segment. */
static uint8_t type2_shot_right[13] = { 0, 0, 0x2B, 0, 0x0F, 0, 0x28, 0, 0, 0, 0, 0, 0 }; /* byte_A654/A655 */
static uint8_t type2_shot_left[13]  = { 0, 0, 0x2B, 0, 0x0F, 4, 0x28, 0, 0, 0, 0, 0, 0 }; /* byte_A661/A662 */


/*
 * Forward declarations
 */
static void type0_ai(uint16_t m);
static void type1_ai(uint16_t m);
static void type2_ai(uint16_t m);
static void type3_ai(uint16_t m);

/* type0 helpers */
static void type0_reset_patrol(uint16_t m);   /* loc_A34D */
static void type0_turn_around(uint16_t m);    /* loc_A327 / loc_A33F */
static void type0_state0(uint16_t m);         /* loc_A2F9 */
static void type0_state1(uint16_t m);         /* loc_A356 */
static void type0_state2(uint16_t m);         /* loc_A367 */
static void type0_state3(uint16_t m);         /* loc_A374 */
static void type0_state4(uint16_t m);         /* loc_A3AC */
static void type0_state5(uint16_t m);         /* loc_A3E0 */
static void type0_state6(uint16_t m);         /* loc_A405 */
static void type0_state7(uint16_t m);         /* loc_A40E */

/* type2 helpers */
static void type2_state0(uint16_t m);         /* loc_A521 */
static void type2_state1(uint16_t m);         /* loc_A5A3 */
static void type2_state2(uint16_t m);         /* loc_A5BA */
static void type2_state3(uint16_t m);         /* loc_A612 */
static void type2_enter_recovery(uint16_t m); /* loc_A5DA */
static void type2_fire(uint16_t m);           /* loc_A5E3 */
static ProxResult type2_prox_check(uint16_t m); /* sub_A625 */

/* type3 helpers */
static void type3_patrol(uint16_t m);         /* loc_A6C2 */
static DistResult type3_prox_check(uint16_t m); /* sub_A701 */


/*
 * Monster_AI_3 - entry point (matches void Monster_AI(uint16_t m); as
 * used throughout the game engine / dungeon.c)
 */
void Monster_AI_3(uint16_t m)
{
    switch (MEM8(m+4) & 0x0F) { // .flags
        case 0: type0_ai(m); return;
        case 1: type1_ai(m); return;
        case 2: type2_ai(m); return;
        case 3: type3_ai(m); return;
        default:
            /* Original jump table only has 4 entries; monster.flags low
             * nibble is only ever 0..3 for this AI module by design. */
            return;
    }
}


/*
 * Type 0 - airborne wanderer
 */
static void type0_ai(uint16_t m) // loc_A2C8
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 2; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: this monster was hit
        Hero_Hits_monster(m);
        return;
    }

    switch (MEM8(m+9) & 7) { // .ai_state
        case 0: type0_state0(m); return;
        case 1: type0_state1(m); return;
        case 2: type0_state2(m); return;
        case 3: type0_state3(m); return;
        case 4: type0_state4(m); return;
        case 5: type0_state5(m); return;
        case 6: type0_state6(m); return;
        case 7: type0_state7(m); return;
    }
}

/* loc_A34D: back to normal ground patrol. */
static void type0_reset_patrol(uint16_t m)
{
    MEM8(m+9) = 1; // .ai_state
    MEM8(m+6) = 8;  // .anim_counter
}

/* loc_A327 / loc_A33F: common "bounced off a wall" handling - flips
 * facing, and (depending on the parity of the ai_timer this bounce
 * interrupted) may drop straight back into patrol. */
static void type0_turn_around(uint16_t m)
{
    uint8_t timer = MEM8(m+0xA); // .ai_timer
    MEM8(m+0xA) = 0;
    MEM8(m+5) ^= 0x80; // .ai_flags: flip facing
    if (!(timer & 1)) {
        type0_reset_patrol(m);
    }
}

/* loc_A2F9: patrol step with an occasional turn-around, gated by a
 * ceiling/N-collision probe. */
static void type0_state0(uint16_t m)
{
    MEM8(m+6) = (MEM8(m+6) + 1) & 7; // .anim_counter

    if (!check_collision_N2(m)) {
        type0_reset_patrol(m);
        return;
    }
    if (!(MEM8(m+6) & 1)) return; // only act on odd frames

    uint8_t x = MEM8(m+3); // .m_x_rel
    if (x >= 0x12 && x < 0x15) {
        type0_reset_patrol(m);
        return;
    }

    if (!(MEM8(m+5) & 0x80)) { // facing left
        if (move_monster_W(m)) {
            type0_turn_around(m);
        }
    } else { // facing right
        if (move_monster_E(m)) {
            type0_turn_around(m);
        }
    }
}

/* loc_A356: fall one row, then advance to the diagonal-dodge setup. */
static void type0_state1(uint16_t m)
{
    if (move_monster_S(m)) {
        MEM8(m+9) = 2; // .ai_state
        MEM8(m+6) = 9;  // .anim_counter
    }
}

/* loc_A367: enter the diagonal-dodge sequence. */
static void type0_state2(uint16_t m)
{
    MEM8(m+9) = 3;    // .ai_state
    MEM8(m+6) = 0x0A;  // .anim_counter
    MEM8(m+0xA) = 0;    // .ai_timer
}

/* loc_A374: one step of a NW/NE dodge, switching to the next state
 * after the very first step. */
static void type0_state3(uint16_t m)
{
    if (MEM8(m+0xA) == 1) { // .ai_timer
        MEM8(m+9) = 4;       // .ai_state
        MEM8(m+0xA) = 0xFF;
    }
    MEM8(m+6) = 0x0B; // .anim_counter

    if (!(MEM8(m+5) & 0x80)) { // facing left
        MEM8(m+0xA)++;
        if (move_monster_NW(m)) MEM8(m+5) ^= 0x80;
    } else { // facing right
        MEM8(m+0xA)++;
        if (move_monster_NE(m)) MEM8(m+5) ^= 0x80;
    }
}

/* loc_A3AC: continues the dodge with a plain W/E step. */
static void type0_state4(uint16_t m)
{
    if (MEM8(m+0xA) == 1) MEM8(m+9) = 5; // .ai_timer / .ai_state

    MEM8(m+6) = 8; // .anim_counter

    if (!(MEM8(m+5) & 0x80)) { // facing left
        MEM8(m+0xA)++;
        if (move_monster_W(m)) MEM8(m+5) ^= 0x80;
    } else { // facing right
        MEM8(m+0xA)++;
        if (move_monster_E(m)) MEM8(m+5) ^= 0x80;
    }
}

/* loc_A3E0: SW/SE diagonal drop back down towards patrol height. */
static void type0_state5(uint16_t m)
{
    MEM8(m+6) = 8; // .anim_counter

    int moved = (MEM8(m+5) & 0x80) ? move_monster_SE(m) : move_monster_SW(m);
    if (moved) {
        MEM8(m+6) = 9; // .anim_counter
        MEM8(m+9) = 6;  // .ai_state
    }
}

/* loc_A405: one-frame pause before the final climb-back-up step. */
static void type0_state6(uint16_t m)
{
    MEM8(m+6) = 0x0A; // .anim_counter
    MEM8(m+9) = 7;     // .ai_state
}

/* loc_A40E: climbs back up (NW/NE, then a final N/N2-collision check)
 * before returning to normal patrol. */
static void type0_state7(uint16_t m)
{
    MEM8(m+6) = 8; // .anim_counter

    if (!(MEM8(m+5) & 0x80)) { // facing left
        if (!move_monster_NW(m)) return; // blocked, try again next frame

        if (check_collision_N2(m)) {
            // loc_A42C: back to full patrol
            MEM8(m+9) = 0;
            MEM8(m+6) = 0;
            MEM8(m+0xA) = 1;
        } else {
            MEM8(m+5) ^= 0x80; // keep climbing, flip facing
        }
    } else { // facing right
        if (!move_monster_NE(m)) return; // blocked, try again next frame

        if (move_monster_N(m)) {
            MEM8(m+5) ^= 0x80; // kept climbing, flip facing
        } else {
            // loc_A42C: back to full patrol
            MEM8(m+9) = 0;
            MEM8(m+6) = 0;
            MEM8(m+0xA) = 1;
        }
    }
}


/*
 * Type 1 - grounded crawler
 */
static void type1_ai(uint16_t m) // loc_A44D
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 2; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: hit
        Hero_Hits_monster(m);
        return;
    }

    if (!(MEM8(m+9) & 8)) { // .ai_state: not yet in the crawl cycle
        if (!(MEM8(m+9) & 4)) { // .ai_state: pick an initial facing
            MEM8(m+5) |= 0x80;    // tentatively face right
            if (MEM8(m+3) >= 0x11) { // .m_x_rel
                MEM8(m+5) ^= 0x80;    // too far right of the anchor: face left instead
            }
        }

        if (!move_monster_S(m)) return; // grounded, nothing to do this frame

        // loc_A484: still falling - throttle the falling animation
        uint16_t sum = (uint16_t)(MEM8(m+6) & 0xF0) + 0x80;
        MEM8(m+6) = (uint8_t)sum;
        if (sum >= 0x100) {
            MEM8(m+6) = 0;
            MEM8(m+9) |= 8; // .ai_state: enter the crawl cycle
        }
        return;
    }

    // loc_A498: crawling - cycle through the direction table
    MEM8(m+9) &= 0xFB; // .ai_state

    uint8_t old_anim = MEM8(m+6); // .anim_counter (pre-increment, used as the table index)
    MEM8(m+6) = (MEM8(m+6) + 1) & 7;
    if (MEM8(m+6) >= 6) {
        MEM8(m+6) = 0;
        MEM8(m+9) &= 0xF7; // .ai_state
    }

    const uint8_t *dir_table = (MEM8(m+5) & 0x80) ? type1_dir_table_right : type1_dir_table_left;
    uint8_t dir = dir_table[old_anim];
    if (!monster_move_in_direction(m, dir)) return; // blocked, try again next frame

    MEM8(m+9) &= 0xF7; // .ai_state
    if (MEM8(m+6) == 1) {
        MEM8(m+9) |= 4;    // .ai_state
        MEM8(m+5) ^= 0x80; // .ai_flags: flip facing
    }
    MEM8(m+6) = 0;
    move_monster_S(m); // tail call, result unused, as in the original
}


/*
 * Type 2 - stationary shooter
 */
static void type2_ai(uint16_t m) // loc_A4F0
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 4; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: hit
        Hero_Hits_monster(m);
        return;
    }

    if (!move_monster_S(m)) return; // grounded, run the state machine below only once settled

    switch (MEM8(m+9) & 3) { // .ai_state
        case 0: type2_state0(m); return;
        case 1: type2_state1(m); return;
        case 2: type2_state2(m); return;
        case 3: type2_state3(m); return;
    }
}

/* loc_A521: idle/peek state - throttles, then either creeps forward or
 * (once close enough) settles into the aiming state. */
static void type2_state0(uint16_t m)
{
    MEM8(m+4) |= 0x60; // .flags

    uint16_t sum = (uint16_t)MEM8(m+6) + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) return; // throttling, nothing more this frame

    MEM8(m+6) = (MEM8(m+6) + 1) & 1; // .anim_counter
    if (MEM8(m+6) != 0) return;

    MEM8(m+0xA)++; // .ai_timer
    if (MEM8(m+0xA) >= 7) {
        MEM8(m+9) = 1; // .ai_state
        MEM8(m+6) = 2;  // .anim_counter
    }

    // Probe the tile just ahead (in the current facing direction) and
    // either step forward into cover or bounce off it and flip facing.
    if (MEM8(m+5) & 0x80) { // facing right
        uint16_t addr = coords_to_prox_addr(MEM8(m+3), MEM8(m+2)); // .m_x_rel, .currY
        addr += 0x4A;
        wrap_map_from_above(&addr);
        if (is_blocking(MEM8(addr))) {
            move_monster_E(m);
        } else {
            MEM8(m+5) &= 0x7F;
            move_monster_W(m);
        }
    } else { // facing left
        uint16_t addr = coords_to_prox_addr(MEM8(m+3), MEM8(m+2));
        addr += 0x47;
        wrap_map_from_above(&addr);
        if (is_blocking(MEM8(addr))) {
            move_monster_W(m);
        } else {
            MEM8(m+5) |= 0x80;
            move_monster_E(m);
        }
    }
}

/* loc_A5A3: brief windup before aiming at the hero. */
static void type2_state1(uint16_t m)
{
    MEM8(m+4) &= 0x1F; // .flags
    MEM8(m+6)++;         // .anim_counter
    if (MEM8(m+6) == 5) {
        MEM8(m+9) = 2;    // .ai_state
        MEM8(m+0xA) = 0;   // .ai_timer
    }
}

/* loc_A5BA: aiming - throttles, then checks alignment with the hero;
 * fires once aligned, otherwise gives up after a few tries and settles
 * back down. */
static void type2_state2(uint16_t m)
{
    if (MEM8(m+9) & 0x80) { // .ai_state: already committed to recovery
        type2_enter_recovery(m);
        return;
    }

    uint16_t sum = (uint16_t)MEM8(m+6) + 0x40;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) return; // throttling, nothing more this frame

    MEM8(m+5) ^= 0x80; // .ai_flags: flip facing

    ProxResult pr = type2_prox_check(m); // sub_A625
    if (pr.carry) {
        type2_fire(m); // loc_A5E3
        return;
    }

    MEM8(m+0xA)++; // .ai_timer
    if (MEM8(m+0xA) == 3) {
        type2_enter_recovery(m);
    }
}

/* loc_A5DA: give up aiming and settle back down. */
static void type2_enter_recovery(uint16_t m)
{
    MEM8(m+9) = 3; // .ai_state
    MEM8(m+6) = 5;  // .anim_counter
}

/* loc_A5E3: fires a projectile towards the hero. */
static void type2_fire(uint16_t m)
{
    MEM8(m+6) = 6;       // .anim_counter
    MEM8(m+9) |= 0x80;    // .ai_state

    uint8_t x = MEM8(m+3); // .m_x_rel
    type2_shot_left[0]  = x;
    type2_shot_right[0] = (uint8_t)(x + 1);

    uint8_t y = MEM8(m+2) & 0x3F; // .currY
    type2_shot_left[1]  = y;
    type2_shot_right[1] = y;

    uint8_t *desc = (MEM8(m+5) & 0x80) ? type2_shot_right : type2_shot_left; // .ai_flags
    Add_Projectile_To_Array(desc);
}

/* loc_A612: recovering after a shot; once settled, go back to idle. */
static void type2_state3(uint16_t m)
{
    MEM8(m+6)--; // .anim_counter
    if (MEM8(m+6) == 1) {
        MEM8(m+9) = 0;  // .ai_state
        MEM8(m+0xA) = 0; // .ai_timer
    }
}

/* sub_A625: checks whether the hero is within 5 rows vertically and,
 * if so, whether the monster is already facing the hero (anchor column
 * 0x11 / 17). Returns carry=1 when close enough AND already aligned. */
static ProxResult type2_prox_check(uint16_t m)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t abs_dy = (dy & 0x80) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= 5) {
        return (ProxResult){ .value = 0xFF, .carry = 0 };
    }

    if (MEM8(m+3) < 0x11) { // .m_x_rel: monster left of the hero
        return (ProxResult){ .value = 0x80, .carry = (MEM8(m+5) & 0x80) != 0 };
    } else { // monster at/right of the hero
        return (ProxResult){ .value = 0x00, .carry = (MEM8(m+5) & 0x80) == 0 };
    }
}


/*
 * Type 3 - grounded chaser
 */
static void type3_ai(uint16_t m) // loc_A66E
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 4; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: hit
        Hero_Hits_monster(m);
        return;
    }

    uint8_t old_anim = MEM8(m+6); // .anim_counter, saved across the fall attempt
    MEM8(m+6) = 0;
    if (!move_monster_S(m)) return; // grounded: leave anim_counter at 0, nothing more this frame

    MEM8(m+6) = old_anim; // .anim_counter: restore

    if (MEM8(m+9) & 1) { // .ai_state: already engaged/patrolling
        type3_patrol(m); // loc_A6C2
        return;
    }

    MEM8(m+6) = 1;   // .anim_counter
    MEM8(m+0xA) = 0;  // .ai_timer

    DistResult dr = type3_prox_check(m); // sub_A701
    if (dr.carry) {
        if (dr.dist < 0x0A) {
            MEM8(m+9) |= 1; // .ai_state: begin patrol/engage
        }
        return;
    }
    if (dr.value == 0xFF) return;
    MEM8(m+5) = (MEM8(m+5) & 0x7F) | dr.value; // .ai_flags: turn to face the hero
}

/* loc_A6C2: patrol step - tries a plain step in the current facing
 * direction followed immediately by a diagonal step; if both succeed,
 * the monster has escaped upward and stops patrolling. Otherwise it
 * just advances its walking animation. After a long enough patrol
 * (0x14 frames) it gives up and drops out of the engaged state. */
static void type3_patrol(uint16_t m)
{
    MEM8(m+0xA)++; // .ai_timer
    if (MEM8(m+0xA) == 0x14) {
        MEM8(m+9) &= 0xFE; // .ai_state: stop patrolling
        return;
    }

    if (!(MEM8(m+5) & 0x80)) { // facing left
        if (move_monster_W(m)) {
            if (move_monster_NW(m)) {
                MEM8(m+9) &= 0xFE; // .ai_state: escaped, stop patrolling
                return;
            }
        }
    } else { // facing right
        if (move_monster_E(m)) {
            if (move_monster_NE(m)) {
                MEM8(m+9) &= 0xFE; // .ai_state: escaped, stop patrolling
                return;
            }
        }
    }

    // loc_A6F2: advance the walking animation
    MEM8(m+6)++;
    if (MEM8(m+6) >= 6) {
        MEM8(m+6) = 1;
    }
}

/* sub_A701: checks whether the hero is within 6 rows vertically and,
 * if so, how far (in the AH/dist field) the monster is from the anchor
 * column 0x11 / 17, along with which way it should face to move
 * towards the hero. Carry=1 means it is already facing that way. */
static DistResult type3_prox_check(uint16_t m)
{
    uint8_t dy = (uint8_t)(MEM8(ADDR_HERO_Y) - MEM8(m+2)); // .currY
    uint8_t abs_dy = (dy & 0x80) ? (uint8_t)(-(int8_t)dy) : dy;

    if (abs_dy >= 6) {
        return (DistResult){ .value = 0xFF, .dist = 0, .carry = 0 };
    }

    if (MEM8(m+3) <= 0x11) { // .m_x_rel: at/left of the anchor column
        uint8_t dx = (uint8_t)(0x11 - MEM8(m+3));
        int facing_right = (MEM8(m+5) & 0x80) != 0;
        return (DistResult){ .value = 0x80, .dist = dx, .carry = facing_right };
    } else { // right of the anchor column
        uint8_t dx = (uint8_t)(MEM8(m+3) - 0x11);
        int facing_left = !(MEM8(m+5) & 0x80);
        return (DistResult){ .value = 0x00, .dist = dx, .carry = facing_left };
    }
}
