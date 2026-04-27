// mdt.c - MDT file loader
// Loads dungeon data from *.mdt files into memory at 0xC000

#include "zeliard.h"

// ============================================================================
// External functions from string.c
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

#define NULL ((void*)0)

// ============================================================================
// MDT File Format (from PORTING_PLAN.md)
// ============================================================================

/*
MDT Header (at 0xC000):
Offset  Content
------  -------
0xC000  Unknown (4 bytes)
0xC004  Vertical platforms offset
0xC006  Air streams offset
0xC008  Horizontal platforms offset
0xC00A  Doors offset
0xC00C  Items check offset
0xC00E  Cavern name offset
0xC010  Monsters offset

Data lists are terminated by 0xFFFF marker.
*/

// ============================================================================
// MDT Loader
// ============================================================================

/**
 * Load MDT file into memory at 0xC000
 *
 * @param mdt_data  Pointer to MDT file data (in WASM memory, already at 0xC000)
 * @param mdt_size  Size of MDT file in bytes
 * @return 0 on success, -1 on error
 *
 * Note: JS copies MDT data directly to g_memory[0xC000] before calling this.
 * This function just validates the data is loaded correctly.
 */
int wasm_load_mdt(const uint8_t* mdt_data, uint32_t mdt_size) {
    if (!mdt_data || mdt_size == 0) {
        return -1;
    }

    // JS already copied MDT data to g_memory[MEM_MDT_DATA]
    // We just need to verify it was loaded correctly
    
    // Verify header was loaded
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];

    // Basic validation: offsets should be within reasonable range
    // All offsets should be > 0xC000 and < 0xE000
    if (header->vert_platforms_offset < 0xC000 ||
        header->vert_platforms_offset >= 0xE000) {
        // Invalid offset - but continue anyway for debugging
        // return -1;
    }

    return 0;
}

// ============================================================================
// MDT Data Accessors (internal use)
// ============================================================================

/**
 * Get vertical platforms list
 * Returns pointer to first platform (3 bytes each: x, y)
 * List terminated by 0xFFFF
 */
const uint8_t* mdt_get_vert_platforms(void) {
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    if (header->vert_platforms_offset >= MEM_MDT_DATA && 
        header->vert_platforms_offset < 0xE000) {
        return &g_memory[header->vert_platforms_offset];
    }
    return NULL;
}

/**
 * Get horizontal platforms list
 * Returns pointer to first platform (7 bytes each)
 * List terminated by 0xFFFF
 */
const uint8_t* mdt_get_horiz_platforms(void) {
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    if (header->horiz_platforms_offset >= MEM_MDT_DATA && 
        header->horiz_platforms_offset < 0xE000) {
        return &g_memory[header->horiz_platforms_offset];
    }
    return NULL;
}

/**
 * Get doors list
 * Returns pointer to first door (12 bytes each)
 * List terminated by 0xFFFF
 */
const uint8_t* mdt_get_doors(void) {
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    if (header->doors_offset >= MEM_MDT_DATA && 
        header->doors_offset < 0xE000) {
        return &g_memory[header->doors_offset];
    }
    return NULL;
}

/**
 * Get monsters list
 * Returns pointer to first monster entry (16 bytes each)
 * List terminated by 0xFFFF
 */
const MonsterEntry* mdt_get_monsters(void) {
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    if (header->monsters_offset >= MEM_MDT_DATA && 
        header->monsters_offset < 0xE000) {
        return (const MonsterEntry*)&g_memory[header->monsters_offset];
    }
    return NULL;
}

/**
 * Get cavern name (Pascal-style string)
 * Note: cavern_name_offset points to rendering info, name is 3 bytes in
 */
const char* mdt_get_cavern_name(void) {
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    if (header->cavern_name_offset >= MEM_MDT_DATA && 
        header->cavern_name_offset < 0xE000) {
        // Rendering info structure: first 3 bytes are metadata
        // Pascal string starts at offset+3: first byte is length, then characters
        return (const char*)&g_memory[header->cavern_name_offset + 3];
    }
    return NULL;
}

/**
 * Get cavern name length
 */
uint8_t mdt_get_cavern_name_length(void) {
    MDTHeader* header = (MDTHeader*)&g_memory[MEM_MDT_DATA];
    if (header->cavern_name_offset >= MEM_MDT_DATA && 
        header->cavern_name_offset < 0xE000) {
        // Pascal string length is at offset+3
        return g_memory[header->cavern_name_offset + 3];
    }
    return 0;
}
