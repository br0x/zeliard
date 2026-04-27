# Makefile for Zeliard WASM build using clang
# No Emscripten required!

CC = clang
CFLAGS = -Wall -Wextra -O2 -I.
WASM_FLAGS = --target=wasm32 -nostdlib -ffreestanding -fno-builtin

LDFLAGS = -Wl,--no-entry -Wl,--export-all \
          -Wl,--export=__heap_base -Wl,--export=__data_end \
          -Wl,--export=Cavern_Game_Init \
          -Wl,--export=unpack_map \
          -Wl,--export=unpack_map_internal \
          -Wl,--export=Monster_AI \
          -Wl,--export=update_all_monsters_in_map \
          -Wl,--export=get_memory_base \
          -Wl,--export=input_init \
          -Wl,--export=input_update \
          -Wl,--export=input_set_keys \
          -Wl,--export=input_get_current_keys \
          -Wl,--export=input_get_debug_counter \
          -Wl,--export=town_to_dungeon_transition \
          -Wl,--export=hero_movement_init \
          -Wl,--export=hero_movement_update \
          -Wl,--export=hero_get_direction \
          -Wl,--export=hero_get_state \
          -Wl,--export=hero_is_moving \
          -Wl,--export=update_horizontal_platforms \
          -Wl,--export=hero_interaction_check \
          -Wl,--export=combat_init \
          -Wl,--export=combat_update \
          -Wl,--export=get_combat_timer \
          -Wl,--export=init_boss_battle \
          -Wl,--export=update_boss_battle \
          -Wl,--export=get_boss_hp \
          -Wl,--export=get_boss_max_hp \
          -Wl,--export=is_boss_defeated \
          -Wl,--initial-memory=67108864 \
          -g

SRCDIR = .
BUILDDIR = ../build

SOURCES = $(SRCDIR)/fight.c \
          $(SRCDIR)/data.c \
          $(SRCDIR)/mdt.c \
          $(SRCDIR)/cavern.c \
          $(SRCDIR)/unpack.c \
          $(SRCDIR)/monster_ai.c \
          $(SRCDIR)/hero_movement.c \
          $(SRCDIR)/input.c \
          $(SRCDIR)/collision.c \
          $(SRCDIR)/physics.c \
          $(SRCDIR)/combat.c \
          $(SRCDIR)/boss_ai.c \
          $(SRCDIR)/string.c

TARGET = $(BUILDDIR)/zeliard.wasm

all: $(TARGET)

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

$(TARGET): $(SOURCES) zeliard.h | $(BUILDDIR)
	$(CC) $(WASM_FLAGS) $(CFLAGS) $(LDFLAGS) -o $@ $(SOURCES)

clean:
	rm -rf $(BUILDDIR)

.PHONY: all clean
