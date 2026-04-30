const USE_WASM_ENGINE = false;
let engineReady = false;
let gameStarted = false;

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
let RENDER_CONFIG;
let renderDungeonObjects;

async function loadWasmEngine() {
  const wasmBridge = await import('./src/zeliard-wasm.js');
  const renderConfig = await import('./src/render-config.js');
  const renderObjects = await import('./src/render-objects.js');

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
    inputGetDebugCounter
  } = wasmBridge);

  RENDER_CONFIG = renderConfig.RENDER_CONFIG;
  renderDungeonObjects = renderObjects.renderDungeonObjects;
}

        // --- Engine Configuration ---
const TILE_WIDTH = 20;
const TILE_HEIGHT = 20;
const VIEW_COLS = 28;
const VIEW_ROWS = 18;

const INTRO_FADE_IN_MS = 2000;
const INTRO_FADE_OUT_MS = 2000;
const INTRO_LOGO_SRC = 'assets/images/opdemo/ttl3_logo.png';
const INTRO_COPYRIGHT_LINES = [
  'Copyright (C)1987,1990 GAME ARTS',
  'Copyright (C)1990 Sierra On-Line',
  'Web port 2026, brox//THIRTEEN'
];

const introScreen = document.getElementById('intro-screen');
const introCanvas = document.getElementById('introCanvas');
const introCtx = introCanvas.getContext('2d');
const uiScreen = document.getElementById('ui');
const layoutWrapper = document.getElementById('layout-wrapper');

let introActive = false;
let introFrameId = 0;
let introStartTime = 0;
let introFadeOutStartTime = 0;
let introLogoImage = null;

// --- Setup Canvas ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_COLS * TILE_WIDTH;
canvas.height = VIEW_ROWS * TILE_HEIGHT;


// --- Current Map State ---
let proximityMap = null;
let cavernName = '';
let mdtData = null;
let mdtHeader = null;

// --- Game State ---
let lastTimestamp = 0; // Timestamp of last frame
let fps = 0;



// Timing
const keyDelay = 0.05;            // input timing threshold (seconds)
const TURN_DELAY = 0.15;          // direction change delay (~9 frames at 60fps)

const player = {
  x: 61, // absolute position (from the left of the map) of the player's left edge
  y: 7, // absolute position (from the top of the map) of the player's feet bottom
  direction: 1, // 1=right, -1=left, 0=onRope
};

let camX = 13;
let camY = 7;

// Calculate starting position for viewport
// Hero is at column 18 (center of 36-column proximity map)
// For 28-column viewport, start at column (36-28)/2 = 4
const startCol = 4;  // Center 28 columns in 36-column proximity map

// Calculate starting row (center vertically on hero)
// Hero is at row heroY, we want to show 9 rows above and 9 below (18 total)
const startRow = (player.y - 9 < 0) ? player.y - 9 + 64 : player.y - 9;

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  Space: false,
  Enter: false,
  Alt: false,
  Escape: false
};

const keyTimers = {
  ArrowLeft: 0,
  ArrowRight: 0,
  ArrowUp: 0,
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function startOpeningTitles() {
  introActive = true;
  introStartTime = 0;
  introFadeOutStartTime = 0;
  introCtx.imageSmoothingEnabled = false;
  introScreen.classList.remove('hidden');
  uiScreen.classList.add('hidden');
  layoutWrapper.classList.add('hidden');

  try {
    [introLogoImage] = await Promise.all([
      loadImage(INTRO_LOGO_SRC),
      document.fonts.ready
    ]).then(([logo]) => [logo]);
  } catch (error) {
    console.error(error);
    finishOpeningTitles();
    return;
  }

  introFrameId = requestAnimationFrame(drawOpeningTitle);
}

function drawOpeningTitle(timestamp) {
  if (!introActive) {
    return;
  }

  if (!introStartTime) {
    introStartTime = timestamp;
  }

  const elapsed = timestamp - introStartTime;
  const fadeInProgress = Math.min(elapsed / INTRO_FADE_IN_MS, 1);
  const fadeOutElapsed = introFadeOutStartTime ? timestamp - introFadeOutStartTime : 0;
  const pageOpacity = introFadeOutStartTime ? 1 - Math.min(fadeOutElapsed / INTRO_FADE_OUT_MS, 1) : 1;
  const logoOpacity = 0.18 + fadeInProgress * 0.82;

  introCtx.fillStyle = '#000';
  introCtx.fillRect(0, 0, introCanvas.width, introCanvas.height);

  introCtx.save();
  introCtx.globalAlpha = pageOpacity * logoOpacity;
  introCtx.drawImage(introLogoImage, 0, 0);

  drawIntroCopyrightText(pageOpacity);
  introCtx.restore();

  if (introFadeOutStartTime && fadeOutElapsed >= INTRO_FADE_OUT_MS) {
    finishOpeningTitles();
    return;
  }

  introFrameId = requestAnimationFrame(drawOpeningTitle);
}

function drawIntroCopyrightText(opacity) {
  introCtx.globalAlpha = opacity;
  introCtx.fillStyle = '#fff';
  introCtx.font = '16px "Press Start 2P", monospace';
  introCtx.textAlign = 'center';
  introCtx.textBaseline = 'top';

  const startY = 290;
  const lineHeight = 20;

  for (let i = 0; i < INTRO_COPYRIGHT_LINES.length; i++) {
    introCtx.fillText(INTRO_COPYRIGHT_LINES[i], introCanvas.width / 2, startY + i * lineHeight);
  }
}

function skipOpeningTitlePage() {
  if (!introActive || introFadeOutStartTime) {
    return;
  }

  introFadeOutStartTime = performance.now();
}

function finishOpeningTitles() {
  if (!introActive) {
    return;
  }

  introActive = false;
  cancelAnimationFrame(introFrameId);
  introScreen.classList.add('hidden');
  startGame();
}

function init() {
  startOpeningTitles();
}

async function startGame() {
  if (gameStarted) {
    return;
  }

  gameStarted = true;
  uiScreen.classList.remove('hidden');
  layoutWrapper.classList.remove('hidden');

  try {
    if (!USE_WASM_ENGINE) {
      drawLifeBar();
      requestAnimationFrame(loop);
      return;
    }

    await loadWasmEngine();
    await initWasm();

    // Initialize input buffer
    inputInit();

    // Initialize hero movement state machine
    heroMovementInit();

    // Initialize combat system
    combatInit();

    const response = await fetch('WORK/MP10.MDT');
    mdtData = new Uint8Array(await response.arrayBuffer());
    loadMdt(mdtData);

// Muralla -> Malicia:
// hero_y_rel = 0x3d
// byte_C3 = 0
// place_map_id = 0 // cavern id
// load mp10.mdt
// hero_x_minus_18_abs = 0x2d
// entered_cavern_first_time = 0xFF
    townToDungeonTransition(0x2d, 0x3d, 0, 0);

    cavernName = getCavernName();
    console.log('Cavern name:', cavernName);

    mdtHeader = getMdtHeader();
    console.log('MDT Header:', mdtHeader);
    console.log(`Monsters at: 0x${mdtHeader.monsters_offset.toString(16)}`);
    console.log(`Cavern name info at: 0x${mdtHeader.cavern_name_offset.toString(16)}`);

    // Check if this is a boss cavern (MDT header bit 1)
    const mdtHeaderByte = mdtData[0];
    const isBossCavern = (mdtHeaderByte & 0x02) !== 0;
    
    if (isBossCavern) {
      console.log('Boss cavern detected!');
      initBossBattle();
    }

    // Unpack the map centered at hero position
    console.log(`Unpacking map centered at hero (x=${player.x}, y=${player.y})...`);
    // unpack_map_internal(player.x, player.y);

    // Initialize hero position in WASM save data
    // hero_x_minus_18_abs = player.x (absolute position from left of map)
    // hero_y_rel = player.y (Y position relative to viewport)
    // hero_x_in_viewport = 16 (center of 36-column proximity map)
    // hero_head_y_in_viewport = calculated from player.y
    // setHeroPosition(player.x, player.y);
    
    // Also set the viewport position
    const heroPos = getHeroPosition();
    console.log('Hero position after init:', heroPos);
    
    // Start the game loop only after initialization is complete
    engineReady = true;
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
  }
}


// --- Input Handling ---
window.addEventListener('keydown', e => {
  if(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code))
    e.preventDefault();

  if (introActive && e.code === 'Space') {
    skipOpeningTitlePage();
    return;
  }

  // Update key state
  if(e.code === 'Space') keys.Space = true;
  if(e.code === 'AltLeft' || e.code === 'AltRight') keys.Alt = true;
  if(e.code === 'Enter') keys.Enter = true;
  if(e.code === 'Escape') keys.Escape = true;
  if(e.code === 'ArrowUp') keys.ArrowUp = true;
  if(e.code === 'ArrowDown') keys.ArrowDown = true;
  if(e.code === 'ArrowLeft') keys.ArrowLeft = true;
  if(e.code === 'ArrowRight') keys.ArrowRight = true;

  if (engineReady) {
    // Send input to WASM
    const bitmask = buildInputBitmask(keys);
    const counterBefore = inputGetDebugCounter();
    inputSetKeys(bitmask);
    const counterAfter = inputGetDebugCounter();
    console.log('Keydown:', e.code, '| Counter:', counterBefore, '->', counterAfter);
  }
});

window.addEventListener('keyup', e => {
  // Update key state
  if(e.code === 'Space') keys.Space = false;
  if(e.code === 'AltLeft' || e.code === 'AltRight') keys.Alt = false;
  if(e.code === 'Enter') keys.Enter = false;
  if(e.code === 'Escape') keys.Escape = false;
  if(e.code === 'ArrowUp') keys.ArrowUp = false;
  if(e.code === 'ArrowDown') keys.ArrowDown = false;
  if(e.code === 'ArrowLeft') keys.ArrowLeft = false;
  if(e.code === 'ArrowRight') keys.ArrowRight = false;

  if (engineReady) {
    // Send input to WASM
    const bitmask = buildInputBitmask(keys);
    const counterBefore = inputGetDebugCounter();
    inputSetKeys(bitmask);
    const counterAfter = inputGetDebugCounter();
    console.log('Keyup:', e.code, '| Counter:', counterBefore, '->', counterAfter);
  }
});

function updateElementText(elementId, value) {
  const el = document.getElementById(elementId);
  if (el && value) {
    el.textContent = value;
  }
}

// --- UI Functions ---
let lifeFillCurrentEl = null;
let lifeFillMaxEl = null;

function drawLifeBar() {
  lifeFillCurrentEl = document.querySelector('.life-fill-current');
  lifeFillMaxEl = document.querySelector('.life-fill-max');
  setLife(10, 30);
}

function setLife(currentLife, maxLife) {
  if (lifeFillCurrentEl && lifeFillMaxEl) {
    const maxPercent = maxLife; // lifeMax=25 means 25% width
    const currentPercent = currentLife; // life=20 means 20% width
    lifeFillMaxEl.style.width = maxPercent + '%';
    lifeFillCurrentEl.style.width = currentPercent + '%';
  }
}

// --- Physics Update ---
let frameCount = 0;

function update() {
  if (!engineReady) {
    return;
  }

  // Update input state (compute edge-triggered inputs)
  inputUpdate();

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
  const wasmDirection = heroGetDirection();
  player.direction = (wasmDirection & 1) ? 1 : -1;
  
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

    // Press Start 2P is naturally very wide, almost square.
    ctx.font = `${TILE_HEIGHT}px "Press Start 2P", monospace`;
    ctx.textBaseline = 'top';

    // Draw Map (background tiles)
    ctx.fillStyle = RENDER_CONFIG.tiles.default.color;
    for (let row = 0; row < VIEW_ROWS; row++) {
      let mapRow = startRow + row;
      if (mapRow >= 64) mapRow -= 64;

      for (let col = 0; col < VIEW_COLS; col++) {
        const proximityCol = startCol + col;
        const offset = mapRow * 36 + proximityCol;
        const tileByte = proximityMap[offset];

        // Convert to ASCII: add 0x20
        const asciiChar = String.fromCharCode(tileByte + 0x20);
        ctx.fillText(asciiChar, col * TILE_WIDTH, row * TILE_HEIGHT);
      }
    }

    // Render dungeon objects (platforms, doors, items, monsters)
    renderDungeonObjects(ctx, mdtData, mdtHeader, camX, startRow, TILE_WIDTH, TILE_HEIGHT);

    // Draw Hero (3 Vertical Characters in normal mode, 2 in squat mode)
    ctx.fillStyle = RENDER_CONFIG.hero.color;
    const screenX = camX * TILE_WIDTH;
    const screenY = camY * TILE_HEIGHT;

    // Get hero state from WASM
    const heroState = heroGetState();
    const isMoving = heroIsMoving();
    
    // Select hero sprite based on state and direction
    let heroStyle;
    
    // For now, use direction-based standing sprites
    // TODO: Add full state-based rendering (jumping, climbing, squatting, falling)
    if (player.direction === 0) {
        heroStyle = RENDER_CONFIG.hero.standing.onRope;
    } else if (player.direction === 1) {
        heroStyle = RENDER_CONFIG.hero.standing.facingRight;
    } else {
        heroStyle = RENDER_CONFIG.hero.standing.facingLeft;
    }
    
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

// --- Debug: slow down to ~10 FPS ---
// const targetFPS = 20;
// const frameDelay = 1000 / targetFPS;
// let lastFrameTime = 0;

function loop(timestamp) {
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    if (dt > 0) {
        fps = Math.round(1000 / dt);
    }

    update(); //updates the world state
    draw(); //draws the current world state
    requestAnimationFrame(loop); // syncs with display refresh rate
}

function saveGame() {
    const gameState = {
        player: {
            x: player.x,
            y: player.y,
            direction: player.direction,
            // add other stats like health/inventory here
        },
        // If your map changes (broken blocks, etc.), save it too:
        // map: map 
    };
    
    localStorage.setItem('zeliard_save_01', JSON.stringify(gameState));
    console.log("Game Saved to LocalStorage!");
}

function loadGame() {
    const savedData = localStorage.getItem('zeliard_save_01');
    if (!savedData) {
        console.log("No save file found.");
        return;
    }

    const data = JSON.parse(savedData);
    
    // Restore player state
    Object.assign(player, data.player);
    
    // If you saved the map:
    // map = data.map;

    console.log("Game Loaded!");
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
// Trigger it via a button:
// document.getElementById('fileInput').click();

init();
