include common.inc
include dungeon.inc
                .286
                .model small

mao2          segment byte public 'CODE'
                assume cs:mao2, ds:mao2
                org 0A000h
start:
                dw offset Mao2_AI_proc
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
                db 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80
                db 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80
                ; A030
                dw offset byte_A07C
                dw offset byte_A0CC
                dw offset byte_A11C
                dw offset byte_A16C
                dw offset byte_A18F
                dw offset byte_A1A8
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
                dw 0
                ; A070
                dw offset byte_A1B7
                dw offset byte_A207
                dw offset byte_A257
                dw offset byte_A2A7
                dw offset byte_A2CA
                dw offset byte_A2E3
byte_A07C       db 1, 1, 2, 3, 4
                db 1, 5, 6, 8, 9
                db 1, 0, 7, 0Ah, 0Bh
                db 1, 0Ch, 0Dh, 0Fh, 10h
                db 1, 0Eh, 0Fh, 11h, 12h
                db 1, 12h, 13h, 15h, 16h
                db 1, 0, 14h, 18h, 19h
                db 1, 16h, 17h, 18h, 1Bh
                db 1, 0Ch, 0Dh, 1Ch, 1Dh
                db 1, 1Eh, 1Fh, 20h, 21h
                db 1, 20h, 21h, 18h, 22h
                db 1, 21h, 0, 22h, 23h
                db 1, 5, 6, 0F3h, 0F4h
                db 1, 0F7h, 0F8h, 25h, 26h
                db 1, 27h, 28h, 2Ah, 2Bh
                db 1, 2Bh, 2Ch, 18h, 2Eh
byte_A0CC       db 1, 0F5h, 0F6h, 0, 24h
                db 1, 11h, 27h, 29h, 2Ah
                db 1, 0, 29h, 18h, 2Dh
                db 1, 0F7h, 0F8h, 30h, 31h
                db 1, 33h, 34h, 35h, 36h
                db 1, 35h, 36h, 37h, 38h
                db 1, 0, 0, 0F5h, 0F6h
                db 1, 2Fh, 30h, 32h, 33h
                db 1, 0Ch, 70h, 72h, 73h
                db 1, 75h, 76h, 78h, 79h
                db 1, 71h, 72h, 74h, 75h
                db 1, 74h, 75h, 18h, 78h
                db 1, 76h, 0, 79h, 7Ah
                db 1, 0Ch, 0Dh, 0Fh, 10h
                db 1, 12h, 13h, 7Ch, 7Bh
                db 1, 7Dh, 0, 7Eh, 0
byte_A11C       db 1, 13h, 0, 7Bh, 7Ch
                db 1, 0, 7Dh, 0, 7Eh
                db 1, 0Eh, 0Fh, 11h, 12h
                db 1, 7Bh, 7Ch, 0, 7Dh
                db 1, 75h, 1Ah, 7Dh, 7Dh
                db 1, 7Dh, 7Dh, 7Eh, 7Eh
                db 1, 8Eh, 6, 8, 9
                db 1, 0, 8Dh, 0, 8Fh
                db 1, 0, 8Fh, 90h, 91h
                db 1, 96h, 6, 8, 9
                db 1, 0, 0, 94h, 95h
                db 1, 0, 0, 92h, 93h
                db 1, 0, 97h, 99h, 9Ah
                db 1, 98h, 99h, 9Bh, 9Ch
                db 1, 0Ch, 0Dh, 0B1h, 0B2h
                db 1, 0B1h, 0B2h, 0B4h, 0B5h
byte_A16C       db 1, 0B2h, 0, 0B5h, 0B6h
                db 1, 0, 7, 0ADh, 0AEh
                db 1, 0AFh, 0B0h, 18h, 0B3h
                db 1, 0, 8Fh, 0ADh, 0AEh
                db 1, 0, 0, 0ADh, 0AEh
                db 1, 99h, 9Ah, 0B7h, 0AEh
                db 1, 98h, 99h, 9Bh, 0B7h
byte_A18F       db 1, 0C3h, 0C4h, 0C5h, 0C6h
                db 1, 0CBh, 0CCh, 0CDh, 0CEh
                db 1, 0CFh, 0D0h, 0D1h, 0D2h
                db 1, 0D3h, 0D4h, 0D5h, 0D6h
                db 1, 0D7h, 0D8h, 0D9h, 0DAh
byte_A1A8       db 0, 0DBh, 0DCh, 0DDh, 0DEh
                db 0, 0DFh, 0E0h, 0E1h, 0E2h
                db 0, 0E3h, 0E4h, 0E5h, 0E6h
byte_A1B7       db 1, 39h, 3Ah, 3Bh, 3Ch
                db 1, 3Dh, 3Eh, 3Fh, 40h
                db 1, 41h, 0, 44h, 45h
                db 1, 42h, 43h, 46h, 47h
                db 1, 49h, 4Ah, 4Dh, 4Eh
                db 1, 4Ch, 4Dh, 50h, 51h
                db 1, 47h, 48h, 4Ah, 4Bh
                db 1, 4Fh, 0, 52h, 51h
                db 1, 42h, 43h, 53h, 54h
                db 1, 55h, 56h, 57h, 58h
                db 1, 57h, 58h, 5Ah, 51h
                db 1, 0, 57h, 59h, 5Ah
                db 1, 3Dh, 3Eh, 0F9h, 0FAh
                db 1, 0FBh, 0FCh, 5Bh, 5Ch
                db 1, 5Eh, 5Fh, 61h, 62h
                db 1, 60h, 61h, 64h, 51h
byte_A207       db 1, 0FDh, 0FEh, 5Dh, 0
                db 1, 5Fh, 4Bh, 62h, 63h
                db 1, 63h, 0, 65h, 51h
                db 1, 0FBh, 0FCh, 66h, 67h
                db 1, 69h, 6Ah, 6Ch, 6Dh
                db 1, 6Ch, 6Dh, 6Eh, 6Fh
                db 1, 0, 0, 0FDh, 0FEh
                db 1, 67h, 68h, 6Ah, 6Bh
                db 1, 7Fh, 43h, 80h, 81h
                db 1, 83h, 84h, 87h, 88h
                db 1, 81h, 82h, 84h, 85h
                db 1, 84h, 85h, 88h, 51h
                db 1, 0, 83h, 86h, 87h
                db 1, 42h, 43h, 46h, 47h
                db 1, 49h, 4Ah, 8Ah, 89h
                db 1, 0, 8Bh, 0, 8Ch
byte_A257       db 1, 47h, 48h, 4Ah, 4Bh
                db 1, 89h, 8Ah, 8Bh, 0
                db 1, 0, 49h, 89h, 8Ah
                db 1, 8Bh, 0, 8Ch, 0
                db 1, 77h, 84h, 8Bh, 8Bh
                db 1, 8Bh, 8Bh, 8Ch, 8Ch
                db 1, 3Dh, 9Dh, 3Fh, 40h
                db 1, 9Eh, 0, 9Fh, 0
                db 1, 9Fh, 0, 0A0h, 0A1h
                db 1, 3Dh, 0A2h, 3Fh, 40h
                db 1, 0, 0, 0A3h, 0A4h
                db 1, 0, 0, 0A5h, 0A6h
                db 1, 0A7h, 0, 0A8h, 0A9h
                db 1, 0A9h, 0AAh, 0ABh, 0ACh
                db 1, 42h, 43h, 0BAh, 0BBh
                db 1, 0BAh, 0BBh, 0BFh, 0C0h
byte_A2A7       db 1, 0, 0BAh, 0BEh, 0BFh
                db 1, 41h, 0, 0B8h, 0B9h
                db 1, 0BCh, 0BDh, 0C1h, 51h
                db 1, 9Fh, 0, 0B8h, 0B9h
                db 1, 0, 0, 0B8h, 0B9h
                db 1, 0A8h, 0A9h, 0B8h, 0C2h
                db 1, 0A9h, 0AAh, 0C2h, 0ACh
byte_A2CA       db 1, 0C7h, 0C8h, 0C9h, 0CAh
                db 1, 0CBh, 0CCh, 0CDh, 0CEh
                db 1, 0CFh, 0D0h, 0D1h, 0D2h
                db 1, 0D3h, 0D4h, 0D5h, 0D6h
                db 1, 0D7h, 0D8h, 0D9h, 0DAh
byte_A2E3       db 0, 0E7h, 0E8h, 0E9h, 0EAh
                db 0, 0EBh, 0ECh, 0EDh, 0EEh
                db 0, 0EFh, 0F0h, 0F1h, 0F2h

; =============== S U B R O U T I N E =======================================


Mao2_AI_proc    proc near

                mov     si, ds:monsters_table_addr
                mov     byte_AC1D, 0
                mov     byte_AC1C, 0

loc_A300:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A351
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A348
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AC1C
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte_AC1D, 80h
                jnz     short loc_A348
                test    byte ptr [si+5], 40h
                jz      short loc_A348
                mov     al, [si+5]
                and     al, 1Fh
                test    byte ptr [si+4], 1Fh
                jnz     short loc_A345
                test    byte ptr [si+6], 0Fh
                jnz     short loc_A345
                or      al, 80h

loc_A345:
                mov     byte_AC1D, al

loc_A348:
                inc     byte_AC1C
                add     si, 10h
                jmp     short loc_A300
; ---------------------------------------------------------------------------

loc_A351:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                mov     word_AC26, si
                mov     byte_AC1C, 0
                test    byte_AC1D, 0FFh
                jz      short loc_A396
                mov     al, byte_AC1D
                and     al, 1Fh
                push    ax
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                pop     ax
                xor     bh, bh
                shr     bx, 1
                cmp     al, 1
                jz      short loc_A381
                shr     bx, 1

loc_A381:
                call    sub_AB51
                mov     byte ptr ds:soundFX_request, 57
                cmp     boss_hp, 200
                jnb     short loc_A396
                mov     byte_AC32, 0FFh

loc_A396:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A3A0
                jmp     loc_ABC4
; ---------------------------------------------------------------------------

loc_A3A0:
                test    byte_AC21, 0FFh
                jnz     short loc_A3B5
                test    byte ptr ds:byte_FF21, 0FFh
                jnz     short loc_A3AF
                retn
; ---------------------------------------------------------------------------

loc_A3AF:
                mov     byte_AC21, 0FFh
                retn
; ---------------------------------------------------------------------------

loc_A3B5:
                test    byte_AC32, 0FFh
                jz      short loc_A3BF
                jmp     sub_A4C9
; ---------------------------------------------------------------------------

loc_A3BF:
                test    byte_AC23, 0FFh
                jnz     short loc_A3F3
                test    byte_AC28, 0FFh
                jz      short loc_A3D0
                jmp     loc_A7AE
; ---------------------------------------------------------------------------

loc_A3D0:
                test    byte_AC2D, 0FFh
                jz      short loc_A3DA
                jmp     loc_A7AE
; ---------------------------------------------------------------------------

loc_A3DA:
                call    sub_A479
                mov     byte_AC25, 0
                mov     byte_AC23, 0FFh
                call    word ptr cs:get_random_proc
                rol     al, 1
                and     al, 1
                mov     byte_AC24, al

loc_A3F3:
                inc     byte_AC25
                mov     al, byte_AC25
                cmp     al, 6
                jnb     short loc_A41C
                shr     al, 1
                jnb     short loc_A405
                jmp     loc_A7AE
; ---------------------------------------------------------------------------

loc_A405:
                mov     byte ptr ds:soundFX_request, 59
                mov     byte_AC22, 60h ; '`'
                mov     al, byte_AC24
                mov     cl, 10
                mul     cl
                mov     byte_AC1B, al
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_A41C:
                cmp     al, 0Bh
                jnb     short loc_A44F
                sub     al, 6
                mov     bl, al
                xor     bh, bh
                mov     al, byte_AC24
                mov     ah, al
                add     al, al
                add     al, al
                add     al, ah
                add     bx, offset unk_A46F
                xlat
                mov     byte_AC1B, al
                mov     byte_AC22, 0
                cmp     al, 9
                jnz     short loc_A445
                call    sub_A8E5

loc_A445:
                cmp     al, 0Ch
                jnz     short loc_A44C
                call    sub_A90E

loc_A44C:
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_A44F:
                cmp     al, 11h
                jnb     short loc_A467
                shr     al, 1
                jnb     short loc_A45A
                jmp     loc_A7AE
; ---------------------------------------------------------------------------

loc_A45A:
                mov     byte ptr ds:soundFX_request, 59
                mov     byte_AC22, 60h ; '`'
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_A467:
                mov     byte_AC23, 0
                jmp     loc_A7AE
Mao2_AI_proc    endp

; ---------------------------------------------------------------------------
unk_A46F        db    0
                db    0
                db    7
                db    7
                db    9
                db  0Ah
                db  0Ah
                db  0Bh
                db  0Bh
                db  0Ch

; =============== S U B R O U T I N E =======================================


sub_A479        proc near
                mov     boss_y, 9
                call    word ptr cs:get_random_proc
                shr     al, 1
                sbb     al, al
                mov     byte_AC1E, al
                not     al
                and     al, 14h
                add     al, ds:proximity_map_left_col_x
                add     al, 4
                cmp     al, ds:mapWidth
                jb      short loc_A49E
                sub     al, ds:mapWidth

loc_A49E:
                mov     byte ptr boss_x, al
                cmp     al, 16
                jb      short loc_A4AA
                cmp     al, 53
                jnb     short loc_A4AA
                retn
; ---------------------------------------------------------------------------

loc_A4AA:
                not     byte_AC1E
                mov     al, byte_AC1E
                not     al
                and     al, 14h
                add     al, ds:proximity_map_left_col_x
                add     al, 4
                cmp     al, ds:mapWidth
                jb      short loc_A4C5
                sub     al, ds:mapWidth

loc_A4C5:
                mov     byte ptr boss_x, al
                retn
sub_A479        endp


; =============== S U B R O U T I N E =======================================


sub_A4C9        proc near
                inc     byte_AC38
                test    byte_AC38, 1Fh
                jnz     short loc_A4D7
                call    sub_AB88

loc_A4D7:
                test    byte_AC33, 0FFh
                jz      short loc_A4E1
                jmp     loc_A617
; ---------------------------------------------------------------------------

loc_A4E1:
                test    byte_AC36, 0FFh
                jz      short loc_A4EB
                jmp     loc_A5F7
; ---------------------------------------------------------------------------

loc_A4EB:
                test    byte_AC28, 0FFh
                jz      short loc_A4F5
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_A4F5:
                mov     al, ds:proximity_map_left_col_x
                add     al, ds:hero_x_in_viewport
                add     al, 3
                cmp     al, ds:mapWidth
                jb      short loc_A508
                sub     al, ds:mapWidth

loc_A508:
                xor     cl, cl
                cmp     byte ptr boss_x, al
                jnb     short loc_A512
                mov     cl, 0FFh

loc_A512:
                mov     byte_AC1E, cl
                or      cl, cl
                jnz     short loc_A57B
                mov     ah, byte ptr boss_x
                sub     ah, al
                and     ah, 0FEh
                cmp     ah, 8
                jnz     short loc_A52B
                jmp     loc_A5CD
; ---------------------------------------------------------------------------

loc_A52B:
                jnb     short loc_A554
                dec     byte_AC1B
                and     byte_AC1B, 3
                test    byte_AC1B, 1
                jnz     short loc_A540
                call    sub_A6A7

loc_A540:
                call    sub_A6A7
                jb      short loc_A548
                jmp     loc_A5F4
; ---------------------------------------------------------------------------

loc_A548:
                mov     byte_AC34, 0
                mov     byte_AC33, 0FFh
                jmp     short loc_A5CD
; ---------------------------------------------------------------------------

loc_A554:
                inc     byte_AC1B
                and     byte_AC1B, 3
                test    byte_AC1B, 1
                jz      short loc_A567
                call    sub_A691

loc_A567:
                call    sub_A691
                jb      short loc_A56F
                jmp     loc_A5F4
; ---------------------------------------------------------------------------

loc_A56F:
                mov     byte_AC34, 0
                mov     byte_AC33, 0FFh
                jmp     short loc_A5CD
; ---------------------------------------------------------------------------

loc_A57B:
                sub     al, byte ptr boss_x
                and     al, 0FEh
                cmp     al, 8
                jz      short loc_A5CD
                jnb     short loc_A5AB
                dec     byte_AC1B
                and     byte_AC1B, 3
                test    byte_AC1B, 1
                jnz     short loc_A59A
                call    sub_A691

loc_A59A:
                call    sub_A691
                jnb     short loc_A5F4
                mov     byte_AC34, 0
                mov     byte_AC33, 0FFh
                jmp     short loc_A5CD
; ---------------------------------------------------------------------------

loc_A5AB:
                inc     byte_AC1B
                and     byte_AC1B, 3
                test    byte_AC1B, 1
                jz      short loc_A5BE
                call    sub_A6A7

loc_A5BE:
                call    sub_A6A7
                jnb     short loc_A5F4
                mov     byte_AC34, 0
                mov     byte_AC33, 0FFh

loc_A5CD:
                mov     al, byte_AC35
                mov     byte_AC35, 0FFh
                or      al, al
                jnz     short loc_A5DC
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_A5DC:
                and     byte_AC1B, 0FEh
                call    word ptr cs:get_random_proc
                and     al, 0Fh
                jnz     short loc_A5F4
                mov     byte_AC37, 0
                mov     byte_AC36, 0FFh

loc_A5F4:
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_A5F7:
                mov     al, byte_AC37
                inc     byte_AC37
                mov     bx, offset unk_A46F
                xlat
                mov     byte_AC1B, al
                cmp     al, 9
                jz      short loc_A60C
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_A60C:
                mov     byte_AC36, 0
                call    sub_A8E5
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_A617:
                mov     bl, byte_AC34
                add     bl, bl
                add     bl, byte_AC34
                xor     bh, bh
                add     bx, offset unk_A666
                mov     al, [bx]
                push    bx
                or      al, al
                jz      short loc_A643
                test    byte_AC1E, 0FFh
                jnz     short loc_A63D
                call    sub_A691
                call    sub_A691
                jmp     short loc_A643
; ---------------------------------------------------------------------------

loc_A63D:
                call    sub_A6A7
                call    sub_A6A7

loc_A643:
                pop     bx
                mov     al, boss_y
                add     al, [bx+1]
                and     al, 3Fh
                mov     boss_y, al
                mov     al, [bx+2]
                mov     byte_AC1B, al
                inc     byte_AC34
                cmp     byte ptr [bx+3], 80h
                jnz     short sub_A6BC
                mov     byte_AC33, 0
                jmp     short sub_A6BC
sub_A4C9        endp

; ---------------------------------------------------------------------------
unk_A666        db    0
                db    0
                db    4
                db    0
                db    0
                db    4
                db    0
                db 0FEh
                db    5
                db    1
                db 0FEh
                db    5
                db    1
                db 0FEh
                db    5
                db    1
                db    0
                db    6
                db    1
                db    0
                db    6
                db    1
                db    0
                db    6
                db    1
                db    2
                db    6
                db    1
                db    2
                db    6
                db    1
                db    2
                db    6
                db    0
                db    0
                db    4
                db    0
                db    0
                db    4
                db    0
                db    0
                db    0
                db  80h

; =============== S U B R O U T I N E =======================================


sub_A691        proc near
                mov     ax, boss_x
                dec     ax
                mov     bx, 0Eh
                sub     bx, ax
                cmc
                jnb     short loc_A69E
                retn
; ---------------------------------------------------------------------------

loc_A69E:
                mov     boss_x, ax
                mov     byte_AC35, 0
                retn
sub_A691        endp


; =============== S U B R O U T I N E =======================================


sub_A6A7        proc near
                mov     ax, boss_x
                inc     ax
                mov     bx, 35h ; '5'
                sub     bx, ax
                jnb     short loc_A6B3
                retn
; ---------------------------------------------------------------------------

loc_A6B3:
                mov     boss_x, ax
                mov     byte_AC35, 0
                retn
sub_A6A7        endp


; =============== S U B R O U T I N E =======================================


sub_A6BC        proc near
                push    cs
                pop     es
                mov     di, offset unk_AC39
                mov     al, 0FFh
                mov     cx, 36h ; '6'
                rep stosb
                mov     di, offset off_A9E4
                mov     si, offset off_AAE1
                test    byte_AC1E, 0FFh
                jnz     short loc_A6DB
                mov     di, offset off_A957
                mov     si, offset off_AA71

loc_A6DB:
                mov     bl, byte_AC1B
                xor     bh, bh
                add     bx, bx
                mov     di, [bx+di]
                mov     bp, [bx+si]
                call    sub_A939
                cmp     byte_AC1B, 5
                jnz     short loc_A70E
                test    byte_AC1E, 0FFh
                jz      short loc_A704
                mov     byte_AC41, 23h ; '#'
                mov     byte_AC4A, 1Fh
                jmp     short loc_A70E
; ---------------------------------------------------------------------------

loc_A704:
                mov     byte_AC65, 1Fh
                mov     byte_AC6E, 21h ; '!'

loc_A70E:
                mov     ax, boss_x
                mov     si, word_AC26
                mov     di, 0AC39h
                mov     cx, 6

loc_A71B:
                push    cx
                push    di
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_AC1F, bl
                jb      short loc_A799
                xor     cl, cl

loc_A72C:
                push    cx
                push    ax
                cmp     byte ptr [di], 0FFh
                jz      short loc_A78F
                mov     [si], ax
                add     cl, boss_y
                and     cl, 3Fh
                mov     [si+2], cl
                mov     al, byte_AC1F
                mov     [si+3], al
                mov     al, [di]
                mov     ah, al
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                or      al, byte_AC22
                mov     [si+4], al
                mov     [si+6], ah
                mov     al, byte_AC1E
                and     al, 80h
                mov     [si+5], al
                test    byte_AC1D, 0FFh
                jz      short loc_A76E
                or      byte ptr [si+5], 20h

loc_A76E:
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AC1C
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                pop     di
                add     si, 10h
                inc     byte_AC1C

loc_A78F:
                inc     di
                pop     ax
                pop     cx
                inc     cl
                cmp     cl, 9
                jnz     short loc_A72C

loc_A799:
                inc     ax
                pop     di
                add     di, 9
                pop     cx
                loop    loc_A7A3
                jmp     short loc_A7A6
; ---------------------------------------------------------------------------

loc_A7A3:
                jmp     loc_A71B
; ---------------------------------------------------------------------------

loc_A7A6:
                mov     word_AC26, si
                mov     word ptr [si], 0FFFFh

loc_A7AE:
                test    byte_AC28, 0FFh
                jnz     short loc_A7B8
                jmp     loc_A853
; ---------------------------------------------------------------------------

loc_A7B8:
                mov     si, word_AC26
                cmp     byte_AC2C, 9
                jnb     short loc_A7E6
                cmp     byte_AC2C, 3
                jnb     short loc_A7D3
                inc     byte_AC2A
                and     byte_AC2A, 3Fh

loc_A7D3:
                mov     al, byte_AC29
                inc     al
                test    byte_AC2B, 0FFh
                jnz     short loc_A7E3
                dec     al
                dec     al

loc_A7E3:
                mov     byte_AC29, al

loc_A7E6:
                mov     al, byte_AC29
                xor     ah, ah
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                jb      short loc_A83F
                mov     [si], ax
                mov     al, byte_AC2A
                mov     [si+2], al
                mov     [si+3], bl
                mov     byte ptr [si+4], 24h ; '$'
                xor     al, al
                mov     ah, byte_AC2C
                cmp     ah, 3
                jb      short loc_A815
                and     ah, 3
                inc     ah
                mov     al, ah

loc_A815:
                mov     [si+6], al
                mov     al, byte_AC2B
                and     al, 80h
                mov     [si+5], al
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AC1C
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                inc     byte_AC1C

loc_A83F:
                mov     word ptr [si], 0FFFFh
                inc     byte_AC2C
                cmp     byte_AC2C, 0Bh
                jb      short loc_A853
                mov     byte_AC28, 0

loc_A853:
                test    byte_AC2D, 0FFh
                jnz     short loc_A85B
                retn
; ---------------------------------------------------------------------------

loc_A85B:
                xor     dl, dl
                cmp     byte_AC31, 3
                jnb     short loc_A86F
                inc     byte_AC2F
                and     byte_AC2F, 3Fh
                mov     dl, 2

loc_A86F:
                mov     al, byte_AC2E
                inc     al
                test    byte_AC30, 0FFh
                jnz     short loc_A87F
                dec     al
                dec     al

loc_A87F:
                mov     byte_AC2E, al
                xor     ah, ah
                push    dx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                pop     dx
                jb      short loc_A8C8
                mov     [si], ax
                mov     al, byte_AC2F
                mov     [si+2], al
                mov     [si+3], bl
                mov     byte ptr [si+4], 25h ; '%'
                mov     [si+6], dl
                mov     al, byte_AC30
                and     al, 80h
                mov     [si+5], al
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AC1C
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                inc     byte_AC1C

loc_A8C8:
                mov     word ptr [si], 0FFFFh
                inc     byte_AC31
                cmp     byte_AC2E, 10h
                jb      short loc_A8DF
                cmp     byte_AC2E, 39h ; '9'
                jnb     short loc_A8DF
                retn
; ---------------------------------------------------------------------------

loc_A8DF:
                mov     byte_AC2D, 0
                retn
sub_A6BC        endp


; =============== S U B R O U T I N E =======================================


sub_A8E5        proc near
                mov     byte_AC2C, 0
                mov     byte_AC28, 0FFh
                mov     al, byte_AC1E
                mov     byte_AC2B, al
                and     al, 5
                add     al, byte ptr boss_x
                mov     byte_AC29, al
                mov     al, boss_y
                add     al, 4
                and     al, 3Fh
                mov     byte_AC2A, al
                mov     byte ptr ds:soundFX_request, 58
                retn
sub_A8E5        endp


; =============== S U B R O U T I N E =======================================


sub_A90E        proc near
                mov     byte_AC31, 0
                mov     byte_AC2D, 0FFh
                mov     al, byte_AC1E
                mov     byte_AC30, al
                and     al, 8
                add     al, byte ptr boss_x
                dec     al
                mov     byte_AC2E, al
                mov     al, boss_y
                add     al, 4
                and     al, 3Fh
                mov     byte_AC2F, al
                mov     byte ptr ds:soundFX_request, 58
                retn
sub_A90E        endp


; =============== S U B R O U T I N E =======================================


sub_A939        proc near
                mov     si, offset unk_AC39
                mov     cx, 6

loc_A93F:
                push    cx
                mov     cx, 8

loc_A943:
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A94E
                mov     al, [di]
                mov     [si], al
                inc     di

loc_A94E:
                inc     si
                loop    loc_A943
                inc     bp
                inc     si
                pop     cx
                loop    loc_A93F
                retn
sub_A939        endp

; ---------------------------------------------------------------------------
off_A957        dw offset byte_A973
                dw offset byte_A97B
                dw offset byte_A982
                dw offset byte_A98A
                dw offset byte_A991
                dw offset byte_A999
                dw offset byte_A9A1
                dw offset byte_A9A8
                dw offset byte_A9B1
                dw offset byte_A9BA
                dw offset byte_A9C3
                dw offset byte_A9CA
                dw offset byte_A9D2
                dw offset byte_A9DB
byte_A973       db 2, 6, 4, 0, 1, 3, 5, 7
byte_A97B       db 2, 0, 1, 8, 9, 0Ah, 0Bh
byte_A982       db 10h, 12h, 11h, 0, 0Ch, 0Dh, 0Eh, 0Fh
byte_A98A       db 16h, 17h, 0, 0Ch, 13h, 14h, 15h
byte_A991       db 2, 1Ah, 1Bh, 0, 1, 18h, 19h, 1Ch
byte_A999       db 2, 22h, 23h, 0, 1, 1Dh, 1Eh, 20h
byte_A9A1       db 2, 1Ah, 0, 1, 18h, 24h, 25h
byte_A9A8       db 27h, 28h, 6, 4, 0, 26h, 3, 5, 7
byte_A9B1       db 2Bh, 2Ah, 6, 4, 0, 29h, 3, 5, 7
byte_A9BA       db 2Dh, 2Ch, 6, 4, 0, 29h, 3, 5, 7
byte_A9C3       db 31h, 32h, 0, 1, 2Eh, 2Fh, 30h
byte_A9CA       db 27h, 33h, 32h, 0, 26h, 2Eh, 2Fh, 30h
byte_A9D2       db 2Bh, 2Ah, 34h, 32h, 0, 29h, 2Eh, 2Fh, 30h
byte_A9DB       db 36h, 2Ch, 35h, 32h, 0, 29h, 2Eh, 2Fh, 30h
off_A9E4        dw offset byte_AA00
                dw offset byte_AA08
                dw offset byte_AA0F
                dw offset byte_AA17
                dw offset byte_AA1E
                dw offset byte_AA26
                dw offset byte_AA2E
                dw offset byte_AA35
                dw offset byte_AA3E
                dw offset byte_AA47
                dw offset byte_AA50
                dw offset byte_AA57
                dw offset byte_AA5F
                dw offset byte_AA68
byte_AA00       db 5, 0, 1, 3, 4, 6, 2, 7
byte_AA08       db 0Bh, 0, 1, 8, 9, 0Ah, 2
byte_AA0F       db 0Fh, 0, 0Ch, 0Dh, 0Eh, 11h, 10h, 12h
byte_AA17       db 0, 0Ch, 13h, 14h, 15h, 17h, 16h
byte_AA1E       db 1Ch, 0, 1, 18h, 19h, 1Ah, 1Bh, 2
byte_AA26       db 22h, 0, 1, 1Dh, 1Eh, 20h, 21h, 2
byte_AA2E       db 0, 1, 18h, 24h, 25h, 1Ah, 2
byte_AA35       db 5, 0, 26h, 3, 4, 6, 27h, 28h, 7
byte_AA3E       db 5, 0, 29h, 3, 4, 6, 2Ah, 7, 2Bh
byte_AA47       db 5, 0, 29h, 3, 4, 6, 2Ch, 7, 2Dh
byte_AA50       db 30h, 0, 1, 2Eh, 2Fh, 31h, 32h
byte_AA57       db 30h, 0, 26h, 2Eh, 2Fh, 27h, 33h, 32h
byte_AA5F       db 30h, 0, 29h, 2Eh, 2Fh, 2Ah, 34h, 32h, 2Bh
byte_AA68       db 30h, 0, 29h, 2Eh, 2Fh, 2Ch, 35h, 32h, 36h
off_AA71        dw offset byte_AA8D
                dw offset byte_AA93
                dw offset byte_AA99
                dw offset byte_AA9F
                dw offset byte_AAA5
                dw offset byte_AAAB
                dw offset byte_AAB1
                dw offset byte_AAB7
                dw offset byte_AABD
                dw offset byte_AAC3
                dw offset byte_AAC9
                dw offset byte_AACF
                dw offset byte_AAD5
                dw offset byte_AADB
byte_AA8D       db 0, 0, 11h, 4, 0AAh, 1
byte_AA93       db 0, 0, 10h, 0, 0ABh, 1
byte_AA99       db 0, 0, 9, 2, 0AAh, 1
byte_AA9F       db 0, 0, 10h, 4, 0ABh, 0
byte_AAA5       db 0, 0, 8, 3, 55h, 1
byte_AAAB       db 0, 0, 10h, 5, 0AAh, 2
byte_AAB1       db 0, 0, 10h, 4, 0ABh, 0
byte_AAB7       db 0, 0, 31h, 4, 0AAh, 1
byte_AABD       db 40h, 0, 41h, 4, 0AAh, 1
byte_AAC3       db 0, 10h, 21h, 4, 0AAh, 1
byte_AAC9       db 0, 0, 5, 0, 2Bh, 1
byte_AACF       db 0, 0, 0Dh, 0, 2Bh, 1
byte_AAD5       db 10h, 0, 15h, 0, 2Bh, 1
byte_AADB       db 0, 4, 0Dh, 0, 2Bh, 1
off_AAE1        dw offset byte_AAFD
                dw offset byte_AB03
                dw offset byte_AB09
                dw offset byte_AB0F
                dw offset byte_AB15
                dw offset byte_AB1B
                dw offset byte_AB21
                dw offset byte_AB27
                dw offset byte_AB2D
                dw offset byte_AB33
                dw offset byte_AB39
                dw offset byte_AB3F
                dw offset byte_AB45
                dw offset byte_AB4B
byte_AAFD       db 1, 0AAh, 4, 11h, 0, 0
byte_AB03       db 1, 0ABh, 0, 10h, 0, 0
byte_AB09       db 1, 0AAh, 2, 9, 0, 0
byte_AB0F       db 0, 0ABh, 4, 10h, 0, 0
byte_AB15       db 1, 55h, 3, 8, 0, 0
byte_AB1B       db 2, 0AAh, 5, 10h, 0, 0
byte_AB21       db 0, 0ABh, 4, 10h, 0, 0
byte_AB27       db 1, 0AAh, 4, 31h, 0, 0
byte_AB2D       db 1, 0AAh, 4, 41h, 0, 40h
byte_AB33       db 1, 0AAh, 4, 21h, 10h, 0
byte_AB39       db 1, 2Bh, 0, 5, 0, 0
byte_AB3F       db 1, 2Bh, 0, 0Dh, 0, 0
byte_AB45       db 1, 2Bh, 0, 15h, 0, 10h
byte_AB4B       db 1, 2Bh, 0, 0Dh, 4, 0

; =============== S U B R O U T I N E =======================================


sub_AB51        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_AB5A
                xor     ax, ax

loc_AB5A:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_AB6B
                retn
; ---------------------------------------------------------------------------

loc_AB6B:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_AB73
                retn
; ---------------------------------------------------------------------------

loc_AB73:
                mov     byte_AC20, 0
                mov     byte_AC28, 0
                mov     byte_AC2D, 0
                mov     byte ptr ds:boss_being_hit, 0FFh
                retn
sub_AB51        endp


; =============== S U B R O U T I N E =======================================


sub_AB88        proc near
                cmp     boss_hp, 320h
                jnz     short loc_AB91
                retn
; ---------------------------------------------------------------------------

loc_AB91:
                mov     bx, boss_hp
                add     bx, 50h ; 'P'
                mov     ax, 320h
                cmp     ax, bx
                jnb     short loc_ABB6
                mov     bx, 320h
                mov     byte_AC32, 0
                mov     byte_AC25, 0Ah
                mov     byte_AC23, 0FFh
                mov     byte_AC22, 60h ; '`'

loc_ABB6:
                mov     boss_hp, bx
                mov     byte ptr ds:soundFX_request, 60
                jmp     word ptr cs:Draw_Boss_Health_proc
sub_AB88        endp

; ---------------------------------------------------------------------------

loc_ABC4:
                mov     al, byte_AC20
                cmp     al, 28h ; '('
                jnb     short loc_ABF3
                test    byte_AC20, 7
                jnz     short loc_ABD7
                mov     byte ptr ds:soundFX_request, 35

loc_ABD7:
                mov     byte ptr ds:sprite_flash_flag, 0FFh
                inc     byte_AC20
                cmp     al, 14h
                jb      short loc_ABE7
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_ABE7:
                shr     al, 1
                mov     bx, offset unk_ABF9
                xlat
                mov     byte_AC1B, al
                jmp     sub_A6BC
; ---------------------------------------------------------------------------

loc_ABF3:
                mov     byte ptr ds:boss_is_dead, 0FFh
                retn
; ---------------------------------------------------------------------------
unk_ABF9        db    8
                db    8
                db    8
                db  0Ch
                db  0Ch
                db  0Ch
                db  0Dh
                db  0Dh
                db  0Bh
                db  0Bh
boss_state_block:
boss_x          dw 48
boss_y          db 9
boss_hp         dw 800
xp_reward       dw 10000
arena_center_x  db 12
boss_placement  db 0
                dw offset unk_AC10
almas_reward    dw 0
unk_AC10        db  11h
                db 0BBh
                db    2
aJashiin        db 7,'Jashiin'
byte_AC1B       db 0
byte_AC1C       db 0
byte_AC1D       db 0
byte_AC1E       db 0
byte_AC1F       db 0
byte_AC20       db 0
byte_AC21       db 0
byte_AC22       db 0
byte_AC23       db 0
byte_AC24       db 0
byte_AC25       db 0
word_AC26       dw 0
byte_AC28       db 0
byte_AC29       db 0
byte_AC2A       db 0
byte_AC2B       db 0
byte_AC2C       db 0
byte_AC2D       db 0
byte_AC2E       db 0
byte_AC2F       db 0
byte_AC30       db 0
byte_AC31       db 0
byte_AC32       db 0
byte_AC33       db 0
byte_AC34       db 0
byte_AC35       db 0
byte_AC36       db 0
byte_AC37       db 0
byte_AC38       db 0
unk_AC39        db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_AC41       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_AC4A       db 0
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
byte_AC65       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_AC6E       db 0

mao2          ends

                end start
