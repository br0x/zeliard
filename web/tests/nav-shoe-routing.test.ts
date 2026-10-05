/**
 * nav-shoe-routing.test.ts — a pair of shoes is a pickup, and a route may fetch one.
 *
 * The mechanic, as the player has it: shoes are items lying in the cavern. Walking over
 * one puts it in the hero's inventory (`put_shoes_to_inventory`,
 * engine/dungeon-items.ts:182-187) and it **stays** — he may wear whichever pair he is
 * carrying, or none, and changing costs nothing and takes no time. A key is the
 * opposite: it opens one ordinary door, is gone, and that door is then open for good.
 *
 * So collecting a pair is not spending a resource, it is *widening* what the hero can
 * do for the rest of the route, and the state the search carries is a set rather than a
 * count. That is what these check, along with the fact that the pair fetched is the one
 * the gated edge asks for.
 *
 * The journey is found from the graph rather than written down, because it has to be a
 * *standing position* on both ends — the pair's record cell is not one, which is the
 * same offset every key in the game has, and hard-coding coordinates here would paper
 * over that.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NavGraphStore, findRoute } from '../src/engine/nav/pathfinder.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import { CAP } from '../src/engine/nav/types.js';
import type { NavGraph } from '../src/engine/nav/nav-graph.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import {
    NAV_ACCESSORIES, NAV_SHOE_LABEL, type NavShoe,
} from '../src/data/nav/nav-accessories.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const store = new NavGraphStore((id) => {
    const meta = NAV_MAP_BY_ID.get(id);
    if (!meta) return null;
    return new Uint8Array(readFileSync(resolve(REPO, `web/public/${meta.mdtPath}`)));
});

const CAP_OF_BIT = [CAP.JUMP_HIGH, CAP.GROUND_SAFE, CAP.SLOPE_STAND, CAP.ICE_SAFE];

/** The mask a set of carried pairs unlocks, on top of what the hero wears. */
function maskWith(shoes: number): number {
    let mask = CAP.CLIMB;
    for (let i = 0; i < CAP_OF_BIT.length; i++) {
        if ((shoes & (1 << i)) !== 0) mask |= CAP_OF_BIT[i]!;
    }
    return mask;
}

interface Journey {
    readonly mapId: number;
    readonly start: { col: number; row: number };
    readonly goal: { col: number; row: number };
    readonly shoe: NavShoe;
    readonly pairCell: { col: number; row: number };
    /** Ground nodes a bare hero from the start cannot reach, and the pair opens. */
    readonly opened: number;
    readonly bareReaches: number;
}

/**
 * A journey in some cavern that only walking over a pair of shoes opens.
 *
 * Found rather than written down: flood `(node, pairs-carried)` from each standing
 * position and keep the first start where the pair opens ground nodes bare feet cannot.
 * A pair under the hero's feet is never credited — the game has already collected it —
 * so the start must be somewhere else, which is what makes it a detour.
 */
function findJourney(): Journey | null {
    let best: Journey | null = null;
    for (const [idStr, list] of Object.entries(NAV_ACCESSORIES)) {
        const mapId = Number(idStr);
        const g = store.get(mapId)!;
        const shoe = list[0]!.shoe;
        let pairNode = -1;
        for (let n = 0; n < g.nodes.length; n++) if (g.accessoryShoeAt[n] === shoe) pairNode = n;
        if (pairNode < 0) continue;
        const pairCell = { col: g.nodes[pairNode]!.col, row: g.nodes[pairNode]!.row };

        for (let start = 0; start < g.nodes.length; start++) {
            if (start === pairNode || g.nodes[start]!.kind !== 0) continue;
            const bare = new Uint8Array(g.nodes.length);
            const all = new Uint8Array(g.nodes.length);
            const seen = new Set<number>();
            const stack: Array<[number, number]> = [[start, 0]];
            seen.add(start * 16);
            while (stack.length) {
                const [n, shoes] = stack.pop()!;
                if (shoes === 0) bare[n] = 1;
                else all[n] = 1;
                const mask = maskWith(shoes);
                for (let i = g.edgeOffsets[n]!; i < g.edgeOffsets[n + 1]!; i++) {
                    const e = g.edges[i]!;
                    if ((e.req & ~mask) !== 0) continue;
                    if ((g.nodeHazard[e.to]! & 1) !== 0) continue;
                    const pair = g.accessoryShoeAt[e.to]!;
                    const next = pair !== 0 ? shoes | (1 << (pair - 1)) : shoes;
                    const key = e.to * 16 + next;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    stack.push([e.to, next]);
                }
            }
            let goal = -1;
            let opened = 0;
            for (let n = 0; n < g.nodes.length; n++) {
                if (!all[n] || bare[n] || g.nodes[n]!.kind !== 0) continue;
                opened++;
                if (goal < 0) goal = n;
            }
            if (goal < 0) continue;
            let bareReaches = 0;
            for (const v of bare) if (v) bareReaches++;
            const candidate: Journey = {
                mapId,
                start: { col: g.nodes[start]!.col, row: g.nodes[start]!.row },
                goal: { col: g.nodes[goal]!.col, row: g.nodes[goal]!.row },
                shoe,
                pairCell,
                opened,
                bareReaches,
            };
            if (!best || candidate.opened > best.opened) best = candidate;
        }
    }
    return best;
}

const JOURNEY = findJourney();

describe('a pair on the floor', () => {
    it('lands on a standing position in its cavern', () => {
        for (const [idStr, list] of Object.entries(NAV_ACCESSORIES)) {
            const g = store.get(Number(idStr)) as NavGraph;
            const on = list.filter((a) => g.accessoryShoeAt.includes(a.shoe)).length;
            expect(on, `cavern ${idStr}: ${list.length} pairs, ${on} on nodes`).toBe(list.length);
            expect(g.diagnostics.shoesDropped, `cavern ${idStr} dropped one`).toBe(0);
        }
    });
});

describe('collecting a pair', () => {
    it('there is a journey somewhere that only a pair opens', () => {
        // The premise of every test below. [measured] the Feruza pair in mp62 is the
        // largest: from a start beside it a bare hero reaches 63 of the cavern's 268
        // nodes, and the same hero who walks over the pair reaches all 268.
        expect(JOURNEY, 'a journey only a pair of shoes opens').not.toBeNull();
        expect(JOURNEY!.opened).toBeGreaterThan(0);
    });

    it('a route that walks to the pair, puts it on, and carries on', () => {
        const j = JOURNEY!;
        const route = findRoute({
            store, caps: bareCapabilities(), maps: [j.mapId], collectAccessories: true,
            start: { mapId: j.mapId, ...j.start }, goal: { mapId: j.mapId, ...j.goal },
        });
        expect(route, 'collecting the pair reaches a destination bare feet cannot').not.toBeNull();
        // The pair named is the one the gated edges ask for. The route spells the
        // label in lower case, as the rest of its output does.
        expect(route!.equipment.map((e) => e.label.toLowerCase()))
            .toEqual([NAV_SHOE_LABEL[j.shoe].toLowerCase()]);
        // And it went and got it rather than assuming it: the pickup's cell is in the
        // route, and it is not the first cell.
        const at = route!.points.findIndex(
            (p) => p.col === j.pairCell.col && p.row === j.pairCell.row,
        );
        expect(at, `the route passes (${j.pairCell.col},${j.pairCell.row})`).toBeGreaterThan(0);
    });

    it('is off by default, so every other route keeps its meaning', () => {
        const j = JOURNEY!;
        const start = { mapId: j.mapId, ...j.start };
        const goal = { mapId: j.mapId, ...j.goal };
        expect(findRoute({ store, caps: bareCapabilities(), maps: [j.mapId], start, goal }),
            'bare feet cannot make this journey').toBeNull();
        expect(findRoute({
            store, caps: bareCapabilities(), maps: [j.mapId], collectAccessories: true, start, goal,
        }), 'fetching the pair can').not.toBeNull();
    });

    it('a pair the player has already taken is not fetched', () => {
        const j = JOURNEY!;
        const gone = findRoute({
            store, caps: bareCapabilities(), maps: [j.mapId], collectAccessories: true,
            shoePresent: () => false,
            start: { mapId: j.mapId, ...j.start }, goal: { mapId: j.mapId, ...j.goal },
        });
        expect(gone, 'no pair on the floor means no route').toBeNull();
    });

    it('a pair he already wears counts from the first step', () => {
        // The inventory is not per cavern: a pair picked up on another level is still in
        // it, so `planAccessories` — which takes the pair as already held — answers the
        // case where there is nothing to walk to.
        const j = JOURNEY!;
        const bit = CAP_OF_BIT[(j.shoe - 1) as number]!;
        const caps = { ...bareCapabilities(), mask: bareCapabilities().mask | bit };
        const route = findRoute({
            store, caps, maps: [j.mapId],
            start: { mapId: j.mapId, ...j.start }, goal: { mapId: j.mapId, ...j.goal },
        });
        expect(route, 'already wearing them, the hop is made').not.toBeNull();
        expect(route!.equipment.map((e) => e.label.toLowerCase()))
            .toEqual([NAV_SHOE_LABEL[j.shoe].toLowerCase()]);
    });

    it('a pair is collected once and then kept, not spent', () => {
        // The difference from a key, and the reason the search carries a set instead of
        // a count: there is one change of shoe in the route, not one per hop, and the
        // pair's cell appears once.
        const j = JOURNEY!;
        const route = findRoute({
            store, caps: bareCapabilities(), maps: [j.mapId], collectAccessories: true,
            start: { mapId: j.mapId, ...j.start }, goal: { mapId: j.mapId, ...j.goal },
        })!;
        const visits = route.points.filter(
            (p) => p.col === j.pairCell.col && p.row === j.pairCell.row,
        );
        expect(visits.length, 'the pair is collected once').toBe(1);
        expect(route.equipment.length, 'one change of shoe, not one per hop').toBe(1);
    });
});
