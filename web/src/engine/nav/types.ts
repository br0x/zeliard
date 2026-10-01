/**
 * types.ts — navigation value types shared across the pathfinder.
 *
 * Flag and cost conventions live here so that no two modules invent their own.
 */

/**
 * Per-tile classification, one bit each.
 *
 * A tile's flags are a pure function of its id and its cavern's attribute
 * tables, so they are computed once per tile id into a 64-entry table rather than
 * per cell — see nav/attributes.ts.
 */
export const NAV = {
    /** Tile id 0: the void. Passable in every cavern. */
    EMPTY: 1 << 0,
    /** Tile 1 or 2 — a rope, the only free vertical climb in the game. */
    ROPE: 1 << 1,
    /** In the cavern's slope-left table (`/`). */
    SLOPE_LEFT: 1 << 2,
    /** In the cavern's slope-right table (`\`). */
    SLOPE_RIGHT: 1 << 3,
    /** In the cavern's aggressive-ground table: walkable, damaging. */
    AGGRESSIVE: 1 << 4,
    /** Resolves to an up current. Checked first, see airflowDirectionOf. */
    AIRFLOW_UP: 1 << 5,
    /** Resolves to a left current. */
    AIRFLOW_LEFT: 1 << 6,
    /** Resolves to a right current. */
    AIRFLOW_RIGHT: 1 << 7,
    /**
     * `is_blocking_tile` — blocks the hero's head row
     * (engine/dungeon-entities.ts:73).
     */
    BLOCK_HEAD: 1 << 8,
    /**
     * `is_blocking_tile_simple` — blocks the body and feet rows
     * (engine/dungeon-entities.ts:89).
     */
    BLOCK_BODY: 1 << 9,
    /** A platform tile, 0x40..0x48. Never appears in the static MDT map. */
    PLATFORM: 1 << 10,
    /** Tile 0x4A, the door trigger the hero stands beside. */
    DOOR_TRIGGER: 1 << 11,
} as const;

/** Bit test. */
export function hasFlag(flags: number, bit: number): boolean {
    return (flags & bit) !== 0;
}

/** Does this tile block the hero's head row? `is_blocking_tile`. */
export function blocksHead(flags: number): boolean {
    return (flags & NAV.BLOCK_HEAD) !== 0;
}

/** Does this tile block the hero's body or feet rows? `is_blocking_tile_simple`. */
export function blocksBody(flags: number): boolean {
    return (flags & NAV.BLOCK_BODY) !== 0;
}

/** Any current at all. */
export function isCurrent(flags: number): boolean {
    return (flags & (NAV.AIRFLOW_UP | NAV.AIRFLOW_LEFT | NAV.AIRFLOW_RIGHT)) !== 0;
}

/** An up current, which lifts the hero 2 rows per frame. */
export function isLift(flags: number): boolean {
    return (flags & NAV.AIRFLOW_UP) !== 0;
}

/** A sideways current, which sweeps the hero 2 columns per frame, one way. */
export function isConveyor(flags: number): boolean {
    return (flags & (NAV.AIRFLOW_LEFT | NAV.AIRFLOW_RIGHT)) !== 0;
}

/**
 * Which way a current pushes the hero.
 *
 * These are the engine's own values (engine/dungeon-entities.ts:33-36) rather than
 * a tidier renumbering, so `getAirflowDirection` can be compared directly against
 * `NavTileClassifier.airflowDirection` with no translation table between them.
 */
export const AIRFLOW_NONE = 0xff;
export const AIRFLOW_UP = 0;
export const AIRFLOW_LEFT = 1;
export const AIRFLOW_RIGHT = 2;

/** Human-readable direction, for the map screen legend and debugging. */
export function airflowName(dir: number): string {
    switch (dir) {
        case AIRFLOW_UP: return 'up';
        case AIRFLOW_LEFT: return 'left';
        case AIRFLOW_RIGHT: return 'right';
        default: return 'none';
    }
}

/**
 * Hero traversal abilities, as a bitmask.
 *
 * Built from `g_mem` by nav/capabilities.ts. The snake_case names mirror the
 * engine's own accessory constants in asm/common.inc:36-40.
 */
export const CAP = {
    /** Ropes are innate; always set. */
    CLIMB: 1 << 0,
    /** Feruza shoes: jump 4 tiles instead of 2. */
    JUMP_HIGH: 1 << 1,
    /** Silkarn shoes: climb slopes instead of sliding down them. */
    SLOPE_STAND: 1 << 2,
    /** Pirika shoes: immune to aggressive ground. */
    GROUND_SAFE: 1 << 3,
    /** Ruzeria shoes: no ice sliding. Only matters on cavern level 4. */
    ICE_SAFE: 1 << 4,
    /** Asbestos cape: immune to cavern-7 heat. */
    HEAT_SAFE: 1 << 5,
    /** Carries at least one ordinary key. */
    KEY: 1 << 6,
    /** Carries at least one Lion-Head key. */
    LION_KEY: 1 << 7,
} as const;

export type CapabilityMask = number;

/** Which abilities are already granted, ignoring keys and the current loadout. */
export const CAP_ALWAYS: CapabilityMask = CAP.CLIMB;

/** Edge kinds in the navigation graph. */
export const EDGE = {
    WALK: 0,
    STEP: 1,
    JUMP: 2,
    JUMP_HIGH: 3,
    FALL: 4,
    CLIMB: 5,
    SLOPE_UP: 6,
    SLOPE_DOWN: 7,
    DOOR: 8,
    RIDE_V: 9,
    RIDE_H: 10,
    BOARD: 11,
    ALIGHT: 12,
    DROP: 13,
    LIFT: 14,
    CARRY_L: 15,
    CARRY_R: 16,
} as const;

export type EdgeKind = (typeof EDGE)[keyof typeof EDGE];

/** Debug names for the overlay and for test failure messages. */
export const EDGE_NAMES: Readonly<Record<number, string>> = Object.freeze(
    Object.fromEntries(Object.entries(EDGE).map(([name, id]) => [id, name])),
);

/** Edge costs in game ticks, where one tick moves the hero one tile. */
export const EDGE_COST = {
    /** Plain walking, one tile per tick. */
    WALK: 1,
    /** A one-tile step up or down. */
    STEP: 2,
    /** A jump rises jumpHeight rows and falls again: 2 x jumpHeight ticks. */
    JUMP: 4,
    /** Same with Feruza shoes, jumpHeight 4. */
    JUMP_HIGH: 8,
    /** Climbing a rope is one row per tick. */
    CLIMB: 1,
    /** Riding a vertical or collapsing platform is one row per tick. */
    RIDE_V: 1,
    /** A horizontal platform moves one column per tick at speed 2-3, so two. */
    RIDE_H_FAST: 2,
    RIDE_H_SLOW: 4,
    /** Boarding or leaving a platform. */
    BOARD: 1,
    ALIGHT: 1,
    /** Sliding down a slope is slower than walking. */
    SLOPE_UP: 3,
    SLOPE_DOWN: 2,
    /** Opening a door, then the transition animation. */
    DOOR: 4,
    /** A locked door additionally costs the open animation. */
    DOOR_LOCKED: 44,
    /** A current moves the hero two tiles per tick, so halve the distance. */
    LIFT_TICKS_PER_ROW: 2,
    CONVEYOR_TICKS_PER_COL: 2,
} as const;

/**
 * The hero's jump ceiling, in tiles, by whether Feruza shoes are worn.
 * engine/dungeon-frame.ts:299-303.
 */
export const JUMP_HEIGHT_DEFAULT = 2;
export const JUMP_HEIGHT_FERUZA = 4;
