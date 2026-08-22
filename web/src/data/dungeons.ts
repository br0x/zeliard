/**
 * dungeons.ts — static dungeon/enemy data tables.
 *
 * Moved verbatim from game.js (Stage 2): EAI1–8 enemy frame mappings,
 * boss sprite segment tables, and the DUNGEONS per-map definitions.
 * Pure data — no logic; values mirror the original game binaries
 * (see asm/ as source of truth).
 */

// Frame mappings to tilesheet enp1.png
export const EAI1 = {
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
export const EAI2 = {
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
export const CRAB = {
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
export const TAKO = {
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
export const EAI3 = {
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
export const TORI = {
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
export const EAI4 = {
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
export const EAI5 = {
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
export const ZELA = {
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
    numSprites: 77,
};
export const MEDA = {
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
export const EAI6 = {
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
export const LEGA = {
    left: [ // 0xA030
        [ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15], // group 0
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], // group 1
        [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47], // group 2
        [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63], // group 3
        [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79], // group 4
        [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90],                     // group 5
        [91, 92, 93, 94, 95, 96],                                         // group 6
        [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],       // 7..21 unused
        [97],                                                             // 22 ordinary key
    ],
    right: [ // 0xA070
    ],
    numSprites: 98,
};
export const EAI7 = {
    left: [ // 0xA030: 32 arrays
        [0, 1, 2, 3, 4, 5, 6, 7],         // group 0 
        [19, 20, 21, 22, 23, 24, 25, 26], // group 1
        [38, 39, 40, 41, 42, 43, 44, 45], // group 2
        [57, 58, 59, 60, 61, 62, 63, 64], // group 3
        [76, 77, 78, 79],                 // group 4
        [], [], [],                       // 5..7 unused
        [16, 17, 18],                     // group 8
        [35, 36, 37],                     // group 9
        [54, 55, 56],                     // group 10
        [73, 74, 75],                     // group 11
        [84, 85, 86],                     // group 12
        [], [], [], [], [],               // 13..17 unused
        [87, 88, 89],                     // group 18
        [102, 103, 104, 105, 106, 107],   // group 19
        [90, 91, 92, 93],                 // group 20
        [94, 95, 96, 97],                 // group 21
        [108],                            // group 22
        [],                               // 23 unused
        [109],                            // group 24
        [110],                            // group 25
        [],                               // 26 unused
        [98, 99, 100, 101],               // group 27
    ],
    right: [ // 0xA070: 32 arrays
        [8, 9, 10, 11, 12, 13, 14, 15],   // group 0
        [27, 28, 29, 30, 31, 32, 33, 34], // group 1
        [46, 47, 48, 49, 50, 51, 52, 53], // group 2
        [65, 66, 67, 68, 69, 70, 71, 72], // group 3
        [80, 81, 82, 83],                 // group 4
        [], [], [],                       // 5..7 unused
        [16, 17, 18],                     // group 8
        [35, 36, 37],                     // group 9
        [54, 55, 56],                     // group 10
        [73, 74, 75],                     // group 11
        [84, 85, 86],                     // group 12
        [], [], [], [], [],               // 13..17 unused
        [87, 88, 89],                     // group 18
        [102, 103, 104, 105, 106, 107],   // group 19
        [90, 91, 92, 93],                 // group 20
        [94, 95, 96, 97],                 // group 21
        [108],                            // group 22
        [],                               // 23 unused
        [109],                            // group 24
        [110],                            // group 25
        [],                               // 26 unused
        [98, 99, 100, 101],               // group 27
    ],
    numSprites: 111,
};
export const DRGN = {
    left: [ // 0xA030
        [0, 1, 2, 3, 4, 5, 6, 7],                                         // group 0
        [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],   // group 1
        [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],     // group 2
        [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53],     // group 3
        [54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65],                 // group 4
        [66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81], // group 5
        [82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94],             // group 6
        [95, 96, 97, 98, 99, 100, 101, 102],                              // group 7
        [103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118], // group 8
        [119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132], // group 9
    ],
    right: [ // 0xA070
    ],
    numSprites: 133,
};
export const EAI8 = {
    left: [ // 0xA030: 32 arrays
        [0, 1, 2, 3, 4, 5],                // group 0
        [15, 16, 17, 18, 19, 20],          // group 1
        [30, 31, 32, 33, 34, 35, 36, 37],  // group 2
        [49, 50, 51, 52, 53],              // group 3
        [62, 63, 64, 65],                  // group 4
        [], [], [],                        // 5..7 unused
        [12, 13, 14],                      // group 8
        [27, 28, 29],                      // group 9
        [46, 47, 48],                      // group 10
        [59, 60, 61],                      // group 11
        [66, 67, 68],                      // group 12
        [], [], [],                        // 13..15 unused
        [94, 95, 96, 97],                  // group 16
        [],                                // 17 unused
        [69, 70, 71],                      // group 18
        [84, 85, 86, 87, 88, 89],          // group 19
        [72, 73, 74, 75],                  // group 20
        [76, 77, 78, 79],                  // group 21
        [92],                              // group 22
        [93],                              // group 23
        [90],                              // group 24
        [91],                              // group 25
        [],                                // 26 unused
        [80, 81, 82, 83],                  // group 27
        [98],                              // group 28
    ],
    right: [ // 0xA070: 32 arrays
        [6, 7, 8, 9, 10, 11],              // group 0
        [21, 22, 23, 24, 25, 26],          // group 1
        [38, 39, 40, 41, 42, 43, 44, 45],  // group 2
        [54, 55, 56, 57, 58],              // group 3
        [62, 63, 64, 65],                  // group 4
        [], [], [],                        // 5..7 unused
        [12, 13, 14],                      // group 8
        [27, 28, 29],                      // group 9
        [46, 47, 48],                      // group 10
        [59, 60, 61],                      // group 11
        [66, 67, 68],                      // group 12
        [], [], [],                        // 13..15 unused
        [94, 95, 96, 97],                  // group 16
        [],                                // 17 unused
        [69, 70, 71],                      // group 18
        [84, 85, 86, 87, 88, 89],          // group 19
        [72, 73, 74, 75],                  // group 20
        [76, 77, 78, 79],                  // group 21
        [92],                              // group 22
        [93],                              // group 23
        [90],                              // group 24
        [91],                              // group 25
        [],                                // 26 unused
        [80, 81, 82, 83],                  // group 27
        [98],                              // group 28
    ],
    numSprites: 99,
};
export const ZEL2 = {
    left: [ // 0xA030
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],           // tile group 0 (byte_A03A)
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],         // tile group 1 (byte_A08A)
        [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],         // tile group 2 (byte_A0D0)
        [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], // tile group 3 (byte_A116)
        [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75], // tile group 4 (byte_A166)
    ],
    right: [ // 0xA070 -- identical to `left`; like CRAB/TAKO, Agar has no facing-direction variant (getSheetFrame() falls back to "left" since ai_flags bit 0x80 is never set by place_boss_body_segments)
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
        [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],
        [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
        [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75],
    ],
    numSprites: 76,
};
export const AKMA = {
    left: [ // 0xA030
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],                               // tile group 0
        [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34], // tile group 1
        [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64], // tile group 2
        [80, 81, 82, 83, 84, 85, 86],                                 // tile group 3
        [94, 95, 96, 97, 98, 99, 100],                                // tile group 4
        [109, 110],                                                   // tile group 5
        [113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124], // tile group 6
        [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], // 7..24 unused
        [137],                                                        // 25 (blue potion)
    ],
    right: [ // 0xA070
        [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],                      // tile group 0
        [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49],  // tile group 1
        [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79],  // tile group 2
        [87, 88, 89, 90, 91, 92, 93],                                  // tile group 3
        [101, 102, 103, 104, 105, 106, 107, 108],                      // tile group 4
        [111, 112],                                                    // tile group 5
        [125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136],  // tile group 6
        [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], // 7..24 unused
        [137],                                                         // 25 (blue potion)
    ],
    numSprites: 138,
};
export const MAO1 = {
    left: [ // 0xA030
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],            // tile group 0
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],  // tile group 1
        [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],  // tile group 2
        [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63],  // tile group 3
        [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79],  // tile group 4
        [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94],      // tile group 5
        [95, 96, 97, 98, 99, 100, 101],                                    // tile group 6
    ],
    right: [ // 0xA070
    ],
    numSprites: 102,
};
export const MAO2 = {
    left: [ // 0xA030
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],            // tile group 0
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],  // tile group 1
        [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],  // tile group 2
        [48, 49, 50, 51, 52, 53, 54],                                      // tile group 3
        [55, 56, 57, 58, 59],                                              // tile group 4
        [60, 61, 62],                                                      // tile group 5
    ],
    right: [ // 0xA070
        [63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78],            // tile group 0
        [79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94],            // tile group 1
        [95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110], // tile group 2
        [111, 112, 113, 114, 115, 116, 117],                                         // tile group 3
        [118, 119, 120, 121, 122],                                                   // tile group 4
        [123, 124, 125],                                                             // tile group 5
    ],
    numSprites: 126,
};

export interface DungeonDefinition {
    mdtPath: string;
    tilesheetPath: string;
    entitySheetPath: string;
    passableTiles: number[];
    slopeTilesLeft?: number[];
    slopeTilesRight?: number[];
    aggressiveGround?: number[];
    airflows?: ArrayLike<number>;
    monster_xp?: number[];
    monster_damage?: number[];
    death_descriptors?: ReadonlyArray<ArrayLike<number>>;
    trajectories?: ReadonlyArray<ArrayLike<number>>;
    almasReward?: number;
    bossName?: string;
    ai?: unknown;
    projectiles?: unknown[];
    bossState?: unknown;
}

export const DUNGEONS: Record<string, DungeonDefinition> = {
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
        entitySheetPath: 'assets/images/enp6.png',
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
        entitySheetPath: 'assets/images/enp6.png',
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
        entitySheetPath: 'assets/images/enp6.png',
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
    17: { // dungeon 6 boss room
        mdtPath: 'game/0/mp6d.mdt',
        tilesheetPath: 'assets/images/mpp6.png',
        entitySheetPath: 'assets/images/lega.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 6, 0x0A, 0x0B, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x21, 0x22,
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
            160, 160, 160, 160, 160, 160, 80, 10, 10, 10, 10, 10, 10, 10, 10, 10,
            10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
        ],
        bossState: {
            bossX: 38,                // +0
            bossY: 7,                // +2
            bossHP: 640,              // +3
            xpReward: 6000,           // +5
            arenaCenterX: 8,         // +7
            bossPlacement: 0xFF,         // +8
            almasReward: 1500,         // +11
            bossName: 'Tarso',
        },
        ai: LEGA,
    },
    18: {
        mdtPath: 'game/0/mp70.mdt',
        tilesheetPath: 'assets/images/mpp7.png',
        entitySheetPath: 'assets/images/enp7.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x14, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x23, 
            0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E,
        ],
        slopeTilesLeft: [0x1E, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x23, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x2B, 0x2C, 0x2D, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0x2A, 0, 0, 0, 0x29, 0, 0, 0, 0x28], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [80, 80, 200, 200, 50], // from eaiN.bin
        monster_damage: [80, 80, 80, 80, 40], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 5, 5, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2F],
            [0x30],
            [0x31],
            [0x32],
        ],
        ai: EAI7,
    },
    19: {
        mdtPath: 'game/0/mp71.mdt',
        tilesheetPath: 'assets/images/mpp7.png',
        entitySheetPath: 'assets/images/enp7.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x14, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x23, 
            0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E,
        ],
        slopeTilesLeft: [0x1E, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x23, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x2B, 0x2C, 0x2D, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0x2A, 0, 0, 0, 0x29, 0, 0, 0, 0x28], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [80, 80, 200, 200, 50], // from eaiN.bin
        monster_damage: [80, 80, 80, 80, 40], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 5, 5, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2F],
            [0x30],
            [0x31],
            [0x32],
        ],
        ai: EAI7,
    },
    20: {
        mdtPath: 'game/0/mp72.mdt',
        tilesheetPath: 'assets/images/mpp7.png',
        entitySheetPath: 'assets/images/enp7.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x14, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x23, 
            0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E,
        ],
        slopeTilesLeft: [0x1E, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x23, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x2B, 0x2C, 0x2D, 0], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0x2A, 0, 0, 0, 0x29, 0, 0, 0, 0x28], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [80, 80, 200, 200, 50], // from eaiN.bin
        monster_damage: [80, 80, 80, 80, 40], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 11, 11, 5],
            [11, 5, 5, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2F],
            [0x30],
            [0x31],
            [0x32],
        ],
        ai: EAI7,
    },
    21: { // Llama hut with Paguro boss
        mdtPath: 'game/0/mp73.mdt',
        tilesheetPath: 'assets/images/mppb.png',
        entitySheetPath: 'assets/images/zel2.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0,
        ],
        slopeTilesLeft: [], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [], // mppX.grp.unp bytes 0x20..0x23
        airflows: [], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [], // from eaiN.bin
        monster_damage: [
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
            30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
        ], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [4, 5],
        ],
        bossState: {
            bossX: 48,          // +0
            bossY: 12,          // +2
            bossHP: 600,        // +3
            xpReward: 3000,     // +5
            arenaCenterX: 12,   // +7
            bossPlacement: 0,   // +8
            almasReward: 1600,  // +9
            bossName: 'Paguro',
        },
        ai: ZEL2,
    },
    22: { // dungeon 7 boss room
        mdtPath: 'game/0/mp7d.mdt',
        tilesheetPath: 'assets/images/mpp7.png',
        entitySheetPath: 'assets/images/drgn.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 0x14, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x23, 
            0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E,
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
                40, 30, 30, 30, 30, 30, 30, 30, 40, 40,  0,  0,  0,  0,  0,  0,
                0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
        ],
        bossState: {
            bossX: 30,               // +0
            bossY: 8,                // +2
            bossHP: 800,             // +3
            xpReward: 12000,         // +5
            arenaCenterX: 5,         // +7
            bossPlacement: 0,        // +8
            almasReward: 2500,       // +11
            bossName: 'Dragon',
        },
        ai: DRGN,
    },
    23: {
        mdtPath: 'game/0/mp80.mdt',
        tilesheetPath: 'assets/images/mpp8.png',
        entitySheetPath: 'assets/images/enp8.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x25, 0x26, 0x27, 0x28, 0x29,
        ],
        slopeTilesLeft: [0x0F, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x10, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x25, 0x26, 0x27, 0x28], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0x13, 0x14, 0x15, 0x16, 0x12, 0x1A, 0x1B, 0x1C, 0x11, 0x17, 0x18, 0x19], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [255, 255, 255, 255, 255], // from eaiN.bin
        monster_damage: [160, 160, 60, 80, 80], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 11],
            [11, 11, 11, 11],
            [5, 5, 0, 0],
            [11, 11, 5, 5],
            [11, 5, 0, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2A],
            [0x2B],
        ],
        ai: EAI8,
    },
    24: {
        mdtPath: 'game/0/mp81.mdt',
        tilesheetPath: 'assets/images/mpp8.png',
        entitySheetPath: 'assets/images/enp8.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x25, 0x26, 0x27, 0x28, 0x29,
        ],
        slopeTilesLeft: [0x0F, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x10, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x25, 0x26, 0x27, 0x28], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0x13, 0x14, 0x15, 0x16, 0x12, 0x1A, 0x1B, 0x1C, 0x11, 0x17, 0x18, 0x19], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [255, 255, 255, 255, 255], // from eaiN.bin
        monster_damage: [160, 160, 60, 80, 80], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 11],
            [11, 11, 11, 11],
            [5, 5, 0, 0],
            [11, 11, 5, 5],
            [11, 5, 0, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2A],
            [0x2B],
        ],
        ai: EAI8,
    },
    25: {
        mdtPath: 'game/0/mp82.mdt',
        tilesheetPath: 'assets/images/mpp8.png',
        entitySheetPath: 'assets/images/enp8.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x25, 0x26, 0x27, 0x28, 0x29,
        ],
        slopeTilesLeft: [0x0F, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x10, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x25, 0x26, 0x27, 0x28], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0x13, 0x14, 0x15, 0x16, 0x12, 0x1A, 0x1B, 0x1C, 0x11, 0x17, 0x18, 0x19], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [255, 255, 255, 255, 255], // from eaiN.bin
        monster_damage: [160, 160, 60, 80, 80], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 11],
            [11, 11, 11, 11],
            [5, 5, 0, 0],
            [11, 11, 5, 5],
            [11, 5, 0, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2A],
            [0x2B],
        ],
        ai: EAI8,
    },
    26: {
        mdtPath: 'game/0/mp83.mdt',
        tilesheetPath: 'assets/images/mpp8.png',
        entitySheetPath: 'assets/images/enp8.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x25, 0x26, 0x27, 0x28, 0x29,
        ],
        slopeTilesLeft: [0x0F, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x10, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x25, 0x26, 0x27, 0x28], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0x13, 0x14, 0x15, 0x16, 0x12, 0x1A, 0x1B, 0x1C, 0x11, 0x17, 0x18, 0x19], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [255, 255, 255, 255, 255], // from eaiN.bin
        monster_damage: [160, 160, 60, 80, 80], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 11],
            [11, 11, 11, 11],
            [5, 5, 0, 0],
            [11, 11, 5, 5],
            [11, 5, 0, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2A],
            [0x2B],
        ],
        ai: EAI8,
    },
    27: {
        mdtPath: 'game/0/mp84.mdt',
        tilesheetPath: 'assets/images/mpp8.png',
        entitySheetPath: 'assets/images/enp8.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x25, 0x26, 0x27, 0x28, 0x29,
        ],
        slopeTilesLeft: [0x0F, 0, 0, 0], // mppX.grp.unp bytes 0x18..0x1B
        slopeTilesRight: [0x10, 0, 0, 0], // mppX.grp.unp bytes 0x1C..0x1F
        aggressiveGround: [0x25, 0x26, 0x27, 0x28], // mppX.grp.unp bytes 0x20..0x23
        airflows: [0x13, 0x14, 0x15, 0x16, 0x12, 0x1A, 0x1B, 0x1C, 0x11, 0x17, 0x18, 0x19], // mppX.grp.unp bytes 0x24..0x2f
        monster_xp:     [255, 255, 255, 255, 255], // from eaiN.bin
        monster_damage: [160, 160, 60, 80, 80], // from eaiN.bin
        death_descriptors: [ // from eaiN.bin
            [11, 11, 11, 11],
            [11, 11, 11, 11],
            [5, 5, 0, 0],
            [11, 11, 5, 5],
            [11, 5, 0, 0],
            [],
            [],
            [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
            [0x2A],
            [0x2B],
        ],
        ai: EAI8,
    },
    28: { // dungeon 8 boss room
        mdtPath: 'game/0/mp8d.mdt',
        tilesheetPath: 'assets/images/mpp8.png',
        entitySheetPath: 'assets/images/akma.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 8, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x25, 0x26, 0x27, 0x28, 0x29,
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
            40, 40, 40, 40, 40, 40, 80, 40, 40, 40, 40, 40, 40, 40, 40, 40,
            40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40,
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
        ],
        bossState: {
            bossX: 42,               // +0
            bossY: 0,                // +2
            bossHP: 800,             // +3
            xpReward: 30000,         // +5
            arenaCenterX: 12,        // +7
            bossPlacement: 0,        // +8
            almasReward: 3800,       // +11
            bossName: 'Alguien',
        },
        ai: AKMA,
    },
    29: { // Jashiin room 1
        mdtPath: 'game/0/mp90.mdt',
        tilesheetPath: 'assets/images/mpp9.png',
        entitySheetPath: 'assets/images/mao1.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
        ],
        bossState: {
            bossX: 16,               // +0
            bossY: 1,                // +2
            bossHP: 250,             // +3
            xpReward: 200,           // +5
            arenaCenterX: 5,         // +7
            bossPlacement: 0xff,     // +8
            almasReward: 0,          // +11
            bossName: 'Jashiin',
        },
        ai: MAO1,
    },
    30: { // Jashiin room 2
        mdtPath: 'game/0/mpa0.mdt',
        tilesheetPath: 'assets/images/mppa.png',
        entitySheetPath: 'assets/images/mao2.png',
        passableTiles: [ // mppX.grp.unp bytes 0..0x17
            0, 9, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x11, 0x12, 0x13,
        ],
        slopeTilesLeft: [],
        slopeTilesRight: [],
        aggressiveGround: [],
        airflows: [],
        monster_xp: [],
        monster_damage: [
            80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80,
            80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80,
        ],
        death_descriptors: [
            [], [], [], [], [], [], [], [],
        ],
        trajectories: [
        ],
        projectiles: [ // 1-based tile indices in mppX.png sheet
        ],
        bossState: {
            bossX: 48,               // +0
            bossY: 9,                // +2
            bossHP: 800,             // +3
            xpReward: 10000,         // +5
            arenaCenterX: 12,        // +7
            bossPlacement: 0,        // +8
            almasReward: 0,          // +11
            bossName: 'Jashiin',
        },
        ai: MAO2,
    },
};