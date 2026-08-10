include common.inc
include dungeon.inc
                .286
                .model small

mao1          segment byte public 'CODE'
                assume cs:mao1, ds:mao1
                org 0A000h
start:
                dw offset Mao1_AI_proc
                dw offset boss_state_block
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                ; A030
                dw offset byte_A03E
                dw offset byte_A08E
                dw offset byte_A0DE
                dw offset byte_A12E
                dw offset byte_A17E
                dw offset byte_A1CE
                dw offset byte_A219
byte_A03E       db 1, 1, 2, 3, 4
                db 1, 5, 6, 0Ch, 0
                db 1, 0, 0, 0Ah, 0Bh
                db 1, 0, 0, 8, 9
                db 1, 0Eh, 0, 0, 0
                db 1, 7, 0Dh, 0Fh, 10h
                db 1, 0, 0, 1, 2
                db 1, 3, 4, 11h, 12h
                db 1, 0, 0, 13h, 0
                db 1, 18h, 19h, 1Eh, 0
                db 1, 16h, 17h, 0Ah, 1Dh
                db 1, 0, 15h, 1Ch, 9
                db 1, 20h, 0, 0, 0
                db 1, 0, 14h, 1Ah, 1Bh
                db 1, 7, 1Fh, 0Fh, 10h
                db 1, 28h, 0, 2Fh, 30h
byte_A08E       db 1, 26h, 27h, 2Dh, 2Eh
                db 1, 13h, 0, 18h, 22h
                db 1, 1, 2, 3, 4
                db 1, 11h, 12h, 16h, 21h
                db 1, 24h, 25h, 2Bh, 2Ch
                db 1, 34h, 0, 0, 0
                db 1, 0, 23h, 29h, 2Ah
                db 1, 32h, 33h, 35h, 36h
                db 1, 0, 31h, 0, 0
                db 1, 0, 0, 2, 0
                db 1, 4, 0, 39h, 3Ah
                db 1, 3Dh, 3Eh, 3Dh, 42h
                db 1, 3Dh, 45h, 48h, 49h
                db 1, 4Dh, 4Eh, 52h, 53h
                db 1, 0, 0, 0, 1
                db 1, 0, 3, 37h, 38h
byte_A0DE       db 1, 3Bh, 3Ch, 3Fh, 40h
                db 1, 43h, 44h, 46h, 47h
                db 1, 4Bh, 4Ch, 50h, 51h
                db 1, 0, 4Ah, 0, 4Fh
                db 1, 0, 3, 54h, 38h
                db 1, 57h, 3Ch, 58h, 40h
                db 1, 59h, 44h, 46h, 47h
                db 1, 55h, 56h, 0, 0
                db 1, 0, 3, 5Dh, 38h
                db 1, 58h, 3Ch, 58h, 40h
                db 1, 0, 0, 5Bh, 5Ch
                db 1, 0, 0, 0, 5Ah
                db 1, 4, 0, 61h, 3Ah
                db 1, 62h, 3Eh, 3Dh, 42h
                db 1, 0, 3, 5Eh, 38h
                db 1, 5Fh, 60h, 58h, 40h
byte_A12E       db 1, 4, 0, 67h, 68h
                db 1, 0, 3, 65h, 66h
                db 1, 0, 0, 63h, 64h
                db 1, 6Ch, 6Dh, 6Fh, 70h
                db 1, 6Ah, 6Bh, 69h, 6Eh
                db 1, 0, 69h, 0, 0
                db 1, 71h, 45h, 72h, 73h
                db 1, 0, 69h, 0, 47h
                db 1, 74h, 75h, 77h, 78h
                db 1, 0, 4Ch, 76h, 51h
                db 1, 4, 0, 83h, 84h
                db 1, 86h, 87h, 71h, 88h
                db 1, 89h, 8Ah, 85h, 71h
                db 1, 0, 0, 8Bh, 0
                db 1, 8Ch, 8Dh, 77h, 8Eh
                db 1, 7Dh, 3, 81h, 82h
byte_A17E       db 1, 80h, 71h, 85h, 80h
                db 1, 0, 85h, 0, 47h
                db 1, 0, 0, 41h, 79h
                db 1, 7Bh, 7Ch, 7Fh, 80h
                db 1, 0, 7Ah, 0, 7Eh
                db 1, 0, 85h, 0, 0
                db 1, 4, 0, 0A7h, 0
                db 1, 0ACh, 0ADh, 0B0h, 0B1h
                db 1, 0B4h, 0, 0B6h, 0
                db 1, 8Ch, 8Dh, 77h, 8Eh
                db 1, 94h, 0, 9Ah, 1
                db 1, 0A0h, 0A1h, 0A5h, 0A6h
                db 1, 0AAh, 0ABh, 0AEh, 0AFh
                db 1, 0B2h, 0B3h, 0, 0B5h
                db 1, 0, 4Ch, 76h, 51h
                db 1, 92h, 93h, 98h, 99h
byte_A1CE       db 1, 9Eh, 9Fh, 0A3h, 0A4h
                db 1, 0A8h, 0A9h, 0, 0
                db 1, 90h, 91h, 96h, 97h
                db 1, 9Ch, 9Dh, 0, 0A2h
                db 1, 0, 8Fh, 0, 95h
                db 1, 0, 9Bh, 0, 0
                db 1, 0, 0, 0C4h, 0C5h
                db 1, 4, 0CAh, 0CFh, 0D0h
                db 1, 0ACh, 0ADh, 0B0h, 0B1h
                db 1, 0B4h, 0, 0B6h, 0
                db 1, 8Ch, 8Dh, 77h, 8Eh
                db 1, 0BCh, 0BDh, 0C2h, 0C3h
                db 1, 0C9h, 3, 0, 0CEh
                db 1, 0, 0D1h, 0, 0D2h
                db 1, 0, 0B3h, 0, 0B5h
byte_A219       db 1, 0, 0, 0, 0B8h
                db 1, 0, 0, 0, 0B7h
                db 1, 0BAh, 0BBh, 0C0h, 0C1h
                db 1, 0, 0B9h, 0BEh, 0BFh
                db 1, 0C7h, 0C8h, 0CCh, 0CDh
                db 1, 0, 0C6h, 0, 0CBh
                db 1, 0, 0, 0, 7

; =============== S U B R O U T I N E =======================================


Mao1_AI_proc    proc near
                mov     si, ds:monsters_table_addr
                mov     byte_A599, 0

loc_A245:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A273
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A26A
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A599
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al

loc_A26A:
                inc     byte_A599
                add     si, 10h
                jmp     short loc_A245
; ---------------------------------------------------------------------------

loc_A273:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                inc     byte_A59C
                mov     al, byte_A59C
                mov     bx, offset byte_A3BB
                xlat
                or      al, al
                jns     short loc_A28D
                jmp     loc_A350
; ---------------------------------------------------------------------------

loc_A28D:
                mov     byte_A59B, al

loc_A290:
                mov     al, byte_A59B
                mov     dx, 10h
                cmp     al, 3
                jb      short loc_A29D
                mov     dx, 0Dh

loc_A29D:
                mov     boss_x, dx
                mov     byte_A599, 0
                mov     bl, byte_A59B
                xor     bh, bh
                add     bx, bx
                mov     di, cs:off_A495[bx]
                mov     bp, cs:off_A52F[bx]
                mov     ax, boss_x
                mov     si, ds:monsters_table_addr
                mov     cx, 6

loc_A2C2:
                push    cx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_A59A, bl
                jnb     short loc_A2DE
                mov     cx, 8

loc_A2D3:
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A2DA
                inc     di

loc_A2DA:
                loop    loc_A2D3
                jmp     short loc_A340
; ---------------------------------------------------------------------------

loc_A2DE:
                xor     cl, cl

loc_A2E0:
                push    cx
                push    ax
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A337
                mov     [si], ax
                add     cl, cl
                mov     al, boss_y
                add     al, cl
                and     al, 3Fh
                mov     [si+2], al
                mov     al, byte_A59A
                mov     [si+3], al
                mov     al, [di]
                mov     ah, al
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                mov     [si+4], al
                and     ah, 0Fh
                mov     [si+6], ah
                mov     byte ptr [si+5], 0
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A599
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                inc     byte_A599
                pop     di
                inc     di

loc_A337:
                pop     ax
                pop     cx
                inc     cl
                cmp     cl, 8
                jnz     short loc_A2E0

loc_A340:
                inc     bp
                inc     ax
                inc     ax
                pop     cx
                loop    loc_A348
                jmp     short loc_A34B
; ---------------------------------------------------------------------------

loc_A348:
                jmp     loc_A2C2
; ---------------------------------------------------------------------------

loc_A34B:
                mov     word ptr [si], 0FFFFh
                retn
; ---------------------------------------------------------------------------

loc_A350:
                mov     dx, offset loc_A290
                push    dx
                mov     ah, al
                and     al, 0F0h
                cmp     al, 80h
                jz      short loc_A376
                cmp     al, 0C0h
                jz      short loc_A3A2
                cmp     al, 0E0h
                jz      short loc_A370
                cmp     ah, 0FFh
                jz      short loc_A36A
                retn
; ---------------------------------------------------------------------------

loc_A36A:
                mov     byte ptr ds:is_jashiin_cavern, 0
                retn
; ---------------------------------------------------------------------------

loc_A370:
                mov     byte ptr ds:soundFX_request, 56
                retn
; ---------------------------------------------------------------------------

loc_A376:
                and     ah, 0Fh
                xor     bx, bx
                add     ah, ah
                mov     bl, ah
                mov     dx, off_A442[bx]
                push    si
                push    dx
                mov     bx, 0E1Eh
                mov     cx, 3410h
                mov     al, 0FFh
                call    word ptr cs:Draw_Bordered_Rectangle_proc ; BH: left margin (x) in 4px units
                                                                ; BL: top margin (y)
                                                                ; CL: height (rows)
                                                                ; CH: width (in 4px units)
                                                                ; AL: 0 = fill black, non-zero = draw border
                                                                ; ES: VRAM segment

                pop     si
                lodsw
                add     ax, 3Ah ; ':'
                mov     bx, ax
                mov     cl, 22h ; '"'
                call    word ptr cs:Render_String_FF_Terminated_proc ; BX: starting X coord
                                                                    ; CL: starting Y coord
                                                                    ; SI: string pointer
                                                                    ;   Control codes: 0Dh = newline, 80h-87h = color change

                pop     si
                retn
; ---------------------------------------------------------------------------

loc_A3A2:
                mov     al, 0FEh
                push    ds
                pop     es
                mov     di, offset viewport_buffer_28x19 + 2*28+1 ; tile row 2, column 1
                mov     cx, 2

loc_A3AC:
                push    cx
                push    di
                mov     cx, 26
                rep stosb
                pop     di
                add     di, 28
                pop     cx
                loop    loc_A3AC
                retn
Mao1_AI_proc    endp

; ---------------------------------------------------------------------------
byte_A3BB       db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 80h, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0C0h, 0, 1, 1
                db 2, 2, 3, 3, 3, 3, 3, 81h, 3, 3, 3, 3, 3, 3, 3
                db 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3
                db 3, 3, 3, 3, 3, 3, 3, 0C0h, 3, 3, 3, 4, 4, 5, 82h
                db 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5
                db 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5
                db 0C0h, 5, 5, 6, 6, 7, 0E0h, 8, 8, 9, 9, 0Ah, 0Ah, 0Ah, 0FFh
off_A442        dw offset unk_A448
                dw offset unk_A463
                dw offset unk_A47A
unk_A448        db    8
                db    0
aFinallyYouReac db 'Finally, you reached me.'
                db 0FFh
unk_A463        db  18h
                db    0
aIEnjoyedYourSh db 'I enjoyed your show.'
                db 0FFh
unk_A47A        db    8
                db    0
aComeOnILlKillY db 'Come on!  I\ll kill you.'
                db 0FFh
off_A495        dw offset byte_A4AB
                dw offset byte_A4B1
                dw offset byte_A4BA
                dw offset byte_A4C4
                dw offset byte_A4CF
                dw offset byte_A4DB
                dw offset byte_A4E8
                dw offset byte_A4F3
                dw offset byte_A4FF
                dw offset byte_A50E
                dw offset byte_A51F
byte_A4AB       db 5, 3, 4, 2, 0, 1
byte_A4B1       db 0Dh, 0Eh, 0Bh, 0Ch, 6, 7, 0Ah, 8, 9
byte_A4BA       db 18h, 16h, 17h, 12h, 13h, 14h, 15h, 11h, 10h, 0Fh
byte_A4C4       db 23h, 1Eh, 1Fh, 20h, 21h, 22h, 19h, 1Ah, 1Bh, 1Ch, 1Dh
byte_A4CF       db 27h, 23h, 1Eh, 24h, 25h, 26h, 22h, 19h, 1Ah, 1Bh, 1Ch, 1Dh
byte_A4DB       db 2Bh, 2Ah, 23h, 1Eh, 28h, 29h, 26h, 22h, 19h, 1Ah, 1Bh, 1Ch, 1Dh
byte_A4E8       db 23h, 1Eh, 2Eh, 2Fh, 26h, 22h, 19h, 2Ch, 2Dh, 1Ch, 1Dh
byte_A4F3       db 32h, 35h, 1Eh, 31h, 34h, 37h, 39h, 19h, 30h, 33h, 36h, 38h
byte_A4FF       db 44h, 42h, 43h, 45h, 1Eh, 3Fh, 40h, 41h, 39h, 19h, 3Ah, 3Bh, 3Ch, 3Eh, 3Dh
byte_A50E       db 54h, 55h, 52h, 53h, 4Fh, 50h, 51h, 4Ah, 4Bh, 4Ch, 4Dh, 4Eh, 19h, 46h, 47h, 48h, 49h
byte_A51F       db 61h, 63h, 65h, 60h, 62h, 64h, 5Bh, 5Ch, 5Dh, 5Eh, 4Eh, 56h, 57h, 58h, 59h, 5Ah
off_A52F        dw offset byte_A545
                dw offset byte_A54B
                dw offset byte_A551
                dw offset byte_A557
                dw offset byte_A55D
                dw offset byte_A563
                dw offset byte_A557
                dw offset byte_A569
                dw offset byte_A56F
                dw offset byte_A575
                dw offset byte_A57B
byte_A545       db 0, 0, 4, 0Ch, 8, 18h
byte_A54B       db 0, 0, 0Ch, 0Ch, 38h, 18h
byte_A551       db 0, 4, 0Ch, 3Ch, 18h, 8
byte_A557       db 0, 0, 4, 7Ch, 7Ch, 0
byte_A55D       db 0, 0, 14h, 7Ch, 7Ch, 0
byte_A563       db 0, 20h, 24h, 7Ch, 7Ch, 0
byte_A569       db 0, 0, 30h, 7Ch, 7Ch, 0
byte_A56F       db 0, 20h, 70h, 7Ch, 7Ch, 8
byte_A575       db 60h, 60h, 70h, 7Ch, 7Ch, 0
byte_A57B       db 0, 0E0h, 0E0h, 7Ch, 7Ch, 0
boss_state_block:
boss_x          dw 16
boss_y          db 1
boss_hp         dw 250
xp_reward       dw 200
arena_center_x  db    5
boss_placement  db 0FFh
                dw offset name_screen_x
                db    0
                db    0
name_screen_x   db  11h
                db 0BBh
                db    2
aJashiin        db 7,'Jashiin'
byte_A599       db 0
byte_A59A       db 0
byte_A59B       db 0
byte_A59C       db 0

mao1          ends

                end start
