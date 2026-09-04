# Performance Optimization History: Input Lag on Later Levels

> **Historical note.** This document describes an early investigation and the
> fixes that were applied to the WASM-era runtime. Phases 1–3 were
> implemented; phases 4–5 were superseded by the migration to pure
> TypeScript (see [MIGRATION_HISTORY.md](MIGRATION_HISTORY.md)). The engine
> now runs in TypeScript with no WASM boundary, so main-thread contention
> is dramatically lower than the original architecture this doc measured.
>
> The original `game.js` is now `web/src/main.ts` plus owner modules under
> `web/src/`, and `src/zeliard-wasm.js` is gone entirely (the bridge was
> deleted in Stage 10 along with the rest of `web/src/wasm/`).
>
> Phase 4 (RAF-on-demand) and Phase 5 (message batching) remain relevant
> if input lag ever resurfaces; the diagnosis procedure (which worklet
> message is stalling, what main-thread work runs between ticks) still
> applies to the current code.

## Problem Summary (historical)

Direction keys feel laggy/unresponsive on later dungeon levels (mp40–mp62).
Root cause was **main thread contention**: heavier WASM game logic on
later levels delayed AudioWorklet `slow_tick` message processing, which
writes the direction-key state (`ADDR_INPUT_DIRS`) that
`state_machine_dispatcher()` reads for hero movement.

## Architecture (historical)

```
AudioWorklet (236 Hz) ─> postMessage ─> Main Thread (port.onmessage)
       │                                    │
       │  full_tick: sound+music poll       │  _onWorkletMessage (sound-manager.js:315)
       │  slow_tick: (every 5th tick)       │    ├── _soundDrvPoll()
       │                                    │    ├── _musicDrvPoll()
       │                                    │    ├── onFullTick()  ← WASM dungeonUpdate (3-phase frame machine)
       │                                    │    │     Phase 0: input_handling() + monsters_spawning() + main_update_render_pre()
       │                                    │    │     Phase 2: dungeon_finish_normal_frame() → state_machine_dispatcher() reads ADDR_INPUT_DIRS
       │                                    │    └── onSlowTick()  ← inputSetKeys(keys) writes ADDR_INPUT_DIRS
                                            │
RAF (60 Hz) ──requestAnimationFrame──>  draw()  ← drawDungeonEntities, animateDungeonTiles, etc.
```

Messages are processed **sequentially**. If `onFullTick` (WASM logic)
exceeded the ~4.2 ms between ticks, the next `slow_tick` message queued
behind pending `full_tick` messages, delaying `inputSetKeys(key)` → stale
`ADDR_INPUT_DIRS` → input lag.

## Root Cause Details (historical)

1. **Heavy WASM per `onFullTick` on later levels** (C reference: `dungeon.c:4528` `dungeon_update_normal`):
   - Phase 0 calls `main_update_render_pre()` (C reference: `dungeon.c:4270`)
     which calls `monsters_spawning()` (C reference: `dungeon.c:2770`) —
     iterates the entire monster table (16-byte structs, 0xFFFF terminator)
     and runs `Monster_AI(m)` for each monster in proximity.
   - Later levels use EAI5 (967 lines) / EAI6 (841 lines) vs EAI1 (610
     lines), each `Monster_AI` call does more work.
   - Additional per-frame features on later levels: airflows (level 5+),
     ice/sliding physics, projectiles, more active monsters in proximity.
   - In the current TypeScript runtime the equivalent work lives in
     `web/src/engine/dungeon-monsters.ts`, `dungeon-frame-pre.ts`,
     `eai5..8.ts`, etc. With no WASM boundary, the per-call overhead is
     dramatically lower than the original.

2. **Excessive `Uint8Array` allocations from `readMemory`** (C reference: `src/zeliard-wasm.js:686`):
   ```js
   return new Uint8Array(wasmMemory.buffer, gMemoryBase + offset, length);
   ```
   - `onFullTick` (game.js:1791): ~4–9 allocations per call → 900–2,100 allocs/sec
   - `drawDungeonEntities` (game.js:3144): `readU8(si)` for every viewport tile
     (~560 per frame) → ~33,600 allocs/sec, plus 4 more per entity in `getSheetFrame`
   - `animateDungeonTiles` (game.js:3063): ~1,120 read+write calls per frame on
     cavern levels 5–8 → ~67,200 allocs/sec
   - The current engine has no WASM boundary; typed state objects
     (`web/src/core/game-state.ts`) read directly from the shared
     `Uint8Array`, and per-frame buffer reads are batched.

## Optimization Plan

### Phase 1: Decouple Input Frequency (Highest Priority — Fixes Input Lag)

**Problem**: `inputSetKeys` is only called in `onSlowTick` (47 Hz). If `onFullTick`
takes too long, the `slow_tick` message is delayed, and `ADDR_INPUT_DIRS` becomes stale.

**Fix**: Write input keys in `onFullTick` **before** calling `dungeonUpdate`, so input
is refreshed at 236 Hz instead of being gated by `slow_tick` message timing.

**File**: `game.js`

```javascript
function onFullTick() {
    if (gamePaused) return;
    frameTimer = ...;

    if (gameMode === 'dungeon') {
        dungeonFullTick?.();
    }

    if (engineReady) {
        // Write input keys every full tick so input is never stale
        // when dungeonUpdate reads it in phase 2.
        inputSetKeys(keys);   // <-- NEW: refresh input at 236 Hz

        const speedC = readMemory(ADDR_SPEED_CONST, 1)[0] || 5;
        const target = speedC * 4;
        const frameTmr = readMemory(ADDR_FRAME_TIMER, 1)[0];
        ...
    }
}
```

**Risk**: Minimal. `inputSetKeys` is a pure write to `ADDR_INPUT_DIRS` — no side effects
beyond what `onSlowTick` already does. The `onSlowTick` handler still handles
`updateInputLatches` (space/alt edge detection) and town-mode conversation logic.

### Phase 2: Eliminate `readMemory` GC Pressure (High Priority — Reduces GC Pauses) — ✅ DONE

**Status**: Implemented. `src/zeliard-wasm.js` caches a g_mem-relative `Uint8Array`
view (`gMemView`) that is rebuilt whenever WASM memory grows (the old buffer is
detached by `memory.grow`), so cached views never go stale. `getWasmMemory()`
returns the cached view, `readMemory()`/`writeMemory()` use `subarray()`/`set()`
on it. `game.js` gained a `gMem(addr)` accessor (direct indexed access, zero
allocation) and `readU8`/`readU16` now read through it; the 236 Hz `onFullTick`
and per-frame dungeon/town render loops use `gMem()` instead of `readMemory(addr,1)`.

**Problem**: Every `readMemory(addr, 1)` / `readU8` call allocates a new `Uint8Array`,
causing GC pauses that further delay message processing.

**Fix**: Cache a persistent `Uint8Array` view and use direct indexed access instead of
`new Uint8Array(...)` on every call.

**File**: `src/zeliard-wasm.js`

```javascript
// At module level, after wasmMemory is set:
let _gMemView = null;  // cached Uint8Array view starting at g_mem base

export function getWasmMemory() {
    if (!wasmMemory) return null;
    if (!wasmMemory || wasmMemory.buffer !== wasmExports.memory.buffer) {
        wasmMemory = new Uint8Array(wasmExports.memory.buffer);
    }
    if (!_gMemView || wasmMemory.buffer !== _gMemView.buffer) {
        _gMemView = wasmMemory.subarray(gMemoryBase);
    }
    return _gMemView;
}

export function readMemory(offset, length) {
    if (!_gMemView) getWasmMemory();
    // Return a *view* (still creates a subarray, but cheaper than new Uint8Array)
    return _gMemView.subarray(offset, offset + length);
}
```

Even better — replace `readU8`/`readU16` hot-path calls with direct `_gMemView[addr]`
access in game.js, avoiding `Uint8Array` allocation entirely:

```javascript
// game.js — add a cached view accessor
function gMem(addr) {
    if (!_gMemView) _gMemView = getWasmMemory();
    return _gMemView[addr];
}
```

Then replace `readU8(addr)` → `gMem(addr)` in hot loops.

**Files to update**:
- `src/zeliard-wasm.js`: cache view in `readMemory`, add `getCachedMemoryView()`
- `game.js`: replace `readU8`/`readU16` with direct view access in:
  - `onFullTick` (lines ~1802–1830)
  - `drawDungeonEntities` (line ~3241: `readU8(si)`)
  - `drawDungeonHero` / `drawDungeonTiles`
  - `getDungeonHeroState` (lines ~3266–3278)

**Risk**: Low. `subarray` returns a view (no allocation) unlike `new Uint8Array(...)`.
Direct indexed access is the simplest change with the biggest allocation reduction.

### Phase 3: Batch-Read Proximity Map in `drawDungeonEntities` (Medium Priority) — ✅ DONE

**Status**: Implemented. `drawDungeonEntities` reads the whole 36×64 proximity map
once (`readMemory(ADDR_PROXIMITY_MAP, PROX_SIZE)`) and indexes the local array
with `proxMap[si - ADDR_PROXIMITY_MAP]` (always in range since
`wrapProximityAddress` bounds `si` to the circular buffer). `getSheetFrame` reads
the 16-byte monster entry once instead of four single-byte lookups. `animateDungeonTiles`
also batch-reads the map and writes animated tiles directly into the shared WASM
view (`proxMap[idx] = nextTile`), dropping per-tile `writeMemory` calls entirely.

**Problem**: `drawDungeonEntities` (game.js:3238–3250) calls `readU8(si)` for **every**
tile in the viewport (~560 calls, each allocating a `Uint8Array`). On later levels with
more monsters, `getSheetFrame` adds 4 more allocations per entity.

**Fix**: Read the entire proximity map into a single `Uint8Array` once (like
`drawDungeonTiles` already does at game.js:2665), then iterate the local array:

```javascript
function drawDungeonEntities() {
    if (!dungeonEntitySheetReady || !readMemory) return;

    const proxMap = readMemory(ADDR_PROXIMITY_MAP, PROX_COLS * DUNGEON_MAP_HEIGHT);
    const viewportLeftTop = readU16(ADDR_VIEWPORT_LEFT_TOP);

    for (let row = -1; row < VIEW_ROWS; row++) {
        let si = wrapProximityAddress(viewportLeftTop + row * PROX_COLS + 3);
        for (let col = -1; col < VIEW_COLS; col++, si = wrapProximityAddress(si + 1)) {
            const entityId = proxMap[si];  // direct array access, no allocation
            if (!(entityId & 0x80)) continue;

            drawEntity(getSheetFrame(entityId), col, row);
            ...
        }
    }
}
```

Similarly, `getSheetFrame` should read monster data from a cached view instead of
multiple `readU8`/`readU16` calls.

**Files to update**:
- `game.js`: `drawDungeonEntities`, `getSheetFrame`, `animateDungeonTiles`
- `src/zeliard-wasm.js`: add `getCachedMemoryView()` export

**Risk**: Low. Same memory contents, just batched reads.

### Phase 4: Skip Rendering When Not Needed (Medium Priority)

**Problem**: `draw()` runs at 60 Hz via `requestAnimationFrame` regardless of whether
WASM has produced a new frame. This wastes CPU on rendering that may never change,
competing with worklet message processing.

**Fix**: Only render when WASM signals a render request, otherwise yield the frame:

```javascript
function loop(timestamp) {
    if (timestamp > lastTimestamp) fpsEl.textContent = ...;
    lastTimestamp = timestamp;

    if (gameMode === 'dungeon') {
        // Only render when WASM sets ADDR_RENDER_REQUEST
        const renderRequested = readMemory(ADDR_RENDER_REQUEST, 1)[0] !== 0;
        if (renderRequested) {
            draw();
        }
        // If no render request, skip draw() entirely
    } else {
        draw();
    }

    requestAnimationFrame(loop);
}
```

**Risk**: Medium. Need to ensure WASM always sets `ADDR_RENDER_REQUEST` when
something changes. The original DOS code used `Flush_Ui_Element_If_Dirty_proc`
(game.c:4319) which sets this flag. If some rendering path doesn't set the flag,
those visuals won't update. Should be verified with testing.

### Phase 5: Batch Worklet Messages (Low Priority — Architectural)

**Problem**: Each `full_tick` and `slow_tick` message is processed individually.
If the main thread can't keep up with 236 Hz, messages pile up.

**Fix**: Instead of processing each message immediately in `port.onmessage`,
accumulate message types in a small buffer and process them in a batch. This
reduces the overhead of message dispatch and ensures consistent processing order.

```javascript
// sound-manager.js
this._pendingFullTicks = 0;
this._pendingSlowTick = false;

this._pitNode.port.onmessage = (e) => {
    switch (e.data.type) {
        case 'full_tick':
            this._pendingFullTicks++;
            break;
        case 'slow_tick':
            this._pendingSlowTick = true;
            break;
    }
    if (!this._processing) {
        this._processing = true;
        Promise.resolve().then(() => this._processQueuedMessages());
    }
};

_processQueuedMessages() {
    if (this._pendingSlowTick && this._onSlowTick) {
        this._onSlowTick();
        this._pendingSlowTick = false;
    }
    if (this._pendingFullTicks > 0) {
        this._soundDrvPoll();
        this._musicDrvPoll();
        if (this._onFullTick) this._onFullTick();
        this._pendingFullTicks = 0;
    }
    this._processing = false;
}
```

**Risk**: High. This fundamentally changes the timing model. The original
game logic depends on exactly-once processing per tick. Batching could cause
input to be read multiple times per frame or skip ticks. Should only be
attempted after Phase 1–3 are validated.

## Implementation Order

| Phase | Priority | Effort | Impact on Input Lag | Status |
|-------|----------|--------|---------------------|--------|
| 1     | High     | Low    | **Direct fix** — input written at 236 Hz | ✅ Done (WASM era) |
| 2     | High     | Low    | Reduces GC pauses that delay ticks | ✅ Done (WASM era) |
| 3     | High     | Low    | Eliminates ~33K allocs/sec from rendering | ✅ Done (WASM era) |
| 4     | Medium   | Medium | Reduces 60 Hz RAF contention | Deferred (current `requestAnimationFrame` loop in `web/src/main.ts` re-renders only on `renderRequest` change for the dungeon side) |
| 5     | Low      | High   | Architectural — only if 1–4 insufficient | Superseded by TS migration |

The TS migration removed the WASM boundary entirely, which is the dominant
fix for all three root causes; Phase 5 became unnecessary.

## File Locations Reference (historical → current)

| Original | Current | Notes |
|----------|---------|-------|
| `game.js:1791` `onFullTick` | `web/src/main.ts` tick dispatch | WASM-era fix added `inputSetKeys(keys)` per full tick |
| `game.js:1860` `onSlowTick` | `web/src/main.ts` slow-tick handler | Keeps `updateInputLatches` + town-mode conversation logic |
| `game.js:2664` `drawDungeonTiles` | `web/src/render/dungeon.ts` | Batch-reads proximity map (Phase 3 pattern) |
| `game.js:~3256` `drawDungeonEntities` | `web/src/render/dungeon.ts` | Batch-reads proximity map into local array |
| `game.js:~3183` `getSheetFrame` | `web/src/render/dungeon.ts` frame helpers | Batch-reads 16-byte monster entry |
| `game.js:3075` `animateDungeonTiles` | `web/src/render/dungeon-logic.ts` (`nextAnimatedTile` etc.) | Pure rule extract; per-tile reads/writes batched |
| `game.js:5362` `loop` | `web/src/main.ts` RAF loop | |
| `src/zeliard-wasm.js:707` `readMemory` | `web/src/core/ts-memory.ts` `gMemView` accessors | Cached `Uint8Array` view, rebuilt only on growth (n/a in TS) |
| `src/zeliard-wasm.js:723` `writeMemory` | `web/src/core/ts-memory.ts` `memWrite*` | `Uint8Array.set()`-based |
| `src/zeliard-wasm.js:140` `refreshMemViews` | n/a | No WASM memory grow |
| `src/zeliard-wasm.js:161` `getWasmMemory` | `getGmem()` in `web/src/core/ts-memory.ts` | Returns the live `Uint8Array` directly |
| `sound-manager.js:315` `_onWorkletMessage` | `web/src/audio/sound-manager.ts` | Sequential message dispatch |
| `pit-worklet.js:110` `_fireTick` | `web/public/pit-worklet.js` | Fires `full_tick` + `slow_tick` messages |
| C reference `src/dungeon.c:2770` `monsters_spawning` | `web/src/engine/dungeon-monsters.ts` `monsters_spawning` | Iterates monster table |
| C reference `src/dungeon.c:4270` `main_update_render_pre` | `web/src/engine/dungeon-frame-pre.ts` | Calls airflows, platforms, magia stones, doors |
| C reference `src/dungeon.c:4528` `dungeon_update_normal` | `web/src/engine/dungeon-state-machine.ts` `wasm_dungeon_update` state switch | 3-phase frame machine |
| C reference `src/dungeon.c:3665` `state_machine_dispatcher` | `web/src/engine/dungeon-state-machine.ts` | Reads `ADDR_INPUT_DIRS` at 0xFF17 |
| C reference `src/data.c:66` `wasm_set_input_keys` | `web/src/engine/input.ts` `setInputKeys` | Writes `ADDR_INPUT_DIRS` |
