// unpack.c - MDT map unpacking routines
// Port of Fight.asm sub_6C98, unpack_column, unpack_step_forward

#include "zeliard.h"

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);

// ============================================================================
// Constants
// ============================================================================

#define PROXIMITY_MAP_WIDTH  36   // Full proximity map width (columns)
#define PROXIMITY_MAP_HEIGHT 64   // Full proximity map height (rows)
#define VIEWPORT_WIDTH       28   // Visible viewport width
#define VIEWPORT_HEIGHT      18   // Visible viewport height
#define MAP_WIDTH_OFFSET     2    // Width of full map in MDT (0xC002 - 0xC000)

// These track position in the packed map data during unpacking
uint16_t packed_map_end_ptr = 0;  // end of packed map  
static uint16_t packed_map_start_offset = 0;  // Start of packed map in MDT
uint16_t packed_map_ptr_for_hero_x_minus_18 = 0;  // For left column
uint16_t packed_map_ptr_for_hero_x_plus_18 = 0;   // For right column
uint16_t packed_map_start = 0;  // Starting offset for packed data (for wraparound)
uint16_t map_hero_row_start = 0; // FF31

// ============================================================================
// Map Width Helper
// ============================================================================

/**
 * Get full map width from MDT header
 * MDT header at 0xC000, map width at offset 2 (0xC002)
 */
uint16_t get_map_width(void) {
    return g_memory[MEM_MDT_DATA + MAP_WIDTH_OFFSET] | 
           (g_memory[MEM_MDT_DATA + MAP_WIDTH_OFFSET + 1] << 8);
}

/**
 * Get packed map start offset
 * Returns the starting offset of packed map data in MDT
 */
uint16_t get_packed_map_start(void) {
    return packed_map_start;
}

// ============================================================================
// Packed Map Format
// ============================================================================

/*
Each byte in packed map encodes run-length and tile value:

Bits 7-6 (0xC0): Encoding type
  00 (0x00): Repeat tile BL, count = BH+1 (BH from bits 5-0 + 1)
  01 (0x40): Repeat tile 0x00 (empty), count = (byte & 0x3F) + 1
  10 (0x80): Repeat tile BL, count = 1 (just the tile)
  11 (0xC0): Special encoding

The unpacking is done column by column (64 rows each).
36 columns are unpacked to form the proximity map.
*/

// ============================================================================
// Unpack Step - decode one RLE segment
// ============================================================================

/**
 * Unpack one segment from packed map
 * Returns: tile value in bl, run length in bh
 */
void unpack_step_forward(uint8_t* packed, uint16_t* pos, uint8_t* tile, uint8_t* count) {
    uint8_t byte = packed[*pos];
    
    // Extract encoding type from bits 7-6
    uint8_t encoding = (byte & 0xC0) >> 6;
    
    switch (encoding) {
        case 0:  // 00xxxxxx - repeat tile, count from bits 5-0 + 1, tile = next byte
// mov     bh, [si]        ; 00...... ........
// inc     bh              ; count = (byte & 3fh)+1
// inc     si
// mov     bl, [si]        ; tile = next_byte
            *count = byte + 1;
            (*pos)++;
            *tile = packed[*pos];
            break;
            
        case 1:  // 01xxxxxx - repeat tile, count from bits 5-4 + 2, tile from bits 3-0 + 1
// mov     bl, [si]
// mov     bh, bl
// shr     bh, 1
// shr     bh, 1
// shr     bh, 1
// shr     bh, 1
// and     bh, 3
// add     bh, 2
// and     bl, 0Fh
// inc     bl
            *count = ((byte & 0x30) >> 4) + 2;
            *tile = (byte & 0xF) + 1;
            break;
            
        case 2:  // 10xxxxxx - repeat zero tile, count from bits 5-0
// mov     bh, [si]
// and     bh, 3Fh
// xor     bl, bl
            *count = byte & 0x3F;
            *tile = 0;
            break;
            
        case 3:  // 11xxxxxx - count = 1, tile from bits 5-0
// mov     bl, [si]
// and     bl, 3Fh
// mov     bh, 1
            *count = 1;
            *tile = byte & 0x3F;
            break;
    }
    
    (*pos)++;
}

/**
 * Unpack step backward - decode one RLE segment going backwards in packed data
 * Port of Fight.asm unpack_step_backward
 *
 * @param packed  Packed map data
 * @param pos     Current position in packed data (decremented)
 * @param tile    Output: tile value
 * @param count   Output: run count
 */
void unpack_step_backward(uint8_t* packed, uint16_t* pos, uint8_t* tile, uint8_t* count) {
    uint8_t byte = packed[*pos];
    
    // Extract encoding type from bits 7-6
    uint8_t encoding = (byte & 0xC0) >> 6;
    
    switch (encoding) {
        case 0:  // 00xxxxxx - repeat tile, count from bits 5-0 + 1, tile = previous byte
// mov     bl, [si]
// dec     si
// mov     bh, [si]
// inc     bh
            *tile = byte & 0x3F;
            (*pos)--;
            *count = packed[*pos] + 1;
            break;
            
        case 1:  // 01xxxxxx - repeat tile, count from bits 5-4 + 2, tile from bits 3-0 + 1
// mov     bl, [si]
// mov     bh, bl
// shr     bh, 1
// shr     bh, 1
// shr     bh, 1
// shr     bh, 1
// and     bh, 3
// add     bh, 2
// and     bl, 0Fh
// inc     bl
            *count = ((byte & 0x30) >> 4) + 2;
            *tile = (byte & 0xF) + 1;
            break;
            
        case 2:  // 10xxxxxx - repeat zero tile, count from bits 5-0
// mov     bh, [si]
// and     bh, 3Fh
// xor     bl, bl
            *count = byte & 0x3F;
            *tile = 0;
            break;
            
        case 3:  // 11xxxxxx - count = 1, tile from bits 5-0
// mov     bl, [si]
// and     bl, 3Fh
// mov     bh, 1
            *count = 1;
            *tile = byte & 0x3F;
            break;
    }
    (*pos)--;
}

// ============================================================================
// Unpack Column - unpack one column of 64 rows
// ============================================================================

/**
 * Unpack one column (64 bytes) from packed data to proximity map
 * Column-major order: writes to dest[0], dest[36], dest[72], ... dest[36*63]
 *
 * @param packed  Packed map data
 * @param pos     Current position in packed data (updated)
 * @param dest    Destination in proximity map (first byte of column)
 */
void unpack_column(uint8_t* packed, uint16_t* pos, uint8_t* dest) {
    uint8_t y = 0;  // Row counter (0-63)

    while (y < 64) {
        uint8_t tile, count;
        unpack_step_forward(packed, pos, &tile, &count); // pos++ inside

        // Fill 'count' bytes with 'tile' value, column-major order
        while (count > 0 && y < 64) {
            dest[y * 36] = tile;  // Column-major: each row is 36 bytes apart
            y++;
            count--;
        }
    }
}

// ============================================================================
// Unpack Map - main entry point
// ============================================================================

void unpack_map() {
    SaveData* save = (SaveData*)&g_memory[MEM_SAVE_DATA];
    unpack_map_internal(save->hero_x_minus_18_abs + 18, save->hero_y_rel);
}

/**
 * Unpack MDT map data into proximity map centered on hero position
 *
 * @param hero_x  Hero's absolute X coordinate in full map
 * @param hero_y  Hero's absolute Y coordinate in full map (used for map wrapping)
 */
void unpack_map_internal(uint8_t hero_x, uint8_t hero_y) {
    (void)hero_y;  // Y coordinate handled by caller for vertical wrapping

    // Clear proximity map first
    memset(&g_memory[MEM_PROXIMITY_MAP], 0, PROXIMITY_MAP_WIDTH * PROXIMITY_MAP_HEIGHT);

    // Packed map starts at offset 0x1B in MDT file (address 0xC01B in memory)
    uint16_t packed_start = PACKED_MAP_START;

    // Calculate starting column in full map
    // We want to unpack 36 columns centered on hero_x
    // hero_x_minus_18 = hero_x - 18
    int16_t cx = (int16_t)hero_x - 18;
    uint16_t ax = cx;
    uint16_t map_width = g_memory[MEM_MDT_DATA + MAP_WIDTH_OFFSET];

    // Get pointer to packed data
    uint8_t* packed = &g_memory[MEM_MDT_DATA + packed_start]; // si
    uint16_t packed_pos = 0; // offset packed + packed_pos = si

    // Skip cx columns before proximity map left edge (unpack to /dev/null)
    // Each column is variable length due to RLE, so we need to unpack and discard
    for (int x = 0; x < cx; x++) {
        // Unpack column to temporary buffer (discard)
        uint8_t temp[PROXIMITY_MAP_HEIGHT];
        unpack_column(packed, &packed_pos, temp); // updates packed_pos
    }

    // Store position for left column pointer (column before start)
    packed_map_ptr_for_hero_x_minus_18 = packed_pos;

    // Unpack 36 columns into proximity map
    uint8_t* proximity = &g_memory[MEM_PROXIMITY_MAP];

    int col = 0;

    // 00006CBF: Unpack 36 columns for proximity map
    do {
        // Unpack column directly to proximity map
        // Column-major: unpack_column writes to dest[0], dest[36], dest[72], ...
        unpack_column(packed, &packed_pos, &proximity[col]); // updates packed_pos
        ax++; // from hero_x - 18, 36 columns
        
        if (ax == map_width) {
            packed_pos = 0;
            ax = 0;
        }
    } while (++col != PROXIMITY_MAP_WIDTH);
    
    if (ax == 0) {
        packed_pos = packed_map_end_ptr;
    }

    // Store current packed position for right column (next column to unpack, minus 1)
    packed_pos--;
    packed_map_ptr_for_hero_x_plus_18 = packed_pos;
    // packed_map_end_ptr = packed_pos + 1;
    // packed_map_start_offset = packed_start;
    // packed_map_start = packed_start;  // 0xc01b in original game; we will use 0x1b from MDT buffer
    map_hero_row_start = coords_to_proximity_offset(0, hero_y);
}


// ============================================================================
// Helper: Convert map coordinates to proximity map offset
// ============================================================================

/**
 * Convert (x, y) to offset in proximity map
 * 
 * @param x  X coordinate (0-35, relative to viewport)
 * @param y  Y coordinate (0-63, absolute)
 * @return   Offset in proximity map buffer
 */
uint16_t coords_to_proximity_offset(uint8_t x, uint8_t y) {
    // Clamp Y to 0-63
    y &= 0x3F;
    
    return (y * 36) + x;
}
