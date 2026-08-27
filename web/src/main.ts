/**
 * main.ts — Zeliard web port composition root.
 *
 * Indoor activities moved to separate modules. A generic menu/dialog
 * system is used by Sage and can be reused by other buildings.
 */
import { OpeningIntro }  from './scenes/opening-intro.js';
import { EndingDemo }    from './scenes/ending-demo.js';
import { KingScene }     from './scenes/indoor-king.js';
import { PrincessScene } from './scenes/indoor-princess.js';
import { SageScene }     from './scenes/indoor-sage.js';
import { WeaponShopScene } from './scenes/indoor-weapon-shop.js';
import { WitchcraftShopScene } from './scenes/indoor-magic-shop.js';
import { ChurchScene }   from './scenes/indoor-church.js';
import { BankScene }     from './scenes/indoor-bank.js';
import { InnScene }      from './scenes/indoor-inn.js';
import { SaveDialog, RestoreDialog } from './ui/save-restore.js';
import { ImportExportDialog } from './ui/import-export.js';
import { InventoryScreen } from './ui/inventory-screen.js';
import { SoundManager } from './audio/sound-manager.js';
import {
    getSaveSlotNames,
    saveGameToSlot,
    deleteGameFromSlot,
    loadGameFromSlot,
    saveGame,
    loadGame,
} from './platform/save.js';
import { keys, setKeyState } from './input/key-state.js';
import { KeyRouter, KeyEdgeLatches, PREVENT_DEFAULT_CODES } from './input/key-router.js';
import { initTouchControls, detectTouchDevice } from './input/touch-input.js';
import { drawSheetFrame } from './render/sheets.js';
import { setupGameCanvas } from './render/canvas.js';
import {
    initTownRenderer,
    parseTownNpcCategory,
    getTownNpcCategory,
    resetTownScrollOffsets,
    scrollFloorOneTileRight,
    scrollFloorOneTileLeft,
    scrollCeilingHalfTileRight,
    scrollCeilingHalfTileLeft,
    updateTownAnimation,
    drawTownBackground,
    drawTownCeiling,
    drawTownSidewalk,
    drawTownTiles,
    drawTownHero,
    drawTownNpcs,
} from './render/town.js';
import {
    initDungeonRenderer,
    resolveFullTickWaiters,
    bumpRenderCounter,
    drawDungeonTiles,
    animateDungeonTiles,
    drawDungeonProjectiles,
    drawDungeonMagicProjectiles,
    drawDungeonEntities,
    drawDungeonMagiaStones,
    drawDungeonHero,
    drawDungeonSword,
    drawDungeonNotification,
    drawDungeonSign,
    beginRokaRunFrame,
    drawDungeonRoka,
    drawEncounterText,
    drawGuerraOverlay,
    maybeStartGuerraEffect,
} from './render/dungeon.js';
import {
    TILE_SIZE, VIEW_WIDTH,
    RUN_TOWN_ENTRY_ON_START, RETURN_BEFORE_TOWN_MAIN_LOOP, STDPLY_PATH,
    TOWN_MDTS,
} from './config/engine.js';
import {
    DUNGEON_DCHR_SHEET_PATH, DUNGEON_MAGIC_SHEET_PATH, DUNGEON_HERO_SHEET_PATH, DUNGEON_SWORD_SHEET_PATH,
    PATTERN_ASSETS, SWORD_REACH_SMALL, SWORD_REACH_MEDIUM, SWORD_REACH_LARGE,
    TOWN_BACKGROUND_YMPD_PATH, TOWN_SIDEWALK1_YMPD_PATH, TOWN_SIDEWALK2_YMPD_PATH,
    TOWN_BACKGROUND_CKPD_PATH, TOWN_BACKGROUND0_CKPD_PATH, TOWN_SIDEWALK1_CKPD_PATH, TOWN_SIDEWALK2_CKPD_PATH,
    ROKA_IMAGE_PATHS, DMAN_SHEET_PATH, TEAR_BLUE_PATH, TEAR_RED_PATH,
    SPARKLE_48_PATH, SPARKLE_WIDE_PATH, ENCOUNTER_IMAGE_PATH, TEAR_SLOTS_BLUE,
    TEAR_SLOT_RED, TEAR_FLAGS, HERO_SPRITE_PATH,
    ITEMP_SWORD_IMAGE_PATHS,
    ITEMP_SHIELD_IMAGE_PATHS, ITEMP_MAGIC_IMAGE_PATHS, NPC_SPRITE_PATHS,
} from './data/assets.js';

import { IndoorSceneBase } from './core/indoor-scene-base.js';
import { Hud } from './ui/hud.js';
import { ModalManager } from './ui/modal-manager.js';
import { SpeedChangeDialog, displayedSpeed } from './core/speed-change.js';
import {
    RokaDemo,
    ROKADEMO_CENTER_DX, ROKADEMO_HERO_Y, ROKADEMO_TEAR_CENTER,
    SWORD_VISIBLE_STATES,
    rokademoSwordFrame, rokademoSlotCenter, rokademoLandCenter,
    DMAN_FRAME_W, DMAN_FRAME_H, DMAN_SHEET_COLS,
} from './core/roka-demo.js';
import { ConversationManager, readNpcConversationBytes } from './core/conversation.js';
import { parseDialogText as parseDialogTextImpl } from './core/conversation-text.js';
import { layoutConversationBox, drawConversationBox } from './ui/conversation-draw.js';
import {
    computeTownScrollFromAbsoluteX,
    encodeBossState,
    getTownMapWidth,
    resolveMusicTrack,
} from './core/transitions.js';
import { downloadSaveFile, pickSaveFile } from './platform/save-file.js';

// Save persistence lives in platform/save.ts. These exports preserve the
// legacy public module contract used by older UI modules/tools.
export {
    getSaveSlotNames,
    saveGameToSlot,
    deleteGameFromSlot,
    loadGameFromSlot,
    saveGame,
    loadGame,
};

// ─── Engine / Canvas config ───────────────────────────────────────────────────
import { DUNGEONS } from './data/dungeons.js';




import {
    ADDR_BYTE4, ADDR_CALIENTE_ITEMS, ADDR_FALTER_ITEMS, ADDR_DEATH_ALREADY_PROCESSED, ADDR_PROXIMITY_MAP_LEFT_COL,
    ADDR_HERO_X_VIEW, ADDR_SWORD_TYPE, ADDR_ELF_CREST, ADDR_TEAR_COUNT, ADDR_FACING, ADDR_PLACE_MAP_ID, ADDR_LAST_SAGE_VISITED,
    ADDR_BOSS_STATE_BLOCK, ADDR_BOSS_PLACEMENT, ADDR_HERO_X_IN_PROXIMITY_MAP, ADDR_BOSS_STATE_PTR, ADDR_TEAR_X,
    ADDR_FRAME_TIMER, ADDR_SPACEBAR_LATCH, ADDR_ALTKEY_LATCH, ADDR_SPEED_CONST, ADDR_SOUND_FX_REQUEST, ADDR_HEARTBEAT_VOLUME,
    ADDR_DUNGEON_STATE, ADDR_DUNGEON_FRAME_PHASE, ADDR_RENDER_REQUEST, ADDR_RENDER_DONE, ADDR_GOLD_RENDER_REQUEST,
    ADDR_DEATH_COUNTER, ADDR_ALMAS_RENDER_REQUEST, ADDR_HEALTH_BAR_REQUEST, ADDR_SHIELD_HP_RENDER_REQUEST,
    ADDR_ROKA_COLOR, ADDR_BOSS_HEALTH_REQUEST, ADDR_BOSS_MODE, ADDR_MAGIC_LEFT_RENDER_REQUEST, ADDR_SWORD_RENDER_REQUEST,
    ADDR_SWORD_GFX_RELOAD_REQUEST, ADDR_DUNGEON_EXIT_FLAG, ADDR_HERO_DEATH_FLAG, ADDR_PENDING_TRANSITION_FLAG,
    ADDR_BUILDING_ACTIVE, ADDR_BUILDING_DEST_ID, ADDR_PENDING_DUNGEON_MAP, ADDR_PENDING_DUNGEON_FLAG, DUNGEON_STATE_DEATH_FALL,
    DUNGEON_STATE_DEATH_FADE, DUNGEON_STATE_BOSS_ENCOUNTER, DUNGEON_STATE_ROKA_RUN, DUNGEON_STATE_ROKADEMO,
} from './core/memory.js';

// ─── TS-owned memory buffer (replaces WASM linear memory) ────────────────────
import {
    getGmem, loadSaveState as tsLoadSaveState,
    loadMdtToBuffer, setSpecialTileListToBuffer, setDungeonSwordReachToBuffer,
    setDungeonPassableTilesToBuffer, setDungeonSlopeTilesLeftToBuffer,
    setDungeonSlopeTilesRightToBuffer, setDungeonAggressiveGroundToBuffer,
    setDungeonAirflowsToBuffer, setDungeonMonsterXpToBuffer,
    setDungeonMonsterDamageToBuffer, setDeathDescriptorsToBuffer,
    setTrajectoriesToBuffer,
    gMemAt, readU8 as tsReadU8, readU16 as tsReadU16,
    readMemory as tsReadMemory, writeMemory as tsWriteMemory,
} from './core/ts-memory.js';


// ─── Engine imports (direct TS calls, no dispatch layer) ──────────────────────
import {
    townInit,
    townUpdate,
    townFullTick,
    townEntryDisablingEdgeScroll,
    townSetReturnBeforeMainLoop,
    townCompleteTransition,
    townBuildingFinish,
    townConversationFinish,
    initC015ObjIfExists,
    installTownHooks,
} from './engine/town.js';
import {
    dungeonRuntimeStatics,
    resetDungeonRuntimeState,
} from './engine/dungeon-runtime.js';
import { setInputKeys } from './engine/input.js';
import { keyStateToBitmask } from './core/memory.js';
import { getViewportTop, clearRenderRequest } from './engine/dungeon-state.js';
import { dungeonFullTick } from './engine/dungeon-tick.js';
import {
    makeDungeonUpdate,
    makeDungeonInit,
    makeFinishRokademoTransition,
} from './engine/dungeon-cutover.js';
import {
    getTownName as tsGetTownName,
    getCavernName as tsGetCavernName,
    getMusicTrackId as tsGetMusicTrackId,
    getTownBackgroundType as tsGetTownBackgroundType,
    getTownPatId as tsGetTownPatId,
} from './engine/mdt.js';

// ─── Memory accessors (set by ts-memory init block below) ────────────────────
let getWasmMemory: any;
let readMemory: any;
let writeMemory: any;
let getTownPendingTransitionFlag: any;
let getTownPendingTransition: any;
let getBossName: any;

// ─── Cutover functions (direct TS engine calls, no dispatch indirection) ─────
const g = (): Uint8Array => getGmem();
const dungeonUpdateFn = makeDungeonUpdate(g);
const dungeonInitFn = makeDungeonInit(g);
const finishRokademoFn = makeFinishRokademoTransition(g);

let engineReady  = false;
let gameStarted  = false;

// Memory accessors backed by TS-owned buffer (no WASM needed)
readMemory = tsReadMemory;
writeMemory = tsWriteMemory;

// g_mem readers — direct byte access, no allocation
getWasmMemory = getGmem;

// Pending-transition reads from g_mem scratch bytes
getTownPendingTransitionFlag = (): number => gMemAt(0xfff4);
getTownPendingTransition = () => ({
    mapId: gMemAt(0xfff1),
    patId: gMemAt(0xfff2),
    goingLeft: gMemAt(0xfff3) !== 0,
});
getBossName = (): string => {
    const ptr = tsReadU16(0xA002); // ADDR_BOSS_STATE_PTR
    const namePtr = ptr + 11;
    // Pascal string: length byte + chars
    const len = gMemAt(namePtr);
    let s = '';
    for (let i = 0; i < len; i++) {
        s += String.fromCharCode(gMemAt(namePtr + 1 + i));
    }
    return s;
};

let restoreName: string | null = null;
let gameMode = 'town';
let townEntryRan = false;
let townBackgroundType: number | null = null;
let townPatId: number | null = null;
let townBackground: HTMLImageElement | null = null;
let townBackgroundReady = false;
let townCeiling: HTMLImageElement | null = null;
let townCeilingReady = false;
let townTileSheet: HTMLImageElement | null = null;
let townTileSheetReady = false;
let townSidewalk1: HTMLImageElement | null = null;
let townSidewalk1Ready = false;
let townSidewalk2: HTMLImageElement | null = null;
let townSidewalk2Ready = false;
let heroSprite: HTMLImageElement | null = null;
let heroSpriteReady = false;
let dungeonTileSheet: HTMLImageElement | null = null;
let dungeonTileSheetReady = false;
let dungeonAI: Uint8Array | null = null;
let dungeonAIready = false;
let dungeonProjectiles: Uint8Array | null = null;
let dungeonDchrSheet: HTMLImageElement | null = null;
let dungeonDchrSheetReady = false;
let dungeonEntitySheet: HTMLImageElement | null = null;
let dungeonEntitySheetReady = false;
let dungeonMagicSheet: HTMLImageElement | null = null;
let dungeonMagicSheetReady = false;
let dungeonHeroSheet: HTMLImageElement | null = null;
let dungeonHeroSheetReady = false;
let dungeonSwordSheet: HTMLImageElement | null = null;
let dungeonSwordSheetReady = false;

const rokaImages: HTMLImageElement[] = [];
let rokaImagesReady = false;
let encounterImg: HTMLImageElement | null = null;

let prevDungeonState = -1;
let encounterAnim: any = null;

// ─── Rokademo (tear-collection demo) asset state ──────────────────────────────
let dmanSheet: HTMLImageElement | null = null;
let dmanSheetReady = false;
let tearBlueImg: HTMLImageElement | null = null;
let tearRedImg: HTMLImageElement | null = null;
let sparkle48Img: HTMLImageElement | null = null;
let sparkleWideImg: HTMLImageElement | null = null;
let rokademo: InstanceType<typeof RokaDemo> | null = null;            // active demo state machine (null when idle)
let rokademoHold = false;       // keep showing the roka bg until the post-demo transition starts
let lastTearOverlayCount = -1;

// ─── NPC sprite state ─────────────────────────────────────────────────────────
const npcSprites: Record<number, HTMLImageElement[]> = {
    0: [], // mman cache
    1: []  // cman cache
};
// ─── Indoor scene manager ─────────────────────────────────────────────────────
let indoorActiveScene: IndoorSceneBase | null = null;   // active indoor scene

const TOWN_DOORS: Record<number, { name: string; scene: new (context: any) => IndoorSceneBase & { getName?: () => string } }> = {
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
    7: {
        name: 'The Inn',
        scene: InnScene,
    },
    // 8: Cavern (implemented differently)
};

const modalManager = new ModalManager(); // save/restore/import-export dialogs
let gamePaused = false;          // freeze game updates while modal is open
let inventoryScreenInstance: InventoryScreen | null = null;

function openInventory() {
    if (inventoryScreenInstance || !engineReady) return;
    if (modalManager.isActive || indoorActiveScene || openingIntro.active || endingDemo.active) return;
    if (gameMode !== 'town' && gameMode !== 'dungeon') return;

    gamePaused = true;

    inventoryScreenInstance = new InventoryScreen({
        canvas: canvas as HTMLCanvasElement, ctx, readMemory, writeMemory,
        soundManager,
        onExit: closeInventory,
    });

    if (inventoryScreenInstance.ready) {
        inventoryScreenInstance.enter();
    } else {
        inventoryScreenInstance.loadAssets().then(() => {
            if (inventoryScreenInstance) inventoryScreenInstance.enter();
        });
    }
}

function closeInventory() {
    if (!inventoryScreenInstance) return;
    inventoryScreenInstance = null;
    gamePaused = false;
    renderMagicHud();
}

// ─── Sound Manager ────────────────────────────────────────────────────────────
const SFX_IDS = [
     1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 
    33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 
    49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 
    65, 66, 67,
];
const MUSIC_TRACKS = ['mgt1', 'encounter', 'tear'];

const soundManager = new SoundManager({
    workletPath:   'pit-worklet.js',
    sfxBasePath:   'assets/sfx/',
    musicBasePath: 'assets/music/',
    sfxIds:        SFX_IDS,
    musicTracks:   MUSIC_TRACKS,
    onFullTick:    onFullTick,
    onSlowTick:    onSlowTick,
});

const SETTINGS_PREFIX = 'zeliard_';
let musicEnabled = localStorage.getItem(`${SETTINGS_PREFIX}music`) === 'on';
let sfxEnabled = localStorage.getItem(`${SETTINGS_PREFIX}sfx`) !== 'off';
let currentMusicTrack: number | string | null = null;

function playCurrentMusic(fadeDuration = 1.5): void {
    if (!currentMusicTrack) return;
    soundManager.playMusic(currentMusicTrack as string, fadeDuration);
    soundManager.setMusicMuted?.(!musicEnabled, 0);
}

function setCurrentMusicTrack(trackId: number | string): void {
    if (trackId === currentMusicTrack) return;
    currentMusicTrack = trackId as number;
    playCurrentMusic();
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    localStorage.setItem(`${SETTINGS_PREFIX}music`, musicEnabled ? 'on' : 'off');
    soundManager.setMusicMuted?.(!musicEnabled, 0.25);

    console.log(`Music ${musicEnabled ? 'ON' : 'OFF'}`);
}

function toggleSfx() {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem(`${SETTINGS_PREFIX}sfx`, sfxEnabled ? 'on' : 'off');
    soundManager.setSfxMuted?.(!sfxEnabled, 0.25);

    console.log(`SFX ${sfxEnabled ? 'ON' : 'OFF'}`);
}

// ─── PIT tick callbacks ───────────────────────────────────────────────────────
function onFullTick() {
    if (gamePaused) return;
    resolveFullTickWaiters();
    frameTimer  = (frameTimer  + 1) & 0xFF;
    tickCounter = (tickCounter + 1) & 0xFFFF;
    animTimer   = (animTimer   + 1) & 0xFFFF;
    if (gameMode === 'dungeon') {
        dungeonFullTick(g());
    }
    else townFullTick(g());

    if (engineReady) {
        setInputKeys(g(), keyStateToBitmask(keys));  // refresh input at 236 Hz before any dungeonUpdate reads it
        const speedC     = gMem(ADDR_SPEED_CONST) || 5;
        const target     = speedC * 4;
        const frameTmr   = gMem(ADDR_FRAME_TIMER);
        if (gameMode === 'dungeon') {
            // Bypass the speed gate during roka run so the 8-bit ADDR_FRAME_TIMER wraparound 
            // doesn't starve dungeonUpdate() and cause frame skips
            const isRokaRun = gMem(ADDR_DUNGEON_STATE) === DUNGEON_STATE_ROKA_RUN;
            if (isRokaRun || frameTmr >= target) {
                const phaseBefore = readU8(ADDR_DUNGEON_FRAME_PHASE);
                dungeonUpdateFn();
                // mirrors `inc render_counter` in Refresh_Dirty_Tiles: advance once
                // per completed dungeon frame. The WASM phase machine splits each
                // frame into 3 sub-steps (0→1→2→0), so dungeonUpdate() is called 3x
                // per frame; only step phase 2→0 finishes a frame
                if (isRokaRun || (phaseBefore === 2 && readU8(ADDR_DUNGEON_FRAME_PHASE) === 0)) {
                    bumpRenderCounter();
                }
                if (gMem(ADDR_DUNGEON_EXIT_FLAG) === 0xFF) {
                    if (gMem(ADDR_HERO_DEATH_FLAG) === 0xFF) {
                        initTownFromDungeon(gMem(ADDR_LAST_SAGE_VISITED), true);
                    } else {
                        initTownFromDungeon(gMem(ADDR_PLACE_MAP_ID), false);
                    }
                } else if (gMem(ADDR_PENDING_DUNGEON_FLAG) === 0xFF) {
                    dungeonTileSheetReady = false;
                    dungeonEntitySheetReady = false;
                    const pendingMap = gMem(ADDR_PENDING_DUNGEON_MAP);
                    handleDungeonTransition(pendingMap, false);
                }
            }
        } else if (frameTmr >= target) { // town mode
            townUpdate(g());
            const scrollFlag = gMem(0xfff0);
            if (scrollFlag) {
                if (scrollFlag & 0x01) scrollFloorOneTileRight();
                if (scrollFlag & 0x02) scrollFloorOneTileLeft();
                if (scrollFlag & 0x04) scrollCeilingHalfTileRight();
                if (scrollFlag & 0x08) scrollCeilingHalfTileLeft();
                writeMemory(0xfff0, Uint8Array.of(0));
            }
            const pendingTransitionFlag = getTownPendingTransitionFlag?.();
            if (pendingTransitionFlag === 0xFF) {
                const transition = getTownPendingTransition?.();
                if (transition) {
                    writeMemory(ADDR_PENDING_TRANSITION_FLAG, Uint8Array.of(0));
                    handleTownTransition(transition);
                }
            }
            if (gMem(ADDR_PENDING_DUNGEON_FLAG) === 0xFF) {
                const pendingMap = gMem(ADDR_PENDING_DUNGEON_MAP);
                handleDungeonTransition(pendingMap, true);
            }
            checkBuildingRequest();
        }
    }
}

function onSlowTick() {
    if (gamePaused) return;
    if (!engineReady) return;

    inputLatches.update(!!keys.Space, !!keys.Alt);
    setInputKeys(g(), keyStateToBitmask(keys));

    if (gameMode === 'dungeon') return;

    if (!conversation.active) {
        const activeFlag = gMem(0xFFF5);
        if (activeFlag) {
            startConversationFromWasm();
        }
    }

    if (conversation.active) {
        // Direction edges share state with the dungeon input path above.
        const dirUp = !!keys.ArrowUp && !lastDirUp;
        const dirDown = !!keys.ArrowDown && !lastDirDown;
        lastDirUp = !!keys.ArrowUp;
        lastDirDown = !!keys.ArrowDown;
        conversation.handleTick(dirUp, dirDown);
        return;
    }

    const scrollFlag = gMem(0xfff0);
    if (scrollFlag) {
        if (scrollFlag & 0x01) scrollFloorOneTileRight();
        if (scrollFlag & 0x02) scrollFloorOneTileLeft();
        if (scrollFlag & 0x04) scrollCeilingHalfTileRight();
        if (scrollFlag & 0x08) scrollCeilingHalfTileLeft();
        writeMemory(0xfff0, Uint8Array.of(0));
    }
}

// ─── Input ────────────────────────────────────────────────────────────────────
// Key state lives in input/key-state.ts; DOM handlers here only route events.
let lastDirUp = false;
let lastDirDown = false;

const keyRouter = new KeyRouter({
    // state
    modalActive: () => modalManager.isActive,
    inventoryOpen: () => !!inventoryScreenInstance,
    introActive: () => openingIntro.active,
    endingActive: () => endingDemo.active,
    indoorScene: () => indoorActiveScene,
    speedDialog: () => speedDialog,
    engineReady: () => engineReady,
    gamePaused: () => gamePaused,
    gameMode: () => gameMode,
    conversationActive: () => conversation.active,

    // commands
    toggleMusic,
    toggleSfx,
    openRestoreModal,
    openImportExportModal,
    startSpeedChange,
    cancelSpeedChange,
    finishSpeedChange,
    speedBeginSelect: () => speedDialog.beginSelect(),
    setSpeedDigit: (digit) => {
        writeMemory(ADDR_SPEED_CONST, Uint8Array.of(10 - digit));
        writeMemory(ADDR_SOUND_FX_REQUEST, Uint8Array.of(1));
    },
    openInventory,
    setKey: setKeyState,
    resetInventoryCombo: () => inventoryScreenInstance?.resetDebugCombo(),
    modalHandleKey: (code, now) => modalManager.handleKey(code, now),
    inventoryHandleKey: (code, ctrl, shift, repeat) =>
        inventoryScreenInstance!.handleKey(code, ctrl, shift, repeat),
    introSkipPage: () => openingIntro.skipPage(),
    endingSkipPage: () => endingDemo.skipPage(),
});

window.addEventListener('keydown', e => {
    if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
    const consumed = keyRouter.keyDown(
        { code: e.code, repeat: e.repeat, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey },
        performance.now(),
    );
    if (consumed) e.preventDefault();
});

window.addEventListener('keyup', e => {
    keyRouter.keyUp({ code: e.code, repeat: e.repeat, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
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
        installEngineRuntimeHooks();

        if (getWasmMemory) {
            soundManager.setWasmMemAccessor(getWasmMemory);
        }

        townInit(g());
        resetDungeonRuntimeState();

        let saveState: Uint8Array | null = null;
        if (!restoreName) {
            const resp = await fetch(STDPLY_PATH);
            if (!resp.ok) {
                throw new Error(`Failed to load ${STDPLY_PATH}: ${resp.status}`);
            }
            saveState = new Uint8Array(await resp.arrayBuffer());
        } else {
            saveState = loadGame();
        }
        tsLoadSaveState(saveState as Uint8Array);
        // ADDR_HEARTBEAT_VOLUME (0xFF08) lives outside the save area, so it
        // survives a restore with the stale dungeon value and would keep the
        // boss-heartbeat loop going in town. Clear it here; the dungeon code
        // (update_boss_heartbeat_volume) recomputes it on the next frame.
        writeMemory(ADDR_HEARTBEAT_VOLUME, Uint8Array.of(0));
        lastTearOverlayCount = -1;
        syncTearOverlay();
        const placeId = ((saveState as Uint8Array)[ADDR_PLACE_MAP_ID] ?? 0) & 0x7f;
        const mdtPath = TOWN_MDTS[placeId]!;

        const response = await fetch(mdtPath);
        if (!response.ok) {
            throw new Error(`Failed to load ${mdtPath}: ${response.status}`);
        }
        mdtData = new Uint8Array(await response.arrayBuffer());
        loadMdtToBuffer(mdtData);

        townBackgroundType = numOrNull(tsGetTownBackgroundType(mdtBytes()));
        await loadTownBackground();
        await loadTownCeiling();
        await loadTownSidewalk1();
        await loadTownSidewalk2();
        resetTownScrollOffsets();

        townPatId = numOrNull(tsGetTownPatId(mdtBytes()));
        const pattern = (PATTERN_ASSETS as Record<number, { imagePath: string; specialTiles: number[]; animatedTilesSeq: number[][] }>)[townPatId as number];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileListToBuffer(pattern.specialTiles);
            updateTownAnimation();
        } else {
            console.warn(`Unknown pattern ID ${townPatId}, movement may be blocked`);
        }        
        await loadHeroTownSprite();
        await loadSwordIcons();
        await loadShieldIcons();
        await loadMagicIcons();
        await loadRokaImages();
        await loadEncounterImage();
        await loadRokademoAssets();

        parseTownNpcCategory();
        await Promise.all(
            NPC_SPRITE_PATHS[getTownNpcCategory()]!.map((_, index) => loadNpcSprite(index))
        );
        if (RUN_TOWN_ENTRY_ON_START) {
            townSetReturnBeforeMainLoop(g(), RETURN_BEFORE_TOWN_MAIN_LOOP);
            townEntryDisablingEdgeScroll(g());
            townEntryRan = true;
        }

        const trackId = resolveMusicTrack(tsGetMusicTrackId(mdtBytes()));
        if (trackId) setCurrentMusicTrack(trackId);

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

function loadTownTileSheet(tileSheetPath: string): Promise<HTMLImageElement | null> {
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

function loadNpcSprite(spriteId: number): Promise<HTMLImageElement | null> {
    if (npcSprites[getTownNpcCategory()]?.[spriteId]) {
        return Promise.resolve(npcSprites[getTownNpcCategory()]?.[spriteId] ?? null);
    }
    const path = NPC_SPRITE_PATHS[getTownNpcCategory()]?.[spriteId];
    if (!path) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            npcSprites[getTownNpcCategory()]![spriteId] = img;
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load NPC sprite ${path}`));
        img.src = path;
    });
}

async function loadRokaImages() {
    if (rokaImagesReady) return Promise.resolve(rokaImages);
    const loads = ROKA_IMAGE_PATHS.map((path, index) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(((img: HTMLImageElement) => { rokaImages[index] = img; return img; }) as (value: unknown) => HTMLImageElement);
    });
    await Promise.all(loads);
    rokaImagesReady = true;
    return rokaImages;
}

async function loadRokademoAssets() {
    if (dmanSheetReady) return;
    await Promise.all([
        loadImageOnce(DMAN_SHEET_PATH,   (img: HTMLImageElement) => { dmanSheet = img; }),
        loadImageOnce(TEAR_BLUE_PATH,    (img: HTMLImageElement) => { tearBlueImg = img; }),
        loadImageOnce(TEAR_RED_PATH,     img => { tearRedImg = img; }),
        loadImageOnce(SPARKLE_48_PATH,   (img: HTMLImageElement) => { sparkle48Img = img; }),
        loadImageOnce(SPARKLE_WIDE_PATH, (img: HTMLImageElement) => { sparkleWideImg = img; }),
    ]);
    dmanSheetReady = true;
}

function loadEncounterImage() {
    if (encounterImg) return Promise.resolve(encounterImg);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { encounterImg = img; resolve(img); };
        img.onerror = () => reject(new Error(`Failed to load ${ENCOUNTER_IMAGE_PATH}`));
        img.src = ENCOUNTER_IMAGE_PATH;
    });
}

function loadImageOnce(path: string, setter: (img: HTMLImageElement) => void): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { setter(img); resolve(img); };
        img.onerror = () => reject(new Error(`Failed to load ${path}`));
        img.src = path;
    });
}

async function loadDungeonAssets(rawMapId: number): Promise<void> {
    const loads: Array<Promise<unknown>> = [];
    if (!dungeonAIready) {
        dungeonAI = DUNGEONS[rawMapId]!.ai as Uint8Array;
        dungeonAIready = true;
        dungeonProjectiles = DUNGEONS[rawMapId]!.projectiles as unknown as Uint8Array;
    }
    if (!dungeonTileSheetReady) {
        loads.push(loadImageOnce(DUNGEONS[rawMapId]!.tilesheetPath, (img: HTMLImageElement) => {
            dungeonTileSheet = img;
            dungeonTileSheetReady = true;
        }));
    }
    if (!dungeonDchrSheetReady) {
        loads.push(loadImageOnce(DUNGEON_DCHR_SHEET_PATH, (img: HTMLImageElement) => {
            dungeonDchrSheet = img;
            dungeonDchrSheetReady = true;
        }));
    }
    if (!dungeonEntitySheetReady) {
        loads.push(loadImageOnce(DUNGEONS[rawMapId]!.entitySheetPath, (img: HTMLImageElement) => {
            dungeonEntitySheet = img;
            dungeonEntitySheetReady = true;
        }));
    }
    if (!dungeonMagicSheetReady) {
        loads.push(loadImageOnce(DUNGEON_MAGIC_SHEET_PATH, (img: HTMLImageElement) => {
            dungeonMagicSheet = img;
            dungeonMagicSheetReady = true;
        }));
    }
    if (!dungeonHeroSheetReady) {
        loads.push(loadImageOnce(DUNGEON_HERO_SHEET_PATH, (img: HTMLImageElement) => {
            dungeonHeroSheet = img;
            dungeonHeroSheetReady = true;
        }));
    }
    if (!dungeonSwordSheetReady) {
        loads.push(loadImageOnce(DUNGEON_SWORD_SHEET_PATH, (img: HTMLImageElement) => {
            dungeonSwordSheet = img;
            dungeonSwordSheetReady = true;
        }));
    }
    await Promise.all(loads);
}

function installEngineRuntimeHooks(): void {
    // Memory accessors already point to ts-memory.ts implementations.

    // Install town hooks: setDoorX1 writes directly to the shared statics.
    installTownHooks({
        setDoorX1: (x: number): void => {
            dungeonRuntimeStatics.savedDoorX1 = x;
        },
    });
}

const speedDialog = new SpeedChangeDialog(); // F9 game-speed state machine

// Used by touch-controls.js to show a mobile digit pad while the
// speed-change dialog is waiting for input.
export function getSpeedChangePhase() {
    return speedDialog.touchPhase;
}

// ─── Town scroll helpers ──────────────────────────────────────────────────────
// Direct byte access into the TS-owned game memory buffer.
function gMem(addr: number): number {
    return gMemAt(addr);
}

function readU8(addr: number): number {
    return tsReadU8(addr);
}

function readU16(addr: number): number {
    return tsReadU16(addr);
}

function drawDmanFrame(frame: number, dx: number, dy: number): void {
    drawSheetFrame(ctx, dmanSheet, frame, DMAN_FRAME_W, DMAN_FRAME_H, DMAN_SHEET_COLS, dx, dy);
}

function drawSmallSparkle(frame: number, cx: number, cy: number): void {
    if (!sparkle48Img) return;
    ctx.drawImage(sparkle48Img, frame * 48, 0, 48, 48, cx - 24, cy - 24, 48, 48);
}

function drawWideSparkle(frame: number, cx: number, cy: number): void {
    if (!sparkleWideImg) return;
    ctx.drawImage(sparkleWideImg, frame * 192, 0, 192, 48, cx - 96, cy - 24, 192, 48);
}

function drawRokademoBackground() {
    const colorIdx = readU8(ADDR_ROKA_COLOR);
    const rokaImg = rokaImages[Math.min(colorIdx, ROKA_IMAGE_PATHS.length - 1)] ?? null;
    if (rokaImg) {
        ctx.drawImage(rokaImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawRokademoTear(cx: number, cy: number): void {
    const img = rokademo?.isRed ? tearRedImg : tearBlueImg;
    if (!img) return;
    ctx.drawImage(img, cx - (img.width >> 1), cy - (img.height >> 1));
}
function startRokademo() {
    rokademo = new RokaDemo({
        playSfx: (id) => soundManager.playSfx(id),
        hasAudio: () => !!soundManager?.isReady,
        playTearMusic: (onEnded) =>
            soundManager.playMusic('tear', 0.1, { loop: false, onEnded }),
        setTearOverlayCount,
    }, { viewW: canvas.width, viewH: canvas.height });
    rokademo.start(getTearCount(), readU8(ADDR_SWORD_TYPE), performance.now());
}

function finishRokaDemo(now: number): void {
    finishRokademoFn();
    rokademo = null;
    rokademoHold = true;
    // Bypass the speed gate on the next full tick so the exit/pending flags set
    // by wasm_finish_rokademo_transition are acted on immediately.
    const speedC = readMemory(ADDR_SPEED_CONST, 1)[0] || 5;
    writeMemory(ADDR_FRAME_TIMER, Uint8Array.of(speedC * 4));
}

function drawDungeonRokademo(now: number): void {
    if (!readMemory || !writeMemory) return;
    if (!rokaImagesReady) return;

    if (!dmanSheetReady) {
        drawRokademoBackground();   // assets still loading: show the backdrop only
        return;
    }
    if (!rokademo || rokademo.done) {
        if (rokademo && rokademo.done) {
            finishRokaDemo(now);
            return;   // final frame (hero at right edge) was already drawn
        }
        startRokademo();
        if (!rokademo) return;
    }

    const d = rokademo;
    rokademo.update(now);
    const doneNow = d.done;
    const heroDx = (d.state === 'run' || d.state === 'runoff') ? rokademo.heroDx() : ROKADEMO_CENTER_DX;
    const tearC = ROKADEMO_TEAR_CENTER;
    const slotC = rokademoSlotCenter(d.slot, d.isRed);

    drawRokademoBackground();

    drawDmanFrame(d.animPhase, heroDx, ROKADEMO_HERO_Y);
    if (SWORD_VISIBLE_STATES.has(d.state)) {
        drawDmanFrame(rokademoSwordFrame(d.swordType),
            heroDx, ROKADEMO_HERO_Y - DMAN_FRAME_H);
    }

    if (d.tearVisible) {
        drawRokademoTear(tearC.x, tearC.y);
    }

    if (d.state === 'sparkleStart' || d.state === 'sparkleFlash') {
        drawSmallSparkle(d.sparkleFrame, tearC.x, tearC.y);
    } else if (d.state === 'sparkleBurst') {
        drawWideSparkle(d.burstFrame, tearC.x, tearC.y);
    } else if (d.state === 'sparkleFly' && d.fly) {
        drawSmallSparkle(d.sparkleFrame, d.fly.x, d.fly.y);
    } else if (d.state === 'sparkleLand') {
        const burstC = rokademoLandCenter(slotC, 192, 48, canvas.width, canvas.height);
        drawWideSparkle(d.burstFrame, burstC.x, burstC.y-24); // we show half-height of final big sparkle
    } else if (d.state === 'sparkleLandFlash') {
        const flashC = rokademoLandCenter(slotC, 48, 48, canvas.width, canvas.height);
        drawSmallSparkle(d.sparkleFrame, flashC.x, flashC.y-24);
    }

    if (doneNow) {
        finishRokaDemo(now);
    }
}

// Sync the tear overlay on the mole_t.jpg strip with ADDR_TEAR_COUNT.
// Idempotent — only touches the DOM when the visible count changes.
function setTearOverlayCount(count: number): void {
    if (!tearOverlayEl) return;
    count = Math.max(0, Math.min(9, count));
    while (tearOverlayEl.children.length > count) {
        tearOverlayEl.removeChild(tearOverlayEl.lastChild as ChildNode);
    }
    for (let i = tearOverlayEl.children.length; i < count; i++) {
        const slot = i === 8 ? TEAR_SLOT_RED : TEAR_SLOTS_BLUE[i]!;
        const el = document.createElement('img');
        el.src = i === 8 ? TEAR_RED_PATH : TEAR_BLUE_PATH;
        el.style.position = 'absolute';
        el.style.left = `${slot.x}px`;
        el.style.top = `${slot.y}px`;
        tearOverlayEl.appendChild(el);
    }
    lastTearOverlayCount = count;
}

// Count collected tears from the per-cavern achievement flags.
function countCollectedTears() {
    let n = 0;
    for (const f of TEAR_FLAGS) {
        if (readU8(f.addr) & f.bit) n++;
    }
    return n;
}

// Authoritative tear count: the run counter (0xA0) plus the per-cavern flags.
// The flags cover saves made before the rokademo feature, which never
// incremented ADDR_TEAR_COUNT; the counter covers the 9th (Jashiin) tear,
// which has no flag byte.
function getTearCount() {
    return Math.min(9, Math.max(readU8(ADDR_TEAR_COUNT), countCollectedTears()));
}

function syncTearOverlay() {
    if (!readMemory || rokademo) return;   // the demo manages its own overlay
    const count = getTearCount();
    if (count === lastTearOverlayCount) return;
    setTearOverlayCount(count);
}

// set sword reachability list
function updateDungeonSwordReach() {
    const swordType = readMemory(ADDR_SWORD_TYPE, 1)[0];
    if (swordType <= 3) {
        setDungeonSwordReachToBuffer(SWORD_REACH_SMALL);
    } else if (swordType <= 5) {
        setDungeonSwordReachToBuffer(SWORD_REACH_MEDIUM);
    } else {
        setDungeonSwordReachToBuffer(SWORD_REACH_LARGE);
    }
}

// ─── Town transition ──────────────────────────────────────────────────────────
let townTransitionInProgress = false;
async function handleTownTransition(transition: any): Promise<void> {
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
        loadMdtToBuffer(mdtData);
        const newBgType = numOrNull(tsGetTownBackgroundType(mdtBytes()));
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
        const pattern = (PATTERN_ASSETS as Record<number, { imagePath: string; specialTiles: number[]; animatedTilesSeq: number[][] }>)[townPatId as number];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileListToBuffer(pattern.specialTiles);
            updateTownAnimation();
        }
        parseTownNpcCategory();
        await Promise.all(
            NPC_SPRITE_PATHS[getTownNpcCategory()]!.map((_, index) => loadNpcSprite(index))
        );
        townSetReturnBeforeMainLoop(g(), RETURN_BEFORE_TOWN_MAIN_LOOP);
        townCompleteTransition(g());
        soundManager.setMusicDim(1.0);
        soundManager.setSfxVolume(1.0);
        const trackId = resolveMusicTrack(tsGetMusicTrackId(mdtBytes()));
        if (trackId) setCurrentMusicTrack(trackId);
        console.log(`[transition] entered map ${rawMapId}`);
    } catch (err) {
        console.error('[handleTownTransition] failed:', err);
    } finally {
        townTransitionInProgress = false;
        engineReady = true;
    }
}

let dungeonTransitionInProgress = false;
async function handleDungeonTransition(mapId: number, isFromTown: boolean): Promise<void> {
    if (dungeonTransitionInProgress) return;
    dungeonTransitionInProgress = true;
    engineReady = false;
    rokademoHold = false;
    try {
        writeMemory(ADDR_PENDING_DUNGEON_FLAG, Uint8Array.of(0));
        const rawMapId = mapId & 0x7F;
        const dungeon = DUNGEONS[rawMapId];
        if (!dungeon) throw new Error(`No DUNGEONS entry for map ID ${rawMapId}`);
        const mdtPath = dungeon.mdtPath;
        const resp = await fetch(mdtPath);
        if (!resp.ok) 
            throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdtToBuffer(mdtData);
        dungeonAIready = false;
        dungeonProjectiles = null;
        dungeonTileSheetReady = false;
        dungeonEntitySheetReady = false;
        cavernName = tsGetCavernName(mdtBytes());
        updatePlaceHud(cavernName, true);
        await loadDungeonAssets(rawMapId);
        const cfg = DUNGEONS[rawMapId]!;
        setDungeonPassableTilesToBuffer(cfg.passableTiles as unknown as Uint8Array);
        setDungeonSlopeTilesLeftToBuffer(cfg.slopeTilesLeft ?? []);
        setDungeonSlopeTilesRightToBuffer(cfg.slopeTilesRight ?? []);
        setDungeonAggressiveGroundToBuffer(cfg.aggressiveGround ?? []);
        setDungeonAirflowsToBuffer(cfg.airflows ?? []);
        setDungeonMonsterXpToBuffer(cfg.monster_xp ?? []);
        setDungeonMonsterDamageToBuffer(cfg.monster_damage ?? []);
        setDeathDescriptorsToBuffer(cfg.death_descriptors ?? []);
        setTrajectoriesToBuffer(cfg.trajectories ?? []);
        // Initialize boss state block if this map has one
        const bossState = DUNGEONS[rawMapId]!.bossState;
        if (bossState) {
            const { block, namePascal } = encodeBossState(bossState as Parameters<typeof encodeBossState>[0]);
            writeMemory(ADDR_BOSS_STATE_BLOCK, block);
            writeMemory(ADDR_BOSS_STATE_BLOCK + 11, namePascal);   // +11
            writeMemory(ADDR_BOSS_STATE_PTR, Uint8Array.of(
                ADDR_BOSS_STATE_BLOCK & 0xFF, (ADDR_BOSS_STATE_BLOCK >> 8) & 0xFF,
            ));
        }
        updateDungeonSwordReach();
        await loadRokaImages();
        await loadEncounterImage();
        dungeonInitFn(rawMapId, isFromTown);
        gameMode = 'dungeon';
        townEntryRan = false;
        const trackId = resolveMusicTrack(tsGetMusicTrackId(mdtBytes()));
        if (trackId) setCurrentMusicTrack(trackId);
        console.log(`[dungeon] entered map ${rawMapId}`);
    } catch (err) {
        console.error('[handleDungeonTransition] failed:', err);
    } finally {
        dungeonTransitionInProgress = false;
        engineReady = true;
    }
}

let dungeonExitInProgress = false;
async function initTownFromDungeon(townMapId: number, isDeath: boolean): Promise<void> {
    if (dungeonExitInProgress) return;
    dungeonExitInProgress = true;
    engineReady = false;
    rokademoHold = false;
    try {
        writeMemory(ADDR_DUNGEON_EXIT_FLAG, Uint8Array.of(0));
        if (isDeath) {
            writeMemory(ADDR_HERO_DEATH_FLAG, Uint8Array.of(0));
        }
        resetBossHud();
        const rawMapId = townMapId & 0x7F;
        const mdtPath = TOWN_MDTS[rawMapId] ?? TOWN_MDTS[1] ?? TOWN_MDTS[0]!;
        const resp = await fetch(mdtPath);
        if (!resp.ok) throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdtToBuffer(mdtData);

        const mapWidth = getTownMapWidth(mdtData);
        const xBytes = readMemory(isDeath ? ADDR_TEAR_X : ADDR_HERO_X_IN_PROXIMITY_MAP, 2);
        const xProx = xBytes[0] | (xBytes[1] << 8);
        if (mapWidth) {
            const { proxLeft, heroViewX } = computeTownScrollFromAbsoluteX(xProx, mapWidth);
            writeMemory(ADDR_PROXIMITY_MAP_LEFT_COL, Uint8Array.of(proxLeft & 0xFF, (proxLeft >> 8) & 0xFF));
            writeMemory(ADDR_HERO_X_VIEW, Uint8Array.of(heroViewX));
        }

        const newBgType = numOrNull(tsGetTownBackgroundType(mdtBytes()));
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

        const newPatId = numOrNull(tsGetTownPatId(mdtBytes()));
        if (newPatId !== townPatId) {
            townPatId = newPatId;
            townTileSheetReady = false;
            townTileSheet = null;
        }
        const pattern = (PATTERN_ASSETS as Record<number, { imagePath: string; specialTiles: number[]; animatedTilesSeq: number[][] }>)[townPatId as number];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileListToBuffer(pattern.specialTiles);
            updateTownAnimation();
        }

        parseTownNpcCategory();
        await Promise.all(
            NPC_SPRITE_PATHS[getTownNpcCategory()]!.map((_, index) => loadNpcSprite(index))
        );
        townSetReturnBeforeMainLoop(g(), RETURN_BEFORE_TOWN_MAIN_LOOP);
        townEntryDisablingEdgeScroll(g());
        townEntryRan = true;
        gameMode = 'town';
        soundManager.setMusicDim(1.0);
        soundManager.setSfxVolume(1.0);
        const trackId = resolveMusicTrack(tsGetMusicTrackId(mdtBytes()));
        if (trackId) setCurrentMusicTrack(trackId);
        console.log(`[dungeon] exited to town ${rawMapId}, isDeath=${isDeath}`);
        if (isDeath && readU8(ADDR_DEATH_ALREADY_PROCESSED) === 0) {
            startIndoorScene(2);
        }
    } catch (err) {
        console.error('[handleDungeonExit] failed:', err);
    } finally {
        dungeonExitInProgress = false;
        engineReady = true;
    }
}

// ─── Conversation (NPC dialog) ────────────────────────────────────────────────
const inputLatches = new KeyEdgeLatches(
    () => writeMemory?.(ADDR_SPACEBAR_LATCH, [1]),
    () => writeMemory?.(ADDR_ALTKEY_LATCH, [1]),
);

function getNpcConversationRaw(npcId: number) {
    return readNpcConversationBytes(readMemory, npcId);
}

// Dialog text parsing + geometry live in core/conversation-text.ts (Stage 2).
const dialogEffects = {
    // 0x83: citizen gives Elf Crest after defeating Paguro
    onElfCrest: () => {
        const ci = readMemory(ADDR_CALIENTE_ITEMS, 1)[0];
        writeMemory(ADDR_CALIENTE_ITEMS, Uint8Array.of(ci | 0x80));
        writeMemory(ADDR_ELF_CREST, Uint8Array.of(0xFF));
        initC015ObjIfExists(g());
    },
    // 0x8B: endgame flag — final boss Jashiin defeated + 9th Tear of
    // Esmesanti delivered (original: or byte_4,80h; jmp init_c015_obj_if_exists).
    // Together with death_already_processed=FF it switches the King's and
    // citizens' conversations in Felishika's Castle town (place map id 0x80).
    onFinalTearCollected: () => {
        const b4 = readMemory(ADDR_BYTE4, 1)[0];
        writeMemory(ADDR_BYTE4, Uint8Array.of(b4 | 0x80));
        initC015ObjIfExists(g());
    },
};

function parseDialogText(bytes: Uint8Array) {
    return parseDialogTextImpl(bytes, dialogEffects);
}

const conversation = new ConversationManager({
    readMemory: (offset, length) => readMemory?.(offset, length) ?? null,
    writeMemory: (offset, data) => writeMemory?.(offset, data),
    getNpcConversationRaw: getNpcConversationRaw,
    townFinishConversation: () => { townConversationFinish(g()); },
    getHeroAlmasValue,
    setHeroAlmasValue,
    renderAlmasHud,
    layout: (facingLeft, extraLines) => layoutConversationBox(ctx, conversation, extraLines),
    effects: dialogEffects,
});

function startConversationFromWasm() {
    conversation.startFromWasm();
}

// ─── Indoor scene entry / exit ────────────────────────────────────────────────
function checkBuildingRequest() {
    if (!engineReady || !readMemory || indoorActiveScene) return;
    if (conversation.active) return;
    const active = gMem(ADDR_BUILDING_ACTIVE);
    if (!active) return;
    const destId = gMem(ADDR_BUILDING_DEST_ID);
    if (destId === 0xFF) {
        startWarpPureza2Dorado();
        return;
    }
    startIndoorScene(destId);
}

// warp building (Pureza, door x=294, td_dest_id 0xFF).  Matches the
// original loc_6F77: on first use show the "Fooled again..." dialog (NPC
// conversation pattern 0), then teleport to Dorado.  Once used (falter_items
// bit7) the warp happens immediately.
function startWarpPureza2Dorado() {
    const falter = readMemory(ADDR_FALTER_ITEMS, 1)[0];
    if (falter & 0x80) {
        handleWarp();
        return;
    }
    const rawText = getNpcConversationRaw(0) ?? new Uint8Array();
    const parsed = parseDialogText(rawText);
    if (parsed.pages.length === 0) {
        handleWarp();
        return;
    }
    conversation.startDialog(parsed, handleWarp);
}

// warp building — teleports the hero to Dorado (place map id 6).
// Re-enters town exactly like the original loc_6F77: drop the hero at the
// Dorado building door landing spot (prox col 132 / view x 13) and re-run town entry
// with edge scroll disabled.
async function handleWarp() {
    if (townTransitionInProgress) return;
    townTransitionInProgress = true;
    engineReady = false;
    rokademoHold = false;
    try {
        // Mark Falter building as used (bit7 of falter_items) so the dialog
        // and warp cannot repeat.
        const falter = readMemory(ADDR_FALTER_ITEMS, 1)[0];
        writeMemory(ADDR_FALTER_ITEMS, Uint8Array.of(falter | 0x80));
        writeMemory(ADDR_PLACE_MAP_ID, Uint8Array.of(6)); // Dorado
        townBuildingFinish(g());

        const mdtPath = TOWN_MDTS[6]!;
        const resp = await fetch(mdtPath);
        if (!resp.ok) throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdtToBuffer(mdtData);

        const newBgType = numOrNull(tsGetTownBackgroundType(mdtBytes()));
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

        const newPatId = numOrNull(tsGetTownPatId(mdtBytes()));
        if (newPatId !== townPatId) {
            townPatId = newPatId;
            townTileSheetReady = false;
            townTileSheet = null;
        }
        const pattern = (PATTERN_ASSETS as Record<number, { imagePath: string; specialTiles: number[]; animatedTilesSeq: number[][] }>)[townPatId as number];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileListToBuffer(pattern.specialTiles);
            updateTownAnimation();
        }

        parseTownNpcCategory();
        await Promise.all(
            NPC_SPRITE_PATHS[getTownNpcCategory()]!.map((_, index) => loadNpcSprite(index))
        );

        // Landing spot: Falter building door, prox col 132 / view x 13, face-left.
        writeMemory(ADDR_PROXIMITY_MAP_LEFT_COL, Uint8Array.of(132, 0));
        writeMemory(ADDR_HERO_X_VIEW, Uint8Array.of(13));
        writeMemory(ADDR_FACING, Uint8Array.of(0x01)); // face left
        townSetReturnBeforeMainLoop(g(), RETURN_BEFORE_TOWN_MAIN_LOOP);
        townEntryDisablingEdgeScroll(g());
        townEntryRan = true;
        gameMode = 'town';
        soundManager.setMusicDim(1.0);
        soundManager.setSfxVolume(1.0);
        const trackId = resolveMusicTrack(tsGetMusicTrackId(mdtBytes()));
        if (trackId) setCurrentMusicTrack(trackId);
        console.log('[falter] warped to Dorado');
    } catch (err) {
        console.error('[handleWarp] failed:', err);
    } finally {
        townTransitionInProgress = false;
        engineReady = true;
    }
}

function startIndoorScene(destId: number): void {
    if (!TOWN_DOORS[destId]) {
        console.warn(`[building] destination ${destId} not implemented`);
        townBuildingFinish(g());
        return;
    }
    soundManager.setMusicDim(1 / 32);
    soundManager.setSfxVolume(1.0);
    const finishCb = () => {
        indoorActiveScene = null;
        soundManager.setMusicDim(1.0);
        soundManager.setSfxVolume(1.0);
        townBuildingFinish(g());
        keys.Space = false;
        inputLatches.reset();
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
        startEndingDemo,
    };

    const building = TOWN_DOORS[destId];
    if (building) {
        const scene = new building.scene(context) as IndoorSceneBase & {
            building?: { name: string };
            getName?: () => string;
            handleHeldInput?: (keys: Record<string, boolean>, now: number) => void;
        };
        scene.building = building;
        indoorActiveScene = scene;
        scene.enter(performance.now());
    }
}

// ─── UI helpers (gold, sword, shield, magic) ──────────────────────────────────
// HUD rendering lives in ui/hud.ts; these bindings wire it to TS memory.
// Delegating function declarations keep hoisting semantics for earlier code.
const hud = new Hud({
    mem: {
        readMemory: (offset, length) => readMemory?.(offset, length) ?? null,
        writeMemory: (offset, data) => writeMemory?.(offset, data),
    },
    iconPaths: {
        sword: ITEMP_SWORD_IMAGE_PATHS,
        shield: ITEMP_SHIELD_IMAGE_PATHS,
        magic: ITEMP_MAGIC_IMAGE_PATHS,
    },
    getBossName: () => getBossName?.() ?? '',
});

function resetBossHud() { hud.resetBossHud(); }
function updatePlaceHud(name: string, indoor: boolean): void { hud.updatePlaceHud(name, indoor); }
function renderBossName() { hud.renderBossName(); }
function drawLifeBar() { hud.drawLifeBar(); }
function setLife(currentLife: number, maxLife: number): void { hud.setLife(currentLife, maxLife); }
function drawBossHealth() { hud.drawBossHealth(); }
function renderGoldHud() { hud.renderGoldHud(); }
function getHeroAlmasValue() { return hud.getHeroAlmasValue(); }
function setHeroAlmasValue(value: number): void { hud.setHeroAlmasValue(value); }
function renderAlmasHud() { hud.renderAlmasHud(); }
function loadSwordIcons() { return hud.loadSwordIcons(); }
function renderSwordHud() { hud.renderSwordHud(); }
function loadShieldIcons() { return hud.loadShieldIcons(); }
function renderShieldHud() { hud.renderShieldHud(); }
function loadMagicIcons() { return hud.loadMagicIcons(); }
function renderMagicHud() { hud.renderMagicHud(); }
// Open Save Modal (called from Sage scene)
function openSaveModal(onSaveComplete: (success: boolean) => void): void {
    if (modalManager.isActive) return;
    gamePaused = true;
    const onSave = (slotName: string | null): void => {
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
    modalManager.open(new SaveDialog(onSave, onCancel));
}

function openRestoreModal() {
    if (modalManager.isActive) return;
    gamePaused = true;
    const onRestore = async (slotName: string | null): Promise<void> => {
        let saveData = null;
        if (slotName === null) {  // Re-Start
            try {
                const resp = await fetch(STDPLY_PATH);
                if (!resp.ok) throw new Error('Failed to load default save');
                const buffer = await resp.arrayBuffer();
                saveData = new Uint8Array(buffer);
                await performGameRestore(saveData);
            } catch (err) {
                console.error('Re-Start failed:', err);
            }
        } else {
            saveData = loadGameFromSlot(slotName);
            if (saveData) {
                await performGameRestore(saveData);
            } else {
                console.error('Failed to load save:', slotName);
            }
        }
        closeModal();
    };
    const onCancel = () => {
        closeModal();
    };
    modalManager.open(new RestoreDialog(onRestore, onCancel));
}

function closeModal() {
    modalManager.close();
    gamePaused = false;
}

// True while the active modal is the save-name text input (SaveDialog with the
// name field focused). Used by the touch-mode on-screen keyboard to know when
// to show itself.
export function getModalInputActive() {
    return modalManager.isInputActive;
}

// ─── Speed change dialog (F9) ──────────────────────────────────────────────

function startSpeedChange() {
    if (speedDialog.isActive || modalManager.isActive || gamePaused || !engineReady) return;
    if (gameMode !== 'town' && gameMode !== 'dungeon') return;

    speedDialog.begin();
    gamePaused = true;
}

function getSpeedChangeBox() {
    const w = TILE_SIZE * 22;
    const h = TILE_SIZE * 5;
    const x = (VIEW_WIDTH - w) / 2;
    const y = TILE_SIZE * 6;
    return { x, y, w, h };
}

function finishSpeedChange() {
    if (!speedDialog.isActive) return;
    speedDialog.finish();
    gamePaused = false;
}

function cancelSpeedChange() {
    finishSpeedChange();
}

function drawSpeedChangeDialog() {
    if (!speedDialog.isActive) return;

    const box = getSpeedChangeBox();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, TILE_SIZE / 3);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = TILE_SIZE / 6;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';

    const cx = box.x + TILE_SIZE;
    const cy = box.y + TILE_SIZE * 0.5;

    ctx.fillStyle = '#fff';
    ctx.fillText('Speed change', cx, cy);

    const currentSpeed = displayedSpeed(readMemory(ADDR_SPEED_CONST, 1)[0]);
     // strlen of "Select 0-9:" is 11
    if (speedDialog.currentPhase === 0) {
        ctx.fillStyle = '#888';
        ctx.fillText('Select 0-9:', cx, cy + TILE_SIZE * 1.5);
        ctx.fillText(String(currentSpeed), cx + TILE_SIZE * 11, cy + TILE_SIZE * 1.5);
    } else if (speedDialog.currentPhase === 1) {
        ctx.fillStyle = '#fff';
        ctx.fillText('Select 0-9:', cx, cy + TILE_SIZE * 1.5);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('_', cx + TILE_SIZE * 11, cy + TILE_SIZE * 1.5);
    } else {
        ctx.fillStyle = '#fff';
        ctx.fillText('Select 0-9:', cx, cy + TILE_SIZE * 1.5);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(String(speedDialog.selectedDigit), cx + TILE_SIZE * 11, cy + TILE_SIZE * 1.5);
        ctx.fillStyle = '#888';
        ctx.fillText('(press any key)', cx, cy + TILE_SIZE * 3);
    }

    ctx.restore();
}

// Core restore routine: reloads full game state from 256-byte saveData
async function performGameRestore(saveData: Uint8Array): Promise<void> {
    if (!saveData || saveData.length > 256) {
        console.error('Invalid save data');
        return;
    }

    // Abort any indoor scene or conversation
    if (indoorActiveScene) {
        indoorActiveScene = null;
        townBuildingFinish(g());  // clear WASM building state (ADDR_BUILDING_ACTIVE at 0xFFFA outside save range)
    }
    soundManager.setMusicDim(1.0);
    conversation.active = false;
    engineReady = false;
    rokademo = null;
    rokademoHold = false;

    // Load the save into TS memory buffer
    tsLoadSaveState(saveData);

    // ADDR_HEARTBEAT_VOLUME (0xFF08) is outside the 0x0000..0x00FF save area,
    // so a restore keeps whatever stale dungeon value was last written there.
    // Clear it so the heartbeat loop stops in town; the dungeon code recomputes
    // it on the next frame.
    writeMemory(ADDR_HEARTBEAT_VOLUME, Uint8Array.of(0));

    // Saves made before the rokademo feature have ADDR_TEAR_COUNT stuck at 0
    // while the per-cavern tear flags are set. Derive the real count from the
    // flags and write it back so the demo slot selection and any in-game
    // counter logic stay consistent.
    writeMemory(ADDR_TEAR_COUNT, Uint8Array.of(getTearCount()));

    // Reflect collected Tears of Esmesanti on the mole_t strip immediately
    lastTearOverlayCount = -1;
    syncTearOverlay();

    // Get the place id (town index or dungeon)
    const placeId = readMemory(ADDR_PLACE_MAP_ID, 1)[0] & 0x7F;

    if (placeId < TOWN_MDTS.length) {
        const mdtPath = TOWN_MDTS[placeId]!;
        try {
            const resp = await fetch(mdtPath);
            if (!resp.ok) throw new Error(`Failed to load ${mdtPath}`);
            mdtData = new Uint8Array(await resp.arrayBuffer());
            loadMdtToBuffer(mdtData);
        } catch (err) {
            console.error('Failed to load MDT for restore:', err);
            return;
        }
    } else {
        // Fallback to starting town (index 0) for dungeons
        console.warn('Restoring in dungeon – falling back to Felishika Castle');
        const resp = await fetch(TOWN_MDTS[0]!);
        if (!resp.ok) throw new Error(`Failed to load ${TOWN_MDTS[0]}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdtToBuffer(mdtData);
        writeMemory(ADDR_PLACE_MAP_ID, Uint8Array.of(0));  // ensure place_map_id points to town 0
    }

    // Re‑initialise the town engine – reads hero position from restored save data
    townSetReturnBeforeMainLoop(g(), true);
    townEntryDisablingEdgeScroll(g());
    townEntryRan = true;

    // ------------------- Reload JS-side visual assets -------------------
    const newBgType = numOrNull(tsGetTownBackgroundType(mdtBytes()));
    const newPatId = numOrNull(tsGetTownPatId(mdtBytes()));

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
        const pattern = (PATTERN_ASSETS as Record<number, { imagePath: string; specialTiles: number[]; animatedTilesSeq: number[][] }>)[townPatId as number];
        if (pattern) {
            await loadTownTileSheet(pattern.imagePath);
            setSpecialTileListToBuffer(pattern.specialTiles);
            updateTownAnimation();   // rebuild townAnimTileMap based on new patId
        }
    }

    // Reload NPC sprites (category may have changed)
    parseTownNpcCategory();
    await Promise.all(
        NPC_SPRITE_PATHS[getTownNpcCategory()]!.map((_, idx) => loadNpcSprite(idx))
    );

    const trackId = resolveMusicTrack(tsGetMusicTrackId(mdtBytes()));
    if (trackId) setCurrentMusicTrack(trackId);

    resetBossHud();
    gameMode = 'town';
    engineReady = true;
    gamePaused = false;

    console.log(`Restored town ${readMemory(ADDR_PLACE_MAP_ID, 1)[0] & 0x7F}`);
}

// ─── Game loop ────────────────────────────────────────────────────────────────
// let fps = 0;
let cavernName = '';
let mdtData: Uint8Array | null = null;

/** Raw MDT bytes for TS-side parsing (set by every loadMdt site). */
function mdtBytes(): Uint8Array {
    if (!mdtData) throw new Error('MDT not loaded');
    return mdtData;
}

/** Stage 6a: MDT header fields are parsed in TS from raw file bytes. */
function numOrNull(v: number | ''): number | null {
    return v === '' ? null : v;
}

let frameTimer  = 0;
let tickCounter = 0;
let animTimer   = 0;

function draw() {
    if (!engineReady) { // emergency fallback
        drawLifeBar();
        renderGoldHud();
        renderSwordHud();
        renderMagicHud();
        renderShieldHud();
        return;
    }

    syncTearOverlay();

    if (indoorActiveScene) {
        const scene = indoorActiveScene!;
        const now = performance.now();
        const ext = scene as unknown as {
            getName?: () => string;
            building?: { name: string };
            handleHeldInput?: (keys: Record<string, boolean>, now: number) => void;
        };
        const sceneName = ext.getName?.() ?? ext.building?.name ?? '';
        ext.handleHeldInput?.(keys as unknown as Record<string, boolean>, now);
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
            beginRokaRunFrame(prevDungeonState !== DUNGEON_STATE_ROKA_RUN);
            drawDungeonRoka();
            clearRenderRequest(g());
        } else if (dungeonState === DUNGEON_STATE_ROKADEMO) {
            drawDungeonRokademo(performance.now());
        } else if (rokademoHold && !(dungeonState >= DUNGEON_STATE_DEATH_FALL && dungeonState <= DUNGEON_STATE_DEATH_FADE)) {
            // Post-demo hold: keep the roka backdrop until the transition set up
            // by wasm_finish_rokademo_transition takes over (except when playing hero death sequence).
            drawRokademoBackground();
            clearRenderRequest(g());
        } else {
            // Detect encounter animation start (BOSS_ENCOUNTER state)
            if (!encounterAnim && dungeonState === DUNGEON_STATE_BOSS_ENCOUNTER) {
                encounterAnim = {
                    startTime: performance.now(),
                    phase: 'flash',
                };
                // Original plays the loaded boss music during the ENCOUNTER flash
                // (fight.asm boss_place). Play encounter.ogg once; music is stopped
                // when the boss fight starts (crossfade completion) for silence.
                soundManager.playMusic('encounter', 0.1, { loop: false });
            }

            if (encounterAnim && encounterAnim.phase === 'flash') {
                const now = performance.now();
                // const anim = encounterAnim;
                const flashCycleMs = 400;
                const elapsed = now - encounterAnim.startTime;
                const totalFlashMs = 7 * flashCycleMs;

                if (elapsed >= totalFlashMs) {
                    encounterAnim = {
                        phase: 'crossfade',
                        crossfadeStart: now,
                    };
                }

                const cyclePos = elapsed % flashCycleMs;
                const visible = cyclePos < (flashCycleMs / 2);

                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                drawDungeonHero();
                drawDungeonSword();
                if (visible) {
                    drawEncounterText(1.0);
                }
            } else { // normal dungeon rendering
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                drawDungeonTiles(); // background cavern tiles
                animateDungeonTiles(); // advance cavern 5–8 tiles once per game tick
                drawDungeonMagicProjectiles(); // hero magic spell projectiles (blitted into the tile layer in the original)
                drawDungeonEntities(); // monsters/items, in original row-major order
                drawDungeonHero(); // hero 3x3 tiles sprite
                drawDungeonMagiaStones(); // video effect of Magia Stone item
                drawDungeonProjectiles(); // monsters projectiles
                drawDungeonSword(); // hero's sword 4x4 tiles sprite
                drawDungeonNotification(); // notification text boxes (pickup items etc)
                drawDungeonSign(); // text boxes when reading the signposts
                maybeStartGuerraEffect();
                drawGuerraOverlay();

                if (encounterAnim && encounterAnim.phase === 'crossfade') {
                    const now = performance.now();
                    const elapsed = now - encounterAnim.crossfadeStart;
                    const duration = 500;
                    const progress = Math.min(1, elapsed / duration);

                    ctx.fillStyle = `rgba(0,0,0,${1 - progress})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    const textAlpha = Math.max(0, 1 - progress * 2);
                    if (textAlpha > 0) {
                        drawEncounterText(textAlpha);
                    }

                    if (progress >= 1) {
                        encounterAnim = null;
                        // Initialize boss HUD from JS (boss state block already set by handleDungeonTransition)
                        writeMemory(ADDR_BOSS_MODE, Uint8Array.of(0xFF));                   // boss HUD visible
                        writeMemory(ADDR_BOSS_HEALTH_REQUEST, Uint8Array.of(0xFF));         // trigger health bar draw
                        const boss_placement = readMemory(ADDR_BOSS_STATE_BLOCK + 8, 1)[0];
                        writeMemory(ADDR_BOSS_PLACEMENT, Uint8Array.of(boss_placement));
                        // Reset game frame state so normal loop starts cleanly
                        writeMemory(ADDR_DUNGEON_FRAME_PHASE, Uint8Array.of(0));
                        writeMemory(ADDR_RENDER_REQUEST, Uint8Array.of(0xFF));
                        writeMemory(ADDR_RENDER_DONE, Uint8Array.of(0));
                        writeMemory(ADDR_DUNGEON_STATE, Uint8Array.of(0)); // NORMAL
                        // encounter.ogg plays once during the flash, then silence for the fight
                        soundManager.stopMusic(0.1);
                    }
                }

                if (dungeonState === DUNGEON_STATE_DEATH_FADE) {
                    const fade = readU8(ADDR_DEATH_COUNTER) / 29;
                    ctx.fillStyle = `rgba(0,0,0,${fade})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    soundManager.setMusicDim(Math.max(0, 1.0 - fade), 0.1);
                    soundManager.setSfxVolume(Math.max(0, 1.0 - fade), 0.1);
                }
            }
        }
        prevDungeonState = dungeonState;

        // Boss mode HUD toggle
        const bossMode = gMem(ADDR_BOSS_MODE);
        const bossLifeBar = document.getElementById('bossLifeBarContainer');
        const placeName = document.getElementById('currentMapName');
        const placeLabel = document.getElementById('placeLabel');
        const goldLabel = document.getElementById('goldLabel');
        const goldValue = document.getElementById('gold');
        if (bossMode) {
            if (bossLifeBar) bossLifeBar.classList.remove('hidden');
            if (placeName) placeName.style.display = 'none';
            if (placeLabel) placeLabel.textContent = 'ENEMY';
            if (goldLabel) goldLabel.style.display = 'none';
            if (goldValue) goldValue.style.display = '';
        } else {
            hud.resetBossMaxHp();
            if (bossLifeBar) bossLifeBar.classList.add('hidden');
            if (placeName) placeName.style.display = '';
            if (placeLabel) placeLabel.textContent = 'PLACE';
            if (goldLabel) { goldLabel.textContent = 'GOLD'; goldLabel.style.display = ''; }
            if (goldValue) goldValue.style.display = '';
        }

        if (gMem(ADDR_HEALTH_BAR_REQUEST)) {
            drawLifeBar();
            writeMemory(ADDR_HEALTH_BAR_REQUEST, Uint8Array.of(0));
        }
        if (bossMode) {
            if (gMem(ADDR_BOSS_HEALTH_REQUEST)) {
                drawBossHealth();
                renderBossName();
                writeMemory(ADDR_BOSS_HEALTH_REQUEST, Uint8Array.of(0));
            }
        } else {
            if (gMem(ADDR_GOLD_RENDER_REQUEST)) {
                renderGoldHud();
                writeMemory(ADDR_GOLD_RENDER_REQUEST, Uint8Array.of(0));
            }
        }
        if (gMem(ADDR_ALMAS_RENDER_REQUEST)) {
            renderAlmasHud();
            writeMemory(ADDR_ALMAS_RENDER_REQUEST, Uint8Array.of(0));
        }
        if (gMem(ADDR_SHIELD_HP_RENDER_REQUEST)) {
            renderShieldHud();
            writeMemory(ADDR_SHIELD_HP_RENDER_REQUEST, Uint8Array.of(0));
        }
        if (gMem(ADDR_MAGIC_LEFT_RENDER_REQUEST)) {
            renderMagicHud();
            writeMemory(ADDR_MAGIC_LEFT_RENDER_REQUEST, Uint8Array.of(0));
        }
        if (gMem(ADDR_SWORD_RENDER_REQUEST)) {
            renderSwordHud();
            writeMemory(ADDR_SWORD_RENDER_REQUEST, Uint8Array.of(0));
        }
        if (gMem(ADDR_SWORD_GFX_RELOAD_REQUEST)) {
            updateDungeonSwordReach(); 
            writeMemory(ADDR_SWORD_GFX_RELOAD_REQUEST, Uint8Array.of(0));
        }
    } else { // town outdoor mode
        ctx.fillStyle = townPatId === 2 ? '#000000' : '#05053f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawTownBackground();
        drawTownSidewalk();
        if (townBackgroundType) 
            drawTownCeiling();
        if (drawTownTiles()) {
            drawTownNpcs();
            drawTownHero();
            drawLifeBar();
            let placeName = tsGetTownName(mdtBytes());
            updatePlaceHud(townEntryRan ? placeName : '', false);
            renderGoldHud();
            renderAlmasHud();
            renderSwordHud();
            renderMagicHud();
            renderShieldHud();
            drawConversationBox(ctx, conversation);
        }
    }
    // Draw speed change dialog
    drawSpeedChangeDialog();

    // Draw modal on top of everything (indoor scene or town)
    modalManager.draw(ctx, canvas.width, canvas.height, performance.now());

    // Draw inventory screen on top of everything
    if (inventoryScreenInstance && inventoryScreenInstance.active) {
        inventoryScreenInstance.draw(performance.now());
    }
}

function loop(timestamp: number): void {
    draw();
    requestAnimationFrame(loop);
}

// ─── DOM references ───────────────────────────────────────────────────────────
const introScreen  = document.getElementById('intro-screen') as HTMLElement;
const introCanvas  = document.getElementById('introCanvas') as HTMLCanvasElement;
const uiScreen     = document.getElementById('ui') as HTMLElement;
const layoutWrapper = document.getElementById('layout-wrapper') as HTMLElement;
// const fpsEl  = document.getElementById('fps-value');
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const tearOverlayEl = document.getElementById('tear-overlay');
const ctx    = setupGameCanvas(canvas);

// Dungeon renderer: memory accessors + mutable asset bundle.
initDungeonRenderer({
    ctx,
    viewW: () => canvas.width,
    viewH: () => canvas.height,
    engineReady: () => engineReady,
    gMem,
    readU8,
    readU16,
    readMemory: (offset, length) => readMemory?.(offset, length) ?? null,
    writeMemory: (offset, data) => writeMemory?.(offset, data),
    viewportTop: () => getViewportTop(g()),
    assets: () => ({
        tileSheet: dungeonTileSheet, tileSheetReady: dungeonTileSheetReady,
        dchrSheet: dungeonDchrSheet, dchrSheetReady: dungeonDchrSheetReady,
        entitySheet: dungeonEntitySheet, entitySheetReady: dungeonEntitySheetReady,
        magicSheet: dungeonMagicSheet, magicSheetReady: dungeonMagicSheetReady,
        heroSheet: dungeonHeroSheet, heroSheetReady: dungeonHeroSheetReady,
        swordSheet: dungeonSwordSheet, swordSheetReady: dungeonSwordSheetReady,
        projectiles: dungeonProjectiles as unknown as Uint8Array[],
        ai: dungeonAI as unknown as Uint8Array[],
        rokaImages, rokaImagesReady,
    }),
    encounterImg: () => encounterImg,
});

// Town renderer: same injection pattern as the dungeon renderer.
initTownRenderer({
    ctx,
    viewW: () => canvas.width,
    engineReady: () => engineReady,
    gMem,
    readU16,
    readMemory: (offset, length) => readMemory?.(offset, length) ?? null,
    memByte: (addr) => getGmem()[addr] ?? -1,
    keys: () => ({ ArrowLeft: !!keys.ArrowLeft, ArrowRight: !!keys.ArrowRight }),
    frameTimer: () => frameTimer,
    townPatId: () => townPatId ?? 0,
    assets: () => ({
        background: townBackground, backgroundReady: townBackgroundReady,
        ceiling: townCeiling, ceilingReady: townCeilingReady,
        sidewalk1: townSidewalk1, sidewalk1Ready: townSidewalk1Ready,
        sidewalk2: townSidewalk2, sidewalk2Ready: townSidewalk2Ready,
        tileSheet: townTileSheet, tileSheetReady: townTileSheetReady,
        heroSprite, heroSpriteReady,
        npcSprites: [npcSprites[0] ?? [], npcSprites[1] ?? []],
        mdtData,
    }),
});

const openingIntro = new OpeningIntro({
    screen:     introScreen,
    canvas:     introCanvas,
    onComplete: startGame,
});

const endingDemo = new EndingDemo({
    screen:     introScreen,
    canvas:     introCanvas,
    onComplete: endingDemoComplete,
    soundManager,
});

function endingDemoComplete() {
    // After the ending the game is over — do NOT restore the in-game UI.
    // EndingDemo.finish() already hides the intro screen, leaving a black
    // "The End" screen until the player restarts.
}

// Called by the PrincessScene when the hero enters the chamber after the
// demon has been defeated: completes the indoor scene transition (same as the
// normal finish callback), then hides the game UI, shows the intro canvas, and
// starts the ending demo.
function startEndingDemo() {
    indoorActiveScene = null;
    soundManager.setMusicDim(1.0);
    soundManager.setSfxVolume(1.0);
    townBuildingFinish(g());
    keys.Space = false;
    inputLatches.reset();
    uiScreen.classList.add('hidden');
    layoutWrapper.classList.add('hidden');
    endingDemo.start();
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
// Save slot helpers live in platform/save.ts and are re-exported at the top
// of this file.

// File import/export now lives in platform/save-file.ts (Stage 2).
function exportSlotToFile(slotName: string): void {
    const saveData = loadGameFromSlot(slotName);
    if (!saveData) {
        console.error(`No save data found for slot "${slotName}"`);
        alert(`No save data for slot "${slotName}"`);
        return;
    }
    downloadSaveFile(slotName, saveData);
}

// Import a .sav file and restore game state
function importSaveFromFile() {
    pickSaveFile(performGameRestore, {
        canImport: () => engineReady,
        onInvalid: (reason) => {
            alert(reason === 'size'
                ? 'Invalid save file: must be exactly 256 bytes.'
                : 'Failed to import save file.');
        },
    });
}

// Open the new modal
function openImportExportModal() {
    if (modalManager.isActive) return;
    gamePaused = true;

    const onExportSlot = (slotName: string): void => {
        exportSlotToFile(slotName);
        closeModal();
    };
    const onImportFromFile = () => {
        importSaveFromFile();
        closeModal();
    };
    const onDeleteSlot = (slotName: string): void => {
        deleteGameFromSlot(slotName);
    };
    const onCancel = () => {
        closeModal();
    };
    modalManager.open(new ImportExportDialog(onExportSlot, onImportFromFile, onDeleteSlot, onCancel));
}

(window as unknown as { openSaveModal?: typeof openSaveModal }).openSaveModal = openSaveModal;

// ─── Debug/E2E hook ───────────────────────────────────────────────────────────
// Small surface for the Playwright smoke test: query engine state and force
// scene transitions without depending on map layout. Not used by gameplay.
(window as unknown as Record<string, unknown>).__zeliard = {
    ready: () => engineReady && !openingIntro.active && !endingDemo.active,
    mode: (): string => gameMode,
    /** Jump from town into dungeon `mapId` (0..30), as if walking in.
     * `isFromTown` defaults to false; boss caverns need true (skips the
     * roka-run, like the real town→boss door path). Mirrors the real
     * door flow's contract: PLACE_MAP_ID is set before prepare_dungeon
     * reads it (town.c request_dungeon_transition does the same). */
    enterDungeon: (mapId: number, isFromTown?: boolean): Promise<void> => {
        writeMemory(ADDR_PLACE_MAP_ID, Uint8Array.of(mapId & 0x7f));
        return handleDungeonTransition(mapId, isFromTown ?? false);
    },
    /** Return from the dungeon to the starting town. */
    returnToTown: (): Promise<void> => initTownFromDungeon(1, false),
    /**
     * Stage 7 tooling: door positions for the current town plus hero
     * position read/write, for scripted building-entry sessions.
     */
    doors: (): Array<{ x: number; dest: number }> => {
        const mem = getGmem();
        const g16 = (a: number): number => (mem[a] ?? 0) | ((mem[a + 1] ?? 0) << 8);
        let si = g16(0xc009);
        const out: Array<{ x: number; dest: number }> = [];
        for (;;) {
            const x = g16(si);
            if (x === 0xffff) return out;
            out.push({ x, dest: mem[si + 2] ?? 0 });
            si += 3;
        }
    },
    heroPos: (): { lcol: number; xv: number } => {
        const mem = getGmem();
        return { lcol: (mem[0x80] ?? 0) | ((mem[0x81] ?? 0) << 8), xv: mem[0x83] ?? 0 };
    },
    /** Teleport hero. */
    setHeroPos: (lcol: number, xv: number): void => {
        writeMemory(0x80, Uint8Array.of(lcol & 0xff, (lcol >> 8) & 0xff));
        writeMemory(0x83, Uint8Array.of(xv & 0xff));
    },
    bldActive: (): number => getGmem()[0xfffa] ?? 0,
    /** Read one g_mem byte. */
    mem: (addr: number): number => getGmem()[addr] ?? 0,
    /** Read a g_mem word (little-endian). */
    mem16: (addr: number): number =>
        (getGmem()[addr] ?? 0) | ((getGmem()[addr + 1] ?? 0) << 8),
    /** Write g_mem bytes. */
    writeMem: (addr: number, ...vals: number[]): void =>
        writeMemory(addr, Uint8Array.of(...vals)),
};

// ─── Touch controls (smartphone mode) ─────────────────────────────────────────
if (detectTouchDevice(navigator, window)) {
    initTouchControls({
        getSpeedChangePhase,
        getModalInputActive,
    });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
