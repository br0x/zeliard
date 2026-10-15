include common.inc
include dungeon.inc
                .286
                .model small

eai3            segment byte public 'CODE'
                assume cs:eai3, ds:eai3
                org 0A000h
start:
                dw offset Monster_AI
                db    0
                db    0
                db    0
                db    0
                dw offset death_descriptors
monster_xp      db 20, 10, 10, 20, 0, 0, 0, 0
monster_damage  db 40, 40, 16, 40, 0, 0, 0, 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
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
                ; left frames
                dw offset byte_A0B0
                dw offset byte_A155
                dw offset byte_A1A5
                dw offset byte_A1D7
                dw 0
                dw 0
                dw 0
                dw 0
                dw offset byte_A128
                dw offset byte_A173
                dw offset byte_A1C8
                dw offset byte_A213
                dw 0
                dw 0
                dw 0
                dw 0
                dw offset byte_A272
                dw offset byte_A272
                dw offset byte_A222
                dw offset byte_A259
                dw offset byte_A231
                dw offset byte_A245
                dw offset byte_A26D
                dw 0
                dw offset byte_A28B
                dw offset byte_A290
                dw 0
                dw 0
                dw offset byte_A286
                dw offset byte_A295
                dw 0
                dw 0                    
                ; A070
                ; right frames
                dw offset byte_A0EC
                dw offset byte_A137
                dw offset byte_A182
                dw offset byte_A1F5
                dw 0
                dw 0
                dw 0
                dw 0
                dw offset byte_A128
                dw offset byte_A173
                dw offset byte_A1C8
                dw offset byte_A213
                dw 0
                dw 0
                dw 0
                dw 0
                dw offset byte_A272
                dw offset byte_A272
                dw offset byte_A222
                dw offset byte_A259
                dw offset byte_A231
                dw offset byte_A245
                dw offset byte_A26D
                dw 0
                dw offset byte_A28B
                dw offset byte_A290
                dw 0
                dw 0
                dw offset byte_A286
                dw offset byte_A295
                dw 0
                dw 0
byte_A0B0       db 0, 1, 2, 3, 4
                db 0, 5, 6, 7, 8
                db 0, 9, 0Ah, 0Bh, 0Ch
                db 0, 0Dh, 0Eh, 0Fh, 10h
                db 0, 11h, 12h, 13h, 14h
                db 0, 15h, 16h, 17h, 18h
                db 0, 19h, 1Ah, 1Bh, 1Ch
                db 0, 1Dh, 1Eh, 0Fh, 10h
                db 0, 21h, 22h, 0, 0
                db 0, 0, 0, 21h, 22h
                db 0, 0, 0, 23h, 24h
                db 0, 25h, 26h, 27h, 28h
byte_A0EC       db 0, 1Dh, 1Eh, 0Fh, 10h
                db 0, 0BFh, 1Ah, 0C0h, 1Ch
                db 0, 15h, 16h, 0C1h, 0C2h
                db 0, 11h, 12h, 13h, 14h
                db 0, 0Dh, 0Eh, 0Fh, 10h
                db 0, 0C3h, 0Ah, 0C4h, 1Ch
                db 0, 5, 6, 20h, 1Fh
                db 0, 1, 2, 3, 4
                db 0, 21h, 22h, 0, 0
                db 0, 0, 0, 21h, 22h
                db 0, 0, 0, 23h, 24h
                db 0, 25h, 26h, 27h, 28h
byte_A128       db 0, 29h, 2Ah, 2Bh, 2Ch
                db 0, 2Dh, 2Eh, 2Fh, 30h
                db 0, 31h, 32h, 33h, 34h
byte_A137       db 0, 0, 0, 35h, 36h
                db 0, 37h, 38h, 39h, 3Ah
                db 0, 3Bh, 3Ch, 3Dh, 3Eh
                db 0, 3Fh, 40h, 41h, 42h
                db 0, 43h, 44h, 45h, 46h
                db 0, 43h, 44h, 45h, 46h
byte_A155       db 0, 0, 0, 47h, 48h
                db 0, 49h, 4Ah, 4Bh, 4Ch
                db 0, 4Dh, 4Eh, 4Fh, 50h
                db 0, 51h, 52h, 53h, 54h
                db 0, 55h, 56h, 57h, 58h
                db 0, 55h, 56h, 57h, 58h
byte_A173       db 0, 59h, 5Ah, 5Bh, 5Ch
                db 0, 5Dh, 5Eh, 5Fh, 60h
                db 0, 61h, 62h, 63h, 64h
byte_A182       db 0, 0, 0, 65h, 66h
                db 0, 0, 0, 67h, 68h
                db 0, 0, 0, 69h, 6Ah
                db 0, 0, 0, 6Bh, 6Ch
                db 0, 6Dh, 6Eh, 6Fh, 70h
                db 0, 76h, 77h, 73h, 74h
                db 0, 76h, 78h, 73h, 74h
byte_A1A5       db 0, 0, 0, 65h, 66h
                db 0, 0, 0, 67h, 68h
                db 0, 0, 0, 69h, 6Ah
                db 0, 0, 0, 6Bh, 6Ch
                db 0, 6Dh, 6Eh, 6Fh, 70h
                db 0, 71h, 72h, 73h, 74h
                db 0, 75h, 72h, 73h, 74h
byte_A1C8       db 0, 7Bh, 7Ch, 7Dh, 7Eh
                db 0, 7Fh, 80h, 81h, 82h
                db 0, 83h, 84h, 85h, 86h
byte_A1D7       db 1, 87h, 88h, 89h, 8Ah
                db 1, 8Bh, 8Ch, 8Dh, 8Eh
                db 1, 8Fh, 90h, 91h, 92h
                db 1, 93h, 94h, 95h, 96h
                db 1, 97h, 98h, 99h, 9Ah
                db 1, 9Bh, 9Ch, 9Dh, 9Eh
byte_A1F5       db 1, 87h, 88h, 89h, 8Ah
                db 1, 9Fh, 0A0h, 0A1h, 0A2h
                db 1, 0A3h, 0A4h, 0A5h, 0A6h
                db 1, 0A7h, 0A8h, 0A9h, 0AAh
                db 1, 0ABh, 0ACh, 0ADh, 0AEh
                db 1, 0AFh, 0B0h, 0B1h, 0B2h
byte_A213       db 1, 0B3h, 0B4h, 0B5h, 0B6h
                db 1, 0B7h, 0B8h, 0B9h, 0BAh
                db 1, 0BBh, 0BCh, 0BDh, 0BEh
byte_A222       db 1, 0EFh, 0F0h, 0F1h, 0F2h
                db 1, 0F3h, 0C5h, 0C6h, 0C7h
                db 1, 0C8h, 0C9h, 0CAh, 0CBh
byte_A231       db 0, 0CCh, 0CDh, 0CEh, 0CFh
                db 0, 0D0h, 0D1h, 0D2h, 0D3h
                db 0, 0D4h, 0D5h, 0D6h, 0D7h
                db 0, 0D0h, 0D1h, 0D2h, 0D3h
byte_A245       db 2, 0CCh, 0CDh, 0CEh, 0CFh
                db 2, 0D0h, 0D1h, 0D2h, 0D3h
                db 2, 0D4h, 0D5h, 0D6h, 0D7h
                db 2, 0D0h, 0D1h, 0D2h, 0D3h
byte_A259       db 0, 0D8h, 0D9h, 0DAh, 0DBh
                db 0, 0D8h, 0D9h, 0DAh, 0DBh
                db 0, 0D8h, 0D9h, 0DAh, 0DBh
                db 0, 0D8h, 0D9h, 0DAh, 0DBh
byte_A26D       db 1, 0DCh, 0DDh, 0DEh, 0DFh
byte_A272       db 1, 0E4h, 0ECh, 0E4h, 0ECh
                db 1, 0E5h, 0ECh, 0E6h, 0ECh
                db 1, 0E7h, 0E8h, 0E9h, 0EAh
                db 1, 0, 0, 0, 0EBh
byte_A286       db 2, 0E0h, 0E1h, 0E2h, 0E3h
byte_A28B       db 0, 0EDh, 0EEh, 79h, 7Ah
byte_A290       db 2, 0EDh, 0EEh, 79h, 7Ah
byte_A295       db 1, 0F4h, 0F5h, 0F6h, 0F7h
death_descriptors dw offset byte_A2A2
                dw offset byte_A2A6
                dw offset byte_A2AA
                dw offset byte_A2AE
byte_A2A2       db 4, 4, 0, 0
byte_A2A6       db 5, 5, 0, 0
byte_A2AA       db 4, 4, 4, 4
byte_A2AE       db 5, 5, 5, 5

; =============== S U B R O U T I N E =======================================


Monster_AI      proc near

                mov     bl, [si+4]
                and     bl, 0Fh
                xor     bh, bh
                add     bx, bx          ; switch 4 cases
                jmp     jpt_A2BC[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A2BC        dw offset loc_A2C8      ; jump table for switch statement
                dw offset loc_A44D
                dw offset loc_A4F0
                dw offset loc_A66E
; ---------------------------------------------------------------------------

loc_A2C8:                               ; jumptable 0000A2BC case 0
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A2D2
                mov     byte ptr [si+8], 2

loc_A2D2:
                test    byte ptr [si+5], 20h
                jz      short loc_A2DD
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A2DD:
                mov     bl, [si+9]
                and     bx, 7           ; switch 8 cases
                add     bx, bx
                jmp     jpt_A2E5[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A2E5        dw offset loc_A2F9      ; jump table for switch statement
                dw offset loc_A356
                dw offset loc_A367
                dw offset loc_A374
                dw offset loc_A3AC
                dw offset loc_A3E0
                dw offset loc_A405
                dw offset loc_A40E
; ---------------------------------------------------------------------------

loc_A2F9:                               ; jumptable 0000A2E5 case 0
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                call    word ptr cs:check_collision_N2_proc
                jnb     short loc_A34D
                test    byte ptr [si+6], 1
                jnz     short loc_A30E
                retn
; ---------------------------------------------------------------------------

loc_A30E:
                mov     al, [si+3]
                cmp     al, 12h
                jb      short loc_A319
                cmp     al, 15h
                jb      short loc_A34D

loc_A319:
                test    byte ptr [si+5], 80h
                jnz     short loc_A337
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A327
                retn
; ---------------------------------------------------------------------------

loc_A327:
                xor     al, al
                xchg    al, [si+0Ah]
                xor     byte ptr [si+5], 80h
                test    al, 1
                jz      short loc_A335
                retn
; ---------------------------------------------------------------------------

loc_A335:
                jmp     short loc_A34D
; ---------------------------------------------------------------------------

loc_A337:
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A33F
                retn
; ---------------------------------------------------------------------------

loc_A33F:
                xor     al, al
                xchg    al, [si+0Ah]
                xor     byte ptr [si+5], 80h
                test    al, 1
                jz      short loc_A34D
                retn
; ---------------------------------------------------------------------------

loc_A34D:
                mov     byte ptr [si+9], 1
                mov     byte ptr [si+6], 8
                retn
; ---------------------------------------------------------------------------

loc_A356:
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A35E
                retn
; ---------------------------------------------------------------------------

loc_A35E:
                mov     byte ptr [si+9], 2
                mov     byte ptr [si+6], 9
                retn
; ---------------------------------------------------------------------------

loc_A367:                               ; jumptable 0000A2E5 case 2
                mov     byte ptr [si+9], 3
                mov     byte ptr [si+6], 0Ah
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A374:                               ; jumptable 0000A2E5 case 3
                cmp     byte ptr [si+0Ah], 1
                jnz     short loc_A382
                mov     byte ptr [si+9], 4
                mov     byte ptr [si+0Ah], 0FFh

loc_A382:
                mov     byte ptr [si+6], 0Bh
                test    byte ptr [si+5], 80h
                jnz     short loc_A39C
                inc     byte ptr [si+0Ah]
                call    word ptr cs:move_monster_NW_proc
                jb      short loc_A397
                retn
; ---------------------------------------------------------------------------

loc_A397:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A39C:
                inc     byte ptr [si+0Ah]
                call    word ptr cs:move_monster_NE_proc
                jb      short loc_A3A7
                retn
; ---------------------------------------------------------------------------

loc_A3A7:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A3AC:                               ; jumptable 0000A2E5 case 4
                cmp     byte ptr [si+0Ah], 1
                jnz     short loc_A3B6
                mov     byte ptr [si+9], 5

loc_A3B6:
                mov     byte ptr [si+6], 8
                test    byte ptr [si+5], 80h
                jnz     short loc_A3D0
                inc     byte ptr [si+0Ah]
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A3CB
                retn
; ---------------------------------------------------------------------------

loc_A3CB:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A3D0:
                inc     byte ptr [si+0Ah]
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A3DB
                retn
; ---------------------------------------------------------------------------

loc_A3DB:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A3E0:                               ; jumptable 0000A2E5 case 5
                mov     byte ptr [si+6], 8
                test    byte ptr [si+5], 80h
                jnz     short loc_A3FB
                call    word ptr cs:move_monster_SW_proc
                jb      short loc_A3F2
                retn
; ---------------------------------------------------------------------------

loc_A3F2:
                mov     byte ptr [si+6], 9
                mov     byte ptr [si+9], 6
                retn
; ---------------------------------------------------------------------------

loc_A3FB:
                call    word ptr cs:move_monster_SE_proc
                jb      short loc_A403
                retn
; ---------------------------------------------------------------------------

loc_A403:
                jmp     short loc_A3F2
; ---------------------------------------------------------------------------

loc_A405:                               ; jumptable 0000A2E5 case 6
                mov     byte ptr [si+6], 0Ah
                mov     byte ptr [si+9], 7
                retn
; ---------------------------------------------------------------------------

loc_A40E:                               ; jumptable 0000A2E5 case 7
                mov     byte ptr [si+6], 8
                test    byte ptr [si+5], 80h
                jnz     short loc_A439
                call    word ptr cs:move_monster_NW_proc
                jb      short loc_A420
                retn
; ---------------------------------------------------------------------------

loc_A420:
                call    word ptr cs:check_collision_N2_proc
                jb      short loc_A42C
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A42C:
                mov     byte ptr [si+9], 0
                mov     byte ptr [si+6], 0
                mov     byte ptr [si+0Ah], 1
                retn
; ---------------------------------------------------------------------------

loc_A439:
                call    word ptr cs:move_monster_NE_proc
                jb      short loc_A441
                retn
; ---------------------------------------------------------------------------

loc_A441:
                call    word ptr cs:move_monster_N_proc
                jb      short loc_A42C
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A44D:                               ; jumptable 0000A2BC case 1
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A457
                mov     byte ptr [si+8], 2

loc_A457:
                test    byte ptr [si+5], 20h
                jz      short loc_A462
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A462:
                test    byte ptr [si+9], 8
                jnz     short loc_A498
                test    byte ptr [si+9], 4
                jnz     short loc_A47C
                or      byte ptr [si+5], 80h
                cmp     byte ptr [si+3], 11h
                jb      short loc_A47C
                xor     byte ptr [si+5], 80h

loc_A47C:
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A484
                retn
; ---------------------------------------------------------------------------

loc_A484:
                and     byte ptr [si+6], 0F0h
                add     byte ptr [si+6], 80h
                jb      short loc_A48F
                retn
; ---------------------------------------------------------------------------

loc_A48F:
                mov     byte ptr [si+6], 0
                or      byte ptr [si+9], 8
                retn
; ---------------------------------------------------------------------------

loc_A498:
                and     byte ptr [si+9], 0FBh
                mov     al, [si+6]
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                cmp     byte ptr [si+6], 6
                jb      short loc_A4B4
                mov     byte ptr [si+6], 0
                and     byte ptr [si+9], 0F7h

loc_A4B4:
                mov     bx, offset byte_A4E4
                test    byte ptr [si+5], 80h
                jnz     short loc_A4C0
                mov     bx, offset byte_A4EA

loc_A4C0:
                xlat
                call    word ptr cs:monster_move_in_direction_proc
                jb      short loc_A4C9
                retn
; ---------------------------------------------------------------------------

loc_A4C9:
                and     byte ptr [si+9], 0F7h
                cmp     byte ptr [si+6], 1
                jnz     short loc_A4DB
                or      byte ptr [si+9], 4
                xor     byte ptr [si+5], 80h

loc_A4DB:
                mov     byte ptr [si+6], 0
                jmp     word ptr cs:move_monster_S_proc
; ---------------------------------------------------------------------------
byte_A4E4       db 1, 1, 0, 0, 7, 7
byte_A4EA       db 3, 3, 4, 4, 5, 5
; ---------------------------------------------------------------------------

loc_A4F0:                               ; jumptable 0000A2BC case 2
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A4FA
                mov     byte ptr [si+8], 4

loc_A4FA:
                test    byte ptr [si+5], 20h
                jz      short loc_A505
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A505:
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A50D
                retn
; ---------------------------------------------------------------------------

loc_A50D:
                mov     bl, [si+9]
                and     bx, 3
                add     bx, bx          ; switch 4 cases
                jmp     jpt_A515[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A515        dw offset loc_A521      ; jump table for switch statement
                dw offset loc_A5A3
                dw offset loc_A5BA
                dw offset loc_A612
; ---------------------------------------------------------------------------

loc_A521:                               ; jumptable 0000A515 case 0
                or      byte ptr [si+4], 60h
                add     byte ptr [si+6], 80h
                jb      short loc_A52C
                retn
; ---------------------------------------------------------------------------

loc_A52C:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 1
                jz      short loc_A536
                retn
; ---------------------------------------------------------------------------

loc_A536:
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 7
                jb      short loc_A547
                mov     byte ptr [si+9], 1
                mov     byte ptr [si+6], 2

loc_A547:
                test    byte ptr [si+5], 80h
                jz      short loc_A578
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    si, di
                add     si, 4Ah ; 'J'
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                jz      short loc_A56F
                jmp     word ptr cs:move_monster_E_proc
; ---------------------------------------------------------------------------

loc_A56F:
                and     byte ptr [si+5], 7Fh
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A578:
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    si, di
                add     si, 47h ; 'G'
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                jz      short loc_A59A
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A59A:
                or      byte ptr [si+5], 80h
                jmp     word ptr cs:move_monster_E_proc
; ---------------------------------------------------------------------------

loc_A5A3:                               ; jumptable 0000A515 case 1
                and     byte ptr [si+4], 1Fh
                inc     byte ptr [si+6]
                cmp     byte ptr [si+6], 5
                jz      short loc_A5B1
                retn
; ---------------------------------------------------------------------------

loc_A5B1:
                mov     byte ptr [si+9], 2
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A5BA:                               ; jumptable 0000A515 case 2
                test    byte ptr [si+9], 80h
                jnz     short loc_A5DA
                add     byte ptr [si+6], 40h ; '@'
                jb      short loc_A5C7
                retn
; ---------------------------------------------------------------------------

loc_A5C7:
                xor     byte ptr [si+5], 80h
                call    sub_A625
                jb      short loc_A5E3
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 3
                jz      short loc_A5DA
                retn
; ---------------------------------------------------------------------------

loc_A5DA:
                mov     byte ptr [si+9], 3
                mov     byte ptr [si+6], 5
                retn
; ---------------------------------------------------------------------------

loc_A5E3:
                mov     byte ptr [si+6], 6
                or      byte ptr [si+9], 80h
                mov     al, [si+3]
                mov     byte_A661, al
                inc     al
                mov     byte_A654, al
                mov     al, [si+2]
                and     al, 3Fh
                mov     byte_A662, al
                mov     byte_A655, al
                mov     bx, offset byte_A654
                test    byte ptr [si+5], 80h
                jnz     short loc_A60D
                mov     bx, offset byte_A661

loc_A60D:
                jmp     word ptr cs:Add_Projectile_To_Array_proc
; ---------------------------------------------------------------------------

loc_A612:                               ; jumptable 0000A515 case 3
                dec     byte ptr [si+6]
                cmp     byte ptr [si+6], 1
                jz      short loc_A61C
                retn
; ---------------------------------------------------------------------------

loc_A61C:
                mov     byte ptr [si+9], 0
                mov     byte ptr [si+0Ah], 0
                retn
Monster_AI      endp


; =============== S U B R O U T I N E =======================================


sub_A625        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A62F
                neg     al

loc_A62F:
                cmp     al, 5
                mov     al, 0FFh
                jb      short loc_A636
                retn
; ---------------------------------------------------------------------------

loc_A636:
                cmp     byte ptr [si+3], 11h
                jnb     short loc_A648
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A646
                retn
; ---------------------------------------------------------------------------

loc_A646:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A648:
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A652
                retn
; ---------------------------------------------------------------------------

loc_A652:
                clc
                retn
sub_A625        endp

; ---------------------------------------------------------------------------
byte_A654       db 0
byte_A655       db 0
                db  2Bh ; +
                db    0
                db  0Fh
                db    0
                db  28h ; (
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A661       db 0
byte_A662       db 0
                db  2Bh ; +
                db    0
                db  0Fh
                db    4
                db  28h ; (
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
; ---------------------------------------------------------------------------

loc_A66E:                               ; jumptable 0000A2BC case 3
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A678
                mov     byte ptr [si+8], 4

loc_A678:
                test    byte ptr [si+5], 20h
                jz      short loc_A683
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A683:
                mov     al, [si+6]
                push    ax
                mov     byte ptr [si+6], 0
                call    word ptr cs:move_monster_S_proc
                pop     ax
                jb      short loc_A694
                retn
; ---------------------------------------------------------------------------

loc_A694:
                mov     [si+6], al
                test    byte ptr [si+9], 1
                jnz     short loc_A6C2
                mov     byte ptr [si+6], 1
                mov     byte ptr [si+0Ah], 0
                call    sub_A701
                jb      short loc_A6B7
                cmp     al, 0FFh
                jnz     short loc_A6AF
                retn
; ---------------------------------------------------------------------------

loc_A6AF:
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                retn
; ---------------------------------------------------------------------------

loc_A6B7:
                cmp     ah, 0Ah
                jb      short loc_A6BD
                retn
; ---------------------------------------------------------------------------

loc_A6BD:
                or      byte ptr [si+9], 1
                retn
; ---------------------------------------------------------------------------

loc_A6C2:
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 14h
                jz      short loc_A6DF
                test    byte ptr [si+5], 80h
                jnz     short loc_A6E4
                call    word ptr cs:move_monster_W_proc
                jnb     short loc_A6F2
                call    word ptr cs:move_monster_NW_proc
                jnb     short loc_A6F2

loc_A6DF:
                and     byte ptr [si+9], 0FEh
                retn
; ---------------------------------------------------------------------------

loc_A6E4:
                call    word ptr cs:move_monster_E_proc
                jnb     short loc_A6F2
                call    word ptr cs:move_monster_NE_proc
                jb      short loc_A6DF

loc_A6F2:
                inc     byte ptr [si+6]
                cmp     byte ptr [si+6], 6
                jnb     short loc_A6FC
                retn
; ---------------------------------------------------------------------------

loc_A6FC:
                mov     byte ptr [si+6], 1
                retn

; =============== S U B R O U T I N E =======================================


sub_A701        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A70B
                neg     al

loc_A70B:
                cmp     al, 6
                mov     al, 0FFh
                jb      short loc_A712
                retn
; ---------------------------------------------------------------------------

loc_A712:
                mov     al, 11h
                sub     al, [si+3]
                jb      short loc_A727
                mov     ah, al
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A725
                retn
; ---------------------------------------------------------------------------

loc_A725:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A727:
                neg     al
                mov     ah, al
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A735
                retn
; ---------------------------------------------------------------------------

loc_A735:
                clc
                retn
sub_A701        endp

eai3            ends
                end   start