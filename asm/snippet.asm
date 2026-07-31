; al: sprite index (0, 1, 2, 3 - for 16x16; 80h, 81h - for 64x16)
; bx: x
; cl: y
Render_Sparkle proc near
                push    ds
                or      al, al
                js      short loc_4B66
                and     al, 3
                mov     dl, 64
                mul     dl
                add     ax, offset sparkles_16x16
                mov     si, ax
                mov     bp, 1
                jmp     short loc_4B74
; ---------------------------------------------------------------------------

loc_4B66:
                and     al, 1
                mov     ah, al
                xor     al, al
                add     ax, offset sparkles_64x16
                mov     si, ax
                mov     bp, 4

loc_4B74:
                mov     ax, 320
                xor     ch, ch
                mul     cx      ; ax=320*y
                add     ax, bx
                mov     di, ax
                mov     ax, 0A000h
                mov     es, ax
                mov     cx, bp

loc_4B86:
                push    cx
                push    di
                mov     cx, 16

loc_4B8B:
                push    cx
                push    di
                mov     cx, 2

loc_4B90:
                push    cx
                lodsw
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
                add     di, 8
                pop     cx
                loop    loc_4B90
                pop     di
                add     di, 320
                pop     cx
                loop    loc_4B8B
                pop     di
                add     di, 16
                pop     cx
                loop    loc_4B86
                pop     ds
                retn
Render_Sparkle endp

; ---------------------------------------------------------------------------
sparkles_16x16 
                dw 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10h, 1000h, 60h, 700h, 0C0h
                dw 700h, 0C0h, 700h, 0C0h, 0C00h, 10h, 1000h, 0, 0, 0, 0, 0, 0, 0, 0, 0

                dw 0, 0, 0, 0, 100h, 0, 100h, 0, 4000h, 4, 100h, 0, 900h, 20h, 300h, 80h
                dw 5704h, 80D4h, 300h, 80h, 900h, 20h, 100h, 0, 4000h, 4, 100h, 0, 100h, 0, 0, 0
                
                dw 100h, 0, 100h, 0, 100h, 0, 200h, 80h, 8300h, 80h, 2300h, 88h, 0D00h, 0B0h, 0B00h, 0E8h
                dw 0FF96h, 0B9FFh, 1700h, 0E8h, 0B00h, 58h, 2300h, 82h, 200h, 8080h, 102h, 0, 100h, 0, 100h, 0
                
                dw 0, 0, 0, 1000h, 10h, 0, 4, 8000h, 8000h, 3, 7100h, 0Ch, 3D00h, 38h, 700h, 0F0h
                dw 9700h, 0E5h, 0F00h, 0F0h, 1F00h, 38h, 3900h, 0Eh, 0E100h, 8001h, 1, 4000h, 4, 800h, 10h, 0
sparkles_64x16 dw 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                dw 4A92h, 0EBAAh, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                dw 0, 0, 0, 100h, 0, 100h, 0, 101h, 0, 8200h, 0, 0AB00h, 0, 5D01h, 2404h, 0EFAEh
                dw 0FFFFh, 0FFFFh, 2404h, 0EFABh, 0, 5D01h, 0, 2200h, 0, 8100h, 0, 100h, 0, 100h, 0, 0
                dw 0, 0, 0, 0, 0, 0, 0, 0, 81h, 0, 0C4h, 0, 0BCh, 0, 0EAEEh, 2024h
                dw 0FFFFh, 0FFFFh, 0AAFBh, 2024h, 40FDh, 0, 0E6h, 0, 8040h, 0, 2000h, 0, 0, 0, 0, 0
                dw 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                dw 55D7h, 4952h, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                dw 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                dw 54A7h, 490h, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                dw 0, 0, 0, 0, 0, 10h, 0, 4, 0, 8000h, 0, 7100h, 0, 3D00h, 0, 700h
                dw 410h, 9700h, 0, 0F00h, 0, 1F00h, 0, 3900h, 0, 0E100h, 0, 1, 0, 4, 0, 10h
                dw 0, 0, 1000h, 0, 0, 0, 8000h, 0, 3, 0, 0Ch, 0, 38h, 0, 0F0h, 0
                dw 2E5h, 1000h, 0F0h, 0, 3Ch, 0, 7, 0, 0C000h, 0, 2000h, 0, 400h, 0, 0, 0
                dw 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                dw 920h, 0E52Ah, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0

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
                ; bl != 0
                or      bp, 0FFh
                mov     dl, byte ptr cs:transparency_mask_bitplane_f+1 ; for bl==3
                cmp     bl, 3
                je      short loc_40B5
                mov     dl, byte ptr cs:transparency_mask_bitplane_f ; for bl!=3
loc_40B5:
                xor     bl, bl
                add     ax, ax
                adc     bl, bl
                add     ax, ax
                adc     bl, bl    ; ax13_ax12
                jnz     short loc_40C2
                retn
; ---------------------------------------------------------------------------
                ; bl != 0
loc_40C2:
                or      bp, 0FF00h
                mov     dh, byte ptr cs:transparency_mask_bitplane_f+1 ; for bl==3
                cmp     bl, 3
                jne     short loc_40D1
                retn
; ---------------------------------------------------------------------------
loc_40D1:
                mov     dh, byte ptr cs:transparency_mask_bitplane_f ; for bl!=3
                retn
CalculateSpriteBitmask endp

transparency_mask_bitplane_f dw 0       
