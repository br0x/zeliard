#!/bin/bash

# Make sure your dosbox-x.conf has the following, for max compilation speed:
# [cpu]
# core=dynamic
# cycles=max
# cputype=auto

cat << 'EOF' > build.bat
path D:\;%PATH%
tasm /m9 snippet.asm >log.txt
tlink /t/x snippet.obj >>log.txt
EOF

dosbox-x -conf test.conf -c "mount c ." \
         -c "mount d ~/Projects/asm/TOOLS" \
         -c "c:" \
         -c "build.bat"

rm *.OBJ build.bat
