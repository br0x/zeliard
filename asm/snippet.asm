
render_vertical_platforms_to_proximity proc near
                mov     si, ds:vertical_platforms_table_addr
next_vert_platform:
                mov     ax, [si+vert_platform.x]
                cmp     ax, 0FFFFh
                jnz     short loc_7FBD
                retn
; ---------------------------------------------------------------------------

loc_7FBD:        
                call    abs_x_to_proximity_rel
                jb      short loc_7FD7
                mov     ah, bl
                mov     al, [si+vert_platform.y]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                                                ; uint8_t x = AH
                                                                ; y &= 0x3F; // Clamp Y to 0-63
                                                                ; uint16_t di = (y * 36) + x + 0xE000;
                mov     cx, 3       ; 3 platform tiles
                mov     dl, 40h     ; vertical platform has tiles 0x40, 0x41, 0x42

loc_7FCF:        
                call    put_dl_to_proximity_layered
                inc     di              ; x++
                inc     dl              ; next platform tile
                loop    loc_7FCF

loc_7FD7:        
                add     si, 3
                jmp     short next_vert_platform
render_vertical_platforms_to_proximity endp
