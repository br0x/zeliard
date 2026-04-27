# Zeliard Dungeon Engine & Monster AI Porting Plan

## Project Goal

Port `WORK/Fight.asm` (dungeon engine) and `WORK/eai1.asm` (monster AI) from x86 assembly to C, compile to WebAssembly, and integrate with existing JavaScript rendering. The goal is to preserve **exact original physics and AI behavior** while replacing sprite graphics with text characters and skipping music. Also, all memory regions from original assembly should be preserved - saved data area at 0x0000-0x00FF, global data area 0x9A1E-0x9fff, MDT buffer at 0xc000-0xdfff, proximity map at 0xe000-0xe8ff, viewport buffer at 0xe900-0xeb13, all variables in range 0xeb14-0xeb7f, slots array at 0xeb80-0xed1f, and all memory from 0xed20-0xffff.
Any variable needed for implementation, should be outside of the above memory regions. Since webassembly has linear memory, it is no problem to use any memory region outside of the above ranges.

**Date Created:** March 20, 2026
**Last Updated:** March 26, 2026 (Dungeon initialization system FULLY IMPLEMENTED - prepare_dungeon complete!)
**Source Files:**
- `WORK/Fight.asm` (~10,600 lines) - Disassembled dungeon module
- `WORK/eai1.asm` (~1,200 lines) - Monster AI module
- `WORK/crab.asm` (~2KB) - Cangrejo boss AI
- `WORK/stick.asm` - Resource loading (MDT files)

---

## Current Status

### Completed (March 23, 2026)

**Monster AI System - FULLY IMPLEMENTED** ✅

The complete monster AI system from `WORK/eai1.asm` has been ported to C:

| File | Status | Description |
|------|--------|-------------|
| `src/monster_ai.c` | ✅ Complete | Full port of eai1.asm (~960 lines) |
| `src/zeliard.h` | ✅ Updated | Added Monster AI API declarations |
| `build.sh` | ✅ Updated | Exports Monster_AI and update_all_monsters_in_map |
| `src/Makefile` | ✅ Updated | Uses clang --target=wasm32 (no emscripten) |

**Monster AI Features Implemented:**
- ✅ AI Type 0 (Guard) - Stationary guards with vertical chase
- ✅ AI Type 1 (Patrol) - South movement + horizontal chase
- ✅ AI Type 2 (Chase) - Horizontal pursuit with animation
- ✅ AI Type 3 (Complex) - Multi-phase state machine
- ✅ 8-directional monster movement
- ✅ All animation frame tables preserved
- ✅ Monster collision checking (two rows below)
- ✅ Hero proximity detection
- ✅ Combat damage handling (hero hits monster)

**Collision Detection System - FULLY IMPLEMENTED** ✅

The complete 8-directional collision detection system from `WORK/Fight.asm` has been ported to C:

| File | Status | Description |
|------|--------|-------------|
| `src/collision.c` | ✅ Complete | 8-directional collision + tile passability (~700 lines) |
| `src/zeliard.h` | ✅ Updated | Added collision detection API declarations |
| `build.sh` | ✅ Updated | Exports all collision functions to WASM |

**Collision Detection Features Implemented:**
- ✅ Tile passability lookup (`if_passable_set_ZF`)
- ✅ 8-directional collision checks (E2, W2, N2, S2, NE2, SE2, NW2, SW2)
- ✅ Proximity map boundary wrapping
- ✅ MonsterEntry wrapper functions for monster AI integration
- ✅ Danger type handling for special hazards
- ✅ Monster AI now uses real collision detection

**Hero Physics System - FULLY IMPLEMENTED** ✅

The hero physics system from `WORK/Fight.asm` (sub_64BB, sub_6DB1) has been ported to C:

| File | Status | Description |
|------|--------|-------------|
| `src/physics.c` | ✅ Complete | Jump & rope physics (~620 lines) |
| `src/zeliard.h` | ✅ Updated | Added physics API declarations |
| `build.sh` | ✅ Updated | Exports physics functions to WASM |

**Hero Physics Features Implemented:**
- ✅ Jump trajectory calculation (`sub_64BB`)
- ✅ Rope climbing physics (`sub_6DB1`)
- ✅ Jump state management (ascending, descending, on ground)
- ✅ Rope state management (on rope, transition, on ground)
- ✅ Slippery surface detection (ice with Ruzeria Shoes check)
- ✅ Tile type helpers (rope, ladder, walkable)
- ✅ State accessors for JavaScript integration

**Input Handling System - FULLY IMPLEMENTED** ✅

The input handling system has been ported to work with JavaScript keyboard events:

| File | Status | Description |
|------|--------|-------------|
| `src/input.c` | ✅ Complete | Input buffer & state management (~130 lines) |
| `src/zeliard.h` | ✅ Updated | Added InputFlags enum and InputBuffer struct |
| `build.sh` | ✅ Updated | Exports all input functions to WASM |
| `src/zeliard-wasm.js` | ✅ Updated | JavaScript input API |
| `game.js` | ✅ Updated | Keyboard event handling |

**Input Handling Features Implemented:**
- ✅ Input buffer at 0xFF16-0xFF19 (4 bytes in WASM memory)
- ✅ Bitmask-based key state (UP, DOWN, LEFT, RIGHT, ENTER, SPACE, ALT, ESC)
- ✅ Edge-triggered input detection (pressed/released this frame)
- ✅ Level-triggered input detection (key held down)
- ✅ JavaScript → WASM input bridge
- ✅ WASD and Arrow key support

**Dungeon Object Rendering - FULLY IMPLEMENTED** ✅

Configurable ASCII rendering system for dungeon objects:

| File | Status | Description |
|------|--------|-------------|
| `src/render-config.js` | ✅ Complete | Rendering configuration (~150 lines) |
| `src/render-objects.js` | ✅ Complete | Object rendering functions (~300 lines) |
| `game.js` | ✅ Updated | Integrated dungeon object rendering |

**Dungeon Object Rendering Features:**
- ✅ Doors rendering with configurable ASCII char and color
- ✅ Vertical platforms rendering
- ✅ Horizontal platforms rendering (spanning minX to maxX)
- ✅ Air streams / objects rendering
- ✅ Items rendering (placeholder for item types)
- ✅ Monsters rendering with AI-type-based styling
- ✅ Monster state rendering (hit flash, dying)
- ✅ Hero rendering with direction-based characters
- ✅ All colors and ASCII chars customizable via RENDER_CONFIG
- ✅ Press Start 2P font support

**Hero Movement State Machine - FULLY IMPLEMENTED** ✅

Exact port of Fight.asm 0x6343 state_machine_dispatcher and all sub-functions:

| File | Status | Description |
|------|--------|-------------|
| `src/hero_movement.c` | ✅ Complete | Exact 0x6343 port (~860 lines) |
| `src/zeliard.h` | ✅ Updated | Added state_machine_dispatcher API |
| `build.sh` | ✅ Updated | Exports state_machine_dispatcher |
| `src/zeliard-wasm.js` | ✅ Updated | JavaScript hero movement API |
| `game.js` | ✅ Updated | Integrated hero movement update |

**Implemented Functions (exact Fight.asm ports):**
- ✅ `state_machine_dispatcher` (0x6343) - Main input dispatcher
- ✅ `sub_6508` (0x6508) - Direction change logic
- ✅ `sub_6545` (0x6545) - Jump initiation helper
- ✅ `up_pressed` (0x6537) - Jump handling
- ✅ `down_pressed` (0x6AC9) - Squat/climb down handling
- ✅ `left_up_pressed` (0x6634) - Diagonal jump left
- ✅ `right_up_pressed` (0x67BC) - Diagonal jump right
- ✅ `loc_663E` (0x663E) - Hero moves right
- ✅ `loc_67C6` (0x67C6) - Hero moves left
- ✅ `sub_6824` (0x6824) - Direction toggle
- ✅ `sub_66A5` (0x66A5) - Collision check for left movement
- ✅ `sub_67A3` (0x67A3) - Danger type check
- ✅ `sub_6B2E` (0x6B2E) - Move hero and viewport down
- ✅ `sub_684C` (0x684C) - Hero moves right with collision & map scrolling ✅ **FULL**
- ✅ `sub_6942` (0x6942) - Danger type and category check
- ✅ `sub_6E1B` (0x6E1B) - Tile table check
- ✅ `get_category` (0x76F6) - Tile categorization (exact: all 12 bytes zero in MPP1.GRP)
- ✅ `is_non_blocking_tile` (0x6DE5) - Tile passability check
- ✅ `unpack_step_backward` - RLE decode going backwards in packed data
- ✅ `get_map_width` - Read map width from MDT header
- ✅ `get_packed_map_start` - Read packed map start offset
- ✅ `hero_moves_left` (0x66F8) - Hero moves left with wraparound
- ✅ Map wraparound at boundaries - Uses packed_map_end_ptr for efficient wrap (no re-unpack)
- ✅ `get_dst_monster_flags` - Read monster flags from proximity map
- ✅ `update_monsters_for_right_scroll` (0x6915-0x693D) - Update monster positions when scrolling left
- ✅ `update_monsters_for_left_scroll` (0x677A-0x67A1) - Update monster positions when scrolling right
- ✅ `sub_7FDC` - Check vertical distance for platform
- ✅ `move_platform_up` (0x8074) - Move vertical platform up
- ✅ `move_platform_down` (0x8024) - Move vertical platform down
- ✅ `update_horizontal_platforms` (0x81AE) - Update all horizontal platforms
- ✅ `update_horiz_platform_coords` (0x8252) - Move single horizontal platform
- ✅ `hero_on_horizontal_platform` (sub_82B4) - Check if hero is on platform
- ✅ `hero_interaction_check` (0x63DA) - Check for door/item interactions
- ✅ `sub_65C5` (0x65C5) - Climb to rope from ground
- ✅ `Hero_Hits_monster` (0x97B5) - Deal damage to monster
- ✅ `Get_Stats` (0x9851) - Get hero combat stats (level, sword damage)
- ✅ `process_monster_death` (sub_96C1) - Award XP on monster death
- ✅ `add_xp` (sub_9715) - Add XP with overflow handling
- ✅ `award_almas` (0x8FC3-0x8FE5) - Award almas based on proximity/probability
- ✅ `check_almas_drop` (sub_9190) - Check if almas should drop (proximity + counter)

**Implemented Features:**
- ✅ DOS interrupt 61h input handling (replaced with WASM input buffer)
- ✅ Exact state machine flow matching original
- ✅ Direction changes with proper state tracking
- ✅ Jump initiation with Feruza Shoes height
- ✅ Rope transition handling
- ✅ Squat mode bit handling
- ✅ byte_9F20, byte_9F21, byte_9F22, byte_9F23, byte_9F24 state tracking
- ✅ byte_E7 flag setting
- ✅ byte_FF38 rope transition flag
- ✅ Collision-aware movement (uses 8-directional collision)
- ✅ Map scrolling on hero movement

**Remaining Stubs:**
- (None - all major systems implemented!)

**Implemented Systems Summary:**
- ✅ Input handling with WASM input buffer
- ✅ Hero movement state machine (Fight.asm 0x6343)
- ✅ Hero physics (jump, rope)
- ✅ Collision detection (8 directions)
- ✅ Monster AI (all 4 types)
- ✅ Monster interaction during movement
- ✅ Map scrolling with efficient column unpacking
- ✅ Map wraparound at boundaries
- ✅ Vertical platform movement (up/down)
- ✅ Horizontal platform movement (back/forth with speed control)
- ✅ Hero interaction check (doors/items)
- ✅ Hero-monster combat (damage, death, XP rewards, almas drops)
- ✅ Boss battle system (Cangrejo AI, minion spawn, health bar, defeat handling)

**Dungeon Initialization System - FULLY IMPLEMENTED** ✅

Complete port of Fight.asm `prepare_dungeon` (0x79DC) and related initialization functions:

| File | Status | Description |
|------|--------|-------------|
| `src/fight.c` | ✅ Complete | Dungeon initialization (~400 lines) |
| `src/zeliard.h` | ✅ Updated | Added prepare_dungeon API declarations |
| `build.sh` | ✅ Updated | Exports prepare_dungeon, wasm_init_cavern_with_prepare |

**Implemented Functions (exact Fight.asm ports):**
- ✅ `prepare_dungeon` (0x79DC) - Main dungeon initialization entry point
- ✅ `sub_7E5B` (0x7E5B) - Clear state flags and initialize
- ✅ `process_mdt_header` (0x7E93) - Process MDT header and detect boss caverns
- ✅ `remove_accomplished_items` (0x6BFC) - Remove collected items from map
- ✅ `clear_viewport_buffer` - Clear viewport buffer at 0xE900-0xEB13
- ✅ `wasm_init_cavern_with_prepare` - Alternative entry point with spawn params

**Dungeon Initialization Features:**
- ✅ Clear memory region 0x9EED-0x9F2D (64 bytes)
- ✅ Initialize state flags (FF3C, FF38, FF36, FF3E, FF4B, etc.)
- ✅ Reset jump_phase_flags and on_rope_flags to ground state
- ✅ Clear viewport buffer (0xE900-0xEB13)
- ✅ Process MDT header flags:
  - Bit 0: Special transition flag
  - Bit 1: Boss cavern detection (sets byte_FF34)
  - Bit 2: Fade effect flag (sets byte_E6)
- ✅ Set byte_C8 from MDT header (cavern index)
- ✅ Handle accomplished items removal:
  - Check save data flags against mask table
  - Copy removal markers to map data addresses
  - Properly skip entries when conditions not met
- ✅ Set hero spawn position based on entry direction
- ✅ Unpack map data into proximity map centered on hero
- ✅ Initialize all monsters in the map
- ✅ Clear input flags for new dungeon session

**remove_accomplished_items Implementation:**
```
Table Entry Structure (from MDT items_check_offset):
  dw check_address    - Address in save data to check
  db mask             - Bitmask to apply
  ; Followed by (dest_addr, value) pairs until 0xFFFF:
  dw dest_addr1
  dw value1
  dw dest_addr2
  dw value2
  ...
  dw 0xFFFF           ; End of this entry

Algorithm:
1. Read check_address from table
2. If 0xFFFF → end of table, return
3. Read mask byte after address
4. If (mask & memory[check_address]) != 0:
   - Copy each (dest_addr, value) pair
5. Else:
   - Skip all pairs until 0xFFFF
6. Move to next entry and repeat
```

**Example Usage:**
- If `Cangrejo_Defeated` (0x0000) is set → marks boss door as open
- If "Chest 50 Golds" collected → removes chest from map
- If "Door to Cangrejo open" → updates door state
- If "Muralla Key 1" taken → removes key from map

**Previously Completed:**
- ✅ WASM module initialization (`src/data.c`)
- ✅ MDT file loading into WASM memory at 0xC000
- ✅ MDT header parsing (offsets for platforms, doors, monsters, cavern name)
- ✅ Cavern name extraction from MDT (Pascal string at offset+3)
- ✅ `unpack_map()` function for proximity map generation centered on hero
- ✅ Monster buffer initialization (0xE900)
- ✅ Cavern_Game_Init entry point
- ✅ Collision detection (8 directions) - Full tile passability system

---

## Boss Battle System (Implemented)

**File:** `src/boss_ai.c` (~514 lines)

Complete boss battle system ported from `WORK/crab.asm` and `WORK/Fight.asm`:

| Component | Status | Description |
|-----------|--------|-------------|
| Boss MDT loading | ✅ Complete | Via MDT header bit 1 detection |
| Boss detection | ✅ Complete | byte_FF34 flag handling |
| Boss health bar | ✅ Ready | get_boss_hp(), get_boss_max_hp() |
| Cangrejo AI | ✅ Complete | Full state machine ported |
| Minion spawning | ✅ Complete | 6x10 grid with pattern tables |
| Boss defeat | ✅ Complete | Sets Cangrejo_Defeated flag |

### Boss MDT Files

Boss arenas are stored in separate MDT files:

| File | Boss | Index |
|------|------|-------|
| `MP1D.MDT` | Cangrejo | 1 |
| `MP2D.MDT` | Pulpo | 4 |
| `MP3D.MDT` | Pollo | 7 |
| `MP4D.MDT` | Boss 4 | 10 |
| `MP5D.MDT` | Boss 5 | 13 |
| `MP6D.MDT` | Boss 6 | 16 |
| `MP7D.MDT` | Boss 7 | 19 |
| `MP8D.MDT` | Boss 8 | 22 |

### Boss Detection

**MDT Header Byte (offset 0):**
- Bit 0: Special transition flag
- **Bit 1: Boss flag** → sets `byte_FF34 = 0xFF`
- Bit 2: Fade flag → sets `byte_E6 = 0xFF`

**Examples:**
- `MP10.MDT`: 0x29 = 001010**01** (regular cavern)
- `MP1D.MDT`: 0x0A = 000010**10** (boss cavern!)

### Boss Loading Mechanism

**`archive_seek_prep`** (stick.asm 1541):
```asm
; AH = cavern index (byte_C8)
mov     cl, 11          ; Each entry = 11 bytes
mul     cl              ; AL * 11
add     ax, offset mp10_id  ; Index into MDT table
; Load MDT file to 0xC000
```

**MDT Table** (stick.asm 2351):
```asm
mp10_id         dw 1502h
aMp10Mdt        db 'MP10.MDT',0  ; Regular cavern
                dw 1602h
aMp1dMdt        db 'MP1D.MDT',0  ; BOSS cavern!
```

### Boss Battle Flow

```
1. Set byte_C8 = boss index (1, 4, 7, etc.)
   ↓
2. archive_seek_prep loads MPxD.MDT
   ↓
3. Check MDT header bit 1
   ↓
4. If set: byte_FF34 = 0xFF (boss mode)
   ↓
5. Cavern_Game_Init:
   - render_hid_bars_with_enemy()
   - Draw_Boss_Max_Health_proc()
   - Draw_Boss_Health_proc()
   - Hero spawns at x=5 (edge, not center)
   ↓
6. Boss AI runs (crab.asm for Cangrejo)
   ↓
7. Boss HP reaches 0:
   - boss_being_hit = 0xFF (defeat flag)
   - Cangrejo_Defeated = 0xFFFF
```

### Cangrejo Boss AI (crab.asm)

**Boss State Variables:**

| Address | Variable | Initial | Purpose |
|---------|----------|---------|---------|
| `word_A7C3` | Boss X | 0x2B (43) | Horizontal position |
| `byte_A7C5` | Boss Y | 0x0C (12) | Vertical position |
| `word_A7C6` | Boss HP | 0x96 (150) | Health points |
| `byte_A7DE` | State | 0 | AI state (0-9) |
| `byte_A7E0` | Direction | 0 | 0=right, 0xFF=left |
| `byte_A7ED` | Hit counter | 0 | Counts hits (0-40) |

**AI States:**
- **States 0-5**: Movement (left/right patrol)
- **States 6-8**: Attack pattern
- **State 9**: Minion spawning

**Minion Spawn Patterns:**
```asm
byte_A5B6: 80h, 80h, 80h, 80h, 80h, 81h, 82h, 3, 4, 0FFh
byte_A5F9: 0F1h, 0F1h, 0F1h, 0F1h, 0F1h, 0F8h, 0F8h, 0F8h, 0F2h...
```

**Spawn Grid:** 6x10 = 60 potential minion positions

### Boss Defeat Handling

**Save Data Flags:**
```c
uint16_t Cangrejo_Defeated;  // 0x0000: 0000=alive, FFFF=defeated
uint16_t Pulpo_Defeated;     // 0x0008
uint16_t Pollo_Defeated;     // 0x0010
// ... (8 bosses total)
```

**Defeat Sequence:**
```asm
sub_A796:  ; Boss damage handler
    sub     word_A7C6, bx     ; Subtract damage from HP
    call    Draw_Boss_Health_proc
    jz      loc_A7B0          ; HP = 0?
    retn

loc_A7B0:
    mov     boss_being_hit, 0FFh   ; Set defeat flag
    ; Fight.asm sets Cangrejo_Defeated = 0xFFFF
```

---

## 1. Architecture Overview

### 1.1 Original Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    DOS Executable                           │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│   DATA      │   stick     │   gfmcga    │      fight        │
│  (globals)  │  (input)    │ (graphics)  │  (dungeon logic)  │
│  0x0000     │  0x0100     │  0x3000     │     0x6000        │
├─────────────┴─────────────┴─────────────┴───────────────────┤
│                    Monster AI (eai1)                        │
│                        0xA000                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Memory Layout (Detailed)

```
Memory Map:
─────────────────────────────────────────────────────────────
0x0000-0x00FF (256 bytes) - Global State / Save Data
  Copy of saved game file (xxx.sav)
  Layout must match Fight.asm DATA segment exactly

0xC000-0xDFFF - MDT Dungeon Data (loaded from *.mdt files)
  Example: Cavern Malicia (MP10.MDT)
  
  Offset  | Content                    | Size     | Stop Marker
  ────────┼────────────────────────────┼──────────┼────────────
  0xC004  | Vertical platforms         | 3 bytes  | 0xFFFF
  0xC006  | Air streams/objects        | 3 bytes  | 0xFFFF
  0xC008  | Horizontal platforms       | 7 bytes  | 0xFFFF
  0xC00A  | Doors                      | 12 bytes | 0xFFFF
  0xC00C  | Items check data           | variable | 0xFFFF
  0xC00E  | Cavern name rendering info | variable | -
  0xC010  | Monsters                   | 16 bytes | 0xFFFF
          | (some use 2 records)       |          |

0xE000-0xE8FF (2304 bytes) - Proximity Map
  - 36 columns × 64 rows
  - Centered on hero's X coordinate
  - Scrolls as hero moves (1 column at a time)
  - Missing columns unpacked from MDT file
  - Full cavern maps vary in width (e.g., Cavern Malicia = 240 columns)
  - Height is always 64 rows

0xE900-0xEB13 (28*19 bytes) - Viewport Buffer 28 columns × 19 rows
  - 1 byte per object (monster ID/type etc)

0xFF16-0xFF19 (4 bytes) - Input Buffer:
0xFF16 (1 byte) holds Alt and Spacebar pressed states
0xFF17 (1 byte) holds arrows keys pressed states
0xFF18 (2 bytes) holds pressed states for keys F9, F7, F2, F1, K, R, E, J, S, N, Y, Q, Esc, Ctrl, Shift, Enter

WASM Memory Layout (same offsets for compatibility):
─────────────────────────────────────────────────────────────
0x0000-0x00FF: SaveData struct (g_save_data)
0xC000-0xDFFF: MDT dungeon data (g_mdt_data)
0xE000-0xE8FF: Proximity map (g_proximity_map)
0xE900-0xeb13: Viewport buffer (g_monster_ids)
0xFF16-0xFF19: Input buffer (g_input)
anything not mentioned and below 0xFFFF: Global variables (g_globals)
```

### 1.3 Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Window                         │
├─────────────────────────────────────────────────────────────┤
│  JavaScript (game.js)                                       │
│  ├── Input handling (keyboard)                              │
│  ├── Canvas rendering (text characters)                     │
│  ├── Map loading (map.js, m1.js-m9.js)                      │
│  └── WASM bridge                                            │
├─────────────────────────────────────────────────────────────┤
│  WebAssembly (fight.wasm)                                   │
│  ├── fight.c      - Dungeon engine (Fight.asm port)         │
│  ├── monster_ai.c - Monster AI (eai1.asm port)              │
│  ├── collision.c  - Collision detection                     │
│  ├── physics.c    - Hero physics                            │
│  └── data.c       - Global state                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Data Structures

### 2.1 Save Data / Global State (0x0000-0x00FF)

See src/zeliard.h for the actual structure definition.

```c

// Global instance (loaded from save file)
extern SaveData g_save_data;
```

### 2.2 Enumerations (exactly matches original Fight.asm)

```c
// Key input flags (bitmask)
typedef enum {
    KEY_ENTER = 0x01,
    // ... other key flags
} KEY_FLAGS;

// Sword types
typedef enum {
    SWORD_TRAINING     = 1,
    SWORD_WISE_MANS    = 2,
    SWORD_SPIRIT       = 3,
    SWORD_KNIGHT       = 4,
    SWORD_ILLUMINATION = 5,
    SWORD_ENCHANTMENT  = 6,
} SWORD_TYPES;

// Shield types
typedef enum {
    SHIELD_CLAY      = 1,
    SHIELD_WISE_MANS = 2,
    SHIELD_STONE     = 3,
    SHIELD_HONOR     = 4,
    SHIELD_LIGHT     = 5,
    SHIELD_TITANIUM  = 6,
} SHIELD_TYPES;

// Accessories
typedef enum {
    ACCESSORY_FERUZA_SHOES  = 1,  // High jump
    ACCESSORY_PIRIKA_SHOES  = 2,  // Feet protection (Gelroid/thorns/fire)
    ACCESSORY_SILKARN_SHOES = 3,  // Climb slopes
    ACCESSORY_RUZERIA_SHOES = 4,  // Anti-ice
    ACCESSORY_ASBESTOS_CAPE = 5,  // Heat protection
} ACCESSORIES;
```

### 2.3 MDT Dungeon Data Structures (loaded at 0xC000)

```c
// MDT file header pointers (offsets from 0xC000)
// These point to linked lists terminated by 0xFFFF

typedef struct {
    uint16_t vert_platforms_offset;   // 0xC004 -> Vertical platforms list
    uint16_t air_streams_offset;      // 0xC006 -> Air streams/objects list
    uint16_t horiz_platforms_offset;  // 0xC008 -> Horizontal platforms list
    uint16_t doors_offset;            // 0xC00A -> Doors list
    uint16_t items_check_offset;      // 0xC00C -> Items check data
    uint16_t cavern_name_offset;      // 0xC00E -> Cavern name rendering info
    uint16_t monsters_offset;         // 0xC010 -> Monsters list
} MDTHeader;

// Vertical platform (3 bytes, from 0xC004)
typedef struct {
    int16_t x;
    int8_t  y;
    // Next record follows immediately, terminated by 0xFFFF
} VertPlatformEntry;

// Air stream / object (3 bytes, from 0xC006)
typedef struct {
    int16_t x;
    int8_t  y;
    // Next record follows immediately, terminated by 0xFFFF
} AirStreamEntry;

// Horizontal platform (7 bytes, from 0xC008)
typedef struct {
    int16_t x_and_flags;
    int8_t  y_and_flags;
    // 1 byte padding
    int16_t min_x;
    int16_t max_x;
    // Next record follows immediately, terminated by 0xFFFF
} HorizPlatformEntry;

// Door (12 bytes, from 0xC00A)
typedef struct {
    int16_t x0;
    int8_t  y0;
    int8_t  field_3;
    int8_t  field_4;
    // 1 byte padding
    int16_t x1;
    int8_t  y1;
    int8_t  field_8;
    int16_t field_9;
    int8_t  field_B;
    // Next record follows immediately, terminated by 0xFFFF
} DoorEntry;

// Items check data (variable, from 0xC00C)
// Structure TBD - used for checking accomplished items
typedef struct {
    // Terminated by 0xFFFF
} ItemsCheckEntry;

// Cavern name rendering info (variable, from 0xC00E)
// Pascal-style string with rendering position
typedef struct {
    uint8_t length;
    char text[1];  // Variable length
    // Position and style info follows
} CavernNameEntry;

// Monster entry (16 bytes, from 0xC010)
// Some monsters use 2 consecutive records (32 bytes total)
typedef struct {
    int16_t currX;        // Current X position
    int8_t  currY;        // Current Y position
    int8_t  x_rel;        // X relative to viewport (0x10 = center = 16)
    int8_t  flags;        // &0x0F = AI type (0-3), &0x01 = big monster
    int8_t  field_5;      // State flags: &0x20=hit by hero, &0x80=direction
    int8_t  field_6;      // Animation frame / state timer
    int8_t  state_flags;  // &0x10=big monster, &0x0F=animation state
    int8_t  field_8;      // Current HP
    int8_t  field_9;      // AI sub-state
    int8_t  field_A;      // Movement timer
    int16_t spwnX;        // Spawn X position
    int8_t  spwnY;        // Spawn Y position
    int8_t  type;         // Monster type ID
    int8_t  counter;      // General purpose counter
} MonsterEntry;           // sizeof=0x10

// Next record follows immediately, terminated by 0xFFFF
// Some monsters occupy 2 consecutive entries (2*16 bytes)
```

### 2.4 Viewport Buffer (active, 0xE900)

```c
// 28*19 bytes at 0xE900-0xEB13
// 1 byte per monster or other object (monster ID/type)

#define VIEWPORT_BUFFER_SIZE (28*19)
extern uint8_t g_monster_buffer[VIEWPORT_BUFFER_SIZE];  // At 0xE900

// Each byte contains a monster ID/type or other object
// Monster AI and state is processed based on these IDs
```

### 2.5 Global Variables (0xEB14-0xFFFF)

```c
// 0x14ec bytes of runtime global state
// Not saved to disk - used for temporary state during gameplay

extern uint8_t g_globals[0x14ec];  // At 0xEB14-0xFFFF

```

### 2.6 Door Structure (active, 0xC00A)

```c
// sizeof=0x0C (from MDT, loaded at 0xC00A)
typedef struct {
    int16_t x0;         // Start X coordinate
    int8_t  y0;         // Start Y coordinate
    int8_t  field_3;    // Unknown
    int8_t  field_4;    // Unknown
    int16_t x1;         // End X coordinate
    int8_t  y1;         // End Y coordinate
    int8_t  field_8;    // Unknown
    int16_t field_9;    // Unknown
    int8_t  field_B;    // Unknown
} door;                 // sizeof=0x0C
```

### 2.7 Vertical Platform Structure (active, 0xC004)

```c
// sizeof=0x03 (from MDT, loaded at 0xC004)
typedef struct {
    int16_t x;          // X position
    int8_t  y;          // Y position
} vert_platform;        // sizeof=0x03
```

### 2.8 Horizontal Platform Structure (active, 0xC008)

```c
// sizeof=0x07 (from MDT, loaded at 0xC008)
typedef struct {
    int16_t x_and_flags;    // X position with flags
    int8_t  y_and_flags;    // Y position with flags
    // 1 byte padding
    int16_t min_x;          // Minimum X boundary
    int16_t max_x;          // Maximum X boundary
} horiz_platform;           // sizeof=0x07
```

### 2.9 Slot Structure (0x0D bytes)

```c
// sizeof=0x0D, 32 slots total
// Note: Slots are in some way related to monsters - probably their projectiles

typedef struct {
    int8_t  field_0;    // Unknown
    // 6 bytes padding
    int16_t field_7;    // Unknown
    // 2 bytes padding
    int8_t  field_B;    // Unknown
    int8_t  field_C;    // Unknown
} slot;                 // sizeof=0x0D

#define SLOT_COUNT 32
extern slot g_slots[SLOT_COUNT];  // 32 × 13 = 416 bytes
```

### 2.10 Proximity Map (0xE000-0xE8FF)

```c
// 36 columns × 64 rows = 2304 bytes
// Centered on hero's X coordinate
// Scrolls as hero moves left/right

#define PROXIMITY_MAP_WIDTH  36
#define PROXIMITY_MAP_HEIGHT 64
#define PROXIMITY_MAP_SIZE   (PROXIMITY_MAP_WIDTH * PROXIMITY_MAP_HEIGHT)

extern uint8_t g_proximity_map[PROXIMITY_MAP_SIZE];  // At 0xE000

// The full cavern map (e.g., Cavern Malicia = 240 columns × 64 rows)
// is stored in the MDT file. Only a 36-column window is loaded
// into the proximity map at any time.

// When hero moves:
// - Moving right: scroll left by 1 column, unpack new rightmost column from MDT
// - Moving left: scroll right by 1 column, unpack new leftmost column from MDT

// Helper to get tile from proximity map
static inline uint8_t get_proximity_tile(uint8_t x, uint8_t y) {
    // x in (0-35)
    // y is absolute (0-63)
    return g_proximity_map[y * PROXIMITY_MAP_WIDTH + x];
}
```

### 2.11 Full Cavern Map (MDT data)

```c
// Full cavern maps vary in width, but always 64 rows high
// Example: Cavern Malicia = 240 columns × 64 rows

#define CAVERN_MAP_HEIGHT 64

// Cavern map metadata (from m1.js and other map files)
typedef struct {
    uint16_t full_width;      // Full map width (e.g., 240 for Cavern Malicia)
    uint16_t height;          // Always 64
    uint16_t spawn_x;         // Hero spawn X
    uint16_t spawn_y;         // Hero spawn Y
    uint8_t  spawn_direction; // 1=right, -1=left
    const char* name;         // Cavern name string
} CavernMapInfo;

// Example: Cavern Malicia (from m1.js)
static const CavernMapInfo cavern_malicia = {
    .full_width = 240,
    .height = 64,
    .spawn_x = 36,
    .spawn_y = 55,
    .spawn_direction = 1,
    .name = "Cavern Malicia"
};
```

### 2.12 Input State

```c
// Input buffer location in WASM memory
#define MEM_INPUT_BUFFER 0xFF16  // 4 bytes reserved for input state

// Key flags (bitmask) - matches original DOS keyboard input
typedef enum {
    INPUT_NONE      = 0x00,
    INPUT_UP        = 0x01,
    INPUT_DOWN      = 0x02,
    INPUT_LEFT      = 0x04,
    INPUT_RIGHT     = 0x08,
    INPUT_ENTER     = 0x10,
    INPUT_SPACE     = 0x20,
    INPUT_ALT       = 0x40,
    INPUT_ESC       = 0x80,
} InputFlags;

// Input buffer structure (4 bytes at 0xFF16)
typedef struct {
    uint8_t current_keys;      // Current frame key state (bitmask)
    uint8_t pressed_keys;      // Keys pressed this frame (edge-triggered)
    uint8_t released_keys;     // Keys released this frame (edge-triggered)
    uint8_t previous_keys;     // Previous frame key state (for edge detection)
} InputBuffer;

// Implemented in: src/input.c
// JavaScript bridge: src/zeliard-wasm.js, game.js
```

---

## 3. Core Systems

### 3.1 Game Loop

```c
// Main entry point (replaces Cavern_Game_Init at 0x6042)
void Cavern_Game_Init(void);

// Main game loop (called every frame)
void main_loop(void);

// Input state machine dispatcher
void state_machine_dispatcher(void);
```

**Flow:**
```
Cavern_Game_Init
    ├── Initialize segments
    ├── Clear monster buffer (0xE900)
    ├── Load boss or regular cavern
    ├── Setup rendering
    └── Enter main_loop

main_loop
    ├── Check on_rope_flags
    ├── input_handling()
    ├── sub_64BB (physics)
    ├── main_update_render()
    ├── sub_87B0
    ├── hero_interaction_check()
    ├── sub_6412
    ├── state_machine_dispatcher()
    └── Loop (via interrupt 61h in original)
```

### 3.2 Physics & Movement

```c
// === Input Processing ===
// ✅ IMPLEMENTED: src/input.c
void input_init(void);           // Initialize input buffer
void input_update(void);         // Update edge-triggered state each frame
void input_set_keys(uint8_t keys);  // JavaScript sets key bitmask
uint8_t input_get_current_keys(void); // Get currently held keys
uint8_t input_get_pressed_keys(void); // Get keys pressed this frame
uint8_t input_get_released_keys(void); // Get keys released this frame
int input_is_key_pressed(uint8_t key); // Edge-triggered: pressed this frame
int input_is_key_held(uint8_t key);    // Level-triggered: currently held
int input_is_key_released(uint8_t key); // Edge-triggered: released this frame

// Original DOS input handling (replaced by WASM input buffer)
// void input_handling(void);        // Replaced by JavaScript + input_set_keys()
// void hero_moves_left(void);       // To be implemented in fight.c
// void hero_moves_right(void);      // To be implemented in fight.c
// void up_pressed(void);            // To be implemented in fight.c
// void down_pressed(void);          // To be implemented in fight.c
// void left_up_pressed(void);       // To be implemented in fight.c
// void right_up_pressed(void);      // To be implemented in fight.c

// === Rope Physics ===
// ✅ IMPLEMENTED: src/physics.c
void sub_6DB1(void);           // Rope position update
int is_over_rope(void);        // Check if over rope tile
void start_climb_rope(void);   // Start climbing rope
void climb_up_rope(void);      // Climb up on rope
void climb_down_rope(void);    // Climb down on rope

// === Jump Physics ===
// ✅ IMPLEMENTED: src/physics.c
void sub_64BB(void);           // Jump trajectory calculation
void update_jump_trajectory(void);
void start_jump(void);         // Initialize jump

// === Collision Detection (8 directions) ===
// ✅ IMPLEMENTED: src/collision.c
int check_collision_E2(uint8_t x, uint8_t y);      // East (right)
int check_collision_W2(uint8_t x, uint8_t y);      // West (left)
int check_collision_N2(uint8_t x, uint8_t y);      // North (up)
int check_collision_S2(uint8_t x, uint8_t y);      // South (down)
int check_collision_NE2(uint8_t x, uint8_t y);     // North-East (diagonal up-right)
int check_collision_SE2(uint8_t x, uint8_t y);     // South-East (diagonal down-right)
int check_collision_NW2(uint8_t x, uint8_t y);     // North-West (diagonal up-left)
int check_collision_SW2(uint8_t x, uint8_t y);     // South-West (diagonal down-left)

// MonsterEntry wrappers for monster_ai.c
int check_collision_E2_monster(MonsterEntry* m);
int check_collision_W2_monster(MonsterEntry* m);
int check_collision_N2_monster(MonsterEntry* m);
int check_collision_S2_monster(MonsterEntry* m);
int check_collision_NE2_monster(MonsterEntry* m);
int check_collision_SE2_monster(MonsterEntry* m);
int check_collision_NW2_monster(MonsterEntry* m);
int check_collision_SW2_monster(MonsterEntry* m);

// Tile passability
int if_passable_set_ZF(uint8_t tile);  // Returns 1 if passable, 0 if blocked

// Map utilities
void wrap_map_from_above(uint16_t *si);   // if si >= 0xE900, si -= 0x900
void wrap_map_from_below(uint16_t *si);   // if si < 0xE000, si += 0x900

// Danger type handling
void set_danger_type(uint8_t type);
uint8_t get_danger_type(void);

// Physics state accessors
uint8_t get_jump_phase_flags(void);
uint8_t get_on_rope_flags(void);
int is_on_ground(void);
int is_jumping(void);
int is_on_rope(void);
void physics_init(void);
void physics_update(void);
```

### 3.3 Monster System

**Status: ✅ FULLY IMPLEMENTED** (src/monster_ai.c)

```c
// === Monster Management ===
void update_all_monsters_in_map(void);  // ✅ Implemented - iterates all monsters
uint8_t Find_Monsters_Near_Hero(void);    // Returns count in DL - TODO
void Browse_Slots(void);                  // TODO - slots are unrelated to monsters
void Move_13_Bytes_From_bx_Ptr_To_Free_Slot(void);  // TODO

// === AI System (from eai1.asm) ===
void Monster_AI(MonsterEntry *m);  // ✅ Implemented - main dispatcher

// AI type dispatchers (based on monster.flags & 0x0F)
void ai_type_0_guard(MonsterEntry *m);    // ✅ Implemented - Stationary, checks vertical distance
void ai_type_1_patrol(MonsterEntry *m);   // ✅ Implemented - Moves south, then horizontal chase
void ai_type_2_chase(MonsterEntry *m);    // ✅ Implemented - Horizontal pursuit with animation
void ai_type_3_complex(MonsterEntry *m);  // ✅ Implemented - State machine with multiple phases

// === Monster Movement (8 directions) ===
void move_monster_E(MonsterEntry *m);     // ✅ Implemented
void move_monster_NE(MonsterEntry *m);    // ✅ Implemented
void move_monster_N(MonsterEntry *m);     // ✅ Implemented
void move_monster_NW(MonsterEntry *m);    // ✅ Implemented
void move_monster_W(MonsterEntry *m);     // ✅ Implemented
void move_monster_SW(MonsterEntry *m);    // ✅ Implemented (stub, unused)
void move_monster_S(MonsterEntry *m);     // ✅ Implemented
void move_monster_SE(MonsterEntry *m);    // ✅ Implemented (stub, unused)

// === Monster Collision ===
int Check_Monster_Ids_Two_Rows_Below_Monster(MonsterEntry *m);  // ✅ Implemented
void Check_Vertical_Distance_Between_Hero_And_Monster(MonsterEntry *m);  // ✅ Implemented
void Move_Monster_NWE_Depending_On_Whats_Below(MonsterEntry *m);  // TODO

// === Monster Combat ===
void Hero_Hits_monster(MonsterEntry *m);  // ✅ Implemented - reduces HP, clears hit flag
```

**Implementation Notes:**
- All 4 AI types fully ported with state machines
- Animation frame tables preserved (monster_frames_0-7, dir_table_0-7, special_table_0-7)
- Monster movement updates currX, currY, x_rel, and field_5 direction flag
- ✅ Collision detection fully implemented - `src/collision.c` with 8-directional checks
- ✅ Monster AI now uses real collision detection instead of stubs
- Monster death/reward handling needs completion

### 3.4 Combat System

**Status: Partially Implemented**

```c
// === Hero Attacks Monster ===
void Hero_Hits_monster(MonsterEntry *m);  // ✅ Implemented - reduces HP, clears hit flag

// === Stats Lookup ===
uint8_t Get_Stats(uint8_t stat_id);
// stat_id=0: return hero_level/2 + 1
// stat_id=1: return sword_total_damage
// stat_id=2..8: return byte_98BE[stat_id-2]
// stat_id=9: NOP
// Status: TODO - requires byte_98BE table from Fight.asm (it is available)

// === Distance Calculation ===
int HorizDistToHero_35(uint8_t monster_x);
// Returns (35 - distance) if in range, sets CF=1 if out of range
// Accounts for world-wrapping (map edges)
// Status: ✅ Implemented (unused - helper for AI)
```

### 3.5 Rendering (Stubs for JS)

**Status: Intentionally Stubbed** - Rendering handled by JavaScript

```c
// === Main Render ===
void main_update_render(void);  // Stub - JS reads proximity map directly
void Render_Viewport_Tiles_proc(void);  // Stub - JS renders text characters
void Active_Entity_Sprite_Renderer_proc(void);  // Stub - JS handles entity rendering
void Flush_Ui_Element_If_Dirty_proc(void);  // Stub - JS manages UI updates

// === UI Rendering ===
void Draw_Hero_Max_Health_proc(void);     // Stub - JS updates UI
void Draw_Hero_Health_proc(void);         // Stub - JS updates UI
void Draw_Boss_Max_Health_proc(uint16_t max_hp);  // Stub - JS updates UI
void Draw_Boss_Health_proc(uint16_t hp);  // Stub - JS updates UI
void Print_Gold_Decimal_proc(void);       // Stub - JS updates UI
void Print_Almas_Decimal_proc(void);      // Stub - JS updates UI
void render_hid_bars_with_enemy(void);    // Stub - JS updates UI
void render_place_and_gold_labels(void);  // Stub - JS updates UI
void Clear_Place_Enemy_Bar_proc(void);    // Stub - JS updates UI

// === Resource Loading ===
void res_dispatcher(uint8_t resource_type);  // TODO - sprite loading (not needed for text mode)
void process_mdt_header(uint8_t header);     // TODO - MDT processing
void fill_e900_buffer(void);                 // ✅ Implemented - copies monster IDs
void sub_6C98(void);  // Unpack MDT - ✅ Implemented as unpack_map()
```

**Why Rendering is Stubbed:**
- Project uses text-based rendering (ASCII characters) in JavaScript canvas
- Original sprite rendering (gfmcga module) is replaced entirely
- WASM provides data (proximity map, monster positions) via exported memory
- JavaScript reads WASM memory directly for rendering

---

## 4. Monster AI Details (eai1.asm)

### 4.1 AI Type 0: Guard

```c
void ai_type_0_guard(Monster *m) {
    // 1. Check for monsters two rows below
    if (!Check_Monster_Ids_Two_Rows_Below_Monster(m)) {
        Check_Vertical_Distance_Between_Hero_And_Monster(m);
        return;
    }
    
    // 2. Check if already hit by hero
    if (m->field_5 & 0x20) {
        Hero_Hits_monster(m);
        return;
    }
    
    // 3. State machine based on field_9 >> 6
    switch ((m->field_9 >> 6) & 0x03) {
        case 0:  // Move N, then check X distance
            move_monster_N(m);
            if (m->field_6 & 0xFF) {
                m->field_6 -= 0x10;
                return;
            }
            // Check if hero is within 7 tiles horizontally
            if (abs(m->x_rel - 0x17) <= 0x10 && abs(m->x_rel - 0x17) >= 7) {
                m->field_9 = 0x40;
            }
            m->field_6 = 0;
            break;
            
        case 1:  // Wait state
            m->field_6++;
            m->field_6 &= 0x07;
            if (m->field_6 != 3) return;
            m->field_9 = 0x80;
            break;
            
        case 2:  // Chase hero vertically
            sub_A3D4(m);  // Increment timer
            if (g_state.byte_FF36) {
                m->field_9 = 0xC0;
                return;
            }
            // Calculate vertical distance and chase
            // ... (see full implementation in eai1.asm A2E3-A382)
            break;
            
        case 3:  // Move N repeatedly
            if (m->field_9 & 0x20) {
                // Move NE or NW based on direction flag
                if (m->field_5 & 0x80) {
                    move_monster_NE(m);
                } else {
                    move_monster_NW(m);
                }
                move_monster_N(m);
                if (!(m->field_6 & 0xFF)) {
                    m->field_9 |= 0x20;
                    m->field_6 = 2;
                }
            } else {
                m->field_6--;
                m->field_6 &= 0x07;
                if (m->field_6) return;
                m->field_6 = 0x70;
                m->field_9 = 0;
            }
            break;
    }
}
```

### 4.2 AI Type 1: Patrol

```c
void ai_type_1_patrol(Monster *m) {
    // Similar structure to type 0, but moves south instead of north
    // See eai1.asm A3E7-A43E
}
```

### 4.3 AI Type 2: Chase

```c
void ai_type_2_chase(Monster *m) {
    // Horizontal pursuit with animation state machine
    // Uses frame tables for animation
    // See eai1.asm A43F-A4E3
}
```

### 4.4 AI Type 3: Complex

```c
void ai_type_3_complex(Monster *m) {
    // Multi-phase state machine
    // Handles special behaviors like splitting, teleporting
    // See eai1.asm A517-A6F0
}
```

### 4.5 Animation Frame Tables

```c
// Frame sequences for each monster type (eai1.asm A0B0-A23F)
// Each table contains sprite frame indices for animation

// Example: byte_A0B0 - frames for monster type 0
static const uint8_t monster_frames_0[] = {
    0x00, 0x19, 0x1A, 0x1B, 0x1C,  // Frame sequence 1
    0x00, 0x1D, 0x1E, 0x1F, 0x20,  // Frame sequence 2
    0x00, 0x21, 0x22, 0x23, 0x24,  // Frame sequence 3
    0x00, 0x25, 0x26, 0x27, 0x28,  // Frame sequence 4
    0x00, 0x29, 0x2A, 0x2B, 0x2C,  // Frame sequence 5
    0x00, 0x2D, 0x2E, 0x2F, 0x30,  // Frame sequence 6
    0x00, 0x31, 0x32, 0x33, 0x34,  // Frame sequence 7
};

// All frame tables:
static const uint8_t *g_frame_tables[] = {
    monster_frames_0,   // byte_A0B0
    monster_frames_1,   // byte_A0D3
    monster_frames_2,   // byte_A0F6
    monster_frames_3,   // byte_A10A
    monster_frames_4,   // byte_A11E
    monster_frames_5,   // byte_A141
    monster_frames_6,   // byte_A164
    monster_frames_7,   // byte_A182
    // ... through byte_A22C
};
```

---

## 5. WASM Build and Integration

### 5.1 Build Process (clang)

**Status: ✅ Complete**

The project uses clang with `--target=wasm32` directly - no Emscripten required.

**Build Command:**
```bash
./build.sh
# Or: make -C src
```

**Full clang command: (see build.sh for latest version)**
```bash
clang --target=wasm32 -nostdlib -ffreestanding -fno-builtin \
    -Wl,--no-entry -Wl,--export-all \
    -Wl,--export=__heap_base -Wl,--export=__data_end \
    -Wl,--export=Cavern_Game_Init \
    -Wl,--export=unpack_map \
    -Wl,--export=Monster_AI \
    -Wl,--export=update_all_monsters_in_map \
    -Wl,--export=get_memory_base \
    -Wl,--initial-memory=67108864 \
    -O2 -g \
    -o build/zeliard.wasm \
    src/fight.c src/data.c src/mdt.c src/string.c src/cavern.c src/unpack.c src/monster_ai.c
```

**Output:** `build/zeliard.wasm` (~26KB)

**Source Files (see src/ folder for latest version):**
| File | Size | Description |
|------|------|-------------|
| `src/data.c` | 67KB | Main memory array (g_memory[65536]) |
| `src/monster_ai.c` | 4KB | Monster AI system (eai1.asm port) |
| `src/unpack.c` | 2.4KB | MDT map unpacking |
| `src/mdt.c` | 2KB | MDT file loading |
| `src/cavern.c` | 1.7KB | Cavern game loop |
| `src/fight.c` | 1.7KB | Initialization |
| `src/string.c` | 1.5KB | memset/memcpy stubs |

### 5.2 WASM Exports (C → JS)

**Status: Partially Implemented**

```c
// see zeliard.h
```

**Exported via build.sh:**
- `Cavern_Game_Init` - Main entry point
- `unpack_map` - Map unpacking
- `Monster_AI` - Individual monster AI
- `update_all_monsters_in_map` - Update all monsters
- `get_memory_base` - Memory offset for JS access

### 5.3 JavaScript Integration

**How JS Accesses WASM:**

1. **Memory Access:** JavaScript reads WASM memory directly via `WebAssembly.Memory`
2. **Function Calls:** JS calls exported functions via `instance.exports`
3. **Data Structures:** C structs are laid out at fixed offsets matching original DOS

**Example (JavaScript):**
```javascript
// Load WASM
const response = await fetch('build/zeliard.wasm');
const { instance } = await WebAssembly.instantiateStreaming(response);

// Get memory view
const memory = instance.exports.memory;
const g_memory = new Uint8Array(memory.buffer);

// Read proximity map (0xE000-0xE8FF)
const proximityMap = g_memory.slice(0xE000, 0xE900);

// Call exported functions
instance.exports.Cavern_Game_Init();
instance.exports.wasm_update();
```

```javascript
// wasm-bridge.js

let wasmInstance = null;
let wasmMemory = null;

export async function initWasm() {
    const response = await fetch('fight.wasm');
    const { instance } = await WebAssembly.instantiateStreaming(response);
    wasmInstance = instance.exports;
    wasmMemory = instance.exports.memory;
    
    return wasmInstance;
}

export function wasmInit(mapData, mapWidth, mapHeight) {
    // Copy map data to WASM memory
    const mapBuffer = new Uint8Array(wasmMemory.buffer, getMapBufferOffset(), 36 * 64);
    mapBuffer.set(mapData);
    
    wasmInstance.wasm_init(getMapBufferOffset(), mapWidth, mapHeight);
}

export function wasmSetInput(keys) {
    wasmInstance.wasm_set_input(keys);
}

export function wasmUpdate() {
    wasmInstance.wasm_update();
}

export function wasmGetHeroState() {
    return {
        x: wasmInstance.wasm_get_hero_x(),
        y: wasmInstance.wasm_get_hero_y(),
        direction: wasmInstance.wasm_get_hero_direction(),
        hp: wasmInstance.wasm_get_hero_hp(),
        maxHp: wasmInstance.wasm_get_hero_max_hp(),
        level: wasmInstance.wasm_get_hero_level(),
        gold: wasmInstance.wasm_get_hero_gold(),
        almas: wasmInstance.wasm_get_hero_almas(),
    };
}

export function wasmGetMonsters() {
    const count = wasmInstance.wasm_get_monster_count();
    const monsters = [];
    for (let i = 0; i < count; i++) {
        monsters.push({
            x: wasmInstance.wasm_get_monster_x(i),
            y: wasmInstance.wasm_get_monster_y(i),
            frame: wasmInstance.wasm_get_monster_frame(i),
            hp: wasmInstance.wasm_get_monster_hp(i),
            flags: wasmInstance.wasm_get_monster_flags(i),
        });
    }
    return monsters;
}

export function wasmGetTile(x, y) {
    return wasmInstance.wasm_get_tile(x, y);
}

// Memory layout offsets (must match data.c)
function getMapBufferOffset() { return 0xE000; }
function getGameStateOffset() { return 0x0000; }
function getMDTOffset() { return 0xC000; }
```

### 5.3 Updated Game Loop (JavaScript)

```javascript
// game.js - Updated main loop

import { 
    initWasm, 
    wasmInit, 
    wasmSetInput, 
    wasmUpdate, 
    wasmGetHeroState,
    wasmGetMonsters,
    wasmGetTile
} from './wasm-bridge.js';

// Initialize WASM
const wasm = await initWasm();

// Initialize dungeon
function startDungeon(mapName) {
    const mapInfo = loadMap(mapName);
    const mapData = parseMapToBytes(mapInfo.data);
    wasmInit(mapData, 36, 64);
    wasmSetHeroPos(mapInfo.metadata.spawn.x, mapInfo.metadata.spawn.y, mapInfo.metadata.spawn.direction);
}

// Input handling
function readInput() {
    let keys = 0;
    if (keysState.ArrowUp) keys |= INPUT_UP;
    if (keysState.ArrowDown) keys |= INPUT_DOWN;
    if (keysState.ArrowLeft) keys |= INPUT_LEFT;
    if (keysState.ArrowRight) keys |= INPUT_RIGHT;
    if (keysState.Space) keys |= INPUT_SPACE;
    if (keysState.Enter) keys |= INPUT_ENTER;
    return keys;
}

// Main game loop
function gameLoop(timestamp) {
    // Calculate delta time
    const dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    
    // Read input and send to WASM
    const input = readInput();
    wasmSetInput(input);
    
    // Update game state (WASM)
    wasmUpdate();
    
    // Query state from WASM
    const hero = wasmGetHeroState();
    const monsters = wasmGetMonsters();
    
    // Render using existing JS renderer
    renderHero(hero.x, hero.y, hero.direction);
    renderMonsters(monsters);
    updateUI(hero);
    
    requestAnimationFrame(gameLoop);
}

// Start the game
startDungeon('cavernMalicia');
requestAnimationFrame(gameLoop);
```

---

## 6. Build System

### 6.1 Makefile (Emscripten)

```makefile
# See actual src/Makefile for latest version

CC = emcc
CFLAGS = -O2 -Wall -Wextra
LDFLAGS = -s WASM=1 -s EXPORTED_FUNCTIONS='[\
    "_wasm_init",\
    "_wasm_set_hero_pos",\
    "_wasm_set_input",\
    "_wasm_update",\
    "_wasm_get_hero_x",\
    "_wasm_get_hero_y",\
    "_wasm_get_hero_direction",\
    "_wasm_get_hero_hp",\
    "_wasm_get_hero_max_hp",\
    "_wasm_get_hero_level",\
    "_wasm_get_hero_gold",\
    "_wasm_get_hero_almas",\
    "_wasm_get_monster_count",\
    "_wasm_get_monster_x",\
    "_wasm_get_monster_y",\
    "_wasm_get_monster_frame",\
    "_wasm_get_monster_hp",\
    "_wasm_get_monster_flags",\
    "_wasm_get_tile"\
]' -s EXPORTED_RUNTIME_METHODS='["cwrap", "ccall"]'

SRCDIR = src
BUILDDIR = build

SOURCES = $(SRCDIR)/fight.c \
          $(SRCDIR)/monster_ai.c \
          $(SRCDIR)/collision.c \
          $(SRCDIR)/physics.c \
          $(SRCDIR)/data.c

TARGET = $(BUILDDIR)/fight.wasm

all: $(TARGET)

$(TARGET): $(SOURCES)
	@mkdir -p $(BUILDDIR)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(SOURCES)

clean:
	rm -rf $(BUILDDIR)

.PHONY: all clean
```

### 6.2 Project Structure

```
zeliard/
├── index.html
├── styles.css
├── game.js                 # Main JS (updated for WASM)
├── wasm-bridge.js          # NEW: WASM JavaScript bridge
├── map.js                  # Map definitions
├── m1.js - m9.js           # Cavern maps
├── fight.wasm              # NEW: Generated WASM binary
├── src/                    # NEW: C source files
│   ├── fight.c             # Dungeon engine (Fight.asm port)
│   ├── zeliard.h             # Public API
│   ├── monster_ai.c        # Monster AI (eai1.asm port)
│   ├── monster_ai.h        # AI declarations
│   ├── collision.c         # Collision detection
│   ├── physics.c           # Hero physics
│   ├── data.c              # Global state
│   └── Makefile            # Emscripten build
├── WORK/                   # Original assembly files
│   ├── Fight.asm
│   ├── eai1.asm
│   └── *.BIN, *.MDT, ...
└── PORTING_PLAN.md         # This document
```

---

## 7. Porting Phases

### Phase 1: Infrastructure (Week 1)

**Goal:** Set up build system and basic data structures

- [x] Create `src/` directory structure
- [x] Write `data.c` with all global variables
- [x] Write `zeliard.h` with public API
- [x] Create Makefile for Emscripten
- [x] Create stub functions for all rendering calls
- [x] Create stub functions for music/joystick
- [x] Port map utility functions:
  - `coords_in_ax_to_map_offset`
  - `wrap_map_from_above`
  - `wrap_map_from_below`
  - `if_passable_set_ZF`
- [x] Test: Compile empty WASM module, verify JS can load it

### Phase 2: Hero Physics (Week 2-3)

**Goal:** Port hero movement and collision

- [ ] Port `input_handling` function
- [ ] Port `state_machine_dispatcher`
- [ ] Port `hero_moves_left` / `hero_moves_right`
- [ ] Port `up_pressed` / `down_pressed`
- [x] Port rope physics (`sub_6DB1`, `is_over_rope`) - ✅ **Complete**
- [x] Port jump physics (`sub_64BB`) - ✅ **Complete**
- [x] Port all 8 collision functions - ✅ **Complete** (`src/collision.c`)
- [ ] Port `hero_interaction_check`
- [ ] Test: Hero can walk, jump, climb rope in empty map

### Phase 3: Monster System (Week 4-5)

**Goal:** Port monster AI and movement

- [ ] Port monster buffer management (`Browse_Slots`)
- [ ] Port `Find_Monsters_Near_Hero`
- [ ] Port `Check_Monster_Ids_Two_Rows_Below_Monster`
- [ ] Port `Check_Vertical_Distance_Between_Hero_And_Monster`
- [ ] Port all 8 monster movement functions
- [ ] Port `Move_Monster_NWE_Depending_On_Whats_Below`
- [ ] Port all 4 AI type functions
- [ ] Port animation frame tables
- [ ] Port `Monster_AI` dispatcher
- [ ] Test: Monsters move according to AI type

### Phase 4: Combat (Week 6)

**Goal:** Port combat system

- [ ] Port `Hero_Hits_monster`
- [ ] Port `Get_Stats`
- [ ] Port `HorizDistToHero_35`
- [ ] Port monster death handling
- [ ] Port XP and gold collection
- [ ] Port boss battle logic
- [ ] Test: Hero can hit monsters, monsters die, drops collected

### Phase 5: Integration (Week 7)

**Goal:** Integrate WASM with JS renderer

- [ ] Write `wasm-bridge.js`
- [ ] Update `game.js` to use WASM for physics
- [ ] Keep JS rendering (text characters)
- [ ] Add debug visualization
- [ ] Test with existing maps (m1-m9)
- [ ] Performance profiling
- [ ] Bug fixes

### Phase 6: Polish (Week 8)

**Goal:** Final testing and optimization

- [ ] Test all 9 caverns
- [ ] Verify AI behavior matches original
- [ ] Verify physics matches original
- [ ] Optimize hot paths
- [ ] Add remaining game features (shops, NPCs, etc.)
- [ ] Documentation

---

## 8. Key Differences: Original vs Port

| Aspect | Original ASM | Current JS | Port Target |
|--------|-------------|------------|-------------|
| **Physics Model** | Frame-based discrete | Time-based linear | Frame-based (exact ASM) |
| **Grid Size** | 36×64 map | Variable | 36×64 (exact ASM) |
| **Viewport** | 28×19 tiles | 28×18 tiles | 28×19 (exact ASM) |
| **Collision** | Tile-based discrete | AABB continuous | Tile-based (exact ASM) |
| **Monster AI** | 4 behavior types | None | 4 types (exact ASM) |
| **Animation** | Frame tables | None | Frame tables (exact ASM) |
| **Input** | Keyboard + Joystick | Keyboard only | Keyboard only (stub joystick) |
| **Music** | PC Speaker/AdLib | None | Stubs (no-op) |
| **Graphics** | EGA sprites | Text characters | Text characters (JS) |
| **Memory** | Segmented 64KB | Heap | Linear WASM memory |

---

## 9. Music & Joystick Stubs

```c
// stubs.c - No-op implementations for non-essential features

// === Music Stubs ===
void PlayMusic(uint8_t track) {
    // Original: Plays music via PC speaker or AdLib
    // Port: No-op (music not needed for web version)
}

void StopMusic(void) {
    // No-op
}

void SetMusicVolume(uint8_t volume) {
    // No-op
}

// === Joystick Stubs ===
uint8_t ReadJoystick(void) {
    // Original: Reads joystick port
    // Port: Return 0 (keyboard only)
    return 0;
}

void CalibrateJoystick(void) {
    // No-op
}

int JoystickConnected(void) {
    return 0;  // Always false
}

// === Interrupt Handlers (stubs) ===
void interrupt_60h(uint8_t ah, uint8_t al) {
    // Original: Resource loading, graphics operations
    // Port: Handled by JS, stub here
}

void interrupt_61h(void) {
    // Original: Timer interrupt, input handling
    // Port: Called via JS game loop
}
```

---

## 10. Reference: Assembly Function Mapping

### Fight.asm Functions

| Address | Function Name | C Equivalent | Status |
|---------|--------------|--------------|--------|
| 0x6042 | `Cavern_Game_Init` | `Cavern_Game_Init()` | ✅ Complete |
| 0x629C | `main_loop` | `main_loop()` | ✅ Complete |
| 0x6343 | `state_machine_dispatcher` | `state_machine_dispatcher()` | ✅ Complete |
| 0x63DA | `hero_interaction_check` | `hero_interaction_check()` | ✅ Complete |
| 0x6412 | `sub_6412` | `sub_6412()` | ✅ Complete |
| 0x64BB | `sub_64BB` | `update_physics()` | ✅ Complete |
| 0x6508 | `sub_6508` | `sub_6508()` | ✅ Complete |
| 0x663E | `loc_663E` | `hero_moves_right()` | ✅ Complete |
| 0x67C6 | `loc_67C6` | `hero_moves_left()` | ✅ Complete |
| 0x695A | `sub_695A` | `sub_695A()` | ✅ Complete |
| 0x6C98 | `sub_6C98` | `unpack_mdt()` | ✅ Complete |
| 0x6DB1 | `sub_6DB1` | `rope_physics()` | ✅ Complete |
| 0x87B0 | `sub_87B0` | `sub_87B0()` | ✅ Complete |
| 0x96C1 | `sub_96C1` | `process_monster_death()` | ✅ Complete |
| 0x96D5 | `Check_Vertical_Distance_Between_Hero_And_Monster` | `Check_Vertical_Distance_Between_Hero_And_Monster()` | ✅ Complete |
| 0x9715 | `sub_9715` | `add_xp()` | ✅ Complete |
| 0x9723 | `monster_move_in_direction` | `monster_move_in_direction()` | ✅ Complete |
| 0x973F | `Check_collision_in_direction` | `Check_collision_in_direction()` | ✅ Complete |
| 0x975B | `Move_Monster_NWE_Depending_On_Whats_Below` | `Move_Monster_NWE_Depending_On_Whats_Below()` | ✅ Complete |
| 0x97A0 | `Check_Monster_Ids_Two_Rows_Below_Monster` | `Check_Monster_Ids_Two_Rows_Below_Monster()` | ✅ Complete |
| 0x97B5 | `Hero_Hits_monster` | `Hero_Hits_monster()` | ✅ Complete |
| 0x9851 | `Get_Stats` | `Get_Stats()` | ✅ Complete |

### eai1.asm Functions

| Address | Function Name | C Equivalent | Status |
|---------|--------------|--------------|--------|
| 0xA254 | `Monster_AI` | `Monster_AI()` | ✅ Complete |
| 0xA26A | `loc_A26A` | `ai_type_0_guard()` | ✅ Complete |
| 0xA3E7 | `loc_A3E7` | `ai_type_1_patrol()` | ✅ Complete |
| 0xA43F | `loc_A43F` | `ai_type_2_chase()` | ✅ Complete |
| 0xA517 | `loc_A517` | `ai_type_3_complex()` | ✅ Complete |
| 0xA3D4 | `sub_A3D4` | `increment_ai_timer()` | ✅ Complete |
| 0xA4E8 | `sub_A4E8` | `check_vertical_proximity()` | ✅ Complete |
| 0xA6F0 | `sub_A6F0` | `sub_A6F0()` | ✅ Complete |

### crab.asm Functions (Cangrejo Boss AI)

| Address | Function Name | C Equivalent | Status |
|---------|--------------|--------------|--------|
| 0xA2F0 | `sub_A2F0` | `update_boss_ai()` | ✅ Complete |
| 0xA43E | `sub_A43E` | `boss_move_left()` | ✅ Complete |
| 0xA44D | `sub_A44D` | `boss_move_right()` | ✅ Complete |
| 0xA671 | `sub_A671` | `boss_spawn_minions()` | ✅ Complete |
| 0xA796 | `sub_A796` | `boss_take_damage()` | ✅ Complete |

**Boss State Variables:**
- `word_A7C3`: Boss X position (starts at 0x2B)
- `byte_A7C5`: Boss Y position (starts at 0x0C)
- `word_A7C6`: Boss HP (starts at 0x96 = 150)
- `byte_A7DE`: AI state (0-9)
- `byte_A7E0`: Direction (0=right, 0xFF=left)
- `byte_A7ED`: Hit counter (0-40)

---

## 11. Testing Strategy

### 11.1 Unit Tests

```c
// test_collision.c
void test_collision_east(void) {
    // Setup: Place wall tile east of player
    // Action: Call check_collision_E2()
    // Assert: Returns non-zero (collision)
}

void test_collision_west_passable(void) {
    // Setup: Place empty tile west of player
    // Action: Call check_collision_W2()
    // Assert: Returns zero (no collision)
}

// test_ai.c
void test_ai_type_0_stationary(void) {
    // Setup: Monster with AI type 0, hero far away
    // Action: Call Monster_AI()
    // Assert: Monster doesn't move
}
```

### 11.2 Integration Tests

```javascript
// test-wasm.js
describe('WASM Integration', () => {
    it('should initialize dungeon', () => {
        wasmInit(mapData, 36, 64);
        const hero = wasmGetHeroState();
        assert.equal(hero.x, spawn.x);
        assert.equal(hero.y, spawn.y);
    });
    
    it('should process input', () => {
        wasmSetInput(INPUT_RIGHT);
        wasmUpdate();
        const hero = wasmGetHeroState();
        assert.equal(hero.direction, 1);
    });
    
    it('should detect collision', () => {
        // Setup wall in front of hero
        // Move hero into wall
        // Assert: Hero position unchanged
    });
});
```

### 11.3 Visual Testing

- Compare screenshots of original DOS version vs web version
- Verify monster movement patterns match
- Verify jump trajectories match
- Verify collision behavior matches

---

## 12. Notes & Gotchas

### 12.1 Assembly-Specific Behaviors

1. **Flag Register Usage**: Original code heavily uses CPU flags (ZF, CF, SF). In C, these become return values or boolean flags.

2. **Segment Registers**: Original uses DS, ES, CS segments. In C, these become different memory regions or arrays.

3. **Interrupt Handlers**: Original uses INT 60h/61h for services. In port, these become function calls or JS callbacks.

4. **Self-Modifying Code**: Watch for code that modifies itself (rare but possible).

5. **Timing Dependencies**: Original runs at fixed 60 FPS. WASM should match this timing.

### 12.2 Memory Layout

```
Original Memory Map:
─────────────────────────────────────────────────────────────
0x0000-0x00FF (256 bytes) - Save Data / Global State
  Exact copy of xxx.sav file
  Layout must match Fight.asm DATA segment exactly

0xC000-0xDFFF - MDT Dungeon Data (loaded from *.mdt files)
  Example: Cavern Malicia (MP10.MDT)
  
  Offset  | Content                    | Size     | Stop Marker
  ────────┼────────────────────────────┼──────────┼────────────
  0xC004  | Vertical platforms         | 3 bytes  | 0xFFFF
  0xC006  | Air streams/objects        | 3 bytes  | 0xFFFF
  0xC008  | Horizontal platforms       | 7 bytes  | 0xFFFF
  0xC00A  | Doors                      | 12 bytes | 0xFFFF
  0xC00C  | Items check data           | variable | 0xFFFF
  0xC00E  | Cavern name rendering info | variable | -
  0xC010  | Monsters                   | 16 bytes | 0xFFFF

0xE000-0xE8FF (2304 bytes) - Proximity Map
  - 36 columns × 64 rows
  - Centered on hero's X coordinate
  - Scrolls as hero moves (1 column at a time)
  - Missing columns unpacked from MDT file
  - Full cavern width varies (e.g., Cavern Malicia = 240 columns)
  - Height is always 64 rows

0xE900-0xEB13 (28*19 bytes) - Viewport Buffer
  - 1 byte per monster or other object (monster ID/type)

WASM Memory Layout (same offsets for compatibility):
─────────────────────────────────────────────────────────────
0x0000-0x00FF: SaveData struct (g_save_data)
0xC000-0xDFFF: MDT dungeon data (g_mdt_data)
0xE000-0xE8FF: Proximity map (g_proximity_map)
0xE900-0xEB13: Viewport buffer (g_monster_ids)
0xEB14-0xFFFF: Global variables (g_globals)
```

### 12.3 Coordinate System

- **X**: 0-35 (36 columns), wraps at edges
- **Y**: 0-63 (64 rows), wraps at top/bottom
- **Viewport**: Centered on hero, 28×19 tiles
- **Hero X in viewport**: 0x10 (16) = center
- **Hero Y relative**: Calculated from viewport offset

### 12.4 Bit Fields

Many bytes use individual bits as flags:

```c
// Example: monster.flags
#define MONSTER_AI_TYPE_MASK    0x0F
#define MONSTER_BIG_MONSTER     0x01

// Example: monster.field_5
#define MONSTER_HIT_BY_HERO     0x20
#define MONSTER_DIRECTION_MASK  0x80

// Example: starting_direction
#define DIR_HORIZONTAL_MASK     0x01  // 0=Right, 1=Left
#define DIR_VERTICAL_MASK       0x02  // 0=Normal, 1=Squat
```

---

## 13. Future Sessions Checklist

Bring this document to future coding sessions. Key reference points:

- [ ] Section 2: Data structures (copy-paste ready)
- [ ] Section 3: Core system function signatures
- [x] Section 4: AI behavior implementations (COMPLETE)
- [x] Section 5: WASM build and integration (COMPLETE)
- [ ] Section 7: Porting phases (find C equivalent)
- [ ] Section 10: Assembly function mapping (find C equivalent)
- [ ] Section 12: Notes & gotchas (avoid common mistakes)

---

## Appendix A: Original File Info

**Fight.asm**
- Format: IDA Pro disassembly
- Compiler: GNU C++ (original)
- Input: FIGHT.BIN
- Base: 0x6000
- Length: 0x3F2E bytes
- Lines: 10,607

**eai1.asm**
- Format: IDA Pro disassembly
- Input: EAI1.BIN
- Base: 0xA000
- Length: 0x0737 bytes
- Lines: 1,199

---

## Appendix C: Implementation Status Summary

### Completed Systems (March 23, 2026)

| System | File | Lines | Status |
|--------|------|-------|--------|
| Memory layout | src/data.c | - | ✅ Complete |
| MDT loading | src/mdt.c | - | ✅ Complete |
| Map unpacking | src/unpack.c | ~200 | ✅ Complete |
| Monster AI (all 4 types) | src/monster_ai.c | ~960 | ✅ Complete |
| Cavern game loop | src/cavern.c | ~270 | ✅ Complete |
| **Collision detection (8 directions)** | **src/collision.c** | **~700** | **✅ Complete** |
| **Hero physics (jump, rope)** | **src/physics.c** | **~620** | **✅ Complete** |
| WASM build | build.sh | - | ✅ Complete |

### Remaining Work

**All major systems complete!** 

Future enhancements (optional):
- Port additional boss AIs (Pulpo, Pollo, etc.) if they exist in separate files
- Implement boss health bar rendering in JavaScript
- Add boss-specific sound effects/music
- Implement boss defeat cutscenes/transitions

| System | Priority | Complexity | Notes |
|--------|----------|------------|-------|
| Input handling | ✅ Complete | Low | JS → WASM interface |
| Hero state machine | ✅ Complete | High | Fight.asm 0x6343 |
| Combat completion | ✅ Complete | Low | Monster death/rewards |
| Door/item interactions | ✅ Complete | Medium | hero_interaction_check |
| Boss battles | ✅ Complete | High | crab.asm, byte_FF34, minion spawn |

### Build Output

```
$ ./build.sh
=== Zeliard WASM Build (clang) ===
Found clang: Ubuntu clang version 18.1.3 (1ubuntu1)
Compiling to WebAssembly...
✓ Build complete!
  Output: build/zeliard.wasm (26KB)
```

---

## Appendix D: Quick Reference

```c
// Most-used constants
#define MAP_WIDTH 36
#define DUNG_HEIGHT 64
#define MONSTER_COUNT 32
#define VIEWPORT_W 28
#define VIEWPORT_H 19

// Most-used functions
Cavern_Game_Init();           // Initialize dungeon
main_loop();                  // Process one frame
Monster_AI(Monster*);         // Update monster
check_collision_E2();         // Check east collision
Get_Stats(stat_id);           // Get hero stat
```

---

**END OF PORTING PLAN**
