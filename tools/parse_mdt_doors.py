import struct
import sys

BASE_ADDR = 0xC000


def read_word(data, offset):
    return struct.unpack_from('<H', data, offset)[0]


def parse_cavern_name(data, file_off):
    """Parse the cavern name block format: 16 af ?? len string descriptor_byte"""
    if file_off + 4 >= len(data):
        return None, None
    sig1, sig2 = data[file_off], data[file_off + 1]
    flag = data[file_off + 2]
    length = data[file_off + 3]
    if length > 0 and length < 80 and file_off + 4 + length + 1 <= len(data):
        raw = data[file_off + 4:file_off + 4 + length]
        desc_byte = data[file_off + 4 + length]
        try:
            s = raw.decode('cp437')
            return s, desc_byte
        except:
            return raw.hex(), desc_byte
    return None, None


def parse_mdt(path):
    with open(path, 'rb') as f:
        data = f.read()

    print(f"{'='*70}")
    print(f"FILE: {path} ({len(data)} bytes)")
    print(f"{'='*70}")

    desc_ptr     = read_word(data, 0x00)
    map_width    = read_word(data, 0x02)
    vert_off     = read_word(data, 0x04)
    air_off      = read_word(data, 0x06)
    horiz_off    = read_word(data, 0x08)
    doors_off    = read_word(data, 0x0A)
    items_off    = read_word(data, 0x0C)
    cavern_off   = read_word(data, 0x0E)
    monsters_off = read_word(data, 0x10)
    hero_y_view  = read_word(data, 0x16)

    def to_file(addr):
        return addr - BASE_ADDR

    print(f"\nHEADER:")
    for name, ptr in [
        ("Descriptor ptr", desc_ptr),
        ("Map width", None),
        ("Vert platforms offset", vert_off),
        ("Air streams offset", air_off),
        ("Horiz platforms offset", horiz_off),
        ("Doors offset", doors_off),
        ("Items check offset", items_off),
        ("Cavern name offset", cavern_off),
        ("Monsters offset", monsters_off),
    ]:
        if ptr is not None:
            print(f"  {name:26s} 0x{ptr:04X} (file 0x{to_file(ptr):04X})")
        else:
            print(f"  {name:26s} {map_width}")
    print(f"  ADDR_HERO_Y_VIEW_INIT    0x{hero_y_view:04X} (file offset 0x16)")

    cav_fo = to_file(cavern_off)
    cav_name, desc_byte = parse_cavern_name(data, cav_fo) or (None, None)
    print(f"  Cavern name:             {cav_name!r}" if cav_name else f"  Cavern name not found at file 0x{cav_fo:04X}")
    print(f"  Descriptor byte (after name): 0x{desc_byte:02X}" if desc_byte is not None else "")

    desc_fo = to_file(desc_ptr)
    if 0 <= desc_fo < len(data):
        print(f"  Descriptor data (file 0x{desc_fo:04X}): {data[desc_fo:desc_fo+16].hex()}")
    else:
        print(f"  Descriptor: out of range")

    door_file_off = to_file(doors_off)
    print(f"\nDOORS (file offset 0x{door_file_off:04X}, mem 0x{doors_off:04X}):")
    print(f"  {'#':<4} {'x0':<6} {'y0':<4} {'flags':<6} {'map_id':<7} {'x1':<6} {'y1':<4} {'feat':<5} {'save_addr':<10} {'ach_flag':<9} Notes")
    print(f"  {'-'*70}")

    off = door_file_off
    door_idx = 0
    door_list = []
    while off + 2 <= len(data):
        x0 = read_word(data, off)
        if x0 == 0xFFFF:
            print(f"  {'---':<4} 0xFFFF  (door list terminator)")
            off += 2
            break

        y0     = data[off + 2]
        d_flags = data[off + 3]
        map_id = data[off + 4]
        x1     = read_word(data, off + 5)
        y1     = data[off + 7]
        d_feat = data[off + 8]
        s_addr = read_word(data, off + 9)
        ach_fl = data[off + 11]

        is_open = (d_flags & 0x80) != 0
        roka_color = d_flags & 0x07
        boss_exit = (d_feat & 0x80) != 0

        notes = []
        if is_open:
            notes.append("OPEN")
        else:
            notes.append("closed")
        if roka_color:
            notes.append(f"roka={roka_color}")
        if y1 == 0xFF:
            notes.append("→TOWN")
        else:
            notes.append(f"→map{map_id}")
        if boss_exit:
            notes.append("BOSS_EXIT")
        if s_addr != 0xFFFF:
            notes.append(f"save=0x{s_addr:04X}")
        if ach_fl != 0xFF:
            notes.append(f"ach=0x{ach_fl:02X}")

        print(f"  {door_idx:<4} {x0:<6} {y0:<4} 0x{d_flags:02X}  {map_id:<7} {x1:<6} {y1:<4} 0x{d_feat:02X}  0x{s_addr:04X}   0x{ach_fl:02X}     {', '.join(notes)}")
        door_list.append((x0, y0, d_flags, map_id, x1, y1, d_feat, s_addr, ach_fl))
        off += 12
        door_idx += 1

    print()
    return door_list, map_width, cav_name


def main():
    files = [
        '/home/brox/Projects/zeliard/game/0/mp10.mdt',
        '/home/brox/Projects/zeliard/game/0/mp21.mdt',
    ]
    results = {}
    for f in files:
        doors, mw, name = parse_mdt(f)
        results[f] = (doors, mw, name)

    print("=" * 70)
    print("CROSS-MAP DOOR CONNECTIONS")
    print("=" * 70)

    mp10_doors, mp10_mw, mp10_name = results[files[0]]
    mp21_doors, mp21_mw, mp21_name = results[files[1]]

    print(f"\n{mp10_name} (mp10, width={mp10_mw}):")
    for i, (x0, y0, fl, mid, x1, y1, feat, sa, ach) in enumerate(mp10_doors):
        roka = fl & 0x07
        print(f"  Door {i}: ({x0:>3},{y0:>2}) {'OPEN' if fl&0x80 else 'closed'} roka={roka}  →  ({x1:>3},{y1:>3}) {'TOWN' if y1==0xFF else f'map{mid}'}")

    print(f"\n{mp21_name} (mp21, width={mp21_mw}):")
    for i, (x0, y0, fl, mid, x1, y1, feat, sa, ach) in enumerate(mp21_doors):
        roka = fl & 0x07
        print(f"  Door {i}: ({x0:>3},{y0:>2}) {'OPEN' if fl&0x80 else 'closed'} roka={roka}  →  ({x1:>3},{y1:>3}) {'TOWN' if y1==0xFF else f'map{mid}'}")

    print(f"\nPaired connections (bidirectional position matches):")
    for i, d10 in enumerate(mp10_doors):
        x0_10, y0_10, fl10, mid10, x1_10, y1_10 = d10[:6]
        if y1_10 == 0xFF:
            continue
        for j, d21 in enumerate(mp21_doors):
            x0_21, y0_21, fl21, mid21, x1_21, y1_21 = d21[:6]
            if y1_21 == 0xFF:
                continue
            if x1_10 == x0_21 and y1_10 == y0_21 and x0_10 == x1_21 and y0_10 == y1_21:
                print(f"  mp10 Door {i} (roka={fl10&0x07}) <--> mp21 Door {j} (roka={fl21&0x07})")
                print(f"    mp10: ({x0_10},{y0_10}) <-> ({x1_10},{y1_10})")
                print(f"    mp21: ({x0_21},{y0_21}) <-> ({x1_21},{y1_21})")

    print()
    print("Note: map_id in the door entry refers to the destination map number.")
    print("TOWN exits have y1=0xFF.")


if __name__ == '__main__':
    main()
