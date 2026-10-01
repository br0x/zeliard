# Thread of Yaga — Cavern Pathfinding Plan

Status: **proposed / not started**
Scope: a new consumable magic item that reveals the current cavern group, lets the
player pick a destination, and computes and displays the shortest traversable
route — both on the full-screen map and as chevron tiles over the live cavern
background.

This document is the implementation plan. Everything below was verified against
the port source (`web/src/`), the original disassembly (`asm/fight.asm`,
`asm/dungeon.inc`, `asm/common.inc`) and against the shipped data
(`web/public/game/0/*.mdt`, `tools/GrpViewer/*.grp.unp`). Numbers marked
**[measured]** come from a prototype run over all 31 dungeon maps.

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

Boss rooms and every post-game map (`mp1d`, `mp2d`, `mp3d`, `mp4d`, `mp5d`,
`mp6d`, `mp7d`, `mp8d`, `mp84`, `mp90`, `mpa0`) have **none**. Platforms are an
outdoor-cavern mechanic only, so platform modelling cannot break boss routes.

Many vertical platforms are immobile (a 1-row range) — e.g. `mp10 x=221 y=44`,
`mp20 x=102 y=61`, `mp20 x=157 y=39`, `mp30 x=7 y=50`. Those emit no `RIDE`
edges and behave as plain ledges.

### 2.8 The cavern graph **[measured]**

Decoding all 31 door tables and cutting at `y1 == 0xFF` gives six connected
components. These are the "graphs" of the brief.

| Component | Maps (id: file) | Notes |
| --- | --- | --- |
| **0** | `0:mp10 1:mp1d 2:mp20 3:mp21 4:mp2d 5:mp30 6:mp31 7:mp3d 8:mp40 9:mp41 10:mp4d` | caverns 1–4 incl. boss rooms |
| **1** | `11:mp50 12:mp51 13:mp5d` | cavern 5 |
| **2** | `14:mp60 15:mp61 16:mp62 17:mp6d 18:mp70 19:mp71 20:mp72 22:mp7d 23:mp80 24:mp81 25:mp82 26:mp83 28:mp8d` | caverns 6–8, **13 maps — the worst case** |
| **3** | `21:mp73` | Paguro's hut; entered by the Pureza warp building, not by a door |
| **4** | `27:mp84 29:mp90` | post-game, gated by a Lion-Head key |
| **5** | `30:mpa0` | Jashiin finale |

Totals **[measured]**: 163 doors, of which **15 lead to towns** and **2 need a
Lion-Head key** (`mp60 (31,5) → map 16`, `mp84 (16,51) → map 28`).

Note that the graph does **not** line up with the game's cavern numbering —
`mp30` has a door back to `mp20`, and `mp70` has a door back to `mp60`. The
components above are the ground truth.

### 2.9 Sizes **[measured]**

| Metric | Value |
| --- | --- |
| Total dungeon tiles (31 maps) | 306,048 |
| Largest single map | 320 × 64 = 20,480 (`mp40`, `mp60`) |
| Largest component's tiles | 138,368 (component 2) |
| Rope cells total | ~14,500 |
| Standing/rope nav nodes, permissive model | 25,748 |
| Nav edges, permissive model | ~168,000 |
| Component 2 nodes / edges | 11,436 / 75,645 |
| Platform ride slots (all maps) | 390 + 50 + 1914 = 2,354 |
| **Projected extra edges from platforms** | **~5,000–15,000** |
| Airflow cells (all maps) | 67, in 8 maps |
| **Projected extra edges from airflows** | **~50–200** |

A full-map RLE decode is ≈ 0.5 ms per 20k-tile map; building the whole nav graph
for every map is well under 100 ms of pure JS.

### 2.10 How the map fits the canvas **[measured]**

Integer scale `S = clamp(floor(min(672 / mapWidth, 432 / 64)), 1, 8)`:

| mapWidth | Maps | `S` | Rendered size |
| --- | --- | --- | --- |
| 320 | `mp40`, `mp60` | 2 | 640 × 128 |
| 256 | `mp61`, `mp80`, `mp81` | 2 | 512 × 128 |
| 240 | `mp10`, `mp50`, `mp51` | 2 | 480 × 128 |
| 224 | `mp20` | 3 | 672 × 192 |
| 204 – 196 | `mp30`, `mp31`, `mp70`, `mp71` | 3 | 588 – 612 × 192 |
| 128 | `mp72`, `mp83` | 5 | 640 × 320 |
| 96 – 42 | `mp21`, boss rooms, `mp90`, `mpa0` | 6 | 252 – 576 × 384 |

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

**Measured footprint** **[measured]** — small, and worth stating plainly:

| Map | up / left / right cells | nav nodes in a current | walk edges rejected |
| --- | --- | --- | --- |
| `mp50` | 0 / 3 / 3 | 2 | 0 |
| `mp51` | 0 / 0 / 0 | 0 | 0 |
| `mp70` | 3 / 0 / 0 | 0 | 0 |
| `mp71` | 0 / 0 / 18 | 2 | 4 |
| `mp72` | 2 / 0 / 0 | 0 | 0 |
| `mp80` | 9 / 6 / 3 | 1 | 2 |
| `mp81` | 9 / 2 / 9 | 0 | 0 |
| `mp82`, `mp83`, `mp84` | 0 / 0 / 0 | 0 | 0 |
| **total** | **67** | **5** | **6** |

Zero nav nodes sit inside an up-lift column, because the lift cells that are
actually passable (`0x13` in `mp80`/`mp81`, `0x2A` in `mp70`/`mp72`) are the
bottom of each jet while the tiles above them are solid decoration. The longest
up run is 3 cells (`mp80` col 215, rows 61–63). So in the shipped data this is a
**correctness fix with a negligible graph cost**, not a large feature — but the
lift-through-solid rule is a genuine traversal capability and the
blocking rule is a genuine constraint, so both are modelled rather than ignored.

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

```
dungeon ──(USE ▸ Thread of Yaga)──▶ map screen opens, gamePaused = true
                                          │
                      map strip ◀─────────┼─────────▶ map strip
                                          │
                                  hover / move cursor
                                          │
                                  click a passable tile
                                          │
                             A* over the component graph
                                          │
                     route drawn on the map; item consumed
                                          │
        Esc / Enter ──▶ map closes, gamePaused = false
                                          │
                    chevrons now overlay the live cavern background,
                    starting at the hero's head tile
```

### 3.3 What the map screen shows

- Title bar: cavern name (localized via `t('dungeon.names.<id>')`) and the
  current map name.
- Map strip: one tab per map in the component, with the current map marked.
- The chosen map rendered at integer scale, centred.
- Overlay, back to front: the computed route, doors, town exits (marked, never
  routed through), the hero marker, the cursor.
- Hint line: `t('map.hints')` at the bottom.

### 3.4 Accepting a destination

A click is accepted when it maps to a tile that is a valid nav node (or that can
be projected onto the nearest valid node within a 2-tile radius). Clicks on
walls, water and out-of-map pixels are ignored with a short error blip.

If A* finds no route, the map flashes `t('map.unreachable')` and the route
clears. No path is better than a wrong path.

### 3.5 The route in the live cavern view

After the map closes, the route stays active and is drawn as **chevron tiles
over the background**, beginning at the hero's head. Full specification in §10.

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
  tools/build-nav.ts ────────────▶ web/src/data/nav/*.ts   (generated, committed)
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
| `tools/build-nav.ts` | the build-time extractor |

`web/src/ui/map-screen.ts` deliberately follows the `InventoryScreen` shape
(`ui/inventory-screen.ts:76-86, 181-217, 650-709`) rather than the `Modal`
contract (`ui/modal-manager.ts:13-19`), for three reasons: it needs raw
`KeyboardEvent.code` (not the `KeyA → a` translation), it needs pointer
coordinates (which `Modal` has no channel for), and `ModalManager` allows only
one occupant.

---

## 6. Build-time pre-calculation

`tools/build-nav.ts`, run with `pnpm --filter zeliard-web nav:build` and wired
into `pnpm build`. Output is committed, exactly like `web/src/data/dungeons.ts`,
so there is no build-time dependency for contributors.

### 6.1 `nav-maps.ts`

```ts
export interface NavMapMeta {
    readonly id: number;
    readonly mdtPath: string;
    readonly nameKey: string;          // 'dungeon.names.mp10'
    readonly cavernLevel: number;      // 1..9, drives ice/heat/aggressive damage
    readonly mapWidth: number;
    readonly component: number;        // 0..5, see §2.8
    readonly isBossRoom: boolean;
}
```

`cavernLevel` is read from MDT header byte `0x12`; `isBossRoom` is derived from
the file-name convention `MP<W>D` (`tools/MDTViewer/core/constants.py:165-186`).

### 6.2 `nav-portals.ts`

```ts
export type PortalKeyKind = 0 | 1 | 2;          // 0 none, 1 ordinary, 2 lion

export interface NavPortal {
    readonly mapId: number;
    readonly x0: number;      // door column on this map
    readonly y0: number;      // door row
    readonly toTown: boolean; // y1 === 0xFF — a graph boundary, never routed
    readonly destMapId: number;   // -1 when toTown
    readonly destX: number;   // hero X after the transition  (x1)
    readonly destY: number;   // hero Y after the transition  (y1)
    readonly key: PortalKeyKind; // d_features bit 0
    readonly rokademo: boolean;   // d_features bit 7 — boss exit, one-way
}
```

Both endpoints are pre-normalised to the *standing* position, so the runtime
never re-derives it:

```
from = (x0,    y0 + 1)
to   = (destX, destY + 1)
```

163 portals total; 15 of them carry `toTown: true`.

### 6.3 `nav-components.ts`

```ts
export interface NavComponent {
    readonly id: number;
    readonly maps: readonly number[];              // sorted DUNGEONS ids
    readonly portalPairs: ReadonlyArray<readonly [number, number]>; // indices into PORTALS
    readonly totals: { maps: number; tiles: number; nodes: number; platformRides: number };
}
```

`nodes` and `platformRides` are the measured counts from §2.9, emitted purely so
the runtime can size its buffers before building anything.

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

A position is a node when **all** of these hold, mirroring
`moveHeroRightIfNoObstacles` and `checkFloorForLanding`:

```
!isBlockingTile(tile(x,   y   ))   // head row
!isBlockingTileSimple(tile(x+i, y  )) for i in 1..2
!isBlockingTileSimple(tile(x+i, y+j)) for i,j in 1..2   // body + feet
and  (isBlockingTileSimple(tile(x,   y+3))              // ground under the hero,
   || isBlockingTileSimple(tile(x+1, y+3)))             // per checkFloorForLanding
```

Three node kinds:

- `GROUND` — as above.
- `ROPE` — `tile(x+1, y+1)` is a rope tile and the 3×3 box is free. Rope nodes
  are generated *in addition to* ground nodes at the same coordinate, because a
  hero beside a rope can either stand or climb.
- `RIDE` — the hero is standing on a platform. Generated per §7.5 for each
  platform ride slot, with the platform cell treated as ground.

**[measured]** 25,748 ground/rope nodes across all 31 maps; ~11,400 in the worst
component; ~2,354 ride slots (§2.9).

### 7.3 Static edges

Edges are generated once per map, when the map is first needed, and stored in a
flat array with a per-node offset — a compressed-sparse-row layout.

| `EdgeKind` | From → To | Cost | `req` capability | Notes |
| --- | --- | --- | --- | --- |
| `WALK` | `(x±1, y)` ground node | 1 | — | plain walking |
| `STEP` | `(x±1, y∓1)` | 2 | — | one-tile step up/down |
| `JUMP` | any `(x+dx, y+dh)` node, `dx ∈ [−3,3]`, `dh ∈ [−2,+3]` | `2*2 + |dx| + |dh|` | — | swept-arc validated, see below |
| `JUMP_HIGH` | same with `dh ∈ [−4,…]` | `2*4 + |dx| + |dh|` | `CAP_JUMP_HIGH` | Feruza only |
| `FALL` | first node found dropping from `(x±1, y)` | `1 + dropRows` | — | matches 1 row/tick |
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

**Jump validation.** A `JUMP` candidate is accepted only if:

1. the landing position is a node;
2. every 3×3 box at the apex `(x + dx/2, y + dh)` is free — the hero rises
   before he crosses;
3. the tile directly above the hero's box at `(x+1, y−1)` is free, mirroring
   the engine's ceiling probe at `heroTL − 35` (`dungeon-hero.ts:334`).

Condition 3 is deliberately conservative: the engine probes one column left of
the box, so a route accepted here is always accepted in game, and occasionally a
route is rejected that would have worked. Erring that way is correct for a
guidance tool.

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

**[measured]** With 67 current cells in 8 maps and only 5 nav nodes touching one,
this adds on the order of 50–200 edges in total and rejects 6 walk-edge
candidates. It is cheap to model and would be invisible if missed only by luck,
which is exactly why it is in the plan rather than in a follow-up.

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
  draw the route polyline + waypoint dots
  draw the hero marker
  draw the cursor
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

`web/public/assets/images/path_chevrons.png` — 48×48 cells, 24×24 art, **9
frames**:

| Frame | Direction | Shown as |
| --- | --- | --- |
| 0 | east | `>>>` |
| 1 | west | `<<<` |
| 2 | south | `v` |
| 3 | north | `^` |
| 4 | south-east | `\>` |
| 5 | south-west | `/<` |
| 6 | north-east | `/>` |
| 7 | north-west | `\<` |
| 8 | destination | a ring or cross — drawn on the final waypoint instead of a direction |

Drawn with `drawSheetFrame` (`render/sheets.ts:21-38`) at 1:1 pixel scale, with
`imageSmoothingEnabled = false` already set (`render/canvas.ts:24`).

Colour: a bright cyan-to-white ramp so the chevrons read against every cavern
palette without tinting. Alpha ~0.85 so the terrain stays legible underneath.

### 10.2 Placement

For each route point `i` (from `progressIndex` onward), let
`(x, y)` be the standing position and `(xn, yn)` the next one. Compute the
direction with **cylindrical deltas** — `dx` shortest-path across the map seam,
`dy` shortest-path across the 64-row wrap:

```
dx = ((xn - x + mapWidth / 2) + mapWidth) % mapWidth - mapWidth / 2
dy = ((yn - y + 32) + 64) % 64 - 32
dir = directionOf(dx, dy)
```

- Draw the chevron **at `(x, y)`** — for the first visible point, that is the
  hero's head tile, exactly as the brief specifies.
- Convert map coordinates to viewport coordinates and clip:

```ts
const top   = env.viewportTop();                       // g_mem[0x82]
const left  = heroAbsLeftColFor(x);                    // absolute x
const vx = (x - left + mapWidth) % mapWidth - DUNGEON_VIEW_LEFT_IN_PROX;
const vy = ((y - top) & 0x3f) - 1;
if (vx < -1 || vx >= VIEW_COLS || vy < -1 || vy >= VIEW_ROWS) continue;
drawSheetFrame(ctx, chevrons, dir, 24, 24, 9, vx * TILE_SIZE, vy * TILE_SIZE);
```

  The `- 1` on `vy` puts the first chevron at the hero's head row rather than
  above it, and the `±1` slack lets a chevron scroll half into view instead of
  popping.
- Draw **at most 24 chevrons** — enough to cover the viewport plus a margin, and
  a hard cap on per-frame cost.
- The final waypoint draws frame 8 (destination) instead of a direction.
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

### 10.6 Progress tracking and completion

Each tick, advance `progressIndex` while the hero is within 1 tile of
`points[progressIndex]`, using the engine's own absolute-position expression:

```
absX = (g_mem[0x80] | g_mem[0x81] << 8) + g_mem[0x83] + 4   (mod mapWidth)
absY = (g_mem[0x82] + g_mem[0x84]) & 0x3F
```

— the same expression `enterTheDoor` uses (`dungeon-doors.ts:90-101`). Points
behind the index are dropped, so the array stays short.

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

### 11.2 Jump model is approximate

The engine's jump is a hand-written state machine, not ballistic motion
(`dungeon-hero.ts:319-360`, `dungeon-input.ts:524-600`). The swept-arc model in
§7.3 is conservative by construction, but two known approximations remain:

- The engine's right-move probe is one column short of the hero's leading edge
  and is compensated by `heroInteractionCheck` (`dungeon-hero.ts:274-290`). The
  graph models the ideal case.
- Landing over a hole in the centre column is allowed by the engine
  (`dungeon-vertical.ts:498`). The graph does not model this, so it will
  occasionally reject a ledge-walk that works in game.

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

If profiling still shows a problem, flip `tools/build-nav.ts` to also emit
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

Each phase is independently shippable and independently reviewable.

| Phase | Deliverable | Files | Test |
| --- | --- | --- | --- |
| **0** | Extractor + generated data | `tools/build-nav.ts`, `web/src/data/nav/*.ts` | `tests/nav-data.test.ts`: 31 maps; portal counts match the MDTs **[measured 163 / 15 / 2]**; components match §2.8; attribute tables byte-match `mpp*.grp.unp`; platform counts match **[measured 72 / 21 / 123]**; airflow cell counts match **[measured 67 across 8 maps]** |
| **1** | Map decoding + tile flags | `engine/nav/mdt-grid.ts`, `types.ts`, `attributes.ts` | Round-trip decode against `tools/MDTViewer/core/decoder.py:455-510`; flag classification against a hand table for `mpp1`; airflow precedence (up before left before right) |
| **2** | Platform + airflow model | `engine/nav/platforms.ts`, `engine/nav/airflows.ts` | Travel ranges match a hand-computed case (e.g. `mp10 x=48 y=24 → 24..30`); ride-slot validity for every platform; no boss-room platforms; every lift column resolves; every conveyor run is one-way |
| **3** | Nav graph builder | `engine/nav/nav-graph.ts` | Node counts match §2.9 within 5%; every node has ≥ 1 edge unless isolated; wrap edges at `x = 0 ↔ mapWidth−1`; every `RIDE_V`/`RIDE_H`/`BOARD`/`LIFT`/`CARRY_*` edge has both endpoints valid; no `WALK` into an opposing current; no `FALL`/`JUMP` out of a lift column |
| **4** | Pathfinding | `engine/nav/pathfinder.ts`, `capabilities.ts` | Hand-authored routes for 5 known journeys; key-budget pruning; unreachable returns `null`; no route contains a town portal; a known platform-only shortcut is found; a known conveyor-only shortcut is found |
| **5** | Item + inventory + shop + save (Option D) | `memory.ts`, `game-state.ts`, `inventory-screen.ts`, `indoor-magic-shop.ts`, locale ×3 | Save/load round-trip; an old 256-byte save loads with count 0; buy/sell updates `magicMasksExt` and not `magicMasks`; use decrements `0x4A` and does **not** touch `magicItems`; the shoe forward scan past `0xA5` cannot see the item |
| **6** | Map screen | `ui/map-screen.ts`, `key-router.ts`, `main.ts` | Pointer → tile mapping under a CSS scale; keyboard cursor wrap; `gamePaused` asserted while open; keys do not reach the engine |
| **7** | Chevron overlay | `render/path-overlay.ts`, `main.ts`, `assets/images/path_chevrons.png` | Draw order assertion; first chevron at the hero head; wrap-correct direction at the seam; ride and conveyor slots skipped; clipped to the viewport |
| **8** | Live route + polish | `engine/nav/path-guide.ts`, `locale` translations, README | Recompute on each §10.5 trigger; throttling; overlay clears on arrival; `Q` cancels and a later trigger does not resurrect it |

Phase 8 is the one most likely to need a second pass after real playtesting,
because it is the only one whose behaviour is felt rather than asserted.

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

### A. Cavern graph components **[measured]**

```
C0: mp10 mp1d mp20 mp21 mp2d mp30 mp31 mp3d mp40 mp41 mp4d     (11 maps)
C1: mp50 mp51 mp5d                                             ( 3 maps)
C2: mp60 mp61 mp62 mp6d mp70 mp71 mp72 mp7d
    mp80 mp81 mp82 mp83 mp8d                                    (13 maps)
C3: mp73                                                       ( 1 map, warp-only)
C4: mp84 mp90                                                  ( 2 maps, lion-key)
C5: mpa0                                                       ( 1 map)
```

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

| Map | x | start y | range |
| --- | --- | --- | --- |
| `mp10` | 48 | 24 | 24 – 30 |
| `mp10` | 221 | 44 | 44 – 44 (immobile) |
| `mp20` | 124 | 61 | 52 – 62 |
| `mp20` | 128 | 60 | 51 – 63 |
| `mp21` | 47 | 36 | 32 – 44 |
| `mp21` | 59 | 25 | 14 – 25 |

Horizontal spans wrap the seam, e.g. `mp51 r57 231-11`, `mp60 r18 314-21`,
`mp61 r42 248-12`, `mp71 r29 190-22`.

### E. Airflow tables **[measured]**

Layout: `SEG1_BASE + 0x8024`, four zero-terminated entries per direction, in the
order up, left, right (`ts-memory.ts:144-147`).

| Map | up | left | right | cells U/L/R |
| --- | --- | --- | --- | --- |
| `mp50`, `mp51` (cavern 5) | — | `0x25`, `0x26` | `0x23`, `0x24` | 0/3/3, 0/0/0 |
| `mp70`, `mp71`, `mp72` (cavern 7) | `0x2A` | `0x29` | `0x28` | 3/0/0, 0/0/18, 2/0/0 |
| `mp80`–`mp84` (cavern 8) | `0x13`–`0x16` | `0x12`, `0x1A`–`0x1C` | `0x11`, `0x17`–`0x19` | 9/6/3, 9/2/9, 0/0/0, 0/0/0, 0/0/0 |

No tile appears in two groups in the shipped data **[measured]**, so the
up-before-left-before-right precedence of `getAirflowDirection` is currently
unobservable — but it must still be implemented, because a future tileset edit
that double-lists a tile would silently change its direction.

Passability overlap matters: of the four up tiles in cavern 8, only `0x13` is in
that cavern's passable list (`0x14`–`0x16` are solid). Since a jet's solid cells
sit above its passable cell, the lift is what carries the hero through them —
and it does so unconditionally, which is why lift runs must be collected over
solid tiles too (§6.6).

Total across all 31 maps: **67 current cells in 8 maps**.

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
