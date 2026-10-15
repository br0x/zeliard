include common.inc
include dungeon.inc
                .286
                .model small

seg000          segment byte public 'CODE'
                assume cs:seg000, ds:seg000
                org 0A000h
start:
                dw offset Monster_AI
                db    0
                db    0
                db    0
                db    0
                dw offset death_descriptors
monster_xp      db 100, 100, 50, 50, 0, 0, 0, 0
monster_damage  db 80, 80, 40, 40, 80, 0, 0, 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
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
                dw offset woman_top_left ; 0..15
                dw offset woman_bottom_left ; 35..50
                dw offset ghost_left ; 70..85
                dw offset chicken_left ; 105..112
                dw offset destructible_wall ; 124..127
                dw 0
                dw 0
                dw 0
                dw offset woman_top_death ; 32..34
                dw offset woman_bottom_death ; 67..69
                dw offset ghost_death ; 102..104
                dw offset chicken_death ; 121..123
                dw offset falling_ceiling ; 128..130
                dw 0
                dw 0
                dw 0
                dw offset dropping_floor ; 157..160
                dw offset dropping_floor ; 157..160
                dw offset hit ; 131..133
                dw offset chest ; 146..153
                dw offset red_alma ; 134..137
                dw offset blue_alma ; 138..141
                dw offset ordinary_key ; 154
                dw 0
                dw offset red_potion ; 155
                dw offset blue_potion ; 156
                dw offset silkarn_shoe ; 161
                dw offset rare_alma ; 142..145
                dw 0
                dw 0
                dw offset feruza_shoe ; 162
                dw 0
                ; A070
                dw offset woman_top_right ; 16..31
                dw offset woman_bottom_right ; 51..66
                dw offset ghost_right ; 86..101
                dw offset chicken_right ; 113..120
                dw offset destructible_wall ; 124..127
                dw 0
                dw 0
                dw 0
                dw offset woman_top_death ; 32..34
                dw offset woman_bottom_death ; 67..69
                dw offset ghost_death ; 102..104
                dw offset chicken_death ; 121..123
                dw offset falling_ceiling ; 128..130
                dw 0
                dw 0
                dw 0
                dw offset dropping_floor ; 157..160
                dw offset dropping_floor ; 157..160
                dw offset hit ; 131..133
                dw offset chest ; 146..153
                dw offset red_alma ; 134..137
                dw offset blue_alma ; 138..141
                dw offset ordinary_key ; 154
                dw 0
                dw offset red_potion ; 155
                dw offset blue_potion ; 156
                dw offset silkarn_shoe ; 161
                dw offset rare_alma ; 142..145
                dw 0
                dw 0
                dw offset feruza_shoe ; 162
                dw 0
woman_top_left       db 0, 1, 2, 3, 4        ; 0
                db 0, 0, 0, 0, 0
                db 0, 1, 2, 3, 4
                db 0, 0, 0, 0, 0
                db 0, 1, 2, 3, 4
                db 0, 1, 2, 12h, 4
                db 0, 1, 2, 13h, 4
                db 0, 1, 2, 14h, 4
                db 0, 1, 2, 15h, 4
                db 0, 1, 2, 14h, 4
                db 0, 1, 2, 13h, 4
                db 0, 1, 2, 12h, 4
                db 0, 0, 0, 0, 0
                db 0, 1, 2, 3, 4
                db 0, 0, 0, 0, 0
                db 0, 1, 2, 3, 4         ; 15
woman_top_right       db 0, 9, 0Ah, 0Bh, 0Ch   ; 16
                db 0, 0, 0, 0, 0
                db 0, 9, 0Ah, 0Bh, 0Ch
                db 0, 0, 0, 0, 0
                db 0, 9, 0Ah, 0Bh, 0Ch
                db 0, 9, 0Ah, 0Bh, 17h
                db 0, 9, 0Ah, 0Bh, 18h
                db 0, 9, 0Ah, 0Bh, 19h
                db 0, 9, 0Ah, 0Bh, 1Ah
                db 0, 9, 0Ah, 0Bh, 19h
                db 0, 9, 0Ah, 0Bh, 18h
                db 0, 9, 0Ah, 0Bh, 17h
                db 0, 0, 0, 0, 0
                db 0, 9, 0Ah, 0Bh, 0Ch
                db 0, 0, 0, 0, 0
                db 0, 9, 0Ah, 0Bh, 0Ch   ; 31
woman_top_death       db 0, 1Bh, 1Ch, 1Dh, 1Eh ; 32
                db 0, 0, 0, 1Bh, 1Ch
                db 0, 0, 0, 26h, 27h     ; 34
woman_bottom_left       db 0, 11h, 6, 7, 8       ; 35
                db 0, 0, 0, 0, 0
                db 0, 11h, 6, 7, 8
                db 0, 0, 0, 0, 0
                db 0, 11h, 6, 7, 8
                db 0, 11h, 6, 7, 8
                db 0, 11h, 6, 7, 8
                db 0, 11h, 6, 7, 8
                db 0, 11h, 6, 7, 8
                db 0, 11h, 6, 7, 8
                db 0, 11h, 6, 7, 8
                db 0, 11h, 6, 7, 8
                db 0, 0, 0, 0, 0
                db 0, 11h, 6, 7, 8
                db 0, 0, 0, 0, 0
                db 0, 11h, 6, 7, 8       ; 50
woman_bottom_right       db 0, 0Dh, 16h, 0Fh, 10h ; 51
                db 0, 0, 0, 0, 0
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0, 0, 0, 0
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0, 0, 0, 0
                db 0, 0Dh, 16h, 0Fh, 10h
                db 0, 0, 0, 0, 0
                db 0, 0Dh, 16h, 0Fh, 10h ; 66
woman_bottom_death       db 0, 1Fh, 20h, 21h, 22h ; 67
                db 0, 1Dh, 23h, 24h, 25h
                db 0, 28h, 23h, 29h, 25h ; 69
ghost_left       db 0, 2Ah, 2Bh, 2Ch, 2Dh ; 70
                db 0, 2Eh, 2Fh, 30h, 31h
                db 0, 32h, 33h, 34h, 35h
                db 0, 36h, 37h, 38h, 39h
                db 0, 36h, 37h, 38h, 39h
                db 0, 4Ah, 4Bh, 4Ch, 4Dh
                db 0, 4Eh, 4Fh, 50h, 51h
                db 0, 63h, 0, 65h, 0
                db 0, 5Ah, 0, 5Ch, 0
                db 0, 5Dh, 0, 5Fh, 0
                db 0, 60h, 0, 62h, 0
                db 0, 63h, 0, 65h, 0
                db 0, 63h, 0, 65h, 0
                db 0, 4Eh, 4Fh, 50h, 51h
                db 0, 4Ah, 4Bh, 4Ch, 4Dh
                db 0, 36h, 37h, 38h, 39h ; 85
ghost_right       db 0, 3Ah, 3Bh, 3Ch, 3Dh ; 86
                db 0, 3Eh, 3Fh, 40h, 41h
                db 0, 42h, 43h, 44h, 45h
                db 0, 46h, 47h, 48h, 49h
                db 0, 46h, 47h, 48h, 49h
                db 0, 52h, 53h, 54h, 55h
                db 0, 56h, 57h, 58h, 59h
                db 0, 72h, 73h, 74h, 75h
                db 0, 66h, 67h, 68h, 69h
                db 0, 6Ah, 6Bh, 6Ch, 6Dh
                db 0, 6Eh, 6Fh, 70h, 71h
                db 0, 72h, 73h, 74h, 75h
                db 0, 72h, 73h, 74h, 75h
                db 0, 56h, 57h, 58h, 59h
                db 0, 52h, 53h, 54h, 55h
                db 0, 46h, 47h, 48h, 49h     ; 101
ghost_death       db 0, 76h, 77h, 78h, 39h     ; 102
                db 0, 7Ah, 7Bh, 7Ch, 7Dh
                db 0, 0, 0, 80h, 81h         ; 104
chicken_left       db 1, 0C2h, 0C3h, 0C4h, 0C5h ; 105
                db 1, 0C6h, 0C7h, 0C8h, 0C9h
                db 1, 0C2h, 0C3h, 0C4h, 0CAh
                db 1, 0C6h, 0C7h, 0CBh, 0CCh
                db 1, 9Ch, 9Dh, 9Eh, 9Fh
                db 1, 0B7h, 0B8h, 0B9h, 0BAh
                db 1, 0, 0BBh, 0BCh, 0BDh
                db 1, 0BEh, 0BFh, 0C0h, 0C1h ; 112
chicken_right       db 1, 0CDh, 0CEh, 0CFh, 0D0h ; 113
                db 1, 0D1h, 0D2h, 0D3h, 0D4h
                db 1, 0CDh, 0CEh, 0D5h, 0D0h
                db 1, 0D1h, 0D2h, 0D6h, 0D7h
                db 1, 0A4h, 0A5h, 0A6h, 0A7h
                db 1, 0ACh, 0ADh, 0AEh, 0AFh
                db 1, 0B0h, 0, 0B1h, 0B2h
                db 1, 0B3h, 0B4h, 0B5h, 0B6h ; 120
chicken_death       db 1, 0D8h, 0D9h, 0DAh, 0DBh ; 121
                db 1, 0DCh, 0DDh, 0DEh, 0DFh
                db 1, 0E0h, 0E1h, 0E2h, 0E3h ; 123
destructible_wall       db 1, 5, 5, 5, 5             ; 124
                db 1, 0Eh, 0Eh, 5Bh, 5Eh
                db 1, 61h, 64h, 79h, 7Eh
                db 1, 7Fh, 82h, 83h, 84h     ; 127
falling_ceiling       db 1, 85h, 86h, 87h, 88h     ; 128
                db 1, 89h, 8Ah, 8Bh, 8Bh
                db 1, 8Ch, 8Ch, 0, 0         ; 130
hit       db 1, 8Dh, 8Eh, 8Fh, 90h     ; 131
                db 1, 91h, 92h, 93h, 94h
                db 1, 95h, 96h, 97h, 98h     ; 133
red_alma       db 0, 99h, 9Ah, 9Bh, 0A0h    ; 134
                db 0, 0A1h, 0A2h, 0A3h, 0A8h
                db 0, 0A9h, 0AAh, 0ABh, 0E4h
                db 0, 0A1h, 0A2h, 0A3h, 0A8h ; 137
blue_alma       db 2, 99h, 9Ah, 9Bh, 0A0h    ; 138
                db 2, 0A1h, 0A2h, 0A3h, 0A8h
                db 2, 0A9h, 0AAh, 0ABh, 0E4h
                db 2, 0A1h, 0A2h, 0A3h, 0A8h ; 141
rare_alma       db 1, 99h, 9Ah, 9Bh, 0A0h    ; 142
                db 1, 0A1h, 0A2h, 0A3h, 0A8h
                db 1, 0A9h, 0AAh, 0ABh, 0E4h
                db 1, 0A1h, 0A2h, 0A3h, 0A8h ; 145
chest       db 0, 0E5h, 0E6h, 0E7h, 0E8h ; 146
                db 0, 0E5h, 0E6h, 0E7h, 0E8h
                db 0, 0E5h, 0E6h, 0E7h, 0E8h
                db 0, 0E5h, 0E6h, 0E7h, 0E8h
                db 0, 0E5h, 0E6h, 0E7h, 0E8h
                db 0, 0E5h, 0E6h, 0E7h, 0E8h
                db 0, 0E5h, 0E6h, 0E7h, 0E8h
                db 0, 0E5h, 0E6h, 0E7h, 0E8h ; 153
ordinary_key       db 1, 0E9h, 0EAh, 0EBh, 0ECh ; 154
red_potion       db 0, 0EDh, 0EEh, 0EFh, 0F0h ; 155
blue_potion       db 2, 0EDh, 0EEh, 0EFh, 0F0h ; 156
dropping_floor       db 1, 0FEh, 0FEh, 0FEh, 0FEh ; 157
                db 1, 0F1h, 0F2h, 0F3h, 0F4h
                db 1, 0F5h, 0F6h, 0F7h, 0F7h
                db 1, 0, 0, 0F8h, 0F8h       ; 160
silkarn_shoe       db 0, 0, 0, 0F9h, 0FAh       ; 161
feruza_shoe       db 1, 0, 0FBh, 0FCh, 0FDh    ; 162
death_descriptors dw offset byte_A3E9
                dw offset byte_A3E9
                dw offset byte_A3ED
                dw offset byte_A3F1
                dw offset byte_A3F5
byte_A3E9       db 11, 11, 11, 11
byte_A3ED       db 5, 5, 5, 5
byte_A3F1       db 5, 5, 0, 0
byte_A3F5       db 0, 0, 0, 0

; =============== S U B R O U T I N E =======================================


Monster_AI      proc near

                mov     bl, [si+4]
                and     bl, 0Fh
                xor     bh, bh
                add     bx, bx          ; switch 5 cases
                jmp     jpt_A403[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A403        dw offset woman_top_ai      ; 0
                dw offset locret_A411       ; 1
                dw offset ghost_ai          ; 2
                dw offset chicken_ai        ; 3
                dw offset falling_ceiling_ai ; 4
; ---------------------------------------------------------------------------

locret_A411:                            ; jumptable 0000A403 case 1
                retn
; ---------------------------------------------------------------------------

woman_top_ai:                               ; jumptable 0000A403 case 0
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A41C
                mov     byte ptr [si+8], 30h ; '0'

loc_A41C:
                test    byte ptr [si+5], 20h
                jz      short loc_A432
                mov     al, [si+5]
                and     al, 1Fh
                cmp     al, 1
                jnz     short loc_A42E
                jmp     loc_A4F7
; ---------------------------------------------------------------------------

loc_A42E:
                and     byte ptr [si+5], 9Fh

loc_A432:
                and     byte ptr [si+15h], 0BFh
                call    sub_A660
                jb      short loc_A43C
                retn
; ---------------------------------------------------------------------------

loc_A43C:
                test    byte ptr [si+9], 1
                jnz     short loc_A48D
                call    sub_A527
                jb      short loc_A479

loc_A447:
                inc     byte ptr [si+0Ah]
                mov     byte ptr [si+6], 1
                or      byte ptr [si+4], 60h
                call    word ptr cs:get_random_proc
                and     al, 1
                jnz     short loc_A46A
                call    sub_A556
                jnb     short loc_A463
                jmp     loc_A508
; ---------------------------------------------------------------------------

loc_A463:
                or      byte ptr [si+5], 80h
                jmp     loc_A508
; ---------------------------------------------------------------------------

loc_A46A:
                call    sub_A5DB
                jnb     short loc_A472
                jmp     loc_A508
; ---------------------------------------------------------------------------

loc_A472:
                and     byte ptr [si+5], 7Fh
                jmp     loc_A508
; ---------------------------------------------------------------------------

loc_A479:
                test    byte ptr [si+0Ah], 0F0h
                jz      short loc_A447
                mov     byte ptr [si+0Ah], 0
                mov     byte ptr [si+6], 0
                or      byte ptr [si+9], 1
                jmp     short loc_A508
; ---------------------------------------------------------------------------

loc_A48D:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 0Fh
                jnz     short loc_A4A4
                and     byte ptr [si+9], 0FEh
                mov     byte ptr [si+6], 1
                or      byte ptr [si+4], 60h
                jmp     short loc_A508
; ---------------------------------------------------------------------------

loc_A4A4:
                cmp     byte ptr [si+6], 4
                jb      short loc_A508
                and     byte ptr [si+4], 1Fh
                cmp     byte ptr [si+6], 8
                jnz     short loc_A508
                mov     al, [si+3]
                mov     byte_A4EA, al
                inc     al
                mov     byte_A4DD, al
                mov     al, [si+2]
                inc     al
                mov     byte_A4EB, al
                mov     byte_A4DE, al
                mov     bx, offset byte_A4DD
                test    byte ptr [si+5], 80h
                jnz     short loc_A4D6
                mov     bx, offset byte_A4EA

loc_A4D6:
                call    word ptr cs:Add_Projectile_To_Array_proc
                jmp     short loc_A508
; ---------------------------------------------------------------------------
byte_A4DD       db 0
byte_A4DE       db 0
                db  63h ; p_base_tile_idx
                db    0
                db  14h
                db    0
                db  14h
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A4EA       db 0
byte_A4EB       db 0
                db  63h ; p_base_tile_idx
                db    0
                db  14h
                db    4
                db  14h
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
; ---------------------------------------------------------------------------

loc_A4F7:
                and     al, 0BFh
                or      al, 20h
                mov     [si+5], al
                or      al, 60h
                mov     [si+15h], al
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A508:
                mov     al, [si+6]
                mov     [si+16h], al
                mov     al, [si+4]
                and     al, 60h
                and     byte ptr [si+14h], 9Fh
                or      [si+14h], al
                mov     al, [si+5]
                and     al, 80h
                and     byte ptr [si+15h], 7Fh
                or      [si+15h], al
                retn
Monster_AI      endp


; =============== S U B R O U T I N E =======================================


sub_A527        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jnb     short loc_A531
                neg     al

loc_A531:
                cmp     al, 4
                mov     al, 0FFh
                jb      short loc_A538
                retn
; ---------------------------------------------------------------------------

loc_A538:
                cmp     byte ptr [si+3], 11h
                jnb     short loc_A54A
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A548
                retn
; ---------------------------------------------------------------------------

loc_A548:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A54A:
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A554
                retn
; ---------------------------------------------------------------------------

loc_A554:
                clc
                retn
sub_A527        endp


; =============== S U B R O U T I N E =======================================


sub_A556        proc near
                cmp     byte ptr [si+3], 22h ; '"'
                cmc
                jnb     short loc_A55E
                retn
; ---------------------------------------------------------------------------

loc_A55E:
                call    sub_A57C
                jnb     short loc_A564
                retn
; ---------------------------------------------------------------------------

loc_A564:
                mov     bx, [si]
                inc     bx
                mov     ax, ds:mapWidth
                sub     ax, bx
                jnz     short loc_A56F
                xchg    ax, bx

loc_A56F:
                mov     [si], bx
                mov     [si+10h], bx
                inc     byte ptr [si+3]
                inc     byte ptr [si+13h]
                clc
                retn
sub_A556        endp


; =============== S U B R O U T I N E =======================================


sub_A57C        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                inc     di
                inc     di
                mov     cx, 4

loc_A589:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A594
                retn
; ---------------------------------------------------------------------------

loc_A594:
                xchg    si, di
                add     si, 36
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A589
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
sub_A57C        endp


; =============== S U B R O U T I N E =======================================


sub_A5DB        proc near
                cmp     byte ptr [si+3], 2
                jnb     short loc_A5E2
                retn
; ---------------------------------------------------------------------------

loc_A5E2:
                call    sub_A601
                jnb     short loc_A5E8
                retn
; ---------------------------------------------------------------------------

loc_A5E8:
                mov     ax, [si]
                dec     ax
                cmp     ax, 0FFFFh
                jnz     short loc_A5F4
                mov     ax, ds:mapWidth
                dec     ax

loc_A5F4:
                mov     [si], ax
                mov     [si+10h], ax
                dec     byte ptr [si+3]
                dec     byte ptr [si+13h]
                clc
                retn
sub_A5DB        endp


; =============== S U B R O U T I N E =======================================


sub_A601        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                dec     di
                mov     cx, 4

loc_A60D:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A618
                retn
; ---------------------------------------------------------------------------

loc_A618:
                xchg    si, di
                add     si, 36
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A60D
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
sub_A601        endp


; =============== S U B R O U T I N E =======================================


sub_A660        proc near
                test    byte ptr [si+3], 0FFh
                stc
                jnz     short loc_A668
                retn
; ---------------------------------------------------------------------------

loc_A668:
                cmp     byte ptr [si+3], 23h ; '#'
                stc
                jnz     short loc_A670
                retn
; ---------------------------------------------------------------------------

loc_A670:
                call    sub_A686
                jnb     short loc_A676
                retn
; ---------------------------------------------------------------------------

loc_A676:
                inc     byte ptr [si+2]
                and     byte ptr [si+2], 3Fh
                inc     byte ptr [si+12h]
                and     byte ptr [si+12h], 3Fh
                clc
                retn
sub_A660        endp


; =============== S U B R O U T I N E =======================================


sub_A686        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    si, di
                add     si, 90h
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     cx, 2

loc_A69E:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A6A9
                retn
; ---------------------------------------------------------------------------

loc_A6A9:
                inc     di
                loop    loc_A69E
                dec     di
                mov     al, [di]
                or      al, [di-1]
                or      al, [di-1]
                add     al, al
                retn
sub_A686        endp

; ---------------------------------------------------------------------------

ghost_ai:                               ; jumptable 0000A403 case 2
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A6C2
                mov     byte ptr [si+8], 10h

loc_A6C2:
                test    byte ptr [si+5], 20h
                jz      short loc_A6D5
                mov     byte ptr [si+6], 3
                mov     byte ptr [si+9], 1
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A6D5:
                test    byte ptr [si+9], 2
                jz      short loc_A6DE
                jmp     loc_A78D
; ---------------------------------------------------------------------------

loc_A6DE:
                test    byte ptr [si+9], 1
                jz      short loc_A6E7
                jmp     loc_A76E
; ---------------------------------------------------------------------------

loc_A6E7:
                test    byte ptr [si+9], 4
                jz      short loc_A6F0
                jmp     loc_A815
; ---------------------------------------------------------------------------

loc_A6F0:
                call    sub_A828
                jb      short loc_A718
                test    byte ptr [si+9], 70h
                jnz     short loc_A72C
                cmp     al, 0FFh
                jz      short loc_A708
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                jmp     short loc_A718
; ---------------------------------------------------------------------------

loc_A708:
                call    word ptr cs:get_random_proc
                add     al, al
                and     al, 80h
                and     byte ptr [si+5], 7Fh
                or      [si+5], al

loc_A718:
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A727
                call    word ptr cs:move_monster_N_proc
                jmp     short loc_A72C
; ---------------------------------------------------------------------------

loc_A727:
                call    word ptr cs:move_monster_S_proc

loc_A72C:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                add     byte ptr [si+9], 10h
                mov     al, [si+9]
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                and     al, 7
                mov     bx, offset byte_A75E
                test    byte ptr [si+5], 80h
                jnz     short loc_A750
                mov     bx, offset byte_A766

loc_A750:
                xlat
                call    word ptr cs:monster_move_in_direction_proc
                jb      short loc_A759
                retn
; ---------------------------------------------------------------------------

loc_A759:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------
byte_A75E       db 0, 0, 1, 0, 0, 0, 7, 0
byte_A766       db 4, 4, 3, 4, 4, 4, 5, 4
; ---------------------------------------------------------------------------

loc_A76E:
                or      byte ptr [si+4], 60h
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                cmp     byte ptr [si+6], 7
                jnb     short loc_A780
                retn
; ---------------------------------------------------------------------------

loc_A780:
                mov     byte ptr [si+6], 8
                mov     byte ptr [si+0Ah], 0
                mov     byte ptr [si+9], 2
                retn
; ---------------------------------------------------------------------------

loc_A78D:
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 0Fh
                jnb     short loc_A80C
                call    sub_A828
                jnb     short loc_A7C2
                test    byte ptr [si+9], 70h
                jnz     short loc_A7D6
                cmp     al, 0FFh
                jz      short loc_A7B0
                xor     al, 80h
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                jmp     short loc_A7C2
; ---------------------------------------------------------------------------

loc_A7B0:
                call    word ptr cs:get_random_proc
                add     al, al
                and     al, 80h
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_A7C2:
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                js      short loc_A7D1
                call    word ptr cs:move_monster_N_proc
                jmp     short loc_A7D6
; ---------------------------------------------------------------------------

loc_A7D1:
                call    word ptr cs:move_monster_S_proc

loc_A7D6:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                or      byte ptr [si+6], 8
                add     byte ptr [si+9], 10h
                mov     al, [si+9]
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                and     al, 7
                mov     bx, offset byte_A75E
                test    byte ptr [si+5], 80h
                jnz     short loc_A7FE
                mov     bx, offset byte_A766

loc_A7FE:
                xlat
                call    word ptr cs:monster_move_in_direction_proc
                jb      short loc_A807
                retn
; ---------------------------------------------------------------------------

loc_A807:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A80C:
                mov     byte ptr [si+6], 0Ch
                mov     byte ptr [si+9], 4
                retn
; ---------------------------------------------------------------------------

loc_A815:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 0Fh
                jz      short loc_A81F
                retn
; ---------------------------------------------------------------------------

loc_A81F:
                mov     byte ptr [si+9], 0
                and     byte ptr [si+4], 1Fh
                retn

; =============== S U B R O U T I N E =======================================


sub_A828        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jnb     short loc_A832
                neg     al

loc_A832:
                cmp     al, 8
                mov     al, 0FFh
                jb      short loc_A839
                retn
; ---------------------------------------------------------------------------

loc_A839:
                cmp     byte ptr [si+3], 11h
                jnb     short loc_A84B
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A849
                retn
; ---------------------------------------------------------------------------

loc_A849:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A84B:
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A855
                retn
; ---------------------------------------------------------------------------

loc_A855:
                clc
                retn
sub_A828        endp

; ---------------------------------------------------------------------------

chicken_ai:                               ; jumptable 0000A403 case 3
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A861
                mov     byte ptr [si+8], 8

loc_A861:
                test    byte ptr [si+5], 20h
                jz      short loc_A86C
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A86C:
                test    byte ptr [si+9], 1
                jnz     short loc_A8C3
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A87A
                retn
; ---------------------------------------------------------------------------

loc_A87A:
                call    sub_A828
                jb      short loc_A8BA
                add     byte ptr [si+6], 80h
                jb      short loc_A886
                retn
; ---------------------------------------------------------------------------

loc_A886:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 0F3h
                test    byte ptr [si+5], 80h
                jnz     short loc_A8A0
                call    word ptr cs:move_monster_W_proc
                jnb     short loc_A8AB
                xor     byte ptr [si+5], 80h
                jmp     short loc_A8AB
; ---------------------------------------------------------------------------

loc_A8A0:
                call    word ptr cs:move_monster_E_proc
                jnb     short loc_A8AB
                xor     byte ptr [si+5], 80h

loc_A8AB:
                dec     byte ptr [si+0Ah]
                test    byte ptr [si+0Ah], 0Fh
                jz      short loc_A8B5
                retn
; ---------------------------------------------------------------------------

loc_A8B5:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A8BA:
                mov     byte ptr [si+9], 1
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A8C3:
                test    byte ptr [si+9], 2
                jnz     short loc_A934
                call    sub_A828
                cmp     al, 0FFh
                jz      short loc_A914
                mov     byte ptr [si+6], 4
                test    byte ptr [si+5], 80h
                jnz     short loc_A8ED
                call    word ptr cs:move_monster_W_proc
                call    word ptr cs:move_monster_W_proc
                jnb     short loc_A8FE
                call    sub_A947
                jb      short sub_A927
                jmp     short loc_A8FE
; ---------------------------------------------------------------------------

loc_A8ED:
                call    word ptr cs:move_monster_E_proc
                call    word ptr cs:move_monster_E_proc
                jnb     short loc_A8FE
                call    sub_A947
                jb      short sub_A927

loc_A8FE:
                inc     byte ptr [si+0Ah]
                mov     al, [si+0Ah]
                and     al, 0Fh
                inc     al
                jnz     short loc_A90D
                call    sub_A927

loc_A90D:
                test    byte ptr [si+0Ah], 1Fh
                jz      short loc_A914
                retn
; ---------------------------------------------------------------------------

loc_A914:
                call    sub_A828
                jnb     short loc_A91A
                retn
; ---------------------------------------------------------------------------

loc_A91A:
                mov     byte ptr [si+6], 0
                mov     byte ptr [si+9], 0
                mov     byte ptr [si+0Ah], 0
                retn

; =============== S U B R O U T I N E =======================================


sub_A927        proc near
                or      byte ptr [si+9], 2
                xor     byte ptr [si+5], 80h
                mov     byte ptr [si+6], 5
                retn
sub_A927        endp

; ---------------------------------------------------------------------------

loc_A934:
                inc     byte ptr [si+6]
                test    byte ptr [si+6], 7
                jz      short loc_A93E
                retn
; ---------------------------------------------------------------------------

loc_A93E:
                and     byte ptr [si+9], 0FDh
                mov     byte ptr [si+6], 4
                retn

; =============== S U B R O U T I N E =======================================


sub_A947        proc near
                test    byte ptr [si+9], 4
                jnz     short loc_A952
                jmp     word ptr cs:move_monster_S_proc
; ---------------------------------------------------------------------------

loc_A952:
                call    word ptr cs:move_monster_N_proc
                jb      short loc_A95A
                retn
; ---------------------------------------------------------------------------

loc_A95A:
                or      byte ptr [si+9], 4
                retn
sub_A947        endp

; ---------------------------------------------------------------------------

falling_ceiling_ai:                               ; jumptable 0000A403 case 4
                or      byte ptr [si+4], 20h
                test    byte ptr [si+9], 2
                jnz     short loc_A9B4
                test    byte ptr [si+9], 1
                jnz     short loc_A98C
                cmp     byte ptr [si+3], 8
                jnb     short loc_A976
                retn
; ---------------------------------------------------------------------------

loc_A976:
                cmp     byte ptr [si+3], 13h
                jb      short loc_A97D
                retn
; ---------------------------------------------------------------------------

loc_A97D:
                call    word ptr cs:get_random_proc
                and     al, 3
                jz      short loc_A987
                retn
; ---------------------------------------------------------------------------

loc_A987:
                or      byte ptr [si+9], 1
                retn
; ---------------------------------------------------------------------------

loc_A98C:
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A994
                retn
; ---------------------------------------------------------------------------

loc_A994:
                or      byte ptr [si+9], 2
                mov     byte ptr [si+6], 1
                mov     ah, ds:82h
                dec     ah
                mov     al, [si+2]
                sub     al, ah
                and     al, 3Fh
                cmp     al, 13h
                jb      short loc_A9AE
                retn
; ---------------------------------------------------------------------------

loc_A9AE:
                mov     byte ptr ds:soundFX_request, 21h ; '!'
                retn
; ---------------------------------------------------------------------------

loc_A9B4:
                add     byte ptr [si+6], 80h
                jb      short loc_A9BB
                retn
; ---------------------------------------------------------------------------

loc_A9BB:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jz      short loc_A9C5
                retn
; ---------------------------------------------------------------------------

loc_A9C5:
                and     byte ptr [si+7], 0F0h
                or      byte ptr [si+7], 1
                jmp     word ptr cs:Check_Vertical_Distance_Between_Hero_And_Monster_proc

seg000          ends


                end start
