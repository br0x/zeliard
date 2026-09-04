# Zeliard Web Porting Plan

## Project Goal

Port all `*.asm` from x86 assembly to C, compile to WebAssembly with Emscripten, and integrate with JavaScript. The goal is to preserve **exact original logics and AI behavior** while replacing sprite graphics with alternative rendering and skipping music or optionally using OPL port. Also, all memory regions from original assembly should be preserved. Any variable needed for implementation should be outside of the original memory regions — since WebAssembly has linear memory, it is no problem to use any region outside the ranges above.

---

## Current Status (August 2026)

The game is **fully playable from the title screen through the town ↔ dungeon loop**, live at https://br0x.github.io/zeliard/

**Working:**
- Opening intro (opdemo.asm) — `opening-intro.js`
- Town engine (town.asm) — `src/town.c`
- Dungeon engine (fight.asm) — `src/dungeon.c`
- Monster AI for caverns 1–4 — `src/eai1.c` … `src/eai4.c` + `eai1_data.c`
- Bosses: Cangrejo (`src/crab.c`), Pulpo (`src/tako.c`), Pollo (`src/tori.c`), **Agar (`src/zela.c`) — just added, being wired up (current work-in-progress, uncommitted)**
- Town people/building scenes (King, Princess, Sage, Weapon Shop, Witchcraft Shop, Church, Bank, Inn) — `indoor-*.js`
- Inventory screen — `inventory-screen.js`
- Save/Restore/Export/Delete menus — `save-restore-ui.js`, `import-export-ui.js`
- Tear-collection rokademo after boss fights — implemented in JS, final version committed (`9b966aa`)
- PIT timer emulation via AudioWorklet — `pit-worklet.js` + `sound-manager.js`
- Speed toggle (F9) between full/slow tick rate

**Not yet ported / future work:**
- `src/dungeon.c` `load_eai_module()` (`dungeon.c:5197`) only wires `eai1–eai4` (map IDs 0–10). Caverns 5+ (Tumba, Dorado, Llama, Pureza, Esco) need `eai5–eai8` disassembly → C port.
- Remaining bosses: Vista (mp5d), Tarso (mp6d), Paguro (mp7d), Dragon (mp8d), Jashiin (mpa0).
- Dungeon graphics: PNG sheets only exist for `mpp1–mpp4` / `enp1–enp4`; `mpp5–mppb` / `enp5–enp8` `.grp` files exist in `game/0/` but no PNGs yet.
- `DUNGEONS` config in `game.js:412` covers map IDs 0–10; dungeons 11+ are not configured.
- Several asm modules handled in JS rather than C (see module map below) — `select.asm` (inventory) and `opdemo.asm` are JS; `gfmcga.asm` is partially ported with many "rendering handled in js" stubs.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Window                         │
├─────────────────────────────────────────────────────────────┤
│  JavaScript (game.js + modules)                             │
│  ├── Input handling (keyboard)                              │
│  ├── Canvas rendering (all drawing)                         │
│  ├── Binary/resource loading (MDT, GRP, music, SFX)         │
│  ├── Audio (AudioWorklet PIT emulation + WebAudio)          │
│  └── WASM bridge (src/zeliard-wasm.js)                      │
├─────────────────────────────────────────────────────────────┤
│  WebAssembly                                                 │
│  ├── data.c      - Global state + g_mem[0x40000]            │
│  ├── town.c      - Town engine (town.asm)                   │
│  ├── dungeon.c   - Dungeon engine (fight.asm)               │
│  ├── eai1-4.c    - Monster AI (eai1-4.asm)                  │
│  ├── crab/tako/tori/zela.c - Boss AI                        │
│  ├── gfmcga.c    - Cavern video lib (partially ported)      │
│  ├── unpack.c    - RLE data unpacking                       │
│  └── eai1_data.c - Monster AI data tables                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 Control flow

- **Full tick (236.7 Hz, from PIT worklet):** `wasm_dungeon_full_tick` / `wasm_town_full_tick` — sound/music drivers, frame counters.
- **Slow tick (every 5th tick ≈ 47 Hz):** input + game logic via `wasm_dungeon_update` / `wasm_town_update`.
- **Rendering:** C never draws. The C side writes render requests / entity state into `g_mem`, and JS reads them each frame:
  - `wasm_dungeon_get_render_request` / `wasm_dungeon_clear_render_request`
  - `wasm_dungeon_get_entity_count` / `wasm_dungeon_get_entity_table`
  - `wasm_dungeon_get_viewport_top`
- **State machine:** dungeon states handled include `NORMAL(0)`, `DEATH_FADE(4)`, `BOSS_ENCOUNTER(5)`, `ROKA_RUN(7)`, `ROKADEMO(9)`. Transitions (dungeon↔town, indoors, boss demos) go through `ADDR_PENDING_DUNGEON_FLAG`-style memory flags read by JS, plus exports like `wasm_town_complete_transition`, `wasm_finish_rokademo_transition`, `wasm_town_building_finish`, `wasm_town_conversation_finish`.

### 1.2 Memory Layout

WASM memory is a flat 256 KB linear buffer: `uint8_t g_mem[0x40000]` in `src/data.c`. Addresses are the original DOS segment:offset addresses. JS reaches it via `wasmMemory.buffer + gMemoryBase` (the offset of `g_mem` in WASM linear memory).

| Region          | Address (seg0) | WASM offset | Contents |
|-----------------|----------------|-------------|----------|
| SaveData        | 0x0000-0x00ff | 0x00000     | Save file; stdply.bin on restart, else user save |
| Low-level       | 0x0100-0x1135 | 0x00100     | stick.asm (low level) |
| Video libs      | 0x2000-0x2cc8 | 0x02000     | gmmcga.asm (video lib common) |
| Video libs      | 0x3000-0x51d4 | 0x03000     | gdmcga.asm (opening demo video) |
| Video libs      | 0x3000-0x44ee | 0x03000     | gtmcga.asm (towns video) |
| Video libs      | 0x3000-0x535c | 0x03000     | gfmcga.asm (caverns video) |
| Overlays        | 0x6000-0x9628 | 0x06000     | opdemo.asm (opening) — implemented in JS |
| Overlays        | 0x6000-0x7c7c | 0x06000     | town.asm (towns logic) |
| Overlays        | 0x6000-0x9f2d | 0x06000     | fight.asm (caverns logic) |
| Loader          | 0xa000-0xa475 | 0x0a000     | game.asm (initial loader) |
| Shared data     | 0xff00-0xffff | 0x0ff00     | Overlaps seg0 by 0x100 bytes; also = music_seg 0x0000 |
| seg1            | 0x0000-0xffff | 0x10000     | `SEG1_BASE` — e.g. proximity map, viewport buffers |
| seg2            | 0x0000-0xffff | 0x20000     | `SEG2_BASE` |
| seg3            | 0x0000-0xffff | 0x30000     | `SEG3_BASE` |

Memory helpers in `src/zeliard.h`: `MEM8(addr)` / `MEM16(addr)` for seg0; `MEM8_1` / `MEM16_1` (seg1), `_2` (seg2), `_3` (seg3) accessors.

Key structures (defined in `src/zeliard.h`):
- `SaveData g_save_data` — loaded from save file (0x0000-0x00ff)
- Proximity map at seg0:0xe000-0xe900 (36×64) — maps objects near the hero
- Viewport dirty buffer at 0xE900, 28×19 = 532 bytes

---

## 2. Module Map (asm → C → JS)

Ground truth: `asm/` contains the reassembled/disassembled sources. `asm/build_all.sh` rebuilds them with TASM (via dosbox-x) and `asm/diff.txt` confirms the reassembly reproduces **byte-identical** binaries vs. the original game (all 32 sections, zero diffs).

| asm module | Ported in | Status |
|------------|-----------|--------|
| game.asm | — | Initial loader; superseded by JS bootstrap |
| stick.asm | — | Low-level; not needed in browser |
| gmmcga.asm | — | Video lib; rendering replaced by canvas JS |
| gdmcga.asm | — | Video lib (opening); JS canvas |
| gtmcga.asm | — | Video lib (towns); JS canvas |
| gfmcga.asm | src/gfmcga.c | Partial; many stubs note "rendering handled in js" |
| opdemo.asm | opening-intro.js | Fully implemented in JS |
| town.asm | src/town.c | Fully ported |
| fight.asm | src/dungeon.c | Fully ported |
| select.asm | inventory-screen.js | Inventory screen in JS |
| eai1.asm | src/eai1.c | Ported (cavern 1) |
| eai2.asm | src/eai2.c | Ported (cavern 2) |
| eai3.asm | src/eai3.c | Ported (cavern 3) |
| eai4.asm | src/eai4.c | Ported (cavern 4) |
| crab.asm | src/crab.c | Ported (Cangrejo boss) |
| tako.asm | src/tako.c | Ported (Pulpo boss) |
| tori.asm | src/tori.c | Ported (Pollo boss) |
| zela.asm | src/zela.c | Ported; wiring in progress |
| kingpro.asm | indoor-king.js | JS scene |
| kenjpro.asm | indoor-princess.js | JS scene |
| armrpro.asm | indoor-weapon-shop.js | JS scene |
| drugpro.asm | indoor-magic-shop.js | JS scene |
| bankpro.asm | indoor-bank.js | JS scene |
| churpro.asm | indoor-church.js | JS scene |
| innapro.asm | indoor-inn.js | JS scene |
| omoypro.asm | indoor-sage.js | JS scene |
| mscadlib.asm / sndadlib.asm | sound-manager.js | JS audio driver |
| rokademo.asm | game.js (JS) | Tear-collection demo |
| mole.asm, ckpd.asm, ympd.asm | — | Backgrounds/decor; replaced by JS + PNG |

Not yet ported (future work): **eai5–eai8.asm** (caverns 5+) and boss modules for **Vista, Tarso, Paguro, Dragon, Jashiin**. Their binaries exist in `game/0/` (`eai5-8.bin`, `vista`, `tarso`, `paguro`, `drgn`, etc.) but no disassembly listings yet — the listings live in `WORK/*.lst` and `WORK/*.bin.i64`.

---

## 3. Build System

### 3.1 Build

```sh
make          # builds build/zeliard.js + build/zeliard.wasm (+ source map)
make serve    # python3 http.server 8000, serve the repo
```

The `Makefile` (repo root) uses Emscripten (`~/emsdk/upstream/emscripten/emcc`). Debug flags: `-O0 -g3 -gsource-map`, `-s SAFE_HEAP=1`, `-s ASSERTIONS=2`. `ERROR_ON_UNDEFINED_SYMBOLS=0` tolerates a few intentionally-undefined helpers (e.g. `js_log`). Compiled artifacts are **committed** to the repo (`build/zeliard.js`, `.wasm`, `.map`).

Exported WASM symbols (via `src/zeliard-wasm.js`):

```
wasm_init, wasm_set_input_keys,
wasm_dungeon_init, wasm_dungeon_update, wasm_dungeon_full_tick,
wasm_dungeon_get_state, wasm_dungeon_get_render_request, wasm_dungeon_clear_render_request,
wasm_dungeon_get_entity_count, wasm_dungeon_get_entity_table,
wasm_dungeon_get_viewport_top,
wasm_set_scroll_ceiling_left_4px, wasm_set_scroll_ceiling_right_4px,
wasm_set_scroll_floor_left_8px, wasm_set_scroll_floor_right_8px,
wasm_town_init, wasm_town_update, wasm_town_full_tick,
wasm_town_entry_disabling_edge_scroll, wasm_town_entry_enabling_edge_scroll,
wasm_town_set_return_before_main_loop, wasm_town_complete_transition,
wasm_town_building_finish, wasm_town_conversation_finish,
wasm_finish_rokademo_transition
```

> Note: `src/README.md` is stale — it references `./build.sh` which no longer exists. Build is via `make` (repo-root Makefile).

### 3.2 Rebuilding original asm (for verification / new disassembly)

```sh
asm/build_all.sh   # TASM in dosbox-x; verify against asm/diff.txt
```

The `asm/` tree plus `WORK/` (`.lst` listings, `.bin.i64` disassemblies, `LEVELS/*.TXT` map dumps, `DOC/` notes/maps) are the reference for new ports.

---

## 4. Game Data & Assets

- **`game/0/`** — original game data: `*.mdt` (maps), `*.grp` (sprites), `*.bin` (code overlays + eai/boss binaries), `*.usr` (save files), `*.msd` (music).
- **`assets/`** — extracted PNGs, OGG music, and SFX (66 sound effects). Music tracks include town/dungeon themes (e.g. `mgt1`, `ugm1`, `mgt2`, `ugm2`, `04-CavernOfMalicia`, `08-Peligro`, … `14-Absor`) mapped in `resolveMusicTrack` (`game.js:4064`).
- **Dungeon config** — `game.js` `DUNGEONS` (`game.js:412`), one entry per map ID (0–10): MDT path, tile sheets, passable tiles, monster stats, death descriptors, boss state. `TOWN_MDTS` lists the 10 towns (Felishika's Castle, Muralla, Satono, Bosque, Hellada, Tumba, Dorado, Llama, Pureza, Esco).
- **Tools** — `tools/` contains Python viewers/extractors used during porting: `GrpViewer` (GRP→PNG), `MdtViewer`/`MDTViewer` (map editor/viewer), `SpriteEditor`, `SFXRipper`.

### 4.1 How to add a new cavern/boss

1. Disassemble the overlay (`eaiN.bin` / boss `.bin`) using the `WORK/` tooling → produce `WORK/<name>.lst` / `.bin.i64`.
2. Port to C following `src/eai*.c` / `src/crab.c` patterns; add to the Makefile `SOURCES`.
3. Wire map IDs in `load_eai_module()` in `src/dungeon.c:5197` (e.g. eai5 → map IDs for Tumba).
4. Extract dungeon graphics: `tools/GrpViewer` → PNG into `assets/images/`.
5. Add a `DUNGEONS` config entry in `game.js` (map ID, tile sheets, passable tiles, monsters, boss state).

---

## 5. Timer & Audio

The original game syncs state/music/sound via PIT timer interrupts. We emulate this with an `AudioWorkletProcessor`:

- `pit-worklet.js` — emulates the PIT 8253 at **236.7 Hz** (clock 1,193,182 Hz ÷ reload 5041), firing `full_tick` messages each PIT tick and `slow_tick` every 5th tick (≈47 Hz) for input + logic.
- `sound-manager.js` — SFX + music scheduling on the main thread, driven by the worklet's `full_tick`.

Main-thread handler (from `pit-worklet.js`):

```js
node.port.onmessage = ({ data }) => {
  if (data.type === 'full_tick') { /* sound/music driver poll; frame counters */ }
  if (data.type === 'slow_tick') { /* poll input; run game logic (wasm_dungeon_update / wasm_town_update) */ }
};
```

Tradeoff: `postMessage` adds ~0.5–2 ms latency; audio DSP stays in the worklet, only game-state messages cross the thread boundary.

---

## 6. Testing Strategy

No automated test framework is set up. Verification approaches in use:

- **Byte-identical asm rebuilds** — `asm/diff.txt` (all 32 sections empty) proves the reference disassembly is faithful, so C ports can be checked against `WORK/` listings.
- **Manual playtesting** — the full loop (intro → town → dungeon → boss → rokademo) is exercised in-browser; save/restore/export round-trips verified against original `.usr` files.
- **Progress commits** — incremental: each cavern/boss lands as a working, playable increment.

---

## 7. Repository Layout

```
zeliard/
├── index.html, styles.css
├── game.js                  # Main JS: rendering, input, DUNGEONS/TOWN configs, transitions
├── opening-intro.js         # opdemo.asm (title screen)
├── sound-manager.js         # Audio driver (mscadlib/sndadlib)
├── pit-worklet.js           # PIT timer AudioWorklet
├── indoor-*.js              # King, Princess, Sage, shops, Church, Bank, Inn scenes
├── inventory-screen.js      # select.asm
├── save-restore-ui.js, import-export-ui.js, ui-menu-dialog.js
├── guerra_border_walls.js
├── build/                   # zeliard.js + zeliard.wasm (+ .map), committed
├── src/
│   ├── zeliard-wasm.js      # WASM bridge
│   ├── zeliard.h            # Public API, memory macros, structures
│   ├── data.c, unpack.c, eai1_data.c
│   ├── town.c, dungeon.c
│   ├── eai1.c .. eai4.c
│   ├── crab.c, tako.c, tori.c, zela.c
│   └── gfmcga.c
├── asm/                     # Original asm sources + TASM rebuild (build_all.sh, diff.txt)
├── WORK/                    # Disassembly listings, map dumps, docs, tools
├── tools/                   # GrpViewer, MdtViewer, MDTViewer, SpriteEditor, SFXRipper
├── assets/                  # PNGs, OGGs, SFX
├── game/0/                  # Original game data
├── Makefile                 # Emscripten build
└── PORTING_PLAN.md          # This document
```
