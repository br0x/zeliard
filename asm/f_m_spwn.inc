
; ---------------------------------------------------------------------------
byte_8C79       db 0, 0, 1, 0, 0, 1, 1, 1
sequences0      dw offset byte_8C99
                dw offset byte_8CA5
                dw offset byte_8CBD
                dw offset byte_8CE5
                dw offset byte_8CFD
                dw offset byte_8D01
sequences1      dw offset byte_8C99
                dw offset byte_8CB1
                dw offset byte_8CD1
                dw offset byte_8CF1
                dw offset byte_8CFD
                dw offset byte_8D0D
byte_8C99       db 67h, 68h, 69h, 6Ah, 6Bh, 6Ch, 6Dh, 6Eh, 6Fh, 70h, 71h, 72h
byte_8CA5       db 67h, 68h, 69h, 6Ah, 6Bh, 6Ch, 6Dh, 6Eh, 6Fh, 70h, 71h, 72h
byte_8CB1       db 73h, 74h, 75h, 76h, 77h, 78h, 79h, 7Ah, 7Bh, 7Ch, 7Dh, 7Eh
byte_8CBD       db 67h, 68h, 69h, 6Ah, 6Fh, 70h, 71h, 72h, 73h, 74h, 75h, 76h, 77h, 78h, 79h, 7Ah, 7Bh, 7Ch, 7Dh, 7Eh
byte_8CD1       db 6Bh, 6Ch, 6Dh, 6Eh, 6Fh, 70h, 71h, 72h, 73h, 74h, 75h, 76h, 77h, 78h, 79h, 7Ah, 7Bh, 7Ch, 7Dh, 7Eh
byte_8CE5       db 67h, 68h, 69h, 6Ah, 6Bh, 6Ch, 6Dh, 6Eh, 6Fh, 70h, 71h, 72h
byte_8CF1       db 73h, 74h, 75h, 76h, 77h, 78h, 79h, 7Ah, 7Bh, 7Ch, 7Dh, 7Eh
byte_8CFD       db 73h, 74h, 75h, 76h
byte_8D01       db 67h, 68h, 69h, 6Ah, 6Bh, 6Ch, 6Dh, 6Eh, 6Fh, 70h, 71h, 72h
byte_8D0D       db 73h, 74h, 75h, 76h, 77h, 78h, 79h, 7Ah, 7Bh, 7Ch, 7Dh, 7Eh


; ===========================================================================
; monsters_spawning
; Main monster AI tick (called once per frame from main_update_render).
; Boss/Jashiin caverns: delegate entirely to Monster_AI_proc (eai binary).
; Regular caverns:
;   Iterates the monsters_table (each 16-byte monster struct).
;   For each monster:
;     - Skip if high byte of currX == 0xFF (stationary item, not a creature).
;     - Call is_in_proximity_window: if monster is outside ±35 columns, skip.
;     - Set m_x_rel = BL (relative X position in proximity window).
;     - Write monster index | 0x80 to proximity map (primary + second layer).
;     - If monster.state_flags bit 4: also stamp 2 rows below (big monster lower half).
;     - If state_flags bit 5 is clear: call monster_activation (spawn check).
;     - Else: increment monster.counter, call Monster_AI_proc on activation.
;
; MONSTER TABLE ENTRY (16 bytes, monster struc from dungeon.inc):
;   [0..1] currX     : absolute map X (0xFFFF = end of table)
;   [2]    currY     : absolute map Y (0-63)
;   [3]    m_x_rel   : relative X in proximity window (0-34), 0xFF = out of range
;   [4]    flags     : monster type / behavior flags
;   [5]    ai_flags  : AI state bits (bit6=spell-hit, bits4:0=spell-type)
;   [6]    anim_counter
;   [7]    state_flags: bit4=big monster, bit5=active-spawned, bit7=state-active
;   [8..9] spwnX     : respawn X (0xFFFF = no respawn)
;   [A]    spwnY     : respawn Y
;   [B]    type_     : original type byte for respawn
;   [C]    counter   : general purpose counter
;   [D]    save_addr : savegame achievement address (for items)
;   [E..F] ai_state/hp
; ===========================================================================
monsters_spawning proc near   
                mov     si, ds:monsters_table_addr
                mov     al, ds:is_boss_cavern
                or      al, ds:is_jashiin_cavern
                jz      short loc_8D2B
                jmp     cs:Monster_AI_proc
; ---------------------------------------------------------------------------

loc_8D2B:        
                mov     byte ptr ds:monster_index, 0

next_monster2:    
                mov     ax, [si+monster.currX]
                cmp     ax, 0FFFFh      ; end-monsters-marker
                jnz     short loc_8D38
                retn                    ; all monsters processed
; ---------------------------------------------------------------------------

loc_8D38:        
                mov     [si+monster.m_x_rel], 0FFh
                cmp     ah, 0FFh
                jz      short skip
                call    is_in_proximity_window ; * Calculates distance to hero and checks if within a 35-unit range.
                                        ;  * Accounts for world-wrapping (map edges).
                                        ;  * * @param monster_x The X coordinate of the monster (AX)
                                        ;  * @return Positive value (35 - distance) if in range,
                                        ;  * Sets Carry Flag (CF=1) if out of range.
                jb      short skip
                mov     [si+monster.m_x_rel], bl
                call    place_monster_in_proximity_and_run_ai
                cmp     byte ptr [si+1], 0FFh ; monster x coord high byte; ff => stationary item
                jz      short skip
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     bl, ds:monster_index
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al ; proximity map is designed to keep only one item
                                        ; at given address. So when we need to put other object,
                                        ; when position is already occupied by monster,
                                        ; we use second layer: 128 bytes of additional buffer
                                        ; (1 byte per monster id)
                test    [si+monster.flags], 10001b
                jnz     short skip
                test    [si+monster.state_flags], 10000b
                jz      short skip
                xchg    si, di
                add     si, 72
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                mov     bl, ds:monster_index
                inc     bl
                xor     bh, bh
                mov     al, bl
                or      al, 80h
                xchg    al, [di]
                mov     ds:proximity_second_layer[bx], al ; proximity map is designed to keep only one item
                                        ; at given address. So when we need to put other object,
                                        ; when position is already occupied by monster,
                                        ; we use second layer: 128 bytes of additional buffer
                                        ; (1 byte per monster id)

skip:            
                test    [si+monster.state_flags], 100000b
                jnz     short loc_8DA5
                mov     al, [si+monster.counter]
                inc     al
                jz      short loc_8DA0
                mov     [si+monster.counter], al

loc_8DA0:        
                jnz     short loc_8DA5
                call    monster_activation

loc_8DA5:        
                inc     byte ptr ds:monster_index
                add     si, 16
                jmp     short next_monster2
monsters_spawning endp


; ===========================================================================
; place_monster_in_proximity_and_run_ai
; Places a monster in the proximity map and optionally runs its AI.
;
; 1. Converts currX/currY to proximity map address (coords_in_ax_to_proximity).
; 2. Processes the 'spell target' flag (ai_flags bit 6 → flags bit 5).
; 3. Reads proximity_second_layer[monster_index] and writes it to [di]
;    (preserves any existing tile if second layer was occupied).
; 4. For big monsters (state_flags bit 4): also stamps [di + 2*36].
;
; Item/monster type switch (flags bits 4:0):
;   0x00-0x0F: regular monster → call Monster_AI_proc
;   0x10 (flag_10): drop-item trigger (falling item / platform drop)
;   0x11 (flag_11): projectile spawner (aims at hero Y, triggers shot at range)
;   0x12 (flag_12): delay animation
;   0x13 (flag_13): item pickup — contact collision check
;   0x14/0x15/0x1B (flag_14): almas orb — falling, picked up on contact
;     almas count: flags&0x0F: 4→1 almas, 5→10 almas, else→100 almas
;   0x16 (flag_16): ordinary key pickup
;   0x17 (flag_17): lion's head key pickup
;   0x18 (flag_18): small potion (red) → healing_potion_timer += 0x0A
;   0x19 (flag_19): large potion (blue) → healing_potion_timer += heroMaxHP/8
;   0x1A (flag_1a): shoes pickup (Ruzeria/Pirika/Silkarn based on cavern_level-4)
;   0x1B: see 0x14
;   0x1C (flag_1c): dungeon sign → render_cavern_signs
;   0x1D (flag_1d): hero's crest pickup
;   0x1E (flag_1e): Feruza shoes pickup
;   0x00-0x0F (default, flag_10 handled above): chest animation dispatch:
;     chest sub-types: 50g / 100g / empty / 500g / 1000g / glory crest / enchantment sword
;
; On item pickup (loc_914C): set currX high byte to 0xFF00 (mark as collected),
; optionally write the item's save achievement bitmask to savegame.
;
; SPRITE NOTE: Items use enp?.grp 2×2 tiles. The frame to display is encoded
; in monster.flags low nibble (see ENP1_FRAMES lookup in grp_viewer.py).
; ===========================================================================
place_monster_in_proximity_and_run_ai proc near
                mov     ax, word ptr [si+monster.currY]
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                mov     al, [si+monster.ai_flags]
                and     al, 0DFh
                test    al, 40h
                jz      short loc_8DC7
                test    [si+monster.flags], 20h
                jnz     short loc_8DC5
                or      al, 20h

loc_8DC5:        
                and     al, 0BFh

loc_8DC7:        
                mov     [si+monster.ai_flags], al
                mov     al, ds:monster_index
                mov     bx, offset proximity_second_layer ; proximity map is designed to keep only one item
                                        ; at given address. So when we need to put other object,
                                        ; when position is already occupied by monster,
                                        ; we use second layer: 128 bytes of additional buffer
                                        ; (1 byte per monster id)
                xlat
                mov     [di], al
                test    [si+monster.flags], 11h
                jnz     short loc_8DF1
                test    [si+monster.state_flags], 10h
                jz      short loc_8DF1
                xchg    si, di
                add     si, 2*36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    si, di
                mov     al, ds:monster_index
                inc     al
                xlat
                mov     [di], al

loc_8DF1:        
                test    [si+monster.flags], 11000b
                jnz     short loc_8DFC
                jmp     cs:Monster_AI_proc
; ---------------------------------------------------------------------------

loc_8DFC:        
                jmp     short $+2
; ---------------------------------------------------------------------------

loc_8DFE:        
                xor     bh, bh
                mov     bl, [si+monster.flags]
                and     bl, 1Fh
                sub     bl, 10h
                jnb     short loc_8E0E
                jmp     loc_90E6
; ---------------------------------------------------------------------------

loc_8E0E:        
                add     bx, bx          ; switch 15 cases
                jmp     ds:jpt_8E10[bx] ; switch jump
; ---------------------------------------------------------------------------
jpt_8E10        dw offset flag_10
                dw offset flag_11
                dw offset flag_12
                dw offset flag_13
                dw offset flag_14_15_1b
                dw offset flag_14_15_1b
                dw offset flag_16
                dw offset flag_17
                dw offset flag_18
                dw offset flag_19
                dw offset flag_1a
                dw offset flag_14_15_1b
                dw offset flag_1c
                dw offset flag_1d
                dw offset flag_1e
; ---------------------------------------------------------------------------

flag_10:         
                test    [si+monster.ai_timer], 1 ; jumptable 00008E10 case 0
                jnz     short loc_8E54
                test    [si+monster.ai_flags], 100000b
                jnz     short loc_8E3F
                retn
; ---------------------------------------------------------------------------

loc_8E3F:        
                mov     byte ptr ds:soundFX_request, 18
                and     [si+monster.ai_flags], 10010000b
                and     [si+monster.flags], 1111111b
                or      [si+monster.flags], 1100000b
                or      [si+monster.ai_timer], 1

loc_8E54:        
                add     [si+monster.anim_counter], 80h
                jb      short loc_8E5B
                retn
; ---------------------------------------------------------------------------

loc_8E5B:        
                inc     [si+monster.anim_counter]
                cmp     [si+monster.anim_counter], 4
                jnb     short loc_8E65
                retn
; ---------------------------------------------------------------------------

loc_8E65:        
                mov     [si+monster.anim_counter], 0
                mov     al, [si+monster.ai_state]
                or      al, al
                jnz     short loc_8E73
                jmp     loc_914C
; ---------------------------------------------------------------------------

loc_8E73:        
                test    al, 10h
                jz      short loc_8E81
                or      al, 60h
                or      [si+monster.state_flags], 80h
                mov     [si+monster.counter], 0

loc_8E81:        
                mov     [si+monster.flags], al
                and     [si+monster.ai_flags], 80h
                mov     [si+monster.ai_state], 0
                retn
; ---------------------------------------------------------------------------

flag_11:         
                test    [si+monster.ai_timer], 1 ; jumptable 00008E10 case 1
                jnz     short loc_8ECA
                mov     ah, [si+monster.currY]
                sub     ah, 3
                and     ah, 3Fh
                cmp     ah, ds:hero_y_absolute
                jz      short loc_8EA3
                retn
; ---------------------------------------------------------------------------

loc_8EA3:        
                mov     al, ds:hero_x_in_viewport
                add     al, 3
                mov     ah, ds:facing_direction
                and     ah, 1
                add     ah, ah
                add     al, ah
                mov     cx, 2

loc_8EB6:        
                cmp     al, [si+monster.m_x_rel]
                jz      short loc_8EC0
                inc     al
                loop    loc_8EB6
                retn
; ---------------------------------------------------------------------------

loc_8EC0:        
                mov     byte ptr ds:soundFX_request, 18
                or      [si+monster.ai_timer], 1
                retn
; ---------------------------------------------------------------------------

loc_8ECA:        
                and     [si+monster.flags], 7Fh
                call    move_monster_S
                add     [si+monster.anim_counter], 80h
                jb      short loc_8ED8
                retn
; ---------------------------------------------------------------------------

loc_8ED8:        
                inc     [si+monster.anim_counter]
                cmp     [si+monster.anim_counter], 4
                jnb     short loc_8EE2
                retn
; ---------------------------------------------------------------------------

loc_8EE2:        
                mov     [si+monster.anim_counter], 0
                jmp     loc_914C
; ---------------------------------------------------------------------------

flag_12:         
                inc     [si+monster.anim_counter] ; jumptable 00008E10 case 2
                cmp     [si+monster.anim_counter], 3
                jz      short loc_8EF3
                retn
; ---------------------------------------------------------------------------

loc_8EF3:        
                jmp     loc_914C
; ---------------------------------------------------------------------------

flag_13:         
                call    check_monster_aligned_to_hero_and_tick ; jumptable 00008E10 case 3
                jnb     short loc_8EFC
                retn
; ---------------------------------------------------------------------------

loc_8EFC:        
                mov     byte ptr ds:soundFX_request, 20
                test    [si+monster.anim_counter], 0Fh
                jnz     short chest
                mov     al, [si+monster.ai_state]
                test    al, 10h
                jz      short loc_8F18
                or      al, 60h
                or      [si+monster.state_flags], 80h
                mov     [si+monster.counter], 0

loc_8F18:        
                mov     [si+monster.flags], al
                mov     [si+monster.ai_state], 0
                retn
; ---------------------------------------------------------------------------

chest:           
                call    loc_914C
                mov     bl, [si+monster.anim_counter]
                and     bl, 0Fh         ; 1..8
                dec     bl
                add     bl, bl
                xor     bh, bh
                jmp     ds:off_8F33[bx]
; ---------------------------------------------------------------------------
off_8F33        dw offset got_50_gold
                dw offset got_100_gold
                dw offset loc_8F59
                dw offset got_500_gold
                dw offset got_1000_gold
                dw offset got_crest_of_glory
                dw offset loc_8F83
; ---------------------------------------------------------------------------

got_50_gold:     
                mov     dx, offset you_get_50_gold_str
                call    render_notification_string
                mov     ax, 50
                jmp     hero_got_gold   ; ax: gold to add
; ---------------------------------------------------------------------------

got_100_gold:    
                mov     dx, offset you_get_100_gold_str
                call    render_notification_string
                mov     ax, 100
                jmp     hero_got_gold   ; ax: gold to add
; ---------------------------------------------------------------------------

loc_8F59:        
                mov     dx, offset nothing_in_the_box_str
                jmp     render_notification_string
; ---------------------------------------------------------------------------

got_500_gold:    
                mov     dx, offset you_get_500_gold_str
                call    render_notification_string
                mov     ax, 500
                jmp     hero_got_gold   ; ax: gold to add
; ---------------------------------------------------------------------------

got_1000_gold:   
                mov     dx, offset you_get_1000_gold_str
                call    render_notification_string
                mov     ax, 1000
                jmp     hero_got_gold   ; ax: gold to add
; ---------------------------------------------------------------------------

got_crest_of_glory:       
                mov     dx, offset you_get_glory_crest_str
                call    render_notification_string
                mov     byte ptr ds:crest_of_glory, 0FFh
                retn
; ---------------------------------------------------------------------------

loc_8F83:        
                mov     dx, offset get_enchantment_sword_str
                call    render_notification_string
                push    si
                call    cs:Flush_Ui_Element_If_Dirty_proc
                mov     byte ptr ds:sword_type, SWORD_ENCHANTMENT
                mov     al, 6
                mov     bx, 18ABh
                call    cs:Render_Sword_Item_Sprite_20x18_proc
                mov     ah, ds:sword_type
                mov     al, 4           ; fn4_load_sword_graphics
                call    cs:res_dispatcher_proc
                pop     si
                retn
; ---------------------------------------------------------------------------

flag_14_15_1b:   
                call    move_monster_S  ; jumptable 00008E10 cases 4,5,11
                inc     [si+monster.anim_counter]
                and     [si+monster.anim_counter], 3
                call    check_monster_aligned_to_hero_and_tick
                jnb     short almas_picked_up
                retn
; ---------------------------------------------------------------------------

almas_picked_up: 
                mov     byte ptr ds:soundFX_request, 16
                mov     al, [si+monster.flags]
                and     al, 0Fh         ; monster almas price:
                                        ; 4 => 1 almas
                                        ; 5 => 10 almas
                                        ; else => 100 almas
                cmp     al, 4
                jnz     short loc_8FD2
                mov     ax, 1
                call    hero_got_almas  ; ax: almas to add
                jmp     loc_914C
; ---------------------------------------------------------------------------

loc_8FD2:        
                cmp     al, 5
                jnz     short got_100_almas
                mov     ax, 10
                call    hero_got_almas  ; ax: almas to add
                jmp     loc_914C
; ---------------------------------------------------------------------------

got_100_almas:   
                mov     ax, 100
                call    hero_got_almas  ; ax: almas to add
                jmp     loc_914C
; ---------------------------------------------------------------------------

flag_16:         
                mov     dx, offset you_get_key_str ; jumptable 00008E10 case 6
                call    loc_90D3
                jnb     short got_ordinary_key
                retn
; ---------------------------------------------------------------------------

got_ordinary_key:
                inc     byte ptr ds:keys_amount
                jmp     loc_914C
; ---------------------------------------------------------------------------

flag_17:         
                mov     dx, offset get_lions_head_key_str ; jumptable 00008E10 case 7
                call    loc_90D3
                jnb     short got_lion_head_key
                retn
; ---------------------------------------------------------------------------

got_lion_head_key:        
                inc     byte ptr ds:lion_head_keys
                jmp     loc_914C
; ---------------------------------------------------------------------------

flag_18:         
                call    check_monster_aligned_to_hero_and_tick ; jumptable 00008E10 case 8
                jnb     short loc_900E
                retn
; ---------------------------------------------------------------------------

loc_900E:        
                mov     dx, offset you_have_recovered_str
                call    render_notification_string
                add     byte ptr ds:healing_potion_timer, 10
                jmp     loc_914C
; ---------------------------------------------------------------------------

flag_19:         
                call    move_monster_S  ; jumptable 00008E10 case 9
                call    check_monster_aligned_to_hero_and_tick
                jnb     short loc_9025
                retn
; ---------------------------------------------------------------------------

loc_9025:        
                mov     dx, offset you_have_recovered_full_str
                call    render_notification_string
                mov     ax, ds:heroMaxHp
                shr     ax, 1
                shr     ax, 1
                shr     ax, 1
                inc     ax
                add     ds:healing_potion_timer, ax
                jmp     loc_914C
; ---------------------------------------------------------------------------

flag_1c:         
                mov     [si+monster.counter], 0 ; jumptable 00008E10 case 12
                test    [si+monster.ai_state], 1
                jnz     short loc_9070
                call    check_monster_aligned_to_hero_and_tick
                jnb     short loc_904C
                retn
; ---------------------------------------------------------------------------

loc_904C:        
                mov     byte ptr ds:soundFX_request, 17
                or      [si+monster.state_flags], 80h
                or      [si+monster.ai_state], 1
                mov     [si+monster.ai_timer], 0EBh
                mov     bl, [si+monster.anim_counter] ; sign index
                add     bl, bl
                xor     bh, bh
                add     bx, ds:cavern_signs_rendering_info
                push    si
                mov     si, [bx]
                call    render_cavern_signs
                pop     si
                retn
; ---------------------------------------------------------------------------

loc_9070:        
                test    [si+monster.ai_timer], 0FFh
                jz      short loc_907A
                inc     [si+monster.ai_timer]
                retn
; ---------------------------------------------------------------------------

loc_907A:        
                and     [si+monster.ai_state], 0FEh
                retn
; ---------------------------------------------------------------------------

flag_1d:         
                mov     dx, offset get_heros_crest_str ; jumptable 00008E10 case 13
                call    loc_90D3
                jnb     short got_hero_crest
                retn
; ---------------------------------------------------------------------------

got_hero_crest:  
                mov     byte ptr ds:hero_crest, 0FFh
                jmp     loc_914C
; ---------------------------------------------------------------------------

flag_1e:         
                mov     dx, offset get_feruza_shoes_str ; jumptable 00008E10 case 14
                call    loc_90D3
                jnb     short loc_9099
                retn
; ---------------------------------------------------------------------------

loc_9099:        
                mov     al, 1
                jmp     short loc_90B8
; ---------------------------------------------------------------------------

flag_1a:         
                mov     al, ds:cavern_level ; jumptable 00008E10 case 10
                sub     al, 4
                mov     cl, 3
                mul     cl
                mov     di, offset shoes_strings_array
                add     di, ax
                mov     al, [di]
                mov     dx, [di+1]      ; different shoes strings
                push    ax
                call    loc_90D3
                pop     ax
                jnb     short loc_90B8
                retn
; ---------------------------------------------------------------------------

loc_90B8:        
                push    ax
                mov     di, offset Feruza_Shoes

loc_90BC:        
                test    byte ptr [di], 0FFh
                jz      short free_slot_found
                inc     di              ; next accessory
                jmp     short loc_90BC
; ---------------------------------------------------------------------------

free_slot_found: 
                pop     ax
                mov     [di], al
                jmp     loc_914C
; ---------------------------------------------------------------------------
shoes_strings_array:      
                db 4
                dw offset get_ruzeria_shoes_str
                db 2
                dw offset get_pirika_shoes_str
                db 3
                dw offset get_silkarn_shoes_str
; ---------------------------------------------------------------------------

loc_90D3:        
                push    dx
                call    move_monster_S
                call    check_monster_aligned_to_hero_and_tick
                pop     dx
                jnb     short loc_90DE
                retn
; ---------------------------------------------------------------------------

loc_90DE:        
                mov     byte ptr ds:soundFX_request, 17
                jmp     render_notification_string
; ---------------------------------------------------------------------------

loc_90E6:        
                add     byte ptr [si+monster.anim_counter], 80h
                jc      short loc_90ED
                retn
; ---------------------------------------------------------------------------

loc_90ED:        
                inc     byte ptr [si+monster.anim_counter]
                cmp     byte ptr [si+monster.anim_counter], 3
                jz      short loc_90F7
                retn
; ---------------------------------------------------------------------------

loc_90F7:        
                mov     byte ptr [si+monster.counter], 0
                test    byte ptr [si+monster.state_flags], 40h
                jz      short loc_9116
                and     byte ptr [si+monster.state_flags], 0BFh
                mov     al, [si+monster.ai_timer]
                mov     cl, 16   ; size of monster struct
                mul     cl
                add     ax, ds:monsters_table_addr
                mov     di, ax
                mov     byte ptr [di+monster.currY], 0

loc_9116:        
                test    byte ptr [si+monster.state_flags], 10h
                jz      short loc_9122
                test    byte ptr [si+monster.flags], 1
                jz      short loc_914C

loc_9122:        
                mov     byte ptr [si+monster.anim_counter], 0
                mov     byte ptr [si+monster.flags], 72h
                mov     al, [si+monster.state_flags]
                and     al, 0Fh
                jnz     short loc_9132
                retn
; ---------------------------------------------------------------------------

loc_9132:        
                cmp     al, 1
                jz      short loc_914C
                or      al, 70h
                or      byte ptr [si+monster.state_flags], 80h
                mov     byte ptr [si+monster.counter], 4
                mov     [si+monster.flags], al
                and     byte ptr [si+monster.ai_flags], 80h
                and     byte ptr [si+monster.state_flags], 0F0h
                retn
; ---------------------------------------------------------------------------

loc_914C:        
                mov     word ptr [si], 0FF00h
                test    byte ptr [si+monster.state_flags], 20h
                jnz     short loc_9157
                retn
; ---------------------------------------------------------------------------

loc_9157:        
                mov     di, [si+monster.spwnX]
                cmp     di, 0FFFFh  ; already spawned
                jne     short loc_9160
                retn
; ---------------------------------------------------------------------------

loc_9160:        
                mov     al, [si+monster.spwnY]
                or      [di], al
                mov     word ptr [si+monster.spwnX], 0FFFFh
                retn
place_monster_in_proximity_and_run_ai endp


; =============== S U B R O U T I N E =======================================

; ax: gold to add

; ===========================================================================
; hero_got_gold / hero_got_almas
; Add gold or almas to hero totals, capped at 0xFFFF, redraw the HUD counter.
; ===========================================================================
hero_got_gold   proc near 
                add     ds:hero_gold_lo, ax
                adc     byte ptr ds:hero_gold_hi, 0
                push    si
                call    cs:Print_Gold_Decimal_proc
                pop     si
                retn
hero_got_gold   endp


; =============== S U B R O U T I N E =======================================

; ax: almas to add

hero_got_almas  proc near 
                add     ds:hero_almas, ax
                jnb     short loc_9188
                mov     ds:hero_almas, 0FFFFh

loc_9188:        
                push    si
                call    cs:Print_Almas_Decimal_proc
                pop     si
                retn
hero_got_almas  endp


; ===========================================================================
; check_monster_aligned_to_hero_and_tick
; Returns NC (item can be picked up) only when:
;   - hero_y_absolute matches one of 4 monster Y rows
;   - hero_x_in_viewport is within ±2 of monster m_x_rel
;   - monster state_flags bit 7 is SET (active/visible)
;   - monster.counter counts up to bit 3 being set (throttles pickup rate)
; Returns CF (stc) when misaligned or inactive.
; ===========================================================================
check_monster_aligned_to_hero_and_tick proc near
                test    byte ptr ds:invincibility_flag, 0FFh
                stc
                jz      short loc_9199
                retn
; ---------------------------------------------------------------------------

loc_9199:        
                mov     ah, [si+monster.currY]
                add     ah, 2
                mov     cx, 4

loc_91A2:        
                dec     ah
                and     ah, 3Fh
                cmp     ah, ds:hero_y_absolute
                jz      short loc_91B5
                loop    loc_91A2
                and     [si+monster.state_flags], 7Fh
                stc
                retn
; ---------------------------------------------------------------------------

loc_91B5:        
                mov     al, ds:hero_x_in_viewport
                add     al, 4
                mov     ah, [si+monster.m_x_rel]
                sub     ah, 3
                mov     cx, 4

loc_91C3:        
                inc     ah
                cmp     ah, al
                jz      short loc_91D1
                loop    loc_91C3
                and     [si+monster.state_flags], 7Fh
                stc
                retn
; ---------------------------------------------------------------------------

loc_91D1:        
                test    [si+monster.state_flags], 80h
                clc
                jnz     short loc_91D9
                retn
; ---------------------------------------------------------------------------

loc_91D9:        
                inc     [si+monster.counter]
                test    [si+monster.counter], 111b
                jnz     short loc_91E3
                retn                    ; NC
; ---------------------------------------------------------------------------

loc_91E3:        
                stc
                retn
check_monster_aligned_to_hero_and_tick endp
