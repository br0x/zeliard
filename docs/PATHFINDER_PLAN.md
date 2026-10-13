# Thread of Yaga — Cavern Pathfinding

**Status:** Implemented and playable. The Thread of Yaga, map screen, cavern-wide routing,
live chevron guide, platforms, currents, boss-arena exits, keys, and recorder mode are
implemented. The navigation model is differential-tested against the engine and validated
against recorded player routes.

This document is the current technical handoff. It intentionally omits the historical
implementation log and superseded hypotheses.

## 1. Feature

The **Thread of Yaga** is a consumable magic item (id `9`) that:

1. Opens a full-screen map for the current cavern graph.
2. Lets the player select a reachable destination.
3. Computes the shortest traversable route across maps.
4. Closes the map after a destination is accepted.
5. Shows the remaining route as chevrons over the normal cavern view.
6. Replans when relevant abilities/world state change.

The route is **guidance only**. There is no auto-walking.

### Player flow

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

The map screen does **not** draw the route; it is only for choosing the destination.

The item is spent only when a destination is committed. Cancelling the map restores the
pending item.

## 2. Core engine rules

These are the rules the navigation model must match. They are more important than any
implementation detail below.

### World geometry

- Every cavern is one cylindrical tile grid: `mapWidth × 64`.
- Columns and rows wrap.
- Maps range from 42 to 320 columns across 31 dungeon maps.
- The viewport is 28 × 18 tiles at 24 px/tile.
- The hero position is `(x, y)`, where `x` is the hero's left column and `y` is his
  head row.
- The hero is treated as a 3×3 visual/body region, but **the engine does not require
  the whole 3×3 region to be clear**.
- A navigation node represents a position where the hero can actually stop.
- The engine's landing/standing tests are based primarily on the hero's middle column.
  The model must not invent a whole-body collision rule.

### Traversal

The graph models:

- Walking and one-tile steps.
- Normal jumps and Feruza high jumps.
- Drifting falls.
- Rope climbing and falling/stepping off ropes.
- Slopes and Silkarn slope climbing.
- Aggressive ground and Pirika protection.
- Ice and Ruzeria protection.
- Heat and Asbestos protection.
- Doors and key requirements.
- Vertical platforms.
- Horizontal platforms.
- Collapsing platforms.
- Up/left/right air currents.
- Boss-arena exits.

All movement is based on the actual engine behavior, not on a simplified geometric
envelope.

### Important movement details

**Jumping**

- The jump is simulated frame-by-frame from the engine's jump, airborne movement, and
  landing logic.
- The hero can steer horizontally during the flight.
- The rise and descent are distinct; the apex is not itself a standing position.
- Feruza shoes are required only when the actual rise exceeds the normal jump limit.
- A jump can pass through geometry that the engine itself does not test.

**Ropes**

- Jumping while on a rope is impossible.
- A rope provides up/down climbing and sideways departure.
- Falls from ropes use the same drifting descent model as other falls.
- A rope can also be caught during a descent when the engine's landing/rope check
  encounters it.

**Air currents**

- Current classification follows engine precedence: up, then left, then right.
- An up current can carry the hero through solid geometry.
- While carried by an up current, gravity/jump handling is suspended.
- Horizontal currents push two columns per frame and block movement against themselves.
- Lift/conveyor destinations are constrained to the current's actual run; currents in
  the same column but different rows must not be mixed.

**Platforms**

- Vertical platforms are bidirectional lifts within their engine-derived travel range.
- Collapsing platforms descend only.
- Horizontal platforms are static, bidirectional linked spans from `minX` to `maxX`.
- Horizontal platform riding uses the engine's three valid offsets.
- Ride links follow platform movement/offset chains rather than simple spatial
  adjacency.
- Platform state used for route invalidation comes from the graph's stable platform
  places, not a transient engine snapshot.

## 3. Cavern graph and doors

The dungeon portal graph is **directed**.

- A linked pair is usable in both directions.
- A dead-end portal is not implicitly reversible.
- Town doors terminate pathfinding.
- Monsters are not pathfinding obstacles.
- Boss arenas are special: they initially have no active door table, but defeating a
  boss activates an exit door recorded in the arena data.
- The post-boss exit can be reached from the applicable row because the game stamps its
  column from the hero's position when the boss dies.

Measured topology:

- 31 maps.
- 163 normal door records.
- 15 town-boundary doors.
- 130 portals form 65 linked pairs.
- 17 portals lead to maps with no normal door table.
- 1 normal one-way portal exists.
- 10 boss-arena exits are modelled.

The arena exits are represented as generated `NAV_BOSS_EXITS` data and graph nodes expose
the applicable exit through `bossExitAtNode`.

## 4. Navigation model

### Nodes

A node is a standing position:

```text
node = y * mapWidth + x
```

with `x` = hero left column and `y` = hero head row.

Node kinds:

- `GROUND`
- `ROPE`
- `RIDE`

A node is created from the engine's standing/landing rules, not from a generic 3×3
clearance test.

Current measured graph size is:

- 30,317 nodes (19,433 ground, 4,895 rope, 5,989 ride).
- 511,524 edges.

These values are useful sanity checks, not API contracts. `nav-graph` measures them
rather than asserting a table nobody can re-derive; see §15 for how the last change
moved them.

### Edges

The graph contains traversal edges for:

- `WALK`
- `STEP`
- `JUMP`
- `JUMP_HIGH`
- `FALL`
- `CLIMB`
- `SLOPE_UP`
- `SLOPE_DOWN`
- `DOOR`
- `RIDE_V`
- `RIDE_H`
- airflow/lift traversal

Edge costs are based on engine frames/ticks where applicable.

Accessory requirements are explicit:

| Accessory | Effect |
| --- | --- |
| Feruza shoes | high jump |
| Pirika shoes | aggressive-ground immunity |
| Silkarn shoes | slope climbing |
| Ruzeria shoes | disables ice sliding |
| Asbestos cape | heat immunity |

A route can be planned with optional accessories and reports where each accessory is first
needed.

### Keys

Keys are a search dimension, not merely a door penalty.

- Ordinary key count: `0x98`.
- Lion-Head key count: `0x99`.
- Keys are item records in the MDT monster/entity block.
- The generated navigation data contains 18 keys: 17 ordinary and 1 Lion-Head.
- The graph records key locations separately from the exact item record because the
  engine's pickup radius means those positions are not identical.
- Already-collected keys are filtered from the runtime world state.

Closed doors require their actual key type. Open doors cost no key.

The search can:
- route with the keys currently held;
- temporarily assume keys are available to determine requirements;
- collect keys along a route when that is actually possible.

### Build-time data

`tools/build-nav.mjs` extracts and emits committed TypeScript data for:

- map metadata;
- portals and boss exits;
- cavern components/reachability;
- tile attribute tables;
- platforms and travel ranges;
- airflows;
- key locations.

Navigation nodes/edges are built lazily per map and cached at runtime.

Generated data is committed so contributors do not need a separate extraction dependency.

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

### Main modules

| File | Responsibility |
| --- | --- |
| `web/src/engine/nav/types.ts` | Navigation types and flags |
| `web/src/engine/nav/mdt-grid.ts` | MDT map decoding |
| `web/src/engine/nav/attributes.ts` | Engine-matching tile predicates |
| `web/src/engine/nav/jump.ts` | Jump/fall simulation |
| `web/src/engine/nav/geometry.ts` | Standing/occupancy tests |
| `web/src/engine/nav/platforms.ts` | Runtime platform representation |
| `web/src/engine/nav/airflows.ts` | Current/lift representation |
| `web/src/engine/nav/nav-graph.ts` | Nodes and edges |
| `web/src/engine/nav/pathfinder.ts` | A* and key/accessory state |
| `web/src/engine/nav/capabilities.ts` | Hero capability snapshot |
| `web/src/engine/nav/path-guide.ts` | Live route state and replanning |
| `web/src/render/path-overlay.ts` | Chevron rendering |
| `web/src/ui/map-screen.ts` | Destination-selection UI |
| `web/src/engine/nav/recorder.ts` | Player-route recorder |
| `tools/build-nav.mjs` | Build-time extraction |
| `web/src/data/nav/*.ts` | Generated navigation data |

## 6. Map screen

The map screen:

- shows the current cavern group/map strip;
- renders the selected map at an integer scale;
- shows every platform — vertical, collapsing and horizontal — at the default position
  its record carries, from the shared platform sheet, which is also what tells the three
  families apart;
- shows doors and town exits;
- shows the hero's map position;
- accepts only valid/reprojectable navigation destinations;
- reports unreachable destinations rather than silently accepting them;
- loads every map needed by a possible route before searching.

The full map fits inside the 672×432 canvas without panning.

The map UI must remain visually consistent with the existing inventory/menu UI.

### Aiming is not committing

The screen has one verb, and it is *aim*: move the target rectangle. Committing is
**Enter** — and nothing else commits. `MapScreen.handleClick`
is the whole pointer API — a click in the map area puts the rectangle on that cell and stops, a
click on the strip browses (Tab's gesture), and `choose` runs only from the Enter case in
`handleKey`.

Two things were wrong before, and both cost the player the thread:

- A click called `choose` outright, so the mouse aimed *and* confirmed in one gesture. A
  player reaching for a spot and drifting a pixel while pressing spent the thread there,
  and the only way to look at a destination and change their mind was the arrow keys, one
  tile per press.
- `pointermove` re-aimed on every frame, so sweeping the pointer across a chart to look
  at it moved the destination under the pointer. There is no `pointermove` listener in
  `main.ts` and no motion entry point on the screen, and `map-screen.test.ts` asserts
  both, because either one alone would bring the trailing target back.

`handleClick` clears the transient refusal message: *"That place is not passable."* is
about the cell it was asked for, and a click has just moved the target off it.

### Platforms on the chart

A platform is runtime state, not map data. `render_vertical_platforms_to_proximity`,
`process_visible_collapsing_platforms` and `update_and_render_horiz_platforms` stamp
three tiles into the proximity map every frame, and none of them is ever in the MDT —
so the chart was a cavern with all of its machinery missing. The player rides mp80's
row-30 platform at `(203,27)` and the map showed the empty air he was standing in.

They are drawn at the **default** position, which is the one a cavern is entered at and
the one a platform snaps back to when its map is loaded again
(`platform-state.ts`), so the chart is the cavern the player meets. Where a platform
*travels* is deliberately not drawn: a horizontal platform has already begun to move by
the time the map opens, and a span it is not on would be worse than nothing. Rows below
the chart's last row with anything on it are skipped — the chart is cut at
`chartedRows`, and a platform under that is in rock nobody is shown.

`speed: 0` platforms are left out with everything else the model treats as a static
ledge rather than machinery.

## 7. Live route guide

The guide:

- starts at the hero's current position;
- reveals only the untraversed portion;
- draws every covered cell of jumps/falls/carried movement, not just edge endpoints;
- continues across doors and map changes;
- draws off-screen continuation at the viewport border;
- survives save/restore correctly;
- does not treat mid-air positions as route drift;
- replans when the hero is standing on a node and the relevant world state changed;
- keeps the existing route if a transient replan fails, then retries;
- invalidates on ability changes, key-count changes, door/map changes, and relevant
  platform state changes.

The overlay is drawn after the background and before entities/the hero.

## 8. Recorder mode

`web/src/engine/nav/recorder.ts` provides a lightweight way to compare real play with
the navigation model:

```text
navRecorder.start()
<play>
navRecorder.report()
navRecorder.clear()
```

The report records:

- map position;
- engine-applied input;
- airborne/rope/slope/current state;
- equipped accessory;
- graph interpretation of each standing-to-standing hop.

Cells merely flown through are reported as flight, not as missing navigation nodes.

This is the preferred diagnostic tool when a player reports a route the graph cannot
reproduce.

## 9. Save/shop integration

The Thread of Yaga is:

- magic item id `9`;
- consumable;
- sold by all nine magic shops;
- priced at 2,000 gold;
- stored outside the packed five-slot generic magic-item array.

Current save layout:

- owned Thread copies: `0x4A`;
- extended shop stock: `0x4B..0x53`.

The generic eight-item shop mask and five-slot magic-item array remain unchanged.

## 10. Localization

The map UI has localized keys for:

- title;
- controls/hints;
- unreachable destination;
- invalid destination;
- route-cleared/use messages;
- Thread of Yaga item name/description.

The keys exist in all three supported locales and are covered by locale-completeness tests.

## 11. Validation

Important tests include:

- `web/tests/nav-data.test.ts`
- `web/tests/nav-jump-differential.test.ts`
- `web/tests/nav-graph.test.ts`
- `web/tests/nav-pathfinder.test.ts`
- `web/tests/nav-route-cases.test.ts`
- `web/tests/path-overlay.test.ts`
- `web/tests/nav-recorder.test.ts`
- `web/tests/nav-keys-extraction.test.ts`

The jump differential test runs the actual engine frame loop against the navigation model
and compares resulting landings.

Recorded player routes have been used to validate:

- level-1 traversal through `mp10 → mp21 → mp1d → mp10`;
- boss-arena entry and post-boss exit;
- platform riding;
- rope catches;
- current lifts;
- seam-wrapping platform travel.

Current repository state:

- `tsc --noEmit`: clean.
- `nav:check`: up to date.
- `1044` tests passing.
- `0` tests failing.

The five failures recorded here closed on the previous revision; the mp80 journey to
`(244,7)` and what it says about the lift model is §15, and the rules it added are
§16.24 to §16.27. The pair a level-5 journey could not fetch is §20, and the rules it
added are §16.28 and §16.29. The map screen's input contract — aim, then Enter — is
§6, and the rule it added is §16.30.

## 12. The five level-8 failures, and how each closed

The five failures left at the end of the previous revision were concentrated in the
traversal model around `mp80`/`mp81`/`mp82`. All five are closed, and they split
evenly: three were tests describing a graph that no longer exists, and two were the
graph offering something the engine does not do. In both of those the graph changed.

The measured findings that got them separated:

- The mp80 shaft is split into a closed component of 1,409/2,170 nodes.
- The mp82 lower region is also a closed component.
- Two engine-faithful restrictions are involved, and neither is wrong: the lifted-node
  guard for entering a conveyor, and the fall `pushedBack` behavior.

Affected tests, by their names:

- `nav-graph:170` — ride-slot census: 5,969 slots where the table expected 5,684, from
  the crouched slots added under low ceilings. The table predates crouch, so the census
  now asserts the measurement (5,969 total, 5,966 live, 3 dead slots) rather than a
  number nobody can derive.
- `nav-graph:501` — 415 jump edges the model did not offer, all of them launched from a
  crouched slot. The test built its platform mask from `slot.headRow + 3`, which for a
  crouched slot is the row *under* the platform; the graph builds it from
  `slot.platformRow`. The graph was right.
- `nav-platform-state` — the first `setPlatformPlaces` report was dropped when it
  happened to agree with the graph in hand, so `this.places` went on describing a world
  that had already moved on and the *next* reading rebuilt from the wrong rows. It now
  records the reading first and only then decides whether the graph needs rebuilding.
- `map-screen:482` — mp80 `(111,21)` → mp81 `(124,6)`, bare capabilities.
- `nav-route-cases:362` — the same route.

The last two were the interesting pair, and the answer to the question section 12 used
to leave open — *is a graph edge missing, or are the tests asserting a route the engine
cannot traverse?* — is the second one, with a twist. Bisecting `37ba8f1` (passing) to
`2523aa9` (failing) narrowed it to a single hunk: the lifted-node guard moved to the top
of the conveyor-entry block. That moved guard removed five edges, and the bare route
needs exactly one of them, `CARRY_L (95,27) → (96,29)` across the mp80 shaft. With it
gone the journey is not merely longer, it does not exist for a bare hero: every path out
of the start region now goes through the ordinary-key door at mp80 `(57,15)` — proved by
deleting that portal and watching reachability fall from 5,033 nodes to 2,558 with the
goal gone — and every path needs `SLOPE_STAND`, because the ramp at columns 82..86 is a
slope.

So the graph changed correctly and the tests were the stale side. The edge they were
standing on is one the *player* had already disproved: standing at `(95,27)` with the
jet under him, the route offered `CARRY_L (95,27) → (96,29)` and he was carried up to
`(96,21)` instead, never reaching it. The recorded trip in `WORK/DOC/esco.txt` does not
use the edge either — it comes into mp80 at `(166,31)` and walks the row-32 gallery to
`(117,32)`.

Both tests were then made to say what their own comments always claimed. `doorOpen`
reports the west-gallery door at `(57,15)` as standing open — it is, in the session the
journey was reported from — and `nav-route-cases` adds `planAccessories` for the ramp.
Neither spends a key, which is what both tests were written to pin down, and the screen
reaches the journey on its own shoes rung, the rung whose comment already named this
corridor: *"mp80's west gallery is exactly that: Silkarn shoes to climb the ramp at
columns 82..86, and the ordinary key for the door at (57,16)."* The door is now open
instead of fetched, so rung 2 answers nothing and rung 3b answers the journey.

Two of the original five were closed earlier, both by the same change, and the story
is worth keeping because the design section above had it right while the code did not:

- `nav-route-cases:172` — the mp81 jump into an up current.
- `path-overlay:425` and `path-overlay:507` — lift rendering and the recorded trip.

Horizontal ride edges were built from per-cell adjacency alone, which by construction
never joins two cells in different rows. A horizontal platform's slots are per *riding
offset*, and where the ceiling is under three tiles the hero crouches — so the standing
slots at row 56 and the crouched ones at row 57 of the same platform were two islands,
and any walk that needed both had no route. (Those two rows are themselves the mistake
described in §17a: the crouched hero never dropped a row, so the row-57 slots were
phantom cells and the row-56 slots he actually rides were being thrown away. §18 fixed
the cause; the chain linking here is still what makes the movement an offset-wise walk
rather than a set of adjacent pairs.)

The graph now also links each horizontal slot to `slot.next` / `slot.prev`, which is
the platform's own movement chain at a fixed offset, and skips the pairs cell adjacency
already covers. That is what rule "ride links follow platform movement/offset chains
rather than simple spatial adjacency" meant, and it is what makes mp82 `(179,53)` →
`(157,54)` findable.

A journey that has to fetch a key and then come back and use it is the other half of
the mp80/81/82 story, and it is not a graph problem at all. mp82 `(27,19)` is the
landing of the door back into mp80, and the only other way into that region is the
ordinary-key door at mp80 `(57,15)` — whose key is on mp82, past the mp81 passage.
Every leg of the trip is found in a few thousand expansions. One search that has to
hold all three is not: the state dimension that records a pickup means the search
settles every state reachable while still holding no key before it ever sees one, and
that covers the whole of every cavern on the level — 7.6 million expansions against a
400,000 budget. The screen answered "this journey needs one key" while the player
stood on the route that fetches it, and once he had walked out to mp81 the guide's
re-plan turned round and sent him back through the door he had just left.

`findRoute` now splits it when `collectKeys` is set and the one-shot search fails, and
it keeps splitting: ask for the shape of what is left under `unlimitedKeys` (cheap, no
key dimension), take `lockedDoors` as the demand, and when he is not carrying that
many, try each key of a kind he is short of as a *waypoint* — walk to it, count the
keys he goes over (the waypoint's own among them), subtract what the walk spent, and
ask the same question again from where he now stands, one key deeper. Every leg is
walked with `collectKeys` off, because the pickup dimension is the part that floods and
a leg whose goal *is* a key does not need it; what that cannot see is a key walked
*past* on the way, so the keys are counted from the points the leg actually visits
rather than from what it reports. When he already carries what the rest costs, the
demand is met and the retry simply drops the pickup dimension; when the shape says the
journey costs no keys at all, the one-shot failed on the flood and the plain search is
the answer. The one-key journey is 7,923 expansions, and `nav-route-cases` pins all
three of its phases: the whole trip, the re-plan from the mp81 arrival, and the walk
back out once the key is held.

One waypoint is not always enough. mp80 `(111,21)` → mp80 `(227,34)` needs the key at
mp82 `(26,47)` for the west-gallery door at `(57,15)` and the key at mp81 `(125,36)`
for the door at mp81 `(236,4)`, and neither key is on the way to the other — the mp81
key sits behind the first door, so no single trip to it can also carry the first key
any further. The same question asked from the first waypoint finds the second, and the
route that comes back is 13,453 expansions and 1,745 ticks, with two keys gained and
two spent. That is
what `nav-route-cases` "a journey that needs two keys, and goes and fetches both" pins
down, and the check in it that matters is not the count but the walk: replaying the
route the way the engine would — a key for every node he goes over, a door for every
closed one he goes through — and requiring the pocket never to go below zero. The
decomposition used to hand back a route that spent three keys out of a pocket that
held one, which is exactly the "leads to a closed door, the hero has no key" the player
reported.

Walking it and then restoring a save broke it again, in a way that had nothing to do
with the graph. A platform reading is engine state, and it is read for whichever
cavern the hero is standing in — so the store held every *other* cavern at whatever
arrangement he last left it in, mid-ride included. A platform snaps back to `startY`
when its cavern is entered through a door, so that reading was not the one he would
find, and the graph drawn over it promised a passage the engine had already closed
up: displacing mp81's platform at column 24 turned a 2.3-second search into one that
had not finished in two minutes. A hard refresh emptied the store and the journey
came back; a restore did not, because nothing on the restore path touched it.
`NavGraphStore.reset()` now drops the graphs and every platform reading while keeping
the map data, `performGameRestore` calls it (along with the floor-set and the
cavern-change latch `syncPlatformPlaces` works from), and `syncPlatformPlaces` calls
it on every change of cavern — which is the actual invariant: a reading is true only
for as long as the hero stays in that cavern. `clearActiveRoute` also clears the
guide's route now, not just the overlay; it was leaving a route live underneath the
chevrons it had just wiped.

The last of the level-8 defects was in the guide and the overlay rather than the
pathfinder, and it was invisible to every test of the route itself — the route was
always correct. Four of them, and none of the first two was the one the player was
hitting; all four were found by reading his console, not by a test.

The Thread of Yaga is a list of *visits*, not a set of cells, and this journey walks the
same corridor twice: mp82's row 35 runs from the portal at (88,35) down to the key at
(26,47) and then straight back through the same door, so that corridor is walked once at
route indices 183–206 and again at 309–332, cell for cell. `drawPathOverlay` painted in
draw order, which made the *second* pass win: every chevron from col 87 westward to 65
came out pointing east, and because the return pass sits a hundred cells further along
the route it arrived at the far end of the fade, taking the outbound chevrons with it. A
cell is now painted at most once per frame, first visit wins — the first visit is always
the one ahead of him, because `remaining()` is ordered — and once he has the key the
anchor has moved past the outbound run, the return becomes the first visit, and the line
turns round on its own. `step` is still counted for a withheld paint, so the fade spends
itself against the route's real length.

That fixed the direction and left the player with no chevrons at all, which pointed at
the second one. `advanceProgress` only moved the anchor when the hero stood *exactly* on
one of the route's cells, and a portal landing does not always do that — the engine's
position is a tile off the line the search drew. The anchor then stayed on the room he
had just crossed out of, and everything downstream reads that anchor: `remaining()`
started back in mp81, so the overlay saw mp82 *enter* its own stretch and took that
first entry for the way back out of a door he had not walked through (it is looking for
a re-entry, and a route whose anchor precedes the entry has an entry, not a return).
The whole of the room he was standing in went to `CHEVRON_FAR_ALPHA` — measured, the
brightest chevron anywhere near him was 0.15, which is no chevrons. Two changes: the
anchor now moves to the start of the visit on the hero's map even with no exact cell
match (never a rewind *within one visit*, since a visit is only ever reached by
moving forward), and `returnIndex` counts the
first entry into his map as where he is heading, taking only a *later* one as the
return. Landing at (89,35), (88,34) or (88,35) all now draw the same bright trail west
toward the key.

A third one, found the same way — by logging rather than by testing, and the logs made
it plain that the first two were not what the player was seeing. He described it
exactly: *"chevrons start to go west, then down the rope, and halfway on the rope they
stop and reverse — up, then right to the door"*, and the trace showed why. The anchor
searched forward for the hero's cell and took the first hit, but a rope the route goes
down and comes straight back up passes the same cell **twice without leaving the map**,
and the mouth of that rope is a cell the route only reaches on the way *back*. So the
scan found the ascent a hundred points on, the anchor landed on the return leg while he
was still descending, and `remaining()` opened above him: the trail began at the top of
the shaft pointing up and east to a door he had not reached, with the whole descent
behind the anchor and therefore never drawn. The search is now bounded to
`ANCHOR_SCAN` points past where the visit begins — a route is walked one cell at a time,
so the anchor normally moves one or two points a frame and the bound never comes into
it, while a cell that appears only much later stops being a match and goes back to being
a coincidence. The window is measured from `visit` rather than from the old anchor, so a
portal crossing still works: `visit` has already skipped off the map he has just left.

A fourth one, and the one that outlived the other three. The player walked through a
door, walked straight back out of it, went in again — and the chevrons went out and never
came back. The anchor had been searching in one direction only. Coming back out of the
door put it on the *far* side: `points[progress]` was a cell of the room he had left, the
forward scan skipped off that map looking for a room he was no longer in, found no later
visit of it at all, and stopped — leaving `remaining()` opening on a foreign point. The
overlay's `returnIndex` then never found an entry into his room either, so every cell in
view was either outside his cavern or a hundred points along the fade: `tiles=0`, border
marks only. Re-entering did not help, because the same scan ran again from an anchor that
was still behind him. The search now runs **backwards over the same `ANCHOR_SCAN` window**,
and the two sides are compared: the nearer one wins, ties going forward, because the route
is walked in order and a cell on both sides of the anchor is normally the outbound and the
return of the same corridor. That gives the door case (the room he is standing in is
*behind* the anchor) and the rope case (the later occurrence is far *ahead*, outside the
window) the right answer each way, and the fallback with no cell match at all now takes
the nearer of the two visit boundaries instead of only ever jumping forward.

The fifth of the guide's defects, and the one the player hit last, was not in the anchor at
all: every number in the route was right, and the guide still drew a line into a locked
door. He planned mp80 `(111,21)` → mp80 `(227,34)` and followed it to the end of the second
key fetch, where the trail led him out of the door at mp82 `(174,10)` into mp81 `(227,60)`
and on to the door at mp81 `(236,5)` — shut, and with nothing in his pocket. *"As if I had
the key, but I still have to pick up it."* Opening the inventory and closing it fixed it,
and that was the tell that settled where the fault lay.

A route is not a path, it is a **plan**: "walk to that key, then come back and spend it".
`PathGuide` re-plans it, but it re-plans only when a *counter* differs from the one
recorded at plan time — mask, keys, Lion-Head keys, the platform signature — and it defers
the search to a frame where the hero is standing still, because the search is synchronous
and a held direction key is what makes a walk feel like a walk. Both halves are right for
what they were built for, and together they produced this: the route in hand was planned
for the pocket the hero had a moment earlier, the pocket then changed under it, and until
he happened to release a key the guide kept drawing a plan it knew to be stale and could
not afford. The fix is not to re-plan more often. It is to tell *stale* from *unwalkable*.

`PathGuide.keysShort` answers "can he still open what is left of this?", and both halves of
the answer have to be counted over the stretch **ahead of the anchor only** — which is
where the first attempt at this was wrong, and it is worth recording because the console
line said so in one row:

```text
hero=24:(151,16) anchor=770/876 keys=0 gained=2/0 spent=2/0 short=-1
```

An 876-point route, an empty pocket, both of its key fetches already walked past, one shut
door still ahead — and the guard answered "covered". It compared the shut doors ahead with
`keys + route.keysGained`, and `keysGained` is a total for the whole journey: the two keys
he had already picked up counted as ones still to come. The route drew him through the door
at mp82 `(174,10)` into mp81 `(227,60)` and on to the shut door at mp81 `(236,5)`, and the
line stood for the whole leg because the idle gate was the only thing that would have
re-planned. So: shut doors in `hops[i..]`, keys still lying on the floor at `points[i+1..]`,
each counted once, **per pocket** so a Lion-Head key cannot pay for an ordinary door, and a
key already taken not counted at all. That answer is zero for every route the search hands
out honestly — `nav-route-cases` replays the pocket along the whole journey and it never
goes negative — and positive exactly when the route and the pocket have come apart. It
bypasses the idle gate; everything else still waits for one, and the shortfall is recorded
with the ask like every other signature, because a question asked every frame is the mp81
freeze with a new cause.

The second version read those two facts out of the graph, and it failed in exactly the
place the first one had. `store.reset` empties the cache on every change of cavern, so the
guide is routinely standing in a cavern with no graph built — and a cavern with no graph
reads as having neither a shut door nor a key. The player's second log caught the
question decaying rather than answering:

```text
anchor=770/876 keys=0 gained=2/0 spent=2/0 short=0 askedShort=1
```

`askedShort=1` is a shortfall already found and recorded; `short=0` is the same route at
the same anchor a moment later. Nothing about the route or the pocket had changed — the
store had. So the answer no longer comes from a graph at all. `findRoute` says it: every
hop carries the key kind its crossing costs (`NavHop.doorKey`, 0 for an open door), and
every route names the points its keys lie on (`NavRoute.picks`). The legs of a decomposed
journey are searched with `collectKeys` off precisely because the pickup dimension floods,
so their counters never rise and only the accounting that stitched them knows — which is
why the picks are attached there, with their indices rebased at the join. `buildBudget`
now reads nothing but the route: no store, no `peek`, no `get`, no rebuild during a ride,
and no answer that depends on which cavern happens to be cached.

## 13. Working rules for future changes

1. **Model the engine, not an intuitive physics model.**
2. For every traversal predicate, identify the corresponding engine guard/probe first.
3. Do not add whole-body collision tests the engine does not perform.
4. Treat wrapped rows/columns as a cylinder everywhere, including platform travel and
   jump/fall distances.
5. Keep platform slots and offsets distinct from their shared cell coordinates.
6. Treat keys as world items with save-state presence, not as permanent graph features.
7. Keep directed portal topology directed.
8. Boss arenas are passages only after their post-boss exit is active.
9. A mid-flight position is not a navigation node and must not trigger route invalidation.
10. A failed replan does not automatically mean the route became invalid.
11. A search that was *asked for* is recorded either way. `PathGuide` re-plans ahead of
    every waiting interval when a platform moves, so an attempt that left the platform
    signature stale re-fired on the next frame — one synchronous `findRoute` after
    another while the hero stood still. Record the signature and the plan before
    returning on failure or throwing.
12. Validate questionable behavior against the engine's real frame loop or a player
    recording.
13. Keep generated navigation data reproducible with `nav:check`.
14. A pickup the journey depends on is a waypoint, not a state dimension to flood
    through. When `collectKeys` is set and the one-shot search fails, ask for the
    shape of the journey and then split it at the key — see section 12.
15. Anything the graph is built from that is a reading of live engine memory must be
    dropped when the world under it is replaced. A restore is one; a change of cavern
    is another, because a platform only stays where the hero left it until the engine
    puts it back. Map data is the exception and survives everything.
16. A route is a list of *visits*, not a set of cells, so drawing it in order is not the
    same as drawing it correctly. A journey that fetches something and comes back walks
    the same corridor twice, and the second pass would overwrite the first — pointing the
    line back out the door and taking the fade with it. The first visit of a cell is the
    one ahead of the hero; paint it once and let the anchor decide when that changes.
17. The anchor must always be on the map the hero is standing in. Every consumer reads
    it that way, and a consumer that asks "where does the route come back to this room"
    cannot tell a room it *entered* from one it *returned* to unless the anchor is
    already inside. So `advanceProgress` moves to the start of the visit even when no
    cell matches — a landing a tile off the line is not a reason to leave the anchor in
    the room he has just left. Reaching that start is not by itself a rewind and not
    by itself a leap: it happens on whichever side of the anchor his visit begins, and
    the nearer side wins.
18. "The first cell ahead of him that he is standing on" is only the same as "where he
    is" when the route passes each cell once. A route that goes down a rope and back up
    it passes the mouth twice without leaving the map, and the later occurrence is the
    *ascent* — matching it there puts the anchor on the way back and silently discards
    the whole descent. Bounding the search past the start of the visit keeps a match
    from being a coincidence, and the bound must be measured from `visit`, not from the
    old anchor, or a portal crossing falls outside it.
19. A route is walked in order, but the hero is not obliged to walk it in order. He goes
    back out of a door the route only crosses once, and then in again; a search that
    only ever looks forward leaves the anchor on the far side of that door, on a map he
    is no longer standing in, and everything downstream — `remaining()`, `returnIndex`,
    the fade — reads it as having nothing to draw. So the search runs both ways over the
    same window and the **nearer** end wins, ties going forward: forward alone breaks the
    rope (the later occurrence is far ahead), backward alone breaks the corridor walked
    twice (the earlier pass is behind him), and neither is a rewind in the sense rule 17
    warns about, because the window is bounded.
20. When a test and a player report disagree about what the engine does, the report wins
    and the test is the thing that changes. mp80 `(111,21)` → mp81 `(124,6)` was written
    as a bare, keyless walk while the graph still offered `CARRY_L (95,27) → (96,29)` —
    an edge he stood on and reported as not happening. Closing that edge was right and
    the journey it broke did not exist any more, so the fix was to say so (the door is
    open, the shoes are on) rather than to keep an edge the game does not have. Find out
    which side is stale by bisection before assuming either; see section 12.
21. **Stale and unwalkable are different failures, and only one of them may wait.** The
    idle gate exists so a held direction key cannot turn a walk into a pathfinding loop;
    it is not a licence to keep drawing a route into a shut door. A key the hero has spent
    does not come back, so a route that walks him through a locked door is not the same
    journey drawn a moment out of date — it is a journey he cannot finish, and re-planning
    it is the only way the line becomes true again. Ask the question cheaply, bypass the
    gate when it says yes, and record the answer with the ask: a question asked on every
    frame is the mp81 freeze wearing a new cause.
22. **Count a plan over the part of it that is still ahead of the hero.** A route's totals
    (`keysGained`, `keysSpent`) describe the whole journey, and a route the hero is halfway
    through is not that journey any more. `keysShort` counted the shut doors ahead against
    `keys + keysGained` and reported a hero with an empty pocket, standing at a locked door,
    with both his fetches behind him, as covered — the same arithmetic twice, once per pocket
    is right, once over the whole route is not.
23. **A question asked per frame must be answerable from data that does not decay.** The
    fix for the above read the cavern's graph, and `store.reset` empties the cache on every
    change of cavern — so the answer depended on which cavern happened to be built, and
    went to zero while the stale route went on being drawn. `NavHop.doorKey` and
    `NavRoute.picks` exist so the route can answer for itself. Anything the guide asks
    every frame about the world has the same obligation: either it is derived from the
    route, or it is a reading whose lifetime is bounded and whose loss is handled.

## 14. Useful invariants

These are the highest-value sanity checks when changing the pathfinder:

- All 31 maps decode to `mapWidth × 64`.
- Attribute groups that are zero-terminated stop before treating tile `0` as a value.
- Portal topology remains directed.
- Open doors do not require keys.
- Every generated key is accounted for and its runtime presence can be determined.
- Boss exits cover all ten known boss arenas.
- Horizontal platforms are bidirectional.
- Horizontal ride offsets match the engine (`[-2, -1, 0]`).
- Up-current traversal never mixes separate lift runs.
- Platform travel can cross the row-0 seam.
- A jump can be reproduced by the same frame-by-frame rules used by the differential
  test.
- The overlay draws cells, not merely one marker per graph edge.
- A route starts at the hero and ends at the selected destination.
- A route in hand is never short of keys: locked doors ahead of the anchor are covered by
  the pocket plus the keys the route says it picks up.
- A lift's `topY`/`bottomY` is what `try_move_platform_up`/`Down` allow, walking the
  decoded map one row at a time — re-derived and compared in `nav-platform-model`.
- A vertical ride slot has an open **middle** column; a horizontal one has the two rows
  under the hero's head clear across his three columns — the crouched carry test, not a
  3x3 box. See §17.
- A flight pose whose **middle** column is inside a platform standing right now does not
  exist. Neither `check_floor_for_landing` nor `jump_press_handler` asks it, and a
  lift is three tiles wide. See §19.
- A lift with no `atRest` slot is unreachable: the hero boards by landing, and the only
  row he can land on is the one it is standing at. Such a lift emits no slots. See §19.
- A flight with Up held alone can end on a rope, and one with a direction held cannot.

## 15. mp80 (203,29) -> mp80 (244,7), and the recorder diff behind it

The player picked that journey with the Thread of Yaga and got nothing. He then ran
recorder mode over the whole trip and pasted the report, which ends:

```text
-- 33 hop(s) the graph does not have; each *** line above is a bug in the graph --
```

The trip is: ride the row-30 platform east and back, take the rope in column 197 to
its head at (197,9), walk the row-11 gallery to the lift at column 227, ride it down,
cross to the rope in column 243, drop to the row-19 shelf, ride the x=250 lift to the
top of its travel, and jump up-left into the row-7 gallery, where (244,7) is.

Thirty-three lines is a report about the whole level, and most of them are not this
journey. Three of them are, and each was in a different file.

### The rope on the way up

He was riding the platform at (197,27), held Up, and the jump rose to (197,25) — where
the rope hanging in column 198 begins — and took hold of it. The model had no way to
express that: `nav/jump.ts` knew a descent could end on a rope (`airborne_movement`
probes the cell under his middle foot after it has dropped a row) and that a fall
could, but a **rise** was only ever a rise.

The code is `try_climb_rope`, and it is reached from exactly one place:
`state_machine_dispatcher` routes **Up held on its own** to `up_pressed_dispatch`,
which calls it on every frame of the rise (dungeon-input.ts:372-374, 426-440).
`right_up_pressed` and `left_up_pressed` jump and step sideways and never reach it,
so a jump with a direction held is exactly the flight it was — which is the easy half
to get wrong, and `nav-jump-differential` now proves both halves against the engine's
own frame loop.

### The lift's travel

`tools/navlib/platforms.mjs` walked a lift's range with a **3x3 box clear** test on
top of the engine's guards. The engine asks one cell — `try_move_platform_up` reads
the tile above the middle of the hero's head — and two three-cell spans: the row the
platform is about to occupy and the one above it (`bx` and `si` in asm/fight.asm). It
asks nothing about his body, because he is already standing there.

The box test was wrong twice over and it cost every vertical lift on the level rows it
really travels. On mp80 seven of eight were cut short and the x=250 lift stopped at row
15 when the engine takes it to 13. The range is now the engine's own walk, and
`nav-platform-model` re-derives it from the decoded map and compares, so the generator
cannot drift from the guards again.

### The lift's slot

With the range right, (250,10) and (250,11) still were not slots, because the hero's
*right* column is inside the wall at column 252 on those two rows. `standingAboard`
demanded a free 3x3, and the engine demands nothing of the kind:
`move_platform_down_damage_monster` finds the platform by reading the tile under the
hero's **middle** foot and carries him a row with it, and
`dungeon-hero.move_hero_right_if_no_obstacles` probes one column — the one he is
already in.

So a lift slot now asks `canRest`'s question and nothing more: the hero's middle column
over his three rows must be open. A cell whose middle column is inside rock is a
number in a grid, not a position; a cell whose *side* is inside rock is a position the
player has stood in. That is §13's rule 3, and this is where it was being broken.

The four-row jump off the top of that lift is what reaches the row-7 gallery, and
without any of the three the whole map north of row 11 was unreachable from the ledge
he started on.

### What else the recorder named, and is not fixed here

The remaining lines are two other things, and they are worth naming because the next
recording will still show them.

- **A lift carries him at `x - 1 .. x + 1`, not `x`.** `identify_platform_tile` reads
  the tile under his middle foot and `find_platform_under_hero` turns it into the
  platform's column with `absX = heroLeftCol + dh`, `dh` in `1, 0, -1` — so a hero
  hanging off either side of the three-tile ledge is aboard it. The player's own trip
  rides the x=227 lift at (226,18) and then down from there to (228,26). Thirteen of
  the 33 lines are these. It is modelled as `x` alone, and the reason is not that the
  reading is unclear: `PlatformModel.places` is the live row read out of `g_mem` as
  `{ absX, y }` keyed by **column**, so two lifts a column apart cannot be told apart
  at all — three caverns already share one, and `nav-platform-model` names them.
  Widening the riding positions makes every neighbouring pair share a column as well,
  and the graph would pin the wrong row to the wrong lift. The reading has to become
  `{ platform, y }` before the slots can widen.
- **A crouched hero is carried into a position his 3x3 does not fit.** The recorder
  has him at (212,27) and (213,27) on the row-30 platform with `DOWN` held, and he got
  there because `move_hero_right_if_no_obstacles` **skips the head-row test while
  `SQUAT_FLAG` is set** (dungeon-hero.ts:227). **Fixed in §18** — the horizontal ride
  slot is the carried-crouched test, not a 3x3 box.

And a handful of the lines are the recorder's own: he spends a few frames on a cell
with nothing under him whenever he steps off a rope, because `dungeon_finish_rope_frame`
clears `ON_ROPE_FLAGS` on one frame of the two-phase dungeon frame and the recorder
reads `JUMP_PHASE_FLAGS` on the next. It is one frame of falling that reads as
standing. (197,9), (198,9), (225,17) and (244,17) are all that, and none of them is a
node the graph owes him.

### What the level looks like afterwards

The passage the player described is now in the graph, and several long-standing
journeys got shorter and cheaper as a side effect, so the tests that pinned them were
re-based:

| Journey | Before | After |
| --- | --- | --- |
| mp80 (111,21) -> mp82 (27,19), bare | 644 hops, 1 key | 359 hops, no key |
| mp80 (111,21) -> mp80 (227,34), bare | 1061 hops, 2 keys | 649 hops, 1 key |
| mp80 (111,21) -> mp81 (124,6), all shoes | 399 hops | 352 hops |
| mp80 (203,29) -> mp80 (244,7) | no route | 74 hops |

The reason is that mp80 reaches mp82 through the door at (166,31) and the row-32
gallery, which the plan has described as a thing the player walked since section 12
and which the graph did not have: the lifts that lead to it stopped two rows short.
So the west-gallery door at (57,16) is no longer on the way to anything, and the
Silkarn ramp at columns 82..86 is not on it either.

Ride slots went from 5,969 to 5,989 and nodes from 30,297 to 30,317; the census in
`nav-graph` is measured rather than assumed, as section 12 requires.

## 16. Working rules, continued

24. **A rise is driven by held input, and Up alone is the input that climbs.** The
    whole ascent runs through `state_machine_dispatcher`, which answers Up on its own
    with `try_climb_rope` on every frame. A flight can therefore end on a rope *going
    up*, which is a different piece of code from the rope caught on the way down, and a
    model that only knows the second cannot follow the player off a platform into a
    rope. The gate matters: `right_up_pressed` never reaches it.
25. **A lift's range is the engine's guards, walked one row at a time, and nothing
    else.** `try_move_platform_up` asks one cell above the head and two three-cell
    spans; it asks nothing about the hero's body, and a body test on top of it is
    §13 rule 3 broken in the generator rather than in the graph.
26. **A platform supplies its own support, so a ride slot does not ask for one.** What
    is left is `canRest`'s question — is the hero's middle column open — and nothing
    else. A horizontal platform keeps the box test, because there the ride is pinned
    where it stands and the hero walks onto it from the ground.
27. **When a question is asked about a platform, ask which platform.** A lift's live
    row is `{ absX, y }` keyed by column, so two lifts in one column are
    indistinguishable. That is why the riding offsets stay at `x` for now; widening
    them is correct in the engine and wrong in the model until the key stops being a
    column.
28. **A pickup on the floor is asked about by its record, never by the cell the route
    walks through.** The engine collects from a window around the entity record, so
    the two are different cells for every key and for all four pairs of shoes — and
    the runtime callbacks (`keyPresent`, `shoePresent`) are answered from the loaded
    cavern's entity list, which speaks in records. Asked the other way, every pickup
    in the game reads as already collected. See §20.
29. **A rung that grants an accessory is a statement about the inventory, not about
    the level.** `planAccessories` may assume a pair the hero is already carrying and
    nothing else: a pair he would have to walk to is `collectAccessories`' business,
    and if that cannot fetch it then this level has no such pair. The fallback is
    still worth having — it is what answers for a pair picked up on another level —
    but it must be the *last* thing offered, and the rungs above it must be able to
    do their job, which is §20b.
30. **On the map screen, aiming and committing are different acts.** A click or an arrow
    key puts the target rectangle on a cell; Enter spends the thread and a click never does. A pointer that trails the mouse is not aiming, it is
    re-deciding: on a 320-column chart, looking at the map is itself an input. See §6.

## 17. Crouching
- standing hero: 3×3
- squat/crouch hero: 3×2
- **a crouched hero does not get a row lower.** This section used to say he did, and
  the model acted on it; §18 is the report that proved otherwise.
- crouching is required to ride horizontal platforms beneath low ceilings
- **the ride row is always `platformRow - 3`**, for a crouched hero as much as a
  standing one. The platform's `platformRow` must remain separate from the hero's
  `headRow` regardless.
- while `SQUAT_FLAG` is set, `move_hero_right_if_no_obstacles` and
  `move_hero_left_if_no_obstacles` **skip the head-row test** (dungeon-hero.ts:227 and
  :255), so a crouched hero is carried sideways into a position his 3×3 does not fit.
  That is the player's mp80 `(212,27)`/`(213,27)` on the row-30 platform, and mp83's
  `(26,32)`-`(29,32)` on the row-35 platform.
- a horizontal ride slot is therefore exactly the strongest position the platform can
  hold: the two rows under the hero's head clear across his three columns. Nothing
  else. That is `ridingAboard`.

### 17a. Why crouching is not a navigation state

The head row cannot move while `SQUAT_FLAG` is set, and that is a closed question
rather than a reading:

- `down_pressed` sets `SQUAT_FLAG` and writes nothing else (dungeon-input.ts:239-244).
  The `hero_scroll_down` above it is the rope branch, which returns before it.
- The only two writers of the viewport row anywhere in the engine are the jump-up
  step (dungeon-hero.ts:309) and the rope descent (dungeon-input.ts:252).
- `draw_dungeon_hero` draws the squatting body at the same `dy`, from a different
  sprite frame — the arms drop a tile, the body does not.

So a crouched hero is a *standing* hero with his head-row cell exempt from the
sideways test, at the same row. A slot at `headRow + 1` is a cell nothing occupies,
and a slot rejected by a 3×3 test is a cell he demonstrably occupies.

`check_floor_for_landing` agrees and is the reason this is not a special case: it
reads `base + 3*36 + 1`, so a crouched hero's support is still three rows under his
head. A 2-tall hero has no floor of its own to land on. Crouch changes what the
sideways move consults and the hitbox (`dungeon-combat.ts:143`), and nothing else.

### 17b. What this cost

Modelling the crouch as a second row put a hole in every horizontal ride whose
ceiling drops, because a `RIDE_H` edge never joins two cells in different rows. mp82's
row-59 platform had standing slots at row 56 and phantom ones at 57 over columns
171-174; the walk `(179,53)` → `(157,54)` needed both and had no route. It is now one
unbroken chain along row 56 through the low stretch, and mp82's interior opened up
enough that the search now prefers mp81's own door at `(151,16)` over doubling back
through mp80 — the passage the player walked is still routable, it is just no longer
cheapest.

## 18. mp83 (34,31) -> mp83 (17,28), and the crouch that was a row, not a state

The report: Yaga Thread, mp83, from `(34,31)` to `(17,28)`, walked by the player, no
route. The recorder put six cells on the map as *not a standing position*:

    (29,31) (29,32) (28,32) (27,32) (26,32)     — no node at all
    (25,32) (24,32) (23,32)                     — ride nodes, present all along

### 18a. What the log said

He walked the row-31 floor west from `(34,31)` to `(30,31)`, stepped to `(29,31)` —
column 29 is rock at row 31, which is the engine's one-column-inside-rock step — fell
onto the row-35 platform, and rode it left. The ride is the part:

    (29,32)  x 74f  down
    (28,32)  x 37f  down
    (27,32)  x 72f  down then -
    (26,32)  x 37f  -
    (25,32)  x 36f  -
    (24,32)  x 35f  -
    (23,32)  x 20f  -

`DOWN` is held from `(28,32)` to the end. mp83's row-35 platform spans columns 18-29,
so its riding head row is 32 — and column 28 is solid at row 32. His cells `(26,32)` to
`(29,32)` are all cells a standing 3x3 does not fit in. The model had no slots there,
so it drew a wall.

### 18b. What the engine does

`move_hero_right_if_no_obstacles` / `move_hero_left_if_no_obstacles` take **one**
column of the hero — the one he faces — and test it, and they **skip the head-row test
while `SQUAT_FLAG` is set** (dungeon-hero.ts:227, :255). So they test exactly two rows:
`headRow + 1` and `headRow + 2`.

A horizontal platform moves the hero through those and nothing else
(`update_horiz_platform_coords` → `hero_on_horiz_platform` →
`move_hero_*_if_no_obstacles`, dungeon-platforms.ts:264-300). `hero_on_horiz_platform`
asks only whether a platform cell is under his feet row; it never looks at his body,
his facing, or which way the platform is going.

So a crouched hero can be carried into any cell his two rows under the head are clear
across, and the head row is not consulted at all.

### 18c. The mistake that made this a bug

The model answered "the ceiling is low" by emitting a **second set of slots one row
lower** (`headRow + 1`, `platformRow - 2`), so the crouched hero lived at row 33 while
the platform sat at row 35 and his head row was 32. Two things are wrong with that:

1. **He never moves down.** `down_pressed` sets `SQUAT_FLAG` and writes nothing else
   (dungeon-input.ts:239-244); the `hero_scroll_down` above it is the rope branch,
   which returns first. The only two writers of the viewport row in the engine are the
   jump-up step (dungeon-hero.ts:309) and the rope descent (dungeon-input.ts:252).
   `draw_dungeon_hero` draws the squatting body at the same `dy` from a different frame.
   The log above is the confirmation: `DOWN` held, row 32 throughout.
2. **There is no floor at the shorter height.** `check_floor_for_landing` reads
   `base + 3*36 + 1` regardless of crouch, so a crouched hero's support is still three
   rows under his head. A 2-tall hero has no landing check of its own.

So the row-33 slots were cells nothing ever occupies, and the real row-32 slots were
being thrown away by a 3x3 test the engine never performs. §17a follows from this.

The replacement is `ridingAboard`: the two rows under the head, clear across the three
columns. It subsumes the old standing test — it is that test with the head row
dropped — so the slot set is a superset of what §12's crouch produced, minus the
phantoms. The crouch is no longer a second row and therefore no longer an island in the
`next`/`prev` chain.

### 18d. Tests

- `nav-route-cases` `mp83: the walk west along the row-35 platform` — the walk itself,
  with a bare hero, through no rock; the ride through cells a standing hero does not
  fit; and the chain joined both ways. `(29,32)` is deliberately *not* pinned: column 31
  at row 34 is the exit tile `0x03` and `is_blocking_tile_simple` blocks it, so the
  engine's own carry refuses that cell too. He reached it by falling, which consults
  nothing.
- `nav-platform-model` `holds a horizontal slot to the two rows the engine ever
  consults` — every horizontal slot's two body rows are clear, and at least one slot
  has its head row inside rock, so the loop cannot pass without testing the rule.
- `nav-route-cases` `mp82: the walk across the row-59 platforms` — rewritten. It used
  to pin a `RIDE_H` edge crossing between row 56 and row 57, which is the mechanism
  §18c removes; it now pins one head row for the whole platform and the ride running
  through the stretch whose 3x3 does not fit.
- `nav-route-cases` `a journey that has to fetch a key and come back for the door` — the
  map sequences were the route the search happened to pick. It now goes mp80 → mp81 →
  mp82 through mp81's own keyless door at `(151,16)` instead of doubling back through
  mp80. The passage the player walked is still routable and is pinned directly now; the
  sequence is a cost decision, not a property.

## 19. mp81 row 62, columns 153 to 158

The player: *"There is no way through mp81 row 62 between columns 153 and 158."* Five
times, and correctly. The graph was routing the hero along that stretch.

### 19a. What the bad route did

For mp80 `(111,21)` → mp81 `(124,6)`, all shoes:

```
mp81(143,62) -> mp81(153,62)   WALK x10
mp81(153,62) -> mp81(155,0)    FALL
mp81(155,0)  -> mp81(158,62)   JUMP_HIGH
```

The x=155 vertical lift rests at row 63 across columns 155-157. It is three solid
tiles and **cannot be moved**, because there is no standing position on top of it —
row 60 at columns 155-156 is rock — so the hero can never board it. The player's own
route never goes near row 62: it arrives at mp81 `(154,45)` and climbs to `(160,42)`
on airflow.

The passage was in the graph from `808459e` onward and is **not** a regression from
§18. Its parent `caf3772` routed mp80 `(111,21)` → mp81 `(124,6)` as `23,25,23,24` /
399 hops, never touching row 62.

### 19b. Why neither flight test caught it

The descent's only floor test is `check_floor_for_landing`, and it reads **one cell**
— under the middle of the hero's feet, with `is_blocking_tile_simple`
(dungeon-vertical.ts:488-506). The rise's only test is `jump_press_handler`, reading
**one cell** — above the middle of his head, with `is_blocking_tile` (:333-337).

Between them, nothing asks whether a three-tile-wide platform is *beside* him. He
drops through it. `mp81 (155,0)` is a ground node unrelated to the lift, which is why
the route appeared to thread it.

### 19c. The rule

`clearOfPlatform` in `jump.ts`: a flight pose whose **middle column** is inside a
platform standing right now is not a position, and the pose is dropped.

- **Middle column only.** This is `canRest` and it is deliberately not a whole-body
  test: a side column inside a platform is how the hero rides, and how mp83 and mp82
  work. Marking resting cells `BLOCK_HEAD` instead removes a legitimate rise and cost
  mp80's reported journey a 646-hop detour before it was reverted.
- **The hero's three rows only.** The feet row is where he *stands on* a platform, so
  it is not part of being inside one. Testing it deleted mp80's own start `(203,29)`
  and goal `(244,7)`.
- **A separate array from `flag`.** `flag` keeps marking resting cells `BLOCK_BODY`,
  which is the landing surface and must stay landable.

### 19d. `REASON_UNBOARDABLE`

A lift with **no `atRest` slot** emits no slots at all. The hero boards a lift by
landing on it, and the only row he can land on is the one it is standing at now, so
with no boardable row every slot the platform had was a position he could not reach.
This removed ten fabricated slots, three on the x=155 lift at headRows 61-63.

It is correct, but it is **not** what fixed this route — the route goes through the
ground node mp81 `(155,0)`. Claiming otherwise was wrong; see 19b.

### 19e. What it costs

Closing the span cuts mp81's interior off from its own door at mp81 `(151,16)`,
which was the only keyless way into mp82. Journeys that were keyless now fetch keys:
mp80 `(111,21)` → mp82 `(27,19)` needs one, mp80 `(111,21)` → mp80 `(227,34)` needs
two. Twelve assertions across `nav-route-cases`, `nav-guide-replan` and `nav-graph`
were updated, and where a test was really asking whether the pocket is ever overdrawn
it now asserts that instead of an incidental ordering.

### 19f. Corrections to earlier sections

- §18's slot is unchanged and still correct — the mp83 crouch fix stands.
- §14's "a horizontal ride slot is a free 3x3" is superseded by `ridingAboard`.
- Earlier reasoning in this session blamed §18's `ridingAboard` for this route, then
  blamed the x=155 slots. Both were wrong. The route was already wrong at `808459e`,
  and the cause is the flight model, per 19b.

## 20. mp50 (94,11) -> mp51 (192,17), and the pair the hero could not fetch

Thread of Yaga, a hero with **no shoes and no keys**. The route that came back led up
the slope between mp51 `(117,60)` and mp51 `(124,54)`, and the report was: *"Since
hero does not have Silkarn shoes, he cannot climb up the slope, so this hop should be
disabled."*

### 20a. The hop was never offered

The ramp at mp51 columns 117..124 is gated correctly. Every ascending edge off it
carries `CAP.SLOPE_STAND` — from `add`'s ascent gate (which reads the tile under the
hero's middle foot, `dungeon-vertical.ts:568-572`) and from the ascending-jump flight
path — and `permitted` refuses an edge whose requirement the mask does not cover. So
`findRoute` for these endpoints with nothing else returns **null**, and that is the
right answer: a bare hero cannot make the journey at all.

What was wrong is which answer the screen settled for. The map screen's rungs (§6,
`map-screen.ts:494-596`) answer in order, and the one that produced this route is rung
3b, `planAccessories` — which grants **every pair in the game** and reports what it
used. That is honest for a pair already in the inventory and fiction for one that
cannot be reached. Level 5 has exactly one pair lying in it: Pirika at mp50
`(208,27)`. There is no Silkarn and no Feruza here to be had at all.

The real journey is that one, and the player named all three of its legs: walk over
the Pirika pair, cross to mp51 for the key at `(101,15)`, spend it on the door at mp50
`(132,54)`, and walk to the goal over aggressive ground — which is what the pair is
for, and why `permitted`'s hazard gate refuses that ground to a bare hero.

### 20b. Why rung 3 could not find it

Rung 3 is `collectAccessories`, and it could not fetch the Pirika pair on **any**
journey in the game. `shoesAfterPickup` asked `shoePresent` about the **node** the
pair lands on. `shoePresent` is `presentShoes` over the engine's own entity list
(`main.ts:512`), so it answers in **records** — and a pair is not on the cell the hero
stands on:

```text
map  8: record (177,13) -> node (177,12)
map 11: record (208,27) -> node (208,26)
map 14: record (201,13) -> node (201,12)
map 16: record ( 27,26) -> node ( 27,25)
```

All four pairs in the game are recorded one row **above** the standing position the
pickup snaps to, because the engine collects from a window around the record
(`nodeForKey`, the same ±2 snap keys go through). So every pair answered "already
collected", rung 3 found nothing it could fetch, and the screen fell through to the
slope.

Keys already do this correctly and say so — `keysAfterPickup` asks about
`graph.keyCellAt`, "the record the engine holds, not the node the route walks through.
Getting that wrong makes every key look already collected". The shoe pickup was the
same question asked the other way, and nothing said so.

`NavGraph.accessoryCellAt` is the fix: the record cell beside `accessoryShoeAt`, for
the reason `keyCellAt` exists. `nav-shoe-routing` pins both halves — the record cell
of every pair, and that a `shoePresent` answering in records fetches while one
answering in nodes does not.

### 20c. What it is worth

The journey is 987 hops and cost 1432, and its shape is not a cost decision:

| Leg | Where |
| --- | --- |
| the Pirika pair | mp50 `(208,26)`, point 730 |
| the key | mp51 `(97,15)`, point 208 |
| the door it opens | mp50 `(131,54)`, point 879 |
| the goal | mp51 `(192,17)` |

It visits mp50 and mp51 five times over and crosses no slope at all
(`crossesSlopes === false`). Which pickup comes first is the search's to choose and is
not asserted; that each is in the pocket before the hop that spends it is.

### 20d. The test that measures the screen, not just the search

`map-screen.test.ts` drives `choose(192,17)` with `shoePresent`/`keyPresent` built the
way `main.ts` builds them, and asserts the route handed back crosses no slope and asks
for no pair from another level. It fails on the unfixed code with
`crossesSlopes: expected true to be false` — the report, verbatim, as an assertion.

One harness change was needed to make it mean anything. `NavGraphStore` builds a graph
the moment anybody asks and its source answers for every cavern on disk; in the browser
it does not, because `navGraphStore`'s source reads the live `g_mem` for the cavern the
hero is standing in and nothing else. A search therefore sees its own component and no
more, and `componentStore()` in that file is what reproduces it. Without it the test
measures a game where level 5 can reach level 6's keys, and the whole rung ordering is
answered against a different world.

