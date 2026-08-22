import { describe, expect, it, vi } from 'vitest';
import { SoundManager, sfxFileName } from '../src/audio/sound-manager.js';

/** Build a manager wired to a fake wasm memory without any AudioContext. */
function makeManager(mem: Uint8Array) {
    const mgr = new SoundManager({ getWasmMem: () => mem });
    const played: number[] = [];
    vi.spyOn(mgr, 'playSfx').mockImplementation((id: number) => void played.push(id));
    return { mgr, played };
}

describe('sfxFileName', () => {
    it('zero-pads the request byte', () => {
        expect(sfxFileName(3)).toBe('sfx_03');
        expect(sfxFileName(65)).toBe('sfx_65');
    });
});

describe('worklet message dispatch', () => {
    it('forwards full_tick/slow_tick to registered callbacks', () => {
        const mgr = new SoundManager();
        const full = vi.fn();
        const slow = vi.fn();
        mgr.setTickCallbacks(full, slow);

        // Drive internals with a fake memory accessor so polls are no-ops.
        mgr.setWasmMemAccessor(() => null);
        mgr._onWorkletMessage({ type: 'full_tick' });
        mgr._onWorkletMessage({ type: 'full_tick' });
        mgr._onWorkletMessage({ type: 'slow_tick' });
        expect(full).toHaveBeenCalledTimes(2);
        expect(slow).toHaveBeenCalledTimes(1);
    });

    it('updates counters from worklet heartbeat', () => {
        const mgr = new SoundManager();
        mgr._onWorkletMessage({ type: 'counters', full: 12, slow: 3 });
        expect(mgr.fullTicks).toBe(12);
        expect(mgr.slowTicks).toBe(3);
    });

    it('ignores unknown message types', () => {
        const mgr = new SoundManager();
        expect(() => mgr._onWorkletMessage({ type: 'wat' })).not.toThrow();
    });
});

describe('sound_drv_poll (SFX request byte)', () => {
    // ADDR_SOUND_FX_REQUEST = 0xFF75
    const REQ = 0xff75;

    it('plays and clears a pending request byte', () => {
        const mem = new Uint8Array(0x10000);
        mem[REQ] = 42;
        const { mgr, played } = makeManager(mem);

        mgr._soundDrvPoll();
        expect(played).toEqual([42]);
        expect(mem[REQ]).toBe(0); // cleared to avoid re-trigger
    });

    it('is a no-op when the byte is zero or no accessor is set', () => {
        const mem = new Uint8Array(0x10000);
        const { mgr, played } = makeManager(mem);
        mgr._soundDrvPoll();
        expect(played).toEqual([]);

        const bare = new SoundManager();
        expect(() => bare._soundDrvPoll()).not.toThrow();
    });

    it('does not re-trigger on repeated polls', () => {
        const mem = new Uint8Array(0x10000);
        mem[REQ] = 7;
        const { mgr, played } = makeManager(mem);

        mgr._soundDrvPoll();
        mgr._soundDrvPoll();
        mgr._soundDrvPoll();
        expect(played).toEqual([7]);
    });
});

describe('heartbeat_poll (boss proximity volume)', () => {
    // ADDR_HEARTBEAT_VOLUME = 0xFF08
    const VOL = 0xff08;

    function makeHeartbeatSpy(mem: Uint8Array) {
        const mgr = new SoundManager({ getWasmMem: () => mem });
        const internal = mgr as unknown as { _applyHeartbeatVolume: (v: number) => void };
        const apply = vi.spyOn(internal, '_applyHeartbeatVolume').mockImplementation(() => {});
        return { mgr, apply };
    }

    it('applies only when the volume byte changes', () => {
        const mem = new Uint8Array(0x10000);
        const { mgr, apply } = makeHeartbeatSpy(mem);

        mem[VOL] = 6;
        mgr._soundDrvPoll();
        expect(apply).toHaveBeenCalledWith(6);

        // Same value again -> no new application
        mgr._soundDrvPoll();
        expect(apply).toHaveBeenCalledTimes(1);

        mem[VOL] = 15;
        mgr._soundDrvPoll();
        expect(apply).toHaveBeenLastCalledWith(15);
        expect(apply).toHaveBeenCalledTimes(2);
    });

    it('treats a zero volume byte as fade-out signal', () => {
        const mem = new Uint8Array(0x10000);
        mem[VOL] = 9;
        const { mgr, apply } = makeHeartbeatSpy(mem);
        mgr._soundDrvPoll();

        mem[VOL] = 0;
        mgr._soundDrvPoll();
        expect(apply).toHaveBeenLastCalledWith(0);
    });
});
