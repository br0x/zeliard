/*
 * Alguien/Akma boss AI
 *
 * This is a boss-encounter overlay module, structurally identical to
 * crab.asm/crab.c ("Cangrejo") and tako.asm/tako.c ("Pulpo"): it is
 * loaded at a fixed segment address and exports an entry point
 * (Alguien_AI, originally Alguien_AI_proc) plus a shared "boss_state_block"
 * that the generic engine reads elsewhere (health bar, victory/reward
 * handling, name display) via a fixed offset, regardless of which boss
 * module is currently loaded.
 *
 * Scope of this translation
 * ------------------------------------------------------------------
 * This file translates the AI/gameplay logic only. The following are
 * NOT translated, since they are sprite/animation *asset* data (or
 * pure loader/reward metadata) that this AI never reads directly,
 * exactly like the excluded tables in tako.c/crab.c:
 *   - the "start:" export header and its reserved padding, including
 *     the jump-table-like list of `dw offset byte_Axxx` pointers
 *   - byte_A07E .. byte_A2EF: only ever referenced from that header
 *     table, never read by Alguien_AI_proc itself (confirmed: no other
 *     code in akma.asm references these labels)
 *   - boss_state_block's own non-AI fields (xp_reward, arena_center_x,
 *     boss_placement, name_block_ptr, almas_reward, name_screen_x/y,
 *     boss_name_pstring) -- these are populated/read by the generic
 *     overlay loader and encounter/reward code, not by this AI
 *
 * The pose layout/mask tables (off_A7EE/off_A7F4 -> unk_A7FA..unk_A85E,
 * and off_A870/off_A876 -> unk_A87C..unk_A8FE), the two small overlay
 * tables (unk_A918/unk_A92C, unk_A940/unk_A94A), and the flight-path
 * Y-lookup tables (unk_A954/unk_A969) ARE translated, since
 * Alguien_AI_proc reads them directly every frame to build the boss's
 * hittable body -- same rationale as tako.c's tentacle layout/shape
 * tables.
 *
 * IMPORTANT: like tako.c's tentacle shape tables, the *mask* tables
 * (unk_A87C.. / unk_A896..) are mutated in place at runtime -- the
 * original code rotates each mask byte (`rol byte ptr [bp],1`) every
 * time it is consumed, so consecutive frames resume from wherever the
 * mask was last left. That mutation is preserved here on purpose.
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - Each visible body/limb segment occupies a temporary entry in the
 *   shared monsters_table (the same array real monsters live in),
 *   exactly as in tako.c/crab.c, reusing the same field offsets:
 *       +0 currX (word)   +2 currY   +3 m_x_rel   +4 flags
 *       +5 ai_flags        +6 anim_counter
 *   Here "+4 flags" holds a tile/sprite index (from the "limb grid",
 *   the high nibble of a byte written by populate_limb_grid()/the
 *   overlay writers), "+6 anim_counter" holds that same byte
 *   unmasked, and "+5 ai_flags" bit 0x20 is set by us to request a
 *   hit-flash (like tako.c), while bit 0x40 is set by the external
 *   hit-detection code to tell us a segment was struck. The two
 *   ground/diagonal "sweep" attack hitboxes reuse the identical
 *   struct via spawn_hitbox().
 * - "si"/"di"/"bx"/"bp" pointers from the original are modeled as
 *   plain uint16_t addresses into the flat MEM8/MEM16 address space,
 *   or as plain C pointers into the translated static tables, exactly
 *   as in tako.c/crab.c.
 * - The "limb grid" (byte_AA2A .. byte_AAD3 in the original) is, per
 *   the disassembly, a single contiguous 13x16 = 208-byte scratch
 *   buffer: every reference into it (byte_AA2A, byte_AA33, byte_AA67,
 *   byte_AA87, byte_AAD3) is just a different starting offset into
 *   that same buffer (confirmed by their address deltas summing
 *   exactly to 208, and by the render loop always walking it in
 *   16-byte-per-column strides starting at byte_AA2A). It is modeled
 *   here as one flat `limb_grid[208]` array with named offset
 *   constants, rather than as separate named sub-arrays, since IDA's
 *   per-reference labeling was an artifact of the disassembly, not a
 *   real structural boundary. The original clears a larger region
 *   (0x240 = 576 bytes, via `rep stosw` with cx=0x120) than the 208
 *   bytes that are ever read back; the extra cleared bytes are
 *   presumably harmless overlay padding beyond byte_AAD3 and are not
 *   reproduced here since nothing else in the AI ever reads them.
 * - Local helpers that the original tested with jb/jnb (carry) return
 *   an int/uint8_t that IS the "in range" boolean, exactly as in
 *   tako.c (via is_in_proximity_window's boolean-style return).
 * - is_in_proximity_window, Get_Stats, Draw_Boss_Health, and the
 *   various ADDR_* absolute addresses (monsters table base, proximity
 *   second layer, sound FX request, boss-being-hit/boss-is-dead flags,
 *   proximity map left column, hero X in viewport, map width) are
 *   assumed declared elsewhere (zeliard.h), same as coords_to_prox_addr
 *   / etc. in tako.c/crab.c.
 */

#include "zeliard.h"
#include <string.h>

/*
 * ============================================================================
 * Per-frame / persistent AI state (byte_AA1E .. byte_AA29 in the original)
 * ============================================================================
 */
static uint8_t active_sprite_count = 0;  /* byte_AA1E: monsters_table write cursor this frame */
static uint8_t hit_flags = 0;
/* byte_AA1F: packed result of last frame's hit-detection pass.
 * bit 7 = the struck segment's tile index (monster.flags) was exactly 5
 *         ("vulnerable" segment, tracked for parity with the original --
 *         note it does NOT change the damage dealt, only the value
 *         stored here);
 * bits 4-0 = ai_flags & 0x1F of the segment that was hit.
 * Zero means no part was struck this frame. */
static uint8_t anim_phase = 0;      /* byte_AA20: cycles 0..2, selects which of 3 body poses to use */
static uint8_t flight_phase = 0;    /* byte_AA21: 0 / 0xFF -- selects which of two mirrored pose/overlay/path table sets is active (toggles each time the boss reaches the top of its climb/descent) */
static uint8_t last_rel_x = 0;      /* byte_AA22: proximity-relative X of the column/segment currently being written */
static uint8_t frame_counter = 0;   /* byte_AA23: free-running frame counter */
static uint8_t overlay_frame = 0;   /* byte_AA24: selects which entry of the small "secondary" overlay table to use */
static uint8_t attack_active = 0;   /* byte_AA25: 0xFF while the sweep-attack telegraph/execution cycle is running */
static uint8_t attack_step = 0;     /* byte_AA26: counts up during the telegraph, then down during execution */
static uint8_t attack_holding = 0;  /* byte_AA27: 0xFF once the telegraph has finished building and the attack is firing */
static uint8_t attack_pattern = 0;  /* byte_AA28: 0/1 -- selects ground-sweep vs diagonal-sweep attack shape (derived from hero position relative to the map edge when the telegraph starts) */
static uint8_t death_timer = 0;     /* byte_AA29: counts up during the death sequence (0..40) */

/*
 * "limb grid": byte_AA2A .. byte_AAD3 in the original, a single 208-byte
 * (13 columns x 16 rows) scratch buffer of body/limb tile bytes, 0xFF =
 * no segment at this slot. See the big comment at the top of the file.
 */
#define LIMB_GRID_SIZE   208
static uint8_t limb_grid[LIMB_GRID_SIZE];

/* Offsets into limb_grid matching the original sub-labels, used only by
 * the two small overlay writers below. */
#define GRID_OFF_AA33   9    /* byte_AA33: "secondary" overlay slot, flight_phase == 0 */
#define GRID_OFF_AA67   61   /* byte_AA67: "arm" overlay base,      flight_phase != 0 */
#define GRID_OFF_AA87   93   /* byte_AA87: "arm" overlay base,      flight_phase == 0 */
#define GRID_OFF_AAD3   169  /* byte_AAD3: "secondary" overlay slot, flight_phase != 0 */

/*
 * ============================================================================
 * Pose layout tables (off_A7EE/off_A7F4 -> unk_A7FA..unk_A85E)
 * ============================================================================
 * Each table holds N raw tile-index bytes, one per currently-visible
 * body/limb segment, where N is the number of set bits in the matching
 * mask table. Selected each frame as layout_set[anim_phase & 3].
 */
static const uint8_t layout_a7fa[25] = { 0x00, 0x50, 0x10, 0x13, 0x12, 0x11, 0x01, 0x02, 0x51, 0x14, 0x15, 0x16, 0x17, 0x18, 0x03, 0x04, 0x19, 0x1A, 0x1B, 0x1C, 0x05, 0x06, 0x1D, 0x1E, 0x07 };
static const uint8_t layout_a813[25] = { 0x10, 0x15, 0x07, 0x11, 0x12, 0x13, 0x14, 0x05, 0x06, 0x16, 0x17, 0x18, 0x19, 0x03, 0x04, 0x1A, 0x1B, 0x1C, 0x1D, 0x01, 0x02, 0x50, 0x1E, 0x00, 0x51 };
static const uint8_t layout_a82c[16] = { 0x00, 0x50, 0x20, 0x01, 0x02, 0x51, 0x21, 0x22, 0x03, 0x04, 0x23, 0x24, 0x08, 0x09, 0x25, 0x26 };
static const uint8_t layout_a83c[16] = { 0x20, 0x21, 0x08, 0x22, 0x23, 0x09, 0x24, 0x25, 0x03, 0x04, 0x26, 0x01, 0x02, 0x50, 0x00, 0x51 };
static const uint8_t layout_a84c[18] = { 0x00, 0x50, 0x27, 0x01, 0x02, 0x51, 0x28, 0x29, 0x03, 0x04, 0x2A, 0x2B, 0x05, 0x06, 0x07, 0x2C, 0x2D, 0x2E };
static const uint8_t layout_a85e[18] = { 0x2E, 0x2C, 0x2D, 0x07, 0x2A, 0x2B, 0x05, 0x06, 0x28, 0x29, 0x03, 0x04, 0x27, 0x01, 0x02, 0x50, 0x00, 0x51 };

/* off_A7EE (flight_phase == 0) */
static const uint8_t *const layout_tables_phase0[3] = { layout_a7fa, layout_a82c, layout_a84c };
/* off_A7F4 (flight_phase != 0) */
static const uint8_t *const layout_tables_phase1[3] = { layout_a813, layout_a83c, layout_a85e };

/*
 * Pose mask tables (off_A870/off_A876 -> unk_A87C..unk_A8FE): 13 groups
 * of 2 bytes = 26 bytes each. NOT const: rotated in place every frame by
 * populate_limb_grid(), exactly like tako.c's tentacle shape tables.
 */
static uint8_t mask_a87c[26] = { 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x2A, 0xA8, 0x40, 0x00, 0x2A, 0xB0, 0x00, 0x00, 0x56, 0x30, 0x88, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
static uint8_t mask_a896[26] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0x10, 0x56, 0x30, 0x00, 0x00, 0x2A, 0xB0, 0x40, 0x00, 0x2A, 0xA8, 0x04, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00 };
static uint8_t mask_a8b0[26] = { 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x02, 0xA8, 0x00, 0x00, 0x02, 0xB0, 0x00, 0x00, 0x01, 0x50, 0x00, 0x10, 0x00, 0xA0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
static uint8_t mask_a8ca[26] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0xA0, 0x00, 0x10, 0x01, 0x50, 0x00, 0x00, 0x02, 0xB0, 0x00, 0x00, 0x02, 0xA8, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00 };
static uint8_t mask_a8e4[26] = { 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x02, 0xA8, 0x00, 0x00, 0x02, 0xB0, 0x00, 0x00, 0x0A, 0x30, 0x00, 0x10, 0x0A, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00 };
static uint8_t mask_a8fe[26] = { 0x04, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x00, 0x10, 0x0A, 0x30, 0x00, 0x00, 0x02, 0xB0, 0x00, 0x00, 0x02, 0xA8, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00 };

/* off_A870 (flight_phase == 0) */
static uint8_t *const mask_tables_phase0[3] = { mask_a87c, mask_a8b0, mask_a8e4 };
/* off_A876 (flight_phase != 0) */
static uint8_t *const mask_tables_phase1[3] = { mask_a896, mask_a8ca, mask_a8fe };

/*
 * Small overlay tables. unk_A918/unk_A92C hold 2 alternating 10-byte
 * "arm" pose variants (selected by frame_counter parity); unk_A940/
 * unk_A94A hold 5 "secondary" (e.g. head/weapon-tip) pose bytes each
 * (selected by overlay_frame).
 */
static const uint8_t overlay_arm_a918[20] = { 0xFF, 0x30, 0xFF, 0xFF, 0xFF, 0x31, 0x32, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x33, 0x34, 0xFF, 0x35, 0x36, 0xFF, 0xFF, 0xFF };
static const uint8_t overlay_arm_a92c[20] = { 0x30, 0xFF, 0xFF, 0x31, 0xFF, 0xFF, 0xFF, 0x32, 0xFF, 0xFF, 0x33, 0xFF, 0xFF, 0x35, 0x34, 0x36, 0xFF, 0xFF, 0xFF, 0xFF };
static const uint8_t overlay_secondary_a940[10] = { 0x40, 0x41, 0x42, 0x43, 0x44, 0x43, 0x45, 0x43, 0x46, 0x43 };
static const uint8_t overlay_secondary_a94a[10] = { 0x40, 0x41, 0x42, 0x43, 0x44, 0x47, 0x45, 0x43, 0x46, 0x43 };

/*
 * Flight-path Y-lookup tables (unk_A954/unk_A969): indexed by
 * (boss_x_low_byte - 10) >> 1, range 0..20 since boss_x is clamped to
 * [10, 0x33]. Gives the boss's Y row for its current X column, i.e. the
 * shape of its flight path across the arena.
 */
static const uint8_t path_y_a954[21] = { 0x3C, 0x3C, 0x3D, 0x3E, 0x3F, 0x3F, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01 };
static const uint8_t path_y_a969[21] = { 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x3F, 0x3F, 0x3E, 0x3D, 0x3C, 0x3C };

/*
 * Forward declarations
 */
static void apply_damage_to_boss(uint16_t damage);        /* sub_A97E */
static void death_sequence_step(void);                    /* loc_A9B0 */
static void populate_limb_grid(const uint8_t *layout, uint8_t *mask); /* sub_A7CC */
static void apply_overlay_arm(void);                       /* loc_A517 .. loc_A54C continuation */
static void apply_overlay_secondary(void);                 /* loc_A566 continuation */
static uint16_t render_body_and_emit_sprites(void);        /* loc_A58B .. loc_A613 */
static uint16_t spawn_hitbox(uint16_t si, uint16_t x, uint8_t y, uint8_t tile, uint8_t anim); /* sub_A78A */
static void emit_attack_hitboxes(uint16_t si);              /* loc_A613 .. loc_A785 */
static void render_frame(void);                             /* loc_A4F7 .. loc_A785 (shared fallthrough) */
static void update_attack_telegraph(void);                  /* loc_A492 .. loc_A4C2 */
static int try_move_boss_left(void);                        /* sub_A4D4 */
static int try_move_boss_right(void);                       /* sub_A4E6 */
static uint8_t compute_edge_flag(uint16_t threshold, int invert); /* loc_A3F5/loc_A46E's shared hero-edge test */
static void start_attack_telegraph(uint8_t new_flight_phase, uint16_t edge_threshold, int invert_edge);

/*
 * Alguien_AI_reset - clear all persistent static state so a fresh
 * encounter behaves correctly even after a save/restore cycle. (Akma
 * has no explicit reset routine in the original overlay -- the state
 * variables simply start pre-zeroed as static data in the segment --
 * but a reset entry point is provided here for parity with the WASM
 * port's other boss modules, e.g. Pulpo_AI_reset in tako.c.)
 */
void Alguien_AI_reset(void)
{
    active_sprite_count = 0;
    hit_flags = 0;
    anim_phase = 0;
    flight_phase = 0;
    last_rel_x = 0;
    frame_counter = 0;
    overlay_frame = 0;
    attack_active = 0;
    attack_step = 0;
    attack_holding = 0;
    attack_pattern = 0;
    death_timer = 0;
    memset(limb_grid, 0xFF, sizeof(limb_grid));
}

/*
 * Alguien_AI - entry point, called once per frame.
 */
void Alguien_AI(uint16_t m)
{
    (void)m;

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    active_sprite_count = 0;
    hit_flags = 0;

    /* --- loc_A339 .. loc_A384: walk last frame's rendered pseudo-monster
     * entries, restore the proximity-map tiles they overwrote, and pick
     * up any hit flagged by the external hit-detection code (ai_flags
     * bit 0x40). Only the first hit found this frame is kept. --- */
    for (;;) {
        if (MEM16(si + 0) == 0xFFFF) break; /* .currX sentinel: end of list */

        uint8_t rel;
        if (is_in_proximity_window(MEM16(si + 0), &rel)) {
            MEM8(si + 3) = rel; /* .m_x_rel */

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); /* .m_x_rel, .currY */
            MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count);

            if (MEM8(si + 5) & 0x40) { /* .ai_flags: this segment was hit this frame */
                if (!(hit_flags & 0x80)) { /* only record the first hit found */
                    uint8_t al = (uint8_t)(MEM8(si + 5) & 0x1F);
                    if (MEM8(si + 4) == 5) al |= 0x80; /* .flags: tile idx == 5 -> "vulnerable" segment */
                    hit_flags = al;
                }
            }
        }

        active_sprite_count++;
        si += 16;
    }

    /* Reset the sprite table; render_frame() repopulates it fresh this frame. */
    si = base;
    MEM16(si) = 0xFFFF;

    if (hit_flags != 0) {
        uint8_t stat = Get_Stats((uint8_t)(hit_flags & 0x1F)); /* assumed to return the "ah" damage stat */
        MEM8(ADDR_SOUND_FX_REQUEST) = 34;
        apply_damage_to_boss(stat);
    }

    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        death_sequence_step();
        return;
    }

    /* --- loc_A3B5: normal per-frame animation & movement bookkeeping --- */
    overlay_frame = 0;

    anim_phase++;
    if (anim_phase >= 3) anim_phase = 0;
    if (anim_phase == 1) MEM8(ADDR_SOUND_FX_REQUEST) = 43;

    frame_counter++;

    if (!flight_phase) {
        /* loc_A3D1: crawling toward the left wall */
        if (!try_move_boss_left()) {
            /* loc_A3E4: hit the left wall -- climb one row */
            uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
            uint8_t y = (uint8_t)((MEM8(boss_state + 2) - 2) & 0x3F);
            MEM8(boss_state + 2) = y;
            if (y == 0x3D) {
                /* loc_A3F5: reached the top -- flip to the "returning" phase and start a sweep-attack telegraph */
                start_attack_telegraph(0xFF, 0x28, 0);
            }
            /* else: fall through to the Y-lookup below, same as the asm's "jmp loc_A492" */
        }
        /* if the move succeeded: fall straight through to the Y-lookup below, like the asm's "jmp loc_A47A" */
    } else {
        /* loc_A42E: crawling toward the right wall */
        if (!try_move_boss_right()) {
            /* hit the right wall -- climb one row */
            uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
            uint8_t y = (uint8_t)((MEM8(boss_state + 2) - 2) & 0x3F);
            MEM8(boss_state + 2) = y;
            if (y == 0x3D) {
                /* reached the top -- flip back to the "approaching" phase and start a sweep-attack telegraph */
                start_attack_telegraph(0, 0x14, 1);
            }
        }
    }

    /* --- loc_A47A/loc_A487: recompute boss_y from boss_x via the flight-path table --- */
    {
        uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
        const uint8_t *table = flight_phase ? path_y_a954 : path_y_a969;
        uint8_t bx_low = (uint8_t)MEM16(boss_state + 0);
        uint8_t idx = (uint8_t)((bx_low - 0x0A) >> 1);
        MEM8(boss_state + 2) = table[idx];
    }

    /* --- loc_A492: advance the sweep-attack telegraph, if one is active --- */
    update_attack_telegraph();

    /* --- loc_A4F7 onward: rebuild the visible body and (if a sweep attack
     * is active) its hitboxes --- */
    render_frame();
}

/*
 * sub_A97E -> apply_damage_to_boss: subtract damage (clamped at 0),
 * redraw the health bar, and start the death sequence the first time
 * HP reaches 0.
 */
static void apply_damage_to_boss(uint16_t damage)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    int16_t hp = (int16_t)(MEM16(boss_state + 3) - damage); /* .boss_hp */
    if (hp < 0) hp = 0;
    MEM16(boss_state + 3) = (uint16_t)hp;

    Draw_Boss_Health();

    if (MEM16(boss_state + 3) != 0) return;
    if (MEM8(ADDR_BOSS_BEING_HIT)) return; /* death sequence already started */

    death_timer = 0;
    attack_active = 0;
    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
}

/*
 * loc_A9B0: runs every frame once the boss has been struck down to 0 HP
 * (ADDR_BOSS_BEING_HIT set). Thrashes for ~30 frames (reusing the normal
 * body-render code with a fixed pose), then holds a single fixed pose for
 * ~10 more frames before signalling death to the generic engine.
 */
static void death_sequence_step(void)
{
    if (death_timer >= 0x28) { /* death sequence finished */
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;
    uint8_t prev = death_timer;
    death_timer++;

    if (prev < 0x1E) { /* thrash phase */
        anim_phase++;
        if (anim_phase >= 3) anim_phase = 0;

        frame_counter++;
        overlay_frame++;
        overlay_frame &= 1;

        if ((frame_counter & 3) == 0) {
            MEM8(ADDR_SOUND_FX_REQUEST) = 55;
        }
    } else { /* hold phase: freeze on a fixed pose */
        anim_phase = 1;
        overlay_frame = 1;
    }

    render_frame();
}

/*
 * sub_A4D4: try to move the boss 2 tiles left; fails (returns 0, boss_x
 * unchanged) once boss_x - 2 would be <= 9.
 */
static int try_move_boss_left(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t x = (uint16_t)(MEM16(boss_state + 0) - 2);
    if (x <= 9) return 0;
    MEM16(boss_state + 0) = x;
    return 1;
}

/*
 * sub_A4E6: try to move the boss 2 tiles right; fails (returns 0, boss_x
 * unchanged) once boss_x + 2 would exceed 0x33.
 */
static int try_move_boss_right(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t x = (uint16_t)(MEM16(boss_state + 0) + 2);
    if (x > 0x33) return 0;
    MEM16(boss_state + 0) = x;
    return 1;
}

/*
 * Shared tail of loc_A3F5 / the analogous block inside loc_A42E: compute
 * the hero's X position relative to the map (wrapping the same way the
 * original's "sub bx,mapWidth / jnb keep / else xchg ax,bx" does), then
 * compare it against a threshold to derive the sweep-attack pattern flag.
 * `invert` mirrors the second call site's extra `not al` before masking.
 */
static uint8_t compute_edge_flag(uint16_t threshold, int invert)
{
    uint16_t heroX = (uint16_t)(MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + MEM8(ADDR_HERO_X_VIEW));
    uint16_t mapWidth = MEM16(ADDR_MAP_WIDTH);
    uint16_t v = (heroX >= mapWidth) ? (uint16_t)(heroX - mapWidth) : heroX;
    uint8_t below = (v < threshold) ? 1 : 0;
    return invert ? (uint8_t)(below ^ 1) : below;
}

/*
 * Shared tail of both "reached the top of the climb" transitions
 * (loc_A3F5 and the equivalent block inside loc_A42E): flip the
 * approach/return phase, reset and start the sweep-attack telegraph,
 * play the transition sound, and pick the attack pattern from the
 * hero's current position.
 */
static void start_attack_telegraph(uint8_t new_flight_phase, uint16_t edge_threshold, int invert_edge)
{
    flight_phase = new_flight_phase;
    attack_holding = 0;
    attack_step = 0;
    attack_active = 0xFF;
    MEM8(ADDR_SOUND_FX_REQUEST) = 52;
    attack_pattern = compute_edge_flag(edge_threshold, invert_edge);
}

/*
 * loc_A492 .. loc_A4C2: while a sweep-attack cycle is active, count the
 * telegraph up to a pattern-dependent threshold (7 or 8 frames), then
 * count back down to 0 (the "execution" phase, during which
 * emit_attack_hitboxes() actually spawns hitboxes), ending the cycle
 * once it reaches 0 again.
 */
static void update_attack_telegraph(void)
{
    if (!attack_active) return;

    overlay_frame = (uint8_t)(attack_pattern + 2);

    if (attack_holding) {
        attack_step--;
        if (attack_step == 0) attack_active = 0;
    } else {
        attack_step++;
        uint8_t threshold = (uint8_t)((attack_pattern ? 0 : 1) + 7);
        if (attack_step >= threshold) attack_holding = 0xFF;
    }
}

/*
 * sub_A7CC: lay out one body pose. `mask` is a 26-byte (13 groups x 2
 * bytes) bitmask, consumed and rotated left 1 bit at a time (MSB first,
 * matching the original `rol`); every bit that comes out set consumes
 * the next byte from `layout` and writes it into the next limb_grid
 * slot. Every slot advances di regardless of the bit, so unset bits
 * simply leave that grid slot at its previous (cleared-to-0xFF) value.
 */
static void populate_limb_grid(const uint8_t *layout, uint8_t *mask)
{
    uint16_t di = 0;
    for (uint8_t col = 0; col < 13; col++) {
        for (uint8_t sub = 0; sub < 2; sub++) {
            for (uint8_t bit = 0; bit < 8; bit++) {
                uint8_t carry = (uint8_t)((*mask & 0x80) != 0);
                *mask = (uint8_t)((*mask << 1) | carry);
                if (carry) limb_grid[di] = *layout++;
                di++;
            }
            mask++;
        }
    }
}

/*
 * loc_A517 continuation (loc_A53C .. loc_A54C): overlay a small 5-slot
 * "arm" pose fragment onto the limb grid, alternating between 2 baked
 * variants of the source table by frame_counter's parity.
 */
static void apply_overlay_arm(void)
{
    uint16_t di;
    const uint8_t *src;
    if (flight_phase) { di = GRID_OFF_AA67; src = overlay_arm_a92c; }
    else               { di = GRID_OFF_AA87; src = overlay_arm_a918; }

    src += (frame_counter & 1) ? 0x0A : 0x00;

    for (uint8_t i = 0; i < 5; i++) {
        limb_grid[di] = src[0];
        limb_grid[di + 1] = src[1];
        src += 2;
        di += 16;
    }
}

/*
 * loc_A566 continuation: overlay a 2-slot "secondary" pose fragment
 * (e.g. head/weapon tip) onto the limb grid, selected by overlay_frame.
 */
static void apply_overlay_secondary(void)
{
    uint16_t di;
    const uint8_t *src;
    if (flight_phase) { di = GRID_OFF_AAD3; src = overlay_secondary_a94a; }
    else               { di = GRID_OFF_AA33; src = overlay_secondary_a940; }

    uint8_t idx = (uint8_t)(overlay_frame * 2);
    limb_grid[di] = src[idx];
    limb_grid[di + 16] = src[idx + 1];
}

/*
 * loc_A58B .. loc_A613: walk the 13-column x 16-row limb grid, turning
 * each non-0xFF slot into a hittable pseudo-monster sprite entry at the
 * corresponding (boss_x + col, boss_y + row) position. Columns outside
 * the proximity window are skipped (but still consume their 16 grid
 * slots, unread). Returns the monsters_table cursor just past the last
 * entry written (still needs its 0xFFFF terminator; emit_attack_hitboxes
 * writes it after possibly appending more entries).
 */
static uint16_t render_body_and_emit_sprites(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t si = MEM16(ADDR_MONSTERS_LIST);
    uint16_t grid_di = 0;

    active_sprite_count = 0;
    uint16_t x = MEM16(boss_state + 0); /* .boss_x */

    for (uint8_t col = 0; col < 13; col++) {
        uint8_t rel;
        int in_range = is_in_proximity_window(x, &rel);
        last_rel_x = rel;

        if (in_range) {
            for (uint8_t row = 0; row < 16; row++, grid_di++) {
                uint8_t g = limb_grid[grid_di];
                if (g == 0xFF) continue;

                MEM16(si + 0) = x;                                                 /* .currX */
                MEM8(si + 2) = (uint8_t)((MEM8(boss_state + 2) + row) & 0x3F);      /* .currY */
                MEM8(si + 3) = last_rel_x;                                         /* .m_x_rel */
                MEM8(si + 4) = (uint8_t)(g >> 4);                                   /* .flags <- tile idx */
                MEM8(si + 6) = g;                                                   /* .anim_counter <- raw byte */
                uint8_t ai = (uint8_t)(flight_phase & 0x80);
                if (hit_flags != 0) ai |= 0x20; /* hit-flash */
                MEM8(si + 5) = ai;                                                  /* .ai_flags */

                uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); /* .m_x_rel, .currY */
                uint8_t old_tile = MEM8(di);
                MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
                MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

                si += 16;
                active_sprite_count++;
            }
        } else {
            grid_di += 16;
        }

        x++;
    }

    return si;
}

/*
 * sub_A78A: append one sweep-attack hitbox entry at (x,y) with the given
 * tile/anim, save-and-mark the proximity tile it overlaps, and return
 * the advanced cursor.
 */
static uint16_t spawn_hitbox(uint16_t si, uint16_t x, uint8_t y, uint8_t tile, uint8_t anim)
{
    MEM16(si + 0) = x;                                  /* .currX */
    MEM8(si + 2) = (uint8_t)(y & 0x3F);                 /* .currY */
    MEM8(si + 3) = last_rel_x;                          /* .m_x_rel */
    MEM8(si + 4) = tile;                                /* .flags */
    MEM8(si + 6) = anim;                                /* .anim_counter */
    MEM8(si + 5) = (uint8_t)(flight_phase & 0x80);      /* .ai_flags */

    uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
    uint8_t old_tile = MEM8(di);
    MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
    MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

    active_sprite_count++;
    return si + 16;
}

/*
 * loc_A613 .. loc_A785: while the sweep-attack is in its "execution"
 * phase (attack_active && attack_step != 0), spawn a fan of attack_step
 * hitboxes advancing outward from the boss along one of two shapes
 * (shallow "ground sweep" or steep "diagonal sweep", per
 * attack_pattern), mirrored left/right by flight_phase. All but the last
 * hitbox in the fan use one tile/anim; the last (closest to the boss)
 * uses a slightly different anim value.
 */
static void emit_attack_hitboxes(uint16_t si)
{
    if (!attack_active || attack_step == 0) {
        MEM16(si) = 0xFFFF;
        return;
    }

    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t bx0 = MEM16(boss_state + 0);
    uint8_t by0 = MEM8(boss_state + 2);
    uint8_t steps = attack_step;

    if (!attack_pattern) {
        /* loc_A631/loc_A687: shallow ground sweep, dy=+1 per dx=2 step */
        uint16_t x = flight_phase ? (uint16_t)(bx0 + 0x0B) : bx0;
        uint8_t y = (uint8_t)(by0 + 9);
        int8_t dx = flight_phase ? 2 : -2;

        for (uint8_t i = 1; i < steps; i++) {
            x = (uint16_t)(x + dx);
            y = (uint8_t)(y + 1);
            uint8_t rel;
            if (is_in_proximity_window(x, &rel)) {
                last_rel_x = rel;
                si = spawn_hitbox(si, x, y, 0x26, 0x03);
            }
        }
        x = (uint16_t)(x + dx);
        y = (uint8_t)(y + 1);
        uint8_t rel;
        if (is_in_proximity_window(x, &rel)) {
            last_rel_x = rel;
            si = spawn_hitbox(si, x, y, 0x26, 0x02);
        }
    } else {
        /* loc_A6D9/loc_A734: steep diagonal sweep, dy=+2 per dx=2 step */
        uint16_t x = flight_phase ? (uint16_t)(bx0 + 0x0A) : (uint16_t)(bx0 + 1);
        uint8_t y = (uint8_t)(by0 + 9);
        int8_t dx = flight_phase ? 2 : -2;

        for (uint8_t i = 1; i < steps; i++) {
            x = (uint16_t)(x + dx);
            y = (uint8_t)(y + 2);
            uint8_t rel;
            if (is_in_proximity_window(x, &rel)) {
                last_rel_x = rel;
                si = spawn_hitbox(si, x, y, 0x26, 0x07);
            }
        }
        x = (uint16_t)(x + dx);
        y = (uint8_t)(y + 2);
        uint8_t rel;
        if (is_in_proximity_window(x, &rel)) {
            last_rel_x = rel;
            si = spawn_hitbox(si, x, y, 0x26, 0x06);
        }
    }

    MEM16(si) = 0xFFFF;
}

/*
 * loc_A4F7 .. loc_A785: shared per-frame render tail, reached both from
 * the normal update path (after update_attack_telegraph()) and directly
 * from the death sequence. Rebuilds the limb grid from scratch, overlays
 * the small arm/secondary pose fragments, emits the resulting body as
 * hittable pseudo-monster sprites, and (if a sweep attack is currently
 * executing) appends its hitboxes.
 */
static void render_frame(void)
{
    memset(limb_grid, 0xFF, sizeof(limb_grid));

    {
        const uint8_t *const *layout_set = flight_phase ? layout_tables_phase1 : layout_tables_phase0;
        uint8_t *const *mask_set         = flight_phase ? mask_tables_phase1   : mask_tables_phase0;
        uint8_t idx = (uint8_t)(anim_phase & 3);
        populate_limb_grid(layout_set[idx], mask_set[idx]);
    }

    apply_overlay_arm();
    apply_overlay_secondary();

    uint16_t si = render_body_and_emit_sprites();
    emit_attack_hitboxes(si);
}
