

; ===========================================================================
; remove_accomplished_items
; Scans the accomplished_items_checker_table (MDT-embedded).
; For each entry: reads a savegame byte and checks a bitmask.
; If condition is met (item was already collected / boss defeated):
;   Iterates a list of (address, value) pairs and writes them to the monsters
;   table — effectively removing collected items or opening doors in memory.
; This reconciles the savegame state with the current MDT's monster list.
; ===========================================================================
remove_accomplished_items proc near
                mov     si, ds:accomplished_items_checker_table

next_item:       
                mov     di, [si]        ; addr to check against the mask
                cmp     di, 0FFFFh
                jnz     short loc_6C08
                retn
; ---------------------------------------------------------------------------

loc_6C08:        
                add     si, 3
                mov     al, [si-1]      ; mask to check
                and     al, [di]        ; boss defeated?
                jnz     short move_loop

skip_loop:       
                mov     di, [si]
                cmp     di, 0FFFFh
                jz      short loc_6C2F
                add     si, 4
                jmp     short skip_loop
; ---------------------------------------------------------------------------

move_loop:       
                mov     di, [si]        ; =c013, d65e,
                cmp     di, 0FFFFh
                jz      short loc_6C2F
                mov     ax, [si+2]
                mov     [di], ax
                add     si, 4
                jmp     short move_loop
; ---------------------------------------------------------------------------

loc_6C2F:        
                inc     si
                inc     si
                jmp     short next_item
remove_accomplished_items endp


; ===========================================================================
; render_place_and_gold_labels
; Renders the 'PLACE' and 'GOLD' text labels on the HUD bar (non-boss cavern).
; Uses hard-coded Pascal strings with pixel positions.
; ===========================================================================
render_place_and_gold_labels proc near
                mov     si, offset byte_6C44
                call    cs:Render_Pascal_String_0_proc
                mov     si, offset byte_6C4C
                call    cs:Render_Pascal_String_0_proc
                retn
render_place_and_gold_labels endp

; ---------------------------------------------------------------------------
byte_6C44       db 0Dh                  ; marginLeft
                db 0BBh                 ; marginTop
                db    1
aGold           db 4,'GOLD'
byte_6C4C       db 0Dh                  ; marginLeft
                db 0AFh                 ; marginTop
                db    1
aPlace          db 5,'PLACE'


; ===========================================================================
; render_hud_bars_with_enemy
; Sets up the HUD layout for boss encounters.
; Draws two HUD bar areas, copies a screen region, and renders the 'ENEMY' label.
; Called on boss cavern init and Jashiin cavern init.
; ===========================================================================
render_hud_bars_with_enemy proc near
                mov     bx, 210h
                xor     al, al
                mov     ch, 21h ; '!'
                call    cs:Clear_HUD_Bar_proc ; bh: paddingLeft
                                        ; bl: paddingTop
                                        ; al: masking mode
                mov     bx, 2310h
                mov     al, 80h
                mov     ch, 67h ; 'g'
                call    cs:Clear_HUD_Bar_proc ; bh: paddingLeft
                                        ; bl: paddingTop
                                        ; al: masking mode
                mov     bx, 0AA9h
                mov     dx, 0AB5h
                mov     cx, 0E03h
                call    cs:Copy_Screen_Rect_VRAM_proc
                mov     bx, 21Ch
                xor     al, al
                mov     ch, 42h ; 'B'
                call    cs:Clear_HUD_Bar_proc ; bh: paddingLeft
                                        ; bl: paddingTop
                                        ; al: masking mode
                mov     si, offset byte_6C8F
                jmp     cs:Render_Pascal_String_0_proc
render_hud_bars_with_enemy endp

; ---------------------------------------------------------------------------
byte_6C8F       db 0Dh                  ; marginLeft
                db 0AFh                 ; marginTop
                db    2
aEnemy          db 5,'ENEMY'


; ===========================================================================
; unpack_map
; Decompresses the column-RLE packed dungeon map into the 36×64 proximity map.
;
; The packed map (at packed_map_start in the MDT data) stores each column of
; 64 tile-rows as a sequence of RLE tokens. Column order is left-to-right.
;
; Steps:
;   1. Skip proximity_map_left_col_x columns (decompress to /dev/null).
;      Saves the pointer as packed_map_ptr_for_prox_left.
;   2. Decompress 36 columns into proximity_map[0..35].
;      Each column: call unpack_column (calls unpack_step_forward in a loop).
;      X wraps around mapWidth (circular world).
;   3. Save pointer as packed_map_ptr_for_prox_right.
;   4. Compute viewport_left_top_addr from viewport_top_row_y.
;
; ENCODING (4 cases based on high 2 bits of first byte):
;   00xxxxxx count_byte, tile_byte  → repeat tile (count+1) times
;   01xxxxxx nibble_encoded         → short RLE: count=(hi nibble)+2, tile=(lo+1)
;   10xxxxxx empty_count            → 0-tile run of (byte & 0x3F) rows
;   11xxxxxx single_tile            → 1 occurrence of tile (byte & 0x3F)
; ===========================================================================
unpack_map      proc near 
                mov     si, offset packed_map_start ; unpack to /dev/null by columns, until the hero_x-18 position (proximity map left edge)
                mov     cx, ds:proximity_map_left_col_x
                or      cx, cx
                jz      short loc_6CB2

columns_skip_loop:        
                xor     dh, dh          ; rows counter

loc_6CA5:        
                call    unpack_step_forward
                inc     si
                add     dh, bh
                cmp     dh, 64          ; last row?
                jb      short loc_6CA5
                loop    columns_skip_loop

loc_6CB2:        
                mov     ds:packed_map_ptr_for_prox_left, si ; unpack 36 columns from the hero_x_minus_18

                mov     di, offset proximity_map ; unpacked proximity map
                mov     ax, ds:proximity_map_left_col_x ; in absolute map coords
                mov     cx, 36          ; proximity map width
columns_loop:    
                push    di
                call    unpack_column
                pop     di
                inc     di
                inc     ax              ; x++
                cmp     ax, ds:mapWidth
                jnz     short loc_6CD1
                mov     si, offset packed_map_start ; continue from x=0 (map start)
                xor     ax, ax          ; x = 0
loc_6CD1:        
                loop    columns_loop    ; fill 36 columns
                
                or      ax, ax          ; x in absolute map coords
                jnz     short loc_6CDB  ;
                                        ; last column of map unpacked
                mov     si, ds:packed_map_end_ptr ; Malicia: [0xC019] = 0xD555; points behind the last byte of packed map
loc_6CDB:        
                dec     si
                mov     ds:packed_map_ptr_for_prox_right, si

                mov     al, ds:viewport_top_row_y ; 3d
                xor     ah, ah ; x = 0
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     ds:viewport_left_top_addr, di
                retn
unpack_map      endp


; ===========================================================================
; unpack_step_forward / unpack_step_backward
; Decode one RLE token from the packed map stream.
; Output: BH = repeat count, BL = tile value.
; 'forward' increments SI (for left→right decompression).
; 'backward' decrements SI (for right→left decompression when scrolling).
; Dispatch via a 4-entry function pointer table based on high 2 bits.
; ===========================================================================
unpack_step_forward proc near 
                mov     bl, [si]
                and     bl, 0C0h        ; 00h, 40h, 80h, 0C0h
                rol     bl, 1
                rol     bl, 1           ; 0, 1, 2, 3
                xor     bh, bh
                add     bx, bx
                jmp     ds:funcs_6CFA[bx]
unpack_step_forward endp

; ---------------------------------------------------------------------------
funcs_6CFA      dw offset unpack_forward_case0
                dw offset unpack_case1
                dw offset unpack_case2
                dw offset unpack_case3

; =============== S U B R O U T I N E =======================================


unpack_step_backward proc near
                mov     bl, [si]
                and     bl, 0C0h
                rol     bl, 1
                rol     bl, 1
                xor     bh, bh
                add     bx, bx
                jmp     ds:funcs_6D13[bx]
unpack_step_backward endp

; ---------------------------------------------------------------------------
funcs_6D13      dw offset unpack_backward_case0
                dw offset unpack_case1
                dw offset unpack_case2
                dw offset unpack_case3

; =============== S U B R O U T I N E =======================================

unpack_forward_case0 proc near
                mov     bh, [si]        ; 00...... ........
                inc     bh              ; count = (byte & 3fh)+1
                inc     si
                mov     bl, [si]        ; tile = next_byte
                retn
unpack_forward_case0 endp

unpack_backward_case0 proc near 
                mov     bl, [si]        ; bits 7..6 are 0; tile < 0x40
                dec     si
                mov     bh, [si]
                inc     bh
                retn
unpack_backward_case0 endp

unpack_case1    proc near 
                mov     bl, [si]
                mov     bh, bl
                shr     bh, 1
                shr     bh, 1
                shr     bh, 1
                shr     bh, 1
                and     bh, 3
                add     bh, 2
                and     bl, 0Fh
                inc     bl
                retn
unpack_case1    endp

unpack_case2    proc near 
                mov     bh, [si]
                and     bh, 3Fh
                xor     bl, bl
                retn
unpack_case2    endp

unpack_case3    proc near 
                mov     bl, [si]
                and     bl, 3Fh
                mov     bh, 1
                retn
unpack_case3    endp


; ===========================================================================
; Decompresses one full column (64 rows) into the proximity map.
; Input: SI = packed map pointer; DI = proximity_map + col_offset
; Writes each tile BH times at [DI], DI += 36 per row.
; Loops until 64 rows are filled (DL accumulates row count).
; ===========================================================================
unpack_column   proc near 
                xor     dl, dl          ; y=0
loc_6D59:        
                call    unpack_step_forward
                inc     si
                add     dl, bh          ; column height
loc_6D5F:        
                mov     [di], bl
                add     di, 36
                dec     bh
                jnz     short loc_6D5F
                cmp     dl, 64          ; 64 rows
                jb      short loc_6D59
                retn
unpack_column   endp


; =============== S U B R O U T I N E =======================================

; uint8_t y = AL
; uint8_t x = AH
; y &= 0x3F;
; uint16_t di = (y * 36) + x + 0xE000;
; ===========================================================================
; coords_in_ax_to_proximity_map_addr_in_di
; Converts relative (x, y) coordinates to a proximity map address.
; AL = y (0-63), AH = x (0-35); y masked to 6 bits.
; DI = (y & 0x3F) * 36 + x + 0xE000
; Frequently used by all collision, monster placement, and spell code.
; ===========================================================================
coords_in_ax_to_proximity_map_addr_in_di proc near ; ...
                push    bx
                and     al, 3Fh         ; y
                mov     bl, ah          ; x
                mov     bh, 36
                mul     bh              ; 36*y
                xor     bh, bh
                add     ax, bx
                add     ax, offset proximity_map
                mov     di, ax
                pop     bx
                retn
coords_in_ax_to_proximity_map_addr_in_di endp


; =============== S U B R O U T I N E =======================================

; if (si >= 0E900h) si -= 900h

; ===========================================================================
; wrap_map_from_above / wrap_map_from_below
; Maintain the circular 36×64 proximity map buffer (0xE000–0xE8FF).
; wrap_map_from_above: if SI >= 0xE900, subtract 0x900 (wrap past bottom).
; wrap_map_from_below: if SI <  0xE000, add    0x900 (wrap past top).
; Called after every SI offset adjustment
; ===========================================================================
wrap_map_from_above proc near 
                cmp     si, proximity_map + 36*64
                jnb     short loc_6D89
                retn
; ---------------------------------------------------------------------------

loc_6D89:        
                sub     si, 36*64
                retn
wrap_map_from_above endp


; =============== S U B R O U T I N E =======================================

; if (si < 0E000h) si += 900h

wrap_map_from_below proc near 
                cmp     si, proximity_map
                jb      short loc_6D95
                retn
; ---------------------------------------------------------------------------

loc_6D95:        
                add     si, 36*64
                retn
wrap_map_from_below endp


; ===========================================================================
; set_zero_flag_if_slippery
; Returns ZF=1 (slippery) if cavern_level == 4 (ice dungeon) AND hero is
; not wearing Ruzeria shoes (current_accessory != SHOES_RUZERIA).
; Used by sliding_physics_step and init_horizontal_sliding.
; ===========================================================================
set_zero_flag_if_slippery proc near
                cmp     byte ptr ds:cavern_level, 4 ; danger type: slippery ground
                jz      short loc_6DA2
                retn                    ; NZ
; ---------------------------------------------------------------------------

loc_6DA2:        
                cmp     byte ptr ds:current_accessory, SHOES_RUZERIA
                jnz     short no_ruzeria
                mov     al, 0FFh
                or      al, al
                retn                    ; NZ
; ---------------------------------------------------------------------------

no_ruzeria:      
                xor     al, al
                retn                    ; ZF
set_zero_flag_if_slippery endp


; =============== S U B R O U T I N E =======================================

; Hero is 3x3 matrix. Return top-left coord in SI
; // viewport left border starts +4 columns from the proximity map left edge
; uint16_t si = viewport_left_top_addr + 4 + hero_head_y_in_viewport * 36 + hero_x_in_viewport;
; if (si >= 0xE900) si -= 0x900;
; return si;
; ===========================================================================
; hero_coords_to_addr_in_proximity
; Returns SI = proximity map address of hero's top-left 8×8 tile.
; Formula: SI = viewport_left_top_addr + (hero_head_y_in_viewport * 36)
;              + hero_x_in_viewport + 4
; The +4 accounts for the 4-column dead-zone at the left edge of the
; proximity map (proximity is 36 wide, viewport is 28 wide, offset = 4).
; hero_x_in_viewport is normally 0x0C (column 12 = center).
; Result is wrapped through wrap_map_from_above.
; ===========================================================================
hero_coords_to_addr_in_proximity proc near ; ...
                mov     al, ds:hero_head_y_in_viewport ; =0xa
                mov     cl, 36
                mul     cl              ; =0x168
                mov     cl, ds:hero_x_in_viewport ; =0xc
                add     cl, 4           ; =0x10; viewport left border starts +4 columns from the proximity map left edge
                xor     ch, ch
                add     ax, cx          ; =0x178
                mov     si, ax
                add     si, ds:viewport_left_top_addr ; +(0xe894 = 0xe000 + 36*61)
                jmp     short wrap_map_from_above ; if (si >= 0E900h) si -= 900h
hero_coords_to_addr_in_proximity endp


; =============== S U B R O U T I N E =======================================

; CF: no monster
; NC: active monster; al=type, bx=monster struct

; ===========================================================================
; Reads one byte from the proximity map at [SI].
; If bit 7 is clear: CF=1 (no monster/item).
; If bit 7 is set: the low 7 bits are a monster_index (0-127).
;   Looks up monsters_table_addr + index*16 to get the monster struct.
;   Returns AL = monster.flags, BX = pointer to monster struct.
;   NC (no carry)
;   NZ if monster is non-passable; ZF if flying monster
; ===========================================================================
get_dst_monster_flags proc near 
                mov     al, [si]
                test    al, 80h
                stc
                jnz     short monster_there
                retn                    ; CF, ZF if no monster
; ---------------------------------------------------------------------------

monster_there:   
                and     al, 7Fh         ; monster id
                mov     cl, 10h         ; 16 bytes per monster
                mul     cl
                mov     bx, ax
                add     bx, ds:monsters_table_addr
                mov     al, [bx+monster.flags]
                or      al, al  ; NC; NZ if non-passable monster (non-flying); ZF if flying monster
                retn
get_dst_monster_flags endp


; =============== S U B R O U T I N E =======================================

; ZF if can pass

; ===========================================================================
; is_non_blocking_tile family
; Three variants checking whether a tile index in AL can be passed through.
;
; is_non_blocking_tile (fastest):
;   AL < 0x40 → lookup in 24-byte passable-tile table at seg1:8000h.
;   AL >= 0x40 → NZ (solid).
;
; is_non_blocking_tile_extended:
;   AL < 0x49 → table lookup.
;   Also checks bits 7:5 of AL for special cases (monster/item bytes 0x90-0x91).
;
; is_non_blocking_tile_simple:
;   AL < 0x49 → table lookup.
;   AL >= 0x80 → NZ (non-passable).
;
; The passable-tile table at seg1:8000h contains tile IDs like:
;   0x00 (air), 0x01/0x02 (rope), 0x08-0x19 (various walk-through tiles).
; Sets ZF=1 when passable, NZ when blocked.
; ===========================================================================
is_non_blocking_tile proc near
                cmp     al, 40h ; '@'
                jb      short lookup_shared
                cmp     al, al
                retn                    ; NZ: can't pass
is_non_blocking_tile endp


; =============== S U B R O U T I N E =======================================


is_non_blocking_tile_extended proc near
                cmp     al, 49h
                jb      short lookup_shared
                cmp     al, al
                retn
; ---------------------------------------------------------------------------

lookup_shared:   
                push    di
                push    cx
                mov     es, cs:seg1
                mov     di, 8000h       ; 00 01 02 08  09 0A 0B 0C  0F 10 11 12  13 14 15 16  17 18 19 00  00 00 00 00
                mov     cx, 24
                repne scasb
                pop     cx
                pop     di
                jnz     short loc_6E07
                retn                    ; ZF: one of passable tiles
; ---------------------------------------------------------------------------

loc_6E07:        
                and     al, 9Fh
                cmp     al, 90h
                jz      short cant_pass
                cmp     al, 91h
                jz      short cant_pass
                and     al, 80h
                cmp     al, 80h
                retn
; ---------------------------------------------------------------------------

cant_pass:       
                mov     al, 0FFh
                or      al, al
                retn                    ; NZ: cannot pass
is_non_blocking_tile_extended endp


; =============== S U B R O U T I N E =======================================


is_non_blocking_tile_simple proc near
                cmp     al, 49h ; 'I'
                jb      short loc_6E22
                cmp     al, al
                retn  ; ZF
; ---------------------------------------------------------------------------

loc_6E22:        
                push    di
                push    cx
                mov     es, cs:seg1
                mov     di, 8000h
                mov     cx, 24
                repne scasb
                pop     cx
                pop     di
                jnz     short loc_6E36
                retn
; ---------------------------------------------------------------------------

loc_6E36:        
                and     al, 80h
                cmp     al, 80h
                retn
is_non_blocking_tile_simple endp
