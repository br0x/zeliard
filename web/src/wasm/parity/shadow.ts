/**
 * shadow.ts — parity shadow-mode harness (Stage 5c).
 *
 * Dual-runs a wasm export and its TS port on the same inputs and asserts
 * their observable outputs (return value + watched g_mem regions) match.
 * Divergences are recorded with a memory-diff dump; nothing ships in normal
 * builds because wrapping only happens when something attaches the harness
 * to an export (via the `__zeliard.shadow` debug hook or tests).
 *
 * Per call:
 *   1. snapshot watched regions (pre-state)
 *   2. run the wasm implementation → snapshot again (wasm output)
 *   3. restore the pre-state so the TS side sees exactly what wasm saw —
 *      this includes any RNG state bytes once the engine RNG is ported;
 *      always list RNG state among the watched regions for functions that
 *      consume it, otherwise the two runs diverge on every roll
 *   4. run the TS implementation → snapshot (TS output)
 *   5. compare return values (Object.is unless overridden) and region bytes
 *
 * Memory is fixed-size in the current build; if it ever grows, snapshots
 * must be re-taken per phase (views detach) — noted here for stage 10.
 */

import type { DispatchableEngine, DispatchableName } from '../dispatch.js';
import { getRegion, regionAbsoluteStart } from '../inventory.js';

/** How one shadowed export is compared. */
export interface ShadowSpec {
    /** Inventory region names whose byte content is the observable output. */
    regions?: readonly string[];
    /** Custom return comparator; defaults to Object.is. */
    compareReturn?: <R>(wasm: R, ts: R) => boolean;
    /** Max differing offsets recorded per memory divergence (default 16). */
    maxDiffs?: number;
}

export interface RegionDiff {
    region: string;
    /** Byte offset within the region (not g_mem-absolute). */
    offset: number;
    wasm: number;
    ts: number;
}

export interface ShadowDivergence {
    exportName: string;
    kind: 'return' | 'memory';
    args: readonly unknown[];
    wasmReturn?: unknown | undefined;
    tsReturn?: unknown | undefined;
    diffs: readonly RegionDiff[];
    /** Hex dumps of the first diverging region, wasm vs ts output. */
    wasmDump?: string | undefined;
    tsDump?: string | undefined;
}

export interface ShadowStats {
    calls: number;
    divergences: readonly ShadowDivergence[];
}

const MAX_STORED_DIVERGENCES = 50;

function hexDump(bytes: Uint8Array, limit = 256): string {
    const lines: string[] = [];
    const end = Math.min(bytes.length, limit);
    for (let i = 0; i < end; i += 16) {
        let row = `${i.toString(16).padStart(4, '0')}: `;
        for (let j = i; j < Math.min(i + 16, end); j++) {
            row += (bytes[j] ?? 0).toString(16).padStart(2, '0') + ' ';
        }
        lines.push(row.trimEnd());
    }
    if (bytes.length > limit) lines.push(`… (${bytes.length - limit} more bytes)`);
    return lines.join('\n');
}

interface RegionSnapshot {
    name: string;
    absStart: number;
    bytes: Uint8Array;
}

type AnyImpl = (...args: unknown[]) => unknown;

export class ShadowHarness {
    private stats = new Map<DispatchableName, { calls: number; divergences: ShadowDivergence[] }>();

    constructor(private readonly getGmemView: () => Uint8Array | null) {}

    /**
     * Wrap an export's wasm implementation with its TS counterpart. The
     * returned function runs both sides, restores pre-state between them,
     * records divergences (console.error + stats), and returns the *wasm*
     * result — game behavior is unchanged either way.
     */
    wrap<N extends DispatchableName>(
        exportName: N,
        wasmFn: DispatchableEngine[N],
        tsFn: DispatchableEngine[N],
        spec: ShadowSpec = {},
    ): DispatchableEngine[N] {
        return ((...args: Parameters<DispatchableEngine[N]>) => {
            const mem = this.getGmemView();
            if (!mem) {
                // No linear-memory view (e.g. engine not initialized):
                // verification is impossible; run wasm only.
                return (wasmFn as AnyImpl)(...args);
            }

            const regions = (spec.regions ?? []).map((regionName) => {
                const region = getRegion(regionName);
                return { name: region.name, absStart: regionAbsoluteStart(region), size: region.end - region.start };
            });

            const snap = (): RegionSnapshot[] =>
                regions.map((r) => ({
                    ...r,
                    bytes: mem.slice(r.absStart, r.absStart + r.size),
                }));
            const restore = (snaps: RegionSnapshot[]): void => {
                for (const s of snaps) mem.set(s.bytes, s.absStart);
            };

            const pre = snap();
            const wasmReturn = (wasmFn as AnyImpl)(...args);
            const wasmAfter = snap();
            restore(pre);
            const tsReturn = (tsFn as AnyImpl)(...args);
            const tsAfter = snap();

            const entry = this.stats.get(exportName) ?? { calls: 0, divergences: [] };
            entry.calls++;
            this.stats.set(exportName, entry);

            const maxDiffs = spec.maxDiffs ?? 16;

            const same =
                spec.compareReturn !== undefined
                    ? spec.compareReturn(wasmReturn, tsReturn)
                    : Object.is(wasmReturn, tsReturn);
            if (!same) {
                this.record(exportName, {
                    exportName,
                    kind: 'return',
                    args,
                    wasmReturn,
                    tsReturn,
                    diffs: [],
                });
            }

            const diffs: RegionDiff[] = [];
            let dumpPair: { wasm: string; ts: string } | undefined;
            for (let i = 0; i < regions.length; i++) {
                const wa = wasmAfter[i]!;
                const ta = tsAfter[i]!;
                for (let off = 0; off < wa.bytes.length; off++) {
                    const w = wa.bytes[off] ?? 0;
                    const t = ta.bytes[off] ?? 0;
                    if (w !== t) {
                        diffs.push({ region: regions[i]!.name, offset: off, wasm: w, ts: t });
                        dumpPair ??= {
                            wasm: hexDump(wa.bytes),
                            ts: hexDump(ta.bytes),
                        };
                        if (diffs.length >= maxDiffs) break;
                    }
                }
                if (diffs.length >= maxDiffs) break;
            }
            if (diffs.length > 0) {
                this.record(exportName, {
                    exportName,
                    kind: 'memory',
                    args,
                    diffs,
                    wasmDump: dumpPair?.wasm,
                    tsDump: dumpPair?.ts,
                });
            }

            return wasmReturn;
        }) as DispatchableEngine[N];
    }

    private record(name: DispatchableName, divergence: ShadowDivergence): void {
        const entry = this.stats.get(name)!;
        if (entry.divergences.length < MAX_STORED_DIVERGENCES) {
            entry.divergences.push(divergence);
        }
        console.error(
            `[shadow] ${name} (${divergence.kind}) diverged:`,
            JSON.stringify(divergence.args),
            divergence.kind === 'return'
                ? `wasm=${String(divergence.wasmReturn)} ts=${String(divergence.tsReturn)}`
                : divergence.diffs
                      .slice(0, 8)
                      .map((d) => `${d.region}+${d.offset}: wasm=${d.wasm} ts=${d.ts}`)
                      .join(', '),
            divergence.wasmDump ? `\nwasm:\n${divergence.wasmDump}\nts:\n${divergence.tsDump}` : '',
        );
    }

    statsFor(name: DispatchableName): ShadowStats {
        const entry = this.stats.get(name);
        return entry
            ? { calls: entry.calls, divergences: [...entry.divergences] }
            : { calls: 0, divergences: [] };
    }

    totals(): { calls: number; divergences: number } {
        let calls = 0;
        let divergences = 0;
        for (const e of this.stats.values()) {
            calls += e.calls;
            divergences += e.divergences.length;
        }
        return { calls, divergences };
    }

    /** True when everything shadowed so far matched bit-for-bit. */
    isClean(): boolean {
        return this.totals().divergences === 0;
    }

    reset(): void {
        this.stats.clear();
    }
}
