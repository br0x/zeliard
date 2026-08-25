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

interface EaiModule {
    ai: MonsterAiFn | null; // null = not ported yet (no-op)
    reset?: () => void;
}

const noopAi: MonsterAiFn = () => undefined;

/** place_map_id → AI module (dungeon.c:5631-5663). */
const REGISTRY: Record<number, EaiModule> = {
    0: { ai: monsterAi1 }, // mp10.mdt
    1: { ai: null }, // mp1d.mdt — Cangrejo (crab.c), Stage 9f
    2: { ai: monsterAi2 }, // mp20.mdt
    3: { ai: monsterAi2 }, // mp21.mdt
    4: { ai: null }, // mp2d.mdt — Pulpo (tako.c), Stage 9f
    5: { ai: monsterAi3 }, // mp30.mdt
    6: { ai: monsterAi3 }, // mp31.mdt
    7: { ai: null }, // mp3d.mdt — Pollo (tori.c), Stage 9g
    8: { ai: monsterAi4 }, // mp40.mdt
    9: { ai: monsterAi4 }, // mp41.mdt
    10: { ai: null }, // mp4d.mdt — Agar (akma.c), Stage 9h
    11: { ai: monsterAi5 }, // mp50.mdt
    12: { ai: monsterAi5 }, // mp51.mdt
    13: { ai: null }, // mp5d.mdt — Vista, Stage 9i
    14: { ai: monsterAi6 }, // mp60.mdt — Monster_AI_6
    15: { ai: monsterAi6 }, // mp61.mdt — Monster_AI_6
    16: { ai: monsterAi6 }, // mp62.mdt — Monster_AI_6
    17: { ai: null }, // mp6d.mdt — Tarso, Stage 9i
    18: { ai: monsterAi7 }, // mp70.mdt — Monster_AI_7
    19: { ai: monsterAi7 }, // mp71.mdt — Monster_AI_7
    20: { ai: monsterAi7 }, // mp72.mdt — Monster_AI_7
    21: { ai: null }, // mp73.mdt — Paguro, Stage 9i
    22: { ai: null }, // mp7d.mdt — Dragon (drgn.c), Stage 9i
    23: { ai: monsterAi8 }, // mp80.mdt — Monster_AI_8
    24: { ai: monsterAi8 }, // mp81.mdt — Monster_AI_8
    25: { ai: monsterAi8 }, // mp82.mdt — Monster_AI_8
    26: { ai: monsterAi8 }, // mp83.mdt — Monster_AI_8
    27: { ai: monsterAi8 }, // mp84.mdt — Monster_AI_8
    28: { ai: null }, // mp8d.mdt — Alguien (mao1.c), Stage 9i
    29: { ai: null }, // mp90.mdt — Jashiin1 (mao2.c), Stage 9i
    30: { ai: null }, // mpa0.mdt — Jashiin2 (mao2.c), Stage 9i
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
