/*
 * meda.c - translated from meda.asm ("Vista" boss, "Meda" internally / in
 * Japanese)
 *
 * This is a boss-encounter overlay module, structurally identical to
 * crab.asm/crab.c ("Cangrejo") and tako.asm/tako.c ("Pulpo"): it is loaded
 * at a fixed segment address and exports an entry point (Meda_AI,
 * originally Meda_AI_proc) plus a shared "boss_state_block" that the
 * generic engine reads elsewhere (health bar, victory/reward handling,
 * name display) via a fixed offset, regardless of which boss module is
 * currently loaded.
 *
 * Vista is a floating eye-like creature that patrols left/right along the
 * ceiling of its arena (x in [10, 49]), occasionally diving straight down
 * toward the hero and climbing back up, and periodically firing a pair of
 * projectiles.
 *
 * Scope of this translation
 * ------------------------------------------------------------------
 * This file translates the AI/gameplay logic only. The following are NOT
 * translated, since they are sprite/animation *asset* data / generic
 * overlay-loader fields read by separate, generic code at fixed offsets
 * into this overlay (never touched by Meda_AI_proc itself), exactly like
 * the excluded tables in crab.c/tako.c:
 *   - the "start:" export header and its reserved padding
 *   - the ADDR_MONSTER_DAMAGE-region padding and the
 *     ADDR_MONSTER_AI_*_FRAMES pointer tables (byte_A050/A0A0/A0F0/A140/
 *     A18B/A1DB and their pointee bytes) -- these belong to the regular,
 *     non-boss "eye" monster's per-difficulty animation frame tables, and
 *     are never referenced by Meda_AI_proc.
 *   - boss_state_block's own non-AI fields (xp_reward, arena_center_x,
 *     boss_placement, name_block_ptr, almas_reward, name_screen_x/y,
 *     boss_name_pstring "Vista") -- these are populated/read by the
 *     generic overlay loader and encounter/reward code, not by this AI.
 *
 * The body-part layout/shape tables (unk_A5DC/A606, unk_A613/A623,
 * off_A62E/unk_A682, off_A687/off_A6C7) ARE translated, since
 * Meda_AI_proc reads them directly every frame to decide which of the
 * boss's up to 14x12 body-grid slots produce a hittable pseudo-monster
 * sprite this frame -- same rationale as crab.c's body_state_to_layout
 * table and tako.c's tentacle_layout_tables.
 *
 * IMPORTANT: unlike the layout tables, the *shape* tables (bit-masks) are
 * mutated in place at runtime -- the original code rotates the mask byte
 * (`rol byte ptr [bp+0], 1`) every time it is used, so consecutive frames
 * resume from wherever the mask was last left. The 5 "wing" shape slots
 * (off_A6C7) alias only 3 physical 5-byte arrays (this is how the
 * original data was laid out), and that aliasing -- rotating one slot
 * silently rotates every other slot that points at the same array -- is
 * preserved here on purpose to match the original behavior exactly,
 * mirroring tako.c's tentacle_shape_tables aliasing.
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - Each visible body-part segment occupies a temporary entry in the
 *   shared monsters_table (the same array real monsters live in), exactly
 *   as in crab.c/tako.c, reusing the same field offsets:
 *       +0 currX (word)   +2 currY   +3 m_x_rel   +4 flags
 *       +5 ai_flags        +6 anim_counter
 *   Here "+4 flags" holds a tile/sprite index (from the layout table)
 *   rather than a monster type, and "+5 ai_flags" bit 0x20 is set by us to
 *   request a hit-flash, while bit 0x40 is set by the external
 *   hit-detection code to tell us a segment was struck.
 * - "si"/"di"/"bx" pointers from the original are modeled as plain
 *   uint16_t addresses into the flat MEM8/MEM16 address space, or as
 *   plain C pointers into the translated static tables, exactly as in
 *   crab.c/tako.c.
 * - boss_state_block's AI-relevant fields (boss_x, boss_y, boss_hp) are
 *   shared data reached through ADDR_BOSS_STATE_PTR, at the same offsets
 *   crab.c/tako.c use (+0 boss_x word, +2 boss_y byte, +3 boss_hp word)
 *   since "boss_state_block" is simply a label alias for "boss_x" in the
 *   original assembly. Note the original AI subroutines only ever
 *   operate on boss_x's *low byte* ("byte ptr boss_x"), which is
 *   reproduced here via MEM8(boss_state + 0); boss_x is read as a full
 *   word (MEM16) only where the original does (e.g. the dive-trigger and
 *   direction-zone checks, and the per-frame grid dispatch).
 * - Local helpers that the original tested with jb/jnb (carry) are
 *   translated into direct boolean comparisons that reproduce the same
 *   branch outcomes, exactly as in crab.c/tako.c.
 * - is_in_proximity_window, Get_Stats, Draw_Boss_Health, Add_Projectile_To_Array,
 *   coords_to_prox_addr, and the various ADDR_* absolute addresses
 *   (monsters table base, proximity second layer, sound FX request,
 *   boss-being-hit/boss-is-dead flags) are assumed declared elsewhere
 *   (zeliard.h), same as in crab.c/tako.c.
 */

#include <string.h>
#include "zeliard.h"

/*
 * ============================================================================
 * Per-frame / persistent AI state (byte_A72F .. byte_A737 in the original)
 * ============================================================================
 */
static uint8_t active_sprite_count = 0;   /* byte_A731: monsters_table write cursor this frame */
static uint8_t hit_flags = 0;
/* byte_A732: packed result of this frame's hit-detection pass.
 * bit 7 = the struck segment's tile index (monster.flags) had bit 3 set
 *         ("heavy"/vulnerable segment -> extra damage & different sound);
 * bits 4-0 = ai_flags & 0x1F of the segment that was hit (used as the
 *            Get_Stats request type). Zero means no part was struck. */
static uint8_t direction_zone = 0;   /* byte_A72F: 0..4 = quadrant of hero relative to boss (selects body-part pose); 5 = death pose */
static uint8_t anim_frame = 0;       /* byte_A730: wing-flap animation step, cycles 0..4; reaching 4 fires the projectile pair */
static uint8_t death_timer = 0;      /* byte_A733: counts up 0..0x40 during the death sequence */
static uint8_t vertical_state = 0;   /* byte_A734: 0 = normal patrol; 0xFF = diving down (bit 0x80 set); 0x7F = climbing back up */
static uint8_t dive_delay = 0;       /* byte_A735: freeze-frame countdown before a triggered dive actually starts moving */
static uint8_t horiz_dir = 0;        /* byte_A736: 0 = patrolling left (decrementing boss_x); 0xFF = patrolling right (incrementing boss_x) */
static uint8_t cooldown = 0;         /* byte_A737: frames to skip the anim/projectile bookkeeping after firing a projectile pair */

/*
 * ============================================================================
 * Body-grid: byte_A738, a flat 336-byte (14 columns x 12 rows, 2 bytes
 * ["tile","anim"] per cell, 24 bytes per column) scratch buffer rebuilt
 * every frame by build_frame_sprite_list() and then copied out into
 * monsters_table as up to 14*12 hittable pseudo-monster sprites.
 * ============================================================================
 */
#define GRID_COLS   14
#define GRID_ROWS   12
#define GRID_STRIDE 24 /* 12 rows * 2 bytes/row */

static uint8_t body_grid[GRID_COLS * GRID_STRIDE]; /* byte_A738 */

/*
 * ============================================================================
 * Body-part layout (const, tile/anim pairs) and shape (mutable bit-mask)
 * tables, transcribed 1:1 from meda.asm.
 * ============================================================================
 */

/* unk_A5DC / unk_A606 : main body, 13 columns starting at grid (col 0, row 0) */
static const uint8_t layout_body1[42] = {
    0,7,  0,8,  0,9,  0,0,  0,2,  0,0x0A, 0,0x0B, 0,0x0C, 0,3,  1,7,
    0,4,  0,5,  1,9,  0,6,  0,0x0D, 0,0x0E, 0,0x0F, 0,1,  1,0,  1,1,  1,2
};
static uint8_t shape_body1[13] = { 0x2A,0x80,0x55,0x00,0x41,0x00,0x40,0x00,0x41,0x00,0x55,0x80,0x2A };

/* unk_A613 / unk_A623 : secondary body part, 11 columns starting at (col 1, row 8) */
static const uint8_t layout_body2[16] = {
    1,3, 1,4, 0x0E,2, 0x0E,0, 0x0E,1, 0x0E,3, 1,5, 1,6
};
static uint8_t shape_body2[11] = { 0xC0,0x10,0x40,0,0,0,0,0,0x40,0x10,0xC0 };

/* off_A62E : direction-dependent overlay layout, 6 tables (zones 0..5), 5 columns
 * starting at (col 4, row 3); all six share the single mutable mask below
 * (unk_A682), matching the original data layout exactly. */
static const uint8_t layout_dir0[12] = { 1,0x0A, 1,0x0D, 1,0x0B, 1,0x0E, 1,0x0C, 1,0x0F };
static const uint8_t layout_dir1[12] = { 2,0,    2,3,    2,1,    2,4,    2,2,    2,5    };
static const uint8_t layout_dir2[12] = { 2,6,    2,9,    2,7,    2,0x0A, 2,8,    2,0x0B };
static const uint8_t layout_dir3[12] = { 2,0x0C, 2,0x0F, 2,0x0D, 3,0,    2,0x0E, 3,1    };
static const uint8_t layout_dir4[12] = { 3,2,    3,5,    3,3,    3,6,    3,4,    3,7    };
static const uint8_t layout_dir5[12] = { 3,8,    3,0x0B, 3,9,    3,0x0C, 3,0x0A, 3,0x0D };
static const uint8_t *const direction_layout_tables[6] = {
    layout_dir0, layout_dir1, layout_dir2, layout_dir3, layout_dir4, layout_dir5
};
static uint8_t shape_direction[5] = { 0xA0, 0, 0xA0, 0, 0xA0 }; /* unk_A682 */

/* off_A687 / off_A6C7 : wing-flap animation overlay, 5 frames (byte_A730 0..4),
 * 5 columns starting at (col 4, row 7). The shape slots alias only 3
 * physical arrays -- deliberately preserved, see file header comment. */
static const uint8_t layout_wing0[10] = { 0x0E,6, 0x0E,4, 1,8, 0x0E,5, 0x0E,7 };
static const uint8_t layout_wing1[10] = { 0x0E,6, 0x0E,8, 3,0x0E, 0x0E,9, 0x0E,7 };
static const uint8_t layout_wing2[12] = { 0x0E,0x0C, 0x0E,0x0A, 0x0E,0x0D, 1,8, 0x0E,0x0B, 0x0E,7 };
static const uint8_t layout_wing3[12] = { 0x0E,6, 0x0E,0x0E, 0x0F,0, 1,8, 0x0E,0x0F, 0x0E,7 };
static const uint8_t layout_wing4[10] = { 0x0E,6, 0x0F,1, 1,8, 0x0F,2, 0x0E,7 };
static const uint8_t *const wing_layout_tables[5] = {
    layout_wing0, layout_wing1, layout_wing2, layout_wing3, layout_wing4
};
static uint8_t shape_wing_a[5] = { 0x10, 0x20, 0x80, 0x20, 0x10 }; /* unk_A6D1 */
static uint8_t shape_wing_b[5] = { 0x10, 0x30, 0x80, 0x20, 0x10 }; /* unk_A6D6 */
static uint8_t shape_wing_c[5] = { 0x10, 0x28, 0x80, 0x20, 0x10 }; /* unk_A6DB */
/* Deliberately aliased in slots 0,1,4 -- matches the original off_A6C7 layout exactly. */
static uint8_t *const wing_shape_tables[5] = {
    shape_wing_a, shape_wing_a, shape_wing_b, shape_wing_c, shape_wing_a
};

/* byte_A6ED : ceiling-height profile, indexed by (boss_x - 9), boss_x in [10,49] -> index in [1,40] */
static const uint8_t terrain_height_table[41] = {
    0x0C,0x0B,0x0A,9,8,
    7,7,7,7,7, 7,7,7,7,7, 7,7,7,7,7, 7,7,7,7,7,
    7,7,7,7,7, 7,7,7,7,7, 7,
    8,9,0x0A,0x0B,0x0C
};

/* byte_A6E0.. : fixed 13-byte (PROJECTILE_STRUCT_SIZE) projectile template; only
 * the first two bytes (x_rel, y) are patched per shot before spawning. */
static uint8_t projectile_template[13] = { 0,0, 0x30,0, 0x32,6, 0x50,0, 0,0,0,0,0 };

/*
 * ============================================================================
 * Forward declarations
 * ============================================================================
 */
static void apply_damage_to_boss(uint16_t damage);       /* sub_A575 */
static void death_sequence_step(void);                    /* loc_A5A6 */
static void update_boss_position(void);                   /* loc_A291 .. loc_A317 */
static void compute_direction_zone(void);                 /* sub_A358 */
static void fire_projectiles(void);                       /* sub_A3C1 */
static uint8_t boss_step_left(void);                       /* sub_A42B */
static uint8_t boss_step_right(void);                      /* sub_A41D */
static uint8_t boss_descend_one(void);                     /* sub_A412 */
static uint8_t boss_ascend_one(void);                      /* sub_A408 */
static void place_body_part(const uint8_t *layout, uint8_t *shape, uint8_t mask_count, uint8_t col_base, uint8_t row_base); /* sub_A539 */
static void build_frame_sprite_list(void);                 /* sub_A438 */

/*
 * Vista_AI_reset - clear all persistent static state so a fresh encounter
 * behaves correctly even after a save/restore cycle. (Not present as a
 * named export in meda.asm, added for parity with tako.c's Pulpo_AI_reset;
 * as in tako.c, the mutable shape/mask tables are intentionally NOT reset
 * here, matching that established precedent.)
 */
void Vista_AI_reset(void)
{
    active_sprite_count = 0;
    hit_flags = 0;
    direction_zone = 0;
    anim_frame = 0;
    death_timer = 0;
    vertical_state = 0;
    dive_delay = 0;
    horiz_dir = 0;
    cooldown = 0;
}

/*
 * Vista_AI - entry point, called once per frame.
 */
void Vista_AI(uint16_t m)
{
    (void)m; /* the boss AI ignores the generic monster-index parameter, as in Pulpo_AI */

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    active_sprite_count = 0;
    hit_flags = 0;

    /* Walk last frame's body-segment pseudo-monster entries: restore the
     * proximity-map tiles they overwrote, and pick up any hit flagged by
     * the external hit-detection code (ai_flags bit 0x40). Only the first
     * hit found this frame is kept. */
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
                    if (MEM8(si + 4) & 0x08) al |= 0x80; /* .flags: "heavy"/vulnerable segment */
                    hit_flags = al;
                }
            }
        }

        active_sprite_count++;
        si += 16;
    }

    /* Reset the sprite table; build_frame_sprite_list() repopulates it
     * fresh this frame. */
    si = base;
    MEM16(si) = 0xFFFF;

    uint8_t request = (uint8_t)(hit_flags & 0x1F);
    if (request != 0) {
        uint8_t stat = Get_Stats(request); /* "ah" damage stat */
        uint16_t damage = (uint16_t)(stat >> 3);

        if (request == 1 && MEM8(ADDR_SWORD_TYPE) >= 4) {
            damage = (uint16_t)(damage << 5); /* x32 total */
            MEM8(ADDR_SOUND_FX_REQUEST) = 0x2D;
        } else {
            MEM8(ADDR_SOUND_FX_REQUEST) = 0x2E;
        }

        apply_damage_to_boss(damage);
    }

    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        death_sequence_step();
        return;
    }

    /* --- normal, alive-and-well per-frame behavior --- */
    update_boss_position();
    compute_direction_zone();

    if (cooldown != 0) {
        cooldown--;
    } else {
        anim_frame++;
        if (anim_frame == 5) {
            cooldown = 3;
            anim_frame = 0;
        }
        if (anim_frame == 4) {
            fire_projectiles();
        }
    }

    build_frame_sprite_list();
}

/*
 * sub_A575 -> apply_damage_to_boss: subtract damage (clamped at 0), redraw
 * the health bar, and the first time HP reaches 0, start the death
 * sequence and hand off to the shared boss-death routine.
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
    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
    Browse_Projectiles();
}

/*
 * loc_A5A6: runs every frame once the boss has been struck down to 0 HP
 * (ADDR_BOSS_BEING_HIT set). Flashes and thrashes for 32 frames (still
 * following the normal movement/pose logic via build_frame_sprite_list()),
 * holds in the death pose (direction_zone = 5) for 32 more frames, then
 * signals death to the generic engine.
 */
static void death_sequence_step(void)
{
    if (death_timer >= 0x40) {
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;
    death_timer++;

    if (death_timer < 0x20) {
        anim_frame = 0;
        compute_direction_zone();
        build_frame_sprite_list();
        MEM8(ADDR_SOUND_FX_REQUEST) = 35;
        return;
    }

    direction_zone = 5;
    build_frame_sprite_list();
}

/*
 * loc_A291 .. loc_A317: normal (not being-hit) per-frame movement.
 *
 * While not chasing (vertical_state == 0): if the boss is at the very top
 * of its patrol (boss_y == 7) and the view center has drifted into a
 * narrow band just ahead of it, trigger a dive (arm a short delay, then
 * start descending). Either way, step boss_x one more notch along its
 * left/right patrol (flipping direction at the x=10 / x=49 limits), then
 * (re)derive boss_y from the fixed ceiling-height profile for the new
 * boss_x.
 *
 * While chasing (vertical_state != 0): count down the initial delay (still
 * deriving boss_y from the profile meanwhile); once it elapses, descend or
 * ascend one row per frame (depending on vertical_state bit 0x80),
 * switching to the ascend phase (0x7F) once the dive bottoms out, and
 * clearing back to 0 once fully back at the top -- in both of those cases
 * boss_y is left as just set by the descend/ascend step, NOT overwritten
 * by the profile lookup this frame.
 */
static void update_boss_position(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    int use_terrain_y = 1;

    if (vertical_state == 0) {
        if (MEM8(boss_state + 2) == 7) {
            uint16_t bx = (uint16_t)(MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + 0x10);
            if (bx >= MEM16(ADDR_MAP_WIDTH)) bx = (uint16_t)(bx - MEM16(ADDR_MAP_WIDTH));

            uint16_t bx_boss = MEM16(boss_state + 0);
            if ((uint16_t)(bx_boss + 4) < bx && (uint16_t)(bx_boss + 6) >= bx) {
                dive_delay = 3;
                vertical_state = 0xFF;
            }
        }

        if (horiz_dir == 0) {
            if (!boss_step_left()) horiz_dir = 0xFF;
        } else {
            if (!boss_step_right()) horiz_dir = 0;
        }
    } else {
        if (dive_delay != 0) {
            dive_delay--;
        } else {
            if (vertical_state & 0x80) {
                if (boss_descend_one()) vertical_state = 0x7F;
            } else {
                if (boss_ascend_one()) vertical_state = 0;
            }
            use_terrain_y = 0;
        }
    }

    if (use_terrain_y) {
        uint8_t idx = (uint8_t)(MEM8(boss_state + 0) - 9);
        MEM8(boss_state + 2) = terrain_height_table[idx];
    }
}

/* sub_A42B: step boss_x left by 1; returns 0 (and leaves boss_x unchanged) once the left patrol limit (x < 10) is hit */
static uint8_t boss_step_left(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    if (MEM8(boss_state + 0) < 10) return 0;
    MEM8(boss_state + 0)--;
    return 1;
}

/* sub_A41D: step boss_x right by 1; returns 0 (and leaves boss_x unchanged) once the right patrol limit (x >= 49) is hit */
static uint8_t boss_step_right(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    if (MEM8(boss_state + 0) >= 49) return 0;
    MEM8(boss_state + 0)++;
    return 1;
}

/* sub_A412: step boss_y down by 1; returns 1 once the dive has reached/passed its bottom limit (y >= 11) */
static uint8_t boss_descend_one(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint8_t y = (uint8_t)(MEM8(boss_state + 2) + 1);
    MEM8(boss_state + 2) = y;
    return (uint8_t)(y >= 11);
}

/* sub_A408: step boss_y up by 1; returns 1 once decremented strictly past the top row (y < 7), matching the original's overshoot-based detection */
static uint8_t boss_ascend_one(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint8_t y = (uint8_t)(MEM8(boss_state + 2) - 1);
    MEM8(boss_state + 2) = y;
    return (uint8_t)(y < 7);
}

/*
 * sub_A358: pick one of 5 direction zones describing where the (roughly)
 * view-centered reference x sits relative to boss_x, used to select which
 * body pose overlay build_frame_sprite_list() draws.
 */
static void compute_direction_zone(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t bx = (uint16_t)(MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + 0x10);
    if (bx >= MEM16(ADDR_MAP_WIDTH)) bx = (uint16_t)(bx - MEM16(ADDR_MAP_WIDTH));

    uint16_t boss_x = MEM16(boss_state + 0);

    if ((uint16_t)(boss_x + 1) < bx && (uint16_t)(boss_x + 10) >= bx) {
        direction_zone = 2;
        return;
    }

    if ((uint16_t)(boss_x - 6) < bx && (uint16_t)(boss_x + 17) >= bx) {
        direction_zone = ((uint16_t)(boss_x + 7) < (uint16_t)(bx + 1)) ? 3 : 1;
        return;
    }

    direction_zone = ((uint16_t)(boss_x + 7) < (uint16_t)(bx + 1)) ? 4 : 0;
}

/*
 * sub_A3C1: fire the boss's two-shot projectile volley (a fixed template,
 * only x_rel/y patched per shot); either or both shots are skipped if
 * their spawn point is currently outside the proximity viewport.
 */
static void fire_projectiles(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t boss_x = MEM16(boss_state + 0);
    uint8_t boss_y = MEM8(boss_state + 2);
    uint8_t rel;

    if (is_in_proximity_window((uint16_t)(boss_x + 6), &rel)) {
        projectile_template[0] = rel;
        projectile_template[1] = (uint8_t)((boss_y + 12) & 0x3F);
        Add_Projectile_To_Array(projectile_template);
    }

    if (!is_in_proximity_window((uint16_t)(boss_x + 7), &rel)) return;

    projectile_template[0] = rel;
    projectile_template[1] = (uint8_t)((boss_y + 10) & 0x3F);
    Add_Projectile_To_Array(projectile_template);
}

/*
 * sub_A539: consume mask_count mask bytes starting at *shape (rotating
 * each one left by 1 bit, MSB first), and for every bit that comes out
 * set, copy the next (tile, anim) pair from layout into the body grid at
 * the current flat cursor, advancing that cursor by one 2-byte cell every
 * bit (set or not) and by an extra 8 bytes after each mask byte -- i.e.
 * exactly 24 bytes (one full grid column) consumed per mask byte,
 * regardless of row_base. This is a flat pointer walk, not a
 * column-clamped one: reproduced exactly as in the original, including
 * any incidental spill of a mask byte's low bits into the next column
 * when row_base + 8 > GRID_ROWS (never actually exercised by the shipped
 * mask data, but preserved for fidelity).
 */
static void place_body_part(const uint8_t *layout, uint8_t *shape, uint8_t mask_count, uint8_t col_base, uint8_t row_base)
{
    uint8_t *di = &body_grid[(uint16_t)col_base * GRID_STRIDE + (uint16_t)row_base * 2];

    for (uint8_t i = 0; i < mask_count; i++) {
        for (uint8_t bit = 0; bit < 8; bit++) {
            uint8_t carry = (uint8_t)((*shape & 0x80) != 0);
            *shape = (uint8_t)((*shape << 1) | carry);
            if (carry) {
                di[0] = layout[0];
                di[1] = layout[1];
                layout += 2;
            }
            di += 2;
        }
        di += 8;
        shape += 1;
    }
}

/*
 * sub_A438: rebuild the 14x12 body grid from the 4 body-part overlays
 * (main body, secondary body part, direction-pose overlay, wing-flap
 * overlay), then walk it column by column, spawning a hittable
 * pseudo-monster sprite in monsters_table for every populated cell that
 * is currently within the proximity viewport, and patching the
 * proximity map / layer-2 backup exactly as the hit-detection loop in
 * Meda_AI() expects to find it next frame.
 */
static void build_frame_sprite_list(void)
{
    memset(body_grid, 0xFF, sizeof(body_grid));

    place_body_part(layout_body1, shape_body1, 13, 0, 0);
    place_body_part(layout_body2, shape_body2, 11, 1, 8);
    place_body_part(direction_layout_tables[direction_zone], shape_direction, 5, 4, 3);
    place_body_part(wing_layout_tables[anim_frame], wing_shape_tables[anim_frame], 5, 4, 7);

    active_sprite_count = 0;

    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t di = MEM16(ADDR_MONSTERS_LIST);
    uint16_t col_x = MEM16(boss_state + 0);
    const uint8_t *grid = body_grid;

    for (uint8_t col = 0; col < GRID_COLS; col++) {
        uint8_t rel;
        int in_range = is_in_proximity_window(col_x, &rel);

        for (uint8_t row = 0; row < GRID_ROWS; row++) {
            const uint8_t *cell = grid + row * 2;

            if (in_range && cell[0] != 0xFF) {
                MEM16(di + 0) = col_x;                                               /* .currX */
                MEM8(di + 2) = (uint8_t)((MEM8(boss_state + 2) + row) & 0x3F);       /* .currY */
                MEM8(di + 3) = rel;                                                   /* .m_x_rel */
                MEM8(di + 4) = cell[0];                                               /* .flags <- tile idx */
                MEM8(di + 6) = cell[1];                                               /* .anim_counter */
                MEM8(di + 5) = hit_flags ? 0x20 : 0x00;                               /* .ai_flags: hit-flash */

                uint16_t px = coords_to_prox_addr(MEM8(di + 3), MEM8(di + 2));
                uint8_t old_tile = MEM8(px);
                MEM8(px) = (uint8_t)(active_sprite_count | 0x80);
                MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

                di += 16;
                active_sprite_count++;
            }
        }

        col_x++;
        grid += GRID_STRIDE;
    }

    MEM16(di) = 0xFFFF;
}
