// debug_main.c - Native debug entry point for testing unpack.c
// Compile with: clang -g -O0 -o debug unpack.c data.c string.c debug_main.c

#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

// Forward declarations from zeliard.h
#define MEM_MDT_DATA        0xC000
#define MEM_PROXIMITY_MAP   0xE000

extern uint8_t g_memory[65536];

// From unpack.c
void unpack_map_internal(uint8_t hero_x, uint8_t hero_y);

// From mdt.c
int wasm_load_mdt(const uint8_t* mdt_data, uint32_t mdt_size);

int main(int argc, char** argv) {
    printf("=== Zeliard Unpack Debug ===\n\n");
    
    // Load MDT file
    if (argc < 2) {
        printf("Usage: %s <file.mdt>\n", argv[0]);
        return 1;
    }
    
    FILE* f = fopen(argv[1], "rb");
    if (!f) {
        printf("Cannot open file: %s\n", argv[1]);
        return 1;
    }
    
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    
    uint8_t* mdt_data = malloc(size);
    fread(mdt_data, 1, size, f);
    fclose(f);
    
    printf("Loaded %ld bytes from %s\n\n", size, argv[1]);
    
    // Load MDT into memory at 0xC000
    memcpy(&g_memory[MEM_MDT_DATA], mdt_data, size);
    free(mdt_data);
    
    // Dump MDT header
    printf("MDT Header:\n");
    printf("  [0xC000]: %02X %02X\n", 
           g_memory[0xC000], g_memory[0xC001]);
    printf("  [0xC002]: %04X (map width)\n", 
           g_memory[0xC002] | (g_memory[0xC003] << 8));
    printf("  [0xC004]: %04X (vertical platforms)\n", 
           g_memory[0xC004] | (g_memory[0xC005] << 8));
    printf("  [0xC006]: %04X (air streams)\n", 
           g_memory[0xC006] | (g_memory[0xC007] << 8));
    printf("  [0xC008]: %04X (horizontal platforms)\n", 
           g_memory[0xC008] | (g_memory[0xC009] << 8));
    printf("  [0xC00A]: %04X (doors)\n", 
           g_memory[0xC00A] | (g_memory[0xC00B] << 8));
    printf("  [0xC00C]: %04X (items check)\n", 
           g_memory[0xC00C] | (g_memory[0xC00D] << 8));
    printf("  [0xC00E]: %04X (cavern name info)\n", 
           g_memory[0xC00E] | (g_memory[0xC00F] << 8));
    printf("  [0xC010]: %04X (monsters)\n\n", 
           g_memory[0xC010] | (g_memory[0xC011] << 8));
    
    // Show packed map start
    printf("Packed map starts at 0xC01B:\n");
    printf("  [0xC01B]: %02X %02X %02X %02X %02X %02X %02X %02X\n\n",
           g_memory[0xC01B], g_memory[0xC01C], g_memory[0xC01D], g_memory[0xC01E],
           g_memory[0xC01F], g_memory[0xC020], g_memory[0xC021], g_memory[0xC022]);
    
    uint8_t x = 17; // Standard Malicia spawn point is (63, 7)
    uint8_t y = 4;
    printf("Unpacking map centered at hero (x=%d, y=%d)...\n\n", x, y);
    unpack_map_internal(x, y);
    
    // Show first few rows of proximity map
    printf("Proximity map ASCII view (first 10 rows, 36 columns):\n");
    uint8_t* proximity = &g_memory[MEM_PROXIMITY_MAP];
    for (int row = 0; row < 10; row++) {
        printf("  Row %2d: ", row);
        for (int col = 0; col < 36; col++) {
            char c = proximity[row * 36 + col] + 0x20;
            printf("%c", c);
        }
        printf("\n");
    }
    
    printf("\n✓ Done!\n");
    return 0;
}
