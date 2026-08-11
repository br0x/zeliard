/*
 * mao2.c - translated from mao2.asm (Jashiin / Mao, room 2)
 *
 * Gameplay/AI translation only.  The large A030/A070 sprite-group tables at
 * the start of the overlay are renderer asset data and are intentionally not
 * reproduced here.  The body-layout and body-mask tables below ARE included,
 * because Mao2_AI_proc reads them directly to assemble the boss's 6x9
 * pseudo-monster collision/render grid.
 *
 * Conventions follow the existing boss ports (notably tako.c):
 *   - boss_state_block is reached through ADDR_BOSS_STATE_PTR
 *   - boss_x is a word at +0, boss_y a byte at +2, boss_hp a word at +3
 *   - boss body/attack parts are temporary 16-byte monster-table entries
 *   - proximity layer 2 is restored at the start of every frame
 *   - ai_flags bit 0x40 means "hit by external collision code"
 *   - ai_flags bit 0x20 requests hit flash
 *
 * The original uses byte_FF21 as the one-time encounter-start latch.  It is
 * not named in the supplied zeliard.h, so this translation accesses 0xFF21
 * directly.
 */

#include "zeliard.h"

#define ADDR_MAO2_START_LATCH 0xFF21

/* ---- persistent state: byte_AC1B .. byte_AC38 ---- */
static uint8_t anim_index;             /* AC1B */
static uint8_t active_sprite_count;    /* AC1C */
static uint8_t hit_flags;              /* AC1D */
static uint8_t facing_left;            /* AC1E: 00 / FF */
static uint8_t rel_x;                  /* AC1F */
static uint8_t death_timer;            /* AC20 */
static uint8_t encounter_started;      /* AC21 */
static uint8_t tile_flags_or;           /* AC22: normally 0, sometimes 0x60 */
static uint8_t intro_active;           /* AC23 */
static uint8_t intro_variant;          /* AC24: 0/1 */
static uint8_t intro_counter;          /* AC25 */
static uint16_t append_ptr;            /* AC26 */
static uint8_t shot1_active;           /* AC28 */
static uint8_t shot1_x;                /* AC29 */
static uint8_t shot1_y;                /* AC2A */
static uint8_t shot1_facing;           /* AC2B */
static uint8_t shot1_age;              /* AC2C */
static uint8_t shot2_active;           /* AC2D */
static uint8_t shot2_x;                /* AC2E */
static uint8_t shot2_y;                /* AC2F */
static uint8_t shot2_facing;           /* AC30 */
static uint8_t shot2_age;              /* AC31 */
static uint8_t regen_phase;            /* AC32 */
static uint8_t jump_active;            /* AC33 */
static uint8_t jump_step;              /* AC34 */
static uint8_t moved_this_frame;       /* AC35 */
static uint8_t attack_anim_active;     /* AC36 */
static uint8_t attack_anim_step;       /* AC37 */
static uint8_t regen_timer;            /* AC38 */

static uint8_t body_grid[54];           /* AC39..AC6E: 6 columns x 9 bytes */

/* AC46F */
static const uint8_t intro_anim_table[10] = {
    0, 0, 7, 7, 9, 10, 10, 11, 11, 12
};

/*
 * AC666.  Each jump step is 3 bytes:
 *   horizontal-motion flag, signed Y delta, animation index.
 * The byte immediately after each triple is also the first byte of the next
 * triple; the assembly tests [bx+3] for 0x80 to detect the sentinel after the
 * final triple.
 */
static const uint8_t jump_table[] = {
    0,  0, 4,
    0,  0, 4,
    0, -2, 5,
    1, -2, 5,
    1, -2, 5,
    1,  0, 6,
    1,  0, 6,
    1,  0, 6,
    1,  2, 6,
    1,  2, 6,
    1,  2, 6,
    0,  0, 4,
    0,  0, 4,
    0,  0, 0,
    0x80
};

/* ------------------------------------------------------------------------- */
/* Body layout tables read directly by sub_A939.                             */
/* Left-facing layouts: off_A957                                             */
/* ------------------------------------------------------------------------- */
static const uint8_t L0[]  = {0x02,0x06,0x04,0x00,0x01,0x03,0x05,0x07};
static const uint8_t L1[]  = {0x02,0x00,0x01,0x08,0x09,0x0A,0x0B};
static const uint8_t L2[]  = {0x10,0x12,0x11,0x00,0x0C,0x0D,0x0E,0x0F};
static const uint8_t L3[]  = {0x16,0x17,0x00,0x0C,0x13,0x14,0x15};
static const uint8_t L4[]  = {0x02,0x1A,0x1B,0x00,0x01,0x18,0x19,0x1C};
static const uint8_t L5[]  = {0x02,0x22,0x23,0x00,0x01,0x1D,0x1E,0x20};
static const uint8_t L6[]  = {0x02,0x1A,0x00,0x01,0x18,0x24,0x25};
static const uint8_t L7[]  = {0x27,0x28,0x06,0x04,0x00,0x26,0x03,0x05,0x07};
static const uint8_t L8[]  = {0x2B,0x2A,0x06,0x04,0x00,0x29,0x03,0x05,0x07};
static const uint8_t L9[]  = {0x2D,0x2C,0x06,0x04,0x00,0x29,0x03,0x05,0x07};
static const uint8_t L10[] = {0x31,0x32,0x00,0x01,0x2E,0x2F,0x30};
static const uint8_t L11[] = {0x27,0x33,0x32,0x00,0x26,0x2E,0x2F,0x30};
static const uint8_t L12[] = {0x2B,0x2A,0x34,0x32,0x00,0x29,0x2E,0x2F,0x30};
static const uint8_t L13[] = {0x36,0x2C,0x35,0x32,0x00,0x29,0x2E,0x2F,0x30};

static const uint8_t *const left_layouts[14] = {
    L0,L1,L2,L3,L4,L5,L6,L7,L8,L9,L10,L11,L12,L13
};

/* Right-facing layouts: off_A9E4 */
static const uint8_t R0[]  = {0x05,0x00,0x01,0x03,0x04,0x06,0x02,0x07};
static const uint8_t R1[]  = {0x0B,0x00,0x01,0x08,0x09,0x0A,0x02};
static const uint8_t R2[]  = {0x0F,0x00,0x0C,0x0D,0x0E,0x11,0x10,0x12};
static const uint8_t R3[]  = {0x00,0x0C,0x13,0x14,0x15,0x17,0x16};
static const uint8_t R4[]  = {0x1C,0x00,0x01,0x18,0x19,0x1A,0x1B,0x02};
static const uint8_t R5[]  = {0x22,0x00,0x01,0x1D,0x1E,0x20,0x21,0x02};
static const uint8_t R6[]  = {0x00,0x01,0x18,0x24,0x25,0x1A,0x02};
static const uint8_t R7[]  = {0x05,0x00,0x26,0x03,0x04,0x06,0x27,0x28,0x07};
static const uint8_t R8[]  = {0x05,0x00,0x29,0x03,0x04,0x06,0x2A,0x07,0x2B};
static const uint8_t R9[]  = {0x05,0x00,0x29,0x03,0x04,0x06,0x2C,0x07,0x2D};
static const uint8_t R10[] = {0x30,0x00,0x01,0x2E,0x2F,0x31,0x32};
static const uint8_t R11[] = {0x30,0x00,0x26,0x2E,0x2F,0x27,0x33,0x32};
static const uint8_t R12[] = {0x30,0x00,0x29,0x2E,0x2F,0x2A,0x34,0x32,0x2B};
static const uint8_t R13[] = {0x30,0x00,0x29,0x2E,0x2F,0x2C,0x35,0x32,0x36};

static const uint8_t *const right_layouts[14] = {
    R0,R1,R2,R3,R4,R5,R6,R7,R8,R9,R10,R11,R12,R13
};

/*
 * Shape masks.  Six bytes per animation, one per body column.  sub_A939
 * rotates each byte eight times, so the net value after a complete call is
 * unchanged; scanning MSB-first is therefore equivalent and avoids writable
 * copies while preserving the generated grid exactly.
 */
static const uint8_t left_masks[14][6] = {
    {0x00,0x00,0x11,0x04,0xAA,0x01},
    {0x00,0x00,0x10,0x00,0xAB,0x01},
    {0x00,0x00,0x09,0x02,0xAA,0x01},
    {0x00,0x00,0x10,0x04,0xAB,0x00},
    {0x00,0x00,0x08,0x03,0x55,0x01},
    {0x00,0x00,0x10,0x05,0xAA,0x02},
    {0x00,0x00,0x10,0x04,0xAB,0x00},
    {0x00,0x00,0x31,0x04,0xAA,0x01},
    {0x40,0x00,0x41,0x04,0xAA,0x01},
    {0x00,0x10,0x21,0x04,0xAA,0x01},
    {0x00,0x00,0x05,0x00,0x2B,0x01},
    {0x00,0x00,0x0D,0x00,0x2B,0x01},
    {0x10,0x00,0x15,0x00,0x2B,0x01},
    {0x00,0x04,0x0D,0x00,0x2B,0x01},
};

static const uint8_t right_masks[14][6] = {
    {0x01,0xAA,0x04,0x11,0x00,0x00},
    {0x01,0xAB,0x00,0x10,0x00,0x00},
    {0x01,0xAA,0x02,0x09,0x00,0x00},
    {0x00,0xAB,0x04,0x10,0x00,0x00},
    {0x01,0x55,0x03,0x08,0x00,0x00},
    {0x02,0xAA,0x05,0x10,0x00,0x00},
    {0x00,0xAB,0x04,0x10,0x00,0x00},
    {0x01,0xAA,0x04,0x31,0x00,0x00},
    {0x01,0xAA,0x04,0x41,0x00,0x40},
    {0x01,0xAA,0x04,0x21,0x10,0x00},
    {0x01,0x2B,0x00,0x05,0x00,0x00},
    {0x01,0x2B,0x00,0x0D,0x00,0x00},
    {0x01,0x2B,0x00,0x15,0x00,0x10},
    {0x01,0x2B,0x00,0x0D,0x04,0x00},
};

/* ---- helpers ---- */
static void damage_boss(uint16_t damage);
static void maybe_regenerate(void);
static void death_sequence(void);
static void choose_spawn_position(void);
static uint8_t move_left_one(void);   /* returns original carry: 1 = blocked */
static uint8_t move_right_one(void);  /* returns original carry: 1 = blocked */
static void start_shot1(void);
static void start_shot2(void);
static void build_body_grid(void);
static void render_body_and_attacks(void);
static void render_attack_entities(void);
static void active_phase(void);

static inline uint16_t boss_state(void) { return MEM16(ADDR_BOSS_STATE_PTR); }
static inline uint16_t boss_x_get(void) { return MEM16(boss_state() + 0); }
static inline void boss_x_set(uint16_t v) { MEM16(boss_state() + 0) = v; }
static inline uint8_t boss_y_get(void) { return MEM8(boss_state() + 2); }
static inline void boss_y_set(uint8_t v) { MEM8(boss_state() + 2) = v; }
static inline uint16_t boss_hp_get(void) { return MEM16(boss_state() + 3); }
static inline void boss_hp_set(uint16_t v) { MEM16(boss_state() + 3) = v; }

void Jashiin2_AI_reset(void)
{
    anim_index = 0;
    active_sprite_count = 0;
    hit_flags = 0;
    facing_left = 0;
    rel_x = 0;
    death_timer = 0;
    encounter_started = 0;
    tile_flags_or = 0;
    intro_active = 0;
    intro_variant = 0;
    intro_counter = 0;
    append_ptr = 0;
    shot1_active = 0;
    shot1_x = shot1_y = shot1_facing = shot1_age = 0;
    shot2_active = 0;
    shot2_x = shot2_y = shot2_facing = shot2_age = 0;
    regen_phase = 0;
    jump_active = jump_step = moved_this_frame = 0;
    attack_anim_active = attack_anim_step = regen_timer = 0;
    for (uint8_t i = 0; i < sizeof(body_grid); ++i) body_grid[i] = 0;
}

void Jashiin2_AI(uint16_t m)
{
    (void)m;

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;

    active_sprite_count = 0;
    hit_flags = 0;

    /* Restore every pseudo-monster tile left by the previous frame and
       capture at most the first hit. */
    for (;;) {
        if (MEM16(si + 0) == 0xFFFF) break;

        uint8_t xrel;
        if (is_in_proximity_window(MEM16(si + 0), &xrel)) {
            MEM8(si + 3) = xrel;

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
            MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count);

            if (!(hit_flags & 0x80) && (MEM8(si + 5) & 0x40)) {
                uint8_t al = (uint8_t)(MEM8(si + 5) & 0x1F);

                /* A body cell whose tile flags low 5 bits are zero AND whose
                   animation counter low nibble is zero is the special hit
                   class marked by bit 7 in the original. */
                if ((MEM8(si + 4) & 0x1F) == 0 &&
                    (MEM8(si + 6) & 0x0F) == 0) {
                    al |= 0x80;
                }
                hit_flags = al;
            }
        }

        active_sprite_count++;
        si += 16;
    }

    MEM16(base) = 0xFFFF;
    append_ptr = base;
    active_sprite_count = 0;

    if (hit_flags != 0) {
        uint8_t request = (uint8_t)(hit_flags & 0x1F);
        uint16_t damage = (uint16_t)(Get_Stats(request) >> 1);

        /* Exact assembly behavior: only AL == 1 avoids the second shift.
           A special-class hit has bit 7 set, so it necessarily takes the
           second shift too. */
        if (hit_flags != 1) damage >>= 1;

        damage_boss(damage);
        MEM8(ADDR_SOUND_FX_REQUEST) = 57;

        if (boss_hp_get() < 200)
            regen_phase = 0xFF;
    }

    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        death_sequence();
        return;
    }

    /* One-time encounter latch from byte_FF21. */
    if (!encounter_started) {
        if (MEM8(ADDR_MAO2_START_LATCH))
            encounter_started = 0xFF;
        return;
    }

    if (regen_phase) {
        active_phase();
        return;
    }

    if (!intro_active) {
        if (shot1_active || shot2_active) {
            render_attack_entities();
            return;
        }

        choose_spawn_position();
        intro_counter = 0;
        intro_active = 0xFF;
        intro_variant = (uint8_t)((get_random() >> 7) & 1);
    }

    intro_counter++;

    if (intro_counter < 6) {
        if (intro_counter & 1) {
            render_attack_entities();
            return;
        }

        MEM8(ADDR_SOUND_FX_REQUEST) = 59;
        tile_flags_or = 0x60;
        anim_index = (uint8_t)(intro_variant * 10);
        render_body_and_attacks();
        return;
    }

    if (intro_counter < 11) {
        uint8_t idx = (uint8_t)((intro_variant * 5) + (intro_counter - 6));
        anim_index = intro_anim_table[idx];
        tile_flags_or = 0;

        if (anim_index == 9) start_shot1();
        if (anim_index == 12) start_shot2();

        render_body_and_attacks();
        return;
    }

    if (intro_counter < 17) {
        if (intro_counter & 1) {
            render_attack_entities();
            return;
        }
        MEM8(ADDR_SOUND_FX_REQUEST) = 59;
        tile_flags_or = 0x60;
        render_body_and_attacks();
        return;
    }

    intro_active = 0;
    render_attack_entities();
}

/* regen-phase chase/jump/attack state machine: sub_A4C9 */
static void active_phase(void)
{
    regen_timer++;
    if ((regen_timer & 0x1F) == 0)
        maybe_regenerate();

    if (jump_active) {
        uint16_t i = (uint16_t)jump_step * 3;
        uint8_t horizontal = jump_table[i + 0];

        if (horizontal) {
            if (!facing_left) {
                (void)move_left_one();
                (void)move_left_one();
            } else {
                (void)move_right_one();
                (void)move_right_one();
            }
        }

        boss_y_set((uint8_t)((boss_y_get() + (int8_t)jump_table[i + 1]) & 0x3F));
        anim_index = jump_table[i + 2];
        jump_step++;

        if (jump_table[i + 3] == 0x80)
            jump_active = 0;

        render_body_and_attacks();
        return;
    }

    if (attack_anim_active) {
        uint8_t old = attack_anim_step++;
        anim_index = intro_anim_table[old];

        if (anim_index == 9) {
            attack_anim_active = 0;
            start_shot1();
        }

        render_body_and_attacks();
        return;
    }

    if (shot1_active) {
        render_body_and_attacks();
        return;
    }

    /* hero absolute X = proximity-left + hero viewport X + 3, wrapped */
    uint8_t hero_x = (uint8_t)(MEM16(ADDR_PROXIMITY_MAP_LEFT_COL) +
                               MEM8(ADDR_HERO_X_VIEW) + 3);
    uint8_t map_w = MEM8(ADDR_MAP_WIDTH);
    if (hero_x >= map_w) hero_x = (uint8_t)(hero_x - map_w);

    facing_left = (boss_x_get() < hero_x) ? 0xFF : 0x00;

    uint8_t distance;
    if (!facing_left)
        distance = (uint8_t)((boss_x_get() - hero_x) & 0xFE);
    else
        distance = (uint8_t)((hero_x - boss_x_get()) & 0xFE);

    if (distance == 8) {
        /* fall through to loc_A5CD */
    } else if (distance < 8) {
        uint8_t blocked;

        if (!facing_left) {
            anim_index = (uint8_t)((anim_index - 1) & 3);
            if (!(anim_index & 1)) (void)move_right_one();
            blocked = move_right_one();
        } else {
            anim_index = (uint8_t)((anim_index - 1) & 3);
            if (!(anim_index & 1)) (void)move_left_one();
            blocked = move_left_one();
        }

        /* Successful walking jumps straight to loc_A5F4 in the assembly,
           bypassing the stationary/random-attack logic at loc_A5CD. */
        if (!blocked) {
            render_body_and_attacks();
            return;
        }

        jump_step = 0;
        jump_active = 0xFF;
    } else {
        uint8_t blocked;

        if (!facing_left) {
            anim_index = (uint8_t)((anim_index + 1) & 3);
            if (anim_index & 1) (void)move_left_one();
            blocked = move_left_one();
        } else {
            anim_index = (uint8_t)((anim_index + 1) & 3);
            if (anim_index & 1) (void)move_right_one();
            blocked = move_right_one();
        }

        if (!blocked) {
            render_body_and_attacks();
            return;
        }

        jump_step = 0;
        jump_active = 0xFF;
    }

    /* loc_A5CD: only reached when exactly 8 units away, or when walking
       hit an arena boundary and converted into a jump. */
    {
        uint8_t prev = moved_this_frame;
        moved_this_frame = 0xFF;

        if (!prev) {
            render_body_and_attacks();
            return;
        }

        anim_index &= 0xFE;
        if ((get_random() & 0x0F) == 0) {
            attack_anim_step = 0;
            attack_anim_active = 0xFF;
        }
    }

    render_body_and_attacks();
}

static void choose_spawn_position(void)
{
    boss_y_set(9);

    /* shr al,1 / sbb al,al => 00 if original bit0=0, FF if bit0=1 */
    facing_left = (get_random() & 1) ? 0xFF : 0x00;

    uint8_t map_w = MEM8(ADDR_MAP_WIDTH);
    uint8_t left = (uint8_t)MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);

    uint8_t x = (uint8_t)(((uint8_t)~facing_left & 0x14) + left + 4);
    if (x >= map_w) x = (uint8_t)(x - map_w);
    boss_x_set(x);

    if (x >= 16 && x < 53)
        return;

    facing_left = (uint8_t)~facing_left;
    x = (uint8_t)(((uint8_t)~facing_left & 0x14) + left + 4);
    if (x >= map_w) x = (uint8_t)(x - map_w);
    boss_x_set(x);
}

static uint8_t move_left_one(void)
{
    uint16_t x = (uint16_t)(boss_x_get() - 1);

    /* sub_A691 succeeds only while new X > 14; failure returns carry set. */
    if (x <= 14)
        return 1;

    boss_x_set(x);
    moved_this_frame = 0;
    return 0;
}

static uint8_t move_right_one(void)
{
    uint16_t x = (uint16_t)(boss_x_get() + 1);

    /* sub_A6A7 succeeds while new X <= 53. */
    if (x > 53)
        return 1;

    boss_x_set(x);
    moved_this_frame = 0;
    return 0;
}

static void start_shot1(void)
{
    shot1_age = 0;
    shot1_active = 0xFF;
    shot1_facing = facing_left;

    shot1_x = (uint8_t)((boss_x_get() + (facing_left & 5)) & 0xFF);
    shot1_y = (uint8_t)((boss_y_get() + 4) & 0x3F);
    MEM8(ADDR_SOUND_FX_REQUEST) = 58;
}

static void start_shot2(void)
{
    shot2_age = 0;
    shot2_active = 0xFF;
    shot2_facing = facing_left;

    shot2_x = (uint8_t)((boss_x_get() + (facing_left & 8) - 1) & 0xFF);
    shot2_y = (uint8_t)((boss_y_get() + 4) & 0x3F);
    MEM8(ADDR_SOUND_FX_REQUEST) = 58;
}

static void build_body_grid(void)
{
    for (uint8_t i = 0; i < 54; ++i)
        body_grid[i] = 0xFF;

    uint8_t idx = anim_index;
    if (idx >= 14) idx = 13; /* defensive only; original tables have 14 */

    const uint8_t *layout = facing_left ? right_layouts[idx] : left_layouts[idx];
    const uint8_t *mask   = facing_left ? right_masks[idx]   : left_masks[idx];

    uint16_t layout_pos = 0;
    uint8_t dst = 0;

    for (uint8_t col = 0; col < 6; ++col) {
        uint8_t bits = mask[col];

        for (uint8_t row = 0; row < 8; ++row) {
            if (bits & (uint8_t)(0x80 >> row))
                body_grid[dst] = layout[layout_pos++];
            dst++;
        }
        dst++; /* ninth byte in each 9-byte column */
    }
}

static void render_body_and_attacks(void)
{
    build_body_grid();

    /* Original special-case patch for animation 5. */
    if (anim_index == 5) {
        if (facing_left) {
            body_grid[8] = 0x23;   /* AC41 */
            body_grid[17] = 0x1F;  /* AC4A */
        } else {
            body_grid[44] = 0x1F;  /* AC65 */
            body_grid[53] = 0x21;  /* AC6E */
        }
    }

    uint16_t si = append_ptr;
    uint16_t world_x = boss_x_get();

    for (uint8_t col = 0; col < 6; ++col, world_x++) {
        uint8_t xrel;
        if (!is_in_proximity_window(world_x, &xrel))
            continue;

        rel_x = xrel;

        for (uint8_t row = 0; row < 9; ++row) {
            uint8_t cell = body_grid[(uint16_t)col * 9 + row];
            if (cell == 0xFF)
                continue;

            MEM16(si + 0) = world_x;
            MEM8(si + 2) = (uint8_t)((boss_y_get() + row) & 0x3F);
            MEM8(si + 3) = rel_x;

            /* high nibble of cell becomes .flags, optionally OR 0x60;
               entire cell becomes .anim_counter */
            MEM8(si + 4) = (uint8_t)((cell >> 4) | tile_flags_or);
            MEM8(si + 6) = cell;
            MEM8(si + 5) = (uint8_t)(facing_left & 0x80);
            if (hit_flags) MEM8(si + 5) |= 0x20;

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
            uint8_t old = MEM8(di);
            MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
            MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old;

            si += 16;
            active_sprite_count++;
        }
    }

    append_ptr = si;
    MEM16(si) = 0xFFFF;

    render_attack_entities();
}

static void render_attack_entities(void)
{
    uint16_t si = append_ptr;

    /* ---- attack entity 1: tile 0x24 ---- */
    if (shot1_active) {
        if (shot1_age < 9) {
            if (shot1_age < 3)
                shot1_y = (uint8_t)((shot1_y + 1) & 0x3F);

            shot1_x = (uint8_t)(shot1_x + (shot1_facing ? 1 : -1));
        }

        uint8_t xrel;
        if (is_in_proximity_window(shot1_x, &xrel)) {
            MEM16(si + 0) = shot1_x;
            MEM8(si + 2) = shot1_y;
            MEM8(si + 3) = xrel;
            MEM8(si + 4) = 0x24;

            uint8_t anim = 0;
            if (shot1_age >= 3)
                anim = (uint8_t)((shot1_age & 3) + 1);
            MEM8(si + 6) = anim;
            MEM8(si + 5) = (uint8_t)(shot1_facing & 0x80);

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
            uint8_t old = MEM8(di);
            MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
            MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old;

            si += 16;
            active_sprite_count++;
        }

        shot1_age++;
        if (shot1_age >= 11)
            shot1_active = 0;
    }

    MEM16(si) = 0xFFFF;

    /* ---- attack entity 2: tile 0x25 ---- */
    if (shot2_active) {
        uint8_t anim = 0;

        if (shot2_age < 3) {
            shot2_y = (uint8_t)((shot2_y + 1) & 0x3F);
            anim = 2;
        }

        shot2_x = (uint8_t)(shot2_x + (shot2_facing ? 1 : -1));

        uint8_t xrel;
        if (is_in_proximity_window(shot2_x, &xrel)) {
            MEM16(si + 0) = shot2_x;
            MEM8(si + 2) = shot2_y;
            MEM8(si + 3) = xrel;
            MEM8(si + 4) = 0x25;
            MEM8(si + 6) = anim;
            MEM8(si + 5) = (uint8_t)(shot2_facing & 0x80);

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
            uint8_t old = MEM8(di);
            MEM8(di) = (uint8_t)(active_sprite_count | 0x80);
            MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old;

            si += 16;
            active_sprite_count++;
        }

        shot2_age++;

        /* Assembly terminates when X leaves [0x10,0x39), irrespective of age. */
        if (shot2_x < 0x10 || shot2_x >= 0x39)
            shot2_active = 0;
    }

    MEM16(si) = 0xFFFF;
    append_ptr = si;
}

static void damage_boss(uint16_t damage)
{
    uint16_t hp = boss_hp_get();
    hp = (damage > hp) ? 0 : (uint16_t)(hp - damage);
    boss_hp_set(hp);

    Draw_Boss_Health();

    if (hp != 0 || MEM8(ADDR_BOSS_BEING_HIT))
        return;

    death_timer = 0;
    shot1_active = 0;
    shot2_active = 0;
    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
}

static void maybe_regenerate(void)
{
    if (boss_hp_get() == 800)
        return;

    uint16_t hp = (uint16_t)(boss_hp_get() + 80);

    if (hp > 800) {
        hp = 800;
        regen_phase = 0;
        intro_counter = 10;
        intro_active = 0xFF;
        tile_flags_or = 0x60;
    }

    boss_hp_set(hp);
    MEM8(ADDR_SOUND_FX_REQUEST) = 60;
    Draw_Boss_Health();
}

static void death_sequence(void)
{
    uint8_t old = death_timer;

    if (old >= 40) {
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    if ((old & 7) == 0)
        MEM8(ADDR_SOUND_FX_REQUEST) = 35;

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;
    death_timer++;

    if (old >= 20) {
        render_body_and_attacks();
        return;
    }

    static const uint8_t death_anim[10] = {
        8,8,8,12,12,12,13,13,11,11
    };
    anim_index = death_anim[old >> 1];
    render_body_and_attacks();
}
