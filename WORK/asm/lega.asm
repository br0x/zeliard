include common.inc
include dungeon.inc
                .286
                .model small

lega          segment byte public 'CODE'
                assume cs:lega, ds:lega
                org 0A000h
start:
                dw offset Lega_AI_proc
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
                db 160, 160, 160, 160, 160, 160, 80, 10, 10, 10, 10, 10, 10, 10, 10, 10
                db 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10
                dw offset byte_A03E  ; 0..15
                dw offset byte_A08E  ; 16..31
                dw offset byte_A0DE  ; 32..47
                dw offset byte_A12E  ; 48..63
                dw offset byte_A17E  ; 64..79
                dw offset byte_A1CE  ; 80..90
                dw offset byte_A205  ; 91..96
byte_A03E       db 2, 0, 0, 0, 3             ; 0
                db 2, 0, 0, 4, 0
                db 2, 0, 0, 0, 5
                db 2, 0, 0, 6, 0
                db 2, 0, 0, 0, 7
                db 2, 0, 0, 8, 0
                db 2, 0, 0ADh, 0, 0AFh
                db 2, 0AEh, 0, 0B0h, 0
                db 2, 0B1h, 0B2h, 0B5h, 0B6h
                db 2, 0B3h, 0B4h, 0B7h, 0B8h
                db 2, 0B9h, 0BAh, 39h, 1
                db 2, 75h, 0AAh, 2, 38h
                db 2, 0, 0, 0, 1
                db 2, 0, 0, 2, 0
                db 2, 0, 0, 0, 0BBh
                db 2, 0, 0, 0BCh, 0          ; 15
byte_A08E       db 0, 9, 0Ah, 0Bh, 0Ch       ; 16
                db 0, 0Dh, 0Eh, 10h, 11h
                db 0, 0Eh, 0Fh, 11h, 12h
                db 0, 13h, 14h, 15h, 16h
                db 0, 17h, 18h, 19h, 1Ah
                db 0, 19h, 1Ah, 1Ch, 1Dh
                db 0, 1Ah, 1Bh, 1Dh, 1Eh
                db 0, 1Fh, 13h, 20h, 21h
                db 0, 13h, 14h, 21h, 16h
                db 0, 20h, 21h, 22h, 23h
                db 0, 21h, 16h, 23h, 18h
                db 0, 24h, 1Ah, 25h, 1Dh
                db 0, 1Ah, 1Bh, 1Dh, 1Eh
                db 0, 0Dh, 0Eh, 26h, 27h
                db 0, 0Fh, 0, 28h, 29h
                db 0, 2Ah, 2Bh, 2Eh, 2Fh     ; 31
byte_A0DE       db 0, 2Ch, 2Dh, 30h, 31h     ; 32
                db 0, 32h, 33h, 36h, 37h
                db 0, 34h, 35h, 19h, 1Ah
                db 0, 36h, 37h, 3Ah, 3Bh
                db 0, 19h, 1Ah, 1Ch, 1Dh
                db 0, 1Ah, 0, 1Dh, 1Eh
                db 0, 0Dh, 0Eh, 3Dh, 27h
                db 0, 3Ch, 3Dh, 3Eh, 3Fh
                db 0, 3Fh, 40h, 43h, 44h
                db 0, 41h, 42h, 45h, 46h
                db 0, 47h, 48h, 49h, 0
                db 0, 4Ah, 0Eh, 4Dh, 27h
                db 0, 34h, 35h, 58h, 59h
                db 0, 4Bh, 4Ch, 4Eh, 4Fh
                db 0, 50h, 51h, 0, 44h
                db 0, 58h, 59h, 5Ah, 5Bh     ; 47
byte_A12E       db 0, 53h, 54h, 56h, 57h     ; 48
                db 0, 4Eh, 4Fh, 54h, 55h
                db 0, 0, 0, 52h, 53h
                db 0, 0Dh, 0Eh, 5Dh, 27h
                db 0, 0Eh, 0Fh, 27h, 28h
                db 0, 61h, 2Ch, 6Ah, 6Bh
                db 0, 2Ch, 69h, 6Bh, 6Ch
                db 0, 6Bh, 6Ch, 6Dh, 6Eh
                db 0, 6Eh, 6Fh, 70h, 71h
                db 0, 70h, 71h, 5Ah, 72h
                db 0, 0, 5Ch, 5Eh, 5Fh
                db 0, 5Ch, 5Dh, 5Fh, 60h
                db 0, 62h, 63h, 65h, 66h
                db 0, 64h, 65h, 67h, 68h
                db 0, 0Dh, 0Eh, 73h, 74h
                db 0, 0Eh, 0Fh, 74h, 12h     ; 63
byte_A17E       db 0, 76h, 77h, 7Ah, 7Bh     ; 64
                db 0, 78h, 79h, 7Ch, 7Dh
                db 0, 17h, 7Ah, 19h, 1Ah
                db 0, 19h, 1Ah, 1Ch, 1Dh
                db 0, 1Ah, 1Bh, 1Dh, 1Eh
                db 0, 7Eh, 7Fh, 82h, 83h
                db 0, 80h, 81h, 84h, 85h
                db 0, 19h, 1Ah, 0A2h, 0A3h
                db 0, 1Ah, 1Bh, 0A3h, 0A4h
                db 0, 7Eh, 7Fh, 0A5h, 83h
                db 0, 0, 0, 0A0h, 0A1h
                db 0, 7Eh, 7Fh, 0ACh, 83h
                db 0, 1Ah, 1Bh, 1Dh, 0ABh
                db 0, 19h, 1Ah, 0A9h, 1Dh
                db 0, 0, 0A6h, 0A7h, 0A8h
                db 0, 86h, 87h, 88h, 89h     ; 79
byte_A1CE       db 0, 8Bh, 8Ch, 8Eh, 8Fh     ; 80
                db 0, 89h, 8Ah, 8Ch, 8Dh
                db 0, 92h, 93h, 96h, 97h
                db 0, 8Fh, 90h, 93h, 94h
                db 0, 98h, 99h, 1Ah, 9Bh
                db 0, 99h, 9Ah, 9Bh, 9Ch
                db 0, 1Ah, 9Bh, 9Dh, 9Eh
                db 0, 9Bh, 9Ch, 9Eh, 9Fh
                db 0, 91h, 92h, 95h, 96h
                db 0, 17h, 98h, 19h, 1Ah
                db 0, 19h, 1Ah, 1Ch, 9Dh     ; 90
byte_A205       db 2, 0BDh, 0BEh, 0BFh, 0C0h ; 91
                db 2, 0C1h, 0C2h, 0C3h, 0C4h
                db 2, 0C5h, 0C6h, 0C7h, 0C8h
                db 2, 0C9h, 0CAh, 0CBh, 0CCh
                db 2, 0CDh, 0CEh, 0CFh, 0D0h
                db 2, 0, 0, 0D1h, 0D2h       ; 96

; =============== S U B R O U T I N E =======================================


Lega_AI_proc    proc near

                mov     si, ds:monsters_table_addr
                mov     byte_A7B6, 0
                mov     byte_A7B7, 0

loc_A231:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A26D
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A264
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A7B6
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte ptr [si+5], 40h
                jz      short loc_A264
                mov     al, [si+5]
                and     al, 1Fh
                mov     byte_A7B7, al

loc_A264:
                inc     byte_A7B6
                add     si, 10h
                jmp     short loc_A231
; ---------------------------------------------------------------------------

loc_A26D:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                test    byte_A7B7, 0FFh
                jz      short loc_A2B5
                mov     al, byte_A7B7
                push    ax
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                xor     bh, bh
                pop     ax
                cmp     al, 9
                jz      short loc_A29C
                cmp     al, 1
                jnz     short loc_A296
                add     bx, bx
                jmp     short loc_A29C
; ---------------------------------------------------------------------------

loc_A296:
                shr     bx, 1
                shr     bx, 1
                shr     bx, 1

loc_A29C:
                call    sub_A644
                mov     byte ptr ds:soundFX_request, 47
                cmp     byte ptr boss_x, 47
                jnb     short loc_A2B5
                mov     byte_A7BF, 14h
                mov     byte_A7BD, 0FFh

loc_A2B5:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A2BF
                jmp     loc_A66E
; ---------------------------------------------------------------------------

loc_A2BF:
                test    byte_A7C0, 0FFh
                jz      short loc_A2C9
                jmp     loc_A3B5
; ---------------------------------------------------------------------------

loc_A2C9:
                test    byte_A7C2, 0FFh
                jz      short loc_A2DA
                cmp     byte_A7C7, 0Dh
                jnb     short loc_A2DA
                jmp     loc_A35F
; ---------------------------------------------------------------------------

loc_A2DA:
                test    byte_A7BD, 0FFh
                jnz     short loc_A316
                mov     byte_A7BF, 3Ch ; '<'
                inc     byte_A7B9
                and     byte_A7B9, 7
                mov     al, byte_A7B9
                push    cs
                pop     es
                mov     di, offset byte_A41F
                mov     cx, 5
                repne scasb
                jnz     short loc_A314
                push    ax
                call    sub_A429
                sbb     al, al
                mov     byte_A7BD, al
                pop     ax
                cmp     al, 7
                jnz     short loc_A314
                call    sub_A429
                sbb     al, al
                mov     byte_A7BD, al

loc_A314:
                jmp     short loc_A35F
; ---------------------------------------------------------------------------

loc_A316:
                dec     byte_A7BF
                jnz     short loc_A323
                mov     byte_A7BD, 0
                jmp     short loc_A35F
; ---------------------------------------------------------------------------

loc_A323:
                mov     al, byte_A7B9
                or      al, al
                jnz     short loc_A32C
                mov     al, 8

loc_A32C:
                cmp     al, 6
                jnz     short loc_A332
                sub     al, 2

loc_A332:
                dec     al
                mov     byte_A7B9, al
                push    cs
                pop     es
                mov     di, offset byte_A424
                mov     cx, 5
                repne scasb
                jnz     short loc_A35F
                push    ax
                call    sub_A43B
                cmc
                sbb     al, al
                mov     byte_A7BD, al
                pop     ax
                cmp     al, 6
                jz      short loc_A356
                cmp     al, 3
                jnz     short loc_A323

loc_A356:
                call    sub_A43B
                cmc
                sbb     al, al
                mov     byte_A7BD, al

loc_A35F:
                test    byte_A7BD, 0FFh
                jnz     short loc_A39F
                cmp     byte_A7B9, 6
                jnz     short loc_A39F
                call    word ptr cs:get_random_proc
                and     al, 1
                jnz     short loc_A39F
                test    byte_A7C2, 0FFh
                jnz     short loc_A39F
                mov     ax, cs:boss_x
                sub     ax, 20
                jb      short loc_A39F
                mov     byte_A7C0, 0FFh
                mov     byte_A7C1, 0
                mov     byte_A7BE, 0
                mov     byte_A7B9, 8
                mov     byte ptr ds:soundFX_request, 48

loc_A39F:
                inc     byte_A7BB
                and     byte_A7BB, 3
                mov     al, byte_A7BB
                mov     bx, offset byte_A41B
                xlat
                mov     byte_A7BA, al
                jmp     loc_A44C
; ---------------------------------------------------------------------------

loc_A3B5:
                inc     byte_A7C1
                mov     bl, byte_A7C1
                dec     bl
                xor     bh, bh
                add     bx, bx          ; switch 3 cases
                jmp     jpt_A3C3[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A3C3        dw offset loc_A3CD      ; jump table for switch statement
                dw offset loc_A3FE
                dw offset loc_A40A
; ---------------------------------------------------------------------------

loc_A3CD:                               ; jumptable 0000A3C3 case 0
                mov     byte_A7BA, 6
                mov     byte_A7B9, 8
                mov     byte_A7C2, 0FFh
                mov     ax, boss_x
                add     ax, 4
                mov     word_A7C3, ax
                mov     al, boss_y
                and     al, 3Fh
                mov     byte_A7C5, al
                mov     byte_A7C6, 0
                mov     byte_A7C7, 0
                mov     byte_A7C8, 0
                jmp     short loc_A44C
; ---------------------------------------------------------------------------

loc_A3FE:                               ; jumptable 0000A3C3 case 1
                mov     byte_A7BA, 7
                mov     byte_A7B9, 6
                jmp     short loc_A44C
; ---------------------------------------------------------------------------

loc_A40A:                               ; jumptable 0000A3C3 case 2
                mov     byte_A7BA, 0
                mov     byte_A7C0, 0
                mov     byte_A7B9, 6
                jmp     short loc_A44C
Lega_AI_proc    endp ; sp-analysis failed

; ---------------------------------------------------------------------------
byte_A41B       db 0, 1, 2, 1
byte_A41F       db 2, 5, 6, 7, 0
byte_A424       db 1, 3, 6, 7, 7

; =============== S U B R O U T I N E =======================================


sub_A429        proc near
                mov     ax, boss_x
                dec     ax
                mov     bx, 0Eh
                sub     bx, ax
                mov     boss_x, ax
                cmc
                jnb     short loc_A439
                retn
; ---------------------------------------------------------------------------

loc_A439:
                clc
                retn
sub_A429        endp


; =============== S U B R O U T I N E =======================================


sub_A43B        proc near
                mov     ax, boss_x
                inc     ax
                mov     bx, 50
                sub     bx, ax
                jnb     short loc_A447
                retn
; ---------------------------------------------------------------------------

loc_A447:
                mov     boss_x, ax
                clc
                retn
sub_A43B        endp

; ---------------------------------------------------------------------------

loc_A44C:
                push    cs
                pop     es
                mov     di, offset unk_A7C9
                mov     cx, 40
                mov     ax, 0FFFFh
                rep stosw
                mov     bl, byte_A7B9
                xor     bh, bh
                add     bx, bx
                mov     si, off_A6C8[bx]
                mov     bp, off_A744[bx]
                mov     di, offset unk_A7CB
                mov     cx, 8

loc_A46F:
                push    cx
                mov     cx, 8

loc_A473:
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A47B
                movsb
                dec     di

loc_A47B:
                inc     di
                loop    loc_A473
                inc     di
                inc     di
                inc     bp
                pop     cx
                loop    loc_A46F
                mov     al, byte_A7BA
                add     al, al
                mov     di, offset unk_A7F1
                cmp     byte_A7B9, 6
                jz      short loc_A49A
                cmp     byte_A7B9, 8
                jb      short loc_A49B

loc_A49A:
                inc     di

loc_A49B:
                stosb
                add     di, 19
                inc     al
                stosb
                mov     byte_A7B6, 0
                mov     ax, boss_x
                mov     si, ds:monsters_table_addr
                mov     di, offset unk_A7C9
                mov     cx, 8

loc_A4B4:
                push    cx
                push    di
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_A7BC, bl
                jb      short loc_A537
                xor     cl, cl

loc_A4C5:
                push    cx
                push    ax
                cmp     byte ptr [di], 0FFh
                jz      short loc_A52D
                mov     [si], ax
                mov     al, boss_y
                add     al, cl
                and     al, 3Fh
                mov     [si+2], al
                mov     al, byte_A7BC
                mov     [si+3], al
                mov     al, [di]
                mov     [si+6], al
                mov     ah, al
                add     al, al
                sbb     al, al
                and     al, 60h
                mov     bl, ah
                shr     bl, 1
                shr     bl, 1
                shr     bl, 1
                shr     bl, 1
                and     bl, 7
                or      al, bl
                mov     [si+4], al
                mov     byte ptr [si+5], 0
                test    byte_A7B7, 0FFh
                jz      short loc_A50C
                or      byte ptr [si+5], 20h

loc_A50C:
                push    di
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A7B6
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                pop     di
                add     si, 10h
                inc     byte_A7B6

loc_A52D:
                inc     di
                pop     ax
                pop     cx
                inc     cl
                cmp     cl, 10
                jnz     short loc_A4C5

loc_A537:
                inc     ax
                pop     di
                add     di, 10
                pop     cx
                loop    loc_A541
                jmp     short loc_A544
; ---------------------------------------------------------------------------

loc_A541:
                jmp     loc_A4B4
; ---------------------------------------------------------------------------

loc_A544:
                call    sub_A5FA
                mov     word ptr [si], 0FFFFh
                test    byte_A7C2, 0FFh
                jnz     short loc_A553
                retn
; ---------------------------------------------------------------------------

loc_A553:
                test    byte_A7C8, 0FFh
                jnz     short loc_A5C6
                cmp     byte ptr word_A7C3, 18
                jnb     short loc_A571
                mov     byte_A7C8, 0FFh
                mov     byte_A7C6, 3
                mov     byte ptr ds:soundFX_request, 50
                retn
; ---------------------------------------------------------------------------

loc_A571:
                mov     bl, byte_A7C7
                xor     bh, bh
                add     bx, bx
                mov     al, byte_A5D8[bx]
                add     byte ptr word_A7C3, al
                mov     al, byte_A5D9[bx]
                add     byte_A7C5, al
                cmp     byte_A7C7, 16
                adc     byte_A7C7, 0
                mov     al, byte_A7C6
                inc     al
                cmp     al, 3
                jb      short loc_A59E
                xor     al, al

loc_A59E:
                mov     byte_A7C6, al
                cmp     byte_A7C7, 9
                jnz     short loc_A5AD
                mov     byte ptr ds:soundFX_request, 49

loc_A5AD:
                cmp     byte_A7C7, 12
                jnz     short loc_A5B9
                mov     byte ptr ds:soundFX_request, 49

loc_A5B9:
                cmp     byte_A7C7, 15
                jnz     short locret_A5C5
                mov     byte ptr ds:soundFX_request, 49

locret_A5C5:
                retn
; ---------------------------------------------------------------------------

loc_A5C6:
                inc     byte_A7C6
                cmp     byte_A7C6, 6
                jnb     short loc_A5D2
                retn
; ---------------------------------------------------------------------------

loc_A5D2:
                mov     byte_A7C2, 0
                retn
; ---------------------------------------------------------------------------
byte_A5D8       db 0FFh
byte_A5D9       db 0
                db 0FFh
                db    0
                db 0FFh
                db    1
                db    0
                db    2
                db 0FFh
                db    2
                db    0
                db    2
                db 0FFh
                db    2
                db 0FFh
                db 0FEh
                db 0FFh
                db    0
                db 0FFh
                db    2
                db 0FFh
                db 0FFh
                db 0FFh
                db    0
                db 0FFh
                db    1
                db 0FFh
                db    0
                db 0FFh
                db    0
                db 0FFh
                db    0
                db 0FFh
                db    0

; =============== S U B R O U T I N E =======================================


sub_A5FA        proc near
                test    byte_A7C2, 0FFh
                jnz     short loc_A602
                retn
; ---------------------------------------------------------------------------

loc_A602:
                mov     ax, word_A7C3
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                jnb     short loc_A60F
                retn
; ---------------------------------------------------------------------------

loc_A60F:
                mov     [si], ax
                mov     al, byte_A7C5
                mov     [si+2], al
                mov     [si+3], bl
                mov     byte ptr [si+4], 26h ; '&'
                mov     byte ptr [si+5], 0
                mov     al, byte_A7C6
                mov     [si+6], al
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A7B6
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                add     si, 10h
                retn
sub_A5FA        endp


; =============== S U B R O U T I N E =======================================


sub_A644        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_A64D
                xor     ax, ax

loc_A64D:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_A65E
                retn
; ---------------------------------------------------------------------------

loc_A65E:
                mov     byte_A7B8, 0
                mov     byte_A7C2, 0
                mov     byte ptr ds:boss_being_hit, 0FFh
                retn
sub_A644        endp

; ---------------------------------------------------------------------------

loc_A66E:
                cmp     byte_A7B8, 40
                jnb     short loc_A6C2
                mov     byte ptr ds:sprite_flash_flag, 0FFh
                inc     byte_A7B8
                cmp     byte_A7B8, 10
                jnb     short loc_A6A5
                mov     al, byte_A7B8
                mov     bx, offset byte_A69B
                xlat
                mov     byte_A7B9, al
                cmp     al, 3
                jb      short loc_A698
                mov     byte ptr ds:soundFX_request, 51

loc_A698:
                jmp     loc_A39F
; ---------------------------------------------------------------------------
byte_A69B       db 0, 1, 2, 3, 6, 7, 6, 3, 2, 1
; ---------------------------------------------------------------------------

loc_A6A5:
                mov     ah, byte_A7B8
                mov     al, 6
                cmp     ah, 6
                jnb     short loc_A6B6
                mov     al, ah
                mov     bx, offset byte_A6BC
                xlat

loc_A6B6:
                mov     byte_A7BA, al
                jmp     loc_A44C
; ---------------------------------------------------------------------------
byte_A6BC       db 3, 3, 4, 4, 5, 5
; ---------------------------------------------------------------------------
loc_A6C2:
                mov     byte ptr ds:0FF30h, 0FFh
                retn
; ---------------------------------------------------------------------------
off_A6C8        dw offset byte_A6DC
                dw offset byte_A6E3
                dw offset byte_A6EC
                dw offset byte_A6F6
                dw offset byte_A701
                dw offset byte_A70C
                dw offset byte_A718
                dw offset byte_A722
                dw offset byte_A72E
                dw offset byte_A739
byte_A6DC       db 11h, 10h, 12h, 13h, 14h, 15h, 16h
byte_A6E3       db 11h, 17h, 19h, 10h, 12h, 18h, 1Ah, 1Bh, 1Ch
byte_A6EC       db 1Dh, 1Fh, 21h, 23h, 10h, 1Eh, 20h, 22h, 24h, 25h
byte_A6F6       db 29h, 2Ah, 27h, 26h, 28h, 10h, 1Eh, 20h, 22h, 24h, 25h
byte_A701       db 32h, 30h, 2Dh, 31h, 2Bh, 2Eh, 10h, 1Eh, 20h, 2Ch, 2Fh
byte_A70C       db 3Dh, 3Ah, 3Ch, 3Bh, 33h, 10h, 34h, 35h, 36h, 37h, 38h, 39h
byte_A718       db 42h, 43h, 40h, 44h, 3Eh, 10h, 3Fh, 41h, 45h, 46h
byte_A722       db 58h, 59h, 5Ah, 4Fh, 50h, 52h, 54h, 56h, 51h, 53h, 55h, 57h
byte_A72E       db 0CAh, 42h, 47h, 40h, 48h, 3Eh, 10h, 3Fh, 41h, 45h, 46h
byte_A739       db 0CEh, 42h, 4Dh, 40h, 4Ch, 3Eh, 10h, 3Fh, 41h, 45h, 46h
off_A744        dw offset byte_A758
                dw offset byte_A760
                dw offset byte_A768
                dw offset byte_A770
                dw offset byte_A778
                dw offset byte_A780
                dw offset byte_A788
                dw offset byte_A790
                dw offset byte_A798
                dw offset byte_A798
byte_A758       db 0, 0, 0, 0, 20h, 0ABh, 1, 0
byte_A760       db 0, 0, 0, 0, 2Ch, 0ADh, 1, 0
byte_A768       db 0, 0, 0, 0, 2Bh, 80h, 2Bh, 1
byte_A770       db 0, 0, 5, 10h, 28h, 80h, 2Bh, 1
byte_A778       db 8, 4, 18h, 0, 28h, 80h, 2Bh, 0
byte_A780       db 0, 2, 14h, 10h, 20h, 0A8h, 0Ch, 3
byte_A788       db 0, 0, 3, 5, 10h, 55h, 0, 1
byte_A790       db 0, 0, 0, 0, 0Bh, 0ABh, 53h, 0
byte_A798       db 1, 0, 3, 5, 10h, 55h, 0, 1
boss_state_block:
boss_x          dw 38
boss_y          db 7
boss_hp         dw 640
xp_reward       dw 6000
arena_center_x  db 8
boss_placement  db 0FFh
                dw offset name_screen_x
almas_reward    dw 1500
name_screen_x   db  11h
name_screen_y   db 0BBh
                db    2
aTarso          db 5,'Tarso'
byte_A7B6       db 0
byte_A7B7       db 0
byte_A7B8       db 0
byte_A7B9       db 0
byte_A7BA       db 0
byte_A7BB       db 0
byte_A7BC       db 0
byte_A7BD       db 0
byte_A7BE       db 0
byte_A7BF       db 0
byte_A7C0       db 0
byte_A7C1       db 0
byte_A7C2       db 0
word_A7C3       dw 0
byte_A7C5       db 0
byte_A7C6       db 0
byte_A7C7       db 0
byte_A7C8       db 0
unk_A7C9        db    0
                db    0
unk_A7CB        db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
unk_A7F1        db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0

lega          ends

                end start