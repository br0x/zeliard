include common.inc
include dungeon.inc
                .286
                .model small

akma          segment byte public 'CODE'
                assume cs:akma, ds:akma
                org 0A000h
start:
                dw offset Akma_AI_proc
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
                db 40, 40, 40, 40, 40, 40, 80, 40, 40, 40, 40, 40, 40, 40, 40, 40
                db 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40
                ; A030
                dw offset byte_A07E ; 0..9
                dw offset byte_A0E2 ; 20..34
                dw offset byte_A178 ; 50..64
                dw offset byte_A20E ; 80..86
                dw offset byte_A254 ; 94..100
                dw offset byte_A29F ; 109..110
                dw offset byte_A2B3 ; 113..124
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                ; A070
                dw offset byte_A0B0 ; 10..19
                dw offset byte_A12D ; 35..49
                dw offset byte_A1C3 ; 65..79
                dw offset byte_A231 ; 87..93
                dw offset byte_A277 ; 101..108
                dw offset byte_A2A9 ; 111..112
                dw offset byte_A2EF ; 125..136
byte_A07E       db 0, 0, 2, 3, 4                ; 0
                db 0, 5, 6, 7, 8
                db 0, 9, 0Ah, 0Dh, 0Eh
                db 0, 0Bh, 0Ch, 0Fh, 10h
                db 0, 0Fh, 10h, 11h, 0BDh
                db 0, 0F3h, 0, 0BBh, 0F4h
                db 0, 0BBh, 0F4h, 0BEh, 0BFh
                db 0, 0F4h, 0BCh, 0BFh, 0C0h
                db 0, 0BBh, 5Ah, 0BEh, 0BFh
                db 0, 5Ah, 5Bh, 0BFh, 0C0h      ; 9
byte_A0B0       db 0, 12h, 0, 15h, 16h          ; 10
                db 0, 13h, 14h, 17h, 18h
                db 0, 1Ch, 1Dh, 20h, 21h
                db 0, 1Ah, 1Bh, 1Eh, 1Fh
                db 0, 1Eh, 1Fh, 0C6h, 22h
                db 0, 0, 0F5h, 0F6h, 0C2h
                db 0, 0F6h, 0C2h, 0C4h, 0C5h
                db 0, 0C1h, 0F6h, 0C3h, 0C4h
                db 0, 0A6h, 0A7h, 0C3h, 0C4h
                db 0, 0A7h, 0C2h, 0C4h, 0C5h    ; 19
byte_A0E2       db 0, 0, 35h, 3Ch, 3Dh          ; 20
                db 0, 3Dh, 3Eh, 41h, 42h
                db 0, 31h, 32h, 35h, 36h
                db 0, 0, 2Ah, 2Eh, 23h
                db 0, 24h, 25h, 2Ah, 0
                db 0, 0, 2Ch, 2Fh, 2Dh
                db 0, 33h, 23h, 37h, 38h
                db 0, 23h, 23h, 43h, 23h
                db 0, 44h, 45h, 46h, 47h
                db 0, 26h, 27h, 2Dh, 23h
                db 0, 23h, 23h, 23h, 23h
                db 0, 39h, 3Ah, 23h, 40h
                db 0, 23h, 40h, 40h, 0
                db 0, 0, 29h, 27h, 28h
                db 0, 23h, 0, 3Ah, 3Bh          ; 34
byte_A12D       db 0, 71h, 0, 0, 73h            ; 35
                db 0, 73h, 74h, 77h, 78h
                db 0, 77h, 70h, 77h, 70h
                db 0, 82h, 83h, 88h, 70h
                db 0, 88h, 70h, 0, 88h
                db 0, 0, 77h, 81h, 82h
                db 0, 79h, 7Ah, 78h, 79h
                db 0, 70h, 78h, 84h, 85h
                db 0, 70h, 70h, 70h, 8Ch
                db 0, 8Fh, 90h, 91h, 92h
                db 0, 75h, 76h, 7Ah, 7Bh
                db 0, 7Bh, 0, 7Ch, 7Dh
                db 0, 7Fh, 80h, 86h, 87h
                db 0, 89h, 8Ah, 8Dh, 8Eh
                db 0, 87h, 0, 8Ah, 8Bh          ; 49
byte_A178       db 0, 0, 0, 48h, 49h            ; 50
                db 0, 0, 0, 0, 4Bh
                db 0, 4Eh, 4Fh, 53h, 54h
                db 0, 4Ch, 4Dh, 50h, 51h
                db 0, 55h, 23h, 57h, 58h
                db 0, 52h, 0, 23h, 56h
                db 0, 23h, 59h, 5Bh, 59h
                db 0, 4Bh, 5Eh, 67h, 68h
                db 0, 5Fh, 60h, 69h, 23h
                db 0, 44h, 6Eh, 46h, 47h
                db 0, 0, 0, 4Bh, 4Ch
                db 0, 61h, 62h, 23h, 6Bh
                db 0, 0, 0, 4Ch, 4Dh
                db 0, 63h, 64h, 6Ch, 6Dh
                db 0, 0, 0, 65h, 66h            ; 64
byte_A1C3       db 0, 0, 98h, 0, 9Dh            ; 65
                db 0, 0A2h, 70h, 0A2h, 0A6h
                db 0, 4Bh, 4Ch, 99h, 9Ah
                db 0, 9Eh, 9Fh, 0A3h, 0A4h
                db 0, 0, 0, 4Dh, 0
                db 0, 9Bh, 9Ch, 0A0h, 0A1h
                db 0, 0, 0, 4Bh, 97h
                db 0, 0B1h, 0B2h, 0B8h, 0B9h
                db 0, 0AFh, 0B0h, 70h, 0B7h
                db 0, 8Fh, 90h, 91h, 92h
                db 0, 0, 0, 4Ch, 4Dh
                db 0, 0ADh, 0AEh, 0B5h, 70h
                db 0, 0, 0, 4Bh, 4Ch
                db 0, 0ABh, 0ACh, 0B3h, 0B4h
                db 0, 0, 0, 0A9h, 0AAh          ; 79
byte_A20E       db 0, 0CBh, 0CCh, 0CDh, 0CEh    ; 80
                db 0, 0, 0C9h, 0CFh, 0D0h
                db 0, 0C7h, 0C8h, 0C9h, 0CAh
                db 0, 0D2h, 0, 0D4h, 0D5h
                db 0, 0D4h, 0D5h, 0D6h, 0D7h
                db 0, 0D5h, 0C9h, 0D7h, 0D0h
                db 0, 0C7h, 0C8h, 0C9h, 0CAh    ; 86
byte_A231       db 0, 0D8h, 0D9h, 0DAh, 0DBh    ; 87
                db 0, 0DBh, 0, 0DDh, 0DEh
                db 0, 0E1h, 0E2h, 0DFh, 0E0h
                db 0, 0D8h, 0D9h, 0DAh, 0DBh
                db 0, 0E3h, 0E4h, 0E5h, 0E6h
                db 0, 0DBh, 0E5h, 0DDh, 0E7h
                db 0, 0E5h, 0E6h, 0E7h, 0E8h    ; 93
byte_A254       db 0, 1, 0E9h, 0, 0             ; 94
                db 0, 0E9h, 0EAh, 0, 0
                db 0, 1, 0EBh, 0, 0
                db 0, 0EBh, 0ECh, 0, 0EDh
                db 0, 1, 0EBh, 0F8h, 0F7h
                db 0, 1, 0EBh, 0, 0FAh
                db 0, 1, 0EBh, 0, 0FCh          ; 100
byte_A277       db 0, 0EEh, 0EFh, 0, 0          ; 101
                db 0, 0EFh, 19h, 0, 0
                db 0, 0F0h, 0F1h, 0F2h, 0
                db 0, 0F1h, 19h, 0, 0
                db 0, 0F0h, 0F1h, 0F2h, 4Ah
                db 0, 0F0h, 0F1h, 0F2h, 34h
                db 0, 0F0h, 0F1h, 0F2h, 0FFh
                db 0, 0F1h, 19h, 4Ah, 5Ch       ; 108
byte_A29F       db 0, 0, 6Fh, 6Ah, 93h          ; 109
                db 0, 72h, 7Eh, 94h, 95h        ; 110
byte_A2A9       db 0, 96h, 0A5h, 0B6h, 0BAh     ; 111
                db 0, 0A8h, 0, 0D1h, 0D3h       ; 112
byte_A2B3       db 0, 1, 0EBh, 0F9h, 0F7h       ; 113
                db 0, 1, 0EBh, 0F8h, 0F7h
                db 0, 0, 0, 0F9h, 0F7h
                db 0, 0, 0, 0F8h, 0F7h
                db 0, 1, 0EBh, 0, 0FBh
                db 0, 1, 0EBh, 0, 0FAh
                db 0, 0, 0FAh, 0FBh, 0
                db 0, 0, 0FAh, 0FAh, 0
                db 0, 1, 0EBh, 0, 0FEh
                db 0, 1, 0EBh, 0, 0FCh
                db 0, 0, 0FDh, 0FEh, 0
                db 0, 0, 0FDh, 0FCh, 0          ; 124
byte_A2EF       db 0, 0F1h, 19h, 4Ah, 5Dh       ; 125
                db 0, 0F1h, 19h, 4Ah, 5Ch
                db 0, 0, 0, 4Ah, 5Dh
                db 0, 0, 0, 4Ah, 5Ch
                db 0, 0F1h, 19h, 3Fh, 0
                db 0, 0F1h, 19h, 34h, 0
                db 0, 34h, 0, 0, 3Fh
                db 0, 34h, 0, 0, 34h
                db 0, 0F1h, 19h, 30h, 0
                db 0, 0F1h, 19h, 0FFh, 0
                db 0, 2Bh, 0, 0, 30h
                db 0, 2Bh, 0, 0, 0FFh           ; 136

; =============== S U B R O U T I N E =======================================


Akma_AI_proc    proc near
                mov     si, ds:monsters_table_addr
                mov     byte_AA1E, 0
                mov     byte_AA1F, 0

loc_A339:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A384
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A37B
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AA1E
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte ptr [si+5], 40h
                jz      short loc_A37B
                test    byte_AA1F, 80h
                jnz     short loc_A37B
                mov     al, [si+5]
                and     al, 1Fh
                cmp     byte ptr [si+4], 5
                jnz     short loc_A378
                or      al, 80h

loc_A378:
                mov     byte_AA1F, al

loc_A37B:
                inc     byte_AA1E
                add     si, 10h
                jmp     short loc_A339
; ---------------------------------------------------------------------------

loc_A384:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                test    byte_AA1F, 0FFh
                jz      short loc_A3AB
                mov     al, byte_AA1F
                push    ax
                and     al, 1Fh
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                pop     ax
                xor     bh, bh
                mov     byte ptr ds:soundFX_request, 34
                call    sub_A97E

loc_A3AB:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A3B5
                jmp     loc_A9B0
; ---------------------------------------------------------------------------

loc_A3B5:
                mov     byte_AA24, 0
                mov     al, byte_AA20
                inc     al
                cmp     al, 3
                jb      short loc_A3C5
                xor     al, al

loc_A3C5:
                mov     byte_AA20, al
                cmp     al, 1
                jnz     short loc_A3D1
                mov     byte ptr ds:soundFX_request, 43

loc_A3D1:
                inc     byte_AA23
                test    byte_AA21, 0FFh
                jnz     short loc_A42E
                call    sub_A4D4
                jb      short loc_A3E4
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A3E4:
                mov     al, boss_y
                sub     al, 2
                and     al, 3Fh
                mov     boss_y, al
                cmp     al, 3Dh ; '='
                jz      short loc_A3F5
                jmp     loc_A492
; ---------------------------------------------------------------------------

loc_A3F5:
                mov     byte_AA21, 0FFh
                mov     byte_AA27, 0
                mov     byte_AA26, 0
                mov     byte_AA25, 0FFh
                mov     byte ptr ds:soundFX_request, 52
                mov     ax, ds:proximity_map_left_col_x
                mov     bl, ds:hero_x_in_viewport
                xor     bh, bh
                add     ax, bx
                mov     bx, ax
                sub     bx, ds:mapWidth
                jnb     short loc_A422
                xchg    ax, bx

loc_A422:
                sub     bx, 28h ; '('
                sbb     al, al
                and     al, 1
                mov     byte_AA28, al
                jmp     short loc_A47A
; ---------------------------------------------------------------------------

loc_A42E:
                call    sub_A4E6
                jnb     short loc_A47A
                mov     al, boss_y
                sub     al, 2
                and     al, 3Fh
                mov     boss_y, al
                cmp     al, 3Dh ; '='
                jnz     short loc_A492
                mov     byte_AA21, 0
                mov     byte_AA27, 0
                mov     byte_AA26, 0
                mov     byte_AA25, 0FFh
                mov     byte ptr ds:soundFX_request, 52
                mov     ax, ds:proximity_map_left_col_x
                mov     bl, ds:hero_x_in_viewport
                xor     bh, bh
                add     ax, bx
                mov     bx, ax
                sub     bx, ds:mapWidth
                jnb     short loc_A46E
                xchg    ax, bx

loc_A46E:
                sub     bx, 14h
                sbb     al, al
                not     al
                and     al, 1
                mov     byte_AA28, al

loc_A47A:
                mov     bx, offset unk_A954
                test    byte_AA21, 0FFh
                jnz     short loc_A487
                mov     bx, offset unk_A969

loc_A487:
                mov     al, byte ptr boss_x
                sub     al, 0Ah
                shr     al, 1
                xlat
                mov     boss_y, al

loc_A492:
                test    byte_AA25, 0FFh
                jz      short loc_A4F7
                mov     al, byte_AA28
                add     al, 2
                mov     byte_AA24, al
                test    byte_AA27, 0FFh
                jnz     short loc_A4C2
                inc     byte_AA26
                mov     al, byte_AA28
                not     al
                and     al, 1
                add     al, 7
                cmp     byte_AA26, al
                jb      short loc_A4F7
                mov     byte_AA27, 0FFh
                jmp     short loc_A4F7
; ---------------------------------------------------------------------------

loc_A4C2:
                dec     byte_AA26
                test    byte_AA26, 0FFh
                jnz     short loc_A4F7
                mov     byte_AA25, 0
                jmp     short loc_A4F7
Akma_AI_proc    endp


; =============== S U B R O U T I N E =======================================


sub_A4D4        proc near
                mov     ax, boss_x
                dec     ax
                dec     ax
                mov     bx, 9
                sub     bx, ax
                cmc
                jnb     short loc_A4E2
                retn
; ---------------------------------------------------------------------------

loc_A4E2:
                mov     boss_x, ax
                retn
sub_A4D4        endp


; =============== S U B R O U T I N E =======================================


sub_A4E6        proc near
                mov     ax, boss_x
                inc     ax
                inc     ax
                mov     bx, 33h ; '3'
                sub     bx, ax
                jnb     short loc_A4F3
                retn
; ---------------------------------------------------------------------------

loc_A4F3:
                mov     boss_x, ax
                retn
sub_A4E6        endp

; ---------------------------------------------------------------------------

loc_A4F7:
                push    cs
                pop     es
                mov     di, offset byte_AA2A
                mov     ax, 0FFFFh
                mov     cx, 120h
                rep stosw
                mov     si, offset off_A7F4
                mov     di, offset off_A876
                test    byte_AA21, 0FFh
                jnz     short loc_A517
                mov     si, offset off_A7EE
                mov     di, offset off_A870

loc_A517:
                mov     bl, byte_AA20
                and     bl, 3
                xor     bh, bh
                add     bx, bx
                mov     si, [bx+si]
                mov     bp, [bx+di]
                call    sub_A7CC
                mov     di, offset byte_AA67
                mov     si, offset unk_A92C
                test    byte_AA21, 0FFh
                jnz     short loc_A53C
                mov     di, offset byte_AA87
                mov     si, offset unk_A918

loc_A53C:
                mov     al, byte_AA23
                shr     al, 1
                sbb     al, al
                and     al, 0Ah
                xor     ah, ah
                add     si, ax
                mov     cx, 5

loc_A54C:
                movsb
                movsb
                add     di, 0Eh
                loop    loc_A54C
                mov     di, offset byte_AAD3
                mov     si, offset unk_A94A
                test    byte_AA21, 0FFh
                jnz     short loc_A566
                mov     di, offset byte_AA33
                mov     si, offset unk_A940

loc_A566:
                mov     bl, byte_AA24
                add     bl, bl
                xor     bh, bh
                add     si, bx
                lodsb
                mov     [di], al
                add     di, 10h
                lodsb
                mov     [di], al
                mov     byte_AA1E, 0
                mov     ax, boss_x
                mov     si, ds:monsters_table_addr
                mov     di, offset byte_AA2A
                mov     cx, 0Dh

loc_A58B:
                push    cx
                push    di
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_AA22, bl
                jb      short loc_A606
                xor     cl, cl

loc_A59C:
                push    cx
                push    ax
                cmp     byte ptr [di], 0FFh
                jz      short loc_A5FC
                mov     [si], ax
                mov     al, boss_y
                add     al, cl
                and     al, 3Fh
                mov     [si+2], al
                mov     al, byte_AA22
                mov     [si+3], al
                mov     al, [di]
                mov     ah, al
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                and     al, 0Fh
                mov     [si+4], al
                mov     [si+6], ah
                mov     al, byte_AA21
                and     al, 80h
                mov     [si+5], al
                test    byte_AA1F, 0FFh
                jz      short loc_A5DC
                or      byte ptr [si+5], 20h

loc_A5DC:
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     al, byte_AA1E
                mov     bl, al
                or      al, 80h
                xchg    al, [di]
                xor     bh, bh
                mov     ds:proximity_second_layer[bx], al
                inc     byte_AA1E
                add     si, 10h
                pop     di

loc_A5FC:
                inc     di
                pop     ax
                pop     cx
                inc     cl
                cmp     cl, 10h
                jnz     short loc_A59C

loc_A606:
                inc     ax
                pop     di
                add     di, 10h
                pop     cx
                loop    loc_A610
                jmp     short loc_A613
; ---------------------------------------------------------------------------

loc_A610:
                jmp     loc_A58B
; ---------------------------------------------------------------------------

loc_A613:
                mov     word ptr [si], 0FFFFh
                test    byte_AA25, 0FFh
                jnz     short loc_A61F
                retn
; ---------------------------------------------------------------------------

loc_A61F:
                test    byte_AA26, 0FFh
                jnz     short loc_A627
                retn
; ---------------------------------------------------------------------------

loc_A627:
                test    byte_AA28, 0FFh
                jz      short loc_A631
                jmp     loc_A6D9
; ---------------------------------------------------------------------------

loc_A631:
                test    byte_AA21, 0FFh
                jnz     short loc_A687
                mov     ax, boss_x
                mov     dl, boss_y
                add     dl, 9
                mov     cl, byte_AA26
                dec     cl
                jz      short loc_A669
                xor     ch, ch

loc_A64C:
                push    cx
                dec     ax
                dec     ax
                inc     dl
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                mov     byte_AA22, bl
                jb      short loc_A666
                mov     bx, 2603h
                call    sub_A78A

loc_A666:
                pop     cx
                loop    loc_A64C

loc_A669:
                dec     ax
                dec     ax
                inc     dl
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                mov     byte_AA22, bl
                jb      short loc_A682
                mov     bx, 2602h
                call    sub_A78A

loc_A682:
                mov     word ptr [si], 0FFFFh
                retn
; ---------------------------------------------------------------------------

loc_A687:
                mov     ax, boss_x
                add     ax, 0Bh
                mov     dl, boss_y
                add     dl, 9
                mov     cl, byte_AA26
                dec     cl
                jz      short loc_A6BB
                xor     ch, ch

loc_A69E:
                push    cx
                inc     ax
                inc     ax
                inc     dl
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                mov     byte_AA22, bl
                jb      short loc_A6B8
                mov     bx, 2603h
                call    sub_A78A

loc_A6B8:
                pop     cx
                loop    loc_A69E

loc_A6BB:
                inc     ax
                inc     ax
                inc     dl
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                mov     byte_AA22, bl
                jb      short loc_A6D4
                mov     bx, 2602h
                call    sub_A78A

loc_A6D4:
                mov     word ptr [si], 0FFFFh
                retn
; ---------------------------------------------------------------------------

loc_A6D9:
                test    byte_AA21, 0FFh
                jnz     short loc_A734
                mov     ax, boss_x
                inc     ax
                mov     dl, boss_y
                add     dl, 9
                mov     cl, byte_AA26
                dec     cl
                jz      short loc_A714
                xor     ch, ch

loc_A6F5:
                push    cx
                dec     ax
                dec     ax
                inc     dl
                inc     dl
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                mov     byte_AA22, bl
                jb      short loc_A711
                mov     bx, 2607h
                call    sub_A78A

loc_A711:
                pop     cx
                loop    loc_A6F5

loc_A714:
                dec     ax
                dec     ax
                inc     dl
                inc     dl
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                mov     byte_AA22, bl
                jb      short loc_A72F
                mov     bx, 2606h
                call    sub_A78A

loc_A72F:
                mov     word ptr [si], 0FFFFh
                retn
; ---------------------------------------------------------------------------

loc_A734:
                mov     ax, boss_x
                add     ax, 0Ah
                mov     dl, boss_y
                add     dl, 9
                mov     cl, byte_AA26
                dec     cl
                jz      short loc_A76A
                xor     ch, ch

loc_A74B:
                push    cx
                inc     ax
                inc     ax
                inc     dl
                inc     dl
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                mov     byte_AA22, bl
                jb      short loc_A767
                mov     bx, 2607h
                call    sub_A78A

loc_A767:
                pop     cx
                loop    loc_A74B

loc_A76A:
                inc     ax
                inc     ax
                inc     dl
                inc     dl
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                mov     byte_AA22, bl
                jb      short loc_A785
                mov     bx, 2606h
                call    sub_A78A

loc_A785:
                mov     word ptr [si], 0FFFFh
                retn

; =============== S U B R O U T I N E =======================================


sub_A78A        proc near
                push    ax
                push    dx
                mov     [si], ax
                and     dl, 3Fh
                mov     [si+2], dl
                mov     dh, byte_AA22
                mov     [si+3], dh
                mov     [si+4], bh
                mov     [si+6], bl
                mov     dh, byte_AA21
                and     dh, 80h
                mov     [si+5], dh
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     al, byte_AA1E
                mov     bl, al
                or      al, 80h
                xchg    al, [di]
                xor     bh, bh
                mov     ds:proximity_second_layer[bx], al
                inc     byte_AA1E
                add     si, 10h
                pop     dx
                pop     ax
                retn
sub_A78A        endp


; =============== S U B R O U T I N E =======================================


sub_A7CC        proc near
                mov     di, offset byte_AA2A
                mov     cx, 13

loc_A7D2:
                push    cx
                mov     cx, 2

loc_A7D6:
                push    cx
                mov     cx, 8

loc_A7DA:
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A7E3
                lodsb
                mov     [di], al

loc_A7E3:
                inc     di
                loop    loc_A7DA
                inc     bp
                pop     cx
                loop    loc_A7D6
                pop     cx
                loop    loc_A7D2
                retn
sub_A7CC        endp

; ---------------------------------------------------------------------------
off_A7EE        dw offset unk_A7FA
                dw offset unk_A82C
                dw offset unk_A84C
off_A7F4        dw offset unk_A813
                dw offset unk_A83C
                dw offset unk_A85E
unk_A7FA        db    0
                db  50h ; P
                db  10h
                db  13h
                db  12h
                db  11h
                db    1
                db    2
                db  51h ; Q
                db  14h
                db  15h
                db  16h
                db  17h
                db  18h
                db    3
                db    4
                db  19h
                db  1Ah
                db  1Bh
                db  1Ch
                db    5
                db    6
                db  1Dh
                db  1Eh
                db    7
unk_A813        db  10h
                db  15h
                db    7
                db  11h
                db  12h
                db  13h
                db  14h
                db    5
                db    6
                db  16h
                db  17h
                db  18h
                db  19h
                db    3
                db    4
                db  1Ah
                db  1Bh
                db  1Ch
                db  1Dh
                db    1
                db    2
                db  50h ; P
                db  1Eh
                db    0
                db  51h ; Q
unk_A82C        db    0
                db  50h ; P
                db  20h
                db    1
                db    2
                db  51h ; Q
                db  21h ; !
                db  22h ; "
                db    3
                db    4
                db  23h ; #
                db  24h ; $
                db    8
                db    9
                db  25h ; %
                db  26h ; &
unk_A83C        db  20h
                db  21h ; !
                db    8
                db  22h ; "
                db  23h ; #
                db    9
                db  24h ; $
                db  25h ; %
                db    3
                db    4
                db  26h ; &
                db    1
                db    2
                db  50h ; P
                db    0
                db  51h ; Q
unk_A84C        db    0
                db  50h ; P
                db  27h ; '
                db    1
                db    2
                db  51h ; Q
                db  28h ; (
                db  29h ; )
                db    3
                db    4
                db  2Ah ; *
                db  2Bh ; +
                db    5
                db    6
                db    7
                db  2Ch ; ,
                db  2Dh ; -
                db  2Eh ; .
unk_A85E        db  2Eh ; .
                db  2Ch ; ,
                db  2Dh ; -
                db    7
                db  2Ah ; *
                db  2Bh ; +
                db    5
                db    6
                db  28h ; (
                db  29h ; )
                db    3
                db    4
                db  27h ; '
                db    1
                db    2
                db  50h ; P
                db    0
                db  51h ; Q
off_A870        dw offset unk_A87C
                dw offset unk_A8B0
                dw offset unk_A8E4
off_A876        dw offset unk_A896
                dw offset unk_A8CA
                dw offset unk_A8FE
unk_A87C        db    0
                db    0
                db    1
                db    8
                db    4
                db    0
                db  2Ah ; *
                db 0A8h
                db  40h ; @
                db    0
                db  2Ah ; *
                db 0B0h
                db    0
                db    0
                db  56h ; V
                db  30h ; 0
                db  88h
                db  10h
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
unk_A896        db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db  88h
                db  10h
                db  56h ; V
                db  30h ; 0
                db    0
                db    0
                db  2Ah ; *
                db 0B0h
                db  40h ; @
                db    0
                db  2Ah ; *
                db 0A8h
                db    4
                db    0
                db    1
                db    8
                db    0
                db    0
                db    0
                db    0
unk_A8B0        db    0
                db    0
                db    1
                db    8
                db    0
                db    0
                db    2
                db 0A8h
                db    0
                db    0
                db    2
                db 0B0h
                db    0
                db    0
                db    1
                db  50h ; P
                db    0
                db  10h
                db    0
                db 0A0h
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
unk_A8CA        db    0
                db    0
                db    0
                db    0
                db    0
                db 0A0h
                db    0
                db  10h
                db    1
                db  50h ; P
                db    0
                db    0
                db    2
                db 0B0h
                db    0
                db    0
                db    2
                db 0A8h
                db    0
                db    0
                db    1
                db    8
                db    0
                db    0
                db    0
                db    0
unk_A8E4        db    0
                db    0
                db    1
                db    8
                db    0
                db    0
                db    2
                db 0A8h
                db    0
                db    0
                db    2
                db 0B0h
                db    0
                db    0
                db  0Ah
                db  30h ; 0
                db    0
                db  10h
                db  0Ah
                db    0
                db    0
                db    0
                db    4
                db    0
                db    0
                db    0
unk_A8FE        db    4
                db    0
                db    0
                db    0
                db  0Ah
                db    0
                db    0
                db  10h
                db  0Ah
                db  30h ; 0
                db    0
                db    0
                db    2
                db 0B0h
                db    0
                db    0
                db    2
                db 0A8h
                db    0
                db    0
                db    1
                db    8
                db    0
                db    0
                db    0
                db    0
unk_A918        db 0FFh
                db  30h ; 0
                db 0FFh
                db 0FFh
                db 0FFh
                db  31h ; 1
                db  32h ; 2
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FFh
                db  33h ; 3
                db  34h ; 4
                db 0FFh
                db  35h ; 5
                db  36h ; 6
                db 0FFh
                db 0FFh
                db 0FFh
unk_A92C        db  30h ; 0
                db 0FFh
                db 0FFh
                db  31h ; 1
                db 0FFh
                db 0FFh
                db 0FFh
                db  32h ; 2
                db 0FFh
                db 0FFh
                db  33h ; 3
                db 0FFh
                db 0FFh
                db  35h ; 5
                db  34h ; 4
                db  36h ; 6
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FFh
unk_A940        db  40h ; @
                db  41h ; A
                db  42h ; B
                db  43h ; C
                db  44h ; D
                db  43h ; C
                db  45h ; E
                db  43h ; C
                db  46h ; F
                db  43h ; C
unk_A94A        db  40h ; @
                db  41h ; A
                db  42h ; B
                db  43h ; C
                db  44h ; D
                db  47h ; G
                db  45h ; E
                db  43h ; C
                db  46h ; F
                db  43h ; C
unk_A954        db  3Ch ; <
                db  3Ch ; <
                db  3Dh ; =
                db  3Eh ; >
                db  3Fh ; ?
                db  3Fh ; ?
                db    0
                db    0
                db    0
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
unk_A969        db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    0
                db    0
                db    0
                db  3Fh ; ?
                db  3Fh ; ?
                db  3Eh ; >
                db  3Dh ; =
                db  3Ch ; <
                db  3Ch ; <

; =============== S U B R O U T I N E =======================================


sub_A97E        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_A987
                xor     ax, ax

loc_A987:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_A998
                retn
; ---------------------------------------------------------------------------

loc_A998:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A9A0
                retn
; ---------------------------------------------------------------------------

loc_A9A0:
                mov     byte_AA29, 0
                mov     byte_AA25, 0
                mov     byte ptr ds:boss_being_hit, 0FFh
                retn
sub_A97E        endp

; ---------------------------------------------------------------------------

loc_A9B0:
                mov     al, byte_AA29
                cmp     al, 28h ; '('
                jnb     short loc_AA00
                mov     byte ptr ds:sprite_flash_flag, 0FFh
                inc     byte_AA29
                cmp     al, 1Eh
                jnb     short loc_A9F3
                inc     byte_AA20
                cmp     byte_AA20, 3
                jb      short loc_A9D4
                mov     byte_AA20, 0

loc_A9D4:
                inc     byte_AA23
                inc     byte_AA24
                and     byte_AA24, 1
                test    byte_AA23, 3
                jz      short loc_A9EB
                jmp     loc_A4F7
; ---------------------------------------------------------------------------

loc_A9EB:
                mov     byte ptr ds:soundFX_request, 55
                jmp     loc_A4F7
; ---------------------------------------------------------------------------

loc_A9F3:
                mov     byte_AA20, 1
                mov     byte_AA24, 1
                jmp     loc_A4F7
; ---------------------------------------------------------------------------

loc_AA00:
                mov     byte ptr ds:boss_is_dead, 0FFh
                retn
; ---------------------------------------------------------------------------
boss_state_block:
boss_x          dw 42
boss_y          db 0
boss_hp         dw 800
xp_reward       dw 30000
arena_center_x  db 12
boss_placement  db 0
                dw offset name_screen_x
almas_reward    dw 3800
name_screen_x   db  10h
name_screen_y   db 0BBh
                db    2
aAlguien        db 7,'Alguien'
byte_AA1E       db 0
byte_AA1F       db 0
byte_AA20       db 0
byte_AA21       db 0FFh
byte_AA22       db 0
byte_AA23       db 0
byte_AA24       db 0
byte_AA25       db 0
byte_AA26       db 0
byte_AA27       db 0
byte_AA28       db 0
byte_AA29       db 0
byte_AA2A       db 0, 0, 0, 0, 0, 0, 0, 0, 0
byte_AA33       db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
byte_AA67       db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
byte_AA87       db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0
byte_AAD3       db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0
akma          ends


                end start
