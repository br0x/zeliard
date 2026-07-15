#!/usr/bin/env python3
import sys
import os
import tkinter as tk
from tkinter import filedialog

DEBUG_DRAW = True


# Mode Definitions:
# 12: boss sprites (crab.grp)
GRP_DESCRIPTOR = [
    ("crab.grp",  12),
]

MODE_CFG = {
    12:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "crab"},
}

SCALE = 3
CANVAS_BG = "#0f0f1a"
FG_COLOR = "#e0e0ff"
BG_COLOR = "#1a1a2e"


# pal_decode_tbl has 6 entries (hero_tile_col_idx cycles 0–5);
# entry 5 is the same data as entry 3:
PAL_DECODE_TABLES = [
    bytes([0x00,0x01,0x02,0x03, 0x08,0x09,0x0A,0x0B,
           0x10,0x11,0x12,0x13, 0x18,0x19,0x1A,0x1B]),  # 0  pal_decode_data0
    bytes([0x00,0x02,0x04,0x06, 0x10,0x12,0x14,0x16,
           0x20,0x22,0x24,0x26, 0x30,0x32,0x34,0x36]),  # 1  pal_decode_data1
    bytes([0x00,0x01,0x04,0x05, 0x08,0x09,0x0C,0x0D,
           0x20,0x21,0x24,0x25, 0x28,0x29,0x2C,0x2D]),  # 2  pal_decode_data2
    bytes([0x00,0x05,0x06,0x07, 0x28,0x2D,0x2E,0x2F,
           0x30,0x35,0x36,0x37, 0x38,0x3D,0x3E,0x3F]),  # 3  pal_decode_data3
    bytes([0x00,0x06,0x05,0x07, 0x30,0x36,0x35,0x37,
           0x28,0x2E,0x2D,0x2F, 0x38,0x3E,0x3D,0x3F]),  # 4  pal_decode_data4
]
PAL_DECODE_TABLES.append(PAL_DECODE_TABLES[3])          # 5  aliases data3


# Frame definitions from crab.asm
# Each frame is a 2x2 grid of 8x8 px tiles: [Top-Left, Top-Right, Bottom-Left, Bottom-Right]

CRAB_FRAMES = {
    "Left Eye": [
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0x26, 0x27],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0x26, 0x27],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0x26, 0x27],
        [0, 0, 0, 0x26, 0x27],
        [0, 0, 0, 0x26, 0x27],
        [0, 0, 0, 0, 0],
        [0, 1, 2, 0x0A, 0x0B],
    ],

    "Right Eye": [
        [0, 0, 0, 2, 0],
        [0, 0, 0, 0x28, 0x29],
        [0, 0, 0, 2, 0],
        [0, 0, 0, 0x28, 0x29],
        [0, 0, 0, 2, 0],
        [0, 0, 0, 0x28, 0x29],
        [0, 0, 0, 0x28, 0x29],
        [0, 0, 0, 0x28, 0x29],
        [0, 0, 0, 0, 0],
    ],

    "Left Tibia": [
        [0, 3, 4, 0, 5],
        [0, 0x2A, 0x2B, 0x2C, 0x2D],
        [0, 3, 4, 0, 0x47],
        [0, 0x2A, 0x2B, 0x2C, 0x58],
        [0, 3, 4, 0, 0x69],
        [0, 0x2A, 0x2B, 0x2C, 0x72],
        [0, 3, 4, 0, 5],
        [0, 3, 4, 0, 5],
        [0, 0x8F, 0x90, 0, 0x91],
        [0, 0xAD, 0xAE, 0xAF, 0xB0],
    ],

    "Left Femur": [
        [0, 6, 7, 8, 9],
        [0, 6, 0x2F, 0x30, 0x31],
        [0, 6, 7, 0x48, 0x49],
        [0, 6, 0x2F, 0x59, 0x5A],
        [0, 6, 7, 0x59, 0x5A],
        [0, 6, 0x2F, 0x73, 0x74],
        [0, 6, 0x2F, 8, 9],
        [0, 6, 0x2F, 8, 9],
        [0, 0x92, 0x26, 0x93, 0x94],
        [0, 0xB1, 7, 0xB2, 0xB3],
    ],

    "Mouth": [
        [0, 0x0A, 0x0B, 0x0C, 0x0D],
        [0, 0x32, 0x33, 0x0C, 0x0D],
        [0, 0x0A, 0x0B, 0x0C, 0x0D],
        [0, 0x32, 0x33, 0x0C, 0x0D],
        [0, 0x0A, 0x0B, 0x0C, 0x0D],
        [0, 0x32, 0x33, 0x0C, 0x0D],
        [0, 0x32, 0x33, 0xC5, 0xC6],
        [0, 0x32, 0x33, 0x0C, 0x0D],
        [0, 0x27, 0x28, 0x32, 0x33],
    ],

    "Right Femur": [
        [0, 0x0E, 0x35, 0x10, 0x11],
        [0, 0x34, 0x35, 0x36, 0x37],
        [0, 0x0E, 0x35, 0x4A, 0x4B],
        [0, 0x34, 0x35, 0x5B, 0x5C],
        [0, 0x0E, 0x35, 0x5B, 0x5C],
        [0, 0x34, 0x35, 0x75, 0x76],
        [0, 0x34, 0x35, 0x84, 0x85],
        [0, 0x34, 0x35, 0x84, 0x85],
        [0, 0x29, 0x95, 0x96, 0x97],
        [0, 0x0E, 0xB4, 0xB5, 0xB6],
    ],

    "Right Tibia": [
        [0, 0x12, 0x13, 0x14, 0x15],
        [0, 0x38, 0x39, 0x3A, 0],
        [0, 0x12, 0x13, 0x4C, 0x15],
        [0, 0x38, 0x39, 0x5D, 0],
        [0, 0x12, 0x13, 0x5D, 0x15],
        [0, 0x38, 0x39, 0x77, 0],
        [0, 0x12, 0x13, 0x14, 0x15],
        [0, 0x12, 0x13, 0x14, 0x15],
        [0, 0x98, 0x99, 0x9A, 0],
        [0, 0xB7, 0xB8, 0xB9, 0xBA],
    ],

    "Left Bottom Legs": [
        [0, 0, 0x16, 0, 0x17],
        [0, 0, 0x3B, 0x3C, 0x3D],
        [0, 0, 0x4D, 0, 0x4E],
        [0, 0x5E, 0x5F, 0, 0x60],
        [0, 0x0F, 0x2E, 0x6A, 0x6B],
        [0, 0x78, 0x79, 0x7A, 0x7B],
        [0, 0x86, 0x87, 0, 0x88],
        [0, 0x86, 0x87, 0, 0x88],
        [0, 0x9B, 0x9C, 0x9D, 0x9E],
        [0, 0xBB, 0xBF, 0xBC, 0],
    ],

    "Left Claw": [
        [0, 0x18, 0x19, 0x1A, 0x1B],
        [0, 0x40, 0x19, 0x42, 0x43],
        [0, 0x4F, 0x19, 0x50, 0x51],
        [0, 0x61, 0x19, 0x62, 0x1B],
        [0, 0x6C, 0x19, 0x6D, 0x43],
        [0, 0x7C, 0x19, 0x7D, 0x43],
        [0, 0x18, 0x19, 0, 0x1B],
        [0, 0x18, 0x19, 0, 0x1B],
        [0, 0x9F, 0xA0, 0xA1, 0xA2],
        [0, 0xBD, 0x19, 0xBF, 0x43],
    ],

    "Maxilla": [
        [0, 0x1C, 0x1D, 0x1E, 0],
        [0, 0x1C, 0x1D, 0, 0x44],
        [0, 0x1C, 0x1D, 0x1E, 0x44],
        [0, 0x1C, 0x1D, 0x1E, 0],
        [0, 0x1C, 0x1D, 0, 0],
        [0, 0x1C, 0x1D, 0, 0x44],
        [0, 0x1C, 0x1D, 0x1E, 0],
        [0, 0x1C, 0x1D, 0x1E, 0],
        [0, 0x0C, 0x0D, 0xA3, 0xA4],
    ],

    "Right Claw": [
        [0, 0x1F, 0x20, 0x21, 0x22],
        [0, 0x1F, 0x41, 0x45, 0x46],
        [0, 0x1F, 0x52, 0x53, 0x54],
        [0, 0x1F, 0x63, 0x21, 0x64],
        [0, 0x1F, 0x63, 0x21, 0x6E],
        [0, 0x1F, 0x7E, 0x53, 0x7F],
        [0, 0x1F, 0x89, 0x21, 0x8A],
        [0, 0x1F, 0x89, 0x21, 0x8A],
        [0, 0xA5, 0xA6, 0xA7, 0xA8],
        [0, 0x1F, 0xBE, 0x21, 0xC0],
    ],

    "Right Bottom Legs": [
        [0, 0x23, 0x24, 0x25, 0],
        [0, 0x3E, 0, 0x3F, 0],
        [0, 0x55, 0, 0x56, 0x57],
        [0, 0x65, 0x66, 0x67, 0x68],
        [0, 0x6F, 0x70, 0x71, 0],
        [0, 0x80, 0x81, 0x82, 0x83],
        [0, 0x8B, 0x8C, 0x8D, 0x8E],
        [0, 0x8B, 0x8C, 0x8D, 0x8E],
        [0, 0xA9, 0xAA, 0xAB, 0xAC],
        [0, 0, 0xC1, 0, 0xC2],
    ],

    "Mouth Acid Frames": [
        [0, 0xC7, 0xC8, 0x1C, 0x1D],
        [0, 0xC9, 0xCA, 0x1C, 0x1D],
        [0, 0xCB, 0xCC, 0xCD, 0xCE],
        [0, 0xCF, 0xD0, 0xD1, 0xD2],
        [0, 0xD3, 0xD4, 0xD5, 0xD6],
        [0, 0xC3, 0xC4, 0x1C, 0x1D],
        [0, 0xC5, 0xC6, 0x1C, 0x1D],
        [0, 0x0C, 0x0D, 0x1C, 0x1D],
        [0, 0x0C, 0x0D, 0x1C, 0x1D],
        [0, 0x0C, 0x0D, 0x1C, 0x1D],
    ],

    "Acid Drops": [
        [0, 0xD7, 0xD8, 0xD9, 0],
        [0, 0xDA, 0xDB, 0xDC, 0xDD],
        [0, 0xDE, 0xDF, 0, 0],
        [0, 0xE0, 0xE1, 0, 0],
        [0, 0xE2, 0xE3, 0, 0],
    ],
}

ENP_FRAMES_MAP = {
    3: CRAB_FRAMES,                                                                                                                                 
}                                                                                                                                                    

# ---------------------------------------------------------------------------
# Decompression logic
# ---------------------------------------------------------------------------

def unpack(src: bytes, length_limit: int) -> bytes:
    if not src: return b""
    si = 0
    out = bytearray()
    dx = len(src)

    def lodsb(): nonlocal si; b = src[si]; si += 1; return b
    def lodsw(): nonlocal si; lo = src[si]; hi = src[si+1]; si += 2; return lo | (hi << 8)
    def stosb_rep(b, count): out.extend([b] * count)

    method = lodsb() & 0x07
    dx -= 1

    if method == 0:
        out.extend(src[si:si+dx])
    elif method == 1:
        bp = si
        while lodsb() != 0xFF: si += 1
        dx = len(src) - si
        while dx > 0:
            al = lodsb(); dx -= 1; ah = al & 0xF0; cx = 1; tbp = bp
            while True:
                entry_key = src[tbp]
                if (entry_key & 0x0F) != 0: break
                if ah == entry_key: cx = (al & 0x0F) + 2; al = src[tbp + 1]; break
                tbp += 2
            stosb_rep(al, cx)
    elif method == 2:
        marker = lodsb(); dx -= 1; ah = marker
        while dx > 0:
            al = lodsb(); dx -= 1; cx = 1
            if (al & 0xF0) == ah: cx = (al & 0x0F) + 3; al = lodsb(); dx -= 1
            stosb_rep(al, cx)
    elif method == 3:
        bp = si
        while lodsb() != 0xFF: si += 1
        dx = len(src) - si
        while dx > 0:
            al = lodsb(); dx -= 1; ah = al & 0x0F; cx = 1; tbp = bp
            while True:
                entry_key = src[tbp]
                if (entry_key & 0xF0) != 0: break
                if ah == entry_key: cx = (al >> 4) + 2; al = src[tbp + 1]; break
                tbp += 2
            stosb_rep(al, cx)
    elif method == 4:
        marker = lodsb(); dx -= 1; ah = marker
        while dx > 0:
            al = lodsb(); dx -= 1; cx = 1
            if (al & 0x0F) == ah: cx = (al >> 4) + 3; al = lodsb(); dx -= 1
            stosb_rep(al, cx)
    elif method == 5:
        while dx > 0:
            al = lodsb(); cx = 1
            if si < len(src) and src[si] == al:
                cx = src[si + 1] + 2; si += 2; dx -= 2
            stosb_rep(al, cx); dx -= 1
    elif method == 6:
        bp = si
        while lodsw() != 0xFFFF: pass
        dx = len(src) - si
        while dx > 0:
            al = lodsb(); dx -= 1; cx = 1; tbp = bp
            while True:
                tl = src[tbp]; th = src[tbp+1]
                if tl == 0xFF and th == 0xFF: break
                if tl == al: dx -= 1; cx = lodsb() + 2; al = th; break
                tbp += 2
            stosb_rep(al, cx)
    elif method == 7:
        ah = lodsb(); dx -= 1
        while dx > 0:
            al = lodsb(); cx = 1
            if al == ah: al = lodsb(); cx = lodsb() + 3; dx -= 2
            stosb_rep(al, cx); dx -= 1

    return bytes(out)

# ---------------------------------------------------------------------------
# Rendering Engines
# ---------------------------------------------------------------------------

def build_palette():
    # Original Zeliard/MCGA Palette Fragment
    raw = [
        (0,0,0),(31,31,31),(31,0,0),(0,31,0),(0,31,31),(0,0,31),(31,31,0),(31,0,31),
        (31,31,31),(62,62,62),(62,31,31),(31,62,31),(31,62,62),(31,31,62),(62,62,31),(62,31,62),
        (31,0,0),(62,31,31),(62,0,0),(31,31,0),(31,31,31),(31,0,31),(62,31,0),(62,0,31),
        (0,31,0),(31,62,31),(31,31,0),(0,62,0),(0,62,31),(0,31,31),(31,62,0),(31,31,31),
        (0,31,31),(31,62,62),(31,31,31),(0,62,31),(0,62,62),(0,31,62),(31,62,31),(31,31,62),
        (0,0,31),(31,31,62),(31,0,31),(0,31,31),(0,31,62),(0,0,62),(31,31,31),(31,0,62),
        (31,31,0),(62,62,31),(62,31,0),(31,62,0),(31,62,31),(31,31,31),(62,62,0),(62,31,31),
        (31,0,31),(62,31,62),(62,0,31),(31,31,31),(31,31,62),(31,0,62),(62,31,31),(62,0,62),
    ]
    return [f"#{r*4:02x}{g*4:02x}{b*4:02x}" for r, g, b in raw]

PALETTE_STRS = build_palette()

# ---------------------------------------------------------------------------
# Pixel decoding primitives
# ---------------------------------------------------------------------------

def rol16(word, count=1):
    """Rotate a 16-bit word left by `count` bits; return (new_word, last_carry)."""
    word &= 0xFFFF
    carry = 0
    for _ in range(count):
        carry = (word >> 15) & 1
        word = ((word << 1) | carry) & 0xFFFF
    return word, carry

def decode_4(p1, p2, p3):
    """Decode 4 pixels from three 16-bit plane words via rotating shifts.
    Returns updated (p1, p2, p3, [4 palette indices])."""
    pxs = []
    for _ in range(4):
        ax = 0
        p3, cf = rol16(p3); ax = (ax << 1) | cf
        p2, cf = rol16(p2); ax = (ax << 1) | cf
        p1, cf = rol16(p1); ax = (ax << 1) | cf
        p3, cf = rol16(p3); ax = (ax << 1) | cf
        p2, cf = rol16(p2); ax = (ax << 1) | cf
        p1, cf = rol16(p1); ax = (ax << 1) | cf
        pxs.append(ax & 0x3F)
    return p1, p2, p3, pxs

def decode_8(p1, p2, p3):
    """Decode 8 pixels from three 16-bit plane words (two consecutive decode_4 calls)."""
    p1, p2, p3, px1 = decode_4(p1, p2, p3)
    _,   _,   _,  px2 = decode_4(p1, p2, p3)
    return px1 + px2

def read_be_words(row_bytes, count=3):
    """Read `count` big-endian 16-bit words from row_bytes.
    Matches lodsw (little-endian load) + xchg ah,al (byte-swap) = big-endian word."""
    return [(row_bytes[i*2] << 8) | row_bytes[i*2 + 1] for i in range(count)]

def draw_pixel(canvas, x, y, color_str, scale=SCALE):
    canvas.create_rectangle(x, y, x + scale, y + scale, fill=color_str, outline="")
    if DEBUG_DRAW:
        canvas.update()   # force redraw after this pixel

def draw_tile_pixels(canvas, pixels, x0, y0, tile_w=8, scale=SCALE, transparent_idx=None):
    """Paint a flat list of palette indices (or None for transparent) onto the canvas."""
    for i, p_idx in enumerate(pixels):
        if p_idx is None or p_idx == transparent_idx:
            continue
        rx, ry = i % tile_w, i // tile_w
        draw_pixel(canvas, x0 + rx * scale, y0 + ry * scale, PALETTE_STRS[p_idx], scale)
        
# ---------------------------------------------------------------------------
# Sword rendering
# ---------------------------------------------------------------------------

def decode_sword_8x8(data, color_pair):
    """Decode a single 8x8 tile using 2-bit-per-pixel logic.
    Returns list of 64 palette indices (or None for transparent)."""
    c_high, c_low = color_pair
    pixels = []
    for row_idx in range(8):
        # Read 16-bit word, swap bytes (lodsw + xchg ah,al logic)
        word = (data[row_idx*2] << 8) | data[row_idx*2 + 1]
        for i in range(8):
            selector = (word >> ((7 - i) * 2)) & 0x03
            if selector == 0:
                pixels.append(None)     # Transparent
            elif selector == 3:
                pixels.append(c_high)
            else:
                pixels.append(c_low)
    return pixels


# ---------------------------------------------------------------------------
# NPC / Hero rendering
# ---------------------------------------------------------------------------

def decode_npc_tile(tile_data):
    """Decode one 8x8 NPC tile from 48 raw bytes (8 rows x 6 bytes).

    The game's apply_sprite_mask reads each row as 3 little-endian words
    (R, G, B planes), then:
      1. Masks out pure-white pixels: plane &= ~(B&G&R)  [so all-ones -> 0]
      2. Byte-swaps each plane word before storing to plane_buffer
      3. Derives blit_mask_bitplane = ~(B|G|R) after byte-swapping B|G|R
      4. Calls build_48_bits_packed_from_rgb_planes  -> 6 packed color bytes
      5. Calls extract_blit_byte_from_mask_plane     -> 1 mask byte
         mask bit = 1 (draw) when both bits of the 2-bit pixel slot in the
         16-bit mask word are 1, which happens iff the decoded palette
         index for that pixel is non-zero.

    Returns list of 64 entries (row-major): palette index (int) or None.
    """
    pixels = []
    for ry in range(8):
        p1, p2, p3 = read_be_words(tile_data[ry*6 : ry*6+6])
        # White-pixel masking: plane &= ~(B&G&R)
        white = p1 & p2 & p3
        p1 &= ~white & 0xFFFF
        p2 &= ~white & 0xFFFF
        p3 &= ~white & 0xFFFF
        pixels.extend(decode_8(p1, p2, p3))
    # Mask: draw only when index != 0
    return [idx if idx != 0 else None for idx in pixels]


# ---------------------------------------------------------------------------
# Sprite / Font rendering (modes 0, 1, 3)
# ---------------------------------------------------------------------------

def decode_sprite_row(mode, row_bytes):
    """Decode one row of pixels for sprite modes 0, 1, and 3.

    All modes share the same decode_8() kernel; they differ only in how
    the 3 plane words are assembled from the raw stride bytes.

    Mode 0 (20px wide): two full 16-bit triplets + one 8-bit stub → 8+8+4 = 20px
    Mode 1 (16px wide): two full 16-bit triplets                   → 8+8    = 16px
    Mode 3 (16px wide): three consecutive BE words from 6 bytes    → 8+8    = 8px per call
                        (caller loops over 4 sub-tiles of 8 rows each)
    """
    if mode == 3:
        # Called once per 6-byte row of a single 8x8 sub-tile
        p1, p2, p3 = read_be_words(row_bytes)
        return decode_8(p1, p2, p3)

    if mode == 0:  # stride=15, 20px wide
        p1a, p2a, p3a = (row_bytes[0]<<8)|row_bytes[1],  (row_bytes[9]<<8)|row_bytes[8],  (row_bytes[10]<<8)|row_bytes[11]
        p1b, p2b, p3b = (row_bytes[2]<<8)|row_bytes[3],  (row_bytes[7]<<8)|row_bytes[6],  (row_bytes[12]<<8)|row_bytes[13]
        p1c, p2c, p3c = row_bytes[4]<<8,                 row_bytes[5]<<8,                 row_bytes[14]<<8
        return decode_8(p1a, p2a, p3a) + decode_8(p1b, p2b, p3b) + decode_4(p1c, p2c, p3c)[3]

    # mode == 1, stride=12, 16px wide
    p1a, p2a, p3a = (row_bytes[0]<<8)|row_bytes[1],  (row_bytes[7]<<8)|row_bytes[6],  (row_bytes[8]<<8)|row_bytes[9]
    p1b, p2b, p3b = (row_bytes[2]<<8)|row_bytes[3],  (row_bytes[5]<<8)|row_bytes[4],  (row_bytes[10]<<8)|row_bytes[11]
    return decode_8(p1a, p2a, p3a) + decode_8(p1b, p2b, p3b)

def decode_fman_tile(t_data, lut):
    """Decode one 8x8 fman tile from 32 bytes (8 rows x 4 bytes, interleaved nibbles).
    see Decompress_Tile_Data in assembly.
    """
    pixels = []
    for ry in range(8):
        p0 = (t_data[ry*4]   << 8) | t_data[ry*4 + 1]
        p1 = (t_data[ry*4+2] << 8) | t_data[ry*4 + 3]
        combined = p0 | p1
        row_mask = ~(combined | (combined >> 1) | (combined << 2)) & 0xFFFF
        for rx in range(8):
            s1, s2 = 15 - rx*2, 14 - rx*2
            nib = (((p1>>s1)&1) << 3) | (((p0>>s1)&1) << 2) | (((p1>>s2)&1) << 1) | ((p0>>s2)&1)
            is_trans = (row_mask >> s2) & 3 == 3
            pixels.append(None if is_trans else lut[nib])
    return pixels

def draw_composed_16x16_frame(canvas, frame_data, tiles_raw, x_frame, y_frame, scale):
    """Draws a 16x16 frame composed of four 8x8 tiles [tl, tr, bl, br]."""
    TILE_SIZE = 32
    pal_idx = frame_data[0]
    tile_indices = frame_data[1:] # [tl, tr, bl, br]
    lut = PAL_DECODE_TABLES[pal_idx]
    
    for i, t_idx in enumerate(tile_indices):
        if t_idx == 0: continue
        # Slice the 32-byte raw data for the 8x8 tile
        tile_data = tiles_raw[t_idx * TILE_SIZE : (t_idx + 1) * TILE_SIZE]
        pixels = decode_fman_tile(tile_data, lut)
        
        # Calculate sub-tile position within the 16x16 block
        col_offset = (i % 2) * 8 * scale
        row_offset = (i // 2) * 8 * scale
        draw_tile_pixels(canvas, pixels, x_frame + col_offset, y_frame + row_offset, scale=scale)
    # canvas.create_rectangle(x_frame-1, y_frame-1, x_frame + 16*scale, y_frame + 16*scale, outline="gray")

def render_boss_group(data, canvas, y_offset):
    TILE_SIZE = 32
    scale = 3
    current_y = y_offset
    gap_x, gap_y = 25, 35
    
    # Header size in crab.grp is 0; tiles start immediately after the descriptors
    tiles_raw = data + b'\x00' * (256 * TILE_SIZE)

    # -----------------------------------------------------------------------
    # Part 1: Render Composite Crab Body (Phases 0-9)
    # -----------------------------------------------------------------------

    # Normal layout for phases 0-8: (part_name, grid_x, grid_y)
    body_layout08 = [
                                            ("Left Eye", 24, 0), ("Right Eye", 40, 0),
        ("Left Tibia", 0, 16), ("Left Femur", 16, 16), ("Mouth", 32, 16), ("Right Femur", 48, 16), ("Right Tibia", 64, 16),
        ("Left Bottom Legs", 0, 32), ("Left Claw", 16, 32), ("Maxilla", 32, 32), ("Right Claw", 48, 32), ("Right Bottom Legs", 64, 32)
    ]
    body_layout9 = [
                                                ("Left Eye", 32, 0),
        ("Left Tibia", 0, 16), ("Left Femur", 16, 8),           ("Right Femur", 48, 8), ("Right Tibia", 64, 16),
        ("Left Bottom Legs", 8, 32), ("Left Claw", 16, 24),     ("Right Claw", 48, 24), ("Right Bottom Legs", 56, 32)
    ]

    frames_per_row = 3
    for phase in range(10):
        x_base = 10 + (phase % frames_per_row) * (5*16 * scale + gap_x)
        y_base = current_y + (phase // frames_per_row) * (3*16 * scale + gap_y)
        
        canvas.create_rectangle(x_base-1, y_base-1, x_base + 5*16*scale, y_base + 3*16*scale, outline="gray")

        if phase < 9:
            # Standard rendering for phases 0-8
            for name, gx, gy in body_layout08:
                draw_composed_16x16_frame(canvas, CRAB_FRAMES[name][phase], tiles_raw, x_base + gx*scale, y_base + gy*scale, scale)
        else:
            # Phase 9: Special placement
            for name, gx, gy in body_layout9:
                draw_composed_16x16_frame(canvas, CRAB_FRAMES[name][phase], tiles_raw, x_base + gx*scale, y_base + gy*scale, scale)

    # Advance y_cursor past the 2 rows of body phases
    current_y += 3 * (48 * scale + gap_y) + 36
    
    # -----------------------------------------------------------------------
    # Part 2: Render Remaining 16x16 frames
    # -----------------------------------------------------------------------
    for anim_name in ["Mouth Acid Frames", "Acid Drops"]:
        frames = CRAB_FRAMES[anim_name]
        f_per_row = 10
        for f_idx, frame_data in enumerate(frames):
            x_f = 276 + (f_idx % f_per_row) * (16 * scale + 12)
            y_f = current_y + (f_idx // f_per_row) * (16 * scale)
            
            draw_composed_16x16_frame(canvas, frame_data, tiles_raw, x_f, y_f, scale)
        
        num_rows = (len(frames) + f_per_row - 1) // f_per_row
        current_y += num_rows * (16 * scale + 12)
        
    return current_y - y_offset


# ---------------------------------------------------------------------------
# Main Application
# ---------------------------------------------------------------------------

class GrpViewer:
    def __init__(self, root):
        self.root = root
        self.root.title("Zeliard GRP Viewer")
        self.root.configure(bg=CANVAS_BG)
        self.setup_ui()

        if len(sys.argv) > 1:
            self.load_file(sys.argv[1])

    def setup_ui(self):
        toolbar = tk.Frame(self.root, bg=CANVAS_BG)
        toolbar.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)

        self.info_label = tk.Label(toolbar, text="No file loaded", bg=CANVAS_BG, fg="#aaaacc", font=("Courier", 10))
        self.info_label.pack(side=tk.LEFT, padx=10)

        # Scrollable Canvas
        frame = tk.Frame(self.root, bg=CANVAS_BG)
        frame.pack(fill=tk.BOTH, expand=True)

        self.canvas = tk.Canvas(frame, bg=CANVAS_BG, highlightthickness=0)
        vbar = tk.Scrollbar(frame, orient=tk.VERTICAL, command=self.canvas.yview)
        hbar = tk.Scrollbar(self.root, orient=tk.HORIZONTAL, command=self.canvas.xview)

        self.canvas.configure(yscrollcommand=vbar.set, xscrollcommand=hbar.set)
        vbar.pack(side=tk.RIGHT, fill=tk.Y)
        hbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.canvas.bind("<MouseWheel>", lambda e: self.canvas.yview_scroll(int(-1*(e.delta/120)), "units"))

    def load_file(self, path):
        try:
            raw = open(path, "rb").read()
        except Exception as e:
            self.info_label.config(text=f"Error: {e}")
            return

        # Simple Zeliard Header Handling
        if raw[0] == 0:
            skip, length, raw1 = 0, len(raw)-1, raw[1:]
        else:
            skip   = int.from_bytes(raw[1:3], "little")
            length = int.from_bytes(raw[3:5], "little")
            raw1   = raw[5+skip:]

        unpacked = unpack(raw1, length)
        filename = os.path.basename(path).lower()

        desc      = next((d for d in GRP_DESCRIPTOR if d[0] == filename), None)
        modes     = desc[1] if desc else [1]
        overrides = desc[2] if desc and len(desc) > 2 else {}

        self.render(unpacked, modes, filename, overrides)

    def render(self, data, modes, filename, overrides):
        self.canvas.delete("all")
        y_cursor = 10

        # Single-mode special cases
        if isinstance(modes, int):
            if modes == 12:
                consumed = render_boss_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Monsters/Items Sprites")
            return

if __name__ == "__main__":
    app = tk.Tk()
    app.geometry("1100x800")
    GrpViewer(app)
    app.mainloop()
