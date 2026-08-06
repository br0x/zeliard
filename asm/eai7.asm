include common.inc
include dungeon.inc
                .286
                .model small

eai7          segment byte public 'CODE'
                assume cs:eai7, ds:eai7
                org 0A000h
start:
                dw offset Monster_AI
                db    0
                db    0
                db    0
                db    0
                dw offset death_descriptors
monster_xp      db 80, 80, 200, 200, 50, 0, 0, 0
monster_damage  db 80, 80, 80, 80, 40, 0, 0, 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0                 ;
                                        ; A030
                dw offset byte_A0B0
                dw offset byte_A10F
                dw offset byte_A16E
                dw offset byte_A1CD
                dw offset byte_A22C
                dw 0
                dw 0
                dw 0
                dw offset byte_A100
                dw offset byte_A15F
                dw offset byte_A1BE
                dw offset byte_A21D
                dw offset byte_A254
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw offset byte_A263
                dw offset byte_A2AE
                dw offset byte_A272
                dw offset byte_A286
                dw offset byte_A2CC
                dw 0
                dw offset byte_A2D1
                dw offset byte_A2D6
                dw 0
                dw offset byte_A29A
                dw 0
                dw 0
                dw 0
                dw 0                    ;
                                        ; A070
                dw offset byte_A0D8
                dw offset byte_A137
                dw offset byte_A196
                dw offset byte_A1F5
                dw offset byte_A240
                dw 0
                dw 0
                dw 0
                dw offset byte_A100
                dw offset byte_A15F
                dw offset byte_A1BE
                dw offset byte_A21D
                dw offset byte_A254
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw offset byte_A263
                dw offset byte_A2AE
                dw offset byte_A272
                dw offset byte_A286
                dw offset byte_A2CC
                dw 0
                dw offset byte_A2D1
                dw offset byte_A2D6
                dw 0
                dw offset byte_A29A
                dw 0
                dw 0
                dw 0
                dw 0
byte_A0B0       db 0, 0B0h, 0B1h, 0B2h, 0B3h
                db 0, 0B8h, 0B9h, 0BAh, 0BBh
                db 0, 0B0h, 0B1h, 0C0h, 0B3h
                db 0, 0B8h, 0B9h, 0BAh, 0BBh
                db 0, 0B0h, 0B1h, 0B2h, 0B3h
                db 0, 0B0h, 0B1h, 0B2h, 0B3h
                db 0, 0D1h, 0D2h, 0D3h, 0D4h
                db 0, 0D1h, 0D2h, 0D3h, 0D4h
byte_A0D8       db 0, 0D7h, 0D8h, 0D9h, 11h
                db 0, 26h, 27h, 28h, 35h
                db 0, 0D7h, 0D8h, 0D9h, 58h
                db 0, 26h, 27h, 28h, 35h
                db 0, 0D7h, 0D8h, 81h, 82h
                db 0, 0D7h, 0D8h, 81h, 82h
                db 0, 97h, 98h, 99h, 9Ah
                db 0, 97h, 98h, 99h, 9Ah
byte_A100       db 0, 7Fh, 80h, 0A9h, 0CDh
                db 0, 0, 0, 0CBh, 0CCh
                db 0, 0, 0, 0, 0
byte_A10F       db 0, 0B4h, 0B5h, 0B6h, 0B7h
                db 0, 0BCh, 0BDh, 0BEh, 0BFh
                db 0, 0C1h, 0C2h, 0C3h, 0C4h
                db 0, 0BCh, 0BDh, 0BEh, 0BFh
                db 0, 0C7h, 0C8h, 0C9h, 0CAh
                db 0, 0C7h, 0C8h, 0C9h, 0CAh
                db 0, 0D5h, 0D6h, 0C9h, 0CAh
                db 0, 0D5h, 0D6h, 0C9h, 0CAh
byte_A137       db 0, 12h, 13h, 14h, 25h
                db 0, 3Ch, 43h, 4Ah, 51h
                db 0, 5Fh, 66h, 7Dh, 7Eh
                db 0, 3Ch, 43h, 4Ah, 51h
                db 0, 83h, 94h, 95h, 96h
                db 0, 83h, 94h, 95h, 96h
                db 0, 9Bh, 0AFh, 95h, 96h
                db 0, 9Bh, 0AFh, 95h, 96h
byte_A15F       db 0, 0CEh, 0C5h, 0C6h, 0
                db 0, 0CDh, 0C5h, 0CEh, 0
                db 0, 0CFh, 0D0h, 0DAh, 0DBh
byte_A16E       db 1, 0, 0, 36h, 37h
                db 1, 0, 0, 3Dh, 3Eh
                db 1, 0, 0, 44h, 45h
                db 1, 0, 0, 4Bh, 4Ch
                db 1, 6Dh, 0, 6Fh, 70h
                db 1, 6Dh, 0, 6Fh, 70h
                db 1, 75h, 76h, 77h, 78h
                db 1, 75h, 76h, 77h, 78h
byte_A196       db 1, 0, 0, 52h, 53h
                db 1, 0, 0, 59h, 5Ah
                db 1, 0, 0, 60h, 61h
                db 1, 0, 0, 67h, 68h
                db 1, 0, 85h, 86h, 87h
                db 1, 0, 85h, 86h, 87h
                db 1, 8Ch, 8Dh, 8Eh, 8Fh
                db 1, 8Ch, 8Dh, 8Eh, 8Fh
byte_A1BE       db 1, 0, 9Ch, 9Dh, 9Eh
                db 1, 0A3h, 0A4h, 0A5h, 0A6h
                db 1, 0AAh, 0ABh, 0ACh, 0
byte_A1CD       db 1, 38h, 39h, 3Ah, 3Bh
                db 1, 3Fh, 40h, 41h, 42h
                db 1, 46h, 47h, 48h, 49h
                db 1, 4Dh, 4Eh, 4Fh, 50h
                db 1, 71h, 72h, 73h, 74h
                db 1, 71h, 72h, 73h, 74h
                db 1, 79h, 7Ah, 7Bh, 7Ch
                db 1, 79h, 7Ah, 7Bh, 7Ch
byte_A1F5       db 1, 54h, 55h, 56h, 57h
                db 1, 5Bh, 5Ch, 5Dh, 5Eh
                db 1, 62h, 63h, 64h, 65h
                db 1, 69h, 6Ah, 6Bh, 6Ch
                db 1, 88h, 89h, 8Ah, 8Bh
                db 1, 88h, 89h, 8Ah, 8Bh
                db 1, 90h, 91h, 92h, 93h
                db 1, 90h, 91h, 92h, 93h
byte_A21D       db 1, 9Fh, 0A0h, 0A1h, 0A2h
                db 1, 0A7h, 0A8h, 0, 0
                db 1, 0, 0, 0, 0
byte_A22C       db 2, 1, 2, 3, 4
                db 2, 5, 6, 7, 8
                db 2, 9, 0Ah, 0Bh, 0Ch
                db 2, 0Dh, 0Eh, 0Fh, 10h
byte_A240       db 2, 15h, 16h, 17h, 18h
                db 2, 19h, 1Ah, 1Bh, 1Ch
                db 2, 1Dh, 1Eh, 1Fh, 20h
                db 2, 21h, 22h, 23h, 24h
byte_A254       db 2, 29h, 2Ah, 2Bh, 2Ch
                db 2, 2Dh, 2Eh, 2Fh, 30h
                db 2, 31h, 32h, 33h, 34h
byte_A263       db 1, 0DCh, 0DDh, 0DEh, 0DFh
                db 1, 0E0h, 0E1h, 0E2h, 0E3h
                db 1, 0E4h, 0E5h, 0E6h, 0E7h
byte_A272       db 0, 0E8h, 0E9h, 0EAh, 0EBh
                db 0, 0ECh, 0EDh, 0EEh, 0EFh
                db 0, 0F0h, 0F1h, 0F2h, 0F3h
                db 0, 0ECh, 0EDh, 0EEh, 0EFh
byte_A286       db 2, 0E8h, 0E9h, 0EAh, 0EBh
                db 2, 0ECh, 0EDh, 0EEh, 0EFh
                db 2, 0F0h, 0F1h, 0F2h, 0F3h
                db 2, 0ECh, 0EDh, 0EEh, 0EFh
byte_A29A       db 1, 0E8h, 0E9h, 0EAh, 0EBh
                db 1, 0ECh, 0EDh, 0EEh, 0EFh
                db 1, 0F0h, 0F1h, 0F2h, 0F3h
                db 1, 0ECh, 0EDh, 0EEh, 0EFh
byte_A2AE       db 0, 0F4h, 0F5h, 0F6h, 0F7h
                db 0, 0F4h, 0F5h, 0F6h, 0F7h
                db 0, 0F4h, 0F5h, 0F6h, 0F7h
                db 0, 0F4h, 0F5h, 0F6h, 0F7h
                db 0, 0F4h, 0F5h, 0F6h, 0F7h
                db 0, 0F4h, 0F5h, 0F6h, 0F7h
byte_A2CC       db 1, 0F8h, 0F9h, 0FAh, 0FBh
byte_A2D1       db 0, 0FCh, 0FDh, 6Eh, 84h
byte_A2D6       db 2, 0FCh, 0FDh, 6Eh, 84h
death_descriptors dw offset byte_A2E5
                dw offset byte_A2E5
                dw offset byte_A2E9
                dw offset byte_A2E9
                dw offset byte_A2ED
byte_A2E5       db 11, 11, 11, 5
byte_A2E9       db 11, 11, 11, 5
byte_A2ED       db 11, 5, 5, 0

; =============== S U B R O U T I N E =======================================


Monster_AI      proc near
                mov     bl, [si+4]
                and     bl, 0Fh
                xor     bh, bh
                add     bx, bx          ; switch 5 cases
                jmp     jpt_A2FB[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A2FB        dw offset loc_A30A      ; jump table for switch statement
                dw offset locret_A309
                dw offset loc_A639
                dw offset locret_A638
                dw offset loc_A749
; ---------------------------------------------------------------------------

locret_A309:                            ; jumptable 0000A2FB case 1
                retn
; ---------------------------------------------------------------------------

loc_A30A:                               ; jumptable 0000A2FB case 0
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A314
                mov     byte ptr [si+8], 10h

loc_A314:
                test    byte ptr [si+5], 20h
                jz      short loc_A31D
                jmp     loc_A5F5
; ---------------------------------------------------------------------------

loc_A31D:
                test    byte ptr [si+15h], 40h
                jz      short loc_A326
                jmp     loc_A5F5
; ---------------------------------------------------------------------------

loc_A326:
                call    sub_A59D
                jb      short loc_A32C
                retn
; ---------------------------------------------------------------------------

loc_A32C:
                test    byte ptr [si+9], 1
                jz      short loc_A335
                jmp     loc_A41E
; ---------------------------------------------------------------------------

loc_A335:
                call    sub_A609
                jb      short loc_A376
                cmp     al, 0FFh
                jz      short loc_A342
                xor     byte ptr [si+5], 80h

loc_A342:
                add     byte ptr [si+6], 80h
                jb      short loc_A34B
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A34B:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                test    byte ptr [si+5], 80h
                jnz     short loc_A367
                call    sub_A518
                jb      short loc_A360
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A360:
                or      byte ptr [si+5], 80h
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A367:
                call    sub_A493
                jb      short loc_A36F
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A36F:
                and     byte ptr [si+5], 7Fh
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A376:
                and     byte ptr [si+5], 7Fh
                mov     al, 11h
                cmp     al, [si+3]
                jb      short loc_A385
                or      byte ptr [si+5], 80h

loc_A385:
                test    byte ptr [si+5], 80h
                jz      short loc_A3B4
                sub     al, [si+3]
                cmp     al, byte_A491
                jz      short loc_A3DF
                jb      short loc_A3A5
                call    sub_A493
                jb      short loc_A3DF
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A3A5:
                call    sub_A518
                jb      short loc_A40A
                dec     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A3B4:
                mov     ah, [si+3]
                sub     ah, al
                cmp     ah, byte_A492
                jz      short loc_A3DF
                jb      short loc_A3D0
                call    sub_A518
                jb      short loc_A3DF
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A3D0:
                call    sub_A493
                jb      short loc_A40A
                dec     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jmp     loc_A47A
; ---------------------------------------------------------------------------

loc_A3DF:
                call    word ptr cs:get_random_proc
                and     al, 3
                dec     al
                add     al, 8
                mov     byte_A491, al
                call    word ptr cs:get_random_proc
                and     al, 3
                sub     al, 2
                add     al, 9
                mov     byte_A492, al
                call    sub_A609
                jnb     short loc_A47A
                or      byte ptr [si+9], 1
                mov     byte ptr [si+6], 4
                jmp     short loc_A47A
; ---------------------------------------------------------------------------

loc_A40A:
                call    word ptr cs:get_random_proc
                and     al, 1
                jz      short loc_A414
                retn
; ---------------------------------------------------------------------------

loc_A414:
                or      byte ptr [si+9], 3
                mov     byte ptr [si+6], 4
                jmp     short loc_A47A
; ---------------------------------------------------------------------------

loc_A41E:
                inc     byte ptr [si+6]
                cmp     byte ptr [si+6], 6
                jz      short loc_A437
                cmp     byte ptr [si+6], 8
                jnz     short loc_A47A
                and     byte ptr [si+9], 0FCh
                mov     byte ptr [si+6], 0
                jmp     short loc_A47A
; ---------------------------------------------------------------------------

loc_A437:
                mov     al, [si+3]
                mov     byte_A46D, al
                inc     al
                mov     byte_A460, al
                mov     al, [si+2]
                inc     al
                mov     byte_A46E, al
                mov     byte_A461, al
                mov     bx, offset byte_A460
                test    byte ptr [si+5], 80h
                jnz     short loc_A459
                mov     bx, offset byte_A46D

loc_A459:
                call    word ptr cs:Add_Projectile_To_Array_proc
                jmp     short loc_A47A
; ---------------------------------------------------------------------------
byte_A460       db 0
byte_A461       db 0
                db  30h ; 0
                db    0
                db  14h
                db    0
                db  28h ; (
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A46D       db 0
byte_A46E       db 0
                db  2Fh ; /
                db    0
                db  14h
                db    4
                db  28h ; (
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
; ---------------------------------------------------------------------------

loc_A47A:
                mov     al, [si+6]
                mov     [si+16h], al
                mov     al, [si+5]
                and     al, 80h
                mov     ah, [si+15h]
                and     ah, 7Fh
                or      al, ah
                mov     [si+15h], al
                retn
Monster_AI      endp

; ---------------------------------------------------------------------------
byte_A491       db 8
byte_A492       db 8

; =============== S U B R O U T I N E =======================================


sub_A493        proc near
                cmp     byte ptr [si+3], 22h ; '"'
                cmc
                jnb     short loc_A49B
                retn
; ---------------------------------------------------------------------------

loc_A49B:
                call    sub_A4B9
                jnb     short loc_A4A1
                retn
; ---------------------------------------------------------------------------

loc_A4A1:
                mov     bx, [si]
                inc     bx
                mov     ax, ds:mapWidth
                sub     ax, bx
                jnz     short loc_A4AC
                xchg    ax, bx

loc_A4AC:
                mov     [si], bx
                mov     [si+10h], bx
                inc     byte ptr [si+3]
                inc     byte ptr [si+13h]
                clc
                retn
sub_A493        endp


; =============== S U B R O U T I N E =======================================


sub_A4B9        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                inc     di
                inc     di
                mov     cx, 4

loc_A4C6:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A4D1
                retn
; ---------------------------------------------------------------------------

loc_A4D1:
                xchg    si, di
                add     si, 36
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A4C6
                xchg    si, di
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                mov     al, [si]
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                xchg    si, di
                add     al, al
                retn
sub_A4B9        endp


; =============== S U B R O U T I N E =======================================


sub_A518        proc near
                cmp     byte ptr [si+3], 2
                jnb     short loc_A51F
                retn
; ---------------------------------------------------------------------------

loc_A51F:
                call    sub_A53E
                jnb     short loc_A525
                retn
; ---------------------------------------------------------------------------

loc_A525:
                mov     ax, [si]
                dec     ax
                cmp     ax, 0FFFFh
                jnz     short loc_A531
                mov     ax, ds:mapWidth
                dec     ax

loc_A531:
                mov     [si], ax
                mov     [si+10h], ax
                dec     byte ptr [si+3]
                dec     byte ptr [si+13h]
                clc
                retn
sub_A518        endp


; =============== S U B R O U T I N E =======================================


sub_A53E        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                dec     di
                mov     cx, 4

loc_A54A:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A555
                retn
; ---------------------------------------------------------------------------

loc_A555:
                xchg    si, di
                add     si, 36
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A54A
                dec     di
                xchg    si, di
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                mov     al, [si]
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 36
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                xchg    si, di
                add     al, al
                retn
sub_A53E        endp


; =============== S U B R O U T I N E =======================================


sub_A59D        proc near
                test    byte ptr [si+3], 0FFh
                stc
                jnz     short loc_A5A5
                retn
; ---------------------------------------------------------------------------

loc_A5A5:
                cmp     byte ptr [si+3], 23h ; '#'
                stc
                jnz     short loc_A5AD
                retn
; ---------------------------------------------------------------------------

loc_A5AD:
                call    sub_A5C3
                jnb     short loc_A5B3
                retn
; ---------------------------------------------------------------------------

loc_A5B3:
                inc     byte ptr [si+2]
                and     byte ptr [si+2], 3Fh
                inc     byte ptr [si+12h]
                and     byte ptr [si+12h], 3Fh
                clc
                retn
sub_A59D        endp


; =============== S U B R O U T I N E =======================================


sub_A5C3        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    si, di
                add     si, 90h
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     cx, 2

loc_A5DB:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A5E6
                retn
; ---------------------------------------------------------------------------

loc_A5E6:
                inc     di
                loop    loc_A5DB
                dec     di
                mov     al, [di]
                or      al, [di-1]
                or      al, [di-1]
                add     al, al
                retn
sub_A5C3        endp

; ---------------------------------------------------------------------------

loc_A5F5:
                mov     al, [si+15h]
                and     al, 0BFh
                or      al, 20h
                mov     [si+5], al
                or      al, 60h
                mov     [si+15h], al
                jmp     word ptr cs:Hero_Hits_monster_proc

; =============== S U B R O U T I N E =======================================


sub_A609        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A613
                neg     al

loc_A613:
                cmp     al, 5
                mov     al, 0FFh
                jb      short loc_A61A
                retn
; ---------------------------------------------------------------------------

loc_A61A:
                cmp     byte ptr [si+3], 11h
                jnb     short loc_A62C
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A62A
                retn
; ---------------------------------------------------------------------------

loc_A62A:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A62C:
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A636
                retn
; ---------------------------------------------------------------------------

loc_A636:
                clc
                retn
sub_A609        endp

; ---------------------------------------------------------------------------

locret_A638:                            ; jumptable 0000A2FB case 3
                retn
; ---------------------------------------------------------------------------

loc_A639:                               ; jumptable 0000A2FB case 2
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A643
                mov     byte ptr [si+8], 40h ; '@'

loc_A643:
                test    byte ptr [si+5], 20h
                jz      short loc_A64C
                jmp     loc_A71E
; ---------------------------------------------------------------------------

loc_A64C:
                and     byte ptr [si+15h], 0BFh
                call    sub_A59D
                jb      short loc_A656
                retn
; ---------------------------------------------------------------------------

loc_A656:
                test    byte ptr [si+9], 1
                jnz     short loc_A6BB
                call    sub_A609
                jb      short loc_A69F

loc_A661:
                add     byte ptr [si+6], 80h
                jb      short loc_A66A
                jmp     loc_A732
; ---------------------------------------------------------------------------

loc_A66A:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                test    byte ptr [si+6], 1
                jz      short loc_A67A
                jmp     loc_A732
; ---------------------------------------------------------------------------

loc_A67A:
                mov     al, 10h
                cmp     al, [si+3]
                jb      short loc_A690
                call    sub_A493
                jnb     short loc_A689
                jmp     loc_A732
; ---------------------------------------------------------------------------

loc_A689:
                or      byte ptr [si+5], 80h
                jmp     loc_A732
; ---------------------------------------------------------------------------

loc_A690:
                call    sub_A518
                jnb     short loc_A698
                jmp     loc_A732
; ---------------------------------------------------------------------------

loc_A698:
                and     byte ptr [si+5], 7Fh
                jmp     loc_A732
; ---------------------------------------------------------------------------

loc_A69F:
                call    word ptr cs:get_random_proc
                and     al, 0C0h
                jnz     short loc_A661
                mov     al, [si+6]
                not     al
                and     al, 1
                jnz     short loc_A661
                or      byte ptr [si+9], 1
                mov     byte ptr [si+6], 4
                jmp     short loc_A732
; ---------------------------------------------------------------------------

loc_A6BB:
                add     byte ptr [si+6], 80h
                jnb     short loc_A732
                inc     byte ptr [si+6]
                mov     al, [si+6]
                and     al, 7
                cmp     al, 6
                jz      short loc_A6DB
                or      al, al
                jnz     short loc_A732
                and     byte ptr [si+9], 0FEh
                mov     byte ptr [si+6], 3
                jmp     short loc_A732
; ---------------------------------------------------------------------------

loc_A6DB:
                mov     al, [si+3]
                mov     byte_A711, al
                inc     al
                mov     byte_A704, al
                mov     al, [si+2]
                inc     al
                mov     byte_A712, al
                mov     byte_A705, al
                mov     bx, offset byte_A704
                test    byte ptr [si+5], 80h
                jnz     short loc_A6FD
                mov     bx, offset byte_A711

loc_A6FD:
                call    word ptr cs:Add_Projectile_To_Array_proc
                jmp     short loc_A732
; ---------------------------------------------------------------------------
byte_A704       db 0
byte_A705       db 0
                db  32h ; 2
                db    0
                db  14h
                db    0
                db  28h ; (
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A711       db 0
byte_A712       db 0
                db  31h ; 1
                db    0
                db  14h
                db    4
                db  28h ; (
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
; ---------------------------------------------------------------------------

loc_A71E:
                mov     al, [si+5]
                and     al, 0BFh
                or      al, 20h
                mov     [si+5], al
                or      al, 60h
                mov     [si+15h], al
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A732:
                mov     al, [si+6]
                mov     [si+16h], al
                mov     al, [si+5]
                and     al, 80h
                mov     ah, [si+15h]
                and     ah, 7Fh
                or      al, ah
                mov     [si+15h], al
                retn
; ---------------------------------------------------------------------------

loc_A749:                               ; jumptable 0000A2FB case 4
                call    word ptr cs:check_monster_on_aggressive_ground_proc
                jnz     short loc_A755
                jmp     word ptr cs:Check_Vertical_Distance_Between_Hero_And_Monster_proc
; ---------------------------------------------------------------------------

loc_A755:
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A75F
                mov     byte ptr [si+8], 8

loc_A75F:
                test    byte ptr [si+5], 20h
                jz      short loc_A76A
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A76A:
                test    byte ptr [si+9], 18h
                jz      short loc_A773
                jmp     loc_A818
; ---------------------------------------------------------------------------

loc_A773:
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A77B
                retn
; ---------------------------------------------------------------------------

loc_A77B:
                test    byte ptr [si+9], 2
                jnz     short loc_A796
                call    sub_A882
                jb      short loc_A796
                cmp     al, 0FFh
                jz      short loc_A796
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                or      byte ptr [si+9], 2
                retn
; ---------------------------------------------------------------------------

loc_A796:
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     ax, 48h ; 'H'
                test    byte ptr [si+5], 80h
                jz      short loc_A7A8
                inc     ax

loc_A7A8:
                xchg    si, di
                add     si, ax
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                jnz     short loc_A7C5
                mov     byte ptr [si+6], 0
                or      byte ptr [si+9], 8
                retn
; ---------------------------------------------------------------------------

loc_A7C5:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                test    byte ptr [si+9], 2
                jnz     short loc_A7DD
                add     byte ptr [si+0Ah], 10h
                jnb     short loc_A7DD
                xor     byte ptr [si+9], 80h
                retn
; ---------------------------------------------------------------------------

loc_A7DD:
                call    sub_A882
                jnb     short loc_A7E6
                and     byte ptr [si+9], 0FDh

loc_A7E6:
                test    byte ptr [si+5], 80h
                jz      short loc_A802
                call    word ptr cs:move_monster_E_proc
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A7F9
                retn
; ---------------------------------------------------------------------------

loc_A7F9:
                mov     byte ptr [si+6], 0
                or      byte ptr [si+9], 10h
                retn
; ---------------------------------------------------------------------------

loc_A802:
                call    word ptr cs:move_monster_W_proc
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A80F
                retn
; ---------------------------------------------------------------------------

loc_A80F:
                mov     byte ptr [si+6], 0
                or      byte ptr [si+9], 10h
                retn
; ---------------------------------------------------------------------------

loc_A818:
                add     byte ptr [si+9], 20h ; ' '
                test    byte ptr [si+9], 20h
                jnz     short loc_A835
                mov     al, [si+6]
                mov     ah, al
                inc     al
                and     al, 3
                jz      short loc_A875
                and     ah, 0F0h
                or      ah, al
                mov     [si+6], ah

loc_A835:
                mov     al, [si+9]
                rol     al, 1
                rol     al, 1
                rol     al, 1
                dec     al
                and     al, 7
                mov     bx, offset byte_A8BF
                mov     cx, offset byte_A8B1
                test    byte ptr [si+5], 80h
                jnz     short loc_A854
                mov     bx, offset byte_A8C7
                mov     cx, offset byte_A8B8

loc_A854:
                test    byte ptr [si+9], 10h
                jnz     short loc_A85C
                xchg    cx, bx

loc_A85C:
                xlat
                call    word ptr cs:monster_move_in_direction_proc
                jb      short loc_A865
                retn
; ---------------------------------------------------------------------------

loc_A865:
                mov     byte ptr [si+9], 0
                test    byte ptr [si+6], 0FFh
                jnz     short loc_A870
                retn
; ---------------------------------------------------------------------------

loc_A870:
                mov     byte ptr [si+6], 3
                retn
; ---------------------------------------------------------------------------

loc_A875:
                and     byte ptr [si+9], 0
                mov     byte ptr [si+6], 3
                jmp     word ptr cs:move_monster_S_proc

; =============== S U B R O U T I N E =======================================


sub_A882        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A88C
                neg     al

loc_A88C:
                cmp     al, 6
                mov     al, 0FFh
                jb      short loc_A893
                retn
; ---------------------------------------------------------------------------

loc_A893:
                cmp     byte ptr [si+3], 11h
                jnb     short loc_A8A5
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A8A3
                retn
; ---------------------------------------------------------------------------

loc_A8A3:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A8A5:
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A8AF
                retn
; ---------------------------------------------------------------------------

loc_A8AF:
                clc
                retn
sub_A882        endp

; ---------------------------------------------------------------------------
byte_A8B1       db 1, 1, 0, 0, 0, 7, 7
byte_A8B8       db 3, 3, 4, 4, 4, 5, 5
byte_A8BF       db 2, 1, 1, 0, 0, 7, 7, 6
byte_A8C7       db 2, 3, 3, 4, 4, 5, 5, 6

eai7          ends

                end start
