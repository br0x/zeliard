#!/bin/bash
# Debug build for native debugging with GDB/VS Code

set -e

echo "=== Zeliard Debug Build (Native) ==="

# Create debug directory
mkdir -p build/debug

# Compile to native code for debugging
clang -g -O0 -DDEBUG \
    -o build/debug/zeliard \
    src/fight.c src/data.c src/mdt.c src/string.c src/cavern.c src/unpack.c src/monster_ai.c src/collision.c src/physics.c src/input.c src/hero_movement.c src/combat.c src/boss_ai.c debug_main.c

echo ""
echo "✓ Native debug build complete!"
echo "  Output: build/debug/zeliard"
echo ""
echo "To debug in VS Code:"
echo "  1. Use the 'Debug (Native)' launch configuration"
echo "  2. Set breakpoint in unpack.c"
echo "  3. Run with: build/debug/zeliard WORK/MP10.MDT"
