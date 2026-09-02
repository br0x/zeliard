# Refactor Plan: Extract Game State from g_mem into Typed Objects

## Problem

The entire game state lives in a flat 256KB `Uint8Array` (`g_mem`), a leftover of the WASM linear memory architecture. All state access goes through raw byte offsets and manual bit-shifting. With no WASM, this is unnecessary indirection.

**Current state of affairs:**
- ~120+ named constants in `memory.ts` (ADDR_*) pointing into `g_mem`
- ~25 engine files copy-paste identical `g8/g16/s8/s16` helper functions
- 5 separate DI interfaces for memory access (`IndoorSceneDependencies`, `DungeonRenderEnv`, `TownRenderEnv`, `HudMemoryAccess`, `ConversationDeps`)
- HUD reads 2 bytes, manually assembles `lo | (hi << 8)` — every time
- Scenes call `readMemory(0x90, 2)` to get a `Uint8Array`, then manually extract the number

**What we want:**
- Normal TypeScript objects with typed fields: `hero.hp`, `hero.gold`, `hero.level`
- Direct property access instead of byte manipulation
- Single source of truth for state shape (TypeScript types)
- Eliminate copy-pasted `g8/g16/s8/s16` helpers

## What MUST Stay as a Buffer

Some data is inherently buffer-based and cannot be meaningfully typed:

| Region | Why it must stay | Size |
|--------|-----------------|------|
| **MDT data** (0xC000..) | Binary map files loaded verbatim via `g_mem.set(mdtData, ADDR_MDT)`. Parsed by offset, contains pointers, variable-length structures. | ~16KB |
| **Proximity map** (0xE000..) | 36×64 circular tile buffer. Hot path: `g[addr]` in tight render loops. | 2304 bytes |
| **Viewport entities cache** (0xE900..) | 28×19 sprite overlay buffer. Save/restore cycle every frame. | 532 bytes |
| **Proximity layer2** (0xED20..) | 128-byte sprite overlay backup. | 128 bytes |
| **Monster structs** (computed base+offset) | Variable number, accessed via `monstersBase + i*16 + fieldOffset`. 16-byte entries. | Variable |
| **Enemy projectiles** (0xEB80..) | 13 slots × 32 bytes, 0xFF-terminated. Accessed by computed offsets. | 416 bytes |
| **Magic projectiles** (0xEB15..) | 4 slots × 16 bytes. Accessed by computed offsets. | 64 bytes |
| **Boss explosions** (0xEDA0..) | 32 entries × 4 bytes. | 128 bytes |
| **Seg1 config** (0x18000+) | Tile IDs, sword reach tables, trajectories. Written once per dungeon entry. | Variable |

## What CAN Be Extracted into Typed Objects

### Cluster 1: Hero State (save-image bytes 0x04..0xE8)

**Currently:** 40+ individual byte/word reads scattered across HUD, scenes, engine.

**Proposed type:**
```typescript
interface HeroState {
  // Progress flags (save image bytes 0x04..0x49)
  endgameFlag: boolean;           // 0x04 bit7
  spokeToKing: boolean;           // 0x05
  enteredCavernFirstTime: boolean; // 0x06
  cementar1Flags: number;         // 0x24
  calienteItemsFlags: number;    // 0x34
  falterItemsFlags: number;      // 0x45
  deathAlreadyProcessed: boolean; // 0x49

  // Viewport position (save image bytes 0x80..0x84)
  proxMapLeftCol: number;        // 0x80, word (16-bit LE)
  viewportTopRow: number;        // 0x82
  xView: number;                 // 0x83
  headYView: number;             // 0x84

  // Resources (save image bytes 0x85..0x8B)
  gold: number;                  // 0x85-0x86, 24-bit (HI:LO)
  bankGold: number;              // 0x88-0x89, 24-bit
  almas: number;                 // 0x8B, word

  // Stats (save image bytes 0x8D..0x91)
  level: number;                 // 0x8D
  xp: number;                    // 0x8E, word
  hp: number;                    // 0x90, word
  maxHp: number;                 // 0xB2, word

  // Equipment (save image bytes 0x92..0x9E)
  swordType: number;             // 0x92
  shieldType: number;            // 0x93
  shieldHp: number;              // 0x94, word
  shieldMaxHp: number;           // 0x96, word
  keys: number;                  // 0x98
  lionKeys: number;              // 0x99
  elfCrest: boolean;             // 0x9A (0xFF = obtained)
  crestOfGlory: boolean;         // 0x9B
  heroCrest: boolean;            // 0x9C (0xFF = obtained)
  currentSpellType: number;      // 0x9D
  currentAccessory: number;      // 0x9E

  // Inventory (save image bytes 0xA0..0xC1)
  tearCount: number;             // 0xA0
  shoes: number[];               // 0xA1..0xA5, 5 slots
  magicItems: number[];          // 0xA6..0xAA, 5 slots
  spellCounts: number[];         // 0xAB..0xB1, 7 spells
  spellInventory: number[];      // 0xB4..0xBA, 7 spells
  espadaActive: number[];        // 0xBB..0xC1, 7 spells

  // Masks (save image bytes 0xC9..0xE3)
  magicMasks: number[];          // 0xC9..0xD1, 9 towns
  swordMasks: number[];          // 0xD2..0xDA, 9 towns
  shieldMasks: number[];         // 0xDB..0xE3, 9 towns

  // State flags (save image bytes 0xC2..0xE8)
  facing: number;                // 0xC2
  leftRun: boolean;              // 0xC3
  placeMapId: number;            // 0xC4
  lastSageVisited: number;       // 0xC5
  swordEnchantmentLevel: number; // 0xE4
  sagesSpoken: number;           // 0xE5
  animPhase: number;             // 0xE7
  invincible: boolean;           // 0xE8
}
```

**Consumers to update:** `ui/hud.ts`, `ui/inventory-screen.ts`, `scenes/indoor-sage.ts`, `scenes/indoor-king.ts`, `scenes/indoor-inn.ts`, `scenes/indoor-church.ts`, `scenes/indoor-magic-shop.ts`, `scenes/indoor-weapon-shop.ts`, `scenes/indoor-bank.ts`, `render/town.ts`, `render/dungeon.ts`, `engine/dungeon-frame.ts`, `engine/dungeon-hero.ts`, `engine/dungeon-state-machine.ts`, `engine/dungeon-damage.ts`

### Cluster 2: Dungeon Runtime State (non-save, 0xFF00.. range)

**Currently:** Individual byte reads/writes across ~20 engine files for flags, semaphores, animation state.

**Proposed type:**
```typescript
interface DungeonRuntimeState {
  // Hero motion flags
  heroSpriteHidden: boolean;     // 0xFF37
  squatFlag: boolean;            // 0xFF38
  onRopeFlags: number;           // 0xFF39
  heroHiddenFlag: boolean;       // 0xFF3A
  jumpPhaseFlags: number;        // 0xFF3D
  slopeDirection: number;        // 0xFF42 (0=none, 1=right, 2=left)

  // Sword state
  swordSwingFlag: boolean;       // 0xFF43
  swordHitType: number;          // 0xFF45
  swordMovementPhase: number;    // 0xFF46

  // Shield animation
  shieldAnimPhase: number;       // 0xFF3F
  shieldAnimActive: boolean;     // 0xFF40
  shieldVariantIndex: number;    // 0xFF41

  // Spell state
  spellActiveFlag: boolean;      // 0xFF3C
  byteFF3E: boolean;             // 0xFF3E (spell projectile active)

  // Viewport
  viewportLeftTop: number;       // 0xFF31, word
  speedConst: number;            // 0xFF33

  // Boss state
  isBossCavern: boolean;         // 0xFF34
  bossIsDead: boolean;           // 0xFF30
  bossMode: number;              // 0xFFA0
  bossStatePtr: number;          // 0xA002, word

  // Death/exit
  heroDeathFlag: boolean;        // 0xFFE3
  dungeonExitFlag: boolean;      // 0xFFE2
  deathCounter: number;          // 0xFF95
  heroDamageThisFrame: number;   // 0xFF36

  // Sound
  soundFxRequest: number;        // 0xFF75
  heartbeatVolume: number;       // 0xFF08
  spriteFlashFlag: boolean;      // 0xFF2F

  // Rendering semaphores
  dungeonState: number;          // 0xFF90
  dungeonFramePhase: number;     // 0xFF91
  renderRequest: boolean;        // 0xFF92
  renderDone: boolean;           // 0xFF93

  // HUD render requests
  goldRenderRequest: boolean;    // 0xFF94
  almasRenderRequest: boolean;   // 0xFF98
  healthBarRequest: boolean;     // 0xFF99
  shieldHpRenderRequest: boolean; // 0xFF9A
  magicLeftRenderRequest: boolean; // 0xFFA3
  swordRenderRequest: boolean;   // 0xFFA4
  swordGfxReloadRequest: boolean; // 0xFFA5
  bossHealthRequest: boolean;    // 0xFF9F

  // Notification
  notificationMsgId: number;     // 0xFF96
  notificationFlag: boolean;     // 0xFF97

  // Roka (death/recovery)
  rokaPhase: number;             // 0xFF9D
  rokaColor: number;             // 0xFF9E

  // Cavern signs
  cavernSignFlag: boolean;       // 0xFFA1
  cavernSignIdx: number;         // 0xFFA2
}
```

### Cluster 3: Town Runtime State (non-save, 0xFFF0.. range)

**Proposed type:**
```typescript
interface TownRuntimeState {
  scrollFlag: number;            // 0xFFF0
  transitionMap: number;         // 0xFFF1
  transitionPat: number;         // 0xFFF2
  transitionDir: number;         // 0xFFF3
  pendingTransitionFlag: number; // 0xFFF4
  conversationActive: boolean;   // 0xFFF5
  buildingActive: boolean;       // 0xFFFA
  buildingDestId: number;        // 0xFFFB
  pendingDungeonMap: number;     // 0xFFFC
  pendingDungeonFlag: boolean;   // 0xFFFD
  frameTimer: number;            // 0xFF1A
  spacebarLatch: boolean;        // 0xFF1D
  altkeyLatch: boolean;          // 0xFF1E
}
```

### Cluster 4: Input Latches (0xFF16..0xFF18)

**Proposed type:**
```typescript
interface InputLatches {
  altSpace: number;              // 0xFF16
  dirs: number;                  // 0xFF17
  specialKeys: number;           // 0xFF18 (F9/F7/F2/F1/ESC/CTRL/SHIFT/ENTER)
}
```

## Architecture: Dual-Write Bridge

**Key constraint:** The engine files (~25) still need `g: Uint8Array` for MDT/proximity/monster buffer access. We can't eliminate the buffer entirely.

**Solution:** Introduce typed state objects that **dual-write** to `g_mem` for backward compatibility. Engine code continues using `g8/g16/s8/s16` for buffer regions, but reads hero/runtime state from the typed objects.

```
┌─────────────────────────────────────┐
│           main.ts (root)            │
│  Creates hero, dungeon, town state  │
│  Wires sync-on-change callbacks     │
└──────────┬──────────────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌────────────┐
│ g_mem  │  │ HeroState  │ ← scenes, HUD, inventory read directly
│ (buf)  │  │ (object)   │   engine writes via setter that syncs to g_mem
└────────┘  └────────────┘
```

**Sync mechanism:**
- `HeroState` has a `toBytes(): Uint8Array` that serializes to g_mem[0..255] format
- `HeroState.fromBytes(data: Uint8Array): HeroState` deserializes from save format
- Individual property setters (e.g., `set hp(v) { this._hp = v; syncToMem(0x90, v, 2) }`) keep g_mem in sync
- Engine code can still `s16(g, 0x90, newHp)` — the hero state object's getter reflects the change

**Alternative (simpler, recommended):** Don't dual-write. Instead:
1. Extract hero state into a plain object
2. Update all consumers to use the object
3. For engine code: inject the state object alongside `g` — engine reads from object for simple fields, from buffer for MDT/monster/proximity data
4. At save boundaries: serialize object → g_mem[0..255]
5. At load boundaries: deserialize g_mem[0..255] → object

This avoids the complexity of keeping two representations in sync.

## Implementation Phases

### Phase 0: Foundation (no behavior change) ✅ DONE

1. Define `HeroState`, `DungeonRuntimeState`, `TownRuntimeState`, `InputLatches` interfaces in a new file `core/game-state.ts` ✅
2. Add factory functions: `createHeroState(): HeroState`, `createDungeonState(): DungeonRuntimeState`, etc. ✅ (added `createLiveHeroState`/`createLiveDungeonState` that produce live views over g_mem)
3. Add serialization: `heroStateToBytes(h: HeroState): Uint8Array`, `heroStateFromBytes(b: Uint8Array): HeroState` ✅
4. Add to `ts-memory.ts`: export `getHeroState()` and `setHeroState()` — initially just wraps g_mem reads ✅ (heroState is constructed at main.ts init: `createLiveHeroState(getGmem())`)
5. Write tests: verify round-trip `fromBytes(toBytes(state)) === state` for all fields ✅ (`game-state.test.ts` covers all 256 bytes round-trip)

### Phase 1: HUD (highest-impact consumer) ✅ DONE

**File:** `ui/hud.ts`

1. Change `HudMemoryAccess` interface to accept `HeroState` + `DungeonRuntimeState` ✅
2. Update all getter/setter methods to use typed fields ✅
3. Remove manual byte assembly (`lo[0] | lo[1] << 8`) ✅
4. Update `main.ts` injection to pass state objects ✅
5. **No more readMemory/writeMemory for simple state access** ✅

### Phase 2: Indoor Scenes ✅ DONE

**Files:** All `scenes/indoor-*.ts` files

1. Update `IndoorSceneDependencies` to include `heroState: HeroState` ✅ (via `IndoorSceneBase` which all indoor scenes extend)
2. Replace `readMemory(0x90, 2)` with `heroState.hp` ✅
3. Replace `writeMemory(0x90, Uint8Array.of(lo, hi))` with `heroState.hp = newHp` ✅
4. Remove all local `const ADDR_*` definitions (already done partially) ✅
5. Scene-specific state (sage spoken bits, king gold award) stays as local class state ✅

### Phase 3: Inventory Screen ✅ DONE

**File:** `ui/inventory-screen.ts`

1. Update `InventoryDeps` to include `heroState: HeroState` ✅ (also added `dungeon: DungeonRuntimeState` for `healthBarRequest`)
2. Replace all 27 local ADDR_ references with `heroState.*` fields ✅
3. Equipment reads become direct field access ✅
4. Spell counts become array access ✅

Note: `ADDR_MAGIA_STONE_SPRITE0..3` (0xEB60+) are kept as `writeMemory` calls — they live in the monster/projectile buffer region per the plan and are consumed by `render/dungeon.ts`.

### Phase 4: Renderers ✅ DONE

**Files:** `render/dungeon.ts`, `render/town.ts`

1. Update `DungeonRenderEnv` and `TownRenderEnv` to include state objects ✅ (added `heroState` + `dungeonState` to dungeon env, `heroState` to town env)
2. Replace `env.gMem(ADDR)` with `heroState.field` or `dungeonState.field` ✅ (hero state fields in hot paths: xView, headYView, facing, animPhase, invincible, squat, swordType, currentSpellType, etc.)
3. Keep `env.readMemory` for proximity map / MDT buffer access ✅
4. Keep `env.gMem` for monster struct fields (computed offsets) ✅

### Phase 5: Engine Files (most invasive)

**Files:** ~25 engine files with `g8/g16/s8/s16` helpers

**Strategy:** Two-track approach:

**Track A — Simple flag reads:** Replace `g8(g, 0xff38)` with `dungeonState.squatFlag`. These are the ~50 most frequently accessed simple flags.

**Track B — Buffer regions:** Keep `g8/g16/s8/s16` for:
- Monster structs (`m + offset`)
- Proximity map (`0xE000 + ...`)
- Viewport entities (`0xE900 + ...`)
- Projectile slots (`0xEB80 + ...`)
- MDT data (`0xC000 + ...`)

For Track B, **consolidate** `g8/g16/s8/s16`:
1. Export from `ts-memory.ts` instead of copy-pasting in every file
2. Or create a `MemView` class: `new MemView(g, baseAddr)` with `.u8(offset)`, `.u16(offset)`, `.setU8(offset, v)`, `.setU16(offset, v)`

### Phase 6: Save/Load

**Files:** `platform/save.ts`, `platform/save-file.ts`, `main.ts`

1. Save: `heroStateToBytes(heroState)` → 256-byte blob → base64 → localStorage
2. Load: localStorage → base64 → 256-byte blob → `heroStateFromBytes(bytes)` → `heroState`
3. Remove `readMemory(MEM_SAVE_DATA, 256)` / `loadSaveState(bytes)` from hot path
4. Keep `g_mem[0..255]` as a "shadow copy" for MDT/proximity/monster data that overlaps with the save region

### Phase 7: Cleanup

1. Remove all unused `ADDR_*` constants from `memory.ts`
2. Remove local `g8/g16/s8/s16` definitions from engine files
3. Remove `readMemory`/`writeMemory` from DI interfaces where no longer needed
4. Remove `gMemAt`, `readU8`, `readU16` exports if no longer needed
5. Consider removing the `g_mem` export entirely (keep it internal to ts-memory.ts)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Save file format breaks | Serialization layer is explicit; write comprehensive round-trip tests |
| Engine files break when reading from object instead of buffer | Keep buffer access for monster/MDT/proximity; only extract simple flags |
| Performance regression from object property access vs buffer index | V8 optimizes property access well; the hot loops (proximity map, monster structs) stay as buffer access |
| Merge conflicts with other work | Phase 0-1 are safe foundation; Phase 2-4 are independent; Phase 5-6 are most invasive |

## Estimated Scope

| Phase | Files touched | Risk | Effort | Status |
|-------|--------------|------|--------|--------|
| Phase 0 | 1 new file + ts-memory.ts | Low | Small | ✅ Done |
| Phase 1 | hud.ts, main.ts | Low | Small | ✅ Done |
| Phase 2 | 8 scene files, scene.ts, main.ts | Low | Medium | ✅ Done |
| Phase 3 | inventory-screen.ts, main.ts | Low | Medium | ✅ Done |
| Phase 4 | render/dungeon.ts, render/town.ts, main.ts | Medium | Medium | ✅ Done |
| Phase 5 | ~25 engine files | High | Large | Pending |
| Phase 6 | save.ts, save-file.ts, main.ts | Medium | Medium | Pending |
| Phase 7 | memory.ts, ts-memory.ts, ~10 cleanup targets | Low | Small | Pending |

**Total:** ~50 files, with Phases 0-4 being low-risk and Phase 5 being the bulk of the work.
