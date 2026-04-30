#!/bin/bash

# Make sure your dosbox-x.conf has the following, for max compilation speed:
# [cpu]
# core=dynamic
# cycles=max
# cputype=auto

# BPINT 21 4B to break into com file start

cat << 'EOF' > build.bat
path D:\;%PATH%
tasm /m9 ttl3_sni.asm >log.txt
tlink /t/x ttl3_sni.obj >>log.txt
ttl3_sni.com
exit
EOF

dosbox-x -conf test.conf \
         -c "mount c ." \
         -c "mount d ~/Projects/asm/TOOLS" \
         -c "c:" \
         -c "build.bat"


rm *.OBJ build.bat
