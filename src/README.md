# Zeliard WASM Build

WebAssembly port of Zeliard dungeon engine.

## Prerequisites

Install **clang** with WebAssembly support:

```bash
# Ubuntu/Debian
sudo apt install clang

# macOS
xcode-select --install

# Windows
# Install LLVM from https://llvm.org
```

## Build

```bash
./build.sh
```

This creates `build/zeliard.wasm`.

## Test

```bash
# Start a local server
python3 -m http.server 8000

# Open in browser
http://localhost:8000/test-mdt.html
```

## Memory Layout

| Region | Address | Size | Purpose |
|--------|---------|------|---------|
| Save Data | 0x0000 | 256 bytes | Game save state (xxx.sav) |
| MDT Data | 0xC000 | ~8KB | Dungeon data from *.mdt files |
| Proximity Map | 0xE000 | 2304 bytes | 36×64 tile map around hero |
| Monster Buffer | 0xE900 | 256 bytes | Monster IDs (1 byte each) |
| Globals | 0xFF00 | 256 bytes | Runtime variables |

## API

### JavaScript

```javascript
import { 
    initWasm,           // Initialize WASM module
    loadMdt,            // Load MDT file at 0xC000
    initCavern,         // Initialize cavern with spawn point
    getMdtHeader,       // Get MDT header offsets
    getCavernName,      // Get cavern name string
    getMonsterBuffer,   // Get monster IDs (0xE900)
    getProximityMap,    // Get tile map (0xE000)
    getSaveData,        // Get hero stats
    readMemory,         // Read raw bytes from memory
    update              // Run one game frame
} from './src/zeliard-wasm.js';

// Usage:
await initWasm();
const mdtData = await fetch('WORK/MP10.MDT').then(r => r.arrayBuffer());
loadMdt(new Uint8Array(mdtData));
console.log('Cavern:', getCavernName());
console.log('Monsters:', getMonsterBuffer());
```

### C

```c
#include "zeliard.h"

// Initialize engine
wasm_init();

// Load MDT file (data copied to 0xC000)
wasm_load_mdt(mdt_data, mdt_size);

// Initialize cavern
wasm_init_cavern(spawn_x, spawn_y, direction);

// Access memory regions directly
SaveData* save = (SaveData*)&g_memory[0x0000];
uint8_t* monsters = &g_memory[0xE900];
uint8_t* map = &g_memory[0xE000];
```

## Project Structure

```
src/
├── zeliard.h         # Header with types and API
├── fight.c         # Main engine (wasm_init, wasm_update)
├── data.c          # Memory layout (64KB array)
├── mdt.c           # MDT file loader
├── zeliard-wasm.js # JavaScript bridge (native WebAssembly API)
└── Makefile        # Emscripten build (optional)

build.sh            # Clang build script
test-mdt.html       # Test page
```

## Build Details

The build uses clang with these flags:

```bash
clang --target=wasm32 -nostdlib \
    -Wl,--no-entry \
    -Wl,--export-all \
    -Wl,--export=__heap_base \
    -Wl,--export=__data_end \
    -Wl,--initial-memory=67108864 \
    -O2 -o build/zeliard.wasm src/*.c
```

- `--target=wasm32`: Compile to WebAssembly
- `-nostdlib`: No standard library (we don't need it)
- `--export-all`: Export all functions for JS access
- `--initial-memory=64MB`: Match original DOS memory model

## Next Steps

1. ✅ Load MDT files at 0xC000
2. ✅ Access memory from JavaScript
3. ⏳ Implement proximity map unpacking from MDT
4. ⏳ Port hero physics (input, movement, collision)
5. ⏳ Port monster AI (eai1.asm)
6. ⏳ Add rendering callbacks to JS
