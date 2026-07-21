Render_Viewport_Border_Walls proc near  ; ...
                mov     al, ds:hero_x_in_viewport      ; hero_x_in_viewport
                add     al, al
                add     al, al
                add     al, al  ; x*8
                mov     ah, ds:hero_head_y_in_viewport      ; hero_head_y_in_viewport
                add     ah, ah
                add     ah, ah
                add     ah, ah  ; y*8
                mov     byte ptr ds:nibble_decode_lut, al ; 8*x
                mov     byte ptr ds:nibble_decode_lut+1, ah ; 8*y
                call    DrawDitheredPattern
                mov     ds:render_counter, 54
                call    RenderBorderRings
                mov     ds:render_counter, 0
                call    RenderBorderRings
                jmp     DrawDitheredPattern
Render_Viewport_Border_Walls endp

DrawDitheredPattern proc near           ; ...
                mov     ax, 0A000h
                mov     es, ax
                mov     di, viewport_top_left_vram_offset
                mov     cx, 8

loc_4488:
                push    cx
                push    di
                mov     cx, 12h

loc_448D:
                push    cx
                push    di
                mov     ax, 1001000010010b
                mov     cx, 112         ; 28*8/2

loc_4495:
                xor     es:[di], ax
                inc     di
                inc     di
                loop    loc_4495
                pop     di
                add     di, 320*8
                pop     cx
                loop    loc_448D
                pop     di
                add     di, 320
                pop     cx
                loop    loc_4488
                retn
DrawDitheredPattern endp

RenderBorderRings proc near
                mov     al, byte ptr ds:nibble_decode_lut ; 8*x
                dec     al
                mov     bl, al
                add     al, 19h
                mov     dl, al
                mov     al, byte ptr ds:nibble_decode_lut+1 ; 8*y
                dec     al
                mov     bh, al
                add     al, 19h
                mov     dh, al
                call    RenderBorderSegment
                mov     al, byte ptr ds:nibble_decode_lut ; 8*x
                sub     al, 5
                mov     bl, al
                add     al, 21h ; '!'
                mov     dl, al
                mov     al, byte ptr ds:nibble_decode_lut+1 ; 8*y
                sub     al, 5
                mov     bh, al
                add     al, 21h ; '!'
                mov     dh, al
                call    RenderBorderSegment
                mov     al, byte ptr ds:nibble_decode_lut ; 8*x
                sub     al, 9
                mov     bl, al
                add     al, 29h ; ')'
                mov     dl, al
                mov     al, byte ptr ds:nibble_decode_lut+1 ; 8*y
                sub     al, 9
                mov     bh, al
                add     al, 29h ; ')'
                mov     dh, al
RenderBorderRings endp




RenderBorderSegment proc near           ; ...
                mov     cx, 9

loc_4372:
                push    cx
                push    dx
                push    bx
                call    RenderOrthogonalSegments
                pop     bx
                pop     dx
                sub     bl, 0Ch
                jnb     short loc_4381
                xor     bl, bl

loc_4381:
                sub     bh, 0Ch
                jnb     short loc_4388
                xor     bh, bh

loc_4388:
                add     dl, 0Ch
                jnb     short loc_438F
                mov     dl, 0FFh

loc_438F:
                add     dh, 0Ch
                jnb     short loc_4396
                mov     dh, 0FFh

loc_4396:
                push    dx
                push    bx
                call    WaitForVBlankAndDelay
                pop     bx
                pop     dx
                pop     cx
                loop    loc_4372
                retn
RenderBorderSegment endp




RenderOrthogonalSegments proc near      ; ...
                mov     ax, 0A000h
                mov     es, ax
                push    dx
                push    bx
                mov     dh, bh
                call    DrawHorizontalLine
                pop     bx
                pop     dx
                push    dx
                push    bx
                mov     bh, dh
                call    DrawHorizontalLine
                pop     bx
                pop     dx
                push    dx
                push    bx
                mov     dl, bl
                call    DrawVerticalLine
                pop     bx
                pop     dx
                mov     bl, dl
RenderOrthogonalSegments endp




DrawVerticalLine proc near              ; ...
                cmp     dh, bh
                jnb     short loc_43C9
                xchg    dx, bx

loc_43C9:
                or      bl, bl
                jnz     short loc_43CE
                retn
; ---------------------------------------------------------------------------

loc_43CE:
                cmp     bl, 0DFh
                jb      short loc_43D4
                retn
; ---------------------------------------------------------------------------

loc_43D4:
                or      bh, bh
                jnz     short loc_43DA
                mov     bh, 1

loc_43DA:
                cmp     dh, 8Fh
                jb      short loc_43E1
                mov     dh, 8Eh

loc_43E1:
                mov     al, dh
                sub     al, bh
                inc     al
                push    ax
                mov     al, bh
                call    CalculateRowVRAMAddress
                mov     al, bl
                xor     ah, ah
                add     di, ax
                pop     cx
                xor     ch, ch
                mov     ah, ds:render_counter

loc_43FA:
                mov     es:[di], ah
                add     di, 320
                loop    loc_43FA
                retn
DrawVerticalLine endp


; =============== S U B R O U T I N E =======================================


DrawHorizontalLine proc near            ; ...
                cmp     dl, bl
                jnb     short loc_440A
                xchg    dx, bx

loc_440A:
                or      bh, bh
                jnz     short loc_440F
                retn
; ---------------------------------------------------------------------------

loc_440F:
                cmp     bh, 8Fh
                jb      short loc_4415
                retn
; ---------------------------------------------------------------------------

loc_4415:
                or      bl, bl
                jnz     short loc_441B
                mov     bl, 1

loc_441B:
                cmp     dl, 0DFh
                jb      short loc_4422
                mov     dl, 0DEh

loc_4422:
                mov     al, bh
                call    CalculateRowVRAMAddress
                mov     al, bl
                xor     ah, ah
                add     di, ax
                mov     ah, dl
                sub     ah, al
                mov     cl, ah
                xor     ch, ch
                mov     al, ds:render_counter
                rep stosb
                retn
DrawHorizontalLine endp



CalculateRowVRAMAddress proc near       ; ...
                push    dx
                xor     ah, ah
                mov     di, 140h
                mul     di
                add     ax, viewport_top_left_vram_offset
                mov     di, ax
                pop     dx
                retn
CalculateRowVRAMAddress endp
