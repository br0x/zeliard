/*
 * town.c — Port of town.asm to C for Zeliard WebAssembly port
 *
 * Memory layout (WASM linear):
 *   0x0000–0x00FF  SaveData / shared state
 *   0x6000–0x7C7C  town.asm code region (data lives here too)
 *   0xFF00–0xFFFF  Shared registers / HW-mapped variables
 *
 * All raw memory accesses use MEM8/MEM16 macros into a single
 * uint8_t g_mem[] array that represents the flat WASM linear memory.
 * Addresses match the original DOS seg0 layout exactly.
 *
 * External (gtmcga / gmmcga) procedures are declared as function-
 * pointer stubs so the JS/WASM bridge can patch them in at runtime.
 * 
 * Prepare to load town:
 * 1. load 3 fonts from font.grp to bold_font_8x8, digits_font, thin_font
 * 2. Init variables with zero:
 *      on_rope_flags
 *      hero_hidden_flag
 *      sword_swing_flag
 *      ui_element_dirty
 *      spell_active_flag
 *      jump_phase_flags
 *      squat_flag
 *      hero_damage_this_frame
 *      byte_FF3E
 *      byte_FF4B
 *      heartbeat_volume
 *      hero_animation_phase
 *      keyboard_alt_mode_flag
 *      font_highlight_flag
 *      shield_anim_active
 *      slope_direction
 * 3a. For restart: 
 *      Load gdmcga.bin to seg0:0x3000
 *      run opening intro
 * 3b. For restore: 
 *      set palette
 *      load gtmcga.bin into seg0:0x3000
 *      load town.bin into seg0:0x6000
 *      load gfmcga.bin into seg2:0x9000
 *      load fight.bin into seg2:0xC000
 *      load select.bin into seg1:0xC000
 *      load itemp.grp 7 groups of sprites into seg1:
 *         sword_item_gfx           0xE200
 *         shield_item_gfx          0xE202
 *         crest_item_gfx           0xE204
 *         magic_spell_item_gfx     0xE206
 *         key_item_gfx             0xE208
 *         magic_potion_item_gfx    0xE20A
 *         wearable_item_gfx        0xE20C
 *      load magic.grp into seg2:0
 *      load sword.grp 3 mega-groups of sprites into seg2:0x1800, 0x1802, 0x1804
 *      fn4_load_sword_graphics(sword_type) - copies sprites to seg1:0B000h
 *      load and execute mole.bin (seg3:0) - draws decorations around game canvas
 *      render tears collected so far
 *      render sword item on HUD, 20x18
 *      render shield item on HUD, 16x16
 *      render magic item on HUD, 16x16
 *      load mdt(place_map_id)
 *      parse town descriptor, according to it:
 *      choose and load music        ; to seg1:3000h
 *      choose and load mman/cman.grp   ; to seg1:4000h
 *      run town_entry_disabling_edge_scroll
 */

#include <stdint.h>
#include <string.h>
#include "town.h"


/* =========================================================================
 * Memory access helpers
 * ========================================================================= */
#define MEM8(addr)   (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)  (*(uint16_t*)&g_mem[(addr) & 0xFFFF])

/* seg1 base in WASM linear memory = 0x10000 */
#define SEG1_BASE    0x10000u
#define SEG2_BASE    0x20000u
#define SEG3_BASE    0x30000u

/* seg1 byte read helper */
#define SEG1_8(off)  (g_mem[SEG1_BASE + ((off) & 0xFFFF)])
#define SEG1_16(off) (*(uint16_t*)&g_mem[SEG1_BASE + ((off) & 0xFFFF)])

/* =========================================================================
 * Shared addresses (seg0:0xFF00–0xFFFF)
 * ========================================================================= */
#define ADDR_VIDEO_DRV_ID          0xFF14
#define ADDR_ALT_SPACE             0xFF16
#define ADDR_RIGHT_LEFT_DOWN_UP    0xFF17
#define ADDR_ENTER_KEYS            0xFF18
#define ADDR_FRAME_TIMER           0xFF1A
#define ADDR_ANIM_TIMER            0xFF1B
#define ADDR_SPACEBAR_LATCH        0xFF1D
#define ADDR_ALTKEY_LATCH          0xFF1E
#define ADDR_PROXIMITY_START_TILES 0xFF2A  /* word */
#define ADDR_SEG1_VALUE            0xFF2C  /* word: seg1 paragraph */
#define ADDR_SPEED_CONST           0xFF33
#define ADDR_HERO_Y_ABSOLUTE       0xFF35
#define ADDR_SQUAT_FLAG            0xFF38
#define ADDR_SLOPE_DIRECTION       0xFF42
#define ADDR_SWORD_SWING_FLAG      0xFF43
#define ADDR_TICK_COUNTER          0xFF50  /* word */
#define ADDR_MENU_ITEM_COUNT       0xFF52
#define ADDR_MENU_MAX_ITEMS        0xFF53
#define ADDR_MENU_BASE_ADDR        0xFF54  /* word */
#define ADDR_MENU_CURSOR_POS       0xFF56
#define ADDR_MENU_DIGITS_FLAG      0xFF57
#define ADDR_BYTE_FF58             0xFF58  /* scrollable menu format table */
#define ADDR_NUMERIC_DISPLAY_X     0xFF68
#define ADDR_STRING_WIDTH_BYTES    0xFF6A  /* word */
#define ADDR_SAVE_NAME             0xFF6C  /* 8 bytes */
#define ADDR_KEYBOARD_ALT_FLAG     0xFF74
#define ADDR_SOUND_FX_REQUEST      0xFF75
#define ADDR_FONT_HIGHLIGHT_FLAG   0xFF77
#define ADDR_DISK_SWAP_SUPPRESSED  0xFF78
#define ADDR_CURRENT_ASCII_CHAR    0xFF29
#define ADDR_DIALOG_STRING_PTR     0xFF4C  /* word */
#define ADDR_DIALOG_CURSOR_X       0xFF4E
#define ADDR_DIALOG_SCROLL_COUNTER 0xFF4F
#define ADDR_BYTE_FF24             0xFF24

/* savegame area offsets (seg0:0x0000) */
#define ADDR_BYTE4                 0x0004
#define ADDR_SPOKE_TO_KING         0x0005
#define ADDR_ENTERED_CAVERN        0x0006
#define ADDR_CALIENTE_ITEMS        0x0034
#define ADDR_FALTER_ITEMS          0x0045
#define ADDR_ELF_CREST             0x009a

/* Hero stats */
#define ADDR_HERO_GOLD_LO          0x0086  /* word */
#define ADDR_HERO_GOLD_HI          0x0088
#define ADDR_HERO_ALMAS            0x008b  /* word */
#define ADDR_HERO_LEVEL            0x008d
#define ADDR_HERO_XP               0x008e  /* word */
#define ADDR_HERO_HP               0x0090  /* word */
#define ADDR_SHIELD_TYPE           0x0093
#define ADDR_CURRENT_MAGIC_SPELL   0x009d
#define ADDR_INVINCIBILITY_FLAG    0x00e8
#define ADDR_IS_DEATH_PROCESSED    0x0049
#define ADDR_FACING_DIRECTION      0x00c2  /* bit0: 0=right, 1=left; bit1: 0=Down, 1=Up */
#define ADDR_PLACE_MAP_ID          0x00c4

/* Town-local variables (live in seg0:0x6000 data region).
 * In WASM we put them in a dedicated struct instead of overlaying the
 * code region, keeping the original offsets for reference only.        */
#define ADDR_TOWN_TRANSITION_FLAG  0x7C42
#define ADDR_DISABLE_EDGE_SCROLL   0x7C43
#define ADDR_EDGE_SCROLL_ENABLED   0x7C44
#define ADDR_TOWN_HAS_MIDDLE_LAYER 0x7C45
#define ADDR_PAT_ID                0x7C46
#define ADDR_EDGE_SCROLL_HANDLER   0x7C47  /* word — not used directly in C */
#define ADDR_HERO_X_WORD           0x7C49  /* word: absolute hero x */
#define ADDR_HERO_MOVED_FLAG       0x7C4B
#define ADDR_DIALOG_RECT_POS       0x7C4C  /* word */
#define ADDR_DIALOG_CURSOR_POS     0x7C4E  /* word */
#define ADDR_DIALOG_SRC_RECT       0x7C50  /* word */
#define ADDR_DIALOG_PAGE_COUNT     0x7C52
#define ADDR_DIALOG_CHAR_X         0x7C53
#define ADDR_DIALOG_CHAR_Y         0x7C54
#define ADDR_DIALOG_LINE_START_X   0x7C55
#define ADDR_DIALOG_CHARS_ON_LINE  0x7C56
#define ADDR_DIALOG_LINES_RENDERED 0x7C57
#define ADDR_DIALOG_TEXT_PTR       0x7C58  /* word */
#define ADDR_DIALOG_RECT_END       0x7C5A  /* word */
#define ADDR_DIALOG_EXIT_FLAG      0x7C5C
#define ADDR_MENU_HIGHLIGHT_TOGGLE 0x7C5D
#define ADDR_SAVE_NAME_COUNT       0x7C5E
#define ADDR_SAVE_SLOT_HAS_NAME    0x7C5F
#define ADDR_SAVE_NAME_RECT_POS    0x7C60  /* word */
#define ADDR_SAVE_NAME_RECT_Y      0x7C62
#define ADDR_SAVE_CURSOR_ROW       0x7C63
#define ADDR_SAVE_IS_RESTART       0x7C64
#define ADDR_SAVE_BUFFER_PADDING   0x7C65
#define ADDR_SAVE_NAME_BUFFER      0x7C67  /* 7 chars + terminator */
#define ADDR_SAVE_NAME_TERMINATOR  0x7C6E
#define ADDR_HERO_2X3_TILE_BUF     0x7C74  /* 6 bytes: 2 cols × 3 rows */
#define ADDR_HERO_1X3_TILE_BUF     0x7C7A  /* 3 bytes */
#define ADDR_HERO_ANIMATION_PHASE  0x00e7
#define ADDR_BYTE_9F               0x009f
#define ADDR_BYTE_E4               0x00e4
#define ADDR_SPACEBAR_LATCH_LOCAL  ADDR_SPACEBAR_LATCH
#define ADDR_ALTKEY_LATCH_LOCAL    ADDR_ALTKEY_LATCH

/* seg1 offsets */
#define SEG1_TOWN_MSD_MUSIC        0x3000
#define SEG1_MMAN_CMAN_GFX         0x4000
#define SEG1_TMAN_GFX              0x6000
#define SEG1_SPECIAL_TILE_LIST_PTR 0x8002  /* placeholder — real offset TBD */

/* seg0:0xC000 — town descriptor base (MDT loaded here) */
#define ADDR_TOWN_DESCRIPTOR       0xC000
#define ADDR_MAP_WIDTH             0xC002  /* word */
#define ADDR_TOWN_NAME_INFO        0xC004  /* word */
#define ADDR_TOWN_ID               0xC006
#define ADDR_TOWN_TRANSITION_TABLE 0xC007  /* word */
#define ADDR_DOORS_ARRAY           0xC009  /* word */
#define ADDR_DUNGEON_ENTRANCE_TABLE 0xC00B /* word */
#define ADDR_NPC_CONVERSATIONS     0xC00D  /* word */
#define ADDR_NPC_ARRAY             0xC00F  /* word */
#define ADDR_NPC_PATROL_BOUNDARIES 0xC011  /* word */
#define ADDR_WORD_C015             0xC015  /* word */
#define ADDR_TOWN_TILES            0xC017
#define ADDR_NPC_HEAD_TILES        0xC01C

/* Hero x in viewport (number of columns from left of 28-col view) */
#define ADDR_HERO_X_IN_VIEWPORT    0x0083
/* Proximity map left column absolute x */
#define ADDR_PROXIMITY_MAP_LEFT_COL_X 0x0080  /* word */
/* Hero name address used in town_entry */
#define ADDR_SAGE_BIN_ADDR         0xa000  /* placeholder */
#define ADDR_TOWN_INDOORS_BIN_ADDR 0xa000  /* placeholder */
#define ADDR_GAME_BIN_ENTRY        0xa000  /* placeholder */
#define ADDR_VIEWPORT_TOP_ROW_Y    0x0082

/* viewport_buffer: seg0:0xE000, 28 columns × 8 rows = 224 bytes */
#define ADDR_VIEWPORT_BUFFER       0xE000
#define ADDR_WORD_E001             0xE001  /* word (pointer used in save list) */

#define ADDR_SCROLL_REQUEST  0xFFF0 // bit 0: floor right, bit 1: floor left, bit 2: ceiling right, bit 3: ceiling left
/* =========================================================================
 * Transition-pending state (WASM→JS async handshake)
 * ========================================================================= */
/* Written by handle_edge_screen_transition, cleared by JS after it has
 * loaded all resources and called wasm_town_entry_enabling_edge_scroll. */
#define ADDR_PENDING_TRANSITION_MAP  0xFFF1  /* byte: dest map id (with 0x80 set) */
#define ADDR_PENDING_TRANSITION_PAT  0xFFF2  /* byte: new pat_id */
#define ADDR_PENDING_TRANSITION_DIR  0xFFF3  /* byte: 0=going right, 1=going left */
#define ADDR_PENDING_TRANSITION_FLAG 0xFFF4  /* byte: 0xFF = transition requested */

/* =========================================================================
 * Per-character rendering tables (char_x_offset, char_width_table)
 * Copied verbatim from town.asm data section.
 * ========================================================================= */
static const uint8_t char_x_offset[96] = {
    0, 2, 2, 3, 1, 0,  0, 2, 2, 3, 1, 1,
    1, 2, 2, 0, 1, 2,  1, 1, 1, 1, 1, 1,
    1, 1, 3, 2, 1, 1,  2, 1, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 2,  0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 1, 0,  0, 0, 0, 0, 1, 2,
    2, 2, 1, 1, 1, 0,  0, 1, 0, 1, 1, 0,
    0, 2, 1, 0, 2, 0,  1, 1, 0, 0, 0, 1,
    1, 0, 0, 0, 1, 1,  1, 2, 0, 3, 1, 0
};

static const uint8_t char_width_table[96] = {
    5, 4, 4, 4, 6, 8,  5, 3, 4, 4, 6, 6,
    6, 5, 6, 8, 7, 5,  7, 7, 7, 7, 7, 7,
    7, 7, 3, 4, 6, 6,  6, 7, 8, 8, 8, 8,
    8, 8, 8, 8, 8, 5,  8, 8, 8, 8, 8, 8,
    8, 8, 8, 8, 7, 8,  8, 8, 8, 8, 7, 5,
    3, 5, 6, 7, 7, 8,  8, 7, 8, 7, 7, 8,
    8, 5, 6, 8, 5, 8,  7, 7, 8, 8, 8, 7,
    6, 8, 8, 8, 7, 7,  7, 4, 8, 4, 7, 8
};

/* Hero sprite tile index tables (left-facing / right-facing, 5 frames × 6 tiles) */
static const uint8_t hero_faced_left[30] = {
    0x00,0x02,0x04,0x01,0x03,0x05,
    0x06,0x08,0x0A,0x07,0x09,0x0B,
    0x00,0x0C,0x0E,0x01,0x0D,0x0F,
    0x06,0x10,0x12,0x07,0x11,0x13,
    0x14,0x16,0x18,0x15,0x17,0x19
};
static const uint8_t hero_faced_right[30] = {
    0x1A,0x1C,0x1E,0x1B,0x1D,0x1F,
    0x20,0x22,0x24,0x21,0x23,0x25,
    0x1A,0x26,0x28,0x1B,0x27,0x29,
    0x20,0x2A,0x2C,0x21,0x2B,0x2D,
    0x14,0x16,0x18,0x15,0x17,0x19
};

/* String literals (ASCII, 0xFF-terminated) */
static const uint8_t str_take[]    = {'T','a','k','e',0};
static const uint8_t str_no_take[] = {'N','o',' ','T','a','k','e',0};
static const uint8_t str_yes[]     = {'Y','e','s',0};
static const uint8_t str_no[]      = {'N','o',0};
static const uint8_t str_restart[] = {'R','e','-','S','t','a','r','t',0};
static const uint8_t str_input_name[] = {'I','n','p','u','t',' ','n','a','m','e',':',0xFF};
static const uint8_t str_user_file_not_found[] =
    {'U','s','e','r',' ','F','i','l','e',0x0D,'N','o','t',' ','F','o','u','n','d',0xFF};
static const uint8_t str_usr_glob[] = {'*','.','u','s','r',0};

/* =========================================================================
 * External procedure stubs (implemented by gtmcga / gmmcga WASM modules
 * or by the JavaScript bridge).  The JS side sets these via:
 *   town_procs.render_town_tiles_28_columns = <fn>;
 * ========================================================================= */
TownProcs g_town_procs;  /* zero-initialised; JS sets members before calling wasm_town_init */
static uint8_t g_town_return_before_main_loop;
static uint8_t g_town_update_active;

/* Convenience wrappers that guard against NULL */
#define CALL_PROC(name, ...) \
    do { if (g_town_procs.name) g_town_procs.name(__VA_ARGS__); } while(0)

static uint8_t g_pending_wait = 0;          /* non-zero when waiting for frame timer */
static uint8_t g_pending_wait_target = 0;   /* target frame timer value */

/* =========================================================================
 * Forward declarations
 * ========================================================================= */
static void town_complete_wait(void);
static void town_entry_common(void);
static void town_main_loop_step(void);
static void update_npcs_and_render(void);
static void game_loop_with_frame_wait(void);
static void clear_6_hero_tiles_in_viewport_buffer(void);
static void update_npcs(void);
static void save_head_level_tiles_in_npcs(void);
static void restore_head_level_tiles_from_npcs(void);
static void render_life_almas_gold_place(void);
static void load_hero_town_sprite(void);
static void init_c015_obj_if_exists(void);
static void handle_inventory_key(void);
static void handle_edge_screen_transition(void);
static void hero_spacebar_interaction(void);
static void check_special_npc_conversation(void);
static void start_npc_conversation(uint16_t si_addr);
static void render_dialog_text(uint16_t rect_pos, uint8_t bx_pattern);
static void wait_for_dialog_input(void);
static int  measure_text_to_delimiter(uint16_t *si_ptr);
static int  count_dialog_lines(uint16_t si_addr, uint8_t *out_chars_on_line);
static void draw_dialog_cursor(void);
static void check_tile_in_special_list(uint8_t tile, int *found);
static void find_non_passable_npc_at_x_pos(uint16_t x, uint16_t *si_out, int *found);
static void find_first_npc_at_x(uint16_t dx, uint16_t *si_out);
static void scroll_dialog_up(void);
static void scroll_dialog_down(void);
static void draw_next_page_arrow(void);
static void wait_for_dialog_continue(void);
static void npc_ai_look_at_hero_and_bob(uint16_t si, uint16_t *dx);
static void npc_ai_patrol_1bit_phase(uint16_t si, uint16_t *dx);
static void npc_ai_patrol_2bit_phase(uint16_t si, uint16_t *dx);
static void npc_ai_face_hero(uint16_t si, uint16_t *dx);
static void npc_ai_bob_in_place(uint16_t si, uint16_t *dx);
static void npc_ai_patrol_bounce_1bit(uint16_t si, uint16_t *dx);
static void npc_ai_patrol_bounce_2bit(uint16_t si, uint16_t *dx);
static void npc_ai_static(uint16_t si, uint16_t *dx);
static void patrol_between_boundaries(uint16_t si, uint16_t *dx, uint8_t ch);
static void patrol_bounce_at_phase(uint16_t si, uint16_t *dx, uint8_t ch);
static void load_town_transition_data(uint16_t si);
static void load_town_transition_data_inner(uint8_t dest_map_id, uint8_t pat_id_new, uint16_t si);
static int  confirm_purchase_dialog(void);   /* returns 1="Take", 0="No Take" */
static int  show_yes_no_dialog(void);        /* returns 1="Yes",  0="No" */
static void render_menu_string_list(uint16_t si, uint8_t count);
static void select_from_menu(uint8_t *cursor_row);  /* sets CF-equiv via return: 1=cancel */
static void render_menu_list_scrolling(uint16_t si, uint8_t count);
static int  check_gold_sufficient(uint16_t lo, uint8_t hi);
static void add_gold_to_hero(uint16_t lo, uint8_t hi);
static void convert_ax_to_decimal(uint16_t value, uint16_t di_addr);
static void restore_game(void);
static void choose_game_to_restore(void);
static void check_save_is_restart(void);
static void clear_save_name(void);
static void save_name_input_handler(void);
static void render_save_game_list(uint16_t si, uint8_t count);
static void render_save_name_string(void);
static void highlight_save_cursor(int8_t delta);
static void houseCursorShow(void);
static void houseCursorUp(uint8_t row);
static void houseCursorDown(uint8_t row);
static void npcAnimation(void);
static void find_first_npc_at_x_after_current(uint16_t dx, uint16_t *si_ptr);
static void swap_a000_c000_buffers(void);

/* =========================================================================
 * Helper macros for shared-memory variable access
 * ========================================================================= */
#define SPACEBAR   MEM8(ADDR_SPACEBAR_LATCH)
#define ALTKEY     MEM8(ADDR_ALTKEY_LATCH)
#define FRAME_TMR  MEM8(ADDR_FRAME_TIMER)
#define SPEED_C    MEM8(ADDR_SPEED_CONST)
#define HERO_ANIM  MEM8(ADDR_HERO_ANIMATION_PHASE)
#define FACING     MEM8(ADDR_FACING_DIRECTION)
#define HERO_XV    MEM8(ADDR_HERO_X_IN_VIEWPORT)
#define PROX_LEFT  MEM16(ADDR_PROXIMITY_MAP_LEFT_COL_X)
#define PROX_START MEM16(ADDR_PROXIMITY_START_TILES)
#define MAP_WIDTH  MEM16(ADDR_MAP_WIDTH)
#define MIDDLE_LYR MEM8(ADDR_TOWN_HAS_MIDDLE_LAYER)
#define EDGE_ON    MEM8(ADDR_EDGE_SCROLL_ENABLED)
#define PAT_ID     MEM8(ADDR_PAT_ID)
#define HERO_MOVED MEM8(ADDR_HERO_MOVED_FLAG)
#define DIALOG_EXIT MEM8(ADDR_DIALOG_EXIT_FLAG)
#define INVINC     MEM8(ADDR_INVINCIBILITY_FLAG)
#define DEATH_DONE MEM8(ADDR_IS_DEATH_PROCESSED)
#define HERO_GOLD_LO MEM16(ADDR_HERO_GOLD_LO)
#define HERO_GOLD_HI MEM8(ADDR_HERO_GOLD_HI)
#define HERO_ALMAS MEM16(ADDR_HERO_ALMAS)
#define INPUT_DIRS MEM8(ADDR_RIGHT_LEFT_DOWN_UP)   /* bits: right/left/down/up */
#define INPUT_ALT_SPACE MEM8(ADDR_ALT_SPACE)       /* bits: alt/space */

/* =========================================================================
 * town_entry_disabling_edge_scroll — primary init, called from fight.bin after dungeon
 * town_entry_enabling_edge_scroll — re-entry after sage resurrection / falter warp
 * ========================================================================= */
void town_entry_disabling_edge_scroll(void)
{
    MEM8(ADDR_DISABLE_EDGE_SCROLL) = 0xFF;
    town_entry_common();
}

void town_entry_enabling_edge_scroll(void)
{
    MEM8(ADDR_DISABLE_EDGE_SCROLL) = 0x00;
    town_entry_common();
}

static void town_entry_common(void)
{
    /* Apply sprite mask for town NPC graphics (164 sprites) */
    CALL_PROC(apply_sprite_mask, SEG1_BASE + SEG1_MMAN_CMAN_GFX + 0x100,
              SEG2_BASE + 0x7000, 164);

    /* Reset stack equivalent — nothing to do in C */

    load_hero_town_sprite();

    HERO_ANIM = 0;

    if (DEATH_DONE) {
        INVINC = 0;
    }

    CALL_PROC(clear_viewport);

    /* Parse town descriptor to find middle-layer and pat_id fields.
     * Format: [0]=msd_index, [1..n]=NPC entries (FF-terminated), then
     *         town_has_middle_layer byte, pat_id byte.               */
    {
        uint16_t si = MEM16(ADDR_TOWN_DESCRIPTOR);
        si++;  /* skip msd index */
        /* Skip until 0xFF NPC-type terminator */
        while (MEM8(si) != 0xFF) si++;
        si++;  /* skip 0xFF */
        MEM8(ADDR_TOWN_HAS_MIDDLE_LAYER) = MEM8(si++);
        MEM8(ADDR_PAT_ID) = MEM8(si);
    }

    MEM8(ADDR_EDGE_SCROLL_ENABLED) = 0;

    if (!INVINC) {
        if ((MIDDLE_LYR & 1) && !MEM8(ADDR_DISABLE_EDGE_SCROLL)) {
            MEM8(ADDR_EDGE_SCROLL_ENABLED) = 0xFF;
        }
        // load_town_background();
        // load_patterns_and_call_background();
        CALL_PROC(backup_upper_town_3_tiles);
        if (!DEATH_DONE) {
            CALL_PROC(adlib_fn0, SEG1_BASE + SEG1_TOWN_MSD_MUSIC);
        }
    }

    /* --- town_entry_internal --- */
    SPACEBAR = 0;
    ALTKEY   = 0;
    MEM8(ADDR_BYTE_E4) = 0;
    MEM8(ADDR_BYTE_9F) = 0;

    /* Clear HUD bars */
    CALL_PROC(clear_hud_bar, 0x02, 0x04, 0x21, 0);
    CALL_PROC(clear_hud_bar, 0x02, 0x1C, 0x42, 0);
    CALL_PROC(clear_hud_bar, 0x48, 0x1C, 0x42, 0);
    CALL_PROC(clear_place_enemy_bar);

    render_life_almas_gold_place();
    CALL_PROC(draw_hero_max_health);
    CALL_PROC(draw_hero_health);
    CALL_PROC(print_almas_decimal);
    CALL_PROC(print_gold_decimal);

    if (MEM8(ADDR_CURRENT_MAGIC_SPELL)) {
        CALL_PROC(clear_hud_bar, 0xAA, 0x1C, 0x17, 0);
        CALL_PROC(print_magic_left_decimal);
    }

    if (MEM8(ADDR_SHIELD_TYPE)) {
        CALL_PROC(clear_hud_bar, 0xC6, 0x1C, 0x17, 0);
        CALL_PROC(print_shield_hp_decimal);
    }

    /* Re-read pat_id after second FF-scan */
    {
        uint16_t si = MEM16(ADDR_TOWN_DESCRIPTOR);
        si++;
        while (MEM8(si) != 0xFF) si++;
        si += 2;  /* skip FF and middle-layer */
        MEM8(ADDR_PAT_ID) = MEM8(si);
    }

    /* Render town name */
    CALL_PROC(render_pascal_string_1, MEM16(ADDR_TOWN_NAME_INFO));

    /* Compute proximity_start_tiles = proximity_map_left_col_x * 8 + &town_tiles */
    {
        uint16_t left_col = PROX_LEFT;
        PROX_START = (uint16_t)(left_col * 8 + ADDR_TOWN_TILES);
    }

    save_head_level_tiles_in_npcs();

    if (INVINC) {
        /* Resurrect at sage */
        INVINC = 0;
        // load_town_background();
        /* Load kenjpro.bin (sage binary) and call sage resurrection handler */
        CALL_PROC(res_dispatcher_fn3, "KENJPRO.BIN", ADDR_SAGE_BIN_ADDR);
        CALL_PROC(fade_to_black_dithered);
        CALL_PROC(adlib_fn1);
        MEM8(ADDR_TOWN_TRANSITION_FLAG) = 0xFF;
        CALL_PROC(jump_word_a004);  /* sage resurrects hero */
        return;
    }

    /* --- normal_game: fill viewport_buffer sentinel row, init NPCs --- */
    {
        uint16_t di = ADDR_VIEWPORT_BUFFER;
        /* fill 224 bytes (28 columns) with 0xFE */
        memset(&g_mem[di], 0xFE, 224);
    }

    update_npcs_and_render();

    if (MEM8(ADDR_EDGE_SCROLL_ENABLED)) {
        /* Edge-scroll 4 times (smooth pan) based on facing direction */
        int is_left = (FACING & 1);
        for (int i = 0; i < 5; i++) {
            if (is_left)
                /* scroll right (hero facing left) */
                CALL_PROC(scroll_floor_right_8px);
            else
                CALL_PROC(scroll_floor_left_8px);
            update_npcs_and_render();
        }
    }

    HERO_MOVED = 0;

    if (DEATH_DONE) {
        CALL_PROC(adlib_fn0, SEG1_BASE + SEG1_TOWN_MSD_MUSIC);
    }

    if (g_town_return_before_main_loop) {
        return;
    }

    /* Main town game loop */
    for (;;) {
        town_main_loop_step();
    }
}

static void town_main_loop_step(void)
{
    update_npcs_and_render();
    // If conversation active, skip all hero-related logic
    if (MEM8(ADDR_CONVERSATION_ACTIVE)) {
        return;
    }

    handle_inventory_key();
    handle_edge_screen_transition();
    hero_spacebar_interaction();

    if (!HERO_MOVED) {
        check_special_npc_conversation();
    }
    HERO_MOVED = 0;

    /* Poll input (replaces int 61h).
     * INPUT_DIRS bits: bit0=up, bit1=down, bit2=left, bit3=right
     * INPUT_ALT_SPACE bits: bit0=space, bit1=alt               */
    // CALL_PROC(poll_input);

    uint8_t dirs = INPUT_DIRS;

    if (dirs == 0x01) { // up
        /* Up pressed → enter door */
        HERO_ANIM |= 1;
        /* Check for door interaction (jump to town_up_pressed logic) */
        /* (handled in check_special_npc_conversation via dialog_exit_flag) */
    } else if ((dirs & 0x0C) == 0x04) {
        /* Left pressed */
        /* Edge-scroll left handler (loc_6781) */
        {
            uint16_t bx = (uint16_t)((HERO_XV + 3) * 8) + PROX_START;
            uint8_t tile = MEM8(bx + 7); // bottom tile to the left of hero
            int found;
            check_tile_in_special_list(tile, &found);
            if (!found) {
                uint16_t tx = (uint16_t)(HERO_XV + 4) + PROX_LEFT - 1;
                uint16_t si_npc;
                find_non_passable_npc_at_x_pos(tx, &si_npc, &found);
                if (!found) {
                    HERO_ANIM = (HERO_ANIM + 1) & 3;
                    FACING |= 1;  /* face left */
                    if (HERO_XV >= 11) { // left threshold for scrolling
                        HERO_XV--; // no scrolling, normal movement
                    } else if (PROX_LEFT != 0) { // scroll the map, floor and ceiling
                        PROX_LEFT--;
                        PROX_START -= 8;
                        MEM8(ADDR_SCROLL_REQUEST) |= 0x01;  // floor right
                        // CALL_PROC(scroll_floor_right_8px);
                        if (MIDDLE_LYR == 1) MEM8(ADDR_SCROLL_REQUEST) |= 0x04; // ceiling right //CALL_PROC(scroll_ceiling_right_4px);
                    } else { // cannot scroll anymore, normal movement
                        HERO_XV--;
                    }
                    HERO_MOVED = 0xFF;
                }
            } else {
                tile == tile;
                uint8_t xv = HERO_XV;
                xv == xv;
            }
        }
    } else if ((dirs & 0x0C) == 0x08) {
        /* Right pressed */
        {
            uint16_t bx = (uint16_t)((HERO_XV + 6) * 8) + PROX_START;
            uint8_t tile = MEM8(bx + 7);
            int found;
            check_tile_in_special_list(tile, &found);
            if (!found) {
                uint16_t tx = (uint16_t)(HERO_XV + 4) + PROX_LEFT + 1;
                uint16_t si_npc;
                find_non_passable_npc_at_x_pos(tx, &si_npc, &found);
                if (!found) {
                    HERO_ANIM = (HERO_ANIM + 1) & 3;
                    FACING &= ~1;  /* face right */
                    if (HERO_XV < 16) { // right threshold for scrolling
                        HERO_XV++; // no scrolling, normal movement
                    } else {
                        uint16_t right_limit = MAP_WIDTH - 35;
                        if (PROX_LEFT + 1 == right_limit) {
                            HERO_XV++; // cannot scroll anymore, normal movement
                        } else { // scroll the map, floor and ceiling
                            PROX_LEFT++;
                            PROX_START += 8;
                            MEM8(ADDR_SCROLL_REQUEST) |= 0x02;  // floor left
                            // CALL_PROC(scroll_floor_left_8px);
                            if (MIDDLE_LYR == 1) MEM8(ADDR_SCROLL_REQUEST) |= 0x08; // ceiling left //CALL_PROC(scroll_ceiling_left_4px);
                        }
                    }
                    HERO_MOVED = 0xFF;
                }
            }
        }
    } else {
        HERO_ANIM |= 1;
        HERO_MOVED = 0xFF;
    }
}

/* =========================================================================
 * Checks for NPC ahead of hero and starts conversation.
 * ========================================================================= */
static void hero_spacebar_interaction(void)
{
    if (!SPACEBAR) return;
    SPACEBAR = 0;

    uint8_t viewport_col = HERO_XV + 4;
    uint16_t bx = (uint16_t)(viewport_col * 8 + 5) + PROX_START;
    uint16_t abs_x = (uint16_t)viewport_col + PROX_LEFT;

    int found_tile = 0;
    int delta = FACING & 1 ? -1 : 1;  /* direction to check: -1 for left, +1 for right */
    abs_x += delta;
    for (int i = 1; i <= 3; i++) {
        /* facing left — check tiles at -8, -16, -24 */
        /* facing right — check tiles at +8, +16, +24 */
        if (MEM8(bx + 8*delta*i) == 0xFD) { found_tile = 1; break; }
        abs_x += delta;
    }

    if (!found_tile) return;

    uint16_t npc_si = 0;
    find_first_npc_at_x(abs_x, &npc_si);

    /* Check bits 6..7 of n_flags — if set, NPC is busy */
    if (MEM8(npc_si + 6) & 0xC0) return;

    /* Save state, put NPC in conversation mode, converse; restore will be done in wasm_town_conversation_finish */
    MEM8(ADDR_CONVERSATION_SAVED_FACING) = MEM8(npc_si + 2);
    MEM8(ADDR_CONVERSATION_SAVED_AI)   = MEM8(npc_si + 5);

    // Freeze this NPC (AI = 7 => static)
    MEM8(npc_si + 5) = 7;
    // Make NPC face the hero
    if (FACING & 1)
        MEM8(npc_si + 2) &= 0x7F;   // face right
    else
        MEM8(npc_si + 2) |= 0x80;   // face left

    MEM8(npc_si + 4) |= 1; // n_anim_phase

    start_npc_conversation(npc_si);
}

/* =========================================================================
 * Checks if hero is 2 tiles ahead of NPC with n_flags bit7 set 
 * and initiates special NPC dialog.
 * ========================================================================= */
static void check_special_npc_conversation(void)
{
    uint8_t viewport_col = HERO_XV + 4;
    uint16_t bx = (uint16_t)(viewport_col * 8 + 5) + PROX_START;
    uint16_t abs_x = (uint16_t)viewport_col + PROX_LEFT;

    int delta = FACING & 1 ? -2 : 2;
    abs_x += delta;
    if (MEM8(bx + 8*delta) != 0xFD) return;
    uint16_t npc_si;
    find_first_npc_at_x(abs_x, &npc_si);
    if ((FACING & 1) && MEM8(npc_si + 2) & 0x80) return;
    if (!(MEM8(npc_si + 6) & 0x80)) return;

    MEM8(npc_si + 4) |= 1; // n_anim_phase
    DIALOG_EXIT = 0xFF;
    start_npc_conversation(npc_si);
}

/* =========================================================================
 * start_npc_conversation — signal JS to show dialog, freeze only this NPC
 * fixme: only save ai if called from spacebar interaction
 * ========================================================================= */
static void start_npc_conversation(uint16_t si_addr)
{
    // Store NPC address and original AI/facing
    MEM16(ADDR_CONVERSATION_NPC_ADDR) = si_addr;

    // Signal js to show dialog
    MEM8(ADDR_CONVERSATION_ACTIVE) = 1;

    // Play dialog opening sound
    MEM8(ADDR_SOUND_FX_REQUEST) = 30;
}

/* =========================================================================
 * Restores NPC state and clears flag
 * ========================================================================= */
void wasm_town_conversation_finish(void)
{
    if (!MEM8(ADDR_CONVERSATION_ACTIVE))
        return;

    uint16_t npc_addr = MEM16(ADDR_CONVERSATION_NPC_ADDR);
    if (npc_addr) {
        MEM8(npc_addr + 5) = MEM8(ADDR_CONVERSATION_SAVED_AI);
        MEM8(npc_addr + 2) = MEM8(ADDR_CONVERSATION_SAVED_FACING);
    }

    MEM8(ADDR_CONVERSATION_ACTIVE) = 0;
}

/* =========================================================================
 * render_dialog_text
 * Renders paginated, word-wrapped NPC dialog text with control codes.
 * ========================================================================= */
static void render_dialog_text(uint16_t rect_pos, uint8_t pattern_idx)
{
    HERO_ANIM |= 1;

    /* dialog_src_rect / dialog_cursor_pos = rect_pos */
    MEM16(ADDR_DIALOG_SRC_RECT)   = rect_pos;
    MEM16(ADDR_DIALOG_CURSOR_POS) = rect_pos;

    /* Look up the text pointer from npc_conversations_addr table */
    uint16_t conv_base = MEM16(ADDR_NPC_CONVERSATIONS);
    uint16_t text_ptr  = MEM16(conv_base + (uint16_t)(pattern_idx * 2));
    MEM8(ADDR_DIALOG_CHAR_X) = 0;
    MEM8(ADDR_DIALOG_CHAR_Y) = 0;
    MEM8(ADDR_DIALOG_LINE_START_X) = 0;
    MEM8(ADDR_DIALOG_LINES_RENDERED) = 0;
    MEM16(ADDR_DIALOG_TEXT_PTR) = text_ptr;

    /* Count dialog lines to size the box */
    uint8_t chars_on_line;
    count_dialog_lines(text_ptr, &chars_on_line);
    MEM8(ADDR_DIALOG_CHARS_ON_LINE) = chars_on_line;

    uint8_t box_lines = (chars_on_line < 8) ? chars_on_line : 8;
    uint8_t height = (uint8_t)(box_lines * 10 + 6);
    MEM16(ADDR_DIALOG_RECT_END) = (uint16_t)(0x2C00 | height);

    /* Centre the dialog box vertically */
    uint16_t cursor = MEM16(ADDR_DIALOG_CURSOR_POS);
    uint8_t  y_off  = 0x56 - height;
    uint8_t  lo = (uint8_t)(cursor & 0xFF);
    lo += y_off;
    /* adjust x centering */
    uint8_t hi = (uint8_t)(cursor >> 8);
    hi += hi;
    uint8_t x_adjust = (uint8_t)((box_lines & 0xFE) * 4);
    uint8_t x_half = (uint8_t)((0x40 - x_adjust) >> 1);
    lo -= x_half;
    MEM16(ADDR_DIALOG_CURSOR_POS) = (uint16_t)(lo | ((uint16_t)hi << 8));

    CALL_PROC(draw_bordered_rectangle, MEM16(ADDR_DIALOG_CURSOR_POS),
              MEM16(ADDR_DIALOG_RECT_END), 0xFF);

    /* Render characters */
    for (;;) {
        uint16_t si = MEM16(ADDR_DIALOG_TEXT_PTR);
        uint8_t  ch = MEM8(si);
        MEM16(ADDR_DIALOG_TEXT_PTR) = si + 1;

        if (ch == '/') {
            /* Newline */
            MEM8(ADDR_DIALOG_CHAR_X) = 0;
            MEM8(ADDR_DIALOG_CHAR_Y)++;
            if (MEM8(ADDR_DIALOG_CHAR_Y) == 8) {
                MEM8(ADDR_DIALOG_CHAR_Y)--;
                for (int i = 0; i < 10; i++) {
                    CALL_PROC(scroll_screen_rect_down,
                              (uint16_t)(MEM16(ADDR_DIALOG_CURSOR_POS) + 4),
                              MEM16(ADDR_DIALOG_RECT_END));
                }
            }
            MEM8(ADDR_DIALOG_LINES_RENDERED)++;
            if (MEM8(ADDR_DIALOG_LINES_RENDERED) >= 7) {
                if (MEM8(ADDR_DIALOG_CHARS_ON_LINE) == 8) continue;
                MEM8(ADDR_DIALOG_CHARS_ON_LINE) -= 7;
                /* Draw "more" arrow and wait */
                CALL_PROC(render_font_glyph, 0x54 /*bx*/, 0x4A /*cl*/, 0x027C);
                SPACEBAR = 0;
                ALTKEY   = 0;
                while (1) {
                    draw_dialog_cursor();
                    update_npcs_and_render();
                    if (DIALOG_EXIT || ALTKEY) break;
                    if (!SPACEBAR) continue;
                    /* Clear more arrow area */
                    CALL_PROC(draw_bordered_rectangle, 0x278B, 0x020A, 0);
                    SPACEBAR = 0;
                    MEM8(ADDR_DIALOG_LINES_RENDERED) = 0;
                    MEM8(ADDR_SOUND_FX_REQUEST) = 0x1D;
                    break;
                }
            }
            continue;
        }

        /* Control codes 0x81..0x8B */
        if (ch == 0x81) {
            /* Yes/No sub-dialog */
            uint16_t sub_rect = MEM16(ADDR_DIALOG_RECT_POS);
            sub_rect += 0x193F;
            sub_rect += sub_rect & 0xFF00;  /* double bh */
            CALL_PROC(draw_bordered_rectangle, sub_rect + 0x103, 0x0C19, 0xFF);
            MEM16(ADDR_MENU_BASE_ADDR) = (uint16_t)(sub_rect + 0x103);
            int yes = show_yes_no_dialog();
            pattern_idx = yes ? 0x0D : 0x0C;
            render_dialog_text(MEM16(ADDR_DIALOG_RECT_POS), pattern_idx);
            return;
        } else if (ch == 0x83) {
            MEM8(ADDR_CALIENTE_ITEMS) |= 0x80;
            MEM8(ADDR_ELF_CREST) = 0xFF;
            init_c015_obj_if_exists();
            wait_for_dialog_input();
            return;
        } else if (ch == 0x85) {
            DIALOG_EXIT = 0xFF;
            pattern_idx = 4;
            render_dialog_text(MEM16(ADDR_DIALOG_SRC_RECT), pattern_idx);
            return;
        } else if (ch == 0x87) {
            wait_for_dialog_input();
            pattern_idx = 5;
            render_dialog_text(MEM16(ADDR_DIALOG_SRC_RECT), pattern_idx);
            return;
        } else if (ch == 0x89) {
            /* Purchase confirmation (Asbestos Cape) */
            uint16_t sub_rect = MEM16(ADDR_DIALOG_RECT_POS);
            sub_rect += 0x1832;
            CALL_PROC(draw_bordered_rectangle, sub_rect + 0x203, 0x1219, 0xFF);
            MEM16(ADDR_MENU_BASE_ADDR) = (uint16_t)(sub_rect + 0x203);
            int take = confirm_purchase_dialog();
            if (take) {
                /* Subtract 2500 almas */
                uint16_t almas = HERO_ALMAS;
                if (almas >= 0x9C4) {
                    HERO_ALMAS = almas - 0x9C4;
                    CALL_PROC(print_almas_decimal);
                    MEM8(ADDR_CALIENTE_ITEMS) |= 0x40;
                    /* Find first empty slot and insert item type 5 */
                    for (uint16_t slot = 0xA1; ; slot++) {
                        if (!MEM8(slot)) { MEM8(slot) = 5; break; }
                    }
                    init_c015_obj_if_exists();
                    pattern_idx = 8;
                } else {
                    pattern_idx = 7;
                }
            } else {
                pattern_idx = 6;
            }
            render_dialog_text(MEM16(ADDR_DIALOG_RECT_POS), pattern_idx);
            return;
        } else if (ch == 0x8B) {
            MEM8(ADDR_BYTE4) |= 0x80;
            init_c015_obj_if_exists();
            return;
        } else if (ch == 0xFF) {
            wait_for_dialog_input();
            return;
        }

        /* Regular printable character */
        if (ch >= 0x20) {
            uint16_t cx_val = MEM16(ADDR_DIALOG_CURSOR_POS);
            uint8_t hi_byte = (uint8_t)(cx_val >> 8);
            uint8_t lo_byte = (uint8_t)(cx_val & 0xFF);
            uint16_t glyph_x = (uint16_t)(hi_byte * 8 + MEM8(ADDR_DIALOG_CHAR_X) + 4);
            uint8_t  glyph_y = (uint8_t)(lo_byte + MEM8(ADDR_DIALOG_CHAR_Y) * 10 + 4);

            uint8_t ch_idx = ch - 0x20;
            glyph_x -= char_x_offset[ch_idx];

            CALL_PROC(render_font_glyph, glyph_x, glyph_y, (uint16_t)ch);

            MEM8(ADDR_DIALOG_CHAR_X) += char_width_table[ch_idx];

            if (ch == 0x20) {
                /* Space: measure next word; wrap if needed */
                uint16_t next_si = MEM16(ADDR_DIALOG_TEXT_PTR);
                int word_width = measure_text_to_delimiter(&next_si);
                if ((int)MEM8(ADDR_DIALOG_CHAR_X) + word_width >= 0xA8) {
                    MEM8(ADDR_DIALOG_CHAR_X) = 0;
                    MEM8(ADDR_DIALOG_CHAR_Y)++;
                    /* (scroll / page logic handled above on next char) */
                }
            }
        }
    }
}

/* =========================================================================
 * wait_for_dialog_input
 * Waits for spacebar or alt key press.
 * ========================================================================= */
static void wait_for_dialog_input(void)
{
    SPACEBAR = 0;
    ALTKEY   = 0;

    /* Wait for all direction keys to be released */
    while (INPUT_DIRS) {
        draw_dialog_cursor();
        update_npcs_and_render();
        if (SPACEBAR || ALTKEY) return;
    }

    /* Now wait for any key */
    while (1) {
        draw_dialog_cursor();
        update_npcs_and_render();
        if (SPACEBAR || ALTKEY) return;
        if (INPUT_DIRS) return;  /* direction key counts too */
    }
}

/* =========================================================================
 * measure_text_to_delimiter — returns pixel width until space/slash/0x80+
 * ========================================================================= */
static int measure_text_to_delimiter(uint16_t *si_ptr)
{
    int width = 0;
    uint16_t si = *si_ptr;
    for (;;) {
        uint8_t c = MEM8(si++);
        if (c & 0x80) break;
        if (c == 0x20 || c == 0x2F) break;
        if (c < 0x20) continue;
        width += char_width_table[c - 0x20];
    }
    *si_ptr = si;
    return width;
}

/* =========================================================================
 * count_dialog_lines
 * Counts lines (sequences between '/' separators) for dialog box sizing.
 * Returns number of lines in *cl, maximum chars-on-line count in *out_chars.
 * ========================================================================= */
static int count_dialog_lines(uint16_t si_addr, uint8_t *out_chars_on_line)
{
    int lines = 0;
    int cur_line_width = 0;
    int has_content = 0;
    uint16_t si = si_addr;

    for (;;) {
        uint8_t c = MEM8(si++);
        if (c == 0xFF || c == 0) {
            if (has_content) lines++;
            break;
        }
        if (c == '/') {
            lines++;
            cur_line_width = 0;
            has_content = 0;
            continue;
        }
        if (c < 0x80) {
            if (c >= 0x20) {
                cur_line_width++;
                has_content = 1;
            }
        } else {
            if (has_content) lines++;
            break;
        }
    }
    /* Original logic stores "chars-on-line" as count modulo 8 pages */
    *out_chars_on_line = (uint8_t)(lines);
    return lines;
}

/* =========================================================================
 * draw_dialog_cursor — draws '>' cursor beside dialog text
 * ========================================================================= */
static void draw_dialog_cursor(void)
{
    uint16_t ax = MEM16(ADDR_DIALOG_CURSOR_POS);
    uint8_t  hi = (uint8_t)(ax >> 8);
    uint8_t  lo = (uint8_t)(ax & 0xFF);
    uint16_t rect_end = MEM16(ADDR_DIALOG_RECT_END);
    uint8_t  lo2 = (uint8_t)(lo + (uint8_t)(rect_end & 0xFF));

    if (lo2 < 0x56) return;  /* cursor not yet at bottom */

    /* Compute row inside viewport_buffer for cursor row */
    uint8_t row = (uint8_t)((lo2 - 0x4E) / 8);

    /* Fill cursor column in viewport_buffer with 0xFF for 0x16 entries */
    uint16_t di = 0xE000 + (uint16_t)((hi - (ax >> 8)) * 8);
    for (int r = 0; r < row; r++) {
        for (int col = 0; col < 0x16; col++) {
            MEM8(di + col * 8) = 0xFF;
        }
        di++;
    }
}

/* =========================================================================
 * check_tile_in_special_list
 * Looks up tile in seg1's special tile list (count-prefixed byte array).
 * ========================================================================= */
static void check_tile_in_special_list(uint8_t tile, int *found)
{
    uint16_t si = SEG1_16(SEG1_SPECIAL_TILE_LIST_PTR);
    uint8_t  count = SEG1_8(si);
    *found = 0;
    if (!count) return;  // empty list => any tile is passable
    si++;
    for (uint8_t i = 0; i < count; i++) {
        if (SEG1_8(si + i) == tile) { *found = 1; return; } // tile is special (non-passable)
    }
}

/* =========================================================================
 * find_non_passable_npc_at_x_pos
 * Walks NPC array looking for n_x == x with bit6 of n_flags set (non-passable).
 * ========================================================================= */
static void find_non_passable_npc_at_x_pos(uint16_t x, uint16_t *si_out, int *found)
{
    uint16_t si = MEM16(ADDR_NPC_ARRAY);
    *found = 0;
    for (;;) {
        uint16_t nx = MEM16(si);
        if (nx == 0xFFFF) return;
        if (nx == x && (MEM8(si + 6) & 0x40)) {
            *si_out = si;
            *found = 1;
            return;
        }
        si += 8;
    }
}

static void find_first_npc_at_x(uint16_t dx, uint16_t *si_out)
{
    uint16_t si_ptr = MEM16(ADDR_NPC_ARRAY);
    find_first_npc_at_x_after_current(dx, &si_ptr);
    *si_out = si_ptr;
}

/* =========================================================================
 * update_npcs_and_render — thin wrapper: init NPCs, then render one frame
 * ========================================================================= */
static void update_npcs_and_render(void)
{
    update_npcs();
    game_loop_with_frame_wait();
}

/* =========================================================================
 * Prepare hero, render tiles, wait for frame
 * ========================================================================= */
static void game_loop_with_frame_wait(void)
{
    clear_6_hero_tiles_in_viewport_buffer();
    // CALL_PROC(render_town_tiles_28_columns);

    uint8_t target = (uint8_t)(SPEED_C * 4);

    if (g_town_update_active) {
        /* Called from JS-driven main loop: timer already reached target,
           just reset FRAME_TMR and return. */
        FRAME_TMR = 0;
        return;
    }

    /* Outside the main loop (e.g., during initialization, conversations):
       we must wait for target frames without blocking. Set a pending wait
       and return; the JS timer will call town_complete_wait() later. */
    g_pending_wait = 1;
    g_pending_wait_target = target;
}

/* =========================================================================
 * find_first_npc_at_x_after_current — linear scan of NPC array for matching x
 * ========================================================================= */
static void find_first_npc_at_x_after_current(uint16_t dx, uint16_t *si_ptr)
{
    for (;;) {
        if (MEM16(*si_ptr) == dx) return;
        *si_ptr += 8;
    }
}

/* =========================================================================
 * Marks the 2×3 hero tile block in viewport_buffer as dirty (0xFF).
 * ========================================================================= */
static void clear_6_hero_tiles_in_viewport_buffer(void)
{
    uint8_t vp_col = HERO_XV;
    if (vp_col >= 27) return;

    uint16_t di = (uint16_t)(ADDR_VIEWPORT_BUFFER + vp_col * 8 + 5);
    MEM8(di+0) = 0xFF;
    MEM8(di+1) = 0xFF;
    MEM8(di+2) = 0xFF;
    MEM8(di+5) = 0xFF;
    MEM8(di+6) = 0xFF;
    MEM8(di+7) = 0xFF;
}

/* =========================================================================
 * update_npcs — run AI for each NPC in the array
 * ========================================================================= */

typedef void (*NpcAiFn)(uint16_t si, uint16_t *dx);

static NpcAiFn npc_ai_table[8] = {
    npc_ai_look_at_hero_and_bob,
    npc_ai_patrol_1bit_phase, // fast
    npc_ai_patrol_2bit_phase, // slow
    npc_ai_face_hero,
    npc_ai_bob_in_place,
    npc_ai_patrol_bounce_1bit,
    npc_ai_patrol_bounce_2bit,
    npc_ai_static,
};

static void update_npcs(void)
{
    restore_head_level_tiles_from_npcs();
    uint16_t si = MEM16(ADDR_NPC_ARRAY);
    for (;;) {
        uint16_t dx = MEM16(si); // n_x
        if (dx == 0xFFFF) {
            save_head_level_tiles_in_npcs();
            return;
        }
        uint8_t ai_type = MEM8(si + 5); // n_ai_type
        if (ai_type < 8) npc_ai_table[ai_type](si, &dx);
        MEM16(si) = dx; // update x coord
        si += 8;
    }
}

/* =========================================================================
 * NPC AI implementations
 * ========================================================================= */
// AI fn0+
static void npc_ai_look_at_hero_and_bob(uint16_t si, uint16_t *dx)
{
    uint16_t hero_abs = (uint16_t)(HERO_XV + 4) + PROX_LEFT;
    if (hero_abs >= *dx) {
        MEM8(si + 2) &= 0x7F; // hero is to the right, face right
    } else {
        MEM8(si + 2) |= 0x80; // hero is to the left, face left
    }
    npc_ai_bob_in_place(si, dx);
}

// always called when n_anim_phase higher bits are zero, so we incrementing low bits
static void patrol_between_boundaries(uint16_t si, uint16_t *dx, uint8_t ch)
{
    MEM8(si + 4) = (ch + 1) & 0x0f; // n_anim_phase

    uint16_t patrol_bx = MEM16(ADDR_NPC_PATROL_BOUNDARIES);
    if (MEM8(si + 2) & 0x80) { // n_facing
        /* moving left */
        (*dx)--;
        if (*dx <= MEM16(patrol_bx)) { // left boundary
            MEM8(si + 2) &= 0x7F; // start walking right
        }
    } else {
        /* moving right */
        (*dx)++;
        if (*dx > MEM16(patrol_bx + 2)) { // right boundary
            MEM8(si + 2) |= 0x80; // start walking left
        }
    }
}

// AI fn1+
static void npc_ai_patrol_1bit_phase(uint16_t si, uint16_t *dx)
{
    uint8_t al = MEM8(si + 4); // n_anim_phase
    al += 0x10;
    MEM8(si + 4) = al;
    uint8_t ch = al;
    al &= 0x10; // every 2nd call
    if (al == 0) patrol_between_boundaries(si, dx, ch);
}

// AI fn2+
static void npc_ai_patrol_2bit_phase(uint16_t si, uint16_t *dx)
{
    uint8_t al = MEM8(si + 4);
    al += 0x10;
    MEM8(si + 4) = al;
    uint8_t ch = al;
    al &= 0x30; // every 4th call
    if (al == 0) patrol_between_boundaries(si, dx, ch);
}

// AI fn3+
static void npc_ai_face_hero(uint16_t si, uint16_t *dx)
{
    uint16_t hero_abs = (uint16_t)(HERO_XV + 4) + PROX_LEFT;
    if (hero_abs >= *dx) {
        MEM8(si + 2) &= 0x7F; // hero is to the right, face right
    } else {
        MEM8(si + 2) |= 0x80; // hero is to the left, face left
    }
}

// AI fn4
static void npc_ai_bob_in_place(uint16_t si, uint16_t *dx)
{
    (void)dx;
    uint8_t al = MEM8(si + 4); // n_anim_phase
    al += 0x10;
    MEM8(si + 4) = al;
    uint8_t ch = al;
    al &= 0x30;
    if (al == 0) {
        MEM8(si + 4) = (ch + 1) & 1; // n_anim_phase
    }
}

static void patrol_bounce_at_phase(uint16_t si, uint16_t *dx, uint8_t ch)
{
    ch++;
    MEM8(si + 4) = ch & 0x0f; // n_anim_phase

    if ((ch & 7) == 0) { // each 8th step
        MEM8(si + 2) ^= 0x80;
        return;
    }
    // continue patrolling in the same direction
    if (MEM8(si + 2) & 0x80)
        (*dx)--;
    else
        (*dx)++;
}

// AI fn5
static void npc_ai_patrol_bounce_1bit(uint16_t si, uint16_t *dx)
{
    uint8_t al = MEM8(si + 4); // n_anim_phase
    al += 0x10;
    MEM8(si + 4) = al;
    uint8_t ch = al;
    al &= 0x10;
    if (al == 0) patrol_bounce_at_phase(si, dx, ch);
}

// AI fn6
static void npc_ai_patrol_bounce_2bit(uint16_t si, uint16_t *dx)
{
    uint8_t al = MEM8(si + 4);
    al += 0x10;
    MEM8(si + 4) = al;
    uint8_t ch = al;
    al &= 0x30;
    if (al == 0) patrol_bounce_at_phase(si, dx, ch);
}

// AI fn7
static void npc_ai_static(uint16_t si, uint16_t *dx)
{
    (void)si; (void)dx;
}

/* =========================================================================
 * save_head_level_tiles_in_npcs — replace NPC head tiles in tile map with 0xFD
 * ========================================================================= */
static void save_head_level_tiles_in_npcs(void)
{
    uint16_t si = MEM16(ADDR_NPC_ARRAY);
    for (;;) {
        uint16_t bx = MEM16(si);
        if (bx == 0xFFFF) return;
        uint16_t tile_addr = ADDR_NPC_HEAD_TILES + bx * 8;
        uint8_t head = g_mem[tile_addr];
        g_mem[tile_addr] = 0xFD;
        MEM8(si + 3) = head;   /* n_head_tile */
        si += 8;
    }
}

/* =========================================================================
 * restore_head_level_tiles_from_npcs — restore original head tiles from NPC structs
 * ========================================================================= */
static void restore_head_level_tiles_from_npcs(void)
{
    uint16_t si = MEM16(ADDR_NPC_ARRAY);
    for (;;) {
        uint16_t bx = MEM16(si);
        if (bx == 0xFFFF) return;
        uint8_t head = MEM8(si + 3);   /* n_head_tile */
        if (head != 0xFD) {
            g_mem[ADDR_TOWN_TILES + 5 + bx * 8] = head;
        }
        si += 8;
    }
}

/* =========================================================================
 * render_life_almas_gold_place — draw the four HUD labels
 * ========================================================================= */
static void render_life_almas_gold_place(void)
{
    // TODO: signal js to refresh the HUD
    // /* Pascal-string format: {word: screen_pos, byte: color, byte: len, chars} */
    // /* Data from life_str/almas_str/gold_str/place_str in asm */
    // static const struct { uint16_t pos; uint8_t color; const char *text; } labels[] = {
    //     { 0x0A30, 0x0E, "LIFE"  },
    //     { 0x0BB1, 0x03, "ALMAS" },
    //     { 0x0BB0, 0x01, "GOLD"  },
    //     { 0x0AF0, 0x01, "PLACE" },
    // };
    // for (int i = 0; i < 4; i++) {
    //     CALL_PROC(render_pascal_string_0, labels[i].pos, labels[i].color,
    //               labels[i].text);
    // }
}

/* =========================================================================
 * load_town_background
 * ========================================================================= */
// static void load_town_background(void)
// {
//     /* If town has middle layer: load CKPD.BIN (composite bg+fg),
//      * otherwise load YMPD.BIN (background only).             */
//     const char *filename = (MIDDLE_LYR & 1) ? "CKPD.BIN" : "YMPD.BIN";
//     CALL_PROC(res_dispatcher_fn3, filename, SEG2_BASE + 0x3300);
// }

/* =========================================================================
 * load_patterns_and_call_background
 * ========================================================================= */
// static void load_patterns_and_call_background(void)
// {
//     load_and_decompress_patterns();
//     CALL_PROC(call_background_code, MEM8(ADDR_VIDEO_DRV_ID));
// }

/* =========================================================================
 * load_and_decompress_patterns
 * Loads the pattern group (CPAT/MPAT/DPAT) indexed by pat_id,
 * fixes up the embedded pointers, then calls decompress_patterns.
 * ========================================================================= */
// static void load_and_decompress_patterns(void)
// {
//     static const char *pat_names[3] = { "CPAT.GRP", "MPAT.GRP", "DPAT.GRP" };
//     uint8_t idx = PAT_ID;
//     if (idx > 2) idx = 0;
//     CALL_PROC(res_dispatcher_fn2, pat_names[idx], SEG1_BASE + 0x8000);

//     /* Fix up the three pointer words embedded at seg1:8000/8002/8004 */
//     SEG1_16(0x8000) += 0x8000;
//     SEG1_16(0x8002) += 0x8000;
//     SEG1_16(0x8004) += 0x8000;

//     CALL_PROC(decompress_patterns, SEG1_BASE + 0x8000);
// }

/* =========================================================================
 * load_hero_town_sprite
 * ========================================================================= */
static void load_hero_town_sprite(void)
{
    CALL_PROC(res_dispatcher_fn2, "TMAN.GRP", SEG1_BASE + SEG1_TMAN_GFX);
    CALL_PROC(apply_sprite_mask,
              SEG1_BASE + SEG1_TMAN_GFX, SEG2_BASE + 0x8000, 46);
}

/* =========================================================================
 * init_c015_obj_if_exists
 * Copies/skips blocks according to the descriptor table at word_C015.
 * Format: dst_addr(word), flag_byte — terminated by 0xFFFF.
 * ========================================================================= */
static void init_c015_obj_if_exists(void)
{
    uint16_t si = MEM16(ADDR_WORD_C015);
    for (;;) {
        uint16_t dst = MEM16(si); si += 2;
        if ((dst & 0xFF) == 0xFF && (dst >> 8) == 0xFF) return;

        uint8_t flag = MEM8(si++);
        if (!(flag & g_mem[dst])) {
            /* skip until next 0xFFFF */
            for (;;) {
                uint16_t w = MEM16(si); si += 2;
                if ((w & 0xFF) == 0xFF && (w >> 8) == 0xFF) break;
                si++;
            }
            continue;
        }
        /* copy mode: dst/byte pairs until 0xFFFF */
        for (;;) {
            uint16_t d2 = MEM16(si); si += 2;
            if ((d2 & 0xFF) == 0xFF && (d2 >> 8) == 0xFF) break;
            uint8_t val = MEM8(si++);
            g_mem[d2] = val;
        }
    }
}

/* =========================================================================
 * handle_inventory_key — Enter key opens inventory overlay
 * ========================================================================= */
static void handle_inventory_key(void)
{
    if (!(MEM8(ADDR_ENTER_KEYS) & 0x01)) return;
    MEM8(ADDR_SOUND_FX_REQUEST) = 0x0B;
    CALL_PROC(clear_viewport);
    swap_a000_c000_buffers();
    CALL_PROC(inventory_overlay);          /* cs:word_A002 */
    swap_a000_c000_buffers();
    CALL_PROC(clear_viewport);
    // load_patterns_and_call_background();
    CALL_PROC(backup_upper_town_3_tiles);
    memset(&g_mem[0xE000], 0xFE, 0xE0);
    game_loop_with_frame_wait();
    SPACEBAR = 0;
    ALTKEY   = 0;
}

/* =========================================================================
 * swap_a000_c000_buffers — swap 2 KB between seg1:0xA000 and seg1:0xC000
 * ========================================================================= */
static void swap_a000_c000_buffers(void)
{
    uint8_t tmp[0x800];
    uint8_t *a = &g_mem[SEG1_BASE + 0xA000];
    uint8_t *c = &g_mem[SEG1_BASE + 0xC000];
    memcpy(tmp, c, 0x800);
    memcpy(c, a, 0x800);
    memcpy(a, tmp, 0x800);
}

/* =========================================================================
 * handle_edge_screen_transition
 * Called each frame; if hero is at x==0 or x==28 triggers a town transition.
 * ========================================================================= */
static void handle_edge_screen_transition(void)
{
    uint8_t vp_x = HERO_XV;
    int going_left  = (vp_x == 0xFF);
    int going_right = (vp_x == 27);
    if (!going_left && !going_right) return;

    restore_head_level_tiles_from_npcs();
    FRAME_TMR = 40;
    game_loop_with_frame_wait();

    uint16_t si = MEM16(ADDR_TOWN_TRANSITION_TABLE);
    for (;;) {
        uint8_t flags = MEM8(si);
        if (going_left  && !(flags & 1)) { si += 4; continue; }
        if (going_right && (flags & 1)) { si += 4; continue; }
        break;
    }

    uint8_t flags    = MEM8(si);
    uint8_t dest_map = MEM8(si + 1);
    uint8_t pat_new  = MEM8(si + 3);

    if (flags & 0xFE) {
        CALL_PROC(transition_to_dungeon, dest_map);
        return;
    }

    /* --- Signal JS to load resources asynchronously --- */
    uint8_t dest_id = dest_map | 0x80;
    MEM8(ADDR_PLACE_MAP_ID) = dest_id;

    /* Stash hero re-entry position based on direction */
    if (going_left) {
        HERO_XV  = 26;   /* enter from right side of new town */
        PROX_LEFT = 0;
    } else {
        HERO_XV  = 0;   /* enter from left side of new town */
        PROX_LEFT = 0;     /* JS will set this to MAP_WIDTH - 0x24 after loading */
    }

    /* Write the pending-transition record for JS to read */
    MEM8(ADDR_PENDING_TRANSITION_MAP)  = dest_id;
    MEM8(ADDR_PENDING_TRANSITION_PAT)  = pat_new;
    MEM8(ADDR_PENDING_TRANSITION_DIR)  = going_left ? 1 : 0;
    MEM8(ADDR_PENDING_TRANSITION_FLAG) = 0xFF;  /* arm the signal */

    /* Do NOT call load_town_transition_data or town_entry_common here.
     * JS detects ADDR_PENDING_TRANSITION_FLAG and drives the rest. */
}

/* Called by JS after it has:
 *   1. Written new MDT bytes into g_mem[0xC000]
 *   2. Loaded MMAN/CMAN.GRP into seg1:0x4000
 * We finish the in-WASM part (apply masks, decompress patterns) and
 * then run town_entry_common which re-enters the main loop. */
void wasm_town_complete_transition(void)
{
    uint8_t dest_id  = MEM8(ADDR_PENDING_TRANSITION_MAP);
    uint8_t pat_new  = MEM8(ADDR_PENDING_TRANSITION_PAT);
    uint8_t going_left = MEM8(ADDR_PENDING_TRANSITION_DIR);

    /* Clear the flag first — JS checks it and we don't want re-entry */
    MEM8(ADDR_PENDING_TRANSITION_FLAG) = 0;

    /* Apply NPC sprite mask (same as load_town_transition_data did) */
    uint8_t npc_type = MEM8(ADDR_TOWN_DESCRIPTOR + 1);
    // CALL_PROC(apply_sprite_mask,
    //           SEG1_BASE + SEG1_MMAN_CMAN_GFX + 0x100,
    //           SEG2_BASE + 0x7000, 160);

    /* Decompress patterns if pat_id changed */
    if (pat_new != PAT_ID) {
        PAT_ID = pat_new;
        // load_and_decompress_patterns();
    }

    /* Set hero re-entry scroll position */
    if (going_left) {
        /* came from the right, hero appears at right edge */
        HERO_XV   = 26;
        PROX_LEFT = (uint16_t)(MAP_WIDTH - 36);
    } else {
        /* came from the left, hero appears at left edge */
        HERO_XV   = 0;
        PROX_LEFT = 0;
    }
    uint16_t left_col = PROX_LEFT;
    PROX_START = (uint16_t)(left_col * 8 + ADDR_TOWN_TILES);

    FACING = going_left ? 1 : 0;  /* face into the new town */

    /* Re-enter town (loads background, starts music, inits NPCs, etc.) */
    // town_entry_common();
}

/* Read the pending-transition record — JS uses this after detecting the flag */
uint8_t wasm_get_pending_transition_map(void) { return MEM8(ADDR_PENDING_TRANSITION_MAP); }
uint8_t wasm_get_pending_transition_pat(void) { return MEM8(ADDR_PENDING_TRANSITION_PAT); }
uint8_t wasm_get_pending_transition_dir(void) { return MEM8(ADDR_PENDING_TRANSITION_DIR); }

/* =========================================================================
 * npcAnimation — NPC frame tick (exported; called from building binaries)
 * ========================================================================= */
static void npcAnimation(void)
{
    CALL_PROC(confirm_exit_dialog);
    CALL_PROC(handle_pause_state);
    int do_restore = CALL_PROC_RET(handle_restore_game);
    if (do_restore) restore_game();

    if (MEM8(ADDR_TOWN_TRANSITION_FLAG)) return;

    /* Render one NPC animation frame */
    update_npcs();
    // CALL_PROC(render_town_tiles_28_columns);
}

/* =========================================================================
 * show_yes_no_dialog — returns 1 if "Yes", 0 if "No"
 * ========================================================================= */
static int show_yes_no_dialog(void)
{
    uint8_t saved_count  = MEM8(ADDR_MENU_ITEM_COUNT);
    uint8_t saved_max    = MEM8(ADDR_MENU_MAX_ITEMS);
    uint8_t saved_cursor = MEM8(ADDR_MENU_CURSOR_POS);

    MEM8(ADDR_MENU_ITEM_COUNT) = 2;
    MEM8(ADDR_MENU_MAX_ITEMS)  = 2;

    /* Build tiny yes/no string array in scratch memory */
    uint16_t si = 0x7FF0;  /* scratch inside seg0 */
    memcpy(&g_mem[si],     str_yes, sizeof(str_yes));
    memcpy(&g_mem[si + sizeof(str_yes)], str_no, sizeof(str_no));

    render_menu_string_list(si, 2);

    MEM8(ADDR_MENU_CURSOR_POS) = 0;
    uint8_t cursor = 0;
    int cancelled = 0;
    select_from_menu(&cursor);  /* cursor=0="Yes", cursor=1="No" */
    if (cursor != 0) cancelled = 1;

    MEM8(ADDR_MENU_CURSOR_POS) = saved_cursor;
    MEM8(ADDR_MENU_ITEM_COUNT) = saved_count;
    MEM8(ADDR_MENU_MAX_ITEMS)  = saved_max;

    return cancelled ? 0 : 1;
}

/* =========================================================================
 * confirm_purchase_dialog — returns 1="Take", 0="No Take"
 * ========================================================================= */
static int confirm_purchase_dialog(void)
{
    MEM8(ADDR_MENU_ITEM_COUNT) = 2;
    MEM8(ADDR_MENU_MAX_ITEMS)  = 2;

    uint16_t si = 0x7FF0;
    memcpy(&g_mem[si], str_take,    sizeof(str_take));
    memcpy(&g_mem[si + sizeof(str_take)], str_no_take, sizeof(str_no_take));

    render_menu_string_list(si, 2);
    MEM8(ADDR_MENU_CURSOR_POS) = 0;
    uint8_t cursor = 0;
    select_from_menu(&cursor);
    return (cursor == 0) ? 1 : 0;
}

/* =========================================================================
 * render_menu_string_list — renders cx null-terminated strings at menu_base
 * ========================================================================= */
static void render_menu_string_list(uint16_t si, uint8_t count)
{
    uint16_t base = MEM16(ADDR_MENU_BASE_ADDR);
    for (uint8_t row = 0; row < count; row++) {
        uint16_t screen_pos = (uint16_t)(base + 0x301 + row * 0x0A);
        CALL_PROC(render_c_string, screen_pos, si, 0);
        /* advance si past the null terminator */
        while (MEM8(si++)) {}
    }
}

/* =========================================================================
 * select_from_menu
 * Waits for up/down/space/alt and moves cursor; sets *cursor_row to chosen row.
 * ========================================================================= */
static void select_from_menu(uint8_t *cursor_row)
{
    SPACEBAR = 0;
    ALTKEY   = 0;
    houseCursorShow();

    for (;;) {
        npcAnimation();
        FRAME_TMR = 0;

        if (ALTKEY) { *cursor_row = 0xFF; return; }  /* cancelled */
        if (SPACEBAR) {
            MEM8(ADDR_SOUND_FX_REQUEST) = 0x1F;
            return;
        }

        CALL_PROC(poll_input);
        uint8_t dirs = INPUT_DIRS & 3;

        if (dirs == 1) {
            /* up */
            if (*cursor_row > 0) {
                houseCursorUp(*cursor_row);
                (*cursor_row)--;
            } else if (MEM8(ADDR_MENU_CURSOR_POS)) {
                MEM8(ADDR_MENU_CURSOR_POS)--;
                CALL_PROC(scroll_hud_up,
                          MEM16(ADDR_MENU_BASE_ADDR) + 0x301,
                          MEM8(ADDR_MENU_ITEM_COUNT),
                          MEM8(ADDR_STRING_WIDTH_BYTES));
            }
        } else if (dirs == 2) {
            /* down */
            uint8_t max_row = (uint8_t)(MEM8(ADDR_MENU_ITEM_COUNT) - 1);
            if (*cursor_row < max_row) {
                houseCursorDown(*cursor_row);
                (*cursor_row)++;
            } else if (MEM8(ADDR_MENU_CURSOR_POS) + *cursor_row + 1
                       < MEM8(ADDR_MENU_MAX_ITEMS)) {
                MEM8(ADDR_MENU_CURSOR_POS)++;
                CALL_PROC(scroll_hud_down,
                          MEM16(ADDR_MENU_BASE_ADDR) + 0x301,
                          MEM8(ADDR_MENU_ITEM_COUNT),
                          MEM8(ADDR_STRING_WIDTH_BYTES));
            }
        }
    }
}

/* =========================================================================
 * render_menu_list_scrolling — formatted scrollable list (shops etc.)
 * ========================================================================= */
static void render_menu_list_scrolling(uint16_t si, uint8_t count)
{
    uint16_t base = MEM16(ADDR_MENU_BASE_ADDR);
    for (uint8_t row = 0; row < count; row++) {
        uint8_t fmt_idx = MEM8(si + row);
        CALL_PROC(format_string_to_buffer, &g_mem[0xFF58], fmt_idx);
        uint16_t screen_pos = (uint16_t)(base + 0x300 + row * 0x0A);
        CALL_PROC(draw_string_buffer_to_screen, screen_pos);
    }
}

/* =========================================================================
 * check_gold_sufficient — CF=1 means insufficient
 * Returns 0 = enough gold, 1 = not enough
 * ========================================================================= */
static int check_gold_sufficient(uint16_t lo, uint8_t hi)
{
    uint8_t gold_hi = HERO_GOLD_HI;
    if (gold_hi < hi) return 1;  /* not enough */
    uint16_t gold_lo = HERO_GOLD_LO;
    if (gold_hi == hi && gold_lo < lo) return 1;
    return 0;
}

/* =========================================================================
 * add_gold_to_hero
 * ========================================================================= */
static void add_gold_to_hero(uint16_t lo, uint8_t hi)
{
    uint32_t total = (uint32_t)HERO_GOLD_LO | ((uint32_t)HERO_GOLD_HI << 16);
    uint32_t add   = (uint32_t)lo | ((uint32_t)hi << 16);
    total += add;
    HERO_GOLD_LO = (uint16_t)(total & 0xFFFF);
    HERO_GOLD_HI = (uint8_t)((total >> 16) & 0xFF);
}

/* =========================================================================
 * convert_ax_to_decimal — converts value to 7-char decimal string at di
 * Output: 7 ASCII digit bytes followed by 0xFF at g_mem[di_addr]
 * ========================================================================= */
static void convert_ax_to_decimal(uint16_t value, uint16_t di_addr)
{
    /* Use sprintf for simplicity; original used repeated-subtraction div. */
    char buf[8];
    int len = 0;
    uint32_t v = value;
    for (int i = 6; i >= 0; i--) {
        buf[i] = (char)(v % 10);
        v /= 10;
    }
    /* Skip leading zeros */
    int start = 0;
    while (start < 6 && buf[start] == 0) start++;
    uint16_t di = di_addr;
    for (int i = start; i < 7; i++) {
        g_mem[di++] = (uint8_t)(buf[i] + '0');
    }
    g_mem[di] = 0xFF;
}

/* =========================================================================
 * houseCursorShow, houseCursorUp, houseCursorDown
 * Thin wrappers — actual rendering done by external proc.
 * ========================================================================= */
static void houseCursorShow(void)
{
    CALL_PROC(draw_menu_cursor_arrow, MEM16(ADDR_MENU_BASE_ADDR),
              MEM8(ADDR_MENU_CURSOR_POS));
}

static void houseCursorUp(uint8_t row)
{
    CALL_PROC(draw_arrow_icon_or_ui_symbol, MEM16(ADDR_MENU_BASE_ADDR), row, -1);
}

static void houseCursorDown(uint8_t row)
{
    CALL_PROC(draw_arrow_icon_or_ui_symbol, MEM16(ADDR_MENU_BASE_ADDR), row, +1);
}

/* =========================================================================
 * restore_game
 * Loads a .USR save file selected by the player, then reloads GAME.BIN.
 * ========================================================================= */
static void restore_game(void)
{
    /* Stop music */
    CALL_PROC(adlib_fn3_mute);

    choose_game_to_restore();

    /* If player chose "Re-Start", load STDPLY.BIN (default save) */
    if (MEM8(ADDR_SAVE_IS_RESTART)) {
        memset(&g_mem[ADDR_SAVE_NAME], 0, 8);
        CALL_PROC(res_dispatcher_fn3, "STDPLY.BIN", 0x0000);
    } else {
        /* Build filename: save_name_buffer + ".USR" */
        char fname[16];
        int i;
        for (i = 0; i < 8 && g_mem[ADDR_SAVE_NAME_BUFFER + i]; i++)
            fname[i] = (char)g_mem[ADDR_SAVE_NAME_BUFFER + i];
        memcpy(fname + i, ".USR", 5);

        MEM8(ADDR_DISK_SWAP_SUPPRESSED) = 0xFF;
        int ok = CALL_PROC_RET(res_dispatcher_fn3_cf, fname, 0x0000);
        MEM8(ADDR_DISK_SWAP_SUPPRESSED) = 0x00;

        if (!ok) {
            /* File not found — show error and retry */
            CALL_PROC(draw_bordered_rectangle, 0x1A46, 0x1E1A, 0xFF);
            CALL_PROC(render_string_ff_terminated, 0x80, 0x4C, str_user_file_not_found);
            SPACEBAR = 0;
            while (!SPACEBAR) CALL_PROC(confirm_exit_dialog);
            SPACEBAR = 0;
            restore_game();   /* retry */
            return;
        }
    }

    /* Reload GAME.BIN and jump to its entry */
    CALL_PROC(res_dispatcher_fn3, "GAME.BIN", ADDR_GAME_BIN_ENTRY);
    CALL_PROC(clear_screen);
    CALL_PROC(adlib_fn1);
    CALL_PROC(jump_game_bin_entry, 0xFFFF);
}

/* =========================================================================
 * choose_game_to_restore
 * Scans for *.usr files, shows selection UI with name input.
 * ========================================================================= */
static void choose_game_to_restore(void)
{
    /* Scan for save files into 0xE000 buffer */
    CALL_PROC(scan_saved_games, 0xE000, str_usr_glob);

    /* Prepend "Re-Start" option */
    uint8_t file_count = g_mem[0xE000];
    if (file_count < 0xFF) file_count++;
    else g_mem[0xE000] = (uint8_t)(g_mem[0xE000]);  /* clamp */

    /* Shift existing entries up by one to make room at front */
    memmove(&g_mem[0xE003], &g_mem[0xE001], 0x1FE);
    MEM16(ADDR_WORD_E001) = 0;  /* pointer to "Re-Start" string */

    /* Draw dialog rectangles */
    CALL_PROC(draw_bordered_rectangle, 0x0D38, 0x3637, 0xFF);
    CALL_PROC(draw_bordered_rectangle, 0x0D38, 0x2637, 0xFF);

    /* Fill save_name_buffer with placeholder '`' */
    memset(&g_mem[ADDR_SAVE_NAME_BUFFER], 0x60, 8);
    g_mem[ADDR_SAVE_NAME_BUFFER + 8] = 0xFF;
    MEM8(ADDR_SAVE_NAME_COUNT) = 0;

    /* Copy current save name */
    {
        uint8_t cnt = 0;
        for (int i = 0; i < 8 && g_mem[ADDR_SAVE_NAME + i]; i++) {
            g_mem[ADDR_SAVE_NAME_BUFFER + i] = g_mem[ADDR_SAVE_NAME + i];
            cnt++;
        }
        MEM8(ADDR_SAVE_NAME_COUNT) = cnt;
        MEM8(ADDR_SAVE_SLOT_HAS_NAME) = cnt;
    }

    /* If buffer is all '`', copy "Re-Start" into it */
    {
        int all_tick = 1;
        for (int i = 0; i < 8; i++)
            if (g_mem[ADDR_SAVE_NAME_BUFFER + i] != 0x60) { all_tick = 0; break; }
        if (all_tick)
            memcpy(&g_mem[ADDR_SAVE_NAME_BUFFER], str_restart, 8);
    }

    CALL_PROC(render_string_ff_terminated, 0x3C, 0x44, str_input_name);

    MEM16(ADDR_SAVE_NAME_RECT_POS) = 0x60;
    MEM8(ADDR_SAVE_NAME_RECT_Y) = 0x56;
    MEM16(ADDR_MENU_BASE_ADDR) = 0x343B;
    MEM16(ADDR_STRING_WIDTH_BYTES) = 0x0A;

    uint8_t display_count = g_mem[0xE000];

    if (display_count == 0) {
        /* No saves — exit immediately */
        CALL_PROC(jump_exit_far, 0xFFFF);
        return;
    }

    if (display_count > 5) display_count = 5;
    MEM8(ADDR_MENU_ITEM_COUNT) = 5;
    MEM8(ADDR_MENU_MAX_ITEMS)  = g_mem[0xE000];
    render_save_game_list(0xE001, display_count);
    save_name_input_handler();

    /* Copy chosen name to ADDR_SAVE_NAME */
    memset(&g_mem[ADDR_SAVE_NAME], 0, 8);
    if (MEM8(ADDR_SAVE_SLOT_HAS_NAME)) {
        uint16_t si = ADDR_SAVE_NAME_BUFFER;
        uint16_t di = ADDR_SAVE_NAME;
        for (;;) {
            uint8_t c = g_mem[si++];
            if (c == 0xFF || c == 0x60) break;
            g_mem[di++] = c;
        }
    }
}

/* =========================================================================
 * check_save_is_restart — sets save_is_restart if name contains '-'
 * ========================================================================= */
static void check_save_is_restart(void)
{
    MEM8(ADDR_SAVE_IS_RESTART) = 0;
    for (int i = 0; i < 8; i++) {
        if (g_mem[ADDR_SAVE_NAME_BUFFER + i] == '-') {
            MEM8(ADDR_SAVE_IS_RESTART) = 0xFF;
            MEM8(ADDR_SAVE_NAME_COUNT) = 0;
            return;
        }
    }
}

/* =========================================================================
 * clear_save_name — if in restart mode, fill name buffer with '`' blanks
 * ========================================================================= */
static void clear_save_name(void)
{
    if (!MEM8(ADDR_SAVE_IS_RESTART)) return;
    MEM8(ADDR_SAVE_IS_RESTART) = 0;
    memset(&g_mem[ADDR_SAVE_NAME_BUFFER], 0x60, 8);
    MEM8(ADDR_SAVE_SLOT_HAS_NAME) = 0;
}

/* =========================================================================
 * save_name_input_handler
 * Keyboard-driven save-name editor. Handles alphanumeric input,
 * backspace, up/down to scroll the save list, spacebar to select.
 * ========================================================================= */
static void save_name_input_handler(void)
{
    MEM8(ADDR_SAVE_CURSOR_ROW) = 0;
    MEM8(ADDR_MENU_CURSOR_POS) = 0;
    render_save_name_string();
    highlight_save_cursor(0);

    for (;;) {
        npcAnimation();

        uint8_t ascii = MEM8(ADDR_CURRENT_ASCII_CHAR);
        if (ascii) {
            MEM8(ADDR_SOUND_FX_REQUEST) = 1;
            MEM8(ADDR_CURRENT_ASCII_CHAR) = 0;

            if (ascii == 0x0D) {
                /* Enter — confirm selection */
                check_save_is_restart();
                return;
            } else if (ascii == 0x08) {
                /* Backspace */
                clear_save_name();
                uint8_t cnt = MEM8(ADDR_SAVE_NAME_COUNT);
                if (cnt == 0) cnt = 1;
                /* Shift buffer left by one */
                for (int i = (int)cnt - 1; i < 8; i++)
                    g_mem[ADDR_SAVE_NAME_BUFFER + i] = g_mem[ADDR_SAVE_NAME_BUFFER + i + 1];
                if (MEM8(ADDR_SAVE_SLOT_HAS_NAME))
                    MEM8(ADDR_SAVE_SLOT_HAS_NAME)--;
                g_mem[ADDR_SAVE_NAME_TERMINATOR] = 0x60;
                highlight_save_cursor((int8_t)0xFF);  /* -1 */
                render_save_name_string();
            } else {
                /* Printable character */
                clear_save_name();
                uint8_t pos = MEM8(ADDR_SAVE_NAME_COUNT);
                if (g_mem[ADDR_SAVE_NAME_BUFFER + pos] == 0x60)
                    MEM8(ADDR_SAVE_SLOT_HAS_NAME)++;
                g_mem[ADDR_SAVE_NAME_BUFFER + pos] = ascii;
                render_save_name_string();
                highlight_save_cursor(1);
            }
        } else {
            /* No typed key — check direction */
            CALL_PROC(poll_input);
            uint8_t dirs = INPUT_DIRS;

            if (dirs & 0x08) {
                /* Right / Down arrow — move cursor right in name */
                highlight_save_cursor(1);
                while (INPUT_DIRS & 0x08) npcAnimation();
                MEM8(ADDR_CURRENT_ASCII_CHAR) = 0;
            } else if (dirs & 0x04) {
                /* Left arrow — move cursor left in name */
                highlight_save_cursor((int8_t)0xFF);
                while (INPUT_DIRS & 0x04) npcAnimation();
                MEM8(ADDR_CURRENT_ASCII_CHAR) = 0;
            } else if (dirs & 0x01) {
                /* Up — scroll save list up */
                if (MEM8(ADDR_SAVE_CURSOR_ROW)) {
                    houseCursorUp(MEM8(ADDR_SAVE_CURSOR_ROW));
                    MEM8(ADDR_SAVE_CURSOR_ROW)--;
                } else if (MEM8(ADDR_MENU_CURSOR_POS)) {
                    MEM8(ADDR_MENU_CURSOR_POS)--;
                    CALL_PROC(scroll_hud_up,
                              MEM16(ADDR_MENU_BASE_ADDR) + 0x301,
                              MEM8(ADDR_MENU_ITEM_COUNT),
                              MEM8(ADDR_STRING_WIDTH_BYTES));
                }
            } else if (dirs & 0x02) {
                /* Down — scroll save list down */
                uint8_t row = MEM8(ADDR_SAVE_CURSOR_ROW);
                uint8_t max_row = (uint8_t)(MEM8(ADDR_MENU_ITEM_COUNT) - 1);
                if (row < max_row) {
                    houseCursorDown(row);
                    MEM8(ADDR_SAVE_CURSOR_ROW)++;
                } else if (row + MEM8(ADDR_MENU_CURSOR_POS) + 1
                           < MEM8(ADDR_MENU_MAX_ITEMS) - 1) {
                    MEM8(ADDR_MENU_CURSOR_POS)++;
                    CALL_PROC(scroll_hud_down,
                              MEM16(ADDR_MENU_BASE_ADDR) + 0x301,
                              MEM8(ADDR_MENU_ITEM_COUNT),
                              MEM8(ADDR_STRING_WIDTH_BYTES));
                }
            } else if (SPACEBAR) {
                /* Select highlighted save */
                SPACEBAR = 0;
                MEM8(ADDR_SAVE_NAME_COUNT) = 0;
                /* Copy selected name from save list into name buffer */
                uint8_t sel = (uint8_t)(MEM8(ADDR_SAVE_CURSOR_ROW) +
                                        MEM8(ADDR_MENU_CURSOR_POS));
                uint16_t entry = MEM16(0xE001 + sel * 2);
                /* entry = pointer to the filename in the scanned list */
                uint16_t si = entry;
                uint16_t di = ADDR_SAVE_NAME_BUFFER;
                for (int i = 0; i < 8; i++) {
                    uint8_t c = g_mem[si + i];
                    if (!c) break;
                    g_mem[di + i] = c;
                    MEM8(ADDR_SAVE_NAME_COUNT)++;
                }
                MEM8(ADDR_SAVE_SLOT_HAS_NAME) = MEM8(ADDR_SAVE_NAME_COUNT);
                check_save_is_restart();
                SPACEBAR = 0;
                render_save_name_string();
                highlight_save_cursor(0);
            }
        }
    }
}

/* =========================================================================
 * render_save_game_list — renders count save-file names in the dialog list
 * ========================================================================= */
static void render_save_game_list(uint16_t si, uint8_t count)
{
    render_menu_list_scrolling(si, count);
}

/* =========================================================================
 * render_save_name_string
 * ========================================================================= */
static void render_save_name_string(void)
{
    uint16_t pos = MEM16(ADDR_SAVE_NAME_RECT_POS);
    uint8_t  bh  = (uint8_t)(pos >> 2);
    uint8_t  bl  = MEM8(ADDR_SAVE_NAME_RECT_Y);
    CALL_PROC(draw_bordered_rectangle, (uint16_t)(bh << 8 | bl), 0x1008, 0);
    CALL_PROC(render_string_ff_terminated, pos, MEM8(ADDR_SAVE_NAME_RECT_Y),
              &g_mem[ADDR_SAVE_NAME_BUFFER]);
}

/* =========================================================================
 * highlight_save_cursor — move and render the cursor arrow in the name box
 * ========================================================================= */
static void highlight_save_cursor(int8_t delta)
{
    uint16_t pos = MEM16(ADDR_SAVE_NAME_RECT_POS);
    uint8_t  bh  = (uint8_t)(pos >> 2);
    uint8_t  cnt = MEM8(ADDR_SAVE_NAME_COUNT);

    uint8_t cursor_x = (uint8_t)(bh + cnt * 2);
    uint8_t bl = (uint8_t)(MEM8(ADDR_SAVE_NAME_RECT_Y) + 8);

    /* Clear previous cursor */
    CALL_PROC(draw_bordered_rectangle,
              (uint16_t)(cursor_x << 8 | bl), 0x0208, 0);

    /* Update counter */
    int8_t new_cnt = (int8_t)(cnt + delta);
    if (new_cnt < 0) new_cnt = 0;
    cnt = (uint8_t)new_cnt;
    if (cnt >= 8) cnt = 7;
    if (cnt > MEM8(ADDR_SAVE_SLOT_HAS_NAME))
        cnt = MEM8(ADDR_SAVE_SLOT_HAS_NAME);
    MEM8(ADDR_SAVE_NAME_COUNT) = cnt;

    /* Draw new cursor arrow (glyph 0x67F) */
    cursor_x = (uint8_t)(bh + cnt * 2);
    bl = (uint8_t)(MEM8(ADDR_SAVE_NAME_RECT_Y) + 8);
    CALL_PROC(render_font_glyph, (uint16_t)((uint16_t)cursor_x << 8 | bl),
              (uint16_t)bl, 0x067F);
}

/* =========================================================================
 * scroll_dialog_up / scroll_dialog_down (used by render_menu_dialog)
 * ========================================================================= */
static void scroll_dialog_up(void)
{
    uint16_t cx = MEM16(ADDR_DIALOG_CURSOR_POS);
    uint8_t  rows = (uint8_t)(MEM8(ADDR_DIALOG_CHARS_ON_LINE) < 8
                               ? MEM8(ADDR_DIALOG_CHARS_ON_LINE) : 8);
    for (uint8_t i = 0; i < rows; i++) {
        CALL_PROC(scroll_screen_rect_up,
                  (uint16_t)((cx & 0xFF00) | ((cx & 0xFF) + 4)),
                  (uint16_t)(((rows * 10 - 2) << 8) | MEM8(ADDR_STRING_WIDTH_BYTES)));
    }
}

static void scroll_dialog_down(void)
{
    uint16_t cx = MEM16(ADDR_DIALOG_CURSOR_POS);
    uint8_t  rows = (uint8_t)(MEM8(ADDR_DIALOG_CHARS_ON_LINE) < 8
                               ? MEM8(ADDR_DIALOG_CHARS_ON_LINE) : 8);
    for (uint8_t i = 0; i < rows; i++) {
        CALL_PROC(scroll_screen_rect_down,
                  (uint16_t)((cx & 0xFF00) | ((cx & 0xFF) + 4)),
                  (uint16_t)(((rows * 10 - 2) << 8) | MEM8(ADDR_STRING_WIDTH_BYTES)));
    }
}

static void draw_next_page_arrow(void)
{
    CALL_PROC(render_font_glyph, 0x009C, 0x8B, 0x027C);
    wait_for_dialog_continue();
    CALL_PROC(draw_bordered_rectangle, 0x278B, 0x020A, 0);
    MEM8(ADDR_DIALOG_PAGE_COUNT) = 0;
}

static void wait_for_dialog_continue(void)
{
    SPACEBAR = 0;
    ALTKEY   = 0;
    while (1) {
        npcAnimation();
        if (SPACEBAR || ALTKEY) {
            SPACEBAR = 0;
            ALTKEY   = 0;
            MEM8(ADDR_SOUND_FX_REQUEST) = 0x1D;
            return;
        }
    }
}

/* =========================================================================
 * Exported WASM entry points
 * ========================================================================= */

/* Called once from JS after WASM memory is set up */
void wasm_town_init(void)
{
    memset(g_mem, 0, sizeof(g_mem));
    g_town_return_before_main_loop = 0;
    g_town_update_active = 0;
    /* JS must populate g_mem with save data and MDT before calling entry */
}

/* JS callable: let startup run town init without entering the blocking DOS loop */
void wasm_town_set_return_before_main_loop(int enabled)
{
    g_town_return_before_main_loop = enabled ? 1 : 0;
}

/* JS callable: enter town after returning from a dungeon */
void wasm_town_entry_disabling_edge_scroll(void)   { town_entry_disabling_edge_scroll(); }

/* JS callable: re-enter town (sage / falter) */
void wasm_town_entry_enabling_edge_scroll(void) { town_entry_enabling_edge_scroll(); }

/* JS callable: execute one iteration of the extracted town main loop */
void wasm_town_update(void)
{
    g_town_update_active = 1;
    town_main_loop_step();
    g_town_update_active = 0;
}

/* JS callable: mirror the DOS timer ISR counters in town memory */
void wasm_town_full_tick(void)
{
    MEM8(ADDR_FRAME_TIMER) = (uint8_t)(MEM8(ADDR_FRAME_TIMER) + 1);
    MEM16(ADDR_TICK_COUNTER) = (uint16_t)(MEM16(ADDR_TICK_COUNTER) + 1);
    MEM16(ADDR_ANIM_TIMER) = (uint16_t)(MEM16(ADDR_ANIM_TIMER) + 1);

    /* If we are waiting for a frame delay, check if target reached */
    if (g_pending_wait && MEM8(ADDR_FRAME_TIMER) >= g_pending_wait_target) {
        town_complete_wait();
    }
}

static void town_complete_wait(void)
{
    if (!g_pending_wait) return;

    /* Execute the five calls that originally ran inside the while loop */
    CALL_PROC(confirm_exit_dialog);
    CALL_PROC(handle_pause_state);
    CALL_PROC(handle_speed_change);
    CALL_PROC(joystick_calibration);
    CALL_PROC(joystick_deactivator);
    int do_restore = CALL_PROC_RET(handle_restore_game);
    if (do_restore) restore_game();

    /* Reset frame timer and clear wait state */
    FRAME_TMR = 0;
    g_pending_wait = 0;
    g_pending_wait_target = 0;
}

/* JS callable: copy browser key state into the town input latch bytes */
void wasm_town_set_input_keys(uint8_t keys)
{
    uint8_t dirs = 0;
    if (keys & 0x01) dirs |= 0x01;  /* up */
    if (keys & 0x02) dirs |= 0x02;  /* down */
    if (keys & 0x04) dirs |= 0x04;  /* left */
    if (keys & 0x08) dirs |= 0x08;  /* right */

    MEM8(ADDR_RIGHT_LEFT_DOWN_UP) = dirs;
    MEM8(ADDR_ENTER_KEYS) = (keys & 0x10) ? 0x01 : 0x00;
    MEM8(ADDR_ALT_SPACE) =
        (uint8_t)(((keys & 0x20) ? 0x01 : 0x00) |
                  ((keys & 0x40) ? 0x02 : 0x00));
}

/* JS callable: get pointer into WASM linear memory (for direct JS access) */
uint32_t wasm_get_mem_ptr(void)   { return (uint32_t)(uintptr_t)g_mem; }

/* JS callable: exported utility functions used by building binaries */
void wasm_render_menu_dialog(uint16_t rect_pos, uint8_t pattern)
{
    render_dialog_text(rect_pos, pattern);
}

int  wasm_show_yes_no_dialog(void)        { return show_yes_no_dialog(); }
int  wasm_check_gold(uint16_t lo, uint8_t hi) { return check_gold_sufficient(lo, hi); }
void wasm_add_gold(uint16_t lo, uint8_t hi)   { add_gold_to_hero(lo, hi); }
void wasm_render_menu_string_list(uint16_t si, uint8_t cnt) { render_menu_string_list(si, cnt); }
void wasm_render_menu_list_scrolling(uint16_t si, uint8_t cnt) { render_menu_list_scrolling(si, cnt); }
void wasm_select_from_menu(uint8_t *row)  { select_from_menu(row); }
void wasm_convert_decimal(uint16_t v, uint16_t di) { convert_ax_to_decimal(v, di); }
void wasm_npc_animation(void)             { npcAnimation(); }
void wasm_house_cursor_show(void)         { houseCursorShow(); }
void wasm_house_cursor_up(uint8_t row)    { houseCursorUp(row); }
void wasm_house_cursor_down(uint8_t row)  { houseCursorDown(row); }
void wasm_restore_game(void)              { restore_game(); }
void wasm_set_scroll_floor_right_8px(void (*fn)(void)) { g_town_procs.scroll_floor_right_8px = fn; }
void wasm_set_scroll_floor_left_8px(void (*fn)(void))  { g_town_procs.scroll_floor_left_8px  = fn; }
void wasm_set_scroll_ceiling_right_4px(void (*fn)(void)) { g_town_procs.scroll_ceiling_right_4px = fn; }
void wasm_set_scroll_ceiling_left_4px(void (*fn)(void))  { g_town_procs.scroll_ceiling_left_4px  = fn; }
