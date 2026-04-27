// monster_ai.c - Monster AI system
// Complete port of eai1.asm (Monster AI module)

#include "zeliard.h"

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// ============================================================================
// Global Variables (from 0xFF00 region)
// ============================================================================

// Hero absolute Y position (needed for monster AI)
#define hero_y_absolute     g_memory[0xFF35]
#define byte_FF36           g_memory[0xFF36]    // Timer/completion flag

// ============================================================================
// Monster Animation Frame Tables (from eai1.asm A0B0-A23F)
// These tables define sprite frame sequences for each monster type
// ============================================================================

// Frame sequences for each monster type
// Each table contains sprite frame indices for animation
// Note: These are defined for future rendering implementation

// Monster type 0 frames (byte_A0B0)
static const uint8_t monster_frames_0[] __attribute__((unused)) = {
    0x00, 0x19, 0x1A, 0x1B, 0x1C,  // Frame sequence 1
    0x00, 0x1D, 0x1E, 0x1F, 0x20,  // Frame sequence 2
    0x00, 0x21, 0x22, 0x23, 0x24,  // Frame sequence 3
    0x00, 0x25, 0x26, 0x27, 0x28,  // Frame sequence 4
    0x00, 0x29, 0x2A, 0x2B, 0x2C,  // Frame sequence 5
    0x00, 0x2D, 0x2E, 0x2F, 0x30,  // Frame sequence 6
    0x00, 0x31, 0x32, 0x33, 0x34,  // Frame sequence 7
};

// Monster type 1 frames (byte_A0D3)
static const uint8_t monster_frames_1[] __attribute__((unused)) = {
    0x00, 0x19, 0x1A, 0x1B, 0x1C,
    0x00, 0x35, 0x36, 0x37, 0x38,
    0x00, 0x39, 0x3A, 0x3B, 0x3C,
    0x00, 0x3D, 0x3E, 0x3F, 0x40,
    0x00, 0x41, 0x42, 0x43, 0x44,
    0x00, 0x45, 0x46, 0x47, 0x48,
    0x00, 0x49, 0x4A, 0x4B, 0x4C,
};

// Monster type 2 frames (byte_A0F6)
static const uint8_t monster_frames_2[] __attribute__((unused)) = {
    0x00, 0x4D, 0x00, 0x4F, 0x50,
    0x00, 0x51, 0x00, 0x52, 0x53,
    0x00, 0x54, 0x55, 0x4F, 0x50,
    0x00, 0x56, 0x57, 0x58, 0x59,
};

// Monster type 3 frames (byte_A10A)
static const uint8_t monster_frames_3[] __attribute__((unused)) = {
    0x00, 0x00, 0x5B, 0x5C, 0x5D,
    0x00, 0x00, 0x5E, 0x5F, 0x60,
    0x00, 0x61, 0x62, 0x5C, 0x5D,
    0x00, 0x63, 0x64, 0x65, 0x66,
};

// Monster type 4 frames (byte_A11E)
static const uint8_t monster_frames_4[] __attribute__((unused)) = {
    0x00, 0x75, 0x76, 0x77, 0x78,
    0x00, 0x75, 0x76, 0x79, 0x78,
    0x00, 0x7A, 0x7B, 0x7C, 0x7D,
    0x00, 0x7E, 0x7B, 0x7F, 0x80,
    0x00, 0x81, 0x82, 0x83, 0x84,
    0x00, 0x85, 0x86, 0x87, 0x88,
    0x00, 0x89, 0x8A, 0x8B, 0x8C,
};

// Monster type 5 frames (byte_A141)
static const uint8_t monster_frames_5[] __attribute__((unused)) = {
    0x00, 0x8D, 0x8E, 0x8F, 0x90,
    0x00, 0x8D, 0x8E, 0x8F, 0x91,
    0x00, 0x92, 0x93, 0x94, 0x95,
    0x00, 0x92, 0x96, 0x97, 0x98,
    0x00, 0x99, 0x9A, 0x9B, 0x9C,
    0x00, 0x9D, 0x9E, 0x9F, 0xA0,
    0x00, 0xA1, 0xA2, 0xA3, 0xA4,
};

// Monster type 6 frames (byte_A164)
static const uint8_t monster_frames_6[] __attribute__((unused)) = {
    0x00, 0x67, 0x68, 0x69, 0x6A,
    0x00, 0x6B, 0x6C, 0x6D, 0x6E,
    0x00, 0x6F, 0x70, 0x71, 0x72,
    0x00, 0x73, 0x74, 0xE0, 0xE1,
    0x00, 0xF2, 0xF3, 0xF4, 0xF5,
    0x00, 0xF6, 0xF7, 0xF4, 0xF5,
};

// Monster type 7 frames (byte_A182)
static const uint8_t monster_frames_7[] __attribute__((unused)) = {
    0x00, 0xE2, 0xE3, 0xE4, 0xE5,
    0x00, 0xE6, 0xE7, 0xE8, 0xE9,
    0x00, 0xEA, 0xEB, 0xEC, 0xED,
    0x00, 0xEE, 0xEF, 0xF0, 0xF1,
    0x00, 0xF2, 0xF3, 0xF4, 0xF5,
    0x00, 0xF6, 0xF7, 0xF4, 0xF5,
};

// Direction change tables (byte_A1A0 - byte_A1CD)
static const uint8_t dir_table_0[] __attribute__((unused)) = { 0x00, 0xA5, 0xA6, 0xA7, 0xA8 };
static const uint8_t dir_table_1[] __attribute__((unused)) = { 0x00, 0xA9, 0xAA, 0xAB, 0xAC };
static const uint8_t dir_table_2[] __attribute__((unused)) = { 0x00, 0xAD, 0xAE, 0xAF, 0xB0 };
static const uint8_t dir_table_3[] __attribute__((unused)) = { 0x00, 0xB1, 0xB2, 0xB3, 0xB4 };
static const uint8_t dir_table_4[] __attribute__((unused)) = { 0x00, 0xB5, 0xB6, 0xB7, 0xB8 };
static const uint8_t dir_table_5[] __attribute__((unused)) = { 0x00, 0xB9, 0xBA, 0xBB, 0xBC };
static const uint8_t dir_table_6[] __attribute__((unused)) = { 0x00, 0x00, 0x00, 0xC7, 0xC8 };
static const uint8_t dir_table_7[] __attribute__((unused)) = { 0x00, 0xF8, 0xF9, 0xFA, 0xFB };

// Special tables (byte_A1DC - byte_A227)
static const uint8_t special_table_0[] __attribute__((unused)) = { 1, 1, 2, 3, 4, 1, 5, 6, 7, 8, 1, 9, 0x0A, 0x0B, 0x0C };
static const uint8_t special_table_1[] __attribute__((unused)) = { 0x00, 0x0D, 0x0E, 0x0F, 0x10, 0x00, 0x11, 0x12, 0x13, 0x14, 0x00, 0x15, 0x16, 0x17, 0x18, 0x00, 0x11, 0x12, 0x13, 0x14 };
static const uint8_t special_table_2[] __attribute__((unused)) = { 2, 0x0D, 0x0E, 0x0F, 0x10, 2, 0x11, 0x12, 0x13, 0x14, 2, 0x15, 0x16, 0x17, 0x18, 2, 0x11, 0x12, 0x13, 0x14 };
static const uint8_t special_table_3[] __attribute__((unused)) = { 0x00, 0xC9, 0xCA, 0xCB, 0xCC, 0x00, 0xC9, 0xCA, 0xCB, 0xCC };
static const uint8_t special_table_4[] __attribute__((unused)) = { 1, 0xCD, 0xCE, 0xCF, 0xD0 };
static const uint8_t special_table_5[] __attribute__((unused)) = { 0x00, 0xD1, 0xD2, 0xD3, 0xD4 };
static const uint8_t special_table_6[] __attribute__((unused)) = { 2, 0xD1, 0xD2, 0xD3, 0xD4 };
static const uint8_t special_table_7[] __attribute__((unused)) = { 1, 0xD5, 0xD5, 0xD5, 0xD5, 1, 0xD6, 0xD7, 0xD8, 0xD9, 1, 0xDA, 0xDB, 0xDC, 0xDD, 1, 0x00, 0x00, 0xDE, 0xDF };

// Frame table pointers (organized by monster type and direction)
// Note: These tables are defined for completeness but not yet used in the C port
#if 0
static const uint8_t* const g_frame_tables[8][8] = {
    // Type 0
    { monster_frames_0, monster_frames_0, monster_frames_0, monster_frames_0, 
      monster_frames_0, monster_frames_0, monster_frames_0, monster_frames_0 },
    // Type 1
    { monster_frames_1, monster_frames_1, monster_frames_1, monster_frames_1,
      monster_frames_1, monster_frames_1, monster_frames_1, monster_frames_1 },
    // Type 2
    { monster_frames_2, monster_frames_2, monster_frames_3, monster_frames_3,
      monster_frames_2, monster_frames_2, monster_frames_3, monster_frames_3 },
    // Type 3
    { monster_frames_4, monster_frames_4, monster_frames_5, monster_frames_5,
      monster_frames_6, monster_frames_6, monster_frames_7, monster_frames_7 },
    // Type 4
    { dir_table_0, dir_table_1, dir_table_2, dir_table_3,
      dir_table_4, dir_table_5, dir_table_6, dir_table_7 },
    // Type 5
    { dir_table_0, dir_table_1, dir_table_2, dir_table_3,
      dir_table_4, dir_table_5, dir_table_6, dir_table_7 },
    // Type 6
    { special_table_0, special_table_0, special_table_1, special_table_2,
      special_table_3, special_table_4, special_table_5, special_table_6 },
    // Type 7
    { special_table_7, special_table_7, special_table_3, special_table_4,
      special_table_5, special_table_6, special_table_3, special_table_4 },
};
#endif

// Direction tables for movement (byte_A71F, byte_A723, byte_A727, byte_A72F)
static const uint8_t move_dir_table_right[] = { 1, 0, 0, 7 };      // byte_A71F
static const uint8_t move_dir_table_left[]  = { 3, 4, 4, 5 };      // byte_A723
static const uint8_t move_dir_table_cw[]    = { 2, 1, 1, 0, 0, 7, 7, 6 };  // byte_A727
static const uint8_t move_dir_table_ccw[]   = { 2, 3, 3, 4, 4, 5, 5, 6 };  // byte_A72F

// ============================================================================
// Forward declarations - Monster movement
// ============================================================================

static void monster_move_in_direction(MonsterEntry* m, uint8_t direction);
static int check_collision_in_direction(MonsterEntry* m, uint8_t direction);

// ============================================================================
// Helper: Check if monster exists two rows below
// Port of Check_Monster_Ids_Two_Rows_Below_Monster (0x6030)
// ============================================================================

/**
 * Check if there are monsters two rows below this monster
 * @param m Monster entry
 * @return 1 if clear (no monsters), 0 if blocked
 */
static int check_monster_ids_two_rows_below_monster(MonsterEntry* m) {
    uint8_t* monster_buf = &g_memory[MEM_VIEWPORT_BUFFER];
    uint8_t check_y = m->currY + 2;
    
    // Check all monsters in buffer
    for (int i = 0; i < 28*19; i++) {
        if (monster_buf[i] == 0) continue;  // Empty slot
        
        // Get monster entry from MDT
        MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
        if (header->monsters_offset >= MEM_MDT_DATA && header->monsters_offset < 0xE000) {
            MonsterEntry* other = (MonsterEntry*)&g_memory[header->monsters_offset + (i * sizeof(MonsterEntry))];
            
            // Check if this monster is two rows below and same X position
            if (other->currY == check_y && other->currX == m->currX) {
                return 0;  // Blocked by another monster
            }
        }
    }
    
    return 1;  // Clear to move
}

// ============================================================================
// Helper: Check vertical distance between hero and monster
// Port of Check_Vertical_Distance_Between_Hero_And_Monster (0x6032)
// ============================================================================

/**
 * Check vertical distance between hero and monster
 * Sets up chase behavior if hero is within range
 * @param m Monster entry
 */
static void check_vertical_distance_between_hero_and_monster(MonsterEntry* m) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    // Calculate vertical distance
    int16_t dist_y = (int16_t)save->hero_y_rel - (int16_t)m->currY;
    
    // If hero is below monster, monster may chase
    if (dist_y > 0 && dist_y < 16) {
        // Monster will chase hero vertically
        m->field_9 |= 0x40;
    }
}

// ============================================================================
// Helper: Hero hits monster
// Port of Hero_Hits_monster (0x6034)
// ============================================================================

/**
 * Handle monster being hit by hero
 * @param m Monster entry
 */
static void hero_hits_monster(MonsterEntry* m) {
    // Clear hit flag
    m->field_5 &= ~0x20;
    
    // Reduce monster HP
    if (m->field_8 > 0) {
        m->field_8--;
    }
    
    // Check if monster defeated
    if (m->field_8 == 0) {
        // Monster defeated - remove from buffer
        // (Implementation depends on how monsters are tracked)
    }
}

// ============================================================================
// Helper: Calculate horizontal distance to hero
// Port of HorizDistToHero_35 (0x6036)
// ============================================================================

/**
 * Calculate horizontal distance to hero, accounting for world wrapping
 * @param monster_x Monster X coordinate
 * @return Positive value (35 - distance) if in range, sets carry flag if out of range
 */
__attribute__((unused))
static int horiz_dist_to_hero_35(uint8_t monster_x) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];

    // Hero X relative to viewport
    uint8_t hero_x = save->hero_x_in_viewport;

    // Calculate distance
    int16_t dist = (int16_t)hero_x - (int16_t)monster_x;
    if (dist < 0) dist = -dist;

    // Check if within 35 tile range
    if (dist > 35) {
        return -1;  // Out of range (carry flag set)
    }

    return 35 - dist;  // Return positive value
}

// ============================================================================
// Helper: Subroutine A3D4 - Timer increment
// ============================================================================

/**
 * Increment monster timer with wraparound
 * @param m Monster entry
 * @return 1 if timer reached 7, 0 otherwise
 */
static int sub_A3D4(MonsterEntry* m) {
    m->field_6++;
    m->field_6 &= 0x07;
    
    if (m->field_6 >= 7) {
        m->field_6 = 3;
        return 1;
    }
    return 0;
}

// ============================================================================
// Helper: Subroutine A4E8 - Check hero proximity
// ============================================================================

/**
 * Check if hero is within proximity for chase behavior
 * @param m Monster entry
 * @return 0xFF if far, direction flag if close
 */
static int sub_A4E8(MonsterEntry* m) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    // Calculate vertical distance
    uint8_t dist_y = save->hero_y_rel;
    if (dist_y >= m->currY) {
        dist_y = dist_y - m->currY;
    } else {
        dist_y = m->currY - dist_y;
    }
    
    // Check if within 8 tiles vertically
    if (dist_y < 8) {
        return 0xFF;  // Too close
    }
    
    // Check horizontal position
    if (m->x_rel >= 0x11) {
        // Hero is to the right
        if (m->field_5 & 0x80) {
            return 0x80;  // Face right
        }
        return 0;  // Face left
    } else {
        // Hero is to the left
        if (m->field_5 & 0x80) {
            return 0;  // Face left
        }
        return 0x80;  // Face right
    }
}

// ============================================================================
// Helper: Subroutine A6F0 - Check hero proximity (variant)
// ============================================================================

/**
 * Check if hero is within proximity for chase behavior (6 tile variant)
 * @param m Monster entry
 * @return 0xFF if far, direction flag if close
 */
static int sub_A6F0(MonsterEntry* m) {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    
    // Calculate vertical distance
    uint8_t dist_y = save->hero_y_rel;
    if (dist_y >= m->currY) {
        dist_y = dist_y - m->currY;
    } else {
        dist_y = m->currY - dist_y;
    }
    
    // Check if within 6 tiles vertically
    if (dist_y < 6) {
        return 0xFF;  // Too close
    }
    
    // Check horizontal position
    if (m->x_rel >= 0x17) {
        // Hero is to the right
        if (m->field_5 & 0x80) {
            return 0x80;  // Face right
        }
        return 0;  // Face left
    } else {
        // Hero is to the left
        if (m->field_5 & 0x80) {
            return 0;  // Face left
        }
        return 0x80;  // Face right
    }
}

// ============================================================================
// Monster Movement Functions
// ============================================================================

/**
 * Move monster in specified direction
 * @param m Monster entry
 * @param direction Direction (0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE)
 */
static void monster_move_in_direction(MonsterEntry* m, uint8_t direction) {
    int8_t dx = 0, dy = 0;
    
    switch (direction) {
        case 0: dx = 1;  dy = 0;  break;  // E
        case 1: dx = 1;  dy = -1; break;  // NE
        case 2: dx = 0;  dy = -1; break;  // N
        case 3: dx = -1; dy = -1; break;  // NW
        case 4: dx = -1; dy = 0;  break;  // W
        case 5: dx = -1; dy = 1;  break;  // SW
        case 6: dx = 0;  dy = 1;  break;  // S
        case 7: dx = 1;  dy = 1;  break;  // SE
    }
    
    // Update monster position
    m->currX += dx;
    m->currY += dy;
    m->x_rel += dx;
    
    // Update direction flag
    if (dx > 0) {
        m->field_5 |= 0x80;  // Facing right
    } else if (dx < 0) {
        m->field_5 &= ~0x80;  // Facing left
    }
}

/**
 * Check collision in specified direction
 * @param m Monster entry
 * @param direction Direction to check
 * @return 1 if clear, 0 if blocked
 */
static int check_collision_in_direction(MonsterEntry* m, uint8_t direction) {
    // Stub - to be implemented with proper collision detection
    // For now, assume all directions are clear
    (void)m;
    (void)direction;
    return 1;
}

// ============================================================================
// Individual direction movement functions (stubs for function pointer table)
// ============================================================================

static void move_monster_E(MonsterEntry* m) {
    monster_move_in_direction(m, 0);
}

static void move_monster_NE(MonsterEntry* m) {
    monster_move_in_direction(m, 1);
}

static void move_monster_N(MonsterEntry* m) {
    monster_move_in_direction(m, 2);
}

static void move_monster_NW(MonsterEntry* m) {
    monster_move_in_direction(m, 3);
}

static void move_monster_W(MonsterEntry* m) {
    monster_move_in_direction(m, 4);
}

// SW and SE movement - used by AI type 0
__attribute__((unused))
static void move_monster_SW(MonsterEntry* m) {
    monster_move_in_direction(m, 5);
}

static void move_monster_S(MonsterEntry* m) {
    monster_move_in_direction(m, 6);
}

__attribute__((unused))
static void move_monster_SE(MonsterEntry* m) {
    monster_move_in_direction(m, 7);
}

// ============================================================================
// AI Type 0: Guard
// Stationary guard that checks vertical distance
// ============================================================================

/**
 * AI Type 0: Guard behavior
 * Stationary monster that checks vertical distance to hero
 * @param m Monster entry
 */
static void ai_type_0_guard(MonsterEntry* m) {
    // Check for monsters two rows below
    if (!check_monster_ids_two_rows_below_monster(m)) {
        check_vertical_distance_between_hero_and_monster(m);
        return;
    }
    
    // Check if already hit by hero
    if (m->field_5 & 0x20) {
        hero_hits_monster(m);
        return;
    }
    
    // State machine based on field_9 >> 6
    switch ((m->field_9 >> 6) & 0x03) {
        case 0:  // Move N, then check X distance
            move_monster_N(m);
            if (m->field_6 & 0xFF) {
                m->field_6 -= 0x10;
                return;
            }
            // Check if hero is within 7 tiles horizontally
            if (m->x_rel >= 0x17 && m->x_rel <= 0x27) {
                m->field_9 = 0x40;
            }
            m->field_6 = 0;
            break;
            
        case 1:  // Wait state
            m->field_6++;
            m->field_6 &= 0x07;
            if (m->field_6 != 3) return;
            m->field_9 = 0x80;
            break;
            
        case 2:  // Chase hero vertically
            if (sub_A3D4(m)) {
                byte_FF36 = 1;
            }
            if (byte_FF36) {
                m->field_9 = 0xC0;
                return;
            }
            // Calculate vertical distance and chase
            check_vertical_distance_between_hero_and_monster(m);
            break;
            
        case 3:  // Move N repeatedly
            if (m->field_9 & 0x20) {
                // Move NE or NW based on direction flag
                if (m->field_5 & 0x80) {
                    move_monster_NE(m);
                } else {
                    move_monster_NW(m);
                }
                move_monster_N(m);
                if (!(m->field_6 & 0xFF)) {
                    m->field_9 |= 0x20;
                    m->field_6 = 2;
                }
            } else {
                m->field_6--;
                m->field_6 &= 0x07;
                if (m->field_6) return;
                m->field_6 = 0x70;
                m->field_9 = 0;
            }
            break;
    }
}

// ============================================================================
// AI Type 1: Patrol
// Moves south, then horizontal chase
// ============================================================================

/**
 * AI Type 1: Patrol behavior
 * Moves south, then chases hero horizontally
 * @param m Monster entry
 */
static void ai_type_1_patrol(MonsterEntry* m) {
    // Check for monsters two rows below
    if (!check_monster_ids_two_rows_below_monster(m)) {
        check_vertical_distance_between_hero_and_monster(m);
        return;
    }
    
    // Check if already hit by hero
    if (m->field_5 & 0x20) {
        hero_hits_monster(m);
        return;
    }
    
    // Try to move south
    move_monster_S(m);
    if (check_collision_S2_monster(m)) {
        return;  // Successfully moved
    }

    // Hit ground - start horizontal patrol
    m->field_6 += 0x41;
    m->field_6 &= 0xC3;

    // Check timer bits
    if (!(m->field_6 & 0xF0)) {
        // Chase hero horizontally
        if (m->x_rel < 0x17) {
            move_monster_E(m);
            if (check_collision_E2_monster(m)) {
                m->field_5 |= 0x80;  // Face right
                return;
            }
        } else {
            move_monster_W(m);
            if (check_collision_W2_monster(m)) {
                m->field_5 &= ~0x80;  // Face left
                return;
            }
        }
    }
}

// ============================================================================
// AI Type 2: Chase
// Horizontal pursuit with animation
// ============================================================================

/**
 * AI Type 2: Chase behavior
 * Horizontal pursuit with animation state machine
 * @param m Monster entry
 */
static void ai_type_2_chase(MonsterEntry* m) {
    // Check for monsters two rows below
    if (!check_monster_ids_two_rows_below_monster(m)) {
        check_vertical_distance_between_hero_and_monster(m);
        return;
    }
    
    // Check if already hit by hero
    if (m->field_5 & 0x20) {
        hero_hits_monster(m);
        return;
    }
    
    // Check state flag
    if (m->field_9 & 0x08) {
        // Animation state machine
        m->field_6++;
        m->field_6 &= 0x07;
        
        if (m->field_6 >= 7) {
            // Get animation frame from table
            uint8_t frame_idx = m->field_6 & 0xF0;
            m->field_6 = frame_idx | (m->field_6 & 0x07);
            
            const uint8_t* frame_table = (m->field_5 & 0x80) ? 
                move_dir_table_right : move_dir_table_left;
            
            uint8_t frame = frame_table[(m->field_6 - 2) & 0x03];
            monster_move_in_direction(m, frame);
            
            if (!check_collision_in_direction(m, frame)) {
                m->field_5 ^= 0x80;  // Reverse direction
            }
        }
        
        m->field_9 &= ~0x08;
        m->field_6 = 0;
        move_monster_S(m);
        return;
    }
    
    // Try to move south
    move_monster_S(m);
    if (check_collision_S2_monster(m)) {
        return;
    }
    
    // Hit ground - start chase
    m->field_6 += 0x21;
    m->field_6 &= 0xE1;
    
    int dir = sub_A4E8(m);
    if (dir != 0xFF) {
        m->field_5 &= ~0x7F;
        m->field_5 |= dir;
        m->field_6 = 2;
        m->field_9 |= 0x08;
        return;
    }
    
    m->field_6 = 2;
    m->field_9 |= 0x08;
}

// ============================================================================
// AI Type 3: Complex
// State machine with multiple phases
// ============================================================================

/**
 * AI Type 3: Complex behavior
 * Multi-phase state machine with special behaviors
 * @param m Monster entry
 */
static void ai_type_3_complex(MonsterEntry* m) {
    // Check for monsters two rows below
    if (!check_monster_ids_two_rows_below_monster(m)) {
        check_vertical_distance_between_hero_and_monster(m);
        return;
    }
    
    // Check if already hit by hero
    if (m->field_5 & 0x20) {
        hero_hits_monster(m);
        return;
    }
    
    // Check state flags
    if (m->field_9 & 0x08) {
        // Extended state machine
        if (m->field_9 & 0x10) {
            // Phase 2: Special movement
            m->field_9 += 0x20;
            if (m->field_9 & 0x20) {
                uint8_t idx = m->field_9 >> 3;
                idx = (idx - 1) & 0x07;
                
                const uint8_t* table = (m->field_5 & 0x80) ?
                    move_dir_table_cw : move_dir_table_ccw;
                
                uint8_t dir = table[idx];
                monster_move_in_direction(m, dir);
                
                if (!check_collision_in_direction(m, dir)) {
                    m->field_9 &= ~0x10;
                    m->field_9 |= 0x04;
                    
                    if (m->field_6) {
                        m->field_6 = 3;
                        return;
                    }
                }
            } else {
                // Animation frame update
                m->field_6++;
                m->field_6 &= 0x03;
                
                if (m->field_6 == 0) {
                    m->field_9 &= ~0x10;
                    m->field_6 = 3;
                    move_monster_S(m);
                    return;
                }
            }
            return;
        }
        
        // Phase 1: Check proximity
        m->field_6 &= 0x0F;
        m->field_6 |= 0x04;
        
        int dir = sub_A6F0(m);
        if (dir != 0xFF) {
            m->field_5 &= ~0x7F;
            m->field_5 |= dir;
            m->field_6 = 0;
            m->field_9 |= 0x02;
            m->field_9 &= ~0x04;
            return;
        }
        
        m->field_6 += 0x40;
        if ((uint8_t)m->field_6 < 0x80) {
            return;
        }
        
        m->field_6 = ((m->field_6 >> 5) & 0x07) | (m->field_6 & 0x60);
        
        dir = sub_A6F0(m);
        if (dir != 0xFF) {
            m->field_5 &= ~0xFD;
            m->field_A = 0;
        }
        
        if (m->field_5 & 0x80) {
            move_monster_E(m);
            if (!check_collision_E2_monster(m)) {
                m->field_6 = 0;
                m->field_9 |= 0x10;
                m->field_9 &= 0x1F;
                return;
            }
        } else {
            move_monster_W(m);
            if (!check_collision_W2_monster(m)) {
                m->field_6 = 0;
                m->field_9 |= 0x10;
                m->field_9 &= 0x1F;
                return;
            }
        }
        return;
    }

    // Initial state: try to move south
    move_monster_S(m);
    if (check_collision_S2_monster(m)) {
        return;
    }

    // Hit ground - initialize state
    if (!(m->field_9 & 0x04)) {
        m->field_A += 0x10;
        // Check if field_A has not overflowed (original assembly checks for carry)
        if (m->field_A >= 0) {  // Signed comparison - checks if no overflow
            m->field_9 |= 0x04;
            return;
        }
    }

    int dir = sub_A6F0(m);
    if (dir == 0xFF) {
        m->field_5 &= ~0xFD;
    }

    if (m->field_5 & 0x80) {
        move_monster_E(m);
        if (!check_collision_E2_monster(m)) {
            m->field_6 = 0;
            m->field_9 |= 0x10;
            m->field_9 &= 0x1F;
            return;
        }
    } else {
        move_monster_W(m);
        if (!check_collision_W2_monster(m)) {
            m->field_6 = 0;
            m->field_9 |= 0x10;
            m->field_9 &= 0x1F;
            return;
        }
    }
}

// ============================================================================
// Main Monster AI Dispatcher
// Port of Monster_AI (eai1.asm A254)
// ============================================================================

/**
 * Main monster AI dispatcher
 * Dispatches to appropriate AI routine based on monster type
 * @param m Monster entry
 */
void Monster_AI(MonsterEntry* m) {
    // Get AI type from flags (bits 0-3)
    uint8_t ai_type = m->flags & 0x0F;
    
    // Dispatch to appropriate AI routine
    switch (ai_type) {
        case 0:
            ai_type_0_guard(m);
            break;
        case 1:
            ai_type_1_patrol(m);
            break;
        case 2:
            ai_type_2_chase(m);
            break;
        case 3:
            ai_type_3_complex(m);
            break;
        default:
            // Unknown AI type - just move south
            move_monster_S(m);
            break;
    }
}

// ============================================================================
// Update All Monsters
// ============================================================================

/**
 * Update all monsters in the monster buffer
 * Iterates through monster buffer and calls Monster_AI for each
 */
void update_all_monsters_in_map(void) {
    uint8_t* monster_buf = &g_memory[MEM_VIEWPORT_BUFFER];
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    
    if (header->monsters_offset < MEM_MDT_DATA || header->monsters_offset >= 0xE000) {
        return;
    }
    
    // Iterate through monster buffer
    for (int i = 0; i < 28*19; i++) {
        if (monster_buf[i] == 0) continue;  // Empty slot
        
        // Get monster entry
        MonsterEntry* m = (MonsterEntry*)&g_memory[header->monsters_offset + (i * sizeof(MonsterEntry))];
        
        // Check for end marker
        if (m->currX == -1) break;
        
        // Update this monster
        Monster_AI(m);
    }
}
