/**
 * dispatch.ts — engine dispatch layer, the Phase B cutover mechanism.
 *
 * Every wasm-engine call main.ts makes goes through EngineDispatch instead
 * of the bridge wrappers directly. Default implementations are the bridge
 * wrappers; as subsystems are ported (stages 5e+), `override()` installs a
 * TS implementation without touching any call site, and shadow mode can
 * later wrap both. The override surface is exposed on the `window.__zeliard`
 * debug hook so E2E and manual sessions can flip implementations live.
 *
 * Keys are the raw wasm export names so the inventory (inventory.ts) doubles
 * as the port-progress tracker for this layer. Value signatures mirror the
 * current bridge wrappers — those are the contract TS ports must preserve.
 */

import type { KeyState } from './memory.js';

/**
 * The subset of the engine surface that is dispatched (and therefore
 * individually replaceable by a TS implementation / recorded by the replay
 * harness). Two kinds of keys:
 *
 *  - raw wasm export names (`wasm_town_update`, …) — aligned with
 *    inventory.ts so it doubles as this layer's port tracker;
 *  - bridge wrapper names (`loadMdt`, `setDungeonPassableTiles`, …) for the
 *    TS→memory configuration writes that feed the engine before init calls —
 *    these must be dispatched too so golden replays can reproduce them.
 */
export interface DispatchableEngine {
    wasm_set_input_keys(keys: KeyState): void;
    wasm_town_init(): void;
    wasm_town_set_return_before_main_loop(enabled: boolean): void;
    wasm_town_entry_disabling_edge_scroll(): void;
    wasm_town_entry_enabling_edge_scroll(): void;
    wasm_town_update(): void;
    wasm_town_full_tick(): void;
    wasm_town_complete_transition(): void;
    wasm_get_pending_transition_map(): number;
    wasm_get_pending_transition_pat(): number;
    wasm_get_pending_transition_dir(): number;
    wasm_init_c015_obj_if_exists(): void;
    wasm_town_conversation_finish(): void;
    wasm_town_building_finish(): void;
    wasm_dungeon_init(mapId: number, isFromTown: number | boolean): void;
    wasm_dungeon_update(): void;
    wasm_dungeon_full_tick(): void;
    wasm_dungeon_get_viewport_top(): number;
    wasm_dungeon_get_entity_table(): number;
    wasm_dungeon_get_state(): number;
    wasm_dungeon_get_render_request(): number;
    wasm_dungeon_clear_render_request(): void;
    wasm_finish_rokademo_transition(): void;

    // ─── TS→memory configuration/data writes ───
    loadMdt(mdtData: Uint8Array, mdtPath: string): number;
    loadSaveState(saveState: Uint8Array): number | undefined;
    setSpecialTileList(tileIds: ArrayLike<number>): void;
    setDungeonPassableTiles(tileIds: ArrayLike<number>): void;
    setDungeonSlopeTilesLeft(tileIds: ArrayLike<number>): void;
    setDungeonSlopeTilesRight(tileIds: ArrayLike<number>): void;
    setDungeonAggressiveGround(tileIds: ArrayLike<number>): void;
    setDungeonAirflows(tileIds: ArrayLike<number>): void;
    setDungeonSwordReach(reachObj: Readonly<Record<number, ArrayLike<number>>>): void;
    setDungeonMonsterXp(xp: ArrayLike<number>): void;
    setDungeonMonsterDamage(damage: ArrayLike<number>): void;
    setDeathDescriptors(descriptors: ReadonlyArray<ArrayLike<number>>): void;
    setTrajectories(trajectories: ReadonlyArray<ArrayLike<number>>): void;
}

export type DispatchableName = keyof DispatchableEngine;

/** Bridge wrapper name backing each dispatchable export (bridge.ts). */
const BRIDGE_WRAPPER: { [N in DispatchableName]: string } = {
    wasm_set_input_keys: 'inputSetKeys',
    wasm_town_init: 'townInit',
    wasm_town_set_return_before_main_loop: 'townSetReturnBeforeMainLoop',
    wasm_town_entry_disabling_edge_scroll: 'townEntryDisablingEdgeScroll',
    wasm_town_entry_enabling_edge_scroll: 'townEntryEnablingEdgeScroll',
    wasm_town_update: 'townUpdate',
    wasm_town_full_tick: 'townFullTick',
    wasm_town_complete_transition: 'townCompleteTransition',
    wasm_get_pending_transition_map: 'getPendingTransitionMap',
    wasm_get_pending_transition_pat: 'getPendingTransitionPat',
    wasm_get_pending_transition_dir: 'getPendingTransitionDir',
    wasm_init_c015_obj_if_exists: 'initC015ObjIfExists',
    wasm_town_conversation_finish: 'townFinishConversation',
    wasm_town_building_finish: 'townFinishBuilding',
    wasm_dungeon_init: 'dungeonInit',
    wasm_dungeon_update: 'dungeonUpdate',
    wasm_dungeon_full_tick: 'dungeonFullTick',
    wasm_dungeon_get_viewport_top: 'dungeonGetViewportTop',
    wasm_dungeon_get_entity_table: 'dungeonGetEntityTable',
    wasm_dungeon_get_state: 'dungeonGetState',
    wasm_dungeon_get_render_request: 'dungeonGetRenderRequest',
    wasm_dungeon_clear_render_request: 'dungeonClearRenderRequest',
    wasm_finish_rokademo_transition: 'finishRokademoTransition',

    loadMdt: 'loadMdt',
    loadSaveState: 'loadSaveState',
    setSpecialTileList: 'setSpecialTileList',
    setDungeonPassableTiles: 'setDungeonPassableTiles',
    setDungeonSlopeTilesLeft: 'setDungeonSlopeTilesLeft',
    setDungeonSlopeTilesRight: 'setDungeonSlopeTilesRight',
    setDungeonAggressiveGround: 'setDungeonAggressiveGround',
    setDungeonAirflows: 'setDungeonAirflows',
    setDungeonSwordReach: 'setDungeonSwordReach',
    setDungeonMonsterXp: 'setDungeonMonsterXp',
    setDungeonMonsterDamage: 'setDungeonMonsterDamage',
    setDeathDescriptors: 'setDeathDescriptors',
    setTrajectories: 'setTrajectories',
};

type AnyFn = (...args: never[]) => unknown;

export class EngineDispatch {
    private defaults = new Map<DispatchableName, AnyFn>();
    private overrides = new Map<DispatchableName, AnyFn>();
    private callListener: ((name: DispatchableName, args: unknown[]) => void) | null = null;

    /**
     * Observe every dispatched call (used by the replay recorder). Pass null
     * to detach. The listener fires AFTER the implementation has run, so a
     * recorded call event means "this call's memory effects are visible" —
     * the invariant the replay runner checks against.
     */
    tap(listener: ((name: DispatchableName, args: unknown[]) => void) | null): void {
        this.callListener = listener;
    }

    /**
     * Register the loaded bridge module's wrappers as the default
     * implementations. Throws if the module lacks any wrapper — an ABI drift
     * guard that fails loudly at boot rather than mid-gameplay.
     */
    useBridge(bridge: Record<string, unknown>): void {
        for (const [exportName, wrapperName] of Object.entries(BRIDGE_WRAPPER)) {
            const fn = bridge[wrapperName];
            if (typeof fn !== 'function') {
                throw new Error(
                    `bridge module is missing wrapper "${wrapperName}" for ${exportName}`,
                );
            }
            this.defaults.set(exportName as DispatchableName, fn as AnyFn);
        }
    }

    /**
     * Install a TS implementation for an export. Call sites keep hitting
     * `call()` unchanged; the next invocation uses the override.
     */
    override<N extends DispatchableName>(name: N, impl: DispatchableEngine[N]): void {
        this.overrides.set(name, impl as AnyFn);
    }

    /** Remove one override (or all with no argument), restoring wasm routing. */
    reset(name?: DispatchableName): void {
        if (name === undefined) {
            this.overrides.clear();
        } else {
            this.overrides.delete(name);
        }
    }

    isOverridden(name: DispatchableName): boolean {
        return this.overrides.has(name);
    }

    /** Currently active implementation for an export. */
    impl<N extends DispatchableName>(name: N): DispatchableEngine[N] | undefined {
        return (this.overrides.get(name) ?? this.defaults.get(name)) as
            | DispatchableEngine[N]
            | undefined;
    }

    overriddenNames(): DispatchableName[] {
        return [...this.overrides.keys()];
    }

    /**
     * Invoke the active implementation. Before the bridge loads (defaults not
     * yet registered) calls are dropped and return undefined — matching the
     * legacy optional-chaining call sites this replaces.
     */
    call<N extends DispatchableName>(
        name: N,
        ...args: Parameters<DispatchableEngine[N]>
    ): ReturnType<DispatchableEngine[N]> | undefined {
        const fn = this.impl(name);
        if (!fn) return undefined;
        const result = (fn as (...a: unknown[]) => unknown)(...args) as
            | ReturnType<DispatchableEngine[N]>
            | undefined;
        this.callListener?.(name, args);
        return result;
    }
}
