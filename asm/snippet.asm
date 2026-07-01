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
                cmp     ds:slide_ticks_remaining, 10
                jb      short loc_6555
                mov     ds:slide_ticks_remaining, 10

loc_6555:        
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short on_ground1
                retn
; ---------------------------------------------------------------------------

on_ground1:       
                mov     byte ptr ds:squat_flag, 0
                mov     al, ds:byte_9F09
                cmp     al, ds:jump_height_including_shoes
                jnb     short state_machine_dispatcher_idle_default
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
                jnz     short state_machine_dispatcher_idle_default
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jz      short loc_65B4
                retn
; ---------------------------------------------------------------------------

loc_65B4:        
                mov     byte ptr ds:hero_animation_phase, 80h
                retn
; ---------------------------------------------------------------------------

state_machine_dispatcher_idle_default:        
                mov     byte ptr ds:slope_direction, 0
                mov     byte ptr ds:jump_phase_flags, 7Fh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                retn
jump_press_handler endp
