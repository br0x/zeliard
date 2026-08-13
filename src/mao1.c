/*
 * mao1.c - translated from mao1.asm ("Jashiin"/Mao boss AI, room 1)
 *
 * This is a boss-encounter overlay module, structurally similar to
 * crab.c/tako.c: it is loaded at a fixed segment address and exports an
 * entry point (Jashiin1_AI, originally Jashiin1_AI_proc) plus a shared
 * "boss_state_block" that the generic engine reads elsewhere (health
 * bar, victory/reward handling, name display), regardless of which boss
 * module is currently loaded.
 *
 * UNLIKE the other bosses, this room is not a fight: Jashiin does not
 * take damage and there is no hit-detection pass. Jashiin1_AI_proc instead
 * drives a scripted cutscene -- an idle-animation timeline with a
 * couple of dialog boxes -- that plays once per encounter and ends by
 * clearing is_jashiin_cavern, which the engine uses to know the scene
 * is over.
 *
 * Scope of this translation
 * ------------------------------------------------------------------
 * This file translates the AI/gameplay logic only. The following are
 * NOT translated, since they are asset data / engine-managed fields
 * read by generic code that never goes through Jashiin1_AI_proc:
 *   - the "start:" export header and its reserved padding
 *   - boss_state_block's non-AI fields (boss_hp, xp_reward,
 *     arena_center_x, boss_placement, name_block_ptr, name_screen_x/y,
 *     aJashiin boss-name pstring) -- populated/read by the generic
 *     overlay loader, encounter/reward code, and name renderer, not by
 *     this AI. (boss_x/boss_y ARE translated below: Jashiin1_AI_proc reads
 *     and writes them directly)
 *
 * The pose sprite-layout tables (off_A495/byte_A4AB.. and
 * off_A52F/byte_A545..) and the per-frame cutscene script
 * (byte_A3BB) ARE translated, since Jashiin1_AI_proc reads them directly
 * every frame to decide what to draw and when to pop dialog boxes.
 *
 * IMPORTANT: like tako.c's tentacle shape tables, the pose *mask*
 * tables (pose_mask_tables / byte_A545..byte_A57B) are mutated in
 * place at runtime -- the original code rotates the mask byte
 * (`rol byte ptr [bp],1`) every time it is used, so consecutive frames
 * resume from wherever the mask was last left. Two of the 11 mask-table
 * slots alias the very same 6-byte array (byte_A557, reused at pose
 * indices 3 and 6 in the original data layout); that aliasing is
 * preserved here on purpose to match the original behavior exactly.
 * The pose *tile* tables (pose_tile_tables / byte_A4AB..byte_A51F) are
 * read-only and not aliased, so they stay `static const`.
 *
 * Translation conventions
 * ------------------------------------------------------------------
 * - Each visible body-part segment occupies a temporary entry in the
 *   shared monsters_table (the same array real monsters live in),
 *   exactly as in tako.c, reusing the same field offsets:
 *       +0 currX (word)   +2 currY   +3 m_x_rel   +4 flags
 *       +5 ai_flags        +6 anim_counter
 *   Here "+4 flags" holds a tile index (the high nibble of a packed
 *   tile byte from the pose's tile table) and "+6 anim_counter" holds
 *   that byte's low nibble; "+5 ai_flags" is always 0 (Jashiin's parts
 *   are never hittable in this room).
 * - "si"/"di"/"bp" pointers from the original are modeled as plain
 *   uint16_t addresses into the flat MEM8/MEM16 address space, or as
 *   plain C pointers into the translated static tables, exactly as in
 *   tako.c.
 * - boss_state_block's AI-relevant fields are shared data reached
 *   through ADDR_BOSS_STATE_PTR, at the same offsets tako.c uses
 *   (+0 boss_x word, +2 boss_y byte), since "boss_state_block" is
 *   simply a label alias for "boss_x" in the original assembly.
 * - Local helpers that the original tested with jb/jnb (carry) return
 *   an int/uint8_t that IS the "in range" boolean, exactly as in
 *   tako.c: is_in_proximity_window() returns nonzero when in range
 *   (the original branches away from the render path when carry is
 *   set, i.e. out of range).
 * - The dialog boxes are NOT drawn from C: show_dialog_box() only signals
 *   game.js with a string id (through render_notification_string() /
 *   ADDR_NOTIFICATION_MSG_ID / ADDR_NOTIFICATION_FLAG), and game.js owns the
 *   dialog text and its rendering. The original Draw_Bordered_Rectangle_proc
 *   / Render_String_FF_Terminated_proc calls have therefore been dropped.
 *   clear_dialog_area() additionally clears the notification flag so the
 *   box vanishes exactly when the cutscene script says to.
 */

#include "zeliard.h"

/*
 * ============================================================================
 * Per-frame / persistent AI state (byte_A599 .. byte_A59C in the original)
 * ============================================================================
 */
static uint8_t sprite_write_cursor = 0; /* byte_A599: monsters_table write cursor / proximity_second_layer index this frame */
static uint8_t current_col_rel_x = 0;   /* byte_A59A: proximity-relative X of the column currently being laid out */
static uint8_t current_pose = 0;        /* byte_A59B: currently selected idle/talk pose (0..0x0A), persists across command frames */
static uint8_t script_cursor = 0;       /* byte_A59C: cursor into cutscene_script, advanced by one every frame */

/*
 * ============================================================================
 * Per-pose sprite layout tables
 * ============================================================================
 * Transcribed 1:1 from mao1.asm. Each pose has:
 *   - a tile table (off_A495 / byte_A4AB..byte_A51F): one packed byte per
 *     visible body-part segment for that pose. High nibble -> tile index
 *     (monster .flags), low nibble -> anim_counter.
 *   - a 6-byte mask table (off_A52F / byte_A545..byte_A57B): one bit per
 *     potential row (up to 8) per column (6 columns), consumed MSB-first
 *     via rotate, matching tentacle_shape_tables in tako.c. NOT const:
 *     rotated in place every frame.
 */
static const uint8_t tiles_pose0[6]  = { 0x05, 0x03, 0x04, 0x02, 0x00, 0x01 };
static const uint8_t tiles_pose1[9]  = { 0x0D, 0x0E, 0x0B, 0x0C, 0x06, 0x07, 0x0A, 0x08, 0x09 };
static const uint8_t tiles_pose2[10] = { 0x18, 0x16, 0x17, 0x12, 0x13, 0x14, 0x15, 0x11, 0x10, 0x0F };
static const uint8_t tiles_pose3[11] = { 0x23, 0x1E, 0x1F, 0x20, 0x21, 0x22, 0x19, 0x1A, 0x1B, 0x1C, 0x1D };
static const uint8_t tiles_pose4[12] = { 0x27, 0x23, 0x1E, 0x24, 0x25, 0x26, 0x22, 0x19, 0x1A, 0x1B, 0x1C, 0x1D };
static const uint8_t tiles_pose5[13] = { 0x2B, 0x2A, 0x23, 0x1E, 0x28, 0x29, 0x26, 0x22, 0x19, 0x1A, 0x1B, 0x1C, 0x1D };
static const uint8_t tiles_pose6[11] = { 0x23, 0x1E, 0x2E, 0x2F, 0x26, 0x22, 0x19, 0x2C, 0x2D, 0x1C, 0x1D };
static const uint8_t tiles_pose7[12] = { 0x32, 0x35, 0x1E, 0x31, 0x34, 0x37, 0x39, 0x19, 0x30, 0x33, 0x36, 0x38 };
static const uint8_t tiles_pose8[15] = { 0x44, 0x42, 0x43, 0x45, 0x1E, 0x3F, 0x40, 0x41, 0x39, 0x19, 0x3A, 0x3B, 0x3C, 0x3E, 0x3D };
static const uint8_t tiles_pose9[17] = { 0x54, 0x55, 0x52, 0x53, 0x4F, 0x50, 0x51, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x19, 0x46, 0x47, 0x48, 0x49 };
static const uint8_t tiles_poseA[16] = { 0x61, 0x63, 0x65, 0x60, 0x62, 0x64, 0x5B, 0x5C, 0x5D, 0x5E, 0x4E, 0x56, 0x57, 0x58, 0x59, 0x5A };

static const uint8_t *const pose_tile_tables[11] = {
    tiles_pose0, tiles_pose1, tiles_pose2, tiles_pose3,
    tiles_pose4, tiles_pose5, tiles_pose6, tiles_pose7,
    tiles_pose8, tiles_pose9, tiles_poseA,
};

static uint8_t mask_a[6] = { 0x00, 0x00, 0x04, 0x0C, 0x08, 0x18 };
static uint8_t mask_b[6] = { 0x00, 0x00, 0x0C, 0x0C, 0x38, 0x18 };
static uint8_t mask_c[6] = { 0x00, 0x04, 0x0C, 0x3C, 0x18, 0x08 };
static uint8_t mask_d[6] = { 0x00, 0x00, 0x04, 0x7C, 0x7C, 0x00 }; /* byte_A557: shared by poses 3 and 6 */
static uint8_t mask_e[6] = { 0x00, 0x00, 0x14, 0x7C, 0x7C, 0x00 };
static uint8_t mask_f[6] = { 0x00, 0x20, 0x24, 0x7C, 0x7C, 0x00 };
static uint8_t mask_g[6] = { 0x00, 0x00, 0x30, 0x7C, 0x7C, 0x00 };
static uint8_t mask_h[6] = { 0x00, 0x20, 0x70, 0x7C, 0x7C, 0x08 };
static uint8_t mask_i[6] = { 0x60, 0x60, 0x70, 0x7C, 0x7C, 0x00 };
static uint8_t mask_j[6] = { 0x00, 0xE0, 0xE0, 0x7C, 0x7C, 0x00 };

/* Deliberately aliased at indices 3 and 6 -- matches the original data
 * layout exactly (see the big comment at the top of the file). */
static uint8_t *const pose_mask_tables[11] = {
    mask_a, mask_b, mask_c, mask_d,
    mask_e, mask_f, mask_d, mask_g,
    mask_h, mask_i, mask_j,
};

/*
 * ============================================================================
 * Cutscene script (byte_A3BB): one entry consumed per frame.
 * ============================================================================
 * Values 0x00-0x7F select a pose (stored into current_pose). Values with
 * the top bit set are commands, dispatched by dispatch_script_command():
 *   0x8X - show dialog box X (X = low nibble, the dialog index passed to
 *          show_dialog_box(), which forwards a JASHIIN_*_STR id to game.js)
 *   0xC0 - clear the dialog box area
 *   0xE0 - play sound effect 56
 *   0xFF - end the scene (clear is_jashiin_cavern)
 * script_cursor is pre-incremented before indexing, so index 0 of this
 * table is never actually read (matches "inc byte_A59C" preceding the
 * xlat in the original).
 */
static const uint8_t cutscene_script[135] = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x01, 0x01,
    0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x03, 0x81, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
    0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03,
    0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0xC0, 0x03, 0x03, 0x03, 0x04, 0x04, 0x05, 0x82,
    0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
    0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05,
    0xC0, 0x05, 0x05, 0x06, 0x06, 0x07, 0xE0, 0x08, 0x08, 0x09, 0x09, 0x0A, 0x0A, 0x0A, 0xFF,
};

/*
 * ============================================================================
 * Dialog box text ids (unk_A448 / unk_A463 / unk_A47A off_A442 table)
 * ============================================================================
 * The original strings ("Finally, you reached me.", "I enjoyed your show.",
 * "Come on!  I'll kill you.") live in game.js's NOTIFICATION_STRINGS table;
 * the 0x8X script command below only forwards the dialog index, which
 * show_dialog_box() maps to one of the JASHIIN_*_STR ids from zeliard.h.
 */

/*
 * Forward declarations
 */
static void restore_previous_frame_sprites(void); /* loc_A245..loc_A273 */
static void dispatch_script_command(uint8_t op);   /* loc_A350 */
static void show_dialog_box(uint8_t text_index);   /* loc_A376 */
static void clear_dialog_area(void);               /* loc_A3A2 */
static void render_current_pose(void);             /* loc_A290..loc_A34B */

/*
 * Jashiin1_AI_reset - clear all persistent static state so a fresh encounter
 * behaves correctly even after a save/restore cycle.
 */
void Jashiin1_AI_reset(void)
{
    sprite_write_cursor = 0;
    current_col_rel_x = 0;
    current_pose = 0;
    script_cursor = 0;
}

/*
 * Jashiin1_AI - entry point, called once per frame. Unlike the other bosses
 * this is a non-interactive cutscene: there is no hit-detection pass and
 * boss_hp is never touched.
 */
void Jashiin1_AI(uint16_t m)
{
    (void)m;

    restore_previous_frame_sprites();

    /* loc_A273: reset this frame's sprite list before laying it out again. */
    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    MEM16(base) = 0xFFFF;

    script_cursor++;
    uint8_t op = (script_cursor < sizeof(cutscene_script))
                     ? cutscene_script[script_cursor]
                     : 0xFF; /* defensive: original relies on the scene having
                                already ended (is_jashiin_cavern cleared) by
                                the time this table would run out */

    if (!(op & 0x80)) {
        current_pose = op; /* loc_A28D: plain pose byte */
    } else {
        dispatch_script_command(op); /* loc_A350 */
    }

    /* loc_A290..loc_A34B: (re)draw the current pose every frame, whether
     * this frame's script entry was a pose change or a command. */
    render_current_pose();
}

/*
 * loc_A245..loc_A273: walk last frame's body-part pseudo-monster entries
 * and restore the proximity-map tiles they overwrote.
 */
static void restore_previous_frame_sprites(void)
{
    uint16_t si = MEM16(ADDR_MONSTERS_LIST);
    sprite_write_cursor = 0;

    while (MEM16(si + 0) != 0xFFFF) { // .currX sentinel: end of list
        uint8_t rel;
        if (is_in_proximity_window(MEM16(si + 0), &rel)) {
            MEM8(si + 3) = rel; // .m_x_rel

            uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); // .m_x_rel, .currY
            MEM8(di) = MEM8(ADDR_PROXIMITY_LAYER2 + sprite_write_cursor);
        }

        sprite_write_cursor++;
        si += 16;
    }
}

/*
 * loc_A350: dispatch a cutscene command byte (top bit set). Whatever the
 * command, control always falls through to render_current_pose() back in
 * Jashiin1_AI() afterwards -- mirrored here simply by returning normally.
 */
static void dispatch_script_command(uint8_t op)
{
    uint8_t group = (uint8_t)(op & 0xF0);

    if (group == 0x80) {
        show_dialog_box((uint8_t)(op & 0x0F));
    } else if (group == 0xC0) {
        clear_dialog_area();
    } else if (group == 0xE0) {
        MEM8(ADDR_SOUND_FX_REQUEST) = 56;
    } else if (op == 0xFF) {
        MEM8(ADDR_IS_JASHIIN_CAVERN) = 0;
    }
    /* any other value: unrecognized command, original silently ignores it too */
}

/*
 * loc_A376: signal game.js to draw a bordered dialog box with the text for
 * the requested dialog. Only a string id is passed; the actual strings and
 * the box rendering live in game.js (NOTIFICATION_STRINGS / drawDungeonNotification).
 */
static void show_dialog_box(uint8_t text_index)
{
    static const uint8_t str_ids[3] = {
        JASHIIN_FINALLY_STR,
        JASHIIN_ENJOYED_STR,
        JASHIIN_COMEON_STR,
    };
    if (text_index >= 3) return; /* defensive; script data only ever uses 0..2 */

    render_notification_string(str_ids[text_index]);
}

/*
 * loc_A3A2: blank a 26x2 tile block starting at viewport tile row 2,
 * column 1 (clears the dialog-box area of the on-screen room after use).
 * Also clears the JS notification flag so game.js immediately hides the
 * dialog box it drew for the 0x8X command.
 */
static void clear_dialog_area(void)
{
    uint16_t dest = ADDR_VIEWPORT_ENTITIES + 2 * VIEW_COLS + 1;

    for (uint8_t row = 0; row < 2; row++) {
        for (uint8_t col = 0; col < 26; col++) {
            MEM8(dest + col) = 0xFE;
        }
        dest = (uint16_t)(dest + VIEW_COLS);
    }

    MEM8(ADDR_NOTIFICATION_FLAG) = 0;
}

/*
 * loc_A290..loc_A34B: lay out Jashiin's 6 body-part columns x up to 8 rows
 * using the tile/mask table pair selected by current_pose, turning each
 * set mask bit into a (non-hittable) pseudo-monster sprite entry.
 */
static void render_current_pose(void)
{
    uint16_t boss_state = MEM16(ADDR_BOSS_STATE_PTR);

    /* loc_A290: poses 0-2 face/stand one way, poses 3+ another */
    uint16_t col_x = (current_pose < 3) ? 0x10 : 0x0D;
    MEM16(boss_state + 0) = col_x; // .boss_x

    sprite_write_cursor = 0;

    const uint8_t *tile = pose_tile_tables[current_pose]; // di
    uint8_t *mask = pose_mask_tables[current_pose];        // bp, mutable: rotated in place below

    uint16_t base = MEM16(ADDR_MONSTERS_LIST);
    uint16_t si = base;

    for (uint8_t col = 0; col < 6; col++) {
        uint8_t rel;
        int in_range = is_in_proximity_window(col_x, &rel);
        current_col_rel_x = rel;

        if (!in_range) {
            /* Out of view: still rotate through this column's 8 row-bits
             * and advance the tile pointer for every set bit, so the next
             * column resumes at the right place, but skip creating any
             * sprite entries. */
            for (uint8_t row = 0; row < 8; row++) {
                uint8_t carry = (uint8_t)((*mask & 0x80) != 0);
                *mask = (uint8_t)((*mask << 1) | carry);
                if (carry) tile++;
            }
        } else {
            for (uint8_t row = 0; row < 8; row++) {
                uint8_t carry = (uint8_t)((*mask & 0x80) != 0);
                *mask = (uint8_t)((*mask << 1) | carry);
                if (!carry) continue;

                MEM16(si + 0) = col_x;                                                     // .currX
                MEM8(si + 2) = (uint8_t)((MEM8(boss_state + 2) + row * 2) & 0x3F);          // .currY = (boss_y + row*2) & 0x3F
                MEM8(si + 3) = current_col_rel_x;                                            // .m_x_rel
                uint8_t packed = *tile;
                MEM8(si + 4) = (uint8_t)(packed >> 4);   // .flags <- tile idx (high nibble)
                MEM8(si + 6) = (uint8_t)(packed & 0x0F); // .anim_counter (low nibble)
                MEM8(si + 5) = 0;                          // .ai_flags: never hittable in this room

                uint16_t di = coords_to_prox_addr(MEM8(si + 3), MEM8(si + 2)); // .m_x_rel, .currY
                uint8_t old_tile = MEM8(di);
                MEM8(di) = (uint8_t)(sprite_write_cursor | 0x80);
                MEM8(ADDR_PROXIMITY_LAYER2 + sprite_write_cursor) = old_tile;

                si += 16;
                sprite_write_cursor++;
                tile++;
            }
        }

        mask++;
        col_x += 2;
    }

    MEM16(si) = 0xFFFF; // terminator after the last body-part segment
}
