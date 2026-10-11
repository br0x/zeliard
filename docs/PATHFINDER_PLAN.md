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

Current measured graph size is approximately:

- 30,012 nodes.
- 5,684 platform ride slots.
- 506,899 edges.

These values are useful sanity checks, not API contracts.

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
- shows doors and town exits;
- shows the hero's map position;
- accepts only valid/reprojectable navigation destinations;
- reports unreachable destinations rather than silently accepting them;
- loads every map needed by a possible route before searching.

The full map fits inside the 672×432 canvas without panning.

The map UI must remain visually consistent with the existing inventory/menu UI.

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

Current repository state at the end of the supplied document:

- `tsc --noEmit`: clean.
- `nav:check`: up to date.
- `1036` tests passing.
- `0` tests failing.

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
offset*, and where the ceiling is under three tiles the hero crouches and his head row
drops one — so the standing slots at row 56 and the crouched ones at row 57 of the same
platform were two islands, and any walk that needed both had no route. The graph now
also links each horizontal slot to `slot.next` / `slot.prev`, which is the platform's
own movement chain at a fixed offset, and skips the pairs cell adjacency already
covers. That is what rule "ride links follow platform movement/offset chains rather
than simple spatial adjacency" meant, and it is what makes mp82 `(179,53)` →
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

## Crouching 
- standing hero: 3×3
- squat/crouch hero: 3×2
- crouched head is one tile lower
- crouching is required to ride horizontal platforms beneath low ceilings
- crouched ride slots use platformRow - 2 rather than platformRow - 3
- the platform's platformRow must remain separate from the hero's headRow
- a crouched slot and a standing slot on the same platform are one ride, joined along
  the platform's `next`/`prev` chain — see section 12
- the pathfinder's crouch support is still incomplete, because crouch isn't yet modeled as a complete general navigation state.
