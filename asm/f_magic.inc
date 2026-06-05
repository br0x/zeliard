

; =============== S U B R O U T I N E =======================================


restore_bg_under_spirit_sprite proc near
                test    word ptr [si+spirit.s_vram_addr], 8000h
                jnz     short loc_86EB
                retn

loc_86EB:
                and     word ptr [si+spirit.s_vram_addr], 7FFFh
                mov     dx, [si+spirit.s_vram_addr]
                mov     ah, [si+spirit.s_screen_x]
                mov     al, [si+spirit.s_screen_y]
                jmp     restore_bg_tile_at_given_position
restore_bg_under_spirit_sprite endp


; =============== S U B R O U T I N E =======================================


monsters_updates proc near
                mov     si, offset spirit_sprite_0
                mov     cx, 4

next_spirit_:     
                push    cx
                cmp     [si+spirit.s_orbit_phase], 0FFh
                jz      short loc_873A
                mov     bl, [si+spirit.s_orbit_phase]
                add     bl, [si+spirit.s_orbit_speed]
                and     bl, 0Fh
                mov     [si+spirit.s_orbit_phase], bl
                xor     bh, bh
                add     bx, bx
                add     bx, offset circle ;
                                        ; ..345..
                                        ; .2...6.
                                        ; 1.....7
                                        ; 0.....8
                                        ; f.....9
                                        ; .e...a.
                                        ; ..dcb..
                mov     ah, ds:hero_x_in_viewport
                add     ah, [bx]
                mov     al, ds:hero_head_y_in_viewport
                add     al, [bx+1]
                add     al, ds:viewport_top_row_y
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                xchg    si, di
                sub     si, 37
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xchg    si, di
                call    spirit_sprite_place_in_proximity_rows

loc_873A:        
                add     si, 7
                pop     cx
                loop    next_spirit_
                retn
monsters_updates endp


; =============== S U B R O U T I N E =======================================


spirit_sprite_place_in_proximity_rows proc near
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_8750
                test    byte ptr ds:boss_is_dead, 0FFh
                jz      short loc_8750
                retn
; ---------------------------------------------------------------------------

loc_8750:        
                call    proximity_cell_inject_spell_target
                inc     di
                call    proximity_cell_inject_spell_target
                xchg    si, di
                add     si, 35
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                call    proximity_cell_inject_spell_target
                inc     di
spirit_sprite_place_in_proximity_rows endp


; =============== S U B R O U T I N E =======================================


proximity_cell_inject_spell_target proc near
                test    byte ptr [si+2], 0FFh
                jnz     short loc_876C
                retn
; ---------------------------------------------------------------------------

loc_876C:        
                xchg    si, di
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags
                xchg    si, di
                jnb     short loc_8776
                retn
; ---------------------------------------------------------------------------

loc_8776:        
                test    byte ptr [bx+4], 20h
                jz      short loc_877D
                retn
; ---------------------------------------------------------------------------

loc_877D:        
                test    byte ptr [bx+5], 20h
                jz      short loc_8784
                retn
; ---------------------------------------------------------------------------

loc_8784:        
                and     byte ptr [bx+5], 0E0h
                or      byte ptr [bx+5], 49h
                dec     byte ptr [si+2]
                retn
proximity_cell_inject_spell_target endp

; ---------------------------------------------------------------------------
;   ..345..
;   .2...6.
; ⊙.1.....7
;   0.....8
;   f.....9
;   .e...a.
;   ..dcb..
                ;    y x
circle          dw  0102h ; 0   
                dw  0002h ; 1
                dw 0FF03h ; 2
                dw 0FE04h ; 3
                dw 0FE05h ; 4
                dw 0FE06h ; 5
                dw 0FF07h ; 6
                dw  0008h ; 7
                dw  0108h ; 8
                dw  0208h ; 9
                dw  0307h ; a
                dw  0406h ; b
                dw  0405h ; c
                dw  0404h ; d
                dw  0303h ; e
                dw  0202h ; f

; =============== S U B R O U T I N E =======================================


magic_spell_fire_handler proc near
                test    byte ptr ds:current_magic_spell, 0FFh
                jnz     short loc_87B8
                retn
; ---------------------------------------------------------------------------

loc_87B8:        
                test    byte ptr ds:spell_active_flag, 0FFh
                jnz     short loc_87F1
                test    byte ptr ds:altkey_latch, 0FFh
                jnz     short loc_87C7
                retn
; ---------------------------------------------------------------------------

loc_87C7:        
                mov     byte ptr ds:spacebar_latch, 0
                mov     byte ptr ds:altkey_latch, 0
                test    byte ptr ds:sword_swing_flag, 0FFh
                jz      short loc_87D9
                retn
; ---------------------------------------------------------------------------

loc_87D9:        
                test    byte ptr ds:byte_FF3E, 0FFh
                jz      short loc_87E1
                retn
; ---------------------------------------------------------------------------

loc_87E1:        
                mov     ds:byte_9F2B, 0
                mov     byte ptr ds:spell_active_flag, 0FFh
                mov     byte ptr ds:soundFX_request, 23
                retn
; ---------------------------------------------------------------------------

loc_87F1:        
                add     ds:byte_9F2B, 2
                cmp     ds:byte_9F2B, 4
                jz      short loc_880B
                cmp     ds:byte_9F2B, 6
                jnb     short loc_8805
                retn
; ---------------------------------------------------------------------------

loc_8805:        
                mov     byte ptr ds:spell_active_flag, 0
                retn
; ---------------------------------------------------------------------------

loc_880B:        
                mov     bl, ds:current_magic_spell  ; 1..7
                dec     bl
                xor     bh, bh
                test    byte ptr ds:spells_espada[bx], 0FFh
                jnz     short loc_881B
                retn
; ---------------------------------------------------------------------------

loc_881B:        
                dec     byte ptr ds:spells_espada[bx]
                call    cs:Print_Magic_Left_Decimal_proc
                mov     byte ptr ds:soundFX_request, 24
                mov     si, offset magic_projectiles
                mov     byte ptr ds:byte_FF3E, 0FFh
                mov     bl, ds:current_magic_spell
                dec     bl  ; 0..6
                xor     bh, bh
                add     bx, bx
                jmp     ds:funcs_883B[bx]
magic_spell_fire_handler endp

; ---------------------------------------------------------------------------
funcs_883B      dw offset init_magic_projectile ; espada
                dw offset init_magic_projectile ; saeta
                dw offset init_magic_projectile ; fuego
                dw offset init_magic_projectile ; lanzar
                dw offset init_rascar
                dw offset init_agua
                dw offset init_guerra

; =============== S U B R O U T I N E =======================================


init_magic_projectile proc near 
                mov     al, ds:facing_direction
                not     al
                and     al, 1
                mov     [si+magic_projectile.mp_dir], al
                mov     al, ds:squat_flag
                and     al, 1
                add     al, ds:hero_head_y_in_viewport
                add     al, ds:viewport_top_row_y
                and     al, 3Fh
                mov     [si+magic_projectile.mp_y_rel], al
                mov     al, ds:hero_x_in_viewport
                add     al, 4
                mov     ah, [si+magic_projectile.mp_dir]
                not     ah
                and     ah, 1
                add     al, ah
                xor     ah, ah
                add     ax, ds:proximity_map_left_col_x
                cmp     ax, ds:mapWidth
                jb      short loc_8888
                sub     ax, ds:mapWidth

loc_8888:        
                mov     [si+magic_projectile.mp_x_rel], ax
                mov     byte ptr [si+magic_projectile.mp_vram_addr_tile00+1], 0
                mov     byte ptr [si+magic_projectile.mp_vram_addr_tile10+1], 0
                mov     byte ptr [si+magic_projectile.mp_vram_addr_tile01+1], 0
                mov     byte ptr [si+magic_projectile.mp_vram_addr_tile11+1], 0
                mov     [si+magic_projectile.mp_life_timer], 0
                mov     [si+magic_projectile.mp_anim_frame], 0
                mov     word ptr [si+16], 0FFFFh ; terminate
                retn
init_magic_projectile endp


; =============== S U B R O U T I N E =======================================


init_rascar     proc near 
                mov     cx, 4

four_beams_of_rascar:     
                push    cx
                mov     al, 6
                mul     cl
                add     ax, 2
                add     ax, ds:proximity_map_left_col_x
                cmp     ax, ds:mapWidth
                jb      short loc_88C1
                sub     ax, ds:mapWidth

loc_88C1:        
                mov     [si], ax
                call    cs:get_random_proc
                and     al, 3
                mov     ah, ds:viewport_top_row_y
                sub     ah, 3
                sub     ah, al
                and     ah, 3Fh
                mov     [si+2], ah
                mov     byte ptr [si+9], 0
                mov     byte ptr [si+0Bh], 0
                mov     byte ptr [si+0Dh], 0
                mov     byte ptr [si+0Fh], 0
                mov     byte ptr [si+4], 0
                mov     byte ptr [si+5], 0
                add     si, 10h
                pop     cx
                loop    four_beams_of_rascar
                retn
init_rascar     endp


; =============== S U B R O U T I N E =======================================


init_agua       proc near 
                push    si
                mov     cx, 3

loc_88FC:        
                push    cx
                call    init_magic_projectile
                add     si, 10h
                pop     cx
                loop    loc_88FC
                pop     si
                sub     byte ptr [si+2], 2
                and     byte ptr [si+2], 3Fh
                add     byte ptr [si+12h], 2
                and     byte ptr [si+12h], 3Fh
                retn
init_agua       endp


; =============== S U B R O U T I N E =======================================


init_guerra     proc near 
                mov     ds:byte_9EED, 0FFh
                mov     ds:byte_9EEE, 0FFh
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_8930
                test    byte ptr ds:boss_being_hit, 0FFh
                jnz     short loc_8954

loc_8930:        
                mov     si, ds:viewport_left_top_addr
                sub     si, 36          ; up from hero
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     cx, 19

rows_19:         
                push    cx
                mov     cx, 36

columns_36:      
                push    cx
                test    byte ptr [si], 80h
                jz      short loc_894A
                call    mark_proximity_monster_as_spell_target

loc_894A:        
                inc     si
                pop     cx
                loop    columns_36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                pop     cx
                loop    rows_19

loc_8954:        
                mov     byte ptr ds:byte_FF3E, 0
                mov     byte ptr ds:soundFX_request, 25
                call    cs:Render_Viewport_Border_Walls_proc
                mov     byte ptr ds:altkey_latch, 0
                call    clear_viewport_buffer
                jmp     main_update_render
init_guerra     endp


; =============== S U B R O U T I N E =======================================


update_active_projectiles_render proc near ; ...
                mov     si, offset magic_projectiles
                mov     cx, 4

next_magic_projectile:    
                cmp     [si+magic_projectile.mp_x_rel], 0FFFFh
                jnz     short loc_897A
                retn
; ---------------------------------------------------------------------------

loc_897A:        
                push    cx
                call    projectile_erase_old_tiles
                cmp     byte ptr [si+1], 0FFh
                jnz     short loc_898B
                mov     [si+magic_projectile.mp_x_rel], 0FFFFh
                jmp     loc_8A2B
; ---------------------------------------------------------------------------

loc_898B:        
                mov     bl, [si+magic_projectile.mp_anim_frame]
                add     bl, bl
                add     bl, bl
                xor     bh, bh
                mov     al, ds:current_magic_spell
                dec     al
                add     al, al
                xor     ah, ah
                mov     di, offset sequences0
                test    [si+magic_projectile.mp_dir], 0FFh
                jnz     short loc_89A9
                mov     di, offset sequences1

loc_89A9:        
                add     di, ax
                mov     di, [di]
                add     di, bx
                mov     ax, [si+magic_projectile.mp_x_rel]
                call    HorizDistToHero_35 ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                jb      short loc_8A2B
                mov     [si+magic_projectile.mp_cached_x_offset_tiles], bl
                mov     al, [si+magic_projectile.mp_y_rel]
                sub     al, ds:viewport_top_row_y
                and     al, 3Fh
                mov     [si+magic_projectile.mp_cached_y_offset], al
                mov     bh, al
                xchg    bh, bl
                push    si
                add     si, 8
                mov     bp, offset byte_8C79
                mov     cx, 4

loc_89D3:        
                push    cx
                push    bx
                push    bp
                add     bh, ds:[bp+0]
                mov     al, bh
                sub     al, 4
                cmp     al, 28
                jnb     short outside_viewport
                inc     bp
                add     bl, ds:[bp+0]
                and     bl, 3Fh
                cmp     bl, 18
                jnb     short outside_viewport
                mov     al, [di]   ; tile index to render
                push    di
                push    ax
                mov     ax, bx
                push    ax
                call    proximity_map_coords_to_viewport_offset ; AL: proximity map relative y
                                        ; AH: proximity map relative x
                                        ; Return: address in DI
                pop     ax
                cmp     byte ptr [di], 0FFh
                jz      short loc_8A1E
                cmp     byte ptr [di], 0FCh
                jz      short loc_8A1E
                call    cs:Viewport_Coords_To_Screen_Addr_proc ; AL: y
                                        ; AH: x
                                        ; Returns video memory address in DI
                or      di, 8000h
                mov     [si], di
                and     di, 7FFFh
                pop     ax
                push    si
                call    cs:Uncompress_And_Render_Tile_proc ; AL: tile index
                                        ; DI: screen address
                pop     si
                pop     di
                jmp     short outside_viewport
; ---------------------------------------------------------------------------

loc_8A1E:        
                pop     ax
                pop     di

outside_viewport:
                pop     bp
                inc     si
                inc     si
                inc     di
                inc     bp
                inc     bp
                pop     bx
                pop     cx
                loop    loc_89D3
                pop     si

loc_8A2B:        
                add     si, 16
                pop     cx
                loop    next_magic_projectile_
                jmp     short locret_8A36
; ---------------------------------------------------------------------------

next_magic_projectile_:   
                jmp     next_magic_projectile
; ---------------------------------------------------------------------------

locret_8A36:     
                retn
update_active_projectiles_render endp


; =============== S U B R O U T I N E =======================================


projectile_erase_old_tiles proc near
                test    word ptr [si+magic_projectile.mp_vram_addr_tile00], 8000h
                jz      short loc_8A51
                and     word ptr [si+magic_projectile.mp_vram_addr_tile00], 7FFFh
                mov     dx, [si+magic_projectile.mp_vram_addr_tile00]
                mov     ah, [si+magic_projectile.mp_cached_x_offset_tiles]
                mov     al, [si+magic_projectile.mp_cached_y_offset]
                push    si
                call    restore_bg_tile_at_given_position
                pop     si

loc_8A51:        
                test    word ptr [si+magic_projectile.mp_vram_addr_tile10], 8000h
                jz      short loc_8A6D
                and     word ptr [si+magic_projectile.mp_vram_addr_tile10], 7FFFh
                mov     dx, [si+magic_projectile.mp_vram_addr_tile10]
                mov     ah, [si+magic_projectile.mp_cached_x_offset_tiles]
                inc     ah
                mov     al, [si+magic_projectile.mp_cached_y_offset]
                push    si
                call    restore_bg_tile_at_given_position
                pop     si

loc_8A6D:        
                test    word ptr [si+magic_projectile.mp_vram_addr_tile01], 8000h
                jz      short loc_8A8B
                and     word ptr [si+magic_projectile.mp_vram_addr_tile01], 7FFFh
                mov     dx, [si+magic_projectile.mp_vram_addr_tile01]
                mov     ah, [si+magic_projectile.mp_cached_x_offset_tiles]
                mov     al, [si+magic_projectile.mp_cached_y_offset]
                inc     al
                and     al, 3Fh
                push    si
                call    restore_bg_tile_at_given_position
                pop     si

loc_8A8B:        
                test    word ptr [si+magic_projectile.mp_vram_addr_tile11], 8000h
                jnz     short loc_8A93
                retn
; ---------------------------------------------------------------------------

loc_8A93:        
                and     word ptr [si+magic_projectile.mp_vram_addr_tile11], 7FFFh
                mov     dx, [si+magic_projectile.mp_vram_addr_tile11]
                mov     ah, [si+magic_projectile.mp_cached_x_offset_tiles]
                inc     ah
                mov     al, [si+magic_projectile.mp_cached_y_offset]
                inc     al
                and     al, 3Fh
                push    si
                call    restore_bg_tile_at_given_position
                pop     si
                retn
projectile_erase_old_tiles endp


; =============== S U B R O U T I N E =======================================


dispatch_spell_projectile_movement proc near
                test    byte ptr ds:byte_FF3E, 0FFh
                jnz     short loc_8AB5
                retn
; ---------------------------------------------------------------------------

loc_8AB5:        
                mov     si, offset magic_projectiles
                mov     bl, ds:current_magic_spell
                dec     bl
                xor     bh, bh
                add     bx, bx
                jmp     ds:funcs_8AC2[bx]
dispatch_spell_projectile_movement endp

; ---------------------------------------------------------------------------
funcs_8AC2      dw offset espada_move
                dw offset saeta_move
                dw offset fuego_move
                dw offset saeta_move
                dw offset rascar_move
                dw offset agua_move
                dw offset locret_8B9C

; =============== S U B R O U T I N E =======================================


espada_move     proc near 
                test    [si+magic_projectile.mp_dir], 80h
                jz      short loc_8ADD
                jmp     loc_8BB5
; ---------------------------------------------------------------------------

loc_8ADD:        
                inc     [si+magic_projectile.mp_life_timer]
                cmp     [si+magic_projectile.mp_life_timer], 5  ; espada lives 5 ticks
                jb      short espada_alive
                jmp     loc_8BB5
; ---------------------------------------------------------------------------

espada_alive:        
                call    sub_8BC2
                call    monster_is_in_spawn_range_and_clear
                jnb     short loc_8AF2
                retn
; ---------------------------------------------------------------------------

loc_8AF2:        
                or      [si+magic_projectile.mp_dir], 80h
                retn
espada_move     endp


; =============== S U B R O U T I N E =======================================


saeta_move      proc near 
                inc     [si+magic_projectile.mp_life_timer]
                cmp     [si+magic_projectile.mp_life_timer], 0Ah
                jb      short loc_8B03
                jmp     loc_8BB5
; ---------------------------------------------------------------------------

loc_8B03:        
                call    sub_8BC2
                jmp     monster_is_in_spawn_range_and_clear
saeta_move      endp


; =============== S U B R O U T I N E =======================================


fuego_move      proc near 
                inc     [si+magic_projectile.mp_life_timer]
                cmp     [si+magic_projectile.mp_life_timer], 0Ch
                jb      short loc_8B15
                jmp     loc_8BB5
; ---------------------------------------------------------------------------

loc_8B15:        
                cmp     [si+magic_projectile.mp_life_timer], 4
                jnb     short loc_8B20
                call    loc_8BD0
                jmp     short loc_8B61
; ---------------------------------------------------------------------------

loc_8B20:        
                and     [si+magic_projectile.mp_anim_frame], 3
                inc     [si+magic_projectile.mp_anim_frame]
                cmp     [si+magic_projectile.mp_life_timer], 3
                jz      short loc_8B61
                mov     ax, [si+magic_projectile.mp_x_rel]
                call    HorizDistToHero_35 ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                jb      short loc_8B61
                cmp     bl, 33
                jnb     short loc_8B61
                mov     ah, bl
                mov     al, [si+magic_projectile.mp_y_rel]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                xchg    si, di
                add     si, 72
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                mov     al, [di]
                call    is_non_blocking_tile ; ZF if can pass
                jnz     short loc_8B61
                mov     al, [di+1]
                call    is_non_blocking_tile ; ZF if can pass
                jnz     short loc_8B61
                inc     [si+magic_projectile.mp_y_rel]
                and     [si+magic_projectile.mp_y_rel], 3Fh

loc_8B61:        
                jmp     monster_is_in_spawn_range_and_clear
fuego_move      endp


; =============== S U B R O U T I N E =======================================


rascar_move     proc near 
                inc     [si+magic_projectile.mp_life_timer]
                cmp     [si+magic_projectile.mp_life_timer], 0Ch
                jnb     short loc_8B9D
                mov     cx, 4

loc_8B70:        
                push    cx
                add     [si+magic_projectile.mp_y_rel], 2
                and     [si+magic_projectile.mp_y_rel], 3Fh
                call    monster_is_in_spawn_range_and_clear
                add     si, 10h
                pop     cx
                loop    loc_8B70
                retn
rascar_move     endp


; =============== S U B R O U T I N E =======================================


agua_move       proc near 
                inc     [si+magic_projectile.mp_life_timer]
                cmp     [si+magic_projectile.mp_life_timer], 0Ah
                jnb     short loc_8BA5
                mov     cx, 3

loc_8B8F:        
                push    cx
                call    sub_8BC2
                call    monster_is_in_spawn_range_and_clear
                add     si, 10h
                pop     cx
                loop    loc_8B8F

locret_8B9C:     
                retn
; ---------------------------------------------------------------------------

loc_8B9D:        
                mov     byte ptr [si+30h], 0
                mov     byte ptr [si+31h], 0FFh

loc_8BA5:        
                mov     byte ptr [si+20h], 0
                mov     byte ptr [si+21h], 0FFh
                mov     byte ptr [si+10h], 0
                mov     byte ptr [si+11h], 0FFh

loc_8BB5:        
                mov     byte ptr [si], 0
                mov     byte ptr [si+1], 0FFh
                mov     byte ptr ds:byte_FF3E, 0
                retn
agua_move       endp


; =============== S U B R O U T I N E =======================================


sub_8BC2        proc near 
                mov     al, [si+magic_projectile.mp_anim_frame]
                inc     al
                cmp     al, 3
                jb      short loc_8BCD
                xor     al, al

loc_8BCD:        
                mov     [si+magic_projectile.mp_anim_frame], al

loc_8BD0:        
                mov     ax, [si+magic_projectile.mp_x_rel]
                mov     bl, [si+magic_projectile.mp_dir]
                and     bx, 1
                add     bx, bx
                add     bx, bx
                dec     bx
                dec     bx
                add     ax, bx
                or      ax, ax
                jns     short loc_8BEA
                add     ax, ds:mapWidth
                jmp     short loc_8BF4
; ---------------------------------------------------------------------------

loc_8BEA:        
                cmp     ax, ds:mapWidth
                jb      short loc_8BF4
                sub     ax, ds:mapWidth

loc_8BF4:        
                mov     [si], ax
                retn
sub_8BC2        endp


; =============== S U B R O U T I N E =======================================


monster_is_in_spawn_range_and_clear proc near ; ...
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_8C07
                test    byte ptr ds:boss_being_hit, 0FFh
                stc
                jz      short loc_8C07
                retn
; ---------------------------------------------------------------------------

loc_8C07:        
                mov     ax, [si+magic_projectile.mp_x_rel]
                call    HorizDistToHero_35 ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                jnb     short loc_8C0F
                retn
; ---------------------------------------------------------------------------

loc_8C0F:        
                mov     ah, bl
                sub     bl, 2
                cmp     bl, 20h ; ' '
                cmc
                jnb     short loc_8C1B
                retn
; ---------------------------------------------------------------------------

loc_8C1B:        
                mov     al, [si+magic_projectile.mp_y_rel]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                push    si
                xchg    di, si
                sub     si, 37
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     ds:byte_9F2A, 0
                mov     cx, 3

loc_8C32:        
                push    cx
                mov     cx, 3

loc_8C36:        
                push    cx
                call    mark_proximity_monster_as_spell_target
                pop     cx
                inc     si
                loop    loc_8C36
                add     si, 33
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                pop     cx
                loop    loc_8C32
                pop     si
                mov     al, ds:byte_9F2A
                add     al, al
                cmc
                retn
monster_is_in_spawn_range_and_clear endp


; =============== S U B R O U T I N E =======================================


mark_proximity_monster_as_spell_target proc near
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags
                jnb     short loc_8C55
                retn
; ---------------------------------------------------------------------------

loc_8C55:        
                test    al, 20h
                jz      short loc_8C5A
                retn
; ---------------------------------------------------------------------------

loc_8C5A:        
                test    [bx+monster.ai_flags], 20h
                jz      short loc_8C61
                retn
; ---------------------------------------------------------------------------

loc_8C61:        
                mov     al, [bx+monster.ai_flags]
                or      al, 40h
                and     al, 0E0h
                mov     ah, ds:current_magic_spell
                inc     ah
                or      al, ah
                mov     [bx+monster.ai_flags], al
                mov     ds:byte_9F2A, 0FFh
                retn
mark_proximity_monster_as_spell_target endp
