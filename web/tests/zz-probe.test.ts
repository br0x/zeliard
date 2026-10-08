import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NavGraphStore, findRoute } from '../src/engine/nav/pathfinder.js';
import { allCapabilities, bareCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { EDGE_NAMES } from '../src/engine/nav/types.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const store = new NavGraphStore((id) => {
    const m = NAV_MAP_BY_ID.get(id);
    if (!m) return null;
    return new Uint8Array(readFileSync(resolve(REPO, `web/public/${m.mdtPath}`)));
});
const caps = allCapabilities();

function go(label: string, start: any, goal: any, useCaps = caps) {
    const r = findRoute({ store, caps: useCaps, start, goal });
    if (!r) { console.log(`${label}: NONE`); return null; }
    console.log(`${label}: cost=${r.cost} hops=${r.hops.length} maps=[${r.maps.join(',')}]`);
    return r;
}

describe('probe', () => {
    it('reproduce', () => {
        const full = go('full mp80(111,21)->mp82(179,53)',
            { mapId: 23, col: 111, row: 21 }, { mapId: 25, col: 179, row: 53 });
        if (full) {
            const doors = full.points.filter((p, i) => i > 0 && p.mapId !== full.points[i - 1]!.mapId);
            console.log('door crossings:', doors.map(p => `${p.mapId}(${p.col},${p.row})`).join(' '));
            for (const p of full.points.slice(0, 24)) console.log(`  pt ${p.mapId}(${p.col},${p.row})`);
        }
        go('leg map24(10,53)->map25(179,53)',
            { mapId: 24, col: 10, row: 53 }, { mapId: 25, col: 179, row: 53 });
        go('LEG-BARE map24(10,53)->map25(179,53)',
            { mapId: 24, col: 10, row: 53 }, { mapId: 25, col: 179, row: 53 }, bareCapabilities());
        go('FULL-BARE mp80(111,21)->mp82(179,53)',
            { mapId: 23, col: 111, row: 21 }, { mapId: 25, col: 179, row: 53 }, bareCapabilities());
        go('map24(10,53)->map25(179,0)',
            { mapId: 24, col: 10, row: 53 }, { mapId: 25, col: 179, row: 0 });
        go('map25(10,53)->map25(179,53)',
            { mapId: 25, col: 10, row: 53 }, { mapId: 25, col: 179, row: 53 });
        // Test the crouching route on mp82
        const crouch = go('crouch mp82(179,53)->mp82(158,54)',
            { mapId: 25, col: 179, row: 53 }, { mapId: 25, col: 158, row: 54 });
        if (crouch) {
            for (const [i, h] of crouch.hops.entries()) {
                const p = crouch.points[i];
                const n = crouch.points[i+1];
                if (p && n) {
                    console.log(`  ${p.mapId}(${p.col},${p.row}) -> ${n.mapId}(${n.col},${n.row})  ${h.kind}`);
                }
            }
        }
        expect(true).toBe(true);
    }, 300000);

    it('map screen cascade for the reported journey', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const hero = { mapId: 23, col: 111, row: 21 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const legStart = { mapId: 24, col: 10, row: 53 };
        const capsList: [string, any][] = [
            ['bare', { mask: B.CLIMB, accessory: 0, cavernLevel: 1, keys: 0, lionKeys: 0 }],
            ['key1', { mask: B.CLIMB | B.KEY, accessory: 0, cavernLevel: 1, keys: 1, lionKeys: 0 }],
            ['silkarn+key1', { mask: B.CLIMB | B.SLOPE_STAND | B.KEY, accessory: 2, cavernLevel: 1, keys: 1, lionKeys: 0 }],
            ['feruza+key1', { mask: B.CLIMB | B.JUMP_HIGH | B.KEY, accessory: 1, cavernLevel: 1, keys: 1, lionKeys: 0 }],
        ];
        const keyPresent = () => true;
        for (const [name, caps] of capsList) {
            const doors = {};
            const keyFetch = { collectKeys: true, keyPresent };
            const rungs: [string, any, any][] = [
                ['1held', { ...doors }, {}],
                ['2collected', { ...keyFetch, ...doors }, keyFetch],
                ['3shod', { collectAccessories: true, ...keyFetch, ...doors }, { collectAccessories: true, ...keyFetch }],
                ['3bworn', { planAccessories: true, ...keyFetch, ...doors }, { planAccessories: true, ...keyFetch }],
                ['4open', { unlimitedKeys: true, planAccessories: true, ...doors }, {}],
            ];
            let accepted: string | null = null;
            let route: any = null;
            let plan: any = {};
            for (const [label, opts, planFor] of rungs) {
                const r = findRoute({ store, caps: caps as any, start: hero, goal, ...opts } as any);
                if (r && label !== '4open') { accepted = label; route = r; plan = planFor; break; }
                if (r && label === '4open') { accepted = `${label}(refused)`; route = r; plan = {}; }
            }
            const leg = findRoute({ store, caps: caps as any, start: legStart, goal, ...(accepted === '1held' ? {} : plan) } as any);
            console.log(`CASCADE ${name}: accepted=${accepted} maps=[${route?.maps}] keysGained=${route?.keysGained?.ordinary} locked=${route?.lockedDoors?.ordinary} leg=${leg ? `maps=[${leg.maps}]` : 'NONE'}`);
        }
        expect(true).toBe(true);
    }, 600000);

    it('route via 24 when the locked door is shut', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const noKey = { mask: B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND | B.GROUND_SAFE | B.ICE_SAFE | B.HEAT_SAFE, accessory: 0, cavernLevel: 3, keys: 0, lionKeys: 0 };
        const start = { mapId: 23, col: 111, row: 21 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const leg = { mapId: 24, col: 10, row: 53 };
        const shut = (m: number, x: number, y: number) => !(m === 23 && x === 57 && y === 15);
        const variants: [string, any][] = [
            ['shut, nokey', { caps: noKey, opts: { doorOpen: shut } }],
            ['shut, nokey+collect', { caps: noKey, opts: { doorOpen: shut, collectKeys: true, keyPresent: () => true } }],
            ['shut, onekey', { caps: { ...noKey, mask: noKey.mask | B.KEY, keys: 1 }, opts: { doorOpen: shut } }],
            ['all, shut', { caps: caps, opts: { doorOpen: shut } }],
            ['all, nokey-open', { caps: noKey, opts: {} }],
        ];
        for (const [label, v] of variants) {
            const f = findRoute({ store, caps: v.caps as any, start, goal, ...v.opts } as any);
            const l = findRoute({ store, caps: v.caps as any, start: leg, goal, ...v.opts } as any);
            console.log(`VIA ${label}: full=${f ? `maps=[${f.maps}]` : 'NONE'} leg=${l ? `maps=[${l.maps}]` : 'NONE'}`);
        }
        expect(true).toBe(true);
    }, 600000);

    it('key nodes', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const noKey = { mask: B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND | B.GROUND_SAFE | B.ICE_SAFE | B.HEAT_SAFE, accessory: 0, cavernLevel: 3, keys: 0, lionKeys: 0 };
        for (const m of [23, 24, 25]) {
            const g = store.get(m)!;
            for (let i = 0; i < g.nodes.length; i++) {
                if (g.keyKindAt[i] !== 0) {
                    const n = g.nodes[i]!;
                    console.log(`KEY map${m} kind=${g.keyKindAt[i]} node(${n.col},${n.row}) kind=${n.kind} cell=${g.keyCellAt[i]}`);
                }
            }
        }
        const g24 = store.get(24)!;
        let target = -1;
        for (let i = 0; i < g24.nodes.length; i++) if (g24.keyKindAt[i] === 1) target = i;
        const t = g24.nodes[target];
        const r = findRoute({ store, caps: noKey as any,
            start: { mapId: 24, col: 10, row: 53 },
            goal: { mapId: 24, col: t.col, row: t.row },
            collectKeys: true, keyPresent: () => true });
        console.log(`walk to map24 key (${t.col},${t.row}): ${r ? 'OK' : 'NONE'}`);
        expect(true).toBe(true);
    }, 300000);

    it('key reachability', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const noKey = { mask: B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND | B.GROUND_SAFE | B.ICE_SAFE | B.HEAT_SAFE, accessory: 0, cavernLevel: 3, keys: 0, lionKeys: 0 };
        const g24 = store.get(24)!;
        const nodeAt = (gg: any, c: number, r: number) => gg.nodes.findIndex((nn: any) => nn.col === c && nn.row === r);
        for (const [c, r] of [[125, 37], [232, 39]]) {
            const n = nodeAt(g24, c, r);
            console.log(`map24 key node (${c},${r}) = ${n} ${n >= 0 ? `kind=${g24.keyKindAt[n]} cell=${g24.keyCellAt[n]}` : ''}`);
        }
        const k = findRoute({ store, caps: noKey as any,
            start: { mapId: 24, col: 10, row: 53 },
            goal: { mapId: 24, col: 125, row: 37 },
            collectKeys: true, keyPresent: () => true });
        console.log('to the key:', k ? `OK cost=${k.cost}` : 'NONE');
        const g25 = store.get(25)!;
        const n25 = nodeAt(g25, 26, 48);
        console.log(`map25 key node (26,48) = ${n25} ${n25 >= 0 ? `kind=${g25.keyKindAt[n25]} cell=${g25.keyCellAt[n25]}` : ''}`);
        expect(true).toBe(true);
    }, 300000);

    it('keys in the graph', async () => {
        const { NAV_KEYS } = await import('../src/data/nav/nav-keys.js');
        const byMap = new Map<number, any[]>();
        for (const [mid, ks] of Object.entries(NAV_KEYS as any)) byMap.set(Number(mid), ks);
        for (const m of [23, 24, 25]) {
            console.log(`KEYS map${m}: ${JSON.stringify(byMap.get(m) ?? [])}`);
        }
        for (const m of [23, 24, 25]) {
            const g = store.get(m)!;
            let kc = 0;
            for (let i = 0; i < (g.keyKindAt?.length ?? 0); i++) if ((g.keyKindAt?.[i] ?? -1) >= 0) kc++;
            console.log(`graph map${m}: nodes=${g.nodes.length} keyCells=${kc}`);
        }
        expect(true).toBe(true);
    }, 300000);

    it('sweep for a route through map 24', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const start = { mapId: 23, col: 111, row: 21 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const masks: [string, number][] = [
            ['bare', B.CLIMB],
            ['shoe', B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND],
            ['shoe+safe', B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND | B.GROUND_SAFE | B.ICE_SAFE | B.HEAT_SAFE],
            ['allmask', 0xff],
            ['noclimb', 0xff & ~B.CLIMB],
        ];
        const opts: [string, any][] = [
            ['plain', {}],
            ['collect', { collectKeys: true, keyPresent: () => true }],
            ['acc', { planAccessories: true }],
            ['collect+acc', { collectKeys: true, keyPresent: () => true, planAccessories: true }],
            ['unlimited', { unlimitedKeys: true }],
            ['unlim+acc', { unlimitedKeys: true, planAccessories: true }],
            ['collect+doorsOpen', { collectKeys: true, keyPresent: () => true, doorOpen: () => false }],
        ];
        let found24 = 0;
        for (const [mn, mask] of masks) {
            for (const keys of [0, 1, 255]) {
                for (const [on, o] of opts) {
                    const c = { mask: mask | (keys ? B.KEY | B.LION_KEY : 0), accessory: 0, cavernLevel: 3, keys, lionKeys: keys };
                    const r = findRoute({ store, caps: c as any, start, goal, ...o } as any);
                    if (!r) continue;
                    if (r.maps.includes(24)) { found24++; console.log(`VIA24 ${mn} keys=${keys} ${on} maps=[${r.maps}]`); }
                }
            }
        }
        console.log(`TOTAL VIA24: ${found24}`);
        expect(true).toBe(true);
    }, 900000);

    it('keyless full vs leg', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const noKey = { mask: B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND | B.GROUND_SAFE | B.ICE_SAFE | B.HEAT_SAFE, accessory: 0, cavernLevel: 3, keys: 0, lionKeys: 0 };
        const keyBit = { ...noKey, mask: noKey.mask | B.KEY };
        const start = { mapId: 23, col: 111, row: 21 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const leg = { mapId: 24, col: 10, row: 53 };
        const opts: [string, any][] = [
            ['plain', {}],
            ['collect', { collectKeys: true, keyPresent: () => true }],
            ['collect+acc', { collectKeys: true, keyPresent: () => true, planAccessories: true }],
            ['unlimited', { unlimitedKeys: true, planAccessories: true }],
        ];
        for (const [cn, c] of [['noKey', noKey], ['keyBit', keyBit], ['all', caps]] as const) {
            for (const [on, o] of opts) {
                const f = findRoute({ store, caps: c as any, start, goal, ...o } as any);
                const l = findRoute({ store, caps: c as any, start: leg, goal, ...o } as any);
                console.log(`KV ${cn} ${on}: full=${f ? `maps=[${f.maps.join(',')}] spent=${f.keysSpent.ordinary}/${f.lockedDoors.ordinary}` : 'NONE'} leg=${l ? `maps=[${l.maps.join(',')}] spent=${l.keysSpent.ordinary}/${l.lockedDoors.ordinary}` : 'NONE'}`);
            }
        }
        expect(true).toBe(true);
    }, 600000);

    it('leg key variants', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const leg = { mapId: 24, col: 10, row: 53 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const noKey = { mask: B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND | B.GROUND_SAFE | B.ICE_SAFE | B.HEAT_SAFE, accessory: 0, cavernLevel: 3, keys: 0, lionKeys: 0 };
        const oneKey = { ...noKey, mask: noKey.mask | B.KEY, keys: 1 };
        const opts: [string, any][] = [
            ['plain', {}],
            ['collect', { collectKeys: true }],
            ['collect+keyPresent(true)', { collectKeys: true, keyPresent: () => true }],
            ['collect+keyPresent(false)', { collectKeys: true, keyPresent: () => false }],
            ['keyPresent(true) only', { keyPresent: () => true }],
            ['unlimited', { unlimitedKeys: true }],
        ];
        for (const [cn, c] of [['noKey', noKey], ['oneKey', oneKey]] as const) {
            for (const [on, o] of opts) {
                const r = findRoute({ store, caps: c as any, start: leg, goal, ...o } as any);
                console.log(`KEYVAR ${cn} ${on}: ${r ? `OK cost=${r.cost} keysSpent=${r.keysSpent.ordinary}` : 'NONE'}`);
            }
        }
        expect(true).toBe(true);
    }, 600000);

    it('door mapping', async () => {
        const { PORTALS } = await import('../src/data/nav/nav-portals.js');
        const g23 = store.get(23)!;
        const g24 = store.get(24)!;
        const { nodeAt } = await import('../src/engine/nav/nav-graph.js');
        for (const p of PORTALS as any[]) {
            if (p.mapId !== 23 || p.x0 !== 57) continue;
            console.log(`P23 x0=${p.x0} y0=${p.y0} from=(${p.fromX},${p.fromY}) to=(${p.toX},${p.toY}) dest=${p.destMapId}(${p.destX},${p.destY}) key=${p.key}`);
            const n = nodeAt(g23, p.fromX, p.fromY);
            console.log(`   nodeAt(${p.fromX},${p.fromY}) = ${n} ${n >= 0 ? JSON.stringify(g23.nodes[n]) : ''} portal=${n >= 0 ? g23.portalAtNode[n] : '-'}`);
        }
        for (const p of PORTALS as any[]) {
            if (p.mapId !== 24 || p.x0 !== 10) continue;
            console.log(`P24 x0=${p.x0} y0=${p.y0} from=(${p.fromX},${p.fromY}) to=(${p.toX},${p.toY}) dest=${p.destMapId}(${p.destX},${p.destY})`);
            const n = nodeAt(g24, p.fromX, p.fromY);
            console.log(`   nodeAt(${p.fromX},${p.fromY}) = ${n} ${n >= 0 ? JSON.stringify(g24.nodes[n]) : ''} portal=${n >= 0 ? g24.portalAtNode[n] : '-'}`);
        }
        const hero = nodeAt(g24, 10, 53);
        console.log(`map24 nodeAt(10,53)=${hero} ${hero >= 0 ? JSON.stringify(g24.nodes[hero]) : ''}`);
        expect(true).toBe(true);
    }, 300000);

    it('plan with keys on the floor', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const start = { mapId: 23, col: 111, row: 21 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const leg = { mapId: 24, col: 10, row: 53 };
        const keyPresent = () => true;
        const variants: [string, any][] = [
            ['all+keyPresent', caps],
            ['shoe+key', { mask: B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND | B.GROUND_SAFE | B.ICE_SAFE | B.HEAT_SAFE | B.KEY, accessory: 0, cavernLevel: 3, keys: 1, lionKeys: 0 }],
            ['climb+key', { mask: B.CLIMB | B.KEY, accessory: 0, cavernLevel: 3, keys: 1, lionKeys: 0 }],
            ['shoe-only', { mask: B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND, accessory: 0, cavernLevel: 3, keys: 0, lionKeys: 0 }],
        ];
        for (const [label, c] of variants) {
            for (const [on, opts] of [['plain', {}], ['collect', { collectKeys: true, keyPresent }], ['acc', { planAccessories: true, collectKeys: true, keyPresent }]] as const) {
                const f = findRoute({ store, caps: c, start, goal, ...opts } as any);
                const l = findRoute({ store, caps: c, start: leg, goal, ...opts } as any);
                console.log(`PLAN ${label} ${on}: full=${f ? `maps=[${f.maps.join(',')}]` : 'NONE'} leg=${l ? `maps=[${l.maps.join(',')}]` : 'NONE'}`);
            }
        }
        expect(true).toBe(true);
    }, 600000);

    it('leg sweep', () => {
        const B = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const base = B.CLIMB | B.JUMP_HIGH | B.SLOPE_STAND;
        const leg = { mapId: 24, col: 10, row: 53 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const safety: [string, number][] = [
            ['none', 0], ['g', B.GROUND_SAFE], ['i', B.ICE_SAFE], ['h', B.HEAT_SAFE],
            ['g+i', B.GROUND_SAFE | B.ICE_SAFE], ['g+h', B.GROUND_SAFE | B.HEAT_SAFE],
            ['all3', B.GROUND_SAFE | B.ICE_SAFE | B.HEAT_SAFE],
        ];
        for (const [sn, sb] of safety) {
            for (const keys of [0, 255]) {
                for (const opts of [{}, { collectKeys: true }, { planAccessories: true }, { unlimitedKeys: true, planAccessories: true }]) {
                    const c = { mask: base | sb | (keys ? B.KEY | B.LION_KEY : 0), accessory: 0, cavernLevel: 3, keys, lionKeys: keys };
                    const r = findRoute({ store, caps: c, start: leg, goal, ...opts } as any);
                    const on = Object.keys(opts).join('+') || 'plain';
                    console.log(`LEG safe=${sn} keys=${keys} ${on}: ${r ? 'OK' : 'NONE'}`);
                }
            }
        }
        expect(true).toBe(true);
    }, 600000);

    it('door detail', async () => {
        const r = findRoute({ store, caps,
            start: { mapId: 23, col: 111, row: 21 },
            goal: { mapId: 25, col: 179, row: 53 } })!;
        r.points.forEach((p, i) => {
            const prev = i > 0 ? r.points[i - 1]! : null;
            if (prev && prev.mapId !== p.mapId) {
                for (let k = Math.max(0, i - 3); k <= Math.min(r.points.length - 1, i + 2); k++) {
                    const q = r.points[k]!;
                    console.log(`  [${k}] ${q.mapId}(${q.col},${q.row})${k === i ? '  <== DOOR' : ''}`);
                }
            }
        });
        const { PORTALS } = await import('../src/data/nav/nav-portals.js');
        for (const p of PORTALS as any[]) {
            const from = `${p.mapId}(${p.x},${p.y})` + (p.x1 !== undefined && p.x1 !== p.x ? `-${p.x1}` : '');
            const to = `${p.destMapId}(${p.destX},${p.destY})`;
            if ((p.mapId === 23 || p.mapId === 24 || p.destMapId === 24) ) {
                console.log(`  PORTAL ${from} -> ${to} ${JSON.stringify(p).slice(0, 200)}`);
            }
        }
        expect(true).toBe(true);
    }, 300000);

    it('mask sweep', () => {
        const CAP = { CLIMB: 1, JUMP_HIGH: 2, SLOPE_STAND: 4, GROUND_SAFE: 8, ICE_SAFE: 16, HEAT_SAFE: 32, KEY: 64, LION_KEY: 128 };
        const names = Object.entries(CAP).map(([k, v]) => [v, k] as const);
        const bits = [CAP.CLIMB, CAP.JUMP_HIGH, CAP.SLOPE_STAND, CAP.GROUND_SAFE, CAP.ICE_SAFE, CAP.HEAT_SAFE, CAP.KEY, CAP.LION_KEY];
        const start = { mapId: 23, col: 111, row: 21 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const leg = { mapId: 24, col: 10, row: 53 };
        // single-bit removals from `all`, plus the shoe mask shape
        for (const b of bits) {
            const mask = 0xff & ~b;
            const missing = names.filter(([v]) => (mask & v) === 0).map(([, k]) => k).join('+');
            const c = { mask, accessory: 0, cavernLevel: 3, keys: 255, lionKeys: 255 };
            const f = findRoute({ store, caps: c, start, goal });
            const l = findRoute({ store, caps: c, start: leg, goal });
            console.log(`NO ${missing}: full=${f ? `maps=[${f.maps.join(',')}]` : 'NONE'} leg=${l ? `maps=[${l.maps.join(',')}]` : 'NONE'}`);
        }
        const shoe = CAP.CLIMB | CAP.JUMP_HIGH | CAP.SLOPE_STAND;
        for (const extra of [[], [CAP.GROUND_SAFE], [CAP.KEY], [CAP.KEY, CAP.LION_KEY]]) {
            const mask = extra.reduce((m, b) => m | b, shoe);
            const c = { mask, accessory: 0, cavernLevel: 3, keys: 0, lionKeys: 0 };
            const f = findRoute({ store, caps: c, start, goal, collectKeys: true });
            const l = findRoute({ store, caps: c, start: leg, goal, collectKeys: true });
            console.log(`SHOE|${extra.length}: full=${f ? `maps=[${f.maps.join(',')}]` : 'NONE'} leg=${l ? `maps=[${l.maps.join(',')}]` : 'NONE'}`);
        }
        expect(true).toBe(true);
    }, 600000);

    it('caps matrix', () => {
        const start = { mapId: 23, col: 111, row: 21 };
        const goal = { mapId: 25, col: 179, row: 53 };
        const variants: [string, any, any][] = [
            ['all', caps, {}],
            ['all+planAcc', caps, { planAccessories: true }],
            ['all+collectAcc', caps, { collectAccessories: true }],
            ['all+collectKeys', caps, { collectKeys: true }],
            ['all+both', caps, { planAccessories: true, collectKeys: true }],
            ['bare', bareCapabilities(), {}],
            ['bare+planAcc', bareCapabilities(), { planAccessories: true }],
            ['bare+collectAcc', bareCapabilities(), { collectAccessories: true }],
            ['bare+collectKeys', bareCapabilities(), { collectKeys: true }],
            ['bare+keys3', { ...bareCapabilities(), keys: 3 }, { collectKeys: true }],
        ];
        for (const [label, c, opts] of variants) {
            const r = findRoute({ store, caps: c, start, goal, ...opts } as any);
            console.log(`FULL ${label}: ${r ? `cost=${r.cost} maps=[${r.maps.join(',')}] equip=[${r.equipment.length}]` : 'NONE'}`);
        }
        for (const [label, c, opts] of variants) {
            const r = findRoute({ store, caps: c,
                start: { mapId: 24, col: 10, row: 53 }, goal, ...opts } as any);
            console.log(`LEG  ${label}: ${r ? `cost=${r.cost} maps=[${r.maps.join(',')}]` : 'NONE'}`);
        }
        expect(true).toBe(true);
    }, 300000);
});
