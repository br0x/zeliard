; main_loop — per-frame game loop (called via PUSH/RET trick)
; Frame structure:
;   1. Check if on rope → separate rope-handling path
;   2. input_handling
;   3. sliding_physics_step
;   4. main_update_render
;   5. magic_spell_fire_handler
;   6. hero_interaction_check
;   7. hero_knockback_handler
;   8. frame_ticks counter: reset squat flag at tick 2
;   9. Read direction bits → route to state_machine_dispatcher
; ===========================================================================
main_loop:       
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jnz     short over_rope
                call    input_handling
                call    sliding_physics_step
                call    main_update_render
                call    magic_spell_fire_handler
                call    hero_interaction_check
                call    hero_knockback_handler
                inc     ds:frame_ticks
                cmp     ds:frame_ticks, 2
                jnz     short loc_62C5
                mov     byte ptr ds:squat_flag, 0

loc_62C5:        
                mov     dx, offset main_loop
                push    dx  ; main_loop will be called on return
                                        ; check input keys buffer
                int     61h             ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                test    al, 2
                jz      short no_down_pressed
                and     byte ptr ds:facing_direction, 11111101b ; down (not up)

no_down_pressed: 
                call    airborne_movement
                call    state_machine_dispatcher
                retn                    ; jumps to main_loop


; hero_knockback_handler
; Applies knockback when the hero was just hit by a monster this frame.
; (byte_9F14 is set by check_hero_contact_damage when hit.)
;
; Behaviour:
;   - If byte_9F01 is set (boss cavern special flag), or byte_9F0E/9F10 vectors
;     indicate horizontal push: call move_hero_left/right twice.
;   - If on rope during knockback: drop off rope, enter descending state.
;   - If in an air-up tile: no extra push.
;   - If climbing down rope (jump_phase_flags 0x80): just move viewport down.
;   - Otherwise check floor landing, potentially scroll viewport down.
; ===========================================================================
hero_knockback_handler proc near
                test    ds:byte_9F14, 0FFh
                jnz     short loc_641A
                retn
; ---------------------------------------------------------------------------

loc_641A:        
                test    ds:byte_9F01, 0FFh
                jnz     short loc_6440
                mov     si, offset word_9F0E
                mov     al, [si]
                or      al, [si+1]
                mov     ah, [si+2]
                or      ah, [si+3]
                test    al, ah
                jz      short loc_643C
                test    byte ptr ds:facing_direction, 1
                jnz     short loc_6440
                jmp     short loc_6463
; ---------------------------------------------------------------------------

loc_643C:        
                or      al, al
                jnz     short loc_6463

loc_6440:        
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_645B
                and     byte ptr ds:facing_direction, 11111100b
                or      byte ptr ds:facing_direction, LEFT
                mov     byte ptr ds:jump_phase_flags, 7Fh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     byte ptr ds:spacebar_latch, 0

loc_645B:        
                call    move_hero_left_if_no_obstacles
                call    move_hero_left_if_no_obstacles
                jmp     short loc_6481
; ---------------------------------------------------------------------------

loc_6463:        
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_6479
                and     byte ptr ds:facing_direction, 11111100b ; right
                mov     byte ptr ds:jump_phase_flags, 7Fh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     byte ptr ds:spacebar_latch, 0

loc_6479:        
                call    move_hero_right_if_no_obstacles
                call    move_hero_right_if_no_obstacles
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_6481:        
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_6492  ;
                                        ; was on rope, hit by monster
                mov     byte ptr ds:on_rope_flags, 80h ; transition rope -> ground
                mov     byte ptr ds:jump_phase_flags, 0 ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope

loc_6492:        
                test    ds:air_up_tile_found, 0FFh
                jz      short loc_649A
                retn
; ---------------------------------------------------------------------------

loc_649A:        
                test    byte ptr ds:jump_phase_flags, 80h ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short loc_64A2
                retn
; ---------------------------------------------------------------------------

loc_64A2:        
                call    check_floor_for_landing
                jnb     short loc_64A8
                retn
; ---------------------------------------------------------------------------

loc_64A8:        
                test    ds:byte_9F09, 0FFh
                jnz     short loc_64B2
                jmp     hero_scroll_down
; ---------------------------------------------------------------------------

loc_64B2:        
                dec     ds:byte_9F09
                inc     byte ptr ds:hero_head_y_in_viewport
                retn
hero_knockback_handler endp


; Applies one tick of ice-slide movement.
; Only active when cavern_level == 4 (ice cavern) AND no Ruzeria shoes.
; Consumes one tick from slide_ticks_remaining.
; Slides in the direction stored in byte_9F22 (1=right, 2=left),
; but respects the direction-lock bit in byte_9F23.
; If the tile underfoot is a non-ice tile (0x40-0x48), stops sliding.
; ===========================================================================
sliding_physics_step proc near
                call    set_zero_flag_if_slippery
                jz      short loc_64C1
                retn                    ; not slippery
; ---------------------------------------------------------------------------

loc_64C1:        
                test    byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short on_ground
                retn
; ---------------------------------------------------------------------------

on_ground:       
                test    ds:slide_ticks_remaining, 0FFh
                jnz     short loc_64D1
                retn
; ---------------------------------------------------------------------------

loc_64D1:        
                dec     ds:slide_ticks_remaining
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                add     si, 3*36+1      ; points to tile under feet
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     al, [si]
                cmp     al, 40h ; '@'
                jb      short loc_64EE
                cmp     al, 49h ; 'I'
                jnb     short loc_64EE
                ; al = 40h ... 49h
                mov     ds:slide_ticks_remaining, 0 ; stop sliding
                retn
; ---------------------------------------------------------------------------
                ; on the ice
loc_64EE:        
                mov     al, ds:byte_9F22 ; slide_direction: 1 = right, 2 = left
                test    ds:byte_9F23, 1 ; slide_direction_flags: Bit 0 = moving direction from previous tick
                jz      short loc_6500
                ; was moving right, try move right
                cmp     al, 1
                jne     short loc_64FD
                ; was already moving right
                retn
; ---------------------------------------------------------------------------
                ; byte_9F22 != 1 => confirm moving right
loc_64FD:        
                jmp     move_hero_right_if_no_obstacles
; ---------------------------------------------------------------------------
                ; was moving left, try move left
loc_6500:        
                cmp     al, 2
                jne     short loc_6505
                ; was already moving left
                retn
; ---------------------------------------------------------------------------
                ; byte_9F22 != 2 => confirm moving left
loc_6505:        
                jmp     move_hero_left_if_no_obstacles
sliding_physics_step endp


; right_up_pressed / on_right_pressed (right movement without jump)
; Mirror of left_up_pressed for rightward movement.
; - If facing left: flip_facing_direction.
; - If on right slope and moving right: transition slope state.
; - Otherwise: call move_hero_right_if_no_obstacles.
; ===========================================================================
right_up_pressed proc near
                mov     ds:byte_9F0B, 0FFh
                call    jump_press_handler
                jmp     short $+2
; ---------------------------------------------------------------------------

on_right_pressed:        
                mov     ds:byte_9F18, 0
                test    byte ptr ds:facing_direction, 1
                jnz     short flip_facing_direction
                test    byte ptr ds:squat_flag, 0FFh
                jz      short loc_67DA
                retn
; ---------------------------------------------------------------------------

loc_67DA:        
                cmp     byte ptr ds:slope_direction, SLOPE_LEFT
                jz      short loc_6837
                call    move_hero_right_if_no_obstacles
                jc      short loc_6837   ; CF: cannot move right
                mov     ds:byte_9F22, 1  ; move dir = right
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_67F3
                retn
; ---------------------------------------------------------------------------

loc_67F3:        
                call    set_zero_flag_if_slippery
                jnz     short loc_6808
                test    ds:slide_ticks_remaining, 0FFh
                jnz     short loc_6808
                mov     ds:byte_9F23, 1   ; 1 => right movement
                inc     ds:horiz_movement_sub_tile_accum

loc_6808:        
                or      byte ptr ds:facing_direction, 2
                test    byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short loc_6815
                retn
; ---------------------------------------------------------------------------

loc_6815:        
                inc     byte ptr ds:hero_animation_phase
                and     byte ptr ds:hero_animation_phase, 7Fh
                mov     ds:byte_9F19, 0
                retn
right_up_pressed endp


; left_up_pressed / on_left_pressed (left movement without jump)
; Handles LEFT direction (optionally combined with UP for jump-left).
;
; - If facing right: flip_facing_direction, reset animation.
; - If squatting: ignore.
; - If on a right slope and moving left: clear Up bit, transition slope state.
; - Otherwise: call move_hero_left_if_no_obstacles.
;   On success: set byte_9F22=2 (move dir=left), increment accum, set Up flag.
; ===========================================================================
left_up_pressed proc near 
                mov     ds:byte_9F0B, 0FFh
                call    jump_press_handler
                jmp     short $+2
; ---------------------------------------------------------------------------

on_left_pressed:        
                mov     ds:byte_9F18, 0
                test    byte ptr ds:facing_direction, left
                jnz     short loc_664D
                jmp     flip_facing_direction
; ---------------------------------------------------------------------------

loc_664D:        
                test    byte ptr ds:squat_flag, 0FFh
                jz      short loc_6655
                retn
; ---------------------------------------------------------------------------

loc_6655:        
                cmp     byte ptr ds:slope_direction, SLOPE_RIGHT
                jne     short loc_665F
                jmp     loc_6837
; ---------------------------------------------------------------------------

loc_665F:        
                call    move_hero_left_if_no_obstacles
                jnc     short loc_6667
                ; CF: cannot move left
                jmp     loc_6837
; ---------------------------------------------------------------------------

loc_6667:        
                mov     ds:byte_9F22, 2   ; move dir=left
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_6674
                retn
; ---------------------------------------------------------------------------

loc_6674:        
                call    set_zero_flag_if_slippery
                jnz     short loc_6689
                test    ds:slide_ticks_remaining, 0FFh
                jnz     short loc_6689
                mov     ds:byte_9F23, 0  ; left movement
                inc     ds:horiz_movement_sub_tile_accum

loc_6689:        
                or      byte ptr ds:facing_direction, 10b
                test    byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short on_ground2
                retn
; ---------------------------------------------------------------------------

on_ground2:       
                inc     byte ptr ds:hero_animation_phase
                and     byte ptr ds:hero_animation_phase, 7Fh
                mov     ds:byte_9F19, 0
                retn
left_up_pressed endp


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


; Master simulation + render tick called every frame.
;
; Simulation phase:
;   - Feruza shoes → jump_height_including_shoes = 4 (else 2).
;   - check_airflows_on_hero — detect and apply wind tunnel tiles.
;   - If not airborne: reset byte_9F09 (fall sub-step counter).
;   - Re-center hero if hero_x_in_viewport drifts from 0x0C.
;   - Compute hero_y_absolute = (hero_head_y_in_viewport + viewport_top_row_y) & 0x3F.
;   - update_boss_heartbeat_volume
;   - update_and_render_horiz_platforms
;   - render_vertical_platforms_to_proximity
;   - process_visible_collapsing_platforms
;   - process_doors
;   - dispatch_spell_projectile_movement
;   - monsters_spawning  (unless boss is already dead)
;   - check_hero_contact_damage
;   - Flush UI dirty element
;   - projectiles_collision_processing
;   - monsters_updates  (render)
;   - step_on_aggressive_ground
;   - Temperature damage (cavern_level 7 = heat, every 0x40 ticks, 0x0F damage)
;     Protected by CAPE_ASBESTOS.
;   - screen_flash_overlay
; ===========================================================================
main_update_render proc near  
                mov     al, 2
                cmp     byte ptr ds:current_accessory, SHOES_FERUZA
                jnz     short no_feruza
                mov     al, 4

no_feruza:       
                mov     ds:jump_height_including_shoes, al
                call    check_airflows_on_hero
                test    byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jnz     short loc_6FD3
                mov     ds:byte_9F09, 0
                mov     al, ds:byte_9F00
                cmp     al, ds:hero_head_y_in_viewport
                jz      short loc_6FD3
                jb      short loc_6FCC
                call    move_hero_up
                inc     byte ptr ds:hero_head_y_in_viewport
                jmp     short loc_6FD3
; ---------------------------------------------------------------------------

loc_6FCC:        
                call    hero_scroll_down
                dec     byte ptr ds:hero_head_y_in_viewport
;;;
loc_6FD3:        
                test    byte ptr ds:is_jashiin_cavern, 0FFh
                jnz     short loc_6FE1
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_6FF9
; for jashiin or boss cavern
loc_6FE1:        
                mov     si, ds:word_A002 ; boss state block
                add     si, 7
                mov     al, [si]
                cmp     ds:hero_x_in_viewport, al
                jz      short loc_7007
                call    move_hero_right_if_no_obstacles
                dec     byte ptr ds:hero_x_in_viewport
                jmp     short loc_7007
; ---------------------------------------------------------------------------
; for non-boss cavern
loc_6FF9:        
                mov     al, ds:hero_x_in_viewport
                cmp     al, 0Ch
                jz      short loc_7007
                call    move_hero_left_if_no_obstacles
                inc     byte ptr ds:hero_x_in_viewport

loc_7007:        
                mov     al, ds:hero_head_y_in_viewport ; hanging on rope, head at ground level: 0a
                add     al, ds:viewport_top_row_y ; 40h
                and     al, 3Fh
                mov     ds:hero_y_absolute, al ; hero Y absolute coord within the map
                call    update_boss_heartbeat_volume
                call    update_and_render_horiz_platforms
                call    render_vertical_platforms_to_proximity
                call    process_visible_collapsing_platforms
                call    process_doors
                call    dispatch_spell_projectile_movement
                test    byte ptr ds:boss_is_dead, 0FFh
                jnz     short loc_702F
                call    monsters_spawning

loc_702F:        
                mov     byte ptr ds:hero_damage_this_frame, 0
                mov     ds:byte_9F14, 0
                call    check_hero_contact_damage
                call    cs:Flush_Ui_Element_If_Dirty_proc
                call    projectiles_collision_processing
                call    monsters_updates
                call    cs:Render_Scrolling_Transition_Overlay_proc
                call    step_on_aggressive_ground
                cmp     byte ptr ds:cavern_level, 7 ; danger type = temperature
                jne     short skip_temperature_damage
                cmp     byte ptr ds:current_accessory, CAPE_ASBESTOS
                jz      short skip_temperature_damage
                inc     ds:temperature_timer
                test    ds:temperature_timer, 3Fh
                jnz     short skip_temperature_damage
                mov     byte ptr ds:hero_damage_this_frame, 0FFh
                mov     byte ptr ds:soundFX_request, 9
                mov     ax, 0Fh
                call    damage_hero     ; ax: damage level
                mov     dx, offset its_too_hot_str
                call    render_notification_string

skip_temperature_damage:  
                call    screen_flash_overlay
                test    byte ptr ds:invincibility_flag, 0FFh
                jz      short game_loop_render_and_timing
                mov     byte ptr ds:hero_damage_this_frame, 0
                jmp     short loc_7094
main_update_render endp


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


try_door_interaction proc near
                call    hero_coords_to_addr_in_proximity
                sub     si, 36+1        ; x--, y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                cmp     byte ptr [si], 4Ah ; 'J' ; door to Muralla: 0x49, 0x4A, 0x61, 0x4B, 0x4C
                jz      short on_the_right_door_tile ; hero is on the right tile of the door
                inc     si
                cmp     byte ptr [si], 4Ah ; 'J'
                jz      short enter_the_door ; hero is centered on door
                inc     si
                cmp     byte ptr [si], 4Ah ; 'J'
                jz      short on_the_left_door_tile
                retn
; ---------------------------------------------------------------------------

on_the_left_door_tile:    
                test    byte ptr ds:facing_direction, 1
                jz      short loc_7AA6
                retn                    ; faced left - skip door interaction
; ---------------------------------------------------------------------------

loc_7AA6:        
                pop     ax
                jmp     move_hero_right_if_no_obstacles
; ---------------------------------------------------------------------------

on_the_right_door_tile:   
                test    byte ptr ds:facing_direction, 1
                jnz     short loc_7AB2
                retn                    ; faced right - skip door interaction
; ---------------------------------------------------------------------------

loc_7AB2:        
                pop     ax              ; =0x653f
                jmp     move_hero_left_if_no_obstacles
; ---------------------------------------------------------------------------

enter_the_door:  
                mov     ax, ds:proximity_map_left_col_x ; proximity map left edge in the absolute map coords
                mov     bl, ds:hero_x_in_viewport
                add     bl, 4           ; viewport offset from proximity map margin
                xor     bh, bh
                add     ax, bx          ; hero x absolute
                mov     bx, ds:mapWidth
                dec     bx
                sub     bx, ax
                jnb     short no_wrap
                not     bx
                mov     ax, bx

no_wrap:         
                mov     bl, ds:hero_head_y_in_viewport
                dec     bl
                add     bl, ds:viewport_top_row_y
                and     bl, 3Fh         ; wrap vertically
                mov     si, ds:doors_table_addr

next_door1:       
                cmp     word ptr [si], 0FFFFh ; end of doors marker
                jnz     short loc_7AE8
                retn
; ---------------------------------------------------------------------------

loc_7AE8:        
                cmp     ax, [si+door.x0]
                jnz     short loc_7AF1
                cmp     bl, [si+door.y0]
                jz      short loc_7AF6

loc_7AF1:        
                add     si, 12
                jmp     short next_door1
; ---------------------------------------------------------------------------

loc_7AF6:        
                pop     ax
                test    [si+door.d_flags], 80h
                jnz     short loc_7B25
                call    open_door
                jb      short loc_7B03
                retn
; ---------------------------------------------------------------------------

loc_7B03:        
                mov     byte ptr ds:hero_animation_phase, 80h
                mov     ds:horiz_movement_sub_tile_accum, 0
                test    ds:byte_9F19, 0FFh
                jz      short loc_7B15
                retn
; ---------------------------------------------------------------------------

loc_7B15:        
                mov     ds:byte_9F19, 0FFh
                mov     byte ptr ds:soundFX_request, 22
                mov     dx, offset cant_open_this_door_str
                jmp     render_notification_string
; ---------------------------------------------------------------------------

loc_7B25:        
                mov     bx, [si+door.d_save_achievement_addr]
                cmp     bx, 0FFFFh
                jz      short loc_7B32
                mov     al, [si+door.d_achievement_flag]
                or      [bx], al

loc_7B32:        
                push    si
                call    Browse_Projectiles
                call    clear_viewport_buffer
                call    cs:Flush_Ui_Element_If_Dirty_proc
                call    reset_dungeon_state_vars
                call    game_loop_render_and_timing
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh ; end-of-monsters marker
                pop     si              ; doors struct
                mov     al, [si+door.d_flags]
                and     al, 111b
                push    ax
                mov     ax, [si+door.x1]
                mov     ds:hero_x_in_proximity_map, ax
                mov     al, [si+door.y1]
                mov     ds:door_target_y, al
                mov     al, [si+door.d_flags]
                and     al, 1000000b
                mov     ds:is_left_run, al
                mov     al, [si+door.d_features]
                mov     ds:door_features, al
                mov     ah, [si+door.d_place_map_id]
                cmp     [si+door.y1], 0FFh
                jnz     short skip_if_cavern
                or      ah, 80h         ; door leads to town

skip_if_cavern:  
                mov     ds:place_map_id, ah ; cavern/town id
                mov     al, 1           ; fn_1 Load mdt
                call    cs:res_dispatcher_proc ; fn0_swap_town_vs_cavern_gfx_drv_and_jmp_bx
                                        ; fn1_load_mdt_idx_ah
                 
                test    byte ptr ds:place_map_id, 80h
                jnz     short skip_if_town ;
                                        ; place is cavern
                call    remove_accomplished_items
skip_if_town:    
                call    hero_left_16_down_1
                mov     si, ds:mdt_buffer
                lodsb
                test    al, 1
                jnz     short loc_7BD0
                mov     si, offset vfs_roka_grp_1
                mov     es, cs:seg1
                mov     di, packed_tile_ptr
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, packed_tile_ptr
                mov     cx, 80h
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                pop     ax  ; door.d_flags & 7
                call    cs:Render_Roca_Tilemap_proc
                mov     ds:mman_grp_index, 0FFh
                mov     byte ptr ds:byte_FF24, 0Ah
                jmp     short loc_7C02
; ---------------------------------------------------------------------------

loc_7BD0:        
                mov     si, offset vfs_roka_grp_2
                mov     es, cs:seg1
                mov     di, packed_tile_ptr
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, packed_tile_ptr
                mov     cx, 80h
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                pop     ax ; door.d_flags & 7
                call    cs:Render_Roca_Tilemap_proc
                mov     si, ds:mdt_buffer ; mdt_descriptor
                lodsb                   ; b7b6_msd_idx_b0
                call    process_mdt_descriptor

loc_7C02:        
                mov     byte ptr ds:hero_hidden_flag, 0
                mov     ds:byte_9EF5, 0FFh
                mov     byte ptr ds:projectiles_array, 0FFh
                test    ds:door_features, 80h
                jz      short loc_7C6E
                mov     si, offset rokademo_bin
                push    cs
                pop     es
                mov     di, 0A000h      ; rokademo.bin loaded
                mov     al, 3           ; fn3_read_virtual_file
                call    cs:res_dispatcher_proc
                call    cs:roca_entrypoint
                mov     ds:enp_grp_index, 0FFh
                mov     ds:eai_bin_index, 0FFh
                mov     al, ds:msd_index
                mov     ds:byte_9EFA, al
                mov     ds:byte_9F02, 0FFh
                call    load_cavern_sprites_ai_music ; load dchr.grp
                                        ; load mpp{mpp_grp_index}.grp
                                        ; load eai{eai_bin_index}.bin
                                        ; load enp{enp_grp_index}.grp
                                        ; load mgt{mgt_msd_index}.msd
                mov     es, cs:seg1
                mov     si, offset vfs_fman_grp
                mov     di, fman_gfx
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, fman_gfx + 333h  ; TILE_BANK_OFFSET = 0x333
                mov     bp, hero_transparency_masks
                mov     cx, 230
                call    cs:Decompress_Tile_Data_proc
                pop     ds
                jmp     loc_7CF4
; ---------------------------------------------------------------------------
loc_7C6E:        
                test    byte ptr ds:is_left_run, 0FFh
                jnz     short run_to_the_left
                and     byte ptr ds:facing_direction, 11111110b ; run to the right
                mov     bx, 0A6Eh
                mov     cx, 26          ; 26 steps to animate

loc_7C80:        
                push    cx              ; animate hero running in cavern entrance
                push    bx
                inc     byte ptr ds:hero_animation_phase
                call    cs:Update_Local_Attribute_Cache_proc
                pop     bx
                add     bh, 2
                push    bx
                call    cs:Calculate_Tile_VRAM_Address_proc
                call    sleep_loop_handle_system_keys
                pop     bx
                push    bx
                mov     cx, 218h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc
                pop     bx
                pop     cx
                loop    loc_7C80        ; animate hero running in cavern entrance
                mov     cx, 618h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc
                jmp     short loc_7CF4
; ---------------------------------------------------------------------------

run_to_the_left:     
                or      byte ptr ds:facing_direction, 1
                mov     bx, 406Eh
                mov     cx, 26          ; 26 steps to animate

loc_7CBF:        
                push    cx
                push    bx
                inc     byte ptr ds:hero_animation_phase
                call    cs:Update_Local_Attribute_Cache_proc
                pop     bx
                sub     bh, 2
                push    bx
                call    cs:Calculate_Tile_VRAM_Address_proc
                call    sleep_loop_handle_system_keys
                pop     bx
                push    bx
                add     bh, 4
                mov     cx, 218h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc
                pop     bx
                pop     cx
                loop    loc_7CBF
                mov     cx, 618h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc

loc_7CF4:        
                mov     si, ds:mdt_buffer  ; mdt_descriptor
                lodsb                      ; .b7b6_msd_idx_b0
                mov     ah, al
                and     al, 1              ; 0 ? town : dungeon
                jz      short loc_7D64
                ; dungeon init
                call    load_cavern_sprites_ai_music ; load dchr.grp
                                        ; load mpp{mpp_grp_index}.grp
                                        ; load eai{eai_bin_index}.bin
                                        ; load enp{enp_grp_index}.grp
                                        ; load mgt{mgt_msd_index}.msd
                mov     si, ds:mdt_buffer
                lodsb                   ; mdt_descriptor.b7b6_msd_idx_b0
                mov     ah, al
                add     ah, ah
                sbb     bl, bl          ; if ah bit 7 is set => bl = ff (boss cavern)
                mov     ds:is_boss_cavern, bl
                add     ah, ah
                sbb     bl, bl          ; if ah bit 6 was set => bl = ff (Jashiin cavern)
                mov     ds:is_jashiin_cavern, bl
                mov     byte ptr ds:boss_being_hit, 0
                mov     byte ptr ds:sprite_flash_flag, 0
                call    cs:Clear_Viewport_proc
                mov     byte ptr ds:hero_x_in_viewport, 0Ch
                mov     al, ds:hero_head_y_in_viewport_initial_from_mdt
                mov     ds:hero_head_y_in_viewport, al
                mov     ds:byte_9F00, al
                mov     byte ptr ds:hero_animation_phase, 80h ; state IDLE
                push    ds
                mov     ds, cs:seg1
                mov     si, 8030h
                mov     cx, 66h
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                call    cs:NoOperation_proc
                pop     ds
                push    ds
                call    word ptr cs:Load_Magic_Spell_Sprite_Group_proc ; Input: none (uses global current_magic_spell)
                                                                ; Reads corresponding sprite group fron seg2:0 buffer to seg1:9350h
                                                                ; Output: Loads sprite sheet for current_magic_spell
                                                                ; DS:SI -> seg1:9350h buffer

                mov     cx, 24
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                jmp     Cavern_Game_Init
; ---------------------------------------------------------------------------

loc_7D64:        
                mov     si, ds:mdt_buffer
                inc     si
                lodsb                   ; mdt_descriptor.mman_grp_idx
                mov     bl, 11
                mul     bl
                add     ax, offset mman_grp
                mov     si, ax
                mov     es, cs:seg1
                mov     di, 4000h
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                mov     bx, 6000h       ; jump address to the town code

transfer_to_town:
                mov     ax, 1  ; fn1 (Stop) Silences all channels and halts the driver.
                int     60h             ; mscadlib.drv
                push    bx
                call    edge_locking_scrolling_window ; Return:
                                        ; AX: proximity_map_left_col_x
                                        ; BL: hero_x_in_viewport
                mov     ds:proximity_map_left_col_x, ax
                mov     ds:hero_x_in_viewport, bl
                mov     si, ds:mdt_buffer ; mdt_descriptor
                lodsb                   ; b7b6_msd_idx_b0
                shr     al, 1
                and     al, 11111b
                mov     ds:msd_index, al
                mov     bl, 11
                mul     bl
                add     ax, offset vfs_mgt1_msd
                mov     si, ax
                mov     es, cs:seg1
                mov     di, 3000h
                mov     al, 5           ; fn5_load_music
                call    cs:res_dispatcher_proc
                pop     bx
                xor     al, al           ; fn0_swap_town_vs_cavern_gfx_drv_and_jmp_bx
                jmp     cs:res_dispatcher_proc ; on return will jump to the town entry code
try_door_interaction endp


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
