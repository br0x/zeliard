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
