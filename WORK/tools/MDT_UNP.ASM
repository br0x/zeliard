.model tiny
.386
.code
                org     100h
start:
                mov     cx,31
all_loop:       push    cx
                mov     ah,cl
                dec     ah
                call    Fn1_LoadMDT_AH
                ; now dx=offset mdt_buffer, cx=length
                mov     si,offset mdt_buffer+1bh
                mov     di,offset mdt_buffer
                add     di,cx
                mov     word ptr beg_out,di
                mov     cx,word ptr mdt_buffer+2
                mov     ax,cx
locloop_4:      push    di
                dec     ax
                xor     dl,dl
loc_7:          call    step
                inc     si
                add     dl,bh
                add     bl,20h
loc_8:          mov     [di],bl
                inc     di
                or      ax,ax
                jnz     mid
                mov     byte ptr [di],0dh
                inc     di
                mov     byte ptr [di],0ah
                jmp     short mid0
mid:            inc     di
mid0:           add     di,word ptr mdt_buffer+2
                dec     bh
                jnz     loc_8
                cmp     dl,40h
                jb      loc_7
                or      ax,ax
                jnz     over
                mov     ax,word ptr mdt_buffer+2
over:           pop     di
                inc     di
                loop    locloop_4


                xor     cx,cx
                mov     dx,word ptr ds:ResourceSeekPos
                inc     dx
                inc     dx
                mov     ah,3Ch
                int     21h
                xchg    ax,bx
                mov     cx,word ptr mdt_buffer+2
                inc     cx
                inc     cx
                shl     cx,6
                mov     dx,word ptr beg_out
                mov     ah,40h
                int     21h             ;write cx bytes
                mov     ah,3Eh
                int     21h
                pop     cx
                loop    all_loop
                retn

DoResourceFunction proc near
		cmp	al, 0
		jnz	loc_347B
		jmp	Fn0_ExchangeScreenBuffers
; ���������������������������������������������������������������������������

loc_347B:
		push	di
		push	si
		push	ds
		push	es
		mov	word ptr cs:ResourceSeekPos, si
		mov	word ptr cs:ResourceSeekPos+2, ds
		mov	word ptr cs:file_buffer_addr, di
		mov	word ptr cs:file_buffer_addr+2,	es
		pushf
		cld
		cmp	al, 7
		jnb	loc_34A8
		dec	al
		xor	cx, cx
		mov	cl, al
		mov	bp, cx
		add	bp, bp
		call	cs:ResourceFunctions[bp]

loc_34A8:
		pop	bx
		pushf
		pop	ax
		and	bx, 0FFFEh
		and	ax, 1
		or	ax, bx
		push	ax
		popf
		pop	es
		pop	ds
		pop	si
		pop	di
		retn
DoResourceFunction endp

; ���������������������������������������������������������������������������
ResourceFunctions dw offset Fn1_LoadMDT_AH
		dw offset Fn2_UnpackResource
		dw offset Fn3_SeekReadResource
		dw offset Fn4_PrepareMusic
		dw offset Fn5_LoadMusic
		dw offset Fn6_SeekResource

; ��������������� S U B	R O U T	I N E ���������������������������������������


Fn1_LoadMDT_AH  proc near
                mov     word ptr cs:file_buffer_addr, offset mdt_buffer
		mov	word ptr cs:file_buffer_addr+2,	cs
		mov	al, ah
		or	al, al
		jns	loc_34DC
		and	al, 7Fh
		add	al, 20h	; ' '

loc_34DC:
		mov	cl, 0Bh
		mul	cl
		add	ax, offset _mp10_mdt

loc_34E3:
                mov     word ptr cs:ResourceSeekPos, ax
		mov	word ptr cs:ResourceSeekPos+2, cs
		jmp	Fn3_SeekReadResource
Fn1_LoadMDT_AH	endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


Fn2_UnpackResource proc	near
		les	di, cs:file_buffer_addr
		push	di
		push	es
		mov	word ptr cs:file_buffer_addr, 0
		mov	ax, cs
		add	ax, 3000h
		mov	es, ax
		mov	word ptr cs:file_buffer_addr+2,	ax
		call	Seek2RecordStart
		mov	bx, ax		; handle
		mov	cx, 1
		call	ReadCXbytes2FileBuffer
		mov	cx, word ptr cs:RecordLength
		dec	cx
		cmp	byte ptr es:word_329F0,	0
		jz	loc_354B
		mov	word ptr cs:file_buffer_addr, 0
		mov	cx, 4
		call	ReadCXbytes2FileBuffer
		mov	cx, es:word_329F0
		mov	dx, cx
		mov	al, 1
		mov	cx, 0
		mov	ah, 42h
		int	21h		; seek from current
		mov	cx, es:word_329F2

loc_354B:
		mov	word ptr cs:file_buffer_addr, 0
		call	ReadCXbytes2FileBuffer
		push	ax
		call	fclose_BX
		pop	dx
		pop	es
		assume es:nothing
		pop	di
		jmp	UnpackDXbytes@ResSeg
Fn2_UnpackResource endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


Fn4_PrepareMusic proc near
		mov	bl, ah
		xor	bh, bh
		add	bx, bx
		mov	si, cs:word_3590[bx]
		mov	ax, cs
		add	ax, 1000h
		mov	es, ax
		add	ax, 1000h
		mov	ds, ax
		mov	si, [si]
		mov	di, sword_animation_gfx
		mov	cx, 800h
		rep movsw
		mov	di, sword_animation_gfx
		mov	cx, 0Fh

loc_3586:
		add	word ptr es:[di], sword_animation_gfx
		inc	di
		inc	di
		loop	loc_3586
		retn
Fn4_PrepareMusic endp

; ���������������������������������������������������������������������������
word_3590	dw 1800h
		dw 1800h
		dw 1800h
		dw 1800h
		dw 1802h
		dw 1802h
		dw 1804h

; ��������������� S U B	R O U T	I N E ���������������������������������������


Fn5_LoadMusic	proc near
		les	di, cs:file_buffer_addr
		assume es:nothing
		push	di
		push	es
		mov	word ptr cs:file_buffer_addr, 0
		mov	ax, cs
		add	ax, 3000h
		mov	es, ax
		mov	word ptr cs:file_buffer_addr+2,	ax
		call	Seek2RecordStart
		mov	bx, ax
		mov	cx, 4
		call	ReadCXbytes2FileBuffer
		mov	cx, es:word_329F0
		test	cs:MT_SynthFlag, 0FFh
		jnz	loc_35DF
		mov	dx, cx
		mov	al, 1
		mov	cx, 0
		mov	ah, 42h
		int	21h		; DOS -	2+ - MOVE FILE READ/WRITE POINTER (LSEEK)
					; AL = method: offset from present location
		mov	cx, es:word_329F2

loc_35DF:
		pop	es
		assume es:nothing
		pop	di
		mov	word ptr cs:file_buffer_addr, di
		mov	word ptr cs:file_buffer_addr+2,	es
		call	ReadCXbytes2FileBuffer
		jmp	fclose_BX
Fn5_LoadMusic	endp

; ���������������������������������������������������������������������������

Fn0_ExchangeScreenBuffers:
		push	ds
		push	bx
		mov	ax, cs
		add	ax, 2000h
		mov	ds, ax
		push	cs
		pop	es
		mov	si, 9000h
		mov	di, 3000h
		mov	cx, 224*64

loc_3605:
		lodsw
		mov	dx, es:[di]
		stosw
		mov	[si-2],	dx
		loop	loc_3605
		pop	bx
		pop	ds
		assume ds:nothing
		jmp	word ptr cs:[bx]

; ��������������� S U B	R O U T	I N E ���������������������������������������


Fn6_SeekResource proc near
		call	Seek2RecordStart
		jnb	loc_361A
		retn
; ���������������������������������������������������������������������������

loc_361A:
		mov	bx, ax
		jmp	fclose_BX
Fn6_SeekResource endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


Fn3_SeekReadResource proc near
		call	Seek2RecordStart
		jnb	loc_3625
		retn
; ���������������������������������������������������������������������������

loc_3625:
		mov	cx, word ptr cs:RecordLength
		mov	bx, ax
		call	ReadCXbytes2FileBuffer
		jmp	fclose_BX
Fn3_SeekReadResource endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


Seek2RecordStart proc near
		mov	word ptr cs:RecordLength, 0FFFFh
		mov	word ptr cs:RecordLength+2, 0FFFFh
		lds	bx, cs:ResourceSeekPos
		mov	al, [bx]
		add	al, '1'
		mov	cs:ZelResNumber, al
		mov	cs:DistrDisk_Number, al
		inc	bx
		mov	al, [bx]
		inc	bx
		mov	dx, bx
		mov	cs:DirectoryIndex, al
		or	al, al
		jz	loc_3664
		push	cs
		pop	ds
		mov	dx, offset aZelres ; "zelres"

loc_3664:
		mov	ax, 3D00h
		int	21h		; open zelresX
		jnb	loc_36CC
		cmp	ax, 2
		jz	loc_3673
		jmp	file_error
; ���������������������������������������������������������������������������

loc_3673:

		push	cs
		pop	ds
		mov	ah, 0Dh
		int	21h		; DOS -	DISK RESET
		mov	dx, offset aDummy ; "dummy"
		mov	ah, 10h
		int	21h		; DOS -	CLOSE DISK FILE
					; DS:DX	-> FCB
					; Return: AL = 00h directory update successful
					; FFh file not found in	directory
		stc
		retn
; ���������������������������������������������������������������������������

loc_36CC:
		mov	cs:byte_1290D, 0
		test	cs:DirectoryIndex, 0FFh
		jnz	loc_36DB
		retn
; ���������������������������������������������������������������������������

loc_36DB:
		push	ax
		mov	bx, ax		; zelresX handle
		mov	al, cs:DirectoryIndex
		xor	ah, ah
		dec	ax
		add	ax, ax
		add	ax, ax
		mov	dx, ax
		mov	al, 0
		mov	cx, 0
		mov	ah, 42h
		int	21h		; seek from beginning
		jnb	loc_36F9
		jmp	file_error
; ���������������������������������������������������������������������������

loc_36F9:
		push	cs
		pop	ds
                mov     dx, offset ds:SeekLong
		mov	cx, 4
		mov	ah, 3Fh
		int	21h		; read Long Seek value for current record
		jnb	loc_370A
		jmp	file_error
; ���������������������������������������������������������������������������

loc_370A:
                mov     dx, word ptr ds:SeekLong
                mov     cx, word ptr ds:SeekLong+2
		mov	al, 0
		mov	ah, 42h
		int	21h		; seek from beginning
		push	cs
		pop	ds
		mov	dx, offset RecordLength
		mov	cx, 4
		mov	ah, 3Fh
		int	21h		; DOS -	2+ - READ FROM FILE WITH HANDLE
					; BX = file handle, CX = number	of bytes to read
					; DS:DX	-> buffer
		jnb	loc_3729
		jmp	file_error
; ���������������������������������������������������������������������������

loc_3729:
		pop	ax
		retn
Seek2RecordStart endp

; ���������������������������������������������������������������������������
aZelres		db 'zelres'
ZelResNumber	db '1'
a_sar		db '.sar',0
aPleaseInsertDisk db '    Please',0Dh,' insert DISK'
DistrDisk_Number db '1'
aAndPressAnyKey	db 0Dh,'      and',0Dh,' press any key'
		db 0FFh
DirectoryIndex	db 0
SeekLong	dd 0
aDummy		db 'dummy',0

; ��������������� S U B	R O U T	I N E ���������������������������������������


ReadCXbytes2FileBuffer proc near
		lds	dx, cs:file_buffer_addr
		assume ds:nothing
		mov	ah, 3Fh
		int	21h		; DOS -	2+ - READ FROM FILE WITH HANDLE
					; BX = file handle, CX = number	of bytes to read
					; DS:DX	-> buffer
		jnb	locret_3782
		jmp	file_error
; ���������������������������������������������������������������������������

locret_3782:
		retn
ReadCXbytes2FileBuffer endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


fclose_BX	proc near
		mov	ah, 3Eh
		int	21h		; DOS -	2+ - CLOSE A FILE WITH HANDLE
					; BX = file handle
		jnb	locret_378C
		jmp	file_error
; ���������������������������������������������������������������������������

locret_378C:
		retn
fclose_BX	endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


UnpackDXbytes@ResSeg proc near
		push	ds
		mov	ax, cs
		add	ax, 3000h
		mov	ds, ax
		mov	si, 0
		call	UnpackDXbytes@DS_SI
		pop	ds
		assume ds:nothing
		retn
UnpackDXbytes@ResSeg endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


UnpackDXbytes@DS_SI proc near
		xor	bx, bx
		lodsb			; read packing method
		dec	dx
		and	al, 7
		mov	bl, al
		add	bx, bx
		jmp	word ptr cs:pack_methods[bx]
; ���������������������������������������������������������������������������
pack_methods:
		dw offset Movsb_DX_Times
		dw offset method1
		dw offset method2
		dw offset method3
		dw offset method4
		dw offset method5
		dw offset method6
		dw offset method7
; ���������������������������������������������������������������������������

Movsb_DX_Times:
		mov	cx, dx
		rep movsb
		retn
; ���������������������������������������������������������������������������

method1:
		mov	bp, si
		call	FindFF_terminator

loc_37C6:
		lodsb
		call	sub_37D0
		rep stosb
		dec	dx
		jnz	loc_37C6
		retn
UnpackDXbytes@DS_SI endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


sub_37D0	proc near
		push	bp
		mov	ah, al
		and	ah, 0F0h
		mov	cx, 1

loc_37D9:
		test	byte ptr ds:[bp+0], 0Fh
		jnz	loc_37F6
		cmp	ah, ds:[bp+0]
		jz	loc_37EA
		inc	bp
		inc	bp
		jmp	short loc_37D9
; ���������������������������������������������������������������������������

loc_37EA:
		mov	cl, al
		mov	al, ds:[bp+1]
		and	cx, 0Fh
		add	cx, 2

loc_37F6:
		pop	bp
		retn
sub_37D0	endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


FindFF_terminator proc near
		lodsb
		dec	dx
		cmp	al, 0FFh
		jnz	loc_37FF
		retn
; ���������������������������������������������������������������������������

loc_37FF:
		inc	si

loc_3800:
		dec	dx
		jmp	short FindFF_terminator
FindFF_terminator endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


method2		proc near
		lodsb
		dec	dx
		mov	ah, al

loc_3807:
		lodsb
		mov	cx, 1
		mov	bl, al
		and	bl, 0F0h
		cmp	bl, ah
		jnz	loc_381E
		mov	cl, al
		and	cx, 0Fh
		add	cx, 3
		lodsb
		dec	dx

loc_381E:
		rep stosb
		dec	dx
		jnz	loc_3807
		retn
method2		endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


method3		proc near
		mov	bp, si
		call	FindFF_terminator

loc_3829:
		lodsb
		call	sub_3833
		rep stosb
		dec	dx
		jnz	loc_3829
		retn
method3		endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


sub_3833	proc near
		push	bp
		mov	ah, al
		and	ah, 0Fh
		mov	cx, 1

loc_383C:
		test	byte ptr ds:[bp+0], 0F0h
		jnz	loc_3861
		cmp	ah, ds:[bp+0]
		jz	loc_384D
		inc	bp
		inc	bp
		jmp	short loc_383C
; ���������������������������������������������������������������������������

loc_384D:
		shr	al, 1
		shr	al, 1
		shr	al, 1
		shr	al, 1
		mov	cl, al
		mov	al, ds:[bp+1]
		and	cx, 0Fh
		add	cx, 2

loc_3861:
		pop	bp
		retn
sub_3833	endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


method4		proc near
		lodsb
		dec	dx
		mov	ah, al

loc_3867:
		lodsb
		mov	cx, 1
		mov	bl, al
		and	bl, 0Fh
		cmp	bl, ah
		jnz	loc_3886
		shr	al, 1
		shr	al, 1
		shr	al, 1
		shr	al, 1
		mov	cl, al
		and	cx, 0Fh
		add	cx, 3
		lodsb
		dec	dx

loc_3886:
		rep stosb
		dec	dx
		jnz	loc_3867
		retn
method4		endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


method5		proc near
		lodsb
		mov	cx, 1
		cmp	[si], al
		jnz	loc_38A4
		mov	cl, [si+1]
		and	cx, 0FFh
		add	cx, 2
		add	si, 2
		sub	dx, 2

loc_38A4:
		rep stosb
		dec	dx
		jnz	method5
		retn
method5		endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


method6		proc near
		mov	bp, si

loc_38AC:
		lodsw
		sub	dx, 2
		cmp	ax, 0FFFFh
		jnz	loc_38AC

loc_38B5:
		lodsb
		call	sub_38BF
		rep stosb
		dec	dx
		jnz	loc_38B5
		retn
method6		endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


sub_38BF	proc near
		push	bp
		mov	cx, 1

loc_38C3:
		cmp	word ptr ds:[bp+0], 0FFFFh
		jz	loc_38E3
		cmp	al, ds:[bp+0]
		jz	loc_38D4
		inc	bp
		inc	bp
		jmp	short loc_38C3
; ���������������������������������������������������������������������������

loc_38D4:
		lodsb
		dec	dx
		mov	cl, al
		mov	al, ds:[bp+1]
		and	cx, 0FFh
		add	cx, 2

loc_38E3:
		pop	bp
		retn
sub_38BF	endp


; ��������������� S U B	R O U T	I N E ���������������������������������������


method7		proc near
		lodsb
		dec	dx
		mov	ah, al

loc_38E9:
		lodsb
		mov	cx, 1
		cmp	al, ah
		jnz	loc_3901
		lodsb
		mov	cl, al
		lodsb
		xchg	al, cl
		and	cx, 0FFh
		add	cx, 3
		sub	dx, 2

loc_3901:
		rep stosb
		dec	dx
		jnz	loc_38E9
		retn
method7		endp

file_error	proc near
		lds	dx, cs:ResourceSeekPos
                mov     ah,4Ch
                int     21h
file_error	endp


step            proc    near
                mov     bl,[si]         ; 0,4,8,C x
                and     bl,0c0h
                rol     bl,1
                rol     bl,1
                xor     bh,bh
                add     bx,bx
                jmp     word ptr base[bx]
base:           dw      case0,case1,case2,case3
case0:          mov     bh,[si]         ; 00...... ........
                inc     bh              ; =bh      =bl
                inc     si
                mov     bl,[si]
                retn
case1:          mov     bl,[si]         ; 01......
                mov     bh,bl
                shr     bh,1            ;=bh-2
                shr     bh,1            ;    =bl-1
                shr     bh,1
                shr     bh,1
                and     bh,3
                add     bh,2
                and     bl,0fh
                inc     bl
                retn
case2:          mov     bh,[si]         ; 10......
                and     bh,3fh          ;    =bh
                xor     bl,bl           ; bl=0
                retn
case3:          mov     bl,[si]         ; 11......
                and     bl,3fh          ;    =bl
                mov     bh,1            ; bh=1
                retn
step            endp


; ���������������������������������������������������������������������������
ResourceSeekPos	dd 0
file_buffer_addr dd 0
RecordLength	dd 0
_mp10_mdt       db    2 ;
		db  15h	;  
aMp10_mdt	db 'MP10.MDT',0
_mp1d_mdt	db    2	;  
		db  16h	;  
aMp1d_mdt	db 'MP1D.MDT',0
_mp20_mdt	db    2	;  
		db  17h	;  
aMp20_mdt	db 'MP20.MDT',0
_mp21_mdt	db    2	;  
		db  18h	;  
aMp21_mdt	db 'MP21.MDT',0
_mp2d_mdt	db    2	;  
		db  19h	;  
aMp2d_mdt	db 'MP2D.MDT',0
_mp30_mdt	db    2	;  
		db  1Ah	;  
aMp30_mdt	db 'MP30.MDT',0
_mp31_mdt	db    2	;  
		db  1Bh	;  
aMp31_mdt	db 'MP31.MDT',0
_mp3d_mdt	db    2	;  
		db  1Ch	;  
aMp3d_mdt	db 'MP3D.MDT',0
_mp40_mdt	db    2	;  
		db  1Dh	;  
aMp40_mdt	db 'MP40.MDT',0
_mp41_mdt	db    2	;  
		db  1Eh	;  
aMp41_mdt	db 'MP41.MDT',0
_mp4d_mdt	db    2	;  
		db  1Fh	;  
aMp4d_mdt	db 'MP4D.MDT',0
_mp50_mdt	db    2	;  
		db  20h	;  
aMp50_mdt	db 'MP50.MDT',0
_mp51_mdt	db    2	;  
		db  21h	; !
aMp51_mdt	db 'MP51.MDT',0
_mp5d_mdt	db    2	;  
		db  22h	; "
aMp5d_mdt	db 'MP5D.MDT',0
_mp60_mdt	db    2	;  
		db  23h	; #
aMp60_mdt	db 'MP60.MDT',0
_mp61_mdt	db    2	;  
		db  24h	; $
aMp61_mdt	db 'MP61.MDT',0
_mp62_mdt	db    2	;  
		db  25h	; %
aMp62_mdt	db 'MP62.MDT',0
_mp6d_mdt	db    2	;  
		db  26h	; &
aMp6d_mdt	db 'MP6D.MDT',0
_mp70_mdt	db    2	;  
		db  27h	; '
aMp70_mdt	db 'MP70.MDT',0
_mp71_mdt	db    2	;  
		db  28h	; (
aMp71_mdt	db 'MP71.MDT',0
_mp72_mdt	db    2	;  
		db  29h	; )
aMp72_mdt	db 'MP72.MDT',0
_mp73_mdt	db    2	;  
		db  2Ah	; *
aMp73_mdt	db 'MP73.MDT',0
_mp7d_mdt	db    2	;  
		db  2Bh	; +
aMp7d_mdt	db 'MP7D.MDT',0
_mp80_mdt	db    2	;  
		db  2Ch	; ,
aMp80_mdt	db 'MP80.MDT',0
_mp81_mdt	db    2	;  
		db  2Dh	; -
aMp81_mdt	db 'MP81.MDT',0
_mp82_mdt	db    2	;  
		db  2Eh	; .
aMp82_mdt	db 'MP82.MDT',0
_mp83_mdt	db    2	;  
		db  2Fh	; /
aMp83_mdt	db 'MP83.MDT',0
_mp84_mdt	db    2	;  
		db  30h	; 0
aMp84_mdt	db 'MP84.MDT',0
_mp8d_mdt	db    2	;  
		db  31h	; 1
aMp8d_mdt	db 'MP8D.MDT',0
_mp90_mdt	db    2	;  
		db  32h	; 2
aMp90_mdt	db 'MP90.MDT',0
_mpa0_mdt	db    2	;  
		db  33h	; 3
aMpa0_mdt	db 'MPA0.MDT',0

beg_out         dw      ?
MT_SynthFlag    db 0
byte_1290D	db 0
word_329F0	dw ?
word_329F2	dw ?
mdt_buffer      dw 0

                end     start
