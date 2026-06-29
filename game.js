/**
 * game.js — Zeliard web port, main entry point (refactored).
 *
 * Indoor activities moved to separate modules. A generic menu/dialog
 * system is used by Sage and can be reused by other buildings.
 */
import { OpeningIntro }  from './opening-intro.js';
import { SoundManager }  from './sound-manager.js';
import { KingScene }     from './indoor-king.js';
import { PrincessScene } from './indoor-princess.js';
import { SageScene }     from './indoor-sage.js';
import { WeaponShopScene } from './indoor-weapon-shop.js';
import { WitchcraftShopScene } from './indoor-magic-shop.js';
import { ChurchScene }   from './indoor-church.js';
import { BankScene }     from './indoor-bank.js';
import { SaveDialog, RestoreDialog } from './save-restore-ui.js';
import { ImportExportDialog } from './import-export-ui.js';

// ─── Engine / Canvas config ───────────────────────────────────────────────────
const TILE_WIDTH  = 24;
const TILE_HEIGHT = 24;
const VIEW_COLS   = 28;
const VIEW_ROWS   = 18;
const VIEW_WIDTH  = VIEW_COLS * TILE_WIDTH;
// ─── Feature flags ────────────────────────────────────────────────────────────
const RUN_TOWN_ENTRY_ON_START = true;
const RETURN_BEFORE_TOWN_MAIN_LOOP = true;
const STDPLY_PATH = 'game/stdply.bin';
const START_TOWN_MDT_PATH = 'game/0/cmap.mdt';
const DUNGEONS = {
    0: { 
        mdtPath: 'game/0/mp10.mdt',
        tilesheetPath: 'assets/images/mpp1.png',
        entitySheetPath: 'assets/images/enp1.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
        ],
        aggressiveGround: [0x0F, 0x0E, 0x0D], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
    },
};
const DUNGEON_DCHR_SHEET_PATH = 'assets/images/dchr.png';
const DUNGEON_MAGIC_SHEET_PATH = 'assets/images/magic.png';
const DUNGEON_HERO_SHEET_PATH = 'assets/images/fman.png';
const DUNGEON_SWORD_SHEET_PATH = 'assets/images/sword.png';
const PATTERN_ASSETS = {
    0: { // CPAT
        imagePath: 'assets/images/cpat/cmap_x24.png',
        specialTiles: [0x3C, 0x3D],   // pillars (screen edges)
        animatedTilesSeq: [[2, 3, 4, 5]]
    },
    1: { // MPAT
        imagePath: 'assets/images/mpat/mmap_x24.png',
        specialTiles: [0x96, 0x97],   // pillars (screen edges)
        animatedTilesSeq: [[]]
    },
    2: { // DPAT
        imagePath: 'assets/images/dpat/dmap_x24.png',
        specialTiles: [0xbf],
        animatedTilesSeq: [
            [1, 2, 3, 4, 5, 6], 
            [7, 8, 9, 10, 11, 12], 
            [13, 14, 15, 16, 17, 18], 
            [19, 20, 21, 22, 23, 24]
        ]
    }
};

const SWORD_REACH_SMALL = {
    0:  [0x46, 0x01, 0x23, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0xFF],
    2:  [0x8F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF],
    4:  [0x91, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0xFF],
    6:  [0x47, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0xFF],
    8:  [0x49, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x22, 0x01, 0xFF],
    10: [0x91, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0xFF],
    12: [],
    14: [],
    16: [0x4A, 0x01, 0x22, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0xFF],
    18: [0x8D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF],
    20: [0x8D, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0xFF],
    22: [0x48, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0xFF],
    24: [0x46, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x22, 0x01, 0xFF],
    26: [0x8F, 0x01, 0x23, 0x01, 0x23, 0x01, 0x01, 0x22, 0x01, 0x01, 0xFF],
};
const SWORD_REACH_MEDIUM = {
    0:  [0x22, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0xFF], 
    2:  [0x6A, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1E, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    4:  [0x91, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    6:  [0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    8:  [0x4A, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0xFF], 
    10: [0x90, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0xFF], 
    12: [],
    14: [],
    16: [0x26, 0x01, 0x23, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0xFF], 
    18: [0x6C, 0x01, 0x01, 0x01, 0x1D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    20: [0x8C, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    22: [0x24, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    24: [0x45, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0xFF], 
    26: [0x8F, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x23, 0x01, 0xFF],
};
const SWORD_REACH_LARGE = {
    0:  [0x22, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x23, 0x01, 0xFF], 
    2:  [0x6A, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1E, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    4:  [0x91, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    6:  [0x00, 0x01, 0x20, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    8:  [0x25, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0xFF], 
    10: [0xB4, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x23, 0x01, 0xFF], 
    12: [],
    14: [],
    16: [0x26, 0x01, 0x23, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0xFF], 
    18: [0x6D, 0x01, 0x01, 0x1D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    20: [0x8C, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    22: [0x00, 0x01, 0x23, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    24: [0x22, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0xFF], 
    26: [0xB3, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x23, 0x01, 0x23, 0x01, 0xFF],
};

const TOWN_BACKGROUND_YMPD_PATH = 'assets/images/ympd/ympd1.png';
const TOWN_SIDEWALK1_YMPD_PATH = 'assets/images/ympd/ympd2.png';
const TOWN_SIDEWALK2_YMPD_PATH = 'assets/images/ympd/ympd3.png';
const TOWN_BACKGROUND_CKPD_PATH = 'assets/images/ckpd/ckpd1.png';
const TOWN_BACKGROUND0_CKPD_PATH = 'assets/images/ckpd/ckpd0.png';
const TOWN_SIDEWALK1_CKPD_PATH = 'assets/images/ckpd/ckpd2.png';
const TOWN_SIDEWALK2_CKPD_PATH = 'assets/images/ckpd/ckpd3.png';
const ROKA_IMAGE_PATHS = [
    'assets/images/roka/roka_cyan.jpg',
    'assets/images/roka/roka_red.jpg',
    'assets/images/roka/roka_blue.jpg',
    'assets/images/roka/roka_green.jpg',
    'assets/images/roka/roka_violet.jpg',
];

const HERO_SPRITE_PATH = 'assets/images/tman.png';
const PRINCESS_CHAMBER_PATH = 'assets/images/omoya/princess.png';
const KING_IMAGE_PATHS = [
    null,
    'assets/images/king/king1.png',
    'assets/images/king/king2.png',
    'assets/images/king/king3.png',
    'assets/images/king/king4.png',
    'assets/images/king/king5.png',
    'assets/images/king/king6.png',
    'assets/images/king/king7.png',
    'assets/images/king/king8.png',
    'assets/images/king/king9.png',
];
const SAGE_IMAGE_PATH     = 'assets/images/kenjya/kenjya.png';

const ITEMP_SWORD_IMAGE_PATHS = [
    'assets/images/itemp/training_sword.png',
    'assets/images/itemp/wiseman_sword.png',
    'assets/images/itemp/spirit_sword.png',
    'assets/images/itemp/knight_sword.png',
    'assets/images/itemp/illumination_sword.png',
    'assets/images/itemp/enchantment_sword.png',
];
const ITEMP_SHIELD_IMAGE_PATHS = [
    'assets/images/itemp/clay_shield.png',
    'assets/images/itemp/wiseman_shield.png',
    'assets/images/itemp/stone_shield.png',
    'assets/images/itemp/honor_shield.png',
    'assets/images/itemp/light_shield.png',
    'assets/images/itemp/titanium_shield.png',
];
const ITEMP_MAGIC_IMAGE_PATHS = [
    'assets/images/itemp/espada_magic.png',
    'assets/images/itemp/saeta_magic.png',
    'assets/images/itemp/fuego_magic.png',
    'assets/images/itemp/lanzar_magic.png',
    'assets/images/itemp/rascar_magic.png',
    'assets/images/itemp/agua_magic.png',
    'assets/images/itemp/guerra_magic.png',
];
// ─── NPC sprite config ────────────────────────────────────────────────────────
const NPC_SPRITE_PATHS = [
    [
        'assets/images/mman/mman0.png',   // citizen
        'assets/images/mman/mman1.png',   // soldier
        'assets/images/mman/mman2.png',   // citizen
        'assets/images/mman/mman3.png',   // citizen 
        'assets/images/mman/mman4.png',   // citizen
    ],
    [
        'assets/images/cman/cman0.png',   // all are citizens
        'assets/images/cman/cman1.png',
        'assets/images/cman/cman2.png',
        'assets/images/cman/cman3.png',
        'assets/images/cman/cman4.png',
    ],
];
const NPC_FRAME_W  = 48;
const NPC_FRAME_H  = 72;
const NPC_FRAMES   = 8;           // frames per sheet

// WASM memory addresses (mirrors town.h / town.c)
const ADDR_SPOKE_TO_KING = 0x05;
const ADDR_ENTERED_CAVERN_FIRST_TIME = 0x06;
const ADDR_IS_DEATH_ALREADY_PROCESSED = 0x49;
const ADDR_PROXIMITY_MAP_LEFT_COL_X = 0x80;
const ADDR_HERO_X_IN_VIEWPORT = 0x83;
const ADDR_HERO_GOLD_HI  = 0x85;
const ADDR_HERO_GOLD_LO  = 0x86;
const ADDR_HERO_ALMAS    = 0x8b;
const ADDR_HERO_LEVEL    = 0x8d;
const ADDR_HERO_XP       = 0x8e;
const ADDR_HERO_HP       = 0x90;
const ADDR_SWORD_TYPE    = 0x92;
const ADDR_SHIELD_TYPE   = 0x93;
const ADDR_SHIELD_HP     = 0x94;
const ADDR_CURR_SPELL_TYPE = 0x9d;
const ADDR_SPELL_COUNTS = [
    0xab, 0xac, 0xad, 0xae, 0xaf, 0xb0, 0xb1
];
const ADDR_HERO_MAX_HP   = 0xB2;
const ADDR_FACING        = 0xC2;
const ADDR_LEFT_RUN      = 0xC3;
const ADDR_PLACE_MAP_ID  = 0xC4;
const ADDR_SAGES_SPOKEN  = 0xe5;
const ADDR_HERO_ANIM_PHASE    = 0xE7;
const ADDR_INVINCIBILITY_FLAG = 0xE8;

const ADDR_HERO_X_IN_PROXIMITY_MAP = 0x9F1A; // word
const ADDR_TOWN_DESCRIPTOR_PTR    = 0xC000;
const ADDR_DUNGEON_ENTRANCE_TABLE = 0xC00B;
const ADDR_NPC_ARRAY_PTR        = 0xC00F;
const ADDR_HERO_HEAD_Y_IN_VIEWPORT_INITIAL_FROM_MDT = 0xC016;
const ADDR_FRAME_TIMER          = 0xFF1A;
const ADDR_SQUAT_FLAG           = 0xFF38;
const ADDR_ON_ROPE_FLAGS        = 0xFF39;
const ADDR_HERO_HIDDEN_FLAG     = 0xFF3A;
const ADDR_SPELL_ACTIVE_FLAG    = 0xFF3C;
const ADDR_JUMP_PHASE_FLAGS     = 0xFF3D;
const ADDR_BYTE_FF3E            = 0xFF3E;
const ADDR_SHIELD_ANIM_PHASE    = 0xFF3F;
const ADDR_SHIELD_ANIM_ACTIVE   = 0xFF40;
const ADDR_SHIELD_VARIANT_INDEX = 0xFF41;
const ADDR_SLOPE_DIRECTION      = 0xFF42;  // 1=right, 2=left, 0=none
const ADDR_SWORD_SWING_FLAG     = 0xFF43;
const ADDR_UI_ELEMENT_DIRTY     = 0xFF44;
const ADDR_SWORD_HIT_TYPE       = 0xFF45;
const ADDR_SWORD_MOVEMENT_PHASE = 0xFF46;

const ADDR_SOUND_FX_REQUEST = 0xFF75;
const ADDR_DUNGEON_STATE = 0xFF90;
const ADDR_DUNGEON_FRAME_PHASE = 0xFF91;
const ADDR_RENDER_REQUEST = 0xFF92;
const ADDR_RENDER_DONE = 0xFF93;
const ADDR_ROKA_PHASE = 0xFF9D;
const ADDR_ROKA_COLOR = 0xFF9E;
const DUNGEON_STATE_ROKA_RUN = 7;
const ADDR_DUNGEON_EXIT_FLAG = 0xFFE2;

const ADDR_PENDING_TRANSITION_FLAG = 0xFFF4;
const ADDR_CONVERSATION_ACTIVE = 0xFFF5;
const ADDR_BUILDING_ACTIVE = 0xFFFA;
const ADDR_BUILDING_DEST_ID = 0xFFFB;
const ADDR_PENDING_DUNGEON_MAP = 0xFFFC;
const ADDR_PENDING_DUNGEON_FLAG = 0xFFFD;

const TOWN_TILE_SHEET_COLS = 16;
const TOWN_MAP_TILE_OFFSET = 0x17;
const TOWN_VIEW_ROWS = 8;
const TOWN_MAP_START_ROW = 8;
const TOWN_HEADS_START_ROW = TOWN_MAP_START_ROW + 5;
const TOWN_SIDEWALK1_START_ROW = TOWN_MAP_START_ROW + TOWN_VIEW_ROWS;
const TOWN_SIDEWALK2_START_ROW = TOWN_SIDEWALK1_START_ROW + 1;
const TOWN_VISIBLE_COL_OFFSET = 4;
const TOWN_ANIMATION_FULL_TICKS = 24;
const TOWN_BACKGROUND_ROWS = 11;
const TOWN_MDTS = [
    'game/0/cmap.mdt', // Felishika's Castle
    'game/0/mrmp.mdt', // Muralla Town
    'game/0/stmp.mdt', // Satono town
    'game/0/bsmp.mdt', // Bosque Village
    'game/0/hlmp.mdt', // Hellada Town
    'game/0/tmmp.mdt', // Tumba
    'game/0/drmp.mdt', // Dorado
    'game/0/lmmp.mdt', // Llama
    'game/0/prmp.mdt', // Pureza
    'game/0/esmp.mdt', // Esco
];
const HERO_FRAME_W = 48;
const HERO_FRAME_H = 72;
const HERO_BASE_Y = TOWN_HEADS_START_ROW * TILE_HEIGHT;   // row 13 → 312px
const PROX_COLS = 36;
const DUNGEON_MAP_HEIGHT = 64;
const DUNGEON_VIEW_LEFT_IN_PROX = 4;
const DUNGEON_ENTITY_W = 48;
const DUNGEON_ENTITY_H = 48;
const DUNGEON_HERO_FRAME_W = 72;
const DUNGEON_HERO_FRAME_H = 72;
const DUNGEON_SWORD_FRAME_W = 96;
const DUNGEON_SWORD_FRAME_H = 96;
const DUNGEON_HERO_SHEET_COLS = 16;
const DUNGEON_SWORD_SHEET_COLS = 10;
const ANIM_SPEED_TICKS = 8;
const FRAME_LEFT_WALK_BASE = 0;
const FRAME_FACING_AWAY = 4;
const FRAME_RIGHT_WALK_BASE = 5;
const FRAME_LEFT_STAND = 10;
const FRAME_RIGHT_STAND = 11;


// ─── WASM bridge (lazy-loaded) ────────────────────────────────────────────────
let engineReady  = false;
let gameStarted  = false;

let initWasm;
let loadSaveState;
let loadMdt;
let getCavernMdtHeader;
let getCavernName;
let getTownMdtHeader;
let getTownName;
let getTownMusicTrack;
let getTownBackgroundType;
let getTownPatId;
let getProximityMap;
let inputInit;
let inputUpdate;
let inputSetKeys;
let heroMovementInit;
let townToDungeonTransition;
let heroMovementUpdate;
let heroGetDirection;
let heroGetState;
let heroIsMoving;
let updateHorizontalPlatforms;
let heroInteractionCheck;
let combatInit;
let initBossBattle;
let getHeroPosition;
let getTownHeroPosition;
let inputGetDebugCounter;
let getWasmMemory;
let townInit;
let townSetReturnBeforeMainLoop;
let townEntryDisablingEdgeScroll;
let townUpdate;
let townFullTick;
let hasWasmExport;
let setSpecialTileList;
let readMemory;
let writeMemory;
let getTownPendingTransitionFlag;
let getTownPendingTransition;
let townCompleteTransition;
let townEntryEnablingEdgeScroll;
let townFinishConversation;
let townFinishBuilding;
let dungeonInit;
let dungeonUpdate;
let dungeonFullTick;
let dungeonGetViewportTop;
let dungeonGetFullMapPtr;
let dungeonGetEntityTable;
let dungeonGetEntityCount;
let dungeonGetExitMap;
let setDungeonPassableTiles;
let setDungeonAggressiveGround;
let setDungeonAirflows;
let setDungeonSwordReach;
let dungeonGetRenderRequest;
let dungeonClearRenderRequest;

let restoreName = null;
let RENDER_CONFIG;
let renderDungeonObjects;
let gameMode = 'town';
let townEntryRan = false;
let townBackgroundType = null;
let townPatId = null;
let townBackground = null;
let townBackgroundReady = false;
let townCeiling = null;
let townCeilingReady = false;
let townTileSheet = null;
let townTileSheetReady = false;
let townCeilingOffsetX = 0;
let townSidewalk1OffsetX = 0;
let townSidewalk2OffsetX = 0;
let townSidewalk1 = null;
let townSidewalk1Ready = false;
let townSidewalk2 = null;
let townSidewalk2Ready = false;
let heroSprite = null;
let heroSpriteReady = false;
let swordIcons = [];
let swordIconsReady = false;
let shieldIcons = [];
let shieldIconsReady = false;
let magicIcons = [];
let magicIconsReady = false;
let dungeonTileSheet = null;
let dungeonTileSheetReady = false;
let dungeonDchrSheet = null;
let dungeonDchrSheetReady = false;
let dungeonEntitySheet = null;
let dungeonEntitySheetReady = false;
let dungeonMagicSheet = null;
let dungeonMagicSheetReady = false;
let dungeonHeroSheet = null;
let dungeonHeroSheetReady = false;
let dungeonSwordSheet = null;
let dungeonSwordSheetReady = false;

let rokaImages = [];
let rokaImagesReady = false;

// ─── NPC sprite state ─────────────────────────────────────────────────────────
const npcSprites = {
    0: [], // mman cache
    1: []  // cman cache
};
let townNpcSpriteCategory = 0;   // 0: mman, 1: cman
let townAnimTileMap = {};

// ─── Indoor scene manager ─────────────────────────────────────────────────────
let indoorActiveScene = null;   // instance of IndoorSceneBase

const TOWN_DOORS = {
    0: {
        name: 'King of Felishika',
        scene: KingScene,
    },
    1: {
        name: 'In the Hut',
        scene: PrincessScene,
    },
    2: {
        name: 'The Sage',
        scene: SageScene,
    },
    3: {
        name: 'Weapon and Armour Shop',
        scene: WeaponShopScene,
    },
    4: {
        name: 'Witchcraft Implement Shop',
        scene: WitchcraftShopScene,
    },
    5: {
        name: 'The Church',
        scene: ChurchScene,
    },
    6: {
        name: 'The Bank',
        scene: BankScene,
    },
    // 7: Inn (TODO)
    // 8: Cavern (TODO)
};

let activeModal = null;          // instance of SaveDialog or RestoreDialog
let gamePaused = false;          // freeze game updates while modal is open

// ─── Sound Manager ────────────────────────────────────────────────────────────
const SFX_IDS = [10, 19, 20, 29, 30, 40, 50, 60];
const MUSIC_TRACKS = ['mgt1', 'mgt2', 'ugm1', 'ugm2', 'Zeliard-04-CavernOfMalicia'];

const soundManager = new SoundManager({
    workletPath:   'pit-worklet.js',
    sfxBasePath:   'assets/sfx/',
    musicBasePath: 'assets/music/',
    sfxIds:        SFX_IDS,
    musicTracks:   MUSIC_TRACKS,
    onFullTick:    onFullTick,
    onSlowTick:    onSlowTick,
});

let musicEnabled = true;
let currentMusicTrack = null;

function playCurrentMusic(fadeDuration = 1.5) {
    if (!currentMusicTrack) return;
    soundManager.playMusic(currentMusicTrack, fadeDuration);
    soundManager.setMusicMuted?.(!musicEnabled, 0);
}

function setCurrentMusicTrack(trackId) {
    currentMusicTrack = trackId;
    playCurrentMusic();
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    soundManager.setMusicMuted?.(!musicEnabled, 0.25);

    console.log(`Music ${musicEnabled ? 'ON' : 'OFF'}`);
}

// ─── PIT tick callbacks ───────────────────────────────────────────────────────
function onFullTick() {
    if (gamePaused) return;
    frameTimer  = (frameTimer  + 1) & 0xFF;
    tickCounter = (tickCounter + 1) & 0xFFFF;
    animTimer   = (animTimer   + 1) & 0xFFFF;
    if (gameMode === 'dungeon') {
        dungeonFullTick?.();
    }
    else townFullTick?.();

    if (engineReady) {
        if (gameMode === 'dungeon') {
            inputUpdate?.();
            dungeonUpdate?.();
            if (readMemory(ADDR_DUNGEON_EXIT_FLAG, 1)[0] === 0xFF) {
                handleDungeonExit(dungeonGetExitMap?.() ?? 1);
            }
        } else {
            const speedC     = readMemory(0xFF33, 1)[0] || 5;
            const target     = speedC * 4;
            const frameTmr   = readMemory(0xFF1A, 1)[0];
            if (frameTmr >= target) {
                inputUpdate?.();
                townUpdate?.();
                const scrollFlag = readMemory(0xfff0, 1)[0];
                if (scrollFlag) {
                    if (scrollFlag & 0x01) scrollFloorRight8px();
                    if (scrollFlag & 0x02) scrollFloorLeft8px();
                    if (scrollFlag & 0x04) scrollCeilingRight4px();
                    if (scrollFlag & 0x08) scrollCeilingLeft4px();
                    writeMemory(0xfff0, [0]);
                }
                const pendingTransitionFlag = getTownPendingTransitionFlag?.();
                if (pendingTransitionFlag === 0xFF) {
                    const transition = getTownPendingTransition?.();
                    if (transition) {
                        writeMemory(ADDR_PENDING_TRANSITION_FLAG, [0]);
                        handleTownTransition(transition);
                    }
                }
                const pendingDungeonFlag = readMemory(ADDR_PENDING_DUNGEON_FLAG, 1)[0];
                if (pendingDungeonFlag === 0xFF) {
                    const pendingMap = readMemory(ADDR_PENDING_DUNGEON_MAP, 1)[0];
                    handleDungeonTransition(pendingMap);
                }
                checkBuildingRequest();
            }
        }
    }
}

function onSlowTick() {
    if (gamePaused) return;
    if (!engineReady) return;

    updateInputLatches();
    inputSetKeys(keys);

    if (gameMode === 'dungeon') return;

    if (!conversation.active) {
        const activeFlag = readMemory(0xFFF5, 1)[0];
        if (activeFlag) {
            startConversationFromWasm();
        }
    }

    if (conversation.active) {
        const spaceLatched = readMemory(0xFF1D, 1)[0];
        if (spaceLatched) {
            writeMemory(0xFF1D, [0]);
            if (conversation.page < conversation.pages.length - 1) {
                conversation.page++;
            } else {
                conversation.active = false;
                conversation.savedBackground = null;
                townFinishConversation?.();
            }
        }
        return;
    }

    const scrollFlag = readMemory(0xfff0, 1)[0];
    if (scrollFlag) {
        if (scrollFlag & 0x01) scrollFloorRight8px();
        if (scrollFlag & 0x02) scrollFloorLeft8px();
        if (scrollFlag & 0x04) scrollCeilingRight4px();
        if (scrollFlag & 0x08) scrollCeilingLeft4px();
        writeMemory(0xfff0, [0]);
    }
}

// ─── Input ────────────────────────────────────────────────────────────────────
const keys = {
    ArrowUp:    false,
    ArrowDown:  false,
    ArrowLeft:  false,
    ArrowRight: false,
    Space:      false,
    Enter:      false,
    Alt:        false,
    Escape:     false,
};

window.addEventListener('keydown', e => {
    if (['F1', 'F7', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(e.code))
        e.preventDefault();
    
    if (e.code === 'F1') {
        if (!e.repeat) toggleMusic();
        return;
    }

    if (e.code === 'F7') {
        if (!activeModal && !gamePaused) {
            openRestoreModal();
        }
        return;
    }

    if (e.code === 'F8') {
        if (!activeModal && !gamePaused && engineReady) {
            openImportExportModal();
        }
        return;
    }

    // If a modal is active, route keys to it
    if (activeModal) {
        let key = e.code;
        // Convert letter keys to lowercase character
        if (key.startsWith('Key')) {
            key = key[3].toLowerCase();      // 'KeyA' -> 'a'
        } else if (key.startsWith('Digit')) {
            key = key[5];                    // 'Digit1' -> '1'
        } else if (key === 'Space') {
            key = ' ';                       // space character
        } else if (key === 'Backspace') {
            key = 'Backspace';               // keep as is
        }
        // ArrowUp, ArrowDown, Enter, Escape remain unchanged
        if (activeModal.handleKey(key, performance.now())) {
            e.preventDefault();
        }
        return;
    }

    if (openingIntro.active && e.code === 'Space') {
        openingIntro.skipPage();
        return;
    }

    if (indoorActiveScene) {
        if (e.code === 'Space')                       keys.Space     = true;
        if (e.code === 'Enter')                       keys.Enter     = true;
        if (e.code === 'Escape')                      keys.Escape    = true;
        if (e.code === 'ArrowUp')                     keys.ArrowUp   = true;
        if (e.code === 'ArrowDown')                   keys.ArrowDown = true;
        if (e.code === 'ArrowLeft')                   keys.ArrowLeft = true;
        if (e.code === 'ArrowRight')                  keys.ArrowRight = true;

        if (e.code === 'Space' && !e.repeat) indoorActiveScene.handleInput('Space', e.repeat);
        else if (e.code === 'Enter' && !e.repeat) indoorActiveScene.handleInput('Enter', e.repeat);
        else if (e.code === 'Escape' && !e.repeat) indoorActiveScene.handleInput('Escape', e.repeat);
        else if (e.code === 'ArrowUp') indoorActiveScene.handleInput('ArrowUp', e.repeat);
        else if (e.code === 'ArrowDown') indoorActiveScene.handleInput('ArrowDown', e.repeat);
        else if (e.code === 'ArrowLeft') indoorActiveScene.handleInput('ArrowLeft', e.repeat);
        else if (e.code === 'ArrowRight') indoorActiveScene.handleInput('ArrowRight', e.repeat);
        return;
    }

    if (e.code === 'Space')                       keys.Space     = true;
    if (e.code === 'AltLeft' || e.code === 'AltRight') keys.Alt  = true;
    if (e.code === 'Enter')                       keys.Enter     = true;
    if (e.code === 'Escape')                      keys.Escape    = true;
    if (e.code === 'ArrowUp')                     keys.ArrowUp   = true;
    if (e.code === 'ArrowDown')                   keys.ArrowDown = true;
    if (e.code === 'ArrowLeft')                   keys.ArrowLeft = true;
    if (e.code === 'ArrowRight')                  keys.ArrowRight = true;
});

window.addEventListener('keyup', e => {
    if (e.code === 'Space')                       keys.Space     = false;
    if (e.code === 'AltLeft' || e.code === 'AltRight') keys.Alt  = false;
    if (e.code === 'Enter')                       keys.Enter     = false;
    if (e.code === 'Escape')                      keys.Escape    = false;
    if (e.code === 'ArrowUp')                     keys.ArrowUp   = false;
    if (e.code === 'ArrowDown')                   keys.ArrowDown = false;
    if (e.code === 'ArrowLeft')                   keys.ArrowLeft = false;
    if (e.code === 'ArrowRight')                  keys.ArrowRight = false;
});

// ─── Intro screen / game start ────────────────────────────────────────────────
function startOpeningTitles() {
    uiScreen.classList.add('hidden');
    layoutWrapper.classList.add('hidden');
    openingIntro.start();
}

function init() {
    startOpeningTitles();
}

/**
 * startGame — called by OpeningIntro.onComplete.
 */
async function startGame() {
    if (gameStarted) return;
    gameStarted = true;

    uiScreen.classList.remove('hidden');
    layoutWrapper.classList.remove('hidden');

    try {
        await soundManager.init();
    } catch (err) {
        console.warn('[SoundManager] AudioWorklet init failed:', err);
    }

    try {
        await loadWasmEngine();
        await initWasm();

        if (getWasmMemory) {
            soundManager.setWasmMemAccessor(getWasmMemory);
        }

        townInit?.();
        inputInit?.();

        let saveState = null;
        if (!restoreName) {
            const resp = await fetch(STDPLY_PATH);
            if (!resp.ok) {
                throw new Error(`Failed to load ${STDPLY_PATH}: ${resp.status}`);
            }
            saveState = new Uint8Array(await resp.arrayBuffer());
        } else {
            saveState = loadGame();
        }
        loadSaveState(saveState);
        const placeId = saveState[ADDR_PLACE_MAP_ID] & 0x7f;
        const mdtPath = TOWN_MDTS[placeId];

        const response = await fetch(mdtPath);
        if (!response.ok) {
            throw new Error(`Failed to load ${mdtPath}: ${response.status}`);
        }
        mdtData = new Uint8Array(await response.arrayBuffer());
        loadMdt(mdtData);
        mdtHeader = getTownMdtHeader?.();

        townBackgroundType = getTownBackgroundType();
        await loadTownBackground();
        await loadTownCeiling();
        await loadTownSidewalk1();
        await loadTownSidewalk2();
        resetTownScrollOffsets();

        townPatId = getTownPatId();
        const pattern = PATTERN_ASSETS[townPatId];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileList(pattern.specialTiles);
            updateTownAnimation();
        } else {
            console.warn(`Unknown pattern ID ${townPatId}, movement may be blocked`);
        }        
        await loadHeroTownSprite();
        await loadSwordIcons();
        await loadShieldIcons();
        await loadMagicIcons();
        await loadRokaImages();

        parseTownNpcCategory();
        await Promise.all(
            NPC_SPRITE_PATHS[townNpcSpriteCategory].map((_, index) => loadNpcSprite(index))
        );
        if (RUN_TOWN_ENTRY_ON_START) {
            if (!hasWasmExport?.('wasm_town_entry_disabling_edge_scroll')) {
                throw new Error('wasm_town_entry_disabling_edge_scroll is missing from build/zeliard.wasm');
            }

            townSetReturnBeforeMainLoop?.(RETURN_BEFORE_TOWN_MAIN_LOOP);
            townEntryDisablingEdgeScroll();
            townEntryRan = true;
        }

        const trackId = resolveTownMusicTrack(getTownMusicTrack());
        if (trackId) setCurrentMusicTrack(trackId);

        const heroPos = getTownHeroPosition?.() ?? getHeroPosition?.();
        console.log('Hero pos:', heroPos);

        engineReady = true;

    } catch (err) {
        console.error('[startGame] WASM init error:', err);
    }

    soundManager.start();

    requestAnimationFrame(loop);
}

// ─── Town rendering functions (unchanged from original) ───────────────────────
function loadTownBackground() {
    if (townBackgroundReady) return Promise.resolve(townBackground);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { townBackground = img; townBackgroundReady = true; resolve(img); };
        const path = !townBackgroundType ? TOWN_BACKGROUND_YMPD_PATH : TOWN_BACKGROUND_CKPD_PATH;
        img.onerror = () => reject(new Error(`Failed to load ${path}`));
        img.src = path;
    });
}

function loadTownCeiling() {
    if (!townBackgroundType) return Promise.resolve(null);
    if (townCeilingReady) return Promise.resolve(townCeiling);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { townCeiling = img; townCeilingReady = true; resolve(img); };
        img.onerror = () => reject(new Error(`Failed to load ${TOWN_BACKGROUND0_CKPD_PATH}`));
        img.src = TOWN_BACKGROUND0_CKPD_PATH;
    });
}

function loadTownSidewalk1() {
    if (townSidewalk1Ready) return Promise.resolve(townSidewalk1);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { townSidewalk1 = img; townSidewalk1Ready = true; resolve(img); };
        const path = !townBackgroundType ? TOWN_SIDEWALK1_YMPD_PATH : TOWN_SIDEWALK1_CKPD_PATH;
        img.onerror = () => reject(new Error(`Failed to load ${path}`));
        img.src = path;
    });
}

function loadTownSidewalk2() {
    if (townSidewalk2Ready) return Promise.resolve(townSidewalk2);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { townSidewalk2 = img; townSidewalk2Ready = true; resolve(img); };
        const path = !townBackgroundType ? TOWN_SIDEWALK2_YMPD_PATH : TOWN_SIDEWALK2_CKPD_PATH;
        img.onerror = () => reject(new Error(`Failed to load ${path}`));
        img.src = path;
    });
}

function loadTownTileSheet(tileSheetPath) {
    if (townTileSheetReady) return Promise.resolve(townTileSheet);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { townTileSheet = img; townTileSheetReady = true; resolve(img); };
        img.onerror = () => reject(new Error(`Failed to load ${tileSheetPath}`));
        img.src = tileSheetPath;
    });
}

function loadHeroTownSprite() {
    if (heroSpriteReady) return Promise.resolve(heroSprite);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { heroSprite = img; heroSpriteReady = true; resolve(img); };
        img.onerror = () => reject(new Error(`Failed to load ${HERO_SPRITE_PATH}`));
        img.src = HERO_SPRITE_PATH;
    });
}

function loadNpcSprite(spriteId) {
    if (npcSprites[townNpcSpriteCategory][spriteId]) {
        return Promise.resolve(npcSprites[townNpcSpriteCategory][spriteId]);
    }
    const path = NPC_SPRITE_PATHS[townNpcSpriteCategory][spriteId];
    if (!path) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            npcSprites[townNpcSpriteCategory][spriteId] = img;
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load NPC sprite ${path}`));
        img.src = path;
    });
}

function loadRokaImages() {
    if (rokaImagesReady) return Promise.resolve(rokaImages);
    const loads = ROKA_IMAGE_PATHS.map((path, index) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => { rokaImages[index] = img; return img; });
    });
    return Promise.all(loads).then(() => { rokaImagesReady = true; return rokaImages; });
}

function loadImageOnce(path, setter) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { setter(img); resolve(img); };
        img.onerror = () => reject(new Error(`Failed to load ${path}`));
        img.src = path;
    });
}

async function loadDungeonAssets(rawMapId) {
    const loads = [];
    if (!dungeonTileSheetReady) {
        loads.push(loadImageOnce(DUNGEONS[rawMapId].tilesheetPath, img => {
            dungeonTileSheet = img;
            dungeonTileSheetReady = true;
        }));
    }
    if (!dungeonDchrSheetReady) {
        loads.push(loadImageOnce(DUNGEON_DCHR_SHEET_PATH, img => {
            dungeonDchrSheet = img;
            dungeonDchrSheetReady = true;
        }));
    }
    if (!dungeonEntitySheetReady) {
        loads.push(loadImageOnce(DUNGEONS[rawMapId].entitySheetPath, img => {
            dungeonEntitySheet = img;
            dungeonEntitySheetReady = true;
        }));
    }
    if (!dungeonMagicSheetReady) {
        loads.push(loadImageOnce(DUNGEON_MAGIC_SHEET_PATH, img => {
            dungeonMagicSheet = img;
            dungeonMagicSheetReady = true;
        }));
    }
    if (!dungeonHeroSheetReady) {
        loads.push(loadImageOnce(DUNGEON_HERO_SHEET_PATH, img => {
            dungeonHeroSheet = img;
            dungeonHeroSheetReady = true;
        }));
    }
    if (!dungeonSwordSheetReady) {
        loads.push(loadImageOnce(DUNGEON_SWORD_SHEET_PATH, img => {
            dungeonSwordSheet = img;
            dungeonSwordSheetReady = true;
        }));
    }
    await Promise.all(loads);
}

function parseTownNpcCategory() {
    if (!readMemory) { townNpcSpriteCategory = 0; return; }
    const descPtrBytes = readMemory(ADDR_TOWN_DESCRIPTOR_PTR, 2);
    const descPtr = descPtrBytes[0] | (descPtrBytes[1] << 8);
    townNpcSpriteCategory = readMemory(descPtr + 1, 1)[0];
    console.log('[NPC] town descriptor NPC category:', townNpcSpriteCategory);
}

async function loadWasmEngine() {
    const wasmBridge = await import('./src/zeliard-wasm.js');
    ({
        initWasm, loadSaveState, loadMdt, getCavernMdtHeader, getCavernName,
        getTownMdtHeader, getTownName, getTownMusicTrack, getTownBackgroundType,
        getTownPatId, getProximityMap, inputInit, inputUpdate, inputSetKeys,
        heroMovementInit, townToDungeonTransition, heroMovementUpdate, heroGetDirection,
        heroGetState, heroIsMoving, updateHorizontalPlatforms, heroInteractionCheck,
        combatInit, initBossBattle, getHeroPosition,
        getTownHeroPosition, inputGetDebugCounter, getWasmMemory, townInit,
        townSetReturnBeforeMainLoop, townEntryDisablingEdgeScroll, townUpdate,
        townFullTick, hasWasmExport, setSpecialTileList, readMemory, writeMemory,
        getTownPendingTransitionFlag, getTownPendingTransition, townCompleteTransition,
        townEntryEnablingEdgeScroll, townFinishConversation, townFinishBuilding,
        dungeonInit, dungeonUpdate, dungeonFullTick, dungeonGetViewportTop,
        dungeonGetFullMapPtr, dungeonGetEntityTable, dungeonGetEntityCount,
        dungeonGetExitMap, setDungeonPassableTiles, setDungeonAggressiveGround, setDungeonAirflows,
        setDungeonSwordReach, dungeonGetRenderRequest, dungeonClearRenderRequest,
    } = wasmBridge);
}

// Conversation state (NPC dialog overlay)
let conversation = {
    active: false,
    pages: [],
    page: 0,
    pageSize: 6,
    savedBackground: null,
    boxX: 0,
    boxY: 0,
    boxW: 0,
    boxH: 0,
};

// ─── Town scroll helpers ──────────────────────────────────────────────────────
function resetTownScrollOffsets() {
    townSidewalk1OffsetX = 0;
    townSidewalk2OffsetX = 0;
    townCeilingOffsetX = 0;
}

const scrollFloorRight8px = () => {
    townSidewalk1OffsetX = (townSidewalk1OffsetX - 24 + VIEW_WIDTH) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX - 48 + VIEW_WIDTH) % VIEW_WIDTH;
};

const scrollFloorLeft8px = () => {
    townSidewalk1OffsetX = (townSidewalk1OffsetX + 24) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX + 48) % VIEW_WIDTH;
};

const scrollCeilingRight4px = () => {
    townCeilingOffsetX = (townCeilingOffsetX - 12 + VIEW_WIDTH) % VIEW_WIDTH;
};

const scrollCeilingLeft4px = () => {
    townCeilingOffsetX = (townCeilingOffsetX + 12) % VIEW_WIDTH;
};

// ─── Town drawing functions ───────────────────────────────────────────────────
function drawTownBackground() {
    if (!townBackgroundReady) return false;
    ctx.drawImage(townBackground, 0, 0);
    return true;
}

function drawTownCeiling() {
    if (!townBackgroundType || !townCeilingReady || !townBackgroundReady) return false;
    ctx.drawImage(townBackground, 0, 0, canvas.width, TILE_HEIGHT*2, 0, 0, canvas.width, TILE_HEIGHT*2);
    const rightPartWidth = canvas.width - townCeilingOffsetX;
    if (rightPartWidth > 0) {
        ctx.drawImage(townCeiling, townCeilingOffsetX, 0, rightPartWidth, TILE_HEIGHT*2,
                      0, 0, rightPartWidth, TILE_HEIGHT*2);
    }
    const leftPartWidth = townCeilingOffsetX;
    if (leftPartWidth > 0) {
        ctx.drawImage(townCeiling, 0, 0, leftPartWidth, TILE_HEIGHT*2,
                      rightPartWidth, 0, leftPartWidth, TILE_HEIGHT*2);
    }
    return true;
}

function drawTownSidewalk() {
    if (!townSidewalk1Ready || !townSidewalk2Ready) return false;
    const rightPartWidth1 = canvas.width - townSidewalk1OffsetX;
    let y = TOWN_SIDEWALK1_START_ROW*TILE_HEIGHT;
    if (rightPartWidth1 > 0) {
        ctx.drawImage(townSidewalk1, townSidewalk1OffsetX, 0, rightPartWidth1, TILE_HEIGHT,
                      0, y, rightPartWidth1, TILE_HEIGHT);
    }
    const leftPartWidth1 = townSidewalk1OffsetX;
    if (leftPartWidth1 > 0) {
        ctx.drawImage(townSidewalk1, 0, 0, leftPartWidth1, TILE_HEIGHT,
                      rightPartWidth1, y, leftPartWidth1, TILE_HEIGHT);
    }
    const rightPartWidth2 = canvas.width - townSidewalk2OffsetX;
    y = TOWN_SIDEWALK2_START_ROW*TILE_HEIGHT;
    if (rightPartWidth2 > 0) {
        ctx.drawImage(townSidewalk2, townSidewalk2OffsetX, 0, rightPartWidth2, TILE_HEIGHT,
                      0, y, rightPartWidth2, TILE_HEIGHT);
    }
    const leftPartWidth2 = townSidewalk2OffsetX;
    if (leftPartWidth2 > 0) {
        ctx.drawImage(townSidewalk2, 0, 0, leftPartWidth2, TILE_HEIGHT,
                      rightPartWidth2, y, leftPartWidth2, TILE_HEIGHT);
    }
    return true;
}

// some tiles in the towns are animated (like waving flags etc.)
function updateTownAnimation() {
    const pattern = PATTERN_ASSETS[townPatId];
    const seqList = pattern?.animatedTilesSeq ?? [];
    townAnimTileMap = {};
    if (!seqList.length || (seqList.length === 1 && !seqList[0].length)) return;
    for (const seq of seqList) {
        for (let pos = 0; pos < seq.length; pos++) {
            const tileId = seq[pos];
            townAnimTileMap[tileId] = { seq, pos };
        }
    }
}

function getAnimatedTownTileId(tileId) {
    const entry = townAnimTileMap[tileId];
    if (!entry) return tileId;
    const { seq, pos } = entry;
    const len = seq.length;
    const phase = Math.floor(frameTimer / TOWN_ANIMATION_FULL_TICKS) % len;
    const newPos = (pos + phase) % len;
    return seq[newPos];
}

function drawTownTiles() {
    if (!mdtData || !townTileSheetReady) return false;
    const mapWidth = getTownMapWidth();
    if (!mapWidth) return false;
    const heroPos = getTownHeroPosition?.();
    const leftCol = Math.max(0, Math.min(
        mapWidth - VIEW_COLS,
        (heroPos?.proximity_left_col_x ?? 0) + TOWN_VISIBLE_COL_OFFSET
    ));
    for (let col = 0; col < VIEW_COLS; col++) {
        const mapCol = leftCol + col;
        for (let row = 0; row < TOWN_VIEW_ROWS; row++) {
            const mdtOffset = TOWN_MAP_TILE_OFFSET + mapCol * TOWN_VIEW_ROWS + row;
            let tileId = mdtData[mdtOffset] ?? 0;
            tileId = getAnimatedTownTileId(tileId);
            const sx = (tileId % TOWN_TILE_SHEET_COLS) * TILE_WIDTH;
            const sy = Math.floor(tileId / TOWN_TILE_SHEET_COLS) * TILE_HEIGHT;
            ctx.drawImage(
                townTileSheet,
                sx, sy, TILE_WIDTH, TILE_HEIGHT,
                col * TILE_WIDTH, (row + TOWN_MAP_START_ROW) * TILE_HEIGHT,
                TILE_WIDTH, TILE_HEIGHT
            );
        }
    }
    return true;
}

function drawTownHero() {
    if (!heroSpriteReady || !engineReady) return;
    readMemory(0xFF33, 1)[0];
    const heroAnim = readMemory(0x00E7, 1)[0];
    const facing   = readMemory(0x00C2, 1)[0] & 1;
    const moving = keys.ArrowLeft || keys.ArrowRight;
    let frame;
    if (heroAnim === 4) {
        frame = FRAME_FACING_AWAY;
    } else if (!moving) {
        frame = (facing === 0) ? FRAME_RIGHT_STAND : FRAME_LEFT_STAND;
    } else {
        const phase = heroAnim & 3;
        if (facing === 0) {
            frame = FRAME_RIGHT_WALK_BASE + phase;
        } else {
            frame = FRAME_LEFT_WALK_BASE + phase;
        }
    }
    const sx = frame * HERO_FRAME_W;
    const viewportX = readMemory(0x0083, 1)[0];
    const dx = viewportX * TILE_WIDTH;
    const dy = HERO_BASE_Y;
    ctx.drawImage(heroSprite, sx, 0, HERO_FRAME_W, HERO_FRAME_H, dx, dy, HERO_FRAME_W, HERO_FRAME_H);
}

function drawTownNpcs() {
    if (!engineReady || !readMemory) return;
    const ptrBytes = readMemory(ADDR_NPC_ARRAY_PTR, 2);
    const npcArrayAddr = ptrBytes[0] | (ptrBytes[1] << 8);
    if (!npcArrayAddr) return;
    const proxLeftBytes = readMemory(ADDR_PROXIMITY_MAP_LEFT_COL_X, 2);
    const proxLeft = proxLeftBytes[0] | (proxLeftBytes[1] << 8);
    for (let i = 0; i < 64; i++) {
        const base = npcArrayAddr + i * 8;
        const npcMem = readMemory(base, 8);
        const nx = npcMem[0] | (npcMem[1] << 8);
        if (nx === 0xFFFF) break;
        const nFacing    = npcMem[2];
        const sprite  = npcSprites[townNpcSpriteCategory][nFacing & 0xf];
        if (!sprite) continue;
        const nAnimPhase = npcMem[4];
        const screenCol = nx - proxLeft - TOWN_VISIBLE_COL_OFFSET;
        const screenX   = screenCol * TILE_WIDTH;
        if (screenX < -NPC_FRAME_W || screenX >= VIEW_WIDTH) continue;
        const animIdx = nAnimPhase & 3;
        let frame = (nFacing & 0x80) !== 0 ? animIdx : (4 + animIdx);
        const sx = frame * NPC_FRAME_W;
        ctx.drawImage(sprite, sx, 0, NPC_FRAME_W, NPC_FRAME_H, screenX, HERO_BASE_Y, NPC_FRAME_W, NPC_FRAME_H);
    }
}

function drawSheetFrame(sheet, frameIndex, frameW, frameH, cols, dx, dy, dw = frameW, dh = frameH) {
    if (!sheet || frameIndex < 0) return;
    const sx = (frameIndex % cols) * frameW;
    const sy = Math.floor(frameIndex / cols) * frameH;
    if (sx + frameW > sheet.width || sy + frameH > sheet.height) return;
    ctx.drawImage(sheet, sx, sy, frameW, frameH, dx, dy, dw, dh);
}

function drawDungeonTiles() {
    if (!dungeonTileSheetReady || !readMemory) return false;
    const proximity = getProximityMap?.();
    if (!proximity) return false;
    const top = dungeonGetViewportTop?.() ?? 0;

    for (let row = 0; row < VIEW_ROWS; row++) {
        const proxRow = (top + row) & 0x3F;
        for (let col = 0; col < VIEW_COLS; col++) {
            const proxCol = col + DUNGEON_VIEW_LEFT_IN_PROX;
            const tileId = proximity[proxRow*PROX_COLS + proxCol];
            if (tileId === 0) continue;

            const dx = col * TILE_WIDTH;
            const dy = row * TILE_HEIGHT;
            if (tileId >= 1 && tileId <= 25) {
                drawSheetFrame(dungeonTileSheet, tileId - 1, TILE_WIDTH, TILE_HEIGHT, 25, dx, dy);
            } else if (tileId >= 0x40 && tileId < 0x40 + 39 && dungeonDchrSheetReady) { // 0x40..0x66
                drawSheetFrame(dungeonDchrSheet, tileId - 0x40, TILE_WIDTH, TILE_HEIGHT, 39, dx, dy);
            } else {
                console.warn(`Unknown tile ID ${tileId} at ${row},${col}`);
            }
        }
    }
    return true;
}

function getDungeonEntities() {
    if (!readMemory) return [];
    const table = dungeonGetEntityTable?.() ?? 0;
    if (!table) return [];
    const entities = [];
    for (let i = 0; i < 160; i++) {
        const base = table + i * 16;
        const raw = readMemory(base, 16);
        const x = raw[0] | (raw[1] << 8);
        if (x === 0xFFFF) break;
        entities.push({
            x,
            y: raw[2],
            flags: raw[4],
            anim: raw[6] & 3,
            hp: raw[8],
            type: raw[14],
            counter: raw[15],
        });
    }
    return entities;
}

function drawDungeonEntities() {
    if (!dungeonEntitySheetReady || !readMemory) return;
    const proxLeftBytes = readMemory(ADDR_PROXIMITY_MAP_LEFT_COL_X, 2);
    const proxLeft = proxLeftBytes[0] | (proxLeftBytes[1] << 8);
    const top = dungeonGetViewportTop?.() ?? 0;

    for (const entity of getDungeonEntities()) {
        const screenX = (entity.x - proxLeft - DUNGEON_VIEW_LEFT_IN_PROX) * TILE_WIDTH - TILE_WIDTH / 2;
        const screenY = (entity.y - top) * TILE_HEIGHT - TILE_HEIGHT;
        if (screenX < -DUNGEON_ENTITY_W || screenX > VIEW_WIDTH ||
            screenY < -DUNGEON_ENTITY_H || screenY > VIEW_ROWS * TILE_HEIGHT) {
            continue;
        }

        const sprite = Math.max(0, Math.min(76, (entity.type || 1) - 1));
        drawSheetFrame(
            dungeonEntitySheet,
            sprite,
            DUNGEON_ENTITY_W,
            DUNGEON_ENTITY_H,
            77,
            screenX,
            screenY
        );
    }
}

function readU8(addr) {
    return readMemory?.(addr, 1)?.[0] ?? 0;
}

function getShieldCategory() {
    const shieldType = readMemory?.(ADDR_SHIELD_TYPE, 1)?.[0] ?? 0;
    if (!shieldType) return 0;
    return shieldType >= 4 ? 2 : 1;
}

function getDungeonHeroState() {
    return {
        facingLeft: (readU8(ADDR_FACING) & 1) !== 0,
        animPhase: readU8(ADDR_HERO_ANIM_PHASE),
        invincible: readU8(ADDR_INVINCIBILITY_FLAG) !== 0,
        squat: readU8(ADDR_SQUAT_FLAG) !== 0,
        onRope: readU8(ADDR_ON_ROPE_FLAGS) !== 0,
        hidden: readU8(ADDR_HERO_HIDDEN_FLAG) !== 0,
        jump: readU8(ADDR_JUMP_PHASE_FLAGS),
        shieldAnimActive: readU8(ADDR_SHIELD_ANIM_ACTIVE) !== 0,
        shieldPhase: readU8(ADDR_SHIELD_ANIM_PHASE),
        shieldVariant: readU8(ADDR_SHIELD_VARIANT_INDEX),
        slope: readU8(ADDR_SLOPE_DIRECTION),
        shieldCategory: getShieldCategory(),
    };
}

function resolveBodyFrame(state) {
    if (state.hidden) return 30;
    if (state.onRope) return 26 + (state.animPhase & 3);
    const base = state.facingLeft ? 13 : 0;
    let offset;
    if (state.invincible) offset = 10 + (state.animPhase & 3);
    else if (state.squat) offset = 5;
    else if (state.jump & 0x80) offset = 7;
    else if (state.slope === 1) offset = 8;
    else if (state.slope === 2) offset = 9;
    else if (state.jump === 0x7F) offset = 6;
    else if (state.animPhase === 0x80) offset = 4;
    else offset = state.animPhase & 3;
    return base + offset;
}

function resolveBackArmFrame(state) {
    if (state.invincible || state.onRope || state.hidden) return null;

    const armBase = state.facingLeft ? 49 : 31;
    const shieldOffset = state.shieldCategory === 2 ? 3 : 0;
    if (state.shieldAnimActive) {
        const phase = Math.floor(state.shieldPhase / 2);
        if (!state.facingLeft) return 79 + phase + (state.shieldCategory * 4);
        let off = phase + 4;
        if (state.shieldVariant === 1) off += 4;
        else if (state.shieldVariant === 2) off = 11;
        return armBase + off;
    }

    if (state.shieldCategory && !state.facingLeft) {
        return armBase + 12 + (state.squat ? 1 : 0) + shieldOffset;
    }

    if (state.squat || state.animPhase === 0x80) return null;
    const phase = (state.animPhase + 2) & 3;
    if (phase & 1) return null;
    return armBase + phase;
}

function resolveFrontArmFrame(state) {
    const armBase = state.facingLeft ? 49 : 31;
    const shieldOffset = state.shieldCategory === 2 ? 3 : 0;

    if (state.invincible) return null;

    if (state.onRope || state.hidden) {
        if (!state.shieldCategory) return null;
        return armBase + (state.shieldCategory === 2 ? 17 : 14);
    }

    if (state.shieldAnimActive) {
        const phase = Math.floor(state.shieldPhase / 2);
        if (!state.facingLeft) return 67 + phase + (state.shieldCategory * 4);
        let off = phase + 4;
        if (state.shieldVariant === 1) off += 4;
        else if (state.shieldVariant === 2) off = 11;
        return armBase + off;
    }

    if (state.shieldCategory && state.facingLeft) {
        return armBase + 12 + (state.squat ? 1 : 0) + shieldOffset;
    }

    if (state.squat || state.animPhase === 0x80) return armBase + 3;
    return armBase + (state.animPhase & 3);
}

function drawDungeonHero() {
    if (!dungeonHeroSheetReady || !engineReady || !readMemory) return;
    const heroPos = getHeroPosition?.();
    if (!heroPos) return;
    const dx = heroPos.hero_x_in_viewport * TILE_WIDTH;
    const dy = heroPos.hero_head_y_in_viewport * TILE_HEIGHT;
    const state = getDungeonHeroState();
    const armDy = state.squat ? dy + TILE_HEIGHT : dy;
    const layers = [
        { frame: resolveBackArmFrame(state), y: armDy },
        { frame: resolveBodyFrame(state), y: dy },
        { frame: resolveFrontArmFrame(state), y: armDy },
    ];
    for (const { frame, y } of layers) {
        if (frame === null) continue;
        drawSheetFrame(dungeonHeroSheet, frame, DUNGEON_HERO_FRAME_W, DUNGEON_HERO_FRAME_H,
            DUNGEON_HERO_SHEET_COLS, dx, y);
    }
}

function drawDungeonSword() {
    if (!dungeonSwordSheetReady || !readMemory || !writeMemory) return;
    const swingFlag = readMemory(ADDR_SWORD_SWING_FLAG, 1)[0];
    if (!swingFlag) return;

    let phase = readMemory(ADDR_SWORD_MOVEMENT_PHASE, 1)[0];
    const hitType = readMemory(ADDR_SWORD_HIT_TYPE, 1)[0] || 0;
    const swordType = Math.max(1, Math.min(6, readMemory(ADDR_SWORD_TYPE, 1)[0] || 1));
    const facingLeft = (readMemory(ADDR_FACING, 1)[0] & 1) !== 0;

    const maxPhase = [7, 5, 5][hitType] || 5;
    if (phase >= maxPhase) {
        writeMemory(ADDR_SWORD_SWING_FLAG, [0]);
        return;
    }

    writeMemory(ADDR_SWORD_MOVEMENT_PHASE, [phase + 1]);

    let col;
    switch (hitType) {
        case 1:
            col = 5 + phase;
            break;
        case 2:
            col = 9;
            break;
        default:
            col = Math.min(phase, 4);
            break;
    }

    const baseRow = (swordType - 1) * 2;
    const row = baseRow + (facingLeft ? 1 : 0);
    const spriteIndex = row * DUNGEON_SWORD_SHEET_COLS + col;

    const heroPos = getHeroPosition?.();
    if (!heroPos) return;

    let dx = heroPos.hero_x_in_viewport * TILE_WIDTH - TILE_WIDTH * 2;
    let dy = heroPos.hero_head_y_in_viewport * TILE_HEIGHT - TILE_HEIGHT * 2;
    if (readMemory(ADDR_SQUAT_FLAG, 1)[0]) {
        dy += TILE_HEIGHT;
    }

    drawSheetFrame(
        dungeonSwordSheet,
        spriteIndex,
        DUNGEON_SWORD_FRAME_W,
        DUNGEON_SWORD_FRAME_H,
        DUNGEON_SWORD_SHEET_COLS,
        dx,
        dy
    );
}

function drawDungeonRoka() {
    if (!rokaImagesReady || !readMemory) return;
    const colorIdx = readU8(ADDR_ROKA_COLOR);
    const phase = readU8(ADDR_ROKA_PHASE);
    const facingLeft = (readU8(ADDR_FACING) & 1) !== 0;
    const leftRun = readU8(ADDR_LEFT_RUN) !== 0;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rokaImg = rokaImages[Math.min(colorIdx, ROKA_IMAGE_PATHS.length - 1)];
    if (rokaImg) {
        ctx.drawImage(rokaImg, 0, 0, canvas.width, canvas.height);
    }

    const t = phase / 25;
    const heroW = DUNGEON_HERO_FRAME_W;
    let dx;
    if (leftRun) {
        dx = Math.round((1 - t) * (canvas.width - heroW) + t * (canvas.width / 2 - heroW / 2));
    } else {
        dx = Math.round((1 - t) * (-heroW / 2) + t * (canvas.width / 2 - heroW / 2));
    }
    const headY = readU8(ADDR_HERO_HEAD_Y_IN_VIEWPORT_INITIAL_FROM_MDT) || 4;
    const dy = headY * TILE_HEIGHT;

    const animPhase = readU8(ADDR_HERO_ANIM_PHASE);
    const state = {
        facingLeft,
        animPhase,
        invincible: false,
        squat: false,
        onRope: false,
        hidden: false,
        jump: 0,
        shieldAnimActive: false,
        shieldPhase: 0,
        shieldVariant: 0,
        slope: 0,
        shieldCategory: 0,
    };
    const frame = resolveBodyFrame(state);
    drawSheetFrame(dungeonHeroSheet, frame, DUNGEON_HERO_FRAME_W, DUNGEON_HERO_FRAME_H,
        DUNGEON_HERO_SHEET_COLS, dx, dy);
}

// ─── Town transition ──────────────────────────────────────────────────────────
let townTransitionInProgress = false;
async function handleTownTransition(transition) {
    if (townTransitionInProgress) return;
    townTransitionInProgress = true;
    engineReady = false;
    try {
        const rawMapId = transition.mapId & 0x7F;
        const mdtPath  = TOWN_MDTS[rawMapId];
        if (!mdtPath) throw new Error(`No MDT path for map id ${rawMapId}`);
        const resp = await fetch(mdtPath);
        if (!resp.ok) throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdt(mdtData);
        mdtHeader = getTownMdtHeader?.();
        const newBgType = getTownBackgroundType();
        if (newBgType !== townBackgroundType) {
            townBackgroundType = newBgType;
            townBackgroundReady = false;
            townBackground = null;
            townCeilingReady = false;
            townCeiling = null;
            townSidewalk1Ready = false;
            townSidewalk1 = null;
            townSidewalk2Ready = false;
            townSidewalk2 = null;
        }
        await loadTownBackground();
        await loadTownCeiling();
        await loadTownSidewalk1();
        await loadTownSidewalk2();
        resetTownScrollOffsets();
        const newPatId = transition.patId;
        if (newPatId !== townPatId) {
            townPatId = newPatId;
            townTileSheetReady = false;
            townTileSheet = null;
        }
        const pattern = PATTERN_ASSETS[townPatId];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileList(pattern.specialTiles);
            updateTownAnimation();
        }
        parseTownNpcCategory();
        await Promise.all(
            NPC_SPRITE_PATHS[townNpcSpriteCategory].map((_, index) => loadNpcSprite(index))
        );
        townSetReturnBeforeMainLoop?.(RETURN_BEFORE_TOWN_MAIN_LOOP);
        townCompleteTransition?.();
        const trackId = resolveTownMusicTrack(getTownMusicTrack?.());
        if (trackId && trackId !== currentMusicTrack) setCurrentMusicTrack(trackId);
        console.log(`[transition] entered map ${rawMapId}`);
    } catch (err) {
        console.error('[handleTownTransition] failed:', err);
    } finally {
        townTransitionInProgress = false;
        engineReady = true;
    }
}

let dungeonTransitionInProgress = false;
async function handleDungeonTransition(mapId) {
    if (dungeonTransitionInProgress) return;
    dungeonTransitionInProgress = true;
    engineReady = false;
    try {
        writeMemory(ADDR_PENDING_DUNGEON_FLAG, [0]);
        const rawMapId = mapId & 0x7F;
        const mdtPath = DUNGEONS[rawMapId].mdtPath;
        const resp = await fetch(mdtPath);
        if (!resp.ok) 
            throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdt(mdtData);
        mdtHeader = getCavernMdtHeader?.();
        cavernName = getCavernName?.() || 'Cavern of Malicia';
        await loadDungeonAssets(rawMapId);
        setDungeonPassableTiles(DUNGEONS[rawMapId].passableTiles);
        setDungeonAggressiveGround(DUNGEONS[rawMapId].aggressiveGround);
        setDungeonAirflows(DUNGEONS[rawMapId].airflows);
        // set sword reachability list
        const swordType = readMemory(ADDR_SWORD_TYPE, 1)[0];
        if (swordType <= 3) {
            setDungeonSwordReach(SWORD_REACH_SMALL);
        } else if (swordType <= 5) {
            setDungeonSwordReach(SWORD_REACH_MEDIUM);
        } else {
            setDungeonSwordReach(SWORD_REACH_LARGE);
        }
        await loadRokaImages();
        dungeonInit?.(rawMapId); // should call dungeon::prepare_dungeon
        gameMode = 'dungeon';
        townEntryRan = false;
        setCurrentMusicTrack('Zeliard-04-CavernOfMalicia');
        console.log(`[dungeon] entered map ${rawMapId}`);
    } catch (err) {
        console.error('[handleDungeonTransition] failed:', err);
    } finally {
        dungeonTransitionInProgress = false;
        engineReady = true;
    }
}

let dungeonExitInProgress = false;
async function handleDungeonExit(townMapId) {
    if (dungeonExitInProgress) return;
    dungeonExitInProgress = true;
    engineReady = false;
    try {
        writeMemory(ADDR_DUNGEON_EXIT_FLAG, [0]);
        const rawMapId = townMapId & 0x7F;
        const mdtPath = TOWN_MDTS[rawMapId] ?? TOWN_MDTS[1] ?? TOWN_MDTS[0];
        const resp = await fetch(mdtPath);
        if (!resp.ok) throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdt(mdtData);
        mdtHeader = getTownMdtHeader?.();

        const mapWidth = getTownMapWidth();
        const heroXproxBytes = readMemory(ADDR_HERO_X_IN_PROXIMITY_MAP, 2);
        const heroXprox = heroXproxBytes[0] | (heroXproxBytes[1] << 8);
        if (mapWidth) {
            const { proxLeft, heroViewX } = computeTownScrollFromAbsoluteX(heroXprox, mapWidth);
            writeMemory(ADDR_PROXIMITY_MAP_LEFT_COL_X, [proxLeft & 0xFF, (proxLeft >> 8) & 0xFF]);
            writeMemory(ADDR_HERO_X_IN_VIEWPORT, [heroViewX]);
        }

        const newBgType = getTownBackgroundType();
        if (newBgType !== townBackgroundType) {
            townBackgroundType = newBgType;
            townBackgroundReady = false;
            townBackground = null;
            townCeilingReady = false;
            townCeiling = null;
            townSidewalk1Ready = false;
            townSidewalk1 = null;
            townSidewalk2Ready = false;
            townSidewalk2 = null;
        }
        await loadTownBackground();
        await loadTownCeiling();
        await loadTownSidewalk1();
        await loadTownSidewalk2();
        resetTownScrollOffsets();

        const newPatId = getTownPatId();
        if (newPatId !== townPatId) {
            townPatId = newPatId;
            townTileSheetReady = false;
            townTileSheet = null;
        }
        const pattern = PATTERN_ASSETS[townPatId];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileList(pattern.specialTiles);
            updateTownAnimation();
        }

        parseTownNpcCategory();
        await Promise.all(
            NPC_SPRITE_PATHS[townNpcSpriteCategory].map((_, index) => loadNpcSprite(index))
        );
        townSetReturnBeforeMainLoop?.(RETURN_BEFORE_TOWN_MAIN_LOOP);
        townEntryDisablingEdgeScroll();
        townEntryRan = true;
        gameMode = 'town';
        const trackId = resolveTownMusicTrack(getTownMusicTrack?.());
        if (trackId) setCurrentMusicTrack(trackId);
        console.log(`[dungeon] exited to town ${rawMapId}`);
    } catch (err) {
        console.error('[handleDungeonExit] failed:', err);
    } finally {
        dungeonExitInProgress = false;
        engineReady = true;
    }
}

function resolveTownMusicTrack(type) {
    const map = { 0: 'mgt1', 1: 'ugm1', 2: 'mgt2', 3: 'ugm2' };
    return map[type] ?? 'mgt1';
}

function computeTownScrollFromAbsoluteX(heroProxX, mapWidth) {
    // Edge locking logic from fight.asm (edge_locking_scrolling_window)
    let heroViewX = 13;
    let proxLeft = 0;

    if (heroProxX > mapWidth - 13)
    {
        // ── Right-edge lock ──────────────────────────────────────────────
        // Hero is within 13 columns of the right edge; freeze the viewport
        // so the map's rightmost column stays visible.
        const  carry = (mapWidth >= PROX_COLS) ? 1 : 0;
        const left_col = mapWidth - PROX_COLS;

        proxLeft = left_col;
        heroViewX = (heroProxX - left_col - carry) - 3;
    }
    else
    {
        // Subtract 17; the result wraps to a large uint16 when hero_x < 17,
        // which is exactly what `or ah, ah / jnz` detected in the original.
        const ax = (heroProxX + 65536 - 17) & 0xFFFF;

        if (ax > 255)
        {
            // ── Left-edge lock ───────────────────────────────────────────
            // Hero is within 17 columns of the left edge (or hero_x wrapped
            // past 272, which shouldn't occur in practice).
            // Freeze the viewport at column 0; hero sits 4 tiles from left.
            proxLeft = 0;
            heroViewX = heroProxX - 4;
        }
        else
        {
            // ── Middle (free scrolling) ──────────────────────────────────
            // Hero is far enough from both edges; scroll the map so the hero
            // always appears at viewport column 13 (bx=13 was set at entry).
            proxLeft = ax;   // hero_x_in_proximity_map - 17
            heroViewX = 13;
        }
    }
    return { proxLeft, heroViewX };
}

function getTownMapWidth() {
    if (!mdtData || mdtData.length < 4) return 0;
    return mdtData[2] | (mdtData[3] << 8);
}

// ─── Conversation (NPC dialog) ────────────────────────────────────────────────
let lastSpace = false;
let lastAlt = false;

function updateInputLatches() {
    const currentSpace = keys.Space;
    const currentAlt = keys.Alt;
    if (currentSpace && !lastSpace) writeMemory(0xFF1D, [1]);
    if (currentAlt && !lastAlt) writeMemory(0xFF1E, [1]);
    lastSpace = currentSpace;
    lastAlt = currentAlt;
}

function getNpcConversationRaw(npcId) {
    let ptr = readMemory(0xC00D, 2);
    const convTablePtr = ptr[0] | (ptr[1] << 8);
    if (!convTablePtr) return null;
    const textPtr = readMemory(convTablePtr + npcId * 2, 2);
    const textAddr = textPtr[0] | (textPtr[1] << 8);
    if (!textAddr) return null;
    let bytes = [];
    let b;
    while ((b = readMemory(textAddr + bytes.length, 1)[0]) !== 0xFF) {
        if (b === 0) break;
        bytes.push(b);
    }
    return new Uint8Array(bytes);
}

const CHAR_WIDTH_TABLE = [
    5,4,4,4,6,8,5,3,4,4,6,6,6,5,6,8,7,5,7,7,7,7,7,7,7,7,3,4,6,6,6,7,
    8,8,8,8,8,8,8,8,8,5,8,8,8,8,8,8,8,8,8,8,7,8,8,8,8,8,7,5,3,5,6,7,
    7,8,8,7,8,7,7,8,8,5,6,8,5,8,7,7,8,8,8,7,6,8,8,8,7,7,7,4,8,4,7,8,
];
const ORIG_MAX_LINE_PX = 256;
const TEXT_AREA_WIDTH = 624; // DIALOG_MAX_WIDTH - 2*DIALOG_PADDING_X
const WIDTH_SCALE = TEXT_AREA_WIDTH / ORIG_MAX_LINE_PX;
const DIALOG_FONT_SIZE = 18;
const DIALOG_LINES_PER_PAGE = 15;
const DIALOG_PADDING_X = 10;
const DIALOG_MAX_WIDTH = VIEW_WIDTH - 24;
const TOWN_HEADS_ROW = TOWN_MAP_START_ROW + 5;
const DIALOG_BOTTOM_Y = TOWN_HEADS_ROW * TILE_HEIGHT - 4;
const TEXT_FIRST_BASELINE = 32;
const TEXT_LINE_HEIGHT = 24;
const TEXT_BOTTOM_PAD = 20;

function charOrigWidth(ch) {
    const idx = ch.charCodeAt(0) - 0x20;
    if (idx < 0 || idx >= CHAR_WIDTH_TABLE.length) return 6;
    return CHAR_WIDTH_TABLE[idx];
}

function parseDialogText(bytes) {
    const pages = [];
    let lines  = [''];
    let lineW  = 0;
    const MAX_W = ORIG_MAX_LINE_PX;
    const pushLine = () => {
        lines.push('');
        lineW = 0;
        if (lines.length - 1 === DIALOG_LINES_PER_PAGE) {
            const trimmed = lines.slice(0, DIALOG_LINES_PER_PAGE);
            pages.push(trimmed);
            lines = [''];
        }
    };
    for (let i = 0; i < bytes.length; i++) {
        let b = bytes[i];
        if (b === 0xFF || b === 0x00) break;
        if (b >= 0x81) break;
        if (b === 0x2F) { pushLine(); continue; }
        if (b === 0x5c) b = 0x27;
        if (b === 0x26) b = 0x20;
        if (b < 0x20) continue;
        const ch = String.fromCharCode(b);
        const cw = charOrigWidth(ch);
        if (b === 0x20) {
            let nextW = 0;
            for (let j = i + 1; j < bytes.length; j++) {
                const nb = bytes[j];
                if (nb === 0x20 || nb === 0x2F || nb >= 0x80) break;
                if (nb >= 0x20) nextW += charOrigWidth(String.fromCharCode(nb));
            }
            if (lineW + cw + nextW >= MAX_W) {
                pushLine();
                continue;
            }
        }
        lines[lines.length - 1] += ch;
        lineW += cw;
    }
    const nonEmpty = lines.filter(l => l.length > 0);
    if (nonEmpty.length > 0) pages.push(nonEmpty);
    return pages;
}

function computeBoxGeometry(facingLeft) {
    const page = conversation.pages[conversation.page] ?? [];
    const nLines = Math.max(page.length, 1);
    const bh = TEXT_FIRST_BASELINE + (nLines - 1) * TEXT_LINE_HEIGHT + TEXT_BOTTOM_PAD;
    ctx.save();
    ctx.font = `${DIALOG_FONT_SIZE + 2}px 'Courier New', monospace`;
    let maxW = 0;
    for (const line of page) {
        const w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
    }
    ctx.restore();
    const bw = Math.min(Math.max(maxW + 2 * DIALOG_PADDING_X + 16, 160), DIALOG_MAX_WIDTH);
    let bx = facingLeft ? VIEW_WIDTH - bw - 12 : 12;
    const by = DIALOG_BOTTOM_Y - bh;
    conversation.boxX = bx;
    conversation.boxY = Math.max(by, 4);
    conversation.boxW = bw;
    conversation.boxH = bh;
}

function drawConversationDialog() {
    if (!conversation.active || !conversation.pages.length) return;
    const pageLines = conversation.pages[conversation.page] || [];
    const totalPages = conversation.pages.length;
    const width = conversation.boxW || 300;
    const height = conversation.boxH || 100;
    const x = conversation.boxX || 10;
    const y = conversation.boxY || 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.99)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(x, y, width, height);
    ctx.font = '20px "Courier New", monospace';
    ctx.fillStyle = '#fff';
    for (let i = 0; i < pageLines.length; i++) {
        ctx.fillText(pageLines[i], x + 16, y + 32 + i * TEXT_LINE_HEIGHT);
    }
    if (conversation.page < totalPages - 1) {
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('▼', x + width - 24, y + height - 12);
    }
}

function startConversationFromWasm() {
    const npcAddrBytes = readMemory(0xFFF6, 2);
    const npcAddr = npcAddrBytes[0] | (npcAddrBytes[1] << 8);
    let npcId = 0;
    if (npcAddr) {
        npcId = readMemory(npcAddr + 7, 1)[0];
    }
    const rawText = getNpcConversationRaw(npcId);
    const pages = parseDialogText(rawText);
    if (pages.length === 0) {
        townFinishConversation?.();
        return;
    }
    conversation.active = true;
    conversation.pages = pages;
    conversation.page = 0;
    conversation.savedBackground = null;
    computeBoxGeometry(readMemory(npcAddr + 2, 1)[0] & 0x80);
}

// ─── Indoor scene entry / exit ────────────────────────────────────────────────
function checkBuildingRequest() {
    if (!engineReady || !readMemory || indoorActiveScene) return;
    const active = readMemory(ADDR_BUILDING_ACTIVE, 1)[0];
    if (!active) return;
    const destId = readMemory(ADDR_BUILDING_DEST_ID, 1)[0];
    startIndoorScene(destId);
}

function startIndoorScene(destId) {
    if (!TOWN_DOORS[destId]) {
        console.warn(`[building] destination ${destId} not implemented`);
        townFinishBuilding?.();
        return;
    }
    const finishCb = () => {
        indoorActiveScene = null;
        townFinishBuilding?.();
        keys.Space = false;
        lastSpace = false;
    };
    const context = {
        canvas, ctx, readMemory, writeMemory,
        finishCallback: finishCb,
        soundManager,
        saveGame,
        renderGoldHud,
        renderAlmasHud,
        drawLifeBar,
        setLife,
        renderSwordHud,
        renderMagicHud,
        renderShieldHud,
    };

    const building = TOWN_DOORS[destId];
    if (building) {
        indoorActiveScene = new building.scene(context);
        indoorActiveScene.building = building;
        indoorActiveScene.enter(performance.now());
    }
}

// ─── UI helpers (gold, sword, shield, magic) ──────────────────────────────────
function updateElementText(elementId, value) {
    const el = document.getElementById(elementId);
    if (el && value !== undefined) el.textContent = value;
}

function updatePlaceHud(name, indoor = false) {
    const placeRow = document.querySelector('.place-row');
    const placeLabel = document.getElementById('placeLabel');
    if (placeRow) placeRow.classList.toggle('indoor-place', indoor);
    if (placeLabel) placeLabel.textContent = indoor ? '' : 'PLACE';
    updateElementText('currentMapName', name);
}

function getHeroHp() {
    if (!readMemory) return 0;
    const hpBytes = readMemory(ADDR_HERO_HP, 2);
    return (hpBytes[0] | (hpBytes[1] << 8));
}

function setHeroHp(hp) {
    if (!writeMemory) return;
    const clamped = Math.max(0, Math.min(0xFFFF, hp));
    writeMemory(ADDR_HERO_HP, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
}

function getHeroMaxHp() {
    if (!readMemory) return 0;
    const hpBytes = readMemory(ADDR_HERO_MAX_HP, 2);
    return (hpBytes[0] | (hpBytes[1] << 8));
}

function setHeroMaxHp(maxHp) {
    if (!writeMemory) return;
    const clamped = Math.max(0, Math.min(0xFFFF, maxHp));
    writeMemory(ADDR_HERO_MAX_HP, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
}

let lifeFillCurrentEl = null;
let lifeFillMaxEl     = null;

function drawLifeBar() {
    if (!lifeFillCurrentEl) {
        lifeFillCurrentEl = document.querySelector('.life-fill-current');
        lifeFillMaxEl     = document.querySelector('.life-fill-max');
    }
    setLife(getHeroHp(), getHeroMaxHp());
}

// Max possible HP is 800 (which corresponds to 100% of the bar)
function setLife(currentLife, maxLife) {
    if (lifeFillCurrentEl && lifeFillMaxEl) {
        lifeFillMaxEl.style.width     = (maxLife/8)     + '%';
        lifeFillCurrentEl.style.width = (currentLife/8) + '%';
    }
}

export function saveGame(saveData, saveKey = 'zeliard_save_01') {
    if (saveData.length !== 256) {
        console.error(`saveGame: expected 256 bytes, got ${saveData.length}`);
        return;
    }
    // Build a binary string from the bytes, then base64‑encode
    const binary = String.fromCharCode(...saveData);
    const base64 = btoa(binary);
    localStorage.setItem(saveKey, base64);
    console.log('Game saved (base64,', base64.length, 'chars).');
}

export function loadGame(saveKey = 'zeliard_save_01') {
    const base64 = localStorage.getItem(saveKey);
    if (!base64) return null;
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        if (bytes.length !== 256) return null;
        console.log('Game loaded.');
        return bytes;
    } catch (err) {
        console.error('loadGame: failed to decode save data', err);
        return null;
    }
}

function getHeroGoldValue() {
    if (!readMemory) return 0;
    const goldBytes = readMemory(ADDR_HERO_GOLD_LO, 2);
    const goldLo = goldBytes[0] | (goldBytes[1] << 8);
    const goldHi = readMemory(ADDR_HERO_GOLD_HI, 1)[0];
    return goldLo + goldHi * 0x10000;
}

function setHeroGoldValue(value) {
    if (!writeMemory) return;
    const clamped = Math.max(0, Math.min(0xFFFFFF, value));
    writeMemory(ADDR_HERO_GOLD_LO, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
    writeMemory(ADDR_HERO_GOLD_HI, [(clamped >> 16) & 0xFF]);
}

function renderGoldHud() {
    updateElementText('gold', getHeroGoldValue());
}

function getHeroAlmasValue() {
    if (!readMemory) return 0;
    const almasBytes = readMemory(ADDR_HERO_ALMAS, 2);
    const almas = almasBytes[0] | (almasBytes[1] << 8);
    return almas;
}

function setHeroAlmasValue(value) {
    if (!writeMemory) return;
    const clamped = Math.max(0, Math.min(0xFFFF, value));
    writeMemory(ADDR_HERO_ALMAS, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
}

function renderAlmasHud() {
    updateElementText('almas', getHeroAlmasValue());
}

async function loadSwordIcons() {
    if (swordIconsReady) return Promise.resolve(swordIcons);
    const loads = ITEMP_SWORD_IMAGE_PATHS.map((path, index) => {
        if (!path) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => { swordIcons[index] = img; return img; });
    });
    await Promise.all(loads);
    swordIconsReady = true;
    return swordIcons;
}

function getHeroSwordType() {
    if (!readMemory) return 0;
    return readMemory(ADDR_SWORD_TYPE, 1)[0];
}

function setHeroSwordType(type) {
    if (!writeMemory) return;
    writeMemory(ADDR_SWORD_TYPE, [type]);
}

function renderSwordHud() {
    const type = getHeroSwordType() - 1;
    const icon = document.getElementById("activeSwordIcon");
    icon.src = type >= 0 && swordIcons[type] ? swordIcons[type].src : "";
}

async function loadShieldIcons() {
    if (shieldIconsReady) return Promise.resolve(shieldIcons);
    const loads = ITEMP_SHIELD_IMAGE_PATHS.map((path, index) => {
        if (!path) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => { shieldIcons[index] = img; return img; });
    });
    await Promise.all(loads);
    shieldIconsReady = true;
    return shieldIcons;
}

function getHeroShieldType() {
    if (!readMemory) return 0;
    return readMemory(ADDR_SHIELD_TYPE, 1)[0];
}

function setHeroShieldType(type) {
    if (!writeMemory) return;
    writeMemory(ADDR_SHIELD_TYPE, [type]);
}

function getHeroShieldHP() {
    if (!readMemory) return 0;
    const hpBytes = readMemory(ADDR_SHIELD_HP, 2);
    return hpBytes[0] | (hpBytes[1] << 8);
}

function setHeroShieldHP(hp) {
    if (!writeMemory) return;
    writeMemory(ADDR_SHIELD_HP, [hp & 0xff, (hp >> 8) & 0xff]);
}

function renderShieldHud() {
    const type = getHeroShieldType() - 1;
    const icon = document.getElementById("activeShieldIcon");
    icon.src = type >= 0 && shieldIcons[type] ? shieldIcons[type].src : "";
    updateElementText('shieldHp', type >= 0 ? getHeroShieldHP() : '');
}

async function loadMagicIcons() {
    if (magicIconsReady) return Promise.resolve(magicIcons);
    const loads = ITEMP_MAGIC_IMAGE_PATHS.map((path, index) => {
        if (!path) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => { magicIcons[index] = img; return img; });
    });
    await Promise.all(loads);
    magicIconsReady = true;
    return magicIcons;
}

function getHeroMagicType() {
    if (!readMemory) return 0;
    return readMemory(ADDR_CURR_SPELL_TYPE, 1)[0];
}

function setHeroMagicType(type) {
    if (!writeMemory) return;
    writeMemory(ADDR_CURR_SPELL_TYPE, [type]);
}

function getHeroMagicCount(type) {
    if (!readMemory) return 0;
    const idx = type - 1;
    if (idx < 0 || idx >= ADDR_SPELL_COUNTS.length) return 0;
    return readMemory(ADDR_SPELL_COUNTS[idx], 1)[0];
}

function setHeroMagicCount(type, count) {
    if (!writeMemory) return;
    const idx = type - 1;
    if (idx < 0 || idx >= ADDR_SPELL_COUNTS.length || count < 0 || count > 255) return;
    writeMemory(ADDR_SPELL_COUNTS[idx], [count]);
}

function renderMagicHud() {
    const type0 = getHeroMagicType() - 1;
    const icon = document.getElementById("activeSpellIcon");
    icon.src = type0 >= 0 && magicIcons[type0] ? magicIcons[type0].src : "";
    updateElementText('spellCounter', type0 >= 0 ? getHeroMagicCount(type0+1) : '');
}

// Open Save Modal (called from Sage scene)
function openSaveModal(onSaveComplete) {
    if (activeModal) return;
    gamePaused = true;
    const onSave = (slotName) => {
        const saveState = readMemory(0, 256);
        if (slotName === null) {
            onSaveComplete?.(false);
        } else {
            saveGameToSlot(slotName, saveState);
            onSaveComplete?.(true);
        }
        closeModal();
    };
    const onCancel = () => {
        onSaveComplete?.(false);
        closeModal();
    };
    activeModal = new SaveDialog(onSave, onCancel);
}

function openRestoreModal() {
    if (activeModal) return;
    gamePaused = true;
    const onRestore = (slotName) => {
        let saveData = null;
        if (slotName === null) {  // Re-Start
            // Fetch default save from STDPLY_PATH
            fetch(STDPLY_PATH)
                .then(resp => {
                    if (!resp.ok) throw new Error('Failed to load default save');
                    return resp.arrayBuffer();
                })
                .then(buffer => {
                    saveData = new Uint8Array(buffer);
                    performGameRestore(saveData);
                    closeModal();
                })
                .catch(err => {
                    console.error('Re-Start failed:', err);
                    closeModal();
                });
        } else {
            saveData = loadGameFromSlot(slotName);
            if (saveData) {
                performGameRestore(saveData);
                closeModal();
            } else {
                console.error('Failed to load save:', slotName);
                closeModal();
            }
        }
    };
    const onCancel = () => {
        closeModal();
    };
    activeModal = new RestoreDialog(onRestore, onCancel);
}

function closeModal() {
    activeModal = null;
    gamePaused = false;
}

// Core restore routine: reloads full game state from 256-byte saveData
async function performGameRestore(saveData) {
    if (!saveData || saveData.length !== 256) {
        console.error('Invalid save data');
        return;
    }

    // Abort any indoor scene or conversation
    if (indoorActiveScene) {
        indoorActiveScene = null;
    }
    conversation.active = false;
    if (activeModal) closeModal();

    // Load the save into WASM memory
    loadSaveState(saveData);

    // Get the place id (town index or dungeon)
    const placeId = readMemory(ADDR_PLACE_MAP_ID, 1)[0] & 0x7F;

    if (placeId < TOWN_MDTS.length) {
        const mdtPath = TOWN_MDTS[placeId];
        try {
            const resp = await fetch(mdtPath);
            if (!resp.ok) throw new Error(`Failed to load ${mdtPath}`);
            // ✅ CRITICAL: Update the module-level mdtData variable
            const newMdtData = new Uint8Array(await resp.arrayBuffer());
            mdtData = newMdtData;          // <-- this was missing!
            loadMdt(newMdtData);
            mdtHeader = getTownMdtHeader?.();
        } catch (err) {
            console.error('Failed to load MDT for restore:', err);
            return;
        }
    } else {
        // Fallback to starting town (index 0) for dungeons
        console.warn('Restoring in dungeon – falling back to Felishika Castle');
        const resp = await fetch(TOWN_MDTS[0]);
        if (!resp.ok) throw new Error(`Failed to load ${TOWN_MDTS[0]}`);
        const newMdtData = new Uint8Array(await resp.arrayBuffer());
        mdtData = newMdtData;
        loadMdt(newMdtData);
        mdtHeader = getTownMdtHeader?.();
        writeMemory(ADDR_PLACE_MAP_ID, [0]);  // ensure place_map_id points to town 0
    }

    // Re‑initialise the town engine – reads hero position from restored save data
    townSetReturnBeforeMainLoop(true);
    townEntryDisablingEdgeScroll();
    townEntryRan = true;

    // ------------------- Reload JS-side visual assets -------------------
    const newBgType = getTownBackgroundType();
    const newPatId = getTownPatId();

    if (newBgType !== townBackgroundType || !townBackgroundReady) {
        townBackgroundType = newBgType;
        townBackgroundReady = false;
        townBackground = null;
        townCeilingReady = false;
        townCeiling = null;
        townSidewalk1Ready = false;
        townSidewalk1 = null;
        townSidewalk2Ready = false;
        townSidewalk2 = null;
        await loadTownBackground();
        await loadTownCeiling();
        await loadTownSidewalk1();
        await loadTownSidewalk2();
        resetTownScrollOffsets();
    }

    if (newPatId !== townPatId || !townTileSheetReady) {
        townPatId = newPatId;
        townTileSheetReady = false;
        townTileSheet = null;
        const pattern = PATTERN_ASSETS[townPatId];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileList(pattern.specialTiles);
            updateTownAnimation();   // rebuild townAnimTileMap based on new patId
        }
    }

    // Reload NPC sprites (category may have changed)
    parseTownNpcCategory();
    await Promise.all(
        NPC_SPRITE_PATHS[townNpcSpriteCategory].map((_, idx) => loadNpcSprite(idx))
    );

    const trackId = resolveTownMusicTrack(getTownMusicTrack?.());
    if (trackId && trackId !== currentMusicTrack) setCurrentMusicTrack(trackId);

    gameMode = 'town';
    engineReady = true;
    gamePaused = false;

    console.log(`Restored town ${readMemory(ADDR_PLACE_MAP_ID, 1)[0] & 0x7F}`);
}

// ─── Game loop ────────────────────────────────────────────────────────────────
let lastTimestamp = 0;
let fps = 0;
let proximityMap = null;
let cavernName = '';
let mdtData = null;
let mdtHeader = null;

let frameTimer  = 0;
let tickCounter = 0;
let animTimer   = 0;

function update() {
    if (!engineReady) return;
    if (indoorActiveScene) return;
    heroInteractionCheck?.();
    proximityMap = getProximityMap?.();
}

function draw() {
    if (!engineReady) { // emergency fallback
        drawLifeBar();
        updatePlaceHud('');
        renderGoldHud();
        updateElementText('almas', 0);
        renderSwordHud();
        renderMagicHud();
        renderShieldHud();
        return;
    }

    if (indoorActiveScene) {
        const scene = indoorActiveScene;
        const now = performance.now();
        const sceneName = scene.getName?.() ?? scene.building?.name ?? '';
        scene.handleHeldInput?.(keys, now);
        const stillActive = scene.draw(now);
        if (!stillActive && indoorActiveScene === scene) indoorActiveScene = null;
        updatePlaceHud(stillActive ? sceneName : '', stillActive);
        drawLifeBar();
        renderGoldHud();
        renderAlmasHud();
        renderSwordHud();
        renderMagicHud();
        renderShieldHud();
    } else if (gameMode === 'dungeon') {
        const dungeonState = readU8(ADDR_DUNGEON_STATE);
        if (dungeonState === DUNGEON_STATE_ROKA_RUN) {
            const shouldRender = (dungeonGetRenderRequest?.() ?? readU8(ADDR_RENDER_REQUEST)) === 0xFF;
            if (shouldRender) {
                drawDungeonRoka();
                dungeonClearRenderRequest?.();
            }
        } else {
            const shouldRender = (dungeonGetRenderRequest?.() ?? readU8(ADDR_RENDER_REQUEST)) === 0xFF;
            if (shouldRender) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                drawDungeonTiles();
                drawDungeonEntities();
                drawDungeonHero();
                drawDungeonSword();
                dungeonClearRenderRequest?.();
            }
        }
        // HUD is drawn later (outside this branch)
    } else { // town outdoor mode
        ctx.fillStyle = '#05053f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawTownBackground();
        drawTownSidewalk();
        if (townBackgroundType) 
            drawTownCeiling();
        if (drawTownTiles()) {
            drawTownNpcs();
            drawTownHero();
            drawLifeBar();
            let placeName = getTownName?.() ?? 'unknown';
            updatePlaceHud(townEntryRan ? placeName : '');
            renderGoldHud();
            updateElementText('almas', 0);
            renderSwordHud();
            renderMagicHud();
            renderShieldHud();
            drawConversationDialog();
        }
    }
    // Draw modal on top of everything (indoor scene or town)
    if (activeModal) {
        activeModal.draw(ctx, canvas.width, canvas.height, performance.now());
    }
}

function loop(timestamp) {
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    if (dt > 0) fps = Math.round(1000 / dt);
    update(); // Check: update should be done in one of timer handlers (full tick or slow tick)
    draw();
    requestAnimationFrame(loop);
}

// ─── DOM references ───────────────────────────────────────────────────────────
const introScreen  = document.getElementById('intro-screen');
const introCanvas  = document.getElementById('introCanvas');
const uiScreen     = document.getElementById('ui');
const layoutWrapper = document.getElementById('layout-wrapper');
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = VIEW_COLS * TILE_WIDTH;
canvas.height = VIEW_ROWS * TILE_HEIGHT;
ctx.imageSmoothingEnabled = false;

const openingIntro = new OpeningIntro({
    screen:     introScreen,
    canvas:     introCanvas,
    onComplete: startGame,
});

// ─── UI helpers ───────────────────────────────────────────────────────────────
// ========== Save slot helpers (localStorage) ==========
const SAVE_PREFIX = 'zeliard_save_';

export function getSaveSlotNames() {
    const slots = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SAVE_PREFIX)) {
            slots.push(key.slice(SAVE_PREFIX.length));
        }
    }
    slots.sort();
    return slots;
}

export function saveGameToSlot(slotName, data) {
    const key = SAVE_PREFIX + slotName;
    const binary = String.fromCharCode(...data);
    localStorage.setItem(key, btoa(binary));
}

export function loadGameFromSlot(slotName) {
    const key = SAVE_PREFIX + slotName;
    const base64 = localStorage.getItem(key);
    if (!base64) return null;
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch (err) {
        console.error('Failed to load save', slotName, err);
        return null;
    }
}

// Hidden file input used for import
let fileInput = null;
function ensureFileInput() {
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.sav';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }
    return fileInput;
}

// Export a specific save slot to a .sav file (filename = slotName + '.sav')
function exportSlotToFile(slotName) {
    const saveData = loadGameFromSlot(slotName);
    if (!saveData) {
        console.error(`No save data found for slot "${slotName}"`);
        alert(`No save data for slot "${slotName}"`);
        return;
    }
    const blob = new Blob([saveData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slotName}.sav`;   // use slot name as filename
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`Exported slot "${slotName}" to ${slotName}.sav`);
}

// Import a .sav file and restore game state
function importSaveFromFile() {
    if (!engineReady) {
        console.warn('Engine not ready, cannot import.');
        return;
    }
    const input = ensureFileInput();
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            if (data.length !== 256) {
                alert('Invalid save file: must be exactly 256 bytes.');
                return;
            }
            await performGameRestore(data);
            console.log(`Imported and restored from ${file.name}`);
        } catch (err) {
            console.error('Import failed:', err);
            alert('Failed to import save file.');
        } finally {
            input.value = '';
        }
    };
    input.click();
}

// Open the new modal
function openImportExportModal() {
    if (activeModal) return;
    gamePaused = true;

    const onExportSlot = (slotName) => {
        exportSlotToFile(slotName);
        closeModal();
    };
    const onImportFromFile = () => {
        importSaveFromFile();
        closeModal();
    };
    const onCancel = () => {
        closeModal();
    };
    activeModal = new ImportExportDialog(onExportSlot, onImportFromFile, onCancel);
}

window.openSaveModal = openSaveModal;

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
