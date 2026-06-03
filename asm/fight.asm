; ===========================================================================
; fight.asm — Zeliard dungeon (cavern) engine
;
; --------
; This module implements the entire dungeon gameplay loop:
;   - Dungeon init & map decompression (MDT format)
;   - Per-frame hero movement: walk, jump, squat, rope climb, slope slide
;   - Hero sword attacks (forward / overhead swing / downward thrust)
;   - Hero damage, shield absorption, knockback, death + respawn
;   - Monster proximity culling, AI dispatching, spawning
;   - Contact damage, projectile collision with hero
;   - Magic spell projectiles (Espada, Saeta, Fuego, Lanzar, Rascar, Agua, Guerra)
;   - Collectible items/keys/gold/potions picked up via monster flags
;   - Door/platform logic (dchr.grp tiles)
;   - Dungeon-to-town and dungeon-to-dungeon transitions
;   - Boss cavern HUD, Jashiin special-case startup
;
; COORDINATE SYSTEM
; -----------------
; The dungeon map is mapWidth × 64 tiles (64 rows always).
; A 36 × 64 'proximity map' (0xE000–0xE8FF) is a sliding window over the
; full map, centered ±18 tiles around the hero's X position.
; The 28 × 19 'viewport buffer' (0xE900h) is a sub-window for screen tiles.
; Both wrap circularly; wrap_map_from_above / wrap_map_from_below enforce this.
;
; SPRITE SUMMARY (for JS renderer)
; ----------------------------------
; fman.grp  — hero in dungeon: 3×3 grid of 8×8 px tiles (= 24×24 px per frame).
;             Hero frame is composed by layering the body, right hand, optional shield and sword.
;             Frame table stored at the start of the file (groups × 9 bytes).
;             Palette: PAL_DECODE_TABLES[0]; tile format: 32 bytes/tile (mode 8 in grp_viewer.py).
; dchr.grp  — doors (multi-tile composites) and platforms (8×8 px tiles, mode 10).
; mpp?.grp  — dungeon tileset for the current cavern (8×8 px tiles, mode 10).
;             Loaded to seg1:8000h. Layout metadata: tile_anim_count_table @ 8000h,
;             special_tile_list @ 8002h, animation replacements @ 8004h.
; enp?.grp  — monsters/items: 2×2 grid of 8×8 px tiles (= 16×16 px per frame).
;             Each frame: [palette_idx, tl, tr, bl, br] (mode 11).
;             Loaded to seg1:monster_gfx (4000h), transparency masks at A000h.
; crab.grp  — boss sprite (multi-part body, mode 12).
; All these GRP files are compressed with the custom unpack() scheme (method 0-7)
; documented in grp_viewer.py.
;
; MDT MAP FORMAT
; --------------
; Each dungeon map file (*.mdt) contains:
;   [mdt_descriptor] 7 bytes — see common.inc mdt_descriptor STRUC
;   [cavern data]  — map name string, monsters table, doors table, platforms
;   [packed map]   — column-run-length encoded tile map, 64 rows × mapWidth cols
;                    4 encoding cases based on high 2 bits of each byte.
;
; MONSTER TABLE FORMAT  (monster struc from dungeon.inc)
; -------------------------------------------------------
; Each entry is 16 bytes. The table ends with 0xFFFF.
; Flags byte distinguishes live monsters (AI-controlled) from static items
; (keys, potions, chests, almas, signs, shoes). Items have flags 0x10-0x1E.
; Big monsters (4×4 tiles) occupy 2 consecutive table entries.
; ===========================================================================

include common.inc
include dungeon.inc
                .286
                .model small

; Range: 6000h - 9F2Eh Loaded length: 3F2Eh
fight           segment byte public 'CODE'
                assume cs:fight, ds:fight
                org 6000h
; ===========================================================================
; EXPORT TABLE — call gate for external callers (town.bin, AI modules, etc.)
; Each entry is the offset of a callable function, indexed by slot number.
; Callers reach these via the fight.bin base address + slot*2.
; Slots are declared in common.inc as fight.bin equates.
; ===========================================================================
start:
                dw Cavern_Game_Init
                dw offset prepare_dungeon ; run from town to dungeon
                dw offset monster_move_in_direction ; al=angle starting from right, counter-clockwise
                dw offset Check_collision_in_direction
                dw offset move_monster_E
                dw offset move_monster_NE
                dw offset move_monster_N
                dw offset move_monster_NW
                dw offset move_monster_W
                dw offset move_monster_SW
                dw offset move_monster_S
                dw offset move_monster_SE
                dw offset check_collision_E2
                dw offset check_collision_W2
                dw offset check_collision_N2
                dw offset check_collision_S2
                dw offset check_collision_NE2
                dw offset check_collision_SE2
                dw offset check_collision_NW2
                dw offset check_collision_SW2
                dw offset coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                dw offset wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                dw offset wrap_map_from_below ; if (si < 0E000h) si += 900h
                dw offset if_passable_set_ZF
                dw offset check_monster_on_aggressive_ground
                dw offset Check_Vertical_Distance_Between_Hero_And_Monster
                dw offset Hero_Hits_monster
                dw offset HorizDistToHero_35 ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                dw offset Get_Stats     ; al=0: return ah=hero_level/2
                                        ; al=1: return ah=sword_total_damage
                                        ; al=2..8: return ah=byte_98BE[al-2]
                                        ; al=9: NOP
                dw offset Add_Projectile_To_Array ; In: BX pointing to projectile struct
                dw offset Browse_Projectiles
                dw offset Find_Monsters_Near_Hero ; Return dl: number of monsters found nearby
                dw offset Move_Monster_NWE_Depending_On_Whats_Below ; si points to monster struc


; ===========================================================================
; Logical sub-modules (all included into the single 'fight' segment)
; ===========================================================================
include f_init.inc
include f_h_move.inc
include f_h_phys.inc
include f_map.inc
include f_input.inc
include f_render.inc
include f_combat.inc
include f_doors.inc
include f_platf.inc
include f_proj.inc
include f_magic.inc
include f_m_spwn.inc
include f_m_move.inc
include f_m_core.inc
include f_data.inc

fight           ends

                end      start
