/**
 * combat-dual-run.test.ts — real-input combat dual-run in mp10 (Cavern of
 * Malicia): boot through the actual Muralla door path, walk right until the
 * first monster approaches, swing until it dies (SPACEBAR latch + reach
 * list via apply_sword_hit), keep walking over the corpse / drop for ~900
 * ticks. Per-tick full-seg digests compared pure-wasm vs TS-ported; a
 * divergence is reported at the exact tick.
 *
 * Added after play-testing found the dead-monster flags regression (the
 * `state_nibble | 0x70` drop in default_0toF_handler) that no synthetic
 * parity scenario covered.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { diagPath } from './diag-path.js';
import { fileURLToPath } from 'node:url';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));
const GAME_DIR = fileURLToPath(new URL('../public/game/', import.meta.url));
const binary = new Uint8Array(readFileSync(WASM_PATH));
const stdply = new Uint8Array(readFileSync(GAME_DIR + 'stdply.bin'));

import { ADDR_HEARTBEAT_VOLUME, keyStateToBitmask } from '../src/wasm/memory.js';
import { getTownPatId } from '../src/engine/mdt.js';
import { PATTERN_ASSETS, SWORD_REACH_SMALL } from '../src/data/assets.js';
import { DUNGEONS } from '../src/data/dungeons.js';

type WasmFn = (...args: unknown[]) => unknown;
interface Session {
    view: Uint8Array;
    exports: Record<string, WasmFn>;
    bridge: typeof import('../src/wasm/bridge.js');
    impls: Record<string, WasmFn>;
}

async function freshEngine(): Promise<Session> {
    vi.resetModules();
    const bridge = await import('../src/wasm/bridge.js');
    const instance = bridge.initWasmFromBytes(binary.slice());
    const view = bridge.getWasmMemory()!;
    return { view, exports: instance.exports as any, bridge, impls: {} };
}

async function attachTsImpls(s: Session): Promise<void> {
    const { PORTED_EXPORTS } = await import('../src/wasm/parity/ports.js');
    const { setInputKeys } = await import('../src/engine/input.js');
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

function digest(view: Uint8Array): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < 0x20000; i++) {
        h ^= view[i] ?? 0;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

function bootDungeon(
    s: Session,
    invoke: (n: string, ...a: unknown[]) => unknown,
    mapId: number,
    isFromTown: boolean,
): void {
    const b = s.bridge as any;
    const cfg = (DUNGEONS as any)[String(mapId & 0x7f)];
    const mdtBytes = new Uint8Array(readFileSync(GAME_DIR + cfg.mdtPath.replace('game/', '')));
    s.bridge.loadMdt(mdtBytes, cfg.mdtPath);
    b.setDungeonPassableTiles!(cfg.passableTiles);
    if (cfg.slopeTilesLeft) b.setDungeonSlopeTilesLeft!(cfg.slopeTilesLeft);
    if (cfg.slopeTilesRight) b.setDungeonSlopeTilesRight!(cfg.slopeTilesRight);
    if (cfg.aggressiveGround) b.setDungeonAggressiveGround!(cfg.aggressiveGround);
    if (cfg.airflows) b.setDungeonAirflows!(cfg.airflows);
    if (cfg.monster_xp) b.setDungeonMonsterXp!(cfg.monster_xp);
    if (cfg.monster_damage) b.setDungeonMonsterDamage!(new Uint8Array(cfg.monster_damage));
    if (cfg.death_descriptors) b.setDeathDescriptors!(cfg.death_descriptors);
    if (cfg.trajectories) b.setTrajectories!(cfg.trajectories);
    b.setDungeonSwordReach!(SWORD_REACH_SMALL);
    invoke('wasm_dungeon_init', mapId & 0x7f, isFromTown);
}

async function combatRun(mode: 'wasm' | 'ts') {
    const s = await freshEngine();
    if (mode === 'ts') await attachTsImpls(s);
    const invoke = (name: string, ...args: unknown[]): unknown => {
        if (mode === 'ts') {
            const impl = s.impls[name];
            if (impl) return impl(...args);
        }
        return (s.exports[name] as WasmFn)(...args);
    };
    const v = s.view;
    // Boot town (cmap).
    {
        const { loadMdt, loadSaveState } = s.bridge;
        invoke('wasm_town_init');
        loadSaveState(stdply.slice());
        v[ADDR_HEARTBEAT_VOLUME] = 0;
        const mdtBytes = new Uint8Array(readFileSync(GAME_DIR + '0/cmap.mdt'));
        loadMdt(mdtBytes, 'game/0/cmap.mdt');
        const patId = getTownPatId(mdtBytes);
        const pattern = (PATTERN_ASSETS as any)[patId as number];
        if (pattern && s.bridge.setSpecialTileList) s.bridge.setSpecialTileList(pattern.specialTiles);
        invoke('wasm_town_set_return_before_main_loop', 1);
        invoke('wasm_town_entry_disabling_edge_scroll');
    }

    const digests: number[] = [];
    const snaps = new Map<number, Uint8Array>();
    const PENDING_DUNGEON_FLAG = 0xfffd;
    const DUNGEON_DOOR_TOWN = 1;
    const DUNGEON_DOOR_X = 205;

    let inDungeon = false;
    let killTick = -1;
    let orbSeen = false;
    let dungeonTicks = 0;
    let postKillTicks = 0;

    for (let t = 0; t <= 14000; t++) {
        let up = false;
        let right = false;
        let swing = false;
        if (!inDungeon) {
            const place = (v[0xc4] ?? 0) & 0x7f;
            const heroAbs = (v[0x80]! | (v[0x81]! << 8)) + v[0x83]! + 4;
            up = place === DUNGEON_DOOR_TOWN && heroAbs >= DUNGEON_DOOR_X - 1;
            right = !up;
        } else {
            right = true;
            swing = killTick < 0 && dungeonTicks > 250 && dungeonTicks % 12 === 0;
        }

        invoke('wasm_town_full_tick');
        const bit = keyStateToBitmask({
            ArrowUp: up, ArrowDown: false, ArrowLeft: false,
            ArrowRight: right, Space: false, Alt: false,
        });
        invoke('wasm_set_input_keys', bit);
        const speedC = v[0xff33] || 5;
        const ftmr = v[0xff1a] ?? 0;

        if (!inDungeon) {
            if (ftmr >= speedC * 4) {
                invoke('wasm_town_update');
                if (v[0xfff0]) v[0xfff0] = 0;
            }
            const TOWN_PENDING_TRANSITION = 0xfff4;
            if ((v[TOWN_PENDING_TRANSITION] ?? 0) === 0xff) {
                const tr = (s.bridge as any).getTownPendingTransition?.();
                const rawMapId = (tr?.mapId ?? 0) & 0x7f;
                const towns = ['0/cmap.mdt', '0/mrmp.mdt', '0/stmp.mdt', '0/bsmp.mdt', '0/hlmp.mdt',
                    '0/tmmp.mdt', '0/drmp.mdt', '0/llmp.mdt', '0/prmp.mdt', '0/esmp.mdt'];
                const mdtBytes = new Uint8Array(readFileSync(GAME_DIR + towns[rawMapId]!));
                s.bridge.loadMdt(mdtBytes, 'game/' + towns[rawMapId]);
                const pattern = (PATTERN_ASSETS as any)[tr?.patId as number];
                if (pattern) s.bridge.setSpecialTileList(pattern.specialTiles);
                invoke('wasm_town_set_return_before_main_loop', 1);
                invoke('wasm_town_complete_transition');
                process.stderr.write(`[${mode}] t=${t} town-transition -> ${rawMapId}\n`);
            }
            if ((v[PENDING_DUNGEON_FLAG] ?? 0) === 0xff) {
                const pendingMap = v[0xfffc] ?? 0;
                v[PENDING_DUNGEON_FLAG] = 0;
                bootDungeon(s, invoke, pendingMap, true);
                inDungeon = true;
                process.stderr.write(`[${mode}] entered dungeon map=${pendingMap}\n`);
                continue;
            }
        } else {
            invoke('wasm_dungeon_full_tick');
            const isRokaRun = (v[0xff90] ?? 0) === 7;
            if (isRokaRun || ftmr >= speedC * 4) {
                if (swing) v[0xff1d] = 1; // SPACEBAR_LATCH edge
                invoke('wasm_dungeon_update');
                v[0xff1d] = 0;
            }
            dungeonTicks++;
            if (killTick >= 0) postKillTicks++;

            // kill / drop detection
            if (killTick < 0) {
                const base = v[0xc010]! | (v[0xc011]! << 8);
                for (let si = base, n = 0; n < 24; si += 16, n++) {
                    const cx = v[si]! | (v[si + 1]! << 8);
                    if (cx === 0xffff) break;
                    const fl = v[si + 4]!;
                    if ((cx >> 8) === 0xff || ((fl & 0x08) !== 0 && (fl & 0x60) !== 0)) {
                        killTick = t;
                        process.stderr.write(`[${mode}] KILL at t=${t} fl=0x${fl.toString(16)}\n`);
                        break;
                    }
                    const low = fl & 0x1f;
                    if (low === 0x14 || low === 0x15 || low === 0x1b) orbSeen = true;
                }
            }
            if (killTick >= 0 && postKillTicks > 900) break;
        }
        digests.push(digest(v));
        if (t % 500 === 0) process.stderr.write(`[${mode}] t=${t} dTicks=${dungeonTicks} kill=${killTick}\n`);
        if (inDungeon && digests.length >= 5790 && digests.length <= 5895) {
            snaps.set(digests.length - 1, v.slice(0, 0x20000));
        }
    }
    return { digests, snaps, killTick, orbSeen };
}

describe('tmp: mp10 combat dual-run', () => {
    it('walk right, swing until kill, walk over corpse', async () => {
        const w = await combatRun('wasm');
        const t = await combatRun('ts');
        console.log(`wasm: killTick=${w.killTick} orb=${w.orbSeen} len=${w.digests.length}`);
        console.log(`ts  : killTick=${t.killTick} orb=${t.orbSeen} len=${t.digests.length}`);
        let div = -1;
        for (let i = 0; i < Math.min(w.digests.length, t.digests.length); i++) {
            if (w.digests[i] !== t.digests[i]) { div = i; break; }
        }
        console.log('first diverging tick:', div);
        if (div >= 0) {
            const wa = w.snaps.get(div)!;
            const wb = t.snaps.get(div)!;
            const wp = w.snaps.get(div - 1)!;
            if (wa && wb && wp) {
                const diffs: number[] = [];
                for (let i = 0; i < wa.length; i++) if (wa[i] !== wb[i]) diffs.push(i);
                const fs = await import('node:fs');
                fs.writeFileSync(diagPath('combat-pre.bin'), wp);
                fs.writeFileSync(diagPath('combat-wa.bin'), wa);
                fs.writeFileSync(diagPath('combat-wb.bin'), wb);
                console.log(`diffs at ev ${div}: ${diffs.length}: ` +
                    diffs.slice(0, 20).map((i) => `0x${i.toString(16)}:${wa[i]}->${wb[i]}`).join(' '));
            } else {
                console.log('(no snapshot at divergence)', !!wa, !!wb, !!wp);
            }
        }
        expect(div).toBe(-1);
    }, 1_800_000);
});
