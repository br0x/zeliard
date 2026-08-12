include common.inc
include dungeon.inc
                .286
                .model small

eai8          segment byte public 'CODE'
                assume cs:eai8, ds:eai8
                org 0A000h
start:
                dw offset Monster_AI
                db    0
                db    0
                db    0
                db    0
                dw offset death_descriptors
monster_xp      db 255, 255, 255, 255, 255, 0, 0, 0
monster_damage  db 160, 160, 60, 80, 80, 0, 0, 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
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
                dw offset byte_A0B0  ; 0..5
                dw offset byte_A0FB  ; 15..20
                dw offset byte_A146  ; 30..37
                dw offset byte_A1A5  ; 49..53
                dw offset byte_A1E6  ; 62..65
                dw 0
                dw 0
                dw 0
                dw offset byte_A0EC  ; 12..14
                dw offset byte_A137  ; 27..29
                dw offset byte_A196  ; 46..48
                dw offset byte_A1D7  ; 59..61
                dw offset byte_A1FA  ; 66..68
                dw 0
                dw 0
                dw 0
                dw offset byte_A286  ; 94..97
                dw 0
                dw offset byte_A209  ; 69..71
                dw offset byte_A254  ; 84..89
                dw offset byte_A218  ; 72..75
                dw offset byte_A22C  ; 76..79
                dw offset byte_A27C  ; 92
                dw offset byte_A281  ; 93
                dw offset byte_A272  ; 90
                dw offset byte_A277  ; 91
                dw 0
                dw offset byte_A240  ; 80..83
                dw offset byte_A29A  ; 98
                dw 0
                dw 0
                dw 0
                ; A070
                dw offset byte_A0CE  ; 6..11
                dw offset byte_A119  ; 21..26
                dw offset byte_A16E  ; 38..45
                dw offset byte_A1BE  ; 54..58
                dw offset byte_A1E6  ; 62..65
                dw 0
                dw 0
                dw 0
                dw offset byte_A0EC  ; 12..14
                dw offset byte_A137  ; 27..29
                dw offset byte_A196  ; 46..48
                dw offset byte_A1D7  ; 59..61
                dw offset byte_A1FA  ; 66..68
                dw 0
                dw 0
                dw 0
                dw offset byte_A286  ; 94..97
                dw 0
                dw offset byte_A209  ; 69..71
                dw offset byte_A254  ; 84..89
                dw offset byte_A218  ; 72..75
                dw offset byte_A22C  ; 76..79
                dw offset byte_A27C  ; 92
                dw offset byte_A281  ; 93
                dw offset byte_A272  ; 90
                dw offset byte_A277  ; 91
                dw 0
                dw offset byte_A240  ; 80..83
                dw offset byte_A29A  ; 98
                dw 0
                dw 0
                dw 0
byte_A0B0       db 0, 1, 2, 3, 4           ; 0
                db 0, 1, 2, 3, 4
                db 0, 1, 2, 3, 4
                db 0, 1, 2, 11h, 4
                db 0, 1, 2, 16h, 4
                db 0, 1, 2, 1Bh, 4         ; 5
byte_A0CE       db 0, 20h, 21h, 22h, 23h   ; 6
                db 0, 20h, 21h, 22h, 23h
                db 0, 20h, 21h, 22h, 23h
                db 0, 20h, 21h, 22h, 30h
                db 0, 20h, 21h, 22h, 35h
                db 0, 20h, 21h, 22h, 3Ah   ; 11
byte_A0EC       db 0, 3Fh, 40h, 41h, 42h   ; 12
                db 2, 47h, 48h, 49h, 4Ah
                db 2, 4Fh, 50h, 51h, 52h   ; 14
byte_A0FB       db 2, 5, 6, 7, 8           ; 15
                db 2, 9, 0Ah, 0Bh, 0Ch
                db 2, 0Dh, 0Eh, 0Fh, 10h
                db 2, 12h, 13h, 14h, 15h
                db 2, 17h, 18h, 19h, 1Ah
                db 2, 1Ch, 1Dh, 1Eh, 1Fh   ; 20
byte_A119       db 2, 24h, 25h, 26h, 27h   ; 21
                db 2, 28h, 29h, 2Ah, 2Bh
                db 2, 2Ch, 2Dh, 2Eh, 2Fh
                db 2, 31h, 32h, 33h, 34h
                db 2, 36h, 37h, 38h, 39h
                db 2, 3Bh, 3Ch, 3Dh, 3Eh   ; 26
byte_A137       db 0, 43h, 44h, 45h, 46h   ; 27
                db 2, 4Bh, 4Ch, 4Dh, 4Eh
                db 2, 53h, 54h, 55h, 56h   ; 29
byte_A146       db 0, 57h, 58h, 59h, 5Ah   ; 30
                db 0, 5Bh, 5Ch, 5Dh, 5Eh
                db 0, 5Fh, 60h, 61h, 62h
                db 0, 63h, 64h, 65h, 66h
                db 0, 57h, 58h, 59h, 5Ah
                db 0, 5Bh, 5Ch, 5Dh, 5Eh
                db 0, 67h, 68h, 69h, 6Ah
                db 0, 6Bh, 6Ch, 6Dh, 6Eh   ; 37
byte_A16E       db 0, 6Fh, 70h, 71h, 72h   ; 38
                db 0, 73h, 74h, 75h, 76h
                db 0, 77h, 78h, 79h, 7Ah
                db 0, 7Bh, 7Ch, 7Dh, 7Eh
                db 0, 6Fh, 70h, 71h, 72h
                db 0, 73h, 74h, 75h, 76h
                db 0, 7Fh, 80h, 81h, 82h
                db 0, 83h, 84h, 85h, 86h   ; 45
byte_A196       db 0, 87h, 88h, 89h, 8Ah   ; 46
                db 0, 8Bh, 8Ch, 8Dh, 8Eh
                db 2, 8Fh, 90h, 91h, 92h   ; 48
byte_A1A5       db 0, 93h, 94h, 95h, 96h   ; 49
                db 0, 97h, 98h, 99h, 9Ah
                db 0, 9Bh, 9Ch, 9Dh, 9Eh
                db 0, 0A3h, 0A4h, 95h, 96h
                db 0, 0A5h, 0A6h, 95h, 96h ; 53
byte_A1BE       db 0, 93h, 94h, 95h, 96h   ; 54
                db 0, 97h, 98h, 99h, 9Ah
                db 0, 9Bh, 9Ch, 9Dh, 9Eh
                db 0, 9Fh, 0A0h, 95h, 96h
                db 0, 0A1h, 0A2h, 95h, 96h ; 58
byte_A1D7       db 0, 0A7h, 0A8h, 95h, 96h   ; 59
                db 0, 0A9h, 0AAh, 0ABh, 0ACh
                db 0, 0ADh, 0AEh, 0AFh, 0B0h ; 61
byte_A1E6       db 2, 0B1h, 0B2h, 0B3h, 0B4h ; 62
                db 2, 0B5h, 0B6h, 0B7h, 0B8h
                db 2, 0B9h, 0BAh, 0BBh, 0BCh
                db 2, 0BDh, 0BEh, 0BFh, 0C0h ; 65
byte_A1FA       db 2, 0C1h, 0C2h, 0C3h, 0C4h ; 66
                db 2, 0C5h, 0C6h, 0C7h, 0C8h
                db 2, 0C9h, 0CAh, 0, 0       ; 68
byte_A209       db 1, 0CBh, 0CCh, 0CDh, 0CEh ; 69
                db 1, 0CFh, 0D0h, 0D1h, 0D2h
                db 1, 0D3h, 0D4h, 0D5h, 0D6h ; 71
byte_A218       db 0, 0D7h, 0D8h, 0D9h, 0DAh ; 72
                db 0, 0DBh, 0DCh, 0DDh, 0DEh
                db 0, 0DFh, 0E0h, 0E1h, 0E2h
                db 0, 0DBh, 0DCh, 0DDh, 0DEh ; 75
byte_A22C       db 2, 0D7h, 0D8h, 0D9h, 0DAh ; 76
                db 2, 0DBh, 0DCh, 0DDh, 0DEh
                db 2, 0DFh, 0E0h, 0E1h, 0E2h
                db 2, 0DBh, 0DCh, 0DDh, 0DEh ; 79
byte_A240       db 1, 0D7h, 0D8h, 0D9h, 0DAh ; 80
                db 1, 0DBh, 0DCh, 0DDh, 0DEh
                db 1, 0DFh, 0E0h, 0E1h, 0E2h
                db 1, 0DBh, 0DCh, 0DDh, 0DEh ; 83
byte_A254       db 0, 0E3h, 0E4h, 0E5h, 0E6h ; 84
                db 0, 0E3h, 0E4h, 0E5h, 0E6h
                db 0, 0E3h, 0E4h, 0E5h, 0E6h
                db 0, 0E3h, 0E4h, 0E5h, 0E6h
                db 0, 0E3h, 0E4h, 0E5h, 0E6h
                db 0, 0E3h, 0E4h, 0E5h, 0E6h ; 89
byte_A272       db 0, 0EBh, 0ECh, 0EDh, 0EEh ; 90
byte_A277       db 2, 0EBh, 0ECh, 0EDh, 0EEh ; 91
byte_A27C       db 1, 0E7h, 0E8h, 0E9h, 0EAh ; 92
byte_A281       db 1, 0EFh, 0F0h, 0F1h, 0F2h ; 93
byte_A286       db 2, 0F3h, 0F3h, 0F3h, 0F3h ; 94
                db 2, 0F4h, 0F4h, 0F5h, 0F5h
                db 2, 0F6h, 0, 0F3h, 0F7h
                db 2, 0, 0, 0F7h, 0F8h       ; 97
byte_A29A       db 2, 0F9h, 0FAh, 0FBh, 0FCh ; 98
death_descriptors dw offset byte_A2A9
                dw offset byte_A2A9
                dw offset byte_A2AD
                dw offset byte_A2B1
                dw offset byte_A2B5
byte_A2A9       db 11, 11, 11, 11
byte_A2AD       db 5, 5, 0, 0
byte_A2B1       db 11, 11, 5, 5
byte_A2B5       db 11, 5, 0, 0

; =============== S U B R O U T I N E =======================================


Monster_AI      proc near

                mov     bl, [si+4]
                and     bl, 0Fh
                xor     bh, bh
                add     bx, bx          ; switch 5 cases
                jmp     jpt_A2C3[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A2C3        dw offset medusa_top      ; type 0 (medusa)
                dw offset medusa_bottom   ; type 1 (passive bottom part of medusa)
                dw offset crab            ; type 2 (crab)
                dw offset slime           ; type 3 (slime)
                dw offset plasma          ; type 4 (plasma)
; ---------------------------------------------------------------------------

medusa_bottom:                            ; jumptable 0000A2C3 case 1
                retn
; ---------------------------------------------------------------------------

medusa_top:                               ; jumptable 0000A2C3 case 0
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A2DC
                mov     byte ptr [si+8], 64h ; 'd'

loc_A2DC:
                test    byte ptr [si+5], 20h
                jz      short loc_A2E5
                jmp     loc_A365
; ---------------------------------------------------------------------------

loc_A2E5:
                and     byte ptr [si+15h], 0BFh
                test    byte ptr [si+9], 1
                jnz     short loc_A319
                add     byte ptr [si+6], 80h
                jnb     short loc_A2F8
                call    sub_A343

loc_A2F8:
                mov     byte ptr [si+0Ah], 0
                call    sub_A75D
                jb      short loc_A30E
                cmp     al, 0FFh
                jz      short loc_A352
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                jmp     short loc_A352
; ---------------------------------------------------------------------------

loc_A30E:
                cmp     ah, 0Fh
                jnb     short loc_A352
                or      byte ptr [si+9], 1
                jmp     short loc_A352
; ---------------------------------------------------------------------------

loc_A319:
                inc     byte ptr [si+0Ah]
                mov     al, [si+0Ah]
                cmp     al, 10h
                jz      short loc_A33D
                test    byte ptr [si+5], 80h
                jnz     short loc_A333
                call    sub_A3FE
                jb      short loc_A33D
                call    sub_A343
                jmp     short loc_A352
; ---------------------------------------------------------------------------

loc_A333:
                call    sub_A379
                jb      short loc_A33D
                call    sub_A343
                jmp     short loc_A352
; ---------------------------------------------------------------------------

loc_A33D:
                and     byte ptr [si+9], 0FEh
                jmp     short loc_A352
Monster_AI      endp


; =============== S U B R O U T I N E =======================================


sub_A343        proc near
                inc     byte ptr [si+6]
                cmp     byte ptr [si+6], 6
                jnb     short loc_A34D
                retn
; ---------------------------------------------------------------------------

loc_A34D:
                mov     byte ptr [si+6], 0
                retn
sub_A343        endp

; ---------------------------------------------------------------------------

loc_A352:
                mov     al, [si+6]
                mov     [si+16h], al
                mov     al, [si+5]
                and     al, 80h
                and     byte ptr [si+15h], 7Fh
                or      [si+15h], al
                retn
; ---------------------------------------------------------------------------

loc_A365:
                mov     al, [si+5]
                and     al, 0BFh
                or      al, 20h
                mov     [si+5], al
                or      al, 60h
                mov     [si+15h], al
                jmp     word ptr cs:Hero_Hits_monster_proc

; =============== S U B R O U T I N E =======================================


sub_A379        proc near
                cmp     byte ptr [si+3], 22h ; '"'
                cmc
                jnb     short loc_A381
                retn
; ---------------------------------------------------------------------------

loc_A381:
                call    sub_A39F
                jnb     short loc_A387
                retn
; ---------------------------------------------------------------------------

loc_A387:
                mov     bx, [si]
                inc     bx
                mov     ax, ds:mapWidth
                sub     ax, bx
                jnz     short loc_A392
                xchg    ax, bx

loc_A392:
                mov     [si], bx
                mov     [si+10h], bx
                inc     byte ptr [si+3]
                inc     byte ptr [si+13h]
                clc
                retn
sub_A379        endp


; =============== S U B R O U T I N E =======================================


sub_A39F        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                inc     di
                inc     di
                mov     cx, 4

loc_A3AC:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A3B7
                retn
; ---------------------------------------------------------------------------

loc_A3B7:
                xchg    si, di
                add     si, 36
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A3AC
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
sub_A39F        endp


; =============== S U B R O U T I N E =======================================


sub_A3FE        proc near
                cmp     byte ptr [si+3], 2
                jnb     short loc_A405
                retn
; ---------------------------------------------------------------------------

loc_A405:
                call    sub_A424
                jnb     short loc_A40B
                retn
; ---------------------------------------------------------------------------

loc_A40B:
                mov     ax, [si]
                dec     ax
                cmp     ax, 0FFFFh
                jnz     short loc_A417
                mov     ax, ds:mapWidth
                dec     ax

loc_A417:
                mov     [si], ax
                mov     [si+10h], ax
                dec     byte ptr [si+3]
                dec     byte ptr [si+13h]
                clc
                retn
sub_A3FE        endp


; =============== S U B R O U T I N E =======================================


sub_A424        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                dec     di
                mov     cx, 4

loc_A430:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A43B
                retn
; ---------------------------------------------------------------------------

loc_A43B:
                xchg    si, di
                add     si, 36
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A430
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
sub_A424        endp

; ---------------------------------------------------------------------------

crab:                               ; jumptable 0000A2C3 case 2
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A48D
                mov     byte ptr [si+8], 30h ; '0'

loc_A48D:
                test    byte ptr [si+5], 20h
                jz      short loc_A498
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A498:
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A4A0
                retn
; ---------------------------------------------------------------------------

loc_A4A0:
                test    byte ptr [si+9], 1
                jnz     short loc_A4F0
                call    sub_A75D
                sbb     ah, ah
                neg     ah
                mov     [si+9], ah
                cmp     al, 0FFh
                jz      short loc_A4BB
                and     byte ptr [si+5], 7Fh
                or      [si+5], al

loc_A4BB:
                add     byte ptr [si+6], 80h
                jb      short loc_A4C2
                retn
; ---------------------------------------------------------------------------

loc_A4C2:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                test    byte ptr [si+5], 80h
                jnz     short loc_A4DB
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A4E7
                and     byte ptr [si+5], 7Fh
                retn
; ---------------------------------------------------------------------------

loc_A4DB:
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A4E7
                or      byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A4E7:
                mov     byte ptr [si+9], 0
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A4F0:
                dec     byte ptr [si+0Ah]
                test    byte ptr [si+0Ah], 3
                jnz     short loc_A50E
                call    sub_A75D
                sbb     ah, ah
                neg     ah
                mov     [si+9], ah
                cmp     al, 0FFh
                jz      short loc_A50E
                and     byte ptr [si+5], 7Fh
                or      [si+5], al

loc_A50E:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                test    byte ptr [si+5], 80h
                jnz     short loc_A527
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A533
                and     byte ptr [si+5], 7Fh
                retn
; ---------------------------------------------------------------------------

loc_A527:
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A533
                or      byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A533:
                mov     byte ptr [si+9], 0
                retn
; ---------------------------------------------------------------------------

slime:                               ; jumptable 0000A2C3 case 3
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A542
                mov     byte ptr [si+8], 40h ; '@'

loc_A542:
                test    byte ptr [si+5], 20h
                jz      short loc_A54D
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A54D:
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A555
                retn
; ---------------------------------------------------------------------------

loc_A555:
                test    byte ptr [si+9], 4
                jz      short loc_A55E
                jmp     loc_A620
; ---------------------------------------------------------------------------

loc_A55E:
                test    byte ptr [si+9], 1
                jnz     short loc_A587
                call    sub_A5FE
                add     byte ptr [si+6], 80h
                jb      short loc_A56E
                retn
; ---------------------------------------------------------------------------

loc_A56E:
                call    sub_A680
                jz      short loc_A574
                retn
; ---------------------------------------------------------------------------

loc_A574:
                call    word ptr cs:get_random_proc
                and     al, 3
                jz      short loc_A57E
                retn
; ---------------------------------------------------------------------------

loc_A57E:
                mov     byte ptr [si+9], 1
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A587:
                test    byte ptr [si+9], 2
                jnz     short loc_A5F5
                call    sub_A680
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 8
                jz      short loc_A59A
                retn
; ---------------------------------------------------------------------------

loc_A59A:
                or      byte ptr [si+9], 2
                call    word ptr cs:get_random_proc
                or      al, al
                js      short loc_A5CE
                push    si
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    di, si
                add     si, 74
                call    word ptr cs:wrap_map_from_above_proc
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                pop     si
                jz      short loc_A5C9
                jmp     word ptr cs:move_monster_E_proc
; ---------------------------------------------------------------------------

loc_A5C9:
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A5CE:
                push    si
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    di, si
                add     si, 71
                call    word ptr cs:wrap_map_from_above_proc
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                pop     si
                jz      short loc_A5F0
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A5F0:
                jmp     word ptr cs:move_monster_E_proc
; ---------------------------------------------------------------------------

loc_A5F5:
                and     byte ptr [si+9], 0FEh
                mov     byte ptr [si+6], 0
                retn

; =============== S U B R O U T I N E =======================================


sub_A5FE        proc near
                call    sub_A75D
                cmp     al, 0FFh
                jnz     short loc_A606
                retn
; ---------------------------------------------------------------------------

loc_A606:
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                call    word ptr cs:get_random_proc
                and     al, 7
                jz      short loc_A617
                retn
; ---------------------------------------------------------------------------

loc_A617:
                or      byte ptr [si+9], 4
                mov     byte ptr [si+0Ah], 0
                retn
sub_A5FE        endp

; ---------------------------------------------------------------------------

loc_A620:
                mov     byte ptr [si+6], 3
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 3
                jz      short loc_A62E
                retn
; ---------------------------------------------------------------------------

loc_A62E:
                mov     byte ptr [si+6], 4
                mov     al, [si+3]
                mov     byte_A673, al
                inc     al
                mov     byte_A666, al
                mov     al, [si+2]
                and     al, 3Fh
                mov     byte_A674, al
                mov     byte_A667, al
                mov     bx, offset byte_A666
                test    byte ptr [si+5], 80h
                jnz     short loc_A654
                mov     bx, offset byte_A673

loc_A654:
                call    word ptr cs:Add_Projectile_To_Array_proc
                and     byte ptr [si+9], 0FBh
                or      byte ptr [si+9], 2
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------
byte_A666       db 0
byte_A667       db 0
                db  2Ah ; *
                db    0
                db  12h
                db    0
                db  50h ; P
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A673       db 0
byte_A674       db 0
                db  2Bh ; +
                db    0
                db  12h
                db    4
                db    1
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0

; =============== S U B R O U T I N E =======================================


sub_A680        proc near
                mov     al, [si+6]
                inc     al
                cmp     al, 3
                jb      short loc_A68B
                xor     al, al

loc_A68B:
                mov     [si+6], al
                retn
sub_A680        endp

; ---------------------------------------------------------------------------

plasma:                               ; jumptable 0000A2C3 case 4
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A699
                mov     byte ptr [si+8], 60h ; '`'

loc_A699:
                test    byte ptr [si+5], 20h
                jz      short loc_A6A4
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A6A4:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                add     byte ptr [si+0Ah], 80h
                jb      short loc_A6B2
                retn
; ---------------------------------------------------------------------------

loc_A6B2:
                call    sub_A72B
                jb      short loc_A6DC
                test    byte ptr [si+9], 70h
                jnz     short loc_A6F0
                cmp     al, 0FFh
                jz      short loc_A6CA
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                jmp     short loc_A6DC
; ---------------------------------------------------------------------------

loc_A6CA:
                call    word ptr cs:get_random_proc
                add     al, al
                and     al, 80h
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_A6DC:
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A6EB
                call    word ptr cs:move_monster_N_proc
                jmp     short loc_A6F0
; ---------------------------------------------------------------------------

loc_A6EB:
                call    word ptr cs:move_monster_S_proc

loc_A6F0:
                add     byte ptr [si+9], 10h
                mov     al, [si+9]
                shr     al, 1
                shr     al, 1
                shr     al, 1
                shr     al, 1
                and     al, 7
                mov     bx, offset unk_A71B
                test    byte ptr [si+5], 80h
                jnz     short loc_A70D
                mov     bx, offset unk_A723

loc_A70D:
                xlat
                call    word ptr cs:monster_move_in_direction_proc
                jb      short loc_A716
                retn
; ---------------------------------------------------------------------------

loc_A716:
                xor     byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------
unk_A71B        db    0
                db    0
                db    1
                db    0
                db    0
                db    0
                db    7
                db    0
unk_A723        db    4
                db    4
                db    3
                db    4
                db    4
                db    4
                db    5
                db    4

; =============== S U B R O U T I N E =======================================


sub_A72B        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A735
                neg     al

loc_A735:
                cmp     al, 8
                mov     al, 0FFh
                jb      short loc_A73C
                retn
; ---------------------------------------------------------------------------

loc_A73C:
                mov     al, 10h
                sub     al, [si+3]
                jb      short loc_A751
                mov     ah, al
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A74F
                retn
; ---------------------------------------------------------------------------

loc_A74F:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A751:
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A75B
                retn
; ---------------------------------------------------------------------------

loc_A75B:
                clc
                retn
sub_A72B        endp


; =============== S U B R O U T I N E =======================================


sub_A75D        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A767
                neg     al

loc_A767:
                cmp     al, 5
                mov     al, 0FFh
                jb      short loc_A76E
                retn
; ---------------------------------------------------------------------------

loc_A76E:
                mov     al, 11h
                sub     al, [si+3]
                jb      short loc_A783
                mov     ah, al
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A781
                retn
; ---------------------------------------------------------------------------

loc_A781:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A783:
                neg     al
                mov     ah, al
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A791
                retn
; ---------------------------------------------------------------------------

loc_A791:
                clc
                retn
sub_A75D        endp

eai8          ends

                end start
