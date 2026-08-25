EMSCRIPTEN_ROOT ?= $(HOME)/emsdk/upstream/emscripten
CC = $(EMSCRIPTEN_ROOT)/emcc

SRCDIR = src
BUILDDIR = build
TARGET = $(BUILDDIR)/zeliard.js
EM_CACHE_DIR = $(CURDIR)/$(BUILDDIR)/.emcache

SOURCES = $(wildcard $(SRCDIR)/*.c)

# Release build by default; `make DEBUG=1` for a debuggable wasm
# (-O0 + source maps + runtime assertions).
ifeq ($(DEBUG),1)
SOURCE_MAP_BASE ?= http://localhost:5173/build/
CFLAGS = -O0 -Wall -Wextra -g3 -gsource-map --source-map-base "$(SOURCE_MAP_BASE)" -s ASSERTIONS=1 -s SAFE_HEAP=1
else
CFLAGS = -O2 -Wall -Wextra
endif

EMFLAGS = \
  -s WASM=1 \
  -s INITIAL_MEMORY=1048576 \
  -s STACK_SIZE=65536 \
  -s EXPORTED_FUNCTIONS='["_wasm_init","_get_memory_base","_wasm_get_mem_ptr","_wasm_town_init",\
"_wasm_town_set_return_before_main_loop","_wasm_town_entry_disabling_edge_scroll","_wasm_town_entry_enabling_edge_scroll",\
"_wasm_town_update","_wasm_town_full_tick","_wasm_set_input_keys","_wasm_set_scroll_floor_right_8px",\
"_wasm_set_scroll_floor_left_8px","_wasm_set_scroll_ceiling_right_4px","_wasm_set_scroll_ceiling_left_4px",\
"_wasm_town_complete_transition","_wasm_get_pending_transition_map","_wasm_init_c015_obj_if_exists",\
"_wasm_get_pending_transition_pat","_wasm_get_pending_transition_dir","_wasm_town_conversation_finish",\
"_wasm_town_building_finish","_wasm_dungeon_init","_wasm_dungeon_update","_wasm_dungeon_full_tick",\
"_wasm_dungeon_get_viewport_top","_wasm_dungeon_get_entity_table","_wasm_dungeon_get_entity_count",\
"_wasm_dungeon_get_state","_wasm_dungeon_get_render_request","_wasm_dungeon_clear_render_request",\
"_wasm_finish_rokademo_transition",\
"_wasm_debug_unpack_map","_wasm_debug_monster_move","_wasm_debug_check_collision","_wasm_debug_hero_reset","_wasm_debug_get_packed_cursors","_wasm_debug_move_hero_right","_wasm_debug_move_hero_left","_wasm_debug_jump_press",\
"_wasm_debug_try_climb_rope","_wasm_debug_platform_up","_wasm_debug_platform_collapse","_wasm_debug_check_floor","_wasm_debug_land_after_jump","_wasm_debug_slope_assist","_wasm_debug_move_platform_down","_wasm_debug_update_all_monsters","_wasm_debug_monster_activation","_wasm_debug_check_aligned_tick","_wasm_debug_check_aggressive_ground","_wasm_debug_apply_sword_hit","_wasm_debug_hero_hits_monster","_wasm_debug_get_stats","_wasm_debug_update_hero_xp","_wasm_debug_set_entropy","_wasm_debug_get_entropy","_wasm_debug_get_random","_wasm_debug_monsters_spawning","_wasm_debug_place_monster_run_ai","_wasm_debug_flag_10","_wasm_debug_flag_11","_wasm_debug_flag_12","_wasm_debug_flag_13","_wasm_debug_flag_14","_wasm_debug_flag_16","_wasm_debug_flag_17","_wasm_debug_flag_18","_wasm_debug_flag_19","_wasm_debug_flag_1a","_wasm_debug_flag_1c","_wasm_debug_flag_1d","_wasm_debug_flag_1e","_wasm_debug_chest_handler","_wasm_debug_check_hero_contact_damage","_wasm_debug_step_on_aggressive_ground","_wasm_debug_set_dungeon_statics","_wasm_debug_monster_ai_1","_wasm_debug_monster_ai_2","_wasm_debug_monster_ai_3","_wasm_debug_monster_ai_4","_wasm_debug_monster_ai_5","_wasm_debug_monster_ai_6","_wasm_debug_monster_ai_7","_wasm_debug_monster_ai_8","_wasm_debug_set_eai7_distances","_wasm_debug_set_skip_roka_run","_wasm_debug_dungeon_update","_wasm_debug_update_and_render_horiz_platforms","_wasm_debug_render_vertical_platforms","_wasm_debug_process_collapsing_platforms","_wasm_debug_magia_stone_updates","_wasm_debug_render_magia_stone_effect","_wasm_debug_check_airflows_on_hero","_wasm_debug_update_boss_heartbeat_volume","_wasm_debug_process_doors","_wasm_debug_dispatch_spell_movement","_wasm_debug_projectiles_collision_processing","_wasm_debug_render_sword_overlay","_wasm_set_door_x1","_wasm_test_guerra"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s ERROR_ON_UNDEFINED_SYMBOLS=0

.PHONY: all clean serve

all: $(TARGET)

$(TARGET): $(SOURCES) Makefile
	mkdir -p $(BUILDDIR)
	EM_CACHE=$(EM_CACHE_DIR) $(CC) $(CFLAGS) $(EMFLAGS) -o $@ $(SOURCES)

clean:
	rm -rf $(BUILDDIR)

serve:
	python3 -m http.server 8000
