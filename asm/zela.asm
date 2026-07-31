include common.inc
include dungeon.inc
                .286
                .model small

zela          segment byte public 'CODE'
                assume cs:zela, ds:zela
                org 0A000h
start:
                dw offset Zela_AI_proc
                dw offset boss_x
                db    0
                db    0
                db    0
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
                db 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh
                db 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh
                ; A030
                dw offset byte_A03A
                dw offset byte_A08A
                dw offset byte_A0D0
                dw offset byte_A116
                dw offset byte_A166
byte_A03A       db 2, 1, 2, 3, 4
                db 2, 11h, 7, 12h, 13h
                db 2, 1Eh, 16h, 1Fh, 20h
                db 2, 5, 6, 7, 8
                db 2, 14h, 15h, 16h, 17h
                db 2, 21h, 22h, 23h, 24h
                db 2, 9, 0Ah, 0Bh, 0Ch
                db 2, 18h, 19h, 1Ah, 1Bh
                db 2, 25h, 26h, 27h, 1Dh
                db 2, 0Dh, 0Eh, 0Fh, 10h
                db 2, 1Ch, 10h, 1Dh, 10h
                db 2, 28h, 10h, 29h, 2Ah
                db 2, 18h, 2Bh, 1Ah, 2Ch
                db 2, 2Dh, 10h, 2Eh, 10h
                db 2, 11h, 7, 12h, 2Fh
                db 2, 30h, 15h, 31h, 17h
byte_A08A       db 2, 32h, 33h, 34h, 35h
                db 2, 41h, 42h, 43h, 44h
                db 2, 1Eh, 50h, 1Fh, 51h
                db 2, 36h, 37h, 38h, 39h
                db 2, 45h, 46h, 47h, 48h
                db 2, 52h, 53h, 54h, 24h
                db 2, 3Ah, 3Bh, 3Ch, 3Dh
                db 2, 49h, 4Ah, 4Bh, 4Ch
                db 2, 55h, 4Fh, 56h, 57h
                db 2, 3Eh, 0, 3Fh, 40h
                db 2, 4Dh, 4Eh, 4Fh, 10h
                db 2, 58h, 10h, 59h, 2Ah
                db 2, 49h, 5Ah, 4Bh, 5Bh
                db 2, 5Ch, 4Eh, 5Dh, 5Eh
byte_A0D0       db 2, 0, 32h, 5Fh, 60h
                db 2, 6Bh, 6Ch, 6Dh, 6Eh
                db 2, 79h, 7Ah, 7Bh, 7Ch
                db 2, 61h, 62h, 63h, 64h
                db 2, 6Fh, 70h, 71h, 72h
                db 2, 7Dh, 7Eh, 7Fh, 24h
                db 2, 65h, 66h, 67h, 68h
                db 2, 73h, 1Dh, 74h, 75h
                db 2, 80h, 4Fh, 81h, 59h
                db 2, 69h, 0, 6Ah, 0
                db 2, 76h, 77h, 4Fh, 78h
                db 2, 82h, 10h, 59h, 2Ah
                db 2, 73h, 83h, 74h, 84h
                db 2, 76h, 77h, 4Fh, 78h
byte_A116       db 2, 0, 85h, 86h, 87h
                db 2, 93h, 94h, 95h, 96h
                db 2, 1Eh, 0A1h, 0A2h, 0A3h
                db 2, 88h, 89h, 8Ah, 8Bh
                db 2, 97h, 98h, 99h, 9Ah
                db 2, 0A4h, 0A5h, 0A6h, 0A7h
                db 2, 8Ch, 8Dh, 8Eh, 67h
                db 2, 9Bh, 9Ch, 9Dh, 9Eh
                db 2, 25h, 26h, 27h, 1Dh
                db 2, 8Fh, 90h, 91h, 92h
                db 2, 1Dh, 9Fh, 0A0h, 10h
                db 2, 28h, 10h, 29h, 2Ah
                db 2, 0, 0, 0, 0
                db 2, 0, 0, 0, 0
                db 2, 93h, 0A8h, 95h, 0A9h
                db 2, 0AAh, 0ABh, 0ACh, 0ADh
byte_A166       db 2, 0, 0AEh, 0, 0AFh
                db 2, 0BBh, 0BCh, 0BDh, 0BEh
                db 2, 1Eh, 0CAh, 0A2h, 0CBh
                db 2, 0B0h, 0B1h, 0B2h, 0B3h
                db 2, 0BFh, 0C0h, 0C1h, 0C2h
                db 2, 0CCh, 0CDh, 0CEh, 0CFh
                db 2, 0B4h, 0B5h, 0B6h, 0B7h
                db 2, 0C3h, 0C4h, 0C5h, 0C6h
                db 2, 0D0h, 0D1h, 0D2h, 0D3h
                db 2, 0B8h, 0, 0B9h, 0BAh
                db 2, 0C7h, 0C8h, 4Fh, 0C9h
                db 2, 0D4h, 10h, 1Dh, 2Ah
                db 2, 0, 0, 0, 0
                db 2, 0, 0, 0, 0
                db 2, 0BBh, 0BCh, 0BDh, 0BEh
                db 2, 0BFh, 0D5h, 0C1h, 0D6h

; =============== S U B R O U T I N E =======================================


Zela_AI_proc    proc near

                mov     si, ds:monsters_table_addr
                mov     byte_A60A, 0
                mov     byte_A60C, 0

loc_A1C4:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A207
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A1FE
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A60A
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte ptr [si+5], 40h
                jz      short loc_A1FE
                test    byte_A60C, 80h
                jnz     short loc_A1FE
                mov     al, [si+5]
                and     al, 1Fh
                mov     byte_A60C, al

loc_A1FE:
                inc     byte_A60A
                add     si, 10h
                jmp     short loc_A1C4
; ---------------------------------------------------------------------------

loc_A207:                               ;
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                test    byte_A60C, 0FFh
                jz      short loc_A263
                mov     al, byte_A60C
                push    ax
                and     al, 1Fh
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                pop     ax
                shr     bl, 1
                xor     bh, bh
                cmp     al, 4
                jnz     short loc_A237
                add     bx, bx
                add     bx, bx
                mov     byte ptr ds:soundFX_request, 36
                jmp     short loc_A23C
; ---------------------------------------------------------------------------

loc_A237:                               ;
                mov     byte ptr ds:soundFX_request, 37

loc_A23C:
                call    sub_A56C
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 0Fh
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A24E
                xchg    ax, bx

loc_A24E:
                mov     ax, boss_x
                sub     ax, bx
                jnb     short loc_A25D
                call    sub_A543
                call    sub_A543
                jmp     short loc_A263
; ---------------------------------------------------------------------------

loc_A25D:
                call    sub_A534
                call    sub_A534

loc_A263:
                test    byte_A604, 0FFh
                jz      short loc_A26D
                jmp     loc_A371
; ---------------------------------------------------------------------------

loc_A26D:
                test    byte_A605, 0FFh
                jnz     short loc_A2BE
                call    word ptr cs:get_random_proc
                and     al, 0Fh
                jz      short loc_A280
                jmp     loc_A371
; ---------------------------------------------------------------------------

loc_A280:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A28A
                jmp     loc_A371
; ---------------------------------------------------------------------------

loc_A28A:
                mov     byte_A605, 0FFh
                mov     byte_A607, 0FFh
                mov     byte_A606, 0FFh
                mov     byte_A608, 0
                mov     byte_A609, 0
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 0Eh
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A2B2
                xchg    ax, bx

loc_A2B2:
                mov     ax, boss_x
                sub     ax, bx
                jnb     short loc_A2BE
                mov     byte_A606, 0

loc_A2BE:
                add     byte_A603, 2
                and     byte_A603, 6
                test    byte_A607, 0FFh
                jz      short loc_A2F4
                inc     byte_A609
                and     byte_A609, 3
                jz      short loc_A2DD
                jmp     loc_A3C8
; ---------------------------------------------------------------------------

loc_A2DD:
                mov     byte_A607, 0
                test    byte_A605, 80h
                jz      short loc_A2EC
                jmp     loc_A3C8
; ---------------------------------------------------------------------------

loc_A2EC:
                mov     byte_A605, 0
                jmp     loc_A3C8
; ---------------------------------------------------------------------------

loc_A2F4:
                mov     bl, byte_A608
                inc     byte_A608
                xor     bh, bh
                add     bx, bx
                call    funcs_A300[bx]
                jmp     loc_A3C8
Zela_AI_proc    endp

; ---------------------------------------------------------------------------
funcs_A300      dw offset move_boss_N
                dw offset sub_A33E
                dw offset sub_A33E
                dw offset sub_A33E
                dw offset loc_A348
                dw offset loc_A348
                dw offset sub_A343
                dw offset sub_A343
                dw offset sub_A343
                dw offset sub_A31B

; =============== S U B R O U T I N E =======================================


sub_A31B        proc near
                mov     byte_A605, 7Fh
                mov     byte_A607, 7Fh
                mov     byte_A60F, 0
sub_A31B        endp


; =============== S U B R O U T I N E =======================================


move_boss_S     proc near
                inc     boss_y
                and     boss_y, 3Fh
                retn
move_boss_S     endp


; =============== S U B R O U T I N E =======================================


move_boss_N     proc near
                dec     boss_y
                and     boss_y, 3Fh
                retn
move_boss_N     endp


; =============== S U B R O U T I N E =======================================


sub_A33E        proc near

                call    move_boss_N
                jmp     short loc_A348
sub_A33E        endp


; =============== S U B R O U T I N E =======================================


sub_A343        proc near

                call    move_boss_S
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_A348:
                test    byte_A60F, 0FFh
                jz      short loc_A350
                retn
; ---------------------------------------------------------------------------

loc_A350:
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 12
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A35F
                xchg    ax, bx

loc_A35F:
                mov     ax, boss_x
                sub     ax, bx
                jnz     short loc_A367
                retn
; ---------------------------------------------------------------------------

loc_A367:
                pop     ax
                test    byte_A606, 0FFh
                jnz     short loc_A3AB
                jmp     short loc_A3BE
sub_A343        endp ; sp-analysis failed

; ---------------------------------------------------------------------------

loc_A371:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A37B
                jmp     loc_A59A
; ---------------------------------------------------------------------------

loc_A37B:
                dec     byte_A60B
                jnz     short loc_A38F
                mov     byte_A60B, 2
                inc     byte_A603
                and     byte_A603, 7

loc_A38F:                               ;
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 18
                mov     bx, ax
                sub     ax, ds:mapWidth
                jnb     short loc_A39E
                xchg    ax, bx

loc_A39E:
                sub     ax, boss_x
                jnb     short loc_A3B7
                test    byte_A603, 0FFh
                jnz     short loc_A3C8

loc_A3AB:
                call    sub_A543
                jnb     short loc_A3C8
                mov     byte_A60F, 0FFh
                jmp     short loc_A3C8
; ---------------------------------------------------------------------------

loc_A3B7:
                cmp     byte_A603, 4
                jnz     short loc_A3C8

loc_A3BE:
                call    sub_A534
                jnb     short loc_A3C8
                mov     byte_A60F, 0FFh

loc_A3C8:
                mov     bl, byte_A603
                xor     bh, bh
                mov     dl, byte_A4EA[bx]
                xor     dh, dh
                mov     di, offset word_A610
                mov     cx, 12

loc_A3DA:
                mov     [di], dx
                add     di, 2
                inc     dh
                loop    loc_A3DA
                test    byte_A605, 0FFh
                jnz     short loc_A467
                test    byte_A604, 0FFh
                jz      short loc_A3FA
                cmp     byte_A604, 1
                jz      short loc_A453
                jmp     short loc_A431
; ---------------------------------------------------------------------------

loc_A3FA:                               ;
                call    word ptr cs:get_random_proc
                and     al, 1
                jnz     short loc_A467
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 18
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A412
                xchg    ax, bx

loc_A412:
                mov     ax, boss_x
                sub     ax, bx
                jnb     short loc_A447
                dec     bx
                dec     bx
                mov     ax, boss_x
                add     ax, 7
                sub     ax, bx
                jnb     short loc_A467
                cmp     byte_A603, 6
                jnz     short loc_A467
                mov     byte_A604, 2

loc_A431:
                mov     byte_A61F, 0Ch
                mov     byte_A625, 0Dh
                test    byte_A603, 0FFh
                jnz     short loc_A445
                call    sub_A4F2

loc_A445:
                jmp     short loc_A467
; ---------------------------------------------------------------------------

loc_A447:
                cmp     byte_A603, 2
                jnz     short loc_A467
                mov     byte_A604, 1

loc_A453:
                mov     byte_A613, 0Eh
                mov     byte_A619, 0Fh
                cmp     byte_A603, 4
                jnz     short loc_A467
                call    sub_A4F2

loc_A467:
                mov     byte_A60A, 0
                mov     di, offset word_A610
                mov     si, ds:monsters_table_addr
                mov     ax, boss_x
                mov     cx, 4

loc_A479:
                push    cx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_A60D, bl
                jnb     short loc_A48C
                add     di, 6
                jmp     short loc_A4E0
; ---------------------------------------------------------------------------

loc_A48C:
                mov     bl, boss_y
                mov     cx, 3

loc_A493:
                push    cx
                mov     [si], ax
                mov     [si+2], bl
                mov     dl, byte_A60D
                mov     [si+3], dl
                mov     dl, [di]
                mov     [si+4], dl
                mov     byte ptr [si+5], 0
                mov     dl, [di+1]
                mov     [si+6], dl
                add     di, 2
                push    ax
                push    bx
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A60A
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                inc     byte_A60A
                pop     di
                pop     bx
                pop     ax
                add     bl, 2
                and     bl, 3Fh
                pop     cx
                loop    loc_A493

loc_A4E0:
                inc     ax
                inc     ax
                pop     cx
                loop    loc_A479
                mov     word ptr [si], 0FFFFh
                retn
; ---------------------------------------------------------------------------
byte_A4EA       db 2, 1, 0, 3, 4, 3, 0, 1

; =============== S U B R O U T I N E =======================================


sub_A4F2        proc near
                mov     al, boss_y
                add     al, 3
                and     al, 3Fh
                mov     byte_A560, al
                mov     byte_A553, al
                mov     ax, boss_x
                inc     ax
                call    word ptr cs:is_in_proximity_window_proc
                mov     byte_A552, bl
                mov     ax, boss_x
                add     ax, 7
                call    word ptr cs:is_in_proximity_window_proc
                mov     byte_A55F, bl
                mov     al, byte_A604
                dec     al
                mov     cl, 0Dh
                mul     cl
                add     ax, offset byte_A552
                mov     bx, ax
                call    word ptr cs:Add_Projectile_To_Array_proc
                mov     byte_A604, 0
                retn
sub_A4F2        endp


; =============== S U B R O U T I N E =======================================


sub_A534        proc near
                cmp     byte ptr boss_x, 50
                stc
                jnz     short loc_A53D
                retn
; ---------------------------------------------------------------------------

loc_A53D:
                inc     byte ptr boss_x
                clc
                retn
sub_A534        endp


; =============== S U B R O U T I N E =======================================


sub_A543        proc near
                cmp     byte ptr boss_x, 17
                stc
                jnz     short loc_A54C
                retn
; ---------------------------------------------------------------------------

loc_A54C:
                dec     byte ptr boss_x
                clc
                retn
sub_A543        endp

; ---------------------------------------------------------------------------
byte_A552       db 0
byte_A553       db 0
                db  15h
                db    0
                db  32h ; 2
                db    4
                db  50h ; P
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A55F       db 0
byte_A560       db 0
                db  14h
                db    0
                db  32h ; 2
                db    0
                db  50h ; P
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0

; =============== S U B R O U T I N E =======================================


sub_A56C        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_A575
                xor     ax, ax

loc_A575:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_A586
                retn
; ---------------------------------------------------------------------------

loc_A586:
                mov     byte ptr ds:boss_being_hit, 0FFh
                mov     byte_A60E, 0
                mov     byte_A604, 0
                jmp     word ptr cs:Browse_Projectiles_proc
sub_A56C        endp

; ---------------------------------------------------------------------------

loc_A59A:
                cmp     byte_A60E, 28h ; '('
                jnb     short loc_A5E8
                mov     byte ptr ds:sprite_flash_flag, 0FFh
                inc     byte_A60E
                cmp     byte_A60E, 15h
                jnb     short loc_A5E1
                test    byte_A60E, 3
                jnz     short loc_A5BD
                mov     byte ptr ds:soundFX_request, 40

loc_A5BD:
                inc     byte_A603
                and     byte_A603, 7

loc_A5C6:
                mov     bx, offset byte_A4EA
                mov     al, byte_A603
                xlat
                xor     ah, ah
                mov     di, offset word_A610
                mov     cx, 0Ch

loc_A5D5:
                mov     [di], ax
                add     di, 2
                inc     ah
                loop    loc_A5D5
                jmp     loc_A467
; ---------------------------------------------------------------------------

loc_A5E1:
                mov     byte_A603, 2
                jmp     short loc_A5C6
; ---------------------------------------------------------------------------

loc_A5E8:
                mov     byte ptr ds:boss_is_dead, 0FFh
                retn
; ---------------------------------------------------------------------------
boss_state_block:
boss_x          dw 48
boss_y          db 12
boss_hp         dw 500
xp_reward       dw 1000
arena_center_x  db 12
boss_placement  db 0
                dw offset name_screen_x
almas_reward    dw 600
name_screen_x   db  12h
name_screen_y   db 0BBh
                db    0
aAgar           db 4,'Agar'
byte_A603       db 0
byte_A604       db 0
byte_A605       db 0
byte_A606       db 0
byte_A607       db 0
byte_A608       db 0
byte_A609       db 0
byte_A60A       db 0
byte_A60B       db 2
byte_A60C       db 0
byte_A60D       db 0
byte_A60E       db 0
byte_A60F       db 0
word_A610       dw 0
                db    0
byte_A613       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A619       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A61F       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A625       db 0
                db    0
                db    0
zela          ends


                end start