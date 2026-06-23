; ===========================================================================
; Cavern_Game_Init
; Entry point called when the dungeon scene begins (after MDT load).
; Also re-entered after room transitions (load_place_and_reinit → Cavern_Game_Init).
;
; Flow:
;   1. Reset SP, init projectile arrays and boss/flash flags.
;   2. Boss cavern path (is_boss_cavern != 0):
;      a. Draw enemy HUD bars.
;      b. Load boss music (fn5 → seg1:3000h).
;      c. Load ENCNT.GRP encounter intro sprite (fn2 → seg1:4000h).
;      d. Animate 6 'encounter flashing' intervals.
;      e. Override enp_grp_idx with boss_grp from mdt_descriptor.
;      f. Load boss enp?.grp → seg1:monster_gfx, decompress tile data.
;      g. Draw boss name (Pascal string from AI boss_state_block_ptr+9) and HP bars.
;   3. Jashiin special path (is_jashiin_cavern != 0):
;      Shifted viewport (hero not centered), loads MDT 30 (MPA0.MDT).
;   4. Regular cavern path:
;      Draw place name and gold label.
;   5. Common tail — draw hero HP bars, then fall through to init_cavern.
;
; main_loop (within Cavern_Game_Init):
;   Tightly coupled per-frame loop:
;     - Rope state check → over_rope handler if needed
;     - input_handling  : sword swing & spacebar latch
;     - sliding_physics_step
;     - main_update_render : full simulation + render tick
;     - magic_spell_fire_handler
;     - hero_interaction_check : tile-based interactions
;     - hero_knockback_handler
;     - State machine dispatcher (left/right/up/down key routing)
Cavern_Game_Init proc near
                cli
                mov     sp, 2000h
                sti
                push    cs
                pop     ds
                mov     slide_ticks_remaining, 0
                mov     horiz_movement_sub_tile_accum, 0
                mov     slide_direction, 0
                mov     ax, 0FFFFh
                mov     ds:projectiles_array, al
                mov     ds:boss_explosion_rings_list, al
                mov     ds:word ptr magic_projectiles, ax
                mov     byte ptr ds:boss_being_hit, 0
                mov     byte ptr ds:sprite_flash_flag, 0
                mov     byte ptr ds:boss_is_dead, 0
                mov     byte ptr ds:byte_9F01, 0
                test    byte ptr ds:is_boss_cavern, 0FFh
                jnz     short boss_place
                jmp     regular_cavern
; ---------------------------------------------------------------------------

; --- BOSS CAVERN INIT ---
; Draws enemy HUD, loads & plays encounter music, shows encounter intro sprite
; (ENCNT.GRP), animates 6 flash intervals at 0x41 timer ticks each.
; After animation: loads the actual boss enp sprite group and decompresses it.
boss_place:      
                call    render_hud_bars_with_enemy
                mov     ax, 1  ; fn1 (Stop) - Silences all channels and halts the driver.
                int     60h             ; mscadlib.drv
                mov     byte_9F02, 0FFh
                mov     al, byte ptr ds:msd_index
                mov     bl, 11
                mul     bl
                add     ax, offset vfs_mgt1_msd
                mov     si, ax
                mov     es, cs:seg1
                mov     di, 3000h       ; music buffer seg1:3000h
                mov     al, 5           ; fn5_load_music
                call    cs:res_dispatcher_proc ; =0A84
                mov     si, offset encnt_grp
                mov     es, cs:seg1
                mov     di, 4000h       ; seg1:4000h - decorations for encounter warning scene
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc ; =0A84h
                call    word ptr cs:Render_Animated_Tile_Strip_proc
                mov     byte ptr ds:hero_sprite_hidden, 0
                call    word ptr cs:Update_Local_Attribute_Cache_proc
                call    word ptr cs:Copy_Tile_Buffer_To_VRAM_proc
                call    clear_hero_in_viewport
                mov     byte_9F02, 0
                push    ds
                mov     ds, cs:seg1
                mov     si, 3000h
                xor     ax, ax  ; fn0 (Init/Play) - Clears buffers, loads music data, and starts playback.
                int     60h             ; mscadlib.drv
                pop     ds
; Flash big word 'ENCOUNTER' on screen 6 times
                mov     cx, 6
loc_60E9:        
                push    cx
                mov     byte ptr ds:frame_timer, 0
waiter0:         
                cmp     byte ptr ds:frame_timer, 65
                jb      short waiter0
                mov     bx, 0C28h
                mov     cx, 3828h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc
                mov     byte ptr ds:frame_timer, 0
loc_6108:        
                cmp     byte ptr ds:frame_timer, 65
                jb      short loc_6108
                call    word ptr cs:Render_Animated_Tile_Strip_proc
                pop     cx
                loop    loc_60E9
; flash animation end
                mov     si, ds:mdt_buffer
                add     si, 5           ; mdt_descriptor.boss_grp
                mov     al, [si]        ; boss idx
                mov     [si-1], al      ; mdt_descriptor.enp_grp_idx overridden by boss_grp idx
; load boss sprites
                mov     bl, 11
                mul     bl
                add     ax, offset vfs_enp1_grp
                mov     si, ax
                mov     es, cs:seg1
                mov     di, monster_gfx
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc ; =0A84h
                push    ds
                mov     ds, cs:seg1
                mov     si, monster_gfx
                mov     bp, monsters_transparency_masks
                mov     cx, 100h
                call    cs:Decompress_Tile_Data_proc
                pop     ds

; Boss HUD: display boss name from AI data, draw HP bars
render_boss_hud: 
                mov     si, ds:boss_state_block_ptr
                add     si, 8
                lodsb               ; boss_state.bs_unk_8
                mov     ds:byte_9F01, al
                mov     si, [si]    ; boss_state.bs_name_block_ptr
                call    cs:Render_Pascal_String_1_proc
                mov     si, ds:boss_state_block_ptr
                add     si, 3
                mov     bx, [si]    ; boss_state.bs_hp
                push    bx
                call    cs:Draw_Boss_Max_Health_proc ; bx: boss maxHP
                pop     bx
                call    cs:Draw_Boss_Health_proc ; bx: boss health
                jmp     short loc_618F
; ---------------------------------------------------------------------------

; REGULAR CAVERN INIT
; Clear place/enemy bar, render cavern name label and gold label.
regular_cavern:  
                call    cs:Clear_Place_Enemy_Bar_proc
                call    render_place_and_gold_labels
                mov     si, ds:cavern_name_rendering_info
                call    cs:Render_Pascal_String_1_proc
                call    cs:Print_Gold_Decimal_proc

; Common cavern HUD: hero max HP, current HP, almas counter
loc_618F:        
                call    cs:Draw_Hero_Max_Health_proc
                call    cs:Draw_Hero_Health_proc
                call    cs:Print_Almas_Decimal_proc
                test    byte ptr ds:is_jashiin_cavern, 0FFh
                jnz     short jashiin_place
                jmp     init_cavern

; Jashiin special path
; Viewport offset: hero appears at x=5 in viewport (x+36=41 in proximity map).
; Waits until is_jashiin_cavern flag clears (set by transition animation).
; Loads MPA0.MDT — Jashiin boss room
jashiin_place:   
                mov     ds:byte_9F26, 0FFh
                mov     word ptr ds:proximity_map_left_col_x, 41
                mov     byte ptr ds:hero_x_in_viewport, 5 ; 5+36=41; in the Jashiin's cavern hero appears not centered in viewport
                call    unpack_map
                call    clear_viewport_buffer

loc_61BE:        
                call    main_update_render
                test    byte ptr ds:is_jashiin_cavern, 0FFh
                jnz     short loc_61BE  ; wait until fully entered the boss cavern
                push    ds
                mov     ds, cs:seg1
                mov     si, 3000h
                xor     ax, ax  ; fn0 (Init/Play) - Clears buffers, loads music data, and starts playback.
                int     60h             ; mscadlib.drv
                pop     ds
                mov     ds:byte_9F02, 0
                mov     ah, 30          ; MPA0.MDT - Jashiin's room
                mov     al, 1           ; fn1_load_mdt_idx_ah
                call    cs:res_dispatcher_proc
                 
                mov     byte ptr ds:is_boss_cavern, 0FFh
                mov     ds:byte_9F27, 0FFh
                mov     si, ds:mdt_buffer
                lodsb                   ; al = first byte of mdt_descr
                call    process_mdt_descriptor
                call    load_cavern_sprites_ai_music ; load dchr.grp
                                        ; load mpp{mpp_grp_index}.grp
                                        ; load eai{eai_bin_index}.bin
                                        ; load enp{enp_grp_index}.grp
                                        ; load mgt{mgt_msd_index}.msd
                push    ds
                mov     ds, cs:seg1
                mov     si, 8030h
                mov     cx, 102
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                call    word ptr cs:NoOperation_proc
                pop     ds
                push    ds
                call    word ptr cs:Load_Magic_Spell_Sprite_Group_proc
                mov     cx, 24
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                mov     ds:hero_x_in_proximity_map, 24
                mov     ds:door_target_y, 0Dh
                mov     byte ptr ds:hero_x_in_viewport, 12
                mov     ds:byte_9F00, 0Ch
                call    hero_left_16_down_1
                call    render_hud_bars_with_enemy
                jmp     render_boss_hud
; ---------------------------------------------------------------------------

; --- Normal dungeon startup ---
; Unpack the MDT map, update monster positions, check death flag.
init_cavern:     
                call    unpack_map      ; unpack *.mdt
                test    ds:byte_9F27, 0FFh
                jz      short loc_6254
                call    clear_viewport_buffer
                call    main_update_render
                mov     ds:byte_9F26, 0
                jmp     short loc_6266
; ---------------------------------------------------------------------------

loc_6254:        
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_6260
                call    cs:Render_Viewport_Tiles_proc

loc_6260:        
                call    clear_viewport_buffer ; 28x19
                call    update_all_monsters_in_map

loc_6266:        
                test    byte ptr ds:is_death_already_processed, 0FFh
                jz      short not_dead
                jmp     process_hero_death
; ---------------------------------------------------------------------------

not_dead:        
                test    ds:byte_9F02, 0FFh
                jz      short loc_628A
                mov     ds:byte_9F02, 0
                push    ds
                mov     ds, cs:seg1
                mov     si, 3000h
                xor     ax, ax          ; fn0 (Init/Play) - Clears buffers, loads music data, and starts playback.
                int     60h             ; mscadlib.drv
                pop     ds

loc_628A:        
                xor     al, al
                mov     ds:spacebar_latch, al
                mov     ds:altkey_latch, al
                mov     byte ptr ds:frame_timer, 0
                mov     ds:byte_9F27, 0

; ===========================================================================
; main_loop — per-frame game loop (called via PUSH/RET trick)
; Frame structure:
;   1. Check if on rope → separate rope-handling path
;   2. input_handling
;   3. sliding_physics_step
;   4. main_update_render
;   5. magic_spell_fire_handler
;   6. hero_interaction_check
;   7. hero_knockback_handler
;   8. frame_ticks counter: reset squat flag at tick 2
;   9. Read direction bits → route to state_machine_dispatcher
; ===========================================================================
main_loop:       
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jnz     short over_rope
                call    input_handling
                call    sliding_physics_step
                call    main_update_render
                call    magic_spell_fire_handler
                call    hero_interaction_check
                call    hero_knockback_handler
                inc     ds:frame_ticks
                cmp     ds:frame_ticks, 2
                jnz     short loc_62C5
                mov     byte ptr ds:squat_flag, 0

loc_62C5:        
                mov     dx, offset main_loop
                push    dx  ; main_loop will be called on return
                                        ; check input keys buffer
                int     61h             ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                test    al, 2
                jz      short no_down_pressed
                and     byte ptr ds:facing_direction, 11111101b ; down (not up)

no_down_pressed: 
                call    airborne_movement
                call    state_machine_dispatcher
                retn                    ; jumps to main_loop
; ---------------------------------------------------------------------------

over_rope:       
                mov     byte ptr ds:squat_flag, 0
                mov     byte ptr ds:jump_phase_flags, 0 ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     byte ptr ds:slope_direction, 0
                mov     byte ptr ds:spell_active_flag, 0
                call    cs:Flush_Ui_Element_If_Dirty_proc
                mov     byte ptr ds:sword_swing_flag, 0
                call    main_update_render
                call    hero_knockback_handler
                call    state_machine_dispatcher
                cmp     byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jnz     short move_off_rope
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                inc     si              ; hero head
                call    is_over_rope    ; set CF if [si] is rope (0 or 1)
                jc      short over_rope
                add     si, 36          ; fall down 1 tile
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                call    is_over_rope    ; set CF if [si] is rope (0 or 1)
                jb      short over_rope

move_off_rope:   
                and     byte ptr ds:facing_direction, 11111101b ; down
                mov     byte ptr ds:on_rope_flags, 0 ; any reason, including being hit by monster
                mov     byte ptr ds:spacebar_latch, 0
                mov     byte ptr ds:altkey_latch, 0
                mov     ds:slide_ticks_remaining, 0
                mov     ds:horiz_movement_sub_tile_accum, 0
                mov     byte ptr ds:hero_animation_phase, 7Fh
                jmp     main_loop
Cavern_Game_Init endp


; ===========================================================================
; Reads the current direction input and branches to the correct hero movement handler.
;
; Input combinations dispatched (al = right/left/down/up bitfield):
;   101b  (left+up)   → left_up_pressed
;   1001b (right+up)  → right_up_pressed
;   001b  (up only)   → up_pressed
;   100b  (left)      → on_left_pressed (left_up_pressed tail)
;   1000b (right)     → on_right_pressed (right_up_pressed tail)
;   010b  (down)      → down_pressed
;   else              → init_horizontal_sliding + idle animation
;
; Also manages the byte_9F24 direction-change latch for sliding init.
; ===========================================================================
state_machine_dispatcher proc near      ; ...
                mov     ds:slide_direction, 0
                int     61h             ; ah: ____Alt_Space
                                        ; al: ____right_left_down_up
                cmp     al, 101b
                jne     short loc_6351
                jmp     left_up_pressed
; ---------------------------------------------------------------------------

loc_6351:        
                cmp     al, 1001b
                jne     short loc_6358
                jmp     right_up_pressed
; ---------------------------------------------------------------------------

loc_6358:        
                cmp     al, 1
                jne     short loc_635F
                jmp     up_pressed
; ---------------------------------------------------------------------------

loc_635F:        
                mov     ah, al
                test    byte ptr ds:on_rope_flags, 0FFh ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                jnz     short loc_6399
                test    byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jz      short loc_6399
                test    ds:byte_9F0B, 0FFh
                jnz     short loc_6379
                jmp     loc_65BA
; ---------------------------------------------------------------------------

loc_6379:        
                mov     ds:byte_9F0B, 0
                test    byte ptr ds:facing_direction, 10b ; up
                jnz     short no_squat_mode
                jmp     loc_65BA
; ---------------------------------------------------------------------------

no_squat_mode:   
                mov     dx, offset loc_65BA
                push    dx
                test    byte ptr ds:facing_direction, LEFT
                jnz     short loc_6396
                jmp     on_right_pressed
; ---------------------------------------------------------------------------

loc_6396:        
                jmp     on_left_pressed
; ---------------------------------------------------------------------------

loc_6399:
                push    ax                ; ah = ____right_left_down_up
                mov     al, ds:facing_direction
                and     al, LEFT
                cmp     al, ds:byte_9F24
                mov     ds:byte_9F24, al  ; sliding direction = facing direction
                je      short loc_63AB    ; already sliding, skip
                call    init_horizontal_sliding

loc_63AB:        
                pop     ax
                mov     al, ah            ; al = ____right_left_down_up
                push    ax
                cmp     al, 2
                jne     short loc_63B6
                call    down_pressed

loc_63B6:        
                pop     ax
                and     al, 0Ch
                cmp     al, 4
                jne     short loc_63C0
                ; left pressed
                jmp     on_left_pressed
; ---------------------------------------------------------------------------

loc_63C0:        
                cmp     al, 8
                jne     short loc_63C7
                ; right pressed
                jmp     on_right_pressed
; ---------------------------------------------------------------------------

loc_63C7:        
                call    init_horizontal_sliding
                mov     al, ds:on_rope_flags ; 0: on ground, ff: on rope, 80h: transition from rope to ground
                or      al, ds:squat_flag
                jz      short loc_63D4
                retn
; ---------------------------------------------------------------------------

loc_63D4:        
                mov     byte ptr ds:hero_animation_phase, 80h
                retn
state_machine_dispatcher endp
