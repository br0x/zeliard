import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildNavGraph } from '../src/engine/nav/nav-graph.js';
import { decodeTileGrid } from '../src/engine/nav/mdt-grid.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { diagPath } from './diag-path.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
describe('currents', () => {
    it('mp80 columns 95 and 96', () => {
        const meta = NAV_MAP_BY_ID.get(23)!;
        const grid = decodeTileGrid(new Uint8Array(readFileSync(resolve(REPO, 'web/public', meta.mdtPath))), meta.mapWidth, 23);
        const g = buildNavGraph(23, grid);
        const lines: string[] = [];
        for (const l of g.currents.lifts) {
            if (l.x !== 95 && l.x !== 96) continue;
            lines.push(`lift col ${l.x} topRow ${l.topRow} rows ${l.rows} stops `
                + l.stops.map((s) => `(${s.leftCol},${s.headRow}) t${s.ticks} esc=${s.escapable}`).join(' '));
        }
        for (const c of g.currents.conveyors) {
            lines.push(`conveyor y=${c.y} dir=${c.dir} cols ${c.columns[0]}..${c.columns[c.columns.length - 1]} `
                + `exits ${c.exits.map((e) => `${e.fromColumn}->${e.toColumn} t${e.ticks}`).join(' | ')}`);
        }
        lines.push(`node (96,21) = ${g.groundOf[21 * g.mapWidth + 96]}`);
        lines.push(`node (95,50) = ${g.groundOf[50 * g.mapWidth + 95]}`);
        writeFileSync(diagPath('cur.txt'), lines.join('\n'));
        expect(lines.length).toBeGreaterThan(0);
    });
});
