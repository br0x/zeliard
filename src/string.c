// string.c - Minimal string/memory functions
// Since we use -nostdlib, we implement these ourselves

#include <stdint.h>

#define NULL ((void*)0)

/**
 * Set memory to a value
 */
void* memset(void* dest, int val, unsigned long len) {
    uint8_t* p = (uint8_t*)dest;
    uint8_t v = (uint8_t)val;
    for (unsigned long i = 0; i < len; i++) {
        p[i] = v;
    }
    return dest;
}

/**
 * Copy memory
 */
void* memcpy(void* dest, const void* src, unsigned long len) {
    uint8_t* d = (uint8_t*)dest;
    const uint8_t* s = (const uint8_t*)src;
    for (unsigned long i = 0; i < len; i++) {
        d[i] = s[i];
    }
    return dest;
}
