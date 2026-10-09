import { describe, expect, it } from 'vitest';
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NavGraphStore, findRoute } from '../src/engine/nav/pathfinder.js';
import { PathGuide } from '../src/engine/nav/path-guide.js';
import { bareCapabilities } from '../src/engine/nav/capabilities.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';

const LOG = '/tmp/opencode/probe-guide.log';
const log = (...a: unknown[]) => appendFileSync(LOG, a.map(String).join(' ') + '\n');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const store = new NavGraphStore((id) => {
    const m = NAV_MAP_BY_ID.get(id);
    if (!m) return null;
    return new Uint8Array(readFileSync(resolve(REPO, `web/public/${m.mdtPath}`)));
});

const START = { mapId: 23, col: 111, row: 21 };
const GOAL = { mapId: 23, col: 227, row: 34 };

describe('guide over the two-key journey', () => {
    it('walks the whole route, logging the anchor', () => {
        const route = findRoute({
            store, caps: bareCapabilities(), start: START, goal: GOAL,
            collectKeys: true, planAccessories: true,
        })!;
        expect(route).not.toBeNull();
        log(`route points=${route.points.length} maps=[${route.maps.join(',')}]`);
        // The stretch the player reported: everything from the first step onto mp82.
        route.points.forEach((p, i) => {
            if (p.mapId === 25 || p.mapId === 24) {
                log(`  [${i}] ${p.mapId}(${p.col},${p.row})`);
            }
        });

        const hero = { ...route.points[0]! };
        const guide = new PathGuide({
            store,
            heroPosition: () => ({ ...hero }),
            capabilities: () => bareCapabilities(),
        });
        guide.setRoute(route, route.points[route.points.length - 1]!, {
            collectKeys: true, planAccessories: true, keyPresent: () => true,
        });
        let now = 0;
        let lastLogged = -1;
        for (let i = 1; i < route.points.length; i++) {
            hero.mapId = route.points[i]!.mapId;
            hero.col = route.points[i]!.col;
            hero.row = route.points[i]!.row;
            now += 600;
            guide.update(now);
            const left = guide.remaining();
            const first = left[0];
            const foreign = first && first.mapId !== hero.mapId;
            const empty = left.length === 0;
            if (foreign || empty || left.length < 3 || i - lastLogged > 40) {
                lastLogged = i;
                log(`step ${i} hero=${hero.mapId}(${hero.col},${hero.row})`
                    + ` left=${left.length} first=${first ? `${first.mapId}(${first.col},${first.row})` : '-'}`
                    + ` foreign=${foreign} hasRoute=${guide.hasRoute}`);
            }
        }
        log(`done left=${guide.remaining().length} hasRoute=${guide.hasRoute}`);
        expect(true).toBe(true);
    }, 120000);
});
