#ifndef ZELIARD_H
#define ZELIARD_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Memory Layout Constants
// ============================================================================

#define MEM_SAVE_DATA       0x0000    // 256 bytes - Save data (xxx.sav)
#define MEM_MDT_DATA        0xC000    // ~8KB - MDT dungeon data
#define MEM_PROXIMITY_MAP   0xE000    // 2304 bytes - 36x64 proximity map
#define MEM_VIEWPORT_BUFFER 0xE900    // 28*19 bytes - Monster IDs (1 byte each)
#define PACKED_MAP_START      0x1B    // Packed map offset in MDT file (0xC01B - 0xC000)

// ============================================================================
// Global Memory Array (exported for JS access)
// ============================================================================

extern uint8_t g_memory[65536];  // 64KB memory space
extern uint16_t packed_map_start;
extern uint16_t packed_map_end_ptr;  // Current position in packed map
extern uint16_t packed_map_ptr_for_hero_x_minus_18;  // For left column
extern uint16_t packed_map_ptr_for_hero_x_plus_18;   // For right column
extern uint16_t map_hero_row_start;
extern void unpack_step_backward(uint8_t* packed, uint16_t* pos, uint8_t* tile, uint8_t* count);
extern void unpack_step_forward(uint8_t* packed, uint16_t* pos, uint8_t* tile, uint8_t* count);
// ============================================================================
// Type Definitions
// ============================================================================

// Save Data / Global State (0x0000-0x00FF, 256 bytes)
// Layout MUST match WORK/Fight.asm exactly
#pragma pack(push, 1)
typedef struct {
    // Accomplished tasks
    uint16_t Cangrejo_Defeated;         // 0x00  0000 = No, FFFF = Yes
    uint8_t malicia_items;              // 0x02
                                        //       +128 - Chest, 50 Golds
                                        //       +64 - Chest, Red Potion
                                        //       +32 - Muralla Key 1
                                        //       +16 - Wall, Blue Potion
                                        //       +8 - Key, Cangrejo's Lair
    uint8_t malicia_items_1;            // 0x03
                                        //       +128 - Door to Cangrejo open.
                                        //       +64 - Door to Satono open.
                                        //       +32 - Collected a Tear of Esmesanti.    
    uint8_t _pad1;                      // 0x04
    uint8_t spoke_to_king;              // 0x05  00 = No, FF = Yes
    uint8_t entered_cavern_first_time;  // 0x06  00 = No, FF = Yes
    uint8_t _pad2;                      // 0x07
    uint16_t Pulpo_Defeated;            // 0x08-0x09  0000 = No, FFFF = Yes
    uint8_t peligro_items;              // 0x0A
                                        //       +128 - Chest, Blue Potion (With the One-time Bat)
                                        //       +64 - Key, Under Locked Door
                                        //       +32 - Key, Under Blue Open Door
                                        //       +16 - Wall, Red Potion (Far one)
                                        //       +8 - Chest, 50 Gold (Under Satono Door)
                                        //       +4 - Empty Chest
                                        //       +2 - Wall, 100 almas
                                        //       +1 - Chest, Red Potion    
    uint8_t peligro_items_1;            // 0x0B
                                        //       +128 - Open 1st Locked Blue Door
                                        //       +64 - Open Locked Red Door
                                        //       +32 - Open Locked Door to 3rd Dungeon
                                        //       +16 - Key, Pulpo's Lair
                                        //       +8 - Collected a Tear of Esmesanti.
                                        //       +4 - Wall, Red Potion (Near Satono Door)    
    uint8_t _pad3[4];                   // 0x0C-0x0F
    uint16_t Pollo_Defeated;            // 0x10-0x11  0000 = No, FFFF = Yes
    uint8_t madera_items;               // 0x12
                                        //       +128 - Red Potion (Small tree)
                                        //       +64 - Key
                                        //       +32 - Chest, Red Potion (Near Hero's Crest)
                                        //       +16 - Wall, Red Potion (Largest Tree)
                                        //       +8 - Hero's Crest (This one must be set so the crazy guard will let you pass to defeat Pollo.)
                                        //       +4 - 50 Gold (Under Bosque)
                                        //       +2 - Blue Potion (In Riza)
                                        //       +1 - Red Potion (In Riza)
    uint8_t riza_items;                 // 0x13
                                        //       +128 - Red Potion
                                        //       +64 - Chest, Blue Potion
                                        //       +32 - Empty Chest
                                        //       +16 - 100 Gold
                                        //       +8 - Open Locked Red Door
                                        //       +4 - Key, Pollo's Lair
                                        //       +2 - Collected a Tear of Esmesanti.
                                        //       +1 - Open Locked Door to 4th Dungeon
    uint8_t _pad4[4];                   // 0x14-0x17
    uint16_t Agar_Defeated;             // 0x18-0x19  0000 = No, FFFF = Yes
    uint8_t glacial_items;              // 0x1A
                                        //       +128 - Key
                                        //       +64 - Red Potion (Near locked door)
                                        //       +32 - Red Potion (Near Ruzeria Shoes)
                                        //       +16 - Ruzeria Shoes (Changes what people say in Tumba Town; Also gets that woman to stop interrupting you.)
                                        //       +8 - Blue Potion (Near Ruzeria Shoes)
                                        //       +4 - Blue Potion (By Boss Door)
                                        //       +2 - Red Potion (Beside 100 Golds)
                                        //       +1 - 100 Golds
    uint8_t escarcha_items;             // 0x1B
                                        //       +128 - Open 1st Locked Door
                                        //       +64 - Open locked door to Agar's Domain
                                        //       +32 - Chest, 50 Golds
                                        //       +16 - Chest, Blue Potion (By Helada Key)
                                        //       +8 - Key (To Helada)
                                        //       +4 - Red Potion (Near Helada)
                                        //       +2 - Blue Potion (Near Boss Key)
                                        //       +1 - Key (To Boss Lair)
    uint8_t escarcha_items_1;           // 0x1C
                                        //       +128 - Wall, Blue Potion (Escarcha, beside Purple door, on the way to the boss lair)
                                        //       +64 - Wall, Red Potion (Escarcha, near Boss Key)
                                        //       +32 - Open door to Helada
                                        //       +16 - Collected a Tear of Esmesanti.
    uint8_t _pad5[3];                   // 0x1D-0x1F
    uint16_t Vista_Defeated;            // 0x20-0x21  0000 = No, FFFF = Yes
    uint8_t corroer_items;              // 0x22
                                        //       +128 - Chest, Red Potion
                                        //       +64 - Wall, Red Potion (Near Tumba 1st entrance)
                                        //       +32 - Chest, 500 Golds (Nowhere near Gelroid)
                                        //       +16 - Chest, Blue Potion (On way to boss)
                                        //       +8 - Chest, 500 Golds (On way to boss)
                                        //       +4 - Chest, 50 Golds
                                        //       +2 - Chest, Pirika Shoes (Changes what people say in Tumba Town)
                                        //       +1 - Chest, 100 Golds
    uint8_t cementar_items;             // 0x23
                                        //       +128 - Open locked door to Cementar
                                        //       +64 - Wall, Blue Potion (right - pair of potions)
                                        //       +32 - Chest, 1000 Golds
                                        //       +16 - Key (1st locked door)
                                        //       +8 - Chest, 50 Golds
                                        //       +4 - Chest, Blue Potion (Outside Vista's Lair)
                                        //       +2 - Key (To Boss Lair)
                                        //       +1 - Chest, Red Potion
    uint8_t cementar_items_1;           // 0x24
                                        //       +128 - Crest of Glory (Changes what people say in Tumba Town)
                                        //       +64 - Wall, 100 Almas (This one is glitched.)
                                        //       +32 - Chest, Blue Potion (left - pair of potions)
                                        //       +16 - Open locked door to Vista
                                        //       +8 - Blue Potion (In Vista's Lair)
                                        //       +4 - Collected a Tear of Esmesanti.
                                        //       +2 - Returned the Crest of Glory, Changes 0xD6, reduces value by -16 (To remove Knight's Sword from the inventory)
    uint8_t _pad6[3];                   // 0x25-0x27
    uint16_t Tarso_Defeated;            // 0x28-0x29  0000 = No, FFFF = Yes
    uint8_t tesoro_items;               // 0x2A
                                        //       +128 - Chest, Red Potion
                                        //       +64 - Empty Chest
                                        //       +32 - Key, Near Silkarn Shoes
                                        //       +16 - Wall, Blue Potion (Near Silkarn Shoes)
                                        //       +8 - Chest, 1000 Golds (Near Silkarn Shoes)
                                        //       +4 - Silkarn Shoes (Changes a couple things in town)
                                        //       +2 - Chest, Blue Potion (Pair of blue potions, left one)
                                        //       +1 - Chest, Blue Potion (Pair of blue potions, right one)
    uint8_t plata_items;                // 0x2B
                                        //       +128 - Chest, 1000 Golds (Tesoro) (Near 2 Blue Potions)
                                        //       +64 - Key (Tesoro) (To Dorado Town)
                                        //       +32 - Open locked door to Cavern of Caliente (7th dungeon)
                                        //       +16 - Open locked door to Cavern of Arrugia (Overwrites what the lion key girl says in Pureza Town)
                                        //       +8 - Open locked door to Tarso
                                        //       +4 - Open locked door to Dorado Town
                                        //       +2 - Wall, Blue Potion (On way to boss)
                                        //       +1 - Chest, 500 Golds
    uint8_t plata_items_1;              // 0x2C
                                        //       +128 - Chest, Red Potion
                                        //       +64 - Wall, Blue Potion (A little ways from a fire pit, leading to the Silkarn Shoes)
                                        //       +32 - Wall, Blue Potion
                                        //       +16 - Wall, Red Potion (Near Fire pit)
                                        //       +8 - Enchantment Sword (Arrugia)
                                        //       +4 - Feruza Shoes (Arrugia)
                                        //       +2 - 1000 Golds (Arrugia, 3rd one)
                                        //       +1 - 1000 Golds (Arrugia, 2nd one)
    uint8_t plata_items_2;              // 0x2D
                                        //       +128 - 1000 Golds (Arrugia, 1st one)
                                        //       +64 - Blue Potion (Arrugia)
                                        //       +32 - Key, Tarso's Lair
                                        //       +16 - Collected a Tear of Esmesanti.
    uint8_t _pad7[2];                   // 0x2E-0x2F
    uint16_t Paguro_Defeated;           // 0x30-0x31  0000 = No, FFFF = Yes
    uint16_t Dragon_Defeated;           // 0x32-0x33  0000 = No, FFFF = Yes
    uint8_t caliente_items;             // 0x34
                                        //       +128 - Spoke to the girl after defeating Paguro
                                        //       +64 - Purchased the Asbestos Cape
                                        //       +32 - Open locked door (1st one)
                                        //       +16 - Open locked door to Dragon's lair
                                        //       +8 - Chest, Blue Potion (Requires platform to rise up to)
                                        //       +4 - Key (1st one)
                                        //       +2 - Chest, Blue Potion (By vertical wind tunnel)
                                        //       +1 - Key (2nd one)
    uint8_t caliente_items_1;           // 0x35
                                        //       +128 - Chest, Blue Potion (Next to Dragon's door)
                                        //       +64 - Chest, 1000 Golds
                                        //       +32 - Open locked door (2nd one)
                                        //       +16 - Chest, Blue Potion (Reaccion)
                                        //       +8 - Chest, 500 Golds (Reaccion)
                                        //       +4 - Chest, Blue Potion
                                        //       +2 - Chest, Key (Correr, 3rd one)
                                        //       +1 - Chest, 1000 Golds (Correr)
    uint8_t caliente_items_2;           // 0x36
                                        //       +128 - Collected a Tear of Esmesanti.
    uint8_t _pad8[11];                  // 0x37-0x41
    uint8_t absor_items;                // 0x42
                                        //       +128 - Ceiling, Blue Potion (To the left of the potion 'mentioned below')
                                        //       +64 - Ceiling, Blue Potion (Near the exit to the Dragon's Lair)
                                        //       +32 - Ceiling, Blue Potion (Near the Glowing Pit)
                                        //       +16 - Chest, 500 Golds (Near Lion Key)
                                        //       +8 - Lion's Head Key
                                        //       +4 - Chest, 1000 Golds
                                        //       +2 - Chest, 1000 Golds (On the way to Cavern of Falter)
                                        //       +1 - Empty Chest
    uint8_t milagro_items;              // 0x43
                                        //       +128 - Chest, 500 Golds (Far from Lion Key, Absor)
                                        //       +64 - Open 1st locked door (Absor)
                                        //       +32 - Chest, 1000 Golds
                                        //       +16 - Ceiling, Blue Potion (Above Glowing Pit)
                                        //       +8 - Ceiling, Blue Potion (Near 2nd key)
                                        //       +4 - Key (2nd Door)
                                        //       +2 - Key (Boss Door)
                                        //       +1 - Ceiling, Blue Potion (Near Esco Village)
    uint8_t desleal_items;              // 0x44
                                        //       +128 - Chest, 1000 Golds (Milagro)
                                        //       +64 - Wall, Blue Potion (Beside Boss Door)
                                        //       +32 - Open 3rd locked door (Milagro, Alguien's Boss Door)
                                        //       +16 - Open 2nd locked door (Milagro)
                                        //       +8 - Key
                                        //       +4 - Ceiling, Blue Potion (After Crazy Current)
                                        //       +2 - Ceiling, Blue Potion (Above Air Current)
                                        //       +1 - Ceiling, Blue Potion (Below Air Current)
    uint8_t falter_items;               // 0x45
                                        //       +128 - Travel back to Dorado Town using the building in the back.
                                        //       +64 - Collected a Tear of Esmesanti.
                                        //       +32 - Open final locked door (Jashiin's Lair)
                                        //       +16 - Key (Final)
    uint8_t _pad9[3];                   // 0x46-0x48
    uint8_t byte_49;                    // 0x49
    uint8_t _pad10[0x35];               // 0x4A-0x7E
    uint8_t byte_7F;                    // 0x7F
    // Hero Stats (0x80-0xC8)
    uint16_t hero_x_minus_18_abs;       // 0x80  Proximity map is centered around hero, width=36
    uint8_t hero_y_rel;                 // 0x82
    uint8_t hero_x_in_viewport;         // 0x83
    uint8_t hero_head_y_in_viewport;   // 0x84
    uint8_t hero_gold_hi;               // 0x85
    uint16_t hero_gold_lo;              // 0x86
    uint8_t bank_gold_hi;               // 0x88
    uint16_t bank_gold_lo;              // 0x89
    uint16_t hero_almas;                // 0x8B
    uint8_t hero_level;                 // 0x8D  0..ff
    uint16_t hero_xp;                   // 0x8E
    uint16_t hero_HP;                   // 0x90
    uint8_t sword_type;                 // 0x92
                                        //       01 - Training Sword
                                        //       02 - Wise Man's Sword
                                        //       03 - Spirit Sword
                                        //       04 - Knight's Sword
                                        //       05 - Illumination Sword
                                        //       06 - Enchantment Sword    
    uint8_t shield_type;                // 0x93
                                        //       01 - Clay Shield
                                        //       02 - Wise Man's Shield
                                        //       03 - Stone Shield
                                        //       04 - Honor Shield
                                        //       05 - Light Shield
                                        //       06 - Titanium Shield    
    uint16_t shield_HP;                 // 0x94
    uint16_t shield_max_HP;             // 0x96
    uint8_t keys_amount;                // 0x98  (ordinary keys)
    uint8_t lion_head_keys;             // 0x99
    uint8_t elf_crest;                  // 0x9A  00-No, FF-Yes
    uint8_t crest_of_glory;             // 0x9B  00-No, FF-Yes
    uint8_t hero_crest;                 // 0x9C  00-No, FF-Yes
    uint8_t current_magic_spell;        // 0x9D  00, Nothing, 01-07 Spells. This is row#, not which spell is equipped
    uint8_t current_accessory;          // 0x9E  This is Row #, not item specific
    uint8_t _pad11;                     // 0x9F
    uint8_t Tears_of_Esmesanti_count;   // 0xA0  0..9
    uint8_t Feruza_Shoes;               // 0xA1  high jump
    uint8_t Pirika_Shoes;               // 0xA2  feet protection
    uint8_t Silkarn_Shoes;              // 0xA3  climb slopes
    uint8_t Ruzeria_Shoes;              // 0xA4  anti-ice
    uint8_t Asbestos_Cape;              // 0xA5  heat protection
    uint8_t magic_items[5];             // 0xA6-0xAA
                                        //       01 - Ken'ko Potion
                                        //       02 - Juu-en Fruit
                                        //       03 - Elixir of Kashi
                                        //       04 - Chikara Powder
                                        //       05 - Magia Stone
                                        //       06 - Holy Water of Acero
                                        //       07 - Sabre Oil
                                        //       08 - Kioku Feather    
    uint8_t spells_espada[7];            // 0xAB-0xB1
                                        //       Espada, default:12
                                        //       Saeta, default: 6
                                        //       Fuego, default: 8
                                        //       Lanzar, default: 4
                                        //       Rascar, default: 3
                                        //       Agua, default: 4
                                        //       Guerra, default: 3    
    uint16_t heroMaxHp;                 // 0xB2
    uint8_t espada_count;               // 0xB4
    uint8_t saeta_count;                // 0xB5
    uint8_t fuego_count;                // 0xB6
    uint8_t lanzar_count;               // 0xB7
    uint8_t rascar_count;               // 0xB8
    uint8_t agua_count;                 // 0xB9
    uint8_t guerra_count;               // 0xBA
    uint8_t espada_active;              // 0xBB
    uint8_t saeta_active;               // 0xBC
    uint8_t fuego_active;               // 0xBD
    uint8_t lanzar_active;              // 0xBE
    uint8_t rascar_active;              // 0xBF
    uint8_t agua_active;                // 0xC0
    uint8_t guerra_active;              // 0xC1
    uint8_t starting_direction;         // 0xC2  00 & 02 = Right, 01 & 03 = Left
    uint8_t byte_C3;                    // 0xC3
    uint8_t place_map_id;               // 0xC4
                                        //       80h - Felishika's Castle
                                        //       81h - Muralla
                                        //       82h - Satono
                                        //       83h - Bosque
                                        //       84h - Helada
                                        //       85h - Tumba
                                        //       86h - Dorado
                                        //       87h - Llama
                                        //       88h - Pureza
                                        //       89h - Esco    
    uint8_t last_sage_visited;          // 0xC5
    uint16_t word_C6;                   // 0xC6
    uint8_t byte_C8;                    // 0xC8
    // Shop Inventories (0xC9-0xE3)
    uint8_t magic_stores[9];            // 0xC9-0xD1  Magic Stores Inventory. --- TOWNS
                                        //       C9 - Muralla Town (Default: 8A)
                                        //       CA - Satono Town (Default: A6)
                                        //       CB - Bosque Village (Default: 6B)
                                        //       CC - Helada Town (Default: 75)
                                        //       CD - Tumba Town (Default: 42)
                                        //       CE - Dorado Town (Default: 4C)
                                        //       CF - Llama Town (Default: 4B)
                                        //       D0 - Pureza Town (Default: 01)
                                        //       D1 - Esco Village (Default: FF)    
                                        //       --- ITEM VALUES
                                        //       + 128 - Ken'ko Potion
                                        //       + 64 - Juu-en Fruit
                                        //       + 32 - Elixir of Kashi
                                        //       + 16 - Chikara Powder
                                        //       + 8 - Magia Stone
                                        //       + 4 - Holy Water of Acero
                                        //       + 2 - Sabre Oil
                                        //       + 1 - Kioku Feather                                        
    uint8_t weapon_swords[9];           // 0xD2-0xDA  Weapon Shop Inventory, Swords --- TOWNS
                                        //       D2 - Muralla Town (Default: C0)
                                        //       D3 - Satono Town (Default: C0)
                                        //       D4 - Bosque Village (Default: E0)
                                        //       D5 - Helada Town (Default: E0)
                                        //       D6 - Tumba Town (Default: 70)
                                        //       D7 - Dorado Town (Default: 38)
                                        //       D8 - Llama Town (Default: 38)
                                        //       D9 - Pureza Town (Default: F8)
                                        //       DA - Esco Village (Default: F8)
                                        //       --- ITEM VALUES
                                        //       + 128 - Training Sword
                                        //       + 64 - Wise Man's Sword
                                        //       + 32 - Spirit Sword
                                        //       + 16 - Knight's Sword
                                        //       + 8 - Illumination Sword
                                        //       + 4 - Enchantment Sword    
    uint8_t weapon_shields[9];          // 0xDB-0xE3  Weapon Shop Inventory, Shields --- TOWNS
                                        //       DB - Muralla Town (Default: C0)
                                        //       DC - Satono Town (Default: E0)
                                        //       DD - Bosque Village (Default: E0)
                                        //       DE - Helada Town (Default: 70)
                                        //       DF - Tumba Town (Default: 30)
                                        //       E0 - Dorado Town (Default: 38)
                                        //       E1 - Llama Town (Default: 1C)
                                        //       E2 - Pureza Town (Default: 1C)
                                        //       E3 - Esco Village (Default: FC)
                                        //       --- ITEM VALUES
                                        //       + 128 - Clay Shield
                                        //       + 64 - Wise Man's Shield
                                        //       + 32 - Stone Shield
                                        //       + 16 - Honor Shield
                                        //       + 8 - Light Shield
                                        //       + 4 - Titanium Shield
    // Flags (0xE4-0xE8)
    uint8_t byte_E4;                    // 0xE4
    uint8_t sages_spoken_to_hero;       // 0xE5
                                        //       + 128 - Muralla
                                        //       + 64 - Satono
                                        //       + 32 - Bosque
                                        //       + 16 - Helada
                                        //       + 8 - Tumba
                                        //       + 4 - Dorado
                                        //       + 2 - Llama
                                        //       + 1 - Pureza    
    uint8_t byte_E6;                    // 0xE6
    uint8_t byte_E7;                    // 0xE7
    uint8_t byte_E8;                    // 0xE8
    uint8_t _pad_end[0x17];             // 0xE9-0xFF
} SaveData;
#pragma pack(pop)

// Verify struct size at compile time
_Static_assert(sizeof(SaveData) == 256, "SaveData must be 256 bytes");

// MDT Header (at 0xC000)
// First 2 bytes are unknown, then the actual header fields
typedef struct {
    uint16_t unknown;               // 0xC000 - Unknown (byte 0x29 relates to normal/boss caverns)
    uint16_t map_width;             // 0xC002 - Dungeon width (height is always 64)
    uint16_t vert_platforms_offset; // 0xC004 - Vertical platforms
    uint16_t air_streams_offset;    // 0xC006 - Air streams
    uint16_t horiz_platforms_offset;// 0xC008 - Horizontal platforms
    uint16_t doors_offset;          // 0xC00A - Doors
    uint16_t items_check_offset;    // 0xC00C - Items check
    uint16_t cavern_name_offset;    // 0xC00E - Cavern name renderer
    uint16_t monsters_offset;       // 0xC010 - Monsters
} MDTHeader;

// Monster Entry in MDT (16 bytes)
typedef struct {
    int16_t currX;
    int8_t  currY;
    int8_t  x_rel;
    int8_t  flags;
    int8_t  field_5;
    int8_t  field_6;
    int8_t  state_flags;
    int8_t  field_8;
    int8_t  field_9;
    int8_t  field_A;
    int16_t spwnX;
    int8_t  spwnY;
    int8_t  type;
    int8_t  counter;
} MonsterEntry;

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
// Input Constants
// ============================================================================

// Input buffer location in WASM memory
#define MEM_INPUT_BUFFER 0xFF16 // 4 bytes reserved for input state

// Key flags (bitmask) - matches original DOS keyboard input
typedef enum {
    INPUT_NONE      = 0x00,
    INPUT_UP        = 0x01,
    INPUT_DOWN      = 0x02,
    INPUT_LEFT      = 0x04,
    INPUT_RIGHT     = 0x08,
    INPUT_ENTER     = 0x10,
    INPUT_SPACE     = 0x20,
    INPUT_ALT       = 0x40,
    INPUT_ESC       = 0x80,
} InputFlags;

// Input buffer structure at 0xFF16-0xFF19 (4 bytes)
typedef struct {
    uint8_t current_keys;      // Current frame key state (bitmask)
    uint8_t pressed_keys;      // Keys pressed this frame (edge-triggered)
    uint8_t released_keys;     // Keys released this frame (edge-triggered)
    uint8_t previous_keys;     // Previous frame key state (for edge detection)
} InputBuffer;

// ============================================================================
// Public API (exported to WASM/JS)
// ============================================================================

// Initialize the dungeon engine
void wasm_init(void);

// Load MDT file into memory at 0xC000
// Returns 0 on success, -1 on error
int wasm_load_mdt(const uint8_t* mdt_data, uint32_t mdt_size);

// Get pointer to MDT header
MDTHeader* wasm_get_mdt_header(void);

// Get monster buffer (0xE900)
uint8_t* wasm_get_monster_buffer(void);

// Get proximity map (0xE000)
uint8_t* wasm_get_proximity_map(void);

// Get save data (0x0000)
SaveData* wasm_get_save_data(void);

// Get input buffer (0xFF16-0xFF19 - 4 bytes)
InputBuffer* wasm_get_input_buffer(void);

// Initialize cavern with spawn point
void wasm_init_cavern(uint8_t spawn_x, uint8_t spawn_y, uint8_t direction);

// Prepare dungeon - main initialization/entry point from town
void prepare_dungeon(void);

// Alternative entry point that uses prepare_dungeon
void wasm_init_cavern_with_prepare(uint8_t spawn_x, uint8_t spawn_y, uint8_t direction);

// Cavern_Game_Init - Main entry point for dungeon
void Cavern_Game_Init(void);

// Monster AI
void Monster_AI(MonsterEntry* m);
void update_all_monsters_in_map(void);

// Input Handling
void input_init(void);
void input_update(void);
void input_set_keys(uint8_t keys);
uint8_t input_get_current_keys(void);
uint8_t input_get_pressed_keys(void);
uint8_t input_get_released_keys(void);
int input_is_key_pressed(uint8_t key);
int input_is_key_held(uint8_t key);
int input_is_key_released(uint8_t key);

void town_to_dungeon_transition(uint16_t x, uint8_t y, uint8_t c3, uint8_t cavern_id);

// Hero Movement State Machine
void state_machine_dispatcher(void);  // Fight.asm 0x6343
void hero_movement_init(void);
void hero_movement_update(void);
int hero_get_direction(void);
void hero_set_direction(int direction);
int hero_get_state(void);
int hero_is_moving(void);
int hero_can_change_direction(void);
void hero_set_state(int state);

// Platform Movement
void move_platform_up(void);
int move_platform_down(void);
void update_horizontal_platforms(void);
void hero_interaction_check(void);

// Combat System
void combat_init(void);
void combat_update(void);
void Hero_Hits_monster(MonsterEntry* monster, uint8_t monster_index);
uint8_t Get_Stats(uint8_t request_type);
uint8_t get_combat_timer(void);
void set_combat_flag(uint8_t value);

// Boss Battle System
void init_boss_battle(void);
void update_boss_battle(void);
void boss_take_damage(uint16_t damage);
uint16_t get_boss_hp(void);
uint16_t get_boss_max_hp(void);
int is_boss_defeated(void);

// Collision Detection (8 directions)
int check_collision_E2(uint8_t x, uint8_t y);
int check_collision_W2(uint8_t x, uint8_t y);
int check_collision_N2(uint8_t x, uint8_t y);
int check_collision_S2(uint8_t x, uint8_t y);
int check_collision_NE2(uint8_t x, uint8_t y);
int check_collision_SE2(uint8_t x, uint8_t y);
int check_collision_NW2(uint8_t x, uint8_t y);
int check_collision_SW2(uint8_t x, uint8_t y);
int if_passable_set_ZF(uint8_t tile);
void set_danger_type(uint8_t type);
uint8_t get_danger_type(void);

// Map utilities
uint16_t wrap_map_from_above(uint16_t offset);
uint16_t wrap_map_from_below(uint16_t offset);
// Unpack MDT map data into proximity map
void unpack_map();
void unpack_map_internal(uint8_t hero_x, uint8_t hero_y);
void unpack_column(uint8_t* packed, uint16_t* pos, uint8_t* dest);
// Convert coordinates to proximity map offset
uint16_t coords_to_proximity_offset(uint8_t x, uint8_t y);
uint16_t get_map_width(void);
uint16_t get_packed_map_start(void);
void update_monsters_for_right_scroll(void);
void update_monsters_for_left_scroll(void);

// Rendering
void main_update_render(void);

// Collision Detection wrappers for MonsterEntry
int check_collision_E2_monster(MonsterEntry* m);
int check_collision_W2_monster(MonsterEntry* m);
int check_collision_N2_monster(MonsterEntry* m);
int check_collision_S2_monster(MonsterEntry* m);
int check_collision_NE2_monster(MonsterEntry* m);
int check_collision_SE2_monster(MonsterEntry* m);
int check_collision_NW2_monster(MonsterEntry* m);
int check_collision_SW2_monster(MonsterEntry* m);

// Run one game frame
void wasm_update(void);

// Debug: dump memory region
void wasm_debug_dump(uint16_t offset, uint16_t length);

// ============================================================================
// Physics API (Hero jump, rope physics)
// ============================================================================

// Initialization
void physics_init(void);
void physics_update(void);

// Jump physics
void sub_64BB(void);           // Jump trajectory calculation
void start_jump(void);         // Initialize jump
void update_jump_trajectory(void);

// Rope physics
void sub_6DB1(void);           // Rope position update
void start_climb_rope(void);   // Start climbing rope
void climb_up_rope(void);      // Climb up on rope
void climb_down_rope(void);    // Climb down on rope
int is_over_rope(void);        // Check if over rope tile

// Tile helpers
int is_rope_tile(uint8_t tile);
int is_ladder_tile(uint8_t tile);
int is_walkable_tile(uint8_t tile);

// State accessors
uint8_t get_jump_phase_flags(void);
void set_jump_phase_flags(uint8_t flags);
uint8_t get_on_rope_flags(void);
void set_on_rope_flags(uint8_t flags);
int is_on_ground(void);
int is_jumping(void);
int is_on_rope(void);

// Helper functions
int set_zero_flag_if_slippery(void);

// Complex routines
int sub_684C(void);            // Hero state machine (returns negative if blocked)
void sub_66A5(void);           // Jump trajectory variant

#ifdef __cplusplus
}
#endif

#endif // ZELIARD_H
