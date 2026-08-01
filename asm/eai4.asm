include common.inc
include dungeon.inc
                .286
                .model small

eai4            segment byte public 'CODE'
                assume cs:eai4, ds:eai4
                org 0A000h
start:
                dw offset Monster_AI
                db    0
                db    0
                db    0
                db    0
                dw offset death_descriptors
monster_xp      db 10, 10, 0, 0, 20, 0, 0, 0
monster_damage  db 20, 4, 80, 80, 80, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                ; A030 left frames
                dw offset turtle_left
                dw offset green_egg
                dw offset icicle_idle
                dw offset icicle_fall
                dw offset arrow
                dw    0
                dw    0
                dw    0
                dw offset turtle_death
                dw offset green_egg_death
                dw offset icicle_break
                dw offset icicle_break
                dw offset arrow_death
                dw    0
                dw    0
                dw    0
                dw offset wall_destruction
                dw offset wall_destruction
                dw offset hit
                dw offset chest
                dw offset alma_red
                dw offset alma_blue
                dw offset ordinary_key
                dw    0
                dw offset red_potion
                dw offset blue_potion
                dw offset ruzeria_shoes_
                dw    0
                dw    0
                dw    0
                dw    0
                dw    0
                ; A070 right frames
                dw offset turtle_right
                dw offset green_egg
                dw offset icicle_idle
                dw offset icicle_fall
                dw offset arrow
                dw    0
                dw    0
                dw    0
                dw offset turtle_death
                dw offset green_egg_death
                dw offset icicle_break
                dw offset icicle_break
                dw offset arrow_death
                dw    0
                dw    0
                dw    0
                dw offset wall_destruction
                dw offset wall_destruction
                dw offset hit
                dw offset chest
                dw offset alma_red
                dw offset alma_blue
                dw offset ordinary_key
                dw    0
                dw offset red_potion
                dw offset blue_potion
                dw offset ruzeria_shoes_
                dw    0
                dw    0
                dw    0
                dw    0
                dw    0
turtle_left     db 1, 0, 1, 2, 3 ; 0
                db 1, 0, 1, 5, 6
                db 1, 0, 1, 8, 9
                db 1, 0, 1, 0Bh, 0Ch
                db 1, 0, 1, 0Eh, 0Fh
                db 1, 0, 1, 11h, 12h
                db 1, 0, 1, 14h, 15h
                db 1, 0, 1, 17h, 18h
                db 1, 0, 1, 32h, 33h
                db 1, 0, 0, 34h, 35h
                db 1, 0, 0, 36h, 37h
                db 1, 0, 0, 38h, 39h
                db 1, 0, 0, 0E2h, 0A4h
                db 1, 3Ah, 3Bh, 3Ch, 3Dh
                db 1, 3Eh, 0, 3Fh, 0
                db 1, 40h, 0, 41h, 0 ; 15
turtle_right    db 1, 19h, 0, 1Ah, 1Bh ; 16
                db 1, 19h, 0, 1Dh, 1Eh
                db 1, 19h, 0, 20h, 21h
                db 1, 19h, 0, 23h, 24h
                db 1, 19h, 0, 26h, 27h
                db 1, 19h, 0, 29h, 2Ah
                db 1, 19h, 0, 2Ch, 2Dh
                db 1, 19h, 0, 2Fh, 30h
                db 1, 19h, 0, 43h, 44h
                db 1, 0, 0, 45h, 46h
                db 1, 0, 0, 47h, 48h
                db 1, 0, 0, 49h, 4Ah
                db 1, 0, 0, 0A3h, 0A2h
                db 1, 4Bh, 4Ch, 4Dh, 4Eh
                db 1, 0, 4Fh, 0, 50h
                db 1, 0, 51h, 0, 52h ; 31
turtle_death    db 1, 53h, 54h, 55h, 56h ; 32
                db 1, 57h, 58h, 59h, 5Ah
                db 1, 5Bh, 5Ch, 5Dh, 5Eh
green_egg       db 0, 5Fh, 60h, 61h, 62h ; 35
                db 0, 63h, 60h, 65h, 66h
                db 0, 67h, 68h, 69h, 6Ah
                db 0, 5Fh, 6Ch, 6Dh, 6Eh
                db 0, 6Fh, 60h, 71h, 72h
                db 0, 73h, 74h, 75h, 76h
                db 0, 63h, 78h, 79h, 7Ah
                db 0, 7Bh, 6Ch, 7Dh, 7Eh ; 42
green_egg_death db 0, 7Fh, 80h, 81h, 82h ; 43
                db 0, 83h, 84h, 85h, 86h
                db 0, 87h, 88h, 89h, 8Ah
icicle_idle     db 2, 8Bh, 8Ch, 8Dh, 8Eh ; 46
                db 2, 8Fh, 90h, 91h, 92h
icicle_fall     db 2, 9Dh, 9Dh, 9Eh, 9Eh ; 48
                db 2, 0A1h, 0A1h, 9Eh, 9Eh
icicle_break    db 2, 95h, 96h, 98h, 99h ; 50
                db 2, 99h, 9Ah, 9Bh, 9Ch
                db 2, 0, 0, 9Fh, 0A0h
arrow           db 0, 0A8h, 0A9h, 0AAh, 0ABh ; 53
                db 0, 0ACh, 0ADh, 0AEh, 0AFh
                db 0, 0B0h, 0B1h, 0B2h, 0B3h
                db 0, 0B4h, 0B5h, 0B6h, 0B7h
arrow_death     db 0, 0B8h, 0B9h, 0BAh, 0BBh ; 57
                db 0, 0BCh, 0BDh, 0BEh, 0BFh
                db 0, 0C0h, 0C1h, 0C2h, 0C3h
hit             db 1, 4, 7, 0Ah, 0Dh         ; 60
                db 1, 10h, 13h, 16h, 1Ch
                db 1, 1Fh, 22h, 25h, 28h
alma_red        db 0, 2Bh, 2Eh, 31h, 42h     ; 63
                db 0, 64h, 6Bh, 70h, 77h
                db 0, 7Ch, 0C4h, 0C5h, 0C6h
                db 0, 64h, 6Bh, 70h, 77h
alma_blue       db 2, 2Bh, 2Eh, 31h, 42h     ; 67
                db 2, 64h, 6Bh, 70h, 77h
                db 2, 7Ch, 0C4h, 0C5h, 0C6h
                db 2, 64h, 6Bh, 70h, 77h
chest           db 0, 0C7h, 0C8h, 0C9h, 0CAh ; 71
                db 0, 0C7h, 0C8h, 0C9h, 0CAh
                db 0, 0C7h, 0C8h, 0C9h, 0CAh
                db 0, 0C7h, 0C8h, 0C9h, 0CAh
ordinary_key    db 1, 0CBh, 0CCh, 0CDh, 0CEh ; 75
wall_destruction db 2, 0D7h, 0D7h, 0D7h, 0D7h ; 76
                db 2, 0D8h, 0D9h, 0DAh, 0DBh
                db 2, 0DCh, 0DDh, 0DEh, 0DFh
                db 2, 0, 0, 0E0h, 0E1h
ruzeria_shoes_  db 0, 0CFh, 0D0h, 0D1h, 0D2h ; 80
red_potion      db 0, 0D3h, 0D4h, 0D5h, 0D6h ; 81
blue_potion     db 2, 0D3h, 0D4h, 0D5h, 0D6h ; 82
death_descriptors dw offset byte_A259
                dw offset byte_A25D
                dw offset byte_A261
                dw offset byte_A261
                dw offset byte_A265
byte_A259       db 5, 4, 4, 5
byte_A25D       db 4, 4, 4, 4
byte_A261       db 1, 1, 1, 1
byte_A265       db 5, 5, 5, 4

; =============== S U B R O U T I N E =======================================


Monster_AI        proc near

                mov     bl, [si+4]
                and     bl, 0Fh
                xor     bh, bh
                add     bx, bx          ; switch 5 cases
                jmp     jpt_A273[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A273        dw offset loc_A281      ; jump table for switch statement
                dw offset loc_A466
                dw offset loc_A6B1
                dw offset loc_A6B1
                dw offset loc_A6F0
; ---------------------------------------------------------------------------

loc_A281:                               ; jumptable 0000A273 case 0
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A28B
                mov     byte ptr [si+8], 8

loc_A28B:
                test    byte ptr [si+5], 20h
                jz      short loc_A296
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A296:
                test    byte ptr [si+9], 8
                jz      short loc_A29F
                jmp     loc_A3CD
; ---------------------------------------------------------------------------

loc_A29F:
                test    byte ptr [si+9], 4
                jz      short loc_A2A8
                jmp     loc_A368
; ---------------------------------------------------------------------------

loc_A2A8:                               ;
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A2B0
                retn
; ---------------------------------------------------------------------------

loc_A2B0:
                test    byte ptr [si+9], 1
                jnz     short loc_A324
                test    byte ptr [si+9], 2
                jz      short loc_A2BF
                jmp     loc_A346
; ---------------------------------------------------------------------------

loc_A2BF:
                mov     al, [si+6]
                mov     ah, al
                inc     al
                and     al, 7
                and     ah, 0F0h
                or      al, ah
                add     al, 80h
                mov     [si+6], al
                jb      short loc_A2D5
                retn
; ---------------------------------------------------------------------------

loc_A2D5:                               ;
                mov     al, ds:hero_y_absolute
                mov     ah, [si+2]
                cmp     al, ah
                jz      short loc_A2EF
                inc     al
                and     al, 3Fh
                cmp     al, ah
                jz      short loc_A2EF
                test    byte ptr [si+5], 80h
                jnz     short loc_A313
                jmp     short loc_A302
; ---------------------------------------------------------------------------

loc_A2EF:                               ;
                call    word ptr cs:get_random_proc
                and     al, 3
                jnz     short loc_A2FC
                mov     byte ptr [si+9], 5

loc_A2FC:
                cmp     byte ptr [si+3], 11h
                jb      short loc_A313

loc_A302:
                and     byte ptr [si+5], 7Fh
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A30E
                retn
; ---------------------------------------------------------------------------

loc_A30E:
                mov     byte ptr [si+9], 9
                retn
; ---------------------------------------------------------------------------

loc_A313:
                or      byte ptr [si+5], 80h
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A31F
                retn
; ---------------------------------------------------------------------------

loc_A31F:
                mov     byte ptr [si+9], 9
                retn
; ---------------------------------------------------------------------------

loc_A324:
                mov     al, [si+6]
                and     al, 0Fh
                cmp     al, 8
                jnb     short loc_A332
                mov     byte ptr [si+6], 8
                retn
; ---------------------------------------------------------------------------

loc_A332:
                inc     al
                mov     [si+6], al
                cmp     al, 0Bh
                jz      short loc_A33C
                retn
; ---------------------------------------------------------------------------

loc_A33C:
                or      al, 10h
                mov     [si+6], al
                and     byte ptr [si+9], 0FEh
                retn
; ---------------------------------------------------------------------------

loc_A346:
                mov     al, [si+6]
                and     al, 0Fh
                cmp     al, 0Ch
                jb      short loc_A354
                mov     byte ptr [si+6], 0Bh
                retn
; ---------------------------------------------------------------------------

loc_A354:
                dec     al
                mov     [si+6], al
                cmp     al, 8
                jz      short loc_A35E
                retn
; ---------------------------------------------------------------------------

loc_A35E:
                or      al, 10h
                mov     [si+6], al
                and     byte ptr [si+9], 0FDh
                retn
; ---------------------------------------------------------------------------

loc_A368:
                mov     al, [si+6]
                and     al, 0Fh
                inc     al
                cmp     al, 0Fh
                jnb     short loc_A377
                mov     [si+6], al
                retn
; ---------------------------------------------------------------------------

loc_A377:
                cmp     al, 10h
                jb      short loc_A37D
                mov     al, 0Eh

loc_A37D:
                mov     [si+6], al
                test    byte ptr [si+5], 80h
                jz      short loc_A3A6
                call    word ptr cs:move_monster_SE_proc
                call    word ptr cs:move_monster_SE_proc
                jb      short loc_A393
                retn
; ---------------------------------------------------------------------------

loc_A393:                               ;
                call    word ptr cs:move_monster_E_proc
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A3A0
                retn
; ---------------------------------------------------------------------------

loc_A3A0:
                and     byte ptr [si+5], 7Fh
                jmp     short loc_A3C4
; ---------------------------------------------------------------------------

loc_A3A6:                               ;
                call    word ptr cs:move_monster_SW_proc
                call    word ptr cs:move_monster_SW_proc
                jb      short loc_A3B3
                retn
; ---------------------------------------------------------------------------

loc_A3B3:                               ;
                call    word ptr cs:move_monster_W_proc
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A3C0
                retn
; ---------------------------------------------------------------------------

loc_A3C0:
                or      byte ptr [si+5], 80h

loc_A3C4:
                mov     byte ptr [si+6], 1Dh
                mov     byte ptr [si+9], 2
                retn
; ---------------------------------------------------------------------------

loc_A3CD:
                mov     al, [si+6]
                inc     al
                and     al, 0Fh
                cmp     al, 0Dh
                jb      short loc_A3DA
                mov     al, 0Bh

loc_A3DA:
                mov     [si+6], al
                test    byte ptr [si+0Ah], 1
                jnz     short loc_A3F8
                call    word ptr cs:move_monster_S_proc
                add     byte ptr [si+9], 10h
                test    byte ptr [si+9], 0F0h
                jz      short loc_A3F3
                retn
; ---------------------------------------------------------------------------

loc_A3F3:
                or      byte ptr [si+0Ah], 1
                retn
; ---------------------------------------------------------------------------

loc_A3F8:
                test    byte ptr [si+0Ah], 4
                jnz     short loc_A412
                or      byte ptr [si+0Ah], 4
                test    byte ptr [si+0Ah], 8
                jnz     short loc_A40D
                jmp     word ptr cs:move_monster_E_proc
; ---------------------------------------------------------------------------

loc_A40D:                               ;
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A412:
                mov     bx, offset trajectory_right
                test    byte ptr [si+5], 80h
                jnz     short loc_A41E
                mov     bx, offset trajectory_left

loc_A41E:
                mov     al, [si+9]
                rol     al, 1
                rol     al, 1
                rol     al, 1
                and     al, 7
                add     byte ptr [si+9], 20h ; ' '
                test    byte ptr [si+9], 0E0h
                jnz     short loc_A43B
                mov     byte ptr [si+0Ah], 0
                mov     byte ptr [si+9], 2

loc_A43B:
                xlat
                call    word ptr cs:monster_move_in_direction_proc
                jb      short loc_A444
                retn
; ---------------------------------------------------------------------------

loc_A444:
                mov     al, [si+9]
                and     al, 0E0h
                jnz     short loc_A44C
                retn
; ---------------------------------------------------------------------------

loc_A44C:
                cmp     al, 0C0h
                jb      short loc_A451
                retn
; ---------------------------------------------------------------------------

loc_A451:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------
trajectory_right:
                db 2, 1, 1, 0, 0, 7, 7, 6
trajectory_left:
                db 2, 3, 3, 4, 4, 5, 5, 6
; ---------------------------------------------------------------------------

loc_A466:                               ; jumptable 0000A273 case 1
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A470
                mov     byte ptr [si+8], 10h

loc_A470:
                test    byte ptr [si+5], 20h
                jz      short loc_A4EC
                mov     al, [si+5]
                and     al, 1Fh
                cmp     al, 4
                jnz     short loc_A484
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A484:
                cmp     al, 5
                jnz     short loc_A48D
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A48D:
                cmp     al, 8
                jnz     short loc_A496
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A496:
                cmp     al, 1
                jnz     short loc_A4A6
                cmp     byte ptr ds:92h, 6 ; sword_type
                jnz     short loc_A4A6
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A4A6:
                test    byte ptr [si+6], 1
                jz      short loc_A4B1
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A4B1:
                and     byte ptr [si+5], 0DFh
                test    byte ptr [si+7], 40h
                jnz     short loc_A4EC
                call    word ptr cs:Find_Monsters_Near_Hero_proc
                jc      short loc_A4EC
                mov     word ptr [di], 0FF00h
                test    byte ptr [di+7], 40h
                jz      short loc_A4E1
                and     byte ptr [di+7], 0BFh
                mov     al, [di+0Ah]
                mov     cl, 10h
                mul     cl
                mov     bx, ax
                add     bx, ds:monsters_table_addr
                mov     byte ptr [bx+2], 0

loc_A4E1:
                mov     byte ptr [di+2], 7Fh
                mov     [si+0Ah], dl
                or      byte ptr [si+7], 40h

loc_A4EC:
                test    byte ptr [si+9], 1
                pushf
                and     byte ptr [si+9], 0FEh
                popf
                jz      short loc_A4F9
                retn
; ---------------------------------------------------------------------------

loc_A4F9:
                test    byte ptr [si+7], 40h
                jnz     short loc_A56C
                mov     al, [si+6]
                mov     ah, al
                inc     al
                and     al, 3
                and     ah, 0F0h
                or      al, ah
                mov     [si+6], al
                mov     bx, si

loc_A512:
                mov     si, bx

loc_A514:                               ;
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A51C
                retn
; ---------------------------------------------------------------------------

loc_A51C:
                sub     byte ptr [si+6], 10h
                test    byte ptr [si+6], 0F0h
                jz      short loc_A527
                retn
; ---------------------------------------------------------------------------

loc_A527:
                or      byte ptr [si+6], 40h
                mov     al, ds:hero_y_absolute
                cmp     al, [si+2]
                jz      short loc_A544
                inc     al
                and     al, 3Fh
                cmp     al, [si+2]
                jz      short loc_A544
                test    byte ptr [si+5], 80h
                jnz     short loc_A557
                jmp     short loc_A54B
; ---------------------------------------------------------------------------

loc_A544:
                mov     al, 10h
                cmp     al, [si+3]
                jnb     short loc_A557

loc_A54B:
                and     byte ptr [si+5], 7Fh
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A557
                retn
; ---------------------------------------------------------------------------

loc_A557:
                or      byte ptr [si+5], 80h
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A563
                retn
; ---------------------------------------------------------------------------

loc_A563:
                and     byte ptr [si+5], 7Fh
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A56C:
                mov     al, [si+6]
                mov     ah, al
                inc     al
                and     al, 7
                and     ah, 0F0h
                or      ah, al
                mov     [si+6], ah
                cmp     al, 6
                jnz     short loc_A514
                and     [si+6], ah
                mov     al, [si+0Ah]
                mov     cl, 10h
                mul     cl
                add     ax, ds:monsters_table_addr
                mov     di, ax
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bx, si
                mov     si, di
                pop     di
                test    byte ptr [bx+5], 80h
                jnz     short loc_A5FC
                mov     al, [bx+3]
                or      al, al
                jns     short loc_A5AF
                jmp     loc_A512
; ---------------------------------------------------------------------------

loc_A5AF:
                cmp     al, 21h ; '!'
                jb      short loc_A5B6
                jmp     loc_A512
; ---------------------------------------------------------------------------

loc_A5B6:
                mov     ax, 23h ; '#'
                call    sub_A679
                jnb     short loc_A5C1
                jmp     loc_A512
; ---------------------------------------------------------------------------

loc_A5C1:
                inc     si
                inc     si
                mov     cl, [si]
                mov     al, [bx+0Ah]
                or      al, 80h
                mov     [si], al
                xchg    si, bx
                mov     al, [si+4]
                and     al, 1Fh
                mov     [di+4], al
                mov     ax, [si]
                add     ax, 2
                mov     dx, ds:mapWidth
                dec     dx
                sub     dx, ax
                jnb     short loc_A5E8
                not     dx
                mov     ax, dx

loc_A5E8:
                mov     [di], ax
                mov     al, [si+3]
                add     al, 2
                mov     [di+3], al
                mov     byte ptr [si+6], 16h
                mov     byte ptr [di+6], 17h
                jmp     short loc_A64C
; ---------------------------------------------------------------------------

loc_A5FC:
                mov     al, [bx+3]
                or      al, al
                jns     short loc_A606
                jmp     loc_A512
; ---------------------------------------------------------------------------

loc_A606:
                cmp     al, 3
                jnb     short loc_A60D
                jmp     loc_A512
; ---------------------------------------------------------------------------

loc_A60D:
                mov     ax, 27h ; '''
                call    sub_A679
                jnb     short loc_A618
                jmp     loc_A512
; ---------------------------------------------------------------------------

loc_A618:
                dec     si
                dec     si
                mov     cl, [si]
                mov     al, [bx+0Ah]
                or      al, 80h
                mov     [si], al
                xchg    si, bx
                mov     al, [si+4]
                and     al, 1Fh
                mov     [di+4], al
                mov     ax, [si]
                sub     ax, 2
                or      ax, ax
                jns     short loc_A63A
                add     ax, ds:mapWidth

loc_A63A:
                mov     [di], ax
                mov     al, [si+3]
                sub     al, 2
                mov     [di+3], al
                mov     byte ptr [si+6], 17h
                mov     byte ptr [di+6], 16h

loc_A64C:
                mov     al, [si+2]
                mov     [di+2], al
                mov     bl, [si+0Ah]
                xor     bh, bh
                mov     ds:proximity_second_layer[bx], cl
                mov     byte ptr [di+7], 0
                mov     byte ptr [di+8], 0
                mov     byte ptr [di+9], 0
                and     byte ptr [si+7], 0BFh
                mov     al, ds:monster_index
                cmp     al, [si+0Ah]
                jb      short loc_A674
                retn
; ---------------------------------------------------------------------------

loc_A674:
                or      byte ptr [di+9], 1
                retn
Monster_AI        endp


; =============== S U B R O U T I N E =======================================


sub_A679        proc near
                push    si
                sub     si, ax
                call    word ptr cs:wrap_map_from_below_proc
                mov     cx, 3

loc_A684:
                mov     al, [si]
                call    word ptr cs:is_blocking_proc
                stc
                jnz     short loc_A6AF
                mov     al, [si+1]
                call    word ptr cs:is_blocking_proc
                stc
                jnz     short loc_A6AF
                mov     al, [si+2]
                call    word ptr cs:is_blocking_proc
                stc
                jnz     short loc_A6AF
                add     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_above_proc
                loop    loc_A684
                clc

loc_A6AF:
                pop     si
                retn
sub_A679        endp

; ---------------------------------------------------------------------------

loc_A6B1:                               ; jumptable 0000A273 cases 2,3
                or      byte ptr [si+4], 20h
                test    byte ptr [si+9], 1
                jnz     short loc_A6DB
                mov     al, [si+3]
                cmp     al, 8
                jnb     short loc_A6C3
                retn
; ---------------------------------------------------------------------------

loc_A6C3:
                cmp     al, 13h
                jb      short loc_A6C8
                retn
; ---------------------------------------------------------------------------

loc_A6C8:                               ;
                call    word ptr cs:get_random_proc
                and     al, 3
                jz      short loc_A6D2
                retn
; ---------------------------------------------------------------------------

loc_A6D2:
                mov     byte ptr [si+6], 1
                or      byte ptr [si+9], 1
                retn
; ---------------------------------------------------------------------------

loc_A6DB:                               ;
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A6E3
                retn
; ---------------------------------------------------------------------------

loc_A6E3:
                and     byte ptr [si+7], 0F0h
                or      byte ptr [si+7], 1
                jmp     word ptr cs:Check_Vertical_Distance_Between_Hero_And_Monster_proc
; ---------------------------------------------------------------------------

loc_A6F0:                               ; jumptable 0000A273 case 4
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A6FA
                mov     byte ptr [si+8], 2

loc_A6FA:
                test    byte ptr [si+5], 20h
                jz      short loc_A705
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A705:
                cmp     byte ptr [si+3], 3
                jnb     short loc_A70C
                retn
; ---------------------------------------------------------------------------

loc_A70C:
                cmp     byte ptr [si+3], 21h ; '!'
                jb      short loc_A713
                retn
; ---------------------------------------------------------------------------

loc_A713:
                call    sub_A71C
                cmp     cl, 3
                jz      short sub_A71C
                retn

; =============== S U B R O U T I N E =======================================


sub_A71C        proc near
                mov     bx, offset unk_A7CE
                test    byte ptr [si+5], 80h
                jnz     short loc_A728
                mov     bx, offset unk_A756

loc_A728:
                mov     al, 0Fh
                mul     byte ptr [si+9]
                add     bx, ax
                mov     cx, 5

loc_A732:
                push    cx
                push    bx
                mov     al, [bx]
                call    word ptr cs:monster_move_in_direction_proc
                pop     bx
                pop     cx
                jnb     short loc_A749
                inc     bx
                inc     bx
                inc     bx
                loop    loc_A732
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A749:
                mov     al, [bx+1]
                mov     [si+9], al
                mov     al, [bx+2]
                mov     [si+6], al
                retn
sub_A71C        endp

; ---------------------------------------------------------------------------
unk_A756        db    6
                db    2
                db    1
                db    7
                db    1
                db    2
                db    0
                db    0
                db    0
                db    1
                db    7
                db    3
                db    2
                db    6
                db    1
                db    5
                db    3
                db    3
                db    6
                db    2
                db    1
                db    7
                db    1
                db    2
                db    0
                db    0
                db    0
                db    1
                db    7
                db    3
                db    4
                db    4
                db    0
                db    5
                db    3
                db    3
                db    6
                db    2
                db    1
                db    7
                db    1
                db    2
                db    0
                db    0
                db    0
                db    3
                db    5
                db    2
                db    4
                db    4
                db    0
                db    5
                db    3
                db    3
                db    6
                db    2
                db    1
                db    7
                db    1
                db    2
                db    2
                db    6
                db    1
                db    3
                db    5
                db    2
                db    4
                db    4
                db    0
                db    5
                db    3
                db    3
                db    6
                db    2
                db    1
                db    1
                db    7
                db    3
                db    2
                db    6
                db    1
                db    3
                db    5
                db    2
                db    4
                db    4
                db    0
                db    5
                db    3
                db    3
                db    0
                db    0
                db    0
                db    1
                db    7
                db    3
                db    2
                db    6
                db    1
                db    3
                db    5
                db    2
                db    4
                db    4
                db    0
                db    7
                db    1
                db    2
                db    0
                db    0
                db    0
                db    1
                db    7
                db    3
                db    2
                db    6
                db    1
                db    3
                db    5
                db    2
unk_A7CE        db    6
                db    6
                db    0
                db    5
                db    7
                db    3
                db    4
                db    0
                db    0
                db    3
                db    1
                db    2
                db    2
                db    2
                db    0
                db    5
                db    7
                db    2
                db    4
                db    0
                db    0
                db    3
                db    1
                db    2
                db    2
                db    2
                db    1
                db    1
                db    3
                db    2
                db    4
                db    0
                db    1
                db    3
                db    1
                db    2
                db    2
                db    2
                db    1
                db    1
                db    3
                db    3
                db    0
                db    4
                db    1
                db    3
                db    1
                db    3
                db    2
                db    2
                db    1
                db    1
                db    3
                db    3
                db    0
                db    4
                db    0
                db    7
                db    5
                db    3
                db    2
                db    2
                db    0
                db    1
                db    3
                db    3
                db    0
                db    4
                db    0
                db    7
                db    5
                db    2
                db    6
                db    6
                db    0
                db    1
                db    3
                db    2
                db    0
                db    4
                db    0
                db    7
                db    5
                db    2
                db    6
                db    6
                db    1
                db    5
                db    7
                db    2
                db    0
                db    4
                db    1
                db    7
                db    5
                db    2
                db    6
                db    6
                db    1
                db    5
                db    7
                db    3
                db    4
                db    0
                db    1
                db    7
                db    5
                db    3
                db    6
                db    6
                db    1
                db    5
                db    7
                db    3
                db    4
                db    0
                db    0
                db    3
                db    1
                db    3
eai4          ends


                end start