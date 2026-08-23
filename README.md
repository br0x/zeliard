This project is a web port of the original Zeliard game, work in progress.
Try it live: https://br0x.github.io/zeliard/
If you want to contribute, please open an issue or pull request.

See [PORTING_PLAN](PORTING_PLAN.md) for technical details

Current status:
Game is playable until (included) gold caverns (town Dorado)

## Development

The web app lives in `web/` (Vite + TypeScript, migrating per
[MIGRATION_PLAN](MIGRATION_PLAN.md)); the C engine still builds to wasm via `make`.

```sh
make                      # build build/zeliard.wasm (requires emsdk)
cd web
pnpm install
pnpm dev                  # dev server at http://localhost:5173
pnpm test                 # unit tests (vitest)
pnpm test --coverage      # unit tests with coverage report
pnpm e2e                  # Playwright smoke test (boots the game in a browser)
pnpm build                # typecheck + static build into dist/
```

Deployment to GitHub Pages is automatic on push to `main`
(see `.github/workflows/deploy.yml`).

### Code layout

- `web/src/main.ts` — composition root: boot, game loop, town/dungeon
  transition orchestration, save/restore flow.
- `web/src/core/`, `render/`, `scenes/`, `ui/`, `input/`, `audio/`,
  `platform/`, `wasm/`, `data/`, `config/` — one owner module per feature;
  all strict TypeScript (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`). No JavaScript ships in
  `src/`; the only plain-JS artifact is `public/pit-worklet.js` (loaded by
  URL inside an AudioWorklet realm).
- `web/tests/` — Vitest unit suites (414 tests); pure logic (save codec,
  conversation engine, shop/bank transaction rules, memory map, bridge) is
  covered at or near 100%.
- `web/e2e/` — Playwright smoke test: boots the real game, skips the intro,
  screenshots the town canvas, warps into a dungeon room and back.
