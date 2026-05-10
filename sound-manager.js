/**
 * sound-manager.js
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
 *   5. Expose a simple public API consumed by game.js.
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
 *   assets/sfx/sfx_{hex}.{ogg,mp3}    — sound effects keyed by request byte
 *   assets/music/{trackId}.{ogg,mp3}  — background music tracks
 *
 *   All assets are tried in the order [ogg, mp3] so you can ship either.
 * -------------------------------------------------------------------------
 */

export class SoundManager {
    /**
     * @param {object} opts
     * @param {string}   opts.workletPath    Path to pit-worklet.js
     * @param {string}   opts.sfxBasePath    e.g. 'assets/sfx/'
     * @param {string}   opts.musicBasePath  e.g. 'assets/music/'
     * @param {number[]} opts.sfxIds         Request-byte values to pre-load
     * @param {string[]} opts.musicTracks    Track IDs to pre-load
     * @param {Function} opts.onFullTick     Called every ~236.7 Hz tick
     * @param {Function} opts.onSlowTick     Called every ~47.3 Hz tick
     * @param {Function} [opts.getWasmMem]   Returns Uint8Array of WASM linear memory
     */
    constructor(opts = {}) {
        this._workletPath   = opts.workletPath   ?? 'pit-worklet.js';
        this._sfxBase       = opts.sfxBasePath   ?? 'assets/sfx/';
        this._musicBase     = opts.musicBasePath ?? 'assets/music/';
        this._sfxIds        = opts.sfxIds        ?? [];
        this._musicTracks   = opts.musicTracks   ?? [];
        this._onFullTick    = opts.onFullTick    ?? null;
        this._onSlowTick    = opts.onSlowTick    ?? null;
        this._getWasmMem    = opts.getWasmMem    ?? null;

        /** @type {AudioContext|null} */
        this._ctx       = null;
        /** @type {AudioWorkletNode|null} */
        this._pitNode   = null;

        // Sound effect cache: requestByte → AudioBuffer
        /** @type {Map<number, AudioBuffer>} */
        this._sfxCache  = new Map();

        // Music state
        /** @type {AudioBufferSourceNode|null} */
        this._musicSource   = null;
        /** @type {GainNode|null} */
        this._musicGain     = null;
        this._currentTrack  = null;
        this._pendingTrack  = null;   // queued during crossfade

        // Track which SFX is currently playing (only one at a time per original)
        /** @type {AudioBufferSourceNode|null} */
        this._sfxSource = null;

        // Debug counters (updated from worklet heartbeats)
        this.fullTicks = 0;
        this.slowTicks = 0;

        // WASM memory address of the sound FX request byte
        this._ADDR_SOUND_FX_REQUEST = 0xFF75;

        this._ready = false;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Initialise AudioContext and worklet, pre-load assets.
     * Must be called from a user-gesture handler (click / keydown).
     */
    async init() {
        if (this._ready) return;

        this._ctx = new AudioContext();

        // Unlock context on iOS / Safari (requires a buffered source touch)
        if (this._ctx.state === 'suspended') {
            await this._ctx.resume();
        }

        // Register + instantiate the PIT worklet
        await this._ctx.audioWorklet.addModule(this._workletPath);
        this._pitNode = new AudioWorkletNode(this._ctx, 'pit-worklet');
        this._pitNode.connect(this._ctx.destination);

        // Wire worklet messages → local handlers
        this._pitNode.port.onmessage = (e) => this._onWorkletMessage(e.data);

        // Shared GainNode for music so we can crossfade
        this._musicGain = this._ctx.createGain();
        this._musicGain.gain.value = 0.7;
        this._musicGain.connect(this._ctx.destination);

        // Pre-load assets in parallel (non-blocking — missing files are warned)
        await Promise.all([
            this._preloadSfx(),
            this._preloadMusic(),
        ]);

        this._ready = true;
    }

    /** Start firing PIT ticks. */
    start() {
        this._assertReady('start');
        this._pitNode.port.postMessage({ type: 'start' });
    }

    /** Pause PIT ticks (phase is preserved). */
    stop() {
        this._pitNode?.port.postMessage({ type: 'stop' });
    }

    /** Stop + reset all counters (use when returning to title screen). */
    reset() {
        this._pitNode?.port.postMessage({ type: 'reset' });
        this.fullTicks = 0;
        this.slowTicks = 0;
    }

    /**
     * Play a music track by ID.
     * If a track is already playing, crossfades over `fadeDuration` seconds.
     *
     * @param {string} trackId    e.g. 'town1', 'dungeon3'
     * @param {number} [fadeDuration=1.5]
     */
    async playMusic(trackId, fadeDuration = 1.5) {
        if (!this._ready || trackId === this._currentTrack) return;

        const buffer = await this._loadAudio(this._musicBase, trackId);
        if (!buffer) return;

        const now = this._ctx.currentTime;

        // Fade out current track
        if (this._musicSource) {
            const oldSource = this._musicSource;
            const oldGain   = this._ctx.createGain();
            oldGain.gain.setValueAtTime(this._musicGain.gain.value, now);
            oldGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
            oldGain.connect(this._ctx.destination);
            oldSource.disconnect();
            oldSource.connect(oldGain);
            oldSource.stop(now + fadeDuration + 0.1);
            this._musicSource = null;
        }

        // Fade in new track
        const source = this._ctx.createBufferSource();
        source.buffer = buffer;
        source.loop   = true;
        source.connect(this._musicGain);

        this._musicGain.gain.setValueAtTime(0, now);
        this._musicGain.gain.linearRampToValueAtTime(0.7, now + fadeDuration);

        source.start(now);
        this._musicSource = source;
        this._currentTrack = trackId;
    }

    /** Stop music immediately (or with optional fade). */
    stopMusic(fadeDuration = 0.5) {
        if (!this._musicSource) return;
        const now = this._ctx.currentTime;
        this._musicGain.gain.setValueAtTime(this._musicGain.gain.value, now);
        this._musicGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
        this._musicSource.stop(now + fadeDuration + 0.05);
        this._musicSource = null;
        this._currentTrack = null;
    }

    /**
     * Trigger a sound effect by its request-byte value.
     * Mirrors the Adlib SFX call triggered when C code sets ADDR_SOUND_FX_REQUEST.
     *
     * @param {number} sfxId   0x01–0xFF  (0 = silence / no-op)
     */
    playSfx(sfxId) {
        if (!this._ready || sfxId === 0) return;
        const buffer = this._sfxCache.get(sfxId);
        if (!buffer) {
            // Not pre-loaded — attempt dynamic load (fire and forget)
            this._loadAudio(this._sfxBase, `sfx_${sfxId.toString(16).padStart(2, '0')}`).then(buf => {
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
    setTickCallbacks(onFullTick, onSlowTick) {
        this._onFullTick = onFullTick;
        this._onSlowTick = onSlowTick;
    }

    /**
     * Wire up the WASM memory accessor so sound_drv_poll can read
     * ADDR_SOUND_FX_REQUEST directly from WASM linear memory.
     * @param {Function} getWasmMem  () => Uint8Array
     */
    setWasmMemAccessor(getWasmMem) {
        this._getWasmMem = getWasmMem;
    }

    /**
     * Change the PIT reload divisor at runtime.
     * Original: timer reprogrammed for specific boss fights / attract mode.
     * @param {number} reload  16-bit divisor (0 = 65536)
     */
    setPitReload(reload) {
        this._pitNode?.port.postMessage({ type: 'set_reload', value: reload });
    }

    /** True after init() resolves successfully. */
    get isReady() { return this._ready; }

    // =========================================================================
    // Internal — worklet message handler
    // =========================================================================

    _onWorkletMessage(msg) {
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
                this.fullTicks = msg.full;
                this.slowTicks = msg.slow;
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
    _soundDrvPoll() {
        if (!this._getWasmMem) return;
        const mem = this._getWasmMem();
        if (!mem) return;

        const req = mem[this._ADDR_SOUND_FX_REQUEST];
        if (req !== 0) {
            mem[this._ADDR_SOUND_FX_REQUEST] = 0; // clear before play to avoid re-trigger
            this.playSfx(req);
        }
    }

    /**
     * music_drv_poll — called every full tick (~236.7 Hz).
     *
     * In the original game this handled OPL register writes per tick.
     * In our port, music is streamed audio — we just flush any pending
     * track-change requests that were queued during a previous slow_tick.
     */
    _musicDrvPoll() {
        if (this._pendingTrack && this._pendingTrack !== this._currentTrack) {
            const track = this._pendingTrack;
            this._pendingTrack = null;
            this.playMusic(track); // async, fine to fire-and-forget from here
        }
    }

    // =========================================================================
    // Internal — asset loading
    // =========================================================================

    async _preloadSfx() {
        const promises = this._sfxIds.map(async (id) => {
            const name = `sfx_${id.toString(16).padStart(2, '0')}`;
            const buf = await this._loadAudio(this._sfxBase, name);
            if (buf) this._sfxCache.set(id, buf);
        });
        await Promise.allSettled(promises);
    }

    async _preloadMusic() {
        const promises = this._musicTracks.map(async (id) => {
            // Just warm the browser cache; we don't store the buffer here
            // because playMusic() re-fetches from cache anyway.
            await this._loadAudio(this._musicBase, id);
        });
        await Promise.allSettled(promises);
    }

    /**
     * Try ogg first, then mp3.  Returns null if neither is available.
     * Results are cached in a module-level Map keyed by full URL.
     */
    async _loadAudio(basePath, name) {
        const extensions = ['ogg', 'mp3'];
        for (const ext of extensions) {
            const url = `${basePath}${name}.${ext}`;
            const cached = _audioBufferCache.get(url);
            if (cached) return cached;

            try {
                const resp = await fetch(url);
                if (!resp.ok) continue;
                const arrayBuf = await resp.arrayBuffer();
                const audioBuf = await this._ctx.decodeAudioData(arrayBuf);
                _audioBufferCache.set(url, audioBuf);
                return audioBuf;
            } catch (_) {
                // try next extension
            }
        }
        console.warn(`[SoundManager] Asset not found: ${basePath}${name}.{ogg,mp3}`);
        return null;
    }

    _playBuffer(buffer) {
        // Stop currently playing SFX (matches original: only one SFX at a time)
        if (this._sfxSource) {
            try { this._sfxSource.stop(); } catch (_) {}
            this._sfxSource = null;
        }
        const source = this._ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this._ctx.destination);
        source.start();
        source.onended = () => { this._sfxSource = null; };
        this._sfxSource = source;
    }

    _assertReady(method) {
        if (!this._ready) {
            throw new Error(`SoundManager.${method}(): call init() first`);
        }
    }
}

// Module-level decoded-audio cache shared across all SoundManager instances
const _audioBufferCache = new Map();
