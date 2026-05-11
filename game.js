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

// ─── Feature flags ────────────────────────────────────────────────────────────
const USE_WASM_ENGINE = true;
const RUN_TOWN_ENTRY_ON_START = true;
const RETURN_BEFORE_TOWN_MAIN_LOOP = true;
const START_TOWN_MDT_PATH = 'game/0/cmap.mdt';

// ─── WASM bridge (lazy-loaded) ────────────────────────────────────────────────
let engineReady  = false;
let gameStarted  = false;

let initWasm;
let loadMdt;
let getMdtHeader;
let getCavernName;
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
let inputGetDebugCounter;
let getWasmMemory;  // NEW: returns Uint8Array of WASM linear memory
let townInit;
let townSetReturnBeforeMainLoop;
let townEntryDisablingEdgeScroll;
let hasWasmExport;

let RENDER_CONFIG;
let renderDungeonObjects;
let townEntryRan = false;

async function loadWasmEngine() {
    const wasmBridge    = await import('./src/zeliard-wasm.js');

    ({
        initWasm,
        loadMdt,
        getMdtHeader,
        getCavernName,
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
        inputGetDebugCounter,
        getWasmMemory,         // NEW: exposed from zeliard-wasm.js
        townInit,
        townSetReturnBeforeMainLoop,
        townEntryDisablingEdgeScroll,
        hasWasmExport,
    } = wasmBridge);

    try {
        const renderConfig  = await import('./src/render-config.js');
        const renderObjects = await import('./src/render-objects.js');
        RENDER_CONFIG        = renderConfig.RENDER_CONFIG;
        renderDungeonObjects = renderObjects.renderDungeonObjects;
    } catch (err) {
        console.warn('[WASM] Dungeon renderer modules are not available yet:', err);
    }
}

// ─── Engine / Canvas config ───────────────────────────────────────────────────
const TILE_WIDTH  = 24;
const TILE_HEIGHT = 24;
const VIEW_COLS   = 28;
const VIEW_ROWS   = 18;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const introScreen  = document.getElementById('intro-screen');
const introCanvas  = document.getElementById('introCanvas');
const uiScreen     = document.getElementById('ui');
const layoutWrapper = document.getElementById('layout-wrapper');

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = VIEW_COLS * TILE_WIDTH;
canvas.height = VIEW_ROWS * TILE_HEIGHT;

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
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code))
        e.preventDefault();

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

        // Load starting town MDT at seg0:0xC000.
        const response = await fetch(START_TOWN_MDT_PATH);
        if (!response.ok) {
            throw new Error(`Failed to load ${START_TOWN_MDT_PATH}: ${response.status}`);
        }
        mdtData = new Uint8Array(await response.arrayBuffer());
        loadMdt(mdtData);
        mdtHeader = getMdtHeader?.();

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
        const trackId = resolveMusicTrack(mdtHeader);
        if (trackId) soundManager.playMusic(trackId);

        const heroPos = getHeroPosition?.();
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
 * @param {object} header  — result of getMdtHeader()
 * @returns {string|null}
 */
function resolveMusicTrack(header) {
    if (!header) return null;
    // Example: MDT type byte lives in header.type or header.flags
    // Adjust to your actual getMdtHeader() shape.
    const type = header.type ?? 0;
    const map  = { 0: 'mgt1', 1: 'ugm1', 2: 'mgt2', 3: 'ugm2' };
    return map[type] ?? 'mgt1';
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
    heroMovementUpdate();
    updateHorizontalPlatforms();

  // Sync hero position from WASM
    const heroPos = getHeroPosition();
    if (heroPos) {
        player.x = heroPos.x;
        player.y = heroPos.y;
    }

  // Check for hero interactions with doors/items
  // This is for specific situations (entering doors, item triggers)
    heroInteractionCheck();

  // Update combat state (death animations, XP/gold awards)
    combatUpdate();

  // Update boss battle (if in boss cavern)
    updateBossBattle();

  // Sync hero direction from WASM to JS player object
  // starting_direction: bit 0 = 0 (left) or 1 (right)
    const wasmDir  = heroGetDirection();
    player.direction = (wasmDir & 1) ? 1 : -1;

    proximityMap = getProximityMap();
}

// --- Rendering ---
function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!engineReady) {
        drawLifeBar();
        updateElementText('currentMapName', '');
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

    ctx.font          = `${TILE_HEIGHT}px "Press Start 2P", monospace`;
    ctx.textBaseline  = 'top';

    // Background tiles
    ctx.fillStyle = RENDER_CONFIG.tiles.default.color;
    for (let row = 0; row < VIEW_ROWS; row++) {
        let mapRow = startRow + row;
        if (mapRow >= 64) mapRow -= 64;

        for (let col = 0; col < VIEW_COLS; col++) {
            const proximityCol = startCol + col;
            const offset       = mapRow * 36 + proximityCol;
            const tileByte     = proximityMap[offset];
            ctx.fillText(String.fromCharCode(tileByte + 0x20), col * TILE_WIDTH, row * TILE_HEIGHT);
        }
    }

    // Render dungeon objects (platforms, doors, items, monsters)
    renderDungeonObjects(ctx, mdtData, mdtHeader, camX, startRow, TILE_WIDTH, TILE_HEIGHT);

    // Hero sprite
    ctx.fillStyle = RENDER_CONFIG.hero.color;
    const screenX = camX * TILE_WIDTH;
    const screenY = camY * TILE_HEIGHT;

    let heroStyle;
    if      (player.direction === 0)  heroStyle = RENDER_CONFIG.hero.standing.onRope;
    else if (player.direction === 1)  heroStyle = RENDER_CONFIG.hero.standing.facingRight;
    else                              heroStyle = RENDER_CONFIG.hero.standing.facingLeft;

    ctx.fillText(heroStyle.head, screenX, screenY + TILE_HEIGHT * 2);
    ctx.fillText(heroStyle.body, screenX, screenY + TILE_HEIGHT * 3);
    ctx.fillText(heroStyle.legs, screenX, screenY + TILE_HEIGHT * 4);

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

// ─── Save / load (unchanged) ──────────────────────────────────────────────────
function saveGame() {
    localStorage.setItem('zeliard_save_01', JSON.stringify({ player }));
    console.log('Game saved.');
}

function loadGame() {
    const data = localStorage.getItem('zeliard_save_01');
    if (!data) { console.log('No save file.'); return; }
    Object.assign(player, JSON.parse(data).player);
    console.log('Game loaded.');
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
