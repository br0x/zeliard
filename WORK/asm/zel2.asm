include common.inc
include dungeon.inc
                .286
                .model small

zel2          segment byte public 'CODE'
                assume cs:zel2, ds:zel2
                org 0A000h
start:
                dw offset Zel2_AI_proc
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
                db 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
                db 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
                ; A030
                dw offset byte_A03A
                dw offset byte_A08A
                dw offset byte_A0D0
                dw offset byte_A116
                dw offset byte_A166
byte_A03A       db 0, 1, 2, 3, 4
                db 0, 11h, 7, 12h, 13h
                db 0, 1Eh, 16h, 1Fh, 20h
                db 0, 5, 6, 7, 8
                db 0, 14h, 15h, 16h, 17h
                db 0, 21h, 22h, 23h, 24h
                db 0, 9, 0Ah, 0Bh, 0Ch
                db 0, 18h, 19h, 1Ah, 1Bh
                db 0, 25h, 26h, 27h, 1Dh
                db 0, 0Dh, 0Eh, 0Fh, 10h
                db 0, 1Ch, 10h, 1Dh, 10h
                db 0, 28h, 10h, 29h, 2Ah
                db 0, 18h, 2Bh, 1Ah, 2Ch
                db 0, 2Dh, 10h, 2Eh, 10h
                db 0, 11h, 7, 12h, 2Fh
                db 0, 30h, 15h, 31h, 17h
byte_A08A       db 0, 32h, 33h, 34h, 35h
                db 0, 41h, 42h, 43h, 44h
                db 0, 1Eh, 50h, 1Fh, 51h
                db 0, 36h, 37h, 38h, 39h
                db 0, 45h, 46h, 47h, 48h
                db 0, 52h, 53h, 54h, 24h
                db 0, 3Ah, 3Bh, 3Ch, 3Dh
                db 0, 49h, 4Ah, 4Bh, 4Ch
                db 0, 55h, 4Fh, 56h, 57h
                db 0, 3Eh, 0, 3Fh, 40h
                db 0, 4Dh, 4Eh, 4Fh, 10h
                db 0, 58h, 10h, 59h, 2Ah
                db 0, 49h, 5Ah, 4Bh, 5Bh
                db 0, 5Ch, 4Eh, 5Dh, 5Eh
byte_A0D0       db 0, 0, 32h, 5Fh, 60h
                db 0, 6Bh, 6Ch, 6Dh, 6Eh
                db 0, 79h, 7Ah, 7Bh, 7Ch
                db 0, 61h, 62h, 63h, 64h
                db 0, 6Fh, 70h, 71h, 72h
                db 0, 7Dh, 7Eh, 7Fh, 24h
                db 0, 65h, 66h, 67h, 68h
                db 0, 73h, 1Dh, 74h, 75h
                db 0, 80h, 4Fh, 81h, 59h
                db 0, 69h, 0, 6Ah, 0
                db 0, 76h, 77h, 4Fh, 78h
                db 0, 82h, 10h, 59h, 2Ah
                db 0, 73h, 83h, 74h, 84h
                db 0, 76h, 77h, 4Fh, 78h
byte_A116       db 0, 0, 85h, 86h, 87h
                db 0, 93h, 94h, 95h, 96h
                db 0, 1Eh, 0A1h, 0A2h, 0A3h
                db 0, 88h, 89h, 8Ah, 8Bh
                db 0, 97h, 98h, 99h, 9Ah
                db 0, 0A4h, 0A5h, 0A6h, 0A7h
                db 0, 8Ch, 8Dh, 8Eh, 67h
                db 0, 9Bh, 9Ch, 9Dh, 9Eh
                db 0, 25h, 26h, 27h, 1Dh
                db 0, 8Fh, 90h, 91h, 92h
                db 0, 1Dh, 9Fh, 0A0h, 10h
                db 0, 28h, 10h, 29h, 2Ah
                db 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0
                db 0, 93h, 0A8h, 95h, 0A9h
                db 0, 0AAh, 0ABh, 0ACh, 0ADh
byte_A166       db 0, 0, 0AEh, 0, 0AFh
                db 0, 0BBh, 0BCh, 0BDh, 0BEh
                db 0, 1Eh, 0CAh, 0A2h, 0CBh
                db 0, 0B0h, 0B1h, 0B2h, 0B3h
                db 0, 0BFh, 0C0h, 0C1h, 0C2h
                db 0, 0CCh, 0CDh, 0CEh, 0CFh
                db 0, 0B4h, 0B5h, 0B6h, 0B7h
                db 0, 0C3h, 0C4h, 0C5h, 0C6h
                db 0, 0D0h, 0D1h, 0D2h, 0D3h
                db 0, 0B8h, 0, 0B9h, 0BAh
                db 0, 0C7h, 0C8h, 4Fh, 0C9h
                db 0, 0D4h, 10h, 1Dh, 2Ah
                db 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0
                db 0, 0BBh, 0BCh, 0BDh, 0BEh
                db 0, 0BFh, 0D5h, 0C1h, 0D6h

; =============== S U B R O U T I N E =======================================


Zel2_AI_proc        proc near
                mov     si, ds:monsters_table_addr
                mov     byte_A5FD, 0
                mov     byte_A5FF, 0

loc_A1C4:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A207
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A1FE
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A5FD
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte ptr [si+5], 40h
                jz      short loc_A1FE
                test    byte_A5FF, 80h
                jnz     short loc_A1FE
                mov     al, [si+5]
                and     al, 1Fh
                mov     byte_A5FF, al

loc_A1FE:
                inc     byte_A5FD
                add     si, 10h
                jmp     short loc_A1C4
; ---------------------------------------------------------------------------

loc_A207:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                test    byte_A5FF, 0FFh
                jz      short loc_A254
                mov     al, byte_A5FF
                push    ax
                and     al, 1Fh
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                pop     ax
                shr     bl, 1
                xor     bh, bh
                mov     byte ptr ds:soundFX_request, 36
                call    sub_A55D
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 0Fh
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A23F
                xchg    ax, bx

loc_A23F:
                mov     ax, boss_x
                sub     ax, bx
                jnb     short loc_A24E
                call    sub_A534
                call    sub_A534
                jmp     short loc_A254
; ---------------------------------------------------------------------------

loc_A24E:
                call    sub_A525
                call    sub_A525

loc_A254:
                test    byte_A5F7, 0FFh
                jz      short loc_A25E
                jmp     loc_A362
; ---------------------------------------------------------------------------

loc_A25E:
                test    byte_A5F8, 0FFh
                jnz     short loc_A2AF
                call    word ptr cs:get_random_proc
                and     al, 0Fh
                jz      short loc_A271
                jmp     loc_A362
; ---------------------------------------------------------------------------

loc_A271:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A27B
                jmp     loc_A362
; ---------------------------------------------------------------------------

loc_A27B:
                mov     byte_A5F8, 0FFh
                mov     byte_A5FA, 0FFh
                mov     byte_A5F9, 0FFh
                mov     byte_A5FB, 0
                mov     byte_A5FC, 0
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 0Eh
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A2A3
                xchg    ax, bx

loc_A2A3:
                mov     ax, boss_x
                sub     ax, bx
                jnb     short loc_A2AF
                mov     byte_A5F9, 0

loc_A2AF:
                add     byte_A5F6, 2
                and     byte_A5F6, 6
                test    byte_A5FA, 0FFh
                jz      short loc_A2E5
                inc     byte_A5FC
                and     byte_A5FC, 3
                jz      short loc_A2CE
                jmp     loc_A3B9
; ---------------------------------------------------------------------------

loc_A2CE:
                mov     byte_A5FA, 0
                test    byte_A5F8, 80h
                jz      short loc_A2DD
                jmp     loc_A3B9
; ---------------------------------------------------------------------------

loc_A2DD:
                mov     byte_A5F8, 0
                jmp     loc_A3B9
; ---------------------------------------------------------------------------

loc_A2E5:
                mov     bl, byte_A5FB
                inc     byte_A5FB
                xor     bh, bh
                add     bx, bx
                call    funcs_A2F1[bx]
                jmp     loc_A3B9
Zel2_AI_proc        endp

; ---------------------------------------------------------------------------
funcs_A2F1      dw offset sub_A325
                dw offset sub_A32F
                dw offset sub_A32F
                dw offset sub_A32F
                dw offset sub_A339
                dw offset sub_A339
                dw offset sub_A334
                dw offset sub_A334
                dw offset sub_A334
                dw offset sub_A30C

; =============== S U B R O U T I N E =======================================


sub_A30C        proc near
                mov     byte_A5F8, 7Fh
                mov     byte_A5FA, 7Fh
                mov     byte_A602, 0
sub_A30C        endp


; =============== S U B R O U T I N E =======================================


sub_A31B        proc near
                inc     boss_y
                and     boss_y, 3Fh
                retn
sub_A31B        endp


; =============== S U B R O U T I N E =======================================


sub_A325        proc near
                dec     boss_y
                and     boss_y, 3Fh
                retn
sub_A325        endp


; =============== S U B R O U T I N E =======================================


sub_A32F        proc near
                call    sub_A325
                jmp     short sub_A339
sub_A32F        endp


; =============== S U B R O U T I N E =======================================


sub_A334        proc near
                call    sub_A31B
                jmp     short $+2
sub_A334        endp


; =============== S U B R O U T I N E =======================================


sub_A339        proc near

                test    byte_A602, 0FFh
                jz      short loc_A341
                retn
; ---------------------------------------------------------------------------

loc_A341:
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 12
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A350
                xchg    ax, bx

loc_A350:
                mov     ax, boss_x
                sub     ax, bx
                jnz     short loc_A358
                retn
; ---------------------------------------------------------------------------

loc_A358:
                pop     ax
                test    byte_A5F9, 0FFh
                jnz     short loc_A39C
                jmp     short loc_A3AF
; ---------------------------------------------------------------------------

loc_A362:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A36C
                jmp     loc_A58B
; ---------------------------------------------------------------------------

loc_A36C:
                dec     byte_A5FE
                jnz     short loc_A380
                mov     byte_A5FE, 2
                inc     byte_A5F6
                and     byte_A5F6, 7

loc_A380:
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 18
                mov     bx, ax
                sub     ax, ds:mapWidth
                jnb     short loc_A38F
                xchg    ax, bx

loc_A38F:
                sub     ax, boss_x
                jnb     short loc_A3A8
                test    byte_A5F6, 0FFh
                jnz     short loc_A3B9

loc_A39C:
                call    sub_A534
                jnb     short loc_A3B9
                mov     byte_A602, 0FFh
                jmp     short loc_A3B9
; ---------------------------------------------------------------------------

loc_A3A8:
                cmp     byte_A5F6, 4
                jnz     short loc_A3B9

loc_A3AF:
                call    sub_A525
                jnb     short loc_A3B9
                mov     byte_A602, 0FFh

loc_A3B9:
                mov     bl, byte_A5F6
                xor     bh, bh
                mov     dl, byte_A4DB[bx]
                xor     dh, dh
                mov     di, offset unk_A603
                mov     cx, 12

loc_A3CB:
                mov     [di], dx
                add     di, 2
                inc     dh
                loop    loc_A3CB
                test    byte_A5F8, 0FFh
                jnz     short loc_A458
                test    byte_A5F7, 0FFh
                jz      short loc_A3EB
                cmp     byte_A5F7, 1
                jz      short loc_A444
                jmp     short loc_A422
; ---------------------------------------------------------------------------

loc_A3EB:
                call    word ptr cs:get_random_proc
                and     al, 1
                jnz     short loc_A458
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 18
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A403
                xchg    ax, bx

loc_A403:
                mov     ax, boss_x
                sub     ax, bx
                jnb     short loc_A438
                dec     bx
                dec     bx
                mov     ax, boss_x
                add     ax, 7
                sub     ax, bx
                jnb     short loc_A458
                cmp     byte_A5F6, 6
                jnz     short loc_A458
                mov     byte_A5F7, 2

loc_A422:
                mov     byte_A612, 0Ch
                mov     byte_A618, 0Dh
                test    byte_A5F6, 0FFh
                jnz     short loc_A436
                call    sub_A4E3

loc_A436:
                jmp     short loc_A458
; ---------------------------------------------------------------------------

loc_A438:
                cmp     byte_A5F6, 2
                jnz     short loc_A458
                mov     byte_A5F7, 1

loc_A444:
                mov     byte_A606, 0Eh
                mov     byte_A60C, 0Fh
                cmp     byte_A5F6, 4
                jnz     short loc_A458
                call    sub_A4E3

loc_A458:
                mov     byte_A5FD, 0
                mov     di, offset unk_A603
                mov     si, ds:monsters_table_addr
                mov     ax, boss_x
                mov     cx, 4

loc_A46A:
                push    cx
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_A600, bl
                jnb     short loc_A47D
                add     di, 6
                jmp     short loc_A4D1
; ---------------------------------------------------------------------------

loc_A47D:
                mov     bl, boss_y
                mov     cx, 3

loc_A484:
                push    cx
                mov     [si], ax
                mov     [si+2], bl
                mov     dl, byte_A600
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
                mov     bl, byte_A5FD
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                inc     byte_A5FD
                pop     di
                pop     bx
                pop     ax
                add     bl, 2
                and     bl, 3Fh
                pop     cx
                loop    loc_A484

loc_A4D1:
                inc     ax
                inc     ax
                pop     cx
                loop    loc_A46A
                mov     word ptr [si], 0FFFFh
                retn
sub_A339        endp ; sp-analysis failed

; ---------------------------------------------------------------------------
byte_A4DB       db 2, 1, 0, 3, 4, 3, 0, 1

; =============== S U B R O U T I N E =======================================


sub_A4E3        proc near
                mov     al, boss_y
                add     al, 3
                and     al, 3Fh
                mov     byte_A551, al
                mov     byte_A544, al
                mov     ax, boss_x
                inc     ax
                call    word ptr cs:is_in_proximity_window_proc
                mov     byte_A543, bl
                mov     ax, boss_x
                add     ax, 7
                call    word ptr cs:is_in_proximity_window_proc
                mov     byte_A550, bl
                mov     al, byte_A5F7
                dec     al
                mov     cl, 0Dh
                mul     cl
                add     ax, offset byte_A543
                mov     bx, ax
                call    word ptr cs:Add_Projectile_To_Array_proc
                mov     byte_A5F7, 0
                retn
sub_A4E3        endp


; =============== S U B R O U T I N E =======================================


sub_A525        proc near
                cmp     byte ptr boss_x, 50
                stc
                jnz     short loc_A52E
                retn
; ---------------------------------------------------------------------------

loc_A52E:
                inc     byte ptr boss_x
                clc
                retn
sub_A525        endp


; =============== S U B R O U T I N E =======================================


sub_A534        proc near
                cmp     byte ptr boss_x, 17
                stc
                jnz     short loc_A53D
                retn
; ---------------------------------------------------------------------------

loc_A53D:
                dec     byte ptr boss_x
                clc
                retn
sub_A534        endp

; ---------------------------------------------------------------------------
byte_A543       db 0
byte_A544       db 0
                db    5
                db    0
                db  50 ; p_max_step_count
                db    4
                db  120 ; p_damage
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A550       db 0
byte_A551       db 0
                db    4
                db    0
                db  50 ; p_max_step_count
                db    0
                db  120 ; p_damage
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0

; =============== S U B R O U T I N E =======================================


sub_A55D        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_A566
                xor     ax, ax

loc_A566:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_A577
                retn
; ---------------------------------------------------------------------------

loc_A577:
                mov     byte ptr ds:boss_being_hit, 0FFh
                mov     byte_A601, 0
                mov     byte_A5F7, 0
                jmp     word ptr cs:Browse_Projectiles_proc
sub_A55D        endp

; ---------------------------------------------------------------------------

loc_A58B:
                cmp     byte_A601, 28h ; '('
                jnb     short loc_A5D9
                mov     byte ptr ds:sprite_flash_flag, 0FFh
                inc     byte_A601
                cmp     byte_A601, 15h
                jnb     short loc_A5D2
                test    byte_A601, 3
                jnz     short loc_A5AE
                mov     byte ptr ds:soundFX_request, 40

loc_A5AE:
                inc     byte_A5F6
                and     byte_A5F6, 7

loc_A5B7:
                mov     bx, offset byte_A4DB
                mov     al, byte_A5F6
                xlat
                xor     ah, ah
                mov     di, offset unk_A603
                mov     cx, 0Ch

loc_A5C6:
                mov     [di], ax
                add     di, 2
                inc     ah
                loop    loc_A5C6
                jmp     loc_A458
; ---------------------------------------------------------------------------

loc_A5D2:
                mov     byte_A5F6, 2
                jmp     short loc_A5B7
; ---------------------------------------------------------------------------

loc_A5D9:
                mov     byte ptr ds:boss_is_dead, 0FFh
                retn
; ---------------------------------------------------------------------------
boss_state_block:
boss_x          dw 48
boss_y          db 12
boss_hp         dw 600
xp_reward       dw 3000
arena_center_x  db 12
boss_placement  db 0
                dw offset name_screen_x
                dw 1600
name_screen_x   db  11h
                db 0BBh
                db    0
aPaguro         db 6,'Paguro'
byte_A5F6       db 0
byte_A5F7       db 0
byte_A5F8       db 0
byte_A5F9       db 0
byte_A5FA       db 0
byte_A5FB       db 0
byte_A5FC       db 0
byte_A5FD       db 0
byte_A5FE       db 2
byte_A5FF       db 0
byte_A600       db 0
byte_A601       db 0
byte_A602       db 0
unk_A603        db    0
                db    0
                db    0
byte_A606       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A60C       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A612       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A618       db 0
                db    0
                db    0

zel2          ends

                end start
                
