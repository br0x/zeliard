# Thread of Yaga — Cavern Pathfinding

**Status:** implemented. The Thread of Yaga item, map screen, cavern-wide routing, live
chevron guide, platforms, air currents, boss-arena exits, keys and recorder mode are all in
place. The navigation model is differential-tested against the engine's frame loop and
validated against recorded player routes.

This document describes how the component works and the rules that keep it faithful to the
game. It is reference documentation, not a change log.

## 1. Feature

The **Thread of Yaga** is a consumable magic item (id `9`). Using it:

1. Opens a full-screen map of the current cavern group.
2. Lets the player pick a destination.
3. Computes the cheapest traversable route, across maps if necessary.
4. Closes the map once a destination is accepted.
5. Shows the remaining route as chevrons over the normal cavern view.
6. Re-plans when the hero's abilities or the world change.

The route is **guidance only**; the hero is never walked automatically.

```text
Dungeon
  -> use Thread of Yaga
  -> map screen
  -> choose destination
  -> route search
  -> map closes
  -> inventory confirms use
  -> player leaves inventory
  -> chevrons appear in the cavern
  -> guide advances as the player moves
```

The map screen only chooses a destination; it does not draw the route. The item is spent
when a destination is committed. Cancelling the map restores the pending item.

## 2. Engine rules the model must match

These matter more than any implementation detail below.

### World geometry

- A cavern is one cylindrical tile grid, `mapWidth × 64`. Columns and rows both wrap.
- There are 31 dungeon maps, 42 to 320 columns wide.
- The viewport is 28 × 18 tiles at 24 px per tile.
- The hero position is `(x, y)`: `x` is his left column, `y` is his head row.
- The hero is drawn as a 3×3 block, but **the engine does not require the whole block to be
  clear**. The model must not invent a whole-body collision rule.
- A navigation node is a position where the hero can actually stop. The engine's standing
  and landing tests are based on the hero's **middle column**.

### What the graph models

- Walking and one-tile steps
- Normal jumps and Feruza high jumps
- Drifting falls
- Rope climbing, and stepping or falling off ropes
- Slopes, and Silkarn slope climbing
- Aggressive ground, and Pirika protection
- Ice (cavern level 4), and Ruzeria protection
- Heat (cavern level 7), and Asbestos protection
- Doors and key requirements
- Vertical, horizontal and collapsing platforms
- Up, left and right air currents
- Boss-arena exits

Movement follows the engine's own routines, not a simplified geometric envelope.

### Narrowest-test principle

Each position is tested with the narrowest question the engine itself asks at that moment:

| Position | Test applied | Engine code it mirrors |
| --- | --- | --- |
| Standing (`canRest`, `isStanding`) | open middle column over three rows, plus support under the middle foot (or an up current) | `check_floor_for_landing`, `move_hero_*_if_no_obstacles` |
| Vertical-lift slot | open middle column | `move_platform_down_damage_monster`, `try_move_platform_up` |
| Horizontal-platform ride slot | the two rows under the head clear across all three columns | `move_hero_*_if_no_obstacles` while crouched |
| Rope node | a rope in the middle column and an open middle column; nothing about the sides | `try_climb_rope`, `dungeon_finish_rope_frame` |

A hero may therefore have a side column inside rock; he may not have his middle column
inside it.

### Jumping

- A jump is simulated frame by frame from the engine's jump, airborne-movement and landing
  routines (`jump_press_handler`, `airborne_movement`, `check_floor_for_landing`).
- The only rise test is the single cell above the middle of the head. The engine never asks
  whether the body fits, so a flight may clip scenery on the way up and down.
- The hero holds one sideways direction for the whole flight: up+right descends right,
  up+left descends left. Straight down is only the fallback when the step is blocked.
- A jump covers at most `rises + 1 + descents` columns.
- A plain fall gets one free sideways step; later steps need floor under the foot being
  stepped onto.
- A landing ends the flight, so a long jump is a long fall that stops at the first ground.
- Feruza shoes are needed only when the actual rise exceeds the normal limit (2 rows
  normally, 4 with Feruza).
- A flight with **Up held alone** can end on a rope (`try_climb_rope` runs every frame of
  the rise). A flight with a direction held cannot.
- A flight can catch a rope on the way down when the cell under the middle foot is a rope
  and the landing check has failed. The hero ends one row lower than the check.
- There is no jump off a rope.
- A pose whose **middle** column is inside a platform standing right now does not exist,
  because platforms are three tiles wide. Side columns may overlap; that is how the hero
  rides.

### Air currents

- Classification precedence is up, then left, then right.
- An up current carries the hero up two rows per frame through solid geometry, and
  suspends gravity and jumping. He can still step sideways out of it.
- A flight that reaches an up current ends there; the current owns the hero.
- Sideways currents push two columns per frame and block movement against themselves.
  On cavern level 7 they are scenery and never block.
- Lift and conveyor destinations are limited to the current's actual run. Currents in the
  same column but different rows must not be mixed.

### Platforms

- Vertical platforms are bidirectional lifts within their engine-derived travel range. The
  range is the engine's own guards walked one row at a time: one cell above the head and
  two three-cell spans.
- Collapsing platforms only descend, from where they stand now.
- Horizontal platforms are linked spans from `minX` to `maxX`. Riding uses three offsets,
  `leftCol = platformCol - 2 .. platformCol`. Links follow the platform's own movement
  chain at a fixed offset, not spatial adjacency.
- A platform is three tiles wide in every family. A horizontal platform's `cols` is the
  length of its travel, not its width.
- A platform is solid where it stands now, and **only that position is a landing surface**.
  Every other row of its travel is reachable by riding, not by jumping onto it.
- A lift with no boardable row (no slot where it currently rests) has no slots at all,
  because the hero boards by landing.
- A horizontal platform is only modelled when each column of its span has a clear riding
  position, so it cannot slide out from under the hero.
- Platform travel can cross the row-0 seam.
- Live platform rows are read from engine memory as `{ absX, y }` keyed by column. This is
  why a lift is modelled at `leftCol = x` only: two lifts a column apart cannot be told
  apart in that reading. Widening the riding positions to `x - 1 .. x + 1`, which the
  engine allows, requires the reading to be keyed by platform first.

### Crouching

- `down_pressed` sets `SQUAT_FLAG` and nothing else. The only writers of the viewport row
  are the jump-up step and the rope descent, so **a crouched hero does not move down a
  row**.
- While `SQUAT_FLAG` is set, the sideways move skips the head-row test. A crouched hero can
  therefore be carried into positions where a standing 3×3 does not fit.
- The landing check still reads three rows under the head, so a crouched hero's support is
  unchanged.
- Crouching is not a navigation state. A horizontal ride slot is the strongest position the
  platform can hold: the two rows under the head clear across the three columns. The ride
  row is always `platformRow - 3`, and `platformRow` stays separate from the hero's
  `headRow`.

### Slopes, ice and heat

- Slopes are climbable only with Silkarn shoes; otherwise the hero slides down them.
- Aggressive ground is walkable but damaging; Pirika shoes grant immunity.
- Ice exists only on cavern level 4 and heat only on level 7, so Ruzeria and Asbestos are
  granted only on those levels.

## 3. Cavern graph and doors

The portal graph is **directed**.

- A linked pair is usable in both directions. A dead-end portal is not implicitly
  reversible.
- Town doors terminate pathfinding; a route never leaves a cavern through one.
- Monsters are not obstacles.
- Boss arenas have no door table at first. Defeating the boss activates an exit door
  recorded in the arena data, and the game stamps its column from the hero's position when
  the boss dies. The graph offers the exit from every standing position on the door's row
  (`bossExitAtNode`, generated `NAV_BOSS_EXITS`).

Measured topology:

- 31 maps
- 163 normal door records, 15 of them town-boundary doors
- 130 portals forming 65 linked pairs
- 17 portals leading to maps with no normal door table
- 1 one-way portal
- 10 boss-arena exits

## 4. Navigation model

### Nodes

A node is a standing position, `node = y * mapWidth + x`, with `x` the hero's left column
and `y` his head row. Node kinds are `GROUND`, `ROPE` and `RIDE`. Nodes come from the
engine's standing and landing rules, not from a generic 3×3 clearance test.

Measured graph size, from building all 31 caverns with no platform reading:

- 30,410 nodes (19,433 ground, 4,991 rope, 5,986 ride)
- 460,804 edges

These are sanity checks, not API contracts. `nav-graph.test.ts` measures them rather than
asserting a table.

### Edges

`WALK`, `STEP`, `JUMP`, `JUMP_HIGH`, `FALL`, `CLIMB`, `SLOPE_UP`, `SLOPE_DOWN`, `DOOR`,
`RIDE_V`, `RIDE_H`, plus the platform and current edges `BOARD`, `ALIGHT`, `DROP`, `LIFT`,
`CARRY_L` and `CARRY_R`. Costs are in game ticks where one tick moves the hero one tile. A
jump carries a small extra penalty so the search prefers walking where walking works.

The graph is capability-free: one graph serves every loadout. Each edge records the
capabilities it requires, and the pathfinder decides at search time what a given hero may
use.

| Accessory | Effect |
| --- | --- |
| Feruza shoes (1) | high jump |
| Pirika shoes (2) | aggressive-ground immunity |
| Silkarn shoes (3) | slope climbing |
| Ruzeria shoes (4) | disables ice sliding |
| Asbestos cape (5) | heat immunity |

A route can be planned with optional accessories, and it reports where each one is first
needed.

### Tile classification

Passability is a per-cavern table, not a property of the tile id. `NavTileClassifier` turns
the generated tables into one 256-entry flag lookup. Two blocking bits reproduce the
engine's two predicates, which differ over the platform band:

- `is_blocking_tile` (`BLOCK_HEAD`): tiles `>= 0x40` pass.
- `is_blocking_tile_simple` (`BLOCK_BODY`): tiles `>= 0x49` pass.

So a platform tile blocks the body but not the head, which is why the hero can stand on one
and rise through one. Zero-terminated attribute groups must stop at the terminator; tile
`0` is empty space and must never be treated as a member.

### Keys

Keys are a search dimension, not just a door penalty.

- Ordinary key count is at `0x98` and Lion-Head key count at `0x99`.
- Keys are item records in the MDT entity block. The generated data holds 18: 17 ordinary
  and 1 Lion-Head.
- The graph stores a key's record cell separately from the node the pickup snaps to,
  because the engine collects from a window around the record. The same applies to pairs
  of shoes. Presence callbacks (`keyPresent`, `shoePresent`) speak in records and must be
  asked about the record, not the node.
- Presence is read from the loaded cavern's entity list **at the moment of the question**.
  A record that `mark_collected` has stamped has `0xff` in its high byte; the `0xffff`
  terminator is a different marker.
- A closed door costs a key of its actual kind. An open door costs nothing, and a door the
  player has already opened stays open (`doorOpen`).

The search can route with the keys held, assume unlimited keys to learn how many a journey
needs, and collect keys on the way.

**Key decomposition.** A single search that fetches a key and comes back to use it floods
its budget, because every state reachable while holding no key is settled first.
`findRoute` therefore splits such a journey when `collectKeys` is set and the one-shot
search fails:

1. Ask for the shape of the journey under `unlimitedKeys`, and read the locked doors on it
   as the demand.
2. If the hero carries that many keys, search again without the pickup dimension.
3. Otherwise try the cheapest keys of a needed kind as waypoints (6, 4, 4 candidates by
   depth, at most 3 fetches). Walk to one, count the keys walked over, subtract the keys
   spent, and ask again from there.

Each leg is searched with `collectKeys` off and counted from the points it visits. The
legs are joined into one route that names where each key is picked up (`NavRoute.picks`).

**A count is not a set.** The state carries a key count while the floor is a set of
records, so a one-shot search can "farm" a key by stepping on the same node twice.
`claimsAreOnTheFloor` therefore walks any one-shot answer, counts each key record once,
and sends the route to the decomposition if it claims more keys than it walks over. An
approximation may be believed only while it agrees with the exact question.

### Pathfinder

`findRoute` is A* over states `(mapId, node, keysOrd, keysLion, shoes)`.

- The heuristic is octile distance within a map and zero across maps, which is admissible
  because a door can land the hero anywhere in the next cavern.
- Capability pruning happens in the search: an edge whose requirement the hero cannot meet
  is skipped, aggressive ground is refused without Pirika shoes, and crossing a locked
  door spends a key.
- `planAccessories` lets the route assume shoes the hero can put on. Swapping is free, so
  the route reports which pair is needed and where.
- `collectAccessories` lets the route fetch a pair lying in the cavern. A pair is added to
  the inventory and never removed.
- `keyCavernLevel` restricts key collection to maps of one level.
- Default search budget is 400,000 expansions (`maxExpanded`).
- State packing keeps node < 2^18, key counters < 64 (saturating at `HOLD_CAP`) and the
  shoe mask < 16, so every state key stays a unique double below 2^53.

### Build-time data

`tools/build-nav.mjs` extracts and emits committed TypeScript data for map metadata,
portals and boss exits, cavern components and reachability, tile attribute tables,
platforms and travel ranges, airflows, and key locations. Graphs are built lazily per map
and cached at runtime. The generated data is committed so contributors need no separate
extraction dependency; `nav:check` verifies it is reproducible.

## 5. Runtime architecture

```text
tools/build-nav.mjs
        |
        v
web/src/data/nav/*.ts
        |
        v
engine/nav/mdt-grid.ts
        |
        v
engine/nav/nav-graph.ts
        |
        v
engine/nav/pathfinder.ts
        |
        +----------------------+
        |                      |
        v                      v
ui/map-screen.ts        engine/nav/path-guide.ts
                               |
                               v
                       render/path-overlay.ts
```

| File | Responsibility |
| --- | --- |
| `web/src/engine/nav/types.ts` | Navigation types, flags, edge kinds and costs |
| `web/src/engine/nav/mdt-grid.ts` | MDT map decoding |
| `web/src/engine/nav/attributes.ts` | Engine-matching tile classification |
| `web/src/engine/nav/geometry.ts` | Standing, occupancy and sideways-step tests |
| `web/src/engine/nav/jump.ts` | Jump and fall simulation |
| `web/src/engine/nav/platforms.ts` | Runtime platform ride slots |
| `web/src/engine/nav/platform-state.ts` | Live platform rows read from engine memory |
| `web/src/engine/nav/airflows.ts` | Lifts and conveyors |
| `web/src/engine/nav/nav-graph.ts` | Nodes and edges |
| `web/src/engine/nav/pathfinder.ts` | A*, key and accessory state, graph store |
| `web/src/engine/nav/capabilities.ts` | Hero capability snapshot |
| `web/src/engine/nav/path-guide.ts` | Live route state and re-planning |
| `web/src/engine/nav/idle.ts` | "Is the hero standing still?" probe |
| `web/src/engine/nav/recorder.ts` | Player-route recorder |
| `web/src/render/path-overlay.ts` | Chevron rendering |
| `web/src/ui/map-screen.ts` | Destination-selection UI |
| `tools/build-nav.mjs` | Build-time extraction |
| `web/src/data/nav/*.ts` | Generated navigation data |

### Graph store and platform state

`NavGraphStore` builds each map's graph once and caches it (about 70 ms for the largest
cavern).

- A platform's position is engine state, not map data. It rests at its generated `startY`,
  moves while the hero drives it, and snaps back to `startY` when the cavern is entered
  through a door.
- `setPlatformPlaces` records a reading and reports whether anything changed. The reading is
  recorded before deciding whether the graph must be rebuilt, and the first report always
  counts as news.
- The graph is not dropped eagerly. `get` rebuilds it lazily when its recorded platform
  rows differ from the latest reading, because a ride changes the rows every frame.
- `peek` returns an existing graph without building one, for per-tick questions.
- `reset()` drops graphs and every platform reading but keeps map data. It runs on a save
  restore and on every change of cavern, because a reading is true only while the hero
  stays in that cavern. A stale reading promises passages the engine has already closed.
- A map whose MDT fails to decode is remembered as broken and is not retried every frame.

## 6. Map screen

The screen:

- shows the current cavern group as a map strip;
- renders the selected map at an integer scale, fitted inside the frame without panning
  (the chart area is 660 px wide inside the 672×432 canvas, since the frame is stroked 4 px
  in);
- draws every platform at its default position, from the shared platform sheet. Where a
  platform travels is deliberately not drawn, and `speed: 0` platforms are left out;
- shows doors, town exits and the hero's position;
- accepts only valid destinations that reproject onto a navigation node;
- reports unreachable destinations rather than silently accepting them;
- loads every map a possible route needs before searching;
- stays visually consistent with the inventory and menu UI.

**Aiming is not committing.** Moving the target rectangle (arrow keys, a click on the map,
a click on the strip) only aims. **Enter** is the only thing that commits (`choose`). There
is no `pointermove` handler; a pointer that trails the mouse would turn looking at the map
into an input. `handleClick` clears the transient refusal message.

**Refusals** are printed on the hint line (the last row, replacing the controls) for two
seconds. The deadline must be stamped from the same clock `draw` receives
(`performance.now()`), not a literal.

**Search ladder.** The screen answers in rungs, from strictest to loosest: the hero as he
is; fetching keys and pairs lying in the level (`collectKeys`, `collectAccessories`); then
planning with accessories he could put on (`planAccessories`). A rung that grants an
accessory is a statement about the inventory, not the level, so it comes last and may
assume only a pair the hero already carries.

## 7. Live route guide

`PathGuide` owns the active route and keeps it honest as the world changes. It:

- starts at the hero's current position and reveals only the untraversed part;
- draws every cell covered by jumps, falls and carried movement, not just edge endpoints,
  by replaying the same flight model the graph was built from;
- continues across doors and map changes, and draws off-screen continuation at the viewport
  border;
- survives save and restore;
- does not treat mid-air positions as drift;
- keeps the existing route if a re-plan fails, and retries later;
- clears itself when the hero stands on the final point.

The overlay draws after the background and before entities and the hero.

### Anchor

`progress` is the index of the route point the hero occupies, and the chevron drawn there
marks the step he is about to take. `advanceProgress` keeps it correct:

- It looks for the hero's own cell both ahead of and behind the anchor, within
  `ANCHOR_SCAN` (32) points of where the current visit to his map begins. The nearer match
  wins, ties going forward.
- The window is measured from the start of the visit, not from the old anchor, so a portal
  crossing still works.
- Bounding the window stops a route that passes the same cell twice on one map (down a rope
  and back up) from matching the later occurrence and discarding the descent.
- Searching backwards handles the hero walking straight back out of a door the route only
  crosses once.
- With no cell match the anchor still moves onto the hero's map, taking the nearer visit
  boundary. Every consumer reads the anchor as being inside the hero's current room.
- Matching is exact because both positions come from the same engine expression.

A route is a list of **visits**, not a set of cells. A journey that fetches something and
returns walks the same corridor twice, so the overlay paints each cell at most once per
frame, first visit wins. The fade is still counted against the route's real length.

### Re-planning

Re-planning is synchronous, so it is throttled:

- It runs only when the hero is **idle** (`createHeroIdleProbe`): no direction or jump
  input held, not airborne, sliding, climbing or carried by a jet, and standing on the
  same cell as on the previous frame.
- It never runs more often than `MIN_INTERVAL_MS` (500 ms), and a refresh is forced every
  `REFRESH_MS` (20 s) when the hero is not near the route (within `DRIFT_TOLERANCE`, 3
  tiles).
- It is not triggered while the hero is off the ground, including mid-ride.
- A re-plan repeats the assumptions the route was planned under (`NavRoutePlan`:
  `collectKeys`, `collectAccessories`, `planAccessories`, `keyPresent`, `shoePresent`,
  `doorOpen`). Asking a stricter question would find nothing and clear the route.
- A route that counts on shoes the hero can put on is re-planned with the augmented mask.
- Invalidating events: a change in capability mask, key counts or reachable maps, or a
  difference in the platform signature of any map on the route. A platform move triggers a
  re-plan ahead of the waiting interval.
- Every search is recorded whether it succeeds, fails or throws, so a failed question is
  not asked again on the next frame.

**Stale versus unwalkable.** Most invalidations make a route merely stale, and may wait for
an idle frame. A route that walks the hero through a shut door with no key left to open it
is unwalkable, so `keysShort` bypasses the idle gate. It counts, per pocket (ordinary and
Lion-Head), the shut doors ahead of the anchor against the keys held plus the keys the
route still picks up ahead of the anchor.

`keysShort` reads only the route itself, through `NavHop.doorKey` (the key kind a crossing
costs; 0 for an open door) and `NavRoute.picks` (the points keys are collected at). It
never touches the graph store, so its answer does not depend on which caverns happen to be
cached. The tables are built once per route and read every frame.

## 8. Recorder mode

`recorder.ts` compares real play with the model. From the browser console:

```text
navRecorder.start()
<play>
navRecorder.report()
navRecorder.clear()
```

The report lists:

- where the hero stood, in order, and what he pressed;
- the engine state in each cell (airborne, on rope, sliding, on slope, in a current) and the
  accessory worn;
- every hop between standing positions beside what the graph calls it, including the
  capabilities it needs.

Cells merely flown through are reported as flight. A `***` line marks a hop the graph
does not have.

**A `***` line is not always a graph bug.** The recorder decides "he stood here" from
`JUMP_PHASE_FLAGS`. For one whole engine frame after the hero steps sideways off a rope he
is in mid-air with no rope under him, yet reads as neither `on_rope` nor `airborne`, so the
cell he stepped into is reported as standing when it has nothing under it. A recorder that
asked the engine's own floor question (ground under the middle foot, a rope through the
middle column, or a platform under him) would remove these.

The recorder is the preferred diagnostic when a player reports a route the graph cannot
reproduce.

## 9. Save and shop integration

The Thread of Yaga is magic item id `9`, consumable, sold by all nine magic shops at 2,000
gold. It is stored outside the packed five-slot generic magic-item array.

- Owned Thread copies: `0x4A`.
- Extended shop stock: `0x4B..0x53`.

The generic eight-item shop mask and five-slot magic-item array are unchanged.

## 10. Localization

The map UI has localized keys for the title, controls and hints, unreachable and invalid
destination messages, route-cleared and use messages, and the item name and description.
They exist in all three supported locales and are covered by locale-completeness tests.

## 11. Validation

Tests:

- `web/tests/nav-data.test.ts`
- `web/tests/nav-jump-differential.test.ts`
- `web/tests/nav-graph.test.ts`
- `web/tests/nav-platform-model.test.ts`
- `web/tests/nav-pathfinder.test.ts`
- `web/tests/nav-route-cases.test.ts`
- `web/tests/nav-shoe-routing.test.ts`
- `web/tests/nav-guide-replan.test.ts`
- `web/tests/nav-guide-cross-door.test.ts`
- `web/tests/map-screen.test.ts`
- `web/tests/path-overlay.test.ts`
- `web/tests/nav-recorder.test.ts`
- `web/tests/nav-keys-extraction.test.ts`

The jump differential test runs the real engine frame loop against the navigation model and
compares landings, including both the Up-alone rope grab and the direction-held case that
must not grab.

Recorded player routes pin real journeys:

- level-1 traversal through `mp10 → mp21 → mp1d → mp10`
- boss-arena entry and post-boss exit
- platform riding, current lifts and seam-wrapping platform travel
- rope catches, and a rope climbed to its head beside a wall (mp21)
- the mp80 journey to `(244,7)`, which needs a four-tile jump off a lift (mp80)
- the mp83 ride along a low-ceiling platform (mp83)
- journeys that fetch one key, or two, and come back for the doors (mp80/81/82, mp20)
- fetching a pair of shoes on another map to avoid a slope (mp50 → mp51)

Checks that should hold:

- `tsc --noEmit` is clean.
- `nav:check` reports the generated data up to date.
- the full test suite passes.

## 12. Working rules

### Modelling the engine

1. Model the engine, not an intuitive physics model. For every traversal predicate, find
   the corresponding engine guard or probe first.
2. Do not add whole-body collision tests the engine does not perform. Apply the narrowest
   test the engine uses at that moment (see §2).
3. Treat rows and columns as a cylinder everywhere, including platform travel and
   jump and fall distances.
4. Keep platform slots and riding offsets distinct from their shared cell coordinates.
5. When a question is about a platform, ask which platform. A column is not a sufficient key
   once riding offsets widen.
6. A rise is driven by held input, and Up alone is the input that climbs. The rope caught
   on the way up and the rope caught on the way down are different code.
7. A platform supplies its own support, so a lift slot does not ask for floor.
8. Validate questionable behaviour against the engine's real frame loop or a player
   recording. When a test and a recording disagree about the engine, the recording wins.
   Bisect to find which side is stale before assuming either.
9. Keep generated navigation data reproducible with `nav:check`.

### Topology and world state

10. Keep directed portal topology directed.
11. Boss arenas are passages only after their post-boss exit is active.
12. Keys and shoes are world items with save-state presence, not permanent graph features.
    Ask about a pickup by its record, never by the cell the route walks through. Read the
    floor when the question is asked, not when a snapshot was taken.
13. Anything built from a live engine-memory reading must be dropped when the world under it
    is replaced (a save restore, a change of cavern). Map data survives.
14. A pickup the journey depends on is a waypoint, not a dimension to flood through.
15. A counter is not a set. An answer produced by an approximation must be checked against
    the exact question before it is believed.

### Guide and overlay

16. A mid-flight position is not a navigation node and must not trigger invalidation.
17. A failed re-plan does not mean the route became invalid. A search that was asked for is
    recorded either way, including when it fails or throws, or the guide re-fires every
    frame.
18. Stale and unwalkable are different failures. Only a stale route may wait for an idle
    frame.
19. Count a plan over the part still ahead of the hero. Totals such as `keysGained` and
    `keysSpent` describe the whole journey.
20. A question asked every frame must be answerable from data that does not decay: either
    derived from the route, or from a reading with a bounded lifetime whose loss is
    handled.
21. A route is a list of visits. Paint each cell once and let the anchor decide which visit
    is ahead.
22. The anchor must always be on the map the hero is standing in.
23. The anchor search must be bounded, measured from the start of the current visit, and run
    in both directions with the nearer match winning.

### Map screen

24. Aiming and committing are different acts: only Enter commits.
25. A timer and the clock it is compared against are one clock.
26. Fit the chart inside the frame border, not to the canvas, and sweep every map in tests.

## 13. Invariants worth checking

- All 31 maps decode to `mapWidth × 64`.
- Zero-terminated attribute groups stop before treating tile `0` as a member.
- Portal topology stays directed, and open doors cost no key.
- Every generated key is accounted for and its runtime presence can be determined.
- Boss exits cover all ten known boss arenas.
- Horizontal platforms are bidirectional, and their riding offsets match the engine
  (`[-2, -1, 0]`).
- Up-current traversal never mixes separate lift runs.
- A lift's `topY` / `bottomY` equals what `try_move_platform_up` / `Down` allow, re-derived
  from the decoded map in `nav-platform-model`.
- A vertical ride slot has an open **middle** column. A horizontal one has the two rows under
  the head clear across all three columns, never a 3×3 box.
- A rope node has an open middle column and a rope in it, with nothing asked of the sides.
- A flight pose whose middle column is inside a resting platform does not exist.
- A lift with no resting slot emits no slots.
- A flight with Up held alone can end on a rope; one with a direction held cannot.
- A jump can be reproduced by the same frame-by-frame rules the differential test uses.
- A route starts at the hero and ends at the selected destination.
- A route never claims a key it does not walk over, and a route in hand is never short of
  keys.
- `keyPresent` and `shoePresent` answer from the loaded cavern's entity list as it is when
  asked, and a collected record reads as gone.
- The overlay draws cells, not one marker per graph edge.