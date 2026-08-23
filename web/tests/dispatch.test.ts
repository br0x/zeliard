import { describe, expect, it, vi } from 'vitest';

import * as bridge from '../src/wasm/bridge.js';
import { EngineDispatch } from '../src/wasm/dispatch.js';
import type { DispatchableName } from '../src/wasm/dispatch.js';

function newDispatch(): EngineDispatch {
    const d = new EngineDispatch();
    d.useBridge(bridge as unknown as Record<string, unknown>);
    return d;
}

describe('EngineDispatch defaults', () => {
    it('routes to the bridge wrapper by default', () => {
        const spy = vi.spyOn(bridge, 'townUpdate');
        const d = newDispatch();
        expect(d.isOverridden('wasm_town_update')).toBe(false);
        d.call('wasm_town_update');
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it('forwards arguments and returns values', () => {
        const spy = vi.spyOn(bridge, 'dungeonInit');
        const d = newDispatch();
        d.call('wasm_dungeon_init', 3, true);
        expect(spy).toHaveBeenCalledWith(3, true);
        expect(d.call('wasm_dungeon_get_viewport_top')).toBe(0); // uninitialized → 0
        spy.mockRestore();
    });

    it('drops calls before the bridge is registered (legacy ?. semantics)', () => {
        const d = new EngineDispatch();
        expect(d.call('wasm_town_update')).toBeUndefined();
        expect(d.impl('wasm_town_update')).toBeUndefined();
    });

    it('throws at useBridge time if a wrapper is missing', () => {
        const d = new EngineDispatch();
        expect(() =>
            d.useBridge({ inputSetKeys: bridge.inputSetKeys } as unknown as Record<string, unknown>),
        ).toThrow(/missing wrapper "townInit"/);
    });

    it('useBridge wires every dispatchable export', () => {
        const d = newDispatch();
        for (const name of Object.keys({
            wasm_set_input_keys: 0,
            wasm_finish_rokademo_transition: 0,
        } satisfies Record<string, number>) as DispatchableName[]) {
            expect(d.impl(name), name).toBeTypeOf('function');
        }
    });
});

describe('EngineDispatch overrides', () => {
    it('override wins over the default without touching call sites', () => {
        const d = newDispatch();
        const ts = vi.fn();
        d.override('wasm_town_full_tick', ts);

        expect(d.isOverridden('wasm_town_full_tick')).toBe(true);
        expect(d.overriddenNames()).toEqual(['wasm_town_full_tick']);
        d.call('wasm_town_full_tick');
        expect(ts).toHaveBeenCalledTimes(1);
    });

    it('override receives forwarded arguments', () => {
        const d = newDispatch();
        const ts = vi.fn();
        d.override('wasm_dungeon_init', ts);
        d.call('wasm_dungeon_init', 7, false);
        expect(ts).toHaveBeenCalledWith(7, false);
    });

    it('reset removes a single override', () => {
        const d = newDispatch();
        const ts = vi.fn();
        d.override('wasm_town_update', ts);

        d.reset('wasm_town_update');
        expect(d.isOverridden('wasm_town_update')).toBe(false);
        d.call('wasm_town_update'); // must not throw; back on wasm path
        expect(ts).not.toHaveBeenCalled();
    });

    it('reset with no argument clears everything', () => {
        const d = newDispatch();
        d.override('wasm_town_update', vi.fn());
        d.override('wasm_dungeon_update', vi.fn());

        d.reset();
        expect(d.overriddenNames()).toEqual([]);
    });
});
