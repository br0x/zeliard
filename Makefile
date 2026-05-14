CC = emcc

SRCDIR = src
BUILDDIR = build
TARGET = $(BUILDDIR)/zeliard.js
EM_CACHE_DIR = $(CURDIR)/$(BUILDDIR)/.emcache

SOURCES = $(wildcard $(SRCDIR)/*.c)

CFLAGS = -O0 -Wall -Wextra -g -gsource-map --source-map-base "http://localhost:8000/" -s ASSERTIONS=1 -s SAFE_HEAP=1

EMFLAGS = \
  -s WASM=1 \
  -s INITIAL_MEMORY=1048576 \
  -s STACK_SIZE=65536 \
  -s EXPORTED_FUNCTIONS='["_wasm_init","_get_memory_base","_wasm_get_mem_ptr","_wasm_town_init",\
"_wasm_town_set_return_before_main_loop","_wasm_town_entry_disabling_edge_scroll","_wasm_town_entry_enabling_edge_scroll",\
"_wasm_town_update","_wasm_town_full_tick","_wasm_town_set_input_keys","_wasm_set_scroll_floor_right_8px",\
"_wasm_set_scroll_floor_left_8px","_wasm_set_scroll_ceiling_right_4px","_wasm_set_scroll_ceiling_left_4px"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'

all: $(TARGET)

$(TARGET): $(SOURCES)
	mkdir -p $(BUILDDIR)
	EM_CACHE=$(EM_CACHE_DIR) $(CC) $(CFLAGS) $(EMFLAGS) -o $@ $(SOURCES)

clean:
	rm -rf $(BUILDDIR)
