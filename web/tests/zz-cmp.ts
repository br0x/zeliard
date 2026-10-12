import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NavGraphStore } from '../src/engine/nav/pathfinder.js';
import { NAV_MAP_BY_ID } from '../src/data/nav/nav-maps.js';
import { nodeAt, edgesOf, NODE_GROUND, NODE_RIDE } from '../src/engine/nav/nav-graph.js';
import { EDGE_NAMES } from '../src/engine/nav/types.js';
import { buildPlatformModel } from '../src/engine/nav/platforms.js';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const store = new NavGraphStore((id) => { const m = NAV_MAP_BY_ID.get(id); if (!m) return null;
  return new Uint8Array(readFileSync(resolve(REPO, `web/public/${m.mdtPath}`))); });
for (const [name,id,c,r] of [['mp80',23,203,29],['mp81',24,153,62]] as [string,number,number,number][]) {
  const g = store.get(id)!; const W = g.mapWidth;
  const pm = buildPlatformModel(id, store.gridOf(id)!);
  const gi = nodeAt(g,c,r);
  console.log(`\n${name} (${c},${r})`);
  console.log(`  ground node via nodeAt = ${gi} (kind ${gi>=0?g.nodes[gi]!.kind:'-'})`);
  // is there a RIDE node at this exact cell?
  let ride = -1;
  for (let i=0;i<g.nodes.length;i++){ const n=g.nodes[i]!; if(n.kind===NODE_RIDE&&n.col===c&&n.row===r){ride=i;break;} }
  console.log(`  ride node = ${ride}`);
  const overlaps: string[] = [];
  for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
    const cc=((c+i)%W+W)%W, rr=((r+j)%64+64)%64;
    if (pm.restingCells[rr*W+cc]===1) overlaps.push(`(${cc},${rr})`);
  }
  console.log(`  hero 3x3 overlaps resting platform at: ${overlaps.join(' ')||'NOTHING'}`);
  if (gi>=0) { console.log(`  edges out:`); for (const e of edgesOf(g,gi).slice(0,8)){const n=g.nodes[e.to]!;console.log(`     -> (${n.col},${n.row}) ${EDGE_NAMES[e.kind]}`);} }
}
