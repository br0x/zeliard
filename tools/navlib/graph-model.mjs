/**
 * graph-model.mjs — cavern portal topology.
 *
 * A "graph" in the plan is the set of maps the hero can path between. Doors are
 * the only edges, and a door with y1 === 0xFF leads to a town
 * (engine/dungeon-doors.ts:250), so those are the cut.
 *
 * The topology is DIRECTED, not undirected, and that matters:
 *
 *   - A door into a boss arena or a Jashiin room has no partner on the far side
 *     (those MDTs hold a bare 0xFFFF sentinel). The hero crosses outwards but
 *     never back — except out of a boss arena, whose post-boss door is passed in
 *     separately as an outbound edge.
 *   - mp82 (174,9) arrives on mp81 (227,60), which is where mp81's own shortcut
 *     door departs, so that link is one-way in the original data too.
 *
 * Treating every door as two-way — the obvious reading — silently welds mp84's
 * island onto the main graph, because mp84 and mp81 both point at the doorless
 * mp8d and an undirected walk routes through it. So:
 *
 *   scc(id)          the maps the hero can path to AND back from. This is the
 *                    plan's "component", and it is what the map strip shows.
 *   reachableFrom(id) every map a route can be plotted to, following outbound
 *                    doors everywhere and inbound doors only where they are
 *                    mutual. A superset of scc(id), so the boss arenas stay
 *                    selectable without being treated as two-way.
 */

export class GraphError extends Error {}

/**
 * @param {Array<{mapId:number, toTown:boolean, destMapId:number, fromX:number, fromY:number, toX:number, toY:number}>} portals
 *        flat portal list, as emitted to nav-portals.ts
 * @param {number} mapCount
 * @param {Array<{mapId:number, toTown:boolean, destMapId:number}>} [bossExits]
 *        flat post-boss exits, as emitted to nav-portals.ts. A boss arena's door
 *        table reads as empty, so this is the arena's only way out; it counts as
 *        an outbound door and nothing else — there is no record to match an
 *        inbound portal against, because the hero may leave from wherever he is
 *        standing when the fight ends.
 */
export function buildGraph(portals, mapCount, bossExits = []) {
    // --- mutuality -----------------------------------------------------------
    // A portal is mutual when the destination map carries a portal that departs
    // from exactly this portal's arrival cell and leads back to its origin.
    const byOrigin = new Map();     // "mapId:fromX:fromY" -> portal index
    portals.forEach((p, i) => {
        if (p.toTown) return;
        byOrigin.set(`${p.mapId}:${p.fromX}:${p.fromY}`, i);
    });

    const deadEnd = new Set();
    const oneWay = new Set();
    // Each entry links two portals that are usable in both directions: `a` arrives
    // exactly where `b` departs, and `b` leads back to `a`'s map. Recorded ONCE,
    // because a pair is not symmetric in position — see mp81(151,15) below, whose
    // return hop lands somewhere else. A door has at most one partner, so this is
    // a matching, not a general graph.
    const pairs = [];
    const linked = new Set();   // portals already in a pair, so each is recorded once
    for (let i = 0; i < portals.length; i++) {
        const p = portals[i];
        if (p.toTown) continue;
        if (p.destMapId < 0 || p.destMapId >= mapCount) {
            throw new GraphError(`map ${p.mapId}: door (${p.x0},${p.y0}) points at map ${p.destMapId}`);
        }
        const backIdx = byOrigin.get(`${p.destMapId}:${p.toX}:${p.toY}`);
        const back = backIdx === undefined ? undefined : portals[backIdx];
        if (back === undefined || back.destMapId !== p.mapId) {
            // Either the far side has no door table at all (a boss arena) or a
            // different door occupies that cell. Both are one-way.
            (back === undefined ? deadEnd : oneWay).add(i);
            continue;
        }
        // Both ends resolve to each other, so record the link only once. Note the
        // two ends need not be mirror images: mp81(151,15) and mp82(174,9) are
        // linked, but the return hop lands on mp81 at (227,60), not (151,16).
        if (linked.has(i) || linked.has(backIdx)) continue;
        linked.add(i);
        linked.add(backIdx);
        pairs.push([i, backIdx]);
    }
    for (const [a, b] of pairs) {
        deadEnd.delete(a);
        deadEnd.delete(b);
        oneWay.delete(a);
        oneWay.delete(b);
    }

    // --- directed adjacency --------------------------------------------------
    const outbound = Array.from({ length: mapCount }, () => new Set());
    for (const p of portals) {
        if (p.toTown) continue;
        outbound[p.mapId].add(p.destMapId);
    }
    // A boss arena's post-boss door is an outbound edge like any other, which is
    // what lets a route START in an arena and come back out. It is deliberately
    // not matched for mutuality: the exit has no column of its own, so it cannot
    // be the partner of the door the hero walked in through.
    for (const e of bossExits) {
        if (e.toTown) continue;
        outbound[e.mapId].add(e.destMapId);
    }
    // Where the hero can go from map X: every outbound door, plus the inbound
    // direction of a door only where the two are mutual. A dead-end or one-way
    // portal is still traversable OUTBOUNDS — that is how a boss arena is
    // reached at all — it just cannot be used to come back.
    const both = Array.from({ length: mapCount }, (_, i) => new Set(outbound[i]));

    // --- components ----------------------------------------------------------
    // Mutual links are genuinely two-way, so the mutual graph is undirected and
    // plain flood fill over it yields exactly the strongly connected components.
    const mutualAdj = Array.from({ length: mapCount }, () => new Set());
    for (const [a, b] of pairs) {
        const pa = portals[a];
        mutualAdj[pa.mapId].add(pa.destMapId);
        mutualAdj[pa.destMapId].add(pa.mapId);
    }

    // Inbound is allowed only through a linked portal, so fold the reverse
    // direction in for those and nowhere else.
    for (const [a, b] of pairs) {
        const pa = portals[a];
        mutualAdj[pa.mapId].add(pa.destMapId);
        mutualAdj[pa.destMapId].add(pa.mapId);
        both[pa.mapId].add(pa.destMapId);
        both[pa.destMapId].add(pa.mapId);
    }

    const sccOf = new Array(mapCount).fill(-1);
    const sccs = [];
    for (let start = 0; start < mapCount; start++) {
        if (sccOf[start] !== -1) continue;
        const id = sccs.length;
        const members = [];
        const stack = [start];
        sccOf[start] = id;
        while (stack.length > 0) {
            const u = stack.pop();
            members.push(u);
            for (const v of mutualAdj[u]) {
                if (sccOf[v] === -1) {
                    sccOf[v] = id;
                    stack.push(v);
                }
            }
        }
        members.sort((a, b) => a - b);
        sccs.push({ id, maps: members });
    }

    const reachableFrom = (mapId) => {
        const seen = new Set();
        const stack = [mapId];
        while (stack.length > 0) {
            const u = stack.pop();
            if (seen.has(u)) continue;
            seen.add(u);
            for (const v of both[u]) stack.push(v);
        }
        return [...seen].sort((a, b) => a - b);
    };

    return { sccs, sccOf, reachableFrom, pairs, deadEnd, oneWay };
}
