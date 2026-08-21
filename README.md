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
pnpm build                # typecheck + tests + static build into dist/
```

Deployment to GitHub Pages is automatic on push to `main`
(see `.github/workflows/deploy.yml`).
