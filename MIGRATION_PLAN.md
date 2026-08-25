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

### Stage 2 — Decompose `game.js` into engine services (still JS semantics) ✅ *(completed)*

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
12. ✅ Conversation leftovers — `readNpcConversationBytes` (the NPC pointer-
    table walk) extracted as a pure exported function of `core/conversation.ts`;
    `ui/conversation-draw.ts` owns box layout (`layoutConversationBox`) and all
    dialog drawing (`drawConversationBox`) behind a `ConversationDrawState`
    view interface; and a new `ConversationManager.startDialog(parsed,
    onComplete)` method replaced game.js's direct field-poking in the Pureza
    warp-building path. Tested: table-walk terminators (0xFF / 0x00 / null
    entries), draw output incl. choice cursors and ▼ indicator, layout
    measure/geometry write-back, startDialog state reset + completion callback.
13. ✅ `core/roka-demo.ts` — the post-boss Tear of Esmesanti collection demo:
    full time-driven state machine (run → salute → sparkle burst/flight
    (Bresenham) → land → tear theme → sheath → runoff), timing table, slot/
    sword-frame/land-clamp geometry helpers. SFX, tear-music and mole-strip
    overlay effects are injected; assets and drawing stay in game.js. Tested:
    every state transition in order, stomp/burst/ping SFX placement, overlay
    count before/after landing, start clamping (tear count/sword type),
    audio-unavailable and 16s music-timeout fail-safes, Bresenham landing.
14. ✅ `core/transitions.ts` — pure transition helpers extracted from the
    town/dungeon flows: `computeTownScrollFromAbsoluteX` (fight.asm
    edge-locking viewport math used on town re-entry), `resolveMusicTrack`
    (town/cavern music mapping), `encodeBossState` (boss descriptor → g_mem
    block + Pascal name, typed `BossState` interface), `getTownMapWidth`.
    The async orchestrators (`handleTownTransition`, `handleDungeonTransition`,
    `initTownFromDungeon`, `handleWarp`) stay in game.js until render/ and the
    asset owners exist. Tested: edge-lock branches (middle/right/left/wrap/
    small-map), full music table + fallbacks, exact boss block byte layout.
15. ✅ `input/key-router.ts` — the keyboard dispatch chain: `KeyRouter`
    (F1/F2/F7/F8/F9 shortcuts, then modal → inventory → intro/ending skip →
    indoor scene → speed-dialog phases → Enter-opens-inventory → polled key
    state, with preventDefault decisions returned to a thin DOM adapter) and
    `KeyEdgeLatches` (the Space/Alt edge detector feeding the wasm latches).
    Tested: every route + guard combination, priority order, consumption
    propagation, phase-specific speed-dialog keys, latch edges + reset.
16. ✅ `render/` foundations — `render/canvas.ts` (`setupGameCanvas`: fixed
    672×432 internal resolution + smoothing off; display scaling is CSS
    pixelated, so no JS resize layer exists), `render/sheets.ts`
    (`drawSheetFrame`, ctx now explicit), and `render/explosion-ring.ts`
    (gfmcga.c 2bpp ring decode, color variants, cached pre-render with an
    injectable document factory). Tested: resolution/smoothing/error paths,
    source-rect math + bounds guards + scaling, 2bpp decode vs known words,
    opaque-pixel counts, inner/outer color mapping, cache identity.
17. ✅ `render/dungeon-logic.ts` — pure rules extracted from the dungeon
    renderer ahead of the wholesale drawing move: `getMagicFrameIndex`
    (spell → 48px sheet frame mapping), `wrapProximityAddress` (circular
    proximity-window arithmetic), `nextAnimatedTile` (the four cavern
    animation rule sets — water/gold/hot/thorns — with rng-injected gold
    pause). The memory scans and blits stay in game.js for now. Tested:
    every spell branch, wrap in both directions, all four rule sets incl.
    chain start/end cells, odd-tick gating, entity-marker exclusion.
18. ✅ `render/dungeon.ts` — the full dungeon renderer moved out of game.js
    (~830 lines): tiles + animated tiles, entities (row-major 2×2 blits with
    yellow hit-flash tinting), hero body/arm layers, sword swing overlay,
    monster + magic projectiles, magia stones, notification/sign boxes,
    roka run, boss explosion ring spawning, and the Guerra effect with its
    full-tick waiter machinery. Memory accessors and the mutable asset
    bundle are injected via `initDungeonRenderer(env)`; game.js keeps only
    the draw()-loop dispatch, encounter-animation state machine, and asset
    loading. Hero frame resolution exported pure. Tested: body/arm/sword
    frame selection for every state priority and shield category/variant.
19. ✅ `render/town.ts` — the town renderer: backdrop, parallax ceiling,
    two scrolling sidewalk strips (offset state + scroll helpers owned by
    the module), g_mem-backed tile map with animated-tile sequences, hero
    walk-cycle sprite, NPCs, and NPC sprite-category parsing. Same env
    injection as the dungeon renderer. game.js now holds only loaders,
    transitions, tick/game-loop dispatch, and scene wiring.

Remaining for this stage's exit criteria (`game.js` reduced to `main.ts`):
- ~~`render/` — canvas setup/scaling plus the town/dungeon drawing functions~~ ✅ (items 16–19)
- ~~Input event *routing* (modal/inventory/conversation dispatch) → `core/`~~ ✅ (item 15)
- ~~Conversation system, Rokademo demo, town-transition flow~~ ✅ (items 12–14)
- ~~Game loop + boot → `main.ts`~~ ✅ (item 20)

20. ✅ `game.js` → `src/main.ts` — the monolith is gone. main.ts is now only
    the composition root: tick loops, draw() dispatch, asset loaders,
    town/dungeon transition orchestrators, save/restore flow, HUD shims, and
    boot; every feature lives in its own owner module. The file carries
    `@ts-nocheck` with a Stage 3 TODO — converting its ~2.2k lines to strict
    TS is exactly Stage 3's remaining-feature-module work.
- **Exit criteria:** `game.js` deleted; every feature has a single owner module. ✅

### Stage 3 — Convert remaining feature modules ✅ *(completed)*
Mechanical conversion, largest-last risk ordering:
- ~~`ui/` dialogs, `touch-controls` → `input/TouchInput`~~ ✅
  - `ui/menu-dialog.ts` — TypewriterText / MenuList / YesNoDialog. Tested:
    word-wrap boundaries incl. dropped wrap spaces, timed reveal/skip,
    menu arrow wrap-around, Yes/No clamping + color override merging.
  - `ui/save-restore.ts` — Save/Restore dialogs now import slot storage from
    `platform/save.ts` directly (main.js re-export cycle removed). Tested:
    name-input rules (trim, 12-char cap, Backspace), input↔list focus dance,
    Re-Start → null confirm, selection clamp on refresh.
  - `ui/import-export.ts` — export/import/delete mode cycling, scroll window,
    delete confirmation state machine (y/Y/Enter confirm, n/N/Escape dismiss,
    all other keys swallowed). Tested incl. external-deletion clamping.
  - `input/touch-input.ts` — the side-effect-at-import module became an
    injectable-deps `initTouchControls(deps)` factory called by main.ts at
    boot on coarse-pointer devices; index.html's second `<script>` tag is
    gone. Tested: D-pad hold/release with multi-pointer tracking, tap
    buttons, speed-pad phase polling (fake timers), name-pad construction.
- ~~indoor scenes one at a time~~ ✅ all 8 in `web/src/scenes/`:
  princess (pattern-setter), king, church, inn, sage, magic shop, bank,
  weapon shop. Each keeps its asm-faithful behavior; exported data tables
  (dialog scripts, price/rate/reward tables, XP thresholds) are tested
  structurally. Highest-value logic covered by unit tests:
  - king: dialog-key selection from g_mem flags, page building/gold-award
    page marking, 10×100 gold gift steps with SFX writes + spoke flag.
  - church: script builder (full-HP vs wounded paths), +8 HP heal ticks to
    max, spell restore, bless animation unblocking, continuation wait.
  - inn: per-town price table, gold deduction/refusal, sleep fade → full
    heal + spell restore, morning flow.
  - sage: intro-vs-menu-vs-death-entry routing, spoken bits, town spell
    grant on first audience, level-up quartile buckets and reward table
    application with XP carryover clamped to next threshold.
  - magic shop: bitmask→stock mapping, buy (deduct + slot fill), sell
    (half-price, slot clear, stock bit restore), no-funds refusal.
  - bank: deposit/withdraw numeric entry (+1/+10 keys, clamping), large-
    deposit laugh trigger, almas exchange in full batches at per-town rates
    (Llama 4→2 verified), balance messages.
  - weapon shop: trade-in = floor(old price/2) net-cost buys, same-sword
    brush-off, shield HP table on purchase, repair cost ceil((max−hp)/2),
    Crest-of-Glory trade gating Knight's sword in Tumba.
- ~~`inventory-screen.js`~~ ✅ → `ui/inventory-screen.ts`. Tested: g_mem
  snapshot parsing (spells/wearables/items), item-use effects (heal clamp,
  full heal, single/all spell refill, shield repair by tier value, enchant
  counter, Kioku feather exit), tab skipping, Ctrl+Shift+S/E debug combo.
- ~~`opening-intro.js` (2,266 lines) and `ending-demo.js` (3,024 lines)~~ ✅
  last — biggest, most self-contained. Both converted as timeline engines
  with loose `IntroStep`/`DemoStep` record types (tightening deferred to
  Stage 4). Tested: timeline shape (21 intro steps), skip routing
  (early→credits→balcony→finish), finish() screen hiding + callback,
  music silencing, wrap/quoted-map/easing helpers.
- **Exit criteria:** ✅ `allowJs: false`; no `.js` left in `src/`
  (`pit-worklet.js` stays a static asset in `public/`); every converted
  module's logic covered by unit tests — suite grew from 257 to **410
  tests** across 37 files. Bonus: main.ts's `@ts-nocheck` was removed and
  its ~2.2k lines now compile under `strict` (Stage 4 can go straight to
  the stricter flag set).
- **Done notes:** touch-controls' circular import of main.js was inverted
  (composition root calls the factory); save/import dialogs read
  platform/save.ts directly; dead code surfaced during conversion was
  deleted only where provably unreachable (e.g. ending-demo dispatcher
  cases for step types its timeline never emits).

### Stage 4 — Hardening & cleanup ✅ *(completed)*
- ~~Turn on the strictest flags that still pass~~ ✅ `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, plus `noUnusedLocals` are now on
  (`verbatimModuleSyntax` was already enabled in Stage 0). ~490 mechanical
  index/null-safety fixes across all modules — `?? fallback` on memory reads
  (arithmetic grouping preserved for asm-parity math), optional chaining,
  non-null assertions only where provably guarded.
- ~~Delete dead code surfaced by the compiler~~ ✅ removed: ending-demo's
  copy-over constants from opening-intro (window-border tables, unused
  timings), opening-intro's never-called `_skipStep`/`_createCreditsCanvas`,
  magic-shop's unused `_andMagicBitmask`, bank's write-only idle-frame and
  goodbye-message fields, sage's `animSuppressed`, inventory-screen's
  `_selectCurrent`, ~120 unused imports/locals in main.ts, dead dispatcher
  cases in ending-demo for step types its timeline never emits.
- ~~Playwright E2E smoke test driving intro→town→one dungeon room with
  screenshot comparison against Stage 0 baselines~~ ✅ `web/e2e/smoke.spec.ts`
  boots the real game, skips the intro via Space, screenshots the town canvas,
  warps into a dungeon room through a new minimal `window.__zeliard` debug
  hook (`ready/mode/enterDungeon/returnToTown`), screenshots it, returns to
  town, and asserts zero console errors throughout. Baselines live in
  `web/e2e/__screenshots__/`; runs in CI alongside Vitest (2% pixel-diff
  tolerance for animation noise).
- ~~Coverage review~~ ✅ `@vitest/coverage-v8` wired into `vitest --coverage`
  with thresholds (70% statements / 58% branches / 75% functions / 72% lines)
  enforced in `vite.config.ts`. Pure logic is at or near full coverage
  (conversation-text 100%, transitions ~100%, roka-demo 98%, save codec 98%);
  gaps filled where they were genuine logic (sage power-queue state machine,
  key-state mappings). Excluded from the metric per the plan's testing-strategy
  table: main.ts (composition root) and the canvas renderers + intro/ending
  timeline engines, whose pixel output is now verified by the E2E screenshots.
- ~~Update README/OPTIMIZE notes~~ ✅ README documents the new scripts
  (`test --coverage`, `e2e`), the code layout, and the strict-TS status;
  OPTIMIZE.md carries a note mapping its game.js-era line references onto the
  new module layout.
- **Exit criteria:** ✅ end of Phase A — fully typed, tested codebase; wasm
  still runs the simulation, unchanged. Suite: **414 unit tests + 3 E2E
  tests**, `tsc` clean under the strictest flag set, production build green.

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

### Stage 5 — Parity infrastructure & engine inventory ✅ *(completed)*

Five PR-sized steps (5a–5e), each ending with tests green + deploy. The wasm
binary stays the live engine throughout; this stage only builds the safety
net that makes stages 6–10 mechanical.

#### 5a — Engine inventory & porting tracker ✅ *(completed)*

Turn the implicit knowledge in `wasm/memory.ts` (~120 `ADDR_*` constants) and
`ZeliardExports` into an explicit, machine-readable ownership map.

- New `web/src/wasm/inventory.ts`: a typed table covering
  - **every export** of `ZeliardExports` (32 functions + memory): signature,
    owning subsystem (`town` / `dungeon` / `data` / `glue`), what it reads
    and writes;
  - **every g_mem region**: address range, owner subsystem, read/write access
    from the C side vs the TS side, whether it survives scene changes, and
    whether it's part of the save image. Derive ranges from the existing
    constants (e.g. `ADDR_PROXIMITY_MAP 0xE000..0xE8FF`, semaphore block at
    `0xFF90..0xFF9F`, input latches `0xFF16..18`, transition scratch
    `0xFFF1..FFF4`) rather than restating them — import the constants so the
    inventory cannot drift from `memory.ts`.
- A structural unit test asserts completeness: every export name in the
  interface appears exactly once; no two regions overlap unless explicitly
  marked `overlapsWith`; every constant exported by `memory.ts` is claimed
  by exactly one region. This test *is* the drift guard for later stages.
- Mark each row with its **port stage** (6–10 or "never — deleted in 10").
  The plan doc gains a progress checklist generated from (or mirrored to)
  this table.

Deliverable: the porting order and per-subsystem progress tracker used by
every later stage. No behavior change.
- **Done:** `web/src/wasm/inventory.ts` — 25 g_mem regions (owner, extents,
  seg0/seg1 addressing, port stage) and all 31 exports of `ZeliardExports`
  (signature, owner, regions read/written, port stage). Regions import
  nothing per-address; the drift-guard test enumerates every numeric
  `ADDR_*`/`MEM_*`/`REACH_*` constant exported by `memory.ts` (incl. array
  elements like `ADDR_SPELL_COUNTS`) and requires exactly-one-region
  coverage, so a new constant without an inventory row fails CI. Exhaustive
  export listing is enforced twice: at compile time
  (`EXPORT_LIST_IS_EXHAUSTIVE` conditional-type guard) and against the real
  wasm binary in tests. Tracker helpers `exportsForStage`/`regionsForStage`
  give each stage its work list; stages 6/9 correctly carry regions only
  (their C internals have no dedicated export surface). Discovered during
  region mapping: exit/death flags (`0xFFE2/3`) sat in an uncovered gap
  between runtime flags and transition scratch — now their own region.
  12 new tests; suite at **426**.

#### 5b — Dispatch layer (the cutover mechanism) ✅ *(completed)*

Today `main.ts` calls bridge wrappers directly (`townUpdate()`,
`dungeonUpdate()`, …). Insert one indirection so any export can be rerouted
to TS without touching call sites:

- New `web/src/wasm/dispatch.ts`: `EngineDispatch` mapping export names →
  implementations. Default bindings point at the existing bridge wrappers.
  `override(name, impl)` installs a TS implementation; `reset()` restores
  wasm. Expose overrides through the existing `window.__zeliard` debug hook
  so Playwright/E2E and manual sessions can flip them without rebuilds.
- Migrate `main.ts` call sites to the dispatch (mechanical, ~15 call sites).
- Unit tests: default routing reaches the bridge wrapper; override wins;
  reset clears; unknown-name override throws.

This is the only main.ts-touching step of the stage.
- **Done:** `web/src/wasm/dispatch.ts` — `EngineDispatch` keyed by raw wasm
  export names (so `inventory.ts` doubles as this layer's port tracker).
  `useBridge()` wires the loaded bridge module's wrappers as defaults and
  throws at boot if any wrapper is missing (ABI drift guard); `override()`
  installs a TS implementation; `reset()` restores wasm; pre-bridge calls
  are dropped, matching the legacy optional-chaining call sites. main.ts
  migrated: 16 module-level bridge vars deleted, all ~21 engine call sites
  now go through `engine.call(...)`, and the `__zeliard` hook grew a
  `dispatch` surface (`override`/`reset`/`state`) for live cutover from E2E
  or console. Dispatched set = 19 exports; memory readers
  (`getTownPendingTransition*`, `readMemory`, …) stay direct bridge calls —
  they become pure TS accessors in 5e rather than dispatch targets. Tested:
  default routing to real wrappers, arg forwarding + return passthrough,
  override-wins/reset-restores, missing-wrapper boot throw, drop-before-init.
  Verified end-to-end: tsc clean, suite at **435**, production build green,
  Playwright smoke (boot → town → dungeon → town) passing through the new
  seam.

#### 5c — Shadow-mode harness ✅ *(completed)*

New `web/src/wasm/parity/shadow.ts` implementing the dual-run technique:

- `shadowWrap(name, wasmFn, tsFn, spec)` where `spec` declares: argument
  types, **watched memory regions** (which g_mem ranges constitute the
  function's observable output — taken from the 5a inventory), and optional
  comparison hooks for float-ish values.
- Per tick: snapshot watched regions → call wasm fn → snapshot → restore
  pre-state → call TS fn → compare return value + region bytes. On mismatch,
  log a divergence record: inputs, first differing offset(s), hex dump of
  both sides (reuse `debugDump`).
- State-restoration subtlety: the TS fn must see the same pre-state the wasm
  fn saw, so the harness snapshots/restores the union of watched regions
  around each call pair. RNG state (once it exists as bytes in g_mem) must be
  included in watched regions — note this requirement in the module docs.
- Enabled behind a debug flag (query param / `__zeliard.shadow.enable(...)`),
  zero cost when off. Divergences surface as console errors + a counter on
  the debug hook so E2E can assert "shadow clean".

Unit tests with fake wasm/ts pairs over a synthetic `LinearMemory`:
match case, byte-mismatch case, return-value mismatch, restoration
correctness (TS sees pristine pre-state).
- **Done:** `web/src/wasm/parity/shadow.ts` — `ShadowHarness.wrap(name,
  wasmFn, tsFn, spec)`: snapshots the spec's watched regions (inventory
  names, seg1 mapping applied), runs wasm, restores pre-state so the TS side
  sees exactly what wasm saw, runs TS, then compares return value
  (`Object.is` or a custom comparator) and region bytes. Divergences carry
  region-relative offsets + hex dumps of both sides and surface as
  console errors; per-export stats (`calls`, `divergences`, `isClean()`)
  feed E2E "shadow clean" assertions. Returns the wasm result always — game
  behavior unchanged either way. No memory view → wasm passthrough.
  Wired to `__zeliard.shadow.attach/detach/state`: attaching wraps the
  export's active implementation through the dispatch layer, detaching
  restores plain wasm; inert (zero cost) unless attached. RNG caveat
  documented in-module: once ported, RNG state must be a watched region or
  every roll diverges. Tested: agreement, byte mismatch w/ offsets+dumps,
  return mismatch, custom comparator, restore-before-TS correctness, seg1
  addressing, diff capping, no-view passthrough, reset. Suite: **444**
  unit tests; build + Playwright smoke green.

#### 5d — Golden-replay recorder & runner ✅ *(completed)*

- **Recorder** (`web/e2e/record.spec.ts`, not run in normal CI): Playwright
  drives gameplay via `__zeliard`; a hook installed by dispatch.ts records
  every dispatched export call `(name, args, frame)` plus periodic g_mem
  checkpoints (input latch writes included). Sessions scripted now:
  town walk + building entry, dungeon run incl. combat + death, boss fight
  warm-up. Output: JSON fixtures under `web/tests/fixtures/replay/*.json`
  (header: build hash of zeliard.wasm, session metadata; body: event list +
  snapshots).
- **Runner** (`web/tests/replay.test.ts`): Vitest loads the real
  `build/zeliard.wasm` in Node via `initWasmFromBytes` (pattern proven by the
  Stage 1 bridge suite), replays events at thousands of frames/sec, and
  asserts final + checkpointed memory states match the fixture. Initially
  trivially green (replaying wasm against itself) — its job is to become the
  verification target for every TS port in stages 6–10.
- Fixture schema lives in `wasm/parity/replay-types.ts`, shared by recorder
  and runner. A schema-version field so old fixtures fail loudly after ABI
  changes instead of producing confusing diffs.
- **Done:** all three pieces landed.
  - *Capture completeness:* the dispatchable surface grew from 19 to 32 ops —
    the TS→memory configuration writes (`loadMdt`, `setDungeonPassableTiles`,
    `setDeathDescriptors`, …) now go through the dispatch too, since a replay
    cannot reproduce dungeon boot without them. main.ts's module-level
    `writeMemory` became a recording wrapper: every TS-side g_mem write
    across all injected modules is captured as a `poke` event (audio-owned
    regions are excluded from verification — the sound driver consumes them
    asynchronously and has no Node counterpart).
  - *Recorder:* `parity/recorder.ts` taps the dispatch (`EngineDispatch.tap`)
    and pokes, digests all 23 non-audio inventory regions every 50 events
    (FNV-1a), and stores raw bytes for regions ≤64B so mismatches report
    exact byte offsets. Activated by `?zeliard_record=1`;
    `__zeliard.recorder.stop()` returns the fixture with a wasm SHA-256
    prefix. `e2e/record.spec.ts` scripts the session (intro skip → town
    walk → enterDungeon(1) + movement/sword swing → returnToTown) gated
    behind `REPLAY_RECORD=1`.
  - *Runner:* `tests/replay.test.ts` replays each fixture in Node against
    the real wasm via the bridge singleton (`parity/replay-runner.ts`),
    verifying every checkpoint. Fixture staleness is enforced
    **behaviorally** — the header's wasm hash is diagnostic metadata only
    (CI rebuilds the binary with unpinned emsdk, so byte identity across
    environments is not achievable; any observable engine change makes the
    checkpoint digests diverge loudly instead).
  - *Bugs found by actually running it:* (1) Uint8Array call args were
    destroyed by JSON serialization (`loadMdt` wrote nothing → C descriptor
    scan span forever); fixed with toTransferable/thawArgs marshaling.
    (2) The dispatch tap fired before invocation, so browser checkpoints
    snapshotted memory *before* the tapped call's effects — every replay
    diverged by exactly one frame-timer increment; tap now fires after the
    impl runs. Found via the new raw-byte diff output (addr 0xFF1A/B always
    +1). Suite: **449** unit tests + recorded fixture replaying clean;
    build + smoke green.

#### 5e — First leaf ports (proof of process) ✅ *(completed)*

Port the smallest exports end-to-end through the whole pipeline
(implementation → dispatch override → shadow check → golden replay), one PR:

1. `_set_input_keys` (data.c:66) — bitmask fan-out into the three input
   latch bytes (`0xFF16..18`). Pure function of its argument; shadow spec
   watches exactly those 3 bytes; replay fixtures cover every key combo.
2. The four scroll-proc setters (`town.c:2402–2405`) — they only write
   `g_town_procs` slots. Port means TS owns the proc-table entries; shadow
   verifies by reading back the C globals' effect on the next tick (the
   watched region is whatever the procs mutate, per inventory).
3. Simple getters already bridged (`get_pending_transition_*`,
   `dungeon_get_viewport_top/state/entity_count`) as pure g_mem readers —
   port to typed accessors and shadow-compare.

Each port lands with: parity tests (shadow harness in Node against real
wasm), golden-replay section re-run, regression checklist items 1–2 spot-run.
- **Exit criteria:** harness + recorder run in CI (recorder scheduled/manual);
  inventory table complete and drift-guarded; dispatch layer carries all
  engine calls; ≥3 leaf exports served from TS behind the dispatch with
  clean shadow runs.
- **Done:** nine exports now have TS implementations in `web/src/engine/`
  (`input.ts` setInputKeys; `town-state.ts` pending-transition getters;
  `dungeon-state.ts` viewport-top/state/render-request getters +
  clearRenderRequest + entity-table word). `wasm/parity/ports.ts` is the
  registry mapping each port to its implementation factory + shadow spec;
  enabled live via `?zeliard_ports=shadow|cutover` or `__zeliard.ports`.
  Scope adjustments, documented: the scroll-proc setters were **not**
  ported — they store JS function pointers consumed by C internals, so they
  only become portable with town.c itself (Stage 7); `entity_count` returns
  a C global invisible to g_mem and moves with Stage 8's entity-table
  accessor layer. Verification stack, all green: exhaustive 256-bitmask
  input-latch parity + seeded-state getter parity against the real wasm in
  Node (tests/leaf-ports.test.ts); golden replay re-run with
  `wasm_set_input_keys` served *entirely* from TS via the runner's new
  impls-rerouting param (fresh engine boot per replay); and two new live
  E2E specs playing boot→intro→town→dungeon→town with walking + sword
  swings — cutover mode fully on TS ports, shadow mode reporting zero
  divergences across 100+ dual-run calls. Bridge gained thin wrappers for
  the three raw pending-transition exports so they could join the dispatch.
  Suite: **458** unit tests + 5 E2E (+1 recorder, skipped by default);
  tsc strict-clean, production build green.

### Stage 6 — Data layer: formats, unpacking, graphics decode ✅ *(completed)*
Port `unpack.c`, `data.c` (MDT map parsing), and the graphics decoders
(`gfmcga.c`, `lega.c`) to TS operating on `Uint8Array`s instead of g_mem
offsets.
- Pure data-in/data-out functions — ideal unit-test territory: decode every
  asset in the repo and byte-compare against wasm output as generated golden
  fixtures.
- **Exit criteria:** all assets load and decode through TS; rendered output
  pixel-identical.

**Done notes:**
- **6a — MDT parsing (`engine/mdt.ts`)** ✅ Town/cavern headers, Pascal names
  (incl. the backslash→ʼ remap), music track id, background type and pat id,
  parsed from raw file bytes with seg0-absolute→file-offset conversion.
  Parity-tested against the wasm-derived bridge getters for **every `.mdt`
  shipped under public/game** (289 checks; degenerate name pointers whose
  length byte runs past EOF are skipped — the wasm side there reads stale
  g_mem leftovers from earlier loads, which is no contract). Fully cut over:
  main.ts's 16 MDT getter call sites now parse the raw bytes it already
  retains (`mdtData`); the bridge getters survive only as parity oracles.
- **6b — Map unpacking (`engine/unpack.ts`)** ✅ Full port of unpack.c:
  step forward/backward RLE decoders, column expansion (incl. the original's
  overshoot-spill quirk and uint16 pointer wraparound), skip-column, full
  `unpackMap`, and the two packed-data cursors that Stage 8's incremental
  scroll will consume. Verified byte-for-byte against a new test-only C
  oracle `_wasm_debug_unpack_map` (exported via Makefile; wrapped through
  bridge/dispatch/inventory like any export) across **all 31 dungeons × 3
  scroll positions each** (left edge, mid-map, right-edge wrap) — 93 parity
  checks. Using dungeon_init as the oracle was tried first and rejected:
  entity markers get baked into the proximity map *after* unpack, which is
  spawn logic, not decoder contract. The oracle caught a real port bug on
  day one: `dest` was reset per RLE segment instead of persisting down the
  column (C keeps the pointer across segments) — exactly the class of slip
  this stage exists to catch.
- **Scope adjustments, documented:** `data.c` is memory layout + the input
  setter — both already TS-owned since Stages 2/5e. The big graphics
  decoders never run at runtime in this port (sheets are pre-converted
  PNGs); the one runtime decode path (gfmcga explosion rings) has been TS
  since Stage 2 item 16. Porting lega.c/gfmcga.c wholesale would be dead
  code — filed for Stage 10 cleanup instead.
- Suite: **813 unit tests** (+27 skipped degenerate-name cases) + 5 E2E;
  tsc strict-clean, production build green, Playwright smoke + ports specs
  passing (rendered output unchanged ⇒ pixel-identical by the existing
  screenshot baselines). Fixture re-recorded against the new binary hash.

### Stage 7 — Town simulation ✅ *(completed)*
Port `town.c`: NPC placement/AI, conversations, building transitions,
edge-scroll logic (`wasm_town_update` / `_full_tick` family).
- Shadow-run town ticks during full regression checklist sessions.
  *(Adjusted during implementation: per-tick shadow dual-run is impossible
  for the town family — the C tick mutates private statics (door-pending,
  pending-wait, return-before-main-loop) that memory snapshot/restore cannot
  rewind. Verification instead uses golden-replay cutover + live E2E.)*
- Golden fixtures: scripted walks through every town, entering/exiting every
  building.
- **Exit criteria:** town runs entirely from TS; wasm town code unreachable.

**7a — tick + entry family ported (`engine/town.ts`, ~700 lines)** ✅
- Full 1:1 port of: `town_main_loop_step` (hero movement/collision vs
  special-tile list and non-passable NPCs, viewport-threshold edge scroll
  with scroll-request bits, door detection via the doors list, door-pending
  animation state machine incl. the Falter-warp 0xFF dest and dungeon-door
  split), `hero_spacebar_interaction`, `check_special_npc_conversation`,
  `start_npc_conversation`, the complete 8-entry NPC AI table (look-and-bob,
  1/2-bit patrols, face-hero, bob-in-place, bounce patrols, static),
  head-tile save/restore, `handle_inventory_key` (incl. the real seg1
  A000↔C000 buffer swaps and 0xFE viewport fill), `handle_edge_screen_
  transition`, `request_dungeon_transition` (+ door-x handoff to the still-
  wasm prepare_dungeon via the newly exported `wasm_set_door_x1`),
  `town_complete_wait`/pending-wait machinery, `wasm_town_init`,
  `town_entry_common` (descriptor FF-scans, middle-layer/pat-id, c015
  conditional patch list), `wasm_town_complete_transition`,
  conversation/building finish. C file statics → `TownTickState`.
- Wired through dispatch + ports registry (`verifyVia: 'replay'`; excluded
  from shadow enables); live E2E cutover mode plays boot→intro→town walk→
  sword swing→dungeon→return-to-town entirely on TS ticks, shadow E2E clean.
- **Open item (7b) RESOLVED ✅:** the recorded-replay cutover divergence was
  a genuine port bug found by the harness — the edge-scroll branch adjusted
  `PROX_START` by ±1 instead of ±8 (one tile = 8px). With that fixed, the
  full town family replays the recorded session bit-for-bit: all 184
  checkpoint digests across every region match with input latching AND the
  entire tick/entry/transition surface served from TS. Test un-skipped and
  asserting clean.
- **7c — default cutover + full golden coverage ✅:** the dispatch layer now
  serves the entire town family from TS **by default** at boot
  (`zeliard_ports=wasm` restores the pure-wasm path; `=shadow` dual-runs leaf
  ports; `reset()` keeps wasm as instant fallback). Golden coverage doubled:
  a second fixture (`town-buildings.json`, ~20.5k events, 409 checkpoints)
  records a session walking to and entering the King's castle (door lookup →
  door-pending animation → building handshake → indoor scene → finish) plus
  town edge transitions in both directions through the neighboring town —
  exercising entry paths, `complete_transition`, and `building_finish` that
  the first fixture didn't touch. Both fixtures replay bit-for-bit under
  pure-wasm AND TS-cutover passes. New debug helpers on `__zeliard`
  (`doors()`, `heroPos()`, `setHeroPos()`, `bldActive()`) back the recorder.
- **Exit criteria met:** during town gameplay no wasm town code executes
  (proven by replay impls-routing + E2E cutover); wasm remains as instant
  fallback until Stage 10. Suite: 818 unit tests + 5 E2E; tsc strict-clean;
  build + smoke green with TS ticks as the default path.

### Stage 8 — Dungeon core 🚧 *(code complete; runtime cutover gated on one divergence)*
Port `dungeon.c`: player physics/collision, scrolling, entity table
management, render-request generation.
- All dungeon.c subsystems are ported to TS with parity tests (8a–8d).
- **Exit criteria** ("dungeon playable with zero calls into wasm dungeon
  exports") is met under `?zeliard_ports=cutover` for the recorded fixtures
  and E2E paths — but the default remains pure-wasm until the
  town→dungeon journey harness (`journeyToDungeon` in
  web/tests/town-dual-run.test.ts) replays clean end-to-end: the TS
  viewport-follow path still diverges by one row ~11 frames after cavern
  entry (see 8d slice-10 status).

**Sub-steps** *(detalized from code survey; dungeon.c = 6.5k lines)*:
- **8a — monster movement & collision primitives ✅**
  `engine/dungeon-entities.ts`: increment/decrement X/Y (uint16 wrap by map
  width, 6-bit Y), all 8 directional `move_monster_*` with their x_rel
  window guards, `monster_move_in_direction`, the full 2×2-footprint
  `check_collision_*2` family (leading-edge blocking, bit7 monster/item
  marker OR-masks, per-direction wrap order), `Check_collision_in_direction`,
  plus tile classification (`coords_to_prox_addr`, proximity row wraps,
  `is_blocking*`/`lookup_shared` against the seg1 passable list,
  `get_airflow_direction` with wind-tunnel level-5 danger checks).
  Verified by two new test-only C oracles (`wasm_debug_monster_move`,
  `wasm_debug_check_collision`) over **2,568 randomized scenarios**
  (120 seeds × 8 dirs for moves incl. record-byte mutation checks;
  201 seeds × 8 dirs for collisions; cavern levels 0/1/4/5/6/7, random
  passable/airflow lists, full-range proximity bytes incl. markers).
- **8b — hero physics (slice 1 landed ✅, slice 2 open):**
  `engine/dungeon-hero.ts` ports `get_dst_monster_flags`,
  `move_hero_left/right_if_no_obstacles`, `hero_moves_right/left`
  (byte-exact window slide via copyWithin + incremental column unpack
  through the shared packed cursors + enemy projectile shifts + monster
  edge re-marking), `every_projectile_moves_*`, `hero_interaction_check`,
  and `hero_coords_to_addr_in_proximity`. Verified via three new oracles
  (`wasm_debug_hero_reset/move_hero_right/move_hero_left`) with
  deterministic scenario sequences: single-move parity passes including
  cursor and full-window comparison; multi-move sequences match except
  monster edge-markers under mixed L/R input (LEFT_COL bookkeeping detail —
  test kept as documented skip with regenerating diagnostics; collision
  primitives from 8a are unaffected). RESOLVED: the scenario never
  initialized the monsters-list pointer word (0xC010), so the wasm oracle
  scanned real leftover entity-table data while TS scanned the deterministic
  scratch list — a test bug, not a port bug; pointer now pinned.
   Slice 2 ✅ `jump_press_handler` ported and verified bit-exact against a
   `wasm_debug_jump_press` oracle across **400 randomized scenarios**
   (rope/squat/height-counter/near-viewport-top cases, ceiling-blocked vs
   ascend transitions).
   Slice 3 ✅ `engine/dungeon-vertical.ts` (~470 lines): the full vertical
   mechanics family — `hero_scroll_down`, `is_over_rope`, `set_zero_flag_
   if_slippery`, `init_on_ground`, `on_left/right_pressed`,
   `try_climb_rope` (rope grab incl. side-step centering through the ported
   on_*_pressed handlers), `identify_platform_tile`,
   `abs_x_to_proximity_rel`, `put_dl_to_proximity_layered`,
   `find_platform_under_hero`, `try_move_platform_down/up`,
   `move_platform_down_damage_monster`, `hero_collapse_platform`
   (crumbling platforms), `check_floor_for_landing`, `land_after_jump`,
   `get_slope_direction_by_tile_under_feet`, `slope_assist_on_landing`.
   Verified by seven parity tests over **1,220 randomized scenarios**
   (full-g_mem + packed-cursor + return-value comparison against seven new
   test-only C oracles: `wasm_debug_try_climb_rope/platform_up/platform_
   collapse/check_floor/land_after_jump/slope_assist/move_platform_down`).
   The harness caught a **real Stage 8a port bug**: dungeon-entities' and
   dungeon-hero's byte readers masked addresses with `& 0xffff`, so every
   seg1 read (`0x18000+`) silently truncated to seg0 — all tile
   classification (passable/slope/airflow lists) had been reading the wrong
   region; fixed via seg-aware readers (existing 8a/8b suites still green,
   jump-parity now genuinely exercises seeded lists). Scenario-builder
   lessons recorded in `web/tests/vertical-scenario.ts`: live scratch tables
   must sit in the band above the proximity window that column-decoder
   overshoot can't reach, and the packed-map stream is a solid `0x55` RLE
   run so columns decode exactly from any cursor alignment. Remaining
   open: `dungeon_update_rope`/`dungeon_finish_rope_frame` (deferred to 8d
   — they pull hero_knockback_handler, state_machine_dispatcher and the
   render/timing machinery), plus the multi-move hero-parity skip whose
   symptoms refined to a proxRight off-by-one under mixed L/R sequences.
- **8c slice 1 ✅ `engine/dungeon-monsters.ts`:** the monster lifecycle
  pipeline (AI bodies themselves stay in eai1..eai8.c for Stage 9):
  `is_in_proximity_window` (all four window/wrap cases),
  `update_all_monsters_in_map` (layer2 clear + whole-table re-marker walk),
  `check_monster_aligned_to_hero_and_tick` (Y/X alignment gating + ÷8 AI
  tick throttle, carry semantics preserved), `monster_activation`
  (small-monster 3×3 occupancy scan and big two-entry monster 5×3 scan with
  the `(idx|0x80)+1` uint8-wrap second marker and word-wide layer2 clear),
  `check_monster_on_aggressive_ground` + `is_tile_safe_to_stay`.
  Verified by four parity tests over **800 randomized scenarios** against
  four new test-only C oracles (`wasm_debug_update_all_monsters/
  monster_activation/check_aligned_tick/check_aggressive_ground`),
  comparing full g_mem + return values; scenario forces alignment/spawn
  deep paths every seed (random positioning reaches them <0.5% of the
  time), mutation-tested (tick-throttle mask and occupancy-scan bound both
  caught). Test-infra lesson recorded: this repo's LCG rng yields raw
  uint32s — every probability check must go through `frac()` and every
  index pick through `% N`; `Math.floor(rand() * N)` silently produces
  out-of-range indices (older parity suites still carry a few benign
  instances — both sides see identical bytes so they remain valid).
- **8c slice 2 ✅ `engine/dungeon-combat.ts`:** the combat & monster-death
  pipeline — `get_random` (the asm/stick.asm entropy accumulator ported
  exactly, with the uint16 static mirrored as module state exposed via
  get/setEntropy; C side pins it through new `wasm_debug_set_entropy/
  get_entropy/get_random` accessors so both sides roll identically),
  `Get_Stats` (defense/sword-damage/level formulas incl. saturating
  multiplies), `apply_sword_hit_to_map_tiles` (per-phase reach-list walk
  from the seg1 table at 0xB002, hit-marking ai_flags 0x41),
  `Hero_Hits_monster` (HP subtraction vs Get_Stats damage, big/small death
  paths, random-vs-downward-thrust descriptor selection), 
  `monster_split_or_die`, `Check_Vertical_Distance_Between_Hero_And_Monster`
  (death animation bits, near-viewport SFX 7), `update_hero_XP`
  (saturating word add) and the sword_damages/byte_98BE tables.
  Verified by five parity tests over **~1,000 randomized scenarios**
  against six new oracles (`wasm_debug_apply_sword_hit/hero_hits_monster/
  get_stats/update_hero_xp/set_entropy/get_entropy/get_random`),
  full-g_mem comparison with pinned entropy; mutation-tested (damage
  doubling removal, missing death-descriptor mask — both caught).
  Test-infra findings: the death-descriptor lists live in g_mem (plain
  MEM8 after the pointer chase), and HERO_XP must be re-seeded between
  parity passes since applyBase doesn't own it.
- **8c slice 3 ✅ `engine/dungeon-items.ts`:** the item/chest dispatch and
  the per-frame spawn tick — `render_notification_string` and the
  render-request writers (gold/almas HUD, sword icon, enchantment gfx,
  cavern signs), `hero_got_gold` (32-bit carry), `mark_collected`,
  `pickup_common`, `put_shoes_to_inventory`, all item handlers (`flag_10`
  drop-item, `flag_11` projectile spawner, `flag_12` delay, `flag_13`
  pickup+chests, `flag_14_15_1b` almas orbs, `flag_16/17` keys,
  `flag_18/19` potions, `flag_1a` cavern shoes, `flag_1c` signs,
  `flag_1d/1e` crest/Feruza shoes), `default_0toF_handler` (chest
  animation state machine incl. cross-monster reset via ai_timer),
  `place_monster_in_proximity_and_run_ai` (layer-2 restore + spell-target
  flag handling + subtype dispatch) and `monsters_spawning` (full per-frame
  walk: proximity stamping with big-monster double markers + layer2
  backups, activation countdown, boss/jashiin delegation). The eai AI
  bodies are injected as a callback (no-op until Stage 9). Verified by
  **16 parity tests over ~1,900 randomized scenarios** against 15 new
  wasm oracles (one per handler plus spawning/dispatch), full-g_mem
  comparison; mutation-tested (chest gold amount, big-monster stamping —
  both caught after scenario fixes). Scenario requirements recorded:
  hero position must be forced into alignment range for pickup gates,
  flags must stay in the item/chest range (&0x18≠0) so the wasm oracle
  never runs real eai AI against the TS no-op, boss/jashiin gates off,
  and every engine-owned word the handlers touch (almas, XP…) must be
  re-seeded between parity passes.
- **8c slice 4 ✅ `engine/dungeon-damage.ts`:** the hero-side damage
  pipeline — `damage_hero` (clamped subtraction), `check_tile_contact_
  damage` / `check_hero_contact_damage` (the 4×3 monster-contact scan with
  per-column knockback vector bytes, facing-vs-shield blocking rules,
  shield absorption with break notifications), `step_on_aggressive_ground`
  (Pirika immunity, squat-aware footprint scan, per-cavern damage table)
  and `Draw_Hero_Health`/notification writers. Verified by two parity
  tests over **500 randomized scenarios** against two new oracles
  (`wasm_debug_check_hero_contact_damage/step_on_aggressive_ground`),
  full-g_mem comparison; mutation-tested (shield-path bypass and damage-
  table index shift both caught). Scenario findings recorded: HERO_HP must
  be seeded between passes (applyBase doesn't own it — at boot HP is 0 so
  every subtraction clamps invisibly), and the C damage-table lookup uses
  `[cavern_level-1]` so level 0 reads one byte before the table (latent
  OOB in the reference port; tests use level ≥ 1).
- **8c complete.** All dungeon.c subsystems outside the state-machine
  wrapper itself are now TS-owned behind parity tests.
- **8d slice 1 ✅ `engine/dungeon-state-machine.ts`:** the update
  dispatcher (`wasm_dungeon_update` state switch) with ROKA_RUN,
  ROKADEMO, EXIT and BOSS_ENCOUNTER handled natively and NORMAL/ROPE/
  DEATH_*/DOOR_PENDING/JASHIIN delegated to injected handlers (later 8d
  slices port them); plus the roka-run family — `roka_run`,
  `dungeon_update_roka_run`, `after_run_animation` (town-exit vs
  dungeon-path, boss/jashiin flag derivation from mdt_desc0, viewport
  adjustment gated on the `g_is_from_town` static now mirrored as a
  caller-owned `DungeonStatics` object) and `Cavern_Game_Init` (boss vs
  regular startup incl. the Jashiin room-2 immediate-fight override and
  room-1 cutscene entry; asset-loading procs are no-ops in both C and TS;
  the BYTE_9F27 `main_update_render` branch is injected). Also
  `clear_viewport_buffer` / `clear_hero_in_viewport`. Verified by three
  parity tests against new oracles (`wasm_debug_dungeon_update`,
  `wasm_debug_set_dungeon_statics`) — multi-frame ROKA_RUN sequences over
  ~60 town-path seeds compared byte-for-byte through
  after_run_animation/cavern init, no-op states asserted untouched on both
  sides. Constraint recorded: dungeon-path cavern-init seeds hang the wasm
  oracle inside the real main_update_render pipeline (BYTE_9F27 branch),
  so they stay excluded until that pipeline is natively ported.
- **8d slice 2 ✅ `engine/dungeon-platforms.ts`:** the platform & magia-
  stone subsystems consumed by main_update_render_pre — `horiz_platform_
  proximity_x_offset`, `hero_on_horiz_platform`, `update_horiz_platform_
  coords` (direction/pause/boundary state machine, hero carry via the
  ported movement primitives), slow-platform tick gating,
  `update_and_render_horiz_platforms` (footprint clear/advance/redraw over
  the 7-byte entry list), `render_vertical_platforms_to_proximity`,
  `process_visible_collapsing_platforms`, `magia_stone_updates` +
  `render_magia_stone_effect` (orbit tables, spell-target injection with
  layer-2 routing). Verified by three parity tests over **500 randomized
  scenarios** against five new oracles (`wasm_debug_update_and_render_
  horiz_platforms/render_vertical_platforms/process_collapsing_platforms/
  magia_stone_updates/render_magia_stone_effect`), full-g_mem comparison;
  mutation-tested (speed-flags masking caught). The harness caught a real
  port bug on day one: the TS entry loop never advanced `si += 7`, spinning
  forever on platform 0 — a hang instead of a silent divergence.
- **8d slice 3 ✅ `engine/dungeon-frame-pre.ts`:** the remaining leaf
  subsystems of main_update_render_pre — `check_airflows_on_hero` +
  `dispatch_airflows` (up-flow lift, no-jump flag), `update_boss_heartbeat_
  volume` (Tear-distance attenuation with the verbatim 256-byte table in
  `heartbeat-table.ts`), and `process_doors` (viewport clipping both
  directions via `calc_object_viewport_x_offset`, color-patched door tile
  tables, occupancy-guarded stamping). Verified by three parity tests over
  **650 randomized scenarios** against three new oracles
  (`wasm_debug_check_airflows_on_hero/update_boss_heartbeat_volume/
  process_doors`); mutations caught (dropped second up-airflow move).
  Boundary note: the heartbeat dy==16 cutoff reads squares[16] OOB in C,
  so it is pinned by a directed assertion instead of parity divergence.
- **8d slice 4 ✅ `engine/dungeon-spells.ts`:** the magic-projectile
  movement family — `Dispatch_Spell_Projectile_Movement` and all five
  movers (`espada/saeta/fuego/rascar/agua_move` incl. the fuego
  horizontal→descending phase switch and multi-slot rascar/agua walks),
  plus the shared helpers (`projectile_step_x_by_direction` with map-width
  wraparound, anim-frame advance, `despawn_projectile_slots` with the
  loc_8B9D fallthrough chain semantics, `monster_is_in_spawn_range_and_
  clear` 3×3 target marking, `mark_proximity_monster_as_spell_target`).
  Verified by one parity test over **300 randomized scenarios** against a
  new oracle (`wasm_debug_dispatch_spell_movement`), full-g_mem
  comparison; mutation-tested (step-size change caught immediately).
- **8d slice 5 ✅ `engine/dungeon-projectiles.ts`:** the enemy-projectile
  pipeline — `projectiles_collision_processing` (list walk + in-place
  compaction), `sub_846F` per-projectile collision (static-tile blocking,
  hero row-band AND column gating, shield direction/tier rules with
  break/block outcomes, knockback vector writes incl. the cx/bx xchg
  semantics), trajectory movement tables (`funcs_85B9` with fallthrough
  reuse), curved-path stepping, and gfmcga's `Render_Sword_Overlay`
  observable state (phase advance + swing termination). Verified by two
  parity tests over **350 randomized scenarios** against two new oracles;
  mutation-tested. The harness caught a **real port bug**: the TS collision
  step consumed projectiles on a row match alone, missing the loc_84B4
  hero-column gate entirely — plus a second real bug where the two
  knockback vector words (0x9F0E/0x9F10) were written swapped. Test-infra:
  parity passes must be hermetic (snapshot/restore of full g_mem) — the
  view exposes C globals past the game arrays whose transient values
  differ between passes; comparison is capped at seg0+seg1.
- **8d slice 6 ✅ `engine/dungeon-frame.ts` (~560 lines):** the per-frame
  pipeline core — `main_update_render_pre` (jump-height/accessory setup,
  airflows, viewport-follow clamps incl. the boss-arena center-x variant,
  HERO_Y derivation, heartbeat, platforms, doors, spell projectiles,
  spawn tick gated on BOSS_IS_DEAD, contact damage, projectile collision
  processing, magia stones, sword overlay, aggressive ground, level-7 heat
  damage), `dungeon_render_timing_step` (the 3-phase frame machine with
  shield-anim flags, neighborhood sampling, potion-heal ticks, explosion
  compaction, projectile render passes, sword-hit application, phase-2
  death trigger + natural regen with the original odd-damage overflow bug
  preserved, boss-reward payout, inventory-open key latch),
  `process_hero_death`, `load_3x3_tiles`/`Sample_Neighborhood_Attributes`
  (with the tile-neighborhood static mirrored as module state),
  `Boss_Explosions_Renderer` (g_mem parts; VRAM bitplane rendering is
  JS-side) and `main_update_render`. Transition flows that own JS-side
  asset loads (`bring_inventory_window`, `load_place_and_reinit`) are
  injected callbacks. All of main_update_render_pre's dependencies are now
  TS-owned.
- **8d slice 7 ✅ `engine/dungeon-input.ts`:** the input & hero movement
  state machine — `input_handling` (sword swing trigger incl. the 4×8
  flying-monster overhead scan and downward-thrust latch),
  `state_machine_dispatcher` + `idle_default`, `init_horizontal_sliding`,
  `down_pressed`, `up_pressed`, `try_door_interaction` (door-tile
  three-cell scan with facing-gated nudge; `enter_the_door`/`open_door`
  arrive in slice 8), `right_up_pressed`/`left_up_pressed`,
  `airborne_movement` (collapse/slope-assist/floor checks, rope grab
  mid-air, facing-turn rules), `sliding_physics_step`, `hero_knockback_
  handler`, `left_default`/`right_default`, `Browse_Projectiles` and
  `reset_dungeon_state_vars`. Composes already-parity-tested primitives;
  full-suite green.
- **8d slice 8 ✅ `engine/dungeon-spell-fire.ts` + `engine/dungeon-doors.ts`:**
  the spell firing chain (`Magic_Spell_Fire_Handler` charge-up/fire state
  machine with per-spell charges, `init_magic_projectile`,
  `init_rascar` 4-beam spread, `init_agua` 3-slot vertical spread,
  `init_guerra` 36×19 instant-hit sweep) and the door interaction flow
  (`enter_the_door`, `open_door` with key/lion-key consumption and
  achievement-flag writes, `enter_opened_door` with the full
  reset_dungeon_state_vars + back-frame render + deferred-completion
  statics save, `dungeon_complete_door_transition` phase 2 incl. town-bit
  handling, pending-dungeon setup and eai module reload). Asset loads and
  VRAM work stay injected callbacks (JS-side).
- **8d slice 9 ✅ `engine/dungeon-states.ts`:** the remaining per-state
  frame handlers — `dungeon_update_normal` (phase 0 input+pre+timing /
  phase 1 finish dispatch incl. the ROPE handoff),
  `dungeon_finish_normal_frame`, `dungeon_update_rope` +
  `dungeon_finish_rope_frame` (rope-still-under-feet checks, dismount
  state reset), `dungeon_death_frame_step` + `dungeon_update_death_fall/
  flash/fade` (anim-phase flash timing, fade blink-out, XP/gold/almas
  death penalties, Felishika-respawn vs sage-transit paths) and
  `dungeon_update_jashiin_cutscene` (room-1 → room-2 mpa0 handoff with
  viewport anchoring and skip-roka-run latch). `DungeonRuntimeStatics`
  carries the C statics (`is_from_town`, `saved_y_view_init`,
  `saved_door_x1`, `g_skip_roka_run`) across frames.
- **8d slice 10 ⚠️ runtime cutover (REGRESSION → REVERTED):** making
  `wasm_town_update` and `wasm_dungeon_update` default to TS caused three
  gameplay regressions: (1) town movement restricted after restore,
  (2) hero walks past map boundaries into wrong areas, (3) dungeon entry
  at wrong coords. Root cause: the C-side statics (`g_is_from_town`,
  `saved_y_view_init`, `saved_door_x1`, `g_skip_roka_run`, door-pending
  state) are set by `wasm_dungeon_init`/`prepare_dungeon` running in WASM
  but never communicated to the TS runtime statics object — a split-brain
  state problem. The cutover has been reverted to opt-in (`zeliard_ports=
  cutover|shadow`) until fixed. The full port code remains in place and
  passes all unit tests.
- **8d slice 10 (REDO) — PARTIAL; default cutover RE-REVERTED.** The
   statics-ownership work below landed and is verified, but play-testing
   after re-enabling the default cutover reproduced the original town
   regressions — because the earlier "fix" (62b231a) had only disabled TS
   ticks, never diagnosed them. Proper root-cause work this round:
   - **ROOT CAUSE of regressions #1 & #2 found & fixed:** `tileInSpecialList`
     (engine/town.ts) passed a seg1-based address (0x18002) to the `g8`/`g16`
     helpers, which mask addresses with `& 0xffff` — the read silently
     truncated to seg0:0x8002, so the special-tile (non-passable) collision
     list never matched. TS town ticks let the hero walk through blocking
     tiles: over the left edge of cmap into the dungeon-trigger tiles
     (regression #2), and into arbitrarily blocked terrain in bsmp after a
     restore (regression #1 "moves 5 tiles right then stops"). Fixed with
     dedicated `seg1_8`/`seg1_16` accessors mirroring C's SEG1_8/SEG1_16
     macros; audit found no other masked seg1 reads in town.ts.
   - **NEW regression harness** (`web/tests/town-dual-run.test.ts`): boots
     the real game state in Node (stdply + actual .mdt files), mirrors
     main.ts's boot sequence AND its async handlers (town→town transition
     incl. MDT reload, town→dungeon transition incl. the full dungeon boot),
     and dual-runs every tick pure-wasm vs TS-ported with per-tick g_mem
     digests. Scenarios now green tick-for-tick: cmap left-edge push,
     cmap→Muralla crossing + right-edge push, Bosque restore walk.
     (Lesson recorded: the golden fixtures and E2E specs all enter dungeons
     via `__zeliard.enterDungeon`, i.e. `is_from_town=false`, and never push
     map edges or exercise restore — that's why they stayed green while the
     game regressed.)
   - The statics-ownership ports from the previous round remain landed and
     verified (`engine/dungeon-init.ts`, shared runtime store, init-family
     parity tests, FRAME_TIMER/TICKS de-conflation, door-completion gap
     fixes, C debug-pin fix).
   - **REMAINING BLOCKER narrowed to Stage 9 scope:** after fixing the last
     true port bug, the town→dungeon journey harness diverges only inside
     the monster table (0xD6A0+ anim/flag fields): the C side runs real eai
     AI bodies while the TS spawning tick injects no-ops "until Stage 9".
     The bug that caused regression #3 ("hero at wrong y after dungeon
     entry") was found via single-tick native↔TS replay of the harness's
     pre-divergence dump: `mainUpdateRenderPre` (dungeon-frame.ts) zeroed
     **BYTE_9F00** — the viewport-follow target — where C zeroes
     **BYTE_9F09** (the jump-step counter, dungeon.c:4686), so the TS side
     scrolled the viewport one row per grounded frame. Fixed; entry is now
     bit-exact. The journey stays as an explicit `it.fails` gate until
     Stage 9 lands (then flip it + the default cutover in main.ts).
     Until then the default remains pure-wasm;
     `?zeliard_ports=shadow|cutover` remain opt-in.
   - *New debugging technique proven here:* dump the pre-divergence g_mem
     from the dual-run harness, then replay that single tick natively
     (gcc-built src/*.c) vs TS in isolation — pinpoints a divergence to one
     function without touching the emcc build.
- **8e — golden fixtures (partially landed ✅):** fixtures now cover
  - `town-dungeon-basics.json` — town walk + one dungeon room (Stage 5d);
  - `town-buildings.json` — King entry/exit + edge transitions both
    directions through the neighboring town (~20.5k events, 409 checkpoints);
  - `dungeon-combat-map5.json` — combat-heavy run on a second dungeon map.
  All three replay bit-for-bit under pure-wasm AND TS-cutover passes.
  Still to record: a death sequence and a boss encounter (needs scripted
  hazard/boss positioning); extend coverage to remaining cavern maps.

### Stage 9 — Enemies & bosses, one file per PR
Port the AI files individually — they're naturally independent staging units,
each verifiable in isolation:
- Regular enemies: `eai1.c` … `eai8.c` (one or two per stage-step)
- Bosses: `crab.c`, `tako.c`, `tori.c`, `akma.c`, `meda.c`, `mao1.c`,
  `mao2.c`, `drgn.c`
- Each lands with: shadow mode clean, golden replay of a recorded boss fight,
  regression checklist section re-run.
- **Exit criteria:** no enemy/boss behavior originates from wasm.

**Progress:**
- **9a ✅ — AI dispatch layer:** `engine/eai-registry.ts` mirrors
  `load_eai_module`'s place_map_id table (dungeon.c:5629): each entry is
  `{ai, reset?}`; unported rows resolve to a no-op AI (monsters hold
  position). `runMonsterAi` replaces the injected no-op in
  dungeon-frame's spawning tick; `loadEaiModule` is now called from the
  ported `prepare_dungeon`, `wasm_finish_rokademo_transition` and the
  door-completion callback (boss `_reset` hooks therefore fire exactly
  once per selection, like C).
- **9c ✅ — `eai2.c` + `eai3.c`:** Boarman (twin-half sync, spear pairs
  via the newly ported `Add_Projectile_To_Array` in dungeon-projectiles),
  Blue Slime, Red Toad (windup/fire/recover), Green/Magic Bat; eai3's
  airborne 8-state dodger, crawler, stationary shooter and grounded chaser.
  Verified by 550 randomized single-monster parity scenarios vs new oracles
  (`wasm_debug_monster_ai_2/_3`), full-g_mem comparison with pinned entropy;
  mutation-tested on both files. Scenario-domain constraints: boarman twin
  records seeded as valid big-monster halves; toad mid-jump counters 2..5;
  eai3 type1 crawl counters 0..5 (dir table is 6 entries — OOB in C beyond).
  Registry rows 2/3/5/6 now serve TS AI.
- **9b (first file) ✅ — `eai1.c` → `engine/eai1.ts`:** Bat/Slug/Frog/Rat
  AI ported 1:1 on top of the Stage 8a movement/collision primitives.
  Verified by 401 randomized single-monster scenarios vs a new test-only C
  oracle (`wasm_debug_monster_ai_1`), full-g_mem comparison with pinned
  entropy; mutation-tested (dropped facing-flip invisible in single-call
  parity — slug's terminal write; throttle reset value caught ×10).
  Scenario-domain lessons recorded: `ai_flags & 0x1F` must stay ≤ 8
  (Get_Stats indexes byte_98BE — OOB in C beyond the table); frog mid-jump
  counters must be seeded 2..5 and rat mid-jump/hop counters high-nibble-
  zero (the original indexes its angle tables with values only guaranteed
  in-bounds by design).
- **9d ✅ — `eai4.c` + `eai5.c`:** Turtle (bitmask state machine +
  trajectory drift), Green Egg (two-tile linking via
  `Find_Monsters_Near_Hero`, ported too; sword-hit absorption rules),
  Icicle trap, Arrow preset-path crawler; Sentry twin pair (center-column
  pacing + single shot), Red Egg (partner teleport beside the hero),
  Eyeball (walk/charge-dash), Vistlet (fly/dive/climb) — plus
  `move_monster_NWE_if_on_airflow`. Verified by 600 randomized multi-call
  parity scenarios vs new oracles (`wasm_debug_monster_ai_4/_5`), full-g_mem
  comparison with pinned entropy; mutations caught on both files.
  *Discipline lesson:* a mutation revert that doesn't match exactly leaves
  live test-breaking code — after this round, always `grep -c MUTATION`
  across src/ before committing a parity suite. Harness lesson: reset ALL
  engine-owned counters (`LAST_PROJECTILE_INDEX`) between passes — applyBase
  doesn't cover them, and leftovers masquerade as port divergences.
   Registry rows 8/9/11/12 now serve TS AI.
- **9e ✅ — `eai6.c` + `eai7.c` + `eai8.c`:** the final three regular-enemy
  overlays — Type0 twin pair (wander + charge-up shot with twin mirroring),
  hovering/diving flier (vertical homing + throttled diagonal steps +
  hit/settle/recover states), grounded hopper (patrol → aligned leap with
  vertical deflect), stationary drop hazard (armed fall + crush sequence +
  warning SFX); eai7's paired ranged twins with overlay-global preferred
  firing distances (pinned through new `wasm_debug_set_eai7_distances` on
  the C side / `setEai7Distances` on TS), centre-patrolling ranged pair,
  ledge/wall trajectory crawler (XLAT-overlap direction tables); eai8's
  medusa two-slot walker, crab horizontal mover, slime burst-walker with
  the original's XCHG-probe quirk preserved verbatim, hovering seeker.
  Verified by 1,200 randomized multi-tick parity scenarios vs three new
  oracles (`wasm_debug_monster_ai_6/_7/_8`), full-g_mem comparison with
  pinned entropy AND pinned distances; mutation-tested (6 mutations incl.
  twin-sync drop, fire-frame shift, distance re-roll off-by-one, trajectory
  phase advance — all caught).
  *Scenario-domain lessons recorded:* randomly-seeded Ys align with the
  hero (<5 rows) only ~14% of the time, starving every proximity-gated
  branch — monsters must be seeded near the hero's row; permanently-set
  random hit bits route every tick into the hit-reaction path (clear them
  ~85%); walled-in monsters freeze in place so their hero-distance never
  sweeps through the firing-distance boundaries — an open corridor must be
  stamped for eai7 type0, otherwise the distance re-roll mutation survives
  2,600 ticks unnoticed. Harness lesson learned the hard way: pinning
  module statics through the *TS* setter only leaves the wasm oracle with
  stale leftovers — each side needs its own pin call (the resulting seed-67
  "wasm does nothing" ghost cost a debugging session; the parity dump's
  entropy field exposed it).
- **9f ✅ — bosses, simple-contact trio:** `crab.c` + `tako.c` + `tori.c` →
  `engine/boss-crab.ts` / `engine/boss-tako.ts` / `engine/boss-tori.ts`
  (~1,700 lines): Cangrejo's body-layout pseudo-monster rendering
  (6×10 hittable parts), acid-drop approach/descent/recoil phases with the
  flags==0x14 droplet-prop animation and spawn sequence, hit recoil and
  death wiggle; Pulpo's 32-slot tentacle layout/shape table pairs with the
  original's deliberate array aliasing preserved (shape masks rotate in
  place), provoked-phase group advance (0→8→16) on hits, retract flinch,
  ink-volley windup/spawn state machine and thrash death; Pollo's
  dive-charge attack (windup flaps → duration-limited charge with
  mid-attack hit cancel), projectile wind-up, pose-pool/shape-mask body
  rendering, heavy-hit priority damage (stat×8) and death sequence.
  Registered as rows 1/4/7 with their `_reset` hooks firing exactly once
  per selection. Verified by **900 randomized 48-tick encounter scenarios**
  vs three new C oracle pairs (`wasm_debug_{cangrejo,pulpo,pollo}_ai/_reset`),
  full-g_mem comparison with pinned entropy; mutation-tested (9 mutations:
  damage shifts, descent-step sign, heavy-segment boundary, ink/proj target
  coords, provoke cap, approach threshold, death length — all caught).
  *Harness lessons:* the boss scenario must reset the projectile list AND
  counter between passes (only tori fires — crab/pulpo stayed green while
  pollo diverged); the proximity window is pinned at leftCol=18 so the
  crab's unbounded `flags==0x14` prop scan always finds its target (a long
  leftward descent otherwise walks the prop out of the window and the wasm
  oracle hangs — latent UB the real game avoids via arena bounds); and a
  deterministic external hit-injector (ai_flags |= 0x40 after each frame)
  is required because renders rewrite `.ai_flags` fresh every frame —
  without it the seeded last-frame hits are the only ones ever processed
  and the damage/provoke/flinch chains never run.
- **9g ✅ — bosses, projectile users:** `zela.c` + `meda.c` + `lega.c` →
  `engine/boss-agar.ts` / `engine/boss-vista.ts` / `engine/boss-tarso.ts`
  (~1,600 lines): Agar's 4×3 body blob with the 10-step movement-pattern
  attack sequence (N/S steps + wall-flagged alignment nudges + the
  fall-through finalize step), near/far shot arming gated on anim phase
  and the wrapped reference column, and the last-hit-wins collect quirk
  (the original's first-hit guard is dead code — preserved); Vista's
  ceiling patrol on the fixed terrain-height profile, hero-band dive
  trigger with climb-back, wing-flap volley (two shots, viewport-gated),
  14×12 body grid from four overlays whose shape masks rotate in place
  (wing slots alias 3 physical arrays — preserved), and the
  request==1/sword≥4 ×32 damage rule; Tarso's left-walk animation table
  stepping, hit-triggered back-off state, charge/projectile state machine
  with the arc velocity table (low-byte-only X adds), head-tile patching
  into the 8×10 render buffer, tile→flags packing, and a reset that also
  restores its mutable (aliased) shape masks. Registry rows 10/13/17 now
  serve TS AI; only mao1/mao2/drgn remain.
  Verified by **1,800 randomized 48-tick encounter scenarios** vs three
  new C oracle pairs (`wasm_debug_{agar,vista,tarso}_ai/_reset`),
  full-g_mem comparison with pinned entropy, animated ANIM_TIMER, and the
  external hit injector; mutation-tested (6 mutations: damage shifts,
  phase mask, sword gate, dive bottom bound, double-damage id, head-patch
  offset — all caught).
  *Harness lessons (costly, recorded for the remaining bosses):* an early
  scenario edit silently dropped the `view[0xC010] = SCRATCH` pointer
  write — every boss then ran against applyBase's leftover monster table,
  producing moving-target "divergences" that cost a long debugging session
  (the give-away was a divergence address that no code path could write);
  vista's ~40-entry renders overrun the old 0xe9e0 scratch into the
  projectile area (0xEB80), clobbering Add_Projectile_To_Array's 0xFF
  terminator — boss lists now live at 0xB100 with ~2.7 KB headroom; and a
  frozen ANIM_TIMER makes get_random's roll stream a fixed arithmetic
  progression whose trigger positions correlate with frame parity, so the
  harness advances it deterministically each tick to keep odd-phase
  branches reachable.
- **Remaining Stage 9 work:** zel2.c (Paguro, row 21), drgn.c (Dragon,
  row 22), akma.c (Alguien, row 28), mao1.c/mao2.c (Jashiin1/2,
  rows 29/30) — plus recorded golden fixtures of at least one full
  scripted boss fight per the stage checklist. After those land: flip the
  journey-harness gate and re-enable the default TS cutover (Stage 8d
  slice-10 redo).
- **All regular enemies (eai1–eai8) now TS-owned.** Registry rows 0–20 and
  23–27 serve TS AI; only boss overlays remain (rows 10/13/17/21/22/28/
  29/30). Journey-harness gate + default cutover stay parked until those
  land.
- **Journey harness now fully green:** cmap → Muralla → cavern door →
  TS `wasm_dungeon_init(is_from_town=true)` → 400 ticks of cavern play
  with real ported AI replays bit-for-bit vs wasm
  (`journeyToDungeon` in tests/town-dual-run.test.ts). The default cutover
  flip stays parked until all AI bodies are ported — flipping earlier
  would freeze monsters in not-yet-ported caverns (visible behavior
  change), violating the "never break playability" rule.

Detalized steps *(from code survey; the AI entry point is
`Monster_AI(m)` → `current_monster_ai` selected by `load_eai_module`'s
place_map_id switch, dungeon.c:5629)*:
- **9a — AI dispatch layer:** port the `load_eai_module` selection as a TS
  registry (`engine/eai-registry.ts`): place_map_id → AI implementation +
  reset hook; `dungeon-items.ts`'s injected eai callback now routes through
  it (no-op entries until 9b+ land). Boss-reset functions
  (`Cangrejo_AI_reset` etc.) become part of each ported AI module. Register
  the per-map selection in the inventory as `data`-owned (no g_mem effect).
- **9b–9e — regular enemies, two per step** (eai1+eai2, eai3+eai4, eai5+eai6,
  eai7+eai8): each AI is a per-monster tick over the entity table using the
  already-parity-tested 8a movement/collision primitives. Verification per
  file: a test-only C oracle (`wasm_debug_monster_ai_<n>` running one tick on
  a seeded entity table) + randomized full-g_mem parity (the 8c pattern),
  mutation-tested. The AI tick throttle/alignment gating from 8c slice 1 is
  the shared caller.
- **9f–9i — bosses**, ordered by fight complexity: crab/tako/tori (simple
  contact patterns), akma/meda (projectile users — compose the 8d spell/
  projectile primitives), mao1/mao2 (multi-phase, Jashiin cutscene
  adjacency), drgn (final). Each boss lands with its `_reset` + tick port,
  randomized parity vs a dedicated oracle, and — where the fight is
  scriptable via `__zeliard.setHeroPos`/debug hooks — a recorded golden
  fixture of at least one full fight.
- Shadow-mode note carries over from 7a/8d: the AI ticks mutate C statics
  (per-AI state machines), so verification is replay-cutover + oracles, not
  per-tick dual-run.

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

## Known reference quirks (filed, do not fix mid-migration)

- none

## Agent rules (MANDATORY)

- **NEVER commit to git.** The developer handles all commits. Do not run
  `git commit`, `git push`, or any other state-changing git operation.
- **NEVER re-take E2E screenshot baselines** without explicit approval —
  a failing screenshot means something changed and needs investigation,
  not a silent baseline update.

## Scope rules per phase

- **Phase A:** `src/*.c` and the wasm ABI are frozen — the bridge is the only
  contract touched.
- **Phase B:** C sources may be read and ported, but never "improved" — they
  are the reference implementation. Behavior changes found along the way are
  filed as issues for after Stage 10.
- **Both phases:** no backend: saves remain localStorage + file
  download/upload. No visual or timing behavior changes; any discovered bug is
  filed, not silently fixed mid-migration.
