process_doors   proc near 
                mov     bp, ds:doors_table_addr

next_door:       
                mov     ax, ds:[bp+door.x0]
                cmp     ax, 0FFFFh      ; doors end marker
                jnz     short loc_78EB
                retn
; ---------------------------------------------------------------------------

loc_78EB:        
                call    calc_object_viewport_x_offset ; 1Ah: CF, bl=0E0h => skip; 3Dh: NC, bl=13h
                jc      short loc_7933
                mov     al, ds:[bp+door.d_flags]
                and     al, 7
                add     al, 61h
                mov     ds:closed_door_tiles+2, al
                mov     ds:opened_door_tiles+2, al
                mov     al, ds:[bp+door.y0]
                xor     ah, ah
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                cmp     bl, 4
                jb      short loc_7938
                mov     cx, bx
                sub     bl, 36+3
                neg     bl
                inc     bl
                mov     al, bl
                cmp     al, 6
                jb      short loc_791D
                mov     al, 5

loc_791D:        
                sub     cl, 4
                xor     ch, ch
                add     di, cx
                mov     si, offset opened_door_tiles
                test    ds:[bp+door.d_flags], 80h
                jnz     short loc_7951
                mov     si, offset closed_door_tiles
                jmp     short loc_7951
; ---------------------------------------------------------------------------

loc_7933:        
                add     bp, 0Ch
                jmp     short next_door
; ---------------------------------------------------------------------------

loc_7938:        
                mov     si, offset opened_door_tiles
                test    ds:[bp+door.d_flags], 80h
                jnz     short loc_7945
                mov     si, offset closed_door_tiles

loc_7945:        
                mov     al, bl
                inc     al
                mov     cl, 5
                sub     cl, al
                xor     ch, ch
                add     si, cx

loc_7951:        
                mov     cx, 4

four_times:      
                push    cx
                push    ax
                push    di
                push    si

al_times:        
                call    move_if_dst_high_bit_zero
                inc     di
                inc     si
                dec     al
                jnz     short al_times
                pop     si
                add     si, 5
                xchg    si, di
                pop     si
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    di, si
                pop     ax
                pop     cx
                loop    four_times
                jmp     short loc_7933
process_doors   endp


; Input: ax = door.x0
calc_object_viewport_x_offset proc near
                add     ax, 3           ; door.x0 + 3
                push    ax
                sub     ax, ds:mapWidth ; ax=door.x0 + 3 - mapWidth
                pop     bx              ; bx=door.x0 + 3
                jnb     short x_coord_wrapped
                xchg    ax, bx

x_coord_wrapped: 
                push    ax              ; door.x0 + 3
                sub     ax, ds:proximity_map_left_col_x ; ax=door.x0 + 3 - prox_left
                pop     bx              ; bx=door.x0 + 3
                jb      short loc_799C
                xchg    ax, bx          ; bx=door.x0 + 3 - prox_left
                mov     ax, 36+3
                sub     ax, bx          ; ax = 36 + prox_left - door.x0
                retn
; ---------------------------------------------------------------------------

loc_799C:        
                mov     ax, 36+3
                sub     ax, bx          ; ax=36 - door.x0
                jnb     short loc_79A4
                retn
; ---------------------------------------------------------------------------

loc_79A4:        
                mov     ax, ds:mapWidth
                sub     ax, ds:proximity_map_left_col_x
                add     ax, bx          ; ax=mapWidth - prox_left + door.x0 + 3
                                        ; bx=door.x0 + 3
                xchg    ax, bx          ; bx=mapWidth - prox_left + door.x0 + 3
                mov     ax, 36+3
                sub     ax, bx          ; ax=18+hero.x - door.x0 - mapWidth
                retn
calc_object_viewport_x_offset endp


move_if_dst_high_bit_zero proc near
                test    byte ptr [di], 80h
                jz      short loc_797C
                retn
loc_797C:        
                mov     dl, [si]
                mov     [di], dl
                retn
move_if_dst_high_bit_zero endp

; ---------------------------------------------------------------------------

closed_door_tiles       db 49h, 4Ah, 61h, 4Bh, 4Ch
                        db 4Dh, 4Fh, 50h, 51h, 4Eh
                        db 5Fh, 52h, 53h, 54h, 60h
                        db 5Fh, 55h, 56h, 57h, 60h

opened_door_tiles       db 49h, 4Ah, 61h, 4Bh, 4Ch
                        db 4Dh, 58h, 00h, 59h, 4Eh
                        db 5Fh, 5Ah, 00h, 5Bh, 60h
                        db 5Fh, 5Ch, 5Dh, 5Eh, 60h
