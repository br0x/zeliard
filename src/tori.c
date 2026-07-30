/*
 * tori.c - translated from tori.asm ("Pollo"/"Tori" boss AI, the chicken boss)
 *
 * This is a boss-encounter overlay module, structurally identical to
 * crab.asm/crab.c ("Cangrejo") and tako.asm/tako.c ("Pulpo"): it is loaded
 * at a fixed segment address and exports an entry point (Pollo_AI,
 * originally Pollo_AI_proc) that runs once per frame while the "Pollo"
 * boss encounter is active, plus a shared "boss_state_block" that the
 * generic engine reads elsewhere (health bar, victory/reward handling,
 * name display) via a fixed offset, regardless of which boss module is
 * currently loaded.
 *
 * Scope of this translation
 * ------------------------------------------------------------------
 * This file translates the AI/gameplay logic only. The following are
 * NOT translated, since they are sprite/animation *asset* data read by
 * a separate, generic boss-rendering/loader routine at fixed offsets
 * into this overlay (never touched by Pollo_AI_proc itself), exactly
 * like the excluded tables in tako.c/crab.c:
 *   - the "start:" export header and its reserved padding
 *   - the 15 unnamed sprite/tile tables (byte_A04E .. byte_A1C5) and
 *     their offset table -- these belong to the regular, non-boss
 *     "chicken" monster's per-difficulty sprite tables, never
 *     referenced from Pollo_AI_proc or its subroutines
 *   - boss_state_block's own non-AI fields (xp_reward, arena_center_x,
 *     boss_placement, name_block_ptr, name_screen_x/y,
 *     boss_name_pstring) -- these are populated/read by the generic
 *     overlay loader and encounter/reward code, not by this AI
 *
 * The pose tables (off_A64D/pose_tile_pools and off_A6CB/
 * pose_shape_masks) ARE translated, since Pollo_AI_proc's sub_A552
 * reads them directly every frame to decide which of the boss's up to
 * 9x8 body-part slots produce a hittable pseudo-monster sprite this
 * frame -- same rationale as tako.c's tentacle_layout_tables /
 * tentacle_shape_tables.
 *
 * IMPORTANT: as in tako.c, the *shape* tables (pose_shape_masks) are
 * mutated in place at runtime -- the original code rotates each mask
 * byte (`rol byte ptr [bp],1`) once per consumed bit -- and several of
 * the 19 shape-table slots deliberately alias the very same 9-byte
 * array (this is how the original data was laid out); that aliasing
 * is preserved here on purpose to match the original behavior exactly,
 * even though (as in tako.c) each call performs a full 8-rotation pass
 * over every byte, so the byte's value is unchanged by the time the
 * call returns -- the mutation only matters mid-call.
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - Each visible body-part sprite occupies a temporary entry in the
 *   shared monsters_table (the same array real monsters live in),
 *   exactly as in tako.c/crab.c, reusing the same field offsets:
 *       +0 currX (word)   +2 currY   +3 m_x_rel   +4 flags
 *       +5 ai_flags        +6 anim_counter
 *   Here "+4 flags" holds the high nibble of the pose byte (a
 *   tile/shape group) and "+6 anim_counter" holds the whole pose byte,
 *   exactly mirroring the original `shr al,4 / mov [di+4],al` /
 *   `mov [di+6],ah` pair. "+5 ai_flags" bit 0x20 is set by us to
 *   request a hit-flash, while bit 0x40 is set by the external
 *   hit-detection code to tell us a part was struck.
 * - "si"/"di"/"bx" pointers from the original are modeled as plain
 *   uint16_t addresses into the flat MEM8/MEM16 address space, or as
 *   plain C pointers into the translated static tables, exactly as in
 *   tako.c/crab.c.
 * - boss_state_block's AI-relevant fields (boss_x, boss_y, boss_hp)
 *   are shared data reached through ADDR_BOSS_STATE_PTR, at the same
 *   offsets tako.c/crab.c use (+0 boss_x word, +2 boss_y byte, +3
 *   boss_hp word) since "boss_state_block" is simply a label alias
 *   for "boss_x" in the original assembly, immediately followed in
 *   memory by boss_y (byte_A775) and boss_hp.
 * - Local helpers that the original tested with jb/jnb (carry) return
 *   an int that is 1 when the original cleared the carry flag
 *   (success) and 0 when the original left the carry flag set
 *   (failure/limit reached), exactly as in tako.c's is_in_proximity_
 *   window-style boolean convention.
 * - is_in_proximity_window, Get_Stats, Draw_Boss_Health, get_random,
 *   Add_Projectile_To_Array, Browse_Projectiles, and the various
 *   ADDR_* absolute addresses (monsters table base, proximity second
 *   layer, sound FX request, boss-being-hit/boss-is-dead flags) are
 *   assumed declared elsewhere (zeliard.h), same as coords_to_prox_addr
 *   etc. in tako.c/crab.c.
 */

#include "zeliard.h"
#include <string.h>

/*
 * ============================================================================
 * Per-frame / persistent AI state (byte_A789 .. byte_A79B in the original)
 * ============================================================================
 * byte_A789 (a pure loop counter, reset and consumed within a single pass
 * in both places it's used) and byte_A792/byte_A793 (per-frame scratch)
 * are modeled as local variables below rather than file-scope statics,
 * since nothing reads them across frames.
 */
static uint8_t approach_phase = 0;       /* byte_A78A: wing-flap phase while closing/opening distance, wraps 0..3 */
static uint8_t recently_hit_flag = 0;    /* byte_A78B: set for hit_flash_timer frames after taking a hit */
static uint8_t attacking = 0;            /* byte_A78C: 0xFF while the dive-charge attack is in progress */
static uint8_t attack_phase = 0;         /* byte_A78D: sub-phase counter (0..3) driving attack pose + recovery pose */
static uint8_t recovering = 0;           /* byte_A78E: 0xFF while climbing back to hover height after an attack */
static uint8_t tick_div3 = 0;            /* byte_A78F: 0..2 counter, wraps every 3rd call to tick_every_3rd() */
static uint8_t flap_phase = 0;           /* byte_A790: generic wing-flap phase, wraps 0..3 */
static uint8_t hit_result = 0;           /* byte_A791: this frame's "who got hit" result; bit 0x80 = heavy hit, bits 0x1F = damage-stat index */
static uint8_t death_timer = 0;          /* byte_A794: counts up (0..0x28) during the death sequence */
static uint8_t hit_flash_timer = 0;      /* byte_A795: counts down after a hit; recently_hit_flag stays set while nonzero */
static uint8_t move_tick = 0;            /* byte_A796: frame counter; distance-based movement/AI only runs every other frame */
static uint8_t charging = 0;             /* byte_A797: 0xFF while winding up the wing-flaps before a dive-charge attack */
static uint8_t windup_flaps = 0;         /* byte_A798: counts wing-flaps during charge/projectile windup */
static uint8_t death_entry_flag = 0;     /* byte_A799: 0xFF once the death sequence should start using the "recovering" pose */
static uint8_t projectile_charging = 0;  /* byte_A79A: 0xFF while winding up to fire a projectile */
static uint8_t attack_duration = 0;      /* byte_A79B: counts down the dive-charge attack's remaining duration */

/*
 * byte_A79C: 72-byte scratch layout buffer (9 columns x 8 rows), rebuilt
 * every frame by select_pose() calls and then walked to populate the
 * shared monsters_table with this frame's hittable body-part sprites.
 */
static uint8_t byte_A79C[72];

/*
 * ============================================================================
 * Pose tables (off_A64D / off_A6CB in the original)
 * ============================================================================
 * pose_tile_pools[i] is the source pool of pose/tile-id bytes consumed
 * (via select_pose()) in the order that pose_shape_masks[i]'s set bits
 * are encountered, column by column. Transcribed 1:1 from tori.asm
 * (unk_A673 .. unk_A6C1 and unk_A6F1 .. unk_A75D).
 */
static const uint8_t pool_0[2]  = { 0x00, 0x30 };
static const uint8_t pool_1[2]  = { 0x01, 0x30 };
static const uint8_t pool_2[3]  = { 0x80, 0x70, 0x90 };
static const uint8_t pool_3[2]  = { 0x71, 0x81 };
static const uint8_t pool_4[2]  = { 0x72, 0x82 };
static const uint8_t pool_5[2]  = { 0x73, 0x83 };
static const uint8_t pool_6[2]  = { 0x50, 0x60 };
static const uint8_t pool_7[2]  = { 0x51, 0x61 };
static const uint8_t pool_8[2]  = { 0x52, 0x62 };
static const uint8_t pool_9[2]  = { 0x53, 0x63 };
static const uint8_t pool_10[3] = { 0x10, 0x40, 0x20 };
static const uint8_t pool_11[3] = { 0x17, 0x46, 0x26 };
static const uint8_t pool_12[3] = { 0x18, 0x47, 0x27 };
static const uint8_t pool_13[10] = { 0x02, 0x11, 0xA0, 0xC0, 0x21, 0x41, 0xE0, 0x31, 0xB0, 0xD0 };
static const uint8_t pool_14[9]  = { 0x02, 0x12, 0x22, 0x42, 0xB1, 0x32, 0xA1, 0xC1, 0xD1 };
static const uint8_t pool_15[9]  = { 0x02, 0x33, 0xB2, 0x13, 0x43, 0xC2, 0x23, 0xA2, 0xD2 };
static const uint8_t pool_16[10] = { 0x02, 0x14, 0x44, 0xC3, 0x24, 0xA3, 0xC1, 0xD1, 0x34, 0xB3 };
static const uint8_t pool_17[10] = { 0x03, 0x25, 0x15, 0x35, 0xA4, 0xD3, 0x45, 0xB4, 0xE1, 0xC4 };
static const uint8_t pool_18[10] = { 0x04, 0x25, 0x16, 0x35, 0xA4, 0xC5, 0x45, 0xB5, 0xD4, 0xE2 };

static const uint8_t *const pose_tile_pools[19] = {
    pool_0, pool_1, pool_2, pool_3, pool_4, pool_5, pool_6, pool_7, pool_8, pool_9,
    pool_10, pool_11, pool_12, pool_13, pool_14, pool_15, pool_16, pool_17, pool_18,
};

/*
 * pose_shape_masks[i]: 9 bytes (one per column), each byte's bits (MSB
 * first, matching the original `rol`-driven scan) selecting which of up
 * to 8 rows in that column get a pose byte this call. NOT const: rotated
 * in place every call (see select_pose()). Several slots deliberately
 * alias the same underlying array -- transcribed exactly from the
 * original off_A6CB table, which points several indices at the very
 * same unk_A6F1/unk_A703/unk_A70C arrays.
 */
static uint8_t mask_A[9] = { 0, 0, 0x50, 0, 0, 0, 0, 0, 0 };                 /* unk_A6F1 (idx 0,1) */
static uint8_t mask_B[9] = { 0, 0, 0, 0, 0, 0, 4, 0x0C, 0 };                 /* unk_A6FA (idx 2) */
static uint8_t mask_C[9] = { 0, 0, 0, 0, 0, 0, 4, 0, 4 };                    /* unk_A703 (idx 3,4,5) */
static uint8_t mask_D[9] = { 0, 0, 0, 4, 4, 0, 0, 0, 0 };                    /* unk_A70C (idx 6,7,8,9) */
static uint8_t mask_E[9] = { 0, 0, 0, 0, 0x50, 0, 0x40, 0, 0 };              /* unk_A715 (idx 10) */
static uint8_t mask_F[9] = { 0, 0, 0, 0, 0x50, 0, 0x20, 0, 0 };              /* unk_A71E (idx 11) */
static uint8_t mask_G[9] = { 0, 0, 0, 0, 0x50, 0x20, 0, 0, 0 };              /* unk_A727 (idx 12) */
static uint8_t mask_H[9] = { 0x10, 0, 0x10, 0x0A, 0xA1, 0x4A, 0, 0, 0 };     /* unk_A730 (idx 13) */
static uint8_t mask_I[9] = { 0x20, 0, 0x20, 0x54, 0, 0x55, 0, 0, 0 };        /* unk_A739 (idx 14) */
static uint8_t mask_J[9] = { 0x10, 5, 0x10, 5, 0x10, 5, 0, 0, 0 };           /* unk_A742 (idx 15) */
static uint8_t mask_K[9] = { 0x20, 0, 0x50, 4, 0x50, 5, 0x50, 0, 0 };        /* unk_A74B (idx 16) */
static uint8_t mask_L[9] = { 4, 0, 0x14, 0, 0x54, 0, 0x54, 0, 0x10 };        /* unk_A754 (idx 17) */
static uint8_t mask_M[9] = { 4, 0, 0x14, 0, 0x54, 0, 0x54, 0, 4 };           /* unk_A75D (idx 18) */

static uint8_t *const pose_shape_masks[19] = {
    mask_A, mask_A, mask_B, mask_C, mask_C, mask_C, mask_D, mask_D, mask_D, mask_D,
    mask_E, mask_F, mask_G, mask_H, mask_I, mask_J, mask_K, mask_L, mask_M,
};

/*
 * tori_projectile_template (byte_A766/byte_A767 + the constant bytes
 * that immediately follow them in the original data segment): a
 * PROJECTILE_STRUCT_SIZE-byte template passed to Add_Projectile_To_Array.
 * Only the first two bytes (x_rel, y) are overwritten before each shot;
 * the rest are baked-in constant projectile parameters (type/velocity/
 * etc.) exactly as laid out in the original overlay.
 */
static uint8_t tori_projectile_template[PROJECTILE_STRUCT_SIZE] = {
    0x00, 0x00,                                           /* x_rel, y -- overwritten per shot */
    0x00, 0x00, 0x32, 0x04, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};

/*
 * Forward declarations
 */
static void select_pose(uint8_t idx);                 /* sub_A552 */
static int tick_every_3rd(void);                       /* sub_A57B */
static int move_boss_x_left_min_0d(void);              /* sub_A58F */
static int move_boss_x_left_min_11(void);               /* sub_A59D */
static int move_boss_x_right_max_30(void);              /* sub_A5AB */
static void apply_damage_to_boss(uint16_t damage);      /* sub_A5BA */
static void render_boss_sprite_frame(void);             /* loc_A455 */
static void death_sequence_step(void);                  /* loc_A60A */

/*
 * Pollo_AI_reset - clear all persistent static state so a fresh encounter
 * behaves correctly even after a save/restore cycle (the WASM port links
 * all modules into a single image, so statics survive across encounters).
 */
void Pollo_AI_reset(void)
{
    approach_phase = 0;
    recently_hit_flag = 0;
    attacking = 0;
    attack_phase = 0;
    recovering = 0;
    tick_div3 = 0;
    flap_phase = 0;
    hit_result = 0;
    death_timer = 0;
    hit_flash_timer = 0;
    move_tick = 0;
    charging = 0;
    windup_flaps = 0;
    death_entry_flag = 0;
    projectile_charging = 0;
    attack_duration = 0;
}

/*
 * Pollo_AI - entry point, called once per frame while the Pollo boss
 * encounter is active.
 */
void Pollo_AI(uint16_t m)
{
    uint16_t base = MEM16(ADDR_MONSTERS_LIST);

    /* --- loc_A1E2..loc_A224: walk last frame's body-part pseudo-monster
     * entries, restore the proximity-map tiles they overwrote, and pick
     * the highest-priority hit flagged by the external hit-detection
     * code (ai_flags bit 0x40) this frame. */
    hit_result = 0;
    {
        uint16_t si = base;
        uint8_t idx = 0;

        while (MEM16(si) != 0xFFFF) { /* .currX sentinel: end of list */
            uint8_t rel;
            if (is_in_proximity_window(MEM16(si + 0), &rel)) {
                MEM8(si + 3) = rel; /* .m_x_rel */

                uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); /* .m_x_rel, .currY */
                MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + idx);

                if ((MEM8(si + 5) & 0x40) && !(hit_result & 0x80)) { /* .ai_flags: hit, and no priority hit recorded yet */
                    uint8_t al = (uint8_t)(MEM8(si + 5) & 0x1F);
                    if (MEM8(si + 4) == 0) al |= 0x80; /* .flags == 0 -> "heavy"/priority part */
                    hit_result = al;
                }
            }

            idx++;
            si += 16;
        }
    }

    MEM16(base) = 0xFFFF; /* loc_A22D: reset the table; render_boss_sprite_frame() repopulates it below */

    /* --- loc_A22D..loc_A276: apply damage for this frame's hit, if any --- */
    if (hit_result != 0) {
        uint8_t al = hit_result;
        uint8_t stat = Get_Stats((uint8_t)(al & 0x1F));
        uint16_t damage = (uint16_t)stat << 1; /* bx = stat*2 */
        if (al & 0x80) damage <<= 2;           /* heavy hit: total stat*8 */

        MEM8(ADDR_SOUND_FX_REQUEST) = 41;
        apply_damage_to_boss(damage);

        if (attacking) {
            attacking = 0;
            attack_phase = 0;
            recovering = 0xFF;
        } else {
            move_boss_x_right_max_30();
        }
        hit_flash_timer = 4;
    }

    /* --- loc_A27B: recently-hit flash-flag bookkeeping --- */
    recently_hit_flag = 0;
    if (hit_flash_timer != 0) {
        hit_flash_timer--;
        recently_hit_flag = 1;
    }

    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);

    /* --- loc_A290: dive-charge attack in progress --- */
    if (attacking) {
        if (MEM8(boss_state + 2) != 0x0E) MEM8(boss_state + 2)--; /* boss_y creeps back toward baseline while diving */

        attack_phase = (uint8_t)((attack_phase + 1) & 3);
        if (attack_phase == 2) MEM8(ADDR_SOUND_FX_REQUEST) = 43;

        int cancel = 1;
        if (move_boss_x_left_min_11()) {
            if (attack_duration != 0) {
                attack_duration--;
                cancel = (hit_result != 0); /* getting hit mid-attack cancels it early */
            }
        }
        if (cancel) {
            attacking = 0;
            attack_phase = 0;
            recovering = 0xFF;
            MEM8(ADDR_SOUND_FX_REQUEST) = 42;
        }
        render_boss_sprite_frame();
        return;
    }

    /* --- loc_A2E5: recovering back to hover height after an attack --- */
    if (recovering) {
        if (attack_phase == 1) {
            recovering = 0;
        } else {
            attack_phase = 1;
            if (MEM8(boss_state + 2) != 0x12) {
                MEM8(boss_state + 2)++;
                attack_phase = 0;
                move_boss_x_left_min_0d();
            }
        }
        render_boss_sprite_frame();
        return;
    }

    /* --- loc_A316: winding up wing-flaps before a dive-charge attack --- */
    if (charging) {
        flap_phase = (uint8_t)((flap_phase + 1) & 3);
        if (!tick_every_3rd()) {
            render_boss_sprite_frame();
            return;
        }
        if (windup_flaps < 4) {
            windup_flaps++;
            MEM8(ADDR_SOUND_FX_REQUEST) = 42;
            hit_flash_timer = 4;
        } else {
            charging = 0;
            attack_phase = 0;
            attacking = 0xFF;
            attack_duration = 0x0F;
        }
        render_boss_sprite_frame();
        return;
    }

    /* --- loc_A35D: winding up to fire a projectile --- */
    if (projectile_charging) {
        if (!tick_every_3rd()) {
            render_boss_sprite_frame();
            return;
        }
        if (windup_flaps < 2) {
            windup_flaps++;
            MEM8(ADDR_SOUND_FX_REQUEST) = 42;
            hit_flash_timer = 2;
        } else {
            uint8_t rel;
            is_in_proximity_window((uint16_t)(MEM16(boss_state + 0) + 4), &rel);
            tori_projectile_template[0] = rel;
            tori_projectile_template[1] = (uint8_t)((MEM8(boss_state + 2) + 4) & 0x3F);
            Add_Projectile_To_Array(tori_projectile_template);
            projectile_charging = 0;
        }
        render_boss_sprite_frame();
        return;
    }

    /* --- loc_A3AD: death sequence takes over once the boss has been
     * struck down to 0 HP --- */
    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        death_sequence_step();
        return;
    }

    /* --- loc_A3B7..loc_A454: idle movement / attack-decision logic --- */
    flap_phase = (uint8_t)((flap_phase + 1) & 3);

    if (hit_result != 0 && MEM8(boss_state + 0) >= 0x14) {
        charging = 0xFF;
        windup_flaps = 0;
    }

    if (!charging) {
        if ((get_random() & 0x0F) == 0) {
            projectile_charging = 0xFF;
            windup_flaps = 0;
        }
    }

    move_tick++;
    if (move_tick & 1) { /* distance-based movement only runs every other frame */
        render_boss_sprite_frame();
        return;
    }

    uint16_t hero_col = (uint16_t)(uint8_t)(MEM8(ADDR_PROXIMITY_MAP_LEFT_COL) + MEM8(ADDR_HERO_X_VIEW));
    uint16_t map_width = MEM16(ADDR_MAP_WIDTH);
    if (hero_col >= map_width) hero_col -= map_width; /* wrap hero's absolute column across the map-width boundary */

    uint8_t bl = (uint8_t)(MEM8(boss_state + 0) - (uint8_t)hero_col);

    if (bl > 0x0C) {
        /* boss is far ahead of the hero: flap toward closing the gap */
        approach_phase = (uint8_t)((approach_phase + 1) & 3);
        move_boss_x_left_min_0d();
        /* falls through to the random charge-trigger check below */
    } else if (bl < 0x0C) {
        /* boss is too close: back away */
        approach_phase = (uint8_t)((approach_phase - 1) & 3);
        if (!move_boss_x_right_max_30()) {
            charging = 0xFF;
            windup_flaps = 0;
        }
        render_boss_sprite_frame();
        return;
    }
    /* bl == 0x0C falls straight through to the random charge-trigger check */

    if ((get_random() & 0x1F) != 0) {
        render_boss_sprite_frame();
        return;
    }
    charging = 0xFF;
    windup_flaps = 0;

    render_boss_sprite_frame();
}

/*
 * sub_A552 -> select_pose: consumes source pose bytes from
 * pose_tile_pools[idx], one per set bit encountered scanning
 * pose_shape_masks[idx] column by column (MSB-first, 9 columns x 8
 * rows), writing them into byte_A79C. Mirrors tako.c's tentacle-layout/
 * shape-table consumption pattern (see render_tentacles_and_ink there).
 */
static void select_pose(uint8_t idx)
{
    const uint8_t *src = pose_tile_pools[idx];
    uint8_t *shape = pose_shape_masks[idx];

    for (int col = 0; col < 9; col++) {
        for (int bit = 0; bit < 8; bit++) {
            uint8_t carry = (uint8_t)((shape[col] & 0x80) != 0);
            shape[col] = (uint8_t)((shape[col] << 1) | carry);
            if (carry) {
                byte_A79C[col * 8 + bit] = *src++;
            }
        }
    }
}

/*
 * sub_A57B -> tick_every_3rd: increments a 0..2 counter; returns 1 (and
 * resets the counter) on the 3rd call, 0 otherwise.
 */
static int tick_every_3rd(void)
{
    tick_div3++;
    if (tick_div3 == 3) {
        tick_div3 = 0;
        return 1;
    }
    return 0;
}

/*
 * sub_A58F -> move_boss_x_left_min_0d: decrement boss_x, guarded at a
 * minimum of 0x0D. Returns 1 if moved, 0 if already at the limit.
 */
static int move_boss_x_left_min_0d(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    if (MEM8(boss_state + 0) < 0x0D) return 0;
    MEM8(boss_state + 0)--;
    return 1;
}

/*
 * sub_A59D -> move_boss_x_left_min_11: decrement boss_x, guarded at a
 * minimum of 0x11. Returns 1 if moved, 0 if already at the limit.
 */
static int move_boss_x_left_min_11(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    if (MEM8(boss_state + 0) < 0x11) return 0;
    MEM8(boss_state + 0)--;
    return 1;
}

/*
 * sub_A5AB -> move_boss_x_right_max_30: increment boss_x, guarded at a
 * maximum of 0x30 (exclusive). Returns 1 if moved, 0 if already at the
 * limit.
 */
static int move_boss_x_right_max_30(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    if (MEM8(boss_state + 0) >= 0x30) return 0;
    MEM8(boss_state + 0)++;
    return 1;
}

/*
 * sub_A5BA -> apply_damage_to_boss: subtract damage (clamped at 0),
 * redraw the health bar, and start the death sequence the first time
 * HP reaches 0.
 */
static void apply_damage_to_boss(uint16_t damage)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    int32_t hp = (int32_t)MEM16(boss_state + 3) - (int32_t)damage; /* .boss_hp */
    if (hp < 0) hp = 0;
    MEM16(boss_state + 3) = (uint16_t)hp;

    Draw_Boss_Health();

    if (hp != 0) return;

    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
    Browse_Projectiles();
    charging = 0;
    projectile_charging = 0;
    windup_flaps = 0;

    if (attacking) {
        death_timer = 0;
        attacking = 0;
        attack_phase = 0;
        recovering = 0xFF;
    }
}

/*
 * loc_A60A: runs every frame once the boss has been struck down to 0 HP
 * (ADDR_BOSS_BEING_HIT set). Flashes for ~0x14 frames while flapping,
 * then switches to the "recovering" pose for another ~0x14 frames
 * before signalling death to the generic engine.
 */
static void death_sequence_step(void)
{
    uint8_t al = death_timer;

    if (al >= 0x28) { /* death sequence finished */
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;
    recently_hit_flag = 1;
    death_timer++;

    if (al < 0x14) {
        tick_every_3rd();
        flap_phase = (uint8_t)((flap_phase + 1) & 3);
        MEM8(ADDR_SOUND_FX_REQUEST) = 44;
    } else {
        death_entry_flag = 0xFF;
        attack_phase = 1;
    }

    render_boss_sprite_frame();
}

/*
 * loc_A455: builds this frame's set of body-part poses into byte_A79C
 * via select_pose(), then lays out up to 9 columns x 8 rows of hittable
 * pseudo-monster sprites into the shared monsters_table, exactly as
 * tako.c's render_tentacles_and_ink() does for its tentacle segments.
 */
static void render_boss_sprite_frame(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint8_t row_base = MEM8(boss_state + 2); /* boss_y snapshot used as the base row for this frame */

    memset(byte_A79C, 0xFF, sizeof(byte_A79C));

    if (death_entry_flag || recovering) {
        select_pose((uint8_t)(0x11 + (attack_phase & 1)));
    } else if (attacking) {
        select_pose((uint8_t)(0x0D + (attack_phase & 3)));
        row_base = (uint8_t)(row_base + (attack_phase & 1)); /* shr al,1 / adc byte_A793,0 */
    } else {
        select_pose(recently_hit_flag);
        select_pose((uint8_t)(approach_phase + 6));
        select_pose((uint8_t)(tick_div3 + 0x0A));
        select_pose((uint8_t)(flap_phase + 2));
    }

    uint16_t di = MEM16(ADDR_MONSTERS_LIST);
    uint16_t colx = MEM16(boss_state + 0); /* boss_x */
    uint8_t seg_count = 0;

    for (int col = 0; col < 9; col++) {
        uint8_t rel;
        if (is_in_proximity_window(colx, &rel)) {
            for (int row = 0; row < 8; row++) {
                uint8_t v = byte_A79C[col * 8 + row];
                if (v != 0xFF) {
                    MEM16(di + 0) = colx;                                     /* .currX */
                    MEM8(di + 2) = (uint8_t)((row_base + row) & 0x3F);        /* .currY */
                    MEM8(di + 3) = rel;                                       /* .m_x_rel */
                    MEM8(di + 4) = (uint8_t)((v >> 4) & 0x0F);                /* .flags <- pose high nibble */
                    MEM8(di + 6) = v;                                        /* .anim_counter <- whole pose byte */
                    MEM8(di + 5) = hit_result ? 0x20 : 0x00;                  /* .ai_flags: hit-flash */

                    uint16_t map_off = coords_to_prox_addr(MEM8(di + 3), MEM8(di + 2)); /* .m_x_rel, .currY */
                    uint8_t old_tile = MEM8(map_off);
                    MEM8(map_off) = (uint8_t)(seg_count | 0x80);
                    MEM8(ADDR_PROXIMITY_LAYER2 + seg_count) = old_tile;

                    di += 16;
                    seg_count++;
                }
            }
        }
        colx++;
    }

    MEM16(di) = 0xFFFF; /* terminator after the last body-part segment */
}
