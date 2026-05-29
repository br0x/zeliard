import re

with open('fight_commented.asm', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# Dictionary: {line_number_1based -> list_of_comment_lines_to_insert_BEFORE}
inserts = {}

def ins(lineno, *comments):
    if lineno not in inserts:
        inserts[lineno] = []
    for c in comments:
        inserts[lineno].append(c)

# ============================================================
# FILE HEADER
# ============================================================
ins(1,
"; ===========================================================================",
"; fight.asm — Zeliard dungeon (cavern) engine",
"; Loaded as fight.bin at seg:6000h.",
";",
"; OVERVIEW",
"; --------",
"; This module implements the entire dungeon gameplay loop:",
";   - Dungeon init & map decompression (MDT format)",
";   - Per-frame hero movement: walk, jump, squat, rope climb, slope slide",
";   - Hero sword attacks (forward / overhead swing / downward thrust)",
";   - Hero damage, shield absorption, knockback, death + respawn",
";   - Monster proximity culling, AI dispatching, spawning",
";   - Contact damage, projectile collision with hero",
";   - Magic spell projectiles (Espada, Saeta, Fuego, Rascar, Agua, Guerra)",
";   - Collectible items/keys/gold/potions picked up via monster flags",
";   - Door/platform logic (dchr.grp tiles)",
";   - Dungeon-to-town and dungeon-to-dungeon transitions",
";   - Boss cavern HUD, Jashiin special-case startup",
";",
"; COORDINATE SYSTEM",
"; -----------------",
"; The dungeon map is mapWidth × 64 tiles (64 rows always).",
"; A 36 × 64 'proximity map' (0xE000–0xE8FF) is a sliding window over the",
"; full map, centered ±18 tiles around the hero's X position.",
"; The 28 × 19 'viewport buffer' (0xE900h) is a sub-window for screen tiles.",
"; Both wrap circularly; wrap_map_from_above / wrap_map_from_below enforce this.",
";",
"; SPRITE SUMMARY (for JS renderer)",
"; ----------------------------------",
"; fman.grp  — hero in dungeon: 3×3 grid of 8×8 tiles (= 24×24 px per frame).",
";             Frame table stored at the start of the file (groups × 9 bytes).",
";             Palette: PAL_DECODE_TABLES[0]; tile format: 32 bytes/tile (mode 8 in grp_viewer).",
"; dchr.grp  — doors (multi-tile composites) and platforms (8×8 tiles, mode 10).",
"; mpp?.grp  — dungeon tileset for the current cavern (8×8 tiles, mode 10).",
";             Loaded to seg1:8000h. Layout metadata: tile_anim_count_table @ 8000h,",
";             special_tile_list @ 8002h, animation replacements @ 8004h.",
"; enp?.grp  — monsters/items: 2×2 grid of 8×8 tiles (= 16×16 px per frame).",
";             Each frame: [palette_idx, tl, tr, bl, br] (mode 11).",
";             Loaded to seg1:monster_gfx (4000h), transparency masks at A000h.",
"; crab.grp  — boss sprite (multi-part body, mode 12).",
"; All these GRP files are compressed with the custom unpack() scheme (method 0-7)",
"; documented in grp_viewer.py.",
";",
"; MDT MAP FORMAT",
"; --------------",
"; Each dungeon map file (*.mdt) contains:",
";   [mdt_descriptor] 7 bytes — see common.inc mdt_descriptor STRUC",
";   [cavern data]  — map name string, monsters table, doors table, platforms",
";   [packed map]   — column-run-length encoded tile map, 64 rows × mapWidth cols",
";                    4 encoding cases based on high 2 bits of each byte.",
";",
"; MONSTER TABLE FORMAT  (monster struc from dungeon.inc)",
"; -------------------------------------------------------",
"; Each entry is 16 bytes. The table ends with 0xFFFF.",
"; Flags byte distinguishes live monsters (AI-controlled) from static items",
"; (keys, potions, chests, almas, signs, shoes). Items have flags 0x10-0x1E.",
"; Big monsters (4×4 tiles) occupy 2 consecutive table entries.",
"; ===========================================================================",
"",
)

# ============================================================
# DISPATCH TABLE
# ============================================================
ins(16,
"; ===========================================================================",
"; EXPORT TABLE — call gate for external callers (town.bin, AI modules, etc.)",
"; Each entry is the offset of a callable function, indexed by slot number.",
"; Callers reach these via the fight.bin base address + slot*2.",
"; Slots are declared in common.inc as fight.bin equates.",
"; ===========================================================================",
)

# ============================================================
# Cavern_Game_Init
# ============================================================
ins(64,
"; ===========================================================================",
"; Cavern_Game_Init",
"; Entry point called every time the dungeon scene begins (after MDT load).",
"; Also re-entered after room transitions (load_place_and_reinit → Cavern_Game_Init).",
";",
"; Flow:",
";   1. Reset SP, init projectile arrays and boss/flash flags.",
";   2. Boss cavern path (is_boss_cavern != 0):",
";      a. Draw enemy HUD bars.",
";      b. Load boss music (fn5 → seg1:3000h).",
";      c. Load ENCNT.GRP encounter intro sprite (fn2 → seg1:4000h).",
";      d. Animate 6 'encounter flashing' intervals.",
";      e. Override enp_grp_idx with boss_grp from mdt_descriptor.",
";      f. Load boss enp?.grp → seg1:monster_gfx, decompress tile data.",
";      g. Draw boss name (Pascal string from AI word_A002+9) and HP bars.",
";   3. Jashiin special path (is_jashiin_cavern != 0):",
";      Shifted viewport (hero not centered), loads MDT 30 (MPA0.MDT).",
";   4. Regular cavern path:",
";      Draw place name and gold label.",
";   5. Common tail — draw hero HP bars, then fall through to init_cavern.",
";",
"; main_loop (within Cavern_Game_Init):",
";   Tightly coupled per-frame loop:",
";     - Rope state check → over_rope handler if needed",
";     - input_handling  : sword swing & spacebar latch",
";     - sliding_physics_step",
";     - main_update_render : full simulation + render tick",
";     - magic_spell_fire_handler",
";     - hero_interaction_check : tile-based interactions",
";     - hero_knockback_handler",
";     - State machine dispatcher (left/right/up/down key routing)",
"; ===========================================================================",
)

ins(86,
"; --- BOSS CAVERN INIT ---",
"; Draws enemy HUD, loads & plays encounter music, shows encounter intro sprite",
"; (ENCNT.GRP), animates 6 flash intervals at 0x41 timer ticks each.",
"; After animation: loads the actual boss enp sprite group and decompresses it.",
)

ins(158,
"; --- Boss HUD: display boss name from AI data, draw HP bars ---",
)

ins(175,
"; --- REGULAR CAVERN INIT ---",
"; Clear enemy bar, render place name label and gold label.",
)

ins(182,
"; --- Common cavern HUD: hero max HP, current HP, almas counter ---",
)

ins(191,
"; --- Jashiin special path ---",
"; Viewport offset: hero appears at x=5 in viewport (x+36=41 in proximity map).",
"; Waits until is_jashiin_cavern flag clears (set by transition animation).",
"; Loads MDT index 30 (MPA0.MDT — Jashiin boss room).",
)

ins(245,
"; --- Normal dungeon startup ---",
"; Unpack the MDT map, update monster positions, check death flag.",
)

ins(288,
"; ===========================================================================",
"; main_loop — per-frame game loop (called via RET/PUSH trick)",
"; Frame structure:",
";   1. Check if on rope → separate rope-handling path",
";   2. input_handling",
";   3. sliding_physics_step",
";   4. main_update_render",
";   5. magic_spell_fire_handler",
";   6. hero_interaction_check",
";   7. hero_knockback_handler",
";   8. frame_ticks counter: reset squat flag at tick 2",
";   9. Read direction bits → route to state_machine_dispatcher",
"; ===========================================================================",
)

# ============================================================
# state_machine_dispatcher
# ============================================================
ins(354,
"; ===========================================================================",
"; state_machine_dispatcher",
"; Reads the current direction input (int 61h) and branches to the correct",
"; hero movement handler.",
";",
"; Input combinations dispatched (al = right/left/down/up bitfield):",
";   101b  (left+up)   → left_up_pressed",
";   1001b (right+up)  → right_up_pressed",
";   001b  (up only)   → up_pressed",
";   100b  (left)      → loc_663E (left_up_pressed tail)",
";   1000b (right)     → loc_67C6 (right_up_pressed tail)",
";   010b  (down)      → down_pressed",
";   else              → init_horizontal_sliding + idle animation",
";",
"; Also manages the byte_9F24 direction-change latch for sliding init.",
"; ===========================================================================",
)

# ============================================================
# hero_interaction_check
# ============================================================
ins(453,
"; ===========================================================================",
"; hero_interaction_check",
"; Checks whether the 3-tile-wide hero footprint overlaps a rope or door tile,",
"; routing to hero_moves_left / hero_moves_right if so.",
"; Skipped while squatting or airborne.",
"; Called every frame from main_loop.",
"; ===========================================================================",
)

# ============================================================
# hero_knockback_handler
# ============================================================
ins(499,
"; ===========================================================================",
"; hero_knockback_handler",
"; Applies knockback when the hero was just hit by a monster this frame.",
"; (byte_9F14 is set by check_hero_contact_damage when hit.)",
";",
"; Behaviour:",
";   - If byte_9F01 is set (boss cavern special flag), or byte_9F0E/9F10 vectors",
";     indicate horizontal push: call move_hero_left/right twice.",
";   - If on rope during knockback: drop off rope, enter descending state.",
";   - If in an air-up tile: no extra push.",
";   - If climbing down rope (jump_phase_flags 0x80): just move viewport down.",
";   - Otherwise check floor landing, potentially scroll viewport down.",
"; ===========================================================================",
)

# ============================================================
# sliding_physics_step
# ============================================================
ins(592,
"; ===========================================================================",
"; sliding_physics_step",
"; Applies one tick of ice-slide movement.",
"; Only active when cavern_level == 4 (ice cavern) AND no Ruzeria shoes.",
"; Consumes one tick from slide_ticks_remaining.",
"; Slides in the direction stored in byte_9F22 (1=right, 2=left),",
"; but respects the direction-lock bit in byte_9F23.",
"; If the tile underfoot is a non-ice tile (0x40-0x48), stops sliding.",
"; ===========================================================================",
)

# ============================================================
# init_horizontal_sliding
# ============================================================
ins(651,
"; ===========================================================================",
"; init_horizontal_sliding",
"; When the hero starts moving on an ice surface, converts the accumulated",
"; horiz_movement_sub_tile_accum into slide_ticks_remaining (capped at 10).",
"; Called each time a directional key is read in the state machine.",
"; ===========================================================================",
)

# ============================================================
# up_pressed
# ============================================================
ins(692,
"; ===========================================================================",
"; up_pressed",
"; Handles UP direction (no left/right).",
"; Tries (in order):",
";   1. try_door_interaction — check for a door tile above hero",
";   2. try_move_platform_up — raise a vertical platform if hero is on it",
";   3. try_climb_rope       — grab a rope if one is above hero",
"; Falls through silently if none apply.",
"; ===========================================================================",
)

# ============================================================
# jump_press_handler
# ============================================================
ins(703,
"; ===========================================================================",
"; jump_press_handler",
"; Handles the jump initiation when UP+button is pressed.",
"; Increments slide_ticks_remaining (up to 10) while button is held.",
";",
"; On ground:",
";   - Checks tile above hero head; if clear, sets jump_phase_flags = 0xFF",
";     (ascending), computes initial height_above_ground.",
";   - Feruza shoes: height_above_ground starts at 2 (vs 1 normally),",
";     allowing 4 vs 2 jump height steps.",
";   - If hero head y < 7 (near viewport top), calls move_hero_up instead of",
";     decrementing y directly.",
"; On slope or rope: transitions to descending (jump_phase_flags = 0x7F).",
"; ===========================================================================",
)

# ============================================================
# try_climb_rope
# ============================================================
ins(766,
"; ===========================================================================",
"; try_climb_rope",
"; Called from up_pressed.",
"; Checks the 3 possible hero-relative X positions for a rope tile (tile 0 or 1).",
"; If found directly above: begins climbing animation — moves hero up row by row",
"; (calling move_hero_up + main_update_render) until rope is no longer above.",
"; Sets on_rope_flags = 0xFF.",
"; ===========================================================================",
)

# ============================================================
# move_hero_up
# ============================================================
ins(832,
"; ===========================================================================",
"; move_hero_up",
"; Scrolls the viewport up by one tile row:",
";   viewport_top_row_y--",
";   viewport_left_top_addr -= 36  (with circular wrap if below 0xE000)",
"; ===========================================================================",
)

# ============================================================
# left_up_pressed
# ============================================================
ins(845,
"; ===========================================================================",
"; left_up_pressed / loc_663E (left movement without jump)",
"; Handles LEFT direction (optionally combined with UP for jump-left).",
";",
"; - If facing right: flip_facing_direction, reset animation.",
"; - If squatting: ignore.",
"; - If on a right slope and moving left: clear Up bit, transition slope state.",
"; - Otherwise: call move_hero_left_if_no_obstacles.",
";   On success: set byte_9F22=2 (slide dir=left), increment accum, set Up flag.",
"; ===========================================================================",
)

# ============================================================
# move_hero_left_if_no_obstacles
# ============================================================
ins(909,
"; ===========================================================================",
"; move_hero_left_if_no_obstacles",
"; Attempts to scroll the dungeon one tile to the right (hero moves left).",
";",
"; 1. Check the 4 tiles (3 hero rows + 1 above) at hero x-1 for:",
";    - Active monsters (proximity byte with bit 7 set) → block",
";    - Solid/blocking tile type → block",
";    - Airflow category 2 (right-flow wind) → block for normal cavern",
"; 2. If clear: decrement proximity_map_left_col_x,",
";    shift proximity map 1 column right (rep movsb backward),",
";    unpack new leftmost column from packed_map_ptr_for_hero_x_minus_18.",
"; 3. After scroll: call every_projectile_moves_right_in_viewport,",
";    then stamp the newly-entering right-edge monsters from monsters_table.",
";",
"; SPRITE NOTE: The hero occupies a 3×3 tile area (3 columns wide) in the",
"; proximity map. hero_coords_to_addr_in_proximity returns the top-left corner.",
"; hero_x_in_viewport is always 0x0C (column 12) in normal caverns.",
"; ===========================================================================",
)

# ============================================================
# NC_can_pass_except_category2
# ============================================================
ins(1063,
"; ===========================================================================",
"; NC_can_pass_except_category2",
"; Returns CF=1 (cannot pass) if tile [si] is an airflow tile of category 2",
"; (right-flowing wind). Used for left-movement blocking in level 5 caverns.",
"; get_airflow_direction → ZF + cl=0/1/2 for up/left/right.",
"; ===========================================================================",
)

# ============================================================
# right_up_pressed
# ============================================================
ins(1094,
"; ===========================================================================",
"; right_up_pressed / loc_67C6 (right movement without jump)",
"; Mirror of left_up_pressed for rightward movement.",
"; - If facing left: flip_facing_direction.",
"; - If on right slope and moving right: transition slope state.",
"; - Otherwise: call move_hero_right_if_no_obstacles.",
"; ===========================================================================",
)

# ============================================================
# flip_facing_direction
# ============================================================
ins(1146,
"; ===========================================================================",
"; flip_facing_direction",
"; XORs bit 0 of facing_direction (toggle left/right).",
"; If on ground: resets hero_animation_phase to 0x80 (idle frame).",
"; ===========================================================================",
)

# ============================================================
# move_hero_right_if_no_obstacles
# ============================================================
ins(1175,
"; ===========================================================================",
"; move_hero_right_if_no_obstacles",
"; Attempts to scroll the dungeon one tile to the left (hero moves right).",
"; Mirror of move_hero_left_if_no_obstacles:",
"; 1. Check 4 tiles at hero x+2 for monsters or solid tiles.",
"; 2. If clear: increment proximity_map_left_col_x,",
";    shift proximity map 1 column left (rep movsb forward),",
";    unpack new rightmost column from packed_map_ptr_for_hero_x_plus_18.",
"; 3. Call every_projectile_moves_left_in_viewport,",
";    stamp newly-entering left-edge monsters.",
"; ===========================================================================",
)

# ============================================================
# NC_can_pass_except_category1
# ============================================================
ins(1322,
"; ===========================================================================",
"; NC_can_pass_except_category1",
"; Returns CF=1 (cannot pass) if tile [si] is airflow category 1 (left-flow).",
"; Used for right-movement blocking in level 5 caverns (wind tunnels).",
"; ===========================================================================",
)

# ============================================================
# airborne_movement
# ============================================================
ins(1353,
"; ===========================================================================",
"; airborne_movement",
"; Handles all in-air physics each frame (ascending and descending).",
";",
"; Skip if air_up_tile_found or jump_phase_flags bit 7 (rope-descend mode).",
";",
"; Per tick:",
";   1. hero_collapse_platform — collapse any crumbling platform hero stands on",
";   2. slope_assist_on_landing — slide hero along slope during descent",
";   3. check_floor_for_landing — if floor tile found below: jmp land_after_jump",
";   4. Increment jump_height_counter.",
";   5. Scroll viewport down (byte_9F09 driven) if near viewport bottom.",
";   6. Fall-off-cliff path: hero_scroll_down.",
";   7. Rope grab check during flight.",
";   8. If descending (was ascending before): read arrow keys for in-air steering.",
"; ===========================================================================",
)

# ============================================================
# slope_assist_on_landing
# ============================================================
ins(1523,
"; ===========================================================================",
"; slope_assist_on_landing",
"; Called each airborne frame to handle slope interactions.",
"; Reads tile at hero feet+2 rows via get_slope_direction_by_tile_under_feet.",
"; If on a slope:",
";   - Slide down every 4th tick (unless input holds uphill direction).",
";   - Silkarn shoes: no forced sliding.",
";   - height_above_ground counts down; at 0, slides freely every frame.",
"; Slope tiles defined in seg1:8018h (left slope 0x0B) and 801Ch (right slope 0x0C).",
"; ===========================================================================",
)

# ============================================================
# down_pressed
# ============================================================
ins(1594,
"; ===========================================================================",
"; down_pressed",
"; Handles DOWN key press.",
"; - If on slope: do nothing (slope_direction != 0).",
"; - Try move_platform_down_damage_monster (lower active platform).",
"; - If rope above feet: dismount rope (on_rope_flags = 0x80, jump = 0x80).",
"; - If on ground: set squat_flag = 0xFF (crouching).",
"; ===========================================================================",
)

# ============================================================
# get_slope_direction_by_tile_under_feet
# ============================================================
ins(1783,
"; ===========================================================================",
"; get_slope_direction_by_tile_under_feet",
"; Checks tile at [si] (hero feet position in proximity map).",
"; Searches seg1:8018h (left-slope table, up to 4 entries) and",
"; seg1:801Ch (right-slope table, up to 4 entries).",
"; Returns: ZF=1, dl=2 → left slope (/); ZF=1, dl=1 → right slope (\\).",
"; Returns: NZ → not a slope tile.",
"; ===========================================================================",
)

# ============================================================
# remove_accomplished_items
# ============================================================
ins(1835,
"; ===========================================================================",
"; remove_accomplished_items",
"; Scans the accomplished_items_checker_table (MDT-embedded).",
"; For each entry: reads a savegame byte and checks a bitmask.",
"; If condition is met (item was already collected / boss defeated):",
";   Iterates a list of (address, value) pairs and writes them to the monsters",
";   table — effectively removing collected items or opening doors in memory.",
"; This reconciles the savegame state with the current MDT's monster list.",
"; ===========================================================================",
)

# ============================================================
# render_place_and_gold_labels
# ============================================================
ins(1879,
"; ===========================================================================",
"; render_place_and_gold_labels",
"; Renders the 'PLACE' and 'GOLD' text labels on the HUD bar (non-boss cavern).",
"; Uses hard-coded Pascal strings with pixel positions.",
"; ===========================================================================",
)

# ============================================================
# render_hud_bars_with_enemy
# ============================================================
ins(1902,
"; ===========================================================================",
"; render_hud_bars_with_enemy",
"; Sets up the HUD layout for boss encounters.",
"; Draws two HUD bar areas, copies a screen region, and renders the 'ENEMY' label.",
"; Called on boss cavern init and Jashiin cavern init.",
"; ===========================================================================",
)

# ============================================================
# unpack_map
# ============================================================
ins(1939,
"; ===========================================================================",
"; unpack_map",
"; Decompresses the column-RLE packed dungeon map into the 36×64 proximity map.",
";",
"; The packed map (at packed_map_start in the MDT data) stores each column of",
"; 64 tile-rows as a sequence of RLE tokens. Column order is left-to-right.",
";",
"; Steps:",
";   1. Skip proximity_map_left_col_x columns (decompress to /dev/null).",
";      Saves the pointer as packed_map_ptr_for_hero_x_minus_18.",
";   2. Decompress 36 columns into proximity_map[0..35].",
";      Each column: call unpack_column (calls unpack_step_forward in a loop).",
";      X wraps around mapWidth (circular world).",
";   3. Save pointer as packed_map_ptr_for_hero_x_plus_18.",
";   4. Compute viewport_left_top_addr from viewport_top_row_y.",
";",
"; ENCODING (4 cases based on high 2 bits of first byte):",
";   00xxxxxx count_byte, tile_byte  → repeat tile (count+1) times",
";   01xxxxxx nibble_encoded         → short RLE: count=(hi nibble)+2, tile=(lo+1)",
";   10xxxxxx empty_count            → 0-tile run of (byte & 0x3F) rows",
";   11xxxxxx single_tile            → 1 occurrence of tile (byte & 0x3F)",
"; ===========================================================================",
)

# ============================================================
# unpack_step_forward / unpack_step_backward
# ============================================================
ins(1998,
"; ===========================================================================",
"; unpack_step_forward / unpack_step_backward",
"; Decode one RLE token from the packed map stream.",
"; Output: BH = repeat count, BL = tile value.",
"; 'forward' increments SI (for left→right decompression).",
"; 'backward' decrements SI (for right→left decompression when scrolling).",
"; Dispatch via a 4-entry function pointer table based on high 2 bits.",
"; ===========================================================================",
)

# ============================================================
# unpack_column
# ============================================================
ins(2100,
"; ===========================================================================",
"; unpack_column",
"; Decompresses one full column (64 rows) into the proximity map.",
"; Input: SI = packed map pointer; DI = proximity_map + col_offset",
"; Writes each tile BH times at [DI], DI += 36 per row.",
"; Loops until 64 rows are filled (DL accumulates row count).",
"; ===========================================================================",
)

# ============================================================
# coords_in_ax_to_proximity_map_addr_in_di
# ============================================================
ins(2125,
"; ===========================================================================",
"; coords_in_ax_to_proximity_map_addr_in_di",
"; Converts relative (x, y) coordinates to a proximity map address.",
"; AL = y (0-63), AH = x (0-35); y masked to 6 bits.",
"; DI = (y & 0x3F) * 36 + x + 0xE000",
"; Frequently used by all collision, monster placement, and spell code.",
"; ===========================================================================",
)

# ============================================================
# wrap_map_from_above / wrap_map_from_below
# ============================================================
ins(2144,
"; ===========================================================================",
"; wrap_map_from_above / wrap_map_from_below",
"; Maintain the circular 36×64 proximity map buffer (0xE000–0xE8FF).",
"; wrap_map_from_above: if SI >= 0xE900, subtract 0x900 (wrap past bottom).",
"; wrap_map_from_below: if SI <  0xE000, add    0x900 (wrap past top).",
"; Called after every SI ± 36 offset adjustment to traverse rows.",
"; ===========================================================================",
)

# ============================================================
# set_zero_flag_if_slippery
# ============================================================
ins(2175,
"; ===========================================================================",
"; set_zero_flag_if_slippery",
"; Returns ZF=1 (slippery) if cavern_level == 4 (ice dungeon) AND hero is",
"; not wearing Ruzeria shoes (current_accessory != SHOES_RUZERIA).",
"; Used by sliding_physics_step and init_horizontal_sliding.",
"; ===========================================================================",
)

# ============================================================
# hero_coords_to_addr_in_proximity
# ============================================================
ins(2202,
"; ===========================================================================",
"; hero_coords_to_addr_in_proximity",
"; Returns SI = proximity map address of hero's top-left 8×8 tile.",
"; Formula: SI = viewport_left_top_addr + (hero_head_y_in_viewport * 36)",
";              + hero_x_in_viewport + 4",
"; The +4 accounts for the 4-column dead-zone at the left edge of the",
"; proximity map (proximity is 36 wide, viewport is 28 wide, offset = 4).",
"; hero_x_in_viewport is normally 0x0C (column 12 = center).",
"; Result is wrapped through wrap_map_from_above.",
"; ===========================================================================",
)

# ============================================================
# get_dst_monster_flags
# ============================================================
ins(2221,
"; ===========================================================================",
"; get_dst_monster_flags",
"; Reads one byte from the proximity map at [SI].",
"; If bit 7 is clear: CF=1 (no monster, or blocked tile).",
"; If bit 7 is set: the low 7 bits are a monster_index (0-127).",
";   Looks up monsters_table_addr + index*16 to get the monster struct.",
";   Returns AL = monster.flags, BX = pointer to monster struct.",
";   NC (no carry) if monster is live; CF if monster.flags == 0.",
"; ===========================================================================",
)

# ============================================================
# is_non_blocking_tile family
# ============================================================
ins(2245,
"; ===========================================================================",
"; is_non_blocking_tile family",
"; Three variants checking whether a tile index in AL can be passed through.",
";",
"; is_non_blocking_tile (fastest):",
";   AL < 0x40 → lookup in 24-byte passable-tile table at seg1:8000h.",
";   AL >= 0x40 → NZ (solid).",
";",
"; is_non_blocking_tile_extended:",
";   AL < 0x49 → table lookup.",
";   Also checks bits 7:5 of AL for special cases (monster/item bytes 0x90-0x91).",
";",
"; is_non_blocking_tile_simple:",
";   AL < 0x49 → table lookup.",
";   AL >= 0x80 → NZ (non-passable).",
";",
"; The passable-tile table at seg1:8000h contains tile IDs like:",
";   0x00 (air), 0x01/0x02 (rope), 0x08-0x19 (various walk-through tiles).",
"; Sets ZF=1 when passable, NZ when blocked.",
"; ===========================================================================",
)

# ============================================================
# input_handling
# ============================================================
ins(2327,
"; ===========================================================================",
"; input_handling",
"; Reads keyboard/joystick state and decides which sword-swing mode to trigger.",
"; Only runs if hero has a sword (sword_type != 0).",
";",
"; SPACE + ascending + down-direction → downward thrust (sword_hit_type=2)",
";   If not already held (down_thrust_held_flag): play SFX 4.",
"; SPACE latched (from previous frame) → normal or overhead swing:",
";   - Scans 4×8-tile area in front of hero for monsters; if any found → overhead",
";   - OR if UP is pressed → overhead swing (sword_hit_type=1)",
";   - Otherwise → forward hit (sword_hit_type=0)",
"; Sets sword_swing_flag=0xFF to trigger apply_sword_hit_to_map_tiles.",
"; ===========================================================================",
)

# ============================================================
# apply_sword_hit_to_map_tiles
# ============================================================
ins(2446,
"; ===========================================================================",
"; apply_sword_hit_to_map_tiles",
"; Called every frame while sword_swing_flag is set.",
"; Walks the sword reachability table (at seg1:sword_reachability_tables) to",
"; determine which proximity map offsets the sword tip can reach.",
"; Table index = (facing_dir * 16) + sword_movement_phase + swing_type_offset.",
";   Forward hit:      al = phase | (dir * 16)",
";   Overhead swing:   al = phase | (dir * 16) | 6",
";   Downward thrust:  al = dir * 16 + 10",
"; For each tile offset in the table: if a live monster is present (via",
"; get_dst_monster_flags), sets monster.ai_flags |= 0x41 (hit marker bit 6 + type 1).",
"; ===========================================================================",
)

# ============================================================
# main_update_render
# ============================================================
ins(2529,
"; ===========================================================================",
"; main_update_render",
"; Master simulation + render tick called every frame.",
";",
"; Simulation phase:",
";   - Feruza shoes → feruza_shoes_four_else_two = 4 (else 2).",
";   - check_airflows_on_hero — detect and apply wind tunnel tiles.",
";   - If not airborne: reset byte_9F09 (fall sub-step counter).",
";   - Re-center hero if hero_x_in_viewport drifts from 0x0C.",
";   - Compute hero_y_absolute = (hero_head_y_in_viewport + viewport_top_row_y) & 0x3F.",
";   - update_boss_heartbeat_volume",
";   - update_and_render_horiz_platforms",
";   - render_vertical_platforms_to_proximity",
";   - process_visible_collapsing_platforms",
";   - process_doors",
";   - dispatch_spell_projectile_movement",
";   - monsters_spawning  (unless boss is already dead)",
";   - check_hero_contact_damage",
";   - Flush UI dirty element",
";   - projectiles_collision_processing",
";   - monsters_updates  (render)",
";   - step_on_aggressive_ground",
";   - Temperature damage (cavern_level 7 = heat, every 0x40 ticks, 0x0F damage)",
";     Protected by CAPE_ASBESTOS.",
";   - screen_flash_overlay",
"; ===========================================================================",
)

# ============================================================
# game_loop_render_and_timing
# ============================================================
ins(2628,
"; ===========================================================================",
"; game_loop_render_and_timing",
"; Rendering + timing portion of the per-frame cycle.",
";",
"; Rendering sequence:",
";   1. Shield/spell overlay active flag → shield_anim_active + shield_variant_index.",
";   2. If hero_sprite_hidden: clear hero viewport area.",
";   3. Sample_Neighborhood_Attributes — build attribute cache for viewport tiles.",
";   4. Healing potion timer: +8 HP/tick while active.",
";   5. Refresh_Dirty_Tiles — redraw tile changes to VRAM.",
";   6. If sprite_flash_flag: Active_Entity_Sprite_Renderer (enp/fman sprites).",
";",
"; Frame-rate timing:",
";   Wait until frame_timer >= speed_const*2, then continue:",
";   7. monsters_updates (second pass — commit sprite positions).",
";   8. Flush UI dirty element.",
";   9. update_and_render_projectile_row_pair.",
";   10. render_and_collision_pass_row.",
";   11. update_active_projectiles_render.",
";   12. apply_sword_hit_to_map_tiles.",
";   13. Render_Scrolling_Transition_Overlay.",
";   Wait again until frame_timer >= speed_const*4.",
";",
"; Post-render checks:",
";   - If hero HP == 0 and not invincible: process_hero_death.",
";   - Passive HP regen: +2 HP every 16 slow-intervals.",
";   - Boss death reward: update XP + almas when boss_is_dead fires.",
";   - Handle inventory (ENTER key) → bring_inventory_window.",
"; ===========================================================================",
)

# ============================================================
# screen_flash_overlay
# ============================================================
ins(2785,
"; ===========================================================================",
"; screen_flash_overlay",
"; Handles two overlay effects in the viewport buffer:",
";   byte_9EF0 path: wide panel flash (sign display area, 18 tiles wide × byte_9EF1 rows).",
";                   Fills viewport_buffer rows starting at row 2 with 0xFC/0xFE markers.",
";   byte_9EEF path: narrow 2-row flash (notification bar at rows 2-3, 26 tiles).",
";                   Used for item pickup notifications and boss-hit flash.",
"; Both flash effects decay after 0x1F ticks (byte_9EEE/byte_9EED counters).",
"; The 0xFC/0xFE tile IDs are special 'overlay' values recognized by the renderer.",
"; ===========================================================================",
)

# ============================================================
# bring_inventory_window
# ============================================================
ins(2846,
"; ===========================================================================",
"; bring_inventory_window",
"; Opens the inventory/equipment screen when ENTER is pressed.",
"; Preconditions: no active spell, no screen effect, not in intro animation.",
";",
"; 1. Play SFX 11.",
"; 2. swap_eai_and_inventory_code_regions: XOR-swap 0x800 words between",
";    the enemy AI region (0xA000) and inventory region (seg1:0xC000).",
";    This temporarily replaces the live AI code with select.bin code.",
"; 3. Call Monster_AI_proc (now actually select.bin Inventory_Screen_proc).",
"; 4. Swap back.",
"; 5. If byte_FF4B == 8 (save/load from inventory): jmp to resurrection code.",
"; 6. Reload magic spell sprites, clear viewport, reinit.",
"; ===========================================================================",
)

# ============================================================
# swap_eai_and_inventory_code_regions
# ============================================================
ins(2886,
"; ===========================================================================",
"; swap_eai_and_inventory_code_regions",
"; XOR-swaps 0x800 words (2KB each) between:",
";   - ES:0xA000 (eai{N}.bin enemy AI code, in CS segment)",
";   - ES:0xC000 (select.bin inventory code, in CS segment)",
"; After the swap: Monster_AI_proc at 0xA000 now runs the inventory screen.",
"; swap_eai_and_inventory_code_regions is idempotent (double-swap restores).",
"; ===========================================================================",
)

# ============================================================
# load_place_and_reinit
# ============================================================
ins(2904,
"; ===========================================================================",
"; load_place_and_reinit",
"; Called when boss_is_dead fires and the game needs to transition the cavern",
"; from boss mode back to post-boss state.",
";",
"; 1. Load boss AI binary (eai from mdt_descriptor.boss_ai) → 0xA000.",
"; 2. Load boss enp sprite group (from mdt_descriptor.enp_grp_idx).",
"; 3. Decompress boss monster tiles.",
"; 4. Clear is_boss_cavern flag.",
"; 5. Process optional initializers from MDT (list of word writes).",
"; 6. Update hero X position, recalculate door tile, call process_doors.",
"; 7. Reinit cavern display, jump back to Cavern_Game_Init.",
"; ===========================================================================",
)

# ============================================================
# clear_viewport_buffer
# ============================================================
ins(2997,
"; ===========================================================================",
"; clear_viewport_buffer",
"; Fills the 28×19 viewport_buffer (at 0xE900h) with 0xFD.",
"; 0xFD means 'undrawn tile' — forces a full redraw next render pass.",
"; ===========================================================================",
)

# ============================================================
# find_al_in_four_bytes_at_8020
# ============================================================
ins(3011,
"; ===========================================================================",
"; find_al_in_four_bytes_at_8020",
"; Searches for tile value AL in the 4-byte 'aggressive ground' list at",
"; seg1:8020h. These are the tile IDs that hurt the hero when stood upon",
"; (e.g., lava, spikes), set per-dungeon in the mpp?.grp descriptor.",
"; Returns: ZF=1 (match found) or NZ (AH=0xFF, no match).",
"; ===========================================================================",
)

# ============================================================
# render_notification_string
# ============================================================
ins(3039,
"; ===========================================================================",
"; render_notification_string",
"; Displays a short pickup/event notification in the centre of the screen.",
"; Input: DX → pointer to a Pascal-like length-prefixed string.",
"; Draws a bordered rectangle, then renders the text.",
"; Sets byte_9EEF=0xFF to trigger the 2-row flash overlay for 0x1F ticks.",
"; ===========================================================================",
)

# ============================================================
# render_cavern_signs
# ============================================================
ins(3065,
"; ===========================================================================",
"; render_cavern_signs",
"; Renders multi-line in-dungeon sign text.",
"; Input: SI → sign descriptor: [x_offset, num_lines, (x_delta, text...0xFF)...].",
"; Calls Render_Font_Glyph_proc for each character, '/' triggers newline.",
"; Draws a bordered rectangle sized to the text.",
"; ===========================================================================",
)

# ============================================================
# clear_hero_in_viewport
# ============================================================
ins(3133,
"; ===========================================================================",
"; clear_hero_in_viewport",
"; Erases the hero's 3×3 tile area in the viewport buffer by writing 0xFF.",
"; 0xFF is the 'hero slot' sentinel — tells the renderer to draw the hero",
"; sprite (fman.grp 24×24 px) at this position instead of a map tile.",
"; ===========================================================================",
)

# ============================================================
# step_on_aggressive_ground
# ============================================================
ins(3160,
"; ===========================================================================",
"; step_on_aggressive_ground",
"; Deals damage to the hero if standing on harmful tiles.",
"; Pirika shoes grant immunity.",
"; Scans the hero's bottom 2-3 rows (squatting: +1 row) by calling",
"; find_al_in_four_bytes_at_8020 on each tile.",
"; Also checks the tile directly under the hero centre.",
"; If any match: set hero_damage_this_frame, play SFX 9, deal damage.",
"; Damage table byte_7516: per cavern_level (1,1,4,8,20,20,20,20,20).",
"; ===========================================================================",
)

# ============================================================
# check_hero_contact_damage
# ============================================================
ins(3226,
"; ===========================================================================",
"; check_hero_contact_damage",
"; Per-frame check: does the hero overlap any live monster?",
"; Skipped in boss caverns while boss is actively attacking.",
";",
"; Scans a 4-tile column to the left and right of the hero (4 slots each).",
"; For each slot: calls get_monster_in_row_or_above (or loc_7651 when squatting).",
"; If monster found: calls apply_hit_from_left or apply_hit_from_right.",
";",
"; Results stored in word_9F0E/9F10 (knockback direction vectors).",
"; byte_9F14 set to 0xFF if any monster hit was recorded.",
"; Updates shield HP display if hit occurred.",
"; ===========================================================================",
)

# ============================================================
# apply_hit_from_left / apply_hit_from_right
# ============================================================
ins(3326,
"; ===========================================================================",
"; apply_hit_from_left / apply_hit_from_right",
"; Applies monster contact damage after determining shield blocking.",
";",
"; Shield blocks only when facing TOWARD the attacking monster:",
";   from_left: hero must face LEFT (facing_direction bit 0 = 1).",
";   from_right: hero must face RIGHT.",
"; Shield absorbs damage = base_damage / 2 / 2^(shield_tier).",
"; If shield_HP goes negative: destroy shield, then deal remaining damage.",
"; Without shield: full damage_hero + SFX 9.",
"; With shield: reduced damage_hero + SFX 8.",
"; ===========================================================================",
)

# ============================================================
# destroy_shield
# ============================================================
ins(3390,
"; ===========================================================================",
"; destroy_shield",
"; Clears shield_type to 0, wipes the shield HP bar area on HUD,",
"; draws a small bordered rectangle, shows 'Shield broken.' notification.",
"; ===========================================================================",
)

# ============================================================
# monsters_spawning
# ============================================================
ins(6949,
"; ===========================================================================",
"; monsters_spawning",
"; Main monster AI tick (called once per frame from main_update_render).",
"; Boss/Jashiin caverns: delegate entirely to Monster_AI_proc (eai binary).",
"; Regular caverns:",
";   Iterates the monsters_table (each 16-byte monster struct).",
";   For each monster:",
";     - Skip if high byte of currX == 0xFF (stationary item, not a creature).",
";     - Call HorizDistToHero_35: if monster is outside ±35 columns, skip.",
";     - Set m_x_rel = BL (relative X position in proximity window).",
";     - Write monster index | 0x80 to proximity map (primary + second layer).",
";     - If monster.state_flags bit 4: also stamp 2 rows below (big monster lower half).",
";     - If state_flags bit 5 is clear: call monster_activation (spawn check).",
";     - Else: increment monster.counter, call Monster_AI_proc on activation.",
";",
"; MONSTER TABLE ENTRY (16 bytes, monster struc from dungeon.inc):",
";   [0..1] currX     : absolute map X (0xFFFF = end of table)",
";   [2]    currY     : absolute map Y (0-63)",
";   [3]    m_x_rel   : relative X in proximity window (0-34), 0xFF = out of range",
";   [4]    flags     : monster type / behavior flags",
";   [5]    ai_flags  : AI state bits (bit6=spell-hit, bits4:0=spell-type)",
";   [6]    anim_counter",
";   [7]    state_flags: bit4=big monster, bit5=active-spawned, bit7=state-active",
";   [8..9] spwnX     : respawn X (0xFFFF = no respawn)",
";   [A]    spwnY     : respawn Y",
";   [B]    type_     : original type byte for respawn",
";   [C]    counter   : general purpose counter",
";   [D]    save_addr : savegame achievement address (for items)",
";   [E..F] ai_state/hp",
"; ===========================================================================",
)

# ============================================================
# place_monster_in_proximity_and_run_ai
# ============================================================
ins(7038,
"; ===========================================================================",
"; place_monster_in_proximity_and_run_ai",
"; Places a monster in the proximity map and optionally runs its AI.",
";",
"; 1. Converts currX/currY to proximity map address (coords_in_ax_to_proximity).",
"; 2. Processes the 'spell target' flag (ai_flags bit 6 → flags bit 5).",
"; 3. Reads proximity_second_layer[monster_index] and writes it to [di]",
";    (preserves any existing tile if second layer was occupied).",
"; 4. For big monsters (state_flags bit 4): also stamps [di + 2*36].",
";",
"; Item/monster type switch (flags bits 4:0):",
";   0x00-0x0F: regular monster → call Monster_AI_proc",
";   0x10 (flag_10): drop-item trigger (falling item / platform drop)",
";   0x11 (flag_11): projectile spawner (aims at hero Y, triggers shot at range)",
";   0x12 (flag_12): delay animation",
";   0x13 (flag_13): item pickup — contact collision check",
";   0x14/0x15/0x1B (flag_14): almas orb — falling, picked up on contact",
";     almas count: flags&0x0F: 4→1 almas, 5→10 almas, else→100 almas",
";   0x16 (flag_16): ordinary key pickup",
";   0x17 (flag_17): lion's head key pickup",
";   0x18 (flag_18): small potion (red) → healing_potion_timer += 0x0A",
";   0x19 (flag_19): large potion (blue) → healing_potion_timer += heroMaxHP/8",
";   0x1A (flag_1a): shoes pickup (Ruzeria/Pirika/Silkarn based on cavern_level-4)",
";   0x1B: see 0x14",
";   0x1C (flag_1c): dungeon sign → render_cavern_signs",
";   0x1D (flag_1d): hero's crest pickup",
";   0x1E (flag_1e): Feruza shoes pickup",
";   0x00-0x0F (default, flag_10 handled above): chest animation dispatch:",
";     chest sub-types: 50g / 100g / empty / 500g / 1000g / glory crest / enchantment sword",
";",
"; On item pickup (loc_914C): set currX high byte to 0xFF00 (mark as collected),",
"; optionally write the item's save achievement bitmask to savegame.",
";",
"; SPRITE NOTE: Items use enp?.grp 2×2 tiles. The frame to display is encoded",
"; in monster.flags low nibble or via ENP1_FRAMES lookup in grp_viewer.py.",
"; ===========================================================================",
)

# ============================================================
# hero_got_gold / hero_got_almas
# ============================================================
ins(7617,
"; ===========================================================================",
"; hero_got_gold / hero_got_almas",
"; Add gold or almas to hero totals, capped at 0xFFFF, redraw the HUD counter.",
"; ===========================================================================",
)

# ============================================================
# check_monster_aligned_to_hero_and_tick
# ============================================================
ins(7647,
"; ===========================================================================",
"; check_monster_aligned_to_hero_and_tick",
"; Returns NC (item can be picked up) only when:",
";   - hero_y_absolute matches one of 4 monster Y rows",
";   - hero_x_in_viewport is within ±2 of monster m_x_rel",
";   - monster state_flags bit 7 is SET (active/visible)",
";   - monster.counter counts up to bit 3 being set (throttles pickup rate)",
"; Returns CF (stc) when misaligned or inactive.",
"; ===========================================================================",
)

# ============================================================
# monster_move_* and collision routines
# ============================================================
ins(7710,
"; ===========================================================================",
"; move_monster_E / NE / N / NW / W / SW / S / SE",
"; Called by Monster_AI_proc (eai*.bin) to move a monster one step.",
";",
"; Each direction has a range check for m_x_rel (proximity column):",
";   E/NE/SE: allowed when m_x_rel <= 33 (keep inside right margin)",
";   W/NW/SW: allowed when m_x_rel >= 2  (keep inside left margin)",
";   N/S: allowed when m_x_rel is 1-34.",
"; Then calls the corresponding check_collision_X2 routine.",
"; If no collision: adjusts currX/currY (with map wrapping) and m_x_rel.",
";",
"; COORDINATE SYSTEM:",
";   +X = East (right), +Y = South (down) — same as screen.",
";   incrementX / decrementX: wrap at mapWidth.",
";   incrementY / decrementY: mask to 0x3F (map always 64 rows tall).",
"; ===========================================================================",
)

ins(7934,
"; ===========================================================================",
"; check_collision_E2 / W2 / N2 / S2 / NE2 / SE2 / NW2 / SW2",
"; Collision detection for a 2×2-tile monster footprint.",
";",
"; Each function checks a set of proximity map tiles in the direction of",
"; movement. Monster occupies tiles (0,0) and (1,0) (or (0,0),(0,1) for N/S).",
"; Returns CF=1 if any tile in the 'leading edge' is blocked.",
";",
"; Tile categorization for level 5 (wind-tunnel) caverns:",
";   - Airflow category 1 (left-flowing): blocks Westward movement (NC_can_pass_except_category1).",
";   - Airflow category 2 (right-flowing): blocks Eastward movement.",
";",
"; CF detection trick: OR multiple proximity bytes together,",
"; then 'add al, al' → shifts bit 7 into CF. If any byte had bit 7 set",
"; (= monster/item marker), CF fires — used as second-layer monster detection.",
"; ===========================================================================",
)

ins(8394,
"; ===========================================================================",
"; if_passable_set_ZF",
"; Core passability test used by monster collision checks.",
"; AL = tile value.",
";   AL >= 0x80: NZ (non-passable — monster or item marker)",
";   AL in 73-127: NZ (solid tile range)",
";   AL < 73: search the 24-byte passable list at seg1:8000h.",
";            ZF=1 if found (passable), NZ if not.",
"; Note: this is subtly different from is_non_blocking_tile_extended,",
"; which does NOT use the 73-based threshold (uses 0x40 and 0x49 variants).",
"; ===========================================================================",
)

ins(8423,
"; ===========================================================================",
"; monster_activation",
"; Spawns a monster from its spawn point when the hero comes close enough.",
"; Conditions for spawn:",
";   - Monster currX high byte == 0xFF (currently deactivated/item state).",
";   - spawn X != 0xFFFF (has a defined respawn point).",
";   - Within HorizDistToHero_35 range, and NOT at proximity left/right edge (bl 3..32).",
";   - Spawn Y within 24 rows of viewport_top_row_y.",
";   - Spawn position in proximity map has no existing monster (OR of 3×3 tiles).",
"; On spawn: copies spawnX → currX, spawnY → currY, type_ → flags, resets counters.",
"; Big monsters (state_flags bit 4): spawn as two consecutive table entries,",
"; placing second entry 2 rows below the first.",
"; ===========================================================================",
)

ins(8618,
"; ===========================================================================",
"; update_all_monsters_in_map",
"; Called once from init_cavern at room load (NOT per frame).",
"; Clears proximity_second_layer, iterates all monsters,",
"; stamps each in-range monster's index | 0x80 into the proximity map.",
"; Used to pre-populate the map with monsters before the main loop starts.",
"; ===========================================================================",
)

ins(8679,
"; ===========================================================================",
"; HorizDistToHero_35",
"; Computes horizontal distance from a given map X to the hero's",
"; proximity window left column, accounting for world wrap.",
"; Input: AX = monster X (absolute map coordinate).",
"; Output: BL = proximity-relative X (0-35); CF=1 if outside 35-column window.",
"; Returns: AX = 35 - relative_X (positive means in range; negated value).",
";",
"; World-wrap logic: if monster_x < proximity_left, check the distance",
"; going the 'long way round' (via mapWidth) to handle circular maps.",
"; ===========================================================================",
)

ins(8705,
"; ===========================================================================",
"; monster_split_or_die",
"; Called when a monster's HP drops to 0.",
"; Adds XP to hero (from death XP table at word_A008 indexed by flags&7).",
"; Sets monster flags |= 0x68 (death animation bits), clears AI flags.",
"; For big monsters: handles both top and bottom halves.",
"; Check_Vertical_Distance_Between_Hero_And_Monster:",
";   If dying monster is within 19 rows of viewport: play SFX 7 (death sound).",
"; ===========================================================================",
)

ins(8766,
"; ===========================================================================",
"; monster_move_in_direction / Check_collision_in_direction",
"; Public dispatch tables exported to AI binaries (eai*.bin).",
"; al = direction index 0-7 (0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE)",
"; counter-clockwise from East.",
"; monster_move_in_direction: calls the corresponding move_monster_X.",
"; Check_collision_in_direction: calls the corresponding check_collision_X2.",
"; ===========================================================================",
)

ins(8809,
"; ===========================================================================",
"; Move_Monster_NWE_Depending_On_Whats_Below",
"; Exported helper for AI: checks the tile BELOW the monster (y+1) for",
"; airflow direction. Calls move_monster_N/W/E accordingly (twice each).",
"; Used by flying/swimming monster AIs that follow air/water currents.",
"; Airflow categories: 0=Up → move N; 1=Left → move W; 2=Right → move E.",
"; ===========================================================================",
)

ins(8869,
"; ===========================================================================",
"; Check_Monster_Ids_Two_Rows_Below_Monster",
"; Exported helper for AI: checks the proximity map at monster position Y+2.",
"; Calls find_al_in_four_bytes_at_8020 to test if it is an 'aggressive'",
"; ground tile. Used by AIs to detect lava/spike floors for evasion.",
"; ===========================================================================",
)

ins(8887,
"; ===========================================================================",
"; Hero_Hits_monster",
"; Exported from fight.bin. Called by Monster_AI_proc when the AI decides",
"; the hero's sword has hit the monster.",
";",
"; 1. Reads ai_flags low 5 bits as 'stat index' → call Get_Stats.",
";    Stat index 0: damage = hero_level/2.",
";    Stat index 1: damage = sword_damage[type] + level/2 (doubled for downward thrust).",
";    Stat index 2-8: damage from byte_98BE table.",
"; 2. Deduct AH from monster.hp.",
"; 3. If HP > 0: SFX 6 (hit sound), return.",
"; 4. If HP <= 0: look up death_split_table to get split/death state.",
";    Random (0-3) selects split type, unless downward thrust (always 0).",
";    Write new state_flags for death animation → monster_split_or_die.",
"; ===========================================================================",
)

ins(8974,
"; ===========================================================================",
"; Get_Stats",
"; Returns hero combat statistics.",
"; al=0 → ah = hero_level/2 + 1 (basic defense stat)",
"; al=1 → ah = total sword damage:",
";          base = sword_damages[sword_type-1] (table: 1,2,4,8,32,127)",
";          + hero_level/2",
";          × (byte_E4+1)  [difficulty multiplier]",
";          × 2 if downward thrust (sword_hit_type==2)",
"; al=2..8 → ah = byte_98BE[al-2] (static stat table: 2,4,8,16,32,64,255)",
"; al=9 → NOP, return as-is",
"; ===========================================================================",
)

ins(9054,
"; ===========================================================================",
"; Find_Monsters_Near_Hero",
"; Exported from fight.bin. Counts nearby movable monsters.",
"; Iterates the monsters_table, for each non-item monster checks",
"; HorizDistToHero_35. Returns DL = count of monsters in range.",
"; Returns CF=1 if hero should die (monster aligned with dead hero position).",
"; Used by AI to trigger special hero-death interactions.",
"; ===========================================================================",
)

ins(9101,
"; ===========================================================================",
"; process_hero_death",
"; Hero death sequence.",
";",
"; Phase 1 — falling: calls airborne_movement in a loop until landed.",
"; Phase 2 — flashing: hero_animation_phase cycles 0→1→2 at 1/8 speed,",
";   while hero_sprite_hidden flickers at 1/2 speed after phase 2.",
"; Phase 3 — 30-frame fade: alternates show/hide then calls Fade_To_Black.",
";",
"; Post-death (first death):",
";   - XP += (127 - 2 × hero_level)",
";   - Gold reset to 0.",
";   - Almas halved.",
"; Post-death (already processed, i.e. no-XP death):",
";   - last_sage_visited = 0x80 (Felishika's Castle entry sage).",
"; Both: restore HP to heroMaxHp.",
";",
"; Resurrection: load the MDT for last_sage_visited town, restore hero_x",
"; from tear_x, load NPC sprites, transfer to town via transfer_to_town.",
"; ===========================================================================",
)

# ============================================================
# VFS TABLES
# ============================================================
ins(9274,
"; ===========================================================================",
"; VFS (Virtual File System) resource descriptor tables",
"; Each entry: [disk_id byte] [file_id byte] [filename string, null-terminated]",
"; Used by res_dispatcher_proc (fn2/fn3/fn5) to load/decompress assets.",
";",
"; fman.grp   — hero dungeon sprite sheet (24×24 px per frame, 3×3 tiles, mode 8)",
"; encnt.grp  — encounter intro animation (boss entry screen)",
"; roka.grp   — dungeon entrance decoration (28×18 tile map, animated palette)",
"; dchr.grp   — door and platform component tiles (8×8, mode 10)",
"; mman.grp   — male NPC town sprite sheet",
"; cman.grp   — female NPC town sprite sheet",
"; mpp1-b.grp — dungeon tilesets 1-11 (8×8 tiles, mode 10)",
";              Loaded to seg1:8000h as the current dungeon environment",
"; eai1-8.bin — enemy AI modules 1-8 (regular cavern AIs)",
"; crab/tako/tori/zela/meda/lega/drgn/akma/mao1/mao2.bin — boss AIs",
"; enp1-8.grp — monster/item sprite sheets 1-8 (16×16 px, 2×2 tiles, mode 11)",
"; crab/tako/tori/zela/meda/lega/drgn/akma/mao1/mao2.grp — boss sprite sheets",
"; mgt1-8.msd + ugm1-2.msd — dungeon background music tracks",
"; mus1-8.msd + mbos/mmao.msd — additional music (boss, town, etc.)",
"; ===========================================================================",
)

# ============================================================
# DATA SECTION
# ============================================================
ins(9484,
"; ===========================================================================",
"; PER-DUNGEON STATE VARIABLES",
"; These are zero-initialised at start and reset on dungeon transitions.",
"; Many are in the 0x9Exx-0x9Fxx range within the fight.bin segment.",
"; ===========================================================================",
)

ins(9492,
"; ---- Loaded GRP/BIN index cache (from last MDT) ----",
)

ins(9505,
"; ---- Map streaming pointers ----",
)

ins(9508,
"; ---- Hero movement state ----",
)

ins(9514,
"; ---- Knockback / hit vectors ----",
"; word_9F0E/9F10: X-component vectors for knockback (set by contact damage)",
)

ins(9516,
"; ---- Damage / invincibility ----",
)

ins(9519,
"; ---- Airflow ----",
)

ins(9523,
"; ---- Map / scroll ----",
)

ins(9527,
"; ---- Projectile tracking ----",
)

ins(9528,
"; ---- Ice slide state ----",
)

ins(9530,
"; ---- Input / animation state ----",
)

ins(9533,
"; ---- Temperature / cavern flags ----",
)

# Apply all insertions
result_lines = []
for i, line in enumerate(lines):
    lineno = i + 1
    if lineno in inserts:
        for comment in inserts[lineno]:
            result_lines.append(comment + '\n')
    result_lines.append(line)

with open('fight_commented.asm', 'w', encoding='utf-8') as f:
    f.writelines(result_lines)

print(f"Done. Output: {len(result_lines)} lines (original: {len(lines)})")
