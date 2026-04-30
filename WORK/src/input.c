// input.c - Input handling system
// Provides input buffer and key state management for WASM integration

#include "zeliard.h"

// Debug variable to verify code is running
static uint8_t input_debug_counter = 0;

// ============================================================================
// External functions
// ============================================================================
extern void* memset(void* dest, int val, unsigned long len);
extern void* memcpy(void* dest, const void* src, unsigned long len);

// ============================================================================
// Exported debug function
// ============================================================================

/**
 * Get input debug counter - verifies input code is running
 */
uint8_t input_get_debug_counter(void) {
    return input_debug_counter;
}

// ============================================================================
// Input Buffer (at 0xFF16-0xFF19 - 4 bytes)
// ============================================================================

// Input buffer structure in global memory
// Layout matches InputBuffer struct in zeliard.h
static InputBuffer* get_input_buffer(void) {
    return (InputBuffer*)&g_memory[MEM_INPUT_BUFFER];
}

// ============================================================================
// Input API
// ============================================================================

/**
 * Initialize input buffer
 * Called once at game startup
 */
void input_init(void) {
    InputBuffer* input = get_input_buffer();
    
    // Clear all input state
    input->current_keys = 0;
    input->pressed_keys = 0;
    input->released_keys = 0;
    input->previous_keys = 0;
}

/**
 * Update input state
 * Called every frame to compute edge-triggered inputs
 * 
 * This function:
 * 1. Saves current keys as previous keys
 * 2. Computes pressed keys (current & ~previous)
 * 3. Computes released keys (~current & previous)
 */
void input_update(void) {
    InputBuffer* input = get_input_buffer();
    
    // Save current state as previous
    input->previous_keys = input->current_keys;
    
    // Compute edge-triggered inputs
    // pressed = keys that are down now but weren't last frame
    input->pressed_keys = input->current_keys & ~input->previous_keys;
    
    // released = keys that were down last frame but aren't now
    input->released_keys = ~input->current_keys & input->previous_keys;
}

/**
 * Set current key state from JavaScript
 * @param keys - Bitmask of currently pressed keys (InputFlags)
 */
void input_set_keys(uint8_t keys) {
    input_debug_counter++;  // Increment to verify function is called
    
    InputBuffer* input = get_input_buffer();
    
    // Write directly to 0xFF16 (input buffer base)
    g_memory[0xFF16] = keys;
    
    input->current_keys = keys;
}

/**
 * Get current key state
 * @return Bitmask of currently held keys (InputFlags)
 */
uint8_t input_get_current_keys(void) {
    // Read directly from 0xFF16
    uint8_t value = g_memory[0xFF16];
    
    return value;
}

/**
 * Get keys pressed this frame (edge-triggered)
 * @return Bitmask of keys pressed this frame only
 */
uint8_t input_get_pressed_keys(void) {
    InputBuffer* input = get_input_buffer();
    return input->pressed_keys;
}

/**
 * Get keys released this frame (edge-triggered)
 * @return Bitmask of keys released this frame only
 */
uint8_t input_get_released_keys(void) {
    InputBuffer* input = get_input_buffer();
    return input->released_keys;
}

/**
 * Check if a key was pressed this frame (edge-triggered)
 * @param key - Key flag to check (INPUT_UP, INPUT_DOWN, etc.)
 * @return 1 if pressed this frame, 0 otherwise
 */
int input_is_key_pressed(uint8_t key) {
    InputBuffer* input = get_input_buffer();
    return (input->pressed_keys & key) != 0 ? 1 : 0;
}

/**
 * Check if a key is currently held down
 * @param key - Key flag to check (INPUT_UP, INPUT_DOWN, etc.)
 * @return 1 if held, 0 otherwise
 */
int input_is_key_held(uint8_t key) {
    InputBuffer* input = get_input_buffer();
    return (input->current_keys & key) != 0 ? 1 : 0;
}

/**
 * Check if a key was released this frame (edge-triggered)
 * @param key - Key flag to check (INPUT_UP, INPUT_DOWN, etc.)
 * @return 1 if released this frame, 0 otherwise
 */
int input_is_key_released(uint8_t key) {
    InputBuffer* input = get_input_buffer();
    return (input->released_keys & key) != 0 ? 1 : 0;
}

/**
 * Get input buffer pointer for JavaScript
 * Allows JS to directly access input buffer in WASM memory
 */
InputBuffer* wasm_get_input_buffer(void) {
    return get_input_buffer();
}
