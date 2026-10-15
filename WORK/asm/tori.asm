include common.inc
include dungeon.inc
                .286
                .model small

tori            segment byte public 'CODE'
                assume cs:tori, ds:tori
                org 0A000h
start:
                dw offset Tori_AI_proc
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
                ; A010
                db 56, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18
                db 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18
                ; A030
                dw offset byte_A04E ; 0..4
                dw offset byte_A067 ; 5..13
                dw offset byte_A094 ; 14..21
                dw offset byte_A0BC
                dw offset byte_A0DA
                dw offset byte_A102
                dw offset byte_A116
                dw offset byte_A12A
                dw offset byte_A13E
                dw offset byte_A152
                dw offset byte_A157
                dw offset byte_A170
                dw offset byte_A18E
                dw offset byte_A1AC
                dw offset byte_A1C5
byte_A04E       db 0, 1, 2, 3, 4
                db 0, 9Ch, 2, 9Dh, 4
                db 0, 29h, 2Ah, 2Bh, 2Ch
                db 0, 6Ah, 6Bh, 6Ch, 6Dh
                db 0, 6Ah, 6Bh, 8Ah, 6Dh
byte_A067       db 0, 0Eh, 0Fh, 12h, 13h
                db 0, 2Dh, 32h, 2Eh, 2Fh
                db 0, 2Dh, 49h, 2Eh, 50h
                db 0, 2Dh, 0, 2Eh, 58h
                db 0, 0, 62h, 66h, 67h
                db 0, 7Dh, 7Eh, 0, 87h
                db 0, 7Dh, 7Eh, 0, 19h
                db 0, 0, 0, 8Fh, 90h
                db 0, 96h, 97h, 98h, 99h
byte_A094       db 0, 10h, 11h, 14h, 0
                db 0, 0, 3Bh, 38h, 39h
                db 0, 4Dh, 4Eh, 49h, 4Ah
                db 0, 0, 0, 59h, 5Ah
                db 0, 63h, 64h, 68h, 69h
                db 0, 0, 72h, 6Eh, 6Fh
                db 0, 91h, 0, 94h, 95h
                db 0, 99h, 9Ah, 28h, 9Bh
byte_A0BC       db 0, 0, 5, 6, 7
                db 0, 39h, 3Ah, 36h, 37h
                db 0, 4Fh, 0, 4Bh, 4Ch
                db 0, 0, 5Bh, 0, 5Fh
                db 0, 65h, 0, 0A4h, 0A5h
                db 0, 7Ah, 0, 76h, 77h
byte_A0DA       db 0, 15h, 16h, 17h, 18h
                db 0, 35h, 36h, 33h, 34h
                db 0, 50h, 51h, 3Ch, 3Dh
                db 0, 5Ch, 5Dh, 60h, 61h
                db 0, 2Eh, 0A6h, 0, 3Ch
                db 0, 7Bh, 7Ch, 78h, 79h
                db 0, 92h, 93h, 0ACh, 0ABh
                db 0, 0AAh, 28h, 27h, 26h
byte_A102       db 0, 8, 9, 19h, 1Ah
                db 0, 8, 9, 1Ch, 1Dh
                db 0, 8, 9, 19h, 1Fh
                db 0, 8, 9, 21h, 22h
byte_A116       db 0, 9, 0Ah, 1Ah, 1Bh
                db 0, 9, 0Ah, 1Dh, 1Eh
                db 0, 9, 0Ah, 1Fh, 20h
                db 0, 9, 0Ah, 22h, 23h
byte_A12A       db 0, 0AFh, 0B0h, 0B1h, 0B2h
                db 0, 0Bh, 0, 8Bh, 0BAh
                db 0, 0Bh, 0, 8Bh, 8Ch
                db 0, 0Bh, 0B5h, 0B3h, 0B4h
byte_A13E       db 0, 0Bh, 0B1h, 0Ch, 0Dh
                db 0, 0, 0ADh, 0BBh, 0AEh
                db 0, 0, 0, 8Dh, 8Eh
                db 0, 0B6h, 0B7h, 0, 0B8h
byte_A152       db 0, 0B1h, 0B2h, 0Dh, 0B9h
byte_A157       db 0, 2Fh, 30h, 3Ch, 3Dh
                db 0, 52h, 53h, 3Eh, 3Fh
                db 0, 5Eh, 3Fh, 42h, 43h
                db 0, 0A7h, 0A8h, 3Dh, 3Eh
                db 0, 73h, 74h, 70h, 71h
byte_A170       db 0, 31h, 0, 3Eh, 3Fh
                db 0, 40h, 41h, 0, 0
                db 0, 9Eh, 9Fh, 0A1h, 0A2h
                db 0, 0A9h, 0, 3Fh, 0
                db 0, 75h, 0, 0, 82h
                db 0, 75h, 0, 0, 0
byte_A18E       db 0, 40h, 41h, 0, 44h
                db 0, 42h, 43h, 54h, 46h
                db 0, 0A0h, 44h, 0A3h, 47h
                db 0, 40h, 41h, 0, 0
                db 0, 85h, 86h, 83h, 84h
                db 0, 3Dh, 7Fh, 1Ah, 1Bh
byte_A1AC       db 0, 42h, 43h, 45h, 46h
                db 0, 55h, 0, 56h, 57h
                db 0, 45h, 46h, 48h, 0
                db 0, 3Dh, 7Fh, 88h, 89h
                db 0, 3Fh, 0, 8Bh, 8Ch
byte_A1C5       db 0, 44h, 45h, 47h, 48h
                db 0, 80h, 81h, 0, 0
                db 0, 0, 0, 8Dh, 8Eh

; =============== S U B R O U T I N E =======================================


Tori_AI_proc    proc near

                mov     si, ds:monsters_table_addr
                mov     byte_A789, 0
                mov     byte_A791, 0

loc_A1E2:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A22D
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A224
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A789
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte ptr [si+5], 40h
                jz      short loc_A224
                test    byte_A791, 80h
                jnz     short loc_A224
                mov     al, [si+5]
                and     al, 1Fh
                test    byte ptr [si+4], 0FFh
                jnz     short loc_A221
                or      al, 80h

loc_A221:
                mov     byte_A791, al

loc_A224:
                inc     byte_A789
                add     si, 10h
                jmp     short loc_A1E2
; ---------------------------------------------------------------------------

loc_A22D:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFh
                mov     al, byte_A791
                or      al, al
                jz      short loc_A27B
                push    ax
                and     al, 1Fh
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                xor     bh, bh
                pop     ax
                add     bx, bx
                or      al, al
                jns     short loc_A253
                add     bx, bx
                add     bx, bx

loc_A253:
                mov     byte ptr ds:soundFX_request, 41
                call    sub_A5BA
                test    byte_A78C, 0FFh
                jz      short loc_A271
                mov     byte_A78C, 0
                mov     byte_A78D, 0
                mov     byte_A78E, 0FFh

loc_A271:
                jnz     short loc_A276
                call    sub_A5AB

loc_A276:
                mov     byte_A795, 4

loc_A27B:
                mov     byte_A78B, 0
                test    byte_A795, 0FFh
                jz      short loc_A290
                dec     byte_A795
                mov     byte_A78B, 1

loc_A290:
                test    byte_A78C, 0FFh
                jz      short loc_A2E5
                cmp     boss_y, 0Eh
                jz      short loc_A2A2
                dec     boss_y

loc_A2A2:
                inc     byte_A78D
                and     byte_A78D, 3
                cmp     byte_A78D, 2
                jnz     short loc_A2B7
                mov     byte ptr ds:soundFX_request, 43

loc_A2B7:
                call    sub_A59D
                jb      short loc_A2CE
                test    byte_A79B, 0FFh
                jz      short loc_A2CE
                dec     byte_A79B
                test    byte_A791, 0FFh
                jz      short loc_A2E2

loc_A2CE:
                mov     byte_A78C, 0
                mov     byte_A78D, 0
                mov     byte_A78E, 0FFh
                mov     byte ptr ds:soundFX_request, 42

loc_A2E2:
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A2E5:
                test    byte_A78E, 0FFh
                jz      short loc_A316
                cmp     byte_A78D, 1
                jnz     short loc_A2FB
                mov     byte_A78E, 0
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A2FB:
                mov     byte_A78D, 1
                cmp     boss_y, 12h
                jz      short loc_A313
                inc     boss_y
                mov     byte_A78D, 0
                call    sub_A58F

loc_A313:
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A316:
                test    byte_A797, 0FFh
                jz      short loc_A35D
                inc     byte_A790
                and     byte_A790, 3
                call    sub_A57B
                jnb     short loc_A32E
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A32E:
                cmp     byte_A798, 4
                jnb     short loc_A346
                inc     byte_A798
                mov     byte ptr ds:soundFX_request, 42
                mov     byte_A795, 4
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A346:
                mov     byte_A797, 0
                mov     byte_A78D, 0
                mov     byte_A78C, 0FFh
                mov     byte_A79B, 0Fh
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A35D:
                test    byte_A79A, 0FFh
                jz      short loc_A3AD
                call    sub_A57B
                jnb     short loc_A36C
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A36C:
                cmp     byte_A798, 2
                jnb     short loc_A384
                inc     byte_A798
                mov     byte ptr ds:soundFX_request, 42
                mov     byte_A795, 2
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A384:
                mov     ax, ds:boss_x
                add     ax, 4
                call    word ptr cs:is_in_proximity_window_proc
                mov     byte_A766, bl
                mov     al, boss_y
                add     al, 4
                and     al, 3Fh
                mov     byte_A767, al
                mov     bx, offset byte_A766
                call    word ptr cs:Add_Projectile_To_Array_proc
                mov     byte_A79A, 0
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A3AD:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A3B7
                jmp     loc_A60A
; ---------------------------------------------------------------------------

loc_A3B7:
                inc     byte_A790
                and     byte_A790, 3
                test    byte_A791, 0FFh
                jz      short loc_A3D8
                cmp     byte ptr ds:boss_x, 20
                jb      short loc_A3D8
                mov     byte_A797, 0FFh
                mov     byte_A798, 0

loc_A3D8:
                test    byte_A797, 0FFh
                jnz     short loc_A3F2
                call    word ptr cs:get_random_proc
                and     al, 0Fh
                jnz     short loc_A3F2
                mov     byte_A79A, 0FFh
                mov     byte_A798, 0

loc_A3F2:
                inc     byte_A796
                test    byte_A796, 1
                jnz     short loc_A455
                mov     al, ds:proximity_map_left_col_x
                add     al, ds:hero_x_in_viewport
                xor     ah, ah
                mov     cx, ax
                sub     cx, ds:mapWidth
                jb      short loc_A40F
                xchg    ax, cx

loc_A40F:
                mov     bl, byte ptr ds:boss_x
                sub     bl, al
                cmp     bl, 12
                je      short loc_A442
                jnb     short loc_A436
                dec     byte_A78A
                and     byte_A78A, 3
                call    sub_A5AB
                jnb     short loc_A455
                mov     byte_A797, 0FFh
                mov     byte_A798, 0
                jmp     short loc_A455
; ---------------------------------------------------------------------------

loc_A436:
                inc     byte_A78A
                and     byte_A78A, 3
                call    sub_A58F

loc_A442:
                call    word ptr cs:get_random_proc
                and     al, 1Fh
                jnz     short loc_A455
                mov     byte_A797, 0FFh
                mov     byte_A798, 0

loc_A455:
                mov     al, boss_y
                mov     byte_A793, al
                push    cs
                pop     es
                mov     di, offset byte_A79C
                mov     al, 0FFh
                mov     cx, 72
                rep stosb
                test    byte_A799, 0FFh
                jnz     short loc_A475
                test    byte_A78E, 0FFh
                jz      short loc_A481

loc_A475:
                mov     al, byte_A78D
                and     al, 1
                add     al, 11h
                call    sub_A552
                jmp     short loc_A4BC
; ---------------------------------------------------------------------------

loc_A481:
                test    byte_A78C, 0FFh
                jz      short loc_A49E
                mov     al, byte_A78D
                and     al, 3
                add     al, 0Dh
                call    sub_A552
                mov     al, byte_A78D
                shr     al, 1
                adc     byte_A793, 0
                jmp     short loc_A4BC
; ---------------------------------------------------------------------------

loc_A49E:
                mov     al, byte_A78B
                call    sub_A552
                mov     al, byte_A78A
                add     al, 6
                call    sub_A552
                mov     al, byte_A78F
                add     al, 0Ah
                call    sub_A552
                mov     al, byte_A790
                add     al, 2
                call    sub_A552

loc_A4BC:
                mov     byte_A789, 0
                mov     ax, ds:boss_x
                mov     di, ds:monsters_table_addr
                mov     si, offset byte_A79C
                mov     cx, 9

loc_A4CE:
                push    cx
                push    si
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                jb      short loc_A545
                mov     byte_A792, bl
                xor     cx, cx

loc_A4DF:
                push    cx
                push    ax
                cmp     byte ptr [si], 0FFh
                jz      short loc_A53C
                mov     [di], ax
                mov     al, byte_A793
                add     al, cl
                and     al, 3Fh
                mov     [di+2], al
                mov     al, byte_A792
                mov     [di+3], al
                mov     al, [si]
                mov     ah, al
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                and     al, 0Fh
                mov     [di+4], al
                mov     [di+6], ah
                mov     byte ptr [di+5], 0
                test    byte_A791, 0FFh
                jz      short loc_A51B
                or      byte ptr [di+5], 20h

loc_A51B:
                mov     ax, [di+2]
                push    di
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A789
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                pop     di
                add     di, 10h
                inc     byte_A789

loc_A53C:
                inc     si
                pop     ax
                pop     cx
                inc     cx
                cmp     cx, 8
                jnz     short loc_A4DF

loc_A545:
                inc     ax
                pop     si
                add     si, 8
                pop     cx
                loop    loc_A4CE
                mov     word ptr [di], 0FFFFh
                retn
Tori_AI_proc    endp


; =============== S U B R O U T I N E =======================================


sub_A552        proc near
                add     al, al
                mov     bl, al
                xor     bh, bh
                mov     si, off_A64D[bx]
                mov     bp, off_A6CB[bx]
                mov     di, offset byte_A79C
                mov     cx, 9

loc_A566:
                push    cx
                mov     cx, 8

loc_A56A:
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A573
                lodsb
                mov     [di], al

loc_A573:
                inc     di
                loop    loc_A56A
                inc     bp
                pop     cx
                loop    loc_A566
                retn
sub_A552        endp


; =============== S U B R O U T I N E =======================================


sub_A57B        proc near
                inc     byte_A78F
                cmp     byte_A78F, 3
                stc
                jz      short loc_A588
                retn
; ---------------------------------------------------------------------------

loc_A588:
                mov     byte_A78F, 0
                clc
                retn
sub_A57B        endp


; =============== S U B R O U T I N E =======================================


sub_A58F        proc near
                cmp     byte ptr ds:boss_x, 13
                jnb     short loc_A597
                retn
; ---------------------------------------------------------------------------

loc_A597:
                dec     byte ptr ds:boss_x
                clc
                retn
sub_A58F        endp


; =============== S U B R O U T I N E =======================================


sub_A59D        proc near
                cmp     byte ptr ds:boss_x, 17
                jnb     short loc_A5A5
                retn
; ---------------------------------------------------------------------------

loc_A5A5:
                dec     byte ptr ds:boss_x
                clc
                retn
sub_A59D        endp


; =============== S U B R O U T I N E =======================================


sub_A5AB        proc near
                cmp     byte ptr ds:boss_x, 48
                cmc
                jnb     short loc_A5B4
                retn
; ---------------------------------------------------------------------------

loc_A5B4:
                inc     byte ptr ds:boss_x
                clc
                retn
sub_A5AB        endp


; =============== S U B R O U T I N E =======================================


sub_A5BA        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_A5C3
                xor     ax, ax

loc_A5C3:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_A5D4
                retn
; ---------------------------------------------------------------------------

loc_A5D4:
                mov     byte ptr ds:boss_being_hit, 0FFh
                call    word ptr cs:Browse_Projectiles_proc
                mov     byte_A797, 0
                mov     byte_A79A, 0
                mov     byte_A798, 0
                test    byte_A78C, 0FFh
                jnz     short loc_A5F5
                retn
; ---------------------------------------------------------------------------

loc_A5F5:
                mov     byte_A794, 0
                mov     byte_A78C, 0
                mov     byte_A78D, 0
                mov     byte_A78E, 0FFh
                retn
sub_A5BA        endp

; ---------------------------------------------------------------------------

loc_A60A:
                mov     al, byte_A794
                cmp     al, 40
                jnb     short loc_A647
                mov     byte ptr ds:sprite_flash_flag, 0FFh
                mov     byte_A78B, 1
                mov     al, byte_A794
                inc     byte_A794
                cmp     al, 14h
                jnb     short loc_A63A
                call    sub_A57B
                inc     byte_A790
                and     byte_A790, 3
                mov     byte ptr ds:soundFX_request, 44
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A63A:
                mov     byte_A799, 0FFh
                mov     byte_A78D, 1
                jmp     loc_A455
; ---------------------------------------------------------------------------

loc_A647:
                mov     byte ptr ds:boss_is_dead, 0FFh
                retn
; ---------------------------------------------------------------------------
off_A64D        dw offset unk_A673
                dw offset unk_A675
                dw offset unk_A677
                dw offset unk_A67A
                dw offset unk_A67C
                dw offset unk_A67E
                dw offset unk_A680
                dw offset unk_A682
                dw offset unk_A684
                dw offset unk_A686
                dw offset unk_A688
                dw offset unk_A68B
                dw offset unk_A68E
                dw offset unk_A691
                dw offset unk_A69B
                dw offset unk_A6A4
                dw offset unk_A6AD
                dw offset unk_A6B7
                dw offset unk_A6C1
unk_A673        db    0
                db  30h ; 0
unk_A675        db    1
                db  30h ; 0
unk_A677        db  80h
                db  70h ; p
                db  90h
unk_A67A        db  71h ; q
                db  81h
unk_A67C        db  72h ; r
                db  82h
unk_A67E        db  73h ; s
                db  83h
unk_A680        db  50h ; P
                db  60h ; `
unk_A682        db  51h ; Q
                db  61h ; a
unk_A684        db  52h ; R
                db  62h ; b
unk_A686        db  53h ; S
                db  63h ; c
unk_A688        db  10h
                db  40h ; @
                db  20h
unk_A68B        db  17h
                db  46h ; F
                db  26h ; &
unk_A68E        db  18h
                db  47h ; G
                db  27h ; '
unk_A691        db    2
                db  11h
                db 0A0h
                db 0C0h
                db  21h ; !
                db  41h ; A
                db 0E0h
                db  31h ; 1
                db 0B0h
                db 0D0h
unk_A69B        db    2
                db  12h
                db  22h ; "
                db  42h ; B
                db 0B1h
                db  32h ; 2
                db 0A1h
                db 0C1h
                db 0D1h
unk_A6A4        db    2
                db  33h ; 3
                db 0B2h
                db  13h
                db  43h ; C
                db 0C2h
                db  23h ; #
                db 0A2h
                db 0D2h
unk_A6AD        db    2
                db  14h
                db  44h ; D
                db 0C3h
                db  24h ; $
                db 0A3h
                db 0C1h
                db 0D1h
                db  34h ; 4
                db 0B3h
unk_A6B7        db    3
                db  25h ; %
                db  15h
                db  35h ; 5
                db 0A4h
                db 0D3h
                db  45h ; E
                db 0B4h
                db 0E1h
                db 0C4h
unk_A6C1        db    4
                db  25h ; %
                db  16h
                db  35h ; 5
                db 0A4h
                db 0C5h
                db  45h ; E
                db 0B5h
                db 0D4h
                db 0E2h
off_A6CB        dw offset unk_A6F1
                dw offset unk_A6F1
                dw offset unk_A6FA
                dw offset unk_A703
                dw offset unk_A703
                dw offset unk_A703
                dw offset unk_A70C
                dw offset unk_A70C
                dw offset unk_A70C
                dw offset unk_A70C
                dw offset unk_A715
                dw offset unk_A71E
                dw offset unk_A727
                dw offset unk_A730
                dw offset unk_A739
                dw offset unk_A742
                dw offset unk_A74B
                dw offset unk_A754
                dw offset unk_A75D
unk_A6F1        db    0
                db    0
                db  50h ; P
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
unk_A6FA        db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    4
                db  0Ch
                db    0
unk_A703        db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    4
                db    0
                db    4
unk_A70C        db    0
                db    0
                db    0
                db    4
                db    4
                db    0
                db    0
                db    0
                db    0
unk_A715        db    0
                db    0
                db    0
                db    0
                db  50h ; P
                db    0
                db  40h ; @
                db    0
                db    0
unk_A71E        db    0
                db    0
                db    0
                db    0
                db  50h ; P
                db    0
                db  20h
                db    0
                db    0
unk_A727        db    0
                db    0
                db    0
                db    0
                db  50h ; P
                db  20h
                db    0
                db    0
                db    0
unk_A730        db  10h
                db    0
                db  10h
                db  0Ah
                db 0A1h
                db  4Ah ; J
                db    0
                db    0
                db    0
unk_A739        db  20h
                db    0
                db  20h
                db  54h ; T
                db    0
                db  55h ; U
                db    0
                db    0
                db    0
unk_A742        db  10h
                db    5
                db  10h
                db    5
                db  10h
                db    5
                db    0
                db    0
                db    0
unk_A74B        db  20h
                db    0
                db  50h ; P
                db    4
                db  50h ; P
                db    5
                db  50h ; P
                db    0
                db    0
unk_A754        db    4
                db    0
                db  14h
                db    0
                db  54h ; T
                db    0
                db  54h ; T
                db    0
                db  10h
unk_A75D        db    4
                db    0
                db  14h
                db    0
                db  54h ; T
                db    0
                db  54h ; T
                db    0
                db    4
byte_A766       db 0
byte_A767       db 0
                db 0A7h
                db    0
                db  32h ; 2
                db    4
                db  28h ; (
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
boss_state_block:
boss_x          dw 46
boss_y          db 18
boss_hp         dw 500
xp_reward       dw 500
arena_center_x  db 8
boss_placement  db 0FFh
name_block_ptr  dw offset name_screen_x
                dw 500 ; almas_reward
name_screen_x   db  12h
name_screen_y   db 0BBh
                db    0
boss_name_pstring db 5,'Pollo'
byte_A789       db 0
byte_A78A       db 0
byte_A78B       db 0
byte_A78C       db 0
byte_A78D       db 0
byte_A78E       db 0
byte_A78F       db 0
byte_A790       db 0
byte_A791       db 0
byte_A792       db 0
byte_A793       db 0
byte_A794       db 0
byte_A795       db 0
byte_A796       db 0
byte_A797       db 0
byte_A798       db 0
byte_A799       db 0
byte_A79A       db 0
byte_A79B       db 0
byte_A79C       db 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0

tori          ends
                end start