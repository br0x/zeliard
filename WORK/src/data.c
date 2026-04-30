// data.c - Memory layout and global variables
// Implements the memory map from PORTING_PLAN.md

#include "zeliard.h"

// ============================================================================
// Main Memory Array (64KB to match original DOS memory model)
// ============================================================================

// Using a flat array to represent the entire memory space
// This gets placed in the WASM linear memory
uint8_t g_memory[65536] __attribute__((aligned(65536)));

// ============================================================================
// Export g_memory base address for JS
// ============================================================================

// JS needs to know where g_memory is located in WASM linear memory
// This function returns the offset of g_memory[0] in WASM memory
uint32_t get_memory_base(void) {
    return (uint32_t)((uintptr_t)g_memory);
}

// ============================================================================
// Helper Functions
// ============================================================================

// Get save data structure
SaveData* wasm_get_save_data(void) {
    return (SaveData*)&g_memory[MEM_SAVE_DATA];
}

// Get MDT header
MDTHeader* wasm_get_mdt_header(void) {
    return (MDTHeader*)&g_memory[MEM_MDT_DATA];
}

// Get monster buffer
uint8_t* wasm_get_monster_buffer(void) {
    return &g_memory[MEM_VIEWPORT_BUFFER];
}

// Get proximity map
uint8_t* wasm_get_proximity_map(void) {
    return &g_memory[MEM_PROXIMITY_MAP];
}

// Debug dump - just a marker, JS reads memory directly
void wasm_debug_dump(uint16_t offset, uint16_t length) {
    (void)offset;
    (void)length;
}
