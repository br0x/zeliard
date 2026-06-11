

; ===========================================================================
; is_tile_al_aggressive_ground
; Searches for tile value AL in the 4-byte 'aggressive ground' list at
; seg1:8020h. These are the tile IDs that hurt the hero when stood upon
; (e.g., lava, spikes), set per-dungeon in the mpp?.grp descriptor.
; Returns: ZF=1 (match found) or NZ (AH=0xFF, no match).
; ===========================================================================
is_tile_al_aggressive_ground proc near
                push    di
                mov     es, cs:seg1
                mov     di, offset aggressive_ground_list
                mov     cx, 4

loc_73CC:        
                mov     ah, es:[di]
                inc     di
                or      ah, ah
                jz      short loc_73DA
                cmp     ah, al
                je      short loc_73DE
                loop    loc_73CC

loc_73DA:        
                mov     ah, 0FFh
                or      ah, ah

loc_73DE:        
                pop     di
                retn
is_tile_al_aggressive_ground endp


; ===========================================================================
; render_notification_string
; Displays a short pickup/event notification in the centre of the screen.
; Input: DX → pointer to a Pascal-like length-prefixed string.
; Draws a bordered rectangle, then renders the text.
; Sets byte_9EEF=0xFF to trigger the 2-row flash overlay for 0x1F ticks.
; ===========================================================================
render_notification_string proc near    ; ...
                push    si
                push    dx
                mov     bx, 0E1Eh
                mov     cx, 3410h
                mov     al, 0FFh
                call    cs:Draw_Bordered_Rectangle_proc
                mov     ds:byte_9EED, 0
                mov     ds:byte_9EEF, 0FFh
                mov     ds:byte_9EEE, 0FFh
                pop     si
                lodsw
                add     ax, 3Ah ; ':'
                mov     bx, ax
                mov     cl, 22h ; '"'
                call    cs:Render_String_FF_Terminated_proc ; BX: starting x coord
                                        ; CL: starting y coord
                                        ; SI: string pointer
                pop     si
                retn
render_notification_string endp


; ===========================================================================
; render_cavern_signs
; Renders multi-line in-dungeon sign text.
; Input: SI → sign descriptor: [x_offset, num_lines, (x_delta, text...0xFF)...].
; Calls Render_Font_Glyph_proc for each character, '/' triggers newline.
; Draws a bordered rectangle sized to the text.
; ===========================================================================
render_cavern_signs proc near 
                lodsb
                add     al, 19h
                mov     cl, al
                push    cx
                lodsb
                push    si
                add     al, 2
                mov     ds:byte_9EF1, al
                mov     bl, 8
                mul     bl
                mov     bx, 1616h
                mov     ch, 24h ; '$'
                mov     cl, al
                mov     al, 0FFh
                call    cs:Draw_Bordered_Rectangle_proc
                pop     si
                mov     ds:byte_9EED, 0
                mov     ds:byte_9EEF, 0
                mov     ds:byte_9EEE, 0
                mov     ds:byte_9EF0, 0FFh
                mov     bx, 58h ; 'X'
                pop     cx

loc_7446:        
                mov     ds:word_9EF2, bx
                mov     ds:byte_9EF4, cl
                lodsb
                xor     ah, ah
                add     bx, ax

loc_7453:        
                lodsb
                cmp     al, 0FFh
                jnz     short loc_7459
                retn
; ---------------------------------------------------------------------------

loc_7459:        
                cmp     al, 2Fh ; '/'
                jz      short loc_746F
                mov     ah, 1
                push    cx
                push    bx
                push    si
                call    cs:Render_Font_Glyph_proc ; AL: ASCII character code
                                        ; AH: Palette/colour index
                                        ; BX: X pixel coordinate in framebuffer
                                        ; CX: Y pixel coordinate (row)
                                        ; CS:0xFF77: Flag: 0 = normal colour mode, nonzero = "bright/highlight" mode
                pop     si
                pop     bx
                pop     cx
                add     bx, 8
                jmp     short loc_7453
; ---------------------------------------------------------------------------

loc_746F:        
                mov     bx, ds:word_9EF2
                mov     cl, ds:byte_9EF4
                add     cl, 0Ch
                jmp     short loc_7446
render_cavern_signs endp


; ===========================================================================
; clear_hero_in_viewport
; Erases the hero's 3×3 tile area in the viewport buffer by writing 0xFF.
; 0xFF is the 'hero slot' sentinel — tells the renderer to draw the hero
; sprite (fman.grp 24×24 px) at this position instead of a map tile.
; ===========================================================================
clear_hero_in_viewport proc near
                mov     al, ds:hero_head_y_in_viewport
                mov     cl, 28
                mul     cl              ; ax=viewport_row_start
                mov     cl, ds:hero_x_in_viewport
                xor     ch, ch
                add     ax, cx
                add     ax, viewport_buffer_28x19
                mov     di, ax
                push    cs
                pop     es
                mov     al, 0FFh
                mov     cx, 3

three_tiles:     
                stosb                   ; hero occupies 3x3 bytes in viewport buffer
                stosb
                stosb
                add     di, 28-3
                loop    three_tiles
                retn
clear_hero_in_viewport endp


; ===========================================================================
; step_on_aggressive_ground
; Deals damage to the hero if standing on harmful tiles.
; Pirika shoes grant immunity.
; Scans the hero's bottom 2-3 rows (squatting: +1 row) by calling
; is_tile_al_aggressive_ground on each tile.
; Also checks the tile directly under the hero centre.
; If any match: set hero_damage_this_frame, play SFX 9, deal damage.
; Damage table byte_7516: per cavern_level (1,1,4,8,20,20,20,20,20).
; ===========================================================================
step_on_aggressive_ground proc near     ; ...
                cmp     byte ptr ds:current_accessory, SHOES_PIRIKA
                jnz     short no_pirika_shoes ; hero feets get hurting
                retn
; ---------------------------------------------------------------------------

no_pirika_shoes: 
                mov     ds:byte_9F17, 0
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                mov     cx, 3
                test    byte ptr ds:squat_flag, 0FFh
                jz      short loc_74C1
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                dec     cx

loc_74C1:        
                push    cx
                mov     cx, 3

three_times:     
                push    cx
                mov     al, [si]
                inc     si
                call    is_tile_al_aggressive_ground
                jnz     short loc_74D3
                mov     ds:byte_9F17, 0FFh

loc_74D3:        
                pop     cx
                loop    three_times
                add     si, 33          ; 36-3
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                pop     cx
                loop    loc_74C1
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jnz     short loc_74F3
                inc     si
                mov     al, [si]
                call    is_tile_al_aggressive_ground
                jnz     short loc_74F3
                mov     ds:byte_9F17, 0FFh

loc_74F3:        
                test    ds:byte_9F17, 0FFh
                jnz     short loc_74FB
                retn
; ---------------------------------------------------------------------------

loc_74FB:        
                mov     byte ptr ds:hero_damage_this_frame, 0FFh
                mov     byte ptr ds:soundFX_request, 9
                mov     bl, ds:cavern_level
                dec     bl
                xor     bh, bh
                mov     al, ds:byte_7516[bx]
                xor     ah, ah
                jmp     damage_hero     ; ax: damage level
step_on_aggressive_ground endp

; ---------------------------------------------------------------------------
byte_7516       db 1, 1, 4, 8, 20, 20, 20, 20, 20 ; ...

; ===========================================================================
; check_hero_contact_damage
; Per-frame check: does the hero overlap any live monster?
; Skipped in boss caverns while boss is actively attacking.
;
; Scans a 4-tile column to the left and right of the hero (4 slots each).
; For each slot: calls get_monster_in_row_or_above (or loc_7651 when squatting).
; If monster found: calls apply_hit_from_left or apply_hit_from_right.
;
; Results stored in word_9F0E/9F10 (knockback direction vectors).
; byte_9F14 set to 0xFF if any monster hit was recorded.
; Updates shield HP display if hit occurred.
; ===========================================================================
check_hero_contact_damage proc near     ; ...
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_752E
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_752E
                retn
; ---------------------------------------------------------------------------

loc_752E:        
                mov     ds:accumulated_contact_damage, 0
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                dec     si
                mov     di, offset word_9F0E
                mov     bx, offset loc_7651
                test    byte ptr ds:squat_flag, 0FFh
                jnz     short loc_754E
                mov     bx, offset get_monster_in_row_or_above
                sub     si, 36
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h

loc_754E:        
                push    bx
                push    di
                push    si
                call    bx ; get_monster_in_row_or_above
                sbb     al, al
                mov     [di], al
                jz      short loc_755C
                call    apply_hit_from_left

loc_755C:        
                pop     si
                pop     di
                pop     bx
                inc     si
                inc     di
                push    bx
                push    di
                push    si
                call    bx ; get_monster_in_row_or_above
                jb      short loc_756B
                call    get_monster_one_row_above

loc_756B:        
                sbb     al, al
                mov     [di], al
                jz      short loc_7574
                call    apply_hit_from_left

loc_7574:        
                pop     si
                pop     di
                pop     bx
                inc     si
                inc     di
                push    bx
                push    di
                push    si
                call    bx ; get_monster_in_row_or_above
                jb      short loc_7583
                call    get_monster_one_row_above

loc_7583:        
                sbb     al, al
                mov     [di], al
                jz      short loc_758C
                call    apply_hit_from_right

loc_758C:        
                pop     si
                pop     di
                pop     bx
                inc     si
                inc     di
                call    bx ; get_monster_in_row_or_above
                sbb     al, al
                mov     [di], al
                jz      short loc_759C
                call    apply_hit_from_right

loc_759C:        
                mov     di, offset word_9F0E
                mov     al, [di]
                or      al, [di+1]
                or      al, [di+2]
                or      al, [di+3]
                mov     ds:byte_9F14, al
                mov     ds:hero_damage_this_frame, al
                or      al, al
                jz      short locret_75B9
                call    cs:Print_ShieldHP_Decimal_proc

locret_75B9:     
                retn
check_hero_contact_damage endp


; ===========================================================================
; apply_hit_from_left / apply_hit_from_right
; Applies monster contact damage after determining shield blocking.
;
; Shield blocks only when facing TOWARD the attacking monster:
;   from_left: hero must face LEFT (facing_direction bit 0 = 1).
;   from_right: hero must face RIGHT.
; Shield absorbs damage = base_damage / 2 / 2^(shield_tier).
; If shield_HP goes negative: destroy shield, then deal remaining damage.
; Without shield: full damage_hero + SFX 9.
; With shield: reduced damage_hero + SFX 8.
; ===========================================================================
apply_hit_from_left proc near 
                test    byte ptr ds:invincibility_flag, 0FFh
                jz      short loc_75C2
                retn
; ---------------------------------------------------------------------------

loc_75C2:        
                mov     ax, ds:accumulated_contact_damage
                test    byte ptr ds:facing_direction, LEFT
                jz      short no_shield ; hero faced right (opposite direction) => shield useless
                jmp     short loc_75E2
apply_hit_from_left endp


apply_hit_from_right proc near
                test    byte ptr ds:invincibility_flag, 0FFh
                jz      short loc_75D6
                retn
; ---------------------------------------------------------------------------

loc_75D6:        
                mov     ax, ds:accumulated_contact_damage
                test    byte ptr ds:facing_direction, LEFT
                jnz     short no_shield ; hero faced left (opposite direction) => shield useless
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_75E2:        
                test    byte ptr ds:shield_type, 0FFh
                jz      short no_shield
                shr     ax, 1
                mov     cl, ds:shield_type
                inc     cl
                shr     cl, 1
                shr     ax, cl
                sub     ds:shield_HP, ax ; shield absorbs AX damage
                jb      short shield_destroyed
                jnz     short hero_absorbs_damage

shield_destroyed:
                push    ax
                call    destroy_shield
                mov     word ptr ds:shield_HP, 0
                pop     ax

hero_absorbs_damage:      
                call    damage_hero     ; ax: damage level
                mov     byte ptr ds:soundFX_request, 8
                retn
; ---------------------------------------------------------------------------

no_shield:       
                call    damage_hero     ; ax: damage level
                mov     byte ptr ds:soundFX_request, 9
                retn
apply_hit_from_right endp


; ===========================================================================
; destroy_shield
; Clears shield_type to 0, wipes the shield HP bar area on HUD,
; draws a small bordered rectangle, shows 'Shield broken.' notification.
; ===========================================================================
destroy_shield  proc near 
                mov     byte ptr ds:shield_type, 0
                mov     bx, 0C51Ch
                mov     al, 0FFh
                mov     ch, 18h
                call    cs:Clear_HUD_Bar_proc
                mov     bx, 3EA3h
                mov     cx, 511h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc
                mov     dx, offset shield_broken_str
                jmp     render_notification_string
destroy_shield  endp


; =============== S U B R O U T I N E =======================================


get_monster_in_row_or_above proc near
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags
                jb      short loc_764B
                test    al, 40h
                jnz     short loc_764B
                and     al, 0Fh
                jmp     short loc_7675
; ---------------------------------------------------------------------------

loc_764B:        
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h

loc_7651:        
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags
                jb      short get_monster_one_row_above
                test    al, 40h
                jnz     short get_monster_one_row_above
                and     al, 0Fh
                jmp     short loc_7675
get_monster_in_row_or_above endp


; =============== S U B R O U T I N E =======================================


get_monster_one_row_above proc near
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags
                cmc
                jb      short loc_766B
                retn
; ---------------------------------------------------------------------------

loc_766B:        
                clc
                test    al, 40h
                jz      short loc_7671
                retn
; ---------------------------------------------------------------------------

loc_7671:        
                and     al, 0Fh
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_7675:        
                mov     bl, al
                xor     bh, bh
                mov     al, ds:byte_A010[bx]
                xor     ah, ah
                add     ds:accumulated_contact_damage, ax
                stc
                retn
get_monster_one_row_above endp


; =============== S U B R O U T I N E =======================================

; ax: damage level

damage_hero     proc near 
                sub     ds:hero_HP, ax
                jnb     short loc_7691
                mov     word ptr ds:hero_HP, 0

loc_7691:        
                push    si
                call    cs:Draw_Hero_Health_proc
                pop     si
                retn
damage_hero     endp


; =============== S U B R O U T I N E =======================================


check_airflows_on_hero proc near
                mov     ds:air_up_tile_found, 0
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 2*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     cx, 3

check_across_hero_height: 
                push    cx
                call    dispatch_airflows
                sub     si, 36
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                pop     cx
                loop    check_across_hero_height
                retn
check_airflows_on_hero endp


; =============== S U B R O U T I N E =======================================


dispatch_airflows proc near   
                mov     al, [si]
                push    si
                call    get_airflow_direction ; Is input tile an airflow?
                                        ; Input: al
                                        ; Output:
                                        ; NZ, cl=0xff (no airflow)
                                        ; ZF, cl=0 (Up), 1 (Left), 2 (Right)
                pop     si
                jz      short airflow_detected
                retn
; ---------------------------------------------------------------------------

airflow_detected:
                pop     ax
                pop     ax
                mov     bl, cl
                xor     bh, bh
                add     bx, bx          ; switch 3 cases
                jmp     ds:airflows_table[bx] ; switch jump
dispatch_airflows endp

; ---------------------------------------------------------------------------
airflows_table  dw offset airflow_up
                dw offset airflow_left
                dw offset airflow_right
; ---------------------------------------------------------------------------

airflow_up:      
                call    move_hero_up
                call    move_hero_up
                mov     ds:air_up_tile_found, 0FFh
                mov     byte ptr ds:jump_phase_flags, 0 ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     byte ptr ds:hero_animation_phase, 80h
                retn
; ---------------------------------------------------------------------------

airflow_right:   
                call    move_hero_right_if_no_obstacles
                jmp     move_hero_right_if_no_obstacles
; ---------------------------------------------------------------------------

airflow_left:    
                call    move_hero_left_if_no_obstacles
                jmp     move_hero_left_if_no_obstacles

; =============== S U B R O U T I N E =======================================

; Is input tile an airflow?
; Input: al
; Output:
; NZ, cl=0xff (no airflow)
; ZF, cl=0 (Up), 1 (Left), 2 (Right)

get_airflow_direction proc near 
                or      al, al
                jz      short default
                mov     es, cs:seg1 ; 1ac5
                mov     bh, al
                xor     cl, cl          ; check for airflow Up
                mov     si, 8024h
                mov     bl, 4

category0_check_loop:     
                mov     al, es:[si]
                inc     si
                or      al, al
                jz      short category0_break_on_0
                cmp     al, bh
                jnz     short loc_7715
                retn                    ; found airflow Up
; ---------------------------------------------------------------------------

loc_7715:        
                dec     bl
                jnz     short category0_check_loop

category0_break_on_0:     
                inc     cl              ; check for airflow Left
                mov     si, 8028h
                mov     bl, 4

loc_7720:        
                mov     al, es:[si]
                inc     si
                or      al, al
                jz      short category1_break_on_0
                cmp     al, bh
                jnz     short loc_772D
                retn                    ; found airflow Left
; ---------------------------------------------------------------------------

loc_772D:        
                dec     bl
                jnz     short loc_7720

category1_break_on_0:     
                inc     cl              ; check for airflow Right
                mov     si, 802Ch
                mov     bl, 4

loc_7738:        
                mov     al, es:[si]
                inc     si
                or      al, al
                jz      short default
                cmp     al, bh
                jnz     short loc_7745
                retn                    ; found airflow Right
; ---------------------------------------------------------------------------

loc_7745:        
                dec     bl
                jnz     short loc_7738

default:         
                mov     cl, 0FFh
                or      cl, cl          ; NZ: no airflow, cl=0xff
                retn
get_airflow_direction endp


; =============== S U B R O U T I N E =======================================


update_boss_heartbeat_volume proc near
                mov     ax, ds:tear_x
                cmp     ax, 0FFFFh
                je      short distance_big
                call    is_in_proximity_window ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                jb      short distance_big
                mov     al, ds:hero_x_in_viewport
                add     al, 4
                mov     ah, al
                sub     al, bl
                jnb     short abs_al
                neg     al

abs_al:          
                mov     bh, al
                sub     bl, ah
                jnb     short abs_bl
                neg     bl

abs_bl:          
                cmp     bl, bh
                jb      short min_bl_bh
                mov     bl, bh

min_bl_bh:       
                mov     ds:delta_x, bl
                mov     bl, ds:tear_y
                mov     bh, ds:hero_y_absolute
                mov     al, bh
                sub     al, bl
                and     al, 3Fh         ; wrap y
                sub     bl, bh
                and     bl, 3Fh
                cmp     bl, al
                jb      short min_al_bl
                mov     bl, al

min_al_bl:       
                mov     ds:delta_y, bl  ; dy
                cmp     ds:delta_x, 16
                jnb     short distance_big
                mov     al, ds:delta_x  ; dx
                mov     bx, offset squares
                xlat
                mov     dl, al          ; dx^2
                cmp     ds:delta_y, 16
                jnb     short distance_big
                mov     al, ds:delta_y
                mov     bx, offset squares
                xlat                    ; dy^2
                add     al, dl          ; dx^2+dy^2
                jb      short distance_big ; dist^2 > 255
                mov     bx, offset distance_attenuation
                xlat
                mov     ds:heartbeat_volume, al
                retn
; ---------------------------------------------------------------------------

distance_big:    
                mov     byte ptr ds:heartbeat_volume, 0
                retn
update_boss_heartbeat_volume endp

; ---------------------------------------------------------------------------
squares         db 0, 1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225
distance_attenuation db 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Fh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh
                db 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Eh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh
                db 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Dh, 0Ch, 0Ch, 0Ch, 0Ch
                db 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch
                db 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ch, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah
                db 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah
                db 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 0Ah, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8
                db 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6
                db 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6
                db 6, 6, 6, 6, 6, 6, 6, 6

; =============== S U B R O U T I N E =======================================


restore_game    proc near 
                mov     bx, 601Ch       ; far jump address to the town code (restore_game)
                jmp     transfer_to_town
restore_game    endp
