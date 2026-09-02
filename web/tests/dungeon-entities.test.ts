import { describe, expect, it } from 'vitest';
import { isBlockingTile, isBlocking } from '../src/engine/dungeon-entities.js';
import { setDungeonPassableTilesToBuffer, g_mem, getGmem } from '../src/core/ts-memory.js';
import { SEG1_BASE } from '../src/core/memory.js';

describe('passable tile loading (regression: rope tiles must be passable)', () => {
    it('rope tiles 0x01 and 0x02 are passable after setDungeonPassableTilesToBuffer', () => {
        const g = getGmem();
        // Typical cavern 1 passable list (includes rope tiles 0x01 and 0x02)
        setDungeonPassableTilesToBuffer([
            0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x0B, 0x0C,
            0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
            0x17, 0x18, 0x19,
        ]);

        // Verify the passable tiles were written to seg1:0x8000
        expect(g[SEG1_BASE + 0x8000]).toBe(0x00);
        expect(g[SEG1_BASE + 0x8001]).toBe(0x01);
        expect(g[SEG1_BASE + 0x8002]).toBe(0x02);

        // isBlockingTile must return false for rope tiles
        expect(isBlockingTile(g, 0x01)).toBe(false);
        expect(isBlockingTile(g, 0x02)).toBe(false);
        // isBlocking (monster check) must also return 0 for rope tiles
        expect(isBlocking(g, 0x01)).toBe(0);
        expect(isBlocking(g, 0x02)).toBe(0);
    });

    it('tiles not in the passable list are blocking', () => {
        const g = getGmem();
        setDungeonPassableTilesToBuffer([0x00, 0x01, 0x02]);
        // Tile 0x08 is not in the passable list (only 0x00, 0x01, 0x02 are)
        expect(isBlockingTile(g, 0x08)).toBe(true);
        expect(isBlocking(g, 0x08)).toBe(0xff);
    });
});
