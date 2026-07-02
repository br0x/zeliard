
render_vertical_platforms_to_proximity proc near
move_platform_down_damage_monster proc near
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short on_ground4
                retn
; ---------------------------------------------------------------------------

on_ground4:       
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 3*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     dl, 40h         ; vertical platform: tiles 0x40, 0x41, 0x42
                call    identify_platform_tile ; NZ: not a platform
                                        ; ZF: platform; dh={1, 0, -1} for {left, mid, right} tile
                jz      short vert_platform_beneath
                retn
; ---------------------------------------------------------------------------

vert_platform_beneath:     
                mov     di, ds:vertical_platforms_table_addr
                mov     dl, 40h
                call    try_move_platform_down ; NC: platform is blocked
                                        ; CF: platform successfully moved down
                jnb     short blocked
                pop     ax
                mov     byte ptr ds:hero_animation_phase, 80h
                jmp     hero_scroll_down
; ---------------------------------------------------------------------------

blocked:         
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags; BX = monster struct
                jnc     short alive_or_dead_monster
                retn                    ; blocked by non-monster
; ---------------------------------------------------------------------------

alive_or_dead_monster:    
                and     al, 1100000b    ; dead slug (almas) = 0x74
                jz      short alive_monster
                retn
; ---------------------------------------------------------------------------

alive_monster:   
                test    [bx+monster.ai_flags], 100000b ; is damageable?
                jz      short monster_can_be_damaged
                retn
; ---------------------------------------------------------------------------

monster_can_be_damaged:   
                or      [bx+monster.ai_flags], 1000000b ; damage monster
                and     [bx+monster.ai_flags], 11100000b
                retn
move_platform_down_damage_monster endp


; =============== S U B R O U T I N E =======================================

; NC: platform is blocked
; CF: platform successfully moved down

try_move_platform_down proc near
                push    dx
                call    find_platform_under_hero
                pop     dx
                mov     bx, si
                add     si, 36-1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                test    byte ptr [si], 80h ; if high bit is set => platform is blocked below by monster
                clc
                jz      short loc_8038
                retn                    ; NC (blocked by monster)
; ---------------------------------------------------------------------------

loc_8038:        
                mov     cx, 3           ; platform is 3 tiles

three_times__:    
                inc     si
                test    byte ptr [si], 0FFh
                jz      short loc_8042
                retn                    ; NC: blocked by nonzero tile
; ---------------------------------------------------------------------------

loc_8042:        
                loop    three_times__
                mov     si, bx          ; bx is platform offset in proximity map
                add     si, 36          ; row under the platform
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                push    di
                mov     di, si          ; platform struc offset
                mov     cx, 3

three_times_:     
                push    dx
                push    bx
                call    put_dl_to_proximity_layered
                pop     bx
                xchg    di, bx
                push    bx
                xor     dl, dl
                call    put_dl_to_proximity_layered
                pop     bx
                xchg    di, bx
                inc     di
                inc     bx
                pop     dx
                inc     dl
                loop    three_times_
                pop     di
                inc     [di+vert_platform.y]
                and     [di+vert_platform.y], 3Fh
                stc
                retn                    ; CF: platform successfully moved down
try_move_platform_down endp


; =============== S U B R O U T I N E =======================================


try_move_platform_up proc near
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_807C
                retn
; ---------------------------------------------------------------------------

loc_807C:        
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                sub     si, 36-1
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     al, [si]
                call    is_blocking_tile ; ZF if can pass
                jz      short hero_not_blocked_above
                retn
; ---------------------------------------------------------------------------

hero_not_blocked_above:   
                add     si, 36*4
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     dl, 40h         ; vertical platform: tiles 0x40, 0x41, 0x42
                call    identify_platform_tile ; NZ: not a platform
                                        ; ZF: platform; dh={1, 0, -1} for {left, mid, right} tile
                jz      short vert_platform_beneath_
                retn
; ---------------------------------------------------------------------------

vert_platform_beneath_:     
                mov     di, ds:vertical_platforms_table_addr
                mov     dl, 40h
                push    dx
                call    find_platform_under_hero
                pop     dx
                mov     ax, si
                sub     si, 36
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     bx, si
                sub     si, 36
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     cx, 3           ; platform is 3 tiles

check_across_platform_width:  
                test    byte ptr [si], 80h
                jz      short not_blocked
                retn
; ---------------------------------------------------------------------------

not_blocked:     
                test    byte ptr [bx], 0FFh
                jz      short not_blocked_
                retn
; ---------------------------------------------------------------------------

not_blocked_:    
                inc     si
                inc     bx
                loop    check_across_platform_width
                mov     bx, ax
                mov     si, bx
                sub     si, 36
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                push    di
                mov     di, si
                mov     cx, 3

loc_80DA:        
                push    dx
                push    bx
                call    put_dl_to_proximity_layered
                pop     bx
                xchg    di, bx
                push    bx
                xor     dl, dl
                call    put_dl_to_proximity_layered
                pop     bx
                xchg    di, bx
                inc     di
                inc     bx
                pop     dx
                inc     dl              ; 40h, 41h, 42h
                loop    loc_80DA
                pop     di
                dec     [di+door.y0]    ; move platform up
                and     [di+door.y0], 3Fh
                pop     ax
                pop     ax
                mov     byte ptr ds:hero_animation_phase, 80h
                mov     byte ptr ds:jump_phase_flags, 0 ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jmp     move_hero_up
try_move_platform_up endp


; =============== S U B R O U T I N E =======================================


find_platform_under_hero proc near
                mov     al, ds:hero_x_in_viewport
                add     al, 4           ; viewport starts +4 from proximity window
                add     al, dh          ; hero position on platform {-1, 0, 1}
                xor     ah, ah
                add     ax, ds:proximity_map_left_col_x
                cmp     ax, ds:mapWidth
                jb      short inside_the_map
                sub     ax, ds:mapWidth ; ax = hero absolute coord x

inside_the_map:  
                mov     cl, ds:viewport_top_row_y
                add     cl, ds:hero_head_y_in_viewport ; hero absolute y coord in map
                add     cl, 3           ; hero height
                and     cl, 3Fh         ; hero feets y

next_platform:   
                cmp     ax, [di+vert_platform.x]
                jnz     short loc_8137
                cmp     cl, [di+vert_platform.y]
                jz      short platform_found

loc_8137:        
                add     di, 3           ; vertical platform descriptor is 3 bytes
                jmp     short next_platform
; ---------------------------------------------------------------------------

platform_found:  
                call    abs_x_to_proximity_rel
                mov     al, [di+vert_platform.y]
                mov     ah, bl
                push    di
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     si, di
                pop     di
                retn
find_platform_under_hero endp


; =============== S U B R O U T I N E =======================================

; NZ: not a platform
; ZF: platform; dh={1, 0, -1} for {left, mid, right} tile

identify_platform_tile proc near
                mov     dh, 1
                cmp     dl, [si]
                jnz     short loc_8153
                retn                    ; left platform tile, return ZF and dh=1
; ---------------------------------------------------------------------------

loc_8153:        
                dec     dh
                inc     dl
                cmp     dl, [si]
                jnz     short loc_815C
                retn                    ; middle platform tile, return ZF and dh=0
; ---------------------------------------------------------------------------

loc_815C:        
                dec     dh
                inc     dl
                cmp     dl, [si]
                retn                    ; right platform tile, return ZF and dh=-1
identify_platform_tile endp
