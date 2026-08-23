/**
 * town-state.ts — TS port of the town pending-transition getters (Stage 5e).
 *
 * Ports of wasm_get_pending_transition_map/pat/dir (src/town.c:1703-1705).
 * Pure g_mem readers; the scratch bytes are written by the town engine and
 * consumed by main.ts's transition orchestrators.
 */

import {
    ADDR_TOWN_TRANSITION_DIR,
    ADDR_TOWN_TRANSITION_MAP,
    ADDR_TOWN_TRANSITION_PAT,
} from '../wasm/memory.js';

export function getPendingTransitionMap(gmem: Uint8Array): number {
    return gmem[ADDR_TOWN_TRANSITION_MAP] ?? 0;
}

export function getPendingTransitionPat(gmem: Uint8Array): number {
    return gmem[ADDR_TOWN_TRANSITION_PAT] ?? 0;
}

export function getPendingTransitionDir(gmem: Uint8Array): number {
    return gmem[ADDR_TOWN_TRANSITION_DIR] ?? 0;
}
