/**
 * GENERATED FILE — do not edit.
 *
 * Produced by tools/build-nav.mjs from web/public/game/0/mp*.mdt and
 * web/src/data/dungeons.ts. Run `pnpm --filter zeliard-web nav:build` to
 * regenerate, then commit the result.
 *
 * See docs/PATHFINDER_PLAN.md §6.
 */
/** Map metadata needed by the navigation graph. */
export interface NavMapMeta {
    /** DUNGEONS key. */
    readonly id: number;
    readonly mdtPath: string;
    /** Locale key for the cavern name, resolved via t('dungeon.names.<key>'). */
    readonly nameKey: string;
    /**
     * MDT header byte 0x12. 1..9 drive ice (4), heat (7) and the aggressive
     * damage table index; mpa0 stores 10, which the engine's table lookup falls
     * back to 1 for (engine/dungeon-damage.ts:216-217).
     */
    readonly cavernLevel: number;
    readonly mapWidth: number;
    /** Connected component id, cut at town doors. */
    readonly component: number;
    /**
     * No door table at all. True for the 8 boss arenas AND for the three
     * warp-only rooms (mp73, mp90, mpa0) — this is a topology fact, not a genre.
     */
    readonly isDoorless: boolean;
    /** The 8 MP<W>D arenas, by file-name convention. These have no ropes. */
    readonly isBossArena: boolean;
}

/** A connected component of the cavern graph. */
export interface NavComponent {
    readonly id: number;
    /** DUNGEON ids that are members of this component. */
    readonly maps: readonly number[];
    /**
     * Indices into PORTALS, one entry per traversable door: [outbound, inbound].
     * A door into a 0-door map is absent — it is a terminal edge.
     */
    readonly portalPairs: readonly (readonly [number, number])[];
    readonly tiles: number;
}

export const NAV_MAPS: readonly NavMapMeta[] = [
    {
        id: 0,
        mdtPath: 'game/0/mp10.mdt',
        nameKey: 'mp10',
        cavernLevel: 1,
        mapWidth: 240,
        component: 0,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 1,
        mdtPath: 'game/0/mp1d.mdt',
        nameKey: 'mp1d',
        cavernLevel: 1,
        mapWidth: 73,
        component: 1,
        isDoorless: true,
        isBossArena: true,
    },
    {
        id: 2,
        mdtPath: 'game/0/mp20.mdt',
        nameKey: 'mp20',
        cavernLevel: 2,
        mapWidth: 224,
        component: 0,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 3,
        mdtPath: 'game/0/mp21.mdt',
        nameKey: 'mp21',
        cavernLevel: 2,
        mapWidth: 96,
        component: 0,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 4,
        mdtPath: 'game/0/mp2d.mdt',
        nameKey: 'mp2d',
        cavernLevel: 2,
        mapWidth: 52,
        component: 2,
        isDoorless: true,
        isBossArena: true,
    },
    {
        id: 5,
        mdtPath: 'game/0/mp30.mdt',
        nameKey: 'mp30',
        cavernLevel: 3,
        mapWidth: 204,
        component: 0,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 6,
        mdtPath: 'game/0/mp31.mdt',
        nameKey: 'mp31',
        cavernLevel: 3,
        mapWidth: 204,
        component: 0,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 7,
        mdtPath: 'game/0/mp3d.mdt',
        nameKey: 'mp3d',
        cavernLevel: 3,
        mapWidth: 73,
        component: 3,
        isDoorless: true,
        isBossArena: true,
    },
    {
        id: 8,
        mdtPath: 'game/0/mp40.mdt',
        nameKey: 'mp40',
        cavernLevel: 4,
        mapWidth: 320,
        component: 0,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 9,
        mdtPath: 'game/0/mp41.mdt',
        nameKey: 'mp41',
        cavernLevel: 4,
        mapWidth: 192,
        component: 0,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 10,
        mdtPath: 'game/0/mp4d.mdt',
        nameKey: 'mp4d',
        cavernLevel: 4,
        mapWidth: 73,
        component: 4,
        isDoorless: true,
        isBossArena: true,
    },
    {
        id: 11,
        mdtPath: 'game/0/mp50.mdt',
        nameKey: 'mp50',
        cavernLevel: 5,
        mapWidth: 240,
        component: 5,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 12,
        mdtPath: 'game/0/mp51.mdt',
        nameKey: 'mp51',
        cavernLevel: 5,
        mapWidth: 240,
        component: 5,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 13,
        mdtPath: 'game/0/mp5d.mdt',
        nameKey: 'mp5d',
        cavernLevel: 5,
        mapWidth: 73,
        component: 6,
        isDoorless: true,
        isBossArena: true,
    },
    {
        id: 14,
        mdtPath: 'game/0/mp60.mdt',
        nameKey: 'mp60',
        cavernLevel: 6,
        mapWidth: 320,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 15,
        mdtPath: 'game/0/mp61.mdt',
        nameKey: 'mp61',
        cavernLevel: 6,
        mapWidth: 256,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 16,
        mdtPath: 'game/0/mp62.mdt',
        nameKey: 'mp62',
        cavernLevel: 6,
        mapWidth: 73,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 17,
        mdtPath: 'game/0/mp6d.mdt',
        nameKey: 'mp6d',
        cavernLevel: 6,
        mapWidth: 73,
        component: 8,
        isDoorless: true,
        isBossArena: true,
    },
    {
        id: 18,
        mdtPath: 'game/0/mp70.mdt',
        nameKey: 'mp70',
        cavernLevel: 7,
        mapWidth: 208,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 19,
        mdtPath: 'game/0/mp71.mdt',
        nameKey: 'mp71',
        cavernLevel: 7,
        mapWidth: 196,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 20,
        mdtPath: 'game/0/mp72.mdt',
        nameKey: 'mp72',
        cavernLevel: 7,
        mapWidth: 128,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 21,
        mdtPath: 'game/0/mp73.mdt',
        nameKey: 'mp73',
        cavernLevel: 1,
        mapWidth: 73,
        component: 9,
        isDoorless: true,
        isBossArena: false,
    },
    {
        id: 22,
        mdtPath: 'game/0/mp7d.mdt',
        nameKey: 'mp7d',
        cavernLevel: 7,
        mapWidth: 70,
        component: 10,
        isDoorless: true,
        isBossArena: true,
    },
    {
        id: 23,
        mdtPath: 'game/0/mp80.mdt',
        nameKey: 'mp80',
        cavernLevel: 8,
        mapWidth: 256,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 24,
        mdtPath: 'game/0/mp81.mdt',
        nameKey: 'mp81',
        cavernLevel: 8,
        mapWidth: 256,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 25,
        mdtPath: 'game/0/mp82.mdt',
        nameKey: 'mp82',
        cavernLevel: 8,
        mapWidth: 192,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 26,
        mdtPath: 'game/0/mp83.mdt',
        nameKey: 'mp83',
        cavernLevel: 8,
        mapWidth: 128,
        component: 7,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 27,
        mdtPath: 'game/0/mp84.mdt',
        nameKey: 'mp84',
        cavernLevel: 8,
        mapWidth: 64,
        component: 11,
        isDoorless: false,
        isBossArena: false,
    },
    {
        id: 28,
        mdtPath: 'game/0/mp8d.mdt',
        nameKey: 'mp8d',
        cavernLevel: 8,
        mapWidth: 70,
        component: 12,
        isDoorless: true,
        isBossArena: true,
    },
    {
        id: 29,
        mdtPath: 'game/0/mp90.mdt',
        nameKey: 'mp90',
        cavernLevel: 9,
        mapWidth: 42,
        component: 13,
        isDoorless: true,
        isBossArena: false,
    },
    {
        id: 30,
        mdtPath: 'game/0/mpa0.mdt',
        nameKey: 'mpa0',
        cavernLevel: 10,
        mapWidth: 73,
        component: 14,
        isDoorless: true,
        isBossArena: false,
    },
];

/** Lookup by key. Built once at module load; the graph is immutable. */
export const NAV_MAP_BY_ID: ReadonlyMap<number, NavMapMeta> = new Map(
    NAV_MAPS.map((e) => [e.id, e]),
);

/** Tiles per map, for sizing the graph builder's buffers. */
export const NAV_MAP_TILES: readonly number[] = [
    15360,
    4672,
    14336,
    6144,
    3328,
    13056,
    13056,
    4672,
    20480,
    12288,
    4672,
    15360,
    15360,
    4672,
    20480,
    16384,
    4672,
    4672,
    13312,
    12544,
    8192,
    4672,
    4480,
    16384,
    16384,
    12288,
    8192,
    4096,
    4480,
    2688,
    4672,
];

export const NAV_COMPONENTS: readonly NavComponent[] = [
    {
        id: 0,
        maps: [0, 2, 3, 5, 6, 8, 9],
        portalPairs: [
            [2, 13],
            [5, 15],
            [7, 12],
            [8, 14],
            [11, 17],
            [16, 28],
            [18, 29],
            [19, 30],
            [20, 31],
            [21, 32],
            [22, 33],
            [23, 34],
            [24, 35],
            [25, 37],
            [27, 39],
            [41, 52],
            [42, 51],
            [43, 48],
            [45, 50],
            [47, 53]
            ],
        tiles: 94720,
    },
    {
        id: 1,
        maps: [1],
        portalPairs: [],
        tiles: 4672,
    },
    {
        id: 2,
        maps: [4],
        portalPairs: [],
        tiles: 3328,
    },
    {
        id: 3,
        maps: [7],
        portalPairs: [],
        tiles: 4672,
    },
    {
        id: 4,
        maps: [10],
        portalPairs: [],
        tiles: 4672,
    },
    {
        id: 5,
        maps: [11, 12],
        portalPairs: [[54, 63], [56, 64], [58, 65], [60, 66], [61, 67], [62, 69]],
        tiles: 30720,
    },
    {
        id: 6,
        maps: [13],
        portalPairs: [],
        tiles: 4672,
    },
    {
        id: 7,
        maps: [14, 15, 16, 18, 19, 20, 23, 24, 25, 26],
        portalPairs: [
            [70, 108],
            [71, 84],
            [74, 85],
            [75, 100],
            [76, 87],
            [77, 97],
            [78, 91],
            [79, 92],
            [80, 95],
            [81, 98],
            [88, 93],
            [89, 94],
            [90, 96],
            [99, 131],
            [102, 117],
            [103, 123],
            [104, 124],
            [105, 120],
            [106, 118],
            [107, 119],
            [110, 121],
            [111, 125],
            [113, 115],
            [114, 126],
            [116, 122],
            [128, 155],
            [129, 139],
            [130, 138],
            [133, 144],
            [134, 152],
            [135, 149],
            [136, 159],
            [137, 151],
            [140, 153],
            [141, 156],
            [143, 157],
            [145, 160],
            [148, 158],
            [150, 154]
            ],
        tiles: 128832,
    },
    {
        id: 8,
        maps: [17],
        portalPairs: [],
        tiles: 4672,
    },
    {
        id: 9,
        maps: [21],
        portalPairs: [],
        tiles: 4672,
    },
    {
        id: 10,
        maps: [22],
        portalPairs: [],
        tiles: 4480,
    },
    {
        id: 11,
        maps: [27],
        portalPairs: [],
        tiles: 4096,
    },
    {
        id: 12,
        maps: [28],
        portalPairs: [],
        tiles: 4480,
    },
    {
        id: 13,
        maps: [29],
        portalPairs: [],
        tiles: 2688,
    },
    {
        id: 14,
        maps: [30],
        portalPairs: [],
        tiles: 4672,
    },
];

/**
 * Maps a route can be plotted to, indexed by map id.
 *
 * Follows outbound doors everywhere and inbound doors only where the two are
 * mutual, so a boss arena stays selectable as a destination without being
 * treated as two-way. Always a superset of the owning component's maps.
 */
export const NAV_REACHABLE: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [1],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [4],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [7],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [10],
    [10, 11, 12, 13],
    [10, 11, 12, 13],
    [13],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [17],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [21],
    [22],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [27, 28, 29],
    [28],
    [29],
    [30],
];
