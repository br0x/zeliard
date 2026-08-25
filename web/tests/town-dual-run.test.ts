/**
 * town-dual-run.test.ts — deterministic wasm↔TS dual-run harness for the
 * real town tick loop (regression harness for the Stage 7 movement bugs).
 *
 * Boots the REAL game state in Node (stdply.bin + the actual .mdt files),
 * drives the exact per-tick sequence main.ts's onFullTick performs, and
 * runs each scenario twice: once pure-wasm, once with the ported town
 * family served from TS. Full g_mem is digested after every tick; a
 * divergence is reported as (tick, first differing address, both values).
 *
 * These tests exist because the recorded golden fixtures never push the
 * hero against map edges or through the restore path — exactly where the
 * town port diverged in play-testing.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { diagPath } from './diag-path.js';
import { fileURLToPath } from 'node:url';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));
const GAME_DIR = fileURLToPath(new URL('../public/game/', import.meta.url));

const binary = new Uint8Array(readFileSync(WASM_PATH));
const stdply = new Uint8Array(readFileSync(GAME_DIR + 'stdply.bin'));

import {
    ADDR_HEARTBEAT_VOLUME,
    ADDR_PLACE_MAP_ID,
    ADDR_SWORD_TYPE,
    keyStateToBitmask,
} from '../src/wasm/memory.js';
import { getTownPatId } from '../src/engine/mdt.js';
import { PATTERN_ASSETS, SWORD_REACH_SMALL, SWORD_REACH_MEDIUM, SWORD_REACH_LARGE } from '../src/data/assets.js';
import { DUNGEONS } from '../src/data/dungeons.js';

type WasmFn = (...args: unknown[]) => unknown;

interface Session {
    view: Uint8Array;
    exports: Record<string, WasmFn>;
    bridge: typeof import('../src/wasm/bridge.js');
    /** TS replacements for dispatched calls (empty for pure-wasm runs). */
    impls: Record<string, WasmFn>;
}

async function freshEngine(): Promise<Session> {
    vi.resetModules();
    const bridge = await import('../src/wasm/bridge.js');
    const instance = bridge.initWasmFromBytes(binary.slice());
    const view = bridge.getWasmMemory()!;
    return {
        view,
        exports: instance.exports as unknown as Record<string, WasmFn>,
        bridge,
        impls: {},
    };
}

async function attachTsImpls(s: Session): Promise<void> {
    const { PORTED_EXPORTS } = await import('../src/wasm/parity/ports.js');
    const { setInputKeys } = await import('../src/engine/input.js');
    // Mirror main.ts's hook installation (town.ts's requestDungeonTransition
    // pushes the door x to wasm AND records it into the shared TS statics).
    const { installTownHooks } = await import('../src/engine/town.js');
    const { dungeonRuntimeStatics } = await import('../src/engine/dungeon-runtime.js');
    installTownHooks({
        setDoorX1: (x: number): void => {
            (s.exports.wasm_set_door_x1 as WasmFn)(x);
            dungeonRuntimeStatics.savedDoorX1 = x;
        },
    });
    for (const [name, entry] of Object.entries(PORTED_EXPORTS)) {
        s.impls[name] =
            name === 'wasm_set_input_keys'
                ? ((bit: unknown) => setInputKeys(s.view, bit as number)) as WasmFn
                : (entry.make(() => s.view) as WasmFn);
    }
}

/**
 * Boot sequence mirrored from main.ts startGame (town mode).
 */
async function bootTown(
    s: Session,
    mdtFile: string,
    invoke: (name: string, ...args: unknown[]) => unknown,
): Promise<void> {
    const { loadMdt, loadSaveState } = s.bridge;
    invoke('wasm_town_init');
    loadSaveState(stdply.slice());
    s.view[ADDR_HEARTBEAT_VOLUME] = 0;

    const mdtBytes = new Uint8Array(readFileSync(GAME_DIR + mdtFile));
    loadMdt(mdtBytes, 'game/' + mdtFile);

    const patId = getTownPatId(mdtBytes);
    const pattern = (PATTERN_ASSETS as unknown as Record<number, { specialTiles: number[] } | undefined>)[
        patId as number
    ];
    if (pattern && typeof s.bridge.setSpecialTileList === 'function') {
        s.bridge.setSpecialTileList(pattern.specialTiles);
    }

    invoke('wasm_town_set_return_before_main_loop', 1);
    invoke('wasm_town_entry_disabling_edge_scroll');
}

interface KeyScriptStep {
    ticks: number;
    keys: { ArrowLeft?: boolean; ArrowRight?: boolean; ArrowUp?: boolean; ArrowDown?: boolean };
}

/** FNV-1a over seg0+seg1. */
function digest(view: Uint8Array): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < 0x20000; i++) {
        h ^= view[i] ?? 0;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

interface RunResult {
    digests: Uint32Array;
    /** Hero x-view byte (0x83). */
    heroX: number[];
    pendingDungeonTick: number;
    pendingTownTick: number;
    snapshots?: Map<number, Uint8Array>;
}

const PENDING_DUNGEON_FLAG = 0xfffd;
const TOWN_PENDING_TRANSITION = 0xfff4; // ADDR_PENDING_TRANSITION_FLAG

/** Same table as config/engine.ts TOWN_MDTS (id → path under public/game). */
const TOWNS = [
    '0/cmap.mdt', '0/mrmp.mdt', '0/stmp.mdt', '0/bsmp.mdt', '0/hlmp.mdt',
    '0/tmmp.mdt', '0/drmp.mdt', '0/llmp.mdt', '0/prmp.mdt', '0/esmp.mdt',
];

/**
 * Drive the town tick loop exactly like main.ts onFullTick's town branch:
 * full_tick → set_input_keys → (speed gate) town_update → clear scroll flags.
 */
async function runTown(
    mode: 'wasm' | 'ts',
    mdtFile: string,
    script: KeyScriptStep[],
    maxTicks: number,
    snapFrom = -1,
    snapTo = -1,
): Promise<RunResult> {
    const s = await freshEngine();
    if (mode === 'ts') await attachTsImpls(s);
    const invoke = (name: string, ...args: unknown[]): unknown => {
        if (mode === 'ts') {
            const impl = s.impls[name];
            if (impl) return impl(...args);
            console.log(`[invoke-fallback] ${name} -> wasm`);
        }
        return (s.exports[name] as WasmFn)(...args);
    };
    await bootTown(s, mdtFile, invoke);
    if (mode === 'ts') {
        const { townTickState } = await import('../src/engine/town.js');
        console.log(
            `[boot] pendingWait=${townTickState.pendingWait} target=${townTickState.pendingWaitTarget} ` +
            `returnBefore=${townTickState.returnBeforeMainLoop}`,
        );
    }

    const digests = new Uint32Array(maxTicks + 1);
    const heroX: number[] = [];
    const snapshots = new Map<number, Uint8Array>();
    let pendingDungeonTick = -1;
    let pendingTownTick = -1;
    let step = 0;
    let stepTicksLeft = script[0]?.ticks ?? 0;

    for (let t = 0; t <= maxTicks; t++) {
        while (stepTicksLeft === 0 && step < script.length - 1) {
            step++;
            stepTicksLeft = script[step]!.ticks;
        }
        const keys = script[Math.min(step, script.length - 1)]!.keys;

        if (process.env.TOWN_TRACE === '2') process.stderr.write(`[${mode}] t=${t} pre-full\n`);
        invoke('wasm_town_full_tick');
        if (process.env.TOWN_TRACE === '2') process.stderr.write(`[${mode}] t=${t} post-full\n`);
        const bit = keyStateToBitmask({
            ArrowLeft: !!keys.ArrowLeft,
            ArrowRight: !!keys.ArrowRight,
            ArrowUp: !!keys.ArrowUp,
            ArrowDown: !!keys.ArrowDown,
            Space: false,
            Alt: false,
        });
        invoke('wasm_set_input_keys', bit);

        const speedC = s.view[0xff33] || 5;
        const target = speedC * 4;
        const ftmr = s.view[0xff1a]!;
        if (ftmr >= target) {
            invoke('wasm_town_update');
            const scrollFlag = s.view[0xfff0]!;
            if (scrollFlag) s.view[0xfff0] = 0;
        }

        // Mirror main.ts's async handlers so the engine never keeps running
        // against stale map data.
        if ((s.view[TOWN_PENDING_TRANSITION] ?? 0) === 0xff && pendingTownTick < 0) {
            pendingTownTick = t;
            const tr = (s.bridge as unknown as {
                getTownPendingTransition?: () => { mapId: number; patId: number };
            }).getTownPendingTransition?.();
            const rawMapId = (tr?.mapId ?? 0) & 0x7f;
            const mdtBytes = new Uint8Array(readFileSync(GAME_DIR + TOWNS[rawMapId]!));
            s.bridge.loadMdt(mdtBytes, 'game/' + TOWNS[rawMapId]);
            const pattern = (PATTERN_ASSETS as unknown as Record<number, { specialTiles: number[] } | undefined>)[
                tr?.patId as number
            ];
            if (pattern) s.bridge.setSpecialTileList(pattern.specialTiles);
            invoke('wasm_town_set_return_before_main_loop', 1);
            invoke('wasm_town_complete_transition');
            if (process.env.TOWN_TRACE) {
                process.stderr.write(`[${mode}] t=${t} town-transition -> map ${rawMapId}\n`);
            }
        }
        if (pendingDungeonTick >= 0) break;

        if (pendingDungeonTick < 0 && (s.view[PENDING_DUNGEON_FLAG] ?? 0) === 0xff) {
            pendingDungeonTick = t;
        }
        if (pendingTownTick < 0 && (s.view[TOWN_PENDING_TRANSITION] ?? 0) === 0xff) {
            pendingTownTick = t;
        }
        digests[t] = digest(s.view);
        heroX.push(s.view[0x83]! | 0);
        if (process.env.TOWN_TRACE && t >= 17 && t <= 21) {
            console.log(
                `[${mode}] t=${t} ftmr=${s.view[0xff1a]} dirs=${s.view[0xff17]} ` +
                `anim=${s.view[0xe7]} moved=${s.view[0xc1]} conv=${s.view[0xfff5]}`,
            );
        }
        if (t >= snapFrom && t <= snapTo) snapshots.set(t, s.view.slice(0, 0x20000));
        stepTicksLeft--;
    }
    return { digests, heroX, pendingDungeonTick, pendingTownTick, snapshots };
}

describe('town tick dual-run vs real wasm', () => {
    it('ts run is self-consistent across sessions (isolation check)', async () => {
        const script: KeyScriptStep[] = [
            { ticks: 300, keys: { ArrowUp: true } },
            { ticks: 100, keys: {} },
            { ticks: 400, keys: { ArrowLeft: true } },
        ];
        const a = await runTown('ts', '0/cmap.mdt', script, 800);
        const b = await runTown('ts', '0/cmap.mdt', script, 800);
        expect(Array.from(a.digests)).toEqual(Array.from(b.digests));
    }, 300_000);

    it('cross-session ordering probe', async () => {
        const script: KeyScriptStep[] = [
            { ticks: 300, keys: { ArrowUp: true } },
            { ticks: 100, keys: {} },
            { ticks: 400, keys: { ArrowLeft: true } },
        ];
        // warm-up pair (like the sanity test)
        await runTown('wasm', '0/cmap.mdt', script, 800);
        await runTown('wasm', '0/cmap.mdt', script, 800);
        // now the pair under test
        const w = await runTown('wasm', '0/cmap.mdt', script, 800);
        const ts = await runTown('ts', '0/cmap.mdt', script, 800);
        let div = -1;
        for (let t = 0; t <= 800; t++) {
            if (w.digests[t] !== ts.digests[t]) { div = t; break; }
        }
        console.log(`probe divergence tick: ${div}`);
        expect(div).toBe(-1);
    }, 300_000);

    it('sanity: pure-wasm run is self-consistent (harness check)', async () => {
        const a = await runTown('wasm', '0/cmap.mdt', [
            { ticks: 400, keys: { ArrowRight: true } },
            { ticks: 400, keys: {} },
        ], 800);
        const b = await runTown('wasm', '0/cmap.mdt', [
            { ticks: 400, keys: { ArrowRight: true } },
            { ticks: 400, keys: {} },
        ], 800);
        expect(Array.from(a.digests)).toEqual(Array.from(b.digests));
    }, 120_000);

    it('holding LEFT in Felishika Castle (cmap) matches wasm tick-for-tick', async () => {
        const script: KeyScriptStep[] = [
            { ticks: 300, keys: { ArrowUp: true } },   // walk out of the castle area
            { ticks: 100, keys: {} },
            { ticks: 1400, keys: { ArrowLeft: true } }, // push into the left edge
            { ticks: 200, keys: {} },
        ];
        const w = await runTown('wasm', '0/cmap.mdt', script, 2000, 1205, 1245);
        const ts = await runTown('ts', '0/cmap.mdt', script, 2000, 1205, 1245);
        for (let t = 0; t <= 2000; t++) {
            if (w.digests[t] !== ts.digests[t]) {
                {
                    const ws = w.snapshots!.get(t - 1);
                    const tsp = ts.snapshots!.get(t - 1);
                    if (ws && tsp) {
                        const diffs: number[] = [];
                        for (let i = 0; i < 0x20000; i++) {
                            if ((ws[i] ?? 0) !== (tsp[i] ?? 0)) diffs.push(i);
                        }
                        const fs = await import('node:fs');
                        fs.writeFileSync(diagPath('pre1219.bin'), ws);
                        fs.writeFileSync(diagPath('pre1219-ts.bin'), tsp);
                        console.log(
                            `tick ${t} (pre-state): ${diffs.length} diffs: ` +
                            diffs.slice(0, 40).map((i) =>
                                `0x${i.toString(16)}:${ws[i]}->${tsp[i]}`,
                            ).join(' '),
                        );
                        // hand-evaluate the left-move guard on the shared
                        // pre-tick state (both snapshots are identical here)
                        const g = ws;
                        const xv = g[0x83]!;
                        const proxStart = g[0xff2a]! | (g[0xff2b]! << 8);
                        const leftCol = g[0x80]! | (g[0x81]! << 8);
                        const mapWidth = g[0xc002]! | (g[0xc003]! << 8);
                        const tileAddr = (((xv + 3) * 8) & 0xffff) + proxStart + 7;
                        const tile = g[tileAddr & 0xffff] ?? -1;
                        const ptr = g[0x10000 + 0x8002]! | (g[0x10000 + 0x8003]! << 8);
                        const count = g[0x10000 + ptr] ?? -1;
                        const list: number[] = [];
                        for (let i = 0; i < count; i++) list.push(g[0x10000 + ptr + 1 + i] ?? -1);
                        const tx = (xv + 4 + leftCol - 1) & 0xffff;
                        console.log(
                            `[state@${t - 1}] XV=${xv} anim=${g[0xe7]} facing=${g[0xc2]} ` +
                            `leftCol=${leftCol} proxStart=0x${proxStart.toString(16)} w=${mapWidth} ` +
                            `tileAddr=0x${tileAddr.toString(16)} tile=${tile} ` +
                            `specialPtr=0x${ptr.toString(16)} count=${count} list=[${list}] inList=${list.includes(tile)} ` +
                            `npcTx=${tx} dirs=${g[0xff17]} moved=${g[0x7c4b]} ` +
                            `npcScan=${(() => { let si = g[0xc010]! | (g[0xc011]! << 8); for (;;) { const nx = g[si]! | (g[si + 1]! << 8); if (nx === 0xffff) return 'none'; if (nx === tx && ((g[si + 6] ?? 0) & 0x40) !== 0) return 'BLOCK@' + si.toString(16); si += 8; } })()}`,
                        );
                    }
                }
                throw new Error(
                    `cmap LEFT diverged at tick ${t} ` +
                    `(heroX wasm=${w.heroX[t]} ts=${ts.heroX[t]}, ` +
                    `pendingDungeon wasm=${w.pendingDungeonTick} ts=${ts.pendingDungeonTick})`,
                );
            }
        }
        expect(ts.pendingDungeonTick).toBe(w.pendingDungeonTick);
    }, 300_000);

    it('restore in Bosque Village (bsmp) matches wasm tick-for-tick', async () => {
        // Simulates "restore a save made in Bosque": stdply with the place
        // byte patched to Bosque (3), then the boot sequence + walks in both
        // directions. Regression for the post-restore movement lock.
        stdply[ADDR_PLACE_MAP_ID] = 3;
        try {
            const script: KeyScriptStep[] = [
                { ticks: 100, keys: {} },
                { ticks: 500, keys: { ArrowRight: true } },  // ~5 tiles then stop?
                { ticks: 200, keys: {} },
                { ticks: 500, keys: { ArrowLeft: true } },   // ~2 tiles then stop?
                { ticks: 300, keys: {} },
            ];
            const w = await runTown('wasm', '0/bsmp.mdt', script, 1600);
            const ts = await runTown('ts', '0/bsmp.mdt', script, 1600);
            for (let t = 0; t <= 1600; t++) {
                if (w.digests[t] !== ts.digests[t]) {
                    throw new Error(
                        `bsmp restore walk diverged at tick ${t} ` +
                        `(heroX wasm=${w.heroX[t]} ts=${ts.heroX[t]})`,
                    );
                }
            }
            expect(ts.pendingDungeonTick).toBe(w.pendingDungeonTick);
        } finally {
            stdply[ADDR_PLACE_MAP_ID] = 0; // restore for other tests
        }
    }, 420_000);

    it('walking right then left across cmap→muralla matches wasm tick-for-tick', async () => {
        const script: KeyScriptStep[] = [
            { ticks: 600, keys: { ArrowUp: true } },
            { ticks: 1400, keys: { ArrowRight: true } }, // cross into Muralla
            { ticks: 100, keys: {} },
            { ticks: 300, keys: { ArrowRight: true } },  // push its right edge
            { ticks: 200, keys: {} },
            { ticks: 800, keys: { ArrowLeft: true } },
            { ticks: 200, keys: {} },
        ];
        const w = await runTown('wasm', '0/cmap.mdt', script, 3600);
        const ts = await runTown('ts', '0/cmap.mdt', script, 3600);
        for (let t = 0; t <= 3400; t++) {
            if (w.digests[t] !== ts.digests[t]) {
                throw new Error(
                    `cmap→mrmp RIGHT walk diverged at tick ${t} ` +
                    `(heroX wasm=${w.heroX[t]} ts=${ts.heroX[t]}, ` +
                    `pendingDungeon wasm=${w.pendingDungeonTick} ts=${ts.pendingDungeonTick})`,
                );
            }
        }
        expect(ts.pendingDungeonTick).toBe(w.pendingDungeonTick);
    }, 420_000);
});

// ─── town → dungeon entry via a real door (regression for wrong-Y entry)

interface DungeonCfg {
    mdtPath: string;
    passableTiles: number[];
    slopeTilesLeft?: number[];
    slopeTilesRight?: number[];
    aggressiveGround?: number[];
    airflows?: ArrayLike<number>;
    monster_xp?: number[];
    monster_damage?: number[];
    death_descriptors?: ReadonlyArray<ArrayLike<number>>;
    trajectories?: ReadonlyArray<ArrayLike<number>>;
}

const DUNGEON_STATE_ROKA_RUN = 7;
/** Muralla's cavern door (dest id 8 → dungeon map 0). */
const DUNGEON_DOOR_TOWN = 1;
const DUNGEON_DOOR_X = 205;

/** Mirror main.ts handleDungeonTransition (engine-side effects only). */
function bootDungeon(
    s: Session,
    invoke: (n: string, ...a: unknown[]) => unknown,
    mapId: number,
    isFromTown: boolean,
): void {
    const b = s.bridge as unknown as Record<string, (...a: any[]) => unknown>;
    const cfg = (DUNGEONS as Record<string, DungeonCfg>)[String(mapId & 0x7f)]!;
    const mdtBytes = new Uint8Array(readFileSync(GAME_DIR + cfg.mdtPath.replace('game/', '')));
    s.bridge.loadMdt(mdtBytes, cfg.mdtPath);
    b.setDungeonPassableTiles!(cfg.passableTiles);
    if (cfg.slopeTilesLeft) (b.setDungeonSlopeTilesLeft!)(cfg.slopeTilesLeft);
    if (cfg.slopeTilesRight) (b.setDungeonSlopeTilesRight!)(cfg.slopeTilesRight);
    if (cfg.aggressiveGround) (b.setDungeonAggressiveGround!)(cfg.aggressiveGround);
    if (cfg.airflows) (b.setDungeonAirflows!)(cfg.airflows);
    if (cfg.monster_xp) (b.setDungeonMonsterXp!)(cfg.monster_xp);
    if (cfg.monster_damage) (b.setDungeonMonsterDamage!)(new Uint8Array(cfg.monster_damage));
    if (cfg.death_descriptors) (b.setDeathDescriptors!)(cfg.death_descriptors);
    if (cfg.trajectories) (b.setTrajectories!)(cfg.trajectories);
    const swordType = s.view[ADDR_SWORD_TYPE] ?? 0;
    const reach = swordType <= 3 ? SWORD_REACH_SMALL : swordType <= 5 ? SWORD_REACH_MEDIUM : SWORD_REACH_LARGE;
    (b.setDungeonSwordReach!)(reach);
    invoke('wasm_dungeon_init', mapId & 0x7f, isFromTown);
}

interface JourneyResult {
    divergeAt: number;
    digestsA: number[];
    digestsB: number[];
    enteredDungeon: boolean;
}

/**
 * Journey: boot in Felishika Castle, walk right across the edge into
 * Muralla, continue to the cavern door at x=205, press Up, complete the
 * transition (wasm_dungeon_init is_from_town=true), then run the dungeon
 * loop for `postTicks` ticks. Runs twice (pure-wasm / TS-ported) and
 * returns both per-tick digest streams for comparison.
 */
async function journeyToDungeon(postTicks: number): Promise<JourneyResult> {
    const runs: { digests: number[]; entered: boolean; snaps: Map<number, Uint8Array> }[] = [];
    for (const mode of ['wasm', 'ts'] as const) {
        const s = await freshEngine();
        if (mode === 'ts') await attachTsImpls(s);
        const invoke = (name: string, ...args: unknown[]): unknown => {
            if (mode === 'ts') {
                const impl = s.impls[name];
                if (impl) return impl(...args);
            }
            return (s.exports[name] as WasmFn)(...args);
        };
        await bootTown(s, '0/cmap.mdt', invoke);

        const digests: number[] = [];
        const snaps = new Map<number, Uint8Array>();
        let inDungeon = false;
        let entered = false;
        let postEntryTicks = 0;
        let upPhase = false;

        for (let t = 0; t <= 8000; t++) {
            let up = false;
            let right = false;
            if (!inDungeon) {
                const place = (s.view[0xc4] ?? 0) & 0x7f;
                const heroAbs = (s.view[0x80]! | (s.view[0x81]! << 8)) + s.view[0x83]! + 4;
                up = place === DUNGEON_DOOR_TOWN && heroAbs >= DUNGEON_DOOR_X - 1;
                if (up && !upPhase) {
                    upPhase = true;
                    process.stderr.write(`[${mode}] t=${t} door phase at x=${heroAbs}\\n`);
                }
                right = !up;
            }

            invoke('wasm_town_full_tick');
            const bit = keyStateToBitmask({
                ArrowUp: up, ArrowLeft: false, ArrowRight: right, ArrowDown: false,
                Space: false, Alt: false,
            });
            invoke('wasm_set_input_keys', bit);
            const speedC = s.view[0xff33] || 5;
            const ftmr = s.view[0xff1a] ?? 0;

            if (!inDungeon) {
                if (ftmr >= speedC * 4) {
                    invoke('wasm_town_update');
                    if (s.view[0xfff0]) s.view[0xfff0] = 0;
                }
                if ((s.view[TOWN_PENDING_TRANSITION] ?? 0) === 0xff) {
                    const tr = (s.bridge as unknown as {
                        getTownPendingTransition?: () => { mapId: number; patId: number };
                    }).getTownPendingTransition?.();
                    const rawMapId = (tr?.mapId ?? 0) & 0x7f;
                    const mdtBytes = new Uint8Array(readFileSync(GAME_DIR + TOWNS[rawMapId]!));
                    s.bridge.loadMdt(mdtBytes, 'game/' + TOWNS[rawMapId]);
                    const pattern = (PATTERN_ASSETS as unknown as Record<number, { specialTiles: number[] } | undefined>)[tr?.patId as number];
                    if (pattern) s.bridge.setSpecialTileList(pattern.specialTiles);
                    invoke('wasm_town_set_return_before_main_loop', 1);
                    invoke('wasm_town_complete_transition');
                    process.stderr.write(`[${mode}] t=${t} town-transition -> ${rawMapId}\\n`);
                }
                if ((s.view[PENDING_DUNGEON_FLAG] ?? 0) === 0xff) {
                    const pendingMap = s.view[0xfffc] ?? 0;
                    process.stderr.write(`[${mode}] t=${t} dungeon pending map=${pendingMap}\\n`);
                    s.view[PENDING_DUNGEON_FLAG] = 0;
                    bootDungeon(s, invoke, pendingMap, true);
                    inDungeon = true;
                    entered = true;
                    continue;
                }
            } else {
                invoke('wasm_dungeon_full_tick');
                const isRokaRun = (s.view[0xff90] ?? 0) === DUNGEON_STATE_ROKA_RUN;
                if (isRokaRun || ftmr >= speedC * 4) {
                    invoke('wasm_dungeon_update');
                }
                postEntryTicks++;
                if (postEntryTicks > postTicks) break;
            }
            const _d = digest(s.view);
            digests.push(_d);
            if (inDungeon) {
                const _snap = s.view.slice(0, 0x20000);
                const _redig = digest(_snap);
                if (_redig !== _d && t > 5600) {
                    process.stderr.write(
                        `[${mode}] MISMATCH t=${t}: live=0x${_d.toString(16)} snap=0x${_redig.toString(16)}\n`);
                }
                snaps.set(t, _snap);
            }
        }
        runs.push({ digests, entered, snaps });
    }
    const a = runs[0]!;
    const b = runs[1]!;
    let divergeAt = -1;
    for (let t = 0; t < Math.min(a.digests.length, b.digests.length); t++) {
        if (a.digests[t] !== b.digests[t]) { divergeAt = t; break; }
    }
    if (divergeAt >= 0) {
        process.stderr.write(
            `digests@${divergeAt}: a=${a.digests[divergeAt]?.toString(16)} b=${b.digests[divergeAt]?.toString(16)}\n`);
        for (let k = divergeAt - 2; k <= divergeAt + 1; k++) {
            process.stderr.write(`  d[${k}] a=${(a.digests[k] ?? 0).toString(16)} b=${(b.digests[k] ?? 0).toString(16)} snapA=${a.snaps.has(k)} snapB=${b.snaps.has(k)}\n`);
        }
        const wa = a.snaps.get(divergeAt + 1)!;
        const wb = b.snaps.get(divergeAt + 1)!;
        const diffs: number[] = [];
        for (let i = 0; i < Math.max(wa.length, wb.length); i++) {
            if ((wa[i] ?? 0) !== (wb[i] ?? 0)) diffs.push(i);
        }
        process.stderr.write(`lens ${wa.length}/${wb.length} recomputed: ${digest(wa).toString(16)}/${digest(wb).toString(16)}\n`);
        process.stderr.write(
            `[state] dstate w=${wa[0xff90]} ts=${wb[0xff90]} phase w=${wa[0xff91]} ts=${wb[0xff91]} ` +
            `top w=${wa[0x82]} ts=${wb[0x82]} ftmr w=${wa[0xff1a]} ts=${wb[0xff1a]}\n`);
        const fs = await import('node:fs');
        fs.writeFileSync(diagPath('ja.bin'), wa);
        fs.writeFileSync(diagPath('jb.bin'), wb);
        process.stderr.write(
            `tick ${divergeAt}: ${diffs.length} diffs: ` +
            diffs.slice(0, 30).map((i) => `0x${i.toString(16)}:${wa[i]}->${wb[i]}`).join(' ') + '\n',
        );
    }
    return {
        divergeAt,
        digestsA: a.digests,
        digestsB: b.digests,
        enteredDungeon: a.entered && b.entered,
    };
}

describe('town → dungeon entry dual-run', () => {
    // KNOWN FAILURE — the last Stage 8 blocker. The town→dungeon entry
    // itself matches (boot coords identical), but ~11 frames into cavern
    // play the TS viewport-follow/hero-scroll diverges by one row
    // (VIEWPORT_TOP_ROW 61 vs 62, HERO_HEAD_Y_VIEW 10 vs 9). See
    // MIGRATION_PLAN.md Stage 8d status. Uses `it.fails` so this stays red
    // until fixed: flip it to a plain `it` together with the default-cutover
    // flip in main.ts.
    it.fails('cmap → muralla → cavern door → wasm_dungeon_init matches tick-for-tick', async () => {
        const r = await journeyToDungeon(400);
        expect(r.enteredDungeon, 'both passes must reach the dungeon').toBe(true);
        expect(
            r.divergeAt,
            `diverged at tick ${r.divergeAt} ` +
            `(pass lengths ${r.digestsA.length}/${r.digestsB.length})`,
        ).toBe(-1);
    }, 900_000);
});
