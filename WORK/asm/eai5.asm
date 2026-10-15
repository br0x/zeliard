include common.inc
include dungeon.inc
                .286
                .model small

eai5            segment byte public 'CODE'
                assume cs:eai5, ds:eai5
                org 0A000h
start:
                dw offset Monster_AI
                db    0
                db    0
                db    0
                db    0
                dw offset death_descriptors
monster_xp      db 50, 50, 20, 10, 10, 0, 0, 0
monster_damage  db 40, 40, 20, 20, 10, 0, 0, 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
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
                dw offset man_top_left      ; 0..11
                dw offset man_bottom_left   ; 27..38
                dw offset red_egg           ; 54..61
                dw offset eyeball_left      ; 65..70
                dw offset vistlet           ; 80..87
                dw 0
                dw 0
                dw 0
                dw offset man_top_death     ; 24..26
                dw offset man_bottom_death  ; 51..53
                dw offset red_egg_death     ; 62..64
                dw offset eyeball_death     ; 77..79
                dw offset vistlet_death     ; 88..90
                dw 0
                dw 0
                dw 0
                dw offset destroyable_wall1 ; 114..117
                dw offset destroyable_wall2 ; 118..121
                dw offset hit               ; 91..93
                dw offset chest             ; 106..112
                dw offset alma_red          ; 94..97
                dw offset alma_blue         ; 98..101
                dw offset ordinary_key      ; 113
                dw 0
                dw offset red_potion        ; 123
                dw offset blue_potion       ; 124
                dw offset pirika_shoe       ; 122
                dw offset alma_rare         ; 102..105
                dw 0
                dw 0
                dw 0
                dw 0
                ; A070
                dw offset man_top_right     ; 12..23
                dw offset man_bottom_right  ; 39..50
                dw offset red_egg           ; 54..61
                dw offset eyeball_right     ; 71..76
                dw offset vistlet           ; 80..87
                dw 0
                dw 0
                dw 0
                dw offset man_top_death     ; 24..26
                dw offset man_bottom_death  ; 51..53
                dw offset red_egg_death     ; 62..64
                dw offset eyeball_death     ; 77..79
                dw offset vistlet_death     ; 88..90
                dw 0
                dw 0
                dw 0
                dw offset destroyable_wall1 ; 114..117
                dw offset destroyable_wall2 ; 118..121
                dw offset hit               ; 91..93
                dw offset chest             ; 106..112
                dw offset alma_red          ; 94..97
                dw offset alma_blue         ; 98..101
                dw offset ordinary_key      ; 113
                dw 0
                dw offset red_potion        ; 123
                dw offset blue_potion       ; 124
                dw offset pirika_shoe       ; 122
                dw offset alma_rare         ; 102..105
                dw 0
                dw 0
                dw 0
                dw 0
man_top_left    db 1, 8Fh, 90h, 79h, 7Ah ; 0..11
                db 1, 7Fh, 80h, 81h, 82h
                db 1, 87h, 88h, 89h, 8Ah
                db 1, 7Fh, 80h, 99h, 9Ah
                db 1, 8Fh, 90h, 91h, 92h
                db 1, 7Fh, 80h, 99h, 9Ah
                db 1, 87h, 88h, 89h, 8Ah
                db 1, 7Fh, 80h, 81h, 82h
                db 1, 0C7h, 88h, 0C9h, 8Ah
                db 1, 0C7h, 88h, 0CBh, 8Ah
                db 1, 0C7h, 88h, 0CDh, 8Ah
                db 1, 0C7h, 88h, 0C9h, 8Ah
man_top_right   db 1, 0B7h, 0B8h, 0A1h, 0A2h ; 12..23
                db 1, 0A7h, 0A8h, 0A9h, 0AAh
                db 1, 0AFh, 0B0h, 0B1h, 0B2h
                db 1, 0A7h, 0A8h, 0C1h, 0C2h
                db 1, 0B7h, 0B8h, 0B9h, 0BAh
                db 1, 0A7h, 0A8h, 0C1h, 0C2h
                db 1, 0AFh, 0B0h, 0B1h, 0B2h
                db 1, 0A7h, 0A8h, 0A9h, 0AAh
                db 1, 0AFh, 0CFh, 0B1h, 0D1h
                db 1, 0AFh, 0CFh, 0B1h, 0D2h
                db 1, 0AFh, 0CFh, 0B1h, 0D3h
                db 1, 0AFh, 0CFh, 0B1h, 0D1h
man_top_death   db 1, 0D4h, 0D5h, 0D6h, 0D7h ; 24..26
                db 1, 0, 0, 0DAh, 0DBh
                db 1, 0, 0, 0, 0
man_bottom_left db 1, 7Bh, 7Ch, 7Dh, 7Eh ; 27..38
                db 1, 83h, 84h, 85h, 86h
                db 1, 7Bh, 7Ch, 7Dh, 7Eh
                db 1, 8Bh, 8Ch, 8Dh, 8Eh
                db 1, 93h, 94h, 95h, 96h
                db 1, 9Bh, 9Ch, 9Dh, 9Eh
                db 1, 93h, 94h, 95h, 96h
                db 1, 8Bh, 8Ch, 8Dh, 8Eh
                db 1, 8Bh, 8Ch, 8Dh, 8Eh
                db 1, 8Bh, 8Ch, 8Dh, 8Eh
                db 1, 8Bh, 8Ch, 8Dh, 8Eh
                db 1, 8Bh, 8Ch, 8Dh, 8Eh
man_bottom_right db 1, 0A3h, 0A4h, 0A5h, 0A6h ; 39..50
                db 1, 0ABh, 0A4h, 0ADh, 0AEh
                db 1, 0A3h, 0A4h, 0A5h, 0A6h
                db 1, 0B3h, 0B4h, 0B5h, 0B6h
                db 1, 0BBh, 0BCh, 0BDh, 0BEh
                db 1, 0C3h, 0BCh, 0C5h, 0C6h
                db 1, 0BBh, 0BCh, 0BDh, 0BEh
                db 1, 0B3h, 0B4h, 0B5h, 0B6h
                db 1, 0B3h, 0B4h, 0B5h, 0B6h
                db 1, 0B3h, 0B4h, 0B5h, 0B6h
                db 1, 0B3h, 0B4h, 0B5h, 0B6h
                db 1, 0B3h, 0B4h, 0B5h, 0B6h
man_bottom_death db 1, 0E0h, 0E1h, 0E2h, 0E3h ; 51..53
                db 1, 0E4h, 0E5h, 0E6h, 0E7h
                db 1, 0E8h, 0E9h, 0EAh, 0EBh
red_egg         db 0, 0Dh, 0Eh, 0Fh, 10h ; 54..61
                db 0, 11h, 0Eh, 12h, 13h
                db 0, 14h, 15h, 16h, 17h
                db 0, 0Dh, 18h, 19h, 1Ah
                db 0, 0, 0, 1, 2
                db 0, 0, 0, 4, 5
                db 0, 0, 0, 7, 8
                db 0, 0, 0, 0Bh, 0Ch
red_egg_death   db 0, 1Bh, 1Ch, 1Dh, 1Eh ; 62..64
                db 0, 1Fh, 20h, 21h, 22h
                db 0, 23h, 24h, 25h, 0
eyeball_left    db 0, 27h, 28h, 29h, 2Ah ; 65..70
                db 0, 2Bh, 2Ch, 2Dh, 2Eh
                db 0, 2Fh, 30h, 31h, 32h
                db 0, 33h, 34h, 35h, 36h
                db 0, 37h, 38h, 39h, 3Ah
                db 0, 3Bh, 3Ch, 3Dh, 3Eh
eyeball_right   db 0, 27h, 28h, 29h, 2Ah ; 71..76
                db 0, 2Bh, 2Ch, 2Dh, 2Eh
                db 0, 2Fh, 30h, 31h, 32h
                db 0, 33h, 34h, 35h, 36h
                db 0, 37h, 38h, 39h, 3Ah
                db 0, 3Fh, 40h, 41h, 42h
eyeball_death   db 0, 43h, 44h, 45h, 46h ; 77..79
                db 0, 47h, 48h, 49h, 4Ah
                db 0, 4Bh, 4Ch, 4Dh, 4Eh
vistlet         db 0, 4Fh, 50h, 51h, 52h ; 80..87
                db 0, 53h, 54h, 55h, 56h
                db 0, 57h, 58h, 51h, 52h
                db 0, 59h, 5Ah, 51h, 52h
                db 0, 5Bh, 5Ch, 5Dh, 5Eh
                db 0, 5Fh, 60h, 61h, 62h
                db 0, 63h, 64h, 65h, 66h
                db 0, 0, 0, 69h, 6Ah
vistlet_death   db 0, 6Bh, 6Ch, 6Dh, 6Eh ; 88..90
                db 0, 4Bh, 4Ch, 4Dh, 4Eh
                db 0, 73h, 74h, 75h, 76h
hit             db 1, 3, 6, 0Ah, 26h     ; 91..93
                db 1, 67h, 68h, 6Fh, 70h
                db 1, 71h, 72h, 0A0h, 0C0h
alma_red        db 0, 77h, 78h, 97h, 98h ; 94..97
                db 0, 9Fh, 0ACh, 0BFh, 0C4h
                db 0, 0C8h, 0CAh, 0CCh, 0CEh
                db 0, 9Fh, 0ACh, 0BFh, 0C4h
alma_blue       db 2, 77h, 78h, 97h, 98h ; 98..101
                db 2, 9Fh, 0ACh, 0BFh, 0C4h
                db 2, 0C8h, 0CAh, 0CCh, 0CEh
                db 2, 9Fh, 0ACh, 0BFh, 0C4h
alma_rare       db 1, 77h, 78h, 97h, 98h ; 102..105
                db 1, 9Fh, 0ACh, 0BFh, 0C4h
                db 1, 0C8h, 0CAh, 0CCh, 0CEh
                db 1, 9Fh, 0ACh, 0BFh, 0C4h
chest           db 0, 0D0h, 0D8h, 0D9h, 0DCh ; 106..112
                db 0, 0D0h, 0D8h, 0D9h, 0DCh
                db 0, 0D0h, 0D8h, 0D9h, 0DCh
                db 0, 0D0h, 0D8h, 0D9h, 0DCh
                db 0, 0D0h, 0D8h, 0D9h, 0DCh
                db 0, 0D0h, 0D8h, 0D9h, 0DCh
                db 0, 0D0h, 0D8h, 0D9h, 0DCh
ordinary_key    db 1, 0DDh, 0DEh, 0DFh, 0ECh ; 113
destroyable_wall1 db 0, 0F1h, 0F1h, 0F1h, 0F1h ; 114..117
                db 0, 0F1h, 0F1h, 0F3h, 0F3h
                db 0, 0F4h, 0F4h, 0F6h, 0F6h
                db 0, 0F8h, 0F8h, 0FAh, 0FAh
destroyable_wall2 db 0, 0F2h, 0F2h, 0F1h, 0F1h ; 118..121
                db 0, 0F2h, 0F2h, 0F3h, 0F3h
                db 0, 0FCh, 0FDh, 0F6h, 0F6h
                db 0, 0FEh, 0FEh, 0FAh, 0FAh
pirika_shoe     db 2, 0F5h, 0F7h, 0F9h, 0FBh ; 122
red_potion      db 0, 0EDh, 0EEh, 0EFh, 0F0h ; 123
blue_potion     db 2, 0EDh, 0EEh, 0EFh, 0F0h ; 124
death_descriptors dw offset byte_A32B
                  dw offset byte_A32B
                  dw offset byte_A32F
                  dw offset byte_A333
                  dw offset byte_A333
byte_A32B       db 11, 5, 5, 5
byte_A32F       db 5, 4, 5, 4
byte_A333       db 5, 0, 5, 0

; Here is monster structure for context:
; monster            STRUC   ; offset
;   currX            dw   ?  ; 0
;   currY            db   ?  ; 2
;   m_x_rel          db   ?  ; 3 ; X relative to proximity left (0..35)
;   flags            db   ?  ; 4 ; bits 0..3: monster type
;   ai_flags         db   ?  ; 5 ; bit 7: facing direction (1=right, 0=left)
;   anim_counter     db   ?  ; 6
;   state_flags      db   ?  ; 7
;   hp               db   ?  ; 8
;   ai_state         db   ?  ; 9
;   ai_timer         db   ?  ; 10
;   spwnX            dw   ?  ; 11
;   spwnY            db   ?  ; 13
;   type_            db   ?  ; 14
;   counter          db   ?  ; 15
; monster            ENDS

; SI = monster struct
Monster_AI        proc near

                mov     bl, [si+4]
                and     bl, 0Fh
                xor     bh, bh
                add     bx, bx          ; switch 5 cases
                jmp     jpt_A341[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A341        dw offset man_top_ai      ; jump table for switch statement
                dw offset man_bottom_ai
                dw offset red_egg_ai
                dw offset eyeball_ai
                dw offset vistlet_ai
; ---------------------------------------------------------------------------

man_bottom_ai:                            ; jumptable 0000A341 case 1
                retn
; ---------------------------------------------------------------------------

man_top_ai:                               ; jumptable 0000A341 case 0
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A35A
                mov     byte ptr [si+8], 18h

loc_A35A:
                test    byte ptr [si+5], 20h
                jz      short loc_A363
                jmp     loc_A435
; ---------------------------------------------------------------------------

loc_A363:
                and     byte ptr [si+15h], 0BFh
                call    sub_A56A
                jb      short loc_A36D
                retn
; ---------------------------------------------------------------------------

loc_A36D:
                test    byte ptr [si+9], 1
                jnz     short loc_A3D2
                call    sub_A5C2
                jb      short loc_A3B6
                add     byte ptr [si+6], 80h
                jb      short loc_A381
                jmp     loc_A449
; ---------------------------------------------------------------------------

loc_A381:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                test    byte ptr [si+6], 3
                jz      short loc_A391
                jmp     loc_A449
; ---------------------------------------------------------------------------

loc_A391:
                mov     al, 10h
                cmp     al, [si+3]
                jb      short loc_A3A7
                call    sub_A460
                jnb     short loc_A3A0
                jmp     loc_A449
; ---------------------------------------------------------------------------

loc_A3A0:
                or      byte ptr [si+5], 80h
                jmp     loc_A449
; ---------------------------------------------------------------------------

loc_A3A7:
                call    sub_A4E5
                jnb     short loc_A3AF
                jmp     loc_A449
; ---------------------------------------------------------------------------

loc_A3AF:
                and     byte ptr [si+5], 7Fh
                jmp     loc_A449
; ---------------------------------------------------------------------------

loc_A3B6:
                call    word ptr cs:get_random_proc
                and     al, 0C0h
                jnz     short loc_A381
                mov     al, [si+6]
                not     al
                and     al, 3
                jnz     short loc_A381
                or      byte ptr [si+9], 1
                mov     byte ptr [si+6], 8
                jmp     short loc_A449
; ---------------------------------------------------------------------------

loc_A3D2:
                add     byte ptr [si+6], 80h
                jnb     short loc_A449
                inc     byte ptr [si+6]
                mov     al, [si+6]
                and     al, 0Fh
                cmp     al, 0Bh
                jz      short loc_A3F2
                cmp     al, 0Ch
                jnz     short loc_A449
                and     byte ptr [si+9], 0FEh
                mov     byte ptr [si+6], 3
                jmp     short loc_A449
; ---------------------------------------------------------------------------

loc_A3F2:
                mov     al, [si+3]
                mov     byte_A428, al
                inc     al
                mov     byte_A41B, al
                mov     al, [si+2]
                inc     al
                mov     byte_A429, al
                mov     byte_A41C, al
                mov     bx, offset byte_A41B
                test    byte ptr [si+5], 80h
                jnz     short loc_A414
                mov     bx, offset byte_A428

loc_A414:
                call    word ptr cs:Add_Projectile_To_Array_proc
                jmp     short loc_A449
; ---------------------------------------------------------------------------
byte_A41B       db 0
byte_A41C       db 0
                db 0B1h
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
byte_A428       db 0
byte_A429       db 0
                db 0B1h
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

loc_A435:
                mov     al, [si+5]
                and     al, 0BFh
                or      al, 20h
                mov     [si+5], al
                or      al, 60h
                mov     [si+15h], al
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A449:
                mov     al, [si+6]
                mov     [si+16h], al
                mov     al, [si+5]
                and     al, 80h
                mov     ah, [si+15h]
                and     ah, 7Fh
                or      al, ah
                mov     [si+15h], al
                retn
Monster_AI        endp


; =============== S U B R O U T I N E =======================================


sub_A460        proc near
                cmp     byte ptr [si+3], 22h ; '"'
                cmc
                jnb     short loc_A468
                retn
; ---------------------------------------------------------------------------

loc_A468:
                call    sub_A486
                jnb     short loc_A46E
                retn
; ---------------------------------------------------------------------------

loc_A46E:
                mov     bx, [si]
                inc     bx
                mov     ax, ds:mapWidth
                sub     ax, bx
                jnz     short loc_A479
                xchg    ax, bx

loc_A479:
                mov     [si], bx
                mov     [si+10h], bx
                inc     byte ptr [si+3]
                inc     byte ptr [si+13h]
                clc
                retn
sub_A460        endp


; =============== S U B R O U T I N E =======================================


sub_A486        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                inc     di
                inc     di
                mov     cx, 4

loc_A493:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A49E
                retn
; ---------------------------------------------------------------------------

loc_A49E:
                xchg    si, di
                add     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A493
                xchg    si, di
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                mov     al, [si]
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                xchg    si, di
                add     al, al
                retn
sub_A486        endp


; =============== S U B R O U T I N E =======================================


sub_A4E5        proc near
                cmp     byte ptr [si+3], 2
                jnb     short loc_A4EC
                retn
; ---------------------------------------------------------------------------

loc_A4EC:
                call    sub_A50B
                jnb     short loc_A4F2
                retn
; ---------------------------------------------------------------------------

loc_A4F2:
                mov     ax, [si]
                dec     ax
                cmp     ax, 0FFFFh
                jnz     short loc_A4FE
                mov     ax, ds:mapWidth
                dec     ax

loc_A4FE:
                mov     [si], ax
                mov     [si+10h], ax
                dec     byte ptr [si+3]
                dec     byte ptr [si+13h]
                clc
                retn
sub_A4E5        endp


; =============== S U B R O U T I N E =======================================


sub_A50B        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                dec     di
                mov     cx, 4

loc_A517:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A522
                retn
; ---------------------------------------------------------------------------

loc_A522:
                xchg    si, di
                add     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A517
                dec     di
                xchg    si, di
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                mov     al, [si]
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                sub     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_below_proc
                or      al, [si]
                xchg    si, di
                add     al, al
                retn
sub_A50B        endp


; =============== S U B R O U T I N E =======================================


sub_A56A        proc near
                test    byte ptr [si+3], 0FFh
                stc
                jnz     short loc_A572
                retn
; ---------------------------------------------------------------------------

loc_A572:
                cmp     byte ptr [si+3], 23h ; '#'
                stc
                jnz     short loc_A57A
                retn
; ---------------------------------------------------------------------------

loc_A57A:
                call    sub_A590
                jnb     short loc_A580
                retn
; ---------------------------------------------------------------------------

loc_A580:
                inc     byte ptr [si+2]
                and     byte ptr [si+2], 3Fh
                inc     byte ptr [si+12h]
                and     byte ptr [si+12h], 3Fh
                clc
                retn
sub_A56A        endp


; =============== S U B R O U T I N E =======================================


sub_A590        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    si, di
                add     si, 90h
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     cx, 2

loc_A5A8:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A5B3
                retn
; ---------------------------------------------------------------------------

loc_A5B3:
                inc     di
                loop    loc_A5A8
                dec     di
                mov     al, [di]
                or      al, [di-1]
                or      al, [di-1]
                add     al, al
                retn
sub_A590        endp


; =============== S U B R O U T I N E =======================================


sub_A5C2        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jnb     short loc_A5CC
                neg     al

loc_A5CC:
                cmp     al, 4
                mov     al, 0FFh
                jb      short loc_A5D3
                retn
; ---------------------------------------------------------------------------

loc_A5D3:
                cmp     byte ptr [si+3], 11h
                jnb     short loc_A5E5
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A5E3
                retn
; ---------------------------------------------------------------------------

loc_A5E3:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A5E5:
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A5EF
                retn
; ---------------------------------------------------------------------------

loc_A5EF:
                clc
                retn
sub_A5C2        endp

; ---------------------------------------------------------------------------

red_egg_ai:                               ; jumptable 0000A341 case 2
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A5FB
                mov     byte ptr [si+8], 10h

loc_A5FB:
                test    byte ptr [si+5], 20h
                jnz     short red_egg_hit_check
                jmp     loc_A780
; ---------------------------------------------------------------------------

red_egg_hit_check:
                mov     al, [si+5]
                and     al, 1Fh
                cmp     al, 4
                jnz     short loc_A612
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A612:
                cmp     al, 5
                jnz     short loc_A61B
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A61B:
                cmp     al, 8
                jnz     short loc_A624
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A624:
                cmp     al, 1
                jnz     short loc_A634
                cmp     byte ptr ds:sword_type, 6
                jnz     short loc_A634
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A634:
                and     byte ptr [si+5], 0DFh
                test    byte ptr [si+9], 2
                jz      short red_egg_try_teleport_partner
                jmp     loc_A780
; ---------------------------------------------------------------------------

red_egg_try_teleport_partner:
                call    word ptr cs:Find_Monsters_Near_Hero_proc
                jnb     short loc_A64B
                jmp     loc_A780
; ---------------------------------------------------------------------------

loc_A64B:
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bx, di
                pop     di
                test    byte ptr [si+5], 80h
                jnz     short red_egg_teleport_east
                mov     al, [si+3]
                or      al, al
                jns     short red_egg_teleport_west
                jmp     loc_A780 ; red_egg_move_and_state(m); return;
; ---------------------------------------------------------------------------

red_egg_teleport_west:
                cmp     al, 20h ; ' '
                jb      short loc_A66E
                jmp     loc_A780 ; red_egg_move_and_state(m); return;
; ---------------------------------------------------------------------------
; ..01
; Ee23
; ee45
loc_A66E:
                inc     bx
                inc     bx
                xchg    bx, si
                sub     si, 36 ; start from point 0
                call    word ptr cs:wrap_map_from_below_proc

                mov     cx, 3
loc_A67D:
                lodsb ; check tile at point 0, 2, 4
                call    word ptr cs:is_blocking_proc ; ZF if passable, NZ if blocked
                xchg    bx, si
                    jz      short loc_A68A
                    ; blocked
                    jmp     loc_A780 ; red_egg_move_and_state(m); return;
; ---------------------------------------------------------------------------
loc_A68A:
                xchg    bx, si
                lodsb ; check tile at point 1, 3, 5
                call    word ptr cs:is_blocking_proc
                xchg    bx, si
                    jz      short loc_A699
                    ; blocked
                    jmp     loc_A780 ; red_egg_move_and_state(m); return;
; ---------------------------------------------------------------------------
loc_A699:
                xchg    bx, si
                add     si, 36-2 ; move to next row
                call    word ptr cs:wrap_map_from_above_proc
                loop    loc_A67D

                sub     si, 2*36 ; return to point 2
                call    word ptr cs:wrap_map_from_below_proc
                xchg    si, bx
                push    dx
                or      dl, 80h
                xchg    dl, [bx] ; spawn new egg
                pop     bx
                xor     bh, bh
                mov     ds:proximity_second_layer[bx], dl
                mov     dl, bl
                mov     bx, [si]
                inc     bx
                inc     bx
                mov     ax, ds:mapWidth
                dec     ax
                sub     ax, bx
                jnb     short loc_A6CD
                not     ax
                xchg    ax, bx

loc_A6CD:
                mov     [di], bx
                mov     al, [si+3]
                add     al, 2
                mov     [di+3], al
                jmp     short loc_A749
; ---------------------------------------------------------------------------

red_egg_teleport_east:
                mov     al, [si+3]
                or      al, al
                jns     short loc_A6E3
                jmp     loc_A780
; ---------------------------------------------------------------------------

loc_A6E3:
                cmp     al, 4
                jnb     short loc_A6EA
                jmp     loc_A780
; ---------------------------------------------------------------------------
;01.
;23.Ee
;45.ee
loc_A6EA:
                dec     bx
                dec     bx
                xchg    bx, si
                sub     si, 36+1 ; start from point 0
                call    word ptr cs:wrap_map_from_below_proc
                mov     cx, 3
loc_A6F9:
                lodsb ; check tile at point 0, 2, 4
                call    word ptr cs:is_blocking_proc
                xchg    bx, si
                jnz     short loc_A780
                xchg    bx, si
                lodsb ; check tile at point 1, 3, 5
                call    word ptr cs:is_blocking_proc
                xchg    bx, si
                jnz     short loc_A780
                xchg    bx, si
                add     si, 36-2 ; move to next row
                call    word ptr cs:wrap_map_from_above_proc
                loop    loc_A6F9

                sub     si, 2*36-1 ; return to point 3
                call    word ptr cs:wrap_map_from_below_proc
                xchg    si, bx
                push    dx
                or      dl, 80h
                xchg    dl, [bx] ; spawn new egg
                pop     bx
                xor     bh, bh
                mov     ds:proximity_second_layer[bx], dl
                mov     dl, bl
                mov     bx, [si]
                sub     bx, 2
                jnb     short loc_A73F
                add     bx, ds:mapWidth

loc_A73F:
                mov     [di], bx
                mov     al, [si+3]
                sub     al, 2
                mov     [di+3], al

loc_A749:
                mov     al, [si+2]
                mov     [di+2], al
                mov     al, [si+4]
                or      al, 60h
                mov     [di+4], al
                mov     al, [si+5]
                and     al, 80h
                mov     [di+5], al
                mov     byte ptr [di+6], 4
                mov     al, [si+7]
                mov     [di+7], al
                mov     byte ptr [di+8], 0
                mov     byte ptr [di+9], 2
                mov     byte ptr [di+0Ah], 0
                cmp     ds:monster_index, dl
                jb      short loc_A77C
                retn
; ---------------------------------------------------------------------------

loc_A77C:
                or      byte ptr [si+9], 1

loc_A780:
                call    word ptr cs:move_monster_NWE_if_on_airflow_proc ; pops return address if airflow handled
                mov     al, [si+9]
                and     byte ptr [si+9], 0FEh
                test    al, 1
                jz      short loc_A791
                retn
; ---------------------------------------------------------------------------

loc_A791:
                test    byte ptr [si+9], 2
                jnz     short loc_A7FF
                mov     al, [si+6]
                inc     al
                and     al, 0F3h
                mov     [si+6], al
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A7A9
                retn
; ---------------------------------------------------------------------------

loc_A7A9:
                mov     al, [si+6]
                sub     al, 10h
                mov     ah, al
                mov     [si+6], al
                and     al, 0F0h
                jz      short loc_A7B8
                retn
; ---------------------------------------------------------------------------

loc_A7B8:
                or      ah, 40h
                mov     [si+6], ah
                mov     al, ds:hero_y_absolute
                cmp     al, [si+2]
                jz      short loc_A7D7
                inc     al
                and     al, 3Fh
                cmp     al, [si+2]
                jz      short loc_A7D7
                test    byte ptr [si+5], 80h
                jnz     short loc_A7EA
                jmp     short loc_A7DE
; ---------------------------------------------------------------------------

loc_A7D7:
                mov     al, 11h
                cmp     al, [si+3]
                jnb     short loc_A7EA

loc_A7DE:
                and     byte ptr [si+5], 7Fh
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A7EA
                retn
; ---------------------------------------------------------------------------

loc_A7EA:
                or      byte ptr [si+5], 80h
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A7F6
                retn
; ---------------------------------------------------------------------------

loc_A7F6:
                and     byte ptr [si+5], 7Fh
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A7FF:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                jz      short loc_A809
                retn
; ---------------------------------------------------------------------------

loc_A809:
                and     byte ptr [si+9], 0FDh
                and     byte ptr [si+4], 9Fh
                retn
; ---------------------------------------------------------------------------

eyeball_ai:                               ; jumptable 0000A341 case 3
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A81C
                mov     byte ptr [si+8], 8

loc_A81C:
                test    byte ptr [si+5], 20h
                jz      short loc_A827
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A827:
                call    word ptr cs:move_monster_NWE_if_on_airflow_proc ; pops return address if airflow handled
                test    byte ptr [si+9], 4
                jz      short loc_A835
                jmp     loc_A8DB
; ---------------------------------------------------------------------------

loc_A835:
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A83D
                retn
; ---------------------------------------------------------------------------

loc_A83D:
                test    byte ptr [si+9], 2
                jz      short loc_A89B
                mov     al, [si+6]
                and     al, 7
                jnz     short loc_A84E
                and     byte ptr [si+9], 0FEh

loc_A84E:
                cmp     al, 4
                jnz     short loc_A856
                or      byte ptr [si+9], 1

loc_A856:
                test    byte ptr [si+9], 1
                jnz     short loc_A861
                inc     byte ptr [si+6]
                jmp     short loc_A864
; ---------------------------------------------------------------------------

loc_A861:
                dec     byte ptr [si+6]

loc_A864:
                mov     al, [si+6]
                and     al, 7
                jnz     short loc_A871
                and     byte ptr [si+5], 7Fh
                jmp     short loc_A87A
; ---------------------------------------------------------------------------

loc_A871:
                cmp     al, 4
                jz      short loc_A876
                retn
; ---------------------------------------------------------------------------

loc_A876:
                or      byte ptr [si+5], 80h

loc_A87A:
                call    sub_A5C2
                jnb     short loc_A888
                mov     byte ptr [si+9], 4
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A888:
                call    word ptr cs:get_random_proc
                and     al, 80h
                jnz     short loc_A892
                retn
; ---------------------------------------------------------------------------

loc_A892:
                mov     byte ptr [si+9], 0
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A89B:
                call    sub_A5C2
                jnb     short loc_A8A9
                mov     byte ptr [si+9], 4
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A8A9:
                inc     byte ptr [si+0Ah]
                and     al, 7
                jnz     short loc_A8B4
                mov     byte ptr [si+9], 2

loc_A8B4:
                add     byte ptr [si+6], 80h
                jb      short loc_A8BB
                retn
; ---------------------------------------------------------------------------

loc_A8BB:
                test    byte ptr [si+5], 80h
                jnz     short loc_A8CE
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A8C9
                retn
; ---------------------------------------------------------------------------

loc_A8C9:
                mov     byte ptr [si+9], 2
                retn
; ---------------------------------------------------------------------------

loc_A8CE:
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A8D6
                retn
; ---------------------------------------------------------------------------

loc_A8D6:
                mov     byte ptr [si+9], 2
                retn
; ---------------------------------------------------------------------------

loc_A8DB:
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 5
                jb      short loc_A8BB
                mov     byte ptr [si+6], 5
                test    byte ptr [si+5], 80h
                jnz     short loc_A904
                call    word ptr cs:move_monster_W_proc
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A8FB
                retn
; ---------------------------------------------------------------------------

loc_A8FB:
                mov     byte ptr [si+9], 2
                mov     byte ptr [si+6], 0
                retn
; ---------------------------------------------------------------------------

loc_A904:
                call    word ptr cs:move_monster_E_proc
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A911
                retn
; ---------------------------------------------------------------------------

loc_A911:
                mov     byte ptr [si+9], 2
                mov     byte ptr [si+6], 4
                retn
; ---------------------------------------------------------------------------

vistlet_ai:                               ; jumptable 0000A341 case 4
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A924
                mov     byte ptr [si+8], 8

loc_A924:
                test    byte ptr [si+5], 20h
                jz      short loc_A92F
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A92F:
                call    word ptr cs:move_monster_NWE_if_on_airflow_proc ; pops return address if airflow handled
                test    byte ptr [si+9], 1
                jnz     short loc_A993
                test    byte ptr [si+9], 2
                jnz     short loc_A9BC
                mov     al, 0Fh
                cmp     al, [si+3]
                jnb     short loc_A958
                mov     al, 12h
                cmp     al, [si+3]
                jb      short loc_A958
                or      byte ptr [si+9], 1
                mov     byte ptr [si+6], 4
                jmp     short loc_A966
; ---------------------------------------------------------------------------

loc_A958:
                mov     al, [si+6]
                inc     al
                and     al, 3
                and     byte ptr [si+6], 0F0h
                or      [si+6], al

loc_A966:
                call    word ptr cs:move_monster_N_proc
                add     byte ptr [si+6], 80h
                jb      short loc_A972
                retn
; ---------------------------------------------------------------------------

loc_A972:
                mov     al, 10h
                cmp     al, [si+3]
                jb      short loc_A986
                call    word ptr cs:move_monster_E_proc
                jb      short loc_A981
                retn
; ---------------------------------------------------------------------------

loc_A981:
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A986:
                call    word ptr cs:move_monster_W_proc
                jb      short loc_A98E
                retn
; ---------------------------------------------------------------------------

loc_A98E:
                jmp     word ptr cs:move_monster_E_proc
; ---------------------------------------------------------------------------

loc_A993:
                mov     al, [si+6]
                and     al, 7
                cmp     al, 5
                jnb     short loc_A9A0
                inc     byte ptr [si+6]
                retn
; ---------------------------------------------------------------------------

loc_A9A0:
                call    word ptr cs:move_monster_S_proc
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A9AD
                retn
; ---------------------------------------------------------------------------

loc_A9AD:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                jz      short loc_A9B7
                retn
; ---------------------------------------------------------------------------

loc_A9B7:
                mov     byte ptr [si+9], 2
                retn
; ---------------------------------------------------------------------------

loc_A9BC:
                mov     al, 10h
                cmp     al, [si+3]
                jb      short loc_A9DD
                call    word ptr cs:move_monster_N_proc
                call    word ptr cs:move_monster_NE_proc
                jb      short loc_A9D0
                retn
; ---------------------------------------------------------------------------

loc_A9D0:
                call    word ptr cs:move_monster_N_proc
                jb      short loc_A9D8
                retn
; ---------------------------------------------------------------------------

loc_A9D8:
                and     byte ptr [si+9], 0FDh
                retn
; ---------------------------------------------------------------------------

loc_A9DD:
                call    word ptr cs:move_monster_N_proc
                call    word ptr cs:move_monster_NW_proc
                jb      short loc_A9EA
                retn
; ---------------------------------------------------------------------------

loc_A9EA:
                call    word ptr cs:move_monster_N_proc
                jb      short loc_A9F2
                retn
; ---------------------------------------------------------------------------

loc_A9F2:
                and     byte ptr [si+9], 0FDh
                retn

eai5          ends


                end start