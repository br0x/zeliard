# Zeliard WASM Build

WebAssembly port of Zeliard dungeon engine.

## Prerequisites

Install **Emscripten**


## Build

```bash
# from the repository root
make
```

This creates `build/zeliard.js` + `build/zeliard.wasm`.

## Test

```bash
# Start a local server
python3 -m http.server 8000

# Open in browser
http://localhost:8000/index.html
```
