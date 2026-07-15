#!/usr/bin/env python3
import sys
import os
import json
import tkinter as tk
from tkinter import filedialog
from PIL import Image

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
        [0, 0, 0, 0, 1],       # 0
        [0, 0, 0, 0x26, 0x27], # 1
        [0, 0, 0, 0, 1],       # 2
        [0, 0, 0, 0x26, 0x27], # 3
        [0, 0, 0, 0, 1],       # 4
        [0, 0, 0, 0x26, 0x27], # 5
        [0, 0, 0, 0x26, 0x27], # 6
        [0, 0, 0, 0x26, 0x27], # 7
        [0, 0, 0, 0, 0],       # 8
        [0, 1, 2, 0x0A, 0x0B], # 9
    ],

    "Right Eye": [
        [0, 0, 0, 2, 0],       # 0
        [0, 0, 0, 0x28, 0x29], # 1
        [0, 0, 0, 2, 0],       # 2
        [0, 0, 0, 0x28, 0x29], # 3
        [0, 0, 0, 2, 0],       # 4
        [0, 0, 0, 0x28, 0x29], # 5
        [0, 0, 0, 0x28, 0x29], # 6
        [0, 0, 0, 0x28, 0x29], # 7
        [0, 0, 0, 0, 0],       # 8
    ],

    "Left Tibia": [
        [0, 3, 4, 0, 5],             # 0
        [0, 0x2A, 0x2B, 0x2C, 0x2D], # 1
        [0, 3, 4, 0, 0x47],          # 2
        [0, 0x2A, 0x2B, 0x2C, 0x58], # 3
        [0, 3, 4, 0, 0x69],          # 4
        [0, 0x2A, 0x2B, 0x2C, 0x72], # 5
        [0, 3, 4, 0, 5],             # 6
        [0, 3, 4, 0, 5],             # 7
        [0, 0x8F, 0x90, 0, 0x91],    # 8
        [0, 0xAD, 0xAE, 0xAF, 0xB0], # 9
    ],

    "Left Femur": [
        [0, 6, 7, 8, 9],             # 0
        [0, 6, 0x2F, 0x30, 0x31],    # 1
        [0, 6, 7, 0x48, 0x49],       # 2
        [0, 6, 0x2F, 0x59, 0x5A],    # 3
        [0, 6, 7, 0x59, 0x5A],       # 4
        [0, 6, 0x2F, 0x73, 0x74],    # 5
        [0, 6, 0x2F, 8, 9],          # 6
        [0, 6, 0x2F, 8, 9],          # 7
        [0, 0x92, 0x26, 0x93, 0x94], # 8
        [0, 0xB1, 7, 0xB2, 0xB3],    # 9
    ],

    "Mouth": [
        [0, 0x0A, 0x0B, 0x0C, 0x0D], # 0
        [0, 0x32, 0x33, 0x0C, 0x0D], # 1
        [0, 0x0A, 0x0B, 0x0C, 0x0D], # 2
        [0, 0x32, 0x33, 0x0C, 0x0D], # 3
        [0, 0x0A, 0x0B, 0x0C, 0x0D], # 4
        [0, 0x32, 0x33, 0x0C, 0x0D], # 5
        [0, 0x32, 0x33, 0xC5, 0xC6], # 6
        [0, 0x32, 0x33, 0x0C, 0x0D], # 7
        [0, 0x27, 0x28, 0x32, 0x33], # 8
    ],

    "Right Femur": [
        [0, 0x0E, 0x35, 0x10, 0x11], # 0
        [0, 0x34, 0x35, 0x36, 0x37], # 1
        [0, 0x0E, 0x35, 0x4A, 0x4B], # 2
        [0, 0x34, 0x35, 0x5B, 0x5C], # 3
        [0, 0x0E, 0x35, 0x5B, 0x5C], # 4
        [0, 0x34, 0x35, 0x75, 0x76], # 5
        [0, 0x34, 0x35, 0x84, 0x85], # 6
        [0, 0x34, 0x35, 0x84, 0x85], # 7
        [0, 0x29, 0x95, 0x96, 0x97], # 8
        [0, 0x0E, 0xB4, 0xB5, 0xB6], # 9
    ],

    "Right Tibia": [
        [0, 0x12, 0x13, 0x14, 0x15], # 0
        [0, 0x38, 0x39, 0x3A, 0],    # 1
        [0, 0x12, 0x13, 0x4C, 0x15], # 2
        [0, 0x38, 0x39, 0x5D, 0],    # 3
        [0, 0x12, 0x13, 0x5D, 0x15], # 4
        [0, 0x38, 0x39, 0x77, 0],    # 5
        [0, 0x12, 0x13, 0x14, 0x15], # 6
        [0, 0x12, 0x13, 0x14, 0x15], # 7
        [0, 0x98, 0x99, 0x9A, 0],    # 8
        [0, 0xB7, 0xB8, 0xB9, 0xBA], # 9
    ],

    "Left Bottom Legs": [
        [0, 0, 0x16, 0, 0x17],       # 0
        [0, 0, 0x3B, 0x3C, 0x3D],    # 1
        [0, 0, 0x4D, 0, 0x4E],       # 2
        [0, 0x5E, 0x5F, 0, 0x60],    # 3
        [0, 0x0F, 0x2E, 0x6A, 0x6B], # 4
        [0, 0x78, 0x79, 0x7A, 0x7B], # 5
        [0, 0x86, 0x87, 0, 0x88],    # 6
        [0, 0x86, 0x87, 0, 0x88],    # 7
        [0, 0x9B, 0x9C, 0x9D, 0x9E], # 8
        [0, 0xBB, 0xBF, 0xBC, 0],    # 9
    ],

    "Left Claw": [
        [0, 0x18, 0x19, 0x1A, 0x1B], # 0
        [0, 0x40, 0x19, 0x42, 0x43], # 1
        [0, 0x4F, 0x19, 0x50, 0x51], # 2
        [0, 0x61, 0x19, 0x62, 0x1B], # 3
        [0, 0x6C, 0x19, 0x6D, 0x43], # 4
        [0, 0x7C, 0x19, 0x7D, 0x43], # 5
        [0, 0x18, 0x19, 0, 0x1B],    # 6
        [0, 0x18, 0x19, 0, 0x1B],    # 7
        [0, 0x9F, 0xA0, 0xA1, 0xA2], # 8
        [0, 0xBD, 0x19, 0xBF, 0x43], # 9
    ],

    "Maxilla": [
        [0, 0x1C, 0x1D, 0x1E, 0],    # 0
        [0, 0x1C, 0x1D, 0, 0x44],    # 1
        [0, 0x1C, 0x1D, 0x1E, 0x44], # 2
        [0, 0x1C, 0x1D, 0x1E, 0],    # 3
        [0, 0x1C, 0x1D, 0, 0],       # 4
        [0, 0x1C, 0x1D, 0, 0x44],    # 5
        [0, 0x1C, 0x1D, 0x1E, 0],    # 6
        [0, 0x1C, 0x1D, 0x1E, 0],    # 7
        [0, 0x0C, 0x0D, 0xA3, 0xA4], # 8
    ],

    "Right Claw": [
        [0, 0x1F, 0x20, 0x21, 0x22], # 0
        [0, 0x1F, 0x41, 0x45, 0x46], # 1
        [0, 0x1F, 0x52, 0x53, 0x54], # 2
        [0, 0x1F, 0x63, 0x21, 0x64], # 3
        [0, 0x1F, 0x63, 0x21, 0x6E], # 4
        [0, 0x1F, 0x7E, 0x53, 0x7F], # 5
        [0, 0x1F, 0x89, 0x21, 0x8A], # 6
        [0, 0x1F, 0x89, 0x21, 0x8A], # 7
        [0, 0xA5, 0xA6, 0xA7, 0xA8], # 8
        [0, 0x1F, 0xBE, 0x21, 0xC0], # 9
    ],

    "Right Bottom Legs": [
        [0, 0x23, 0x24, 0x25, 0],    # 0
        [0, 0x3E, 0, 0x3F, 0],       # 1
        [0, 0x55, 0, 0x56, 0x57],    # 2
        [0, 0x65, 0x66, 0x67, 0x68], # 3
        [0, 0x6F, 0x70, 0x71, 0],    # 4
        [0, 0x80, 0x81, 0x82, 0x83], # 5
        [0, 0x8B, 0x8C, 0x8D, 0x8E], # 6
        [0, 0x8B, 0x8C, 0x8D, 0x8E], # 7
        [0, 0xA9, 0xAA, 0xAB, 0xAC], # 8
        [0, 0, 0xC1, 0, 0xC2],       # 9
    ],

    "Mouth Acid Frames": [
        [0, 0xC7, 0xC8, 0x1C, 0x1D], # 0
        [0, 0xC9, 0xCA, 0x1C, 0x1D], # 1
        [0, 0xCB, 0xCC, 0xCD, 0xCE], # 2
        [0, 0xCF, 0xD0, 0xD1, 0xD2], # 3
        [0, 0xD3, 0xD4, 0xD5, 0xD6], # 4
        [0, 0xC3, 0xC4, 0x1C, 0x1D], # 5
        [0, 0xC5, 0xC6, 0x1C, 0x1D], # 6
        [0, 0x0C, 0x0D, 0x1C, 0x1D], # 7
        [0, 0x0C, 0x0D, 0x1C, 0x1D], # 8
        [0, 0x0C, 0x0D, 0x1C, 0x1D], # 9
    ],

    "Acid Drops": [
        [0, 0xD7, 0xD8, 0xD9, 0],    # 0
        [0, 0xDA, 0xDB, 0xDC, 0xDD], # 1
        [0, 0xDE, 0xDF, 0, 0],       # 2
        [0, 0xE0, 0xE1, 0, 0],       # 3
        [0, 0xE2, 0xE3, 0, 0],       # 4
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

    canvas.create_rectangle(x_frame-1, y_frame-1, x_frame + 16*scale, y_frame + 16*scale, outline="gray")
    
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

# ---------------------------------------------------------------------------
# PIL / Spritesheet generation
# ---------------------------------------------------------------------------

def _hex_color_to_rgb(hex_str):
    return (int(hex_str[1:3], 16), int(hex_str[3:5], 16), int(hex_str[5:7], 16))


def render_frame_to_pil(frame_data, tiles_raw, scale=3):
    TILE_SIZE = 32
    pal_idx = frame_data[0]
    tile_indices = frame_data[1:]
    lut = PAL_DECODE_TABLES[pal_idx]

    img = Image.new("RGBA", (16 * scale, 16 * scale), (0, 0, 0, 0))
    pixels = img.load()

    for i, t_idx in enumerate(tile_indices):
        if t_idx == 0:
            continue
        tile_data = tiles_raw[t_idx * TILE_SIZE : (t_idx + 1) * TILE_SIZE]
        tile_pixels = decode_fman_tile(tile_data, lut)

        col_offset = (i % 2) * 8
        row_offset = (i // 2) * 8

        for pi, p_idx in enumerate(tile_pixels):
            if p_idx is None:
                continue
            r, g, b = _hex_color_to_rgb(PALETTE_STRS[p_idx])
            rx = pi % 8
            ry = pi // 8
            for dy in range(scale):
                for dx in range(scale):
                    px = (col_offset + rx) * scale + dx
                    py = (row_offset + ry) * scale + dy
                    if 0 <= px < 16 * scale and 0 <= py < 16 * scale:
                        pixels[px, py] = (r, g, b, 255)
    return img


def load_grp(path):
    raw = open(path, "rb").read()
    if raw[0] == 0:
        skip, length, raw1 = 0, len(raw) - 1, raw[1:]
    else:
        skip = int.from_bytes(raw[1:3], "little")
        length = int.from_bytes(raw[3:5], "little")
        raw1 = raw[5 + skip:]
    return unpack(raw1, length)


# Sheet frame order — MUST match CRAB.left layout indices
SHEET_PARTS = [
    ("Left Eye", 10),
    ("Right Eye", 9),
    ("Left Tibia", 10),
    ("Left Femur", 10),
    ("Mouth", 9),
    ("Right Femur", 10),
    ("Right Tibia", 10),
    ("Left Bottom Legs", 10),
    ("Right Bottom Legs", 10),
    ("Left Claw", 10),
    ("Maxilla", 9),
    ("Right Claw", 10),
    ("Mouth Acid Frames", 10),
    ("Acid Drops", 5),
]

# Ordinary key frame data from eai1.asm: db 1, 0CDh, 0CEh, 0CFh, 0D0h
KEY_FRAME_DATA = [1, 0xCD, 0xCE, 0xCF, 0xD0]


def generate_spritesheet(crab_grp_path, enp_grp_path, output_png):
    TILE_SIZE = 32
    scale = 3

    crab_data = load_grp(crab_grp_path)
    crab_tiles = crab_data + b'\x00' * (256 * TILE_SIZE)

    enp_data = load_grp(enp_grp_path)
    enp_tiles = enp_data + b'\x00' * (256 * TILE_SIZE)

    num_body = sum(count for _, count in SHEET_PARTS)
    total = num_body + 1
    frame_w = 16 * scale
    frame_h = 16 * scale
    sheet = Image.new("RGBA", (total * frame_w, frame_h), (0, 0, 0, 0))

    x = 0
    for name, _ in SHEET_PARTS:
        for fd in CRAB_FRAMES[name]:
            sheet.paste(render_frame_to_pil(fd, crab_tiles, scale), (x, 0))
            x += frame_w

    # Ordinary key frame — rendered from enp1.grp tiles
    sheet.paste(render_frame_to_pil(KEY_FRAME_DATA, enp_tiles, scale), (x, 0))
    x += frame_w

    sheet.save(output_png)
    print(f"Spritesheet saved: {output_png}  ({total} frames, {sheet.width}x{sheet.height})")
    return num_body  # 132 frames (0-131), key is frame 132


def generate_crab_const():
    # Frame ranges for each body part (spritesheet order)
    fc = 0
    part_ranges = {}
    for name, count in SHEET_PARTS:
        part_ranges[name] = list(range(fc, fc + count))
        fc += count
    key_range = [fc]  # frame 132

    part_to_ci = {
        "Left Eye":          (0,  "left_eye"),
        "Right Eye":         (1,  "right_eye"),
        "Left Tibia":        (2,  "left_tibia"),
        "Left Femur":        (3,  "left_femur"),
        "Mouth":             (4,  "mouth"),
        "Right Femur":       (5,  "right_femur"),
        "Right Tibia":       (6,  "right_tibia"),
        "Left Bottom Legs":  (7,  "left_bottom_legs"),
        "Right Bottom Legs": (8,  "right_bottom_legs"),
        "Left Claw":         (16, "left_claw"),
        "Maxilla":           (17, "maxilla"),
        "Right Claw":        (18, "right_claw"),
        "Mouth Acid Frames": (20, "mouth_acid"),
        "Acid Drops":        (21, "acid_drop"),
    }

    entries = [(ci, part_ranges[nm], sn) for nm, (ci, sn) in part_to_ci.items()]
    entries.append((22, key_range, "ordinaryKey"))
    entries.sort(key=lambda x: x[0])

    def write_array(lines):
        idx = 0
        for ci, frames, sn in entries:
            while idx < ci:
                lines.append("        [], //")
                idx += 1
            lines.append(f"        [{', '.join(f'{f:3d}' for f in frames)}], // {sn}")
            idx += 1
        while idx < 32:
            lines.append("        [], //")
            idx += 1

    lines = []
    lines.append("const CRAB = {")
    lines.append("    left: [ // 32 arrays")
    write_array(lines)
    lines.append("    ],")
    lines.append("    right: [ // mirrored — same frames as left for crab")
    write_array(lines)
    lines.append("    ],")
    lines.append(f"    numSprites: {fc + 1},")
    lines.append("};")
    return "\n".join(lines) + "\n"


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
    body_layout_normal = [
                                            ("Left Eye", 24, 0), ("Right Eye", 40, 0),
        ("Left Tibia", 0, 16), ("Left Femur", 16, 16), ("Mouth", 32, 16), ("Right Femur", 48, 16), ("Right Tibia", 64, 16),
        ("Left Bottom Legs", 0, 32), ("Left Claw", 16, 32), ("Maxilla", 32, 32), ("Right Claw", 48, 32), ("Right Bottom Legs", 64, 32)
    ]
    body_layout_acid_drip = [
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
            for name, gx, gy in body_layout_normal:
                draw_composed_16x16_frame(canvas, CRAB_FRAMES[name][phase], tiles_raw, x_base + gx*scale, y_base + gy*scale, scale)
        else:
            # Phase 9: Special placement
            for name, gx, gy in body_layout_acid_drip:
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
    import argparse
    parser = argparse.ArgumentParser(description="Zeliard Crab GRP Viewer / Spritesheet Generator")
    parser.add_argument("--spritesheet", metavar="OUTPUT_PNG", help="Generate spritesheet PNG")
    parser.add_argument("--crab-const", metavar="OUTPUT_JS", help="Generate CRAB constant JS file")
    parser.add_argument("--crab-grp", default="crab.grp", help="Path to crab.grp (default: crab.grp)")
    parser.add_argument("--enp-grp", default="enp1.grp", help="Path to enp1.grp for ordinary key (default: enp1.grp)")
    args, remaining = parser.parse_known_args()

    if args.spritesheet:
        crab_path = args.crab_grp
        enp_path = args.enp_grp
        generate_spritesheet(crab_path, enp_path, args.spritesheet)
        if args.crab_const:
            const_js = generate_crab_const()
            with open(args.crab_const, "w") as f:
                f.write(const_js)
            print(f"CRAB const written to: {args.crab_const}")
        sys.exit(0)

    if args.crab_const:
        const_js = generate_crab_const()
        with open(args.crab_const, "w") as f:
            f.write(const_js)
        print(f"CRAB const written to: {args.crab_const}")
        sys.exit(0)

    app = tk.Tk()
    app.geometry("1100x800")
    GrpViewer(app)
    app.mainloop()
