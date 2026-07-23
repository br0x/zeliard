#ifndef ZELIARD_H
#define ZELIARD_H

#include <stdint.h>
#include <stddef.h>
#include <stdarg.h>

#ifdef __cplusplus
extern "C" {
#endif

// Macros for accessing linear WASM memory
#define MEM8(addr)     (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)    (*(uint16_t *)&g_mem[(addr) & 0xFFFF])
#define MEM8_1(addr)   (g_mem[((addr) & 0xFFFF) + 0x10000])
#define MEM16_1(addr)  (*(uint16_t *)&g_mem[((addr) & 0xFFFF) + 0x10000])

// Constants
#define LEFT             1
#define UP               2
#define SLOPE_NONE       0
#define SLOPE_RIGHT      1
#define SLOPE_LEFT       2
#define SLIDE_RIGHT      1
#define SLIDE_LEFT       2
#define ROPE_TILE_1      1
#define ROPE_TILE_2      2
#define LEFT_SLOPE_TILE  11
#define RIGHT_SLOPE_TILE 12
#define ICE_TILE_START   0x40
#define ICE_TILE_END     0x48
#define SHOES_FERUZA     1
#define SHOES_PIRIKA     2
#define SHOES_SILKARN    3
#define SHOES_RUZERIA    4
#define AIRFLOW_UP       0
#define AIRFLOW_LEFT     1
#define AIRFLOW_RIGHT    2
#define SHIELD_NONE      0
#define SHIELD_CLAY      1
#define SHIELD_WISE_MANS 2
#define SHIELD_STONE     3
#define SHIELD_HONOR     4
#define SHIELD_LIGHT     5
#define SHIELD_TITANIUM  6

#define KEY_UP           1
#define KEY_DOWN         2
#define KEY_LEFT         4
#define KEY_RIGHT        8
#define KEY_ENTER        1
#define KEY_SPACE        1
#define KEY_ALT          2
// String IDs to render by js
#define YOU_GET_50_GOLD_STR         1
#define YOU_GET_100_GOLD_STR        2
#define YOU_GET_500_GOLD_STR        3
#define YOU_GET_1000_GOLD_STR       4
#define YOU_GET_KEY_STR             5
#define YOU_HAVE_RECOVERED_STR      6
#define YOU_HAVE_RECOVERED_FULL_STR 7
#define SHIELD_BROKEN_STR           8
#define CANT_OPEN_THIS_DOOR_STR     9
#define NOTHING_IN_THE_BOX_STR      10
#define GET_HEROS_CREST_STR         11
#define GET_RUZERIA_SHOES_STR       12
#define YOU_GET_GLORY_CREST_STR     13
#define GET_PIRIKA_SHOES_STR        14
#define GET_FERUZA_SHOES_STR        15
#define GET_SILKARN_SHOES_STR       16
#define GET_ENCHANTMENT_SWORD_STR   17
#define ITS_TOO_HOT_STR             18
#define GET_LIONS_HEAD_KEY_STR      19

#define SWORD_ENCHANTMENT           6
#define PROJECTILE_STRUCT_SIZE 13
#define MAX_PROJECTILES        32

#define PROX_COLS                36
#define DUNGEON_HEIGHT           64
#define VIEW_COLS                28
#define VIEW_ROWS                18


// Memory Layout Constants
#define MEM_SAVE_DATA                 0       // 256 bytes - Save data (xxx.sav)
#define ADDR_DEATH_ALREADY_PROCESSED  0x49
#define ADDR_HERO_INVINCIBILITY       0x7F    // byte
#define ADDR_PROXIMITY_MAP_LEFT_COL   0x80    // word
#define ADDR_VIEWPORT_TOP_ROW         0x82    // byte
#define ADDR_HERO_X_VIEW              0x83
#define ADDR_HERO_HEAD_Y_VIEW         0x84
#define ADDR_HERO_GOLD_HI             0x85    // byte
#define ADDR_HERO_GOLD_LO             0x86    // word
#define ADDR_HERO_ALMAS               0x8B    // word
#define ADDR_HERO_LEVEL               0x8D    // byte
#define ADDR_HERO_XP                  0x8E    // word
#define ADDR_HERO_HP                  0x90    // word
#define ADDR_SWORD_TYPE               0x92
#define ADDR_SHIELD_TYPE              0x93
#define ADDR_SHIELD_HP                0x94    // word
#define ADDR_SHIELD_MAX_HP            0x96    // word
#define ADDR_KEYS_AMOUNT              0x98
#define ADDR_LION_KEYS_AMOUNT         0x99
#define ADDR_ELF_CREST                0x9A    // byte
#define ADDR_CREST_OF_GLORY           0x9B    // byte
#define ADDR_HERO_CREST               0x9C    // byte
#define ADDR_CURRENT_MAGIC_SPELL      0x9D    // byte
#define ADDR_CURRENT_ACCESSORY        0x9E
#define ADDR_FERUZA_SHOES             0xA1    // byte
#define ADDR_MAGIC_ITEMS              0xA6    // 0xA6..0xAA: 5 slots for Items
                                              //    01 - Ken'ko Potion
                                              //    02 - Juu-en Fruit
                                              //    03 - Elixir of Kashi
                                              //    04 - Chikara Powder
                                              //    05 - Magia Stone
                                              //    06 - Holy Water of Acero
                                              //    07 - Sabre Oil
                                              //    08 - Kioku Feather
#define ADDR_SPELLS_ESPADA            0xAB    // number of spell left
#define ADDR_SPELLS_SAETA             0xAC    // number of spell left
#define ADDR_SPELLS_FUEGO             0xAD    // number of spell left
#define ADDR_SPELLS_LANZAR            0xAE    // number of spell left
#define ADDR_SPELLS_RASCAR            0xAF    // number of spell left
#define ADDR_SPELLS_AGUA              0xB0    // number of spell left
#define ADDR_SPELLS_GUERRA            0xB1    // number of spell left
#define ADDR_HERO_MAX_HP              0xB2    // word
#define ADDR_ESPADA_COUNT             0xB4    // byte, in inventory
#define ADDR_SAETA_COUNT              0xB5    // byte, in inventory
#define ADDR_FUEGO_COUNT              0xB6    // byte, in inventory
#define ADDR_LANZAR_COUNT             0xB7    // byte, in inventory
#define ADDR_RASCAR_COUNT             0xB8    // byte, in inventory
#define ADDR_AGUA_COUNT               0xB9    // byte, in inventory
#define ADDR_GUERRA_COUNT             0xBA    // byte, in inventory
#define ADDR_ESPADA_ACTIVE            0xBB    // byte, 00 = No, FF = Yes
#define ADDR_SAETA_ACTIVE             0xBC    // byte, 00 = No, FF = Yes
#define ADDR_FUEGO_ACTIVE             0xBD    // byte, 00 = No, FF = Yes
#define ADDR_LANZAR_ACTIVE            0xBE    // byte, 00 = No, FF = Yes
#define ADDR_RASCAR_ACTIVE            0xBF    // byte, 00 = No, FF = Yes
#define ADDR_AGUA_ACTIVE              0xC0    // byte, 00 = No, FF = Yes
#define ADDR_GUERRA_ACTIVE            0xC1    // byte, 00 = No, FF = Yes
#define ADDR_FACING                   0xC2
#define ADDR_LEFT_RUN                 0xC3
#define ADDR_PLACE_MAP_ID             0xC4
#define ADDR_LAST_SAGE_VISITED        0xC5    // byte
#define ADDR_HEALING_TIMER            0xC6    // word
#define ADDR_MSD_INDEX                0xC8    // byte
#define ADDR_BYTE_E4                  0xE4
#define ADDR_IS_JASHIIN_CAVERN        0xE6
#define ADDR_HERO_ANIM_PHASE          0xE7
#define ADDR_INVINCIBILITY_FLAG       0xE8

#define ADDR_BOSS_STATE_BLOCK                          0x9D00

#define ADDR_BOSS_STATE_PTR                            0xA002  // word
#define ADDR_DEATH_DESCRIPTORS_PTR                     0xA006  // word
#define ADDR_XP_FOR_MONSTER                            0xA008
#define ADDR_MONSTER_DAMAGE                            0xA010  // 16 bytes
#define ADDR_MONSTER_AI_MOVE_LEFT_FRAMES               0xA030
#define ADDR_MONSTER_AI_DEATH_LEFT_FRAMES              0xA040
#define ADDR_MONSTER_AI_ITEM_ANIMATION_LEFT_FRAMES     0xA050
#define ADDR_MONSTER_AI_POTIONS_LEFT_FRAMES            0xA060
#define ADDR_MONSTER_AI_MOVE_RIGHT_FRAMES              0xA070
#define ADDR_MONSTER_AI_DEATH_RIGHT_FRAMES             0xA080
#define ADDR_MONSTER_AI_ITEM_ANIMATION_RIGHT_FRAMES    0xA090
#define ADDR_MONSTER_AI_POTIONS_RIGHT_FRAMES           0xA0A0
#define ADDR_TRAJECTORIES                              0xA531

#define ADDR_MDT                                       0xC000    // MDT dungeon data
#define ADDR_MAP_WIDTH                                 0xC002
#define ADDR_VERTICAL_PLATFORMS_LIST                   0xC004
#define ADDR_COLLAPSING_PLATFORMS_LIST                 0xC006
#define ADDR_HORIZ_PLATFORMS_LIST                      0xC008
#define ADDR_DOORS_LIST                                0xC00A
#define ADDR_ACHIEVEMENTS_TABLE                        0xC00C
#define ADDR_CAVERN_NAME_INFO                          0xC00E
#define ADDR_MONSTERS_LIST                             0xC010
#define ADDR_CAVERN_LEVEL                              0xC012
#define ADDR_TEAR_X                                    0xC013    // word
#define ADDR_TEAR_Y                                    0xC015    // byte
#define ADDR_HERO_Y_VIEW_INIT                          0xC016    // byte
#define ADDR_CAVERN_SIGNS_INFO                         0xC017    // word
#define ADDR_PACKED_MAP_END_PTR                        0xC019    // [0xC019] points behind the last byte of packed map
#define ADDR_PACKED_MAP_START                          0xC01B    // Packed map offset in MDT file

#define ADDR_PROXIMITY_MAP                             0xE000    // 2304 bytes - 36x64 proximity map
#define ADDR_VIEWPORT_ENTITIES                         0xE900    // 532 bytes - 28*19 entity IDs (1 byte each) = 0x214 bytes
// Note: the last row is dummy, because sometimes we need to write 2x2 tiles blocks to the row 18

#define ADDR_MAGIC_PROJECTILES                         0xEB15  // word
#define ADDR_MAGIA_STONE_SPRITE0                            0xEB60  // byte
#define ADDR_MAGIA_STONE_SPRITE1                            0xEB67  // byte
#define ADDR_MAGIA_STONE_SPRITE2                            0xEB6E  // byte
#define ADDR_MAGIA_STONE_SPRITE3                            0xEB75  // byte
#define ADDR_PROJECTILES_LIST                          0xEB80  // 13x32 bytes
#define ADDR_PROXIMITY_LAYER2                          0xED20  // 128 bytes
#define ADDR_BOSS_EXPLOSIONS_LIST                      0xEDA0  // up to 32 entities (4 bytes each)

#define ADDR_HEARTBEAT_VOLUME                          0xFF08  // byte
#define ADDR_INPUT_ALT_SPACE                           0xFF16  // byte ____Alt_Space
#define ADDR_INPUT_DIRS                                0xFF17  // byte ____right_left_down_up
#define ADDR_F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter 0xFF18  // word
#define ADDR_FRAME_TIMER                               0xFF1A  // byte
#define ADDR_SPACEBAR_LATCH                            0xFF1D  // byte
#define ADDR_ALTKEY_LATCH                              0xFF1E  // byte
#define ADDR_BYTE_FF24                                 0xFF24
#define ADDR_BOSS_BEING_HIT                            0xFF2E  // byte
#define ADDR_SPRITE_FLASH_FLAG                         0xFF2F  // byte
#define ADDR_BOSS_IS_DEAD                              0xFF30  // byte
#define ADDR_VIEWPORT_LEFT_TOP                         0xFF31  // word; address within proximity map, corresponding to viewport row 0, column -4; 0E000h .. 0E8FFh
#define ADDR_SPEED_CONST                               0xFF33  // byte
#define ADDR_IS_BOSS_CAVERN                            0xFF34  // byte
#define ADDR_HERO_Y                                    0xFF35  // hero_y_absolute (byte)
#define ADDR_HERO_DAMAGE_THIS_FRAME                    0xFF36  // byte
#define ADDR_HERO_SPRITE_HIDDEN                        0xFF37  // byte
#define ADDR_SQUAT_FLAG                                0xFF38  // byte
#define ADDR_ON_ROPE_FLAGS                             0xFF39  // byte
#define ADDR_HERO_HIDDEN_FLAG                          0xFF3A  // byte
#define ADDR_SPELL_ACTIVE_FLAG                         0xFF3C  // byte
#define ADDR_JUMP_PHASE_FLAGS                          0xFF3D  // byte
#define ADDR_BYTE_FF3E                                 0xFF3E
#define ADDR_SHIELD_ANIM_PHASE                         0xFF3F  // byte
#define ADDR_SHIELD_ANIM_ACTIVE                        0xFF40  // byte
#define ADDR_SHIELD_VARIANT_INDEX                      0xFF41  // byte
#define ADDR_SLOPE_DIRECTION                           0xFF42  // 1=right, 2=left, 0=none
#define ADDR_SWORD_SWING_FLAG                          0xFF43  // byte
#define ADDR_UI_ELEMENT_DIRTY                          0xFF44  // byte
#define ADDR_SWORD_HIT_TYPE                            0xFF45  // byte; 0=Forward hit, 1=Overhead swing, 2=Ground downward thrust
#define ADDR_SWORD_MOVEMENT_PHASE                      0xFF46  // byte
#define ADDR_DOWN_THRUST_HELD                          0xFF47  // byte
#define ADDR_MONSTER_INDEX                             0xFF4A  // byte
#define ADDR_BYTE_FF4B                                 0xFF4B
#define ADDR_TICK_COUNTER                              0xFF50  // word
#define ADDR_KEYBOARD_ALT_MODE_FLAG                    0xFF74  // byte
#define ADDR_SOUND_FX_REQUEST                          0xFF75  // byte
#define ADDR_FONT_HIGHLIGHT_FLAG                       0xFF77  // byte

#define ADDR_DUNGEON_STATE          0xFF90  // byte
#define ADDR_DUNGEON_FRAME_PHASE    0xFF91  // byte
#define ADDR_RENDER_REQUEST         0xFF92  // byte: 0xFF = JS should render
#define ADDR_RENDER_DONE            0xFF93  // byte: 0xFF = JS rendered
#define ADDR_GOLD_RENDER_REQUEST    0xFF94  // byte
#define ADDR_DEATH_COUNTER          0xFF95  // byte
#define ADDR_NOTIFICATION_MSG_ID    0xFF96  // byte
#define ADDR_NOTIFICATION_FLAG      0xFF97  // byte
#define ADDR_ALMAS_RENDER_REQUEST   0xFF98  // byte

#define ADDR_HEALTH_BAR_REQUEST     0xFF99  // byte: 0xFF = JS should call drawLifeBar()
#define ADDR_SHIELD_HP_RENDER_REQUEST 0xFF9A // byte
#define ADDR_DUNGEON_SUBSTATE       0xFF9B  // byte
#define ADDR_DUNGEON_SUBSTATE_PHASE 0xFF9C  // byte
#define ADDR_ROKA_PHASE             0xFF9D  // byte: roka_run animation step (0..25)
#define ADDR_ROKA_COLOR             0xFF9E  // byte: roka background index (0=cyan..4=violet)
#define ADDR_BOSS_HEALTH_REQUEST    0xFF9F  // byte: 0xFF = JS should call drawBossHealth()
#define ADDR_BOSS_MODE              0xFFA0  // byte: 0xFF: draw 'ENEMY' and boss health gauge instead of 'PLACE' and place_name, also boss name instead of Gold indicator
#define ADDR_CAVERN_SIGN_FLAG       0xFFA1  // byte
#define ADDR_CAVERN_SIGN_IDX        0xFFA2  // byte

#define ADDR_DUNGEON_EXIT_FLAG    0xFFE2
#define ADDR_HERO_DEATH_FLAG      0xFFE3

#define ADDR_PENDING_DUNGEON_MAP  0xFFFC
#define ADDR_PENDING_DUNGEON_FLAG 0xFFFD



// Addresses originally in seg1
#define ADDR_PASSABLE_TILES         0x8000 // seg1-based
#define ADDR_AGGRESSIVE_TILES       0x8020 // seg1-based
#define ADDR_SLOPE_TILES_LEFT       0x8018 // seg1-based
#define ADDR_SLOPE_TILES_RIGHT      0x801C // seg1-based
#define ADDR_AIRFLOW_TILES          0x8024 // seg1-based

#define ADDR_REACH_TABLE_SEG1       0xB002 // seg1-based

enum {
    DUNGEON_STATE_NORMAL = 0,
    DUNGEON_STATE_ROPE = 1,
    DUNGEON_STATE_DEATH_FALL = 2,
    DUNGEON_STATE_DEATH_FLASH = 3,
    DUNGEON_STATE_DEATH_FADE = 4,
    DUNGEON_STATE_BOSS_ENCOUNTER = 5,
    DUNGEON_STATE_EXIT = 6,
    DUNGEON_STATE_ROKA_RUN = 7,
    DUNGEON_STATE_DOOR_PENDING = 8,
};

// ============================================================================
// Global Memory Array (exported for JS access)
// ============================================================================

extern uint8_t g_mem[65536*4];  // 64KB*4 memory space
extern uint16_t packed_map_ptr_for_prox_left;  // For left column
extern uint16_t packed_map_ptr_for_prox_right;   // For right column
extern uint16_t saved_door_x1;  // door X preserved across prepare_dungeon's memset
// ============================================================================
// Type Definitions
// ============================================================================


// ============================================================================
// Accessory Constants
// ============================================================================

typedef enum {
    ACCESSORY_NONE = 0,
    ACCESSORY_FERUZA_SHOES = 1,   // High jump
    ACCESSORY_PIRIKA_SHOES = 2,   // Feet protection
    ACCESSORY_SILKARN_SHOES = 3,  // Climb slopes
    ACCESSORY_RUZERIA_SHOES = 4,  // Anti-ice (prevents slipping)
    ACCESSORY_ASBESTOS_CAPE = 5,  // Heat protection
} AccessoryType;



// ============================================================================
// Public API (exported to WASM/JS)
// ============================================================================

// Initialize the dungeon engine
void wasm_init(void);

void prepare_dungeon(uint8_t is_from_town);

void Cavern_Game_Init();

// Monster AI
void Monster_AI(uint16_t m); // generic entry
void load_eai_module(uint8_t level_index); // enemy AI dispatcher
void Monster_AI_1(uint16_t m);
void Monster_AI_2(uint16_t m);
void Cangrejo_AI(uint16_t m);
void Pulpo_AI(uint16_t m);
static void update_all_monsters_in_map(void);
static void place_monster_in_proximity_and_run_ai(uint16_t m);
static void monster_activation(uint16_t m);
uint8_t check_monster_on_aggressive_ground(uint16_t m);
uint8_t Check_Vertical_Distance_Between_Hero_And_Monster(uint16_t m);
void damage_hero(uint16_t damage);
void render_notification_string(uint8_t str_idx);
void Add_Projectile_To_Array(uint8_t *src);
void Draw_Hero_Health();
void Draw_Boss_Health();

// Hero Movement State Machine
void state_machine_dispatcher(void);  // Fight.asm 0x6343

// Platform Movement
void hero_interaction_check(void);

// Combat System
void Hero_Hits_monster(uint16_t monster);
uint8_t Get_Stats(uint8_t request_type);

// Collision Detection (8 directions)
uint8_t Check_collision_in_direction(uint16_t m, uint8_t dir);
uint8_t check_collision_E2(uint16_t m);
uint8_t check_collision_W2(uint16_t m);
uint8_t check_collision_N2(uint16_t m);
uint8_t check_collision_S2(uint16_t m);
uint8_t check_collision_NE2(uint16_t m);
uint8_t check_collision_SE2(uint16_t m);
uint8_t check_collision_NW2(uint16_t m);
uint8_t check_collision_SW2(uint16_t m);
uint8_t is_blocking(uint8_t tile);
uint8_t monster_move_in_direction(uint16_t m, uint8_t dir);
uint8_t move_monster_E(uint16_t m);
uint8_t move_monster_NE(uint16_t m);
uint8_t move_monster_N(uint16_t m);
uint8_t move_monster_NW(uint16_t m);
uint8_t move_monster_W(uint16_t m);
uint8_t move_monster_SW(uint16_t m);
uint8_t move_monster_S(uint16_t m);
uint8_t move_monster_SE(uint16_t m);

void unpack_map();
void unpack_column(uint16_t* packed_ptr, uint8_t* dest);
void unpack_column_backward(uint16_t* packed_ptr, uint8_t* dest);
void unpack_step_forward(uint16_t* packed_ptr, uint8_t* tile, uint8_t* count);
void unpack_step_backward(uint16_t* packed_ptr, uint8_t* tile, uint8_t* count);
uint8_t is_blocking_tile(uint8_t tile);
uint8_t lookup_shared(uint8_t tile);
uint8_t get_airflow_direction(uint8_t tile);
void hero_moves_right();
void hero_moves_left();
void every_projectile_moves_left_in_viewport();
void every_projectile_moves_right_in_viewport();
void hero_interaction_check(void);
void check_airflows_on_hero();
void game_loop_render_and_timing(uint8_t invincible);
uint8_t move_hero_right_if_no_obstacles(void);
uint8_t move_hero_left_if_no_obstacles(void);
uint16_t hero_coords_to_addr_in_proximity(void);
void wrap_map_from_above(uint16_t *si);
void wrap_map_from_below(uint16_t *si);
void hero_scroll_down(void);
void move_hero_up(void);
uint8_t is_blocking_tile(uint8_t tile);
uint8_t get_airflow_direction(uint8_t tile);
int8_t set_zero_flag_if_slippery(void);
void sliding_physics_step(void);
void hero_knockback_handler();
uint8_t airborne_movement();
void on_right_pressed();
void on_left_pressed();
void init_on_ground();
void slope_assist_on_landing(void);
void left_default();
void right_default();
uint8_t get_slope_direction_by_tile_under_feet(uint16_t si);
void dispatch_airflows(uint16_t si);
void try_door_interaction(uint8_t *should_break);
void enter_the_door(uint8_t *should_break);
void enter_opened_door(uint16_t si);
uint8_t open_door(uint16_t si);
void res_dispatcher_proc(char *fname, int address);
void roka_run();
void after_run_animation();
uint16_t coords_to_prox_addr(uint8_t x, uint8_t y);
uint8_t is_in_proximity_window(uint16_t x, uint8_t *x_rel);
uint8_t get_dst_monster_flags(uint16_t si, uint8_t* flags, uint16_t *monster_struct);
void update_hero_XP(uint16_t amount);
static void hero_got_almas(uint16_t amount);
static void Print_Almas_Decimal();
void transit_to_sage();
void process_hero_death();
void process_doors();
void screen_flash_overlay();
void clear_viewport_buffer();
void state_machine_dispatcher_idle_default();
void up_pressed();
void left_up_pressed();
void right_up_pressed();
uint8_t move_platform_down_damage_monster();
void down_pressed();
void init_horizontal_sliding();
static uint8_t is_tile_safe_to_stay(uint8_t tile);
void flush_dirty_projectile(uint16_t p);
void Browse_Projectiles();
void restore_bg_tile_at_given_position(uint8_t rel_x, uint8_t rel_y, uint16_t screen_dest);
uint16_t proximity_map_coords_to_viewport_offset(uint8_t x, uint8_t y);
void Dungeon_Static_Tile_Cached_Drawer(uint8_t al, uint16_t dx);
void update_active_projectiles_render();
void Uncompress_And_Render_Tile(uint8_t tile_idx, uint16_t screen_half_addr);
void update_and_render_projectile_row_pair();
void projectiles_collision_processing();
void sub_846F(uint16_t p);
void projectile_advance_position(uint16_t p);
uint8_t projectile_y_vs_hero_row_dispatch(uint16_t p, uint8_t al);
uint8_t projectile_read_curved_path_step(uint16_t p);


// Rendering
void main_update_render(void);
void render_hud_bars_with_enemy();
void Render_Animated_Tile_Strip_proc();
void Update_Local_Attribute_Cache_proc();
void Copy_Tile_Buffer_To_VRAM_proc();
void Draw_Bordered_Rectangle_proc();
void render_boss_hud();
void Flush_Ui_Element_If_Dirty_proc();
void Clear_Viewport_proc();
void Load_Magic_Spell_Sprite_Group_proc();
void Reassemble_3_Planes_To_Packed_Bitmap_proc(uint32_t ptr, uint8_t num_tiles);
void Render_Sword_Overlay();

// Debug logging — calls js_log import on the JS side
void debug_log(const char *msg);
void debug_printf(const char *fmt, ...);

// Rope physics
uint8_t is_over_rope(uint16_t si); // Check if over rope tile

// From gfmcga.c

// Loads the 3×3 block of tile indices around the hero’s current position from the proximity map 
// and stores them into tile_neighborhood_buffer. Used later to determine what tiles are 
// under or near the hero for proper rendering and attribute lookups.
// Output:
// tile_neighborhood_buffer (9 bytes) filled with tile indices 
// (negative values indicate valid loaded tiles, zero if blank).
void Sample_Neighborhood_Attributes();

/*
 * Iterates the list of active boss explosions (max 32, 4 bytes each,
 * terminated by a 0xFF - see Spawn_Boss_Explosion_Ring) and renders
 * each one as a 16x16 sprite into the viewport. Explosions are removed
 * from the list (by compacting the survivors over them) once their
 * lifetime counter runs out.
 */
void Boss_Explosions_Renderer();
uint8_t get_random();


#ifdef __cplusplus
}
#endif

#endif // ZELIARD_H
