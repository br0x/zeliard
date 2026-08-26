import { describe, expect, it, beforeEach } from 'vitest';
import {
    g_mem,
    GMEM_SIZE,
    getGmem,
    zeroMemory,
    loadSaveState,
    loadMdtToBuffer,
    setSpecialTileListToBuffer,
    setDungeonSwordReachToBuffer,
    setDungeonPassableTilesToBuffer,
    setDungeonSlopeTilesLeftToBuffer,
    setDungeonSlopeTilesRightToBuffer,
    setDungeonAggressiveGroundToBuffer,
    setDungeonAirflowsToBuffer,
    setDungeonMonsterXpToBuffer,
    setDungeonMonsterDamageToBuffer,
    setDeathDescriptorsToBuffer,
    setTrajectoriesToBuffer,
    gMemAt,
    readU8,
    readU16,
    readMemory,
    writeMemory,
} from '../src/core/ts-memory.js';
import { ADDR_MDT, SEG1_BASE, REACH_TABLE_OFFSET, ADDR_TRAJECTORIES, MEM_SAVE_DATA } from '../src/core/memory.js';

describe('ts-memory', () => {
    beforeEach(() => {
        zeroMemory();
    });

    it('GMEM_SIZE is 256KB', () => {
        expect(GMEM_SIZE).toBe(0x40000);
        expect(g_mem.length).toBe(0x40000);
    });

    it('getGmem returns the same buffer', () => {
        expect(getGmem()).toBe(g_mem);
    });

    describe('zeroMemory', () => {
        it('zeros the entire buffer', () => {
            g_mem[0] = 0xff;
            g_mem[1000] = 0x42;
            g_mem[GMEM_SIZE - 1] = 0x99;
            zeroMemory();
            expect(g_mem[0]).toBe(0);
            expect(g_mem[1000]).toBe(0);
            expect(g_mem[GMEM_SIZE - 1]).toBe(0);
        });
    });

    describe('loadSaveState', () => {
        it('writes 256 bytes at offset 0', () => {
            const data = Uint8Array.from({ length: 256 }, (_, i) => i & 0xff);
            loadSaveState(data);
            expect(g_mem[0]).toBe(0);
            expect(g_mem[1]).toBe(1);
            expect(g_mem[255]).toBe(255);
        });

        it('zero-pads short data to 256 bytes', () => {
            const data = Uint8Array.from([0xaa, 0xbb, 0xcc]);
            loadSaveState(data);
            expect(g_mem[0]).toBe(0xaa);
            expect(g_mem[1]).toBe(0xbb);
            expect(g_mem[2]).toBe(0xcc);
            expect(g_mem[3]).toBe(0);
            expect(g_mem[255]).toBe(0);
        });

        it('round-trips through readMemory', () => {
            const data = Uint8Array.from({ length: 256 }, (_, i) => (i * 7) % 256);
            loadSaveState(data);
            const readBack = readMemory(0, 256);
            expect(readBack).toEqual(data);
        });

        it('does not touch bytes beyond 256', () => {
            g_mem[256] = 0x42;
            loadSaveState(Uint8Array.from([0xff]));
            expect(g_mem[256]).toBe(0x42);
        });
    });

    describe('loadMdtToBuffer', () => {
        it('writes MDT data at ADDR_MDT', () => {
            const mdt = Uint8Array.from([0x10, 0x20, 0x30, 0x40]);
            loadMdtToBuffer(mdt);
            expect(g_mem[ADDR_MDT]).toBe(0x10);
            expect(g_mem[ADDR_MDT + 1]).toBe(0x20);
            expect(g_mem[ADDR_MDT + 2]).toBe(0x30);
            expect(g_mem[ADDR_MDT + 3]).toBe(0x40);
        });

        it('does not touch bytes before ADDR_MDT', () => {
            g_mem[ADDR_MDT - 1] = 0x42;
            loadMdtToBuffer(Uint8Array.from([0xff]));
            expect(g_mem[ADDR_MDT - 1]).toBe(0x42);
        });
    });

    describe('setSpecialTileListToBuffer', () => {
        it('writes count-prefixed tile list to seg1:0x9000 and pointer at 0x8002', () => {
            const tiles = [10, 20, 30];
            setSpecialTileListToBuffer(tiles);
            const base = SEG1_BASE + 0x9000;
            expect(g_mem[base]).toBe(3);       // count
            expect(g_mem[base + 1]).toBe(10);  // tile 0
            expect(g_mem[base + 2]).toBe(20);  // tile 1
            expect(g_mem[base + 3]).toBe(30);  // tile 2
            // Pointer at seg1:0x8002 → 0x9000
            const ptrAddr = SEG1_BASE + 0x8002;
            expect(g_mem[ptrAddr]).toBe(0x00);
            expect(g_mem[ptrAddr + 1]).toBe(0x90);
        });

        it('handles empty list (count=0)', () => {
            setSpecialTileListToBuffer([]);
            const base = SEG1_BASE + 0x9000;
            expect(g_mem[base]).toBe(0);  // count = 0
        });
    });

    describe('setDungeonSwordReachToBuffer', () => {
        it('writes reach table pointers and lists', () => {
            const reachObj: Record<number, number[]> = {
                2: [100, 101, 102],
                0: [50, 51],
            };
            setDungeonSwordReachToBuffer(reachObj);
            // Table starts at seg1:REACH_TABLE_OFFSET
            const tableBase = SEG1_BASE + REACH_TABLE_OFFSET;
            // Lists start at seg1:REACH_LISTS_OFFSET
            const listBase = SEG1_BASE + 0xB01E; // REACH_LISTS_OFFSET
            // Pointers are seg1-relative: key 0 first
            const ptr0 = (g_mem[tableBase] ?? 0) | ((g_mem[tableBase + 1] ?? 0) << 8);
            expect(ptr0).toBe(0xB01E); // REACH_LISTS_OFFSET (seg1-relative)
            // Key 2 second (sorted 0, 2)
            const ptr2 = (g_mem[tableBase + 2] ?? 0) | ((g_mem[tableBase + 3] ?? 0) << 8);
            // List for key 0 has 2 bytes, so key 2 starts at REACH_LISTS_OFFSET+2
            expect(ptr2).toBe(0xB01E + 2);
            // Verify list contents
            expect(g_mem[listBase]).toBe(50);
            expect(g_mem[listBase + 1]).toBe(51);
            expect(g_mem[listBase + 2]).toBe(100);
            expect(g_mem[listBase + 3]).toBe(101);
            expect(g_mem[listBase + 4]).toBe(102);
        });
    });

    describe('accessor functions', () => {
        it('gMemAt reads a byte', () => {
            g_mem[0x90] = 0x42;
            expect(gMemAt(0x90)).toBe(0x42);
        });

        it('gMemAt returns 0 for uninitialized', () => {
            expect(gMemAt(0x1234)).toBe(0);
        });

        it('readU8 reads a byte', () => {
            g_mem[0xFF] = 0xAB;
            expect(readU8(0xFF)).toBe(0xAB);
        });

        it('readU16 reads little-endian 16-bit', () => {
            g_mem[0x100] = 0x34;
            g_mem[0x101] = 0x12;
            expect(readU16(0x100)).toBe(0x1234);
        });

        it('readU16 returns 0 when memory not set', () => {
            expect(readU16(0x5000)).toBe(0);
        });

        it('readMemory returns a copy', () => {
            g_mem[0] = 0xAA;
            g_mem[1] = 0xBB;
            const copy = readMemory(0, 2);
            expect(copy).toEqual(new Uint8Array([0xAA, 0xBB]));
            // Modifying the copy does not affect g_mem
            copy[0] = 0xFF;
            expect(g_mem[0]).toBe(0xAA);
        });

        it('writeMemory writes bytes', () => {
            writeMemory(0x1000, [0xDE, 0xAD, 0xBE]);
            expect(g_mem[0x1000]).toBe(0xDE);
            expect(g_mem[0x1001]).toBe(0xAD);
            expect(g_mem[0x1002]).toBe(0xBE);
        });

        it('writeMemory handles Uint8Array input', () => {
            writeMemory(0x2000, new Uint8Array([0xCA, 0xFE]));
            expect(g_mem[0x2000]).toBe(0xCA);
            expect(g_mem[0x2001]).toBe(0xFE);
        });
    });

    describe('dungeon config setup', () => {
        it('setDungeonPassableTilesToBuffer writes 24 bytes at seg1:0x8000', () => {
            const tiles = [1, 2, 3];
            setDungeonPassableTilesToBuffer(tiles);
            const base = SEG1_BASE + 0x8000;
            expect(g_mem[base]).toBe(1);
            expect(g_mem[base + 1]).toBe(2);
            expect(g_mem[base + 2]).toBe(3);
            expect(g_mem[base + 3]).toBe(0); // zero-padded
            expect(g_mem[base + 23]).toBe(0); // last byte zero-padded
        });

        it('setDungeonSlopeTilesLeftToBuffer writes 4 bytes at seg1:0x8018', () => {
            setDungeonSlopeTilesLeftToBuffer([10, 20]);
            const base = SEG1_BASE + 0x8018;
            expect(g_mem[base]).toBe(10);
            expect(g_mem[base + 1]).toBe(20);
            expect(g_mem[base + 2]).toBe(0);
        });

        it('setDungeonSlopeTilesRightToBuffer writes 4 bytes at seg1:0x801C', () => {
            setDungeonSlopeTilesRightToBuffer([5, 6, 7, 8]);
            const base = SEG1_BASE + 0x801C;
            expect(g_mem[base]).toBe(5);
            expect(g_mem[base + 3]).toBe(8);
        });

        it('setDungeonAggressiveGroundToBuffer writes 4 bytes at seg1:0x8020', () => {
            setDungeonAggressiveGroundToBuffer([0xFF]);
            expect(g_mem[SEG1_BASE + 0x8020]).toBe(0xFF);
            expect(g_mem[SEG1_BASE + 0x8021]).toBe(0);
        });

        it('setDungeonAirflowsToBuffer writes 12 bytes at seg1:0x8024', () => {
            const airflows = [1, 2, 3, 4, 5];
            setDungeonAirflowsToBuffer(airflows);
            const base = SEG1_BASE + 0x8024;
            expect(g_mem[base]).toBe(1);
            expect(g_mem[base + 4]).toBe(5); // 5th item
            expect(g_mem[base + 5]).toBe(0); // zero-padded after items
        });

        it('setDungeonMonsterXpToBuffer writes 8 bytes at 0xA008', () => {
            setDungeonMonsterXpToBuffer([10, 20, 30]);
            expect(g_mem[0xa008]).toBe(10);
            expect(g_mem[0xa009]).toBe(20);
            expect(g_mem[0xa00a]).toBe(30);
            expect(g_mem[0xa00b]).toBe(0);
        });

        it('setDungeonMonsterDamageToBuffer writes 8 bytes at 0xA010', () => {
            setDungeonMonsterDamageToBuffer([5, 10, 15, 20, 25, 30, 35, 40]);
            expect(g_mem[0xa010]).toBe(5);
            expect(g_mem[0xa017]).toBe(40);
        });

        it('setDeathDescriptorsToBuffer writes pointer table and descriptor data', () => {
            const descs = [
                [1, 2, 3, 4],
                [5, 6, 7, 8],
            ];
            setDeathDescriptorsToBuffer(descs);
            // Pointer to dispatch array at 0xA006 should be 0xA0C0
            expect(g_mem[0xa006]).toBe(0xc0);
            expect(g_mem[0xa007]).toBe(0xa0);
            // First dispatch entry should point to 0xA0E0
            const ptr0 = (g_mem[0xa0c0] ?? 0) | ((g_mem[0xa0c1] ?? 0) << 8);
            expect(ptr0).toBe(0xa0e0);
            // Second dispatch entry should point to 0xA0E4
            const ptr1 = (g_mem[0xa0c2] ?? 0) | ((g_mem[0xa0c3] ?? 0) << 8);
            expect(ptr1).toBe(0xa0e4);
            // Descriptor data
            expect(g_mem[0xa0e0]).toBe(1);
            expect(g_mem[0xa0e3]).toBe(4);
            expect(g_mem[0xa0e4]).toBe(5);
            expect(g_mem[0xa0e7]).toBe(8);
        });

        it('setTrajectoriesToBuffer writes data at ADDR_TRAJECTORIES', () => {
            const trajs = [[10, 20, 0xff], [30, 40]];
            setTrajectoriesToBuffer(trajs);
            expect(g_mem[ADDR_TRAJECTORIES]).toBe(10);
            expect(g_mem[ADDR_TRAJECTORIES + 1]).toBe(20);
            expect(g_mem[ADDR_TRAJECTORIES + 2]).toBe(0xff);
            expect(g_mem[ADDR_TRAJECTORIES + 3]).toBe(30);
            expect(g_mem[ADDR_TRAJECTORIES + 4]).toBe(40);
        });
    });

    describe('stdply.bin compatibility', () => {
        it('loadSaveState + readMemory round-trips the 256-byte save format', () => {
            // Simulate a real save: hero stats at known offsets
            const save = new Uint8Array(256);
            save[0x8D] = 5;   // ADDR_HERO_LEVEL
            save[0x90] = 0x64; // ADDR_HERO_HP lo
            save[0x91] = 0x00; // ADDR_HERO_HP hi
            save[0x92] = 3;   // ADDR_SWORD_TYPE
            save[0xC4] = 2;   // ADDR_PLACE_MAP_ID

            loadSaveState(save);

            expect(g_mem[0x8D]).toBe(5);
            expect(g_mem[0x90]).toBe(0x64);
            expect(g_mem[0x91]).toBe(0x00);
            expect(g_mem[0x92]).toBe(3);
            expect(g_mem[0xC4]).toBe(2);

            const readBack = readMemory(MEM_SAVE_DATA, 256);
            expect(readBack).toEqual(save);
        });
    });
});
