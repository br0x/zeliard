# Zeliard WASM - Build Complete ✅

WebAssembly port of Zeliard dungeon engine using **clang** (no Emscripten required).

## Build Status

✅ **Build successful** - `build/zeliard.wasm` (2.3 KB)

## Quick Start

```bash
# Build
./build.sh

# Test server
python3 -m http.server 8000

# Open in browser
# http://localhost:8000/index.html
```

## What Works Now

- ✅ 64KB linear memory mapped
- ✅ Memory layout at correct offsets:
  - `0x0000` - Save data
  - `0xC000` - MDT dungeon data
  - `0xE000` - Proximity map (36×64)
  - `0xE900` - Monster buffer (1 byte/monster)
  - `0xFF00` - Global variables
- ✅ MDT file loader
- ✅ JavaScript bridge with native WebAssembly API

## Test Page

Open `test-mdt.html` to verify:
- WASM module loads
- MP10.MDT loads at 0xC000
- MDT header parsed correctly
- Cavern name extracted
- Monster buffer populated
- Memory accessible from JS

## API Example

```javascript
import { initWasm, loadMdt, getCavernName } from './src/zeliard-wasm.js';

await initWasm();
const mdtData = await fetch('WORK/MP10.MDT').then(r => r.arrayBuffer());
loadMdt(new Uint8Array(mdtData));
console.log('Cavern:', getCavernName());
```

## Next Steps

1. ⏳ Implement proximity map unpacking from full MDT
2. ⏳ Port hero physics (input, movement, collision)
3. ⏳ Port monster AI (eai1.asm)
4. ⏳ Add rendering callbacks to JS

## Build Details

```bash
clang --target=wasm32 -nostdlib -ffreestanding -fno-builtin \
    -Wl,--no-entry -Wl,--export-all \
    -Wl,--initial-memory=67108864 \
    -O2 -o build/zeliard.wasm src/*.c
```

Flags explained:
- `--target=wasm32`: WebAssembly target
- `-nostdlib`: No C standard library
- `-ffreestanding`: Freestanding environment
- `-fno-builtin`: Disable builtin functions
- `--export-all`: Export all functions to JS
- `--initial-memory=64MB`: Match DOS memory model
