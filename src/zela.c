/*
 * zela.c - translated from zela.asm ("Agar" boss AI; internal/overlay
 * codename "Zela" - see aAgar / the file name)
 *
 * This is a boss-encounter overlay module, structurally identical to
 * crab.asm/crab.c ("Cangrejo") and tako.asm/tako.c ("Pulpo"): it is
 * loaded at a fixed segment address and exports an entry point
 * (Agar_AI, originally Agar_AI_proc) plus a shared "boss_state_block"
 * that the generic engine reads elsewhere (health bar, victory/reward
 * handling, name display) via a fixed offset, regardless of which boss
 * module is currently loaded.
 *
 * Scope of this translation
 * ------------------------------------------------------------------
 * This file translates the AI/gameplay logic only. The following are
 * NOT translated, since they are sprite/animation *asset* data read by
 * a separate, generic sprite-composition routine at fixed offsets into
 * this overlay (never touched by Zela_AI_proc itself):
 *   - the "start:" export header and its reserved padding
 *   - byte_A03A .. byte_A166 (5 tables of [pal_idx, tl, tr, bl, br]
 *     16x16-sprite descriptors, reached via the offset table at
 *     ADDR_MONSTER_AI_MOVE_LEFT_FRAMES): these are exactly the boss's
 *     own body-segment sprites -- movement_facing_table (byte_A4EA,
 *     values 0-4) selects which of the 5 tables, and each body
 *     segment's anim_counter (0-11, from stage_body_segments) selects
 *     the frame within it -- transcribed as ZELA_FRAMES in
 *     tools/GrpViewer/grp_viewer.py rather than duplicated here, same
 *     as CRAB_FRAMES/TAKO_FRAMES/TORI_FRAMES for the other bosses
 *   - boss_state_block's own non-AI fields (xp_reward, arena_center_x,
 *     boss_placement, name_block_ptr, almas_reward, name_screen_x/y,
 *     boss_name_pstring) -- these are populated/read by the generic
 *     overlay loader and encounter/reward code, not by this AI.
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - Each visible body segment of the boss occupies a temporary entry
 *   in the shared monsters_table (the same array real monsters live
 *   in), exactly as in crab.c/tako.c, reusing the same field offsets:
 *       +0 currX (word)   +2 currY   +3 m_x_rel   +4 flags
 *       +5 ai_flags        +6 anim_counter
 *   Here "+4 flags" holds a tile/sprite index (from the small
 *   body_tile[]/body_frame[] staging tables filled every frame from
 *   movement_facing_table[anim_phase]) rather than a monster type, and
 *   "+5 ai_flags" bit 0x40 is set by the external hit-detection code
 *   to tell us a segment was struck this frame.
 * - "si"/"di"/"bx" pointers from the original are modeled as plain
 *   uint16_t addresses into the flat MEM8/MEM16 address space, or as
 *   plain C pointers/arrays into the translated static tables, exactly
 *   as in crab.c/tako.c.
 * - boss_state_block's AI-relevant fields (boss_x, boss_y, boss_hp)
 *   are shared data reached through ADDR_BOSS_STATE_PTR, at the same
 *   offsets crab.c/tako.c use (+0 boss_x word, +2 boss_y byte, +3
 *   boss_hp word) since "boss_state_block" is simply a label alias for
 *   "boss_x" in the original assembly.
 * - Local helpers that the original tested with jb/jnb (carry) return
 *   an int/uint8_t that IS the "in range" boolean, exactly as in
 *   crab.c/tako.c (see is_in_proximity_window).
 * - The repeated "wrap the (proximity_map_left_col_x + offset) column
 *   against mapWidth" idiom (four call sites, each written with either
 *   a jb or a jnb depending on which register the original needed the
 *   result in) always reduces, for every call site, to the same
 *   formula regardless of which branch/register the original used:
 *   wrap_col() below reproduces that formula directly.
 * - byte_A613 / byte_A619 / byte_A61F / byte_A625 are only ever
 *   written by this AI (never read here); they are presumably consumed
 *   by a generic explosion/attack-telegraph renderer elsewhere, so
 *   they are kept as plain state bytes with no further interpretation,
 *   matching the "asset data owned by a different module" rationale
 *   used for the excluded tables above.
 * - is_in_proximity_window, Get_Stats, Draw_Boss_Health, get_random,
 *   Add_Projectile_To_Array, Browse_Projectiles, and the various
 *   ADDR_* absolute addresses (monsters table base, proximity second
 *   layer, sound FX request, boss-being-hit/boss-is-dead flags) are
 *   assumed declared elsewhere (zeliard.h), same as coords_to_prox_addr
 *   / etc. in crab.c/tako.c.
 */

#include "zeliard.h"

/*
 * ============================================================================
 * Per-frame / persistent AI state (byte_A603 .. byte_A625 in the original)
 * ============================================================================
 */
static uint8_t anim_phase = 0;                  /* byte_A603: facing/animation phase, cycles 0..7 */
static uint8_t projectile_request = 0;          /* byte_A604: 0 = none, 1 = near shot armed, 2 = far shot armed */
static uint8_t attack_active = 0;                /* byte_A605: 0 = idle, 0xFF/0x7F = an attack sequence is running */
static uint8_t approach_side_flag = 0;           /* byte_A606: selects which side idle_position_sync nudges the boss toward */
static uint8_t attack_pending = 0;                /* byte_A607: 0 = advance the movement pattern this frame, else pause-counting */
static uint8_t pattern_step_index = 0;           /* byte_A608: index into movement_steps[], only ever increases within one sequence */
static uint8_t movement_pattern_subcounter = 0;  /* byte_A609: 0..3 pause counter between movement-pattern steps */
static uint8_t segment_render_index = 0;         /* byte_A60A: monsters_table write cursor / proximity_second_layer index this frame */
static uint8_t idle_align_counter = 2;           /* byte_A60B: counts down every idle frame; triggers anim_phase++ every other frame */
static uint8_t pending_hit_flags = 0;             /* byte_A60C: ai_flags&0x1F of a hit segment found this frame (0 = no hit) */
static uint8_t last_col_rel_x = 0;                /* byte_A60D: proximity-relative X of the body column currently being laid out */
static uint8_t death_timer = 0;                   /* byte_A60E: counts up during the death/hit-flash sequence (0..0x28) */
static uint8_t boundary_reached_flag = 0;         /* byte_A60F: set when a movement step failed to move (hit the arena wall) */

/*
 * word_A610: staging buffer of (tile, frame) pairs, one per of the 12
 * body-segment slots (4 columns x 3 rows), refilled every frame by
 * stage_body_segments() and consumed by place_boss_body_segments().
 */
static uint8_t body_tile[12];
static uint8_t body_frame[12];

/* Written only, never read in this module - see file header comment. */
static uint8_t byte_A613 = 0;
static uint8_t byte_A619 = 0;
static uint8_t byte_A61F = 0;
static uint8_t byte_A625 = 0;

/*
 * byte_A4EA: per-anim_phase facing/body-tile id, indexed by anim_phase
 * (0..7).
 */
static const uint8_t movement_facing_table[8] = { 2, 1, 0, 3, 4, 3, 0, 1 };

/*
 * Projectile templates (byte_A552.. and byte_A55F.. in the original),
 * PROJECTILE_STRUCT_SIZE bytes each. Index 0 (rel-x) and index 1 (y)
 * are filled in dynamically by fire_projectile(); the rest are fixed
 * asset data copied verbatim from the original bytes.
 */
static uint8_t proj_near[PROJECTILE_STRUCT_SIZE] = { 0, 0, 0x15, 0x00, 0x32, 0x04, 0x50, 0, 0, 0, 0, 0, 0 }; /* byte_A552 */
static uint8_t proj_far[PROJECTILE_STRUCT_SIZE]  = { 0, 0, 0x14, 0x00, 0x32, 0x00, 0x50, 0, 0, 0, 0, 0, 0 }; /* byte_A55F */

/*
 * Forward declarations
 */
static void collect_hit_and_restore_tiles(void);   /* loc_A1C4 .. loc_A207 */
static void apply_damage_to_boss(uint16_t damage);  /* part of sub_A56C */
static void idle_or_hitflash_branch(void);          /* loc_A371 */
static void idle_position_sync(void);               /* loc_A38F .. loc_A3BE */
static void attack_pattern_step(void);              /* loc_A2BE */
static void render_and_projectile_tail(void);       /* loc_A3C8 */
static void random_projectile_trigger_check(void);  /* loc_A3FA */
static void far_check_A447(void);                   /* loc_A447 */
static void near_shot_prepare(void);                /* loc_A453 */
static void far_shot_prepare(void);                 /* loc_A431 */
static void fire_projectile(void);                  /* sub_A4F2 */
static void hit_flash_and_death_step(void);          /* loc_A59A .. loc_A5E8 */
static void stage_body_segments(uint8_t phase_idx);  /* loc_A3DA / loc_A5D5 */
static void place_boss_body_segments(void);          /* loc_A467 .. loc_A4E0 */
static uint16_t wrap_col(uint16_t offset);            /* shared left-column wrap idiom */
static uint8_t move_boss_right(void);                 /* sub_A534 */
static uint8_t move_boss_left(void);                  /* sub_A543 */
static void move_boss_N(void);
static void move_boss_S(void);
static void alignment_adjust(void);                   /* loc_A348 .. loc_A367 */
static void movement_step_0(void);
static void movement_step_N_align(void);
static void movement_step_align_only(void);
static void movement_step_S_align(void);
static void movement_step_finalize(void);             /* sub_A31B (falls into move_boss_S) */
static void (*const movement_steps[10])(void);        /* funcs_A300 */

/*
 * ============================================================================
 * boss_state_block accessors (boss_x/boss_y/boss_hp only - see file header)
 * ============================================================================
 */
static uint16_t boss_state(void) { return MEM16(ADDR_BOSS_STATE_PTR); }
static uint16_t get_boss_x(void) { return MEM16(boss_state() + 0); }
static void set_boss_x(uint16_t v) { MEM16(boss_state() + 0) = v; }
static uint8_t get_boss_y(void) { return MEM8(boss_state() + 2); }
static void set_boss_y(uint8_t v) { MEM8(boss_state() + 2) = v; }
static uint16_t get_boss_hp(void) { return MEM16(boss_state() + 3); }
static void set_boss_hp(uint16_t v) { MEM16(boss_state() + 3) = v; }

/*
 * Agar_AI_reset - clear all persistent static state so a fresh
 * encounter behaves correctly even after a save/restore cycle. Not
 * currently declared in zeliard.h (unlike Cangrejo_AI_reset /
 * Pulpo_AI_reset) - add a prototype there if/when the loader wires it
 * up the same way as the other bosses.
 */
void Agar_AI_reset(void)
{
    anim_phase = 0;
    projectile_request = 0;
    attack_active = 0;
    approach_side_flag = 0;
    attack_pending = 0;
    pattern_step_index = 0;
    movement_pattern_subcounter = 0;
    segment_render_index = 0;
    idle_align_counter = 2;
    pending_hit_flags = 0;
    last_col_rel_x = 0;
    death_timer = 0;
    boundary_reached_flag = 0;
    byte_A613 = 0;
    byte_A619 = 0;
    byte_A61F = 0;
    byte_A625 = 0;
}

/*
 * Agar_AI - entry point, called once per frame.
 */
void Agar_AI(uint16_t m)
{
    (void)m;

    collect_hit_and_restore_tiles();

    /* --- loc_A207: apply damage from any segment struck last frame --- */
    if (pending_hit_flags != 0) {
        uint8_t raw = pending_hit_flags;
        uint8_t stat = Get_Stats((uint8_t)(raw & 0x1F)); /* returns the "ah" damage stat, per Get_Stats convention */
        uint16_t dmg = (uint16_t)(stat >> 1);

        if (raw == 4) { /* segment id 4: "heavy" hit */
            dmg = (uint16_t)(dmg * 4);
            MEM8(ADDR_SOUND_FX_REQUEST) = 36;
        } else {
            MEM8(ADDR_SOUND_FX_REQUEST) = 37;
        }

        apply_damage_to_boss(dmg);

        /* Recoil further in whichever direction the boss already is
         * relative to the wrapped reference column. */
        uint16_t col = wrap_col(0x0F);
        if (get_boss_x() >= col) {
            move_boss_right();
            move_boss_right();
        } else {
            move_boss_left();
            move_boss_left();
        }
    }

    /* --- loc_A263 --- */
    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        hit_flash_and_death_step();
        return;
    }

    if (!attack_active) {
        uint8_t r = (uint8_t)(get_random() & 0x0F);
        if (r != 0 || MEM8(ADDR_BOSS_BEING_HIT)) {
            idle_or_hitflash_branch();
            return;
        }

        /* --- loc_A28A: trigger a fresh attack sequence --- */
        attack_active = 0xFF;
        attack_pending = 0xFF;
        approach_side_flag = 0xFF;
        pattern_step_index = 0;
        movement_pattern_subcounter = 0;

        uint16_t col = wrap_col(0x0E);
        if (get_boss_x() < col) approach_side_flag = 0;
    }

    attack_pattern_step();
}

/*
 * loc_A1C4 .. loc_A207: walk last frame's body-segment pseudo-monster
 * entries, restore the proximity-map tiles they overwrote, and pick up
 * any hit flagged by the external hit-detection code (ai_flags bit
 * 0x40). NOTE: unlike tako.c's equivalent guard, the "already recorded
 * a hit" check here (bit 0x80 of pending_hit_flags) can never actually
 * be true, since pending_hit_flags is always assigned a value masked
 * with 0x1F - this is reproduced exactly as in the original, so in
 * practice the *last* hit segment found each frame wins, not the
 * first.
 */
static void collect_hit_and_restore_tiles(void)
{
    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    segment_render_index = 0;
    pending_hit_flags = 0;

    for (;;) {
        if (MEM16(si + 0) == 0xFFFF) break; /* .currX sentinel: end of list */

        uint8_t rel;
        if (is_in_proximity_window(MEM16(si + 0), &rel)) {
            MEM8(si + 3) = rel; /* .m_x_rel */

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); /* .m_x_rel, .currY */
            MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + segment_render_index);

            if (MEM8(si + 5) & 0x40) { /* .ai_flags: this segment was hit this frame */
                if (!(pending_hit_flags & 0x80)) {
                    pending_hit_flags = (uint8_t)(MEM8(si + 5) & 0x1F);
                }
            }
        }

        segment_render_index++;
        si += 16;
    }

    /* Reset the sprite table; place_boss_body_segments() repopulates
     * it fresh this frame. */
    si = base;
    MEM16(si) = 0xFFFF;
}

/*
 * sub_A56C (damage-application half only; the health-bar draw / boss
 * geometry recoil that followed it in the original is handled inline
 * in Agar_AI, same split as crab.c/tako.c's apply_damage_to_boss).
 */
static void apply_damage_to_boss(uint16_t damage)
{
    int32_t hp = (int32_t)get_boss_hp() - (int32_t)damage;
    if (hp < 0) hp = 0;
    set_boss_hp((uint16_t)hp);

    Draw_Boss_Health();

    if (hp != 0) return;
    if (MEM8(ADDR_BOSS_BEING_HIT)) return; /* death sequence already started */

    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
    death_timer = 0;
    projectile_request = 0;
    Browse_Projectiles();
}

/*
 * loc_A371: runs whenever the boss isn't actively stepping through an
 * attack sequence this frame (either no sequence is running, or one is
 * running but this frame's random re-trigger roll wasn't taken).
 */
static void idle_or_hitflash_branch(void)
{
    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        hit_flash_and_death_step();
        return;
    }

    /* loc_A37B */
    idle_align_counter--;
    if (idle_align_counter == 0) {
        idle_align_counter = 2;
        anim_phase = (uint8_t)((anim_phase + 1) & 7);
    }

    idle_position_sync();
    render_and_projectile_tail();
}

/*
 * loc_A38F .. loc_A3BE: nudge the boss one step toward/away from a
 * reference column (left_col_x + 18, wrapped), but only on specific
 * anim_phase values, exactly mirroring the original's asymmetric
 * left/right conditions.
 */
static void idle_position_sync(void)
{
    uint16_t col = wrap_col(0x12);

    if (col >= get_boss_x()) {
        /* loc_A3B7 */
        if (anim_phase == 4) {
            if (!move_boss_right()) boundary_reached_flag = 0xFF;
        }
    } else {
        /* loc_A3AB */
        if (anim_phase == 0) {
            if (!move_boss_left()) boundary_reached_flag = 0xFF;
        }
    }
}

/*
 * loc_A2BE: advances the active attack sequence's movement pattern, or
 * counts through the pause between steps.
 */
static void attack_pattern_step(void)
{
    anim_phase = (uint8_t)((anim_phase + 2) & 6);

    if (attack_pending != 0) {
        movement_pattern_subcounter = (uint8_t)((movement_pattern_subcounter + 1) & 3);
        if (movement_pattern_subcounter == 0) {
            /* loc_A2DD */
            attack_pending = 0;
            if (!(attack_active & 0x80)) {
                /* loc_A2EC */
                attack_active = 0;
            }
        }
    } else {
        /* loc_A2F4 */
        uint8_t idx = pattern_step_index;
        pattern_step_index++;
        movement_steps[idx]();
    }

    render_and_projectile_tail();
}

/*
 * loc_A3C8: shared per-frame tail - refresh the body-segment staging
 * table for the current anim_phase, optionally arm/fire a projectile
 * (only while no attack sequence is active), then place the 4x3 body
 * segments into the monsters_table / proximity map.
 */
static void render_and_projectile_tail(void)
{
    stage_body_segments(anim_phase);

    if (!attack_active) {
        if (projectile_request == 0) {
            random_projectile_trigger_check();
        } else if (projectile_request == 1) {
            near_shot_prepare();
        } else {
            far_shot_prepare();
        }
    }

    place_boss_body_segments();
}

/*
 * loc_A3FA: 1-in-2 chance per frame to arm a shot, provided the boss is
 * positioned appropriately relative to the reference column.
 */
static void random_projectile_trigger_check(void)
{
    uint8_t r = get_random();
    if (r & 1) return; /* 50%: no roll this frame */

    uint16_t col = wrap_col(0x12);
    if (get_boss_x() >= col) {
        far_check_A447();
        return;
    }

    uint16_t col2 = (uint16_t)(col - 2);
    if ((uint16_t)(get_boss_x() + 7) >= col2) return; /* too far: abort */
    if (anim_phase != 6) return;

    projectile_request = 2;
    far_shot_prepare();
}

/* loc_A447 */
static void far_check_A447(void)
{
    if (anim_phase != 2) return;
    projectile_request = 1;
    near_shot_prepare();
}

/* loc_A453 */
static void near_shot_prepare(void)
{
    byte_A613 = 0x0E;
    byte_A619 = 0x0F;
    if (anim_phase != 4) return;
    fire_projectile();
}

/* loc_A431 */
static void far_shot_prepare(void)
{
    byte_A61F = 0x0C;
    byte_A625 = 0x0D;
    if (anim_phase != 0) return;
    fire_projectile();
}

/*
 * sub_A4F2: fills in the dynamic (rel-x, y) fields of both projectile
 * templates and hands the selected one off to the shared projectile
 * array.
 */
static void fire_projectile(void)
{
    uint8_t y = (uint8_t)((get_boss_y() + 3) & 0x3F);
    proj_far[1] = y;  /* byte_A560 */
    proj_near[1] = y; /* byte_A553 */

    uint8_t rel;
    is_in_proximity_window((uint16_t)(get_boss_x() + 1), &rel);
    proj_near[0] = rel; /* byte_A552 */
    is_in_proximity_window((uint16_t)(get_boss_x() + 7), &rel);
    proj_far[0] = rel; /* byte_A55F */

    uint8_t *tmpl = (projectile_request == 1) ? proj_near : proj_far;
    Add_Projectile_To_Array(tmpl);
    projectile_request = 0;
}

/*
 * loc_A59A .. loc_A5E8: runs every frame once the boss has been struck
 * down to 0 HP (ADDR_BOSS_BEING_HIT set). Flashes and cycles the body
 * animation for a while, then holds on a fixed frame before signalling
 * death to the generic engine.
 */
static void hit_flash_and_death_step(void)
{
    if (death_timer >= 0x28) { /* death sequence finished */
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;
    death_timer++;

    if (death_timer >= 0x15) {
        anim_phase = 2;
    } else {
        if (!(death_timer & 3)) {
            MEM8(ADDR_SOUND_FX_REQUEST) = 40;
        }
        anim_phase = (uint8_t)((anim_phase + 1) & 7);
    }

    stage_body_segments(anim_phase);
    place_boss_body_segments();
}

/*
 * loc_A3DA / loc_A5D5: fill the 12-slot (tile, frame) staging table
 * from the current anim_phase's facing id.
 */
static void stage_body_segments(uint8_t phase_idx)
{
    uint8_t tile = movement_facing_table[phase_idx & 7];
    for (uint8_t i = 0; i < 12; i++) {
        body_tile[i] = tile;
        body_frame[i] = i;
    }
}

/*
 * loc_A467 .. loc_A4E0: lay out the boss's 4 columns x 3 rows of body
 * segments using the staging table filled by stage_body_segments(),
 * turning each into a hittable pseudo-monster sprite entry.
 */
static void place_boss_body_segments(void)
{
    segment_render_index = 0;
    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    uint16_t x = get_boss_x();
    int stage_idx = 0;

    for (int col = 0; col < 4; col++) {
        uint8_t rel;
        int in_range = is_in_proximity_window(x, &rel);
        last_col_rel_x = rel;

        if (!in_range) {
            stage_idx += 3; /* skip this column's 3 staging entries */
        } else {
            uint8_t y = get_boss_y();
            for (int row = 0; row < 3; row++) {
                MEM16(si + 0) = x;                    /* .currX */
                MEM8(si + 2) = y;                      /* .currY */
                MEM8(si + 3) = last_col_rel_x;         /* .m_x_rel */
                MEM8(si + 4) = body_tile[stage_idx];   /* .flags <- tile idx */
                MEM8(si + 5) = 0;                      /* .ai_flags */
                MEM8(si + 6) = body_frame[stage_idx];  /* .anim_counter */
                stage_idx++;

                uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); /* .m_x_rel, .currY */
                uint8_t old_tile = MEM8(di);
                MEM8(di) = (uint8_t)(segment_render_index | 0x80);
                MEM8(ADDR_PROXIMITY_LAYER2 + segment_render_index) = old_tile;

                si += 16;
                segment_render_index++;
                y = (uint8_t)((y + 2) & 0x3F);
            }
        }

        x += 2;
    }

    MEM16(si) = 0xFFFF; /* terminator after the last body segment */
}

/*
 * Reproduces the repeated x86 idiom found at four call sites:
 *   ax = proximity_map_left_col_x + offset
 *   bx = ax
 *   ax = ax - mapWidth
 *   (conditionally xchg ax,bx, via either a jb or a jnb depending on
 *    the call site, so that whichever of ax/bx is used afterward ends
 *    up holding the same value either way)
 * which always reduces to: if (left+offset < mapWidth) keep left+offset,
 * else subtract mapWidth from it (wrap into the visible column range).
 */
static uint16_t wrap_col(uint16_t offset)
{
    uint16_t left = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);
    uint16_t width = MEM16(ADDR_MAP_WIDTH);
    uint16_t v = (uint16_t)(left + offset);
    if (v >= width) v = (uint16_t)(v - width);
    return v;
}

/* sub_A534: move right one step, bounded at the right arena wall. */
static uint8_t move_boss_right(void)
{
    if (get_boss_x() == 50) return 0; /* blocked */
    set_boss_x((uint16_t)(get_boss_x() + 1));
    return 1;
}

/* sub_A543: move left one step, bounded at the left arena wall. */
static uint8_t move_boss_left(void)
{
    if (get_boss_x() == 17) return 0; /* blocked */
    set_boss_x((uint16_t)(get_boss_x() - 1));
    return 1;
}

static void move_boss_N(void) { set_boss_y((uint8_t)((get_boss_y() - 1) & 0x3F)); }
static void move_boss_S(void) { set_boss_y((uint8_t)((get_boss_y() + 1) & 0x3F)); }

/*
 * loc_A348 .. loc_A367: if the boss isn't already flagged as having
 * hit a wall this sequence, nudge it one step toward the reference
 * column (left_col_x + 12, wrapped) and flag on failure.
 */
static void alignment_adjust(void)
{
    if (boundary_reached_flag) return;

    uint16_t col = wrap_col(0x0C);
    if (get_boss_x() == col) return;

    if (approach_side_flag) {
        if (!move_boss_left()) boundary_reached_flag = 0xFF;
    } else {
        if (!move_boss_right()) boundary_reached_flag = 0xFF;
    }
}

/* funcs_A300[0] */
static void movement_step_0(void) { move_boss_N(); }
/* funcs_A300[1..3] (sub_A33E) */
static void movement_step_N_align(void) { move_boss_N(); alignment_adjust(); }
/* funcs_A300[4..5] (loc_A348 reached directly) */
static void movement_step_align_only(void) { alignment_adjust(); }
/* funcs_A300[6..8] (sub_A343) */
static void movement_step_S_align(void) { move_boss_S(); alignment_adjust(); }
/*
 * funcs_A300[9] (sub_A31B): in the original this proc has no retn and
 * falls straight through into move_boss_S's code, i.e. it both resets
 * the attack-sequence flags AND performs a south step, with no
 * alignment_adjust() afterward.
 */
static void movement_step_finalize(void)
{
    attack_active = 0x7F;
    attack_pending = 0x7F;
    boundary_reached_flag = 0;
    move_boss_S();
}

static void (*const movement_steps[10])(void) = {
    movement_step_0,
    movement_step_N_align, movement_step_N_align, movement_step_N_align,
    movement_step_align_only, movement_step_align_only,
    movement_step_S_align, movement_step_S_align, movement_step_S_align,
    movement_step_finalize,
};
