/*
 * crab.c - translated from crab.asm ("Cangrejo" boss AI)
 *
 * This is a boss-encounter overlay module, structurally similar to the
 * eai*.asm monster-AI overlays: it is loaded at a fixed segment
 * address and exports an entry point (Cangrejo_AI_proc) plus a shared
 * "boss_state_block" injected by game.js, that
 * generic engine uses elsewhere (health bar, victory/reward handling,
 * name display) reads via a fixed offset, regardless of which specific
 * boss module is currently loaded.
 *
 * Scope of this translation
 * ------------------------------------------------------------------
 * This file translates the AI/gameplay logic only.
 * The following are NOT translated, since they are sprite/animation
 * *asset* data read by a separate, generic boss-rendering routine
 * (via fixed offsets into this overlay, exactly like eai2.asm's frame
 * tables), not consumed by the AI logic itself:
 *   - the "start:" export header and its reserved padding
 *   - encounter_hp_table
 *   - anim_frame_table_ptrs0_8 / anim_frame_table_ptrs9_15
 *   - left_eye_frames .. acid_drop_frames (all per-part pixel/tile
 *     frame tables)
 * The body_state_to_layout_table / crab_layout_normal /
 * crab_layout_acid_drip tables ARE translated, since render_body_entities
 * uses them directly to decide which of the boss's 6x10 body-part
 * slots produce a hittable pseudo-monster sprite this frame.
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - Each visible boss body-part occupies a temporary entry in the
 *   shared monsters_table (the same array real monsters live in), so
 *   the hero's generic weapon/hit-detection code can hit the boss
 *   using the same machinery as any other monster. These pseudo-
 *   monster entries reuse the familiar field offsets:
 *       +0 currX (word)   +2 currY   +3 m_x_rel   +4 flags
 *       +5 ai_flags        +6 anim_counter
 *   - here "+4 flags" is repurposed to hold a sprite/tile index
 *     rather than a monster type, and "+5 ai_flags" bit 0x20 is set
 *     by us to request a hit-flash, while bit 0x40 is set by the
 *     external hit-detection code to tell us a part was struck.
 * - "si"/"di" pointers from the original are modeled as plain
 *   uint16_t addresses into the flat MEM8/MEM16 address space, exactly
 *   as in eai1.c/eai2.c.
 * - boss_state_block's own fields (boss_x, boss_hp, body_anim_state,
 *   the various phase-flag and step-index fields, etc.) are
 *   shared data MEM8-addressed.
 * - Local helpers that the original tested with jb/jnb (carry) return
 *   an int that IS the carry flag, exactly as in eai1.c/eai2.c.
 * - is_in_proximity_window, Get_Stats, Draw_Boss_Health, and the various
 *   ADDR_* absolute addresses (monsters table base, proximity second
 *   layer, sound FX request, boss-being-hit/boss-is-dead flags, map
 *   width, proximity map left column) are assumed declared elsewhere
 *   (zeliard.h), same as coords_to_prox_addr / is_blocking / etc. in
 *   the earlier files.
 */

#include "zeliard.h"

static uint8_t active_sprite_count = 0;
static uint8_t hit_monster_flags = 0;
/* Packed: bit 7 = hit part's monster.flags & 0x10 (facing left);
 * bits 4-0 = ai_flags & 0x1F of the part that was hit this frame.
 * Non-zero means a part was struck this frame. */
static uint8_t body_anim_state = 0;
/* Selects which body column-layout table to use (0-8 -> crab_layout_normal;
 * 9 -> crab_layout_acid_drip). Also drives the leg-cycle animation:
 * increments 0->5 while moving right, decrements 5->0 while moving left. */
static uint8_t crab_entity_row = 0;
static uint8_t movement_direction_flag = 0; // 0x00 = toward min X (left); 0xFF = toward max X (right)
static uint8_t movement_tick_counter = 0;
static uint8_t phase_acid_dropping = 0;      // 0xFF while the acid-drop approach is active
static uint8_t acid_step_index = 0;           // 1..8 into acid_approach_body_states
static uint8_t phase_recoil = 0;               // 0xFF while post-drop recoil is active
static uint8_t recoil_step_index = 0;           // 0..3 into recoil_body_states
static uint8_t phase_placing_droplet = 0;        // 0xFF once the boss has committed to a drop position
static uint8_t descent_seq_index = 0;             // index into acid_descent_sequence
static uint8_t phase_spawning_droplet = 0;         // 0xFF while an acid droplet is being spawned
static uint8_t spawn_seq_index = 0;                 // index into acid_droplet_spawn_sequence
static uint16_t droplet_target_x = 0;
static uint8_t  droplet_target_y = 0;
static uint8_t death_timer = 0; // counts up during the death sequence


/*
 * Body-part hit-test layout tables (used directly by render_body_entities)
 */
static const uint8_t crab_layout_normal[60] = {
    0xFF,0xFF,0xFF,0x00,0xFF,0x01,0xFF,0xFF,0xFF,0xFF,
    0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,
    0x02,0xFF,0x03,0xFF,0x04,0xFF,0x05,0xFF,0x06,0xFF,
    0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,
    0x07,0xFF,0x10,0xFF,0x11,0xFF,0x12,0xFF,0x08,0xFF,
    0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF
};
static const uint8_t crab_layout_acid_drip[60] = {
    0xFF,0xFF,0xFF,0xFF,0x00,0xFF,0xFF,0xFF,0xFF,0xFF,
    0xFF,0xFF,0x03,0xFF,0xFF,0xFF,0x05,0xFF,0xFF,0xFF,
    0x02,0xFF,0xFF,0xFF,0x14,0xFF,0xFF,0xFF,0x06,0xFF,
    0xFF,0xFF,0x90,0xFF,0xFF,0xFF,0x12,0xFF,0xFF,0xFF,
    0xFF,0x07,0xFF,0xFF,0xFF,0xFF,0xFF,0x08,0xFF,0xFF,
    0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF
};
static const uint8_t *body_state_to_layout_table[10] = {
    crab_layout_normal, crab_layout_normal, crab_layout_normal,
    crab_layout_normal, crab_layout_normal, crab_layout_normal,
    crab_layout_normal, crab_layout_normal, crab_layout_normal,
    crab_layout_acid_drip
};

static const uint8_t acid_approach_body_states[8] = { 7,7,8,8,8,8,8,6 };
static const uint8_t acid_descent_sequence[14] = {
    0xF1,0xF1,0xF1,0xF1,0xF1,0xF8,0xF8,0xF8,0xF2,0xF2,0xF2,0xF2,0xF2,0xFF
};
static const uint8_t recoil_body_states[4] = { 7,8,8,0 };
static const uint8_t acid_droplet_spawn_sequence[10] = {
    0x80,0x80,0x80,0x80,0x80,0x81,0x82,0x03,0x04,0xFF
};


/*
 * Forward declarations
 */
static int  boss_move_left(void);
static int  boss_move_right(void);
static void start_acid_approach(void);      // loc_A45C
static void acid_approach_step(void);        // loc_A466
static void trigger_acid_drop(void);          // trigger_acid_drop / loc_A4B9
static void begin_recoil(void);                // begin_recoil / loc_A5D3
static void death_sequence_handler(void);
static void apply_damage_to_boss(uint16_t damage);
static void render_body_entities(void);         // + render_droplets_entities continuation


/*
 * Cangrejo_AI - entry point, called once per frame.
 */
void Cangrejo_AI(uint16_t m)
{
    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    active_sprite_count = 0;
    hit_monster_flags = 0;

    /* Walk last frame's boss-part pseudo-monster entries: restore the
     * proximity-map tiles they overwrote, and pick up any hit flagged
     * by the external hit-detection code (ai_flags bit 0x40). */
    for (;;) {
        if (MEM16(si + 0) == 0xFFFF) break; // .currX sentinel: end of list

        uint8_t rel;
        if (is_in_proximity_window(MEM16(si + 0), &rel)) {
            MEM8(si + 3) = rel; // .m_x_rel

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); // .m_x_rel, .currY
            MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count);

            if (MEM8(si + 5) & 0x40) { // .ai_flags: this part was hit this frame
                if (!(hit_monster_flags & 0x80)) { // only record the first hit found
                    uint8_t al = (uint8_t)(MEM8(si + 5) & 0x1F);
                    if (MEM8(si + 4) & 0x10) al |= 0x80; // .flags: facing left
                    hit_monster_flags = al;
                }
            }
        }

        active_sprite_count++;
        si += 16;
    }

    /* Reset the sprite table; render_body_entities() will repopulate it
     * fresh this frame. */
    si = base;
    MEM16(si) = 0xFFFF;

    if (!MEM8(ADDR_BOSS_BEING_HIT) && hit_monster_flags != 0) {
        uint8_t al = hit_monster_flags;
        uint8_t stat = Get_Stats((uint8_t)(al & 0x1F)); // assumed to return the "ah" damage stat
        uint16_t damage = (uint16_t)stat << 2;
        if (al & 0x80) damage <<= 1;

        apply_damage_to_boss(damage);
        MEM8(ADDR_SOUND_FX_REQUEST) = 34;

        uint16_t bound = (uint16_t)(MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + 12);
        uint16_t map_w = MEM16(ADDR_MAP_WIDTH);
        if (bound >= map_w) bound = map_w;

        uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
        if ((MEM16(boss_state + 0) + 5) < bound) { // .boss_x
            boss_move_left();
            boss_move_left();
        } else {
            boss_move_right();
            boss_move_right();
        }
    }

    if (phase_placing_droplet) { trigger_acid_drop(); return; }
    if (phase_recoil) { begin_recoil(); return; }
    if (MEM8(ADDR_BOSS_BEING_HIT)) { death_sequence_handler(); return; }
    if (phase_acid_dropping) { acid_approach_step(); return; }

    if ((get_random() & 7) == 0) {
        start_acid_approach();
        return;
    }

    if (movement_direction_flag == 0) { // moving left
        movement_tick_counter++;
        if (movement_tick_counter & 1) { render_body_entities(); return; }

        if (boss_move_left()) { // blocked at the left bound
            movement_direction_flag = 0xFF;
        }
        body_anim_state++;
        if (body_anim_state >= 6) body_anim_state = 0;
        render_body_entities();
    } else { // moving right
        movement_tick_counter++;
        if (movement_tick_counter & 1) { render_body_entities(); return; }

        if (boss_move_right()) { // blocked at the right bound
            movement_direction_flag = 0;
        }
        body_anim_state--;
        if (body_anim_state == 0xFF) body_anim_state = 5;
        render_body_entities();
    }
}

/* boss_move_left: returns 1 if blocked (already at the minimum X, 16),
 * 0 if it stepped one column left. */
static int boss_move_left(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    if (MEM16(boss_state + 0) != 16) { // .boss_x
        MEM16(boss_state + 0)--;
        return 0;
    }
    return 1;
}

/* boss_move_right: returns 1 if blocked (already at the maximum X, 49),
 * 0 if it stepped one column right. */
static int boss_move_right(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    if (MEM16(boss_state + 0) != 49) { // .boss_x
        MEM16(boss_state + 0)++;
        return 0;
    }
    return 1;
}

/* loc_A45C: begin the acid-drop approach sequence. */
static void start_acid_approach(void)
{
    acid_step_index = 0;
    phase_acid_dropping = 0xFF;
    acid_approach_step(); // the original falls straight through into loc_A466
}

/* loc_A466: per-frame step of the acid-drop approach animation. */
static void acid_approach_step(void)
{
    acid_step_index++;
    if (acid_step_index == 8) {
        trigger_acid_drop();
        return;
    }
    body_anim_state = acid_approach_body_states[acid_step_index];
    render_body_entities();
}

/* trigger_acid_drop: fires once when the approach animation completes
 * (acid_step_index==8), then loc_A4B9 is re-entered every subsequent
 * frame while phase_placing_droplet is active. */
static void trigger_acid_drop(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    if (!phase_placing_droplet) {
        /* first entry: trigger_acid_drop proper - pick a target column
         * and initial movement direction, then fall through */
        uint16_t left_plus_12 = (uint16_t)(MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) + 12);
        uint16_t map_w = MEM16(ADDR_MAP_WIDTH);
        uint16_t bound = (left_plus_12 < map_w) ? map_w : (uint16_t)(left_plus_12 - map_w);

        movement_direction_flag = ((MEM16(boss_state + 0) + 5) < bound) ? 0xFF : 0x00; // .boss_x
        phase_acid_dropping = 0;
        descent_seq_index = 0;
        phase_placing_droplet = 0xFF;
    }

    /* loc_A4B9: per-tick descent step */
    body_anim_state = 9;

    uint8_t seq = acid_descent_sequence[descent_seq_index];
    if (seq == 0xFF) {
        begin_recoil();
        return;
    }

    uint8_t nibble = seq & 0x0F;
    if (nibble != 8) {
        uint8_t shifted = nibble >> 1;
        uint8_t carry_out = nibble & 1;
        uint8_t step = (uint8_t)(shifted - carry_out);
        MEM8(boss_state + 2) = ((MEM8(boss_state + 2) + step) & 0x3F);
    }

    if (seq & 0xF0) {
        if (movement_direction_flag != 0) {
            boss_move_right();
        } else {
            boss_move_left();
        }
    }

    render_body_entities();
    descent_seq_index++;
}

/* begin_recoil: fires once when the descent sequence hits its 0xFF
 * terminator, then loc_A5D3 is re-entered every subsequent frame while
 * phase_recoil is active. */
static void begin_recoil(void)
{
    if (!phase_recoil) {
        movement_direction_flag = (uint8_t)~movement_direction_flag;
        phase_placing_droplet = 0;
        recoil_step_index = 0;
        phase_recoil = 0xFF;
    }

    body_anim_state = recoil_body_states[recoil_step_index];
    recoil_step_index++;
    if (recoil_step_index == 4) {
        phase_recoil = 0;
    }
    render_body_entities();
}

/* death_sequence_handler: runs every frame once the boss has been
 * struck down to 0 HP (ADDR_BOSS_BEING_HIT set). */
static void death_sequence_handler(void)
{
    if (death_timer >= 0x28) {
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    if (death_timer < 0x1E && !(death_timer & 1)) {
        MEM8(ADDR_SOUND_FX_REQUEST) = 35;
    }

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;

    if (death_timer >= 0x14) {
        death_timer++;
        body_anim_state = 8;
        render_body_entities();
        return;
    }

    death_timer++;
    if (movement_direction_flag != 0) {
        /* wiggle the body back down */
        body_anim_state--;
        if (body_anim_state == 0xFF) {
            body_anim_state = 0;
            movement_direction_flag = 0;
        }
    } else {
        /* wiggle the body up */
        body_anim_state++;
        if (body_anim_state >= 6) {
            body_anim_state = 5;
            movement_direction_flag = 0xFF;
        }
    }
    render_body_entities();
}

/* apply_damage_to_boss: subtract damage (clamped at 0), redraw the
 * health bar, and start the death sequence the first time HP reaches 0. */
static void apply_damage_to_boss(uint16_t damage)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    int16_t hp = MEM16(boss_state + 3) - damage; // .boss_hp
    if (hp < 0) hp = 0;
    MEM16(boss_state + 3) = (uint16_t)hp;

    Draw_Boss_Health();

    if (MEM16(boss_state + 3) != 0) return;

    if (MEM8(ADDR_BOSS_BEING_HIT)) return; // death sequence already started

    death_timer = 0;
    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
}

/* render_body_entities: lay out the boss's 6 body rows x 10 columns
 * using the layout table selected by body_anim_state, turning each
 * non-0xFF cell into a hittable pseudo-monster sprite entry. Falls
 * through (render_droplets_entities) into the acid-droplet spawn/placement logic. */
static void render_body_entities(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    const uint8_t *layout = body_state_to_layout_table[body_anim_state];
    crab_entity_row = MEM8(boss_state + 2); // .boss_y

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;
    active_sprite_count = 0;

    for (uint8_t row = 0; row < 6; row++) {
        const uint8_t *row_layout = layout + (uint16_t)row * 10;
        uint16_t col_x = MEM16(boss_state + 0); // .boss_x

        for (uint8_t col = 0; col < 10; col++) {
            MEM16(si + 0) = col_x; // .currX (tentative)

            uint8_t rel;
            if (is_in_proximity_window(col_x, &rel)) {
                uint8_t tile = row_layout[col];
                if (tile != 0xFF) {
                    MEM8(si + 4) = tile;             // .flags <- part/tile index
                    MEM8(si + 2) = crab_entity_row; // .currY
                    MEM8(si + 3) = rel;                  // .m_x_rel
                    MEM8(si + 5) = (hit_monster_flags != 0) ? 0x20 : 0x00; // .ai_flags: hit-flash
                    MEM8(si + 6) = body_anim_state;        // .anim_counter

                    uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); // .m_x_rel, .currY
                    uint8_t old_tile = MEM8(di);
                    MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
                    MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

                    active_sprite_count++;
                    si += 16;
                }
            }

            col_x++;
        }

        crab_entity_row = (uint8_t)((crab_entity_row + 1) & 0x3F);
    }

    MEM16(si) = 0xFFFF; // terminator after the last written sprite

    /* --- render_droplets_entities: acid-droplet spawn/placement continuation --- */
    if (!phase_spawning_droplet) {
        if (!phase_placing_droplet) {
            return;
        }
        /* placing_droplet: find the boss's dedicated acid-droplet visual
        * entry (a fixed monster.flags == 0x14 "boss prop" placed by
        * the room/engine setup elsewhere) and drive its animation
        * from the descent sequence. */
        uint16_t di = base;
        while (MEM8(di + 4) != 0x14) { // .flags
            di += 16;
        }
        MEM8(di + 6) = descent_seq_index; // .anim_counter
        if (descent_seq_index != 4) return;

        spawn_seq_index = 0;
        phase_spawning_droplet = 0xFF;
        droplet_target_x = (MEM16(boss_state + 0) + 4);
        droplet_target_y = ((MEM8(boss_state + 2) + 3) & 0x3F);
    }

    // spawn_tick: 
    uint8_t seq = acid_droplet_spawn_sequence[spawn_seq_index];
    spawn_seq_index++;
    if (seq == 0xFF) {
        phase_spawning_droplet = 0;
        return;
    }
    if (seq & 0x80) {
        droplet_target_y = (uint8_t)((droplet_target_y + 1) & 0x3F);
    }

    uint8_t rel;
    if (!is_in_proximity_window(droplet_target_x, &rel)) return; // out of range: skip this tick

    MEM16(si + 0) = droplet_target_x;     // .currX
    MEM8(si + 2) = droplet_target_y;      // .currY
    MEM8(si + 3) = rel;                   // .m_x_rel
    MEM8(si + 4) = 0x35;                  // .flags: droplet sprite/tile index
    MEM8(si + 6) = (uint8_t)(seq & 0x7F); // .anim_counter
    MEM8(si + 5) = 0;                     // .ai_flags
    MEM16(si + 16) = 0xFFFF;            // fresh terminator right after this entry

    uint16_t addr = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); // .m_x_rel, .currY
    uint8_t old_tile = MEM8(addr);
    MEM8(addr) = (uint8_t)(active_sprite_count | 0x80);
    MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;
}
