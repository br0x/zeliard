# Known Bugs and Faithful-to-Original Quirks

Engine behaviours that look wrong but are not port defects, plus the places
where the port deliberately diverges from the original. Each entry records
how it was verified against `asm/*.asm` and the overlay binaries in
`asm/*.bin`.

Verification method used for the entries below: the ASM listing was
disassembled straight out of the shipped overlay binary
(`ndisasm -b 16 -o <org> -s <file-offset> asm/eai7.bin`) and compared
instruction-by-instruction. Note that the `eai7.asm` labels sit
`0x139` above the real overlay addresses (the ASM entry `loc_A749` is at
overlay `0xA792`); the instruction sequences and the direction-table
bytes match exactly, so the label shift is cosmetic.

---

## Blue wolf (eai7 type 4) jams against walls it cannot clear

**Status:** original behaviour, port is faithful. Open gameplay decision.

**Where:** `web/src/engine/eai7.ts` — `type4Ai` (473), `type4GroundStep`
(498), `type4TrajectoryStep` (550).
ASM: `asm/eai7.asm` `loc_A749` (914), `loc_A796` (956), `loc_A7C5` (977),
`loc_A7E6`/`loc_A802` (994), `loc_A818` (1021).

### Symptom

A blue wolf walking left reaches a wall and keeps pushing into it: it hops
up one row, drops back down, and repeats forever, never turning around and
never crossing.

### Mechanism

The ground step moves the wolf two tiles west and, when the second
`move_monster_W` is blocked, sets `ai_state |= 0x10` (the *wall* bit,
`eai7.ts:539-541`). The next frame dispatches into the trajectory walker,
which advances the phase and applies one entry of `TYPE4_WALL_LEFT`
(`eai7.ts:63`) = `N, NW, NW, W, W, SW, SW, S`.

If any step of that arc is blocked, `monster_move_in_direction` returns 0
and the trajectory is abandoned (`eai7.ts:576-580`): `ai_state = 0`,
`anim_counter = 3`. The following frame runs the ground step again,
`move_monster_W` is blocked again, the wall bit is set again, and the arc
restarts. Nothing in the original reverses the wolf's facing at a wall:
`type4GroundStep` only flips facing when the hero is within six rows *and
on the opposite side* (`eai7.ts:499-506`), and the random timer only
toggles bit `0x80` of `ai_state` (`eai7.ts:526`) — never `ai_flags`,
which is where facing lives.

### Measured behaviour

Traced with realistic Cavern 7 tiles (`0x20` wall, `0x20` floor — the
tile set in `web/src/data/dungeons.ts:1330`), wolf anchored at row `y`
with the floor at `y+2`:

| Wall rows              | Result                                                      |
| ---------------------- | ----------------------------------------------------------- |
| `y` (1 tile)           | clears it — the arc `N, NW, NW, W, W, SW, SW, S` covers 6 columns |
| `y, y+1` (2 tiles)     | clears it, same arc                                         |
| `y-1, y, y+1` (3 tiles)| **stuck** — the first `NW` is blocked by the wall's top-left tile |
| `y-1 … y+2` (4 tiles)  | **stuck**, same as above                                    |

So the wolf clears anything up to two tiles above its own row and is
permanently pinned by three. The stuck loop is exactly the "runs left
into the wall" symptom: it advances one column, then alternates
`ai_state` `0x00 → 0x10 → 0x30 → 0x00` on a 4-frame cycle with no net
displacement.

### Why it is not a port bug

Every instruction of the type-4 path in `web/src/engine/eai7.ts` matches
`asm/eai7.asm` and the bytes in `asm/eai7.bin`, including:

* the two `move_monster_W` / `move_monster_E` calls per ground step
  (`eai7.ts:535-541` = `loc_A802`);
* the two `test byte [si+5],80h / jz / inc ax` blocks that pick the table
  by facing, and the `test byte [si+9],10h / jnz / xchg cx,bx` that
  picks wall-vs-ledge (bin `0xA88B`–`0xA8A3`);
* the phase index `rol al,1 ×3 / dec al / and al,7`
  (`eai7.ts:567` = bin `0xA87E`), including the deliberate `XLATB`
  overlap into the adjacent seven-byte ledge table at index 7;
* the direction tables at overlay `0xA8B1`, `0xA8B8`, `0xA8BF`, `0xA8C7`
  (`asm/eai7.bin` file offsets `0x778`, `0x77F`, `0x786`, `0x78E`),
  which match `TYPE4_LEDGE_RIGHT` / `TYPE4_LEDGE_LEFT` /
  `TYPE4_WALL_RIGHT` / `TYPE4_WALL_LEFT` at `eai7.ts:62-65` byte for
  byte.

**If this is ever changed, it is a deliberate divergence from the
original DOS game.** Plausible options: reverse facing when a wall arc
aborts without gaining ground, or extend the wall arc so it clears
three-row walls.

---

## Blue wolf occasionally skips a wall jump

**Status:** original behaviour, port is faithful.

**Where:** `web/src/engine/eai7.ts:526` (timer) and `eai7.ts:567` (index).
ASM: `loc_A7C5` (980-985), `loc_A835` (1035-1054).

The ground step adds `0x10` to `ai_timer` every tick; on overflow it
toggles bit `0x80` of `ai_state` and returns without moving. That bit is
also the top bit of the trajectory phase, and nothing clears it except a
trajectory run — so it stays set for up to 16 further ground steps. If a
wall is hit during that window the state becomes `0x90` and the arc
starts at index 3 — `W`, straight into the wall — instead of index 0. The
arc dies on its first step, which zeroes `ai_state` and costs the wolf the
jump. Visually this reads as "it sometimes refuses to jump". At most one
skip per timer overflow. Faithful to the original; do not "fix" the phase
shift without also accounting for the `XLATB` index-7 table overlap it
relies on.

---

## Ledge probe offset (`+1` only when facing right) — not a bug

**Status:** correct as written. Recorded here only so it is not
"corrected" later.

**Where:** `web/src/engine/eai7.ts:508-518`.
ASM: `loc_A796` (956-968); binary `0xA7E7`: `mov ax,48h` /
`test byte [si+5],80h` / `jz` / `inc ax`.

The probe address is `coords(x, y) + 0x48 + (facing_right ? 1 : 0)`.
Monsters are 2×2 tiles and `m_x_rel` / `currY` anchor the **top-left**
tile of that footprint (confirmed by `checkCollisionS2`, which tests
`(x, y+2)` and `(x+1, y+2)` — the two ground tiles directly under the
feet). So `+0x48` is "one row below the feet", and the `+1` samples the
ground under the **leading** half of the footprint: the right column when
running right, the left column when running left. That is symmetric by
design, not a one-sided probe.

A consequence worth knowing: because the sample is the leading column, a
left-facing wolf that walks off a ledge does not take the ledge arc — it
simply falls on the next frame via `move_monster_S` at `eai7.ts:493`.
That is the original's behaviour too.

---

## Slime (eai8 type 3) does not attack in mp80's top corridor

**Status:** confirmed original bug. **Fixed in the port** — deliberate
divergence from the DOS game, scoped to monster type 3 only.

**Where:** `web/src/engine/eai8.ts` — `type3UpdateFacingAndMaybeFire` (361)
now calls `proximity5RowWrapped` (496); the shared facing half lives in
`proximityFacing` (505). The original `proximity5` (475) is left untouched
and is still what the medusa (type 0) and the crab (type 2) use.
ASM: `asm/eai8.asm` `sub_A75D` (942), `sub_A5FE` (702), `loc_A620` (726).
Binary `asm/eai8.bin`: offset `0x75D` = `a0 35 ff / 2a 44 02 / 79 02 / f6 d8
/ 3c 05` = `mov al,[0ff35h] / sub al,[si+2] / jns / neg al / cmp al,5`;
offset `0x5FE` = `e8 5c 01 / 3c ff / 75 01 / c3` = `call sub_A75D / cmp
al,0FFh / jnz / retn`.

### Symptom

In cavern Absor (`mp80.mdt`, map id 23, EAI8) the two slimes on the top
corridor — table entry **#30** at `x=136` and **#34** at `x=162`, both
`currY = spwnY = 0`, `flags & 0x0F = 3` — walk their patrol range (#30 paces
`x=136…141`, the `x+2`/`x+1` head cells east of it are solid) and never throw
a projectile, however close the hero stands. They animate and walk normally,
so the failure reads as a monster with its attack disabled rather than a
monster with a dead AI.

### Mechanism

1. **The map puts them on the top edge.** Rows 63, 0 and 1 are passable and
   row 2 is solid for `x = 120…145`, so the pair live in a two-row corridor
   whose floor is row 2. The nearest other floors are row 9 (the
   `x=147…153` shaft) and row 20. No ground exists at rows 3–7, and mp80's
   vertical platforms (rows 14, 21, 22, 34, 35, 43, 44, 60) and horizontal
   platforms (lowest row 8) never come near the corridor.
2. **The hero's `hero_y_absolute` is its *head* row, not its feet row.**
   `hero_y_absolute` (`0xFF35`) is written as
   `head_y_view + viewport_top_row` (`dungeon-frame.ts:336`), and the hero is
   three tiles tall — `checkFloorForLanding` (`dungeon-vertical.ts:488`)
   probes `head + 3` rows for the ground. Standing on the row-2 corridor
   floor therefore gives `hero_y_absolute = 63`, and `0…4` is the only range
   the original's 8-bit delta accepts for a monster on row 0.
3. **`sub_A75D` does not wrap.** It subtracts the two raw bytes in 8-bit
   signed arithmetic and compares against 5:
   `63 - 0 = 63` → `cmp al,5` falls through → `mov al,0FFh` → "not near".
4. **`sub_A5FE` bails on that.** `cmp al,0FFh / jnz / retn` returns before
   the `get_random & 7` roll, so `or byte [si+9],4` is never executed.
5. **`loc_A620` is gated behind that bit.** `test byte [si+9],4 / jz` in the
   slime entry point means the shot routine — the only caller of
   `Add_Projectile_To_Array` for type 3 — is never entered from the corridor.

### Scope of the blind spot

The original is not disabled everywhere, only where the player meets it.
Head rows `0…4` *are* reachable in this map, but never next to the slime:

* the corridor floor (row 2) gives head row 63, and a jump only goes
  further up the numbers — never back to `0…4`;
* the `x=147…153` shaft has its floor at row 9, so standing there is head
  row 6 and a jump (`JUMP_HEIGHT_INCLUDING_SHOES` = 2, or 4 with the Feruza
  Shoes) reaches head row 4 — in range, but six to fifteen columns east of
  the slime's `x=136…141` patrol, and the shot travels along row 0 while the
  hero is at rows 2–4, so it could not connect even if it were fired;
* the ropes at `x=143` and `x=157` top out at row 8, and no platform
  reaches the corridor.

So the visible effect is that the corridor slimes are a harmless prop:
they walk, animate, and can be killed, but never attack.

### Measured behaviour

Slime anchored on row 0, hero head row varied, everything else the real
mp80 tileset and monster table. "Shot" = a descriptor appended to the
projectile list at `0xEB80`.

| hero head row | original | port |
| ------------- | -------- | ---- |
| 63 (corridor floor — the reported case) | never | frame 6 |
| 60 (4 rows up, through the wrap) | never | fires |
| 0–4 (reachable only away from the slime) | fires | fires |
| 5 / 59 (5 rows away, circular) | never | never |
| 30 (far side of the cavern) | never | never |

The `0–4` row is listed to show the fix does not regress the in-range case.

### The fix

`proximity5RowWrapped` masks the row delta to six bits and folds it:

```ts
const dy  = (hero_y - currY) & 0x3f;
const abs = dy >= 32 ? 64 - dy : dy;
if (abs >= 5) return { value: 0xff, distance: 0, carry: false };
```

so row 63 reads as the row immediately below row 0, which is the geometry
the player actually sees. The facing half of `sub_A75D` was factored out
into `proximityFacing` so both variants share it verbatim and cannot drift.

**Blast radius is provably additive.** Both operands are already in
`0…63`, so the raw difference is in `-63…63` and the original's signed 8-bit
reading is exact — it can never disagree with the folded 6-bit one except
when the magnitude is 60–63 rows, i.e. across the row-63/row-0 seam. For
magnitudes 5–31 both agree, and 32–59 fold to a value that is still ≥ 5.
The change therefore only ever *adds* shots, only ever across the seam, and
only for type 3. Medusa and crab keep the original byte arithmetic.

**This is a divergence from the original DOS game**, which has the same
blind spot. It was chosen because the affected monsters are fully visible
and permanently harmless otherwise, and because the fix is a strict
superset of the original's shooting set.

### Tests

`web/tests/eai8-slime-fire.test.ts` — the mp80 corridor case, the far-side
wrap, the pre-existing non-wrapping case, the non-firing circular
distances, and a guard asserting the type 2 (crab) proximity rule is still
on the 8-bit delta (a row-0 crab with the hero's head at 63 must not enter
its chase branch).
