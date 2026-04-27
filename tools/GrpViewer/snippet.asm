                mov     es, cs:seg1
                mov     si, offset vfs_fman_grp
                mov     di, 6000h
                mov     al, 2           ; fn_2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, 6333h
                mov     bp, hero_transparency_masks
                mov     cx, 0E6h
                call    cs:Decompress_Tile_Data_proc
;;;;
                retn

; DS:SI - compressed data (will be unpacked in place)
; CX - number of 8x8 tiles to decompress
Decompress_Tile_Data proc near
                push    cx
                push    ds
                push    si
                mov     ax, cs
                add     ax, 3000h
                mov     es, ax          ; seg3
                mov     ax, 32
                mul     cx
                mov     cx, ax
                mov     di, 0
                rep movsb               ; copy compressed data to temp buffer
                pop     di
                pop     es
                pop     cx
                mov     ax, cs
                add     ax, 3000h
                mov     ds, ax          ; seg3
                mov     si, 0
next_tile:
                push    cx
                mov     cx, 8
next_row_of_8:
                push    cx
                lodsw
                xchg    ah, al
                mov     dx, ax
                lodsw
                xchg    ah, al
                mov     cx, ax
                mov     cs:plane0_buf, dx
                mov     cs:plane1_buf, cx
                or      ax, dx   ; combined = plane0|plane1
                mov     bx, ax   ; plane0|plane1
                shr     bx, 1    ; (plane0|plane1)>>1
                or      ax, bx   ; combined | (combined>>1)
                add     bx, bx
                add     bx, bx   ; combined<<2
                or      ax, bx   ; combined | (combined>>1) | (combined<<2)
                not     ax
                mov     cs:transparency_mask_bitplane_f, ax
                call    build_16_bits_from_2_planes
                mov     ax, dx
                stosw
                call    build_16_bits_from_2_planes
                mov     ax, dx
                stosw
                call    extract_transparency_byte_from_mask_plane_f
                mov     es:[bp+0], dl
                inc     bp
                pop     cx
                loop    next_row_of_8
                pop     cx
                loop    next_tile
                retn
Decompress_Tile_Data endp

; first run:
; DX = p1_15:p0_15:p1_14:p0_14:p1_13:p0_13:p1_12:p0_12:p1_11:p0_11:p1_10:p0_10:p1_9:p0_9:p1_8:p0_8
; second run:
; DX = p1_7:p0_7:p1_6:p0_6:p1_5:p0_5:p1_4:p0_4:p1_3:p0_3:p1_2:p0_2:p1_1:p0_1:p1_0:p0_0
build_16_bits_from_2_planes proc near
                mov     cx, 4
loc_4F4B:
                rol     word ptr cs:plane1_buf, 1
                adc     dx, dx
                rol     word ptr cs:plane0_buf, 1
                adc     dx, dx
                rol     word ptr cs:plane1_buf, 1
                adc     dx, dx
                rol     word ptr cs:plane0_buf, 1
                adc     dx, dx
                loop    loc_4F4B
                retn
build_16_bits_from_2_planes endp


; =============== S U B R O U T I N E =======================================

; Input: none (transparency_mask_bitplane_f is used)
; Output: dl = transparency byte
extract_transparency_byte_from_mask_plane_f proc near
                mov     cx, 8
loc_4F6D:
                xor     al, al
                rol     cs:transparency_mask_bitplane_f, 1
                adc     al, al
                rol     cs:transparency_mask_bitplane_f, 1
                adc     al, al
                cmp     al, 11b
                je      short loc_4F83
                xor     al, al
loc_4F83:
                and     al, 1
                add     dl, dl
                or      dl, al
                loop    loc_4F6D
                retn
extract_transparency_byte_from_mask_plane_f endp

plane0_buf                dw 0       
plane1_buf                dw 0
transparency_mask_bitplane_f dw 0       

; SI: pointer to tile indices from fman header 6000h..6332h
; CX: number of tiles to render
Render_Tile proc near
                push    cx
                mov     al, es:[si]
                or      al, al
                jz      short skip_empty
                push    es
                push    ds
                push    si
                push    di
                mov     ch, 32
                mul     ch      ; ax = tile_id * 32; 32 bytes per tile (1 nibble per pixel)
                mov     si, ax
                add     si, fman_gfx + 333h  ; si points to tile data
                shr     ax, 1
                shr     ax, 1   ; ax = tile_id * 8; 8 bytes per tile mask (1 bit per pixel)
                mov     bp, ax
                add     bp, hero_transparency_masks  ; bp points to transparency data
                mov     ds, word ptr cs:seg1 ; seg1
                mov     di, dx  ; ignore it - will be overwritten anyway
                push    cs
                pop     es
                mov     al, cs:hero_tile_col_idx
                mov     cl, 64
                mul     cl
                add     ax, offset sword_anim_frames
                mov     di, ax  ; screen destination address
                call    render_2bpp_tile
                pop     di
                pop     si
                pop     ds
                pop     es

skip_empty:
                inc     si
                inc     ds:hero_tile_col_idx
                pop     cx
                loop    Render_Scrolling_Tile
                retn
Render_Tile endp

; SI: pointer to tile data (packed nibbles)
; BP: transparency data (1 bit per pixel)
; ES:DI: screen destination address
render_2bpp_tile:
                mov     cx, 8
loc_3629:
                push    cx
                mov     dl, ds:[bp+0]      ; blit mask
                lodsw                      ; 4 nibbles for extracting and blitting
                call    four_pixels_or_blit ; DL bits 7..4 - 4 bits to AND-blit background es:[di]
                                            ; AX: 4 nibbles to translate via LUT and OR-blit es:[di]
                lodsw                      ; next 4 nibbles
                call    four_pixels_or_blit ; DL bits 7..4 - 4 bits to AND-blit background es:[di]
                                            ; AX: 4 nibbles to translate via LUT and OR-blit es:[di]
                inc     bp
                pop     cx
                loop    loc_3629
                retn

; Input: AX: 4 nibbles to translate via LUT and OR-blit es:[di]
;        DL: bits 7..4 - 4 bits to AND-blit background es:[di]
;        ES:DI: destination address
; Output: DL <<= 4
four_pixels_or_blit proc near
                mov     cx, 4
loc_363E:
                add     dl, dl ; extract dl bit7
                sbb     dh, dh ; dh = 0 or ff
                and     dh, es:[di] ; clear BG or use BG
                call    get_pixel_from_table_by_ah_hi ; BL = cs:nibble_decode_lut[AH 7...4]
                or      bl, dh
                mov     es:[di], bl ; OR-blit dest. pixel with extracted
                inc     di
                loop    loc_363E
                retn
four_pixels_or_blit endp

; BL = cs:nibble_decode_lut[AH 7...4]
get_pixel_from_table_by_ah_hi proc near
                add     ax, ax
                adc     bx, bx
                add     ax, ax
                adc     bx, bx
                add     ax, ax
                adc     bx, bx
                add     ax, ax
                adc     bx, bx
                and     bx, 0Fh
                add     bx, cs:nibble_decode_lut ; 16 bytes table addr
                mov     bl, cs:[bx]
                retn
get_pixel_from_table_by_ah_hi endp

nibble_decode_lut  dw 0       
pal_decode_tbl     dw offset pal_decode_data0
                   dw offset pal_decode_data1
                   dw offset pal_decode_data2
                   dw offset pal_decode_data3
                   dw offset pal_decode_data4
                   dw offset pal_decode_data3
pal_decode_data0   db 0, 1, 2, 3, 8, 9, 0Ah, 0Bh, 10h, 11h, 12h, 13h, 18h, 19h, 1Ah, 1Bh
pal_decode_data1   db 0, 2, 4, 6, 10h, 12h, 14h, 16h, 20h, 22h, 24h, 26h, 30h, 32h, 34h, 36h
pal_decode_data2   db 0, 1, 4, 5, 8, 9, 0Ch, 0Dh, 20h, 21h, 24h, 25h, 28h, 29h, 2Ch, 2Dh
pal_decode_data3   db 0, 5, 6, 7, 28h, 2Dh, 2Eh, 2Fh, 30h, 35h, 36h, 37h, 38h, 3Dh, 3Eh, 3Fh
pal_decode_data4   db 0, 6, 5, 7, 30h, 36h, 35h, 37h, 28h, 2Eh, 2Dh, 2Fh, 38h, 3Eh, 3Dh, 3Fh
