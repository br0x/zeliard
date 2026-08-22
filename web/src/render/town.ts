/**
 * town.ts — the town renderer.
 *
 * Draws everything visible while walking a town: the static backdrop,
 * parallax ceiling strip, two scrolling sidewalk strips, the tile map
 * (read from wasm g_mem so dynamic tile changes are visible), the hero,
 * and NPCs.
 *
 * Also owns the town-specific render state that belongs to those layers:
 * sidewalk/ceiling scroll offsets, the animated-tile map, and the NPC
 * sprite category parsed from the town descriptor.
 *
 * Asset references and memory accessors are injected via
 * `initTownRenderer(env)`; every body is ported verbatim from game.js
 * (Stage 2).
 */

import {
    TILE_SIZE, VIEW_COLS, VIEW_WIDTH, VIEW_ROWS,
    TOWN_VIEW_ROWS, TOWN_VISIBLE_COL_OFFSET, TOWN_MAP_TILE_OFFSET,
    TOWN_MAP_START_ROW, TOWN_TILE_SHEET_COLS, TOWN_SIDEWALK1_START_ROW,
    TOWN_SIDEWALK2_START_ROW, TOWN_ANIMATION_FULL_TICKS,
    HERO_FRAME_W, HERO_FRAME_H, HERO_BASE_Y,
    FRAME_FACING_AWAY, FRAME_LEFT_STAND, FRAME_RIGHT_STAND,
    FRAME_LEFT_WALK_BASE, FRAME_RIGHT_WALK_BASE,
} from '../config/engine.js';
import {
    ADDR_TOWN_DESCRIPTOR_PTR, ADDR_PROXIMITY_MAP_LEFT_COL, ADDR_NPC_ARRAY_PTR,
} from '../wasm/memory.js';
import { PATTERN_ASSETS, NPC_FRAME_W, NPC_FRAME_H } from '../data/assets.js';
import { getTownMapWidth } from '../core/transitions.js';
import type { SpriteSheetLike } from './dungeon.js';

/** Minimal key-state view used for the hero walk cycle. */
export interface TownKeyState {
    ArrowLeft: boolean;
    ArrowRight: boolean;
}

export interface TownAssets {
    background: CanvasImageSource | null;
    backgroundReady: boolean;
    ceiling: CanvasImageSource | null;
    ceilingReady: boolean;
    sidewalk1: CanvasImageSource | null;
    sidewalk1Ready: boolean;
    sidewalk2: CanvasImageSource | null;
    sidewalk2Ready: boolean;
    tileSheet: CanvasImageSource | null;
    tileSheetReady: boolean;
    heroSprite: CanvasImageSource | null;
    heroSpriteReady: boolean;
    /** [category][facing&0xf] -> sprite image */
    npcSprites: Array<Array<CanvasImageSource | null>>;
    /** JS-side copy of the current town MDT bytes. */
    mdtData: Uint8Array | null;
}

export interface TownRenderEnv {
    ctx: CanvasRenderingContext2D;
    viewW(): number;
    engineReady(): boolean;
    gMem(addr: number): number;
    readU16(addr: number): number;
    readMemory(offset: number, length: number): Uint8Array | null;
    /** Direct g_mem byte access without allocation (drawTownTiles hot path). */
    memByte(addr: number): number;
    keys(): TownKeyState;
    /** Global animation timer advanced once per PIT full tick. */
    frameTimer(): number;
    /** Current town pattern id (owned by the transition code). */
    townPatId(): number;
    assets(): TownAssets;
}

let env: TownRenderEnv;

/** Wire the renderer to the host's memory accessors and asset bundle. */
export function initTownRenderer(e: TownRenderEnv): void {
    env = e;
}

function A(): TownAssets {
    return env.assets();
}

// ─── NPC sprite category ──────────────────────────────────────────────────────

let townNpcSpriteCategory = 0;   // 0: mman, 1: cman

/** Current NPC sprite category (0 = mman, 1 = cman). */
export function getTownNpcCategory(): number {
    return townNpcSpriteCategory;
}

export function parseTownNpcCategory(): void {
    if (!env.readMemory(ADDR_TOWN_DESCRIPTOR_PTR, 2)) { townNpcSpriteCategory = 0; return; }
    const descPtrBytes = env.readMemory(ADDR_TOWN_DESCRIPTOR_PTR, 2)!;
    const descPtr = descPtrBytes[0] | (descPtrBytes[1] << 8);
    const raw = env.readMemory(descPtr + 1, 1)![0];
    const count = A().npcSprites.length;
    townNpcSpriteCategory = raw < count ? raw : 0;
}

// ─── Scroll offsets (sidewalk / ceiling parallax) ─────────────────────────────

let townSidewalk1OffsetX = 0;
let townSidewalk2OffsetX = 0;
let townCeilingOffsetX = 0;

export function resetTownScrollOffsets(): void {
    townSidewalk1OffsetX = 0;
    townSidewalk2OffsetX = 0;
    townCeilingOffsetX = 0;
}

export function scrollFloorOneTileRight(): void {
    townSidewalk1OffsetX = (townSidewalk1OffsetX - TILE_SIZE + VIEW_WIDTH) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX - TILE_SIZE * 2 + VIEW_WIDTH) % VIEW_WIDTH;
}

export function scrollFloorOneTileLeft(): void {
    townSidewalk1OffsetX = (townSidewalk1OffsetX + TILE_SIZE) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX + TILE_SIZE * 2) % VIEW_WIDTH;
}

export function scrollCeilingHalfTileRight(): void {
    townCeilingOffsetX = (townCeilingOffsetX - TILE_SIZE / 2 + VIEW_WIDTH) % VIEW_WIDTH;
}

export function scrollCeilingHalfTileLeft(): void {
    townCeilingOffsetX = (townCeilingOffsetX + TILE_SIZE / 2) % VIEW_WIDTH;
}

// ─── Layer strips ─────────────────────────────────────────────────────────────

export function drawTownBackground(): boolean {
    if (!A().backgroundReady) return false;
    env.ctx.drawImage(A().background!, 0, 0);
    return true;
}

export function drawTownCeiling(): boolean {
    if (!A().backgroundReady || !A().ceilingReady || !A().ceiling) return false;
    const w = env.viewW();
    env.ctx.drawImage(A().background!, 0, 0, w, TILE_SIZE * 2, 0, 0, w, TILE_SIZE * 2);
    const rightPartWidth = w - townCeilingOffsetX;
    if (rightPartWidth > 0) {
        env.ctx.drawImage(A().ceiling!, townCeilingOffsetX, 0, rightPartWidth, TILE_SIZE * 2,
            0, 0, rightPartWidth, TILE_SIZE * 2);
    }
    const leftPartWidth = townCeilingOffsetX;
    if (leftPartWidth > 0) {
        env.ctx.drawImage(A().ceiling!, 0, 0, leftPartWidth, TILE_SIZE * 2,
            rightPartWidth, 0, leftPartWidth, TILE_SIZE * 2);
    }
    return true;
}

export function drawTownSidewalk(): boolean {
    if (!A().sidewalk1Ready || !A().sidewalk2Ready) return false;
    const w = env.viewW();
    const rightPartWidth1 = w - townSidewalk1OffsetX;
    let y = TOWN_SIDEWALK1_START_ROW * TILE_SIZE;
    if (rightPartWidth1 > 0) {
        env.ctx.drawImage(A().sidewalk1!, townSidewalk1OffsetX, 0, rightPartWidth1, TILE_SIZE,
            0, y, rightPartWidth1, TILE_SIZE);
    }
    const leftPartWidth1 = townSidewalk1OffsetX;
    if (leftPartWidth1 > 0) {
        env.ctx.drawImage(A().sidewalk1!, 0, 0, leftPartWidth1, TILE_SIZE,
            rightPartWidth1, y, leftPartWidth1, TILE_SIZE);
    }
    const rightPartWidth2 = w - townSidewalk2OffsetX;
    y = TOWN_SIDEWALK2_START_ROW * TILE_SIZE;
    if (rightPartWidth2 > 0) {
        env.ctx.drawImage(A().sidewalk2!, townSidewalk2OffsetX, 0, rightPartWidth2, TILE_SIZE,
            0, y, rightPartWidth2, TILE_SIZE);
    }
    const leftPartWidth2 = townSidewalk2OffsetX;
    if (leftPartWidth2 > 0) {
        env.ctx.drawImage(A().sidewalk2!, 0, 0, leftPartWidth2, TILE_SIZE,
            rightPartWidth2, y, leftPartWidth2, TILE_SIZE);
    }
    return true;
}

// ─── Animated tiles ───────────────────────────────────────────────────────────

interface AnimEntry { seq: number[]; pos: number }
let townAnimTileMap: Record<number, AnimEntry> = {};


/**
 * Rebuild the animated-tile lookup for the current pattern. Some town tiles
 * animate (waving flags, torches, …); each sequence cycles positionally.
 */
export function updateTownAnimation(): void {
    const pattern = (PATTERN_ASSETS as unknown as Record<number, { animatedTilesSeq?: number[][] } | undefined>)[env.townPatId()];
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

function getAnimatedTownTileId(tileId: number): number {
    const entry = townAnimTileMap[tileId];
    if (!entry) return tileId;
    const { seq, pos } = entry;
    const len = seq.length;
    const phase = Math.floor(env.frameTimer() / TOWN_ANIMATION_FULL_TICKS) % len;
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
export function drawTownTiles(): boolean {
    const assets = A();
    const mdtData = assets.mdtData;
    if (!mdtData || !assets.tileSheetReady) return false;
    const mapWidth = getTownMapWidth(mdtData);
    if (!mapWidth) return false;

    const leftCol = Math.max(0, Math.min(
        mapWidth - VIEW_COLS,
        env.readU16(ADDR_PROXIMITY_MAP_LEFT_COL) + TOWN_VISIBLE_COL_OFFSET
    ));
    for (let col = 0; col < VIEW_COLS; col++) {
        const mapCol = leftCol + col;
        for (let row = 0; row < TOWN_VIEW_ROWS; row++) {
            const mdtOffset = TOWN_MAP_TILE_OFFSET + mapCol * TOWN_VIEW_ROWS + row;
            const wasmAddr = ADDR_TOWN_DESCRIPTOR_PTR + TOWN_MAP_TILE_OFFSET + mapCol * TOWN_VIEW_ROWS + row;
            let tileId;
            const memByte = env.memByte(wasmAddr);
            if (memByte >= 0) {
                tileId = memByte;
                if (tileId === 0xfd) {
                    tileId = mdtData[mdtOffset] ?? 0;
                }
            } else {
                tileId = mdtData[mdtOffset] ?? 0;
            }
            tileId = getAnimatedTownTileId(tileId);
            const sx = (tileId % TOWN_TILE_SHEET_COLS) * TILE_SIZE;
            const sy = Math.floor(tileId / TOWN_TILE_SHEET_COLS) * TILE_SIZE;
            env.ctx.drawImage(
                assets.tileSheet!,
                sx, sy, TILE_SIZE, TILE_SIZE,
                col * TILE_SIZE, (row + TOWN_MAP_START_ROW) * TILE_SIZE,
                TILE_SIZE, TILE_SIZE
            );
        }
    }
    return true;
}

export function drawTownHero(): void {
    if (!A().heroSpriteReady || !env.engineReady()) return;
    env.gMem(0xff33);
    const heroAnim = env.gMem(0x00e7);
    const facing = env.gMem(0x00c2) & 1;
    const keys = env.keys();
    const moving = keys.ArrowLeft || keys.ArrowRight;
    let frame: number;
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
    const viewportX = env.gMem(0x0083);
    const dx = viewportX * TILE_SIZE;
    const dy = HERO_BASE_Y;
    env.ctx.drawImage(A().heroSprite!, sx, 0, HERO_FRAME_W, HERO_FRAME_H, dx, dy, HERO_FRAME_W, HERO_FRAME_H);
}

export function drawTownNpcs(): void {
    if (!env.engineReady()) return;
    const ptrBytes = env.readMemory(ADDR_NPC_ARRAY_PTR, 2);
    if (!ptrBytes) return;
    const npcArrayAddr = ptrBytes[0] | (ptrBytes[1] << 8);
    if (!npcArrayAddr) return;
    const proxLeftBytes = env.readMemory(ADDR_PROXIMITY_MAP_LEFT_COL, 2)!;
    const proxLeft = proxLeftBytes[0] | (proxLeftBytes[1] << 8);
    const sprites = A().npcSprites[townNpcSpriteCategory];
    for (let i = 0; i < 64; i++) {
        const base = npcArrayAddr + i * 8;
        const npcMem = env.readMemory(base, 8)!;
        const nx = npcMem[0] | (npcMem[1] << 8);
        if (nx === 0xffff) break;
        const nFacing = npcMem[2];
        const sprite = sprites[nFacing & 0xf];
        if (!sprite) continue;
        const nAnimPhase = npcMem[4];
        const screenCol = nx - proxLeft - TOWN_VISIBLE_COL_OFFSET;
        const screenX = screenCol * TILE_SIZE;
        if (screenX < -NPC_FRAME_W || screenX >= VIEW_WIDTH) continue;
        const animIdx = nAnimPhase & 3;
        const frame = (nFacing & 0x80) !== 0 ? animIdx : (4 + animIdx);
        const sx = frame * NPC_FRAME_W;
        env.ctx.drawImage(sprite, sx, 0, NPC_FRAME_W, NPC_FRAME_H, screenX, HERO_BASE_Y, NPC_FRAME_W, NPC_FRAME_H);
    }
}
