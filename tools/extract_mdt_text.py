#!/usr/bin/env python3
"""extract_mdt_text.py — extract English NPC conversation text from town MDTs.

Reads each town ``.mdt`` in ``web/public/game/0``, walks the NPC conversation
pointer table (header word at offset 0x0d), and emits a JSON manifest keyed by
stable town/NPC ids (``town.cmap.npc.0`` …).

The emitted text preserves forced line breaks as ``/`` and renders the original
byte quirks the same way ``parseDialogText`` does (0x5C -> apostrophe, 0x26 ->
space). Gameplay control codes are recorded as metadata (``endCode``) instead of
being embedded in the translated strings, so a later encoder can rebuild a byte
stream with the same required codes.

Usage:
    python3 tools/extract_mdt_text.py [--out web/src/locale/town-conversations.en.json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

MDT_BASE = 0xC000
GAME_DIR = os.path.join("web", "public", "game", "0")

# Town MDT basename -> stable locale id suffix (matches `town.names` keys).
TOWN_IDS = [
    "cmap", "mrmp", "stmp", "bsmp", "hlmp",
    "tmmp", "drmp", "llmp", "prmp", "esmp",
]

# Terminal / gameplay control codes and their stable metadata names.
END_CODES = {
    0x81: "yesNo",
    0x83: "elfCrest",
    0x87: "pattern5",
    0x89: "purchase",
    0x8B: "tear",
}


def u16(buf: bytes, offset: int) -> int:
    return (buf[offset] or 0) | ((buf[offset + 1] or 0) << 8)


def conversation_pointer_table(buf: bytes) -> list[int]:
    """Return the absolute conversation text pointers for a town MDT.

    The table has no explicit length: it is terminated by the first entry that
    is zero or falls outside the file.
    """
    table_abs = u16(buf, 0x0D)
    table_off = table_abs - MDT_BASE
    pointers: list[int] = []
    i = 0
    while True:
        entry_off = table_off + i * 2
        if entry_off + 1 >= len(buf):
            break
        addr = u16(buf, entry_off)
        if addr == 0:
            break
        text_off = addr - MDT_BASE
        if text_off < 0 or text_off >= len(buf):
            break
        pointers.append(addr)
        i += 1
    return pointers


def decode_conversation(buf: bytes, abs_ptr: int) -> dict:
    """Decode one conversation stream into raw printable text + code metadata.

    Printable bytes are preserved verbatim so re-encoding reproduces the exact
    original stream. `/` is the only textual convention translators need.
    """
    off = abs_ptr - MDT_BASE
    text: list[str] = []
    end_code: str | None = None
    controls: list[int] = []

    i = off
    while i < len(buf):
        b = buf[i]
        if b == 0xFF or b == 0x00:
            break
        if b in END_CODES:
            end_code = END_CODES[b]
            controls.append(b)
            break
        if b == 0x85:
            # No-op stub in parseDialogText; skip but record it.
            controls.append(b)
            i += 1
            continue
        if b >= 0x82:
            # Unhandled code terminates parsing; keep it as raw metadata.
            controls.append(b)
            break
        if b >= 0x20:
            # Keep the raw printable byte (0x2F stays '/', 0x5C stays '\',
            # 0x26 stays '&'). Remapping them would move word-wrap points,
            # because parseDialogText only breaks lines at a literal 0x20.
            text.append(chr(b))
        # bytes < 0x20 are skipped by parseDialogText
        i += 1

    return {
        "text": "".join(text),
        "endCode": end_code,
        # Original control-code bytes, for the round-trip test.
        "controlBytes": controls,
        "byteAddress": abs_ptr,
    }


def extract_town(mdt_path: str, town_id: str) -> dict:
    with open(mdt_path, "rb") as fh:
        buf = fh.read()
    pointers = conversation_pointer_table(buf)
    entries: dict[str, dict] = {}
    for npc_id, abs_ptr in enumerate(pointers):
        decoded = decode_conversation(buf, abs_ptr)
        entries[f"town.{town_id}.npc.{npc_id}"] = {
            "text": decoded["text"],
            "endCode": decoded["endCode"],
            "_source": {
                "mdt": os.path.basename(mdt_path),
                "townId": town_id,
                "npcId": npc_id,
                "byteAddress": hex(decoded["byteAddress"]),
                "controlBytes": [hex(c) for c in decoded["controlBytes"]],
            },
        }
    return entries


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        default=os.path.join("web", "src", "locale", "town-conversations.en.json"),
        help="manifest output path",
    )
    args = parser.parse_args()

    if not os.path.isdir(GAME_DIR):
        print(f"error: game directory not found: {GAME_DIR}", file=sys.stderr)
        return 1

    manifest: dict[str, dict] = {}
    for town_id in TOWN_IDS:
        mdt_path = os.path.join(GAME_DIR, f"{town_id}.mdt")
        if not os.path.isfile(mdt_path):
            print(f"warn: missing {mdt_path}", file=sys.stderr)
            continue
        manifest.update(extract_town(mdt_path, town_id))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")

    print(f"wrote {len(manifest)} conversations to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())