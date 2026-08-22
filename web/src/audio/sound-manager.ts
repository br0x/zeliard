/**
 * sound-manager.ts
 *
 * Main-thread audio system for the Zeliard web port.
 *
 * Responsibilities:
 *   1. Create and manage the AudioContext + PITWorklet node.
 *   2. Pre-load and cache all sound effects and music tracks (mp3 / ogg).
 *   3. Receive full_tick / slow_tick messages from the worklet and forward
 *      them to the registered WASM / JS game callbacks.
 *   4. Implement sound_drv_poll() and music_drv_poll() to service the
 *      ADDR_SOUND_FX_REQUEST byte that town.c / fight.c write.
 *   5. Drive the boss-heartbeat loop (assets/sfx/heartbeat.ogg) whose volume
 *      tracks ADDR_HEARTBEAT_VOLUME written by update_boss_heartbeat_volume().
 *   6. Expose a simple public API consumed by game.js.
 *
 * Sound effect triggering (mirrors DOS int 60h fn0 / Adlib SFX):
 *   Game C code writes a byte to ADDR_SOUND_FX_REQUEST (0xFF75).
 *   sound_drv_poll() reads it, plays the mapped audio clip, clears the byte.
 *
 * Music triggering (mirrors DOS int 60h fn0 / Adlib music):
 *   game.js / town.c calls soundManager.playMusic(trackId) explicitly, or
 *   music_drv_poll() can cross-fade if a pending track is queued.
 *
 * -------------------------------------------------------------------------
 * Asset layout convention
 *   assets/sfx/sfx_{decimal}.{ogg,mp3}    — sound effects keyed by request byte
 *   assets/music/{trackId}.{ogg,mp3}      — background music tracks
 *
 *   All assets are tried in the order [ogg, mp3] so you can ship either.
 * -------------------------------------------------------------------------
 */

export interface SoundManagerOptions {
    /** Path to pit-worklet.js */
    workletPath?: string;
    /** e.g. 'assets/sfx/' */
    sfxBasePath?: string;
    /** e.g. 'assets/music/' */
    musicBasePath?: string;
    /** Request-byte values to pre-load */
    sfxIds?: number[];
    /** Track IDs to pre-load */
    musicTracks?: string[];
    /** Called every ~236.7 Hz tick */
    onFullTick?: (() => void) | null;
    /** Called every ~47.3 Hz tick */
    onSlowTick?: (() => void) | null;
    /** Returns Uint8Array of WASM linear memory */
    getWasmMem?: (() => Uint8Array | null) | null;
}

export interface PlayMusicOptions {
    /** Whether the track repeats indefinitely */
    loop?: boolean;
    /** Called once after a non-looping track finishes naturally */
    onEnded?: (() => void) | null;
}

interface WorkletMessage {
    type: 'ready' | 'full_tick' | 'slow_tick' | 'counters' | string;
    full?: number;
    slow?: number;
}

// Module-level decoded-audio cache shared across all SoundManager instances
const _audioBufferCache = new Map<string, AudioBuffer>();

export class SoundManager {
    private readonly _workletPath: string;
    private readonly _sfxBase: string;
    private readonly _musicBase: string;
    private readonly _sfxIds: number[];
    private readonly _musicTracks: string[];

    private _onFullTick: (() => void) | null;
    private _onSlowTick: (() => void) | null;
    private _getWasmMem: (() => Uint8Array | null) | null;

    private _ctx: AudioContext | null = null;
    private _pitNode: AudioWorkletNode | null = null;

    // Sound effect cache: requestByte → AudioBuffer
    private readonly _sfxCache = new Map<number, AudioBuffer>();

    // Music state
    private _musicSource: AudioBufferSourceNode | null = null;
    private _musicGain: GainNode | null = null;
    private _currentTrack: string | null = null;
    private _pendingTrack: string | null = null; // queued during crossfade
    private _musicMuted = false;
    private readonly _musicVolume = 0.7;
    private _musicDim = 1.0;

    // SFX gain node (allows fading SFX volume independently)
    private _sfxGain: GainNode | null = null;
    private _sfxMuted = false;
    private _sfxVolume = 1.0;

    // Track which SFX is currently playing (only one at a time per original)
    private _sfxSource: AudioBufferSourceNode | null = null;

    // Boss heartbeat: a looping playback of assets/sfx/heartbeat.ogg whose
    // gain tracks ADDR_HEARTBEAT_VOLUME (written by update_boss_heartbeat_volume
    // in dungeon.c). The loop runs on its own source (so one-shot SFX never
    // cut it off) but feeds the shared SFX gain (so mute/volume apply).
    private _heartbeatBuffer: AudioBuffer | null = null;
    private _heartbeatSource: AudioBufferSourceNode | null = null;
    private _heartbeatGain: GainNode | null = null;
    private _heartbeatVolume = 0;

    // Debug counters (updated from worklet heartbeats)
    fullTicks = 0;
    slowTicks = 0;

    // WASM memory address of the sound FX request byte
    private readonly _ADDR_SOUND_FX_REQUEST = 0xff75;

    // WASM memory address of the boss-heartbeat volume byte (0xFF08)
    private readonly _ADDR_HEARTBEAT_VOLUME = 0xff08;

    private _ready = false;

    constructor(opts: SoundManagerOptions = {}) {
        this._workletPath = opts.workletPath ?? 'pit-worklet.js';
        this._sfxBase = opts.sfxBasePath ?? 'assets/sfx/';
        this._musicBase = opts.musicBasePath ?? 'assets/music/';
        this._sfxIds = opts.sfxIds ?? [];
        this._musicTracks = opts.musicTracks ?? [];
        this._onFullTick = opts.onFullTick ?? null;
        this._onSlowTick = opts.onSlowTick ?? null;
        this._getWasmMem = opts.getWasmMem ?? null;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Initialise AudioContext and worklet, pre-load assets.
     * Must be called from a user-gesture handler (click / keydown).
     */
    async init(): Promise<void> {
        if (this._ready) return;

        const ctx = new AudioContext();
        this._ctx = ctx;

        // Unlock context on iOS / Safari (requires a buffered source touch)
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        // Register + instantiate the PIT worklet
        await ctx.audioWorklet.addModule(this._workletPath);
        this._pitNode = new AudioWorkletNode(ctx, 'pit-worklet');
        this._pitNode.connect(ctx.destination);

        // Wire worklet messages → local handlers
        this._pitNode.port.onmessage = (e) => this._onWorkletMessage(e.data as WorkletMessage);

        // Shared GainNode for music so we can crossfade
        this._musicGain = ctx.createGain();
        this._musicGain.gain.value = this._musicMuted ? 0 : this._musicVolume * this._musicDim;
        this._musicGain.connect(ctx.destination);

        // Shared GainNode for SFX so we can fade volume independently
        this._sfxGain = ctx.createGain();
        this._sfxGain.gain.value = 1.0;
        this._sfxGain.connect(ctx.destination);

        // Pre-load assets in parallel (non-blocking — missing files are warned)
        await Promise.all([
            this._preloadSfx(),
            this._preloadMusic(),
            this._preloadHeartbeat(),
        ]);

        this._ready = true;
    }

    /** Start firing PIT ticks. */
    start(): void {
        this._assertReady('start');
        this._pitNode!.port.postMessage({ type: 'start' });
    }

    /** Pause PIT ticks (phase is preserved). */
    stop(): void {
        this._pitNode?.port.postMessage({ type: 'stop' });
    }

    /** Stop + reset all counters (use when returning to title screen). */
    reset(): void {
        this._pitNode?.port.postMessage({ type: 'reset' });
        this.fullTicks = 0;
        this.slowTicks = 0;
    }

    /**
     * Play a music track by ID.
     * If a track is already playing, crossfades over `fadeDuration` seconds.
     *
     * @param trackId       e.g. 'mgt1', 'ugm2', 'outro/Guinever (Aquarium 1981)'
     * @param fadeDuration
     * @param options
     */
    async playMusic(trackId: string, fadeDuration = 1.5, { loop = true, onEnded = null }: PlayMusicOptions = {}): Promise<void> {
        if (!this._ready || trackId === this._currentTrack) return;
        const ctx = this._ctx!;

        const buffer = await this._loadAudio(this._musicBase, trackId);
        if (!buffer) return;

        const now = ctx.currentTime;

        // Fade out current track
        if (this._musicSource) {
            const oldSource = this._musicSource;
            const oldGain = ctx.createGain();
            oldGain.gain.setValueAtTime(this._musicGain!.gain.value, now);
            oldGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
            oldGain.connect(ctx.destination);
            oldSource.disconnect();
            oldSource.connect(oldGain);
            oldSource.stop(now + fadeDuration + 0.1);
            this._musicSource = null;
        }

        // Fade in new track
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        source.connect(this._musicGain!);

        const targetGain = this._musicMuted ? 0 : this._musicVolume * this._musicDim;
        this._musicGain!.gain.setValueAtTime(0, now);
        this._musicGain!.gain.linearRampToValueAtTime(targetGain, now + fadeDuration);

        // When a non-looping track finishes, release the music slot and hand
        // off to the caller (e.g. the ending demo starts the credits track).
        // Stopping/replacing the source elsewhere never triggers onEnded here.
        source.onended = () => {
            if (this._musicSource !== source) return;
            this._musicSource = null;
            this._currentTrack = null;
            if (onEnded) onEnded();
        };

        source.start(now);
        this._musicSource = source;
        this._currentTrack = trackId;
    }

    /** Stop music immediately (or with optional fade). */
    stopMusic(fadeDuration = 0.5): void {
        if (!this._musicSource) return;
        const now = this._ctx!.currentTime;
        this._musicGain!.gain.setValueAtTime(this._musicGain!.gain.value, now);
        this._musicGain!.gain.linearRampToValueAtTime(0, now + fadeDuration);
        this._musicSource.stop(now + fadeDuration + 0.05);
        this._musicSource = null;
        this._currentTrack = null;
    }

    /** Mute/unmute music without stopping the current track. */
    setMusicMuted(muted: boolean, fadeDuration = 0.25): void {
        this._musicMuted = muted;
        if (!this._ready || !this._musicGain) return;

        const now = this._ctx!.currentTime;
        const targetGain = muted ? 0 : this._musicVolume * this._musicDim;
        this._musicGain.gain.cancelScheduledValues(now);
        this._musicGain.gain.setValueAtTime(this._musicGain.gain.value, now);
        this._musicGain.gain.linearRampToValueAtTime(targetGain, now + fadeDuration);
    }

    /** Dim/restore music volume (e.g. when entering/leaving a building). */
    setMusicDim(dim: number, fadeDuration = 0.25): void {
        this._musicDim = dim;
        if (!this._ready || !this._musicGain) return;

        const now = this._ctx!.currentTime;
        const targetGain = this._musicMuted ? 0 : this._musicVolume * dim;
        this._musicGain.gain.cancelScheduledValues(now);
        this._musicGain.gain.setValueAtTime(this._musicGain.gain.value, now);
        this._musicGain.gain.linearRampToValueAtTime(targetGain, now + fadeDuration);
    }

    /** Mute/unmute sound effects. */
    setSfxMuted(muted: boolean, fadeDuration = 0.25): void {
        this._sfxMuted = muted;
        if (!this._ready || !this._sfxGain) return;

        const now = this._ctx!.currentTime;
        const targetGain = muted ? 0 : this._sfxVolume;
        this._sfxGain.gain.cancelScheduledValues(now);
        this._sfxGain.gain.setValueAtTime(this._sfxGain.gain.value, now);
        this._sfxGain.gain.linearRampToValueAtTime(targetGain, now + fadeDuration);
    }

    /** Set SFX volume (1.0 = full, 0.0 = silent). */
    setSfxVolume(volume: number, fadeDuration = 0.25): void {
        this._sfxVolume = volume;
        if (!this._ready || !this._sfxGain) return;

        const now = this._ctx!.currentTime;
        const targetGain = this._sfxMuted ? 0 : volume;
        this._sfxGain.gain.cancelScheduledValues(now);
        this._sfxGain.gain.setValueAtTime(this._sfxGain.gain.value, now);
        this._sfxGain.gain.linearRampToValueAtTime(targetGain, now + fadeDuration);
    }

    /**
     * Trigger a sound effect by its request-byte value.
     * Mirrors the Adlib SFX call triggered when C code sets ADDR_SOUND_FX_REQUEST.
     *
     * @param sfxId 1–65 (0 = silence / no-op)
     */
    playSfx(sfxId: number): void {
        if (!this._ready || sfxId === 0) return;
        const buffer = this._sfxCache.get(sfxId);
        if (!buffer) {
            // Not pre-loaded — attempt dynamic load (fire and forget)
            this._loadAudio(this._sfxBase, sfxFileName(sfxId)).then((buf) => {
                if (buf) {
                    this._sfxCache.set(sfxId, buf);
                    this._playBuffer(buf);
                }
            });
            return;
        }
        this._playBuffer(buffer);
    }

    /**
     * Allow the game to register/replace tick callbacks after construction.
     * Useful if WASM isn't loaded until after SoundManager.init().
     */
    setTickCallbacks(onFullTick: (() => void) | null, onSlowTick: (() => void) | null): void {
        this._onFullTick = onFullTick;
        this._onSlowTick = onSlowTick;
    }

    /**
     * Wire up the WASM memory accessor so sound_drv_poll can read
     * ADDR_SOUND_FX_REQUEST directly from WASM linear memory.
     */
    setWasmMemAccessor(getWasmMem: () => Uint8Array | null): void {
        this._getWasmMem = getWasmMem;
    }

    /**
     * Change the PIT reload divisor at runtime.
     * Original: timer reprogrammed for specific boss fights / attract mode.
     * @param reload 16-bit divisor (0 = 65536)
     */
    setPitReload(reload: number): void {
        this._pitNode?.port.postMessage({ type: 'set_reload', value: reload });
    }

    /** True after init() resolves successfully. */
    get isReady(): boolean {
        return this._ready;
    }

    // =========================================================================
    // Internal — worklet message handler
    // =========================================================================

    _onWorkletMessage(msg: WorkletMessage): void {
        switch (msg.type) {
            case 'ready':
                // Worklet processor is alive — nothing to do here
                break;

            case 'full_tick':
                this._soundDrvPoll();
                this._musicDrvPoll();
                if (this._onFullTick) this._onFullTick();
                break;

            case 'slow_tick':
                if (this._onSlowTick) this._onSlowTick();
                break;

            case 'counters':
                this.fullTicks = msg.full ?? 0;
                this.slowTicks = msg.slow ?? 0;
                break;
        }
    }

    // =========================================================================
    // Internal — driver poll functions (mirror DOS ISR callbacks)
    // =========================================================================

    /**
     * sound_drv_poll — called every full tick (~236.7 Hz).
     *
     * Reads ADDR_SOUND_FX_REQUEST from WASM memory (if available) and
     * triggers the corresponding sound clip, then clears the request byte.
     * This exactly mirrors the DOS timer ISR calling sound_drv_poll_farproc.
     */
    _soundDrvPoll(): void {
        if (!this._getWasmMem) return;
        const mem = this._getWasmMem();
        if (!mem) return;

        const req = mem[this._ADDR_SOUND_FX_REQUEST];
        if (req !== 0) {
            mem[this._ADDR_SOUND_FX_REQUEST] = 0; // clear before play to avoid re-trigger
            console.log(`[sound-manager] sfx ${req}`);
            this.playSfx(req);
        }

        this._heartbeatPoll(mem);
    }

    /**
     * heartbeat_poll — called every full tick from sound_drv_poll, mirroring
     * the DOS timer ISR's HeartbeatTick.
     *
     * Reads ADDR_HEARTBEAT_VOLUME (0xFF08), which dungeon.c's
     * update_boss_heartbeat_volume() recomputes every frame from the hero's
     * distance to the door guarding a living boss. A non-zero volume keeps a
     * looping playback of assets/sfx/heartbeat.ogg running at a gain that
     * scales with the volume (0x06 = faint at the edge of range, 0x0F = loud
     * right next to the door); a zero volume fades the loop out.
     */
    _heartbeatPoll(mem: Uint8Array): void {
        const volume = mem[this._ADDR_HEARTBEAT_VOLUME] || 0;
        if (volume === this._heartbeatVolume) return;
        this._heartbeatVolume = volume;
        this._applyHeartbeatVolume(volume);
    }

    _applyHeartbeatVolume(volume: number): void {
        if (!this._ready || !this._heartbeatBuffer) return;
        const ctx = this._ctx!;
        const now = ctx.currentTime;

        if (volume === 0) {
            if (this._heartbeatSource) {
                this._heartbeatGain!.gain.cancelScheduledValues(now);
                this._heartbeatGain!.gain.setValueAtTime(this._heartbeatGain!.gain.value, now);
                this._heartbeatGain!.gain.setTargetAtTime(0, now, 0.08);
                const src = this._heartbeatSource;
                this._heartbeatSource = null;
                src.stop(now + 0.5);
            }
            return;
        }

        if (!this._heartbeatSource) {
            const source = ctx.createBufferSource();
            source.buffer = this._heartbeatBuffer;
            source.loop = true;
            this._heartbeatGain = ctx.createGain();
            this._heartbeatGain.gain.value = 0;
            this._heartbeatGain.connect(this._sfxGain!);
            source.connect(this._heartbeatGain);
            source.onended = () => {
                if (this._heartbeatSource === source) this._heartbeatSource = null;
            };
            source.start();
            this._heartbeatSource = source;
        }

        // Range is 0x06..0x0F (from the distance_attenuation table); scale to
        // 0..1. The loop feeds the shared SFX gain, so the SFX mute/volume
        // controls apply on top of this.
        const target = volume / 15;
        this._heartbeatGain!.gain.cancelScheduledValues(now);
        this._heartbeatGain!.gain.setValueAtTime(this._heartbeatGain!.gain.value, now);
        this._heartbeatGain!.gain.setTargetAtTime(target, now, 0.08);
    }

    /**
     * music_drv_poll — called every full tick (~236.7 Hz).
     *
     * In the original game this handled OPL register writes per tick.
     * In our port, music is streamed audio — we just flush any pending
     * track-change requests that were queued during a previous slow_tick.
     */
    _musicDrvPoll(): void {
        if (this._pendingTrack && this._pendingTrack !== this._currentTrack) {
            const track = this._pendingTrack;
            this._pendingTrack = null;
            this.playMusic(track); // async, fine to fire-and-forget from here
        }
    }

    // =========================================================================
    // Internal — asset loading
    // =========================================================================

    async _preloadSfx(): Promise<void> {
        const promises = this._sfxIds.map(async (id) => {
            const buf = await this._loadAudio(this._sfxBase, sfxFileName(id));
            if (buf) this._sfxCache.set(id, buf);
        });
        await Promise.allSettled(promises);
    }

    async _preloadMusic(): Promise<void> {
        const promises = this._musicTracks.map(async (id) => {
            // Just warm the browser cache; we don't store the buffer here
            // because playMusic() re-fetches from cache anyway.
            await this._loadAudio(this._musicBase, id);
        });
        await Promise.allSettled(promises);
    }

    async _preloadHeartbeat(): Promise<void> {
        this._heartbeatBuffer = await this._loadAudio(this._sfxBase, 'heartbeat');
    }

    /**
     * Try ogg first, then mp3. Returns null if neither is available.
     * Results are cached in a module-level Map keyed by full URL.
     */
    async _loadAudio(basePath: string, name: string): Promise<AudioBuffer | null> {
        const extensions = ['ogg', 'mp3'];
        for (const ext of extensions) {
            const url = `${basePath}${name}.${ext}`;
            const cached = _audioBufferCache.get(url);
            if (cached) return cached;

            try {
                const resp = await fetch(url);
                if (!resp.ok) continue;
                const arrayBuf = await resp.arrayBuffer();
                const audioBuf = await this._ctx!.decodeAudioData(arrayBuf);
                _audioBufferCache.set(url, audioBuf);
                return audioBuf;
            } catch {
                // try next extension
            }
        }
        console.warn(`[SoundManager] Asset not found: ${basePath}${name}.{ogg,mp3}`);
        return null;
    }

    _playBuffer(buffer: AudioBuffer): void {
        // Stop currently playing SFX (matches original: only one SFX at a time)
        if (this._sfxSource) {
            try { this._sfxSource.stop(); } catch { /* already stopped */ }
            this._sfxSource = null;
        }
        const source = this._ctx!.createBufferSource();
        source.buffer = buffer;
        source.connect(this._sfxGain!);
        source.start();
        source.onended = () => { this._sfxSource = null; };
        this._sfxSource = source;
    }

    _assertReady(method: string): void {
        if (!this._ready) {
            throw new Error(`SoundManager.${method}(): call init() first`);
        }
    }
}

/** Build the asset base name for a numeric SFX request byte: 3 -> "sfx_03". */
export function sfxFileName(sfxId: number): string {
    return `sfx_${sfxId.toString(10).padStart(2, '0')}`;
}
