include common.inc
include dungeon.inc
                .286
                .model small

drgn          segment byte public 'CODE'
                assume cs:drgn, ds:drgn
                org 0A000h
start:
                dw offset Drgn_AI_proc
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
                db 28h, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 28h, 28h, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                ; A030
                dw offset byte_A044  ; 0..7
                dw offset byte_A06C  ; 8..23
                dw offset byte_A0BC  ; 24..38
                dw offset byte_A107  ; 39..53
                dw offset byte_A152  ; 54..65
                dw offset byte_A18E  ; 66..81
                dw offset byte_A1DE  ; 82..94
                dw offset byte_A21F  ; 95..102
                dw offset byte_A247  ; 103..118
                dw offset byte_A297  ; 119..132
byte_A044       db 0, 66h, 0, 67h, 6Ch     ; 0
                db 0, 68h, 69h, 6Dh, 6Eh
                db 0, 6Ch, 6Dh, 72h, 73h
                db 0, 83h, 84h, 0, 86h
                db 0, 95h, 0B1h, 98h, 99h
                db 0, 9Ah, 9Bh, 9Dh, 9Eh
                db 0, 68h, 90h, 6Dh, 91h
                db 0, 9Ah, 9Bh, 9Dh, 0FEh  ; 7
byte_A06C       db 0, 73h, 74h, 0, 0       ; 8
                db 0, 6Ah, 6Bh, 6Fh, 70h
                db 0, 70h, 71h, 75h, 76h
                db 0, 77h, 78h, 7Ah, 7Bh
                db 0, 78h, 79h, 7Bh, 7Ch
                db 0, 7Dh, 7Eh, 77h, 10h
                db 0, 7Fh, 1, 0Ch, 0Dh
                db 0, 77h, 10h, 0, 0Eh
                db 0, 97h, 0, 70h, 71h
                db 0, 0B3h, 75h, 0, 77h
                db 0, 76h, 0, 78h, 79h
                db 0, 0A6h, 9Fh, 87h, 0A1h
                db 0, 99h, 87h, 0B3h, 88h
                db 0, 0A1h, 0A3h, 8Ch, 89h
                db 0, 8Ah, 0, 0ADh, 8Dh
                db 0, 0ADh, 8Dh, 8Bh, 10h  ; 23
byte_A0BC       db 0, 8Dh, 8Fh, 10h, 7Eh   ; 24
                db 0, 0A6h, 1, 0Ch, 0Dh
                db 0, 8Eh, 10h, 67h, 0Eh
                db 0, 6Eh, 6Fh, 73h, 0A7h
                db 0, 6Ah, 6Bh, 6Fh, 0A0h
                db 0, 0A0h, 0A1h, 0A8h, 0A9h
                db 0, 9Fh, 9Fh, 0A1h, 0A2h
                db 0, 0A2h, 0A3h, 0AAh, 0ABh
                db 0, 0A4h, 0A5h, 0ACh, 0ADh
                db 0, 0ACh, 0ADh, 67h, 0Eh
                db 0, 6Eh, 6Fh, 85h, 0A7h
                db 0, 80h, 82h, 81h, 0AEh
                db 0, 0B4h, 0D3h, 0C4h, 94h
                db 0, 0D3h, 0, 94h, 9Ch
                db 0, 85h, 74h, 0, 0        ; 38
byte_A107       db 0, 0, 0DFh, 0E8h, 0E9h   ; 39
                db 0, 0E0h, 0E1h, 0EAh, 0EAh
                db 0, 0E2h, 0E2h, 0EAh, 0EBh
                db 0, 0E3h, 0E4h, 0, 0
                db 0, 0E4h, 0E5h, 0, 0
                db 0, 0, 0E7h, 0ECh, 0EDh
                db 0, 0, 0F5h, 0F9h, 0FAh
                db 0, 0EDh, 0EEh, 0F6h, 0F7h
                db 0, 0EFh, 0F0h, 0F8h, 0EAh
                db 0, 0F1h, 0F2h, 0EAh, 0EBh
                db 0, 0F3h, 0F4h, 0, 0
                db 0, 0, 0, 0F4h, 0
                db 0, 0FBh, 0FCh, 0B2h, 96h
                db 0, 0FDh, 0FDh, 0EAh, 0EAh
                db 0, 0FDh, 0F3h, 0E6h, 0A6h ; 53
byte_A152       db 0, 0, 92h, 0F9h, 0FAh     ; 54
                db 0, 93h, 0BBh, 0BAh, 0BFh
                db 0, 0, 0CCh, 0C8h, 0E9h
                db 0, 0CFh, 0CFh, 0EAh, 0EBh
                db 0, 0D0h, 0D1h, 0, 0
                db 0, 0AFh, 0, 0, 0B0h
                db 0, 0BCh, 0C1h, 0B2h, 96h
                db 0, 0CAh, 0F1h, 0FDh, 0FDh
                db 0, 0F2h, 0F3h, 0FDh, 0F3h
                db 0, 0F3h, 0F4h, 0F3h, 0F4h
                db 0, 0FDh, 0FDh, 0EAh, 0EAh
                db 0, 0FDh, 0F3h, 0E6h, 0A6h ; 65
byte_A18E       db 0, 0, 0Eh, 20h, 21h       ; 66
                db 0, 0Fh, 10h, 22h, 23h
                db 0, 2, 3, 19h, 10h
                db 0, 4, 5, 1Ah, 1Bh
                db 0, 1Ch, 1Dh, 24h, 25h
                db 0, 1Eh, 1Fh, 26h, 27h
                db 0, 0Eh, 0Fh, 20h, 12h
                db 0, 0Fh, 10h, 12h, 3Ch
                db 0, 2, 3, 19h, 28h
                db 0, 4, 5, 29h, 2Ah
                db 0, 1Ch, 2Bh, 3Dh, 26h
                db 0, 2Ch, 11h, 27h, 31h
                db 0, 0Fh, 10h, 37h, 38h
                db 0, 2, 3, 32h, 33h
                db 0, 4, 5, 34h, 35h
                db 0, 36h, 2Ch, 26h, 27h    ; 81
byte_A1DE       db 0, 11h, 11h, 31h, 39h    ; 82
                db 0, 6, 7, 11h, 5Ch
                db 0, 11h, 42h, 3Bh, 48h
                db 0, 8, 9, 3Eh, 3Fh
                db 0, 43h, 44h, 49h, 4Ah
                db 0, 45h, 46h, 4Bh, 4Ch
                db 0, 47h, 16h, 4Dh, 4Eh
                db 0, 11h, 4Fh, 55h, 56h
                db 0, 54h, 16h, 5Bh, 4Eh
                db 0, 50h, 51h, 57h, 58h
                db 0, 52h, 53h, 59h, 5Ah
                db 0, 11h, 5Eh, 64h, 65h
                db 0, 8, 9, 5Dh, 3Fh        ; 94
byte_A21F       db 0, 5Fh, 60h, 2Dh, 2Eh    ; 95
                db 0, 61h, 62h, 2Fh, 30h
                db 0, 63h, 16h, 3Ah, 4Eh
                db 0, 0Ah, 0Bh, 40h, 41h
                db 0, 0, 0, 14h, 15h
                db 0, 6, 7, 11h, 11h
                db 0, 13h, 75h, 17h, 77h
                db 0, 17h, 77h, 18h, 7Ah    ; 102
byte_A247       db 1, 0, 0B6h, 0B7h, 0      ; 103
                db 1, 0, 0B5h, 0B6h, 0
                db 1, 0, 0B6h, 0B7h, 0
                db 1, 0, 0B7h, 0B8h, 0
                db 1, 0, 0B6h, 0B5h, 0
                db 1, 0B9h, 0B6h, 0B8h, 0
                db 1, 0BEh, 0B8h, 0B8h, 0C0h
                db 1, 0B8h, 0C0h, 0C5h, 0C6h
                db 1, 0, 0, 0C2h, 0C7h
                db 1, 0BDh, 0BEh, 0C5h, 0C3h
                db 1, 0, 0, 0BDh, 0C2h
                db 1, 0C9h, 0B7h, 0CBh, 0
                db 1, 0C9h, 0CDh, 0CDh, 0CEh
                db 1, 0, 0C9h, 0BEh, 0D2h
                db 1, 0, 0CDh, 0C2h, 0D2h
                db 1, 0CEh, 0, 0C2h, 0D4h   ; 118
byte_A297       db 1, 0, 0, 0D5h, 0D8h      ; 119
                db 1, 0, 0, 0D8h, 0D9h
                db 1, 0, 0, 0DAh, 0DCh
                db 1, 0, 0, 0DBh, 0DCh
                db 1, 0, 0, 0DBh, 0DEh
                db 1, 0, 0, 0D5h, 0D6h
                db 1, 0, 0, 0D6h, 0D6h
                db 1, 0, 0, 0D7h, 0D7h
                db 1, 0, 0, 0D6h, 0D7h
                db 1, 0, 0, 0D8h, 0D9h
                db 1, 0, 0, 0DAh, 0DBh
                db 1, 0, 0, 0DBh, 0DCh
                db 1, 0, 0, 0DCh, 0DBh
                db 1, 0, 0, 0DDh, 0DEh     ; 132

; =============== S U B R O U T I N E =======================================


Drgn_AI_proc        proc near
                mov     si, ds:monsters_table_addr
                mov     byte_AA59, 0
                mov     byte_AA5A, 0

loc_A2EB:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A336
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A32D
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AA59
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte ptr [si+5], 40h
                jz      short loc_A32D
                test    byte_AA5A, 80h
                jnz     short loc_A32D
                mov     al, [si+5]
                and     al, 1Fh
                test    byte ptr [si+4], 1Fh
                jnz     short loc_A32A
                or      al, 80h

loc_A32A:
                mov     byte_AA5A, al

loc_A32D:
                inc     byte_AA59
                add     si, 10h
                jmp     short loc_A2EB
; ---------------------------------------------------------------------------

loc_A336:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                test    byte_AA5A, 0FFh
                jz      short loc_A3BA
                mov     al, byte_AA5A
                push    ax
                and     al, 1Fh
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                xor     bh, bh
                pop     ax
                mov     ah, al
                and     ah, 7Fh
                shr     bx, 1
                sub     ah, 2
                jb      short loc_A365
                shr     bx, 1
                shr     bx, 1

loc_A365:
                test    al, 80h
                jz      short loc_A377
                mov     byte_AA65, 0FFh
                mov     byte ptr ds:soundFX_request, 34h ; '4'
                add     bx, bx
                jmp     short loc_A381
; ---------------------------------------------------------------------------

loc_A377:
                mov     byte_AA5F, 0FFh
                mov     byte ptr ds:soundFX_request, 35h ; '5'

loc_A381:
                call    sub_A9B4
                test    byte_AA65, 0FFh
                jz      short loc_A3B5
                mov     al, byte_AA5B
                cmp     al, 6
                sbb     al, al
                neg     al
                mov     byte_AA66, al
                mov     byte_AA67, 0
                mov     byte_AA56, 0
                mov     byte_AA61, 0
                mov     byte_AA5F, 0FFh
                mov     byte_AA68, 0FFh
                mov     byte_AA60, 8

loc_A3B5:
                mov     byte_AA65, 0

loc_A3BA:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A3C4
                jmp     loc_A9F2
; ---------------------------------------------------------------------------

loc_A3C4:
                inc     byte_AA5C
                test    byte_AA56, 0FFh
                jz      short loc_A3D2
                jmp     loc_A4FC
; ---------------------------------------------------------------------------

loc_A3D2:
                test    byte_AA61, 0FFh
                jz      short loc_A3DC
                jmp     loc_A4C2
; ---------------------------------------------------------------------------

loc_A3DC:
                add     byte_AA5E, 80h
                jnb     short loc_A410
                test    byte_AA5F, 0FFh
                jnz     short loc_A3F5
                call    sub_A521
                jb      short loc_A410
                inc     byte_AA5D
                jmp     short loc_A410
; ---------------------------------------------------------------------------

loc_A3F5:
                dec     byte_AA60
                jnz     short loc_A402
                mov     byte_AA5F, 0
                jmp     short loc_A410
; ---------------------------------------------------------------------------

loc_A402:
                call    sub_A532
                sbb     al, al
                not     al
                mov     byte_AA5F, al
                dec     byte_AA5D

loc_A410:
                test    byte_AA68, 0FFh
                jnz     short loc_A48E
                call    word ptr cs:get_random_proc
                and     al, 0C0h
                jnz     short loc_A448
                test    byte_AA5B, 0FFh
                jz      short loc_A435
                cmp     byte_AA5B, 4
                jz      short loc_A435
                cmp     byte_AA5B, 7
                jnz     short loc_A448

loc_A435:
                mov     al, byte_AA5B
                mov     byte_AA62, al
                mov     byte_AA63, 0
                mov     byte_AA61, 0FFh
                jmp     loc_A542
; ---------------------------------------------------------------------------

loc_A448:
                mov     al, ds:80h
                add     al, 10h
                cmp     al, byte ptr boss_x
                jnb     short loc_A464
                mov     al, 6
                cmp     byte_AA5B, 6
                jb      short loc_A45E
                mov     al, 7

loc_A45E:
                mov     byte_AA5B, al
                jmp     loc_A542
; ---------------------------------------------------------------------------

loc_A464:
                sub     al, 5
                cmp     al, byte ptr boss_x
                jnb     short loc_A47D
                mov     al, 0
                cmp     byte_AA5B, 7
                jb      short loc_A477
                mov     al, 6

loc_A477:
                mov     byte_AA5B, al
                jmp     loc_A542
; ---------------------------------------------------------------------------

loc_A47D:
                mov     al, 4
                cmp     byte_AA5B, 7
                jb      short loc_A488
                mov     al, 6

loc_A488:
                mov     byte_AA5B, al
                jmp     loc_A542
; ---------------------------------------------------------------------------

loc_A48E:
                mov     bx, offset unk_A4B4
                test    byte_AA66, 0FFh
                jnz     short loc_A49B
                mov     bx, offset unk_A4BB

loc_A49B:
                mov     al, byte_AA67
                xlat
                or      al, al
                jns     short loc_A4AA
                and     al, 7Fh
                mov     byte_AA68, 0

loc_A4AA:
                mov     byte_AA5B, al
                inc     byte_AA67
                jmp     loc_A542
; ---------------------------------------------------------------------------
unk_A4B4        db  0Ah
                db    9
                db    6
                db    3
                db    2
                db    3
                db  82h
unk_A4BB        db    3
                db    2
                db    3
                db    2
                db    1
                db    3
                db  82h
; ---------------------------------------------------------------------------

loc_A4C2:
                inc     byte_AA63
                mov     al, byte_AA63
                and     al, 1
                add     al, byte_AA62
                mov     byte_AA5B, al
                mov     al, byte_AA63
                cmp     al, 6
                jb      short loc_A542
                mov     al, byte_AA62
                inc     al
                mov     byte_AA5B, al
                mov     byte_AA57, 0
                mov     byte_AA64, 0
                mov     byte_AA61, 0
                mov     byte_AA56, 0FFh
                mov     byte ptr ds:soundFX_request, 54
                jmp     short loc_A542
; ---------------------------------------------------------------------------

loc_A4FC:
                mov     byte ptr ds:soundFX_request, 54
                mov     al, byte_AA57
                inc     al
                cmp     al, 4
                jb      short loc_A50C
                mov     al, 2

loc_A50C:
                mov     byte_AA57, al
                inc     byte_AA64
                mov     al, byte_AA64
                cmp     al, 0Ah
                jb      short loc_A542
                mov     byte_AA56, 0
                jmp     short loc_A542
Drgn_AI_proc        endp


; =============== S U B R O U T I N E =======================================


sub_A521        proc near
                mov     ax, boss_x
                dec     ax
                mov     bx, 0Eh
                sub     bx, ax
                cmc
                jnb     short loc_A52E
                retn
; ---------------------------------------------------------------------------

loc_A52E:
                mov     boss_x, ax
                retn
sub_A521        endp


; =============== S U B R O U T I N E =======================================


sub_A532        proc near
                mov     ax, boss_x
                inc     ax
                mov     bx, 1Eh
                sub     bx, ax
                jnb     short loc_A53E
                retn
; ---------------------------------------------------------------------------

loc_A53E:
                mov     boss_x, ax
                retn
sub_A532        endp

; ---------------------------------------------------------------------------

loc_A542:
                push    cs
                pop     es
                assume es:nothing
                mov     di, offset unk_AA69
                mov     ax, 0FFFFh
                mov     cx, 0A0h
                rep stosw
                mov     byte_AA53, 0
                mov     byte_AA54, 1
                mov     bl, byte_AA5B
                add     bl, bl
                xor     bh, bh
                mov     si, off_A783[bx]
                mov     bp, off_A810[bx]
                mov     cx, 0Ch
                call    sub_A758
                mov     byte_AA53, 0Ch
                mov     byte_AA54, 0
                mov     bl, byte_AA5C
                and     bl, 1
                add     bl, bl
                mov     si, off_A8DE[bx]
                mov     bp, off_A8FD[bx]
                mov     cx, 0Bh
                call    sub_A758
                mov     byte_AA53, 9
                mov     byte_AA54, 6
                mov     bl, byte_AA5D
                and     bl, 3
                add     bl, bl
                mov     si, off_A881[bx]
                mov     bp, off_A89A[bx]
                mov     cx, 7
                call    sub_A758
                mov     byte_AA53, 11h
                mov     byte_AA54, 6
                mov     bl, byte_AA5D
                and     bl, 3
                add     bl, bl
                mov     si, off_A8B7[bx]
                mov     bp, offset byte_A8D7
                mov     cx, 7
                call    sub_A758
                mov     byte_AA53, 19h
                mov     byte_AA54, 8
                mov     si, offset unk_A87A
                mov     bp, offset unk_A87D
                mov     cx, 4
                call    sub_A758
                mov     byte_AA59, 0
                mov     ax, boss_x
                mov     si, ds:monsters_table_addr
                mov     di, offset unk_AA69
                mov     cx, 1Dh

loc_A5F9:
                push    cx
                push    di
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_AA55, bl
                jb      short loc_A67A
                xor     cl, cl

loc_A60A:
                push    cx
                push    ax
                cmp     byte ptr [di], 0FFh
                jz      short loc_A670
                mov     [si], ax
                mov     al, boss_y
                add     al, cl
                and     al, 3Fh
                mov     [si+2], al
                mov     al, byte_AA55
                mov     [si+3], al
                mov     al, [di]
                mov     ah, al
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                mov     bl, ds:boss_being_hit
                not     bl
                and     bl, 80h
                or      al, bl
                mov     [si+4], al
                mov     [si+6], ah
                mov     byte ptr [si+5], 0
                test    byte_AA5A, 0FFh
                jz      short loc_A64F
                or      byte ptr [si+5], 20h

loc_A64F:
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AA59
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                inc     byte_AA59
                pop     di

loc_A670:
                inc     di
                pop     ax
                pop     cx
                inc     cl
                cmp     cl, 0Ah
                jnz     short loc_A60A

loc_A67A:
                inc     ax
                pop     di
                add     di, 0Ah
                pop     cx
                loop    loc_A684
                jmp     short loc_A687
; ---------------------------------------------------------------------------

loc_A684:
                jmp     loc_A5F9
; ---------------------------------------------------------------------------

loc_A687:
                mov     word ptr [si], 0FFFFh
                test    byte_AA56, 0FFh
                jnz     short loc_A693
                retn
; ---------------------------------------------------------------------------

loc_A693:
                mov     di, offset off_A917
                mov     bp, offset off_A930
                cmp     byte_AA5B, 6
                jb      short loc_A6A6
                mov     di, offset off_A96C
                mov     bp, offset off_A985

loc_A6A6:
                mov     bl, byte_AA57
                and     bl, 3
                add     bl, bl
                xor     bh, bh
                mov     di, [bx+di]
                push    di
                mov     di, bp
                mov     bp, [bx+di]
                pop     di
                mov     ax, boss_x
                sub     ax, 0Ah
                cmp     byte_AA5B, 5
                jnz     short loc_A6C9
                add     ax, 4

loc_A6C9:
                mov     cx, 0Dh

loc_A6CC:
                push    cx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_AA55, bl
                jnb     short loc_A6E8
                mov     cx, 8

loc_A6DD:
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A6E4
                inc     di

loc_A6E4:
                loop    loc_A6DD
                jmp     short loc_A749
; ---------------------------------------------------------------------------

loc_A6E8:
                xor     cl, cl

loc_A6EA:
                push    cx
                push    ax
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A740
                mov     [si], ax
                mov     al, boss_y
                add     al, cl
                add     al, 4
                and     al, 3Fh
                mov     [si+2], al
                mov     al, byte_AA55
                mov     [si+3], al
                mov     al, [di]
                mov     ah, al
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                or      al, 20h
                mov     [si+4], al
                mov     [si+6], ah
                mov     byte ptr [si+5], 0
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_AA59
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                inc     byte_AA59
                pop     di
                inc     di

loc_A740:
                pop     ax
                pop     cx
                inc     cl
                cmp     cl, 8
                jnz     short loc_A6EA

loc_A749:
                inc     ax
                inc     bp
                pop     cx
                loop    loc_A750
                jmp     short loc_A753
; ---------------------------------------------------------------------------

loc_A750:
                jmp     loc_A6CC
; ---------------------------------------------------------------------------

loc_A753:
                mov     word ptr [si], 0FFFFh
                retn

; =============== S U B R O U T I N E =======================================


sub_A758        proc near
                mov     al, byte_AA53
                mov     bl, 0Ah
                mul     bl
                mov     bl, byte_AA54
                xor     bh, bh
                add     ax, bx
                add     ax, offset unk_AA69
                mov     di, ax

loc_A76C:
                push    cx
                mov     cx, 8

loc_A770:
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A779
                lodsb
                mov     [di], al

loc_A779:
                inc     di
                loop    loc_A770
                inc     di
                inc     di
                inc     bp
                pop     cx
                loop    loc_A76C
                retn
sub_A758        endp

; ---------------------------------------------------------------------------
off_A783        dw offset byte_A799
                dw offset byte_A7AF
                dw offset byte_A7A4
                dw offset byte_A7BA
                dw offset byte_A7C5
                dw offset byte_A7CF
                dw offset byte_A7DA
                dw offset byte_A7E4
                dw offset byte_A7FA
                dw offset byte_A7EF
                dw offset byte_A805
byte_A799       db 0, 2, 1, 10h, 11h, 12h, 13h, 14h, 15h, 17h, 16h
byte_A7A4       db 0, 2, 6, 10h, 11h, 12h, 13h, 14h, 15h, 17h, 16h
byte_A7AF       db 0, 3, 1, 2Eh, 11h, 12h, 13h, 14h, 15h, 17h, 16h
byte_A7BA       db 0, 3, 6, 2Eh, 11h, 12h, 13h, 14h, 15h, 17h, 16h
byte_A7C5       db 5, 4, 19h, 18h, 13h, 1Ah, 14h, 15h, 17h, 16h
byte_A7CF       db 7, 4, 76h, 77h, 18h, 13h, 1Ah, 14h, 15h, 17h, 16h
byte_A7DA       db 5, 4, 1Ch, 1Bh, 1Dh, 1Eh, 1Fh, 20h, 22h, 16h
byte_A7E4       db 0, 2, 1, 23h, 24h, 25h, 26h, 27h, 28h, 29h, 21h
byte_A7EF       db 0, 2, 6, 23h, 24h, 25h, 26h, 27h, 28h, 29h, 21h
byte_A7FA       db 0, 3, 1, 2Ah, 24h, 25h, 26h, 27h, 28h, 29h, 21h
byte_A805       db 0, 3, 6, 2Ah, 24h, 25h, 26h, 27h, 28h, 29h, 21h
off_A810        dw offset byte_A826
                dw offset byte_A832
                dw offset byte_A826
                dw offset byte_A832
                dw offset byte_A83E
                dw offset byte_A84A
                dw offset byte_A856
                dw offset byte_A862
                dw offset byte_A86E
                dw offset byte_A862
                dw offset byte_A86E
byte_A826       db 0, 0, 0, 80h, 40h, 80h, 20h, 80h, 50h, 16h, 0, 4
byte_A832       db 0, 0, 0, 80h, 20h, 80h, 20h, 80h, 50h, 16h, 0, 4
byte_A83E       db 0, 0, 0, 0, 0, 20h, 80h, 20h, 90h, 36h, 0, 4
byte_A84A       db 0, 0, 0, 0, 0, 20h, 80h, 30h, 90h, 36h, 0, 4
byte_A856       db 0, 0, 8, 20h, 10h, 20h, 10h, 0, 18h, 0Ah, 0, 4
byte_A862       db 8, 4, 8, 4, 8, 4, 8, 4, 0, 6, 0, 4
byte_A86E       db 8, 2, 8, 4, 8, 4, 8, 4, 0, 6, 0, 4
unk_A87A        db  2Bh ; +
                db  2Ch ; ,
                db  2Dh ; -
unk_A87D        db  80h
                db    0
                db  80h
                db  80h
off_A881        dw offset byte_A889
                dw offset byte_A88F
                dw offset byte_A895
                dw offset byte_A88F
byte_A889       db 50h, 51h, 52h, 54h, 53h, 55h
byte_A88F       db 56h, 57h, 58h, 5Ah, 59h, 5Bh
byte_A895       db 5Ch, 5Dh, 5Fh, 5Eh, 60h
off_A89A        dw offset byte_A8A2
                dw offset byte_A8A9
                dw offset byte_A8B0
                dw offset byte_A8A9
byte_A8A2       db 20h, 0, 20h, 0, 0A0h, 0, 0A0h
byte_A8A9       db 0, 20h, 20h, 0, 0A0h, 0, 0A0h
byte_A8B0       db 0, 0, 20h, 0, 0A0h, 0, 0A0h
off_A8B7        dw offset byte_A8BF
                dw offset byte_A8C7
                dw offset byte_A8CF
                dw offset byte_A8C7
byte_A8BF       db 75h, 62h, 63h, 64h, 73h, 65h, 74h, 66h
byte_A8C7       db 75h, 67h, 63h, 69h, 73h, 6Ah, 74h, 68h
byte_A8CF       db 61h, 6Bh, 6Ch, 70h, 73h, 71h, 74h, 72h
byte_A8D7       db 0A0h, 0, 0A0h, 0, 0A0h, 0, 0A0h
off_A8DE        dw offset byte_A8E2
                dw offset byte_A8F1
byte_A8E2       db 36h, 35h, 37h, 3Ch, 30h, 38h, 3Dh, 31h, 39h, 3Eh, 32h, 3Ah, 3Bh, 33h, 34h
byte_A8F1       db 40h, 41h, 46h, 42h, 47h, 4Ah, 43h, 48h, 4Bh, 49h, 44h, 45h
off_A8FD        dw offset byte_A901
                dw offset byte_A90C
byte_A901       db 10h, 40h, 28h, 80h, 28h, 80h, 28h, 80h, 30h, 80h, 80h
byte_A90C       db 10h, 0, 28h, 0, 58h, 0, 58h, 10h, 40h, 0, 40h
off_A917        dw offset unk_A91F
                dw offset byte_A920
                dw offset byte_A923
                dw offset byte_A92A
unk_A91F        db  80h
byte_A920       db 83h, 82h, 81h
byte_A923       db 8Ah, 89h, 86h, 87h, 85h, 88h, 84h
byte_A92A       db 8Dh, 8Eh, 8Ch, 8Fh, 8Bh, 81h
off_A930        dw offset byte_A938
                dw offset byte_A945
                dw offset byte_A952
                dw offset byte_A95F
byte_A938       db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 80h
byte_A945       db 0, 0, 0, 0, 0, 0, 0, 0, 0, 10h, 0, 40h, 80h
byte_A952       db 0, 0, 0, 0, 0, 8, 0, 8, 0, 18h, 20h, 8, 80h
byte_A95F       db 0, 0, 0, 0, 0, 8, 0, 8, 10h, 8, 20h, 0, 80h
off_A96C        dw offset byte_A974
                dw offset byte_A976
                dw offset byte_A979
                dw offset byte_A97F
byte_A974       db 90h, 91h
byte_A976       db 92h, 93h, 94h
byte_A979       db 95h, 96h, 97h, 98h, 96h, 99h
byte_A97F       db 9Ah, 9Bh, 9Bh, 9Ch, 9Bh, 9Dh
off_A985        dw offset byte_A98D
                dw offset byte_A99A
                dw offset byte_A9A7
                dw offset byte_A9A7
byte_A98D       db 0, 0, 0, 0, 0, 0, 0, 0, 20h, 20h, 0, 0, 0
byte_A99A       db 0, 0, 0, 0, 0, 20h, 0, 20h, 0, 20h, 0, 0, 0
byte_A9A7       db 20h, 20h, 0, 20h, 0, 20h, 0, 20h, 0, 20h, 0, 0, 0

; =============== S U B R O U T I N E =======================================


sub_A9B4        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_A9BD
                xor     ax, ax

loc_A9BD:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_A9CE
                retn
; ---------------------------------------------------------------------------

loc_A9CE:
                mov     byte_AA58, 0
                mov     byte ptr ds:boss_being_hit, 0FFh
                mov     byte_AA58, 0
                mov     byte_AA65, 0
                mov     byte_AA67, 0
                mov     byte_AA56, 0
                mov     byte_AA61, 0
                retn
sub_A9B4        endp

; ---------------------------------------------------------------------------

loc_A9F2:
                cmp     byte_AA58, 28h ; '('
                jnb     short loc_AA36
                mov     byte ptr ds:sprite_flash_flag, 0FFh
                inc     byte_AA58
                cmp     byte_AA58, 1Eh
                jnb     short loc_AA29
                inc     byte_AA5C
                mov     al, byte_AA5C
                and     al, 1
                add     al, 2
                mov     byte_AA5B, al
                mov     al, byte_AA5C
                and     al, 3
                jz      short loc_AA21
                jmp     loc_A542
; ---------------------------------------------------------------------------

loc_AA21:
                mov     byte ptr ds:soundFX_request, 55
                jmp     loc_A542
; ---------------------------------------------------------------------------

loc_AA29:
                mov     byte_AA5C, 1
                mov     byte_AA5B, 0Ah
                jmp     loc_A542
; ---------------------------------------------------------------------------

loc_AA36:
                mov     byte ptr ds:boss_is_dead, 0FFh
                retn
; ---------------------------------------------------------------------------
boss_state_block:
boss_x          dw 30
boss_y          db 8
boss_hp         dw 800
xp_reward       dw 12000
arena_center_x  db    5
boss_placement  db    0
                dw offset name_screen_x
almas_reward    dw 2500
name_screen_x   db  11h
name_screen_y   db 0BBh
                db    0
aDragon         db 6,'Dragon'
byte_AA53       db 0
byte_AA54       db 0
byte_AA55       db 0
byte_AA56       db 0
byte_AA57       db 0
byte_AA58       db 0
byte_AA59       db 0
byte_AA5A       db 0
byte_AA5B       db 0
byte_AA5C       db 0
byte_AA5D       db 0
byte_AA5E       db 0
byte_AA5F       db 0
byte_AA60       db 0
byte_AA61       db 0
byte_AA62       db 0
byte_AA63       db 0
byte_AA64       db 0
byte_AA65       db 0
byte_AA66       db 0
byte_AA67       db 0
byte_AA68       db 0
unk_AA69        db    0
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

drgn          ends

                end start