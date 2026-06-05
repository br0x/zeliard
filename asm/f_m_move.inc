

; ===========================================================================
; move_monster_E / NE / N / NW / W / SW / S / SE
; Called by Monster_AI_proc (eai*.bin) to move a monster one step.
;
; Each direction has a range check for m_x_rel (proximity column):
;   E/NE/SE: allowed when m_x_rel <= 33 (keep inside right margin)
;   W/NW/SW: allowed when m_x_rel >= 2  (keep inside left margin)
;   N/S: allowed when m_x_rel is 1-34.
; Then calls the corresponding check_collision_X2 routine.
; If no collision: adjusts currX/currY (with map wrapping) and m_x_rel.
;
; COORDINATE SYSTEM:
;   +X = East (right), +Y = South (down) — same as screen.
;   incrementX / decrementX: wrap at mapWidth.
;   incrementY / decrementY: mask to 0x3F (map always 64 rows tall).
; ===========================================================================
move_monster_E  proc near 
                cmp     [si+monster.m_x_rel], 34 ; Movement State / Frame Counter
                                        ; if 0..33 => Carry
                cmc                     ; if 0..33 => no carry
                jnb     short loc_91ED
                retn                    ; phase >= 34
; ---------------------------------------------------------------------------

loc_91ED:        
                call    check_collision_E2 ; case 0..33
                jnb     short loc_91F3
                retn
; ---------------------------------------------------------------------------

loc_91F3:        
                jmp     incrementX
move_monster_E  endp


; =============== S U B R O U T I N E =======================================


move_monster_NE proc near 
                cmp     [si+monster.m_x_rel], 34 ; Movement State / Frame Counter
                                        ; if 0..33 => Carry
                cmc
                jnb     short loc_91FE
                retn                    ; phase >= 34
; ---------------------------------------------------------------------------

loc_91FE:        
                call    check_collision_NE2
                jnb     short incX_decY
                retn
; ---------------------------------------------------------------------------

incX_decY:       
                call    incrementX
                jmp     decrementY
move_monster_NE endp


; =============== S U B R O U T I N E =======================================


move_monster_N  proc near 
                mov     al, [si+monster.m_x_rel] ; Movement State / Frame Counter
                or      al, al
                stc
                jnz     short loc_9213
                retn                    ; zero phase
; ---------------------------------------------------------------------------

loc_9213:        
                cmp     al, 35
                stc
                jnz     short loc_9219
                retn                    ; phase 35
; ---------------------------------------------------------------------------

loc_9219:        
                call    check_collision_N2
                jnb     short loc_921F
                retn
; ---------------------------------------------------------------------------

loc_921F:        
                jmp     decrementY
move_monster_N  endp


; =============== S U B R O U T I N E =======================================


move_monster_NW proc near 
                cmp     [si+monster.m_x_rel], 2
                jnb     short loc_9229
                retn                    ; phase < 2
; ---------------------------------------------------------------------------

loc_9229:        
                call    check_collision_NW2
                jnb     short decX_decY
                retn
; ---------------------------------------------------------------------------

decX_decY:       
                call    decrementX
                jmp     short decrementY
move_monster_NW endp


; =============== S U B R O U T I N E =======================================


move_monster_W  proc near 
                cmp     [si+monster.m_x_rel], 2
                jnb     short loc_923B
                retn                    ; phase < 2
; ---------------------------------------------------------------------------

loc_923B:        
                call    check_collision_W2
                jnb     short loc_9241
                retn
; ---------------------------------------------------------------------------

loc_9241:        
                jmp     short decrementX
move_monster_W  endp


; =============== S U B R O U T I N E =======================================


move_monster_SW proc near 
                cmp     [si+monster.m_x_rel], 2
                jnb     short loc_924A
                retn                    ; phase < 2
; ---------------------------------------------------------------------------

loc_924A:        
                call    check_collision_SW2
                jnb     short decX_incY_
                retn
; ---------------------------------------------------------------------------

decX_incY_:       
                call    decrementX
                jmp     short incrementY
move_monster_SW endp


; =============== S U B R O U T I N E =======================================


move_monster_S  proc near 
                mov     al, [si+monster.m_x_rel]
                or      al, al
                stc
                jnz     short non_zero
                retn                    ; phase=0
; ---------------------------------------------------------------------------

non_zero:        
                cmp     al, 35
                stc
                jnz     short less_35
                retn                    ; phase=35
; ---------------------------------------------------------------------------

less_35:         
                call    check_collision_S2
                jnb     short loc_926A
                retn
; ---------------------------------------------------------------------------

loc_926A:        
                jmp     short incrementY
; ---------------------------------------------------------------------------

move_monster_SE: 
                cmp     [si+monster.m_x_rel], 34
                cmc
                jnb     short phase0_33
                retn                    ; phase >= 34
; ---------------------------------------------------------------------------

phase0_33:       
                call    check_collision_SE2
                jnb     short incX_incY_
                retn
; ---------------------------------------------------------------------------

incX_incY_:       
                call    incrementX
                jmp     short incrementY
; ---------------------------------------------------------------------------

incrementX:      
                mov     ax, [si]        ; current X coord
                inc     ax              ; try to move right
                mov     bx, ax
                sub     bx, ds:mapWidth
                jb      short loc_928C
                mov     ax, bx          ; wrap X

loc_928C:        
                mov     [si+monster.currX], ax ; monster X coord update
                inc     [si+monster.m_x_rel]
                clc
                retn
; ---------------------------------------------------------------------------

decrementX:      
                mov     ax, [si+monster.currX]
                or      ax, ax
                jnz     short loc_929C
                mov     ax, ds:mapWidth

loc_929C:        
                dec     ax
                mov     [si+monster.currX], ax
                dec     [si+monster.m_x_rel]
                clc
                retn
; ---------------------------------------------------------------------------

incrementY:      
                inc     [si+monster.currY]
                and     [si+monster.currY], 3Fh ; wrap Y: dungeon map height is always 64
                retn
move_monster_S  endp

; ---------------------------------------------------------------------------

decrementY:      
                dec     [si+monster.currY]
                and     [si+monster.currY], 3Fh ; wrap Y: dungeon map height is always 64
                retn


; ===========================================================================
; check_collision_E2 / W2 / N2 / S2 / NE2 / SE2 / NW2 / SW2
; Collision detection for a 2×2-tile monster footprint.
;
; Each function checks a set of proximity map tiles in the direction of
; movement. Monster occupies tiles (0,0) and (1,0) (or (0,0),(0,1) for N/S).
; Returns CF=1 if any tile in the 'leading edge' is blocked.
;
; Tile categorization for level 5 (wind-tunnel) caverns:
;   - Airflow category 1 (left-flowing): blocks Westward movement (is_left_airflow).
;   - Airflow category 2 (right-flowing): blocks Eastward movement.
;
; CF detection trick: OR multiple proximity bytes together,
; then 'add al, al' → shifts bit 7 into CF. If any byte had bit 7 set
; (= monster/item marker), CF fires — used as second-layer monster detection.
; ===========================================================================
check_collision_E2 proc near  
                mov     ax, word ptr [si+monster.currY] ; monster Y coord
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                inc     di
                inc     di              ; x+=2, check (+2, 0)
                call    check_collision_E_including_danger5
                jnb     short loc_92C2
                retn
; ---------------------------------------------------------------------------

loc_92C2:        
                xchg    si, di
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di          ; check (+2, +1)
                call    check_collision_E_including_danger5
                jnb     short loc_92D2
                retn
; ---------------------------------------------------------------------------

loc_92D2:        
                xchg    si, di
                mov     al, [si]        ; (+2, +1)
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                or      al, [si]        ; (+2, +1)|(+2, 0)
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                or      al, [si]        ; (+2, +1)|(+2, 0)|(+2, -1)
                xchg    si, di
                add     al, al          ; ..?
                                        ; x.?
                                        ; ..?
                retn                    ; CF is only set if any of {(+2, +1), (+2, 0), (+2, -1)} has high bit set (negative)
check_collision_E2 endp

check_collision_E_including_danger5 proc near
                mov     al, [di]
                call    if_passable_set_ZF
                stc
                jz      short loc_92F4
                retn
; ---------------------------------------------------------------------------

loc_92F4:        
                cmp     byte ptr ds:cavern_level, 5
                clc
                jz      short loc_92FD
                retn
; ---------------------------------------------------------------------------

loc_92FD:        
                push    si
                call    get_airflow_direction ; Is input tile an airflow?
                                        ; Input: al
                                        ; Output:
                                        ; NZ, cl=0xff (no airflow)
                                        ; ZF, cl=0 (Up), 1 (Left), 2 (Right)
                pop     si
                dec     cl
                clc
                jz      short category_1
                retn
; ---------------------------------------------------------------------------

category_1:      
                stc
                retn
check_collision_E_including_danger5 endp

; =============== S U B R O U T I N E =======================================


check_collision_W2 proc near  
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                dec     di              ; x--, check (-1, 0)
                call    check_collision_W_including_danger5
                jnb     short loc_9317
                retn                    ; CF if (-1, 0) unpassable, including danger 5
; ---------------------------------------------------------------------------

loc_9317:        
                xchg    si, di
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di          ; check (-1, +1)
                call    check_collision_W_including_danger5
                jnb     short loc_9327
                retn                    ; CF if (-1, +1) unpassable, including danger 5
; ---------------------------------------------------------------------------

loc_9327:        
                dec     di              ; x--
                xchg    si, di
                mov     al, [si]        ; (-2, +1)
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                or      al, [si]        ; (-2, +1)|(-2, 0)
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                or      al, [si]        ; (-2, +1)|(-2, 0)|(-2, -1)
                xchg    si, di          ; ?..
                                        ; ??x
                                        ; ??.
                add     al, al          ; CF is only set if any of {(-2, +1), (-2, 0), (-2, -1)} has high bit set (negative)
                retn
check_collision_W2 endp


; =============== S U B R O U T I N E =======================================


check_collision_W_including_danger5 proc near
                mov     al, [di]
                call    if_passable_set_ZF
                stc
                jz      short loc_934A
                retn
; ---------------------------------------------------------------------------

loc_934A:        
                cmp     byte ptr ds:cavern_level, 5
                clc
                jz      short danger_five
                retn                    ; no danger 5, NC
; ---------------------------------------------------------------------------

danger_five:     
                push    si
                call    get_airflow_direction ; Is input tile an airflow?
                                        ; Input: al
                                        ; Output:
                                        ; NZ, cl=0xff (no airflow)
                                        ; ZF, cl=0 (Up), 1 (Left), 2 (Right)
                pop     si
                dec     cl
                dec     cl
                clc
                jz      short category_2
                retn
; ---------------------------------------------------------------------------

category_2:      
                stc                     ; non passable, CF
                retn
check_collision_W_including_danger5 endp


; =============== S U B R O U T I N E =======================================


check_collision_N2 proc near  
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                xchg    si, di
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xchg    si, di
                mov     al, [di]        ; check (0, -1)
                call    if_passable_set_ZF
                stc
                jz      short loc_937B
                retn
; ---------------------------------------------------------------------------

loc_937B:        
                mov     al, [di+1]      ; check (+1, -1)
                call    if_passable_set_ZF
                stc
                jz      short loc_9385
                retn
; ---------------------------------------------------------------------------

loc_9385:        
                xchg    si, di
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xchg    si, di
                mov     al, [di+1]      ; (+1, -2)
                or      al, [di]        ; (+1, -2)|(0, -2)
                or      al, [di-1]      ; (+1, -2)|(0, -2)|(-1, -2)
                add     al, al          ; ???
                                        ; ?.?
                                        ; .x.
                retn                    ; CF is only set if any of {(+1, -2), (0, -2), (-1, -2)} has high bit set (negative)
check_collision_N2 endp


; =============== S U B R O U T I N E =======================================


check_collision_S2 proc near  
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                xchg    si, di
                add     si, 36*2
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                mov     al, [di]        ; check (0, +2)
                call    if_passable_set_ZF
                stc
                jz      short loc_93B3
                retn                    ; tile (0, +2) is solid, CF set
; ---------------------------------------------------------------------------

loc_93B3:        
                mov     al, [di+1]      ; check (+1, +2)
                call    if_passable_set_ZF
                stc
                jz      short loc_93BD
                retn                    ; tile (1, +2) is solid, CF set
; ---------------------------------------------------------------------------

loc_93BD:        
                or      al, [di]        ; al=(+1, +2)|(0, +2)
                or      al, [di-1]      ; al=(+1, +2)|(0, +2)|(-1, +2)
                add     al, al          ; .x.
                 
                                        ; ???
                retn                    ; CF is only set if any of {(+1, +2), (0, +2), (-1, +2)} has high bit set (negative)
check_collision_S2 endp


; =============== S U B R O U T I N E =======================================


check_collision_NE2 proc near 
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                inc     di
                inc     di              ; x+=2
                mov     al, [di]        ; check (+2, 0)
                call    if_passable_set_ZF
                stc
                jz      short loc_93D6
                retn
; ---------------------------------------------------------------------------

loc_93D6:        
                mov     cl, al          ; cl=(+2, 0)
                xchg    si, di
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xchg    si, di
                mov     al, [di]        ; check (+2, -1)
                call    if_passable_set_ZF
                stc
                jz      short loc_93EB
                retn
; ---------------------------------------------------------------------------

loc_93EB:        
                or      cl, al          ; cl=(+2, 0)|(+2, -1)
                mov     al, [di-1]      ; check (+1, -1)
                call    if_passable_set_ZF
                stc
                jz      short loc_93F7
                retn
; ---------------------------------------------------------------------------

loc_93F7:        
                xchg    si, di
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xchg    si, di
                or      cl, [di]        ; cl=(+2, 0)|(+2, -1)|(+2, -2)
                or      cl, [di-1]      ; cl=(+2, 0)|(+2, -1)|(+2, -2)|(+1, -2)
                or      cl, [di-2]      ; cl=(+2, 0)|(+2, -1)|(+2, -2)|(+1, -2)|(0, -2)
                add     cl, cl          ; ???
                                        ; .??
                                        ; x.?
                retn
check_collision_NE2 endp


; =============== S U B R O U T I N E =======================================


check_collision_SE2 proc near 
                mov     ax, word ptr [si+monster.currY] ; al=currY, ah=phase
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                inc     di
                inc     di
                mov     cl, [di]        ; save tile (+2, 0)
                xchg    si, di          ; si: proximity map, di: monster struc
                add     si, 36          ; move 1 down
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di          ; di: proximity map, si: monster struc
                mov     al, [di]        ; check tile (+2, +1)
                call    if_passable_set_ZF
                stc
                jz      short loc_9429
                retn                    ; tile (+2, +1) is solid, CF set
; ---------------------------------------------------------------------------

loc_9429:        
                or      cl, al          ; cl=(+2, 0)|(+2, +1)
                xchg    si, di          ; si: proximity map, di: monster struc
                add     si, 36          ; move 1 down
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di          ; di: proximity map, si: monster struc
                mov     al, [di]        ; check tile (+2, +2)
                call    if_passable_set_ZF
                stc
                jz      short loc_943E
                retn                    ; tile (+2, +2) is solid, CF set
; ---------------------------------------------------------------------------

loc_943E:        
                or      cl, al          ; cl=(+2, 0)|(+2, +1)|(+2, +2)
                mov     al, [di-1]      ; check tile (+1, +2)
                call    if_passable_set_ZF
                stc
                jz      short loc_944A
                retn                    ; tile (+1, +2) is solid, CF set
; ---------------------------------------------------------------------------

loc_944A:        
                or      cl, al          ; cl = (+2, 0) | (+2, +1) | (+2, +2) | (+1, +2)
                or      cl, [di-2]      ; cl = (+2, 0) | (+2, +1) | (+2, +2) | (+1, +2) | (0, +2)
                add     cl, cl          ; x.?
                                        ; ..?
                                        ; ???
                retn                    ; CF is only set if any of {(+2, 0), (+2, +1), (+2, +2), (+1, +2), (0, +2)} has high bit set (negative)
check_collision_SE2 endp


; =============== S U B R O U T I N E =======================================


check_collision_NW2 proc near 
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                dec     di              ; x--
                mov     al, [di]        ; check (-1, 0)
                call    if_passable_set_ZF
                stc
                jz      short loc_9462
                retn
; ---------------------------------------------------------------------------

loc_9462:        
                dec     di              ; x--
                mov     cl, [di]        ; cl=(-2, 0)
                xchg    si, di
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xchg    si, di
                or      cl, [di]        ; cl=(-2, 0)|(-2, -1)
                mov     al, [di+1]      ; check (-1, -1)
                call    if_passable_set_ZF
                stc
                jz      short loc_947B
                retn
; ---------------------------------------------------------------------------

loc_947B:        
                mov     al, [di+2]      ; check (0, -1)
                call    if_passable_set_ZF
                stc
                jz      short loc_9485
                retn
; ---------------------------------------------------------------------------

loc_9485:        
                xchg    si, di
                sub     si, 36          ; y--
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                xchg    si, di
                or      cl, [di+2]      ; cl=(-2, 0)|(-2, -1)|(0, -2)
                or      cl, [di+1]      ; cl=(-2, 0)|(-2, -1)|(0, -2)|(-1, -2)
                or      cl, [di]        ; cl=(-2, 0)|(-2, -1)|(0, -2)|(-1, -2)|(-2, -2)
                add     cl, cl          ; ???
                                        ; ??.
                                        ; ??x
                retn                    ; CF is only set if any of {(-2, 0), (-2, -1), (0, -2), (-1, -2), (-2, -2)} has high bit set (negative)
check_collision_NW2 endp


; =============== S U B R O U T I N E =======================================


check_collision_SW2 proc near 
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                dec     di
                dec     di              ; x-=2
                mov     cl, [di]        ; check (-2, 0)
                xchg    si, di
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                or      cl, [di]        ; cl=(-2, 0)|(-2, +1)
                inc     di
                mov     al, [di]        ; check (-1, +1)
                call    if_passable_set_ZF
                stc
                jz      short loc_94BA
                retn
; ---------------------------------------------------------------------------

loc_94BA:        
                xchg    si, di
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                mov     al, [di]        ; check (-1, +2)
                call    if_passable_set_ZF
                stc
                jz      short loc_94CD
                retn
; ---------------------------------------------------------------------------

loc_94CD:        
                or      cl, al          ; cl=(-2, 0)|(-2, +1)|(-1, +2)
                mov     al, [di+1]      ; check (0, +2)
                call    if_passable_set_ZF
                stc
                jz      short loc_94D9
                retn
; ---------------------------------------------------------------------------

loc_94D9:        
                or      cl, al          ; cl=(-2, 0)|(-2, +1)|(-1, +2)|(0, +2)
                or      cl, [di-1]      ; cl=(-2, 0)|(-2, +1)|(-1, +2)|(0, +2)|(-2, +2)
                add     cl, cl          ; ?.x
                                        ; ?..
                                        ; ???
                retn                    ; CF is only set if any of {(-2, 0), (-2, +1), (-1, +2), (0, +2), (-2, +2)} has high bit set (negative)
check_collision_SW2 endp


; ===========================================================================
; if_passable_set_ZF
; Core passability test used by monster collision checks.
; AL = tile value.
;   AL >= 0x80: NZ (non-passable — monster or item marker)
;   AL in 73-127: NZ (solid tile range)
;   AL < 73: search the 24-byte passable list at seg1:8000h.
;            ZF=1 if found (passable), NZ if not.
; Note: this is subtly different from is_non_blocking_tile_extended,
; which does NOT use the 73-based threshold (uses 0x40 and 0x49 variants).
; ===========================================================================
if_passable_set_ZF proc near  
                cmp     al, 73    ; aka 0x49
                jb      short in_zero_to_72
                or      al, al
                jns     short in_73_to_127
                retn                    ; for >= 80h return NZ (non-passable item or monster)
; ---------------------------------------------------------------------------

in_73_to_127:    
                cmp     al, al
                retn                    ; for 73..127 return NZ (non-passable)
; ---------------------------------------------------------------------------

in_zero_to_72:   
                push    di
                push    cx
                mov     es, cs:seg1
                mov     di, 8000h
                mov     cx, 24
                repne scasb             ; al in (00 01 02 08 09 0A 0B 0C 0F 10 11 12 13 14 15 16 17 18 19 00 00 00 00 00)
                pop     cx
                pop     di
                retn                    ; ZF if one of predefined passable tiles; NZ otherwise
if_passable_set_ZF endp
