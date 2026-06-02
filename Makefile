CC = emcc

SRCDIR = src
BUILDDIR = build
TARGET = $(BUILDDIR)/zeliard.js
EM_CACHE_DIR = $(CURDIR)/$(BUILDDIR)/.emcache
SOURCE_MAP_BASE ?= http://localhost:8000/build/

SOURCES = $(wildcard $(SRCDIR)/*.c)

CFLAGS = -O0 -Wall -Wextra -g3 -gsource-map --source-map-base "$(SOURCE_MAP_BASE)" -s ASSERTIONS=1 -s SAFE_HEAP=1

EMFLAGS = \
  -s WASM=1 \
  -s INITIAL_MEMORY=1048576 \
  -s STACK_SIZE=65536 \
  -s EXPORTED_FUNCTIONS='["_wasm_init","_get_memory_base","_wasm_get_mem_ptr","_wasm_load_mdt","_wasm_town_init",\
"_wasm_town_set_return_before_main_loop","_wasm_town_entry_disabling_edge_scroll","_wasm_town_entry_enabling_edge_scroll",\
"_wasm_town_update","_wasm_town_full_tick","_wasm_town_set_input_keys","_wasm_set_scroll_floor_right_8px",\
"_wasm_set_scroll_floor_left_8px","_wasm_set_scroll_ceiling_right_4px","_wasm_set_scroll_ceiling_left_4px",\
"_wasm_town_complete_transition","_wasm_get_pending_transition_map",\
"_wasm_get_pending_transition_pat","_wasm_get_pending_transition_dir","_wasm_town_conversation_finish",\
"_wasm_town_building_finish","_wasm_dungeon_init","_wasm_dungeon_update","_wasm_dungeon_full_tick",\
"_wasm_dungeon_get_full_map_ptr","_wasm_dungeon_get_viewport_top","_wasm_dungeon_get_entity_table",\
"_wasm_dungeon_get_entity_count","_wasm_dungeon_get_sword_frame","_wasm_dungeon_get_exit_flag",\
"_wasm_dungeon_get_exit_map","_wasm_dungeon_clear_exit"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'

.PHONY: all clean serve

all: $(TARGET)

$(TARGET): $(SOURCES) Makefile
	mkdir -p $(BUILDDIR)
	EM_CACHE=$(EM_CACHE_DIR) $(CC) $(CFLAGS) $(EMFLAGS) -o $@ $(SOURCES)

clean:
	rm -rf $(BUILDDIR)

serve:
	python3 -m http.server 8000
