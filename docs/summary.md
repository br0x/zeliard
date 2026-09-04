# Project Summary

## Objective

Web port of the DOS game **Zeliard**, playable end-to-end in the browser.
The current runtime is **pure TypeScript** (Vite + Vitest + Playwright),
deployed automatically to GitHub Pages on push to `main`.

For full architecture, build, and deployment details see:

- [README.md](../README.md) — live status, dev workflow
- [docs/MIGRATION_PLAN.md](MIGRATION_PLAN.md) — TypeScript runtime state and goals
- [docs/PORTING_PLAN.md](PORTING_PLAN.md) — historical C/wasm plan and current asm reference

## Current Status

Game is **100% playable from the opening intro through the ending** —
all 8 caverns, all 10 bosses (Cangrejo, Pulpo, Pollo, Agar, Vista,
Tarso, Paguro, Dragon, Jashiin rooms 1+2), all 10 towns, all indoor
scenes (King, Princess, Sage, Weapon Shop, Magic Shop, Church, Bank,
Inn), inventory, save/restore/import/export, the rokademo (Tear of Esmesanti collection demo after each boss), and the ending demo.

## Architecture (high level)

- `web/src/main.ts` — composition root: boot, game loop, scene wiring,
  town/dungeon transition orchestration, save/restore flow.
- `web/src/engine/` — TypeScript simulation (town, dungeon, EAI1–8
  enemy AI, all boss AIs, combat, items, doors, spells, projectiles,
  state machine).
- `web/src/core/` — memory layout, scene contracts, transitions,
  conversation engine, rokademo, speed-change.
- `web/src/render/` — canvas setup, town and dungeon renderers, sheet
  helpers, animated tile rules, 2bpp explosion-ring decode.
- `web/src/scenes/` — intro, ending, indoor scenes.
- `web/src/ui/`, `input/`, `audio/`, `platform/`, `data/`, `config/` —
  one owner module per feature.
- `web/public/pit-worklet.js` — the only plain-JS runtime artifact
  (AudioWorklet modules load by URL in their own realm).
- `asm/`, `WORK/`, `game/0/`, `tools/` — original assets, disassembly,
  and Python extractors. Kept as engine reference; not built or
  served in the runtime.

## Save Format

256-byte save image, byte-for-byte compatible with the original `.usr` files. The first 256 bytes of the engine's `Uint8Array` (`g_mem[0..255]`) remain the save buffer. The per-cavern "Collected a Tear of Esmesanti" achievement flags are reconciled with the tear
counter on load (see "Tear reconciliation" below).

### Tear reconciliation

On load (`performGameRestore`), if `ADDR_TEAR_COUNT` (0xA0) is 0 but
any per-cavern tear flag is set, the counter is derived from the
flags. Live play continues to set both the flag and the counter, so
the flag is the authoritative source for old saves and the counter
is authoritative for new saves.

The flag table (`TEAR_FLAGS` in `web/src/data/assets.ts`) lists per-
cavern flag address + bit:

| # | Boss Name | MDT  | Flag addr | Bit  |
|---|--------|------|-----------|------|
| 1 | Cangrejo | mp1d | 0x03 | 0x20 |
| 2 | Pulpo    | mp2d | 0x0B | 0x08 |
| 3 | Pollo    | mp3d | 0x13 | 0x02 |
| 4 | Agar     | mp4d | 0x1C | 0x10 |
| 5 | Vista    | mp5d | 0x24 | 0x04 |
| 6 | Tarso    | mp6d | 0x2D | 0x10 |
| 7 | Paguro   | mp7d | 0x36 | 0x80 |
| 8 | Dragon   | mp8d | 0x45 | 0x40 |
| 9 | Jashiin  | mpa0 | 0x47 (≠0) | — (no door achievement) |

Mole-strip slot coordinates (`TEAR_SLOTS_BLUE`, `TEAR_SLOT_RED` in
`web/src/data/assets.ts`) match the original `tears_order_coords` /
`tears_coords` (`asm/rokademo.asm`). Index 8 is the big red tear.
The overlay is rendered into `#tear-overlay` (inside `#mole-top` above
the 672×432 canvas) by `syncTearOverlay` on game start, restore, and
every draw.

## Key Engine Modules

- `web/src/core/roka-demo.ts` — full state machine for the post-boss
  Tear collection demo (run → salute → sparkle flight (Bresenham) →
  land → tear theme → sheath → runoff). Side effects (SFX, tear
  music, mole-strip overlays) are injected; timing, geometry, and
  Bresenham step math are pure.
- `web/src/core/conversation-text.ts` + `conversation.ts` — NPC
  dialog byte-stream parser (line wrap, 15-line paging, control codes
  0x81/0x83/0x85/0x87/0x89/0x8B) and the full conversation state
  machine (Yes/No, purchase flow, end-code chaining).
- `web/src/core/transitions.ts` — town/dungeon edge-lock viewport
  math, music-track resolution, boss-state block encoding,
  `getTownMapWidth`.
- `web/src/engine/dungeon-*.ts` — ~30 modules covering entity
  movement/collision, hero physics (horizontal + vertical), combat,
  monster lifecycle, items, damage, platforms, projectiles, spells,
  state machine, init, frame-pre, runtime. EAI1–8 are injected as
  callbacks (`web/src/engine/eai-registry.ts`).
- `web/src/engine/boss-*.ts` — one module per boss:
  - `boss-crab.ts` (Cangrejo)
  - `boss-tako.ts` (Pulpo)
  - `boss-tori.ts` (Pollo)
  - `boss-agar.ts` (Agar)
  - `boss-vista.ts` (Vista)
  - `boss-tarso.ts` (Tarso)
  - `boss-paguro.ts` (Paguro)
  - `boss-dragon.ts` (Dragon)
  - `boss-alguien.ts` (Alguien)
  - `boss-jashiin1.ts` + `boss-jashiin2.ts` (Jashiin rooms 1+2)

## Testing

- **Vitest unit tests** (`web/tests/`, 800+ tests) — high coverage of
  pure logic: save codec, conversation engine, shop/bank transactions,
  TS memory accessors, engine helpers, combat, item/chest handling,
  enemy and boss AI, typed game state round-trip.
- **Playwright E2E** (`web/e2e/`) — boots the real game, skips the
  intro, screenshots the town canvas, warps into a dungeon room and
  back, asserts no console errors.
- **Coverage** — `pnpm test --coverage` (thresholds enforced in
  `vite.config.ts`).

## Deployment

GitHub Actions workflow at `.github/workflows/deploy.yml` builds
(`pnpm build` → `web/dist/`) and deploys to GitHub Pages on push to
`main`. Live at https://br0x.github.io/zeliard/

## Historical Notes

- Pre-TypeScript era: the engine ran as x86 asm (`asm/`) ported to C
  with emscripten → WASM, with JS (`game.js`) bridging to a canvas UI
  and an AudioWorklet (`pit-worklet.js`) emulating the PIT 8253 at
  236.7 Hz for tick scheduling. See `docs/PORTING_PLAN.md` for the
  historical architecture and asm module map.
- The migration to pure TypeScript is documented in
  `docs/MIGRATION_HISTORY.md` (Stages 0–10).
- The typed-state refactor (extracting `g_mem` flag/word reads into
  typed `HeroState` / `DungeonRuntimeState` / `TownRuntimeState`
  objects) is documented in `docs/REFACTOR_PLAN.md`.

## See Also

- [docs/MIGRATION_PLAN.md](MIGRATION_PLAN.md) — current goals and guardrails
- [docs/MIGRATION_HISTORY.md](MIGRATION_HISTORY.md) — migration diary
- [docs/REFACTOR_PLAN.md](REFACTOR_PLAN.md) — typed-state plan (done)
- [docs/OPTIMIZE.md](OPTIMIZE.md) — input-lag optimization history
