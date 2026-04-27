// cavern.c - Cavern_Game_Init and main game loop
// Port of Fight.asm Cavern_Game_Init (0x6042) and related functions

#include "zeliard.h"

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// ============================================================================
// Global Variables (0xFF00 region) - Key offsets from Fight.asm
// ============================================================================

// These are accessed via g_memory[0xFFxx]
// Offsets from 0xFF00:

// 0xFF00 flags
#define byte_9F01       g_memory[0x9F01]    // UI update flag
#define byte_9F02       g_memory[0x9F02]    // Boss battle flag
#define byte_9F0A       g_memory[0x9F0A]    // Timer counter
#define byte_9F20       g_memory[0x9F20]
#define byte_9F21       g_memory[0x9F21]
#define byte_9F22       g_memory[0x9F22]
#define byte_9F26       g_memory[0x9F26]
#define byte_9F27       g_memory[0x9F27]    // MDT unpacked flag

// 0xFF00 region flags
#define byte_FF00       g_memory[0xFF00]
#define byte_FF1A       g_memory[0xFF1A]    // Async completion flag
#define spacebar_latch       g_memory[0xFF1D]
#define altkey_latch       g_memory[0xFF1E]
#define boss_being_hit       g_memory[0xFF2E]
#define sprite_flash_flag       g_memory[0xFF2F]
#define boss_is_dead       g_memory[0xFF30]
#define byte_FF34       g_memory[0xFF34]    // Boss battle mode
#define byte_FF37       g_memory[0xFF37]
#define byte_FF38       g_memory[0xFF38]
#define byte_FF42       g_memory[0xFF42]
#define byte_FF43       g_memory[0xFF43]

// Hero state flags
#define on_rope_flags       g_memory[0xFF14]    // 0=ground, 0xFF=rope, 0x80=transition
#define jump_phase_flags    g_memory[0xFF1D]    // 0=ground, 0xFF=ascending, 0x7F=descending
#define starting_direction  g_memory[0xFFC2]    // Bit 0: horizontal, Bit 1: squat

// Hero position in save data
#define hero_x_in_viewport  g_memory[0x86]
#define hero_y_rel          g_memory[0x81]

// ============================================================================
// Forward declarations
// ============================================================================

static void init_cavern(void);
static void fill_e900_buffer(void);
void main_update_render(void);
static void input_handling(void);
void hero_interaction_check(void);

// ============================================================================
// Cavern_Game_Init
// Port of Fight.asm 0x6042
// ============================================================================

/**
 * Initialize and run the cavern game loop
 * This is the main entry point after loading MDT
 */
void Cavern_Game_Init(void) {
    // Clear various flags (as in original 0x6049-0x6073)
    byte_9F20 = 0;
    byte_9F21 = 0;
    byte_9F22 = 0;
    boss_being_hit = 0;
    sprite_flash_flag = 0;
    boss_is_dead = 0;
    byte_9F01 = 0;
    
    // Check for boss battle mode (0x6078)
    if (byte_FF34) {
        // Boss battle initialization
        // For now, just clear the flag and continue as regular cavern
        byte_FF34 = 0;
    }
    
    // Regular cavern initialization (0x6179)
    // - Clear place/enemy bars (stub - rendering handled by JS)
    // - Render cavern name (stub)
    // - Draw hero stats (stub)
    
    // Initialize the cavern (0x623D)
    init_cavern();
    
    // Check for hero death (0x6266)
    // if (byte_49) process_hero_death();
    
    // Clear input flags (0x628A)
    spacebar_latch = 0;
    altkey_latch = 0;
    byte_FF1A = 0;
    byte_9F27 = 0;
    
    // Enter main game loop (0x629C)
    // Note: In WASM, we don't loop forever - we return and let JS call wasm_update()
}

// ============================================================================
// init_cavern
// Port of Fight.asm 0x623D
// ============================================================================

static void init_cavern(void) {
    // sub_6C98 - unpack MDT data into proximity map
    // This would unpack the full map from MDT into the 36-column proximity window
    // For now, just mark as unpacked
    byte_9F27 = 1;

    // Fill monster buffer from MDT (0x6247)
    fill_e900_buffer();

    // Initial render (0x624A)
    main_update_render();

    // Clear flag (0x624D)
    byte_9F26 = 0;

    // Update all monsters (0x6263) - now uses real implementation from monster_ai.c
    update_all_monsters_in_map();
}

// ============================================================================
// fill_e900_buffer
// Copy monster IDs from MDT to monster buffer at 0xE900
// ============================================================================

static void fill_e900_buffer(void) {
    // Clear monster buffer first
    memset(&g_memory[MEM_VIEWPORT_BUFFER], 0, 28*19);
    
    // Get monster list from MDT
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    if (header->monsters_offset >= MEM_MDT_DATA && 
        header->monsters_offset < 0xE000) {
        
        const MonsterEntry* monsters = (const MonsterEntry*)&g_memory[header->monsters_offset];
        uint8_t* monster_buf = &g_memory[MEM_VIEWPORT_BUFFER];
        uint16_t monster_count = 0;
        
        // Iterate through monster list until 0xFFFF marker
        while (monster_count < 256) {
            // Check for end marker (0xFFFF in currX field)
            if (monsters->currX == -1) {
                break;
            }
            
            // Store monster type/ID in buffer
            monster_buf[monster_count] = (uint8_t)monsters->type;
            
            monsters++;
            monster_count++;
        }
    }
}

// ============================================================================
// main_update_render
// Port of main_update_render - renders the viewport
// ============================================================================

void main_update_render(void) {
    // Stub - rendering handled by JavaScript
    // Original: Renders dirty tiles, updates viewport
    // For web version, JS will read proximity map and render
}

// ============================================================================
// input_handling
// Process keyboard/joystick input
// ============================================================================

static void input_handling(void) {
    // Stub - input handled by JavaScript
    // JS will set input flags that C code reads
}

// ============================================================================
// wasm_update - Main game loop entry point for JS
// ============================================================================

/**
 * Process one game frame
 * Called 60 times per second from JavaScript
 */
void wasm_update(void) {
    // Check rope state (0x629C)
    if (on_rope_flags) {
        // On rope physics (0x62DB)
        byte_FF38 = 0;
        jump_phase_flags = 0;
        byte_FF42 = 0;
        // byte_FF3C preserved (not used yet)
        // Flush UI if dirty (stub)
        byte_FF43 = 0;
        
        // Render (stub)
        main_update_render();
        
        // Rope physics update
        // sub_6DB1 - rope position update
        // is_over_rope - check if still over rope
        
        // State machine
        state_machine_dispatcher();
        
        // Check if still on rope
        if (!on_rope_flags) {
            // Move off rope (0x631D)
            starting_direction &= 0xFB;  // Clear bit 1 (squat)
            on_rope_flags = 0;
            spacebar_latch = 0;
            altkey_latch = 0;
            byte_9F20 = 0;
            byte_9F21 = 0;
            // byte_E7 = g_memory[0x00E7];  // In save data region
        }
    } else {
        // Normal ground physics (0x62A3)
        input_handling();
        // sub_64BB - physics update
        main_update_render();
        // sub_87B0 - unknown
        hero_interaction_check();
        // sub_6412 - unknown
        byte_9F0A++;
        if (byte_9F0A == 2) {
            byte_FF38 = 0;
        }
        state_machine_dispatcher();
    }
}
