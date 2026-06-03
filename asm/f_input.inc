

; ===========================================================================
; input_handling
; Reads keyboard/joystick state and decides which sword-swing mode to trigger.
; Only runs if hero has a sword (sword_type != 0).
;
; SPACE + ascending + down-direction → downward thrust (sword_hit_type=2)
;   If not already held (down_thrust_held_flag): play SFX 4.
; SPACE latched (from previous frame) → normal or overhead swing:
;   - Scans 4×8-tile area in front of hero for monsters; if any found → overhead
;   - OR if UP is pressed → overhead swing (sword_hit_type=1)
;   - Otherwise → forward hit (sword_hit_type=0)
; Sets sword_swing_flag=0xFF to trigger apply_sword_hit_to_map_tiles.
; ===========================================================================
input_handling  proc near 
                test    byte ptr ds:sword_type, 0FFh ; sword present?
                jnz     short loc_6E43  ; ah: 0FF16h   ; Alt_Space
                                        ; al: 0FF17h   ; right_left_down_up
                retn                    ; no sword
; ---------------------------------------------------------------------------

loc_6E43:        
                int     61h             ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                test    ah, 1
                jz      short sword_default ;
                                        ; space pressed
                test    byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short sword_default ;
                                        ; space+up
                test    byte ptr ds:slope_direction, 0FFh
                jnz     short sword_default
                test    al, 10b         ; down
                jz      short sword_default ;
                                        ; space+up+down
                mov     byte ptr ds:sword_hit_type, 2 ; Ground downward thrust
                mov     byte ptr ds:sword_movement_phase, 2
                test    byte ptr ds:down_thrust_held_flag, 0FFh
                jz      short loc_6E70
                jmp     loc_6EF7
; ---------------------------------------------------------------------------

loc_6E70:        
                mov     byte ptr ds:down_thrust_held_flag, 0FFh
                mov     byte ptr ds:soundFX_request, 4
                jmp     short loc_6EF7
; ---------------------------------------------------------------------------

sword_default:   
                mov     byte ptr ds:down_thrust_held_flag, 0
                test    byte ptr ds:spacebar_latch, 0FFh
                jnz     short loc_6E89
                retn
; ---------------------------------------------------------------------------

loc_6E89:        
                test    byte ptr ds:sword_swing_flag, 0FFh
                jz      short loc_6E91
                retn
; ---------------------------------------------------------------------------

loc_6E91:        
                test    byte ptr ds:spell_active_flag, 0FFh
                jz      short loc_6E99
                retn
; ---------------------------------------------------------------------------

loc_6E99:        
                test    byte ptr ds:is_boss_cavern, 0FFh
                jnz     short loc_6ED6
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                sub     si, 147         ; =E10C-(4*36+3) = E079
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xor     dl, dl
                mov     cx, 4

four_rows:       
                push    cx
                mov     cx, 8

row_of_eight_tiles:       
                push    cx
                call    get_dst_monster_flags ; CF: no monster
                                        ; NC: active monster; al=type, bx=monster struct
                jb      short no_monster ; no monster
                test    al, 1100000b    ; frog=8E => (8e & 7f)=0e
                jnz     short no_monster
                test    byte ptr [bx+7], 10h
                jnz     short no_monster
                mov     dl, 0FFh        ; monster found

no_monster:      
                inc     si
                pop     cx
                loop    row_of_eight_tiles
                add     si, 28
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                pop     cx
                loop    four_rows
                or      dl, dl
                jnz     short loc_6EDC

loc_6ED6:        
                int     61h             ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                test    al, 1
                jz      short no_up_pressed ;
                                        ; up pressed

loc_6EDC:        
                mov     byte ptr ds:sword_hit_type, 1 ; Overhead swing
                mov     byte ptr ds:sword_movement_phase, 0
                jmp     short loc_6EF2
; ---------------------------------------------------------------------------

no_up_pressed:   
                mov     byte ptr ds:sword_hit_type, 0 ; Forward hit
                mov     byte ptr ds:sword_movement_phase, 0

loc_6EF2:        
                mov     byte ptr ds:soundFX_request, 3

loc_6EF7:        
                mov     byte ptr ds:spacebar_latch, 0
                mov     byte ptr ds:altkey_latch, 0
                mov     byte ptr ds:sword_swing_flag, 0FFh
                retn
input_handling  endp



; ===========================================================================
; apply_sword_hit_to_map_tiles
; Called every frame while sword_swing_flag is set.
; Walks the sword reachability table (at seg1:sword_reachability_tables) to
; determine which proximity map offsets the sword tip can reach.
; Table index = (facing_dir * 16) + sword_movement_phase + swing_type_offset.
;   Forward hit:      al = phase | (dir * 16)
;   Overhead swing:   al = phase | (dir * 16) | 6
;   Downward thrust:  al = dir * 16 + 10
; For each tile offset in the table: if a live monster is present (via
; get_dst_monster_flags), sets monster.ai_flags |= 0x41 (hit marker bit 6 + type 1).
; ===========================================================================
apply_sword_hit_to_map_tiles proc near  ; ...
                test    byte ptr ds:sword_swing_flag, 0FFh
                jnz     short loc_6F0F
                retn
; ---------------------------------------------------------------------------

loc_6F0F:        
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_6F1E
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_6F1E
                retn
; ---------------------------------------------------------------------------

loc_6F1E:        
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                mov     bx, 4*36
                test    byte ptr ds:squat_flag, 0FFh
                jz      short loc_6F2E
                mov     bx, 3*36

loc_6F2E:        
                sub     si, bx
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     bl, ds:facing_direction
                and     bl, 1
                add     bl, bl
                add     bl, bl
                add     bl, bl
                add     bl, bl   ; dir*16
                mov     al, ds:sword_hit_type ; 0=Forward hit, 1=Overhead swing, 2=Ground downward thrust
                mov     ah, 0
                or      al, al
                jz      short loc_6F57
                ; not forward hit
                mov     ah, 6
                dec     al
                jz      short loc_6F57 ; overhead swing
                ; ground downward thrust
                mov     al, bl
                add     al, 10         ; dir*16+10
                jmp     short loc_6F5E ; al=10 or 26
; ---------------------------------------------------------------------------
loc_6F57:                              ; forward hit (ah=0) or overhead swing (ah=6)
                mov     al, ds:sword_movement_phase
                or      al, bl         ; dir*16 + phase => 0..5 or 16..21
                add     al, ah         ; 0..5, 6..11, 16..21 or 22..27
loc_6F5E:
                and     al, 0FEh        ; clear bit 0
                mov     bl, al
                xor     bh, bh
                mov     es, cs:seg1
                mov     di, es:sword_reachability_tables[bx]

loc_6F6E:
                mov     al, es:[di]
                inc     di
                cmp     al, 0FFh
                jne     short loc_6F77
                retn
; ---------------------------------------------------------------------------

loc_6F77:        
                xor     ah, ah
                add     si, ax
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                call    get_dst_monster_flags ; CF: no monster
                                        ; NC: active monster; al=type, bx=monster struct
                jb      short loc_6F6E
                test    al, 20h
                jnz     short loc_6F6E
                test    byte ptr [bx+5], 20h
                jnz     short loc_6F6E
                or      byte ptr [bx+5], 40h
                and     byte ptr [bx+5], 0E0h
                or      byte ptr [bx+5], 1
                jmp     short loc_6F6E
apply_sword_hit_to_map_tiles endp
