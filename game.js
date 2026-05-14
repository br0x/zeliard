/**
 * game.js — Zeliard web port, main entry point.
 *
 * Changes from previous version:
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
// ─── Feature flags ────────────────────────────────────────────────────────────
const USE_WASM_ENGINE = true;
const RUN_TOWN_ENTRY_ON_START = true;
const RETURN_BEFORE_TOWN_MAIN_LOOP = true;
const USE_DUNGEON_RENDERER = false;
const STDPLY_PATH = 'game/stdply.bin';
const START_TOWN_MDT_PATH = 'game/0/cmap.mdt';
const PATTERN_ASSETS = {
    0: { // CPAT
        imagePath: 'assets/images/cpat/cmap_x24.png',
        specialTiles: [0x3C, 0x3D]   // pillars (screen edges)
    },
    1: { // MPAT
        imagePath: 'assets/images/mpat/mmap_x24.png',
        specialTiles: [0x96, 0x97]   // pillars (screen edges)
    },
    2: { // DPAT
        imagePath: 'assets/images/dpat/dmap_x24.png',
        specialTiles: [0xbf]
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
const TOWN_TILE_SHEET_COLS = 16;
const TOWN_MAP_TILE_OFFSET = 0x17;
const TOWN_VIEW_ROWS = 8;
const TOWN_MAP_START_ROW = 8;
const TOWN_HEADS_START_ROW = TOWN_MAP_START_ROW + 5;
const TOWN_SIDEWALK1_START_ROW = TOWN_MAP_START_ROW + TOWN_VIEW_ROWS;
const TOWN_SIDEWALK2_START_ROW = TOWN_SIDEWALK1_START_ROW + 1;
const TOWN_VISIBLE_COL_OFFSET = 4;
const TOWN_ANIMATED_TILES = [2, 3, 4, 5];
const TOWN_ANIMATION_FULL_TICKS = 24;
const TOWN_BACKGROUND_ROWS = 11;
const PLACE_MAP_ID = 0xC4;
const TOWN_MDTS = [
    'game/0/cmap.mdt',
    'game/0/mrmp.mdt',
    'game/0/stmp.mdt',
    'game/0/bsmp.mdt',
    'game/0/hlmp.mdt',
    'game/0/tmmp.mdt',
    'game/0/drmp.mdt',
    'game/0/lmmp.mdt',
    'game/0/prmp.mdt',
    'game/0/esmp.mdt',
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
let buildInputBitmask;
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

let restoreName = null;
let RENDER_CONFIG;
let renderDungeonObjects;
let townEntryRan = false;
let townBackgroundType = null;
let townPatId = null;
let townBackground = null;
let townBackgroundReady = false;
let townBackground0 = null;
let townBackground0Ready = false;
let townTileSheet = null;
let townTileSheetReady = false;
let townSidewalk1OffsetX = 0;
let townSidewalk2OffsetX = 0;
let townSidewalk1 = null;
let townSidewalk1Ready = false;
let townSidewalk2 = null;
let townSidewalk2Ready = false;
let heroSprite = null;
let heroSpriteReady = false;

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

function loadTownBackground0() {
    if (!townBackgroundType) return Promise.resolve(null);
    if (townBackground0Ready) return Promise.resolve(townBackground0);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            townBackground0 = img;
            townBackground0Ready = true;
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
        buildInputBitmask,
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
    } = wasmBridge);

    if (!USE_DUNGEON_RENDERER) {
        return;
    }

    try {
        const renderConfig  = await import('./src/render-config.js');
        const renderObjects = await import('./src/render-objects.js');
        RENDER_CONFIG        = renderConfig.RENDER_CONFIG;
        renderDungeonObjects = renderObjects.renderDungeonObjects;
    } catch (err) {
        console.warn('[WASM] Dungeon renderer modules are not available yet:', err);
    }
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

const player = {
    x:         61,
    y:         7,
    direction: 1,   // 1=right, -1=left, 0=onRope
};

const camX = 13;
const camY = 7;

// Calculate starting position for viewport
// Hero is at column 18 (center of 36-column proximity map)
// For 28-column viewport, start at column (36-28)/2 = 4
const startCol = 4;  // Center 28 columns in 36-column proximity map

// Calculate starting row (center vertically on hero)
// Hero is at row heroY, we want to show 9 rows above and 9 below (18 total)
const startRow = (player.y - 9 < 0) ? player.y - 9 + 64 : player.y - 9;

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
    townFullTick?.();
    // disk_retry_timer lives in WASM memory (0xFF-area); increment it there
    // if you have a getWasmMemory accessor:
    if (engineReady && getWasmMemory) {
        const mem = getWasmMemory();
        if (mem) {
            // ADDR_DISK_RETRY_TIMER is in the FF-area — adjust if needed
            // mem[0xFF??]++;
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

    // Update input edge-detection in WASM
    inputUpdate?.();
    townUpdate?.();
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

    if (e.code === 'Space')                       keys.Space     = true;
    if (e.code === 'AltLeft' || e.code === 'AltRight') keys.Alt  = true;
    if (e.code === 'Enter')                       keys.Enter     = true;
    if (e.code === 'Escape')                      keys.Escape    = true;
    if (e.code === 'ArrowUp')                     keys.ArrowUp   = true;
    if (e.code === 'ArrowDown')                   keys.ArrowDown = true;
    if (e.code === 'ArrowLeft')                   keys.ArrowLeft = true;
    if (e.code === 'ArrowRight')                  keys.ArrowRight = true;

    if (engineReady) {
        const bitmask      = buildInputBitmask(keys);
        const counterBefore = inputGetDebugCounter();
        inputSetKeys(bitmask);
        const counterAfter  = inputGetDebugCounter();
        console.log('Keydown:', e.code, '| Counter:', counterBefore, '->', counterAfter);
    }
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

    if (engineReady) {
        const bitmask = buildInputBitmask(keys);
        inputSetKeys(bitmask);
    }
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
        await loadTownBackground0();
        await loadTownSidewalk1();
        await loadTownSidewalk2();
        townPatId = getTownPatId(); // 00 -> cpat, 01 ->mpat, 02 -> dpat
        const pattern = PATTERN_ASSETS[townPatId];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);   // your existing loader
            setSpecialTileList(pattern.specialTiles);
        } else {
            console.warn(`Unknown pattern ID ${townPatId}, movement may be blocked`);
        }        
        await loadHeroSprite();

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

function getAnimatedTownTileId(tileId) {
    const cycleIndex = TOWN_ANIMATED_TILES.indexOf(tileId);
    if (cycleIndex === -1) return tileId;

    const frame = Math.floor(frameTimer / TOWN_ANIMATION_FULL_TICKS) % TOWN_ANIMATED_TILES.length;
    return TOWN_ANIMATED_TILES[(cycleIndex + frame) % TOWN_ANIMATED_TILES.length];
}

function drawTownBackground() {
    if (!townBackgroundReady) return false;
    ctx.drawImage(townBackground, 0, 0);
    return true;
}

function drawTownBackground0() {
    if (!townBackgroundType || !townBackground0Ready) return false;
    ctx.drawImage(townBackground0, 0, 0);
    return true;
}

function drawTownSidewalk1() {
    if (!townSidewalk1Ready) return false;
    ctx.drawImage(townSidewalk1, townSidewalk1OffsetX, TOWN_SIDEWALK1_START_ROW*TILE_HEIGHT);
    return true;
}

function drawTownSidewalk2() {
    if (!townSidewalk2Ready) return false;
    ctx.drawImage(townSidewalk2, townSidewalk2OffsetX, TOWN_SIDEWALK2_START_ROW*TILE_HEIGHT);
    return true;
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

    // Get current hero state from WASM
    const moving = heroIsMoving?.();          // true if walking
    let heroPos = getHeroPosition?.();
    let viewportX = heroPos.hero_x_in_viewport;
    let direction = heroPos.facing_direction;
    if (viewportX === undefined) viewportX = 0;

    // Select frame index
    let frame = FRAME_RIGHT_STAND;
    if (direction === 0) {
        if (moving) {
            const phase = Math.floor(animTimer / ANIM_SPEED_TICKS) % 4;
            frame = FRAME_RIGHT_WALK_BASE + phase;
        } else {
            frame = FRAME_RIGHT_STAND;
        }
    } else if (direction === 1) {
        if (moving) {
            const phase = Math.floor(animTimer / ANIM_SPEED_TICKS) % 4;
            frame = FRAME_LEFT_WALK_BASE + phase;
        } else {
            frame = FRAME_LEFT_STAND;
        }
    } else {
        // On rope / facing away – use frame 4 (optional)
        frame = 4;
    }

    const sx = frame * HERO_FRAME_W;
    const dx = viewportX * TILE_WIDTH;
    const dy = HERO_BASE_Y;

    ctx.drawImage(heroSprite, 
        sx, // source x
        0,  // source y
        HERO_FRAME_W, // source width
        HERO_FRAME_H, // source height
        dx, // dest x
        dy, // dest y
        HERO_FRAME_W, // dest width
        HERO_FRAME_H  // dest height
    );
}

// ─── rAF game loop ────────────────────────────────────────────────────────────
/**
 * update() — runs once per animation frame (~60 Hz).
 *
 * Heavy game-logic (movement, combat) is intentionally NOT done here; it runs
 * inside onSlowTick() at ~47.3 Hz (driven by the PIT worklet) to preserve the
 * original timing. update() only syncs WASM state → JS player object so the
 * renderer has fresh data.
 */
function update() {
    if (!engineReady) return;

    // Enable hero movement update
    heroMovementUpdate?.();
    updateHorizontalPlatforms?.();

  // Sync hero position from WASM
    const heroPos = getTownHeroPosition?.() ?? getHeroPosition?.();
    if (heroPos) {
        player.x = heroPos.x;
        player.y = heroPos.y;
    }

    // Check for hero interactions with doors/items
    // This is for specific situations (entering doors, item triggers)
    heroInteractionCheck?.();

    // Update combat state (death animations, XP/gold awards)
    combatUpdate?.();

    // Update boss battle (if in boss cavern)
    updateBossBattle?.();

    // Sync hero direction from WASM to JS player object
    // starting_direction: bit 0 = 0 (left) or 1 (right)
    const wasmDir  = heroGetDirection?.();
    if (wasmDir !== undefined) {
        player.direction = (wasmDir & 1) ? 1 : -1;
    }

    proximityMap = getProximityMap?.();
}

// --- Rendering ---
function draw() {
    ctx.fillStyle = '#05053f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!engineReady) {
        drawLifeBar();
        updateElementText('currentMapName', '');
        updateElementText('gold', 0);
        updateElementText('almas', 0);
        return;
    }

    drawTownBackground();
    drawTownSidewalk1();
    drawTownSidewalk2();

    if (drawTownTiles()) {
        drawHero();
        drawLifeBar();
        let placeName = getTownName?.() ?? 'unknown';
        updateElementText('currentMapName', townEntryRan ? placeName : '');
        updateElementText('gold', 0);
        updateElementText('almas', 0);
        return;
    }

    if (!proximityMap || !RENDER_CONFIG || !renderDungeonObjects) {
        drawLifeBar();
        updateElementText('currentMapName', townEntryRan ? 'Town WASM bootstrapped' : '');
        updateElementText('gold', 0);
        updateElementText('almas', 0);
        return;
    }

    // ctx.font          = `${TILE_HEIGHT}px "Press Start 2P", monospace`;
    // ctx.textBaseline  = 'top';

    // Background tiles
    // ctx.fillStyle = RENDER_CONFIG.tiles.default.color;
    // for (let row = 0; row < VIEW_ROWS; row++) {
    //     let mapRow = startRow + row;
    //     if (mapRow >= 64) mapRow -= 64;

    //     for (let col = 0; col < VIEW_COLS; col++) {
    //         const proximityCol = startCol + col;
    //         const offset       = mapRow * 36 + proximityCol;
    //         const tileByte     = proximityMap[offset];
    //         ctx.fillText(String.fromCharCode(tileByte + 0x20), col * TILE_WIDTH, row * TILE_HEIGHT);
    //     }
    // }

    // Render dungeon objects (platforms, doors, items, monsters)
    // renderDungeonObjects(ctx, mdtData, mdtHeader, camX, startRow, TILE_WIDTH, TILE_HEIGHT);

    // // Hero sprite
    // ctx.fillStyle = RENDER_CONFIG.hero.color;
    // const screenX = camX * TILE_WIDTH;
    // const screenY = camY * TILE_HEIGHT;

    // let heroStyle;
    // if      (player.direction === 0)  heroStyle = RENDER_CONFIG.hero.standing.onRope;
    // else if (player.direction === 1)  heroStyle = RENDER_CONFIG.hero.standing.facingRight;
    // else                              heroStyle = RENDER_CONFIG.hero.standing.facingLeft;

    // ctx.fillText(heroStyle.head, screenX, screenY + TILE_HEIGHT * 2);
    // ctx.fillText(heroStyle.body, screenX, screenY + TILE_HEIGHT * 3);
    // ctx.fillText(heroStyle.legs, screenX, screenY + TILE_HEIGHT * 4);

    drawLifeBar();
    updateElementText('currentMapName', cavernName);
    updateElementText('gold', 1);
    updateElementText('almas', 2);
    updateElementText('activeSwordSlot', '/');
    updateElementText('activeShieldSlot', 'O');
    updateElementText('shieldHp', 3);
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
    const gameState = { player }; // Simplify for example
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
        Object.assign(player, data.player);
        console.log("File Imported!");
    };
    reader.readAsText(file);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
