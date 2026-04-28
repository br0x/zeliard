# Zeliard Dungeon Engine & Monster AI Porting Plan

## Project Goal

Port `*.asm` from x86 assembly to C, compile to WebAssembly, and integrate with existing JavaScript rendering. The goal is to preserve **exact original physics and AI behavior** while replacing sprite graphics with alternative rendering and skipping music or optionally using OPL port. Also, all memory regions from original assembly should be preserved
Any variable needed for implementation, should be outside of the original memory regions. Since webassembly has linear memory, it is no problem to use any memory region outside of the above ranges.

**Date Created:** March 20, 2026
**Last Updated:** April 27, 2026 (Dungeon initialization system FULLY IMPLEMENTED - prepare_dungeon complete!)
**Source Files:**
- TODO

---

## Current Status

## 1. Architecture Overview


### 1.2 Memory Layout (Detailed)
┌───────────────────────────────────┬───────────────────────────────────────────────┐
|              Address              | Description                                   |
├─────────────────┬─────────────────┤                                               |
| DOS             | WASM            |                                               |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
| seg0:           |                 |                                               |
|   0x0000-0x00FF | 0x00000-0x000ff | SaveData struct (g_save_data)                 |
|   0x0100-0x01FF | 0x00100-0x001ff |                                               |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
| seg1:           |                 |                                               |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
| seg2:           |                 |                                               |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
| seg3:           |                 |                                               |
└─────────────────┴─────────────────┴───────────────────────────────────────────────┘

### 1.3 Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Window                         │
├─────────────────────────────────────────────────────────────┤
│  JavaScript (game.js)                                       │
│  ├── Input handling (keyboard)                              │
│  ├── Canvas rendering (text characters)                     │
│  ├── Map loading                                            │
│  └── WASM bridge                                            │
├─────────────────────────────────────────────────────────────┤
│  WebAssembly (fight.wasm)                                   │
│  ├── fight.c        - Dungeon engine (Fight.asm port)       │
│  ├── monster_ai_N.c - Monster AI (eaiN.asm port)            │
│  ├── town.c         - Collision detection                   │
│  └── data.c         - Global state                          │
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

### 2.3 MDT Dungeon Data Structures (loaded at 0xC000)

### 2.4 Viewport Buffer (active, 0xE900)


## 3. Core Systems

### 3.1 Game Loop


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
