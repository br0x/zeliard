/*
 * tako.c - translated from tako.asm ("Pulpo" boss AI)
 *
 * This is a boss-encounter overlay module, structurally identical to
 * crab.asm/crab.c ("Cangrejo"): it is loaded at a fixed segment address
 * and exports an entry point (Pulpo_AI, originally Pulpo_AI_proc) plus
 * a shared "boss_state_block" that the generic engine reads elsewhere
 * (health bar, victory/reward handling, name display) via a fixed
 * offset, regardless of which boss module is currently loaded.
 *
 * Scope of this translation
 * ------------------------------------------------------------------
 * This file translates the AI/gameplay logic only. The following are
 * NOT translated, since they are sprite/animation *asset* data read by
 * a separate, generic boss-rendering routine at fixed offsets into this
 * overlay (never touched by Pulpo_AI_proc itself), exactly like the
 * excluded tables in crab.c:
 *   - the "start:" export header and its reserved padding
 *   - encounter_hp_table
 *   - anim_frame_table_ptrs and byte_A052 .. byte_A25F (the regular,
 *     non-boss "octopus" monster's per-difficulty sprite/tile tables)
 *   - boss_state_block's own non-AI fields (xp_reward, arena_center_x,
 *     boss_placement, name_block_ptr, almas_reward, name_screen_x/y,
 *     boss_name_pstring) -- these are populated/read by the generic
 *     overlay loader and encounter/reward code, not by this AI.
 *
 * The tentacle layout/shape tables (tentacle_layout_tables /
 * tentacle_shape_tables, i.e. off_A57D/byte_A5BD.. and
 * off_A9AF/byte_A9EF..) ARE translated, since Pulpo_AI_proc reads them
 * directly every frame to decide which of the boss's up to 7x8
 * tentacle-segment slots produce a hittable pseudo-monster sprite this
 * frame -- same rationale as crab.c's body_state_to_layout_table.
 * Likewise ink_spawn_countdown_table (byte_AA20) is translated, since
 * it is read directly to drive the ink-squirt projectile spawner.
 *
 * IMPORTANT: unlike the layout tables, the *shape* tables (tentacle
 * bit-masks) are mutated in place at runtime -- the original code
 * rotates the mask byte (`rol byte ptr [bx],1`) every time it is used,
 * so consecutive frames resume from wherever the mask was last left.
 * Several of the 32 shape-table slots alias the very same 7-byte array
 * (this is how the original data was laid out), and that aliasing --
 * rotating one slot silently rotates every other slot that points at
 * the same array -- is preserved here on purpose to match the original
 * behavior exactly.
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - Each visible tentacle segment (and each ink droplet) occupies a
 *   temporary entry in the shared monsters_table (the same array real
 *   monsters live in), exactly as in crab.c, reusing the same field
 *   offsets:
 *       +0 currX (word)   +2 currY   +3 m_x_rel   +4 flags
 *       +5 ai_flags        +6 anim_counter
 *   Here "+4 flags" holds a tile/sprite index (from the layout table,
 *   or a fixed 0x30 for ink droplets) rather than a monster type, and
 *   "+5 ai_flags" bit 0x20 is set by us to request a hit-flash, while
 *   bit 0x40 is set by the external hit-detection code to tell us a
 *   segment was struck.
 * - "si"/"di"/"bx" pointers from the original are modeled as plain
 *   uint16_t addresses into the flat MEM8/MEM16 address space, or as
 *   plain C pointers into the translated static tables, exactly as in
 *   crab.c.
 * - boss_state_block's AI-relevant fields (boss_x, boss_y, boss_hp)
 *   are shared data reached through ADDR_BOSS_STATE_PTR, at the same
 *   offsets crab.c uses (+0 boss_x word, +2 boss_y byte, +3 boss_hp
 *   word) since "boss_state_block" is simply a label alias for
 *   "boss_x" in the original assembly.
 * - Local helpers that the original tested with jb/jnb (carry) return
 *   an int/uint8_t that IS the carry flag (via is_in_proximity_window's
 *   boolean-style "in range" return), exactly as in crab.c.
 * - is_in_proximity_window, Get_Stats, Draw_Boss_Health, and the
 *   various ADDR_* absolute addresses (monsters table base, proximity
 *   second layer, sound FX request, boss-being-hit/boss-is-dead flags)
 *   are assumed declared elsewhere (zeliard.h), same as
 *   coords_to_prox_addr / etc. in crab.c.
 */

#include "zeliard.h"

/*
 * ============================================================================
 * Per-frame / persistent AI state (byte_AA9A .. byte_AAA1 in the original)
 * ============================================================================
 */
static uint8_t active_sprite_count = 0;      /* byte_AA9A: monsters_table write cursor this frame */
static uint8_t hit_monster_flags = 0;
/* byte_AA9B: packed result of last frame's hit-detection pass.
 * bit 7 = the struck segment's tile index (monster.flags) was >= 0x0E
 *         ("heavy"/vulnerable segment -> extra damage);
 * bits 4-0 = ai_flags & 0x1F of the segment that was hit.
 * Zero means no part was struck this frame. */
static uint8_t col_rel_x = 0;                 /* byte_AA9C: proximity-relative X of the column currently being laid out */
static uint8_t tentacle_anim_step = 0;         /* byte_AA96: cycles 0..7, advances the tentacle-wave animation */
static uint8_t anim_group_offset = 0;          /* byte_AA97: 0 / 8 / 16 -- selects which quarter of the 32-entry tables to use; only ever increases (never resets) as the boss takes damage */
static uint8_t retract_state = 0;
/* byte_AA98: bit 0x10 = "just got hit, playing the retract flinch";
 * low nibble (0x0F) = flinch sub-counter (0..15, only lower 4 bits used
 * as an up-counter that clears bit 0x10 on wraparound). */
static uint8_t ink_squirt_state = 0;
/* byte_AA99: bit 0x80 = an ink droplet volley is actively descending;
 * bit 0x40 = arm is winding up to fire;
 * bit 0x20 = alternating toggle (also gates a -8 offset on `dl`);
 * bits 0x1F = counter, dual purpose: low 2 bits while winding up,
 *             full 5 bits (1..24) as the droplet volley's row index
 *             into ink_spawn_countdown_table while bit 0x80 is set. */
static uint8_t death_timer = 0;                /* byte_AA9E: counts up during the death sequence (0..40) */
static uint16_t ink_target_x = 0;              /* word_AA9F: world X column the current ink volley is centered on */
static uint8_t ink_target_y = 0;               /* byte_AAA1: world Y row the current ink volley is centered on */

/*
 * ============================================================================
 * Tentacle-part layout tables (tile, anim_counter pairs)
 * ============================================================================
 * Transcribed 1:1 from tako.asm (byte_A5BD..byte_A993). Each table holds
 * N (tile,anim) pairs, one per currently-visible tentacle segment, where
 * N is the number of set bits in the matching tentacle_shape_tables[]
 * mask. Indexed together as tentacle_layout_tables[i] /
 * tentacle_shape_tables[i], i = 0..31, selected each frame as
 * (tentacle_anim_step + anim_group_offset[+/-8 flinch/windup adjustment]).
 */
static const uint8_t layout_a5bd[38] = { 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 15, 0, 0, 6, 0, 7, 0, 8, 0, 10, 0, 11, 0, 12, 0, 13, 0, 14, 0, 15, 1, 0, 1, 1, 1, 2 };
static const uint8_t layout_a5e3[36] = { 1, 14, 1, 15, 2, 0, 2, 1, 2, 2, 15, 1, 0, 6, 1, 5, 0, 8, 1, 6, 1, 7, 0, 12, 1, 8, 1, 9, 0, 15, 1, 3, 1, 1, 1, 2 };
static const uint8_t layout_a607[34] = { 2, 3, 2, 4, 2, 5, 2, 6, 15, 2, 0, 9, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 0, 13, 0, 14, 0, 15, 1, 3, 1, 4, 1, 2 };
static const uint8_t layout_a629[36] = { 2, 8, 2, 9, 2, 10, 2, 11, 2, 6, 15, 3, 0, 9, 2, 12, 0, 8, 0, 10, 0, 11, 0, 12, 1, 8, 1, 9, 0, 15, 1, 0, 1, 4, 1, 2 };
static const uint8_t layout_a64d[36] = { 2, 13, 2, 14, 2, 15, 3, 0, 2, 6, 15, 4, 0, 6, 2, 12, 0, 8, 1, 12, 1, 13, 0, 12, 1, 10, 1, 11, 0, 15, 1, 0, 1, 1, 1, 2 };
static const uint8_t layout_a671[36] = { 3, 1, 3, 2, 3, 3, 3, 4, 2, 6, 15, 5, 0, 6, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 1, 8, 1, 9, 0, 15, 1, 3, 1, 1, 1, 2 };
static const uint8_t layout_a695[36] = { 3, 5, 3, 6, 3, 7, 3, 8, 2, 6, 15, 6, 0, 9, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 0, 13, 0, 14, 0, 15, 1, 3, 1, 4, 1, 2 };
static const uint8_t layout_a6b9[36] = { 3, 9, 3, 10, 14, 1, 3, 12, 2, 2, 15, 7, 0, 9, 0, 7, 0, 8, 0, 10, 0, 11, 0, 12, 1, 8, 1, 9, 0, 15, 1, 0, 1, 4, 1, 2 };
static const uint8_t layout_a6dd[36] = { 0, 0, 0, 1, 5, 6, 3, 13, 3, 14, 15, 8, 0, 6, 0, 7, 0, 8, 0, 10, 0, 11, 0, 12, 0, 13, 0, 14, 0, 15, 1, 0, 1, 1, 1, 2 };
static const uint8_t layout_a701[36] = { 1, 14, 3, 15, 2, 0, 4, 0, 4, 1, 15, 9, 0, 6, 1, 5, 0, 8, 1, 6, 1, 7, 0, 12, 1, 8, 1, 9, 0, 15, 1, 3, 1, 1, 1, 2 };
static const uint8_t layout_a725[34] = { 2, 3, 4, 2, 4, 3, 2, 6, 15, 10, 0, 9, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 0, 13, 0, 14, 0, 15, 1, 3, 1, 4, 1, 2 };
static const uint8_t layout_a747[32] = { 4, 4, 4, 5, 2, 6, 15, 11, 0, 9, 2, 12, 0, 8, 0, 10, 0, 11, 0, 12, 1, 8, 1, 9, 0, 15, 1, 0, 1, 4, 1, 2 };
static const uint8_t layout_a767[32] = { 2, 14, 4, 6, 2, 6, 15, 12, 0, 6, 2, 12, 0, 8, 1, 12, 1, 13, 0, 12, 1, 10, 1, 11, 0, 15, 1, 0, 1, 1, 1, 2 };
static const uint8_t layout_a787[36] = { 3, 1, 4, 7, 3, 3, 4, 8, 2, 6, 15, 13, 0, 6, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 1, 8, 1, 9, 0, 15, 1, 3, 1, 1, 1, 2 };
static const uint8_t layout_a7ab[34] = { 3, 5, 3, 7, 4, 9, 2, 6, 15, 14, 0, 9, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 0, 13, 0, 14, 0, 15, 1, 3, 1, 4, 1, 2 };
static const uint8_t layout_a7cd[34] = { 3, 9, 14, 1, 4, 10, 4, 11, 15, 15, 0, 9, 0, 7, 0, 8, 0, 10, 0, 11, 0, 12, 1, 8, 1, 9, 0, 15, 1, 0, 1, 4, 1, 2 };
static const uint8_t layout_a7ef[28] = { 4, 12, 14, 0, 0, 6, 0, 7, 0, 8, 0, 10, 0, 11, 0, 12, 0, 13, 0, 14, 0, 15, 1, 0, 1, 1, 1, 2 };
static const uint8_t layout_a80b[28] = { 4, 11, 14, 0, 0, 6, 1, 5, 0, 8, 1, 6, 1, 7, 0, 12, 1, 8, 1, 9, 0, 15, 1, 3, 1, 1, 1, 2 };
static const uint8_t layout_a827[28] = { 4, 13, 14, 0, 0, 9, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 0, 13, 0, 14, 0, 15, 1, 3, 1, 4, 1, 2 };
static const uint8_t layout_a843[28] = { 4, 13, 14, 0, 0, 9, 2, 12, 0, 8, 0, 10, 0, 11, 0, 12, 1, 8, 1, 9, 0, 15, 1, 0, 1, 4, 1, 2 };
static const uint8_t layout_a85f[28] = { 4, 13, 14, 0, 0, 6, 2, 12, 0, 8, 1, 12, 1, 13, 0, 12, 1, 10, 1, 11, 0, 15, 1, 0, 1, 1, 1, 2 };
static const uint8_t layout_a87b[28] = { 4, 13, 14, 0, 0, 6, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 1, 8, 1, 9, 0, 15, 1, 3, 1, 1, 1, 2 };
static const uint8_t layout_a897[28] = { 4, 13, 14, 0, 0, 9, 2, 7, 0, 8, 1, 6, 1, 7, 0, 12, 0, 13, 0, 14, 0, 15, 1, 3, 1, 4, 1, 2 };
static const uint8_t layout_a8b3[28] = { 4, 11, 14, 0, 0, 9, 0, 7, 0, 8, 0, 10, 0, 11, 0, 12, 1, 8, 1, 9, 0, 15, 1, 0, 1, 4, 1, 2 };
static const uint8_t layout_a8cf[28] = { 4, 14, 3, 11, 0, 6, 4, 15, 5, 0, 0, 10, 0, 11, 0, 12, 0, 13, 0, 14, 0, 15, 1, 0, 1, 1, 1, 2 };
static const uint8_t layout_a8eb[28] = { 5, 1, 3, 11, 0, 6, 5, 2, 5, 0, 1, 6, 1, 7, 0, 12, 1, 8, 1, 9, 0, 15, 1, 3, 1, 1, 1, 2 };
static const uint8_t layout_a907[28] = { 5, 3, 3, 11, 0, 9, 5, 4, 5, 0, 1, 6, 1, 7, 0, 12, 0, 13, 0, 14, 0, 15, 1, 3, 1, 4, 1, 2 };
static const uint8_t layout_a923[28] = { 5, 3, 3, 11, 0, 9, 5, 5, 5, 0, 0, 10, 0, 11, 0, 12, 1, 8, 1, 9, 0, 15, 1, 0, 1, 4, 1, 2 };
static const uint8_t layout_a93f[28] = { 5, 3, 3, 11, 0, 6, 5, 5, 5, 0, 1, 12, 1, 13, 0, 12, 1, 10, 1, 11, 0, 15, 1, 0, 1, 1, 1, 2 };
static const uint8_t layout_a95b[28] = { 5, 3, 3, 11, 0, 6, 5, 4, 5, 0, 1, 6, 1, 7, 0, 12, 1, 8, 1, 9, 0, 15, 1, 3, 1, 1, 1, 2 };
static const uint8_t layout_a977[28] = { 5, 3, 3, 11, 0, 9, 5, 4, 5, 0, 1, 6, 1, 7, 0, 12, 0, 13, 0, 14, 0, 15, 1, 3, 1, 4, 1, 2 };
static const uint8_t layout_a993[28] = { 5, 1, 3, 11, 0, 9, 4, 15, 5, 0, 0, 10, 0, 11, 0, 12, 1, 8, 1, 9, 0, 15, 1, 0, 1, 4, 1, 2 };

/*
 * Tentacle row-visibility bitmasks (7 bytes = 7 columns/segments).
 * Bit 7..0 of each byte selects which of up to 8 rows in that column
 * currently has a body part; consumed bit-by-bit (MSB first, matching
 * the original `rol` scan). NOT const: rotated in place every frame.
 */
static uint8_t shape_a9ef[7] = { 0xE0, 0x60, 0x60, 0xE0, 0xE0, 0xE0, 0xE0 };
static uint8_t shape_a9f6[7] = { 0x60, 0x60, 0x60, 0xE0, 0xE0, 0xE0, 0xE0 };
static uint8_t shape_a9fd[7] = { 0x60, 0x20, 0x60, 0xE0, 0xE0, 0xE0, 0xE0 };
static uint8_t shape_aa04[7] = { 0xC0, 0x60, 0x60, 0xE0, 0xE0, 0xE0, 0xE0 };
static uint8_t shape_aa0b[7] = { 0x20, 0x20, 0x60, 0xE0, 0xE0, 0xE0, 0xE0 };
static uint8_t shape_aa12[7] = { 0x40, 0x60, 0x60, 0xE0, 0xE0, 0xE0, 0xE0 };
static uint8_t shape_aa19[7] = { 0x00, 0x00, 0x60, 0xE0, 0xE0, 0xE0, 0xE0 };

static const uint8_t *const tentacle_layout_tables[32] = {
    layout_a5bd, layout_a5e3, layout_a607, layout_a629,
    layout_a64d, layout_a671, layout_a695, layout_a6b9,
    layout_a6dd, layout_a701, layout_a725, layout_a747,
    layout_a767, layout_a787, layout_a7ab, layout_a7cd,
    layout_a7ef, layout_a80b, layout_a827, layout_a843,
    layout_a85f, layout_a87b, layout_a897, layout_a8b3,
    layout_a8cf, layout_a8eb, layout_a907, layout_a923,
    layout_a93f, layout_a95b, layout_a977, layout_a993,
};

/* Deliberately aliased in several slots -- matches the original data
 * layout exactly (see the big comment at the top of the file). */
static uint8_t *const tentacle_shape_tables[32] = {
    shape_a9ef, shape_a9f6, shape_a9fd, shape_a9f6,
    shape_a9f6, shape_a9f6, shape_a9f6, shape_a9f6,
    shape_aa04, shape_a9f6, shape_a9fd, shape_aa0b,
    shape_aa0b, shape_a9f6, shape_aa12, shape_aa12,
    shape_aa19, shape_aa19, shape_aa19, shape_aa19,
    shape_aa19, shape_aa19, shape_aa19, shape_aa19,
    shape_aa19, shape_aa19, shape_aa19, shape_aa19,
    shape_aa19, shape_aa19, shape_aa19, shape_aa19,
};

/*
 * Ink-droplet volley countdown table (byte_AA20): 24 rows x 4 columns.
 * Row r, column c gives the remaining lifetime for the droplet spawned
 * at (ink_target_x + c), or 0 if no droplet should spawn there this row.
 */
static const uint8_t ink_spawn_countdown_table[96] = { 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 4, 0, 3, 0, 0, 4, 3, 0, 0, 0, 5, 0, 0, 0, 0, 6 };

/*
 * Forward declarations
 */
static void apply_damage_to_boss(uint16_t damage);      /* sub_A503 */
static void death_sequence_step(void);                  /* loc_A530 */
static void render_tentacles_and_ink(uint8_t dl);        /* loc_A3E3 .. loc_A4FE */

/*
 * Pulpo_AI - entry point, called once per frame.
 */
void Pulpo_AI(uint16_t m)
{
    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    active_sprite_count = 0;
    hit_monster_flags = 0;

    /* Walk last frame's tentacle-segment pseudo-monster entries: restore
     * the proximity-map tiles they overwrote, and pick up any hit flagged
     * by the external hit-detection code (ai_flags bit 0x40). Only the
     * first hit found this frame is kept. */
    for (;;) {
        if (MEM16(si + 0) == 0xFFFF) break; // .currX sentinel: end of list

        uint8_t rel;
        if (is_in_proximity_window(MEM16(si + 0), &rel)) {
            MEM8(si + 3) = rel; // .m_x_rel

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); // .m_x_rel, .currY
            MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count);

            if (MEM8(si + 5) & 0x40) { // .ai_flags: this segment was hit this frame
                if (!(hit_monster_flags & 0x80)) { // only record the first hit found
                    uint8_t al = (uint8_t)(MEM8(si + 5) & 0x1F);
                    if (MEM8(si + 4) >= 0x0E) al |= 0x80; // .flags: tile idx >=0x0E -> "heavy"/vulnerable segment
                    hit_monster_flags = al;
                }
            }
        }

        active_sprite_count++;
        si += 16;
    }

    /* Reset the sprite table; render_tentacles_and_ink() repopulates it
     * fresh this frame. */
    si = base;
    MEM16(si) = 0xFFFF;

    if (hit_monster_flags != 0) {
        uint8_t al = hit_monster_flags;
        uint8_t stat = Get_Stats((uint8_t)(al & 0x1F)); // assumed to return the "ah" damage stat
        uint16_t damage = (uint16_t)stat << 1;           // bx = stat*2

        if (al & 0x80) {
            MEM8(ADDR_SOUND_FX_REQUEST) = 36;
            damage <<= 1;                                 // heavy/vulnerable segment: stat*4 total
        } else {
            MEM8(ADDR_SOUND_FX_REQUEST) = 37;
        }

        apply_damage_to_boss(damage);

        /* First two hits after entering a new "provoked" phase step the
         * animation-table group forward (0 -> 8 -> 16) and kick off the
         * retract/flinch flourish; the third+ hit in the same phase does
         * nothing extra here. */
        if (!(retract_state & 0x10) && anim_group_offset != 0x10) {
            anim_group_offset += 8;
            retract_state = 0x10;
            ink_squirt_state |= 0x20;
            MEM8(ADDR_SOUND_FX_REQUEST) = 38;
        }
    }

    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        death_sequence_step();
        return;
    }

    /* --- normal per-frame animation, flinch bookkeeping, and the
     * ink-squirt wind-up state machine --- */
    tentacle_anim_step = (tentacle_anim_step + 1) & 7;

    uint8_t dl = anim_group_offset;

    if (retract_state & 0x10) {
        retract_state ^= 0x20;
        if (!(retract_state & 0x20)) dl -= 8;

        uint8_t hi = (uint8_t)(retract_state & 0xF0);
        uint8_t lo = (uint8_t)((retract_state + 1) & 0x0F);
        retract_state = (uint8_t)(hi | lo);
        if (lo == 0) {
            retract_state &= 0xEF;
            ink_squirt_state &= 0xDF;
        }
    }

    if (dl == 0x10) {
        if (ink_squirt_state & 0x40) {
            uint8_t al = (uint8_t)(0x20 ^ ink_squirt_state);
            uint8_t ah = al;
            al = (uint8_t)((al + 1) & 3);
            ah = (uint8_t)((ah & 0xE0) | al);
            ink_squirt_state = ah;
            if (al == 0) {
                ink_squirt_state = 0xA0;
                uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
                ink_target_x = (uint16_t)(MEM16(boss_state + 0) + 4); // .boss_x + 4
                ink_target_y = (uint8_t)((MEM8(boss_state + 2) + 4) & 0x3F); // .boss_y + 4
                MEM8(ADDR_SOUND_FX_REQUEST) = 39;
            }
        }

        if (!(ink_squirt_state & 0xA0) && !(retract_state & 0x10)) {
            ink_squirt_state |= 0x40; // begin the arm wind-up
        }

        if (!(ink_squirt_state & 0x20)) dl += 8;

        if (ink_squirt_state & 0x80) {
            uint8_t al = ink_squirt_state;
            uint8_t ah = (uint8_t)((al + 1) & 0x1F);
            al = (uint8_t)((al & 0xE0) | ah);
            ink_squirt_state = al;
            ink_target_x--;
            if (ah == 0x19) {
                ink_squirt_state = 0; // volley finished
            }
        }
    }

    render_tentacles_and_ink(dl);
}

/*
 * sub_A503 -> apply_damage_to_boss: subtract damage (clamped at 0),
 * redraw the health bar, and start the death sequence the first time
 * HP reaches 0.
 */
static void apply_damage_to_boss(uint16_t damage)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    int16_t hp = (int16_t)(MEM16(boss_state + 3) - damage); // .boss_hp
    if (hp < 0) hp = 0;
    MEM16(boss_state + 3) = (uint16_t)hp;

    Draw_Boss_Health();

    if (MEM16(boss_state + 3) != 0) return;
    if (MEM8(ADDR_BOSS_BEING_HIT)) return; // death sequence already started

    death_timer = 0;
    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
}

/*
 * loc_A530: runs every frame once the boss has been struck down to 0 HP
 * (ADDR_BOSS_BEING_HIT set). Thrashes violently for ~32 frames (reusing
 * the normal tentacle-render code with a fast-changing dl), then holds
 * for ~8 more frames before signalling death to the generic engine.
 */
static void death_sequence_step(void)
{
    ink_squirt_state = 0;

    if (death_timer >= 40) { // 0x28: death sequence finished
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;

    uint8_t dl;
    if (death_timer < 32) { // 0x20: violent thrash phase
        death_timer++;
        tentacle_anim_step = (tentacle_anim_step + 1) & 7;
        dl = (uint8_t)(((death_timer & 1) << 3) + anim_group_offset);
        MEM8(ADDR_SOUND_FX_REQUEST) = 40;
    } else { // slow-down phase
        death_timer++;
        dl = (uint8_t)(anim_group_offset + 8);
    }

    render_tentacles_and_ink(dl);
}

/*
 * loc_A3E3 .. loc_A4FE: lay out the boss's 7 tentacle columns x up to 8
 * rows using the layout/shape table pair selected by
 * (tentacle_anim_step + dl), turning each set shape-mask bit into a
 * hittable pseudo-monster sprite entry, then (loc_A492 continuation)
 * spawn any due ink-droplet projectiles from the current volley.
 */
static void render_tentacles_and_ink(uint8_t dl)
{
    active_sprite_count = 0;

    uint8_t table_idx = (uint8_t)(tentacle_anim_step + dl);
    const uint8_t *layout = tentacle_layout_tables[table_idx];
    uint8_t *shape = tentacle_shape_tables[table_idx]; // mutable: rotated in place below

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t col_x = MEM16(boss_state + 0); // .boss_x

    for (uint8_t col = 0; col < 7; col++) {
        uint8_t rel;
        int in_range = is_in_proximity_window(col_x, &rel);
        col_rel_x = rel;

        if (!in_range) {
            /* Out of view: still rotate through this column's 8 row-bits
             * and advance the layout pointer for every set bit, so the
             * next column resumes at the right place, but skip creating
             * any sprite entries. */
            for (uint8_t row = 0; row < 8; row++) {
                uint8_t carry = (uint8_t)((*shape & 0x80) != 0);
                *shape = (uint8_t)((*shape << 1) | carry);
                if (carry) layout += 2;
            }
        } else {
            for (uint8_t row = 0; row < 8; row++) {
                uint8_t carry = (uint8_t)((*shape & 0x80) != 0);
                *shape = (uint8_t)((*shape << 1) | carry);
                if (carry) {
                    MEM16(si + 0) = col_x;                                              // .currX
                    MEM8(si + 2) = (uint8_t)(((row * 2) + MEM8(boss_state + 2)) & 0x3F); // .currY
                    MEM8(si + 3) = col_rel_x;                                            // .m_x_rel
                    MEM8(si + 4) = layout[0];                                            // .flags <- tile idx
                    MEM8(si + 6) = layout[1];                                            // .anim_counter
                    MEM8(si + 5) = (hit_monster_flags != 0) ? 0x20 : 0x00;               // .ai_flags: hit-flash

                    uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); // .m_x_rel, .currY
                    uint8_t old_tile = MEM8(di);
                    MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
                    MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

                    si += 16;
                    layout += 2;
                    active_sprite_count++;
                }
            }
        }

        shape += 1;
        col_x += 2;
    }

    MEM16(si) = 0xFFFF; // terminator after the last tentacle segment

    /* --- loc_A492: ink-droplet volley spawn continuation --- */
    if (ink_squirt_state & 0x80) {
        uint8_t row_index = (uint8_t)((ink_squirt_state & 0x1F) - 1);
        const uint8_t *countdown = &ink_spawn_countdown_table[(uint16_t)row_index * 4];
        uint16_t x = ink_target_x;

        for (uint8_t i = 0; i < 4; i++, x++, countdown++) {
            uint8_t rel;
            if (!is_in_proximity_window(x, &rel)) continue;

            uint8_t remaining = *countdown;
            if (remaining == 0) continue;

            MEM16(si + 0) = x;                    // .currX
            MEM8(si + 2) = ink_target_y;          // .currY
            MEM8(si + 3) = rel;                   // .m_x_rel
            MEM8(si + 4) = 0x30;                  // .flags: ink-droplet sprite/tile index
            MEM8(si + 6) = (uint8_t)(remaining - 1); // .anim_counter
            MEM8(si + 5) = 0;                     // .ai_flags

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); // .m_x_rel, .currY
            uint8_t old_tile = MEM8(di);
            MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
            MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

            si += 16;
            active_sprite_count++;
        }
    }

    MEM16(si) = 0xFFFF;
}
