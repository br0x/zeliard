/**
 * engine.ts — engine/canvas configuration, feature flags, and the
 * town/dungeon layout constants. Moved verbatim from game.js (Stage 2).
 */

export const TILE_SIZE = 24;
export const VIEW_COLS   = 28;
export const VIEW_ROWS   = 18;
export const VIEW_WIDTH  = VIEW_COLS * TILE_SIZE;
// ─── Feature flags ────────────────────────────────────────────────────────────
export const RUN_TOWN_ENTRY_ON_START = true;
export const RETURN_BEFORE_TOWN_MAIN_LOOP = true;
export const STDPLY_PATH = 'game/stdply.bin';
export const START_TOWN_MDT_PATH = 'game/0/cmap.mdt';

export const NOTIFICATION_STRINGS = {
    1:  [38, "You get 50 golds."],
    2:  [34, "You get 100 golds."],
    3:  [34, "You get 500 golds."],
    4:  [30, "You get 1000 golds."],
    5:  [50, "You get a Key."],
    6:  [28, "You have recovered."],
    7:  [8,  "You have recovered full."],
    8:  [60, "Shield broken."],
    9:  [20, "Can't open this door."],
    10: [28, "Nothing in the box."],
    11: [6,  "You get the Hero's Crest."],
    12: [0,  "You get the Ruzeria shoes."],
    13: [8,  "You get the Glory Crest."],
    14: [6,  "You get the Pirika shoes."],
    15: [6,  "You get the Feruza shoes."],
    16: [0,  "You get the Silkarn shoes."],
    17: [0,  "Get the Enchantment sword."],
    18: [48, "It's too hot !!"],
    19: [8,  "Get the lion's head Key."],
    20: [12, "Finally, you reached me."],
    21: [24, "I enjoyed your show."],
    22: [12, "Come on!  I'll kill you."],
};

export const TOWN_TILE_SHEET_COLS = 16;
export const TOWN_MAP_TILE_OFFSET = 0x17;
export const TOWN_VIEW_ROWS = 8;
export const TOWN_MAP_START_ROW = 8;
export const TOWN_HEADS_START_ROW = TOWN_MAP_START_ROW + 5;
export const TOWN_SIDEWALK1_START_ROW = TOWN_MAP_START_ROW + TOWN_VIEW_ROWS;
export const TOWN_SIDEWALK2_START_ROW = TOWN_SIDEWALK1_START_ROW + 1;
export const TOWN_VISIBLE_COL_OFFSET = 4;
export const TOWN_ANIMATION_FULL_TICKS = 24;
export const TOWN_BACKGROUND_ROWS = 11;
export const TOWN_MDTS = [
    'game/0/cmap.mdt', // Felishika's Castle
    'game/0/mrmp.mdt', // Muralla Town
    'game/0/stmp.mdt', // Satono town
    'game/0/bsmp.mdt', // Bosque Village
    'game/0/hlmp.mdt', // Hellada Town
    'game/0/tmmp.mdt', // Tumba
    'game/0/drmp.mdt', // Dorado
    'game/0/llmp.mdt', // Llama
    'game/0/prmp.mdt', // Pureza
    'game/0/esmp.mdt', // Esco
];
export const HERO_FRAME_W = 48;
export const HERO_FRAME_H = 72;
export const HERO_BASE_Y = TOWN_HEADS_START_ROW * TILE_SIZE;   // row 13 → 312px
export const PROX_COLS = 36;
export const DUNGEON_MAP_HEIGHT = 64;
export const PROX_SIZE = PROX_COLS * DUNGEON_MAP_HEIGHT;
export const DUNGEON_VIEW_LEFT_IN_PROX = 4;
export const DUNGEON_ENTITY_W = 48;
export const DUNGEON_ENTITY_H = 48;
export const DUNGEON_HERO_FRAME_W = 72;
export const DUNGEON_HERO_FRAME_H = 72;
export const DUNGEON_SWORD_FRAME_W = 96;
export const DUNGEON_SWORD_FRAME_H = 96;
export const DUNGEON_HERO_SHEET_COLS = 16;
export const DUNGEON_SWORD_SHEET_COLS = 10;
export const ANIM_SPEED_TICKS = 8;
export const FRAME_LEFT_WALK_BASE = 0;
export const FRAME_FACING_AWAY = 4;
export const FRAME_RIGHT_WALK_BASE = 5;
export const FRAME_LEFT_STAND = 10;
export const FRAME_RIGHT_STAND = 11;
