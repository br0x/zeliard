// combat.c - Hero-monster combat system
// Port of Fight.asm combat functions (0x97B5-0x98B7)

#include "zeliard.h"

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// Physics functions
extern uint8_t get_jump_phase_flags(void);
extern uint8_t get_on_rope_flags(void);

// ============================================================================
// Constants
// ============================================================================

#define MEM_SAVE_DATA        0x0000

// Sword damages by type (from Fight.asm 0x98B8)
static const uint8_t sword_damages[] = {1, 2, 4, 8, 32, 127};

// Magic item damages (from Fight.asm 0x98BE)
static const uint8_t magic_damages[] = {2, 4, 8, 16, 32, 64, 255};

// ============================================================================
// Global State
// ============================================================================

// Global flags (from 0xFF00 region)
static uint8_t byte_FF45 = 0;  // Combat state flag
static uint8_t soundFX_request = 0;  // Monster death timer
static uint8_t byte_E8 = 0;    // Almas drop flag (always drop if set)

// Accumulator for damage calculation (from Fight.asm Accumulate_folded_ff1b)
static uint16_t damage_accumulator = 0;

// Almas drop counter (per monster)
static uint8_t almas_drop_counters[256];

// ============================================================================
// Helper Functions
// ============================================================================

static SaveData* get_save_data(void) {
    return (SaveData*)&g_memory[MEM_SAVE_DATA];
}

/**
 * Get monster at position
 * Returns pointer to monster entry or 0 if none
 */
static MonsterEntry* get_monster_at(uint8_t x, uint8_t y) {
    MDTHeader* mdt_header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    uint16_t monster_addr = MEM_MDT_DATA + mdt_header->monsters_offset;
    
    while (1) {
        MonsterEntry* monster = (MonsterEntry*)&g_memory[monster_addr];
        
        // Check for end marker
        if (monster->currX == (int16_t)0xFFFF) {
            return 0;
        }
        
        // Check if monster is at position
        if (monster->currX == x && monster->currY == y) {
            return monster;
        }
        
        monster_addr += 16;  // Next monster (16 bytes each)
    }
}

/**
 * Accumulate damage using folded sum algorithm
 * Port of Fight.asm Accumulate_folded_ff1b_proc
 * 
 * ACC = Σ (S_i + (S_i >> 8)) for i = 0 to N-1
 */
static void accumulate_damage(uint8_t value) {
    damage_accumulator += value + (value >> 8);
}

/**
 * Reset damage accumulator
 */
static void reset_damage_accumulator(void) {
    damage_accumulator = 0;
}

/**
 * Get accumulated damage value
 */
static uint8_t get_accumulated_damage(void) {
    return damage_accumulator & 0xFF;
}

// ============================================================================
// Combat Functions
// ============================================================================

/**
 * Get hero stats for combat
 * Port of Fight.asm 0x9851 Get_Stats
 * 
 * @param al  Request type:
 *   - 0: Return hero_level/2 + 1
 *   - 1: Return sword damage + level bonus
 *   - 2-8: Return magic damage from table
 *   - 9: No-op
 * @return ah  Stat value
 */
uint8_t Get_Stats(uint8_t request_type) {
    SaveData* save = get_save_data();
    uint8_t ah;
    
    if (request_type == 0) {
        // Return hero_level/2 + 1
        ah = (save->hero_level >> 1) + 1;
        return ah;
    }
    
    if (request_type == 1) {
        // Calculate sword damage
        uint8_t sword_type = save->sword_type;
        
        if (sword_type == 0 || sword_type > 6) {
            ah = 1;  // Default damage
        } else {
            // Base damage from sword type
            ah = sword_damages[sword_type - 1];
            
            // Add level bonus (level/2)
            uint8_t level_bonus = save->hero_level >> 1;
            ah += level_bonus;
            
            // Cap at 255
            if (ah < level_bonus) {
                ah = 255;
            }
        }
        
        // Double damage if byte_FF45 == 2
        if (byte_FF45 == 2) {
            ah += ah;
            if (ah == 0) {  // Overflow check
                ah = 255;
            }
        }
        
        return ah;
    }
    
    if (request_type >= 2 && request_type <= 8) {
        // Return magic damage from table
        uint8_t index = request_type - 2;
        if (index < 7) {
            ah = magic_damages[index];
        } else {
            ah = 255;
        }
        return ah;
    }
    
    // request_type == 9: No-op
    return 0;
}

/**
 * Add XP to hero with overflow handling
 * Port of Fight.asm 0x9715 sub_9715
 * 
 * @param xp Amount of XP to add
 */
static void add_xp(uint16_t xp) {
    SaveData* save = get_save_data();
    
    save->hero_xp += xp;
    
    // Check for overflow (wrap to 0xFFFF)
    if (save->hero_xp < xp) {
        save->hero_xp = 0xFFFF;
    }
}

/**
 * Add gold to hero
 * Port of Fight.asm 0x916B
 * 
 * @param gold Amount of gold to add
 */
static void add_gold(uint16_t gold) {
    SaveData* save = get_save_data();
    
    save->hero_gold_lo += gold;
    
    // Handle carry to high byte
    if (save->hero_gold_lo < gold) {
        save->hero_gold_hi++;
    }
}

/**
 * Check if hero is near monster (for almas drop probability)
 * Port of Fight.asm sub_9190
 * 
 * Checks if hero is within 4 tiles of monster vertically and horizontally
 * If so, increments almas counter and checks if counter % 7 == 0
 * 
 * @param monster Pointer to monster entry
 * @param monster_index Monster index (0-255)
 * @return 1 if almas should drop, 0 otherwise
 */
static int check_almas_drop(MonsterEntry* monster, uint8_t monster_index) {
    SaveData* save = get_save_data();
    
    // If byte_E8 is set, always drop almas
    if (byte_E8 != 0) {
        return 1;
    }
    
    // Check vertical proximity (within 4 tiles)
    uint8_t monster_y = monster->currY;
    uint8_t hero_y = save->hero_y_rel;
    
    int vertical_match = 0;
    for (uint8_t i = 0; i < 4; i++) {
        uint8_t check_y = (monster_y + i) & 0x3F;
        if (check_y == hero_y) {
            vertical_match = 1;
            break;
        }
    }
    
    if (!vertical_match) {
        // Clear monster's "almas available" flag
        monster->field_5 &= 0x7F;
        return 0;
    }
    
    // Check horizontal proximity (within 4 tiles)
    uint8_t monster_x = monster->currX & 0xFF;
    uint8_t hero_x = save->hero_x_in_viewport + 4;
    
    int horizontal_match = 0;
    for (uint8_t i = 0; i < 4; i++) {
        uint8_t check_x = monster_x + i;
        if (check_x == hero_x) {
            horizontal_match = 1;
            break;
        }
    }
    
    if (!horizontal_match) {
        // Clear monster's "almas available" flag
        monster->field_5 &= 0x7F;
        return 0;
    }
    
    // Hero is near - check if monster has almas available (bit 7 of field_5)
    if (!(monster->field_5 & 0x80)) {
        return 0;  // No almas available
    }
    
    // Increment almas drop counter for this monster
    almas_drop_counters[monster_index]++;
    
    // Check if counter % 7 == 0
    if (almas_drop_counters[monster_index] % 7 != 0) {
        return 0;
    }
    
    // Almas should drop!
    return 1;
}

/**
 * Award almas to hero based on monster type
 * Port of Fight.asm 0x8FC3-0x8FE5
 * 
 * Almas amount based on monster.flags & 0x0F:
 * - 4 => 1 almas
 * - 5 => 10 almas
 * - else => 100 almas
 * 
 * @param monster Pointer to monster entry
 * @param monster_index Monster index (0-255)
 */
static void award_almas(MonsterEntry* monster, uint8_t monster_index) {
    // Check if almas should drop
    if (!check_almas_drop(monster, monster_index)) {
        return;
    }
    
    // Set almas pickup timer
    soundFX_request = 0x10;
    
    // Get almas amount based on monster.flags & 0x0F
    uint8_t flags_low = monster->flags & 0x0F;
    uint16_t almas_amount;
    
    if (flags_low == 4) {
        almas_amount = 1;
    } else if (flags_low == 5) {
        almas_amount = 10;
    } else {
        almas_amount = 100;
    }
    
    // Award almas to hero
    SaveData* save = get_save_data();
    save->hero_almas += almas_amount;
    
    // Handle overflow
    if (save->hero_almas < almas_amount) {
        save->hero_almas = 0xFFFF;
    }
}

/**
 * Process monster death
 * Port of Fight.asm 0x96C1 sub_96C1
 *
 * Called when monster HP reaches 0
 * Awards XP to hero (NOT gold - gold is only from items!)
 * May award almas based on proximity and probability
 *
 * @param monster Pointer to monster entry
 * @param monster_index Monster index (0-255)
 */
static void process_monster_death(MonsterEntry* monster, uint8_t monster_index) {
    if (!monster) {
        return;
    }

    // Check if this is a big monster (state_flags & 0x10)
    if (!(monster->state_flags & 0x10)) {
        // Normal monster - award XP based on AI type
        uint8_t ai_type = monster->flags & 0x0F;

        // XP values by AI type (from Fight.asm table at 0xA008)
        // The xlat instruction uses this table
        static const uint16_t xp_values[] = {10, 20, 30, 50, 100, 200, 500, 1000};

        if (ai_type < 8) {
            add_xp(xp_values[ai_type]);
        }
    } else {
        // Big monster - special handling
        // Award more XP
        uint8_t ai_type = monster->flags & 0x0F;
        static const uint16_t xp_values[] = {20, 40, 60, 100, 200, 400, 1000, 2000};

        if (ai_type < 8) {
            add_xp(xp_values[ai_type]);
        }
    }

    // Note: Original Fight.asm does NOT award gold for monster deaths!
    // Gold is only awarded from item pickups (see got_50_gold, got_100_gold, etc.)
    
    // Award almas based on proximity and probability
    award_almas(monster, monster_index);

    // Mark monster as dead
    // Set field_6 to 0 (animation frame)
    monster->field_6 = 0;
    
    // Set flags to indicate death state
    monster->flags |= 0x68;
    monster->field_5 &= 0x80;
    
    // Check vertical distance to hero
    SaveData* save = get_save_data();
    uint8_t dy = monster->currY - (save->hero_y_rel - 1);
    dy &= 0x3F;  // Clamp to 0-63
    
    if (dy < 25) {
        soundFX_request = 7;  // Reset timer if hero is close
    } else {
        soundFX_request = 0;
    }
}

/**
 * Hero hits monster - deal damage
 * Port of Fight.asm 0x97B5 Hero_Hits_monster
 * 
 * @param monster Pointer to monster entry
 * @param monster_index Monster index (0-255)
 */
void Hero_Hits_monster(MonsterEntry* monster, uint8_t monster_index) {
    if (!monster) {
        return;
    }

    SaveData* save = get_save_data();

    // Get monster's current field_5 value (animation/state)
    uint8_t field_5 = monster->field_5 & 0x1F;

    // Get damage based on field_5
    uint8_t damage = Get_Stats(field_5);

    // Subtract damage from monster HP
    uint8_t monster_hp = monster->field_8;

    if (monster_hp <= damage) {
        // Monster dies
        process_monster_death(monster, monster_index);
        return;
    }

    // Reduce monster HP
    monster->field_8 = monster_hp - damage;

    // Set hit timer
    soundFX_request = 6;

    // Check if this is a big/splitting monster
    if (monster->flags & 1) {
        // Normal big monster
    } else if (monster->state_flags & 0x10) {
        // Splitting monster - check sub-monster
        if (monster->state_flags & 0x0F) {
            process_monster_death(monster, monster_index);
            return;
        }
    }
    
    // Update monster state flags based on accumulated damage
    reset_damage_accumulator();
    accumulate_damage(damage);
    
    uint8_t accumulated = get_accumulated_damage();
    uint8_t state_index = accumulated & 3;
    
    if (byte_FF45 == 2) {
        state_index = 0;
    }
    
    // Get new state from table (based on monster flags)
    // This would use a state transition table
    // For now, just set the state bits
    monster->state_flags = (monster->state_flags & 0xF0) | (accumulated & 0x0F);
}

/**
 * Check if hero is attacking
 * Called every frame to check for sword swing
 */
static void check_hero_attack(void) {
    SaveData* save = get_save_data();
    
    // Check if space was pressed (sword attack)
    // This would be called from input handling
    // For now, stub
}

/**
 * Calculate horizontal distance to hero
 * Port of Fight.asm 0x96A1 HorizDistToHero_35
 * 
 * @param monster_x Monster's X position
 * @return 35 - distance if in range, or sets carry if out of range
 */
static int16_t HorizDistToHero_35(uint16_t monster_x) {
    SaveData* save = get_save_data();
    uint16_t hero_x = save->hero_x_minus_18_abs;
    
    int16_t dist = (int16_t)monster_x - (int16_t)hero_x;
    
    // Handle wraparound
    if (dist < 0) {
        dist = 35 - monster_x;
        if (dist < 0) {
            return -1;  // Out of range (carry set)
        }
    } else {
        dist = 35 - dist;
    }
    
    return dist;
}

/**
 * Check vertical distance between hero and monster
 * Part of Fight.asm sub_96C1
 * 
 * @param monster Pointer to monster entry
 * @return 1 if monster is close to hero vertically, 0 otherwise
 */
static int Check_Vertical_Distance_Between_Hero_And_Monster(MonsterEntry* monster) {
    SaveData* save = get_save_data();
    
    // Calculate vertical distance
    uint8_t monster_y = monster->currY;
    uint8_t hero_y = save->hero_y_rel - 1;
    
    uint8_t dy = monster_y - hero_y;
    dy &= 0x3F;  // Clamp to 0-63
    
    // Check if within 25 tiles
    if (dy < 25) {
        soundFX_request = 7;
        return 1;  // Close
    }
    
    return 0;  // Far
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize combat system
 */
void combat_init(void) {
    byte_FF45 = 0;
    soundFX_request = 0;
    byte_E8 = 0;
    damage_accumulator = 0;

    // Initialize almas drop counters for all monsters
    for (int i = 0; i < 256; i++) {
        almas_drop_counters[i] = 0;
    }
}

/**
 * Update combat state
 * Called every frame
 */
void combat_update(void) {
    // Update death timer
    if (soundFX_request > 0) {
        soundFX_request--;
    }
    
    // Check for hero attack input
    check_hero_attack();
}

/**
 * Get combat state flags
 * @return soundFX_request (death timer)
 */
uint8_t get_combat_timer(void) {
    return soundFX_request;
}

/**
 * Set combat state flag
 * @param value New value for byte_FF45
 */
void set_combat_flag(uint8_t value) {
    byte_FF45 = value;
}
