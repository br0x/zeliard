/**
 * replay-runner.ts — replays a golden fixture against a live wasm instance
 * (Stage 5d). Used by tests/replay.test.ts in Node; reusable later for
 * shadow-mode verification of TS-ported subsystems.
 */

import type { ZeliardExports } from '../bridge.js';
import * as bridge from '../bridge.js';
import { keyStateToBitmask } from '../memory.js';
import type { KeyState } from '../memory.js';
import { digestRegionByName, thawArgs } from './replay-types.js';
import { getRegion, regionAbsoluteStart } from '../inventory.js';
import type { ReplayCheckpoint, ReplayFixture } from './replay-types.js';

export interface ReplayMismatch {
    afterEvent: number;
    region: string;
    expected: string;
    actual: string;
    /** Exact differing offsets when raw bytes were recorded for the region. */
    byteDiffs?: Array<{ addr: number; expected: number; actual: number }>;
}

/**
 * Invoke one recorded call. Wasm-export names go straight to the instance;
 * TS→memory configuration writes (loadMdt, setDungeonPassableTiles, …) are
 * bridge wrapper functions operating on the same singleton instance.
 */
function invokeCall(
    exports: ZeliardExports,
    name: string,
    args: unknown[],
): unknown {
    switch (name) {
        case 'wasm_set_input_keys':
            return exports.wasm_set_input_keys(keyStateToBitmask(args[0] as KeyState));
        case 'wasm_dungeon_init':
            return exports.wasm_dungeon_init(args[0] as number, Number(args[1]));
        default: {
            const exportFn = (exports as unknown as Record<string, unknown>)[name];
            if (typeof exportFn === 'function') return (exportFn as (...a: unknown[]) => unknown)(...args);
            const bridgeFn = (bridge as unknown as Record<string, unknown>)[name];
            if (typeof bridgeFn === 'function') return (bridgeFn as (...a: unknown[]) => unknown)(...args);
            throw new Error(`no wasm export or bridge wrapper named "${name}"`);
        }
    }
}

/**
 * Invoke a recorded call on a TS replacement implementation, replicating the
 * argument marshaling invokeCall performs for wasm.
 */
function applyCall(
    exports: ZeliardExports,
    name: string,
    args: unknown[],
    tsImpl: (...a: unknown[]) => unknown,
): void {
    if (name === 'wasm_set_input_keys') {
        tsImpl(keyStateToBitmask(args[0] as KeyState));
    } else {
        tsImpl(...args);
    }
    void exports;
}

/**
 * Replay all events and verify every checkpoint. The gmemView accessor must
 * yield the live g_mem-relative view of the instance's memory.
 *
 * `impls` optionally reroutes recorded calls to TS implementations (cutover
 * verification): keys are op names, values replacement functions receiving
 * the same marshaled args the wasm export would.
 */
export function replayFixture(
    fixture: ReplayFixture,
    exports: ZeliardExports,
    getGmemView: () => Uint8Array | null,
    impls: Record<string, (...args: unknown[]) => unknown> = {},
): ReplayMismatch[] {
    const checkpoints = new Map<number, ReplayCheckpoint>();
    for (const cp of fixture.checkpoints) {
        if (checkpoints.has(cp.afterEvent)) {
            throw new Error(`duplicate checkpoint at event ${cp.afterEvent}`);
        }
        checkpoints.set(cp.afterEvent, cp);
    }

    const mismatches: ReplayMismatch[] = [];

    fixture.events.forEach((event, index) => {
        if (event.k === 'call') {
            const args = thawArgs(event.name, event.args);
            const tsImpl = impls[event.name];
            if (tsImpl) {
                applyCall(exports, event.name, args, tsImpl);
            } else {
                invokeCall(exports, event.name, args);
            }
        } else {
            const mem = getGmemView();
            if (!mem) throw new Error('g_mem view unavailable during replay');
            mem.set(event.bytes, event.addr);
        }

        const cp = checkpoints.get(index);
        if (!cp) return;
        const mem = getGmemView();
        if (!mem) throw new Error('g_mem view unavailable at checkpoint');
        for (const [regionName, expectedDigest] of Object.entries(cp.digests)) {
            const actual = digestRegionByName(mem, regionName);
            if (actual === expectedDigest) continue;
            const mismatch: ReplayMismatch = {
                afterEvent: index,
                region: regionName,
                expected: expectedDigest,
                actual,
            };
            const raw = cp.rawSmall?.[regionName];
            if (raw) {
                const region = getRegion(regionName);
                const start = regionAbsoluteStart(region);
                const diffs: NonNullable<ReplayMismatch['byteDiffs']> = [];
                for (let off = 0; off < raw.length; off++) {
                    const e = raw[off] ?? 0;
                    const a = mem[start + off] ?? 0;
                    if (e !== a) diffs.push({ addr: start + off, expected: e, actual: a });
                }
                mismatch.byteDiffs = diffs.slice(0, 32);
            }
            mismatches.push(mismatch);
        }
    });

    // A checkpoint whose index was never reached means the recording is
    // truncated relative to its own metadata.
    const lastIndex = fixture.events.length - 1;
    for (const idx of checkpoints.keys()) {
        if (idx > lastIndex) {
            throw new Error(`checkpoint references event ${idx} beyond recorded length`);
        }
    }

    return mismatches;
}
