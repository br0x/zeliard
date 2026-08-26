/**
 * boss-exit-completion.test.ts — Stage 9 regression: the post-boss door
 * completion must run roka_entrypoint (tear count, ROKA_PHASE, and —
 * critically — DUNGEON_STATE_ROKADEMO) so main.ts starts the tear-collection
 * demo instead of wedging the hero in the DOOR_PENDING back-frame.
 *
 * The fixture is a real captured g_mem snapshot taken while the engine sat
 * in DOOR_PENDING after entering the Cangrejo boss-room exit door (door
 * features 0x80 = "boss defeated"). The saved C statics (g_door_flags 0x80,
 * x1 49700, y1 0, features 0xFF, place 8) are injected into the TS-side
 * DoorPendingState exactly as enter_opened_door would have.
 *
 * Verified against the native gcc-built oracle: byte-identical completion.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));
const SNAPSHOT = fileURLToPath(new URL('./fixtures/boss-exit/door-pending.bin', import.meta.url));

describe('stage 9k: post-boss door completion runs roka_entrypoint', () => {
    it('enters ROKADEMO with tear count + phase + render flags set', async () => {
        vi.resetModules();
        const bridge = await import('../src/wasm/bridge.js');
        bridge.initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
        const view = bridge.getWasmMemory()!;
        view.set(readFileSync(SNAPSHOT));

        const { doorPendingState } = await import('../src/engine/dungeon-runtime.js');
        const { PORTED_EXPORTS } = await import('../src/wasm/parity/ports.js');

        // Same saved values enter_opened_door stored on the C side.
        doorPendingState.monstersPtr = view[0xc010]! | (view[0xc011]! << 8);
        doorPendingState.flags = 0x80;
        doorPendingState.x1 = 49700;
        doorPendingState.y1 = 0;
        doorPendingState.features = 0xff;
        doorPendingState.placeMapId = 8;

        // Force the back-frame delay gate so the completion actually runs.
        view[0xff1a] = 70; // >= SPEED_CONST(5) * 14

        (PORTED_EXPORTS as any)['wasm_dungeon_update'].make(() => view)();

        // roka_entrypoint effects (dungeon.c:1271):
        expect(view[0xff90], 'must enter ROKADEMO').toBe(9);
        expect(view[0xa0], 'tear count incremented to 1').toBe(1);
        expect(view[0xff9d], 'roka phase reset').toBe(0);
        expect(view[0xe7], 'hero anim phase reset').toBe(0);
        expect(view[0xff92], 'render requested').toBe(0xff);
        expect(view[0xff93], 'render done cleared').toBe(0);
    });
});
