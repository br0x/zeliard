// boss_ai.c - Boss Battle System
// Port of WORK/crab.asm (Cangrejo boss AI) and Fight.asm boss battle logic

#include "zeliard.h"

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// Physics functions
extern uint8_t get_jump_phase_flags(void);
extern uint8_t get_on_rope_flags(void);

// Collision functions
extern int check_collision_E2(uint8_t x, uint8_t y);
extern int check_collision_W2(uint8_t x, uint8_t y);
extern int if_passable_set_ZF(uint8_t tile);

// Monster AI functions
extern void Monster_AI(MonsterEntry* m);

// ============================================================================
// Constants
// ============================================================================

#define MEM_SAVE_DATA        0x0000
#define MEM_MDT_DATA         0xC000
#define MEM_PROXIMITY_MAP    0xE000
#define MEM_VIEWPORT_BUFFER  0xE900 // 28*19 bytes

// Boss state constants
#define BOSS_STATE_PATROL    0
#define BOSS_STATE_ATTACK    6
#define BOSS_STATE_SPAWN     9

// Minion spawn pattern constants
#define MINION_PATTERN_SIZE  10
#define MINION_GRID_COLS     6
#define MINION_GRID_ROWS     10

// ============================================================================
// Boss State Variables (from crab.asm 0xA7C3-0xA7ED)
// ============================================================================

// Boss position and HP
static uint16_t boss_x = 0x2B;        // word_A7C3 - Boss X position (starts at 43)
static uint8_t boss_y = 0x0C;         // byte_A7C5 - Boss Y position (starts at 12)
static uint16_t boss_hp = 0x96;       // word_A7C6 - Boss HP (starts at 150)
static const uint16_t boss_max_hp = 0x96;  // Maximum HP

// Boss AI state
static uint8_t boss_state = 0;        // byte_A7DE - AI state (0-9)
static uint8_t boss_direction = 0;    // byte_A7E0 - 0=right, 0xFF=left
static uint8_t boss_anim_timer = 0;   // byte_A7E1 - Animation timer
static uint8_t boss_attack_timer = 0; // byte_A7E3 - Attack phase timer
static uint8_t boss_hit_counter = 0;  // byte_A7ED - Hit counter (0-40)

// Minion spawning
static uint8_t minion_counter = 0;    // byte_A7DC - Number of spawned minions
static uint8_t minion_index = 0;      // byte_A7E7 - Current minion slot
static uint8_t minion_pattern_idx = 0; // byte_A7E5 - Pattern index

// Boss flags
static uint8_t boss_damage_flag = 0;  // byte_A7DD - Set when boss is hit
static uint8_t boss_phase_flag = 0;   // byte_A7E0 - Phase/direction flag
static uint8_t boss_state_flag1 = 0;  // byte_A7E2 - State flag 1
static uint8_t boss_state_flag2 = 0;  // byte_A7E4 - State flag 2
static uint8_t boss_state_flag3 = 0;  // byte_A7E6 - Minion spawn phase

// Minion spawn patterns (from crab.asm)
static const uint8_t minion_pattern_1[] = {
    0x80, 0x80, 0x80, 0x80, 0x80, 0x81, 0x82, 0x03, 0x04, 0xFF
};

static const uint8_t minion_pattern_2[] = {
    0xF1, 0xF1, 0xF1, 0xF1, 0xF1, 0xF8, 0xF8, 0xF8, 0xF2, 0xF2,
    0xF2, 0xF2, 0xF2, 0xFF
};

// Boss movement boundaries
#define BOSS_X_MIN  0x10  // Left boundary
#define BOSS_X_MAX  0x31  // Right boundary (49)

// ============================================================================
// Helper Functions
// ============================================================================

static SaveData* get_save_data(void) {
    return (SaveData*)&g_memory[MEM_SAVE_DATA];
}

static uint8_t* get_proximity_map(void) {
    return &g_memory[MEM_PROXIMITY_MAP];
}

static MonsterEntry* get_monster_buffer(void) {
    return (MonsterEntry*)&g_memory[MEM_VIEWPORT_BUFFER];
}

/**
 * Get tile at proximity map offset
 */
static uint8_t get_tile_at_offset(uint16_t offset) {
    uint8_t* map = get_proximity_map();
    if (offset >= MEM_PROXIMITY_MAP && offset < MEM_PROXIMITY_MAP + 2304) {
        return map[offset - MEM_PROXIMITY_MAP];
    }
    return 0;
}

/**
 * Calculate horizontal distance to hero
 * Port of Fight.asm HorizDistToHero_35
 */
static int16_t horiz_dist_to_hero_35(uint16_t monster_x) {
    SaveData* save = get_save_data();
    uint16_t hero_x = save->hero_x_minus_18_abs;
    
    int16_t dist = (int16_t)monster_x - (int16_t)hero_x;
    
    if (dist < 0) {
        dist = 35 - monster_x;
        if (dist < 0) {
            return -1;  // Out of range
        }
    } else {
        dist = 35 - dist;
    }
    
    return dist;
}

/**
 * Get damage from stats (port of Get_Stats)
 */
static uint8_t get_damage_from_stats(uint8_t request_type) {
    SaveData* save = get_save_data();
    uint8_t ah;
    
    if (request_type == 0) {
        // Return hero_level/2 + 1
        ah = (save->hero_level >> 1) + 1;
        return ah;
    }
    
    if (request_type == 1) {
        // Calculate sword damage
        static const uint8_t sword_damages[] = {1, 2, 4, 8, 32, 127};
        uint8_t sword_type = save->sword_type;
        
        if (sword_type == 0 || sword_type > 6) {
            ah = 1;
        } else {
            ah = sword_damages[sword_type - 1];
            ah += (save->hero_level >> 1);
            if (ah < (save->hero_level >> 1)) {
                ah = 255;  // Overflow
            }
        }
        
        return ah;
    }
    
    return 0;
}

// ============================================================================
// Boss Movement Functions
// ============================================================================

/**
 * Move boss left
 * Port of crab.asm sub_A43E
 */
static int boss_move_left(void) {
    if (boss_x <= BOSS_X_MIN) {
        return -1;  // Hit left wall (carry set)
    }
    boss_x--;
    return 0;  // Still moving (carry clear)
}

/**
 * Move boss right
 * Port of crab.asm sub_A44D
 */
static int boss_move_right(void) {
    if (boss_x >= BOSS_X_MAX) {
        return -1;  // Hit right wall (carry set)
    }
    boss_x++;
    return 0;  // Still moving (carry clear)
}

// ============================================================================
// Minion Spawning
// ============================================================================

/**
 * Spawn a minion at specified position
 */
static void spawn_minion(uint8_t x, uint8_t y, uint8_t type) {
    MonsterEntry* monsters = get_monster_buffer();
    
    // Find empty slot in monster buffer
    for (int i = 0; i < 256; i++) {
        if (monsters[i].type == 0 || monsters[i].currX == (int16_t)0xFFFF) {
            // Found empty slot
            monsters[i].currX = x;
            monsters[i].currY = y;
            monsters[i].x_rel = x - 18;  // Relative to viewport
            monsters[i].flags = type & 0x0F;  // AI type
            monsters[i].field_5 = 0;
            monsters[i].field_6 = 0;
            monsters[i].state_flags = 0;
            monsters[i].field_8 = 2;  // HP
            monsters[i].field_9 = 0;
            monsters[i].field_A = 0;
            monsters[i].spwnX = x;
            monsters[i].spwnY = y;
            monsters[i].type = type;
            monsters[i].counter = 0;
            return;
        }
    }
}

/**
 * Spawn minions in grid pattern
 * Port of crab.asm sub_A671
 */
static void boss_spawn_minions(void) {
    const uint8_t* pattern;
    
    // Select spawn pattern based on boss state
    if (boss_state == 9) {
        pattern = minion_pattern_2;
    } else {
        pattern = minion_pattern_1;
    }
    
    // Spawn minions in 6x10 grid
    for (int col = 0; col < MINION_GRID_COLS; col++) {
        for (int row = 0; row < MINION_GRID_ROWS; row++) {
            uint8_t idx = (col * MINION_GRID_ROWS) + row;
            if (idx >= MINION_PATTERN_SIZE) {
                break;
            }
            
            uint8_t minion_type = pattern[idx];
            if (minion_type == 0xFF) {
                continue;  // Skip empty slots
            }
            
            // Calculate spawn position relative to boss
            uint8_t spawn_x = boss_x + (col - 3);  // Center around boss
            uint8_t spawn_y = boss_y + (row - 5);
            
            // Check if position is valid
            if (spawn_x < 1 || spawn_x > 34 || spawn_y < 1 || spawn_y > 62) {
                continue;
            }
            
            // Spawn minion
            spawn_minion(spawn_x, spawn_y, minion_type);
            minion_counter++;
        }
    }
}

// ============================================================================
// Boss Damage Handling
// ============================================================================

/**
 * Boss takes damage
 * Port of crab.asm sub_A796
 * 
 * @param damage Amount of damage to deal
 */
void boss_take_damage(uint16_t damage) {
    if (boss_hp == 0) {
        return;  // Already defeated
    }
    
    // Subtract damage from boss HP
    if (damage > boss_hp) {
        boss_hp = 0;
    } else {
        boss_hp -= damage;
    }
    
    // Boss defeated!
    if (boss_hp == 0) {
        SaveData* save = get_save_data();
        
        // Set defeat flag
        g_memory[0xFF2E] = 0xFF;
        
        // Set boss defeat flag in save data
        // For Cangrejo (boss 1), this is at offset 0x0000
        save->Cangrejo_Defeated = 0xFFFF;
        
        // Clear boss state
        boss_state = 0;
        boss_damage_flag = 0;
    }
}

// ============================================================================
// Boss AI State Machine
// ============================================================================

/**
 * Update boss AI
 * Port of crab.asm sub_A2F0
 */
static void update_boss_ai(void) {
    SaveData* save = get_save_data();
    
    // Check if boss is defeated
    if (boss_hp == 0) {
        return;
    }
    
    // Check distance to hero
    int16_t dist = horiz_dist_to_hero_35(boss_x);
    if (dist < 0) {
        // Hero too far, don't update
        return;
    }
    
    // Update boss position in monster table
    MonsterEntry* boss_monster = (MonsterEntry*)&g_memory[MEM_MDT_DATA + 0xC010];
    boss_monster->currX = boss_x;
    boss_monster->currY = boss_y;
    boss_monster->x_rel = boss_x - 18;
    
    // State machine
    switch (boss_state) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
            // Movement states - patrol left/right
            boss_anim_timer++;
            if (boss_anim_timer & 1) {
                // Move on alternate frames
                if (boss_direction == 0) {
                    if (boss_move_right() < 0) {
                        boss_direction = 0xFF;  // Reverse direction
                    }
                } else {
                    if (boss_move_left() < 0) {
                        boss_direction = 0;  // Reverse direction
                    }
                }
            }
            
            // Transition to attack state
            if (boss_anim_timer >= 6) {
                boss_state = BOSS_STATE_ATTACK;
                boss_attack_timer = 0;
            }
            break;
            
        case BOSS_STATE_ATTACK:
        case BOSS_STATE_ATTACK + 1:
        case BOSS_STATE_ATTACK + 2:
            // Attack pattern
            boss_attack_timer++;
            if (boss_attack_timer >= 8) {
                boss_state = BOSS_STATE_SPAWN;
                minion_index = 0;
            }
            break;
            
        case BOSS_STATE_SPAWN:
            // Spawn minions
            if (minion_index < MINION_PATTERN_SIZE) {
                uint8_t minion_type = minion_pattern_2[minion_index];
                if (minion_type != 0xFF) {
                    // Spawn minion near boss
                    spawn_minion(boss_x, boss_y - 1, minion_type);
                }
                minion_index++;
            } else {
                // Return to patrol
                boss_state = BOSS_STATE_PATROL;
                boss_attack_timer = 0;
            }
            break;
    }
    
    // Check if boss was hit
    if (boss_damage_flag & 0x40) {
        // Boss is invulnerable briefly after being hit
        boss_damage_flag &= ~0x40;
    }
}

// ============================================================================
// Boss Battle Initialization
// ============================================================================

/**
 * Initialize boss battle
 * Called when entering a boss cavern (byte_FF34 != 0)
 */
void init_boss_battle(void) {
    SaveData* save = get_save_data();
    MDTHeader* mdt_header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    
    // Reset boss state
    boss_x = 0x2B;  // Start at center-right
    boss_y = 0x0C;  // Start near top
    boss_hp = boss_max_hp;
    boss_state = BOSS_STATE_PATROL;
    boss_direction = 0;  // Start facing right
    boss_anim_timer = 0;
    boss_attack_timer = 0;
    boss_hit_counter = 0;
    boss_damage_flag = 0;
    boss_phase_flag = 0;
    boss_state_flag1 = 0;
    boss_state_flag2 = 0;
    boss_state_flag3 = 0;
    minion_counter = 0;
    minion_index = 0;
    minion_pattern_idx = 0;
    
    // Initialize boss monster entry in MDT
    MonsterEntry* boss_monster = (MonsterEntry*)&g_memory[MEM_MDT_DATA + mdt_header->monsters_offset];
    boss_monster->currX = boss_x;
    boss_monster->currY = boss_y;
    boss_monster->x_rel = boss_x - 18;
    boss_monster->flags = 0x10;  // Big monster flag
    boss_monster->field_5 = 0;
    boss_monster->field_6 = 0;
    boss_monster->state_flags = 0;
    boss_monster->field_8 = boss_hp & 0xFF;  // HP
    boss_monster->field_9 = 0;
    boss_monster->field_A = 0;
    boss_monster->spwnX = boss_x;
    boss_monster->spwnY = boss_y;
    boss_monster->type = 0xFF;  // Boss type
    boss_monster->counter = 0;
    
    // Set boss mode flags
    g_memory[0xFF34] = 0xFF;  // byte_FF34 = 0xFF (boss mode)
    g_memory[0x9F27] = 0xFF;  // byte_9F27 = 0xFF (MDT unpacked)
    
    // Position hero at edge of screen (not centered)
    save->hero_x_minus_18_abs = 41;
    save->hero_x_in_viewport = 5;
}

/**
 * Update boss battle
 * Called every frame when byte_FF34 != 0
 */
void update_boss_battle(void) {
    SaveData* save = get_save_data();
    
    // Check if boss mode is active
    if (g_memory[0xFF34] == 0) {
        return;  // Not in boss battle
    }
    
    // Update boss AI
    update_boss_ai();

    // Update boss monster in proximity map
    uint16_t offset = coords_to_proximity_offset(boss_x, boss_y);
    uint8_t* map = get_proximity_map();

    // Mark boss position in map (bit 7 set = monster)
    if (offset < 2304) {
        map[offset] = 0x80 | minion_counter;
    }
    
    // Check for boss defeat
    if (boss_hp == 0) {
        // Boss defeated - handle transition
        g_memory[0xFF34] = 0;  // Clear boss mode
    }
}

/**
 * Get current boss HP
 */
uint16_t get_boss_hp(void) {
    return boss_hp;
}

/**
 * Get boss max HP
 */
uint16_t get_boss_max_hp(void) {
    return boss_max_hp;
}

/**
 * Check if boss is defeated
 */
int is_boss_defeated(void) {
    return (boss_hp == 0) ? 1 : 0;
}
