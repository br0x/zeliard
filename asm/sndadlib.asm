;==============================================================================
; ZELIARD ADLIB SOUND DRIVER (YM3812 / OPL2)
;==============================================================================
; This driver provides music playback and sound effects on the AdLib OPL2
; synthesizer.  It is called periodically (usually from a timer interrupt)
; to update up to two channels.  Each channel is a small state machine that
; interprets a simple event‑driven “sequence” language.
;
; Memory segment layout (simplified):
;   music_seg   segment byte public 'CODE' use16
;               org 1100h
; All code and data reside in the same segment.  Some variables are shared
; with the game segment through the `segment_shift` mechanism:
;   segment_shift = 0FF00h
; e.g., ds:(soundFX_request - segment_shift) reads a byte at absolute
; address 0FF00h lower than the label.  This is a hack to overlay the two
; segments.
;
; OPL2 I/O:
;   Status/Index port   388h
;   Data port           389h
;   Register write implementation: see OPL_WriteReg
;
; Channel data structure (size 23h bytes, instantiated at ChA_State and ChB_State):
;   Offset  Size   Description (see equates below for exact names)
;   ------------------------------------------------------------------
;   0x00    word   seq_ptr         ; pointer to next event in sequence
;   0x02    word   dur_tbl_base    ; pointer to duration multiplier table (from sfx definition)
;   0x04    byte   opl_channel     ; OPL channel number (4 or 5)
;   0x05    byte   flags           ; bit 0: note_on, bit 7: envelope direction, etc.
;   0x06    byte   note_timer      ; countdown for the current note/event
;   0x07    byte   volume          ; total level (0-3Fh, higher = quieter)
;   0x08    byte   octave_shift    ; octave / block multiplier (0..7)
;   0x09    byte   flags2          ; bit 2: vibrato active, bit 4: pause, bit 5: ramp, bit 6: env active
;   0x0A    byte   note_dur_init   ; initial note duration (from sequence)
;   0x0B    byte   algo_feedback   ; low nibble = register C0h value (feedback/algorithm)
;   0x0D    word   fnum_block      ; frequency: upper 5 bits = block (octave), lower 10 bits = F-number
;   0x0F    byte   transpose       ; semitone transpose
;   0x10    word   pitch_bend_acc  ; pitch bend accumulator
;   0x12    byte   pitch_bend_frac ; fractional part of pitch bend
;   0x13    byte   env_countdown   ; envelope step counter (downcounter)
;   0x14    word   env_step_up     ; envelope increment (when direction = up)
;   0x16    word   env_step_down   ; envelope decrement (when direction = down)
;   0x18    byte   env_scale       ; envelope multiplier/scale
;   0x19    byte   env_hold        ; hold counter for vibrato (from sequence)
;   0x1A    byte   env_par1        ; envelope parameter #1
;   0x1B    byte   env_par2        ; envelope parameter #2
;   0x1C    byte   env_par3        ; envelope parameter #3
;   0x1D    byte   env_par4        ; envelope parameter #4
;   0x1E    byte   env_flags       ; bit 7: alternate between par3/par4, lower 5 bits: period divider
;   0x1F    byte   env_alt_count   ; toggle counter for par3/par4
;   0x20    word   instr_ptr       ; pointer to current instrument definition (9+4 bytes)
;   0x22    byte   channel_mask    ; 1 for ChA, 2 for ChB (used to notify int 60h)
;
; Instrument definition (13 bytes per instrument at InstrTable):
;   Offset  Description
;   0       OPL operator 1 (modulator) → register 0x20+opNum (AM/VIB/EG/KSR/MULT)
;   1       Operator 1 → register 0x40+opNum (KSL/Total Level)
;   2       Operator 1 → register 0x60+opNum (Attack Rate / Decay Rate)
;   3       Operator 1 → register 0x80+opNum (Sustain Level / Release Rate)
;   4       Operator 1 → register 0xE0+opNum (Wave Select)
;   5       Operator 2 (carrier) → register 0x23+opNum  ; (actually opNum+3)
;   6       Operator 2 → register 0x43+opNum
;   7       Operator 2 → register 0x63+opNum
;   8       Operator 2 → register 0x83+opNum
;   9..12   Additional data loaded by InstrLoadFeedback etc.
;==============================================================================
include common.inc
                .286
                .model small

; Memory overlap trick: Note that music_seg intersects with game_seg
; music_seg region 0x0000-0x00FF is the same as game_seg region 0xff00-0xffff
segment_shift   equ 0ff00h

music_seg       segment byte public 'CODE' use16
                assume cs:music_seg, ds:music_seg
                org 1100h
start:

sound_drv_poll_farproc  proc far
                jmp     short init
; ---------------------------------------------------------------------------
                dw offset OPL_WriteReg ; AH: Register Index, AL: Data
; ---------------------------------------------------------------------------

init:
                push    cs
                pop     ds
                call    ProcessTick     ; handle pending SFX and run sequencer
                call    HeartbeatTick   ; heart beat, volume fade, sound FX toggle
                retf
sound_drv_poll_farproc  endp


; =============== S U B R O U T I N E =======================================


; ---------------------------------------------------------------------------
; Start a new sound effect.  Called when the game sets soundFX_request to a
; non‑zero value (SFX number + 1).  It copies the SFX definition's three
; data pointers and resets the two channels if necessary.
; ---------------------------------------------------------------------------
SFX_Start        proc near
                mov     al, ds:(soundFX_request - segment_shift)
                mov     byte ptr ds:(soundFX_request - segment_shift), 0
                test    byte ptr ds:(sound_fx_toggle_by_f2 - segment_shift), 0FFh
                jz      short check_sfx
                retn
; ---------------------------------------------------------------------------

check_sfx:
                dec     al
                mov     ah, 7
                mul     ah
                add     ax, offset byte_1743
                mov     si, ax
                mov     al, [si]
                cmp     al, byte_20BC
                jnb     short loc_1131
                retn
; ---------------------------------------------------------------------------

loc_1131:
                mov     byte_20BC, al
                inc     si
                mov     di, offset byte_2076
                mov     cx, 2
                mov     bh, 1
                mov     bl, 4

loc_113F:
                call    sub_1166
                add     di, 35
                inc     bh
                inc     bl
                loop    loc_113F
                lodsw
                mov     word_20C0, ax
                mov     byte ptr ds:(exit_pending_flag - segment_shift), 0
                mov     byte_20BD, 7Fh
                mov     byte_20C2, 0
                mov     byte_20C3, 0
                jmp     int60_fn6
SFX_Start        endp


; =============== S U B R O U T I N E =======================================


sub_1166        proc near
                lodsw
                mov     [di], ax
                mov     byte ptr [di+6], 1
                mov     byte ptr [di+8], 3
                mov     byte ptr [di+0Ah], 1
                mov     byte ptr [di+7], 7Fh
                mov     byte ptr [di+9], 0
                mov     byte ptr [di+5], 0
                mov     [di+4], bl
                mov     [di+22h], bh
                retn
sub_1166        endp


; =============== S U B R O U T I N E =======================================


ProcessTick        proc near
                test    byte ptr ds:(soundFX_request - segment_shift), 0FFh
                jz      short loc_1192
                call    SFX_Start

loc_1192:
                test    byte ptr ds:(exit_pending_flag - segment_shift), 0FFh
                jz      short loc_119A
                retn
; ---------------------------------------------------------------------------

loc_119A:
                push    cs
                pop     es
                mov     al, byte_20BD
                add     byte_20BE, al
                sbb     al, al
                mov     byte_20BF, al
                cld
                mov     di, offset byte_2076
                call    sub_11B4
                mov     di, offset byte_2099
                jmp     short $+2
ProcessTick        endp


; =============== S U B R O U T I N E =======================================


sub_11B4        proc near

                test    byte ptr [di+5], 1
                jz      short loc_11BB
                retn
; ---------------------------------------------------------------------------

loc_11BB:
                mov     ax, offset sub_1458
                push    ax
                test    byte_20BF, 0FFh
                jz      short loc_11C7
                retn
; ---------------------------------------------------------------------------

loc_11C7:
                dec     byte ptr [di+6]
                jz      short loc_11DF
                mov     al, [di+0Ah]
                cmp     al, [di+6]
                jnb     short loc_11D5
                retn
; ---------------------------------------------------------------------------

loc_11D5:
                test    byte ptr [di+9], 10h
                jz      short loc_11DC
                retn
; ---------------------------------------------------------------------------

loc_11DC:
                jmp     loc_142D
; ---------------------------------------------------------------------------

loc_11DF:
                mov     si, [di]

loc_11E1:
                lodsb
                or      al, al
                js      short loc_11E9
                jmp     loc_13B0
; ---------------------------------------------------------------------------

loc_11E9:
                mov     bx, offset loc_11E1
                push    bx
                test    al, 40h
                jnz     short loc_11F4
                jmp     loc_1292
; ---------------------------------------------------------------------------

loc_11F4:
                cmp     al, 0D0h
                jnb     short loc_11FB
                jmp     loc_1367
; ---------------------------------------------------------------------------

loc_11FB:
                cmp     al, 0D8h
                jnb     short loc_1202
                jmp     loc_1397
; ---------------------------------------------------------------------------

loc_1202:
                cmp     al, 0E0h
                jnb     short loc_1209
                jmp     loc_139D
; ---------------------------------------------------------------------------

loc_1209:
                and     al, 1Fh
                add     al, al
                mov     bl, al
                xor     bh, bh
                jmp     off_1215[bx]
; ---------------------------------------------------------------------------
off_1215        dw offset loc_1255
                dw offset loc_125A
                dw offset loc_125F
                dw offset loc_127D
                dw offset loc_1281
                dw offset loc_1285
                dw offset locret_1291
                dw offset loc_128C
                dw offset locret_1291
                dw offset locret_1291
                dw offset locret_1291
                dw offset locret_1291
                dw offset locret_1291
                dw offset locret_1291
                dw offset locret_1291
                dw offset locret_1291
                dw offset loc_14FA
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset locret_150B
                dw offset loc_150C
; ---------------------------------------------------------------------------

loc_1255:
                lodsb
                mov     byte_20BD, al
                retn
; ---------------------------------------------------------------------------

loc_125A:
                lodsb
                mov     [di+0Fh], al
                retn
; ---------------------------------------------------------------------------

loc_125F:
                and     byte ptr [di+5], 0BFh
                lodsb
                or      al, al
                jnz     short loc_1269
                retn
; ---------------------------------------------------------------------------

loc_1269:
                or      byte ptr [di+5], 40h
                push    di
                add     di, 1Ah
                mov     [di-1], al
                movsw
                movsw
                movsb
                pop     di
                and     byte ptr [di+9], 0FDh
                retn
; ---------------------------------------------------------------------------

loc_127D:
                dec     byte ptr [di+8]
                retn
; ---------------------------------------------------------------------------

loc_1281:
                inc     byte ptr [di+8]
                retn
; ---------------------------------------------------------------------------

loc_1285:
                lodsb
                mov     [di+7], al
                jmp     sub_1319
; ---------------------------------------------------------------------------

loc_128C:
                or      byte ptr [di+9], 20h
                retn
; ---------------------------------------------------------------------------

locret_1291:
                retn
; ---------------------------------------------------------------------------

loc_1292:
                and     al, 3Fh
                push    si
                mov     cl, 9
                mul     cl
                add     ax, offset byte_2020
                mov     si, ax
                mov     [di+20h], si
                mov     bl, [di+4]
                xor     bh, bh
                mov     ah, ChOpBaseTbl[bx]
                mov     al, 0FFh
                add     ah, 40h ; '@'
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                add     ah, 3
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                sub     ah, 23h
                lodsb
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                add     ah, 3
                lodsb
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                add     ah, 1Dh
                lodsb
                lodsb
                add     ah, 20h ; ' '
                mov     cx, 2

loc_12D1:
                lodsb
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                add     ah, 3
                lodsb
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                add     ah, 1Dh
                loop    loc_12D1
                add     ah, 40h
                lodsb
                mov     bl, al
                rol     al, 1
                rol     al, 1
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                add     ah, 3
                rol     al, 1
                rol     al, 1
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                mov     ah, [di+4]
                mov     al, bl
                and     al, 0Fh
                mov     [di+0Bh], al
                add     ah, 0C0h
                call    OPL_WriteReg ; AH: Register Index
                                              ; AL: Data
                call    sub_1319
                pop     si
                mov     al, [di+22h]
                or      byte_20C3, al
                call    int60_fn6
                jmp     loc_142D
sub_11B4        endp ; sp-analysis failed


; =============== S U B R O U T I N E =======================================


sub_1319        proc near
                push    si
                mov     si, [di+20h]
                mov     bl, [di+4]
                xor     bh, bh
                mov     ah, ChOpBaseTbl[bx]
                add     ah, 40h ; '@'
                mov     bl, [di+7]
                shr     bl, 1
                mov     al, [si+2]
                test    byte ptr [di+0Bh], 1
                jz      short loc_1348
                mov     bh, al
                and     al, 3Fh
                add     al, bl
                cmp     al, 40h ; '@'
                jb      short loc_1343
                mov     al, 3Fh ; '?'

loc_1343:
                and     bh, 0C0h
                or      al, bh

loc_1348:                               ; AH: Register Index
                call    OPL_WriteReg ; AL: Data
                add     ah, 3
                mov     al, [si+3]
                mov     bh, al
                and     al, 3Fh
                add     al, bl
                cmp     al, 40h ; '@'
                jb      short loc_135D
                mov     al, 3Fh ; '?'

loc_135D:
                and     bh, 0C0h
                or      al, bh
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                pop     si
                retn
sub_1319        endp

; ---------------------------------------------------------------------------

loc_1367:
                mov     bl, [di+7]
                and     al, 0Fh
                shl     al, 1
                shl     al, 1
                shl     al, 1
                shl     al, 1
                sar     al, 1
                sar     al, 1
                or      al, al
                js      short loc_1389
                add     al, 4
                sub     bl, al
                test    bl, 0C0h
                jz      short loc_1392
                xor     bl, bl
                jmp     short loc_1392
; ---------------------------------------------------------------------------

loc_1389:
                sub     bl, al
                test    bl, 0C0h
                jz      short loc_1392
                mov     bl, 3Fh ; '?'

loc_1392:
                mov     [di+7], bl
                jmp     short sub_1319
; ---------------------------------------------------------------------------

loc_1397:
                and     al, 7
                mov     [di+8], al
                retn
; ---------------------------------------------------------------------------

loc_139D:
                xor     bx, bx
                and     al, 7
                mov     bl, al
                mov     ax, [di+2]
                push    di
                mov     di, ax
                mov     al, [bx+di]
                pop     di
                mov     [di+0Ah], al
                retn
; ---------------------------------------------------------------------------

loc_13B0:
                mov     [di], si
                and     byte ptr [di+9], 0EFh
                cmp     byte ptr [si], 0E7h
                jnz     short loc_13BF
                or      byte ptr [di+9], 10h

loc_13BF:
                mov     dl, al
                mov     bx, [di+2]
                shr     dl, 1
                shr     dl, 1
                shr     dl, 1
                shr     dl, 1
                xor     dh, dh
                add     bx, dx
                mov     dl, [bx]
                mov     [di+6], dl
                mov     dl, al
                and     al, 0Fh
                jz      short loc_142D
                cmp     al, 0Fh
                jnz     short loc_13E0
                retn
; ---------------------------------------------------------------------------

loc_13E0:
                call    sub_1409
                mov     al, [di+9]
                and     byte ptr [di+9], 0DFh
                test    al, 20h
                jnz     short loc_1407
                push    dx
                mov     al, [di+19h]
                mov     [di+13h], al
                mov     word ptr [di+10h], 0
                mov     byte ptr [di+12h], 80h
                and     byte ptr [di+9], 0FDh
                pop     dx
                or      byte ptr [di+9], 40h

loc_1407:
                jmp     short loc_1433

; =============== S U B R O U T I N E =======================================


sub_1409        proc near
                dec     al
                xor     ah, ah
                mov     bx, ax
                mov     al, byte_158E[bx]
                mov     [di+18h], al
                add     bx, bx
                mov     al, [di+0Fh]
                cbw
                add     ax, word_1576[bx]
                mov     ch, [di+8]
                shl     ch, 1
                shl     ch, 1
                or      ah, ch
                mov     [di+0Dh], ax
                retn
sub_1409        endp

; ---------------------------------------------------------------------------

loc_142D:
                and     byte ptr [di+9], 0BFh
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_1433:
                mov     cx, [di+0Dh]
                add     cx, [di+10h]
                and     ch, 1Fh
                mov     al, [di+9]
                and     al, 40h
                shr     al, 1
                or      ch, al
                mov     ah, [di+4]
                add     ah, 0A0h
                mov     al, cl
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 10h
                mov     al, ch
                jmp     OPL_WriteReg ; AH: Register Index
; END OF FUNCTION CHUNK FOR sub_11B4    ; AL: Data

; =============== S U B R O U T I N E =======================================


sub_1458        proc near
                test    byte ptr [di+5], 40h
                jnz     short loc_145F
                retn
; ---------------------------------------------------------------------------

loc_145F:
                dec     byte ptr [di+13h]
                jz      short loc_1465
                retn
; ---------------------------------------------------------------------------

loc_1465:
                test    byte ptr [di+9], 2
                jnz     short loc_149F
                mov     al, [di+1Ah]
                mul     byte ptr [di+18h]
                mov     [di+14h], ax
                mov     al, [di+1Bh]
                mul     byte ptr [di+18h]
                mov     [di+16h], ax
                mov     al, [di+1Ch]
                mov     ah, [di+1Eh]
                and     ah, 80h
                jz      short loc_148B
                mov     al, [di+1Dh]

loc_148B:
                shr     al, 1
                mov     [di+1Fh], al
                mov     byte ptr [di+12h], 80h
                and     byte ptr [di+5], 7Fh
                or      [di+5], ah
                or      byte ptr [di+9], 2

loc_149F:
                mov     al, [di+1Eh]
                and     al, 1Fh
                mov     [di+13h], al
                dec     byte ptr [di+1Fh]
                jnz     short loc_14C8
                test    byte ptr [di+5], 80h
                jz      short loc_14BE
                mov     al, [di+1Ch]
                mov     [di+1Fh], al
                and     byte ptr [di+5], 7Fh
                jmp     short loc_14C8
; ---------------------------------------------------------------------------

loc_14BE:
                mov     al, [di+1Dh]
                mov     [di+1Fh], al
                or      byte ptr [di+5], 80h

loc_14C8:
                test    byte ptr [di+5], 80h
                jnz     short loc_14E4
                mov     cx, [di+14h]
                add     [di+12h], cl
                adc     ch, 0
                jnz     short loc_14DA
                retn
; ---------------------------------------------------------------------------

loc_14DA:
                mov     cl, ch
                xor     ch, ch
                add     [di+10h], cx
                jmp     loc_1433
; ---------------------------------------------------------------------------

loc_14E4:
                mov     cx, [di+16h]
                sub     [di+12h], cl
                adc     ch, 0
                jnz     short loc_14F0
                retn
; ---------------------------------------------------------------------------

loc_14F0:
                mov     cl, ch
                xor     ch, ch
                sub     [di+10h], cx
                jmp     loc_1433
sub_1458        endp

; ---------------------------------------------------------------------------
; START OF FUNCTION CHUNK FOR sub_11B4

loc_14FA:
                lodsb
                shl     al, 1
                shl     al, 1
                shl     al, 1
                xor     ah, ah
                add     ax, word_20C0
                mov     [di+2], ax
                retn
; ---------------------------------------------------------------------------

locret_150B:
                retn
; ---------------------------------------------------------------------------

loc_150C:
                pop     cx
                or      byte ptr [di+5], 1
                inc     byte_20C2
                cmp     byte_20C2, 2
                jz      short loc_151D
                retn
; ---------------------------------------------------------------------------

loc_151D:
                mov     byte ptr ds:9, 0FFh
                mov     byte_20BC, 0
                mov     byte_20C3, 0
; END OF FUNCTION CHUNK FOR sub_11B4

; =============== S U B R O U T I N E =======================================


int60_fn6       proc near
                mov     cl, byte_20C3
                mov     ax, 6
                int     60h             ; adlib fn_6
                retn
int60_fn6       endp


; =============== S U B R O U T I N E =======================================

; AH: Register Index
; AL: Data
OPL_WriteReg proc near
                push    dx
                push    ax
                mov     dx, 388h        ; Status/Index port
                xchg    ah, al          ; al: register Index
                out     dx, al
                in      al, dx          ; OPL2 needs 3.3us after Index write
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                mov     dx, 389h        ; AdLib Data port
                xchg    ah, al          ; al: Data
                out     dx, al          ; Send actual configuration/note data to previously selected register
                mov     dx, 388h        ; Status/Index port
                in      al, dx          ; OPL2 needs 23us delay after a data write
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                in      al, dx
                pop     ax
                pop     dx
                retn
OPL_WriteReg endp

; ---------------------------------------------------------------------------
word_1576       dw 156h, 16Bh, 180h, 197h, 1B0h, 1C9h, 1E4h, 201h, 220h
                dw 240h, 263h, 287h
byte_158E       db 13h, 14h, 15h, 16h, 18h, 19h, 1Bh, 1Ch, 1Eh, 20h, 22h
                db 24h
; ===========================================================================
; Channel operator base numbers.  Used to convert a logical channel (0..8)
; into the OPL operator number that will receive the instrument settings.
; Our music engine uses only channels 4 and 5.
;   Channel 4 → op 9  (carrier of ch4)
;   Channel 5 → op 10 (modulator of ch5)
; ===========================================================================
ChOpBaseTbl     db 0, 1, 2, 8, 9, 0Ah, 10h, 11h, 12h

; =============== S U B R O U T I N E =======================================


HeartbeatTick        proc near
                test    byte ptr ds:(sound_fx_toggle_by_f2 - segment_shift), 0FFh
                jnz     short loc_15B8
                test    byte ptr ds:(byte_FF0B - segment_shift), 0FFh
                jnz     short loc_15B8
                test    byte ptr ds:(heartbeat_volume - segment_shift), 0FFh
                jnz     short loc_15D5

loc_15B8:
                test    byte_2071, 0FFh
                jnz     short loc_15C0
                retn
; ---------------------------------------------------------------------------

loc_15C0:
                mov     byte_2071, 0
                test    byte ptr ds:(exit_pending_flag - segment_shift), 0FFh
                jnz     short loc_15CD
                retn
; ---------------------------------------------------------------------------

loc_15CD:
                mov     ax, 6
                xor     cl, cl
                int     60h             ; adlib fn_6
                retn
; ---------------------------------------------------------------------------

loc_15D5:
                dec     byte_2072
                jz      short loc_15DC
                retn
; ---------------------------------------------------------------------------

loc_15DC:
                mov     byte_2072, 4
                inc     byte_2073
                mov     al, byte_2073
                mov     byte_2073, 0FFh
                cmp     al, 96h
                jb      short loc_15F2
                retn
; ---------------------------------------------------------------------------

loc_15F2:
                mov     byte_2073, al
                test    byte ptr ds:(exit_pending_flag - segment_shift), 0FFh
                jnz     short loc_15FD
                retn
; ---------------------------------------------------------------------------

loc_15FD:
                cmp     al, 1Eh
                jb      short loc_1603
                sub     al, 1Eh

loc_1603:
                push    ax
                xor     ah, ah
                mov     cl, 1Eh
                div     cl
                jnz     short loc_1611
                mov     byte_2075, 0FFh

loc_1611:
                pop     ax
                mov     ch, al
                shr     al, 1
                shr     al, 1
                shr     al, 1
                mov     ah, ds:(heartbeat_volume - segment_shift)
                sub     ah, al
                cmc
                sbb     al, al
                and     ah, al
                add     ah, ah
                add     ah, ah
                mov     al, ah
                or      al, al
                jz      short loc_15B8
                mov     byte_2074, al
                push    cx
                mov     ax, 6
                mov     cl, 3
                int     60h             ; adlib fn_6 - Fade Out channel
                call    sub_169E
                pop     cx
                neg     ch
                mov     cl, ch
                mov     ch, 0FFh
                add     cx, cx
                add     cx, 980h
                test    byte_2075, 0FFh
                jz      short loc_1674
                mov     ah, 0A4h
                mov     al, cl
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 10h
                mov     al, ch
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                mov     ah, 0A5h
                mov     al, cl
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 10h
                mov     al, ch
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                mov     byte_2075, 0

loc_1674:
                or      ch, 20h
                mov     ah, 0A4h
                mov     al, cl
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 10h
                mov     al, ch
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                mov     ah, 0A5h
                mov     al, cl
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 10h
                mov     al, ch
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                call    sub_16FE
                mov     byte_2071, 0FFh
                retn
HeartbeatTick        endp


; =============== S U B R O U T I N E =======================================


sub_169E        proc near
                mov     si, offset byte_173A
                mov     bx, 4
                call    sub_16AD
                mov     si, offset byte_173A
                mov     bx, 5
sub_169E        endp


; =============== S U B R O U T I N E =======================================


sub_16AD        proc near
                mov     ah, ChOpBaseTbl[bx]
                push    bx
                add     ah, 20h ; ' '
                lodsb
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 3
                lodsb
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 3Dh ; '='
                lodsb
                lodsb
                mov     cx, 2

loc_16C8:
                lodsb
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 3
                lodsb
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 1Dh
                loop    loc_16C8
                add     ah, 40h ; '@'
                lodsb
                mov     bl, al
                rol     al, 1
                rol     al, 1
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 3
                rol     al, 1
                rol     al, 1
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                mov     al, bl
                and     al, 0Fh
                pop     bx
                mov     ah, bl
                add     ah, 0C0h
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                jmp     short $+2
sub_16AD        endp


; =============== S U B R O U T I N E =======================================


sub_16FE        proc near
                mov     bx, 4
                call    sub_1707
                mov     bx, 5
sub_16FE        endp


; =============== S U B R O U T I N E =======================================


sub_1707        proc near
                mov     si, offset byte_173A
                mov     ah, ChOpBaseTbl[bx]
                add     ah, 40h ; '@'
                mov     al, [si+2]
                call    OPL_WriteReg ; AH: Register Index
                                        ; AL: Data
                add     ah, 3
                mov     bl, byte_2074
                neg     bl
                add     bl, 3Fh ; '?'
                mov     al, [si+3]
                mov     bh, al
                and     al, 3Fh
                add     al, bl
                cmp     al, 40h ; '@'
                jb      short loc_1732
                mov     al, 3Fh ; '?'

loc_1732:
                and     bh, 0C0h
                or      al, bh
                jmp     OPL_WriteReg ; AH: Register Index
sub_1707        endp                    ; AL: Data

; ---------------------------------------------------------------------------
byte_173A       db 20h, 21h, 4, 0, 0F8h, 0F4h, 8Fh, 8Fh, 40h
byte_1743       db 0                    ; sfx1
                dw offset byte_190A
                dw offset byte_201F
                dw offset byte_1914
                db 0FFh                 ; sfx2
                dw offset byte_1915
                dw offset byte_201F
                dw offset byte_1923
                db 0                    ; sfx3
                dw offset byte_1924
                dw offset byte_1931
                dw offset byte_193C
                db 0                    ; sfx4
                dw offset byte_193E
                dw offset byte_194A
                dw offset byte_1955
                db 0                    ; sfx5
                dw offset byte_1957
                dw offset byte_201F
                dw offset byte_1961
                db 1                    ; sfx6
                dw offset byte_1962
                dw offset byte_1978
                dw offset byte_1989
                db 9                    ; sfx7
                dw offset byte_198A
                dw offset byte_199D
                dw offset byte_19AE
                db 9                    ; sfx8
                dw offset byte_19B0
                dw offset byte_19BA
                dw offset byte_19C6
                db 8                    ; sfx9
                dw offset byte_19C9
                dw offset byte_19D8
                dw offset byte_19E5
                db 7                    ; sfx10
                dw offset byte_19E6
                dw offset byte_201F
                dw offset byte_19F0
                db 0FFh                 ; sfx11
                dw offset byte_19F1
                dw offset byte_19FE
                dw offset byte_1A0B
                db 0FFh                 ; sfx12
                dw offset byte_1A0D
                dw offset byte_1A17
                dw offset byte_1A1F
                db 0FFh                 ; sfx13
                dw offset byte_1A20
                dw offset byte_1A2A
                dw offset byte_1A32
                db 0FFh                 ; sfx14
                dw offset byte_1A33
                dw offset byte_1A3F
                dw offset byte_1A49
                db 0FFh                 ; sfx15
                dw offset byte_1A4A
                dw offset byte_1A87
                dw offset byte_1AAC
                db 9                    ; sfx16
                dw offset byte_1AAD
                dw offset byte_201F
                dw offset byte_1ABA
                db 9                    ; sfx17
                dw offset byte_1ABC
                dw offset byte_1ABC
                dw offset byte_1ACA
                db 9                    ; sfx18
                dw offset byte_1ACC
                dw offset byte_1ADC
                dw offset byte_1AEA
                db 0                    ; sfx19
                dw offset byte_1AEC
                dw offset byte_201F
                dw offset byte_1AF6
                db 9                    ; sfx20
                dw offset byte_1AF7
                dw offset byte_1B02
                dw offset byte_1B0E
                db 0                    ; sfx21
                dw offset byte_1B10
                dw offset byte_1B21
                dw offset byte_1B29
                db 0                    ; sfx22
                dw offset byte_1B2A
                dw offset byte_1B3B
                dw offset byte_1B4A
                db 0                    ; sfx23
                dw offset byte_1B4B
                dw offset byte_201F
                dw offset byte_1B55
                db 0                    ; sfx24
                dw offset byte_1B56
                dw offset byte_1B61
                dw offset byte_1B6B
                db 9                    ; sfx25
                dw offset byte_1B6D
                dw offset byte_1B8A
                dw offset byte_1B99
                db 0FFh                 ; sfx26
                dw offset byte_1B9D
                dw offset byte_1BAA
                dw offset byte_1BB5
                db 0FFh                 ; sfx27
                dw offset byte_1BB6
                dw offset byte_1BC3
                dw offset byte_1BD5
                db 0FFh                 ; sfx28
                dw offset byte_1BD8
                dw offset byte_201F
                dw offset byte_1BE6
                db 0FFh                 ; sfx29
                dw offset byte_1BEA
                dw offset byte_201F
                dw offset byte_1C04
                db 0FFh                 ; sfx30
                dw offset byte_1C05
                dw offset byte_1C11
                dw offset byte_1C25
                db 0FFh                 ; sfx31
                dw offset byte_1C29
                dw offset byte_1C37
                dw offset byte_1C43
                db 0FFh                 ; sfx32
                dw offset byte_1C45
                dw offset byte_1C59
                dw offset byte_1C69
                db 9                    ; sfx33
                dw offset byte_1C6C
                dw offset byte_1C7C
                dw offset byte_1C8B
                db 9                    ; sfx34
                dw offset byte_1C8E
                dw offset byte_1C9A
                dw offset byte_1CA4
                db 9                    ; sfx35
                dw offset byte_1CA6
                dw offset byte_1CB7
                dw offset byte_1CC6
                db 9                    ; sfx36
                dw offset byte_1CC7
                dw offset byte_1CD3
                dw offset byte_1CDD
                db 9                    ; sfx37
                dw offset byte_1CDF
                dw offset byte_1CF1
                dw offset byte_1CFB
                db 1                    ; sfx38
                dw offset byte_1CFD
                dw offset byte_201F
                dw offset byte_1D11
                db 1                    ; sfx39
                dw offset byte_1D12
                dw offset byte_201F
                dw offset byte_1D26
                db 9                    ; sfx40
                dw offset byte_1D28
                dw offset byte_1D56
                dw offset byte_1D68
                db 9                    ; sfx41
                dw offset byte_1D6A
                dw offset byte_1D79
                dw offset byte_1D87
                db 0                    ; sfx42
                dw offset byte_1D88
                dw offset byte_1DA1
                dw offset byte_1DB8
                db 0                    ; sfx43
                dw offset byte_1DBA
                dw offset byte_201F
                dw offset byte_1DC4
                db 9                    ; sfx44
                dw offset byte_1DC5
                dw offset byte_1DF5
                dw offset byte_1E0C
                db 9                    ; sfx45
                dw offset byte_1E0F
                dw offset byte_1E20
                dw offset byte_1E2C
                db 9                    ; sfx46
                dw offset byte_1E2D
                dw offset byte_1E3E
                dw offset byte_1E46
                db 9                    ; sfx47
                dw offset byte_1E48
                dw offset byte_1E5B
                dw offset byte_1E65
                db 1                    ; sfx48
                dw offset byte_1E67
                dw offset byte_1E71
                dw offset byte_1E86
                db 0                    ; sfx49
                dw offset byte_1E88
                dw offset byte_1E92
                dw offset byte_1E9A
                db 0                    ; sfx50
                dw offset byte_1E9B
                dw offset byte_1EAA
                dw offset byte_1EB7
                db 9                    ; sfx51
                dw offset byte_1EBA
                dw offset byte_1ECB
                dw offset byte_1EDA
                db 9                    ; sfx52
                dw offset byte_1EDB
                dw offset byte_1EE9
                dw offset byte_1EF6
                db 8                    ; sfx53
                dw offset byte_1EF7
                dw offset byte_1F03
                dw offset byte_1F0D
                db 0                    ; sfx54
                dw offset byte_1F0E
                dw offset byte_1F27
                dw offset byte_1F36
                db 9                    ; sfx55
                dw offset byte_1F38
                dw offset byte_1F68
                dw offset byte_1F7F
                db 0                    ; sfx56
                dw offset byte_1F82
                dw offset byte_201F
                dw offset byte_1F8F
                db 9                    ; sfx57
                dw offset byte_1F91
                dw offset byte_1FA2
                dw offset byte_1FB0
                db 0                    ; sfx58
                dw offset byte_1FB2
                dw offset byte_201F
                dw offset byte_1FBF
                db 0                    ; sfx59
                dw offset byte_1FC1
                dw offset byte_201F
                dw offset byte_1FDE
                db 9                    ; sfx60
                dw offset byte_1FE0
                dw offset byte_201F
                dw offset byte_1FEB
                db 0FFh                 ; sfx61
                dw offset byte_1FEC
                dw offset byte_201F
                dw offset byte_1FF6
                db 0FFh                 ; sfx62
                dw offset byte_1FF7
                dw offset byte_201F
                dw offset byte_1FF6
                db 0FFh                 ; sfx63
                dw offset byte_2001
                dw offset byte_201F
                dw offset byte_1FF6
                db 0FFh                 ; sfx64
                dw offset byte_200B
                dw offset byte_201F
                dw offset byte_1FF6
                db 0FFh                 ; sfx65
                dw offset byte_2015
                dw offset byte_201F
                dw offset byte_1FF6
byte_190A       db 0F0h
                db    0
                db 0E0h
                db  7Fh ; 
                db  87h
                db 0E5h
                db    7
                db 0D5h
                db    5
                db 0FFh
byte_1914       db 3
byte_1915       db 0F0h
                db    0
                db 0E0h
                db  37h ; 7
                db  83h
                db 0E5h
                db    7
                db 0D5h
                db    8
                db  0Ah
                db  0Ch
                db 0E4h
                db    1
                db 0FFh
byte_1923       db 0Ch
byte_1924       db 0F0h
                db    0
                db 0E0h
                db  46h ; F
                db 0E5h
                db    7
                db  80h
                db 0D5h
                db    1
                db  81h
                db 0D4h
                db  11h
                db 0FFh
byte_1931       db 0F0h
                db    0
                db 0E5h
                db  17h
                db  80h
                db 0D3h
                db    1
                db  81h
                db 0D1h
                db  11h
                db 0FFh
byte_193C       db 3
                db  18h
byte_193E       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  82h
                db 0E5h
                db    7
                db 0D6h
                db    1
                db    0
                db  1Ah
                db 0FFh
byte_194A       db 0F0h
                db    0
                db  82h
                db 0E5h
                db    7
                db 0D3h
                db    1
                db    0
                db 0D6h
                db  11h
                db 0FFh
byte_1955       db 3
                db  0Ch
byte_1957       db 0F0h
                db    0
                db 0E0h
                db    0
                db  87h
                db 0E5h
                db    7
                db 0D4h
                db    1
                db 0FFh
byte_1961       db 12h
byte_1962       db 0F0h
                db    0
                db 0E0h
                db  69h ; i
                db 0E5h
                db    7
                db  83h
                db 0E2h
                db    1
                db    1
                db 0FEh
                db    2
                db 0FFh
                db  81h
                db 0D2h
                db    3
                db  82h
                db 0E2h
                db    0
                db 0D6h
                db    2
                db 0FFh
byte_1978       db 0F0h
                db    0
                db 0E5h
                db  17h
                db  83h
                db 0E2h
                db    1
                db    1
                db 0FEh
                db    2
                db 0FFh
                db  81h
                db 0D1h
                db    9
                db  84h
                db    1
                db 0FFh
byte_1989       db 0Ch
byte_198A       db 0F0h
                db    0
                db 0E0h
                db  69h ; i
                db  86h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    1
                db 0FFh
                db    2
                db 0FFh
                db  90h
                db 0D1h
                db    5
                db 0D1h
                db  17h
                db 0FFh
byte_199D       db 0F0h
                db    0
                db  82h
                db 0E5h
                db  0Fh
                db 0E2h
                db    1
                db    0
                db 0FFh
                db    2
                db    2
                db    1
                db 0D2h
                db    5
                db 0D1h
                db  17h
                db 0FFh
byte_19AE       db 0Ch
                db  18h
byte_19B0       db 0F0h
                db    0
                db 0E0h
                db    0
                db 0E5h
                db    7
                db  84h
                db    1
                db  11h
                db 0FFh
byte_19BA       db 0F0h
                db    0
                db 0E5h
                db    7
                db  88h
                db 0D2h
                db    1
                db  20h
                db 0D3h
                db  21h ; !
                db  20h
                db 0FFh
byte_19C6       db 6
                db    9
                db    3
byte_19C9       db 0F0h
                db    0
                db 0E0h
                db  37h ; 7
                db 0E5h
                db    7
                db  88h
                db 0D1h
                db  0Ch
                db 0E7h
                db 0E4h
                db    3
                db 0E7h
                db    1
                db 0FFh
byte_19D8       db 0F0h
                db    0
                db 0E5h
                db    7
                db  88h
                db 0D1h
                db  0Bh
                db 0E7h
                db    9
                db 0E7h
                db 0D5h
                db    1
                db 0FFh
byte_19E5       db 6
byte_19E6       db 0F0h
                db    0
                db 0E0h
                db  69h ; i
                db 0E5h
                db    7
                db  82h
                db 0D5h
                db    3
                db 0FFh
byte_19F0       db 18h
byte_19F1       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db 0E5h
                db    7
                db  83h
                db 0D8h
                db 0D5h
                db  13h
                db  14h
                db  16h
                db 0FFh
byte_19FE       db 0F0h
                db    0
                db 0E5h
                db    7
                db  83h
                db 0D8h
                db 0D7h
                db  1Bh
                db 0D3h
                db  15h
                db 0E4h
                db  13h
                db 0FFh
byte_1A0B       db 2
                db    6
byte_1A0D       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db 0E5h
                db    7
                db  87h
                db 0D5h
                db    7
                db 0FFh
byte_1A17       db 0F0h
                db    0
                db 0E5h
                db    7
                db  87h
                db 0D5h
                db  0Bh
                db 0FFh
byte_1A1F       db 6
byte_1A20       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db 0E5h
                db    7
                db  87h
                db 0D5h
                db    3
                db 0FFh
byte_1A2A       db 0F0h
                db    0
                db 0E5h
                db    7
                db  87h
                db 0D5h
                db    7
                db 0FFh
byte_1A32       db 6
byte_1A33       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db 0E5h
                db    7
                db  87h
                db 0D6h
                db    8
                db    8
                db    4
                db 0FFh
byte_1A3F       db 0F0h
                db    0
                db 0E5h
                db    7
                db  87h
                db 0D5h
                db    9
                db    1
                db  0Bh
                db 0FFh
byte_1A49       db 6
byte_1A4A       db 0F0h
                db    0
                db  83h
                db 0E2h
                db    1
                db  40h ; @
                db  40h ; @
                db  11h
                db  41h ; A
                db  81h
                db 0D2h
                db 0E5h
                db    7
                db 0E0h
                db  9Bh
                db    6
                db 0CEh
                db 0E0h
                db  91h
                db    6
                db 0CEh
                db 0E0h
                db  87h
                db    6
                db 0CEh
                db 0E0h
                db  7Dh ; }
                db    6
                db 0CEh
                db 0E0h
                db  73h ; s
                db    6
                db 0CEh
                db 0E0h
                db  69h ; i
                db    6
                db 0CEh
                db 0E0h
                db  5Fh ; _
                db    6
                db 0CEh
                db 0E0h
                db  55h ; U
                db    6
                db 0CEh
                db 0E0h
                db  4Bh ; K
                db    6
                db 0CEh
                db 0E0h
                db  41h ; A
                db    6
                db 0CEh
                db 0E0h
                db  37h ; 7
                db    6
                db 0CEh
                db 0E0h
                db  2Dh ; -
                db    6
                db 0FFh
byte_1A87       db 0F0h
                db    0
                db  83h
                db 0E2h
                db    1
                db  40h ; @
                db  40h ; @
                db  21h ; !
                db  11h
                db  81h
                db 0D0h
                db 0E5h
                db  17h
                db 0CDh
                db    1
                db    9
                db 0E4h
                db 0CDh
                db    1
                db    9
                db 0E4h
                db 0CDh
                db    1
                db    9
                db 0E4h
                db 0CDh
                db    1
                db    9
                db 0E4h
                db 0CDh
                db    1
                db    9
                db 0E4h
                db 0CDh
                db    1
                db    9
                db 0FFh
byte_1AAC       db 18h
byte_1AAD       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db 0E5h
                db    7
                db  87h
                db 0D8h
                db 0D5h
                db  1Ah
                db 0E3h
                db  1Ah
                db 0FFh
byte_1ABA       db 6
                db  0Ch
byte_1ABC       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db 0E5h
                db    7
                db  87h
                db 0D8h
                db 0D4h
                db  13h
                db 0E7h
                db 0E4h
                db  14h
                db 0FFh
byte_1ACA       db 6
                db  0Ch
byte_1ACC       db 0F0h
                db    0
                db 0E0h
                db  69h ; i
                db  82h
                db 0E5h
                db  2Fh ; /
                db 0D2h
                db  0Ah
                db 0E5h
                db  1Fh
                db    2
                db 0E5h
                db    7
                db  11h
                db 0FFh
byte_1ADC       db 0F0h
                db    0
                db  84h
                db 0D3h
                db 0E5h
                db  2Fh ; /
                db    1
                db 0E5h
                db  1Fh
                db    1
                db 0E5h
                db    7
                db  11h
                db 0FFh
byte_1AEA       db 0Ch
                db  12h
byte_1AEC       db 0F0h
                db    0
                db 0E0h
                db  7Fh ; 
                db  87h
                db 0E5h
                db    7
                db 0D4h
                db    1
                db 0FFh
byte_1AF6       db 3
byte_1AF7       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  82h
                db 0E5h
                db    7
                db 0D6h
                db    5
                db  15h
                db 0FFh
byte_1B02       db 0F0h
                db    0
                db  83h
                db 0E5h
                db  2Fh ; /
                db 0E1h
                db    4
                db 0D4h
                db    5
                db 0E4h
                db  15h
                db 0FFh
byte_1B0E       db 9
                db    3
byte_1B10       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  83h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db  40h ; @
                db  40h ; @
                db  21h ; !
                db  21h ; !
                db  81h
                db 0D4h
                db    3
                db 0FFh
byte_1B21       db 0F0h
                db    0
                db  82h
                db 0E5h
                db    7
                db 0D3h
                db    3
                db 0FFh
byte_1B29       db 3
byte_1B2A       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  87h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db  40h ; @
                db  40h ; @
                db  21h ; !
                db  21h ; !
                db  81h
                db 0D1h
                db    8
                db 0FFh
byte_1B3B       db 0F0h
                db    0
                db  83h
                db 0E5h
                db  27h ; '
                db 0E2h
                db    1
                db  40h ; @
                db  40h ; @
                db  21h ; !
                db  21h ; !
                db  81h
                db 0D1h
                db    8
                db 0FFh
byte_1B4A       db 3
byte_1B4B       db 0F0h
                db    0
                db 0E0h
                db  46h ; F
                db 0E5h
                db    7
                db  81h
                db 0D7h
                db    1
                db 0FFh
byte_1B55       db 0Ch
byte_1B56       db 0F0h
                db    0
                db 0E0h
                db  46h ; F
                db 0E5h
                db    7
                db 0D2h
                db  82h
                db    1
                db  11h
                db 0FFh
byte_1B61       db 0F0h
                db    0
                db 0E5h
                db    7
                db  86h
                db 0D3h
                db    6
                db 0D4h
                db  16h
                db 0FFh
byte_1B6B       db 0Ch
                db  18h
byte_1B6D       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db 0E5h
                db    7
                db 0E2h
                db    1
                db  78h ; x
                db    1
                db    2
                db    2
                db    1
                db  85h
                db 0D2h
                db    1
                db 0E7h
                db 0CEh
                db  11h
                db 0E7h
                db 0CEh
                db  11h
                db 0E7h
                db 0CEh
                db  11h
                db 0E7h
                db 0CEh
                db  21h ; !
                db 0FFh
byte_1B8A       db 0F0h
                db    0
                db 0E5h
                db    7
                db  81h
                db 0D3h
                db    1
                db 0D2h
                db  11h
                db  82h
                db 0D1h
                db  11h
                db 0D0h
                db  31h ; 1
                db 0FFh
byte_1B99       db 18h
                db  0Ch
                db  12h
                db  24h ; $
byte_1B9D       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  80h
                db 0E5h
                db    7
                db 0D0h
                db    1
                db 0E5h
                db  5Fh ; _
                db    1
                db 0FFh
byte_1BAA       db 0F0h
                db    0
                db  80h
                db 0E5h
                db    7
                db 0D3h
                db    1
                db 0E5h
                db  5Fh ; _
                db    1
                db 0FFh
byte_1BB5       db 6
byte_1BB6       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db  86h
                db 0E5h
                db    7
                db 0D5h
                db    8
                db  18h
                db 0D6h
                db  2Ah ; *
                db 0FFh
byte_1BC3       db 0F0h
                db    0
                db  86h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db  28h ; (
                db  28h ; (
                db    3
                db    3
                db    1
                db 0D5h
                db    8
                db  18h
                db 0D7h
                db  23h ; #
                db 0FFh
byte_1BD5       db 3
                db  0Ch
                db  30h ; 0
byte_1BD8       db 0F0h
                db    0
                db 0E0h
                db    5
                db  86h
                db 0E5h
                db    7
                db 0D5h
                db    8
                db  18h
                db 0D6h
                db  23h ; #
                db  3Ah ; :
                db 0FFh
byte_1BE6       db 3
                db  0Ch
                db  18h
                db  60h ; `
byte_1BEA       db 0F0h
                db    0
                db 0E0h
                db  87h
                db  83h
                db 0E2h
                db    1
                db  40h ; @
                db  40h ; @
                db    3
                db    3
                db    1
                db 0E5h
                db    7
                db 0D5h
                db    3
                db 0E5h
                db  17h
                db    3
                db 0E5h
                db    7
                db    8
                db 0E5h
                db  17h
                db    8
                db 0FFh
byte_1C04       db 6
byte_1C05       db 0F0h
                db    0
                db 0E0h
                db  87h
                db  83h
                db 0E5h
                db    7
                db 0D5h
                db    1
                db    0
                db  16h
                db 0FFh
byte_1C11       db 0F0h
                db    0
                db  83h
                db 0E2h
                db    1
                db  40h ; @
                db  40h ; @
                db    5
                db    5
                db    2
                db 0E1h
                db    4
                db 0E5h
                db  17h
                db  20h
                db 0D5h
                db    1
                db    0
                db  36h ; 6
                db 0FFh
byte_1C25       db 3
                db  18h
                db    6
                db  12h
byte_1C29       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  87h
                db 0E5h
                db    7
                db 0D5h
                db    1
                db  15h
                db 0E5h
                db  27h ; '
                db    5
                db 0FFh
byte_1C37       db 0F0h
                db    0
                db  87h
                db 0E5h
                db  17h
                db    0
                db 0E1h
                db    2
                db 0D5h
                db    1
                db  15h
                db 0FFh
byte_1C43       db 6
                db    9
byte_1C45       db 0F0h
                db    0
                db 0E0h
                db  87h
                db  82h
                db 0E5h
                db  0Fh
                db 0D0h
                db    1
                db    0
                db 0E2h
                db    1
                db  80h
                db  80h
                db    3
                db    3
                db    1
                db 0D1h
                db  18h
                db 0FFh
byte_1C59       db 0F0h
                db    0
                db  83h
                db 0E2h
                db    1
                db    0
                db 0FFh
                db    0
                db  1Fh
                db  81h
                db 0E5h
                db  0Fh
                db 0D1h
                db  21h ; !
                db  11h
                db 0FFh
byte_1C69       db 3
                db  24h ; $
                db    6
byte_1C6C       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db 0E5h
                db    7
                db  87h
                db 0D6h
                db    8
                db 0D5h
                db    1
                db 0D4h
                db    1
                db 0D5h
                db  18h
                db 0FFh
byte_1C7C       db 0F0h
                db    0
                db 0E5h
                db    7
                db  82h
                db 0D3h
                db    5
                db 0D1h
                db    8
                db  84h
                db 0E5h
                db  0Fh
                db 0D5h
                db  21h ; !
                db 0FFh
byte_1C8B       db 6
                db  0Ch
                db  18h
byte_1C8E       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  83h
                db 0E5h
                db    7
                db 0D2h
                db    1
                db 0D1h
                db  16h
                db 0FFh
byte_1C9A       db 0F0h
                db    0
                db  83h
                db 0E5h
                db    7
                db 0D2h
                db    7
                db 0D1h
                db  13h
                db 0FFh
byte_1CA4       db 6
                db  0Ch
byte_1CA6       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  82h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    2
                db    2
                db  0Bh
                db 0DDh
                db    1
                db 0D1h
                db    1
                db 0FFh
byte_1CB7       db 0F0h
                db    0
                db  88h
                db 0E5h
                db  0Fh
                db 0E2h
                db    1
                db    2
                db    2
                db  0Bh
                db 0DDh
                db    1
                db 0D1h
                db    1
                db 0FFh
byte_1CC6       db 48h
byte_1CC7       db 0F0h
                db    0
                db 0E0h
                db 0AFh
                db  83h
                db 0E5h
                db    7
                db 0D1h
                db    4
                db 0D1h
                db  13h
                db 0FFh
byte_1CD3       db 0F0h
                db    0
                db  83h
                db 0E5h
                db    7
                db 0D4h
                db    2
                db 0D1h
                db  1Bh
                db 0FFh
byte_1CDD       db 6
                db  0Ch
byte_1CDF       db 0F0h
                db    0
                db 0E0h
                db 0AFh
                db  88h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db  14h
                db  14h
                db  15h
                db  15h
                db    1
                db 0D3h
                db    1
                db  13h
                db 0FFh
byte_1CF1       db 0F0h
                db    0
                db  88h
                db 0E5h
                db  0Fh
                db 0D1h
                db    3
                db 0D2h
                db  1Bh
                db 0FFh
byte_1CFB       db 6
                db  0Ch
byte_1CFD       db 0F0h
                db    0
                db 0E0h
                db    5
                db  82h
                db 0E5h
                db    7
                db 0D4h
                db    1
                db 0D1h
                db  0Ch
                db 0D4h
                db    1
                db 0D1h
                db  0Ch
                db 0D4h
                db    1
                db 0D1h
                db  0Ch
                db 0FFh
byte_1D11       db 18h
byte_1D12       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  88h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    1
                db    1
                db  65h ; e
                db 0C9h
                db    1
                db 0D3h
                db    4
                db  82h
                db 0D1h
                db  11h
                db 0FFh
byte_1D26       db 0Ch
                db  12h
byte_1D28       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db  88h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    1
                db  80h
                db    3
                db    3
                db    1
                db 0D3h
                db    4
                db 0D1h
                db    4
                db 0D5h
                db    2
                db 0D4h
                db    6
                db 0E2h
                db    1
                db  1Ch
                db 0E1h
                db    5
                db    9
                db    1
                db 0D1h
                db    3
                db 0D3h
                db    2
                db 0D5h
                db    5
                db 0D3h
                db    4
                db 0D1h
                db    4
                db 0D5h
                db    2
                db 0D4h
                db    6
                db 0D4h
                db  11h
                db 0FFh
byte_1D56       db 0F0h
                db    0
                db  84h
                db 0E5h
                db  17h
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db    1
                db  11h
                db 0FFh
byte_1D68       db 6
                db  30h ; 0
byte_1D6A       db 0F0h
                db    0
                db 0E0h
                db    0
                db  83h
                db 0E5h
                db    7
                db 0D1h
                db    7
                db 0D1h
                db  0Ah
                db 0D4h
                db    2
                db    1
                db 0FFh
byte_1D79       db 0F0h
                db    0
                db  83h
                db 0E5h
                db    7
                db 0D2h
                db    1
                db 0D2h
                db    7
                db 0D3h
                db  0Bh
                db 0D1h
                db    7
                db 0FFh
byte_1D87       db 6
byte_1D88       db 0F0h
                db    0
                db 0E0h
                db    0
                db  83h
                db 0E5h
                db  17h
                db 0E2h
                db    1
                db  60h ; `
                db  60h ; `
                db    7
                db    7
                db    1
                db 0D5h
                db    7
                db 0E2h
                db    1
                db  60h ; `
                db  78h ; x
                db    7
                db    7
                db    1
                db  17h
                db 0FFh
byte_1DA1       db 0F0h
                db    0
                db  83h
                db 0E5h
                db  17h
                db 0E2h
                db    1
                db  80h
                db  80h
                db    7
                db    7
                db    1
                db 0D5h
                db    8
                db 0E2h
                db    1
                db  80h
                db 0A0h
                db    7
                db    7
                db    1
                db  18h
                db 0FFh
byte_1DB8       db 0Ch
                db  30h ; 0
byte_1DBA       db 0F0h
                db    0
                db 0E0h
                db    0
                db  81h
                db 0E5h
                db    7
                db 0D2h
                db  0Ch
                db 0FFh
byte_1DC4       db 60h
byte_1DC5       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db  88h
                db 0E5h
                db  1Fh
                db 0E2h
                db    1
                db    1
                db  80h
                db    3
                db    3
                db    1
                db 0D3h
                db    4
                db 0D1h
                db    4
                db 0D5h
                db    2
                db 0D4h
                db    6
                db 0E2h
                db    1
                db  1Ch
                db 0E1h
                db    5
                db    9
                db    1
                db 0D1h
                db    3
                db 0D3h
                db    2
                db 0D5h
                db    5
                db 0D3h
                db    4
                db 0D1h
                db    4
                db 0D5h
                db    2
                db 0D4h
                db    6
                db 0D3h
                db    5
                db 0D4h
                db  11h
                db 0FFh
byte_1DF5       db 0F0h
                db    0
                db  83h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db  60h ; `
                db  60h ; `
                db    7
                db    7
                db    1
                db 0D5h
                db  1Ah
                db 0E2h
                db    1
                db  60h ; `
                db  78h ; x
                db    7
                db    7
                db    1
                db  2Ah ; *
                db 0FFh
byte_1E0C       db 6
                db  30h ; 0
                db  48h ; H
byte_1E0F       db 0F0h
                db    0
                db 0E0h
                db  37h ; 7
                db  83h
                db 0E5h
                db    7
                db 0D3h
                db  0Ch
                db 0D5h
                db    6
                db 0D3h
                db  0Ah
                db 0D1h
                db    1
                db    1
                db 0FFh
byte_1E20       db 0F0h
                db    0
                db  84h
                db 0E5h
                db    7
                db    1
                db    1
                db 0D1h
                db    1
                db    1
                db    1
                db 0FFh
byte_1E2C       db 3
byte_1E2D       db 0F0h
                db    0
                db 0E0h
                db    0
                db  87h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    2
                db    2
                db  15h
                db  15h
                db    1
                db 0D3h
                db  0Ah
                db 0FFh
byte_1E3E       db 0F0h
                db    0
                db  84h
                db 0E5h
                db    7
                db 0D3h
                db  1Ah
                db 0FFh
byte_1E46       db 15h
                db  0Ch
byte_1E48       db 0F0h
                db    0
                db 0E0h
                db 0AFh
                db  87h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    1
                db 0FFh
                db    2
                db 0FBh
                db    1
                db 0D2h
                db    1
                db 0D1h
                db  16h
                db 0FFh
byte_1E5B       db 0F0h
                db    0
                db  82h
                db 0E5h
                db  17h
                db 0D2h
                db    7
                db 0D1h
                db  12h
                db 0FFh
byte_1E65       db 6
                db  0Ch
byte_1E67       db 0F0h
                db    0
                db 0E0h
                db 0AFh
                db  84h
                db 0E5h
                db    7
                db 0D1h
                db    1
                db 0FFh
byte_1E71       db 0F0h
                db    0
                db  83h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db 0FFh
                db  80h
                db    2
                db 0FFh
                db  81h
                db 0D1h
                db  18h
                db  18h
                db 0E7h
                db 0E2h
                db    0
                db 0D0h
                db  18h
                db 0FFh
byte_1E86       db 24h
                db  0Ch
byte_1E88       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db  80h
                db 0E5h
                db    7
                db 0D1h
                db    5
                db 0FFh
byte_1E92       db 0F0h
                db    0
                db  80h
                db 0E5h
                db    7
                db 0D2h
                db    7
                db 0FFh
byte_1E9A       db 6
byte_1E9B       db 0F0h
                db    0
                db 0E0h
                db 0AFh
                db  84h
                db 0E5h
                db    7
                db    1
                db 0E5h
                db  1Fh
                db    1
                db 0E5h
                db  2Fh ; /
                db  11h
                db 0FFh
byte_1EAA       db 0F0h
                db    0
                db  82h
                db 0E5h
                db    7
                db 0D5h
                db  21h ; !
                db  2Ah ; *
                db  2Ch ; ,
                db  25h ; %
                db 0D1h
                db  13h
                db 0FFh
byte_1EB7       db 6
                db  18h
                db    3
byte_1EBA       db 0F0h
                db    0
                db 0E0h
                db 0AFh
                db  84h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    2
                db    2
                db  0Bh
                db 0DDh
                db    1
                db 0D4h
                db    3
                db 0FFh
byte_1ECB       db 0F0h
                db    0
                db  88h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    2
                db    2
                db  0Bh
                db 0DDh
                db    1
                db 0D2h
                db    1
                db 0FFh
byte_1EDA       db 48h
byte_1EDB       db 0F0h
                db    0
                db 0E0h
                db  5Fh ; _
                db  84h
                db 0E5h
                db    7
                db 0D1h
                db    7
                db 0D1h
                db    8
                db 0D1h
                db    8
                db 0FFh
byte_1EE9       db 0F0h
                db    0
                db  83h
                db 0E5h
                db    7
                db 0D1h
                db  0Ah
                db 0D3h
                db    7
                db  82h
                db 0D2h
                db    4
                db 0FFh
byte_1EF6       db 0Ch
byte_1EF7       db 0F0h
                db    0
                db 0E0h
                db  87h
                db  83h
                db 0E5h
                db    7
                db 0D2h
                db    1
                db 0D1h
                db    5
                db 0FFh
byte_1F03       db 0F0h
                db    0
                db  83h
                db 0E5h
                db    7
                db 0D2h
                db    7
                db 0D1h
                db    3
                db 0FFh
byte_1F0D       db 6
byte_1F0E       db 0F0h
                db    0
                db 0E0h
                db    0
                db  83h
                db 0E5h
                db  17h
                db 0D1h
                db    1
                db  0Ch
                db    8
                db    3
                db    1
                db    5
                db    6
                db    8
                db  0Ah
                db  0Ch
                db    1
                db    3
                db    3
                db    5
                db    6
                db    7
                db 0FFh
byte_1F27       db 0F0h
                db    0
                db  84h
                db 0E5h
                db    7
                db 0D3h
                db  11h
                db  18h
                db  11h
                db  16h
                db  1Ah
                db  11h
                db  13h
                db  16h
                db 0FFh
byte_1F36       db 3
                db    6
byte_1F38       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db  85h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db    1
                db  40h ; @
                db    3
                db    3
                db    1
                db 0D3h
                db    4
                db 0D1h
                db    4
                db 0D5h
                db    2
                db 0D4h
                db    6
                db 0E2h
                db    1
                db  1Ch
                db  64h ; d
                db    5
                db    9
                db    1
                db 0D1h
                db    3
                db 0D3h
                db    2
                db 0D5h
                db    5
                db 0D3h
                db    4
                db 0D1h
                db    4
                db 0D5h
                db    2
                db 0D4h
                db    6
                db 0D3h
                db    5
                db 0D4h
                db  11h
                db 0FFh
byte_1F68       db 0F0h
                db    0
                db  84h
                db 0E5h
                db    7
                db 0E2h
                db    1
                db  60h ; `
                db  60h ; `
                db    7
                db    7
                db    1
                db 0D3h
                db  1Ah
                db 0E2h
                db    1
                db  60h ; `
                db  78h ; x
                db    7
                db    7
                db    1
                db  2Ah ; *
                db 0FFh
byte_1F7F       db 6
                db  30h ; 0
                db  48h ; H
byte_1F82       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  81h
                db 0E5h
                db    7
                db 0D4h
                db    1
                db 0E7h
                db 0D1h
                db  11h
                db 0FFh
byte_1F8F       db 0Ch
                db  18h
byte_1F91       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  83h
                db 0E5h
                db    7
                db 0D2h
                db    3
                db 0D1h
                db  0Ch
                db 0D1h
                db    6
                db  85h
                db 0D1h
                db  11h
                db 0FFh
byte_1FA2       db 0F0h
                db    0
                db  84h
                db 0E5h
                db    7
                db 0D2h
                db    1
                db 0D1h
                db    6
                db 0D1h
                db    1
                db 0D2h
                db  11h
                db 0FFh
byte_1FB0       db 2
                db  0Ch
byte_1FB2       db 0F0h
                db    0
                db 0E0h
                db  4Bh ; K
                db  88h
                db 0E5h
                db    7
                db 0D1h
                db  0Bh
                db  84h
                db 0D5h
                db  11h
                db 0FFh
byte_1FBF       db 0Ch
                db  18h
byte_1FC1       db 0F0h
                db    0
                db 0E0h
                db  9Bh
                db  83h
                db 0E2h
                db    1
                db 0FFh
                db 0FEh
                db 0FFh
                db    2
                db    1
                db 0D0h
                db 0E5h
                db    7
                db    3
                db 0E5h
                db  3Fh ; ?
                db  14h
                db 0E5h
                db  17h
                db  14h
                db 0E5h
                db  1Fh
                db  14h
                db 0E5h
                db  27h ; '
                db  14h
                db 0FFh
byte_1FDE       db 0Ch
                db    6
byte_1FE0       db 0F0h
                db    0
                db 0E0h
                db  37h ; 7
                db  88h
                db 0D3h
                db 0E5h
                db  0Fh
                db    3
                db  0Ch
                db 0FFh
byte_1FEB       db 0Ch
byte_1FEC       db 0F0h
                db    0
                db 0E0h
                db  7Fh ; 
                db  88h
                db 0E5h
                db  2Fh ; /
                db 0D3h
                db  0Ch
                db 0FFh
byte_1FF6       db 6
byte_1FF7       db 0F0h
                db    0
                db 0E0h
                db  7Fh ; 
                db  88h
                db 0E5h
                db  2Fh ; /
                db 0D3h
                db    6
                db 0FFh
byte_2001       db 0F0h
                db    0
                db 0E0h
                db  7Fh ; 
                db  88h
                db 0E5h
                db  2Fh ; /
                db 0D2h
                db    6
                db 0FFh
byte_200B       db 0F0h
                db    0
                db 0E0h
                db  7Fh ; 
                db  87h
                db 0E5h
                db  2Fh ; /
                db 0D4h
                db    6
                db 0FFh
byte_2015       db 0F0h
                db    0
                db 0E0h
                db  7Fh ; 
                db  87h
                db 0E5h
                db  2Fh ; /
                db 0D4h
                db  0Ch
                db 0FFh
byte_201F       db 0FFh
byte_2020       db 0Fh, 0, 2, 0, 0FAh, 0F7h, 6Fh, 8Fh, 0Eh
                db 0Fh, 10h, 0, 80h, 0F0h, 45h, 46h, 0D8h, 8Eh
                db 3Fh, 25h, 40h, 0, 0F4h, 0F6h, 0A3h, 88h, 0Eh
                db 24h, 22h, 14h, 4, 0F3h, 0E4h, 6, 8, 0
                db 2Fh, 5, 0, 0, 0F3h, 0F4h, 0Fh, 0FFh, 0Eh
                db 20h, 21h, 40h, 0, 0F8h, 0F3h, 4Fh, 3Fh, 0
                db 32h, 22h, 0CAh, 0, 0F5h, 0F5h, 5Fh, 0FFh, 0Eh
                db 4, 2, 86h, 0, 0F2h, 0F6h, 3Ch, 5Dh, 0
                db 24h, 22h, 8Ah, 0, 0F5h, 0F5h, 6Fh, 6Fh, 80h
byte_2071       db 0
byte_2072       db 2
byte_2073       db 0
byte_2074       db 0
byte_2075       db 0
byte_2076       db 35 dup(0)
byte_2099       db 35 dup(0)
byte_20BC       db 0
byte_20BD       db 0
byte_20BE       db 0
byte_20BF       db 0
word_20C0       dw 0
byte_20C2       db 0
byte_20C3       db 0
music_seg       ends


                end    start
