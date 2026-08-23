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
    verifying every checkpoint. Stale-fixture guard: header wasm hash must
    match the local binary.
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
