# TypeScript Migration Status and Goals

The TypeScript migration is complete. The web port now builds as a pure Vite +
TypeScript static app: no C engine, no wasm artifact, no emcc/Makefile build
step, and no shared WebAssembly linear memory.

For the detailed Stage 0-10 migration diary, including parity-harness notes and
bug archaeology, see [docs/MIGRATION_HISTORY.md](docs/MIGRATION_HISTORY.md).

## Current State

| Area | Current owner | Notes |
|---|---|---|
| App bootstrap | `web/src/main.ts` | Composition root: boot, game loop, asset loading, scene wiring, save/restore flow, town/dungeon transition orchestration. |
| Engine simulation | `web/src/engine/*.ts` | Town, dungeon, enemy AI, boss AI, combat, item/chest, doors, spells, projectiles, and state-machine logic are TypeScript-owned. |
| Memory model | `web/src/core/memory.ts`, `web/src/core/ts-memory.ts` | Layout constants plus a TS-owned 256 KB `Uint8Array`; the first 256 bytes remain the save image for backward compatibility. |
| Rendering | `web/src/render/*.ts` | Canvas setup, town renderer, dungeon renderer, sheet helpers, animated tile rules, explosion-ring decode. |
| Scenes/UI/input/audio | `web/src/scenes/`, `web/src/ui/`, `web/src/input/`, `web/src/audio/` | Strict TypeScript modules with side-effect boundaries kept injectable where tests benefit. |
| Data/assets | `web/src/data/`, `web/public/` | Static tables in TS; game data and image/music/SFX assets served from `public/`. |
| Audio worklet | `web/public/pit-worklet.js` | Intentionally plain JS because AudioWorklet modules load by URL in their own realm. |
| Build/deploy | `web/package.json`, `.github/workflows/deploy.yml` | `pnpm install`, typecheck, Vitest, Playwright, Vite build, GitHub Pages deploy. |

There should be no `web/src/wasm/` directory, `src/*.c`, `src/zeliard.h`,
`Makefile`, or `build/zeliard.wasm` in the active runtime path.

## Guardrails

- Keep the app deployable as static files only. No backend requirement for save,
  restore, import, or export.
- Keep the save format compatible: saved state is still a 256-byte image loaded
  at `g_mem[0..255]`.
- Preserve original gameplay behavior unless a change is intentionally scoped as
  a gameplay fix and covered by regression testing.
- Keep `web/src/` TypeScript-only. The only plain-JS runtime artifact should be
  `web/public/pit-worklet.js`.
- Do not reintroduce wasm, emsdk, the old C sources, or bridge/dispatch/parity
  code into the production path.

## Current Architecture

```
web/
├── index.html
├── public/
│   ├── assets/             # images, music, SFX
│   ├── game/               # original game data + stdply.bin
│   ├── pit-worklet.js      # static AudioWorklet module
│   └── styles.css
├── src/
│   ├── main.ts             # composition root
│   ├── audio/              # SoundManager and audio integration
│   ├── config/             # engine constants and feature flags
│   ├── core/               # memory layout, TS memory, scene contracts, shared logic
│   ├── data/               # static asset paths and dungeon definitions
│   ├── engine/             # pure TypeScript game engine
│   ├── input/              # keyboard/touch state and routing
│   ├── platform/           # save slots, file import/export
│   ├── render/             # canvas renderers and drawing helpers
│   ├── scenes/             # intro, ending, indoor scenes
│   └── ui/                 # HUD, dialogs, inventory, modal handling
├── tests/                  # Vitest unit tests
├── e2e/                    # Playwright smoke/regression tests
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Testing Strategy

Primary gates:

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm e2e`
4. `pnpm build`

The highest-value tests are still the pure-logic suites: save codec, memory
accessors, input mapping, conversation state, shop/bank transactions, town and
dungeon engine helpers, enemy/boss AI, combat, item/chest handling, and transition
logic.

Canvas pixels, real browser boot, and end-to-end scene flow are covered by
Playwright. Real audio playback and worklet internals remain mostly manual
regression targets because the worklet runs in its own browser realm.

## Active Cleanup Goals

1. Keep stale migration-era wording out of live docs and source comments.
   References to `game.js`, `wasm`, `bridge`, `dispatch`, or C oracles are fine
   in historical notes, but should not describe the current runtime.
2. Keep `main.ts` as a composition root. Move new reusable behavior into owner
   modules rather than growing boot/game-loop code.
3. Prefer small, behavior-preserving cleanups in the engine. The port was
   parity-first; idiomatic refactors are welcome only when tests keep the old
   behavior pinned.
4. Expand regression coverage around real gameplay paths that historically found
   bugs: restore-then-walk, town edge transitions, dungeon entry from town,
   kill-and-walk-over-corpse, hero death, and boss exit into the Roka demo.
5. Keep README, OPTIMIZE notes, and this file aligned with the pure-TS runtime.

## Regression Checklist

Run this before substantial engine, save, input, render, or scene changes:

1. Opening intro -> title -> new game.
2. Town entry, walking, edge scrolling, NPC conversation.
3. Buildings: king, princess, sage, weapon shop, magic shop, church, bank, inn.
4. Dungeon entry from town, combat, item drops, corpse walk-over, death sequence.
5. Boss victory exit -> Roka demo transition -> return flow.
6. Save to slot, restore, export to file, import from file.
7. Music + SFX, including AudioWorklet path and tab blur/resume.
8. Touch controls on mobile viewport and fixed-resolution canvas scaling.
9. Ending demo playback.

## Agent Rules

- **Never commit to git.** The developer handles commits. Do not run
  `git commit`, `git push`, or any other state-changing git operation.
- **Never re-take E2E screenshot baselines** without explicit approval. A failing
  screenshot means behavior changed and needs investigation.
