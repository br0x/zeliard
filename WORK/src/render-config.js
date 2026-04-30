// render-config.js - Rendering configuration for Zeliard ASCII engine
// Defines colors and ASCII characters for all game objects

// ============================================================================
// Rendering Configuration
// All colors and ASCII characters can be customized here
// ============================================================================

export const RENDER_CONFIG = {
  // ============================================================================
  // Door Rendering
  // ============================================================================
  doors: {
    // ASCII character for doors (from Press Start 2P font)
    char: '║',
    // Door color (CSS color value)
    color: '#4488ff',
    // Alternative door styles for different door types
    styles: {
      normal: { char: '║', color: '#4488ff' },
      locked: { char: '▓', color: '#ff4444' },
      secret: { char: '░', color: '#44ff44' },
      boss:   { char: '█', color: '#ff00ff' }
    }
  },

  // ============================================================================
  // Platform Rendering
  // ============================================================================
  platforms: {
    // Vertical platforms (3 bytes: x, x, y)
    vertical: {
      char: '═',
      color: '#888888'
    },
    // Horizontal platforms (7 bytes: x_flags, y_flags, padding, min_x, max_x)
    horizontal: {
      char: '═',
      color: '#888888'
    },
    // Air streams / objects
    airStream: {
      char: '↑',
      color: '#aaffff'
    }
  },

  // ============================================================================
  // Item Rendering
  // ============================================================================
  items: {
    // Default item character
    char: '♦',
    color: '#ffff00',
    // Item types (if differentiated by data)
    types: {
      gold:     { char: '$', color: '#ffff00' },
      gem:      { char: '♦', color: '#ff00ff' },
      key:      { char: '♣', color: '#8888ff' },
      potion:   { char: '♥', color: '#ff4444' },
      weapon:   { char: '†', color: '#888888' },
      shield:   { char: 'Ω', color: '#4488ff' },
      accessory:{ char: '◊', color: '#44ff44' }
    }
  },

  // ============================================================================
  // Monster Rendering
  // ============================================================================
  monsters: {
    // Default monster character and color
    char: 'M',
    color: '#ff4444',
    // Monster types by ID (customize per monster type)
    types: {
      // AI Type 0: Guard (stationary)
      guard:        { char: 'G', color: '#4488ff' },
      // AI Type 1: Patrol
      patrol:       { char: 'P', color: '#44ff44' },
      // AI Type 2: Chase
      chaser:       { char: 'C', color: '#ff4444' },
      // AI Type 3: Complex
      complex:      { char: 'X', color: '#ff00ff' },
      // Boss monsters
      boss:         { char: 'B', color: '#ffff00' },
      // Generic monsters
      generic:      { char: 'M', color: '#ff8800' }
    },
    // Monster states
    states: {
      normal:  { color: null },        // Use type color
      hit:     { color: '#ffffff' },   // Flash white when hit
      dying:   { char: '†', color: '#888888' }
    }
  },

  // ============================================================================
  // Hero Rendering
  // ============================================================================
  hero: {
    // Standing characters (3 rows: head, body, legs)
    standing: {
      facingRight: { head: 'ó', body: ')', legs: 'Λ' },
      facingLeft:  { head: 'ò', body: '(', legs: 'Λ' },
      onRope:      { head: 'ŏ', body: '+', legs: 'Λ' }
    },
    // Jumping characters
    jumping: {
      up:   { head: 'ó', body: ')', legs: '/' },
      down: { head: 'ó', body: ')', legs: '\\' }
    },
    // Squatting characters (2 rows)
    squatting: {
      facingRight: { head: 'ó', body: 'A' },
      facingLeft:  { head: 'ò', body: 'A' }
    },
    // Colors
    color: '#00ff00',
    hitColor: '#ff0000'
  },

  // ============================================================================
  // Tile Rendering (background)
  // ============================================================================
  tiles: {
    // Default tile color
    default: { color: '#a74' },
    // Special tile colors
    rope:    { color: '#8888ff' },
    ladder:  { color: '#888844' },
    water:   { color: '#4444ff' },
    ice:     { color: '#aaffff' },
    lava:    { color: '#ff4400' },
    spikes:  { color: '#888888' }
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get door style based on door data
 * @param {object} door - Door entry from MDT
 * @returns {object} Style object with char and color
 */
export function getDoorStyle(door) {
  // For now, return normal style
  // Can be extended to check door flags for locked/secret/boss
  return RENDER_CONFIG.doors.styles.normal;
}

/**
 * Get monster style based on monster data
 * @param {object} monster - Monster entry from MDT
 * @returns {object} Style object with char and color
 */
export function getMonsterStyle(monster) {
  const aiType = monster.flags & 0x0F;
  const isBig = (monster.flags & 0x10) !== 0;
  const isHit = (monster.field_5 & 0x20) !== 0;

  // Check for hit state
  if (isHit) {
    return RENDER_CONFIG.monsters.states.hit;
  }

  // Get style based on AI type
  switch (aiType) {
    case 0: return RENDER_CONFIG.monsters.types.guard;
    case 1: return RENDER_CONFIG.monsters.types.patrol;
    case 2: return RENDER_CONFIG.monsters.types.chaser;
    case 3: return RENDER_CONFIG.monsters.types.complex;
    default: return RENDER_CONFIG.monsters.types.generic;
  }
}

/**
 * Get platform style based on platform type
 * @param {string} type - Platform type ('vertical', 'horizontal', 'airStream')
 * @returns {object} Style object with char and color
 */
export function getPlatformStyle(type) {
  return RENDER_CONFIG.platforms[type] || RENDER_CONFIG.platforms.vertical;
}

/**
 * Get item style based on item type
 * @param {number} itemType - Item type identifier
 * @returns {object} Style object with char and color
 */
export function getItemStyle(itemType) {
  // For now, return default item style
  // Can be extended to check item type
  return RENDER_CONFIG.items;
}
