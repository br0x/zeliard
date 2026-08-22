/**
 * game.js — Zeliard web port, main entry point (refactored).
 *
 * Indoor activities moved to separate modules. A generic menu/dialog
 * system is used by Sage and can be reused by other buildings.
 */
import { OpeningIntro }  from './opening-intro.js';
import { EndingDemo }    from './ending-demo.js';
import { KingScene }     from './indoor-king.js';
import { PrincessScene } from './indoor-princess.js';
import { SageScene }     from './indoor-sage.js';
import { WeaponShopScene } from './indoor-weapon-shop.js';
import { WitchcraftShopScene } from './indoor-magic-shop.js';
import { ChurchScene }   from './indoor-church.js';
import { BankScene }     from './indoor-bank.js';
import { InnScene }      from './indoor-inn.js';
import { SaveDialog, RestoreDialog } from './save-restore-ui.js';
import { ImportExportDialog } from './import-export-ui.js';
import { InventoryScreen } from './inventory-screen.js';
import { SoundManager } from '../audio/sound-manager.js';
import {
    getSaveSlotNames,
    saveGameToSlot,
    deleteGameFromSlot,
    loadGameFromSlot,
    saveGame,
    loadGame,
} from '../platform/save.js';
import { keys, setKeyState } from '../input/key-state.js';
import { KeyRouter, KeyEdgeLatches, PREVENT_DEFAULT_CODES } from '../input/key-router.js';
import {
    TILE_SIZE, VIEW_COLS, VIEW_ROWS, VIEW_WIDTH,
    RUN_TOWN_ENTRY_ON_START, RETURN_BEFORE_TOWN_MAIN_LOOP, STDPLY_PATH, START_TOWN_MDT_PATH,
    NOTIFICATION_STRINGS, TOWN_TILE_SHEET_COLS, TOWN_MAP_TILE_OFFSET, TOWN_VIEW_ROWS,
    TOWN_MAP_START_ROW, TOWN_HEADS_START_ROW, TOWN_SIDEWALK1_START_ROW, TOWN_SIDEWALK2_START_ROW,
    TOWN_VISIBLE_COL_OFFSET, TOWN_ANIMATION_FULL_TICKS, TOWN_BACKGROUND_ROWS, TOWN_MDTS,
    HERO_FRAME_W, HERO_FRAME_H, HERO_BASE_Y, PROX_COLS,
    DUNGEON_MAP_HEIGHT, PROX_SIZE, DUNGEON_VIEW_LEFT_IN_PROX, DUNGEON_ENTITY_W,
    DUNGEON_ENTITY_H, DUNGEON_HERO_FRAME_W, DUNGEON_HERO_FRAME_H, DUNGEON_SWORD_FRAME_W,
    DUNGEON_SWORD_FRAME_H, DUNGEON_HERO_SHEET_COLS, DUNGEON_SWORD_SHEET_COLS, ANIM_SPEED_TICKS,
    FRAME_LEFT_WALK_BASE, FRAME_FACING_AWAY, FRAME_RIGHT_WALK_BASE, FRAME_LEFT_STAND,
    FRAME_RIGHT_STAND,
} from '../config/engine.js';
import {
    DUNGEON_DCHR_SHEET_PATH, DUNGEON_MAGIC_SHEET_PATH, DUNGEON_HERO_SHEET_PATH, DUNGEON_SWORD_SHEET_PATH,
    PATTERN_ASSETS, SWORD_REACH_SMALL, SWORD_REACH_MEDIUM, SWORD_REACH_LARGE,
    SWORD_OVERLAY_OFFSETS, TOWN_BACKGROUND_YMPD_PATH, TOWN_SIDEWALK1_YMPD_PATH, TOWN_SIDEWALK2_YMPD_PATH,
    TOWN_BACKGROUND_CKPD_PATH, TOWN_BACKGROUND0_CKPD_PATH, TOWN_SIDEWALK1_CKPD_PATH, TOWN_SIDEWALK2_CKPD_PATH,
    ROKA_IMAGE_PATHS, DMAN_SHEET_PATH, TEAR_BLUE_PATH, TEAR_RED_PATH,
    SPARKLE_48_PATH, SPARKLE_WIDE_PATH, ENCOUNTER_IMAGE_PATH, TEAR_SLOTS_BLUE,
    TEAR_SLOT_RED, MOLE_IMG_H, TEAR_FLAGS, HERO_SPRITE_PATH,
    PRINCESS_CHAMBER_PATH, KING_IMAGE_PATHS, SAGE_IMAGE_PATH, ITEMP_SWORD_IMAGE_PATHS,
    ITEMP_SHIELD_IMAGE_PATHS, ITEMP_MAGIC_IMAGE_PATHS, NPC_SPRITE_PATHS, NPC_FRAME_W,
    NPC_FRAME_H, NPC_FRAMES, LLAMA_TOWN_ID, PROJECTILE_STRUCT_SIZE,
    MAGIC_PROJECTILE_STRIDE,
} from '../data/assets.js';

import { Hud } from '../ui/hud.js';
import { ModalManager } from '../ui/modal-manager.js';
import { SpeedChangeDialog, displayedSpeed } from '../core/speed-change.js';
import {
    RokaDemo,
    ROKADEMO_CENTER_DX, ROKADEMO_HERO_Y, ROKADEMO_TEAR_CENTER,
    ROKADEMO_RUN_STEPS,
    SWORD_VISIBLE_STATES,
    rokademoSwordFrame, rokademoSlotCenter, rokademoLandCenter,
    DMAN_FRAME_W, DMAN_FRAME_H, DMAN_SHEET_COLS,
} from '../core/roka-demo.js';
import { ConversationManager, readNpcConversationBytes } from '../core/conversation.js';
import { parseDialogText as parseDialogTextImpl } from '../core/conversation-text.js';
import { layoutConversationBox, drawConversationBox } from '../ui/conversation-draw.js';
import {
    computeTownScrollFromAbsoluteX,
    encodeBossState,
    getTownMapWidth,
    resolveMusicTrack,
} from '../core/transitions.js';
import { downloadSaveFile, pickSaveFile } from '../platform/save-file.js';

// Save persistence now lives in platform/save.ts (Stage 2); re-exported here
// so save-restore-ui.js / import-export-ui.js keep importing from game.js.
export {
    getSaveSlotNames,
    saveGameToSlot,
    deleteGameFromSlot,
    loadGameFromSlot,
    saveGame,
    loadGame,
};

// ─── Engine / Canvas config ───────────────────────────────────────────────────
import {
    EAI1, EAI2, CRAB, TAKO,
    EAI3, TORI, EAI4, EAI5,
    ZELA, MEDA, EAI6, LEGA,
    EAI7, DRGN, EAI8, ZEL2,
    AKMA, MAO1, MAO2, DUNGEONS,
} from '../data/dungeons.js';




import {
    ADDR_BYTE4, ADDR_SPOKE_TO_KING, ADDR_ENTERED_CAVERN_FIRST_TIME, ADDR_CALIENTE_ITEMS,
    ADDR_FALTER_ITEMS, ADDR_DEATH_ALREADY_PROCESSED, ADDR_PROXIMITY_MAP_LEFT_COL, ADDR_VIEWPORT_TOP_ROW,
    ADDR_HERO_X_VIEW, ADDR_HERO_HEAD_Y_VIEW, ADDR_HERO_GOLD_HI, ADDR_HERO_GOLD_LO,
    ADDR_HERO_ALMAS, ADDR_HERO_LEVEL, ADDR_HERO_XP, ADDR_HERO_HP,
    ADDR_SWORD_TYPE, ADDR_SHIELD_TYPE, ADDR_SHIELD_HP, ADDR_ELF_CREST,
    ADDR_HERO_CREST, ADDR_CURR_SPELL_TYPE, ADDR_TEAR_COUNT, ADDR_SPELL_COUNTS,
    ADDR_HERO_MAX_HP, ADDR_FACING, ADDR_LEFT_RUN, ADDR_PLACE_MAP_ID,
    ADDR_LAST_SAGE_VISITED, ADDR_SAGES_SPOKEN, ADDR_HERO_ANIM_PHASE, ADDR_INVINCIBILITY_FLAG,
    ADDR_BOSS_STATE_BLOCK, ADDR_BYTE_9EED, ADDR_BYTE_9F00, ADDR_BOSS_PLACEMENT,
    ADDR_HERO_X_IN_PROXIMITY_MAP, ADDR_DOOR_TARGET_Y, ADDR_DOOR_FEATURES, ADDR_BOSS_STATE_PTR,
    ADDR_TOWN_DESCRIPTOR_PTR, ADDR_MAP_WIDTH, ADDR_DUNGEON_ENTRANCE_TABLE,
    ADDR_NPC_ARRAY_PTR, ADDR_MONSTERS_LIST, ADDR_CAVERN_LEVEL, ADDR_TEAR_X,
    ADDR_HERO_Y_VIEW_INIT, ADDR_CAVERN_SIGNS_INFO, ADDR_PROXIMITY_MAP, ADDR_VIEWPORT_ENTITIES,
    ADDR_MAGIC_PROJECTILES, ADDR_MAGIA_STONE_SPRITE0, ADDR_PROJECTILES_LIST, ADDR_PROXIMITY_LAYER2,
    ADDR_BOSS_EXPLOSIONS_LIST, ADDR_FRAME_TIMER, ADDR_SPACEBAR_LATCH, ADDR_ALTKEY_LATCH,
    ADDR_SPRITE_FLASH_FLAG, ADDR_BOSS_IS_DEAD, ADDR_VIEWPORT_LEFT_TOP, ADDR_SPEED_CONST,
    ADDR_IS_BOSS_CAVERN, ADDR_HERO_SPRITE_HIDDEN, ADDR_SQUAT_FLAG, ADDR_ON_ROPE_FLAGS,
    ADDR_HERO_HIDDEN_FLAG, ADDR_SPELL_ACTIVE_FLAG, ADDR_JUMP_PHASE_FLAGS, ADDR_BYTE_FF3E,
    ADDR_SHIELD_ANIM_PHASE, ADDR_SHIELD_ANIM_ACTIVE, ADDR_SHIELD_VARIANT_INDEX, ADDR_SLOPE_DIRECTION,
    ADDR_SWORD_SWING_FLAG, ADDR_UI_ELEMENT_DIRTY, ADDR_SWORD_HIT_TYPE, ADDR_SWORD_MOVEMENT_PHASE,
    ADDR_SOUND_FX_REQUEST, ADDR_HEARTBEAT_VOLUME, ADDR_DUNGEON_STATE, ADDR_DUNGEON_FRAME_PHASE,
    ADDR_RENDER_REQUEST, ADDR_RENDER_DONE, ADDR_GOLD_RENDER_REQUEST, ADDR_DEATH_COUNTER,
    ADDR_NOTIFICATION_MSG_ID, ADDR_NOTIFICATION_FLAG, ADDR_ALMAS_RENDER_REQUEST, ADDR_HEALTH_BAR_REQUEST,
    ADDR_SHIELD_HP_RENDER_REQUEST, ADDR_ROKA_PHASE, ADDR_ROKA_COLOR, ADDR_BOSS_HEALTH_REQUEST,
    ADDR_BOSS_MODE, ADDR_CAVERN_SIGN_FLAG, ADDR_CAVERN_SIGN_IDX, ADDR_MAGIC_LEFT_RENDER_REQUEST,
    ADDR_SWORD_RENDER_REQUEST, ADDR_SWORD_GFX_RELOAD_REQUEST, ADDR_DUNGEON_EXIT_FLAG, ADDR_HERO_DEATH_FLAG,
    ADDR_PENDING_TRANSITION_FLAG, ADDR_CONVERSATION_ACTIVE, ADDR_BUILDING_ACTIVE, ADDR_BUILDING_DEST_ID,
    ADDR_PENDING_DUNGEON_MAP, ADDR_PENDING_DUNGEON_FLAG, DUNGEON_STATE_DEATH_FALL, DUNGEON_STATE_DEATH_FADE,
    DUNGEON_STATE_BOSS_ENCOUNTER, DUNGEON_STATE_ROKA_RUN, DUNGEON_STATE_ROKADEMO,
} from '../wasm/memory.js';


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
let getMusicTrackId;
let getTownBackgroundType;
let getTownPatId;
let inputSetKeys;
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
let initC015ObjIfExists;
let dungeonInit;
let dungeonUpdate;
let dungeonFullTick;
let dungeonGetViewportTop;
let dungeonGetEntityTable;
let dungeonGetEntityCount;
let setDungeonPassableTiles;
let setDungeonSlopeTilesLeft;
let setDungeonSlopeTilesRight;
let setDungeonAggressiveGround;
let setDungeonAirflows;
let setDungeonSwordReach;
let setDungeonMonsterXp;
let setDungeonMonsterDamage;
let setDeathDescriptors;
let setTrajectories;
let dungeonGetRenderRequest;
let dungeonClearRenderRequest;
let getBossName;
let dungeonCompleteBossEntry;
let finishRokademoTransition;

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
let dungeonAI = null;
let dungeonAIready = false;
let dungeonProjectiles = null;
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
let encounterImg = null;

// ─── Rokademo (tear-collection demo) asset state ──────────────────────────────
let dmanSheet = null;
let dmanSheetReady = false;
let tearBlueImg = null;
let tearRedImg = null;
let sparkle48Img = null;
let sparkleWideImg = null;
let rokademo = null;            // active demo state machine (null when idle)
let rokademoHold = false;       // keep showing the roka bg until the post-demo transition starts
let lastTearOverlayCount = -1;

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
    7: {
        name: 'The Inn',
        scene: InnScene,
    },
    // 8: Cavern (implemented differently)
};

const modalManager = new ModalManager(); // save/restore/import-export dialogs
let gamePaused = false;          // freeze game updates while modal is open
let inventoryScreenInstance = null; // instance of InventoryScreen

function openInventory() {
    if (inventoryScreenInstance || !engineReady) return;
    if (modalManager.isActive || indoorActiveScene || openingIntro.active || endingDemo.active) return;
    if (gameMode !== 'town' && gameMode !== 'dungeon') return;

    gamePaused = true;

    inventoryScreenInstance = new InventoryScreen({
        canvas, ctx, readMemory, writeMemory,
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
let currentMusicTrack = null;

function playCurrentMusic(fadeDuration = 1.5) {
    if (!currentMusicTrack) return;
    soundManager.playMusic(currentMusicTrack, fadeDuration);
    soundManager.setMusicMuted?.(!musicEnabled, 0);
}

function setCurrentMusicTrack(trackId) {
    if (trackId === currentMusicTrack) return;
    currentMusicTrack = trackId;
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
    if (_fullTickWaiters.length) {
        const stillWaiting = [];
        for (const waiter of _fullTickWaiters) {
            if (--waiter.remaining <= 0) waiter.resolve();
            else stillWaiting.push(waiter);
        }
        _fullTickWaiters = stillWaiting;
    }
    frameTimer  = (frameTimer  + 1) & 0xFF;
    tickCounter = (tickCounter + 1) & 0xFFFF;
    animTimer   = (animTimer   + 1) & 0xFFFF;
    if (gameMode === 'dungeon') {
        dungeonFullTick?.();
    }
    else townFullTick?.();

    if (engineReady) {
        inputSetKeys(keys);  // refresh input at 236 Hz before any dungeonUpdate reads it
        const speedC     = gMem(ADDR_SPEED_CONST) || 5;
        const target     = speedC * 4;
        const frameTmr   = gMem(ADDR_FRAME_TIMER);
        if (gameMode === 'dungeon') {
            // Bypass the speed gate during roka run so the 8-bit ADDR_FRAME_TIMER wraparound 
            // doesn't starve dungeonUpdate() and cause frame skips
            const isRokaRun = gMem(ADDR_DUNGEON_STATE) === DUNGEON_STATE_ROKA_RUN;
            if (isRokaRun || frameTmr >= target) {
                const phaseBefore = readU8(ADDR_DUNGEON_FRAME_PHASE);
                dungeonUpdate?.();
                // mirrors `inc render_counter` in Refresh_Dirty_Tiles: advance once
                // per completed dungeon frame. The WASM phase machine splits each
                // frame into 3 sub-steps (0→1→2→0), so dungeonUpdate() is called 3x
                // per frame; only step phase 2→0 finishes a frame
                if (isRokaRun || (phaseBefore === 2 && readU8(ADDR_DUNGEON_FRAME_PHASE) === 0)) {
                    renderCounter = (renderCounter + 1) & 0xFF;
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
            townUpdate?.();
            const scrollFlag = gMem(0xfff0);
            if (scrollFlag) {
                if (scrollFlag & 0x01) scrollFloorOneTileRight();
                if (scrollFlag & 0x02) scrollFloorOneTileLeft();
                if (scrollFlag & 0x04) scrollCeilingHalfTileRight();
                if (scrollFlag & 0x08) scrollCeilingHalfTileLeft();
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

    inputLatches.update(keys.Space, keys.Alt);
    inputSetKeys(keys);

    if (gameMode === 'dungeon') return;

    if (!conversation.active) {
        const activeFlag = gMem(0xFFF5);
        if (activeFlag) {
            startConversationFromWasm();
        }
    }

    if (conversation.active) {
        // Direction edges share state with the dungeon input path above.
        const dirUp = keys.ArrowUp && !lastDirUp;
        const dirDown = keys.ArrowDown && !lastDirDown;
        lastDirUp = keys.ArrowUp;
        lastDirDown = keys.ArrowDown;
        conversation.handleTick(!!dirUp, !!dirDown);
        return;
    }

    const scrollFlag = gMem(0xfff0);
    if (scrollFlag) {
        if (scrollFlag & 0x01) scrollFloorOneTileRight();
        if (scrollFlag & 0x02) scrollFloorOneTileLeft();
        if (scrollFlag & 0x04) scrollCeilingHalfTileRight();
        if (scrollFlag & 0x08) scrollCeilingHalfTileLeft();
        writeMemory(0xfff0, [0]);
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
        writeMemory(ADDR_SPEED_CONST, [10 - digit]);
        writeMemory(ADDR_SOUND_FX_REQUEST, [1]);
    },
    openInventory,
    setKey: setKeyState,
    resetInventoryCombo: () => inventoryScreenInstance?.resetDebugCombo(),
    modalHandleKey: (code, now) => modalManager.handleKey(code, now),
    inventoryHandleKey: (code, ctrl, shift, repeat) =>
        inventoryScreenInstance.handleKey(code, ctrl, shift, repeat),
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
        await loadWasmEngine();
        await initWasm();

        if (getWasmMemory) {
            soundManager.setWasmMemAccessor(getWasmMemory);
        }

        townInit?.();

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
        // ADDR_HEARTBEAT_VOLUME (0xFF08) lives outside the save area, so it
        // survives a restore with the stale dungeon value and would keep the
        // boss-heartbeat loop going in town. Clear it here; the dungeon code
        // (update_boss_heartbeat_volume) recomputes it on the next frame.
        writeMemory(ADDR_HEARTBEAT_VOLUME, [0]);
        lastTearOverlayCount = -1;
        syncTearOverlay();
        const placeId = saveState[ADDR_PLACE_MAP_ID] & 0x7f;
        const mdtPath = TOWN_MDTS[placeId];

        const response = await fetch(mdtPath);
        if (!response.ok) {
            throw new Error(`Failed to load ${mdtPath}: ${response.status}`);
        }
        mdtData = new Uint8Array(await response.arrayBuffer());
        loadMdt(mdtData, mdtPath);
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
        await loadEncounterImage();
        await loadRokademoAssets();

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

        const trackId = resolveMusicTrack(getMusicTrackId());
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

async function loadRokaImages() {
    if (rokaImagesReady) return Promise.resolve(rokaImages);
    const loads = ROKA_IMAGE_PATHS.map((path, index) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => { rokaImages[index] = img; return img; });
    });
    await Promise.all(loads);
    rokaImagesReady = true;
    return rokaImages;
}

async function loadRokademoAssets() {
    if (dmanSheetReady) return;
    await Promise.all([
        loadImageOnce(DMAN_SHEET_PATH,   img => { dmanSheet = img; }),
        loadImageOnce(TEAR_BLUE_PATH,    img => { tearBlueImg = img; }),
        loadImageOnce(TEAR_RED_PATH,     img => { tearRedImg = img; }),
        loadImageOnce(SPARKLE_48_PATH,   img => { sparkle48Img = img; }),
        loadImageOnce(SPARKLE_WIDE_PATH, img => { sparkleWideImg = img; }),
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
    if (!dungeonAIready) {
        dungeonAI = DUNGEONS[rawMapId].ai;
        dungeonAIready = true;
        dungeonProjectiles = DUNGEONS[rawMapId].projectiles;
    }
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
    const raw = readMemory(descPtr + 1, 1)[0];
    townNpcSpriteCategory = raw < NPC_SPRITE_PATHS.length ? raw : 0;
}

async function loadWasmEngine() {
    const wasmBridge = await import('../wasm/bridge.js');
    ({
        initWasm, loadSaveState, loadMdt, getCavernMdtHeader, getCavernName,
        getTownMdtHeader, getTownName, getMusicTrackId, getTownBackgroundType,
        getTownPatId, inputSetKeys, getWasmMemory, townInit,
        townSetReturnBeforeMainLoop, townEntryDisablingEdgeScroll, townUpdate,
        townFullTick, hasWasmExport, setSpecialTileList, readMemory, writeMemory,
        getTownPendingTransitionFlag, getTownPendingTransition, townCompleteTransition,
        townEntryEnablingEdgeScroll, townFinishConversation, townFinishBuilding, initC015ObjIfExists,
        dungeonInit, dungeonUpdate, dungeonFullTick, dungeonGetViewportTop,
        dungeonGetEntityTable, dungeonGetEntityCount,
        setDungeonPassableTiles, setDungeonAggressiveGround, 
        setDungeonSlopeTilesLeft, setDungeonSlopeTilesRight, setDungeonAirflows,
        setDungeonSwordReach, setDungeonMonsterXp, setDungeonMonsterDamage, setDeathDescriptors, setTrajectories,
        dungeonGetRenderRequest, dungeonClearRenderRequest, getBossName,
        dungeonCompleteBossEntry, finishRokademoTransition,
    } = wasmBridge);
}

const speedDialog = new SpeedChangeDialog(); // F9 game-speed state machine

// Used by touch-controls.js to show a mobile digit pad while the
// speed-change dialog is waiting for input.
export function getSpeedChangePhase() {
    return speedDialog.touchPhase;
}

// ─── Town scroll helpers ──────────────────────────────────────────────────────
function resetTownScrollOffsets() {
    townSidewalk1OffsetX = 0;
    townSidewalk2OffsetX = 0;
    townCeilingOffsetX = 0;
}

const scrollFloorOneTileRight = () => {
    townSidewalk1OffsetX = (townSidewalk1OffsetX - TILE_SIZE + VIEW_WIDTH) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX - TILE_SIZE*2 + VIEW_WIDTH) % VIEW_WIDTH;
};

const scrollFloorOneTileLeft = () => {
    townSidewalk1OffsetX = (townSidewalk1OffsetX + TILE_SIZE) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX + TILE_SIZE*2) % VIEW_WIDTH;
};

const scrollCeilingHalfTileRight = () => {
    townCeilingOffsetX = (townCeilingOffsetX - TILE_SIZE/2 + VIEW_WIDTH) % VIEW_WIDTH;
};

const scrollCeilingHalfTileLeft = () => {
    townCeilingOffsetX = (townCeilingOffsetX + TILE_SIZE/2) % VIEW_WIDTH;
};

// ─── Town drawing functions ───────────────────────────────────────────────────
function drawTownBackground() {
    if (!townBackgroundReady) return false;
    ctx.drawImage(townBackground, 0, 0);
    return true;
}

function drawTownCeiling() {
    if (!townBackgroundType || !townCeilingReady || !townBackgroundReady) return false;
    ctx.drawImage(townBackground, 0, 0, canvas.width, TILE_SIZE*2, 0, 0, canvas.width, TILE_SIZE*2);
    const rightPartWidth = canvas.width - townCeilingOffsetX;
    if (rightPartWidth > 0) {
        ctx.drawImage(townCeiling, townCeilingOffsetX, 0, rightPartWidth, TILE_SIZE*2,
                      0, 0, rightPartWidth, TILE_SIZE*2);
    }
    const leftPartWidth = townCeilingOffsetX;
    if (leftPartWidth > 0) {
        ctx.drawImage(townCeiling, 0, 0, leftPartWidth, TILE_SIZE*2,
                      rightPartWidth, 0, leftPartWidth, TILE_SIZE*2);
    }
    return true;
}

function drawTownSidewalk() {
    if (!townSidewalk1Ready || !townSidewalk2Ready) return false;
    const rightPartWidth1 = canvas.width - townSidewalk1OffsetX;
    let y = TOWN_SIDEWALK1_START_ROW*TILE_SIZE;
    if (rightPartWidth1 > 0) {
        ctx.drawImage(townSidewalk1, townSidewalk1OffsetX, 0, rightPartWidth1, TILE_SIZE,
                      0, y, rightPartWidth1, TILE_SIZE);
    }
    const leftPartWidth1 = townSidewalk1OffsetX;
    if (leftPartWidth1 > 0) {
        ctx.drawImage(townSidewalk1, 0, 0, leftPartWidth1, TILE_SIZE,
                      rightPartWidth1, y, leftPartWidth1, TILE_SIZE);
    }
    const rightPartWidth2 = canvas.width - townSidewalk2OffsetX;
    y = TOWN_SIDEWALK2_START_ROW*TILE_SIZE;
    if (rightPartWidth2 > 0) {
        ctx.drawImage(townSidewalk2, townSidewalk2OffsetX, 0, rightPartWidth2, TILE_SIZE,
                      0, y, rightPartWidth2, TILE_SIZE);
    }
    const leftPartWidth2 = townSidewalk2OffsetX;
    if (leftPartWidth2 > 0) {
        ctx.drawImage(townSidewalk2, 0, 0, leftPartWidth2, TILE_SIZE,
                      rightPartWidth2, y, leftPartWidth2, TILE_SIZE);
    }
    return true;
}

// some tiles in the towns are animated (like waving flags, torches etc.)
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

/**
 * Draw the 28-column town tile map.
 *
 * Reads tile IDs directly from WASM linear memory (g_mem) rather than from
 * the JS-side mdtData copy. This is necessary because the WASM code's
 * init_c015_obj_if_exists() and save/restore_head_level_tiles_in_npcs()
 * dynamically modify the tile map in g_mem during town entry and conversation,
 * and those changes must be visible to the renderer.
 */
function drawTownTiles() {
    if (!mdtData || !townTileSheetReady) return false;
    const mapWidth = getTownMapWidth(mdtData);
    if (!mapWidth) return false;

    const mem = getWasmMemory?.();

    const leftCol = Math.max(0, Math.min(
        mapWidth - VIEW_COLS,
        readU16(ADDR_PROXIMITY_MAP_LEFT_COL) + TOWN_VISIBLE_COL_OFFSET
    ));
    for (let col = 0; col < VIEW_COLS; col++) {
        const mapCol = leftCol + col;
        for (let row = 0; row < TOWN_VIEW_ROWS; row++) {
            const mdtOffset  = TOWN_MAP_TILE_OFFSET + mapCol * TOWN_VIEW_ROWS + row;
            const wasmAddr   = ADDR_TOWN_DESCRIPTOR_PTR + TOWN_MAP_TILE_OFFSET + mapCol * TOWN_VIEW_ROWS + row;
            let tileId;
            if (mem) {
                tileId = mem[wasmAddr];
                if (tileId === 0xFD) {
                    tileId = mdtData[mdtOffset] ?? 0;
                }
            } else {
                tileId = mdtData[mdtOffset] ?? 0;
            }
            tileId = getAnimatedTownTileId(tileId);
            const sx = (tileId % TOWN_TILE_SHEET_COLS) * TILE_SIZE;
            const sy = Math.floor(tileId / TOWN_TILE_SHEET_COLS) * TILE_SIZE;
            ctx.drawImage(
                townTileSheet,
                sx, sy, TILE_SIZE, TILE_SIZE,
                col * TILE_SIZE, (row + TOWN_MAP_START_ROW) * TILE_SIZE,
                TILE_SIZE, TILE_SIZE
            );
        }
    }
    return true;
}

function drawTownHero() {
    if (!heroSpriteReady || !engineReady) return;
    gMem(0xFF33);
    const heroAnim = gMem(0x00E7);
    const facing   = gMem(0x00C2) & 1;
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
    const viewportX = gMem(0x0083);
    const dx = viewportX * TILE_SIZE;
    const dy = HERO_BASE_Y;
    ctx.drawImage(heroSprite, sx, 0, HERO_FRAME_W, HERO_FRAME_H, dx, dy, HERO_FRAME_W, HERO_FRAME_H);
}

function drawTownNpcs() {
    if (!engineReady || !readMemory) return;
    const ptrBytes = readMemory(ADDR_NPC_ARRAY_PTR, 2);
    const npcArrayAddr = ptrBytes[0] | (ptrBytes[1] << 8);
    if (!npcArrayAddr) return;
    const proxLeftBytes = readMemory(ADDR_PROXIMITY_MAP_LEFT_COL, 2);
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
        const screenX   = screenCol * TILE_SIZE;
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

function drawStaticTile(tileId, vpX, vpY) {
    const dx = vpX * TILE_SIZE;
    const dy = vpY * TILE_SIZE;
    if (tileId === 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
        return;
    }
    const mppCols = Math.floor(dungeonTileSheet.width / TILE_SIZE);
    const mppTiles = mppCols * Math.floor(dungeonTileSheet.height / TILE_SIZE);
    if (tileId >= 1 && tileId <= mppTiles) {
        drawSheetFrame(dungeonTileSheet, tileId - 1, TILE_SIZE, TILE_SIZE, mppCols, dx, dy);
    } else if (tileId >= 0x40 && dungeonDchrSheetReady) {
        const dchrCols = Math.floor(dungeonDchrSheet.width / TILE_SIZE);
        const dchrTiles = dchrCols * Math.floor(dungeonDchrSheet.height / TILE_SIZE);
        if (tileId - 0x40 < dchrTiles) {
            drawSheetFrame(dungeonDchrSheet, tileId - 0x40, TILE_SIZE, TILE_SIZE, dchrCols, dx, dy);
        }
    }
}

function drawDungeonTiles() {
    if (!dungeonTileSheetReady || !readMemory) return false;
    const proxMap = readMemory(ADDR_PROXIMITY_MAP, PROX_COLS * DUNGEON_MAP_HEIGHT);
    const layer2 = readMemory(ADDR_PROXIMITY_LAYER2, 0x80);
    const top = dungeonGetViewportTop?.() ?? 0;

    for (let row = 0; row < VIEW_ROWS; row++) {
        const proxRow = (top + row) & 0x3F;
        for (let col = 0; col < VIEW_COLS; col++) {
            const proxCol = col + DUNGEON_VIEW_LEFT_IN_PROX;
            let tileId = proxMap[proxRow*PROX_COLS + proxCol];
            // Entity markers temporarily replace the real map tile. The
            // original compositor restores that background from layer 2.
            if (tileId & 0x80) tileId = layer2[tileId & 0x7F];
            if (tileId === 0) continue;
            drawStaticTile(tileId, col, row);
        }
    }
    return true;
}

// Direct byte access into the cached WASM g_mem view. getWasmMemory()
// re-validates the view on every call and rebuilds it if the WASM memory
// buffer grew (old views are detached). Unlike readMemory(addr, 1)[0]
// this performs no Uint8Array allocation, which removes GC churn from the
// 236 Hz tick and per-frame render loops.
function gMem(addr) {
    const mem = getWasmMemory?.();
    return mem ? mem[addr] : 0;
}

function readU8(addr) {
    return gMem(addr);
}

function readU16(addr) {
    const mem = getWasmMemory?.();
    if (!mem) return 0;
    return mem[addr] | (mem[addr + 1] << 8);
}

// ─── Boss explosion ring sprite data ─────────────────────────────────────────
// Decoded from C gfmcga.c: each phase is 16×16 pixels, 2 bits/pixel (0=transparent,
// 1/2=inner color, 3=outer color).  Phases are ordered as in C
// boss_explosion_ring_phases[]: index 0 = frame 0 (most decayed) … index 3 = frame 3.
const BOSS_EXPLOSION_RING_DATA = (() => {
  const raw = [
    // Reordered to match C boss_explosion_ring_phases indexing:
    //   frame/life=0 → index 0 (most decayed), frame/life=3 → index 3 (most intact)
    // phase 3 – most decayed (C: boss_explosion_ring_phases[0])
    [ 0b0000000000101111, 0b1111010000000000, 0b0000000101111111, 0b1111111010000000,
      0b0000011111010000, 0b0000101111100000, 0b0000111100000000, 0b0000000011110000,
      0b0011110000000000, 0b0000000000111100, 0b0111100000000000, 0b0000000000011110,
      0b0111000000000000, 0b0000000000001110, 0b1111000000000000, 0b0000000000001111,
      0b1111000000000000, 0b0000000000001111, 0b0111000000000000, 0b0000000000001110,
      0b0111100000000000, 0b0000000000011110, 0b0011110000000000, 0b0000000000111100,
      0b0000111100000000, 0b0000000011110000, 0b0000011111010000, 0b0000101111100000,
      0b0000000101111111, 0b1111111010000000, 0b0000000000101111, 0b1111010000000000 ],
    // phase 2 (C: boss_explosion_ring_phases[1])
    [ 0b0000000000101111, 0b1111010000000000, 0b0000000101111111, 0b1111111010000000,
      0b0000011111111111, 0b1111111111100000, 0b0000111111111111, 0b1111111111110000,
      0b0011111111110100, 0b0010111111111100, 0b0111111110100000, 0b0000010111111110,
      0b0111111110000000, 0b0000000111111110, 0b1111111100000000, 0b0000000011111111,
      0b1111111100000000, 0b0000000011111111, 0b0111111110000000, 0b0000000111111110,
      0b0111111110100000, 0b0000010111111110, 0b0011111111110100, 0b0010111111111100,
      0b0000111111111111, 0b1111111111110000, 0b0000011111111111, 0b1111111111100000,
      0b0000000101111111, 0b1111111010000000, 0b0000000000101111, 0b1111010000000000 ],
    // phase 1 (C: boss_explosion_ring_phases[2])
    [ 0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
      0b0000000000101111, 0b1111010000000000, 0b0000000011111111, 0b1111111100000000,
      0b0000001111111111, 0b1111111111000000, 0b0000011111111111, 0b1111111111100000,
      0b0000111111111010, 0b0101111111110000, 0b0000111111110000, 0b0000111111110000,
      0b0000111111110000, 0b0000111111110000, 0b0000111111111010, 0b0101111111110000,
      0b0000011111111111, 0b1111111111100000, 0b0000001111111111, 0b1111111111000000,
      0b0000000011111111, 0b1111111100000000, 0b0000000000101111, 0b1111010000000000,
      0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000 ],
    // phase 0 – most intact (C: boss_explosion_ring_phases[3])
    [ 0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
      0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
      0b0000000000001011, 0b1101000000000000, 0b0000000001011111, 0b1111101000000000,
      0b0000000001111111, 0b1111111000000000, 0b0000000011111111, 0b1111111100000000,
      0b0000000011111111, 0b1111111100000000, 0b0000000001111111, 0b1111111000000000,
      0b0000000001011111, 0b1111101000000000, 0b0000000000001011, 0b1101000000000000,
      0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
      0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000 ]
  ];
  // Decode each phase into a flat Uint8Array of 256 pixel values (0–3)
  return raw.map(words => {
    const px = new Uint8Array(256);
    for (let i = 0; i < 32; i++) {
      let w = words[i];
      for (let j = 0; j < 8; j++) {
        px[i * 8 + j] = (w >> 14) & 3;
        w <<= 2;
      }
    }
    return px;
  });
})();

// Color tables for each mask variant.  Values are 0–255 RGB derived from the
// original VGA palette indices in boss_explosion_mask_variants:
//   variant 0: 0x1210 → palette indices 0x10(inner), 0x12(outer)
//   variant 1: 0x3630 → 0x30, 0x36
//   variant 2: 0x3F38 → 0x38, 0x3F
//   variant 3: 0x3630 → same as variant 1
const BOSS_EXPLOSION_COLORS = [
  { inner: [125,   0,   0], outer: [251,   0,   0] }, // red
  { inner: [125, 125,   0], outer: [251, 251,   0] }, // yellow
  { inner: [125,   0, 125], outer: [251,   0, 251] }, // magenta
  { inner: [125, 125,   0], outer: [251, 251,   0] }  // yellow
];

// Pre-rendered offscreen canvases for each (variant, phase) combo.
const _explosionRingCache = {};

function _getExplosionRingCanvas(variant, phase, scale) {
  const key = `${variant}_${phase}_${scale}`;
  if (_explosionRingCache[key]) return _explosionRingCache[key];

  const size = 16 * scale;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d');
  const img = cx.createImageData(size, size);
  const d = img.data;

  const colors = BOSS_EXPLOSION_COLORS[variant];
  const pixels = BOSS_EXPLOSION_RING_DATA[phase]; // 256 values

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const pv = pixels[y * 16 + x];
      if (pv === 0) continue;
      const rgb = pv === 3 ? colors.outer : colors.inner;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const di = ((y * scale + sy) * size + (x * scale + sx)) * 4;
          d[di]     = rgb[0];
          d[di + 1] = rgb[1];
          d[di + 2] = rgb[2];
          d[di + 3] = 255;
        }
      }
    }
  }
  cx.putImageData(img, 0, 0);
  _explosionRingCache[key] = c;
  return c;
}

// Tracks whether the explosion rings have been rendered this frame.
let _bossExplosionFrameRendered = false;

/*
 * Mirrors the spawning half of C Spawn_Boss_Explosion_Ring.
 *
 * Called per entity-tile processed by drawDungeonEntities while the boss
 * death flash is active.  Spawning writes a new ring into the shared
 * memory list at ADDR_BOSS_EXPLOSIONS_LIST.  The C-side
 * Boss_Explosions_Renderer handles decrement, compaction and VRAM
 * rendering; this function only draws the rings onto the canvas.
 *
 * Entity layout (4 bytes):
 *   [0] tile column (0..27)
 *   [1] tile row    (0..18)
 *   [2] lifetime counter (3→0, then removed; masked to 2 bits = frame index)
 *   [3] variant (0..3), selects boss_explosion_mask_variants
 */
function spawnBossExplosionRings(col, row) {
  // ── 1. Render existing rings onto canvas (read-only, once per frame) ────
  if (!_bossExplosionFrameRendered) {
    _bossExplosionFrameRendered = true;

    const scale = TILE_SIZE / 8; // 3 for 24px tiles
    let ptr = ADDR_BOSS_EXPLOSIONS_LIST;

    for (;;) {
      const x = readU8(ptr);
      if (x === 0xFF) break;

      const y = readU8(ptr + 1);
      const life = readU8(ptr + 2);
      const variant = readU8(ptr + 3);

      const phase = life & 3;
      const ring = _getExplosionRingCanvas(variant, phase, scale);
      ctx.drawImage(ring, x * TILE_SIZE, y * TILE_SIZE);

      ptr += 4;
    }
  }

  // ── 2. Spawn a new ring (probabilistic, each call) ───────────────────────
  if (row >= 16) return;
  if ((Math.random() * 16 | 0) >= 2) return; // ~⅛ probability (C: (r&0x0F)<14)

  // Find terminator
  let ptr = ADDR_BOSS_EXPLOSIONS_LIST;
  let count = 0;
  while (readU8(ptr) !== 0xFF) {
    ptr += 4;
    if (++count > 32) return;
  }
  if (count >= 32) return;

  // Random x offset – one of {-1,0,1} from the entity column
  let sx = (Math.random() * 4 | 0);
  while (sx === 3) sx = (Math.random() * 4 | 0);
  sx = sx - 1 + col;
  if (sx === 0xFF) sx = 4;
  if (sx >= 27)    sx = 26;

  // Random y offset – one of {-1,0,1} from the entity row
  let sy = (Math.random() * 4 | 0);
  while (sy === 3) sy = (Math.random() * 4 | 0);
  sy = sy - 1 + row;
  if (sy === 0xFF) sy = 0;

  const variant = Math.random() * 4 | 0;

  writeMemory(ptr,     [sx]);
  writeMemory(ptr + 1, [sy]);
  writeMemory(ptr + 2, [3]); // starting lifetime
  writeMemory(ptr + 3, [variant]);
  writeMemory(ptr + 4, [0xFF]); // terminator for next
}

function drawDungeonProjectiles() { // monsters projectiles
    if (!dungeonTileSheetReady || !readMemory) return;
    if (!dungeonProjectiles) return;
    const top = dungeonGetViewportTop?.() ?? 0;
    const cols = Math.floor(dungeonTileSheet.width / TILE_SIZE);
    let p = ADDR_PROJECTILES_LIST;
    for (;;) {
        const p_x_rel = gMem(p);
        if (p_x_rel === 0xFF) break;
        const vpX = p_x_rel - DUNGEON_VIEW_LEFT_IN_PROX;
        if (vpX < 0 || vpX >= VIEW_COLS) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const p_y_rel = gMem(p + 1);
        const vpY = (p_y_rel - top) & 0x3F;
        if (vpY >= VIEW_ROWS) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const typeId = gMem(p + 2);
        const stepCount = gMem(p + 3);
        if (typeId >= dungeonProjectiles.length) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const tiles = dungeonProjectiles[typeId];
        if (!tiles || tiles.length === 0) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const tileId = tiles[stepCount % tiles.length];
        const dx = vpX * TILE_SIZE;
        const dy = vpY * TILE_SIZE;
        drawSheetFrame(dungeonTileSheet, tileId - 1, TILE_SIZE, TILE_SIZE, cols, dx, dy);
        p += PROJECTILE_STRUCT_SIZE;
    }
}

// ---------------------------------------------------------------------------
// Magic spell projectile rendering
// ---------------------------------------------------------------------------

function getMagicFrameIndex(spellIndex, mpDir, animFrame) {
    if (spellIndex === 0) return animFrame;
    if (spellIndex === 1 && mpDir) return 3 + animFrame;
    if (spellIndex === 1) return 6 + animFrame;
    if (spellIndex === 2 && mpDir && animFrame === 0) return 9;
    if (spellIndex === 2 && !mpDir && animFrame === 0) return 10;
    if (spellIndex === 2) return 10 + animFrame;
    if (spellIndex === 3 && mpDir) return 15 + animFrame;
    if (spellIndex === 3) return 18 + animFrame;
    if (spellIndex === 4) return 21;
    if (spellIndex === 5 && mpDir) return 22 + animFrame;
    if (spellIndex === 5) return 25 + animFrame;
    return 0;
}

function drawDungeonMagicProjectiles() {
    if (!dungeonMagicSheetReady || !readMemory) return;
    const currentSpell = readU8(0x9D);
    if (currentSpell === 0 || currentSpell === 7) return;
    const spellIndex = currentSpell - 1;
    const top = dungeonGetViewportTop?.() ?? 0;

    // The original fires the spell at the very end of a game frame, and only
    // renders the projectile after the NEXT frame's dispatch has advanced it
    // (update_active_projectiles_render runs after dispatch_spell_projectile_movement).
    // Until then the master slot's mp_life_timer is 0, so skip the whole spell
    // rather than draw it at the spawn position (on top of the hero).
    // Only the master slot's timer is ever incremented (rascar/agua leave the
    // other slots' timers at 0 forever), so a per-slot `lifeTimer === 0` check
    // would wrongly hide those beams/bubbles.
    const masterXRel = readU16(ADDR_MAGIC_PROJECTILES);
    const masterLife = (masterXRel & 0xFF00) === 0xFF00 ? 0xFF : readU8(ADDR_MAGIC_PROJECTILES + 4);
    if (masterLife === 0) return;

    for (let outer = 0; outer < 4; outer++) {
        const addr = ADDR_MAGIC_PROJECTILES + outer * MAGIC_PROJECTILE_STRIDE;
        const xRel = readU16(addr);
        if (xRel === 0xFFFF) return;
        if ((xRel >> 8) === 0xFF) continue;

        const yRel = readU8(addr + 2);
        const mpDir = readU8(addr + 3);
        const animFrame = readU8(addr + 5);

        const leftCol = readU16(ADDR_PROXIMITY_MAP_LEFT_COL);
        const mapWidth = readU16(ADDR_MAP_WIDTH);

        let relX;
        if (xRel >= leftCol) {
            relX = xRel - leftCol;
            if (relX >= 36) continue;
        } else {
            if (xRel >= 36) continue;
            relX = mapWidth - leftCol + xRel;
            if (relX >= 36) continue;
        }

        const vpX = relX - DUNGEON_VIEW_LEFT_IN_PROX;
        const relY = (yRel - top) & 0x3F;
        const frameIdx = getMagicFrameIndex(spellIndex, mpDir, animFrame);
        const srcX0 = frameIdx * 48;

        for (let sub = 0; sub < 4; sub++) {
            const sx = vpX + (sub & 1);
            if (sx < 0 || sx >= VIEW_COLS) continue;
            const sy = (relY + (sub >> 1)) & 0x3F;
            if (sy >= VIEW_ROWS) continue;
            ctx.drawImage(
                dungeonMagicSheet,
                srcX0 + (sub & 1) * TILE_SIZE,
                (sub >> 1) * TILE_SIZE,
                TILE_SIZE, TILE_SIZE,
                sx * TILE_SIZE, sy * TILE_SIZE,
                TILE_SIZE, TILE_SIZE,
            );
        }
    }
}

let _guerraEffectRunning = false;
let _guerraFlashActive   = false;
let _guerraRings         = null; // outline rects accumulated while the effect runs
// How many full ticks (~236.7 Hz each) each rectangle stays on screen before
// the next one is drawn. ~2 keeps the whole process close to the original.
const _guerraFullTicksPerRect = 3;
let _fullTickWaiters = [];

// Resolves after `count` game full ticks. The Guerra effect advances one
// rectangle per interval while rendering continues every rAF frame.
function waitFullTicks(count) {
    return new Promise(resolve => _fullTickWaiters.push({ remaining: count, resolve }));
}

// Renders the persistent Guerra overlay each frame: the red XOR flash plus the
// expanding yellow/black outline rectangles drawn so far.
function drawGuerraOverlay() {
    if (_guerraFlashActive) {
        const viewW = VIEW_COLS * TILE_SIZE;
        const viewH = VIEW_ROWS * TILE_SIZE;
        const img = ctx.getImageData(0, 0, viewW, viewH);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] ^= 0xFF; // XOR the viewport content with red
        }
        ctx.putImageData(img, 0, 0);
    }
    if (_guerraRings) {
        const t = 3; // flat border thickness in px
        for (const ring of _guerraRings) {
            ctx.fillStyle = ring.color;
            ctx.fillRect(ring.left, ring.top, ring.width, t);
            ctx.fillRect(ring.left, ring.top + ring.height - t, ring.width, t);
            ctx.fillRect(ring.left, ring.top, t, ring.height);
            ctx.fillRect(ring.left + ring.width - t, ring.top, t, ring.height);
        }
    }
}

async function renderGuerraEffect() {
    const heroX   = readU8(ADDR_HERO_X_VIEW) * TILE_SIZE;
    const heroY   = readU8(ADDR_HERO_HEAD_Y_VIEW) * TILE_SIZE;
    const baseW   = 3 * TILE_SIZE;   // hero box: 3x3 tiles
    const baseH   = 3 * TILE_SIZE;
    const grow    = 1.5 * TILE_SIZE; // each rectangle is 3 tiles bigger than the previous
    const offsets = [0, 0.5, 1];     // interleaved so consecutive rings grow every half tile
    const viewW   = VIEW_COLS * TILE_SIZE;
    const viewH   = VIEW_ROWS * TILE_SIZE;

    _guerraRings = [];
    _guerraFlashActive = true;

    for (const pass of [
        { color: 'rgb(255,255,0)', rounds: 3 }, // yellow: 3 rounds of 9 rectangles
        { color: 'rgb(0,0,0)',     rounds: 3 }, // black: clear the rings above
    ]) {
        for (let round = 0; round < pass.rounds; round++) {
            const start = offsets[round] * TILE_SIZE;
            for (let i = 0; i < 9; i++) {
                const r       = start + i * grow;
                const left    = Math.max(0, heroX - r);
                const top     = Math.max(0, heroY - r);
                const right   = Math.min(viewW, heroX + baseW + r);
                const bottom  = Math.min(viewH, heroY + baseH + r);
                _guerraRings.push({ left, top, width: right - left, height: bottom - top, color: pass.color });
                await waitFullTicks(_guerraFullTicksPerRect);
            }
        }
    }

    _guerraRings = null;
    _guerraFlashActive = false;
}

let renderCounter = 0; // incremented once per dungeon game tick, used to animate tiles every or every odd frame

// entityId (bitmasked to 0x7F) -> remaining flash frames for visual hit feedback
const _entityHitFlashTimers = new Map();
// offscreen canvas for per-sprite tinting (avoids tinting background tiles)
const _tintCanvas = document.createElement('canvas');
_tintCanvas.width = DUNGEON_ENTITY_W;
_tintCanvas.height = DUNGEON_ENTITY_H;
const _tintCtx = _tintCanvas.getContext('2d');

function wrapProximityAddress(addr) {
    return ADDR_PROXIMITY_MAP
        + (((addr - ADDR_PROXIMITY_MAP) % PROX_SIZE) + PROX_SIZE) % PROX_SIZE;
}

// The original calls the cavern handlers once per Refresh_Dirty_Tiles. Keep
// animation independent from rAF rendering so a tile advances at most once per
// game tick, even when the canvas is drawn multiple times.
let lastAnimatedRenderCounter = renderCounter;
function animateDungeonTiles() {
    if (!readMemory || lastAnimatedRenderCounter === renderCounter) return;
    lastAnimatedRenderCounter = renderCounter;

    const cavernLevel = readU8(ADDR_CAVERN_LEVEL);
    if (cavernLevel < 5 || cavernLevel > 8) return;

    const oddTick = (renderCounter & 1) !== 0;
    const viewportLeftTop = readU16(ADDR_VIEWPORT_LEFT_TOP);

    // Batch-read the whole proximity map once. It is a direct view into WASM
    // g_mem, so advancing a tile is a plain array write (no allocation, no
    // per-tile writeMemory). Nothing here re-enters WASM, so the view cannot
    // be invalidated while this synchronous loop runs.
    const proxMap = readMemory(ADDR_PROXIMITY_MAP, PROX_SIZE);

    for (let row = 0; row < VIEW_ROWS; row++) {
        let si = wrapProximityAddress(
            viewportLeftTop + row * PROX_COLS + DUNGEON_VIEW_LEFT_IN_PROX
        );
        for (let col = 0; col < VIEW_COLS; col++, si = wrapProximityAddress(si + 1)) {
            const idx = si - ADDR_PROXIMITY_MAP;
            const tile = proxMap[idx];
            // Entity markers are not animated. Their background is held in
            // layer 2 until the game restores it after the entity moves.
            if (tile & 0x80) continue;

            let nextTile;
            if (cavernLevel === 5) { // Animate_Water_Cavern5; mpp5.grp: 0x1B↔0x1C - animated water tile
                if (!oddTick || (tile !== 0x1B && tile !== 0x1C)) continue;
                nextTile = tile === 0x1B ? 0x1C : 0x1B;
            } else if (cavernLevel === 6) { // Animate_Gold_Cavern6; mpp6.grp: 0x1D..0x20 (shiny gold) and 0x21↔0x22 (melted gold) animated tiles
                const phase = tile - 0x1D;
                if (phase < 0 || phase >= 6) continue;
                if (phase >= 4) {
                    nextTile = ((phase + 1) & 1) + 0x21;
                } else {
                    // Tile 1D pauses 75% of the time in the original.
                    if (phase === 0 && (Math.floor(Math.random() * 65536) & 3) !== 0) continue;
                    nextTile = ((phase + 1) & 3) + 0x1D;
                }
            } else if (cavernLevel === 7) { // Animate_Hot_Cavern7; mpp7.grp: 0x2C↔0x2D (jet), 0x0C..0x10, 0x33..0x3D (hot) animated tiles
                if (!oddTick) continue;
                if (tile === 0x2C || tile === 0x2D) {
                    nextTile = tile === 0x2C ? 0x2D : 0x2C;
                } else {
                    const starts = {
                        0x0E: 0x33,
                        0x0D: 0x36,
                        0x0F: 0x39,
                        0x0C: 0x3C,
                        0x10: 0x3D,
                    };
                    if (Object.hasOwn(starts, tile)) {
                        nextTile = starts[tile];
                    } else if (tile >= 0x33 && tile < 0x3E) {
                        const ends = {
                            0x35: 0x0E,
                            0x38: 0x0D,
                            0x3B: 0x0F,
                            0x3C: 0x0C,
                            0x3D: 0x10,
                        };
                        nextTile = Object.hasOwn(ends, tile) ? ends[tile] : tile + 1;
                    } else {
                        continue;
                    }
                }
            } else { // Animate_Thorn_Cavern8; mpp8.grp: 0x25..0x28 (thorns) animated tiles
                const phase = tile - 0x25;
                if (!oddTick || phase < 0 || phase >= 4) continue;
                nextTile = ((phase + 1) & 3) + 0x25;
            }

            proxMap[idx] = nextTile;
        }
    }
}

/*
 * Entity half of Refresh_Dirty_Tiles for a freshly cleared canvas.
 *
 * DOS kept VRAM between refreshes, so its 28x19 cache prevents individual
 * 8x8 quadrants from being overwritten. Replaying that cache after clearing
 * the browser canvas makes quadrants disappear or get drawn more than once.
 * Here the background is already complete, and each 2x2 entity is painted
 * exactly once in the same row-major order as the assembly scan.
 */
function drawDungeonEntities() {
    if (!dungeonEntitySheetReady || !readMemory) return;

    // In Refresh_Dirty_Tiles, 0xFF cache entries mean an earlier sprite (or
    // the hero) owns this destination tile. Recreate that ownership locally
    // for this freshly cleared frame; never carry it across rAF callbacks.
    const claimedTiles = new Uint8Array(VIEW_COLS * VIEW_ROWS);
    const bossExplosionActive =
        readU8(ADDR_IS_BOSS_CAVERN) && readU8(ADDR_SPRITE_FLASH_FLAG);
    // Spawn while scanning, but render the rings after every entity, as the
    // original Boss_Explosions_Renderer call does.
    _bossExplosionFrameRendered = Boolean(bossExplosionActive);

    for (const [id, frames] of _entityHitFlashTimers) {
        if (frames > 1) _entityHitFlashTimers.set(id, frames - 1);
        else _entityHitFlashTimers.delete(id);
    }

    let currentEntityFlashFrames = 0;

    function getSheetFrame(entityId) {
        const id = entityId & 0x7F;
        const ptr = readU16(ADDR_MONSTERS_LIST) + id * 16;
        // Batch-read the 16-byte monster entry (bytes 4/5/6 hold flags/dir/frame)
        // instead of four separate single-byte lookups.
        const entry = readMemory(ptr, 16);
        const dir = entry[5] & 0x80 ? "right" : "left";
        const flags = entry[4] & 0x1F;
        const offset = entry[6] & 0x0F;

        currentEntityFlashFrames = _entityHitFlashTimers.get(id) || 0;
        if ((flags & 0x18) === 0 && (entry[5] & 0x20)) {
            currentEntityFlashFrames = 6;
            _entityHitFlashTimers.set(id, 6);
        }
        // console.log('DFOE: ', dir, flags, offset, entityId);

        return dungeonAI[dir][flags][offset];
    }

    function drawEntity(frame, vpX, vpY) {
        if (!dungeonEntitySheet || frame < 0 || frame >= dungeonAI["numSprites"]) return;
        const sx = frame * DUNGEON_ENTITY_W;
        if (sx + DUNGEON_ENTITY_W > dungeonEntitySheet.width ||
            DUNGEON_ENTITY_H > dungeonEntitySheet.height) return;

        const tinted = currentEntityFlashFrames > 0;
        if (tinted) {
            _tintCtx.clearRect(0, 0, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H);
            _tintCtx.drawImage(
                dungeonEntitySheet,
                sx, 0, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H,
                0, 0, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H
            );
            _tintCtx.globalCompositeOperation = 'source-atop';
            _tintCtx.fillStyle = '#ffff00';
            _tintCtx.globalAlpha = 0.5;
            _tintCtx.fillRect(0, 0, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H);
            _tintCtx.globalCompositeOperation = 'source-over';
            _tintCtx.globalAlpha = 1.0;
        }

        for (let tileY = 0; tileY < 2; tileY++) {
            const destY = vpY + tileY;
            if (destY < 0 || destY >= VIEW_ROWS) continue;
            for (let tileX = 0; tileX < 2; tileX++) {
                const destX = vpX + tileX;
                if (destX < 0 || destX >= VIEW_COLS) continue;

                const claimedIndex = destY * VIEW_COLS + destX;
                if (claimedTiles[claimedIndex]) continue;
                claimedTiles[claimedIndex] = 1;

                const sourceX = tileX * TILE_SIZE;
                const sourceY = tileY * TILE_SIZE;
                const dx = destX * TILE_SIZE;
                const dy = destY * TILE_SIZE;
                ctx.drawImage(
                    dungeonEntitySheet,
                    sx + sourceX, sourceY, TILE_SIZE, TILE_SIZE,
                    dx, dy, TILE_SIZE, TILE_SIZE
                );
                if (tinted) {
                    ctx.drawImage(
                        _tintCanvas,
                        sourceX, sourceY, TILE_SIZE, TILE_SIZE,
                        dx, dy, TILE_SIZE, TILE_SIZE
                    );
                }
            }
        }
    }

    // Batch-read the whole proximity map once instead of a per-tile lookup,
    // then index the local array (si - ADDR_PROXIMITY_MAP is always in range
    // because wrapProximityAddress bounds si to the 36*64 circular buffer).
    const proxMap = readMemory(ADDR_PROXIMITY_MAP, PROX_SIZE);
    const viewportLeftTop = readU16(ADDR_VIEWPORT_LEFT_TOP);

    // Include the invisible row and left edge so partially visible sprites
    // are naturally clipped by the canvas, matching the assembly helpers.
    for (let row = -1; row < VIEW_ROWS; row++) {
        let si = wrapProximityAddress(viewportLeftTop + row * PROX_COLS + 3);
        for (let col = -1; col < VIEW_COLS; col++, si = wrapProximityAddress(si + 1)) {
            const entityId = proxMap[si - ADDR_PROXIMITY_MAP];
            if (!(entityId & 0x80)) continue;

            drawEntity(getSheetFrame(entityId), col, row);

            if (row >= 0 && col >= 0 && bossExplosionActive) {
                spawnBossExplosionRings(col, row);
            }
        }
    }

    if (bossExplosionActive) {
        _bossExplosionFrameRendered = false;
        spawnBossExplosionRings(0, VIEW_ROWS); // draw only; row 18 cannot spawn
    }
}

function getShieldCategory() {
    const shieldType = gMem(ADDR_SHIELD_TYPE);
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
        if (state.facingLeft) return 67 + phase + (state.shieldCategory * 4);
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

function drawDungeonMagiaStones() {
    if (!dungeonDchrSheetReady || !readMemory) return;
    for (let i = 0; i < 4; i++) {
        const base = ADDR_MAGIA_STONE_SPRITE0 + i * 7;
        if (gMem(base) === 0xFF) continue;
        if (gMem(base + 2) === 0) continue;
        const sx = gMem(base + 5);
        const sy = gMem(base + 6) & 0x3F;
        if (sy >= 19) continue; // outside viewport
        drawSheetFrame(dungeonDchrSheet, 0x26, TILE_SIZE, TILE_SIZE, 39, (sx - 4) * TILE_SIZE, sy * TILE_SIZE);
    }
}

function drawDungeonHero() {
    if (!dungeonHeroSheetReady || !engineReady || !readMemory) return;
    if (gMem(ADDR_HERO_SPRITE_HIDDEN)) return;
    const x0 = gMem(ADDR_HERO_X_VIEW);
    const y0 = gMem(ADDR_HERO_HEAD_Y_VIEW);
    const dx = x0 * TILE_SIZE;
    const dy = y0 * TILE_SIZE;
    const state = getDungeonHeroState();
    const armDy = state.squat ? dy + TILE_SIZE : dy;
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
    const swingFlag = gMem(ADDR_SWORD_SWING_FLAG);
    if (!swingFlag) {
        drawDungeonSword._swingStart = 0;
        return;
    }

    let phase = gMem(ADDR_SWORD_MOVEMENT_PHASE);
    const hitType = gMem(ADDR_SWORD_HIT_TYPE) || 0;
    const swordType = Math.max(1, Math.min(6, gMem(ADDR_SWORD_TYPE) || 1));
    const facingLeft = (gMem(ADDR_FACING) & 1) !== 0;

    // C code's Render_Sword_Overlay already increments ADDR_SWORD_MOVEMENT_PHASE,
    // so the stored value is display_phase + 1. If phase is 0, C hasn't processed
    // the swing yet — skip rendering until it does.
    if (phase === 0) {
        drawDungeonSword._swingStart = 0;
        return;
    }

    // JS-side timer: Render_Sword_Overlay is called twice per game cycle
    // (~84ms apart), but the odd phases (stored by the first call) are only
    // in memory for ~4.2ms — less than one rAF frame at 60fps.  Instead of
    // reading the raw C phase, we step a local timer at a consistent rate,
    // clamped to whatever the C code has already processed.
    const now = performance.now();
    if (!drawDungeonSword._swingStart) {
        drawDungeonSword._swingStart = now;
    }
    const cDisplayPhase = phase - 1;
    const PHASE_MS = 42; // one phase per ~42ms (2 phases per ~84ms game cycle)
    let displayPhase = Math.min(
        Math.floor((now - drawDungeonSword._swingStart) / PHASE_MS),
        cDisplayPhase
    );
    const MAX_DISPLAY = { 0: 5, 1: 3, 2: 0 };
    displayPhase = Math.min(displayPhase, MAX_DISPLAY[hitType] ?? 5);

    if (displayPhase !== drawDungeonSword._lastDisplay) {
        drawDungeonSword._lastDisplay = displayPhase;
    }

    let col;
    switch (hitType) {
        case 1: // overhead swing, phases 0..3 => column 5..8
            col = 5 + displayPhase;
            break;
        case 2: // downward thrust, single phase => column 9
            col = 9;
            break;
        default: // forward hit, phases 0..5 (phases 4 and 5 are the same, use column 4)
            col = Math.min(displayPhase, 4);
            break;
    }

    const baseRow = (swordType - 1) * 2;
    const row = baseRow + (facingLeft ? 1 : 0);
    const spriteIndex = row * DUNGEON_SWORD_SHEET_COLS + col;

    let dx = gMem(ADDR_HERO_X_VIEW) * TILE_SIZE;
    let dy = gMem(ADDR_HERO_HEAD_Y_VIEW) * TILE_SIZE;
    if (gMem(ADDR_SQUAT_FLAG)) {
        dy += TILE_SIZE;
    }

    // Apply per-phase overlay offsets (pairs of [x, y] in tile units).
    // C code stores these as 16-bit words: (x << 8) | y.
    let xOff, yOff;
    if (hitType === 2) {
        // Downward thrust: hardcoded per facing (C: 0xFF01 for left, 0x0001 for right)
        xOff = facingLeft ? -1 : 0;
        yOff = 1;
    } else {
        const offsetKey = hitType === 0
            ? (facingLeft ? 2 : 0)  // forward
            : (facingLeft ? 3 : 1); // overhead
        const offsets = SWORD_OVERLAY_OFFSETS[offsetKey];
        const i = displayPhase*2;//Math.min(displayPhase, (offsets.length >> 1) - 1) * 2;
        yOff = offsets[i];
        xOff = offsets[i + 1];
    }
    dx += xOff * TILE_SIZE;
    dy += yOff * TILE_SIZE;

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

let notificationStart = 0;
const NOTIFICATION_DURATION = 2500;

function drawDungeonBox(x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, TILE_SIZE/3);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = TILE_SIZE/6;
    ctx.stroke();
    ctx.restore();
}

function drawDungeonNotification() {
    const flag = readU8(ADDR_NOTIFICATION_FLAG);
    if (!flag) {
        notificationStart = 0;
        return;
    }

    const now = performance.now();
    if (!notificationStart) {
        notificationStart = now;
    }

    const elapsed = now - notificationStart;
    if (elapsed >= NOTIFICATION_DURATION) {
        writeMemory(ADDR_NOTIFICATION_FLAG, [0]);
        notificationStart = 0;
        return;
    }

    const msgId = readU8(ADDR_NOTIFICATION_MSG_ID);
    const entry = NOTIFICATION_STRINGS[msgId];
    if (!entry) return;
    const [leftPad, text] = entry;
    const x = TILE_SIZE;
    const y = TILE_SIZE * 2;
    const w = TILE_SIZE * (VIEW_COLS - 2);
    const h = TILE_SIZE * 2;

    drawDungeonBox(x, y, w, h);
    ctx.save();
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + leftPad*(TILE_SIZE/8), y + h / 2);
    ctx.restore();
}

function drawDungeonSign() {
    const flag = readU8(ADDR_CAVERN_SIGN_FLAG);
    if (!flag) return;

    const idx = readU8(ADDR_CAVERN_SIGN_IDX);
    const tablePtr = readU16(ADDR_CAVERN_SIGNS_INFO);
    const descPtr = readU16(tablePtr + idx * 2);

    // Descriptor: [top_margin-25] [box_height-2] then (x_delta, text... terminated by 0xFF) per line, '/' = newline
    const topY = readU8(descPtr) + TILE_SIZE + 3*(TILE_SIZE/8);
    const h = (readU8(descPtr + 1) + 2) * TILE_SIZE;

    const x = TILE_SIZE * 5;
    const y = TILE_SIZE;
    const w = TILE_SIZE * ((VIEW_COLS - 2*5));

    drawDungeonBox(x, y, w, h);
    ctx.save();
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';

    let offset = descPtr + 2;
    let cy = topY;

    while (true) {
        const xDelta = readU8(offset++);
        let bx = x + xDelta * 3;

        while (true) {
            let ch = readU8(offset++);
            if (ch === 0xFF) { ctx.restore(); return; }
            if (ch === 0x2F) { // CR/LF
                cy += (TILE_SIZE + TILE_SIZE/2);
                break; // will read xDelta in outer loop
            }
            if (ch === 0x5C) ch = 0x27;
            ctx.fillText(String.fromCharCode(ch), bx, cy);
            bx += TILE_SIZE;
        }
    }
    ctx.restore();
}

let prevRokaDx = -1;
let prevDungeonState = -1;
let encounterAnim = null;

function drawDungeonRoka() {
    if (!rokaImagesReady || !readMemory) return;
    const colorIdx = readU8(ADDR_ROKA_COLOR);
    const phase = readU8(ADDR_ROKA_PHASE);
    const facingLeft = (readU8(ADDR_FACING) & 1) !== 0;
    const animPhase = readU8(ADDR_HERO_ANIM_PHASE);
    const leftRun = readU8(ADDR_LEFT_RUN) !== 0;
    const invincible = readU8(ADDR_INVINCIBILITY_FLAG) !== 0;
    // const shieldAnimActive = readU8(ADDR_SHIELD_ANIM_ACTIVE) !== 0;
    // const shieldPhase = readU8(ADDR_SHIELD_ANIM_PHASE);
    const shieldVariant = readU8(ADDR_SHIELD_VARIANT_INDEX);
    const shieldCategory = getShieldCategory();

    const rokaImg = rokaImages[Math.min(colorIdx, ROKA_IMAGE_PATHS.length - 1)];
    if (!rokaImg) return;

    const t = phase / 25;
    const heroW = DUNGEON_HERO_FRAME_W;
    const heroH = DUNGEON_HERO_FRAME_H;
    let dx;
    if (leftRun) {
        dx = Math.round((1 - t) * (canvas.width - heroW));
    } else {
        dx = Math.round(t * (canvas.width - heroW));
    }
    const dy = 12 * TILE_SIZE;

    if (prevRokaDx === -1 || phase === 0) {
        ctx.drawImage(rokaImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.drawImage(rokaImg, prevRokaDx, dy, heroW, heroH, prevRokaDx, dy, heroW, heroH);
    }

    const state = {
        facingLeft,
        animPhase,
        invincible,
        squat: false,
        onRope: false,
        hidden: false,
        jump: 0,
        shieldAnimActive: false,
        shieldPhase: 0,
        shieldVariant,
        slope: 0,
        shieldCategory,
    };
    const layers = [
        { frame: resolveBackArmFrame(state), y: dy },
        { frame: resolveBodyFrame(state), y: dy },
        { frame: resolveFrontArmFrame(state), y: dy },
    ];
    for (const { frame, y } of layers) {
        if (frame === null) continue;
        drawSheetFrame(dungeonHeroSheet, frame, heroW, heroH,
            DUNGEON_HERO_SHEET_COLS, dx, y);
    }

    prevRokaDx = dx;
}

function drawDmanFrame(frame, dx, dy) {
    drawSheetFrame(dmanSheet, frame, DMAN_FRAME_W, DMAN_FRAME_H, DMAN_SHEET_COLS, dx, dy);
}

function drawSmallSparkle(frame, cx, cy) {
    if (!sparkle48Img) return;
    ctx.drawImage(sparkle48Img, frame * 48, 0, 48, 48, cx - 24, cy - 24, 48, 48);
}

function drawWideSparkle(frame, cx, cy) {
    if (!sparkleWideImg) return;
    ctx.drawImage(sparkleWideImg, frame * 192, 0, 192, 48, cx - 96, cy - 24, 192, 48);
}

function drawRokademoBackground() {
    const colorIdx = readU8(ADDR_ROKA_COLOR);
    const rokaImg = rokaImages[Math.min(colorIdx, ROKA_IMAGE_PATHS.length - 1)];
    if (rokaImg) {
        ctx.drawImage(rokaImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawRokademoTear(cx, cy) {
    const img = rokademo.isRed ? tearRedImg : tearBlueImg;
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

function finishRokaDemo(now) {
    finishRokademoTransition?.();
    rokademo = null;
    rokademoHold = true;
    // Bypass the speed gate on the next full tick so the exit/pending flags set
    // by wasm_finish_rokademo_transition are acted on immediately.
    const speedC = readMemory(ADDR_SPEED_CONST, 1)[0] || 5;
    writeMemory(ADDR_FRAME_TIMER, [speedC * 4]);
}

function drawDungeonRokademo(now) {
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
function setTearOverlayCount(count) {
    if (!tearOverlayEl) return;
    count = Math.max(0, Math.min(9, count));
    while (tearOverlayEl.children.length > count) {
        tearOverlayEl.removeChild(tearOverlayEl.lastChild);
    }
    for (let i = tearOverlayEl.children.length; i < count; i++) {
        const slot = i === 8 ? TEAR_SLOT_RED : TEAR_SLOTS_BLUE[i];
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

function drawEncounterText(alpha) {
    if (!encounterImg) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const x = (canvas.width - 622) / 2;
    const y = 3 * TILE_SIZE;
    ctx.drawImage(encounterImg, x, y, 622, 192);
    ctx.restore();
}

// set sword reachability list
function updateDungeonSwordReach() {
    const swordType = readMemory(ADDR_SWORD_TYPE, 1)[0];
    if (swordType <= 3) {
        setDungeonSwordReach(SWORD_REACH_SMALL);
    } else if (swordType <= 5) {
        setDungeonSwordReach(SWORD_REACH_MEDIUM);
    } else {
        setDungeonSwordReach(SWORD_REACH_LARGE);
    }
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
        loadMdt(mdtData, mdtPath);
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
        soundManager.setMusicDim(1.0);
        soundManager.setSfxVolume(1.0);
        const trackId = resolveMusicTrack(getMusicTrackId?.());
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
async function handleDungeonTransition(mapId, isFromTown) {
    if (dungeonTransitionInProgress) return;
    dungeonTransitionInProgress = true;
    engineReady = false;
    rokademoHold = false;
    try {
        writeMemory(ADDR_PENDING_DUNGEON_FLAG, [0]);
        const rawMapId = mapId & 0x7F;
        const dungeon = DUNGEONS[rawMapId];
        if (!dungeon) throw new Error(`No DUNGEONS entry for map ID ${rawMapId}`);
        const mdtPath = dungeon.mdtPath;
        const resp = await fetch(mdtPath);
        if (!resp.ok) 
            throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdt(mdtData, mdtPath);
        dungeonAIready = false;
        dungeonProjectiles = null;
        dungeonTileSheetReady = false;
        dungeonEntitySheetReady = false;
        mdtHeader = getCavernMdtHeader?.();
        cavernName = getCavernName?.() ?? 'Unknown';
        updatePlaceHud(cavernName);
        await loadDungeonAssets(rawMapId);
        setDungeonPassableTiles(DUNGEONS[rawMapId].passableTiles);
        setDungeonSlopeTilesLeft(DUNGEONS[rawMapId].slopeTilesLeft);
        setDungeonSlopeTilesRight(DUNGEONS[rawMapId].slopeTilesRight);
        setDungeonAggressiveGround(DUNGEONS[rawMapId].aggressiveGround);
        setDungeonAirflows(DUNGEONS[rawMapId].airflows);
        setDungeonMonsterXp(DUNGEONS[rawMapId].monster_xp);
        setDungeonMonsterDamage(DUNGEONS[rawMapId].monster_damage);
        setDeathDescriptors(DUNGEONS[rawMapId].death_descriptors);
        setTrajectories(DUNGEONS[rawMapId].trajectories);
        // Initialize boss state block if this map has one
        const bossState = DUNGEONS[rawMapId].bossState;
        if (bossState) {
            const { block, namePascal } = encodeBossState(bossState);
            writeMemory(ADDR_BOSS_STATE_BLOCK, block);
            writeMemory(ADDR_BOSS_STATE_BLOCK + 11, namePascal);   // +11
            writeMemory(ADDR_BOSS_STATE_PTR, [
                ADDR_BOSS_STATE_BLOCK & 0xFF, (ADDR_BOSS_STATE_BLOCK >> 8) & 0xFF,
            ]);
        }
        updateDungeonSwordReach();
        await loadRokaImages();
        await loadEncounterImage();
        dungeonInit?.(rawMapId, isFromTown); // should call dungeon::prepare_dungeon
        gameMode = 'dungeon';
        townEntryRan = false;
        const trackId = resolveMusicTrack(getMusicTrackId?.());
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
async function initTownFromDungeon(townMapId, isDeath) {
    if (dungeonExitInProgress) return;
    dungeonExitInProgress = true;
    engineReady = false;
    rokademoHold = false;
    try {
        writeMemory(ADDR_DUNGEON_EXIT_FLAG, [0]);
        if (isDeath) {
            writeMemory(ADDR_HERO_DEATH_FLAG, [0]);
        }
        resetBossHud();
        const rawMapId = townMapId & 0x7F;
        const mdtPath = TOWN_MDTS[rawMapId] ?? TOWN_MDTS[1] ?? TOWN_MDTS[0];
        const resp = await fetch(mdtPath);
        if (!resp.ok) throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdt(mdtData, mdtPath);
        mdtHeader = getTownMdtHeader?.();

        const mapWidth = getTownMapWidth(mdtData);
        const xBytes = readMemory(isDeath ? ADDR_TEAR_X : ADDR_HERO_X_IN_PROXIMITY_MAP, 2);
        const xProx = xBytes[0] | (xBytes[1] << 8);
        if (mapWidth) {
            const { proxLeft, heroViewX } = computeTownScrollFromAbsoluteX(xProx, mapWidth);
            writeMemory(ADDR_PROXIMITY_MAP_LEFT_COL, [proxLeft & 0xFF, (proxLeft >> 8) & 0xFF]);
            writeMemory(ADDR_HERO_X_VIEW, [heroViewX]);
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
        soundManager.setMusicDim(1.0);
        soundManager.setSfxVolume(1.0);
        const trackId = resolveMusicTrack(getMusicTrackId?.());
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

function getNpcConversationRaw(npcId) {
    return readNpcConversationBytes(readMemory, npcId);
}

// Dialog text parsing + geometry live in core/conversation-text.ts (Stage 2).
const dialogEffects = {
    // 0x83: citizen gives Elf Crest after defeating Paguro
    onElfCrest: () => {
        const ci = readMemory(ADDR_CALIENTE_ITEMS, 1)[0];
        writeMemory(ADDR_CALIENTE_ITEMS, [ci | 0x80]);
        writeMemory(ADDR_ELF_CREST, [0xFF]);
        initC015ObjIfExists();
    },
    // 0x8B: endgame flag — final boss Jashiin defeated + 9th Tear of
    // Esmesanti delivered (original: or byte_4,80h; jmp init_c015_obj_if_exists).
    // Together with death_already_processed=FF it switches the King's and
    // citizens' conversations in Felishika's Castle town (place map id 0x80).
    onFinalTearCollected: () => {
        const b4 = readMemory(ADDR_BYTE4, 1)[0];
        writeMemory(ADDR_BYTE4, [b4 | 0x80]);
        initC015ObjIfExists();
    },
};

function parseDialogText(bytes) {
    return parseDialogTextImpl(bytes, dialogEffects);
}

const conversation = new ConversationManager({
    readMemory: (offset, length) => readMemory?.(offset, length) ?? null,
    writeMemory: (offset, data) => writeMemory?.(offset, data),
    getNpcConversationRaw: getNpcConversationRaw,
    townFinishConversation: () => townFinishConversation?.(),
    getHeroAlmasValue,
    setHeroAlmasValue,
    renderAlmasHud,
    layout: (facingLeft, extraLines) => layoutConversationBox(ctx, conversation, extraLines),
    effects: dialogEffects,
});

function startConversationFromWasm() {
    conversation.startFromWasm();
}

function loadConversationPattern(patternIdx) {
    conversation.loadPattern(patternIdx);
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
    const rawText = getNpcConversationRaw(0);
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
        writeMemory(ADDR_FALTER_ITEMS, [falter | 0x80]);
        writeMemory(ADDR_PLACE_MAP_ID, [6]); // Dorado
        townFinishBuilding?.();

        const mdtPath = TOWN_MDTS[6];
        const resp = await fetch(mdtPath);
        if (!resp.ok) throw new Error(`Failed to load ${mdtPath}: ${resp.status}`);
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdt(mdtData, mdtPath);
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

        // Landing spot: Falter building door, prox col 132 / view x 13, face-left.
        writeMemory(ADDR_PROXIMITY_MAP_LEFT_COL, [132, 0]);
        writeMemory(ADDR_HERO_X_VIEW, [13]);
        writeMemory(ADDR_FACING, [0x01]); // face left
        townSetReturnBeforeMainLoop?.(RETURN_BEFORE_TOWN_MAIN_LOOP);
        townEntryDisablingEdgeScroll();
        townEntryRan = true;
        gameMode = 'town';
        soundManager.setMusicDim(1.0);
        soundManager.setSfxVolume(1.0);
        const trackId = resolveMusicTrack(getMusicTrackId?.());
        if (trackId) setCurrentMusicTrack(trackId);
        console.log('[falter] warped to Dorado');
    } catch (err) {
        console.error('[handleWarp] failed:', err);
    } finally {
        townTransitionInProgress = false;
        engineReady = true;
    }
}

function startIndoorScene(destId) {
    if (!TOWN_DOORS[destId]) {
        console.warn(`[building] destination ${destId} not implemented`);
        townFinishBuilding?.();
        return;
    }
    soundManager.setMusicDim(1 / 32);
    soundManager.setSfxVolume(1.0);
    const finishCb = () => {
        indoorActiveScene = null;
        soundManager.setMusicDim(1.0);
        soundManager.setSfxVolume(1.0);
        townFinishBuilding?.();
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
        indoorActiveScene = new building.scene(context);
        indoorActiveScene.building = building;
        indoorActiveScene.enter(performance.now());
    }
}

// ─── UI helpers (gold, sword, shield, magic) ──────────────────────────────────
// HUD rendering lives in ui/hud.ts; these bindings wire it to the wasm bridge.
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

function updateElementText(elementId, value) { hud.updateElementText(elementId, value); }
function resetBossHud() { hud.resetBossHud(); }
function updatePlaceHud(name, indoor) { hud.updatePlaceHud(name, indoor); }
function renderBossName() { hud.renderBossName(); }
function drawLifeBar() { hud.drawLifeBar(); }
function setLife(currentLife, maxLife) { hud.setLife(currentLife, maxLife); }
function drawBossHealth() { hud.drawBossHealth(); }
function getHeroHp() { return hud.getHeroHp(); }
function setHeroHp(hp) { hud.setHeroHp(hp); }
function getHeroMaxHp() { return hud.getHeroMaxHp(); }
function setHeroMaxHp(maxHp) { hud.setHeroMaxHp(maxHp); }
function getHeroGoldValue() { return hud.getHeroGoldValue(); }
function setHeroGoldValue(value) { hud.setHeroGoldValue(value); }
function renderGoldHud() { hud.renderGoldHud(); }
function getHeroAlmasValue() { return hud.getHeroAlmasValue(); }
function setHeroAlmasValue(value) { hud.setHeroAlmasValue(value); }
function renderAlmasHud() { hud.renderAlmasHud(); }
function loadSwordIcons() { return hud.loadSwordIcons(); }
function getHeroSwordType() { return hud.getHeroSwordType(); }
function setHeroSwordType(type) { hud.setHeroSwordType(type); }
function renderSwordHud() { hud.renderSwordHud(); }
function loadShieldIcons() { return hud.loadShieldIcons(); }
function getHeroShieldType() { return hud.getHeroShieldType(); }
function setHeroShieldType(type) { hud.setHeroShieldType(type); }
function getHeroShieldHP() { return hud.getHeroShieldHP(); }
function setHeroShieldHP(hp) { hud.setHeroShieldHP(hp); }
function renderShieldHud() { hud.renderShieldHud(); }
function loadMagicIcons() { return hud.loadMagicIcons(); }
function getHeroMagicType() { return hud.getHeroMagicType(); }
function setHeroMagicType(type) { hud.setHeroMagicType(type); }
function getHeroMagicCount(type) { return hud.getHeroMagicCount(type); }
function setHeroMagicCount(type, count) { hud.setHeroMagicCount(type, count); }
function renderMagicHud() { hud.renderMagicHud(); }
// Open Save Modal (called from Sage scene)
function openSaveModal(onSaveComplete) {
    if (modalManager.isActive) return;
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
    modalManager.open(new SaveDialog(onSave, onCancel));
}

function openRestoreModal() {
    if (modalManager.isActive) return;
    gamePaused = true;
    const onRestore = async (slotName) => {
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
async function performGameRestore(saveData) {
    if (!saveData || saveData.length > 256) {
        console.error('Invalid save data');
        return;
    }

    // Abort any indoor scene or conversation
    if (indoorActiveScene) {
        indoorActiveScene = null;
        townFinishBuilding?.();  // clear WASM building state (ADDR_BUILDING_ACTIVE at 0xFFFA outside save range)
    }
    soundManager.setMusicDim(1.0);
    conversation.active = false;
    engineReady = false;
    rokademo = null;
    rokademoHold = false;

    // Load the save into WASM memory
    loadSaveState(saveData);

    // ADDR_HEARTBEAT_VOLUME (0xFF08) is outside the 0x0000..0x00FF save area,
    // so a restore keeps whatever stale dungeon value was last written there.
    // Clear it so the heartbeat loop stops in town; the dungeon code recomputes
    // it on the next frame.
    writeMemory(ADDR_HEARTBEAT_VOLUME, [0]);

    // Saves made before the rokademo feature have ADDR_TEAR_COUNT stuck at 0
    // while the per-cavern tear flags are set. Derive the real count from the
    // flags and write it back so the demo slot selection and any in-game
    // counter logic stay consistent.
    writeMemory(ADDR_TEAR_COUNT, [getTearCount()]);

    // Reflect collected Tears of Esmesanti on the mole_t strip immediately
    lastTearOverlayCount = -1;
    syncTearOverlay();

    // Get the place id (town index or dungeon)
    const placeId = readMemory(ADDR_PLACE_MAP_ID, 1)[0] & 0x7F;

    if (placeId < TOWN_MDTS.length) {
        const mdtPath = TOWN_MDTS[placeId];
        try {
            const resp = await fetch(mdtPath);
            if (!resp.ok) throw new Error(`Failed to load ${mdtPath}`);
            mdtData = new Uint8Array(await resp.arrayBuffer());
            loadMdt(mdtData, mdtPath);
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
        mdtData = new Uint8Array(await resp.arrayBuffer());
        loadMdt(mdtData, "");
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

    const trackId = resolveMusicTrack(getMusicTrackId?.());
    if (trackId) setCurrentMusicTrack(trackId);

    resetBossHud();
    gameMode = 'town';
    engineReady = true;
    gamePaused = false;

    console.log(`Restored town ${readMemory(ADDR_PLACE_MAP_ID, 1)[0] & 0x7F}`);
}

// ─── Game loop ────────────────────────────────────────────────────────────────
let lastTimestamp = 0;
// let fps = 0;
let cavernName = '';
let mdtData = null;
let mdtHeader = null;

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
            if (prevRokaDx >= 0 && prevDungeonState !== DUNGEON_STATE_ROKA_RUN) {
                prevRokaDx = -1;
            }
            drawDungeonRoka();
            dungeonClearRenderRequest?.();
        } else if (dungeonState === DUNGEON_STATE_ROKADEMO) {
            drawDungeonRokademo(performance.now());
        } else if (rokademoHold && !(dungeonState >= DUNGEON_STATE_DEATH_FALL && dungeonState <= DUNGEON_STATE_DEATH_FADE)) {
            // Post-demo hold: keep the roka backdrop until the transition set up
            // by wasm_finish_rokademo_transition takes over (except when playing hero death sequence).
            drawRokademoBackground();
            dungeonClearRenderRequest?.();
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
                if (!_guerraEffectRunning && readU8(ADDR_BYTE_9EED) === 0xFF) {
                    writeMemory(ADDR_BYTE_9EED, [0]);
                    _guerraEffectRunning = true;
                    renderGuerraEffect().finally(() => { _guerraEffectRunning = false; });
                }
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
                        writeMemory(ADDR_BOSS_MODE, [0xFF]);                   // boss HUD visible
                        writeMemory(ADDR_BOSS_HEALTH_REQUEST, [0xFF]);         // trigger health bar draw
                        const boss_placement = readMemory(ADDR_BOSS_STATE_BLOCK + 8, 1)[0];
                        writeMemory(ADDR_BOSS_PLACEMENT, [boss_placement]);
                        // Reset game frame state so normal loop starts cleanly
                        writeMemory(ADDR_DUNGEON_FRAME_PHASE, [0]);
                        writeMemory(ADDR_RENDER_REQUEST, [0xFF]);
                        writeMemory(ADDR_RENDER_DONE, [0]);
                        writeMemory(ADDR_DUNGEON_STATE, [0]); // NORMAL
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
            writeMemory(ADDR_HEALTH_BAR_REQUEST, [0]);
        }
        if (bossMode) {
            if (gMem(ADDR_BOSS_HEALTH_REQUEST)) {
                drawBossHealth();
                renderBossName();
                writeMemory(ADDR_BOSS_HEALTH_REQUEST, [0]);
            }
        } else {
            if (gMem(ADDR_GOLD_RENDER_REQUEST)) {
                renderGoldHud();
                writeMemory(ADDR_GOLD_RENDER_REQUEST, [0]);
            }
        }
        if (gMem(ADDR_ALMAS_RENDER_REQUEST)) {
            renderAlmasHud();
            writeMemory(ADDR_ALMAS_RENDER_REQUEST, [0]);
        }
        if (gMem(ADDR_SHIELD_HP_RENDER_REQUEST)) {
            renderShieldHud();
            writeMemory(ADDR_SHIELD_HP_RENDER_REQUEST, [0]);
        }
        if (gMem(ADDR_MAGIC_LEFT_RENDER_REQUEST)) {
            renderMagicHud();
            writeMemory(ADDR_MAGIC_LEFT_RENDER_REQUEST, [0]);
        }
        if (gMem(ADDR_SWORD_RENDER_REQUEST)) {
            renderSwordHud();
            writeMemory(ADDR_SWORD_RENDER_REQUEST, [0]);
        }
        if (gMem(ADDR_SWORD_GFX_RELOAD_REQUEST)) {
            updateDungeonSwordReach(); 
            writeMemory(ADDR_SWORD_GFX_RELOAD_REQUEST, [0]);
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
            let placeName = getTownName?.() ?? 'unknown';
            updatePlaceHud(townEntryRan ? placeName : '');
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

function loop(timestamp) {
    // if (timestamp > lastTimestamp) fpsEl.textContent = Math.round(1000 / (timestamp - lastTimestamp));
    // lastTimestamp = timestamp;
    draw();
    requestAnimationFrame(loop);
}

// ─── DOM references ───────────────────────────────────────────────────────────
const introScreen  = document.getElementById('intro-screen');
const introCanvas  = document.getElementById('introCanvas');
const uiScreen     = document.getElementById('ui');
const layoutWrapper = document.getElementById('layout-wrapper');
// const fpsEl  = document.getElementById('fps-value');
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const tearOverlayEl = document.getElementById('tear-overlay');
canvas.width  = VIEW_COLS * TILE_SIZE;
canvas.height = VIEW_ROWS * TILE_SIZE;
ctx.imageSmoothingEnabled = false;

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
    townFinishBuilding?.();
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
function exportSlotToFile(slotName) {
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

    const onExportSlot = (slotName) => {
        exportSlotToFile(slotName);
        closeModal();
    };
    const onImportFromFile = () => {
        importSaveFromFile();
        closeModal();
    };
    const onDeleteSlot = (slotName) => {
        deleteGameFromSlot(slotName);
    };
    const onCancel = () => {
        closeModal();
    };
    modalManager.open(new ImportExportDialog(onExportSlot, onImportFromFile, onDeleteSlot, onCancel));
}

window.openSaveModal = openSaveModal;

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
