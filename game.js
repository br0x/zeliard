/**
 * game.js — Zeliard web port, main entry point (refactored).
 *
 * Indoor activities moved to separate modules. A generic menu/dialog
 * system is used by Sage and can be reused by other buildings.
 */
import { OpeningIntro }  from './opening-intro.js';
import { SoundManager }  from './sound-manager.js';
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

// ─── Engine / Canvas config ───────────────────────────────────────────────────
const TILE_WIDTH  = 24;
const TILE_HEIGHT = 24;
const VIEW_COLS   = 28;
const VIEW_ROWS   = 18;
const VIEW_WIDTH  = VIEW_COLS * TILE_WIDTH;
// ─── Feature flags ────────────────────────────────────────────────────────────
const RUN_TOWN_ENTRY_ON_START = true;
const RETURN_BEFORE_TOWN_MAIN_LOOP = true;
const STDPLY_PATH = 'game/stdply.bin';
const START_TOWN_MDT_PATH = 'game/0/cmap.mdt';
// 'mp10.mdt', 0
// 'mp1d.mdt', 1
// 'mp20.mdt', 2
// 'mp21.mdt', 3
// 'mp2d.mdt', 4
// 'mp30.mdt', 5
// 'mp31.mdt', 6
// 'mp3d.mdt', 7
// 'mp40.mdt', 8
// 'mp41.mdt', 9
// 'mp4d.mdt', 10
// 'mp50.mdt', 11
// 'mp51.mdt', 12
// 'mp5d.mdt', 13
// 'mp60.mdt', 14
// 'mp61.mdt', 15
// 'mp62.mdt', 16
// 'mp6d.mdt', 17
// 'mp70.mdt', 18
// 'mp71.mdt', 19
// 'mp72.mdt', 20
// 'mp73.mdt', 21
// 'mp7d.mdt', 22
// 'mp80.mdt', 23
// 'mp81.mdt', 24
// 'mp82.mdt', 25
// 'mp83.mdt', 26
// 'mp84.mdt', 27
// 'mp8d.mdt', 28
// 'mp90.mdt', 29
// 'mpa0.mdt', 30

// Frame mappings to tilesheet enp1.png
const EAI1 = {
    left: [ // 0xA030: 32 arrays
        [0, 1, 2, 3, 4, 5, 6], // batFlyLeftFrames
        [14, 15, 16, 17], // slugWalkLeftFrames
        [22, 23, 24, 25, 26, 27, 28], // frogJumpLeftFrames
        [36, 37, 38, 39, 40, 41], // ratRunLeftFrames
        [], [], [], [],
        [48, 49, 50], // batDeathFrames
        [51, 52, 53], // slugDeathFrames
        [54, 55, 56], // frogDeathFrames
        [57, 58, 59], // ratDeathFrames
        [], [], [], [],
        [73, 74, 75, 76], // wallDestructionFrames
        [73, 74, 75, 76], // wallDestructionFrames
        [60, 61, 62], // hitFrames
        [69, 69], // chestFrames
        [63, 64, 65, 64], // almasGlowFrames
        [66, 67, 68, 67], // almasGlowFramesAlt
        [70], // ordinaryKeyFrames
        [],
        [71], // redPotionFrames
        [72], // bluePotionFrames
        [], [], [], [], [], [],
    ],
    right: [ // 0xA070: 32 arrays
        [7, 8, 9, 10, 11, 12, 13], // batFlyRightFrames
        [18, 19, 20, 21], // slugWalkRightFrames
        [29, 30, 31, 32, 33, 34, 35], // frogJumpRightFrames
        [42, 43, 44, 45, 46, 47], // ratRunRightFrames
        [], [], [], [],
        [48, 49, 50], // batDeathFrames
        [51, 52, 53], // slugDeathFrames
        [54, 55, 56], // frogDeathFrames
        [57, 58, 59], // ratDeathFrames
        [], [], [], [],
        [73, 74, 75, 76], // wallDestructionFrames
        [73, 74, 75, 76], // wallDestructionFrames
        [60, 61, 62], // hitFrames
        [69, 69], // chestFrames
        [63, 64, 65, 64], // almasGlowFrames
        [66, 67, 68, 67], // almasGlowFramesAlt
        [70], // ordinaryKeyFrames
        [],
        [71], // redPotionFrames
        [72], // bluePotionFrames
        [], [], [], [], [], [],
    ],
    numSprites: 77,
};
const EAI2 = {
    left: [ // 0xA030: 32 arrays
        [0, 1, 2, 3, 4, 5, 6, 7], // boarman_top_left_frames
        [19, 20, 21, 22, 23, 24, 25, 26], // boarman_bottom_left_frames
        [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49], // blue_slime_frames
        [53, 54, 55, 56, 57, 58, 59, 60], // red_toad_left_frames
        [72, 73, 74, 75, 76, 77, 78], // green_bat_left_frames
        [89, 90, 91, 92, 93, 94, 95], // magic_bat_left_frames
        [], [],
        [16, 17, 18], // boarman_top_death_frames
        [35, 36, 37], // boarman_bottom_death_frames
        [50, 51, 52], // blue_slime_death_frames
        [69, 70, 71], // red_toad_death_frames
        [86, 87, 88], // green_bat_death_frames
        [103, 104, 105], // magic_bat_death_frames
        [], [],
        [126, 127, 128, 129], // wall_destruction_frames
        [126, 127, 128, 129], // wall_destruction_frames
        [106, 107, 108], // hit_frames
        [121, 122, 123, 124], // chest_frames
        [109, 110, 111, 112], // almas_glow_frames
        [113, 114, 115, 116], // almas_glow_frames_alt
        [125], // ordinary_key_frames
        [],
        [131], // red_potion_frames
        [132], // blue_potion_frames
        [],
        [117, 118, 119, 120], // rare_almas_frames
        [130], // sign_frames
        [], [], [],
    ],
    right: [ // 0xA070: 32 arrays
        [8, 9, 10, 11, 12, 13, 14, 15], // boarman_top_right_frames
        [27, 28, 29, 30, 31, 32, 33, 34], // boarman_bottom_right_frames
        [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49], // blue_slime_frames
        [61, 62, 63, 64, 65, 66, 67, 68], // red_toad_right_frames
        [79, 80, 81, 82, 83, 84, 85], // green_bat_right_frames
        [96, 97, 98, 99, 100, 101, 102], // magic_bat_right_frames
        [], [],
        [16, 17, 18], // boarman_top_death_frames
        [35, 36, 37], // boarman_bottom_death_frames
        [50, 51, 52], // blue_slime_death_frames
        [69, 70, 71], // red_toad_death_frames
        [86, 87, 88], // green_bat_death_frames
        [103, 104, 105], // magic_bat_death_frames
        [], [],
        [126, 127, 128, 129], // wall_destruction_frames
        [126, 127, 128, 129], // wall_destruction_frames
        [106, 107, 108], // hit_frames
        [121, 122, 123, 124], // chest_frames
        [109, 110, 111, 112], // almas_glow_frames
        [113, 114, 115, 116], // almas_glow_frames_alt
        [125], // ordinary_key_frames
        [],
        [131], // red_potion_frames
        [132], // blue_potion_frames
        [],
        [117, 118, 119, 120], // rare_almas_frames
        [130], // sign_frames
        [], [], [],
    ],
    numSprites: 133,
};
const CRAB = {
    left: [ // 0xA030: 32 arrays
        [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9], // left_eye              0
        [10, 11, 12, 13, 14, 15, 16, 17, 18],     // right_eye             1
        [19, 20, 21, 22, 23, 24, 25, 26, 27, 28], // left_tibia            2
        [29, 30, 31, 32, 33, 34, 35, 36, 37, 38], // left_femur            3
        [39, 40, 41, 42, 43, 44, 45, 46, 47],     // mouth                 4
        [48, 49, 50, 51, 52, 53, 54, 55, 56, 57], // right_femur           5
        [58, 59, 60, 61, 62, 63, 64, 65, 66, 67], // right_tibia           6
        [68, 69, 70, 71, 72, 73, 74, 75, 76, 77], // left_bottom_legs      7
        [78, 79, 80, 81, 82, 83, 84, 85, 86, 87], // right_bottom_legs     8
        [], [], [], [], [], [], [],               //                       9...15
        [88, 89, 90, 91, 92, 93, 94, 95, 96, 97], // left_claw             16
        [98, 99, 100, 101, 102, 103, 104, 105, 106], // maxilla            17
        [107, 108, 109, 110, 111, 112, 113, 114, 115, 116], // right_claw  18
        [],                                       //                       19
        [117, 118, 119, 120, 121, 122, 123, 124, 125, 126], // mouth_acid  20
        [127, 128, 129, 130, 131], // acid_drop                            21
        [132], // ordinaryKey                                              22
    ],
    right: [ // 0xA070: 32 arrays
        [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9], // left_eye
        [10, 11, 12, 13, 14, 15, 16, 17, 18], // right_eye
        [19, 20, 21, 22, 23, 24, 25, 26, 27, 28], // left_tibia
        [29, 30, 31, 32, 33, 34, 35, 36, 37, 38], // left_femur
        [39, 40, 41, 42, 43, 44, 45, 46, 47], // mouth
        [48, 49, 50, 51, 52, 53, 54, 55, 56, 57], // right_femur
        [58, 59, 60, 61, 62, 63, 64, 65, 66, 67], // right_tibia
        [68, 69, 70, 71, 72, 73, 74, 75, 76, 77], // left_bottom_legs
        [78, 79, 80, 81, 82, 83, 84, 85, 86, 87], // right_bottom_legs
        [], [], [], [], [], [], [],
        [88, 89, 90, 91, 92, 93, 94, 95, 96, 97], // left_claw
        [98, 99, 100, 101, 102, 103, 104, 105, 106], // maxilla
        [107, 108, 109, 110, 111, 112, 113, 114, 115, 116], // right_claw
        [],
        [117, 118, 119, 120, 121, 122, 123, 124, 125, 126], // mouth_acid
        [127, 128, 129, 130, 131], // acid_drop
    ],
    numSprites: 133,
};
const TAKO = {
    left: [ // 0xA030: 32 arrays
        [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15],    // tile_group 0 (byte_A052)
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],    // tile_group 1 (byte_A0A2)
        [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],    // tile_group 2 (byte_A0F2)
        [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63],    // tile_group 3 (byte_A142)
        [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79],    // tile_group 4 (byte_A192)
        [80, 81, 82, 83, 84, 85, 86],                                        // tile_group 5 (byte_A1E2)
        [], [], [], [], [], [], [], [],                                      // tile_group 6...13 (unused)
        [103, 104],                                                          // tile_group 14 (byte_A255)
        [87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102], // tile_group 15 (byte_A205)
        [105, 106, 107, 108, 109, 110],                                      // tile_group 16 (byte_A25F); the ink-droplet projectile, which Pulpo_AI_proc addresses via a fixed tile id (0x30)
        [], [], [], [], [],                                                  // tile_group 17...21 (unused)
        [111], // ordinary key                                               // 22
    ],
    right: [ // 0xA070: 32 arrays -- identical to `left`; like CRAB, Pulpo has no facing-direction variant (getSheetFrame() falls back to "left" since ai_flags bit 0x80 is never set for tentacle segments)
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
        [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
        [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63],
        [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
        [80, 81, 82, 83, 84, 85, 86],
        [], [], [], [], [], [], [], [],
        [103, 104],
        [87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102],
        [105, 106, 107, 108, 109, 110],
        [], [], [], [], [],
        [111], // ordinary key                                               // 22
    ],
    numSprites: 112,
};
const EAI3 = {
    left: [ // 0xA030: 32 arrays
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // 0 type0_left_frames
        [27, 28, 29, 30, 31, 32],               // 1 type1_left_frames
        [42, 43, 44, 45, 46, 47, 48],           // 2 type2_left_frames
        [59, 60, 61, 62, 63, 64],               // 3 type3_left_frames
        [], [], [], [],                         // 4..7 unused
        [24, 25, 26],                           // 8 type0_death_frames
        [39, 40, 41],                           // 9 type1_death_frames
        [56, 57, 58],                           // 10 type2_death_frames
        [71, 72, 73],                           // 11 type3_death_frames
        [], [], [], [],                         // 12..15 unused
        [90, 91, 92, 93],                       // 16 wallDestructionFrames
        [90, 91, 92, 93],                       // 17 wallDestructionFrames
        [74, 75, 76],                           // 18 hitFrames
        [85, 86, 87, 88],                       // 19 chestFrames
        [77, 78, 79, 80],                       // 20 almasGlowFrames
        [81, 82, 83, 84],                       // 21 almasGlowFramesAlt
        [89],                                   // 22 ordinaryKeyFrames
        [],                                     // 23 unused
        [94],                                   // 24 redPotionFrames
        [95],                                   // 25 bluePotionFrames
        [], [],                                 // 26, 27 unused
        [96],                                   // 28 signpost
        [97],                                   // 29 crest
        [], [],
    ],
    right: [ // 0xA070: 32 arrays
        [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], // type0_right_frames
        [33, 34, 35, 36, 37, 38], // type1_right_frames
        [49, 50, 51, 52, 53, 54, 55], // type2_right_frames
        [65, 66, 67, 68, 69, 70], // type3_right_frames
        [], [], [], [],
        [24, 25, 26], // type0_death_frames
        [39, 40, 41], // type1_death_frames
        [56, 57, 58], // type2_death_frames
        [71, 72, 73], // type3_death_frames
        [], [], [], [],
        [90, 91, 92, 93], // wallDestructionFrames
        [90, 91, 92, 93], // wallDestructionFrames
        [74, 75, 76], // hitFrames
        [85, 86, 87, 88], // chestFrames
        [77, 78, 79, 80], // almasGlowFrames
        [81, 82, 83, 84], // almasGlowFramesAlt
        [89], // ordinaryKeyFrames
        [],
        [94], // redPotionFrames
        [95], // bluePotionFrames
        [], [],
        [96], // signpost
        [97], // crest
        [], [],
    ],
    numSprites: 98,
};
const TORI = {
    // flags (.flags & 0x1F, see getSheetFrame/Lookup_Monster_Tile_Attributes)
    // selects one of these slots (only table_index 0..14 are ever produced
    // by render_boss_sprite_frame, so -- like CRAB/TAKO -- the array isn't
    // padded out to the full 32 possible flags values); offset
    // (.anim_counter & 0x0F) then indexes within it. Tori_AI_proc's
    // render_boss_sprite_frame packs each body-part pose byte as
    // (table_index << 4) | row_index before storing table_index in .flags
    // and the whole byte in .anim_counter (see tori.c) -- so table_index
    // 0..14 below corresponds exactly to the 15 byte_A04E..byte_A1C5
    // frame-descriptor tables from tori.asm, and each slot's list is that
    // table's rows in order, numbered linearly into tori.png (a linear
    // 2x2-tile sheet, per grp_viewer.py's TORI_FRAMES/Part 2 numbering).
    left: [ // 0xA030
        [0, 1, 2, 3, 4],                       // table_index 0  (byte_A04E)
        [5, 6, 7, 8, 9, 10, 11, 12, 13],       // table_index 1  (byte_A067)
        [14, 15, 16, 17, 18, 19, 20, 21],      // table_index 2  (byte_A094)
        [22, 23, 24, 25, 26, 27],              // table_index 3  (byte_A0BC)
        [28, 29, 30, 31, 32, 33, 34, 35],      // table_index 4  (byte_A0DA)
        [36, 37, 38, 39],                      // table_index 5  (byte_A102)
        [40, 41, 42, 43],                      // table_index 6  (byte_A116)
        [44, 45, 46, 47],                      // table_index 7  (byte_A12A)
        [48, 49, 50, 51],                      // table_index 8  (byte_A13E)
        [52],                                  // table_index 9  (byte_A152)
        [53, 54, 55, 56, 57],                  // table_index 10 (byte_A157)
        [58, 59, 60, 61, 62, 63],              // table_index 11 (byte_A170)
        [64, 65, 66, 67, 68, 69],              // table_index 12 (byte_A18E)
        [70, 71, 72, 73, 74],                  // table_index 13 (byte_A1AC)
        [75, 76, 77],                          // table_index 14 (byte_A1C5)
        [], [], [], [], [], [], [],            // table_index 15..21 (unused)
        [78], // ordinary key                  // 22 
    ],
    right: [ // 0xA070 -- identical to `left`; like CRAB/TAKO, Pollo has no facing-direction variant (getSheetFrame() falls back to "left" since ai_flags bit 0x80 is never set by render_boss_sprite_frame)
        [0, 1, 2, 3, 4],
        [5, 6, 7, 8, 9, 10, 11, 12, 13],
        [14, 15, 16, 17, 18, 19, 20, 21],
        [22, 23, 24, 25, 26, 27],
        [28, 29, 30, 31, 32, 33, 34, 35],
        [36, 37, 38, 39],
        [40, 41, 42, 43],
        [44, 45, 46, 47],
        [48, 49, 50, 51],
        [52],
        [53, 54, 55, 56, 57],
        [58, 59, 60, 61, 62, 63],
        [64, 65, 66, 67, 68, 69],
        [70, 71, 72, 73, 74],
        [75, 76, 77],
        [], [], [], [], [], [], [],            // table_index 15..21 (unused)
        [78], // ordinary key                  // 22 
    ],
    numSprites: 79,
};
const EAI4 = {
    left: [ // 0xA030: 32 arrays
        [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15], // turtle_left
        [35, 36, 37, 38, 39, 40, 41, 42], // green_egg
        [46, 47], // icicle_idle
        [48, 49], // icicle_fall
        [53, 54, 55, 56], // arrow
        [], [], [],
        [32, 33, 34], // turtle_death
        [43, 44, 45], // green_egg_death
        [50, 51, 52], // icicle_break
        [50, 51, 52], // icicle_break
        [57, 58, 59], // arrow_death
        [], [], [],
        [76, 77, 78, 79], // wall_destruction
        [76, 77, 78, 79], // wall_destruction
        [60, 61, 62], // hit
        [71, 72, 73, 74], // chest
        [63, 64, 65, 66], // alma_red
        [67, 68, 69, 70], // alma_blue
        [75], // ordinary_key
        [],
        [81], // red_potion
        [82], // blue_potion
        [80], // ruzeria_shoes
    ],
    right: [ // 0xA070: 32 arrays
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], // turtle_right
        [35, 36, 37, 38, 39, 40, 41, 42], // green_egg
        [46, 47], // icicle_idle
        [48, 49], // icicle_fall
        [53, 54, 55, 56], // arrow
        [], [], [],
        [32, 33, 34], // turtle_death
        [43, 44, 45], // green_egg_death
        [50, 51, 52], // icicle_break
        [50, 51, 52], // icicle_break
        [57, 58, 59], // arrow_death
        [], [], [],
        [76, 77, 78, 79], // wall_destruction
        [76, 77, 78, 79], // wall_destruction
        [60, 61, 62], // hit
        [71, 72, 73, 74], // chest
        [63, 64, 65, 66], // alma_red
        [67, 68, 69, 70], // alma_blue
        [75], // ordinary_key
        [],
        [81], // red_potion
        [82], // blue_potion
        [80], // ruzeria_shoes
    ],
    numSprites: 81,
};
const EAI5 = {
    left: [ // 0xA030: 32 arrays
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],           // 0 man_top_left
        [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38], // 1 man_bottom_left
        [54, 55, 56, 57, 58, 59, 60, 61],                 // 2 red_egg
        [65, 66, 67, 68, 69, 70],                         // 3 eyeball_left
        [80, 81, 82, 83, 84, 85, 86, 87],                 // 4 vistlet
        [], [], [],                                       // 5..7
        [24, 25, 26],                                     // 8 man_top_death
        [51, 52, 53],                                     // 9 man_bottom_death
        [62, 63, 64],                                     // 10 red_egg_death
        [77, 78, 79],                                     // 11 eyeball_death
        [88, 89, 90],                                     // 12 vistlet_death
        [], [], [],                                       // 13..15
        [114, 115, 116, 117],                             // 16 destroyable_wall1
        [118, 119, 120, 121],                             // 17 destroyable_wall2
        [91, 92, 93],                                     // 18 hit
        [106, 107, 108, 109, 110, 111, 112],              // 19 chest
        [94, 95, 96, 97],                                 // 20 alma_red
        [98, 99, 100, 101],                               // 21 alma_blue
        [113],                                            // 22 ordinary_key (always 22nd group)
        [],                                               // 23
        [123],                                            // 24 red_potion
        [124],                                            // 25 blue_potion
        [122],                                            // 26 pirika_shoe
        [102, 103, 104, 105],                             // 27 alma_rare
    ],
    right: [ // 0xA070: 32 arrays
        [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], // man_top_right
        [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50], // man_bottom_right
        [54, 55, 56, 57, 58, 59, 60, 61],                 // red_egg
        [71, 72, 73, 74, 75, 76],                         // eyeball_right
        [80, 81, 82, 83, 84, 85, 86, 87],                 // vistlet
        [], [], [],
        [24, 25, 26],                                     // man_top_death
        [51, 52, 53],                                     // man_bottom_death
        [62, 63, 64],                                     // red_egg_death
        [77, 78, 79],                                     // eyeball_death
        [88, 89, 90],                                     // vistlet_death
        [], [], [],
        [114, 115, 116, 117],                             // destroyable_wall1
        [118, 119, 120, 121],                             // destroyable_wall2
        [91, 92, 93],                                     // hit
        [106, 107, 108, 109, 110, 111, 112],              // chest
        [94, 95, 96, 97],                                 // alma_red
        [98, 99, 100, 101],                               // alma_blue
        [113],                                            // ordinary_key (always 22nd group)
        [],
        [123],                                            // red_potion
        [124],                                            // blue_potion
        [122],                                            // pirika_shoe
        [102, 103, 104, 105],                             // alma_rare
    ],
    numSprites: 125,
};
const ZELA = {
    // flags (.flags & 0x1F, see getSheetFrame/Lookup_Monster_Tile_Attributes)
    // selects one of these slots. Unlike CRAB/TAKO/TORI, Zela_AI_proc
    // doesn't need a bit-packed table_index/pose scheme: every body
    // segment's .flags is written directly from
    // movement_facing_table[anim_phase] (byte_A4EA, values 0-4), and
    // .anim_counter (0-11, from stage_body_segments) is used as-is for
    // the offset within that group -- so index 0-4 below map 1:1 onto
    // zela.asm's 5 real frame-descriptor tables (byte_A03A/A08A/A0D0/
    // A116/A166), each slot's list being that table's rows in order,
    // numbered linearly into zela.png (a linear 2x2-tile sheet, per
    // grp_viewer.py's ZELA_FRAMES/Part 2 numbering).
    left: [ // 0xA030
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],           // tile group 0 (byte_A03A)
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],         // tile group 1 (byte_A08A)
        [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],         // tile group 2 (byte_A0D0)
        [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], // tile group 3 (byte_A116)
        [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75], // tile group 4 (byte_A166)
        [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], // 5..21 (unused)
        [76],                                                             // 22 (ordinary key)
    ],
    right: [ // 0xA070 -- identical to `left`; like CRAB/TAKO, Agar has no facing-direction variant (getSheetFrame() falls back to "left" since ai_flags bit 0x80 is never set by place_boss_body_segments)
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
        [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],
        [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
        [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75],
        [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], // 5..21 (unused)
        [76],                                                               // 22 (ordinary key)
    ],
    // NOTE: zela.asm's projectile templates (proj_near/proj_far, fed to
    // Add_Projectile_To_Array) don't correspond to any extra frame group
    // here -- unlike CRAB's acid-drop (index 20/21) or TAKO's ink-droplet
    // (index 16), there's no confirmed extra tile-group in
    // byte_A03A..byte_A166 for Zela's shot, and the projectile struct's
    // fixed byte (0x15/0x14) isn't documented well enough to map with
    // confidence. If/when the real projectile sprite is identified, add
    // its frames here and reference the group's index from wherever the
    // WASM side reports the projectile's .flags.
    numSprites: 76,
};
const MEDA = {
    left: [ // 0xA030
        [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15], // tile group 0 (byte_A050)
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], // tile group 1 (byte_A0A0)
        [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47], // tile group 2 (byte_A0F0)
        [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62],     // tile group 3 (byte_A140)
        [], [], [], [], [], [], [], [], [], [],                           // 4...13 (unused)
        [63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78], // tile group 14 (byte_A18B)
        [79, 80, 81],                                                     // tile group 15 (byte_A1DB)
        [], [], [], [], [], [], [], [], [],                               // 16...24 (unused)
        [82],                                                             // 25 (blue potion)
    ],
    right: [ // 0xA070
        [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15], // tile group 0 (byte_A050)
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], // tile group 1 (byte_A0A0)
        [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47], // tile group 2 (byte_A0F0)
        [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62],     // tile group 3 (byte_A140)
        [], [], [], [], [], [], [], [], [], [],                           // 4...13 (unused)
        [63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78], // tile group 14 (byte_A18B)
        [79, 80, 81],                                                     // tile group 15 (byte_A1DB)
        [], [], [], [], [], [], [], [], [],                               // 16...24 (unused)
        [82],                                                             // 25 (blue potion)
    ],
    numSprites: 83,
};
const EAI6 = {
    left: [ // 0xA030: 32 arrays
        [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15], // group 0 (woman_top_left)
        [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50], // group 1 (woman_bottom_left)
        [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85], // group 2 (ghost_left)
        [105, 106, 107, 108, 109, 110, 111, 112],                         // group 3 (chicken_left)
        [124, 125, 126, 127],                                             // group 4 (destructible wall)
        [], [], [],                                                       // 5..7 unused
        [32, 33, 34],                                                     // group 8 (woman_top_death)
        [67, 68, 69],                                                     // group 9 (woman_bottom_death)
        [102, 103, 104],                                                  // group 10 (ghost_death)
        [121, 122, 123],                                                  // group 11 (chicken_death)
        [128, 129, 130],                                                  // group 12 (falling_ceiling)
        [], [], [],                                                       // 13..15 unused
        [157, 158, 159, 160],                                             // group 16 (dropping_floor)
        [157, 158, 159, 160],                                             // group 17 (dropping_floor)
        [131, 132, 133],                                                  // group 18 (hit)
        [146, 147, 148, 149, 150, 151, 152, 153],                         // group 19 (chest)
        [134, 135, 136, 137],                                             // group 20 (red_alma)
        [138, 139, 140, 141],                                             // group 21 (blue_alma)
        [154],                                                            // group 22 (ordinary_key)
        [],                                                               // 23 unused
        [155],                                                            // group 24 (red_potion)
        [156],                                                            // group 25 (blue_potion)
        [161],                                                            // group 26 (silkarn_shoe)
        [142, 143, 144, 145],                                             // group 27 (rare_alma)
        [], [],                                                           // 28, 29 unused
        [162],                                                            // group 30 (feruza_shoe)
    ],
    right: [ // 0xA070: 32 arrays
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],   // group 0 (woman_top_right)
        [51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66],   // group 1 (woman_bottom_right)
        [86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101], // group 2 (ghost_right)
        [113, 114, 115, 116, 117, 118, 119, 120],                           // group 3 (chicken_right)
        [124, 125, 126, 127],                                             // group 4 (destructible wall)
        [], [], [],                                                       // 5..7 unused
        [32, 33, 34],                                                     // group 8 (woman_top_death)
        [67, 68, 69],                                                     // group 9 (woman_bottom_death)
        [102, 103, 104],                                                  // group 10 (ghost_death)
        [121, 122, 123],                                                  // group 11 (chicken_death)
        [128, 129, 130],                                                  // group 12 (falling_ceiling)
        [], [], [],                                                       // 13..15 unused
        [157, 158, 159, 160],                                             // group 16 (dropping_floor)
        [157, 158, 159, 160],                                             // group 17 (dropping_floor)
        [131, 132, 133],                                                  // group 18 (hit)
        [146, 147, 148, 149, 150, 151, 152, 153],                         // group 19 (chest)
        [134, 135, 136, 137],                                             // group 20 (red_alma)
        [138, 139, 140, 141],                                             // group 21 (blue_alma)
        [154],                                                            // group 22 (ordinary_key)
        [],                                                               // 23 unused
        [155],                                                            // group 24 (red_potion)
        [156],                                                            // group 25 (blue_potion)
        [161],                                                            // group 26 (silkarn_shoe)
        [142, 143, 144, 145],                                             // group 27 (rare_alma)
        [], [],                                                           // 28, 29 unused
        [162],                                                            // group 30 (feruza_shoe)
    ],
    numSprites: 163,
};

const DUNGEONS = {
    0: { 
        mdtPath: 'game/0/mp10.mdt',
        tilesheetPath: 'assets/images/mpp1.png',
        entitySheetPath: 'assets/images/enp1.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
        ],
        slopeTilesLeft: [0xB], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0xC], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x0F, 0x0E, 0x0D], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [3, 2,  5, 3, 0, 0, 0, 0],
        monster_damage: [5, 5, 15, 8, 0, 0, 0, 0],
        death_descriptors: [
            [5, 4, 4, 0], // bat
            [4, 0, 4, 0], // slug
            [4, 0, 4, 0], // frog
            [5, 0, 0, 0], // rat
            [],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        ai: EAI1,
    },
    1: { // Dungeon 1 boss room — same dungeon group, shares tilesheets with index 0
        mdtPath: 'game/0/mp1d.mdt',
        tilesheetPath: 'assets/images/mpp1.png',
        entitySheetPath: 'assets/images/crab.png',
        passableTiles: [
            0x00, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp:     [],
        monster_damage: [
            6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 15, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6
            // temporary for testing (crab won't deal damage to Duke)
            // 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        bossState: {
            bossX: 0x2B,                // +0
            bossY: 0x0C,                // +2
            bossHP: 150,                // +3
            xpReward: 120,              // +5
            arenaCenterX: 12,           // +7
            bossPlacement: 0,           // +8
            almasReward: 150,           // +11
            bossName: 'Cangrejo',
        },
        ai: CRAB,
    },
    2: {
        mdtPath: 'game/0/mp20.mdt',
        tilesheetPath: 'assets/images/mpp2.png',
        entitySheetPath: 'assets/images/enp2.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x15, 0x16, 0x17, 0x18, 0x19,
        ],
        slopeTilesLeft: [0x10, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x11, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x12, 0x13, 0x14, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [10, 10, 4, 10, 4, 255, 0, 0],
        monster_damage: [10, 10, 8, 10, 8, 40, 0, 0],
        death_descriptors: [
            [5, 5, 5, 5], // boarman top
            [5, 5, 5, 5], // boarman bottom
            [4, 0, 4, 0], // blue slime
            [5, 4, 4, 0], // red toad
            [5, 4, 5, 0], // green bat
            [9, 9, 9, 9], // magic bat
            [],
            [],
        ],
        trajectories: [ // boarman
            [1,1,1,0,0,7,7,7,7,7,7,0xFF], // right: ↗↗↗→→↘↘↘↘↘↘
            [3,3,3,4,4,5,5,5,5,5,5,0xFF], // left:  ↙↙↙↙↙↙←←↖↖↖
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [26, 27, 28, 29], // boarman axes 
            [30, 31, 32, 33], // toad firespits
        ],
        ai: EAI2,
    },
    3: {
        mdtPath: 'game/0/mp21.mdt',
        tilesheetPath: 'assets/images/mpp2.png',
        entitySheetPath: 'assets/images/enp2.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x15, 0x16, 0x17, 0x18, 0x19,
        ],
        slopeTilesLeft: [0x10, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x11, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x12, 0x13, 0x14, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [10, 10, 4, 10, 4, 255, 0, 0],
        monster_damage: [10, 10, 8, 10, 8, 40, 0, 0],
        death_descriptors: [
            [5, 5, 5, 5], // boarman top
            [5, 5, 5, 5], // boarman bottom
            [4, 0, 4, 0], // blue slime
            [5, 4, 4, 0], // red toad
            [5, 4, 5, 0], // green bat
            [9, 9, 9, 9], // magic bat
            [],
            [],
        ],
        trajectories: [ // boarman
            [1,1,1,0,0,7,7,7,7,7,7,0xFF], // right: ↗↗↗→→↘↘↘↘↘↘
            [3,3,3,4,4,5,5,5,5,5,5,0xFF], // left:  ↙↙↙↙↙↙←←↖↖↖
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [26, 27, 28, 29], // boarman axes 
            [30, 31, 32, 33], // toad firespits
        ],
        ai: EAI2,
    },
    4: { // Dungeon 2 boss room
        mdtPath: 'game/0/mp2d.mdt',
        tilesheetPath: 'assets/images/mpp2.png',
        entitySheetPath: 'assets/images/tako.png',
        passableTiles: [
            0, 1, 2, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x15, 0x16, 0x17, 0x18, 0x19,
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
            10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 
            40, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        bossState: {
            bossX: 36,                  // +0
            bossY: 16,                  // +2
            bossHP: 250,                // +3
            xpReward: 200,              // +5
            arenaCenterX: 7,            // +7
            bossPlacement: 0xFF,        // +8
            almasReward: 200,           // +11
            bossName: 'Pulpo',
        },
        ai: TAKO,
    },
    5: {
        mdtPath: 'game/0/mp30.mdt',
        tilesheetPath: 'assets/images/mpp3.png',
        entitySheetPath: 'assets/images/enp3.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 7, 0x0B, 0x0C, 0x1B, 0x1C, 0x1D, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        slopeTilesLeft: [0x1B, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x1C, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x1D, 0x1E, 0x1F, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [20, 10, 10, 20, 0, 0, 0, 0],
        monster_damage: [40, 40, 16, 40, 0, 0, 0, 0],
        death_descriptors: [
            [4, 4, 0, 0],
            [5, 5, 0, 0],
            [4, 4, 4, 4],
            [5, 5, 5, 5],
            [],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2B], // earthworm projectile
        ],
        ai: EAI3,
    },
    6: {
        mdtPath: 'game/0/mp31.mdt',
        tilesheetPath: 'assets/images/mpp3.png',
        entitySheetPath: 'assets/images/enp3.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 7, 0x0B, 0x0C, 0x1B, 0x1C, 0x1D, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        slopeTilesLeft: [0x1B, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x1C, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x1D, 0x1E, 0x1F, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [20, 10, 10, 20, 0, 0, 0, 0],
        monster_damage: [40, 40, 16, 40, 0, 0, 0, 0],
        death_descriptors: [
            [4, 4, 0, 0],
            [5, 5, 0, 0],
            [4, 4, 4, 4],
            [5, 5, 5, 5],
            [],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2B], // earthworm projectile
        ],
        ai: EAI3,
    },
    7: { // dungeon 3 boss room
        mdtPath: 'game/0/mp3d.mdt',
        tilesheetPath: 'assets/images/mpp3.png',
        entitySheetPath: 'assets/images/tori.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 7, 0x0B, 0x0C, 0x1B, 0x1C, 0x1D, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
            56, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 
            18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x27, 0x28, 0x29, 0x2A],
        ],
        bossState: {
            bossX: 46,                  // +0
            bossY: 18,                  // +2
            bossHP: 500,                // +3
            xpReward: 500,              // +5
            arenaCenterX: 8,            // +7
            bossPlacement: 0xFF,        // +8
            almasReward: 500,           // +11
            bossName: 'Pollo',
        },
        ai: TORI,
    },
    8: {
        mdtPath: 'game/0/mp40.mdt',
        tilesheetPath: 'assets/images/mpp4.png',
        entitySheetPath: 'assets/images/enp4.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0B, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13
        ],
        slopeTilesLeft: [0x0D, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x0E, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x0B, 0x0C, 0, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [10, 10, 0, 0, 20, 0, 0, 0],
        monster_damage: [20, 4, 80, 80, 80, 0, 0, 0],
        death_descriptors: [
            [5, 4, 4, 5],
            [4, 4, 4, 4],
            [1, 1, 1, 1],
            [1, 1, 1, 1],
            [5, 5, 5, 4],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x14, 0x15],
        ],
        ai: EAI4,
    },
    9: {
        mdtPath: 'game/0/mp41.mdt',
        tilesheetPath: 'assets/images/mpp4.png',
        entitySheetPath: 'assets/images/enp4.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0B, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13
        ],
        slopeTilesLeft: [0x0D, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x0E, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x0B, 0x0C, 0, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [10, 10, 0, 0, 20, 0, 0, 0],
        monster_damage: [20, 4, 80, 80, 80, 0, 0, 0],
        death_descriptors: [
            [5, 4, 4, 5],
            [4, 4, 4, 4],
            [1, 1, 1, 1],
            [1, 1, 1, 1],
            [5, 5, 5, 4],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x14, 0x15],
        ],
        ai: EAI4,
    },
    10: { // dungeon 4 boss room
        mdtPath: 'game/0/mp4d.mdt',
        tilesheetPath: 'assets/images/mpp4.png',
        entitySheetPath: 'assets/images/zela.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0B, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x14, 0x15],
        ],
        bossState: {
            bossX: 48,                // +0
            bossY: 12,                // +2
            bossHP: 500,              // +3
            xpReward: 1000,           // +5
            arenaCenterX: 12,         // +7
            bossPlacement: 0,         // +8
            almasReward: 600,         // +11
            bossName: 'Agar',
        },
        ai: ZELA,
    },
    11: {
        mdtPath: 'game/0/mp50.mdt',
        tilesheetPath: 'assets/images/mpp5.png',
        entitySheetPath: 'assets/images/enp5.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2D, 0x2E, 0x2F
        ],
        slopeTilesLeft: [0x21, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x22, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x1A, 0x1B, 0x1C, 0x1D], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0, 0, 0, 0, 0x25, 0x26, 0, 0, 0x23, 0x24, 0, 0], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [50, 50, 20, 10, 10], // from eaiN.bin
        monster_damage: [40, 40, 20, 20, 10], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 5, 5, 5],
            [11, 5, 5, 5],
            [5, 4, 5, 4],
            [5, 0, 5, 0],
            [5, 0, 5, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x31, 0x32, 0x33, 0x34],
        ],
        ai: EAI5,
    },
    12: {
        mdtPath: 'game/0/mp51.mdt',
        tilesheetPath: 'assets/images/mpp5.png',
        entitySheetPath: 'assets/images/enp5.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2D, 0x2E, 0x2F
        ],
        slopeTilesLeft: [0x21, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x22, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x1A, 0x1B, 0x1C, 0x1D], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0, 0, 0, 0, 0x25, 0x26, 0, 0, 0x23, 0x24, 0, 0], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [50, 50, 20, 10, 10], // from eaiN.bin
        monster_damage: [40, 40, 20, 20, 10], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 5, 5, 5],
            [11, 5, 5, 5],
            [5, 4, 5, 4],
            [5, 0, 5, 0],
            [5, 0, 5, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x31, 0x32, 0x33, 0x34],
        ],
        ai: EAI5,
    },
    13: { // dungeon 5 boss room
        mdtPath: 'game/0/mp5d.mdt',
        tilesheetPath: 'assets/images/mpp5.png',
        entitySheetPath: 'assets/images/meda.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2D, 0x2E, 0x2F
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x30],
        ],
        bossState: {
            bossX: 48,                // +0
            bossY: 11,                // +2
            bossHP: 700,              // +3
            xpReward: 3000,           // +5
            arenaCenterX: 12,         // +7
            bossPlacement: 0,         // +8
            almasReward: 800,         // +11
            bossName: 'Vista',
        },
        ai: MEDA,
    },
    14: {
        mdtPath: 'game/0/mp60.mdt',
        tilesheetPath: 'assets/images/mpp6.png',
        entitySheetPath: 'assets/images/enp6.png', // implement me!
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 6, 0x0A, 0x0B, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x21, 0x22,
        ],
        slopeTilesLeft: [0x19, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x18, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x16, 0x21, 0x22, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [100, 100, 50, 50], // from eaiN.bin
        monster_damage: [80, 80, 40, 40, 80], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 11],
            [11, 11, 11, 11],
            [5, 5, 5, 5],
            [5, 5, 0, 0],
            [0, 0, 0, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x23, 0x24],
        ],
        ai: EAI6,
    },
    15: {
        mdtPath: 'game/0/mp61.mdt',
        tilesheetPath: 'assets/images/mpp6.png',
        entitySheetPath: 'assets/images/enp6.png', // implement me!
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 6, 0x0A, 0x0B, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x21, 0x22,
        ],
        slopeTilesLeft: [0x19, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x18, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x16, 0x21, 0x22, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [100, 100, 50, 50], // from eaiN.bin
        monster_damage: [80, 80, 40, 40, 80], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 11],
            [11, 11, 11, 11],
            [5, 5, 5, 5],
            [5, 5, 0, 0],
            [0, 0, 0, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x23, 0x24],
        ],
        ai: EAI6,
    },
    16: {
        mdtPath: 'game/0/mp62.mdt',
        tilesheetPath: 'assets/images/mpp6.png',
        entitySheetPath: 'assets/images/enp6.png', // implement me!
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 6, 0x0A, 0x0B, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x21, 0x22,
        ],
        slopeTilesLeft: [0x19, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x18, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x16, 0x21, 0x22, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [100, 100, 50, 50], // from eaiN.bin
        monster_damage: [80, 80, 40, 40, 80], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 11],
            [11, 11, 11, 11],
            [5, 5, 5, 5],
            [5, 5, 0, 0],
            [0, 0, 0, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x23, 0x24],
        ],
        ai: EAI6,
    },
};

const NOTIFICATION_STRINGS = {
    1:  [38, "You get 50 golds."],
    2:  [34, "You get 100 golds."],
    3:  [34, "You get 500 golds."],
    4:  [30, "You get 1000 golds."],
    5:  [50, "You get a Key."],
    6:  [28, "You have recovered."],
    7:  [8,  "You have recovered full."],
    8:  [60, "Shield broken."],
    9:  [20, "Can't open this door."],
    10: [28, "Nothing in the box."],
    11: [6,  "You get the Hero's Crest."],
    12: [0,  "You get the Ruzeria shoes."],
    13: [8,  "You get the Glory Crest."],
    14: [6,  "You get the Pirika shoes."],
    15: [6,  "You get the Feruza shoes."],
    16: [0,  "You get the Silkarn shoes."],
    17: [0,  "Get the Enchantment sword."],
    18: [48, "It's too hot !!"],
    19: [8,  "Get the lion's head Key."],
};

const DUNGEON_DCHR_SHEET_PATH = 'assets/images/dchr.png';
const DUNGEON_MAGIC_SHEET_PATH = 'assets/images/magic.png';
const DUNGEON_HERO_SHEET_PATH = 'assets/images/fman.png';
const DUNGEON_SWORD_SHEET_PATH = 'assets/images/sword.png';
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

const SWORD_REACH_SMALL = {
    // right forward phases 0, 1
    0:  [0x46, 0x01, 0x23, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0xFF],

    // right forward phases 2, 3
    2:  [0x8F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF],
    
    // right forward phases 4, 5
    4:  [0x91, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0xFF],
    
    // right overhead phases 0, 1
    6:  [0x47, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0xFF],
    
    // right overhead phases 2, 3
    8:  [0x49, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x22, 0x01, 0xFF],
    
    // right downward thrust single phase
    10: [0x91, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0xFF],

    12: [], // unused
    14: [], // unused

    // left forward phases 0, 1
    16: [0x4A, 0x01, 0x22, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0xFF],

    // left forward phases 2, 3
    18: [0x8D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF],

    // left forward phases 4, 5
    20: [0x8D, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0xFF],

    // left overhead phases 0, 1
    22: [0x48, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0xFF],

    // left overhead phases 2, 3
    24: [0x46, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x22, 0x01, 0xFF],

    // left downward thrust single phase
    26: [0x8F, 0x01, 0x23, 0x01, 0x23, 0x01, 0x01, 0x22, 0x01, 0x01, 0xFF],
};
const SWORD_REACH_MEDIUM = {
    0:  [0x22, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0xFF], 
    2:  [0x6A, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1E, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    4:  [0x91, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    6:  [0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    8:  [0x4A, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0xFF], 
    10: [0x90, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0xFF], 
    12: [],
    14: [],
    16: [0x26, 0x01, 0x23, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0xFF], 
    18: [0x6C, 0x01, 0x01, 0x01, 0x1D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    20: [0x8C, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    22: [0x24, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    24: [0x45, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0xFF], 
    26: [0x8F, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x23, 0x01, 0xFF],
};
const SWORD_REACH_LARGE = {
    0:  [0x22, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x23, 0x01, 0xFF], 
    2:  [0x6A, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1E, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    4:  [0x91, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    6:  [0x00, 0x01, 0x20, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    8:  [0x25, 0x01, 0x01, 0x22, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0xFF], 
    10: [0xB4, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x23, 0x01, 0xFF], 
    12: [],
    14: [],
    16: [0x26, 0x01, 0x23, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0xFF], 
    18: [0x6D, 0x01, 0x01, 0x1D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    20: [0x8C, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    22: [0x00, 0x01, 0x23, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0xFF], 
    24: [0x22, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x21, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x20, 0x01, 0x01, 0xFF], 
    26: [0xB3, 0x01, 0x01, 0x22, 0x01, 0x01, 0x22, 0x01, 0x01, 0x23, 0x01, 0x23, 0x01, 0xFF],
};

const SWORD_OVERLAY_OFFSETS = {
    // right forward phases 0-5
    0: [-2, -2, -2, -2, -2, -1, -2, 2, -2, 2, -2, 2],

    // right overhead phases 0-3
    1: [-2, -2, -2, -1, -2, 1, 1, 1],
    
    // left forward phases 0-5
    2: [-2, 1, -2, 1, -2, 0, -2, -3, -2, -3, -2, -3],
    
    // left overhead phases 0-3
    3: [-2, 1, -2, 0, -2, -2, 1, -2]
};
const TOWN_BACKGROUND_YMPD_PATH = 'assets/images/ympd/ympd1.png';
const TOWN_SIDEWALK1_YMPD_PATH = 'assets/images/ympd/ympd2.png';
const TOWN_SIDEWALK2_YMPD_PATH = 'assets/images/ympd/ympd3.png';
const TOWN_BACKGROUND_CKPD_PATH = 'assets/images/ckpd/ckpd1.png';
const TOWN_BACKGROUND0_CKPD_PATH = 'assets/images/ckpd/ckpd0.png';
const TOWN_SIDEWALK1_CKPD_PATH = 'assets/images/ckpd/ckpd2.png';
const TOWN_SIDEWALK2_CKPD_PATH = 'assets/images/ckpd/ckpd3.png';
const ROKA_IMAGE_PATHS = [
    'assets/images/roka/roka_cyan.jpg',
    'assets/images/roka/roka_red.jpg',
    'assets/images/roka/roka_blue.jpg',
    'assets/images/roka/roka_green.jpg',
    'assets/images/roka/roka_violet.jpg',
];
const DMAN_SHEET_PATH   = 'assets/images/tears/dman.png';
const TEAR_BLUE_PATH    = 'assets/images/tears/tear_blue.png';
const TEAR_RED_PATH     = 'assets/images/tears/tear_red.png';
const SPARKLE_48_PATH   = 'assets/images/tears/sparkles_48x48.png';
const SPARKLE_WIDE_PATH = 'assets/images/tears/sparkles_192x48.png';
const ENCOUNTER_IMAGE_PATH = 'assets/images/encounter.png';

// Tear of Esmesanti slots on the mole_t.jpg strip (DOM overlay above the canvas).
const TEAR_SLOTS_BLUE = [
    { x:  49, y: 6 }, 
    { x: 602, y: 6 },
    { x: 121, y: 6 }, 
    { x: 530, y: 6 }, 
    { x: 193, y: 6 }, 
    { x: 458, y: 6 }, 
    { x: 265, y: 6 },
    { x: 386, y: 6 }, 
];
const TEAR_SLOT_RED = { x: 320, y: 1 };
const MOLE_IMG_H = 42;

// Per-cavern savegame flags that record a collected Tear of Esmesanti, in
// cavern order (matches TEAR_SLOTS_BLUE / TEAR_SLOT_RED). The boss cavern's
// exit door ORs its achievement (door.d_save_achievement_addr /
// door.d_achievement_flag) into these bytes, so saves made before the
// rokademo feature (which only incremented ADDR_TEAR_COUNT) still carry the
// collected tears here. See asm/common.inc for the variable names.
const TEAR_FLAGS = [
    { addr: 0x03, bit: 0x20 }, // Cangrejo — malicia_items_1 (+32)
    { addr: 0x0B, bit: 0x08 }, // Pulpo    — (exit door achievement addr 0x0B)
    { addr: 0x13, bit: 0x02 }, // Pollo    — riza_items (+2)
    { addr: 0x1C, bit: 0x10 }, // Agar     — escarcha_items_1 (+16)
    { addr: 0x24, bit: 0x04 }, // Vista    — cementar_items_1 (+4)
    { addr: 0x2D, bit: 0x10 }, // Tarso    — plata_items_2 (+16)
    { addr: 0x36, bit: 0x80 }, // Paguro   — caliente_items_2 (+128)
    { addr: 0x45, bit: 0x40 }, // Dragon   — falter_items (+64)
    { addr: 0x47, bit: 0xFF }, // Jashiin  — no door achievement; 0x47 = defeated (mpa0 initializer)
];

const HERO_SPRITE_PATH = 'assets/images/tman.png';
const PRINCESS_CHAMBER_PATH = 'assets/images/omoya/princess.png';
const KING_IMAGE_PATHS = [
    null,
    'assets/images/king/king1.png',
    'assets/images/king/king2.png',
    'assets/images/king/king3.png',
    'assets/images/king/king4.png',
    'assets/images/king/king5.png',
    'assets/images/king/king6.png',
    'assets/images/king/king7.png',
    'assets/images/king/king8.png',
    'assets/images/king/king9.png',
];
const SAGE_IMAGE_PATH     = 'assets/images/kenjya/kenjya.png';

const ITEMP_SWORD_IMAGE_PATHS = [
    'assets/images/itemp/training_sword.png',
    'assets/images/itemp/wiseman_sword.png',
    'assets/images/itemp/spirit_sword.png',
    'assets/images/itemp/knight_sword.png',
    'assets/images/itemp/illumination_sword.png',
    'assets/images/itemp/enchantment_sword.png',
];
const ITEMP_SHIELD_IMAGE_PATHS = [
    'assets/images/itemp/clay_shield.png',
    'assets/images/itemp/wiseman_shield.png',
    'assets/images/itemp/stone_shield.png',
    'assets/images/itemp/honor_shield.png',
    'assets/images/itemp/light_shield.png',
    'assets/images/itemp/titanium_shield.png',
];
const ITEMP_MAGIC_IMAGE_PATHS = [
    'assets/images/itemp/espada_magic.png',
    'assets/images/itemp/saeta_magic.png',
    'assets/images/itemp/fuego_magic.png',
    'assets/images/itemp/lanzar_magic.png',
    'assets/images/itemp/rascar_magic.png',
    'assets/images/itemp/agua_magic.png',
    'assets/images/itemp/guerra_magic.png',
];
// ─── Town NPC sprite config ────────────────────────────────────────────────────────
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

// WASM memory addresses (mirrors town.h / town.c)
const ADDR_SPOKE_TO_KING             = 0x05;
const ADDR_ENTERED_CAVERN_FIRST_TIME = 0x06;
const ADDR_DEATH_ALREADY_PROCESSED   = 0x49;
const ADDR_PROXIMITY_MAP_LEFT_COL    = 0x80;
const ADDR_VIEWPORT_TOP_ROW          = 0x82;      // byte, viewport top in proximity map
const ADDR_PROJECTILES_LIST          = 0xEB80;    // 13×32 bytes, terminated by 0xFF (enemy projectiles)
const PROJECTILE_STRUCT_SIZE         = 13;
const ADDR_MAGIC_PROJECTILES         = 0xEB15;    // 4 slots × 16 bytes each
const MAGIC_PROJECTILE_STRIDE        = 0x10;
const ADDR_BYTE_9EED                 = 0x9EED;    // set on casting "guerra"
const ADDR_HERO_X_VIEW               = 0x83;
const ADDR_HERO_HEAD_Y_VIEW          = 0x84;
const ADDR_HERO_GOLD_HI              = 0x85;
const ADDR_HERO_GOLD_LO              = 0x86;
const ADDR_HERO_ALMAS                = 0x8b;
const ADDR_HERO_LEVEL                = 0x8d;
const ADDR_HERO_XP                   = 0x8e;
const ADDR_HERO_HP                   = 0x90;
const ADDR_SWORD_TYPE                = 0x92;
const ADDR_SHIELD_TYPE               = 0x93;
const ADDR_SHIELD_HP                 = 0x94;
const ADDR_CURR_SPELL_TYPE           = 0x9d;
const ADDR_TEAR_COUNT                = 0xA0;
const ADDR_SPELL_COUNTS = [
    0xab, 0xac, 0xad, 0xae, 0xaf, 0xb0, 0xb1
];
const ADDR_HERO_MAX_HP               = 0xB2;
const ADDR_FACING                    = 0xC2;
const ADDR_LEFT_RUN                  = 0xC3;
const ADDR_PLACE_MAP_ID              = 0xC4;
const ADDR_LAST_SAGE_VISITED         = 0xC5;
const ADDR_SAGES_SPOKEN              = 0xE5;
const ADDR_HERO_ANIM_PHASE           = 0xE7;
const ADDR_INVINCIBILITY_FLAG        = 0xE8;

const ADDR_BOSS_STATE_BLOCK        = 0x9D00;
const ADDR_BYTE_9F00               = 0x9F00;
const ADDR_BOSS_PLACEMENT          = 0x9F01;
const ADDR_HERO_X_IN_PROXIMITY_MAP = 0x9F1A; // word
const ADDR_DOOR_TARGET_Y           = 0x9F1C; // byte
const ADDR_DOOR_FEATURES           = 0x9F1D; // byte

const ADDR_BOSS_STATE_PTR          = 0xA002;

const ADDR_TOWN_DESCRIPTOR_PTR     = 0xC000;
const ADDR_MAP_WIDTH               = 0xC002; // word (from MDT)
const ADDR_DUNGEON_ENTRANCE_TABLE  = 0xC00B;
const ADDR_NPC_ARRAY_PTR           = 0xC00F;
const ADDR_MONSTERS_LIST           = 0xC010; // word — pointer to monster table (16-byte entries)
const ADDR_CAVERN_LEVEL            = 0xC012;
const ADDR_TEAR_X                  = 0xC013; // word
const ADDR_HERO_Y_VIEW_INIT        = 0xC016;
const ADDR_CAVERN_SIGNS_INFO       = 0xC017; // word
const ADDR_PROXIMITY_MAP           = 0xE000; // 36*64 circular buffer
const ADDR_VIEWPORT_ENTITIES       = 0xE900; // 28*19 bytes cache buffer
const ADDR_PROXIMITY_LAYER2        = 0xED20; // 128 bytes layer-2 tile mapping
const ADDR_MAGIA_STONE_SPRITE0     = 0xEB60; // magia stone sprite 0 (7 bytes each, 4 sprites)
const ADDR_BOSS_EXPLOSIONS_LIST    = 0xEDA0; // up to 32 entities (4 bytes each)
const ADDR_FRAME_TIMER             = 0xFF1A;
const ADDR_SPRITE_FLASH_FLAG       = 0xFF2F; // byte
const ADDR_BOSS_IS_DEAD            = 0xFF30; // byte — 0xFF when boss is dead
const ADDR_VIEWPORT_LEFT_TOP       = 0xFF31; // word; address within proximity map, corresponding to viewport row 0, column -4; 0E000h .. 0E8FFh
const ADDR_SPEED_CONST             = 0xFF33;
const ADDR_IS_BOSS_CAVERN          = 0xFF34; // byte
const ADDR_HERO_SPRITE_HIDDEN      = 0xFF37;
const ADDR_SQUAT_FLAG              = 0xFF38;
const ADDR_ON_ROPE_FLAGS           = 0xFF39;
const ADDR_HERO_HIDDEN_FLAG        = 0xFF3A;
const ADDR_SPELL_ACTIVE_FLAG       = 0xFF3C;
const ADDR_JUMP_PHASE_FLAGS        = 0xFF3D;
const ADDR_BYTE_FF3E               = 0xFF3E; // spell projectile active flag
const ADDR_SHIELD_ANIM_PHASE       = 0xFF3F;
const ADDR_SHIELD_ANIM_ACTIVE      = 0xFF40;
const ADDR_SHIELD_VARIANT_INDEX    = 0xFF41;
const ADDR_SLOPE_DIRECTION         = 0xFF42; // 1=right, 2=left, 0=none
const ADDR_SWORD_SWING_FLAG        = 0xFF43;
const ADDR_UI_ELEMENT_DIRTY        = 0xFF44;
const ADDR_SWORD_HIT_TYPE          = 0xFF45;
const ADDR_SWORD_MOVEMENT_PHASE    = 0xFF46;
const ADDR_SOUND_FX_REQUEST        = 0xFF75;
// Semaphores for js-wasm communication
const ADDR_DUNGEON_STATE           = 0xFF90;
const ADDR_DUNGEON_FRAME_PHASE     = 0xFF91;
const ADDR_RENDER_REQUEST          = 0xFF92;
const ADDR_RENDER_DONE             = 0xFF93;
const ADDR_GOLD_RENDER_REQUEST     = 0xFF94;
const ADDR_DEATH_COUNTER           = 0xFF95;
const ADDR_NOTIFICATION_MSG_ID     = 0xFF96;
const ADDR_NOTIFICATION_FLAG       = 0xFF97;
const ADDR_ALMAS_RENDER_REQUEST    = 0xFF98;
const ADDR_HEALTH_BAR_REQUEST      = 0xFF99;
const ADDR_SHIELD_HP_RENDER_REQUEST = 0xFF9A;
const ADDR_ROKA_PHASE              = 0xFF9D;
const ADDR_ROKA_COLOR              = 0xFF9E;
const ADDR_BOSS_HEALTH_REQUEST     = 0xFF9F;
const ADDR_BOSS_MODE               = 0xFFA0;
const ADDR_CAVERN_SIGN_FLAG        = 0xFFA1;
const ADDR_CAVERN_SIGN_IDX         = 0xFFA2;
const ADDR_MAGIC_LEFT_RENDER_REQUEST = 0xFFA3;
const ADDR_DUNGEON_EXIT_FLAG       = 0xFFE2;
const ADDR_HERO_DEATH_FLAG         = 0xFFE3;

const ADDR_PENDING_TRANSITION_FLAG = 0xFFF4;
const ADDR_CONVERSATION_ACTIVE     = 0xFFF5;
const ADDR_BUILDING_ACTIVE         = 0xFFFA;
const ADDR_BUILDING_DEST_ID        = 0xFFFB;
const ADDR_PENDING_DUNGEON_MAP     = 0xFFFC;
const ADDR_PENDING_DUNGEON_FLAG    = 0xFFFD;

const DUNGEON_STATE_DEATH_FADE = 4;
const DUNGEON_STATE_BOSS_ENCOUNTER = 5;
const DUNGEON_STATE_ROKA_RUN = 7;
const DUNGEON_STATE_ROKADEMO = 9;

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
const PROX_COLS = 36;
const DUNGEON_MAP_HEIGHT = 64;
const PROX_SIZE = PROX_COLS * DUNGEON_MAP_HEIGHT;
const DUNGEON_VIEW_LEFT_IN_PROX = 4;
const DUNGEON_ENTITY_W = 48;
const DUNGEON_ENTITY_H = 48;
const DUNGEON_HERO_FRAME_W = 72;
const DUNGEON_HERO_FRAME_H = 72;
const DUNGEON_SWORD_FRAME_W = 96;
const DUNGEON_SWORD_FRAME_H = 96;
const DUNGEON_HERO_SHEET_COLS = 16;
const DUNGEON_SWORD_SHEET_COLS = 10;
const ANIM_SPEED_TICKS = 8;
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
let dungeonInit;
let dungeonUpdate;
let dungeonFullTick;
let dungeonGetViewportTop;
let dungeonGetFullMapPtr;
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

let activeModal = null;          // instance of SaveDialog or RestoreDialog
let gamePaused = false;          // freeze game updates while modal is open
let inventoryScreenInstance = null; // instance of InventoryScreen

function openInventory() {
    if (inventoryScreenInstance || !engineReady) return;
    if (activeModal || indoorActiveScene || openingIntro.active) return;
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
    65,
];
const MUSIC_TRACKS = ['mgt1'];

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
let sfxEnabled = true;
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
    soundManager.setMusicMuted?.(!musicEnabled, 0.25);

    console.log(`Music ${musicEnabled ? 'ON' : 'OFF'}`);
}

function toggleSfx() {
    sfxEnabled = !sfxEnabled;
    soundManager.setSfxMuted?.(!sfxEnabled, 0.25);

    console.log(`SFX ${sfxEnabled ? 'ON' : 'OFF'}`);
}

// ─── PIT tick callbacks ───────────────────────────────────────────────────────
function onFullTick() {
    if (gamePaused) return;
    frameTimer  = (frameTimer  + 1) & 0xFF;
    tickCounter = (tickCounter + 1) & 0xFFFF;
    animTimer   = (animTimer   + 1) & 0xFFFF;
    if (gameMode === 'dungeon') {
        dungeonFullTick?.();
    }
    else townFullTick?.();

    if (engineReady) {
        const speedC     = readMemory(ADDR_SPEED_CONST, 1)[0] || 5;
        const target     = speedC * 4;
        const frameTmr   = readMemory(ADDR_FRAME_TIMER, 1)[0];
        if (gameMode === 'dungeon') {
            // Bypass the speed gate during roka run so the 8-bit ADDR_FRAME_TIMER wraparound 
            // doesn't starve dungeonUpdate() and cause frame skips
            const isRokaRun = readMemory(ADDR_DUNGEON_STATE, 1)[0] === DUNGEON_STATE_ROKA_RUN;
            if (isRokaRun || frameTmr >= target) {
                const phaseBefore = readU8(ADDR_DUNGEON_FRAME_PHASE);
                dungeonUpdate?.();
                // mirrors `inc render_counter` in Refresh_Dirty_Tiles: advance once
                // per completed dungeon frame. The WASM phase machine splits each
                // frame into 3 sub-steps (0→1→2→0), so dungeonUpdate() is called 3x
                // per frame; only step phase 2→0 finishes a frame. Incrementing on
                // every call made cavern tile animation 3x too fast and bursty.
                if (isRokaRun || (phaseBefore === 2 && readU8(ADDR_DUNGEON_FRAME_PHASE) === 0)) {
                    renderCounter = (renderCounter + 1) & 0xFF;
                }
                if (readMemory(ADDR_DUNGEON_EXIT_FLAG, 1)[0] === 0xFF) {
                    if (readMemory(ADDR_HERO_DEATH_FLAG, 1)[0] === 0xFF) {
                        initTownFromDungeon(readMemory(ADDR_LAST_SAGE_VISITED, 1)[0], true);
                    } else {
                        initTownFromDungeon(readMemory(ADDR_PLACE_MAP_ID, 1)[0], false);
                    }
                } else if (readMemory(ADDR_PENDING_DUNGEON_FLAG, 1)[0] === 0xFF) {
                    dungeonTileSheetReady = false;
                    dungeonEntitySheetReady = false;
                    const pendingMap = readMemory(ADDR_PENDING_DUNGEON_MAP, 1)[0];
                    handleDungeonTransition(pendingMap, false);
                }
            }
        } else if (frameTmr >= target) { // town mode
            townUpdate?.();
            const scrollFlag = readMemory(0xfff0, 1)[0];
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
            if (readMemory(ADDR_PENDING_DUNGEON_FLAG, 1)[0] === 0xFF) {
                const pendingMap = readMemory(ADDR_PENDING_DUNGEON_MAP, 1)[0];
                handleDungeonTransition(pendingMap, true);
            }
            checkBuildingRequest();
        }
    }
}

function onSlowTick() {
    if (gamePaused) return;
    if (!engineReady) return;

    updateInputLatches();
    inputSetKeys(keys);

    if (gameMode === 'dungeon') return;

    if (!conversation.active) {
        const activeFlag = readMemory(0xFFF5, 1)[0];
        if (activeFlag) {
            startConversationFromWasm();
        }
    }

    if (conversation.active) {
        const spaceLatched = readMemory(0xFF1D, 1)[0];

        if (conversation.yesNoMode) {
            const dirUp = keys.ArrowUp && !lastDirUp;
            const dirDown = keys.ArrowDown && !lastDirDown;
            lastDirUp = keys.ArrowUp;
            lastDirDown = keys.ArrowDown;
            if (dirUp && conversation.yesNoCursor > 0) {
                conversation.yesNoCursor--;
            } else if (dirDown && conversation.yesNoCursor < 1) {
                conversation.yesNoCursor++;
            }
            if (spaceLatched) {
                writeMemory(0xFF1D, [0]);
                const selectedYes = conversation.yesNoCursor === 0;
                conversation.active = false;
                conversation.savedBackground = null;
                conversation.yesNoMode = false;
                conversation.hasYesNo = false;
                townFinishConversation?.();
                const responseNpcId = selectedYes ? 0x0C : 0x0D;
                const rawText = getNpcConversationRaw(responseNpcId);
                if (rawText) {
                    const parsed = parseDialogText(rawText);
                    if (parsed.pages.length > 0) {
                        conversation.active = true;
                        conversation.pages = parsed.pages;
                        conversation.page = 0;
                        conversation.hasYesNo = false;
                        conversation.savedBackground = null;
                        computeBoxGeometry(conversation.facingLeft);
                    }
                }
            }
            return;
        }

        if (spaceLatched) {
            writeMemory(0xFF1D, [0]);
            if (conversation.page < conversation.pages.length - 1) {
                conversation.page++;
                computeBoxGeometry(conversation.facingLeft);
            } else if (conversation.hasYesNo) {
                conversation.yesNoMode = true;
                conversation.yesNoCursor = 0;
                computeBoxGeometry(conversation.facingLeft, 2);
            } else {
                conversation.active = false;
                conversation.savedBackground = null;
                townFinishConversation?.();
            }
        }
        return;
    }

    const scrollFlag = readMemory(0xfff0, 1)[0];
    if (scrollFlag) {
        if (scrollFlag & 0x01) scrollFloorOneTileRight();
        if (scrollFlag & 0x02) scrollFloorOneTileLeft();
        if (scrollFlag & 0x04) scrollCeilingHalfTileRight();
        if (scrollFlag & 0x08) scrollCeilingHalfTileLeft();
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
let lastDirUp = false;
let lastDirDown = false;

window.addEventListener('keydown', e => {
    if (['F1', 'F2', 'F7', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(e.code))
        e.preventDefault();
    
    if (e.code === 'F1') {
        if (!e.repeat) toggleMusic();
        return;
    }

    if (e.code === 'F2') {
        if (!e.repeat) toggleSfx();
        return;
    }

    if (e.code === 'F7') {
        if (!activeModal && !gamePaused) {
            openRestoreModal();
        }
        return;
    }

    if (e.code === 'F8') {
        if (!activeModal && !gamePaused && engineReady) {
            openImportExportModal();
        }
        return;
    }

    if (e.code === 'F9' && !e.repeat) {
        if (!speedChange.active && !activeModal && !gamePaused && engineReady &&
            (gameMode === 'town' || gameMode === 'dungeon')) {
            startSpeedChange();
        }
        return;
    }

    // If a modal is active, route keys to it
    if (activeModal) {
        let key = e.code;
        // Convert letter keys to lowercase character
        if (key.startsWith('Key')) {
            key = key[3].toLowerCase();      // 'KeyA' -> 'a'
        } else if (key.startsWith('Digit')) {
            key = key[5];                    // 'Digit1' -> '1'
        } else if (key === 'Space') {
            key = ' ';                       // space character
        } else if (key === 'Backspace') {
            key = 'Backspace';               // keep as is
        }
        // ArrowUp, ArrowDown, Enter, Escape remain unchanged
        if (activeModal.handleKey(key, performance.now())) {
            e.preventDefault();
        }
        return;
    }

    // If inventory screen is open, route keys to it
    if (inventoryScreenInstance) {
        if (inventoryScreenInstance.handleKey(e.code, e.ctrlKey, e.shiftKey, e.repeat)) {
            e.preventDefault();
        }
        return;
    }

    if (openingIntro.active && e.code === 'Space') {
        openingIntro.skipPage();
        return;
    }

    if (indoorActiveScene) {
        if (e.code === 'Space')                       keys.Space     = true;
        if (e.code === 'Enter')                       keys.Enter     = true;
        if (e.code === 'Escape')                      keys.Escape    = true;
        if (e.code === 'ArrowUp')                     keys.ArrowUp   = true;
        if (e.code === 'ArrowDown')                   keys.ArrowDown = true;
        if (e.code === 'ArrowLeft')                   keys.ArrowLeft = true;
        if (e.code === 'ArrowRight')                  keys.ArrowRight = true;

        if (e.code === 'Space' && !e.repeat) indoorActiveScene.handleInput('Space', e.repeat);
        else if (e.code === 'Enter' && !e.repeat) indoorActiveScene.handleInput('Enter', e.repeat);
        else if (e.code === 'Escape' && !e.repeat) indoorActiveScene.handleInput('Escape', e.repeat);
        else if (e.code === 'ArrowUp') indoorActiveScene.handleInput('ArrowUp', e.repeat);
        else if (e.code === 'ArrowDown') indoorActiveScene.handleInput('ArrowDown', e.repeat);
        else if (e.code === 'ArrowLeft') indoorActiveScene.handleInput('ArrowLeft', e.repeat);
        else if (e.code === 'ArrowRight')                  indoorActiveScene.handleInput('ArrowRight', e.repeat);
        return;
    }

    // Route keys to speed change dialog while active
    if (speedChange.active) {
        if (speedChange.phase === 1) {
            if (e.code === 'Escape') {
                cancelSpeedChange();
                e.preventDefault();
                return;
            }
            if (e.code.startsWith('Digit') && e.code.length === 6) {
                const digit = parseInt(e.code[5], 10);
                if (digit >= 0 && digit <= 9) {
                    speedChange.digit = digit;
                    speedChange.phase = 2;
                    writeMemory(ADDR_SPEED_CONST, [10 - digit]);
                    writeMemory(ADDR_SOUND_FX_REQUEST, [1]);
                    e.preventDefault();
                }
                return;
            }
        } else if (speedChange.phase === 2) {
            if (['Space', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                finishSpeedChange();
                e.preventDefault();
            }
            return;
        }
        return;
    }

    // Open inventory on Enter in town or dungeon (not during conversation)
    if (e.code === 'Enter' && !e.repeat && engineReady && !activeModal &&
        !conversation.active && (gameMode === 'town' || gameMode === 'dungeon')) {
        openInventory();
        e.preventDefault();
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
    if (e.code === 'F9' && speedChange.active && speedChange.phase === 0) {
        speedChange.phase = 1;
    }

    if (inventoryScreenInstance &&
        (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
        inventoryScreenInstance.resetDebugCombo();
    }

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
    const wasmBridge = await import('./src/zeliard-wasm.js');
    ({
        initWasm, loadSaveState, loadMdt, getCavernMdtHeader, getCavernName,
        getTownMdtHeader, getTownName, getMusicTrackId, getTownBackgroundType,
        getTownPatId, inputSetKeys, getWasmMemory, townInit,
        townSetReturnBeforeMainLoop, townEntryDisablingEdgeScroll, townUpdate,
        townFullTick, hasWasmExport, setSpecialTileList, readMemory, writeMemory,
        getTownPendingTransitionFlag, getTownPendingTransition, townCompleteTransition,
        townEntryEnablingEdgeScroll, townFinishConversation, townFinishBuilding,
        dungeonInit, dungeonUpdate, dungeonFullTick, dungeonGetViewportTop,
        dungeonGetFullMapPtr, dungeonGetEntityTable, dungeonGetEntityCount,
        setDungeonPassableTiles, setDungeonAggressiveGround, 
        setDungeonSlopeTilesLeft, setDungeonSlopeTilesRight, setDungeonAirflows,
        setDungeonSwordReach, setDungeonMonsterXp, setDungeonMonsterDamage, setDeathDescriptors, setTrajectories,
        dungeonGetRenderRequest, dungeonClearRenderRequest, getBossName,
        dungeonCompleteBossEntry, finishRokademoTransition,
    } = wasmBridge);
}

// Conversation state (NPC dialog overlay)
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
    hasYesNo: false,
    yesNoMode: false,
    yesNoCursor: 0,
    facingLeft: false,
};

let speedChange = {
    active: false,
    phase: 0,
    digit: -1,
};

// Used by touch-controls.js to show a mobile digit pad while the
// speed-change dialog is waiting for input.
export function getSpeedChangePhase() {
    return speedChange.active ? speedChange.phase : -1;
}

// ─── Town scroll helpers ──────────────────────────────────────────────────────
function resetTownScrollOffsets() {
    townSidewalk1OffsetX = 0;
    townSidewalk2OffsetX = 0;
    townCeilingOffsetX = 0;
}

const scrollFloorOneTileRight = () => {
    townSidewalk1OffsetX = (townSidewalk1OffsetX - TILE_WIDTH + VIEW_WIDTH) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX - TILE_WIDTH*2 + VIEW_WIDTH) % VIEW_WIDTH;
};

const scrollFloorOneTileLeft = () => {
    townSidewalk1OffsetX = (townSidewalk1OffsetX + TILE_WIDTH) % VIEW_WIDTH;
    townSidewalk2OffsetX = (townSidewalk2OffsetX + TILE_WIDTH*2) % VIEW_WIDTH;
};

const scrollCeilingHalfTileRight = () => {
    townCeilingOffsetX = (townCeilingOffsetX - TILE_WIDTH/2 + VIEW_WIDTH) % VIEW_WIDTH;
};

const scrollCeilingHalfTileLeft = () => {
    townCeilingOffsetX = (townCeilingOffsetX + TILE_WIDTH/2) % VIEW_WIDTH;
};

// ─── Town drawing functions ───────────────────────────────────────────────────
function drawTownBackground() {
    if (!townBackgroundReady) return false;
    ctx.drawImage(townBackground, 0, 0);
    return true;
}

function drawTownCeiling() {
    if (!townBackgroundType || !townCeilingReady || !townBackgroundReady) return false;
    ctx.drawImage(townBackground, 0, 0, canvas.width, TILE_HEIGHT*2, 0, 0, canvas.width, TILE_HEIGHT*2);
    const rightPartWidth = canvas.width - townCeilingOffsetX;
    if (rightPartWidth > 0) {
        ctx.drawImage(townCeiling, townCeilingOffsetX, 0, rightPartWidth, TILE_HEIGHT*2,
                      0, 0, rightPartWidth, TILE_HEIGHT*2);
    }
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
    const leftPartWidth2 = townSidewalk2OffsetX;
    if (leftPartWidth2 > 0) {
        ctx.drawImage(townSidewalk2, 0, 0, leftPartWidth2, TILE_HEIGHT,
                      rightPartWidth2, y, leftPartWidth2, TILE_HEIGHT);
    }
    return true;
}

// some tiles in the towns are animated (like waving flags etc.)
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

function drawTownTiles() {
    if (!mdtData || !townTileSheetReady) return false;
    const mapWidth = getTownMapWidth();
    if (!mapWidth) return false;
    
    const leftCol = Math.max(0, Math.min(
        mapWidth - VIEW_COLS,
        (readMemory(ADDR_PROXIMITY_MAP_LEFT_COL, 1)[0] ?? 0) + TOWN_VISIBLE_COL_OFFSET
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
                townTileSheet,
                sx, sy, TILE_WIDTH, TILE_HEIGHT,
                col * TILE_WIDTH, (row + TOWN_MAP_START_ROW) * TILE_HEIGHT,
                TILE_WIDTH, TILE_HEIGHT
            );
        }
    }
    return true;
}

function drawTownHero() {
    if (!heroSpriteReady || !engineReady) return;
    readMemory(0xFF33, 1)[0];
    const heroAnim = readMemory(0x00E7, 1)[0];
    const facing   = readMemory(0x00C2, 1)[0] & 1;
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
    const viewportX = readMemory(0x0083, 1)[0];
    const dx = viewportX * TILE_WIDTH;
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
        const screenX   = screenCol * TILE_WIDTH;
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
    const dx = vpX * TILE_WIDTH;
    const dy = vpY * TILE_HEIGHT;
    if (tileId === 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(dx, dy, TILE_WIDTH, TILE_HEIGHT);
        return;
    }
    const mppCols = Math.floor(dungeonTileSheet.width / TILE_WIDTH);
    const mppTiles = mppCols * Math.floor(dungeonTileSheet.height / TILE_HEIGHT);
    if (tileId >= 1 && tileId <= mppTiles) {
        drawSheetFrame(dungeonTileSheet, tileId - 1, TILE_WIDTH, TILE_HEIGHT, mppCols, dx, dy);
    } else if (tileId >= 0x40 && dungeonDchrSheetReady) {
        const dchrCols = Math.floor(dungeonDchrSheet.width / TILE_WIDTH);
        const dchrTiles = dchrCols * Math.floor(dungeonDchrSheet.height / TILE_HEIGHT);
        if (tileId - 0x40 < dchrTiles) {
            drawSheetFrame(dungeonDchrSheet, tileId - 0x40, TILE_WIDTH, TILE_HEIGHT, dchrCols, dx, dy);
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

function readU8(addr) {
    return readMemory?.(addr, 1)?.[0] ?? 0;
}

function readU16(addr) {
    const mBytes = readMemory(addr, 2);
    return mBytes[0] | (mBytes[1] << 8);
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

    const scale = TILE_WIDTH / 8; // 3 for 24px tiles
    let ptr = ADDR_BOSS_EXPLOSIONS_LIST;

    for (;;) {
      const x = readU8(ptr);
      if (x === 0xFF) break;

      const y = readU8(ptr + 1);
      const life = readU8(ptr + 2);
      const variant = readU8(ptr + 3);

      const phase = life & 3;
      const ring = _getExplosionRingCanvas(variant, phase, scale);
      ctx.drawImage(ring, x * TILE_WIDTH, y * TILE_HEIGHT);

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
    const cols = Math.floor(dungeonTileSheet.width / TILE_WIDTH);
    let p = ADDR_PROJECTILES_LIST;
    for (;;) {
        const p_x_rel = readMemory(p, 1)[0];
        if (p_x_rel === 0xFF) break;
        const vpX = p_x_rel - DUNGEON_VIEW_LEFT_IN_PROX;
        if (vpX < 0 || vpX >= VIEW_COLS) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const p_y_rel = readMemory(p + 1, 1)[0];
        const vpY = (p_y_rel - top) & 0x3F;
        if (vpY >= VIEW_ROWS) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const typeId = readMemory(p + 2, 1)[0];
        const stepCount = readMemory(p + 3, 1)[0];
        if (typeId >= dungeonProjectiles.length) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const tiles = dungeonProjectiles[typeId];
        if (!tiles || tiles.length === 0) { p += PROJECTILE_STRUCT_SIZE; continue; }
        const tileId = tiles[stepCount % tiles.length];
        const dx = vpX * TILE_WIDTH;
        const dy = vpY * TILE_HEIGHT;
        drawSheetFrame(dungeonTileSheet, tileId - 1, TILE_WIDTH, TILE_HEIGHT, cols, dx, dy);
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

    for (let outer = 0; outer < 4; outer++) {
        const addr = ADDR_MAGIC_PROJECTILES + outer * MAGIC_PROJECTILE_STRIDE;
        const xRel = readU16(addr);
        if (xRel === 0xFFFF) return;
        if ((xRel >> 8) === 0xFF) continue;

        const yRel = readU8(addr + 2);
        const mpDir = readU8(addr + 3);
        const lifeTimer = readU8(addr + 4);
        const animFrame = readU8(addr + 5);
        if (lifeTimer === 0) continue;

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
                srcX0 + (sub & 1) * TILE_WIDTH,
                (sub >> 1) * TILE_HEIGHT,
                TILE_WIDTH, TILE_HEIGHT,
                sx * TILE_WIDTH, sy * TILE_HEIGHT,
                TILE_WIDTH, TILE_HEIGHT,
            );
        }
    }
}

let _guerraEffectRunning = false;

async function renderViewportBorderWalls() {
    const viewW = VIEW_COLS * TILE_WIDTH;
    const viewH = VIEW_ROWS * TILE_HEIGHT;
    const flashColor = 0x12;

    function waitFrame() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    function xorViewportFlash() {
        const img = ctx.getImageData(0, 0, viewW, viewH);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] ^= flashColor;
            d[i + 1] ^= flashColor;
            d[i + 2] ^= flashColor;
        }
        ctx.putImageData(img, 0, 0);
    }

    async function renderExpandingRing(inset, span, colorVal) {
        let left = heroX - inset;
        let top = heroY - inset;
        let right = heroX - inset + span;
        let bottom = heroY - inset + span;
        const cssColor = colorVal === 0 ? 'rgb(0,0,0)' : 'rgb(255,255,255)';

        for (let step = 0; step < 9; step++) {
            ctx.strokeStyle = cssColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(
                Math.max(0, left),
                Math.max(0, top),
                Math.min(viewW, right) - Math.max(0, left),
                Math.min(viewH, bottom) - Math.max(0, top),
            );
            left = Math.max(0, left - 12);
            top = Math.max(0, top - 12);
            right = Math.min(viewW, right + 12);
            bottom = Math.min(viewH, bottom + 12);
            if (step < 8) await waitFrame();
        }
    }

    const heroX = readU8(ADDR_HERO_X_VIEW) * TILE_WIDTH;
    const heroY = readU8(ADDR_HERO_HEAD_Y_VIEW) * TILE_HEIGHT;

    xorViewportFlash();

    const rings = [
        { inset: 1, span: 0x19 },
        { inset: 5, span: 0x21 },
        { inset: 9, span: 0x29 },
    ];

    for (const r of rings) await renderExpandingRing(r.inset, r.span, 54);
    for (const r of rings) await renderExpandingRing(r.inset, r.span, 0);

    xorViewportFlash();
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
    if (!readMemory || !writeMemory || lastAnimatedRenderCounter === renderCounter) return;
    lastAnimatedRenderCounter = renderCounter;

    const cavernLevel = readU8(ADDR_CAVERN_LEVEL);
    if (cavernLevel < 5 || cavernLevel > 8) return;

    const oddTick = (renderCounter & 1) !== 0;
    const viewportLeftTop = readU16(ADDR_VIEWPORT_LEFT_TOP);

    for (let row = 0; row < VIEW_ROWS; row++) {
        let addr = wrapProximityAddress(
            viewportLeftTop + row * PROX_COLS + DUNGEON_VIEW_LEFT_IN_PROX
        );
        for (let col = 0; col < VIEW_COLS; col++, addr = wrapProximityAddress(addr + 1)) {
            const tile = readU8(addr);
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

            writeMemory(addr, [nextTile]);
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
        const dir = readU8(ptr + 5) & 0x80 ? "right" : "left";
        const flags = readU8(ptr + 4) & 0x1F;
        const offset = readU8(ptr + 6) & 0x0F;

        currentEntityFlashFrames = _entityHitFlashTimers.get(id) || 0;
        if ((flags & 0x18) === 0 && (readU8(ptr + 5) & 0x20)) {
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

                const sourceX = tileX * TILE_WIDTH;
                const sourceY = tileY * TILE_HEIGHT;
                const dx = destX * TILE_WIDTH;
                const dy = destY * TILE_HEIGHT;
                ctx.drawImage(
                    dungeonEntitySheet,
                    sx + sourceX, sourceY, TILE_WIDTH, TILE_HEIGHT,
                    dx, dy, TILE_WIDTH, TILE_HEIGHT
                );
                if (tinted) {
                    ctx.drawImage(
                        _tintCanvas,
                        sourceX, sourceY, TILE_WIDTH, TILE_HEIGHT,
                        dx, dy, TILE_WIDTH, TILE_HEIGHT
                    );
                }
            }
        }
    }

    const viewportLeftTop = readU16(ADDR_VIEWPORT_LEFT_TOP);

    // Include the invisible row and left edge so partially visible sprites
    // are naturally clipped by the canvas, matching the assembly helpers.
    for (let row = -1; row < VIEW_ROWS; row++) {
        let si = wrapProximityAddress(viewportLeftTop + row * PROX_COLS + 3);
        for (let col = -1; col < VIEW_COLS; col++, si = wrapProximityAddress(si + 1)) {
            const entityId = readU8(si);
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
    const shieldType = readMemory?.(ADDR_SHIELD_TYPE, 1)?.[0] ?? 0;
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
        const data = readMemory(base, 7);
        if (data[0] === 0xFF) continue;
        if (data[2] === 0) continue;
        const sx = data[5];
        const sy = data[6] & 0x3F;
        if (sy >= 19) continue; // outside viewport
        drawSheetFrame(dungeonDchrSheet, 0x26, TILE_WIDTH, TILE_HEIGHT, 39, (sx - 4) * TILE_WIDTH, sy * TILE_HEIGHT);
    }
}

function drawDungeonHero() {
    if (!dungeonHeroSheetReady || !engineReady || !readMemory) return;
    if (readMemory(ADDR_HERO_SPRITE_HIDDEN, 1)[0]) return;
    const x0 = readMemory(ADDR_HERO_X_VIEW, 1)[0];
    const y0 = readMemory(ADDR_HERO_HEAD_Y_VIEW, 1)[0];
    const dx = x0 * TILE_WIDTH;
    const dy = y0 * TILE_HEIGHT;
    const state = getDungeonHeroState();
    const armDy = state.squat ? dy + TILE_HEIGHT : dy;
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
    const swingFlag = readMemory(ADDR_SWORD_SWING_FLAG, 1)[0];
    if (!swingFlag) {
        drawDungeonSword._swingStart = 0;
        return;
    }

    let phase = readMemory(ADDR_SWORD_MOVEMENT_PHASE, 1)[0];
    const hitType = readMemory(ADDR_SWORD_HIT_TYPE, 1)[0] || 0;
    const swordType = Math.max(1, Math.min(6, readMemory(ADDR_SWORD_TYPE, 1)[0] || 1));
    const facingLeft = (readMemory(ADDR_FACING, 1)[0] & 1) !== 0;

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

    let dx = readMemory(ADDR_HERO_X_VIEW, 1)[0] * TILE_WIDTH;
    let dy = readMemory(ADDR_HERO_HEAD_Y_VIEW, 1)[0] * TILE_HEIGHT;
    if (readMemory(ADDR_SQUAT_FLAG, 1)[0]) {
        dy += TILE_HEIGHT;
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
    dx += xOff * TILE_WIDTH;
    dy += yOff * TILE_HEIGHT;

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
    ctx.roundRect(x, y, w, h, TILE_WIDTH/3);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = TILE_WIDTH/6;
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
    const x = TILE_WIDTH;
    const y = TILE_HEIGHT * 2;
    const w = TILE_WIDTH * (VIEW_COLS - 2);
    const h = TILE_HEIGHT * 2;

    drawDungeonBox(x, y, w, h);
    ctx.save();
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + leftPad*(TILE_WIDTH/8), y + h / 2);
    ctx.restore();
}

function drawDungeonSign() {
    const flag = readU8(ADDR_CAVERN_SIGN_FLAG);
    if (!flag) return;

    const idx = readU8(ADDR_CAVERN_SIGN_IDX);
    const tablePtr = readU16(ADDR_CAVERN_SIGNS_INFO);
    const descPtr = readU16(tablePtr + idx * 2);

    // Descriptor: [top_margin-25] [box_height-2] then (x_delta, text... terminated by 0xFF) per line, '/' = newline
    const topY = readU8(descPtr) + TILE_HEIGHT + 3*(TILE_HEIGHT/8);
    const h = (readU8(descPtr + 1) + 2) * TILE_HEIGHT;

    const x = TILE_WIDTH * 5;
    const y = TILE_HEIGHT;
    const w = TILE_WIDTH * ((VIEW_COLS - 2*5));

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
                cy += (TILE_HEIGHT + TILE_HEIGHT/2);
                break; // will read xDelta in outer loop
            }
            if (ch === 0x5C) ch = 0x27;
            ctx.fillText(String.fromCharCode(ch), bx, cy);
            bx += TILE_WIDTH;
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
    const dy = 12 * TILE_HEIGHT;

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

// ─── Rokademo (Tear of Esmesanti collection demo) ─────────────────────────────
// Mirrors the original DMAN.GRP sequence: hero runs to the middle of the
// cavern, draws his sword in a salute, the Tear of Esmesanti bursts into
// sparkles that fly up to its slot on the mole_t.jpg strip above the canvas,
// then the hero sheaths his sword and runs off.
const DMAN_FRAME_W = 72;
const DMAN_FRAME_H = 72;
const DMAN_SHEET_COLS = 13;
const ROKADEMO_RUN_STEPS = 13;
const ROKADEMO_CENTER_DX = (VIEW_COLS * TILE_WIDTH - DMAN_FRAME_W) / 2;  // 300
const ROKADEMO_HERO_Y = 12 * TILE_HEIGHT;                                // 288
const ROKADEMO_TEAR_CENTER = { x: 336, y: 235 };

const ROKADEMO_TIMING = {
    runStepMs:     90,   // per run step (13 steps)
    standMs:       500,
    drawPhaseMs:   180,  // per draw-sword phase (5,6,7,8)
    saluteMs:      600,
    flashMs:       120,  // per small-sparkle frame
    burstMs:       260,  // per wide-sparkle burst frame
    flyTotalMs:    6200, // total flight time of the sparkle to the mole slot (~7s, like the original)
    flyFrameMs:    170,  // per alternating 2/3 sparkle frame during flight (orig: 2 steps = 169ms)
    pingEveryMs:   500,  // play "ping" roughly every half second of flight (orig: 6 steps ≈ 507ms)
    landBurstMs:   260,  // wide burst over the mole slot
    landFlashMs:   130,  // per fade sparkle over the placed tear
    sheathPhaseMs: 180,  // per sheathing phase (8,7,6,5)
    sheathPauseMs: 500,
    runoffStepMs:  90,   // per run-off step (13 steps)
};

const SWORD_VISIBLE_STATES = new Set([
    'salute', 'sparkleStart', 'sparkleBurst', 'sparkleFlash',
    'sparkleFly', 'sparkleLand', 'sparkleLandFlash',
]);

function rokademoSwordFrame(type) {
    if (type <= 3) return 10;   // small sword (training / wise man's / spirit)
    if (type <= 5) return 11;   // medium sword (knight's / illumination)
    return 12;                  // large sword (enchantment)
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

// Tear slots are the top-left corner of the tear on the mole strip; this returns
// the visual center so the flying sparkle lands on the placed tear. Coordinates
// must be integers — the Bresenham stepper only ever moves by ±1 per step.
// The mole strip sits ABOVE the canvas, so the resulting y is negative (the
// sparkle flies out of the canvas top toward the slot).
function rokademoSlotCenter(slot, isRed) {
    const w = isRed ? 31 : 19;
    const h = isRed ? 34 : 25;
    return {
        x: Math.round(slot.x + w / 2),
        y: Math.round(-MOLE_IMG_H + slot.y + h / 2),
    };
}

// The landing sparkle itself must be visible, so clamp the burst/flash center
// back inside the canvas (w/h are the sparkle's sprite dimensions).
function rokademoLandCenter(slotC, w, h) {
    return {
        x: Math.min(Math.max(slotC.x, w / 2), canvas.width - w / 2),
        y: Math.min(Math.max(slotC.y, h / 2), canvas.height - h / 2),
    };
}

function rokademoHeroDx(d) {
    const center = ROKADEMO_CENTER_DX;
    const s = Math.min(ROKADEMO_RUN_STEPS, d.step + 1);
    if (d.state === 'runoff') {
        const end = canvas.width - DMAN_FRAME_W;
        return Math.round(center + (end - center) * s / ROKADEMO_RUN_STEPS);
    }
    return Math.round(center * s / ROKADEMO_RUN_STEPS);
}

function rokademoSetState(d, state, now) {
    d.state = state;
    d.stateStart = now;
    d.step = 0;
}

function initBresenham(x0, y0, x1, y1) {
    return {
        x: x0, y: y0, x0, y0, x1, y1,
        dx: Math.abs(x1 - x0),
        dy: Math.abs(y1 - y0),
        sx: x0 < x1 ? 1 : -1,
        sy: y0 < y1 ? 1 : -1,
        err: Math.abs(x1 - x0) - Math.abs(y1 - y0),
    };
}

function stepBresenham(b) {
    const e2 = 2 * b.err;
    if (e2 > -b.dy) { b.err -= b.dy; b.x += b.sx; }
    if (e2 < b.dx)  { b.err += b.dx; b.y += b.sy; }
    return b.y <= 0;
}

function startRokademo() {
    const tearCount = Math.max(1, Math.min(getTearCount(), 9));
    rokademo = {
        tearCount,
        isRed: tearCount >= 9,
        slot: tearCount >= 9 ? TEAR_SLOT_RED : TEAR_SLOTS_BLUE[tearCount - 1],
        swordType: Math.max(1, Math.min(6, readU8(ADDR_SWORD_TYPE) || 1)),
        animPhase: 0,
        tearVisible: true,
        sparkleFrame: 0,
        burstFrame: 0,
        fly: null,
        done: false,
        lastStompStep: -1,
        lastPingStep: -1,
        state: 'run',
        stateStart: 0,
        step: 0,
    };
    // The new tear is already counted (roka_entrypoint incremented it), so the
    // overlay shows only the previously collected tears until the sparkle lands.
    setTearOverlayCount(tearCount - 1);
    rokademoSetState(rokademo, 'run', performance.now());
}

function updateRokademo(d, now) {
    const T = ROKADEMO_TIMING;
    const dt = now - d.stateStart;
    switch (d.state) {
        case 'run': {
            d.step = Math.min(ROKADEMO_RUN_STEPS, Math.floor(dt / T.runStepMs));
            d.animPhase = d.step & 3;
            if (d.step % 2 === 1 && d.lastStompStep !== d.step) {
                d.lastStompStep = d.step;
                soundManager.playSfx(26);
            }
            if (d.step >= ROKADEMO_RUN_STEPS) {
                rokademoSetState(d, 'stand', now);
                d.animPhase = 4;
            }
            break;
        }
        case 'stand':
            d.animPhase = 4;
            if (dt >= T.standMs) {
                rokademoSetState(d, 'draw', now);
                d.animPhase = 5;
            }
            break;
        case 'draw': {
            const i = Math.min(4, Math.floor(dt / T.drawPhaseMs));
            d.animPhase = 5 + i;
            if (dt >= 4 * T.drawPhaseMs) {
                rokademoSetState(d, 'salute', now);
                d.animPhase = 9;
            }
            break;
        }
        case 'salute':
            d.animPhase = 9;
            if (dt >= T.saluteMs) {
                rokademoSetState(d, 'sparkleStart', now);
                d.sparkleFrame = 0;
            }
            break;
        case 'sparkleStart':
            d.animPhase = 9;
            d.sparkleFrame = Math.min(1, Math.floor(dt / T.flashMs));
            if (dt >= 2 * T.flashMs) {
                rokademoSetState(d, 'sparkleBurst', now);
                d.burstFrame = 0;
                soundManager.playSfx(27);
            }
            break;
        case 'sparkleBurst':
            d.animPhase = 9;
            d.burstFrame = Math.min(1, Math.floor(dt / T.burstMs));
            if (dt >= 2 * T.burstMs) {
                d.tearVisible = false;   // the tear bursts and flies to the mole
                rokademoSetState(d, 'sparkleFlash', now);
                d.sparkleFrame = 0;
            }
            break;
        case 'sparkleFlash':
            d.animPhase = 9;
            d.sparkleFrame = Math.min(3, Math.floor(dt / T.flashMs));
            if (dt >= 4 * T.flashMs) {
                rokademoSetState(d, 'sparkleFly', now);
                const c = rokademoSlotCenter(d.slot, d.isRed);
                d.fly = initBresenham(
                    ROKADEMO_TEAR_CENTER.x, ROKADEMO_TEAR_CENTER.y,
                    c.x, c.y
                );
            }
            break;
        case 'sparkleFly': {
            d.animPhase = 9;
            if (d.fly) {
                // The flight is time-based, not framerate-bound: the sparkle
                // travels the whole path in flyTotalMs regardless of refresh
                // rate (the original waits ~84.5ms per step on a 236.7Hz timer).
                const totalSteps = Math.max(
                    Math.abs(d.fly.x1 - d.fly.x0),
                    Math.abs(d.fly.y1 - d.fly.y0)
                );
                const targetStep = Math.min(totalSteps,
                    Math.floor(dt / T.flyTotalMs * totalSteps));
                while (d.step < targetStep) {
                    d.step++;
                    if (stepBresenham(d.fly)) {
                        rokademoSetState(d, 'sparkleLand', now);
                        d.burstFrame = 0;
                        soundManager.playSfx(27);
                        break;
                    }
                }
                // Alternating 2/3 sparkle frame, ~170ms each like the original.
                d.sparkleFrame = 2 + ((Math.floor(dt / T.flyFrameMs)) & 1);
                // "ping" roughly every half second of flight, like the original.
                const pings = Math.floor(dt / T.pingEveryMs);
                if (pings > d.lastPingStep) {
                    d.lastPingStep = pings;
                    soundManager.playSfx(28);
                }
            } else {
                rokademoSetState(d, 'sparkleLand', now);
                d.burstFrame = 0;
            }
            break;
        }
        case 'sparkleLand':
            d.animPhase = 9;
            d.burstFrame = Math.min(1, Math.floor(dt / T.landBurstMs));
            if (dt >= 2 * T.landBurstMs) {
                setTearOverlayCount(d.tearCount);   // the tear appears in its mole slot
                rokademoSetState(d, 'sparkleLandFlash', now);
                d.sparkleFrame = 4;
            }
            break;
        case 'sparkleLandFlash': {
            d.animPhase = 9;
            d.sparkleFrame = Math.max(0, 4 - Math.floor(dt / T.landFlashMs));
            if (dt >= 4 * T.landFlashMs) {
                rokademoSetState(d, 'sheath', now);
            }
            break;
        }
        case 'sheath': {
            const i = Math.min(4, Math.floor(dt / T.sheathPhaseMs));
            d.animPhase = 9 - i;   // 9,8,7,6,5
            if (dt >= 4 * T.sheathPhaseMs + T.sheathPauseMs) {
                rokademoSetState(d, 'runoff', now);
            }
            break;
        }
        case 'runoff':
            d.step = Math.min(ROKADEMO_RUN_STEPS, Math.floor(dt / T.runoffStepMs));
            d.animPhase = d.step & 3;
            if (d.step % 2 === 1 && d.lastStompStep !== d.step) {
                d.lastStompStep = d.step;
                soundManager.playSfx(26);
            }
            if (d.step >= ROKADEMO_RUN_STEPS) {
                d.done = true;
            }
            break;
    }
}

function finishRokademoDemo(now) {
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
            finishRokademoDemo(now);
            return;   // final frame (hero at right edge) was already drawn
        }
        startRokademo();
        if (!rokademo) return;
    }

    const d = rokademo;
    updateRokademo(d, now);
    const doneNow = d.done;
    const heroDx = (d.state === 'run' || d.state === 'runoff') ? rokademoHeroDx(d) : ROKADEMO_CENTER_DX;
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
        const burstC = rokademoLandCenter(slotC, 192, 48);
        drawWideSparkle(d.burstFrame, burstC.x, burstC.y-24); // we show half-height of final big sparkle
    } else if (d.state === 'sparkleLandFlash') {
        const flashC = rokademoLandCenter(slotC, 48, 48);
        drawSmallSparkle(d.sparkleFrame, flashC.x, flashC.y-24);
    }

    if (doneNow) {
        finishRokademoDemo(now);
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
    const y = 3 * TILE_HEIGHT;
    ctx.drawImage(encounterImg, x, y, 622, 192);
    ctx.restore();
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
            writeMemory(ADDR_BOSS_STATE_BLOCK, [
                bossState.bossX & 0xFF, (bossState.bossX >> 8) & 0xFF,            // +0
                bossState.bossY,                                                  // +2
                bossState.bossHP & 0xFF, (bossState.bossHP >> 8) & 0xFF,          // +3
                bossState.xpReward & 0xFF, (bossState.xpReward >> 8) & 0xFF,      // +5
                bossState.arenaCenterX,                                           // +7
                bossState.bossPlacement,                                          // +8
                bossState.almasReward & 0xFF, (bossState.almasReward >> 8) & 0xFF,// +9
            ]);
            const encoder = new TextEncoder();
            const bytes = encoder.encode(bossState.bossName);
            const pascal = new Uint8Array(1 + bytes.length);
            pascal[0] = bytes.length;
            pascal.set(bytes, 1);
            writeMemory(ADDR_BOSS_STATE_BLOCK + 11, pascal);                      // +11

            writeMemory(ADDR_BOSS_STATE_PTR, [
                ADDR_BOSS_STATE_BLOCK & 0xFF, (ADDR_BOSS_STATE_BLOCK >> 8) & 0xFF,
            ]);
        }
        // set sword reachability list
        const swordType = readMemory(ADDR_SWORD_TYPE, 1)[0];
        if (swordType <= 3) {
            setDungeonSwordReach(SWORD_REACH_SMALL);
        } else if (swordType <= 5) {
            setDungeonSwordReach(SWORD_REACH_MEDIUM);
        } else {
            setDungeonSwordReach(SWORD_REACH_LARGE);
        }
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

        const mapWidth = getTownMapWidth();
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
        if (isDeath) {
            startIndoorScene(2);
        }
    } catch (err) {
        console.error('[handleDungeonExit] failed:', err);
    } finally {
        dungeonExitInProgress = false;
        engineReady = true;
    }
}

function resolveMusicTrack(type) {
    const map = { 
        0: 'mgt1', 
        1: 'ugm1', 
        2: 'mgt2', 
        3: 'ugm2',
        4: 'Zeliard-04-CavernOfMalicia',
        5: 'Zeliard-08-CavernOfPeligro',
        6: 'Zeliard-10-CavernOfMadera',
        7: 'Zeliard-11-CavernOfEscarcha',
        8: 'Zeliard-09-CavernOfCorroer',
        9: 'Zeliard-13-CavernOfTesoro',
        10: 'Zeliard-12-CavernOfCaliente',
        11: 'Zeliard-14-CavernOfAbsor',
    };
    return map[type] ?? 'mgt1';
}

function computeTownScrollFromAbsoluteX(heroProxX, mapWidth) {
    // Edge locking logic from fight.asm (edge_locking_scrolling_window)
    let heroViewX = 13;
    let proxLeft = 0;

    if (heroProxX > mapWidth - 13)
    {
        // ── Right-edge lock ──────────────────────────────────────────────
        // Hero is within 13 columns of the right edge; freeze the viewport
        // so the map's rightmost column stays visible.
        const  carry = (mapWidth >= PROX_COLS) ? 1 : 0;
        const left_col = mapWidth - PROX_COLS;

        proxLeft = left_col;
        heroViewX = (heroProxX - left_col - carry) - 3;
    }
    else
    {
        // Subtract 17; the result wraps to a large uint16 when hero_x < 17,
        // which is exactly what `or ah, ah / jnz` detected in the original.
        const ax = (heroProxX + 65536 - 17) & 0xFFFF;

        if (ax > 255)
        {
            // ── Left-edge lock ───────────────────────────────────────────
            // Hero is within 17 columns of the left edge (or hero_x wrapped
            // past 272, which shouldn't occur in practice).
            // Freeze the viewport at column 0; hero sits 4 tiles from left.
            proxLeft = 0;
            heroViewX = heroProxX - 4;
        }
        else
        {
            // ── Middle (free scrolling) ──────────────────────────────────
            // Hero is far enough from both edges; scroll the map so the hero
            // always appears at viewport column 13 (bx=13 was set at entry).
            proxLeft = ax;   // hero_x_in_proximity_map - 17
            heroViewX = 13;
        }
    }
    return { proxLeft, heroViewX };
}

function getTownMapWidth() {
    if (!mdtData || mdtData.length < 4) return 0;
    return mdtData[2] | (mdtData[3] << 8);
}

// ─── Conversation (NPC dialog) ────────────────────────────────────────────────
let lastSpace = false;
let lastAlt = false;

function updateInputLatches() {
    const currentSpace = keys.Space;
    const currentAlt = keys.Alt;
    if (currentSpace && !lastSpace) writeMemory(0xFF1D, [1]);
    if (currentAlt && !lastAlt) writeMemory(0xFF1E, [1]);
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

const CHAR_WIDTH_TABLE = [
    5,4,4,4,6,8,5,3,4,4,6,6,6,5,6,8,7,5,7,7,7,7,7,7,7,7,3,4,6,6,6,7,
    8,8,8,8,8,8,8,8,8,5,8,8,8,8,8,8,8,8,8,8,7,8,8,8,8,8,7,5,3,5,6,7,
    7,8,8,7,8,7,7,8,8,5,6,8,5,8,7,7,8,8,8,7,6,8,8,8,7,7,7,4,8,4,7,8,
];
const ORIG_MAX_LINE_PX = 256;
const TEXT_AREA_WIDTH = 624; // DIALOG_MAX_WIDTH - 2*DIALOG_PADDING_X
const WIDTH_SCALE = TEXT_AREA_WIDTH / ORIG_MAX_LINE_PX;
const DIALOG_FONT_SIZE = 18;
const DIALOG_LINES_PER_PAGE = 15;
const DIALOG_PADDING_X = 10;
const DIALOG_MAX_WIDTH = VIEW_WIDTH - 24;
const TOWN_HEADS_ROW = TOWN_MAP_START_ROW + 5;
const DIALOG_BOTTOM_Y = TOWN_HEADS_ROW * TILE_HEIGHT - 4;
const TEXT_FIRST_BASELINE = 32;
const TEXT_LINE_HEIGHT = 24;
const TEXT_BOTTOM_PAD = 20;

function charOrigWidth(ch) {
    const idx = ch.charCodeAt(0) - 0x20;
    if (idx < 0 || idx >= CHAR_WIDTH_TABLE.length) return 6;
    return CHAR_WIDTH_TABLE[idx];
}

function parseDialogText(bytes) {
    const pages = [];
    let lines  = [''];
    let lineW  = 0;
    let hasYesNo = false;
    const MAX_W = ORIG_MAX_LINE_PX;
    const pushLine = () => {
        lines.push('');
        lineW = 0;
        if (lines.length - 1 === DIALOG_LINES_PER_PAGE) {
            const trimmed = lines.slice(0, DIALOG_LINES_PER_PAGE);
            pages.push(trimmed);
            lines = [''];
        }
    };
    for (let i = 0; i < bytes.length; i++) {
        let b = bytes[i];
        if (b === 0xFF || b === 0x00) break;
        if (b === 0x81) { hasYesNo = true; break; }
        if (b >= 0x82) break;
        if (b === 0x2F) { pushLine(); continue; }
        if (b === 0x5c) b = 0x27;
        if (b === 0x26) b = 0x20;
        if (b < 0x20) continue;
        const ch = String.fromCharCode(b);
        const cw = charOrigWidth(ch);
        if (b === 0x20) {
            let nextW = 0;
            for (let j = i + 1; j < bytes.length; j++) {
                const nb = bytes[j];
                if (nb === 0x20 || nb === 0x2F || (nb >= 0x80 && nb !== 0x81)) break;
                if (nb >= 0x20) nextW += charOrigWidth(String.fromCharCode(nb));
            }
            if (lineW + cw + nextW >= MAX_W) {
                pushLine();
                continue;
            }
        }
        lines[lines.length - 1] += ch;
        lineW += cw;
    }
    const nonEmpty = lines.filter(l => l.length > 0);
    if (nonEmpty.length > 0) pages.push(nonEmpty);
    return { pages, hasYesNo };
}

function computeBoxGeometry(facingLeft, extraLines = 0) {
    const page = conversation.pages[conversation.page] ?? [];
    const nLines = Math.max(page.length, 1) + extraLines;
    const bh = TEXT_FIRST_BASELINE + (nLines - 1) * TEXT_LINE_HEIGHT + TEXT_BOTTOM_PAD;
    ctx.save();
    ctx.font = `${DIALOG_FONT_SIZE + 2}px 'Courier New', monospace`;
    let maxW = 0;
    for (const line of page) {
        const w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
    }
    ctx.restore();
    const bw = Math.min(Math.max(maxW + 2 * DIALOG_PADDING_X + 16, 160), DIALOG_MAX_WIDTH);
    let bx = facingLeft ? VIEW_WIDTH - bw - 12 : 12;
    const by = DIALOG_BOTTOM_Y - bh;
    conversation.boxX = bx;
    conversation.boxY = Math.max(by, 4);
    conversation.boxW = bw;
    conversation.boxH = bh;
}

function drawConversationDialog() {
    if (!conversation.active || !conversation.pages.length) return;
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
    if (conversation.yesNoMode) {
        const options = ['Yes', 'No'];
        const baseY = y + TEXT_FIRST_BASELINE + pageLines.length * TEXT_LINE_HEIGHT + 8;
        for (let i = 0; i < options.length; i++) {
            const cy = baseY + i * TEXT_LINE_HEIGHT;
            ctx.fillStyle = i === conversation.yesNoCursor ? '#ffcc00' : '#ccc';
            ctx.fillText(options[i], x + 32, cy);
        }
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('►', x + 12, baseY + conversation.yesNoCursor * TEXT_LINE_HEIGHT);
    } else if (conversation.page < totalPages - 1) {
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('▼', x + width - 24, y + height - 12);
    }
}

function startConversationFromWasm() {
    const npcAddrBytes = readMemory(0xFFF6, 2);
    const npcAddr = npcAddrBytes[0] | (npcAddrBytes[1] << 8);
    let npcId = 0;
    if (npcAddr) {
        npcId = readMemory(npcAddr + 7, 1)[0];
    }
    const rawText = getNpcConversationRaw(npcId);
    let parsed = parseDialogText(rawText);
    if (parsed.pages.length === 0) {
        townFinishConversation?.();
        return;
    }
    const heroCrest = readMemory(0x9C, 1)[0];
    if (heroCrest && parsed.hasYesNo) {
        const crestText = getNpcConversationRaw(14);
        if (crestText) {
            parsed = parseDialogText(crestText);
            if (parsed.pages.length === 0) {
                townFinishConversation?.();
                return;
            }
        }
    }
    const facingLeft = npcAddr ? (readMemory(npcAddr + 2, 1)[0] & 0x80) : false;
    conversation.active = true;
    conversation.pages = parsed.pages;
    conversation.page = 0;
    conversation.hasYesNo = parsed.hasYesNo;
    conversation.yesNoMode = false;
    conversation.yesNoCursor = 0;
    conversation.facingLeft = facingLeft;
    conversation.savedBackground = null;
    computeBoxGeometry(facingLeft);
}

// ─── Indoor scene entry / exit ────────────────────────────────────────────────
function checkBuildingRequest() {
    if (!engineReady || !readMemory || indoorActiveScene) return;
    const active = readMemory(ADDR_BUILDING_ACTIVE, 1)[0];
    if (!active) return;
    const destId = readMemory(ADDR_BUILDING_DEST_ID, 1)[0];
    startIndoorScene(destId);
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
        lastSpace = false;
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
    };

    const building = TOWN_DOORS[destId];
    if (building) {
        indoorActiveScene = new building.scene(context);
        indoorActiveScene.building = building;
        indoorActiveScene.enter(performance.now());
    }
}

// ─── UI helpers (gold, sword, shield, magic) ──────────────────────────────────
function updateElementText(elementId, value) {
    const el = document.getElementById(elementId);
    if (el && value !== undefined) el.textContent = value;
}

function resetBossHud() {
    if (writeMemory) writeMemory(ADDR_BOSS_MODE, [0]);
    const bossLifeBar = document.getElementById('bossLifeBarContainer');
    if (bossLifeBar) bossLifeBar.classList.add('hidden');
    const placeName = document.getElementById('currentMapName');
    if (placeName) placeName.style.display = '';
    const placeLabel = document.getElementById('placeLabel');
    if (placeLabel) placeLabel.textContent = 'PLACE';
    const goldLabel = document.getElementById('goldLabel');
    if (goldLabel) { goldLabel.textContent = 'GOLD'; goldLabel.style.display = ''; }
    const goldValue = document.getElementById('gold');
    if (goldValue) goldValue.style.display = '';
}

function updatePlaceHud(name, indoor = false) {
    const placeRow = document.querySelector('.place-row');
    const placeLabel = document.getElementById('placeLabel');
    if (placeRow) placeRow.classList.toggle('indoor-place', indoor);
    if (placeLabel) placeLabel.textContent = indoor ? '' : 'PLACE';
    updateElementText('currentMapName', name);
}

function getHeroHp() {
    if (!readMemory) return 0;
    const hpBytes = readMemory(ADDR_HERO_HP, 2);
    return (hpBytes[0] | (hpBytes[1] << 8));
}

function setHeroHp(hp) {
    if (!writeMemory) return;
    const clamped = Math.max(0, Math.min(0xFFFF, hp));
    writeMemory(ADDR_HERO_HP, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
}

function getHeroMaxHp() {
    if (!readMemory) return 0;
    const hpBytes = readMemory(ADDR_HERO_MAX_HP, 2);
    return (hpBytes[0] | (hpBytes[1] << 8));
}

function setHeroMaxHp(maxHp) {
    if (!writeMemory) return;
    const clamped = Math.max(0, Math.min(0xFFFF, maxHp));
    writeMemory(ADDR_HERO_MAX_HP, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
}

let lifeFillCurrentEl = null;
let lifeFillMaxEl     = null;

function drawLifeBar() {
    if (!lifeFillCurrentEl) {
        lifeFillCurrentEl = document.querySelector('.life-fill-current');
        lifeFillMaxEl     = document.querySelector('.life-fill-max');
    }
    setLife(getHeroHp(), getHeroMaxHp());
}

// Max possible HP is 800 (which corresponds to 100% of the bar)
function setLife(currentLife, maxLife) {
    if (lifeFillCurrentEl && lifeFillMaxEl) {
        lifeFillMaxEl.style.width     = (maxLife/8)     + '%';
        lifeFillCurrentEl.style.width = (currentLife/8) + '%';
    }
}

let bossLifeFillCurrentEl = null;
let bossLifeFillMaxEl     = null;
let bossMaxHP = null;

function drawBossHealth() {
    if (!bossLifeFillCurrentEl) {
        const container = document.getElementById('bossLifeBarContainer');
        bossLifeFillCurrentEl = container.querySelector('.life-fill-current');
        bossLifeFillMaxEl     = container.querySelector('.life-fill-max');
    }

    const bossStatePtr = readU16(ADDR_BOSS_STATE_PTR);
    const currHp = readU16(bossStatePtr + 3);
    if (!bossMaxHP) {
        bossMaxHP = currHp;
    }
    if (bossLifeFillCurrentEl && bossLifeFillMaxEl) {
        bossLifeFillCurrentEl.style.width = (currHp/8) + '%';
        bossLifeFillMaxEl.style.width     = (bossMaxHP/8) + '%';
    }
}

function renderBossName() {
    const name =  getBossName();
    const label = document.getElementById('goldLabel');
    const value = document.getElementById('gold');
    if (label) label.textContent = '';
    if (value) value.textContent = name;
}

export function saveGame(saveData, saveKey = 'zeliard_save_01') {
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

export function loadGame(saveKey = 'zeliard_save_01') {
    const base64 = localStorage.getItem(saveKey);
    if (!base64) return null;
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        if (bytes.length !== 256) return null;
        console.log('Game loaded.');
        return bytes;
    } catch (err) {
        console.error('loadGame: failed to decode save data', err);
        return null;
    }
}

function getHeroGoldValue() {
    if (!readMemory) return 0;
    const goldBytes = readMemory(ADDR_HERO_GOLD_LO, 2);
    const goldLo = goldBytes[0] | (goldBytes[1] << 8);
    const goldHi = readMemory(ADDR_HERO_GOLD_HI, 1)[0];
    return goldLo + goldHi * 0x10000;
}

function setHeroGoldValue(value) {
    if (!writeMemory) return;
    const clamped = Math.max(0, Math.min(0xFFFFFF, value));
    writeMemory(ADDR_HERO_GOLD_LO, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
    writeMemory(ADDR_HERO_GOLD_HI, [(clamped >> 16) & 0xFF]);
}

function renderGoldHud() {
    updateElementText('gold', getHeroGoldValue());
}

function getHeroAlmasValue() {
    if (!readMemory) return 0;
    const almasBytes = readMemory(ADDR_HERO_ALMAS, 2);
    const almas = almasBytes[0] | (almasBytes[1] << 8);
    return almas;
}

function setHeroAlmasValue(value) {
    if (!writeMemory) return;
    const clamped = Math.max(0, Math.min(0xFFFF, value));
    writeMemory(ADDR_HERO_ALMAS, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
}

function renderAlmasHud() {
    updateElementText('almas', getHeroAlmasValue());
}

async function loadSwordIcons() {
    if (swordIconsReady) return Promise.resolve(swordIcons);
    const loads = ITEMP_SWORD_IMAGE_PATHS.map((path, index) => {
        if (!path) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => { swordIcons[index] = img; return img; });
    });
    await Promise.all(loads);
    swordIconsReady = true;
    return swordIcons;
}

function getHeroSwordType() {
    if (!readMemory) return 0;
    return readMemory(ADDR_SWORD_TYPE, 1)[0];
}

function setHeroSwordType(type) {
    if (!writeMemory) return;
    writeMemory(ADDR_SWORD_TYPE, [type]);
}

function renderSwordHud() {
    const type = getHeroSwordType() - 1;
    const icon = document.getElementById("activeSwordIcon");
    icon.src = type >= 0 && swordIcons[type] ? swordIcons[type].src : "";
}

async function loadShieldIcons() {
    if (shieldIconsReady) return Promise.resolve(shieldIcons);
    const loads = ITEMP_SHIELD_IMAGE_PATHS.map((path, index) => {
        if (!path) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => { shieldIcons[index] = img; return img; });
    });
    await Promise.all(loads);
    shieldIconsReady = true;
    return shieldIcons;
}

function getHeroShieldType() {
    if (!readMemory) return 0;
    return readMemory(ADDR_SHIELD_TYPE, 1)[0];
}

function setHeroShieldType(type) {
    if (!writeMemory) return;
    writeMemory(ADDR_SHIELD_TYPE, [type]);
}

function getHeroShieldHP() {
    if (!readMemory) return 0;
    const hpBytes = readMemory(ADDR_SHIELD_HP, 2);
    return hpBytes[0] | (hpBytes[1] << 8);
}

function setHeroShieldHP(hp) {
    if (!writeMemory) return;
    writeMemory(ADDR_SHIELD_HP, [hp & 0xff, (hp >> 8) & 0xff]);
}

function renderShieldHud() {
    const type = getHeroShieldType() - 1;
    const icon = document.getElementById("activeShieldIcon");
    icon.src = type >= 0 && shieldIcons[type] ? shieldIcons[type].src : "";
    updateElementText('shieldHp', type >= 0 ? getHeroShieldHP() : '');
}

async function loadMagicIcons() {
    if (magicIconsReady) return Promise.resolve(magicIcons);
    const loads = ITEMP_MAGIC_IMAGE_PATHS.map((path, index) => {
        if (!path) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${path}`));
            img.src = path;
        }).then(img => { magicIcons[index] = img; return img; });
    });
    await Promise.all(loads);
    magicIconsReady = true;
    return magicIcons;
}

function getHeroMagicType() {
    if (!readMemory) return 0;
    return readMemory(ADDR_CURR_SPELL_TYPE, 1)[0];
}

function setHeroMagicType(type) {
    if (!writeMemory) return;
    writeMemory(ADDR_CURR_SPELL_TYPE, [type]);
}

function getHeroMagicCount(type) {
    if (!readMemory) return 0;
    const idx = type - 1;
    if (idx < 0 || idx >= ADDR_SPELL_COUNTS.length) return 0;
    return readMemory(ADDR_SPELL_COUNTS[idx], 1)[0];
}

function setHeroMagicCount(type, count) {
    if (!writeMemory) return;
    const idx = type - 1;
    if (idx < 0 || idx >= ADDR_SPELL_COUNTS.length || count < 0 || count > 255) return;
    writeMemory(ADDR_SPELL_COUNTS[idx], [count]);
}

function renderMagicHud() {
    const type0 = getHeroMagicType() - 1;
    const icon = document.getElementById("activeSpellIcon");
    icon.src = type0 >= 0 && magicIcons[type0] ? magicIcons[type0].src : "";
    updateElementText('spellCounter', type0 >= 0 ? getHeroMagicCount(type0+1) : '');
}

// Open Save Modal (called from Sage scene)
function openSaveModal(onSaveComplete) {
    if (activeModal) return;
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
    activeModal = new SaveDialog(onSave, onCancel);
}

function openRestoreModal() {
    if (activeModal) return;
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
    activeModal = new RestoreDialog(onRestore, onCancel);
}

function closeModal() {
    activeModal = null;
    gamePaused = false;
}

// ─── Speed change dialog (F9) ──────────────────────────────────────────────

function startSpeedChange() {
    if (speedChange.active || activeModal || gamePaused || !engineReady) return;
    if (gameMode !== 'town' && gameMode !== 'dungeon') return;

    speedChange.active = true;
    speedChange.phase = 0;
    speedChange.digit = -1;
    gamePaused = true;
}

function getSpeedChangeBox() {
    const w = TILE_WIDTH * 22;
    const h = TILE_HEIGHT * 5;
    const x = (VIEW_WIDTH - w) / 2;
    const y = TILE_HEIGHT * 6;
    return { x, y, w, h };
}

function finishSpeedChange() {
    if (!speedChange.active) return;
    speedChange.active = false;
    speedChange.phase = 0;
    speedChange.digit = -1;
    gamePaused = false;
}

function cancelSpeedChange() {
    finishSpeedChange();
}

function drawSpeedChangeDialog() {
    if (!speedChange.active) return;

    const box = getSpeedChangeBox();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, TILE_WIDTH / 3);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = TILE_WIDTH / 6;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';

    const cx = box.x + TILE_WIDTH;
    const cy = box.y + TILE_HEIGHT * 0.5;

    ctx.fillStyle = '#fff';
    ctx.fillText('Speed change', cx, cy);

    const currentSpeed = 10 - (readMemory(ADDR_SPEED_CONST, 1)[0] || 5);
     // strlen of "Select 0-9:" is 11
    if (speedChange.phase === 0) {
        ctx.fillStyle = '#888';
        ctx.fillText('Select 0-9:', cx, cy + TILE_HEIGHT * 1.5);
        ctx.fillText(String(currentSpeed), cx + TILE_WIDTH * 11, cy + TILE_HEIGHT * 1.5);
    } else if (speedChange.phase === 1) {
        ctx.fillStyle = '#fff';
        ctx.fillText('Select 0-9:', cx, cy + TILE_HEIGHT * 1.5);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('_', cx + TILE_WIDTH * 11, cy + TILE_HEIGHT * 1.5);
    } else {
        ctx.fillStyle = '#fff';
        ctx.fillText('Select 0-9:', cx, cy + TILE_HEIGHT * 1.5);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(String(speedChange.digit), cx + TILE_WIDTH * 11, cy + TILE_HEIGHT * 1.5);
        ctx.fillStyle = '#888';
        ctx.fillText('(press any key)', cx, cy + TILE_HEIGHT * 3);
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
let fps = 0;
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
        } else if (rokademoHold) {
            // Post-demo hold: keep the roka backdrop until the transition set up
            // by wasm_finish_rokademo_transition takes over.
            drawRokademoBackground();
            dungeonClearRenderRequest?.();
        } else {
            // Detect encounter animation start (BOSS_ENCOUNTER state)
            if (!encounterAnim && dungeonState === DUNGEON_STATE_BOSS_ENCOUNTER) {
                encounterAnim = {
                    startTime: performance.now(),
                    phase: 'flash',
                };
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
                drawDungeonEntities(); // monsters/items, in original row-major order
                drawDungeonHero(); // hero 3x3 tiles sprite
                drawDungeonMagiaStones(); // video effect of Magia Stone item
                drawDungeonProjectiles(); // monsters projectiles
                drawDungeonMagicProjectiles(); // hero magic spell projectiles
                drawDungeonSword(); // hero's sword 4x4 tiles sprite
                drawDungeonNotification(); // notification text boxes (pickup items etc)
                drawDungeonSign(); // text boxes when reading the signposts
                if (!_guerraEffectRunning && readU8(ADDR_BYTE_9EED) === 0xFF) {
                    writeMemory(ADDR_BYTE_9EED, [0]);
                    _guerraEffectRunning = true;
                    renderViewportBorderWalls().finally(() => { _guerraEffectRunning = false; });
                }

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
        const bossMode = readMemory(ADDR_BOSS_MODE, 1)[0];
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
            bossMaxHP = null;
            if (bossLifeBar) bossLifeBar.classList.add('hidden');
            if (placeName) placeName.style.display = '';
            if (placeLabel) placeLabel.textContent = 'PLACE';
            if (goldLabel) { goldLabel.textContent = 'GOLD'; goldLabel.style.display = ''; }
            if (goldValue) goldValue.style.display = '';
        }

        if (readMemory(ADDR_HEALTH_BAR_REQUEST, 1)[0]) {
            drawLifeBar();
            writeMemory(ADDR_HEALTH_BAR_REQUEST, [0]);
        }
        if (bossMode) {
            if (readMemory(ADDR_BOSS_HEALTH_REQUEST, 1)[0]) {
                drawBossHealth();
                renderBossName();
                writeMemory(ADDR_BOSS_HEALTH_REQUEST, [0]);
            }
        } else {
            if (readMemory(ADDR_GOLD_RENDER_REQUEST, 1)[0]) {
                renderGoldHud();
                writeMemory(ADDR_GOLD_RENDER_REQUEST, [0]);
            }
        }
        if (readMemory(ADDR_ALMAS_RENDER_REQUEST, 1)[0]) {
            renderAlmasHud();
            writeMemory(ADDR_ALMAS_RENDER_REQUEST, [0]);
        }
        if (readMemory(ADDR_SHIELD_HP_RENDER_REQUEST, 1)[0]) {
            renderShieldHud();
            writeMemory(ADDR_SHIELD_HP_RENDER_REQUEST, [0]);
        }
        if (readMemory(ADDR_MAGIC_LEFT_RENDER_REQUEST, 1)[0]) {
            renderMagicHud();
            writeMemory(ADDR_MAGIC_LEFT_RENDER_REQUEST, [0]);
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
            drawConversationDialog();
        }
    }
    // Draw speed change dialog
    drawSpeedChangeDialog();

    // Draw modal on top of everything (indoor scene or town)
    if (activeModal) {
        activeModal.draw(ctx, canvas.width, canvas.height, performance.now());
    }

    // Draw inventory screen on top of everything
    if (inventoryScreenInstance && inventoryScreenInstance.active) {
        inventoryScreenInstance.draw(performance.now());
    }
}

function loop(timestamp) {
    if (timestamp > lastTimestamp) fpsEl.textContent = Math.round(1000 / (timestamp - lastTimestamp));
    lastTimestamp = timestamp;
    draw();
    requestAnimationFrame(loop);
}

// ─── DOM references ───────────────────────────────────────────────────────────
const introScreen  = document.getElementById('intro-screen');
const introCanvas  = document.getElementById('introCanvas');
const uiScreen     = document.getElementById('ui');
const layoutWrapper = document.getElementById('layout-wrapper');
const fpsEl  = document.getElementById('fps-value');
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const tearOverlayEl = document.getElementById('tear-overlay');
canvas.width  = VIEW_COLS * TILE_WIDTH;
canvas.height = VIEW_ROWS * TILE_HEIGHT;
ctx.imageSmoothingEnabled = false;

const openingIntro = new OpeningIntro({
    screen:     introScreen,
    canvas:     introCanvas,
    onComplete: startGame,
});

// ─── UI helpers ───────────────────────────────────────────────────────────────
// ========== Save slot helpers (localStorage) ==========
const SAVE_PREFIX = 'zeliard_save_';

export function getSaveSlotNames() {
    const slots = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SAVE_PREFIX)) {
            slots.push(key.slice(SAVE_PREFIX.length));
        }
    }
    slots.sort();
    return slots;
}

export function saveGameToSlot(slotName, data) {
    const key = SAVE_PREFIX + slotName;
    const binary = String.fromCharCode(...data);
    localStorage.setItem(key, btoa(binary));
}

export function deleteGameFromSlot(slotName) {
    const key = SAVE_PREFIX + slotName;
    localStorage.removeItem(key);
}

export function loadGameFromSlot(slotName) {
    const key = SAVE_PREFIX + slotName;
    const base64 = localStorage.getItem(key);
    if (!base64) return null;
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch (err) {
        console.error('Failed to load save', slotName, err);
        return null;
    }
}

// Hidden file input used for import
let fileInput = null;
function ensureFileInput() {
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.sav';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }
    return fileInput;
}

// Export a specific save slot to a .sav file (filename = slotName + '.sav')
function exportSlotToFile(slotName) {
    const saveData = loadGameFromSlot(slotName);
    if (!saveData) {
        console.error(`No save data found for slot "${slotName}"`);
        alert(`No save data for slot "${slotName}"`);
        return;
    }
    const blob = new Blob([saveData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slotName}.sav`;   // use slot name as filename
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`Exported slot "${slotName}" to ${slotName}.sav`);
}

// Import a .sav file and restore game state
function importSaveFromFile() {
    if (!engineReady) {
        console.warn('Engine not ready, cannot import.');
        return;
    }
    const input = ensureFileInput();
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            if (data.length !== 256) {
                alert('Invalid save file: must be exactly 256 bytes.');
                return;
            }
            await performGameRestore(data);
            console.log(`Imported and restored from ${file.name}`);
        } catch (err) {
            console.error('Import failed:', err);
            alert('Failed to import save file.');
        } finally {
            input.value = '';
        }
    };
    input.click();
}

// Open the new modal
function openImportExportModal() {
    if (activeModal) return;
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
    activeModal = new ImportExportDialog(onExportSlot, onImportFromFile, onDeleteSlot, onCancel);
}

window.openSaveModal = openSaveModal;

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
