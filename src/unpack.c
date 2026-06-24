// unpack.c - MDT map unpacking routines
#include "zeliard.h"
#include "dungeon.h"


#define MEM8(addr)   (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)  (*(uint16_t *)&g_mem[(addr) & 0xFFFF])

// ============================================================================
// Constants
// ============================================================================

#define PROXIMITY_MAP_WIDTH  36   // Full proximity map width (columns)
#define MAP_WIDTH_OFFSET     2    // Width of full map in MDT (0xC002 - 0xC000)

// These track position in the packed map data during unpacking
uint16_t packed_map_ptr_for_prox_left = 0;  // For left column
uint16_t packed_map_ptr_for_prox_right = 0;   // For right column



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

/**
 * Unpack step forward - decode one RLE segment going forward in packed data
 * Port of Fight.asm unpack_step_forward
 *
 * @param packed_ptr  Packed map data pointer
 * @param tile    Output: tile value
 * @param count   Output: run count
 */
void unpack_step_forward(uint16_t* packed_ptr, uint8_t* tile, uint8_t* count)
{
    uint8_t byte = g_mem[(*packed_ptr)++];
    
    // Extract encoding type from bits 7-6
    uint8_t encoding = byte >> 6;
    
    switch (encoding) {
        case 0:  // 00xxxxxx - repeat tile, count from bits 5-0 + 1, tile = next byte
            *count = byte + 1;
            *tile = g_mem[(*packed_ptr)++];
            break;
            
        case 1:  // 01xxxxxx - repeat tile, count from bits 5-4 + 2, tile from bits 3-0 + 1
            *count = ((byte & 0x30) >> 4) + 2;
            *tile = (byte & 0x0F) + 1;
            break;
            
        case 2:  // 10xxxxxx - repeat zero tile, count from bits 5-0
            *count = byte & 0x3F;
            *tile = 0;
            break;
            
        case 3:  // 11xxxxxx - count = 1, tile from bits 5-0
            *count = 1;
            *tile = byte & 0x3F;
            break;
    }
}

/**
 * Unpack step backward - decode one RLE segment going backwards in packed data
 * Port of Fight.asm unpack_step_backward
 *
 * @param packed_ptr  Packed map data pointer
 * @param tile    Output: tile value
 * @param count   Output: run count
 */
void unpack_step_backward(uint16_t* packed_ptr, uint8_t* tile, uint8_t* count) {
    uint8_t byte = g_mem[(*packed_ptr)--];
    
    // Extract encoding type from bits 7-6
    uint8_t encoding = byte >> 6;
    
    switch (encoding) {
        case 0:  // 00xxxxxx - repeat tile, count from bits 5-0 + 1, tile = previous byte
            *tile = byte;
            *count = g_mem[(*packed_ptr)--] + 1;
            break;
            
        case 1:  // 01xxxxxx - repeat tile, count from bits 5-4 + 2, tile from bits 3-0 + 1
            *count = ((byte & 0x30) >> 4) + 2;
            *tile = (byte & 0x0F) + 1;
            break;
            
        case 2:  // 10xxxxxx - repeat zero tile, count from bits 5-0
            *count = byte & 0x3F;
            *tile = 0;
            break;
            
        case 3:  // 11xxxxxx - count = 1, tile from bits 5-0
            *count = 1;
            *tile = byte & 0x3F;
            break;
    }
}

/**
 * Unpack one column (64 rows) from packed data to proximity map
 * Column-major order: writes to dest[0], dest[36], dest[72], ... dest[36*63]
 *
 * @param packed_ptr  Packed map data pointer
 * @param dest    Destination in proximity map (first byte of column)
 */
void unpack_column(uint16_t* packed_ptr, uint8_t* dest)
{
    uint8_t row = 0;

    while (row < 64) {
        uint8_t tile, count;
        unpack_step_forward(packed_ptr, &tile, &count);
        row += count;
        while (count--) {
            *dest = tile;
            dest += 36;
        }
    }
}

/**
 * Unpack one column (64 rows) from packed data to proximity map, going backward
 * Column-major order
 *
 * @param packed_ptr  Packed map data pointer
 * @param dest    Destination in proximity map (first byte of column)
 */
void unpack_column_backward(uint16_t* packed_ptr, uint8_t* dest)
{
    uint8_t row = 0;

    while (row < 64) {
        uint8_t tile, count;
        unpack_step_backward(packed_ptr, &tile, &count);
        row += count;
        while (count--) {
            *dest = tile;
            dest -= 36;
        }
    }
}

// ============================================================================
// Unpack Map - main entry point
// ============================================================================
void unpack_map() {
    // Calculate starting column in full map
    // We want to unpack 36 columns centered on hero_x
    int16_t cx = MEM16(ADDR_PROXIMITY_MAP_LEFT_COL);

    // Packed map data starts at a fixed address in g_mem
    uint16_t packed_ptr = ADDR_PACKED_MAP_START;

    // Skip cx columns before the proximity map's left edge
    for (int x = 0; x < cx; x++) {
        uint8_t dh = 0;
        do {
            uint8_t tile, count;
            unpack_step_forward(&packed_ptr, &tile, &count);
            dh += count;
        } while (dh < 64);
    }

    // Store the absolute address of the first column we will unpack
    packed_map_ptr_for_prox_left = packed_ptr;

    uint16_t ax = cx;
    uint16_t map_width = MEM16(ADDR_MDT + MAP_WIDTH_OFFSET);

    // Unpack 36 columns into the proximity map
    uint8_t* proximity = &g_mem[ADDR_PROXIMITY_MAP];
    for (int col = 0; col < PROXIMITY_MAP_WIDTH; col++) {
        // Column-major: unpack_column writes to dest[0], dest[36], dest[72], ...
        unpack_column(&packed_ptr, &proximity[col]); // updates packed_pos
        ax++; // current column x-coordinate
        
        if (ax == map_width) {
            // wrap
            packed_ptr = ADDR_PACKED_MAP_START;
            ax = 0;
        }
    }
    
    uint16_t end_addr = ax == 0 ? MEM16(ADDR_PACKED_MAP_END_PTR) : packed_ptr;

    packed_map_ptr_for_prox_right = end_addr - 1;         // both sides are uint16_t
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = ADDR_PROXIMITY_MAP + (MEM8(ADDR_VIEWPORT_TOP_ROW) & 0x3f) * 36;
}
