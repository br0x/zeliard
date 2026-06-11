// data.c - Memory layout and global variables
// Implements the memory map from PORTING_PLAN.md

#include "zeliard.h"

/* =========================================================================
 * WASM linear memory — the entire address space lives here.
 * 0x10000 = 64 KB for seg0. Extend if seg1/seg2/seg3 are needed.
 * ========================================================================= */
uint8_t g_mem[0x40000];  /* 256 KB — covers seg0..seg3 */

void wasm_init(void) {
}

// ============================================================================
// Export g_mem base address for JS
// ============================================================================

// JS needs to know where g_mem is located in WASM linear memory
// This function returns the offset of g_mem[0] in WASM memory
uint32_t get_memory_base(void) {
    return (uint32_t)((uintptr_t)g_mem);
}

// ============================================================================
// Helper Functions
// ============================================================================

// Get save data structure
SaveData* wasm_get_save_data(void) {
    return (SaveData*)&g_mem[MEM_SAVE_DATA];
}

// Get MDT header
MDTHeader* wasm_get_mdt_header(void) {
    return (MDTHeader*)&g_mem[ADDR_MDT];
}

// Get monster buffer
uint8_t* wasm_get_monster_buffer(void) {
    return &g_mem[MEM_VIEWPORT_BUFFER];
}

// Get proximity map
uint8_t* wasm_get_proximity_map(void) {
    return &g_mem[ADDR_PROXIMITY_MAP];
}

// Debug dump - just a marker, JS reads memory directly
void wasm_debug_dump(uint16_t offset, uint16_t length) {
    (void)offset;
    (void)length;
}
