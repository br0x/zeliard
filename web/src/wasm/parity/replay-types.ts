/**
 * replay-types.ts — golden-replay fixture schema (Stage 5d).
 *
 * Shared by the recorder (browser, via Playwright) and the runner (Node,
 * Vitest). A fixture captures a real gameplay session as:
 *
 *   events      — ordered `call` (dispatched engine op + args) and `poke`
 *                 (raw g_mem writes performed by TS between calls) entries;
 *   checkpoints — every CHECKPOINT_EVERY events, FNV-1a digests of all
 *                 non-audio inventory regions, taken after that event index.
 *
 * The runner replays events against a fresh wasm instance in Node and
 * compares region digests at each checkpoint. Audio-owned regions are
 * excluded: the sound driver consumes/clears them asynchronously in the
 * browser and has no Node counterpart.
 */

import { getRegion, regionAbsoluteStart } from '../inventory.js';

export const REPLAY_SCHEMA_VERSION = 1;

export interface ReplayHeader {
    schemaVersion: number;
    /** ISO timestamp of the recording session. */
    createdAt: string;
    /** First 16 hex chars of the wasm binary's SHA-256 (stale-fixture guard). */
    wasmSha256: string;
    /** Human label, e.g. "town-dungeon-basics". */
    session: string;
}

/** A dispatched engine call. Args are JSON-cloneable snapshots. */
export interface ReplayCallEvent {
    k: 'call';
    name: string;
    args: unknown[];
}

/** A raw g_mem write performed by TS between dispatched calls. */
export interface ReplayPokeEvent {
    k: 'poke';
    /** Offset relative to g_mem base (bridge.writeMemory semantics). */
    addr: number;
    bytes: number[];
}

export type ReplayEvent = ReplayCallEvent | ReplayPokeEvent;

/** Region digests taken right after event index `afterEvent` completed.
 * Small regions additionally carry raw bytes (`rawSmall`) so the runner can
 * report exact byte offsets on mismatch. */
export interface ReplayCheckpoint {
    afterEvent: number;
    digests: Record<string, string>;
    rawSmall?: Record<string, number[]>;
}

/**
 * Deep-clone call args into JSON-safe structures. Typed arrays become plain
 * number arrays (JSON has no typed arrays); the runner rewraps them via
 * `UINT8_ARG_INDEXES` before invoking bridge functions.
 */
export function toTransferable(value: unknown): unknown {
    if (value instanceof Uint8Array) return Array.from(value);
    if (Array.isArray(value)) return value.map(toTransferable);
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) out[k] = toTransferable(v);
        return out;
    }
    return value;
}

/** Ops whose argument at these positions must be a real Uint8Array again. */
export const UINT8_ARG_INDEXES: Record<string, readonly number[]> = {
    loadMdt: [0],
    loadSaveState: [0],
    setDungeonMonsterDamage: [0],
};

/** Rebuild Uint8Array arguments destroyed by JSON serialization. */
export function thawArgs(name: string, args: unknown[]): unknown[] {
    const indexes = UINT8_ARG_INDEXES[name];
    if (!indexes) return args;
    const out = [...args];
    for (const i of indexes) {
        const a = out[i];
        if (Array.isArray(a)) out[i] = new Uint8Array(a);
    }
    return out;
}

export interface ReplayFixture {
    header: ReplayHeader;
    digestRegions: readonly string[];
    events: ReplayEvent[];
    checkpoints: ReplayCheckpoint[];
}

/**
 * FNV-1a 32-bit over the bytes, prefixed with the length so empty vs short
 * regions can't collide: "<len-hex>:<hash-hex>".
 */
export function fnv1aDigest(bytes: Uint8Array): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i] ?? 0;
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return `${bytes.length.toString(16)}:${hash.toString(16).padStart(8, '0')}`;
}

/** Digest one inventory region out of a g_mem view. */
export function digestRegionByName(gmemView: Uint8Array, regionName: string): string {
    const region = getRegion(regionName);
    const start = regionAbsoluteStart(region);
    return fnv1aDigest(gmemView.subarray(start, start + (region.end - region.start)));
}
