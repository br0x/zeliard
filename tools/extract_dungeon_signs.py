#!/usr/bin/env python3
"""extract_dungeon_signs.py — extract English dungeon signpost text from MDTs.

Dungeon ``.mdt`` files keep a sign pointer table behind a word pointer at MDT
offset ``0x17`` (the runtime ``ADDR_CAVERN_SIGNS_INFO``). The renderer resolves
sign ``idx`` as ``desc_ptr = read_u16(table_ptr + idx * 2)``, so the table is a
plain word array of descriptor addresses.

Each descriptor is:

    [0] top_margin   BYTE
    [1] box_height   BYTE
    [2..] per line: x_delta BYTE, characters, terminated by 0x2F (newline) or
          0xFF (end of the whole sign)

The table has no explicit terminator. It ends when an entry is no longer a
plausible MDT address (0xFFFF, 0, or below the MDT load address), which is also
the point where the original code would stop being called with a valid index.

Text is emitted as it is displayed: 0x5C becomes an apostrophe (matching the
drawer's ``ch === 0x5c -> 0x27`` substitution) and control bytes are dropped.
The locale bundle therefore stores final display lines, and the MDT byte path
stays the English fallback.

Usage:
    python3 tools/extract_dungeon_signs.py [--out web/src/locale/dungeon-signs.en.json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

MDT_BASE = 0xC000
SIGNS_TABLE_OFF = 0x17
GAME_DIR = os.path.join("web", "public", "game", "0")

DUNGEON_IDS = [
    "mp10", "mp1d", "mp20", "mp21", "mp2d",
    "mp30", "mp31", "mp3d", "mp40", "mp41", "mp4d",
    "mp50", "mp51", "mp5d", "mp60", "mp61", "mp62", "mp6d",
    "mp70", "mp71", "mp72", "mp73", "mp7d",
    "mp80", "mp81", "mp82", "mp83", "mp84", "mp8d",
    "mp90", "mpa0",
]

MAX_SIGNS = 64


def u16(buf: bytes, off: int) -> int:
    return (buf[off] or 0) | ((buf[off + 1] or 0) << 8)


def ptr_to_offset(ptr: int, size: int) -> int | None:
    if ptr == 0 or ptr == 0xFFFF or ptr < MDT_BASE:
        return None
    off = ptr - MDT_BASE
    return off if off < size else None


def decode_sign(buf: bytes, desc_off: int) -> dict | None:
    size = len(buf)
    if desc_off + 2 > size:
        return None
    top_margin = buf[desc_off]
    box_height = buf[desc_off + 1]

    lines: list[dict] = []
    i = desc_off + 2
    while i < size:
        x_delta = buf[i]
        i += 1
        chars: list[str] = []
        done = False
        while i < size:
            b = buf[i]
            i += 1
            if b == 0xFF:
                done = True
                break
            if b == 0x2F:
                break
            if b == 0x5C:
                chars.append("'")
            elif b >= 0x20:
                chars.append(chr(b))
        lines.append({"xDelta": x_delta, "text": "".join(chars)})
        if done:
            return {"topMargin": top_margin, "boxHeight": box_height, "lines": lines}
    return None


def extract_dungeon(path: str, dungeon_id: str) -> dict:
    with open(path, "rb") as fh:
        buf = fh.read()
    size = len(buf)
    out: dict[str, dict] = {}

    if size < SIGNS_TABLE_OFF + 2:
        return out
    table_off = ptr_to_offset(u16(buf, SIGNS_TABLE_OFF), size)
    if table_off is None:
        return out

    for idx in range(MAX_SIGNS):
        entry_off = table_off + idx * 2
        if entry_off + 1 >= size:
            break
        desc_ptr = u16(buf, entry_off)
        desc_off = ptr_to_offset(desc_ptr, size)
        if desc_off is None:
            break
        decoded = decode_sign(buf, desc_off)
        if decoded is None or not decoded["lines"]:
            break
        out[f"dungeon.{dungeon_id}.sign.{idx}"] = {
            **decoded,
            "_source": {
                "mdt": os.path.basename(path),
                "dungeonId": dungeon_id,
                "signIdx": idx,
                "descriptorAddress": hex(desc_ptr),
            },
        }
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        default=os.path.join("web", "src", "locale", "dungeon-signs.en.json"),
        help="manifest output path",
    )
    args = parser.parse_args()

    if not os.path.isdir(GAME_DIR):
        print(f"error: game directory not found: {GAME_DIR}", file=sys.stderr)
        return 1

    manifest: dict[str, dict] = {}
    for dungeon_id in DUNGEON_IDS:
        mdt_path = os.path.join(GAME_DIR, f"{dungeon_id}.mdt")
        if not os.path.isfile(mdt_path):
            print(f"warn: missing {mdt_path}", file=sys.stderr)
            continue
        manifest.update(extract_dungeon(mdt_path, dungeon_id))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")

    print(f"wrote {len(manifest)} signs to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())