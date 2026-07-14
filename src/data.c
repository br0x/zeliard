// data.c - Memory layout and global variables
// Implements the memory map from PORTING_PLAN.md

#include <stdio.h>
#include "zeliard.h"

/* =========================================================================
 * WASM linear memory — the entire address space lives here.
 * 0x10000 = 64 KB for seg0. Extend if seg1/seg2/seg3 are needed.
 * ========================================================================= */
uint8_t g_mem[0x40000];  /* 256 KB — covers seg0..seg3 */

void wasm_init()
{
    // In original game, these are set to 0 in the game.bin (before opening demo)
    MEM8(ADDR_ON_ROPE_FLAGS) = 0;
    MEM8(ADDR_HERO_HIDDEN_FLAG) = 0;
    MEM8(ADDR_SWORD_SWING_FLAG) = 0;
    MEM8(ADDR_UI_ELEMENT_DIRTY) = 0;
    MEM8(ADDR_SPELL_ACTIVE_FLAG) = 0;
    MEM8(ADDR_JUMP_PHASE_FLAGS) = 0;
    MEM8(ADDR_SQUAT_FLAG) = 0;
    MEM8(ADDR_HERO_DAMAGE_THIS_FRAME) = 0;
    MEM8(ADDR_BYTE_FF3E) = 0;
    MEM8(ADDR_BYTE_FF4B) = 0;
    MEM8(ADDR_HEARTBEAT_VOLUME) = 0;
    MEM8(ADDR_HERO_ANIM_PHASE) = 0;
    MEM8(ADDR_KEYBOARD_ALT_MODE_FLAG) = 0;
    MEM8(ADDR_FONT_HIGHLIGHT_FLAG) = 0;
    MEM8(ADDR_SHIELD_ANIM_ACTIVE) = 0;
    MEM8(ADDR_SLOPE_DIRECTION) = 0;
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


// Import provided by JS (reads string from WASM linear memory and console.logs it)
extern void js_log(const char *msg);

void debug_log(const char *msg) {
    js_log(msg);
}

void debug_printf(const char *fmt, ...) {
    char buf[256];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    js_log(buf);
}

/* JS callable: copy browser key state into the town input latch bytes */
void wasm_set_input_keys(uint8_t keys)
{
    uint8_t dirs = 0;
    if (keys & 0x01) dirs |= 0x01;  /* up */
    if (keys & 0x02) dirs |= 0x02;  /* down */
    if (keys & 0x04) dirs |= 0x04;  /* left */
    if (keys & 0x08) dirs |= 0x08;  /* right */

    MEM8(ADDR_INPUT_DIRS) = dirs;
    MEM8(ADDR_F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter) = (keys & 0x10) ? 0x01 : 0x00;
    MEM8(ADDR_INPUT_ALT_SPACE) =
        (uint8_t)(((keys & 0x20) ? 0x01 : 0x00) |
                  ((keys & 0x40) ? 0x02 : 0x00));
}
