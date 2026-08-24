import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
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
            // NOTE: intentionally NOT a hard gate — CI rebuilds the wasm with
            // unpinned emsdk. Behavioral parity is enforced by the checkpoint
            // digests during replay.
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
            const { replayFixture } = await import('../src/wasm/parity/replay-runner.js');
            const mismatches = replayFixture(
                fixture,
                instance.exports as unknown as Parameters<typeof replayFixture>[1],
                () => engine.getWasmMemory(),
            );
            expect(
                mismatches,
                `region digests diverged while replaying ${fileName}`,
            ).toEqual([]);
        });

        it('replays clean with input + town ticks served from TS (Stage 7 cutover)', async () => {
            const engine = await freshEngine();
            const instance = engine.initWasmFromBytes(new Uint8Array(binary));
            const [
                { replayFixture },
                { setInputKeys },
                town,
            ] = await Promise.all([
                import('../src/wasm/parity/replay-runner.js'),
                import('../src/engine/input.js'),
                import('../src/engine/town.js'),
            ]);
            const gmem = (): Uint8Array => engine.getWasmMemory()!;
            const impls: Record<string, (...args: unknown[]) => unknown> = {
                wasm_set_input_keys: (bit: unknown) => setInputKeys(gmem(), bit as number),
                wasm_town_init: () => town.townInit(gmem()),
                wasm_town_set_return_before_main_loop: (enabled: unknown) =>
                    town.townSetReturnBeforeMainLoop(gmem(), enabled as boolean),
                wasm_town_entry_disabling_edge_scroll: () =>
                    town.townEntryDisablingEdgeScroll(gmem()),
                wasm_town_entry_enabling_edge_scroll: () =>
                    town.townEntryEnablingEdgeScroll(gmem()),
                wasm_town_complete_transition: () => town.townCompleteTransition(gmem()),
                wasm_init_c015_obj_if_exists: () => town.initC015ObjIfExists(gmem()),
                wasm_town_conversation_finish: () => town.townConversationFinish(gmem()),
                wasm_town_building_finish: () => town.townBuildingFinish(gmem()),
                wasm_town_update: () => town.townUpdate(gmem()),
                wasm_town_full_tick: () => town.townFullTick(gmem()),
            };

            // temporary per-event trace around first divergence
            const mismatches = replayFixture(
                fixture,
                instance.exports as unknown as Parameters<typeof replayFixture>[1],
                gmem,
                impls,
            );
            if (mismatches.length > 0) {
                writeFileSync(
                    '/tmp/opencode/town-replay-diff.json',
                    JSON.stringify(
                        {
                            count: mismatches.length,
                            all: mismatches.map((m) => ({ at: m.afterEvent, region: m.region, diffs: m.byteDiffs?.slice(0, 6) ?? m.expected + ' vs ' + m.actual })),
                            eventsAround: fixture.events
                                .slice(
                                    Math.max(0, mismatches[0]!.afterEvent - 20),
                                    mismatches[0]!.afterEvent + 3,
                                )
                                .map((e) =>
                                    e.k === 'call'
                                        ? `${e.name}(${JSON.stringify(e.args ?? []).slice(0, 40)})`
                                        : `poke:${e.addr!.toString(16)}`,
                                ),
                        },
                        null,
                        1,
                    ),
                );
            }

            expect(
                mismatches,
                `TS town ticks diverged while replaying ${fileName}`,
            ).toEqual([]);
        });
    });
});
