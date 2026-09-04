# Zeliard Porting Plan

## Historical Scope

This document originally described the project's goal of porting the original
`asm/*.asm` from x86 assembly to C, compiling to WebAssembly with Emscripten,
and integrating with JavaScript. That goal has been **superseded**: the
runtime is now pure TypeScript (see
[README.md](../README.md) and [docs/MIGRATION_PLAN.md](MIGRATION_PLAN.md)).

This file is preserved as a **historical record and reference** — the `asm/`
disassembly, the C ports that preceded the TypeScript engine, and the
original architecture diagrams remain useful for understanding engine
behavior, verifying edge cases against the original binaries, and adding
new content (additional bosses, caverns, indoor scenes).

For the live architecture, build, and deployment status, see:

- [../README.md](../README.md) — high-level project status and dev workflow
- [MIGRATION_PLAN.md](MIGRATION_PLAN.md) — current TypeScript runtime state
- [MIGRATION_HISTORY.md](MIGRATION_HISTORY.md) — Stage 0–10 migration diary
- [REFACTOR_PLAN.md](REFACTOR_PLAN.md) — typed-state extraction plan (done)

---

## Original Goal (historical)

Port all `*.asm` from x86 assembly to C, compile to WebAssembly with
Emscripten, and integrate with JavaScript. The goal was to preserve
**exact original logics and AI behavior** while replacing sprite graphics with
alternative rendering and skipping music or optionally using an OPL port.
All memory regions from the original assembly were preserved; any variable
needed for implementation lived outside the original memory regions — since
WebAssembly has linear memory, using any region outside the ranges above was
not a problem.

---

## Original Architecture (historical)

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
│  ├── eai1-8.c    - Monster AI (eai1-8.asm)                  │
│  ├── boss-*.c    - Boss AI (crab/tako/tori/zela/vista/      │
│  │                tarso/paguro/dragon/jashiin1/jashiin2)    │
│  ├── gfmcga.c    - Cavern video lib (partially ported)      │
│  ├── unpack.c    - RLE data unpacking                       │
│  └── eai1_data.c - Monster AI data tables                   │
└─────────────────────────────────────────────────────────────┘
```

### Original control flow

- **Full tick (236.7 Hz, from PIT worklet):** `wasm_dungeon_full_tick` /
  `wasm_town_full_tick` — sound/music drivers, frame counters.
- **Slow tick (every 5th tick ≈ 47 Hz):** input + game logic via
  `wasm_dungeon_update` / `wasm_town_update`.
- **Rendering:** C never drew. The C side wrote render requests / entity
  state into `g_mem`, and JS read them each frame.
- **State machine:** dungeon states handled included
  `NORMAL(0)`, `DEATH_FADE(4)`, `BOSS_ENCOUNTER(5)`, `ROKA_RUN(7)`,
  `ROKADEMO(9)`. Transitions went through memory flags read by JS plus
  exports like `wasm_town_complete_transition`,
  `wasm_finish_rokademo_transition`, `wasm_town_building_finish`,
  `wasm_town_conversation_finish`.

### Original memory layout

WASM memory was a flat 256 KB linear buffer: `uint8_t g_mem[0x40000]` in
`src/data.c`. Addresses were the original DOS segment:offset addresses. JS
reached it via `wasmMemory.buffer + gMemoryBase` (the offset of `g_mem` in
WASM linear memory).

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

In the current TypeScript runtime the same logical layout lives in
`web/src/core/memory.ts` and `web/src/core/ts-memory.ts` as a
`Uint8Array`. The first 256 bytes are still the save image (kept for save
file compatibility). Buffer-relative reads (proximity map, monster structs,
MDT data, projectiles, seg1 config) still use the same addresses because
those regions are inherently byte-indexed.

---

## asm Module Reference

Ground truth: `asm/` contains the reassembled/disassembled sources.
`asm/build_all.sh` rebuilds them with TASM (via dosbox-x) and `asm/diff.txt`
confirms the reassembly reproduces **byte-identical** binaries vs. the
original game (all 32 sections, zero diffs).

| asm module | TypeScript owner | Status |
|------------|------------------|--------|
| game.asm | — | Initial loader; superseded by `web/src/main.ts` |
| stick.asm | — | Low-level; not needed in browser |
| gmmcga.asm | — | Video lib; rendering replaced by `web/src/render/*.ts` |
| gdmcga.asm | — | Video lib (opening); `web/src/scenes/opening-intro.ts` |
| gtmcga.asm | — | Video lib (towns); `web/src/render/town.ts` |
| gfmcga.asm | — | Cavern video lib; `web/src/render/dungeon.ts` + `explosion-ring.ts` (2bpp ring decode only) |
| lega.asm | — | Graphics decoder; PNG sheets replace runtime decode |
| opdemo.asm | `web/src/scenes/opening-intro.ts` | Fully ported |
| enddemo.asm | `web/src/scenes/ending-demo.ts` | Fully ported |
| town.asm | `web/src/engine/town.ts` (+ town-state, dungeon-cutover, transitions) | Fully ported |
| fight.asm | `web/src/engine/dungeon-*.ts` (~30 modules) | Fully ported |
| select.asm | `web/src/ui/inventory-screen.ts` | Fully ported |
| eai1.asm | `web/src/engine/eai1.ts` | Cavern 1 enemies |
| eai2.asm | `web/src/engine/eai2.ts` | Cavern 2 enemies |
| eai3.asm | `web/src/engine/eai3.ts` | Cavern 3 enemies |
| eai4.asm | `web/src/engine/eai4.ts` | Cavern 4 enemies |
| eai5.asm | `web/src/engine/eai5.ts` | Cavern 5 enemies |
| eai6.asm | `web/src/engine/eai6.ts` | Cavern 6 enemies |
| eai7.asm | `web/src/engine/eai7.ts` | Cavern 7 enemies |
| eai8.asm | `web/src/engine/eai8.ts` | Cavern 8 enemies |
| crab.asm | `web/src/engine/boss-crab.ts` | Cangrejo |
| tako.asm | `web/src/engine/boss-tako.ts` | Pulpo |
| tori.asm | `web/src/engine/boss-tori.ts` | Pollo |
| zela.asm | `web/src/engine/boss-agar.ts` | Agar |
| mao1.asm | `web/src/engine/boss-vista.ts` | Vista |
| mao2.asm | `web/src/engine/boss-tarso.ts` | Tarso |
| zel2.asm | `web/src/engine/boss-paguro.ts` | Paguro |
| drgn.asm | `web/src/engine/boss-dragon.ts` | Dragon |
| akma.asm | `web/src/engine/boss-jashiin1.ts` + `boss-jashiin2.ts` | Jashiin (both rooms) |
| meda.asm | `web/src/engine/boss-alguien.ts` | Alguien (referenced) |
| kingpro.asm | `web/src/scenes/indoor-king.ts` | King scene |
| kenjpro.asm | `web/src/scenes/indoor-princess.ts` | Princess scene |
| armrpro.asm | `web/src/scenes/indoor-weapon-shop.ts` | Weapon Shop |
| drugpro.asm | `web/src/scenes/indoor-magic-shop.ts` | Magic Shop |
| bankpro.asm | `web/src/scenes/indoor-bank.ts` | Bank |
| churpro.asm | `web/src/scenes/indoor-church.ts` | Church |
| innapro.asm | `web/src/scenes/indoor-inn.ts` | Inn |
| omoypro.asm | `web/src/scenes/indoor-sage.ts` | Sage |
| mscadlib.asm / sndadlib.asm | `web/src/audio/sound-manager.ts` | Music/SFX driver |
| rokademo.asm | `web/src/core/roka-demo.ts` | Tear-collection demo |
| mole.asm, ckpd.asm, ympd.asm | — | Backgrounds/decor; replaced by PNG overlays |

All 32 overlays/boss modules have TS owners; the asm/ tree remains the
authoritative reference for engine semantics.

---

## Original Build System (historical)

```sh
make          # built build/zeliard.js + build/zeliard.wasm (+ source map)
make serve    # python3 http.server 8000, serving the repo root
```

The `Makefile` used Emscripten (`~/emsdk/upstream/emscripten/emcc`).
Compiled artifacts (`build/zeliard.js`, `.wasm`, `.map`) were committed to
the repo.

The current build is `pnpm build` in `web/` (Vite + TypeScript, static
output to `web/dist/`); see [../README.md](../README.md).

### Rebuilding original asm (for verification / new disassembly)

```sh
asm/build_all.sh   # TASM in dosbox-x; verify against asm/diff.txt
```

The `asm/` tree plus `WORK/` (`.lst` listings, `.bin.i64` disassemblies,
`LEVELS/*.TXT` map dumps, `DOC/` notes/maps) remain the reference for any
new engine work.

---

## Game Data & Assets

- **`game/0/`** — original game data: `*.mdt` (maps), `*.grp` (sprites),
  `*.bin` (code overlays + eai/boss binaries), `*.usr` (save files),
  `*.msd` (music). Served from `web/public/game/`.
- **`assets/`** — extracted PNGs, OGG music, and SFX (66 sound effects).
  Served from `web/public/assets/`.
- **Dungeon config** — `web/src/data/dungeons.ts` `DUNGEONS`: one entry per
  map ID (0–30), covering **all 8 caverns** plus boss rooms and the Jashiin
  rooms. Each entry has MDT path, tile/entity sheets, passable tiles, slope
  tiles, aggressive ground, airflows, monster XP/damage, death descriptors,
  trajectories, AI (EAI1–8), and an optional `bossState`. `TOWN_MDTS` lists
  the 10 towns (Felishika's Castle, Muralla, Satono, Bosque, Hellada, Tumba,
  Dorado, Llama, Pureza, Esco).
- **Tools** — `tools/` contains Python viewers/extractors used during
  porting: `GrpViewer` (GRP→PNG), `MdtViewer`/`MDTViewer` (map
  editor/viewer), `SpriteEditor`, `SFXRipper`. These are no longer needed
  by the runtime but remain for asset re-extraction.

### Adding new content (e.g. a new boss or cavern variant)

1. Use `asm/build_all.sh` and the `WORK/` tooling to study or disassembly-
   edit the relevant `.asm` if you need exact behavior reference.
2. For data-only changes (tile swaps, monster stat tweaks), edit
   `web/src/data/dungeons.ts` directly.
3. For new behavior, add a new owner module under
   `web/src/engine/` following the patterns of `eai*.ts` / `boss-*.ts`, and
   wire it through `web/src/engine/eai-registry.ts` /
   `web/src/engine/dungeon-cutover.ts`. Keep `web/tests/` coverage high.

---

## Timer & Audio (historical → current)

The original game synced state/music/sound via PIT timer interrupts. The
emulation lives in `web/public/pit-worklet.js`:

- `pit-worklet.js` — emulates the PIT 8253 at **236.7 Hz** (clock
  1,193,182 Hz ÷ reload 5041), firing `full_tick` messages each PIT tick
  and `slow_tick` every 5th tick (≈47 Hz) for input + logic.
- `web/src/audio/sound-manager.ts` — SFX + music scheduling on the main
  thread, driven by the worklet's `full_tick`. The audio-owned region
  (`sound_fx_request` byte at 0xFF75 etc.) is read by the worklet handler
  and cleared after consumption; `web/src/core/ts-memory.ts` exposes typed
  accessors for it.

Tradeoff noted during the original port: `postMessage` adds ~0.5–2 ms
latency; audio DSP stays in the worklet, only game-state messages cross
the thread boundary.

---

## Testing Strategy

- **Pure-logic unit tests** (`web/tests/`, Vitest) — high coverage:
  save codec, conversation engine, shop/bank transaction rules, TS memory,
  engine helpers, combat, item/chest handling, enemy and boss AI.
- **Playwright E2E** (`web/e2e/`) — boots the real game, skips the intro,
  screenshots the town canvas, warps into a dungeon room and back,
  asserts no console errors. Baselines live in `web/e2e/__screenshots__/`.
- **Coverage** — `pnpm test --coverage` runs `vitest --coverage` with
  `@vitest/coverage-v8` (thresholds enforced in `vite.config.ts`).

Run before substantial engine, save, input, render, or scene changes:

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm e2e`
4. `pnpm build`

---

## Repository Layout (current)

```
zeliard/
├── README.md
├── asm/                     # Original asm sources + TASM rebuild (build_all.sh, diff.txt)
├── docs/                    # This file + MIGRATION_*, REFACTOR_PLAN, OPTIMIZE, summary
├── tools/                   # Python asset extractors (no longer runtime-required)
├── WORK/                    # Disassembly listings, map dumps, docs, tools (historical)
├── game/0/                  # Original game data (also served from web/public/game/)
├── web/                     # Vite + TypeScript app (live runtime)
│   ├── public/              # pit-worklet.js, assets/, game/
│   ├── src/
│   │   ├── main.ts          # Composition root
│   │   ├── audio/ sound-manager.ts
│   │   ├── config/ engine.ts
│   │   ├── core/            # memory, ts-memory, game-state, scene, transitions,
│   │   │                    # conversation, conversation-text, indoor-scene-base,
│   │   │                    # roka-demo, speed-change
│   │   ├── data/            # assets, dungeons
│   │   ├── engine/          # town, dungeon-*.ts, eai1..8, boss-*.ts,
│   │   │                    # unpack, mdt, input, town-state, heartbeat-table, eai-registry
│   │   ├── input/           # key-state, key-router, touch-input
│   │   ├── platform/        # save, save-file
│   │   ├── render/          # canvas, sheets, dungeon, town, dungeon-logic, explosion-ring
│   │   ├── scenes/          # opening-intro, ending-demo, indoor-*.ts
│   │   └── ui/              # hud, menu-dialog, modal-manager, save-restore,
│   │                        # import-export, inventory-screen, conversation-draw
│   ├── tests/               # Vitest unit tests
│   ├── e2e/                 # Playwright smoke/regression tests
│   ├── package.json, tsconfig.json, vite.config.ts, playwright.config.ts
│   └── index.html
└── .github/workflows/deploy.yml   # GitHub Pages deploy (pnpm build → web/dist)
```

---

## See Also

- [README.md](../README.md) — live project status and dev commands.
- [MIGRATION_PLAN.md](MIGRATION_PLAN.md) — TypeScript runtime plan and goals.
- [MIGRATION_HISTORY.md](MIGRATION_HISTORY.md) — full Stage 0–10 diary.
- [REFACTOR_PLAN.md](REFACTOR_PLAN.md) — typed-state extraction (done).
- [OPTIMIZE.md](OPTIMIZE.md) — input-lag optimization history.
- [summary.md](summary.md) — project summary.
