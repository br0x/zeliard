/**
 * game-state.ts — Typed game state objects.
 *
 * Replaces raw g_mem byte access with normal typed properties.
 * Serialization to/from the 256-byte save image is explicit.
 *
 * Phase 0: Foundation — defines types, factories, and serialization.
 * No behavior change yet; existing consumers still use g_mem directly.
 */

// ─── Hero State (save image bytes 0x00..0xFF) ──────────────────────────────

export interface HeroState {
    /** Full 256-byte save image. Named fields are views into this buffer. */
    raw: Uint8Array;

    // Progress flags (save image bytes 0x04..0x49)
    endgameFlag: boolean;               // 0x04 bit7
    spokeToKing: boolean;               // 0x05
    enteredCavernFirstTime: boolean;    // 0x06
    cementar1Flags: number;             // 0x24
    calienteItemsFlags: number;        // 0x34
    falterItemsFlags: number;          // 0x45
    deathAlreadyProcessed: boolean;    // 0x49

    // Viewport position (save image bytes 0x80..0x84)
    proxMapLeftCol: number;            // 0x80, word (16-bit LE)
    viewportTopRow: number;            // 0x82
    xView: number;                     // 0x83
    headYView: number;                 // 0x84

    // Resources (save image bytes 0x85..0x8B)
    gold: number;                      // 0x85-0x86, 24-bit (HI:LO)
    bankGold: number;                  // 0x88-0x89, 24-bit
    almas: number;                     // 0x8B, word

    // Stats (save image bytes 0x8D..0x91)
    level: number;                     // 0x8D
    xp: number;                        // 0x8E, word
    hp: number;                        // 0x90, word
    maxHp: number;                     // 0xB2, word

    // Equipment (save image bytes 0x92..0x9E)
    swordType: number;                 // 0x92
    shieldType: number;                // 0x93
    shieldHp: number;                  // 0x94, word
    shieldMaxHp: number;               // 0x96, word
    keys: number;                      // 0x98
    lionKeys: number;                  // 0x99
    elfCrest: boolean;                 // 0x9A (0xFF = obtained)
    crestOfGlory: boolean;             // 0x9B
    heroCrest: boolean;                // 0x9C (0xFF = obtained)
    currentSpellType: number;          // 0x9D
    currentAccessory: number;          // 0x9E

    // Inventory (save image bytes 0xA0..0xC1)
    tearCount: number;                 // 0xA0
    shoes: Uint8Array;                 // 0xA1..0xA5, 5 slots
    magicItems: Uint8Array;            // 0xA6..0xAA, 5 slots
    spellCounts: Uint8Array;           // 0xAB..0xB1, 7 spells
    spellInventory: Uint8Array;        // 0xB4..0xBA, 7 spells
    espadaActive: Uint8Array;          // 0xBB..0xC1, 7 spells

    // Masks (save image bytes 0xC9..0xE3)
    magicMasks: Uint8Array;            // 0xC9..0xD1, 9 towns
    swordMasks: Uint8Array;            // 0xD2..0xDA, 9 towns
    shieldMasks: Uint8Array;           // 0xDB..0xE3, 9 towns

    // State flags (save image bytes 0xC2..0xE8)
    facing: number;                    // 0xC2
    leftRun: boolean;                  // 0xC3
    placeMapId: number;                // 0xC4
    lastSageVisited: number;           // 0xC5
    swordEnchantmentLevel: number;     // 0xE4
    sagesSpoken: number;               // 0xE5
    animPhase: number;                 // 0xE7
    invincible: boolean;               // 0xE8
}

// ─── Dungeon Runtime State (non-save, 0xFF00.. range + engine-internal) ────

export interface DungeonRuntimeState {
    // Hero motion flags
    heroY: number;                     // 0xFF35
    heroDamageThisFrame: number;       // 0xFF36
    heroSpriteHidden: boolean;         // 0xFF37
    squatFlag: boolean;                // 0xFF38
    onRopeFlags: number;               // 0xFF39
    heroHiddenFlag: boolean;           // 0xFF3A
    jumpPhaseFlags: number;            // 0xFF3D
    slopeDirection: number;            // 0xFF42 (0=none, 1=right, 2=left)

    // Sword state
    swordSwingFlag: boolean;           // 0xFF43
    uiElementDirty: boolean;           // 0xFF44
    swordHitType: number;              // 0xFF45
    swordMovementPhase: number;        // 0xFF46

    // Shield animation
    shieldAnimPhase: number;           // 0xFF3F
    shieldAnimActive: boolean;         // 0xFF40
    shieldVariantIndex: number;        // 0xFF41

    // Spell state
    spellActiveFlag: boolean;          // 0xFF3C
    byteFF3E: boolean;                 // 0xFF3E (spell projectile active)

    // Viewport
    viewportLeftTop: number;           // 0xFF31, word
    speedConst: number;                // 0xFF33

    // Boss state
    isBossCavern: boolean;             // 0xFF34
    bossIsDead: boolean;               // 0xFF30
    bossBeingHit: boolean;             // 0xFF2E
    bossMode: number;                  // 0xFFA0
    bossStatePtr: number;              // 0xA002, word
    bossRewardProcessed: boolean;      // 0x9F1E

    // Death/exit
    heroDeathFlag: boolean;            // 0xFFE3
    dungeonExitFlag: boolean;          // 0xFFE2
    deathCounter: number;              // 0xFF95

    // Sound
    soundFxRequest: number;            // 0xFF75
    heartbeatVolume: number;           // 0xFF08
    spriteFlashFlag: boolean;          // 0xFF2F

    // Rendering semaphores
    dungeonState: number;              // 0xFF90
    dungeonFramePhase: number;         // 0xFF91
    renderRequest: boolean;            // 0xFF92
    renderDone: boolean;               // 0xFF93

    // HUD render requests
    goldRenderRequest: boolean;        // 0xFF94
    almasRenderRequest: boolean;       // 0xFF98
    healthBarRequest: boolean;         // 0xFF99
    shieldHpRenderRequest: boolean;    // 0xFF9A
    magicLeftRenderRequest: boolean;   // 0xFFA3
    swordRenderRequest: boolean;       // 0xFFA4
    swordGfxReloadRequest: boolean;    // 0xFFA5
    bossHealthRequest: boolean;        // 0xFF9F

    // Notification
    notificationMsgId: number;         // 0xFF96
    notificationFlag: boolean;         // 0xFF97

    // Roka (death/recovery)
    rokaPhase: number;                 // 0xFF9D
    rokaColor: number;                 // 0xFF9E

    // Cavern signs
    cavernSignFlag: boolean;           // 0xFFA1
    cavernSignIdx: number;             // 0xFFA2

    // Engine-internal (0x9F00.. range)
    byte9F00: boolean;                 // 0x9F00
    byte9F02: number;                  // 0x9F02
    jumpHeightIncludingShoes: number;  // 0x9F0D
    byte9F18: number;                  // 0x9F18
    temperatureTimer: number;          // 0x9F25
    byte9F27: number;                  // 0x9F27
    byte9F2B: number;                  // 0x9F2B
    isJashiinCavern: boolean;          // 0xE6
    healingTimer: number;              // 0xC6, word
    animTimer: number;                 // 0xFF1B, word
    byteFF24: boolean;                 // 0xFF24
    mao2StartLatch: boolean;           // 0xFF21
    monsterIndex: number;              // 0xFF4A
}

// ─── Town Runtime State (non-save, 0xFFF0.. range) ────────────────────────

export interface TownRuntimeState {
    scrollFlag: number;                // 0xFFF0
    transitionMap: number;             // 0xFFF1
    transitionPat: number;             // 0xFFF2
    transitionDir: number;             // 0xFFF3
    pendingTransitionFlag: number;     // 0xFFF4
    conversationActive: boolean;       // 0xFFF5
    buildingActive: boolean;           // 0xFFFA
    buildingDestId: number;            // 0xFFFB
    pendingDungeonMap: number;         // 0xFFFC
    pendingDungeonFlag: boolean;       // 0xFFFD
    frameTimer: number;                // 0xFF1A
    spacebarLatch: boolean;            // 0xFF1D
    altkeyLatch: boolean;              // 0xFF1E
}

// ─── Input Latches (0xFF16..0xFF18) ────────────────────────────────────────

export interface InputLatches {
    altSpace: number;                  // 0xFF16
    dirs: number;                      // 0xFF17
    specialKeys: number;               // 0xFF18 (F9/F7/F2/F1/ESC/CTRL/SHIFT/ENTER)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readByte(g: Uint8Array, addr: number): number {
    return g[addr] ?? 0;
}

function readWord(g: Uint8Array, addr: number): number {
    return (g[addr] ?? 0) | ((g[addr + 1] ?? 0) << 8);
}

function read24(g: Uint8Array, loAddr: number, hiAddr: number): number {
    return ((g[loAddr] ?? 0) | ((g[loAddr + 1] ?? 0) << 8)) + ((g[hiAddr] ?? 0) << 16);
}

function readBool(g: Uint8Array, addr: number): boolean {
    return (g[addr] ?? 0) !== 0;
}

function readBoolFF(g: Uint8Array, addr: number): boolean {
    return (g[addr] ?? 0) === 0xFF;
}

function readSlice(g: Uint8Array, addr: number, len: number): Uint8Array {
    return g.slice(addr, addr + len);
}

function writeByte(g: Uint8Array, addr: number, v: number): void {
    g[addr] = v & 0xFF;
}

function writeWord(g: Uint8Array, addr: number, v: number): void {
    g[addr] = v & 0xFF;
    g[addr + 1] = (v >> 8) & 0xFF;
}

function write24(g: Uint8Array, loAddr: number, hiAddr: number, v: number): void {
    g[loAddr] = v & 0xFF;
    g[loAddr + 1] = (v >> 8) & 0xFF;
    g[hiAddr] = (v >> 16) & 0xFF;
}

function writeBool(g: Uint8Array, addr: number, v: boolean): void {
    g[addr] = v ? 1 : 0;
}

function writeBoolFF(g: Uint8Array, addr: number, v: boolean): void {
    g[addr] = v ? 0xFF : 0;
}

// ─── Factory: read from g_mem ───────────────────────────────────────────────

/** Read HeroState from g_mem[0x00..0xFF]. */
export function readHeroState(g: Uint8Array): HeroState {
    return {
        raw: g.slice(0, SAVE_SIZE),

        // Progress flags
        endgameFlag: (readByte(g, 0x04) & 0x80) !== 0,
        spokeToKing: readBoolFF(g, 0x05),
        enteredCavernFirstTime: readBool(g, 0x06),
        cementar1Flags: readByte(g, 0x24),
        calienteItemsFlags: readByte(g, 0x34),
        falterItemsFlags: readByte(g, 0x45),
        deathAlreadyProcessed: readBool(g, 0x49),

        // Viewport position
        proxMapLeftCol: readWord(g, 0x80),
        viewportTopRow: readByte(g, 0x82),
        xView: readByte(g, 0x83),
        headYView: readByte(g, 0x84),

        // Resources
        gold: read24(g, 0x86, 0x85),
        bankGold: read24(g, 0x89, 0x88),
        almas: readWord(g, 0x8B),

        // Stats
        level: readByte(g, 0x8D),
        xp: readWord(g, 0x8E),
        hp: readWord(g, 0x90),
        maxHp: readWord(g, 0xB2),

        // Equipment
        swordType: readByte(g, 0x92),
        shieldType: readByte(g, 0x93),
        shieldHp: readWord(g, 0x94),
        shieldMaxHp: readWord(g, 0x96),
        keys: readByte(g, 0x98),
        lionKeys: readByte(g, 0x99),
        elfCrest: readBoolFF(g, 0x9A),
        crestOfGlory: readBool(g, 0x9B),
        heroCrest: readBoolFF(g, 0x9C),
        currentSpellType: readByte(g, 0x9D),
        currentAccessory: readByte(g, 0x9E),

        // Inventory
        tearCount: readByte(g, 0xA0),
        shoes: readSlice(g, 0xA1, 5),
        magicItems: readSlice(g, 0xA6, 5),
        spellCounts: readSlice(g, 0xAB, 7),
        spellInventory: readSlice(g, 0xB4, 7),
        espadaActive: readSlice(g, 0xBB, 7),

        // Masks
        magicMasks: readSlice(g, 0xC9, 9),
        swordMasks: readSlice(g, 0xD2, 9),
        shieldMasks: readSlice(g, 0xDB, 9),

        // State flags
        facing: readByte(g, 0xC2),
        leftRun: readBool(g, 0xC3),
        placeMapId: readByte(g, 0xC4),
        lastSageVisited: readByte(g, 0xC5),
        swordEnchantmentLevel: readByte(g, 0xE4),
        sagesSpoken: readByte(g, 0xE5),
        animPhase: readByte(g, 0xE7),
        invincible: readBool(g, 0xE8),
    };
}

/** Write HeroState into g_mem[0x00..0xFF]. */
export function writeHeroState(g: Uint8Array, h: HeroState): void {
    // Progress flags
    let b04 = readByte(g, 0x04) & 0x7F;
    if (h.endgameFlag) b04 |= 0x80;
    writeByte(g, 0x04, b04);
    writeBoolFF(g, 0x05, h.spokeToKing);
    writeBool(g, 0x06, h.enteredCavernFirstTime);
    writeByte(g, 0x24, h.cementar1Flags);
    writeByte(g, 0x34, h.calienteItemsFlags);
    writeByte(g, 0x45, h.falterItemsFlags);
    writeBool(g, 0x49, h.deathAlreadyProcessed);

    // Viewport position
    writeWord(g, 0x80, h.proxMapLeftCol);
    writeByte(g, 0x82, h.viewportTopRow);
    writeByte(g, 0x83, h.xView);
    writeByte(g, 0x84, h.headYView);

    // Resources
    write24(g, 0x86, 0x85, h.gold);
    write24(g, 0x89, 0x88, h.bankGold);
    writeWord(g, 0x8B, h.almas);

    // Stats
    writeByte(g, 0x8D, h.level);
    writeWord(g, 0x8E, h.xp);
    writeWord(g, 0x90, h.hp);
    writeWord(g, 0xB2, h.maxHp);

    // Equipment
    writeByte(g, 0x92, h.swordType);
    writeByte(g, 0x93, h.shieldType);
    writeWord(g, 0x94, h.shieldHp);
    writeWord(g, 0x96, h.shieldMaxHp);
    writeByte(g, 0x98, h.keys);
    writeByte(g, 0x99, h.lionKeys);
    writeBoolFF(g, 0x9A, h.elfCrest);
    writeBool(g, 0x9B, h.crestOfGlory);
    writeBoolFF(g, 0x9C, h.heroCrest);
    writeByte(g, 0x9D, h.currentSpellType);
    writeByte(g, 0x9E, h.currentAccessory);

    // Inventory
    writeByte(g, 0xA0, h.tearCount);
    g.set(h.shoes, 0xA1);
    g.set(h.magicItems, 0xA6);
    g.set(h.spellCounts, 0xAB);
    g.set(h.spellInventory, 0xB4);
    g.set(h.espadaActive, 0xBB);

    // Masks
    g.set(h.magicMasks, 0xC9);
    g.set(h.swordMasks, 0xD2);
    g.set(h.shieldMasks, 0xDB);

    // State flags
    writeByte(g, 0xC2, h.facing);
    writeBool(g, 0xC3, h.leftRun);
    writeByte(g, 0xC4, h.placeMapId);
    writeByte(g, 0xC5, h.lastSageVisited);
    writeByte(g, 0xE4, h.swordEnchantmentLevel);
    writeByte(g, 0xE5, h.sagesSpoken);
    writeByte(g, 0xE7, h.animPhase);
    writeBool(g, 0xE8, h.invincible);
}

/** Create a default HeroState (new game). */
export function createDefaultHeroState(): HeroState {
    return {
        raw: new Uint8Array(SAVE_SIZE),

        endgameFlag: false,
        spokeToKing: false,
        enteredCavernFirstTime: false,
        cementar1Flags: 0,
        calienteItemsFlags: 0,
        falterItemsFlags: 0,
        deathAlreadyProcessed: false,

        proxMapLeftCol: 0,
        viewportTopRow: 0,
        xView: 0,
        headYView: 0,

        gold: 0,
        bankGold: 0,
        almas: 0,

        level: 1,
        xp: 0,
        hp: 0,
        maxHp: 0,

        swordType: 0,
        shieldType: 0,
        shieldHp: 0,
        shieldMaxHp: 0,
        keys: 0,
        lionKeys: 0,
        elfCrest: false,
        crestOfGlory: false,
        heroCrest: false,
        currentSpellType: 0,
        currentAccessory: 0,

        tearCount: 0,
        shoes: new Uint8Array(5),
        magicItems: new Uint8Array(5),
        spellCounts: new Uint8Array(7),
        spellInventory: new Uint8Array(7),
        espadaActive: new Uint8Array(7),

        magicMasks: new Uint8Array(9),
        swordMasks: new Uint8Array(9),
        shieldMasks: new Uint8Array(9),

        facing: 0,
        leftRun: false,
        placeMapId: 0,
        lastSageVisited: 0,
        swordEnchantmentLevel: 0,
        sagesSpoken: 0,
        animPhase: 0,
        invincible: false,
    };
}

// ─── Dungeon Runtime State ──────────────────────────────────────────────────

/** Read DungeonRuntimeState from g_mem. */
export function readDungeonState(g: Uint8Array): DungeonRuntimeState {
    return {
        heroY: readByte(g, 0xFF35),
        heroDamageThisFrame: readByte(g, 0xFF36),
        heroSpriteHidden: readBool(g, 0xFF37),
        squatFlag: readBool(g, 0xFF38),
        onRopeFlags: readByte(g, 0xFF39),
        heroHiddenFlag: readBool(g, 0xFF3A),
        jumpPhaseFlags: readByte(g, 0xFF3D),
        slopeDirection: readByte(g, 0xFF42),

        swordSwingFlag: readBool(g, 0xFF43),
        uiElementDirty: readBool(g, 0xFF44),
        swordHitType: readByte(g, 0xFF45),
        swordMovementPhase: readByte(g, 0xFF46),

        shieldAnimPhase: readByte(g, 0xFF3F),
        shieldAnimActive: readBool(g, 0xFF40),
        shieldVariantIndex: readByte(g, 0xFF41),

        spellActiveFlag: readBool(g, 0xFF3C),
        byteFF3E: readBool(g, 0xFF3E),

        viewportLeftTop: readWord(g, 0xFF31),
        speedConst: readByte(g, 0xFF33),

        isBossCavern: readBool(g, 0xFF34),
        bossIsDead: readBoolFF(g, 0xFF30),
        bossBeingHit: readBoolFF(g, 0xFF2E),
        bossMode: readByte(g, 0xFFA0),
        bossStatePtr: readWord(g, 0xA002),
        bossRewardProcessed: readBool(g, 0x9F1E),

        heroDeathFlag: readBoolFF(g, 0xFFE3),
        dungeonExitFlag: readBoolFF(g, 0xFFE2),
        deathCounter: readByte(g, 0xFF95),

        soundFxRequest: readByte(g, 0xFF75),
        heartbeatVolume: readByte(g, 0xFF08),
        spriteFlashFlag: readBool(g, 0xFF2F),

        dungeonState: readByte(g, 0xFF90),
        dungeonFramePhase: readByte(g, 0xFF91),
        renderRequest: readBool(g, 0xFF92),
        renderDone: readBoolFF(g, 0xFF93),

        goldRenderRequest: readBool(g, 0xFF94),
        almasRenderRequest: readBool(g, 0xFF98),
        healthBarRequest: readBool(g, 0xFF99),
        shieldHpRenderRequest: readBool(g, 0xFF9A),
        magicLeftRenderRequest: readBool(g, 0xFFA3),
        swordRenderRequest: readBool(g, 0xFFA4),
        swordGfxReloadRequest: readBool(g, 0xFFA5),
        bossHealthRequest: readBool(g, 0xFF9F),

        notificationMsgId: readByte(g, 0xFF96),
        notificationFlag: readBool(g, 0xFF97),

        rokaPhase: readByte(g, 0xFF9D),
        rokaColor: readByte(g, 0xFF9E),

        cavernSignFlag: readBool(g, 0xFFA1),
        cavernSignIdx: readByte(g, 0xFFA2),

        byte9F00: readBool(g, 0x9F00),
        byte9F02: readByte(g, 0x9F02),
        jumpHeightIncludingShoes: readByte(g, 0x9F0D),
        byte9F18: readByte(g, 0x9F18),
        temperatureTimer: readByte(g, 0x9F25),
        byte9F27: readByte(g, 0x9F27),
        byte9F2B: readByte(g, 0x9F2B),
        isJashiinCavern: readBool(g, 0xE6),
        healingTimer: readWord(g, 0xC6),
        animTimer: readWord(g, 0xFF1B),
        byteFF24: readBool(g, 0xFF24),
        mao2StartLatch: readBool(g, 0xFF21),
        monsterIndex: readByte(g, 0xFF4A),
    };
}

/** Write DungeonRuntimeState into g_mem. */
export function writeDungeonState(g: Uint8Array, s: DungeonRuntimeState): void {
    writeByte(g, 0xFF35, s.heroY);
    writeByte(g, 0xFF36, s.heroDamageThisFrame);
    writeBool(g, 0xFF37, s.heroSpriteHidden);
    writeBool(g, 0xFF38, s.squatFlag);
    writeByte(g, 0xFF39, s.onRopeFlags);
    writeBool(g, 0xFF3A, s.heroHiddenFlag);
    writeByte(g, 0xFF3D, s.jumpPhaseFlags);
    writeByte(g, 0xFF42, s.slopeDirection);

    writeBool(g, 0xFF43, s.swordSwingFlag);
    writeBool(g, 0xFF44, s.uiElementDirty);
    writeByte(g, 0xFF45, s.swordHitType);
    writeByte(g, 0xFF46, s.swordMovementPhase);

    writeByte(g, 0xFF3F, s.shieldAnimPhase);
    writeBool(g, 0xFF40, s.shieldAnimActive);
    writeByte(g, 0xFF41, s.shieldVariantIndex);

    writeBool(g, 0xFF3C, s.spellActiveFlag);
    writeBool(g, 0xFF3E, s.byteFF3E);

    writeWord(g, 0xFF31, s.viewportLeftTop);
    writeByte(g, 0xFF33, s.speedConst);

    writeBool(g, 0xFF34, s.isBossCavern);
    writeBoolFF(g, 0xFF30, s.bossIsDead);
    writeBoolFF(g, 0xFF2E, s.bossBeingHit);
    writeByte(g, 0xFFA0, s.bossMode);
    writeWord(g, 0xA002, s.bossStatePtr);
    writeBool(g, 0x9F1E, s.bossRewardProcessed);

    writeBoolFF(g, 0xFFE3, s.heroDeathFlag);
    writeBoolFF(g, 0xFFE2, s.dungeonExitFlag);
    writeByte(g, 0xFF95, s.deathCounter);

    writeByte(g, 0xFF75, s.soundFxRequest);
    writeByte(g, 0xFF08, s.heartbeatVolume);
    writeBool(g, 0xFF2F, s.spriteFlashFlag);

    writeByte(g, 0xFF90, s.dungeonState);
    writeByte(g, 0xFF91, s.dungeonFramePhase);
    writeBool(g, 0xFF92, s.renderRequest);
    writeBoolFF(g, 0xFF93, s.renderDone);

    writeBool(g, 0xFF94, s.goldRenderRequest);
    writeBool(g, 0xFF98, s.almasRenderRequest);
    writeBool(g, 0xFF99, s.healthBarRequest);
    writeBool(g, 0xFF9A, s.shieldHpRenderRequest);
    writeBool(g, 0xFFA3, s.magicLeftRenderRequest);
    writeBool(g, 0xFFA4, s.swordRenderRequest);
    writeBool(g, 0xFFA5, s.swordGfxReloadRequest);
    writeBool(g, 0xFF9F, s.bossHealthRequest);

    writeByte(g, 0xFF96, s.notificationMsgId);
    writeBool(g, 0xFF97, s.notificationFlag);

    writeByte(g, 0xFF9D, s.rokaPhase);
    writeByte(g, 0xFF9E, s.rokaColor);

    writeBool(g, 0xFFA1, s.cavernSignFlag);
    writeByte(g, 0xFFA2, s.cavernSignIdx);

    writeBool(g, 0x9F00, s.byte9F00);
    writeByte(g, 0x9F02, s.byte9F02);
    writeByte(g, 0x9F0D, s.jumpHeightIncludingShoes);
    writeByte(g, 0x9F18, s.byte9F18);
    writeByte(g, 0x9F25, s.temperatureTimer);
    writeByte(g, 0x9F27, s.byte9F27);
    writeByte(g, 0x9F2B, s.byte9F2B);
    writeBool(g, 0xE6, s.isJashiinCavern);
    writeWord(g, 0xC6, s.healingTimer);
    writeWord(g, 0xFF1B, s.animTimer);
    writeBool(g, 0xFF24, s.byteFF24);
    writeBool(g, 0xFF21, s.mao2StartLatch);
    writeByte(g, 0xFF4A, s.monsterIndex);
}

// ─── Town Runtime State ─────────────────────────────────────────────────────

/** Read TownRuntimeState from g_mem. */
export function readTownState(g: Uint8Array): TownRuntimeState {
    return {
        scrollFlag: readByte(g, 0xFFF0),
        transitionMap: readByte(g, 0xFFF1),
        transitionPat: readByte(g, 0xFFF2),
        transitionDir: readByte(g, 0xFFF3),
        pendingTransitionFlag: readByte(g, 0xFFF4),
        conversationActive: readBool(g, 0xFFF5),
        buildingActive: readBool(g, 0xFFFA),
        buildingDestId: readByte(g, 0xFFFB),
        pendingDungeonMap: readByte(g, 0xFFFC),
        pendingDungeonFlag: readBoolFF(g, 0xFFFD),
        frameTimer: readByte(g, 0xFF1A),
        spacebarLatch: readBool(g, 0xFF1D),
        altkeyLatch: readBool(g, 0xFF1E),
    };
}

/** Write TownRuntimeState into g_mem. */
export function writeTownState(g: Uint8Array, s: TownRuntimeState): void {
    writeByte(g, 0xFFF0, s.scrollFlag);
    writeByte(g, 0xFFF1, s.transitionMap);
    writeByte(g, 0xFFF2, s.transitionPat);
    writeByte(g, 0xFFF3, s.transitionDir);
    writeByte(g, 0xFFF4, s.pendingTransitionFlag);
    writeBool(g, 0xFFF5, s.conversationActive);
    writeBool(g, 0xFFFA, s.buildingActive);
    writeByte(g, 0xFFFB, s.buildingDestId);
    writeByte(g, 0xFFFC, s.pendingDungeonMap);
    writeBoolFF(g, 0xFFFD, s.pendingDungeonFlag);
    writeByte(g, 0xFF1A, s.frameTimer);
    writeBool(g, 0xFF1D, s.spacebarLatch);
    writeBool(g, 0xFF1E, s.altkeyLatch);
}

// ─── Input Latches ──────────────────────────────────────────────────────────

/** Read InputLatches from g_mem. */
export function readInputLatches(g: Uint8Array): InputLatches {
    return {
        altSpace: readByte(g, 0xFF16),
        dirs: readByte(g, 0xFF17),
        specialKeys: readByte(g, 0xFF18),
    };
}

/** Write InputLatches into g_mem. */
export function writeInputLatches(g: Uint8Array, l: InputLatches): void {
    writeByte(g, 0xFF16, l.altSpace);
    writeByte(g, 0xFF17, l.dirs);
    writeByte(g, 0xFF18, l.specialKeys);
}

// ─── Save image serialization (256 bytes) ──────────────────────────────────

const SAVE_SIZE = 256;

/** Serialize HeroState to the 256-byte save image format. */
export function heroStateToBytes(h: HeroState): Uint8Array {
    const buf = new Uint8Array(SAVE_SIZE);
    buf.set(h.raw.subarray(0, SAVE_SIZE));
    writeHeroState(buf, h);
    return buf;
}

/** Deserialize HeroState from a 256-byte save image. */
export function heroStateFromBytes(data: Uint8Array): HeroState {
    const buf = new Uint8Array(SAVE_SIZE);
    const len = Math.min(data.length, SAVE_SIZE);
    for (let i = 0; i < len; i++) buf[i] = data[i] ?? 0;
    return readHeroState(buf);
}

// ─── Live views over a g_mem-like buffer ────────────────────────────────────

function clampByte(v: number): number { return v & 0xff; }
function clamp24(v: number): number { return v & 0xffffff; }

function liveBool(g: Uint8Array, addr: number): boolean {
    return (g[addr] ?? 0) !== 0;
}
function liveBoolFF(g: Uint8Array, addr: number): boolean {
    return (g[addr] ?? 0) === 0xff;
}
function liveByte(g: Uint8Array, addr: number): number { return g[addr] ?? 0; }
function liveWord(g: Uint8Array, addr: number): number {
    return (g[addr] ?? 0) | ((g[addr + 1] ?? 0) << 8);
}
function live24(g: Uint8Array, loAddr: number, hiAddr: number): number {
    return ((g[loAddr] ?? 0) | ((g[loAddr + 1] ?? 0) << 8)) + ((g[hiAddr] ?? 0) << 16);
}

function liveWriteBool(g: Uint8Array, addr: number, v: boolean): void { g[addr] = v ? 1 : 0; }
function liveWriteBoolFF(g: Uint8Array, addr: number, v: boolean): void { g[addr] = v ? 0xff : 0; }
function liveWriteByte(g: Uint8Array, addr: number, v: number): void { g[addr] = clampByte(v); }
function liveWriteWord(g: Uint8Array, addr: number, v: number): void {
    g[addr] = clampByte(v);
    g[addr + 1] = clampByte(v >> 8);
}
function liveWrite24(g: Uint8Array, loAddr: number, hiAddr: number, v: number): void {
    g[loAddr] = clampByte(v);
    g[loAddr + 1] = clampByte(v >> 8);
    g[hiAddr] = clampByte(v >> 16);
}

function liveReadSlice(g: Uint8Array, addr: number, len: number): Uint8Array {
    return g.subarray(addr, addr + len);
}

function desc<T>(get: () => T, set: (v: T) => void): PropertyDescriptor {
    return { get, set, enumerable: true, configurable: true };
}

/**
 * Create a HeroState object whose fields are live views over a 256-byte buffer.
 * The buffer should be the first 256 bytes of g_mem (the save-image region).
 * Writes through the object update the buffer immediately so engine code that
 * reads g_mem directly still observes the change.
 */
export function createLiveHeroState(g: Uint8Array): HeroState {
    const bool = (addr: number): PropertyDescriptor =>
        desc<boolean>(() => liveBool(g, addr), (v) => liveWriteBool(g, addr, v));
    const boolFF = (addr: number): PropertyDescriptor =>
        desc<boolean>(() => liveBoolFF(g, addr), (v) => liveWriteBoolFF(g, addr, v));
    const flag = (addr: number, mask: number): PropertyDescriptor =>
        desc<boolean>(() => ((g[addr] ?? 0) & mask) !== 0, (v) => {
            const cur = g[addr] ?? 0;
            g[addr] = v ? (cur | mask) : (cur & ~mask);
        });
    const byte = (addr: number): PropertyDescriptor =>
        desc<number>(() => liveByte(g, addr), (v) => liveWriteByte(g, addr, v));
    const word = (addr: number): PropertyDescriptor =>
        desc<number>(() => liveWord(g, addr), (v) => liveWriteWord(g, addr, v));
    const wide24 = (loAddr: number, hiAddr: number): PropertyDescriptor =>
        desc<number>(() => live24(g, loAddr, hiAddr), (v) => liveWrite24(g, loAddr, hiAddr, clamp24(v)));

    return Object.defineProperties({} as HeroState, {
        raw: { value: g.subarray(0, SAVE_SIZE), enumerable: true },
        endgameFlag: flag(0x04, 0x80),
        spokeToKing: boolFF(0x05),
        enteredCavernFirstTime: bool(0x06),
        cementar1Flags: byte(0x24),
        calienteItemsFlags: byte(0x34),
        falterItemsFlags: byte(0x45),
        deathAlreadyProcessed: bool(0x49),

        proxMapLeftCol: word(0x80),
        viewportTopRow: byte(0x82),
        xView: byte(0x83),
        headYView: byte(0x84),

        gold: wide24(0x86, 0x85),
        bankGold: wide24(0x89, 0x88),
        almas: word(0x8B),

        level: byte(0x8D),
        xp: word(0x8E),
        hp: word(0x90),
        maxHp: word(0xB2),

        swordType: byte(0x92),
        shieldType: byte(0x93),
        shieldHp: word(0x94),
        shieldMaxHp: word(0x96),
        keys: byte(0x98),
        lionKeys: byte(0x99),
        elfCrest: boolFF(0x9A),
        crestOfGlory: bool(0x9B),
        heroCrest: boolFF(0x9C),
        currentSpellType: byte(0x9D),
        currentAccessory: byte(0x9E),

        tearCount: byte(0xA0),
        shoes: { value: liveReadSlice(g, 0xA1, 5), enumerable: true },
        magicItems: { value: liveReadSlice(g, 0xA6, 5), enumerable: true },
        spellCounts: { value: liveReadSlice(g, 0xAB, 7), enumerable: true },
        spellInventory: { value: liveReadSlice(g, 0xB4, 7), enumerable: true },
        espadaActive: { value: liveReadSlice(g, 0xBB, 7), enumerable: true },

        magicMasks: { value: liveReadSlice(g, 0xC9, 9), enumerable: true },
        swordMasks: { value: liveReadSlice(g, 0xD2, 9), enumerable: true },
        shieldMasks: { value: liveReadSlice(g, 0xDB, 9), enumerable: true },

        facing: byte(0xC2),
        leftRun: bool(0xC3),
        placeMapId: byte(0xC4),
        lastSageVisited: byte(0xC5),
        swordEnchantmentLevel: byte(0xE4),
        sagesSpoken: byte(0xE5),
        animPhase: byte(0xE7),
        invincible: bool(0xE8),
    });
}

/**
 * Create a DungeonRuntimeState object whose fields are live views over g_mem.
 * Mutations update g_mem immediately.
 */
export function createLiveDungeonState(g: Uint8Array): DungeonRuntimeState {
    const bool = (addr: number, ff = false): PropertyDescriptor =>
        desc<boolean>(() => ff ? liveBoolFF(g, addr) : liveBool(g, addr), (v) => ff ? liveWriteBoolFF(g, addr, v) : liveWriteBool(g, addr, v));
    const byte = (addr: number): PropertyDescriptor =>
        desc<number>(() => liveByte(g, addr), (v) => liveWriteByte(g, addr, v));
    const word = (addr: number): PropertyDescriptor =>
        desc<number>(() => liveWord(g, addr), (v) => liveWriteWord(g, addr, v));

    return Object.defineProperties({} as DungeonRuntimeState, {
        heroY: byte(0xFF35),
        heroDamageThisFrame: byte(0xFF36),
        heroSpriteHidden: bool(0xFF37),
        squatFlag: bool(0xFF38),
        onRopeFlags: byte(0xFF39),
        heroHiddenFlag: bool(0xFF3A),
        jumpPhaseFlags: byte(0xFF3D),
        slopeDirection: byte(0xFF42),

        swordSwingFlag: bool(0xFF43),
        uiElementDirty: bool(0xFF44),
        swordHitType: byte(0xFF45),
        swordMovementPhase: byte(0xFF46),

        shieldAnimPhase: byte(0xFF3F),
        shieldAnimActive: bool(0xFF40),
        shieldVariantIndex: byte(0xFF41),

        spellActiveFlag: bool(0xFF3C),
        byteFF3E: bool(0xFF3E),

        viewportLeftTop: word(0xFF31),
        speedConst: byte(0xFF33),

        isBossCavern: bool(0xFF34),
        bossIsDead: bool(0xFF30, true),
        bossBeingHit: bool(0xFF2E, true),
        bossMode: byte(0xFFA0),
        bossStatePtr: word(0xA002),
        bossRewardProcessed: bool(0x9F1E),

        heroDeathFlag: bool(0xFFE3, true),
        dungeonExitFlag: bool(0xFFE2, true),
        deathCounter: byte(0xFF95),

        soundFxRequest: byte(0xFF75),
        heartbeatVolume: byte(0xFF08),
        spriteFlashFlag: bool(0xFF2F),

        dungeonState: byte(0xFF90),
        dungeonFramePhase: byte(0xFF91),
        renderRequest: bool(0xFF92),
        renderDone: bool(0xFF93, true),

        goldRenderRequest: bool(0xFF94),
        almasRenderRequest: bool(0xFF98),
        healthBarRequest: bool(0xFF99),
        shieldHpRenderRequest: bool(0xFF9A),
        magicLeftRenderRequest: bool(0xFFA3),
        swordRenderRequest: bool(0xFFA4),
        swordGfxReloadRequest: bool(0xFFA5),
        bossHealthRequest: bool(0xFF9F),

        notificationMsgId: byte(0xFF96),
        notificationFlag: bool(0xFF97),

        rokaPhase: byte(0xFF9D),
        rokaColor: byte(0xFF9E),

        cavernSignFlag: bool(0xFFA1),
        cavernSignIdx: byte(0xFFA2),

        byte9F00: bool(0x9F00),
        byte9F02: byte(0x9F02),
        jumpHeightIncludingShoes: byte(0x9F0D),
        byte9F18: byte(0x9F18),
        temperatureTimer: byte(0x9F25),
        byte9F27: byte(0x9F27),
        byte9F2B: byte(0x9F2B),
        isJashiinCavern: bool(0xE6),
        healingTimer: word(0xC6),
        animTimer: word(0xFF1B),
        byteFF24: bool(0xFF24),
        mao2StartLatch: bool(0xFF21),
        monsterIndex: byte(0xFF4A),
    });
}
