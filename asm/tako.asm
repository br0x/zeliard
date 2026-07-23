include common.inc
include dungeon.inc
                .286
                .model small

tako            segment byte public 'CODE'
                assume cs:tako, ds:tako
                org 0A000h
start:
                dw offset Pulpo_AI_proc
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
encounter_hp_table db 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10
                db 10, 10, 10, 40, 10, 10, 10, 10, 10, 10, 10, 10, 10
                db 10, 10, 10, 10, 10, 10
anim_frame_table_ptrs dw offset byte_A052
                dw offset byte_A0A2
                dw offset byte_A0F2
                dw offset byte_A142
                dw offset byte_A192
                dw offset byte_A1E2
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
                dw offset byte_A255
                dw offset byte_A205
                dw offset byte_A25F
byte_A052       db 0, 0, 0, 1, 0
                db 0, 2, 3, 4, 5
                db 0, 0, 0, 6, 7
                db 0, 0, 0, 8, 9
                db 0, 0Ah, 0Bh, 0Ch, 0Dh
                db 0, 0Eh, 0Fh, 10h, 11h
                db 0, 0, 0, 0, 16h
                db 0, 17h, 18h, 19h, 1Ah
                db 0, 1Bh, 1Ch, 1Dh, 1Eh
                db 0, 0, 0, 1Fh, 20h
                db 0, 0, 0, 21h, 22h
                db 0, 23h, 24h, 25h, 26h
                db 0, 27h, 28h, 29h, 2Ah
                db 0, 0, 0, 2Bh, 2Ch
                db 0, 2Dh, 2Eh, 2Fh, 30h
                db 0, 31h, 32h, 33h, 34h
byte_A0A2       db 0, 0, 0, 0, 35h
                db 0, 36h, 37h, 38h, 39h
                db 0, 3Ah, 3Bh, 3Ch, 3Dh
                db 0, 0, 0, 0, 3Eh
                db 0, 3Fh, 40h, 41h, 42h
                db 0, 43h, 44h, 45h, 1Ah
                db 0, 0, 0, 46h, 47h
                db 0, 48h, 24h, 25h, 26h
                db 0, 0, 0, 49h, 4Ah
                db 0, 4Bh, 4Ch, 4Dh, 4Eh
                db 0, 0, 0, 4Fh, 4Ah
                db 0, 50h, 4Ch, 4Dh, 4Eh
                db 0, 0, 0, 21h, 51h
                db 0, 23h, 52h, 25h, 26h
                db 0, 53h, 0, 54h, 55h
                db 0, 0, 56h, 57h, 58h
byte_A0F2       db 0, 0, 0, 3, 0
                db 0, 59h, 5Ah, 5Bh, 5Ch
                db 0, 0Eh, 5Dh, 5Eh, 5Fh
                db 0, 0, 0, 63h, 0
                db 0, 64h, 65h, 66h, 67h
                db 0, 68h, 69h, 6Ah, 6Bh
                db 0, 0Eh, 6Ch, 6Dh, 5Fh
                db 0, 71h, 44h, 45h, 1Ah
                db 0, 0, 0, 72h, 73h
                db 0, 74h, 0, 75h, 76h
                db 0, 0, 0, 77h, 78h
                db 0, 79h, 7Ah, 7Bh, 7Ch
                db 0, 7Fh, 18h, 19h, 1Ah
                db 0, 80h, 0, 81h, 82h
                db 0, 0, 0, 0, 83h
                db 0, 0, 0, 77h, 78h
byte_A142       db 0, 84h, 85h, 86h, 87h
                db 0, 0, 0, 0, 17h
                db 0, 8Ah, 8Bh, 8Ch, 8Dh
                db 0, 0, 0, 8Eh, 8Fh
                db 0, 90h, 91h, 92h, 93h
                db 0, 0, 95h, 96h, 97h
                db 0, 66h, 0, 98h, 99h
                db 0, 9Ah, 0, 9Bh, 9Ch
                db 0, 0, 9Dh, 9Eh, 9Fh
                db 0, 0A2h, 0A3h, 0, 0A4h
                db 0, 0, 0, 0A5h, 0A6h
                db 0, 0C5h, 0CCh, 0C6h, 15h
                db 0, 0Ah, 0A9h, 0AAh, 0Dh
                db 0, 0Ah, 0ACh, 0ADh, 0AEh
                db 0, 0Eh, 0Fh, 0AFh, 11h
                db 0, 0, 56h, 0, 0
byte_A192       db 0, 59h, 0B1h, 0, 0B2h
                db 0, 0Eh, 5Dh, 0B3h, 5Fh
                db 0, 0B5h, 0B6h, 0, 67h
                db 0, 0B7h, 0B8h, 6Ah, 6Bh
                db 0, 0, 0, 75h, 76h
                db 0, 0, 0BAh, 7Bh, 7Ch
                db 0, 0BCh, 0BDh, 86h, 87h
                db 0, 0CEh, 0CFh, 8Ch, 0
                db 0, 90h, 0BFh, 0, 0C0h
                db 0, 0, 9Dh, 0, 0C2h
                db 0, 0Ah, 0ACh, 0ADh, 0AEh
                db 0, 0Eh, 5Dh, 0C4h, 5Fh
                db 0, 0Eh, 0Fh, 0C4h, 11h
                db 0, 0Eh, 6Ch, 0C4h, 5Fh
                db 0, 0Eh, 0Fh, 0C4h, 0C7h
                db 0, 17h, 18h, 0C8h, 0C9h
byte_A1E2       db 0, 0CAh, 0CBh, 1Dh, 1Eh
                db 0, 0Eh, 5Dh, 0C4h, 0CDh
                db 0, 43h, 44h, 0C8h, 0C9h
                db 0, 0Eh, 6Ch, 0C4h, 0CDh
                db 0, 71h, 44h, 0C8h, 0C9h
                db 0, 7Fh, 18h, 0C8h, 0C9h
                db 0, 0, 0, 8, 0A8h
byte_A205       db 0, 12h, 13h, 14h, 15h
                db 0, 60h, 61h, 62h, 15h
                db 0, 6Eh, 6Fh, 70h, 15h
                db 0, 7Dh, 6Fh, 7Eh, 15h
                db 0, 88h, 6Fh, 89h, 15h
                db 0, 94h, 6Fh, 89h, 15h
                db 0, 0A0h, 6Fh, 0A1h, 15h
                db 0, 0ABh, 6Fh, 14h, 15h
                db 0, 0B0h, 13h, 14h, 15h
                db 0, 0B4h, 61h, 62h, 15h
                db 0, 0B9h, 6Fh, 70h, 15h
                db 0, 0BBh, 6Fh, 7Eh, 15h
                db 0, 0BEh, 6Fh, 89h, 15h
                db 0, 0C1h, 6Fh, 89h, 15h
                db 0, 0C3h, 6Fh, 89h, 15h
                db 0, 0C5h, 6Fh, 14h, 15h
byte_A255       db 0, 0C5h, 13h, 0C6h, 15h
                db 0, 0, 0, 0A7h, 0A8h
byte_A25F       db 2, 0, 0D0h, 0, 0D1h
                db 2, 0D2h, 0D3h, 0D4h, 0D5h
                db 2, 0, 0, 0D6h, 0D7h
                db 2, 0D8h, 0D9h, 0DAh, 0DBh
                db 2, 0DCh, 0DDh, 0DEh, 0DFh
                db 2, 0E0h, 0E1h, 0E2h, 0E3h

; =============== S U B R O U T I N E =======================================


Pulpo_AI_proc   proc near

                mov     si, ds:monsters_table_addr
                mov     byte_AA9A, 0
                mov     byte_AA9B, 0

loc_A28B:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A2D6
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A2CD
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AA9A
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte ptr [si+5], 40h
                jz      short loc_A2CD
                test    byte_AA9B, 80h
                jnz     short loc_A2CD
                mov     al, [si+5]
                and     al, 1Fh
                cmp     byte ptr [si+4], 0Eh
                jb      short loc_A2CA
                or      al, 80h

loc_A2CA:
                mov     byte_AA9B, al

loc_A2CD:
                inc     byte_AA9A
                add     si, 10h
                jmp     short loc_A28B
; ---------------------------------------------------------------------------

loc_A2D6:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                mov     al, byte_AA9B
                or      al, al
                jz      short loc_A32A
                push    ax
                and     al, 1Fh
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                xor     bh, bh
                add     bx, bx
                pop     ax
                or      al, al
                jns     short loc_A301
                mov     byte ptr ds:soundFX_request, 36
                add     bx, bx
                jmp     short loc_A306
; ---------------------------------------------------------------------------

loc_A301:
                mov     byte ptr ds:soundFX_request, 37

loc_A306:
                call    sub_A503
                test    byte_AA98, 10h
                jnz     short loc_A32A
                mov     bx, offset byte_AA97
                cmp     byte ptr [bx], 10h
                jz      short loc_A32A
                add     byte ptr [bx], 8
                mov     byte_AA98, 10h
                or      byte_AA99, 20h
                mov     byte ptr ds:soundFX_request, 38

loc_A32A:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A334
                jmp     loc_A530
; ---------------------------------------------------------------------------

loc_A334:
                inc     byte_AA96
                and     byte_AA96, 7
                mov     dl, byte_AA97
                mov     bx, offset byte_AA98
                test    byte ptr [bx], 10h
                jz      short loc_A36F
                xor     byte ptr [bx], 20h
                test    byte ptr [bx], 20h
                jnz     short loc_A354
                sub     dl, 8

loc_A354:
                mov     al, [bx]
                mov     ah, al
                and     al, 0F0h
                inc     ah
                and     ah, 0Fh
                or      al, ah
                mov     [bx], al
                or      ah, ah
                jnz     short loc_A36F
                and     byte ptr [bx], 0EFh
                and     byte_AA99, 0DFh

loc_A36F:
                cmp     dl, 10h
                jnz     short loc_A3E3
                mov     bx, offset byte_AA99
                test    byte ptr [bx], 40h
                jz      short loc_A3AC
                mov     al, 20h ; ' '
                xor     al, [bx]
                mov     ah, al
                inc     al
                and     al, 3
                and     ah, 0E0h
                or      ah, al
                mov     [bx], ah
                or      al, al
                jnz     short loc_A3BB
                mov     byte ptr [bx], 0A0h
                mov     ax, word ptr ds:boss_state_block
                add     ax, 4
                mov     word_AA9F, ax
                mov     al, boss_y
                add     al, 4
                and     al, 3Fh
                mov     byte_AAA1, al
                mov     byte ptr ds:soundFX_request, 39

loc_A3AC:
                test    byte ptr [bx], 0A0h
                jnz     short loc_A3BB
                test    byte_AA98, 10h
                jnz     short loc_A3BB
                or      byte ptr [bx], 40h

loc_A3BB:
                test    byte ptr [bx], 20h
                jnz     short loc_A3C3
                add     dl, 8

loc_A3C3:
                test    byte ptr [bx], 80h
                jz      short loc_A3E3
                mov     al, [bx]
                mov     ah, al
                inc     ah
                and     ah, 1Fh
                and     al, 0E0h
                or      al, ah
                mov     [bx], al
                dec     word_AA9F
                cmp     ah, 19h
                jnz     short loc_A3E3
                mov     byte ptr [bx], 0

loc_A3E3:
                mov     byte_AA9A, 0
                mov     bl, byte_AA96
                xor     bh, bh
                add     bl, dl
                add     bl, bl
                mov     di, off_A57D[bx]
                mov     bx, off_A9AF[bx]
                mov     ax, word ptr ds:boss_state_block
                mov     si, ds:monsters_table_addr
                mov     cx, 7

loc_A404:
                push    cx
                push    bx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                mov     byte_AA9C, bl
                pop     ax
                pop     bx
                jnb     short loc_A421
                mov     cx, 8

loc_A417:
                rol     byte ptr [bx], 1
                jnb     short loc_A41D
                inc     di
                inc     di

loc_A41D:
                loop    loc_A417
                jmp     short loc_A486
; ---------------------------------------------------------------------------

loc_A421:
                xor     cx, cx

loc_A423:
                push    cx
                push    bx
                rol     byte ptr [bx], 1
                jnb     short loc_A47E
                mov     [si], ax
                add     cl, cl
                add     cl, boss_y
                and     cl, 3Fh
                mov     [si+2], cl
                mov     cl, byte_AA9C
                mov     [si+3], cl
                mov     cl, [di]
                mov     [si+4], cl
                mov     cl, [di+1]
                mov     [si+6], cl
                mov     byte ptr [si+5], 0
                test    byte_AA9B, 0FFh
                jz      short loc_A458
                or      byte ptr [si+5], 20h

loc_A458:
                push    di
                push    ax
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AA9A
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                pop     ax
                pop     di
                add     si, 10h
                add     di, 2
                inc     byte_AA9A

loc_A47E:
                pop     bx
                pop     cx
                inc     cx
                cmp     cx, 8
                jnz     short loc_A423

loc_A486:
                inc     bx
                add     ax, 2
                pop     cx
                loop    loc_A48F
                jmp     short loc_A492
; ---------------------------------------------------------------------------

loc_A48F:
                jmp     loc_A404
; ---------------------------------------------------------------------------

loc_A492:
                mov     al, byte_AA99
                test    al, 80h
                jz      short loc_A4FE
                and     al, 1Fh
                dec     al
                add     al, al
                add     al, al
                xor     ah, ah
                add     ax, offset byte_AA20
                mov     di, ax
                mov     ax, word_AA9F
                mov     cx, 4

loc_A4AE:
                push    cx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                jb      short loc_A4F9
                mov     dl, [di]
                or      dl, dl
                jz      short loc_A4F9
                push    di
                push    ax
                mov     [si], ax
                mov     al, byte_AAA1
                mov     [si+2], al
                mov     [si+3], bl
                mov     byte ptr [si+4], 30h ; '0'
                dec     dl
                mov     [si+6], dl
                mov     byte ptr [si+5], 0
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AA9A
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                inc     byte_AA9A
                pop     ax
                pop     di

loc_A4F9:
                inc     di
                inc     ax
                pop     cx
                loop    loc_A4AE

loc_A4FE:
                mov     word ptr [si], 0FFFFh
                retn
Pulpo_AI_proc   endp


; =============== S U B R O U T I N E =======================================


sub_A503        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_A50C
                xor     ax, ax

loc_A50C:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_A51D
                retn
; ---------------------------------------------------------------------------

loc_A51D:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A525
                retn
; ---------------------------------------------------------------------------

loc_A525:
                mov     byte_AA9E, 0
                mov     byte ptr ds:boss_being_hit, 0FFh
                retn
sub_A503        endp

; ---------------------------------------------------------------------------

loc_A530:
                mov     byte_AA99, 0
                cmp     byte_AA9E, 40
                jnb     short loc_A577
                mov     byte ptr ds:0FF2Fh, 0FFh ; sprite_flash_flag
                mov     bx, offset byte_AA9E
                cmp     byte ptr [bx], 20
                jnb     short loc_A56B
                inc     byte ptr [bx]
                mov     al, [bx]
                mov     bx, offset byte_AA96
                inc     byte ptr [bx]
                and     byte ptr [bx], 7
                and     al, 1
                add     al, al
                add     al, al
                add     al, al
                add     al, byte_AA97
                mov     dl, al
                mov     byte ptr ds:soundFX_request, 40
                jmp     loc_A3E3
; ---------------------------------------------------------------------------

loc_A56B:
                inc     byte ptr [bx]
                mov     dl, byte_AA97
                add     dl, 8
                jmp     loc_A3E3
; ---------------------------------------------------------------------------

loc_A577:
                mov     byte ptr ds:boss_is_dead, 0FFh
                retn
; ---------------------------------------------------------------------------
off_A57D        dw offset byte_A5BD
                dw offset byte_A5E3
                dw offset byte_A607
                dw offset byte_A629
                dw offset byte_A64D
                dw offset byte_A671
                dw offset byte_A695
                dw offset byte_A6B9
                dw offset byte_A6DD
                dw offset byte_A701
                dw offset byte_A725
                dw offset byte_A747
                dw offset byte_A767
                dw offset byte_A787
                dw offset byte_A7AB
                dw offset byte_A7CD
                dw offset byte_A7EF
                dw offset byte_A80B
                dw offset byte_A827
                dw offset byte_A843
                dw offset byte_A85F
                dw offset byte_A87B
                dw offset byte_A897
                dw offset byte_A8B3
                dw offset byte_A8CF
                dw offset byte_A8EB
                dw offset byte_A907
                dw offset byte_A923
                dw offset byte_A93F
                dw offset byte_A95B
                dw offset byte_A977
                dw offset byte_A993
byte_A5BD       db 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0Fh, 0, 0, 6, 0
                db 7, 0, 8, 0, 0Ah, 0, 0Bh, 0, 0Ch, 0, 0Dh, 0, 0Eh, 0
                db 0Fh, 1, 0, 1, 1, 1, 2
byte_A5E3       db 1, 0Eh, 1, 0Fh, 2, 0, 2, 1, 2, 2, 0Fh, 1, 0, 6, 1, 5
                db 0, 8, 1, 6, 1, 7, 0, 0Ch, 1, 8, 1, 9, 0, 0Fh, 1, 3
                db 1, 1, 1, 2
byte_A607       db 2, 3, 2, 4, 2, 5, 2, 6, 0Fh, 2, 0, 9, 2, 7, 0, 8, 1
                db 6, 1, 7, 0, 0Ch, 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 3, 1, 4
                db 1, 2
byte_A629       db 2, 8, 2, 9, 2, 0Ah, 2, 0Bh, 2, 6, 0Fh, 3, 0, 9, 2, 0Ch
                db 0, 8, 0, 0Ah, 0, 0Bh, 0, 0Ch, 1, 8, 1, 9, 0, 0Fh, 1
                db 0, 1, 4, 1, 2
byte_A64D       db 2, 0Dh, 2, 0Eh, 2, 0Fh, 3, 0, 2, 6, 0Fh, 4, 0, 6, 2
                db 0Ch, 0, 8, 1, 0Ch, 1, 0Dh, 0, 0Ch, 1, 0Ah, 1, 0Bh, 0
                db 0Fh, 1, 0, 1, 1, 1, 2
byte_A671       db 3, 1, 3, 2, 3, 3, 3, 4, 2, 6, 0Fh, 5, 0, 6, 2, 7, 0
                db 8, 1, 6, 1, 7, 0, 0Ch, 1, 8, 1, 9, 0, 0Fh, 1, 3, 1
                db 1, 1, 2
byte_A695       db 3, 5, 3, 6, 3, 7, 3, 8, 2, 6, 0Fh, 6, 0, 9, 2, 7, 0
                db 8, 1, 6, 1, 7, 0, 0Ch, 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 3
                db 1, 4, 1, 2
byte_A6B9       db 3, 9, 3, 0Ah, 0Eh, 1, 3, 0Ch, 2, 2, 0Fh, 7, 0, 9, 0
                db 7, 0, 8, 0, 0Ah, 0, 0Bh, 0, 0Ch, 1, 8, 1, 9, 0, 0Fh
                db 1, 0, 1, 4, 1, 2
byte_A6DD       db 0, 0, 0, 1, 5, 6, 3, 0Dh, 3, 0Eh, 0Fh, 8, 0, 6, 0, 7
                db 0, 8, 0, 0Ah, 0, 0Bh, 0, 0Ch, 0, 0Dh, 0, 0Eh, 0, 0Fh
                db 1, 0, 1, 1, 1, 2
byte_A701       db 1, 0Eh, 3, 0Fh, 2, 0, 4, 0, 4, 1, 0Fh, 9, 0, 6, 1, 5
                db 0, 8, 1, 6, 1, 7, 0, 0Ch, 1, 8, 1, 9, 0, 0Fh, 1, 3
                db 1, 1, 1, 2
byte_A725       db 2, 3, 4, 2, 4, 3, 2, 6, 0Fh, 0Ah, 0, 9, 2, 7, 0, 8
                db 1, 6, 1, 7, 0, 0Ch, 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 3, 1
                db 4, 1, 2
byte_A747       db 4, 4, 4, 5, 2, 6, 0Fh, 0Bh, 0, 9, 2, 0Ch, 0, 8, 0, 0Ah
                db 0, 0Bh, 0, 0Ch, 1, 8, 1, 9, 0, 0Fh, 1, 0, 1, 4, 1, 2
byte_A767       db 2, 0Eh, 4, 6, 2, 6, 0Fh, 0Ch, 0, 6, 2, 0Ch, 0, 8, 1
                db 0Ch, 1, 0Dh, 0, 0Ch, 1, 0Ah, 1, 0Bh, 0, 0Fh, 1, 0, 1
                db 1, 1, 2
byte_A787       db 3, 1, 4, 7, 3, 3, 4, 8, 2, 6, 0Fh, 0Dh, 0, 6, 2, 7
                db 0, 8, 1, 6, 1, 7, 0, 0Ch, 1, 8, 1, 9, 0, 0Fh, 1, 3
                db 1, 1, 1, 2
byte_A7AB       db 3, 5, 3, 7, 4, 9, 2, 6, 0Fh, 0Eh, 0, 9, 2, 7, 0, 8
                db 1, 6, 1, 7, 0, 0Ch, 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 3, 1
                db 4, 1, 2
byte_A7CD       db 3, 9, 0Eh, 1, 4, 0Ah, 4, 0Bh, 0Fh, 0Fh, 0, 9, 0, 7
                db 0, 8, 0, 0Ah, 0, 0Bh, 0, 0Ch, 1, 8, 1, 9, 0, 0Fh, 1
                db 0, 1, 4, 1, 2
byte_A7EF       db 4, 0Ch, 0Eh, 0, 0, 6, 0, 7, 0, 8, 0, 0Ah, 0, 0Bh, 0
                db 0Ch, 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 0, 1, 1, 1, 2
byte_A80B       db 4, 0Bh, 0Eh, 0, 0, 6, 1, 5, 0, 8, 1, 6, 1, 7, 0, 0Ch
                db 1, 8, 1, 9, 0, 0Fh, 1, 3, 1, 1, 1, 2
byte_A827       db 4, 0Dh, 0Eh, 0, 0, 9, 2, 7, 0, 8, 1, 6, 1, 7, 0, 0Ch
                db 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 3, 1, 4, 1, 2
byte_A843       db 4, 0Dh, 0Eh, 0, 0, 9, 2, 0Ch, 0, 8, 0, 0Ah, 0, 0Bh
                db 0, 0Ch, 1, 8, 1, 9, 0, 0Fh, 1, 0, 1, 4, 1, 2
byte_A85F       db 4, 0Dh, 0Eh, 0, 0, 6, 2, 0Ch, 0, 8, 1, 0Ch, 1, 0Dh
                db 0, 0Ch, 1, 0Ah, 1, 0Bh, 0, 0Fh, 1, 0, 1, 1, 1, 2
byte_A87B       db 4, 0Dh, 0Eh, 0, 0, 6, 2, 7, 0, 8, 1, 6, 1, 7, 0, 0Ch
                db 1, 8, 1, 9, 0, 0Fh, 1, 3, 1, 1, 1, 2
byte_A897       db 4, 0Dh, 0Eh, 0, 0, 9, 2, 7, 0, 8, 1, 6, 1, 7, 0, 0Ch
                db 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 3, 1, 4, 1, 2
byte_A8B3       db 4, 0Bh, 0Eh, 0, 0, 9, 0, 7, 0, 8, 0, 0Ah, 0, 0Bh, 0
                db 0Ch, 1, 8, 1, 9, 0, 0Fh, 1, 0, 1, 4, 1, 2
byte_A8CF       db 4, 0Eh, 3, 0Bh, 0, 6, 4, 0Fh, 5, 0, 0, 0Ah, 0, 0Bh
                db 0, 0Ch, 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 0, 1, 1, 1, 2
byte_A8EB       db 5, 1, 3, 0Bh, 0, 6, 5, 2, 5, 0, 1, 6, 1, 7, 0, 0Ch
                db 1, 8, 1, 9, 0, 0Fh, 1, 3, 1, 1, 1, 2
byte_A907       db 5, 3, 3, 0Bh, 0, 9, 5, 4, 5, 0, 1, 6, 1, 7, 0, 0Ch
                db 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 3, 1, 4, 1, 2
byte_A923       db 5, 3, 3, 0Bh, 0, 9, 5, 5, 5, 0, 0, 0Ah, 0, 0Bh, 0, 0Ch
                db 1, 8, 1, 9, 0, 0Fh, 1, 0, 1, 4, 1, 2
byte_A93F       db 5, 3, 3, 0Bh, 0, 6, 5, 5, 5, 0, 1, 0Ch, 1, 0Dh, 0, 0Ch
                db 1, 0Ah, 1, 0Bh, 0, 0Fh, 1, 0, 1, 1, 1, 2
byte_A95B       db 5, 3, 3, 0Bh, 0, 6, 5, 4, 5, 0, 1, 6, 1, 7, 0, 0Ch
                db 1, 8, 1, 9, 0, 0Fh, 1, 3, 1, 1, 1, 2
byte_A977       db 5, 3, 3, 0Bh, 0, 9, 5, 4, 5, 0, 1, 6, 1, 7, 0, 0Ch
                db 0, 0Dh, 0, 0Eh, 0, 0Fh, 1, 3, 1, 4, 1, 2
byte_A993       db 5, 1, 3, 0Bh, 0, 9, 4, 0Fh, 5, 0, 0, 0Ah, 0, 0Bh, 0
                db 0Ch, 1, 8, 1, 9, 0, 0Fh, 1, 0, 1, 4, 1, 2
off_A9AF        dw offset byte_A9EF
                dw offset byte_A9F6
                dw offset byte_A9FD
                dw offset byte_A9F6
                dw offset byte_A9F6
                dw offset byte_A9F6
                dw offset byte_A9F6
                dw offset byte_A9F6
                dw offset byte_AA04
                dw offset byte_A9F6
                dw offset byte_A9FD
                dw offset byte_AA0B
                dw offset byte_AA0B
                dw offset byte_A9F6
                dw offset byte_AA12
                dw offset byte_AA12
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
                dw offset byte_AA19
byte_A9EF       db 0E0h, 60h, 60h, 0E0h, 0E0h, 0E0h, 0E0h
byte_A9F6       db 60h, 60h, 60h, 0E0h, 0E0h, 0E0h, 0E0h
byte_A9FD       db 60h, 20h, 60h, 0E0h, 0E0h, 0E0h, 0E0h
byte_AA04       db 0C0h, 60h, 60h, 0E0h, 0E0h, 0E0h, 0E0h
byte_AA0B       db 20h, 20h, 60h, 0E0h, 0E0h, 0E0h, 0E0h
byte_AA12       db 40h, 60h, 60h, 0E0h, 0E0h, 0E0h, 0E0h
byte_AA19       db 0, 0, 60h, 0E0h, 0E0h, 0E0h, 0E0h
byte_AA20       db 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 3, 0, 2, 0
                db 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0
                db 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0
                db 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0
                db 2, 0, 3, 0, 2, 0, 3, 0, 4, 0, 3, 0, 0, 4, 3, 0, 0, 0
                db 5, 0, 0, 0, 0, 6
boss_state_block:
boss_x          dw 36
boss_y          db 16
boss_hp         dw 250
xp_reward       dw 200
arena_center_x  db 7
boss_placement  db 0FFh
name_block_ptr  dw offset name_screen_x
almas_reward    dw 200
name_screen_x   db  12h
name_screen_y   db 0BBh
                db    0
boss_name_pstring db 5,'Pulpo'
byte_AA96       db 0
byte_AA97       db 0
byte_AA98       db 0
byte_AA99       db 0
byte_AA9A       db 0
byte_AA9B       db 0
byte_AA9C       db 0
                db    0
byte_AA9E       db 0
word_AA9F       dw 0
byte_AAA1       db 0

tako            ends
                end      start