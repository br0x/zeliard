# Dungeon Implementation Plan

## Overview

Port dungeon rendering from C/WASM (`gfmcga.c`, `dungeon.c`) to JavaScript (`game.js`), replacing MCGA mode-13h pixel ops with canvas `drawImage()`. Decouple all busy-wait loops into timer-driven state machines signaled via shared-memory semaphores.
File `zeliard-wasm.js` is a bridge between WASM and JavaScript. Exported C functions are called from there.

---

## Part 1 — Rendering Migration (gfmcga.c → game.js)

### 1.1 Sprite Sheet Loading

Already partially done in `game.js:846–885` (`loadDungeonAssets`). Ensure all sheets are loaded:

| Asset | Path | Tile Size | Count | Layout |
|-------|------|-----------|-------|--------|
| `fman.png` | `assets/images/fman.png` | 72×72 | 91 | 16 cols × 6 rows (indexed row-major) |
| `sword.png` | `assets/images/sword.png` | 96×96 | 120 | 10 cols × 12 rows |
| `dchr.png` | `assets/images/dchr.png` | 24×24 | 39 | Linear strip, single row |
| `mpp1.png` | `assets/images/mpp1.png` | 24×24 | 25 | Linear strip, single row |
| `enp1.png` | `assets/images/enp1.png` | 48×48 | 77 | Linear strip, single row |
| `magic.png` | `assets/images/magic.png` | 48×48 | 28 | Linear strip, single row |

Add helper: `drawSheetFrame(sheet, frameIndex, frameW, frameH, cols, dx, dy)` — already defined in `game.js:1107`.

### 1.2 Tile Coordinate System

- **Original:** Viewport = 28 × 18 tiles, each tile = 8×8 px, VRAM = 320×200.
- **Web:** Viewport = 28 × 18 tiles, each tile = 24×24 px, canvas = 672×432 px.
- Mapping: multiply any original tile coordinate by 3 (since 24/8 = 3). Hero/sprite sizes scale accordingly:
  - Hero: 3×3 tiles = 24×24 org = 72×72 px web (matches `fman.png`).
  - Sword: 4×4 tiles = 32×32 org = 96×96 px web (matches `sword.png`).
  - Entity: 2×2 tiles = 16×16 org = 48×48 px web (matches `enp1.png`, `magic.png`).

### 1.3 Hero Sprite Composition

Replace `choose_hero_sprite()` + `Render_Hero_Sprite_To_Buf9()` in `gfmcga.c:517–738` with JS.

**JS function: `drawDungeonHero()`** (partially exists at `game.js:1243`, needs complete rewrite).

The hero sprite is composed of 3 layers drawn on top of each other:

1. **Back arm / back shield** (drawn first, behind body)
2. **Body** (drawn second)
3. **Front arm / front shield** (drawn third, in front of body)

**Frame selection logic** (migrate from C to JS):

#### Body frame (`gfmcga.c:596–635`)

Read from memory:
- `0xE7` — `hero_animation_phase`
- `0xE8` — `invincibility_flag`
- `0xFF38` — `squat_flag`
- `0xFF3D` — `jump_phase_flags`
- `0xFF42` — `slope_direction`
- `0xC2` — `facing` (bit0: 0=right, 1=left)
- `0xFF39` — `on_rope_flags`
- `0xFF3A` — `hero_hidden_flag`

Body base index in fman.png spritesheet:
- **Facing right** (`facing & 1 == 0`): base = 0
- **Facing left** (`facing & 1 == 1`): base = 13

Body frame offset (add to base):
- `hero_hidden_flag` → open-door frame (base + 26)
- `on_rope_flags` → rope frames (base + 26) + `(anim & 3)`
- `invincibility_flag` → invincibility base (+10) + walk anim phase
- `squat_flag` → offset +5
- `jump_phase_flags & 0x80` → offset +7
- `slope_direction == RIGHT` → offset +8
- `slope_direction == LEFT` → offset +9
- `jump_phase_flags == 0x7F` → offset +6
- `hero_animation_phase == 0x80` (idle) → offset +4
- otherwise → offset = `(hero_animation_phase & 3)`

#### Back arm frame (`gfmcga.c:532–591`)

Back arm base in fman.png:
- **Facing right**: base = 31
- **Facing left**: base = 49

Visibility rules (render only when conditions met):
- Skip if `invincibility_flag | on_rope_flags | hero_hidden_flag`
- If `shield_anim_active`:
  - Facing right, active shield → `SHIELD_BACK` base (67) + phase/2 × 9 + shield_size × 36
  - Facing left, active shield → arm_base + phase/2 × 9 + 36 + variant_offset
- If shield held (no animation) + facing right → arm_base + 12×9 + squat_flag
- If no shield, not squatting, phase not idle → show arm on even `(phase+2)&3` values with offset 0 or 18
- **Squat mode**: render 6 tiles starting from column 3 instead of 9 tiles from column 0

#### Front arm frame (`gfmcga.c:646–703`)

Front arm base (opposite of back arm):
- **Facing right**: base = 49 (was back arm left base)
- **Facing left**: base = 31 (was back arm right base)

Logic mirrors back arm with opposite facing orientation + special on-rope/hidden cases.

**Implementation approach for hero composition in JS:**

```javascript
function drawDungeonHero() {
    const facingLeft = readMemory(0xC2, 1)[0] & 1;
    const animPhase = readMemory(0xE7, 1)[0];
    // ... read all state flags ...
    
    // Layer 1: back arm
    const backFrame = resolveBackArmFrame(facingLeft, animPhase, ...flags);
    if (backFrame !== null) {
        drawSheetFrame(fmanSheet, backFrame, 72, 72, 16, heroX, heroY);
    }
    
    // Layer 2: body
    const bodyFrame = resolveBodyFrame(facingLeft, animPhase, ...flags);
    drawSheetFrame(fmanSheet, bodyFrame, 72, 72, 16, heroX, heroY);
    
    // Layer 3: front arm
    const frontFrame = resolveFrontArmFrame(facingLeft, animPhase, ...flags);
    if (frontFrame !== null) {
        drawSheetFrame(fmanSheet, frontFrame, 72, 72, 16, heroX, heroY);
    }
}
```

**Key point:** Unlike original which composites into a pixel buffer, JS draws layers directly onto canvas (transparency from PNG handles the "mask" aspect).

### 1.4 Sword Overlay

Replace `Render_Sword_Overlay()` + `Sword_Overlay_EntryPoint()` in `gfmcga.c:770–921`.

**JS function: `drawDungeonSword()`** (partially exists at `game.js:1262`, needs complete rewrite).

Read from memory:
- `0xFF43` — `sword_swing_flag` (0 = no sword, exit)
- `0xFF46` — `sword_movement_phase` (1-based phase)
- `0xFF45` — `sword_hit_type` (0=forward, 1=overhead, 2=downward thrust)
- `0xC2` — `facing` (bit0: direction)
- `0x92` — `sword_type` (1..6, affects sword color/size metadata via `entity_render_tbl`)

Sword sprite sheet `sword.png`:
- 96×96 px per sprite (4×4 tiles at 24×24)
- Layout: 12 rows, 10 columns. First and every odd rows are right-facing variants, even rows are left-facing variants.
  First 6 rows define small swords (types 1, 2, 3). Rows 7-10 define medium swords (types 4, 5). Rows 11-12 define large sword (type 6).

**Phases per hit type:**
- Forward hit (type 0): phases 1..6. Note that phases 5 and 6 use the same sprite, that's why we have 10 columns instead of 11.
- Overhead swing (type 1): phases 1..4
- Downward thrust (type 2): single phase

**Handling edge case:** The C code can end a swing early (`sword_movement_phase >= N` → clear flag). JS must mirror this:
```javascript
function drawDungeonSword() {
    const swingFlag = readMemory(0xFF43, 1)[0];
    if (!swingFlag) return;
    const phase = readMemory(0xFF46, 1)[0];
    const hitType = readMemory(0xFF45, 1)[0];
    const facingLeft = readMemory(0xC2, 1)[0] & 1;
    
    // Determine max phase and advance
    const maxPhase = [7, 5, 5][hitType]; // exclusive
    if (phase >= maxPhase) {
        writeMemory(0xFF43, [0]); // end swing
        return;
    }
    
    const spriteIndex = (facingLeft ? 10 : 0) + phase - 1; // adjust for actual sheet layout
    const heroPos = getHeroPosition();
    const dx = heroPos.hero_x_in_viewport * 24 - 48; // 2 tiles offset left
    const dy = heroPos.hero_head_y_in_viewport * 24 - 48; // 2 tiles offset up
    drawSheetFrame(swordSheet, spriteIndex, 96, 96, 11, dx, dy);
}
```

### 1.5 Dungeon Background Tiles

Replace `Refresh_Dirty_Tiles()` in `gfmcga.c:1873–1939`, `Dungeon_Static_Tile_Cached_Drawer()`, and related tile rendering functions.

**JS function: `drawDungeonTiles()`** (exists at `game.js:1115`, needs extension).

The proximity map at `ADDR_PROXIMITY_MAP` (0xE000) is a 36×64 array of tile IDs. The visible viewport is a 28×18 window.

Tile ID ranges and their spritesheets:
- **1–25**: `mpp1.png` tiles (dungeon walls, floors, decorations)
- **0x40–0x66** (64–102): `dchr.png` tiles (doors, platforms, special objects)
- **0x80+**: Entity/monster markers (handled in entity rendering)

```javascript
function drawDungeonTiles() {
    const proximity = getProximityMap();
    const top = dungeonGetViewportTop();
    
    for (let row = 0; row < 18; row++) {
        const proxRow = (top + row) & 0x3F;
        for (let col = 0; col < 28; col++) {
            const tileId = proximity[proxRow * 36 + col + 4]; // +4 = viewport left offset in proximity
            if (tileId === 0) continue;
            
            const dx = col * 24;
            const dy = row * 24;
            
            if (tileId >= 1 && tileId <= 25) {
                // mpp1.png tiles (1-based index)
                drawSheetFrame(mpp1Sheet, tileId - 1, 24, 24, 1, dx, dy);
            } else if (tileId >= 0x40 && tileId < 0x40 + 39) {
                // dchr.png tiles (0-based index = tileId - 0x40)
                drawSheetFrame(dchrSheet, tileId - 0x40, 24, 24, 1, dx, dy);
            }
        }
    }
}
```

**Animated tiles** (from `gfmcga.c:1711–1824`): The C code handles animated tiles for cavern levels 5–8. In JS, simply re-read the proximity map each frame — if the C code changes animated tile values in the proximity map during `main_update_render`, the JS render loop will pick up the changes naturally.

### 1.6 Entity/Monster Rendering

Replace `Lookup_Monster_Tile_Attributes()`, `Render_Tile_With_Palette()`, `Decode_And_Render_MonsterEntity_Tile_With_Blit()` in `gfmcga.c`.

**JS function: `drawDungeonEntities()`** (exists at `game.js:1172`, needs extension).

Each entity in the monster list (at `ADDR_MONSTERS_LIST`, 16 bytes each) has:
- `x`, `y` — absolute position
- `type` — monster type (1-based index into enp1.png)
- `anim_counter` — animation frame (low 4 bits)
- `flags` + `ai_flags` — state, direction

```javascript
function drawDungeonEntities() {
    const entities = getDungeonEntities(); // already reads from memory
    const proxLeft = readMemory(0x80, 2); // word
    const top = dungeonGetViewportTop();
    
    for (const entity of entities) {
        const screenX = (entity.x - proxLeft - 4) * 24 - 12; // center 48px sprite
        const screenY = (entity.y - top) * 24 - 24; // 2 tiles up (48px tall, origin at bottom)
        
        if (screenX < -48 || screenX > 672 || screenY < -48 || screenY > 432) continue;
        
        // enp1.png: sprite index = (entity.type - 1) (linear strip, single row)
        // Animation: could pick frame based on anim_counter if multiple frames per monster
        const spriteIndex = entity.type - 1;
        drawSheetFrame(enp1Sheet, spriteIndex, 48, 48, 1, screenX, screenY);
    }
}
```

**Magic projectiles** (`magic.png`): Similar approach. The projectile list is at `ADDR_PROJECTILES_LIST` (0xEB80, 13 entries of 32 bytes). Each projectile has a type (which spell, 0..6) mapping to `magic.png` sprite index.

### 1.7 Boss Explosions

Replace `Boss_Explosions_Renderer()` in `gfmcga.c:1960–2021`. Since the explosions are simple circle-like animations, render them with canvas primitives (arc + radial gradient) rather than bitmask sprites:

```javascript
function drawBossExplosions() {
    const list = readMemory(ADDR_BOSS_EXPLOSIONS_LIST, 256); // max 32×4 + terminator
    // Parse: [col, row, lifetime, variant, ...]
    for (let i = 0; i < 32; i++) {
        const off = i * 4;
        if (list[off] === 0xFF) break;
        const x = list[off] * 24 + 12;
        const y = list[off + 1] * 24 + 12;
        const intensity = (list[off + 2] + 1) / 4; // 0.25..1.0
        // Draw circle with gradient
        ctx.beginPath();
        ctx.arc(x, y, 20 * intensity, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 50, ${intensity})`;
        ctx.fill();
    }
}
```

### 1.8 Summary of Rendering Files to Create/Modify

In `game.js`:

| Function | What it replaces in gfmcga.c | Status |
|----------|------------------------------|--------|
| `drawDungeonTiles()` | `Refresh_Dirty_Tiles()`, `Dungeon_Static_Tile_Cached_Drawer()` | Extend existing |
| `drawDungeonEntities()` | Entity rendering in `Refresh_Dirty_Tiles()`, `Lookup_Monster_Tile_Attributes()` | Extend existing |
| `drawDungeonHero()` | `choose_hero_sprite()`, `Render_Hero_Sprite_To_Buf9()`, `Sample_Neighborhood_Attributes()` | **Rewrite completely** |
| `drawDungeonSword()` | `Render_Sword_Overlay()`, `Sword_Overlay_EntryPoint()`, `CalculateSpriteBitmask()` | **Rewrite completely** |
| `drawDungeonMagic()` | Magic projectile rendering from `update_active_projectiles_render()` | **New** |
| `drawBossExplosions()` | `Boss_Explosions_Renderer()` | **New (simplified)** |
| `drawDungeonHUD()` | `render_hud_bars_with_enemy()`, `render_boss_hud()`, `Draw_Hero_Health_proc()` | **New** |

In `gfmcga.c`: All `vram[]`-writing rendering functions become stubs (return immediately or signal JS). This includes:
- `Copy_Hero_Frame_To_VRAM()` — stub
- `Copy_Tile_To_VRAM()` — stub
- `Blit32x32SpriteToVram()` — stub
- `Sword_Overlay_EntryPoint()` — stub
- `Boss_Explosions_Renderer()` — stub
- `Dungeon_Static_Tile_Cached_Drawer()` — stub
- All `render_48bytes_packed_tile()` / `render_nibble_compressed_tile()` / etc. — stub

---

## Part 2 — Game Loop Decoupling

### 2.1 The Problem

`dungeon.c` contains several styles of blocking loops:

1. **Busy-wait timing loops** in `game_loop_render_and_timing()` (`gfmcga.c:1847,1861`):
   ```c
   while (MEM8(ADDR_FRAME_TIMER) < 2*MEM8(ADDR_SPEED_CONST)) { /* busy wait */ }
   ```

2. **Animation sequence loops** in `process_hero_death()` (`dungeon.c:246–280`):
   ```c
   do { main_update_render(); airborne_movement(&restart); } while (restart);
   for (;;) { main_update_render(); /* phase switching */ }
   ```

3. **The main cavern loop** in `main_loop()` / `Cavern_Game_Init()` (`dungeon.c:1279–1328, 2247–2404`):
   Contains a `do { ... } while (restart)` pattern plus nested loops for rope climbing.

4. **"ENCOUNTER" boss flash** in `Cavern_Game_Init()` (`dungeon.c:2286–2297`):
   ```c
   for (int cx = 0; cx < 6; cx++) {
       while (MEM8(ADDR_FRAME_TIMER) < 65) { /* busy wait */ }
   }
   ```

### 2.2 Decoupling Strategy

Follow the **town pattern** exactly:
- C code exports `wasm_dungeon_update()` and `wasm_dungeon_full_tick()`
- JS timer (PIT worklet) calls `full_tick` at 236.7 Hz, `slow_tick` at ~47 Hz
- No blocking loops in C; instead, state machines that return to caller

#### 2.2.1 Frame Timing Semaphore

Replace busy-wait with the existing `ADDR_FRAME_TIMER` mechanism. The C code already writes:
```c
MEM8(ADDR_FRAME_TIMER) = 0;
```
Then JS's `onFullTick` increments the timer. The C code checks `ADDR_FRAME_TIMER >= SPEED_CONST * 4` before proceeding.

**Current mechanism** (already works for town, copy for dungeon): In `onFullTick()` (`game.js:454`), the dungeon path calls `dungeonFullTick()` which increments `ADDR_FRAME_TIMER`. Then when `ADDR_FRAME_TIMER >= speedC * 4`, it calls `dungeonUpdate()`.

**Change:** `game_loop_render_and_timing()` needs to be split into a non-blocking version that:
1. Runs `Sample_Neighborhood_Attributes()`, `Refresh_Dirty_Tiles()`, etc. (frame start)
2. Sets a semaphore like `ADDR_FRAME_PHASE = 0` (start of frame)
3. Returns to JS
4. JS calls back when `ADDR_FRAME_TIMER >= threshold`

#### 2.2.2 Main Dungeon Loop State Machine

Replace `main_loop()` (`dungeon.c:1279`) with a state machine that JS drives:

```c
// New semaphores in shared memory
#define ADDR_DUNGEON_STATE  0xFF90  // byte: current state machine state
#define ADDR_DUNGEON_SUBSTATE 0xFF9B // byte: sub-state / phase
#define ADDR_DUNGEON_FRAME_PHASE 0xFF91 // byte: 0=initial, 1=wait_frame, 2=wait_frame2, 3=done

enum {
    DUNGEON_STATE_NORMAL,       // Main game loop
    DUNGEON_STATE_ROPE,         // On rope sub-loop
    DUNGEON_STATE_DEATH_FALL,   // Death phase 1
    DUNGEON_STATE_DEATH_FLASH,  // Death phase 2
    DUNGEON_STATE_DEATH_FADE,   // Death phase 3
    DUNGEON_STATE_BOSS_ENCOUNTER, // Boss intro flash
    DUNGEON_STATE_EXIT,         // Exiting dungeon
};
```

**`wasm_dungeon_update()`** becomes:
```c
void wasm_dungeon_update() {
    switch (MEM8(ADDR_DUNGEON_STATE)) {
        case DUNGEON_STATE_NORMAL:
            dungeon_update_normal();
            break;
        case DUNGEON_STATE_ROPE:
            dungeon_update_rope();
            break;
        case DUNGEON_STATE_DEATH_FALL:
            dungeon_update_death_fall();
            break;
        // ... etc
    }
}
```

**`dungeon_update_normal()`** runs one step of the main loop body:
```c
void dungeon_update_normal() {
    if (MEM8(ADDR_DUNGEON_FRAME_PHASE) == 0) {
        // Phase 0: process input, physics, interactions
        input_handling();
        sliding_physics_step();
        main_update_render();  // ← semaphore-driven, see below
        magic_spell_fire_handler();
        hero_interaction_check();
        hero_knockback_handler();
        MEM8(ADDR_FRAME_TICKS)++;
        airborne_movement();
        state_machine_dispatcher();
        MEM8(ADDR_DUNGEON_FRAME_PHASE) = 1;
    } else if (MEM8(ADDR_DUNGEON_FRAME_PHASE) == 1) {
        if (MEM8(ADDR_FRAME_TIMER) >= 2 * MEM8(ADDR_SPEED_CONST)) {
            // Phase 1: render updates, monster updates
            monsters_updates();
            update_projectiles();
            apply_sword_hit();
            MEM8(ADDR_DUNGEON_FRAME_PHASE) = 2;
        }
    } else if (MEM8(ADDR_DUNGEON_FRAME_PHASE) == 2) {
        if (MEM8(ADDR_FRAME_TIMER) >= 4 * MEM8(ADDR_SPEED_CONST)) {
            // Phase 2: frame complete
            MEM8(ADDR_FRAME_TIMER) = 0;
            MEM8(ADDR_DUNGEON_FRAME_PHASE) = 0;
            // Check for state transitions
            check_death();
            check_boss_death();
            check_door_transition();
        }
    }
}
```

#### 2.2.3 `main_update_render()` Decoupling

`main_update_render()` (`dungeon.c:1717`) is the per-frame render + logic function. It calls `game_loop_render_and_timing()` which does the busy-wait.

**Change:** Split into two parts:
- `main_update_render_pre()` — does all the logic work (airflow, scroll, platforms, doors, projectiles, monster spawning, damage, etc.)
- `main_update_render_post()` — signals JS to render (raises a semaphore)

The semaphore approach:
- After `main_update_render_pre()`, C sets `ADDR_RENDER_REQUEST = 0xFF`
- JS polls this in the draw loop, renders one frame, then clears it
- C waits for `ADDR_RENDER_REQUEST == 0` before proceeding (non-blocking — just exits the current `dungeon_update` call and waits for next tick)

#### 2.2.4 Process Hero Death

`process_hero_death()` (`dungeon.c:234`) is a multi-phase blocking sequence. Convert to a state machine:

```c
void dungeon_update_death() {
    switch (MEM8(ADDR_DUNGEON_SUBSTATE)) {
        case 0: // Falling
            MEM8(ADDR_HERO_ANIM_PHASE) = 0;
            MEM8(ADDR_ON_ROPE_FLAGS) = 0;
            MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;
            main_update_render();
            airborne_movement(&restart);
            if (!restart) {
                MEM8(ADDR_HERO_SPRITE_HIDDEN) = 0;
                MEM8(ADDR_DUNGEON_SUBSTATE) = 1;
                MEM8(ADDR_DUNGEON_SUBSTATE_PHASE) = 0;
            }
            break;
        case 1: // Flashing animation
            // Run one step of the death flash animation
            // Each call advances the animation by one frame
            // When complete, advance to substate 2
            break;
        case 2: // Fade to black
            // 30-frame fade
            break;
        case 3: // Resurrection
            transit_to_sage();
            break;
    }
}
```

#### 2.2.5 Boss "ENCOUNTER" Animation

Replace the busy-wait loops in `Cavern_Game_Init()` (`dungeon.c:2286`) with a state machine:
- State 0: Render "ENCOUNTER" text, set timer
- State 1: Wait for `ADDR_FRAME_TIMER >= 65` (non-blocking, return to JS)
- State 2: Clear text, advance flash count
- Repeat 6 times, then proceed to boss battle setup

### 2.3 New Semaphores / Shared Variables

Add to `zeliard.h`:

```c
#define ADDR_DUNGEON_STATE         0xFF90  // byte: main dungeon state machine
#define ADDR_DUNGEON_FRAME_PHASE   0xFF91  // byte: current frame phase (0=init,1=wait1,2=wait2,3=done)
#define ADDR_RENDER_REQUEST        0xFF92  // byte: 0xFF = JS should render a frame
#define ADDR_RENDER_DONE           0xFF93  // byte: 0xFF = JS has rendered
#define ADDR_DEATH_PHASE           0xFF94  // byte: death animation phase
#define ADDR_DEATH_COUNTER         0xFF95  // byte: death animation counter
#define ADDR_BOSS_ENCOUNTER_PHASE  0xFF96  // byte: boss intro animation phase
#define ADDR_ASSETS_LOAD_REQUEST   0xFF97  // byte: 0xFF = load dungeon assets requested
#define ADDR_ASSETS_LOADED         0xFF98  // byte: 0xFF = assets loaded by JS
#define ADDR_MUSIC_LOAD_REQUEST    0xFF9A  // byte: 0xFF = load music requested
#define ADDR_DUNGEON_SUBSTATE      0xFF9B  // byte: sub-state
#define ADDR_DUNGEON_SUBSTATE_PHASE 0xFF9C // byte: phase counter within substate
```

**Recommendation:** Use 0xFF90..0xFFAF for dungeon state machine vars, keeping town's existing 0xFFF0–0xFFF4 as-is.

---

## Part 3 — JS ↔ WASM Event Flow

### 3.1 Normal Game Frame

```
JS PIT tick (236.7 Hz):
  full_tick:
    → dungeonFullTick() → MEM8(ADDR_FRAME_TIMER)++
    → if ADDR_FRAME_TIMER >= speedC * 4:
        → inputUpdate()
        → dungeonUpdate()

C: wasm_dungeon_update():
  → dungeon state machine step
  → processes input, physics, AI
  → sets ADDR_RENDER_REQUEST = 0xFF when screen needs refresh

JS game loop (requestAnimationFrame, ~60 Hz):
  → if ADDR_RENDER_REQUEST == 0xFF:
      → drawDungeonTiles()
      → drawDungeonEntities()
      → drawDungeonHero()
      → drawDungeonSword()
      → drawDungeonHUD()
      → ADDR_RENDER_REQUEST = 0
```

### 3.2 Asset Loading Request

```
C detects new door entered / new cavern:
  → Sets ADDR_ASSETS_LOAD_REQUEST = new_map_id
  → Returns (stops processing)

JS onFullTick polls ADDR_ASSETS_LOAD_REQUEST:
  → If nonzero, load MDT + PNG assets
  → MDT data written to WASM at 0xC000
  → Sets ADDR_ASSETS_LOADED = 0xFF
  → Clears ADDR_ASSETS_LOAD_REQUEST

C detects ADDR_ASSETS_LOADED:
  → Proceeds with unpack_map, init_cavern, etc.
  → Clears ADDR_ASSETS_LOADED
```

### 3.3 Door Transition (Dungeon → Town or Dungeon → Dungeon)

```
C in enter_opened_door():
  → Sets ADDR_PENDING_DUNGEON_FLAG = 0xFF (or new exit flag)
  → Sets ADDR_PENDING_DUNGEON_MAP = new_map_id
  → Returns

JS onFullTick / onSlowTick:
  → Polls ADDR_PENDING_DUNGEON_FLAG
  → Calls handleDungeonTransition(mapId) or handleDungeonExit(townMapId)
  → Clears flag
```

---

## Part 4 — Implementation Order

### Phase 1: Sprite Sheet Loading & Basic Tile Rendering

1. Verify all sprite sheet assets exist and dimensions are correct
2. Ensure `loadDungeonAssets()` loads all 6 sheets
3. Rewrite `drawDungeonTiles()` to use mpp1.png and dchr.png correctly
4. Rewrite `drawDungeonEntities()` to use enp1.png
5. Test with static map rendering (enter dungeon, see tiles from mpp1.png and dchr.png)

### Phase 2: Hero Sprite Composition

1. Implement `resolveBackArmFrame()`, `resolveBodyFrame()`, `resolveFrontArmFrame()` in JS
2. Test each frame selection against C logic for correctness
3. Draw hero at correct viewport position with 3 layers
4. Test with static map rendering (enter dungeon, see hero)

### Phase 3: Game Loop Decoupling

1. Remove busy-wait loops from `game_loop_render_and_timing()`
2. Add dungeon state machine with frame phase states
3. Add render request semaphore
4. Test that dungeon runs without freezing the browser
5. Test hero movements: left, right, squat

### Phase 4: Sword Overlay

1. Implement `drawDungeonSword()` with phase/hit-type logic
2. Test sword animation frames against original behavior

### Phase 5: Rope Climbing

TODO

### Phase 6: Jumping

TODO

### Phase 7: Monsters

TODO

### Phase 8: Death Animation & Encounter Sequence

TODO

### Phase 9: Edge Cases & Polish

1. Magic projectile rendering from magic.png
2. Boss explosion rendering (canvas primitives)
3. Animated tiles (cavern levels 5–8)
4. HUD rendering (boss HP bar, place name, gold/almas)

---

## Part 5 — Functions to Stub in C

Once the JS rendering is complete, stub these functions in `gfmcga.c` / `dungeon.c`:

| Function | File | Notes |
|----------|------|-------|
| `Copy_Hero_Frame_To_VRAM()` | gfmcga.c | Hero is drawn by JS |
| `Sword_Overlay_EntryPoint()` | gfmcga.c | Sword is drawn by JS |
| `Boss_Explosions_Renderer()` | gfmcga.c | Explosions drawn by JS |
| `Dungeon_Static_Tile_Cached_Drawer()` | gfmcga.c | Tiles drawn by JS |
| `Refresh_Dirty_Tiles()` | gfmcga.c | Tile refresh handled by JS rendering per frame |
| `render_48bytes_packed_tile()` | gfmcga.c | Raw pixel decode, no longer needed |
| `render_nibble_compressed_tile()` | gfmcga.c | Raw pixel decode, no longer needed |
| `choose_hero_sprite()` | gfmcga.c | Hero layering in JS |
| `Spawn_Boss_Explosion_Ring()` | gfmcga.c | Optional — keep for logic, stub output |
| `render_hud_bars_with_enemy()` | dungeon.c | HUD in JS/HTML |
| `render_boss_hud()` | dungeon.c | HUD in JS/HTML |
| `Draw_Hero_Health_proc()` | dungeon.c | HUD in JS/HTML |
| `Load_Magic_Spell_Sprite_Group_proc()` | dungeon.c | Magic sprites in JS (magic.png) |
| `Reassemble_3_Planes_To_Packed_Bitmap_proc()` | dungeon.c | GRP unpacking no longer needed |
| `Clear_Viewport_proc()` | dungeon.c | Canvas cleared by JS |
| `Render_Animated_Tile_Strip_proc()` | dungeon.c | Replaced by JS tile render |
| `game_loop_render_and_timing()` | dungeon.c | Replace with non-blocking version |

---

## Part 6 — Export List Update (Makefile)

Add these new exported functions to `Makefile`:

```
"_wasm_dungeon_get_frame_phase",
"_wasm_dungeon_get_state",
"_wasm_dungeon_get_render_request",
"_wasm_dungeon_clear_render_request",
"_wasm_dungeon_get_exit_map_id",
```

---
Implemented phases 1, 2, and 3.
What changed:
Ported basic dungeon tile/entity rendering in `game.js`
Reworked dungeon hero rendering into layered JS frame resolution: back arm, body, front arm.
Added dungeon render semaphores and wasm bridge accessors.
Replaced the main dungeon render/timing busy waits with a tick-driven frame phase state machine in `dungeon.c`.
Updated `Makefile` exports and rebuilt `zeliard.wasm`.
Note: the remaining boss encounter waits are still present because the plan places that work in Phase 8, not phases 1-3.


Bugs found:
1. main_loop in dungeon.c is not decoupled. Commented out for now to avoid the deadlock.


