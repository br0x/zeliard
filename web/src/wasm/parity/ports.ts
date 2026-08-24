/**
 * ports.ts — registry of TS ports served through the dispatch layer (5e+).
 *
 * Each entry knows how to build its TS implementation over the live g_mem
 * view and which inventory regions constitute its observable output (for
 * shadow verification). Ports run in two modes:
 *
 *   - 'shadow'  — dual-run wasm + TS every call, assert parity (Stage 5c)
 *   - 'cutover' — serve the export from TS outright; wasm stays available
 *                 via dispatch.reset() as an instant fallback
 */

import type { DispatchableEngine, DispatchableName } from '../dispatch.js';
import { keyStateToBitmask } from '../memory.js';
import type { KeyState } from '../memory.js';
import { initC015ObjIfExists as initC015ObjIfExistsTs } from '../../engine/town.js';
import {
    townBuildingFinish,
    townCompleteTransition,
    townConversationFinish,
    townEntryDisablingEdgeScroll,
    townEntryEnablingEdgeScroll,
    townFullTick,
    townInit,
    townSetReturnBeforeMainLoop,
    townUpdate,
} from '../../engine/town.js';
import { clearRenderRequest, getDungeonState, getEntityTable, getRenderRequest, getViewportTop } from '../../engine/dungeon-state.js';
import { setInputKeys } from '../../engine/input.js';
import {
    getPendingTransitionDir,
    getPendingTransitionMap,
    getPendingTransitionPat,
} from '../../engine/town-state.js';
import type { ShadowSpec } from './shadow.js';

export type ViewAccessor = () => Uint8Array | null;

export interface PortedExport {
    name: DispatchableName;
    /** Build the TS implementation bound to a live g_mem view accessor. */
    make: (getView: ViewAccessor) => DispatchableEngine[DispatchableName];
    spec: ShadowSpec;
    /**
     * 'shadow' (default): safe to dual-run against wasm per call.
     * 'replay': stateful — C statics make per-call dual-run impossible;
     * verified by golden-replay cutover + live E2E instead. Excluded from
     * shadow-mode enables.
     */
    verifyVia?: 'shadow' | 'replay';
}

function requireView(getView: ViewAccessor): Uint8Array {
    const view = getView();
    if (!view) throw new Error('g_mem view unavailable for TS port');
    return view;
}

export const PORTED_EXPORTS: Record<string, PortedExport> = {
    wasm_set_input_keys: {
        name: 'wasm_set_input_keys',
        make: (getView) => (keys: KeyState) =>
            setInputKeys(requireView(getView), keyStateToBitmask(keys)),
        spec: { regions: ['input-latches'] },
    },
    wasm_get_pending_transition_map: {
        name: 'wasm_get_pending_transition_map',
        make: (getView) => () => getPendingTransitionMap(requireView(getView)),
        spec: { regions: ['town-transition-scratch'] },
    },
    wasm_get_pending_transition_pat: {
        name: 'wasm_get_pending_transition_pat',
        make: (getView) => () => getPendingTransitionPat(requireView(getView)),
        spec: { regions: ['town-transition-scratch'] },
    },
    wasm_get_pending_transition_dir: {
        name: 'wasm_get_pending_transition_dir',
        make: (getView) => () => getPendingTransitionDir(requireView(getView)),
        spec: { regions: ['town-transition-scratch'] },
    },
    wasm_dungeon_get_viewport_top: {
        name: 'wasm_dungeon_get_viewport_top',
        make: (getView) => () => {
            const view = getView();
            return view ? getViewportTop(view) : 0;
        },
        spec: { regions: [] },
    },
    wasm_dungeon_get_state: {
        name: 'wasm_dungeon_get_state',
        make: (getView) => () => {
            const view = getView();
            return view ? getDungeonState(view) : 0;
        },
        spec: { regions: [] },
    },
    wasm_dungeon_get_render_request: {
        name: 'wasm_dungeon_get_render_request',
        make: (getView) => () => {
            const view = getView();
            return view ? getRenderRequest(view) : 0;
        },
        spec: { regions: [] },
    },
    wasm_dungeon_clear_render_request: {
        name: 'wasm_dungeon_clear_render_request',
        make: (getView) => () => clearRenderRequest(requireView(getView)),
        spec: { regions: ['engine-semaphores'] },
    },
    wasm_town_init: {
        name: 'wasm_town_init',
        verifyVia: 'replay',
        make: (getView) => () => townInit(requireView(getView)),
        spec: {},
    },
    wasm_town_set_return_before_main_loop: {
        name: 'wasm_town_set_return_before_main_loop',
        verifyVia: 'replay',
        make: (getView) => (enabled: boolean) =>
            townSetReturnBeforeMainLoop(requireView(getView), enabled),
        spec: {},
    },
    wasm_town_entry_disabling_edge_scroll: {
        name: 'wasm_town_entry_disabling_edge_scroll',
        verifyVia: 'replay',
        make: (getView) => () => townEntryDisablingEdgeScroll(requireView(getView)),
        spec: { regions: ['town-transition-scratch', 'scene-flow-flags'] },
    },
    wasm_town_entry_enabling_edge_scroll: {
        name: 'wasm_town_entry_enabling_edge_scroll',
        verifyVia: 'replay',
        make: (getView) => () => townEntryEnablingEdgeScroll(requireView(getView)),
        spec: { regions: ['town-transition-scratch', 'scene-flow-flags'] },
    },
    wasm_town_complete_transition: {
        name: 'wasm_town_complete_transition',
        verifyVia: 'replay',
        make: (getView) => () => townCompleteTransition(requireView(getView)),
        spec: { regions: ['town-transition-scratch', 'scene-flow-flags'] },
    },
    wasm_init_c015_obj_if_exists: {
        name: 'wasm_init_c015_obj_if_exists',
        verifyVia: 'replay',
        make: (getView) => () => initC015ObjIfExistsTs(requireView(getView)),
        spec: { regions: ['mdt-window'] },
    },
    // Stage 7: the whole town tick family is served from TS. Per-tick shadow
    // dual-run is impossible (the C tick mutates private statics that memory
    // snapshots cannot rewind), so these are verified by golden-replay
    // cutover + live E2E instead of the shadow harness.
    wasm_town_update: {
        name: 'wasm_town_update',
        verifyVia: 'replay',
        make: (getView) => () => townUpdate(requireView(getView)),
        spec: { regions: ['town-transition-scratch', 'scene-flow-flags'] },
    },
    wasm_town_full_tick: {
        name: 'wasm_town_full_tick',
        verifyVia: 'replay',
        make: (getView) => () => townFullTick(requireView(getView)),
        spec: { regions: ['dungeon-runtime-flags'] },
    },
    wasm_town_conversation_finish: {
        name: 'wasm_town_conversation_finish',
        verifyVia: 'replay',
        make: (getView) => () => townConversationFinish(requireView(getView)),
        spec: { regions: ['scene-flow-flags'] },
    },
    wasm_town_building_finish: {
        name: 'wasm_town_building_finish',
        verifyVia: 'replay',
        make: (getView) => () => townBuildingFinish(requireView(getView)),
        spec: { regions: ['scene-flow-flags'] },
    },
    wasm_dungeon_get_entity_table: {
        name: 'wasm_dungeon_get_entity_table',
        make: (getView) => () => {
            const view = getView();
            return view ? getEntityTable(view) : 0;
        },
        spec: { regions: [] },
    },
};

export const PORTED_NAMES = Object.keys(PORTED_EXPORTS);
