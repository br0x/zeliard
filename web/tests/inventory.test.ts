import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as memory from '../src/wasm/memory.js';
import { SEG1_BASE } from '../src/wasm/memory.js';
import { initWasmFromBytes } from '../src/wasm/bridge.js';
import {
    ENGINE_EXPORT_ENTRIES,
    ENGINE_REGIONS,
    exportsForStage,
    getRegion,
    regionAbsoluteStart,
    regionsForStage,
} from '../src/wasm/inventory.js';
import type { MemoryRegion, PortStage } from '../src/wasm/inventory.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));

const STAGES: readonly PortStage[] = [5, 6, 7, 8, 9, 10];

// ============================================================================
// Region table sanity
// ============================================================================

describe('region table sanity', () => {
    it('has unique names', () => {
        const names = ENGINE_REGIONS.map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('has non-empty extents and descriptions', () => {
        for (const r of ENGINE_REGIONS) {
            expect(r.end, `${r.name}: end must exceed start`).toBeGreaterThan(r.start);
            expect(r.description.trim().length, `${r.name}: needs a description`).toBeGreaterThan(0);
            expect(['glue', 'town', 'dungeon', 'enemies', 'data', 'render', 'audio', 'save'])
                .toContain(r.owner);
        }
    });

    it('regions never overlap (no explicit overlaps declared yet)', () => {
        const sorted = [...ENGINE_REGIONS].sort((a, b) =>
            regionAbsoluteStart(a) - regionAbsoluteStart(b));
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1]!;
            const curr = sorted[i]!;
            if (!prev.overlaps?.includes(curr.name) && !curr.overlaps?.includes(prev.name)) {
                expect(
                    regionAbsoluteStart(curr),
                    `${curr.name} overlaps ${prev.name}`,
                ).toBeGreaterThanOrEqual(regionAbsoluteStart(prev) + (prev.end - prev.start));
            }
        }
    });

    it('reads/writes reference known regions only', () => {
        const names = new Set(ENGINE_REGIONS.map((r) => r.name));
        for (const e of ENGINE_EXPORT_ENTRIES) {
            for (const ref of [...e.reads, ...e.writes]) {
                expect(names.has(ref), `${e.name} references unknown region "${ref}"`).toBe(true);
            }
            expect(e.notes.trim().length, `${e.name}: needs notes`).toBeGreaterThan(0);
            expect(e.signature.trim().length, `${e.name}: needs a signature`).toBeGreaterThan(0);
        }
    });
});

// ============================================================================
// Drift guard: every memory.ts address constant is claimed by exactly one
// region. Adding an ADDR_* constant without an inventory row fails here.
// ============================================================================

/** Constants that are seg1-relative offsets rather than direct g_mem addresses. */
const CONSTANT_SEGMENTS: Record<string, 0 | 1> = {
    REACH_TABLE_OFFSET: 1,
    REACH_LISTS_OFFSET: 1,
};

interface ClaimedConstant {
    name: string;
    /** g_mem-absolute address after segment mapping. */
    absolute: number;
}

function collectAddressConstants(): ClaimedConstant[] {
    const claimed: ClaimedConstant[] = [];
    for (const [name, value] of Object.entries(memory)) {
        if (!/^(ADDR_|MEM_|REACH_)/.test(name)) continue;
        if (typeof value === 'number') {
            const segment = CONSTANT_SEGMENTS[name] ?? 0;
            claimed.push({ name, absolute: segment === 1 ? SEG1_BASE + value : value });
        } else if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
            // e.g. ADDR_SPELL_COUNTS — every element must be claimed.
            for (const v of value as number[]) {
                claimed.push({ name: `${name}[${v}]`, absolute: v });
            }
        }
    }
    return claimed;
}

describe('memory.ts constants are covered by the inventory', () => {
    const constants = collectAddressConstants();

    it('found a non-trivial number of constants', () => {
        expect(constants.length).toBeGreaterThan(80);
    });

    it('claims each constant in exactly one region', () => {
        for (const c of constants) {
            const containing = ENGINE_REGIONS.filter(
                (r) => regionAbsoluteStart(r) <= c.absolute && c.absolute < regionAbsoluteStart(r) + (r.end - r.start),
            );
            expect(
                containing.map((r) => r.name),
                `${c.name} (0x${c.absolute.toString(16)}) must be claimed by exactly one region`,
            ).toHaveLength(1);
        }
    });
});

// ============================================================================
// Porting tracker helpers
// ============================================================================

describe('porting tracker', () => {
    it('stages 5, 7 and 8 port exports; every stage retires regions', () => {
        // Stages 6/9 port C internals with no dedicated wasm export surface
        // (data decoders, eai/boss AI inside dungeon_update), so they show up
        // in the region table rather than the export table.
        for (const stage of [5, 7, 8] as const) {
            expect(exportsForStage(stage).length, `stage ${stage} exports`).toBeGreaterThan(0);
        }
        for (const stage of STAGES) {
            expect(regionsForStage(stage).length, `stage ${stage} regions`).toBeGreaterThan(0);
        }
    });

    it('regionsForStage filters by port stage', () => {
        for (const stage of STAGES) {
            for (const r of regionsForStage(stage)) {
                expect(r.portStage).toBe(stage);
            }
        }
        // Union over all stages covers every region exactly once.
        const total = STAGES.reduce((n, s) => n + regionsForStage(s).length, 0);
        expect(total).toBe(ENGINE_REGIONS.length);
    });

    it('getRegion throws on unknown names', () => {
        expect(() => getRegion('nope')).toThrow(/Unknown memory region/);
        expect(getRegion('input-latches').owner).toBe('glue');
    });

    it('region entries are well-typed MemoryRegions', () => {
        const sample: MemoryRegion = ENGINE_REGIONS[0]!;
        expect(sample.portStage).toBeGreaterThanOrEqual(5);
        expect(sample.segment === 0 || sample.segment === 1).toBe(true);
    });
});

// ============================================================================
// Export list vs the real wasm binary
// ============================================================================

describe('export inventory vs zeliard.wasm', () => {
    let exports: WebAssembly.Exports;

    beforeAll(() => {
        const bytes = new Uint8Array(readFileSync(WASM_PATH));
        const instance = initWasmFromBytes(bytes);
        exports = instance.exports;
    });

    it('lists every export name exactly once', () => {
        const names = ENGINE_EXPORT_ENTRIES.map((e) => e.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('binary provides every inventoried export', () => {
        for (const entry of ENGINE_EXPORT_ENTRIES) {
            expect(exports, `missing export: ${entry.name}`).toHaveProperty(entry.name);
        }
    });
});
