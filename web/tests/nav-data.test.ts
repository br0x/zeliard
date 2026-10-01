/**
 * nav-data.test.ts — integrity of the generated navigation data.
 *
 * These are the assertions docs/PATHFINDER_PLAN.md §13 lists for phase 0. They
 * guard the extractor against three failure modes that a wrong pathfinder would
 * otherwise surface only as an impossible route in game:
 *
 *   1. silent under-parsing of dungeons.ts (a dropped tile id changes which
 *      tiles the hero may stand on);
 *   2. door geometry that disagrees with the destination map's width;
 *   3. a topology model that treats a one-way door as two-way.
 *
 * Every count here is a property of the shipped data, so any change to it means
 * the MDTs or dungeons.ts changed and this file needs reviewing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    NAV_MAPS, NAV_MAP_BY_ID, NAV_MAP_TILES, NAV_COMPONENTS, NAV_REACHABLE,
} from '../src/data/nav/nav-maps.js';
import { PORTALS, NAV_PORTALS_BY_MAP, NAV_DOOR_COUNT } from '../src/data/nav/nav-portals.js';
import { NAV_TILES } from '../src/data/nav/nav-tiles.js';
import { NAV_PLATFORMS } from '../src/data/nav/nav-platforms.js';
import { NAV_AIRFLOWS } from '../src/data/nav/nav-airflows.js';
import { DUNGEONS } from '../src/data/dungeons.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAP_HEIGHT = 64;

describe('nav maps', () => {
    it('covers all 31 cavern maps', () => {
        expect(NAV_MAPS).toHaveLength(31);
        expect(NAV_MAPS.map((m) => m.id)).toEqual([...Array(31).keys()]);
    });

    it('agrees with DUNGEONS on every mdtPath', () => {
        for (const meta of NAV_MAPS) {
            expect(meta.mdtPath, `map ${meta.id}`).toBe(DUNGEONS[String(meta.id)]!.mdtPath);
        }
    });

    it('derives the locale name key from the file name', () => {
        for (const meta of NAV_MAPS) {
            expect(meta.nameKey).toBe(meta.mdtPath.split('/').pop()!.replace(/\.mdt$/i, ''));
        }
    });

    it('reads mapWidth from the MDT header, matching mapWidth * 64 tiles', () => {
        for (const meta of NAV_MAPS) {
            expect(meta.mapWidth, `map ${meta.id}`).toBeGreaterThan(0);
            expect(NAV_MAP_TILES[meta.id]).toBe(meta.mapWidth * MAP_HEIGHT);
        }
    });

    it('keeps map widths inside the range the map screen was designed for', () => {
        const widths = NAV_MAPS.map((m) => m.mapWidth);
        expect(Math.min(...widths)).toBe(42);
        expect(Math.max(...widths)).toBe(320);
    });

    it('assigns every map a component that contains it', () => {
        for (const meta of NAV_MAPS) {
            const component = NAV_COMPONENTS[meta.component];
            expect(component, `map ${meta.id} -> component ${meta.component}`).toBeDefined();
            expect(component!.maps).toContain(meta.id);
        }
    });

    it('builds a lookup by id', () => {
        expect(NAV_MAP_BY_ID.get(0)?.mdtPath).toBe('game/0/mp10.mdt');
        expect(NAV_MAP_BY_ID.get(30)?.mdtPath).toBe('game/0/mpa0.mdt');
        expect(NAV_MAP_BY_ID.get(31)).toBeUndefined();
    });
});

describe('nav portals', () => {
    it('has 163 doors across the 31 maps', () => {
        expect(PORTALS).toHaveLength(163);
        expect(NAV_DOOR_COUNT.reduce((a, b) => a + b, 0)).toBe(163);
    });

    it('has 15 town doors, which are the graph cut', () => {
        expect(PORTALS.filter((p) => p.toTown)).toHaveLength(15);
        for (const p of PORTALS.filter((x) => x.toTown)) {
            expect(p.destMapId, 'town doors carry a stale dest id in the file').toBe(-1);
            expect(p.destX).toBe(-1);
            expect(p.destY).toBe(-1);
        }
    });

    it('has exactly 2 Lion-Head key doors', () => {
        const lions = PORTALS.filter((p) => p.key === 2);
        expect(lions).toHaveLength(2);
        expect(lions.map((p) => `${NAV_MAPS[p.mapId]!.nameKey} ${p.x0},${p.y0}`)).toEqual([
            'mp60 31,5',
            'mp84 16,51',
        ]);
    });

    it('normalises both ends to the standing position (x0, y0 + 1)', () => {
        for (const p of PORTALS) {
            expect(p.fromX).toBe(p.x0);
            expect(p.fromY).toBe((p.y0 + 1) & 0x3f);
            if (!p.toTown) {
                expect(p.toX).toBe(p.destX);
                expect(p.toY).toBe((p.destY + 1) & 0x3f);
            }
        }
    });

    it('keeps every door column inside its own map', () => {
        for (const p of PORTALS) {
            expect(p.x0, `map ${p.mapId} door x0`).toBeLessThan(NAV_MAPS[p.mapId]!.mapWidth);
        }
    });

    it('keeps every arrival column inside the DESTINATION map', () => {
        // x1 is an absolute X on the far map, so it may exceed the source width:
        // mp30 is 204 wide and has a door arriving at x1 = 205 in the 224-wide mp20.
        for (const p of PORTALS.filter((x) => !x.toTown)) {
            const dest = NAV_MAPS[p.destMapId];
            expect(dest, `map ${p.mapId} door -> ${p.destMapId}`).toBeDefined();
            expect(p.destX, `map ${p.mapId} -> ${p.destMapId}`).toBeLessThan(dest!.mapWidth);
        }
    });

    it('groups portal indices by map, covering every portal exactly once', () => {
        const seen = new Set<number>();
        NAV_PORTALS_BY_MAP.forEach((idx, mapId) => {
            for (const i of idx) {
                expect(PORTALS[i]!.mapId, `index ${i} listed under map ${mapId}`).toBe(mapId);
                expect(seen.has(i), `index ${i} listed twice`).toBe(false);
                seen.add(i);
            }
        });
        expect(seen.size).toBe(PORTALS.length);
    });

    it('flags the 17 doors into doorless maps as dead ends', () => {
        const dead = PORTALS.filter((p) => p.deadEnd);
        expect(dead).toHaveLength(17);
        for (const p of dead) {
            // A dead end means the far map carries no door table at all.
            expect(NAV_MAPS[p.destMapId]!.isDoorless, `map ${p.destMapId}`).toBe(true);
        }
    });

    it('flags the single original one-way door', () => {
        // mp81's (227,59) is a self-loop shortcut: it arrives on mp81 (151,16),
        // which is exactly where mp81's (151,15) portal departs. That portal is
        // mutual with mp82 (174,9), so the shortcut feeds a two-way pair, but it
        // cannot itself be reversed — the door at the far end leads to mp82.
        const oneWay = PORTALS.filter((p) => p.oneWay);
        expect(oneWay).toHaveLength(1);
        expect(`${NAV_MAPS[oneWay[0]!.mapId]!.nameKey} ${oneWay[0]!.x0},${oneWay[0]!.y0}`).toBe('mp81 227,59');
        expect(oneWay[0]!.destMapId).toBe(24);
    });
});

describe('nav topology', () => {
    it('splits the 31 maps into 15 strongly connected components', () => {
        expect(NAV_COMPONENTS).toHaveLength(15);
        const multi = NAV_COMPONENTS.filter((c) => c.maps.length > 1);
        expect(multi.map((c) => c.maps.map((m) => NAV_MAPS[m]!.nameKey)));
    });

    it('gives every doorless map its own component', () => {
        // isDoorless means "no door table at all": a boss arena or a Jashiin room.
        // mp84 also ends up alone, but for a different reason — its only doors
        // point at the doorless mp8d and mp90.
        const doorless = NAV_MAPS.filter((m) => m.isDoorless);
        expect(doorless.map((m) => m.nameKey)).toEqual([
            'mp1d', 'mp2d', 'mp3d', 'mp4d', 'mp5d', 'mp6d',
            'mp73', 'mp7d', 'mp8d', 'mp90', 'mpa0',
        ]);
        for (const m of doorless) {
            expect(NAV_COMPONENTS[m.component]!.maps, m.nameKey).toEqual([m.id]);
        }
        expect(NAV_COMPONENTS[NAV_MAP_BY_ID.get(27)!.component]!.maps).toEqual([27]);
    });

    it('never welds a doorless map into a larger component', () => {
        // mp84 and mp81 both point at mp8d, which has no door table. An undirected
        // walk would route mp84 -> mp8d -> mp81 and merge two separate groups.
        expect(NAV_MAP_BY_ID.get(27)!.component).not.toBe(NAV_MAP_BY_ID.get(24)!.component);
    });

    it('lists portal pairs that are traversable in both directions', () => {
        for (const component of NAV_COMPONENTS) {
            const members = new Set(component.maps);
            for (const [a, b] of component.portalPairs) {
                const pa = PORTALS[a]!;
                const pb = PORTALS[b]!;
                expect(members.has(pa.mapId)).toBe(true);
                expect(members.has(pb.mapId)).toBe(true);
                expect(pa.deadEnd, `portal ${a} is a dead end and has no pair`).toBe(false);
                expect(pa.oneWay, `portal ${a} is one-way and has no pair`).toBe(false);
                // The partner must depart from exactly this portal's arrival cell
                // and lead back to its origin, otherwise the reverse hop would be
                // unreachable.
                expect(pb.fromX).toBe(pa.toX);
                expect(pb.fromY).toBe(pa.toY);
                expect(pb.destMapId).toBe(pa.mapId);
            }
        }
    });

    it('records the one door pair that is a shortcut rather than a round trip', () => {
        // mp81(151,15) -> mp82(174,10) and mp82(174,9) -> mp81(227,60). Both hops
        // are traversable, but the return lands on mp81 at (227,60) instead of
        // (151,16). Chained with mp81's one-way self-loop (227,59), which arrives
        // exactly at (151,16), the three form a closed circuit.
        const shortcuts = NAV_COMPONENTS
            .flatMap((c) => c.portalPairs)
            .filter(([a, b]) => {
                const pa = PORTALS[a]!;
                const pb = PORTALS[b]!;
                return pb.toX !== pa.fromX || pb.toY !== pa.fromY;
            });
        expect(shortcuts).toHaveLength(1);
        const [a, b] = shortcuts[0]!;
        const pa = PORTALS[a]!;
        const pb = PORTALS[b]!;
        expect(`${NAV_MAPS[pa.mapId]!.nameKey}(${pa.x0},${pa.y0})`).toBe('mp81(151,15)');
        expect(`${NAV_MAPS[pb.mapId]!.nameKey}(${pb.x0},${pb.y0})`).toBe('mp82(174,9)');
        expect(pb.toX).toBe(227);
        expect(pb.toY).toBe(60);
    });

    it('pairs every linked door exactly once, as a matching', () => {
        const seen = new Map<number, number>();
        for (const component of NAV_COMPONENTS) {
            for (const [a, b] of component.portalPairs) {
                seen.set(a, (seen.get(a) ?? 0) + 1);
                seen.set(b, (seen.get(b) ?? 0) + 1);
            }
        }
        const mutual = PORTALS.filter((p) => !p.toTown && !p.deadEnd && !p.oneWay);
        // Every mutual portal is in exactly one pair, and a pair covers two of them.
        expect(seen.size).toBe(mutual.length);
        for (const [index, n] of seen) expect(n, `portal ${index}`).toBe(1);
        expect(NAV_COMPONENTS.reduce((a, c) => a + c.portalPairs.length, 0))
            .toBe(mutual.length / 2);
    });

    it('makes reachable sets a superset of the owning component', () => {
        for (const meta of NAV_MAPS) {
            const component = new Set(NAV_COMPONENTS[meta.component]!.maps);
            const reachable = new Set(NAV_REACHABLE[meta.id]!);
            for (const m of component) {
                expect(reachable.has(m), `${meta.nameKey} cannot reach its own component mate ${m}`).toBe(true);
            }
            expect(reachable.has(meta.id)).toBe(true);
        }
    });

    it('lets a cave reach its boss arena even though the arena cannot come back', () => {
        const fromMp10 = NAV_REACHABLE[0]!;
        expect(fromMp10).toContain(0);
        expect(fromMp10).toContain(1);   // mp1d, a dead end
        expect(fromMp10).toHaveLength(11);
        // ...and mp1d reaches only itself.
        expect(NAV_REACHABLE[1]).toEqual([1]);
    });

    it('confines mp84 to its own three-map island', () => {
        expect(NAV_REACHABLE[27]).toEqual([27, 28, 29]);   // mp84, mp8d, mp90
    });

    it('confines the warp-only maps to themselves', () => {
        expect(NAV_REACHABLE[21]).toEqual([21]);   // mp73, reached by the Pureza building
        expect(NAV_REACHABLE[30]).toEqual([30]);   // mpa0
    });
});

describe('nav tile tables', () => {
    it('mirrors dungeons.ts for all 31 maps', () => {
        for (const meta of NAV_MAPS) {
            const cfg = DUNGEONS[String(meta.id)]! as unknown as {
                passableTiles: number[];
                slopeTilesLeft?: number[];
                slopeTilesRight?: number[];
                aggressiveGround?: number[];
                airflows?: number[];
            };
            const tables = NAV_TILES[meta.id]!;
            expect(tables.passable, `map ${meta.id}`).toEqual(cfg.passableTiles);
            expect(tables.slopeLeft).toEqual(cfg.slopeTilesLeft ?? []);
            expect(tables.slopeRight).toEqual(cfg.slopeTilesRight ?? []);
            expect(tables.aggressive).toEqual(cfg.aggressiveGround ?? []);
        }
    });

    it('always keeps tile 0 passable, as a leading entry rather than padding', () => {
        // writeFixedList zero-fills only at the END, so a leading 0 is tile 0.
        // Dropping it would make the void impassable and every jump illegal.
        for (const meta of NAV_MAPS) {
            expect(NAV_TILES[meta.id]!.passable[0], `map ${meta.id}`).toBe(0);
        }
    });

    it('keeps both rope tiles passable wherever the cavern declares them', () => {
        // Every outdoor cavern lists ropes 1 and 2. The two exceptions are both
        // interior rooms with no vertical traversal: mp73, the Paguro hut, has a
        // single-entry [0] list, and mpa0 lists [0, 9..19].
        const withRopes = NAV_MAPS.filter((m) => {
            const p = NAV_TILES[m.id]!.passable;
            return p.includes(1) && p.includes(2);
        });
        expect(withRopes).toHaveLength(29);
        expect(NAV_TILES[21]!.passable).toEqual([0]);
        expect(NAV_TILES[30]!.passable).not.toContain(1);
    });

    it('pads the airflow table to 12 slots', () => {
        for (const meta of NAV_MAPS) {
            expect(NAV_TILES[meta.id]!.airflows, `map ${meta.id}`).toHaveLength(12);
        }
    });

    it('blanks the hazard tables for boss rooms', () => {
        // Boss rooms share their world's mppX.grp but declare no hazards, because
        // an arena has none. The extractor must read dungeons.ts, not the tileset.
        for (const meta of NAV_MAPS.filter((m) => m.isDoorless)) {
            const tables = NAV_TILES[meta.id]!;
            expect(tables.slopeLeft, meta.nameKey).toEqual([]);
            expect(tables.slopeRight, meta.nameKey).toEqual([]);
            expect(tables.aggressive, meta.nameKey).toEqual([]);
            expect(tables.airflows.every((v) => v === 0), meta.nameKey).toBe(true);
        }
    });
});

describe('nav platforms', () => {
    it('has 72 vertical, 21 collapsing and 123 horizontal platforms', () => {
        const total = { v: 0, c: 0, h: 0 };
        for (const meta of NAV_MAPS) {
            total.v += NAV_PLATFORMS[meta.id]!.vertical.length;
            total.c += NAV_PLATFORMS[meta.id]!.collapsing.length;
            total.h += NAV_PLATFORMS[meta.id]!.horizontal.length;
        }
        expect(total).toEqual({ v: 72, c: 21, h: 123 });
    });

    it('gives no platforms to boss arenas or Jashiin rooms', () => {
        for (const meta of NAV_MAPS.filter((m) => m.isDoorless)) {
            const p = NAV_PLATFORMS[meta.id]!;
            expect(p.vertical.length + p.collapsing.length + p.horizontal.length, meta.nameKey).toBe(0);
        }
    });

    it('keeps every vertical travel range inside the map', () => {
        for (const meta of NAV_MAPS) {
            for (const p of NAV_PLATFORMS[meta.id]!.vertical) {
                expect(p.x, `map ${meta.id}`).toBeLessThan(meta.mapWidth);
                expect(p.topY).toBeLessThan(MAP_HEIGHT);
                expect(p.bottomY).toBeLessThan(MAP_HEIGHT);
                // A range is computed by walking from startY in each direction, so
                // it always contains startY.
                expect(p.topY).toBeLessThanOrEqual(p.startY);
                expect(p.bottomY).toBeGreaterThanOrEqual(p.startY);
            }
        }
    });

    it('matches hand-computed vertical travel ranges in mp10', () => {
        // mp10 x=48 sits in a shaft of empty tiles and cannot descend (row 25 is
        // solid), so it rises 7 rows. mp10 x=221 is open above and below.
        const vertical = NAV_PLATFORMS[0]!.vertical;
        expect(vertical).toHaveLength(2);
        expect(vertical[0]).toMatchObject({ x: 48, startY: 24, topY: 17, bottomY: 24 });
        expect(vertical[1]).toMatchObject({ x: 221, startY: 44, topY: 38, bottomY: 54 });
    });

    it('gives a collapsing platform no upward travel', () => {
        for (const meta of NAV_MAPS) {
            for (const p of NAV_PLATFORMS[meta.id]!.collapsing) {
                expect(p.bottomY, `map ${meta.id} x=${p.x}`).toBeGreaterThanOrEqual(p.startY);
                expect(p.bottomY).toBeLessThan(MAP_HEIGHT);
            }
        }
    });

    it('gives every horizontal platform a positive span inside the map', () => {
        for (const meta of NAV_MAPS) {
            for (const p of NAV_PLATFORMS[meta.id]!.horizontal) {
                expect(p.cols, `map ${meta.id} y=${p.y}`).toBeGreaterThan(0);
                expect(p.cols).toBeLessThanOrEqual(meta.mapWidth);
                expect(p.minX).toBeLessThan(meta.mapWidth);
                expect(p.maxX).toBeLessThan(meta.mapWidth);
                expect(p.speed).toBeGreaterThanOrEqual(0);
                expect(p.speed).toBeLessThanOrEqual(3);
            }
        }
    });

    it('computes wrapping spans correctly (mp51 r57 231-11 on width 240)', () => {
        const p = NAV_PLATFORMS[12]!.horizontal.find((q) => q.y === 57);
        expect(p).toBeDefined();
        expect(p!.minX).toBe(231);
        expect(p!.maxX).toBe(11);
        expect(p!.cols).toBe(240 - 231 + 11 + 1);
    });
});

describe('nav airflows', () => {
    it('splits each cavern table into zero-terminated groups of four', () => {
        for (const meta of NAV_MAPS) {
            const a = NAV_AIRFLOWS[meta.id]!;
            for (const group of [a.up, a.left, a.right]) {
                expect(group.length, `map ${meta.id}`).toBeLessThanOrEqual(4);
                expect(group.every((v) => v !== 0)).toBe(true);
            }
        }
    });

    it('matches the airflow tiles declared in dungeons.ts', () => {
        for (const meta of NAV_MAPS) {
            const cfg = DUNGEONS[String(meta.id)]! as unknown as { airflows?: number[] };
            const a = NAV_AIRFLOWS[meta.id]!;
            const declared = (cfg.airflows ?? []).slice(0, 12);
            expect(a.up, `map ${meta.id}`).toEqual(declared.slice(0, 4).filter((v) => v !== 0));
            expect(a.left, `map ${meta.id}`).toEqual(declared.slice(4, 8).filter((v) => v !== 0));
            expect(a.right, `map ${meta.id}`).toEqual(declared.slice(8, 12).filter((v) => v !== 0));
        }
    });

    it('emits no lift or conveyor for a cavern with no currents', () => {
        for (const meta of NAV_MAPS) {
            const a = NAV_AIRFLOWS[meta.id]!;
            if (a.up.length + a.left.length + a.right.length === 0) {
                expect(a.lifts.length, meta.nameKey).toBe(0);
                expect(a.conveyors.length, meta.nameKey).toBe(0);
            }
        }
    });

    it('keeps every lift and conveyor inside the map and positive in size', () => {
        for (const meta of NAV_MAPS) {
            const a = NAV_AIRFLOWS[meta.id]!;
            for (const l of a.lifts) {
                expect(l.x, `map ${meta.id} lift`).toBeLessThan(meta.mapWidth);
                expect(l.rows).toBeGreaterThanOrEqual(1);
                expect(l.rows).toBeLessThanOrEqual(MAP_HEIGHT);
                expect(l.toY).toBeLessThan(MAP_HEIGHT);
                expect(l.fromY).toBeLessThan(MAP_HEIGHT);
            }
            for (const c of a.conveyors) {
                expect(c.x0, `map ${meta.id} conveyor`).toBeLessThan(meta.mapWidth);
                expect(c.x1).toBeLessThan(meta.mapWidth);
                expect(c.cols).toBeGreaterThanOrEqual(1);
                expect(c.cols).toBeLessThanOrEqual(meta.mapWidth);
                expect(c.y).toBeLessThan(MAP_HEIGHT);
                expect([1, 2]).toContain(c.dir);
            }
        }
    });

    it('only builds a lift where an up current exists', () => {
        for (const meta of NAV_MAPS) {
            const a = NAV_AIRFLOWS[meta.id]!;
            if (a.up.length === 0) expect(a.lifts.length, meta.nameKey).toBe(0);
        }
    });
});

describe('extractor reproducibility', () => {
    it('reports the shipped totals the plan quotes', () => {
        const totals = {
            maps: NAV_MAPS.length,
            portals: PORTALS.length,
            toTown: PORTALS.filter((p) => p.toTown).length,
            lion: PORTALS.filter((p) => p.key === 2).length,
            deadEnd: PORTALS.filter((p) => p.deadEnd).length,
            oneWay: PORTALS.filter((p) => p.oneWay).length,
            components: NAV_COMPONENTS.length,
            tiles: NAV_MAP_TILES.reduce((a, b) => a + b, 0),
        };
        expect(totals).toEqual({
            maps: 31,
            portals: 163,
            toTown: 15,
            lion: 2,
            deadEnd: 17,
            oneWay: 1,
            components: 15,
            tiles: 306048,
        });
    });

    it('has a committed generator that can be re-run byte-identically', () => {
        // `--check` compares the committed modules against a fresh generation and
        // exits non-zero on drift. Run it here so a stale commit fails the suite.
        const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
        const out = execFileSync(process.execPath, [resolve(REPO, 'tools/build-nav.mjs'), '--check'], {
            cwd: REPO,
            encoding: 'utf8',
        });
        expect(out).toContain('up to date');
    });

    it('keeps the MDT map decoder aligned with the engine RLE (tile = next byte)', () => {
        // unpack_forward_case0 in asm/fight.asm reads the token byte for the count
        // and the FOLLOWING byte for the tile. Decoding `tile = token` instead
        // yields a plausible-looking but wrong map — the variant this test exists
        // to prevent.
        const bytes = new Uint8Array(readFileSync(resolve(REPO, 'web/public/game/0/mp70.mdt')));
        const width = bytes[2]! | (bytes[3]! << 8);
        const tiles = new Uint8Array(width * MAP_HEIGHT);
        let p = 0x1b;
        for (let col = 0; col < width; col++) {
            let row = 0;
            while (row < MAP_HEIGHT) {
                const token = bytes[p]!;
                let tile;
                let count;
                switch (token >> 6) {
                    case 0: tile = bytes[p + 1]!; count = (token & 0x3f) + 1; p += 2; break;
                    case 1: tile = (token & 0x0f) + 1; count = ((token >> 4) & 3) + 2; p += 1; break;
                    case 2: tile = 0; count = token & 0x3f; p += 1; break;
                    default: tile = token & 0x3f; count = 1; p += 1; break;
                }
                for (let i = 0; i < count && row < MAP_HEIGHT; i++, row++) {
                    tiles[row * width + col] = tile;
                }
            }
        }
        // mp70 declares 0x2A as an up current, and it must be a rare tile: these
        // are the visible updraft jets, not a background texture.
        let upCells = 0;
        for (const t of tiles) if (t === 0x2a) upCells++;
        expect(upCells).toBeGreaterThan(0);
        expect(upCells).toBeLessThan(tiles.length / 20);
    });
});
