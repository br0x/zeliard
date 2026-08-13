include common.inc
include gdmcga.inc
                .286
                .model small

seg000          segment byte public 'CODE'
                assume cs:seg000, ds:seg000
                org 6000h
start:
                dw offset sub_6002


sub_6002        proc near
                cli
                mov     sp, 2000h
                sti
                mov     cs:off_6630, offset unk_6AA8
                mov     ax, 6
                call    word ptr cs:GDMCGA_Fade_Palette_proc

                push    cs
                pop     es
                mov     si, offset vfs_yuup_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 4000h          ; yuup
                call    sub_696D

                push    cs
                pop     es
                mov     si, offset vfs_new1_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 8000h          ; new1
                call    sub_696D

                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     al, 0FFh
                mov     bx, 0B18h
                mov     cx, 1858h
                call    word ptr cs:Decompress_3Plane_Interleaved_proc
                mov     ax, cs
                add     ax, 2000h
                mov     es, ax  ; seg2
                push    ds
                mov     di, 0
                mov     ds, word ptr cs:seg1
                mov     si, 8000h
                mov     ax, 0B2h
                call    sub_6A1E
                pop     ds
                mov     di, 0
                mov     al, 0FFh
                mov     bx, 2D71h
                mov     cx, 1858h
                call    word ptr cs:Decompress_3Plane_Interleaved_proc
                mov     byte ptr cs:frame_timer, 0
                mov     al, 0FFh
                call    sub_62EE
                mov     cx, 89
loc_609D:
                push    cx
                mov     ax, cs
                add     ax, 2000h
                mov     es, ax  ; seg2
                mov     ax, cx
                dec     ax
                add     ax, ax
                push    ds
                mov     di, 0
                mov     ds, word ptr cs:seg1
                mov     si, 8000h
                call    sub_6A1E
                pop     ds
                pop     cx
                push    cx
                mov     bx, cx
                add     bx, 17h
                mov     bh, 2Dh ; '-'
                mov     di, 0
                mov     cx, 1858h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                mov     al, 0Ah
                call    sub_62EE
                pop     cx
                loop    loc_609D

                push    cs
                pop     es
                mov     si, offset vfs_waku_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     ax, cs
                add     ax, 2000h
                mov     es, ax  ; seg2
                mov     si, 0A000h
                mov     di, 0
                call    sub_696D
                mov     di, 0
                call    word ptr cs:Render_Animated_Tile_Rows_proc
                call    sub_6318
                push    cs
                pop     es
                mov     si, offset vfs_new2_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 4000h
                call    sub_696D
                mov     ax, 1
                call    word ptr cs:Render_Scrolling_Border_proc
                mov     ax, 7
                call    word ptr cs:GDMCGA_Fade_Palette_proc
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     al, 0FFh
                mov     bx, 1D12h
                mov     cx, 1C64h
                call    word ptr cs:Decompress_3Plane_Interleaved_proc
                call    sub_6318
                push    cs
                pop     es
                mov     si, offset vfs_sei_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 4000h
                call    sub_696D
                mov     di, 4000h
                mov     bx, 1610h
                mov     cx, 2468h
                mov     al, 5
                call    word ptr cs:Render_Animated_Tiles_proc
                call    sub_6318
                push    cs
                pop     es
                mov     si, offset vfs_yuup_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 4000h
                call    sub_696D
                push    cs
                pop     es
                mov     si, offset vfs_seip_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 8000h
                call    sub_696D
                xor     ax, ax
                call    word ptr cs:Render_Scrolling_Border_proc
                mov     ax, 6
                call    word ptr cs:GDMCGA_Fade_Palette_proc
                mov     bx, 0A15h
                mov     cx, 1A5Dh
                call    word ptr cs:GDMCGA_Draw_Bordered_Rect_proc
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     bx, 0B18h
                mov     cx, 1858h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                mov     bx, 2C15h
                mov     cx, 1A5Dh
                call    word ptr cs:GDMCGA_Draw_Bordered_Rect_proc
                mov     es, word ptr cs:seg1
                mov     di, 8000h
                mov     bx, 2D18h
                mov     cx, 1858h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                call    sub_6318
                push    cs
                pop     es
                mov     si, offset vfs_himp_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 8000h
                call    sub_696D
                mov     es, word ptr cs:seg1
                mov     di, 8000h
                mov     al, 0FFh
                mov     bx, 2D18h
                mov     cx, 1858h
                call    word ptr cs:Decompress_3Plane_Interleaved_proc
                call    sub_6318
                push    cs
                pop     es
                mov     si, offset vfs_ne80_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 4000h
                call    sub_696D
                push    cs
                pop     es
                mov     si, offset vfs_ne81_grp
                mov     di, 0A000h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     es, word ptr cs:seg1
                mov     si, 0A000h
                mov     di, 8000h
                call    sub_696D
                mov     ax, 2
                call    word ptr cs:Render_Scrolling_Border_proc
                mov     ax, 7
                call    word ptr cs:GDMCGA_Fade_Palette_proc
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     al, 0FFh
                mov     bx, 0B12h
                mov     cx, 1A64h
                call    word ptr cs:Decompress_3Plane_Interleaved_proc
                mov     es, word ptr cs:seg1
                mov     di, 8000h
                mov     al, 0FFh
                mov     bx, 3325h
                mov     cx, 1251h
                call    word ptr cs:Decompress_3Plane_Interleaved_proc
                call    sub_6318
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                xor     ax, ax
                mov     cx, 0F3Ch
                rep stosw
                mov     di, 4000h
                mov     al, 55h ; 'U'
                mov     cx, 64h ; 'd'
loc_62C0:
                push    cx
                mov     cx, 1Ah
                rep stosb
                ror     al, 1
                pop     cx
                loop    loc_62C0
                xor     al, al
                mov     di, 4000h
                mov     bx, 0B12h
                mov     cx, 1A64h
                call    word ptr cs:Decompress_3Plane_Interleaved_proc
                call    sub_6318
; ---------------------------------------------------------------------------
                mov     al, 0FFh
                mov     bx, 0
                mov     cx, 50C8h
                call    word ptr cs:Render_With_MaskErase_Callback_proc
                jmp     loc_6638
sub_6002        endp


; =============== S U B R O U T I N E =======================================

sub_62EE        proc near
                call    sub_62FF
; ---------------------------------------------------------------------------
                cmp     cs:frame_timer, al
                jb      short sub_62EE
                mov     byte ptr cs:frame_timer, 0
                retn
sub_62EE        endp


; =============== S U B R O U T I N E =======================================

; Attributes: noreturn

sub_62FF        proc near
                push    si
                push    ax
                call    word ptr cs:Confirm_Exit_Dialog_proc
                call    word ptr cs:Handle_Pause_State_proc
                call    word ptr cs:Joystick_Calibration_proc
                call    word ptr cs:Joystick_Deactivator_proc
                pop     ax
                pop     si
                retn
sub_62FF        endp


; =============== S U B R O U T I N E =======================================

; Attributes: noreturn

sub_6318        proc near
                mov     byte ptr cs:frame_timer, 0

loc_631E:
                mov     al, 10h
                call    sub_62EE

loc_6323:
                push    cs
                pop     ds
                mov     si, ds:off_6630
                lodsb
                mov     ds:off_6630, si
                test    al, 80h
                jz      short loc_6335
                jmp     loc_63C4
; ---------------------------------------------------------------------------

loc_6335:
                cmp     al, 20h ; ' '
                jz      short loc_6351
                cmp     al, 2Eh ; '.'
                jz      short loc_6351
                cmp     al, 2Ch ; ','
                jz      short loc_6351
                cmp     al, 22h ; '"'
                jz      short loc_6351
                cmp     al, 27h ; '''
                jz      short loc_6351
                mov     ah, ds:byte_6637
                mov     ds:soundFX_request, ah

loc_6351:
                push    ax
                mov     bx, ds:word_6632
                add     bx, 4
                mov     al, ds:byte_6634
                mov     dl, 0Ah
                mul     dl
                add     ax, 8Fh
                mov     cx, ax
                pop     ax
                push    bx
                mov     bl, al
                sub     bl, 20h ; ' '
                xor     bh, bh
                mov     dl, ds:byte_807D[bx]
                mov     dh, bh
                pop     bx
                push    ax
                sub     bx, dx
                push    ax
                push    bx
                push    cx
                inc     bx
                inc     cx
                mov     ah, ds:byte_6635
                call    word ptr cs:GDMCGA_Font_Glyph_Thunk_proc
                pop     cx
                pop     bx
                pop     ax
                mov     ah, ds:byte_6636
                call    word ptr cs:GDMCGA_Font_Glyph_Thunk_proc
                pop     ax
                mov     bl, al
                sub     bl, 20h ; ' '
                xor     bh, bh
                mov     cl, ds:byte_80DD[bx]
                mov     ch, bh
                add     ds:word_6632, cx
                cmp     al, 20h ; ' '
                jz      short loc_63AB
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_63AB:
                mov     si, ds:off_6630
                call    sub_65F0
                mov     dx, ds:word_6632
                add     dx, cx
                cmp     dx, 138h
                jb      short loc_63C1
                jmp     loc_64AB
; ---------------------------------------------------------------------------

loc_63C1:
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_63C4:
                cmp     al, 0FFh
                jnz     short loc_63C9
                retn
; ---------------------------------------------------------------------------

loc_63C9:
                cmp     al, 0FDh
                jnz     short loc_63CE
                retn
; ---------------------------------------------------------------------------

loc_63CE:
                mov     ah, al
                and     ah, 0F0h
                cmp     ah, 80h
                jnz     short loc_63DB
                jmp     loc_6568
; ---------------------------------------------------------------------------

loc_63DB:
                cmp     ah, 90h
                jnz     short loc_63E3
                jmp     loc_64E3
; ---------------------------------------------------------------------------

loc_63E3:
                cmp     ah, 0A0h
                jnz     short loc_63EB
                jmp     loc_6530
; ---------------------------------------------------------------------------

loc_63EB:
                cmp     ah, 0B0h
                jnz     short loc_63F3
                jmp     loc_658C
; ---------------------------------------------------------------------------

loc_63F3:
                cmp     ah, 0C0h
                jnz     short loc_63FB
                jmp     loc_65D5
; ---------------------------------------------------------------------------

loc_63FB:
                mov     bx, 701h
                cmp     al, 0FBh
                jnz     short loc_6405
                jmp     loc_6493
; ---------------------------------------------------------------------------

loc_6405:
                mov     bx, 700h
                cmp     al, 0FAh
                jnz     short loc_640F
                jmp     loc_6493
; ---------------------------------------------------------------------------

loc_640F:
                mov     bx, 602h
                cmp     al, 0F9h
                jz      short loc_6493
                cmp     al, 0F5h
                jnz     short loc_641D
                jmp     loc_64C9
; ---------------------------------------------------------------------------

loc_641D:
                cmp     al, 0F6h
                jnz     short loc_6424
                jmp     loc_64D1
; ---------------------------------------------------------------------------

loc_6424:
                xor     ah, ah
                cmp     al, 0F7h
                jz      short loc_649E
                inc     ah
                cmp     al, 0F3h
                jz      short loc_649E
                inc     ah
                cmp     al, 0F2h
                jz      short loc_649E
                inc     ah
                cmp     al, 0F1h
                jz      short loc_649E
                cmp     al, 0FEh
                jz      short loc_64B8
                mov     ah, ds:byte_6637
                mov     ds:byte_6637, 0
                cmp     al, 0F0h
                jnz     short loc_6450
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_6450:
                mov     ds:byte_6637, 3Dh ; '='
                cmp     al, 0EFh
                jnz     short loc_645C
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_645C:
                mov     ds:byte_6637, 3Eh ; '>'
                cmp     al, 0EEh
                jnz     short loc_6468
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_6468:
                mov     ds:byte_6637, 3Fh ; '?'
                cmp     al, 0EDh
                jnz     short loc_6474
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_6474:
                mov     ds:byte_6637, 40h ; '@'
                cmp     al, 0ECh
                jnz     short loc_6480
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_6480:
                mov     ds:byte_6637, 41h ; 'A'
                cmp     al, 0EBh
                jnz     short loc_648C
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_648C:
                mov     ds:byte_6637, ah
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_6493:
                mov     ds:byte_6635, bl
                mov     ds:byte_6636, bh
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_649E:
                mov     ds:word_6632, 0
                mov     ds:byte_6634, ah
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_64AB:
                mov     ds:word_6632, 0
                inc     ds:byte_6634
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_64B8:
                mov     bx, 8Fh
                mov     cx, 5039h
                xor     al, al
                call    word ptr cs:Draw_Bordered_Rectangle_proc
                xor     ah, ah
                jmp     short loc_649E
; ---------------------------------------------------------------------------

loc_64C9:
                mov     al, 0F0h
                call    sub_62EE
; ---------------------------------------------------------------------------
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_64D1:
                mov     al, 0F0h
                call    sub_62EE
; ---------------------------------------------------------------------------
                mov     al, 0F0h
                call    sub_62EE
; ---------------------------------------------------------------------------
                mov     al, 0F0h
                call    sub_62EE
; ---------------------------------------------------------------------------
                jmp     loc_631E
; ---------------------------------------------------------------------------

loc_64E3:
                mov     es, word ptr cs:seg1
                and     al, 0Fh
                cmp     al, 6
                jnb     short loc_650F
                mov     ah, 27
                mul     ah
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, 58C0h
                mov     di, ax
                mov     bx, 1350h
                mov     cx, 920h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                jmp     loc_6323
; ---------------------------------------------------------------------------

loc_650F:
                sub     al, 6
                mov     ah, 21h ; '!'
                mul     ah
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, 6D00h
                mov     di, ax
                mov     bx, 1238h
                mov     cx, 0B10h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                jmp     loc_6323
; ---------------------------------------------------------------------------

loc_6530:
                push    cs
                pop     es
                and     al, 0Fh
                cmp     al, 3
                jnb     short loc_654F
                mov     ah, 0A5h
                mul     ah
                add     ax, 7437h
                mov     di, ax
                mov     bx, 3548h
                mov     cx, 50Bh
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                jmp     loc_6323
; ---------------------------------------------------------------------------

loc_654F:
                sub     al, 3
                mov     ah, 0A8h
                mul     ah
                add     ax, 7626h
                mov     di, ax
                mov     bx, 343Eh
                mov     cx, 708h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                jmp     loc_6323
; ---------------------------------------------------------------------------

loc_6568:
                mov     es, word ptr cs:seg1
                and     al, 0Fh
                mov     ah, 3Fh ; '?'
                mul     ah
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, 98C0h
                mov     di, ax
                mov     bx, 3850h
                mov     cx, 718h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                jmp     loc_6323
; ---------------------------------------------------------------------------

loc_658C:
                mov     es, word ptr cs:seg1
                and     al, 0Fh
                cmp     al, 6
                jnb     short loc_65B4
                mov     ah, 51h ; 'Q'
                mul     ah
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, 98C0h
                mov     di, ax
                mov     bx, 3450h
                mov     cx, 918h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                jmp     loc_6323
; ---------------------------------------------------------------------------

loc_65B4:
                sub     al, 6
                mov     ah, 2Dh ; '-'
                mul     ah
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     ax, 0A7F0h
                mov     di, ax
                mov     bx, 3338h
                mov     cx, 0A18h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                jmp     loc_6323
; ---------------------------------------------------------------------------

loc_65D5:
                and     al, 0Fh
                push    cs
                pop     es
                mov     ah, 30h ; '0'
                mul     ah
                add     ax, 781Eh
                mov     di, ax
                mov     bx, 3840h
                mov     cx, 208h
                call    word ptr cs:Decompress_And_Copy_To_VRAM_proc
                jmp     loc_6323
sub_6318        endp


; =============== S U B R O U T I N E =======================================


sub_65F0        proc near
                xor     cx, cx

loc_65F2:
                lodsb
                cmp     al, 20h ; ' '
                jnz     short loc_65F8
                retn
; ---------------------------------------------------------------------------

loc_65F8:
                cmp     al, 0FFh
                jnz     short loc_65FD
                retn
; ---------------------------------------------------------------------------

loc_65FD:
                cmp     al, 0FEh
                jnz     short loc_6602
                retn
; ---------------------------------------------------------------------------

loc_6602:
                cmp     al, 0FDh
                jnz     short loc_6607
                retn
; ---------------------------------------------------------------------------

loc_6607:
                cmp     al, 0F7h
                jnz     short loc_660C
                retn
; ---------------------------------------------------------------------------

loc_660C:
                cmp     al, 0F3h
                jnz     short loc_6611
                retn
; ---------------------------------------------------------------------------

loc_6611:
                cmp     al, 0F2h
                jnz     short loc_6616
                retn
; ---------------------------------------------------------------------------

loc_6616:
                cmp     al, 0F1h
                jnz     short loc_661B
                retn
; ---------------------------------------------------------------------------

loc_661B:
                or      al, al
                js      short loc_65F2
                sub     al, 20h ; ' '
                jb      short loc_65F2
                mov     bl, al
                xor     bh, bh
                add     cl, cs:byte_80DD[bx]
                adc     ch, bh
                jmp     short loc_65F2
sub_65F0        endp

; ---------------------------------------------------------------------------
off_6630        dw offset unk_6AA8
word_6632       dw 0
byte_6634       db 0
byte_6635       db 0
byte_6636       db 0
byte_6637       db 0
; ---------------------------------------------------------------------------

loc_6638:
                cli
                mov     sp, 2000h
                sti
                mov     ds:byte_6965+7, 0
                mov     si, offset vfs_zend_msd
                mov     es, word ptr cs:seg1
                mov     di, 3000h
                mov     al, 5 ; fn5_load_music
                call    word ptr cs:res_dispatcher_proc
                mov     ax, cs
                add     ax, 2000h
                mov     es, ax  ; seg2
                mov     si, offset vfs_end5_grp
                mov     di, 0
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     si, offset vfs_end4_grp
                mov     di, 3400h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     si, offset vfs_end6_grp
                mov     di, 5E00h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     si, offset vfs_end7_grp
                mov     di, 8A00h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     si, offset vfs_en72_grp
                mov     di, 0B800h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     si, offset vfs_fin_grp
                mov     di, 0E200h
                mov     al, 2 ; fn2_segmented_load
                call    word ptr cs:res_dispatcher_proc
                mov     ax, 7
                call    word ptr cs:GDMCGA_Fade_Palette_proc
                push    ds
                mov     ds, word ptr cs:seg1
                mov     si, 3000h
                xor     ax, ax
                int     60h             ; SYS_PROF.EXE - PROFILER STATUS
                                        ; Return: AX = 0000h    profiling is off
                                        ; otherwise profiling is on
                pop     ds
                mov     word ptr byte_6965, 787Eh
                call    sub_66CD

loc_66C8:
                call    sub_6956
; ---------------------------------------------------------------------------
                jmp     short loc_66C8

; =============== S U B R O U T I N E =======================================


sub_66CD        proc near

                mov     byte ptr ds:frame_timer, 0

loc_66D2:
                mov     si, word ptr byte_6965
                lodsb
                mov     word ptr byte_6965, si
                cmp     al, 0F7h
                jz      short loc_6756
                cmp     al, 0F8h
                jnz     short loc_66E6
                jmp     loc_676E
; ---------------------------------------------------------------------------

loc_66E6:
                cmp     al, 0F9h
                jnz     short loc_66ED
                jmp     loc_6779
; ---------------------------------------------------------------------------

loc_66ED:
                cmp     al, 0FAh
                jnz     short loc_66F4
                jmp     loc_6793
; ---------------------------------------------------------------------------

loc_66F4:
                cmp     al, 0FBh
                jnz     short loc_66FB
                jmp     loc_679E
; ---------------------------------------------------------------------------

loc_66FB:
                cmp     al, 0FCh
                jnz     short loc_6702
                jmp     loc_67AD
; ---------------------------------------------------------------------------

loc_6702:
                cmp     al, 0FDh
                jnz     short loc_6709
                jmp     loc_67C7
; ---------------------------------------------------------------------------

loc_6709:
                cmp     al, 0FEh
                jnz     short loc_6710
                jmp     loc_6808
; ---------------------------------------------------------------------------

loc_6710:
                cmp     al, 0FFh
                jnz     short loc_6717
                jmp     loc_6802
; ---------------------------------------------------------------------------

loc_6717:
                cmp     al, 9
                jnz     short loc_671E
                jmp     loc_67D8
; ---------------------------------------------------------------------------

loc_671E:
                push    ax
                xor     al, al
                call    sub_67EA
                mov     al, byte_6965+3
                mov     cl, 0Eh
                mul     cl
                mov     cl, al
                add     cl, 90h
                mov     bl, byte_6965+2
                xor     bh, bh
                add     bx, bx
                add     bx, bx
                add     bx, bx
                pop     ax
                mov     ah, 7
                call    word ptr cs:GDMCGA_Font_Glyph_Thunk_proc
                inc     byte_6965+2

loc_6748:
                mov     al, 0FFh
                call    sub_67EA
                mov     al, byte_6965+6
                call    sub_6945
; ---------------------------------------------------------------------------
                jmp     loc_66D2
; ---------------------------------------------------------------------------

loc_6756:
                call    sub_6956
; ---------------------------------------------------------------------------
                test    byte ptr ds:byte_FF21, 0FFh
                jz      short loc_6756
                mov     byte ptr ds:byte_FF21, 0
                mov     word ptr ds:tick_counter, 0
                jmp     loc_66D2
; ---------------------------------------------------------------------------

loc_676E:
                lodsw
                mov     word ptr byte_6965, si
                mov     word ptr byte_6965+4, ax
                jmp     loc_66D2
; ---------------------------------------------------------------------------

loc_6779:
                xor     al, al
                call    sub_67EA

loc_677E:
                call    sub_6956
; ---------------------------------------------------------------------------
                mov     ax, ds:tick_counter
                cmp     ax, word ptr byte_6965+4
                jb      short loc_677E
                mov     word ptr ds:tick_counter, 0
                jmp     loc_66D2
; ---------------------------------------------------------------------------

loc_6793:
                lodsb
                mov     word ptr byte_6965, si
                mov     byte_6965+6, al
                jmp     loc_66D2
; ---------------------------------------------------------------------------

loc_679E:
                lodsw
                mov     byte_6965+3, al
                mov     byte_6965+2, ah
                mov     word ptr byte_6965, si
                jmp     loc_66D2
; ---------------------------------------------------------------------------

loc_67AD:
                mov     bx, 8Ch
                mov     cx, 503Ch
                xor     al, al
                call    word ptr cs:Draw_Bordered_Rectangle_proc
                mov     byte_6965+2, 0
                mov     byte_6965+3, 0
                jmp     loc_66D2
; ---------------------------------------------------------------------------

loc_67C7:
                xor     al, al
                call    sub_67EA
                mov     byte_6965+2, 0
                inc     byte_6965+3
                jmp     loc_66D2
; ---------------------------------------------------------------------------

loc_67D8:
                xor     al, al
                call    sub_67EA
                add     byte_6965+2, 4
                and     byte_6965+2, 0FCh
                jmp     loc_6748
sub_66CD        endp


; =============== S U B R O U T I N E =======================================


sub_67EA        proc near
                push    ax
                mov     al, byte_6965+3
                mov     cl, 0Eh
                mul     cl
                add     al, 90h
                mov     ah, byte_6965+2
                add     ah, ah
                mov     bx, ax
                pop     ax
                jmp     word ptr cs:GDMCGA_Clear_HUD_Bar_proc
sub_67EA        endp

; ---------------------------------------------------------------------------

loc_6802:
                xor     al, al
                call    sub_67EA
                retn
; ---------------------------------------------------------------------------

loc_6808:
                xor     al, al
                call    sub_67EA
                mov     bl, byte_6965+7
                xor     bh, bh
                add     bx, bx
                call    funcs_6815[bx]
                inc     byte_6965+7
                jmp     loc_66D2
; ---------------------------------------------------------------------------
funcs_6815      dw offset sub_682E
                dw offset sub_685A
                dw offset sub_6891
                dw offset sub_68B5
                dw offset sub_68C2
                dw offset sub_68CF
                dw offset sub_6932

; =============== S U B R O U T I N E =======================================


sub_682E        proc near
                push    ds
                mov     ax, cs
                add     ax, 2000h
                mov     ds, ax          ; seg2
                mov     es, word ptr cs:seg1
                mov     si, 0
                mov     di, 4000h
                call    sub_696D
                pop     ds
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     al, 0FFh
                mov     bx, 0B08h
                mov     cx, 399Ah
                jmp     word ptr cs:Decompress_3Plane_Interleaved_proc
sub_682E        endp


; =============== S U B R O U T I N E =======================================


sub_685A        proc near
                push    ds
                mov     ax, cs
                add     ax, 2000h
                mov     ds, ax  ; seg2
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     si, 3400h
                call    sub_696D
                pop     ds
                mov     bx, 0B08h
                mov     cx, 399Ah
                call    word ptr cs:Render_With_MaskErase_Callback_proc
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     al, 0FFh
                mov     bx, 2114h
                mov     cx, 2F72h
                jmp     word ptr cs:Decompress_3Plane_Interleaved_proc
sub_685A        endp


; =============== S U B R O U T I N E =======================================


sub_6891        proc near
                push    ds
                mov     ax, cs
                add     ax, 2000h
                mov     ds, ax          ; seg2
                mov     es, word ptr cs:seg1
                mov     si, 5E00h
                mov     di, 4000h
                call    sub_696D
                pop     ds
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                jmp     word ptr cs:Render_Tile_Rows_TopDown_proc
sub_6891        endp


; =============== S U B R O U T I N E =======================================


sub_68B5        proc near
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                jmp     word ptr cs:Render_Tile_Rows_BottomUp_proc
sub_68B5        endp


; =============== S U B R O U T I N E =======================================


sub_68C2        proc near
                mov     al, 0FFh
                mov     bx, 0
                mov     cx, 50C8h
                jmp     word ptr cs:Render_With_MaskErase_Callback_proc
sub_68C2        endp


; =============== S U B R O U T I N E =======================================


sub_68CF        proc near

                push    ds
                mov     ax, cs
                add     ax, 2000h
                mov     ds, ax  ; seg2
                mov     es, word ptr cs:seg1
                mov     si, 8A00h
                mov     di, 4000h
                call    sub_696D
                mov     si, 0B800h
                mov     di, 93C0h
                mov     cx, 14F0h
                rep movsw
                pop     ds
                mov     di, 4000h
                xor     ax, ax
                mov     cx, 28h ; '('
                rep stosw
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     al, 0FFh
                mov     bx, 0
                mov     cx, 5086h
                call    word ptr cs:Decompress_3Plane_Interleaved_proc
                push    ds
                mov     ax, cs
                add     ax, 2000h
                mov     ds, ax  ; seg2
                mov     es, word ptr cs:seg1
                mov     si, 0E200h
                mov     di, 0BDA0h
                call    sub_6972
                pop     ds
                mov     es, word ptr cs:seg1
                mov     di, 0BDA0h
                jmp     loc_6A52
sub_68CF        endp


; =============== S U B R O U T I N E =======================================


sub_6932        proc near
                mov     es, word ptr cs:seg1
                mov     di, 4000h
                mov     bx, 0
                mov     cx, 5086h
                jmp     word ptr cs:Decompress_And_Copy_To_VRAM_proc
sub_6932        endp


; =============== S U B R O U T I N E =======================================

; Attributes: noreturn

sub_6945        proc near
                call    sub_6956
; ---------------------------------------------------------------------------
                cmp     cs:frame_timer, al
                jb      short sub_6945
                mov     byte ptr cs:frame_timer, 0
                retn
sub_6945        endp


; =============== S U B R O U T I N E =======================================

sub_6956        proc near
                push    si
                push    ax
                call    word ptr cs:Confirm_Exit_Dialog_proc
                call    word ptr cs:Handle_Pause_State_proc
                pop     ax
                pop     si
                retn
sub_6956        endp

; ---------------------------------------------------------------------------
byte_6965       db 8 dup(0)

; =============== S U B R O U T I N E =======================================


sub_696D        proc near

                call    sub_6972
                jmp     short loc_699C
sub_696D        endp


; =============== S U B R O U T I N E =======================================


sub_6972        proc near
                push    di
                lodsw
                mov     cx, ax
                push    cx
                mov     bp, si
                add     si, cx

loc_697B:
                push    cx
                xor     al, al
                mov     cx, 8

loc_6981:
                rol     byte ptr ds:[bp+0], 1
                jb      short loc_698C
                stosb
                loop    loc_6981
                jmp     short loc_698F
; ---------------------------------------------------------------------------

loc_698C:
                movsb
                loop    loc_6981

loc_698F:
                inc     bp
                pop     cx
                loop    loc_697B
                pop     cx
                add     cx, cx
                add     cx, cx
                add     cx, cx
                pop     di
                retn
sub_6972        endp

; ---------------------------------------------------------------------------

loc_699C:
                xor     dh, dh

loc_699E:
                xor     al, al
                rcl     byte ptr es:[di], 1
                adc     al, al
                rcl     byte ptr es:[di], 1
                adc     al, al
                xor     dh, al
                mov     ah, dh
                xor     al, al
                rcl     byte ptr es:[di], 1
                adc     al, al
                rcl     byte ptr es:[di], 1
                adc     al, al
                xor     dh, al
                add     ah, ah
                add     ah, ah
                or      ah, dh
                xor     al, al
                rcl     byte ptr es:[di], 1
                adc     al, al
                rcl     byte ptr es:[di], 1
                adc     al, al
                xor     dh, al
                add     ah, ah
                add     ah, ah
                or      ah, dh
                xor     al, al
                rcl     byte ptr es:[di], 1
                adc     al, al
                rcl     byte ptr es:[di], 1
                adc     al, al
                xor     dh, al
                add     ah, ah
                add     ah, ah
                or      ah, dh
                mov     al, ah
                stosb
                loop    loc_699E
                retn
; ---------------------------------------------------------------------------

loc_69F0:
                test    byte ptr [si], 40h
                jz      short loc_6A12
                lodsw
                xchg    ah, al
                mov     cx, ax
                cmp     ax, 0FFFFh
                jnz     short loc_6A00
                retn
; ---------------------------------------------------------------------------

loc_6A00:
                and     cx, 3FFFh
                test    ax, 8000h
                jz      short loc_6A0E

loc_6A09:
                lodsb
                rep stosb
                jmp     short loc_69F0
; ---------------------------------------------------------------------------

loc_6A0E:
                rep movsb
                jmp     short loc_69F0
; ---------------------------------------------------------------------------

loc_6A12:
                lodsb
                mov     cl, al
                and     cx, 3Fh
                test    al, 80h
                jz      short loc_6A0E
                jmp     short loc_6A09

; =============== S U B R O U T I N E =======================================


sub_6A1E        proc near
                mov     bx, 18h
                mul     bx
                add     si, ax
                xor     ax, ax
                push    si
                mov     cx, 414h
                rep movsw
                mov     cx, 0Ch
                rep stosw
                pop     si
                add     si, 18D8h
                push    si
                mov     cx, 414h
                rep movsw
                mov     cx, 0Ch
                rep stosw
                pop     si
                add     si, 18D8h
                mov     cx, 414h
                rep movsw
                mov     cx, 0Ch
                rep stosw
                retn
sub_6A1E        endp

; ---------------------------------------------------------------------------

loc_6A52:
                push    ds
                push    es
                pop     ds
                push    di
                pop     si
                mov     es, word ptr cs:seg1
                mov     di, 4CE6h
                mov     cx, 35h ; '5'

loc_6A62:
                push    cx
                push    di
                mov     cx, 13h

loc_6A67:
                lodsw
                or      es:[di], ax
                or      es:[di+29E0h], ax
                or      es:[di+53C0h], ax
                inc     di
                inc     di
                loop    loc_6A67
                pop     di
                add     di, 50h ; 'P'
                pop     cx
                loop    loc_6A62
                mov     di, 4CE6h
                mov     cx, 35h ; '5'

loc_6A86:
                push    cx
                push    di
                mov     cx, 13h

loc_6A8B:
                lodsw
                not     ax
                and     es:[di], ax
                and     es:[di+29E0h], ax
                and     es:[di+53C0h], ax
                inc     di
                inc     di
                loop    loc_6A8B
                pop     di
                add     di, 50h ; 'P'
                pop     cx
                loop    loc_6A86
                pop     ds
                retn
; ---------------------------------------------------------------------------
unk_6AA8        db 0F0h
                db 0FAh
                db 0F3h
aAtLongLastJash db 'At long last, Jashiin was destroyed and the nine Tears of Esmesan'
                db 'ti were returned to their rightful place.'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F3h
aPrincessFelici db 'Princess Felicia was restored to her true form.'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FBh
                db 0FEh
                db 0F3h
                db 0EFh
                db  22h ; "
                db  95h
                db  59h ; Y
                db  6Fh ; o
                db  75h ; u
                db  20h
                db  90h
                db  61h ; a
                db  72h ; r
                db  65h ; e
                db  94h
                db  20h
                db  90h
                db  61h ; a
                db  95h
                db  73h ; s
                db  20h
                db  92h
                db  62h ; b
                db  65h ; e
                db  95h
                db  61h ; a
                db  75h ; u
                db  92h
                db  74h ; t
                db  69h ; i
                db  95h
                db  66h ; f
                db  75h ; u
                db  93h
                db  6Ch ; l
                db  20h
                db  90h
                db  61h ; a
                db  95h
                db  73h ; s
                db  20h
                db  90h
                db  61h ; a
                db  20h
                db  93h
                db  72h ; r
                db  6Fh ; o
                db  91h
                db  73h ; s
                db  65h ; e
                db  20h
                db  92h
                db  69h ; i
                db  94h
                db  6Eh ; n
                db  20h
                db  93h
                db  62h ; b
                db  95h
                db  6Ch ; l
                db  6Fh ; o
                db  6Fh ; o
                db  94h
                db  6Dh ; m
                db  21h ; !
                db  22h ; "
                db 0F5h
                db 0F2h
                db 0EBh
                db 0A3h
                db  22h ; "
                db 0A4h
                db 0A0h
                db  54h ; T
                db 0A5h
                db  68h ; h
                db 0A4h
                db  61h ; a
                db 0A3h
                db 0A2h
                db  6Eh ; n
                db 0A1h
                db  6Bh ; k
                db  20h
                db 0A2h
                db  79h ; y
                db  6Fh ; o
                db  75h ; u
                db  2Ch ; ,
                db  20h
                db 0A1h
                db 0A3h
                db  44h ; D
                db 0A4h
                db  75h ; u
                db 0A5h
                db  6Bh ; k
                db 0A4h
                db  65h ; e
                db 0A3h
                db  20h
                db 0A0h
                db  47h ; G
                db  61h ; a
                db  72h ; r
                db 0A1h
                db  6Ch ; l
                db  61h ; a
                db 0A2h
                db  6Eh ; n
                db  64h ; d
                db  2Eh ; .
                db  22h ; "
                db 0A1h
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F3h
                db  22h ; "
                db 0A1h
                db  59h ; Y
                db  6Fh ; o
                db  75h ; u
                db  20h
                db 0A0h
                db  68h ; h
                db  61h ; a
                db 0A2h
                db  76h ; v
                db  65h ; e
                db  20h
                db 0A1h
                db  64h ; d
                db  6Fh ; o
                db 0A2h
                db  6Eh ; n
                db  65h ; e
                db  20h
                db 0A0h
                db  61h ; a
                db  20h
                db 0A1h
                db  67h ; g
                db  72h ; r
                db  65h ; e
                db 0A0h
                db  61h ; a
                db  74h ; t
                db  20h
                db 0A1h
                db  64h ; d
                db  65h ; e
                db  65h ; e
                db  64h ; d
                db  20h
                db 0A2h
                db  69h ; i
                db  6Eh ; n
                db  20h
                db 0A0h
                db  64h ; d
                db  65h ; e
                db  66h ; f
                db  65h ; e
                db  61h ; a
                db 0A1h
                db  74h ; t
                db 0A2h
                db  69h ; i
                db  6Eh ; n
                db  67h ; g
                db  20h
                db 0A1h
                db  4Ah ; J
                db  61h ; a
                db  73h ; s
                db  68h ; h
                db  69h ; i
                db 0A2h
                db  69h ; i
                db  6Eh ; n
                db  2Eh ; .
                db 0A1h
                db  20h
                db  20h
                db 0F5h
                db 0A0h
                db 0A4h
                db  41h ; A
                db 0A5h
                db  6Ch ; l
                db 0A4h
                db 0A2h
                db  74h ; t
                db 0A3h
                db  68h ; h
                db  6Fh ; o
                db  75h ; u
                db 0A1h
                db  67h ; g
                db  68h ; h
                db  20h
                db 0A0h
                db  6Dh ; m
                db  79h ; y
                db  20h
                db 0A1h
                db  62h ; b
                db  6Fh ; o
                db  64h ; d
                db 0A1h
                db  79h ; y
                db  20h
                db 0A0h
                db  77h ; w
                db  61h ; a
                db 0A1h
                db  73h ; s
                db  20h
                db 0A1h
                db  68h ; h
                db 0A0h
                db  65h ; e
                db  72h ; r
                db  65h ; e
                db  2Ch ; ,
                db  20h
                db 0A4h
                db  6Dh ; m
                db 0A5h
                db 0A1h
                db  79h ; y
                db 0A4h
                db  20h
                db 0A3h
                db 0A1h
                db  73h ; s
                db  6Fh ; o
                db 0A2h
                db  75h ; u
                db  6Ch ; l
                db  20h
                db 0A0h
                db  77h ; w
                db  61h ; a
                db 0A2h
                db  73h ; s
                db  20h
                db 0A2h
                db  77h ; w
                db 0A1h
                db  69h ; i
                db  74h ; t
                db  68h ; h
                db  20h
                db 0A0h
                db  74h ; t
                db  68h ; h
                db  65h ; e
                db  20h
                db 0A1h
                db  48h ; H
                db  6Fh ; o
                db 0A2h
                db  6Ch ; l
                db  79h ; y
                db  20h
                db 0A2h
                db  53h ; S
                db 0A1h
                db  70h ; p
                db  69h ; i
                db 0A0h
                db  72h ; r
                db 0A2h
                db  69h ; i
                db  74h ; t
                db  2Ch ; ,
                db  20h
                db 0A0h
                db  77h ; w
                db  61h ; a
                db  74h ; t
                db 0A1h
                db  63h ; c
                db  68h ; h
                db 0A2h
                db  69h ; i
                db  6Eh ; n
                db  67h ; g
                db  20h
                db 0A1h
                db  79h ; y
                db  6Fh ; o
                db  75h ; u
                db  2Eh ; .
                db  22h ; "
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F3h
                db  22h ; "
                db 0A0h
                db  49h ; I
                db  20h
                db 0A1h
                db  64h ; d
                db  6Fh ; o
                db 0A2h
                db  6Eh ; n
                db  27h ; '
                db  74h ; t
                db  20h
                db 0A1h
                db  6Bh ; k
                db 0A2h
                db  6Eh ; n
                db  6Fh ; o
                db  77h ; w
                db  20h
                db 0A0h
                db  68h ; h
                db  6Fh ; o
                db 0A2h
                db  77h ; w
                db  20h
                db 0A1h
                db  74h ; t
                db  6Fh ; o
                db  20h
                db 0A0h
                db  74h ; t
                db  68h ; h
                db  61h ; a
                db 0A2h
                db  6Eh ; n
                db  6Bh ; k
                db  20h
                db 0A1h
                db  79h ; y
                db  6Fh ; o
                db  75h ; u
                db  20h
                db 0A2h
                db  66h ; f
                db  6Fh ; o
                db  72h ; r
                db  20h
                db 0A1h
                db  72h ; r
                db  65h ; e
                db 0A2h
                db  73h ; s
                db  63h ; c
                db  75h ; u
                db 0A1h
                db  69h ; i
                db  6Eh ; n
                db  67h ; g
                db  20h
                db 0A2h
                db  6Dh ; m
                db  65h ; e
                db  20h
                db 0A0h
                db  61h ; a
                db  6Eh ; n
                db  64h ; d
                db  20h
                db 0A1h
                db  73h ; s
                db  61h ; a
                db  76h ; v
                db 0A2h
                db  69h ; i
                db  6Eh ; n
                db  67h ; g
                db  20h
                db 0A0h
                db  6Dh ; m
                db  79h ; y
                db  20h
                db 0A1h
                db  63h ; c
                db  6Fh ; o
                db 0A0h
                db  75h ; u
                db  6Eh ; n
                db 0A2h
                db  74h ; t
                db  72h ; r
                db  79h ; y
                db  2Eh ; .
                db  22h ; "
                db 0A1h
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0FDh
                db 0F3h
aFather         db '"Father!"'
                db 0F5h
                db 0F5h
                db 0F2h
                db 0EEh
aMyDarlingFelic db '"My darling Felicia!  '
                db 0F5h
aHowIVeLongedTo db 'How I',27h,'ve longed to hold you in my arms and hear your sweet '
                db 'voice!"'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FAh
                db 0FEh
                db 0F3h
                db 0F0h
aOutsideTheLand db 'Outside, the land cursed by the evil magic of Jashiin began to re'
                db 'sume its original lushness.'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F3h
aTheDreadfulPow db 'The dreadful power of Jashiin was washed from the earth, and the '
                db 'land of Zeliard was peaceful once more.'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0FDh
                db 0FAh
                db 0F3h
aTheGuardianSpi db 'The Guardian Spirit of the Holy Land of Zeliard appeared before D'
                db 'uke Garland once again.'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F3h
                db 0FBh
                db 0ECh
aYouHaveSuffere db '"You have suffered many hardships to defeat Jashiin, Duke Garland'
                db '."'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0FDh
                db 0FBh
                db 0F3h
                db  22h ; "
                db  83h
                db  59h ; Y
                db  6Fh ; o
                db  75h ; u
                db  20h
                db  81h
                db  66h ; f
                db  6Fh ; o
                db  75h ; u
                db  82h
                db  67h ; g
                db  68h ; h
                db  74h ; t
                db  20h
                db  83h
                db  62h ; b
                db  81h
                db  72h ; r
                db  61h ; a
                db  83h
                db  76h ; v
                db  65h ; e
                db  82h
                db  6Ch ; l
                db  79h ; y
                db  20h
                db  83h
                db  74h ; t
                db  6Fh ; o
                db  20h
                db  80h
                db  61h ; a
                db  83h
                db  63h ; c
                db  63h ; c
                db  6Fh ; o
                db  84h
                db  6Dh ; m
                db  82h
                db  70h ; p
                db  6Ch ; l
                db  69h ; i
                db  83h
                db  73h ; s
                db  68h ; h
                db  20h
                db  82h
                db  74h ; t
                db  68h ; h
                db  69h ; i
                db  83h
                db  73h ; s
                db  20h
                db  83h
                db  71h ; q
                db  75h ; u
                db  81h
                db  65h ; e
                db  83h
                db  73h ; s
                db  74h ; t
                db  2Eh ; .
                db  20h
                db  20h
                db 0F5h
                db  80h
                db  42h ; B
                db  75h ; u
                db  83h
                db  74h ; t
                db  20h
                db  82h
                db  74h ; t
                db  68h ; h
                db  69h ; i
                db  83h
                db  73h ; s
                db  20h
                db  80h
                db  77h ; w
                db  61h ; a
                db  83h
                db  73h ; s
                db  20h
                db  6Fh ; o
                db  84h
                db  6Eh ; n
                db  82h
                db  6Ch ; l
                db  79h ; y
                db  20h
                db  81h
                db  74h ; t
                db  68h ; h
                db  65h ; e
                db  20h
                db  82h
                db  62h ; b
                db  65h ; e
                db  67h ; g
                db  69h ; i
                db  6Eh ; n
                db  84h
                db  6Eh ; n
                db  69h ; i
                db  6Eh ; n
                db  83h
                db  67h ; g
                db  2Eh ; .
                db  20h
                db  20h
                db  84h
                db 0F5h
                db  83h
                db  59h ; Y
                db  6Fh ; o
                db  75h ; u
                db  80h
                db  72h ; r
                db  20h
                db  81h
                db  6Eh ; n
                db  65h ; e
                db  83h
                db  78h ; x
                db  74h ; t
                db  20h
                db  82h
                db  6Dh ; m
                db  69h ; i
                db  83h
                db  73h ; s
                db  73h ; s
                db  82h
                db  69h ; i
                db  6Fh ; o
                db  84h
                db  6Eh ; n
                db  20h
                db  80h
                db  61h ; a
                db  77h ; w
                db  61h ; a
                db  82h
                db  69h ; i
                db  83h
                db  74h ; t
                db  73h ; s
                db  20h
                db  83h
                db  79h ; y
                db  6Fh ; o
                db  75h ; u
                db  20h
                db  82h
                db  69h ; i
                db  84h
                db  6Eh ; n
                db  20h
                db  80h
                db  61h ; a
                db  20h
                db  82h
                db  6Eh ; n
                db  65h ; e
                db  83h
                db  77h ; w
                db  20h
                db  80h
                db  6Ch ; l
                db  61h ; a
                db  84h
                db  6Eh ; n
                db  64h ; d
                db  2Eh ; .
                db  22h ; "
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F7h
                db 0EFh
                db  22h ; "
                db  90h
                db  4Dh ; M
                db  92h
                db  79h ; y
                db  20h
                db  91h
                db  6Eh ; n
                db  65h ; e
                db  93h
                db  78h ; x
                db  74h ; t
                db  20h
                db  92h
                db  6Dh ; m
                db  69h ; i
                db  93h
                db  73h ; s
                db  73h ; s
                db  69h ; i
                db  6Fh ; o
                db  94h
                db  6Eh ; n
                db  3Fh ; ?
                db  22h ; "
                db  97h
                db  20h
                db  98h
                db  20h
                db  97h
                db  20h
                db  96h
                db 0F5h
                db 0F3h
                db 0ECh
                db  22h ; "
                db  81h
                db  54h ; T
                db  68h ; h
                db  65h ; e
                db  80h
                db  72h ; r
                db  65h ; e
                db  20h
                db  80h
                db  61h ; a
                db  72h ; r
                db  65h ; e
                db  20h
                db  81h
                db  6Dh ; m
                db  61h ; a
                db  84h
                db  6Eh ; n
                db  79h ; y
                db  20h
                db  83h
                db  77h ; w
                db  68h ; h
                db  6Fh ; o
                db  20h
                db  81h
                db  68h ; h
                db  61h ; a
                db  83h
                db  76h ; v
                db  65h ; e
                db  20h
                db  82h
                db  6Eh ; n
                db  65h ; e
                db  65h ; e
                db  83h
                db  64h ; d
                db  20h
                db  6Fh ; o
                db  66h ; f
                db  84h
                db  20h
                db  83h
                db  79h ; y
                db  6Fh ; o
                db  80h
                db  75h ; u
                db  72h ; r
                db  20h
                db  83h
                db  73h ; s
                db  81h
                db  70h ; p
                db  65h ; e
                db  82h
                db  63h ; c
                db  69h ; i
                db  80h
                db  61h ; a
                db  83h
                db  6Ch ; l
                db  20h
                db  80h
                db  74h ; t
                db  61h ; a
                db  81h
                db  6Ch ; l
                db  65h ; e
                db  84h
                db  6Eh ; n
                db  82h
                db  74h ; t
                db  73h ; s
                db  2Eh ; .
                db  20h
                db  20h
                db  84h
                db 0F5h
                db  83h
                db  46h ; F
                db  6Fh ; o
                db  6Ch ; l
                db  6Ch ; l
                db  6Fh ; o
                db  77h ; w
                db  20h
                db  82h
                db  6Dh ; m
                db  65h ; e
                db  20h
                db  80h
                db  61h ; a
                db  84h
                db  6Eh ; n
                db  64h ; d
                db  20h
                db  80h
                db  49h ; I
                db  20h
                db  83h
                db  77h ; w
                db  82h
                db  69h ; i
                db  6Ch ; l
                db  6Ch ; l
                db  20h
                db  83h
                db  73h ; s
                db  68h ; h
                db  6Fh ; o
                db  77h ; w
                db  81h
                db  20h
                db  85h
                db  79h ; y
                db  6Fh ; o
                db  75h ; u
                db  20h
                db  81h
                db  74h ; t
                db  68h ; h
                db  65h ; e
                db  20h
                db  83h
                db  77h ; w
                db  80h
                db  61h ; a
                db  82h
                db  79h ; y
                db  2Eh ; .
                db  84h
                db  20h
                db 0F5h
                db  83h
                db  57h ; W
                db  82h
                db  65h ; e
                db  20h
                db  80h
                db  6Dh ; m
                db  75h ; u
                db  83h
                db  73h ; s
                db  74h ; t
                db  20h
                db  81h
                db  64h ; d
                db  65h ; e
                db  80h
                db  70h ; p
                db  61h ; a
                db  72h ; r
                db  83h
                db  74h ; t
                db  20h
                db  85h
                db  71h ; q
                db  75h ; u
                db  82h
                db  69h ; i
                db  63h ; c
                db  83h
                db  6Bh ; k
                db  82h
                db  6Ch ; l
                db  79h ; y
                db  2Eh ; .
                db  22h ; "
                db  84h
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F0h
                db 0F3h
                db 0FAh
aThereWasNoTime db 'There was no time to rest, '
                db  97h
                db  61h ; a
                db  6Eh ; n
                db  98h
aDNoTimeToStayI db 'd no time to stay in this peaceful land.'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FDh
                db 0FEh
                db 0F3h
                db 0FBh
                db 0EBh
                db  97h
                db  22h ; "
                db  96h
                db 0B0h
                db  4Dh ; M
                db  75h ; u
                db 0B3h
                db  73h ; s
                db 0B4h
                db  74h ; t
                db  20h
                db  79h ; y
                db  6Fh ; o
                db  75h ; u
                db  20h
                db 0B2h
                db  6Ch ; l
                db  65h ; e
                db 0B1h
                db  61h ; a
                db 0B3h
                db  76h ; v
                db  65h ; e
                db 0B4h
                db  20h
                db 0B3h
                db  73h ; s
                db  6Fh ; o
                db  20h
                db 0B5h
                db  73h ; s
                db  6Fh ; o
                db  6Fh ; o
                db 0B4h
                db  6Eh ; n
                db  2Ch ; ,
                db  20h
                db 0B7h
                db 0B3h
                db  44h ; D
                db 0B8h
                db  75h ; u
                db 0B1h
                db 0B7h
                db  6Bh ; k
                db 0B6h
                db  65h ; e
                db  20h
                db 0B0h
                db  47h ; G
                db  61h ; a
                db  72h ; r
                db  6Ch ; l
                db  61h ; a
                db 0B4h
                db  6Eh ; n
                db  64h ; d
                db  3Fh ; ?
                db  20h
                db  20h
                db 0F5h
                db 0F2h
                db 0B7h
                db 0B0h
                db  49h ; I
                db 0B8h
                db  20h
                db 0B7h
                db 0B5h
                db  77h ; w
                db 0B6h
                db 0B0h
                db  61h ; a
                db  73h ; s
                db  20h
                db 0B3h
                db  68h ; h
                db  6Fh ; o
                db  70h ; p
                db 0B2h
                db  69h ; i
                db 0B4h
                db  6Eh ; n
                db 0B3h
                db  67h ; g
                db  2Eh ; .
                db  2Eh ; .
                db  2Eh ; .
                db 0B4h
                db  22h ; "
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F7h
                db 0EFh
                db  22h ; "
                db  95h
                db  50h ; P
                db  72h ; r
                db  92h
                db  69h ; i
                db  94h
                db  6Eh ; n
                db  91h
                db  63h ; c
                db  65h ; e
                db  93h
                db  73h ; s
                db  73h ; s
                db  20h
                db  91h
                db  46h ; F
                db  65h ; e
                db  92h
                db  6Ch ; l
                db  69h ; i
                db  63h ; c
                db  69h ; i
                db  90h
                db  61h ; a
                db  2Ch ; ,
                db  20h
                db  97h
                db  90h
                db  49h ; I
                db  98h
                db  92h
                db  20h
                db  97h
                db  90h
                db  6Dh ; m
                db  96h
                db  75h ; u
                db  93h
                db  73h ; s
                db  74h ; t
                db  20h
                db  92h
                db  62h ; b
                db  69h ; i
                db  93h
                db  64h ; d
                db  20h
                db  93h
                db  79h ; y
                db  6Fh ; o
                db  75h ; u
                db  20h
                db  91h
                db  66h ; f
                db  61h ; a
                db  90h
                db  72h ; r
                db  65h ; e
                db  91h
                db  77h ; w
                db  65h ; e
                db  93h
                db  6Ch ; l
                db  6Ch ; l
                db  2Eh ; .
                db  94h
                db  20h
                db  20h
                db 0F5h
                db  93h
                db  4Dh ; M
                db  6Fh ; o
                db  72h ; r
                db  94h
                db  6Eh ; n
                db  69h ; i
                db  6Eh ; n
                db  95h
                db  67h ; g
                db  20h
                db  92h
                db  69h ; i
                db  95h
                db  73h ; s
                db  20h
                db  90h
                db  63h ; c
                db  6Fh ; o
                db  6Dh ; m
                db  92h
                db  69h ; i
                db  94h
                db  6Eh ; n
                db  67h ; g
                db  20h
                db  93h
                db  73h ; s
                db  6Fh ; o
                db  6Fh ; o
                db  94h
                db  6Eh ; n
                db  2Ch ; ,
                db  20h
                db  90h
                db  61h ; a
                db  94h
                db  6Eh ; n
                db  64h ; d
                db  20h
                db  90h
                db  49h ; I
                db  92h
                db  20h
                db  97h
                db  92h
                db  77h ; w
                db  98h
                db  69h ; i
                db  93h
                db  97h
                db  6Ch ; l
                db  96h
                db  6Ch ; l
                db  20h
                db  92h
                db  6Dh ; m
                db  69h ; i
                db  93h
                db  73h ; s
                db  73h ; s
                db  20h
                db  91h
                db  74h ; t
                db  68h ; h
                db  65h ; e
                db  20h
                db  90h
                db  6Ch ; l
                db  91h
                db  69h ; i
                db  67h ; g
                db  93h
                db  68h ; h
                db  74h ; t
                db  20h
                db  6Fh ; o
                db  95h
                db  66h ; f
                db  20h
                db  93h
                db  53h ; S
                db  92h
                db  70h ; p
                db  69h ; i
                db  72h ; r
                db  69h ; i
                db  93h
                db  74h ; t
                db  20h
                db  75h ; u
                db  94h
                db  6Eh ; n
                db  91h
                db  6Ch ; l
                db  65h ; e
                db  93h
                db  73h ; s
                db  73h ; s
                db  20h
                db  90h
                db  49h ; I
                db  92h
                db  20h
                db  73h ; s
                db  90h
                db  74h ; t
                db  61h ; a
                db  72h ; r
                db  94h
                db  74h ; t
                db  20h
                db  91h
                db  62h ; b
                db  65h ; e
                db  93h
                db  66h ; f
                db  6Fh ; o
                db  90h
                db  72h ; r
                db  65h ; e
                db  20h
                db  91h
                db  74h ; t
                db  68h ; h
                db  65h ; e
                db  20h
                db  90h
                db  64h ; d
                db  61h ; a
                db  94h
                db  77h ; w
                db  6Eh ; n
                db  2Eh ; .
                db  22h ; "
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F0h
                db 0F3h
                db 0FAh
aTheDukeAnswere db 'The Duke answered quickly, as if to head off the next words of Pr'
                db 'incess Felicia.'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FDh
                db 0FEh
                db 0F3h
                db 0FAh
aForIfHeHeardTh db 'For if he heard those words, he might not be able to leave, as he'
                db ' knew he must.  '
                db 0F5h
aHeTurnedAndWal db 'He turned and walked away...'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F7h
                db 0FBh
                db 0EBh
                db  22h ; "
                db 0C0h
                db  44h ; D
                db  6Fh ; o
                db 0C1h
                db  6Eh ; n
                db  27h ; '
                db  74h ; t
                db  20h
                db 0C0h
                db  67h ; g
                db  6Fh ; o
                db  2Ch ; ,
                db  20h
                db 0C1h
                db  44h ; D
                db  75h ; u
                db 0C0h
                db  6Bh ; k
                db  65h ; e
                db  20h
                db 0C0h
                db  47h ; G
                db  61h ; a
                db  72h ; r
                db 0C1h
                db  6Ch ; l
                db  61h ; a
                db  6Eh ; n
                db 0C0h
                db  64h ; d
                db  21h ; !
                db  22h ; "
                db 0F5h
                db 0F0h
                db 0F3h
                db 0FAh
aAndDidNotLookB db '... and did not look back.'
                db 0F5h
                db 0FDh
                db 0F2h
aDukeGarlandLef db 'Duke Garland left the castle, and he felt as if his heart might b'
                db 'reak.'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F7h
aAsSheWatchedHi db 'As she watched him go, Princess Felicia said to herself, '
                db 0F5h
                db 0F2h
                db 0FBh
aHeWillReturn   db '"He will return.  '
                db 0F5h
aTheRoadToHisDe db 'The road to his destiny, began here, and it shall end here."'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FEh
                db 0F3h
aWhenHisWorkInT db '"When his work in the world is done, he',27h,'ll come back to me.'
                db '  '
                db 0F5h
aUntilThenICanO db 'Until then, I can only believe it, and wait for him."'
                db 0F5h
                db 0F5h
                db 0F5h
                db 0F5h
                db 0F5h
                db 0FDh
                db 0FFh
                db  77h ; w
                db    0
                db  77h ; w
                db  77h ; w
                db  70h ; p
                db  5Dh ; ]
                db 0DDh
                db 0DDh
                db 0DDh
                db 0DCh
                db  3Fh ; ?
                db 0E0h
                db  94h
                db  77h ; w
                db  70h ; p
                db  1Dh
                db 0D9h
                db 0E3h
                db 0DDh
                db 0C0h
                db    7
                db  75h ; u
                db    7
                db  77h ; w
                db    0
                db    1
                db 0DCh
                db  1Dh
                db 0DCh
                db    0
                db  80h
                db  77h ; w
                db  77h ; w
                db  70h ; p
                db    4
                db  88h
                db  1Dh
                db 0DDh
                db  80h
                db    8
                db 0B2h
                db    3
                db  70h ; p
                db    0
                db  74h ; t
                db 0FCh
                db    0
                db    0
                db    0
                db 0D8h
                db 0D6h
                db    0
                db    0
                db    7
                db  74h ; t
                db 0FFh
                db 0E0h
                db  7Fh ; 
                db 0FFh
                db 0F1h
                db  7Fh ; 
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FCh
                db  3Fh ; ?
                db 0F9h
                db 0F7h
                db 0FFh
                db 0F8h
                db  9Fh
                db 0F9h
                db 0EFh
                db 0FFh
                db 0E0h
                db 0C7h
                db 0FFh
                db 0FFh
                db 0FFh
                db  84h
                db 0F1h
                db 0FEh
                db  1Fh
                db 0FEh
                db  0Ch
                db 0FCh
                db  7Fh ; 
                db 0FFh
                db 0F0h
                db  1Ch
                db 0FFh
                db  1Fh
                db 0FFh
                db  80h
                db  7Ch ; |
                db 0FFh
                db    3
                db 0F8h
                db    1
                db 0FCh
                db 0FFh
                db  30h ; 0
                db    0
                db    7
                db 0FCh
                db 0FFh
                db  30h ; 0
                db    0
                db  1Fh
                db 0FCh
                db 0FFh
                db 0A0h
                db  7Fh ; 
                db 0FFh
                db 0F1h
                db  7Fh ; 
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FCh
                db  3Fh ; ?
                db 0F0h
                db  83h
                db 0FFh
                db 0F8h
                db  9Fh
                db 0E1h
                db 0E0h
                db 0FFh
                db 0E0h
                db 0C7h
                db 0F9h
                db    3
                db 0FFh
                db  84h
                db 0F1h
                db 0FEh
                db  1Fh
                db 0FEh
                db    8
                db 0F4h
                db  7Fh ; 
                db 0FFh
                db 0F0h
                db  14h
                db 0FDh
                db  1Fh
                db 0FFh
                db  80h
                db  28h ; (
                db 0F7h
                db    3
                db 0F8h
                db    1
                db  74h ; t
                db 0FDh
                db  20h
                db    0
                db    2
                db 0F8h
                db 0F7h
                db  20h
                db    0
                db  17h
                db 0FCh
                db  77h ; w
                db    0
                db  77h ; w
                db  77h ; w
                db  70h ; p
                db  5Dh ; ]
                db 0DDh
                db 0DDh
                db 0DDh
                db 0DCh
                db  3Fh ; ?
                db 0FFh
                db 0FCh
                db  77h ; w
                db  70h ; p
                db  1Dh
                db 0D9h
                db 0C3h
                db 0DDh
                db 0C0h
                db    7
                db  77h ; w
                db 0FFh
                db  77h ; w
                db    0
                db    1
                db 0DCh
                db  1Dh
                db 0DCh
                db    0
                db  80h
                db  77h ; w
                db  77h ; w
                db  70h ; p
                db    4
                db  88h
                db  1Dh
                db 0DDh
                db  80h
                db    8
                db 0B2h
                db    3
                db  70h ; p
                db    0
                db  74h ; t
                db 0FCh
                db    0
                db    0
                db    0
                db 0D8h
                db 0D6h
                db    0
                db    0
                db    7
                db  74h ; t
                db 0FFh
                db 0E0h
                db  7Fh ; 
                db 0FFh
                db 0F1h
                db  7Fh ; 
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FCh
                db  3Fh ; ?
                db 0FFh
                db 0FFh
                db 0FFh
                db 0F8h
                db  9Fh
                db 0F9h
                db 0EFh
                db 0FFh
                db 0E0h
                db 0C7h
                db 0FFh
                db 0FFh
                db 0FFh
                db  84h
                db 0F1h
                db 0FEh
                db  1Fh
                db 0FEh
                db  0Ch
                db 0FCh
                db  7Fh ; 
                db 0FFh
                db 0F0h
                db  1Ch
                db 0FFh
                db  1Fh
                db 0FFh
                db  80h
                db  7Ch ; |
                db 0FFh
                db    3
                db 0F8h
                db    1
                db 0FCh
                db 0FFh
                db  30h ; 0
                db    0
                db    7
                db 0FCh
                db 0FFh
                db  30h ; 0
                db    0
                db  1Fh
                db 0FCh
                db 0FFh
                db 0A0h
                db  7Fh ; 
                db 0FFh
                db 0F1h
                db  7Fh ; 
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FCh
                db  3Fh ; ?
                db 0FFh
                db 0FFh
                db 0FFh
                db 0F8h
                db  9Fh
                db 0E1h
                db 0C0h
                db 0FFh
                db 0E0h
                db 0C7h
                db 0FFh
                db  87h
                db 0FFh
                db  84h
                db 0F1h
                db 0FEh
                db  1Fh
                db 0FEh
                db    8
                db 0F4h
                db  7Fh ; 
                db 0FFh
                db 0F0h
                db  14h
                db 0FDh
                db  1Fh
                db 0FFh
                db  80h
                db  28h ; (
                db 0F7h
                db    3
                db 0F8h
                db    1
                db  74h ; t
                db 0FDh
                db  20h
                db    0
                db    2
                db 0F8h
                db 0F7h
                db  20h
                db    0
                db  17h
                db 0FCh
                db  77h ; w
                db    0
                db  77h ; w
                db  77h ; w
                db  70h ; p
                db  5Dh ; ]
                db 0DDh
                db 0DDh
                db 0DDh
                db 0DCh
                db  37h ; 7
                db 0E0h
                db  94h
                db  77h ; w
                db  70h ; p
                db  1Dh
                db 0D1h
                db 0E3h
                db 0DDh
                db 0D0h
                db    7
                db  70h ; p
                db    3
                db  77h ; w
                db  40h ; @
                db    5
                db 0DDh
                db  0Dh
                db 0DDh
                db    0
                db  81h
                db  76h ; v
                db  17h
                db  74h ; t
                db    4
                db  88h
                db  5Dh ; ]
                db 0DDh
                db 0D0h
                db    8
                db 0B2h
                db  17h
                db  77h ; w
                db    0
                db  74h ; t
                db 0FCh
                db    1
                db 0D8h
                db    0
                db 0D8h
                db 0D6h
                db    0
                db    0
                db    7
                db  74h ; t
                db 0FFh
                db 0E0h
                db  7Fh ; 
                db 0FFh
                db 0F1h
                db  7Fh ; 
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FCh
                db  3Fh ; ?
                db 0F9h
                db 0F7h
                db 0FFh
                db 0F8h
                db  9Fh
                db 0F9h
                db 0E3h
                db 0FFh
                db 0F0h
                db 0CFh
                db 0FEh
                db  0Fh
                db 0FFh
                db 0C4h
                db 0E7h
                db 0FFh
                db 0FFh
                db 0FFh
                db  0Ch
                db 0F9h
                db 0FFh
                db  1Fh
                db 0FCh
                db  1Ch
                db 0FEh
                db  7Fh ; 
                db 0FFh
                db 0F0h
                db  7Ch ; |
                db 0FFh
                db  1Fh
                db 0FFh
                db  81h
                db 0FCh
                db 0FFh
                db  23h ; #
                db 0F8h
                db    7
                db 0FCh
                db 0FFh
                db  30h ; 0
                db    0
                db  1Fh
                db 0FCh
                db 0FFh
                db 0A0h
                db  7Fh ; 
                db 0FFh
                db 0F1h
                db  7Fh ; 
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FCh
                db  3Fh ; ?
                db 0F0h
                db  83h
                db 0FFh
                db 0F8h
                db  9Fh
                db 0E1h
                db 0E0h
                db 0FFh
                db 0F0h
                db 0CFh
                db 0F8h
                db    1
                db 0FFh
                db 0C4h
                db 0E7h
                db 0FDh
                db    7
                db 0FFh
                db    8
                db 0F1h
                db 0FFh
                db  0Fh
                db 0FCh
                db  14h
                db 0FCh
                db  7Fh ; 
                db 0FFh
                db 0F0h
                db  28h ; (
                db 0F7h
                db  1Fh
                db 0FFh
                db  81h
                db  74h ; t
                db 0FDh
                db  23h ; #
                db 0F8h
                db    2
                db 0F8h
                db 0F7h
                db  20h
                db    0
                db  17h
                db 0FCh
                db  20h
                db    0
                db  70h ; p
                db    0
                db    0
                db    3
                db    2
                db  88h
                db    0
                db  0Dh
                db 0D8h
                db    0
                db    1
                db 0C0h
                db    2
                db    0
                db    7
                db  77h ; w
                db  19h
                db  81h
                db  40h ; @
                db    0
                db  26h ; &
                db    5
                db 0DDh
                db 0FCh
                db 0A9h
                db  80h
                db    0
                db  75h ; u
                db    3
                db  77h ; w
                db  7Fh ; 
                db  77h ; w
                db    0
                db    0
                db  3Fh ; ?
                db    3
                db 0DDh
                db 0D4h
                db  5Dh ; ]
                db 0C0h
                db    3
                db  6Ah ; j
                db    3
                db  77h ; w
                db 0FFh
                db  77h ; w
                db    8
                db    1
                db 0FDh
                db    3
                db 0DFh
                db 0FDh
                db 0C5h
                db  18h
                db 0F1h
                db  78h ; x
                db  78h ; x
                db  27h ; '
                db 0E0h
                db  1Fh
                db  1Fh
                db 0F8h
                db    3
                db 0BFh
                db 0FFh
                db  80h
                db    7
                db 0C0h
                db  1Eh
                db    0
                db 0F7h
                db 0FFh
                db  11h
                db  81h
                db 0CCh
                db    0
                db    6
                db  7Fh ; 
                db 0FFh
                db 0F0h
                db  23h ; #
                db  90h
                db  27h ; '
                db  41h ; A
                db  7Bh ; {
                db 0FFh
                db 0F8h
                db  17h
                db  82h
                db  23h ; #
                db 0B0h
                db  73h ; s
                db 0FFh
                db 0F4h
                db  5Fh ; _
                db 0CEh
                db  23h ; #
                db 0EAh
                db 0F3h
                db 0FFh
                db 0FFh
                db 0FFh
                db  8Eh
                db  63h ; c
                db 0FFh
                db 0E3h
                db 0FFh
                db 0FFh
                db 0E7h
                db  1Ch
                db  71h ; q
                db  50h ; P
                db  78h ; x
                db  22h ; "
                db 0A0h
                db  0Bh
                db  17h
                db 0D8h
                db    2
                db 0AFh
                db 0FDh
                db    0
                db    7
                db 0C0h
                db  16h
                db    0
                db  57h ; W
                db 0FFh
                db  11h
                db  81h
                db 0CCh
                db    0
                db    6
                db  2Fh ; /
                db 0FFh
                db 0F0h
                db  23h ; #
                db  90h
                db  25h ; %
                db  41h ; A
                db  53h ; S
                db 0FFh
                db 0F8h
                db  17h
                db  82h
                db  22h ; "
                db 0B0h
                db  63h ; c
                db 0FFh
                db 0F4h
                db  5Fh ; _
                db 0CEh
                db  23h ; #
                db 0EAh
                db 0D3h
                db 0FFh
                db 0FFh
                db 0FFh
                db  8Eh
                db  63h ; c
                db 0FFh
                db 0A3h
                db 0FFh
                db 0FFh
                db 0E7h
                db  1Ch
                db  20h
                db    0
                db  70h ; p
                db    0
                db    0
                db    3
                db    2
                db  88h
                db    0
                db  0Dh
                db 0D8h
                db    0
                db    1
                db 0C0h
                db    2
                db    0
                db    7
                db  77h ; w
                db    0
                db    1
                db  40h ; @
                db    0
                db    0
                db    5
                db 0DDh
                db 0FCh
                db  29h ; )
                db  80h
                db    0
                db  61h ; a
                db    3
                db  77h ; w
                db  7Fh ; 
                db  77h ; w
                db    0
                db    0
                db  3Fh ; ?
                db    3
                db 0DDh
                db 0D4h
                db  5Dh ; ]
                db 0C0h
                db    3
                db  6Ah ; j
                db    3
                db  77h ; w
                db 0FFh
                db  77h ; w
                db    8
                db    1
                db 0FDh
                db    3
                db 0DFh
                db 0FDh
                db 0C5h
                db  18h
                db 0F1h
                db  78h ; x
                db  78h ; x
                db  27h ; '
                db 0FFh
                db 0FFh
                db  1Fh
                db 0F8h
                db  5Bh ; [
                db 0BFh
                db 0FFh
                db 0F4h
                db    7
                db 0C0h
                db  1Eh
                db  26h ; &
                db 0F7h
                db 0FFh
                db  40h ; @
                db    1
                db 0CCh
                db    0
                db    0
                db  7Fh ; 
                db 0FFh
                db 0F0h
                db  23h ; #
                db  90h
                db  27h ; '
                db  41h ; A
                db  7Bh ; {
                db 0FFh
                db 0F8h
                db  17h
                db  82h
                db  23h ; #
                db 0B0h
                db  73h ; s
                db 0FFh
                db 0F4h
                db  5Fh ; _
                db 0CEh
                db  23h ; #
                db 0EAh
                db 0F3h
                db 0FFh
                db 0FFh
                db 0FFh
                db  8Eh
                db  63h ; c
                db 0FFh
                db 0E3h
                db 0FFh
                db 0FFh
                db 0E7h
                db  1Ch
                db  71h ; q
                db  50h ; P
                db  78h ; x
                db  22h ; "
                db 0A0h
                db  0Bh
                db  17h
                db 0D8h
                db    2
                db 0AFh
                db 0FDh
                db    0
                db    7
                db 0C0h
                db  16h
                db    0
                db  57h ; W
                db 0FFh
                db    0
                db    1
                db 0CCh
                db    0
                db    0
                db  2Fh ; /
                db 0FFh
                db 0F0h
                db  23h ; #
                db  90h
                db  25h ; %
                db  41h ; A
                db  53h ; S
                db 0FFh
                db 0F8h
                db  17h
                db  82h
                db  22h ; "
                db 0B0h
                db  63h ; c
                db 0FFh
                db 0F4h
                db  5Fh ; _
                db 0CEh
                db  23h ; #
                db 0EAh
                db 0D3h
                db 0FFh
                db 0FFh
                db 0FFh
                db  8Eh
                db  63h ; c
                db 0FFh
                db 0A3h
                db 0FFh
                db 0FFh
                db 0E7h
                db  1Ch
                db  20h
                db    0
                db  70h ; p
                db    0
                db    0
                db    2
                db    2
                db  88h
                db    0
                db  0Dh
                db 0D8h
                db    0
                db    1
                db  40h ; @
                db    2
                db    0
                db    7
                db  77h ; w
                db    0
                db    1
                db  40h ; @
                db    0
                db    0
                db    5
                db 0DDh
                db  80h
                db    1
                db  80h
                db    0
                db    0
                db    3
                db  77h ; w
                db  40h ; @
                db    3
                db    0
                db    0
                db    0
                db    3
                db 0DDh
                db 0D0h
                db  0Dh
                db 0C0h
                db    3
                db  40h ; @
                db    3
                db  77h ; w
                db 0FFh
                db  77h ; w
                db    8
                db    1
                db 0FDh
                db    3
                db 0DFh
                db 0FDh
                db 0C5h
                db  18h
                db 0F1h
                db  78h ; x
                db  78h ; x
                db  27h ; '
                db 0E7h
                db  5Fh ; _
                db  1Fh
                db 0F9h
                db 0EFh
                db 0BFh
                db 0FFh
                db  3Fh ; ?
                db 0F7h
                db 0C0h
                db  1Eh
                db 0BFh
                db 0F7h
                db 0FFh
                db 0FFh
                db 0FFh
                db 0CCh
                db    0
                db  7Fh ; 
                db 0FFh
                db 0FFh
                db  9Fh
                db 0E1h
                db  90h
                db  27h ; '
                db  3Fh ; ?
                db  7Bh ; {
                db 0FFh
                db 0C0h
                db    3
                db  82h
                db  23h ; #
                db    0
                db  73h ; s
                db 0FFh
                db 0F0h
                db  0Fh
                db 0CEh
                db  23h ; #
                db 0C0h
                db 0F3h
                db 0FFh
                db 0FFh
                db 0FFh
                db  8Eh
                db  63h ; c
                db 0FFh
                db 0E3h
                db 0FFh
                db 0FFh
                db 0E7h
                db  1Ch
                db  71h ; q
                db  50h ; P
                db  78h ; x
                db  22h ; "
                db 0A2h
                db  0Ah
                db  17h
                db 0D8h
                db 0AAh
                db 0AFh
                db 0FDh
                db  1Dh
                db  23h ; #
                db  40h ; @
                db  16h
                db  18h
                db  57h ; W
                db 0FFh
                db 0BAh
                db  41h ; A
                db 0CCh
                db    0
                db  30h ; 0
                db  2Fh ; /
                db 0FFh
                db  94h
                db    1
                db  90h
                db  25h ; %
                db    0
                db  13h
                db 0FFh
                db 0C0h
                db    3
                db  82h
                db  22h ; "
                db    0
                db  63h ; c
                db 0FFh
                db 0F0h
                db  0Fh
                db 0CEh
                db  23h ; #
                db 0C0h
                db 0D3h
                db 0FFh
                db 0FFh
                db 0FFh
                db  8Eh
                db  63h ; c
                db 0FFh
                db 0A3h
                db 0FFh
                db 0FFh
                db 0E7h
                db  1Ch
                db 0AAh
                db 0AAh
                db  5Fh ; _
                db  55h ; U
                db 0B1h
                db 0AAh
                db  56h ; V
                db  54h ; T
                db  0Ah
                db 0A0h
                db    5
                db    0
                db  80h
                db    0
                db  40h ; @
                db    0
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FFh
                db 0F9h
                db 0FFh
                db  7Fh ; 
                db 0FEh
                db  1Fh
                db 0F0h
                db  8Fh
                db  83h
                db 0C0h
                db    7
                db 0C0h
                db  1Eh
                db 0FFh
                db 0FFh
                db 0E6h
                db 0FFh
                db 0E0h
                db  7Fh ; 
                db  79h ; y
                db 0FCh
                db  1Fh
                db 0F0h
                db  8Fh
                db  80h
                db 0C0h
                db    5
                db 0C0h
                db  0Ah
                db 0AAh
                db 0AAh
                db  55h ; U
                db 0D5h
                db 0A0h
                db  2Ah ; *
                db  56h ; V
                db  54h ; T
                db  0Ah
                db 0A0h
                db    5
                db    0
                db  80h
                db    0
                db  40h ; @
                db    0
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FFh
                db 0FFh
                db  7Fh ; 
                db 0FEh
                db  1Fh
                db 0F0h
                db  8Fh
                db  83h
                db 0C0h
                db    7
                db 0C0h
                db  1Eh
                db 0FFh
                db 0FFh
                db 0E4h
                db  7Fh ; 
                db 0FFh
                db 0FFh
                db  79h ; y
                db 0FCh
                db  1Fh
                db 0F0h
                db  8Fh
                db  80h
                db 0C0h
                db    5
                db 0C0h
                db  0Ah
                db 0FEh
                db 0F7h
                db 0F8h
                db    0
                db    4
                db 0FEh
                db 0FCh
                db 0FBh
                db    1
                db  11h
                db 0FAh
                db    0
                db  53h ; S
                db  54h ; T
                db  41h ; A
                db  46h ; F
                db  46h ; F
                db 0F9h
                db 0FCh
                db 0F8h
                db  20h
                db    1
                db 0F9h
                db 0FCh
                db 0FAh
                db    7
                db 0F8h
                db  25h ; %
                db    5
                db 0FDh
                db    9
aProducerJapane db 'PRODUCER - JAPANESE VERSION'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
aMitsuhiroMazda db '   Mitsuhiro Mazda'
                db 0F9h
                db 0FCh
                db 0FDh
                db    9
aProducerEnglis db 'PRODUCER - ENGLISH VERSION'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
aJoshMandel     db '     Josh Mandel'
                db 0F9h
                db 0FCh
                db 0FDh
                db    9
aLeadProgrammer db 'LEAD PROGRAMMER'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aTomoyukiShimad db 'Tomoyuki Shimada'
                db 0F9h
                db 0FCh
                db 0FDh
                db    9
aGraphicDesigne db 'GRAPHIC DESIGNERS'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aAkihikoYoshida db 'Akihiko Yoshida'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aMasatoshiAzumi db 'Masatoshi Azumi'
                db 0F9h
                db 0FCh
                db 0FDh
                db    9
aEnglishTextTra db 'ENGLISH TEXT TRANSLATION'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aMartiMckenna   db ' Marti McKenna'
                db 0F9h
                db 0FCh
                db    9
aMusicComposers db 'MUSIC COMPOSERS'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
aMecanoAssociat db '-- MECANO ASSOCIATES --'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
aFumihitoKasata db '   Fumihito Kasatani'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
aNobuyukiAoshim db '   Nobuyuki Aoshima'
                db 0F9h
                db 0FCh
                db 0FDh
                db    9
aStoryMaker     db 'STORY MAKER'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aMasaruTakeuchi db 'Masaru Takeuchi'
                db 0F9h
                db 0FCh
                db 0FDh
                db    9
aSoundEffects   db 'SOUND EFFECTS'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aTomoyukiShimad_0 db 'Tomoyuki Shimada'
                db 0F9h
                db 0F8h
                db    0
                db    3
                db 0FCh
                db 0FEh
                db 0F7h
                db 0FEh
                db 0FBh
                db    1
                db  0Dh
                db 0FAh
                db    0
aSpecialThanks  db 'SPECIAL THANKS'
                db 0F9h
                db 0FCh
                db 0F8h
                db  20h
                db    1
                db 0F9h
                db 0FCh
                db 0FAh
                db    7
                db 0F8h
                db    0
                db    7
                db 0FDh
                db    9
aToshiyukiUchid db 'Toshiyuki Uchida',9,'Yuzo Sunaga'
                db 0FDh
                db    9
aTakeshiMiyajiN db 'Takeshi Miyaji',9,9,'Naozumi Honma'
                db 0FDh
                db    9
aRayENakazatoTo db 'Ray E. Nakazato',9,9,'Toshi Masubuchi'
                db 0F9h
                db 0FCh
                db 0FDh
                db    9
aHiroyukiKoyama db 'Hiroyuki Koyama',9,9,'Satoshi Uesaka'
                db 0FDh
aSierraOnLineJa db '     -- Sierra On-Line Japan, Inc. --'
                db 0FDh
                db    9
                db    9
                db    9
aEijiEdNagano   db ' Eiji (Ed) Nagano'
                db 0F9h
                db 0FCh
                db    9
aAdvisers       db 'ADVISERS'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aOsamuHarada    db '  Osamu Harada'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aHiromiOhba     db '  Hiromi Ohba'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aGregMiyaji     db '  Greg Miyaji'
                db 0F9h
                db 0FCh
                db 0F8h
                db  80h
                db    5
                db 0FDh
                db    9
aSystemDesigner db 'SYSTEM DESIGNER'
                db 0FDh
                db    9
                db    9
                db    9
                db    9
                db    9
aRockyCaveMaker db 'Rocky Cave Maker'
                db 0F9h
                db 0F8h
                db  20h
                db    1
                db 0FCh
                db 0F9h
                db 0F8h
                db    0
                db    3
                db 0FCh
                db 0FBh
                db    1
                db  0Ch
                db 0FAh
                db    0
aServingMonster db 'SERVING MONSTERS'
                db 0F9h
                db 0FCh
                db 0F8h
                db  20h
                db    1
                db 0F9h
                db 0FCh
                db 0FAh
                db    7
                db 0F8h
                db  40h ; @
                db    1
                db    9
aCavernOfMarici db 'Cavern of Maricia',9,9,'CANGREJO'
                db 0F9h
                db 0FDh
                db    9
                db    9
aPeligroPulpo   db 'Peligro',9,9,9,9,'PULPO'
                db 0F9h
                db 0FDh
                db    9
                db    9
aRizaPollo      db 'Riza',9,9,9,9,'POLLO'
                db 0F9h
                db 0F9h
                db 0FCh
                db    9
aCavernOfGlacia db 'Cavern of Glacial',9,9,'AGER'
                db 0F9h
                db 0FDh
                db    9
                db    9
aCementarVista  db 'Cementar',9,9,9,'VISTA'
                db 0F9h
                db 0FDh
                db    9
                db    9
aTesoroTarso    db 'Tesoro',9,9,9,9,'TARSO'
                db 0F9h
                db 0F9h
                db 0FCh
                db    9
                db    9
aLlamaTownPagur db 'Llama Town',9,9,9,'PAGURO'
                db 0F9h
                db 0FDh
                db    9
aCavernOfCalien db 'Cavern of Caliente',9,9,'DRAGON'
                db 0F9h
                db 0FDh
                db    9
                db    9
aAbsorAlguien   db 'Absor',9,9,9,9,'ALGUIEN'
                db 0F9h
                db 0F9h
                db 0FCh
                db 0FAh
                db    0
                db 0FEh
                db    9
aCopyrightC1987 db 'Copyright (C)1987,1990 GAME ARTS'
                db 0FDh
                db    9
aCopyrightC1990 db 'Copyright (C)1990 Sierra On-Line'
                db 0FDh
aThisEditionFir db '  This edition first published 1987 by'
                db 0FDh
aGameArtsCoLtdT db '  GAME ARTS Co.,Ltd./ Tomoyuki Shimada'
                db 0FEh
                db 0F7h
                db 0FEh
                db 0FFh
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    1
                db    2
                db    3
                db    4
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    5
                db    6
                db    7
                db    8
                db    9
                db  0Ah
                db  0Bh
                db  0Ch
                db  0Dh
                db  0Eh
                db  0Fh
                db  10h
                db  11h
                db  12h
                db  13h
                db  14h
                db  15h
                db  16h
                db    0
                db    0
                db    0
                db  17h
                db  18h
                db  19h
                db  1Ah
                db  1Bh
                db  1Ch
                db  1Dh
                db  1Eh
                db  1Fh
                db  20h
                db  21h ; !
                db  22h ; "
                db  23h ; #
                db  24h ; $
                db  25h ; %
                db  26h ; &
                db  27h ; '
                db  28h ; (
                db  29h ; )
                db  2Ah ; *
                db  2Bh ; +
                db  2Ch ; ,
                db  2Dh ; -
                db  2Eh ; .
                db    0
                db    0
                db  2Fh ; /
                db  30h ; 0
                db  31h ; 1
                db  32h ; 2
                db  33h ; 3
                db    0
                db    0
                db  34h ; 4
                db  35h ; 5
                db  36h ; 6
                db  37h ; 7
                db  38h ; 8
                db    0
                db  39h ; 9
                db  26h ; &
                db  3Ah ; :
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
                db  3Bh ; ;
                db  3Ch ; <
                db  3Dh ; =
                db    0
                db    0
                db    0
                db  3Eh ; >
                db  3Fh ; ?
                db  40h ; @
                db  41h ; A
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
                db  42h ; B
                db  43h ; C
                db  44h ; D
                db  45h ; E
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
                db  46h ; F
                db  47h ; G
                db  16h
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
                db  48h ; H
                db  49h ; I
                db  4Ah ; J
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
                db  4Bh ; K
                db  4Ch ; L
                db  4Dh ; M
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
                db  4Eh ; N
                db  4Fh ; O
                db  50h ; P
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
                db  51h ; Q
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
                db  52h ; R
                db  53h ; S
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
                db  54h ; T
                db  55h ; U
                db  56h ; V
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
                db  57h ; W
                db  58h ; X
                db  59h ; Y
                db  5Ah ; Z
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
                db  5Bh ; [
                db  5Ch ; \
                db  5Dh ; ]
                db  5Eh ; ^
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
                db  5Fh ; _
                db  60h ; `
                db  61h ; a
                db  62h ; b
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
                db  63h ; c
                db  64h ; d
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
                db  65h ; e
                db  66h ; f
                db  67h ; g
                db  68h ; h
                db  69h ; i
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
                db  6Ah ; j
                db  6Bh ; k
                db  6Ch ; l
                db  6Dh ; m
                db  6Eh ; n
                db  6Fh ; o
                db  70h ; p
                db  71h ; q
                db  72h ; r
                db  73h ; s
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
                db  74h ; t
                db  75h ; u
                db  76h ; v
                db  77h ; w
                db  78h ; x
                db  79h ; y
                db  7Ah ; z
                db  7Bh ; {
                db  7Ch ; |
                db  7Dh ; }
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
                db  7Eh ; ~
                db  7Fh ; 
                db  80h
                db  81h
                db  82h
                db  83h
                db  84h
                db  85h
                db  86h
                db  87h
                db  88h
                db  89h
                db    0
                db    0
                db    0
                db    0
                db  0Fh
                db  8Ah
                db  8Bh
                db  8Ch
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
                db  2Fh ; /
                db  8Dh
                db  8Eh
                db  8Fh
                db  90h
                db  91h
                db  92h
                db  93h
                db  94h
                db  95h
                db  96h
                db  97h
                db    0
                db    0
                db    0
                db  98h
                db  99h
                db  9Ah
                db  9Bh
                db  9Ch
                db  9Dh
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
                db  9Eh
                db  9Fh
                db 0A0h
                db 0A1h
                db 0A2h
                db 0A3h
                db 0A4h
                db 0A5h
                db 0A6h
                db 0A7h
                db 0A8h
                db 0A9h
                db  16h
                db    0
                db 0AAh
                db 0ABh
                db 0ACh
                db 0ADh
                db 0AEh
                db 0AFh
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
                db 0B0h
                db 0B1h
                db 0B2h
                db 0B3h
                db 0B4h
                db 0B5h
                db 0B6h
                db 0B7h
                db 0B8h
                db  26h ; &
                db  26h ; &
                db 0B9h
                db 0BAh
                db 0BBh
                db 0BCh
                db 0BDh
                db 0BEh
                db 0BFh
                db 0C0h
                db 0C1h
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
byte_807D       db 0
                db    2
                db    2
                db    3
                db    1
                db    0
                db    0
                db    2
                db    2
                db    3
                db    1
                db    1
                db    1
                db    2
                db    2
                db    0
                db    1
                db    2
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    3
                db    2
                db    1
                db    1
                db    2
                db    1
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    0
                db    2
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
                db    1
                db    0
                db    0
                db    0
                db    0
                db    0
                db    1
                db    2
                db    2
                db    2
                db    1
                db    1
                db    1
                db    0
                db    0
                db    1
                db    0
                db    1
                db    1
                db    0
                db    0
                db    2
                db    1
                db    0
                db    2
                db    0
                db    1
                db    1
                db    0
                db    0
                db    0
                db    1
                db    1
                db    0
                db    0
                db    0
                db    1
                db    1
                db    1
                db    2
                db    0
                db    3
                db    1
                db    0
byte_80DD       db 5
                db    4
                db    4
                db    4
                db    6
                db    8
                db    5
                db    3
                db    4
                db    4
                db    6
                db    6
                db    6
                db    5
                db    6
                db    8
                db    7
                db    5
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    7
                db    3
                db    4
                db    6
                db    6
                db    6
                db    7
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    5
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    8
                db    7
                db    8
                db    8
                db    8
                db    8
                db    8
                db    7
                db    5
                db    3
                db    5
                db    6
                db    7
                db    7
                db    8
                db    8
                db    7
                db    8
                db    7
                db    7
                db    8
                db    8
                db    5
                db    6
                db    8
                db    5
                db    8
                db    7
                db    7
                db    8
                db    8
                db    8
                db    7
                db    6
                db    8
                db    8
                db    8
                db    7
                db    7
                db    7
                db    4
                db    8
                db    4
                db    7
                db    8
vfs_waku_grp    db    0
                db  21h ; !
aWakuGrp        db 'waku.grp',0
vfs_sei_grp     db    0
                db  1Ch
aSeiGrp         db 'sei.grp',0
vfs_yuup_grp    db    0
                db  26h ; &
aYuupGrp        db 'yuup.grp',0
vfs_seip_grp    db    0
                db  1Dh
aSeipGrp        db 'seip.grp',0
vfs_himp_grp    db    0
                db  11h
aHimpGrp        db 'himp.grp',0
vfs_new1_grp    db    0
                db  18h
aNew1Grp        db 'new1.grp',0
vfs_new2_grp    db    0
                db  19h
aNew2Grp        db 'new2.grp',0
vfs_ne80_grp    db    0
                db  15h
aNe80Grp        db 'ne80.grp',0
vfs_ne81_grp    db    0
                db  16h
aNe81Grp        db 'ne81.grp',0
vfs_end5_grp    db    1
                db  36h ; 6
aEnd5Grp        db 'end5.grp',0
vfs_end4_grp    db    1
                db  35h ; 5
aEnd4Grp        db 'end4.grp',0
vfs_end6_grp    db    1
                db  37h ; 7
aEnd6Grp        db 'end6.grp',0
vfs_end7_grp    db    1
                db  38h ; 8
aEnd7Grp        db 'end7.grp',0
vfs_en72_grp    db    1
                db  34h ; 4
aEn72Grp        db 'en72.grp',0
vfs_fin_grp     db    1
                db  39h ; 9
aFinGrp         db 'fin.grp',0
vfs_zend_msd    db    0
                db  27h ; '
aZendMsd        db 'zend.msd',0

seg000          ends

                end     start
