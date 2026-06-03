

; =============== S U B R O U T I N E =======================================


process_doors   proc near 
                mov     bp, ds:doors_table_addr

next_door:       
                mov     ax, ds:[bp+door.x0]
                cmp     ax, 0FFFFh      ; doors end marker
                jnz     short loc_78EB
                retn
; ---------------------------------------------------------------------------

loc_78EB:        
                call    calc_object_viewport_x_offset
                jb      short loc_7933
                mov     al, ds:[bp+door.d_flags]
                and     al, 7
                add     al, 61h ; 'a'
                mov     ds:byte_79B6, al
                mov     ds:byte_79CA, al
                mov     al, ds:[bp+door.y0]
                xor     ah, ah
                call    coords_in_ax_to_proximity_map_addr_in_di ; uint8_t y = AL
                                        ; uint8_t x = AH
                                        ; y &= 0x3F; // Clamp Y to 0-63
                                        ; uint16_t di = (y * 36) + x + 0xE000;
                cmp     bl, 4
                jb      short loc_7938
                mov     cx, bx
                sub     bl, 36+3
                neg     bl
                inc     bl
                mov     al, bl
                cmp     al, 6
                jb      short loc_791D
                mov     al, 5

loc_791D:        
                sub     cl, 4
                xor     ch, ch
                add     di, cx
                mov     si, offset byte_79C8
                test    ds:[bp+door.d_flags], 80h
                jnz     short loc_7951
                mov     si, offset byte_79B4
                jmp     short loc_7951
; ---------------------------------------------------------------------------

loc_7933:        
                add     bp, 0Ch
                jmp     short next_door
; ---------------------------------------------------------------------------

loc_7938:        
                mov     si, offset byte_79C8
                test    ds:[bp+door.d_flags], 80h
                jnz     short loc_7945
                mov     si, offset byte_79B4

loc_7945:        
                mov     al, bl
                inc     al
                mov     cl, 5
                sub     cl, al
                xor     ch, ch
                add     si, cx

loc_7951:        
                mov     cx, 4

four_times:      
                push    cx
                push    ax
                push    di
                push    si

al_times:        
                call    move_if_dst_high_bit_zero
                inc     di
                inc     si
                dec     al
                jnz     short al_times
                pop     si
                add     si, 5
                xchg    si, di
                pop     si
                add     si, 36
                call    wrap_map_from_above ; if (si >= 0E900h) si -= 900h
                xchg    di, si
                pop     ax
                pop     cx
                loop    four_times
                jmp     short loc_7933
process_doors   endp


; =============== S U B R O U T I N E =======================================


move_if_dst_high_bit_zero proc near
                test    byte ptr [di], 80h
                jz      short loc_797C
                retn
; ---------------------------------------------------------------------------

loc_797C:        
                mov     dl, [si]
                mov     [di], dl
                retn
move_if_dst_high_bit_zero endp


; =============== S U B R O U T I N E =======================================


calc_object_viewport_x_offset proc near ; ...
                add     ax, 3           ; platform.x+3
                push    ax
                sub     ax, ds:mapWidth ; ax=platform.x+3-mapWidth
                pop     bx              ; bx=platform.x+3
                jnb     short x_coord_wrapped
                xchg    ax, bx

x_coord_wrapped: 
                push    ax              ; platform.x+3
                sub     ax, ds:proximity_map_left_col_x ; ax=platform.x+3-(hero.x-18)
                pop     bx              ; bx=platform.x+3
                jb      short loc_799C
                xchg    ax, bx          ; bx=platform.x+3-(hero.x-18)
                mov     ax, 36+3
                sub     ax, bx          ; ax=18+hero.x-platform.x
                retn
; ---------------------------------------------------------------------------

loc_799C:        
                mov     ax, 36+3
                sub     ax, bx          ; ax=36-platform.x
                jnb     short loc_79A4
                retn
; ---------------------------------------------------------------------------

loc_79A4:        
                mov     ax, ds:mapWidth
                sub     ax, ds:proximity_map_left_col_x
                add     ax, bx          ; ax=mapWidth-(hero.x-18)+platform.x+3
                                        ; bx=platform.x+3
                xchg    ax, bx          ; bx=mapWidth-hero.x+18+platform.x+3
                mov     ax, 36+3
                sub     ax, bx          ; ax=18+hero.x-platform.x-mapWidth
                retn
calc_object_viewport_x_offset endp

; ---------------------------------------------------------------------------
byte_79B4       db 49h, 4Ah   
byte_79B6       db 61h, 4Bh, 4Ch, 4Dh, 4Fh, 50h, 51h, 4Eh, 5Fh, 52h, 53h, 54h, 60h, 5Fh, 55h, 56h, 57h, 60h
byte_79C8       db 49h, 4Ah   
byte_79CA       db 61h, 4Bh, 4Ch, 4Dh, 58h, 0, 59h, 4Eh, 5Fh, 5Ah, 0, 5Bh, 60h, 5Fh, 5Ch, 5Dh, 5Eh, 60h

; =============== S U B R O U T I N E =======================================

; run from town to dungeon

prepare_dungeon proc near 
                cli
                mov     sp, 2000h
                sti
                mov     ax, cs
                mov     ds, ax
                mov     es, ax
                mov     di, offset byte_9EED
                mov     cx, offset byte_9F2E
                sub     cx, offset byte_9EED
                dec     cx              ; 0x9f2e-0x9eed-1 = 64
                xor     al, al
                rep stosb
                not     al
                mov     ds:byte_9EF5, al
                mov     ds:eai_bin_index, al
                mov     ds:enp_grp_index, al
                call    reset_dungeon_state_vars
                mov     al, 0FFh
                mov     ds:spirit_sprite_0, al
                mov     ds:spirit_sprite_1, al
                mov     ds:spirit_sprite_2, al
                mov     ds:spirit_sprite_3, al
                mov     byte ptr ds:hero_hidden_flag, 0
                mov     es, cs:seg1
                mov     si, offset vfs_fman_grp
                mov     di, fman_gfx
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, fman_gfx + 333h  ; TILE_BANK_OFFSET = 0x333
                mov     bp, hero_transparency_masks
                mov     cx, 230
                call    cs:Decompress_Tile_Data_proc
                pop     ds
                mov     si, ds:mdt_buffer
                lodsb
                call    process_mdt_descriptor
                call    cs:Clear_Viewport_proc
                mov     si, offset vfs_roka_grp_2
                mov     es, cs:seg1
                mov     di, packed_tile_ptr
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, packed_tile_ptr       ; roka_grp unpacked
                mov     cx, 80h
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                xor     al, al
                call    cs:Render_Roca_Tilemap_proc
                mov     al, ds:place_map_id
                or      al, al
                js      short loc_7A80
                call    remove_accomplished_items
loc_7A80:        
                jmp     loc_7C6E
prepare_dungeon endp


; =============== S U B R O U T I N E =======================================


try_door_interaction proc near
                call    hero_coords_to_addr_in_proximity ; =e10c
                sub     si, 36+1        ; x--, y-- ; =0xe0e7
                call    wrap_map_from_below ; if (si < 0E000h) si += 900h
                cmp     byte ptr [si], 4Ah ; 'J' ; door to Muralla: 0x49, 0x4A, 0x61, 0x4B, 0x4C
                jz      short on_the_right_door_tile ; hero is on the right tile of the door
                inc     si
                cmp     byte ptr [si], 4Ah ; 'J'
                jz      short enter_the_door ; hero is centered on door
                inc     si
                cmp     byte ptr [si], 4Ah ; 'J'
                jz      short on_the_left_door_tile
                retn
; ---------------------------------------------------------------------------

on_the_left_door_tile:    
                test    byte ptr ds:facing_direction, 1
                jz      short loc_7AA6
                retn                    ; faced left - skip door interaction
; ---------------------------------------------------------------------------

loc_7AA6:        
                pop     ax
                jmp     move_hero_right_if_no_obstacles
; ---------------------------------------------------------------------------

on_the_right_door_tile:   
                test    byte ptr ds:facing_direction, 1
                jnz     short loc_7AB2
                retn                    ; faced right - skip door interaction
; ---------------------------------------------------------------------------

loc_7AB2:        
                pop     ax              ; =0x653f
                jmp     move_hero_left_if_no_obstacles
; ---------------------------------------------------------------------------

enter_the_door:  
                mov     ax, ds:proximity_map_left_col_x ; proximity map left edge in the absolute map coords
                mov     bl, ds:hero_x_in_viewport
                add     bl, 4           ; viewport offset from proximity map margin
                xor     bh, bh
                add     ax, bx          ; hero x absolute
                mov     bx, ds:mapWidth
                dec     bx
                sub     bx, ax
                jnb     short no_wrap
                not     bx
                mov     ax, bx

no_wrap:         
                mov     bl, ds:hero_head_y_in_viewport
                dec     bl
                add     bl, ds:viewport_top_row_y
                and     bl, 3Fh         ; wrap vertically
                mov     si, ds:doors_table_addr

next_door1:       
                cmp     word ptr [si], 0FFFFh ; end of doors marker
                jnz     short loc_7AE8
                retn
; ---------------------------------------------------------------------------

loc_7AE8:        
                cmp     ax, [si+door.x0]
                jnz     short loc_7AF1
                cmp     bl, [si+door.y0]
                jz      short loc_7AF6

loc_7AF1:        
                add     si, 12
                jmp     short next_door1
; ---------------------------------------------------------------------------

loc_7AF6:        
                pop     ax
                test    [si+door.d_flags], 80h
                jnz     short loc_7B25
                call    open_door
                jb      short loc_7B03
                retn
; ---------------------------------------------------------------------------

loc_7B03:        
                mov     byte ptr ds:hero_animation_phase, 80h
                mov     ds:horiz_movement_sub_tile_accum, 0
                test    ds:byte_9F19, 0FFh
                jz      short loc_7B15
                retn
; ---------------------------------------------------------------------------

loc_7B15:        
                mov     ds:byte_9F19, 0FFh
                mov     byte ptr ds:soundFX_request, 22
                mov     dx, offset cant_open_this_door_str
                jmp     render_notification_string
; ---------------------------------------------------------------------------

loc_7B25:        
                mov     bx, [si+door.d_save_achievement_addr]
                cmp     bx, 0FFFFh
                jz      short loc_7B32
                mov     al, [si+door.d_achievement_flag]
                or      [bx], al

loc_7B32:        
                push    si
                call    Browse_Projectiles
                call    clear_viewport_buffer
                call    cs:Flush_Ui_Element_If_Dirty_proc
                call    reset_dungeon_state_vars
                call    game_loop_render_and_timing
                mov     si, ds:monsters_table_addr
                mov     word ptr [si], 0FFFFh ; end-of-monsters marker
                pop     si              ; doors struct
                mov     al, [si+door.d_flags]
                and     al, 111b
                push    ax
                mov     ax, [si+door.x1]
                mov     ds:hero_x_in_proximity_map, ax
                mov     al, [si+door.y1]
                mov     ds:door_target_y, al
                mov     al, [si+door.d_flags]
                and     al, 1000000b
                mov     ds:is_left_run, al
                mov     al, [si+door.d_features]
                mov     ds:door_features, al
                mov     ah, [si+door.d_place_map_id]
                cmp     [si+door.y1], 0FFh
                jnz     short skip_if_cavern
                or      ah, 80h         ; door leads to town

skip_if_cavern:  
                mov     ds:place_map_id, ah ; cavern/town id
                mov     al, 1           ; fn_1 Load mdt
                call    cs:res_dispatcher_proc ; fn0_swap_town_vs_cavern_gfx_drv_and_jmp_bx
                                        ; fn1_load_mdt_idx_ah
                 
                test    byte ptr ds:place_map_id, 80h
                jnz     short skip_if_town ;
                                        ; place is cavern
                call    remove_accomplished_items
skip_if_town:    
                call    hero_left_16_down_1
                mov     si, ds:mdt_buffer
                lodsb
                test    al, 1
                jnz     short loc_7BD0
                mov     si, offset vfs_roka_grp_1
                mov     es, cs:seg1
                mov     di, packed_tile_ptr
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, packed_tile_ptr
                mov     cx, 80h
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                pop     ax  ; door.d_flags & 7
                call    cs:Render_Roca_Tilemap_proc
                mov     ds:mman_grp_index, 0FFh
                mov     byte ptr ds:byte_FF24, 0Ah
                jmp     short loc_7C02
; ---------------------------------------------------------------------------

loc_7BD0:        
                mov     si, offset vfs_roka_grp_2
                mov     es, cs:seg1
                mov     di, packed_tile_ptr
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, packed_tile_ptr
                mov     cx, 80h
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                pop     ax ; door.d_flags & 7
                call    cs:Render_Roca_Tilemap_proc
                mov     si, ds:mdt_buffer ; mdt_descriptor
                lodsb                   ; b7b6_msd_idx_b0
                call    process_mdt_descriptor

loc_7C02:        
                mov     byte ptr ds:hero_hidden_flag, 0
                mov     ds:byte_9EF5, 0FFh
                mov     byte ptr ds:projectiles_array, 0FFh
                test    ds:door_features, 80h
                jz      short loc_7C6E
                mov     si, offset rokademo_bin
                push    cs
                pop     es
                mov     di, 0A000h      ; rokademo.bin loaded
                mov     al, 3           ; fn3_read_virtual_file
                call    cs:res_dispatcher_proc
                call    cs:roca_entrypoint
                mov     ds:enp_grp_index, 0FFh
                mov     ds:eai_bin_index, 0FFh
                mov     al, ds:msd_index
                mov     ds:byte_9EFA, al
                mov     ds:byte_9F02, 0FFh
                call    load_cavern_sprites_ai_music ; load dchr.grp
                                        ; load mpp{mpp_grp_index}.grp
                                        ; load eai{eai_bin_index}.bin
                                        ; load enp{enp_grp_index}.grp
                                        ; load mgt{mgt_msd_index}.msd
                mov     es, cs:seg1
                mov     si, offset vfs_fman_grp
                mov     di, fman_gfx
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                push    ds
                mov     ds, cs:seg1
                mov     si, fman_gfx + 333h  ; TILE_BANK_OFFSET = 0x333
                mov     bp, hero_transparency_masks
                mov     cx, 230
                call    cs:Decompress_Tile_Data_proc
                pop     ds
                jmp     loc_7CF4
; ---------------------------------------------------------------------------
loc_7C6E:        
                test    byte ptr ds:is_left_run, 0FFh
                jnz     short run_to_the_left
                and     byte ptr ds:facing_direction, 11111110b ; run to the right
                mov     bx, 0A6Eh
                mov     cx, 26          ; 26 steps to animate

loc_7C80:        
                push    cx              ; animate hero running in cavern entrance
                push    bx
                inc     byte ptr ds:hero_animation_phase
                call    cs:Update_Local_Attribute_Cache_proc
                pop     bx
                add     bh, 2
                push    bx
                call    cs:Calculate_Tile_VRAM_Address_proc
                call    sleep_loop_handle_system_keys
                pop     bx
                push    bx
                mov     cx, 218h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc
                pop     bx
                pop     cx
                loop    loc_7C80        ; animate hero running in cavern entrance
                mov     cx, 618h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc
                jmp     short loc_7CF4
; ---------------------------------------------------------------------------

run_to_the_left:     
                or      byte ptr ds:facing_direction, 1
                mov     bx, 406Eh
                mov     cx, 26          ; 26 steps to animate

loc_7CBF:        
                push    cx
                push    bx
                inc     byte ptr ds:hero_animation_phase
                call    cs:Update_Local_Attribute_Cache_proc
                pop     bx
                sub     bh, 2
                push    bx
                call    cs:Calculate_Tile_VRAM_Address_proc
                call    sleep_loop_handle_system_keys
                pop     bx
                push    bx
                add     bh, 4
                mov     cx, 218h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc
                pop     bx
                pop     cx
                loop    loc_7CBF
                mov     cx, 618h
                xor     al, al
                call    cs:Draw_Bordered_Rectangle_proc

loc_7CF4:        
                mov     si, ds:mdt_buffer  ; mdt_descriptor
                lodsb                      ; .b7b6_msd_idx_b0
                mov     ah, al
                and     al, 1              ; 0 ? town : dungeon
                jz      short loc_7D64
                ; dungeon init
                call    load_cavern_sprites_ai_music ; load dchr.grp
                                        ; load mpp{mpp_grp_index}.grp
                                        ; load eai{eai_bin_index}.bin
                                        ; load enp{enp_grp_index}.grp
                                        ; load mgt{mgt_msd_index}.msd
                mov     si, ds:mdt_buffer
                lodsb                   ; mdt_descriptor.b7b6_msd_idx_b0
                mov     ah, al
                add     ah, ah
                sbb     bl, bl          ; if ah bit 7 is set => bl = ff (boss cavern)
                mov     ds:is_boss_cavern, bl
                add     ah, ah
                sbb     bl, bl          ; if ah bit 6 was set => bl = ff (Jashiin cavern)
                mov     ds:is_jashiin_cavern, bl
                mov     byte ptr ds:boss_being_hit, 0
                mov     byte ptr ds:sprite_flash_flag, 0
                call    cs:Clear_Viewport_proc
                mov     byte ptr ds:hero_x_in_viewport, 0Ch
                mov     al, ds:hero_head_y_in_viewport_initial_from_mdt
                mov     ds:hero_head_y_in_viewport, al
                mov     ds:byte_9F00, al
                mov     byte ptr ds:hero_animation_phase, 80h ; state IDLE
                push    ds
                mov     ds, cs:seg1
                mov     si, 8030h
                mov     cx, 66h
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                call    cs:NoOperation_proc
                pop     ds
                push    ds
                call    word ptr cs:Load_Magic_Spell_Sprite_Group_proc ; Input: none (uses global current_magic_spell)
                                                                ; Reads corresponding sprite group fron seg2:0 buffer to seg1:9350h
                                                                ; Output: Loads sprite sheet for current_magic_spell
                                                                ; DS:SI -> seg1:9350h buffer

                mov     cx, 24
                call    cs:Reassemble_3_Planes_To_Packed_Bitmap_proc
                pop     ds
                jmp     Cavern_Game_Init
; ---------------------------------------------------------------------------

loc_7D64:        
                mov     si, ds:mdt_buffer
                inc     si
                lodsb                   ; mdt_descriptor.mman_grp_idx
                mov     bl, 11
                mul     bl
                add     ax, offset mman_grp
                mov     si, ax
                mov     es, cs:seg1
                mov     di, 4000h
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                mov     bx, 6000h       ; jump address to the town code

transfer_to_town:
                mov     ax, 1  ; fn1 (Stop) Silences all channels and halts the driver.
                int     60h             ; mscadlib.drv
                push    bx
                call    edge_locking_scrolling_window ; Return:
                                        ; AX: proximity_map_left_col_x
                                        ; BL: hero_x_in_viewport
                mov     ds:proximity_map_left_col_x, ax
                mov     ds:hero_x_in_viewport, bl
                mov     si, ds:mdt_buffer ; mdt_descriptor
                lodsb                   ; b7b6_msd_idx_b0
                shr     al, 1
                and     al, 11111b
                mov     ds:msd_index, al
                mov     bl, 11
                mul     bl
                add     ax, offset vfs_mgt1_msd
                mov     si, ax
                mov     es, cs:seg1
                mov     di, 3000h
                mov     al, 5           ; fn5_load_music
                call    cs:res_dispatcher_proc
                pop     bx
                xor     al, al           ; fn0_swap_town_vs_cavern_gfx_drv_and_jmp_bx
                jmp     cs:res_dispatcher_proc ; on return will jump to the town entry code
try_door_interaction endp
                 

; =============== S U B R O U T I N E =======================================


hero_left_16_down_1 proc near 
                mov     ax, ds:hero_x_in_proximity_map
                add     ax, -16
                or      ah, ah
                jns     short loc_7DCF
                add     ax, ds:mapWidth

loc_7DCF:        
                mov     ds:proximity_map_left_col_x, ax
                mov     al, ds:door_target_y
                inc     al
                sub     al, ds:hero_head_y_in_viewport_initial_from_mdt
                and     al, 3Fh
                mov     ds:viewport_top_row_y, al
                retn
hero_left_16_down_1 endp


; =============== S U B R O U T I N E =======================================

; Return:
; AX: proximity_map_left_col_x
; BL: hero_x_in_viewport
edge_locking_scrolling_window proc near
                mov     bx, 13
                mov     ax, ds:hero_x_in_proximity_map
                mov     cx, ds:mapWidth
                sub     cx, bx
                sub     cx, ax ; mapWidth - 13 - hero_x_in_proximity_map
                jnb     short loc_7E03 ; cx >= 0
                ; hero_x_in_proximity_map > mapWidth - 13
                mov     ax, ds:mapWidth
                add     ax, -36 ; mapWidth - 36; CF = mapWidth >= 36 ? 1 : 0
                mov     cx, ds:hero_x_in_proximity_map
                sbb     cx, ax ; cx = hero_x_in_proximity_map - (mapWidth - 36) - CF
                mov     bl, cl
                sub     bl, 3
                retn
; ---------------------------------------------------------------------------
loc_7E03: ; mapWidth - 13 - hero_x_in_proximity_map >= 0    
                add     ax, -17
                or      ah, ah
                jnz     short loc_7E0B ; ax >= 256
                ; ax = hero_x_in_proximity_map - 17; bl = 13
                retn
; ---------------------------------------------------------------------------
loc_7E0B:        
                xor     ax, ax
                mov     bl, byte ptr ds:hero_x_in_proximity_map
                sub     bl, 4           ; hero_x_in_viewport
                retn
edge_locking_scrolling_window endp


; =============== S U B R O U T I N E =======================================


open_door       proc near 
                mov     bl, [si+door.d_features]
                and     bl, 1
                jnz     short lion_head_key_needed ;
                                        ; ordinary key needed
                test    byte ptr ds:keys_amount, 0FFh
                stc
                jnz     short has_keys
                retn                    ; no keys
; ---------------------------------------------------------------------------

has_keys:        
                dec     byte ptr ds:keys_amount  ; use ordinary key
                mov     byte ptr ds:soundFX_request, 21
                or      [si+door.d_flags], 80h   ; open
                mov     bx, [si+door.d_save_achievement_addr]
                mov     al, [si+door.d_achievement_flag]
                or      [bx], al
                retn
; ---------------------------------------------------------------------------

lion_head_key_needed:     
                test    byte ptr ds:lion_head_keys, 0FFh
                stc
                jnz     short loc_7E45
                retn
; ---------------------------------------------------------------------------

loc_7E45:        
                dec     byte ptr ds:lion_head_keys
                mov     byte ptr ds:soundFX_request, 21
                or      byte ptr [si+door.d_flags], 80h
                mov     bx, [si+door.d_save_achievement_addr]
                mov     al, [si+door.d_achievement_flag]
                or      [bx], al
                retn
open_door       endp


; =============== S U B R O U T I N E =======================================


reset_dungeon_state_vars proc near      ; ...
                xor     al, al
                mov     ds:sword_swing_flag, al
                mov     ds:ui_element_dirty, al
                mov     ds:spell_active_flag, al
                mov     ds:jump_phase_flags, al ; 0: on ground, ff: ascending, 7f: descending, 80h: climbing down off rope
                mov     ds:squat_flag, al
                mov     ds:hero_damage_this_frame, al
                mov     ds:byte_9EEF, al
                mov     ds:byte_FF3E, al
                mov     ds:byte_FF4B, al
                mov     ds:heartbeat_volume, al
                mov     ds:hero_animation_phase, al
                mov     ax, 0FFFFh
                mov     ds:projectiles_array, al
                mov     ds:active_entity_table, al
                mov     word ptr ds:magic_projectiles, ax
                mov     ds:hero_hidden_flag, al
                mov     ds:byte_9EF5, al
                jmp     clear_viewport_buffer
reset_dungeon_state_vars endp


; =============== S U B R O U T I N E =======================================

; AL: mdt_descriptor.b7b6_msd_idx_b0
; SI: &mdt_descriptor+1
process_mdt_descriptor proc near
                push    cs
                pop     es
                mov     di, offset mman_grp_index
                mov     cx, 4
                rep movsb               ; mdt_descr[1..4]
                shr     al, 1           ; mdt_descr[0]>>1
                and     al, 0Fh
                mov     ah, al
                mov     al, 0FFh
                cmp     ah, ds:msd_index
                jz      short loc_7EB6
                mov     byte ptr ds:byte_FF24, 0Ah
                mov     ds:msd_index, ah
                mov     al, ah

loc_7EB6:        
                stosb
                mov     al, 0FFh
                stosb
                retn
process_mdt_descriptor endp


; =============== S U B R O U T I N E =======================================

; load dchr.grp
; load mpp{mpp_grp_index}.grp
; load eai{eai_bin_index}.bin
; load enp{enp_grp_index}.grp
; load mgt{mgt_msd_index}.msd
load_cavern_sprites_ai_music proc near
                mov     es, cs:seg1
                mov     si, offset dchr_grp
                mov     di, 8C00h       ; doors, platforms tiles gfx
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                mov     bl, ds:mpp_grp_index
                mov     al, 11
                mul     bl
                add     ax, offset mpp_grp
                mov     si, ax
                mov     es, cs:seg1
                mov     di, 8000h       ; static cavern tiles gfx
                mov     al, 2           ; fn2_segmented_load
                call    cs:res_dispatcher_proc
                mov     bl, ds:eai_bin_index_
                cmp     bl, 0FFh
                jnz     short loc_7EF3
                retn
; ---------------------------------------------------------------------------

loc_7EF3:        
                cmp     bl, ds:eai_bin_index
                je      short loc_7F12   ; monsters AI already loaded
                mov     ds:eai_bin_index, bl
                mov     al, 11
                mul     bl
                add     ax, offset eai1_bin
                mov     si, ax
                push    cs
                pop     es
                mov     di, offset Monster_AI_proc
                mov     al, 3           ; fn3_read_virtual_file
                call    cs:res_dispatcher_proc

loc_7F12:        
                mov     bl, ds:enp_grp_index_
                cmp     bl, 0FFh
                jnz     short loc_7F1C
                retn
; ---------------------------------------------------------------------------

loc_7F1C:        
                cmp     bl, ds:enp_grp_index
                je      short loc_7F53   ; monsters gfx already loaded
                mov     ds:enp_grp_index, bl
                mov     al, 11
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
loc_7F53:
                mov     bl, ds:byte_9EFA
                cmp     bl, 0FFh
                jnz     short load_music
                retn
; ---------------------------------------------------------------------------
load_music:
                push    bx
                mov     ax, 1  ; fn1 (Stop) Silences all channels and halts the driver.
                int     60h             ; mscadlib.drv
                mov     ds:byte_9F02, 0FFh
                pop     bx              ; music index from mdt_descriptor
                mov     al, 11
                mul     bl
                add     ax, offset vfs_mgt1_msd
                mov     si, ax
                mov     es, cs:seg1
                mov     di, 3000h
                mov     al, 5           ; fn5_load_music
                call    cs:res_dispatcher_proc
                retn
load_cavern_sprites_ai_music endp


; =============== S U B R O U T I N E =======================================


sleep_loop_handle_system_keys proc near
                mov     cl, ds:speed_const
                mov     al, 4
                mul     cl
loc_7F8A:        
                push    ax
                call    cs:Confirm_Exit_Dialog_proc
                call    cs:Handle_Pause_State_proc
                call    cs:Handle_Speed_Change_proc
                call    cs:Joystick_Calibration_proc
                call    cs:Joystick_Deactivator_proc
                pop     ax
                cmp     ds:frame_timer, al
                jb      short loc_7F8A
                mov     byte ptr ds:frame_timer, 0
                retn
sleep_loop_handle_system_keys endp
