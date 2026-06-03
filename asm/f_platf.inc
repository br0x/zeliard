

; =============== S U B R O U T I N E =======================================


render_vertical_platforms_to_proximity proc near
                mov     si, ds:vertical_platforms_table_addr
next_vert_platform:
                mov     ax, [si+vert_platform.x]
                cmp     ax, 0FFFFh
                jnz     short loc_7FBD
                retn
; ---------------------------------------------------------------------------

loc_7FBD:        
                call    abs_x_to_proximity_rel
                jb      short loc_7FD7
                mov     ah, bl
                mov     al, [si+vert_platform.y]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     cx, 3           ; 3 platform tiles
                mov     dl, 40h ; '@'   ; vertical platform has tiles 0x40, 0x41, 0x42

loc_7FCF:        
                call    put_dl_to_proximity_layered
                inc     di              ; x++
                inc     dl              ; next platform tile
                loop    loc_7FCF

loc_7FD7:        
                add     si, 3
                jmp     short next_vert_platform
render_vertical_platforms_to_proximity endp


; =============== S U B R O U T I N E =======================================


move_platform_down_damage_monster proc near
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short on_ground4
                retn
; ---------------------------------------------------------------------------

on_ground4:       
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 3*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     dl, 40h ; '@'   ; vertical platform: tiles 0x40, 0x41, 0x42
                call    identify_platform_tile ; NZ: not a platform
                                        ; ZF: platform; dh={1, 0, -1} for {left, mid, right} tile
                jz      short hor_platform_beneath
                retn
; ---------------------------------------------------------------------------

hor_platform_beneath:     
                mov     di, ds:vertical_platforms_table_addr
                mov     dl, 40h ; '@'
                call    try_move_platform_down ; NC: platform is blocked
                                        ; CF: platform successfully moved down
                jnb     short blocked
                pop     ax
                mov     byte ptr ds:hero_animation_phase, 80h
                jmp     hero_scroll_down
; ---------------------------------------------------------------------------

blocked:         
                call    get_dst_monster_flags ; CF: no monster
                                        ; NC: active monster; al=type, bx=monster struct
                jnb     short alive_or_dead_monster
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
                call    is_non_blocking_tile ; ZF if can pass
                jz      short hero_not_blocked_above
                retn
; ---------------------------------------------------------------------------

hero_not_blocked_above:   
                add     si, 36*4
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     dl, 40h         ; vertical platform: tiles 0x40, 0x41, 0x42
                call    identify_platform_tile ; NZ: not a platform
                                        ; ZF: platform; dh={1, 0, -1} for {left, mid, right} tile
                jz      short hor_platform_beneath_
                retn
; ---------------------------------------------------------------------------

hor_platform_beneath_:     
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


; =============== S U B R O U T I N E =======================================

; Note: collapsing and vertical platforms share the same struct
process_visible_collapsing_platforms proc near
                mov     si, ds:collapsing_platforms_table_addr

next_collapsing_platform: 
                mov     ax, [si+vert_platform.x]
                cmp     ax, 0FFFFh
                jnz     short loc_816F
                retn
; ---------------------------------------------------------------------------

loc_816F:        
                call    abs_x_to_proximity_rel
                jb      short loc_8189
                mov     ah, bl
                mov     al, [si+vert_platform.y] ; y
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     cx, 3
                mov     dl, 43h ; 'C'   ; collapsing platform tiles are 0x43, 0x44, 0x45

loc_8181:        
                call    put_dl_to_proximity_layered
                inc     di
                inc     dl
                loop    loc_8181

loc_8189:        
                add     si, 3
                jmp     short next_collapsing_platform
process_visible_collapsing_platforms endp


; =============== S U B R O U T I N E =======================================


hero_collapse_platform proc near
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 3*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     dl, 43h         ; collapsing platform tiles are 0x43, 0x44, 0x45
                call    identify_platform_tile ; NZ: not a platform
                                        ; ZF: platform; dh={1, 0, -1} for {left, mid, right} tile
                jz      short loc_819F
                retn
; ---------------------------------------------------------------------------

loc_819F:        
                mov     di, ds:collapsing_platforms_table_addr
                mov     dl, 43h
                call    try_move_platform_down ; NC: platform is blocked
                                        ; CF: platform successfully moved down
                jb      short loc_81AB
                retn
; ---------------------------------------------------------------------------

loc_81AB:        
                jmp     hero_scroll_down
hero_collapse_platform endp


; =============== S U B R O U T I N E =======================================


update_and_render_horiz_platforms proc near
                inc     ds:byte_9F07
                mov     si, ds:horiz_platforms_table_addr ; =d55f

next_platform_:   
                mov     ax, [si+horiz_platform.x_and_flags]
                cmp     ax, 0FFFFh
                jnz     short loc_81BE
                retn
; ---------------------------------------------------------------------------

loc_81BE:        
                and     ax, 3FFFh       ; x
                call    horiz_platform_proximity_x_offset
                jb      short loc_820A
                mov     cl, bl
                dec     bx
                dec     bx
                or      bh, bh
                jns     short loc_81DA
                inc     cl
                mov     al, [si+horiz_platform.y_and_flags]
                xor     ah, ah
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                jmp     short loc_8200
; ---------------------------------------------------------------------------

loc_81DA:        
                mov     ax, bx
                sub     ax, 34
                jb      short loc_81F6
                push    ax
                mov     al, [si+horiz_platform.y_and_flags]
                mov     ah, 34
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                pop     ax
                add     di, ax
                mov     cl, al
                neg     cl
                add     cl, 2
                jmp     short loc_8200
; ---------------------------------------------------------------------------

loc_81F6:        
                mov     ah, bl
                mov     al, [si+horiz_platform.y_and_flags]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     cl, 3           ; platform has 3 tiles

loc_8200:        
                xor     ch, ch
                xor     dl, dl

clear_next_platform_tile: 
                call    put_dl_to_proximity_layered
                inc     di
                loop    clear_next_platform_tile

loc_820A:        
                mov     ax, [si+horiz_platform.x_and_flags]
                mov     bl, ah
                and     ax, 3FFFh
                rol     bl, 1
                rol     bl, 1
                and     bl, 3           ; 00, 01, 10, 11
                jz      short skip_if_0
                dec     bl
                xor     bh, bh
                add     bx, bx
                call    ds:funcs_8220[bx]

skip_if_0:       
                call    abs_x_to_proximity_rel
                jb      short loc_823E
                mov     ah, bl
                mov     al, [si+horiz_platform.y_and_flags]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     cx, 3
                mov     dl, 46h         ; Horizontal platform has tiles 0x46, 0x47, 0x48

loc_8236:        
                call    put_dl_to_proximity_layered
                inc     di
                inc     dl
                loop    loc_8236

loc_823E:        
                add     si, 7
                jmp     next_platform_
update_and_render_horiz_platforms endp

; ---------------------------------------------------------------------------
funcs_8220      dw offset update_slow_horiz_platform_coords
                dw offset update_horiz_platform_coords
                dw offset update_horiz_platform_coords

; =============== S U B R O U T I N E =======================================


update_slow_horiz_platform_coords proc near
                test    ds:byte_9F07, 1
                jnz     short update_horiz_platform_coords
                retn
update_slow_horiz_platform_coords endp


; =============== S U B R O U T I N E =======================================


update_horiz_platform_coords proc near
                mov     cl, [si+horiz_platform.y_and_flags]
                and     [si+horiz_platform.y_and_flags], 10111111b
                test    cl, 40h         ; paused platform
                jz      short moving_platform
                retn
; ---------------------------------------------------------------------------

moving_platform: 
                test    [si+horiz_platform.y_and_flags], 80h ; y bit 7 is direction: 0=right, 1=left
                jnz     short leftward
                inc     ax
                mov     bx, ax
                sub     ax, ds:mapWidth
                jz      short loc_826F
                xchg    ax, bx

loc_826F:        
                push    si
                push    ax
                call    hero_on_horiz_platform
                jb      short loc_8279
                call    move_hero_right_if_no_obstacles

loc_8279:        
                pop     ax
                pop     si
                mov     bx, [si+horiz_platform.max_x] ; platform moving rightward
                jmp     short loc_8299
; ---------------------------------------------------------------------------

leftward:        
                dec     ax
                cmp     ax, 0FFFFh
                jnz     short loc_828A
                mov     ax, ds:mapWidth
                dec     ax

loc_828A:        
                push    si
                push    ax
                call    hero_on_horiz_platform
                jb      short loc_8294
                call    move_hero_left_if_no_obstacles

loc_8294:        
                pop     ax
                pop     si
                mov     bx, [si+horiz_platform.min_x] ; platform moving leftward

loc_8299:        
                mov     dl, [si+1]
                and     dl, 11000000b   ; x_and_flags speed part
                or      dl, ah
                mov     byte ptr [si+horiz_platform.x_and_flags], al ; =2f
                mov     [si+1], dl      ; horiz. platform x = 40h => normal speed
                sub     bx, ax          ; 0024h-002f=fff5
                jz      short loc_82AB
                retn
; ---------------------------------------------------------------------------

loc_82AB:        
                xor     [si+horiz_platform.y_and_flags], 80h ; change direction
                or      [si+horiz_platform.y_and_flags], 40h ; pause platform for several ticks
                retn
update_horiz_platform_coords endp


; =============== S U B R O U T I N E =======================================


hero_on_horiz_platform proc near
                mov     dl, ds:jump_phase_flags ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                or      dl, ds:on_rope_flags ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                stc
                jz      short on_ground5
                retn
; ---------------------------------------------------------------------------

on_ground5:       
                mov     al, ds:hero_head_y_in_viewport
                add     al, ds:viewport_top_row_y
                add     al, 3
                and     al, 3Fh
                mov     ah, [si+horiz_platform.y_and_flags]
                and     ah, 3Fh
                cmp     al, ah
                stc
                jz      short loc_82D7
                retn
; ---------------------------------------------------------------------------

loc_82D7:        
                mov     ax, [si+horiz_platform.x_and_flags]
                and     ax, 3FFFh
                call    abs_x_to_proximity_rel
                jnb     short loc_82E2
                retn
; ---------------------------------------------------------------------------

loc_82E2:        
                mov     dl, ds:hero_x_in_viewport
                add     dl, 4
                mov     cx, 3

loc_82EC:        
                cmp     dl, al
                clc
                jnz     short loc_82F2
                retn
; ---------------------------------------------------------------------------

loc_82F2:        
                inc     dl
                loop    loc_82EC
                stc
                retn
hero_on_horiz_platform endp


; =============== S U B R O U T I N E =======================================


abs_x_to_proximity_rel proc near
                mov     bx, ax          ; ax=bx=inX (absolute x coord in the map)
                sub     ax, ds:proximity_map_left_col_x ; ax = inX-proximityLeft
                jb      short inX_lt_proxLeft ;
                                        ; case0:
                                        ; proximityLeft <= inX < mapWidth
                xchg    ax, bx          ; ax = inX
                                        ; bx = inX - proximityLeft
                mov     ax, 36-3
                sub     ax, bx          ; ax = 33 - (inX - proximityLeft)
                                        ; bx = inX - proximityLeft
                retn                    ; CF if: proximityLeft + 34 <= inX
                                        ; NC if: proximityLeft <= inX < proximityLeft + 34
; ---------------------------------------------------------------------------

inX_lt_proxLeft: 
                mov     ax, 36-3        ; case1:
                                        ; inX < proximityLeft
                sub     ax, bx          ; ax = 33 - inX
                                        ; bx = inX
                jnb     short inX_le_33
                retn                    ; CF if: 33 < inX < proximityLeft
; ---------------------------------------------------------------------------

inX_le_33:       
                mov     ax, ds:mapWidth ; case2:
                                        ; inX <= 33 < proximityLeft
                sub     ax, ds:proximity_map_left_col_x
                add     ax, bx          ; ax = mapWidth - proximity_map_left_col_x + inX
                                        ; bx = inX
                xchg    ax, bx          ; ax = inX
                                        ; bx = mapWidth - proximity_map_left_col_x + inX
                mov     ax, 36-3
                sub     ax, bx          ; ax = 33 - (mapWidth - proximity_map_left_col_x + inX)
                                        ; bx = mapWidth - proximity_map_left_col_x + inX
                retn                    ; CF if: 33 - inX < mapWidth - proximity_map_left_col_x
abs_x_to_proximity_rel endp


; =============== S U B R O U T I N E =======================================


horiz_platform_proximity_x_offset proc near
                add     ax, 2
                mov     bx, ax
                sub     ax, ds:mapWidth
                jnb     short loc_832B
                xchg    ax, bx

loc_832B:        
                mov     bx, ax
                sub     ax, ds:proximity_map_left_col_x
                jb      short loc_833A
                xchg    ax, bx
                mov     ax, 37
                sub     ax, bx
                retn
; ---------------------------------------------------------------------------

loc_833A:        
                mov     ax, 37
                sub     ax, bx
                jnb     short loc_8342
                retn
; ---------------------------------------------------------------------------

loc_8342:        
                mov     ax, ds:mapWidth
                sub     ax, ds:proximity_map_left_col_x
                add     ax, bx
                xchg    ax, bx
                mov     ax, 37
                sub     ax, bx
                retn
horiz_platform_proximity_x_offset endp


; =============== S U B R O U T I N E =======================================


put_dl_to_proximity_layered proc near   ; ...
                test    byte ptr [di], 80h ; monster here?
                jnz     short loc_835A
                mov     [di], dl        ; di is destination
                retn
; ---------------------------------------------------------------------------

loc_835A:        
                mov     bl, [di]        ; [di] contains offset to destination table of 128 values
                and     bl, 7Fh         ; bl = monster id
                xor     bh, bh
                mov     ds:proximity_second_layer[bx], dl ; proximity map is designed to keep only one item
                                        ; at given address. So when we need to put other object,
                                        ; when position is already occupied by monster,
                                        ; we use second layer: 128 bytes of additional buffer
                                        ; (1 byte per monster id)
                retn
put_dl_to_proximity_layered endp
