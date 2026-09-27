This project is a web port of the original Zeliard game, work in progress.
Try it live: https://br0x.github.io/zeliard/
If you want to contribute, please open an issue or pull request.

See [docs/PORTING_PLAN](docs/PORTING_PLAN.md) for technical details.

Current status:
Game is 100% playable from the opening intro through the end.

## Donations info
This project is completely free and open-source, but if you want to support
the development, please consider donating. Crypto wallets:
ETH     0xf75E8Fd9d54821C0b5C9B2D7A308c2cb7d403EE1
Solana  969SVJbVXfUFZ1BQU3VtgyAztjiEdSvzNAj1mcQxVqFV
TON     UQDetI9f7t1-Uwa3pybEuumraemy97PnuQ0nnJ5fWeVlPsMJ
TRON    TMfDYy76WEuixhJEfRJyMR16RPc17kUdPY


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
