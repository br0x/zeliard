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
const TOWN_BUILDING_PRINCESS = 1;
const TOWN_BUILDING_NAMES = {
    [TOWN_BUILDING_PRINCESS]: 'In the Hut',
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
let indoorScene = {
    active: false,
    destId: 0xFF,
    phase: 'idle',
    phaseStart: 0,
    alpha: 0,
    fadeStartAlpha: 0,
    image: null,
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
const DIALOG_CURSOR_CHAR  = '\u25BC'; // ▼ — "more" indicator
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
const SFX_IDS = [10, 20, 29, 30, 40, 50, 60];

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
        requestExitIndoorScene();
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

function checkBuildingRequest() {
    if (!engineReady || !readMemory || indoorScene.active) return;

    const active = readMemory(ADDR_BUILDING_ACTIVE, 1)[0];
    if (!active) return;

    const destId = readMemory(ADDR_BUILDING_DEST_ID, 1)[0];
    startIndoorScene(destId);
}

function startIndoorScene(destId) {
    if (destId !== TOWN_BUILDING_PRINCESS) {
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
}

function requestExitIndoorScene() {
    if (!indoorScene.active || indoorScene.phase === 'fadeOut') return;
    if (indoorScene.destId !== TOWN_BUILDING_PRINCESS) return;

    indoorScene.phase = 'fadeOut';
    indoorScene.phaseStart = performance.now();
    indoorScene.fadeStartAlpha = indoorScene.alpha;
}

function finishIndoorScene() {
    indoorScene.active = false;
    indoorScene.destId = 0xFF;
    indoorScene.phase = 'idle';
    indoorScene.phaseStart = 0;
    indoorScene.alpha = 0;
    indoorScene.fadeStartAlpha = 0;
    indoorScene.image = null;
    townFinishBuilding?.();
    keys.Space = false;
    lastSpace = false;
}

function drawIndoorScene() {
    if (!indoorScene.active) return false;

    updateElementText('currentMapName', TOWN_BUILDING_NAMES[indoorScene.destId] ?? '');

    const now = performance.now();
    const fadeInMs = 650;
    const fadeOutMs = 450;

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
        updateElementText('gold', 0);
        updateElementText('almas', 0);
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
        updateElementText('gold', 0);
        updateElementText('almas', 0);

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
