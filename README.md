This project is a web port of the original Zeliard game, work in progress.
Try it live: https://br0x.github.io/zeliard/
If you want to contribute, please open an issue or pull request.

See [PORTING_PLAN](PORTING_PLAN.md) for technical details, and
[MIGRATION_PLAN](MIGRATION_PLAN.md) for the current TypeScript migration
status. The full migration diary lives in
[docs/MIGRATION_HISTORY.md](docs/MIGRATION_HISTORY.md).

Current status:
Game is playable until (included) gold caverns (town Dorado)

## Development

The web app lives in `web/` (Vite + TypeScript). The runtime is pure
TypeScript; no C, wasm, emsdk, or Makefile step is required.

```sh
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
- `web/src/core/`, `engine/`, `render/`, `scenes/`, `ui/`, `input/`,
  `audio/`, `platform/`, `data/`, `config/` — one owner module per feature;
  all strict TypeScript (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`). No JavaScript ships in
  `src/`; the only plain-JS artifact is `public/pit-worklet.js` (loaded by
  URL inside an AudioWorklet realm).
- `web/tests/` — Vitest unit suites; pure logic (save codec, conversation
  engine, shop/bank transaction rules, TS memory, engine helpers, combat,
  item/chest handling, enemy and boss AI) is covered heavily.
- `web/e2e/` — Playwright smoke test: boots the real game, skips the intro,
  screenshots the town canvas, warps into a dungeon room and back.
