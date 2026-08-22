# TypeScript Migration Plan

Goal: incrementally migrate the web port to **100% TypeScript** — no C, no
wasm, no shared linear memory — without ever breaking playability. The work is
split into two phases:

- **Phase A — TS migration** (Stages 0–4): all JS becomes typed, structured
  TypeScript. The wasm engine stays as-is, behind a clean typed bridge.
- **Phase B — De-wasm** (Stages 5–10): the C engine is ported to TypeScript
  subsystem by subsystem, verified by automated parity testing, until the wasm
  artifact, emcc build step, and linear-memory sharing are deleted entirely.

Every stage in both phases ends in a deployable, playable build on GitHub
Pages. No backend — the final artifact remains pure static files.

## Current state (inventory)

| Area | Files | Notes |
|---|---|---|
| Entry / engine glue | `game.js` (6,620 lines) | Monolith: game loop, canvas, input, town flow, save system, wasm wiring |
| Scenes | `opening-intro.js`, `ending-demo.js`, `indor-*.js` ×8, `inventory-screen.js` | Already class-based ES modules |
| UI | `ui-menu-dialog.js`, `save-restore-ui.js`, `import-export-ui.js`, `touch-controls.js` | |
| Audio | `sound-manager.js`, `pit-worklet.js` | Worklet runs in its own realm |
| WASM bridge | `src/zeliard-wasm.js` | Raw WebAssembly API, cached memory views, layout consts duplicated from `zeliard.h` |
| C/WASM engine | `src/*.c` (~25 files), `Makefile` → `build/zeliard.{js,wasm}` | Phase A: frozen behind the bridge. Phase B: ported out subsystem by subsystem |

Good news: the codebase already uses ES modules and classes, so Phase A is a
conversion + decomposition job, not a rewrite. Phase B benefits from the C
sources being a readable reconstruction of the original engine (with `asm/`
as source of truth) rather than opaque binary.

## Target architecture

```
web/                        # new Vite + TS app (replaces root-level JS)
├── index.html
├── public/
│   ├── assets/             # moved/copied from ./assets
│   ├── game/               # mdt files + stdply.bin (unchanged)
│   ├── pit-worklet.js      # worklet stays plain JS (loaded by URL, not bundled)
│   └── build/              # zeliard.wasm + zeliard-wasm loader artifacts
├── src/
│   ├── main.ts             # bootstrap: canvas, loop, scene stack
│   ├── core/               # GameLoop, fixed timestep, Scene interface + SceneStack, EventBus, Time
│   ├── config/             # constants (TILE_SIZE, VIEW_*, paths), feature flags
│   ├── wasm/               # typed bridge: WasmBridge class, ZeliardExports interface,
│   │                       #   memory-layout constants (single source of truth, see below)
│   ├── input/              # KeyboardInput, TouchInput, InputState → INPUT_FLAGS bitmask
│   ├── audio/              # AudioManager (wraps SoundManager), worklet loading
│   ├── render/             # CanvasRenderer, palette ops, sprite blit, integer scaling
│   ├── scenes/             # OpeningIntro, EndingDemo, IndoorScene hierarchy, InventoryScreen
│   ├── ui/                 # MenuDialog, SaveDialog, RestoreDialog, ImportExport
│   └── platform/           # storage (localStorage + file import/export), resize/fullscreen
├── package.json / tsconfig.json / vite.config.ts
└── .github/workflows/deploy.yml
```

Key decisions:

1. **Vite + plain TS, no framework.** Canvas game; React/Vue would fight the
   render loop. Vite gives instant dev server, mixed `.js`/`.ts` imports
   (essential for incremental migration), and static `dist/` output.
2. **Strangler-fig, not big-bang.** Existing JS keeps working under Vite while
   modules are converted one at a time (`allowJs: true` throughout).
3. **The wasm bridge becomes the typed contract — then the port boundary.**
   It is where correctness matters most (shared linear memory, offsets matching
   `zeliard.h`). Type it first: `interface ZeliardExports { wasm_town_init(...):
   number; ... }`, a class owning the memory-view lifecycle (rebuild views
   after `memory.grow`), and `readonly` layout constants generated from
   `zeliard.h` by a small script so C and TS cannot drift apart. In Phase B the
   same typed memory views let TS code read/write engine state in place while
   subsystems migrate one at a time (see Phase B).
4. **`pit-worklet.js` never gets compiled by tsc.** AudioWorkletModules load by
   URL in their own realm; keep it as a hand-written static asset in `public/`.
5. **GitHub Pages delivery.** A single workflow: install emsdk (cached) →
   `make` the wasm → `vite build` → deploy `dist/`. Set Vite `base` to the
   repo subpath if hosted under `<user>.github.io/<repo>/`.

## Testing strategy

**Runner: Vitest** — same Vite config and TS setup as the app, fast watch mode,
native ESM/TS with no build step. DOM-dependent tests use `happy-dom`.

The guiding rule (which also shapes Stage 2's decomposition): **separate pure
logic from side effects** so it can be tested without canvas/DOM/audio. Each
module gets a constructor-injected or factory-provided boundary
(`Storage` interface for saves, `AudioContext`-like stub for audio, etc.).

What gets unit tests, by value:

| Layer | Tests | Notes |
|---|---|---|
| `wasm/` bridge | **Highest value.** Memory-layout constants vs a fixture snapshot; INPUT_FLAGS bitmask encoding; memory-view rebuild after `memory.grow()`; export-call arg/result marshaling | The bridge uses the raw WebAssembly API, so integration tests can load the real `build/zeliard.wasm` in Node — no mocks needed |
| Save format codec | Round-trip encode/decode of every field; corrupt/truncated input rejection; version migration | Pure functions once extracted from `game.js`/DOM |
| Input mapping | key/touch event → InputState → bitmask; edge cases (simultaneous keys, stuck-key on blur) | Pure `InputState` class + thin untested DOM adapter |
| Scene stack / state machine | push/pop/replace transitions, enter/update/exit ordering, pending-transition handling | Fake scenes recording lifecycle calls |
| Render helpers | palette ops, coordinate math, scaling math | Pure math; pixel output itself stays under manual/E2E verification |
| Audio/UI logic | dialog open/close state, menu selection indices, gold/item transaction rules (bank, shops) | DOM adapters kept thin |

Not unit-tested (covered instead by the manual regression checklist, and
optionally Playwright in Stage 4): actual canvas pixels, real audio playback,
worklet internals (`pit-worklet.js` runs in its own realm), full wasm game-loop
behavior beyond bridge-level checks.

CI gates per PR: `tsc --noEmit`, `vitest run`, then the deploy workflow only
runs on green. Bridge tests run against the freshly built wasm artifact so a C-side
ABI change breaks CI immediately rather than at runtime.

## Stages

Each stage = one PR-sized unit of work, ending with the unit test suite, the
regression checklist (see bottom) passing, and a deploy to Pages.

### Stage 0 — Toolchain foundation, zero code changes ✅ *(completed)*
- Add `package.json`, `vite.config.ts`, `tsconfig.json`
  (`strict: true, allowJs: true, checkJs: false, noEmit: true`).
- Add Vitest with one smoke test (imports the entry module, asserts constants)
  to prove the harness works before any code moves.
- Move all root JS unchanged into `web/src/legacy/`; move `index.html`,
  `styles.css`, static dirs under `web/public/`. Update import paths only.
- Add GitHub Actions workflow (typecheck + tests + build wasm + Vite) deploying
  to Pages; keep the old root setup working until the new pipeline is verified.
- **Exit criteria:** game byte-for-byte equivalent in behavior, deployed from
  the new pipeline. Old root entry removed.
- **Done:** shipped as branch `main`, deployed live. Extras landed along the way:
  pnpm instead of npm, release-by-default wasm build (`make DEBUG=1` restores
  debug), Node 24-native action versions.

### Stage 1 — Type the seams (no logic moves) ✅ *(completed)*
- Convert `config/constants`, `INPUT_FLAGS`, and `src/zeliard-wasm.js` →
  `wasm/bridge.ts`: typed exports interface, `MemoryView` management class,
  documented memory map.
- Add `.d.ts` shims for remaining legacy modules so new TS can consume them.
- Enable `checkJs: true` gradually on converted files only.
- **Tests:** full bridge suite — load the real wasm in Node; assert memory-map
  offsets against a golden fixture generated from `zeliard.h`; verify view
  rebuild on `memory.grow()`; INPUT_FLAGS round-trip. These tests are the
  safety net for every later stage.
- **Exit criteria:** bridge fully typed and tested; game plays identically.
- **Done:** `web/src/wasm/memory.ts` (layout constants + `INPUT_FLAGS` +
  header/transition types) and `web/src/wasm/bridge.ts` (full typed port,
  `ZeliardExports` interface, exported testable `LinearMemory` class,
  byte-injectable `initWasmFromBytes` for Node tests). Legacy import path in
  `game.js` updated; no other legacy file touched. 24 tests pass, including:
  constants cross-checked against `src/zeliard.h` text (drift guard),
  end-to-end `inputSetKeys` → g_mem latch bytes at `0xFF16..18`, synthetic-MDT
  header/name/music parsing, real `cmap.mdt` sanity, save-state padding, and
  `LinearMemory` rebuild-on-grow/base-change lifecycle. Documented discovery:
  MDT header pointer fields are seg0-absolute (e.g. `0xC030`), not
  MDT-relative.

### Stage 2 — Decompose `game.js` into engine services (still JS semantics) 🔶 *(in progress)*

Extract responsibilities from the 6.6k-line monolith into modules, converting
each to TS as it's extracted. **Every extraction lands together with its unit
tests** (see the table above) — the test is written against the new module's
public interface, proving the extraction preserved behavior:

Completed so far:
1. ✅ `platform/save.ts` — base64 codec + localStorage slot storage with
   injectable `SaveStorage`; `game.js` re-exports so UI modules keep their
   import paths. Tested: codec round-trip, slot CRUD, 256-byte validation,
   corrupt-payload handling.
2. ✅ `audio/sound-manager.ts` — typed conversion of `sound-manager.js`.
   Tested: worklet message dispatch, SFX request-byte poll semantics
   (play-and-clear, no re-trigger), heartbeat volume-change detection.
3. ✅ `input/key-state.ts` — the polled key-latch singleton + `setKeyState`
   mapping from `e.code`; `game.js` handlers now delegate. Tested: mapping,
   Alt-left/right aliasing, clearKeys.
4. ✅ `core/scene.ts` + `core/indoor-scene-base.ts` — formal `Scene`
   interface and typed fade lifecycle base class; all 8 indoor scenes import
   the TS base. Tested: fade-in/hold/fade-out math, completion protocol,
   finish-callback semantics.
5. ✅ `wasm/memory.ts` absorbed the full `ADDR_*` / `DUNGEON_STATE_*` block
   from `game.js` (~120 g_mem addresses) — the memory map now has a single
   owner module shared by JS and TS code.
6. ✅ `ui/hud.ts` — `Hud` class owning all DOM HUD rendering (HP/life bar with
   asm-parity `normalizeHealthTo100`, gold/almas, sword/shield/magic icons and
   counts, boss bar/name); `game.js` keeps hoisted delegating shims. Tested:
   address-level byte assertions for every stat, clamping rules, DOM output.
7. ✅ `data/dungeons.ts` — the ~1,700-line static block moved verbatim out of
   `game.js`: EAI1–8 enemy frame mappings, boss sprite segment tables, and
   the 31-entry `DUNGEONS` map table (now typed via `DungeonDefinition`).
   Zero logic; tested structurally (contiguous ids 0..30, required asset
   paths, paired left/right frame lists, sprite counts). This alone cut
   `game.js` from 6.2k to ~4.5k lines.
8. ✅ `ui/modal-manager.ts` + `platform/save-file.ts` — modal lifecycle (single
   active modal, key-code translation KeyA→a / Digit5→5 / Space→space, draw
   forwarding, input-active tracking for the on-screen keyboard) and .sav
   file download/picker with size validation; `game.js` now drives dialogs
   through a typed manager instead of the raw `activeModal` flag. Tested:
   lifecycle guards, key translation/routing, picker callbacks incl.
   wrong-size rejection and detached-input re-attachment.
9. ✅ `core/speed-change.ts` — F9 game-speed dialog state machine
   (begin → beginSelect → selectDigit → confirm, cancel anywhere) as a pure,
   injected-effects class; drawing and wasm writes stay in `game.js`.
   Tested: every legal/illegal transition, idempotent finish/restart,
   stored-byte→displayed-speed conversion incl. zero fallback.
10. ✅ `core/conversation-text.ts` — the NPC-dialog text engine: byte-stream
   parser (line wrapping at original 256px font metrics, 15-line paging,
   control codes 0x81/0x83/0x85/0x87/0x89/0x8B with wasm side-effects as
   injected callbacks) and dialog-box geometry math. game.js keeps the
   conversation state machine and canvas drawing, delegating to the pure
   module. Tested: wrapping/paging boundaries, char remaps, every control
   code, effect firing, geometry docking/sizing/clamping — the highest-value
   test target so far since it drives all NPC dialogs.
11. ✅ `core/conversation.ts` — the conversation state machine itself:
   `ConversationManager owning start-from-wasm (NPC id resolution incl. the
   Asbestos Cape reroute), pattern loading, paging, Yes/No responses
   (patterns 0x0C/0x0D), the full purchase flow (almas deduction, caliente
   flag, item-slot insertion), end-code chaining (0x87/0x89), and close
   semantics. The ~120-line tick block in game.js collapsed to edge-detect +
   one `handleTick()` call; drawing stays in game.js reading manager fields.
   Tested: 15 scenarios covering every mode transition and side effect.
11. ✅ `config/engine.ts` + `data/assets.ts` — remaining static config moved
   out of `game.js`: engine/canvas constants, feature flags, town/dungeon
   layout metrics, notification strings, and all asset-path tables.
   Tested structurally (view math, town table, contiguous notification ids,
   icon tiers). `game.js` is now ~4.0k lines, down from 6.6k — the remainder
   is actual logic: rendering functions, conversation flow, rokademo,
   transitions, and the game loop.

Remaining for this stage's exit criteria (`game.js` reduced to `main.ts`):
- `render/` — canvas setup/scaling plus the town/dungeon drawing functions
  (largest chunk: `ctx` is shared across ~100 call sites; extract alongside
  the drawing-code owners)
- Input event *routing* (modal/inventory/conversation dispatch) → `core/`
- Conversation system, Rokademo demo, town-transition flow
- Game loop + boot → `main.ts`

`game.js` shrinks until it's just `main.ts`.
- **Exit criteria:** `game.js` deleted; every feature has a single owner module.

### Stage 3 — Convert remaining feature modules
Mechanical conversion, largest-last risk ordering:
- `ui/` dialogs, `touch-controls` → `input/TouchInput`
- indoor scenes one at a time (bank, weapon shop, magic shop, sage, inn,
  church, king, princess) — they share `IndoorScene` base, so the first
  conversion defines the pattern
- `inventory-screen.js`
- `opening-intro.js` (2,266 lines) and `ending-demo.js` (3,024 lines) last —
  biggest, most self-contained
- **Exit criteria:** `allowJs: false`; no `.js` left in `src/`; every converted
  module's logic (scene transitions, dialog/menu state, shop/bank transaction
  rules) is covered by unit tests.

### Stage 4 — Hardening & cleanup
- Turn on the strictest flags that still pass: `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Delete dead code surfaced by the compiler; replace magic numbers flagged
  during conversion with named constants (cross-check against `asm/` when
  semantics are uncertain — asm stays the source of truth).
- Playwright E2E smoke test driving intro→town→one dungeon room with
  screenshot comparison against Stage 0 baselines; runs in CI alongside Vitest.
- Coverage review (`vitest run --coverage`): fill gaps in any pure logic that
  escaped testing during the rush of Stage 3.
- Update README/OPTIMIZE notes.
- **Exit criteria:** end of Phase A — fully typed, tested codebase; wasm still
  runs the simulation, unchanged.

---

# Phase B — De-wasm: pure TypeScript engine

The final goal: delete `src/*.c`, the emcc build, and the shared linear
memory, so the entire project is TypeScript. The C engine is ported subsystem
by subsystem; playability is preserved at every step because each migrated
subsystem is verified against the wasm implementation it replaces.

## How Phase B stays safe: the parity harness

The core technique for every stage below:

1. **Shadow (dual-run) mode.** For a subsystem being ported, run *both* the
   wasm function and the new TS implementation on the same inputs each tick
   and assert their outputs (return values + written memory regions) match.
   Divergences are logged with a memory-diff dump. Behind a debug flag, so
   shipping builds pay no cost.
2. **Golden replay tests.** A recorder captures `(inputs → exported-function
   calls, memory snapshots)` sequences from real gameplay sessions into
   fixtures. Vitest replays them against the TS implementation in Node —
   thousands of frames per second, covering far more behavior than manual
   testing ever could.
3. **Cutover switch.** Once shadow mode is clean over the full regression
   checklist plus golden replays, flip the subsystem's dispatch to TS. The
   wasm version stays in the binary until Stage 10 as an instant fallback.

Numeric-fidelity rules for all ports (the classic JS/wasm pitfalls):

- All engine math uses `|0`/`>>>`/`&` to reproduce 32-bit integer semantics;
  use `Math.fround()` where the C used `float`.
- Replicate the original RNG exactly (find its LCG/algorithm in the C/asm) as
  a seeded pure class with golden-sequence tests — combat drops, enemy
  behavior, everything depends on it being bit-exact.
- No refactoring "while we're here" during Phase B: port semantics first,
  idiomatic cleanup only after parity is proven (cleanup can then be verified
  by re-running the same golden tests).

### Stage 5 — Parity infrastructure & engine inventory
- Document every export in `ZeliardExports` and every region of `g_mem`
  (owner subsystem, read/write access) — this becomes the porting order and
  progress tracker.
- Build the shadow-mode harness and fixture recorder (Stage-4 Playwright
  drives gameplay while recording).
- Port the leaf utilities first as proof of the process: input-flag handling,
  simple getters/setters, scroll helpers (`wasm_set_scroll_*`,
  `_set_input_keys`).
- **Exit criteria:** harness runs in CI; first exports served from TS behind
  the dispatch layer.

### Stage 6 — Data layer: formats, unpacking, graphics decode
Port `unpack.c`, `data.c` (MDT map parsing), and the graphics decoders
(`gfmcga.c`, `lega.c`) to TS operating on `Uint8Array`s instead of g_mem
offsets.
- Pure data-in/data-out functions — ideal unit-test territory: decode every
  asset in the repo and byte-compare against wasm output as generated golden
  fixtures.
- **Exit criteria:** all assets load and decode through TS; rendered output
  pixel-identical.

### Stage 7 — Town simulation
Port `town.c`: NPC placement/AI, conversations, building transitions,
edge-scroll logic (`wasm_town_update` / `_full_tick` family).
- Shadow-run town ticks during full regression checklist sessions.
- Golden fixtures: scripted walks through every town, entering/exiting every
  building.
- **Exit criteria:** town runs entirely from TS; wasm town code unreachable.

### Stage 8 — Dungeon core
Port `dungeon.c`: player physics/collision, scrolling, entity table
management, render-request generation.
- The entity table is the trickiest shared-memory structure — port its
  accessor layer first, then the update loop.
- Golden fixtures: recorded dungeon runs across several maps including
  transitions and the death sequence.
- **Exit criteria:** dungeon playable with zero calls into wasm dungeon
  exports.

### Stage 9 — Enemies & bosses, one file per PR
Port the AI files individually — they're naturally independent staging units,
each verifiable in isolation:
- Regular enemies: `eai1.c` … `eai8.c` (one or two per stage-step)
- Bosses: `crab.c`, `tako.c`, `tori.c`, `akma.c`, `meda.c`, `mao1.c`,
  `mao2.c`, `drgn.c`
- Each lands with: shadow mode clean, golden replay of a recorded boss fight,
  regression checklist section re-run.
- **Exit criteria:** no enemy/boss behavior originates from wasm.

### Stage 10 — State ownership & wasm deletion
The last structural step: stop sharing linear memory altogether.
- Migrate remaining state from g_mem byte regions to idiomatic TS objects
  (mechanically safe now: every reader/writer is TS; the Stage 6–9 golden
  tests verify the refactor).
- Re-baseline save compatibility: localStorage saves and `stdply.bin` must
  load identically (save-format codec tests from Stage 2 already guard this).
- Delete: `src/*.c`, `Makefile` emcc target, `build/` artifacts, emsdk from
  CI (deploys get much faster), the bridge's memory-view machinery.
- Final architecture: `engine/` modules (town, dungeon, entities, rng)
  owning plain TS state; `render/` consuming draw lists directly — no
  indirection through shared bytes.
- **Exit criteria:** `zeliard.wasm` gone from the repo; CI builds Vite output
  only; game plays identically. Project is 100% TypeScript.

## Regression checklist (run at the end of every stage)

1. Opening intro → title → new game
2. Town entry, walking, NPC conversation
3. Each building: king, princess, sage, weapon shop, magic shop, church, bank, inn
4. Dungeon entry, combat, death sequence, Roka demo transition
5. Save to slot, restore, export to file, import from file
6. Music + SFX (including worklet path), tab-blur/resume
7. Touch controls on mobile viewport; window resize scaling
8. Ending demo playback

## Scope rules per phase

- **Phase A:** `src/*.c` and the wasm ABI are frozen — the bridge is the only
  contract touched.
- **Phase B:** C sources may be read and ported, but never "improved" — they
  are the reference implementation. Behavior changes found along the way are
  filed as issues for after Stage 10.
- **Both phases:** no backend: saves remain localStorage + file
  download/upload. No visual or timing behavior changes; any discovered bug is
  filed, not silently fixed mid-migration.
