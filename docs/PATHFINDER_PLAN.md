# Thread of Yaga — Cavern Pathfinding Plan

Status: **implemented and played** — phases 0–8 shipped; the jump model, the rope
family, the fall, the node rule and the current-carrying rule were corrected against
the engine, and the guide and the chevrons were corrected against a player walking
the route. §18 is the handover: what each correction was, where it came from, and
what it changed. **§19 is built** — the search now goes and gets keys as well as
spending them. **The last correction round is §17's final entry**: a zero-terminated
attribute table read as if it were not terminated, which made every cavern's empty
space into aggressive ground and refused the hero entire maps unless he happened to
own the right shoes.
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

**The three 4-byte tables are zero-terminated**, not count-prefixed: up to three tile
ids, then a `0`. The generated arrays keep that terminator — `mp30`'s aggressive
group is `[29, 30, 31, 0]` — so reading one as a plain list folds `0` in as a member,
and **tile `0` is the void**, which is most of a cavern. The last entry in §17 is what
that cost.
`attributes.ts` reads all three through `terminatedGroup()`, the rule `airflowGroups`
already applied to the three current groups.

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
| dead end | 17 portals | the destination map has **no door table at all**. Boss arenas and Jashiin rooms hold a bare `0xFFFF` sentinel. Enterable, and for an arena no longer leaveable — see §2.8.1 — but for `mp73` / `mp90` / `mpa0` still a terminus. |
| one way | 1 portal | `mp81 (227,59)`, a self-loop shortcut arriving on `mp81 (151,16)` — exactly where a *different* door departs, one that leads to mp82 rather than back |

Modelling the graph as undirected silently welds `mp84`'s island onto the main
group: `mp84` and `mp81` both point at the doorless `mp8d`, and an undirected
walk routes `mp84 → mp8d → mp81`. This was caught during implementation.

So a **component** is a strongly connected component of the linked pairs, and the
map strip additionally offers everything reachable **outbound** — which keeps boss
arenas selectable as destinations:

| Component | Maps | Tiles |
| --- | --- | --- |
| **0** | `mp10 mp20 mp21 mp30 mp31 mp40 mp41` | 112,064 |
| **5** | `mp50 mp51` | 30,720 |
| **7** | `mp60 mp61 mp62 mp70 mp71 mp72 mp80 mp81 mp82 mp83` | 138,368 |
| 1,2,3,4,6,9,10,11,12,13,14 | `mp1d` `mp2d` `mp3d` `mp4d` `mp5d` `mp6d` `mp73` `mp7d` `mp84` `mp8d` `mp90` `mpa0` (each alone) | — |

**15 components in total** **[measured]**, and they are unchanged: the components
are a property of the door *tables*, which still read as empty for an arena. What
changed is the reachable set, because an arena is now a way out as well as a way in
(§2.8.1): from `mp10` you can reach **29** of the 31 maps, and so can every map
except `mp73` (its post-boss door opens onto a town) and `mpa0` (which has no other
door at all).

The graph does **not** line up with the game's cavern numbering: `mp30` has a
door back to `mp20`, `mp70` has one back to `mp60`, and `mp60` has one forward
to `mp5d`. The table above is the ground truth.

### 2.8.1 A boss arena is a passage, and the exit is in the file **[measured]**

> The player: *"You can always assume that boss room has exactly one entrance and
> one exit. Exit door appears dynamically after defeating the boss (check
> accomplished mdt data)."*

An arena reads as doorless because its header's `doors` pointer aims at a bare
`0xFFFF` sentinel — so `readDoors` finds nothing and the room looked like a
terminus. It is not, and the exit is not synthesised out of thin air: it is a door
record in the file, which `load_place_and_reinit` **activates** when the boss dies
(`engine/dungeon-cutover.ts:76-99`, asm/fight.asm:3295-3318):

1. it walks the optional initialiser list at the cavern descriptor — MDT byte 0
   holds the descriptor address, the list starts at descriptor + 8, and it is
   `(address, value)` words ended by an address of `0xFFFF`;
2. an arena's list carries a **`(0xC00A, <door table>)`** entry, so after the fight
   the door-table pointer is swapped for a second list, sitting further into the
   file (mp1d: `0xC1B6`, i.e. one record past the one its header names);
3. then it writes **one word**: `memWrite16(doorsTable + 0, absX)` stamps the
   record's `x0` with the column the hero is standing on — plus 9 if the tile five
   columns to his left is solid, so the door clears his own body.

So every field of the record except its column is file data, and **the column is
the hero's own position**. Ten maps answer, and each one opens back into the cavern
its arena belongs to:

| Arena | Exit row | Opens onto | Lands at |
| --- | --- | --- | --- |
| `mp1d` | 15 | `mp10` | `(141,33)` |
| `mp2d` | 19 | `mp20` | `(190,48)` |
| `mp3d` | 22 | `mp31` | `(174,5)` |
| `mp4d` | 15 | `mp50` | `(25,15)` |
| `mp5d` | 22 | `mp60` | `(14,6)` |
| `mp6d` | 15 | `mp60` | `(28,47)` |
| `mp73` | 15 | a town | — |
| `mp7d` | 15 | `mp80` | `(57,6)` |
| `mp8d` | 15 | `mp84` | `(16,52)` |
| `mpa0` | 15 | `mpa0` itself | `(36,39)` |

**[measured]** each landing is a standing position on a door of the far map that
leads back into the arena — the exit is the exact reverse of one of the arena's own
entrances. That is what makes an arena a *passage*: walk in on one side, kill the
thing, come out on the other. `mp1d` is the clearest: `mp10 (26,15)` walks the hero
in at `(27,15)`, and the door that appears when the boss dies puts him on `mp10
(141,33)` — the far side, six columns from `mp10 (128,32)`, a town door.

Because the column is written at runtime, the exit belongs to **every standing
position on row `y0 + 1`** — the row `enterTheDoor` matches on
(`heroAbsY - 1 === y0`, `engine/dungeon-doors.ts:90`) — not to the one column the
file happens to name. mp1d has 43 such nodes and the hero may leave from any of
them.

All ten exits are already open (`d_flags` bit 7) and carry no key bit, so the fight
is the only cost. `mpa0` is the one exception to "opens into the cavern": its exit
opens onto `mpa0` itself, and since it has no other door there is nothing to pair it
with.

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

**The route may leave the cavern the destination is on, and usually must.** These
caverns are not one connected space each: `mp30`'s 978 nodes split 244 / 734, and
`(185,19)` and `(161,54)` are on opposite sides of that split with eleven doors to
`mp31` between them. A same-map destination can therefore be a cross-map journey, and
the chevrons will show it walking out of a door and back in. That is the honest
shortest route, not a detour — but it means **every map the route could use must be
in memory before the search runs**, because the game only downloads the cavern the
hero stands in and `findRoute` skips any door whose destination graph is missing.
Without that, every such destination reports `No route found.`

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

The same module carries the ten post-boss doors of §2.8.1, which are **not**
portals because they have no column:

```ts
export interface NavBossExit {
    readonly mapId: number;      // the arena
    readonly y0: number;         // d_y0: the hero stands on row y0 + 1 to use it
    readonly toTown: boolean;    // mp73's opens onto a town, so it is never routed
    readonly destMapId: number;
    readonly destX: number;
    readonly destY: number;
    readonly key: PortalKeyKind; // every one of them is 0
    readonly rokademo: boolean;
    readonly exitFacesLeft: boolean;
    readonly color: number;
}
export const NAV_BOSS_EXITS: readonly NavBossExit[];      // 10 entries
export const NAV_BOSS_EXIT_BY_MAP: readonly number[];      // index per map id, -1
```

`deadEnd` above therefore reads "the far map's door table is empty", which is still
true of every arena; whether the hero can get back out is the boss exit's business.

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
| 3 | `SLOPE_LEFT` | tile in `slopeLeft`, up to the terminating zero |
| 4 | `SLOPE_RIGHT` | tile in `slopeRight`, up to the terminating zero |
| 5 | `AGGRESSIVE` | tile in `aggressive`, up to the terminating zero |
| 6 | `AIRFLOW_UP` | resolves to an up current (checked first) |
| 7 | `AIRFLOW_LEFT` | resolves to a left current |
| 8 | `AIRFLOW_RIGHT` | resolves to a right current |

One flag bit each, because the three directions have different rules (§2.12).
A tile listed in two groups takes the first, exactly as
`getAirflowDirection` does.

`nav/attributes.ts` builds a 64-entry lookup per cavern once, so classification
is a single array read.

The three 4-byte groups are read through `terminatedGroup()`, which stops at the
zero that ends them (§2.3). This is not a formality: **tile 0 is the void**, so a
terminator read as a member classifies every empty cell as slope and as aggressive
ground. The last entry in §17 has the numbers.

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
- A boss arena's post-boss door (§2.8.1) is an ordinary `DOOR` hop, offered from
  every standing position on the door's row rather than from a single column. It
  goes through the same code as a portal — same key spending, same cost — because
  the game spends a key the same way for either.

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

**Re-plan against the mask the route was planned with, not the one the hero wears.**
The map screen accepts routes planned with `planAccessories`, which searches as
though every shoe were available, and a hero who does not own those shoes cannot walk
it as planned. Re-searching with his real mask finds nothing, and the guide read that
as "the goal became unreachable" and cleared the route on its first tick — before a
single chevron drew. So when the active route carries equipment, the re-plan and the
mask comparison both use `caps.mask | SHOE_MASK`. `bare | SHOE_MASK === shod |
SHOE_MASK`, so this is stable across the moment the player puts the shoes on. Keys are
*not* in that union: a key is something he picks up, not something he puts on.

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
| **3** | Navigation graph — **done** | `engine/nav/nav-graph.ts`, `jump.ts`, `geometry.ts` | 28 invariant tests over all 31 caverns plus the differential suite. **[measured] 29,917 nodes / 1,222,289 edges, all 31 caverns built in 1.1 s, 235/236 lifts and 216/288 conveyors reachable.** No `WALK` into an opposing current; no `FALL`/`JUMP` out of a lift; no fall into a current; **every jump edge is one the model produces**; a jump crosses no further than the frames it takes; no self-edges; CSR consistent. The jump model itself is the engine's, proved against it — see §18. **A flight descends only in the direction it was launched**: up+right comes down right, up+left comes down left, and no flight reverses sideways after the apex, because the hero holds one key for its length. **A rope exit is two tiles**, because the hero's head is centred over the rope and the cliff edge is the cell past it; blocked to one tile, he falls holding the same key, so a rope descent never drifts against the direction he stepped. **Every jump costs two ticks more than its flight**, so a walk is preferred wherever one exists |
| **4** | Capabilities + A* — **done** | `engine/nav/capabilities.ts`, `pathfinder.ts`, plus `nodeHazard` on the graph | 32 tests, plus: **a vertical lift is ridden in both directions** (`RIDE_V` follows `slot.prev` as well as `slot.next`; a lift that could only be ridden down was a dead end), and **any rise whose feet touch a slope demands Silkarn**, keyed on the single cell the engine probes; dead ride slots 194 → 185, plus a change in §18: the component flood now honours the hero's capabilities, so it picks a goal the hero can actually reach. **[measured] same-cavern route ~1 ms, cross-cavern ~31 ms.** Lion-Head door refused without a key and opened with one, spending exactly 1; bare hero kept off aggressive ground and Pirika shoes allowed across; a town door is never an edge; a route never leaves the start map's reachable set; cost equals the sum of its hops; determinism |
| **5** | Item + inventory + shop + save (Option D) — **done** | `memory.ts`, `game-state.ts`, `inventory-screen.ts`, `indoor-magic-shop.ts`, `path_items.png`, locale ×3, `main.ts` | 20 tests. Save round-trip and byte-exact save image; a save without the feature marker reads as not owned **whatever it holds at 0x4A**; buying and selling move the counter and the extended stock bit, never the generic array; using one copy leaves all five generic slots byte-identical; the addresses cannot be reached by the 0xA1..0xFF forward scans |
| **6** | Map screen — **done** | `ui/map-screen.ts`, `key-router.ts`, `main.ts`, `NavGraphStore.load`/`gridOf` | 23 tests. All 31 caverns fit at an integer scale and stay centred; tile round-trip survives a 0.5×–2.25× CSS scale; cursor wraps on both axes; key repeat does not skip maps; **no route is drawn** (`draw(now)` takes no route and the class has no route accessor); a point that cannot be routed leaves the screen open; Escape and an outside click return without a route; **the whole reachable set is loaded before a route is searched**, so a destination in another chamber of the same map is found rather than reported unreachable |
| **7** | Chevron overlay — **done** | `render/path-overlay.ts`, `main.ts`, `assets/images/chevrons.png` | 25 tests. The sheet is 5x24x24 and the frame order is asserted from the PNG header; cardinal, seam and diagonal directions all correct; dormant while a menu is open; route cleared on arrival; **one chevron per cell, so a nine-column jump draws nine arrows and the line has no gap**; per-frame cost independent of route length |
| **8** | Live route — **done** | `engine/nav/path-guide.ts`, `key-router.ts` | Re-plans on capability, key-count, component, drift (>3 tiles) and a 20 s refresh; throttled to 500 ms; `Q` cancels only in an unpaused cavern; an unreachable goal drops the route rather than drawing a wrong one; **no re-plan is attempted while the hero is on no node**, so a jump over a gap no longer deletes the route; **a shoe-dependent route re-plans against its own mask**, so re-planning cannot delete what the map screen accepted; **F7 clears the route** |

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
pair, plus a boss arena's post-boss door (§2.8.1) — **[measured]**:

| From | Maps | From | Maps |
| --- | --- | --- | --- |
| `mp10` | **29** (everything bar `mp73`, `mpa0`) | `mp84` | 3 (`mp84` `mp8d` `mp90`) |
| `mp50` | **29** | `mp73` | 1 |
| `mp80` | **29** | `mpa0` | 1 |

An arena is a passage, so nearly every cavern now reaches nearly every other.
Before §2.8.1 the figures were 11 / 4 / 14: the arenas were dead ends, and the
only way from one cavern group to the next was a normal door. `mp84` is the one
island left — its only doors point at `mp8d` and `mp90`, and `mp8d`'s exit brings
the route straight back to `mp84`.

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

### Phase 1b, 7 and 8 corrections — a route the player walks every day

The player: at `mp30 (185,19)`, used the thread for `(162,55)` on the same map, and
**no chevrons appeared at all**. Not a broken line, not a wrong direction — nothing.

There were two independent defects, and the first one I fixed was the *second* one.

#### The real cause: a zero terminator read as a tile id

The report was that the route could not be found. It could not, and the reason was
that the hero was treated as unable to walk his own cavern.

The slope and aggressive tables are **zero-terminated 4-byte groups** (§2.3), and the
generated arrays keep the terminator — `mp30`'s aggressive group is `[29, 30, 31, 0]`.
`NavTileClassifier` built its sets straight from those arrays:

```ts
const slopeLeft  = new Set(tables.slopeLeft);      // {27, 0}
const aggressive = new Set(tables.aggressive);     // {29, 30, 31, 0}
```

`0` is a fine `Set` member and a terrible tile. **Tile 0 is the void** — it is 8,478
of `mp30`'s 13,056 cells, the open air of the cavern. So:

| | |
| --- | --- |
| tile `0` gained | `SLOPE_LEFT`, `SLOPE_RIGHT`, `AGGRESSIVE` |
| `nodeHazard` scans each node's whole 3×3 footprint | and nearly every node has void tiles in it |
| so | **every node on the map** got `HAZARD_AGGRESSIVE` |
| and `permitted()` refuses to *enter* an aggressive node without `CAP.GROUND_SAFE` | Pirika shoes |

With an empty pocket and no shoes the search could not enter a single node on `mp30`,
so it found no route — a cavern the player has crossed many times. **19 of the 31 maps
were affected**, every one that declares an aggressive group longer than three tiles.

**[measured], all 31 caverns:**

| | before | after |
| --- | --- | --- |
| nodes | 29,917 | **29,917** (unchanged — node generation reads blocking, not hazard) |
| edges | 1,081,449 | 1,080,257 (−1,192 slope edges that tile 0 had invented) |
| aggressive-hazard nodes | 16,995 | **884** |
| slope-hazard nodes | 26,562 | **210** |

`terminatedGroup()` stops at the terminator, which is the rule `airflowGroups` had
always applied to the three current groups three functions above. The slope test in
`nav-attributes.test.ts` had *known* about the padding and filtered it; the aggressive
test two cases below did not, and so **asserted the bug** — it iterated the raw array
and required the terminator to classify as aggressive. Both now skip padding, and a
new test requires that tile 0 is never a slope and never aggressive on any of the 31
maps.

The lesson is the same one the file already records twice, in a new place: **a
terminator is not a value.** The airflow tables are zero-terminated too, and the code
that reads them says so explicitly; the three tables beside them did not, and nothing
about the shape of the array says which convention it follows.

#### The second cause: a shoe-dependent route dropped on its first tick

With the terminator fixed, stage 1 of the map screen's search finds the bare route and
nothing is wrong. But `planAccessories` (§18, "The route should say which shoes it
needs") means a route *can* legitimately be planned against an augmented mask, and that
route was then destroyed before a frame was drawn.

`PathGuide.tick` re-planned against the hero's **actual** capabilities:

```ts
const next = findRoute({ store, caps, start, goal });   // caps = what he wears
if (!next) { this.clear(); }                             // "the goal became unreachable"
```

A route planned with `planAccessories: true` was searched with `caps.mask | SHOE_MASK`,
so re-searching bare found nothing — and the guide read that as the world having
changed and cleared the route. On `mp30` this was hidden behind the terminator bug;
it was still live, and still killed the 148-hop Feruza route that genuinely needs
those shoes.

The fix plans against the same mask the route was planned with, whenever the active
route carries equipment:

```ts
const wantsShoes = (this.route.equipment?.length ?? 0) > 0;
const planCaps = wantsShoes ? { ...caps, mask: caps.mask | SHOE_MASK } : caps;
```

`recordPlan`/`needsReplan` then compare against that same mask, so the drift check
does not see a shoe-dependent route as drifted. It stays correct once the hero actually
puts the shoes on, because `bare | SHOE_MASK === shod | SHOE_MASK`.

`SHOE_MASK` is now exported from `pathfinder.ts` rather than restated, so the map
screen and the guide cannot disagree about what "counting on the shoes" means.

#### What the player's own route is

The bare `mp30 (185,19) -> (161,54)` is **176 points with no equipment** — no shoes, no
keys, `WALK`/`STEP`/`JUMP`/`CLIMB`/`FALL` only. The 148-point route the search
preferred *with* every shoe was not better; it was the cheapest route through a
hazards table that claimed the whole cavern was lava. Removing 1,192 impossible edges
and 16,111 phantom hazards made the honest route the cheap one.

#### The third cause: the screen never fetched the caverns a route needs

The bare route was still refused after the two fixes above, and this one was not in
the model at all — it was in what the game had **in memory**.

`mp30 (185,19) -> (161,54)` has **no path that stays inside `mp30`**. The two cells
are in different chambers, and **[measured]** the map's 978 nodes split 244 / 734
between them. The way through is `mp31`, which `mp30` reaches through **eleven** doors.
The honest shortest route is therefore 176 points that leave `mp30`, cross to `mp31`,
and come back — `route.maps` is `[5, 6, 5, 6, 5]`.

The game only downloads the MDT of the cavern the hero is standing in. `MapScreen`
loaded the map **on screen** — the one the player is looking at, for the raster and
the cursor — and nothing else, so `store.get(6)` returned null, and `findRoute`
silently skips any door whose destination graph is missing:

```ts
const dest = store.get(portal.destMapId);
if (!dest) continue;                    // dungeon not downloaded: door invisible
```

Every route that had to leave the cavern was therefore reported **`No route found.`**
for a journey that exists, one door away from being found. This is not a rare shape:
it is every destination in a different chamber, which in these caverns is most of them.

**Fix.** `MapScreen` now loads the whole reachable set — `ensureComponent()`,
memoized, kicked off in `enter()` so it runs while the player reads the map, and
awaited in `choose()` so the search never races it. `choose()` became `async` for
this, and re-checks after the await that the map on screen is still the one the
snapped node came from, since a browse can change it mid-wait.

**[measured]** for the reported trip the fetcher now pulls maps
`0,1,2,3,4,6,7,8,9,10` — the whole reachable set bar the one already in memory — and
returns 176 points, no equipment, no keys.

#### A third lesson

Every test in this file loaded MDTs from `web/public/game/0/`, so **every map was
always available** and no test could see this. It is the same substitution mistake as
§17's `getGmem().slice()` finding, one level up: not the wrong bytes but the wrong
*availability*. A store that can answer for every map is a fixture, and a fixture more
capable than the real thing hides exactly the bugs that are about capability.

The guards for this defect are `nav-mp30-cross-map.test.ts` — a store that serves only
the current cavern and fetches the rest, exactly as `main.ts` wires it. It reports
`expected [] to have a length of 1` with `await this.ensureComponent()` removed.

#### The fourth and fifth causes: an uphill step the slope gate missed, and a lift that only went down

The bare trip still failed after the three above. Two more defects, both in the edge
generators, and the second is why this report is long.

**Uphill over a slope carried no requirement.** The route the search produced crossed
the `/` slope at column 151, rows 59-61, with a `STEP` `(50,59) -> (51,58)` and a
`JUMP` `(51,58) -> (54,56)` that both claimed `req=0`. The player correctly reported
that it cannot be walked in boots.

`SLOPE_UP` was gated on Silkarn, but it only fires when the slope tile sits in the
column the hero steps *into*. These two edges cross a slope lying under his *feet*, so
the step and jump generators never saw it — and §7.3 already says climbing a slope is
a Silkarn move. The engine agrees: `slope_assist_on_landing`
(dungeon-vertical.ts:563-599) slides the hero down every fourth tick unless he holds
uphill, and `check_silkarn_shoes_and_slopes` is what stops the shove while he is
airborne. The rule now lives in `add()`, keyed on **the one cell the engine reads** —
`getSlopeDirectionByTileUnderFeet` probes the middle foot, `heroCoords + 2*36 + 1`, so
two cells and not nine — so no generator can forget it:

```ts
const ascentOverSlope = (fromCol, fromRow, toCol, toRow) => {
    if (toRow >= fromRow) return false;          // level or downhill: sliding helps
    return boxTouchesSlope(fromCol + 1, fromRow + 2)
        || boxTouchesSlope(toCol + 1, toRow + 2);
};
```

Asking about the whole 3×3 would have gated every rise that merely passes near a
slope, which is a different and much worse error. Both offending edges now read
`req=4`.

**A vertical lift could only be ridden down.** This is the one that mattered. mp31 has
a lift at **column 5**, `startY 26, topY 0, bottomY 26`. The hero boards it the way
the player described — *"short jump left+up"*, because the lift's lowest position is
one tile above the ground he stands on — then presses Up and rides to the top.

Vertical platforms are static until the hero is aboard and drives them, and `chain()`
links every adjacent pair **both** ways, setting `next` and `prev`. But the graph only
ever followed `next`:

```ts
for (const [next, kind, cost] of [
    [slot.next, slot.kind === 2 ? EDGE.RIDE_H : EDGE.RIDE_V, ...],
] as [number, number, number][]) { add(index, rideOf[next]!, kind, cost); }
```

`next` walks the chain in **one** direction, and for a lift that direction is *down*.
`(5,23)` — the boarding slot — had no edge to `(5,22)` or anything above it, so the
lift was a dead end, and with it the only way into mp30's destination chamber.
`RIDE_V` is now emitted from `slot.prev` as well, but **only for `PLATFORM_VERTICAL`**:
a collapsing platform descends and never rises (dungeon-vertical.ts:472-484), and a
horizontal platform is fully automated, so the hero can always wait for it to come
back and one direction already spans both.

**[measured]** dead ride slots across all 31 caverns: **194 → 185**.

#### The route the player walks

**216 points, no equipment, no keys**, `maps [5, 6, 5, 6, 5]`:

| | leg | |
| --- | --- | --- |
| 1 | mp30 `(185,19)` → door `(22,24)` | walk right, jump right |
| 2 | mp31 `(22,24)` → `(5,23)` | walk left, **short jump onto the lift** |
| 3 | mp31 col 5 `(5,23)` → `(5,0)` → `(5,63)` | **ride the lift all the way up**, `RIDE_V` × 23 |
| 4 | mp31 → door `(47,15)` → mp30 | walk right, fall |
| 5 | mp30 `(47,15)` → rope → door `(88,7)` → mp31 | walk right, climb the rope at column 57 |
| 6 | mp31 `(88,7)` → door `(114,7)` → mp30 | walk right |
| 7 | mp30 `(114,7)` → `(161,54)` | walk right to `(132,7)`, **climb the col-133 rope** to `(132,1)`, fall, walk right to `(144,1)`, **climb the col-145 rope** over the seam to `(144,54)`, walk right |

mp30's 978 nodes split 244 / 734 between the hero's chamber and the goal chamber, so
the journey must leave `mp30`. It uses mp31's lift to get back up and returns through
a fourth door.

#### Tests

- `nav-route-cases.test.ts` — every uphill edge out of mp30 `(50,59)` carries
  `CAP.SLOPE_STAND`; the full trip resolves bare with `maps [5,6,5,6,5]`, no
  equipment, riding a `RIDE_V` and climbing both ropes; and a bare hero routed from
  `(50,59)` to `(54,56)` goes *round* rather than over the slope.
- `nav-graph.test.ts` — the dead-ride-slot count, 194 → 185.
- `nav-mp30-cross-map.test.ts` — the whole trip through a store that serves only the
  current cavern.

**Gates:** `tsc --noEmit` clean; full suite **877/877** across 63 files.

#### The sixth cause: a jump flew both ways

The player drew a route and pointed at two hops where the guide used a jump where
walking would do — at `(193,19)` and again at `(203,21)` — and at a diagonal move
the search called impossible that the hero can make.

**A jump tied with walking, so it won.** The cost of a jump edge is the number of
frames the flight takes, and the hero covers a column per frame — so a jump crossing
*n* columns costs about *n*, exactly what walking those *n* columns costs. The search
was therefore free to prefer the jump, and did: it hopped `(193,19) -> (200,21)`
across a staircase of `STEP`s and `WALK`s the hero simply walks down. Every jump now
carries `JUMP_TICK_PENALTY` on top of its frames, which breaks the tie without
making a jump across a real chasm lose to a long walk around it. Both hops now walk.

**A descent could change direction mid-air.** This is the one that was wrong in the
model rather than in the cost. The jump went up in the direction it was pressed and
came down at 45 degrees **in that direction** — up+right descends right, up+left
descends left — because the hero holds one key for the length of the flight. The
descent branched left, straight and right on *every frame*, so it described arcs that
weave: three frames east and five west. No such flight exists. `descend` now takes
the launch direction and never changes it, and `flight` runs three of them per rise —
straight, locked left, locked right. The union is still every flight the hero can
fly, because which one he performs is his choice at take-off; each one on its own is
real.

The differential tests against the engine caught the first attempt at this as a
**false** failure, which was informative: the descent dedupe is generation-scoped, so
the second and third locked descents were thrown away by marks the first left behind.
The seen set is now one lane per steer.

**[measured]** edges across all 31 caverns: **1,080,257 → 1,029,620**. The ~50,000
edges that went are the zig-zag flights.

#### Tests

- `nav-jump-differential.test.ts` — **new**: over every traced flight, the descent
  from the apex never reverses sideways. This is the guard that was missing: the
  existing comparison only asserts the *engine's* landings are a subset of the
  *model's*, so a model offering more than the hero can fly passes it happily.
  Verified to fail with the lock removed.
- `nav-graph.test.ts` — the edge projection, 1,080,257 → 1,029,620.

**Gates:** `tsc --noEmit` clean; full suite **878/878** across 63 files.

#### The seventh cause: a rope that steered on the way down

Still a long diagonal descent, this time off a rope. The player is right that it is
impossible, and it was the last place the hero could be moved sideways without
choosing to be.

Leaving a rope is **one step sideways and then straight down**.
`dungeon_finish_rope_frame` (dungeon-states.ts:248-283) clears `UP_FLAG` and hands
him back to `DUNGEON_STATE_NORMAL` before the frame ends, so he is *standing* where
he stepped rather than airborne — and nothing reads a direction for him on the way
down. The model was searching the full steering fall from a rope node, which is the
right search for stepping off a **ledge** and the wrong one here:

```ts
addFalls(index, node.col + dir, node.row, there);          // was: full steering fall
addFalls(index, node.col + dir, node.row, there, STEER_STRAIGHT);
addFalls(index, node.col, node.row, -1, STEER_STRAIGHT);  // and off the foot of it
```

`landingsFrom` grew a steer mask — `STEER_ALL`, `STEER_LEFT`, `STEER_RIGHT`,
`STEER_STRAIGHT` — and `flight` runs only the descents it permits. Ledge falls, ride
drops and jumps keep the full set; rope exits get the straight one.

**[measured]**

| | before | after |
| --- | --- | --- |
| mp30 rope-exit edges | 13,387 | 1,843 |
| mp30 rope exits drifting ≥ 4 columns | 6,874 | **0** |
| mp31 rope-exit edges | 8,327 | 1,676 |
| mp31 rope exits drifting ≥ 4 columns | 3,685 | **0** |
| edges, all 31 caverns | 1,029,620 | **814,545** |

Lateral 2 is the one step, not a drift: the rope is the hero's *middle* column, so
stepping off it to the right moves his cell two columns.

The two routes already checked still resolve with no shoes — `mp30 (185,19) →
(161,54)` at 230 points through the same four doors and the same lift, and
`(185,19) → (176,50)` at 22 points walking the staircase.

#### Tests

- `nav-graph.test.ts` — **new**: no `FALL` out of a rope node moves more than two
  columns sideways, on any of the 31 caverns. Verified to fail with the mask removed
  (`mp10 rope (27,0) -> (24,4) drifts -3 columns`).

**Gates:** `tsc --noEmit` clean; full suite **879/879** across 63 files.

#### The eighth cause: a flight that changed direction, and a rope measured in one tile

Two more, both in the same area of the model.

**The rise and the descent were two separate choices.** Locking the descent was not
enough, because the *rise* still searched sideways in both directions and every rise
end was offered all three descents. So the model produced a flight that went up two
rows **and to the right**, then descended 22 columns **to the left**:

```
(2,21) (3,20) (4,19) (5,19) (4,20) (3,21) (3,22) (3,23) (3,24) (2,25) (1,26) (0,27) (203,28) … (184,47)
```

One lateral intent now governs the whole flight: the direction the hero holds from
the instant he presses jump until he lands. `collectStarts` takes the same `steer`
the descent does, and `flight` runs rise and descent together per intent rather than
attaching three descents to every rise. The rise may drift in that direction where it
can and rises straight where it cannot — the same rule the descent follows.

**A descent could straighten and then turn.** Even with the direction locked, the
descent still offered "straight down" as a *free alternative* to the lateral step on
every frame, so a flight could slide down several rows of open air and then start
drifting. Holding a key, the hero moves that way or is stopped —
`on_left_pressed` calls `initOnGround` and returns when the step is blocked
(dungeon-vertical.ts:127-136) — he does not get to choose. Straight is now the
fallback when the step is blocked, never an alternative to it.

**A rope was measured in one tile, and it is two.** The rope's head is centred over
the rope, so the rope is the hero's *middle* column and the cell he lands on by
stepping is the one **past** it — the cliff edge. A one-tile exit only reaches the
rope's own column, which is not a standing position. All three rope exits in the game
are shaped exactly this way:

```
mp80 r10   ###.R|NNNNN     rope node 90,  rope 91,  ledge from 92
mp30 r 7   ...R|NNNNNN     rope node 57,  rope 58,  ledge from 59
mp80 r11   #NN.R|NNNNN     rope node 156, rope 157, ledge from 158
```

Modelling it as one tile had quietly severed mp80's gallery crossing, mp80's second
rope and mp30's row-7 ledge — eleven tests, including two journeys the player had
drawn himself. Where a wall denies the two-tile move he takes one and then falls
**holding the same key**, so the drift is in the direction he stepped and never the
other.

#### The journeys, all bare

| journey | before this round | after |
| --- | --- | --- |
| `mp30 (185,19) → (162,55)` | **no route** | 230 points, no equipment, `maps [5,6,5,6,5]` |
| `mp30 (185,19) → (176,50)` | 21 points, one impossible leg | 21 points, no impossible leg |
| `mp80 (113,21) → (151,6)` | no route | route found, touches no rock |
| `mp80 (111,21) → mp81 (124,6)` | no route | route found, no closed doors |

**[measured]** edges, all 31 caverns: 598,373 → **533,372**.

#### Tests

- `nav-graph.test.ts` — rewritten: a rope `STEP` moves at most two columns, and a
  rope `FALL` at most three plus one per row of descent. Verified to fail with the
  two-tile move removed.
- `nav-jump-differential.test.ts` — two invariants over every traced flight: the
  descent never reverses, and a straight drop only happens where the sideways step was
  blocked. Both verified to fail against the code they replace.
- `nav-graph.test.ts` — the counter-current check now reads its direction from the
  **signed** column delta. Testing `node.col + 1 === target.col` cannot express a
  two-tile exit, so it called every rightward rope exit leftward and flagged the very
  currents the hero was moving *with*.

**Gates:** `tsc --noEmit` clean; full suite **880/880** across 63 files.

#### A fourth lesson

Two of the five defects were edges that existed but pointed one way, or claimed a
requirement they did not have. Neither shows in a route's *shape*: a 176-point route
looks exactly as convincing as a 216-point one. Printing it exposed both — hop 77 had
no `req`, and the `RIDE_V` chain visibly ran one way. **Print the route, and print the
requirement on every hop.** A merely *plausible* route is the failure mode, because
the search will always hand you one.

#### A ninth cause: a platform was a place, not a thing

The report this round was a single hop: `mp80 (6,37) → (1,33) JUMP_HIGH`. The vertical
lift at column 1 rests at its default row, three solid tiles at `(1,34) (2,34) (3,34)`,
and the arc went straight through `(3,34)`.

Chasing it turned up the real problem, which is that **a moving platform was modelled as
a place rather than a thing.** Everything about one was baked into the map at build
time: its whole travel range minted ride slots, every one of those slots was treated as
a landing surface, and no tile anywhere was marked solid. So the search could land the
hero on a platform three rows from where it stood, and fly through the three tiles that
were actually there.

What the game does:

- Entering a cavern through **any** door resets every vertical and collapsing platform
  to its `startY`. It is the engine's own state, not map data.
- A platform is **three solid tiles**. A platform tile stops `is_blocking_tile_simple`
  and passes `is_blocking_tile`, so it blocks the body and feet rows and lets the head
  through — which is how the hero rises onto one from underneath.
- He comes down on it **only from the top**, and only where it is standing right now.
  Every other row of its travel is somewhere he can be *carried*, never somewhere he
  can jump.
- Once he has driven it, it stays where he left it until the cavern is entered again.

So the model now reads the live row of each platform out of `g_mem` — the lists at
`0xc004` and `0xc006` hold three-byte `{ absX word, y byte }` entries terminated by
`absX === 0xffff`, the same walk `render_vertical_platforms_to_proximity` does
(dungeon-platforms.ts) — and three things follow:

- `PlatformModel.restingCells` marks the tiles each platform currently occupies as
  `BLOCK_BODY`, so they stop a flight exactly as the map's own rock does. The tile grid
  cannot say so: the cell a platform is standing in is ordinary empty air in the MDT.
- `PlatformModel.places` records the row each platform was found at, and
  `isLandingSlot` makes only that row a landing surface.
- `NavGraphStore.setPlatformPlaces` compares the live rows and **rebuilds** a cavern's
  graph when they differ, and `PathGuide` re-plans on that alone — no refresh interval,
  because a platform the hero is riding moves every row he climbs.

**A horizontal platform is deliberately in none of the three.** It sweeps its span
continuously and the hero can wait for it, so it has no "where it is standing": pinning
one column would draw a wall that is gone a frame later and that nothing rebuilds the
graph for, while dropping the rest as landing surfaces would deny a landing he can
genuinely wait for. Every column of a span stays a landing surface, as before.

**[measured]** the reported hop — every edge from mp80 `(6,37)` into the column 1 lift:

| | edges into the lift |
| --- | --- |
| before | `JUMP_HIGH (1,36) (1,35) (1,34) (1,33)` — four landings on rows it is not at |
| after | none |

**[measured]** the whole game: edges 533,372 → **525,046**, nodes unchanged at 29,917.
The 8,326 that went are jumps that flew into, or landed on, a platform standing
somewhere else. Ride slots with no entry at all: 5,404 → **5,403** — one, and one is
the honest answer: `chain` already gives every slot of a multi-row platform an entry by
riding, so landing was only ever the entry for a platform with a single rideable row.

**And the mp30 trip the player walks is untouched**: 230 points → 231, cost 307 either
way, `maps [5,6,5,6,5]`, no equipment, still riding the column 5 lift from `(5,23)` to
`(5,1)`.

#### The same round, second pass: a ride is not a re-plan

The first cut of the platform work **made the chevrons disappear the moment the hero
rode a lift.** Two mistakes, both in how the live rows were wired in, and both worth
writing down because the reasoning error is the interesting part.

**The route was thrown away every row.** The guide re-planned the instant a platform
moved, which is right in principle — a lift the hero is riding reports a new row on
every frame of the climb. But a hero *on a platform* is not standing anywhere the
search could start from: `nodeAt` resolves ground positions only, so a ride node is
not one. `findRoute` came back empty, and the guide's answer to an empty plan is to
clear the route — so the drawn line vanished on the first row of every ride. There was
already a guard for this, *"mid-jump he is standing nowhere, do not try until he
lands"*, and the new check had been put **above** it, where the guard could not reach
it. The order is the whole fix: **may a route be planned from here at all**, and only
then whether the world has changed.

The hole underneath was older than the trigger. `findRoute` has never been able to
start from a ride node, so *any* re-plan while the hero is aboard a platform has always
failed — the twenty-second refresh used to hit it too, which is why this read as a new
bug rather than an old one.

**The cavern was rebuilt sixty times a second.** Recording the rows dropped the graph
eagerly, and two things asked for it on every frame: `advanceProgress` and
`flightModel` each called `store.get()` to read a map *width*, which is static map
metadata. A ride rebuilt mp31 — 18,000-odd edges and a full jump model — per frame.
Both now read the width from `NAV_MAP_BY_ID`, the rebuild is deferred to whoever next
asks for a graph (`get` compares the rows the cached graph was built from, which it
already carries in `platforms.places`), and `peek` answers *"is the hero on a node?"*
without building anything.

The general shape: **a per-frame signal needs a per-frame guard on who may act on it.**
A platform moves sixty times a second and exactly one thing in the program can use
that — a re-plan from a standing position.

**[measured]** mp31, a six-row ride: graph builds 7 → **0**, and the drawn route now
shortens one row at a time as the hero climbs (43 → 37 points), which is what
following a drawn route looks like.

#### Tests

- `nav-platform-state.test.ts` — a ride, row by row, with the store proxied so the
  number of graph builds is observable: the guide stays active, the reveal shortens by
  one point per row, and nothing rebuilds the cavern.
- `nav-platform-model.test.ts` — a new block, *a platform is a thing, not a place*: the
  solid mask is exactly the union of the lifts' three tiles and nothing else; every
  lift starts at `startY` and moves when it is told to; and a slot is a landing slot if
  and only if its platform is standing there. Including the three caverns where two
  lifts share a column, which a column-keyed live row cannot separate — named there
  rather than left to surprise someone.
- `nav-platform-state.test.ts` — the plumbing: the `g_mem` list walk, with a decoy past
  the terminator that must not be read and a zero pointer that must read as empty; then
  the store rebuilding on a changed row and refusing to rebuild on an unchanged one; and
  the guide re-planning mid-interval when the lift moves two rows.
- `nav-graph.test.ts` — the reported case as a regression, asserting the three
  measurements above: the lift's tiles are solid, only row 34 is landable, and nothing
  reaches the lift from `(6,37)`.
- `nav-graph.test.ts` — the two counting tests re-measured, and *every jump edge is a
  landing the model gives* now builds its model from the same `isLandingSlot` and
  `restingCells` the graph does. That one is not bookkeeping: the graph and the
  overlay have to agree on where a platform is, or a hop the graph offers cannot be
  redrawn. The first version of this filter disagreed with the graph about horizontal
  platforms, and `path-overlay.test.ts` failed on a nine-column jump in mp80 that the
  graph still had — the two callers now ask one function, in `platforms.ts`.

#### The same round, third pass: a fall is not a jump with a smaller rise

With the lift ride fixed, the next report was **chevrons drawn through solid rock** — a
diagonal of arrows crossing a cavern wall in mp82.

Two things were drawing lines where a flight belongs, and only one of them was new.

**A fall could never be replayed.** The graph builds a fall by asking the model from
the column *beside* the hero, with **no rise at all** — he is already one column over
when he starts dropping, and he picks a column every row after that (`addFalls` →
`landingsFrom(col, row, 0)`). The overlay replays with `flightPath`, which searched two
rises and two, never zero, and only from the hero's own cell. So **every** fall came
back empty and was drawn as its own two ends. A ten-row fall became one chevron
pointing across a fall nobody had traced, and a route drawn through a cave the hero
crosses said nothing about the crossing.

The platform work made this much more visible, which is why it looked new: with a
platform landable only where it stands, falls land deeper and drift further, so the
jumps between them got longer. Falls drawn as a straight line, mp82, 103 routes:
**137 → 7** after asking the fall the fall's question — a rise of 0, from the hero's
own column and then either side of it. The 7 that remain are edges no flight the model
can produce (`fallTo` and the ride-slot case use their own geometry), and they draw one
chevron rather than a line, so nothing goes through rock.

The lesson is the same shape as the one above: **a hop must be re-derived the way it was
built.** "A fall is a jump that does not rise" sounds right and is wrong — it is a
different question, from a different cell, and asking the wrong one returns nothing at
all rather than something close.

#### Tests

- `path-overlay.test.ts` — *the line a fall draws*: the jump question from the hero's
  own cell finds nothing where the fall question from the column beside him finds the
  flight, and a real mp82 route's six-column fall is drawn as ten cells rather than two.
- `path-overlay.test.ts` — per-frame cost measured while fixing it, since a fall that is
  searched four times must not be searched four times per chevron: the longest route in
  the game, 234 hops, costs **0.2 ms** a frame.

#### The same round, fourth pass: waiting is for riding, not for landing

Two more things were drawing lines where the hero cannot go, and one of them was mine.

**A horizontal platform got an exemption it should never have had.** The tenth cause
pinned every vertical and collapsing platform to the row it stands at — and left
horizontal platforms landable across their whole span, on the reasoning that the hero
can wait for one. That reasoning is right about **riding** and wrong about **landing**.
He can wait for a platform from the ground, and the graph still says so: every column
of a span has a slot, so walking up to one and stepping on (`BOARD`) works anywhere
along it. But a hero already *falling* cannot stop and wait for one to arrive under
him, and the model was offering him the whole span as a floor. mp10's row-43 platform
is the case in one line: `mp10 (6,32) -> (7,40)` was a fall onto **column 9** of a
platform standing at **column 7**, and then a run of two-column "rides" along a span
he had no way to be on. Flights that end with nothing at all underfoot, mp10:
**102 → 1**.

So a horizontal platform is a thing too: solid at its `startX` — the only place it is
until something rebuilds the graph, because nothing but the hero moves it and he cannot
drive it — and landable only there. Its span stays rideable and boardable, which is
what waiting buys. The whole span being a floor is what it cost.

That is 181 ride slots losing their only way in, and it is the price of being honest:
a slot the hero cannot land on and cannot be carried to is not a place he can be. Ride
slots with no entry at all: 5,403 → **5,222**. Edges, all 31 caverns: 525,046 →
**509,562**. **mp30 is untouched**: 231 points, cost 307, `maps [5,6,5,6,5]`, no
equipment, still boarding the column 5 lift at `(5,23)` and riding it to `(5,1)`.

**A lift is drawn as its two legs.** `enterLift` does not mean the hero moves from one
cell to another: he reaches a cell an up current occupies — walking off a ledge into it,
or through it mid-jump — and is carried **straight up that column** to the exit. The
swept cell is neither end of the edge. mp82 has `LIFT (23,0) -> (9,21)`, seventeen
columns and twenty-one rows apart with the current in column 9, and `lineCells` drew it
as a twenty-two-cell diagonal through whatever rock lay between two standing positions.
8,626 such edges in the game.

There was no room for the swept cell: `NavEdge` is `{to u32, kind u8, cost u8, req u16}`,
already eight bytes, and `edges` is half a million of them. So it goes in a side table
keyed by edge index — only lift edges have an entry — and the overlay looks it up by
finding the edge, which is the thing it was avoiding. Drawn cells inside solid rock in
a 55-route sample of mp82, by kind: **LIFT 464 → 1**, and the lift is now the climb it
is: the approach as a flight to the swept cell, then straight up one column to the exit.

#### Tests

- `nav-graph.test.ts` — every lift edge in the game resolves to a swept cell, in the
  exit's own column, where `heroInLift` really holds the hero: **8,626** of them.
- `path-overlay.test.ts` — a real mp82 lift hop draws as an approach plus a climb, one
  column wide, one row at a time, ending on the exit.
- `path-overlay.test.ts` — the landing-slot rule re-measured for all three families: one
  landing per platform, against thousands of ride slots and every column of every
  horizontal span.

#### Still standing, and it is the engine's own

A flight the model replays can still have the hero's body inside rock, and that is what
the game does. `check_floor_for_landing` reads **one tile**, three rows below his top
left and one column right — the middle of his feet — and nothing else. The rise tests
**one cell**, above the middle of his head, so a jump can carry him through a ledge
lip; the descent has **no test at all**, so a hero falling past a one-row shelf goes
through it, because his feet find clear air underneath. Measured across the game: 1,791
flights pass through a shelf and 501 end with nothing underfoot.

Drawing those honestly means drawing what the hero does. It is the same trade the plan
has always made — "the game allows it, so a model that refuses it refuses the player's
route" — and the alternative is a drawn line the hero would not fly, which is its own
kind of nonsense. If the engine's clipping is a bug, it is a bug in the game and in
every route that crosses a shelf, and the fix belongs in `airborne_movement`, not here.

**Gates:** `tsc --noEmit` clean; full suite **910/910** across 64 files; the Playwright
smoke test passes.

---

## 18. Handover — read this first

**State at end of session:** `tsc --noEmit` clean, **877 passing** across 63 files,
nothing skipped. The jump model is derived from the engine and has no deviations
from it left; the rope family, the fall, the platform and the node rules are
corrected; the route from the start ledge to `(151,6)` resolves leg for leg as the
player drew it; and the chevrons the guide draws for it are continuous, survive a
restore, and are not deleted by a jump. The cavern's own hazard tables are read with
their terminators, so a hero without shoes can walk the cavern he is standing in, and
the map screen loads every cavern a route may need before it searches.

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
| aggressive-hazard nodes | 16,995 | 884 | the aggressive table is zero-terminated, and its terminator was being read as the tile `0` — which is the void, and most of a cavern. 19 of 31 maps were affected, and a hero without Pirika shoes could not enter a single node |
| slope-hazard nodes | 26,562 | 210 | the same terminator, in the two slope tables beside it |
| edges | 1,081,449 | 1,080,257 | −1,192 `SLOPE_UP`/`SLOPE_DOWN` edges that the void tile had invented. Nodes are unchanged at 29,917: node generation reads blocking, not hazard |

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
- **A terminator is not a value.** The slope and aggressive tables are
  zero-terminated 4-byte groups, so reading one as a plain list makes the tile `0` a
  member — and `0` is the void, which is most of a cavern. It read as harmless
  because a `Set` accepts `0` without complaint and the flags it produced were merely
  *too many*, never visibly wrong. The airflow tables three functions above were
  already read with an explicit stop-at-zero; when two tables beside each other use
  different conventions, neither can be copied from the other without checking.
- **Fix the cause you can name, not the first symptom that reproduces.** The dropped
  shoe-dependent route was reproducible, had a clean one-line cause, and had a test
  written for it in twenty minutes. It was also downstream of a defect that made
  16,995 of 29,917 nodes dangerous. Fixing it first produced a green suite and a
  cavern the hero still could not walk. The same trip then failed a *third* time for
  a reason with nothing to do with either: the map the route needed had never been
  downloaded. Three defects, one symptom, and the first two were found by reading
  code while the third was found only by asking what the game actually had in memory.
- **A fixture more capable than the real thing hides capability bugs.** Every test
  loaded MDTs from disk, so every map was always available. A store that can answer
  for all 31 caverns is not a more thorough fixture, it is a different program — and
  the bug it hid was a search that skipped any door whose destination was missing.
  When a dependency is *lazily* available in production, the test double must be lazy
  too, or the test is asserting about a world the player does not live in.

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

---

## 20. Boss arenas are passages

### The report

The player: *"I tried to build route with Yaga Thread, from mp10 (61,7) to mp10
(135,33). It created a route that implies hero has Silkarn shoes to climb the
slope. But currently I have no any shoes, so the route should be created for bare
hero. You can always assume that boss room has exactly one entrance and one exit.
Exit door appears dynamically after defeating the boss (check accomplished mdt
data). Fix this — the bare route from mp10 (61,7) to mp10 (135,33) should be found
via boss room."*

Two things in there, and only one of them was a defect.

### What was a defect: the arena read as doorless

An arena's door table is a bare `0xFFFF` sentinel, so `readDoors` returned nothing
and `mp1d` had no way out at all. The exit is not missing, it is *dormant*: it is a
record in the file that `load_place_and_reinit` installs by writing `0xC00A` from
the cavern descriptor's initialiser list, and then stamps with the hero's own
column (§2.8.1). Ten maps answer, and each opens back into the cavern its arena
belongs to — so an arena is a passage, and the route builder now walks through it.

`bossExitAtNode` on the graph is the whole runtime change: an `Int32Array` over
nodes holding a `NAV_BOSS_EXITS` index, set for every ground node on the door's
row. The search treats it exactly like a portal, because the game spends a key the
same way for either.

**[measured]** consequences, all in the numbers:

| | before | after |
| --- | --- | --- |
| `NAV_BOSS_EXITS` | — | 10 |
| reachable maps from `mp10` / `mp50` / `mp80` | 11 / 4 / 14 | 29 / 29 / 29 |
| strongly connected components | 15 | 15 (unchanged) |
| dead-end portals | 17 | 17 (the flag reads the door table, which is still empty) |
| `mp80 (113,21) → mp81 (124,6)` | 10,552 expansions | 10,552 expansions |

The components are untouched because a component is a property of the door
*tables*, and a table is still empty. What changed is that an arena is now also a
way **out**, so the reachable set reaches almost the whole game. `mp84` is the one
island left: its only doors point at `mp8d` and `mp90`, and `mp8d`'s exit arrives
back on `mp84`.

### What was not a defect: the trip needs shoes

**[measured]** the trip the player named still has no shoe-free route, and it is
not the boss room that stops it. Exhaustively flooding `mp10`'s bare-reachable
nodes from `(61,7)` gives **720 nodes**, and the whole of that region has exactly
**one** portal in it — the town door at `(61,6)`. The one hop that leaves the region
is the `STEP (12,20) → (13,19)` over the `0x0B` slope ramp, which is `req=4`,
Silkarn (§7.7). There is no other exit, so the arena cannot be reached from there.

The destination is equally shut:

| Into `(135,33)`'s alcove | From | Cost |
| --- | --- | --- |
| `JUMP_HIGH (155,37) → (150,33)` | the east corridor, bare-reachable | Feruza — a four-row rise |
| `SLOPE_UP (154,36) → (153,35)` | the outer corridor, itself only reachable over the Silkarn ramp | Silkarn |
| the town door at `(128,32)` | a town | not a graph edge, by design (§7.8) |

And the route the map screen produced was already the honest answer for the hero as
he is: **101 points, one requirement — Feruza shoes at `(118,20)`** — which is the
`JUMP_HIGH (101,7) → (118,20)` out of a seventeen-column pit. The reverse
direction, `(135,33) → (61,7)`, is bare-walkable in **153 hops**, because that
crossing is a nine-column *fall* downhill and only its reverse is a rise. The trip
the player asked about is the one direction that needs a shoe.

So the two halves of the report answer differently, and saying so is the useful
thing: the boss room was broken and is fixed, and the trip is not shoe-free for a
reason no boss room can reach. `(26,16) → (135,33)` — the trip the boss room *is*
on — went from **no route** to **9 points**: door, arena, door.

### What would make this wrong

- **The initialiser list.** `(0xC00A, <door table>)` was read off eight arenas that
  all agree; a ninth cavern that stores its post-boss door some other way would read
  as no exit and the arena would go back to being a terminus. The test asserts the
  landing of all ten, so a new arena that fails to answer fails the suite.
- **The column.** The exit is modelled as reachable from a whole row, because
  `absX` is the hero's column at the moment the fight ends. If the engine ever
  clamped it to the record's own `x0`, the model would be too generous by up to
  forty columns — visible as a route that walks to the far end of the arena.
- **Reaching the fight.** Nothing here says the hero can *win*. A route through an
  arena is a route that asks him to fight the boss, which the pathfinder cannot
  weigh; the route says nothing about it, and that is worth remembering when one
  turns up as an answer rather than as a detour.

---

## 21. Horizontal platforms: both directions, and the right three positions

The player: *"I found the reason why you cannot find the route. The most simple test
— a route from mp10 (31, 59) to mp10 (56,60). It involves travel on horizontal
platform. You should assume horizontal platform as array of linked nodes from min_x
to max_x. It is static, so has no runtime cost."*

Two defects, both in `platforms.ts` / `nav-graph.ts`, both read straight out of the
engine. **[measured]** ride slots with no entry at all fell **367 → 12**, and mp10's
bare-reachable node count from `(61,7)` rose **716 → 933**.

### 21.1 A horizontal platform carried him one way only

`platforms.ts` builds each span as a doubly linked chain — `link()` sets both `next`
and `prev` — and `nav-graph.ts` followed `slot.next` for `RIDE_H` and `slot.prev` only
for `PLATFORM_VERTICAL`. The reasoning, recorded in the code, was that a horizontal
platform is automated and the hero can wait for it to come back, so "one direction
already spans both".

It does not. `next` runs the chain in **increasing column**, which is the direction
the slots happen to be built in, so every horizontal platform in the game carried him
east and never west. Since a horizontal platform is static — the hero cannot drive it,
and the live rows are read for the vertical and collapsing lists only, so there is
nothing to rebuild — the honest model is the player's: **an array of linked nodes from
`min_x` to `max_x`, walkable both ways**. Nothing about it is time-dependent, and
nothing is rebuilt at runtime.

### 21.2 The three riding positions were one column out

`heroOnHorizPlatform` (`engine/dungeon-platforms.ts:107-112`) carries the hero when
**any of his three columns equals the platform's own left cell**, so

```ts
export const HORIZONTAL_RIDE_OFFSETS: readonly number[] = [-2, -1, 0];
```

— the platform hangs off his **right**. The model had `[-1, 0, +1]`, which is a
different set of three: it invented a position with the platform hanging off the
hero's left, and **dropped the one that exists**.

Dropping the real one is not a small thing, because a ride slot is only ever boarded
from a ground node standing on the same cell. With the leftmost riding position a
column too far east, a hero standing at `(116,61)` had no way onto the platform
standing at column 118 — mp10's widest platform, the one that crosses the whole
cavern — and mp10's row 61 was unreachable from the ground in either direction.

### 21.3 What the platform fixes bought, and what is still cut off

**[measured]** the player's own crossing of the pit is bare and already was, by
another hop: `mp10 (61,7) → (118,20)` is **46 points, `WALK=44 JUMP=1`**, going
`(105,7) → (118,20) → … → (113,21)`. The seventeen-column hop from `(101,7)` that the
search reaches for is a different flight and does cost three rises — a flight covers
sideways at most `rises + 1 + descents` columns, so three is Feruza shoes. The model
and the engine were put head to head on exactly that shape (`a wide open drop`, 44
columns of empty air over a floor twenty-four rows down) and they agree; it is in
`nav-jump-differential.test.ts` so it stays agreed. **The player's route is cheaper
than the one the search wanted, and the graph had it all along.**

The player's second route — step onto the rope at `(111,9)`, climb to `(111,13)`,
fall to `(113,21)` — is not in the graph: there is no rope node at `(110,9)` or
`(110,13)`. mp10's rope at column 111 runs rows 7-30 in the model, so that stretch is
missing or is a different column.

What the platform fixes actually bought, measured by flooding `mp10` the way
`findRoute` does:

| From | Bare-reachable nodes, before | after |
| --- | --- | --- |
| `(61,7)` | 716 | 720 |
| `(34,56)` | — | 933 |
| `(31,59)` | — | 917 |

**(56,59)** and **(135,33)** are still out of reach, and the reason is now a short
list rather than a mystery: **mp10 is cut into regions by its two Silkarn ramps**, and
both goals are on the far side of one. The whole frontier from `(61,7)` is 27 gated
edges, and every one is on a ramp:

| Ramp | Edges |
| --- | --- |
| columns 13-15, rows 16-22 | `STEP/JUMP (12,20) → (13,19)`, `(11,20) → (13,19)`, `(10,20) → (13,19)`, `(11,20)/(12,20) → (14,18)`, `JUMP_HIGH (10,20) → (14,18)/(15,17)`, … all `req=4` |
| the staircase ramp `(153,36)`-`(154,38)` | `JUMP (155,37)/(156,37) → (153,35)`, `(155,37)/(156,37)/(157,37)/(158,37) → (154,36)`, all `req=4` |
| the one Feruza hop | `JUMP_HIGH (156,37) → (151,33)` `req=2`, and `(155,37) → (150,33)` `req=6` |

The player on the last: *"`(155,37)→(150,33)` is impossible and only available after
hero visits cavern level 8 … auxiliary (not necessary) route."* Agreed — 4 rows of
rise against an engine cap of 2 (`dungeon-frame.ts:297-303`, `dungeon-hero.ts:327`).
And on the ramps: *"without Silkarn shoes this slope is not climbable."* Also agreed.

Which leaves the question this section does not answer: the row-33 corridor has a
second mouth at `(121,32)`, and that ledge is a spur — nothing in the graph leads to
it but the corridor itself.

---

## 22. Recorder mode

The player, asked how the model should learn a route it could not find:

> *"It will be much more productive if you implement recorder mode so I can live
> play and copy-paste from console log"*
>
> *"You should also log all key presses during the recording"*

Both halves of §21.3 are arguments about the geometry of two ramps, settled by
reading tiles. Watching the game walk them is faster and it is evidence. So:

`web/src/engine/nav/recorder.ts` — `NavRecorder`, installed on `window` by main.ts:

```
navRecorder.start()      begin recording
<play the route>
navRecorder.report()     print it beside what the graph calls each hop
navRecorder.clear()      forget it
```

`report()` also **returns** its text, so it can be pasted without selecting console
output.

**A cell he flew over is not a disagreement**, and the first recording showed what
happens when the report fails to say so: 461 of 462 flagged hops were mid-jump and
mid-fall air, which has no node and must not have one, and the one line that mattered
was lost in them. Each sample therefore carries `flewThrough` — true while *every*
frame at that cell had `airborne` set, cleared the moment a frame is spent on the
ground — and a cell with no node that he merely passed through prints as
`over … in flight` rather than `***`. Only a cell he stood on is counted.

### What a sample holds

One reading per rendered frame, from `loop()`, and the call returns at once unless
recording is on, so the mode costs nothing when it is off.

| Field | Where it comes from |
| --- | --- |
| map cell | the engine's own expression: window left column + `hero_x` + 4, head row + viewport top (`dungeon-doors.ts:90-101`) |
| **input** | `INPUT_DIRS` (0xff17) and `INPUT_ALT_SPACE` (0xff16), spelled as up / down / left / right / space / alt |
| state | `on_rope` 0xff39, `airborne` 0xff3d, `sliding` 0x9f22, `on_slope` 0xff42, `on_air` 0x9f15 |
| accessory | `ADDR_ACCESSORY` 0x9e, so a recording taken in boots says so |

The **input the engine acted on**, not the DOM event: the engine's own byte is what
`state_machine_dispatcher_idle_default` branches on (`dungeon-input.ts:364-373`), so
it is what a jump actually was. The hero's distinct inputs are kept per cell in the
order they first appear, so a jump shows as `up+right` rather than sixty identical
frames of `up+right`.

### What the report is for

The disagreement. Every hop is looked up in the graph and printed with what the graph
calls it:

```
  mp10(105,7) -> mp10(118,20)  JUMP bare  (pressed right)
  mp10(12,20) -> mp10(13,19): NO EDGE in the graph; hero did it bare with "up+right"
  -- 1 hop(s) the graph does not have; each *** line above is a bug in the graph --
```

Three outcomes per hop, and they are kept apart because they are different bugs:
**no edge at all** (the model refuses a move the game allows), **not a standing
position** (the hero passed through the air, which is normal, and is not the same
thing), and **an edge that costs a capability** — printed with the shoes or key by
name, so a route recorded in Feruza shoes explains itself.

The last line is `raw cells: 0:31,59 0:32,58 …`, so a recording is reproducible in a
test without the console.

### Tests

`web/tests/nav-recorder.test.ts`, 8 tests, on a synthetic cavern built through the
same `buildNavGraph` the product uses — a floor with a hole in it, so a hop the graph
really does refuse can be constructed rather than hoped for. It covers the visit
order, the input per cell, the three hop outcomes, a map change, and the idle case.

---

## 23. What a level-1 recording proved

> *"I passed entire level 1 — started from town door, went for the key, ran to the
> boss room (killing all the monsters on my way), killed the boss, the door appeared,
> exited to target coords, moved to the second town door. No equipment was used."*
> — `WORK/DOC/level1.txt`, 1364 cells, 38,649 frames, `mp10` `mp21` `mp1d`

### 23.1 The traversal model is right

**[measured]** Taking the recording's cells in order and asking the graph about every
pair of **standing positions** — the cells whose frames never had `airborne` set —
gives **787 hops with no edge missing and not one that needs a capability.** Not one,
across a whole cavern walked end to end, with no shoes.

So the model that produced the "Silkarn at `(13,19)`" and "Feruza at `(118,20)`"
hints was not inventing traversals. The 461 `***` lines the report printed are
almost all cells the hero was **passing through** — mid-jump and mid-fall air, which
has no node and should have none. The recorder's wording invited that reading and
should be tightened: a cell he flew over is not a disagreement.

### 23.2 The boss-exit model is confirmed by the game

The recording's last two map changes are the whole feature:

```
mp10(26,16) -> mp1d(27,15)   CHANGED MAP
... he fights, and ...
mp1d(21,15) -> mp10(141,33)  CHANGED MAP
```

He walked in at `mp10 (26,16)`, killed the boss, and left from **`mp1d (21,15)`** —
row 15, `y0 + 1`, which is the row the exit is offered on — and landed on
**`mp10 (141,33)`**, which is `NAV_BOSS_EXITS[0]` to the cell. The arena is a
passage, and the passage is the one §2.8.1 describes.

### 23.3 The one real gap: a rope caught mid-flight

Walking the recording forward against a bare flood from `(61,7)` — 720 nodes — the
first cell the graph cannot reach is **`mp10(164,19)`, a rope node, `[on_rope]`**, and
the ten cells before it are all `on_rope` at `(162,18)`…`(162,27)`. The player got
there like this:

```
mp10(165,26)  [sliding]      a ground node
mp10(164,26)  [sliding]      a ground node
mp10(163,26)  [sliding]      NOT A NODE — nothing under his middle foot
mp10(162,27)  [airborne]     the rope node
mp10(162,28)  [on_rope]
```

He stepped west off the ledge, fell through `(163,26)` — a cell with no ground under
its middle column, so correctly not a node — and **caught the rope at column 163 on
the way down.** The graph cannot follow him, because a flight never ends on a rope.

This is the gap `jump.ts:85-89` already lists as not modelled:

> *A rope caught mid-flight (`airborne_movement` grabs one at the hero's feet and
> stops the fall, dungeon-input.ts:543-551): ignored, so a flight may pass through a
> rope where the game would have him climb it.*

And the engine says exactly how: `airborneMovement` probes
`hero_coords + 2*36 + 1` — **the middle column at the feet row** — every frame the
hero is airborne, and sets `ON_ROPE_FLAGS` when it finds a rope
(`dungeon-input.ts:539-546`). The same happens from a standing hero through
`tryClimbRope` (`dungeon-input.ts:198-224`), which checks three columns: `col + 1`,
`col`, and `col + 2`.

It is the second break in the walk and it is why the trip in §21.3 has no shoe-free
route. It is also why the *first* two ropes the recording uses are unreachable
although the rope nodes themselves are exactly where the hero stood — the graph's
rope columns are right (he is recorded at rope tile − 1 every time: col 19 for the
rope at 20, col 111 for the rope at 112, col 162 for the rope at 163), and the only
thing missing is a way **onto** one from a fall.

### 23.4 Why it is not fixed here

The engine settles *that* the catch happens. It does not settle *where the hero ends
up*, and that matters: the tile he grabs is two rows below his head, while a rope
node is the position where the rope runs through his middle column **at his head
row**. So a catch is not automatically a rope node, and landing it on the nearest one
would be a guess.

The differential harness cannot settle it either, as it stands: `Harness.fly()`
reports where a flight *lands* — the frame that clears `JUMP_PHASE_FLAGS` after it
was set — and a rope catch returns **before** that flag is set, so the harness flies
straight past the catch. The cavern added for it
(`a rope hanging off a ledge`, `nav-jump-differential.test.ts`) passes vacuously.

So the work is: teach `Harness.fly()` to stop on a catch and report the cell, put the
ledge-and-rope shape in the differential, and only then give `JumpModel.descend` a
rope landing. That is a contained piece of work with the evidence already in hand.

---

## 24. Two fixes the recording turned into, and what is left

§23 named the gap and stopped. Here is what fixing it actually took, measured on
mp10's bare-reachable node count from `(61,7)`.

| | before | after |
| --- | --- | --- |
| bare-reachable nodes in mp10 from `(61,7)` | 720 | **938** |
| ride slots with no entry at all (all 31 maps) | 367 | **6** |

### 24.1 A rope caught mid-flight — 720 → 897

`jump.ts` gains `catchesRope(col, headRow)`: the cell under his middle column, three
rows below his head. That is not a new probe — it is **the same cell `landsIn`
already reads**, because `airborne_movement` lands the frame and then probes for a
rope *at the cell the landing check just rejected* (`dungeon-input.ts:509-546`). So:

- in `descend`, after the landing tests fail, a rope in that cell ends the flight
  with the hero **one row lower** than where the check ran, which is exactly the
  `(111,8) → (111,9)` the player recorded;
- in `solveCanLand`, such a cell is worth visiting — without that the descent is
  never enqueued there and the catch never happens;
- `landingAt` resolves a rope before a platform, because a catch and a landing are
  one cell read two ways.

That is what takes the walk past the ropes. Every rope in a cavern used to be
reachable only from below.

### 24.2 Ride slots are per cell, not per offset — 897 → 938

A horizontal platform mints up to three slots per column, one per riding offset,
and **all of them are the same cell** — the offset says which of the platform's
three tiles is under which part of the hero. The graph keeps one node per cell
(`rideNodeOfCell`), so boarding and riding could land on two different slots in one
cell: the hero boards at mp10's leftmost riding position `(34,56)`, steps east, and
the node the graph holds for `(35,56)` is the *other* slot there, whose chain starts
a column further along. Riding is now generated per cell — every slot in a cell to
every slot in the cell beside it — instead of by `slot.next`.

### 24.3 What is still missing — **superseded by §25**

> **This section is wrong and §25 replaces it.** The walk below is a plain jump, not
> a slope slide: the duplicate `(52,54)` in it is the frame the rise stops on, and the
> whole arc is one flight with a locked steer. Nothing is missing from the flight
> model; three things were wrong about horizontal platforms. §24.3's list of what
> "the next piece" should be — a slide traversal — is not to be worked on.

**[measured]** the first cell on the recorded walk the graph still cannot reach is
**`mp10(58,59)`**. The hero got there from the row-56 platform: riding to `(49,56)`,
then `(50,55) (51,54) (52,54) (53,55) (54,56) (55,57) (56,58) (57,59) (58,59)`,
recorded `[airborne sliding]`. That path alternates — up, right, up, down, down — and
the jump model offers one locked steer per flight (straight, left or right,
`jump.ts:838-851`), never the alternation a slope slide produces
(`slope_assist_tick`, `dungeon-vertical.ts:157-176`).

So the next piece is the **slide**: a hero on a slope does not fall, he is carried
down it a row at a time in whichever direction the slope runs, which is a traversal
the flight model does not have. The recording gives its exact shape — nine cells from
`(49,56)` to `(58,59)` — and §23.4's harness work is what will settle it.

## 25. §24.3 was wrong, and the whole of level 1 is found

§24.3 read the walk out of `(49,56)` as a **slope slide** and said the flight model
could not produce it. That reading was wrong, and the graph was not missing a
traversal at all — it was misreading horizontal platforms. §24.3's own arithmetic
gave the game away: it printed `(52,54)` twice out of a nine-cell arc, and a jump
that puts him two columns across in one row *is* a jump. The rise stops on the frame
the height cap is reached (`jump_press_handler`, `dungeon-hero.ts:319-360`) and he
still steps sideways that frame, which is what the duplicate cell was.

### 25.1 How it was found

Not by reading the model — by **bisecting the recording**: walk it in order and report
the first standing cell a bare hero cannot reach. That is now a test
(`nav-route-cases.test.ts`, *"reaches every standing position the recording
reaches"*), because it is the cheapest statement that the graph agrees with a walk
through every mechanic in the cavern.

It moved three times, each time exposing a different mistake about platforms:

| | first unreachable cell | what it was |
| --- | --- | --- |
| 1 | `mp10(30,50)` | the row-53 platform could not be boarded from the east |
| 2 | `mp1d(27,15)` | the key door, once the corridor was reachable |
| 3 | — | nothing |

### 25.2 The three defects

All three are the same mistake: treating a platform as a *place* — a set of cells —
when it is a *thing* that is somewhere.

**One: the footprint was the span, not the platform.** `restingCells` marked
`p.cols` tiles solid. `cols` is the length of the span the platform *travels*; the
platform is three tiles (`update_and_render_horiz_platforms` draws `0x46 0x47 0x48`,
`dungeon-platforms.ts:234-243`), and so are the other two families. For mp10's row-59
platform that is a **fourteen-tile wall where a three-tile ledge belongs**, sealing
columns 43..56, and every jump off it stopped on the row-56 ledge instead of
clearing to `(57,59)`. `PLATFORM_WIDTH = 3`, and the three is now a named constant
with the three call sites that say why.

**Two: the landing surface was where it stands, not where it goes.** §21 restricted
landings to `isLandingSlot` — the column a platform is standing at — and justified it
as "waiting buys a ride, not a landing". That is right for a **vertical** platform,
which moves in rows and has exactly one of them: a hero cannot come down on the row
it will be on in two seconds. It is wrong for a **horizontal** one, which moves in
*columns* at a fixed row and sweeps its whole span, going there and back. Every column
of that span is a row it will be at, so every column of it is a landing, and the
hero who falls anywhere along it is landed on when it arrives under him. That
withheld **181 horizontal slots**, and it cost mp80 its goal: from the ledge at
`(181,47)` the player falls onto the row-54 platform at `(163,51)`, rides it west to
`(149,51)` and steps off. Withhold that fall and `(151,6)` is unreachable from
anywhere, because `(149,0)` above it is not a standing position.

The rule is now per family: `slot.kind === PLATFORM_HORIZONTAL` marks the whole
span, everything else stays `isLandingSlot`.

**Three: boarding is a step, not a teleport.** A slot was boardable only from a
ground node standing on the *same* cell. But `moveHeroLeftIfNoObstacles` /
`moveHeroRightIfNoObstacles` shift the hero one column (`dungeon-hero.ts:218-275`) and
the platform's tile lands under his middle foot in the same frame, so he is up on it
a column to the side of where he was standing. On mp10's row-53 platform that is the
*only* way on: the span is columns 32..53 over a pit with no map floor between 31 and
54, so the hero waits on the cliff edge at `(55,50)`, the platform arrives at its
rightmost position, and he steps left onto the slot. `BOARD` now also goes to the
cell beside, gated on `heroCanStepSideways` and the counter-current check, the same
two the walk beside a rope uses.

### 25.3 The result

`findRoute(bareCapabilities(), mp10(61,7) → mp10(128,33))` — 752 points, cost 1030,
`equipment: []`. No shoes, no slope, no high jump, no aggressive ground. It spends one
ordinary key: it crosses to mp21 and back for the key at `mp10(99,41)`, then goes
through the locked door at `mp10(26,16)` into the boss room `mp1d`, whose exit is the
row-33 corridor the goal stands in. A boss room is a passage, not a wall (§20), and a
key is an item, not an accessory — neither is `equipment`, which is what "bare" means.

The route crosses both of mp10's horizontal platforms, in the way the recording does:
it waits on the cliff at `(55,50)`, falls onto the row-53 platform as it arrives,
rides it to `(31,50)` and alights on the far cliff at `(30,50)`; then later it falls
onto the row-59 platform at `(46,56)` and jumps clear to `(57,59)` — the hop §24.3
thought unreachable.

**Tests.** 945 pass, `tsc --noEmit` clean. Three existing tests pinned the wrong rule
and were rewritten rather than relaxed: the platform-footprint expectation in
`nav-platform-model.test.ts`, the jump-edge differential mask in `nav-graph.test.ts`
(which had to be taught the per-family rule or it compared the graph against a model
built on the old one), and the ride-slot entry count, 5542 → 5543 live and 6 → 5 dead.

**What is still true.** §21.2's riding offsets — `leftCol = platformCol - 2 ..
platformCol` — are unchanged, and were tried both ways while chasing this. They are
right: the hero's *middle foot* is what the floor check reads
(`checkFloorForLanding`, `dungeon-vertical.ts:488-504`), and at `leftCol = P + 1` that
foot is on the platform's middle tile with nothing under him, so he falls. The one
column the offsets do *not* reach is `P + 1`, and the route reaches the row-53
platform at `(53,50)` — `P - 1` — not at `(54,50)`.

## 26. The map screen asked for shoes before it asked for keys

Reported as: *"I tried to find the route from mp10 (61,7) to mp10 (128,33) when the
boss is already defeated and it cannot find bare path — it build the route that
requires shoes to climb the slope."*

The boss is a red herring. The shoes route never goes near the boss room, and the
bare route exists either way. What the report is really about is the **order of the
four rungs** in `MapScreen.choose` (`web/src/ui/map-screen.ts`), which was:

| rung | what it allows | mp10(61,7) → (128,33) |
| --- | --- | --- |
| 1 `held` | keys in pocket, doors as they stand | none |
| 2 `shod` | `planAccessories` | **121 pts, cost 167, `feruza`** |
| 3 `open` | `unlimitedKeys` | 544 pts, cost 772 |
| 4 `collected` | `collectKeys` | 752 pts, cost 1030 |

Rung 2 answered, so rungs 3 and 4 never ran and the bare route was never built. The
bare route goes mp10 → mp21 → mp10 → mp1d → mp10: it crosses to mp21 for the key at
`mp10(99,41)`, comes back, spends it on the locked door at `mp10(26,16)`, and leaves
the boss arena at `mp10(141,33)` — which is the row-33 corridor the goal stands in.
The shoes route instead takes a Feruza four-tile jump at `(155,37)` over the Silkarn
slope, the corridor's only other way in.

### 26.1 The order

**Changing shoes is free** — the hero does it between steps, in no time and at no
cost, so a route that needs a pair is a real route and is never refused. What the
order expresses is not a cost comparison but what the screen is *for*: the route the
player asked this feature for is one that needs nothing at all, so a route with no
accessory on it is built before one that asks for a pair. Keys are tried before shoes:

1. `held` — what he has: keys in pocket, doors as they stand, the accessory he wears.
2. `collected` — fetching the keys on the way.
3. `shod` — shoes the player can put on.
4. `open` — `unlimitedKeys`, now only to read the "needs N keys" message off.

The bare route is six times the cost of the shoes one, 1030 against 167, and it is
still the one offered, because it needs nothing. `open` moved to last because it
answers for nothing but the failure message.

### 26.2 The row-33 corridor, measured

Worth writing down, because it looks like there should be a way in from the west and
there is not. Holding the boss arena open, the corridor — mp10 head row 33, columns
122 to 151 — has exactly two entrances the graph can see:

- the arena exit at `mp10(141,33)`, which appears when the boss dies
  (`load_place_and_reinit` swaps the door-table pointer, `dungeon-cutover.ts:76-99`);
  **[confirmed]** it is still there once the boss is dead, so the arena stays a
  passage;
- up the Silkarn slope staircase `(154,37) → (154,36) → (152,34) → (151,33)`, the
  tiles being `0x5B` at `(153,36)`, `(154,37)`, `(155,38)` and `(156,39)`.

The pocket at columns 121–130, rows 29–35 — which holds `(121,32)` and the corridor's
west end — is **sealed on the west**: columns 119 and 120 are solid from row 24 to
row 35, and the rope at column 117 only drops to the ledge on row 42, which has no
way back up. With the arena unavailable there is no bare route to `(128,33)` at all,
and the shoes route is the only one there is.

### 26.3 A pair of shoes is an item, and it is not a key

§26.1's rung 3 was still wrong, and the reason is that a pair of shoes is a thing that
**lies in the cavern**, exactly as a key does. Walking over one puts it in the hero's
inventory (`put_shoes_to_inventory`, engine/dungeon-items.ts:182-187) and it stays
there; he may wear whichever pair he is carrying, or none, and changing costs nothing
and takes no time. A key is the opposite: one ordinary key opens one ordinary door, is
gone, and that door is then open for good.

So a route that needs a slope is not "a route that needs shoes", it is "a route that
needs to walk to the shoes", and `planAccessories` — which takes the pair as already
held — was answering a different question than the one the player asked. There is now a
`collectAccessories` flag that mirrors `collectKeys`: stepping onto a node with a pair
on it **grants** it, and what it grants is never spent.

**[measured]** the four pairs in the whole game, all read out of the MDT entity records
by `tools/navlib/mdt.mjs:readAccessories`:

| file | record | pair | what it opens |
| --- | --- | --- | --- |
| mp40 (id 8, level 4) | (177,13) | Ruzeria | ice — level 4 only |
| mp50 (id 11, level 5) | (208,27) | Pirika | aggressive ground |
| mp60 (id 14, level 6) | (201,13) | Silkarn | slopes |
| mp62 (id 16, level 6) | (27,26) | Feruza | the four-tile jump |

There are four and no more, so no pair is ever duplicated and one bit per kind is the
whole inventory state — which is what the search now carries, where a key's counter is
what it carried before. Collecting is therefore monotone: the mask only ever gains.

**Which pair a record is, is not in the record.** `flag_1e` is always Feruza, but
`flag_1a` (`flag1a`, engine/dungeon-items.ts:436-458) hands over whatever the *cavern
level* decides — Ruzeria on level 4, Pirika on level 5, Silkarn on level 6 and up — so
the extractor takes the level and cannot be a table lookup. The handler code is also
readable from either `+4` or `+9`, because a record goes through `flag_13` first and
`flag13` copies `+9` over `+4` masked with `| 0x60`
(engine/dungeon-items.ts:267-281): in the shipped data mp40's is in `+4` and the other
three are in `+9`, and both are the same pickup. The extractor accepts either, and the
extraction test decodes the records a second time by hand to make sure the two agree.

A pair hangs on the nearest node inside the pickup window, so it sits a row or two from
its record — the same offset every key in the game has. **[measured]** the Feruza pair
is on the node `(27,25)`; its record is `(27,26)`.

Because the inventory is **not per cavern**, rung 3 is two searches: collect a pair
within reach, and failing that assume he is already carrying one. For mp10's town door
the Silkarn pair is a level away and out of the component, so `collectAccessories`
finds nothing and rung 3b answers with the Feruza jump — which is right, because by
then he may well be wearing Feruza from mp62.

### 26.4 A door that is open is not a door that needs a key

Still not fixed by any of the above, and the reason is the same mistake one level
down. §26.1 reordered the rungs, but the state they are asked about was wrong: **a
key is spent once and its door is then open for good.** After the boss, the player has
been through the locked door at `mp10(26,16)`, so:

- that door stands open, and costs nothing ever again;
- the key they spent on it is gone from the floor, so no route may fetch it — which is
  exactly what `keyPresent` says, and the reason `collectKeys` cannot rescue the route;
- an empty pocket and no key in the cavern means the `held` and `collectKeys` rungs
  both fail **on that door alone**.

So every rung above the shoes one came back empty and the screen offered the Feruza
jump — the symptom, exactly. The bare route through the arena and out at `mp10(141,33)`
existed the whole time and needed nothing at all.

**`doorOpen` already knew.** It is on `MapScreenDeps` and the composition root wires
`liveDoorOpen`, which reads `d_flags` bit 7 out of the live door table — the same read
`enterTheDoor` and `processDoors` make. It was consulted for exactly one thing, drawing
the door open or closed on the chart (`map-screen.ts:899`). **The search never asked.**
So `findRoute` has a `doorOpen` option now, and `crossDoor` asks it before deciding
what a door costs: an open door is walked through at `EDGE_COST.DOOR`, spends no key
and reports `viaReq: 0`. Null from the callback means "not known" — the engine keeps a
door table for the loaded cavern only — and the level data answers, as it does for the
drawing.

Two consequences beyond the hop itself:

- **`lockedDoors` and `keysSpent` no longer count an open door.** They were read off
  the portal record, so a door walked through open still reported as a locked door with
  a key spent on it. They now count only hops taken under a requirement, and the
  post-boss route reports zero of both.
- **A boss arena's exit is passed as "no door record".** It has no MDT portal at all —
  it is the door the arena grows when the boss dies — so there is nothing to ask and it
  is always open, which is right for a boss that is dead.

**[measured]** the ladder for `mp10(61,7) → mp10(128,33)` in that state — open door,
spent key, empty pocket, no accessory:

| rung | answer |
| --- | --- |
| 1 `held` | **544 pts, cost 732, no equipment, no locked door, no key spent** |
| 2 `collectKeys` | 544 pts — the same route; nothing to fetch |
| 3a `collectAccessories` | 544 pts — the same route |
| 3b `planAccessories` | 121 pts, feruza — never reached |

### 26.5 The thread then vanished, because the guide re-plans

`findRoute` has six call sites. I changed five of them — every rung on the map screen —
and left the sixth, and it is the one that runs the moment the thread is spent.

`PathGuide` does not replay the route the screen handed over. It **re-plans** from
wherever the hero has got to, on `update`, and `needsReplan` forces that on the very
first tick. The re-plan was a bare `findRoute` under the hero's own capabilities, so
the moment the thread was spent the guide asked a **stricter** question than the screen
had answered, found nothing, and took `clear()` — which drops the route, and
`isActive` is false, and the overlay draws nothing. `console.warn` says so, once:

```
[path] dropped: no route from map0 (61,7) to map0 (128,33)
```

Worse than a wrong line, because there is nothing to look at at all.

Two causes, both state the screen knew and the guide did not:

- **The key a route fetches.** On a **fresh game** — no open doors involved —
  `mp10(61,7) → mp10(128,33)` has no route at all with an empty pocket, so the screen
  answers at its `collectKeys` rung and hands over a route that walks to the key at
  `mp10(99,41)`. Re-planned without `collectKeys`, with an empty pocket and a locked
  door, there is no route. **This is the ordinary case and it broke every fresh
  journey of this shape.**
- **The door that key opened.** After the boss, the door is open and the key is gone;
  re-planned against level data, which says the door shipped locked, again nothing.

The fix is that the screen now says *how* it planned. `NavRoutePlan` is the subset of
`FindRouteOptions` that changes the answer — `collectKeys`, `collectAccessories`,
`planAccessories`, `keyPresent`, `shoePresent`, `doorOpen` — and `onPick` and
`PathGuide.setRoute` both carry it. The guide replays it on every re-plan, and
`doorState()` falls back to the live `doorOpen` on its deps for a route handed over by
any other caller.

The guide already did the equivalent for shoes — `wantsShoes` widens the mask to
`SHOE_MASK` when the route it holds names a pair — which is why a shoes route survived
all along and a key route did not. The assumption is now carried rather than inferred.

### 26.6 And then it died at the first door

`keyPresent` and `shoePresent` had a fault that was invisible while the map screen was
the only caller, because it could only ever ask about the cavern the player was standing
in. Both closures ignore the `mapId` they are handed:

```ts
keyPresent: (_mapId, col, row, kind) => keysOnFloor.has(`${col},${row},${kind}`),
```

`keysOnFloor` is `presentKeys(getGmem())` — the entity list of the **loaded** cavern,
read once at dungeon init. It is not a table of the game's keys; it is one cavern's. So
the moment the hero walks the thread through a door, those closures answer about the
cavern he is now in, and about nothing else.

And the route is routinely longer than one cavern. **[measured]** the bare route for
`mp10(61,7) → mp10(128,33)` is 752 points over `maps [0, 3, 0, 1, 0]` — mp10 → mp21 →
mp10 → mp1d → mp10 — and the first foreign point is index **555**, mp21 `(79,51)`.
Standing there, mp21 holds no keys, so a key lying in mp10 read as already collected,
the re-plan could not fetch it, and the route was cleared. Which is exactly the report:
*chevrons up to the first door between mp10 and mp21, and nothing after it*.

**The rule is that an unknown cavern is not known to be empty.** The search already
assumes every key is present when it is given no callback at all, and that is the right
default: a route that detours to a cavern the engine has not loaded should fetch what
the level data says is there, because "I have not looked" is not "it is gone".
`liveDoorOpen` already follows it with its `null`. So the two closures now gate on the
map they are asked about, through a new `isLoadedCavern(g, mapId)`
(`engine/dungeon-items.ts`), and a cavern that is not loaded answers true.

That helper lives in the engine rather than in the composition root because it is a
statement about what the engine knows, not about how the app is wired — and it is what
makes the rule testable at all, since `main.ts` is not.

### 26.7 Tests

971 pass, `tsc --noEmit` clean, `nav:check` up to date.

- `tests/map-screen.test.ts` — *"asks for the keys before it asks for shoes"*, naming
  both routes with their costs so the order cannot move back unnoticed. Fails on the
  old order with `no accessory on a route that needs none: expected [ { accessory: 1, …} ]`.
- `tests/nav-accessories-extraction.test.ts` — the four records against the player's
  coordinates and names, a second decode written out longhand, four pairs in the whole
  game, and that mp50's and mp60's come out different pairs from the *level* rather than
  from anything in the record.
- `tests/nav-guide-cross-door.test.ts` — `isLoadedCavern` against a memory image, the
  route's `[0, 3, 0, 1, 0]` shape and its first foreign point at 555, that a re-plan
  from mp21 keeps the route when `keyPresent` answers honestly, and that the same
  re-plan drops it when the callback ignores the map — the two halves of the fault, so
  neither the bug nor the fix can be lost.
- `tests/nav-guide-replan.test.ts` — five checks on the re-plan: a route that fetches a
  key keeps it and draws, a route through an open door keeps it, the `doorOpen` on the
  deps answers for a route set without a plan — and, for both, the same route with the
  plan withheld is dropped on the first frame, which is the thread vanishing.
- `tests/map-screen.test.ts` — *"asks for nothing at all once the door is open and the
  key is spent"*, the post-boss state: `keyPresent` says the key is gone and `doorOpen`
  says the door it opened is open. Fails without §26.4 with
  `nothing to put on: expected [ { accessory: 1, …(2) ] to deeply equal []` — the
  reported symptom, verbatim.
- `tests/nav-shoe-routing.test.ts` — a journey that only a pair opens, found from the
  graph rather than written down, because both ends have to be standing positions and
  the pair's record cell is not one. Then: the route walks over the pair, names it,
  does so once and keeps it for the rest; the same journey is unreachable without the
  flag and with the pair marked as already taken; and a pair he already wears counts
  from the first step.

## 27. A chevron pointing into the ground, and a trip that had grown 116 hops

### The report

Thread of Yaga, `mp80 (111,21) → mp81 (123,6)`: the route "seems incorrect" — the
chevron at `mp80 (27,21)` points straight down into solid ground, and it is unclear
where to go next.

Two defects, both in the guide, and the second finding explains the number the report
opened with: the trip had grown from 152 hops to 269 since §17 measured it, and that
growth is correct.

### 27.1 The guide's platform mask was not the graph's

`buildNavGraph` marks a platform's landing surface family by family (§25): a
**horizontal** platform sweeps one fixed row, so every column of its span is a row it
will be at again and the whole span is landable; a **vertical** one has only the row it
is standing at, and `isLandingSlot` is the whole of it.

`PathGuide.flightModel` filtered *both* families through `isLandingSlot`. **[measured]**
on mp80 that is 36 marked cells against the graph's 158, and on the row-33 platform —
span 22..44, fifteen landing columns — three against fifteen.

**[measured]** the trip's first fall, `FALL mp23(26,21) → mp23(29,30)`:

| model | `flightPath(25,21 → 29,30)` |
| --- | --- |
| the graph's mask | `(25,21) (25,21) (25,21) (25,22) (25,23) (25,24) (25,25) (25,26) (26,27) (27,28) (28,29) (29,30)` |
| the guide's mask | empty |

An empty flight is the two-ends fallback, so the overlay drew a single chevron. It is
drawn at the route point's column **plus one** — the engine's own "the hero's cell",
which is what puts a chevron on his sprite — so the player read it at `(27,21)`, and
row 24 under that column is rock: the shaft is columns 24-26, and the landing is nine
rows below, undrawn. One arrow, into the wall, with the way down missing.

The guide now asks the rule the graph asks.

### 27.2 A fall that begins two columns out

`addFalls` asks from `node.col + dir` **and** from `far = node.col + 2 * dir` — the
two-tile step off a rope, which is the only way off one. `FALL_STARTS` had the first
and not the second, so `FALL mp23(103,39) → mp23(108,41)`, which begins once he has
stepped out to 105, could not be replayed either. Both starts are asked now.

**[measured]** the whole trip: **six** of its flight hops fell back to their two ends
before, **none** after.

### 27.3 The trip had grown, and the growth is right

**[measured]** `mp80 (111,21) → mp81 (124,6)`, by commit:

| commit | shoes | no shoes |
| --- | --- | --- |
| `7efc96f` | 152 hops, cost 290 | 184 hops, cost 320 |
| `a3a29b9` | — | 224 hops, cost 358 |
| `d1a5028` | — | 406 hops, cost 547 |
| `d28ab04` | — | 319 hops, cost 437 |
| now | 268 hops, cost 409 | 319 hops, cost 437 |

`(123,6)`, the cell the report names, is one hop more: 269 hops, cost 410.

The old route crossed **mp25**: `mp80 → door (250,31) → mp25 → door (174,10) →
mp81 (227,60)`, three map changes and 184 hops of it. What went is the far-east leg.
**[measured]** the cost of standing at `mp80 (250,32)` from `(111,21)`, with every edge
allowed:

| commit | cost |
| --- | --- |
| `7efc96f` | 138 |
| `684ae11` | 158 |
| `a3a29b9` | 172 |
| `d1a5028` | no route |
| now | no route bare, 656 with shoes |

`d1a5028` is *"a platform was a place, not a thing"*: `isLandingSlot` made only a
vertical platform's resting row landable, which is the engine — §2.7's lift is driven
by the hero, so while he stands on the ground it is where he left it. The old route's
first move into the far east was

```
JUMP_HIGH mp23(8,37) → mp23(1,35)
```

a landing on the column-1 lift at head row 35 — platform row 38 — while it rests at
`startY` 34. Taking the `isLandingSlot` filter back out restores `(250,32)` to 146;
leaving it in leaves the old numbers unreachable. **The shortcut was never legal**, and
152 was measuring a route through a platform that was not there.

Priced honestly, the search goes west: row 21 out to `(26,21)`, down the shaft onto the
row-33 platform, the row-25 corridor, the row-41 gallery, and the door at `(117,31)`.
That is not a preference, it is the optimum under the corrected graph — and the shelf
has no shorter way down. **[measured]** east of the column-95 up current, row 24 is
solid from column 97 to 155, so the row-21 shelf the route walks has no drop east of
it; the descent is the shaft at column 26.

### Still open: riding a platform is priced above hopping along it

**[measured]** on mp80's row-33 platform, from the ride cell `(29,30)`:

| edge | cost |
| --- | --- |
| `RIDE_H → (30,30)` | 4 |
| `FALL → (30,30)` | 2 |
| `FALL → (31,30)` | 3 |

So the route hops along the platform in two-column arcs and the overlay draws those
arcs faithfully — four of them, immediately after the shaft, which is exactly where the
report was looking. Two reasons, neither of them touched here:

- `nav-graph.ts` prices **every** horizontal ride at `RIDE_H_SLOW`, though
  `RIDE_H_FAST` exists and the engine moves a `speed 1` platform every other tick and
  any other speed every tick (`dungeon-platforms.ts:229`). mp80's row-33 platform is
  speed 2 and is charged the slow price.
- A same-row landing is charged `frames + sideways` with `frames` counted at 1, while
  the flight it draws takes four frames.

Fixing either reprices every horizontal platform in the game, which is its own round
with its own before-and-after route measurements. Recorded here so it is not rediscovered
as a new bug.

### What would make this wrong

Three ways. If the engine really does let a hero aim at a platform well below
him, five rows is an invented limit and §28.4 is deleting moves the game makes —
and if a *fall* is as blind as a jump, exempting falls leaves the same edges in
under a different name. If a hero could wait for a lift he does not drive,
`isLandingSlot` would be wrong for
vertical platforms too and §27.3 would be arguing against the engine. The test is the
trip again: it should come back at 152 hops through mp25, and it does not.

### Tests

972 pass, `tsc --noEmit` clean, `nav:check` up to date.

- `tests/path-overlay.test.ts` — *"replays every flight in the trip the player
  reported"*: the real `(111,21) → (123,6)` trip, every `FALL`/`JUMP`/`JUMP_HIGH`/`DROP`
  in it asked of `cellsForHop`, and none may come back as its two ends. Without §27.1
  and §27.2 it fails with six of them, the first being `FALL (26,21)→(29,30)`.

## 28. The impossible rope grab, and the route that walked east through a gale

Defects the player named in `mp80 (58,16) → mp81 (123,6)`, in the mp82 gallery,
and in the key route out of `mp82 (26,47)` — each of them the graph offering a move
the game cannot make, each fixed in `nav-graph.ts`. A jump may not take a rope below
it; the hero does not walk east into a west wind; he does not jump a platform he
cannot see; and he does not let go of a rope while there are rungs left under him.

Then came `WORK/DOC/esco.txt`, the player's own recording of a real journey, and it
found two faults of a different kind: the graph did not know *where the hero was*
(§28.6) and it read *how far down* a landing was wrong at the seam where row 63
meets row 0 (§28.7).

### 28.1 A jump may not *take* a rope below it

**[measured]** mp82's `JUMP_HIGH (44,37) → (62,37)` — rope tile 63, rope node at
column 62, one west of the tile — was in the graph. The hero takes a rope with
**upward** momentum: he grabs the rung above his head on the ascending part of the
arc, or he does not grab at all. A trajectory that ends below its launch passes the
rope on the way *down*, and the engine hands control back to the player only once the
arc is over.

`addJumpEdges` now refuses any rope landing whose row is below the launch
(`target.kind === NODE_ROPE && toRow > fromRow`). While testing it, `landingAt`
was also returning `-1` when no rung was in reach and the old code pushed that
through to `nodes[-1]` — an `undefined` node that cost `NaN` in A\*; that branch
now `continue`s.

The reported descent is the one the player described and it is what the graph gives:
climb down rope col 47, fall to the horizontal platform, walk to its rightmost tile,
cross to the neighbouring platform, climb col 63's rope when it arrives.

**What would make this wrong** — if the engine let a hero grab a rope while falling
past it, this guard would delete a legal move. `jump.ts` traces the arc frame by frame
and the grab is only tested at the apex-to-landing end of it.

### 28.2 Walking east into a west wind

**[measured]** mp82 row 44 carries `AIRFLOW_LEFT` across **columns 137–141**, with
rock beneath it (r40 solid cols 128–148, r41 solid 135–147, r42 solid 136–142) and a
floor at r47–49. The gallery runs from column 128 to 142 at row 44 with **no other
row** through it. The player reported the crossing `134,44 → 142,44`.

Walking was already refused — `blockedByCounterCurrent` (`geometry.ts:316`) finds the
current in the box the step takes. What was left was a chain of **FALL** edges that
never fell: `134→135`, `135→136`, `136→137`, `137→138`, `138→139`, `139→141`, then
`WALK 141→142`. Each fall is one column, each lands on the same row, and together they
walk the hero through the blow.

That is not what the game does. `checkAirflowsOnHero` (`dungeon-frame-pre.ts:65`)
runs every frame, before anything else, probing the middle column rows `head..head+2`
— which for a hero standing at row 44 is rows 44, 45, 46 — and on `AIRFLOW_LEFT` calls
`moveHeroLeftIfNoObstacles` **twice**. Two columns a frame, west, with no test beyond
the move itself. He never comes to rest in the band, so the band is not a place a route
can enter and leave at will; and a flight across it is pushed back out the moment it
lands. The engine's own arithmetic settles it: net one column a frame *against* the
blow is the best any input can do.

`pushedBack(fromIndex, toCol, toIndex)` (`nav-graph.ts`) refuses a jump or fall whose
landing is in a sideways current **when the horizontal step goes against that current**,
in both `addJumpEdges` and `addFalls`. East-with-the-blow stays legal — that is the way
the wind carries him, and it is how the hero gets *out* of the gallery.

**[measured]** after the fix, on mp82:

| probe | hops |
| --- | --- |
| `(134,44) → (142,44)` | NULL |
| `(142,44) → (134,44)` | 8 |
| `(145,44) → (26,19)` | 78 |
| `(119,25) → (145,44)` | 58 |

The wind still runs one way and the graph now does too.

The first attempt was the other half of the same idea: refuse every jump and fall whose
**source** sits in a sideways current. That is the truer statement of "he cannot rest
here", and it is what `swept` did — but it costs the mp80 shaft entry
(`(92,29)`, held by column 93's `AIRFLOW_RIGHT`) and buys nothing the landing-side
refusal does not already refuse, so it is out.

### 28.3 What the closed gallery cost

The crossing the player complained about was also the route the graph was using for
three other journeys, because it was the only east-west link mp82 had at row 44 and the
only way into mp80's row-32 gallery. **[measured]**, every one of them carried
`FALL (135,44)→(136,44)` … `(138,44)→(139,44)` in it:

| journey | hops with the band open | after |
| --- | --- | --- |
| mp80 `(111,21) → mp81 (123,6)` | 301 | NULL |
| mp80 `(111,21) → (117,32)` (door, mp81) | 218 | NULL |
| mp80 `(58,16) → (166,31)` | 129 | NULL |
| mp82 `(19,0) → (15,10)` | 536 | NULL |

mp80's own row-32 band has the same shape — `AIRFLOW_LEFT` across columns 134–138 with
nodes at 132, 133, 136 and no other row through it — and the rule refuses
`FALL (132,32)→(133,32)` … `(136,32)→(137,33)` there too.

mp80's shaft is the other half of the cost. With the lifted-node guard on, `CARRY_L
(95,27) → (96,29)` is gone — col 97 blows west, and `(96,29)` is a held cell, not a
rest position — and **`(96,29)` has no in-edges at all** except `JUMP_HIGH` up from the
row-32 nodes at columns 97–101, which came out of the same cavity. The lower-east
cavity (rows 28–31 east of column 98, and everything below it) is entered only from the
east. The route the graph found before walked the long way round — west to column 84,
`JUMP_HIGH` to row 16, back east along row 16 — and then across the shaft with that
impossible carry. **[measured]** `111,21 → 92,29` = 126 hops and `→ 92,21` = 19 hops
both still work, so the shelf is fine; it is the drop through the mouth that is sealed.

### 28.4 The jump that lands where he cannot see

**[measured]** the same mp82 report gave the second half of the fix. Once the
rope landing was refused, `JUMP (44,37)` kept a different edge out of the same
ledge: `JUMP (44,37) -> (61,49)`, twelve rows down onto the platform behind
rope 47. `JumpModel` allows one column of drift per row it falls, so a flight
that rises two rows and drops fourteen is arithmetically reachable — and
practically a blind throw, because at take-off the platform is far below the
ledge he is standing on. The player's rule: **a platform more than five tiles
below the jump's starting point is not one he can aim at.**

`addJumpEdges` now refuses any landing with `toRow - fromRow > 5`. Falls are
untouched: stepping off a ledge is a drop he watches and steers, not a jump he
takes blind, and every shaft the routes descend is a fall.

**[measured]** the rule costs **634 edges** across the three caverns and nothing
else — mp80 281, mp81 231, mp82 122 — and the suite does not move: 965 pass,
the same 5 fail as before it. The deepest of them is `JUMP (180,0) -> (184,63)`
on mp82, sixty-three rows, a fall the whole height of the map dressed up as a
jump because the model lets it drift sideways while it drops.

That last one turned out to be neither. Row 63 sits one row *above* row 0, so the
edge was one row up and the sixty-three was an artefact of a raw subtraction; §28.7
counts the rows through the seam and puts it back.

With both halves in, the edges out of `mp82 (44,37)` are the ones the player
described and no others:

```
WALK      -> (43,37)
JUMP      -> (42,37) (41,37) (40,37) (39,37)
JUMP      -> (46,37) (46,36)          rope column 47, beside the ledge
JUMP_HIGH -> (38,37) (37,37)
JUMP_HIGH -> (46,35)                  rope column 47, above the launch
FALL      -> (46,38) (46,39)          onto that rope — the way down
FALL      -> (45,49) (43,49)          a drop, steered, not a jump
```

The route out of the key now falls onto rope 47 at `(46,39)` and climbs it — 152
hops where the blind jump made it 136. Where it *leaves* that rope is §28.5.

### 28.5 Leaving a rope: the rung directly above where he is going

**[measured]** the player's reply to §28.4 corrected the last piece. Banning the
blind jump fixed *where the route took off from*; it did not fix *where it let go
of the rope*. After §28.4 the key route still read

```
CLIMB (46,40) -> (46,41) ... -> (46,44)
FALL  (46,44) -> (53,49)      five rows down, seven columns east
```

and the player's instruction was that this is the wrong answer twice over: *"It
should be always preferred to climb down a rope as close as possible to the
platform. That is (46,48). Only then hero should leave the rope and fall on the
platform."* The rope is the way down. Letting go at `(46,44)` means falling past
five rungs he was already standing on, onto a platform that is outside the five
tiles he can see.

**[measured]** the three states of `mp82 (26,47) → mp80 (58,16)`, by how far below
the rung a rope may let go:

| rope-sourced fall allowed | hops | where he lets go |
|---|---|---|
| no limit (§28.4 as shipped) | 152 | `FALL (46,40) → (57,49)` — nine rows up the rope |
| more than 5 rows | 158 | `FALL (46,44) → (53,49)` — the state quoted above |
| more than 1 row (**shipped**) | **154** | `FALL (46,48) → (48,49)` — the player's walk |

`addFalls` now refuses a rope-sourced landing more than one row below the rung:

```ts
if (nodes[fromIndex]!.kind === NODE_ROPE && landings[i + 1]! - row > 1) continue;
```

(§28.7 replaces the row difference with one counted through the seam; the rule is
the same one.)

One row is what a drop onto the tile beside the rope is; two is a decision to
fall rather than to climb, and there is no rung it saves. The rule is rope-only —
stepping off a ledge is the ordinary fall, and §27's trip descends the mp80 shaft
in one of them. A *general* five-row limit was tried first and costs a sixth test
(`map-screen`, `111,21 → 124,6` came back as `route.maps [0,1,0]` instead of `[0]`),
which is why the guard is keyed on `NODE_ROPE` rather than on the landing.

**[measured]** the rule removes **4202 rope-sourced fall edges** — mp80 1489, mp81
1500, mp82 1213 — the deepest of them `worst 28` rows on mp80. Every rope node
still has an exit: mp80 277/277 ropes with a fall before, 272 after; mp81 256 → 249;
mp82 199 → 192, and **zero ropes are stranded** in any of the three maps. The suite
does not move: 965 pass, the same 5 fail.

The key route out of `mp82 (26,47)` now reads, in full:

```
WALK      (40,37) -> (41,37) -> (42,37) -> (43,37)
FALL      (43,37) -> (46,39)            onto rope 47
CLIMB     (46,39) -> ... -> (46,48)      down to the rung above the platform
FALL      (46,48) -> (48,49)             the only let-go, one row down
JUMP_HIGH (48,49) -> (57,49) -> (62,46)  along row 49, onto rope 63
CLIMB     (62,46) -> ... -> (62,35)      up to the gallery
```

which is the walk the player recorded — down rope 47 to `(46,48)`, off it, along
row 49, up rope 63 — at **154 hops**. (§28.7 counts the same rows through the seam
at the top of the map and revises the edge totals above; the route does not change.)

### 28.6 The hero on a rope has a position

**[measured]** the player handed over `WORK/DOC/esco.txt` — *a nav recording: 585
cells, 21589 frames, maps mp82, mp80, mp81* — the real journey, walked. Its last
line reads *"181 hop(s) the graph does not have; each \*\*\* line above is a bug in
the graph"*, and not one of those 181 is a missing **edge**: every hop whose two
cells resolve is in the graph. What was missing was the lookup.

`nodeAt` read `groundOf` alone:

```ts
export function nodeAt(graph: NavGraph, col: number, row: number): number {
    return graph.groundOf[r * graph.mapWidth + wrapCol(col, graph.mapWidth)]!;
}
```

so every cell where the hero stands on a rope or rides a platform answered -1, and
the recorder called it *"is not a standing position"*. The graph had built that node
three hundred lines earlier; `landingAt`, which decides where a flight may land,
already resolved **rope → ride → ground** and used it. Two questions — *where is he*
and *where may he land* — were being answered from two different tables, and the
first one only ever read the third entry.

`NavGraph` now carries `standOf` beside `groundOf` and `ropeOf`, filled with the same
precedence, and `nodeAt` reads it.

**[measured]** that clears **121 of the 181** flagged hops; 60 remain over **39
distinct cells**, in three kinds:

| kind | cells | what they are |
|---|---|---|
| the tile beside a rope | 5 | mp82 `(158,44)` `(170,23)`, mp81 `(161,35)` `(141,28)` `(120,14)` — the hero is one column east of the rope *node*, on the rope *tile*. The engine puts a hero on a rope at `heroCoords + 1`, so the node is at the tile's left; the cell he steps onto as he lets go has no ground under it, and the graph expresses the step as one `FALL` out of the rope node. |
| where a platform was | 13 | mp82's shaft at column 80, column 184 rows 58–60, the block along row 56 — beside a `NODE_RIDE` node. The graph is a snapshot of where the platforms stand *now*; the recorder diffs the whole journey against the graph as it is **at the end of the recording**, so a cell the platform occupied twenty minutes earlier is gone by then. |
| no node at all | 21 | void (tile 0) or solid where `isStanding` is false: mp82 `(80,0)` `(81,0)` `(82,0)`, the gaps in row 51 at columns 183–185, `(183,32)`, `(11,17)`; mp80 `(124,32)` `(126,32)` `(138,30)`; mp81 `(165,26)` `(139,23)` `(139,27)` `(134,9)`. |

The first kind is the graph being right and the recorder being finer-grained than
the model; the second is a property of a recording, not of a graph; the third is
where the work is, and none of it is a route the graph currently offers anyway.

One consequence had to be undone. `path-guide`'s `needsReplan` was leaning on
`nodeAt < 0` to mean *"the hero is not standing still"* — mid-jump and mid-ride he
has no node, so the route did not rebuild under him. With `standOf` filled in,
rope and ride cells answer with a real index and the guide rebuilt **1470 times**
on `nav-platform-state`, which expects none. `needsReplan` now asks `graph.groundOf`
directly, wrapped, which is the question it always meant to ask: a hero who is
standing on *anything* has not moved, and a hero in the air has. The two functions
differ on purpose — *where is he* vs *is he at rest* — and neither is a substitute
for the other. With both halves in, `tsc --noEmit` is clean and the suite does not
move: **965 pass, 5 fail**.

### 28.7 Counting rows across the seam

**[measured]** the same recording climbs mp82's column 184 by hopping off the top
of the map:

```
JUMP (181,0) -> (182,63) -> (183,62) -> (184,62) -> (185,63) -> (184,63)
```

The map wraps vertically — stepping up off row 0 lands on row 63, and falling off
row 63 lands on row 0 — and every row guard in `nav-graph.ts` read the difference
raw. From row 0 to row 63 is **one row up**; the raw `toRow - fromRow` says
sixty-three **down**. Three guards were therefore backwards at the seam:

- `addJumpEdges`'s blind-jump rule refused the hop as a 63-row fall;
- `addJumpEdges`'s rope rule read a rope hanging at row 63 as *below* a launch on
  row 0 and refused it;
- `addFalls`'s rope-exit rule read a fall from row 62 onto row 1 as sixty-one rows
  *up* and let through a fall it should have refused.

All three now count from where the arc turns over:

```ts
const rises = landings[i + 3]!;
const apex = wrapRow(fromRow - rises);
const below = wrapRow(toRow - apex) - rises;
if (target.kind === NODE_ROPE && below > 0) continue;
if (below > 5) continue;
// ... and in addFalls:
if (nodes[fromIndex]!.kind === NODE_ROPE && wrapRow(landings[i + 1]! - row) > 1) continue;
```

`rises` is how far the arc climbed before it turned over, so `apex` is where it
turned and `below` is the rows between the launch and the landing whether the
flight crossed the seam or not. Off the seam `below` reduces to `toRow - fromRow`
exactly, which is why §28.4 and §28.5's numbers still stand for everything except
the seam.

**[measured]** A/B, old guard → new, over the three caverns:

| map | JUMP + JUMP_HIGH | FALL | of which from a rope |
|---|---|---|---|
| mp80 | 16272 → 16247 | 11985 → 11899 | 847 → 761 |
| mp81 | 13121 → 13137 | 9243 → 9176 | 705 → 638 |
| mp82 | 11600 → 11509 | 8125 → 8106 | 556 → 537 |

The seam both **gives** and **takes**. mp81 gains 16 jumps that land just above
their launch; mp82 loses 91 that wrapped the other way and were really thirty-row
falls — the old `JUMP (180,0) → (184,63)` of §28.4's table was one of them, counted
at 63 rows because the arithmetic never looked at where row 63 sits. The rope-exit
rule now removes **4374 rope-sourced fall edges** rather than §28.5's 4202, the
extra 172 being the wrapped ones. Ropes with no fall at all stay where §28.5 left
them — mp80 5, mp81 7, mp82 7 — and **`JUMP (181,0) → (184,63)` exists again**.

The key route does not move: still 154 hops, still `FALL (46,48) → (48,49)`, still
§28.5's trace hop for hop. The suite does not move either: **965 pass, 5 fail**,
the same five before and after.

### Still open: three routes the fix took away, and the recording's own

`npx vitest run` is **5 failed | 966 passed** — the same five as at §28.3. **None is
pre-existing**: all five pass with `web/src` reverted to `37ba8f1`, which the earlier
version of this paragraph got wrong when it called two of them pre-existing.

**[measured]**, reverting one refusal at a time:

| single revert | tests it restores |
| --- | --- |
| the lifted-node guard on `enterConveyor` (the mp80 shaft mouth) | **all five** |
| §28.2's fall `pushedBack` | three |

So `map-screen:482` and `nav-route-cases:220` — both *"needs no key"*, both
`111,21 → 124,6` on `bareCapabilities` — are the shaft guard's on their own. The
other three need **both** refusals closed to fail, which also corrects §28.3's
attribution of them to §28.2 alone:

- `nav-route-cases:172` *"mp81: a jump into an up current → finds the route the player named"*
- `path-overlay:425` *"draws a lift as the two legs it is"*
- `path-overlay:507` *"replays every flight in the trip the player reported"*

Open either edge and the graph finds a way; close both and it does not. That is the
shape of a journey with two alternative legs, not evidence that either refusal is
wrong — but it does mean §28.3's table understated the cost by naming one refusal
per row.

**[measured]** the two that matter are closed components, not missing nodes. Flood
from `mp80 (111,21)` reaches **1409 of 2170** nodes, columns 0–255, rows 0–63 — and
is closed: no edge leaves it. Its whole footprint along the bottom gallery is row 21
(columns 88–123) plus a stub down to row 24 at columns 93–95. `(117,32)` is 11 rows
below `(117,21)`, both have nodes, and nothing joins them. Flood from `mp82 (102,54)`
reaches **771 of 1515** and is closed too: it gets as far as `(181,0)` and, since
§28.7, across the seam to `(184,63)` — but not to `(177,45)`, `(5,25)` or `(26,19)`,
because the lift that carries a hero up column 184 is only where it stands *now*
(rows 61–63) and the cells it covered during the recording are gone.

Nothing in §28.1 or §28.2 is going back: both are the engine's own behaviour, and both
measured refusals are correct. What is undecided is whether each of the three has a
legitimate route the graph still does not know (mp82 `(19,0) → (15,10)` is the doubtful
one — `(15,10)` is reachable from `(73,26)`, `(119,25)` and `(26,19)` but not from its
eastern neighbour, at any hop count), or whether the assertion should be re-pointed at
the journey the graph can honestly make.

### What would make this wrong

If the engine only applies the wind to an *idle* hero — not one mid-flight — then
`pushedBack` is deleting legal crossings and §28.2 is the bug rather than the fix. The
test is the player's own complaint: they said the crossing cannot be made, and the
graph said it could. §28.1 has the same shape in reverse: if a hero *could* take a rope
on the way down, deleting that grab would hide a route the game allows. §28.5 has
the third shape: if a rope can end *above* the floor it serves — rungs stopping five
rows short of the platform — then "one row below the rung" deletes the only way off
it. It does not today (every one of mp80's 20, mp81's 18 and mp82's 15 rope columns
still has an exit), but a cavern drawn with a hanging rope would.

§28.6 would be wrong if a hero on a rope or on a platform were *not* somewhere a route
may be planned from — if `standOf` should answer -1 there after all. It is not a
theory: `try_climb_rope` reads `heroCoords + 1`, the hero has a cell while he climbs,
and `landingAt` was already treating that cell as a legal landing. What would make
§28.6 *hurt* is the other half — if `path-guide` ever ought to re-plan while he is on
a rope or a lift, because `needsReplan` now reads `groundOf` and a hero on a rope
never rebuilds the line under him.

§28.7 would be wrong if the map did **not** wrap vertically — if row 63 were the floor
of the world instead of one row above row 0 — because then `wrapRow` in these three
guards measures a descent that never happens and quietly refuses the long falls at the
bottom of every cavern. The recording is the evidence the other way: the player's hero
walks off `mp82 (181,0)` and lands on `(184,63)`, and climbs column 184 from there.

## 29. Two rungs short: the screen never granted shoes and keys at once

The map screen plans a destination with a ladder of `findRoute` calls in
`map-screen.ts`, one axis per rung: as he is, then `collectKeys`, then
`collectAccessories`, then `planAccessories`, then `unlimitedKeys`. The journey the
player opened this session with — **mp80 `(111,21)` → mp82 `(102,54)`** — is short of
*both* at once, and no rung granted both:

| rung | grants | for `(111,21) → (102,54)` |
| --- | --- | --- |
| 1 held | — | NULL |
| 2 collected | keys | NULL — the ramp at mp80 columns 82..86 needs Silkarn |
| 3 shod | shoes walked to | NULL — the door at `(57,16)` needs a key |
| 3b worn | shoes from the pocket | NULL — same door |
| 4 open | `unlimitedKeys` | NULL — `unlimitedKeys` seeds the key counters but only `planAccessories` ORs `SHOE_MASK` (`pathfinder.ts:690`) |

so the screen reached `map.unreachable` for a journey of **384 hops** and never
`map.needsOneKey`.

**[measured]** with `bareCapabilities()`:

| search | hops |
| --- | --- |
| `planAccessories` + `collectKeys` | **384**, one ordinary door, two changes of shoe |
| `unlimitedKeys` + `planAccessories` | **51**, one ordinary door |

Neither half was wrong on its own — `111,21 → 26,47` needs no shoes at all (253 hops
bare) and `26,47 → 102,54` answers as soon as the state has both, which is why the
journey *looked* half-findable. `findRoute` plans the whole trip in one search from
the state it is handed; it does not splice two halves planned under different states.

**The fix.** `collectKeys` (and `keyPresent`) now go with every rung below the first,
rung 4 takes `planAccessories` as well, and every plan handed to `accept()` carries
the same `keyPresent`/`shoePresent` the search under it used, so `path-guide`
re-plans under identical assumptions. Rung 2 still runs on its own first, so a journey
the keys alone cover is never sent in shoes — that ordering is what *"asks for the
keys before it asks for shoes"* pins down, and it still passes.

Regression test: `map-screen.test.ts` *"sends a journey that needs shoes and a key at
the same time"*, which fails without the change and passes with it.

**What would make this wrong** — if changing shoes cost anything, rung 3b's promise
would be false and a route that asks for two changes would not be the honest answer.
The engine says otherwise: `equipment` exists precisely because the swap is free and
the player has to be told which pair the journey wants and where.

### Tests

966 pass, 5 fail. The five are §28's refusals and are attributed in *"Still open"*
above — none is pre-existing at `37ba8f1`. `tsc --noEmit` clean, `nav:check` up to
date.

## 30. The frame that froze, and the line that looked equally solid on both sides of a door

Two reports from the player, one in each half of the path overlay.

**The report.** The game froze at random for several milliseconds while he was
following the chevrons; and the chevrons *after* a door did not fade — they came out
at the same strength as the ones leading *into* it.

### 30.1 The freeze was the search, and it was being asked for while he moved

`PathGuide.tick` runs `findRoute` synchronously inside the frame. It is the only
synchronous search in the loop, and it rebuilds cavern graphs through `store.get`
when a platform has moved — a stall of the size reported, at the times reported
(whenever the world under the route changed while he was walking it).

**The fix.** `PathGuideDeps` takes an optional `isIdle`, consulted immediately
before `findRoute`. `main.ts` wires `createHeroIdleProbe` (`engine/nav/idle.ts`),
which answers from the bytes the frame itself writes rather than from a guess about
the tile under him:

| question | byte | why it is a frame he is not idle in |
| --- | --- | --- |
| key held down | `0xff17`, `0xff16` | he is pushing, even into a wall he does not move through |
| airborne | `0xff3d` | the frame set it; the next one clears it |
| sliding | `0x9f22` | a slope is carrying him |
| climbing | `0xff39` | a rope is carrying him |
| in a jet | `0x9f15` | an up current is carrying him |
| cell unchanged | `heroMapPosition()` | covers everything the flags do not: a walk, a fall, a platform under him |

Deferring costs nothing, and that is the point of where the guard sits: `lastPlanAt`
is written *by* the search and not by the decision to run it, so a busy frame
postpones the re-plan to the first idle one instead of pushing it back every time it
is asked. The trade he asked for is explicit — a route that lags a step behind
while he walks beats a frame that drops.

### 30.2 The opacity ran on drawn cells, so the counter stopped at every door

`chevronAlpha(ahead)` is a function of distance along the route: solid for three
cells, fading to `CHEVRON_FAR_ALPHA` (0.15) by fifteen. The loop fed it `drawn` —
marks actually *placed* — so every cell the viewport could not see left the counter
exactly where it was.

Everything past a door is such a cell: those cells are on another map, so
`viewportPixel` returns null for every one of them and they are drawn as a marker on
the border instead. None of them moved `drawn`. So all of them came out at the
opacity of the last chevron *before* the door — leading to the door and leading from
it looked equally solid, which reads as "don't go in".

**The fix**, in two rules in `drawPathOverlay`:

- `step` counts every cell the route yields, visible or not, and is what the fade
  runs on; `drawn` counts marks and only bounds the loop. A border marker on the
  hero's *own* map therefore keeps the fade it would have had if it had been on
  screen — the counter no longer restarts whenever the line leaves the viewport.
- a cell in another room has no distance to show on this one, so it takes
  `CHEVRON_FAR_ALPHA` outright: the marker says only "it leaves that way", which is
  the near-transparency he asked for — as faded as fifteen cells away, whatever the
  counter happened to be at the door.

Intra-map doors are covered by the first rule alone: their cells stay on the hero's
map, so the fade simply continues through them instead of being frozen.

### 30.3 The line that came out of a door he had never entered

A second report, with two screenshots: approaching the door, the line fades as it
should; *missing it by several tiles* and the way out of the door is drawn at full
strength, so the route tells him to walk on past an entrance he has not gone
through — and the whole point of going in is what is in there.

**[measured]** A route which goes in for a key looks like this in the point list:

```
map0 (10,10) (11,10) (12,10) | map1 (3,10) (4,10) | map0 (12,12) (11,12) (10,12)
        the way in           |      the key      |        the way out
```

The hero's own map appears **twice**. `advanceProgress` scanned the whole list for
the cell he is standing on and found the *second* visit, so the anchor — and with it
`remaining()` and the fade's step counter — started on the way out. Cells three
steps from the anchor are at full strength by construction, and they sit on his own
row at real positions: not a marker on a border, but a line of arrows running out of
the door. Standing at the door the anchor is still on the way in, which is why the
first screenshot was right and the second was not.

**The fix**, in three places, all saying the same thing — *a point on the far side of
a door he has not crossed is not the route ahead of him*:

- `advanceProgress` stops at the first point that leaves his map, so the anchor can
  be carried across a door he has just walked through (it is left on the map he
  left, and is skipped forward) but never *jumped* to the far side while he is
  standing here.
- `drawPathOverlay` finds the first crossing *back* into his map and draws
  everything from there at `CHEVRON_FAR_ALPHA` — the same faintness as the cells on
  the other side of the door, so the whole un-entered stretch says one thing
  wherever he is standing.
- the drift check in `needsReplan` stops at that crossing too. It used to `continue`
  past it and pick up the return leg on the way out, which called him "on the route"
  while he walked past the very door the line was leading him to; he is now off it,
  and the refresh interval re-plans from where he actually is.

### What would make this wrong

- If a hero could be idle *and* mid-route-change in a way the bytes do not record,
  the route would go stale until he stopped. The probe samples one position per
  frame and every motion the engine drives writes a byte, so this would need a new
  kind of movement with no flag and no cell change — a lift that moved him zero
  rows, say.
- If the border marker were meant to carry distance, `CHEVRON_FAR_ALPHA` would be
  throwing information away. It is a marker on a border; the distance it would be
  reporting is in a room the player cannot see.
- If a route could come back to the hero's map by something other than a door, §30.3
  would dim a leg he is entitled to walk. The graph has one way out of a map today —
  a `DOOR` edge — so leaving the map and returning is the same fact as going
  through a door; a second mechanism would need the rule to ask which.

### Tests

`nav-idle.test.ts` (the probe's six answers, and a guide that keeps its thread while
busy and spends it the moment he stops), `path-overlay-alpha.test.ts` (a fade that
does not restart when the line runs off screen, a door's far side at the far end of
the fade, and the way back out of a door he never entered), and
`nav-door-progress.test.ts` (an anchor that walks the way in, carries across a door
he did walk through, and does not jump to the way out).

979 pass, 5 fail — the same five §28 refusals, attributed in *"Still open"* above.
`tsc --noEmit` clean, `nav:check` up to date.

## 31. A fall the engine cannot fly: sixteen columns of drift in one flight

**The report.** The line to mp82 `(84,0)` crossed open air from the shelf at row 46
— `FALL (68,46) -> (84,0)` and `FALL (69,46) -> (84,0)` — landing sixteen columns east
of where the hero stepped off. `(84,0)` is a three-cell island at the top of the
cavern, and nothing between column 68 and column 84 at any row would hold him.

### 31.1 What the engine actually allows while falling

`addFalls` (`nav-graph.ts:813`) asks `JumpModel.landingsFrom` for the landings of a
fall, and `JumpModel.descend` let the hero step sideways on **every** airborne frame,
whenever the air beside him was clear. The engine does not.

While there is no floor under him, `airborne_movement` runs its steering block and
returns 0 (`dungeon-input.ts:599`), so `stateMachineDispatcher` never runs
(`dungeon-states.ts:121-123`) and nothing that leads to `up_pressed` / a jump is
reachable mid-fall. What runs instead is one of three things:

| frame | what happens | line |
| --- | --- | --- |
| the first airborne frame (`oldPhase === 0`) | `on_left/right_pressed` outright — a full body-checked step with **no** floor condition — then `FACING &= ~UP_FLAG` | `dungeon-input.ts:559-566` |
| every later frame, `UP_FLAG` clear, holding the direction he faces | `left_default` / `right_default` | `dungeon-input.ts:312` / `:323` |
| a frame that grabs a rope | he stops being a falling hero | `dungeon-input.ts:547-550` |

`left_default` and `right_default` are not movement towards the key so much as slope
catches, and both read the same three cells at `head + 3`:

```
si = heroAddr + 3*PROX_COLS + 1        // (leftCol + 1, head + 3)
left_default : if open there -> si++ -> if solid at (leftCol + 2, head + 3) -> move right
right_default: if open there -> si-- -> if solid at (leftCol,     head + 3) -> move left
```

So a falling hero moves sideways **only** when the cell under his middle foot is open
*and* the cell under the foot he is moving onto is solid rock — `dungeon-input.ts:312-331`.
A hero with nothing under him at all cannot be steered, however open the air beside
him is. Sixteen columns of open air have none, so he falls straight down.

### 31.2 The gate

`JumpModel` now precomputes, for every cell, whether each of those two conditions
holds (`jump.ts:314-327`):

```ts
if (blocksHead(this.at(col + 1, row + 3))) continue;          // middle foot must be open
if (blocksHead(this.at(col + 2, row + 3))) this.driftRight[cell] = 1;
if (blocksHead(this.at(col,     row + 3))) this.driftLeft[cell]  = 1;
```

indexed by the head row the frame *advanced to*, with `col` the left column before
the step — because `airborne_movement` scrolls down before it runs the steering, so
`head + 3` is three below the new row, not the old one.

`descend` consults it only where the engine would (`jump.ts:925-927`):

```ts
const steered = steer !== 0
    && this.stepAt(c, below, steer)
    && (rises !== 0 || firstPose || this.driftAt(c, below, steer));
```

- `stepAt` was already there: the body check `move_hero_right_if_no_obstacles` does.
- `firstPose` is the frame the fall starts on, which is the `oldPhase === 0` free move.
- `rises !== 0` exempts every **jump**. A jump descends with `UP_FLAG` still set from
  the ascent and takes the `on_left/right_pressed` branch instead of the defaults, so
  the floor condition never applies to it.

### 31.3 What it cost, and one thing it exposed

With the gate, mp82's row-0 gallery keeps only the falls between the cells of the
seam's own row (`(83,0)`, `(85,0)`, `(86,0)`) and the two jumps off the ride at
`(80,59)` / `(80,60)`; every fall from the row-46 shelf, and every fall from the
platform column `(80,55..60)`, is gone. The route to `(84,0)` now goes down the
platform, rides it and jumps (`FALL (82,54) -> (80,54)`, `RIDE_V` to `(80,59)`,
`JUMP (80,59) -> (84,0)`).

The gate did **not** remove reachability elsewhere so much as move it: map 23's edge
count went *up*, 35940 → 35991, because a flight that can no longer drift lands
straight down and reaches ground the drifting flight sailed over.

It also exposed a reporting defect in `describeRoute`. `shoeFor` returned the **first**
bit of a hop's `req`, so a hop asking for two pairs at once reported one. The mp80 →
mp82 journey the map screen checks is now taken by `JUMP_HIGH (36,19) -> (42,16)`,
whose `req` is `JUMP_HIGH | SLOPE_STAND` — Feruza *and* Silkarn — and the route listed
only Feruza, which read as though the ramp had stopped being needed. It had not. The
loop now walks every bit of `SHOE_BITS` (`pathfinder.ts:932-949`), and the broken
sentence that used to introduce it — "a locked door costs one key of its kind, and a /
Shoes, in the order the route needs them" — is split back into the comment it belongs
to.

### What would make this wrong

- The gate models the direction he is **already facing**. The flip frame — pressing the
  opposite direction mid-fall — flips `FACING` and then runs the *other* default, which
  can move him the way he came from before the key takes hold a frame later. Nothing in
  the graph uses a flight that turns around, so the gate is on the conservative side of
  that, but a route that needed exactly one backwards frame would be refused.
- `firstPose` is modelled as one free step taken *or not* on the first frame. The engine
  calls `on_left/right_pressed` from `FACING`, not from the key held, so which direction
  the free step goes is decided before the player's input is read.
- `flight()` — the search `landingsFrom` builds the graph from — passes
  `firstPose = false` (`jump.ts:702`), so a fall edge gets its free column from
  `collectStarts`'s one-column offset at the launch row rather than from the descent's
  first frame; `flightPath`, which is what the overlay draws with, passes `true`
  (`jump.ts:588`). Both give a fall one free sideways move, and neither gives it two.
  Passing `true` from `flight` would hand every fall edge an extra column, and this
  change was asked to take edges away, not to add them — so it was left as it was.
- Jumps are exempt entirely (`rises !== 0`). The engine is stricter than that: if a jump's
  free step is *blocked*, `on_right_pressed` calls `init_on_ground` and clears `UP_FLAG`
  (`dungeon-vertical.ts:137-142`), and the rest of that descent falls back to the floor
  condition. Exempting jumps is the direction the player asked for — "ignore
  `JUMP (80,60)k2 -> (84,0)` for now" — and it can only over-offer landings, never
  under-offer them.
- `blocksHead` is the nav classifier's predicate and `is_blocking_tile` is the engine's
  (`tile < 0x40 && lookupShared(...)`). They are derived from the same table, but a tile
  where they disagree would gate a step the engine allows, or the reverse.

### Tests

`nav-route-cases.test.ts` → *"mp82: the fall into the row-0 gallery"*: the graph offers
no fall into `(84,0)` from any column of the row-46 shelf (and the seam's own falls are
still there, so the assertion is not vacuous); no column of that shelf has `(84,0)` in
its `landingsFrom(..., 0, STEER_ALL)` — the gate, asked directly; and a route from
`(26,47)` still arrives, by `JUMP`, not by a fall.

`path-overlay.test.ts`'s two fall-drawing cases moved with it: *"asks the fall the
question the graph asked"* now uses `FALL (93,10) -> (90,26)`, which is sixteen rows and
three columns of drift and still exists; *"draws a long fall as the flight"* counts both
gaps the short way round the cylinder, because the longest fall in that route now drops
through the seam and `Math.abs(61 - 7)` is fifty-four rows of nothing.

`map-screen.test.ts` → *"sends a journey that needs shoes and a key at the same time"*
passes again on the fixed equipment list.

980 pass, 5 fail — the same five as before this section, all attributed in §28's
*"Still open"*. `tsc --noEmit` clean, `nav:check` up to date.

## 32. A lift that could not cross row 0, and the island nothing could reach

**The report.** `findRoute` answered NONE for mp82 `(179,0)` → `(181,51)`. Both are
standing positions, the second on the row-51 ledge east of the seam, and the player
had walked the journey: `WORK/DOC/esco.txt` records it hop for hop — right along row
0 to `(181,0)`, a jump onto the lift at column 184, up from `(184,63)` to
`(184,51)`, then left to `(181,51)`.

### 32.1 What the graph could see

Working backwards from `(181,51)` gave an island of exactly eleven nodes —
`(180..182,51)`, `(177..179,53)` and four slots on the row-56 horizontal platform —
with two ways in and nothing else. One is the horizontal platform at columns
168..175, which the graph can board only from a ground node at row 56, and there is
no ground at row 56 anywhere in columns 160..200. The other is the vertical lift at
column 3, whose jump lands on `(191,51)` — a cell the island cannot reach on foot.
So the island was sealed, and the lift the player actually used was not one of the
doors.

### 32.2 The extractor stopped walking at row 0

`tools/navlib/platforms.mjs` computed a lift's range by walking from `startY` in each
direction:

```js
const ascendFrom = (x, y) => {
    let top = y;
    while (top > 0 && spanClear(x, top - 1) && boxFree(x, headFor(top - 1))) top--;
    return top;
};
```

`top > 0` treats row 0 as a wall. It is not one. Both engine writes mask the
position: `memWrite8(g, found.entryPtr + 2, (… - 1) & 0x3f)` in
`tryMovePlatformUp` and `(… + 1) & 0x3f` in `tryMovePlatformDown`
(`dungeon-vertical.ts`). Row 0 ascends into row 63, and the map is a cylinder
everywhere else — falls, steps and rope climbs all cross the seam — so a lift standing
at row 2 should have walked on up through row 63.

It did not. mp82's lift is `startY 2`, just under the seam, and it came out as
`topY 0, bottomY 2`: three slots, at head rows 61..63. The player rode it from
`(184,63)` to `(184,51)`, which is platform rows 66 down to 54. `descendFrom` had the
mirror-image guard (`bottom < mapHeight - 1`) and could not cross row 63 either; mp31's
lift, documented in §30 as `startY 26, topY 0, bottomY 26`, is the same shape.

### 32.3 What changed

`ascendFrom` and `descendFrom` became one `travel(x, y, step)` that walks the cylinder
and stops only on a guard — or on arriving back at `startY`, a platform that circles
the whole map, which no `topY`/`bottomY` pair can express, so it warns instead of
guessing. `range(from, to)` in `platforms.ts` now walks modulo `ROWS` when
`from > to`, because the arc a lift travels can have its top numerically **above** its
bottom: mp82's column 184 is now `topY 53, bottomY 2`, meaning rows 54..66.

Sixteen ranges across ten maps moved. The lift in mp82 became `topY 53` rather than
the 54 the ceiling at row 49 suggests, because `boxFree` asks for the hero's whole
3x3 and tile `(184,50)` is inside it; `standingAboard` then drops that slot, so the
model still offers head rows 51..63 and not 50.

### 32.4 What it cost

+136 ride slots (5,548 → 5,684), of which 5,679 have an entry — the same five
impossible-to-reach slots as before, so none of the new ones is stranded. Nodes
29,917 → 30,012; edges 506,899. The projection bound moved from `< 30,000` to
`< 31,000`.

### Tests

`nav-data.test.ts` → *"walks mp82 column 184 across the row 0 seam"* pins
`{ x: 184, startY: 2, topY: 53, bottomY: 2 }`. The invariant *"keeps every vertical
travel range inside the map"* no longer asks `topY <= startY <= bottomY`, which an arc
across the seam cannot satisfy; it walks from `topY` to `bottomY` modulo `MAP_HEIGHT`
and requires `startY` to lie on that arc.

`nav-route-cases.test.ts` → *"mp82: the lift that crosses row 0"* routes
`(179,0)` → `(181,51)` bare-free (ten hops, cost 27): `JUMP_HIGH` onto the lift,
eight `RIDE_V` down its column, `JUMP_HIGH` off onto the ledge, and no `solidCrossings`.

`nav-graph.test.ts` — the ride-slot count and live/dead split, and the node bound.

984 pass, 5 fail — the same five as §31, all attributed in §28's *"Still open"*.
`tsc --noEmit` clean, `nav:check` up to date.
