/**
 * pit-worklet.js — PIT 8253 Timer emulation via AudioWorkletProcessor
 *
 * Mirrors the original DOS ISR structure exactly:
 *   - Full-rate tick  (~236.70 Hz): sound_drv_poll + music_drv_poll
 *   - Slow-rate tick  (~47.34 Hz) : input poll + game logic  (every 5th full tick)
 *
 * PIT constants:
 *   Input clock : 1,193,182 Hz
 *   Reload value: 0x13B1 = 5041
 *   Output freq : 1,193,182 / 5041 ≈ 236.70 Hz
 *
 * The worklet fires ticks by counting fractional samples.  Because the audio
 * thread runs at sampleRate (44100 / 48000 Hz), tick timing is as accurate as
 * the hardware clock — completely immune to main-thread jank or setTimeout
 * throttling in background tabs.
 *
 * Message protocol (this.port → main thread):
 *   { type: 'full_tick' }            — fire sound_drv_poll + music_drv_poll
 *   { type: 'slow_tick' }            — fire input poll + game logic (every 5th)
 *   { type: 'ready' }                — worklet is initialised
 *   { type: 'counters', full, slow } — periodic heartbeat for debug UI
 *
 * Message protocol (main thread → this.port):
 *   { type: 'start' }   — begin firing ticks
 *   { type: 'stop' }    — pause (keeps phase state)
 *   { type: 'reset' }   — stop + reset all counters
 *   { type: 'set_reload', value: N } — change PIT reload divisor at runtime
 */

const PIT_CLOCK   = 1_193_182;
const DEFAULT_RELOAD = 0x13B1;      // 5041 → 236.70 Hz
const SLOW_DIVIDER   = 5;           // every 5th full tick fires the slow callback
const HEARTBEAT_TICKS = 256;        // send counters every N full ticks

class PITWorklet extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        this._running  = false;
        this._reload   = DEFAULT_RELOAD;
        this._freq     = PIT_CLOCK / DEFAULT_RELOAD;

        // Fractional sample accumulator — carries sub-tick remainder between
        // process() calls so tick timing never drifts.
        this._phase    = 0;

        // Mirrors cs:tick_divider — counts down from 5 to 0 then fires slow_tick
        this._tickDiv  = SLOW_DIVIDER;

        // Debug counters (never overflow in JS f64)
        this._fullTicks = 0;
        this._slowTicks = 0;

        this.port.onmessage = (e) => this._onMessage(e.data);
        this.port.postMessage({ type: 'ready' });
    }

    _onMessage(msg) {
        switch (msg.type) {
            case 'start':
                this._running = true;
                break;

            case 'stop':
                this._running = false;
                break;

            case 'reset':
                this._running   = false;
                this._phase     = 0;
                this._tickDiv   = SLOW_DIVIDER;
                this._fullTicks = 0;
                this._slowTicks = 0;
                break;

            case 'set_reload':
                // Allow runtime reprogramming of the PIT divisor (e.g. if the
                // game switches timer speed for a different section).
                if (typeof msg.value === 'number' && msg.value > 0) {
                    this._reload = msg.value;
                    this._freq   = PIT_CLOCK / msg.value;
                }
                break;
        }
    }

    /**
     * process() is called every 128 samples (~2.9 ms at 44100 Hz).
     * We accumulate fractional ticks and fire whole ones.
     */
    process(/* inputs, outputs, parameters */) {
        if (!this._running) {
            return true; // keep processor alive even when paused
        }

        // How many full ticks fit in this 128-sample block?
        // phase is measured in "number of ticks elapsed" (fractional).
        this._phase += (128 / sampleRate) * this._freq;

        // Fire all whole ticks that accumulated
        while (this._phase >= 1) {
            this._phase -= 1;
            this._fireTick();
        }

        return true; // return false to terminate the processor
    }

    _fireTick() {
        this._fullTicks++;

        // Full-rate message: sound + music driver poll
        this.port.postMessage({ type: 'full_tick' });

        // Slow-rate: decrement divider, fire every 5th tick
        this._tickDiv--;
        if (this._tickDiv <= 0) {
            this._tickDiv = SLOW_DIVIDER;
            this._slowTicks++;
            this.port.postMessage({ type: 'slow_tick' });
        }

        // Periodic counter heartbeat for debug / monitoring
        if ((this._fullTicks % HEARTBEAT_TICKS) === 0) {
            this.port.postMessage({
                type: 'counters',
                full: this._fullTicks,
                slow: this._slowTicks,
            });
        }
    }
}

registerProcessor('pit-worklet', PITWorklet);
