render_hero_sword proc near

                mov     al, ds:viewport_rows_remaining
                neg     al
                add     al, 18
                mov     cl, al
                test    byte ptr ds:sword_swing_flag, 0FFh
                jnz     short loc_3E18
                mov     al, ds:hero_head_y_in_viewport      ; hero_head_y_in_viewport
                sub     al, 2
                cmp     al, cl
                jnz     short locret_3E17
                call    Copy_Tile_Buffer_To_VRAM
locret_3E17:
                retn
loc_3E18:
                mov     al, ds:hero_head_y_in_viewport
                sub     al, 5
                cmp     cl, al
                jnb     short loc_3E22
                retn
loc_3E22:
                jnz     short loc_3E2A
                call    Flush_Ui_Element_If_Dirty           ; draws upper half of hero
                jmp     Copy_Tile_Buffer_To_VRAM            ; draws full hero, no sword drawn
loc_3E2A:
                add     al, 10
                cmp     al, cl
                jz      short loc_3E31
                retn
loc_3E31:
                jmp     Sword_Overlay_EntryPoint
render_hero_sword endp

;=====
Copy_Tile_Buffer_To_VRAM proc near
                test    byte ptr ds:hero_sprite_hidden, 0FFh
                jz      short loc_40F8
                retn
loc_40F8:
                mov     byte ptr ds:hero_sprite_hidden, 0FFh
loc_40FD:
                push    es
                push    ds
                push    si
                push    di
                push    bx
                mov     ax, 0A000h
                mov     es, ax  ; VRAM segment
                mov     si, offset nine_unpacked_tiles
                mov     di, cs:hero_vram_base
                mov     cx, 3
loc_4112:
                push    cx
                mov     cx, 3
loc_4116:
                push    cx
                push    di
                call    Copy_tile    ; Copies 64 bytes (8x8px) from DS:SI
                pop     di
                add     di, 8
                pop     cx
                loop    loc_4116
                add     di, 320*8-24
                pop     cx
                loop    loc_4112
                pop     bx
                pop     di
                pop     si
                pop     ds
                pop     es
                retn
Copy_Tile_Buffer_To_VRAM endp

;=====
Copy_tile       proc near
                mov     cx, 8
loc_368D:
                movsw
                movsw
                movsw
                movsw
                add     di, 320-8
                loop    loc_368D
                retn
Copy_tile       endp

;=====
Flush_Ui_Element_If_Dirty proc near
                test    byte ptr ds:ui_element_dirty, 0FFh
                jnz     short loc_3F31
                retn
loc_3F31:
                push    es
                push    di
                push    si
                push    bx
                call    Blit32x32SpriteToVram
                pop     bx
                pop     si
                pop     di
                pop     es
                mov     byte ptr ds:ui_element_dirty, 0
                retn
Flush_Ui_Element_If_Dirty endp

;=====
Blit32x32SpriteToVram proc near
                push    ds
                mov     di, cs:entity_vram_src ; set in Render_Sword_Overlay
                mov     ax, 0A000h
                mov     es, ax  ; VRAM segment
                mov     ds, ax
                mov     si, 64064 ; VRAM shadow address + 64
                mov     cx, 32
loc_3F77:
                push    cx
                mov     cx, 16
                rep movsw
                add     di, 320-32
                pop     cx
                loop    loc_3F77
                pop     ds
                retn
Blit32x32SpriteToVram endp

;=====
Sword_Overlay_EntryPoint:
                test    byte ptr ds:sword_swing_flag, 0FFh
                jnz     short loc_3FD8
                retn                    ; sword in sheath, no need to render
loc_3FD8:
                mov     byte ptr ds:ui_element_dirty, 0FFh
                push    es
                push    ds
                push    di
                push    si
                push    bx
                call    Clear_Tile_Cache_Around_Hero
                call    Copy4x4TilesFromScreenToShadowBuffer ; hero upper half
                xor     bx, bx
                mov     bl, cs:sword_type
                dec     bl
                add     bx, bx
                mov     ax, cs:entity_render_tbl[bx] ; use 0901h for sword #1
                mov     cs:transparency_mask_bitplane_f, ax
                mov     ds, word ptr cs:seg1
                mov     ax, 0A000h                   ; VRAM segment
                mov     es, ax
                mov     di, cs:entity_vram_src       ; =6218h
                mov     si, cs:sword_phase_src       ; prepared in Render_Sword_Overlay (=seg1:B000+CE)
                mov     cx, 4
four_columns_horiz:
                push    cx
                push    di
                mov     cx, 4
four_tiles_vert:
                push    cx
                lodsb
                cmp     al, 0FFh
                jne     short opaque_should_draw
                add     di, 320*8
                jmp     short skip_transparent
; ---------------------------------------------------------------------------
opaque_should_draw:              ; seg1:b000[0d4] = 13h
                push    si       ; 0ce: ↓↗↓↗↓↗↓
                xor     ah, ah   ; FF FF FF FF 
                add     ax, ax   ; FF FF 11 FF 
                add     ax, ax   ; FF 13 12 FF 
                add     ax, ax   ; FF FF FF FF 
                add     ax, ax   ; 13h * 16
                mov     si, ax
                add     si, ds:sword_animation_gfx  ; seg1:0B000h
                mov     cx, 8
next_line_8px:
                push    cx
                lodsw                           ; every 4 bits -> 2 pixels
                xchg    ah, al
                call    CalculateSpriteBitmask
                not     bp
                and     es:[di], bp
                or      es:[di], dx
                call    CalculateSpriteBitmask
                not     bp
                and     es:[di+2], bp
                or      es:[di+2], dx
                call    CalculateSpriteBitmask
                not     bp
                and     es:[di+4], bp
                or      es:[di+4], dx
                call    CalculateSpriteBitmask
                not     bp
                and     es:[di+6], bp
                or      es:[di+6], dx
                add     di, 320
                pop     cx
                loop    next_line_8px
                pop     si
skip_transparent:
                pop     cx
                loop    four_tiles_vert
                pop     di
                add     di, 8
                pop     cx
                loop    four_columns_horiz
                pop     bx
                pop     si
                pop     di
                pop     ds
                pop     es
                retn
; ---------------------------------------------------------------------------
entity_render_tbl dw 0901h    ; white
                  dw 2404h    ; blue
                  dw 1B03h    ; yellow
                  dw 0901h    ; white
                  dw 2404h    ; blue
                  dw 3606h    ; lt yellow

; =============== S U B R O U T I N E =======================================

;      Input     |    Output   |
;----------------+------+------+
; ax_15_14_13_12 |  bp  |  dx  |
;----------------+------+------+
;    0  0  0  0  | 0000 | 0000 |
;    0  0  0  1  | ff00 | 0100 |
;    0  0  1  0  | ff00 | 0100 |
;    0  0  1  1  | ff00 | 0900 |
;    0  1  0  0  | 00ff | 0001 |
;    0  1  0  1  | ffff | 0101 |
;    0  1  1  0  | ffff | 0101 |
;    0  1  1  1  | ffff | 0901 |
;    1  0  0  0  | 00ff | 0001 |
;    1  0  0  1  | ffff | 0101 |
;    1  0  1  0  | ffff | 0101 |
;    1  0  1  1  | ffff | 0901 |
;    1  1  0  0  | 00ff | 0009 |
;    1  1  0  1  | ffff | 0109 |
;    1  1  1  0  | ffff | 0109 |
;    1  1  1  1  | ffff | 0909 |
CalculateSpriteBitmask proc near
                xor     bp, bp
                xor     dx, dx
                xor     bl, bl
                add     ax, ax
                adc     bl, bl
                add     ax, ax
                adc     bl, bl    ; ax15_ax14
                jz      short loc_40B5
                or      bp, 0FFh
                mov     dl, byte ptr cs:transparency_mask_bitplane_f+1
                cmp     bl, 3
                jz      short loc_40B5
                mov     dl, byte ptr cs:transparency_mask_bitplane_f
loc_40B5:
                xor     bl, bl
                add     ax, ax
                adc     bl, bl
                add     ax, ax
                adc     bl, bl    ; ax13_ax12
                jnz     short loc_40C2
                retn
; ---------------------------------------------------------------------------
loc_40C2:
                or      bp, 0FF00h
                mov     dh, byte ptr cs:transparency_mask_bitplane_f+1
                cmp     bl, 3
                jnz     short loc_40D1
                retn
; ---------------------------------------------------------------------------
loc_40D1:
                mov     dh, byte ptr cs:transparency_mask_bitplane_f
                retn
CalculateSpriteBitmask endp

;=====
Clear_Tile_Cache_Around_Hero        proc near
                mov     al, ds:hero_head_y_in_viewport      ; hero_head_y_in_viewport
                add     al, byte ptr ds:sword_sprite_offsets ; y offset, set in Render_Sword_Overlay
                and     al, 3Fh ; y in proximity map
                mov     cl, 36
                mul     cl
                mov     cl, ds:hero_x_in_viewport      ; hero_x_in_viewport
                add     cl, byte ptr ds:sword_sprite_offsets+1 ; x offset
                add     cl, 4 ; x in proximity map
                xor     ch, ch
                add     ax, cx ; linear offset in proximity map
                mov     si, ax
                add     si, ds:viewport_left_top_addr
                call    wrap_map_from_above
                mov     cx, 4
loc_3FAE:
                push    cx
                mov     cx, 4
loc_3FB2:
                push    cx
                mov     bl, [si]
                inc     si
                and     bl, 7Fh
                xor     bh, bh
                add     bx, bx
                mov     word ptr ds:tile_vram_cache[bx], 0
                pop     cx
                loop    loc_3FB2
                add     si, 32 ; 36-4
                call    wrap_map_from_above
                pop     cx
                loop    loc_3FAE
                retn
Clear_Tile_Cache_Around_Hero        endp

;=====
; copies 32x32 region from screen to shadow VRAM
Copy4x4TilesFromScreenToShadowBuffer proc near
                push    ds
                mov     si, cs:entity_vram_src ; 6218h - hero upper half
                mov     ax, 0A000h
                mov     ds, ax
                mov     es, ax  ; VRAM segment
                mov     di, 64064 ; VRAM shadow address + 64
                mov     cx, 32
loc_3F55:
                push    cx
                mov     cx, 16
                rep movsw
                add     si, 320-32
                pop     cx
                loop    loc_3F55
                pop     ds
                retn
Copy4x4TilesFromScreenToShadowBuffer endp


transparency_mask_bitplane_f dw 0
sword_sprite_offsets          dw 0
entity_vram_src             dw 0
sword_phase_src             dw 0
viewport_rows_remaining     db 0
hero_vram_base              dw 0
tile_vram_cache             dw 128 dup(0) ; =501Dh
nine_unpacked_tiles         db 576 dup(0) ; (9*64 bytes)
