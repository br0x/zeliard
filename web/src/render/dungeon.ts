/**
 * dungeon.ts — the dungeon renderer.
 *
 * Owns everything drawn inside caverns: background tiles (incl. animated
 * tiles), monsters/items, hero + sword overlays, monster/magic projectiles,
 * magia stones, notification/sign boxes, the roka run, boss death explosion
 * rings, and the Guerra effect.
 *
 * All memory access and asset references are injected once via
 * `initDungeonRenderer(env)`. The pure hero frame-resolution helpers are
 * exported for unit testing.
 */

import { drawSheetFrame } from './sheets.js';
import { nextAnimatedTile, wrapProximityAddress } from './dungeon-logic.js';
import { getExplosionRingCanvas } from './explosion-ring.js';
import {
    TILE_SIZE, VIEW_COLS, VIEW_ROWS,
    DUNGEON_MAP_HEIGHT, PROX_COLS, PROX_SIZE,
    DUNGEON_VIEW_LEFT_IN_PROX, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H,
    DUNGEON_HERO_FRAME_W, DUNGEON_HERO_FRAME_H, DUNGEON_HERO_SHEET_COLS,
    DUNGEON_SWORD_FRAME_W, DUNGEON_SWORD_FRAME_H, DUNGEON_SWORD_SHEET_COLS,
    NOTIFICATION_STRINGS,
} from '../config/engine.js';
import { SWORD_OVERLAY_OFFSETS, MAGIC_PROJECTILE_STRIDE, PROJECTILE_STRUCT_SIZE } from '../data/assets.js';
import { getMagicFrameIndex } from './dungeon-logic.js';
import {
    ADDR_PROXIMITY_MAP, ADDR_PROXIMITY_LAYER2, ADDR_PROJECTILES_LIST,
    ADDR_MAGIC_PROJECTILES, ADDR_PROXIMITY_MAP_LEFT_COL, ADDR_MAP_WIDTH,
    ADDR_MONSTERS_LIST, ADDR_MAGIA_STONE_SPRITE0,
    ADDR_IS_BOSS_CAVERN, ADDR_SPRITE_FLASH_FLAG, ADDR_BOSS_EXPLOSIONS_LIST,
    ADDR_HERO_X_VIEW, ADDR_HERO_HEAD_Y_VIEW, ADDR_FACING, ADDR_HERO_ANIM_PHASE,
    ADDR_INVINCIBILITY_FLAG, ADDR_SQUAT_FLAG, ADDR_ON_ROPE_FLAGS,
    ADDR_HERO_HIDDEN_FLAG, ADDR_JUMP_PHASE_FLAGS, ADDR_SHIELD_ANIM_ACTIVE,
    ADDR_SHIELD_ANIM_PHASE, ADDR_SHIELD_VARIANT_INDEX, ADDR_SLOPE_DIRECTION,
    ADDR_SHIELD_TYPE, ADDR_HERO_SPRITE_HIDDEN,
    ADDR_SWORD_SWING_FLAG, ADDR_SWORD_MOVEMENT_PHASE, ADDR_SWORD_HIT_TYPE,
    ADDR_SWORD_TYPE, ADDR_NOTIFICATION_FLAG, ADDR_NOTIFICATION_MSG_ID,
    ADDR_CAVERN_SIGN_FLAG, ADDR_CAVERN_SIGN_IDX, ADDR_CAVERN_SIGNS_INFO,
    ADDR_ROKA_COLOR, ADDR_ROKA_PHASE, ADDR_LEFT_RUN,
    ADDR_CAVERN_LEVEL, ADDR_VIEWPORT_LEFT_TOP, ADDR_BYTE_9EED,
    ADDR_CURR_SPELL_TYPE,
} from '../core/memory.js';

/** Minimal description of a loaded sprite sheet image. */
export interface SpriteSheetLike {
    width: number;
    height: number;
}

/** The mutable asset bundle owned by the loaders in game.js. */
export interface DungeonAssets {
    tileSheet: SpriteSheetLike | null;
    tileSheetReady: boolean;
    dchrSheet: SpriteSheetLike | null;
    dchrSheetReady: boolean;
    entitySheet: SpriteSheetLike | null;
    entitySheetReady: boolean;
    magicSheet: CanvasImageSource | null;
    magicSheetReady: boolean;
    heroSheet: SpriteSheetLike | null;
    heroSheetReady: boolean;
    swordSheet: SpriteSheetLike | null;
    swordSheetReady: boolean;
    /** Monster projectile tile-id cycles, indexed by projectile type. */
    projectiles: ArrayLike<number>[] | null;
    /** EAI frame tables: ai[dir][flags][offset] → sprite index. */
    ai: Record<string, any> | null;
    rokaImages: Array<SpriteSheetLike | null>;
    rokaImagesReady: boolean;
}

export interface DungeonRenderEnv {
    ctx: CanvasRenderingContext2D;
    viewW(): number;
    viewH(): number;
    engineReady(): boolean;
    gMem(addr: number): number;
    readU8(addr: number): number;
    readU16(addr: number): number;
    readMemory(offset: number, length: number): Uint8Array | null;
    writeMemory(offset: number, data: ArrayLike<number>): void;
    viewportTop(): number;
    assets(): DungeonAssets;
    /** Loaded boss-encounter splash image (drawEncounterText). */
    encounterImg(): CanvasImageSource | null;
}

let env: DungeonRenderEnv;

/** Wire the renderer to the host's memory accessors and asset bundle. */
export function initDungeonRenderer(e: DungeonRenderEnv): void {
    env = e;
}

function A(): DungeonAssets {
    return env.assets();
}

// ─── Hero sprite frame resolution (pure) ─────────────────────────────────────

export interface HeroVisualState {
    facingLeft: boolean;
    animPhase: number;
    invincible: boolean;
    squat: boolean;
    onRope: boolean;
    hidden: boolean;
    jump: number;
    shieldAnimActive: boolean;
    shieldPhase: number;
    shieldVariant: number;
    slope: number;
    shieldCategory: number;
}

export function resolveBodyFrame(state: HeroVisualState): number {
    if (state.hidden) return 30;
    if (state.onRope) return 26 + (state.animPhase & 3);
    const base = state.facingLeft ? 13 : 0;
    let offset: number;
    if (state.invincible) offset = 10 + (state.animPhase & 3);
    else if (state.squat) offset = 5;
    else if (state.jump & 0x80) offset = 7;
    else if (state.slope === 1) offset = 8;
    else if (state.slope === 2) offset = 9;
    else if (state.jump === 0x7f) offset = 6;
    else if (state.animPhase === 0x80) offset = 4;
    else offset = state.animPhase & 3;
    return base + offset;
}

export function resolveBackArmFrame(state: HeroVisualState): number | null {
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

export function resolveFrontArmFrame(state: HeroVisualState): number | null {
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

function getShieldCategory(): number {
    const shieldType = env.gMem(ADDR_SHIELD_TYPE);
    if (!shieldType) return 0;
    return shieldType >= 4 ? 2 : 1;
}

function getDungeonHeroState(): HeroVisualState {
    return {
        facingLeft: (env.readU8(ADDR_FACING) & 1) !== 0,
        animPhase: env.readU8(ADDR_HERO_ANIM_PHASE),
        invincible: env.readU8(ADDR_INVINCIBILITY_FLAG) !== 0,
        squat: env.readU8(ADDR_SQUAT_FLAG) !== 0,
        onRope: env.readU8(ADDR_ON_ROPE_FLAGS) !== 0,
        hidden: env.readU8(ADDR_HERO_HIDDEN_FLAG) !== 0,
        jump: env.readU8(ADDR_JUMP_PHASE_FLAGS),
        shieldAnimActive: env.readU8(ADDR_SHIELD_ANIM_ACTIVE) !== 0,
        shieldPhase: env.readU8(ADDR_SHIELD_ANIM_PHASE),
        shieldVariant: env.readU8(ADDR_SHIELD_VARIANT_INDEX),
        slope: env.readU8(ADDR_SLOPE_DIRECTION),
        shieldCategory: getShieldCategory(),
    };
}

// ─── Background tiles ─────────────────────────────────────────────────────────

function drawStaticTile(tileId: number, vpX: number, vpY: number): void {
    const dx = vpX * TILE_SIZE;
    const dy = vpY * TILE_SIZE;
    if (tileId === 0) {
        env.ctx.fillStyle = '#000000';
        env.ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
        return;
    }
    const mpp = A().tileSheet!;
    const mppCols = Math.floor(mpp.width / TILE_SIZE);
    const mppTiles = mppCols * Math.floor(mpp.height / TILE_SIZE);
    if (tileId >= 1 && tileId <= mppTiles) {
        drawSheetFrame(env.ctx, mpp, tileId - 1, TILE_SIZE, TILE_SIZE, mppCols, dx, dy);
    } else if (tileId >= 0x40 && A().dchrSheetReady) {
        const dchr = A().dchrSheet!;
        const dchrCols = Math.floor(dchr.width / TILE_SIZE);
        const dchrTiles = dchrCols * Math.floor(dchr.height / TILE_SIZE);
        if (tileId - 0x40 < dchrTiles) {
            drawSheetFrame(env.ctx, dchr, tileId - 0x40, TILE_SIZE, TILE_SIZE, dchrCols, dx, dy);
        }
    }
}

export function drawDungeonTiles(): boolean {
    if (!A().tileSheetReady || !env.readMemory(ADDR_PROXIMITY_MAP, 1)) return false;
    const proxMap = env.readMemory(ADDR_PROXIMITY_MAP, PROX_COLS * DUNGEON_MAP_HEIGHT)!;
    const layer2 = env.readMemory(ADDR_PROXIMITY_LAYER2, 0x80)!;
    const top = env.viewportTop();

    for (let row = 0; row < VIEW_ROWS; row++) {
        const proxRow = (top + row) & 0x3f;
        for (let col = 0; col < VIEW_COLS; col++) {
            const proxCol = col + DUNGEON_VIEW_LEFT_IN_PROX;
            let tileId = proxMap[proxRow * PROX_COLS + proxCol] ?? 0;
            // Entity markers temporarily replace the real map tile. The
            // original compositor restores that background from layer 2.
            if (tileId & 0x80) tileId = layer2[tileId & 0x7f] ?? 0;
            if (tileId === 0) continue;
            drawStaticTile(tileId, col, row);
        }
    }
    return true;
}

// ─── Animated cavern tiles ────────────────────────────────────────────────────

let renderCounter = 0; // incremented once per dungeon game tick (see bumpRenderCounter)
let lastAnimatedRenderCounter = renderCounter;

/**
 * Mirrors `inc render_counter` in Refresh_Dirty_Tiles: advance once per
 * completed dungeon frame so animated tiles advance at most once per game
 * tick even when the canvas draws multiple times per tick.
 */
export function bumpRenderCounter(): void {
    renderCounter = (renderCounter + 1) & 0xff;
}

export function animateDungeonTiles(): void {
    if (!env.readMemory(ADDR_PROXIMITY_MAP, 1) || lastAnimatedRenderCounter === renderCounter) return;
    lastAnimatedRenderCounter = renderCounter;

    const cavernLevel = env.readU8(ADDR_CAVERN_LEVEL);
    if (cavernLevel < 5 || cavernLevel > 8) return;

    const oddTick = (renderCounter & 1) !== 0;
    const viewportLeftTop = env.readU16(ADDR_VIEWPORT_LEFT_TOP);

    // Batch-read the whole proximity map once. It is a direct view into WASM
    // g_mem, so advancing a tile is a plain array write (no allocation, no
    // per-tile writeMemory). Nothing here re-enters WASM, so the view cannot
    // be invalidated while this synchronous loop runs.
    const proxMap = env.readMemory(ADDR_PROXIMITY_MAP, PROX_SIZE)!;

    for (let row = 0; row < VIEW_ROWS; row++) {
        let si = wrapProximityAddress(
            viewportLeftTop + row * PROX_COLS + DUNGEON_VIEW_LEFT_IN_PROX
        );
        for (let col = 0; col < VIEW_COLS; col++, si = wrapProximityAddress(si + 1)) {
            const idx = si - ADDR_PROXIMITY_MAP;
            const nextTile = nextAnimatedTile(proxMap[idx]!, { cavernLevel, oddTick });
            if (nextTile === null) continue;
            proxMap[idx] = nextTile;
        }
    }
}

// ─── Boss explosion rings ─────────────────────────────────────────────────────

// Tracks whether the explosion rings have been rendered this frame.
let bossExplosionFrameRendered = false;

/*
 * Mirrors the spawning half of C Spawn_Boss_Explosion_Ring.
 *
 * Called per entity-tile processed by drawDungeonEntities while the boss
 * death flash is active. Entity layout (4 bytes): [0] tile column,
 * [1] tile row, [2] lifetime counter (3→0, masked to 2 bits = frame index),
 * [3] variant (0..3).
 */
function spawnBossExplosionRings(col: number, row: number): void {
    // ── 1. Render existing rings onto canvas (read-only, once per frame) ────
    if (!bossExplosionFrameRendered) {
        bossExplosionFrameRendered = true;

        const scale = TILE_SIZE / 8; // 3 for 24px tiles
        let ptr = ADDR_BOSS_EXPLOSIONS_LIST;

        for (;;) {
            const x = env.readU8(ptr);
            if (x === 0xff) break;

            const y = env.readU8(ptr + 1);
            const life = env.readU8(ptr + 2);
            const variant = env.readU8(ptr + 3);

            const phase = life & 3;
            const ring = getExplosionRingCanvas(variant, phase, scale);
            env.ctx.drawImage(ring as CanvasImageSource, x * TILE_SIZE, y * TILE_SIZE);

            ptr += 4;
        }
    }

    // ── 2. Spawn a new ring (probabilistic, each call) ─────────────────────
    if (row >= 16) return;
    if ((Math.random() * 16 | 0) >= 2) return; // ~⅛ probability (C: (r&0x0F)<14)

    // Find terminator
    let ptr = ADDR_BOSS_EXPLOSIONS_LIST;
    let count = 0;
    while (env.readU8(ptr) !== 0xff) {
        ptr += 4;
        if (++count > 32) return;
    }
    if (count >= 32) return;

    // Random x offset – one of {-1,0,1} from the entity column
    let sx = (Math.random() * 4 | 0);
    while (sx === 3) sx = (Math.random() * 4 | 0);
    sx = sx - 1 + col;
    if (sx === 0xff) sx = 4;
    if (sx >= 27) sx = 26;

    // Random y offset – one of {-1,0,1} from the entity row
    let sy = (Math.random() * 4 | 0);
    while (sy === 3) sy = (Math.random() * 4 | 0);
    sy = sy - 1 + row;
    if (sy === 0xff) sy = 0;

    const variant = Math.random() * 4 | 0;

    env.writeMemory(ptr, [sx]);
    env.writeMemory(ptr + 1, [sy]);
    env.writeMemory(ptr + 2, [3]);   // starting lifetime
    env.writeMemory(ptr + 3, [variant]);
    env.writeMemory(ptr + 4, [0xff]);   // terminator for next
}

// ─── Monster projectiles ──────────────────────────────────────────────────────

export function drawDungeonProjectiles(): void {
    const assets = A();
    if (!assets.tileSheetReady || !env.readMemory(ADDR_PROXIMITY_MAP, 1)) return;
    if (!assets.projectiles || !assets.tileSheet) return;
    const top = env.viewportTop();
    const cols = Math.floor(assets.tileSheet.width / TILE_SIZE);
    let p = ADDR_PROJECTILES_LIST;
    for (;;) {
        const p_x_rel = env.gMem(p);
        if (p_x_rel === 0xff) break;
        const vpX = p_x_rel - DUNGEON_VIEW_LEFT_IN_PROX;
        if (vpX < 0 || vpX >= VIEW_COLS) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const p_y_rel = env.gMem(p + 1);
        const vpY = (p_y_rel - top) & 0x3f;
        if (vpY >= VIEW_ROWS) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const typeId = env.gMem(p + 2);
        const stepCount = env.gMem(p + 3);
        if (typeId >= assets.projectiles.length) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const tiles = assets.projectiles[typeId];
        if (!tiles || tiles.length === 0) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const tileId = tiles[stepCount % tiles.length] ?? 0;
        drawSheetFrame(env.ctx, assets.tileSheet, tileId - 1, TILE_SIZE, TILE_SIZE, cols,
            vpX * TILE_SIZE, vpY * TILE_SIZE);
        p += PROJECTILE_STRUCT_SIZE;
    }
}

// ─── Magic spell projectiles ──────────────────────────────────────────────────

export function drawDungeonMagicProjectiles(): void {
    if (!A().magicSheetReady || !env.readMemory(ADDR_PROXIMITY_MAP, 1)) return;
    const currentSpell = env.readU8(ADDR_CURR_SPELL_TYPE);
    if (currentSpell === 0 || currentSpell === 7) return;
    const spellIndex = currentSpell - 1;
    const top = env.viewportTop();

    // The original fires the spell at the very end of a game frame, and only
    // renders the projectile after the NEXT frame's dispatch has advanced it
    // (update_active_projectiles_render runs after dispatch_spell_projectile_movement).
    // Until then the master slot's mp_life_timer is 0, so skip the whole spell
    // rather than draw it at the spawn position (on top of the hero).
    // Only the master slot's timer is ever incremented (rascar/agua leave the
    // other slots' timers at 0 forever), so a per-slot `lifeTimer === 0` check
    // would wrongly hide those beams/bubbles.
    const masterXRel = env.readU16(ADDR_MAGIC_PROJECTILES);
    const masterLife = (masterXRel & 0xff00) === 0xff00 ? 0xff : env.readU8(ADDR_MAGIC_PROJECTILES + 4);
    if (masterLife === 0) return;

    for (let outer = 0; outer < 4; outer++) {
        const addr = ADDR_MAGIC_PROJECTILES + outer * MAGIC_PROJECTILE_STRIDE;
        const xRel = env.readU16(addr);
        if (xRel === 0xffff) return;
        if ((xRel >> 8) === 0xff) continue;

        const yRel = env.readU8(addr + 2);
        const mpDir = env.readU8(addr + 3);
        const animFrame = env.readU8(addr + 5);

        const leftCol = env.readU16(ADDR_PROXIMITY_MAP_LEFT_COL);
        const mapWidth = env.readU16(ADDR_MAP_WIDTH);

        let relX: number;
        if (xRel >= leftCol) {
            relX = xRel - leftCol;
            if (relX >= 36) continue;
        } else {
            if (xRel >= 36) continue;
            relX = mapWidth - leftCol + xRel;
            if (relX >= 36) continue;
        }

        const vpX = relX - DUNGEON_VIEW_LEFT_IN_PROX;
        const relY = (yRel - top) & 0x3f;
        const frameIdx = getMagicFrameIndex(spellIndex, mpDir !== 0, animFrame);
        const srcX0 = frameIdx * 48;

        for (let sub = 0; sub < 4; sub++) {
            const sx = vpX + (sub & 1);
            if (sx < 0 || sx >= VIEW_COLS) continue;
            const sy = (relY + (sub >> 1)) & 0x3f;
            if (sy >= VIEW_ROWS) continue;
            env.ctx.drawImage(
                A().magicSheet!,
                srcX0 + (sub & 1) * TILE_SIZE,
                (sub >> 1) * TILE_SIZE,
                TILE_SIZE, TILE_SIZE,
                sx * TILE_SIZE, sy * TILE_SIZE,
                TILE_SIZE, TILE_SIZE,
            );
        }
    }
}

// ─── Guerra effect ────────────────────────────────────────────────────────────

interface GuerraRing {
    left: number; top: number; width: number; height: number; color: string;
}

// How many full ticks (~236.7 Hz each) each rectangle stays on screen before
// the next one is drawn. ~2 keeps the whole process close to the original.
const GUERRA_FULL_TICKS_PER_RECT = 3;

let guerraEffectRunning = false;
let guerraFlashActive = false;
let guerraRings: GuerraRing[] | null = null;
let fullTickWaiters: Array<{ remaining: number; resolve: () => void }> = [];

/** Resolve pending Guerra tick waiters — call from the PIT full tick. */
export function resolveFullTickWaiters(): void {
    if (fullTickWaiters.length) {
        const stillWaiting: typeof fullTickWaiters = [];
        for (const waiter of fullTickWaiters) {
            if (--waiter.remaining <= 0) waiter.resolve();
            else stillWaiting.push(waiter);
        }
        fullTickWaiters = stillWaiting;
    }
}

// Resolves after `count` game full ticks. The Guerra effect advances one
// rectangle per interval while rendering continues every rAF frame.
function waitFullTicks(count: number): Promise<void> {
    return new Promise((resolve) => fullTickWaiters.push({ remaining: count, resolve }));
}

/** Renders the persistent Guerra overlay each frame: red XOR flash + rings. */
export function drawGuerraOverlay(): void {
    if (guerraFlashActive) {
        const viewW = VIEW_COLS * TILE_SIZE;
        const viewH = VIEW_ROWS * TILE_SIZE;
        const img = env.ctx.getImageData(0, 0, viewW, viewH);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] = (d[i] ?? 0) ^ 0xff;   // XOR the viewport content with red
        }
        env.ctx.putImageData(img, 0, 0);
    }
    if (guerraRings) {
        const t = 3;   // flat border thickness in px
        for (const ring of guerraRings) {
            env.ctx.fillStyle = ring.color;
            env.ctx.fillRect(ring.left, ring.top, ring.width, t);
            env.ctx.fillRect(ring.left, ring.top + ring.height - t, ring.width, t);
            env.ctx.fillRect(ring.left, ring.top, t, ring.height);
            env.ctx.fillRect(ring.left + ring.width - t, ring.top, t, ring.height);
        }
    }
}

export function isGuerraEffectRunning(): boolean {
    return guerraEffectRunning;
}

async function renderGuerraEffect(): Promise<void> {
    const heroX = env.readU8(ADDR_HERO_X_VIEW) * TILE_SIZE;
    const heroY = env.readU8(ADDR_HERO_HEAD_Y_VIEW) * TILE_SIZE;
    const baseW = 3 * TILE_SIZE;      // hero box: 3x3 tiles
    const baseH = 3 * TILE_SIZE;
    const grow = 1.5 * TILE_SIZE;     // each rectangle is 3 tiles bigger
    const offsets = [0, 0.5, 1];      // interleaved: rings grow every half tile
    const viewW = VIEW_COLS * TILE_SIZE;
    const viewH = VIEW_ROWS * TILE_SIZE;

    guerraRings = [];
    guerraFlashActive = true;

    for (const pass of [
        { color: 'rgb(255,255,0)', rounds: 3 },   // yellow: 3 rounds of 9 rectangles
        { color: 'rgb(0,0,0)', rounds: 3 },       // black: clear the rings above
    ]) {
        for (let round = 0; round < pass.rounds; round++) {
            const start = (offsets[round] ?? 0) * TILE_SIZE;
            for (let i = 0; i < 9; i++) {
                const r = start + i * grow;
                const left = Math.max(0, heroX - r);
                const top = Math.max(0, heroY - r);
                const right = Math.min(viewW, heroX + baseW + r);
                const bottom = Math.min(viewH, heroY + baseH + r);
                guerraRings.push({ left, top, width: right - left, height: bottom - top, color: pass.color });
                await waitFullTicks(GUERRA_FULL_TICKS_PER_RECT);
            }
        }
    }

    guerraRings = null;
    guerraFlashActive = false;
}

/**
 * Legacy trigger block: start the effect when the engine requests it
 * (ADDR_BYTE_9EED), guarded against re-entry while one is running.
 */
export function maybeStartGuerraEffect(): void {
    if (!guerraEffectRunning && env.readU8(ADDR_BYTE_9EED) === 0xff) {
        env.writeMemory(ADDR_BYTE_9EED, [0]);
        guerraEffectRunning = true;
        renderGuerraEffect().finally(() => { guerraEffectRunning = false; });
    }
}

// ─── Entities (monsters / items) ──────────────────────────────────────────────

// entityId (bitmasked to 0x7F) -> remaining flash frames for visual hit feedback
const entityHitFlashTimers = new Map<number, number>();
// Offscreen canvas for per-sprite tinting (avoids tinting background tiles).
// Created lazily so importing this module doesn't require a DOM.
let tintCanvas: HTMLCanvasElement | null = null;
let tintCtx: CanvasRenderingContext2D | null = null;
function ensureTintCanvas(): void {
    if (tintCanvas) return;
    tintCanvas = document.createElement('canvas');
    tintCanvas.width = DUNGEON_ENTITY_W;
    tintCanvas.height = DUNGEON_ENTITY_H;
    tintCtx = tintCanvas.getContext('2d');
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
export function drawDungeonEntities(): void {
    if (!A().entitySheetReady || !env.readMemory(ADDR_PROXIMITY_MAP, 1)) return;

    // In Refresh_Dirty_Tiles, 0xFF cache entries mean an earlier sprite (or
    // the hero) owns this destination tile. Recreate that ownership locally
    // for this freshly cleared frame; never carry it across rAF callbacks.
    const claimedTiles = new Uint8Array(VIEW_COLS * VIEW_ROWS);
    const bossExplosionActive =
        env.readU8(ADDR_IS_BOSS_CAVERN) && env.readU8(ADDR_SPRITE_FLASH_FLAG);
    // Spawn while scanning, but render the rings after every entity, as the
    // original Boss_Explosions_Renderer call does.
    bossExplosionFrameRendered = Boolean(bossExplosionActive);

    for (const [id, frames] of entityHitFlashTimers) {
        if (frames > 1) entityHitFlashTimers.set(id, frames - 1);
        else entityHitFlashTimers.delete(id);
    }

    let currentEntityFlashFrames = 0;

    function getSheetFrame(entityId: number): number {
        const id = entityId & 0x7f;
        const ptr = env.readU16(ADDR_MONSTERS_LIST) + id * 16;
        // Batch-read the 16-byte monster entry (bytes 4/5/6 hold flags/dir/frame)
        // instead of four separate single-byte lookups.
        const entry = env.readMemory(ptr, 16)!;
        const dir = (entry[5] ?? 0) & 0x80 ? 'right' : 'left';
        const flags = (entry[4] ?? 0) & 0x1f;
        const offset = (entry[6] ?? 0) & 0x0f;

        currentEntityFlashFrames = entityHitFlashTimers.get(id) || 0;
        if ((flags & 0x18) === 0 && ((entry[5] ?? 0) & 0x20)) {
            currentEntityFlashFrames = 6;
            entityHitFlashTimers.set(id, 6);
        }

        return A().ai![dir][flags][offset];
    }

    function drawEntity(frame: number, vpX: number, vpY: number): void {
        const sheet = A().entitySheet;
        if (!sheet || frame < 0 || frame >= A().ai!['numSprites']) return;
        const sx = frame * DUNGEON_ENTITY_W;
        if (sx + DUNGEON_ENTITY_W > sheet.width ||
            DUNGEON_ENTITY_H > sheet.height) return;

        const tinted = currentEntityFlashFrames > 0;
        if (tinted) ensureTintCanvas();
        if (tinted && tintCtx && tintCanvas) {
            tintCtx.clearRect(0, 0, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H);
            tintCtx.drawImage(
                sheet as unknown as CanvasImageSource,
                sx, 0, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H,
                0, 0, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H
            );
            tintCtx.globalCompositeOperation = 'source-atop';
            tintCtx.fillStyle = '#ffff00';
            tintCtx.globalAlpha = 0.5;
            tintCtx.fillRect(0, 0, DUNGEON_ENTITY_W, DUNGEON_ENTITY_H);
            tintCtx.globalCompositeOperation = 'source-over';
            tintCtx.globalAlpha = 1.0;
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
                env.ctx.drawImage(
                    sheet as unknown as CanvasImageSource,
                    sx + sourceX, sourceY, TILE_SIZE, TILE_SIZE,
                    dx, dy, TILE_SIZE, TILE_SIZE
                );
                if (tinted && tintCtx && tintCanvas) {
                    env.ctx.drawImage(
                        tintCanvas,
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
    const proxMap = env.readMemory(ADDR_PROXIMITY_MAP, PROX_SIZE)!;
    const viewportLeftTop = env.readU16(ADDR_VIEWPORT_LEFT_TOP);

    // Include the invisible row and left edge so partially visible sprites
    // are naturally clipped by the canvas, matching the assembly helpers.
    for (let row = -1; row < VIEW_ROWS; row++) {
        let si = wrapProximityAddress(viewportLeftTop + row * PROX_COLS + 3);
        for (let col = -1; col < VIEW_COLS; col++, si = wrapProximityAddress(si + 1)) {
            const entityId = proxMap[si - ADDR_PROXIMITY_MAP] ?? 0;
            if (!(entityId & 0x80)) continue;

            drawEntity(getSheetFrame(entityId), col, row);

            if (row >= 0 && col >= 0 && bossExplosionActive) {
                spawnBossExplosionRings(col, row);
            }
        }
    }

    if (bossExplosionActive) {
        bossExplosionFrameRendered = false;
        spawnBossExplosionRings(0, VIEW_ROWS);   // draw only; row 18 cannot spawn
    }
}

// ─── Hero + sword overlays ────────────────────────────────────────────────────

export function drawDungeonMagiaStones(): void {
    if (!A().dchrSheetReady || !env.readMemory(ADDR_PROXIMITY_MAP, 1)) return;
    for (let i = 0; i < 4; i++) {
        const base = ADDR_MAGIA_STONE_SPRITE0 + i * 7;
        if (env.gMem(base) === 0xff) continue;
        if (env.gMem(base + 2) === 0) continue;
        const sx = env.gMem(base + 5);
        const sy = env.gMem(base + 6) & 0x3f;
        if (sy >= 19) continue;   // outside viewport
        drawSheetFrame(env.ctx, A().dchrSheet!, 0x26, TILE_SIZE, TILE_SIZE, 39,
            (sx - 4) * TILE_SIZE, sy * TILE_SIZE);
    }
}

export function drawDungeonHero(): void {
    if (!A().heroSheetReady || !env.engineReady() || !env.readMemory(ADDR_PROXIMITY_MAP, 1)) return;
    if (env.gMem(ADDR_HERO_SPRITE_HIDDEN)) return;
    const x0 = env.gMem(ADDR_HERO_X_VIEW);
    const y0 = env.gMem(ADDR_HERO_HEAD_Y_VIEW);
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
        drawSheetFrame(env.ctx, A().heroSheet, frame, DUNGEON_HERO_FRAME_W, DUNGEON_HERO_FRAME_H,
            DUNGEON_HERO_SHEET_COLS, dx, y);
    }
}

let swordSwingStart: number | null = null;

export function drawDungeonSword(): void {
    if (!A().swordSheetReady || !env.readMemory(ADDR_PROXIMITY_MAP, 1)) return;
    const swingFlag = env.gMem(ADDR_SWORD_SWING_FLAG);
    if (!swingFlag) {
        swordSwingStart = null;
        return;
    }

    const hitType = env.gMem(ADDR_SWORD_HIT_TYPE) || 0;
    const swordType = Math.max(1, Math.min(6, env.gMem(ADDR_SWORD_TYPE) || 1));
    const facingLeft = (env.gMem(ADDR_FACING) & 1) !== 0;

    // C code's Render_Sword_Overlay already increments ADDR_SWORD_MOVEMENT_PHASE,
    // so the stored value is display_phase + 1. If phase is 0, C hasn't processed
    // the swing yet — skip rendering until it does.
    const storedPhase = env.gMem(ADDR_SWORD_MOVEMENT_PHASE);
    if (storedPhase === 0) {
        swordSwingStart = null;
        return;
    }

    // JS-side timer: Render_Sword_Overlay is called twice per game cycle
    // (~84ms apart), but the odd phases (stored by the first call) are only
    // in memory for ~4.2ms — less than one rAF frame at 60fps. Instead of
    // reading the raw C phase, we step a local timer at a consistent rate,
    // clamped to whatever the C code has already processed.
    const now = performance.now();
    if (!swordSwingStart) {
        swordSwingStart = now;
    }
    const cDisplayPhase = storedPhase - 1;
    const PHASE_MS = 42;   // one phase per ~42ms (2 phases per ~84ms game cycle)
    let displayPhase = Math.min(
        Math.floor((now - swordSwingStart) / PHASE_MS),
        cDisplayPhase
    );
    const MAX_DISPLAY: Record<number, number> = { 0: 5, 1: 3, 2: 0 };
    displayPhase = Math.min(displayPhase, MAX_DISPLAY[hitType] ?? 5);

    let col: number;
    switch (hitType) {
        case 1:   // overhead swing, phases 0..3 => column 5..8
            col = 5 + displayPhase;
            break;
        case 2:   // downward thrust, single phase => column 9
            col = 9;
            break;
        default:  // forward hit, phases 0..5 (phases 4 and 5 are the same, use column 4)
            col = Math.min(displayPhase, 4);
            break;
    }

    const baseRow = (swordType - 1) * 2;
    const row = baseRow + (facingLeft ? 1 : 0);
    const spriteIndex = row * DUNGEON_SWORD_SHEET_COLS + col;

    let dx = env.gMem(ADDR_HERO_X_VIEW) * TILE_SIZE;
    let dy = env.gMem(ADDR_HERO_HEAD_Y_VIEW) * TILE_SIZE;
    if (env.gMem(ADDR_SQUAT_FLAG)) {
        dy += TILE_SIZE;
    }

    // Apply per-phase overlay offsets (pairs of [x, y] in tile units).
    // C code stores these as 16-bit words: (x << 8) | y.
    let xOff: number, yOff: number;
    if (hitType === 2) {
        // Downward thrust: hardcoded per facing (C: 0xFF01 left, 0x0001 right)
        xOff = facingLeft ? -1 : 0;
        yOff = 1;
    } else {
        const offsetKey = hitType === 0
            ? (facingLeft ? 2 : 0)    // forward
            : (facingLeft ? 3 : 1);   // overhead
        const offsets = SWORD_OVERLAY_OFFSETS[offsetKey];
        const i = displayPhase * 2;
        yOff = offsets[i] ?? 0;
        xOff = offsets[i + 1] ?? 0;
    }
    dx += xOff * TILE_SIZE;
    dy += yOff * TILE_SIZE;

    drawSheetFrame(env.ctx,
        A().swordSheet,
        spriteIndex,
        DUNGEON_SWORD_FRAME_W,
        DUNGEON_SWORD_FRAME_H,
        DUNGEON_SWORD_SHEET_COLS,
        dx,
        dy
    );
}

// ─── Notification / sign boxes ────────────────────────────────────────────────

let notificationStart = 0;
const NOTIFICATION_DURATION = 2500;

function drawDungeonBox(x: number, y: number, w: number, h: number): void {
    env.ctx.save();
    env.ctx.beginPath();
    env.ctx.roundRect(x, y, w, h, TILE_SIZE / 3);
    env.ctx.fillStyle = '#000';
    env.ctx.fill();
    env.ctx.strokeStyle = '#fff';
    env.ctx.lineWidth = TILE_SIZE / 6;
    env.ctx.stroke();
    env.ctx.restore();
}

export function drawDungeonNotification(): void {
    const flag = env.readU8(ADDR_NOTIFICATION_FLAG);
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
        env.writeMemory(ADDR_NOTIFICATION_FLAG, [0]);
        notificationStart = 0;
        return;
    }

    const msgId = env.readU8(ADDR_NOTIFICATION_MSG_ID);
    const entry = (NOTIFICATION_STRINGS as unknown as Record<number, [number, string]>)[msgId];
    if (!entry) return;
    const [leftPad, text] = entry;
    const x = TILE_SIZE;
    const y = TILE_SIZE * 2;
    const w = TILE_SIZE * (VIEW_COLS - 2);
    const h = TILE_SIZE * 2;

    drawDungeonBox(x, y, w, h);
    env.ctx.save();
    env.ctx.font = '24px "Press Start 2P", monospace';
    env.ctx.fillStyle = '#fff';
    env.ctx.textBaseline = 'middle';
    env.ctx.fillText(text, x + leftPad * (TILE_SIZE / 8), y + h / 2);
    env.ctx.restore();
}

export function drawDungeonSign(): void {
    const flag = env.readU8(ADDR_CAVERN_SIGN_FLAG);
    if (!flag) return;

    const idx = env.readU8(ADDR_CAVERN_SIGN_IDX);
    const tablePtr = env.readU16(ADDR_CAVERN_SIGNS_INFO);
    const descPtr = env.readU16(tablePtr + idx * 2);

    // Descriptor: [top_margin-25] [box_height-2] then (x_delta, text...
    // terminated by 0xFF) per line, '/' = newline
    const topY = env.readU8(descPtr) + TILE_SIZE + 3 * (TILE_SIZE / 8);
    const h = (env.readU8(descPtr + 1) + 2) * TILE_SIZE;

    const x = TILE_SIZE * 5;
    const y = TILE_SIZE;
    const w = TILE_SIZE * (VIEW_COLS - 2 * 5);

    drawDungeonBox(x, y, w, h);
    env.ctx.save();
    env.ctx.font = '24px "Press Start 2P", monospace';
    env.ctx.fillStyle = '#fff';
    env.ctx.textBaseline = 'top';

    let offset = descPtr + 2;
    let cy = topY;

    for (;;) {
        const xDelta = env.readU8(offset++);
        let bx = x + xDelta * 3;

        for (;;) {
            let ch = env.readU8(offset++);
            if (ch === 0xff) { env.ctx.restore(); return; }
            if (ch === 0x2f) {   // CR/LF
                cy += (TILE_SIZE + TILE_SIZE / 2);
                break;   // will read xDelta in outer loop
            }
            if (ch === 0x5c) ch = 0x27;
            env.ctx.fillText(String.fromCharCode(ch), bx, cy);
            bx += TILE_SIZE;
        }
    }
}

// ─── Roka run (cavern entry run) ──────────────────────────────────────────────

let prevRokaDx = -1;

/**
 * Reset the run interpolation when a new roka run starts. Pass true when the
 * dungeon state machine just entered DUNGEON_STATE_ROKA_RUN.
 */
export function beginRokaRunFrame(startedThisTick: boolean): void {
    if (prevRokaDx >= 0 && startedThisTick) {
        prevRokaDx = -1;
    }
}

export function drawDungeonRoka(): void {
    if (!A().rokaImagesReady || !env.readMemory(ADDR_PROXIMITY_MAP, 1)) return;
    const colorIdx = env.readU8(ADDR_ROKA_COLOR);
    const phase = env.readU8(ADDR_ROKA_PHASE);
    const facingLeft = (env.readU8(ADDR_FACING) & 1) !== 0;
    const animPhase = env.readU8(ADDR_HERO_ANIM_PHASE);
    const leftRun = env.readU8(ADDR_LEFT_RUN) !== 0;
    const invincible = env.readU8(ADDR_INVINCIBILITY_FLAG) !== 0;
    const shieldVariant = env.readU8(ADDR_SHIELD_VARIANT_INDEX);
    const shieldCategory = getShieldCategory();

    const rokaImg = A().rokaImages[Math.min(colorIdx, A().rokaImages.length - 1)];
    if (!rokaImg) return;

    const t = phase / 25;
    const heroW = DUNGEON_HERO_FRAME_W;
    const heroH = DUNGEON_HERO_FRAME_H;
    let dx: number;
    if (leftRun) {
        dx = Math.round((1 - t) * (env.viewW() - heroW));
    } else {
        dx = Math.round(t * (env.viewW() - heroW));
    }
    const dy = 12 * TILE_SIZE;

    if (prevRokaDx === -1 || phase === 0) {
        env.ctx.drawImage(rokaImg as unknown as CanvasImageSource, 0, 0, env.viewW(), env.viewH());
    } else {
        env.ctx.drawImage(rokaImg as unknown as CanvasImageSource,
            prevRokaDx, dy, heroW, heroH, prevRokaDx, dy, heroW, heroH);
    }

    const state: HeroVisualState = {
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
        drawSheetFrame(env.ctx, A().heroSheet, frame, heroW, heroH,
            DUNGEON_HERO_SHEET_COLS, dx, y);
    }

    prevRokaDx = dx;
}

// ─── Boss encounter splash ────────────────────────────────────────────────────

export function drawEncounterText(alpha: number): void {
    const img = env.encounterImg();
    if (!img) return;
    env.ctx.save();
    env.ctx.globalAlpha = alpha;
    const x = (env.viewW() - 622) / 2;
    const y = 3 * TILE_SIZE;
    env.ctx.drawImage(img, x, y, 622, 192);
    env.ctx.restore();
}
