

; ===========================================================================
; move_hero_right_if_no_obstacles
; Attempts to scroll the dungeon one tile to the left (hero moves right).
; Mirror of move_hero_left_if_no_obstacles:
; 1. Check 4 tiles at hero x+2 for monsters or solid tiles.
; 2. If clear: increment proximity_map_left_col_x,
;    shift proximity map 1 column left (rep movsb forward),
;    unpack new rightmost column from packed_map_ptr_for_hero_x_plus_18.
; 3. Call every_projectile_moves_left_in_viewport,
;    stamp newly-entering left-edge monsters.
; ===========================================================================
move_hero_right_if_no_obstacles proc near
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                inc     si
                inc     si              ; x+=2
                mov     di, si
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     cx, 4

loc_685C:        
                call    get_dst_monster_flags ; CF: no monster
                                        ; NC: active monster; al=type, bx=monster struct
                add     al, al
                jnb     short loc_6864
                retn
; ---------------------------------------------------------------------------

loc_6864:        
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                loop    loc_685C
                xchg    di, si
                test    byte ptr ds:squat_flag, 0FFh
                jnz     short loc_6884
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                stc
                jz      short loc_687E
                retn
; ---------------------------------------------------------------------------

loc_687E:        
                call    NC_can_pass_except_category1
                jnb     short loc_6884
                retn
; ---------------------------------------------------------------------------

loc_6884:        
                mov     cx, 2

loc_6887:        
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     al, [si]
                call    is_non_blocking_tile_simple
                stc
                jz      short loc_6896
                retn
; ---------------------------------------------------------------------------

loc_6896:        
                push    cx
                call    NC_can_pass_except_category1
                pop     cx
                jnb     short loc_689E
                retn
; ---------------------------------------------------------------------------

loc_689E:        
                loop    loc_6887

hero_moves_right:
                inc     word ptr ds:proximity_map_left_col_x
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 36-1
                cmp     ax, ds:mapWidth
                jnz     short proximity_map_scrolls_left
                mov     ds:packed_map_ptr_for_hero_x_plus_18, (offset packed_map_end_ptr+1)

proximity_map_scrolls_left:   
                push    cs
                pop     es
                mov     si, offset proximity_map+1
                mov     di, offset proximity_map
                mov     cx, 36*64-1
                rep movsb
                mov     si, ds:packed_map_ptr_for_hero_x_plus_18 ; =c7e7
                inc     si
                mov     di, offset proximity_map+36-1 ; right column offset
                call    unpack_column
                dec     si
                mov     ds:packed_map_ptr_for_hero_x_plus_18, si
                mov     ax, ds:proximity_map_left_col_x
                cmp     ax, ds:mapWidth
                jnz     short loc_68E7
                mov     word ptr ds:proximity_map_left_col_x, 0
                mov     si, offset packed_map_start
                jmp     short loc_68F8
; ---------------------------------------------------------------------------

loc_68E7:        
                mov     si, ds:packed_map_ptr_for_hero_x_minus_18
                xor     dh, dh

unpack_left_column:       
                call    unpack_step_forward ; unpack extra column to /dev/null
                inc     si
                add     dh, bh
                cmp     dh, 40h ; '@'
                jb      short unpack_left_column ; unpack extra column to /dev/null

loc_68F8:        
                mov     ds:packed_map_ptr_for_hero_x_minus_18, si
                call    every_projectile_moves_left_in_viewport
                mov     byte ptr ds:monster_index, 0
                mov     bx, ds:proximity_map_left_col_x
                add     bx, 36-1
                mov     ax, bx
                sub     ax, ds:mapWidth
                jb      short loc_6915
                mov     bx, ax

loc_6915:        
                mov     si, ds:monsters_table_addr

next_monster1:    
                mov     ax, [si]
                cmp     ax, 0FFFFh
                jnz     short loc_6921
                retn                    ; monsters end marker
; ---------------------------------------------------------------------------

loc_6921:        
                cmp     ah, 0FFh
                jz      short loc_6939
                cmp     ax, bx
                jnz     short loc_6939
                mov     ah, 35
                mov     al, [si+2]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     al, ds:monster_index
                or      al, 80h
                mov     [di], al

loc_6939:        
                inc     byte ptr ds:monster_index
                add     si, 10h
                jmp     short next_monster1
move_hero_right_if_no_obstacles endp


; ===========================================================================
; NC_can_pass_except_category1
; Returns CF=1 (cannot pass) if tile [si] is airflow category 1 (left-flow).
; Used for right-movement blocking in level 5 caverns (wind tunnels).
; ===========================================================================
NC_can_pass_except_category1 proc near  ; ...
                cmp     byte ptr ds:cavern_level, 7
                clc
                jne     short loc_694B
                retn
; ---------------------------------------------------------------------------

loc_694B:        
                mov     al, [si]
                push    si
                call    get_airflow_direction ; Is input tile an airflow?
                                        ; Input: al
                                        ; Output:
                                        ; NZ, cl=0xff (no airflow)
                                        ; ZF, cl=0 (Up), 1 (Left), 2 (Right)
                pop     si
                dec     cl
                stc
                jnz     short loc_6958
                retn
; ---------------------------------------------------------------------------

loc_6958:        
                clc
                retn
NC_can_pass_except_category1 endp



; ===========================================================================
; airborne_movement
; Handles all in-air physics each frame (ascending and descending).
;
; Skip if air_up_tile_found or jump_phase_flags bit 7 (rope-descend mode).
;
; Per tick:
;   1. hero_collapse_platform — collapse any crumbling platform hero stands on
;   2. slope_assist_on_landing — slide hero along slope during descent
;   3. check_floor_for_landing — if floor tile found below: jmp land_after_jump
;   4. Increment jump_height_counter.
;   5. Scroll viewport down (byte_9F09 driven) if near viewport bottom.
;   6. Fall-off-cliff path: hero_scroll_down.
;   7. Rope grab check during flight.
;   8. If descending (was ascending before): read arrow keys for in-air steering.
; ===========================================================================
airborne_movement proc near   
                test    ds:air_up_tile_found, 0FFh
                jz      short loc_6962
                retn
; ---------------------------------------------------------------------------

loc_6962:        
                test    byte ptr ds:jump_phase_flags, 80h ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short loc_696A
                retn
; ---------------------------------------------------------------------------

loc_696A:        
                call    hero_collapse_platform
                call    slope_assist_on_landing
                call    check_floor_for_landing
                jnb     short loc_6978
                jmp     land_after_jump
; ---------------------------------------------------------------------------

loc_6978:        
                inc     ds:jump_height_counter
                test    ds:byte_9F09, 0FFh
                jz      short loc_698D
                pushf
                dec     ds:byte_9F09
                inc     byte ptr ds:hero_head_y_in_viewport
                popf

loc_698D:        
                pop     ax
                jnz     short loc_6993  ;
                                        ; fall off cliff
                call    hero_scroll_down

loc_6993:        
                test    byte ptr ds:facing_direction, 2 ; 03 when walked left
                jnz     short loc_69AE
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 36*2+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                call    is_over_rope    ; set CF if [si] is rope (0 or 1)
                jnb     short loc_69AE
                mov     byte ptr ds:on_rope_flags, 0FFh ; hang on rope by walking
                retn
; ---------------------------------------------------------------------------

loc_69AE:        
                mov     byte ptr ds:hero_animation_phase, 80h
                mov     al, ds:jump_phase_flags ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     byte ptr ds:jump_phase_flags, 7Fh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                test    byte ptr ds:slope_direction, 0FFh
                jz      short loc_69C3
                retn
; ---------------------------------------------------------------------------

loc_69C3:        
                test    byte ptr ds:invincibility_flag, 0FFh
                jz      short loc_69CB
                retn
; ---------------------------------------------------------------------------

loc_69CB:        
                test    al, 0FFh
                jnz     short read_keys_buffer
                mov     ax, offset loc_69E0
                push    ax
                test    byte ptr ds:facing_direction, 1
                jz      short loc_69DD
                jmp     on_left_pressed
; ---------------------------------------------------------------------------

loc_69DD:        
                jmp     on_right_pressed
; ---------------------------------------------------------------------------

loc_69E0:        
                and     byte ptr ds:facing_direction, 11111101b
                retn
; ---------------------------------------------------------------------------

read_keys_buffer:
                int     61h             ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                and     al, 1100b
                cmp     al, 100b
                jz      short left_pressed
                cmp     al, 1000b
                jz      short right_pressed

loc_69F2:        
                test    byte ptr ds:facing_direction, UP
                jnz     short loc_6A02
                cmp     al, 100b
                jz      short loc_6A4A
                cmp     al, 1000b
                jz      short loc_6A1E
                retn
; ---------------------------------------------------------------------------

loc_6A02:        
                test    byte ptr ds:facing_direction, LEFT
                jz      short loc_6A0C
                jmp     on_left_pressed
; ---------------------------------------------------------------------------

loc_6A0C:        
                jmp     on_right_pressed
; ---------------------------------------------------------------------------

left_pressed:    
                test    byte ptr ds:facing_direction, 1
                jnz     short loc_69F2
                and     byte ptr ds:facing_direction, 11111101b
                call    flip_facing_direction

loc_6A1E:        
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 3*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jz      short loc_6A2F
                retn
; ---------------------------------------------------------------------------

loc_6A2F:        
                inc     si
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jnz     short loc_6A38
                retn
; ---------------------------------------------------------------------------

loc_6A38:        
                jmp     move_hero_right_if_no_obstacles
; ---------------------------------------------------------------------------

right_pressed:   
                test    byte ptr ds:facing_direction, 1
                jz      short loc_69F2
                and     byte ptr ds:facing_direction, 11111101b
                call    flip_facing_direction

loc_6A4A:        
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 3*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jz      short loc_6A5B
                retn
; ---------------------------------------------------------------------------

loc_6A5B:        
                dec     si
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jnz     short loc_6A64
                retn
; ---------------------------------------------------------------------------

loc_6A64:        
                jmp     move_hero_left_if_no_obstacles
airborne_movement endp


; ===========================================================================
; slope_assist_on_landing
; Called each airborne frame to handle slope interactions.
; Reads tile at hero feet+2 rows via get_slope_direction_by_tile_under_feet.
; If on a slope:
;   - Slide down every 4th tick (unless input holds uphill direction).
;   - Silkarn shoes: no forced sliding.
;   - height_above_ground counts down; at 0, slides freely every frame.
; Slope tiles defined in seg1:8018h (left slope 0x0B) and 801Ch (right slope 0x0C).
; ===========================================================================
slope_assist_on_landing proc near
                mov     byte ptr ds:slope_direction, 0
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 2*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                call    get_slope_direction_by_tile_under_feet ; NZ: no slope
                                        ; ZF dl=1: right slope \
                                        ; ZF dl=2: left slope /
                jz      short loc_6A7B
                retn                    ; no slope
; ---------------------------------------------------------------------------

loc_6A7B:        
                and     byte ptr ds:facing_direction, 11111101b
                mov     ds:slope_direction, dl
                test    ds:height_above_ground, 0FFh
                jnz     short check_silkarn_shoes_and_slopes
                mov     al, ds:ticks
                inc     ds:ticks
                and     al, 3           ; every 4th tick
                jz      short time_to_check_sliding_down ; ah: 0FF16h   ; Alt_Space
                                        ; al: 0FF17h   ; right_left_down_up
                retn
; ---------------------------------------------------------------------------

time_to_check_sliding_down:   
                int     61h             ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                cmp     byte ptr ds:slope_direction, SLOPE_RIGHT
                jz      short right_slope
                test    al, 1000b       ; left slope, check Right keypress
                jz      short slide_off_leftwards
                retn                    ; right pressed on left slope - no slide
; ---------------------------------------------------------------------------

slide_off_leftwards:      
                jmp     move_hero_left_if_no_obstacles
; ---------------------------------------------------------------------------

right_slope:     
                test    al, 100b
                jz      short no_left_pressed
                retn                    ; left pressed on right slope - no slide
; ---------------------------------------------------------------------------

no_left_pressed: 
                jmp     move_hero_right_if_no_obstacles
; ---------------------------------------------------------------------------

check_silkarn_shoes_and_slopes: 
                mov     al, ds:current_accessory
                cmp     al, SHOES_SILKARN
                jnz     short no_silkarn_shoes_slide_off_slope
                retn                    ; silkarn shoes - no slide
; ---------------------------------------------------------------------------

no_silkarn_shoes_slide_off_slope:
                dec     ds:height_above_ground
                cmp     byte ptr ds:slope_direction, SLOPE_RIGHT
                jne     short loc_6AC6
                jmp     move_hero_right_if_no_obstacles
; ---------------------------------------------------------------------------

loc_6AC6:        
                jmp     move_hero_left_if_no_obstacles
slope_assist_on_landing endp


; ===========================================================================
; down_pressed
; Handles DOWN key press.
; - If on slope: do nothing (slope_direction != 0).
; - Try move_platform_down_damage_monster (lower active platform).
; - If rope above feet: dismount rope (on_rope_flags = 0x80, jump = 0x80).
; - If on ground: set squat_flag = 0xFF (crouching).
; ===========================================================================
down_pressed    proc near 
                mov     ds:byte_9F18, 0
                test    byte ptr ds:slope_direction, 0FFh
                jz      short climb_off_rope_to_ground
                retn
; ---------------------------------------------------------------------------

climb_off_rope_to_ground: 
                call    move_platform_down_damage_monster
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 109         ; 3*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                call    is_over_rope    ; set CF if [si] is rope (0 or 1)
                jb      short loc_6B04  ;
                                        ; no more over rope
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_6AF9  ;
                                        ; was on rope
                mov     byte ptr ds:on_rope_flags, 80h ; ff -> 80h
                                        ; transition rope -> ground
                mov     byte ptr ds:jump_phase_flags, 80h ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                retn
; ---------------------------------------------------------------------------

loc_6AF9:        
                mov     ds:frame_ticks, 0
                mov     byte ptr ds:squat_flag, 0FFh
                retn
; ---------------------------------------------------------------------------

loc_6B04:        
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 109         ; 3*36+1
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                inc     byte ptr ds:hero_animation_phase
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jz      short loc_6B1E
                or      byte ptr ds:hero_animation_phase, 1
                retn
; ---------------------------------------------------------------------------

loc_6B1E:        
                call    hero_scroll_down
                call    main_update_render
                test    byte ptr ds:hero_animation_phase, 1
                jz      short loc_6B2C
                retn
; ---------------------------------------------------------------------------

loc_6B2C:        
                jmp     short loc_6B04
down_pressed    endp


; =============== S U B R O U T I N E =======================================

; hero_scroll_down() {
;   viewport_top_row_y++;
;   viewport_left_top_addr += 36;
;   if (viewport_left_top_addr >= 0xE900) viewport_left_top_addr -= 0x900;
; }
hero_scroll_down proc near
                inc     byte ptr ds:viewport_top_row_y ; hero goes down
                mov     si, ds:viewport_left_top_addr ; viewport goes down too
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     ds:viewport_left_top_addr, si
                retn
hero_scroll_down endp


; =============== S U B R O U T I N E =======================================


land_after_jump proc near 
                mov     al, ds:jump_phase_flags ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                xor     al, 7Fh
                jz      short loc_6B49
                retn
; ---------------------------------------------------------------------------

loc_6B49:        
                pop     ax              ; will return to
                mov     dl, ds:jump_height_counter
                mov     byte ptr ds:jump_phase_flags, 0 ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     ds:frame_ticks, 0
                mov     ds:jump_height_counter, 0
                mov     byte ptr ds:hero_animation_phase, 80h
                test    byte ptr ds:slope_direction, 0FFh
                jz      short loc_6B6A
                retn
; ---------------------------------------------------------------------------

loc_6B6A:        
                cmp     dl, 2
                jnb     short squat_after_landing_from_big_height
                retn
; ---------------------------------------------------------------------------

squat_after_landing_from_big_height:
                mov     byte ptr ds:squat_flag, 0FFh
                retn
land_after_jump endp


; =============== S U B R O U T I N E =======================================

check_floor_for_landing proc near
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 3*36+1      ; directly under feet
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     di, si
                call    get_dst_monster_flags ; CF: no monster
                                        ; NC: active monster; al=type, bx=monster struct
                add     al, al          ; monsters have bit 7 set
                jnb     short loc_6B89
                retn                    ; CF: monster under feet
; ---------------------------------------------------------------------------

loc_6B89:        
                dec     si              ; one tile left beneath hero
                call    get_dst_monster_flags ; CF: no monster
                                        ; NC: active monster; al=type, bx=monster struct
                add     al, al
                jnb     short loc_6B92
                retn
; ---------------------------------------------------------------------------

loc_6B92:        
                mov     si, di
                mov     al, [si]
                call    is_non_blocking_tile_simple
                stc
                jz      short loc_6B9D
                retn
; ---------------------------------------------------------------------------

loc_6B9D:        
                cmp     byte ptr ds:hero_animation_phase, 80h
                clc
                jnz     short loc_6BA6
                retn
; ---------------------------------------------------------------------------

loc_6BA6:        
                dec     si
                mov     al, [si]
                call    is_non_blocking_tile_simple
                clc
                jnz     short loc_6BB0
                retn
; ---------------------------------------------------------------------------

loc_6BB0:        
                inc     si
                inc     si
                mov     al, [si]
                call    is_non_blocking_tile_simple
                stc
                jz      short loc_6BBB
                retn
; ---------------------------------------------------------------------------

loc_6BBB:        
                clc
                retn
check_floor_for_landing endp


; =============== S U B R O U T I N E =======================================

; set CF if [si] is rope (0 or 1)

is_over_rope    proc near 
                mov     al, [si]
                dec     al              ; al=1 or 2
                cmp     al, 2           ; al=0,1 => CF
                retn
is_over_rope    endp


; =============== S U B R O U T I N E =======================================

; NZ: no slope
; ZF dl=1: right slope \
; ZF dl=2: left slope /

; ===========================================================================
; get_slope_direction_by_tile_under_feet
; Checks tile at [si] (hero feet position in proximity map).
; Searches seg1:8018h (left-slope table, up to 4 entries) and
; seg1:801Ch (right-slope table, up to 4 entries).
; Returns: ZF=1, dl=2 → left slope (/); ZF=1, dl=1 → right slope (\).
; Returns: NZ → not a slope tile.
; ===========================================================================
get_slope_direction_by_tile_under_feet proc near ; ...
                mov     es, cs:seg1
                mov     al, [si]        ; tile under hero feet
                mov     di, 8018h       ; 0xB, 0, 0, 0 - left slope tile defined as 0xb
                mov     dl, 2           ; try left slope
                mov     cx, 4

loc_6BD3:        
                test    byte ptr es:[di], 0FFh
                jz      short no_left_slope_defined
                cmp     al, es:[di]
                jnz     short loc_6BDF
                retn                    ; hero stays on left slope
; ---------------------------------------------------------------------------

loc_6BDF:        
                inc     di
                loop    loc_6BD3

no_left_slope_defined:    
                mov     di, 801Ch       ; 0xC, 0, 0, 0 - right slope tile defined as 0xc
                mov     dl, 1           ; try right slope
                mov     cx, 4

loc_6BEA:        
                test    byte ptr es:[di], 0FFh
                jz      short no_right_slope_defined
                cmp     al, es:[di]
                jnz     short loc_6BF6
                retn                    ; hero stays on right slope
; ---------------------------------------------------------------------------

loc_6BF6:        
                inc     di
                loop    loc_6BEA

no_right_slope_defined:   
                or      dl, dl          ; NZ if no slope
                retn
get_slope_direction_by_tile_under_feet endp
