

; ===========================================================================
; monster_activation
; Spawns a monster from its spawn point when the hero comes close enough.
; Conditions for spawn:
;   - Monster currX high byte == 0xFF (currently deactivated/item state).
;   - spawn X != 0xFFFF (has a defined respawn point).
;   - Within is_in_proximity_window range, and NOT at proximity left/right edge (bl 3..32).
;   - Spawn Y within 24 rows of viewport_top_row_y.
;   - Spawn position in proximity map has no existing monster (OR of 3×3 tiles).
; On spawn: copies spawnX → currX, spawnY → currY, type_ → flags, resets counters.
; Big monsters (state_flags bit 4): spawn as two consecutive table entries,
; placing second entry 2 rows below the first.
; ===========================================================================
monster_activation proc near  
                cmp     byte ptr [si+1], 0FFh ; monster x coord high byte
                jz      short loc_9506
                retn
; ---------------------------------------------------------------------------

loc_9506:        
                test    [si+monster.state_flags], 10h ; is big monster? (occupy 2 structs in table)
                jz      short loc_9513
                cmp     byte ptr [si+11h], 0FFh ; big monster's (second part) x coord high byte
                jz      short loc_9513
                retn
; ---------------------------------------------------------------------------

loc_9513:        
                mov     ax, [si+monster.spwnX]
                cmp     ax, 0FFFFh
                jnz     short loc_951C
                retn
; ---------------------------------------------------------------------------

loc_951C:        
                call    is_in_proximity_window ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                jnb     short loc_9522
                retn
; ---------------------------------------------------------------------------

loc_9522:        
                or      bl, bl
                jnz     short loc_9527
                retn
; ---------------------------------------------------------------------------

loc_9527:        
                cmp     bl, 35
                jnz     short loc_952D
                retn
; ---------------------------------------------------------------------------

loc_952D:        
                mov     al, ds:viewport_top_row_y
                sub     al, 2
                and     al, 3Fh         ; wrap y
                sub     al, [si+monster.spwnY]
                neg     al
                and     al, 3Fh         ; wrap y
                cmp     al, 24
                jnb     short loc_954A
                cmp     bl, 3
                jb      short loc_954A
                cmp     bl, 32
                jnb     short loc_954A
                retn
; ---------------------------------------------------------------------------

loc_954A:        
                test    [si+monster.state_flags], 10h
                jnz     short big_monster
                mov     [si+monster.m_x_rel], bl
                mov     al, [si+monster.spwnY]
                mov     ah, bl
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                push    di
                xchg    si, di
                sub     si, 37
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xor     al, al
                mov     cx, 3

loc_9569:        
                or      al, byte ptr [si+monster.currX]
                or      al, [si+1]   ; monster x coord high byte
                or      al, [si+monster.currY]
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                loop    loc_9569
                xchg    si, di
                pop     di
                or      al, al
                jns     short loc_9581
                retn
; ---------------------------------------------------------------------------

loc_9581:        
                mov     al, ds:monster_index
                or      al, 80h
                mov     [di], al
                mov     ax, [si+monster.spwnX]
                mov     [si], ax
                mov     al, [si+monster.spwnY]
                mov     [si+monster.currY], al
                mov     al, [si+monster.type_]
                mov     [si+monster.flags], al
                mov     [si+monster.anim_counter], 10h
                mov     [si+monster.ai_flags], 0
                mov     word ptr [si+monster.ai_state], 0
                mov     [si+monster.hp], 0
                mov     bl, ds:monster_index
                xor     bh, bh
                mov     byte ptr ds:proximity_second_layer[bx], 0 ; proximity map is designed to keep only one item
                                        ; at given address. So when we need to put other object,
                                        ; when position is already occupied by monster,
                                        ; we use second layer: 128 bytes of additional buffer
                                        ; (1 byte per monster id)
                retn
; ---------------------------------------------------------------------------

big_monster:     
                test    [si+monster.type_], 1
                jz      short big_type1
                retn
; ---------------------------------------------------------------------------

big_type1:       
                mov     [si+monster.m_x_rel], bl
                mov     [si+(monster.m_x_rel+10h)], bl
                mov     al, [si+monster.spwnY]
                mov     ah, bl
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                push    di
                xchg    si, di
                sub     si, 37
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xor     al, al
                mov     cx, 5

loc_95D9:        
                or      al, byte ptr [si+monster.currX]
                or      al, [si+1]
                or      al, [si+monster.currY]
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                loop    loc_95D9
                xchg    si, di
                pop     di
                or      al, al
                jns     short loc_95F1
                retn
; ---------------------------------------------------------------------------

loc_95F1:        
                mov     al, ds:monster_index
                or      al, 80h
                mov     [di], al
                xchg    si, di
                add     si, 72
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                inc     al
                mov     [di], al
                mov     ax, [si+monster.spwnX]
                mov     [si+monster.currX], ax
                mov     [si+(monster.x+10h)], ax
                mov     al, [si+monster.spwnY]
                mov     [si+monster.currY], al
                add     al, 2
                and     al, 3Fh
                mov     [si+(monster.currY+10h)], al
                mov     al, [si+monster.type_]
                mov     [si+monster.flags], al
                inc     al
                mov     [si+(monster.flags+10h)], al
                mov     [si+monster.anim_counter], 10h
                mov     [si+(monster.anim_counter+10h)], 10h
                mov     [si+monster.ai_flags], 0
                mov     [si+(monster.ai_flags+10h)], 0
                mov     word ptr [si+monster.ai_state], 0
                mov     word ptr [si+(monster.ai_state+10h)], 0
                mov     [si+monster.hp], 0
                mov     [si+(monster.hp+10h)], 0
                and     [si+(monster.state_flags+10h)], 0F0h
                mov     bl, ds:monster_index
                xor     bh, bh
                mov     word ptr ds:proximity_second_layer[bx], 0 ; proximity map is designed to keep only one item
                                        ; at given address. So when we need to put other object,
                                        ; when position is already occupied by monster,
                                        ; we use second layer: 128 bytes of additional buffer
                                        ; (1 byte per monster id)
                retn
monster_activation endp


; ===========================================================================
; update_all_monsters_in_map
; Called once from init_cavern at room load (NOT per frame).
; Clears proximity_second_layer, iterates all monsters,
; stamps each in-range monster's index | 0x80 into the proximity map.
; Used to pre-populate the map with monsters before the main loop starts.
; ===========================================================================
update_all_monsters_in_map proc near
                push    cs
                pop     es
                mov     di, offset proximity_second_layer ; proximity map is designed to keep only one item
                                        ; at given address. So when we need to put other object,
                                        ; when position is already occupied by monster,
                                        ; we use second layer: 128 bytes of additional buffer
                                        ; (1 byte per monster id)
                mov     cx, 80h
                xor     al, al
                rep stosb
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_9667:        
                mov     byte ptr ds:monster_index, 0
                mov     si, ds:monsters_table_addr

next_monster3:    
                mov     ax, [si+monster.currX]
                cmp     ax, 0FFFFh
                jnz     short loc_9678
                retn                    ; no more monsters
; ---------------------------------------------------------------------------

loc_9678:        
                cmp     ah, 0FFh
                jz      short loc_9698
                mov     [si+monster.m_x_rel], 0FFh
                call    is_in_proximity_window ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                jb      short loc_9698
                mov     [si+monster.m_x_rel], bl
                mov     al, [si+monster.currY]
                mov     ah, bl
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     al, ds:monster_index
                or      al, 80h
                mov     [di], al        ; put monster to map

loc_9698:        
                inc     byte ptr ds:monster_index
                add     si, 10h
                jmp     short next_monster3
update_all_monsters_in_map endp


; =============== S U B R O U T I N E =======================================

; * Calculates distance to hero and checks if within a 35-unit range.
;  * Accounts for world-wrapping (map edges).
;  * * @param monster_x The X coordinate of the monster (AX)
;  * @return Positive value (35 - distance) if in range,
;  * Sets Carry Flag (CF=1) if out of range.

; ===========================================================================
; is_in_proximity_window
; Computes horizontal distance from a given map X to the hero's
; proximity window left column, accounting for world wrap.
; Input: AX = monster X (absolute map coordinate).
; Output: BL = proximity-relative X (0-35); CF=1 if outside 35-column window.
; Returns: AX = 35 - relative_X (positive means in range; negated value).
;
; World-wrap logic: if monster_x < proximity_left, check the distance
; going the 'long way round' (via mapWidth) to handle circular maps.
; ===========================================================================
is_in_proximity_window proc near  
                mov     bx, ax          ; monster_x
                sub     ax, ds:proximity_map_left_col_x
                jnb     short loc_96BA
                mov     ax, 35
                sub     ax, bx
                jnb     short loc_96B1
                retn
; ---------------------------------------------------------------------------

loc_96B1:        
                mov     ax, ds:mapWidth
                sub     ax, ds:proximity_map_left_col_x
                add     ax, bx

loc_96BA:        
                xchg    ax, bx
                mov     ax, 35
                sub     ax, bx
                retn
is_in_proximity_window endp


; ===========================================================================
; monster_split_or_die
; Called when a monster's HP drops to 0.
; Adds XP to hero (from death XP table at word_A008 indexed by flags&7).
; Sets monster flags |= 0x68 (death animation bits), clears AI flags.
; For big monsters: handles both top and bottom halves.
; Check_Vertical_Distance_Between_Hero_And_Monster:
;   If dying monster is within 19 rows of viewport: play SFX 7 (death sound).
; ===========================================================================
monster_split_or_die proc near
                mov     al, [si+monster.flags]
                test    al, 10h
                jnz     short Check_Vertical_Distance_Between_Hero_And_Monster
                and     al, 0Fh
                mov     bx, 0A008h
                xlat
                xor     ah, ah
                call    update_hero_XP
                jmp     short $+2
; ---------------------------------------------------------------------------

Check_Vertical_Distance_Between_Hero_And_Monster:
                mov     [si+monster.anim_counter], 0
                or      [si+monster.flags], 68h
                and     [si+monster.ai_flags], 80h
                test    [si+monster.state_flags], 10h ; big monster?
                jz      short usual_monster
                test    [si+monster.flags], 1
                jnz     short usual_monster
                mov     [si+monster.anim_counter], 80h
                mov     [si+(monster.anim_counter+10h)], 0
                or      [si+(monster.flags+10h)], 68h
                and     [si+(monster.ai_flags+10h)], 80h

usual_monster:   
                mov     al, [si+monster.currY]
                mov     ah, ds:viewport_top_row_y
                dec     ah
                sub     al, ah
                and     al, 3Fh
                cmp     al, 19
                jb      short monster_close_to_hero_vertically_19
                retn
; ---------------------------------------------------------------------------

monster_close_to_hero_vertically_19:
                mov     byte ptr ds:soundFX_request, 7
                retn
monster_split_or_die endp


; =============== S U B R O U T I N E =======================================


update_hero_XP  proc near 
                add     ds:hero_xp, ax
                jb      short loc_971C
                retn
; ---------------------------------------------------------------------------

loc_971C:        
                mov     ds:hero_xp, 0FFFFh
                retn
update_hero_XP  endp


; =============== S U B R O U T I N E =======================================

; al=angle starting from right, counter-clockwise

; ===========================================================================
; monster_move_in_direction / Check_collision_in_direction
; Public dispatch tables exported to AI binaries (eai*.bin).
; al = direction index 0-7 (0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE)
; counter-clockwise from East.
; monster_move_in_direction: calls the corresponding move_monster_X.
; Check_collision_in_direction: calls the corresponding check_collision_X2.
; ===========================================================================
monster_move_in_direction proc near
                and     al, 7
                mov     bl, al
                xor     bh, bh
                add     bx, bx
                jmp     ds:funcs_972B[bx]
monster_move_in_direction endp

; ---------------------------------------------------------------------------
funcs_972B      dw offset move_monster_E
                dw offset move_monster_NE
                dw offset move_monster_N
                dw offset move_monster_NW
                dw offset move_monster_W
                dw offset move_monster_SW
                dw offset move_monster_S
                dw offset move_monster_SE

; =============== S U B R O U T I N E =======================================


Check_collision_in_direction proc near
                and     al, 7
                mov     bl, al
                xor     bh, bh
                add     bx, bx
                jmp     ds:funcs_9747[bx]
Check_collision_in_direction endp

; ---------------------------------------------------------------------------
funcs_9747      dw offset check_collision_E2
                dw offset check_collision_NE2
                dw offset check_collision_N2
                dw offset check_collision_NW2
                dw offset check_collision_W2
                dw offset check_collision_SW2
                dw offset check_collision_S2
                dw offset check_collision_SE2

; =============== S U B R O U T I N E =======================================

; si points to monster struc

; ===========================================================================
; Move_Monster_NWE_Depending_On_Whats_Below
; Exported helper for AI: checks the tile BELOW the monster (y+1) for
; airflow direction. Calls move_monster_N/W/E accordingly (twice each).
; Used by flying/swimming monster AIs that follow air/water currents.
; Airflow categories: 0=Up → move N; 1=Left → move W; 2=Right → move E.
; ===========================================================================
Move_Monster_NWE_Depending_On_Whats_Below proc near
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                xchg    di, si
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    di, si
                mov     cx, 2           ; monster occupies 2 tiles, so we check both tiles below monster

loc_976E:        
                push    cx
                push    si
                mov     al, [di]
                call    get_airflow_direction ; Is input tile an airflow?
                                        ; Input: al
                                        ; Output:
                                        ; NZ, cl=0xff (no airflow)
                                        ; ZF, cl=0 (Up), 1 (Left), 2 (Right)
                mov     bl, cl          ; category
                pop     si
                pop     cx
                jz      short loc_977F
                inc     di
                loop    loc_976E
                retn
; ---------------------------------------------------------------------------

loc_977F:        
                pop     ax
                xor     bh, bh
                add     bx, bx          ; switch 3 cases
                jmp     ds:jpt_9784[bx] ; switch jump
Move_Monster_NWE_Depending_On_Whats_Below endp

; ---------------------------------------------------------------------------
jpt_9784        dw offset category0_moveN
                dw offset category1_moveW
                dw offset category2_moveE
; ---------------------------------------------------------------------------

category2_moveE: 
                call    move_monster_E  ; jumptable 00009784 case 2
                jmp     move_monster_E
; ---------------------------------------------------------------------------

category1_moveW: 
                call    move_monster_W  ; jumptable 00009784 case 1
                jmp     move_monster_W
; ---------------------------------------------------------------------------

category0_moveN: 
                call    move_monster_N  ; jumptable 00009784 case 0
                jmp     move_monster_N


; ===========================================================================
; check_monster_on_aggressive_ground
; Exported helper for AI: checks the proximity map at monster position Y+2.
; Calls is_tile_al_aggressive_ground to test if it is an 'aggressive'
; ground tile. Used by AIs to detect lava/spike floors for evasion.
; ===========================================================================
check_monster_on_aggressive_ground proc near
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                xchg    si, di
                add     si, 2*36        ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                mov     al, [di]        ; monster_id
                jmp     is_tile_al_aggressive_ground
check_monster_on_aggressive_ground endp



; ===========================================================================
; Hero_Hits_monster
; Exported from fight.bin. Called by Monster_AI_proc when the AI decides
; the hero's sword has hit the monster.
;
; 1. Reads ai_flags low 5 bits as 'stat index' → call Get_Stats.
;    Stat index 0: damage = hero_level/2.
;    Stat index 1: damage = sword_damage[type] + level/2 (doubled for downward thrust).
;    Stat index 2-8: damage from byte_98BE table.
; 2. Deduct AH from monster.hp.
; 3. If HP > 0: SFX 6 (hit sound), return.
; 4. If HP <= 0: look up death_split_table to get split/death state.
;    Random (0-3) selects split type, unless downward thrust (always 0).
;    Write new state_flags for death animation → monster_split_or_die.
; ===========================================================================
Hero_Hits_monster proc near   
                mov     al, [si+monster.ai_flags]
                and     al, 1Fh
                call    Get_Stats       ; al=0: return ah=hero_level/2
                                        ; al=1: return ah=sword_total_damage
                                        ; al=2..8: return ah=byte_98BE[al-2]
                                        ; al=9: NOP
                mov     al, [si+monster.hp]
                sub     al, ah
                jbe     short loc_97CD
                mov     [si+monster.hp], al
                mov     byte ptr ds:soundFX_request, 6
                retn
; ---------------------------------------------------------------------------

loc_97CD:        
                test    [si+monster.flags], 1
                jnz     short loc_97D9
                test    [si+monster.state_flags], 10h ; big monster?
                jnz     short loc_9815

loc_97D9:        
                test    [si+monster.state_flags], 0Fh
                jz      short loc_97E2
                jmp     monster_split_or_die
; ---------------------------------------------------------------------------

loc_97E2:        
                mov     di, ds:death_split_table_ptr
                mov     bl, [si+monster.flags]
                and     bl, 7
                xor     bh, bh
                add     bx, bx
                mov     di, [bx+di]
                call    cs:get_random_proc
                mov     bl, al
                and     bx, 3
                cmp     byte ptr ds:sword_hit_type, 2
                jnz     short loc_9805
                xor     bx, bx

loc_9805:        
                mov     al, [bx+di]
                mov     ah, [si+monster.state_flags]
                and     ah, 0F0h
                or      al, ah
                mov     [si+monster.state_flags], al
                jmp     monster_split_or_die
; ---------------------------------------------------------------------------

loc_9815:        
                test    [si+(monster.state_flags+10h)], 0Fh
                jz      short loc_981E
                jmp     monster_split_or_die
; ---------------------------------------------------------------------------

loc_981E:        
                mov     di, ds:death_split_table_ptr
                mov     bl, [si+monster.flags]
                and     bl, 7
                xor     bh, bh
                add     bx, bx
                mov     di, [bx+di]
                call    cs:get_random_proc
                mov     bl, al
                and     bx, 3
                cmp     byte ptr ds:sword_hit_type, 2
                jnz     short loc_9841
                xor     bx, bx

loc_9841:        
                mov     al, [bx+di]
                mov     ah, [si+(monster.state_flags+10h)]
                and     ah, 0F0h
                or      al, ah
                mov     [si+(monster.state_flags+10h)], al
                jmp     monster_split_or_die
Hero_Hits_monster endp


; =============== S U B R O U T I N E =======================================

; al=0: return ah=hero_level/2
; al=1: return ah=sword_total_damage
; al=2..8: return ah=byte_98BE[al-2]
; al=9: NOP

; ===========================================================================
; Get_Stats
; Returns hero combat statistics.
; al=0 → ah = hero_level/2 + 1 (basic defense stat)
; al=1 → ah = total sword damage:
;          base = sword_damages[sword_type-1] (table: 1,2,4,8,32,127)
;          + hero_level/2
;          × (byte_E4+1)  [difficulty multiplier]
;          × 2 if downward thrust (sword_hit_type==2)
; al=2..8 → ah = byte_98BE[al-2] (static stat table: 2,4,8,16,32,64,255)
; al=9 → NOP, return as-is
; ===========================================================================
Get_Stats       proc near 
                mov     ah, ds:hero_level
                shr     ah, 1
                inc     ah
                or      al, al
                jnz     short loc_985E
                retn
; ---------------------------------------------------------------------------

loc_985E:        
                cmp     al, 1
                jz      short loc_9882
                mov     ah, ds:hero_level
                inc     ah
                add     ah, ah
                jb      short loc_9870
                add     ah, ah
                jnb     short loc_9872

loc_9870:        
                mov     ah, 0FFh

loc_9872:        
                cmp     al, 9
                jnz     short al_2_8
                retn
; ---------------------------------------------------------------------------

al_2_8:          
                sub     al, 2
                mov     bl, al
                xor     bh, bh
                mov     ah, ds:byte_98BE[bx]
                retn
; ---------------------------------------------------------------------------

loc_9882:        
                mov     bl, ds:sword_type
                dec     bl
                xor     bh, bh
                mov     al, ds:sword_damages[bx]
                mov     bl, ds:hero_level
                shr     bl, 1
                add     al, bl          ; base_damage[sword_type] + hero_level/2
                jb      short loc_98A4
                mov     cl, ds:byte_E4
                inc     cl
                mul     cl
                or      ah, ah
                jz      short loc_98A6

loc_98A4:        
                mov     al, 0FFh

loc_98A6:        
                mov     ah, al
                cmp     byte ptr ds:sword_hit_type, 2
                jz      short loc_98B0
                retn
; ---------------------------------------------------------------------------

loc_98B0:        
                add     ah, ah
                jb      short loc_98B5
                retn
; ---------------------------------------------------------------------------

loc_98B5:        
                mov     ah, 0FFh
                retn
Get_Stats       endp

; ---------------------------------------------------------------------------
sword_damages   db 1, 2, 4, 8, 32, 127
byte_98BE       db 2, 4, 8, 16, 32, 64, 255

; =============== S U B R O U T I N E =======================================

; Return dl: number of monsters found nearby

; ===========================================================================
; Find_Monsters_Near_Hero
; Exported from fight.bin. Counts nearby movable monsters.
; Iterates the monsters_table, for each non-item monster checks
; is_in_proximity_window. Returns DL = count of monsters in range.
; Returns CF=1 if hero should die (monster aligned with dead hero position).
; Used by AI to trigger special hero-death interactions.
; ===========================================================================
Find_Monsters_Near_Hero proc near
                xor     dl, dl
                mov     di, ds:monsters_table_addr

loc_98CB:        
                cmp     word ptr [di], 0FFFFh ; monsters end marker
                stc
                jnz     short loc_98D2
                retn
; ---------------------------------------------------------------------------

loc_98D2:        
                cmp     [di+monster.spwnX], 0FFFFh
                jnz     short loc_98ED
                cmp     byte ptr [di+1], 0FFh
                jz      short loc_98F4
                mov     ax, [di+monster.currX]
                push    dx
                call    is_in_proximity_window ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                pop     dx
                jnb     short loc_98ED
                test    [di+monster.flags], 10h
                jz      short loc_98FA

loc_98ED:        
                inc     dl              ; monsters counter
                add     di, 10h
                jmp     short loc_98CB
; ---------------------------------------------------------------------------

loc_98F4:        
                cmp     [di+monster.currY], 7Fh
                jz      short loc_98ED

loc_98FA:        
                clc                     ; error
                retn
Find_Monsters_Near_Hero endp


; ===========================================================================
; Hero death sequence.
;
; Phase 1 — falling: calls airborne_movement in a loop until landed.
; Phase 2 — flashing: hero_animation_phase cycles 0→1→2 at 1/8 speed,
;   while hero_sprite_hidden flickers at 1/2 speed after phase 2.
; Phase 3 — 30-frame fade: alternates show/hide then calls Fade_To_Black.
;
; Post-death (first death):
;   - XP += (127 - 2 × hero_level)
;   - Gold reset to 0.
;   - Almas halved.
; Post-death (already processed, i.e. no-XP death):
;   - last_sage_visited = 0x80 (Felishika's Castle entry sage).
; Both: restore HP to heroMaxHp.
;
; Resurrection: load the MDT for last_sage_visited town, restore hero_x
; from tear_x, load NPC sprites, transfer to town via transfer_to_town.
; ===========================================================================
process_hero_death proc near  
                call    cs:Flush_Ui_Element_If_Dirty_proc
                mov     byte ptr ds:sword_swing_flag, 0
                mov     byte ptr ds:jump_phase_flags, 0 ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     byte ptr ds:squat_flag, 0
                mov     byte ptr ds:hero_damage_this_frame, 0
                mov     byte ptr ds:invincibility_flag, 0FFh
                mov     ds:byte_9F28, 0
                mov     ds:byte_9F29, 0
                call    cs:Draw_Hero_Health_proc

repeat:          
                mov     byte ptr ds:hero_animation_phase, 0
                mov     byte ptr ds:on_rope_flags, 0 ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                mov     byte ptr ds:hero_sprite_hidden, 0
                call    main_update_render
                mov     ax, offset repeat
                push    ax
                call    airborne_movement
                pop     ax
                mov     byte ptr ds:hero_sprite_hidden, 0

loc_9948:        
                call    main_update_render
                mov     byte ptr ds:hero_sprite_hidden, 0
                cmp     byte ptr ds:hero_animation_phase, 2
                jz      short loc_9972
                inc     ds:byte_9F28
                test    ds:byte_9F28, 7
                jnz     short loc_9948
                mov     al, ds:hero_animation_phase
                inc     al
                and     al, 3
                cmp     al, 3
                jz      short loc_9948
                mov     ds:hero_animation_phase, al
                jmp     short loc_9948
; ---------------------------------------------------------------------------

loc_9972:        
                inc     ds:byte_9F29
                test    ds:byte_9F29, 0Fh
                jz      short loc_998B
                test    ds:byte_9F29, 1
                jz      short loc_9948
                mov     byte ptr ds:hero_sprite_hidden, 0FFh
                jmp     short loc_9948
; ---------------------------------------------------------------------------

loc_998B:        
                mov     byte ptr ds:byte_FF24, 8
                mov     cx, 30

loc_9993:        
                push    cx
                call    main_update_render
                pop     cx
                mov     al, cl
                and     al, 1
                dec     al
                mov     ds:hero_sprite_hidden, al
                loop    loc_9993
                mov     ax, 1  ; fn1 (Stop) - Silences all channels and halts the driver.
                int     60h             ; mscadlib.drv
                call    cs:Fade_To_Black_Dithered_proc
                test    byte ptr ds:is_death_already_processed, 0FFh
                jz      short loc_99BB
                mov     byte ptr ds:last_sage_visited, 80h
                jmp     short skip_death_math
; ---------------------------------------------------------------------------

loc_99BB:        
                mov     al, ds:hero_level
                add     al, al
                neg     al
                add     al, 127         ; xp += (127 - 2 * level)
                xor     ah, ah
                call    update_hero_XP
                mov     byte ptr ds:hero_gold_hi, 0
                mov     word ptr ds:hero_gold_lo, 0
                shr     word ptr ds:hero_almas, 1

skip_death_math: 
                mov     ax, ds:heroMaxHp
                mov     ds:hero_HP, ax
                jmp     short $+2
; ---------------------------------------------------------------------------

transit_to_sage:        
                mov     byte ptr ds:heartbeat_volume, 0
                mov     ah, ds:last_sage_visited ; resurrect in sage's hut
                mov     ds:place_map_id, ah
                mov     al, 1           ; fn1_load_mdt_idx_ah
                call    cs:res_dispatcher_proc
                mov     ax, ds:tear_x
                mov     ds:hero_x_in_proximity_map, ax
                mov     si, ds:mdt_buffer ; si=mdt_descr
                inc     si
                lodsb                   ; mman_grp_idx
                mov     bl, 11
                mul     bl
                add     ax, offset mman_grp
                mov     si, ax
                mov     es, cs:seg1
                mov     di, 4000h
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                mov     bx, 6002h       ; town_entry_disabling_edge_scroll
                jmp     transfer_to_town
process_hero_death endp
