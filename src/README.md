# Zeliard WASM Build

WebAssembly port of Zeliard dungeon engine.

## Prerequisites

Install **Emscripten**


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
http://localhost:8000/index.html
```
