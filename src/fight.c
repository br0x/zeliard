// fight.c - Main dungeon engine initialization
// Port of Fight.asm prepare_dungeon and related functions

#include "zeliard.h"

// ============================================================================
// External functions from string.c
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// ============================================================================
// External functions from other modules
// ============================================================================
extern void unpack_map_internal(uint8_t hero_x, uint8_t hero_y);
extern void update_all_monsters_in_map(void);
extern void main_update_render(void);
extern void hero_interaction_check(void);

// ============================================================================
// Global State Variables - Key offsets from Fight.asm
// ============================================================================

// 0x9EED-0x9F2E region (64 bytes cleared by prepare_dungeon)
#define byte_9EED       g_memory[0x9EED]
#define byte_9EEF       g_memory[0x9EEF]
#define byte_9EF5       g_memory[0x9EF5]
#define mman_grp_index       g_memory[0x9EF6]
#define byte_9EF8       g_memory[0x9EF8]
#define byte_9F00       g_memory[0x9F00]
#define byte_9F01       g_memory[0x9F01]
#define byte_9F02       g_memory[0x9F02]
#define byte_9F0A       g_memory[0x9F0A]
#define byte_9F20       g_memory[0x9F20]
#define byte_9F21       g_memory[0x9F21]
#define byte_9F22       g_memory[0x9F22]
#define byte_9F26       g_memory[0x9F26]
#define byte_9F27       g_memory[0x9F27]

// 0xFF00 region flags
#define byte_FF00       g_memory[0xFF00]
#define byte_FF1A       g_memory[0xFF1A]
#define spacebar_latch       g_memory[0xFF1D]
#define altkey_latch       g_memory[0xFF1E]
#define byte_FF24       g_memory[0xFF24]
#define boss_being_hit       g_memory[0xFF2E]
#define sprite_flash_flag       g_memory[0xFF2F]
#define boss_is_dead       g_memory[0xFF30]
#define byte_FF34       g_memory[0xFF34]    // Boss battle mode
#define byte_FF36       g_memory[0xFF36]
#define byte_FF37       g_memory[0xFF37]
#define byte_FF38       g_memory[0xFF38]
#define byte_FF3A       g_memory[0xFF3A]
#define byte_FF3C       g_memory[0xFF3C]
#define byte_FF3E       g_memory[0xFF3E]
#define byte_FF42       g_memory[0xFF42]
#define byte_FF43       g_memory[0xFF43]
#define byte_FF44       g_memory[0xFF44]
#define byte_FF4B       g_memory[0xFF4B]

// Hero state flags
#define on_rope_flags       g_memory[0xFF14]
#define jump_phase_flags    g_memory[0xFF1D]
#define proximity           g_memory[0xFF3B]

// Save data access
#define save_data           ((SaveData*)&g_memory[MEM_SAVE_DATA])
#define mdt_header          ((MDTHeader*)&g_memory[MEM_MDT_DATA])

// Viewport buffer (0xE900-0xEB13)
#define VIEWPORT_BUFFER_SIZE (28 * 19)
#define viewport_buffer     (&g_memory[0xE900])

// ============================================================================
// Forward declarations
// ============================================================================

static void sub_7E5B(void);
static void process_mdt_header(uint8_t mdt_byte);
static void remove_accomplished_items(void);
static void clear_viewport_buffer(void);

static SaveData* get_save_data(void) {
    return (SaveData*)&g_memory[MEM_SAVE_DATA];
}

// ============================================================================
// sub_7E5B
// Port of Fight.asm 0x7E5B - Clear state flags and initialize
// ============================================================================

static void sub_7E5B(void) {
    // Clear various state flags
    byte_FF43 = 0;
    byte_FF44 = 0;
    byte_FF3C = 0;
    jump_phase_flags = 0;  // 0: on ground
    byte_FF38 = 0;
    byte_FF36 = 0;
    byte_9EEF = 0;
    byte_FF3E = 0;
    byte_FF4B = 0;
    proximity = 0;
    SaveData* save = get_save_data();
    save->byte_E7 = 0;
    
    // Set word slots_13_bytes_32_rows to 0xFFFF
    g_memory[0xEDA0] = 0xFF;
    g_memory[0xEDA1] = 0xFF;
    
    // Clear word_EB15
    g_memory[0xEB15] = 0xFF;
    g_memory[0xEB16] = 0xFF;
    
    byte_FF3A = 0;
    byte_9EF5 = 0;
    
    // Clear viewport buffer (0xE900-0xEB13)
    clear_viewport_buffer();
}

// ============================================================================
// clear_viewport_buffer
// Clear the viewport buffer at 0xE900
// ============================================================================

static void clear_viewport_buffer(void) {
    memset(viewport_buffer, 0, VIEWPORT_BUFFER_SIZE);
}

// ============================================================================
// process_mdt_header
// Port of Fight.asm 0x7E93 - Process MDT header
// ============================================================================

static void process_mdt_header(uint8_t mdt_byte) {
    // Copy first 4 bytes from MDT buffer to 0x9EF6-0x9EF9
    // MDT header: [0]=flags, [1-2]=width, [3]=special
    memcpy(&g_memory[0x9EF6], &g_memory[MEM_MDT_DATA], 4);
    
    // Process byte 0 (flags)
    // Bit 0: Special transition flag
    // Bit 1: Boss flag (sets byte_FF34)
    // Bit 2: Fade flag (sets byte_E6)
    uint8_t flags = mdt_byte >> 1;  // Shift right by 1
    flags &= 0x0F;                   // Keep lower 4 bits
    
    SaveData* save = get_save_data();
    // Check if this is a boss cavern (byte_C8 comparison)
    if (flags != save->byte_C8) {
        byte_FF24 = 0x0A;
        save->byte_C8 = flags;
    }
    
    // Store the processed value
    g_memory[0x9EFA] = 0xFF;
    g_memory[0x9EFB] = 0xFF;
}

// ============================================================================
// remove_accomplished_items
// Port of Fight.asm 0x6BFC - Remove items that have been collected
// 
// The accomplished_items_checker table (pointed to by MDT header at 0xC00C)
// contains entries with the following structure:
//   dw check_address    - Address to check in save data
//   db mask             - Mask to apply
//   Then pairs of (dw dest_addr, dw value) terminated by 0xFFFF
//
// If (memory[check_address] & mask) != 0, copy values to destination addresses
// ============================================================================

static void remove_accomplished_items(void) {
    // Get pointer to accomplished_items_checker table from MDT header
    uint16_t table_ptr = mdt_header->items_check_offset;
    
    if (table_ptr < MEM_MDT_DATA || table_ptr >= 0xE000) {
        return;  // Invalid table pointer
    }
    
    uint16_t si = table_ptr;
    
    while (1) {
        // Read check_address (word at [si])
        uint16_t check_addr = *(uint16_t*)&g_memory[si];
        
        // Check for end of table (0xFFFF)
        if (check_addr == 0xFFFF) {
            return;
        }
        
        // Skip past check_address (2 bytes) to get to mask
        si += 3;
        
        // Read mask (byte at [si-1], which is the byte after check_address)
        uint8_t mask = g_memory[si - 1];
        
        // Check if (mask & memory[check_addr]) != 0
        if ((mask & g_memory[check_addr]) != 0) {
            // Process move_loop - copy values to destinations
            while (1) {
                // Read destination address
                uint16_t dest_addr = *(uint16_t*)&g_memory[si];
                
                // Check for end of moves (0xFFFF)
                if (dest_addr == 0xFFFF) {
                    break;
                }
                
                // Read value to copy (word at [si+2])
                uint16_t value = *(uint16_t*)&g_memory[si + 2];
                
                // Copy value to destination
                *(uint16_t*)&g_memory[dest_addr] = value;
                
                // Move to next pair (4 bytes: dest_addr + value)
                si += 4;
            }
        } else {
            // Skip this entry - find the 0xFFFF terminator
            while (1) {
                uint16_t dest_addr = *(uint16_t*)&g_memory[si];
                
                if (dest_addr == 0xFFFF) {
                    break;
                }
                
                // Skip this pair (4 bytes)
                si += 4;
            }
        }
        
        // Skip past the 0xFFFF terminator (2 bytes) and move to next entry
        si += 2;
    }
}

// ============================================================================
// prepare_dungeon
// Port of Fight.asm 0x79DC - Main dungeon initialization entry point
// Called when transitioning from town to dungeon
// ============================================================================

void prepare_dungeon(void) {
    SaveData* save = get_save_data();
    
    // Clear memory region 0x9EED to 0x9F2D (64 bytes)
    // This is the region just before the 0x9F2E marker
    memset(&g_memory[0x9EED], 0, 0x9F2E - 0x9EED);
    
    // Set byte_9EF5 to 0xFF
    byte_9EF5 = 0xFF;
    
    // Reset resource indices
    // eai_bin_index = 0;
    // enp_grp_index = 0;
    
    // Call sub_7E5B to clear state flags
    sub_7E5B();
    
    // Set flags at 0xEB60, 0xEB67, 0xEB6E, 0xEB75 to 0xFF
    g_memory[0xEB60] = 0xFF;
    g_memory[0xEB67] = 0xFF;
    g_memory[0xEB6E] = 0xFF;
    g_memory[0xEB75] = 0xFF;
    
    // Clear byte_FF3A
    byte_FF3A = 0;
    
    // Skip: Load vfs_fman_grp resources (sprites - not needed for ASCII version)
    // Original: Loads hero sprite frames to 0x6000
    
    // Skip: Copy sprite data (graphics - not needed for ASCII version)
    // Original: Copies sprite animation data
    
    // Process MDT header
    uint8_t mdt_byte = g_memory[MEM_MDT_DATA];
    process_mdt_header(mdt_byte);
    
    // Skip: Call word_2002 (graphics related)
    
    // Skip: Load roka_grp_0 resources (sprites - not needed for ASCII version)
    // Original: Loads rock/cavern entrance sprites to 0x8000
    
    // Skip: Reassemble bitmap (graphics - not needed for ASCII version)
    
    // Skip: Draw cavern entrance (graphics - stub for ASCII version)
    // Original: Renders the cavern entrance animation
    
    // Check if coming from a save point (place_map_id >= 0x80)
    if (save->place_map_id < 0x80) {
        // Not from save point - remove accomplished items
        remove_accomplished_items();
    }
    
    // Continue to loc_7C6E - check byte_C3 for direction
    if (save->byte_C3 != 0) {
        // Coming from right side - hero faces left
        save->starting_direction |= 0x01;  // Set bit 0 for left
        
        // Skip: Animate hero running from right (graphics - stub)
        // Original: 26 frames of hero running animation from right
        
    } else {
        // Coming from left side - hero faces right
        save->starting_direction &= ~0x01;  // Clear bit 0 for right
        
        // Skip: Animate hero running from left (graphics - stub)
        // Original: 26 frames of hero running animation from left
    }
    
    // Malicia cavern mdt_byte = 0x29 = 00101001 (regular cavern)
    // Check MDT header bit 0 (boss cavern flag)
    if (mdt_byte & 0x01) { // regular cavern
        // Skip: load_cavern_sprites_ai_music (graphics/sound - stub)
        
        // unknown flag (bit 1)
        if (mdt_byte & 0x02) {
            byte_FF34 = 0xFF;
        } else {
            byte_FF34 = 0;
        }
        
        // Check fade flag (bit 2)
        if (mdt_byte & 0x04) {
            g_memory[0x00E6] = 0xFF;  // Fade effect
        } else {
            g_memory[0x00E6] = 0;
        }
        
        boss_being_hit = 0;
        sprite_flash_flag = 0;
        
        save->hero_x_in_viewport = 0x0C;  // Spawn to the left of center (12)
        
        // Skip: Graphics setup for boss battle
        
    } else {
        // Boss cavern entrance
        // Set hero position
        save->hero_x_in_viewport = 0x10;  // To the right of center (16)
        
        // Skip: Regular entrance graphics setup
    }
    
    // Initialize the cavern
    // Unpack map data into proximity map centered on hero
    unpack_map_internal(save->hero_x_in_viewport, save->hero_y_rel);
    
    // Fill monster buffer from MDT
    // (Handled by unpack_map_internal or separately)
    
    // Update all monsters in the map
    update_all_monsters_in_map();
    
    // Clear input flags
    spacebar_latch = 0;
    altkey_latch = 0;
    byte_FF1A = 0;
    byte_9F27 = 0;
    
    // Set flag for MDT unpacked
    byte_9F27 = 1;
    
    // Initial render
    main_update_render();
    
    // Clear flag
    byte_9F26 = 0;
    
    // Ready for game loop - return to caller
    // (Caller will enter main game loop)
}

// ============================================================================
// Alternative entry point that uses prepare_dungeon
// ============================================================================

void wasm_init_cavern_with_prepare(uint8_t spawn_x, uint8_t spawn_y, uint8_t direction) {
    SaveData* save = get_save_data();
    save->hero_x_in_viewport = spawn_x;
    save->hero_y_rel = spawn_y;
    save->starting_direction = direction;
    
    // Call the main prepare_dungeon function
    prepare_dungeon();
}

// Muralla -> Malicia:
// hero_y_rel = 0x3d
// byte_C3 = 0
// place_map_id = 0
// load mp10.mdt
// hero_x_minus_18_abs = 0x2d
// entered_cavern_first_time = 0xFF
void town_to_dungeon_transition(uint16_t x, uint8_t y, uint8_t c3, uint8_t cavern_id) {
    SaveData* save = get_save_data();
    save->hero_x_minus_18_abs = x; // 0x2d
    save->byte_C3 = c3; // 0
    save->place_map_id = cavern_id; // 0
    save->entered_cavern_first_time = 0xFF;
    save->hero_head_y_in_viewport = 10;
    // x=0x16, y=0x3d
    wasm_init_cavern_with_prepare(0x16, y, 0);
}
