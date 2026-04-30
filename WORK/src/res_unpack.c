#include <stdint.h>
#include <string.h>



/**
 * Zeliard Resource Unpacker Dispatcher
 * Based on sub_DAD in stick.bin
 * * @param src  Pointer to the compressed resource data
 * @param dest Pointer to the destination buffer
 */
void unpack_dispatcher(uint8_t *src, uint8_t *dest) {
    uint8_t mode = *src++;      // First byte is the compression mode
    uint16_t compressed_sz;
    uint16_t dx;                // Equivalent to DX register (remaining data size)
    uint32_t cx;                // Equivalent to CX register (count for runs)
    uint8_t val;                // Equivalent to AL register (value for runs)

    // Common header: mode (1 byte), size (2 bytes)
    compressed_sz = *(uint16_t*)src;
    src += 2;
    dx = compressed_sz - 2; // Subtract the 2 bytes read for size

    switch (mode) {
        case 0: // Direct Copy (loc_DCC)
            memcpy(dest, src, dx);
            break;

        case 1: // RLE Variant 1 (sub_DD1)
            while (dx > 0) {
                uint8_t cmd = *src++; dx--;
                cx = (cmd & 0x7F) + 1;
                if (cmd & 0x80) {
                    val = *src++; dx--;
                    memset(dest, val, cx);
                    dest += cx;
                } else {
                    // Logic from sub_DE0 loc_DFA: single literal copy 
                    // then return cx=1 to parent loop
                    *dest++ = *src++; dx--;
                }
            }
            break;

        case 2: // Nibble-based RLE (loc_E13)
            while (dx > 0) {
                val = *src++; dx--;
                if ((val & 0xF0) == 0xF0) {
                    cx = (val & 0x0F) + 3;
                    val = *src++; dx--;
                    memset(dest, val, cx);
                    dest += cx;
                } else {
                    *dest++ = val;
                }
            }
            break;

        case 3: // Mode 3 (loc_E34 / sub_E43)
            while (dx > 0) {
                uint8_t cmd = *src++; dx--;
                // sub_E43 logic: complex bit-packing or specific RLE
                cx = (cmd & 0x3F) + 1;
                if (cmd & 0x40) {
                    val = *src++; dx--;
                    memset(dest, val, cx);
                    dest += cx;
                } else {
                    *dest++ = cmd;
                }
            }
            break;

        case 4: // RLE Variant 4 (loc_E73)
        case 5: // RLE Variant 5 (loc_E9C) - Modes 4 and 5 share similar logic in sub_E7C/EA6
            while (dx > 0) {
                uint8_t cmd = *src++; dx--;
                cx = (cmd & 0x7F) + 1;
                if (!(cmd & 0x80)) {
                    val = *src++; dx--;
                    memset(dest, val, cx);
                } else {
                    // Reads a word but treats it as a run of the low byte
                    val = *src++; dx--;
                    src++; dx--; // Skip high byte
                    memset(dest, val, cx);
                }
                dest += cx;
            }
            break;

        case 6: // Segmented Skip RLE (loc_EBA)
            // Skip data until 0xFFFF sentinel
            while (*(uint16_t*)src != 0xFFFF) {
                src += 2; dx -= 2;
            }
            src += 2; dx -= 2;
            // Then perform decompression similar to Mode 1/4
            while (dx > 0) {
                uint8_t cmd = *src++; dx--;
                cx = (cmd >> 4) + 1;
                val = *src++; dx--;
                memset(dest, val, cx);
                dest += cx;
            }
            break;

        case 7: // Word-Valued RLE (loc_EF5)
            while (dx > 0) {
                uint16_t cmd = *(uint16_t*)src; src += 2; dx -= 2;
                cx = (cmd & 0xFF) + 1;
                val = (uint8_t)(cmd >> 8); 
                memset(dest, val, cx);
                dest += cx;
            }
            break;

        default:
            // Unknown mode handling
            break;
    }
}
