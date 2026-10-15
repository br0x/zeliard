include common.inc
include dungeon.inc
                .286
                .model small

meda          segment byte public 'CODE'
                assume cs:meda, ds:meda
                org 0A000h
start:
                dw offset Meda_AI_proc
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
                db 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh
                db 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh, 1Eh
                ; A030
                dw offset byte_A050 ; 0..15
                dw offset byte_A0A0 ; 16..31
                dw offset byte_A0F0 ; 32..47
                dw offset byte_A140 ; 48..62
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw 0
                dw offset byte_A18B ; 63..78
                dw offset byte_A1DB ; 79..81
byte_A050       db 0, 1, 0, 2, 3
                db 0, 0, 4, 5, 6
                db 0, 0, 7, 16h, 9
                db 0, 8, 0Bh, 0Ah, 0Ch
                db 0, 0Dh, 0Eh, 0Fh, 10h
                db 0, 11h, 12h, 13h, 0Ah
                db 0, 14h, 0, 0Ah, 15h
                db 0, 0, 17h, 18h, 19h
                db 0, 1Ah, 1Bh, 1Ch, 0Ah
                db 0, 1Dh, 1Eh, 1Fh, 20h
                db 0, 21h, 22h, 0Ah, 23h
                db 0, 0Ah, 24h, 0Ah, 25h
                db 0, 26h, 0Ah, 27h, 0Ah
                db 0, 28h, 0Ah, 29h, 0Ah
                db 0, 2Ah, 0Ah, 2Bh, 0Ah
                db 0, 0Ah, 0Ah, 0Ah, 2Ch
byte_A0A0       db 0, 2Dh, 0, 0Ah, 2Eh
                db 0, 0Ah, 2Fh, 0Ah, 30h
                db 0, 0Ah, 31h, 32h, 33h
                db 0, 34h, 0, 35h, 36h
                db 0, 0, 0, 37h, 38h
                db 0, 0, 39h, 3Ah, 3Bh
                db 0, 0, 0, 3Ch, 3Dh
                db 0, 3Eh, 3Fh, 40h, 41h
                db 0, 42h, 43h, 44h, 45h
                db 0, 46h, 47h, 48h, 49h
                db 0, 5Ah, 5Bh, 5Ch, 5Dh
                db 0, 5Eh, 5Fh, 60h, 61h
                db 0, 62h, 63h, 64h, 65h
                db 0, 66h, 67h, 68h, 69h
                db 0, 6Ah, 6Bh, 6Ch, 6Dh
                db 0, 6Eh, 6Fh, 70h, 71h
byte_A0F0       db 0, 72h, 73h, 74h, 75h
                db 0, 76h, 77h, 78h, 79h
                db 0, 7Ah, 7Bh, 7Ch, 7Dh
                db 0, 7Eh, 7Fh, 68h, 69h
                db 0, 80h, 81h, 6Ch, 6Dh
                db 0, 82h, 83h, 70h, 71h
                db 0, 72h, 84h, 85h, 86h
                db 0, 76h, 87h, 88h, 89h
                db 0, 62h, 63h, 8Ah, 8Bh
                db 0, 8Ch, 8Dh, 68h, 69h
                db 0, 8Eh, 8Fh, 6Ch, 6Dh
                db 0, 90h, 91h, 70h, 71h
                db 0, 92h, 84h, 93h, 94h
                db 0, 95h, 96h, 97h, 98h
                db 0, 99h, 63h, 8Ah, 9Ah
                db 0, 9Bh, 9Ch, 68h, 69h
byte_A140       db 0, 9Dh, 9Eh, 6Ch, 6Dh
                db 0, 9Fh, 0A0h, 70h, 71h
                db 0, 72h, 0A1h, 0A2h, 0A3h
                db 0, 76h, 77h, 0A4h, 0A5h
                db 0, 62h, 63h, 0A6h, 0A7h
                db 0, 0A8h, 0A9h, 68h, 69h
                db 0, 6Ah, 0AAh, 6Ch, 6Dh
                db 0, 0ABh, 0ACh, 70h, 71h
                db 0, 5Ah, 0ADh, 0AEh, 0AFh
                db 0, 0B0h, 0B1h, 0B2h, 0B3h
                db 0, 0B4h, 7Bh, 0B5h, 0B6h
                db 0, 0B7h, 0B8h, 0B9h, 0BAh
                db 0, 0BBh, 0BCh, 6Ch, 0BDh
                db 0, 0BEh, 0BFh, 70h, 71h
                db 0, 42h, 43h, 44h, 0CCh
byte_A18B       db 0, 4Ah, 4Bh, 4Ch, 4Dh
                db 0, 4Eh, 4Fh, 50h, 51h
                db 0, 52h, 53h, 54h, 55h
                db 0, 56h, 57h, 58h, 59h
                db 0, 0C0h, 0C1h, 0C2h, 0C3h
                db 0, 0C4h, 0C5h, 0C6h, 0C7h
                db 0, 0, 0, 0C8h, 0C9h
                db 0, 0, 0, 0CAh, 0CBh
                db 0, 0C0h, 0C1h, 0CDh, 0CEh
                db 0, 0CFh, 0C5h, 0C6h, 0C7h
                db 0, 0C0h, 0C1h, 0D0h, 0D1h
                db 0, 0D2h, 0C5h, 0C6h, 0C7h
                db 0, 0, 0, 0C8h, 0D3h
                db 0, 0, 0, 0, 0D4h
                db 0, 0C0h, 0C1h, 0D5h, 0D6h
                db 0, 0D7h, 0C5h, 0D8h, 0C7h
byte_A1DB       db 0, 0, 0D9h, 0DAh, 0DBh
                db 0, 0C0h, 0C1h, 0C2h, 0DCh
                db 0, 0DDh, 0C5h, 0DEh, 0C7h

; =============== S U B R O U T I N E =======================================


Meda_AI_proc    proc near

                mov     si, ds:monsters_table_addr
                mov     byte_A731, 0
                mov     byte_A732, 0

loc_A1F8:
                cmp     word ptr [si], 0FFFFh
                jz      short loc_A243
                mov     ax, [si]
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A23A
                mov     [si+3], bl
                mov     ax, [si+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A731
                xor     bh, bh
                mov     al, ds:proximity_second_layer[bx]
                mov     [di], al
                test    byte ptr [si+5], 40h
                jz      short loc_A23A
                test    byte_A732, 80h
                jnz     short loc_A23A
                mov     al, [si+5]
                and     al, 1Fh
                test    byte ptr [si+4], 8
                jz      short loc_A237
                or      al, 80h

loc_A237:
                mov     byte_A732, al

loc_A23A:
                inc     byte_A731
                add     si, 10h
                jmp     short loc_A1F8
; ---------------------------------------------------------------------------

loc_A243:
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh
                mov     al, byte_A732
                and     al, 1Fh
                jz      short loc_A287
                push    ax
                call    word ptr cs:Get_Stats_proc
                mov     bl, ah
                pop     ax
                shr     bl, 1
                shr     bl, 1
                shr     bl, 1
                xor     bh, bh
                cmp     al, 1
                jnz     short loc_A27F
                cmp     byte ptr ds:sword_type, 4
                jb      short loc_A27F
                add     bx, bx
                add     bx, bx
                add     bx, bx
                add     bx, bx
                add     bx, bx
                mov     byte ptr ds:soundFX_request, 2Dh ; '-'
                jmp     short loc_A284
; ---------------------------------------------------------------------------

loc_A27F:
                mov     byte ptr ds:soundFX_request, 2Eh ; '.'

loc_A284:
                call    sub_A575

loc_A287:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A291
                jmp     loc_A5A6
; ---------------------------------------------------------------------------

loc_A291:
                test    byte_A734, 0FFh
                jnz     short loc_A2EB
                cmp     boss_y, 7
                jnz     short loc_A2CC
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 10h
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A2AE
                xchg    ax, bx

loc_A2AE:
                mov     ax, boss_x
                add     ax, 4
                sub     ax, bx
                jnb     short loc_A2CC
                mov     ax, boss_x
                add     ax, 6
                sub     ax, bx
                jb      short loc_A2CC
                mov     byte_A735, 3
                mov     byte_A734, 0FFh

loc_A2CC:
                test    byte_A736, 0FFh
                jnz     short loc_A2DF
                call    sub_A42B
                jnb     short loc_A317
                mov     byte_A736, 0FFh
                jmp     short loc_A317
; ---------------------------------------------------------------------------

loc_A2DF:
                call    sub_A41D
                jnb     short loc_A317
                mov     byte_A736, 0
                jmp     short loc_A317
; ---------------------------------------------------------------------------

loc_A2EB:
                test    byte_A735, 0FFh
                jz      short loc_A2F8
                dec     byte_A735
                jmp     short loc_A317
; ---------------------------------------------------------------------------

loc_A2F8:
                test    byte_A734, 80h
                jz      short loc_A30B
                call    sub_A412
                jnb     short loc_A325
                mov     byte_A734, 7Fh
                jmp     short loc_A325
; ---------------------------------------------------------------------------

loc_A30B:
                call    sub_A408
                jnb     short loc_A325
                mov     byte_A734, 0
                jmp     short loc_A325
; ---------------------------------------------------------------------------

loc_A317:
                mov     bx, boss_x
                sub     bx, 9
                mov     al, byte_A6ED[bx]
                mov     boss_y, al

loc_A325:
                call    sub_A358
                test    byte_A737, 0FFh
                jz      short loc_A336
                dec     byte_A737
                jmp     sub_A438
; ---------------------------------------------------------------------------

loc_A336:
                inc     byte_A730
                cmp     byte_A730, 5
                jnz     short loc_A34B
                mov     byte_A737, 3
                mov     byte_A730, 0

loc_A34B:
                cmp     byte_A730, 4
                jnz     short loc_A355
                call    sub_A3C1

loc_A355:
                jmp     sub_A438
Meda_AI_proc    endp


; =============== S U B R O U T I N E =======================================


sub_A358        proc near
                mov     ax, ds:proximity_map_left_col_x
                add     ax, 10h
                mov     bx, ax
                sub     ax, ds:mapWidth
                jb      short loc_A367
                xchg    ax, bx

loc_A367:
                mov     ax, boss_x
                inc     ax
                sub     ax, bx
                jnb     short loc_A37F
                mov     ax, boss_x
                add     ax, 0Ah
                sub     ax, bx
                jb      short loc_A37F
                mov     byte_A72F, 2
                retn
; ---------------------------------------------------------------------------

loc_A37F:
                mov     ax, boss_x
                add     ax, -6
                sub     ax, bx
                jnb     short loc_A3AA
                mov     ax, boss_x
                add     ax, 17
                sub     ax, bx
                jb      short loc_A3AA
                mov     ax, boss_x
                add     ax, 7
                inc     bx
                sub     ax, bx
                jb      short loc_A3A4
                mov     byte_A72F, 1
                retn
; ---------------------------------------------------------------------------

loc_A3A4:
                mov     byte_A72F, 3
                retn
; ---------------------------------------------------------------------------

loc_A3AA:
                mov     ax, boss_x
                add     ax, 7
                inc     bx
                sub     ax, bx
                jb      short loc_A3BB
                mov     byte_A72F, 0
                retn
; ---------------------------------------------------------------------------

loc_A3BB:
                mov     byte_A72F, 4
                retn
sub_A358        endp


; =============== S U B R O U T I N E =======================================


sub_A3C1        proc near
                mov     ax, boss_x
                add     ax, 6
                call    word ptr cs:is_in_proximity_window_proc
                jb      short loc_A3E4
                mov     byte_A6E0, bl
                mov     al, boss_y
                add     al, 12
                and     al, 3Fh
                mov     byte_A6E1, al
                mov     bx, offset byte_A6E0
                call    word ptr cs:Add_Projectile_To_Array_proc

loc_A3E4:
                mov     ax, boss_x
                add     ax, 7
                call    word ptr cs:is_in_proximity_window_proc
                jnb     short loc_A3F2
                retn
; ---------------------------------------------------------------------------

loc_A3F2:
                mov     byte_A6E0, bl
                mov     al, boss_y
                add     al, 10
                and     al, 3Fh
                mov     byte_A6E1, al
                mov     bx, offset byte_A6E0
                jmp     word ptr cs:Add_Projectile_To_Array_proc
sub_A3C1        endp


; =============== S U B R O U T I N E =======================================


sub_A408        proc near
                dec     boss_y
                cmp     boss_y, 7
                retn
sub_A408        endp


; =============== S U B R O U T I N E =======================================


sub_A412        proc near
                inc     boss_y
                cmp     boss_y, 11
                cmc
                retn
sub_A412        endp


; =============== S U B R O U T I N E =======================================


sub_A41D        proc near
                cmp     byte ptr boss_x, 49
                cmc
                jnb     short loc_A426
                retn
; ---------------------------------------------------------------------------

loc_A426:
                inc     byte ptr boss_x
                retn
sub_A41D        endp


; =============== S U B R O U T I N E =======================================


sub_A42B        proc near
                cmp     byte ptr boss_x, 10
                jnb     short loc_A433
                retn
; ---------------------------------------------------------------------------

loc_A433:
                dec     byte ptr boss_x
                retn
sub_A42B        endp


; =============== S U B R O U T I N E =======================================


sub_A438        proc near
                push    cs
                pop     es
                mov     di, offset byte_A738
                mov     al, 0FFh
                mov     cx, 336
                rep stosb
                mov     byte_A72C, 0
                mov     byte_A72D, 0
                mov     si, offset unk_A5DC
                mov     bp, offset unk_A606
                mov     cx, 0Dh
                call    sub_A539
                mov     byte_A72C, 1
                mov     byte_A72D, 8
                mov     si, offset unk_A613
                mov     bp, offset unk_A623
                mov     cx, 0Bh
                call    sub_A539
                mov     byte_A72C, 4
                mov     byte_A72D, 3
                mov     bl, byte_A72F
                xor     bh, bh
                add     bx, bx
                mov     si, off_A62E[bx]
                mov     bp, offset unk_A682
                mov     cx, 5
                call    sub_A539
                mov     byte_A72D, 7
                mov     bl, byte_A730
                xor     bh, bh
                add     bx, bx
                mov     si, off_A687[bx]
                mov     bp, off_A6C7[bx]
                mov     cx, 5
                call    sub_A539
                mov     byte_A731, 0
                mov     ax, boss_x
                mov     di, ds:monsters_table_addr
                mov     si, offset byte_A738
                mov     cx, 14

loc_A4BC:
                push    cx
                push    si
                push    ax
                call    word ptr cs:is_in_proximity_window_proc
                pop     ax
                mov     byte_A72E, bl
                jb      short loc_A52C
                xor     cl, cl

loc_A4CD:
                push    cx
                push    ax
                cmp     byte ptr [si], 0FFh
                jz      short loc_A521
                mov     [di], ax
                mov     al, boss_y
                add     al, cl
                and     al, 3Fh
                mov     [di+2], al
                mov     al, byte_A72E
                mov     [di+3], al
                mov     al, [si]
                mov     [di+4], al
                mov     al, [si+1]
                mov     [di+6], al
                mov     byte ptr [di+5], 0
                test    byte_A732, 0FFh
                jz      short loc_A500
                or      byte ptr [di+5], 20h

loc_A500:
                push    di
                mov     ax, [di+2]
                call    word ptr cs:coords_in_ax_to_proximity_map_offset_in_di_proc
                mov     bl, byte_A731
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al
                pop     di
                add     di, 10h
                inc     byte_A731

loc_A521:
                inc     si
                inc     si
                pop     ax
                pop     cx
                inc     cl
                cmp     cl, 12
                jnz     short loc_A4CD

loc_A52C:
                inc     ax
                pop     si
                add     si, 24
                pop     cx
                loop    loc_A4BC
                mov     word ptr [di], 0FFFFh
                retn
sub_A438        endp


; =============== S U B R O U T I N E =======================================


sub_A539        proc near
                push    cs
                pop     es
                mov     al, byte_A72C
                xor     ah, ah
                add     ax, ax
                add     ax, ax
                add     ax, ax
                mov     dx, ax
                add     ax, ax
                add     ax, dx
                mov     dl, byte_A72D
                xor     dh, dh
                add     dx, dx
                add     ax, dx
                mov     di, ax
                add     di, offset byte_A738

loc_A55C:
                push    cx
                mov     cx, 8

loc_A560:
                rol     byte ptr ds:[bp+0], 1
                jnb     short loc_A569
                movsw
                dec     di
                dec     di

loc_A569:
                inc     di
                inc     di
                loop    loc_A560
                add     di, 8
                inc     bp
                pop     cx
                loop    loc_A55C
                retn
sub_A539        endp


; =============== S U B R O U T I N E =======================================


sub_A575        proc near
                mov     ax, boss_hp
                sub     ax, bx
                jnb     short loc_A57E
                xor     ax, ax

loc_A57E:
                mov     boss_hp, ax
                mov     bx, ax
                push    ax
                call    word ptr cs:Draw_Boss_Health_proc
                pop     ax
                or      ax, ax
                jz      short loc_A58F
                retn
; ---------------------------------------------------------------------------

loc_A58F:
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_A597
                retn
; ---------------------------------------------------------------------------

loc_A597:
                mov     byte_A733, 0
                mov     byte ptr ds:boss_being_hit, 0FFh
                jmp     word ptr cs:Browse_Projectiles_proc
sub_A575        endp

; ---------------------------------------------------------------------------

loc_A5A6:
                cmp     byte_A733, 40
                jnb     short loc_A5D6
                mov     byte ptr ds:0FF2Fh, 0FFh
                inc     byte_A733
                cmp     byte_A733, 20
                jnb     short loc_A5CE
                mov     byte_A730, 0
                call    sub_A358
                call    sub_A438
                mov     byte ptr ds:soundFX_request, 35
                retn
; ---------------------------------------------------------------------------

loc_A5CE:
                mov     byte_A72F, 5
                jmp     sub_A438
; ---------------------------------------------------------------------------

loc_A5D6:
                mov     byte ptr ds:boss_is_dead, 0FFh
                retn
; ---------------------------------------------------------------------------
unk_A5DC        db    0
                db    7
                db    0
                db    8
                db    0
                db    9
                db    0
                db    0
                db    0
                db    2
                db    0
                db  0Ah
                db    0
                db  0Bh
                db    0
                db  0Ch
                db    0
                db    3
                db    1
                db    7
                db    0
                db    4
                db    0
                db    5
                db    1
                db    9
                db    0
                db    6
                db    0
                db  0Dh
                db    0
                db  0Eh
                db    0
                db  0Fh
                db    0
                db    1
                db    1
                db    0
                db    1
                db    1
                db    1
                db    2
unk_A606        db  2Ah ; *
                db  80h
                db  55h ; U
                db    0
                db  41h ; A
                db    0
                db  40h ; @
                db    0
                db  41h ; A
                db    0
                db  55h ; U
                db  80h
                db  2Ah ; *
unk_A613        db    1
                db    3
                db    1
                db    4
                db  0Eh
                db    2
                db  0Eh
                db    0
                db  0Eh
                db    1
                db  0Eh
                db    3
                db    1
                db    5
                db    1
                db    6
unk_A623        db 0C0h
                db  10h
                db  40h ; @
                db    0
                db    0
                db    0
                db    0
                db    0
                db  40h ; @
                db  10h
                db 0C0h
off_A62E        dw offset unk_A63A
                dw offset unk_A646
                dw offset unk_A652
                dw offset unk_A65E
                dw offset unk_A66A
                dw offset unk_A676
unk_A63A        db    1
                db  0Ah
                db    1
                db  0Dh
                db    1
                db  0Bh
                db    1
                db  0Eh
                db    1
                db  0Ch
                db    1
                db  0Fh
unk_A646        db    2
                db    0
                db    2
                db    3
                db    2
                db    1
                db    2
                db    4
                db    2
                db    2
                db    2
                db    5
unk_A652        db    2
                db    6
                db    2
                db    9
                db    2
                db    7
                db    2
                db  0Ah
                db    2
                db    8
                db    2
                db  0Bh
unk_A65E        db    2
                db  0Ch
                db    2
                db  0Fh
                db    2
                db  0Dh
                db    3
                db    0
                db    2
                db  0Eh
                db    3
                db    1
unk_A66A        db    3
                db    2
                db    3
                db    5
                db    3
                db    3
                db    3
                db    6
                db    3
                db    4
                db    3
                db    7
unk_A676        db    3
                db    8
                db    3
                db  0Bh
                db    3
                db    9
                db    3
                db  0Ch
                db    3
                db  0Ah
                db    3
                db  0Dh
unk_A682        db 0A0h
                db    0
                db 0A0h
                db    0
                db 0A0h
off_A687        dw offset unk_A691
                dw offset unk_A69B
                dw offset unk_A6A5
                dw offset unk_A6B1
                dw offset unk_A6BD
unk_A691        db  0Eh
                db    6
                db  0Eh
                db    4
                db    1
                db    8
                db  0Eh
                db    5
                db  0Eh
                db    7
unk_A69B        db  0Eh
                db    6
                db  0Eh
                db    8
                db    3
                db  0Eh
                db  0Eh
                db    9
                db  0Eh
                db    7
unk_A6A5        db  0Eh
                db  0Ch
                db  0Eh
                db  0Ah
                db  0Eh
                db  0Dh
                db    1
                db    8
                db  0Eh
                db  0Bh
                db  0Eh
                db    7
unk_A6B1        db  0Eh
                db    6
                db  0Eh
                db  0Eh
                db  0Fh
                db    0
                db    1
                db    8
                db  0Eh
                db  0Fh
                db  0Eh
                db    7
unk_A6BD        db  0Eh
                db    6
                db  0Fh
                db    1
                db    1
                db    8
                db  0Fh
                db    2
                db  0Eh
                db    7
off_A6C7        dw offset unk_A6D1
                dw offset unk_A6D1
                dw offset unk_A6D6
                dw offset unk_A6DB
                dw offset unk_A6D1
unk_A6D1        db  10h
                db  20h
                db  80h
                db  20h
                db  10h
unk_A6D6        db  10h
                db  30h ; 0
                db  80h
                db  20h
                db  10h
unk_A6DB        db  10h
                db  28h ; (
                db  80h
                db  20h
                db  10h
byte_A6E0       db 0
byte_A6E1       db 0
                db  30h ; 0
                db    0
                db  32h ; 2
                db    6
                db  50h ; P
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
byte_A6ED       db 0Ch
                db  0Bh
                db  0Ah
                db    9
                db    8
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    8
                db    9
                db  0Ah
                db  0Bh
                db  0Ch
boss_state_block:
boss_x          dw 48
boss_y          db 11
boss_hp         dw 700
xp_reward       dw 3000
arena_center_x  db 12
boss_placement  db    0
                dw offset name_screen_x
almas_reward    dw 800
name_screen_x   db  11h
name_screen_y   db 0BBh
                db    2
aVista          db 5,'Vista'
byte_A72C       db 0
byte_A72D       db 0
byte_A72E       db 0
byte_A72F       db 0
byte_A730       db 0
byte_A731       db 0
byte_A732       db 0
byte_A733       db 0
byte_A734       db 0
byte_A735       db 0
byte_A736       db 0
byte_A737       db 0
byte_A738       db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0

meda          ends

                end start