/**
 * recorder.ts — golden-replay fixture recorder (Stage 5d).
 *
 * Installed on the dispatch layer behind the `?zeliard_record=1` debug flag;
 * a Playwright spec drives gameplay and pulls the finished fixture via
 * `__zeliard.recorder.stop()`. Every dispatched call is captured with
 * JSON-cloneable args; TS-side g_mem writes are captured as poke events via
 * the wrapped writeMemory in main.ts. Checkpoints digest all non-audio
 * inventory regions every CHECKPOINT_EVERY events.
 */

import type { EngineDispatch } from '../dispatch.js';
import { ENGINE_REGIONS, getRegion } from '../inventory.js';
import { regionAbsoluteStart } from '../inventory.js';
import {
    REPLAY_SCHEMA_VERSION,
    digestRegionByName,
    toTransferable,
} from './replay-types.js';
import type { ReplayCheckpoint, ReplayEvent, ReplayFixture, ReplayHeader } from './replay-types.js';

function rawBytes(view: Uint8Array, regionName: string): number[] {
    const region = getRegion(regionName);
    const start = regionAbsoluteStart(region);
    return Array.from(view.slice(start, start + (region.end - region.start)));
}

export const CHECKPOINT_EVERY = 50;

/** Regions digested at checkpoints — everything except async audio state. */
export const DEFAULT_DIGEST_REGIONS: readonly string[] = ENGINE_REGIONS.filter(
    (r) => r.owner !== 'audio',
).map((r) => r.name);

/** Regions at or below this size are additionally stored raw per checkpoint,
 * letting the runner report exact byte offsets instead of digest mismatches. */
export const RAW_SNAPSHOT_MAX_BYTES = 256;

export class ReplayRecorder {
    private events: ReplayEvent[] = [];
    private checkpoints: ReplayCheckpoint[] = [];

    constructor(
        private readonly getGmemView: () => Uint8Array | null,
        private readonly digestRegions: readonly string[] = DEFAULT_DIGEST_REGIONS,
    ) {}

    /** Start capturing dispatched calls. */
    install(dispatch: EngineDispatch): void {
        dispatch.tap((name, args) => this.onCall(name, args));
    }

    private onCall(name: string, args: unknown[]): void {
        this.events.push({ k: 'call', name, args: toTransferable(args) as unknown[] });
        if (this.events.length % CHECKPOINT_EVERY === 0) this.checkpoint();
    }

    /**
     * Capture a raw g_mem write performed outside dispatched calls (main.ts's
     * wrapped writeMemory funnels every TS-side write here).
     */
    notePoke(addr: number, data: ArrayLike<number>): void {
        this.events.push({ k: 'poke', addr, bytes: Array.from(data) });
        // Pokes count toward checkpoint cadence so digests always land on a
        // fully-processed event index.
        if (this.events.length % CHECKPOINT_EVERY === 0) this.checkpoint();
    }

    private checkpoint(): void {
        const view = this.getGmemView();
        if (!view) return;
        const digests: Record<string, string> = {};
        const rawSmall: Record<string, number[]> = {};
        for (const name of this.digestRegions) {
            digests[name] = digestRegionByName(view, name);
            if ((getRegion(name).end - getRegion(name).start) <= RAW_SNAPSHOT_MAX_BYTES) {
                rawSmall[name] = rawBytes(view, name);
            }
        }
        this.checkpoints.push({ afterEvent: this.events.length - 1, digests, rawSmall });
    }

    stats(): { events: number; checkpoints: number } {
        return { events: this.events.length, checkpoints: this.checkpoints.length };
    }

    toFixture(header: Omit<ReplayHeader, 'schemaVersion'>): ReplayFixture {
        return {
            header: { ...header, schemaVersion: REPLAY_SCHEMA_VERSION },
            digestRegions: [...this.digestRegions],
            events: this.events,
            checkpoints: this.checkpoints,
        };
    }
}

let activeRecorder: ReplayRecorder | null = null;

export function setActiveRecorder(recorder: ReplayRecorder | null): void {
    activeRecorder = recorder;
}

/** The recorder receiving raw-write pokes (null unless recording). */
export function getActiveRecorder(): ReplayRecorder | null {
    return activeRecorder;
}
