/*
 * zel2.c - translated from zel2.asm ("Paguro" boss AI; internal/overlay
 * codename "Zel2" - see aPaguro / the file name)
 *
 * This is a boss-encounter overlay module, structurally identical to
 * zela.c/crab.c/tako.c: it is loaded at a fixed segment address and
 * exports an entry point (Paguro_AI, originally Zel2_AI_proc) plus a
 * shared "boss_state_block" that the generic engine reads elsewhere
 * (health bar, victory/reward handling, name display) via a fixed
 * offset, regardless of which boss module is currently loaded.
 *
 * Scope of this translation
 * ------------------------------------------------------------------
 * This file translates the AI/gameplay logic only. The following are
 * NOT translated, since they are sprite/animation *asset* data read by
 * a separate, generic sprite-composition routine at fixed offsets into
 * this overlay (never touched by Zel2_AI_proc itself):
 *   - the "start:" export header and its reserved padding
 *   - byte_A03A .. byte_A166 (5 tables of [pal_idx, tl, tr, bl, br]
 *     16x16-sprite descriptors, reached via the offset table at
 *     ADDR_MONSTER_AI_MOVE_LEFT_FRAMES): these are exactly the boss's
 *     own body-segment sprites -- movement_facing_table (byte_A4DB,
 *     values 0-4) selects which of the 5 tables, and each body
 *     segment's anim_counter (0-11, from stage_body_segments) selects
 *     the frame within it -- transcribed as PAGURO_FRAMES in
 *     tools/GrpViewer/grp_viewer.py rather than duplicated here, same
 *     as ZELA_FRAMES/CRAB_FRAMES/TAKO_FRAMES for the other bosses
 *   - boss_state_block's own non-AI fields (xp_reward, arena_center_x,
 *     boss_placement, name_block_ptr, almas_reward, name_screen_x/y,
 *     boss_name_pstring aPaguro) -- these are populated/read by the
 *     generic overlay loader and encounter/reward code, not by this AI
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - Each visible body segment of the boss occupies a temporary entry
 *   in the shared monsters_table (the same array real monsters live
 *   in), exactly as in zela.c/crab.c/tako.c, reusing the same field
 *   offsets:
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
 *   as in zela.c.
 * - boss_state_block's AI-relevant fields (boss_x, boss_y, boss_hp)
 *   are shared data reached through ADDR_BOSS_STATE_PTR, at the same
 *   offsets zela.c/crab.c/tako.c use (+0 boss_x word, +2 boss_y byte,
 *   +3 boss_hp word) since "boss_state_block" is simply a label alias
 *   for "boss_x" in the original assembly.
 * - Local helpers that the original tested with jb/jnb (carry) return
 *   an int/uint8_t that IS the "in range" boolean, exactly as in
 *   zela.c (see is_in_proximity_window).
 * - The repeated "wrap the (proximity_map_left_col_x + offset) column
 *   against mapWidth" idiom (four call sites in this file, each written
 *   with either a jb or a jnb depending on which register the original
 *   needed the result in) always reduces, for every call site, to the
 *   same formula regardless of which branch/register the original
 *   used: wrap_col() below reproduces that formula directly (identical
 *   to zela.c's wrap_col()).
 * - UNLIKE Agar (zela.c), the near/far shot "arm" markers here are not
 *   stand-alone unused bytes: byte_A606/byte_A60C and byte_A612/
 *   byte_A618 are simply labels that fall *inside* the 24-byte
 *   body-segment staging table (unk_A603, aka body_tile[]/body_frame[]
 *   below), at the high ("frame") byte of staging slots 1, 4, 7 and 10
 *   respectively:
 *       byte_A603 + 2*i     = body_tile[i]   (low byte)
 *       byte_A603 + 2*i + 1 = body_frame[i]  (high byte)
 *       byte_A606 = byte_A603+3  -> body_frame[1]
 *       byte_A60C = byte_A603+9  -> body_frame[4]
 *       byte_A612 = byte_A603+15 -> body_frame[7]
 *       byte_A618 = byte_A603+21 -> body_frame[10]
 *   so arming a shot directly overrides the animation frame drawn for
 *   two of the boss's twelve body segments (presumably its claws/
 *   pincers) for the rest of that frame, on top of whatever
 *   stage_body_segments() already filled in. Reproduced here as direct
 *   writes into body_frame[1]/body_frame[4] (near_shot_prepare) and
 *   body_frame[7]/body_frame[10] (far_shot_prepare).
 * - Damage application here (fire, see apply_damage_to_boss) has no
 *   guard against being invoked again while the boss is already mid
 *   death-sequence: boss_being_hit is set (again) and death_timer reset
 *   to 0 unconditionally whenever hp reaches 0, exactly as in the
 *   original sub_A55D -- reproduced as-is rather than "fixed".
 * - Unlike Agar_AI, when an attack sequence is already active
 *   (attack_active != 0) this boss's per-frame dispatch jumps straight
 *   into attack_pattern_step() and skips the boss_being_hit check that
 *   would otherwise route to hit_flash_and_death_step() -- that check
 *   is only reached via idle_or_hitflash_branch(), taken when no attack
 *   sequence is running (or a shot is already armed). Reproduced as-is;
 *   see Paguro_AI() below.
 * - is_in_proximity_window, Get_Stats, Draw_Boss_Health, get_random,
 *   Add_Projectile_To_Array, Browse_Projectiles, and the various
 *   ADDR_* absolute addresses (monsters table base, proximity second
 *   layer, sound FX request, boss-being-hit/boss-is-dead flags) are
 *   assumed declared elsewhere (zeliard.h), same as coords_to_prox_addr
 *   / etc. in zela.c.
 */

#include "zeliard.h"

/*
 * ============================================================================
 * Per-frame / persistent AI state (byte_A5F6 .. byte_A602 in the original)
 * ============================================================================
 */
static uint8_t anim_phase = 0;                  /* byte_A5F6: facing/animation phase, cycles 0..7 */
static uint8_t projectile_request = 0;          /* byte_A5F7: 0 = none, 1 = near shot armed, 2 = far shot armed */
static uint8_t attack_active = 0;               /* byte_A5F8: 0 = idle, 0xFF/0x7F = an attack sequence is running */
static uint8_t approach_side_flag = 0;          /* byte_A5F9: selects which side alignment_adjust nudges the boss toward */
static uint8_t attack_pending = 0;              /* byte_A5FA: 0 = advance the movement pattern this frame, else pause-counting */
static uint8_t pattern_step_index = 0;          /* byte_A5FB: index into movement_steps[], only ever increases within one sequence */
static uint8_t movement_pattern_subcounter = 0; /* byte_A5FC: 0..3 pause counter between movement-pattern steps */
static uint8_t segment_render_index = 0;        /* byte_A5FD: monsters_table write cursor / proximity_second_layer index this frame */
static uint8_t idle_align_counter = 2;          /* byte_A5FE: counts down every idle frame; triggers anim_phase++ every other frame */
static uint8_t pending_hit_flags = 0;           /* byte_A5FF: ai_flags&0x1F of a hit segment found this frame (0 = no hit) */
static uint8_t last_col_rel_x = 0;              /* byte_A600: proximity-relative X of the body column currently being laid out */
static uint8_t death_timer = 0;                 /* byte_A601: counts up during the death/hit-flash sequence (0..0x28) */
static uint8_t boundary_reached_flag = 0;       /* byte_A602: set when a movement step failed to move (hit the arena wall) */

/*
 * unk_A603: staging buffer of (tile, frame) pairs, one per of the 12
 * body-segment slots (4 columns x 3 rows), refilled every frame by
 * stage_body_segments() and consumed by place_boss_body_segments().
 * Slots 1, 4, 7 and 10's frame byte are additionally poked directly by
 * near_shot_prepare()/far_shot_prepare() -- see file header comment.
 */
static uint8_t body_tile[12];
static uint8_t body_frame[12];

/*
 * byte_A4DB: per-anim_phase facing/body-tile id, indexed by anim_phase
 * (0..7).
 */
static const uint8_t movement_facing_table[8] = { 2, 1, 0, 3, 4, 3, 0, 1 };

/*
 * Projectile templates (byte_A543.. and byte_A550.. in the original),
 * PROJECTILE_STRUCT_SIZE bytes each. Index 0 (rel-x) and index 1 (y)
 * are filled in dynamically by fire_projectile(); the rest are fixed
 * asset data copied from the original bytes. As with zela.c's
 * proj_near/proj_far, byte 2 is presumed to be a projectile-type index
 * into the DUNGEONS[] projectiles table in this JS port (same remap
 * convention as the other bosses); the exact group for Paguro's shot
 * is asset-pipeline data, not reproduced/guessed here.
 */
static uint8_t proj_near[PROJECTILE_STRUCT_SIZE] = { 0, 0, 0, 0, 0x32, 4, 0x78, 0, 0, 0, 0, 0, 0 }; /* byte_A543 */
static uint8_t proj_far[PROJECTILE_STRUCT_SIZE]  = { 0, 0, 0, 0, 0x32, 0, 0x78, 0, 0, 0, 0, 0, 0 }; /* byte_A550 */

/*
 * Forward declarations
 */
static void collect_hit_and_restore_tiles(void);   /* loc_A1C4 .. loc_A207 */
static void apply_damage_to_boss(uint16_t damage);  /* sub_A55D */
static void idle_or_hitflash_branch(void);          /* loc_A362 */
static void idle_position_sync(void);               /* loc_A380 .. loc_A3B9 */
static void attack_pattern_step(void);              /* loc_A2AF */
static void alignment_adjust(void);                 /* sub_A339 / loc_A341 .. loc_A358 */
static void render_and_projectile_tail(void);       /* loc_A3B9 */
static void random_projectile_trigger_check(void);  /* loc_A3EB */
static void near_shot_prepare(void);                /* loc_A444 */
static void far_shot_prepare(void);                 /* loc_A422 */
static void fire_projectile(void);                  /* sub_A4E3 */
static void hit_flash_and_death_step(void);         /* loc_A58B .. loc_A5D9 */
static void stage_body_segments(uint8_t phase_idx); /* loc_A3B9 fill loop / loc_A5B7 */
static void place_boss_body_segments(void);         /* loc_A458 .. loc_A4D1 */
static uint16_t wrap_col(uint16_t offset);          /* shared left-column wrap idiom */
static uint8_t move_boss_right(void);               /* sub_A525 */
static uint8_t move_boss_left(void);                /* sub_A534 */
static void move_boss_N(void);                      /* sub_A325 */
static void move_boss_S(void);                      /* sub_A31B */
static void movement_step_0(void);
static void movement_step_N_align(void);
static void movement_step_align_only(void);
static void movement_step_S_align(void);
static void movement_step_finalize(void);           /* sub_A30C (falls into move_boss_S) */
static void (*const movement_steps[10])(void);      /* funcs_A2F1 */

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
 * Paguro_AI_reset - clear all persistent static state so a fresh
 * encounter behaves correctly even after a save/restore cycle. Not
 * currently declared in zeliard.h - add a prototype there (alongside
 * Paguro_AI) when the loader wires this boss up the same way as the
 * others.
 */
void Paguro_AI_reset(void)
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
}

/*
 * Paguro_AI - entry point, called once per frame.
 */
void Paguro_AI(uint16_t m)
{
    (void)m;

    collect_hit_and_restore_tiles();

    /* --- loc_A207: apply damage from any segment struck last frame --- */
    if (pending_hit_flags != 0) {
        uint8_t stat = Get_Stats((uint8_t)(pending_hit_flags & 0x1F)); /* returns the "ah" damage stat, per Get_Stats convention */
        uint16_t dmg = (uint16_t)(stat >> 1);

        MEM8(ADDR_SOUND_FX_REQUEST) = 36;
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

    /* --- loc_A254: a shot already armed (near or far) takes priority
     * over everything else this frame - go straight to the idle/hit-
     * flash tail (which itself still checks boss_being_hit first). --- */
    if (projectile_request != 0) {
        idle_or_hitflash_branch();
        return;
    }

    if (!attack_active) {
        uint8_t r = (uint8_t)(get_random() & 0x0F);
        if (r != 0) {
            idle_or_hitflash_branch();
            return;
        }
        if (MEM8(ADDR_BOSS_BEING_HIT)) {
            idle_or_hitflash_branch();
            return;
        }

        /* --- loc_A27B: trigger a fresh attack sequence --- */
        attack_active = 0xFF;
        attack_pending = 0xFF;
        approach_side_flag = 0xFF;
        pattern_step_index = 0;
        movement_pattern_subcounter = 0;

        uint16_t col = wrap_col(0x0E);
        if (get_boss_x() < col) approach_side_flag = 0;
    }

    /* NOTE: when attack_active was already nonzero on entry, execution
     * reaches here directly, WITHOUT the boss_being_hit check above -
     * an active attack sequence keeps running even while the boss is
     * flashing from a hit, exactly as in the original (see file header
     * comment). */
    attack_pattern_step();
}

/*
 * loc_A1C4 .. loc_A207: walk last frame's body-segment pseudo-monster
 * entries, restore the proximity-map tiles they overwrote, and pick up
 * any hit flagged by the external hit-detection code (ai_flags bit
 * 0x40). NOTE: the "already recorded a hit" check here (bit 0x80 of
 * pending_hit_flags) can never actually be true, since pending_hit_flags
 * is always assigned a value masked with 0x1F - this is reproduced
 * exactly as in the original, so in practice the *last* hit segment
 * found each frame wins, not the first.
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
 * sub_A55D: apply the given damage to boss_hp, redraw the health bar,
 * and if hp hits 0, kick off the death sequence.
 */
static void apply_damage_to_boss(uint16_t damage)
{
    int32_t hp = (int32_t)get_boss_hp() - (int32_t)damage;
    if (hp < 0) hp = 0;
    set_boss_hp((uint16_t)hp);

    Draw_Boss_Health();

    if (hp != 0) return;

    /* See file header comment: unlike zela.c's equivalent, there is no
     * guard here against re-entering this branch on a later frame if
     * the boss is struck again while already mid death-sequence. */
    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
    death_timer = 0;
    projectile_request = 0;
    Browse_Projectiles();
}

/*
 * loc_A362: runs whenever the boss isn't actively stepping through an
 * attack sequence this frame (no sequence running, this frame's random
 * re-trigger roll wasn't taken, or a shot is already armed).
 */
static void idle_or_hitflash_branch(void)
{
    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        hit_flash_and_death_step();
        return;
    }

    /* loc_A36C */
    idle_align_counter--;
    if (idle_align_counter == 0) {
        idle_align_counter = 2;
        anim_phase = (uint8_t)((anim_phase + 1) & 7);
    }

    idle_position_sync();
    render_and_projectile_tail();
}

/*
 * loc_A380 .. loc_A3B9: nudge the boss one step toward/away from a
 * reference column (left_col_x + 18, wrapped), but only on specific
 * anim_phase values, exactly mirroring the original's asymmetric
 * left/right conditions.
 */
static void idle_position_sync(void)
{
    uint16_t col = wrap_col(0x12);

    if (col >= get_boss_x()) {
        /* loc_A3AF */
        if (anim_phase == 4) {
            if (!move_boss_right()) boundary_reached_flag = 0xFF;
        }
    } else {
        /* loc_A39C */
        if (anim_phase == 0) {
            if (!move_boss_left()) boundary_reached_flag = 0xFF;
        }
    }
}

/*
 * loc_A2AF: advances the active attack sequence's movement pattern, or
 * counts through the pause between steps.
 */
static void attack_pattern_step(void)
{
    anim_phase = (uint8_t)((anim_phase + 2) & 6);

    if (attack_pending != 0) {
        movement_pattern_subcounter = (uint8_t)((movement_pattern_subcounter + 1) & 3);
        if (movement_pattern_subcounter == 0) {
            /* loc_A2CE */
            attack_pending = 0;
            if (!(attack_active & 0x80)) {
                /* loc_A2DD */
                attack_active = 0;
            }
        }
    } else {
        /* loc_A2E5 */
        uint8_t idx = pattern_step_index;
        pattern_step_index++;
        movement_steps[idx]();
    }

    render_and_projectile_tail();
}

/*
 * sub_A339 / loc_A341 .. loc_A358: if the boss isn't already flagged as
 * having hit a wall this sequence, nudge it one step toward the
 * reference column (left_col_x + 12, wrapped) and flag on failure.
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

/*
 * loc_A3B9: shared per-frame tail - refresh the body-segment staging
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
 * loc_A3EB: 1-in-2 chance per frame to arm a shot, provided the boss is
 * positioned appropriately relative to the reference column.
 */
static void random_projectile_trigger_check(void)
{
    uint8_t r = get_random();
    if (r & 1) return; /* 50%: no roll this frame */

    uint16_t col = wrap_col(0x12);
    if (get_boss_x() >= col) {
        /* loc_A438 */
        if (anim_phase != 2) return;
        projectile_request = 1;
        near_shot_prepare();
        return;
    }

    /* boss_x < col */
    uint16_t col2 = (uint16_t)(col - 2);
    if ((uint16_t)(get_boss_x() + 7) >= col2) return; /* too far: abort */
    if (anim_phase != 6) return;

    projectile_request = 2;
    far_shot_prepare();
}

/*
 * loc_A444: arm the near shot (pokes body_frame[1]/body_frame[4] so
 * the boss's body shows its "about to shoot" frame), firing once
 * anim_phase reaches 4.
 */
static void near_shot_prepare(void)
{
    body_frame[1] = 0x0E;
    body_frame[4] = 0x0F;
    if (anim_phase != 4) return;
    fire_projectile();
}

/*
 * loc_A422: arm the far shot (pokes body_frame[7]/body_frame[10]),
 * firing once anim_phase reaches 0.
 */
static void far_shot_prepare(void)
{
    body_frame[7] = 0x0C;
    body_frame[10] = 0x0D;
    if (anim_phase != 0) return;
    fire_projectile();
}

/*
 * sub_A4E3: fills in the dynamic (rel-x, y) fields of both projectile
 * templates and hands the selected one off to the shared projectile
 * array.
 */
static void fire_projectile(void)
{
    uint8_t y = (uint8_t)((get_boss_y() + 3) & 0x3F);
    proj_far[1]  = y; /* byte_A551 */
    proj_near[1] = y; /* byte_A544 */

    uint8_t rel;
    is_in_proximity_window((uint16_t)(get_boss_x() + 1), &rel);
    proj_near[0] = rel; /* byte_A543 */
    is_in_proximity_window((uint16_t)(get_boss_x() + 7), &rel);
    proj_far[0] = rel;  /* byte_A550 */

    uint8_t *tmpl = (projectile_request == 1) ? proj_near : proj_far;
    Add_Projectile_To_Array(tmpl);
    projectile_request = 0;
}

/*
 * loc_A58B .. loc_A5D9: runs every frame once the boss has been struck
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
 * loc_A3CB fill loop / loc_A5C6: fill the 12-slot (tile, frame)
 * staging table from the current anim_phase's facing id.
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
 * loc_A458 .. loc_A4D1: lay out the boss's 4 columns x 3 rows of body
 * segments using the staging table filled by stage_body_segments()
 * (as possibly amended by near_shot_prepare()/far_shot_prepare()),
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

/* sub_A525: move right one step, bounded at the right arena wall. */
static uint8_t move_boss_right(void)
{
    if (get_boss_x() == 50) return 0; /* blocked */
    set_boss_x((uint16_t)(get_boss_x() + 1));
    return 1;
}

/* sub_A534: move left one step, bounded at the left arena wall. */
static uint8_t move_boss_left(void)
{
    if (get_boss_x() == 17) return 0; /* blocked */
    set_boss_x((uint16_t)(get_boss_x() - 1));
    return 1;
}

static void move_boss_N(void) { set_boss_y((uint8_t)((get_boss_y() - 1) & 0x3F)); } /* sub_A325 */
static void move_boss_S(void) { set_boss_y((uint8_t)((get_boss_y() + 1) & 0x3F)); } /* sub_A31B */

/* funcs_A2F1[0] (sub_A325) */
static void movement_step_0(void) { move_boss_N(); }
/* funcs_A2F1[1..3] (sub_A32F) */
static void movement_step_N_align(void) { move_boss_N(); alignment_adjust(); }
/* funcs_A2F1[4..5] (sub_A339, entered at its top) */
static void movement_step_align_only(void) { alignment_adjust(); }
/* funcs_A2F1[6..8] (sub_A334) */
static void movement_step_S_align(void) { move_boss_S(); alignment_adjust(); }
/*
 * funcs_A2F1[9] (sub_A30C): in the original this proc has no retn and
 * falls straight through into sub_A31B's code, i.e. it both resets the
 * attack-sequence flags AND performs a south step, with no
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
