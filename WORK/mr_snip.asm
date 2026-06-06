; ===========================================================================
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
