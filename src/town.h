/*
 * town.h — Public API for town.c (Zeliard town engine WASM port)
 *
 * All external rendering / resource-loading procedures that the original
 * assembly called via far-call tables (gtmcga.bin, gmmcga.bin, etc.) are
 * represented here as function-pointer members of TownProcs.
 *
 * The JavaScript bridge (zeliard-wasm.js) populates this struct at startup
 * by calling wasm_set_town_proc(index, funcptr) before any town entry.
 */

#ifndef TOWN_H
#define TOWN_H

#include <stdint.h>

/* =========================================================================
 * NPC struct layout (8 bytes each, terminated by n_x = 0xFFFF)
 * ========================================================================= */
typedef struct {
    uint16_t n_x;           /* absolute x coord */
    uint8_t  n_facing;      /* bit7: face-left flag; bit0: walking-left */
    uint8_t  n_head_tile;   /* original head tile (saved before 0xFD replacement) */
    uint8_t  n_anim_phase;  /* animation / movement phase counter */
    uint8_t  n_ai_type;     /* index into npc_ai_jump_table (0–7) */
    uint8_t  n_flags;       /* bit6: interactable, bit7: in-conversation */
    uint8_t  n_id;          /* conversation pattern index */
} NPC;

/* =========================================================================
 * Flat WASM memory (defined in town.c)
 * ========================================================================= */
extern uint8_t g_mem[0x40000];

/* =========================================================================
 * Proc-table: all external procedures called by town.c
 *
 * Naming follows the original ASM proc labels where possible.
 * Pointer is NULL if not yet connected; CALL_PROC macro guards against this.
 * ========================================================================= */
typedef struct {
    /* gtmcga / gmmcga rendering */
    void (*render_town_tiles_28_columns)(void);
    void (*clear_viewport)(void);
    void (*backup_upper_town_3_tiles)(void);
    void (*scroll_floor_right_8px)(void);
    void (*scroll_ceiling_right_4px)(void);
    void (*scroll_floor_left_8px)(void);
    void (*scroll_ceiling_left_4px)(void);
    void (*scroll_hud_up)(uint16_t screen_pos, uint8_t rows, uint8_t width);
    void (*scroll_hud_down)(uint16_t screen_pos, uint8_t rows, uint8_t width);
    void (*scroll_screen_rect_up)(uint16_t pos, uint16_t size);
    void (*scroll_screen_rect_down)(uint16_t pos, uint16_t size);
    void (*apply_sprite_mask)(uint32_t src, uint32_t dst, uint16_t count);
    void (*unpack_to_shadow_memory_six_tiles)(uint16_t buf_addr);
    void (*blit_6_tiles_to_shadow_memory)(const uint8_t *frame);
    void (*get_sprite_vram_address)(uint8_t row_count);
    void (*ui_draw_routine_dispatcher)(uint32_t seg1_base, uint16_t npc_si, uint16_t tile_buf);
    void (*draw_tile_to_screen)(uint16_t tile_addr, uint16_t screen_pos);
    void (*draw_arrow_icon_or_ui_symbol)(uint16_t base, uint8_t row, int dir);
    void (*draw_menu_cursor_arrow)(uint16_t base, uint8_t cursor_row);
    void (*format_string_to_buffer)(const uint8_t *table, uint8_t idx);
    void (*draw_string_buffer_to_screen)(uint16_t screen_pos);
    void (*decompress_patterns)(uint32_t ptr);

    /* gmmcga font / HUD */
    void (*render_font_glyph)(uint16_t bx, uint16_t cl, uint16_t glyph_id);
    void (*render_pascal_string_0)(uint16_t pos, uint8_t color, const char *text);
    void (*render_pascal_string_1)(uint16_t ptr);
    void (*render_c_string)(uint16_t screen_pos, uint16_t si, uint8_t color);
    void (*render_string_ff_terminated)(uint8_t bx_lo, uint8_t cl, const uint8_t *str);
    void (*draw_bordered_rectangle)(uint16_t pos, uint16_t size, uint8_t fill);
    void (*capture_screen_rect_to_seg3)(uint16_t pos, uint16_t di, uint16_t size);
    void (*put_image)(uint16_t pos, uint16_t di, uint16_t size);
    void (*clear_screen)(void);
    void (*fade_to_black_dithered)(void);
    void (*clear_hud_bar)(uint8_t bh, uint8_t bl, uint8_t ch, uint8_t al);
    void (*clear_place_enemy_bar)(void);
    void (*draw_hero_max_health)(void);
    void (*draw_hero_health)(void);
    void (*print_almas_decimal)(void);
    void (*print_gold_decimal)(void);
    void (*print_magic_left_decimal)(void);
    void (*print_shield_hp_decimal)(void);

    /* Resource dispatcher (replaces int 60h / res_dispatcher_proc) */
    void (*res_dispatcher_fn1_mdt)(uint8_t map_id);   /* fn1: load MDT by index */
    void (*res_dispatcher_fn2)(const char *name, uint32_t dest);  /* fn2: segmented load */
    void (*res_dispatcher_fn3)(const char *name, uint32_t dest);  /* fn3: read virtual file */
    int  (*res_dispatcher_fn3_cf)(const char *name, uint32_t dest); /* fn3 with error return */

    /* Background / pattern */
    void (*call_background_code)(uint8_t video_drv_id);

    /* Music / sound (adlib, replaces int 60h) */
    void (*adlib_fn0)(uint32_t music_ptr);   /* fn0: play music */
    void (*adlib_fn1)(void);                 /* fn1: stop music */
    void (*adlib_fn3_mute)(void);            /* fn3: mute channel */

    /* System (replaces int 61h input poll) */
    void (*poll_input)(void);
    void (*confirm_exit_dialog)(void);
    void (*handle_pause_state)(void);
    void (*handle_speed_change)(void);
    void (*joystick_calibration)(void);
    void (*joystick_deactivator)(void);
    int  (*handle_restore_game)(void);       /* returns 1 if restore requested */
    void (*inventory_overlay)(void);         /* cs:word_A002 */

    /* Far-jump targets (replace jmp cs:word_A000/A004) */
    void (*jump_word_a004)(void);            /* sage resurrection */
    void (*transition_to_dungeon)(uint8_t map_id);
    void (*jump_exit_far)(uint16_t ax);      /* fn_exit_far_ptr */
    void (*jump_game_bin_entry)(uint16_t ax);

    /* Saved-game helpers */
    void (*scan_saved_games)(uint16_t buf_addr, const uint8_t *glob);
} TownProcs;

extern TownProcs g_town_procs;

/* =========================================================================
 * CALL_PROC helpers  (handle_restore_game returns a value, needs its own)
 * ========================================================================= */
#define CALL_PROC(name, ...) \
    do { if (g_town_procs.name) g_town_procs.name(__VA_ARGS__); } while(0)

#define CALL_PROC_RET(name, ...) \
    (g_town_procs.name ? g_town_procs.name(__VA_ARGS__) : 0)

/* =========================================================================
 * Exported WASM entry points (callable from JavaScript)
 * ========================================================================= */
/* Async transition handshake */
#define ADDR_PENDING_TRANSITION_MAP      0xFFF1
#define ADDR_PENDING_TRANSITION_PAT      0xFFF2
#define ADDR_PENDING_TRANSITION_DIR      0xFFF3
#define ADDR_PENDING_TRANSITION_FLAG     0xFFF4
#define ADDR_CONVERSATION_ACTIVE         0xFFF5   // byte, 1 = conversation active
#define ADDR_CONVERSATION_NPC_ADDR       0xFFF6   // word, pointer to NPC struct
#define ADDR_CONVERSATION_SAVED_AI       0xFFF8   // byte
#define ADDR_CONVERSATION_SAVED_FACING   0xFFF9   // byte
#define ADDR_BUILDING_ACTIVE             0xFFFA   // byte, 1 = JS-owned building scene active
#define ADDR_BUILDING_DEST_ID            0xFFFB   // byte, TOWN_DOOR.td_dest_id

// Export function to finish conversation (called by JS)
void wasm_town_conversation_finish(void);
void wasm_town_building_finish(void);

void    wasm_town_complete_transition(void);
uint8_t wasm_get_pending_transition_map(void);
uint8_t wasm_get_pending_transition_pat(void);
uint8_t wasm_get_pending_transition_dir(void);

void     wasm_town_init(void);
void     wasm_town_set_return_before_main_loop(int enabled);
void     wasm_town_entry_disabling_edge_scroll(void);
void     wasm_town_entry_enabling_edge_scroll(void);
void     wasm_town_update(void);
void     wasm_town_full_tick(void);
void     wasm_town_set_input_keys(uint8_t keys);
uint32_t wasm_get_mem_ptr(void);

void wasm_render_menu_dialog(uint16_t rect_pos, uint8_t pattern);
int  wasm_show_yes_no_dialog(void);
int  wasm_check_gold(uint16_t lo, uint8_t hi);
void wasm_add_gold(uint16_t lo, uint8_t hi);
void wasm_render_menu_string_list(uint16_t si, uint8_t cnt);
void wasm_render_menu_list_scrolling(uint16_t si, uint8_t cnt);
void wasm_select_from_menu(uint8_t *row);
void wasm_convert_decimal(uint16_t v, uint16_t di);
void wasm_npc_animation(void);
void wasm_house_cursor_show(void);
void wasm_house_cursor_up(uint8_t row);
void wasm_house_cursor_down(uint8_t row);
void wasm_restore_game(void);

#endif /* TOWN_H */
