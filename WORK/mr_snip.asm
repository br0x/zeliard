; ===========================================================================
; Attempts to scroll the dungeon one tile to the left (hero moves right).
; Mirror of move_hero_left_if_no_obstacles:
; 1. Check 4 tiles at hero x+2 for monsters or solid tiles.
; 2. If clear: increment proximity_map_left_col_x,
;    shift proximity map 1 column left (rep movsb forward),
;    unpack new rightmost column from packed_map_ptr_for_prox_right.
; 3. Call every_projectile_moves_left_in_viewport,
;    stamp newly-entering left-edge monsters.
; ===========================================================================
move_hero_right_if_no_obstacles proc near
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                inc     si
                inc     si              ; top right corner of hero 3x3 matrix
                mov     di, si
                sub     si, 36          ; y-- (tile above hero top right)
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                mov     cx, 4
loc_685C:        
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags
                add     al, al          ; destroyable walls have bit 7 set
                jnc     short loc_6864
                retn                    ; destroyable wall to the right of hero, can't move. CF
; ---------------------------------------------------------------------------
loc_6864:        
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                loop    loc_685C
                xchg    di, si          ; si: top right corner of hero 3x3 matrix
                test    byte ptr ds:squat_flag, 0FFh
                jnz     short loc_6884
                ; head level: need 2 checks
                mov     al, [si]
                call    is_non_blocking_tile ; ZF if can pass
                stc
                jz      short loc_687E
                retn    ; blocked to the right of hero, can't move. CF
; ---------------------------------------------------------------------------
loc_687E:        
                call    is_left_airflow
                jnc     short loc_6884
                retn    ; blocked by airflow to the right of hero, can't move. CF
; ---------------------------------------------------------------------------
; head-level checks finished, now body and feet:
loc_6884:        
                mov     cx, 2
loc_6887:        
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     al, [si]
                call    is_non_blocking_tile_simple
                stc
                jz      short loc_6896
                retn    ; blocked to the right of hero, can't move. CF
; ---------------------------------------------------------------------------
loc_6896:        
                push    cx
                call    is_left_airflow
                pop     cx
                jnc     short loc_689E
                retn    ; blocked by airflow to the right of hero, can't move. CF
; ---------------------------------------------------------------------------
loc_689E:        
                loop    loc_6887
; hero can move right
hero_moves_right:
                inc     word ptr ds:proximity_map_left_col_x
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 36-1
                cmp     ax, ds:mapWidth
                jne     short proximity_map_scrolls_left
                ; wrap needed
                mov     ds:packed_map_ptr_for_prox_right, (offset packed_map_end_ptr+1)
proximity_map_scrolls_left:   
                push    cs
                pop     es
                mov     si, offset proximity_map + 1
                mov     di, offset proximity_map
                mov     cx, 36*64-1
                rep movsb
                mov     si, ds:packed_map_ptr_for_prox_right
                inc     si
                mov     di, offset proximity_map+36-1 ; right column offset
                call    unpack_column
                dec     si
                mov     ds:packed_map_ptr_for_prox_right, si
                mov     ax, ds:proximity_map_left_col_x
                cmp     ax, ds:mapWidth
                jnz     short loc_68E7
                mov     word ptr ds:proximity_map_left_col_x, 0
                mov     si, offset packed_map_start
                jmp     short loc_68F8
; ---------------------------------------------------------------------------

loc_68E7:        
                mov     si, ds:packed_map_ptr_for_prox_left
                xor     dh, dh

unpack_left_column:       
                call    unpack_step_forward ; unpack extra column to /dev/null
                inc     si
                add     dh, bh
                cmp     dh, 64
                jb      short unpack_left_column ; unpack extra column to /dev/null

loc_68F8:        
                mov     ds:packed_map_ptr_for_prox_left, si
                call    every_projectile_moves_left_in_viewport
                mov     byte ptr ds:monster_index, 0
                mov     bx, ds:proximity_map_left_col_x
                add     bx, 36-1
                mov     ax, bx
                sub     ax, ds:mapWidth
                jb      short loc_6915
                mov     bx, ax
loc_6915:   ; spawn monsters to a new column if needed
                mov     si, ds:monsters_table_addr
next_monster1:    
                mov     ax, [si+monster.currX]
                cmp     ax, 0FFFFh  ; monsters list terminator
                jne     short loc_6921
                retn                    ; monsters end marker
; ---------------------------------------------------------------------------

loc_6921:        
                cmp     ah, 0FFh
                jz      short loc_6939
                cmp     ax, bx
                jnz     short loc_6939
                mov     ah, 35
                mov     al, [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     al, ds:monster_index
                or      al, 80h
                mov     [di], al    ; spawn a monster
loc_6939:        
                inc     byte ptr ds:monster_index
                add     si, 16
                jmp     short next_monster1
move_hero_right_if_no_obstacles endp


; ===========================================================================
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
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                mov     di, si
                sub     si, 36          ; y-- (tile above hero top left)
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                dec     si              ; tile NW of hero top left
                mov     cx, 4
check_4_tiles_to_the_left_of_hero:
                call    get_dst_monster_flags ; CF: no monster/item; NC: monster/item (NZ: non-passable, ZF: flying)
                                              ; AL = monster.flags
                add     al, al          ; destroyable walls have bit 7 set
                jnc     short loc_66BC
                retn                    ; destroyable wall to the left of hero, can't move
; ---------------------------------------------------------------------------

loc_66BC:        
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                loop    check_4_tiles_to_the_left_of_hero
                xchg    di, si          ; si: top left corner of hero 3x3 matrix
                test    byte ptr ds:squat_flag, 0FFh
                jnz     short loc_66DC
                ; head level: need 2 checks
                mov     al, [si]        ; tile where hero head will come
                call    is_non_blocking_tile ; ZF if can pass
                stc
                jz      short loc_66D6
                retn    ; blocked to the left of hero, can't move. CF
; ---------------------------------------------------------------------------
loc_66D6:        
                call    is_right_airflow
                jnc     short loc_66DC
                retn    ; blocked by airflow to the left of hero, can't move. CF
; ---------------------------------------------------------------------------
; head-level checks finished, now body and feet:
loc_66DC:        
                mov     cx, 2
loc_66DF:        
                add     si, 36          ; y++
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                mov     al, [si]
                call    is_non_blocking_tile_simple
                stc
                jz      short loc_66EE
                retn    ; blocked to the left of hero, can't move. CF
; ---------------------------------------------------------------------------
loc_66EE:        
                push    cx
                call    is_right_airflow
                pop     cx
                jnc     short loc_66F6
                retn    ; blocked by airflow to the left of hero, can't move. CF
; ---------------------------------------------------------------------------
loc_66F6:        
                loop    loc_66DF
; hero can move left
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
                mov     [di], al        ; spawn a monster

skip_monster:    
                inc     byte ptr ds:monster_index
                add     si, 16
                jmp     short next_monster
move_hero_left_if_no_obstacles endp
