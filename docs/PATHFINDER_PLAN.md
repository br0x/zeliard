# Thread of Yaga — Cavern Pathfinding Plan

Status: **implemented and played** — phases 0–8 shipped; the jump model, the rope
family, the fall, the node rule and the current-carrying rule were corrected against
the engine, and the guide and the chevrons were corrected against a player walking
the route. §18 is the handover: what each correction was, where it came from, and
what it changed. **§19 is the next piece of work and is not built**: keys are still
only something the search spends, never something it goes and gets.
Scope: a new consumable magic item that reveals the current cavern group, lets the
player pick a destination, and computes and displays the shortest traversable
route — both on the full-screen map and as chevron tiles over the live cavern
background.

This document began as the implementation plan and is kept as the record of it.
Everything below was verified against the port source (`web/src/`) and against the
shipped data (`web/public/game/0/*.mdt`, `tools/GrpViewer/*.grp.unp`). Numbers
marked **[measured]** come from a run over all 31 dungeon maps.

**On provenance:** there is no C and no WebAssembly in this game — it is all
TypeScript. `asm/fight.asm`, `asm/dungeon.inc` and `asm/common.inc` are the original
disassembly, kept because they are the best executable documentation of the rules,
and `dungeon.c:NNNN` references are provenance for the ports rather than a running
binary. Where behaviour is claimed, the claim is traceable to a file in
`web/src/**`.

**Where a later session corrected the plan, the plan now carries the correction and
says so.** §7.2 (what a node is), §7.3 (how a jump is generated) and §10 (how the
route is drawn and kept) were all wrong at first in ways only playing the game
showed; §18 says what they were.

---

## 1. Goals

- Add a new **consumable magic item**, the **Thread of Yaga**, stocked by every
  magic shop at a significant price.
- Using it opens a full-screen cavern map that fits the 672×432 canvas.
- The player can switch between all maps of the current **cavern graph** and
  click any reachable passable tile.
- A shortest path is computed from the hero's current position across the whole
  graph, honouring every real traversal rule: walking, rope climbing, jumping,
  high jumping, falling, slope climbing, aggressive ground, ice, heat, doors,
  keys, **vertical platforms, horizontal platforms and collapsing platforms**.
- The route is drawn on the map, and then **continues to be shown in the normal
  cavern view as chevron tiles over the background, starting from the hero's
  head**.
- The route stays truthful: it is recomputed when the hero's abilities or the
  world state change.
- Navigation data is **pre-calculated** so that gameplay-time cost is a single
  fast A* over an in-memory graph.

### Non-goals (explicit)

- **No auto-walking.** The route is guidance; the hero walks it. See §4 D1.
- No pathfinding through towns. Town doors terminate the graph.
- No pathfinding through monsters. Monsters are ignored (the brief assumes the
  hero can beat anything on the route).
- No change to the original game balance or physics.

---

## 2. Verified domain model

Everything in this section is a property of the shipped data and the existing
port. Do not re-derive it; it is written down so the implementation can be
checked against it.

### 2.1 There are no "rooms"

A Zeliard cavern is **one continuous tile grid**, not a grid of screens.

| Property | Value | Source |
| --- | --- | --- |
| Grid size | `mapWidth × 64` tiles | `asm/fight.asm:19`, `engine/mdt.ts:39` |
| `mapWidth` range | 42 … 320 (31 maps) **[measured]** | MDT header byte 2 |
| Viewport | 28 × 18 tiles = 672 × 432 px | `config/engine.ts:6-8` |
| Tile size | 24 px (original 8 px × 3) | `config/engine.ts:6` |
| Proximity window | 36 × 64 at `g_mem[0xE000]` | `core/memory.ts:170` |
| Wrap | columns wrap `mod mapWidth`; rows wrap `mod 64` | `engine/dungeon-hero.ts:112-215`, `dungeon-vertical.ts:96` |

Tile ids in the map are 6-bit (`0x00`…`0x3F`), produced by a column-major RLE
stream at MDT offset `0x1B` (`engine/unpack.ts:39-102`).

### 2.2 The hero is a 3×3 block of tiles

The hero occupies columns `x … x+2` and rows `y … y+2`, where `x` is the hero's
**left** column and `y` the hero's **head** row (`render/dungeon.ts:738-757`,
`engine/dungeon-hero.ts:218-268`). Movement is exactly ±1 tile per tick — there
is no sub-tile position anywhere in the dungeon engine.

This is the single most important fact for pathfinding: **a position is only
valid if all nine of those tiles are non-blocking and there is ground under the
feet.**

### 2.3 Tile semantics

Passability is not a property of the tile id alone — it is a per-cavern lookup
table, matching the engine exactly (`engine/dungeon-entities.ts:63-97`):

| Table | Size | g_mem address | Source |
| --- | --- | --- | --- |
| passable tiles | 24 B | `SEG1_BASE + 0x8000` | `dungeons.ts` `passableTiles` |
| slope left (`/`) | 4 B | `+ 0x8018` | `slopeTilesLeft` |
| slope right (`\`) | 4 B | `+ 0x801C` | `slopeTilesRight` |
| aggressive ground | 4 B | `+ 0x8020` | `aggressiveGround` |
| airflows | 12 B | `+ 0x8024` | `airflows` |

Engine predicates to mirror exactly:

```ts
lookupShared(g, tile)          // dungeon-entities.ts:63
isBlockingTile(g, tile)        // dungeon-entities.ts:73  — head row; tile >= 0x40 always passable
isBlockingTileSimple(g, tile)  // dungeon-entities.ts:89  — body/feet rows; tile >= 0x49 always passable
```

Both hard-block `(tile & 0x9F) === 0x90 || 0x91`, and both treat `bit 7` (an
entity marker) as non-blocking.

Special tiles:

| Tiles | Meaning | Source |
| --- | --- | --- |
| `0x01`, `0x02` | rope (climbable) | `dungeon-vertical.ts:104-107` |
| `0x40`–`0x42` | vertical platform (left/mid/right) | `dungeon-platforms.ts:252-270` |
| `0x43`–`0x45` | collapsing platform | `dungeon-platforms.ts:275-292` |
| `0x46`–`0x48` | horizontal platform | `dungeon-platforms.ts:180-247` |
| `0x4A` | **door trigger** tile | `dungeon-input.ts:283-300` |
| `0x49`–`0x60` | door frame tiles | `dungeon-frame-pre.ts:144-156` |
| `0x80 | n` | entity marker, real tile in layer 2 at `0xED20` | `render/dungeon.ts:244` |

There are **no ladders**; ropes (tiles `1`/`2`) are the only free vertical climb.

### 2.4 Movement primitives and their real numbers

Everything moves at exactly one tile per tick, so tick counts are a natural cost
model for the search.

| Primitive | Rule | Cost | Source |
| --- | --- | --- | --- |
| Walk | 1 tile/tick; head row uses `isBlockingTile`, body/feet use `isBlockingTileSimple` | 1/tile | `dungeon-hero.ts:218` |
| Jump | ascent limited by `jumpHeight`: **2 tiles**, or **4 with Feruza shoes** | `2*jumpHeight + |dx|` | `dungeon-frame.ts:299-303` |
| Fall | 1 row/tick; lands on the first row with floor under the hero's 3 columns | 1/row | `dungeon-vertical.ts:488-504` |
| Rope climb | grabbed when the tile at the hero's middle column (or an adjacent one) at head row is `1`/`2`; cannot jump off, must press Down | 1/row | `dungeon-vertical.ts:198-239` |
| Slope | probed at the feet row (`heroTL + 2*36 + 1`); slides downhill every 4th tick unless holding uphill | 2–3/slope tile | `dungeon-vertical.ts:565-599` |
| Aggressive ground | walkable but deals damage every tick | — | `dungeon-damage.ts:177-218` |
| Ice | only cavern level 4; builds up while walking, then slides | — | `dungeon-input.ts:196-207, 443-465` |
| Heat | only cavern level 7; 15 HP every 64 ticks | — | `dungeon-frame.ts:357-369` |
| Landing squat | mandatory after a fall of ≥ 2 rows | — | `dungeon-vertical.ts:527-529` |
| Door | open animation, then transition | 4, or 44 if locked | `dungeon-doors.ts:217-228` |

### 2.5 Wearables that gate traversal

Read from `current_accessory` (`g_mem[0x9E]`), codes from `asm/common.inc:36-40`.

| Code | Item | Traversal effect | Implementation |
| --- | --- | --- | --- |
| 1 | Feruza shoes | jump 4 tiles instead of 2 | `dungeon-frame.ts:299-303` |
| 2 | Pirika shoes | immune to aggressive ground | `dungeon-damage.ts:179` |
| 3 | Silkarn shoes | cancels the forced slope slide (climb slopes) | `dungeon-vertical.ts:578-580` |
| 4 | Ruzeria shoes | removes ice sliding | `dungeon-vertical.ts:110-118` |
| 5 | Asbestos cape | immune to cavern-7 heat | `dungeon-frame.ts:357-369` |

The brief's "wearable items available to climb slopes, walk aggressive grounds,
high jumping" maps to Silkarn, Pirika and Feruza. Ruzeria and the Asbestos cape
are also modelled because they gate real routes in caverns 4 and 7.

### 2.6 Doors are records, not tiles

A 12-byte record list at `g_mem[0xC00A]`, terminated by `x0 == 0xFFFF`
(`asm/dungeon.inc:32-39`, `engine/dungeon-doors.ts:98`):

| Off | Field | Meaning |
| --- | --- | --- |
| +0 | word `x0` | door column on this map |
| +2 | byte `y0` | door row |
| +3 | byte `d_flags` | bit7 open, bit6 exit faces left, bits 2-0 colour |
| +4 | byte `d_place_map_id` | destination map id |
| +5 | word `x1` | hero X after the transition |
| +7 | byte `y1` | hero Y after the transition; **`0xFF` ⇒ leads to a town** |
| +8 | byte `d_features` | bit0 needs Lion-Head Key, bit7 post-boss rokademo |
| +9 | word | achievement address |
| +11 | byte | achievement mask |

**Standing position for a door.** `enterTheDoor` (`dungeon-doors.ts:90-101`)
matches `heroAbsX === x0` and `heroAbsY - 1 === y0`, where `heroAbsX` is the
hero's **left** column. So the trigger cell is the tile one row above the hero's
head:

```
door node = (x0, y0 + 1)     // hero left column, hero head row
```

Arrival after a transition uses the same convention: `heroLeft16Down1`
(`dungeon-init.ts:97-107`) places the hero at absolute `(x1, y1 + 1)`. Both ends
of a portal are therefore expressed identically, which is what makes cross-map
edges trivial.

**Keys.** Ordinary keys at `g_mem[0x98]`, Lion-Head keys at `0x99`
(`dungeon-doors.ts:40-41`). Every successful open consumes exactly one key and
stamps a save flag so the door stays open (`dungeon-doors.ts:122-139`).

### 2.7 Platforms

All three platform families are **hero-usable** and are therefore part of the
navigation model.

**Vertical platforms** (`0x40`–`0x42`, table at `g_mem[0xC004]`, 3-byte entries
`{x: word, y: byte}`, sentinel `0xFFFF`) are operated by the hero:

- **Up** (`tryMovePlatformUp`, `dungeon-vertical.ts:380-422`) requires headroom
  one row above the hero's head and three empty cells (`== 0`) one row above the
  platform. It then moves the platform up one row **and calls `moveHeroUp()`**,
  carrying the hero with it.
- **Down** (`movePlatformDownDamageMonster`, `dungeon-vertical.ts:429-467`,
  reached from `downPressed`) requires three empty cells below the platform. It
  moves the platform down one row and scrolls the viewport, carrying the hero.
- Standing still does nothing. So a vertical platform is a **bidirectional lift**
  over a fixed column.

**Collapsing platforms** (`0x43`–`0x45`, table at `g_mem[0xC006]`, same 3-byte
layout) descend one row per frame while the hero is on them
(`heroCollapsePlatform`, `dungeon-vertical.ts:472-484`, called from
`airborneMovement`). They stop when the three cells below are not empty. So a
collapsing platform is a **one-way descending lift**.

**Horizontal platforms** (`0x46`–`0x48`, table at `g_mem[0xC008]`, 7-byte
entries) are fully automated:

```
+0 word  x_and_flags — bits 15-14 = speed (0 frozen, 1 every other tick,
                            2-3 every tick), bits 13-0 = current x
+2 byte  y_and_flags  — bit 7 = direction, bit 6 = paused
+3 word  min_x
+5 word  max_x
```

(`dungeon-platforms.ts:12-18, 127-167`.) They oscillate between `min_x` and
`max_x`, reverse at each end, pause **one tick**, and carry the hero with
`moveHeroRight/LeftIfNoObstacles`. Because they are periodic and the hero can
wait, **reachability is time-independent** — the whole span is always available.

**Standing convention.** The engine probes `(heroLeftCol + 1, headY + 3)` and
`identifyPlatformTile` maps that back through `findPlatformUnderHero`
(`dungeon-vertical.ts:253-344`). The result: the table's `x` **is the platform's
left column** (it spans `x … x+2`), and the hero's **head row = table `y` − 3**.

**Measured platform inventory** **[measured]**, decoded from all 31 MDTs:

| Kind | Objects | Total travel | Maps |
| --- | --- | --- | --- |
| vertical | 72 | 390 ride rows | 15 maps (mp10 … mp83) |
| collapsing | 21 | 50 ride rows | 5 maps (mp70, mp71, mp80, mp81, mp83) |
| horizontal | 123 | 1914 ride columns | 16 maps (mp10 … mp83) |

Travel ranges are computed by replaying the engine's own guards, including the
headroom check `tryMovePlatformUp` performs at `(x + 1, headY - 1)`, which the
extractor initially omitted. `mp10 x=48` therefore travels `17…24`, not a flat
ledge.

Boss rooms and every post-game map (`mp1d`, `mp2d`, `mp3d`, `mp4d`, `mp5d`,
`mp6d`, `mp7d`, `mp8d`, `mp84`, `mp90`, `mpa0`) have **none**. Platforms are an
outdoor-cavern mechanic only, so platform modelling cannot break boss routes.

Many vertical platforms are immobile (a 1-row range) — e.g. `mp10 x=221 y=44`,
`mp20 x=102 y=61`, `mp20 x=157 y=39`, `mp30 x=7 y=50`. Those emit no `RIDE`
edges and behave as plain ledges.

### 2.8 The cavern portal graph **[measured]**

Decoding all 31 door tables gives **163 doors**, of which **15 lead to towns**
(`y1 == 0xFF`) and **2 need a Lion-Head key** (`mp60 (31,5) → mp62`,
`mp84 (16,51) → mp8d`).

**The topology is directed, and that is not a detail.** Three kinds of edge exist,
and treating them all as two-way produces a wrong answer:

| Kind | Count | Meaning |
| --- | --- | --- |
| linked pair | 130 portals / 65 pairs | each arrives exactly where the other departs, and each leads back to the other's map — usable both ways |
| dead end | 17 portals | the destination map has **no door table at all**. Boss arenas and Jashiin rooms hold a bare `0xFFFF` sentinel; the exit is synthesised at runtime after the fight by `load_place_and_reinit` writing one word into the table (`engine/dungeon-cutover.ts`). Enterable, never leaveable. |
| one way | 1 portal | `mp81 (227,59)`, a self-loop shortcut arriving on `mp81 (151,16)` — exactly where a *different* door departs, one that leads to mp82 rather than back |

Modelling the graph as undirected silently welds `mp84`'s island onto the main
group: `mp84` and `mp81` both point at the doorless `mp8d`, and an undirected
walk routes `mp84 → mp8d → mp81`. This was caught during implementation.

So a **component** is a strongly connected component of the linked pairs, and the
map strip additionally offers everything reachable **outbound** — which keeps boss
arenas selectable as destinations without pretending they are two-way:

| Component | Maps | Tiles |
| --- | --- | --- |
| **0** | `mp10 mp20 mp21 mp30 mp31 mp40 mp41` | 112,064 |
| **5** | `mp50 mp51` | 30,720 |
| **7** | `mp60 mp61 mp62 mp70 mp71 mp72 mp80 mp81 mp82 mp83` | 138,368 |
| 1,2,3,4,6,9,10,11,12,13,14 | `mp1d` `mp2d` `mp3d` `mp4d` `mp5d` `mp6d` `mp73` `mp7d` `mp84` `mp8d` `mp90` `mpa0` (each alone) | — |

**15 components in total** **[measured]**. Reachable-set sizes are the useful
figure for the UI: from `mp10` you can reach **11** maps (the seven of component 0
plus four boss arenas), from `mp80` **14**, from `mp84` **3** (itself, `mp8d`,
`mp90`), and `mp73` / `mpa0` reach only themselves.

The graph does **not** line up with the game's cavern numbering: `mp30` has a
door back to `mp20`, `mp70` has one back to `mp60`, and `mp60` has one forward
to `mp5d`. The table above is the ground truth.

### 2.9 Sizes **[measured]**

| Metric | Value |
| --- | --- |
| Total dungeon tiles (31 maps) | 306,048 |
| Largest single map | 320 × 64 = 20,480 (`mp40`, `mp60`) |
| Largest component's tiles | 138,368 (component 7) |
| Ground nodes | 17,806 |
| Rope nodes | 4,779 |
| **Standing/rope nav nodes, total** | **22,585** — as first measured, before §7.2's node rule was corrected to the engine's; the graph now has **29,917** ground/rope/ride nodes for the same reasons (§18) |
| **Component 0 / component 7 nodes** | **6,553 / 8,581** |
| Rope cells total | 5,379 |
| Platform ride slots (all maps) | 2,354 (390 + 50 + 1914) |
| **Projected extra edges from platforms** | **~5,000–15,000** |
| Airflow cells (all maps) | **2,809**, in 8 maps |
| Lift columns / conveyor runs | 236 / 381 |
| **Projected extra edges from airflows** | **~2,000–6,000** |

A full-map RLE decode is ≈ 0.5 ms per 20k-tile map; building the whole nav graph
for every map is well under 100 ms of pure JS. Edge counts are still projections —
they are measured in phase 3, once the generators run.

### 2.10 How the map fits the canvas **[measured]**

Integer scale `S = clamp(floor(min(672 / mapWidth, 432 / 64)), 1, 8)`:

| mapWidth | Maps | `S` | Rendered size |
| --- | --- | --- | --- |
| 320 | `mp40`, `mp60` | 2 | 640 × 128 |
| 256 | `mp61`, `mp80`, `mp81` | 2 | 512 × 128 |
| 240 | `mp10`, `mp50`, `mp51` | 2 | 480 × 128 |
| 224 | `mp20` | 3 | 672 × 192 |
| 208 – 192 | `mp30`, `mp31`, `mp70`, `mp71`, `mp41`, `mp82` | 3 | 576 – 624 × 192 |
| 128 | `mp72`, `mp83` | 5 | 640 × 320 |
| 96 – 42 | `mp21`, boss rooms, `mp84`, `mp90`, `mpa0` | 6 | 252 – 576 × 384 |

Everything fits inside 672 × 432 without panning or zooming.

### 2.11 Save-image free space **[measured]**

The save is a raw copy of `g_mem[0x00..0xFF]` (`core/game-state.ts:673`). The
engine declares **no** g_mem address constants in `0x00..0xFF` outside the
documented `HeroState` map, so the unclaimed blocks are genuinely free:

| Free block | Size | Note |
| --- | --- | --- |
| `0x00..0x03` | 4 | descriptor pointer slot in the original layout |
| `0x07..0x23` | 29 | |
| `0x25..0x33` | 15 | |
| `0x35..0x44` | 16 | |
| `0x46..0x48` | 3 | |
| **`0x4a..0x7f`** | **54** | largest and safest block |
| `0xc6..0xc8` | 3 | |
| `0xe9..0xff` | 23 | partly engine scratch |
| **total** | **~150** | |

This is what makes the consumable-item representation of §9 tractable.

### 2.12 Airflows

Airflows are the "quickwater / current" mechanic. They are **hero-usable** and
are therefore part of the navigation model, though their footprint is small.

**Tables.** `SEG1_BASE + 0x8024`, 12 bytes in three zero-terminated groups of
four: `+0..+3` up, `+4..+7` left, `+8..+11` right. Populated from
`dungeons.ts` `airflows` by `setDungeonAirflowsToBuffer`
(`core/ts-memory.ts:144-147`), in that order.

**Classification precedence matters.** `getAirflowDirection`
(`dungeon-entities.ts:112-131`) checks **up, then left, then right**, and returns
`NONE` immediately for tile `0`. A tile listed in two groups behaves as the
first one. In the shipped data no tile is double-listed **[measured]**, but the
order must be implemented as the engine has it or a future tileset edit will
silently mis-route.

**How the hero is affected.** `checkAirflowsOnHero`
(`dungeon-frame-pre.ts:62-71`) runs **every frame** from `mainUpdateRenderPre`
(`dungeon-frame.ts:304`). It probes the hero's **middle column** (`heroLeftCol + 1`)
at three rows — feet `headY+2`, body `headY+1`, head `headY` — iterating upward,
and dispatches each:

| Direction | Effect | Source |
| --- | --- | --- |
| **up** | `moveHeroUp()` × 2 — the hero rises **2 rows per frame, with no collision check at all**; sets `AIR_UP_TILE_FOUND = 0xFF`, zeroes `JUMP_PHASE_FLAGS` (cannot jump), idle pose | `dispatchAirflows`, `dungeon-frame-pre.ts:40-58` |
| **left** | `moveHeroLeftIfNoObstacles()` × 2 — 2 columns/frame, collision-checked | same |
| **right** | `moveHeroRightIfNoObstacles()` × 2 — 2 columns/frame, collision-checked | same |

Two consequences that the graph must respect:

1. **The lift passes through solid geometry.** `moveHeroUp` only scrolls the
   viewport; it never tests a tile. So an up-airflow can carry the hero up a wall
   that no jump clears. Whether the airflow tiles themselves are passable is
   irrelevant to the lift.
2. **The hero cannot fall or jump while lifted.** `airborneMovement` returns
   immediately when `AIR_UP_TILE_FOUND != 0` (`dungeon-input.ts:524-525`), so
   there is no gravity and no escape except walking horizontally out of the
   column.

**Conveyors block movement against themselves.** In `moveHeroRightIfNoObstacles`
the head, body and feet probes each test `isLeftAirflow`; in the left-hand
version they test `isRightAirflow` (`dungeon-hero.ts:218-268`). So:

- walking **right into a left-pointing current is impossible**;
- walking **left into a right-pointing current is impossible**;
- walking *with* a current is fine and is then accelerated by the push.

`isLeftAirflow` / `isRightAirflow` return `false` on cavern level 7
(`dungeon-entities.ts:100-109`), so on level 7 currents never block. Level 7 has
no airflow tiles anyway **[measured]**.

**Level-5 exception — not for the hero.** `collisionEIncludingDanger5` /
`collisionWIncludingDanger5` (`dungeon-entities.ts:160-172`) make a left current
a solid wall for **monsters** on cavern level 5. Monsters are not obstacles here
(§1), so this rule does not enter the graph. Recorded so it is not mistaken for a
missing hero rule.

**Measured footprint** **[measured]** — this is a *large* feature, not a
sparse one:

| Map | up / left / right cells | nav nodes inside a current | lift columns | conveyor runs |
| --- | --- | --- | --- | --- |
| `mp50` | 0 / 12 / 12 | 2 | 0 | 12 |
| `mp71` | 327 / 77 / 432 | 2 | 113 | 56 |
| `mp72` | 45 / 221 / 334 | 0 | 8 | 149 |
| `mp80` | 73 / 86 / 10 | 1 | 17 | 35 |
| `mp81` | 62 / 12 / 32 | 0 | 10 | 30 |
| `mp82` | 54 / 37 / 48 | 0 | 15 | 23 |
| `mp83` | 195 / 165 / 169 | 0 | 58 | 32 |
| **total** | **2,809 cells in 8 maps** | **5** | **236** | **381** |

Caverns 6–8 are visibly built around currents: `mp72` is 221/334 left/right cells,
`mp71` is 327 up cells forming **113 separate lift columns**. Modelling these is
not a nicety — without them the pathfinder will happily route the hero into a
current that flings him the wrong way, or miss a jet that is the only way up.

Zero nav nodes sit inside an up-lift, because in each jet only the bottom cell is
passable while the tiles above are solid decoration — and it is exactly that solid
part the lift carries the hero through. So the lift's reachability comes entirely
from the lift-through-solidity rule, and modelling it correctly is the whole point.

---

## 3. Feature behaviour

### 3.1 Obtaining the item

The Thread of Yaga is a **consumable magic item**, id `9`, listed on the
inventory's USE tab alongside the existing eight, and **stocked by every magic
shop** (all 9 towns) at a significant price. Consumable means one copy opens the
map once and is then spent — which is what makes a high shop price and a
re-buy loop make sense. Stored as a dedicated counter byte in the free save-image
block; §9 has the layout and the full change list.

Proposed price: **2,000 gold** (against `MAGIC_PRICES_BY_TOWN`,
`scenes/indoor-magic-shop.ts:147-166`, whose highest existing entry is in the
same order of magnitude), so a route costs about what a shield upgrade costs.

### 3.2 Player flow

Three stages, and the route is only ever visible in the third.

```
dungeon ──(USE ▸ Thread of Yaga)──▶ map screen opens over the inventory
                                          │
                      map strip ◀─────────┼─────────▶ map strip
                                          │
                                  hover / move cursor
                                          │
                                  click a passable tile
                                          │
                        A* over the component graph
                                          │
        ┌─────────────────────────────────┘
        ▼
  map closes — NO route is drawn on it
        │
        ▼
  back in the inventory, whose usage message reads
  "I used a Yaga thread."
        │
        │  (player leaves the inventory)
        ▼
  chevrons appear over the live cavern background,
  starting at the hero's head tile
        │
        ▼
  as the hero walks, the part already travelled is
  dropped and the next stretch is revealed
```

Two rules follow from this and are easy to get wrong:

- **The map screen never draws the route.** It exists only to *pick* a
  destination. Revealing it would spoil the cavern before the player has
  committed to the destination.
- **The inventory does not close when the item is used.** Using it opens the map
  on top; picking a point returns here, where the usage message is the
  confirmation. The route appears only when the player leaves, so the cavern is
  never obscured by a menu while they are trying to walk it.

### 3.3 What the map screen shows

- Title bar: cavern name (localized via `t('dungeon.names.<id>')`) and the
  current map name.
- Map strip: one tab per map in the component, with the current map marked.
- The chosen map rendered at integer scale, centred.
- Overlay, back to front: doors, town exits (marked, never routed through), the
  **hero marker**, and the cursor. **No route.**
- Hint line: `t('map.hints')` at the bottom.

The hero marker is not decoration: it is how the player knows which end of the
map they are standing at, and the map is a cylinder, so "left" wraps.

### 3.4 Accepting a destination

A click is accepted when it maps to a tile that is a valid nav node (or that can
be projected onto the nearest valid node within a 2-tile radius). Clicks on
walls, water and out-of-map pixels are ignored with a short error blip.

Accepting one closes the map immediately. If A* found no route, the map stays open
and flashes `t('map.unreachable')` instead — no path is better than a wrong path,
and silently returning to the inventory would look like success.

### 3.5 The route in the live cavern view

Once the player leaves the inventory, the route is drawn as **chevron tiles over
the background**, beginning at the hero's head. Only the part still ahead of the
hero is drawn, only inside the 28×18 viewport, and it advances as he walks. Full
specification in §10.

---

## 4. Decisions taken

| # | Decision | Rationale |
| --- | --- | --- |
| **D1** | The route is **displayed, never walked**. It is drawn as chevron tiles over the live cavern background starting from the hero's head, plus a full polyline on the map screen. **No auto-walking.** | Confirmed by the brief. Auto-walking would mean driving `g_mem[0xFF17]`/`0xFF1D` across doors, ropes, platforms and jumps; any mistake strands the hero inside level geometry, and a wrong route becomes unrecoverable. |
| **D2** | The map is a **scaled tile raster** cached in an offscreen canvas. | Confirmed. Reads like a classic automap, is faithful to the levels, one blit per frame. §11.7 adds an optional corridor overlay. |
| **D3** | The item is a **consumable magic item (id 9)**, sold in every magic shop at 2000 gold, stored as a **dedicated counter byte** at `0x4A` plus a 9-byte shop-stock block at `0x4B` — the 8-bit stock mask is left alone. | Decided. The generic 5-slot array is full and cannot grow in place, but the save image has ~150 free bytes (§2.11), so a counter needs no format migration and no dual-write invariant. §9.3. |
| **D4** | The route is **recomputed live** when the ability mask, door states, key counts or map change, and whenever the hero drifts more than 3 tiles off it. | A stale route is worse than no route. |
| **D5** | A* runs over a **node graph built lazily per map and cached in memory**, from metadata that *is* pre-calculated at build time. | Meets "pre-calculated and easily usable" without shipping ~250 KB of node blobs. §11.6 is the escape hatch if profiling disagrees. |
| **D6** | Keys are a **search dimension** (ordinary and lion), not a large edge penalty. | Sound, and cheap: key counts are ≤ 3 in practice. |
| **D7** | Route overlay is drawn **after the background tiles and before entities and the hero**, so monsters and the hero render on top of the chevrons. | "Over the background" — it must not hide gameplay. |

---

## 5. Architecture

```
                       build time                        run time
  tools/build-nav.mjs ────────────▶ web/src/data/nav/*.ts   (generated, committed)
                                   · nav-maps.ts        map metadata + cavern level
                                   · nav-portals.ts     door records + town flags
                                   · nav-components.ts  graph components + stats
                                   · nav-tiles.ts       per-cavern attribute tables
                                   · nav-platforms.ts   platform tables + travel ranges
                                   · nav-airflows.ts    current tables + resolved lift
                                                         columns and conveyor runs

  web/public/game/0/mpNN.mdt ──▶ engine/nav/mdt-grid.ts ──▶ NavMap.tiles (Uint8Array)
      (already fetched by            (RLE decode, ~0.5 ms)     │
       the game)                                                 ▼
                                                       engine/nav/nav-graph.ts
                                                       (nodes + edges, cached)
                                                                 │
                                                                 ▼
                                                       engine/nav/pathfinder.ts
                                                       (A* over the component)
                                                          │            │
                                          ui/map-screen.ts ◀┘            │
                                                                        ▼
                                                          render/path-overlay.ts
                                                          (chevrons in the cavern view)
```

New modules:

| Path | Responsibility |
| --- | --- |
| `web/src/engine/nav/types.ts` | `NavFlags`, `HeroCapabilities`, `NavNode`, `NavEdge`, `EdgeKind` |
| `web/src/engine/nav/mdt-grid.ts` | decode a full `mapWidth × 64` tile grid from raw MDT bytes |
| `web/src/engine/nav/attributes.ts` | build `NavFlags` from a cavern's attribute tables; mirror the engine predicates |
| `web/src/engine/nav/platforms.ts` | decode platform tables; compute each platform's travel range and ride slots |
| `web/src/engine/nav/airflows.ts` | resolve up-lift columns and left/right conveyor runs; apply the blocking rule |
| `web/src/engine/nav/nav-graph.ts` | build and cache nodes + edges for one map |
| `web/src/engine/nav/pathfinder.ts` | A* over a component, with the key dimension |
| `web/src/engine/nav/capabilities.ts` | snapshot the hero's abilities from `g_mem` |
| `web/src/engine/nav/path-guide.ts` | live route state, recompute policy, progress tracking |
| `web/src/render/path-overlay.ts` | the chevron overlay in the normal cavern view |
| `web/src/ui/map-screen.ts` | the full-screen map UI (key + pointer input, drawing) |
| `web/public/assets/images/path_chevrons.png` | 8-direction chevron sprites |
| `web/src/data/nav/*.ts` | generated build output |
| `tools/build-nav.mjs` | the build-time extractor |

`web/src/ui/map-screen.ts` deliberately follows the `InventoryScreen` shape
(`ui/inventory-screen.ts:76-86, 181-217, 650-709`) rather than the `Modal`
contract (`ui/modal-manager.ts:13-19`), for three reasons: it needs raw
`KeyboardEvent.code` (not the `KeyA → a` translation), it needs pointer
coordinates (which `Modal` has no channel for), and `ModalManager` allows only
one occupant.

---

## 6. Build-time pre-calculation

`tools/build-nav.mjs`, run with `pnpm nav:build` from `web/` and wired
into `pnpm build`. Output is committed, exactly like `web/src/data/dungeons.ts`,
so there is no build-time dependency for contributors.

### 6.1 `nav-maps.ts`

### 6.1 `nav-maps.ts`

Emitted metadata, portals, components and the reachability table; see §6.3 for
the full interface, which is the authoritative description.

### 6.2 `nav-portals.ts`

```ts
export type PortalKeyKind = 0 | 1 | 2;          // 0 none, 1 ordinary, 2 lion

export interface NavPortal {
    readonly mapId: number;
    readonly x0: number;      // door column on this map
    readonly y0: number;      // door row
    readonly toTown: boolean; // y1 === 0xFF — a graph boundary, never routed
    readonly destMapId: number;   // -1 when toTown; the file's own field is stale
    readonly destX: number;   // hero X after the transition  (x1)
    readonly destY: number;   // hero Y after the transition  (y1)
    readonly key: PortalKeyKind; // d_features bit 0
    readonly rokademo: boolean;   // d_features bit 7 — boss exit, one-way
    readonly exitFacesLeft: boolean;
    readonly color: number;        // d_flags bits 2-0
    readonly fromX: number;        // standing position, source side
    readonly fromY: number;
    readonly toX: number;          // standing position, destination side; -1 toTown
    readonly toY: number;
    readonly deadEnd: boolean;     // destination map has no door table
    readonly oneWay: boolean;      // no door there leads back
}
```

Both endpoints are pre-normalised to the *standing* position, so the runtime
never re-derives it:

```
from = (x0,    y0 + 1)
to   = (destX, destY + 1)
```

163 portals total; 15 carry `toTown`, 17 are dead ends, 1 is one-way, and the
remaining 130 form 65 linked pairs. The module also exports
`NAV_PORTALS_BY_MAP` (portal indices grouped by source map, so the graph builder
can size its buffers) and `NAV_DOOR_COUNT`.

### 6.3 `nav-maps.ts` — components and reachability

```ts
export interface NavMapMeta {
    readonly id: number;
    readonly mdtPath: string;
    readonly nameKey: string;          // locale key: 'dungeon.names.mp10'
    readonly cavernLevel: number;      // MDT +0x12; 1..9 drive ice/heat/damage
    readonly mapWidth: number;
    readonly component: number;        // SCC id, see §2.8
    /**
     * No door table at all. True for the 8 boss arenas AND for the three
     * warp-only rooms (mp73, mp90, mpa0) — a topology fact, not a genre.
     */
    readonly isDoorless: boolean;
    /** The 8 MP<W>D arenas, by file-name convention. These have no rope tiles. */
    readonly isBossArena: boolean;
}

export interface NavComponent {
    readonly id: number;
    readonly maps: readonly number[];              // sorted DUNGEONS ids
    /** Indices into PORTALS, one entry per linked pair, recorded once. */
    readonly portalPairs: ReadonlyArray<readonly [number, number]>;
    readonly tiles: number;
}

export const NAV_MAP_TILES: readonly number[];      // for buffer sizing
export const NAV_REACHABLE: readonly (readonly number[])[];
```

Components and the reachability table are described in §2.8. A **component** is a
strongly connected component of the linked door pairs — the maps the hero can path
to *and back from*, which is what the map strip should offer as a group.
`NAV_REACHABLE[id]` is the wider set of maps a route can be plotted *to*, following
outbound doors everywhere and inbound doors only where they are mutual; it is
always a superset of the owning component's maps, which is what keeps boss arenas
selectable without pretending they are two-way.

`nodes` and `platformRides` counts are not emitted here: they depend on the phase-3
graph builder and will be added to `NAV_COMPONENTS` when it lands.

### 6.4 `nav-tiles.ts`

Per-cavern attribute tables, copied out of `dungeons.ts` into a directly
indexable form:

```ts
export interface NavTileTables {
    readonly passable: Readonly<Uint8Array>;   // 24 entries, tile ids
    readonly slopeLeft: Readonly<Uint8Array>;  // 4 entries
    readonly slopeRight: Readonly<Uint8Array>; // 4 entries
    readonly aggressive: Readonly<Uint8Array>; // 4 entries
    readonly airflowUp: Readonly<Uint8Array>;  // 4 entries
    readonly airflowLeft: Readonly<Uint8Array>;// 4 entries
    readonly airflowRight: Readonly<Uint8Array>;// 4 entries
}
export const NAV_TILES: Readonly<Record<number, NavTileTables>>;
```

This mirrors `mppX.grp.unp` bytes `0x00–0x2F` verbatim **[verified]** against
`tools/GrpViewer/mpp*.grp.unp`, so the extractor fails loudly if `dungeons.ts`
ever drifts from the tilesets.

### 6.5 `nav-platforms.ts`

Platform tables, plus the precomputed travel range of each platform:

```ts
export interface NavVerticalPlatform {
    readonly kind: 'vertical';
    readonly x: number;        // platform LEFT column (spans x..x+2)
    readonly startY: number;
    readonly topY: number;     // highest row reachable going up
    readonly bottomY: number;  // lowest row reachable going down
}
export interface NavCollapsingPlatform {
    readonly kind: 'collapsing';
    readonly x: number;
    readonly startY: number;
    readonly bottomY: number;  // descends only
}
export interface NavHorizontalPlatform {
    readonly kind: 'horizontal';
    readonly y: number;             // platform row
    readonly minX: number;
    readonly maxX: number;          // may wrap past mapWidth
    readonly speed: 0 | 1 | 2 | 3;  // 0 = frozen (a static ledge)
}
export type NavPlatform =
    | NavVerticalPlatform | NavCollapsingPlatform | NavHorizontalPlatform;

export interface NavPlatformTables {
    readonly vertical: ReadonlyArray<NavVerticalPlatform>;
    readonly collapsing: ReadonlyArray<NavCollapsingPlatform>;
    readonly horizontal: ReadonlyArray<NavHorizontalPlatform>;
}
export const NAV_PLATFORMS: Readonly<Record<number, NavPlatformTables>>;
```

`topY` / `bottomY` are computed in the extractor by replaying the engine's own
guards against the decoded tile grid:

- descend one row while the three cells at `(x..x+2, y+1)` are all tile `0`
  (exactly `0`, matching `tryMovePlatformDown`, `dungeon-vertical.ts:350-374`);
- ascend one row while the three cells at `(x..x+2, y-1)` are all tile `0` and
  the tile one row above the hero's head is non-blocking.

This is pure build-time work: 72 + 21 platforms, a handful of steps each.

### 6.6 `nav-airflows.ts`

Airflow tables plus the two derived structures the graph builder needs:

```ts
/** A vertical column segment that lifts the hero 2 rows per frame. */
export interface NavLiftColumn {
    readonly x: number;        // the probed column (heroLeftCol + 1)
    readonly fromY: number;    // lowest row of the lift, inclusive
    readonly toY: number;      // highest row of the lift, inclusive (may wrap)
}
/** A horizontal run that sweeps the hero 2 columns per frame, one way. */
export interface NavConveyorRun {
    readonly y: number;
    readonly x0: number;
    readonly x1: number;       // may wrap past mapWidth
    readonly dir: 1 | 2;       // 1 = sweeps left, 2 = sweeps right
}
export interface NavAirflowTables {
    readonly up: Readonly<Uint8Array>;    // 4 entries
    readonly left: Readonly<Uint8Array>;  // 4 entries
    readonly right: Readonly<Uint8Array>; // 4 entries
    readonly lifts: ReadonlyArray<NavLiftColumn>;
    readonly conveyors: ReadonlyArray<NavConveyorRun>;
}
export const NAV_AIRFLOWS: Readonly<Record<number, NavAirflowTables>>;
```

The extractor resolves classification with the engine's own precedence
(up → left → right, tile `0` is never a current), then walks each column for
maximal up runs and each row for maximal conveyor runs, both cyclically.

**Lift runs include solid tiles.** A jet is usually drawn as solid decoration
above a single passable cell, so the run must be collected over *every* up-tile
regardless of passability — the lift ignores it (§2.12, consequence 1).

### 6.7 What is deliberately *not* pre-calculated

Node and edge arrays are **not** shipped as binary blobs. Building them costs
well under 100 ms across all 31 maps **[measured]** and depends only on data the
runtime can derive from the MDT it already holds. §11.6 describes the fallback.

---

## 7. Runtime navigation model

### 7.1 `NavFlags`

One byte per tile, computed on the fly from `NavTileTables` and the raw tile id:

| Bit | Name | Set when |
| --- | --- | --- |
| 0 | `SOLID` | `isBlockingTile` or `isBlockingTileSimple` reports blocking |
| 1 | `EMPTY` | tile id `0` |
| 2 | `ROPE` | tile id is `1` or `2` |
| 3 | `SLOPE_LEFT` | tile in `slopeLeft` |
| 4 | `SLOPE_RIGHT` | tile in `slopeRight` |
| 5 | `AGGRESSIVE` | tile in `aggressive` |
| 6 | `AIRFLOW_UP` | resolves to an up current (checked first) |
| 7 | `AIRFLOW_LEFT` | resolves to a left current |
| 8 | `AIRFLOW_RIGHT` | resolves to a right current |

One flag bit each, because the three directions have different rules (§2.12).
A tile listed in two groups takes the first, exactly as
`getAirflowDirection` does.

`nav/attributes.ts` builds a 64-entry lookup per cavern once, so classification
is a single array read.

### 7.2 Nodes

A node is a `(x, y)` standing position, encoded as `y * mapWidth + x`, with `x`
the hero's left column and `y` the hero's head row.

A node is **where the hero stops**, which is what `checkFloorForLanding` alone
decides, plus the one thing the engine assumes about him everywhere: his middle
column is not inside rock.

```
his middle column, all three rows, is not blocking:
   !isBlockingTileSimple(tile(x+1, y+j)) for j in 0..2
and he is held up, by either:
   isBlockingTileSimple(tile(x+1, y+3))          // ground under the middle foot
   || an up current in his three rows            // checkAirflowsOnHero
```

The body is deliberately **not** asked about. Every test the engine makes in a jump
or a fall reads one cell or one column: the ceiling above the middle of his head,
the column he already occupies on a step, the cell under his middle foot on a
landing, and nothing at all on the way down. So he can rise through the lip of a
ledge, come to rest with a foot inside a shelf — mp80's `(175,51)`, on the player's
own route — or fall through a floor because his middle foot is over the hole beside
it. Requiring the whole 3×3 to be clear refuses all three, and did until the player
drew them. What the middle column buys is the guarantee every probe relies on: a
position in this game is a position where he is standing in front of something, not
one he is buried in.

Three node kinds:

- `GROUND` — as above.
- `ROPE` — `tile(x+1, y)` is a rope tile and the 3×3 box is free. The middle
  column at the **head** row, because `tryClimbRope` probes `heroCoords + 1`
  (dungeon-vertical.ts:199-202), which is exactly that cell. Rope nodes are
  generated *in addition to* ground nodes at the same coordinate, because a hero
  on a rope is climbing, not standing.
- `RIDE` — the hero is standing on a platform. Generated per §7.5 for each
  platform ride slot, with the platform cell treated as ground.

**[measured]** 29,917 ground/rope/ride nodes across all 31 maps, up from 28,290
before the rule above changed. The 5,589 ride slots are unchanged; the rest are the
positions the looser landing rule gives back.

### 7.3 Static edges

Edges are generated once per map, when the map is first needed, and stored in a
flat array with a per-node offset — a compressed-sparse-row layout.

| `EdgeKind` | From → To | Cost | `req` capability | Notes |
| --- | --- | --- | --- | --- |
| `WALK` | `(x±1, y)` ground node | 1 | — | plain walking |
| `STEP` | `(x±1, y∓1)` | 2 | — | one-tile step up/down |
| `JUMP` | every landing the engine's jump reaches from `(x,y)` | frames in the flight | — | a search, not an offset table — see below |
| `JUMP_HIGH` | the landings that need more than two rows of rise | frames in the flight | `CAP_JUMP_HIGH` | Feruza only |
| `FALL` | every landing reached by stepping off `(x±1, y)` and falling | frames in the fall, plus the columns carried sideways | — | the fall steers one column per row |
| `CLIMB` | `(x, y∓1)` rope node | 1 | `CAP_CLIMB` (always) | rope is innate |
| `SLOPE_UP` | `(x±1, y∓1)` across a slope tile | 3 | `CAP_SLOPE_STAND` | Silkarn only |
| `SLOPE_DOWN` | `(x±1, y±1)` down a slope | 2 | — | sliding is always possible |
| `DOOR` | portal `from` node → portal `to` node (possibly another map) | 4, or 44 if locked | `CAP_KEY` / `CAP_LION_KEY` | 44 ≈ the door-open animation at default speed |
| `RIDE_V` | platform ride slot → ride slot, ±1 row | 1/row | — | §7.5 |
| `RIDE_H` | ride slot → ride slot, ±1 column | 1 or 2/column | — | §7.5 |
| `BOARD` / `ALIGHT` | ground node ↔ ride slot | 1 | — | §7.5 |
| `DROP` | ride slot → ground node below | `1 + dropRows` | — | step off / fall off |
| `LIFT` | node in a lift column → escape node above | `ceil(rows / 2)` | — | §7.6 |
| `CARRY_L` / `CARRY_R` | node in a conveyor run → escape node downstream | `ceil(cols / 2)` | — | §7.6 |

**Jumps and falls are searches, not tables.** `nav/jump.ts` replays
`jump_press_handler`, `airborne_movement` and `check_floor_for_landing` for a cell
and returns the landings, the frame count, and how many rows the hero rose. The
cost is the number of frames the flight takes — one per rise, one on the frame the
rise stopped, one per row he falls, one for the landing check — and a fall adds the
columns it carries him sideways, because those are frames to him too and without
them the search drifts as far as a fall can carry him and then falls again.

There is no apex test and no swept box, because there is none in the game:

1. the rise consults one cell, `heroTL − 35` — above the middle of his head
   (`dungeon-hero.ts:334`), and his body passes through anything else;
2. the sideways step tests one column, and not the one he is entering
   (`asm/fight.asm:1370, 1087`);
3. the descent tests nothing at all (`dungeon-input.ts:536-541`);
4. the landing check reads one cell, under his middle foot
   (`dungeon-vertical.ts:488-504`).

So which landings a jump has is not a property of the offset — it depends on the
terrain under the flight, and asking is cheaper than guessing. The old rule
(`dx ∈ [−3,3]`, an apex box clear) refused the hop off the platform onto the row 10
gallery, which is the first move of the route the player drew, and it would have
refused the pit jump at `(175,51)` as well.

**A rope is not a launchpad.** `jump_press_handler` returns while
`ON_ROPE_FLAGS` is set (`dungeon-hero.ts:322`), so a hero on a rope cannot jump at
all; climbing is `try_climb_rope`'s `moveHeroUp` (`dungeon-vertical.ts:236`), and
leaving is one step sideways, after which the rope frame finds no rope at his new
middle column and hands him back to the dungeon (`dungeon-states.ts:258-280`). Rope
nodes therefore carry `CLIMB`, a `STEP` onto ground beside them, and a fall in either
direction — and no `JUMP`.

**A platform is a floor, not a row of tiles.** Platforms are not in the static map at
all, so the jump model is handed the standing ride slots and treats them as ground
under the hero's middle foot — which is `slot.headRow + 3`, since a slot's head row
is the platform row minus three. Marking the slot cell itself tells the model a hero
lands a row too high, and he never lands on it. The same slots are what lets a ride
node be walked off: the hero on a platform is standing, not airborne, so stepping
over the side is a step and then a fall.

### 7.4 Airflow suppression of ordinary edges

Three of the ordinary generators are narrowed wherever a current is involved
(§2.12):

| Generator | Rule | Source |
| --- | --- | --- |
| `WALK`, `STEP` | **rejected** if any of the nine cells of the target box resolves to a current opposing the direction of travel — a left current blocks travel right, a right current blocks travel left. A current *with* the direction of travel is fine. | `isLeftAirflow` / `isRightAirflow` in `moveHeroRight/LeftIfNoObstacles`, `dungeon-hero.ts:231, 238, 258, 264` |
| `FALL` | **not generated** from a node whose middle column resolves to an up current at any of the three probed rows — the hero does not fall while lifted | `AIR_UP_TILE_FOUND` gate, `dungeon-input.ts:524-525` |
| `JUMP`, `JUMP_HIGH` | **not generated** from such a node either — `JUMP_PHASE_FLAGS` is zeroed while lifted | `dispatchAirflows`, `dungeon-frame-pre.ts:52` |
| `FALL`, `DROP` | **not generated** *into* a node whose middle column is a conveyor cell — a hero swept into one is pushed, not dropped | consequence of the per-frame push |

Sideways `WALK` out of a lift column *is* generated: a left or right current never
blocks the direction it pushes, and an up cell is neither left nor right, so the
hero can always step out of a lift.

**Wrap.** `x` is taken `mod mapWidth` and `y` `mod 64` on every access, so the
generated graph is automatically correct on the cylinder. The seam gets a full
set of walk edges at `x = 0 ↔ mapWidth − 1`, exactly as the engine allows.

### 7.5 Platform edges

Platforms are dynamic, but **none of the three families makes reachability
time-dependent**, because the hero can always wait. So they are folded into the
same static graph rather than needing a time dimension. **[measured]** this adds
~2,354 ride slots and ~5,000–15,000 edges across all maps — a small fraction of
the 168k base.

A **ride slot** is `(platformIndex, position)` where `position` is a row for
vertical/collapsing platforms and a column for horizontal ones. The slot's
standing position is:

```
vertical / collapsing : hero head row = platformRow - 3, hero left column = platform.x
horizontal            : hero head row = platform.y - 3,
                        hero left column = platformColumn - 1 .. platformColumn + 1
```

The horizontal ±1 tolerance mirrors `heroOnHorizPlatform`
(`dungeon-platforms.ts:92-114`), which only carries the hero when his three
columns overlap the platform's three.

A ride slot is **emitted only if a valid node exists there with the platform
cell treated as ground** — i.e. the hero can actually be there when the platform
is at that position. Slots that fail this test are dropped.

Edges:

| From | To | Cost | Rule |
| --- | --- | --- | --- |
| slot `i` | slot `i±1` (vertical) | `1` per row | `RIDE_V`, only when both slots are inside `[topY, bottomY]` |
| slot `i` | slot `i±1` (horizontal) | `1` (speed 2-3) or `2` (speed 1) per column | `RIDE_H` |
| ground node adjacent to the platform | first reachable slot | `1` + ride cost | `BOARD` |
| slot | ground node adjacent at that position | `1` | `ALIGHT` |
| slot | ground node below | `1 + dropRows` | `DROP` |

Rules by kind:

- **Vertical** — `BOARD` requires the hero to be standing on the platform, so a
  ground node at the same position is *the same position*; boarding is really
  just "press Down", cost 1. Alighting sideways or up costs 1. Both directions
  inside `[topY, bottomY]`.
- **Collapsing** — only **descending** `RIDE_H`-style edges (reusing the same
  `DROP` cost model), from `startY` down to `bottomY`. No ascent, and no static
  hold: once the hero is aboard, the platform moves. `BOARD` is therefore only
  from a node strictly above.
- **Horizontal** — the full span `[minX, maxX]` (mod `mapWidth`) is available in
  both directions. `speed === 0` means the platform is frozen, so it emits **no**
  ride edges and instead contributes one static ledge at its current `x`.

**Horizontal-platform carry hazard.** `updateHorizPlatformCoords` calls
`moveHeroRight/LeftIfNoObstacles` to carry the hero, and that call *can fail*
while the platform still moves — so the platform can slide out from under him.
Conservative rule: emit ride edges across a horizontal platform **only if every
column of the span has a valid standing position above it**. Platforms whose
span is obstructed emit no ride edges and are reported by §11.4.

### 7.6 Airflow edges

Airflows are modelled the same way as platforms: as **static** edges, because
neither a lift nor a conveyor makes reachability time-dependent — the hero can
wait for a conveyor and simply rides a lift.

A current acts on the hero's **middle column**, so the hero's box during a ride is
`cols c−1 … c+1` where `c` is the current's column, with the current occupying
the middle.

**Up lift (`LIFT`).** For each `NavLiftColumn`, walk the column from `fromY`
toward `toY` and consider every row `r` in between as an escape point:

| From | To | Cost |
| --- | --- | --- |
| the ground node at the lift's entry (the lowest reachable node in the column) | any ground node reachable by stepping sideways at row `r`, for every `r` in the ascent | `ceil((fromY − r) / 2) + 1` |
| the same | the ground node just above `toY`, if one exists | `ceil((fromY − toY) / 2) + 1` |

- Cost divides by 2 because the lift is 2 rows per frame.
- The ascent passes through **solid tiles without limit** — the lift is
  unconditioned, so no clearance test is applied along it, only at the escape
  points.
- The ascent wraps cyclically across row 0/63, and so does the cost.
- There is no descent: the engine gives no way to ride a lift down, and
  `FALL` out of a lift column is suppressed (§7.4).

**Conveyors (`CARRY_L` / `CARRY_R`).** For each `NavConveyorRun`:

| From | To | Cost |
| --- | --- | --- |
| any ground node inside the run | any ground node adjacent to the run at column `c`, for `c` between the entry and `c` | `ceil(distance / 2) + 1` |
| the same | the ground node just past the run's end, if one exists | `ceil(len / 2) + 1` |

- One direction only. There is no `CARRY` edge against the flow, and the
  opposing `WALK` is suppressed anyway (§7.4), so the run is genuinely one-way.
- Cost divides by 2 because the sweep is 2 columns per frame.
- The sweep is collision-checked in game (`moveHeroLeft/RightIfNoObstacles`), so
  an exit point is only emitted when the sweep would actually succeed there —
  i.e. when the target box is free by the ordinary predicates.
- Entry is normally by falling in, which is an ordinary `FALL` edge landing on a
  node inside the run.

**Level-5 monster rule excluded.** `collisionEIncludingDanger5` /
`collisionWIncludingDanger5` make currents act as walls for monsters on cavern
level 5 (`dungeon-entities.ts:160-172`). Monsters are not obstacles (§1), so this
rule is deliberately not modelled.

**[measured]** 2,809 current cells in 8 maps resolve to **236 lift columns** and
**381 conveyor runs**, so this adds on the order of 2,000–6,000 edges and rejects
a small number of walk-edge candidates. Only 5 nav nodes sit *inside* a current
cell, but that is a misleading way to size it: a lift's reachability comes from
carrying the hero through solid tiles, which no node count can show. Caverns 6–8
are built around these jets and conveyors — `mp72` alone is 221 left-push and
334 right-push cells — so routing around them would be wrong constantly, not
rarely.

### 7.7 Capability mask

```ts
export const CAP = {
    CLIMB:        1 << 0,  // ropes — innate, always set
    JUMP_HIGH:    1 << 1,  // Feruza shoes
    SLOPE_STAND:  1 << 2,  // Silkarn shoes
    GROUND_SAFE:  1 << 3,  // Pirika shoes
    ICE_SAFE:     1 << 4,  // Ruzeria shoes (cavern level 4)
    HEAT_SAFE:    1 << 5,  // Asbestos cape (cavern level 7)
    KEY:          1 << 6,  // ordinary key count > 0
    LION_KEY:     1 << 7,  // lion-head key count > 0
} as const;
```

Built by `capabilities.ts` from `g_mem`: `currentAccessory` at `0x9E`, `keys`
at `0x98`, `lionKeys` at `0x99`, `cavernLevel` at `0xC012`. Ice and heat
capabilities are only granted on the levels where they matter, matching
`setZeroFlagIfSlippery` and `dungeon-frame.ts:357`.

Additionally, a node standing on an `AGGRESSIVE` tile is only enterable with
`GROUND_SAFE`, and on cavern level 4 only enterable at full walking speed with
`ICE_SAFE` (the path would otherwise be unusable). These are applied as edge
pruning at search time rather than baked into the graph, so one graph serves
every loadout.

**Platforms need no capability.** All three families are available to the bare
hero; there is no item that unlocks, extends or disables them.

### 7.8 Pathfinding

`pathfinder.ts` runs **A\*** with a binary heap.

- Nodes are keyed `(mapId << 20) | localNodeIndex`, so the search is
  transparent across the component.
- Heuristic: octile distance on `(x, y)` within the same map, `0` across maps
  (there is no meaningful bound between caverns). Admissible and cheap.
- Key handling (D6): the search state is `(node, keysUsedOrdinary, keysUsedLion)`.
  A `DOOR` edge increments the matching counter; a state exceeding the hero's
  counts is discarded. With ≤ 3 keys this multiplies the state space by at most
  16 and stays far below a millisecond.
- Town portals never appear as edges. They are drawn as markers only.
- Rokademo portals (`d_features & 0x80`) are edges but flagged one-way.

Result type:

```ts
export interface NavRoute {
    readonly mapIds: readonly number[];        // maps the route passes through
    readonly points: readonly NavPoint[];      // standing positions, in order
    readonly edges: readonly NavEdgeRef[];     // which primitive each hop used
    readonly cost: number;
    readonly keysSpent: { ordinary: number; lion: number };
    readonly usesPlatforms: boolean;
}
```

`points` and `edges` are what §10 draws.

---

## 8. Map screen UI

### 8.1 Lifecycle

Mirrors `openInventory` / `closeInventory` (`main.ts:393-422`):

```ts
function openMapScreen(): void {
    if (mapScreenInstance || !engineReady) return;
    if (modalManager.isActive || inventoryScreenInstance) return;
    if (indoorActiveScene || openingIntro.active || endingDemo.active) return;
    if (gameMode !== 'dungeon') return;
    gamePaused = true;
    clearKeys();                 // keys are never used by this screen
    inputLatches.reset();
    mapScreenInstance = new MapScreen({ canvas, ctx, heroState, readMemory, onExit: closeMapScreen });
    mapScreenInstance.enter();
}
```

`gamePaused` freezes only the engine tick (`main.ts:479, 549`); `draw()` keeps
running (`main.ts:2150`), so the frozen cavern stays visible behind the map.

### 8.2 Input

New pointer input. There is currently **no** mouse or pointer handling on
`#gameCanvas` anywhere in the codebase, so this is genuinely new. Add next to the
key listeners in `main.ts:625-636`:

```ts
canvas.addEventListener('pointerdown', onMapPointerDown);
canvas.addEventListener('pointermove', onMapPointerMove);
canvas.addEventListener('wheel', onMapWheel, { passive: false });
```

Coordinates must be mapped through `getBoundingClientRect()`, because
`fitLayoutToViewport` (`input/touch-input.ts:277-352`) applies a CSS
`transform: scale()` to the layout wrapper on phones:

```ts
const r = canvas.getBoundingClientRect();
const x = (e.clientX - r.left) * (canvas.width  / r.width);
const y = (e.clientY - r.top ) * (canvas.height / r.height);
```

Keyboard, wired as a new branch in `KeyRouter.keyDown`
(`input/key-router.ts:87-187`) placed **immediately after** the `inventoryOpen()`
branch, so it beats the engine but loses to save/restore modals:

| Key | Action |
| --- | --- |
| `ArrowLeft` / `ArrowRight` | previous / next map in the component |
| `ArrowUp` / `ArrowDown` | move the cursor one tile (wraps in `x`) |
| `Tab` | jump the cursor to the next door or portal |
| `Enter` / `Space` | accept the cursor position as the destination |
| `Escape` | close |

Add `'Tab'` to `PREVENT_DEFAULT_CODES` (`key-router.ts:69-72`) so it does not
move browser focus. Because the branch returns before `setKey`, held arrows never
reach `keys`, so the hero cannot move while the map is open.

Two new `KeyRouterDeps` members (`input/key-router.ts:31-66`):
`mapScreenActive(): boolean` and
`mapHandleKey(code, ctrl, shift, repeat): boolean`, bound at `main.ts:589-623`.

### 8.3 Drawing

Appended near the end of `draw()` in `main.ts:1921-2148`, before
`drawSpeedChangeDialog()` (`:2139`), so save/restore dialogs still draw on top.

```
ctx.save()
  fill #000 over the whole canvas
  stroke border
  title bar                                   Press Start 2P 18px
  map strip (component maps)
  blit the cached map raster at (ox, oy)
  draw doors, town exits, portals
  draw the hero marker          <- "you are here"; the map is a cylinder
  draw the cursor
  (no route: the screen exists only to pick a destination)
  hint line                                   Press Start 2P 12px
ctx.restore()
```

Reuse `MenuList`'s red right-triangle cursor (`ui/menu-dialog.ts:124-131`) and
`drawDungeonBox`'s rounded panel (`render/dungeon.ts:858-926`) so the map screen
looks like the rest of the game rather than a foreign widget.

### 8.4 The cached map raster

Rendering 20,480 `drawImage` calls per frame is not acceptable. Instead each map
is rasterised **once** into an offscreen canvas and then blitted:

```ts
const cache = new Map<number, HTMLCanvasElement>();
function rasterFor(mapId: number, scale: number): HTMLCanvasElement { … }
```

Raster rules: draw the real tile art from `mppX.png` when `scale >= 3`; at
`scale === 2` draw flat classified colours instead (a 2×2 blit of 20k tiles is
unreadable noise, and colours are clearer). Colour key:

| Class | Colour |
| --- | --- |
| floor / walkable | `#2f3b52` |
| rope | `#c8a24a` |
| slope | `#6b7a99` |
| aggressive ground | `#7a2f2f` |
| platform span | `#4a6f8f` |
| solid | `#101018` |
| empty | `#000000` |

Cache invalidation: keyed by `mapId` and `scale`, cleared on `gameMode` change.
Worst case one component cached at a time, ~13 canvases of ≤ 640×384 = ~13 MB
of canvas memory. Add an LRU cap of 4 entries to bound it.

---

## 9. The Thread of Yaga — consumable item

### 9.1 The constraint

The consumable magic-item system is packed to the brim:

| Resource | Size | Full? |
| --- | --- | --- |
| `magicItems` | 5 bytes at `g_mem[0xA6..0xAA]` | yes — 5 slots, all usable |
| shop stock mask | 1 byte per town, `0xC9..0xD1` (9 towns) | yes — 8 bits, all 8 items stocked |
| `magic_items.png` | 8 frames of 48×48 | yes |
| `MAGIC_PRICES_BY_TOWN` | 8 columns | yes |
| `magicMasks` bit helper | `0x80 >> i`, hard-coded for 8 | yes |

A ninth *generic* item needs the array widened, the mask widened to 9 or 16 bits,
the sprite sheet extended, the price table widened and the bit helper rewritten.
The blocker is not space — it is that the five arrays are laid out
back-to-back at `0xA6..0xC1`, so the item array cannot grow in place.

**The save image is not the constraint.** §2.11 measured ~150 free bytes.

### 9.2 Storage representation — Option D, decided

**Decision: Option D.** The item gets its own byte in the free block; the
generic 5-slot array is left exactly as it is.

| Purpose | Address | Size | Value |
| --- | --- | --- | --- |
| owned copies | `ADDR_THREAD_OF_YAGA = 0x4A` | 1 B | 0…255 |
| shop stock, per town | `ADDR_MAGIC_MASKS_EXT = 0x4B` | 9 B (`0x4B..0x53`) | bit 7 = stocked in that town |

Both live inside the verified-free `0x4a..0x7f` block (§2.11), which the engine
touches nowhere.

Why this and not a widened generic array:

- **No migration.** An old 256-byte save has `0x4A == 0`, which reads as "not
  owned". `0x4B..0x53` are likewise zero, which reads as "not stocked" — the shop
  simply does not list it until the town stock bit is set.
- **No dual-write invariant.** The alternative — relocating `magicItems` into the
  free block and keeping `0xA6..0xAA` as a write-through mirror — would require
  every write in `readHeroState`, `writeHeroState`, `createLiveHeroState`,
  `_useItem`, the buy handler, the sell handler, the pickup handler and the save
  serializer to update both copies. Eight places that must never drift apart, in
  exchange for generality exactly one item will ever use.
- **No widening of anything existing.** The 8-bit stock mask, the 5-slot array,
  the 8-frame sprite sheet and `MAGIC_PRICES_BY_TOWN`'s 8 columns all stay
  untouched, so nothing indexed by `id - 1` or `0x80 >> i` shifts.
- **Unlimited copies**, which is what a shop-bought consumable wants — a counter
  is the natural shape here, where one of five generic slots would cap the player
  at five.

Consequences that must be handled carefully:

- **The count is not one of five slots.** `putShoesToInventory`'s forward scan
  (`dungeon-items.ts:182-187`) walks `0xA1..` looking for a `0` and will run past
  `0xA6` into `magicItems` when the shoe slots are full. The Thread of Yaga must
  **not** live at `0xA1..0xFF`, or that scan and the conversation cape scan
  (`core/conversation.ts:329-334`) would consume it. `0x4A` is outside that range,
  which is a second reason to prefer it.
- **The inventory UI list is compacted.** `_readGameData` builds
  `d.items = [0, ...magicItems.filter(v => v > 0)]` (`inventory-screen.ts:238-244`)
  and `_useItem` reverse-maps a compact index to a physical slot with an `nth`
  counter over 5 slots (`inventory-screen.ts:789-794`). A counter-backed item
  needs its own branch before that loop rather than being pushed through it.
- **The shop must keep its two sources straight.** Stock state for this item lives
  in `magicMasksExt[townIdx] & 0x80`, not in `magicMasks[townIdx]`. The shop's
  describe/buy/sell paths (`indoor-magic-shop.ts:935-1070`) need one extra branch
  rather than an extension of the existing 8-bit loops.

Rejected alternative, recorded for the decision trail: widening `magicItems`
itself would still need a 9th stock bit (all 8 are used) *and* the 5-slot
hard-coding at `inventory-screen.ts:238-244, 789` would become 6, so it buys less
than it appears to.

### 9.3 Implementation

| File | Change |
| --- | --- |
| `core/memory.ts` | `ADDR_THREAD_OF_YAGA = 0x4a`, `ADDR_MAGIC_MASKS_EXT = 0x4b` |
| `core/game-state.ts` | `threadOfYaga: number` + `magicMasksExt: Uint8Array` on `HeroState`; read/write/live-view wiring |
| `core/ts-memory.ts` | zero both on a new game |
| `ui/inventory-screen.ts` | `ITEM_NAMES`/`ITEM_USE_TEXT` index 9; the counter row in `_readGameData`; `_useItem()` `case 9` branched **before** the compact-index `nth` loop |
| `scenes/indoor-magic-shop.ts` | 9th name + description; 9th price column; ext-mask stock bit; buy/sell/describe branches reading `magicMasksExt` |
| `assets/images/path_items.png` | new 48×48 frame |
| `locale/*.json` | §15 |
| `tests/inventory-screen.test.ts`, `tests/indoor-magic-shop.test.ts`, `tests/game-state.test.ts` | extend |

The USE tab needs a small addition beyond one row: `d.items` is built from the
5-slot `magicItems` array, so the Thread of Yaga must be appended from `0x4A`
**separately** rather than being interleaved into that array. The cleanest shape is
a distinct entry in the USE list tagged as counter-backed, so `_selectedId()`
returns 9 for it and `_useItem()` dispatches to the counter branch.

**`case 9` must not touch the generic slot array** — it decrements `0x4A`, exits
the inventory, and opens the map screen:

```ts
case 9:
    if (deps.threadOfYagaCount() <= 0) return;
    deps.consumeThreadOfYaga();
    this.exit();
    deps.onOpenMapScreen?.();
    return;
```

### 9.4 Artwork

One 48×48 frame in a **new** `assets/images/path_items.png`. Keeping it in a
separate sheet means `magic_items.png` stays at 8 frames and every existing
`drawSheetFrame(sheet, id - 1, …)` call keeps working
(`ui/inventory-screen.ts:678-684`).

---

## 10. The route overlay in the cavern view

This is the part the player actually uses. `render/path-overlay.ts` draws the
active route as **chevron tiles over the background**.

### 10.1 Artwork

Four chevrons and a destination ring, **24×24 px each — one per tile**, on a
transparent background. Not eight sprites: diagonals use the nearest cardinal.

| Sprite | Points | Drawn at |
| --- | --- | --- |
| `chevron_up` | north | `^` |
| `chevron_down` | south | `v` |
| `chevron_left` | west | `<<<` |
| `chevron_right` | east | `>>>` |
| `destination` | — | a ring, drawn on the final waypoint instead of a direction |

**Why four and not eight.** This is pixel art rendered with
`imageSmoothingEnabled = false` (`render/canvas.ts:24`). Rotating a 24×24 sprite by
45° to make a diagonal resamples it and softens the edges, which is exactly the
wrong trade here. Four sprites pre-oriented in each cardinal direction means no
rotation at all: a diagonal step shows the nearer cardinal and the *sequence* of
chevrons still reads as the path, at zero cost in sharpness.

Layout: one sheet per sprite at 24×24, or a single 5-cell strip. Drawn with
`drawSheetFrame` (`render/sheets.ts:21-38`) at 1:1 pixel scale.

Constraints that matter for the assets to land correctly:

- **24×24 exactly**, so a chevron occupies one tile and the first one sits on the
  hero's head cell.
- **Transparent background**, with the glyph inset at least 2 px from every edge,
  so a chevron at the viewport border does not look clipped.
- **Pre-oriented.** Please draw up, down, left and right as separate frames
  rather than one frame I would rotate.
- **Bright and consistent across all five.** A cyan-to-white ramp reads against
  every cavern palette; nothing in a cave colour, which would vanish into rock.
  Alpha around 0.85, so the terrain stays legible underneath.

### 10.2 Placement — only what is ahead, only what is visible

The overlay draws the **remaining** route: the stretch the hero has not walked
yet, starting at his head. What he has already covered is dropped, so the chevrons
advance as he moves rather than scrolling behind him.

**One chevron per cell, not per hop.** A hop can cover many tiles — the player's own
trip in mp80 is 146 hops and 359 cells — and one arrow at the tile a hop left from
leaves the columns between it blank. `PathGuide.cellsForHop(i)` answers with every
cell the hop covers: two for an ordinary step, and for a jump or a fall the cells the
hero really passes through, from the same jump model the graph is built from. The
cells of consecutive hops share an endpoint, so the drawn line is continuous.

For each cell `(x, y)` of a hop, let `(xn, yn)` be the next cell along it. Compute
the direction with **cylindrical deltas** — `dx` shortest-path across the map seam,
`dy` shortest-path across the 64-row wrap:

```
dx = ((xn - x + mapWidth / 2) + mapWidth) % mapWidth - mapWidth / 2
dy = ((yn - y + 32) + 64) % 64 - 32
dir = directionOf(dx, dy)
```

- Draw the chevron **at `(x, y)`** — for the first cell, that is the hero's head
  tile, exactly as the brief specifies.
- `directionOf` maps a diagonal to the nearer cardinal, because the four sprites
  are pre-oriented and rotating them would soften the pixels (§10.1).
- Convert map coordinates to viewport coordinates and clip:

```ts
const top   = env.viewportTop();                       // g_mem[0x82]
const left  = heroAbsLeftColFor(x);                    // absolute x
const vx = (x - left + mapWidth) % mapWidth - DUNGEON_VIEW_LEFT_IN_PROX;
const vy = ((y - top) & 0x3f) - 1;
if (vx < -1 || vx >= VIEW_COLS || vy < -1 || vy >= VIEW_ROWS) continue;
drawSheetFrame(ctx, chevrons, dir, 24, 24, vx * TILE_SIZE, vy * TILE_SIZE);
```

  The `- 1` on `vy` puts the first chevron at the hero's head row rather than
  above it, and the `±1` slack lets a chevron scroll half into view instead of
  popping.
- Draw **at most 512 chevrons** — a cap on the loop arithmetic, not on what is
  visible, because anything off screen is dropped before it is drawn. It has to be
  far above a viewport's worth now that a route draws every cell it covers: the
  player's trip needs 359.
- The final waypoint draws the destination ring instead of a direction, once.
- Everything is clipped to the viewport: nothing is drawn off-screen, and no
  offscreen culling list has to be built, because the walk stops at the first
  point outside the view.
- Platform ride slots between two points are skipped: the route would otherwise
  draw a column of chevrons hanging in mid-air where the platform is. Instead
  draw a single chevron on the ground node at each end of the ride, and let the
  ride itself be implied.
- The same applies to a `LIFT` ascent: no chevrons along the lift column, just
  one at the entry and one at the escape node. A `CARRY` sweep is different —
  the hero stays on the ground the whole way, so chevrons are drawn normally, but
  the per-frame double step means the chevron spacing along a conveyor should be
  2 tiles rather than 1.

### 10.3 Draw order

From `main.ts:draw()` (`main.ts:2001-2014`), between `animateDungeonTiles()`
and `drawDungeonMagicProjectiles()`:

```ts
drawDungeonTiles();
animateDungeonTiles();
drawPathOverlay();                     // ← new
drawDungeonMagicProjectiles();
drawDungeonEntities();                 // monsters and items render on top
drawDungeonHero();
```

This satisfies "over the background" without hiding anything that matters.

### 10.4 Live route state

`engine/nav/path-guide.ts` owns:

- `route` — the current route, or `null`;
- `progressIndex` — how far along the hero is;
- `dirty` — a recompute is pending;
- `clearedAt` — when the route was cancelled, so a trigger does not immediately
  resurrect it.

### 10.5 Recompute triggers (D4)

| Trigger | Detected by |
| --- | --- |
| Capability mask changed | compare against the mask used for the last search |
| Key count changed | compare `0x98` / `0x99` |
| A door on the route was opened or closed | compare `d_flags` bit 7 for the route's portals |
| Hero moved to another map | `ADDR_PLACE_MAP_ID` (`0xC4`) |
| Hero drifted > 3 tiles from the route | per-tick distance to the nearest route point |
| Nothing above happened, for 20 s | a slow refresh keeps the route honest |

Throttled to at most once per 500 ms, and skipped entirely while the map screen
is open (the map computes its own route).

**Drift is only drift when the hero is standing somewhere.** The search runs from a
node, so a hero in mid-air — or a hero whose cell is not a standing position for any
other reason — cannot start one, and a search from him finds nothing. Treating that
failure as "the goal became unreachable" deleted a good route the moment the hero
jumped over the platform at `(182,57)` in mp80, and sometimes after a menu closed.
So the drift check first asks `nodeAt` whether the hero is on a node at all, and
stands down until he lands. A failed search from a node still drops the route: there
the world really has changed under the plan.

**A restore clears the route.** `performGameRestore` (F7) replaces the world under
the hero — another place, another position — and the route planned before the load
was about nothing, yet the chevrons stayed on screen and kept being drawn against
the restored hero. The restore calls `clearActiveRoute()` before it loads
anything.

### 10.6 Progress tracking, reveal and completion

The route does not appear the moment a destination is picked — it appears when the
player leaves the inventory (§3.2). `path-guide` therefore holds the computed
route immediately but the **overlay stays dormant** until both are true:

- a route exists, and
- the inventory and the map screen are both closed.

While the overlay is dormant the route is still live: the recompute triggers in
§10.5 keep it current, so the chevrons are right the instant the cavern appears.

Each tick once revealed, advance `progressIndex` while the hero is within 1 tile
of `points[progressIndex]`, using the engine's own absolute-position expression:

```
absX = (g_mem[0x80] | g_mem[0x81] << 8) + g_mem[0x83] + 4   (mod mapWidth)
absY = (g_mem[0x82] + g_mem[0x84]) & 0x3F
```

— the same expression `enterTheDoor` uses (`dungeon-doors.ts:90-101`). Points
behind the index are dropped, so the array stays short **and so the overlay only
ever draws the part still ahead**.

Because the chevrons are clipped to the viewport and the array is truncated at
the index, the per-frame cost does not grow with route length: a route across
three caverns draws no more than a route across one.

When `progressIndex` reaches the end, `route` is set to `null`: the overlay
disappears, the destination has been reached.

### 10.7 Cancelling

Add `Q` (`KeyQ`) as "clear route", handled in the `KeyRouter` **after** the
inventory branch, so it works while playing. This needs no new UI and no new
locale key if it stays silent — but if it should acknowledge, add
`t('map.routeCleared')`. Add `'KeyQ'` to `PREVENT_DEFAULT_CODES`.

---

## 11. Risks, edge cases and fallbacks

### 11.1 The graph is a cylinder

Columns wrap. Every generated index goes through `mod mapWidth` and every tile
read through the wrap helpers. The chevron direction delta (§10.2) must use the
same wrap or arrows will point the wrong way at the seam. Unit-test a wrap
crossing explicitly.

### 11.2 The jump model was approximate; it is the engine's now

This section used to list what the swept-arc model got wrong, and name the two
places it was conservative:

- *the right-move probe is one column short of the hero's leading edge, and
  `heroInteractionCheck` compensates*;
- *landing over a hole in the centre column is allowed by the engine
  (`dungeon-vertical.ts:498`), so the graph will occasionally reject a ledge-walk
  that works in game*.

Both are gone, and both were the same mistake: the model was stricter than the
game, so it refused moves the player could make. §7.3 now replays
`jump_press_handler`, `airborne_movement` and `check_floor_for_landing` instead of
sampling an arc, and `tests/nav-jump-differential.test.ts` flies the engine against
it cavern by cavern. The remaining approximation is deliberate and named: the
engine can come to rest with a side in rock or fall through a floor, and the model
does allow both — what it will not do is let the hero be *buried*, which the game
has no test for either but which no route should be drawn through.

**Mitigation:** validate every route before showing it with a **simulation
pass** — replay the route's hops against the real predicates from
`moveHeroRightIfNoObstacles` / `checkFloorForLanding` / `isOverRope`, and for
ride hops against `tryMovePlatformDown` / `tryMovePlatformUp`. If any hop fails,
drop the route and re-search with that hop forbidden. This is cheap (≤ 400 hops)
and turns an approximation into a verified plan.

### 11.3 Platform state is assumed, not observed

The horizontal platform's live `x` in the table entry mutates at runtime
(`dungeon-platforms.ts:137-146`), and vertical/collapsing `y` values mutate too.
The graph is built from the **initial** MDT values, which is correct for
reachability because the hero can wait — but it means the *cost* of a ride is an
average, not an exact tick count. For a guidance tool that is the right
trade-off.

The collapsing platform's "no static hold" rule (§7.5) is the one place where
the model is genuinely restrictive. If playtesting shows collapsed rides feel
wrong, the fix is to give collapsing platforms a `BOARD` cost of `2` rows so the
hero effectively commits before landing.

### 11.4 Remaining approximations

Every traversal mechanic in the game is now modelled — walking, jumping, high
jumping, falling, ropes, slopes, aggressive ground, ice, heat, doors and keys,
all three platform families, and all three airflow directions. What remains is a
short list of places where the model is *approximate* rather than *missing*:

| Approximation | Why it is acceptable | Where |
| --- | --- | --- |
| Jump arc is a swept envelope, not the engine's state machine | Conservative: validated again by the §11.2 simulation pass | §7.3 |
| Horizontal platform ride cost is an average | Reachability is exact; only the tick count is estimated | §7.5 |
| Collapsing platform has no static hold | Deliberately restrictive; §11.3 notes the one-line fix | §7.5 |
| Airflow lift passes through solid tiles with no limit | Matches the engine exactly — `moveHeroUp` has no collision test | §7.6 |
| Airflow costs divide by 2 | The engine moves 2 units per frame; exact | §7.6 |
| Monsters are invisible | Explicitly out of scope per the brief | §1 |
| `AIR_UP_TILE_FOUND` is per-frame, so a lift "restarts" its 3-probe budget | Immaterial: the next frame re-probes and continues the ascent | §2.12 |

Nothing on this list can produce a route that fails in game. If one ever does,
§11.2's simulation pass is the place it will surface.

Because every boss room has zero platforms and zero airflows **[measured]**, and
boss rooms are reached by doors on level floors, the dynamic-mechanic modelling
cannot make a boss unreachable.

### 11.5 Revealed vs. actual map

**Default: show the real map.** The brief asks to "bring current dungeon map",
and the item is new content, so revealing the whole map is consistent with it.

Fog of war is available as a one-line change if wanted — one session-only
`Uint8Array` in `path-guide.ts` and a multiply on the raster pass. It is
recorded here so the choice is explicit rather than implicit.

### 11.6 If lazy graph building is too slow

Measured expectation: 11,436 nodes and 75,645 edges for the worst component,
built in well under 100 ms. Build it off the main thread if needed:

1. `web/src/engine/nav/nav-worker.ts` — a module worker that builds a `NavMap`
   from a transferred `Uint8Array` and posts it back.
2. `map-screen.ts` opens instantly and shows a spinner (`ui/loading-indicator.ts`)
   while the worker runs.

If profiling still shows a problem, flip  the build-time extractor to also emit
`web/public/nav/mpNN.nbin` (per-map node/edge blobs, ~4 bytes per edge) and have
the runtime `fetch` them. Estimated cost: ~90 KB gzipped for the largest
component. **This is the escape hatch for D5; do not build it speculatively.**

### 11.7 Optional navgraph overlay

If the raster reads poorly at `scale === 2`, draw the pre-calculated graph's
walk and rope edges as thin lines over it. The edge array already has every
endpoint, so this is a few lines of code in `map-screen.ts`.

---

## 12. Rejected: auto-walking

Auto-walking was considered and rejected, per the brief. For the record, the
reason is worth stating once: it would mean writing direction bits into
`g_mem[0xFF17]` and `0xFF1D` every tick to drive `stateMachineDispatcher`, across
door transitions, rope grabs, platform boardings and jump arcs. Any divergence
between the plan and the physics strands the hero inside level geometry with no
recovery, and the failure is invisible until the player is already stuck. The
chevron overlay gives the same information with none of that risk.

If it is ever wanted, it layers on the same `NavRoute` — but it needs its own
design pass, not a bolt-on.

---

## 13. Implementation phases

> **One defect is outstanding: the jump model, which was invented rather than
> derived from the engine.** See §18 before starting phase 3 or 4 work.

Each phase is independently shippable and independently reviewable.

| Phase | Deliverable | Files | Test |
| --- | --- | --- | --- |
| **0** | Extractor + generated data — **done** | `tools/build-nav.mjs`, `tools/navlib/*`, `web/src/data/nav/*.ts` | `tests/nav-data.test.ts`: 46 tests, all passing. 31 maps; portals **[measured 163 / 15 to-town / 2 lion / 17 dead-end / 1 one-way]**; 15 components; attribute tables verified against `mpp*.grp.unp`; platforms **[72 / 21 / 123]**; currents **[2,809 cells → 236 lifts / 381 conveyors]** |
| **1a** | Runtime tile decoder — **done** | `engine/nav/mdt-grid.ts`, `tests/nav-mdt-grid.test.ts` | 25 tests. Every opcode against hand-encoded columns; `tile = next byte` pinned explicitly; byte-for-byte agreement with the extractor on all 31 caverns; the 8-arena rope split |
| **1b** | Tile-flag classifier — **done** | `engine/nav/attributes.ts`, `engine/nav/types.ts` | Flag classification against a hand table for `mpp1`; airflow precedence (up before left before right) |
| **2** | Platform + current model — **done** | `engine/nav/geometry.ts`, `platforms.ts`, `airflows.ts` | 35 tests. Every ride slot's box verified free; links mutual and intra-platform; collapsing platforms descend only; every platform has slots or a recorded reason; **[measured] 3,204 ride slots, 71 platforms refused, 236 lifts / 738 stops, 288 conveyors / 1,470 exits** |
| **3** | Navigation graph — **done** | `engine/nav/nav-graph.ts`, `jump.ts`, `geometry.ts` | 28 invariant tests over all 31 caverns plus the differential suite. **[measured] 29,917 nodes / 1,222,289 edges, all 31 caverns built in 1.1 s, 235/236 lifts and 216/288 conveyors reachable.** No `WALK` into an opposing current; no `FALL`/`JUMP` out of a lift; no fall into a current; **every jump edge is one the model produces**; a jump crosses no further than the frames it takes; no self-edges; CSR consistent. The jump model itself is the engine's, proved against it — see §18 |
| **4** | Capabilities + A* — **done** | `engine/nav/capabilities.ts`, `pathfinder.ts`, plus `nodeHazard` on the graph | 32 tests, plus a change in §18: the component flood now honours the hero's capabilities, so it picks a goal the hero can actually reach. **[measured] same-cavern route ~1 ms, cross-cavern ~31 ms.** Lion-Head door refused without a key and opened with one, spending exactly 1; bare hero kept off aggressive ground and Pirika shoes allowed across; a town door is never an edge; a route never leaves the start map's reachable set; cost equals the sum of its hops; determinism |
| **5** | Item + inventory + shop + save (Option D) — **done** | `memory.ts`, `game-state.ts`, `inventory-screen.ts`, `indoor-magic-shop.ts`, `path_items.png`, locale ×3, `main.ts` | 20 tests. Save round-trip and byte-exact save image; a save without the feature marker reads as not owned **whatever it holds at 0x4A**; buying and selling move the counter and the extended stock bit, never the generic array; using one copy leaves all five generic slots byte-identical; the addresses cannot be reached by the 0xA1..0xFF forward scans |
| **6** | Map screen — **done** | `ui/map-screen.ts`, `key-router.ts`, `main.ts`, `NavGraphStore.load`/`gridOf` | 23 tests. All 31 caverns fit at an integer scale and stay centred; tile round-trip survives a 0.5×–2.25× CSS scale; cursor wraps on both axes; key repeat does not skip maps; **no route is drawn** (`draw(now)` takes no route and the class has no route accessor); a point that cannot be routed leaves the screen open; Escape and an outside click return without a route |
| **7** | Chevron overlay — **done** | `render/path-overlay.ts`, `main.ts`, `assets/images/chevrons.png` | 25 tests. The sheet is 5x24x24 and the frame order is asserted from the PNG header; cardinal, seam and diagonal directions all correct; dormant while a menu is open; route cleared on arrival; **one chevron per cell, so a nine-column jump draws nine arrows and the line has no gap**; per-frame cost independent of route length |
| **8** | Live route — **done** | `engine/nav/path-guide.ts`, `key-router.ts` | Re-plans on capability, key-count, component, drift (>3 tiles) and a 20 s refresh; throttled to 500 ms; `Q` cancels only in an unpaused cavern; an unreachable goal drops the route rather than drawing a wrong one; **no re-plan is attempted while the hero is on no node**, so a jump over a gap no longer deletes the route; **F7 clears the route** |

Phase 8 was the one that needed the second pass, and it got one: playing the route
found three faults in the display layer — stale chevrons after a restore, gaps where
a jump covers many tiles, and a route deleted because a re-plan was attempted from a
cell the hero was passing through. All three are in §18 and all three have tests.

---

## 14. Test plan

New suites, following the existing conventions (`web/tests/key-router.test.ts:4-41`
for fake deps, `web/tests/modal-manager.test.ts:1-13` for the happy-dom
environment):

| File | Covers |
| --- | --- |
| `tests/nav-mdt-grid.test.ts` | full-map RLE decode, all 31 maps, wrap behaviour |
| `tests/nav-tiles.test.ts` | tile classification vs. the engine predicates |
| `tests/nav-platforms.test.ts` | table decode, travel ranges, ride-slot validity, carry hazard |
| `tests/nav-airflows.test.ts` | classification precedence, lift columns including solid tiles, one-way conveyors, opposing-current walk suppression, no fall/jump out of a lift |
| `tests/nav-graph.test.ts` | node and edge generation, jump validation, wrap edges, platform edges, airflow edges |
| `tests/nav-pathfinder.test.ts` | A* correctness, capability gating, key budgets, town portals excluded |
| `tests/nav-capabilities.test.ts` | the capability mask for every wearable and cavern level |
| `tests/nav-data.test.ts` | generated data integrity — the §13 phase-0 assertions |
| `tests/path-overlay.test.ts` | chevron placement, direction, clipping, ride-slot skipping |
| `tests/map-screen.test.ts` | input routing, pointer mapping, rendering into a mock ctx |
| `tests/inventory-screen.test.ts`, `tests/indoor-magic-shop.test.ts` (extend) | the new item's use/buy/sell paths |

E2E, in `web/e2e/smoke.spec.ts`, using the existing `window.__zeliard` hook
(`main.ts:2308-2356`): give the hero the item, warp to `mp10`, open the map, click
a destination far to the right, assert the route line is drawn, close the map,
screenshot the cavern view and assert a chevron is present at the hero's head.

Gates: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. All four must
pass before merge; the existing suite must not regress.

---

## 15. Localization

New section `map` in the schema (`web/src/locale/schema.ts:22-44`), added to
**all three** locales — `en.json`, `ru.json`, `isv.json` — at matching paths:

| Key | en |
| --- | --- |
| `map.title` | `THREAD OF YAGA` |
| `map.hints` | `L/R: MAP   U/D: CURSOR   ENTER: SET   ESC: CLOSE` |
| `map.unreachable` | `No route found.` |
| `map.noPath` | `That place is not passable.` |
| `map.routeCleared` | `Route cleared.` |
| `inventory.itemNames[9]` | `Thread of Yaga` |
| `inventory.itemUseText[9]` | `the Thread of Yaga.` |
| `indoor.magicShop.itemNames[8]` | `Thread of Yaga` |
| `indoor.magicShop.itemDescriptions[8]` | (flavour text) |

Every mechanic is modelled (§11.4), so there is no "cannot be charted" string —
an unreachable destination is just `map.unreachable`.

Also extend `REQUIRED_RELEASE_KEYS` in `web/tests/locale-completeness.test.ts:5-78`
so the keys cannot drift. Map and cavern names already resolve through
`getDungeonName` (`locale/index.ts:91-95`).

`tsc --noEmit` does **not** check JSON, so the completeness test is the only
gate. Run it.

---

## 16. Appendix — verified reference data

### A. Cavern components and reachability **[measured]**

```
SCC 0  mp10 mp20 mp21 mp30 mp31 mp40 mp41                          ( 7 maps)
SCC 5  mp50 mp51                                                   ( 2 maps)
SCC 7  mp60 mp61 mp62 mp70 mp71 mp72 mp80 mp81 mp82 mp83            ( 9 maps)
alone  mp1d mp2d mp3d mp4d mp5d mp6d mp7d mp8d mp90 mp73 mp84 mpa0 (12 maps)
```

Reachable-set sizes — outbound doors everywhere, inbound only through a linked
pair — **[measured]**:

| From | Maps | From | Maps |
| --- | --- | --- | --- |
| `mp10` | 11 (SCC 0 + `mp1d` `mp2d` `mp3d` `mp4d`) | `mp84` | 3 (`mp84` `mp8d` `mp90`) |
| `mp50` | 4 (`mp50` `mp51` `mp4d` `mp5d`) | `mp73` | 1 |
| `mp80` | 14 | `mpa0` | 1 |

### A2. Door edge kinds **[measured]**

| Kind | Count | Notes |
| --- | --- | --- |
| linked pairs | 65 pairs / 130 portals | both directions usable |
| dead ends | 17 portals | destination map has no door table (boss arena / Jashiin) |
| one way | 1 portal | `mp81 (227,59)`, a self-loop onto `mp81 (151,16)` |
| to town | 15 portals | never routed through |
| Lion-Head key | 2 portals | `mp60 (31,5)`, `mp84 (16,51)` |

One linked pair is a shortcut rather than a round trip: `mp81(151,15) ↔ mp82(174,9)`
returns the hero to `mp81 (227,60)` rather than `(151,16)`. Chained with the
one-way self-loop — which arrives exactly at `(151,16)` — the three form a closed
circuit. The pathfinder must place the return hop where the data says, not where
the outbound hop started.

Four data quirks the extractor now asserts, each of which produced a wrong answer
before it was found:

- `d_place_map_id` for a **town door is stale** and must not be trusted — all 15
  keep a real-looking destination id. `y1 === 0xFF` is the only town test.
- `x1` is an absolute X on the **destination** map, so it can exceed the source
  map's width: `mp30` is 204 wide and has a door arriving at `x1 = 205` in the
  224-wide `mp20`. Checking `x1` against the source width rejects 15 good doors.
- `mp50`'s two town doors carry a redundant set bit 7 in `d_place_map_id` that the
  other 13 do not. The engine ORs the bit in itself once `y1 === 0xFF` has already
  identified the door, so the stored bit is masked off and merely reported.
- The cavern graph is **directed**. Adding a reverse edge for a dead-end portal
  invents a two-way link and welds `mp84`'s island onto the main group, because
  `mp84` and `mp81` both point at the doorless `mp8d`.

### B. Town-boundary doors **[measured]**

| Map | Door (x, y) |
| --- | --- |
| `mp10` | (61,6), (128,32) |
| `mp20` | (6,61) |
| `mp30` | (185,18) |
| `mp31` | (149,13) |
| `mp40` | (86,21) |
| `mp41` | (16,21) |
| `mp50` | (94,10), (131,9) |
| `mp60` | (315,48) |
| `mp61` | (31,5) |
| `mp70` | (1,21), (152,6) |
| `mp80` | (111,20) |
| `mp81` | (123,5) |

### C. Lion-Head key doors **[measured]**

| Map | Door | Leads to |
| --- | --- | --- |
| `mp60` | (31,5) | map 16 (`mp62`) |
| `mp84` | (16,51) | map 28 (`mp8d`, boss room) |

### D. Platform tables **[measured]**

| Kind | Table | Entry | Objects | Travel |
| --- | --- | --- | --- | --- |
| vertical | `0xC004` | 3 B `{x: word, y: byte}` | 72 | 390 rows |
| collapsing | `0xC006` | 3 B `{x: word, y: byte}` | 21 | 50 rows (down only) |
| horizontal | `0xC008` | 7 B | 123 | 1914 columns |

Sample vertical travel ranges **[measured]**:

| Map | x | start y | travel range |
| --- | --- | --- | --- |
| `mp10` | 48 | 24 | 17 – 24 |
| `mp10` | 221 | 44 | 38 – 54 |
| `mp20` | 102 | 61 | 58 – 63 |
| `mp20` | 124 | 61 | 60 – 63 |
| `mp20` | 128 | 60 | 50 – 60 |
| `mp20` | 157 | 16 | 11 – 25 |
| `mp20` | 157 | 39 | 38 – 45 |
| `mp21` | 47 | 36 | 35 – 44 |
| `mp21` | 59 | 25 | 17 – 25 |

Collapsing platforms **[measured]**, descending only:

| Map | x | start y | bottom y |
| --- | --- | --- | --- |
| `mp70` | 26 | 39 | 48 |
| `mp70` | 29 | 38 | 48 |
| `mp70` | 32 | 36 | 48 |
| `mp71` | 128 | 9 | 26 |
| `mp71` | 131 | 9 | 26 |
| `mp71` | 139 | 25 | 37 |
| `mp71` | 142 | 26 | 37 |

Horizontal spans wrap the seam, e.g. `mp51 r57 231-11`, `mp60 r18 314-21`,
`mp61 r42 248-12`, `mp71 r29 190-22`.

### E. Airflow tables **[measured]**

Layout: `SEG1_BASE + 0x8024`, four zero-terminated entries per direction, in the
order up, left, right (`ts-memory.ts:144-147`).

| Map | up | left | right | cells U/L/R |
| --- | --- | --- | --- | --- |
| `mp50`, `mp51` (cavern 5) | — | `0x25`, `0x26` | `0x23`, `0x24` | 24 / 0 |
| `mp70`, `mp71`, `mp72` (cavern 7) | `0x2A` | `0x29` | `0x28` | 1,163 / 298 / 755 |
| `mp80`–`mp84` (cavern 8) | `0x13`–`0x16` | `0x12`, `0x1A`–`0x1C` | `0x11`, `0x17`–`0x19` | 384 / 300 / 259 |

No tile appears in two groups in the shipped data **[measured]**, so the
up-before-left-before-right precedence of `getAirflowDirection` is currently
unobservable — but it must still be implemented, because a future tileset edit
that double-lists a tile would silently change its direction.

Passability overlap matters: of the four up tiles in cavern 8, only `0x13` is in
that cavern's passable list (`0x14`–`0x16` are solid). Since a jet's solid cells
sit above its passable cell, the lift is what carries the hero through them —
and it does so unconditionally, which is why lift runs must be collected over
solid tiles too (§6.6).

Total across all 31 maps: **2,809 current cells in 8 maps**, resolving to **236
lift columns** and **381 conveyor runs**.

### F. Wearable effects, from `asm/common.inc:251-255`

```asm
  Feruza_Shoes   equ 0A1h  ; high jump
  Pirika_Shoes   equ 0A2h  ; feet protection
  Silkarn_Shoes  equ 0A3h  ; climb slopes
  Ruzeria_Shoes  equ 0A4h  ; anti-ice
  Asbestos_Cape  equ 0A5h  ; heat protection
  magic_items    equ 0A6h  ; A6 - AA - 5 slots for Items
```

### G. Key addresses

| Address | Meaning |
| --- | --- |
| `0x80` word | proximity window left column (absolute map X) |
| `0x82` | viewport top row |
| `0x83` | hero left column within the viewport |
| `0x84` | hero head row within the viewport |
| `0x98` | ordinary key count |
| `0x99` | Lion-Head key count |
| `0x9E` | equipped accessory id |
| `0xC002` word | `mapWidth` |
| `0xC004` word | vertical platform table pointer |
| `0xC006` word | collapsing platform table pointer |
| `0xC008` word | horizontal platform table pointer |
| `0xC00A` word | door table pointer |
| `0xC010` word | monster table pointer |
| `0xC012` | cavern level |
| `0x9F15` | `AIR_UP_TILE_FOUND` — set while the hero is in an up current |
| `0xE000` | proximity map (36 × 64) |
| `0xED20` | layer 2 — the real tile behind entity markers |
| `0x10000 + 0x8000` | per-cavern attribute tables |

### H. Free save-image bytes **[measured]**

`0x00..0x03` (4) · `0x07..0x23` (29) · `0x25..0x33` (15) · `0x35..0x44` (16) ·
`0x46..0x48` (3) · `0x4a..0x7f` (54) · `0xc6..0xc8` (3) · `0xe9..0xff` (23).

### I. The MDT packed-map RLE

Column-major; each column fills 64 rows. Token = one byte `b`, dispatched on
`b >> 6`:

| Case | Bytes | Tile | Count |
| --- | --- | --- | --- |
| `0` | 2 | second byte | `(b & 0x3F) + 1` |
| `1` | 1 | `(b & 0x0F) + 1` | `((b >> 4) & 3) + 2` |
| `2` | 1 | `0` | `b & 0x3F` |
| `3` | 1 | `b & 0x3F` | `1` |

Mirrors `engine/unpack.ts:39-56` and
`tools/MDTViewer/core/decoder.py:455-510`. A decoder verified against both is
the phase-1 acceptance test.

---

---

## 17. Implementation log

An append-only record of what has been built, what it turned out to be, and what
is still outstanding. Entries are in dependency order.

**The measurements in this log are the ones taken on the day each phase was
delivered, and are left that way on purpose.** Several were superseded by the
corrections in §18 — the node rule of §7.2, the jump generator of §7.3 and the
drawing rules of §10 all changed, and the numbers below predate those changes. The
current figures are the ones in §7, §10 and §18's *Numbers that moved* table; where
the two disagree, this log is the older one.

### Phase 0 — build-time extractor and generated data — **complete**

**Delivered**

| File | Role |
| --- | --- |
| `tools/build-nav.mjs` | orchestrator; `node tools/build-nav.mjs` writes, `--check` fails on stale output |
| `tools/navlib/mdt.mjs` | MDT header, packed-map RLE, door and platform table readers |
| `tools/navlib/dungeons-source.mjs` | strict `dungeons.ts` parser plus the `mpp*.grp.unp` drift guard |
| `tools/navlib/graph-model.mjs` | directed portal topology: mutuality, components, reachability |
| `tools/navlib/platforms.mjs` | platform tables plus precomputed travel ranges |
| `tools/navlib/airflows.mjs` | current tables, lift columns, conveyor runs |
| `tools/navlib/emit.mjs` | TypeScript emitter for the generated modules |
| `web/src/data/nav/*.ts` | generated, committed, 240 KB total |
| `tools/build-nav.mjs` | orchestrator; `node tools/build-nav.mjs` writes, `--check` fails on stale output |
| `web/tests/nav-data.test.ts` | 46 integrity tests |
| `web/package.json` | `nav:build` and `nav:check` scripts |

**Deviation from the plan:** the extractor is `tools/build-nav.mjs`, not `.ts`.
`tools/` sits outside `web/`, and `web/package.json` is the repo's only manifest —
its `devDependencies` have no TS runner (`tsx`/`ts-node` are absent) and its
`tsconfig.json` `include` is `["src", "tests", "vite.config.ts"]`, so a `tools/*.ts`
file would be neither executed nor typechecked by anything in the repo. Plain ESM
with JSDoc runs unmodified and still emits real `.ts`.

Run it as `pnpm nav:build` / `pnpm nav:check` **from `web/`**; the scripts use a
relative `../tools/` path. `pnpm --filter zeliard-web …` also works — pnpm falls
back to the single package when no workspace file is present.

**Six defects the phase found, all of which had silently produced wrong answers:**

1. **The MDT RLE decoder used in the earlier research was wrong.** `unpack_forward_case0`
   in `asm/fight.asm` reads the token byte for the count and the *following* byte
   for the tile. The research decoder used the token byte as the tile. The
   extractor was verified against `asm/fight.asm`, the port's `engine/unpack.ts`
   and `tools/MDTViewer/core/decoder.py` — three independent readings that agree —
   and the extracted decoder matches them. Every tile-derived figure in §2 has been
   recomputed; the old ones were wrong, some by 40×. `nav-data.test.ts` now carries
   an explicit test for this, and a second one asserting the decoded jet tiles are
   rare, because a wrong decode makes them look like background texture.
2. **The cavern graph is directed.** Adding a reverse edge for a door into a
   doorless map invents a two-way link. `mp84` and `mp81` both point at the doorless
   `mp8d`, so an undirected walk merged `mp84`'s island into the main group. Now:
   SCCs over linked pairs, plus a separate reachability set. 15 components, not 6.
3. **The reverse-door index was keyed by destination instead of origin**, which
   reported 64 legitimate pairs as unmatched.
4. **Platform travel ranges ignored the headroom check** in `tryMovePlatformUp`
   (`(x + 1, headY - 1)` must be non-blocking). `mp10 x=48` therefore travels
   `17…24`; the range is also now gated on the hero's 3×3 box fitting at the
   destination, so every emitted ride slot has a standing position.
5. **`d_place_map_id` bit 7 is inconsistent** — set on `mp50`'s two town doors, clear
   on the other 13 — and the engine never reads it, since it ORs the bit in itself
   once `y1 === 0xFF` has identified the door. Masked off, reported, not trusted.
6. **`x1` is an absolute X on the destination map**, so validating it against the
   source width rejected 15 legitimate doors.

**Two genuine data properties worth keeping in mind:**

- `mp81(151,15) ↔ mp82(174,9)` is a **shortcut, not a round trip** — the return
  lands at `mp81 (227,60)`, not `(151,16)`. With the one-way self-loop
  `mp81 (227,59)`, which arrives exactly at `(151,16)`, the three form a closed
  circuit.
- Boss rooms and Jashiin rooms carry a bare `0xFFFF` door sentinel. Their exit is
  synthesised at runtime after the fight. They are dead ends by design, not by
  accident, and are modelled as such.

**Gates:** `tsc --noEmit` clean; `nav-data.test.ts` 46/46; full suite 599/599
unchanged. Edge counts remain projections — they are measured in phase 3.

### Phase 1a — runtime tile decoder — **complete**

**Delivered** `web/src/engine/nav/mdt-grid.ts` — `decodeTileGrid`, `readMapWidth`,
`tileAt` / `tileAtUnwrapped`, `wrapRow` / `wrapCol`, and `NavGridCache`; plus
`web/tests/nav-mdt-grid.test.ts` with 25 tests.

The decoder is pure and imports `MAP_HEIGHT` and `ADDR_PACKED_MAP_START` from
`engine/unpack.ts` rather than restating them, so the RLE constants have one home.

**Two defects, both found by the tests:**

1. **`ADDR_PACKED_MAP_START` is the wrong offset for a file.** It is `0xC01B`, the
   *g_mem* address where the engine loads the image — not an MDT-file offset. Used
   directly it reads past the end of a 6 KB file immediately. `PACKED_MAP_OFFSET`
   is now derived as `ADDR_PACKED_MAP_START - MDT_BASE` and asserted to be `0x1B`,
   which keeps the two tied together instead of merely correct today. The unit
   tests did not catch this because the fake-MDT fixture used the same wrong
   constant, so the error cancelled out; only the tests that read real MDTs failed.
2. **`isBossRoom` in the generated data meant "doorless", not "boss arena".** It is
   derived from `doors.length === 0`, which is also true of `mp73`, `mp90` and
   `mpa0` — the Paguro hut and the two Jashiin rooms, which are warp-only rooms
   with real terrain and ropes. Renamed to `isDoorless`, with a separate
   `isBossArena` derived from the `MP<W>D` file-name convention.

**A third finding worth recording:** the natural assumption that boss arenas are
mostly-open rooms is **false**. Solid-tile ratios **[measured]**:

| | Ratio range |
| --- | --- |
| Boss arenas | 0.090 (`mp5d`) … **0.922 (`mp2d`)** |
| Open caves | 0.246 (`mp40`) … 0.655 (`mp62`) |

`mp1d` is 88% solid and `mp5d` is 9%, so there is no arena/open threshold to
test. What *does* separate the 8 arenas cleanly is rope presence: every arena has
zero rope tiles, every other map has some. That is the invariant the tests use.

**Third-way confirmation — `WORK/LEVELS`.** The RLE decode is now checked against a
completely independent encode of the same data: `WORK/LEVELS/MP*.TXT` holds each
tile as `chr(tile + 0x20)` so the maps can be read as text. **[measured]**

| | |
| --- | --- |
| Maps present | 31 / 31 |
| Cells compared | **298,830** |
| Cells disagreeing with `decodeTileGrid` | **0** |
| Characters above the 6-bit range (in the dumps) | 14 |
| Rows truncated in the dumps | 30 |

Two dumps are damaged, and the damage is *on their side* in every case:

- `MP10.TXT` — 30 rows are truncated on the right. They match from column 0, so
  they are short, **not shifted**, which rules out a layout mismatch as the cause.
  Five characters exceed the 6-bit range (`b`, `f`, `o`, `s`, `|`) and four cells
  read 15 or 60 where the MDT says 0. All 30 truncated rows are otherwise exact.
- `MP90.TXT` — nine characters exceed the 6-bit range, all `h`, forming one 3×3
  block of empty space at columns 8–10, rows 11–13. No cell is actually wrong;
  the other 2,679 cells match.

Note the dump rows each carry one stray `CR`, which is why every file is
`mapWidth + 1` bytes wide until it is stripped — a layout detail that looks like
an off-by-one in the decoder and is not. Both facts are asserted rather than
tolerated, so replacing a dump with a *differently* broken one fails the suite.
Seven tests, skipped if `WORK/LEVELS` is absent.

**Gates:** `tsc --noEmit` clean; `nav-mdt-grid.test.ts` 32/32;
`nav-data.test.ts` 46/46; full suite 631/631.

mirror `isBlockingTile` / `isBlockingTileSimple` exactly.

### Phase 1b — tile-flag classifier — **complete**

**Delivered** `web/src/engine/nav/types.ts` (flag, capability, edge and cost
constants) and `web/src/engine/nav/attributes.ts` (`NavTileClassifier`,
`airflowGroups`), plus `web/tests/nav-attributes.test.ts` with 26 tests.

**The test that matters** is differential. The engine already implements
passability against `g_mem`; this module reimplements it against the generated
tables. The test loads each cavern's generated tables into `g_mem` exactly as
`main.ts` does, then runs the engine's own `is_blocking_tile`,
`is_blocking_tile_simple`, `lookup_shared` and `get_airflow_direction` beside ours
for **every tile id of every cavern** — 0x00–0xFF, 31 maps. That is the only way
to be sure the reimplementation has not drifted.

**Three defects, all caught by those tests:**

1. **`Uint8Array` silently truncated the flags.** `BLOCK_HEAD` is bit 8, so a
   256-entry byte table stored `0` for every blocking tile — which reads as
   "nothing blocks" rather than as an error, and would have made the pathfinder
   treat solid rock as walkable. The table is now `Uint16Array`.
2. **The table was sized for the static range only.** 64 entries covered tiles
   `0x00`–`0x3F`, and everything above fell into a "clamp to solid" fallback.
   But `0x40`–`0x48` are platforms, `0x49`–`0x60` are door frame, and `0x80 | n`
   is an entity marker — all meaningful, and all classified as "blocked". The
   table now spans the full byte and `classify` is total.
3. **The airflow constants did not match the engine's.** They were renumbered to
   start `NONE` at 0, which forced a translation table in the differential test
   and made a direct comparison impossible. They now *are* the engine's values
   (`NONE 0xff`, `UP 0`, `LEFT 1`, `RIGHT 2`, dungeon-entities.ts:33-36), so
   `getAirflowDirection` compares straight against ours.

**Design point worth keeping: two blocking bits, not one.** The engine has two
different predicates that deliberately disagree over the platform band —
`is_blocking_tile` passes anything ≥ `0x40`, `is_blocking_tile_simple` only from
`0x49` — so a platform blocks the body but not the head, which is why the hero
can stand on one. Collapsing them into a single `SOLID` would lose that.
`staticTilesAgree()` asserts they happen to coincide over the static range
(because the RLE is 6-bit), so the graph builder may still use one bit there.

**A rule that turns out to be unreachable.** `lookup_shared`'s hard-block on
`0x90`/`0x91` cannot fire from either engine predicate: both short-circuit above
their cutoffs, so the masked value equals the tile itself and never equals
`0x90`. It is reachable only by calling `lookup_shared` directly, which the test
now does — so the behaviour is pinned rather than assumed.

**Airflow precedence** (up before left before right) is unobservable in the
shipped data, since no tileset double-lists a tile. `NavTileClassifier.fromTables`
builds a classifier over explicit tables, so the test can construct the table
that triggers the overlap and assert both our result and the engine's.

**Gates:** `tsc --noEmit` clean; `nav-attributes.test.ts` 26/26; full suite
657/657.

### Phase 2 — platform and current models — **complete**

**Delivered**

| File | Role |
| --- | --- |
| `web/src/engine/nav/geometry.ts` | the hero's occupancy tests: `heroBoxFree`, `groundBelow`, `canRest`/`isStanding`, `heroCanStepSideways`, `heroInLift`, `blockedByCounterCurrent`, wraps |
| `web/src/engine/nav/platforms.ts` | `buildPlatformModel` — ride slots, adjacency, inert platforms with reasons |
| `web/src/engine/nav/airflows.ts` | `buildAirflowModel` — lift stops and conveyor exits |
| `web/tests/nav-platform-model.test.ts` | 19 tests |
| `web/tests/nav-airflow-model.test.ts` | 16 tests |

The geometric predicates live in their own module because three later stages need
them and they must not disagree about whether the hero fits somewhere.

**[measured] over all 31 caverns**

| | |
| --- | --- |
| Platforms modelled | 216 |
| **Ride slots** | **3,204** |
| Platforms refused a ride | **71** |
| — horizontal span could slide out from under the hero | 70 |
| — only one rideable row | 1 |
| Lift columns modelled | 236 |
| **Lift stops** | **738** |
| Conveyor runs modelled | 288 of 381 |
| **Conveyor exits** | **1,470** |

**The carry-hazard guard does real work.** `updateHorizPlatformCoords` moves the
hero with `moveHeroRightIfNoObstacles`, and that call *fails* when something is in
the way — while the platform moves regardless, so it can slide out from under him.
70 of the 123 horizontal platforms have a span where some column offers no clear
standing position, and those are given no ride edges at all rather than a route
that strands him mid-ride. That is a third of the horizontal platforms, so this is
not a corner case.

**A row-convention difference that mattered.** A **platform** sits beneath the
hero, so his head is at `platformRow - 3`. A **current** acts on his *body* —
`checkAirflowsOnHero` probes his middle column at head, body and feet — so the
lowest row he can be lifted from is `currentRow - 2`, with the cell under his
feet. Using the platform convention made 2 of mp71's 113 lifts claim a stop the
engine would never deliver. Lift and conveyor stops are now produced by simulating
the engine's own step — check, lift two rows, check — rather than by arithmetic on
the run, with a visited-set guard for lifts that wrap the whole map.

**Three data facts the tests pinned down:**

- **Ten maps declare current tiles; eight place any.** `mp51` and `mp84` carry the
  same tilesets as their neighbours but place none, so "declares a current" and
  "has one" are different facts — an earlier draft of this log conflated them.
- **No platform is frozen.** All 123 horizontal platforms are speed 1 or 2, so the
  `speed === 0` branch is defensive. The test asserts the data property rather
  than pretending the branch fires.
- **One vertical platform really does have a one-row range**, so
  `REASON_SINGLE_ROW` is exercised, unlike the frozen branch.

Every platform ends up with either slots or a recorded reason — asserted, so a new
platform can never be silently dropped.

**Gates:** `tsc --noEmit` clean; both new suites pass; full suite 692/692;
`nav:check` clean.

### Phase 3 — navigation graph — **complete**

**Delivered** `web/src/engine/nav/nav-graph.ts` — `buildNavGraph`, nodes in a
compact list with CSR edge offsets, plus `nodeAt`, `forEachEdge`, `edgesOf`; and
`web/tests/nav-graph.test.ts` with 28 tests that check *invariants* rather than
reproducing the builder — as of that day; §18 changed the numbers and the rules
they assert, and the phase table at §13 carries the current figures.

**[measured] over all 31 caverns**

| | |
| --- | --- |
| Nodes | **25,905** (ground + rope + 3,204 ride, plus overlap) |
| Edges | **286,886** |
| Slowest single-map build | **mp10 at ~70 ms** |
| Lifts reachable / total | **236 / 236** |
| Conveyors reachable / total | **288 / 288** |

Edges by kind: `WALK` 32,760 · `STEP` 1,547 · `JUMP` 97,316 · `JUMP_HIGH` 1,845 ·
`FALL` 40,301 · `CLIMB` 9,062 · `SLOPE_UP` 245 · `SLOPE_DOWN` 241 · `DOOR` 7 ·
`RIDE_V` 973 · `RIDE_H` 1,355 · `BOARD` 23 · `ALIGHT` 134 · `DROP` 3,204 ·
`LIFT` 2,818 · `CARRY_L` 37,941 · `CARRY_R` 57,114.

**Three modelling gaps the tests exposed, all of them structural:**

1. **Platforms were unreachable.** A ride slot can never also be a ground node — the
   platform occupies the feet row — so falls and jumps had nowhere to land and
   `BOARD` fired on only 1–3 nodes per map. Falls and jumps now target *either* a
   ground node or a ride slot (`landingAt`), which is how the hero actually gets
   onto a platform: by landing on it. `BOARD` is kept for the genuinely different
   case of a platform resting on solid ground, where both nodes exist and a step
   joins them — 23 such cases **[measured]**.

2. **Only 34 of 236 lifts were reachable.** A lift was entered only from a node
   standing in the swept column, but `checkAirflowsOnHero` runs every frame
   regardless of what the hero is doing — the usual way into a jet is to *fall or
   jump into it*, and a graph of standing positions cannot express "airborne but
   swept". Entry is now found **along the hero's own arcs**: standing, falling off
   a ledge, or anywhere on a jump. That took lifts from 34 to **236 of 236**.

3. **Conveyors had the same problem, twice over.** A swept hero is airborne, so
   the swept position is not a node either. Exit edges therefore *land* him: the
   first standing position at or below the exit column, which is where he ends up
   if he lets go. Conveyors went from none to **288 of 288**.

**Where the plan was wrong:** §7.2 specified a rope node as `tile(x+1, y+1)`. The
engine probes `heroCoords + 1`, which is the middle column at the hero's **head**
row — `tile(x+1, y)`. Corrected in place. A second bug of the same kind lived in
the builder: the rope probe did not wrap the column, so at the seam it read into
the next row and minted a rope node on tile 9. That is why the invariant test
pinned the probe to the engine's expression rather than to a literal.

**Cost note.** The edge count came in well above the ~190k projection because a
current is "enter anywhere along an arc, leave at any exit" — quadratic in the
run's length, and 95k of the 287k edges are conveyor exits. That is inherent to
the semantics rather than an accident, and the graph is built lazily per map, so
it stays inside the plan's budget. If it ever does not, §11.6's worker and
prebuilt-blob escape hatches apply unchanged.

**Gates:** `tsc --noEmit` clean; `nav-graph.test.ts` 27/27; full suite 719/719.

### Phase 4 — capabilities and A* — **complete**

**Delivered**

| File | Role |
| --- | --- |
| `web/src/engine/nav/capabilities.ts` | `snapshotCapabilities` from `g_mem`, plus `describeCaps`, `allCapabilities`, `bareCapabilities` |
| `web/src/engine/nav/pathfinder.ts` | `NavGraphStore`, `findRoute`, `reachableMaps` |
| `web/tests/nav-capabilities.test.ts` | 14 tests |
| `web/tests/nav-pathfinder.test.ts` | 18 tests |

One addition to the phase-3 graph: `NavGraph.nodeHazard`, one `HAZARD_*` word per
node saying what the hero's footprint touches. It is recorded on the geometry
rather than baked into edges, because whether a crossing is permitted depends on
what he is wearing — one graph serves every loadout.

**[measured]**

| | |
| --- | --- |
| Route inside one cavern | cost 65 over 59 hops, **~1 ms**, 65 nodes expanded |
| Route across caverns (`mp10 → mp21`) | cost 44, **~31 ms**, 209 expanded, 7 graphs built on demand |
| Lion-Head door with no key | **correctly refused** |
| Lion-Head door with a key | opened, `keysSpent.lion === 1` |

**Keys are a search dimension, not a penalty** (decision D6). A route that would
need four keys and the hero has three is *not a route*, and no amount of extra
edge cost makes it one, so the state is `(node, keysSpentOrdinary, keysSpentLion)`
and a state that cannot pay is dropped. With 163 doors in the whole game and a
hero holding a handful of keys, the multiplier is small.

**Heuristic.** Octile distance within a map, **zero across maps**. Zero is not a
shortcut — a door can land the hero anywhere in the destination cavern, so no
positive lower bound exists between two maps, and anything else would be
inadmissible and could return a needlessly expensive route.

**One bug worth recording.** `indexOfState` was populated only for the initial
state, so the expansion loop could not map a popped state back to its index and
`describeRoute` walked off the end of the chain. Symptom was a thrown error on the
first successful search; fixed by registering each candidate's index at the moment
it is pushed.

**Two rules the tests pinned, both easy to get wrong:**

- **The key counters are adjacent bytes.** `0x98` and `0x99` must be read with
  `memRead8`, as the engine does. A word read turns one Lion-Head key into 256
  ordinary keys. The test asserts `keys` and `lionKeys` independently.
- **Ice and heat protections are granted only on the level where they exist.**
  Ruzeria shoes grant nothing outside cavern level 4 and the asbestos cape nothing
  outside level 7, because otherwise the mask claims a protection the map screen
  would then act on where there is no hazard.

**Gates:** `tsc --noEmit` clean; both new suites pass; full suite 751/751.

### Phase 5 — the Thread of Yaga — **complete**

**Delivered**

| File | Change |
| --- | --- |
| `core/memory.ts` | `ADDR_THREAD_OF_YAGA` 0x4A, `ADDR_MAGIC_MASKS_EXT` 0x4B, and the `ADDR_FEATURE_YAGA` / `FEATURE_YAGA` marker at 0x46 |
| `core/game-state.ts` | `threadOfYaga` + `magicMasksExt` on `HeroState`, with read, write and live-view wiring |
| `ui/inventory-screen.ts` | `THREAD_OF_YAGA_ID` (9), a counter row in the USE tab, `_useThreadOfYaga`, its own sprite sheet |
| `scenes/indoor-magic-shop.ts` | 9th name, description and price column; stock bit in the extended mask; buy and sell branches |
| `public/assets/images/path_items.png` | new 48×48 sheet, so `magic_items.png` keeps its eight frames |
| `locale/{en,ru,isv}.json` | item name, use text, shop name, shop description |
| `main.ts` | `openMapScreen` hook |
| `tests/nav-thread-of-yaga.test.ts` | 20 tests |

**A feature marker was added on top of Option D.** The plan reasoned that 0x4A is
free because no engine constant lives there. That is true of the *port*, and the
original game's save bytes stop at 0x49 too — but an old save can still hold
whatever the engine left in that byte mid-play, and reading it as a count would
hand the player a few free copies. So 0x46 now carries a marker that only a save
from this version writes, and without it the count and stock read as zero. That is
three bytes of well-understood machinery rather than a hopeful assumption.

The marker is written **only when the item is relevant**, because
`tests/game-state.test.ts` asserts the save image round-trips byte for byte —
writing it unconditionally would corrupt every save that never had the item.

**One behaviour bug the tests caught.** The USE panel removed the item's row on
every use, so spending the first of three copies made it vanish. The panel shows a
count rather than a stack, so the row should stay until the last copy is gone.

**Two hazards the design had to dodge, both asserted:**

- **The shoe pickup scans forward from 0xA1 for a zero**, walking into 0xA6 when
  the shoe slots are full, and the cape purchase scans 0xA1..0xFF. An item stored
  anywhere in that range would eventually be swallowed as a shoe or a cape. 0x4A is
  outside it, which is the real reason to prefer this block over a spare slot near
  the inventory.
- **The item must not touch the generic array.** Using it leaves all five slots
  byte-identical, which is asserted against a live memory image rather than a mock.

**The live view is a getter/setter, not a captured value.** The hero buys and uses
this item during play, so unlike the older scalar fields it has to track memory in
both directions; setting a non-zero count also writes the marker, or the value
would be read back as zero.

**Pricing.** 2000 gold in every town, above every consumable in the same row and
flat across towns — a route through the later caverns needs several copies, so it
should never be a bargain somewhere. Sell price is the existing `floor(price / 2)`.

**A bug found in play, and the reason it slipped through.** The item did not
appear in any shop. `magicMasksExt` defaults to zero, and unlike the eight original
items it had no `DEFAULT_...` fallback — the original tables have no ninth entry,
so nothing ever seeded it. `_getMagicBitmask` falls back for the originals;
`_getMagicBitmaskExt` did not.

The constant alone was not enough to catch it, because a test asserting
`DEFAULT_MAGIC_MASKS_EXT` would have passed while the accessor still read zero.
The regression test now **drives the real shop scene** and asserts item 8 is in
its buy list on a fresh save, which is what actually failed.

**Gates:** `tsc --noEmit` clean; `nav-thread-of-yaga.test.ts` 21/21;
`indoor-magic-shop.test.ts` 9/9; full suite 796/796.

### Phase 6 — the cavern map screen — **complete**

**Delivered**

| File | Change |
| --- | --- |
| `ui/map-screen.ts` | the screen: scale, cached raster, map strip, hero marker, cursor, input, destination picking |
| `engine/nav/pathfinder.ts` | `NavGraphStore.load()` for lazy MDT fetches, and `gridOf()` so the screen can draw a cavern without exposing the graph |
| `input/key-router.ts` | `mapScreenActive` / `mapHandleKey`, checked **before** the inventory because the map sits on top of it; `Tab`, `PageUp`, `PageDown` added to `PREVENT_DEFAULT_CODES` |
| `main.ts` | lifecycle, pointer listeners, draw call, the graph store |
| `tests/map-screen.test.ts` | 23 tests |

**No route is drawn.** The screen renders the cached raster, doors, town exits,
the hero marker and the cursor, and nothing else. Three tests hold that in place:
`draw` takes a timestamp and nothing else, the class exposes no route accessor,
and drawing every one of the 31 caverns never throws.

**Layout.** 672×432 with the map area at `y 28..412` and the hint at `414`. The
integer scale is `floor(min(672/W, 384/64))`, so `mp40` and `mp60` at 320 tiles
draw at 2× and everything fits without panning — verified for all 31 maps,
including that the map stays centred horizontally within a pixel.

**A hero marker, deliberately kept.** It is not decoration: the cavern is a
cylinder, so "which way is left" wraps, and without a marker the player cannot
tell which end of the map they are standing at.

**Other caverns are downloaded on demand.** The game only fetches the MDT of the
cavern it is standing in, so `NavGraphStore` takes an optional fetcher; browsing
the strip triggers it. The current cavern is served straight from `g_mem`.

**Pointer input is new to the codebase** — there was no mouse or pointer handling
on `#gameCanvas` anywhere before this. Events are mapped through
`getBoundingClientRect`, because touch layouts apply `transform: scale()` to the
wrapper, and a test checks the round trip survives scales from 0.5× to 2.25×.

**The inventory does not close.** Using the thread opens the map on top; picking a
point returns to the inventory with the usage message showing; the route appears
only when the player leaves. `gamePaused` is never toggled by the map, since the
inventory already set it.

**One process note, and one bug in my own tooling.** Index-based scripted patching
of `main.ts` corrupted it mid-phase — 1,957 insertions against 1,749 deletions,
with whole functions moved out of scope. It was restored from git and the wiring
redone with verified edits; the file now differs from HEAD by **162 insertions and
9 deletions**, all additive.

The same class of mistake also duplicated this log: two `python` `str.replace` calls
whose targets did not match the file silently did nothing, so phases 5 and 6 were
never written and phases 3 and 4 ended up out of order and duplicated. Both are
fixed here, and the lesson is the same as the `main.ts` one — a scripted edit that
does not verify that it changed something is not an edit.

**Gates:** `tsc --noEmit` clean; `map-screen.test.ts` 23/23; full suite 794/794.

### Phase 7 + 8 — chevron overlay and live route — **complete**

Delivered together, because the overlay is inert without the guide behind it.

| File | Role |
| --- | --- |
| `web/src/engine/nav/path-guide.ts` | owns the route: progress, dormancy, and re-planning |
| `web/src/render/path-overlay.ts` | draws the remaining chevrons, clipped to the viewport |
| `web/src/main.ts` | loads `chevrons.png`, wires the guide, draws the overlay, `Q` to cancel |
| `web/src/input/key-router.ts` | the `Q` branch |
| `web/tests/path-overlay.test.ts` | 25 tests, end-to-end against the real cavern data |

**The sheet is `assets/images/chevrons.png`, 120×24 — five 24×24 frames in one row:
`>` `^` `<` `v` then the destination ring.** The overlay indexes it as
right 0, up 1, left 2, down 3, ring 4, and a test reads the PNG header and fails
if that ever stops being true.

**Diagonals use the nearer cardinal rather than a rotated sprite.** This is pixel
art rendered with `imageSmoothingEnabled` off; a 45-degree rotation would soften
the edges to buy a direction nobody reads off a chevron, and the sequence of
chevrons traces the path anyway.

**A seam bug the tests caught.** The chevron for a step wraps the column and row
deltas because a cavern is a cylinder — but the first version wrapped the
*magnitude* and then used the **raw sign**, so the step 239 → 0 on a 240-wide map
pointed the chevron west instead of east. Both deltas are now wrapped with their
signs, and there is a test for the column seam and the 64-row seam.

**The guide exists because a route drawn forever lies.** The hero changes shoes,
opens doors, wanders off the path. Re-planning triggers: the capability mask
changed, the key counts changed, the hero left the goal's component, he drifted
more than 3 tiles from the route, or 20 s elapsed regardless. Throttled to at most
one re-plan per 500 ms so holding a direction key cannot turn a walk into a
pathfinding loop. If the goal becomes unreachable the route is dropped rather than
drawn.

Door state is deliberately **not** a trigger: a door cannot be closed in play, and
a route through a locked door already assumes the key, so opening it later cannot
invalidate the plan. The refresh interval catches anything else.

**Dormant, not dead.** While the inventory or the map screen covers the cavern the
overlay draws nothing, but the guide keeps tracking and re-planning underneath — so
the line is correct the instant the menus close rather than stale. That is the
"reveal" stage from §3.2, and it is what `syncPathOverlayVisibility` wires.

**Draw order:** after `animateDungeonTiles()`, before magic projectiles, entities
and the hero. Over the background, under everything that can move or hurt you.

**`Q` clears the route**, gated to an unpaused cavern so it can never fire while a
menu or a text field has focus.

**The overlay's per-frame cost does not grow with route length.** The guide
truncates the route at the hero's progress and the walk stops at the first point
outside the viewport, with a hard cap of 64 chevrons. A route across three caverns
draws no more than one across a single cave.

**A bug found in play: the chevrons pointed into the scenery.** Two separate
defects stacked, both in how the reveal tracks the hero.

1. **Progress matched "within one tile".** Route steps are *exactly* one tile
   apart, so a hero standing on point N also satisfied the test for point N+1. The
   reveal ran ahead on the first frame and swallowed the first arrows, so the path
   appeared to begin partway along and the step leaving the hero was never marked.
   The match is now exact — both positions are integers read from the same `g_mem`
   expression, so there is no rounding to absorb.

2. **Progress counted a point as reached the moment he stood on it.** That moved
   the anchor *past* the hero, so `remaining()[0]` was the second point and the
   arrow for the step he was about to take was never drawn. Progress is now the
   index of the point he currently occupies, so the first chevron sits on his head
   and marks the next step.

The second defect is the one that produced the report; the first made it worse by
hiding the first hop as well.

**The sprite frame order was verified, not assumed.** The report could have meant
the wrong frames were indexed, so the sheet's PNG was decoded — inflate, undo the
filters — and each frame rendered as ASCII. All four glyphs read back as
`>` `^` `<` `v` in frames 0-3, matching what the overlay assumes, with the ring in
frame 4. The bug was purely the anchor.

Three tests now pin it: the first chevron is on the hero's cell, standing still
consumes no arrows at all, and the anchor stays on him as he walks.

**Gates:** `tsc --noEmit` clean; `path-overlay.test.ts` 19/19; full suite 830/830.

### Phase 3, 4 and 7 corrections — from a reported bad route

The player reported that a route's chevrons "pointed down into the ground", and
named a trip: mp80 from (113, 21) to (151, 6), expecting the path to use a
horizontal platform and a fall. The chevrons were the symptom. **Five defects
underneath, four of them in the graph rather than the overlay**, and the route that
produced them was not the route the player was actually trying to make.

1. **The fall scan tunnelled through solid rock.** `fallTo` looked 64 rows down for
   *any* node and returned the first it found, without ever checking that the space
   in between was open. A hero on a ledge "fell" fifteen rows into rock. Every
   `FALL`, `DROP` and `CARRY` edge in the game was affected. It now stops at the
   first obstruction.

2. **A conveyor edge landed wherever the fall happened to end.** A current carries
   the hero *along its own row*; the edge was resolving to the first landing below
   the swept cell, which is how a "swept left" edge became "plummet twenty rows".
   An exit is now only offered where the conveyor's row has real ground.

3. **A carry-hazard guard I wrote in phase 2 was discarding seventy platforms.**
   It refused a horizontal platform if *any* column of its span lacked a standing
   position. Over a thirteen-column platform that is far too blunt, and it threw
   away the platform mp80's upper route is built around. A column where the hero's
   body does not fit now simply has no slot; the ride is linked only between columns
   that both fit. **[measured]** ride slots went 3,204 → 5,589 and inert platforms
   71 → 1.

4. **A jump checked only its apex.** A three-column jump really does sweep the two
   columns between, and routes whose arc clipped a wall were accepted. Jumps now
   verify the whole swept body.

5. **A platform could not be jumped off.** Jumps were only generated between ground
   nodes, so a ride that could not be walked off sideways was a dead end. Ride
   slots now jump like anything else — a platform is a launchpad.

**[measured] after the fixes** the graph is 28,290 nodes / 211,633 edges. Nodes
rose because seventy platforms came back; edges *fell* by 75,000 because the
impossible hops are gone. Reachable lifts went from a claimed 236/236 to an honest
**152/236**: the other 84 run through open space with no standing position on their
own row, so the hero is carried past every exit, and the model now declines rather
than dropping him off the end of the world.

5. **The overlay never implemented the plan's own rule.** §10.2 said to skip chevrons on
carried segments. The renderer drew one per hop regardless, so a ride produced a row
of arrows hanging in mid-air. Carried hops — rides, boardings, drops, lifts,
conveyors — now draw nothing; the terrain speaks for itself.

**A new suite, `tests/nav-route-cases.test.ts`,** checks *named* journeys rather than
graph self-consistency: that a route's arcs never put the hero's body inside rock,
that its falls are short, and that it starts and ends where asked. Sampling follows
the engine rather than a bounding box, because both axes wrap and a 48-row fall
from row 58 to row 10 goes *down* — walking min..max got that backwards and reported
crossings that never happened.

**Still open, and now understood rather than mysterious.** That specific trip does
not resolve, because the two ends of mp80 are on opposite sides of a rock wall: at
row 17 the tiles from column 138 to 141 are solid, so the hero's body stops at 135
and the passage resumes at 142. The horizontal platform at row 15 bridges that wall,
but from its rightmost ride slot the furthest jump reaches column 138, which has no
ground under it. Either the model still misses a traversal — a ledge-grab, a wider
jump, or the platform carrying him past the wall — or the trip is meant to be made
another way. The three affected assertions are left `it.skip` with that analysis
attached, so the question stays visible instead of quietly disappearing.

**Gates:** `tsc --noEmit` clean; 58 files, 844 passing, 3 skipped. The suite is 22 tests and the full run is 834.

**Two bugs found in play, both from the same missing assumption: that the cavern's
data is the file on disk.** Every test loaded MDTs straight from
`web/public/game/0/`, so neither could see that the game hands the pathfinder
something else.

1. **The current cavern was handed the whole 64 KB memory image.**
   `loadMdtToBuffer` writes the MDT at `0xC000` (core/ts-memory.ts:56-58), but the
   store's source returned `getGmem().slice()` — offset 0. The decoder reads the map
   width from bytes 2-3 of whatever it is given, so it read the *save image* there,
   got a nonsense width, and walked the packed map off the end:
   `NavGridError: map 23: packed map ran past the end of the image at column 2432`.
   The fix is `getGmem().slice(ADDR_MDT)` — the 16 KB window the game actually
   holds. A test now decodes both and asserts the memory image throws while the
   windowed one does not.

2. **The decode error was uncaught.** It escaped `NavGraphStore.get` through
   `MapScreen.choose` and the `KeyRouter`, so it surfaced as an uncaught error in
   the console and the key press was swallowed rather than the map simply being
   declined. `get` now catches decode failures, remembers the map so it is not
   retried every frame, and returns null — so a malformed asset costs you that one
   map and nothing else. `isBroken(mapId)` exposes the state.

The lesson generalises past this feature: a test that supplies its own dependency
cannot catch a mismatch between the real dependency and the substitute, and the
memory image is exactly that kind of substitute — the right bytes at the wrong
address.

**Two more found in play, the same morning.**

3. **The map was invisible.** `mapScreenInstance.draw()` ran, but the inventory
   drew *after* it and fills the whole canvas, so the map was painted over
   completely. Order is now inventory → map → modal. `openMapScreen` already
   refuses to open while a modal is up, so the map can safely sit below one.

4. **The map strip ran together into one unreadable line.** From `mp80` the
   component has **14 maps**, so each tab is 672/14 = 48px — and a full "MP80" is
   five characters of 12px monospace, about 35px. Fourteen of them in a row with no
   clipping read as `MP5DMP60MP61MP62...`. Tabs now use a short label
   (`mp80` → `80`, `mp5d` → `5D`), the full name stays in the title bar for the
   current map, and each label is clipped to its own slot so a long one can never
   bleed into its neighbour. A test computes the required width for every tab of
   every component and fails if any exceeds its slot.

6. **Every cavern the game had not already downloaded 404'd.** The map strip
   showed the cavern, but choosing any map other than the one the hero stood in
   reported "This cavern cannot be charted". The fetcher used
   `fetch('assets/' + mdtPath)` while the game loads a cavern it is about to enter
   with a bare `fetch(mdtPath)` — the files live at the site root under
   `game/0/`, not under `assets/`. Now uses the identical string, with a test
   that asserts every `mdtPath` resolves to a file that exists under `public/`
   and that nothing resolves under `assets/` by mistake.

   That surfaced an implicit API contract worth fixing: `load()` depended on the
   fetcher publishing bytes into the *source's* cache for `get()` to see them.
   The store now keeps fetched bytes itself and consults them first, so a fetcher
   is just "give me bytes" and cannot silently fail to be visible.

7. **Esc consumed the thread.** The item was spent when the map *opened*, so
   dismissing the map lost a copy. The thread is now only *offered*: `use` sets a
   pending flag and opens the map; `commitThreadOfYaga` spends it when a
   destination is chosen and shows the message; `cancelThreadOfYaga` — called on
   Esc, on a click outside, and on leaving the inventory — gives it back. The
   pending state lives on the inventory, which already owns the item and the
   message, rather than on the map screen.

8. **None of the seven `map.*` strings existed.** They were written into §15 of
   this plan and never into `web/src/locale/*.json`, so the title and hint line
   rendered empty and the console filled with a missing-key warning *per frame* —
   which is exactly the kind of noise that gets skimmed past in a busy log.

   Three guards now: the keys are added to `REQUIRED_RELEASE_KEYS` in
   `locale-completeness.test.ts`, a test resolves every key the screen renders in
   all three locales, and `LocaleMessages` declares the section so the schema
   matches the data. A warning repeated every frame is a defect, not a log line.

### Phase 3, 7 and 8 corrections — the jump model, and playing the route

The route named above, mp80 `(113,21)` to `(151,6)`, was re-reported against the
drawing in `WORK/LEVELS/MP80.TXT`. It had two faults of its own and exposed **six
defects under it, five in the graph and one in the display**. The graph's were all
one mistake wearing different clothes: a model stricter than the game.

1. **The jump model was an invented arc.** An offset table — every landing within
   three columns and three rows — gated on an apex box that corresponds to no code
   in the engine. It refused the first move of the drawn route, the hop off the
   platform onto the row 10 gallery, because at the top of that jump the hero's feet
   are level with the ledge he is landing on. Replaced by `nav/jump.ts`, a replay of
   `jump_press_handler`, `airborne_movement` and `check_floor_for_landing`.
2. **A hero on a rope cannot jump.** `jump_press_handler` returns while
   `ON_ROPE_FLAGS` is set (`dungeon-hero.ts:322`); climbing is `try_climb_rope`,
   and leaving is one step sideways. The model had rope jumps, and the route used
   three of them. The player reported all three as impossible, which they were.
3. **An up current holds him over a hole.** mp80's row 21 has floor tiles of `0x13`
   at columns 94-96: passable *and* an up current, so the landing check finds
   nothing under his middle foot while `check_airflows_on_hero` holds him up.
   Standing now means "held up", by ground or by a current.
4. **The body does not have to fit.** The engine tests one cell on a rise, one
   column on a step, nothing on a fall and one cell on a landing, so he comes to
   rest with a foot in rock — mp80's `(175,51)`, on the drawn route — and falls
   through floors. Requiring a free 3×3 refused three moves the player had made.
5. **Falls drift and platforms can be walked off.** `airborne_movement` re-reads
   `INPUT_DIRS` every tick, so a fall picks a column per row; ledges scanned one
   column, which is why walking off the cliff at `(166,50)` never found the platform
   at `(164,51)`. And a hero on a platform is standing, not airborne, so stepping
   over the side is a step and then a fall.
6. **The route was deleted by a jump.** The drift check re-planned when the hero was
   more than three tiles off the line — which is what he is, mid-jump — and a
   search from a cell that is no node returns nothing, which was being read as "the
   goal became unreachable". The chevrons vanished over the platform at `(182,57)`
   and sometimes after a menu.

Two display faults came from playing it, with the route itself correct: **a restore
left the old chevrons on screen** (F7 never touched the guide), and **one arrow per
hop left gaps** wherever a hop covered many tiles — nine blank columns at each of
the two places the player reported.

**Proved, not asserted.** `tests/nav-jump-differential.test.ts` builds five caverns,
hands each to the engine's own memory image, flies a sample of input plans through
`dungeon_finish_normal_frame`, and requires every landing the engine produces to be
one the model offers. The harness checks that the proximity window holds the cavern
it was given, which caught two setup faults before it caught anything else. The
harness itself was wrong twice — the model and the engine disagreed only because
the test was feeding the model a different map than the engine.

**[measured]** 29,917 nodes / 1,222,289 edges, all 31 caverns built in 1.1 s,
235/236 lifts and 216/288 conveyors reachable, 5,395 of 5,589 ride slots with an
entry. The route resolves in 146 hops and draws 359 chevron cells. Full suite
856/856.

---

## 18. Handover — read this first

**State at end of session:** `tsc --noEmit` clean, **856 passing** across 59 files,
nothing skipped. The jump model is derived from the engine and has no deviations
from it left; the rope family, the fall, the platform and the node rules are
corrected; the route from the start ledge to `(151,6)` resolves leg for leg as the
player drew it; and the chevrons the guide draws for it are continuous, survive a
restore, and are not deleted by a jump.

### What the model was, and what it is now

It was an offset table — every landing within three columns and three rows, gated on
an apex box that corresponded to no code in the game — and it rejected the hop the
player made off a platform onto a ledge, because at the top of that jump his feet
are level with the very surface he is landing on.

It is now `web/src/engine/nav/jump.ts`: a replay of `jump_press_handler`,
`airborne_movement` and `check_floor_for_landing`, written down as the engine's
rules rather than as an envelope.

| Engine line | What it means for a jump |
| --- | --- |
| `jump_press_handler` reads `heroTL - 35` — one row up, one column right of his top-left cell — and nothing else (`dungeon-hero.ts:327-360`) | the only obstruction the rise consults is the cell above the middle of his head. His body can pass through the lip of the ledge he is jumping onto, because the engine never asks |
| `right_up_pressed` calls `jump_press_handler` and then `on_right_pressed` (`dungeon-input.ts:337`) | the sideways step happens on the same frame as the rise |
| `airborne_movement` re-reads `INPUT_DIRS` every frame (`dungeon-input.ts:568-598`) | he steers mid-air, and a frame spent turning around is a frame he still descends |
| the descent is one row per frame with no test at all (`dungeon-input.ts:536-541`) | the landing check is the only thing that stops it |
| `check_floor_for_landing` (`dungeon-vertical.ts:488-504`) | ground under his **middle** foot; his outer two feet count only in the single frame a rise leaves his animation phase at 0 |

Three consequences, all of which the offset table could not express:

- **The apex is not a place.** A jump can rise past its landing and fall back to it,
  so a landing's height says nothing about how many rows he rose. Only the second
  decides whether he needs Feruza shoes.
- **A jump is a search, not a table.** A long jump is a long fall that stops at the
  first ground, and the lateral reach is exactly one column per frame — at most
  `rises + 1 + descents`. From a typical node it reaches about twenty cells instead
  of seven.
- **The hop off a platform needs no shoes.** From the ride slot at `(136,12)` the
  hero rises two rows and steps east once per frame, three columns in all, and lands
  on `(138,10)` in four frames. The old apex test rejected it because his feet were
  on the ledge.

### Ropes: what the engine actually allows

There is **no jump off a rope**. `jump_press_handler` opens with

```
if (memRead8(g, ON_ROPE_FLAGS) !== 0) return;      // dungeon-hero.ts:322
```

so on a rope it does nothing at all. Climbing is `try_climb_rope`'s `moveHeroUp`
(`dungeon-vertical.ts:236`), and leaving is one step sideways:
`on_right_pressed` moves him a column and returns because he is on a rope
(`dungeon-vertical.ts:139,146`), and the rope frame then finds no rope at his new
middle column and puts him back in the dungeon (`dungeon-states.ts:258-280`). A rope
node therefore has: climb up, climb down, a step onto ground beside it, and a fall
off it in either direction. An earlier version of this file claimed otherwise and
was wrong — the guard on line 322 was read past.

The fall is a **drifting** fall, not a straight one: `airborne_movement` reads
`INPUT_DIRS` every tick, so the hero picks a column per row, which is how the row 10
gallery is reached from the top of the column 91 rope (a fall east from `(90,3)`
lands anywhere from `(92,10)` to `(99,10)`). A straight `fallTo` cannot express
that, so rope departures go through the same descent the jump uses, with no rise.

### One more thing the engine was already doing

At columns 94-96 of row 21 the floor tile is `0x13`, which is both passable **and**
an up current. The floor check finds nothing under the hero's middle foot — but
`check_airflows_on_hero` runs before `airborne_movement` and sets
`AIR_UP_TILE_FOUND`, which puts both the landing check and the descent out of reach
(`dungeon-input.ts:515-517`). A hero over a hole a current holds does not fall
through it, so `isStanding` accepts a position held by an up current even with no
ground under his feet. Without that, the walk west along row 21 breaks at column 93
and the only way across is a jump — which is the point the player raised about hop
13.

### The last thing the engine never asked: whether his body fits

Three of the player's own corrections landed on the same invented rule. The model
required the hero's whole 3x3 to be clear at every cell of a flight. The game has no
such test:

| engine test | what it leaves untested |
| --- | --- |
| a rise, `heroTL - 35` | one cell — the hero rises straight through the lip of a ledge |
| a step, `move_hero_right_if_no_obstacles` | the column he is entering |
| the descent | everything — he falls through a floor whose middle foot is over the hole beside it |
| the landing | one cell, under his middle foot — so he rests with a *side* in rock |

mp80's pit at `(175,51)` is the last of those: the row 53 shelf ends at column 175,
so his middle foot finds the floor at `(176,54)` while his left foot is inside the
shelf. He leaves it by jumping — the rise takes him to `(175,50)`, where
`move_hero_left_if_no_obstacles` finds his column clear — and the player drew exactly
that: fall into the pit, jump left and up, land on the shelf.

So a node is now **where the hero stops**, which is the landing check and nothing
more, and the body is only asked about where the engine itself assumes it: his
**middle column**, because every probe the jump and the fall make reads that column.
He may have a side in rock. He may not have his middle in it.

The model has **no deviations left**. An earlier version refused flights where the
hero's body did not fit, which was a reading of `fallTo` rather than of the engine,
and it refused three moves the player made. What the engine does not test, the model
does not test.

Two costs came out of the same correction:

- A fall charges for the columns it carries him sideways. Both are frames to him,
  but without the second the search drifts as far as a fall can carry him and then
  falls again, and a route the player drew as a walk along a corridor comes out as a
  row of two-column "falls" that never fall.
- "Never passes through solid rock" is gone as a premise — the game has no such
  property — replaced by the one that still means something: he is never *buried*,
  every cell he occupies has some part of him in open space.

### A current ends a flight before it can land

`check_airflows_on_hero` runs at the top of every frame (`dungeon-frame-pre.ts:88-113`)
and, finding a jet in the hero's three rows, sets `AIR_UP_TILE_FOUND` — which is what
`airborne_movement` returns on (`dungeon-input.ts:515-517`), so **neither the landing
check nor the descent ever runs**. A hero who jumps into a column of `0x13..0x16`
is simply taken.

The model had no such rule, and it is the only way into mp81's row 6 corridor: the
corridor is walled at both ends at rows 6-7 and floored from column 111 to 134 and
from 139 to 150 at row 9, so the jet at columns 134-137 is the only entrance. Without
it a flight sails past the current, finds no ground under its middle foot anywhere
down the column, and lands back where it started — and `(124,6)`, which is otherwise
perfectly ordinary, had no route at all from any map. With it:

```
mp81 (135,16) --JUMP--> (134,14) --LIFT--> (134,6) --WALK--> (124,6)   12 hops
mp80 (111,21) --> mp81 (124,6)                                          141 hops
```

The lift mask is handed to the model the way the platform mask is, and it is
consulted **before** the landing check, because that is the order the engine has them.

### Walking off a platform, and falling that drifts

Two moves from the player's own account, both in the same place as the rope work:

- **A ride node can be walked off.** The hero on a platform is standing, not
  airborne, so stepping over the side is a step and then a fall; the platform's
  straight `DROP` is only one of the ways off it.
- **A fall reaches a whole slope, not one column.** `airborne_movement` re-reads
  `INPUT_DIRS` on the tick it descends, so the hero picks a column per row. Ground
  ledges were still scanning one column, which is why walking west off the cliff at
  `(166,50)` did not find the platform at `(164,51)`.

### The route, leg for leg

146 hops, and it reads as the drawing: walk west along row 21 to `(101,21)`; one jump
across the `0x13` airflow gap to `(91,21)`; step onto the column 91 rope; climb to
`(90,10)`; fall east onto the row 10 gallery; walk it to `(121,10)`; drop onto the
moving platform and cross to the east floor at `(148,21)`; walk to `(156,21)`;
climb the 157 rope; east along row 11 to `(171,11)`; climb the 173 rope to `(172,0)`
and on through the seam to `(172,58)`; cross the lower cavern; climb the 189 rope;
west along row 47; **fall into the pit at `(175,51)`, jump left and up onto
`(169,50)`**; onto the platform, ride west to `(149,51)`; **`DROP` to `(149,6)`** —
the free fall from row 51 through row 63 and across the seam into the target — and
one step east to the goal.

The rope at column 173 is two stretches in the static map, rows 0-12 and 56-63, and
the graph chains them into one rope: `try_climb_rope` reads the tile one row above
his head and the map wraps, so he really can climb from row 0 straight into row 63.


### The guide and the overlay, after playing it

The route was right and the chevrons still lied about it, three ways. All three were
in the display layer, and all three have tests now.

**A restore left the old route drawn.** `performGameRestore` replaces the world
under the hero — another place, another position — and never touched the guide, so
whatever was planned before F7 stayed planned and kept being drawn against the
restored hero. It calls `clearActiveRoute()` before it loads anything.

**One arrow per hop put holes in the line.** The overlay drew a chevron at the tile
a hop *left* from, so a nine-column jump got one arrow at one end and nothing for the
nine columns it crossed. The gaps the player saw at `(100,21)` and `(121,10)` were
exactly that. The guide now answers `cellsForHop`: every cell the hop covers, from
the same jump model the graph is built from, so the cells are the ones the hero
really flies through rather than a line joined between the ends. With it the player's
route draws **359 cells** for its 146 hops, which is why the per-frame cap went from
64 to 512 — the cap only bounds loop arithmetic, since off-screen cells are dropped
before anything is drawn.

**The route vanished when he jumped over the platform at `(182,57)`.** The drift
check asks whether the hero is within three tiles of any point still ahead; mid-jump
he is standing nowhere, and the cell under him in mid-air is not a standing
position, so the re-plan that followed searched from a cell that is not a node, found
nothing, and cleared the route. The same door explains the route sometimes
disappearing after the inventory: a re-plan from a position that is not a node.
**A jump is how this route crosses gaps, so being off the line is not drift** —
`needsReplan` returns early when `nodeAt` has no node where the hero is, and nothing
re-plans until he lands. When he *is* standing on a node and the search finds
nothing, the world really has changed and the route goes, as it should.


### A locked door is not "no route found"

Every door from `mp80` into `mp81` is locked (`portal.key === 1`), so with an empty
pocket the route from `mp80 (111,21)` to `mp81 (124,6)` does not exist and the map
screen says `No route found.` — true, and useless: a player cannot tell a locked
door from a severed cavern. Keys are a *search dimension* rather than a wall, so the
screen now searches once more with the keys granted when the first search finds
nothing, and says `The door is locked.` when that one succeeds. One extra search, on
the path where nothing was found anyway.

With one key the journey is 141 hops and spends it. The jump into the current that
opens `mp81`'s corridor needs no key at all: `mp81 (135,16)` to `(124,6)` is 12 hops
from inside the map.

### A current may only carry him up

Found by the player reading a route out loud: hop 15 was `LIFT mp80 (96,21) ->
(95,50)`, an **upward** current carrying him twenty-nine rows *down*, and hop 16 a
conveyor taking him back up the same column. Both were the same mistake — **currents
were indexed by column alone**, so every current in a column offered every other
current's exits.

**[measured]** mp80's column 96 has two: one reaching rows 21-29, one 44-50. A hero
swept at row 21 was handed the second run's stop at row 50.

- A lift now offers only the stops **above** where he was swept, and only within its
  own run's height. Both bounds are needed and neither is a fudge: an up current
  cannot take him down, and it cannot reach another current's stops. The distance is
  measured in wrapping rows, which is safe because a run is a few tiles long.
- A conveyor's exits are keyed by column **and row**. A conveyor carries him sideways
  along its own line; keyed by column alone it offered exits twenty rows away.

Both were found by playing the route, not by reading the code, and both had been
there since the currents were first modelled. Hop 15 is now what it should always
have been:

```
 15 JUMP  mp80 (96,21) -> mp80 (91,21)
```

The route grew from 156 hops to 184, which is what removing impossible shortcuts does
to the cheapest path — the lifts and conveyors it can no longer pretend to ride.

### Following the line, and why it had holes

The chevrons faded with distance — solid for the next few cells, nearly gone fifteen
ahead — and the player reported the path as both discontinuous and hard to follow.
Both were real, and neither was the fade:

- **Every jump lost its take-off.** `flightPath` returned the *descent* only; the
  rise was dropped when the rise's column chain was removed in an earlier
  simplification, so every jump drew a hole three tiles wide exactly where the hero
  left the ground — and jumps are most of a long route. The rise is back: the chain
  of columns is recorded per rise end and written out one cell per row climbed.
- **A hop that ended in a current could not be replayed at all.** The guide's own
  jump model was built with the platform mask but not the currents mask, so a flight
  that ends because the hero is swept fell back to the hop's two ends — a hole of the
  whole flight.
- **Carried hops were skipped outright.** A door, a ride, a lift drew nothing at all,
  so the line stopped dead at every door and every current: four holes in this route,
  one of them a door *inside* mp81 with seventeen columns unaccounted for. They are
  drawn now along the move's own axis.

**[measured]** the drawn line for mp80 (111,21) → mp81 (124,6): **390 cells over 184
hops with no breaks in it.** Before: 266 cells, five holes, and every jump missing
its first three tiles.

### The route is longer than the room

The log settles it: **`23 drawn of 196 points`** for the mp80 journey. The route runs
sixty columns west and the view is twenty-eight wide, so most of it is off screen at
any moment, and the line stopped at the room's edge — which is what "not continuous"
meant. Every cell beyond the view is now drawn **clamped to the border it lies
past**, at the same fading alpha, so the route leaves the room instead of stopping in
it: a faint smear along one edge saying which way the cavern goes, and pointing at
the line of the cavern the route follows rather than a single arrow in a corner.

### The route should say which shoes it needs

The player: *"it should mention in your log — wear Silkarn shoes, jump on the slope,
wear Feruza shoes again."* And they were right that it cannot: the search **refused**
every hop gated on an accessory, because `permitted` drops an edge whose `req` the
hero's mask does not carry. So a route that could be walked in boots went the long
way round, and nothing said why.

`findRoute` now takes `planAccessories`. With it the search counts on shoes the
player can put on, the route gains `equipment: NavRequirement[]` — accessory, label and
the point each is first needed, **in order** — and the guide spells it out:

```
[path] chevrons: … , shoes: Feruza shoes at (88,21)
```

**[measured]** mp80 (111,21) → mp81 (124,6): **184 hops refusing the shoes, 152
using them**, needing Feruza shoes once, at (88,21).

Keys stay what they were — something he picks up and must already have, not something
he puts on — so `planAccessories` widens only the accessory bits (Feruza, Silkarn,
Pirika, Ruzeria, Asbestos) and never the key ones.

### How it was proved

`web/tests/nav-jump-differential.test.ts` builds five small caverns, hands each to
the engine's own memory image (`unpack_map`, then `dungeon_finish_normal_frame`
every frame — the real frame order, not a re-enactment), flies a sample of input
plans from every launch cell with and without Feruza shoes, and requires every
landing the engine produces to be one the model offers. The harness checks itself:
`hero_coords_to_addr_in_proximity` must hold the cavern's tiles, or the comparison
would be between two different maps. That check earned its place immediately — it
caught a packed map laid out row-major instead of column-major, and pictures of two
different widths.

The test also carries the mp80 hop as a named case: two rows up, three columns
across, four frames, no shoes.

`web/tests/path-overlay.test.ts` covers the three display faults, each of which was
found by playing the route rather than by reading the code:

- a hero standing on no node is not drift, and the route survives 60 s of it;
- every cell the route draws joins up hop to hop, and the nine-column jump over the
  airflow gap reports its cells rather than one arrow at an end;
- the reveal still tracks the hero along a walk, and an unreachable goal still
  drops the route rather than drawing a wrong one.

The three assertions that were skipped for weeks are live in `tests/nav-route-cases`:
the route resolves, it never leaves the hero *buried* — every cell he occupies has
some part of him in open space, which is the property the game actually has — and it
starts on the hero and ends on the destination.

### Numbers that moved, and why

| | before | after | why |
| --- | --- | --- | --- |
| nodes | 28,290 | 29,917 | a node became "the hero stops here" rather than "his whole 3x3 is clear", which is the engine's own rule and gives back the positions where he rests with a side in rock — mp80's drawn route needs one at `(175,51)` |
| edges | 211,633 | 1,133,490 | the engine's jump reaches about twenty cells per node, not seven, and falls drift a column per row; a current ending a flight took some of that back, since flights that used to sail on and land elsewhere now stop at the jet |
| lifts reachable | 152/236 | 235/236 | a jet is entered by the cells a flight really flies through, and a fall can now drift into one |
| conveyors reachable | 216/288 | 216/288 | unchanged from before, but by a different route: drifting falls reach columns a straight scan never looked at |
| ride slots with an entry | 5,403/5,589 | 5,395/5,589 | platform landings needed the slot mask the jump model now has — and the mask goes on the cell under the hero's middle foot, three rows below the slot, because that is where the platform tile is. The `BOARD` edges that went were to ground nodes the hero cannot stand on: a platform occupies its own row, so there is never static ground under one |
| all 31 caverns built | 1.7 s | 1.1 s | the predicates are masks over the map now, not modular arithmetic per state |
| route from the start ledge | no route | 146 hops, 359 chevron cells | it resolves leg for leg as drawn, and every cell of it is drawn |
| chevrons per frame cap | 64 | 512 | one per cell rather than per hop, so a cross-cavern route needs hundreds; the cap only bounds loop arithmetic |

### Traps in this code that cost a session

These were all wrong turns, recorded so they are not walked again:

- **Do not infer a fact from a probe before checking the probe.** A clearance
  check reported column 150 as blocked; it was testing a 3-wide body from column
  150, which covers 150–152, when the free corridor is 149–151. The level was
  right and the measurement was wrong.
- **`WORK/LEVELS/MP*.TXT` is 256 characters wide.** `awk` reports 257 because it
  counts the `\r` in CRLF. A drawn marker is **not** the hero's column; ask.
- **`mp80.TXT` is now an annotated route, not a dump.** The `nav-mdt-grid` test
  excludes it for that reason, and covers the other 30.
- **A node's `kind` is a tag, not a coordinate.** Several ride slots can share
  one cell with different riding offsets. `leftCol` alone does not identify a
  riding position.
- **Never widen a threshold to make a route appear.** Every time that was done
  here it hid the real defect underneath.
- **A harness must check itself.** An engine harness that silently reads a
  different map than the model under test will agree with anything. It earned this
  twice, catching a packed map laid out row-major instead of column-major and
  pictures of two different widths.
- **The game has no body test, so a model that adds one is inventing.** It cost
  three corrections in a row: the ledge hop that rises through a lip, the pit at
  `(175,51)` where he rests with a foot in a shelf, and a fall that drops through a
  floor because his middle foot is over the hole beside it. Every predicate in a
  movement model has an engine line behind it or it does not belong in the model.
- **Read the guard clauses, not just the branches.** `jump_press_handler` opens with
  `if (ON_ROPE_FLAGS !== 0) return;` on line 322. Reading lines 327-357 and quoting
  them is what produced a rope jump that does not exist, and it took two sessions to
  notice.
- **A re-plan from a cell the hero is only passing through always fails.** `nodeAt`
  returns -1 mid-jump, `findRoute` returns null, and code that treats that as "the
  goal became unreachable" deletes a perfectly good route. Ask whether the hero is
  *on a node* before concluding anything from a failed search.
- **One marker per move is one marker per cell.** Drawing one chevron per hop looked
  right for a walk and left a nine-column gap for a jump. The unit that matters is
  the tile, not the edge.

### Where the code is

| file | what it owns |
| --- | --- |
| `web/src/engine/nav/jump.ts` | the jump and the fall: one replay of `jump_press_handler`, `airborne_movement` and `check_floor_for_landing`, and the per-map masks it evaluates them into |
| `web/src/engine/nav/geometry.ts` | occupancy: `heroBoxFree`, `canRest`/`isStanding`, `heroCanStepSideways`, `heroInLift` |
| `web/src/engine/nav/nav-graph.ts` | nodes, edges, platforms, currents, and which cells a jump or a fall reaches |
| `web/src/engine/nav/path-guide.ts` | the live route: the reveal anchor, when to re-plan, and which cells a hop is drawn through |
| `web/src/render/path-overlay.ts` | the chevrons themselves |
| `web/tests/nav-jump-differential.test.ts` | the engine flown against the model, cavern by cavern |
| `web/tests/nav-route-cases.test.ts` | the player's journey through mp80, end to end |

### Process

The player corrected seven things across three sessions that reasoning alone would
have got wrong: the dump's width, the marker offset, the column-150 blockage, that
there is no jumping off a rope, that an up current holds him over a hole, that his
body does not have to fit, and that the chevrons lie even when the route does not.
Two of them — the rope guard and the body test — were cases of the same failure:
reading part of a routine and building a model of the part I had read.

**Read the routine, quote the line, then implement.** Every predicate in a movement
model needs an engine line behind it. When something does not fit, ask with
coordinates before theorising: every correction above arrived as coordinates, and
each one was checkable against the map in a minute.

---

## 19. Keys — finding them, and routing through locked doors

*Status: **built**, in the stages below. The map screen runs stages 1–3 as three
searches; stage 3's merge is the single augmented search rather than a string splice,
because a splice can ask for a key the hero has not picked up yet.*

**A note on provenance before anything else.** There is no C and no WebAssembly in
this game. `asm/` is the original disassembly, kept because it is the best
executable documentation of the rules; `dungeon.c:NNNN` references throughout this
document are provenance for the TypeScript ports, not a running binary. Where this
section cites behaviour, it cites `web/src/**`.

### 19.0 What is already true, verified

| Fact | Where |
| --- | --- |
| The hero's ordinary key count is `0x98`, the Lion-Head key count `0x99` | `engine/dungeon-items.ts:341,348`; `engine/nav/capabilities.ts:97-99` |
| A key pickup adds one: `flag_16` is an ordinary key, `flag_17` a Lion-Head key | `engine/dungeon-items.ts:339-350` |
| Keys are **items in the entity list**, not a tile and not a flag in the map | the item dispatch is `placeMonsterInProximityAndRunAi`, `engine/dungeon-items.ts:482`, which routes `(m+4) & 0x18 === 0` to the monster AI and otherwise `flags = (m+4) & 0x1f` to an item handler (`0x16`, `0x17`) |
| The entity list is a word pointer at `0xC010`, 16-byte records, `x === 0xFFFF` terminates | `monstersSpawning`, `engine/dungeon-items.ts:542-548` |
| Record layout: `+0` word = column \| row << 8, `+2` row, `+3` relative x once in the proximity window, `+4` flags and size, `+5` active flags, `+7` activation bits, `+15` activation counter | `engine/dungeon-items.ts:485,501,512,556-577` |
| A pickup is forgiving: the hero collects it within four rows and ±4 columns | `checkMonsterAlignedToHeroAndTick`, `engine/dungeon-monsters.ts:123-143` |
| Items already collected are **removed from the list at dungeon init**, from the achievements table at `0xC00C` | `removeAccomplishedItems`, `engine/dungeon-init.ts:75-95`, called from `prepareDungeon` (`dungeon-init.ts:174-176`) |
| The list is built from the MDT's `monsters_offset` block — header word at byte 16 — and **nothing parses that block yet** | `parseCavernMdtHeader`, `engine/mdt.ts:53-63` |
| The search already treats keys as a dimension, but only as something to **spend** | `stateKey` carries `keysOrd * 8 + keysLion`; the door branch refuses when `keysOrd >= caps.keys` (`engine/nav/pathfinder.ts:412-424`) |

So the shape of the work is: **one new generated table, one node attribute, and a
search that can gain keys as well as spend them.**

### 19.1 Stage 1 — extract where the keys are

Build time, in `tools/build-nav.mjs`, emitting a new generated file:

```ts
/** web/src/data/nav/nav-keys.ts — GENERATED */
export const KEY_ORDINARY = 0;
export const KEY_LION = 1;
export interface NavKey { readonly col: number; readonly row: number; readonly kind: 0 | 1 }
export const NAV_KEYS: Readonly<Record<number, readonly NavKey[]>> = { /* mapId */ };
```

The parse is the record layout in §19.0, read from the MDT at
`u16(bytes, 16)` (`monsters_offset`): walk 16-byte records from that offset until a
record whose `x` word is `0xFFFF`, and keep the ones with `(m+4) & 0x1f` equal to
`0x16` or `0x17`. Positions are already hero-standing positions — column and row,
not a tile inside something else — which is the form the graph wants.

**Acceptance, and it is not optional:** the two coordinates the player supplied
must come out of the parse.

| map | cell | kind |
| --- | --- | --- |
| `mp10` | `(99,41)` | ordinary |
| `mp80` | `(150,7)` | Lion-Head |

If the parse does not reproduce both, **the layout is wrong and the file is not
shipped**. This is the whole risk of stage 1 and the reason it is its own stage:
everything after it is straightforward graph and search work, and all of it rests
on one binary format that has never been read by this project. The pickup window
(±4 columns, four rows) gives some slack — a small constant offset in the record
layout would still be *usable* — but it must be the offset that puts the key on
the tile the player says it is on, not merely near it.

### 19.2 Stage 2 — the graph carries the keys

In `buildNavGraph`, after the nodes exist:

- `keyKindAt: Int8Array(nodes.length)` — `0` none, `1` ordinary, `2` Lion-Head — set
  from `NAV_KEYS` by cell. **No new edge kind.** A key stands on the floor, so its
  cell is already a node the hero can walk onto, and `flag_16` fires from
  `checkMonsterAlignedToHeroAndTick` while he is there. The pickup is the walk.
- If a key's cell is *not* a node — an item inside the platform band, or on a cell
  the hero cannot stand on — snap it to the nearest node within one cell and keep the
  offset in a `keySnap` map, so the route shows where he should step. A key that
  snaps nowhere is dropped with a diagnostic count, not silently ignored.
- `diagnostics.keys` joins `keysFound` / `keysOnNodes` so a map whose keys all
  vanished shows up in the tests.

**The accomplished-items filter is run-time, not build-time.** The graph holds every
key in the game; whether one is still lying there depends on the save
(`removeAccomplishedItems` is driven by the achievements table at `0xC00C`). So
`findRoute` gains an option

```ts
/** Whether a key is still on the floor — false when the save says it was taken. */
keyPresent?: (mapId: number, cell: number, kind: 0 | 1) => boolean;
```

defaulting to "all present". The guide supplies one that reads `0xC00C`; the map
screen supplies the same. A cheaper bound that is also sound: the hero cannot hold
more keys than exist, so capping `keysHeld` by `0x98 + keysOnThisRoute` already
prevents a route from spending keys that were never there. The predicate is the
honest one and costs one call per pickup test.

### 19.3 Stage 3 — the route, in the three stages asked for

**3a. The route as if every key were in hand.** One `findRoute` with
`unlimitedKeys: true` — both key ceilings raised, so no door is refused. Count the
doors it used: `lockedDoors` = the hops with `req & (CAP.KEY | CAP.LION_KEY)`, split
by kind. This is also what the map screen should report when it currently says
`The door is locked.`: **"No route found."** becomes **"Needs 1 key."** when stage 3a
succeeds and the key cannot be reached, and the thread's hint line can show the
count before the destination is set.

**3b. One route per key, in nearby maps of the same cavern level.** For
`j = 1..K`, in the order ordinary keys first (they are the common case) and Lion-Head
keys after: the cheapest route from the hero's position to *any* key of the kind
`j` needs, where the search may not leave the set of maps whose `cavernLevel` equals
the hero's (`nav-maps.ts` carries it per map). "Nearby" is expressed as that set,
not as a distance: a key one door away is worth a longer walk than a key across the
cavern, and the cost function already says so. A key route that needs a door of its
own is fine — it may open doors, and those become available to the main route.

If there is no key of the needed kind anywhere on the level, the destination is
refused with **"No key on this level."** — a true and useful answer, and distinct
from "no route".

**3c. Merge into one route.** Two ways, and the plan builds both, in this order:

1. **Concatenation** — what the player described, and it is what the UI should draw:
   the main route with each key route spliced in at the last point the two share,
   pickup included. It is *not* always feasible — a key route's tail may run through
   a door that the main route opens later, so a splice can ask for a key twice. So
   every splice is verified by stage 3a's own test: re-run the merged sequence through
   `findRoute` with the merged key counts and require that it accepts it.
2. **One search over the augmented state** — the sound answer, and simpler to verify:
   state = (mapId, node, keysHeld, keysStillNeeded); entering a key node costs one
   frame and grants a key; the goal is reached when `keysStillNeeded === 0`. This is
   the true optimum, cannot produce an infeasible splice, and degenerates to
   today's behaviour when no key is involved. Its state space is the product of the
   two key counters, which §19.4 bounds.

Both produce `NavRoute` plus `keysGained` / `keysSpent`, so the overlay can draw a
pickup the same way it draws a step — it already does, because the key's cell is a
node on the route.

### 19.4 The search changes

- `stateKey` currently packs `keysOrd * 8 + keysLion` into 6 bits. The new state
  needs `keysHeld` and `keysNeeded` as well, so the key field widens to 12 bits
  (`keysHeld` 0-15, `keysNeeded` 0-7, kind flags in the top bits) and the constant
  that ties it to `mapId` moves with it. **Widen it deliberately and assert the
  bound**, because an unbounded key counter silently collides states and turns the
  search into a wrong answer rather than an error.
- Bounds: `keysHeld ≤ min(0xFF, caps.keys) + keysOnLevel`, `keysNeeded ≤ 8`, and a
  total expansion cap. Hitting any of them falls back to stage 3a's answer, which is
  always valid (it assumes the keys are in hand).
- Costs are unchanged: a pickup is `EDGE_COST.STEP` (1 frame — he walks over it), a
  locked door is `EDGE_COST.DOOR_LOCKED` (44).
- **The guide must re-plan when the key count changes.** Today it invalidates on the
  capability *mask*, and `snapshotCapabilities` only sets `CAP.KEY` when the count is
  non-zero — so 1 → 2 keys is invisible and the guide would keep drawing a route that
  spent the old count. Add `plannedKeys` and `plannedLionKeys` to the invalidation
  set next to `plannedMask`. This is a real bug today, not a stage-3 one.

### 19.5 Files

| File | Change |
| --- | --- |
| `tools/build-nav.mjs` | parse the MDT monsters block, emit keys |
| `web/src/data/nav/nav-keys.ts` | **generated** |
| `web/src/engine/nav/nav-graph.ts` | `keyKindAt` per node, key snapping, `diagnostics.keys` |
| `web/src/engine/nav/pathfinder.ts` | `unlimitedKeys`, `keyPresent`, key nodes grant keys, `lockedDoors` / `keysGained` on the route, widened `stateKey` |
| `web/src/engine/nav/path-guide.ts` | invalidate on key counts; draw the pickup |
| `web/src/ui/map-screen.ts` | "needs N keys", "no key on this level"; the locked-door probe it has now is the first half of this |
| `web/src/locale/*.json` | the two new strings, in all three locales |
| `web/tests/nav-keys-extraction.test.ts` | **new** — stage 1's acceptance |
| `web/tests/nav-graph.test.ts` | keys marked, snapping, accomplished keys ignored |
| `web/tests/nav-pathfinder.test.ts` | the detours, the caps, the fallback |
| `web/tests/nav-route-cases.test.ts` | the named journeys with keys |

### 19.6 Tests, in the order they gate the work

1. **Extraction.** `mp10 (99,41)` ordinary and `mp80 (150,7)` Lion-Head come out of
   the parse; every key in every map lands on a cell that is a node or snaps to one
   within a cell; no key is dropped silently. *Nothing else starts until this passes.*
2. **Graph.** Keys are marked; a key on an unreachable cell is snapped and counted;
   `keyPresent: () => false` makes every key vanish.
3. **Search, synthetic.** A corridor with one locked door and one key beside it: the
   route detours for the key and the door is counted in `keysSpent`. The same corridor
   with the key behind a second locked door needs two keys and takes both. A locked
   Lion-Head door never accepts an ordinary pickup.
4. **Search, caps.** Hitting the `keysNeeded` cap returns stage 3a's route rather
   than a wrong one; the state-space bound is asserted, not assumed.
5. **Named journey.** `mp80 (111,21)` → `mp81 (124,6)` with an empty pocket and the
   Lion-Head key at `(150,7)` reachable: the route detours for it. The same journey
   with the key taken (`keyPresent: () => false`) must refuse — which is today's
   behaviour, and is the reason the two differ.
6. **UI.** The map screen says `Needs 1 key.` rather than `The door is locked.` when
   the key is reachable, and `No key on this level.` when it is not.

### 19.7 What shipped, and what it measures

| stage | where | what |
| --- | --- | --- |
| 1. extract | `tools/navlib/mdt.mjs:readKeys`, emitted `web/src/data/nav/nav-keys.ts` | 17 ordinary keys and 1 Lion-Head key across 12 of the 31 caverns. Both acceptance coordinates reproduced exactly: `mp10 (99,41)` and `mp80 (150,7)` |
| 2. graph | `NavGraph.keyKindAt`, `diagnostics.keysFound/keysOnNodes/keysDropped` | all 18 keys land on a node, none dropped. A key's stored cell is the *item's*, not the hero's — `checkMonsterAlignedToHeroAndTick` accepts him anywhere in rows −2..+1 and columns −2..+1 of it, asymmetric because the engine walks the two axes in opposite directions. `mp10`'s key is stored at (99,41) and the standing position beside it is (99,40) |
| 3a. keys assumed | `findRoute({unlimitedKeys})`, `route.lockedDoors` | the shape of the journey, and how many keys it needs |
| door keys | `tools/build-nav.mjs`, `NavPortal.key` | 0 for an open door, 1 ordinary, 2 Lion-Head — from the door's own open and feature bits. **Getting this wrong marked all 163 doors locked and refused the journey the player drew.** |
| 3b/3c. collect | `findRoute({collectKeys, keyCavernLevel, keyPresent})`, `route.keysGained` | one search over (node, keysOrd, keysLion). Stepping onto a key node grants one; a locked door spends one. The counters are six bits each and saturate, so `stateKey` stays injective |
| screen | `map-screen.ts:choose`, `map.needsKeys`, `map.needsOneKey` | stage 1 with the keys in hand, else stage 2 to learn the requirement, else stage 3 and offer the collecting route — or say the way is locked |
| save | `dungeon-items.ts:presentKeys`, `main.ts` `keyPresent` | read after the dungeon init, which drops collected keys from the entity list, so a route never fetches one that is gone. Asked about the key's **record**, not the node the route walks — they differ on every key in the game, and asking about the node reported every key as collected |

**[measured] The doors were the bug, not the search.** 139 of the game's 163
doors are *open* — walked through for nothing (`enterOpenedDoor`,
`dungeon-doors.ts:110-112`) — and the generator marked **every** door as needing a
key, because it read

```js
key: d.needsLionKey ? 2 : 1        // tools/build-nav.mjs, before this fix
```

as the game's rule. It is not: `open_door` (`dungeon-doors.ts:122-131`) is only
reached for a door that is *closed*, and it spends a Lion-Head key when the feature
bit says so and an ordinary key otherwise. So the correct reading is

```js
key: d.open ? 0 : (d.needsLionKey ? 2 : 1)
```

and the graph then has 22 ordinary-locked doors and 2 Lion-Head ones instead of 163
locked ones. The journey the player reported — mp80 (111,21) to mp81 (124,6) — needs
**no key at all**: 156 hops with an empty pocket, zero closed doors, zero keys
spent. It had been refused for three sessions because the graph insisted on a key
for a door that is simply open.

What the key search is actually for, in this game's data, is the honest version of
the answer the player asked for: the *closed* doors need keys, and those keys are
mostly collected **after** you have walked past them — for `mp80 -> mp82`, the one
closed door out of mp80, the ordinary keys on the far side are mp81 (125,37),
(232,39) and mp82 (26,48), which is exactly the pair the player described gathering.
So a route that needs a key it has not got is a route the player has not earned yet,
and the collecting stage finds nothing in this data: there is no closed door whose
key lies on the near side. The machinery is in place and correct —

| | |
| --- | --- |
| closed ordinary-key door, key in hand | the route is drawn, `keysSpent` counts it |
| closed ordinary-key door, empty pocket | refused, and the screen says the way is locked |
| Lion-Head key offered to an ordinary door | refused (`keysGained.lion` stays 0) |
| the one Lion-Head door, with the key on another level | fetchable — the level gate had to go, or the game's only lion key could never open the game's only lion door |

and a test now pins the data invariant that made this bug visible: every key hangs
on a node, and every one of them on a **different** cell than the record.

The mp84 (16,51) door is the one record whose Lion-Head bit the player says is not
a Lion-Head door: it can only be opened from the far side, once the boss there is
dead. **[measured]** it leads into a map with no door table at all, so no route is
drawn through it in either direction, and from mp84's side the graph refuses it for
want of a Lion-Head key — which is exactly what the game does. No change: the
effect is already right, and inventing a rule to match the description would be
guessing about data rather than reading code.

### 19.7.1 The chevrons stopping

Walking the guide along the drawn route, step by step, and watching
`remaining().length`: it runs the whole way with no early stop — 157 points down to 1
on the mp80 → mp81 route, and all 13 hops of a route west along row 21, which is the
conveyor at (98,21) where the player reports the line stopping. That walk found one
real fault and it is fixed: **arrival threw.** `advanceProgress` nulls the route when
the hero reaches the destination, and `update` then carried on into `needsReplan`,
which dereferences `this.route.points` — an exception out of the per-frame update,
which takes the rest of the frame's work with it.

The symptom the player reports is the one fault I could not reproduce headlessly: the
game's route to (124,6) is not either of the routes the search produces here (its
hero has an accessory that changes what he can jump), so the stopping is somewhere in
a route I have not seen. **Reported: neither message appeared** — so the guide did
not throw and did not retire the route, and the line is lost in the *drawing*, not in
the reveal. Two candidate causes look identical on screen: the per-frame cap, and
cells outside the viewport.

So the display now says what it did, throttled to every four seconds:

```
[path] chevrons: 196 drawn of 156 points, from (111,21) to map24 (124,6), reveal 156 left
```

`drawn of points` distinguishes all three cases at once — equal means the route is
shorter than the screen suggests, a small `drawn` with a large `points` means the cap
or the viewport. A hop whose flight cannot be replayed also logs itself and falls
back to that hop's two ends, so one bad hop cannot cost the rest of the line again.

### 19.8 One thing worth remembering about the pickup window

A key is not on the tile the route crosses. It is where the record says, and the
engine collects from four rows and ±4 columns around that. So two questions look
identical and are not: *which node does the route walk to collect this key* (the
nearest node in the window) and *is this key still on the floor* (the record). The
first is geometry, the second is save state, and asking the second with the first
makes every key look collected — which is exactly what happened, and it presented as
"no route".

### 19.9 What would make this wrong, and how it would show

- **The record layout.** Inferred from `monstersSpawning` and the item dispatcher,
  not from a specification. If the two coordinates do not come out, the layout is
  wrong; the ±4-column pickup window means a *near* miss would still be playable, so
  the test must assert the exact cells, not proximity.
- **Keys per save.** A key the player has already taken is absent from the world,
  and a route that fetches it is a route that walks past nothing. If the guide's
  re-plan on key counts (§19.4) is skipped, this shows as a chevron trail that ends
  at a closed door.
- **Lion-Head keys are rarer than ordinary ones.** A route that needs one and whose
  level has none must be refused with a *specific* message; folding it into "no route"
  hides a real answer.
- **Keys on another cavern level.** Unreachable without a door, which is what 3b's
  restriction encodes. If that restriction is dropped, the search will happily detour
  through a boss arena and come back, and the stage-1 route will look absurd.
- **The state space.** `keysHeld × keysNeeded` is small in practice and unbounded in
  theory. The caps are not optional, and the fallback must be the *sound* answer
  (stage 3a), not a truncation of a search that has already gone wrong.
