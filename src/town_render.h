/**
 * town_render.h
 *
 * Public interface for the Zeliard town tile renderer (C port of gtmcga.asm).
 *
 * The caller must fill a zeliard_mem_t struct pointing to the game's live
 * memory regions and call render_town_tiles_28_columns() once per frame.
 */

#ifndef TOWN_RENDER_H
#define TOWN_RENDER_H

#include <stdint.h>

/* =========================================================================
 * Save-game offsets used by the renderer (subset of the full save area)
 * =========================================================================*/
#define SAVE_HERO_X_IN_VIEWPORT  0x83   /**< Hero tile-column within viewport (0-27) */
#define SAVE_VIEWPORT_TOP_ROW_Y  0x82   /**< Viewport top row in world tile coords   */

/* =========================================================================
 * Memory layout constants
 * =========================================================================*/

/** Number of columns in the rendered viewport */
#define TOWN_VIEWPORT_COLS  28
/** Number of tile rows in the rendered viewport */
#define TOWN_VIEWPORT_ROWS  8

/** Size of the blit cache table (one entry per tile id, 256 max) */
#define BLIT_CACHE_SIZE     256

/* =========================================================================
 * zeliard_mem_t
 *
 * Aggregates all memory regions the renderer needs to read/write.
 * In the original DOS game these were implicit via x86 segment registers;
 * here they are explicit pointers so the code can run in any address space
 * (e.g. a WASM linear memory).
 *
 * All sizes are given as the minimum required by the renderer.
 * =========================================================================*/
typedef struct {
    /**
     * VRAM: flat 320×200 byte framebuffer, palette indices 0-63.
     * The renderer writes to it starting at byte 0xA000:0000 in the original.
     * Shadow memory (used as a composite buffer for NPC sprites) is appended
     * immediately after the visible framebuffer: vram[64000 .. 64000+N].
     * Minimum size: 64000 + 192 * 4 = 64768 bytes.
     */
    uint8_t  *vram;

    /**
     * seg1: the first extended segment (code_segment + 0x1000 in the DOS
     * binary).  Contains:
     *   0x8000  tile_anim_count_table pointer (2 bytes)
     *   0x8002  special_tile_list_ptr (2 bytes)
     *   0x8004  tile_animation_replacement_table pointer (2 bytes)
     *   0x8100  packed_tile_graphics  (48 bytes × up to 250 tiles)
     *   0xD000  hero_transparency_masks (8 bytes × 250 tiles)
     *   0x4000  NPC sprite color data (48 bytes × tiles)
     *   0x7000  NPC sprite transparency masks (8 bytes × tiles)
     * Minimum size: 0xE400 (58368) bytes.
     */
    uint8_t  *seg1;

    /**
     * seg2: second extended segment (code_segment + 0x2000).
     * Contains OR-blit and AND-blit buffers for hero/NPC sprites.
     *   0x6000  or_blit_buffer  (48 bytes × tiles)
     *   0x8000  and_blit_buffer (8 bytes × tiles)
     * Minimum size: 0x8200 bytes.
     */
    uint8_t  *seg2;

    /**
     * proximity_map: 36×64 tile-id map centered on the hero.
     * The renderer reads from proximity_start_tiles onwards.
     * Minimum size: 36 × 10 = 360 bytes (conservatively).
     */
    uint8_t  *proximity_map;

    /**
     * proximity_start_tiles: byte offset within proximity_map[] for the
     * tile-id at the top-left of the 36-column proximity window.
     * Corresponds to ds:0xFF2A in the original.
     */
    uint16_t  proximity_start_tiles;

    /**
     * proximity_map_left_col_x: world x-tile coordinate of the leftmost
     * column of the proximity map.  Used to locate NPCs by world position.
     */
    uint16_t  proximity_map_left_col_x;

    /**
     * viewport_buffer: 28×8 byte array holding the tile-id rendered last
     * frame for each viewport cell.  Used as a dirty-flag: if the current
     * proximity tile id equals the cached value, the cell is skipped.
     * Also receives 0xFE/"rendered" marks and 0xFF/"empty" marks.
     * Must be 28 × 8 = 224 bytes, writable by the renderer.
     * Corresponds to ds:0xE900 in the original (viewport_buffer_28x19).
     */
    uint8_t  *viewport_buffer;

    /**
     * npc_array: pointer to the NPC struct array for the current town.
     * Each NPC is 8 bytes (NPC STRUC in town.inc):
     *   [0-1] n_x           (uint16_t world x tile)
     *   [2]   n_facing      (uint8_t)
     *   [3]   n_head_tile   (uint8_t) — 0xFD = NPC column marker
     *   [4]   n_anim_phase  (uint8_t)
     *   [5]   n_ai_type     (uint8_t)
     *   [6]   n_flags       (uint8_t)
     *   [7]   n_id          (uint8_t)
     * Array is terminated by 0xFFFF in the first word.
     */
    uint8_t  *npc_array;

    /**
     * save: pointer to the game's save-game area (seg:0x0000 in the DOS
     * binary).  The renderer reads only a few bytes:
     *   save[0x83]  hero_x_in_viewport
     *   save[0x82]  viewport_top_row_y  (not used by renderer directly)
     */
    uint8_t  *save;

    /**
     * cache_bytes: 3-byte region written by pre_pass_special_column_initializer
     * to mark the leftmost partial-NPC column as already rendered.
     * Corresponds to ds:cache_bytes_ptr (at ds:0xE005 in the original).
     */
    uint8_t  *cache_bytes;

} zeliard_mem_t;

/* =========================================================================
 * Public API
 * =========================================================================*/

/**
 * render_town_tiles_28_columns
 *
 * Renders the 28-column × 8-row town tile viewport into m->vram.
 *
 * Call once per frame after the proximity map has been updated for the
 * current scroll position.
 *
 * @param m  Pointer to a fully initialised zeliard_mem_t.
 */
void render_town_tiles_28_columns(zeliard_mem_t *m);

#endif /* TOWN_RENDER_H */
