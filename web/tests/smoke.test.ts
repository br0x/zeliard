import { describe, it, expect } from 'vitest';
import { hasWasmExport, getWasmMemory } from '../src/wasm/bridge.js';

/**
 * Stage 0 smoke test: proves the Vitest + TS harness resolves the app's ES
 * modules. The wasm bridge is import-safe in Node (no DOM access at module
 * top level), unlike the legacy scene modules.
 */
describe('wasm bridge module (pre-init)', () => {
  it('imports without side effects', () => {
    expect(hasWasmExport).toBeTypeOf('function');
    expect(getWasmMemory).toBeTypeOf('function');
  });

  it('reports no exports before init', () => {
    expect(hasWasmExport('wasm_init')).toBe(false);
  });

  it('returns null memory view before init', () => {
    expect(getWasmMemory()).toBeNull();
  });
});
