/**
 * platform-state.ts — where the platforms are, right now.
 *
 * A moving platform is not a fixed feature of a cavern. It rests at the `startY` its
 * generated table records, the hero drives it up or down while he is aboard, and it
 * stays wherever he left it until the cavern is entered again through a door — at
 * which point every vertical and collapsing platform in it is put back to its default.
 * The engine keeps the live row for each one in a list of three-byte entries,
 * `{ absX word, y byte }`, terminated by `absX === 0xffff`
 * (`render_vertical_platforms_to_proximity`, dungeon-platforms.ts).
 *
 * So the navigation model has to be told where they are rather than assume it. It
 * matters in both directions: a platform three tiles wide at row *y* is solid rock
 * the hero cannot pass through, and its top at row *y* is the only surface he can
 * land on — which is why a route drawn while the platform sat at row 34 has to be
 * rebuilt the moment he rides it somewhere else.
 */
import { memRead8, memRead16 } from '../../core/ts-memory.js';

/** Word pointer to the vertical platform list. */
export const VERTICAL_PLATFORMS_LIST = 0xc004;
/** Word pointer to the collapsing platform list. */
export const COLLAPSING_PLATFORMS_LIST = 0xc006;

/**
 * Every platform's live row, keyed by its left column.
 *
 * A vertical and a collapsing platform never share a column, so the column is a
 * sufficient key and the two lists can be read into one map.
 */
export type PlatformPlaces = ReadonlyMap<number, number>;

/**
 * Read one `{ absX, y }` list. Guarded on `0xffff` exactly as the engine walks it,
 * and on the pointer being zero, so an uninitialised cavern yields an empty map
 * rather than a walk off the end of memory.
 */
function readList(g: Uint8Array, listPtr: number, into: Map<number, number>): void {
    const at = memRead16(g, listPtr);
    if (at === 0) return;
    let si = at;
    for (;;) {
        if (si + 2 >= g.length) return;
        const x = memRead16(g, si);
        if (x === 0xffff) return;
        into.set(x, memRead8(g, si + 2));
        si += 3;
    }
}

/** Where every platform in the cavern currently is. */
export function readPlatformPlaces(g: Uint8Array): Map<number, number> {
    const out = new Map<number, number>();
    readList(g, VERTICAL_PLATFORMS_LIST, out);
    readList(g, COLLAPSING_PLATFORMS_LIST, out);
    return out;
}

/** Did two snapshots put the platforms in the same places? */
export function samePlatformPlaces(a: PlatformPlaces, b: PlatformPlaces): boolean {
    if (a.size !== b.size) return false;
    for (const [x, y] of a) if (b.get(x) !== y) return false;
    return true;
}
