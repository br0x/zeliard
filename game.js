/**
 * game.js — Zeliard web port, main entry point.
 *
 *   - Imports SoundManager (sound-manager.js)
 *   - AudioWorklet PIT timer drives full_tick / slow_tick
 *   - WASM memory accessor wired to SoundManager so sound_drv_poll()
 *     reads ADDR_SOUND_FX_REQUEST directly from WASM linear memory
 *   - startGame() resumes AudioContext on first user gesture
 *   - All timer-driven counters (frameTimer, tickCounter, animTimer)
 *     are incremented inside the full_tick callback — NOT in rAF loop
 */

import { OpeningIntro }  from './opening-intro.js';
import { SoundManager }  from './sound-manager.js';

// ─── Engine / Canvas config ───────────────────────────────────────────────────
const TILE_WIDTH  = 24;
const TILE_HEIGHT = 24;
const VIEW_COLS   = 28;
const VIEW_ROWS   = 18;
const VIEW_WIDTH  = VIEW_COLS * TILE_WIDTH;
// ─── Feature flags ────────────────────────────────────────────────────────────
const USE_WASM_ENGINE = true;
const RUN_TOWN_ENTRY_ON_START = true;
const RETURN_BEFORE_TOWN_MAIN_LOOP = true;
const STDPLY_PATH = 'game/stdply.bin';
const START_TOWN_MDT_PATH = 'game/0/cmap.mdt';
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

const TOWN_BACKGROUND_YMPD_PATH = 'assets/images/ympd/ympd1.png';
const TOWN_SIDEWALK1_YMPD_PATH = 'assets/images/ympd/ympd2.png';
const TOWN_SIDEWALK2_YMPD_PATH = 'assets/images/ympd/ympd3.png';
const TOWN_BACKGROUND_CKPD_PATH = 'assets/images/ckpd/ckpd1.png';
const TOWN_BACKGROUND0_CKPD_PATH = 'assets/images/ckpd/ckpd0.png';
const TOWN_SIDEWALK1_CKPD_PATH = 'assets/images/ckpd/ckpd2.png';
const TOWN_SIDEWALK2_CKPD_PATH = 'assets/images/ckpd/ckpd3.png';
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
// citizen — 8 frames (48×72 each), 0-3 face left, 4-7 face right
// soldier — 8 frames (48×72 each), all face viewer (looping idle)
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

// WASM memory addresses for NPC table (mirrors town.h / town.c)
const ADDR_NPC_ARRAY_PTR       = 0xC00F;   // word → pointer to NPC array in g_mem
const ADDR_TOWN_DESCRIPTOR_PTR = 0xC000;   // word → pointer to town descriptor

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
const PLACE_MAP_ID = 0xC4;
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
const ANIM_SPEED_TICKS = 8;   // change frame every 8 full ticks
// Frame indices in tman.png:
// 0-3 : left walking
// 4   : facing away (door open)
// 5-8 : right walking
// 9   : facing away (door open) - copy for compatibility with original format
// 10  : standing left
// 11  : standing right
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
let combatUpdate;
let initBossBattle;
let updateBossBattle;
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

let restoreName = null;
let RENDER_CONFIG;
let renderDungeonObjects;
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

// ─── NPC sprite state ─────────────────────────────────────────────────────────
const npcSprites = {
    0: [], // mman cache
    1: []  // cman cache
};
let townNpcSpriteCategory = 0;   // 0: mman, 1: cman
let townAnimTileMap = {};   // built from current PATTERN_ASSETS animatedTilesSeq

function loadTownBackground() {
    if (townBackgroundReady) return Promise.resolve(townBackground);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            townBackground = img;
            townBackgroundReady = true;
            resolve(img);
        };
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
        img.onload = () => {
            townCeiling = img;
            townCeilingReady = true;
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load ${TOWN_BACKGROUND0_CKPD_PATH}`));
        img.src = TOWN_BACKGROUND0_CKPD_PATH;
    });
}

function loadTownSidewalk1() {
    if (townSidewalk1Ready) return Promise.resolve(townSidewalk1);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            townSidewalk1 = img;
            townSidewalk1Ready = true;
            resolve(img);
        };
        const path = !townBackgroundType ? TOWN_SIDEWALK1_YMPD_PATH : TOWN_SIDEWALK1_CKPD_PATH;
        img.onerror = () => reject(new Error(`Failed to load ${path}`));
        img.src = path;
    });
}

function loadTownSidewalk2() {
    if (townSidewalk2Ready) return Promise.resolve(townSidewalk2);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            townSidewalk2 = img;
            townSidewalk2Ready = true;
            resolve(img);
        };
        const path = !townBackgroundType ? TOWN_SIDEWALK2_YMPD_PATH : TOWN_SIDEWALK2_CKPD_PATH;
        img.onerror = () => reject(new Error(`Failed to load ${path}`));
        img.src = path;
    });
}

function loadTownTileSheet(tileSheetPath) {
    if (townTileSheetReady) return Promise.resolve(townTileSheet);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            townTileSheet = img;
            townTileSheetReady = true;
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load ${tileSheetPath}`));
        img.src = tileSheetPath;
    });
}

function loadHeroSprite() {
    if (heroSpriteReady) return Promise.resolve(heroSprite);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            heroSprite = img;
            heroSpriteReady = true;
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load ${HERO_SPRITE_PATH}`));
        img.src = HERO_SPRITE_PATH;
    });
}

/**
 * Load one NPC sprite sheet by spriteId (0..4), for the current category.
 * Cached: second call for the same index resolves immediately.
 */
function loadNpcSprite(spriteId) {
    // Check cache specific to the current category
    if (npcSprites[townNpcSpriteCategory][spriteId]) {
        return Promise.resolve(npcSprites[townNpcSpriteCategory][spriteId]);
    }
    
    const path = NPC_SPRITE_PATHS[townNpcSpriteCategory][spriteId];
    if (!path) return Promise.resolve(null);
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // Save to category-specific cache
            npcSprites[townNpcSpriteCategory][spriteId] = img;
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load NPC sprite ${path}`));
        img.src = path;
    });
}

/**
 * Parse the town descriptor from WASM memory to find which NPC category
 * is used by the current town.  Updates townNpcSpriteCategory.
 *
 * Town descriptor format (starting at the address stored in word 0xC000):
 * [0]: bits 5..1 - msd index in [MGT1.MSD, UGM1.MSD, MGT2.MSD, UGM2.MSD]
 * [1]: NPC category; 0 -> mman, 1 -> cman
 * [2]: ff
 * [3]: town_has_middle_layer; 0 -> ympd, 1 -> ckpd
 * [4]: pat_id; 0 -> cpat, 1 -> mpat, 2 -> dpat
 */
function parseTownNpcCategory() {
    if (!readMemory) { townNpcSpriteCategory = 0; return; }

    // ADDR_TOWN_DESCRIPTOR (0xC000) is a word pointing to the descriptor base
    const descPtrBytes  = readMemory(0xC000, 2);
    const descPtr    = descPtrBytes[0] | (descPtrBytes[1] << 8);

    // skip msd_music_index byte
    townNpcSpriteCategory = readMemory(descPtr + 1, 1)[0];
    console.log('[NPC] town descriptor NPC category:', townNpcSpriteCategory);
}

async function loadWasmEngine() {
    const wasmBridge    = await import('./src/zeliard-wasm.js');

    ({
        initWasm,
        loadSaveState,
        loadMdt,
        getCavernMdtHeader,
        getCavernName,
        getTownMdtHeader,
        getTownName,
        getTownMusicTrack,
        getTownBackgroundType,
        getTownPatId,
        getProximityMap,
        inputInit,
        inputUpdate,
        inputSetKeys,
        heroMovementInit,
        townToDungeonTransition,
        heroMovementUpdate,
        heroGetDirection,
        heroGetState,
        heroIsMoving,
        updateHorizontalPlatforms,
        heroInteractionCheck,
        combatInit,
        combatUpdate,
        initBossBattle,
        updateBossBattle,
        getHeroPosition,
        getTownHeroPosition,
        inputGetDebugCounter,
        getWasmMemory,
        townInit,
        townSetReturnBeforeMainLoop,
        townEntryDisablingEdgeScroll,
        townUpdate,
        townFullTick,
        hasWasmExport,
        setSpecialTileList,
        readMemory,
        writeMemory,
        getTownPendingTransitionFlag,
        getTownPendingTransition,
        townCompleteTransition,
        townEntryEnablingEdgeScroll,
        townFinishConversation,
        townFinishBuilding,
    } = wasmBridge);
}

const ADDR_CONVERSATION_ACTIVE = 0xFFF5;
const ADDR_BUILDING_ACTIVE = 0xFFFA;
const ADDR_BUILDING_DEST_ID = 0xFFFB;
const ADDR_FRAME_TIMER = 0xFF1A;
const ADDR_SOUND_FX_REQUEST = 0xFF75;
const ADDR_SPOKE_TO_KING = 0x05;
const ADDR_ENTERED_CAVERN_FIRST_TIME = 0x06;
const ADDR_IS_DEATH_ALREADY_PROCESSED = 0x49;
const ADDR_HERO_GOLD_HI = 0x85;
const ADDR_HERO_GOLD_LO = 0x86;
const ADDR_SWORD_TYPE = 0x92;
const ADDR_SHIELD_TYPE = 0x93;
const ADDR_SHIELD_HP = 0x94;
const ADDR_CURR_SPELL_TYPE = 0x9d;
const ADDR_SPELL_COUNTS = [
    0xab, // ESPADA
    0xac, // SAETA
    0xad, // FUEGO
    0xae, // LANZAR
    0xaf, // RASCAR
    0xb0, // AGUA
    0xb1  // GUERRA
];
const ADDR_HERO_LEVEL    = 0x8d;   // byte
const ADDR_HERO_XP       = 0x8e;   // word
const ADDR_SAGES_SPOKEN  = 0xe5;   // byte bitmask

const TOWN_BUILDING_KING = 0;
const TOWN_BUILDING_PRINCESS = 1;
const TOWN_BUILDING_SAGE = 2;

const TOWN_BUILDING_NAMES = {
    [TOWN_BUILDING_KING]: 'King of Felishika',
    [TOWN_BUILDING_PRINCESS]: 'In the Hut',
    [TOWN_BUILDING_SAGE]: 'The Sage Marid',    
};
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

let princessChamberImage = null;
let princessChamberImageReady = false;
let kingImages = [];
let kingImagesReady = false;
let indoorScene = {
    active: false,
    destId: 0xFF,
    phase: 'idle',
    phaseStart: 0,
    alpha: 0,
    fadeStartAlpha: 0,
    image: null,
    king: null,
};

const KING_ENTRY_SEQUENCE = [1, 2, 3, 4, 5];
const KING_ENTRY_FRAME_MS = 350;
const KING_DIALOG_CHAR_MS = 30;
const KING_FADE_OUT_MS = 450;
const KING_IMAGE_W = 422;
const KING_IMAGE_H = 282;
const KING_IMAGE_X = Math.floor((VIEW_WIDTH - KING_IMAGE_W) / 2);
const KING_DIALOG_X = 24;
const KING_DIALOG_Y = 294;
const KING_DIALOG_W = VIEW_WIDTH - KING_DIALOG_X * 2;
const KING_DIALOG_H = VIEW_ROWS * TILE_HEIGHT - KING_DIALOG_Y - 14;
const KING_DIALOG_TEXT_X = KING_DIALOG_X + 18;
const KING_DIALOG_TEXT_Y = KING_DIALOG_Y + 12;
const KING_DIALOG_LINE_HEIGHT = 23;
const KING_DIALOG_FONT = '14px "Press Start 2P", monospace';
const KING_DIALOG_MAX_LINES = 4;
const KING_GOLD_GIFT_STEPS = 10;
const KING_GOLD_GIFT_PER_STEP = 100;
const KING_GOLD_GIFT_DELAY_FRAMES = 15;
const KING_GOLD_GIFT_SFX = 19;
const KING_GOLD_GIFT_LINE = 'I hereby bestow upon you 1000 Golds.';

const KING_DIALOG_SCRIPTS = {
    firstAudience: [
        'Brave Duke Garland, you\'ll need money for your journey.',
        KING_GOLD_GIFT_LINE,
        'Go to town and outfit yourself, then make haste to the labyrinth to defeat the forces of Jashiin.',
        'My kingdom and the life of my daughter are at stake.',
    ],
    reminder: [
        'Brave Duke, did you forget something?',
        'The entrance to the labyrinth is at the edge of town.',
        'Please hurry, before it\'s too late!',
    ],
    afterCavern: [
        'Duke Garland, I am in debt to you for your efforts.',
        'Have you not yet succeeded in vanquishing Jashiin?',
        'I pray that the spirits will guide you.',
        'Please don\'t give up, the people of Zeliard are depending on you!',
    ],
    victory: [
        'Duke Garland, you are a brave man.',
        'You have conquered Jashiin and returned the nine Tears of Esmesanti.',
        'Now go quickly to the chamber of Princess Felicia.',
        'The crystals will bring her back to life.',
    ],
};

const TOWN_HEADS_ROW      = TOWN_MAP_START_ROW + 5;   // row 13, y = 312px
// Dialog visual constants
const DIALOG_FONT_SIZE    = 18;       // px — base line height
const TEXT_FIRST_BASELINE = 32;   // matches y+32 in draw
const TEXT_LINE_HEIGHT    = 24;   // matches lineHeight in draw
const TEXT_BOTTOM_PAD     = 20;   // space for descenders + visual margin
const DIALOG_PADDING_X    = 10;       // px — inner horizontal padding
const DIALOG_PADDING_Y    = 4;        // px — inner vertical padding
const DIALOG_MAX_WIDTH    = VIEW_WIDTH - 24;      // px — maximum box width
const DIALOG_LINES_PER_PAGE = 15;     // lines shown before "more" prompt
// Bottom edge: 4px above the NPCs' head row
const DIALOG_BOTTOM_Y     = TOWN_HEADS_ROW * TILE_HEIGHT - 4;  // 308 px

// Character width table copied verbatim from town.c (index = charCode - 0x20)
// These are the original CGA pixel widths; we scale them for the canvas font.
const CHAR_WIDTH_TABLE = [
    5, 4, 4, 4, 6, 8,  5, 3, 4, 4, 6, 6,
    6, 5, 6, 8, 7, 5,  7, 7, 7, 7, 7, 7,
    7, 7, 3, 4, 6, 6,  6, 7, 8, 8, 8, 8,
    8, 8, 8, 8, 8, 5,  8, 8, 8, 8, 8, 8,
    8, 8, 8, 8, 7, 8,  8, 8, 8, 8, 7, 5,
    3, 5, 6, 7, 7, 8,  8, 7, 8, 7, 7, 8,
    8, 5, 6, 8, 5, 8,  7, 7, 8, 8, 8, 7,
    6, 8, 8, 8, 7, 7,  7, 4, 8, 4, 7, 8,
];

const ORIG_MAX_LINE_PX   = 256;
const TEXT_AREA_WIDTH    = DIALOG_MAX_WIDTH - 2 * DIALOG_PADDING_X;
const WIDTH_SCALE        = TEXT_AREA_WIDTH / ORIG_MAX_LINE_PX;

function charOrigWidth(ch) {
    const idx = ch.charCodeAt(0) - 0x20;
    if (idx < 0 || idx >= CHAR_WIDTH_TABLE.length) return 6;
    return CHAR_WIDTH_TABLE[idx];
}

// ─── XP thresholds (word_A28C) ─────────────────────────────────────────────
const SAGE_XP_TABLE = [
    50, 150, 300, 420, 1000, 1500, 3000, 5000, 6000,
    8000, 10000, 15000, 20000, 40000, 50000, 60000,
];
// Minimum hero level required for power-up per town (byte_A2AC, 8 towns, 1-based)
const SAGE_MIN_LEVEL_BY_TOWN = [3, 6, 9, 11, 13, 15, 18, 0xFF];
// ─── Per-town Sage names (sage_names table, Pascal strings) ────────────────
const SAGE_NAMES = [
    'The Sage Marid',    // town 1 — Muralla
    'The Sage Yasmin',   // town 2 — Satono
    'The Sage Hajjar',   // town 3 — Bosque
    'The Sage Chiriga',  // town 4 — Hellada
    'The Sage Hisham',   // town 5 — Tumba
    'The Sage Maryam',   // town 6 — Dorado
    'The Sage Saied',    // town 7 — Llama
    'The Sage Indihar',  // town 8 — Pureza (Sage of All Sages)
];
// ─── First-visit intro speeches (aIAmTheSage* strings) ────────────────────
// bit: the sages_spoken_to_hero bitmask bit for this town
const SAGE_INTROS = [
    { bit: 0x80, text: 'I am the Sage Marid.\nYou are very brave to embark on such a dangerous journey. I shall assist you in your travels.' },
    { bit: 0x40, text: 'I am the Sage Yasmin.\nI have been expecting you. I shall teach you the Magic Spell of Throwing Swords: Espada.' },
    { bit: 0x20, text: 'I am the Sage Hajjar.\nI am happy to see you\'ve made it this far. I shall teach you the Magic Spell of Arrows: Saeta.' },
    { bit: 0x10, text: 'I am the Sage Chiriga.\nYou have come far, and you must be cold. I shall teach you the Magic Spell of Fire: Fuego.' },
    { bit: 0x08, text: 'I am the Sage Hisham.\nYou are doing well to stand before me. I shall teach you the Magic Spell of Flame: Lanzar.' },
    { bit: 0x04, text: 'I am the Sage Maryam.\nYou have made the Spirits proud with your bravery. I shall teach you the Magic Spell of Falling Rocks: Rascar.' },
    { bit: 0x02, text: 'I am the Sage Saied.\nYou have lived through much, but your journey is not over. You must be hot. I shall teach you the Magic Spell of Water: Agua.' },
    { bit: 0x01, text: 'I am the Sage of All Sages, Indihar.\nBrave lad, you\'ve done well to get this far.\nI shall teach you the Magic Spell of Lightning: Guerra.' },
];
// ─── Knowledge texts per town (off_B5EB) ───────────────────────────────────
const SAGE_KNOWLEDGE = [
    'My master, the Sage Yasmin, resides in the underground town. She is a person you can turn to if you are in need.',
    'When you leave the city, climb to the plateau on the left. You\'ll see a door that looks like the exit from this world.',
    'The exit from this world is very near the exit from the village. However, before you go there you must have the Hero\'s Crest.',
    'This is a message from the Spirits: Bend when you walk a low road. Walk not on the steep path with the needles of ice, choose another path instead. Heed well these words.',
    'You can\'t defeat the demons at the edge of the badlands without the Knight\'s Sword. Until you get that sword, do not open the door of the demons.',
    'Once you leave this world, get the Silkarn shoes made by the spirits at the behest of Percel. If you do not get those, you cannot travel far from this world.',
    'That world is controlled by dragons. To get there, you have to open three closed doors.',
    'At the edge of this world is the final foe, Jashiin.\nTo fight Jashiin, you must have the Sword of the Fairy Flame. And to get there, you must topple the invincible monster Alguien.',
];
// ─── Menu items (jpt_A110 order: go_outside, see_power, listen_knowledge, record_experience)
const SAGE_MENU = ['Go outside', 'See Power', 'Listen Knowledge', 'Record Experience'];
const SAGE_MENU_GO_OUTSIDE        = 0;
const SAGE_MENU_SEE_POWER         = 1;
const SAGE_MENU_LISTEN_KNOWLEDGE  = 2;
const SAGE_MENU_RECORD_EXPERIENCE = 3;

// ─────────────────────────────────────────────────────────────────────────────
//  Layout — all measurements in canvas pixels (672×432 canvas, 24px tile grid)
//  Matches screenshot: outer black panel, portrait box (yellow border), menu
//  box, dialog box below both.
// ─────────────────────────────────────────────────────────────────────────────
 
const SAGE_PANEL_X    = 0;
const SAGE_PANEL_Y    = 0;
const SAGE_PANEL_W    = VIEW_WIDTH;   // 672px
const SAGE_PANEL_H    = 432;
 
// Portrait sub-panel (left, yellow border)
const SAGE_IMG_X      = SAGE_PANEL_X + 16;
const SAGE_IMG_Y      = SAGE_PANEL_Y + 16;
const SAGE_IMG_W      = 291;
const SAGE_IMG_H      = 192;
 
// Menu sub-panel (right of portrait)
const SAGE_MENU_X     = SAGE_IMG_X + SAGE_IMG_W + 16;
const SAGE_MENU_Y     = SAGE_IMG_Y;
const SAGE_MENU_W     = SAGE_PANEL_X + SAGE_PANEL_W - SAGE_MENU_X - 16;
const SAGE_MENU_H     = SAGE_IMG_H;
 
// Dialog box (full width, below both sub-panels)
const SAGE_DLG_X      = SAGE_PANEL_X + 16;
const SAGE_DLG_Y      = SAGE_IMG_Y + SAGE_IMG_H + 16;
const SAGE_DLG_W      = SAGE_PANEL_W - 32;
const SAGE_DLG_H      = SAGE_PANEL_Y + SAGE_PANEL_H - SAGE_DLG_Y - 16;
 
// Typography
const SAGE_FONT_MENU  = '12px "Press Start 2P", monospace';
const SAGE_FONT_DLG   = '12px "Press Start 2P", monospace';
const SAGE_LINE_H_MENU = 22;
const SAGE_LINE_H_DLG  = 20;
const SAGE_DLG_TEXT_X  = SAGE_DLG_X + 14;
const SAGE_DLG_TEXT_Y  = SAGE_DLG_Y + 22;
const SAGE_MENU_TEXT_X = SAGE_MENU_X + 22;
const SAGE_MENU_TEXT_Y = SAGE_MENU_Y + 18;
const SAGE_CURSOR_X    = SAGE_MENU_X + 8;
 
// Typewriter speed (ms per character) — matches KING_DIALOG_CHAR_MS style
const SAGE_CHAR_MS    = 28;
 
// Fade timings (ms)
const SAGE_FADE_IN_MS  = 600;
const SAGE_FADE_OUT_MS = 450;

// ─────────────────────────────────────────────────────────────────────────────
//  Module-level JS state  (mirrors kenjpro segment internal variables)
//  These are deliberately NOT in WASM memory — they are overlay-private.
// ─────────────────────────────────────────────────────────────────────────────
 
let sageImage      = null;    // HTMLImageElement, loaded once
let sageImageReady = false;
 
/**
 * sageState — all kenjpro.asm internal variables as plain JS fields.
 *
 * Mapping to original ASM names:
 *   menuSel         ← menu_item_selected  (byte_BB14)
 *   hasPower        ← byte_BB15  (non-0 = power ritual has been initiated)
 *   powerExhausted  ← byte_BB16  (non-0 = power already fully granted this level)
 *   levelUpReady    ← byte_BB17  (non-0 = XP+level check passed, upgrade queued)
 *   animRun         ← byte_BB18  (non-0 = orb animation playing)
 *   animSuppressed  ← byte_BB19  (non-0 = tick suppressor active during anim)
 *   animPhaseDone   ← byte_BB1A
 *   crystalMode     ← byte_BB1B  (0 = eye blink tiles, non-0 = crystal tiles)
 *   animFrameCtr    ← byte_BB1C  (mod-16 frame counter)
 *   animTickDir     ← byte_BB1D  (tick direction / step)
 *   blinkFrameCtr   ← byte_BB1E  (bit0 alternates blink tile)
 *   blinkPhaseCtr   ← byte_BB1F  (counts to 20 between blink flips)
 *   blinkPhase      ← byte_BB20  (counts to 20 for the idle blink)
 *   dialogPos       ← word_BB12  (CGA screen address of portrait, 0x0717/0xE17)
 *   saveNameBuf     ← byte_BB27[0..6]  (save-slot name buffer)
 *   saveNameLen     ← byte_BB25
 *   saveNameHasData ← byte_BB26
 *
 * Additional JS-only fields for scene flow:
 *   phase           — 'loading' | 'intro' | 'greeting' | 'menu' | 'dialog' | 'power_anim'
 *   dialogLines     — string[]  (pre-wrapped lines of current message)
 *   dialogStart     — DOMHighResTimeStamp  (when typewriter began)
 *   dialogDone      — bool
 *   exitAfterDialog — bool  (set by Go Outside to close scene on next Space)
 *   townIdx         — 0-based town index derived from PLACE_MAP_ID
 */
let sageState = _makeSageState();
 
function _makeSageState() {
    return {
        // kenjpro internal vars (all start at 0, reset on each scene entry)
        menuSel:        0,
        hasPower:       false,
        powerExhausted: false,
        levelUpReady:   false,
        animRun:        false,
        animSuppressed: false,
        animPhaseDone:  false,
        crystalMode:    false,
        animFrameCtr:   0,
        animTickDir:    0,
        blinkFrameCtr:  0,
        blinkPhaseCtr:  0,
        blinkPhase:     0,
        dialogPos:      0x0717,   // word_BB12: default = first-entry position
        saveNameBuf:    '',
        saveNameLen:    0,
        saveNameHasData: false,
        // Scene-flow (JS-only)
        phase:          'loading',
        dialogLines:    [],
        dialogStart:    0,
        dialogDone:     false,
        exitAfterDialog: false,
        townIdx:        0,
    };
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  WASM save-state accessors  (only the fields that cross the boundary)
// ─────────────────────────────────────────────────────────────────────────────
 
function sageGetTownIdx() {
    // PLACE_MAP_ID (0xC4) is the 0-based place index; 
    // town_id in ASM is 1-based (castle is not a town and does not have a Sage)
    // Sage town index is PLACE_MAP_ID -1 → 0-based index into SAGE_NAMES.
    if (!readMemory) return 0;
    return Math.max(0, Math.min(7, (readMemory(PLACE_MAP_ID, 1)[0] & 0x7F) - 1));
}
 
function sageGetHeroLevel() {
    if (!readMemory) return 1;
    return readMemory(ADDR_HERO_LEVEL, 1)[0] || 1;
}
 
function sageGetHeroXp() {
    if (!readMemory) return 0;
    const b = readMemory(ADDR_HERO_XP, 2);
    return b[0] | (b[1] << 8);
}
 
function sageGetSpokenBits() {
    if (!readMemory) return 0;
    return readMemory(ADDR_SAGES_SPOKEN, 1)[0];
}
 
function sageSetSpokenBit(bit) {
    if (!writeMemory) return;
    writeMemory(ADDR_SAGES_SPOKEN, [sageGetSpokenBits() | bit]);
}
 
function sageApplyLevelUp() {
    // Mirrors sub_A2B4 (simplified): increment level, drain XP threshold, restore HP.
    if (!readMemory || !writeMemory) return;
    let lvl = sageGetHeroLevel();
    if (lvl < 0xFE) lvl++;
    writeMemory(ADDR_HERO_LEVEL, [lvl]);
    // Drain the XP threshold that was spent (sub ds:hero_xp, ax in ASM).
    // For simplicity: zero XP (original also caps to threshold-1 if still above).
    writeMemory(ADDR_HERO_XP, [0, 0]);
    // HP restore is handled by Draw_Hero_Max_Health / Draw_Hero_Health in original;
    // here we just flag it — the HUD renders from WASM memory automatically.
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Image loader
// ─────────────────────────────────────────────────────────────────────────────
 
function loadSageImage() {
    if (sageImageReady) return Promise.resolve(sageImage);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => { sageImage = img; sageImageReady = true; resolve(img); };
        img.onerror = () => reject(new Error(`Failed to load ${SAGE_IMAGE_PATH}`));
        img.src = SAGE_IMAGE_PATH;
    });
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Text helpers
// ─────────────────────────────────────────────────────────────────────────────
 
/** Word-wrap `text` (respects \n) to fit `maxW` canvas pixels at current font. */
function sageWrapText(text, maxW) {
    const lines = [];
    for (const para of text.split('\n')) {
        const words = para.split(' ');
        let line = '';
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(candidate).width > maxW) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}
 
function sageSetDialog(text) {
    ctx.save();
    ctx.font = SAGE_FONT_DLG;
    sageState.dialogLines = sageWrapText(text, SAGE_DLG_W - 28);
    ctx.restore();
    sageState.dialogStart = performance.now();
    sageState.dialogDone  = false;
}
 
function sageDialogTotalChars() {
    return sageState.dialogLines.reduce((s, l) => s + l.length, 0);
}
 
function sageVisibleChars(now) {
    const elapsed = now - sageState.dialogStart;
    return Math.min(sageDialogTotalChars(), Math.floor(elapsed / SAGE_CHAR_MS));
}
 
function sageSkipTypewriter(now) {
    // Fast-forward typewriter to end
    sageState.dialogStart = now - sageDialogTotalChars() * SAGE_CHAR_MS;
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Scene entry  (called from startIndoorScene when destId === TOWN_BUILDING_SAGE)
// ─────────────────────────────────────────────────────────────────────────────
 
function startSageScene() {
    // Reset all internal state (kenjpro module is re-entered each time)
    sageState = _makeSageState();
    sageState.townIdx = sageGetTownIdx();
 
    // word_BB12: sub_A006 sets it to 0x0E17 (death entry), loc_A027 sets 0x0717 (normal).
    // We distinguish via ADDR_IS_DEATH_ALREADY_PROCESSED (readMemory already available).
    const deathEntry = readMemory ? readMemory(ADDR_IS_DEATH_ALREADY_PROCESSED, 1)[0] : 0;
    sageState.dialogPos = deathEntry ? 0x0E17 : 0x0717;
 
    // Determine intro (sub_AC07): has this town's sage already spoken to hero?
    const intro   = SAGE_INTROS[sageState.townIdx];
    const spoken  = sageGetSpokenBits();
    const isFirst = intro && !(spoken & intro.bit);
 
    loadSageImage()
        .then(() => {
            if (!indoorScene.active || indoorScene.destId !== TOWN_BUILDING_SAGE) return;
 
            if (deathEntry) {
                // sub_A006 path: hero was knocked out, different opening text (byte_BA67)
                sageSetDialog(
                    'While you were unconscious, the spirits brought you here.\n' +
                    'Be careful not to exhaust yourself in battle.\n' +
                    'Now be on your way. The spirits are looking after you.'
                );
                sageState.phase = 'intro';   // after Space → go outside automatically
                sageState.exitAfterDialog = true;
            } else if (isFirst) {
                // First visit: sage introduces itself (sub_AC07 sets bit in sages_spoken)
                sageSetSpokenBit(intro.bit);
                sageSetDialog(intro.text);
                sageState.phase = 'intro';
            } else {
                // Returning visit: straight to greeting + menu (byte_AD9D)
                sageSetDialog('How can I help you, Brave One?');
                sageState.phase = 'greeting';
            }
 
            indoorScene.phase     = 'fadeIn';
            indoorScene.phaseStart = performance.now();
        })
        .catch(err => {
            console.error('[sage] failed to load image:', err);
            finishIndoorScene();
        });
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Input handlers
// ─────────────────────────────────────────────────────────────────────────────
 
/** Called from requestExitIndoorScene() when destId === TOWN_BUILDING_SAGE. */
function handleSageSpacePress() {
    const now = performance.now();
 
    if (indoorScene.phase === 'fadeOut') return;
    if (indoorScene.phase === 'fadeIn')  return;   // ignore Space while fading in
 
    // ── Typewriter still running — skip to end ──────────────────────────────
    if (!sageState.dialogDone) {
        sageSkipTypewriter(now);
        return;
    }
 
    // ── Power animation running — suppress Space (byte_BB19 suppressor) ─────
    if (sageState.animRun && sageState.animSuppressed) return;
 
    // ── Phase transitions ────────────────────────────────────────────────────
    switch (sageState.phase) {
        case 'intro':
            if (sageState.exitAfterDialog) {
                // Death-entry: exit the scene after the opening text
                _sageStartFadeOut(now);
            } else {
                // Normal first-visit intro → greeting → menu
                sageSetDialog('How can I help you, Brave One?');
                sageState.phase = 'greeting';
            }
            break;
 
        case 'greeting':
            sageState.phase = 'menu';
            break;
 
        case 'menu':
            _sageActivateMenuItem(sageState.menuSel, now);
            break;
 
        case 'dialog':
            if (sageState.exitAfterDialog) {
                _sageStartFadeOut(now);
            } else {
                // byte_ADBF: "Is there anything else I can do for you?"
                sageSetDialog('Is there anything else I can do for you?');
                sageState.phase = 'greeting';
            }
            break;
 
        case 'power_anim':
            // Space skips back to menu after power animation
            sageState.animRun       = false;
            sageState.animSuppressed = false;
            sageState.phase = 'menu';
            break;
    }
}
 
/** Called from keydown for ArrowUp / ArrowDown when sage scene is active. */
function handleSageArrow(dir) {
    if (!indoorScene.active || indoorScene.destId !== TOWN_BUILDING_SAGE) return false;
    if (sageState.phase !== 'menu') return false;
 
    const n = SAGE_MENU.length;
    sageState.menuSel = (sageState.menuSel + dir + n) % n;
    return true;
}
 
function _sageStartFadeOut(now) {
    indoorScene.phase      = 'fadeOut';
    indoorScene.phaseStart = now;
    indoorScene.fadeStartAlpha = 1;
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Menu action dispatch  (mirrors jpt_A110)
// ─────────────────────────────────────────────────────────────────────────────
 
function _sageActivateMenuItem(sel, now) {
    // sub_A983 clears the dialog area before each action (we just replace text)
    switch (sel) {
        case SAGE_MENU_GO_OUTSIDE:        _sageGoOutside(now);        break;
        case SAGE_MENU_SEE_POWER:         _sageSeePower(now);         break;
        case SAGE_MENU_LISTEN_KNOWLEDGE:  _sageListenKnowledge(now);  break;
        case SAGE_MENU_RECORD_EXPERIENCE: _sageRecordExperience(now); break;
        default:                          _sageGoOutside(now);
    }
}
 
// ── on_go_outside ─────────────────────────────────────────────────────────────
// byte_ADEB: "The Spirits are with you."  then 0x11 (fade+exit)
function _sageGoOutside(now) {
    sageSetDialog('The Spirits are with you.');
    sageState.phase          = 'dialog';
    sageState.exitAfterDialog = true;
}
 
// ── on_see_power ──────────────────────────────────────────────────────────────
// Mirrors the byte_BB15/BB16/BB17 decision tree exactly.
function _sageSeePower(now) {
    if (!sageState.hasPower) {
        // First call: initiate the power ritual (byte_BB18/BB19/BB1B set to 0xFF)
        sageState.hasPower       = true;
        sageState.animRun        = true;
        sageState.animSuppressed = true;
        sageState.crystalMode    = true;
 
        // Run sub_A22E to determine outcome
        const result = _sageCheckLevelUp();
        sageState.levelUpReady = (result >= 4);
 
        sageSetDialog('I shall call upon the Spirits and their powers.....');
        sageState.phase = 'power_anim';
        return;
    }
 
    if (sageState.powerExhausted) {
        // byte_AE42: spirits no longer respond
        sageSetDialog('I fear the spirits are no longer with you. No matter how many times I try, it comes out the same.');
        sageState.phase          = 'dialog';
        sageState.exitAfterDialog = false;
        return;
    }
 
    // Power was already initiated — show result (off_B029 lookup)
    const result = _sageCheckLevelUp();
    _sageShowPowerResult(result);
}
 
/**
 * Mirrors sub_A22E: returns 0..4
 *  0 = XP < threshold/4      "Your experience is lacking"
 *  1 = XP < threshold/2      "You must accumulate more experience"
 *  2 = XP < threshold*3/4    "I can see the faint light"
 *  3 = XP >= threshold*3/4   "The light is bursting forth" (but level check fails)
 *  4 = XP >= threshold AND level >= town minimum  → level-up granted
 */
function _sageCheckLevelUp() {
    let lvl  = sageGetHeroLevel();
    if (lvl > 15) lvl = 15;
    const threshold = SAGE_XP_TABLE[lvl] ?? 60000;
    const xp        = sageGetHeroXp();
 
    const q1 = Math.floor(threshold / 4);
    const q2 = Math.floor(threshold / 2);
    const q3 = threshold - q1;
 
    if (xp < q1) return 0;
    if (xp < q2) return 1;
    if (xp < q3) return 2;
 
    // XP ≥ 3/4 threshold — check town minimum level (byte_A2AC)
    const minLvl = SAGE_MIN_LEVEL_BY_TOWN[sageState.townIdx] ?? 0xFF;
    if (lvl < minLvl) return 3;   // not high enough level yet
 
    return 4;   // level-up granted
}
 
function _sageShowPowerResult(result) {
    // off_B029 table (5 strings indexed 0-4)
    const texts = [
        'Your experience is lacking. Persevere in your quest.',
        'You must accumulate more experience.',
        'I can see the faint light of the Spirits in you. You must endure a little longer.',
        'The light of the Spirits is bursting forth within you.',
        '',  // result 4: level-up — handled separately below
    ];
 
    if (result === 4) {
        // Level-up: aIndeedYourPowerHasGrown
        sageState.levelUpReady  = true;
        sageState.powerExhausted = true;
        sageApplyLevelUp();
        renderGoldHud?.();
        sageSetDialog('The light of the Spirits is bursting forth within you. Indeed, your power has grown.');
    } else if (result === 3 && sageState.levelUpReady) {
        // byte_AF03: already at max power for this sage
        sageState.powerExhausted = true;
        sageSetDialog('I can no longer impart the power of the Spirits to you. Continue on your quest. You will soon find others to help you.');
    } else {
        sageSetDialog(texts[result] ?? texts[0]);
    }
    sageState.phase          = 'dialog';
    sageState.exitAfterDialog = false;
}
 
// ── on_listen_knowledge ───────────────────────────────────────────────────────
// off_B5EB table → one entry per town (byte_ADBF follows: "Is there anything else")
function _sageListenKnowledge(now) {
    const text = SAGE_KNOWLEDGE[sageState.townIdx] ?? 'The Spirits guide your path.';
    sageSetDialog(text);
    sageState.phase          = 'dialog';
    sageState.exitAfterDialog = false;
}
 
// ── on_record_experience ──────────────────────────────────────────────────────
// sub_A427: scan save slots, prompt for name, write to disk.
// In the web port we delegate to saveGame() and show the confirmation text.
function _sageRecordExperience(now) {
    let saved = false;
    if (readMemory) {
        try {
            const mem = readMemory(0, 256);
            // saveGame expects exactly 256 bytes starting at offset 0 of the save area
            saveGame(mem);
            saved = true;
        } catch (e) {
            console.error('[sage] saveGame failed:', e);
        }
    }
    // byte_AF7C: "I shall record your experiences."  (success)
    // On failure, still show it — disk errors not surfaced in the web port.
    sageSetDialog('I shall record your experiences.\nPlace is saved. Will you continue your quest?');
    sageState.phase          = 'dialog';
    sageState.exitAfterDialog = false;
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Drawing
// ─────────────────────────────────────────────────────────────────────────────
 
/** Called from drawIndoorScene() when destId === TOWN_BUILDING_SAGE. */
function drawSageHutScene(now) {
    // ── Resolve alpha from the outer fade managed by drawIndoorScene ──────────
    let alpha = 1;
    if (indoorScene.phase === 'fadeIn') {
        alpha = Math.min(1, (now - indoorScene.phaseStart) / SAGE_FADE_IN_MS);
        if (alpha >= 1) indoorScene.phase = 'shown';
    } else if (indoorScene.phase === 'fadeOut') {
        const t = Math.min(1, (now - indoorScene.phaseStart) / SAGE_FADE_OUT_MS);
        alpha = 1 - t;
        if (t >= 1) { finishIndoorScene(); return false; }
    }
 
    ctx.save();
    ctx.globalAlpha = alpha;
 
    // ── Canvas background ─────────────────────────────────────────────────────
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
 
     // ── Portrait box (yellow border, matching screenshot) ─────────────────────
    ctx.strokeStyle = '#cc0';
    ctx.lineWidth   = 2;
    ctx.strokeRect(SAGE_IMG_X - 2, SAGE_IMG_Y - 2, SAGE_IMG_W + 4, SAGE_IMG_H + 4);
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(SAGE_IMG_X, SAGE_IMG_Y, SAGE_IMG_W, SAGE_IMG_H);
 
    if (sageImageReady && sageImage) {
        ctx.drawImage(sageImage, SAGE_IMG_X, SAGE_IMG_Y, SAGE_IMG_W, SAGE_IMG_H);
    }
 
    // Crystal / orb glow animation (sub_AB47: alternates between tile pairs)
    // byte_BB1B=0 → eye-blink tiles (0x29/0x2A), non-0 → crystal tiles (0x67/0x68)
    _sageDrawOrbAnimation(now, alpha);
 
    ctx.textAlign = 'left';
 
    // ── Menu box ──────────────────────────────────────────────────────────────
    _sageBorder(SAGE_MENU_X - 2, SAGE_MENU_Y - 2, SAGE_MENU_W + 4, SAGE_MENU_H + 4, '#eee', '#888');
    ctx.fillStyle = '#000';
    ctx.fillRect(SAGE_MENU_X, SAGE_MENU_Y, SAGE_MENU_W, SAGE_MENU_H);
 
    if (sageState.phase === 'menu') {
        ctx.font = SAGE_FONT_MENU;
        for (let i = 0; i < SAGE_MENU.length; i++) {
            const y   = SAGE_MENU_TEXT_Y + i * SAGE_LINE_H_MENU;
            const sel = i === sageState.menuSel;
            ctx.fillStyle = sel ? '#ff0' : '#fff';
            ctx.fillText(SAGE_MENU[i], SAGE_MENU_TEXT_X, y);
            if (sel) {
                // Red right-pointing triangle cursor (▶)
                ctx.fillStyle = '#f00';
                _sageTriangle(SAGE_CURSOR_X, y - 9, 10, 9, false);
            }
        }
    }
 
    // ── Dialog box ────────────────────────────────────────────────────────────
    _sageBorder(SAGE_DLG_X - 2, SAGE_DLG_Y - 2, SAGE_DLG_W + 4, SAGE_DLG_H + 4, '#aaa', '#555');
    ctx.fillStyle = '#000';
    ctx.fillRect(SAGE_DLG_X, SAGE_DLG_Y, SAGE_DLG_W, SAGE_DLG_H);
 
    // Typewriter
    const visChars   = sageVisibleChars(now);
    const totalChars = sageDialogTotalChars();
    if (!sageState.dialogDone && visChars >= totalChars) sageState.dialogDone = true;
 
    ctx.font      = SAGE_FONT_DLG;
    ctx.fillStyle = '#fff';
    let remaining = visChars;
    for (let i = 0; i < sageState.dialogLines.length; i++) {
        if (remaining <= 0) break;
        const line    = sageState.dialogLines[i];
        const visible = line.slice(0, Math.min(line.length, remaining));
        ctx.fillText(visible, SAGE_DLG_TEXT_X, SAGE_DLG_TEXT_Y + i * SAGE_LINE_H_DLG);
        remaining -= line.length;
    }
 
    // ▼ prompt when text is fully shown (matches DIALOG_CURSOR_CHAR usage in town dialog)
    if (sageState.dialogDone && sageState.dialogLines.length) {
        ctx.fillStyle = '#0ee';
        _sageTriangle(
            SAGE_DLG_X + SAGE_DLG_W - 20,
            SAGE_DLG_Y + SAGE_DLG_H - 18,
            14, 10, true   // downward
        );
    }
 
    ctx.restore();
    return true;
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Orb / crystal animation  (mirrors sub_AB47 + sub_AA16 tick logic)
//
//  Original draws alternating tile pairs at the orb position (bx = word_BB12 + 0x718).
//  We replicate the visible effect with a JS-driven radial glow that pulses
//  between two states (crystalMode selects colour palette, blinkFrameCtr selects
//  which of the two tiles in the pair is shown).
// ─────────────────────────────────────────────────────────────────────────────
 
function _sageDrawOrbAnimation(now, parentAlpha) {
    // Orb sits at roughly centre-lower of the portrait box
    const orbX = SAGE_IMG_X + SAGE_IMG_W * 0.508;
    const orbY = SAGE_IMG_Y + SAGE_IMG_H * 0.604;
 
    // Idle blink (byte_BB18 = 0): eye / orb gentle pulse
    // Active power anim (byte_BB18 != 0): bright flashing crystal
    const t = now / 1000;
    let glowColor, glowR, glowAlpha;
 
    if (sageState.animRun) {
        // Crystal mode (byte_BB1B set): rapid alternating tiles 0x67/0x68
        const blinkOn = Math.floor(now / 150) % 2 === 0;
        glowColor  = blinkOn ? '#fff' : '#88f';
        glowR      = 28;
        glowAlpha  = 0.65;
    } else {
        // Idle / eye-blink mode: slow sinusoidal pulse
        const pulse = 0.18 + 0.12 * Math.sin(t * 2.1);
        glowColor   = sageState.crystalMode ? '#aaf' : '#8ff';
        glowR       = 20;
        glowAlpha   = pulse;
    }
 
    ctx.save();
    ctx.globalAlpha = glowAlpha * parentAlpha;
    const grad = ctx.createRadialGradient(orbX, orbY, 2, orbX, orbY, glowR);
    grad.addColorStop(0, glowColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(orbX, orbY, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Drawing utilities
// ─────────────────────────────────────────────────────────────────────────────
 
function _sageBorder(x, y, w, h, outer, inner) {
    ctx.lineWidth   = 2;
    ctx.strokeStyle = outer;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth   = 1;
    ctx.strokeStyle = inner;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
}
 
/** Filled triangle: right-pointing (down=false) or down-pointing (down=true). */
function _sageTriangle(x, y, w, h, down) {
    ctx.beginPath();
    if (down) {
        ctx.moveTo(x,         y);
        ctx.lineTo(x + w,     y);
        ctx.lineTo(x + w / 2, y + h);
    } else {
        ctx.moveTo(x,     y);
        ctx.lineTo(x + w, y + h / 2);
        ctx.lineTo(x,     y + h);
    }
    ctx.closePath();
    ctx.fill();
}
 
// ─────────────────────────────────────────────────────────────────────────────
//  Status-bar name helper  (used by integration point 6 in drawIndoorScene)
// ─────────────────────────────────────────────────────────────────────────────
 
function sageCurrentName() {
    return SAGE_NAMES[sageState.townIdx] ?? 'The Sage';
}

// ─── DOM ──────────────────────────────────────────────────────────────────────
const introScreen  = document.getElementById('intro-screen');
const introCanvas  = document.getElementById('introCanvas');
const uiScreen     = document.getElementById('ui');
const layoutWrapper = document.getElementById('layout-wrapper');

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = VIEW_COLS * TILE_WIDTH;
canvas.height = VIEW_ROWS * TILE_HEIGHT;
ctx.imageSmoothingEnabled = false;

// ─── Opening intro ────────────────────────────────────────────────────────────
const openingIntro = new OpeningIntro({
    screen:     introScreen,
    canvas:     introCanvas,
    onComplete: startGame,
});

// ─── Map / game state ─────────────────────────────────────────────────────────
let proximityMap = null;
let cavernName   = '';
let mdtData      = null;
let mdtHeader    = null;

let lastTimestamp = 0;
let fps           = 0;
let townTransitionInProgress = false;

// ─── Timer-driven counters (written by full_tick, read by draw/update) ────────
// These mirror the byte/word variables that the DOS ISR incremented each tick.
let frameTimer  = 0;   // byte  — wraps at 256
let tickCounter = 0;   // word  — wraps at 65536
let animTimer   = 0;   // word  — wraps at 65536

// ─── Sound Manager ────────────────────────────────────────────────────────────
/**
 * SFX request-byte values used by town.c / fight.c (ADDR_SOUND_FX_REQUEST).
 * Add every value the C code can write to 0xFF75 so assets are pre-loaded.
 * These map to assets/sfx/sfx_{hex}.{ogg,mp3}.
 *
 * Known values from town.c source (grep for ADDR_SOUND_FX_REQUEST):
 *   0x1D — dialog page-turn / button confirm
 *   0x0A — sword swing
 *   0x14 — hero hurt
 *   0x1E — item pickup
 *   0x28 — magic cast
 *   0x32 — door open
 *   0x3C — enemy death
 */
const SFX_IDS = [10, 19, 20, 29, 30, 40, 50, 60];

/**
 * Music track IDs — map to assets/music/{id}.{ogg,mp3}.
 * Town descriptor loading sets the track; adjust to your actual filenames.
 */
const MUSIC_TRACKS = ['mgt1', 'mgt2', 'ugm1', 'ugm2'];

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

/**
 * onFullTick — fires ~236.7 times per second.
 *
 * Mirrors the original DOS ISR:
 *   call  sound_drv_poll_farproc     ← handled inside SoundManager before
 *   call  music_drv_poll_farproc       this callback is invoked
 *   inc   byte ptr cs:frame_timer
 *   inc   word ptr cs:tick_counter
 *   inc   word ptr cs:anim_timer
 *   inc   cs:disk_retry_timer
 *
 * The sound/music poll happens inside SoundManager._onWorkletMessage()
 * before this function is called — matching the ISR call order.
 */
function onFullTick() {
    frameTimer  = (frameTimer  + 1) & 0xFF;
    tickCounter = (tickCounter + 1) & 0xFFFF;
    animTimer   = (animTimer   + 1) & 0xFFFF;
    townFullTick?.();   // increments FRAME_TMR in WASM memory

    // Gate town logic: fire when FRAME_TMR reaches SPEED_C * 4
    if (engineReady) {
        const speedC     = readMemory(0xFF33, 1)[0] || 5;
        const target     = speedC * 4;
        const frameTmr   = readMemory(0xFF1A, 1)[0];   // ADDR_FRAME_TIMER
        if (frameTmr >= target) {
            inputUpdate?.();
            townUpdate?.();   // this zeroes FRAME_TMR internally
            // handle scroll flag
            const scrollFlag = readMemory(0xfff0, 1)[0];
            if (scrollFlag) {
                if (scrollFlag & 0x01) scrollFloorRight8px();
                if (scrollFlag & 0x02) scrollFloorLeft8px();
                if (scrollFlag & 0x04) scrollCeilingRight4px();
                if (scrollFlag & 0x08) scrollCeilingLeft4px();
                writeMemory(0xfff0, [0]);
            }
            // detect async transition request
            const pendingFlag = getTownPendingTransitionFlag?.();
            if (pendingFlag === 0xFF) {
                const transition = getTownPendingTransition?.();
                if (transition) {
                    // Clear flag immediately so we don't re-enter
                    writeMemory(0xFFF4, [0]);
                    handleTownTransition(transition);  // async, won't block tick
                }
            }
            checkBuildingRequest();
        }
    }
}

/**
 * onSlowTick — fires ~47.3 times per second (every 5th full tick).
 *
 * Mirrors:
 *   call  F1_F2_edge_detector
 *   call  space_alt_edge_detector
 *   call  joystick_buttons_edge_detectors
 *   jmp   main game logic dispatch
 */
function onSlowTick() {
    if (!engineReady) return;

    updateInputLatches(); // set edge‑triggered latches (0xFF1D, 0xFF1E)
    inputSetKeys(keys);

    // --- Start a new conversation if requested by WASM and no conversation active ---
    if (!conversation.active) {
        const activeFlag = readMemory(ADDR_CONVERSATION_ACTIVE, 1)[0];
        if (activeFlag) {
            startConversationFromWasm();
        }
    }

    // --- Handle active conversation input ---
    if (conversation.active) {
        // Read Space latch (edge-triggered)
        const spaceLatched = readMemory(0xFF1D, 1)[0];
        if (spaceLatched) {
            // Clear the latch immediately so it doesn't affect anything else
            writeMemory(0xFF1D, [0]);

            // Advance or close dialog
            if (conversation.page < conversation.pages.length - 1) {
                conversation.page++;
            } else {
                // End conversation
                conversation.active = false;
                conversation.savedBackground = null;
                // Tell WASM to restore NPC and clear flag
                townFinishConversation?.();
            }
        }
        // Do not process any other input (movement, inventory) while conversation active
        return;
    }

    // Poll scroll request flag
    const scrollFlag = readMemory(0xfff0, 1)[0];
    if (scrollFlag) {
        if (scrollFlag & 0x01) scrollFloorRight8px();
        if (scrollFlag & 0x02) scrollFloorLeft8px();
        if (scrollFlag & 0x04) scrollCeilingRight4px();
        if (scrollFlag & 0x08) scrollCeilingLeft4px();
        // Clear the flag
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
    if (['F1', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code))
        e.preventDefault();

    if (e.code === 'F1') {
        if (!e.repeat) toggleMusic();
        return;
    }

    if (openingIntro.active && e.code === 'Space') {
        openingIntro.skipPage();
        return;
    }

    if (indoorScene.active && e.code === 'Space') {
        if (e.repeat) return;
        requestExitIndoorScene();
        return;
    }
    if (indoorScene.active && indoorScene.destId === TOWN_BUILDING_SAGE) {
        if (e.code === 'ArrowUp')   { handleSageArrow(-1); return; }
        if (e.code === 'ArrowDown') { handleSageArrow( 1); return; }
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
 *
 * Sequence:
 *   1. Guard against double-start.
 *   2. Show game UI.
 *   3. Init SoundManager (requires user gesture — we're inside keydown/click).
 *   4. Load WASM engine (if enabled).
 *   5. Start PIT worklet ticking.
 *   6. Kick off rAF render loop.
 */
async function startGame() {
    if (gameStarted) return;
    gameStarted = true;

    uiScreen.classList.remove('hidden');
    layoutWrapper.classList.remove('hidden');

    // ── 3. AudioWorklet init (must happen inside user gesture) ────────────────
    try {
        await soundManager.init();
    } catch (err) {
        console.warn('[SoundManager] AudioWorklet init failed:', err);
        // Game continues without audio — non-fatal.
    }

    // ── 4. WASM engine ────────────────────────────────────────────────────────
    try {
        if (!USE_WASM_ENGINE) {
            // No WASM — run JS-only render loop
            drawLifeBar();
            soundManager.start();
            requestAnimationFrame(loop);
            return;
        }

        await loadWasmEngine();
        await initWasm();

        // Wire WASM memory into sound driver so poll reads 0xFF75 directly
        if (getWasmMemory) {
            soundManager.setWasmMemAccessor(getWasmMemory);
        }

        // Initialise WASM subsystems
        townInit?.();
        inputInit?.();

        // restart/restore: Load saved game data
        let saveState = null;
        if (!restoreName) {
            // restart 
            const resp = await fetch(STDPLY_PATH);
            if (!resp.ok) {
                throw new Error(`Failed to load ${STDPLY_PATH}: ${resp.status}`);
            }
            saveState = new Uint8Array(await resp.arrayBuffer());
        } else {
            // restore, for now - default slot
            saveState = loadGame();
        }
        loadSaveState(saveState);
        // get mdt from saveState
        const placeId = saveState[PLACE_MAP_ID] & 0x7f;
        const mdtPath = TOWN_MDTS[placeId];

        // Load starting town MDT at seg0:0xC000.
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

        townPatId = getTownPatId(); // 00 -> cpat, 01 ->mpat, 02 -> dpat
        const pattern = PATTERN_ASSETS[townPatId];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);   // your existing loader
            setSpecialTileList(pattern.specialTiles);
            updateTownAnimation();
        } else {
            console.warn(`Unknown pattern ID ${townPatId}, movement may be blocked`);
        }        
        await loadHeroSprite();
        await loadSwordIcons();

        // Parse MDT to discover which NPC sprite types this town uses, then
        // pre-load only those sheets.
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
            console.log('town_entry_disabling_edge_scroll called');
        }

        // ── Load matching music for this map ──────────────────────────────────
        const trackId = resolveTownMusicTrack(getTownMusicTrack());
        if (trackId) setCurrentMusicTrack(trackId);

        const heroPos = getTownHeroPosition?.() ?? getHeroPosition?.();
        console.log('Hero pos:', heroPos);

        engineReady = true;

    } catch (err) {
        console.error('[startGame] WASM init error:', err);
    }

    // ── 5. Start PIT worklet (after WASM so first ticks don't arrive too early)
    soundManager.start();

    // ── 6. Render loop ────────────────────────────────────────────────────────
    requestAnimationFrame(loop);
}

/**
 * Resolve which music track to play based on the MDT header.
 * Extend this as you map more MDT type bytes to filenames.
 * @param {number} type  — result of getTownMusicTrack()
 * @returns {string|null}
 */
function resolveTownMusicTrack(type) {
    const map  = { 0: 'mgt1', 1: 'ugm1', 2: 'mgt2', 3: 'ugm2' };
    return map[type] ?? 'mgt1';
}

function getTownMapWidth() {
    if (!mdtData || mdtData.length < 4) return 0;
    return mdtData[2] | (mdtData[3] << 8);
}

/**
 * Rebuild townAnimTileMap from the current pattern's animatedTilesSeq.
 * Must be called after townPatId is set and the pattern is selected.
 */
function updateTownAnimation() {
    const pattern = PATTERN_ASSETS[townPatId];
    const seqList = pattern?.animatedTilesSeq ?? [];
    townAnimTileMap = {};

    if (!seqList.length || (seqList.length === 1 && !seqList[0].length)) {
        // No animation for this pattern (e.g., MPAT with [[]])
        return;
    }

    for (const seq of seqList) {
        for (let pos = 0; pos < seq.length; pos++) {
            const tileId = seq[pos];
            townAnimTileMap[tileId] = { seq, pos };
        }
    }
}

/**
 * Returns the animated tile ID if tileId is part of any looping sequence,
 * otherwise returns tileId unchanged.  All sequences advance at a fixed
 * speed (TOWN_ANIMATION_FULL_TICKS per phase) using the global frameTimer.
 */
function getAnimatedTownTileId(tileId) {
    const entry = townAnimTileMap[tileId];
    if (!entry) return tileId;

    const { seq, pos } = entry;
    const len = seq.length;
    const phase = Math.floor(frameTimer / TOWN_ANIMATION_FULL_TICKS) % len;
    const newPos = (pos + phase) % len;
    return seq[newPos];
}

function drawTownBackground() {
    if (!townBackgroundReady) return false;
    ctx.drawImage(townBackground, 0, 0);
    return true;
}

// ceiling in ckpd
function drawTownCeiling() {
    if (!townBackgroundType || !townCeilingReady || !townBackgroundReady || !townCeilingNeedsRedraw) return false;
    ctx.drawImage(townBackground, 0, 0, canvas.width, TILE_HEIGHT*2, 0, 0, canvas.width, TILE_HEIGHT*2);

    const rightPartWidth = canvas.width - townCeilingOffsetX;
    if (rightPartWidth > 0) {
        ctx.drawImage(townCeiling, townCeilingOffsetX, 0, rightPartWidth, TILE_HEIGHT*2,
                      0, 0, rightPartWidth, TILE_HEIGHT*2);
    }
    // Draw the left part (from start of image to offset)
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
    // Draw the left part (from start of image to offset)
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
    // Draw the left part (from start of image to offset)
    const leftPartWidth2 = townSidewalk2OffsetX;
    if (leftPartWidth2 > 0) {
        ctx.drawImage(townSidewalk2, 0, 0, leftPartWidth2, TILE_HEIGHT,
                      rightPartWidth2, y, leftPartWidth2, TILE_HEIGHT);
    }

    return true;
}

function resetTownScrollOffsets() {
    townSidewalk1OffsetX = 0;
    townSidewalk2OffsetX = 0;
    townCeilingOffsetX = 0;
}

const scrollFloorRight8px = () => {
    townSidewalk1OffsetX = (townSidewalk1OffsetX - 24 + VIEW_WIDTH) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX - 48 + VIEW_WIDTH) % VIEW_WIDTH;
}

const scrollFloorLeft8px = () => {
    townSidewalk1OffsetX = (townSidewalk1OffsetX + 24) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX + 48) % VIEW_WIDTH;
}

const scrollCeilingRight4px = () => {
    townCeilingOffsetX = (townCeilingOffsetX - 12 + VIEW_WIDTH) % VIEW_WIDTH;
}

const scrollCeilingLeft4px = () => {
    townCeilingOffsetX = (townCeilingOffsetX + 12) % VIEW_WIDTH;
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
                townTileSheet,           // 1. Source image
                sx,                      // 2. Source X
                sy,                      // 3. Source Y
                TILE_WIDTH,              // 4. Source Width
                TILE_HEIGHT,             // 5. Source Height
                col * TILE_WIDTH,        // 6. Destination X
                (row + TOWN_MAP_START_ROW) * TILE_HEIGHT, // 7. Destination Y
                TILE_WIDTH,              // 8. Destination Width
                TILE_HEIGHT              // 9. Destination Height
            );            
        }
    }

    return true;
}

function drawHero() {
    if (!heroSpriteReady || !engineReady) return;

    // Read hero state directly from WASM memory
    readMemory(0xFF33, 1)[0]
    const heroAnim = readMemory(0x00E7, 1)[0];        // ADDR_HERO_ANIMATION_PHASE
    const facing   = readMemory(0x00C2, 1)[0] & 1;    // ADDR_FACING_DIRECTION bit0: 0=right, 1=left

    // Check actual key state – use the global `keys` object updated by keydown/keyup
    const moving = keys.ArrowLeft || keys.ArrowRight;

    let frame;
    if (heroAnim === 4) {
        frame = FRAME_FACING_AWAY;
    } else if (!moving) {
        // Standing frame – ignore HERO_ANIM completely
        frame = (facing === 0) ? FRAME_RIGHT_STAND : FRAME_LEFT_STAND;
    } else {
        // Walking frame – use the phase from HERO_ANIM (0-3)
        const phase = heroAnim & 3;
        if (facing === 0) {
            frame = FRAME_RIGHT_WALK_BASE + phase;
        } else {
            frame = FRAME_LEFT_WALK_BASE + phase;
        }
    }

    const sx = frame * HERO_FRAME_W;
    const viewportX = readMemory(0x0083, 1)[0];       // ADDR_HERO_X_IN_VIEWPORT
    const dx = viewportX * TILE_WIDTH;
    const dy = HERO_BASE_Y;

    ctx.drawImage(heroSprite,
        sx, 0,
        HERO_FRAME_W, HERO_FRAME_H,
        dx, dy,
        HERO_FRAME_W, HERO_FRAME_H
    );
}

/**
 * drawNpcs — reads the NPC array from WASM memory and renders each NPC.
 *
 * NPC struct (8 bytes, 0xFFFF-terminated on n_x):
 *   +0  n_x          uint16  absolute map column
 *   +2  n_facing     uint8   bit7: 1=face-left, 0=face-right; bits[3:0] spriteId
 *   +3  n_head_tile  uint8   (ignored here — WASM handles tile-map sentinel)
 *   +4  n_anim_phase uint8   bits[5:4] = 2-bit slow anim index (0-3)
 *   +5  n_ai_type    uint8
 *   +6  n_flags      uint8
 *   +7  n_id         uint8
 *
 * Sprite selection:
 *   - mman1.png (soldier, type 1): 8-frame looping idle facing viewer.
 *     frame = (n_anim_phase bits[5:4])
 *     Soldiers use first 4 frames as a smooth loop driven by anim_phase. Other 4 frames are for compatibility.
 *
 *   - mman0.png (citizen, type 0): 4 left-facing + 4 right-facing.
 *     Left  frames: 0-3  (n_facing bit7 = 1)
 *     Right frames: 4-7  (n_facing bit7 = 0)
 *     frame = facingBase + (n_anim_phase bits[5:4])
 *
 * The NPC category (cman.grp/mman.grp) for the current town comes from the town descriptor byte at +1
 * (first entry after the msd_music_index), stored in townNpcSpriteCategory.
 * All NPCs in a town share the same category
 * 
 * n_facing & 0x80 is facing direction: 0 => right, 0x80 => left
 * (n_facing & 0xf) is sprite id within the grp
 * E.g. the guards at castle 0x81 & 0xf = 1 => mman1.png
 */
function drawNpcs() {
    if (!engineReady || !readMemory) return;

    // Read the NPC array pointer (word at 0xC00F)
    const ptrBytes = readMemory(ADDR_NPC_ARRAY_PTR, 2);
    const npcArrayAddr = ptrBytes[0] | (ptrBytes[1] << 8);
    if (!npcArrayAddr) return;

    // Read viewport scroll position
    const proxLeftBytes = readMemory(0x0080, 2);
    const proxLeft = proxLeftBytes[0] | (proxLeftBytes[1] << 8);

    // Walk NPC array (max 64 entries safety cap)
    for (let i = 0; i < 64; i++) {
        const base = npcArrayAddr + i * 8;
        const npcMem = readMemory(base, 8);
        const nx = npcMem[0] | (npcMem[1] << 8);

        if (nx === 0xFFFF) break;   // end-of-list sentinel

        const nFacing    = npcMem[2];
        const sprite  = npcSprites[townNpcSpriteCategory][nFacing & 0xf];
        if (!sprite) continue;

        const nAnimPhase = npcMem[4];

        // Convert absolute map column → screen pixel X.
        const screenCol = nx - proxLeft - TOWN_VISIBLE_COL_OFFSET;
        const screenX   = screenCol * TILE_WIDTH;

        // Cull NPCs outside the 28-column viewport (with 1 tile margin)
        if (screenX < -NPC_FRAME_W || screenX >= VIEW_WIDTH) continue;

        // 2-bit animation index from bits [5:4] of n_anim_phase
        const animIdx = nAnimPhase & 3;

        let frame = (nFacing & 0x80) !== 0 ? animIdx : (4 + animIdx);

        const sx = frame * NPC_FRAME_W;

        ctx.drawImage(
            sprite,
            sx, 0,
            NPC_FRAME_W, NPC_FRAME_H,
            screenX, HERO_BASE_Y,
            NPC_FRAME_W, NPC_FRAME_H
        );
    }
}

async function handleTownTransition(transition) {
    if (townTransitionInProgress) return;
    townTransitionInProgress = true;

    // Pause the tick loop from calling townUpdate while we load
    engineReady = false;

    try {
        const rawMapId = transition.mapId & 0x7F;  // strip 0x80
        const mdtPath  = TOWN_MDTS[rawMapId];
        if (!mdtPath) throw new Error(`No MDT path for map id ${rawMapId}`);

        // 1. Load and install the new MDT
        const resp = await fetch(mdtPath);
        if (!resp.ok) throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdt(mdtData);
        mdtHeader = getTownMdtHeader?.();

        // 2. Reload background images (new town may use different type)
        const newBgType = getTownBackgroundType();
        if (newBgType !== townBackgroundType) {
            // background type changed — invalidate cached images
            townBackgroundType    = newBgType;
            townBackgroundReady   = false;
            townBackground        = null;
            townCeilingReady      = false;
            townCeiling           = null;
            townSidewalk1Ready    = false;
            townSidewalk1         = null;
            townSidewalk2Ready    = false;
            townSidewalk2         = null;
        }
        await loadTownBackground();
        await loadTownCeiling();
        await loadTownSidewalk1();
        await loadTownSidewalk2();
        resetTownScrollOffsets();

        // 3. Load tileset if pat_id changed
        const newPatId = transition.patId;
        if (newPatId !== townPatId) {
            townPatId         = newPatId;
            townTileSheetReady = false;
            townTileSheet     = null;
        }
        const pattern = PATTERN_ASSETS[townPatId];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileList(pattern.specialTiles);
            updateTownAnimation();
        }

        // 3b. Load NPC sprites for the new town
        parseTownNpcCategory();
        await Promise.all(
            NPC_SPRITE_PATHS[townNpcSpriteCategory].map((_, index) => loadNpcSprite(index))
        );

        // 4. Tell WASM to finish: apply sprite masks, decompress patterns,
        //    set hero position, call town_entry_common
        townSetReturnBeforeMainLoop?.(RETURN_BEFORE_TOWN_MAIN_LOOP);
        townCompleteTransition?.();

        // 5. Update music
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

let lastSpace = false;
let lastAlt = false;

function updateInputLatches() {
    const currentSpace = keys.Space;
    const currentAlt = keys.Alt;

    if (currentSpace && !lastSpace) {
        writeMemory(0xFF1D, [1]);   // ADDR_SPACEBAR_LATCH
    }
    if (currentAlt && !lastAlt) {
        writeMemory(0xFF1E, [1]);   // ADDR_ALTKEY_LATCH
    }

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

/**
 * Parse raw MDT text bytes into an array of "page" objects.
 * Each page is an array of line strings.
 * Control codes (0x81..0x8F) are treated as end-of-text for now.
 * '/' (0x2F) is a newline.  0xFF is end-of-text.
 *
 * Word-wrap uses the original pixel-width table scaled by WIDTH_SCALE.
 */
function parseDialogText(bytes) {
    const pages = [];
    let lines  = [''];    // current page's lines
    let lineW  = 0;       // current line pixel width (original coords)
    const MAX_W = ORIG_MAX_LINE_PX;

    const pushLine = () => {
        lines.push('');
        lineW = 0;
        if (lines.length - 1 === DIALOG_LINES_PER_PAGE) {
            // commit page (drop trailing empty line)
            const trimmed = lines.slice(0, DIALOG_LINES_PER_PAGE);
            pages.push(trimmed);
            lines = [''];
        }
    };

    for (let i = 0; i < bytes.length; i++) {
        let b = bytes[i];
        if (b === 0xFF || b === 0x00) break;          // end of dialog
        if (b >= 0x81) break;                         // control code → not yet implemented
        if (b === 0x2F) { pushLine(); continue; }     // explicit newline
        if (b === 0x5c) b = 0x27;                     // replace \ with '
        if (b === 0x26) b = 0x20;                     // replace & with space
        if (b < 0x20) continue;                       // skip other controls

        const ch  = String.fromCharCode(b);
        const cw  = charOrigWidth(ch);

        // Word-wrap: if adding this character would overflow and it's a space,
        // wrap now.  For non-space chars, always emit (original behaviour).
        if (b === 0x20) {
            // Measure next word to decide whether to wrap before the space.
            let nextW = 0;
            for (let j = i + 1; j < bytes.length; j++) {
                const nb = bytes[j];
                if (nb === 0x20 || nb === 0x2F || nb >= 0x80) break;
                if (nb >= 0x20) nextW += charOrigWidth(String.fromCharCode(nb));
            }
            if (lineW + cw + nextW >= MAX_W) {
                pushLine();
                continue; // drop the space at wrap point
            }
        }

        lines[lines.length - 1] += ch;
        lineW += cw;
    }

    // Flush remaining lines as a final page
    const nonEmpty = lines.filter(l => l.length > 0);
    if (nonEmpty.length > 0) pages.push(nonEmpty);

    return pages;
}

/**
 * Compute the dialog box position and size for the current page.
 * `onRight` true → box on right side of screen (hero faces left);
 * `onRight` false → box on left side (hero faces right).
 * Original: rect_pos 0x0718 = right, 0x0B18 = left.
 */
function computeBoxGeometry(facingLeft) {
    const page    = conversation.pages[conversation.page] ?? [];
    const nLines  = Math.max(page.length, 1);

    const bh = TEXT_FIRST_BASELINE + (nLines - 1) * TEXT_LINE_HEIGHT + TEXT_BOTTOM_PAD;

    // Width: fit to longest line
    ctx.save();
    ctx.font = `${DIALOG_FONT_SIZE + 2}px 'Courier New', monospace`;
    let maxW = 0;
    for (const line of page) {
        const w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
    }
    ctx.restore();

    const bw = Math.min(
        Math.max(maxW + 2 * DIALOG_PADDING_X + 16, 160),
        DIALOG_MAX_WIDTH
    );

    // Horizontal: hero faces left → NPC is to the right → box on right side;
    // hero faces right → NPC is to the left → box on left side.
    // In original: facing left (bit0=1) → rect_pos 0x0718 (right), else left.
    let bx = facingLeft ? VIEW_WIDTH - bw - 12 : 12;

    // Bottom edge sits just above the heads row
    const by = DIALOG_BOTTOM_Y - bh;

    conversation.boxX = bx;
    conversation.boxY = Math.max(by, 4);
    conversation.boxW = bw;
    conversation.boxH = bh;
}

function drawConversationDialog() {
    if (!conversation.active || !conversation.pages.length) return;

    const start = conversation.page * conversation.pageSize;
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
    // Read NPC address and ID
    const npcAddrBytes = readMemory(0xFFF6, 2);
    const npcAddr = npcAddrBytes[0] | (npcAddrBytes[1] << 8);
    let npcId = 0;
    if (npcAddr) {
        npcId = readMemory(npcAddr + 7, 1)[0];
    }
    const rawText = getNpcConversationRaw(npcId);
    const pages = parseDialogText(rawText);
    if (pages.length === 0) {
        // No text – exit conversation immediately
        townFinishConversation?.();
        return;
    }

    conversation.active = true;
    conversation.pages = pages;
    conversation.page = 0;
    conversation.savedBackground = null;
    computeBoxGeometry(readMemory(npcAddr + 2, 1)[0] & 0x80); // bit7 of n_facing is facing direction

    // Optional: play sound effect (the WASM already set ADDR_SOUND_FX_REQUEST)
}

function loadKingImages() {
    if (kingImagesReady) return Promise.resolve(kingImages);

    const loads = KING_IMAGE_PATHS.map((path, index) => {
        if (!path) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => {
            kingImages[index] = img;
            return img;
        });
    });

    return Promise.all(loads).then(() => {
        kingImagesReady = true;
        return kingImages;
    });
}

function loadPrincessChamberImage() {
    if (princessChamberImageReady) return Promise.resolve(princessChamberImage);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            princessChamberImage = img;
            princessChamberImageReady = true;
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load ${PRINCESS_CHAMBER_PATH}`));
        img.src = PRINCESS_CHAMBER_PATH;
    });
}

function selectKingDialogKey() {
    if (!readMemory) return 'firstAudience';

    const spokeToKing = readMemory(ADDR_SPOKE_TO_KING, 1)[0] !== 0;
    const enteredCavern = readMemory(ADDR_ENTERED_CAVERN_FIRST_TIME, 1)[0] !== 0;
    const deathProcessed = readMemory(ADDR_IS_DEATH_ALREADY_PROCESSED, 1)[0] !== 0;

    if (!spokeToKing && !enteredCavern) return 'firstAudience';
    if (!enteredCavern) return 'reminder';
    if (!deathProcessed) return 'afterCavern';
    return 'victory';
}

function wrapKingDialogText(text) {
    ctx.save();
    ctx.font = KING_DIALOG_FONT;

    const maxWidth = KING_DIALOG_W - 36;
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';

    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);

    ctx.restore();
    return lines;
}

function buildKingDialogPages(dialogKey) {
    const paragraphs = KING_DIALOG_SCRIPTS[dialogKey] ?? KING_DIALOG_SCRIPTS.firstAudience;
    const pages = [];
    let currentPage = [];
    let goldAwardPage = -1;

    for (const paragraph of paragraphs) {
        const wrapped = wrapKingDialogText(paragraph);
        for (const line of wrapped) {
            currentPage.push(line);
            if (currentPage.length === KING_DIALOG_MAX_LINES) {
                pages.push(currentPage);
                currentPage = [];
            }
        }
        if (dialogKey === 'firstAudience' && paragraph === KING_GOLD_GIFT_LINE) {
            if (currentPage.length) {
                pages.push(currentPage);
                currentPage = [];
            }
            goldAwardPage = pages.length - 1;
        }
    }
    if (currentPage.length) pages.push(currentPage);

    return {
        pages: pages.length ? pages : [['...']],
        goldAwardPage,
    };
}

function getKingPageCharCount(pageLines) {
    return pageLines.reduce((sum, line) => sum + line.length, 0);
}

function getKingVisibleCharCount(now) {
    const king = indoorScene.king;
    if (!king) return 0;
    const pageLines = king.pages[king.page] ?? [];
    const pageCharCount = getKingPageCharCount(pageLines);
    return Math.min(pageCharCount, Math.floor((now - king.pageStart) / KING_DIALOG_CHAR_MS));
}

function getKingCurrentChar(pageLines, visibleChars) {
    let remaining = Math.max(visibleChars - 1, 0);
    for (const line of pageLines) {
        if (remaining < line.length) return line[remaining];
        remaining -= line.length;
    }
    return '';
}

function drawKingImage(img, alpha = 1) {
    if (!img) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, KING_IMAGE_X, 0, KING_IMAGE_W, KING_IMAGE_H);
    ctx.restore();
}

function getKingVisibleDialogLines(now) {
    const king = indoorScene.king;
    if (!king) return [];

    const visibleChars = getKingVisibleCharCount(now);
    const lines = [];

    for (let pageIndex = 0; pageIndex < king.page; pageIndex++) {
        lines.push(...(king.pages[pageIndex] ?? []));
    }

    let remaining = visibleChars;
    const currentPageLines = king.pages[king.page] ?? [];
    for (const line of currentPageLines) {
        if (remaining <= 0) break;
        lines.push(line.slice(0, Math.min(line.length, remaining)));
        remaining -= line.length;
    }

    return lines.slice(-KING_DIALOG_MAX_LINES);
}

function drawKingDialogBox(now, alpha = 1) {
    const king = indoorScene.king;
    if (!king) return;

    const pageLines = king.pages[king.page] ?? [];
    const visibleChars = getKingVisibleCharCount(now);
    const pageCharCount = getKingPageCharCount(pageLines);
    const visibleLines = getKingVisibleDialogLines(now);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.98)';
    ctx.fillRect(KING_DIALOG_X, KING_DIALOG_Y, KING_DIALOG_W, KING_DIALOG_H);
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 2;
    ctx.strokeRect(KING_DIALOG_X + 1, KING_DIALOG_Y + 1, KING_DIALOG_W - 2, KING_DIALOG_H - 2);
    ctx.strokeStyle = '#26f';
    ctx.strokeRect(KING_DIALOG_X + 3, KING_DIALOG_Y + 3, KING_DIALOG_W - 6, KING_DIALOG_H - 6);

    ctx.font = KING_DIALOG_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    for (let i = 0; i < visibleLines.length; i++) {
        ctx.fillText(visibleLines[i], KING_DIALOG_TEXT_X, KING_DIALOG_TEXT_Y + i * KING_DIALOG_LINE_HEIGHT);
    }

    if (visibleChars >= pageCharCount) {
        ctx.fillStyle = '#0ee';
        // draw arrow pointing down
        ctx.beginPath();
        const x0 = KING_DIALOG_X + KING_DIALOG_W/2 - 12;
        const y0 = KING_DIALOG_Y + KING_DIALOG_H - 20;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0+20, y0);
        ctx.lineTo(x0+10, y0+10);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function getKingSpeechImageIndex(now) {
    const king = indoorScene.king;
    if (!king || indoorScene.phase !== 'kingDialog') return 8;

    const pageLines = king.pages[king.page] ?? [];
    const visibleChars = getKingVisibleCharCount(now);
    const pageCharCount = getKingPageCharCount(pageLines);
    const typing = visibleChars < pageCharCount;
    const currentChar = getKingCurrentChar(pageLines, visibleChars);
    const mouthOpen = typing && currentChar.trim() !== '' && Math.floor(now / 95) % 2 === 0;
    const blinkCycle = now % 3600;
    const eyesClosed = blinkCycle > 3320 && blinkCycle < 3520;

    if (eyesClosed) return mouthOpen ? 7 : 6;
    return mouthOpen ? 9 : 8;
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

async function loadSwordIcons() {
    if (swordIconsReady) return Promise.resolve(swordIcons);

    const loads = ITEMP_SWORD_IMAGE_PATHS.map((path, index) => {
        if (!path) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => {
            swordIcons[index] = img;
            return img;
        });
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
        }).then(img => {
            shieldIcons[index] = img;
            return img;
        });
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

    const hpBytes =  readMemory(ADDR_SHIELD_HP, 2);
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
        }).then(img => {
            magicIcons[index] = img;
            return img;
        });
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


function startKingFirstAudienceGift() {
    const king = indoorScene.king;
    if (!king || !readMemory || !writeMemory) return false;
    if (readMemory(ADDR_SPOKE_TO_KING, 1)[0] !== 0) return false;

    king.goldAward = { stepsDone: 0 };
    indoorScene.phase = 'kingGoldAward';
    indoorScene.phaseStart = performance.now();
    applyKingGoldAwardStep();
    return true;
}

function applyKingGoldAwardStep() {
    const king = indoorScene.king;
    if (!king?.goldAward || !writeMemory) return;

    const nextGold = getHeroGoldValue() + KING_GOLD_GIFT_PER_STEP;
    setHeroGoldValue(nextGold);
    renderGoldHud();

    writeMemory(ADDR_SOUND_FX_REQUEST, [KING_GOLD_GIFT_SFX]);
    frameTimer = 0;
    writeMemory(ADDR_FRAME_TIMER, [0]);
    king.goldAward.stepsDone++;
}

function updateKingGoldAward(now) {
    const king = indoorScene.king;
    if (!king?.goldAward || !writeMemory) return;
    if (frameTimer < KING_GOLD_GIFT_DELAY_FRAMES) return;

    if (king.goldAward.stepsDone < KING_GOLD_GIFT_STEPS) {
        applyKingGoldAwardStep();
        return;
    }

    writeMemory(ADDR_SPOKE_TO_KING, [0xFF]);
    king.goldAward = null;
    if (king.page < king.pages.length - 1) {
        king.page++;
        king.pageStart = now;
        indoorScene.phase = 'kingDialog';
        indoorScene.phaseStart = now;
        return;
    }

    indoorScene.phase = 'kingFadeOut';
    indoorScene.phaseStart = now;
    indoorScene.fadeStartAlpha = 1;
}

function checkBuildingRequest() {
    if (!engineReady || !readMemory || indoorScene.active) return;

    const active = readMemory(ADDR_BUILDING_ACTIVE, 1)[0];
    if (!active) return;

    const destId = readMemory(ADDR_BUILDING_DEST_ID, 1)[0];
    startIndoorScene(destId);
}

function startIndoorScene(destId) {
    if (destId !== TOWN_BUILDING_KING && 
        destId !== TOWN_BUILDING_PRINCESS &&
        destId !== TOWN_BUILDING_SAGE) {
        console.warn(`[building] destination ${destId} is not implemented yet`);
        townFinishBuilding?.();
        return;
    }

    indoorScene.active = true;
    indoorScene.destId = destId;
    indoorScene.phase = 'loading';
    indoorScene.phaseStart = performance.now();
    indoorScene.alpha = 0;
    indoorScene.fadeStartAlpha = 0;
    indoorScene.image = null;
    indoorScene.king = null;

    if (destId === TOWN_BUILDING_SAGE) {
        startSageScene();
        return;
    }

    if (destId === TOWN_BUILDING_PRINCESS) {
        loadPrincessChamberImage()
            .then(img => {
                if (!indoorScene.active || indoorScene.destId !== destId) return;
                indoorScene.image = img;
                indoorScene.phase = 'fadeIn';
                indoorScene.phaseStart = performance.now();
                indoorScene.alpha = 0;
            })
            .catch(err => {
                console.error('[building] failed to load princess chamber:', err);
                finishIndoorScene();
            });
        return;
    }

    loadKingImages()
        .then(images => {
            if (!indoorScene.active || indoorScene.destId !== destId) return;
            const dialogKey = selectKingDialogKey();
            const dialog = buildKingDialogPages(dialogKey);
            indoorScene.king = {
                images,
                dialogKey,
                pages: dialog.pages,
                goldAwardPage: dialog.goldAwardPage,
                page: 0,
                pageStart: 0,
                goldAward: null,
            };
            indoorScene.phase = 'kingEntering';
            indoorScene.phaseStart = performance.now();
            indoorScene.alpha = 1;
        })
        .catch(err => {
            console.error('[building] failed to load king palace:', err);
            finishIndoorScene();
        });
}

function requestExitIndoorScene() {
    if (!indoorScene.active || indoorScene.phase === 'fadeOut') return;
    if (indoorScene.destId === TOWN_BUILDING_KING) {
        advanceKingDialog();
        return;
    }
    if (indoorScene.destId === TOWN_BUILDING_SAGE) {
        handleSageSpacePress();
        return;
    }

    indoorScene.phase = 'fadeOut';
    indoorScene.phaseStart = performance.now();
    indoorScene.fadeStartAlpha = indoorScene.alpha;
}

function advanceKingDialog() {
    const king = indoorScene.king;
    if (!king || indoorScene.phase !== 'kingDialog') return;

    const now = performance.now();
    const pageLines = king.pages[king.page] ?? [];
    const pageCharCount = getKingPageCharCount(pageLines);
    const visibleChars = getKingVisibleCharCount(now);

    if (visibleChars < pageCharCount) {
        king.pageStart = now - pageCharCount * KING_DIALOG_CHAR_MS;
        return;
    }

    if (king.dialogKey === 'firstAudience' && king.page === king.goldAwardPage) {
        if (startKingFirstAudienceGift()) return;
    }

    if (king.page < king.pages.length - 1) {
        king.page++;
        king.pageStart = now;
        return;
    }

    indoorScene.phase = 'kingFadeOut';
    indoorScene.phaseStart = now;
    indoorScene.fadeStartAlpha = 1;
}

function finishIndoorScene() {
    indoorScene.active = false;
    indoorScene.destId = 0xFF;
    indoorScene.phase = 'idle';
    indoorScene.phaseStart = 0;
    indoorScene.alpha = 0;
    indoorScene.fadeStartAlpha = 0;
    indoorScene.image = null;
    indoorScene.king = null;
    townFinishBuilding?.();
    keys.Space = false;
    lastSpace = false;
}

function drawIndoorScene() {
    if (!indoorScene.active) return false;

    updateElementText('currentMapName',
        indoorScene.destId === TOWN_BUILDING_SAGE
            ? sageCurrentName()
            : (TOWN_BUILDING_NAMES[indoorScene.destId] ?? ''));

    const now = performance.now();
    const fadeInMs = 650;
    const fadeOutMs = 450;

    if (indoorScene.destId === TOWN_BUILDING_KING) {
        return drawKingPalaceScene(now);
    }
    if (indoorScene.destId === TOWN_BUILDING_SAGE) {
        return drawSageHutScene(now);
    }

    if (indoorScene.phase === 'fadeIn') {
        indoorScene.alpha = Math.min(1, (now - indoorScene.phaseStart) / fadeInMs);
        if (indoorScene.alpha >= 1) {
            indoorScene.phase = 'shown';
        }
    } else if (indoorScene.phase === 'shown') {
        indoorScene.alpha = 1;
    } else if (indoorScene.phase === 'fadeOut') {
        const t = Math.min(1, (now - indoorScene.phaseStart) / fadeOutMs);
        indoorScene.alpha = indoorScene.fadeStartAlpha * (1 - t);
        if (t >= 1) {
            finishIndoorScene();
            return false;
        }
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (indoorScene.image) {
        ctx.save();
        ctx.globalAlpha = indoorScene.alpha;
        ctx.drawImage(indoorScene.image, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    return true;
}

function drawKingPalaceScene(now) {
    const king = indoorScene.king;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!king) return true;

    if (indoorScene.phase === 'kingEntering') {
        const elapsed = now - indoorScene.phaseStart;
        const frame = Math.min(
            KING_ENTRY_SEQUENCE.length - 1,
            Math.floor(elapsed / KING_ENTRY_FRAME_MS)
        );
        drawKingImage(king.images[KING_ENTRY_SEQUENCE[frame]]);

        if (frame === KING_ENTRY_SEQUENCE.length - 1 && elapsed >= KING_ENTRY_SEQUENCE.length * KING_ENTRY_FRAME_MS) {
            indoorScene.phase = 'kingDialog';
            indoorScene.phaseStart = now;
            king.pageStart = now;
        }
        return true;
    }

    if (indoorScene.phase === 'kingDialog') {
        drawKingImage(king.images[getKingSpeechImageIndex(now)]);
        drawKingDialogBox(now);
        return true;
    }

    if (indoorScene.phase === 'kingGoldAward') {
        updateKingGoldAward(now);
        drawKingImage(king.images[8]);
        drawKingDialogBox(now);
        return true;
    }

    if (indoorScene.phase === 'kingFadeOut') {
        const t = Math.min(1, (now - indoorScene.phaseStart) / KING_FADE_OUT_MS);
        const alpha = indoorScene.fadeStartAlpha * (1 - t);
        drawKingImage(king.images[8], alpha);
        drawKingDialogBox(now, alpha);
        if (t >= 1) {
            finishIndoorScene();
            return false;
        }
        return true;
    }

    return true;
}

// ─── rAF game loop ────────────────────────────────────────────────────────────
/**
 * update() — runs once per animation frame.
 *
 * Heavy game-logic (movement, combat) is intentionally NOT done here; it runs
 * inside onSlowTick() at ~47.3 Hz (driven by the PIT worklet) to preserve the
 * original timing.
 */
function update() {
    if (!engineReady) return;
    if (indoorScene.active) return;

    // Check for hero interactions with doors/items
    // This is for specific situations (entering doors, item triggers)
    heroInteractionCheck?.();

    // Update combat state (death animations, XP/gold awards)
    combatUpdate?.();

    // Update boss battle (if in boss cavern)
    updateBossBattle?.();

    proximityMap = getProximityMap?.();
}

// --- Rendering ---
function draw() {
    ctx.fillStyle = '#05053f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (drawIndoorScene()) {
        return;
    }

    if (!engineReady) {
        drawLifeBar();
        updateElementText('currentMapName', '');
        renderGoldHud();
        updateElementText('almas', 0);
        renderSwordHud();
        renderMagicHud();
        renderShieldHud();
        return;
    }

    drawTownBackground();
    drawTownSidewalk();
    if (townBackgroundType) drawTownCeiling();

    if (drawTownTiles()) {
        drawNpcs();   // NPCs rendered behind the hero
        drawHero();
        drawLifeBar();
        let placeName = getTownName?.() ?? 'unknown';
        updateElementText('currentMapName', townEntryRan ? placeName : '');
        renderGoldHud();
        updateElementText('almas', 0);
        renderSwordHud();
        renderMagicHud();
        renderShieldHud();

        // Draw dialog on top if conversation active
        drawConversationDialog();
        return;
    }
}

function loop(timestamp) {
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    if (dt > 0) fps = Math.round(1000 / dt);

    update();
    draw();
    requestAnimationFrame(loop);
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function updateElementText(elementId, value) {
    const el = document.getElementById(elementId);
    if (el && value !== undefined) el.textContent = value;
}

let lifeFillCurrentEl = null;
let lifeFillMaxEl     = null;

function drawLifeBar() {
    if (!lifeFillCurrentEl) {
        lifeFillCurrentEl = document.querySelector('.life-fill-current');
        lifeFillMaxEl     = document.querySelector('.life-fill-max');
    }
    setLife(10, 30);
}

function setLife(currentLife, maxLife) {
    if (lifeFillCurrentEl && lifeFillMaxEl) {
        lifeFillMaxEl.style.width     = maxLife     + '%';
        lifeFillCurrentEl.style.width = currentLife + '%';
    }
}

/**
 * Save 256 bytes to localStorage.
 * @param {Uint8Array} saveData - exactly 256 bytes
 * @param {string} [saveKey='zeliard_save_01']
 */
function saveGame(saveData, saveKey = 'zeliard_save_01') {
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

/**
 * Load 256 bytes from localStorage.
 * @param {string} [saveKey='zeliard_save_01']
 * @returns {Uint8Array|null}
 */
function loadGame(saveKey = 'zeliard_save_01') {
  const base64 = localStorage.getItem(saveKey);
  if (!base64) {
    console.log('No save file.');
    return null;
  }
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length !== 256) {
      console.warn(`loadGame: retrieved ${bytes.length} bytes, expected 256 – data may be corrupted.`);
      return null;
    }
    console.log('Game loaded.');
    return bytes;
  } catch (err) {
    console.error('loadGame: failed to decode save data', err);
    return null;
  }
}

function exportSave() {
    const gameState = null;//{ player }; // Simplify for example
    const dataStr = JSON.stringify(gameState, null, 2); // Pretty print
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "zeliard_save.json";
    link.click();
    
    URL.revokeObjectURL(url);
}

// Add this to your HTML: <input type="file" id="fileInput" style="display:none">
function importSave(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = JSON.parse(e.target.result);
        // Object.assign(player, data.player);
        console.log("File Imported!");
    };
    reader.readAsText(file);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
