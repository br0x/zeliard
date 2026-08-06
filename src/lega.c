/*
lega.c - translated from lega.asm ("Tarso" / Japanese "Lega" boss AI)

This is a boss-encounter overlay module, structurally similar to tako.c /
crab.c. The original assembly exports Lega_AI_proc and a shared
boss_state_block. The generic engine reads non-AI fields of the boss
state block elsewhere.

Scope of this translation
-------------------------
This file translates the AI/gameplay logic only. The following are NOT
translated, since they are sprite/animation asset data read by a separate
generic boss-rendering routine and are never referenced by Lega_AI_proc:

  - the "start:" export header and reserved padding
  - encounter/HP/reward/name fields in boss_state_block
  - byte_A03E..byte_A205 and the pointer table referencing them

The tables actually consumed by the AI are translated:
  - off_A6C8 layout tables
  - off_A744 shape/mask tables
  - byte_A41B / byte_A41F / byte_A424 animation/movement helper tables
  - byte_A5D8/A5D9 projectile velocity table
  - byte_A69B / byte_A6BC death animation helper tables

Original entry point: Lega_AI_proc
Header-compatible entry point: Tarso_AI()
*/

#include "zeliard.h"

/*
============================================================================
Per-frame / persistent AI state
============================================================================
Original labels:

  byte_A7B6 : active_sprite_count
  byte_A7B7 : hit_segment
  byte_A7B8 : death_timer
  byte_A7B9 : anim_step
  byte_A7BA : head_anim
  byte_A7BB : walk_cycle
  byte_A7BC : col_rel_x
  byte_A7BD : back_flag
  byte_A7BE : written by original but never read by AI; omitted
  byte_A7BF : back_timer
  byte_A7C0 : charge_flag
  byte_A7C1 : charge_substep
  byte_A7C2 : projectile_flag
  word_A7C3 : projectile_x
  byte_A7C5 : projectile_y
  byte_A7C6 : projectile_anim
  byte_A7C7 : projectile_counter
  byte_A7C8 : projectile_done
*/

static uint8_t active_sprite_count = 0;
static uint8_t hit_segment = 0;
static uint8_t death_timer = 0;
static uint8_t anim_step = 0;
static uint8_t head_anim = 0;
static uint8_t walk_cycle = 0;
static uint8_t col_rel_x = 0;
static uint8_t back_flag = 0;
static uint8_t back_timer = 0;
static uint8_t charge_flag = 0;
static uint8_t charge_substep = 0;
static uint8_t projectile_flag = 0;
static uint16_t projectile_x = 0;
static uint8_t projectile_y = 0;
static uint8_t projectile_anim = 0;
static uint8_t projectile_counter = 0;
static uint8_t projectile_done = 0;

/*
============================================================================
AI helper tables
============================================================================
*/

/* byte_A41B */
static const uint8_t walk_cycle_to_head_anim[4] = {
    0, 1, 2, 1
};

/* byte_A41F: animation steps that trigger left movement */
static const uint8_t left_move_steps[5] = {
    2, 5, 6, 7, 0
};

/* byte_A424: animation steps used by the backward/right movement loop */
static const uint8_t right_move_steps[5] = {
    1, 3, 6, 7, 7
};

/* byte_A69B: death thrash animation steps */
static const uint8_t death_thrash_steps[10] = {
    0, 1, 2, 3, 6, 7, 6, 3, 2, 1
};

/* byte_A6BC: originally reachable only in a near-dead path; kept for fidelity */
static const uint8_t death_head_anim_table[6] = {
    3, 3, 4, 4, 5, 5
};

/*
Projectile velocity table, original byte_A5D8 / byte_A5D9.
The original indexes this as pairs:

    bx = projectile_counter * 2
    dx = byte_A5D8[bx]
    dy = byte_A5D9[bx]

Each byte is added to the low byte of X or to Y as an unsigned byte add.
0xFF therefore behaves like -1, 0xFE like -2, etc.
*/
static const uint8_t projectile_vel_table[34] = {
    0xFF, 0x00,
    0xFF, 0x00,
    0xFF, 0x01,
    0x00, 0x02,
    0xFF, 0x02,
    0x00, 0x02,
    0xFF, 0x02,
    0xFF, 0xFE,
    0xFF, 0x00,
    0xFF, 0x02,
    0xFF, 0xFF,
    0xFF, 0x00,
    0xFF, 0x01,
    0xFF, 0x00,
    0xFF, 0x00,
    0xFF, 0x00,
    0xFF, 0x00
};

/*
============================================================================
Body layout tables (off_A6C8)
============================================================================
Each layout byte is a tile index. The shape mask determines how many bytes
are consumed and into which rows of the 8x10 local tile buffer they go.
*/

static const uint8_t layout_a6dc[7] = {
    0x11, 0x10, 0x12, 0x13, 0x14, 0x15, 0x16
};

static const uint8_t layout_a6e3[9] = {
    0x11, 0x17, 0x19, 0x10, 0x12, 0x18, 0x1A, 0x1B, 0x1C
};

static const uint8_t layout_a6ec[10] = {
    0x1D, 0x1F, 0x21, 0x23, 0x10, 0x1E, 0x20, 0x22, 0x24, 0x25
};

static const uint8_t layout_a6f6[11] = {
    0x29, 0x2A, 0x27, 0x26, 0x28, 0x10, 0x1E, 0x20, 0x22, 0x24, 0x25
};

static const uint8_t layout_a701[11] = {
    0x32, 0x30, 0x2D, 0x31, 0x2B, 0x2E, 0x10, 0x1E, 0x20, 0x2C, 0x2F
};

static const uint8_t layout_a70c[12] = {
    0x3D, 0x3A, 0x3C, 0x3B, 0x33, 0x10, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39
};

static const uint8_t layout_a718[10] = {
    0x42, 0x43, 0x40, 0x44, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46
};

static const uint8_t layout_a722[12] = {
    0x58, 0x59, 0x5A, 0x4F, 0x50, 0x52, 0x54, 0x56, 0x51, 0x53, 0x55, 0x57
};

static const uint8_t layout_a72e[11] = {
    0xCA, 0x42, 0x47, 0x40, 0x48, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46
};

static const uint8_t layout_a739[11] = {
    0xCE, 0x42, 0x4D, 0x40, 0x4C, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46
};

static const uint8_t *const layout_tables[10] = {
    layout_a6dc,
    layout_a6e3,
    layout_a6ec,
    layout_a6f6,
    layout_a701,
    layout_a70c,
    layout_a718,
    layout_a722,
    layout_a72e,
    layout_a739
};

/*
============================================================================
Body shape/mask tables (off_A744)
============================================================================
These are mutated in place by the original code with `rol byte ptr [bp],1`.
The last two entries deliberately alias the same array, exactly like the
original data.
*/

static uint8_t shape_a758[8] = {
    0x00, 0x00, 0x00, 0x00, 0x20, 0xAB, 0x01, 0x00
};

static uint8_t shape_a760[8] = {
    0x00, 0x00, 0x00, 0x00, 0x2C, 0xAD, 0x01, 0x00
};

static uint8_t shape_a768[8] = {
    0x00, 0x00, 0x00, 0x00, 0x2B, 0x80, 0x2B, 0x01
};

static uint8_t shape_a770[8] = {
    0x00, 0x00, 0x05, 0x10, 0x28, 0x80, 0x2B, 0x01
};

static uint8_t shape_a778[8] = {
    0x08, 0x04, 0x18, 0x00, 0x28, 0x80, 0x2B, 0x00
};

static uint8_t shape_a780[8] = {
    0x00, 0x02, 0x14, 0x10, 0x20, 0xA8, 0x0C, 0x03
};

static uint8_t shape_a788[8] = {
    0x00, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01
};

static uint8_t shape_a790[8] = {
    0x00, 0x00, 0x00, 0x00, 0x0B, 0xAB, 0x53, 0x00
};

static uint8_t shape_a798[8] = {
    0x01, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01
};

static uint8_t *const shape_tables[10] = {
    shape_a758,
    shape_a760,
    shape_a768,
    shape_a770,
    shape_a778,
    shape_a780,
    shape_a788,
    shape_a790,
    shape_a798,
    shape_a798   /* deliberate alias, matches original */
};

/* Initial contents for reset, matching a fresh overlay load. */
static const uint8_t shape_init[10][8] = {
    { 0x00, 0x00, 0x00, 0x00, 0x20, 0xAB, 0x01, 0x00 },
    { 0x00, 0x00, 0x00, 0x00, 0x2C, 0xAD, 0x01, 0x00 },
    { 0x00, 0x00, 0x00, 0x00, 0x2B, 0x80, 0x2B, 0x01 },
    { 0x00, 0x00, 0x05, 0x10, 0x28, 0x80, 0x2B, 0x01 },
    { 0x08, 0x04, 0x18, 0x00, 0x28, 0x80, 0x2B, 0x00 },
    { 0x00, 0x02, 0x14, 0x10, 0x20, 0xA8, 0x0C, 0x03 },
    { 0x00, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01 },
    { 0x00, 0x00, 0x00, 0x00, 0x0B, 0xAB, 0x53, 0x00 },
    { 0x01, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01 },
    { 0x01, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01 }
};

/*
============================================================================
Forward declarations
============================================================================
*/

static uint8_t byte_in_table(const uint8_t *tbl, uint8_t n, uint8_t val);
static uint8_t boss_move_left(void);
static uint8_t boss_move_right(void);

static void apply_damage_to_boss(uint16_t damage);
static void update_projectile(void);
static void render_body_and_projectile(void);
static void update_walk_cycle_and_render(void);

static void normal_left_movement(void);
static void back_right_movement(void);
static void maybe_start_charge(void);
static void charge_state_machine(void);
static void death_sequence_step(void);

/*
============================================================================
Small helpers
============================================================================
*/

/*
Equivalent of `repne scasb` against a small byte table.
Returns nonzero if val is present.
*/
static uint8_t byte_in_table(const uint8_t *tbl, uint8_t n, uint8_t val)
{
    for (uint8_t i = 0; i < n; i++) {
        if (tbl[i] == val) {
            return 1;
        }
    }
    return 0;
}

/*
sub_A429: move boss one pixel left.

Original carry logic:
    boss_x--
    return CF=1 if new boss_x <= 0x0E

The caller uses `sbb al,al`, so this helper directly returns the value
that would be stored into back_flag: 0xFF if the left boundary was reached,
otherwise 0.
*/
static uint8_t boss_move_left(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t ax = (uint16_t)(MEM16(boss_state + 0) - 1);

    MEM16(boss_state + 0) = ax;

    return (ax <= 0x0E) ? 0xFF : 0x00;
}

/*
sub_A43B: move boss one pixel right if within the right boundary.

Original logic:
    ax = boss_x + 1
    if ax <= 50: boss_x = ax, CF=0
    else:        CF=1

The caller does `cmc; sbb al,al`, therefore the value stored into
back_flag is 0xFF when the move succeeded, 0 when blocked.
*/
static uint8_t boss_move_right(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t ax = (uint16_t)(MEM16(boss_state + 0) + 1);

    if (ax <= 50) {
        MEM16(boss_state + 0) = ax;
        return 0xFF;
    }

    return 0x00;
}

/*
============================================================================
Damage / death
============================================================================
sub_A644
*/
static void apply_damage_to_boss(uint16_t damage)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t hp = MEM16(boss_state + 3);

    if (hp > damage) {
        hp = (uint16_t)(hp - damage);
    } else {
        hp = 0;
    }

    MEM16(boss_state + 3) = hp;
    Draw_Boss_Health();

    if (hp != 0) {
        return;
    }

    /*
    Unlike tako.c's apply_damage helper, the original Lega code does not
    guard on boss_being_hit here. If HP is already zero, this restarts the
    death timer. This matches sub_A644 exactly.
    */
    death_timer = 0;
    projectile_flag = 0;
    MEM8(ADDR_BOSS_BEING_HIT) = 0xFF;
}

/*
loc_A66E: death sequence.
*/
static void death_sequence_step(void)
{
    if (death_timer >= 40) {
        MEM8(ADDR_BOSS_IS_DEAD) = 0xFF;
        return;
    }

    MEM8(ADDR_SPRITE_FLASH_FLAG) = 0xFF;
    death_timer++;

    if (death_timer < 10) {
        uint8_t al = death_thrash_steps[death_timer];
        anim_step = al;

        if (al >= 3) {
            MEM8(ADDR_SOUND_FX_REQUEST) = 51;
        }

        /* Original jumps to loc_A39F here. */
        update_walk_cycle_and_render();
    } else {
        uint8_t al;

        /*
        In the original this branch is only reached with death_timer >= 10,
        so al effectively always becomes 6. The table lookup is preserved
        for structural fidelity.
        */
        if (death_timer < 6) {
            al = death_head_anim_table[death_timer];
        } else {
            al = 6;
        }

        head_anim = al;
        render_body_and_projectile();
    }
}

/*
============================================================================
Projectile / attack state machine
============================================================================
loc_A553 continuation after rendering.
*/
static void update_projectile(void)
{
    if (!projectile_flag) {
        return;
    }

    if (!projectile_done) {
        /*
        cmp byte ptr word_A7C3, 12h
        If the projectile reached the left side, switch to its ending anim.
        */
        if ((uint8_t)(projectile_x & 0xFF) < 0x12) {
            projectile_done = 0xFF;
            projectile_anim = 3;
            MEM8(ADDR_SOUND_FX_REQUEST) = 50;
            return;
        }

        uint8_t idx = projectile_counter;

        /* The original counter freezes at 0x10; this clamp is safety only. */
        if (idx > 16) {
            idx = 16;
        }

        uint8_t dx = projectile_vel_table[idx * 2 + 0];
        uint8_t dy = projectile_vel_table[idx * 2 + 1];

        /*
        Original adds dx to the low byte of projectile_x only:
            add byte ptr word_A7C3, al
        */
        projectile_x = (uint16_t)((projectile_x & 0xFF00) |
                                  (uint8_t)((projectile_x & 0xFF) + dx));

        projectile_y = (uint8_t)(projectile_y + dy);

        /*
        Original:
            cmp byte_A7C7, 10h
            adc byte_A7C7, 0
        */
        if (projectile_counter < 0x10) {
            projectile_counter++;
        }

        /* Projectile sprite frame cycles 0..2. */
        projectile_anim++;
        if (projectile_anim >= 3) {
            projectile_anim = 0;
        }

        if (projectile_counter == 9 ||
            projectile_counter == 12 ||
            projectile_counter == 15) {
            MEM8(ADDR_SOUND_FX_REQUEST) = 49;
        }
    } else {
        /*
        loc_A5C6: ending animation. Holds for a few frames, then clears
        projectile_flag.
        */
        projectile_anim++;
        if (projectile_anim >= 6) {
            projectile_flag = 0;
        }
    }
}

/*
============================================================================
Movement / animation state machines
============================================================================
*/

/*
Normal left-moving animation path, original loc_A2DA when byte_A7BD == 0.
*/
static void normal_left_movement(void)
{
    back_timer = 0x3C;

    anim_step = (uint8_t)((anim_step + 1) & 7);

    uint8_t al = anim_step;

    if (byte_in_table(left_move_steps, 5, al)) {
        back_flag = boss_move_left();

        if (al == 7) {
            back_flag = boss_move_left();
        }
    }
}

/*
Backward/right movement path, original loc_A316.
*/
static void back_right_movement(void)
{
    uint8_t t = (uint8_t)(back_timer - 1);
    back_timer = t;

    if (t == 0) {
        back_flag = 0;
        return;
    }

loc_A323:
    for (;;) {
        uint8_t al = anim_step;

        if (al == 0) {
            al = 8;
        }

        if (al == 6) {
            al = (uint8_t)(al - 2);
        }

        al = (uint8_t)(al - 1);
        anim_step = al;

        if (!byte_in_table(right_move_steps, 5, al)) {
            return;
        }

        back_flag = boss_move_right();

        if (al == 6) {
            back_flag = boss_move_right();
            return;
        }

        if (al == 3) {
            back_flag = boss_move_right();
            return;
        }

        /*
        Original:
            cmp al, 3
            jnz short loc_A323

        For table values 1 and 7, the code repeats the loop.
        */
        if (al != 1 && al != 7) {
            return;
        }

        goto loc_A323;
    }
}

/*
loc_A35F: possibly start the charge/projectile attack.
*/
static void maybe_start_charge(void)
{
    if (back_flag) {
        return;
    }

    if (anim_step != 6) {
        return;
    }

    if (get_random() & 1) {
        return;
    }

    if (projectile_flag) {
        return;
    }

    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);

    /*
    Original:
        mov ax, cs:boss_x
        sub ax, 20
        jb short loc_A39F

    The constant is decimal 20 in the listing.
    */
    if (MEM16(boss_state + 0) < 20) {
        return;
    }

    charge_flag = 0xFF;
    charge_substep = 0;

    /* byte_A7BE = 0 in the original, but it is never read by the AI. */

    anim_step = 8;
    MEM8(ADDR_SOUND_FX_REQUEST) = 48;
}

/*
loc_A3B5: charge attack state machine.
*/
static void charge_state_machine(void)
{
    charge_substep++;

    switch ((uint8_t)(charge_substep - 1)) {
    case 0:
        /* jumptable A3C3 case 0 */
        head_anim = 6;
        anim_step = 8;
        projectile_flag = 0xFF;

        {
            uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
            projectile_x = (uint16_t)(MEM16(boss_state + 0) + 4);
            projectile_y = (uint8_t)(MEM8(boss_state + 2) & 0x3F);
        }

        projectile_anim = 0;
        projectile_counter = 0;
        projectile_done = 0;

        render_body_and_projectile();
        return;

    case 1:
        /* jumptable A3C3 case 1 */
        head_anim = 7;
        anim_step = 6;
        render_body_and_projectile();
        return;

    case 2:
        /* jumptable A3C3 case 2 */
        head_anim = 0;
        charge_flag = 0;
        anim_step = 6;
        render_body_and_projectile();
        return;

    default:
        /*
        The original switch has only three cases and clears charge_flag in
        case 2, so this should not be reachable. Keep rendering safe.
        */
        render_body_and_projectile();
        return;
    }
}

/*
loc_A39F: update the head/walk cycle, then render.
*/
static void update_walk_cycle_and_render(void)
{
    walk_cycle = (uint8_t)((walk_cycle + 1) & 3);
    head_anim = walk_cycle_to_head_anim[walk_cycle];

    render_body_and_projectile();
}

/*
============================================================================
Rendering / pseudo-monster table layout
============================================================================
loc_A44C .. end of Lega_AI_proc.

Builds a local 8x10 tile buffer, copies layout tiles into it according to
the rotated shape mask, patches in head tiles, then converts non-empty
cells into temporary pseudo-monster entries in monsters_table. Finally,
appends the projectile if active and advances projectile state.
*/
static void render_body_and_projectile(void)
{
    uint8_t buffer[80];

    /*
    Original clears 40 words = 80 bytes starting at unk_A7C9 to 0xFFFF.
    For our purposes, each cell is a byte and 0xFF means empty.
    */
    for (unsigned i = 0; i < 80; i++) {
        buffer[i] = 0xFF;
    }

    uint8_t table_idx = anim_step;

    const uint8_t *layout = layout_tables[table_idx];
    uint8_t *shape = shape_tables[table_idx];

    /*
    Copy layout tiles into buffer rows 2..9.

    Original copy loop starts at unk_A7CB, i.e. buffer offset +2.
    Each column occupies 10 bytes:
        rows 0..1 are usually left empty / patched separately
        rows 2..9 are filled from the shape mask
    */
    uint16_t layout_pos = 0;
    int di = 2;

    for (uint8_t col = 0; col < 8; col++) {
        for (uint8_t row = 0; row < 8; row++) {
            uint8_t carry = (uint8_t)((shape[col] & 0x80) != 0);

            /* rol byte ptr [bp],1 */
            shape[col] = (uint8_t)((shape[col] << 1) | carry);

            if (carry) {
                buffer[di] = layout[layout_pos++];
            }

            di++;
        }

        /* Padding between columns. */
        di += 2;
    }

    /*
    Patch head tiles.

    Original:
        mov al, byte_A7BA
        add al, al
        mov di, offset unk_A7F1
        cmp byte_A7B9, 6
        jz short loc_A49A
        cmp byte_A7B9, 8
        jb short loc_A49B
    loc_A49A:
        inc di
    loc_A49B:
        stosb
        add di, 19
        inc al
        stosb

    unk_A7F1 is offset 0x28 (40 decimal) from unk_A7C9.
    The first stosb advances DI by 1, then `add di,19` adds decimal 19,
    so the second write is at first_write_offset + 20.
    */
    uint8_t al = (uint8_t)(head_anim << 1);
    int head_di = 0x28;

    if (anim_step == 6 || anim_step >= 8) {
        head_di++;
    }

    buffer[head_di] = al;
    head_di += 20;
    al++;
    buffer[head_di] = al;

    /*
    Convert buffer cells into pseudo-monster entries.
    */
    active_sprite_count = 0;

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;

    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
    uint16_t col_x = MEM16(boss_state + 0);
    uint8_t boss_y = MEM8(boss_state + 2);

    int buf_idx = 0;

    for (uint8_t col = 0; col < 8; col++) {
        uint8_t rel;

        if (is_in_proximity_window(col_x, &rel)) {
            col_rel_x = rel;

            for (uint8_t row = 0; row < 10; row++) {
                uint8_t tile = buffer[buf_idx + row];

                if (tile == 0xFF) {
                    continue;
                }

                MEM16(si + 0) = col_x;                              /* currX */
                MEM8(si + 2) = (uint8_t)((boss_y + row) & 0x3F);    /* currY */
                MEM8(si + 3) = col_rel_x;                           /* m_x_rel */
                MEM8(si + 6) = tile;                                /* anim_counter / tile */

                /*
                Original packs flags from the tile:

                    mov ah, al
                    add al, al
                    sbb al, al
                    and al, 60h
                    mov bl, ah
                    shr bl, 1 four times
                    and bl, 7
                    or al, bl
                */
                uint8_t flags = 0;

                if (tile & 0x80) {
                    flags |= 0x60;
                }

                flags = (uint8_t)(flags | ((tile >> 4) & 7));

                MEM8(si + 4) = flags;
                MEM8(si + 5) = (hit_segment != 0) ? 0x20 : 0x00;

                uint16_t di_addr = coords_to_prox_addr(MEM8(si + 3),
                                                       MEM8(si + 2));

                uint8_t old_tile = MEM8(di_addr);
                MEM8(di_addr) = (uint8_t)(active_sprite_count | 0x80);
                MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

                si += 16;
                active_sprite_count++;
            }
        }

        col_x++;
        buf_idx += 10;
    }

    /*
    sub_A5FA: append the projectile sprite, if active and visible.
    */
    if (projectile_flag) {
        uint8_t rel;

        if (is_in_proximity_window(projectile_x, &rel)) {
            MEM16(si + 0) = projectile_x;       /* currX */
            MEM8(si + 2) = projectile_y;        /* currY */
            MEM8(si + 3) = rel;                 /* m_x_rel */
            MEM8(si + 4) = 0x26;                /* flags */
            MEM8(si + 5) = 0x00;                /* ai_flags */
            MEM8(si + 6) = projectile_anim;     /* anim_counter */

            uint16_t di_addr = coords_to_prox_addr(MEM8(si + 3),
                                                   MEM8(si + 2));

            uint8_t old_tile = MEM8(di_addr);
            MEM8(di_addr) = (uint8_t)(active_sprite_count | 0x80);
            MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count) = old_tile;

            si += 16;
            active_sprite_count++;
        }
    }

    MEM16(si) = 0xFFFF;

    /* Projectile movement happens after the sprite table is finalized. */
    update_projectile();
}

/*
============================================================================
Public API
============================================================================
*/

/*
Tarso_AI_reset - clear all persistent static state so a fresh encounter
behaves correctly even after a save/restore cycle.
*/
void Tarso_AI_reset(void)
{
    active_sprite_count = 0;
    hit_segment = 0;
    death_timer = 0;
    anim_step = 0;
    head_anim = 0;
    walk_cycle = 0;
    col_rel_x = 0;
    back_flag = 0;
    back_timer = 0;
    charge_flag = 0;
    charge_substep = 0;
    projectile_flag = 0;
    projectile_x = 0;
    projectile_y = 0;
    projectile_anim = 0;
    projectile_counter = 0;
    projectile_done = 0;

    /*
    Restore mutable shape masks. The original overlay would be reloaded
    with fresh data for a new encounter.
    */
    for (unsigned i = 0; i < 10; i++) {
        for (unsigned j = 0; j < 8; j++) {
            shape_tables[i][j] = shape_init[i][j];
        }
    }
}

/*
entry point, called once per frame.
Original: Lega_AI_proc.
*/
void Tarso_AI(uint16_t m)
{
    (void)m;

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;

    active_sprite_count = 0;
    hit_segment = 0;

    /*
    Walk last frame's pseudo-monster entries:
      - restore proximity-map tiles they overwrote
      - pick up any hit flagged by external hit detection (ai_flags bit 0x40)

    Unlike tako.c, the original Lega code does not keep only the first hit;
    it overwrites byte_A7B7 with each hit it finds.
    */
    for (;;) {
        if (MEM16(si + 0) == 0xFFFF) {
            break;
        }

        uint8_t rel;

        if (is_in_proximity_window(MEM16(si + 0), &rel)) {
            MEM8(si + 3) = rel;

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2));
            MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + active_sprite_count);

            if (MEM8(si + 5) & 0x40) {
                hit_segment = (uint8_t)(MEM8(si + 5) & 0x1F);
            }
        }

        active_sprite_count++;
        si += 16;
    }

    /* Reset the sprite table; render_body_and_projectile() repopulates it. */
    si = base;
    MEM16(si) = 0xFFFF;

    /* Process hit, if any. */
    if (hit_segment != 0) {
        uint8_t stat = Get_Stats(hit_segment);
        uint16_t damage = stat;

        /*
        Original damage formula:

            cmp al, 9   -> normal damage
            cmp al, 1   -> double damage
            otherwise   -> damage / 8
        */
        if (hit_segment == 1) {
            damage = (uint16_t)(damage << 1);
        } else if (hit_segment != 9) {
            damage = (uint16_t)(damage >> 3);
        }

        apply_damage_to_boss(damage);

        MEM8(ADDR_SOUND_FX_REQUEST) = 47;

        /*
        Original:
            cmp byte ptr boss_x, 2Fh
            jnb short loc_A2B5

        If hit while fairly far left, start the backward/recover state.
        */
        uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);
        if ((uint8_t)(MEM16(boss_state + 0) & 0xFF) < 0x2F) {
            back_timer = 0x14;
            back_flag = 0xFF;
        }
    }

    /* Death sequence has priority over normal AI. */
    if (MEM8(ADDR_BOSS_BEING_HIT)) {
        death_sequence_step();
        return;
    }

    /* Charge state machine has priority over normal movement. */
    if (charge_flag) {
        charge_state_machine();
        return;
    }

    /*
    If the projectile attack is active and still in its early phase,
    skip normal movement but continue to common animation/rendering.
    Original:
        test byte_A7C2
        jz loc_A2DA
        cmp byte_A7C7, 0Dh
        jnb loc_A2DA
        jmp loc_A35F
    */
    if (!(projectile_flag && projectile_counter < 0x0D)) {
        if (!back_flag) {
            normal_left_movement();
        } else {
            back_right_movement();
        }
    }

    /* Common: maybe start charge, update head anim, render. */
    maybe_start_charge();
    update_walk_cycle_and_render();
}

/*
Optional aliases matching the original assembly export name.
*/
void Lega_AI(uint16_t m)
{
    Tarso_AI(m);
}

void Lega_AI_reset(void)
{
    Tarso_AI_reset();
}