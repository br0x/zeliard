/**
 * GENERATED FILE — do not edit.
 *
 * Produced by tools/build-nav.mjs from web/public/game/0/mp*.mdt and
 * web/src/data/dungeons.ts. Run `pnpm --filter zeliard-web nav:build` to
 * regenerate, then commit the result.
 *
 * See docs/PATHFINDER_PLAN.md §6.
 */
/** Rows in every cavern map; fixed by the MDT format. */
export const NAV_MAP_HEIGHT = 64;

/** Cavern maps in the game. */
export const NAV_MAP_COUNT = 31;

/** Towns, which bound the shop stock tables. */
export const NAV_TOWN_COUNT = 9;

export type { NavMapMeta, NavComponent } from './nav-maps.js';
export { NAV_MAPS, NAV_MAP_BY_ID, NAV_MAP_TILES, NAV_COMPONENTS } from './nav-maps.js';

export type { NavPortal, PortalKeyKind } from './nav-portals.js';
export { PORTALS, NAV_PORTALS_BY_MAP, NAV_DOOR_COUNT } from './nav-portals.js';

export type { NavTileTables } from './nav-tiles.js';
export { NAV_TILES } from './nav-tiles.js';

export type {
    NavPlatform, NavPlatformTables,
    NavVerticalPlatform, NavCollapsingPlatform, NavHorizontalPlatform,
} from './nav-platforms.js';
export { NAV_PLATFORMS } from './nav-platforms.js';

export type { NavAirflowTables, NavLiftColumn, NavConveyorRun } from './nav-airflows.js';
export { NAV_AIRFLOWS } from './nav-airflows.js';
