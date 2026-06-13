

; ===========================================================================
; main_update_render
; Master simulation + render tick called every frame.
;
; Simulation phase:
;   - Feruza shoes → jump_height_including_shoes = 4 (else 2).
;   - check_airflows_on_hero — detect and apply wind tunnel tiles.
;   - If not airborne: reset byte_9F09 (fall sub-step counter).
;   - Re-center hero if hero_x_in_viewport drifts from 0x0C.
;   - Compute hero_y_absolute = (hero_head_y_in_viewport + viewport_top_row_y) & 0x3F.
;   - update_boss_heartbeat_volume
;   - update_and_render_horiz_platforms
;   - render_vertical_platforms_to_proximity
;   - process_visible_collapsing_platforms
;   - process_doors
;   - dispatch_spell_projectile_movement
;   - monsters_spawning  (unless boss is already dead)
;   - check_hero_contact_damage
;   - Flush UI dirty element
;   - projectiles_collision_processing
;   - monsters_updates  (render)
;   - step_on_aggressive_ground
;   - Temperature damage (cavern_level 7 = heat, every 0x40 ticks, 0x0F damage)
;     Protected by CAPE_ASBESTOS.
;   - screen_flash_overlay
; ===========================================================================
main_update_render proc near  
                mov     al, 2
                cmp     byte ptr ds:current_accessory, SHOES_FERUZA
                jnz     short no_feruza
                mov     al, 4

no_feruza:       
                mov     ds:jump_height_including_shoes, al
                call    check_airflows_on_hero
                test    byte ptr ds:jump_phase_flags, 0FFh ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                jnz     short loc_6FD3
                mov     ds:byte_9F09, 0
                mov     al, ds:byte_9F00
                cmp     al, ds:hero_head_y_in_viewport
                jz      short loc_6FD3
                jb      short loc_6FCC
                call    move_hero_up
                inc     byte ptr ds:hero_head_y_in_viewport
                jmp     short loc_6FD3
; ---------------------------------------------------------------------------

loc_6FCC:        
                call    hero_scroll_down
                dec     byte ptr ds:hero_head_y_in_viewport

loc_6FD3:        
                test    byte ptr ds:is_jashiin_cavern, 0FFh
                jnz     short loc_6FE1
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_6FF9

loc_6FE1:        
                mov     si, ds:word_A002
                add     si, 7
                mov     al, [si]
                cmp     ds:hero_x_in_viewport, al
                jz      short loc_7007
                call    move_hero_right_if_no_obstacles
                dec     byte ptr ds:hero_x_in_viewport
                jmp     short loc_7007
; ---------------------------------------------------------------------------

loc_6FF9:        
                mov     al, ds:hero_x_in_viewport
                cmp     al, 0Ch
                jz      short loc_7007
                call    move_hero_left_if_no_obstacles
                inc     byte ptr ds:hero_x_in_viewport

loc_7007:        
                mov     al, ds:hero_head_y_in_viewport ; hanging on rope, head at ground level: 0a
                add     al, ds:viewport_top_row_y ; 40h
                and     al, 3Fh
                mov     ds:hero_y_absolute, al ; hero Y absolute coord within the map
                call    update_boss_heartbeat_volume
                call    update_and_render_horiz_platforms
                call    render_vertical_platforms_to_proximity
                call    process_visible_collapsing_platforms
                call    process_doors
                call    dispatch_spell_projectile_movement
                test    byte ptr ds:boss_is_dead, 0FFh
                jnz     short loc_702F
                call    monsters_spawning

loc_702F:        
                mov     byte ptr ds:hero_damage_this_frame, 0
                mov     ds:byte_9F14, 0
                call    check_hero_contact_damage
                call    cs:Flush_Ui_Element_If_Dirty_proc
                call    projectiles_collision_processing
                call    monsters_updates
                call    cs:Render_Scrolling_Transition_Overlay_proc
                call    step_on_aggressive_ground
                cmp     byte ptr ds:cavern_level, 7 ; danger type = temperature
                jnz     short skip_temperature_damage
                cmp     byte ptr ds:current_accessory, CAPE_ASBESTOS
                jz      short skip_temperature_damage
                inc     ds:temperature_timer
                test    ds:temperature_timer, 3Fh
                jnz     short skip_temperature_damage
                mov     byte ptr ds:hero_damage_this_frame, 0FFh
                mov     byte ptr ds:soundFX_request, 9
                mov     ax, 0Fh
                call    damage_hero     ; ax: damage level
                mov     dx, offset its_too_hot_str
                call    render_notification_string

skip_temperature_damage:  
                call    screen_flash_overlay
                test    byte ptr ds:invincibility_flag, 0FFh
                jz      short game_loop_render_and_timing
                mov     byte ptr ds:hero_damage_this_frame, 0
                jmp     short loc_7094
main_update_render endp


; ===========================================================================
; game_loop_render_and_timing
; Rendering + timing portion of the per-frame cycle.
;
; Rendering sequence:
;   1. Shield/spell overlay active flag → shield_anim_active + shield_variant_index.
;   2. If hero_sprite_hidden: clear hero viewport area.
;   3. Sample_Neighborhood_Attributes — build attribute cache for viewport tiles.
;   4. Healing potion timer: +8 HP/tick while active.
;   5. Refresh_Dirty_Tiles — redraw tile changes to VRAM.
;   6. If sprite_flash_flag: Active_Entity_Sprite_Renderer (enp/fman sprites).
;
; Frame-rate timing:
;   Wait until frame_timer >= speed_const*2, then continue:
;   7. monsters_updates (second pass — commit sprite positions).
;   8. Flush UI dirty element.
;   9. update_and_render_projectile_row_pair.
;   10. render_and_collision_pass_row.
;   11. update_active_projectiles_render.
;   12. apply_sword_hit_to_map_tiles.
;   13. Render_Scrolling_Transition_Overlay.
;   Wait again until frame_timer >= speed_const*4.
;
; Post-render checks:
;   - If hero HP == 0 and not invincible: process_hero_death.
;   - Passive HP regen: +2 HP every 16 slow-intervals.
;   - Boss death reward: update XP + almas when boss_is_dead fires.
;   - Handle inventory (ENTER key) → bring_inventory_window.
; ===========================================================================
game_loop_render_and_timing proc near   ; ...
                mov     byte ptr ds:hero_sprite_hidden, 0

loc_7094:        
                mov     byte ptr ds:shield_anim_active, 0
                test    byte ptr ds:sword_swing_flag, 0FFh
                jz      short loc_70B3
                mov     byte ptr ds:shield_anim_active, 0FFh
                mov     al, ds:sword_hit_type
                mov     ds:shield_variant_index, al
                mov     al, ds:sword_movement_phase
                mov     ds:shield_anim_phase, al
                jmp     short loc_70CA
; ---------------------------------------------------------------------------

loc_70B3:        
                test    byte ptr ds:spell_active_flag, 0FFh
                jz      short loc_70CA
                mov     byte ptr ds:shield_anim_active, 0FFh
                mov     al, ds:byte_9F2B
                mov     ds:shield_anim_phase, al
                mov     byte ptr ds:shield_variant_index, 1

loc_70CA:        
                test    byte ptr ds:hero_sprite_hidden, 0FFh
                jnz     short loc_70D4
                call    clear_hero_in_viewport

loc_70D4:        
                call    cs:Sample_Neighborhood_Attributes_proc
                test    byte ptr ds:invincibility_flag, 0FFh
                jnz     short loc_710F
                mov     ax, ds:healing_potion_timer
                or      ax, ax
                jz      short loc_710F
                dec     ax
                mov     ds:healing_potion_timer, ax
                add     word ptr ds:hero_HP, 8   ; faster hp restoration
                mov     ax, ds:heroMaxHp
                cmp     ax, ds:hero_HP
                jnb     short loc_7105
                mov     ax, ds:heroMaxHp
                mov     ds:hero_HP, ax
                mov     word ptr ds:healing_potion_timer, 0

loc_7105:        
                mov     byte ptr ds:soundFX_request, 19
                call    cs:Draw_Hero_Health_proc

loc_710F:        
                call    cs:Refresh_Dirty_Tiles_proc
                test    byte ptr ds:sprite_flash_flag, 0FFh
                jz      short loc_7125
; combine 3x3 body, 3x3 left hand (with or without shield), 3x3 right hand from fman.grp
; with optional 4x4 sword from sword.grp into complete hero image, depending on animation phase
                call    cs:Active_Entity_Sprite_Renderer_proc
                mov     byte ptr ds:byte_FF24, 0Ah

loc_7125:        
                mov     cl, ds:speed_const
                mov     al, 2
                mul     cl

loc_712D:        
                cmp     ds:frame_timer, al
                jb      short loc_712D
                call    monsters_updates
                call    cs:Flush_Ui_Element_If_Dirty_proc
                call    update_and_render_projectile_row_pair
                call    render_and_collision_pass_row
                call    update_active_projectiles_render
                call    apply_sword_hit_to_map_tiles
                call    cs:Render_Scrolling_Transition_Overlay_proc
                mov     cl, ds:speed_const
                mov     al, 4
                mul     cl

loc_7154:        
                push    ax
                call    cs:Confirm_Exit_Dialog_proc
                call    cs:Handle_Pause_State_proc
                call    cs:Handle_Speed_Change_proc
                call    cs:Joystick_Calibration_proc
                call    cs:Joystick_Deactivator_proc
                call    cs:Handle_Restore_Game_proc
                jnb     short loc_7178
                call    restore_game

loc_7178:        
                pop     ax
                cmp     ds:frame_timer, al
                jb      short loc_7154
                mov     byte ptr ds:frame_timer, 0
                test    byte ptr ds:invincibility_flag, 0FFh
                jz      short loc_718C
                retn
; ---------------------------------------------------------------------------

loc_718C:        
                test    byte ptr ds:hero_invincibility, 0FFh
                jnz     short increase_hp
                test    word ptr ds:hero_HP, 0FFFFh
                jnz     short increase_hp
                jmp     process_hero_death
; ---------------------------------------------------------------------------

increase_hp:     
                inc     ds:byte_9F18
                cmp     ds:byte_9F18, 16 ; increase hero HP by 2 every 16 time intervals
                jb      short loc_71C2
                mov     ds:byte_9F18, 0
                mov     ax, ds:hero_HP
                cmp     ax, ds:heroMaxHp
                jnb     short loc_71C2
                add     ax, 2           ; normal HP restoration speed
                mov     ds:hero_HP, ax
                call    cs:Draw_Hero_Health_proc

loc_71C2:        
                test    ds:byte_9F1E, 0FFh
                jz      short loc_71CC
                jmp     load_place_and_reinit
; ---------------------------------------------------------------------------

loc_71CC:        
                test    byte ptr ds:is_boss_cavern, 0FFh
                jz      short loc_71FA
                test    byte ptr ds:boss_is_dead, 0FFh
                jz      short loc_71FA
                cmp     byte ptr ds:active_entity_table, 0FFh
                jnz     short loc_71FA
                mov     si, ds:word_A002
                add     si, 5
                lodsw
                push    si
                call    update_hero_XP
                pop     si
                add     si, 4
                lodsw
                call    hero_got_almas  ; ax: almas to add
                mov     ds:byte_9F1E, 0FFh

loc_71FA:        
                test    byte ptr ds:boss_being_hit, 0FFh
                jz      short loc_7202
                retn
; ---------------------------------------------------------------------------

loc_7202:        
                test    word ptr ds:F9_F7_F2_F1_KREJSNYQ_Esc_Ctrl_Shift_Enter, KEY_ENTER
                jnz     short bring_inventory_window
                mov     ds:byte_9EF5, 0
                retn
game_loop_render_and_timing endp


; ===========================================================================
; screen_flash_overlay
; Handles two overlay effects in the viewport buffer:
;   byte_9EF0 path: wide panel flash (sign display area, 18 tiles wide × byte_9EF1 rows).
;                   Fills viewport_buffer rows starting at row 2 with 0xFC/0xFE markers.
;   byte_9EEF path: narrow 2-row flash (notification bar at rows 2-3, 26 tiles).
;                   Used for item pickup notifications and boss-hit flash.
; Both flash effects decay after 0x1F ticks (byte_9EEE/byte_9EED counters).
; The 0xFC/0xFE tile IDs are special 'overlay' values recognized by the renderer.
; ===========================================================================
screen_flash_overlay proc near
                test    ds:byte_9EF0, 0FFh
                jz      short loc_7242
                mov     al, 0FCh
                inc     ds:byte_9EEE
                test    ds:byte_9EEE, 1Fh
                jnz     short loc_722B
                mov     al, 0FEh
                mov     ds:byte_9EF0, 0

loc_722B:        
                push    cs
                pop     es
                mov     di, viewport_buffer_28x19+(28+5)
                mov     cl, ds:byte_9EF1
                xor     ch, ch

loc_7236:        
                push    cx
                mov     cx, 18
                rep stosb
                add     di, 10
                pop     cx
                loop    loc_7236

loc_7242:        
                test    ds:byte_9EEF, 0FFh
                jnz     short loc_724A
                retn
; ---------------------------------------------------------------------------

loc_724A:        
                mov     al, 0FCh
                inc     ds:byte_9EED
                and     ds:byte_9EED, 1Fh
                jnz     short loc_725E
                mov     al, 0FEh
                mov     ds:byte_9EEF, 0

loc_725E:        
                push    ds
                pop     es
                mov     di, viewport_buffer_28x19+(2*28+1)
                mov     cx, 2

fill_viewport_2_lines:    
                push    cx
                push    di
                mov     cx, 26
                rep stosb
                pop     di
                add     di, 28
                pop     cx
                loop    fill_viewport_2_lines
                retn
screen_flash_overlay endp


; ===========================================================================
; bring_inventory_window
; Opens the inventory/equipment screen when ENTER is pressed.
; Preconditions: no active spell, no screen effect, not in intro animation.
;
; 1. Play SFX 11.
; 2. swap_eai_and_inventory_code_regions: XOR-swap 0x800 words between
;    the enemy AI region (0xA000) and inventory region (seg1:0xC000).
;    This temporarily replaces the live AI code with select.bin code.
; 3. Call Inventory_Screen_proc.
; 4. Swap back.
; 5. If byte_FF4B == 8 (save/load from inventory): jmp to resurrection code.
; 6. Reload magic spell sprites, clear viewport, reinit.
; ===========================================================================
bring_inventory_window proc near
                mov     al, ds:byte_9EF5
                or      al, ds:spell_active_flag
                or      al, ds:byte_FF3E
                or      al, ds:byte_9F26
                jz      short loc_7287
                retn
; ---------------------------------------------------------------------------

loc_7287:        
                mov     byte ptr ds:soundFX_request, 11
                call    cs:Clear_Viewport_proc
                call    swap_eai_and_inventory_code_regions
                call    cs:Inventory_Screen_proc
                call    swap_eai_and_inventory_code_regions
                cmp     byte ptr ds:byte_FF4B, 8
                jnz     short loc_72A6
                jmp     transit_to_sage
; ---------------------------------------------------------------------------

loc_72A6:        
                call    cs:Clear_Viewport_proc
                push    ds
                call    word ptr cs:Load_Magic_Spell_Sprite_Group_proc
                mov     cx, 24
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                mov     ds:byte_9EF5, 0FFh
                call    clear_viewport_buffer
                mov     byte ptr ds:spacebar_latch, 0
                mov     byte ptr ds:altkey_latch, 0
                mov     ds:byte_9EEF, 0
                mov     ds:byte_9EF0, 0
                jmp     main_update_render
bring_inventory_window endp


; ===========================================================================
; swap_eai_and_inventory_code_regions
; XOR-swaps 0x800 words (2KB each) between:
;   - ES:0xA000 (eai{N}.bin enemy AI code, in CS segment)
;   - ES:0xC000 (select.bin inventory code, in CS segment)
; After the swap: Monster_AI_proc at 0xA000 now runs the inventory screen.
; swap_eai_and_inventory_code_regions is idempotent (double-swap restores).
; ===========================================================================
swap_eai_and_inventory_code_regions proc near ; ...
                mov     es, cs:seg1 ; =1ac5
                mov     di, 0C000h      ; select.bin region (inventory)
                mov     si, 0A000h      ; eai{i}.bin region (enemy AI)
                mov     cx, 800h

loc_72E7:        
                mov     ax, es:[di]
                movsw
                mov     [si-2], ax
                loop    loc_72E7
                retn
swap_eai_and_inventory_code_regions endp


; ===========================================================================
; Called when boss_is_dead fires and the game needs to transition the cavern
; from boss mode back to post-boss state.
;
; 1. Load saved monsters AI binary (eai from mdt_descriptor.boss_ai) → 0xA000.
; 2. Load boss enp sprite group (from mdt_descriptor.enp_grp_idx).
; 3. Decompress boss monster tiles.
; 4. Clear is_boss_cavern flag.
; 5. Process optional initializers from MDT (list of word writes).
; 6. Update hero X position, recalculate door tile, call process_doors.
; 7. Reinit cavern display, jump back to Cavern_Game_Init.
; ===========================================================================
load_place_and_reinit proc near 
                test    byte ptr ds:invincibility_flag, 0FFh
                jz      short loc_72F9
                retn
; ---------------------------------------------------------------------------

loc_72F9:        
                mov     si, ds:mdt_buffer    ; mdt_buffer[0] is mdt_descriptor_addr; [C000]=C20A
                add     si, mdt_descriptor.boss_ai
                lodsb  ; saved eai_bin_index
                push    si
                mov     ds:eai_bin_index, al ; enemy ai restored with saved value
                mov     bl, 11
                mul     bl
                add     ax, offset eai1_bin
                mov     si, ax
                push    cs
                pop     es
                mov     di, 0A000h      ; destination buffer
                mov     al, 3           ; fn3_read_virtual_file
                call    cs:res_dispatcher_proc
                pop     si
                lodsb                   ; mdt_descriptor.enp_grp_idx
                mov     ds:enp_grp_index, al
                mov     bl, 11
                mul     bl
                add     ax, offset vfs_enp1_grp
                mov     si, ax
                mov     es, cs:seg1
                mov     di, monster_gfx
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, monster_gfx
                mov     bp, monsters_transparency_masks
                mov     cx, 100h
                call    cs:Decompress_Tile_Data_proc
                pop     ds
                mov     byte ptr ds:is_boss_cavern, 0
                mov     si, ds:mdt_buffer  ; mdt_buffer[0] is mdt_descriptor_addr
                add     si, 8          ; mdt_descriptor+8 is post-boss initializers (addr - value pairs)

next_optional_initializer: ; addr, value pairs
                lodsw
                cmp     ax, 0FFFFh
                jz      short end_of_initializers ;
                                        ; if not ffff: optional initializers follow
                mov     bx, ax          ; address to init
                lodsw                   ; 16 bit word to write
                mov     [bx], ax
                jmp     short next_optional_initializer
; ---------------------------------------------------------------------------

end_of_initializers:    
                call    hero_coords_to_addr_in_proximity ; Hero is 3x3 matrix. Return top-left coord in SI
                mov     ax, ds:proximity_map_left_col_x
                mov     bl, ds:hero_x_in_viewport
                xor     bh, bh
                add     ax, bx
                test    byte ptr [si-5], 0FFh
                jz      short loc_737C
                add     ax, 9

loc_737C:        
                mov     bx, ax
                sub     bx, ds:mapWidth
                jb      short loc_7386
                mov     ax, bx

loc_7386:        
                mov     si, ds:doors_table_addr
                mov     [si], ax
                call    process_doors
                call    screen_flash_overlay
                call    clear_hero_in_viewport
                call    cs:Render_Viewport_Tiles_proc
                mov     bx, 21Ch
                xor     al, al
                mov     ch, 42h
                call    cs:Clear_HUD_Bar_proc
                mov     ax, 1  ; fn1 (Stop) Silences all channels and halts the driver.
                int     60h             ; mscadlib.drv
                mov     ds:byte_9F1E, 0
                jmp     Cavern_Game_Init
load_place_and_reinit endp


; ===========================================================================
; clear_viewport_buffer
; Fills the 28×19 viewport_buffer (at 0xE900h) with 0xFD.
; 0xFD means 'undrawn tile' — forces a full redraw next render pass.
; ===========================================================================
clear_viewport_buffer proc near 
                push    cs
                pop     es
                mov     di, viewport_buffer_28x19
                mov     cx, 28*19
                mov     al, 0FDh
                rep stosb
                retn
clear_viewport_buffer endp
