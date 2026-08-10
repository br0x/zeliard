#!/bin/bash

# Make sure your dosbox-x.conf has the following, for max compilation speed:
# [cpu]
# core=dynamic
# cycles=max
# cputype=auto

cat << 'EOF' > build.bat
path D:\;%PATH%
tasm /m9 zeliard.asm >log.txt
link zeliard.obj, zeliard.exe /CPARMAXALLOC:513; >>log.txt
tasm /m9 mscadlib.asm >>log.txt
tlink mscadlib.obj >>log.txt
tasm /m9 sndadlib.asm >>log.txt
tlink sndadlib.obj >>log.txt
tasm /m9 stick.asm >>log.txt
tlink stick.obj >>log.txt
tasm /m9 game.asm >>log.txt
tlink game.obj >>log.txt
tasm /m9 mole.asm >>log.txt
tlink mole.obj >>log.txt
tasm /m9 gmmcga.asm >>log.txt
tlink gmmcga.obj >>log.txt
tasm /m9 gdmcga.asm >>log.txt
tlink gdmcga.obj >>log.txt
tasm /m9 gtmcga.asm >>log.txt
tlink gtmcga.obj >>log.txt
tasm /m9 gfmcga.asm >>log.txt
tlink gfmcga.obj >>log.txt
tasm /m9 ympd.asm >>log.txt
tlink ympd.obj >>log.txt
tasm /m9 ckpd.asm >>log.txt
tlink ckpd.obj >>log.txt
tasm /m9 opdemo.asm >>log.txt
tlink opdemo.obj >>log.txt
tasm /m9 town.asm >>log.txt
tlink town.obj >>log.txt
tasm /m9 rokademo.asm >>log.txt
tlink rokademo.obj >>log.txt
tasm /m9 kingpro.asm >>log.txt
tlink kingpro.obj >>log.txt
tasm /m9 kenjpro.asm >>log.txt
tlink kenjpro.obj >>log.txt
tasm /m9 armrpro.asm >>log.txt
tlink armrpro.obj >>log.txt
tasm /m9 drugpro.asm >>log.txt
tlink drugpro.obj >>log.txt
tasm /m9 bankpro.asm >>log.txt
tlink bankpro.obj >>log.txt
tasm /m9 churpro.asm >>log.txt
tlink churpro.obj >>log.txt
tasm /m9 innapro.asm >>log.txt
tlink innapro.obj >>log.txt
tasm /m9 fight.asm >>log.txt
tlink fight.obj >>log.txt
tasm /m9 select.asm >>log.txt
tlink select.obj >>log.txt
tasm /m9 eai1.asm >>log.txt
tlink eai1.obj >>log.txt
tasm /m9 eai2.asm >>log.txt
tlink eai2.obj >>log.txt
tasm /m9 eai3.asm >>log.txt
tlink eai3.obj >>log.txt
tasm /m9 eai4.asm >>log.txt
tlink eai4.obj >>log.txt
tasm /m9 eai5.asm >>log.txt
tlink eai5.obj >>log.txt
tasm /m9 eai6.asm >>log.txt
tlink eai6.obj >>log.txt
tasm /m9 eai7.asm >>log.txt
tlink eai7.obj >>log.txt
tasm /m9 eai8.asm >>log.txt
tlink eai8.obj >>log.txt
tasm /m9 crab.asm >>log.txt
tlink crab.obj >>log.txt
tasm /m9 tako.asm >>log.txt
tlink tako.obj >>log.txt
tasm /m9 tori.asm >>log.txt
tlink tori.obj >>log.txt
tasm /m9 zela.asm >>log.txt
tlink zela.obj >>log.txt
tasm /m9 meda.asm >>log.txt
tlink meda.obj >>log.txt
tasm /m9 lega.asm >>log.txt
tlink lega.obj >>log.txt
tasm /m9 drgn.asm >>log.txt
tlink drgn.obj >>log.txt
tasm /m9 zel2.asm >>log.txt
tlink zel2.obj >>log.txt
tasm /m9 akma.asm >>log.txt
tlink akma.obj >>log.txt
tasm /m9 mao1.asm >>log.txt
tlink mao1.obj >>log.txt
exit
EOF

rm *.bin

dosbox-x -c "mount c ." \
         -c "mount d ~/Projects/asm/TOOLS" \
         -c "c:" \
         -c "build.bat"

python3 exe2bin.py MSCADLIB.EXE mscadlib.drv 0x100
python3 exe2bin.py SNDADLIB.EXE sndadlib.drv 0x1100
python3 exe2bin.py STICK.EXE stick.bin 0x100
python3 exe2bin.py GAME.EXE game.bin 0xA000
python3 exe2bin.py MOLE.EXE mole.bin 0
python3 exe2bin.py GMMCGA.EXE gmmcga.bin 0x2000
python3 exe2bin.py GDMCGA.EXE gdmcga.bin 0x3000
python3 exe2bin.py GTMCGA.EXE gtmcga.bin 0x3000
python3 exe2bin.py GFMCGA.EXE gfmcga.bin 0x3000
python3 exe2bin.py YMPD.EXE ympd.bin 0x3300
python3 exe2bin.py CKPD.EXE ckpd.bin 0x3300
python3 exe2bin.py OPDEMO.EXE opdemo.bin 0x6000
python3 exe2bin.py TOWN.EXE town.bin 0x6000
python3 exe2bin.py ROKADEMO.EXE rokademo.bin 0xA000
python3 exe2bin.py KINGPRO.EXE kingpro.bin 0xA000
python3 exe2bin.py KENJPRO.EXE kenjpro.bin 0xA000
python3 exe2bin.py ARMRPRO.EXE armrpro.bin 0xA000
python3 exe2bin.py DRUGPRO.EXE drugpro.bin 0xA000
python3 exe2bin.py BANKPRO.EXE bankpro.bin 0xA000
python3 exe2bin.py CHURPRO.EXE churpro.bin 0xA000
python3 exe2bin.py INNAPRO.EXE innapro.bin 0xA000
python3 exe2bin.py FIGHT.EXE fight.bin 0x6000
python3 exe2bin.py SELECT.EXE select.bin 0xA000
python3 exe2bin.py EAI1.EXE eai1.bin 0xA000
python3 exe2bin.py EAI2.EXE eai2.bin 0xA000
python3 exe2bin.py EAI3.EXE eai3.bin 0xA000
python3 exe2bin.py EAI4.EXE eai4.bin 0xA000
python3 exe2bin.py EAI5.EXE eai5.bin 0xA000
python3 exe2bin.py EAI6.EXE eai6.bin 0xA000
python3 exe2bin.py EAI7.EXE eai7.bin 0xA000
python3 exe2bin.py EAI8.EXE eai8.bin 0xA000
python3 exe2bin.py CRAB.EXE crab.bin 0xA000
python3 exe2bin.py TAKO.EXE tako.bin 0xA000
python3 exe2bin.py TORI.EXE tori.bin 0xA000
python3 exe2bin.py ZELA.EXE zela.bin 0xA000
python3 exe2bin.py MEDA.EXE meda.bin 0xA000
python3 exe2bin.py LEGA.EXE lega.bin 0xA000
python3 exe2bin.py DRGN.EXE drgn.bin 0xA000
python3 exe2bin.py ZEL2.EXE zel2.bin 0xA000
python3 exe2bin.py AKMA.EXE akma.bin 0xA000
python3 exe2bin.py MAO1.EXE mao1.bin 0xA000

echo "ZELIARD.EXE diffs:" >diff.txt
{ cmp -l ../game/zeliard.exe ZELIARD.EXE | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "mscadlib.drv diffs:" >>diff.txt
{ cmp -l ../game/mscadlib.drv mscadlib.drv | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "sndadlib.drv diffs:" >>diff.txt
{ cmp -l ../game/sndadlib.drv sndadlib.drv | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "stick.bin diffs:" >>diff.txt
{ cmp -l ../game/stick.bin stick.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "game.bin diffs:" >>diff.txt
{ cmp -l ../game/game.bin game.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "mole.bin diffs:" >>diff.txt
{ cmp -l ../game/0/mole.bin mole.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "gmmcga.bin diffs:" >>diff.txt
{ cmp -l ../game/gmmcga.bin gmmcga.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "gdmcga.bin diffs:" >>diff.txt
{ cmp -l ../game/0/gdmcga.bin gdmcga.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "gtmcga.bin diffs:" >>diff.txt
{ cmp -l ../game/0/gtmcga.bin gtmcga.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "gfmcga.bin diffs:" >>diff.txt
{ cmp -l ../game/0/gfmcga.bin gfmcga.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "ympd.bin diffs:" >>diff.txt
{ cmp -l ../game/0/ympd.bin ympd.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "ckpd.bin diffs:" >>diff.txt
{ cmp -l ../game/0/ckpd.bin ckpd.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "opdemo.bin diffs:" >>diff.txt
{ cmp -l ../game/0/opdemo.bin opdemo.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "town.bin diffs:" >>diff.txt
{ cmp -l ../game/0/town.bin town.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "rokademo.bin diffs:" >>diff.txt
{ cmp -l ../game/0/rokademo.bin rokademo.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "kingpro.bin diffs:" >>diff.txt
{ cmp -l ../game/0/kingpro.bin kingpro.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "kenjpro.bin diffs:" >>diff.txt
{ cmp -l ../game/0/kenjpro.bin kenjpro.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "armrpro.bin diffs:" >>diff.txt
{ cmp -l ../game/0/armrpro.bin armrpro.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "drugpro.bin diffs:" >>diff.txt
{ cmp -l ../game/0/drugpro.bin drugpro.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "bankpro.bin diffs:" >>diff.txt
{ cmp -l ../game/0/bankpro.bin bankpro.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "churpro.bin diffs:" >>diff.txt
{ cmp -l ../game/0/churpro.bin churpro.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "innapro.bin diffs:" >>diff.txt
{ cmp -l ../game/0/innapro.bin innapro.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "fight.bin diffs:" >>diff.txt
{ cmp -l ../game/0/fight.bin fight.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "select.bin diffs:" >>diff.txt
{ cmp -l ../game/0/select.bin select.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "eai1.bin diffs:" >>diff.txt
{ cmp -l ../game/0/eai1.bin eai1.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "eai2.bin diffs:" >>diff.txt
{ cmp -l ../game/0/eai2.bin eai2.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "eai3.bin diffs:" >>diff.txt
{ cmp -l ../game/0/eai3.bin eai3.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "eai4.bin diffs:" >>diff.txt
{ cmp -l ../game/0/eai4.bin eai4.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "eai5.bin diffs:" >>diff.txt
{ cmp -l ../game/0/eai5.bin eai5.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "eai6.bin diffs:" >>diff.txt
{ cmp -l ../game/0/eai6.bin eai6.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "eai7.bin diffs:" >>diff.txt
{ cmp -l ../game/0/eai7.bin eai7.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "eai8.bin diffs:" >>diff.txt
{ cmp -l ../game/0/eai8.bin eai8.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "crab.bin diffs:" >>diff.txt
{ cmp -l ../game/0/crab.bin crab.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "tako.bin diffs:" >>diff.txt
{ cmp -l ../game/0/tako.bin tako.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "tori.bin diffs:" >>diff.txt
{ cmp -l ../game/0/tori.bin tori.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "zela.bin diffs:" >>diff.txt
{ cmp -l ../game/0/zela.bin zela.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "meda.bin diffs:" >>diff.txt
{ cmp -l ../game/0/meda.bin meda.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "lega.bin diffs:" >>diff.txt
{ cmp -l ../game/0/lega.bin lega.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "drgn.bin diffs:" >>diff.txt
{ cmp -l ../game/0/drgn.bin drgn.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "zel2.bin diffs:" >>diff.txt
{ cmp -l ../game/0/zel2.bin zel2.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "akma.bin diffs:" >>diff.txt
{ cmp -l ../game/0/akma.bin akma.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
echo "mao1.bin diffs:" >>diff.txt
{ cmp -l ../game/0/mao1.bin mao1.bin | gawk '{printf "0x%08X: %02X %02X\n", $1-1, strtonum(0$2), strtonum(0$3)}'; } >>diff.txt 2>&1
rm *.EXE *.MAP *.OBJ build.bat
