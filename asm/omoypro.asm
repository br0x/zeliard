include common.inc
include town.inc
include gdmcga.inc
                .286
                .model small

seg000          segment byte public 'CODE'
                assume cs:seg000, ds:seg000
                org 0A000h
start:
                dw offset sub_A005
                dw offset nullsub_1

; =============== S U B R O U T I N E =======================================


nullsub_1       proc near
                retn
nullsub_1       endp


; =============== S U B R O U T I N E =======================================


sub_A005        proc near
                mov     es, word ptr ds:seg1
                mov     di, 8000h
                mov     si, offset vfs_omoya_grp
                mov     al, 2
                call    word ptr cs:res_dispatcher_proc ; res_dispatcher_proc
                push    ds
                mov     ds, word ptr cs:seg1
                mov     si, 8000h
                mov     cx, 100h
                call    word ptr cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                call    word ptr cs:Clear_Viewport_proc
                call    word ptr cs:Clear_Place_Enemy_Bar_proc
                mov     si, offset in_the_hut_str
                call    word ptr cs:Render_Pascal_String_1_proc
                call    sub_A104
                test    byte ptr ds:is_death_already_processed, 0FFh
                jnz     short jashiin_dead
                mov     byte ptr ds:spacebar_latch, 0

loc_A049:
                call    word ptr cs:npcAnimation_proc
                test    byte ptr ds:spacebar_latch, 0FFh
                jz      short loc_A049
                jmp     word ptr cs:Fade_To_Black_Dithered_proc
; ---------------------------------------------------------------------------

jashiin_dead:
                pop     ax
                mov     ax, cs
                mov     ds, ax
                mov     es, ax
                mov     si, offset vfs_enddemo_bin
                mov     di, 6000h
                mov     al, 3
                call    word ptr cs:res_dispatcher_proc
                mov     ax, cs
                mov     es, ax
                xor     bx, bx
                mov     bl, ds:video_drv_id
                add     bx, bx
                mov     si, ds:off_A0BB[bx]
                mov     di, 3000h
                mov     al, 3
                call    word ptr cs:res_dispatcher_proc
                mov     word ptr cs:tick_counter, 0

loc_A08F:
                cmp     word ptr cs:tick_counter, 300
                jb      short loc_A08F
                mov     bx, 0
                mov     cx, 50C8h
                call    word ptr cs:Render_With_MaskErase_Callback_proc ; CH = height
                                                                        ; CL = width
                                                                        ; BH = screen Y coordinate
                                                                        ; BL = screen X coordinate / 4

                mov     byte ptr cs:font_highlight_flag, 0FFh
                jmp     word ptr ds:6000h ; go to end demo
sub_A005        endp

; ---------------------------------------------------------------------------
vfs_enddemo_bin db    1
                db  33h ; 3
aEnddemoBin     db 'enddemo.bin',0
off_A0BB        dw offset unk_A0C7
                dw offset unk_A0D3
                dw offset unk_A0D3
                dw offset unk_A0DF
                dw offset unk_A0EB
                dw offset unk_A0F8
unk_A0C7        db    0
                db    2
aGdegaBin       db 'gdega.bin',0
unk_A0D3        db    0
                db    3
aGdcgaBin       db 'gdcga.bin',0
unk_A0DF        db    0
                db    4
aGdhgcBin       db 'gdhgc.bin',0
unk_A0EB        db    0
                db    6
aGdmcgaBin      db 'gdmcga.bin',0
unk_A0F8        db    0
                db    5
aGdtgaBin       db 'gdtga.bin',0

; =============== S U B R O U T I N E =======================================


sub_A104        proc near
                mov     si, offset byte_A129
                mov     bx, 0C1Eh
                mov     cx, 16

loc_A10D:
                push    cx
                mov     cx, 17

loc_A111:
                push    cx
                push    bx
                lodsb
                call    word ptr cs:3016h
                pop     bx
                inc     bh
                pop     cx
                loop    loc_A111
                sub     bh, 17
                add     bl, 8
                pop     cx
                loop    loc_A10D
                retn
sub_A104        endp

; ---------------------------------------------------------------------------
byte_A129       db 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 3, 4, 5, 6, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 7, 8, 9, 0Ah, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0Bh, 0Ch, 0Dh, 0Eh, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 0Fh, 10h, 11h, 12h, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 13h, 14h, 15h, 16h, 0, 0, 0, 0, 0, 0, 0
                db 0, 0, 0, 0, 0, 0, 17h, 18h, 19h, 1Ah, 0, 0, 0, 0, 0, 0, 0
                db 0, 1Bh, 1Ch, 1Dh, 1Eh, 1Fh, 20h, 21h, 22h, 23h, 0, 0, 0, 0, 0, 0, 0
                db 24h, 25h, 26h, 27h, 28h, 29h, 2Ah, 2Bh, 2Ch, 2Dh, 0, 0, 0, 0, 0, 0, 0
                db 2Eh, 2Fh, 30h, 31h, 32h, 33h, 34h, 35h, 36h, 37h, 38h, 0, 0, 0, 0, 0, 0
                db 39h, 3Ah, 3Bh, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 41h, 42h, 43h, 0, 0, 0, 0, 0, 0
                db 44h, 45h, 46h, 47h, 0, 48h, 49h, 4Ah, 4Bh, 4Ch, 4Dh, 0, 0, 0, 0, 0, 0
                db 4Eh, 4Fh, 50h, 51h, 0, 52h, 53h, 54h, 55h, 56h, 57h, 58h, 0, 0, 0, 0, 0
                db 59h, 5Ah, 5Bh, 5Ch, 5Dh, 5Eh, 5Fh, 60h, 61h, 62h, 63h, 64h, 65h, 66h, 0, 0, 0
                db 67h, 68h, 69h, 6Ah, 6Bh, 6Ch, 6Dh, 6Eh, 6Fh, 70h, 71h, 72h, 73h, 74h, 75h, 0, 0
                db 76h, 77h, 78h, 79h, 7Ah, 7Bh, 7Ch, 7Dh, 7Eh, 7Fh, 80h, 81h, 82h, 83h, 84h, 85h, 86h
vfs_omoya_grp   db    1
                db  14h
aOmoyaGrp       db 'OMOYA.GRP',0
in_the_hut_str  db  16h
                db 0AFh
                db    2
aInTheHut       db 10,'In the Hut'

seg000          ends
                end start
