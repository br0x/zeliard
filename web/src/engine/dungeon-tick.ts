/**
 * dungeon-tick.ts — TS port of dungeon_full_tick (dungeon.c).
 *
 * Mirrors the DOS timer ISR: frame/tick/anim counters advance once per PIT
 * tick (~236.7 Hz); anim_timer feeds get_random()'s entropy. No hidden
 * state — the operation is three counter increments.
 */

export function dungeonFullTick(g: Uint8Array): void {
    g[0xff1a] = ((g[0xff1a] ?? 0) + 1) & 0xff; // ADDR_FRAME_TIMER
    const t = (g[0xff50] ?? 0) | ((g[0xff51] ?? 0) << 8); // ADDR_TICK_COUNTER word
    g[0xff50] = (t + 1) & 0xff;
    g[0xff51] = ((t + 1) >> 8) & 0xff;
    const a = (g[0xff1b] ?? 0) | ((g[0xff1c] ?? 0) << 8); // ADDR_ANIM_TIMER word
    g[0xff1b] = (a + 1) & 0xff;
    g[0xff1c] = ((a + 1) >> 8) & 0xff;
}
