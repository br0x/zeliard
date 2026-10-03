/**
 * nav-platform-model.test.ts — the runtime platform model (phase 2).
 *
 * The model turns pre-calculated platform tables into ride slots, so the risk is
 * that a slot is emitted where the hero could not actually stand, or that a
 * platform is given ride edges despite being unable to deliver him. Both are
 * checked here against the decoded map rather than against the tables.
 *
 * The engine's own rules come from dungeon-vertical.ts and dungeon-platforms.ts;
 * docs/PATHFINDER_PLAN.md §2.7 and §7.4 have the full derivations.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    buildPlatformModel, isLandingSlot, REASON_FROZEN, REASON_SINGLE_ROW, REASON_UNCLEAR_SPAN,
} from '../src/engine/nav/platforms.js';
import {
    flagsAt, groundBelow, heroBoxFree, heroInLift, isStanding, wrapCol, wrapRow,
} from '../src/engine/nav/geometry.js';
import { NavTileClassifier } from '../src/engine/nav/attributes.js';
import { blocksBody } from '../src/engine/nav/types.js';
import { decodeTileGrid, type NavTileGrid } from '../src/engine/nav/mdt-grid.js';
import { NAV_PLATFORMS } from '../src/data/nav/nav-platforms.js';
import { NAV_MAP_BY_ID, NAV_MAPS } from '../src/data/nav/nav-maps.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gridFor = (mapId: number): NavTileGrid => {
    const meta = NAV_MAP_BY_ID.get(mapId)!;
    return decodeTileGrid(
        new Uint8Array(readFileSync(resolve(REPO, `web/public/game/0/${meta.nameKey}.mdt`))),
        0,
        mapId,
    );
};

/** Every map that has at least one platform. */
const platformMaps = NAV_MAPS.filter((m) => {
    const t = NAV_PLATFORMS[m.id]!;
    return t.vertical.length + t.collapsing.length + t.horizontal.length > 0;
});

describe('geometry predicates', () => {
    it('wraps both axes', () => {
        expect(wrapRow(0)).toBe(0);
        expect(wrapRow(64)).toBe(0);
        expect(wrapRow(-1)).toBe(63);
        expect(wrapCol(-1, 100)).toBe(99);
        expect(wrapCol(100, 100)).toBe(0);
    });

    it('agrees with itself: standing means held up, with his middle column open', () => {
        // Not "the whole 3x3 is clear". The engine never asks that: the landing
        // check reads one cell under his middle foot, a rise reads one cell above
        // it, a step reads one column, and the descent reads nothing — so the hero
        // comes to rest with a *side* in rock (mp80's pit at (175,51) is drawn on
        // the player's route) and can fall through a floor. What the engine does
        // assume is his middle column, so that is what standing has to mean.
        const grid = gridFor(0);
        const classifier = NavTileClassifier.forMap(0);
        for (let row = 0; row < 64; row += 7) {
            for (let col = 0; col < 240; col += 11) {
                if (!isStanding(grid, classifier, col, row)) continue;
                for (let j = 0; j < 3; j++) {
                    const f = flagsAt(grid, classifier, col + 1, row + j);
                    expect(blocksBody(f), `(${col},${row}) middle row ${j}`).toBe(false);
                }
                const held = groundBelow(grid, classifier, col, row)
                    || heroInLift(grid, classifier, col, row);
                expect(held, `(${col},${row}) held up`).toBe(true);
            }
        }
    });

    it('finds standing positions on the biggest cavern', () => {
        const grid = gridFor(8);   // mp40, 320 wide
        const classifier = NavTileClassifier.forMap(8);
        let found = 0;
        for (let row = 0; row < 64; row++) {
            for (let col = 0; col < 320; col++) {
                if (isStanding(grid, classifier, col, row)) found++;
            }
        }
        expect(found).toBeGreaterThan(1000);
    });
});

describe('ride slots are positions the hero can actually occupy', () => {
    it('emits only slots whose box is free', () => {
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const classifier = NavTileClassifier.forMap(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            for (const slot of model.slots) {
                expect(
                    heroBoxFree(grid, classifier, slot.leftCol, slot.headRow),
                    `${meta.nameKey} slot (${slot.leftCol},${slot.headRow})`,
                ).toBe(true);
            }
        }
    });

    it('places every slot 3 rows above its platform row', () => {
        // findPlatformUnderHero puts the feet row on the platform row.
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            for (const slot of model.slots) {
                const expectedRow = wrapRow(slot.pos - 3);
                if (slot.kind === 2) continue;   // horizontal slots index by column
                expect(slot.headRow, `${meta.nameKey}`).toBe(expectedRow);
            }
        }
    });

    it('keeps a horizontal slot within one column of the platform cell', () => {
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            for (const slot of model.slots) {
                if (slot.kind !== 2) continue;
                const delta = ((slot.leftCol - slot.pos + meta.mapWidth / 2) % meta.mapWidth + meta.mapWidth)
                    % meta.mapWidth - meta.mapWidth / 2;
                expect([-1, 0, 1], `${meta.nameKey} slot offset`).toContain(Math.round(delta));
            }
        }
    });

    it('reports every slot under the platform it belongs to', () => {
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            expect(model.slotsByPlatform.length,
                `${meta.nameKey} platform count`).toBe(
                NAV_PLATFORMS[meta.id]!.vertical.length
                + NAV_PLATFORMS[meta.id]!.collapsing.length
                + NAV_PLATFORMS[meta.id]!.horizontal.length,
            );
            for (const indices of model.slotsByPlatform) {
                for (const index of indices) {
                    expect(model.slots[index]!.platform).toBeDefined();
                }
            }
        }
    });
});

describe('ride adjacency', () => {
    it('links neighbours both ways and never links across platforms', () => {
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            model.slots.forEach((slot, index) => {
                if (slot.next !== -1) {
                    const other = model.slots[slot.next]!;
                    // The link is mutual, and it stays inside one platform.
                    expect(other.prev, `${meta.nameKey} back-link from ${index}`)
                        .toBe(index);
                    expect(other.platform, `${meta.nameKey} cross-platform link`).toBe(slot.platform);
                }
                if (slot.prev !== -1) {
                    const other = model.slots[slot.prev]!;
                    expect(other.next, `${meta.nameKey} forward-link`).toBe(index);
                    expect(other.platform).toBe(slot.platform);
                }
                // A slot never links to itself.
                expect(slot.next).not.toBe(index);
                expect(slot.prev).not.toBe(index);
            });
        }
    });

    it('gives a vertical platform a chain spanning its travel range', () => {
        // mp10 x=48 travels rows 17..24, so a chain of up to eight slots.
        const grid = gridFor(0);
        const model = buildPlatformModel(0, grid);
        const tables = NAV_PLATFORMS[0]!;
        const index = tables.vertical.findIndex((p) => p.x === 48 && p.startY === 24);
        expect(index).toBeGreaterThanOrEqual(0);
        const p = tables.vertical[index]!;
        const indices = model.slotsByPlatform[index]!;
        expect(indices.length).toBeGreaterThan(0);
        const rows = indices.map((i) => model.slots[i]!.pos).sort((a, b) => a - b);
        expect(Math.min(...rows)).toBeGreaterThanOrEqual(p.topY);
        expect(Math.max(...rows)).toBeLessThanOrEqual(p.bottomY);
    });

    it('gives a collapsing platform no upward ride', () => {
        for (const meta of platformMaps) {
            const tables = NAV_PLATFORMS[meta.id]!;
            if (tables.collapsing.length === 0) continue;
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            let collapsingPlatforms = tables.vertical.length;
            for (let i = 0; i < tables.collapsing.length; i++) {
                const index = collapsingPlatforms++;
                const indices = model.slotsByPlatform[index]!;
                for (const slotIndex of indices) {
                    const slot = model.slots[slotIndex]!;
                    if (slot.next !== -1) {
                        const other = model.slots[slot.next]!;
                        // The sweep is downstream only: the next row is lower.
                        expect(other.pos, `${meta.nameKey} descends`).toBeGreaterThan(slot.pos);
                    }
                }
            }
        }
    });

    it('never links a horizontal platform to itself out of order', () => {
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            for (const slot of model.slots) {
                if (slot.kind !== 2 || slot.next === -1) continue;
                const a = slot.pos;
                const b = model.slots[slot.next]!.pos;
                const delta = ((b - a + meta.mapWidth / 2) % meta.mapWidth + meta.mapWidth)
                    % meta.mapWidth - meta.mapWidth / 2;
                expect(Math.abs(Math.round(delta)), `${meta.nameKey} step`).toBe(1);
            }
        }
    });
});

describe('platforms that must not move the hero', () => {
    it('leaves no frozen horizontal platform moving, and the data has none', () => {
        // speed 0 means "frozen" and the platform is a static ledge. No shipped
        // tileset uses it — every one of the 123 horizontal platforms is speed 1
        // or 2 — so the branch is defensive. What matters is that if one ever did
        // appear it would be inert, and that the data has no frozen platform today.
        const speeds = new Set<number>();
        for (const meta of platformMaps) {
            for (const p of NAV_PLATFORMS[meta.id]!.horizontal) speeds.add(p.speed);
        }
        expect([...speeds].sort()).toEqual([1, 2]);

        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            const tables = NAV_PLATFORMS[meta.id]!;
            const base = tables.vertical.length + tables.collapsing.length;
            for (const entry of model.inertPlatforms) {
                if (entry.platform < base) continue;
                // A horizontal platform can be inert for two reasons: frozen, or a
                // span it could slide out from under. Nothing else applies.
                expect([REASON_FROZEN, REASON_UNCLEAR_SPAN],
                    `${meta.nameKey} platform ${entry.platform}`).toContain(entry.reason);
            }
            expect(model.inertPlatforms.filter((x) => x.reason === REASON_FROZEN)).toHaveLength(0);
        }
    });

    it('marks a platform with fewer than two rideable rows as unable to move', () => {
        // Some vertical platforms really do have a one-row range: a fixed ledge
        // the hero stands on, not a lift. Count them from the data rather than
        // assuming, so the branch is known to be exercised.
        let oneRowPlatforms = 0;
        for (const meta of NAV_MAPS) {
            for (const p of NAV_PLATFORMS[meta.id]!.vertical) {
                if (p.bottomY - p.topY + 1 === 1) oneRowPlatforms++;
            }
        }
        expect(oneRowPlatforms).toBeGreaterThan(0);

        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            for (const entry of model.inertPlatforms) {
                if (entry.reason !== REASON_SINGLE_ROW) continue;
                expect(model.slotsByPlatform[entry.platform]!.length,
                    `${meta.nameKey} platform ${entry.platform}`).toBeLessThan(2);
            }
        }
    });

    it('still rides a platform where only part of the span fits', () => {
        // The carry call can fail while the platform moves on, so a ride must never
        // link two columns that both fit when they are the same. But refusing the
        // WHOLE platform because one column of a thirteen-wide span is clipped is
        // far too blunt: it threw away the platform mp80's upper route is built
        // around. A column where the hero's body does not fit simply has no slot.
        let rideable = 0;
        let refusedForSpan = 0;
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            rideable += model.slots.length;
            for (const entry of model.inertPlatforms) {
                if (entry.reason === REASON_UNCLEAR_SPAN) refusedForSpan++;
            }
        }
        // [measured] 5,589 ride slots; no platform is refused for an unclear span.
        expect(rideable).toBeGreaterThan(5000);
        expect(refusedForSpan).toBe(0);
    });

    it('gives every platform either slots or a recorded reason', () => {
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            for (let i = 0; i < model.slotsByPlatform.length; i++) {
                if (model.slotsByPlatform[i]!.length === 0) {
                    expect(
                        model.inertPlatforms.some((x) => x.platform === i),
                        `${meta.nameKey} platform ${i} has neither slots nor a reason`,
                    ).toBe(true);
                }
            }
        }
    });
});

describe('a platform is a thing, not a place', () => {
    /** Columns carrying more than one lift, which the live row cannot separate. */
    const sharedColumns = (): Map<number, Set<number>> => {
        const out = new Map<number, Set<number>>();
        for (const meta of platformMaps) {
            const seen = new Set<number>();
            const shared = new Set<number>();
            for (const p of [...NAV_PLATFORMS[meta.id]!.vertical, ...NAV_PLATFORMS[meta.id]!.collapsing]) {
                const col = wrapCol(p.x, meta.mapWidth);
                if (seen.has(col)) shared.add(col);
                seen.add(col);
            }
            out.set(meta.id, shared);
        }
        return out;
    };

    it('marks exactly the tiles the lifts are standing on, as solid', () => {
        // Nothing in the MDT says a platform is there: its position is engine memory.
        // The three tiles it currently occupies are rock, and a flight through them is
        // a route the hero cannot fly.
        for (const meta of platformMaps) {
            const grid = gridFor(meta.id);
            const model = buildPlatformModel(meta.id, grid);
            const at = (col: number, row: number): boolean =>
                model.restingCells[row * meta.mapWidth + wrapCol(col, meta.mapWidth)] === 1;
            // The whole mask is exactly the union of the lifts' three tiles, so a
            // horizontal platform contributes none of it: it sweeps its span and there
            // is no column to pin it to, so pinning one would draw a wall that is gone
            // a frame later.
            const want = new Set<string>();
            for (const p of [...NAV_PLATFORMS[meta.id]!.vertical, ...NAV_PLATFORMS[meta.id]!.collapsing]) {
                for (let i = 0; i < 3; i++) want.add(`${wrapCol(p.x + i, meta.mapWidth)},${p.startY}`);
            }
            const got: string[] = [];
            for (let row = 0; row < 64; row++) {
                for (let col = 0; col < meta.mapWidth; col++) {
                    if (at(col, row)) got.push(`${col},${row}`);
                }
            }
            expect([...got].sort(), meta.nameKey).toEqual([...want].sort());
        }
    });

    it('puts every lift at its startY until something says otherwise', () => {
        const shared = sharedColumns();
        for (const meta of platformMaps) {
            const model = buildPlatformModel(meta.id, gridFor(meta.id));
            for (const p of [...NAV_PLATFORMS[meta.id]!.vertical, ...NAV_PLATFORMS[meta.id]!.collapsing]) {
                const col = wrapCol(p.x, meta.mapWidth);
                if (shared.get(meta.id)!.has(col)) continue;   // two lifts, one key
                expect(model.places.get(col), `${meta.nameKey} at ${col}`).toBe(p.startY);
            }
        }
    });

    it('follows a live row, and the solid tiles move with it', () => {
        // The hero drives a lift up and it stays where he left it, so the model has to
        // be told rather than assume. mp80's column 1 lift is the reported case.
        const meta = NAV_MAP_BY_ID.get(23)!;
        const grid = gridFor(23);
        const p = NAV_PLATFORMS[23]!.vertical.find((v) => v.x === 1)!;
        expect(p.startY, 'the lift rests at row 34, where the bad arc went through it')
            .toBe(34);
        const moved = buildPlatformModel(23, grid, new Map([[1, p.topY]]));
        const at = (col: number, row: number): boolean =>
            moved.restingCells[row * meta.mapWidth + col] === 1;
        expect(moved.places.get(1)).toBe(p.topY);
        for (let i = 0; i < 3; i++) {
            expect(at(1 + i, p.topY), `lift raised to (${1 + i},${p.topY})`).toBe(true);
            expect(at(1 + i, 34), `the row it left, (${1 + i},34)`).toBe(false);
        }
    });

    it('offers a landing only on the row the platform is standing at', () => {
        // A platform is three solid tiles and the hero comes down on top of it, so the
        // row it is at is the only one he can land on. Every other row of its travel is
        // reachable by riding and not by jumping — which is what used to offer mp80's
        // lift at row 34 to a hero standing at row 20.
        const shared = sharedColumns();
        let pinned = 0;
        let horizontal = 0;
        let lifts = 0;
        for (const meta of platformMaps) {
            const model = buildPlatformModel(meta.id, gridFor(meta.id));
            for (const slot of model.slots) {
                if (slot.kind === 2) {
                    horizontal++;
                    expect(isLandingSlot(model, slot, meta.mapWidth),
                        `${meta.nameKey} horizontal (${slot.leftCol},${slot.headRow})`).toBe(true);
                    continue;
                }
                const col = wrapCol(slot.leftCol, meta.mapWidth);
                if (shared.get(meta.id)!.has(col)) continue;
                const atRest = model.places.get(col) === slot.pos;
                expect(isLandingSlot(model, slot, meta.mapWidth),
                    `${meta.nameKey} slot (${slot.leftCol},${slot.headRow}) pos ${slot.pos}`).toBe(atRest);
                if (atRest) pinned++;
            }
            for (const p of [...NAV_PLATFORMS[meta.id]!.vertical, ...NAV_PLATFORMS[meta.id]!.collapsing]) {
                const col = wrapCol(p.x, meta.mapWidth);
                if (shared.get(meta.id)!.has(col)) continue;
                lifts++;
            }
        }
        // At most one row per lift, against thousands of ride slots and a whole game's
        // worth of horizontal span. Two lifts in the game stand somewhere the hero's
        // body does not fit, so they have no slot at all and pin nothing.
        expect(pinned).toBe(lifts - 2);
        expect(horizontal).toBeGreaterThan(1000);
    });

    it('cannot separate two lifts that share a column', () => {
        // The live row is read as `{ absX, y }` entries keyed by column, so a cavern
        // with two lifts in one column cannot say which is where, and only the last one
        // read is pinned. Named here so the three slots it costs are a known quantity
        // rather than a surprise.
        const shared: string[] = [];
        for (const meta of platformMaps) {
            const seen = new Set<number>();
            for (const p of [...NAV_PLATFORMS[meta.id]!.vertical, ...NAV_PLATFORMS[meta.id]!.collapsing]) {
                const col = wrapCol(p.x, meta.mapWidth);
                if (seen.has(col)) shared.push(`${meta.nameKey}:${col}`);
                seen.add(col);
            }
        }
        expect([...new Set(shared)]).toEqual(['mp20:157', 'mp61:63', 'mp82:184']);
    });
});

describe('the largest cave', () => {
    it('models mp60, which has the most platforms of any map', () => {
        const tables = NAV_PLATFORMS[14]!;
        const total = tables.vertical.length + tables.collapsing.length + tables.horizontal.length;
        expect(total).toBe(20);
        const model = buildPlatformModel(14, gridFor(14));
        expect(model.slots.length).toBeGreaterThan(0);
        expect(model.slots.length).toBeLessThanOrEqual(total * 64);
    });

    it('models mp83, which has every family at once', () => {
        const tables = NAV_PLATFORMS[26]!;
        expect(tables.vertical.length).toBeGreaterThan(0);
        expect(tables.collapsing.length).toBeGreaterThan(0);
        expect(tables.horizontal.length).toBeGreaterThan(0);
        const model = buildPlatformModel(26, gridFor(26));
        const kinds = new Set(model.slots.map((s) => s.kind));
        expect(kinds.size).toBeGreaterThanOrEqual(2);
    });
});

describe('maps without platforms', () => {
    it('produces an empty model for every boss arena and warp-only room', () => {
        for (const meta of NAV_MAPS.filter((m) => m.isDoorless)) {
            const model = buildPlatformModel(meta.id, gridFor(meta.id));
            expect(model.slots, meta.nameKey).toHaveLength(0);
            expect(model.inertPlatforms, meta.nameKey).toHaveLength(0);
        }
    });

    it('rejects a map with no generated tables', () => {
        expect(() => buildPlatformModel(999, gridFor(0))).toThrow(/no generated platform tables/);
    });
});
