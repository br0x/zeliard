/*
 * eai4.c - translated from eai4.asm
 *
 * Monster AI for the 5 jump-table cases handled by this AI overlay
 * (monster.flags & 0x0F, values 0..4 - values 2 and 3 share the same
 * handler in the original jump table):
 *
 *   0 -> "type0" - a monster that clings to a surface and is driven by
 *        an *independent bitmask* in monster.ai_state (not a linear
 *        enum like eai3's types): bit 0x8 (checked first) is a
 *        free-fall/settle mode that ends by either picking a plain
 *        E/W step or, once "detached" for a couple of frames, sampling
 *        a small per-facing trajectory table (trajectory_right/left)
 *        via monster_move_in_direction; bit 0x4 is a double-speed
 *        diagonal bounce off the surface; bits 0x1/0x2 are short
 *        "snap" transitions in/out of those; with none of those bits
 *        set the monster just patrols back and forth around an anchor
 *        column, occasionally triggering the bounce when it is lined
 *        up with the hero.
 *   1 -> "type1" - a monster that can link up with a second, partner
 *        monster slot to form a two-tile creature. While unlinked it
 *        falls and then rocks side to side around the anchor column.
 *        Once its walk cycle completes (anim_counter wraps to 6) it
 *        probes the tiles ahead for room and, if there's space, claims
 *        a nearby free monster slot (Find_Monsters_Near_Hero) as its
 *        other half and keeps growing/repositioning that half every
 *        cycle after that. It is also immune to most sword hits
 *        (a handful of hit-type codes and even/odd animation frames
 *        route around Hero_Hits_monster) except on specific frames.
 *   2/3 -> "type2" - a dormant trap: it sits still until the hero
 *        wanders within a narrow x-range, rolls a random chance to
 *        wake up, then free-falls once and hands off to
 *        Check_Vertical_Distance_Between_Hero_And_Monster for its
 *        active behaviour (implemented elsewhere).
 *   4 -> "type4" - a monster confined to a narrow band of x positions
 *        that walks a small state machine of preset directions
 *        (type4_table_left/right, indexed by ai_state) trying up to 5
 *        alternative moves per call before giving up and turning
 *        around; landing on the 3rd alternative repeats the whole
 *        lookup once more that same frame.
 *
 * Translation conventions (same as eai3.c)
 * ------------------------------------------------------------------
 * - "m" is the monster pointer, i.e. the original "si".
 * - Every helper below that mirrors an original asm "proc" which the
 *   caller tested with jb/jnb (carry) returns an int that IS the carry
 *   flag: nonzero (1) means CF=1 (the original jb branch), 0 means
 *   CF=0 (jnb branch) - EXCEPT for the shared, pre-existing utility
 *   functions declared in zeliard.h (move_monster_*,
 *   monster_move_in_direction, check_collision_N2, is_blocking, ...),
 *   which keep the normal "nonzero means it happened / succeeded" C
 *   convention already established by eai1.c / eai2.c / eai3.c.
 * - The overlay's header block (AI proc pointer, death_descriptors,
 *   the monster xp/damage tables, and the big per-monster-type
 *   animation-frame offset tables byte_A0B0..byte_A24A / byte_A259..
 *   byte_A265) are pure data blobs consumed directly by the renderer
 *   / death handling from the overlay's fixed memory addresses; like
 *   eai3.c, they are not reproduced here since they are not part of
 *   the AI logic itself.
 * - trajectory_right/left and type4_table_left/right, by contrast,
 *   ARE consumed directly by this AI code (via xlat / indexed lookup)
 *   and so are reproduced verbatim below.
 * - Find_Monsters_Near_Hero is used here but not declared in
 *   zeliard.h; it is assumed to be defined elsewhere. Based on its
 *   call site it scans the monsters table for a usable partner slot
 *   near the hero and reports success the same way the other locally
 *   declared helpers here do (nonzero/CF=0 = found), returning the
 *   partner monster's struct address and an id/index (originally
 *   DI/DL) through out parameters.
 */

#include "zeliard.h"

/* Not declared in zeliard.h - assumed defined elsewhere. */
extern uint8_t Find_Monsters_Near_Hero(uint16_t m, uint16_t *out_partner, uint8_t *out_idx);


/*
 * Small helpers / tables
 */

/* trajectory_right / trajectory_left: 8-entry direction cycles indexed
 * by a rotated slice of monster.ai_state, used by type0 once it drops
 * into free fall to pick which way to drift while falling. */
static const uint8_t trajectory_right[8] = { 2, 1, 1, 0, 0, 7, 7, 6 };
static const uint8_t trajectory_left[8]  = { 2, 3, 3, 4, 4, 5, 5, 6 };

/* unk_A756 / unk_A7CE: 8 rows (indexed by monster.ai_state) of 5
 * candidate (direction, next_ai_state, next_anim_counter) triplets,
 * tried in turn by type4_try_directions() until one succeeds. Facing
 * left uses type4_table_left, facing right uses type4_table_right. */
static const uint8_t type4_table_left[8 * 15] = { /* unk_A756 */
    6,2,1,  7,1,2,  0,0,0,  1,7,3,  2,6,1,
    5,3,3,  6,2,1,  7,1,2,  0,0,0,  1,7,3,
    4,4,0,  5,3,3,  6,2,1,  7,1,2,  0,0,0,
    3,5,2,  4,4,0,  5,3,3,  6,2,1,  7,1,2,
    2,6,1,  3,5,2,  4,4,0,  5,3,3,  6,2,1,
    1,7,3,  2,6,1,  3,5,2,  4,4,0,  5,3,3,
    0,0,0,  1,7,3,  2,6,1,  3,5,2,  4,4,0,
    7,1,2,  0,0,0,  1,7,3,  2,6,1,  3,5,2,
};

static const uint8_t type4_table_right[8 * 15] = { /* unk_A7CE */
    6,6,0,  5,7,3,  4,0,0,  3,1,2,  2,2,0,
    5,7,2,  4,0,0,  3,1,2,  2,2,1,  1,3,2,
    4,0,1,  3,1,2,  2,2,1,  1,3,3,  0,4,1,
    3,1,3,  2,2,1,  1,3,3,  0,4,0,  7,5,3,
    2,2,0,  1,3,3,  0,4,0,  7,5,2,  6,6,0,
    1,3,2,  0,4,0,  7,5,2,  6,6,1,  5,7,2,
    0,4,1,  7,5,2,  6,6,1,  5,7,3,  4,0,1,
    7,5,3,  6,6,1,  5,7,3,  4,0,0,  3,1,3,
};


/*
 * Forward declarations
 */
static void type0_ai(uint16_t m);
static void type1_ai(uint16_t m);
static void type2_ai(uint16_t m);
static void type4_ai(uint16_t m);

/* type0 helpers */
static void type0_landed(uint16_t m);           /* loc_A2B0 */
static void type0_patrol(uint16_t m);           /* loc_A2BF */
static void type0_aligned(uint16_t m);          /* loc_A2EF */
static void type0_go_west(uint16_t m);          /* loc_A302 */
static void type0_go_east(uint16_t m);          /* loc_A313 */
static void type0_snap_forward(uint16_t m);     /* loc_A324, ai_state bit 0x1 */
static void type0_snap_backward(uint16_t m);    /* loc_A346, ai_state bit 0x2 */
static void type0_bounce_dash(uint16_t m);      /* loc_A368, ai_state bit 0x4 */
static void type0_settle(uint16_t m);           /* loc_A3CD, ai_state bit 0x8 */
static void type0_settle_step2(uint16_t m);     /* loc_A3F8 */
static void type0_settle_trajectory(uint16_t m);/* loc_A412 */

/* type1 helpers */
static void type1_common(uint16_t m);           /* loc_A4EC */
static void type1_move(uint16_t m);             /* loc_A4F9 */
static void type1_fall_and_patrol(uint16_t m);  /* loc_A514 */
static void type1_bounce_west(uint16_t m);      /* loc_A54B */
static void type1_bounce_east(uint16_t m);      /* loc_A557 */
static void type1_linked_move(uint16_t m);      /* loc_A56C */
static int  type1_check_room(uint16_t prox, uint16_t offset); /* sub_A679 */
static void type1_grow_left(uint16_t m, uint16_t partner, uint16_t prox);  /* loc_A5C1 */
static void type1_grow_right(uint16_t m, uint16_t partner, uint16_t prox); /* loc_A618 */
static void type1_finish_link(uint16_t m, uint16_t partner, uint8_t saved_layer_val); /* loc_A64C */

/* type2 helpers */
static void type2_active(uint16_t m);           /* loc_A6DB */

/* type4 helpers */
static uint8_t type4_try_directions(uint16_t m); /* sub_A71C */


/*
 * Monster_AI_4 - entry point (matches void Monster_AI(uint16_t m); as
 * used throughout the game engine / dungeon.c). Not yet declared in
 * zeliard.h; add "void Monster_AI_4(uint16_t m);" alongside
 * Monster_AI_1/2/3 if it needs to be called from outside this file.
 */
void Monster_AI_4(uint16_t m)
{
    switch (MEM8(m+4) & 0x0F) { // .flags
        case 0: type0_ai(m); return;
        case 1: type1_ai(m); return;
        case 2: type2_ai(m); return;
        case 3: type2_ai(m); return; // original jump table: cases 2 and 3 share loc_A6B1
        case 4: type4_ai(m); return;
        default:
            /* Original jump table only has 5 entries; monster.flags
             * low nibble is only ever 0..4 for this AI module. */
            return;
    }
}


/*
 * Type 0 - surface-clinging patroller with a bitmask ai_state
 */
static void type0_ai(uint16_t m) // loc_A281
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 8; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: this monster was hit
        Hero_Hits_monster(m);
        return;
    }

    if (MEM8(m+9) & 8) { // .ai_state
        type0_settle(m); // loc_A3CD
        return;
    }
    if (MEM8(m+9) & 4) { // .ai_state
        type0_bounce_dash(m); // loc_A368
        return;
    }

    if (move_monster_S(m)) return; // still falling, nothing more this frame

    type0_landed(m); // loc_A2B0
}

/* loc_A2B0: grounded - dispatch on the remaining two ai_state bits. */
static void type0_landed(uint16_t m)
{
    if (MEM8(m+9) & 1) { // .ai_state
        type0_snap_forward(m); // loc_A324
        return;
    }
    if (MEM8(m+9) & 2) { // .ai_state
        type0_snap_backward(m); // loc_A346
        return;
    }
    type0_patrol(m); // loc_A2BF
}

/* loc_A2BF: normal ground patrol - throttles every other call, then
 * either re-centers on the anchor column (once vertically aligned
 * with the hero) or just keeps walking in the current facing
 * direction. */
static void type0_patrol(uint16_t m)
{
    uint8_t a = MEM8(m+6); // .anim_counter
    uint8_t combined = ((a + 1) & 7) | (a & 0xF0);
    uint16_t sum = (uint16_t)combined + 0x80;
    MEM8(m+6) = (uint8_t)sum;
    if (sum < 0x100) return; // throttling, nothing more this frame

    // loc_A2D5: check vertical alignment with the hero
    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint8_t my_y = MEM8(m+2); // .currY
    if (hero_y == my_y || ((hero_y + 1) & 0x3F) == my_y) {
        type0_aligned(m); // loc_A2EF
        return;
    }

    if (MEM8(m+5) & 0x80) { // .ai_flags: facing right
        type0_go_east(m); // loc_A313
    } else {
        type0_go_west(m); // loc_A302
    }
}

/* loc_A2EF: vertically aligned with the hero - occasionally trigger
 * the bounce-dash, and otherwise walk back towards the anchor column
 * (0x11) rather than continuing in the current facing direction. */
static void type0_aligned(uint16_t m)
{
    if ((get_random() & 3) == 0) {
        MEM8(m+9) = 5; // .ai_state
    }
    if (MEM8(m+3) < 0x11) { // .m_x_rel: left of the anchor column
        type0_go_east(m); // loc_A313
    } else {
        type0_go_west(m); // loc_A302
    }
}

/* loc_A302: face left and step west; bumping a wall requests the
 * bounce-dash next frame. */
static void type0_go_west(uint16_t m)
{
    MEM8(m+5) &= 0x7F; // .ai_flags
    if (move_monster_W(m)) return;
    MEM8(m+9) = 9; // .ai_state
}

/* loc_A313: face right and step east; same wall-bump handling. */
static void type0_go_east(uint16_t m)
{
    MEM8(m+5) |= 0x80; // .ai_flags
    if (move_monster_E(m)) return;
    MEM8(m+9) = 9; // .ai_state
}

/* loc_A324: ai_state bit 0x1 - short forward snap; clears the bit and
 * marks the high nibble once the counter reaches 0x0B. */
static void type0_snap_forward(uint16_t m)
{
    uint8_t low = MEM8(m+6) & 0x0F; // .anim_counter
    if (low < 8) {
        MEM8(m+6) = 8;
        return;
    }
    low++;
    MEM8(m+6) = low;
    if (low != 0x0B) return;

    MEM8(m+6) = low | 0x10;
    MEM8(m+9) &= 0xFE; // .ai_state
}

/* loc_A346: ai_state bit 0x2 - mirror of type0_snap_forward, counting
 * down instead of up. */
static void type0_snap_backward(uint16_t m)
{
    uint8_t low = MEM8(m+6) & 0x0F; // .anim_counter
    if (low >= 0x0C) {
        MEM8(m+6) = 0x0B;
        return;
    }
    low--;
    MEM8(m+6) = low;
    if (low != 8) return;

    MEM8(m+6) = low | 0x10;
    MEM8(m+9) &= 0xFD; // .ai_state
}

/* loc_A368: ai_state bit 0x4 - a double-speed diagonal dash off the
 * surface (SE+SE or SW+SW); if the second diagonal step is blocked it
 * retries with a plain double E/W step, and if that's blocked too it
 * flips facing and drops into the settle state. */
static void type0_bounce_dash(uint16_t m)
{
    uint8_t v = (MEM8(m+6) & 0x0F) + 1; // .anim_counter
    if (v < 0x0F) {
        MEM8(m+6) = v;
        return;
    }
    if (v >= 0x10) v = 0x0E;
    MEM8(m+6) = v;

    if (MEM8(m+5) & 0x80) { // .ai_flags: facing right
        move_monster_SE(m);
        if (move_monster_SE(m)) return;
        move_monster_E(m);
        if (move_monster_E(m)) return;
        MEM8(m+5) &= 0x7F; // face left
    } else { // facing left
        move_monster_SW(m);
        if (move_monster_SW(m)) return;
        move_monster_W(m);
        if (move_monster_W(m)) return;
        MEM8(m+5) |= 0x80; // face right
    }

    // loc_A3C4: fully blocked both ways - settle into the next state
    MEM8(m+6) = 0x1D;
    MEM8(m+9) = 2; // .ai_state
}

/* loc_A3CD: ai_state bit 0x8 - runs an initial delay (counted in the
 * high nibble of ai_state) while still free-falling, then hands off
 * to type0_settle_step2. */
static void type0_settle(uint16_t m)
{
    uint8_t low = (MEM8(m+6) + 1) & 0x0F; // .anim_counter
    if (low >= 0x0D) low = 0x0B;
    MEM8(m+6) = low;

    if (MEM8(m+0xA) & 1) { // .ai_timer: initial delay already elapsed
        type0_settle_step2(m); // loc_A3F8
        return;
    }

    move_monster_S(m);
    MEM8(m+9) += 0x10; // .ai_state: high-nibble delay counter
    if (MEM8(m+9) & 0xF0) return; // still counting, hasn't wrapped yet
    MEM8(m+0xA) |= 1; // .ai_timer: delay elapsed
}

/* loc_A3F8: takes one plain E/W step (only once, gated by ai_timer bit
 * 0x4) before switching over to the trajectory-driven drift. */
static void type0_settle_step2(uint16_t m)
{
    if (MEM8(m+0xA) & 4) { // .ai_timer
        type0_settle_trajectory(m); // loc_A412
        return;
    }
    MEM8(m+0xA) |= 4;
    if (MEM8(m+0xA) & 8) {
        move_monster_W(m); // tail call, result unused
    } else {
        move_monster_E(m);
    }
}

/* loc_A412: samples trajectory_right/left (indexed by a rotated slice
 * of ai_state) to drift while falling; once the counter (ai_state high
 * 3 bits) wraps around it resets back into the snap-backward state
 * (0x2), and getting blocked deep enough into the pass flips facing. */
static void type0_settle_trajectory(uint16_t m)
{
    const uint8_t *traj = (MEM8(m+5) & 0x80) ? trajectory_right : trajectory_left; // .ai_flags

    uint8_t al = MEM8(m+9); // .ai_state
    al = (uint8_t)((al << 3) | (al >> 5)); // rol al,1 (x3)
    uint8_t idx = al & 7;

    MEM8(m+9) += 0x20; // .ai_state
    if (!(MEM8(m+9) & 0xE0)) {
        MEM8(m+0xA) = 0; // .ai_timer
        MEM8(m+9) = 2;    // .ai_state
    }

    if (monster_move_in_direction(m, traj[idx])) return; // moved along the trajectory

    uint8_t hi = MEM8(m+9) & 0xE0; // .ai_state
    if (hi != 0 && hi < 0xC0) {
        MEM8(m+5) ^= 0x80; // .ai_flags: flip facing
    }
}


/*
 * Type 1 - two-tile linking monster
 */
static void type1_ai(uint16_t m) // loc_A466
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 0x10; // .hp

    if (!(MEM8(m+5) & 0x20)) { // .ai_flags: not hit
        type1_common(m); // loc_A4EC
        return;
    }

    uint8_t al = MEM8(m+5) & 0x1F; // .ai_flags low 5 bits: hit-type code
    if (al == 4 || al == 5 || al == 8) {
        Hero_Hits_monster(m);
        return;
    }
    if (al == 1 && MEM8(ADDR_SWORD_TYPE) == SWORD_ENCHANTMENT) {
        Hero_Hits_monster(m);
        return;
    }
    if (MEM8(m+6) & 1) { // .anim_counter: odd frame
        Hero_Hits_monster(m);
        return;
    }

    // loc_A4B1: this hit is "absorbed" instead - clear the hit flag and
    // try to link up with (or keep growing) a partner monster slot.
    MEM8(m+5) &= 0xDF; // .ai_flags
    if (!(MEM8(m+7) & 0x40)) { // not already linked
        uint16_t partner; uint8_t idx;
        if (Find_Monsters_Near_Hero(m, &partner, &idx)) {
            MEM16(partner) = 0xFF00;
            if (MEM8(partner+7) & 0x40) {
                MEM8(partner+7) &= 0xBF;
                uint8_t other_idx = MEM8(partner+0xA);
                uint16_t other = MEM16(ADDR_MONSTERS_LIST) + (uint16_t)other_idx * 0x10;
                MEM8(other+2) = 0;
            }
            MEM8(partner+2) = 0x7F;
            MEM8(m+0xA) = idx;
            MEM8(m+7) |= 0x40;
        }
    }

    type1_common(m); // loc_A4EC
}

/* loc_A4EC: clears ai_state bit 0 and only proceeds to actually move
 * when that bit had been clear (i.e. skips a frame right after it was
 * set, e.g. by type1_grow_* below). */
static void type1_common(uint16_t m)
{
    int bit_set = (MEM8(m+9) & 1) != 0; // .ai_state
    MEM8(m+9) &= 0xFE;
    if (bit_set) return;

    type1_move(m); // loc_A4F9
}

/* loc_A4F9: unlinked monsters just walk; linked ones run the growth /
 * repositioning logic instead. */
static void type1_move(uint16_t m)
{
    if (MEM8(m+7) & 0x40) { // linked to a partner
        type1_linked_move(m); // loc_A56C
        return;
    }

    uint8_t a = MEM8(m+6); // .anim_counter
    uint8_t low = (a + 1) & 3;
    uint8_t high = a & 0xF0;
    MEM8(m+6) = high | low;

    type1_fall_and_patrol(m); // loc_A514
}

/* loc_A514: falls, then (once landed) rocks towards the hero's row / the
 * anchor column, bouncing off whichever side is blocked. */
static void type1_fall_and_patrol(uint16_t m)
{
    if (move_monster_S(m)) return; // still falling

    MEM8(m+6) -= 0x10; // .anim_counter: landing countdown
    if (MEM8(m+6) & 0xF0) return; // still counting down

    MEM8(m+6) |= 0x40; // .anim_counter: landed

    uint8_t hero_y = MEM8(ADDR_HERO_Y);
    uint8_t my_y = MEM8(m+2); // .currY
    int aligned = (hero_y == my_y) || (((hero_y + 1) & 0x3F) == my_y);

    if (!aligned) {
        if (MEM8(m+5) & 0x80) { // .ai_flags: facing right
            type1_bounce_east(m); // loc_A557
        } else {
            type1_bounce_west(m); // loc_A54B
        }
        return;
    }

    // loc_A544: aligned with the hero - head back towards the anchor column
    if (MEM8(m+3) <= 0x10) { // .m_x_rel
        type1_bounce_east(m); // loc_A557
    } else {
        type1_bounce_west(m); // loc_A54B
    }
}

/* loc_A54B: step west, falling back to east on failure. */
static void type1_bounce_west(uint16_t m)
{
    MEM8(m+5) &= 0x7F; // face left
    if (move_monster_W(m)) return;
    type1_bounce_east(m); // loc_A557
}

/* loc_A557: step east, falling back to a single west attempt on
 * failure (regardless of that attempt's own result). */
static void type1_bounce_east(uint16_t m)
{
    MEM8(m+5) |= 0x80; // face right
    if (move_monster_E(m)) return;
    MEM8(m+5) &= 0x7F; // face left
    move_monster_W(m); // tail call, result unused
}

/* loc_A56C: linked monster - advances a 3-bit walk cycle, and once it
 * wraps back to 6 tries to (re)position the partner half just ahead of
 * or behind this one, depending on facing. */
static void type1_linked_move(uint16_t m)
{
    uint8_t a = MEM8(m+6); // .anim_counter
    uint8_t low = (a + 1) & 7;
    uint8_t high = a & 0xF0;
    MEM8(m+6) = high | low;
    if (low != 6) {
        type1_fall_and_patrol(m); // loc_A514
        return;
    }

    uint8_t partner_idx = MEM8(m+0xA);
    uint16_t partner = MEM16(ADDR_MONSTERS_LIST) + (uint16_t)partner_idx * 0x10; // di
    uint16_t prox = coords_to_prox_addr(MEM8(m+3), MEM8(m+2)); // .m_x_rel, .currY

    if (MEM8(m+5) & 0x80) { // .ai_flags: facing right
        int8_t x = (int8_t)MEM8(m+3); // .m_x_rel
        if (x < 0) { type1_fall_and_patrol(m); return; }
        if ((uint8_t)x < 3) { type1_fall_and_patrol(m); return; }
        if (type1_check_room(prox, 0x27)) { type1_fall_and_patrol(m); return; } // blocked
        type1_grow_right(m, partner, prox); // loc_A618
    } else { // facing left
        int8_t x = (int8_t)MEM8(m+3);
        if (x < 0) { type1_fall_and_patrol(m); return; }
        if ((uint8_t)x >= 0x21) { type1_fall_and_patrol(m); return; }
        if (type1_check_room(prox, 0x23)) { type1_fall_and_patrol(m); return; } // blocked
        type1_grow_left(m, partner, prox); // loc_A5C1
    }
}

/* sub_A679: probes a 3-row by 3-tile block of the proximity map,
 * starting `offset` cells before `prox` (after wrapping for the map's
 * vertical cylinder), to make sure there's room for the partner
 * segment to grow into. Returns nonzero (matching the original CF=1)
 * when the area is blocked. */
static int type1_check_room(uint16_t prox, uint16_t offset)
{
    uint16_t addr = prox - offset;
    wrap_map_from_below(&addr);

    for (int row = 0; row < 3; row++) {
        if (is_blocking(MEM8(addr)))     return 1;
        if (is_blocking(MEM8(addr + 1))) return 1;
        if (is_blocking(MEM8(addr + 2))) return 1;
        addr += 0x24; // PROX_COLS
        wrap_map_from_above(&addr);
    }
    return 0;
}

/* loc_A5C1: grows/repositions the partner two tiles to the left of
 * this monster (used while facing left). */
static void type1_grow_left(uint16_t m, uint16_t partner, uint16_t prox)
{
    uint16_t map_addr = prox + 2;
    uint8_t layer_val = MEM8(map_addr); // background tile being covered
    MEM8(map_addr) = MEM8(m+0xA) | 0x80; // stamp our entity id into the proximity map

    MEM8(partner+4) = MEM8(m+4) & 0x1F; // partner .flags: inherit species sub-type

    uint16_t x = (uint16_t)(MEM16(m+0) + 2);
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);
    uint16_t dx = (uint16_t)(map_width - 1 - x);
    if (x > (uint16_t)(map_width - 1)) { // borrow: wrapped past the right edge
        dx = (uint16_t)~dx;
        x = dx;
    }
    MEM16(partner+0) = x;

    MEM8(partner+3) = (uint8_t)(MEM8(m+3) + 2); // .m_x_rel

    MEM8(m+6) = 0x16;       // .anim_counter: this half's sprite
    MEM8(partner+6) = 0x17;  // partner .anim_counter: other half's sprite

    type1_finish_link(m, partner, layer_val);
}

/* loc_A618: mirror of type1_grow_left, growing to the right instead
 * (used while facing right). */
static void type1_grow_right(uint16_t m, uint16_t partner, uint16_t prox)
{
    uint16_t map_addr = prox - 2;
    uint8_t layer_val = MEM8(map_addr);
    MEM8(map_addr) = MEM8(m+0xA) | 0x80;

    MEM8(partner+4) = MEM8(m+4) & 0x1F; // partner .flags

    int16_t x = (int16_t)MEM16(m+0) - 2;
    if (x < 0) {
        x += (int16_t)MEM16(ADDR_MAP_WIDTH);
    }
    MEM16(partner+0) = (uint16_t)x;

    MEM8(partner+3) = (uint8_t)(MEM8(m+3) - 2); // .m_x_rel

    MEM8(m+6) = 0x17;       // .anim_counter
    MEM8(partner+6) = 0x16;  // partner .anim_counter

    type1_finish_link(m, partner, layer_val);
}

/* loc_A64C: shared tail of type1_grow_left/right - syncs the partner's
 * row, stashes the covered background tile, resets a few of the
 * partner's fields, clears our "growth in progress" bit, and flags the
 * partner for immediate processing if it hasn't run yet this frame. */
static void type1_finish_link(uint16_t m, uint16_t partner, uint8_t saved_layer_val)
{
    MEM8(partner+2) = MEM8(m+2); // .currY

    uint8_t idx = MEM8(m+0xA); // this monster's entity id
    MEM8(ADDR_PROXIMITY_LAYER2 + idx) = saved_layer_val;

    MEM8(partner+7) = 0;
    MEM8(partner+8) = 0;
    MEM8(partner+9) = 0;
    MEM8(m+7) &= 0xBF; // .flags: clear the "growth in progress" bit

    if (MEM8(ADDR_MONSTER_INDEX) < MEM8(m+0xA)) {
        MEM8(partner+9) |= 1; // partner .ai_state: process it later this same frame
    }
}


/*
 * Type 2/3 - dormant trap
 */
static void type2_ai(uint16_t m) // loc_A6B1, shared by monster.flags values 2 and 3
{
    MEM8(m+4) |= 0x20; // .flags

    if (MEM8(m+9) & 1) { // .ai_state: already awake
        type2_active(m); // loc_A6DB
        return;
    }

    // dormant: only consider waking up while the hero is in a narrow x-band
    uint8_t x = MEM8(m+3); // .m_x_rel
    if (x < 8) return;
    if (x >= 0x13) return;

    if ((get_random() & 3) != 0) return;

    MEM8(m+6) = 1;  // .anim_counter
    MEM8(m+9) |= 1;  // .ai_state: wake up
}

/* loc_A6DB: awake - free-fall once, then hand off to the shared
 * vertical-distance check for the rest of the active behaviour. */
static void type2_active(uint16_t m)
{
    if (move_monster_S(m)) return; // still falling

    MEM8(m+7) = (uint8_t)((MEM8(m+7) & 0xF0) | 1);
    Check_Vertical_Distance_Between_Hero_And_Monster(m);
}


/*
 * Type 4 - preset-path crawler confined to a narrow x-band
 */
static void type4_ai(uint16_t m) // loc_A6F0
{
    if (MEM8(m+8) == 0) MEM8(m+8) = 2; // .hp

    if (MEM8(m+5) & 0x20) { // .ai_flags: hit
        Hero_Hits_monster(m);
        return;
    }

    uint8_t x = MEM8(m+3); // .m_x_rel
    if (x < 3) return;
    if (x >= 0x21) return;

    uint8_t used = type4_try_directions(m); // sub_A71C
    if (used == 3) {
        type4_try_directions(m); // original tail-calls itself again here, result discarded
    }
}

/* sub_A71C: looks up this monster's ai_state row in type4_table_left/
 * right (by facing) and tries each of its 5 (direction, next_state,
 * next_anim) triplets in turn via monster_move_in_direction, adopting
 * the first one that succeeds. Returns the original "cl" value: the
 * remaining-attempts count (5..1) at the point of success, or 0 if
 * every attempt failed (in which case facing is flipped instead). */
static uint8_t type4_try_directions(uint16_t m)
{
    const uint8_t *table = (MEM8(m+5) & 0x80) ? type4_table_right : type4_table_left; // .ai_flags
    const uint8_t *row = table + (uint16_t)MEM8(m+9) * 15; // .ai_state

    for (uint8_t remaining = 5; remaining > 0; remaining--) {
        const uint8_t *entry = row + (5 - remaining) * 3;
        if (monster_move_in_direction(m, entry[0])) {
            MEM8(m+9) = entry[1]; // .ai_state
            MEM8(m+6) = entry[2]; // .anim_counter
            return remaining;
        }
    }

    MEM8(m+5) ^= 0x80; // .ai_flags: flip facing, nothing worked
    return 0;
}
