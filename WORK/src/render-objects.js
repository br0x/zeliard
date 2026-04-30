// render-objects.js - Rendering functions for doors, platforms, items, and monsters
// Uses configuration from render-config.js

import { RENDER_CONFIG, getDoorStyle, getMonsterStyle, getPlatformStyle, getItemStyle } from './render-config.js';

// Viewport constants
const VIEW_COLS = 28;
const VIEW_ROWS = 18;

// ============================================================================
// MDT Data Reading Helpers
// ============================================================================

/**
 * Read a linked list from MDT data
 * Each record is followed immediately by the next, terminated by 0xFFFF
 * @param {Uint8Array} mdtData - MDT data buffer
 * @param {number} offset - Starting offset in MDT (relative to 0xC000)
 * @param {number} recordSize - Size of each record in bytes
 * @returns {Array} Array of record objects
 */
function readMdtLinkedList(mdtData, offset, recordSize) {
  const records = [];
  const baseOffset = 0xC000 + offset;

  while (offset < mdtData.length - 1) {
    // Check for termination marker (0xFFFF)
    const word = mdtData[baseOffset + offset] | (mdtData[baseOffset + offset + 1] << 8);
    if (word === 0xFFFF) {
      break;
    }

    // Read record data
    const record = readRecord(mdtData, baseOffset + offset, recordSize);
    if (record) {
      records.push(record);
    }

    // Move to next record
    offset += recordSize;
  }

  return records;
}

/**
 * Read a single record from MDT data
 * @param {Uint8Array} mdtData - MDT data buffer
 * @param {number} offset - Offset in MDT data
 * @param {number} size - Record size in bytes
 * @returns {object|null} Record object or null if invalid
 */
function readRecord(mdtData, offset, size) {
  if (offset + size > mdtData.length) {
    return null;
  }

  const record = {};

  // Read bytes based on size
  switch (size) {
    case 3:  // Vertical platform, air stream
      record.x = mdtData[offset] | (mdtData[offset + 1] << 8);
      record.y = mdtData[offset + 2];
      break;

    case 7:  // Horizontal platform
      record.x_and_flags = mdtData[offset] | (mdtData[offset + 1] << 8);
      record.y_and_flags = mdtData[offset + 2];
      record.min_x = mdtData[offset + 4] | (mdtData[offset + 5] << 8);
      record.max_x = mdtData[offset + 6] | (mdtData[offset + 7] << 8);
      break;

    case 12:  // Door
      record.x0 = mdtData[offset] | (mdtData[offset + 1] << 8);
      record.y0 = mdtData[offset + 2];
      record.field_3 = mdtData[offset + 3];
      record.field_4 = mdtData[offset + 4];
      record.x1 = mdtData[offset + 6] | (mdtData[offset + 7] << 8);
      record.y1 = mdtData[offset + 8];
      record.field_8 = mdtData[offset + 9];
      record.field_9 = mdtData[offset + 10] | (mdtData[offset + 11] << 8);
      record.field_B = mdtData[offset + 12];
      break;

    case 16:  // Monster
      record.currX = mdtData[offset] | (mdtData[offset + 1] << 8);
      record.currY = mdtData[offset + 2];
      record.x_rel = mdtData[offset + 3];
      record.flags = mdtData[offset + 4];
      record.field_5 = mdtData[offset + 5];
      record.field_6 = mdtData[offset + 6];
      record.state_flags = mdtData[offset + 7];
      record.field_8 = mdtData[offset + 8];
      record.field_9 = mdtData[offset + 9];
      record.field_A = mdtData[offset + 10];
      record.spwnX = mdtData[offset + 11] | (mdtData[offset + 12] << 8);
      record.spwnY = mdtData[offset + 13];
      record.type = mdtData[offset + 14];
      record.counter = mdtData[offset + 15];
      break;

    default:
      // Generic record reader
      for (let i = 0; i < size; i++) {
        record[`byte_${i}`] = mdtData[offset + i];
      }
  }

  return record;
}

// ============================================================================
// Rendering Functions
// ============================================================================

/**
 * Render all doors from MDT data
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Uint8Array} mdtData - MDT data buffer
 * @param {object} header - MDT header with offsets
 * @param {number} camX - Camera X position (viewport column start)
 * @param {number} camY - Camera Y position (viewport row start)
 * @param {number} tileWidth - Tile width in pixels
 * @param {number} tileHeight - Tile height in pixels
 */
export function renderDoors(ctx, mdtData, header, camX, camY, tileWidth, tileHeight) {
  if (!header.doors_offset) return;

  const doors = readMdtLinkedList(mdtData, header.doors_offset, 12);

  for (const door of doors) {
    // Convert door coordinates to screen position
    // door.x0, door.y0 = start position
    // door.x1, door.y1 = end position
    const screenX = (door.x0 - camX) * tileWidth;
    const screenY = (door.y0 - camY) * tileHeight;

    // Check if door is visible in viewport
    if (screenX < -tileWidth || screenX > VIEW_COLS * tileWidth ||
        screenY < -tileHeight || screenY > VIEW_ROWS * tileHeight) {
      continue;
    }

    const style = getDoorStyle(door);
    ctx.fillStyle = style.color;
    ctx.fillText(style.char, screenX, screenY);
  }
}

/**
 * Render all platforms from MDT data
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Uint8Array} mdtData - MDT data buffer
 * @param {object} header - MDT header with offsets
 * @param {number} camX - Camera X position
 * @param {number} camY - Camera Y position
 * @param {number} tileWidth - Tile width in pixels
 * @param {number} tileHeight - Tile height in pixels
 */
export function renderPlatforms(ctx, mdtData, header, camX, camY, tileWidth, tileHeight) {
  // Render vertical platforms (3 bytes each)
  if (header.vert_platforms_offset) {
    const vPlatforms = readMdtLinkedList(mdtData, header.vert_platforms_offset, 3);
    const style = RENDER_CONFIG.platforms.vertical;

    ctx.fillStyle = style.color;
    for (const plat of vPlatforms) {
      const screenX = (plat.x - camX) * tileWidth;
      const screenY = (plat.y - camY) * tileHeight;

      if (screenX >= -tileWidth && screenX < VIEW_COLS * tileWidth &&
          screenY >= -tileHeight && screenY < VIEW_ROWS * tileHeight) {
        ctx.fillText(style.char, screenX, screenY);
      }
    }
  }

  // Render horizontal platforms (7 bytes each)
  if (header.horiz_platforms_offset) {
    const hPlatforms = readMdtLinkedList(mdtData, header.horiz_platforms_offset, 7);
    const style = RENDER_CONFIG.platforms.horizontal;

    ctx.fillStyle = style.color;
    for (const plat of hPlatforms) {
      const y = plat.y_and_flags & 0x7F;  // Extract Y from flags
      const minX = plat.min_x;
      const maxX = plat.max_x;

      // Draw horizontal line of platform characters
      for (let x = minX; x <= maxX; x++) {
        const screenX = (x - camX) * tileWidth;
        const screenY = (y - camY) * tileHeight;

        if (screenX >= -tileWidth && screenX < VIEW_COLS * tileWidth &&
            screenY >= -tileHeight && screenY < VIEW_ROWS * tileHeight) {
          ctx.fillText(style.char, screenX, screenY);
        }
      }
    }
  }

  // Render air streams / objects (3 bytes each)
  if (header.air_streams_offset) {
    const airStreams = readMdtLinkedList(mdtData, header.air_streams_offset, 3);
    const style = RENDER_CONFIG.platforms.airStream;

    ctx.fillStyle = style.color;
    for (const stream of airStreams) {
      const screenX = (stream.x - camX) * tileWidth;
      const screenY = (stream.y - camY) * tileHeight;

      if (screenX >= -tileWidth && screenX < VIEW_COLS * tileWidth &&
          screenY >= -tileHeight && screenY < VIEW_ROWS * tileHeight) {
        ctx.fillText(style.char, screenX, screenY);
      }
    }
  }
}

/**
 * Render all items from MDT data
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Uint8Array} mdtData - MDT data buffer
 * @param {object} header - MDT header with offsets
 * @param {number} camX - Camera X position
 * @param {number} camY - Camera Y position
 * @param {number} tileWidth - Tile width in pixels
 * @param {number} tileHeight - Tile height in pixels
 */
export function renderItems(ctx, mdtData, header, camX, camY, tileWidth, tileHeight) {
  if (!header.items_check_offset) return;

  // Items check data structure is variable, need to parse based on actual format
  // For now, this is a placeholder
  const items = readMdtLinkedList(mdtData, header.items_check_offset, 4);
  const style = RENDER_CONFIG.items;

  ctx.fillStyle = style.color;
  for (const item of items) {
    // Item structure needs to be determined from actual MDT data
    const screenX = (item.x || 0 - camX) * tileWidth;
    const screenY = (item.y || 0 - camY) * tileHeight;

    if (screenX >= -tileWidth && screenX < VIEW_COLS * tileWidth &&
        screenY >= -tileHeight && screenY < VIEW_ROWS * tileHeight) {
      ctx.fillText(style.char, screenX, screenY);
    }
  }
}

/**
 * Render all monsters from MDT data
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Uint8Array} mdtData - MDT data buffer
 * @param {object} header - MDT header with offsets
 * @param {number} camX - Camera X position
 * @param {number} camY - Camera Y position
 * @param {number} tileWidth - Tile width in pixels
 * @param {number} tileHeight - Tile height in pixels
 */
export function renderMonsters(ctx, mdtData, header, camX, camY, tileWidth, tileHeight) {
  if (!header.monsters_offset) return;

  const monsters = readMdtLinkedList(mdtData, header.monsters_offset, 16);

  for (const monster of monsters) {
    // Monster position: currX, currY
    const screenX = (monster.currX - camX) * tileWidth;
    const screenY = (monster.currY - camY) * tileHeight;

    // Check if monster is visible in viewport
    if (screenX < -tileWidth || screenX > VIEW_COLS * tileWidth ||
        screenY < -tileHeight || screenY > VIEW_ROWS * tileHeight) {
      continue;
    }

    const style = getMonsterStyle(monster);
    ctx.fillStyle = style.color || RENDER_CONFIG.monsters.color;
    ctx.fillText(style.char || RENDER_CONFIG.monsters.char, screenX, screenY);
  }
}

/**
 * Render all dungeon objects (doors, platforms, items, monsters)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Uint8Array} mdtData - MDT data buffer
 * @param {object} header - MDT header with offsets
 * @param {number} camX - Camera X position
 * @param {number} camY - Camera Y position
 * @param {number} tileWidth - Tile width in pixels
 * @param {number} tileHeight - Tile height in pixels
 */
export function renderDungeonObjects(ctx, mdtData, header, camX, camY, tileWidth, tileHeight) {
  renderPlatforms(ctx, mdtData, header, camX, camY, tileWidth, tileHeight);
  renderDoors(ctx, mdtData, header, camX, camY, tileWidth, tileHeight);
  renderItems(ctx, mdtData, header, camX, camY, tileWidth, tileHeight);
  renderMonsters(ctx, mdtData, header, camX, camY, tileWidth, tileHeight);
}
