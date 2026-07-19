include common.inc
include dungeon.inc
                .286
                .model small

eai2            segment byte public 'CODE'
                assume cs:eai2, ds:eai2
                org 0A000h
start:
                dw offset Monster_AI
                db    0
                db    0
                db    0
                db    0
                dw offset death_descriptors
monster_xp      db 10, 10, 4, 10, 4, 255, 0, 0
monster_damage  db 10, 10, 8, 10, 8, 40, 0, 0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
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
                dw offset boarman_top_left_frames
                dw offset boarman_bottom_left_frames
                dw offset blue_slime_frames
                dw offset red_toad_left_frames
                dw offset green_bat_left_frames ; green bat
                dw offset magic_bat_left_frames ; magical bat
                dw    0
                dw    0
                dw offset boarman_top_death_frames
                dw offset boarman_bottom_death_frames
                dw offset blue_slime_death_frames
                dw offset red_toad_death_frames
                dw offset green_bat_death_frames ; green bat
                dw offset magic_bat_death_frames
                dw    0
                dw    0
                dw offset wall_destruction_frames
                dw offset wall_destruction_frames
                dw offset hit_frames
                dw offset chest_frames
                dw offset almas_glow_frames
                dw offset almas_glow_frames_alt
                dw offset ordinary_key_frames
                dw    0
                dw offset red_potion_frames
                dw offset blue_potion_frames
                dw    0
                dw offset rare_almas_frames
                dw offset sign_frames
                dw    0
                dw    0
                dw    0
                ; A070
                dw offset boarman_top_right_frames
                dw offset boarman_bottom_right_frames
                dw offset blue_slime_frames
                dw offset red_toad_right_frames
                dw offset green_bat_right_frames ; green bat
                dw offset magic_bat_right_frames ; magical bat
                dw    0
                dw    0
                dw offset boarman_top_death_frames
                dw offset boarman_bottom_death_frames
                dw offset blue_slime_death_frames
                dw offset red_toad_death_frames
                dw offset green_bat_death_frames ; green bat
                dw offset magic_bat_death_frames ; magical bat
                dw    0
                dw    0
                dw offset wall_destruction_frames
                dw offset wall_destruction_frames
                dw offset hit_frames
                dw offset chest_frames
                dw offset almas_glow_frames
                dw offset almas_glow_frames_alt
                dw offset ordinary_key_frames
                dw    0
                dw offset red_potion_frames
                dw offset blue_potion_frames
                dw    0
                dw offset rare_almas_frames
                dw offset sign_frames
                dw    0
                dw    0
                dw    0
boarman_top_left_frames     db 0, 21h, 22h, 23h, 24h
                            db 0, 25h, 26h, 27h, 28h
                            db 0, 29h, 2Ah, 2Bh, 2Ch
                            db 0, 25h, 26h, 27h, 28h
                            db 0, 25h, 26h, 27h, 28h
                            db 0, 25h, 26h, 27h, 28h
                            db 0, 25h, 26h, 27h, 28h
                            db 0, 25h, 26h, 27h, 28h
boarman_top_right_frames    db 0, 2Dh, 2Eh, 2Fh, 30h
                            db 0, 31h, 32h, 33h, 34h
                            db 0, 35h, 36h, 37h, 38h
                            db 0, 31h, 32h, 33h, 34h
                            db 0, 31h, 32h, 33h, 34h
                            db 0, 31h, 32h, 33h, 34h
                            db 0, 31h, 32h, 33h, 34h
                            db 0, 31h, 32h, 33h, 34h
boarman_top_death_frames    db 0, 39h, 3Ah, 3Bh, 3Ch
                            db 0, 3Dh, 0, 3Eh, 3Fh
                            db 0, 0, 0, 0, 0
boarman_bottom_left_frames  db 0, 40h, 41h, 42h, 43h
                            db 0, 44h, 45h, 46h, 47h
                            db 0, 48h, 49h, 4Ah, 4Bh
                            db 0, 44h, 45h, 4Ch, 4Dh
                            db 0, 44h, 45h, 46h, 4Eh
                            db 0, 5Eh, 45h, 46h, 4Eh
                            db 0, 5Fh, 45h, 46h, 4Eh
                            db 0, 5Eh, 45h, 46h, 4Eh
boarman_bottom_right_frames db 0, 4Fh, 50h, 51h, 52h
                            db 0, 53h, 54h, 55h, 56h
                            db 0, 57h, 58h, 59h, 5Ah
                            db 0, 53h, 54h, 5Bh, 5Ch
                            db 0, 53h, 54h, 5Dh, 56h
                            db 0, 53h, 60h, 5Dh, 56h
                            db 0, 53h, 61h, 5Dh, 56h
                            db 0, 53h, 60h, 5Dh, 56h
boarman_bottom_death_frames db 0, 62h, 63h, 64h, 65h
                            db 0, 66h, 67h, 68h, 69h
                            db 0, 6Ah, 6Bh, 6Ch, 6Dh
blue_slime_frames           db 2, 0, 0, 7Dh, 7Eh
                            db 2, 0, 0, 7Fh, 80h
                            db 2, 0, 0, 83h, 84h
                            db 2, 85h, 86h, 87h, 88h
                            db 2, 85h, 86h, 87h, 88h
                            db 2, 0, 0, 83h, 84h
                            db 2, 0, 0, 7Fh, 80h
                            db 2, 0, 0, 7Dh, 7Eh
                            db 2, 0, 0, 89h, 8Ah
                            db 2, 0, 0, 8Bh, 8Ch
                            db 2, 0, 0, 89h, 8Ah
                            db 2, 0, 0, 8Dh, 8Eh
blue_slime_death_frames     db 2, 0, 0, 91h, 92h
                            db 2, 93h, 94h, 95h, 96h
                            db 2, 97h, 98h, 99h, 9Ah
red_toad_left_frames        db 0, 9Bh, 9Ch, 9Dh, 9Eh
                            db 0, 9Bh, 9Ch, 9Fh, 9Eh
                            db 0, 0A1h, 0A2h, 0A3h, 0A4h
                            db 0, 0A5h, 0A2h, 0A6h, 0A7h
                            db 0, 0A8h, 0A9h, 0AAh, 0ABh
                            db 0, 0ACh, 0ADh, 0AEh, 0AFh
                            db 0, 9Bh, 9Ch, 9Dh, 9Eh
                            db 0, 9Bh, 9Ch, 0A0h, 9Eh
red_toad_right_frames       db 0, 0B4h, 0B5h, 0B6h, 0B7h
                            db 0, 0B4h, 0B5h, 0B6h, 0B8h
                            db 0, 0BAh, 0BBh, 0BCh, 0BDh
                            db 0, 0BAh, 0BEh, 0BFh, 0C0h
                            db 0, 0C1h, 0C2h, 0C3h, 0C4h
                            db 0, 0C5h, 0C6h, 0C7h, 0C8h
                            db 0, 0B4h, 0B5h, 0B6h, 0B7h
                            db 0, 0B4h, 0B5h, 0B6h, 0B9h
red_toad_death_frames       db 0, 0CDh, 0CEh, 0CFh, 0D0h
                            db 0, 0D1h, 0D2h, 0D3h, 0D4h
                            db 0, 0, 0, 0D7h, 0D8h
green_bat_left_frames       db 0, 0D9h, 0DAh, 0DBh, 0DCh
                            db 0, 0E1h, 0E2h, 0E3h, 0E4h
                            db 0, 0E1h, 0E2h, 0E3h, 0E4h
                            db 0, 0E5h, 0E6h, 0E7h, 0E8h
                            db 0, 0E9h, 0EAh, 0EBh, 0ECh
                            db 0, 0E5h, 0E6h, 0E7h, 0E8h
                            db 0, 0EDh, 0EEh, 0EFh, 0F0h
green_bat_right_frames      db 0, 0D9h, 0DAh, 0DBh, 0DCh
                            db 0, 0DDh, 0DEh, 0DFh, 0E0h
                            db 0, 0DDh, 0DEh, 0DFh, 0E0h
                            db 0, 81h, 82h, 8Fh, 90h
                            db 0, 0B0h, 0B1h, 0B2h, 0B3h
                            db 0, 81h, 82h, 8Fh, 90h
                            db 0, 0C9h, 0CAh, 0CBh, 0CCh
green_bat_death_frames      db 0, 0D5h, 0D6h, 0F1h, 0F2h
                            db 0, 0F3h, 0F4h, 0F5h, 0F6h
                            db 0, 0F7h, 0F8h, 0F9h, 0FAh
magic_bat_left_frames       db 1, 0D9h, 0DAh, 0DBh, 0DCh
                            db 1, 0E1h, 0E2h, 0E3h, 0E4h
                            db 1, 0E1h, 0E2h, 0E3h, 0E4h
                            db 1, 0E5h, 0E6h, 0E7h, 0E8h
                            db 1, 0E9h, 0EAh, 0EBh, 0ECh
                            db 1, 0E5h, 0E6h, 0E7h, 0E8h
                            db 1, 0EDh, 0EEh, 0EFh, 0F0h
magic_bat_right_frames      db 1, 0D9h, 0DAh, 0DBh, 0DCh
                            db 1, 0DDh, 0DEh, 0DFh, 0E0h
                            db 1, 0DDh, 0DEh, 0DFh, 0E0h
                            db 1, 81h, 82h, 8Fh, 90h
                            db 1, 0B0h, 0B1h, 0B2h, 0B3h
                            db 1, 81h, 82h, 8Fh, 90h
                            db 1, 0C9h, 0CAh, 0CBh, 0CCh
magic_bat_death_frames      db 1, 0D5h, 0D6h, 0F1h, 0F2h
                            db 1, 0F3h, 0F4h, 0F5h, 0F6h
                            db 1, 0F7h, 0F8h, 0F9h, 0FAh
hit_frames                  db 1, 1, 2, 3, 4
                            db 1, 5, 6, 7, 8
                            db 1, 9, 0Ah, 0Bh, 0Ch
almas_glow_frames           db 0, 0Dh, 0Eh, 0Fh, 10h
                            db 0, 11h, 12h, 13h, 14h
                            db 0, 15h, 16h, 17h, 18h
                            db 0, 11h, 12h, 13h, 14h
almas_glow_frames_alt       db 2, 0Dh, 0Eh, 0Fh, 10h
                            db 2, 11h, 12h, 13h, 14h
                            db 2, 15h, 16h, 17h, 18h
                            db 2, 11h, 12h, 13h, 14h
rare_almas_frames           db 1, 0Dh, 0Eh, 0Fh, 10h
                            db 1, 11h, 12h, 13h, 14h
                            db 1, 15h, 16h, 17h, 18h
                            db 1, 11h, 12h, 13h, 14h
chest_frames                db 0, 19h, 1Ah, 1Bh, 1Ch
                            db 0, 19h, 1Ah, 1Bh, 1Ch
                            db 0, 19h, 1Ah, 1Bh, 1Ch
                            db 0, 19h, 1Ah, 1Bh, 1Ch
ordinary_key_frames         db 1, 1Dh, 1Eh, 1Fh, 20h
wall_destruction_frames     db 1, 6Eh, 6Eh, 6Eh, 6Eh
                            db 1, 6Fh, 70h, 71h, 72h
                            db 1, 73h, 74h, 75h, 76h
                            db 1, 0, 0, 77h, 78h
sign_frames                 db 2, 79h, 7Ah, 7Bh, 7Ch
red_potion_frames           db 0, 0FBh, 0FCh, 0FDh, 0FEh
blue_potion_frames          db 2, 0FBh, 0FCh, 0FDh, 0FEh
death_descriptors dw offset boarman_death_desc
                  dw offset boarman_death_desc
                  dw offset blue_slime_death_desc
                  dw offset red_toad_death_desc
                  dw offset green_bat_death_desc ; green bat
                  dw offset magic_bat_death_desc ; magical bat
boarman_death_desc    db 5, 5, 5, 5
blue_slime_death_desc db 4, 0, 4, 0
red_toad_death_desc   db 5, 4, 4, 0
green_bat_death_desc  db 5, 4, 5, 0       ; green bat
magic_bat_death_desc  db 9, 9, 9, 9       ; magical bat

; =============== S U B R O U T I N E =======================================

; si points to monster struct:
; monster            STRUC   ; offset
;   currX            dw   ?  ; 0
;   currY            db   ?  ; 2 ; Y always 0..63, no need to call it "relative"
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
; Access struct members with macro MEM8(si+field_offset) or MEM16(si+field_offset)
Monster_AI      proc near

                mov     bl, [si+4] ; monster.flags
                and     bl, 0Fh
                xor     bh, bh
                add     bx, bx          ; switch 6 cases
                jmp     jpt_A373[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A373        dw offset monster0_ai
                dw offset monster1_ai
                dw offset monster2_ai
                dw offset monster3_ai
                dw offset monster45_ai
                dw offset monster45_ai
; ---------------------------------------------------------------------------

monster1_ai:                            ; jumptable 0000A373 case 1
                retn
; ---------------------------------------------------------------------------

monster0_ai:                            ; jumptable 0000A373 case 0
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A38E
                mov     byte ptr [si+8], 8

loc_A38E:
                test    byte ptr [si+5], 20h
                jz      short loc_A397
                jmp     loc_A6AB
; ---------------------------------------------------------------------------

loc_A397:
                test    byte ptr [si+15h], 40h
                jz      short loc_A3A0
                jmp     loc_A6AB
; ---------------------------------------------------------------------------

loc_A3A0:
                call    sub_A653
                jb      short loc_A3A6
                retn
; ---------------------------------------------------------------------------

loc_A3A6:
                test    byte ptr [si+9], 1
                jz      short loc_A3AF
                jmp     loc_A49D
; ---------------------------------------------------------------------------

loc_A3AF:
                call    sub_A8F4
                jb      short loc_A3F0
                cmp     al, 0FFh
                jz      short loc_A3BC
                xor     byte ptr [si+5], 80h

loc_A3BC:
                add     byte ptr [si+6], 80h
                jb      short loc_A3C5
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A3C5:
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                test    byte ptr [si+5], 80h
                jnz     short loc_A3E1
                call    sub_A5CE
                jb      short loc_A3DA
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A3DA:
                or      byte ptr [si+5], 80h
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A3E1:
                call    sub_A549
                jb      short loc_A3E9
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A3E9:
                and     byte ptr [si+5], 7Fh
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A3F0:
                and     byte ptr [si+5], 7Fh
                mov     al, 11h
                cmp     al, [si+3]
                jb      short loc_A3FF
                or      byte ptr [si+5], 80h

loc_A3FF:
                test    byte ptr [si+5], 80h
                jz      short loc_A42E
                sub     al, [si+3]
                cmp     al, byte_A6D6
                jz      short loc_A459
                jb      short loc_A41F
                call    sub_A549
                jb      short loc_A459
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A41F:
                call    sub_A5CE
                jb      short loc_A488
                dec     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A42E:
                mov     ah, [si+3]
                sub     ah, al
                cmp     ah, byte_A6D7
                jz      short loc_A459
                jb      short loc_A44A
                call    sub_A5CE
                jb      short loc_A459
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A44A:
                call    sub_A549
                jb      short loc_A488
                dec     byte ptr [si+6]
                and     byte ptr [si+6], 3
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A459:                               ;
                call    word ptr cs:get_random_proc
                and     al, 3
                dec     al
                add     al, 8
                mov     byte_A6D6, al
                call    word ptr cs:get_random_proc
                and     al, 3
                sub     al, 2
                add     al, 9
                mov     byte_A6D7, al
                call    sub_A8F4
                jb      short loc_A47D
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A47D:
                or      byte ptr [si+9], 1
                mov     byte ptr [si+6], 4
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A488:                               ;
                call    word ptr cs:get_random_proc
                and     al, 1
                jz      short loc_A492
                retn
; ---------------------------------------------------------------------------

loc_A492:
                or      byte ptr [si+9], 3
                mov     byte ptr [si+6], 4
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A49D:
                inc     byte ptr [si+6]
                cmp     byte ptr [si+6], 6
                jz      short loc_A4BA
                cmp     byte ptr [si+6], 8
                jz      short loc_A4AF
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A4AF:
                and     byte ptr [si+9], 0FCh
                mov     byte ptr [si+6], 0
                jmp     loc_A6BF
; ---------------------------------------------------------------------------

loc_A4BA:
                mov     al, [si+3]
                mov     byte_A50A, al
                mov     byte_A524, al
                inc     al
                mov     byte_A4FD, al
                mov     byte_A517, al
                mov     al, [si+2]
                add     al, 2
                mov     byte_A50B, al
                mov     byte_A4FE, al
                mov     byte_A525, al
                mov     byte_A518, al
                mov     bx, offset byte_A4FD
                mov     ax, offset byte_A517
                test    byte ptr [si+5], 80h
                jnz     short loc_A4EE
                mov     bx, offset byte_A50A
                mov     ax, offset byte_A524

loc_A4EE:
                test    byte ptr [si+9], 2 ; .ai_state
                jz      short loc_A4F5 ; bx is fine
                ; use offset from ax
                xchg    ax, bx

loc_A4F5:                               ;
                call    word ptr cs:Add_Projectile_To_Array_proc ; bx points to projectile struct
                jmp     loc_A6BF
Monster_AI      endp

; ---------------------------------------------------------------------------
byte_A4FD       db 0
byte_A4FE       db 0, 9Ah, 0, 0FFh, 40h, 8, 0, 0
                dw offset right_trajectory ; p_curved_path_data_ptr
                db 0, 0
byte_A50A       db 0
byte_A50B       db 0, 9Ah, 0, 0FFh, 40h, 8, 0, 0
                dw offset left_trajectory ; p_curved_path_data_ptr
                db 0, 0
                ; projectile 1
byte_A517       db 0 ; p_x_rel
byte_A518       db 0, 9Ah, 0, 7, 0, 14h, 0, 0, 0, 0, 0, 0
                ; projectile 2
byte_A524       db 0 ; p_x_rel
byte_A525       db 0, 9Ah, 0, 7, 4, 14h, 0, 0, 0, 0, 0, 0
; A531
right_trajectory db 1, 1, 1, 0, 0, 7, 7, 7, 7, 7, 7, 0FFh
; A53D
left_trajectory  db 3, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 0FFh

; =============== S U B R O U T I N E =======================================


sub_A549        proc near
                cmp     byte ptr [si+3], 22h ; '"'
                cmc
                jnb     short loc_A551
                retn
; ---------------------------------------------------------------------------
setDeathDescriptors
loc_A551:
                call    sub_A56F
                jnb     short loc_A557
                retn
; ---------------------------------------------------------------------------

loc_A557:
                mov     bx, [si]
                inc     bx
                mov     ax, ds:mapWidth
                sub     ax, bx
                jnz     short loc_A562
                xchg    ax, bx

loc_A562:
                mov     [si], bx
                mov     [si+10h], bx
                inc     byte ptr [si+3]
                inc     byte ptr [si+13h]
                clc
                retn
sub_A549        endp


; =============== S U B R O U T I N E =======================================


sub_A56F        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                inc     di
                inc     di
                mov     cx, 4

loc_A57C:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A587
                retn
; ---------------------------------------------------------------------------

loc_A587:
                xchg    si, di
                add     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A57C
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
sub_A56F        endp


; =============== S U B R O U T I N E =======================================


sub_A5CE        proc near
                cmp     byte ptr [si+3], 2
                jnb     short loc_A5D5
                retn
; ---------------------------------------------------------------------------

loc_A5D5:
                call    sub_A5F4
                jnb     short loc_A5DB
                retn
; ---------------------------------------------------------------------------

loc_A5DB:
                mov     ax, [si]
                dec     ax
                cmp     ax, 0FFFFh
                jnz     short loc_A5E7
                mov     ax, ds:mapWidth
                dec     ax

loc_A5E7:
                mov     [si], ax
                mov     [si+10h], ax
                dec     byte ptr [si+3]
                dec     byte ptr [si+13h]
                clc
                retn
sub_A5CE        endp


; =============== S U B R O U T I N E =======================================


sub_A5F4        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                dec     di
                mov     cx, 4

loc_A600:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A60B
                retn
; ---------------------------------------------------------------------------

loc_A60B:
                xchg    si, di
                add     si, 24h ; '$'
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                loop    loc_A600
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
sub_A5F4        endp


; =============== S U B R O U T I N E =======================================


sub_A653        proc near
                test    byte ptr [si+3], 0FFh
                stc
                jnz     short loc_A65B
                retn
; ---------------------------------------------------------------------------

loc_A65B:
                cmp     byte ptr [si+3], 23h ; '#'
                stc
                jnz     short loc_A663
                retn
; ---------------------------------------------------------------------------

loc_A663:
                call    sub_A679
                jnb     short loc_A669
                retn
; ---------------------------------------------------------------------------

loc_A669:
                inc     byte ptr [si+2]
                and     byte ptr [si+2], 3Fh
                inc     byte ptr [si+12h]
                and     byte ptr [si+12h], 3Fh
                clc
                retn
sub_A653        endp


; =============== S U B R O U T I N E =======================================


sub_A679        proc near
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    si, di
                add     si, 90h
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     cx, 2

loc_A691:
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                stc
                jz      short loc_A69C
                retn
; ---------------------------------------------------------------------------

loc_A69C:
                inc     di
                loop    loc_A691
                dec     di
                mov     al, [di]
                or      al, [di-1]
                or      al, [di-1]
                add     al, al
                retn
sub_A679        endp

; ---------------------------------------------------------------------------

loc_A6AB:
                mov     al, [si+15h]
                and     al, 0BFh
                or      al, 20h
                mov     [si+5], al
                or      al, 60h
                mov     [si+15h], al
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A6BF:
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
byte_A6D6       db 8
byte_A6D7       db 8
; ---------------------------------------------------------------------------

monster2_ai:                            ; jumptable 0000A373 case 2
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A6E2
                mov     byte ptr [si+8], 4

loc_A6E2:
                test    byte ptr [si+5], 20h
                jz      short loc_A6ED
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A6ED:                               ;
                call    word ptr cs:move_monster_S_proc
                jb      short loc_A6F5
                retn
; ---------------------------------------------------------------------------

loc_A6F5:
                test    byte ptr [si+9], 1
                jnz     short loc_A712
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                jz      short loc_A705
                retn
; ---------------------------------------------------------------------------

loc_A705:
                or      byte ptr [si+9], 1
                and     byte ptr [si+9], 0FDh
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A712:
                test    byte ptr [si+9], 2
                jnz     short loc_A787
                mov     al, [si+0Ah]
                and     al, 3
                add     al, 8
                mov     [si+6], al
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 8
                jz      short loc_A72C
                retn
; ---------------------------------------------------------------------------

loc_A72C:
                or      byte ptr [si+9], 2
                call    word ptr cs:11Ah ; get_random_proc
                or      al, al
                js      short loc_A760
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    si, di
                add     si, 4Ah ; 'J'
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                jz      short loc_A75B
                jmp     word ptr cs:move_monster_E_proc
; ---------------------------------------------------------------------------

loc_A75B:                               ;
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A760:
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                xchg    si, di
                add     si, 47h ; 'G'
                call    word ptr cs:wrap_map_from_above_proc
                xchg    si, di
                mov     al, [di]
                call    word ptr cs:is_blocking_proc
                jz      short loc_A782
                jmp     word ptr cs:move_monster_W_proc
; ---------------------------------------------------------------------------

loc_A782:                               ;
                jmp     word ptr cs:move_monster_E_proc
; ---------------------------------------------------------------------------

loc_A787:
                mov     al, [si+0Ah]
                and     al, 3
                add     al, 8
                mov     [si+6], al
                inc     byte ptr [si+0Ah]
                cmp     byte ptr [si+0Ah], 0Ch
                jz      short loc_A79B
                retn
; ---------------------------------------------------------------------------

loc_A79B:
                and     byte ptr [si+9], 0FEh
                mov     byte ptr [si+6], 0
                retn
; ---------------------------------------------------------------------------

monster3_ai:                            ;
                call    word ptr cs:check_monster_on_aggressive_ground_proc
                jnz     short loc_A7B0
                jmp     word ptr cs:Check_Vertical_Distance_Between_Hero_And_Monster_proc
; ---------------------------------------------------------------------------

loc_A7B0:
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A7BA
                mov     byte ptr [si+8], 2

loc_A7BA:
                test    byte ptr [si+5], 20h
                jz      short loc_A7C5
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A7C5:
                test    byte ptr [si+9], 2
                jz      short loc_A7CE
                jmp     loc_A8BC
; ---------------------------------------------------------------------------

loc_A7CE:
                test    byte ptr [si+9], 4
                jz      short loc_A7D7
                jmp     loc_A871
; ---------------------------------------------------------------------------

loc_A7D7:
                test    byte ptr [si+9], 8
                jnz     short loc_A82B
                add     byte ptr [si+6], 21h ; '!'
                and     byte ptr [si+6], 0E1h
                call    word ptr cs:move_monster_S_proc
                jc      short loc_A7ED
                retn
; ---------------------------------------------------------------------------

loc_A7ED:
                call    sub_A8F4
                jb      short loc_A811
                mov     al, [si+6]
                and     al, 0E0h
                jz      short loc_A7FA
                retn
; ---------------------------------------------------------------------------

loc_A7FA:
                call    sub_A8F4
                cmp     al, 0FFh
                jz      short loc_A811
                and     byte ptr [si+5], 7Fh
                or      [si+5], al
                mov     byte ptr [si+6], 2
                or      byte ptr [si+9], 8
                retn
; ---------------------------------------------------------------------------

loc_A811:
                call    word ptr cs:get_random_proc
                and     al, 1
                jnz     short loc_A823
                or      byte ptr [si+9], 4
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A823:
                mov     byte ptr [si+6], 2
                or      byte ptr [si+9], 8

loc_A82B:
                mov     al, [si+6]
                mov     ah, al
                inc     al
                and     al, 7
                cmp     al, 7
                jnb     short loc_A864
                mov     ch, ah
                and     ch, 0F0h
                or      al, ch
                mov     [si+6], al
                mov     bx, offset toad_jump_angles_right
                test    byte ptr [si+5], 80h
                jnz     short loc_A84E
                mov     bx, offset toad_jump_angles_left

loc_A84E:
                mov     al, ah
                sub     al, 2
                xlat    ; al = angle
                call    word ptr cs:monster_move_in_direction_proc
                jc      short loc_A85B
                retn
; ---------------------------------------------------------------------------

loc_A85B:       ; blocked
                call    sub_A8F4
                jb      short loc_A864
                xor     byte ptr [si+5], 80h

loc_A864:
                and     byte ptr [si+9], 0F7h
                mov     byte ptr [si+6], 0
                jmp     word ptr cs:move_monster_S_proc
; ---------------------------------------------------------------------------

loc_A871:
                inc     byte ptr [si+0Ah]
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 1
                cmp     byte ptr [si+0Ah], 4
                jz      short loc_A882
                retn
; ---------------------------------------------------------------------------

loc_A882:
                mov     byte ptr [si+6], 7
                mov     al, [si+3]
                mov     byte_A8DF, al
                inc     al
                mov     byte_A8D2, al
                mov     al, [si+2]
                inc     al
                and     al, 3Fh
                mov     byte_A8E0, al
                mov     byte_A8D3, al
                mov     bx, offset byte_A8D2
                test    byte ptr [si+5], 80h
                jnz     short loc_A8AA
                mov     bx, offset byte_A8DF

loc_A8AA:                               ;
                call    word ptr cs:Add_Projectile_To_Array_proc
                and     byte ptr [si+9], 0FBh
                or      byte ptr [si+9], 2
                mov     byte ptr [si+0Ah], 0
                retn
; ---------------------------------------------------------------------------

loc_A8BC:
                inc     byte ptr [si+0Ah]
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 1
                cmp     byte ptr [si+0Ah], 6
                jz      short loc_A8CD
                retn
; ---------------------------------------------------------------------------

loc_A8CD:
                and     byte ptr [si+9], 0FDh
                retn
; ---------------------------------------------------------------------------
byte_A8D2       db 0
byte_A8D3       db 0
                db  9Eh
                db    0
                db    6
                db    0
                db  14h
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A8DF       db 0
byte_A8E0       db 0
                db  9Eh
                db    0
                db    6
                db    4
                db  14h
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
toad_jump_angles_right  db 1, 0, 0, 7
toad_jump_angles_left   db 3, 4, 4, 5

; =============== S U B R O U T I N E =======================================


sub_A8F4        proc near
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                jns     short loc_A8FE
                neg     al

loc_A8FE:
                cmp     al, 5
                mov     al, 0FFh
                jb      short loc_A905
                retn
; ---------------------------------------------------------------------------

loc_A905:
                cmp     byte ptr [si+3], 11h
                jnb     short loc_A917
                mov     al, 80h
                test    byte ptr [si+5], 80h
                stc
                jz      short loc_A915
                retn
; ---------------------------------------------------------------------------

loc_A915:
                clc
                retn
; ---------------------------------------------------------------------------

loc_A917:
                xor     al, al
                test    byte ptr [si+5], 80h
                stc
                jnz     short loc_A921
                retn
; ---------------------------------------------------------------------------

loc_A921:
                clc
                retn
sub_A8F4        endp

; ---------------------------------------------------------------------------

monster45_ai:                           ;
                call    word ptr cs:check_monster_on_aggressive_ground_proc
                jnz     short loc_A92F
                jmp     word ptr cs:Check_Vertical_Distance_Between_Hero_And_Monster_proc
; ---------------------------------------------------------------------------

loc_A92F:
                test    byte ptr [si+8], 0FFh
                jnz     short loc_A939
                mov     byte ptr [si+8], 3

loc_A939:
                test    byte ptr [si+5], 20h
                jz      short loc_A944
                jmp     word ptr cs:Hero_Hits_monster_proc
; ---------------------------------------------------------------------------

loc_A944:
                mov     bl, [si+9]
                rol     bl, 1
                rol     bl, 1
                and     bl, 3
                xor     bh, bh
                add     bx, bx          ; switch 4 cases
                jmp     jpt_A952[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A952        dw offset loc_A95E      ; jump table for switch statement
                dw offset loc_A989
                dw offset loc_A99C
                dw offset loc_AA3C
; ---------------------------------------------------------------------------

loc_A95E:                               ;
                call    word ptr cs:move_monster_N_proc
                test    byte ptr [si+6], 0FFh
                jz      short loc_A96E
                sub     byte ptr [si+6], 10h
                retn
; ---------------------------------------------------------------------------

loc_A96E:
                mov     al, [si+3]
                sub     al, 11h
                cmp     al, 0Ah
                jb      short loc_A980
                mov     al, 11h
                sub     al, [si+3]
                cmp     al, 7
                jnb     short loc_A984

loc_A980:
                mov     byte ptr [si+9], 40h ; '@'

loc_A984:
                mov     byte ptr [si+6], 0
                retn
; ---------------------------------------------------------------------------

loc_A989:                               ; jumptable 0000A952 case 1
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                cmp     byte ptr [si+6], 3
                jz      short loc_A997
                retn
; ---------------------------------------------------------------------------

loc_A997:
                mov     byte ptr [si+9], 80h
                retn
; ---------------------------------------------------------------------------

loc_A99C:                               ; jumptable 0000A952 case 2
                call    sub_AA8D
                test    byte ptr ds:hero_damage_this_frame, 0FFh
                jz      short loc_A9AB
                mov     byte ptr [si+9], 0C0h
                retn
; ---------------------------------------------------------------------------

loc_A9AB:                               ;
                mov     al, ds:hero_y_absolute
                sub     al, [si+2]
                add     al, 15h
                and     al, 3Fh
                cmp     al, 12h
                jb      short loc_AA09
                cmp     al, 18h
                jb      short loc_A9E3
                cmp     byte ptr [si+3], 11h
                jz      short loc_AA2F
                cmp     byte ptr [si+3], 10h
                jz      short loc_AA2F
                jnb     short loc_A9D7
                call    word ptr cs:move_monster_SE_proc
                jb      short loc_A9F1
                or      byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A9D7:                               ;
                call    word ptr cs:move_monster_SW_proc
                jb      short loc_A9FD
                and     byte ptr [si+5], 7Fh
                retn
; ---------------------------------------------------------------------------

loc_A9E3:
                cmp     byte ptr [si+3], 11h
                jz      short loc_AA2F
                cmp     byte ptr [si+3], 10h
                jz      short loc_AA2F
                jnb     short loc_A9FD

loc_A9F1:                               ;
                call    word ptr cs:move_monster_E_proc
                jb      short loc_AA2F
                or      byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_A9FD:                               ;
                call    word ptr cs:move_monster_W_proc
                jb      short loc_AA2F
                and     byte ptr [si+5], 7Fh
                retn
; ---------------------------------------------------------------------------

loc_AA09:
                cmp     byte ptr [si+3], 11h
                jz      short loc_AA2F
                cmp     byte ptr [si+3], 10h
                jz      short loc_AA2F
                jnb     short loc_AA23
                call    word ptr cs:move_monster_NE_proc
                jb      short loc_A9F1
                or      byte ptr [si+5], 80h
                retn
; ---------------------------------------------------------------------------

loc_AA23:                               ;
                call    word ptr cs:move_monster_NW_proc
                jb      short loc_A9FD
                and     byte ptr [si+5], 7Fh
                retn
; ---------------------------------------------------------------------------

loc_AA2F:                               ;
                call    word ptr cs:move_monster_S_proc
                jb      short loc_AA37
                retn
; ---------------------------------------------------------------------------

loc_AA37:
                mov     byte ptr [si+9], 0C0h
                retn
; ---------------------------------------------------------------------------

loc_AA3C:                               ; jumptable 0000A952 case 3
                test    byte ptr [si+9], 20h
                jnz     short loc_AA76
                call    sub_AA8D
                test    byte ptr [si+5], 80h
                jz      short loc_AA59
                call    word ptr cs:move_monster_NE_proc
                jb      short loc_AA53
                retn
; ---------------------------------------------------------------------------

loc_AA53:
                and     byte ptr [si+5], 7Fh
                jmp     short loc_AA65
; ---------------------------------------------------------------------------

loc_AA59:                               ;
                call    word ptr cs:move_monster_NW_proc
                jb      short loc_AA61
                retn
; ---------------------------------------------------------------------------

loc_AA61:
                or      byte ptr [si+5], 80h

loc_AA65:                               ;
                call    word ptr cs:move_monster_N_proc
                jb      short loc_AA6D
                retn
; ---------------------------------------------------------------------------

loc_AA6D:
                or      byte ptr [si+9], 20h
                mov     byte ptr [si+6], 2
                retn
; ---------------------------------------------------------------------------

loc_AA76:
                dec     byte ptr [si+6]
                and     byte ptr [si+6], 7
                test    byte ptr [si+6], 0FFh
                jz      short loc_AA84
                retn
; ---------------------------------------------------------------------------

loc_AA84:
                mov     byte ptr [si+6], 70h ; 'p'
                mov     byte ptr [si+9], 0
                retn

; =============== S U B R O U T I N E =======================================


sub_AA8D        proc near
                inc     byte ptr [si+6]
                and     byte ptr [si+6], 7
                cmp     byte ptr [si+6], 7
                jnb     short loc_AA9B
                retn
; ---------------------------------------------------------------------------

loc_AA9B:
                mov     byte ptr [si+6], 3
                retn
sub_AA8D        endp

eai2            ends
                end     start
