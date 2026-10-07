/**
 * idle.ts — is the hero free to have the route re-searched under him?
 *
 * Re-planning runs `findRoute` synchronously inside the frame, and a search is the
 * one thing the loop does that can be seen: the player reported the game freezing
 * at random while he was following the chevrons. The rule he gave for when it may
 * run is the whole file — only when he is **standing still**: not walking, not
 * falling, not carried by a platform or a current, and holding no key.
 *
 * The bytes are the engine's own, read the way `nav/recorder.ts` reads them for
 * its state column: whatever the frame actually decided, rather than a guess from
 * the tile under him.
 */
import { memRead8 } from '../../core/ts-memory.js';
import { ADDR_INPUT_ALT_SPACE, ADDR_INPUT_DIRS, ADDR_JUMP_PHASE_FLAGS } from '../../core/memory.js';

// g_mem addresses the engine does not name in core/memory.ts, spelled as the
// recorder spells them (see nav/recorder.ts). Exported so a test can poke the
// same bytes the frame writes rather than a copy of them.
export const ADDR_SLIDE_DIRECTION = 0x9f22;
export const ADDR_AIR_UP_TILE_FOUND = 0x9f15;
export const ADDR_ON_ROPE_FLAGS = 0xff39;

export interface HeroIdleProbeDeps {
    /** The engine's memory image. */
    memory: () => Uint8Array;
    /** Where the hero is, or null outside a cavern. */
    heroPosition: () => { mapId: number; col: number; row: number } | null;
}

/**
 * Build the probe. It keeps one sample — the cell he was in when last asked — so
 * it must be called once per frame, not once per question.
 *
 * False on the first call, because "has not moved since last time" has no last
 * time yet; the re-plan that was waiting for it goes out on the frame after.
 */
export function createHeroIdleProbe(deps: HeroIdleProbeDeps): () => boolean {
    let last: { mapId: number; col: number; row: number } | null = null;
    return (): boolean => {
        const g = deps.memory();

        // Anything the player is holding down. A direction he is pushing into a wall
        // counts: the hero does not move, but the frame is not one he is idle in.
        if (memRead8(g, ADDR_INPUT_DIRS) !== 0) return false;
        if (memRead8(g, ADDR_INPUT_ALT_SPACE) !== 0) return false;

        // Motion the engine drives without a key. Each is a state the frame sets and
        // clears itself, so each is a frame in which re-planning would be measuring
        // a hero who is not where he will be next.
        if (memRead8(g, ADDR_JUMP_PHASE_FLAGS) !== 0) return false;   // airborne
        if (memRead8(g, ADDR_SLIDE_DIRECTION) !== 0) return false;    // sliding down a slope
        if (memRead8(g, ADDR_ON_ROPE_FLAGS) !== 0) return false;      // climbing
        if (memRead8(g, ADDR_AIR_UP_TILE_FOUND) !== 0) return false;  // carried by a jet

        // Everything else — a walk, a fall, a platform under him — moves the cell, and
        // none of the flags above is set for it. One comparison covers all of them:
        // nothing has moved since the last frame is the whole test.
        const at = deps.heroPosition();
        if (!at) {
            last = null;
            return false;
        }
        if (last && last.mapId === at.mapId && last.col === at.col && last.row === at.row) {
            return true;
        }
        last = at;
        return false;
    };
}
