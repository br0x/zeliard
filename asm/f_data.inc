
; ---------------------------------------------------------------------------
you_get_50_gold_str dw 26h
aYouGet50Golds  db 'You get 50 golds.'
                db 0FFh
you_get_100_gold_str dw 22h   
aYouGet100Golds db 'You get 100 golds.'
                db 0FFh
you_get_500_gold_str dw 22h   
aYouGet500Golds db 'You get 500 golds.'
                db 0FFh
you_get_1000_gold_str dw 1Eh  
aYouGet1000Gold db 'You get 1000 golds.'
                db 0FFh
you_get_key_str dw 32h    
aYouGetAKey     db 'You get a Key.'
                db 0FFh
you_have_recovered_str dw 1Ch 
aYouHaveRecover db 'You have recovered.'
                db 0FFh
you_have_recovered_full_str dw 8
aYouHaveRecover_0 db 'You have recovered full.'
                db 0FFh
shield_broken_str dw 3Ch  
aShieldBroken   db 'Shield broken.'
                db 0FFh
cant_open_this_door_str dw 14h
aCanTOpenThisDo db 'Can\t open this door.'
                db 0FFh
nothing_in_the_box_str dw 1Ch 
aNothingInTheBo db 'Nothing in the box.'
                db 0FFh
get_heros_crest_str dw 6  
aYouGetTheHeroS db 'You get the Hero\s Crest.'
                db 0FFh
get_ruzeria_shoes_str dw 0
aYouGetTheRuzer db 'You get the Ruzeria shoes.'
                db 0FFh
you_get_glory_crest_str dw 8  
aYouGetTheGlory db 'You get the Glory Crest.'
                db 0FFh
get_pirika_shoes_str dw 6 
aYouGetThePirik db 'You get the Pirika shoes.'
                db 0FFh
get_feruza_shoes_str dw 6 
aYouGetTheFeruz db 'You get the Feruza shoes.'
                db 0FFh
get_silkarn_shoes_str dw 0
aYouGetTheSilka db 'You get the Silkarn shoes.'
                db 0FFh
get_enchantment_sword_str dw 0
aGetTheEnchantm db 'Get the Enchantment sword.'
                db 0FFh
its_too_hot_str dw 30h    
aItSTooHot      db 'It\s too hot !!'
                db 0FFh
get_lions_head_key_str dw 8   
aGetTheLionSHea db 'Get the lion\s head Key.'
                db 0FFh
; ===========================================================================
; VFS (Virtual File System) resource descriptor tables
; Each entry: [disk_id byte] [file_id byte] [filename string, null-terminated]
; Used by res_dispatcher_proc (fn2/fn3/fn5) to load/decompress assets.
;
; fman.grp   — hero dungeon sprite sheet (24×24 px per frame, 3×3 tiles, mode 8)
; encnt.grp  — encounter intro animation (boss entry screen)
; roka.grp   — dungeon entrance decoration (28×18 tile map, animated palette)
; dchr.grp   — door and platform component tiles (8×8, mode 10)
; mman.grp   — surface towns NPC sprite sheet
; cman.grp   — underground towns NPC sprite sheet
; mpp1-b.grp — dungeon tilesets 1-11 (8×8 tiles, mode 10)
;              Loaded to seg1:8000h as the current dungeon environment
; eai1-8.bin — enemy AI modules 1-8 (regular cavern monster AIs)
; crab/tako/tori/zela/meda/lega/drgn/akma/mao1/mao2.bin — boss AIs
; enp1-8.grp — monster/item sprite sheets 1-8 (16×16 px, 2×2 tiles, mode 11)
; crab/tako/tori/zela/meda/lega/drgn/akma/mao1/mao2.grp — boss sprite sheets
; mgt1-2.msd + ugm1-2.msd — town background music tracks
; mus1-8.msd + mbos/mmao.msd — dungeon music tracks
; ===========================================================================
vfs_fman_grp    db 2
                db 34h
aFmanGrp        db 'FMAN.GRP',0
encnt_grp       db 2      
                db 38h
aEncntGrp       db 'ENCNT.GRP',0
vfs_roka_grp_2  db 2      
                db 35h
aRokaGrp        db 'ROKA.GRP',0
vfs_roka_grp_1  db 1      
                db 3Ah
aRokaGrp_0      db 'ROKA.GRP',0
dchr_grp        db 2      
                db 37h
aDchrGrp        db 'DCHR.GRP',0
rokademo_bin    db 2      
                db 1
aRokademoBin    db 'ROKADEMO.BIN',0
mman_grp        db 1      
                db 1Eh
aMmanGrp        db 'MMAN.GRP',0
                db 1
                db 1Fh
aCmanGrp        db 'CMAN.GRP',0
mpp_grp         db 2      
                db 4Bh
aMpp1Grp        db 'MPP1.GRP',0
                db 2
                db 4Ch
aMpp2Grp        db 'MPP2.GRP',0
                db 2
                db 4Dh
aMpp3Grp        db 'MPP3.GRP',0
                db 2
                db 4Eh
aMpp4Grp        db 'MPP4.GRP',0
                db 2
                db 4Fh
aMpp5Grp        db 'MPP5.GRP',0
                db 2
                db 50h
aMpp6Grp        db 'MPP6.GRP',0
                db 2
                db 51h
aMpp7Grp        db 'MPP7.GRP',0
                db 2
                db 52h
aMpp8Grp        db 'MPP8.GRP',0
                db 2
                db 53h
aMpp9Grp        db 'MPP9.GRP',0
                db 2
                db 54h
aMppaGrp        db 'MPPA.GRP',0
                db 2
                db 55h
aMppbGrp        db 'MPPB.GRP',0
eai1_bin        db 2      
                db 2
aEai1Bin        db 'EAI1.BIN',0
                db 2
                db 0Ah
aCrabBin        db 'CRAB.BIN',0
                db 2
                db 3
aEai2Bin        db 'EAI2.BIN',0
                db 2
                db 0Bh
aTakoBin        db 'TAKO.BIN',0
                db 2
                db 4
aEai3Bin        db 'EAI3.BIN',0
                db 2
                db 0Ch
aToriBin        db 'TORI.BIN',0
                db 2
                db 5
aEai4Bin        db 'EAI4.BIN',0
                db 2
                db 0Dh
aZelaBin        db 'ZELA.BIN',0
                db 2
                db 6
aEai5Bin        db 'EAI5.BIN',0
                db 2
                db 0Eh
aMedaBin        db 'MEDA.BIN',0
                db 2
                db 7
aEai6Bin        db 'EAI6.BIN',0
                db 2
                db 0Fh
aLegaBin        db 'LEGA.BIN',0
                db 2
                db 8
aEai7Bin        db 'EAI7.BIN',0
                db 2
                db 11h
aDrgnBin        db 'DRGN.BIN',0
                db 2
                db 9
aEai8Bin        db 'EAI8.BIN',0
                db 2
                db 12h
aAkmaBin        db 'AKMA.BIN',0
                db 2
                db 13h
aMao1Bin        db 'MAO1.BIN',0
                db 2
                db 14h
aMao2Bin        db 'MAO2.BIN',0
                db 2
                db 10h
aZel2Bin        db 'ZEL2.BIN',0
vfs_enp1_grp    db 2
                db 39h
aEnp1Grp        db 'ENP1.GRP',0
                db 2
                db 41h
aCrabGrp        db 'CRAB.GRP',0
                db 2
                db 3Ah
aEnp2Grp        db 'ENP2.GRP',0
                db 2
                db 42h
aTakoGrp        db 'TAKO.GRP',0
                db 2
                db 3Bh
aEnp3Grp        db 'ENP3.GRP',0
                db 2
                db 43h
aToriGrp        db 'TORI.GRP',0
                db 2
                db 3Ch
aEnp4Grp        db 'ENP4.GRP',0
                db 2
                db 44h
aZelaGrp        db 'ZELA.GRP',0
                db 2
                db 3Dh
aEnp5Grp        db 'ENP5.GRP',0
                db 2
                db 45h
aMedaGrp        db 'MEDA.GRP',0
                db 2
                db 3Eh
aEnp6Grp        db 'ENP6.GRP',0
                db 2
                db 46h
aLegaGrp        db 'LEGA.GRP',0
                db 2
                db 3Fh
aEnp7Grp        db 'ENP7.GRP',0
                db 2
                db 47h
aDrgnGrp        db 'DRGN.GRP',0
                db 2
                db 40h
aEnp8Grp        db 'ENP8.GRP',0
                db 2
                db 48h
aAkmaGrp        db 'AKMA.GRP',0
                db 2
                db 49h
aMao1Grp        db 'MAO1.GRP',0
                db 2
                db 4Ah
aMao2Grp        db 'MAO2.GRP',0
vfs_mgt1_msd    db 1
                db 2Fh
aMgt1Msd        db 'MGT1.MSD',0
                db 1
                db 31h
aUgm1Msd        db 'UGM1.MSD',0
                db 1
                db 30h
aMgt2Msd        db 'MGT2.MSD',0
                db 1
                db 32h
aUgm2Msd        db 'UGM2.MSD',0
                db 2
                db 56h
aMus1Msd        db 'MUS1.MSD',0
                db 2
                db 57h
aMus2Msd        db 'MUS2.MSD',0
                db 2
                db 58h
aMus3Msd        db 'MUS3.MSD',0
                db 2
                db 59h
aMus4Msd        db 'MUS4.MSD',0
                db 2
                db 5Ah
aMus5Msd        db 'MUS5.MSD',0
                db 2
                db 5Bh
aMus6Msd        db 'MUS6.MSD',0
                db 2
                db 5Ch
aMus7Msd        db 'MUS7.MSD',0
                db 2
                db 5Dh
aMus8Msd        db 'MUS8.MSD',0
                db 2
                db 5Eh
aMbosMsd        db 'MBOS.MSD',0
                db 2
                db 60h
aMmaoMsd        db 'MMAO.MSD',0
; ===========================================================================
; PER-DUNGEON STATE VARIABLES
; These are zero-initialised at start and reset on dungeon transitions.
; ===========================================================================
byte_9EED       db 0      
byte_9EEE       db 0      
byte_9EEF       db 0      
byte_9EF0       db 0      
byte_9EF1       db 0      
word_9EF2       dw 0      
byte_9EF4       db 0      
byte_9EF5       db 0FFh   
; ---- Loaded GRP/BIN index cache (from last MDT) ----
mman_grp_index  db 0                    ; mdt_descriptor.mman_grp_idx
mpp_grp_index   db 0                    ; mdt_descriptor.mpp_grp_idx
eai_bin_index_  db 0                    ; mdt_descriptor.eai_bin_idx
enp_grp_index_  db 0                    ; mdt_descriptor.enp_grp_idx
byte_9EFA       db 0      
                db    0
                db    0
                db    0
eai_bin_index   db 0FFh   
enp_grp_index   db 0FFh   
byte_9F00       db 0      
byte_9F01       db 0      
byte_9F02       db 0      
; ---- Map streaming pointers ----
packed_map_ptr_for_prox_left dw 0 ; 9f03
packed_map_ptr_for_prox_right dw 0  ; 9f05
byte_9F07       db 0      
; ---- Hero movement state ----
jump_height_counter db 0  
byte_9F09       db 0      
frame_ticks     db 0      
byte_9F0B       db 0      
height_above_ground db 0  
jump_height_including_shoes db 2 
; ---- Knockback / hit vectors ----
; word_9F0E/9F10: X-component vectors for knockback (set by contact damage)
word_9F0E       dw 0      
word_9F10       dw 0      
; ---- Damage / invincibility ----
accumulated_contact_damage dw 0 
byte_9F14       db 0      
air_up_tile_found db 0    
; ---- Airflow ----
ticks           db 0      
byte_9F17       db 0      
byte_9F18       db 0      
byte_9F19       db 0      
; ---- Map / scroll ----
hero_x_in_proximity_map dw 0  
door_target_y       db 0      
door_features       db 0      
byte_9F1E       db 0      
; ---- Projectile tracking ----
last_projectile_index db 0
; ---- Ice slide state ----
slide_ticks_remaining db 0
horiz_movement_sub_tile_accum db 0
; ---- Input / animation state ----
slide_direction       db 0      
byte_9F23       db 0      
byte_9F24       db 0      
; ---- Temperature / cavern flags ----
temperature_timer db 0    
byte_9F26       db 0      
byte_9F27       db 0      
byte_9F28       db 0      
byte_9F29       db 0      
byte_9F2A       db 0      
byte_9F2B       db 0      
delta_x         db 0      
delta_y         db 0      
byte_9F2E       db 0D2h dup(?)

