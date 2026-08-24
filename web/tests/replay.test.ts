import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/replay/', import.meta.url));

const fixtures = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')).sort()
    : [];

interface EngineModule {
    initWasmFromBytes: typeof import('../src/wasm/bridge.js').initWasmFromBytes;
    getWasmMemory: typeof import('../src/wasm/bridge.js').getWasmMemory;
}

/**
 * The bridge holds module-level singleton state (instance + memory views),
 * so every replay boots a fresh engine by resetting the module registry.
 */
async function freshEngine(): Promise<EngineModule> {
    vi.resetModules();
    return await import('../src/wasm/bridge.js');
}

const binary = readFileSync(WASM_PATH);
const wasmSha256 = createHash('sha256').update(binary).digest('hex').slice(0, 16);

describe('golden replay', () => {
    it('has at least one recorded fixture (run REPLAY_RECORD=1 e2e/record.spec.ts)', () => {
        expect(fixtures.length, `no fixtures in ${FIXTURES_DIR}`).toBeGreaterThan(0);
    });

    describe.each(fixtures)('fixture %s', (fileName) => {
        let fixture: import('../src/wasm/parity/replay-types.js').ReplayFixture;

        beforeAll(() => {
            fixture = JSON.parse(
                readFileSync(FIXTURES_DIR + fileName, 'utf8'),
            ) as import('../src/wasm/parity/replay-types.js').ReplayFixture;
        });

        it('uses the current schema version', () => {
            expect(fixture.header.schemaVersion).toBe(1);
        });

        it('records its source-binary hash for diagnostics', () => {
            // NOTE: this is intentionally NOT a hard gate. CI rebuilds the
            // wasm from source (unpinned emsdk), so bytes differ between the
            // recording environment and test environments. Staleness is
            // caught behaviorally by the checkpoint digests below — if the
            // engine changed in any observable way, replay diverges loudly.
            expect(fixture.header.wasmSha256).toMatch(/^[0-9a-f]{16}$/);
            if (fixture.header.wasmSha256 !== wasmSha256) {
                console.warn(
                    `[replay] ${fileName}: recorded against wasm ${fixture.header.wasmSha256}, ` +
                        `testing against ${wasmSha256} — behavioral parity still verified`,
                );
            }
        });

        it('checkpoints land within the event stream', () => {
            const lastIndex = fixture.events.length - 1;
            for (const cp of fixture.checkpoints) {
                expect(cp.afterEvent).toBeLessThanOrEqual(lastIndex);
                for (const region of Object.keys(cp.digests)) {
                    expect(fixture.digestRegions).toContain(region);
                }
            }
        });

        it('replays bit-for-bit against the real wasm', async () => {
            const engine = await freshEngine();
            const instance = engine.initWasmFromBytes(new Uint8Array(binary));
            const mismatches = await import('../src/wasm/parity/replay-runner.js').then(
                ({ replayFixture }) =>
                    replayFixture(
                        fixture,
                        instance.exports as unknown as Parameters<typeof replayFixture>[1],
                        () => engine.getWasmMemory(),
                    ),
            );
            expect(
                mismatches,
                `region digests diverged while replaying ${fileName}`,
            ).toEqual([]);
        });

        it('replays clean with wasm_set_input_keys served from TS (cutover proof)', async () => {
            const [{ replayFixture }, { setInputKeys }, engine] = await Promise.all([
                import('../src/wasm/parity/replay-runner.js'),
                import('../src/engine/input.js'),
                freshEngine(),
            ]);
            const instance = engine.initWasmFromBytes(new Uint8Array(binary));
            const mismatches = replayFixture(
                fixture,
                instance.exports as unknown as Parameters<typeof replayFixture>[1],
                () => engine.getWasmMemory(),
                {
                    // Cutover mode: the dispatched call is served entirely by
                    // the Stage 5e TS port; wasm's copy of the export is
                    // never invoked for it.
                    wasm_set_input_keys: (keys: unknown) =>
                        setInputKeys(engine.getWasmMemory()!, keys as number),
                },
            );
            expect(
                mismatches,
                `TS-served input latching diverged while replaying ${fileName}`,
            ).toEqual([]);
        });
    });
});
