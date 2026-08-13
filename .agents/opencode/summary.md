# Project Summary

## Objective
Port of the DOS game **Zeliard** to the browser (JavaScript + WASM). The current feature is the **rokademo** — the tear-of-Esmesanti collection demo played after each boss defeat. The most recent task was save compatibility: old saves (made before the rokademo feature) restore with zero tears rendered because nothing incremented `ADDR_TEAR_COUNT` (0xA0). The fix derives the tear count from the per-cavern savegame achievement flags (e.g. `malicia_items_1` +32 "Collected a Tear of Esmesanti", per `asm/common.inc`).

## Important Details

### Save area / per-cavern tear flags (asm/common.inc, savegame area bytes 0x00–0xFF)
The port copies 256 bytes to `gMemoryBase + 0` on save/restore. Collected tears are recorded per-cavern by each boss cavern's **exit door achievement**: the door struct (`asm/dungeon.inc` `door` STRUC, +9 `d_save_achievement_addr` dw, +11 `d_achievement_flag` db) is OR'd via `enter_opened_door` → `MEM8(addr) |= flag` (src/dungeon.c:4765-4768, mirrors asm/fight.asm `enter_opened_door`). Verified directly from the boss-cavern MDT door tables (descriptor initializer writes `0xC00A` (ADDR_DOORS_LIST) ← doors pointer):

| # | Cavern | MDT | Flag addr | Bit | Variable (asm/common.inc) |
|---|--------|-----|-----------|-----|---------------------------|
| 1 | Cangrejo | mp1d | 0x03 | 0x20 | malicia_items_1 |
| 2 | Pulpo | mp2d | 0x0B | 0x08 | (door writes 0x0B; common.inc documents peligro_items_1=0x0A — doc appears off by one) |
| 3 | Pollo | mp3d | 0x13 | 0x02 | riza_items |
| 4 | Agar | mp4d | 0x1C | 0x10 | escarcha_items_1 |
| 5 | Vista | mp5d | 0x24 | 0x04 | cementar_items_1 |
| 6 | Tarso | mp6d | 0x2D | 0x10 | plata_items_2 |
| 7 | Paguro | mp7d | 0x36 | 0x80 | caliente_items_2 |
| 8 | Dragon | mp8d | 0x45 | 0x40 | falter_items |
| 9 | Jashiin | mpa0 | 0x47 (≠0) | — | no door achievement (0xFFFF); mpa0 descriptor initializer writes 0xFFFF to byte 0x47 = "defeated" |

Slot order on the mole strip (TEAR_SLOTS_BLUE / TEAR_SLOT_RED) matches the original `tears_order_coords` (game.asm:348), which equals `tears_coords` (rokademo.asm:577). `render_tears_collected` (game.asm) renders only from `Tears_of_Esmesanti_count` (0xA0), clamped at 9; index 8 is the big red tear (rokademo.asm `is_big_red_tear`).

### Rokademo implementation facts
- `dman.png` = 936×72 ⇒ 13 sprites of 72×72: 0–9 hero phases, 10/11/12 = small/medium/large sword. Sprite 9 = salute pose.
- `mole_t.jpg` = 672×42 sits ABOVE the canvas (672×432). Blue slots x=[49,121,193,265,386,458,530,602] y=6; red x=320 y=1. `MOLE_IMG_H = 42`.
- Sparkle flies to the slot ABOVE the canvas → Bresenham target y is intentionally negative (`rokademoSlotCenter`: `y = Math.round(-MOLE_IMG_H + slot.y + h/2)`). Bresenham needs INTEGER coords (only ±1 steps) or it never terminates (infinite sfx-28 ping + hang).
- Landing burst/flash is clamped back into the canvas (`rokademoLandCenter`): wide burst 192×48, flash 48×48.
- Original asm (fight.asm:4590) jumps straight to `after_run_animation` after the demo — no second roka run. Port uses static `g_skip_roka_run` in src/dungeon.c (set in `wasm_finish_rokademo_transition` for dungeon targets, consumed in `prepare_dungeon`).
- Boss flow sets BOTH the flag and the counter: hero touches the placed exit door → `enter_opened_door` ORs the tear flag → DOOR_PENDING → `dungeon_complete_door_transition` sees `door_features & 0x80` → `roka_entrypoint()` (src/dungeon.c:1262) increments `ADDR_TEAR_COUNT` (clamped 9) and sets `DUNGEON_STATE_ROKADEMO`.

## Work State

### Completed
- Whole rokademo JS state machine (run → stand → draw → salute → sparkle → fly → land → sheath → runoff) in game.js: `startRokademo`, `updateRokademo`, `drawDungeonRokademo`, `finishRokademoDemo`, `rokademoSlotCenter`/`rokademoLandCenter`, `ROKADEMO_TIMING`, asset loading.
- `draw()` dispatch: `DUNGEON_STATE_ROKADEMO` → `drawDungeonRokademo`; `rokademoHold` fallback keeps the roka backdrop until `wasm_finish_rokademo_transition`'s transition takes over.
- `finishRokademoDemo` calls WASM `finishRokademoTransition` and writes `ADDR_FRAME_TIMER = speedC*4` to bypass the speed gate.
- Tear overlay `#tear-overlay` (DOM, inside `#mole-top` above canvas) synced on startGame / performGameRestore / every draw().
- **Save-compat fix**: `TEAR_FLAGS` table (cavern order), `countCollectedTears()`, `getTearCount() = min(9, readU8(0xA0))` — the counter is authoritative (matches original `render_tears_collected`); the per-cavern flags are NOT folded in during live play because they're set before the Tear is placed (byte 0x47 = Jashiin defeated is written by `load_place_and_reinit` on boss death, before the exit-door rokademo). Old saves (counter 0, flags set) are reconciled once at load via `reconcileTearCountFromFlags()` (called from `startGame` and `performGameRestore`), which writes the flag-derived count back to `ADDR_TEAR_COUNT` only when the counter is 0.
- WASM rebuilt and verified (`wasm_finish_rokademo_transition` exported). `node --check` passes for all JS modules. Logic tested with a standalone script (9 cases pass).

### Active
- (none)

### Blocked
- (none)

## Next Move
- Play-test: restore an old save (pre-rokademo, counter 0, some tear flags set) and confirm the mole-strip overlay shows the collected tears; then defeat the next boss and confirm the demo plays the correct slot.
- Optionally reconcile the Pulpo flag doc (common.inc says peligro_items_1=0x0A +8, actual door writes 0x0B +8).

## Relevant Files
- `asm/common.inc` — savegame-area variable definitions incl. all "Collected a Tear of Esmesanti" bits; `Tears_of_Esmesanti_count equ 0a0h`
- `asm/dungeon.inc` — `door` STRUC (+9 achievement addr, +11 flag); `tear_x equ 0C013h`
- `asm/fight.asm` — `enter_opened_door` (4466-4473), boss demo path (roka_entrypoint call ~4566, `jmp after_run_animation` ~4590)
- `asm/rokademo.asm` — demo scenario, `tear_x_mul4`/`tears_coords`, counter clamp at 9, red tear
- `asm/game.asm` — `render_tears_collected`, `tears_order_coords`
- `src/dungeon.c` — `roka_entrypoint` (1262), `enter_opened_door` (4763), `open_door` (4742), `try_door_interaction` (4712), `g_skip_roka_run`, `wasm_finish_rokademo_transition` (1832), `prepare_dungeon` (1853), `load_place_and_reinit` (923), `remove_accomplished_items` (1209)
- `src/zeliard-wasm.js` — `loadSaveState` (249), `loadMdt` (235), `readMemory`/`writeMemory` (686/700), `MEM_SAVE_DATA=0`
- `game.js` — `TEAR_FLAGS` (~901), `ADDR_TEAR_COUNT` (999), `TEAR_SLOTS_BLUE`/`TEAR_SLOT_RED`/`MOLE_IMG_H`, rokademo state machine, `countCollectedTears`/`getTearCount`/`syncTearOverlay`, `performGameRestore` (~4779), `startRokademo` (~3562)
- `index.html` — `#mole-top`/`#tear-overlay` above the canvas
- `Makefile` — emcc build of `build/zeliard.js`/`build/zeliard.wasm`
