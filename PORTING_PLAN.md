# Zeliard Game Porting Plan

## Project Goal

Port all `*.asm` from x86 assembly to C, compile to WebAssembly with Emscripten, and integrate with JavaScript. The goal is to preserve **exact original logics and AI behavior** while replacing sprite graphics with alternative rendering and skipping music or optionally using OPL port. Also, all memory regions from original assembly should be preserved
Any variable needed for implementation, should be outside of the original memory regions. Since webassembly has linear memory, it is no problem to use any memory region outside of the above ranges.

---

## Current Status

## 1. Architecture Overview


### 1.2 Memory Layout
┌───────────────────────────────────┬───────────────────────────────────────────────┐
|              Address              |                                               |
├─────────────────┬─────────────────┤           Asm source, description             |
| DOS             | WASM (linear)   |                                               |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
| seg0:           |                 |                                               |
|   0x0000-0x00ff | 0x00000-0x000ff | SaveData area. When restarted, stdply.bin     |
|                 |                 | loads here, otherwise user's save file loaded |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0x0100-0x1135 | 0x00100-0x01135 | stick.asm (low level stuff)                   |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0x2000-0x2cc8 | 0x02000-0x02cc8 | gmmcga.asm (video lib common)                 |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0x3000-0x51d4 | 0x03000-0x051d4 | gdmcga.asm (video lib for opening demo)       |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0x3000-0x44ee | 0x03000-0x044ee | gtmcga.asm (video lib for towns)              |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0x3000-0x535c | 0x03000-0x0535c | gfmcga.asm (video lib for caverns)            |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0x6000-0x9628 | 0x06000-0x09628 | opdemo.asm (opening demo) - implemented in js |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0x6000-0x7c7c | 0x06000-0x07c7c | town.asm (towns logic)                        |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0x6000-0x9f2d | 0x06000-0x09f2d | fight.asm (caverns logics)                    |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0xa000-0xa475 | 0x0a000-0x0a475 | game.asm (initial loader)                     |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
|   0xff00-0xffff | 0x0ff00-0x0ffff | Shared data. Note that music_seg overlaps the |
| (=0x0000-0x00ff |                 | seg0 by 100h bytes (10h paragraphs)           |
|   in music_seg) |                 |                                               |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
| seg1:           |                 |                                               |
|   0x0000-0xffff | 0x10000-0x1ffff | TBD                                           |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
| seg2:           |                 |                                               |
|   0x0000-0xffff | 0x20000-0x2ffff | TBD                                           |
├─────────────────┼─────────────────┼───────────────────────────────────────────────┤
| seg3:           |                 |                                               |
|   0x0000-0xffff | 0x30000-0x3ffff | TBD                                           |
└─────────────────┴─────────────────┴───────────────────────────────────────────────┘

### 1.3 Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Window                         │
├─────────────────────────────────────────────────────────────┤
│  JavaScript (game.js)                                       │
│  ├── Input handling (keyboard)                              │
│  ├── Canvas rendering                                       │
│  ├── Binaries/resources loading                             │
│  └── WASM bridge                                            │
├─────────────────────────────────────────────────────────────┤
│  WebAssembly                                                │
│  ├── town.c         - Town engine (town.asm port)           │
│  ├── fight.c        - Dungeon engine (fight.asm port)       │
│  ├── eai{N}.c       - Monster AI (eai{N}.asm port)          │
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


## 5. WASM Build and Integration


### 5.3 JavaScript Integration

**How JS Accesses WASM:**

1. **Memory Access:** JavaScript reads WASM memory directly via `WebAssembly.Memory`
2. **Function Calls:** JS calls exported functions via `instance.exports`
3. **Data Structures:** C structs are laid out at fixed offsets matching original DOS


### 5.3 Updated Game Loop (JavaScript)

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
├── build/
|   └── zeliard.wasm        # Generated WASM binary
├── src/                    # source files
|   ├── zeliard-wasm.js     # WASM JavaScript bridge
│   ├── town.c              # Town engine (town.asm port)
│   ├── zeliard.h           # Public API
│   ├── data.c              # Global state
│   └── Makefile            # Emscripten build
└── PORTING_PLAN.md         # This document
```

---

---

## 11. Testing Strategy

### 11.1 Unit Tests

### 11.2 Integration Tests

### 11.3 Visual Testing


---


### 12.3 Coordinate System

#### 12.3.1 Proximity Map
Memory area at seg0:0xe000-0xe900 (36*64 bytes)
It maps game objects in proximity of the hero. The map is linear and wraps at 0xe000 and 0xe900.
There are methods to convert address in the proximity map to coordinates, and vice versa.
- **X**: 0-35 (36 columns)
- **Y**: 0-63 (64 rows)

#### 12.3.2 Viewport

- **Viewport**: Centered on hero, 28×19 tiles

