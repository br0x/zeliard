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
- `1009` tests passing.
- `5` tests failing.

## 12. Known remaining issues

The remaining five failures are concentrated in the current traversal model around
`mp80`/`mp81`/`mp82`.

Measured findings:

- The mp80 shaft is split into a closed component of 1,409/2,170 nodes.
- The mp82 lower region is also a closed component.
- Two recent engine-faithful restrictions are involved:
  - the lifted-node guard for entering a conveyor;
  - the fall `pushedBack` behavior.
- Reverting the lifted-node guard restores all five failures.
- Three of the five additionally depend on the fall restriction.
- These failures are **not** evidence that either restriction is wrong; both match
  engine behavior.
- What remains unresolved is whether the affected recorded journeys are genuinely
  missing a graph edge or whether the tests are asserting a route that the engine cannot
  traverse from the recorded state.

Affected tests/routes are documented by their test names rather than by reproducing the
entire debugging history:

- `map-screen:482` — mp80 `(111,21)` → mp81 `(124,6)`, bare capabilities.
- `nav-route-cases:362` — same route.
- `nav-graph:170` — ride-slot census: 5,969 slots where the table expects 5,684, from
  the crouched slots added under low ceilings.
- `nav-graph:501` — 415 jump edges the model does not offer, all of them launched from
  a crouched slot.
- `nav-platform-state` — the first `setPlatformPlaces` report is no longer news when it
  agrees with `startY`.

These are the next investigation targets.

Two of the original five have since been closed, both by the same change, and the story
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

`findRoute` now splits it when `collectKeys` is set and the one-shot search fails: ask
for the shape of the journey under `unlimitedKeys` (cheap, no key dimension), take
`lockedDoors` as the demand, then try each key of a needed kind as a *waypoint* — walk
to it, then walk on from it with the key already in the pocket — and splice the two
halves into one route. When he already carries what the journey costs, the demand is
met and the retry simply drops the pickup dimension, which is the part that floods.
The same journey is now 14,824 expansions, and `nav-route-cases` pins all three of its
phases: the whole trip, the re-plan from the mp81 arrival, and the walk back out once
the key is held.

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
