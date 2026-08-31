import { describe, expect, it } from 'vitest';
import {
    type InputLatches,
    readHeroState,
    writeHeroState,
    createDefaultHeroState,
    heroStateToBytes,
    heroStateFromBytes,
    readDungeonState,
    writeDungeonState,
    readTownState,
    writeTownState,
    readInputLatches,
    writeInputLatches,
} from '../src/core/game-state.js';

// ─── HeroState round-trip ───────────────────────────────────────────────────

describe('HeroState', () => {
    it('readHeroState returns defaults on zeroed buffer', () => {
        const g = new Uint8Array(0x10000);
        const h = readHeroState(g);
        expect(h.level).toBe(0);
        expect(h.hp).toBe(0);
        expect(h.gold).toBe(0);
        expect(h.swordType).toBe(0);
        expect(h.spellCounts.length).toBe(7);
        expect(h.shoes.length).toBe(5);
        expect(h.magicMasks.length).toBe(9);
    });

    it('round-trips all scalar fields', () => {
        const g = new Uint8Array(0x10000);

        // Write test values
        g[0x04] = 0x80;              // endgameFlag bit7
        g[0x05] = 0xFF;              // spokeToKing
        g[0x06] = 0x01;              // enteredCavernFirstTime
        g[0x24] = 0x02;              // cementar1Flags
        g[0x34] = 0x80;              // calienteItemsFlags
        g[0x45] = 0x40;              // falterItemsFlags
        g[0x49] = 0x01;              // deathAlreadyProcessed
        g[0x80] = 0x34; g[0x81] = 0x12;  // proxMapLeftCol = 0x1234
        g[0x82] = 5;                 // viewportTopRow
        g[0x83] = 10;                // xView
        g[0x84] = 15;                // headYView
        g[0x85] = 0x01; g[0x86] = 0x02; g[0x87] = 0x03; // gold: hi=0x01, lo=0x0302
        g[0x88] = 0x02; g[0x89] = 0x04; g[0x8A] = 0x06; // bankGold: hi=0x02, lo=0x0604
        g[0x8B] = 0xCD; g[0x8C] = 0xAB;  // almas = 0xABCD
        g[0x8D] = 7;                 // level
        g[0x8E] = 0x10; g[0x8F] = 0x27;  // xp = 0x2710 = 10000
        g[0x90] = 0xB8; g[0x91] = 0x0B;  // hp = 0x0BB8 = 3000
        g[0xB2] = 0x20; g[0xB3] = 0x4E;  // maxHp = 0x4E20 = 20000
        g[0x92] = 3;                 // swordType
        g[0x93] = 2;                 // shieldType
        g[0x94] = 0x58; g[0x95] = 0x02;  // shieldHp = 600
        g[0x96] = 0x90; g[0x97] = 0x01;  // shieldMaxHp = 400
        g[0x98] = 5;                 // keys
        g[0x99] = 2;                 // lionKeys
        g[0x9A] = 0xFF;              // elfCrest
        g[0x9B] = 0x01;              // crestOfGlory
        g[0x9C] = 0xFF;              // heroCrest
        g[0x9D] = 4;                 // currentSpellType
        g[0x9E] = 1;                 // currentAccessory
        g[0xA0] = 9;                 // tearCount
        g[0xC2] = 1;                 // facing
        g[0xC3] = 1;                 // leftRun
        g[0xC4] = 3;                 // placeMapId
        g[0xC5] = 5;                 // lastSageVisited
        g[0xE4] = 2;                 // swordEnchantmentLevel
        g[0xE5] = 0x3F;              // sagesSpoken
        g[0xE7] = 8;                 // animPhase
        g[0xE8] = 1;                 // invincible

        const h = readHeroState(g);
        expect(h.endgameFlag).toBe(true);
        expect(h.spokeToKing).toBe(true);
        expect(h.enteredCavernFirstTime).toBe(true);
        expect(h.cementar1Flags).toBe(0x02);
        expect(h.calienteItemsFlags).toBe(0x80);
        expect(h.falterItemsFlags).toBe(0x40);
        expect(h.deathAlreadyProcessed).toBe(true);
        expect(h.proxMapLeftCol).toBe(0x1234);
        expect(h.viewportTopRow).toBe(5);
        expect(h.xView).toBe(10);
        expect(h.headYView).toBe(15);
        expect(h.gold).toBe(0x10302);      // hi=0x01 << 16 + lo=0x0302
        expect(h.bankGold).toBe(0x20604);   // hi=0x02 << 16 + lo=0x0604
        expect(h.almas).toBe(0xABCD);
        expect(h.level).toBe(7);
        expect(h.xp).toBe(10000);
        expect(h.hp).toBe(3000);
        expect(h.maxHp).toBe(20000);
        expect(h.swordType).toBe(3);
        expect(h.shieldType).toBe(2);
        expect(h.shieldHp).toBe(600);
        expect(h.shieldMaxHp).toBe(400);
        expect(h.keys).toBe(5);
        expect(h.lionKeys).toBe(2);
        expect(h.elfCrest).toBe(true);
        expect(h.crestOfGlory).toBe(true);
        expect(h.heroCrest).toBe(true);
        expect(h.currentSpellType).toBe(4);
        expect(h.currentAccessory).toBe(1);
        expect(h.tearCount).toBe(9);
        expect(h.facing).toBe(1);
        expect(h.leftRun).toBe(true);
        expect(h.placeMapId).toBe(3);
        expect(h.lastSageVisited).toBe(5);
        expect(h.swordEnchantmentLevel).toBe(2);
        expect(h.sagesSpoken).toBe(0x3F);
        expect(h.animPhase).toBe(8);
        expect(h.invincible).toBe(true);
    });

    it('round-trips array fields', () => {
        const g = new Uint8Array(0x10000);

        // Write spell counts
        g[0xAB] = 10; g[0xAC] = 20; g[0xAD] = 30;
        g[0xAE] = 40; g[0xAF] = 50; g[0xB0] = 60; g[0xB1] = 70;

        // Write shoes
        g[0xA1] = 1; g[0xA2] = 2; g[0xA3] = 3; g[0xA4] = 4; g[0xA5] = 5;

        // Write magic masks
        for (let i = 0; i < 9; i++) g[0xC9 + i] = 0xAA + i;

        const h = readHeroState(g);
        expect(Array.from(h.spellCounts)).toEqual([10, 20, 30, 40, 50, 60, 70]);
        expect(Array.from(h.shoes)).toEqual([1, 2, 3, 4, 5]);
        expect(Array.from(h.magicMasks)).toEqual([0xAA, 0xAB, 0xAC, 0xAD, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2]);
    });

    it('writeHeroState writes correct bytes', () => {
        const g = new Uint8Array(0x10000);
        const h = createDefaultHeroState();
        h.level = 10;
        h.hp = 500;
        h.maxHp = 1000;
        h.gold = 12345;
        h.swordType = 3;
        h.spellCounts[0] = 42;
        h.magicMasks[4] = 0xFF;

        writeHeroState(g, h);
        expect(g[0x8D] ?? 0).toBe(10);
        expect((g[0x90] ?? 0) | ((g[0x91] ?? 0) << 8)).toBe(500);
        expect((g[0xB2] ?? 0) | ((g[0xB3] ?? 0) << 8)).toBe(1000);
        expect(g[0x92] ?? 0).toBe(3);
        expect(g[0xAB] ?? 0).toBe(42);
        expect(g[0xCD] ?? 0).toBe(0xFF); // magicMasks[4] at 0xC9+4 = 0xCD
    });

    it('round-trip: writeHeroState then readHeroState returns same values', () => {
        const g = new Uint8Array(0x10000);
        const original = createDefaultHeroState();
        original.level = 5;
        original.hp = 750;
        original.gold = 99999;
        original.spellCounts[3] = 15;
        original.swordMasks[2] = 0xE0;
        original.facing = 1;
        original.invincible = true;

        writeHeroState(g, original);
        const restored = readHeroState(g);

        expect(restored.level).toBe(original.level);
        expect(restored.hp).toBe(original.hp);
        expect(restored.gold).toBe(original.gold);
        expect(restored.spellCounts[3]).toBe(original.spellCounts[3]);
        expect(restored.swordMasks[2]).toBe(original.swordMasks[2]);
        expect(restored.facing).toBe(original.facing);
        expect(restored.invincible).toBe(original.invincible);
    });
});

// ─── Save image serialization ───────────────────────────────────────────────

describe('heroStateToBytes / heroStateFromBytes', () => {
    it('produces exactly 256 bytes', () => {
        const h = createDefaultHeroState();
        h.level = 3;
        h.hp = 100;
        const bytes = heroStateToBytes(h);
        expect(bytes.length).toBe(256);
    });

    it('round-trips through bytes', () => {
        const original = createDefaultHeroState();
        original.level = 8;
        original.hp = 4200;
        original.maxHp = 5000;
        original.gold = 54321;
        original.bankGold = 99999;
        original.almas = 100;
        original.swordType = 4;
        original.shieldType = 3;
        original.shieldHp = 250;
        original.shieldMaxHp = 300;
        original.keys = 3;
        original.tearCount = 7;
        original.spellCounts[0] = 50;
        original.spellCounts[6] = 99;
        original.elfCrest = true;
        original.heroCrest = true;
        original.spokeToKing = true;
        original.facing = 1;
        original.placeMapId = 5;
        original.sagesSpoken = 0xFF;
        original.shoes[0] = 1;
        original.shoes[4] = 5;
        original.magicItems[2] = 3;
        original.magicMasks[8] = 0xFC;

        const bytes = heroStateToBytes(original);
        const restored = heroStateFromBytes(bytes);

        expect(restored.level).toBe(original.level);
        expect(restored.hp).toBe(original.hp);
        expect(restored.maxHp).toBe(original.maxHp);
        expect(restored.gold).toBe(original.gold);
        expect(restored.bankGold).toBe(original.bankGold);
        expect(restored.almas).toBe(original.almas);
        expect(restored.swordType).toBe(original.swordType);
        expect(restored.shieldType).toBe(original.shieldType);
        expect(restored.shieldHp).toBe(original.shieldHp);
        expect(restored.shieldMaxHp).toBe(original.shieldMaxHp);
        expect(restored.keys).toBe(original.keys);
        expect(restored.tearCount).toBe(original.tearCount);
        expect(restored.spellCounts[0]).toBe(50);
        expect(restored.spellCounts[6]).toBe(99);
        expect(restored.elfCrest).toBe(true);
        expect(restored.heroCrest).toBe(true);
        expect(restored.spokeToKing).toBe(true);
        expect(restored.facing).toBe(1);
        expect(restored.placeMapId).toBe(5);
        expect(restored.sagesSpoken).toBe(0xFF);
        expect(restored.shoes[0]).toBe(1);
        expect(restored.shoes[4]).toBe(5);
        expect(restored.magicItems[2]).toBe(3);
        expect(restored.magicMasks[8]).toBe(0xFC);
    });

    it('handles short input (zero-padded)', () => {
        const short = new Uint8Array([0, 0, 0, 0, 0x80]); // 5 bytes, endgameFlag bit7
        const h = heroStateFromBytes(short);
        expect(h.endgameFlag).toBe(true);
        expect(h.level).toBe(0); // zero-padded
    });

    it('preserves ALL 256 bytes through round-trip (no data loss)', () => {
        // Simulate a realistic old save: use actual game-like values
        const src = new Uint8Array(256);
        // Fill unmapped bytes with a pattern
        for (let i = 0; i < 256; i++) src[i] = (i * 7 + 13) & 0xFF;
        // Fix ALL mapped locations to values the game actually produces:
        // readBool locations (check !== 0): game always writes 0 or 1
        src[0x06] = 0x01;  // enteredCavernFirstTime
        src[0x49] = 0x01;  // deathAlreadyProcessed
        src[0xC3] = 0x01;  // leftRun
        src[0x9B] = 0x01;  // crestOfGlory
        src[0xE8] = 0x01;  // invincible
        // readBoolFF locations (check === 0xFF): game always writes 0 or 0xFF
        src[0x05] = 0xFF;  // spokeToKing
        src[0x9A] = 0xFF;  // elfCrest
        src[0x9C] = 0x00;  // heroCrest (not obtained)
        // endgameFlag uses bit7 of byte 0x04; lower 7 bits preserved
        src[0x04] = 0x80;  // endgameFlag set, lower bits zero

        const h = heroStateFromBytes(src);

        // Named fields read correctly
        expect(h.level).toBe(src[0x8D] ?? 0);
        expect(h.hp).toBe((src[0x90] ?? 0) | ((src[0x91] ?? 0) << 8));

        // Serialize back — must match original byte-for-byte
        const out = heroStateToBytes(h);
        expect(out.length).toBe(256);
        for (let i = 0; i < 256; i++) {
            expect(out[i]).toBe(src[i]);
        }
    });

    it('preserves unmapped bytes (e.g. 0x07..0x23) through round-trip', () => {
        const src = new Uint8Array(256);
        // Put magic values in unmapped regions
        src[0x07] = 0xAA;
        src[0x10] = 0xBB;
        src[0x1F] = 0xCC;
        src[0x23] = 0xDD;
        // Put named values too
        src[0x8D] = 5; // level
        src[0x90] = 100; src[0x91] = 0; // hp
        // Boolean fields: realistic values
        src[0x04] = 0x80; src[0x05] = 0xFF; src[0x06] = 0x01;
        src[0x49] = 0x01; src[0x9A] = 0xFF; src[0x9C] = 0x00;
        src[0x9B] = 0x01; src[0xC3] = 0x01; src[0xE8] = 0x01;

        const h = heroStateFromBytes(src);
        const out = heroStateToBytes(h);

        // Unmapped bytes preserved
        expect(out[0x07]).toBe(0xAA);
        expect(out[0x10]).toBe(0xBB);
        expect(out[0x1F]).toBe(0xCC);
        expect(out[0x23]).toBe(0xDD);
        // Named bytes correct
        expect(out[0x8D]).toBe(5);
        expect(out[0x90]).toBe(100);
    });

    it('writeHeroState updates raw buffer', () => {
        const g = new Uint8Array(0x10000);
        // Seed byte 0x07 with a value
        g[0x07] = 0xEE;

        const h = readHeroState(g);
        expect(h.raw[0x07]).toBe(0xEE);

        // Modify a named field
        h.level = 99;
        writeHeroState(g, h);

        // raw should be a snapshot from readHeroState time, not live
        // (raw is a copy, not a reference)
        expect(h.raw[0x07]).toBe(0xEE);
    });
});

// ─── DungeonRuntimeState ────────────────────────────────────────────────────

describe('DungeonRuntimeState', () => {
    it('readDungeonState returns defaults on zeroed buffer', () => {
        const g = new Uint8Array(0x10000);
        const s = readDungeonState(g);
        expect(s.heroY).toBe(0);
        expect(s.dungeonState).toBe(0);
        expect(s.bossIsDead).toBe(false);
        expect(s.soundFxRequest).toBe(0);
    });

    it('round-trips boolean flags', () => {
        const g = new Uint8Array(0x10000);
        g[0xFF30] = 0xFF; // bossIsDead
        g[0xFF34] = 0x01; // isBossCavern
        g[0xFF38] = 0x01; // squatFlag
        g[0xFF43] = 0x01; // swordSwingFlag
        g[0xFF3C] = 0x01; // spellActiveFlag
        g[0xFFE3] = 0xFF; // heroDeathFlag
        g[0xFFE2] = 0xFF; // dungeonExitFlag

        const s = readDungeonState(g);
        expect(s.bossIsDead).toBe(true);
        expect(s.isBossCavern).toBe(true);
        expect(s.squatFlag).toBe(true);
        expect(s.swordSwingFlag).toBe(true);
        expect(s.spellActiveFlag).toBe(true);
        expect(s.heroDeathFlag).toBe(true);
        expect(s.dungeonExitFlag).toBe(true);
    });

    it('round-trips numeric fields', () => {
        const g = new Uint8Array(0x10000);
        g[0xFF35] = 42;             // heroY
        g[0xFF90] = 5;              // dungeonState
        g[0xFF75] = 33;             // soundFxRequest
        g[0xFF31] = 0x00; g[0xFF32] = 0xE0; // viewportLeftTop = 0xE000

        const s = readDungeonState(g);
        expect(s.heroY).toBe(42);
        expect(s.dungeonState).toBe(5);
        expect(s.soundFxRequest).toBe(33);
        expect(s.viewportLeftTop).toBe(0xE000);
    });

    it('writeDungeonState writes correct bytes', () => {
        const g = new Uint8Array(0x10000);
        const s = readDungeonState(g);
        s.heroY = 99;
        s.dungeonState = 7;
        s.bossIsDead = true;
        s.soundFxRequest = 44;

        writeDungeonState(g, s);
        expect(g[0xFF35]).toBe(99);
        expect(g[0xFF90]).toBe(7);
        expect(g[0xFF30]).toBe(0xFF);
        expect(g[0xFF75]).toBe(44);
    });

    it('round-trip: write then read returns same values', () => {
        const g = new Uint8Array(0x10000);
        const original = readDungeonState(g);
        original.heroY = 55;
        original.dungeonState = 9;
        original.bossMode = 1;
        original.healingTimer = 1234;
        original.animTimer = 5678;
        original.isJashiinCavern = true;
        original.temperatureTimer = 30;

        writeDungeonState(g, original);
        const restored = readDungeonState(g);

        expect(restored.heroY).toBe(55);
        expect(restored.dungeonState).toBe(9);
        expect(restored.bossMode).toBe(1);
        expect(restored.healingTimer).toBe(1234);
        expect(restored.animTimer).toBe(5678);
        expect(restored.isJashiinCavern).toBe(true);
        expect(restored.temperatureTimer).toBe(30);
    });
});

// ─── TownRuntimeState ───────────────────────────────────────────────────────

describe('TownRuntimeState', () => {
    it('readTownState returns defaults on zeroed buffer', () => {
        const g = new Uint8Array(0x10000);
        const s = readTownState(g);
        expect(s.scrollFlag).toBe(0);
        expect(s.conversationActive).toBe(false);
        expect(s.buildingActive).toBe(false);
        expect(s.pendingDungeonFlag).toBe(false);
    });

    it('round-trips all fields', () => {
        const g = new Uint8Array(0x10000);
        g[0xFFF0] = 0x03;           // scrollFlag
        g[0xFFF1] = 5;              // transitionMap
        g[0xFFF4] = 0xFF;           // pendingTransitionFlag
        g[0xFFF5] = 0x01;           // conversationActive
        g[0xFFFA] = 0x01;           // buildingActive
        g[0xFFFB] = 3;              // buildingDestId
        g[0xFFFC] = 7;              // pendingDungeonMap
        g[0xFFFD] = 0xFF;           // pendingDungeonFlag
        g[0xFF1D] = 0x01;           // spacebarLatch
        g[0xFF1E] = 0x01;           // altkeyLatch

        const s = readTownState(g);
        expect(s.scrollFlag).toBe(3);
        expect(s.transitionMap).toBe(5);
        expect(s.pendingTransitionFlag).toBe(0xFF);
        expect(s.conversationActive).toBe(true);
        expect(s.buildingActive).toBe(true);
        expect(s.buildingDestId).toBe(3);
        expect(s.pendingDungeonMap).toBe(7);
        expect(s.pendingDungeonFlag).toBe(true);
        expect(s.spacebarLatch).toBe(true);
        expect(s.altkeyLatch).toBe(true);
    });

    it('writeTownState writes correct bytes', () => {
        const g = new Uint8Array(0x10000);
        const s = readTownState(g);
        s.scrollFlag = 5;
        s.conversationActive = true;
        s.buildingDestId = 9;

        writeTownState(g, s);
        expect(g[0xFFF0]).toBe(5);
        expect(g[0xFFF5]).toBe(1);
        expect(g[0xFFFB]).toBe(9);
    });
});

// ─── InputLatches ───────────────────────────────────────────────────────────

describe('InputLatches', () => {
    it('readInputLatches returns defaults on zeroed buffer', () => {
        const g = new Uint8Array(0x10000);
        const l = readInputLatches(g);
        expect(l.altSpace).toBe(0);
        expect(l.dirs).toBe(0);
        expect(l.specialKeys).toBe(0);
    });

    it('round-trips all fields', () => {
        const g = new Uint8Array(0x10000);
        g[0xFF16] = 0x60;           // altSpace (ALT|SPACE)
        g[0xFF17] = 0x05;           // dirs (UP|LEFT)
        g[0xFF18] = 0x91;           // specialKeys (ESC|ENTER)

        const l = readInputLatches(g);
        expect(l.altSpace).toBe(0x60);
        expect(l.dirs).toBe(0x05);
        expect(l.specialKeys).toBe(0x91);
    });

    it('writeInputLatches writes correct bytes', () => {
        const g = new Uint8Array(0x10000);
        const l: InputLatches = { altSpace: 0x60, dirs: 0x05, specialKeys: 0x91 };
        writeInputLatches(g, l);
        expect(g[0xFF16]).toBe(0x60);
        expect(g[0xFF17]).toBe(0x05);
        expect(g[0xFF18]).toBe(0x91);
    });
});
