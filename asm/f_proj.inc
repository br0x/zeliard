

; =============== S U B R O U T I N E =======================================


update_and_render_projectile_row_pair proc near
                mov     si, offset projectiles_array

loc_8369:        
                cmp     byte ptr [si+projectile.p_x_rel], 0FFh
                jnz     short loc_836F
                retn
; ---------------------------------------------------------------------------

loc_836F:        
                push    si
                call    flush_dirty_projectile
                pop     si
                mov     al, [si+projectile.p_x_rel]
                mov     [si+projectile.p_cached_x_rel], al
                sub     al, 4
                cmp     al, 28
                jnb     short loc_83D2
                mov     al, [si+projectile.p_y_rel]
                sub     al, ds:viewport_top_row_y
                and     al, 3Fh
                cmp     al, 12h
                jnb     short loc_83D2
                mov     [si+projectile.p_cached_y_rel], al
                mov     ah, [si+projectile.p_cached_x_rel]
                push    ax
                call    proximity_map_coords_to_viewport_offset ; AL: proximity map relative y
                                        ; AH: proximity map relative x
                                        ; Return: address in DI
                pop     ax
                cmp     byte ptr [di], 0FFh
                jz      short loc_83CD
                cmp     byte ptr [di], 0FCh
                jz      short loc_83CD
                call    cs:Viewport_Coords_To_Screen_Addr_proc ; AL: y
                                        ; AH: x
                                        ; Returns video memory address in DI
                or      di, 8000h
                mov     [si+projectile.p_vram_addr_d], di
                mov     al, [si+projectile.p_base_tile_idx]
                mov     bl, al
                rol     bl, 1
                rol     bl, 1
                and     bx, 3
                mov     bl, ds:masks[bx]
                and     bl, [si+projectile.p_trajectory_step_count]
                add     al, bl
                and     al, 3Fh
                and     di, 7FFFh
                call    cs:Uncompress_And_Render_Tile_proc ; AL: tile index
                                        ; DI: screen address

loc_83CD:
                add     si, 13          ; size of a projectile struct
                jmp     short loc_8369

loc_83D2:
                mov     byte ptr [si], 0
                jmp     short loc_83CD
update_and_render_projectile_row_pair endp

; ---------------------------------------------------------------------------
masks           db 0, 1, 11b, 111b 

; =============== S U B R O U T I N E =======================================


Browse_Projectiles proc near  
                mov     si, offset projectiles_array ; example:
                                        ; 1E 19 2B 00 0F 04 28 00 00 00 00 00 00

loc_83DE:        
                cmp     [si+projectile.p_x_rel], 0FFh
                jz      short no_projectiles
                push    si
                call    flush_dirty_projectile
                pop     si
                add     si, 13
                jmp     short loc_83DE
; ---------------------------------------------------------------------------

no_projectiles:  
                mov     byte ptr ds:projectiles_array, 0FFh
                retn
Browse_Projectiles endp


; =============== S U B R O U T I N E =======================================


flush_dirty_projectile proc near
                test    [si+projectile.p_vram_addr_d], 8000h
                jnz     short loc_83FB
                retn
; ---------------------------------------------------------------------------

loc_83FB:        
                and     [si+projectile.p_vram_addr_d], 7FFFh
                mov     dx, [si+projectile.p_vram_addr_d]
                mov     al, [si+projectile.p_cached_y_rel]
                mov     ah, [si+projectile.p_cached_x_rel]
flush_dirty_projectile endp


; =============== S U B R O U T I N E =======================================


restore_bg_tile_at_given_position proc near
                push    ax
                call    proximity_map_coords_to_viewport_offset ; AL: proximity map relative y
                                        ; AH: proximity map relative x
                                        ; Return: address in DI
                pop     ax
                cmp     byte ptr [di], 0FCh
                jb      short loc_8414
                retn
; ---------------------------------------------------------------------------

loc_8414:        
                add     al, ds:viewport_top_row_y
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     al, [di]
                jmp     cs:Cached_Tile_Drawer_proc ; AL: Tile Index
restore_bg_tile_at_given_position endp  ; DX: Screen destination


; =============== S U B R O U T I N E =======================================


projectiles_collision_processing proc near
                mov     si, offset projectiles_array
                mov     di, offset projectiles_array
                push    cs
                pop     es
                mov     ds:last_projectile_index, 0

next_projectile: 
                mov     al, [si+projectile.p_x_rel]
                or      al, al
                jnz     short loc_843C
                test    [si+projectile.p_vram_addr_d], 8000h
                jz      short loc_846A

loc_843C:        
                inc     al
                jnz     short loc_8444
                mov     [di+projectile.p_x_rel], 0FFh
                retn
; ---------------------------------------------------------------------------

loc_8444:        
                inc     [si+projectile.p_trajectory_step_count]
                push    es
                push    di
                call    sub_846F
                pop     di
                pop     es
                push    si
                mov     cx, 13
                rep movsb
                pop     si
                test    [si+projectile.p_trajectory_dir], 40h
                jnz     short loc_8466
                mov     al, [si+projectile.p_trajectory_step_count]
                cmp     al, [si+projectile.p_max_step_count]
                jb      short loc_8466
                mov     [si+projectile.p_x_rel], 0

loc_8466:        
                inc     ds:last_projectile_index

loc_846A:        
                add     si, 13
                jmp     short next_projectile
projectiles_collision_processing endp


; =============== S U B R O U T I N E =======================================


sub_846F        proc near 
                call    projectile_advance_position
                test    [si+projectile.p_trajectory_dir], 8
                jnz     short loc_8490
                mov     ah, [si+projectile.p_x_rel]
                or      ah, ah
                jnz     short loc_847F
                retn
; ---------------------------------------------------------------------------

loc_847F:        
                mov     al, [si+projectile.p_y_rel]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     al, [di]
                call    is_non_blocking_tile_extended
                jz      short loc_8490
                mov     [si+projectile.p_x_rel], 0
                retn
; ---------------------------------------------------------------------------

loc_8490:        
                mov     al, ds:viewport_top_row_y
                add     al, ds:hero_head_y_in_viewport
                test    byte ptr ds:squat_flag, 0FFh
                jnz     short loc_84A5
                and     al, 3Fh
                cmp     al, [si+projectile.p_y_rel]
                jz      short loc_84B4

loc_84A5:        
                mov     cx, 2

loc_84A8:        
                inc     al
                and     al, 3Fh
                cmp     al, [si+projectile.p_y_rel]
                jz      short loc_84B4
                loop    loc_84A8
                retn
; ---------------------------------------------------------------------------

loc_84B4:        
                mov     al, ds:hero_x_in_viewport
                add     al, 4
                test    byte ptr ds:facing_direction, 1
                jz      short loc_84C2
                inc     al

loc_84C2:        
                cmp     al, [si+projectile.p_x_rel]
                jz      short loc_84CD
                inc     al
                cmp     al, [si+projectile.p_x_rel]
                jz      short loc_84CD
                retn
; ---------------------------------------------------------------------------

loc_84CD:        
                mov     [si+projectile.p_x_rel], 0
                test    byte ptr ds:shield_type, 0FFh
                jz      short loc_850E
                test    byte ptr ds:sword_swing_flag, 0FFh
                jnz     short loc_850E
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jnz     short loc_850E
                mov     al, [si+projectile.p_trajectory_dir]
                and     al, 7
                cmp     al, 2
                jz      short loc_850E
                cmp     al, 6
                jz      short loc_850E
                or      al, al
                jz      short loc_8507
                cmp     al, 1
                jz      short loc_8507
                cmp     al, 7
                jz      short loc_8507
                test    byte ptr ds:facing_direction, 1
                jnz     short loc_850E
                jmp     short loc_854F
; ---------------------------------------------------------------------------

loc_8507:        
                test    byte ptr ds:facing_direction, 1
                jnz     short loc_854F

loc_850E:        
                mov     al, [si+projectile.p_damage]
                xor     ah, ah
                call    damage_hero     ; ax: damage level
                mov     byte ptr ds:soundFX_request, 9
                mov     al, 0FFh
                mov     ds:byte_9F14, al
                mov     ds:hero_damage_this_frame, al
                mov     bx, 0FFFFh
                mov     cx, 0FFFFh
                mov     al, [si+projectile.p_trajectory_dir]
                and     al, 7
                cmp     al, 2
                jz      short loc_8546
                cmp     al, 6
                jz      short loc_8546
                xor     bx, bx
                or      al, al
                jz      short loc_8546
                cmp     al, 1
                jz      short loc_8546
                cmp     al, 7
                jz      short loc_8546
                xchg    cx, bx

loc_8546:        
                mov     ds:word_9F0E, cx
                mov     ds:word_9F10, bx
                retn
; ---------------------------------------------------------------------------

loc_854F:        
                cmp     byte ptr ds:shield_type, SHIELD_HONOR
                jnb     short loc_856D
                mov     al, ds:hero_head_y_in_viewport
                add     al, ds:viewport_top_row_y
                inc     al
                test    byte ptr ds:squat_flag, 0FFh
                jz      short loc_8568
                inc     al

loc_8568:        
                call    projectile_y_vs_hero_row_dispatch
                jb      short loc_850E

loc_856D:        
                mov     byte ptr ds:soundFX_request, 10
                retn
sub_846F        endp


; =============== S U B R O U T I N E =======================================


projectile_y_vs_hero_row_dispatch proc near
                mov     bl, [si+projectile.p_trajectory_dir]
                and     bx, 7
                add     bx, bx
                and     al, 3Fh
                jmp     ds:funcs_857D[bx]
projectile_y_vs_hero_row_dispatch endp

; ---------------------------------------------------------------------------
funcs_857D      dw offset check_y_eq_projectile_row
                dw offset check_prev_y_eq_projectile_row
                dw offset check_prev_y_eq_projectile_row
                dw offset check_prev_y_eq_projectile_row
                dw offset check_y_eq_projectile_row
                dw offset check_next_y_eq_projectile_row
                dw offset check_next_y_eq_projectile_row
                dw offset check_next_y_eq_projectile_row

; =============== S U B R O U T I N E =======================================


check_y_eq_projectile_row proc near
                cmp     al, [si+projectile.p_y_rel]
                jnz     short loc_8597
                retn
; ---------------------------------------------------------------------------

loc_8597:        
                stc
                retn
check_y_eq_projectile_row endp


; =============== S U B R O U T I N E =======================================


check_prev_y_eq_projectile_row proc near
                dec     al
                and     al, 3Fh
                jmp     short check_y_eq_projectile_row
check_prev_y_eq_projectile_row endp


; =============== S U B R O U T I N E =======================================


check_next_y_eq_projectile_row proc near
                inc     al
                and     al, 3Fh
                jmp     short check_y_eq_projectile_row
check_next_y_eq_projectile_row endp


; =============== S U B R O U T I N E =======================================


projectile_advance_position proc near
                test    [si+projectile.p_trajectory_dir], 40h
                jz      short loc_85B1
                call    projectile_read_curved_path_step
                jnb     short loc_85B1
                retn
; ---------------------------------------------------------------------------

loc_85B1:        
                mov     bl, [si+projectile.p_trajectory_dir] ; trajectory type
                and     bx, 7
                add     bx, bx
                call    ds:funcs_85B9[bx]
                and     [si+projectile.p_y_rel], 3Fh
                retn
projectile_advance_position endp

; ---------------------------------------------------------------------------
funcs_85B9      dw offset incX
                dw offset decY
                dw offset decY__
                dw offset decY_
                dw offset decX
                dw offset decX_incY
                dw offset incY
                dw offset incX_incY

; =============== S U B R O U T I N E =======================================


decY            proc near 
                dec     [si+projectile.p_y_rel]
decY            endp


; =============== S U B R O U T I N E =======================================


incX            proc near 
                inc     [si+projectile.p_x_rel]
                retn
incX            endp


; =============== S U B R O U T I N E =======================================


incX_incY       proc near 
                inc     [si+projectile.p_y_rel]
                inc     [si+projectile.p_x_rel]
                retn
incX_incY       endp


; =============== S U B R O U T I N E =======================================


decY_           proc near 
                dec     [si+projectile.p_y_rel]
decY_           endp


; =============== S U B R O U T I N E =======================================


decX            proc near 
                dec     [si+projectile.p_x_rel]
                retn
decX            endp


; =============== S U B R O U T I N E =======================================


decX_incY       proc near 
                inc     [si+projectile.p_y_rel]
                dec     [si+projectile.p_x_rel]
                retn
decX_incY       endp


; =============== S U B R O U T I N E =======================================


incY            proc near 
                inc     [si+projectile.p_y_rel]
                retn
incY            endp


; =============== S U B R O U T I N E =======================================


decY__          proc near 
                dec     [si+projectile.p_y_rel]
                retn
decY__          endp


; =============== S U B R O U T I N E =======================================


projectile_read_curved_path_step proc near
                mov     bl, [si+projectile.p_trajectory_step_count]
                xor     bh, bh
                mov     di, [si+projectile.p_curved_path_data_ptr]
                mov     al, [bx+di]
                cmp     al, 0FFh
                jnz     short loc_8607
                mov     byte ptr [si+80h], 0
                stc
                retn
; ---------------------------------------------------------------------------

loc_8607:        
                and     al, 7
                and     [si+projectile.p_trajectory_dir], 0F8h
                or      [si+projectile.p_trajectory_dir], al
                retn
projectile_read_curved_path_step endp


; =============== S U B R O U T I N E =======================================

; In: BX pointing to projectile struct

Add_Projectile_To_Array proc near
                cmp     ds:last_projectile_index, 31 ; max 32 projectiles
                jb      short loc_8619
                retn
; ---------------------------------------------------------------------------

loc_8619:        
                push    si
                push    cs
                pop     es
                mov     si, bx
                mov     di, offset projectiles_array

find_array_end:  
                cmp     byte ptr [di], 0FFh
                jz      short found_end_marker
                add     di, 13
                jmp     short find_array_end
; ---------------------------------------------------------------------------

found_end_marker:
                mov     cx, 13
                rep movsb               ; add new projectile to array
                mov     al, 0FFh        ; set end marker
                stosb
                inc     ds:last_projectile_index
                pop     si
                retn
Add_Projectile_To_Array endp


; =============== S U B R O U T I N E =======================================


every_projectile_moves_left_in_viewport proc near
                mov     si, offset projectiles_array

next_projectile_: 
                mov     al, [si+projectile.p_x_rel]
                cmp     al, 0FFh
                jnz     short loc_8643
                retn
; ---------------------------------------------------------------------------

loc_8643:        
                or      al, al
                jz      short loc_8649
                dec     [si+projectile.p_x_rel]

loc_8649:        
                add     si, 13
                jmp     short next_projectile_
every_projectile_moves_left_in_viewport endp


; =============== S U B R O U T I N E =======================================


every_projectile_moves_right_in_viewport proc near
                mov     si, offset projectiles_array

next_projectile__: 
                mov     al, [si+projectile.p_x_rel]
                cmp     al, 0FFh
                jnz     short loc_8658
                retn
; ---------------------------------------------------------------------------

loc_8658:        
                or      al, al
                jz      short loc_865E
                inc     [si+projectile.p_x_rel]

loc_865E:        
                add     si, 13
                jmp     short next_projectile__
every_projectile_moves_right_in_viewport endp


; =============== S U B R O U T I N E =======================================

; AL: proximity map relative y
; AH: proximity map relative x
; Return: address in DI

proximity_map_coords_to_viewport_offset proc near
                and     al, 3Fh         ; clamp y
                mov     bl, ah          ; proximity map relative x
                mov     bh, 28          ; viewport width
                mul     bh              ; ax=row offset in viewport buffer
                sub     bl, 4           ; viewport relative x
                xor     bh, bh
                add     ax, bx
                mov     di, ax
                add     di, viewport_buffer_28x19
                retn
proximity_map_coords_to_viewport_offset endp


; =============== S U B R O U T I N E =======================================


render_and_collision_pass_row proc near
                mov     si, offset spirit_sprite_0
                mov     cx, 4

next_spirit:
                push    cx
                cmp     byte ptr [si], 0FFh
                jz      short loc_86DC
                call    restore_bg_under_spirit_sprite
                test    byte ptr [si+2], 0FFh
                jnz     short loc_8693
                mov     byte ptr [si], 0FFh
                jmp     short loc_86DC

loc_8693:
                mov     bl, [si]
                and     bl, 0Fh
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
                mov     [si+spirit.s_screen_x], ah
                mov     al, ds:hero_head_y_in_viewport
                add     al, [bx+1]
                and     al, 3Fh
                mov     [si+spirit.s_screen_y], al
                push    ax
                call    proximity_map_coords_to_viewport_offset ; AL: proximity map relative y
                                        ; AH: proximity map relative x
                                        ; Return: address in DI
                pop     ax
                cmp     byte ptr [di], 0FFh
                jz      short loc_86DC
                cmp     byte ptr [di], 0FCh
                jz      short loc_86DC
                call    cs:Viewport_Coords_To_Screen_Addr_proc ; AL: y
                                        ; AH: x
                                        ; Returns video memory address in DI
                or      di, 8000h
                mov     [si+spirit.s_vram_addr], di
                mov     al, 66h ; 'f'
                and     di, 7FFFh  ; DI = screen address (half)
                push    si
                call    cs:Uncompress_And_Render_Tile_proc ; AL: tile index
                                        ; DI: screen address
                pop     si

loc_86DC:
                add     si, 7  ; size of spirit struct
                pop     cx
                loop    next_spirit
                retn
render_and_collision_pass_row endp
