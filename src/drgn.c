/*
 * drgn.c - translated from drgn.asm ("Dragon" boss AI)
 *
 * Gameplay/AI translation only.  As with tako.c, the large sprite-frame
 * tables near the start of the original overlay (A030..A297) are asset data
 * consumed by the generic boss renderer and are intentionally not duplicated
 * here.  The tables below (A783 onward) ARE part of the AI: Drgn_AI_proc
 * reads them every frame to assemble the Dragon's current 29x10 tile layout
 * and, during the breath attack, its additional 13-column flame layer.
 *
 * Dragon body pieces are represented as temporary entries in monsters_table,
 * exactly as in the original overlay.  The usual 16-byte monster fields are
 * reused as follows:
 *   +0 currX (word), +2 currY, +3 m_x_rel, +4 flags,
 *   +5 ai_flags, +6 anim_counter.
 * The generic hit code sets ai_flags bit 0x40.  This module sets bit 0x20
 * while flashing all Dragon parts after a hit.  The low five ai_flags bits
 * are passed back to Get_Stats() as the attack/damage request type.
 *
 * The shared boss state is reached through ADDR_BOSS_STATE_PTR:
 *   +0 boss_x (word), +2 boss_y (byte), +3 boss_hp (word).
 */

#include "zeliard.h"

/* ------------------------------------------------------------------------- */
/* Persistent AI state (byte_AA53 .. byte_AA68).                             */
/* ------------------------------------------------------------------------- */
static uint8_t compose_row = 0;              /* byte_AA53 */
static uint8_t compose_col = 0;              /* byte_AA54 */
static uint8_t current_rel_x = 0;            /* byte_AA55 */
static uint8_t breath_active = 0;            /* byte_AA56 */
static uint8_t breath_frame = 0;             /* byte_AA57 */
static uint8_t death_timer = 0;              /* byte_AA58 */
static uint8_t active_sprite_count = 0;      /* byte_AA59 */
static uint8_t hit_monster_flags = 0;        /* byte_AA5A */
static uint8_t pose = 0;                     /* byte_AA5B: 0..10 */
static uint8_t anim_phase = 0;               /* byte_AA5C */
static uint8_t motion_phase = 0;             /* byte_AA5D */
static uint8_t movement_accum = 0;           /* byte_AA5E */
static uint8_t move_right_after_hit = 0;      /* byte_AA5F */
static uint8_t move_right_ticks = 0;          /* byte_AA60 */
static uint8_t breath_windup = 0;            /* byte_AA61 */
static uint8_t windup_base_pose = 0;         /* byte_AA62 */
static uint8_t windup_counter = 0;           /* byte_AA63 */
static uint8_t breath_counter = 0;           /* byte_AA64 */
static uint8_t vulnerable_hit = 0;           /* byte_AA65 */
static uint8_t reaction_variant = 0;         /* byte_AA66 */
static uint8_t reaction_index = 0;           /* byte_AA67 */
static uint8_t reaction_active = 0;          /* byte_AA68 */

/* A 29-column x 10-row compositing surface; the assembly clears 0xA0 words
 * (320 bytes), although only the first 290 bytes are rendered. */
static uint8_t layout_buffer[320];           /* unk_AA69 */

/* ------------------------------------------------------------------------- */
/* AI-consumed sprite/layout data (A783 onward).                             */
/* ------------------------------------------------------------------------- */

/* Main body, indexed by pose 0..10. */
static const uint8_t body_799[] = { 0x00,0x02,0x01,0x10,0x11,0x12,0x13,0x14,0x15,0x17,0x16 };
static const uint8_t body_7a4[] = { 0x00,0x02,0x06,0x10,0x11,0x12,0x13,0x14,0x15,0x17,0x16 };
static const uint8_t body_7af[] = { 0x00,0x03,0x01,0x2E,0x11,0x12,0x13,0x14,0x15,0x17,0x16 };
static const uint8_t body_7ba[] = { 0x00,0x03,0x06,0x2E,0x11,0x12,0x13,0x14,0x15,0x17,0x16 };
static const uint8_t body_7c5[] = { 0x05,0x04,0x19,0x18,0x13,0x1A,0x14,0x15,0x17,0x16 };
static const uint8_t body_7cf[] = { 0x07,0x04,0x76,0x77,0x18,0x13,0x1A,0x14,0x15,0x17,0x16 };
static const uint8_t body_7da[] = { 0x05,0x04,0x1C,0x1B,0x1D,0x1E,0x1F,0x20,0x22,0x16 };
static const uint8_t body_7e4[] = { 0x00,0x02,0x01,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x21 };
static const uint8_t body_7ef[] = { 0x00,0x02,0x06,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x21 };
static const uint8_t body_7fa[] = { 0x00,0x03,0x01,0x2A,0x24,0x25,0x26,0x27,0x28,0x29,0x21 };
static const uint8_t body_805[] = { 0x00,0x03,0x06,0x2A,0x24,0x25,0x26,0x27,0x28,0x29,0x21 };
static const uint8_t *const body_tiles[11] = {
    body_799, body_7af, body_7a4, body_7ba, body_7c5, body_7cf,
    body_7da, body_7e4, body_7fa, body_7ef, body_805
};

static const uint8_t body_mask_826[12] = { 0,0,0,0x80,0x40,0x80,0x20,0x80,0x50,0x16,0,4 };
static const uint8_t body_mask_832[12] = { 0,0,0,0x80,0x20,0x80,0x20,0x80,0x50,0x16,0,4 };
static const uint8_t body_mask_83e[12] = { 0,0,0,0,0,0x20,0x80,0x20,0x90,0x36,0,4 };
static const uint8_t body_mask_84a[12] = { 0,0,0,0,0,0x20,0x80,0x30,0x90,0x36,0,4 };
static const uint8_t body_mask_856[12] = { 0,0,8,0x20,0x10,0x20,0x10,0,0x18,0x0A,0,4 };
static const uint8_t body_mask_862[12] = { 8,4,8,4,8,4,8,4,0,6,0,4 };
static const uint8_t body_mask_86e[12] = { 8,2,8,4,8,4,8,4,0,6,0,4 };
static const uint8_t *const body_masks[11] = {
    body_mask_826, body_mask_832, body_mask_826, body_mask_832,
    body_mask_83e, body_mask_84a, body_mask_856, body_mask_862,
    body_mask_86e, body_mask_862, body_mask_86e
};

/* Small fixed three-tile overlay at row 25, column 8. */
static const uint8_t detail_tiles[] = { 0x2B,0x2C,0x2D };
static const uint8_t detail_mask[4] = { 0x80,0x00,0x80,0x80 };

/* Motion-dependent left and right appendages. */
static const uint8_t limb_889[] = { 0x50,0x51,0x52,0x54,0x53,0x55 };
static const uint8_t limb_88f[] = { 0x56,0x57,0x58,0x5A,0x59,0x5B };
static const uint8_t limb_895[] = { 0x5C,0x5D,0x5F,0x5E,0x60 };
static const uint8_t *const limb_tiles[4] = { limb_889, limb_88f, limb_895, limb_88f };

static const uint8_t limb_mask_8a2[7] = { 0x20,0,0x20,0,0xA0,0,0xA0 };
static const uint8_t limb_mask_8a9[7] = { 0,0x20,0x20,0,0xA0,0,0xA0 };
static const uint8_t limb_mask_8b0[7] = { 0,0,0x20,0,0xA0,0,0xA0 };
static const uint8_t *const limb_masks[4] = { limb_mask_8a2, limb_mask_8a9, limb_mask_8b0, limb_mask_8a9 };

static const uint8_t rlimb_8bf[] = { 0x75,0x62,0x63,0x64,0x73,0x65,0x74,0x66 };
static const uint8_t rlimb_8c7[] = { 0x75,0x67,0x63,0x69,0x73,0x6A,0x74,0x68 };
static const uint8_t rlimb_8cf[] = { 0x61,0x6B,0x6C,0x70,0x73,0x71,0x74,0x72 };
static const uint8_t *const rlimb_tiles[4] = { rlimb_8bf, rlimb_8c7, rlimb_8cf, rlimb_8c7 };
static const uint8_t rlimb_mask[7] = { 0xA0,0,0xA0,0,0xA0,0,0xA0 };

/* Animation-phase overlay, selected by anim_phase & 1. */
static const uint8_t anim_8e2[] = { 0x36,0x35,0x37,0x3C,0x30,0x38,0x3D,0x31,0x39,0x3E,0x32,0x3A,0x3B,0x33,0x34 };
static const uint8_t anim_8f1[] = { 0x40,0x41,0x46,0x42,0x47,0x4A,0x43,0x48,0x4B,0x49,0x44,0x45 };
static const uint8_t *const anim_tiles[2] = { anim_8e2, anim_8f1 };
static const uint8_t anim_mask_901[11] = { 0x10,0x40,0x28,0x80,0x28,0x80,0x28,0x80,0x30,0x80,0x80 };
static const uint8_t anim_mask_90c[11] = { 0x10,0,0x28,0,0x58,0,0x58,0x10,0x40,0,0x40 };
static const uint8_t *const anim_masks[2] = { anim_mask_901, anim_mask_90c };

/* Breath/flame extension for poses < 6. */
static const uint8_t flame0_91f[] = { 0x80 };
static const uint8_t flame1_920[] = { 0x83,0x82,0x81 };
static const uint8_t flame2_923[] = { 0x8A,0x89,0x86,0x87,0x85,0x88,0x84 };
static const uint8_t flame3_92a[] = { 0x8D,0x8E,0x8C,0x8F,0x8B,0x81 };
static const uint8_t *const flame_left_tiles[4] = { flame0_91f, flame1_920, flame2_923, flame3_92a };
static const uint8_t flame_left_mask0[13] = { 0,0,0,0,0,0,0,0,0,0,0,0,0x80 };
static const uint8_t flame_left_mask1[13] = { 0,0,0,0,0,0,0,0,0,0x10,0,0x40,0x80 };
static const uint8_t flame_left_mask2[13] = { 0,0,0,0,0,8,0,8,0,0x18,0x20,8,0x80 };
static const uint8_t flame_left_mask3[13] = { 0,0,0,0,0,8,0,8,0x10,8,0x20,0,0x80 };
static const uint8_t *const flame_left_masks[4] = {
    flame_left_mask0, flame_left_mask1, flame_left_mask2, flame_left_mask3
};

/* Breath/flame extension for poses >= 6. */
static const uint8_t flame0_974[] = { 0x90,0x91 };
static const uint8_t flame1_976[] = { 0x92,0x93,0x94 };
static const uint8_t flame2_979[] = { 0x95,0x96,0x97,0x98,0x96,0x99 };
static const uint8_t flame3_97f[] = { 0x9A,0x9B,0x9B,0x9C,0x9B,0x9D };
static const uint8_t *const flame_right_tiles[4] = { flame0_974, flame1_976, flame2_979, flame3_97f };
static const uint8_t flame_right_mask0[13] = { 0,0,0,0,0,0,0,0,0x20,0x20,0,0,0 };
static const uint8_t flame_right_mask1[13] = { 0,0,0,0,0,0x20,0,0x20,0,0x20,0,0,0 };
static const uint8_t flame_right_mask2[13] = { 0x20,0x20,0,0x20,0,0x20,0,0x20,0,0x20,0,0,0 };
static const uint8_t *const flame_right_masks[4] = {
    flame_right_mask0, flame_right_mask1, flame_right_mask2, flame_right_mask2
};

static const uint8_t reaction_low_pose[7]  = { 10,9,6,3,2,3,0x82 };
static const uint8_t reaction_high_pose[7] = { 3,2,3,2,1,3,0x82 };

/* ------------------------------------------------------------------------- */
/* Helpers.                                                                  */
/* ------------------------------------------------------------------------- */
static void apply_damage_to_boss(uint16_t damage);      /* sub_A9B4 */
static void death_sequence_step(void);                  /* loc_A9F2 */
static void render_dragon(void);                        /* loc_A542 */
static void composite_layer(const uint8_t *tiles, const uint8_t *masks,
                            uint8_t rows);               /* sub_A758 */

static uint16_t boss_state_addr(void)
{
    return MEM16(ADDR_BOSS_STATE_PTR);
}

/* Carry-style movement helpers.  Return 1 when movement succeeded, 0 when
 * the corresponding 14..30 horizontal bound prevented it. */
static uint8_t move_boss_left(void)                     /* sub_A521 */
{
    uint16_t b = boss_state_addr();
    uint16_t x = (uint16_t)(MEM16(b + 0) - 1);
    if (x <= 14) return 0;
    MEM16(b + 0) = x;
    return 1;
}

static uint8_t move_boss_right(void)                    /* sub_A532 */
{
    uint16_t b = boss_state_addr();
    uint16_t x = (uint16_t)(MEM16(b + 0) + 1);
    if (x > 30) return 0;
    MEM16(b + 0) = x;
    return 1;
}

void Dragon_AI_reset(void)
{
    compose_row = compose_col = current_rel_x = 0;
    breath_active = breath_frame = death_timer = 0;
    active_sprite_count = hit_monster_flags = 0;
    pose = anim_phase = motion_phase = movement_accum = 0;
    move_right_after_hit = move_right_ticks = 0;
    breath_windup = windup_base_pose = windup_counter = breath_counter = 0;
    vulnerable_hit = reaction_variant = reaction_index = reaction_active = 0;
}

/* ------------------------------------------------------------------------- */
/* Drgn_AI - direct translation of Drgn_AI_proc, called once per frame.      */
/* ------------------------------------------------------------------------- */
void Dragon_AI(uint16_t m)
{
    (void)m;

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    active_sprite_count = 0;
    hit_monster_flags = 0;

    /* Restore proximity tiles overwritten by last frame's pseudo-monsters,
     * and retain the first struck Dragon part. */
    for (;;) {
        if (MEM16(si + 0) == 0xFFFF) break;

        uint8_t rel;
        if (is_in_proximity_window(MEM16(si + 0), &rel)) {
            MEM8(si + 3) = rel;
            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
            MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count);

            if ((MEM8(si + 5) & 0x40) && !(hit_monster_flags & 0x80)) {
                uint8_t al = (uint8_t)(MEM8(si + 5) & 0x1F);
                /* In the Dragon overlay a zero low-nibble in .flags marks
                 * the vulnerable body pieces (opposite-looking test from
                 * Tako, but faithful to `test [si+4],1Fh / or al,80h`). */
                if ((MEM8(si + 4) & 0x1F) == 0) al |= 0x80;
                hit_monster_flags = al;
            }
        }

        active_sprite_count++;
        si += 16;
    }

    si = base;
    MEM16(si) = 0xFFFF;

    if (hit_monster_flags != 0) {
        uint8_t al = hit_monster_flags;
        uint8_t type = (uint8_t)(al & 0x1F);
        uint16_t damage = Get_Stats(type);

        /* bx = stat/2; for request types >= 2 it is reduced by another /4. */
        damage >>= 1;
        if ((uint8_t)(al & 0x7F) >= 2) damage >>= 2;

        if (al & 0x80) {
            vulnerable_hit = 0xFF;
            MEM8(ADDR_SOUND_FX_REQUEST) = 52;
            damage <<= 1;
        } else {
            move_right_after_hit = 0xFF;
            MEM8(ADDR_SOUND_FX_REQUEST) = 53;
        }

        apply_damage_to_boss(damage);

        if (vulnerable_hit) {
            reaction_variant = (pose < 6) ? 1 : 0;
            reaction_index = 0;
            breath_active = 0;
            breath_windup = 0;
            move_right_after_hit = 0xFF;
            reaction_active = 0xFF;
            move_right_ticks = 8;
        }
        vulnerable_hit = 0;
    }

    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        death_sequence_step();
        return;
    }

    anim_phase++;

    if (breath_active) {
        MEM8(ADDR_SOUND_FX_REQUEST) = 54;
        uint8_t next = (uint8_t)(breath_frame + 1);
        if (next >= 4) next = 2;
        breath_frame = next;
        if (++breath_counter >= 10) breath_active = 0;
        render_dragon();
        return;
    }

    if (breath_windup) {
        windup_counter++;
        pose = (uint8_t)(windup_base_pose + (windup_counter & 1));
        if (windup_counter >= 6) {
            pose = (uint8_t)(windup_base_pose + 1);
            breath_frame = 0;
            breath_counter = 0;
            breath_windup = 0;
            breath_active = 0xFF;
            MEM8(ADDR_SOUND_FX_REQUEST) = 54;
        }
        render_dragon();
        return;
    }

    /* A carry from adding 0x80 occurs every second call: Dragon horizontal
     * movement and motion_phase updates happen only on those frames. */
    {
        uint8_t old = movement_accum;
        movement_accum = (uint8_t)(movement_accum + 0x80);
        if (movement_accum < old) {
            if (!move_right_after_hit) {
                if (move_boss_left()) motion_phase++;
            } else {
                move_right_ticks--;
                if (move_right_ticks == 0) {
                    move_right_after_hit = 0;
                } else {
                    move_right_after_hit = move_boss_right() ? 0xFF : 0;
                    motion_phase--;
                }
            }
        }
    }

    if (reaction_active) {
        const uint8_t *seq = reaction_variant ? reaction_low_pose : reaction_high_pose;
        uint8_t next = seq[reaction_index++];
        if (next & 0x80) {
            next &= 0x7F;
            reaction_active = 0;
        }
        pose = next;
        render_dragon();
        return;
    }

    /* 1/4 random chance to start the breath wind-up, but only from poses
     * 0, 4, or 7. */
    if ((get_random() & 0xC0) == 0 && (pose == 0 || pose == 4 || pose == 7)) {
        windup_base_pose = pose;
        windup_counter = 0;
        breath_windup = 0xFF;
        render_dragon();
        return;
    }

    /* Select a standing pose from Dragon X relative to the viewport.  The
     * original uses only the low byte of both values for these comparisons. */
    {
        uint8_t x = (uint8_t)MEM16(boss_state_addr() + 0);
        uint8_t left = MEM8(ADDR_PROXIMITY_MAP_LEFT_COL);
        uint8_t edge = (uint8_t)(left + 16);

        if (edge < x) {
            pose = (pose < 6) ? 6 : 7;
        } else {
            edge = (uint8_t)(edge - 5);
            if (edge >= x)
                pose = (pose < 7) ? 4 : 6;
            else
                pose = (pose < 7) ? 0 : 6;
        }
    }

    render_dragon();
}

/* Composite one sparse tile layer into layout_buffer.  The assembly rotates
 * each mask byte exactly eight times; testing bits 7..0 gives the identical
 * result without mutating tables that end every call in their original state. */
static void composite_layer(const uint8_t *tiles, const uint8_t *masks,
                            uint8_t rows)
{
    uint16_t di = (uint16_t)compose_row * 10u + compose_col;

    for (uint8_t r = 0; r < rows; r++) {
        uint8_t mask = masks[r];
        for (uint8_t bit = 0; bit < 8; bit++) {
            if (mask & (uint8_t)(0x80u >> bit))
                layout_buffer[di] = *tiles++;
            di++;
        }
        di += 2;
    }
}

/* Build the 29x10 composite Dragon image, convert occupied cells into
 * pseudo-monsters, and optionally append the breath/flame pseudo-monsters. */
static void render_dragon(void)
{
    for (uint16_t i = 0; i < sizeof(layout_buffer); i++)
        layout_buffer[i] = 0xFF;

    /* Main body. */
    compose_row = 0;
    compose_col = 1;
    composite_layer(body_tiles[pose], body_masks[pose], 12);

    /* Phase-dependent overlay. */
    compose_row = 12;
    compose_col = 0;
    {
        uint8_t idx = (uint8_t)(anim_phase & 1);
        composite_layer(anim_tiles[idx], anim_masks[idx], 11);
    }

    /* Left appendage. */
    compose_row = 9;
    compose_col = 6;
    {
        uint8_t idx = (uint8_t)(motion_phase & 3);
        composite_layer(limb_tiles[idx], limb_masks[idx], 7);
    }

    /* Right appendage. */
    compose_row = 17;
    compose_col = 6;
    {
        uint8_t idx = (uint8_t)(motion_phase & 3);
        composite_layer(rlimb_tiles[idx], rlimb_mask, 7);
    }

    /* Fixed detail. */
    compose_row = 25;
    compose_col = 8;
    composite_layer(detail_tiles, detail_mask, 4);

    active_sprite_count = 0;
    uint16_t b = boss_state_addr();
    uint16_t x = MEM16(b + 0);
    uint16_t si = MEM16(ADDR_MONSTERS_LIST);
    const uint8_t *cell = layout_buffer;

    for (uint8_t col = 0; col < 29; col++, x++, cell += 10) {
        uint8_t rel;
        int in_range = is_in_proximity_window(x, &rel);
        current_rel_x = rel;
        if (!in_range) continue;

        for (uint8_t row = 0; row < 10; row++) {
            uint8_t tile = cell[row];
            if (tile == 0xFF) continue;

            MEM16(si + 0) = x;
            MEM8(si + 2) = (uint8_t)((MEM8(b + 2) + row) & 0x3F);
            MEM8(si + 3) = current_rel_x;

            uint8_t flags = (uint8_t)(tile >> 4);
            if (!MEM8(ADDR_BOSS_BEING_HIT)) flags |= 0x80;
            MEM8(si + 4) = flags;
            MEM8(si + 6) = tile;
            MEM8(si + 5) = hit_monster_flags ? 0x20 : 0x00;

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
            uint8_t old_tile = MEM8(di);
            MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
            MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

            si += 16;
            active_sprite_count++;
        }
    }

    MEM16(si) = 0xFFFF;
    if (!breath_active) return;

    const uint8_t *flame_tiles;
    const uint8_t *flame_masks;
    if (pose < 6) {
        flame_tiles = flame_left_tiles[breath_frame & 3];
        flame_masks = flame_left_masks[breath_frame & 3];
    } else {
        flame_tiles = flame_right_tiles[breath_frame & 3];
        flame_masks = flame_right_masks[breath_frame & 3];
    }

    x = (uint16_t)(MEM16(b + 0) - 10);
    if (pose == 5) x = (uint16_t)(x + 4);

    for (uint8_t col = 0; col < 13; col++, x++) {
        uint8_t mask = flame_masks[col];
        uint8_t rel;
        int in_range = is_in_proximity_window(x, &rel);
        current_rel_x = rel;

        for (uint8_t row = 0; row < 8; row++) {
            if (!(mask & (uint8_t)(0x80u >> row))) continue;

            if (in_range) {
                uint8_t tile = *flame_tiles;
                MEM16(si + 0) = x;
                MEM8(si + 2) = (uint8_t)((MEM8(b + 2) + row + 4) & 0x3F);
                MEM8(si + 3) = current_rel_x;
                MEM8(si + 4) = (uint8_t)((tile >> 4) | 0x20);
                MEM8(si + 6) = tile;
                MEM8(si + 5) = 0;

                uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
                uint8_t old_tile = MEM8(di);
                MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
                MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

                si += 16;
                active_sprite_count++;
            }

            /* The assembly advances the source tile pointer for every set
             * mask bit, including columns outside the proximity window. */
            flame_tiles++;
        }
    }

    MEM16(si) = 0xFFFF;
}

static void apply_damage_to_boss(uint16_t damage)
{
    uint16_t b = boss_state_addr();
    uint16_t hp = MEM16(b + 3);
    hp = (damage > hp) ? 0 : (uint16_t)(hp - damage);
    MEM16(b + 3) = hp;

    Draw_Boss_Health();
    if (hp != 0) return;

    death_timer = 0;
    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
    vulnerable_hit = 0;
    reaction_index = 0;
    breath_active = 0;
    breath_windup = 0;
}

static void death_sequence_step(void)
{
    if (death_timer >= 40) {
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;
    death_timer++;

    if (death_timer < 30) {
        anim_phase++;
        pose = (uint8_t)(2 + (anim_phase & 1));
        if ((anim_phase & 3) == 0)
            MEM8(ADDR_SOUND_FX_REQUEST) = 55;
    } else {
        anim_phase = 1;
        pose = 10;
    }

    render_dragon();
}
