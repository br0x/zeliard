// unpack.c - MDT map unpacking routines
#include "zeliard.h"
#include "dungeon.h"


#define MEM8(addr)   (g_mem[(addr) & 0xFFFF])
#define MEM16(addr)  (*(uint16_t *)&g_mem[(addr) & 0xFFFF])

#define ADDR_PROXIMITY_MAP_LEFT_COL   0x80u    // word
#define ADDR_VIEWPORT_TOP_ROW         0x82u    // byte
#define ADDR_VIEWPORT_LEFT_TOP   0xFF31u
// ============================================================================
// Constants
// ============================================================================

#define PROXIMITY_MAP_WIDTH  36   // Full proximity map width (columns)
#define PROXIMITY_MAP_HEIGHT 64   // Full proximity map height (rows)
#define VIEWPORT_WIDTH       28   // Visible viewport width
#define VIEWPORT_HEIGHT      18   // Visible viewport height
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

// ============================================================================
// Unpack Step - decode one RLE segment
// ============================================================================

/**
 * Unpack one segment from packed map
 * Returns: tile value in bl, run length in bh
 */
void unpack_step_forward(uint8_t* packed, uint16_t* pos, uint8_t* tile, uint8_t* count) {
    uint8_t byte = packed[*pos++];
    
    // Extract encoding type from bits 7-6
    uint8_t encoding = byte >> 6;
    
    switch (encoding) {
        case 0:  // 00xxxxxx - repeat tile, count from bits 5-0 + 1, tile = next byte
// mov     bh, [si]        ; 00...... ........
// inc     bh              ; count = (byte & 3fh)+1
// inc     si
// mov     bl, [si]        ; tile = next_byte
            *count = byte + 1;
            *tile = packed[*pos++];
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
            *tile = (byte & 0x0F) + 1;
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
    uint8_t byte = packed[*pos--];
    
    // Extract encoding type from bits 7-6
    uint8_t encoding = byte >> 6;
    
    switch (encoding) {
        case 0:  // 00xxxxxx - repeat tile, count from bits 5-0 + 1, tile = previous byte
// mov     bl, [si]
// dec     si
// mov     bh, [si]
// inc     bh
            *tile = byte;
            *count = packed[*pos--] + 1;
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
            *tile = (byte & 0x0F) + 1;
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
}

/**
 * Unpack one column (64 rows) from packed data to proximity map
 * Column-major order: writes to dest[0], dest[36], dest[72], ... dest[36*63]
 *
 * @param packed  Packed map data
 * @param pos     Current position in packed data (updated)
 * @param dest    Destination in proximity map (first byte of column)
 */
void unpack_column(uint8_t* packed, uint16_t* pos, uint8_t* dest) {
    uint8_t y = 0;  // Row counter (0-63)
    uint8_t* p = dest;

    while (y < 64) {
        uint8_t tile, count;
        unpack_step_forward(packed, pos, &tile, &count);
        y += count;
        while (count--) {
            *p = tile;
            p += 36;
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

    // Packed map starts at offset 0x1B in MDT file (0xC01B relative to g_mem)
    uint8_t* packed = &g_mem[ADDR_PACKED_MAP_START]; // si
    uint16_t packed_pos = 0; // offset packed + packed_pos = si

    // Skip cx columns before proximity map left edge (unpack to /dev/null)
    for (int x = 0; x < cx; x++) {
        uint8_t dh = 0;
        do {
            uint8_t tile, count;
            unpack_step_forward(packed, &packed_pos, &tile, &count);
            dh += count;
        } while (dh < 64);
    }

    // Store position for left column pointer (column before start)
    packed_map_ptr_for_prox_left = packed + packed_pos;
    uint16_t ax = cx;
    uint16_t map_width = MEM16(MEM_MDT_DATA + MAP_WIDTH_OFFSET);

    // Unpack 36 columns into proximity map
    uint8_t* proximity = &g_mem[ADDR_PROXIMITY_MAP];
    for (int col = 0; col < PROXIMITY_MAP_WIDTH; col++) {
        // Column-major: unpack_column writes to dest[0], dest[36], dest[72], ...
        unpack_column(packed, &packed_pos, &proximity[col]); // updates packed_pos
        ax++; // current column x-coordinate
        
        if (ax == map_width) {
            // wrap
            packed_pos = 0;
            ax = 0;
        }
    }
    
    uint8_t* end_ptr = ax == 0 ? MEM16(ADDR_PACKED_MAP_END_PTR) : packed + packed_pos;
    packed_map_ptr_for_prox_right = end_ptr - 1;
    MEM16(ADDR_VIEWPORT_LEFT_TOP) = ADDR_PROXIMITY_MAP + (MEM8(ADDR_VIEWPORT_TOP_ROW) & 0x3f) * 36;
}
