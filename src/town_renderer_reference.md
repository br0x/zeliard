# Zeliard — Town Tile Renderer: Source of Truth

> **Purpose of this document**: Authoritative reference for the rendering logic
> extracted from `gtmcga.asm` (Zeliard DOS graphics driver for towns, MCGA
> mode 13h).  Intended for use as context when prompting an AI model to assist
> with the WebAssembly port.

---

## 1. Hardware and Memory Overview

### 1.1 Video Mode

| Parameter       | Value                        |
|-----------------|------------------------------|
| Mode            | MCGA / VGA Mode 13h          |
| Resolution      | 320 × 200 pixels             |
| Color depth     | 8 bits/pixel (palette index) |
| VRAM segment    | `0xA000`                     |
| VRAM size       | 64 000 bytes (320 × 200)     |
| Bytes per row   | 320                          |
| Pixel address   | `y * 320 + x`                |

### 1.2 Segment Map

The DOS binary loads into multiple 64 KB segments aliased through a single
code-segment base (`CS`).  Offsets shown are relative to the given segment.

| Name   | Base                   | Key contents                                        |
|--------|------------------------|-----------------------------------------------------|
| `seg0` | `CS` (the driver seg)  | Driver code, blit caches, string buffers            |
| `seg1` | `CS + 0x1000`          | Tile graphics, animation tables, transparency masks |
| `seg2` | `CS + 0x2000`          | OR-blit and AND-blit sprite buffers                 |
| `seg3` | `CS + 0x3000`          | Temporary decompression scratch                     |
| VRAM   | `0xA000`               | Visible framebuffer + shadow memory                 |

### 1.3 Shadow Memory

Immediately after the 64 000-byte visible framebuffer in VRAM there is a
"shadow memory" area used as a compositing buffer for NPC sprites.

```
VRAM[0x0000 .. 0xF9FF]  →  visible 320×200 pixels
VRAM[0xFA00 .. ...]     →  shadow memory (vram_shadow_addr = 320*200 = 64000)
```

Within shadow memory, 3-tile vertical blocks are addressed by row:

```
shadow_row_n = vram_shadow_addr + n * 192
```

(Each row = 3 tiles × 8 pixels tall × 8 pixels wide = 3 × 8 × 8 = 192 bytes.)

---

## 2. Tile Format

### 2.1 Dimensions and Storage

Every tile is **8 × 8 pixels**, stored as **48 bytes** in packed form.

Palette entries are **6-bit** (0–63), so 4 pixels fit into 3 bytes:

```
byte0  byte1  byte2
[p3_hi | p2_hi][p1_hi | p0_hi][p3_lo p2_lo p1_lo p0_lo]
  (8 bits)        (8 bits)         (2 bits each)
```

Decode formula (3 bytes → 4 pixels):

```c
uint16_t dx = ((uint16_t)byte1 << 8) | byte0;
uint8_t  bl = byte2, bh = byte0;

dx >>= 2;
pixel0 = (uint8_t)(dx >> 8);      // bits 13-8 of shifted dx
dx >>= 2;
pixel1 = (uint8_t)(dx & 0xFF);

uint16_t bx = ((uint16_t)bh << 8) | bl;
bx <<= 4;
pixel2 = (uint8_t)(bx >> 8) & 0x3F;
pixel3 = byte2 & 0x3F;
```

### 2.2 Tile Graphics Location in seg1

```
seg1[0x8100 + tile_id * 48]  →  48-byte packed tile data
```

Up to 250 tile IDs are used (IDs 0–249).

### 2.3 Transparency Mask (animated / NPC tiles only)

```
seg1[0xD000 + tile_id * 8]   →  8 bytes, one per scanline
```

Each byte is a bitmask: **bit 7 = leftmost pixel**, bit 0 = rightmost.
- `1` → draw sprite pixel
- `0` → show background pixel instead

---

## 3. Viewport Layout

```
 pixel x:    0        48       48+224      48+224+48 = 320
             |  HUD L  |  viewport  |  HUD R   |
 pixel y:    0
             |  top bar (14 px)
             14
             |  top 8 invisible tile rows (sky/mountains, 64 px)
             78        ← rendering starts here for render_town_tiles_28_columns
             |  8 visible tile rows × 8 pixels = 64 px
             142
             |  bottom bar (58 px)
             200
```

- **Viewport origin** (pixel): `(48, 78)` — i.e. `x=48, y=14+8*8=78`
- **Visible tiles**: 28 columns × 8 rows
- **Tile size**: 8 × 8 pixels
- **Viewport pixel area**: 224 × 64 pixels

---

## 4. Proximity Map

The proximity map is a 36-column window into the town tile map, centered
around the hero.  It is updated each frame by the game engine before calling
the renderer.

```
proximity_map[proximity_start_tiles + col * 8 + row]  =  tile_id
```

- Columns 0–35 (36 total), rows 0–7 (8 total)
- The renderer uses columns at offset `+0x20` (32) within this map, covering
  32 bytes ahead of `proximity_start_tiles`.

### 4.1 Special Tile IDs

| ID     | Meaning                                         |
|--------|-------------------------------------------------|
| `0x00` | Empty / transparent — skip rendering this cell  |
| `0xFD` | NPC column marker — triggers NPC compositor     |
| `0xFE` | "Rendered this frame" marker (written by renderer)|
| `0xFF` | "Pre-processed" / skip marker                   |

---

## 5. `render_town_tiles_28_columns` — Algorithm Detail

### 5.1 Initialisation

```
blit_cache[0..255] = 0          // Clear the per-tile VRAM address cache
```

### 5.2 Left-edge Pre-pass (conditional)

```
if proximity_map[proximity_start_tiles + 29] == 0xFD:
    pre_pass_special_column_initializer()
```

Called when the column just outside the left edge of the viewport contains an
NPC (tile 0xFD).  This pre-renders the partially-visible NPC into shadow memory
and copies the result to VRAM rows 13-15 at the left edge.  It also writes
`0xFF` into three `cache_bytes` positions to prevent the main loop from
rendering those cells again.

### 5.3 Main Column Loop (`column_counter` = 0 to 27)

For each column:

#### 5.3.1 Hero Shadow Guard

```
if column_counter == hero_x_in_viewport:
    copy 2×3 tiles from shadow_memory to VRAM at hero screen position
```

The hero sprite is rendered into shadow memory externally (by the movement
system) before this function is called.  The guard copies those shadow tiles
into VRAM at the correct column position so the hero appears over the
background.

Skipped if `column_counter == 27` (rightmost column, no room for 2-column copy).

#### 5.3.2 Per-row Dispatch

For each of the 8 tile rows in the current column, the renderer reads the
tile ID from the proximity map and compares it to the cached value in
`viewport_buffer`.  If they match, the cell is skipped (dirty-flag
optimisation).  Otherwise the tile is written to `viewport_buffer` and
dispatched to one of three renderers:

| Row(s)    | Renderer                              | When used            |
|-----------|---------------------------------------|----------------------|
| 0, 1, 2   | `tile_render_and_animate`             | May have animation   |
| 3, 4, 6, 7| `background_tile_render_with_blit_cache` | Plain background  |
| 5         | `special_tile_dispatcher`             | May be NPC column    |

#### 5.3.3 Advance

After all 8 rows of a column are rendered:

```
current_column_screen_addr += 8   // next column 8 pixels to the right
column_counter++
```

---

## 6. Sub-function Reference

### 6.1 `background_tile_render_with_blit_cache`

**Purpose**: Decode and draw a background tile; use the blit cache to avoid
repeated decoding.

**Input state**:
- `si[-1]`  — tile id (from proximity map, consumed by `cmpsb`)
- `di[-1]`  — previous frame's viewport buffer byte
- `bl`      — current row index (0-7)
- `current_column_screen_addr` — VRAM x-pixel of current column

**Algorithm**:
1. Read `viewport_buffer` byte (was written `0xFE` before call).  
   `vp_byte++`: if result is 0, the tile id was `0xFF` → return immediately.
2. Compute destination VRAM offset:  
   `dst = y_row * 320 + current_column_screen_addr`  
   where `y_row = 320 * (row * 8)`.
3. Look up `blit_cache[tile_id]`:
   - **Miss** (zero): set `blit_cache[tile_id] = dst`, then decode 48-byte
     packed tile to VRAM at `dst` (see §2.2 decode formula).
   - **Hit** (non-zero): copy 8 scanlines × 8 bytes from the cached VRAM
     address to `dst` (simple `memcpy` per scanline with stride 320).

**Output**: 64 bytes written to VRAM (8×8 pixels).

---

### 6.2 `tile_render_and_animate`

**Purpose**: Render a tile that *might* be animated (top 3 rows of the
viewport — flags, signs, etc.).

**Algorithm**:
1. Same initial skip check as `background_tile_render_with_blit_cache`.
2. Look up `seg1[tile_anim_count_table + tile_id]` (the animation frame
   count for this tile).
   - If **0** → delegate to `background_tile_render_with_blit_cache` (no
     animation, use cache).
   - If **> 0** → render with transparency mask (see below).
3. **Masked render** (animated tile):
   - `mask` = `seg1[0xD000 + tile_id * 8]` (8 bytes, one per scanline)
   - `packed` = `seg1[0x8100 + tile_id * 48]`
   - `bg_base` = VRAM address of the background at this column/row  
     (computed as `column_counter * 192 + row * 64 + VRAM base`)
   - For each of the 8 scanlines:
     - Read 1 mask byte (8 bits).
     - Decode 8 pixels from 6 packed bytes.
     - For each pixel, check the corresponding mask bit:  
       `1` → use decoded sprite pixel; `0` → use background pixel from VRAM.
     - Write 8 resulting pixels to VRAM.
4. **Animation advancement** (after rendering):
   - Read the viewport buffer byte (the tile id now stored there, range 1-24).
   - If in range [1, 24], look up in `tile_animation_replacement_table`
     (at `seg1[seg1[0x8004]]`): a counted list of `(old_id, new_id)` pairs
     terminated by `0xFF`.
   - If found, replace the tile id in the proximity map with `new_id`,
     advancing the animation one frame for the next render call.

---

### 6.3 `special_tile_dispatcher`

**Purpose**: Route row-5 tiles to the appropriate renderer.

```
if tile_id == 0xFD:
    special_multi_tile_column_renderer()
else:
    background_tile_render_with_blit_cache()
```

---

### 6.4 `special_multi_tile_column_renderer`

**Purpose**: Composite one or two NPC sprites into VRAM when the current
column contains the NPC marker tile `0xFD` at row 5.

**Full algorithm**:

1. **Read 5 tile slots** from the proximity map (the NPC "slot" spans rows
   5-7 of the current column and rows 0-1 of the next column):
   ```
   slot[0..1] = proximity_map[col * 8 + 5 .. +6]
   slot[2..4] = proximity_map[col * 8 + 12 .. +14]   (next column, rows 4-6)
   ```
   Copy to `tile_id_staging_buffer[0..4]`.

2. **Set sprite_x_coord**:
   ```
   sprite_x_coord = column_counter + 4 + proximity_map_left_col_x
   ```

3. **Resolve tile IDs** (0xFD is a placeholder; look up real tile in NPC table):
   ```
   tile_id_staging_buffer[0] = sprite_descriptor_table_scanner(sprite_x_coord)
   if tile_id_staging_buffer[2] == 0xFD:
       sprite_x_coord++
       tile_id_staging_buffer[2] = sprite_descriptor_table_scanner(sprite_x_coord)
   ```

4. **Unpack 6 background tiles** to shadow memory rows 2 and 3:
   ```
   for each of 6 tiles:
       unpack_tile_to_shadow(tile_id, shadow_base + 192*2 + tile_index * 64)
   ```
   (This refreshes the background behind the NPC area.)

5. **Composite NPC sprites** onto shadow memory:
   For each NPC in `npc_array` (until `n_x == 0xFFFF`):
   ```
   bl = sprite_x_coordinate_lookup(npc)   // 0=no match, 1=left col, 2=right col
   if bl != 0:
       di = get_sprite_vram_address(npc)   // offset in seg1 NPC sprite data
       sprite_compositor_dispatcher(bl, di)
   ```

6. **Copy shadow to VRAM**:
   - Copy shadow row 2 (3 tiles) to VRAM at `current_column_screen_addr + row5_y`.
   - If `column_counter != 27`, copy shadow row 3 to VRAM at `+8` pixels right.

7. **Mark viewport buffer** bytes as `0xFF` (processed) for affected cells.

---

### 6.5 `pre_pass_special_column_initializer`

**Purpose**: Pre-render the NPC that overhangs the left edge of the viewport
(the column immediately left of column 0).

Called once before the main loop when `proximity_map[29] == 0xFD`.

**Algorithm**:
1. Read 3 tile IDs from `proximity_map[proximity_start_tiles + 37]`.
2. `sprite_x_coord = proximity_map_left_col_x + 3`.
3. If `tile_id_staging_buffer[0] == 0xFD`, resolve via `sprite_descriptor_table_scanner`.
4. Unpack 3 tiles to `shadow_row_2`.
5. Walk NPC array; for each matching NPC, composite with partial x offset
   `3 * (bl - 1)` pixels.
6. Copy shadow to VRAM at `(48, 14 + 13*8)` (left edge, row 13).
7. Write `0xFF` to `cache_bytes[0..2]`.

---

### 6.6 `hero_column_shadow_blitter_guard`

**Purpose**: Copy the pre-composited hero shadow tiles from shadow memory to
VRAM at the hero's viewport column.

**Conditions to skip**:
- `column_counter == 27` (last column, out of bounds)
- `column_counter != hero_x_in_viewport`

**When triggered**: Copies 2 × 3 vertical tiles (2 columns, 3 tile rows = 24
scanlines each) from `shadow_memory[0]` to VRAM at:
```
x = VIEWPORT_X + hero_x * 8
y = VIEWPORT_Y + 13 * 8   (= pixel row 118)
```

---

### 6.7 `sprite_descriptor_table_scanner`

**Purpose**: Resolve a `0xFD` NPC tile placeholder to a real tile ID by
scanning the NPC array.

**Algorithm**:
1. Start at `npc_array[0]`.
2. While `npc[3] == 0xFD` (another placeholder):  
   advance 8 bytes; then advance until `npc.n_x == dx`.
3. Return `npc[3]` (the resolved tile id).

---

### 6.8 `sprite_x_coordinate_lookup`

**Purpose**: Check whether an NPC's world x position matches `sprite_x_coord`
or `sprite_x_coord + 1` (accounting for 2-column-wide NPCs).

**Returns**: `bl = 2` if `npc.n_x == sprite_x_coord`, `bl = 1` if
`npc.n_x == sprite_x_coord + 1`, `bl = 0` if no match.

---

### 6.9 `get_sprite_vram_address`

**Purpose**: Compute the byte offset within seg1's NPC sprite data for the
current animation frame of an NPC.

**Formula**:
```
frame  = npc[2] & 0x7F          // strip facing-left flag
base   = frame * 48 + 0x4000   // NPC sprite color data in seg1
dl     = (npc[2] & 0x80) ? 0 : 4   // facing-right offset
sub    = (npc[4] & 3) * 6      // sub-frame (4 possible: 0-3)
di     = base + dl + sub
```

---

### 6.10 `npc_3_tiles_to_shadow_buffer`

**Purpose**: Blit 3 NPC tiles (one vertical strip) into shadow VRAM using
AND-then-OR transparency compositing.

**For each of 3 tiles**:
1. Mark `tile_id_staging_buffer[t] = 0xFF`.
2. Read tile index `k` from `seg1[0x4100 + t]`; if 0, skip.
3. `k--`
4. `color_src = seg1[0x4100 + k * 48]`
5. `mask_src  = seg1[0x7000 + k * 8]`
6. Call `blit_tile_to_shadow_buffer(color_src, mask_src, shadow_dst + t * 64)`.

---

### 6.11 `blit_tile_to_shadow_buffer`

**Purpose**: Two-pass AND/OR blit of one 8×8 NPC tile into shadow VRAM.

**Pass 1 — AND clear**:
```
for each scanline (8):
    mask_byte = mask_src[scanline]
    for each pixel (8):
        if bit7 of mask_byte == 0:
            shadow_vram[pixel] = 0   // clear background
        mask_byte <<= 1
```

**Pass 2 — OR write**:
```
Decode the 48-byte packed tile (see §2.2) and OR each decoded byte into
shadow VRAM.
```

---

### 6.12 `copy_3_vert_tiles`

**Purpose**: Copy 3 vertically stacked 8×8 tiles (24 scanlines × 8 bytes)
from one VRAM location to another, respecting the 320-byte stride.

```c
for (int row = 0; row < 24; row++) {
    memcpy(vram + dst, vram + src, 8);
    dst += 320;
    src += 320;
}
```

---

## 7. Blit Cache

`blit_cache[256]` is a 256-word table (one entry per tile ID).

- **0x0000** = tile not yet drawn this frame.
- **Non-zero** = VRAM byte offset where this tile was first drawn.

On the first draw of a given tile ID, the decoder writes 64 pixels to VRAM
and records the destination address in the cache.

On subsequent draws of the same tile ID, the renderer performs a scanline
`memcpy` from the cached VRAM location to the new destination (avoiding
re-decoding).

The cache is **cleared at the start of every frame** (`memset(blit_cache, 0, 512)`).

---

## 8. Viewport Buffer (Dirty-flag System)

`viewport_buffer[28 * 8]` stores the tile IDs rendered last frame for each
viewport cell.

Before calling a tile renderer:
```
current_tile = proximity_map[col * 8 + row]
cached_tile  = viewport_buffer[col * 8 + row]
if current_tile == cached_tile: skip (tile unchanged)
viewport_buffer[col * 8 + row] = 0xFE   // mark "being processed"
```

Special values stored in viewport buffer:
| Value  | Meaning                                          |
|--------|--------------------------------------------------|
| `0xFF` | Empty / pre-processed; skip unconditionally      |
| `0xFE` | "Rendered this frame"; set by renderer itself    |
| `0x00` | Zero tile id (empty tile); renderer exits early  |
| `1-24` | Tile id in animation range; checked for replacement |

---

## 9. Animation System

### 9.1 Tile Animation Count Table

Located at `seg1[tile_anim_count_table_ptr]` (the pointer is at `seg1[0x8000]`).

One byte per tile ID:
- `0` = not animated (use background renderer)
- `N > 0` = N animation frames; use masked animated renderer

### 9.2 Tile Animation Replacement Table

Located at `seg1[tile_animation_replacement_table_ptr]` (pointer at `seg1[0x8004]`).

Format:
```
[count_byte] [old_id, new_id] [old_id, new_id] ... [0xFF]
```

After rendering an animated tile whose viewport buffer byte is in range [1,24],
the renderer looks up `old_id` in this table.  On a match, `new_id` replaces
the tile ID in the proximity map for the *next* frame, advancing the animation.

Animation cycles through tile IDs: `A → B → C → A → ...`

---

## 10. NPC Sprite System

### 10.1 NPC Struct (8 bytes)

```c
struct NPC {
    uint16_t n_x;           // World x tile coordinate
    uint8_t  n_facing;      // Facing direction
    uint8_t  n_head_tile;   // Tile ID (0xFD = NPC column marker)
    uint8_t  n_anim_phase;  // Current animation sub-frame (bits 1-0)
    uint8_t  n_ai_type;
    uint8_t  n_flags;
    uint8_t  n_id;
};
```

Array is terminated by `n_x == 0xFFFF`.

### 10.2 NPC Sprite Data in seg1

```
seg1[0x4000 + frame * 48]      // NPC color data (same 6-bpp packed format)
seg1[0x7000 + frame * 8]       // NPC transparency mask (8 bytes)
```

### 10.3 NPC Column Detection

Row 5 of a viewport column holds `0xFD` when an NPC occupies that column.
NPCs are 2 tiles wide (16 pixels) × 3 tiles tall (24 pixels), centered on row
5 (spans rows 5-7 vertically).

When `0xFD` is detected, the compositor:
1. Fills shadow memory with the background tiles behind the NPC.
2. Composites the NPC sprite over those tiles using the AND/OR blit.
3. Copies the composited shadow region to VRAM.

---

## 11. Coordinate Reference Table

| Name                       | Value / Formula                          | Notes                         |
|----------------------------|------------------------------------------|-------------------------------|
| VRAM offset formula        | `y * 320 + x`                            | Linear, no bank switching     |
| Viewport left pixel        | `48`                                     |                               |
| Viewport top pixel         | `14 + 8*8 = 78`                          | Skip 8 sky tile rows          |
| Tile size                  | `8 × 8` pixels                           |                               |
| Tile packed size           | `48` bytes                               |                               |
| Tile unpacked size         | `64` bytes (1 byte per pixel)            |                               |
| Shadow memory base         | `64000` (= `320 * 200`)                  |                               |
| Shadow row size            | `192` bytes (3 tiles × 8 × 8)            |                               |
| Blit cache size            | `256` words                              |                               |
| Viewport buffer size       | `28 * 8 = 224` bytes                     |                               |
| Hero shadow rows           | Rows 13-15 (y pixel 118-141)             |                               |
| NPC sprite width           | 2 tiles (16 pixels)                      |                               |
| NPC sprite height          | 3 tiles (24 pixels)                      |                               |
| Packed tile base in seg1   | `0x8100`                                 |                               |
| Transparency masks in seg1 | `0xD000`                                 |                               |
| NPC colors in seg1         | `0x4100`                                 |                               |
| NPC masks in seg1          | `0x7000`                                 |                               |

---

## 12. Porting Checklist

When porting to WebAssembly/JavaScript:

- [ ] Allocate flat linear memory for VRAM (64 000 + shadow area ≥ 65 000 bytes).
- [ ] Allocate seg1 (≥ 58 368 bytes), seg2 (≥ 33 280 bytes).
- [ ] Load packed tile graphics into `seg1[0x8100..]`.
- [ ] Build `tile_anim_count_table` and `tile_animation_replacement_table` in seg1.
- [ ] Populate `hero_transparency_masks` at `seg1[0xD000..]`.
- [ ] Maintain a 224-byte `viewport_buffer` (zero-init at level load, persist between frames).
- [ ] Maintain a 512-byte `blit_cache` (zero at start of each `render_town_tiles_28_columns` call).
- [ ] Keep `proximity_map` and `proximity_start_tiles` updated by the scroll/movement system before calling the renderer.
- [ ] Implement palette lookup separately: the renderer writes 6-bit palette indices; the display layer maps those to RGB.
- [ ] The renderer does **not** clear VRAM before drawing; only modified cells are repainted.

---

*End of document.*
