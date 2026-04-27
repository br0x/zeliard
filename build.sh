#!/bin/bash
# Build script for Zeliard WASM using clang
# No Emscripten required!

set -e

echo "=== Zeliard WASM Build (clang) ==="

# Check if clang is available
if ! command -v clang &> /dev/null; then
    echo ""
    echo "ERROR: clang not found!"
    echo ""
    echo "Install clang:"
    echo "  Ubuntu/Debian: sudo apt install clang"
    echo "  macOS: xcode-select --install"
    echo "  Windows: Install LLVM from https://llvm.org"
    echo ""
    exit 1
fi

echo "Found clang: $(clang --version | head -1)"

# Create build directory
mkdir -p build

# Compile C to WebAssembly
echo "Compiling to WebAssembly..."

clang --target=wasm32 -nostdlib -ffreestanding -fno-builtin \
    -Wl,--no-entry -Wl,--export-all \
    -Wl,--export=__heap_base -Wl,--export=__data_end \
    -Wl,--export=Cavern_Game_Init \
    -Wl,--export=prepare_dungeon \
    -Wl,--export=wasm_init_cavern_with_prepare \
    -Wl,--export=unpack_map \
    -Wl,--export=unpack_map_internal \
    -Wl,--export=Monster_AI \
    -Wl,--export=update_all_monsters_in_map \
    -Wl,--export=get_memory_base \
    -Wl,--export=check_collision_E2 \
    -Wl,--export=check_collision_W2 \
    -Wl,--export=check_collision_N2 \
    -Wl,--export=check_collision_S2 \
    -Wl,--export=check_collision_NE2 \
    -Wl,--export=check_collision_SE2 \
    -Wl,--export=check_collision_NW2 \
    -Wl,--export=check_collision_SW2 \
    -Wl,--export=if_passable_set_ZF \
    -Wl,--export=physics_init \
    -Wl,--export=physics_update \
    -Wl,--export=sub_64BB \
    -Wl,--export=sub_6DB1 \
    -Wl,--export=is_over_rope \
    -Wl,--export=start_jump \
    -Wl,--export=start_climb_rope \
    -Wl,--export=climb_up_rope \
    -Wl,--export=climb_down_rope \
    -Wl,--export=input_init \
    -Wl,--export=input_update \
    -Wl,--export=input_set_keys \
    -Wl,--export=input_get_current_keys \
    -Wl,--export=input_get_pressed_keys \
    -Wl,--export=input_get_released_keys \
    -Wl,--export=input_is_key_pressed \
    -Wl,--export=input_is_key_held \
    -Wl,--export=input_is_key_released \
    -Wl,--export=town_to_dungeon_transition \
    -Wl,--export=hero_movement_init \
    -Wl,--export=hero_movement_update \
    -Wl,--export=hero_get_direction \
    -Wl,--export=hero_get_state \
    -Wl,--export=hero_is_moving \
    -Wl,--export=get_debug_input_received \
    -Wl,--export=move_platform_up \
    -Wl,--export=move_platform_down \
    -Wl,--export=update_horizontal_platforms \
    -Wl,--export=hero_interaction_check \
    -Wl,--export=combat_init \
    -Wl,--export=combat_update \
    -Wl,--export=Hero_Hits_monster \
    -Wl,--export=Get_Stats \
    -Wl,--export=get_combat_timer \
    -Wl,--export=init_boss_battle \
    -Wl,--export=update_boss_battle \
    -Wl,--export=boss_take_damage \
    -Wl,--export=get_boss_hp \
    -Wl,--export=get_boss_max_hp \
    -Wl,--export=is_boss_defeated \
    -Wl,--initial-memory=67108864 \
    -O2 \
    -g \
    -o build/zeliard.wasm \
    src/fight.c src/data.c src/mdt.c src/string.c src/cavern.c src/unpack.c src/monster_ai.c src/collision.c src/physics.c src/input.c src/hero_movement.c src/combat.c src/boss_ai.c

echo ""
echo "✓ Build complete!"
echo "  Output: build/zeliard.wasm"
echo ""
echo "To test: python3 -m http.server 8000"
echo "Then open: http://localhost:8000/index.html"
