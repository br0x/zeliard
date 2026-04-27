/*
 * common.h  –  Zeliard DOS game shared definitions
 * Translated from common.inc (MASM include for Zeliard, Game Arts / Sierra, 1987-1990)
 *
 * All addresses are offsets within the game's flat 256-KB "game_cseg" segment
 * that is allocated at run-time (see zeliard.c).  Pointers into that segment
 * are represented here as byte offsets so that host code can dereference them
 * with  game_mem[OFFSET]  or  *(uint16_t*)(game_mem + OFFSET).
 */

#ifndef COMMON_H
#define COMMON_H

#include <stdint.h>

/* =========================================================================
 * Data structures (originally MASM STRUCs)
 * ========================================================================= */

/* Map/dungeon descriptor – one entry in the mdt_buffer table */
typedef struct {
    uint8_t  b7b6_msd_idx_b0;  /* bit7=is_boss_cavern, bit6=is_jashiin_cavern, bit0: 0=town/1=dungeon */
    uint8_t  mman_grp_idx;     /* Town NPC sprite-group index */
    uint8_t  mpp_grp_idx;      /* Magic-projectile pattern-group index */
    uint8_t  eai_bin_idx;
    uint8_t  enp_grp_idx;
    uint8_t  boss_grp;         /* Boss ENP override (e.g. crab.grp) */
    uint8_t  boss_ai;          /* Boss AI override  (e.g. crab.bin) */
} mdt_descriptor_t;

/* Hero magic projectile */
typedef struct {
    int16_t  mp_x_rel;
    int8_t   mp_y_rel;
    uint8_t  mp_dir;                  /* bit7=return/deactivate, bits1-0=direction */
    uint8_t  mp_life_timer;
    uint8_t  mp_anim_frame;
    uint8_t  mp_cached_x_offset_tiles;
    uint8_t  mp_cached_y_offset;
    uint16_t mp_vram_addr_tile00;
    uint16_t mp_vram_addr_tile10;
    uint16_t mp_vram_addr_tile01;
    uint16_t mp_vram_addr_tile11;
} magic_projectile_t;

/* Spirit (orbiting companion) */
typedef struct {
    uint8_t  s_orbit_phase;    /* 0xFF=inactive; bits3-0=orbit phase */
    uint8_t  s_orbit_speed;
    uint8_t  s_active_shots;
    uint16_t s_vram_addr;      /* bit15=dirty flag, bits14-0=VRAM address */
    uint8_t  s_screen_x;
    uint8_t  s_screen_y;
} spirit_t;

/* =========================================================================
 * Permanent constants
 * ========================================================================= */

#define LEFT          1
#define UP            2
#define SLOPE_RIGHT   1
#define SLOPE_LEFT    2
#define KEY_ENTER     1

/* Sword types */
#define SWORD_TRAINING      1
#define SWORD_WISE_MANS     2
#define SWORD_SPIRIT        3
#define SWORD_KNIGHT        4
#define SWORD_ILLUMINATION  5
#define SWORD_ENCHANTMENT   6

/* Shield types */
#define SHIELD_CLAY         1
#define SHIELD_WISE_MANS    2
#define SHIELD_STONE        3
#define SHIELD_HONOR        4
#define SHIELD_LIGHT        5
#define SHIELD_TITANIUM     6

/* Shoes / accessory types */
#define SHOES_FERUZA        1
#define SHOES_PIRIKA        2
#define SHOES_SILKARN       3
#define SHOES_RUZERIA       4
#define CAPE_ASBESTOS       5

/* =========================================================================
 * Save-game area offsets  (within game_mem[])
 *
 * Word-wide booleans: 0x0000 = No, 0xFFFF = Yes
 * Byte-wide booleans: 0x00   = No, 0xFF   = Yes
 * Item bitfields: see individual comments for bit meanings.
 * ========================================================================= */

#define Cangrejo_Defeated           0x00  /* word: 0000=No / FFFF=Yes */
#define malicia_items               0x02
    /* +128 Chest/50 Golds  +64 Chest/Red Potion  +32 Muralla Key 1
       +16 Wall/Blue Potion  +8 Key/Cangrejo's Lair */
#define malicia_items_1             0x03
    /* +128 Door to Cangrejo open  +64 Door to Satono open
       +32 Collected a Tear of Esmesanti */
#define byte_4                      0x04
#define spoke_to_king               0x05  /* byte */
#define entered_cavern_first_time   0x06  /* byte */
#define Pulpo_Defeated              0x08  /* word */
#define peligro_items               0x09
#define peligro_items_1             0x0A
#define Pollo_Defeated              0x10  /* word */
#define madera_items                0x12
#define riza_items                  0x13
#define Agar_Defeated               0x18  /* word */
#define glacial_items               0x1A
#define escarcha_items              0x1B
#define escarcha_items_1            0x1C
#define Vista_Defeated              0x20  /* word */
#define corroer_items               0x22
#define cementar_items              0x23
#define cementar_items_1            0x24
#define Tarso_Defeated              0x28  /* word */
#define tesoro_items                0x2A
#define plata_items                 0x2B
#define plata_items_1               0x2C
#define plata_items_2               0x2D
#define Paguro_Defeated             0x30  /* word */
#define Dragon_Defeated             0x32  /* word */
#define caliente_items              0x34
#define caliente_items_1            0x35
#define caliente_items_2            0x36
#define absor_items                 0x42
#define milagro_items               0x43
#define desleal_items               0x44
#define falter_items                0x45
#define is_death_already_processed  0x49
#define hero_invincibility          0x7F

/* =========================================================================
 * Run-time game-state offsets  (within game_mem[])
 * ========================================================================= */

#define proximity_map_left_col_x    0x80  /* proximity map centred on hero, width=36 */
#define viewport_top_row_y          0x82
#define hero_x_in_viewport          0x83
#define hero_head_y_in_viewport     0x84
#define hero_gold_hi                0x85
#define hero_gold_lo                0x86
#define bank_gold_hi                0x88
#define bank_gold_lo                0x89
#define hero_almas                  0x8B
#define hero_level                  0x8D  /* 0x00..0xFF */
#define hero_xp                     0x8E
#define hero_HP                     0x90
#define sword_type                  0x92  /* 01-06, see SWORD_* constants */
#define shield_type                 0x93  /* 01-06, see SHIELD_* constants */
#define shield_HP                   0x94
#define shield_max_HP               0x96
#define keys_amount                 0x98  /* ordinary keys */
#define lion_head_keys              0x99
#define elf_crest                   0x9A  /* 00=No, FF=Yes */
#define crest_of_glory              0x9B  /* 00=No, FF=Yes */
#define hero_crest                  0x9C  /* 00=No, FF=Yes */
#define current_magic_spell         0x9D  /* 0=none, 1-7=spell row */
#define current_accessory           0x9E  /* row number */
#define byte_9F                     0x9F
#define Tears_of_Esmesanti_count    0xA0  /* 0..9 */
#define Feruza_Shoes                0xA1  /* high jump */
#define Pirika_Shoes                0xA2  /* feet protection */
#define Silkarn_Shoes               0xA3  /* climb slopes */
#define Ruzeria_Shoes               0xA4  /* anti-ice */
#define Asbestos_Cape               0xA5  /* heat protection */
#define magic_items                 0xA6  /* 0xA6-0xAA: 5 item slots (01-08) */

/* Spell MP costs (defaults shown) */
#define spells_espada               0xAB  /* default 12 */
#define spells_saeta                0xAC  /* default  6 */
#define spells_fuego                0xAD  /* default  8 */
#define spells_lanzar               0xAE  /* default  4 */
#define spells_rascar               0xAF  /* default  3 */
#define spells_agua                 0xB0  /* default  4 */
#define spells_guerra               0xB1  /* default  3 */
#define heroMaxHp                   0xB2
#define espada_count                0xB4
#define saeta_count                 0xB5
#define fuego_count                 0xB6
#define lanzar_count                0xB7
#define rascar_count                0xB8
#define agua_count                  0xB9
#define guerra_count                0xBA

/* Active spell slots: 0x00=inactive, 0xFF=active */
#define espada_active               0xBB
#define saeta_active                0xBC
#define fuego_active                0xBD
#define lanzar_active               0xBE
#define rascar_active               0xBF
#define agua_active                 0xC0
#define guerra_active               0xC1

#define facing_direction            0xC2  /* bit0: 0=Right 1=Left; bit1: 0=Down 1=Up */
#define is_left_run                 0xC3
#define place_map_id                0xC4
    /* 0x80 Felishika's Castle  0x81 Muralla  0x82 Satono  0x83 Bosque
       0x84 Helada  0x85 Tumba  0x86 Dorado  0x87 Llama
       0x88 Pureza  0x89 Esco */
#define last_sage_visited           0xC5
#define healing_potion_timer        0xC6
#define msd_index                   0xC8
    /* 0xC9-0xD1 Magic shop inventory per town
       0xD2-0xDA Weapon shop swords per town
       0xDB-0xE3 Weapon shop shields per town */
#define byte_E4                     0xE4
#define sages_spoken_to_hero        0xE5  /* bitfield: +128 Muralla … +1 Pureza */
#define is_jashiin_cavern           0xE6
#define hero_animation_phase        0xE7
#define invincibility_flag          0xE8

/* =========================================================================
 * Far-call entry-point offsets for resident binary modules
 * (These are fixed offsets within game_cseg used as far-pointer targets.)
 * ========================================================================= */

/* stick.bin */
#define int9_new_proc                    0x100
#define int8_new_proc                    0x103
#define int24_new_proc                   0x106
#define int61_new_proc                   0x109
#define res_dispatcher_proc              0x10C
#define reserved_nop_proc                0x10E
#define Confirm_Exit_Dialog_proc         0x110
#define Handle_Pause_State_proc          0x112
#define Handle_Speed_Change_proc         0x114
#define Joystick_Calibration_proc        0x116
#define Joystick_Deactivator_proc        0x118
#define Accumulate_folded_ff1b_proc      0x11A
#define Scan_Saved_Games_proc            0x11C
#define Handle_Restore_Game_proc         0x11E
#define raw_joystick_calibration_read_proc 0x120

/* gmmcga.bin */
#define Draw_Bordered_Rectangle_proc               0x2000
#define Clear_Viewport_proc                        0x2002
#define Clear_HUD_Bar_proc                         0x2004
#define Draw_Hero_Max_Health_proc                  0x2006
#define Draw_Hero_Health_proc                      0x2008
#define Draw_Boss_Max_Health_proc                  0x200A
#define Draw_Boss_Health_proc                      0x200C
#define Render_Pascal_String_0_proc                0x200E
#define Render_Pascal_String_1_proc                0x2010
#define Clear_Place_Enemy_Bar_proc                 0x2012
#define Print_Almas_Decimal_proc                   0x2014
#define Print_Gold_Decimal_proc                    0x2016
#define Print_Magic_Left_Decimal_proc              0x2018
#define Print_ShieldHP_Decimal_proc                0x201A
#define Render_Sword_Item_Sprite_20x18_proc        0x201C
#define Render_Magic_Spell_Item_Sprite_16x16_proc                 0x201E
#define Render_Shield_Item_Sprite_16x16_proc                    0x2020
#define Render_Font_Glyph_proc                     0x2022
#define Scroll_Screen_Rect_Down_proc               0x2024
#define Capture_Screen_Rect_to_seg3_proc           0x2026
#define Put_Image_proc                             0x2028
#define Render_String_FF_Terminated_proc           0x202A
#define Copy_Screen_Rect_VRAM_proc                 0x202C
#define Draw_Status_Frame_proc                     0x202E
#define Render_Decimal_Digits_proc                 0x2030
#define Convert_32bit_To_Decimal_Digits_proc       0x2032
#define Render_Wearable_Item_Sprite_16x16_proc           0x2034
#define Render_Magic_Potion_Item_Sprite_16x16_proc       0x2036
#define Render_C_String_proc                       0x2038
#define Render_Key_Item_Sprite_16x16_proc                   0x203A
#define Render_Crest_Item_Sprite_16x16_proc                  0x203C
#define Render_Tear_Icon_proc                     0x203E
#define Fade_To_Black_Dithered_proc                0x2040
#define Clear_Screen_proc                          0x2042
#define Reassemble_3_Planes_To_Packed_Bitmap_proc  0x2044

/* fight.bin */
#define Cavern_Game_Init_proc                                      0x6000
#define prepare_dungeon_proc                                       0x6002
#define monster_move_in_direction_proc                             0x6004
#define Check_collision_in_direction_proc                          0x6006
#define move_monster_E_proc                                        0x6008
#define move_monster_NE_proc                                       0x600A
#define move_monster_N_proc                                        0x600C
#define move_monster_NW_proc                                       0x600E
#define move_monster_W_proc                                        0x6010
#define move_monster_SW_proc                                       0x6012
#define move_monster_S_proc                                        0x6014
#define move_monster_SE_proc                                       0x6016
#define check_collision_E2_proc                                    0x6018
#define check_collision_W2_proc                                    0x601A
#define check_collision_N2_proc                                    0x601C
#define check_collision_S2_proc                                    0x601E
#define check_collision_NE2_proc                                   0x6020
#define check_collision_SE2_proc                                   0x6022
#define check_collision_NW2_proc                                   0x6024
#define check_collision_SW2_proc                                   0x6026
#define coords_in_ax_to_proximity_map_offset_in_di_proc            0x6028
#define wrap_map_from_above_proc                                   0x602A
#define wrap_map_from_below_proc                                   0x602C
#define if_passable_set_ZF_proc                                    0x602E
#define Check_Monster_Ids_Two_Rows_Below_Monster_proc              0x6030
#define Check_Vertical_Distance_Between_Hero_And_Monster_proc      0x6032
#define Hero_Hits_monster_proc                                     0x6034
#define HorizDistToHero_35_proc                                    0x6036
#define Get_Stats_proc                                             0x6038
#define Add_Projectile_To_Array_proc                               0x603A
#define Browse_Projectiles_proc                                    0x603C
#define Find_Monsters_Near_Hero_proc                               0x603E
#define Move_Monster_NWE_Depending_On_Whats_Below_proc             0x6040

/* town.bin */
#define special_tile_list_ptr                                      0x8002

/* eai1.bin / crab.bin */
#define Monster_AI_proc                                            0xA000
#define word_A002                                                  0xA002
#define word_A004                                                  0xA004
#define death_split_table_ptr                                      0xA006
#define byte_A010                                                  0xA010

/* select.bin */
#define Inventory_Screen_proc                                      0xA000
#define Inventory_Screen_Full_proc                                 0xA002

/* =========================================================================
 * Fixed buffer addresses within game_cseg
 * ========================================================================= */

#define mdt_buffer                  0xC000
#define mapWidth                    0xC002

#define proximity_map               0xE000  /* 0x900 bytes */
#define viewport_buffer_28x19       0xE900  /* 28*19 = 532 bytes */
#define magic_projectiles           0xEB15
#define spirit_sprite_0             0xEB60
#define spirit_sprite_1             0xEB67
#define spirit_sprite_2             0xEB6E
#define spirit_sprite_3             0xEB75
#define projectiles_array           0xEB80  /* 13 × 32 bytes */
#define proximity_second_layer      0xED20
#define is_boss_dead                0xEDA0

/* Towns */
#define cache_bytes_ptr             0xE005
#define bold_font_8x8                     0xF500
#define digits_font                 0xF502
#define thin_font                0xF504

/* =========================================================================
 * Shared-data area  (0xFF00..0xFFFF within game_cseg)
 * ========================================================================= */

#define fn_exit_far_ptr             0xFF00  /* far pointer (off+seg) */
#define fn_timer_chain_ptr          0xFF04  /* far pointer */
#define heartbeat_volume            0xFF08
#define exit_pending_flag           0xFF09
#define joystick_enabled_flag       0xFF0A
#define byte_FF0B                   0xFF0B
#define fn_per_tick_callback        0xFF0C  /* far pointer */
#define fn_per_tick_callback2       0xFF10  /* far pointer */
#define video_drv_id                0xFF14
#define mt32_enabled                0xFF15
#define ____Alt_Space               0xFF16
#define ____right_left_down_up      0xFF17
#define F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter  0xFF18
#define frame_timer                 0xFF1A
#define anim_timer                  0xFF1B
#define spacebar_latch              0xFF1D
#define altkey_latch                0xFF1E
#define fn_per_tick_user_ptr        0xFF1F  /* far pointer */
#define per_tick_user_enabled       0xFF20
#define byte_FF24                   0xFF24
#define byte_FF26                   0xFF26
#define sound_fx_toggle_by_f2       0xFF27
#define music_channel_param         0xFF28
#define Current_ASCII_Char          0xFF29
#define proximity_start_tiles       0xFF2A  /* town tiles start addr for proximity map left col */
#define seg1                        0xFF2C  /* code_seg + 0x1000 */
#define boss_being_hit              0xFF2E
#define sprite_flash_flag           0xFF2F
#define boss_is_dead                0xFF30
#define viewport_left_top_addr      0xFF31  /* addr within proximity map for viewport top-left */
#define speed_const                 0xFF33
#define is_boss_cavern              0xFF34
#define hero_y_absolute             0xFF35
#define hero_damage_this_frame      0xFF36
#define hero_sprite_hidden          0xFF37
#define squat_flag                  0xFF38
#define on_rope_flags               0xFF39
#define hero_hidden_flag            0xFF3A
#define joystick_calibrated_flag    0xFF3B
#define spell_active_flag           0xFF3C
#define jump_phase_flags            0xFF3D
#define byte_FF3E                   0xFF3E
#define shield_anim_phase           0xFF3F
#define shield_anim_active          0xFF40
#define shield_variant_index        0xFF41
#define slope_direction             0xFF42  /* 1=right, 2=left */
#define sword_swing_flag            0xFF43
#define ui_element_dirty            0xFF44
#define sword_hit_type              0xFF45
#define sword_movement_phase           0xFF46
#define down_thrust_held_flag       0xFF47
#define joystick_direction_bits     0xFF48
#define joystick_button_bits        0xFF49
#define tick_counter                0xFF50
#define monster_index               0xFF4A
#define byte_FF4B                   0xFF4B
#define dialog_string_ptr           0xFF4C
#define dialog_cursor_x             0xFF4E
#define dialog_scroll_counter       0xFF4F
#define menu_item_count             0xFF52
#define menu_max_items              0xFF53
#define menu_base_addr              0xFF54
#define menu_cursor_pos             0xFF56
#define menu_digits_render_flag     0xFF57
#define byte_FF58                   0xFF58
#define numeric_display_x_offset    0xFF68
#define string_width_bytes          0xFF6A
#define save_name                   0xFF6C
#define keyboard_alt_mode_flag      0xFF74
#define soundFX_request             0xFF75
#define font_highlight_flag         0xFF77
#define disk_swap_suppressed        0xFF78
#define fn_kbd_chain_ptr            0xFF79  /* far pointer */

/* =========================================================================
 * seg1 offsets  (code_seg + 0x1000)
 * ========================================================================= */

#define packed_tile_ptr                  0x8000  /* pointer to packed tile data */
#define tile_anim_count_table            0x8000  /* 1 byte/tile: 0=no anim, else frame count */
#define tile_animation_replacement_table 0x8004  /* counted (old,new) pairs terminated by 0xFF */
#define packed_tile_graphics             0x8100  /* 48 bytes/tile (6bpp × 8px × 8 rows) */
#define hero_transparency_masks        0xD000  /* 1 byte/tile-row; 8 bits select sprite vs bg */
#define sword_item_gfx                   0xE200
#define shield_item_gfx                  0xE202
#define crest_item_gfx                   0xE204
#define magic_spell_item_gfx             0xE206
#define key_item_gfx                     0xE208
#define magic_potion_item_gfx            0xE20A
#define wearable_item_gfx                0xE20C

/* =========================================================================
 * seg2 offsets  (code_seg + 0x2000)
 * ========================================================================= */

#define or_blit_buffer      0x6000
#define and_blit_buffer     0x8000
#define mcga_driver_buffer  0x9000

/* =========================================================================
 * Video-driver IDs  (video_drv_id values)
 * ========================================================================= */

#define VIDEO_EGA   0
#define VIDEO_CGA   1
#define VIDEO_CGA2  2
#define VIDEO_HGC   3
#define VIDEO_MCGA  4
#define VIDEO_TGA   5

/* =========================================================================
 * Convenience accessor macros
 * (game_mem is the uint8_t* pointer to the allocated game segment)
 * ========================================================================= */

#define GM_BYTE(offset)   (game_mem[(offset)])
#define GM_WORD(offset)   (*(uint16_t*)((game_mem) + (offset)))

#endif /* COMMON_H */
