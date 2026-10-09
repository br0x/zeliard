# Zeliard — Web Port

A web port and reimplementation of the classic DOS game **Zeliard**.

**Play in your browser:**
https://br0x.github.io/zeliard/

The game is currently fully playable from the opening intro through the ending.

## About

This project started as an effort to reverse-engineer and port Zeliard to the web.

The game runtime is implemented in TypeScript and runs directly in the browser. The project does not require C, WebAssembly, Emscripten, or a native build step to run the game.

The graphics used by the web port have been **fully remastered by me** rather than simply using the original game's graphics.

Some game data remains derived from the original Zeliard game, most notably the world-map data and music. These parts are described separately in the licensing section below.

## Current status

The game is 100% playable from the opening intro through the end.

The web version includes:

* Opening intro, ending, and credits
* Town and dungeon gameplay
* Combat and enemy AI
* Boss encounters
* Shops and banking
* Conversations
* Items and chests
* Save/restore, export/import functionality
* Original game progression
* Remastered graphics
* Browser audio
* Keyboard/gameplay input
* Automated browser smoke tests
* Additional feature: new magical item "Thread of Yaga", for mapping/pathfinding

## Play

**[Play Zeliard in your browser](https://br0x.github.io/zeliard/)**

No installation is required.

## Development

The web application lives in `web/` and uses Vite and TypeScript.

```bash
cd web
pnpm install
pnpm dev
```

The development server runs at:

```text
http://localhost:5173
```

### Tests

Run the unit tests:

```bash
pnpm test
```

Run tests with coverage:

```bash
pnpm test --coverage
```

Run the Playwright end-to-end test:

```bash
pnpm e2e
```

Build the production version:

```bash
pnpm build
```

Deployment to GitHub Pages is automatic on pushes to `main`.

## Project structure

```text
web/
├── src/
│   ├── main.ts
│   ├── core/
│   ├── engine/
│   ├── render/
│   ├── scenes/
│   ├── ui/
│   ├── input/
│   ├── audio/
│   ├── platform/
│   ├── data/
│   └── config/
├── public/
│   └── game/
└── tests/

asm/       Reverse-engineering / original game analysis
tools/     Development and conversion tools
docs/      Technical documentation
```

The TypeScript code uses strict compiler settings including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

## Technical documentation

See [`docs/PORTING_PLAN`](docs/PORTING_PLAN) for technical details about the port and reverse-engineering work.

## Contributing

Contributions, bug reports, corrections, and technical discoveries are welcome.

Please open an issue or pull request if you find a problem or would like to contribute.

## Licensing

This repository contains both original work and material derived from the original Zeliard game, so the contents do **not** all have the same licensing status.

### My original work

The following are released under the **MIT License**:

* original source code written for this project;
* original tools and scripts written for this project;
* original documentation written for this project; and
* graphics and other artwork newly created/remastered for this web port.

See [`LICENSE`](LICENSE) for the license terms.

### Zeliard-derived material

The MIT License does **not** apply to material originating from the original Zeliard game.

The original Zeliard game, its music, characters, trademarks, and other original intellectual property belong to their respective rights holders. This project is not affiliated with or endorsed by those rights holders.
See [`LICENSE`](LICENSE) for more information.

### Third-party material

See [`THIRD_PARTY.md`](THIRD_PARTY.md) for more information.
No rights to third-party material are granted by the MIT License included with this repository.

If you are redistributing this project, please make sure that you have the necessary rights or permissions for any third-party material included in your distribution.

## Disclaimer

This is an independent fan-made project and is provided for educational, preservation, and technical purposes.

The software is provided without warranty. See the applicable license terms for details.

## Donations

This project is completely free and open-source.

If you would like to support development, you can donate using the cryptocurrency addresses listed below:

* ETH: `0xf75E8Fd9d54821C0b5C9B2D7A308c2cb7d403EE1`
* Solana: `969SVJbVXfUFZ1BQU3VtgyAztjiEdSvzNAj1mcQxVqFV`
* TON: `UQDetI9f7t1-Uwa3pybEuumraemy97PnuQ0nnJ5fWeVlPsMJ`
* TRON: `TMfDYy76WEuixhJEfRJyMR16RPc17kUdPY`

## Acknowledgements

This project would not exist without the original developers and artists who created Zeliard.

Special thanks to everyone who has contributed to the reverse-engineering, preservation, and technical understanding of the original game.
