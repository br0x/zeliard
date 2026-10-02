/**
 * GENERATED FILE — do not edit.
 *
 * Produced by tools/build-nav.mjs from web/public/game/0/mp*.mdt and
 * web/src/data/dungeons.ts. Run `pnpm --filter zeliard-web nav:build` to
 * regenerate, then commit the result.
 *
 * See docs/PATHFINDER_PLAN.md §6.
 */
/** A key lying on the floor: the hero collects it by walking over the cell. */
export interface NavKey {
    /** Hero left column. */
    readonly col: number;
    /** Hero head row. */
    readonly row: number;
    /** 0 an ordinary key (flag_16), 1 a Lion-Head key (flag_17). */
    readonly kind: 0 | 1;
}

/**
 * Key pickups per map, read from the MDT's 16-byte entity records.
 *
 * The cell is already a hero standing position, so a key needs no edge of its own:
 * the pickup fires from the ordinary alignment test while he walks over it, and the
 * route therefore passes through the cell without being told to.
 *
 * A key the player has already taken is not in this table's world: the engine drops
 * it from the list at dungeon init (remove_accomplished_items,
 * engine/dungeon-init.ts:75). So a table entry means "there is a key here in the
 * original data", not "there is a key here now" — the search is told which are
 * still present.
 */
export const NAV_KEYS: Readonly<Record<number, readonly NavKey[]>> = {
    0: [{col: 99, row: 41, kind: 0}],
    2: [{col: 89, row: 44, kind: 0}, {col: 149, row: 44, kind: 0}],
    5: [{col: 133, row: 55, kind: 0}],
    8: [{col: 7, row: 30, kind: 0}],
    9: [{col: 78, row: 22, kind: 0}, {col: 154, row: 51, kind: 0}],
    12: [{col: 97, row: 16, kind: 0}, {col: 191, row: 18, kind: 0}],
    14: [{col: 140, row: 14, kind: 0}, {col: 63, row: 7, kind: 0}],
    18: [{col: 62, row: 14, kind: 0}, {col: 160, row: 30, kind: 0}],
    23: [{col: 150, row: 7, kind: 1}],
    24: [{col: 125, row: 37, kind: 0}, {col: 232, row: 39, kind: 0}],
    25: [{col: 26, row: 48, kind: 0}],
    27: [{col: 60, row: 53, kind: 0}],
};

/** Key count per map, ordered by id, for sizing. */
export const NAV_KEY_COUNT: readonly number[] = [
    1,
    0,
    2,
    0,
    0,
    1,
    0,
    0,
    1,
    2,
    0,
    0,
    2,
    0,
    2,
    0,
    0,
    0,
    2,
    0,
    0,
    0,
    0,
    1,
    2,
    1,
    0,
    1,
    0,
    0,
    0,
];
