/**
 * eai-registry.ts — Stage 9a: TS mirror of dungeon.c's `load_eai_module`
 * selection table (dungeon.c:5629) plus the `Monster_AI` entry point
 * (dungeon.c:5670). The composition-root tick passes `runMonsterAi` where
 * the C code calls `current_monster_ai(m)`.
 *
 * Modules not ported yet resolve to a no-op AI (monsters hold position) —
 * each Stage 9 step replaces one row. Boss `_reset` hooks run exactly once
 * per selection, mirroring C.
 */

import type { MonsterAiFn } from './dungeon-items.js';
import { monsterAi1 } from './eai1.js';
import { monsterAi2 } from './eai2.js';
import { monsterAi3 } from './eai3.js';
import { monsterAi4 } from './eai4.js';
import { monsterAi5 } from './eai5.js';
import { monsterAi6 } from './eai6.js';
import { monsterAi7 } from './eai7.js';
import { monsterAi8 } from './eai8.js';
import { cangrejoAi, cangrejoAiReset } from './boss-crab.js';
import { pulpoAi, pulpoAiReset } from './boss-tako.js';
import { polloAi, polloAiReset } from './boss-tori.js';
import { agarAi, agarAiReset } from './boss-agar.js';
import { vistaAi, vistaAiReset } from './boss-vista.js';
import { tarsoAi, tarsoAiReset } from './boss-tarso.js';
import { paguroAi, paguroAiReset } from './boss-paguro.js';
import { dragonAi, dragonAiReset } from './boss-dragon.js';
import { alguienAi, alguienAiReset } from './boss-alguien.js';
import { jashiin1Ai, jashiin1AiReset } from './boss-jashiin1.js';
import { jashiin2Ai, jashiin2AiReset } from './boss-jashiin2.js';

interface EaiModule {
    ai: MonsterAiFn | null; // null = not ported yet (no-op)
    reset?: () => void;
}

const noopAi: MonsterAiFn = () => undefined;

/** place_map_id → AI module (dungeon.c:5631-5663). */
const REGISTRY: Record<number, EaiModule> = {
    0: { ai: monsterAi1 }, // mp10.mdt
    1: { ai: cangrejoAi, reset: cangrejoAiReset }, // mp1d.mdt — Cangrejo (crab.c)
    2: { ai: monsterAi2 }, // mp20.mdt
    3: { ai: monsterAi2 }, // mp21.mdt
    4: { ai: pulpoAi, reset: pulpoAiReset }, // mp2d.mdt — Pulpo (tako.c)
    5: { ai: monsterAi3 }, // mp30.mdt
    6: { ai: monsterAi3 }, // mp31.mdt
    7: { ai: polloAi, reset: polloAiReset }, // mp3d.mdt — Pollo (tori.c)
    8: { ai: monsterAi4 }, // mp40.mdt
    9: { ai: monsterAi4 }, // mp41.mdt
    10: { ai: agarAi, reset: agarAiReset }, // mp4d.mdt — Agar (zela.c)
    11: { ai: monsterAi5 }, // mp50.mdt
    12: { ai: monsterAi5 }, // mp51.mdt
    13: { ai: vistaAi, reset: vistaAiReset }, // mp5d.mdt — Vista
    14: { ai: monsterAi6 }, // mp60.mdt — Monster_AI_6
    15: { ai: monsterAi6 }, // mp61.mdt — Monster_AI_6
    16: { ai: monsterAi6 }, // mp62.mdt — Monster_AI_6
    17: { ai: tarsoAi, reset: tarsoAiReset }, // mp6d.mdt — Tarso
    18: { ai: monsterAi7 }, // mp70.mdt — Monster_AI_7
    19: { ai: monsterAi7 }, // mp71.mdt — Monster_AI_7
    20: { ai: monsterAi7 }, // mp72.mdt — Monster_AI_7
    21: { ai: paguroAi, reset: paguroAiReset }, // mp73.mdt — Paguro (zel2.c)
    22: { ai: dragonAi, reset: dragonAiReset }, // mp7d.mdt — Dragon (drgn.c)
    23: { ai: monsterAi8 }, // mp80.mdt — Monster_AI_8
    24: { ai: monsterAi8 }, // mp81.mdt — Monster_AI_8
    25: { ai: monsterAi8 }, // mp82.mdt — Monster_AI_8
    26: { ai: monsterAi8 }, // mp83.mdt — Monster_AI_8
    27: { ai: monsterAi8 }, // mp84.mdt — Monster_AI_8
    28: { ai: alguienAi, reset: alguienAiReset }, // mp8d.mdt — Alguien (akma.c)
    29: { ai: jashiin1Ai, reset: jashiin1AiReset }, // mp90.mdt — Jashiin1 (mao1.c)
    30: { ai: jashiin2Ai, reset: jashiin2AiReset }, // mpa0.mdt — Jashiin2 (mao2.c)
};

let current: EaiModule = { ai: null };
let currentId = -1;

/** load_eai_module (dungeon.c:5629): select + reset for this cavern. */
export function loadEaiModule(placeMapId: number): void {
    const id = placeMapId & 0x7f;
    const mod = REGISTRY[id] ?? { ai: null };
    mod.reset?.();
    current = mod;
    currentId = id;
}

/** Currently selected map id (-1 before the first selection). */
export function currentEaiModuleId(): number {
    return currentId;
}

/** Monster_AI (dungeon.c:5670): dispatch to the selected module. */
export function runMonsterAi(g: Uint8Array, m: number): void {
    const fn = current.ai;
    if (fn) fn(g, m);
    else noopAi(g, m);
}
