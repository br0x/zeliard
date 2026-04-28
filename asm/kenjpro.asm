include common.inc
include town.inc
                .286
                .model tiny

kenjpro         segment byte public 'CODE'
                assume cs:kenjpro, ds:kenjpro
                org 0A000h
start:
                dw offset loc_A027
                dw offset sub_AB47
                dw offset sub_A006

; =============== S U B R O U T I N E =======================================


sub_A006        proc near
                call    sub_A05A
                mov     word_BB12, 0E17h
                call    sub_A990
                mov     bx, 0D60h
                mov     cx, 3637h
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                mov     word ptr ds:0FF4Ch, offset byte_BA67 ; dialog_string_ptr
                jmp     short loc_A047
; ---------------------------------------------------------------------------

loc_A027:
                call    sub_A05A
                mov     word_BB12, 717h
                call    sub_A990
                mov     bx, 0D60h
                mov     cx, 3637h
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                call    sub_AC07
                mov     ds:0FF4Ch, si   ; dialog_string_ptr

loc_A047:                               ;
                call    word ptr cs:6004h ; render_menu_dialog_proc
                cmp     al, 0FFh
                jz      short loc_A055
                call    sub_A0A4
                jmp     short loc_A047
; ---------------------------------------------------------------------------

loc_A055:                               ;
                jmp     word ptr cs:2040h ; Fade_To_Black_Dithered_proc
sub_A006        endp


; =============== S U B R O U T I N E =======================================


sub_A05A        proc near
                mov     es, word ptr ds:0FF2Ch ; seg1
                mov     di, 8000h
                mov     si, offset vfs_kenjya_grp
                mov     al, 2
                call    word ptr cs:10Ch ; res_dispatcher_proc
                push    ds
                mov     ds, word ptr cs:0FF2Ch ; seg1
                mov     si, 8000h
                mov     cx, 100h
                call    word ptr cs:2044h ; Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                mov     byte ptr ds:0FF4Eh, 0 ; dialog_cursor_x
                mov     byte ptr ds:0FF4Fh, 0 ; dialog_scroll_counter
                call    word ptr cs:2002h ; Clear_Viewport_proc
                call    word ptr cs:2012h ; Clear_Place_Enemy_Bar_proc
                mov     bl, ds:0C006h   ; town_id
                dec     bl
                xor     bh, bh
                add     bx, bx
                mov     si, sage_names[bx]
                jmp     word ptr cs:2010h ; Render_Pascal_String_1_proc
sub_A05A        endp


; =============== S U B R O U T I N E =======================================


sub_A0A4        proc near

; FUNCTION CHUNK AT A0CB SIZE 00000041 BYTES
; FUNCTION CHUNK AT A178 SIZE 00000059 BYTES
; FUNCTION CHUNK AT A420 SIZE 00000007 BYTES
; FUNCTION CHUNK AT A862 SIZE 000000A5 BYTES

                mov     bl, al
                xor     bh, bh
                add     bx, bx          ; switch 14 cases
                jmp     cs:jpt_A0AA[bx] ; switch jump
sub_A0A4        endp

; ---------------------------------------------------------------------------
jpt_A0AA        dw offset loc_A0CB      ; jump table for switch statement
                dw offset loc_A18E
                dw offset sub_A914
                dw offset loc_A862
                dw offset sub_A410
                dw offset sub_A2B4
                dw offset loc_A420
                dw offset sub_A93B
                dw offset loc_A93F
                dw offset loc_A943
                dw offset loc_A947
                dw offset loc_A94B
                dw offset loc_A94F
                dw offset loc_A953
; ---------------------------------------------------------------------------
; START OF FUNCTION CHUNK FOR sub_A0A4

loc_A0CB:
                call    sub_A983
                mov     bx, 2722h
                mov     cx, 1C2Dh
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                mov     word ptr ds:0FF54h, 2725h ; menu_base_addr
                mov     byte ptr ds:0FF52h, 4 ; menu_item_count
                mov     byte ptr ds:0FF53h, 4 ; menu_max_items
                mov     cx, 4           ; number of menu items
                mov     si, offset aGoOutside ; "Go outside"
                call    word ptr cs:600Eh ; render_menu_string_list_proc
                mov     byte ptr ds:0FF56h, 0 ; menu_cursor_pos
                mov     bl, menu_item_selected
                call    word ptr cs:6010h ; select_from_menu_proc
                jnb     short loc_A108
                xor     bl, bl

loc_A108:
                mov     menu_item_selected, bl
; END OF FUNCTION CHUNK FOR sub_A0A4
                xor     bh, bh
                add     bx, bx          ; switch 4 cases
                jmp     jpt_A110[bx]    ; switch jump
; ---------------------------------------------------------------------------
jpt_A110        dw offset on_go_outside ; jump table for switch statement
                dw offset on_see_power
                dw offset on_listen_knowledge
                dw offset on_record_experience

; =============== S U B R O U T I N E =======================================

; jumptable 0000A110 case 0

on_go_outside   proc near
                call    sub_A983
                mov     word ptr ds:0FF4Ch, offset byte_ADEB ; dialog_string_ptr
                retn
on_go_outside   endp


; =============== S U B R O U T I N E =======================================

; jumptable 0000A110 case 1

on_see_power    proc near
                call    sub_A983
                test    byte_BB15, 0FFh
                jnz     short loc_A137
                mov     word ptr ds:0FF4Ch, offset byte_AE08 ; dialog_string_ptr
                retn
; ---------------------------------------------------------------------------

loc_A137:
                test    byte_BB16, 0FFh
                jnz     short loc_A150
                mov     di, offset byte_AEA7
                test    byte_BB17, 0FFh
                jz      short loc_A14B
                mov     di, offset byte_AF03

loc_A14B:                               ;
                mov     ds:0FF4Ch, di   ; dialog_string_ptr
                retn
; ---------------------------------------------------------------------------

loc_A150:                               ;
                mov     word ptr ds:0FF4Ch, offset byte_AE42 ; dialog_string_ptr
                retn
on_see_power    endp


; =============== S U B R O U T I N E =======================================

; jumptable 0000A110 case 2

on_listen_knowledge proc near
                call    sub_A983
                mov     bl, ds:0C006h   ; town_id
                dec     bl
                xor     bh, bh
                add     bx, bx
                mov     si, off_B5EB[bx]
                mov     ds:0FF4Ch, si   ; dialog_string_ptr
                call    word ptr cs:6004h ; render_menu_dialog_proc
                mov     word ptr ds:0FF4Ch, offset byte_ADBF ; dialog_string_ptr
                retn
on_listen_knowledge endp

; ---------------------------------------------------------------------------
; START OF FUNCTION CHUNK FOR sub_A0A4

on_record_experience:                   ; jumptable 0000A110 case 3
                call    sub_A983
                call    sub_A427
                mov     word ptr ds:0FF4Ch, offset byte_ADBF ; dialog_string_ptr
                jnb     short loc_A187
                retn
; ---------------------------------------------------------------------------

loc_A187:                               ;
                mov     word ptr ds:0FF4Ch, offset byte_AF7C ; dialog_string_ptr
                retn
; ---------------------------------------------------------------------------

loc_A18E:                               ; jumptable 0000A0AA case 1
                mov     byte_BB15, 0FFh
                call    sub_A1D1
                call    sub_A410
                mov     byte_BB18, 0FFh
                mov     byte_BB19, 0FFh
                mov     word ptr ds:0FF4Ch, offset unk_AFDE ; dialog_string_ptr

loc_A1A9:
                call    sub_A410
                call    word ptr cs:6004h ; render_menu_dialog_proc
                cmp     al, 4
                jz      short loc_A1A9
                mov     byte_BB1A, 0FFh
                call    sub_A200
                call    word ptr cs:6004h ; render_menu_dialog_proc
                call    sub_A22E
                add     ax, ax
                mov     bx, ax
                mov     ax, off_B029[bx] ; "Your experience is lacking. Persevere i"...
                mov     ds:0FF4Ch, ax   ; dialog_string_ptr
                retn
; END OF FUNCTION CHUNK FOR sub_A0A4

; =============== S U B R O U T I N E =======================================


sub_A1D1        proc near
                mov     si, offset byte_A1FD
                mov     byte_BB19, 0FFh
                mov     byte_BB1B, 0FFh
                mov     cx, 3

loc_A1E1:
                push    cx
                mov     byte ptr ds:0FF1Ah, 0 ; frame_timer
                lodsb
                push    si
                call    sub_AA16

loc_A1EC:                               ;
                cmp     byte ptr ds:0FF1Ah, 25 ; frame_timer
                jb      short loc_A1EC
                pop     si
                pop     cx
                loop    loc_A1E1
                mov     byte_BB19, 0
                retn
sub_A1D1        endp

; ---------------------------------------------------------------------------
byte_A1FD       db 0
byte_A1FE       db 1
                db 2

; =============== S U B R O U T I N E =======================================


sub_A200        proc near
                mov     si, offset byte_A1FE
                mov     byte_BB19, 0FFh
                mov     cx, 2

loc_A20B:
                push    cx
                mov     byte ptr ds:0FF1Ah, 0 ; frame_timer
                mov     al, [si]
                dec     si
                push    si
                call    sub_AA16

loc_A218:                               ;
                cmp     byte ptr ds:0FF1Ah, 25 ; frame_timer
                jb      short loc_A218
                pop     si
                pop     cx
                loop    loc_A20B
                mov     byte_BB19, 0
                mov     byte_BB1B, 0
                retn
sub_A200        endp


; =============== S U B R O U T I N E =======================================


sub_A22E        proc near
                xor     bx, bx
                mov     bl, ds:8Dh      ; hero_level
                cmp     bl, 0Fh
                jb      short loc_A23B
                mov     bl, 0Fh

loc_A23B:
                add     bx, bx
                add     bx, offset word_A28C
                mov     dx, [bx]
                mov     cx, dx
                xor     ax, ax
                shr     cx, 1
                cmp     ds:8Eh, cx      ; hero_xp
                jnb     short loc_A250
                retn
; ---------------------------------------------------------------------------

loc_A250:
                mov     ax, dx
                shr     cx, 1
                sub     ax, cx
                mov     cx, ax
                mov     ax, 1
                cmp     ds:8Eh, cx      ; hero_xp
                jnb     short loc_A262
                retn
; ---------------------------------------------------------------------------

loc_A262:
                mov     ax, 2
                cmp     ds:8Eh, dx      ; hero_xp
                jnb     short loc_A26C
                retn
; ---------------------------------------------------------------------------

loc_A26C:
                xor     bx, bx
                mov     bl, ds:0C006h   ; town_id
                dec     bx
                add     bx, offset byte_A2AC
                mov     ax, 3
                mov     cl, ds:8Dh      ; hero_level
                cmp     cl, [bx]
                jnb     short loc_A283
                retn
; ---------------------------------------------------------------------------

loc_A283:
                mov     byte_BB17, 0FFh
                mov     ax, 4
                retn
sub_A22E        endp

; ---------------------------------------------------------------------------
word_A28C       dw 32h, 96h, 12Ch, 1A4h, 3E8h, 5DCh, 0BB8h, 1388h, 1770h
                dw 1F40h, 2710h, 3A98h, 4E20h, 9C40h, 0C350h, 0EA60h
byte_A2AC       db 3, 6, 9, 0Bh, 0Dh, 0Fh, 12h, 0FFh

; =============== S U B R O U T I N E =======================================


sub_A2B4        proc near
                mov     byte_BB16, 0FFh
                mov     cx, 8

loc_A2BC:
                push    cx
                call    word ptr cs:3000h ; apply_screen_xor_grid_proc
                mov     byte ptr ds:0FF1Ah, 0 ; frame_timer

loc_A2C7:                               ;
                cmp     byte ptr ds:0FF1Ah, 10 ; frame_timer
                jb      short loc_A2C7
                pop     cx
                loop    loc_A2BC
                push    cs
                pop     es
                assume es:nothing
                mov     al, ds:8Dh      ; hero_level
                cmp     al, 10h
                jb      short loc_A2F5
                mov     word_BB34, 320h
                mov     cx, 7
                mov     si, 0B4h        ; espada_count
                mov     di, offset byte_BB36

loc_A2E9:
                lodsb
                add     al, 2
                jnb     short loc_A2F0
                mov     al, 0FFh

loc_A2F0:
                stosb
                loop    loc_A2E9
                jmp     short loc_A306
; ---------------------------------------------------------------------------

loc_A2F5:
                mov     bl, 9
                mul     bl
                mov     si, offset byte_A380
                add     si, ax
                mov     di, offset word_BB34
                mov     cx, 9
                rep movsb

loc_A306:                               ;
                mov     al, ds:8Dh      ; hero_level
                inc     al
                jnz     short loc_A30F
                mov     al, 0FFh

loc_A30F:                               ;
                mov     ds:8Dh, al      ; hero_level
                mov     ax, word_BB34
                mov     ds:0B2h, ax     ; heroMaxHp
                mov     ds:90h, ax      ; hero_HP
                call    word ptr cs:2006h ; Draw_Hero_Max_Health_proc
                call    word ptr cs:2008h ; Draw_Hero_Health_proc
                push    cs
                pop     es
                mov     di, 0B4h        ; espada_count
                mov     si, offset byte_BB36
                mov     cx, 7
                rep movsb
                mov     di, 0ABh        ; spells_espada
                mov     si, offset byte_BB36
                mov     cx, 7
                rep movsb
                test    byte ptr ds:9Dh, 0FFh ; current_magic_spell
                jz      short loc_A349
                call    word ptr cs:2018h ; Print_Magic_Left_Decimal_proc

loc_A349:
                xor     bx, bx
                mov     bl, ds:8Dh      ; hero_level
                dec     bl
                cmp     bl, 0Fh
                jb      short loc_A358
                mov     bl, 0Fh

loc_A358:
                add     bx, bx
                mov     ax, word_A28C[bx]
                sub     ds:8Eh, ax      ; hero_xp
                xor     bx, bx
                mov     bl, ds:8Dh      ; hero_level
                cmp     bl, 0Fh
                jb      short loc_A36F
                mov     bl, 0Fh

loc_A36F:
                add     bx, bx
                mov     ax, word_A28C[bx]
                cmp     ds:8Eh, ax      ; hero_xp
                jb      short locret_A37F
                dec     ax
                mov     ds:8Eh, ax      ; hero_xp

locret_A37F:
                retn
sub_A2B4        endp

; ---------------------------------------------------------------------------
byte_A380       db 78h, 0, 0Ch, 6, 8, 8, 3, 4, 3
                db 0A0h, 0, 0Ch, 6, 8, 8, 3, 4, 3
                db 0C8h, 0, 0Ch, 6, 8, 8, 3, 4, 3
                db 0F0h, 0, 0Ch, 6, 8, 8, 3, 4, 3
                db 18h, 1, 10h, 6, 8, 8, 3, 4, 3
                db 40h, 1, 14h, 6, 8, 8, 3, 4, 3
                db 7Ch, 1, 18h, 6, 8, 8, 3, 4, 3
                db 0CCh, 1, 1Ch, 0Ch, 8, 8, 3, 4, 3
                db 1Ch, 2, 20h, 12h, 0Ch, 8, 3, 4, 3
                db 58h, 2, 24h, 18h, 10h, 8, 3, 4, 3
                db 80h, 2, 28h, 1Eh, 14h, 10h, 3, 4, 3
                db 0A8h, 2, 2Ch, 24h, 18h, 18h, 3, 4, 3
                db 0D0h, 2, 30h, 2Ah, 1Ch, 20h, 3, 4, 3
                db 0F8h, 2, 34h, 30h, 24h, 30h, 9, 8, 6
                db 0Ch, 3, 38h, 36h, 2Ch, 36h, 0Fh, 0Ch, 9
                db 20h, 3, 3Ch, 3Ch, 3Ch, 48h, 15h, 10h, 0Ch

; =============== S U B R O U T I N E =======================================


sub_A410        proc near
                mov     byte ptr ds:0FF1Ah, 0 ; frame_timer

loc_A415:
                call    sub_AB47
                cmp     byte ptr ds:0FF1Ah, 140 ; frame_timer
                jb      short loc_A415
                retn
sub_A410        endp

; ---------------------------------------------------------------------------
; START OF FUNCTION CHUNK FOR sub_A0A4

loc_A420:                               ;
                mov     word ptr ds:0FF4Ch, offset byte_ADBF ; dialog_string_ptr
                retn
; END OF FUNCTION CHUNK FOR sub_A0A4

; =============== S U B R O U T I N E =======================================


sub_A427        proc near
                push    cs
                pop     es
                mov     si, offset vfs_stdply_bin
                mov     al, 6
                call    word ptr cs:10Ch ; res_dispatcher_proc
                mov     ax, cs
                mov     es, ax
                mov     ds, ax
                assume ds:nothing
                mov     di, 0E000h
                mov     dx, 0A516h
                call    word ptr cs:11Ch ; Scan_Saved_Games_proc
                mov     bx, 0D60h
                mov     cx, 3637h
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                mov     bx, 0D60h
                mov     cx, 2637h
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                push    cs
                pop     es
                mov     di, offset byte_BB27
                mov     al, 60h ; '`'
                mov     cx, 8
                rep stosb
                mov     al, 0FFh
                stosb
                mov     ds:byte_BB25, 0
                mov     si, 0FF6Ch      ; save_name
                mov     di, offset byte_BB27
                mov     cx, 8

loc_A47B:
                lodsb
                or      al, al
                jz      short loc_A487
                inc     ds:byte_BB25
                stosb
                loop    loc_A47B

loc_A487:
                mov     al, ds:byte_BB25
                mov     ds:byte_BB26, al
                mov     bx, 3Ch ; '<'
                mov     cl, 6Ch ; 'l'
                mov     si, offset aInputName ; "Input name:"
                call    word ptr cs:202Ah ; Render_String_FF_Terminated_proc
                mov     ds:word_BB21, 60h ; '`'
                mov     ds:byte_BB23, 7Eh ; '~'
                mov     word ptr ds:0FF54h, 3463h ; menu_base_addr
                mov     word ptr ds:0FF6Ah, 0Ah ; string_width_bytes
                mov     al, ds:0E000h
                cmp     al, 5
                jb      short loc_A4BA
                mov     al, 5

loc_A4BA:
                xor     ah, ah
                mov     cx, ax
                xor     al, al
                mov     si, 0E001h
                jcxz    short loc_A4C8
                call    sub_A528

loc_A4C8:
                mov     si, 0E001h
                mov     al, ds:0E000h
                mov     ds:0FF53h, al   ; menu_max_items
                mov     byte ptr ds:0FF52h, 5 ; menu_item_count
                call    sub_A559
                pushf
                mov     bx, 0D60h
                mov     cx, 3637h
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                popf
                jnb     short loc_A4EB
                retn
; ---------------------------------------------------------------------------

loc_A4EB:
                push    cs
                pop     es
                mov     di, 0FF6Ch      ; save_name
                mov     cx, 8
                xor     al, al
                rep stosb
                cmp     ds:byte_BB26, 0
                stc
                jnz     short loc_A500
                retn
; ---------------------------------------------------------------------------

loc_A500:
                mov     si, offset byte_BB27
                mov     di, 0FF6Ch      ; save_name

loc_A506:
                lodsb
                cmp     al, 0FFh
                clc
                jnz     short loc_A50D
                retn
; ---------------------------------------------------------------------------

loc_A50D:
                cmp     al, 60h ; '`'
                clc
                jnz     short loc_A513
                retn
; ---------------------------------------------------------------------------

loc_A513:
                stosb
                jmp     short loc_A506
sub_A427        endp

; ---------------------------------------------------------------------------
aUsr            db '*.usr',0
aInputName      db 'Input name:'
                db 0FFh

; =============== S U B R O U T I N E =======================================


sub_A528        proc near
                xor     ah, ah

loc_A52A:
                push    cx
                push    si
                push    ax
                call    word ptr cs:301Ah ; format_string_to_buffer_proc
                pop     ax
                push    ax
                mov     al, ah
                xor     ah, ah
                add     ax, ax
                mov     bx, ax
                add     ax, ax
                add     ax, ax
                add     bx, ax
                add     bx, ds:0FF54h   ; menu_base_addr
                add     bx, 300h
                call    word ptr cs:301Ch ; draw_string_buffer_to_screen_proc
                pop     ax
                inc     al
                inc     ah
                pop     si
                pop     cx
                loop    loc_A52A
                retn
sub_A528        endp ; sp-analysis failed


; =============== S U B R O U T I N E =======================================


sub_A559        proc near

; FUNCTION CHUNK AT A827 SIZE 0000003B BYTES

                mov     byte ptr ds:0FF74h, 0FFh ; keyboard_alt_mode_flag
                mov     byte ptr ds:0FF29h, 0 ; Current_ASCII_Char
                mov     byte ptr ds:0FF29h, 0 ; Current_ASCII_Char
                mov     byte ptr ds:0FF1Dh, 0 ; spacebar_latch
                mov     byte ptr ds:0FF1Eh, 0 ; altkey_latch
                mov     byte ptr ds:0FF56h, 0 ; menu_cursor_pos
                mov     ds:byte_BB24, 0
                xor     bl, bl
                test    byte ptr ds:0FF53h, 0FFh ; menu_max_items
                jz      short loc_A58A
                call    word ptr cs:6014h ; houseCursorShow_proc

loc_A58A:
                call    sub_A7FD
                xor     al, al
                call    sub_A790

loc_A592:                               ;
                call    word ptr cs:6016h ; npcAnimation_proc
                mov     byte ptr ds:0FF1Ah, 0 ; frame_timer
                test    byte ptr ds:0FF1Eh, 0FFh ; altkey_latch
                stc
                jnz     short loc_A5AE
                test    word ptr cs:0FF18h, 1 ; F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter
                jz      short loc_A5B9
                clc

loc_A5AE:                               ;
                mov     byte ptr ds:0FF74h, 0 ; keyboard_alt_mode_flag
                mov     byte ptr ds:0FF1Eh, 0 ; altkey_latch
                retn
; ---------------------------------------------------------------------------

loc_A5B9:                               ;
                test    byte ptr ds:0FF1Dh, 0FFh ; spacebar_latch
                jz      short loc_A623
                push    si
                xor     bh, bh
                mov     bl, ds:0FF56h   ; menu_cursor_pos
                add     bl, ds:byte_BB24
                add     bx, bx
                mov     si, [bx+si]
                push    cs
                pop     es
                mov     di, offset byte_BB27
                mov     al, 60h ; '`'
                mov     cx, 8
                rep stosb
                mov     al, 0FFh
                stosb
                mov     ds:byte_BB25, 0
                mov     di, offset byte_BB27
                mov     cx, 8

loc_A5E9:
                lodsb
                or      al, al
                jz      short loc_A5F5
                inc     ds:byte_BB25
                stosb
                loop    loc_A5E9

loc_A5F5:
                mov     al, ds:byte_BB25
                mov     ds:byte_BB26, al
                pop     si
                mov     byte ptr ds:0FF1Dh, 0 ; spacebar_latch
                mov     ax, ds:word_BB21
                shr     ax, 1
                shr     ax, 1
                mov     bh, al
                mov     bl, ds:byte_BB23
                mov     cx, 1010h
                xor     al, al
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                call    sub_A7FD
                xor     al, al
                call    sub_A790
                jmp     loc_A592
; ---------------------------------------------------------------------------

loc_A623:
                mov     cx, offset loc_A592
                push    cx
                test    byte ptr ds:0FF29h, 0FFh ; Current_ASCII_Char
                jz      short loc_A65F
                mov     al, ds:0FF29h   ; Current_ASCII_Char
                mov     byte ptr ds:0FF29h, 0 ; Current_ASCII_Char
                cmp     al, 0Dh
                jnz     short loc_A63B
                retn
; ---------------------------------------------------------------------------

loc_A63B:
                cmp     al, 8
                jnz     short loc_A642
                jmp     loc_A827
; ---------------------------------------------------------------------------

loc_A642:
                xor     bx, bx
                mov     bl, ds:byte_BB25
                cmp     ds:byte_BB27[bx], 60h ; '`'
                jnz     short loc_A653
                inc     ds:byte_BB26

loc_A653:
                mov     ds:byte_BB27[bx], al
                call    sub_A7FD
                mov     al, 1
                jmp     sub_A790
; ---------------------------------------------------------------------------

loc_A65F:                               ;
                int     61h             ; check input keys buffer
                                        ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                test    al, 8
                jz      short loc_A676
                mov     al, 1
                call    sub_A790

loc_A66A:                               ;
                int     61h             ; check input keys buffer
                                        ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                test    al, 8
                jnz     short loc_A66A
                mov     byte ptr ds:0FF29h, 0 ; Current_ASCII_Char
                retn
; ---------------------------------------------------------------------------

loc_A676:
                test    al, 4
                jz      short loc_A68B
                mov     al, 0FFh
                call    sub_A790

loc_A67F:                               ;
                int     61h             ; check input keys buffer
                                        ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                test    al, 4
                jnz     short loc_A67F
                mov     byte ptr ds:0FF29h, 0 ; Current_ASCII_Char
                retn
; ---------------------------------------------------------------------------

loc_A68B:                               ;
                test    byte ptr ds:0FF53h, 0FFh ; menu_max_items
                jnz     short loc_A693
                retn
; ---------------------------------------------------------------------------

loc_A693:
                and     al, 3
                cmp     al, 1
                jnz     short loc_A709
                test    ds:byte_BB24, 0FFh
                jz      short loc_A6AE
                mov     bl, ds:byte_BB24
                call    word ptr cs:6018h ; houseCursorUp_proc
                dec     ds:byte_BB24
                retn
; ---------------------------------------------------------------------------

loc_A6AE:                               ;
                test    byte ptr ds:0FF56h, 0FFh ; menu_cursor_pos
                jnz     short loc_A6B6
                retn
; ---------------------------------------------------------------------------

loc_A6B6:
                push    di
                push    si
                dec     byte ptr ds:0FF56h ; menu_cursor_pos
                mov     al, ds:0FF56h   ; menu_cursor_pos
                add     al, ds:byte_BB24
                call    word ptr cs:301Ah ; format_string_to_buffer_proc
                mov     cx, 0Ah

loc_A6CB:
                push    cx
                mov     bx, ds:0FF54h   ; menu_base_addr
                add     bx, 301h
                mov     al, cl
                dec     al
                mov     cl, ds:0FF52h   ; menu_item_count
                add     cl, cl
                mov     dl, cl
                add     cl, cl
                add     cl, cl
                add     cl, dl
                sub     cl, 2
                mov     ch, ds:0FF6Ah   ; string_width_bytes
                call    word ptr cs:301Eh ; scroll_hud_up_proc

loc_A6F2:                               ;
                call    word ptr cs:6016h ; npcAnimation_proc
                cmp     byte ptr ds:0FF1Ah, 4 ; frame_timer
                jb      short loc_A6F2
                mov     byte ptr ds:0FF1Ah, 0 ; frame_timer
                pop     cx
                loop    loc_A6CB
                pop     si
                pop     di
                retn
; ---------------------------------------------------------------------------

loc_A709:
                cmp     al, 2
                jz      short loc_A70E
                retn
; ---------------------------------------------------------------------------

loc_A70E:
                mov     al, ds:byte_BB24
                add     al, ds:0FF56h   ; menu_cursor_pos
                inc     al
                mov     ah, ds:0FF53h   ; menu_max_items
                dec     ah
                cmp     ah, al
                jnb     short loc_A722
                retn
; ---------------------------------------------------------------------------

loc_A722:                               ;
                mov     al, ds:0FF52h   ; menu_item_count
                dec     al
                cmp     ds:byte_BB24, al
                jnb     short loc_A73B
                mov     bl, ds:byte_BB24
                call    word ptr cs:601Ah ; houseCursorDown_proc
                inc     ds:byte_BB24
                retn
; ---------------------------------------------------------------------------

loc_A73B:
                push    di
                push    si
                inc     byte ptr ds:0FF56h ; menu_cursor_pos
                mov     al, ds:0FF56h   ; menu_cursor_pos
                add     al, ds:byte_BB24
                call    word ptr cs:301Ah ; format_string_to_buffer_proc
                mov     cx, 0Ah

loc_A750:
                push    cx
                mov     bx, ds:0FF54h   ; menu_base_addr
                add     bx, 301h
                mov     al, cl
                neg     al
                add     al, 0Ah
                mov     cl, ds:0FF52h   ; menu_item_count
                add     cl, cl
                mov     dl, cl
                add     cl, cl
                add     cl, cl
                add     cl, dl
                sub     cl, 2
                mov     ch, ds:0FF6Ah   ; string_width_bytes
                call    word ptr cs:3020h ; scroll_hud_down_proc

loc_A779:                               ;
                call    word ptr cs:6016h ; npcAnimation_proc
                cmp     byte ptr ds:0FF1Ah, 4 ; frame_timer
                jb      short loc_A779
                mov     byte ptr ds:0FF1Ah, 0 ; frame_timer
                pop     cx
                loop    loc_A750
                pop     si
                pop     di
                retn
sub_A559        endp ; sp-analysis failed


; =============== S U B R O U T I N E =======================================


sub_A790        proc near
                push    si
                push    ax
                mov     ax, ds:word_BB21
                shr     ax, 1
                shr     ax, 1
                mov     bh, al
                mov     al, ds:byte_BB25
                add     al, al
                add     bh, al
                mov     bl, ds:byte_BB23
                add     bl, 8
                mov     cx, 208h
                xor     al, al
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                pop     ax
                add     ds:byte_BB25, al
                test    ds:byte_BB25, 80h
                jz      short loc_A7C4
                mov     ds:byte_BB25, 0

loc_A7C4:
                cmp     ds:byte_BB25, 8
                jb      short loc_A7CF
                dec     ds:byte_BB25

loc_A7CF:
                mov     al, ds:byte_BB26
                cmp     ds:byte_BB25, al
                jb      short loc_A7DB
                mov     ds:byte_BB25, al

loc_A7DB:
                mov     bx, ds:word_BB21
                mov     cl, ds:byte_BB23
                xor     ax, ax
                mov     al, ds:byte_BB25
                add     ax, ax
                add     ax, ax
                add     ax, ax
                add     bx, ax
                add     cl, 8
                mov     ax, 67Fh
                call    word ptr cs:2022h ; Render_Font_Glyph_proc
                pop     si
                retn
sub_A790        endp


; =============== S U B R O U T I N E =======================================


sub_A7FD        proc near
                push    si
                mov     ax, ds:word_BB21
                shr     ax, 1
                shr     ax, 1
                mov     bh, al
                mov     bl, ds:byte_BB23
                mov     cx, 1008h
                xor     al, al
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                mov     bx, ds:word_BB21
                mov     cl, ds:byte_BB23
                mov     si, offset byte_BB27
                call    word ptr cs:202Ah ; Render_String_FF_Terminated_proc
                pop     si
                retn
sub_A7FD        endp

; ---------------------------------------------------------------------------
; START OF FUNCTION CHUNK FOR sub_A559

loc_A827:
                push    si
                mov     bl, ds:byte_BB25
                or      bl, bl
                jnz     short loc_A832
                inc     bl

loc_A832:
                xor     bh, bh
                push    cs
                pop     es
                mov     si, offset byte_BB27
                add     si, bx
                mov     di, si
                dec     di
                mov     al, 8
                sub     al, bl
                mov     cl, al
                xor     ch, ch
                rep movsb
                test    ds:byte_BB26, 0FFh
                jz      short loc_A853
                dec     ds:byte_BB26

loc_A853:
                mov     ds:byte_BB2E, 60h ; '`'
                mov     al, 0FFh
                call    sub_A790
                call    sub_A7FD
                pop     si
                retn
; END OF FUNCTION CHUNK FOR sub_A559
; ---------------------------------------------------------------------------
; START OF FUNCTION CHUNK FOR sub_A0A4

loc_A862:                               ; jumptable 0000A0AA case 3
                push    cs
                pop     es
                mov     si, 0FF6Ch      ; save_name
                mov     di, offset byte_BB27
                mov     cx, 8

loc_A86D:
                lodsb
                or      al, al
                jz      short loc_A875
                stosb
                loop    loc_A86D

loc_A875:
                mov     byte ptr es:[di], 2Eh ; '.'
                mov     byte ptr es:[di+1], 75h ; 'u'
                mov     byte ptr es:[di+2], 73h ; 's'
                mov     byte ptr es:[di+3], 72h ; 'r'
                mov     byte ptr es:[di+4], 0
                mov     dx, offset byte_BB27
                mov     cx, 0
                mov     ah, 3Ch
                int     21h             ; DOS - 2+ - CREATE A FILE WITH HANDLE (CREAT)
                                        ; CX = attributes for file
                                        ; DS:DX -> ASCIZ filename (may include drive and path)
                jb      short loc_A8B2
                push    ax
                mov     dx, 0
                mov     cx, 100h
                mov     bx, ax
                mov     ah, 40h
                int     21h             ; DOS - 2+ - WRITE TO FILE WITH HANDLE
                                        ; BX = file handle, CX = number of bytes to write, DS:DX -> buffer
                pop     ax
                pushf
                mov     bx, ax
                mov     ah, 3Eh
                int     21h             ; DOS - 2+ - CLOSE A FILE WITH HANDLE
                                        ; BX = file handle
                popf
                jb      short loc_A8B2
                retn
; ---------------------------------------------------------------------------

loc_A8B2:
                mov     ax, 849h
                mov     cx, 1926h
                xor     di, di
                call    word ptr cs:2026h ; Capture_Screen_Rect_to_seg3_proc
                mov     bx, 1049h
                mov     cx, 3226h
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                mov     bx, 4Ch ; 'L'
                mov     cl, 50h ; 'P'
                mov     si, offset aDiskErrorPleas ; "      Disk error.\rPlease check your di"...
                call    word ptr cs:202Ah ; Render_String_FF_Terminated_proc
                mov     byte ptr ds:0FF1Dh, 0 ; spacebar_latch

loc_A8DE:                               ;
                test    byte ptr ds:0FF1Dh, 0FFh ; spacebar_latch
                jz      short loc_A8DE
                mov     byte ptr ds:0FF1Dh, 0 ; spacebar_latch
                mov     ax, 849h
                mov     cx, 1926h
                xor     di, di
                call    word ptr cs:2028h ; Put_Image_proc
                mov     bx, 0D60h
                mov     cx, 3637h
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                jmp     on_record_experience ; jumptable 0000A110 case 3
; END OF FUNCTION CHUNK FOR sub_A0A4
; ---------------------------------------------------------------------------
vfs_stdply_bin  db    0
                db    0
aStdplyBin      db 'STDPLY.BIN',0

; =============== S U B R O U T I N E =======================================


sub_A914        proc near
                mov     bx, 2F2Bh
                mov     cx, 0C19h
                mov     al, 0FFh
                call    word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
                mov     word ptr ds:0FF54h, 302Eh ; menu_base_addr
                call    word ptr cs:6008h ; show_yes_no_dialog_proc
                pushf
                call    sub_A983
                popf
                jb      short loc_A934
                retn
; ---------------------------------------------------------------------------

loc_A934:
                xor     ax, ax
                jmp     dword ptr cs:0FF00h ; fn_exit_far_ptr
sub_A914        endp


; =============== S U B R O U T I N E =======================================


sub_A93B        proc near
                mov     al, 1
                jmp     short loc_A957
; ---------------------------------------------------------------------------

loc_A93F:
                mov     al, 2
                jmp     short loc_A957
; ---------------------------------------------------------------------------

loc_A943:
                mov     al, 3
                jmp     short loc_A957
; ---------------------------------------------------------------------------

loc_A947:
                mov     al, 4
                jmp     short loc_A957
; ---------------------------------------------------------------------------

loc_A94B:
                mov     al, 5
                jmp     short loc_A957
; ---------------------------------------------------------------------------

loc_A94F:
                mov     al, 6
                jmp     short loc_A957
; ---------------------------------------------------------------------------

loc_A953:
                mov     al, 7
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_A957:
                push    ax
                mov     bx, 0AA1Ch
                xor     al, al
                mov     ch, 17h
                call    word ptr cs:2004h ; Clear_HUD_Bar_proc
                pop     ax
                mov     ds:9Dh, al      ; current_magic_spell
                mov     bl, al
                dec     bl
                xor     bh, bh
                mov     byte ptr [bx+0BBh], 0FFh ; espada_active
                mov     al, ds:9Dh      ; current_magic_spell
                mov     bx, 37A4h
                call    word ptr cs:201Eh ; Render_Magic_Spell_Item_Sprite_16x16_proc
                jmp     word ptr cs:2018h ; Print_Magic_Left_Decimal_proc
sub_A93B        endp


; =============== S U B R O U T I N E =======================================


sub_A983        proc near
                mov     bx, 2717h
                mov     cx, 1D41h
                xor     al, al
                jmp     word ptr cs:2000h ; Draw_Bordered_Rectangle_proc
sub_A983        endp


; =============== S U B R O U T I N E =======================================


sub_A990        proc near
                mov     si, offset byte_A9B6
                mov     bx, ds:word_BB12
                mov     cx, 8

loc_A99A:
                push    cx
                mov     cx, 0Ch

loc_A99E:
                push    cx
                push    bx
                lodsb
                call    word ptr cs:3016h ; draw_tile_to_screen_proc
                pop     bx
                inc     bh
                pop     cx
                loop    loc_A99E
                sub     bh, 0Ch
                add     bl, 8
                pop     cx
                loop    loc_A99A
                retn
sub_A990        endp

; ---------------------------------------------------------------------------
byte_A9B6       db 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0Ah, 0Bh
                db 0Ch, 0Dh, 0Eh, 0Fh, 10h, 11h, 12h, 13h, 14h, 15h, 16h, 17h
                db 18h, 19h, 1Ah, 1Bh, 1Ch, 1Dh, 1Eh, 1Fh, 1Bh, 20h, 21h, 22h
                db 23h, 24h, 25h, 1Bh, 26h, 27h, 28h, 29h, 1Bh, 2Bh, 2Ch, 2Dh
                db 2Eh, 2Fh, 30h, 31h, 32h, 33h, 34h, 35h, 36h, 37h, 38h, 39h
                db 3Ah, 3Bh, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 43h, 44h, 45h
                db 46h, 47h, 48h, 49h, 4Ah, 4Bh, 4Ch, 4Dh, 4Eh, 4Fh, 50h, 51h
                db 52h, 53h, 54h, 55h, 56h, 57h, 58h, 59h, 5Ah, 5Bh, 5Ch, 5Dh

; =============== S U B R O U T I N E =======================================


sub_AA16        proc near
                mov     cl, 32
                mul     cl
                mov     bx, ds:word_BB12
                add     bx, 210h
                mov     si, ax
                add     si, offset byte_AA47
                mov     cx, 4

loc_AA2B:
                push    cx
                mov     cx, 8

loc_AA2F:
                push    cx
                push    bx
                lodsb
                call    word ptr cs:3016h ; draw_tile_to_screen_proc
                pop     bx
                inc     bh
                pop     cx
                loop    loc_AA2F
                sub     bh, 8
                add     bl, 8
                pop     cx
                loop    loc_AA2B
                retn
sub_AA16        endp

; ---------------------------------------------------------------------------
byte_AA47       db 1Ah, 1Bh, 1Ch, 1Dh, 1Eh, 1Fh, 1Bh, 20h, 25h, 1Bh, 26h, 27h, 28h, 29h, 1Bh, 2Bh
                db 30h, 31h, 32h, 33h, 34h, 35h, 36h, 37h, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 43h
                db 1Ah, 1Bh, 1Ch, 1Dh, 1Eh, 1Fh, 1Bh, 20h, 25h, 1Bh, 71h, 27h, 28h, 74h, 1Bh, 2Bh
                db 30h, 31h, 75h, 33h, 34h, 76h, 36h, 37h, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 43h
                db 5Eh, 5Fh, 1Ch, 1Dh, 1Eh, 1Fh, 60h, 61h, 62h, 63h, 64h, 65h, 66h, 67h, 69h, 6Ah
                db 30h, 6Bh, 6Ch, 6Dh, 6Eh, 6Fh, 70h, 37h, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 43h
                db 1Ah, 1Bh, 1Ch, 1Dh, 1Eh, 77h, 78h, 20h, 25h, 1Bh, 79h, 65h, 7Ah, 72h, 73h, 2Bh
                db 30h, 7Bh, 7Ch, 7Dh, 7Eh, 7Fh, 36h, 37h, 3Ch, 80h, 81h, 3Fh, 40h, 41h, 42h, 43h
                db 1Ah, 1Bh, 1Ch, 1Dh, 1Eh, 1Fh, 1Bh, 20h, 25h, 82h, 83h, 65h, 7Ah, 84h, 85h, 2Bh
                db 30h, 86h, 87h, 7Dh, 88h, 89h, 36h, 37h, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 43h
                db 1Ah, 1Bh, 1Ch, 1Dh, 1Eh, 1Fh, 1Bh, 20h, 25h, 8Ah, 8Bh, 65h, 66h, 8Ch, 8Dh, 2Bh
                db 30h, 8Eh, 8Fh, 7Dh, 90h, 91h, 92h, 37h, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 43h
                db 1Ah, 1Bh, 1Ch, 1Dh, 1Eh, 1Fh, 1Bh, 20h, 25h, 93h, 94h, 65h, 95h, 96h, 97h, 2Bh
                db 30h, 31h, 98h, 7Dh, 88h, 99h, 9Ah, 37h, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 43h
                db 1Ah, 9Bh, 9Ch, 1Dh, 1Eh, 1Fh, 1Bh, 20h, 25h, 9Dh, 9Eh, 65h, 95h, 9Fh, 1Bh, 2Bh
                db 30h, 0A0h, 0A1h, 7Dh, 6Eh, 0A2h, 0A3h, 37h, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 0A4h, 0A5h, 43h

; =============== S U B R O U T I N E =======================================


sub_AB47        proc near
                cmp     word ptr ds:0FF50h, 2 ; byte_FF50
                jnb     short loc_AB4F
                retn
; ---------------------------------------------------------------------------

loc_AB4F:                               ;
                mov     word ptr ds:0FF50h, 0 ; byte_FF50
                test    ds:byte_BB18, 0FFh
                jz      short loc_ABB9
                test    ds:byte_BB1A, 0FFh
                jz      short loc_AB89
                inc     ds:byte_BB1C
                and     ds:byte_BB1C, 0Fh
                cmp     ds:byte_BB1C, 1
                jnz     short loc_ABB9
                mov     ds:byte_BB18, 0
                mov     ds:byte_BB1A, 0
                mov     ds:byte_BB1C, 0
                mov     ds:byte_BB1D, 0
                jmp     short loc_ABB9
; ---------------------------------------------------------------------------

loc_AB89:
                inc     ds:byte_BB20
                cmp     ds:byte_BB20, 20
                jnb     short loc_AB95
                retn
; ---------------------------------------------------------------------------

loc_AB95:
                mov     ds:byte_BB20, 0
                inc     ds:byte_BB1D
                mov     bl, ds:byte_BB1D
                dec     bl
                and     bl, 7
                xor     bh, bh
                mov     al, ds:byte_ABFF[bx]
                call    sub_AA16
                inc     ds:byte_BB1C
                and     ds:byte_BB1C, 0Fh

loc_ABB9:
                test    ds:byte_BB19, 0FFh
                jz      short loc_ABC1
                retn
; ---------------------------------------------------------------------------

loc_ABC1:
                inc     ds:byte_BB1F
                cmp     ds:byte_BB1F, 20
                jnb     short loc_ABCD
                retn
; ---------------------------------------------------------------------------

loc_ABCD:
                mov     ds:byte_BB1F, 0
                mov     bl, ds:byte_BB1E
                not     ds:byte_BB1E
                and     bl, 1
                xor     bh, bh
                mov     di, offset byte_ABFB
                test    ds:byte_BB1B, 0FFh
                jz      short loc_ABEC
                mov     di, offset byte_ABFD

loc_ABEC:
                mov     al, [bx+di]
                mov     bx, ds:word_BB12
                add     bx, 718h
                jmp     word ptr cs:3016h ; draw_tile_to_screen_proc
sub_AB47        endp

; ---------------------------------------------------------------------------
byte_ABFB       db 29h, 2Ah
byte_ABFD       db 67h, 68h
byte_ABFF       db 5, 6, 7, 6, 5, 4, 3, 4

; =============== S U B R O U T I N E =======================================


sub_AC07        proc near

; FUNCTION CHUNK AT AC28 SIZE 00000088 BYTES

                mov     si, offset byte_AD9D
                mov     bl, ds:0C006h   ; town_id
                dec     bl
                xor     bh, bh
                add     bx, bx          ; switch 8 cases
                jmp     ds:jpt_AC14[bx] ; switch jump
sub_AC07        endp

; ---------------------------------------------------------------------------
jpt_AC14        dw offset loc_AC28      ; jump table for switch statement
                dw offset loc_AC39
                dw offset loc_AC4A
                dw offset loc_AC5B
                dw offset loc_AC6C
                dw offset loc_AC7D
                dw offset loc_AC8E
                dw offset loc_AC9F
; ---------------------------------------------------------------------------
; START OF FUNCTION CHUNK FOR sub_AC07

loc_AC28:                               ;
                test    byte ptr ds:0E5h, 80h ; sages_spoken_to_hero
                jz      short loc_AC30
                retn
; ---------------------------------------------------------------------------

loc_AC30:
                mov     si, offset aIAmTheSageMari ; "I am the Sage Marid./You are very brave"...
                or      byte ptr ds:0E5h, 80h ; sages_spoken_to_hero
                retn
; ---------------------------------------------------------------------------

loc_AC39:                               ;
                test    byte ptr ds:0E5h, 40h ; sages_spoken_to_hero
                jz      short loc_AC41
                retn
; ---------------------------------------------------------------------------

loc_AC41:
                mov     si, offset aIAmTheSageYasm ; "I am the Sage Yasmin./I have been expec"...
                or      byte ptr ds:0E5h, 40h ; sages_spoken_to_hero
                retn
; ---------------------------------------------------------------------------

loc_AC4A:                               ;
                test    byte ptr ds:0E5h, 20h ; sages_spoken_to_hero
                jz      short loc_AC52
                retn
; ---------------------------------------------------------------------------

loc_AC52:
                mov     si, offset aIAmTheSageHajj ; "I am the Sage Hajjar./I am happy to see"...
                or      byte ptr ds:0E5h, 20h ; sages_spoken_to_hero
                retn
; ---------------------------------------------------------------------------

loc_AC5B:                               ;
                test    byte ptr ds:0E5h, 10h ; sages_spoken_to_hero
                jz      short loc_AC63
                retn
; ---------------------------------------------------------------------------

loc_AC63:
                mov     si, offset aIAmTheSageChir ; "I am the Sage Chiriga./You have come fa"...
                or      byte ptr ds:0E5h, 10h ; sages_spoken_to_hero
                retn
; ---------------------------------------------------------------------------

loc_AC6C:                               ;
                test    byte ptr ds:0E5h, 8 ; sages_spoken_to_hero
                jz      short loc_AC74
                retn
; ---------------------------------------------------------------------------

loc_AC74:
                mov     si, offset aIAmTheSageHish ; "I am the Sage Hisham./You are doing wel"...
                or      byte ptr ds:0E5h, 8 ; sages_spoken_to_hero
                retn
; ---------------------------------------------------------------------------

loc_AC7D:                               ;
                test    byte ptr ds:0E5h, 4 ; sages_spoken_to_hero
                jz      short loc_AC85
                retn
; ---------------------------------------------------------------------------

loc_AC85:
                mov     si, offset aIAmTheSageMary ; "I am the Sage Maryam./You have made the"...
                or      byte ptr ds:0E5h, 4 ; sages_spoken_to_hero
                retn
; ---------------------------------------------------------------------------

loc_AC8E:                               ;
                test    byte ptr ds:0E5h, 2 ; sages_spoken_to_hero
                jz      short loc_AC96
                retn
; ---------------------------------------------------------------------------

loc_AC96:
                mov     si, offset aIAmTheSageSaie ; "I am the Sage Saied./You have lived thr"...
                or      byte ptr ds:0E5h, 2 ; sages_spoken_to_hero
                retn
; ---------------------------------------------------------------------------

loc_AC9F:                               ;
                test    byte ptr ds:0E5h, 1 ; sages_spoken_to_hero
                jz      short loc_ACA7
                retn
; ---------------------------------------------------------------------------

loc_ACA7:
                mov     si, offset aIAmTheSageOfAl ; "I am the Sage of All Sages, Indihar./Br"...
                or      byte ptr ds:0E5h, 1 ; sages_spoken_to_hero
                retn
; END OF FUNCTION CHUNK FOR sub_AC07
; ---------------------------------------------------------------------------
vfs_kenjya_grp  db    1
                db  1Ah
aKenjyaGrp      db 'KENJYA.GRP',0
sage_names      dw offset byte_ACCD
                dw offset byte_ACDF
                dw offset byte_ACF2
                dw offset byte_AD05
                dw offset byte_AD19
                dw offset byte_AD2C
                dw offset byte_AD3F
                dw offset byte_AD51
byte_ACCD       db 16h
                db 0AFh
                db    0
aTheSageMarid   db 14,'The Sage Marid'
byte_ACDF       db 15h
                db 0AFh
                db    0
aTheSageYasmin  db 15,'The Sage Yasmin'
byte_ACF2       db 14h
                db 0AFh
                db    0
aTheSageHajjar  db 15,'The Sage Hajjar'
byte_AD05       db 14h
                db 0AFh
                db    2
aTheSageChiriga db 16,'The Sage Chiriga'
byte_AD19       db 14h
                db 0AFh
                db    0
aTheSageHisham  db 15,'The Sage Hisham'
byte_AD2C       db 14h
                db 0AFh
                db    0
aTheSageMaryam  db 15,'The Sage Maryam'
byte_AD3F       db 15h
                db 0AFh
                db    0
aTheSageSaied   db 14,'The Sage Saied'
byte_AD51       db 14h
                db 0AFh
                db    0
aTheSageIndihar db 16,'The Sage Indihar'
aGoOutside      db 'Go outside',0
aSeePower       db 'See Power',0
aListenKnowledg db 'Listen Knowledge',0
aRecordExperien db 'Record Experience',0
byte_AD9D       db 0Ch
aHowCanIHelpYou db 'How can I help you, Brave One?/'
                db 0FFh
                db    0
byte_ADBF       db 0Ch
aIsThereAnythin db 'Is there anything else I can do for you?/'
                db 0FFh
                db    0
byte_ADEB       db 0Ch
aTheSpiritsAreW db 'The Spirits are with you.'
                db  11h
                db 0FFh
                db 0FFh
byte_AE08       db 0Ch
aIShallCallUpon db 'I shall call upon the Spirits and their powers..... /'
                db 0FFh
                db    4
                db 0FFh
                db    1
byte_AE42       db 0Ch
aIFearTheSpirit db 'I fear the spirits are no longer with you. No matter how many tim'
                db 'es I try, it comes out the same. '
                db 0FFh
                db    0
byte_AEA7       db 0Ch
aYouAreBraveBut db 'You are brave, but your experience is lacking. Come back when you'
                db ' have accomplished more.'
                db 0FFh
                db    0
byte_AF03       db 0Ch
aICanNoLongerIm db 'I can no longer impart the power of the Spirits to you. Continue '
                db 'on your quest. You will soon find others to help you.'
                db 0FFh
                db    0
byte_AF7C       db 0Ch
aIShallRecordYo db 'I shall record your experiences./'
                db 0FFh
                db    3
aPlaceIsSavedOn db 'Place is saved on user disk. Will you continue your quest?'
                db 0FFh
                db    2
                db 0FFh
                db    6
unk_AFDE        db  13h
                db 0FFh
                db    4
aOhHolySpiritsP db 'Oh, Holy Spirits, purify my thoughts and grant me strength. '
                db 0FFh
                db    4
                db 0FFh
                db    4
                db  0Dh
                db  15h
                db 0FFh
                db    0
                db 0FFh
                db    0
                db 0FFh
                db 0FFh
off_B029        dw offset aYourExperience ; "Your experience is lacking. Persevere i"...
                dw offset aYouMustAccumul ; "You must accumulate more experience."
                dw offset aICanSeeTheFain ; "I can see the faint light of the Spirit"...
                dw offset aTheLightOfTheS ; "The light of the Spirits is bursting fo"...
                dw offset aICanNoLongerIm_0 ; "I can no longer impart the power of the"...
aYourExperience db 'Your experience is lacking. Persevere in your quest.'
                db 0FFh
                db    0
aYouMustAccumul db 'You must accumulate more experience.'
                db 0FFh
                db    0
aICanSeeTheFain db 'I can see the faint light of the Spirits in you. You must endure '
                db 'a little longer.'
                db 0FFh
                db    0
aTheLightOfTheS db 'The light of the Spirits is bursting forth within you. '
                db 0FFh
                db    4
                db  0Dh
aIndeedYourPowe db 'Indeed, your power has grown.'
                db 0FFh
                db    5
                db 0FFh
                db    4
                db 0FFh
                db    0
aICanNoLongerIm_0 db 'I can no longer impart the power of the Spirits to you. Continue '
                db 'on your quest. You will soon find others to help you. '
                db 0FFh
                db    0
aIAmTheSageMari db 'I am the Sage Marid./You are very brave to embark on such a dange'
                db 'rous journey. I&shall assist you in your travels. '
                db 0FFh
                db    0
aIAmTheSageYasm db 'I am the Sage Yasmin./I have been expecting you. I&shall teach yo'
                db 'u the Magic Spell of Throwing Swords: Espada.'
                db 0FFh
                db    7
                db 0FFh
                db    0
aIAmTheSageHajj db 'I am the Sage Hajjar./I am happy to see you\ve made it this far. '
                db 'I&shall teach you the Magic Spell of Arrows: Saeta.'
                db 0FFh
                db    8
                db 0FFh
                db    0
aIAmTheSageChir db 'I am the Sage Chiriga./You have come far, and you must be cold. I'
                db '&shall teach you the Magic Spell of Fire: Fuego.'
                db 0FFh
                db    9
                db 0FFh
                db    0
aIAmTheSageHish db 'I am the Sage Hisham./You are doing well to stand before me. I&sh'
                db 'all teach you the Magic Spell of Flame: Lanzar.'
                db 0FFh
                db  0Ah
                db 0FFh
                db    0
aIAmTheSageMary db 'I am the Sage Maryam./You have made the Spirits proud with your b'
                db 'ravery. I&shall teach you the Magic Spell of Falling Rocks: Rasca'
                db 'r.'
                db 0FFh
                db  0Bh
                db 0FFh
                db    0
aIAmTheSageSaie db 'I am the Sage Saied./You have lived through much, but your journe'
                db 'y is not over. You must be hot. I&shall teach you the Magic Spell'
                db ' of Water: Agua.'
                db 0FFh
                db  0Ch
                db 0FFh
                db    0
aIAmTheSageOfAl db 'I am the Sage of All Sages, Indihar./Brave lad, you\ve done well '
                db 'to get this far./'
                db  0Fh
aIShallTeachYou db 'I&shall teach you the Magic Spell of Lightning: Guerra.'
                db 0FFh
                db  0Dh
                db 0FFh
                db    0
aDiskErrorPleas db '      Disk error.',0Dh,'Please check your disk',0Dh,'  and press '
                db 'spacebar.'
                db 0FFh
off_B5EB        dw offset byte_B5FB
                dw offset byte_B670
                dw offset byte_B6EB
                dw offset byte_B76D
                dw offset byte_B81C
                dw offset byte_B8B2
                dw offset byte_B954
                dw offset byte_B9AF
byte_B5FB       db 0Ch
aMyMasterTheSag db 'My master, the Sage Yasmin, resides in the underground town. She '
                db 'is a person you can turn to if you are in need. '
                db  11h
                db 0FFh
                db    0
byte_B670       db 0Ch
aWhenYouLeaveTh db 'When you leave the city, climb to the plateau on the left. You\ll'
                db ' see a door that looks like the exit from this world. '
                db  11h
                db 0FFh
                db    0
byte_B6EB       db 0Ch
aTheExitFromThi db 'The exit from this world is very near the exit from the village. '
                db 'However, before you go there you must have the Hero\s Crest. '
                db  11h
                db 0FFh
                db    0
byte_B76D       db 0Ch
aThisIsAMessage db 'This is a message from the Spirits: Bend when you walk a low road'
                db '. Walk not on the steep path with the needles of ice, choose anot'
                db 'her path instead. Heed well these words. '
                db  11h
                db 0FFh
                db    0
byte_B81C       db 0Ch
aYouCanTDefeatT db 'You can\t defeat the demons at the edge of the badlands without t'
                db 'he Knight\s Sword. Until you get that sword, do not open the door'
                db ' of the demons. '
                db  11h
                db 0FFh
                db    0
byte_B8B2       db 0Ch
aOnceYouLeaveTh db 'Once you leave this world, get the Silkarn shoes made by the spir'
                db 'its at the behest of Percel. If you do not get those, you cannot '
                db 'travel far from this world. '
                db  11h
                db 0FFh
                db    0
byte_B954       db 0Ch
aThatWorldIsCon db 'That world is controlled by dragons. To get there, you have to op'
                db 'en three closed doors.'
                db  11h
                db 0FFh
                db    0
byte_B9AF       db 0Ch
aAtTheEdgeOfThi db 'At the edge of this world is the final foe, Jashiin./To fight Jas'
                db 'hiin, you must have the Sword of the Fairy Flame. And to get ther'
                db 'e, you must topple the invincible monster Alguien.'
                db  11h
                db 0FFh
                db    0
byte_BA67       db 0Ch
aWhileYouWereUn db 'While you were unconscious, the spirits brought you here./'
                db 0FFh
                db    4
                db 0FFh
                db    4
aBeCarefulNotTo db 'Be careful not to exhaust yourself in battle./'
                db 0FFh
                db    4
aNowBeOnYourWay db 'Now be on your way. '
                db 0FFh
                db    4
aTheSpiritsAreL db 'The spirits are looking after you. '
                db  11h
                db 0FFh
                db 0FFh
word_BB12       dw 0
menu_item_selected db 0
byte_BB15       db 0
byte_BB16       db 0
byte_BB17       db 0
byte_BB18       db 0
byte_BB19       db 0
byte_BB1A       db 0
byte_BB1B       db 0
byte_BB1C       db 0
byte_BB1D       db 0
byte_BB1E       db 0
byte_BB1F       db 0
byte_BB20       db 0
word_BB21       dw 0
byte_BB23       db 0
byte_BB24       db 0
byte_BB25       db 0
byte_BB26       db 0
byte_BB27       db 0, 0, 0, 0, 0, 0, 0
byte_BB2E       db 0
                db    0
                db    0
                db    0
                db    0
                db    0
word_BB34       dw 0
byte_BB36       db 0, 0, 0, 0, 0, 0, 0
kenjpro         ends


                end     start
