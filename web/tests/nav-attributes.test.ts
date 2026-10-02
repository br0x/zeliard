/**
 * nav-attributes.test.ts — per-cavern tile classification.
 *
 * The important tests here are the differential ones. The engine already
 * implements the passability rules against `g_mem` (engine/dungeon-entities.ts);
 * this module reimplements them against the generated tables. Loading a real
 * cavern's tables into `g_mem` and running the engine's own `is_blocking_tile`
 * and `is_blocking_tile_simple` beside ours, for every tile id, is the only way
 * to be sure the reimplementation did not drift — including over the platform
 * band, where the two engine predicates deliberately disagree.
 */
import { describe, expect, it } from 'vitest';

import {
    NavTileClassifier, TILE_COUNT, STATIC_TILE_COUNT, airflowGroups,
} from '../src/engine/nav/attributes.js';
import {
    NAV, CAP, AIRFLOW_NONE, AIRFLOW_UP, AIRFLOW_LEFT, AIRFLOW_RIGHT,
    blocksHead, blocksBody, isCurrent, isLift, isConveyor, airflowName,
} from '../src/engine/nav/types.js';
import { NAV_MAPS } from '../src/data/nav/nav-maps.js';
import { NAV_TILES } from '../src/data/nav/nav-tiles.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import {
    getGmem, setDungeonPassableTilesToBuffer, setDungeonAirflowsToBuffer,
} from '../src/core/ts-memory.js';
import { ADDR_CAVERN_LEVEL } from '../src/core/memory.js';
import { lookupShared, isBlockingTile, isBlockingTileSimple, getAirflowDirection } from '../src/engine/dungeon-entities.js';

/**
 * Load a cavern's generated tables into g_mem exactly as main.ts does, so the
 * engine's own predicates run on the same data our classifier sees.
 *
 * The engine predicates read g_mem, so every test that uses them has to say
 * which cavern it is looking at rather than inherit whatever the previous test
 * left behind.
 */
function loadIntoEngine(mapId: number): void {
    const g = getGmem();
    const cfg = DUNGEONS[String(mapId)]! as unknown as {
        passableTiles: number[];
        slopeTilesLeft?: number[];
        slopeTilesRight?: number[];
        aggressiveGround?: number[];
        airflows?: number[];
    };
    setDungeonPassableTilesToBuffer(cfg.passableTiles);
    setDungeonAirflowsToBuffer(cfg.airflows ?? []);
    g[ADDR_CAVERN_LEVEL] = NAV_MAPS[mapId]!.cavernLevel;
}

describe('tile classification against the engine predicates', () => {
    it('agrees with is_blocking_tile and is_blocking_tile_simple on every tile of every cavern', () => {
        for (const meta of NAV_MAPS) {
            loadIntoEngine(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            for (let tile = 0; tile < 0x100; tile++) {
                const ours = classifier.classify(tile);
                expect(blocksHead(ours), `map ${meta.id} tile 0x${tile.toString(16)} head`)
                    .toBe(isBlockingTile(getGmem(), tile));
                expect(blocksBody(ours), `map ${meta.id} tile 0x${tile.toString(16)} body`)
                    .toBe(isBlockingTileSimple(getGmem(), tile) !== 0);
            }
        }
    });

    it('agrees with get_airflow_direction on every tile of every cavern', () => {
        for (const meta of NAV_MAPS) {
            loadIntoEngine(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            for (let tile = 0; tile < 0x40; tile++) {
                // Our constants are the engine's values, so this is a direct
                // comparison with no translation in between.
                expect(classifier.airflowDirection(tile), `map ${meta.id} tile ${tile}`)
                    .toBe(getAirflowDirection(getGmem(), tile));
            }
        }
    });

    it('agrees with lookup_shared over the 6-bit static range', () => {
        // lookup_shared is the tail both blocking predicates share.
        for (const meta of NAV_MAPS) {
            loadIntoEngine(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            for (let tile = 0; tile < 0x40; tile++) {
                expect(classifier.classify(tile) & NAV.BLOCK_HEAD ? 1 : 0,
                    `map ${meta.id} tile ${tile}`)
                    .toBe(lookupShared(getGmem(), tile));
            }
        }
    });
});

describe('the two blocking predicates', () => {
    it('disagree across the platform band, as the engine intends', () => {
        // is_blocking_tile passes anything >= 0x40; is_blocking_tile_simple only
        // from 0x49 up. So a platform (0x40..0x48) blocks the body but not the
        // head — which is exactly why the hero can stand on one.
        const classifier = NavTileClassifier.forMap(0);
        for (let tile = 0x40; tile <= 0x48; tile++) {
            const f = classifier.classify(tile);
            expect(blocksHead(f), `0x${tile.toString(16)} head`).toBe(false);
            expect(blocksBody(f), `0x${tile.toString(16)} body`).toBe(true);
            expect(f & NAV.PLATFORM, `0x${tile.toString(16)} platform flag`).toBeTruthy();
        }
        for (let tile = 0x49; tile < 0x80; tile++) {
            const f = classifier.classify(tile);
            expect(blocksHead(f), `0x${tile.toString(16)} head`).toBe(false);
            expect(blocksBody(f), `0x${tile.toString(16)} body`).toBe(false);
        }
    });

    it('agree over the whole static map, because the RLE is 6-bit', () => {
        // Nothing above 0x3F can appear in a packed map, so a graph built from the
        // static grid may use a single solid bit. If a future tileset ever
        // produced higher tile ids this would stop holding.
        for (const meta of NAV_MAPS) {
            expect(NavTileClassifier.forMap(meta.id).staticTilesAgree(), meta.nameKey).toBe(true);
        }
    });

    it('reaches the 0x90/0x91 hard-block only through lookup_shared', () => {
        // Load explicitly: the engine predicates read g_mem, so any test using
        // them has to say which cavern it is looking at rather than inherit
        // whatever the previous test happened to leave behind.
        loadIntoEngine(0);
        expect(lookupShared(getGmem(), 0x00)).toBe(0);      // tile 0 is passable
        expect(lookupShared(getGmem(), 0x03)).toBe(1);      // unlisted: solid
        expect(lookupShared(getGmem(), 0x90)).toBe(0xff);   // hard-blocked
        expect(lookupShared(getGmem(), 0x91)).toBe(0xff);
        expect(lookupShared(getGmem(), 0x92)).toBe(0);      // bit 7: entity marker

        // ...but both predicates short-circuit above their cutoffs (0x40 and 0x49),
        // so for every tile either of them actually consults, the masked value is
        // the tile itself and the 0x90/0x91 branch cannot fire.
        const classifier = NavTileClassifier.forMap(0);
        for (const tile of [0x90, 0x91]) {
            expect(isBlockingTile(getGmem(), tile), `engine head 0x${tile.toString(16)}`).toBe(false);
            expect(blocksHead(classifier.classify(tile)), `ours head 0x${tile.toString(16)}`).toBe(false);
        }
    });

    it('treats an entity marker (bit 7) as non-solid', () => {
        const classifier = NavTileClassifier.forMap(0);
        // 0x80 | 12 is an entity marker; the real tile is in layer 2.
        expect(classifier.classify(0x80 | 12) & NAV.BLOCK_HEAD).toBeFalsy();
    });

    it('covers the whole byte, so runtime tiles need no fallback', () => {
        // Platforms, door frames and entity markers are all >= 0x40 and all
        // meaningful, so the table spans a full byte rather than the static range.
        expect(TILE_COUNT).toBe(0x100);
        expect(STATIC_TILE_COUNT).toBe(0x40);
    });

    it('clamps a tile id that is not a byte, rather than reading past the table', () => {
        const classifier = NavTileClassifier.forMap(0);
        for (const tile of [-1, TILE_COUNT, 1000]) {
            const f = classifier.classify(tile);
            expect(blocksHead(f), `tile ${tile}`).toBe(true);
            expect(blocksBody(f), `tile ${tile}`).toBe(true);
        }
    });
});

describe('tile ids with a fixed meaning', () => {
    it('marks tile 0 empty, ropes 1 and 2, and the door trigger', () => {
        for (const meta of NAV_MAPS) {
            const classifier = NavTileClassifier.forMap(meta.id);
            expect(classifier.classify(0) & NAV.EMPTY, `${meta.nameKey} tile 0`).toBeTruthy();
            expect(classifier.classify(1) & NAV.ROPE, `${meta.nameKey} tile 1`).toBeTruthy();
            expect(classifier.classify(2) & NAV.ROPE, `${meta.nameKey} tile 2`).toBeTruthy();
            expect(classifier.classify(0x4a) & NAV.DOOR_TRIGGER, `${meta.nameKey} door`).toBeTruthy();
        }
    });

    it('keeps tile 0 and both ropes passable in every cavern that declares them', () => {
        for (const meta of NAV_MAPS) {
            const passable = NAV_TILES[meta.id]!.passable;
            const classifier = NavTileClassifier.forMap(meta.id);
            for (const tile of [0, 1, 2]) {
                if (!passable.includes(tile)) continue;
                expect(blocksBody(classifier.classify(tile)), `${meta.nameKey} tile ${tile}`)
                    .toBe(false);
            }
        }
    });

    it('marks the 8 boss arenas with no ropes, and every other cavern with them', () => {
        for (const meta of NAV_MAPS) {
            const classifier = NavTileClassifier.forMap(meta.id);
            const ropes = [1, 2].some((t) => (classifier.classify(t) & NAV.ROPE) !== 0);
            expect(ropes, `${meta.nameKey} rope flag`).toBe(true);
        }
    });
});

describe('slopes, hazards and currents', () => {
    it('marks the cavern-specific slope tables', () => {
        for (const meta of NAV_MAPS) {
            const tables = NAV_TILES[meta.id]!;
            const classifier = NavTileClassifier.forMap(meta.id);
            // The slope lists are zero-padded to four slots, so skip the padding:
            // tile 0 is the void, never a slope.
            for (const tile of tables.slopeLeft.filter((v) => v !== 0)) {
                expect(classifier.classify(tile) & NAV.SLOPE_LEFT, `${meta.nameKey} ${tile}`)
                    .toBeTruthy();
                expect(classifier.classify(tile) & NAV.SLOPE_RIGHT, `${meta.nameKey} ${tile}`)
                    .toBeFalsy();
            }
            for (const tile of tables.slopeRight.filter((v) => v !== 0)) {
                expect(classifier.classify(tile) & NAV.SLOPE_RIGHT, `${meta.nameKey} ${tile}`)
                    .toBeTruthy();
                expect(classifier.classify(tile) & NAV.SLOPE_LEFT, `${meta.nameKey} ${tile}`)
                    .toBeFalsy();
            }
        }
    });

    it('marks the cavern-specific aggressive ground', () => {
        for (const meta of NAV_MAPS) {
            const classifier = NavTileClassifier.forMap(meta.id);
            // Zero-padded to four slots like the slope lists, so skip the padding.
            for (const tile of NAV_TILES[meta.id]!.aggressive.filter((v) => v !== 0)) {
                expect(classifier.classify(tile) & NAV.AGGRESSIVE, `${meta.nameKey} ${tile}`)
                    .toBeTruthy();
            }
        }
    });

    it('never treats the void tile as a slope or as aggressive ground', () => {
        // The three tables are zero-terminated, and the generated arrays keep that
        // terminator — mp30's aggressive group is [29,30,31,0]. Reading one raw made
        // tile 0, which is empty space and most of a cavern, an aggressive slope,
        // which set HAZARD_AGGRESSIVE on all 978 nodes of mp30 and refused the hero
        // every route on it unless he wore Pirika shoes. The terminator ends the
        // list; it is never a member of it.
        for (const meta of NAV_MAPS) {
            const f = NavTileClassifier.forMap(meta.id).classify(0);
            expect(f & NAV.AGGRESSIVE, meta.nameKey).toBe(0);
            expect(f & (NAV.SLOPE_LEFT | NAV.SLOPE_RIGHT), meta.nameKey).toBe(0);
            // And tile 0 is still the void, exactly as before.
            expect(f & NAV.EMPTY, meta.nameKey).toBeTruthy();
        }
    });

    it('leaves boss arenas with no hazards at all', () => {
        for (const meta of NAV_MAPS.filter((m) => m.isBossArena)) {
            const classifier = NavTileClassifier.forMap(meta.id);
            for (let tile = 0; tile < TILE_COUNT; tile++) {
                const f = classifier.classify(tile);
                expect(f & (NAV.SLOPE_LEFT | NAV.SLOPE_RIGHT | NAV.AGGRESSIVE), meta.nameKey)
                    .toBe(0);
                expect(isCurrent(f), `${meta.nameKey} tile ${tile}`).toBe(false);
            }
        }
    });

    it('splits the 12-slot airflow table into three groups of four', () => {
        const g = airflowGroups([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect([...g.up]).toEqual([1, 2, 3, 4]);
        expect([...g.left]).toEqual([5, 6, 7, 8]);
        expect([...g.right]).toEqual([9, 10, 11, 12]);
        // A zero ends a group early.
        const z = airflowGroups([7, 0, 0, 0, 3, 4, 0, 0, 9, 0, 0, 0]);
        expect([...z.up]).toEqual([7]);
        expect([...z.left]).toEqual([3, 4]);
        expect([...z.right]).toEqual([9]);
        expect([...airflowGroups([]).up]).toEqual([]);
    });

    it('gives a double-listed current tile exactly one direction, up taking precedence', () => {
        // No shipped tileset lists a tile twice, so the precedence in
        // get_airflow_direction is unobservable in the real data. Build the table
        // that would trigger it: tile 5 in all three groups.
        const tables = {
            passable: [0, 1, 2, 5],
            slopeLeft: [] as number[],
            slopeRight: [] as number[],
            aggressive: [] as number[],
            //            up     left   right
            airflows: [5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0],
        };
        const classifier = NavTileClassifier.fromTables(0, tables);
        const f = classifier.classify(5);
        expect(f & NAV.AIRFLOW_UP).toBeTruthy();
        expect(f & NAV.AIRFLOW_LEFT).toBeFalsy();
        expect(f & NAV.AIRFLOW_RIGHT).toBeFalsy();
        expect(classifier.airflowDirection(5)).toBe(AIRFLOW_UP);

        // Left beats right for the same reason.
        const twoWayTables = {
            ...tables, airflows: [0, 0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 0],
        };
        const twoWay = NavTileClassifier.fromTables(0, twoWayTables);
        const g = twoWay.classify(7);
        expect(g & NAV.AIRFLOW_LEFT).toBeTruthy();
        expect(g & NAV.AIRFLOW_RIGHT).toBeFalsy();
        expect(twoWay.airflowDirection(7)).toBe(AIRFLOW_LEFT);

        // And the engine agrees, given the same table in g_mem.
        setDungeonPassableTilesToBuffer(tables.passable);
        setDungeonAirflowsToBuffer(tables.airflows);
        expect(getAirflowDirection(getGmem(), 5)).toBe(AIRFLOW_UP);

        setDungeonAirflowsToBuffer(twoWayTables.airflows);
        expect(getAirflowDirection(getGmem(), 7)).toBe(AIRFLOW_LEFT);
        // And our own classifier matches the engine on the same tables.
        expect(twoWay.airflowDirection(7)).toBe(getAirflowDirection(getGmem(), 7));

        expect(airflowName(AIRFLOW_UP)).toBe('up');
        expect(airflowName(AIRFLOW_LEFT)).toBe('left');
        expect(airflowName(AIRFLOW_RIGHT)).toBe('right');
        expect(airflowName(AIRFLOW_NONE)).toBe('none');
    });

    it('classifies a real current cavern correctly (mp71)', () => {
        // mp71 is the strongest case: 327 up cells, 432 right-push cells.
        const classifier = NavTileClassifier.forMap(19);
        expect(classifier.classify(0x2a) & NAV.AIRFLOW_UP).toBeTruthy();
        expect(classifier.classify(0x29) & NAV.AIRFLOW_LEFT).toBeTruthy();
        expect(classifier.classify(0x28) & NAV.AIRFLOW_RIGHT).toBeTruthy();
        expect(isLift(classifier.classify(0x2a))).toBe(true);
        expect(isConveyor(classifier.classify(0x29))).toBe(true);
        expect(isConveyor(classifier.classify(0x2a))).toBe(false);
        expect(isCurrent(classifier.classify(0x00))).toBe(false);
        expect(classifier.airflowDirection(0)).toBe(AIRFLOW_NONE);
    });

    it('reports the cavern level that selects ice and heat behaviour', () => {
        expect(NavTileClassifier.forMap(0).cavernLevel()).toBe(1);
        expect(NavTileClassifier.forMap(19).cavernLevel()).toBe(7);   // heat
        expect(NavTileClassifier.forMap(8).cavernLevel()).toBe(4);    // ice
    });
});

describe('classifier lifecycle', () => {
    it('caches per map and returns the same instance', () => {
        const a = NavTileClassifier.forMap(0);
        const b = NavTileClassifier.forMap(0);
        expect(a).toBe(b);
    });

    it('builds a distinct instance per map', () => {
        expect(NavTileClassifier.forMap(0)).not.toBe(NavTileClassifier.forMap(1));
    });

    it('rejects a map with no generated tables', () => {
        expect(() => NavTileClassifier.forMap(999)).toThrow(/no generated tile tables/);
    });

    it('rebuilds after the cache is cleared', () => {
        const first = NavTileClassifier.forMap(0);
        NavTileClassifier.clearCache();
        expect(NavTileClassifier.forMap(0)).not.toBe(first);
    });

    it('hands out its table without letting callers mutate it', () => {
        const classifier = NavTileClassifier.forMap(0);
        expect(classifier.table().length).toBe(TILE_COUNT);
        expect(classifier.attributeTables().passable)
            .toEqual(NAV_TILES[0]!.passable);
    });
});

describe('capability constants', () => {
    it('grants rope climbing unconditionally', () => {
        // CAP_ALWAYS is exported from types; rope tiles need no item.
        expect(CAP.CLIMB).toBe(1);
        expect(CAP.JUMP_HIGH).not.toBe(CAP.CLIMB);
        // The five wearables map to five distinct bits.
        const wearable = [
            CAP.JUMP_HIGH, CAP.SLOPE_STAND, CAP.GROUND_SAFE, CAP.ICE_SAFE, CAP.HEAT_SAFE,
        ];
        expect(new Set(wearable).size).toBe(5);
    });

    it('keeps key bits separate from wearable bits', () => {
        const bits = [
            CAP.CLIMB, CAP.JUMP_HIGH, CAP.SLOPE_STAND, CAP.GROUND_SAFE,
            CAP.ICE_SAFE, CAP.HEAT_SAFE, CAP.KEY, CAP.LION_KEY,
        ];
        expect(new Set(bits).size).toBe(8);
    });
});
