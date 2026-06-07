

; ===========================================================================
; hero_interaction_check
; Checks whether the 3-tile-wide hero footprint overlaps a rope or door tile,
; routing to hero_moves_left / hero_moves_right if so.
; Skipped while squatting or airborne.
; Called every frame from main_loop.
; ===========================================================================
hero_interaction_check proc near
                test    byte ptr ds:squat_flag, 0FFh
                jz      short loc_63E2
                retn    ; squatting: skip
; ---------------------------------------------------------------------------

loc_63E2:        
                test    byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short loc_63EA
                retn    ; airborne: skip
; ---------------------------------------------------------------------------

loc_63EA:        
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jnz     short loc_63F5
                retn    ; hero's top left can't be here: skip
; ---------------------------------------------------------------------------

loc_63F5:        
                inc     si
                inc     si      ; si = hero top-right coord
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jnz     short loc_63FF
                retn    ; hero's top right can't be here: skip
; ---------------------------------------------------------------------------

loc_63FF:        
                add     si, 36  ; hero mid right coord
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jz      short loc_640F
                jmp     hero_moves_left
; ---------------------------------------------------------------------------

loc_640F:        
                jmp     hero_moves_right
hero_interaction_check endp


; ===========================================================================
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


; ===========================================================================
; sliding_physics_step
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



; ===========================================================================
; init_horizontal_sliding
; When the hero starts moving on an ice surface, converts the accumulated
; horiz_movement_sub_tile_accum into slide_ticks_remaining (capped at 10).
; Called each time a directional key is read in the state machine.
; ===========================================================================
init_horizontal_sliding proc near
                call    set_zero_flag_if_slippery
                jz      short loc_650E
                retn
; ---------------------------------------------------------------------------

loc_650E:        
                test    ds:slide_ticks_remaining, 0FFh
                jz      short loc_6516
                retn
; ---------------------------------------------------------------------------

loc_6516:        
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_651E
                retn
; ---------------------------------------------------------------------------

loc_651E:        
                mov     al, ds:horiz_movement_sub_tile_accum
                shr     al, 1
                or      al, al
                jnz     short loc_6528
                retn
; ---------------------------------------------------------------------------

loc_6528:        
                cmp     al, 10
                jb      short loc_652E
                mov     al, 10

loc_652E:        
                mov     ds:slide_ticks_remaining, al
                mov     ds:horiz_movement_sub_tile_accum, 0
                retn
init_horizontal_sliding endp



; ===========================================================================
; up_pressed
; Handles UP direction (no left/right).
; Tries (in order):
;   1. try_door_interaction — check for a door tile above hero
;   2. try_move_platform_up — raise a vertical platform if hero is on it
;   3. try_climb_rope       — grab a rope if hero is over it
; Falls through silently to jumping if none apply.
; ===========================================================================
up_pressed:
                mov     ds:byte_9F18, 0
                call    try_door_interaction
                call    try_move_platform_up
                call    try_climb_rope
                ; otherwise, jump
; ===========================================================================
; jump_press_handler
; Handles the jump initiation when UP+button is pressed.
; Increments slide_ticks_remaining (up to 10) while button is held.
;
; On ground:
;   - Checks tile above hero head; if clear, sets jump_phase_flags = 0xFF
;     (ascending), computes initial height_above_ground.
;   - Feruza shoes: height_above_ground starts at 2 (vs 1 normally),
;     allowing 4 vs 2 jump height steps.
;   - If hero head y < 7 (near viewport top), calls move_hero_up instead of
;     decrementing y directly.
; On slope or rope: transitions to descending (jump_phase_flags = 0x7F).
; ===========================================================================
jump_press_handler proc near  
                inc     ds:slide_ticks_remaining
                cmp     ds:slide_ticks_remaining, 0Ah
                jb      short loc_6555
                mov     ds:slide_ticks_remaining, 0Ah

loc_6555:        
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short on_ground1
                retn
; ---------------------------------------------------------------------------

on_ground1:       
                mov     byte ptr ds:squat_flag, 0
                mov     al, ds:byte_9F09
                cmp     al, ds:jump_height_including_shoes
                jnb     short loc_65BA
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                sub     si, 35          ; points above hero head
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                jnz     short loc_65A5
                mov     byte ptr ds:hero_animation_phase, 0
                and     byte ptr ds:facing_direction, 11111101b ; clear Up bit
                mov     byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     al, ds:jump_height_including_shoes
                shr     al, 1
                mov     ds:height_above_ground, al
                inc     ds:byte_9F09
                cmp     byte ptr ds:hero_head_y_in_viewport, 7
                jnb     short simple_jump
                jmp     move_hero_up
; ---------------------------------------------------------------------------

simple_jump:     
                dec     byte ptr ds:hero_head_y_in_viewport
                retn
; ---------------------------------------------------------------------------

loc_65A5:        
                test    ds:byte_9F09, 0FFh
                jnz     short loc_65BA
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_65B4
                retn
; ---------------------------------------------------------------------------

loc_65B4:        
                mov     byte ptr ds:hero_animation_phase, 80h
                retn
; ---------------------------------------------------------------------------

loc_65BA:        
                mov     byte ptr ds:slope_direction, 0
                mov     byte ptr ds:jump_phase_flags, 7Fh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                retn
jump_press_handler endp


; ===========================================================================
; try_climb_rope
; Called from up_pressed.
; Checks the 3 possible hero-relative X positions for a rope tile (tile 0 or 1).
; If found directly above: begins climbing animation — moves hero up row by row
; (calling move_hero_up + main_update_render) until rope is no longer above.
; Sets on_rope_flags = 0xFF.
; ===========================================================================
try_climb_rope  proc near 
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                inc     si  ; points to hero head
                call    is_over_rope    ; set CF if rope found
                jb      short climb_to_rope_from_ground
                dec     si  ; check tile to the left of head
                call    is_over_rope    ; set CF if [si] is rope (0 or 1)
                jnb     short loc_65DC
                test    byte ptr ds:facing_direction, 1
                jnz     short on_left_pressed  ; move left to center on rope
                retn
; ---------------------------------------------------------------------------

loc_65DC:        
                inc     si
                inc     si  ; check tile to the right of head
                call    is_over_rope    ; set CF if [si] is rope (0 or 1)
                jb      short loc_65E4
                retn
; ---------------------------------------------------------------------------

loc_65E4:        
                test    byte ptr ds:facing_direction, 1
                jnz     short locret_65EE
                jmp     on_right_pressed  ; move right to center on rope
; ---------------------------------------------------------------------------

locret_65EE:     
                retn
; ---------------------------------------------------------------------------

climb_to_rope_from_ground:
                mov     byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                mov     byte ptr ds:squat_flag, 0

loc_65F9:        
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                sub     si, 35  ; points to tile above head
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                dec     byte ptr ds:hero_animation_phase
                call    is_over_rope    ; set CF if over rope
                jc      short loc_6611
                or      byte ptr ds:hero_animation_phase, 1
                retn
; ---------------------------------------------------------------------------

loc_6611:        
                call    move_hero_up
                call    main_update_render
                test    byte ptr ds:hero_animation_phase, 1
                jz      short loc_661F
                retn
; ---------------------------------------------------------------------------

loc_661F:        
                jmp     short loc_65F9
try_climb_rope  endp



; move_hero_up() {
;   viewport_top_row_y--;
;   viewport_left_top_addr -= 36;
;   if (viewport_left_top_addr < 0xE000) viewport_left_top_addr += 0x900;
; }
;
; Scrolls the viewport up by one tile row:
;   viewport_top_row_y--
;   viewport_left_top_addr -= 36  (with circular wrap if below 0xE000)
; ===========================================================================
move_hero_up    proc near 
                dec     byte ptr ds:viewport_top_row_y ; hero goes up
                mov     si, ds:viewport_left_top_addr ; viewport goes up too
                sub     si, 36
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     ds:viewport_left_top_addr, si
                retn
move_hero_up    endp


; ===========================================================================
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


; ===========================================================================
; move_hero_left_if_no_obstacles
; Attempts to move hero left (scroll the dungeon one tile to the right).
; Returns CF=1 if cannot move.
;
; 1. Check the 4 tiles (3 hero rows + 1 above) at hero x-1 for:
;    - Active monsters (proximity byte with bit 7 set) → block
;    - Solid/blocking tile type → block
;    - Airflow category 2 (right-flow wind) → block for normal cavern
; 2. If clear: decrement proximity_map_left_col_x,
;    shift proximity map 1 column right (rep movsb backward),
;    unpack new leftmost column from packed_map_ptr_for_prox_left.
; 3. After scroll: call every_projectile_moves_right_in_viewport,
;    then stamp the newly-entering right-edge monsters from monsters_table.
;
; SPRITE NOTE: The hero occupies a 3×3 tile area (3 columns wide) in the
; proximity map. hero_coords_to_addr_in_proximity returns the top-left corner.
; hero_x_in_viewport is always 0x0C (column 12) in normal caverns.
; ===========================================================================
move_hero_left_if_no_obstacles proc near
                call    hero_coords_to_addr_in_proximity
                mov     di, si
                sub     si, 36
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                dec     si              ; tile NW of hero top left
                mov     cx, 4

check_4_tiles_to_the_left_of_hero:
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags
                add     al, al          ; monsters in the proximity map have bit 7 set
                jnb     short loc_66BC
                retn                    ; monster to the left of hero, can't move
; ---------------------------------------------------------------------------

loc_66BC:        
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                loop    check_4_tiles_to_the_left_of_hero
                xchg    di, si
                test    byte ptr ds:squat_flag, 0FFh ; =0
                jnz     short loc_66DC
                mov     al, [si]        ; tile where hero head will come
                call    is_non_blocking_tile ; ZF if can pass
                stc
                jz      short loc_66D6
                retn
; ---------------------------------------------------------------------------

loc_66D6:        
                call    is_right_airflow
                jnb     short loc_66DC
                retn
; ---------------------------------------------------------------------------

loc_66DC:        
                mov     cx, 2

loc_66DF:        
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     al, [si]        ; map element (tile)
                call    is_non_blocking_tile_simple
                stc
                jz      short loc_66EE
                retn
; ---------------------------------------------------------------------------

loc_66EE:        
                push    cx
                call    is_right_airflow
                pop     cx
                jnb     short loc_66F6
                retn
; ---------------------------------------------------------------------------

loc_66F6:        
                loop    loc_66DF

hero_moves_left: 
                dec     word ptr ds:proximity_map_left_col_x
                cmp     word ptr ds:proximity_map_left_col_x, 0FFFFh
                jnz     short proximity_map_scrolls_right ; no wrap
                mov     ax, ds:mapWidth ; wrap to end of map
                dec     ax
                mov     ds:proximity_map_left_col_x, ax ; mapWidth - 1
                mov     si, ds:packed_map_end_ptr ; end of packed map + 1
                mov     ds:packed_map_ptr_for_prox_left, si

proximity_map_scrolls_right:  
                push    cs              ; free left column of proximity map
                pop     es
                std
                mov     si, offset proximity_map+36*64-2
                mov     di, offset proximity_map+36*64-1
                mov     cx, 36*64-1
                rep movsb
                cld
                mov     si, ds:packed_map_ptr_for_prox_left
                dec     si              ; points to the last byte of packed column
                mov     di, offset proximity_map+36*(64-1) ; last row, leftmost column
                xor     dl, dl          ; y = 0

fill_column_backward:     
                call    unpack_step_backward
                dec     si
                add     dl, bh          ; y += count

repeat_bh_times: 
                mov     [di], bl        ; tile
                sub     di, 36          ; move up one row
                dec     bh
                jnz     short repeat_bh_times
                cmp     dl, 64
                jb      short fill_column_backward
                inc     si
                mov     ds:packed_map_ptr_for_prox_left, si
                mov     si, ds:packed_map_end_ptr
                dec     si              ; end of packed map
                mov     ax, ds:proximity_map_left_col_x ; already decremented and wrapped
                add     ax, 36          ; hero_x_plus_18_abs
                cmp     ax, ds:mapWidth
                jz      short no_column_skip_needed ;
                                        ; we need to prepare pointer also for unpacking rightmost column of proximity map
                                        ; they both need to be in sync (36 columns apart)
                mov     si, ds:packed_map_ptr_for_prox_right
                xor     dh, dh          ; y = 0

skip_bh_times:   
                call    unpack_step_backward
                dec     si
                add     dh, bh          ; y += count
                cmp     dh, 64
                jb      short skip_bh_times

no_column_skip_needed:    
                mov     ds:packed_map_ptr_for_prox_right, si
                call    every_projectile_moves_right_in_viewport ; x coord in viewport increases
                mov     bx, ds:proximity_map_left_col_x
                mov     byte ptr ds:monster_index, 0
                mov     si, ds:monsters_table_addr

next_monster:    
                mov     ax, [si+monster.currX]
                cmp     ax, 0FFFFh      ; end of monsters marker
                jnz     short loc_6782
                retn
; ---------------------------------------------------------------------------

loc_6782:        
                cmp     ah, 0FFh        ; special 'monster'
                jz      short skip_monster
                cmp     ax, bx          ; only process monsters on the left proximity margin
                jnz     short skip_monster
                xor     ah, ah          ; x relative to left proximity margin = 0
                mov     al, [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     al, ds:monster_index
                or      al, 80h
                mov     [di], al

skip_monster:    
                inc     byte ptr ds:monster_index
                add     si, 10h
                jmp     short next_monster
move_hero_left_if_no_obstacles endp


; ===========================================================================
; is_right_airflow
; Returns CF=1 (cannot pass) if tile [si] is an airflow tile of category 2
; (right-flowing wind). Used for left-movement blocking in level 5 caverns.
; get_airflow_direction → ZF + cl=0/1/2 for up/left/right.
; ===========================================================================
is_right_airflow proc near
                cmp     byte ptr ds:cavern_level, 7 ; Exception: MP73.MDT (The Hut) has level 1
                clc
                jne     short loc_67AC
                retn
; ---------------------------------------------------------------------------

loc_67AC:        
                mov     al, [si]
                push    si
                call    get_airflow_direction ; Is input tile an airflow?
                                        ; Input: al
                                        ; Output:
                                        ; NZ, cl=0xff (no airflow)
                                        ; ZF, cl=0 (Up), 1 (Left), 2 (Right)
                pop     si
                cmp     cl, 2
                stc
                jnz     short loc_67BA
                retn
; ---------------------------------------------------------------------------

loc_67BA:        
                clc
                retn
is_right_airflow endp



; ===========================================================================
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
                jb      short loc_6837
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


; ===========================================================================
; flip_facing_direction
; Toggles facing_direction left/right.
; If on ground: resets hero_animation_phase to 0x80 (idle frame).
; ===========================================================================
flip_facing_direction proc near 
                xor     byte ptr ds:facing_direction, 1
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short on_ground3
                retn
; ---------------------------------------------------------------------------

on_ground3:       
                mov     byte ptr ds:hero_animation_phase, 80h
                retn
; ---------------------------------------------------------------------------

loc_6837:        
                and     byte ptr ds:facing_direction, 11111101b ; clear Up
                mov     al, ds:on_rope_flags ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                or      al, ds:jump_phase_flags ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short loc_6846
                retn
; ---------------------------------------------------------------------------

loc_6846:        
                mov     byte ptr ds:hero_animation_phase, 80h
                retn
flip_facing_direction endp
