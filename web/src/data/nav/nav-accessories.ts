/**
 * GENERATED FILE — do not edit.
 *
 * Produced by tools/build-nav.mjs from web/public/game/0/mp*.mdt and
 * web/src/data/dungeons.ts. Run `pnpm --filter zeliard-web nav:build` to
 * regenerate, then commit the result.
 *
 * See docs/PATHFINDER_PLAN.md §6.
 */
/** Which pair a pickup hands over: 1 Feruza, 2 Pirika, 3 Silkarn, 4 Ruzeria. */
export type NavShoe = 1 | 2 | 3 | 4;

/** The pair's name as the game spells it, for the route's own list. */
export const NAV_SHOE_LABEL: Readonly<Record<NavShoe, string>> = {
    1: 'Feruza', 2: 'Pirika', 3: 'Silkarn', 4: 'Ruzeria',
};

/** A pair lying on the floor, which the hero collects by walking over the cell. */
export interface NavAccessory {
    /** Hero left column. */
    readonly col: number;
    /** Hero head row. */
    readonly row: number;
    readonly shoe: NavShoe;
}

/**
 * Shoe pickups per map, read from the MDT's 16-byte entity records.
 *
 * A pair is an item in the cavern like a key is, but it is not a key. Walking over
 * it puts it in the hero's inventory (put_shoes_to_inventory,
 * engine/dungeon-items.ts:182-187) and it stays there: he may wear any pair he is
 * carrying, or none, and changing costs nothing and takes no time. So a route may
 * collect a pair and keep it, and may collect two, which is what a slope and a
 * four-tile jump in one journey needs.
 *
 * There are four in the whole game and no more, so no pair is ever duplicated:
 * Ruzeria on level 4, Pirika on level 5, and Silkarn and Feruza on level 6. Which
 * pair a level-6 0x1A record is was decided by the cavern level at pickup time
 * (flag1a, engine/dungeon-items.ts:436-458), not by anything in the record, so the
 * level is resolved here.
 */
export const NAV_ACCESSORIES: Readonly<Record<number, readonly NavAccessory[]>> = {
    8: [{ col: 177, row: 13, shoe: 4 }],
    11: [{ col: 208, row: 27, shoe: 2 }],
    14: [{ col: 201, row: 13, shoe: 3 }],
    16: [{ col: 27, row: 26, shoe: 1 }],
};
