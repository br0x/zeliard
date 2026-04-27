#!/usr/bin/env python3
"""
MZ Header Scanner - Parses and displays all information from a DOS EXE MZ header.

Usage:
    python mz_header_scanner.py <path_to_exe>
"""

import struct
import sys
import os
from datetime import datetime


# MZ Header field definitions: (offset, size, name, description)
MZ_HEADER_FIELDS = [
    (0x00, 2,  "e_magic",      "Magic number ('MZ' = 0x5A4D)"),
    (0x02, 2,  "e_cblp",       "Bytes on last page of file"),
    (0x04, 2,  "e_cp",         "Pages in file (512-byte pages)"),
    (0x06, 2,  "e_crlc",       "Number of relocations"),
    (0x08, 2,  "e_cparhdr",    "Size of header in paragraphs (16-byte units)"),
    (0x0A, 2,  "e_minalloc",   "Minimum extra paragraphs needed"),
    (0x0C, 2,  "e_maxalloc",   "Maximum extra paragraphs needed"),
    (0x0E, 2,  "e_ss",         "Initial (relative) SS register value"),
    (0x10, 2,  "e_sp",         "Initial SP register value"),
    (0x12, 2,  "e_csum",       "Checksum"),
    (0x14, 2,  "e_ip",         "Initial IP register value"),
    (0x16, 2,  "e_cs",         "Initial (relative) CS register value"),
    (0x18, 2,  "e_lfarlc",     "File offset of relocation table"),
    (0x1A, 2,  "e_ovno",       "Overlay number"),
    (0x1C, 8,  "e_res",        "Reserved words (4 x WORD)"),
    (0x24, 2,  "e_oemid",      "OEM identifier"),
    (0x26, 2,  "e_oeminfo",    "OEM information (OEM-specific)"),
    (0x28, 20, "e_res2",       "Reserved words (10 x WORD)"),
    (0x3C, 4,  "e_lfanew",     "File offset of new EXE header (PE/NE/LE/etc.)"),
]

MZ_HEADER_SIZE = 0x40  # 64 bytes


def format_hex(value, width=4):
    """Format integer as hex with leading zeros."""
    return f"0x{value:0{width}X}"


def format_bytes(data):
    """Format raw bytes as hex pairs."""
    return " ".join(f"{b:02X}" for b in data)


def read_mz_header(filepath):
    """Read and parse the MZ header from a file."""
    with open(filepath, "rb") as f:
        raw = f.read(MZ_HEADER_SIZE)

    if len(raw) < MZ_HEADER_SIZE:
        raise ValueError(f"File too small: {len(raw)} bytes (need at least {MZ_HEADER_SIZE})")

    magic = raw[0:2]
    if magic != b"MZ" and magic != b"ZM":
        raise ValueError(f"Not a valid MZ executable. Magic bytes: {format_bytes(magic)}")

    return raw


def parse_fields(raw):
    """Parse all header fields from raw bytes."""
    fields = {}
    for offset, size, name, desc in MZ_HEADER_FIELDS:
        chunk = raw[offset:offset + size]
        if size == 2:
            value = struct.unpack_from("<H", raw, offset)[0]
        elif size == 4:
            value = struct.unpack_from("<I", raw, offset)[0]
        else:
            value = chunk  # raw bytes for reserved fields
        fields[name] = {"value": value, "raw": chunk, "desc": desc, "offset": offset, "size": size}
    return fields


def compute_derived(fields, filesize):
    """Compute derived/interpreted values."""
    derived = {}

    e_cblp  = fields["e_cblp"]["value"]
    e_cp    = fields["e_cp"]["value"]
    e_cparhdr = fields["e_cparhdr"]["value"]
    e_minalloc = fields["e_minalloc"]["value"]
    e_maxalloc = fields["e_maxalloc"]["value"]
    e_crlc  = fields["e_crlc"]["value"]
    e_lfarlc = fields["e_lfarlc"]["value"]
    e_lfanew = fields["e_lfanew"]["value"]
    e_csum  = fields["e_csum"]["value"]

    # Actual file size from header
    if e_cp > 0:
        computed_size = (e_cp - 1) * 512 + (e_cblp if e_cblp else 512)
    else:
        computed_size = 0
    derived["Computed file size (from header)"] = f"{computed_size} bytes"
    derived["Actual file size"] = f"{filesize} bytes"
    derived["File size match"] = "✓ Yes" if computed_size == filesize else f"✗ No (delta: {filesize - computed_size:+d} bytes)"

    # Header size in bytes
    hdr_bytes = e_cparhdr * 16
    derived["Header size"] = f"{e_cparhdr} paragraphs = {hdr_bytes} bytes"

    # Load image offset
    derived["Load image offset"] = f"{format_hex(hdr_bytes, 4)} ({hdr_bytes} bytes)"

    # Load image size
    load_image_size = computed_size - hdr_bytes
    derived["Load image size"] = f"{max(load_image_size, 0)} bytes"

    # Memory requirements
    min_mem = (load_image_size + e_minalloc * 16 + 15) // 16 * 16
    derived["Min memory needed"] = f"{e_minalloc} paragraphs extra = ~{min_mem} bytes total"
    if e_maxalloc == 0xFFFF:
        derived["Max memory wanted"] = "Unlimited (0xFFFF)"
    else:
        derived["Max memory wanted"] = f"{e_maxalloc} paragraphs extra"

    # Entry point
    derived["Entry point (CS:IP)"] = (
        f"{format_hex(fields['e_cs']['value'])}:{format_hex(fields['e_ip']['value'])} "
        f"→ linear offset {format_hex(fields['e_cs']['value'] * 16 + fields['e_ip']['value'] + hdr_bytes, 8)}"
    )

    # Initial stack
    derived["Initial stack (SS:SP)"] = (
        f"{format_hex(fields['e_ss']['value'])}:{format_hex(fields['e_sp']['value'])}"
    )

    # Relocation table
    if e_crlc > 0:
        derived["Relocation table"] = f"{e_crlc} entries at offset {format_hex(e_lfarlc, 4)}"
    else:
        derived["Relocation table"] = "None (no relocations)"

    # Checksum note
    derived["Checksum"] = (
        f"{format_hex(e_csum, 4)} "
        f"({'unused/zero' if e_csum == 0 else 'non-zero (may be verified by loader)'})"
    )

    # Extended header
    if e_lfanew != 0 and e_lfanew < filesize:
        derived["Extended header offset (e_lfanew)"] = (
            f"{format_hex(e_lfanew, 8)} ({e_lfanew} bytes) — likely PE/NE/LE header"
        )
    elif e_lfanew == 0:
        derived["Extended header offset (e_lfanew)"] = "0 — pure DOS MZ executable"
    else:
        derived["Extended header offset (e_lfanew)"] = (
            f"{format_hex(e_lfanew, 8)} — INVALID (beyond EOF)"
        )

    return derived


def detect_extended_header(filepath, e_lfanew, filesize):
    """Peek at the extended header to identify the format."""
    if e_lfanew == 0 or e_lfanew + 4 > filesize:
        return None

    with open(filepath, "rb") as f:
        f.seek(e_lfanew)
        sig = f.read(4)

    signatures = {
        b"PE\x00\x00": "PE  — Portable Executable (Win32/Win64)",
        b"NE":          "NE  — New Executable (Win16/OS2 1.x)",
        b"LE":          "LE  — Linear Executable (OS/2 2.x, VxD)",
        b"LX":          "LX  — Linear Executable variant (OS/2 2.x)",
        b"W3":          "W3  — WIN386.EXE format",
        b"W4":          "W4  — WDOSX format",
    }

    for magic, label in signatures.items():
        if sig[:len(magic)] == magic:
            return label

    return f"Unknown: {format_bytes(sig[:4])}"


def read_relocations(filepath, e_lfarlc, e_crlc):
    """Read relocation entries from the file."""
    if e_crlc == 0 or e_lfarlc == 0:
        return []

    entries = []
    with open(filepath, "rb") as f:
        f.seek(e_lfarlc)
        for _ in range(e_crlc):
            data = f.read(4)
            if len(data) < 4:
                break
            offset, segment = struct.unpack("<HH", data)
            entries.append((segment, offset))
    return entries


def print_separator(char="─", width=72):
    print(char * width)


def print_header_banner(filepath, filesize):
    print_separator("═")
    print(f"  MZ HEADER SCANNER")
    print(f"  File   : {os.path.abspath(filepath)}")
    print(f"  Size   : {filesize:,} bytes ({filesize:#010x})")
    print_separator("═")


def print_raw_header(raw):
    print("\n┌─ RAW HEADER BYTES (64 bytes) " + "─" * 41 + "┐")
    for row in range(0, MZ_HEADER_SIZE, 16):
        chunk = raw[row:row+16]
        hex_part = " ".join(f"{b:02X}" for b in chunk)
        asc_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        print(f"│  {row:04X}:  {hex_part:<47}  {asc_part:<16} │")
    print("└" + "─" * 70 + "┘")


def print_fields(fields):
    print("\n┌─ HEADER FIELDS " + "─" * 54 + "┐")
    print(f"│  {'Offset':<6}  {'Field':<14}  {'Raw':<10}  {'Value':<8}  {'Description':<26} │")
    print(f"│  {'──────':<6}  {'──────────────':<14}  {'──────────':<10}  {'─────':<8}  {'───────────────────────────':<26} │")

    for offset, size, name, desc in MZ_HEADER_FIELDS:
        info = fields[name]
        raw_hex = format_bytes(info["raw"])[:10]
        if isinstance(info["value"], (int,)):
            val_str = format_hex(info["value"], width=max(4, size * 2))
        else:
            val_str = "(bytes)"
        # Truncate description to fit
        short_desc = desc
        print(f"│  {format_hex(offset, 2):<6}  {name:<14}  {raw_hex:<10}  {val_str:<8}  {short_desc} │")

    print("└" + "─" * 70 + "┘")


def print_derived(derived):
    print("\n┌─ INTERPRETED VALUES " + "─" * 49 + "┐")
    for label, value in derived.items():
        # Word-wrap long values
        line = f"  {label:<40}  {value}"
        if len(line) <= 70:
            print(f"│{line:<70}│")
        else:
            print(f"│  {label:<40}                      │")
            print(f"│    → {value:<64}│")
    print("└" + "─" * 70 + "┘")


def print_extended(ext_type):
    print("\n┌─ EXTENDED HEADER DETECTION " + "─" * 42 + "┐")
    if ext_type:
        print(f"│  Detected format : {ext_type:<50}│")
    else:
        print(f"│  No extended header detected (pure DOS MZ executable)          │")
    print("└" + "─" * 70 + "┘")


def print_relocations(entries):
    print("\n┌─ RELOCATION TABLE " + "─" * 51 + "┐")
    if not entries:
        print("│  No relocations present.                                         │")
    else:
        print(f"│  {'#':<5}  {'Segment':<10}  {'Offset':<10}  {'Seg:Off':<18}         │")
        print(f"│  {'─'*5}  {'────────':<10}  {'──────':<10}  {'───────':<18}         │")
        for i, (seg, off) in enumerate(entries[:64], 1):  # cap at 64 for readability
            print(f"│  {i:<5}  {format_hex(seg):<10}  {format_hex(off):<10}  {seg:04X}:{off:04X}                   │")
        if len(entries) > 64:
            print(f"│  ... and {len(entries) - 64} more entries (truncated)                           │")
    print("└" + "─" * 70 + "┘")


def scan_mz(filepath):
    if not os.path.isfile(filepath):
        print(f"Error: File not found: {filepath}")
        sys.exit(1)

    filesize = os.path.getsize(filepath)

    print_header_banner(filepath, filesize)

    # Parse header
    raw = read_mz_header(filepath)
    fields = parse_fields(raw)

    print_raw_header(raw)
    print_fields(fields)

    derived = compute_derived(fields, filesize)
    print_derived(derived)

    # Extended header
    e_lfanew = fields["e_lfanew"]["value"]
    ext_type = detect_extended_header(filepath, e_lfanew, filesize)
    print_extended(ext_type)

    # Relocations
    e_crlc   = fields["e_crlc"]["value"]
    e_lfarlc = fields["e_lfarlc"]["value"]
    relocations = read_relocations(filepath, e_lfarlc, e_crlc)
    print_relocations(relocations)

    print_separator("═")
    print(f"  Scan complete.\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python {os.path.basename(__file__)} <path_to_exe>")
        sys.exit(1)

    try:
        scan_mz(sys.argv[1])
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)
