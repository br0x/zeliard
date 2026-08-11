#!/usr/bin/env python3
import sys
import os
import tkinter as tk
from tkinter import filedialog

DEBUG_DRAW = False

# ---------------------------------------------------------------------------
# Configuration & Descriptors
# ---------------------------------------------------------------------------

# Mode Definitions:
# 12: boss sprites (crab.grp)
# 14: boss sprites (tako.grp)
# 15: boss sprites (tori.grp)
# 16: boss sprites (zela.grp)
# 17: boss sprites (meda.grp)
# 21: boss sprites (akma.grp)
GRP_DESCRIPTOR = [
    ("crab.grp",  12),
    ("tako.grp",  14),
    ("tori.grp",  15),
    ("zela.grp",  16),
    ("meda.grp",  17),
    ("lega.grp",  18),
    ("drgn.grp",  19),
    ("zel2.grp",  20),
    ("akma.grp",  21),
    ("mao1.grp",  22),
]

MODE_CFG = {
    12:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "crab"},
    14:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "tako"},
    15:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "tori"},
    16:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "zela"},
    17:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "meda"},
    18:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "lega"},
    19:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "drgn"},
    20:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "zel2"},
    21:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "akma"},
    22:{"w": 16, "h": 8,  "stride": 4,  "bytes": 32,  "type": "mao1"},
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
# Transcribed directly from drgn.asm A030 pointer table / byte_A044..byte_A297.
# Each entry is [pal_idx, tl, tr, bl, br], matching the other boss frame tables.
# Dragon layout bytes use their high nibble as this table-group index and low nibble
# as the frame index within that group.
DRGN_FRAMES = {
    "Tile Group 0 (byte_A044)": [
        [0, 0x66, 0, 0x67, 0x6C],
        [0, 0x68, 0x69, 0x6D, 0x6E],
        [0, 0x6C, 0x6D, 0x72, 0x73],
        [0, 0x83, 0x84, 0, 0x86],
        [0, 0x95, 0xB1, 0x98, 0x99],
        [0, 0x9A, 0x9B, 0x9D, 0x9E],
        [0, 0x68, 0x90, 0x6D, 0x91],
        [0, 0x9A, 0x9B, 0x9D, 0xFE],
    ],
    "Tile Group 1 (byte_A06C)": [
        [0, 0x73, 0x74, 0, 0],
        [0, 0x6A, 0x6B, 0x6F, 0x70],
        [0, 0x70, 0x71, 0x75, 0x76],
        [0, 0x77, 0x78, 0x7A, 0x7B],
        [0, 0x78, 0x79, 0x7B, 0x7C],
        [0, 0x7D, 0x7E, 0x77, 0x10],
        [0, 0x7F, 1, 0x0C, 0x0D],
        [0, 0x77, 0x10, 0, 0x0E],
        [0, 0x97, 0, 0x70, 0x71],
        [0, 0xB3, 0x75, 0, 0x77],
        [0, 0x76, 0, 0x78, 0x79],
        [0, 0xA6, 0x9F, 0x87, 0xA1],
        [0, 0x99, 0x87, 0xB3, 0x88],
        [0, 0xA1, 0xA3, 0x8C, 0x89],
        [0, 0x8A, 0, 0xAD, 0x8D],
        [0, 0xAD, 0x8D, 0x8B, 0x10],
    ],
    "Tile Group 2 (byte_A0BC)": [
        [0, 0x8D, 0x8F, 0x10, 0x7E],
        [0, 0xA6, 1, 0x0C, 0x0D],
        [0, 0x8E, 0x10, 0x67, 0x0E],
        [0, 0x6E, 0x6F, 0x73, 0xA7],
        [0, 0x6A, 0x6B, 0x6F, 0xA0],
        [0, 0xA0, 0xA1, 0xA8, 0xA9],
        [0, 0x9F, 0x9F, 0xA1, 0xA2],
        [0, 0xA2, 0xA3, 0xAA, 0xAB],
        [0, 0xA4, 0xA5, 0xAC, 0xAD],
        [0, 0xAC, 0xAD, 0x67, 0x0E],
        [0, 0x6E, 0x6F, 0x85, 0xA7],
        [0, 0x80, 0x82, 0x81, 0xAE],
        [0, 0xB4, 0xD3, 0xC4, 0x94],
        [0, 0xD3, 0, 0x94, 0x9C],
        [0, 0x85, 0x74, 0, 0],
    ],
    "Tile Group 3 (byte_A107)": [
        [0, 0, 0xDF, 0xE8, 0xE9],
        [0, 0xE0, 0xE1, 0xEA, 0xEA],
        [0, 0xE2, 0xE2, 0xEA, 0xEB],
        [0, 0xE3, 0xE4, 0, 0],
        [0, 0xE4, 0xE5, 0, 0],
        [0, 0, 0xE7, 0xEC, 0xED],
        [0, 0, 0xF5, 0xF9, 0xFA],
        [0, 0xED, 0xEE, 0xF6, 0xF7],
        [0, 0xEF, 0xF0, 0xF8, 0xEA],
        [0, 0xF1, 0xF2, 0xEA, 0xEB],
        [0, 0xF3, 0xF4, 0, 0],
        [0, 0, 0, 0xF4, 0],
        [0, 0xFB, 0xFC, 0xB2, 0x96],
        [0, 0xFD, 0xFD, 0xEA, 0xEA],
        [0, 0xFD, 0xF3, 0xE6, 0xA6],
    ],
    "Tile Group 4 (byte_A152)": [
        [0, 0, 0x92, 0xF9, 0xFA],
        [0, 0x93, 0xBB, 0xBA, 0xBF],
        [0, 0, 0xCC, 0xC8, 0xE9],
        [0, 0xCF, 0xCF, 0xEA, 0xEB],
        [0, 0xD0, 0xD1, 0, 0],
        [0, 0xAF, 0, 0, 0xB0],
        [0, 0xBC, 0xC1, 0xB2, 0x96],
        [0, 0xCA, 0xF1, 0xFD, 0xFD],
        [0, 0xF2, 0xF3, 0xFD, 0xF3],
        [0, 0xF3, 0xF4, 0xF3, 0xF4],
        [0, 0xFD, 0xFD, 0xEA, 0xEA],
        [0, 0xFD, 0xF3, 0xE6, 0xA6],
    ],
    "Tile Group 5 (byte_A18E)": [
        [0, 0, 0x0E, 0x20, 0x21],
        [0, 0x0F, 0x10, 0x22, 0x23],
        [0, 2, 3, 0x19, 0x10],
        [0, 4, 5, 0x1A, 0x1B],
        [0, 0x1C, 0x1D, 0x24, 0x25],
        [0, 0x1E, 0x1F, 0x26, 0x27],
        [0, 0x0E, 0x0F, 0x20, 0x12],
        [0, 0x0F, 0x10, 0x12, 0x3C],
        [0, 2, 3, 0x19, 0x28],
        [0, 4, 5, 0x29, 0x2A],
        [0, 0x1C, 0x2B, 0x3D, 0x26],
        [0, 0x2C, 0x11, 0x27, 0x31],
        [0, 0x0F, 0x10, 0x37, 0x38],
        [0, 2, 3, 0x32, 0x33],
        [0, 4, 5, 0x34, 0x35],
        [0, 0x36, 0x2C, 0x26, 0x27],
    ],
    "Tile Group 6 (byte_A1DE)": [
        [0, 0x11, 0x11, 0x31, 0x39],
        [0, 6, 7, 0x11, 0x5C],
        [0, 0x11, 0x42, 0x3B, 0x48],
        [0, 8, 9, 0x3E, 0x3F],
        [0, 0x43, 0x44, 0x49, 0x4A],
        [0, 0x45, 0x46, 0x4B, 0x4C],
        [0, 0x47, 0x16, 0x4D, 0x4E],
        [0, 0x11, 0x4F, 0x55, 0x56],
        [0, 0x54, 0x16, 0x5B, 0x4E],
        [0, 0x50, 0x51, 0x57, 0x58],
        [0, 0x52, 0x53, 0x59, 0x5A],
        [0, 0x11, 0x5E, 0x64, 0x65],
        [0, 8, 9, 0x5D, 0x3F],
    ],
    "Tile Group 7 (byte_A21F)": [
        [0, 0x5F, 0x60, 0x2D, 0x2E],
        [0, 0x61, 0x62, 0x2F, 0x30],
        [0, 0x63, 0x16, 0x3A, 0x4E],
        [0, 0x0A, 0x0B, 0x40, 0x41],
        [0, 0, 0, 0x14, 0x15],
        [0, 6, 7, 0x11, 0x11],
        [0, 0x13, 0x75, 0x17, 0x77],
        [0, 0x17, 0x77, 0x18, 0x7A],
    ],
    "Tile Group 8 (byte_A247)": [
        [1, 0, 0xB6, 0xB7, 0],
        [1, 0, 0xB5, 0xB6, 0],
        [1, 0, 0xB6, 0xB7, 0],
        [1, 0, 0xB7, 0xB8, 0],
        [1, 0, 0xB6, 0xB5, 0],
        [1, 0xB9, 0xB6, 0xB8, 0],
        [1, 0xBE, 0xB8, 0xB8, 0xC0],
        [1, 0xB8, 0xC0, 0xC5, 0xC6],
        [1, 0, 0, 0xC2, 0xC7],
        [1, 0xBD, 0xBE, 0xC5, 0xC3],
        [1, 0, 0, 0xBD, 0xC2],
        [1, 0xC9, 0xB7, 0xCB, 0],
        [1, 0xC9, 0xCD, 0xCD, 0xCE],
        [1, 0, 0xC9, 0xBE, 0xD2],
        [1, 0, 0xCD, 0xC2, 0xD2],
        [1, 0xCE, 0, 0xC2, 0xD4],
    ],
    "Tile Group 9 (byte_A297)": [
        [1, 0, 0, 0xD5, 0xD8],
        [1, 0, 0, 0xD8, 0xD9],
        [1, 0, 0, 0xDA, 0xDC],
        [1, 0, 0, 0xDB, 0xDC],
        [1, 0, 0, 0xDB, 0xDE],
        [1, 0, 0, 0xD5, 0xD6],
        [1, 0, 0, 0xD6, 0xD6],
        [1, 0, 0, 0xD7, 0xD7],
        [1, 0, 0, 0xD6, 0xD7],
        [1, 0, 0, 0xD8, 0xD9],
        [1, 0, 0, 0xDA, 0xDB],
        [1, 0, 0, 0xDB, 0xDC],
        [1, 0, 0, 0xDC, 0xDB],
        [1, 0, 0, 0xDD, 0xDE],
    ],
}

DRGN_FRAME_SET_BY_INDEX = {
    0: "Tile Group 0 (byte_A044)",
    1: "Tile Group 1 (byte_A06C)",
    2: "Tile Group 2 (byte_A0BC)",
    3: "Tile Group 3 (byte_A107)",
    4: "Tile Group 4 (byte_A152)",
    5: "Tile Group 5 (byte_A18E)",
    6: "Tile Group 6 (byte_A1DE)",
    7: "Tile Group 7 (byte_A21F)",
    8: "Tile Group 8 (byte_A247)",
    9: "Tile Group 9 (byte_A297)",
}

# Dragon composite body data, transcribed from drgn.asm off_A783..off_A8FD.
# sub_A758 writes each sparse layer into a shared 29-column x 10-row buffer.
DRGN_BODY_TILES = [
    [0x00,0x02,0x01,0x10,0x11,0x12,0x13,0x14,0x15,0x17,0x16],
    [0x00,0x03,0x01,0x2E,0x11,0x12,0x13,0x14,0x15,0x17,0x16],
    [0x00,0x02,0x06,0x10,0x11,0x12,0x13,0x14,0x15,0x17,0x16],
    [0x00,0x03,0x06,0x2E,0x11,0x12,0x13,0x14,0x15,0x17,0x16],
    [0x05,0x04,0x19,0x18,0x13,0x1A,0x14,0x15,0x17,0x16],
    [0x07,0x04,0x76,0x77,0x18,0x13,0x1A,0x14,0x15,0x17,0x16],
    [0x05,0x04,0x1C,0x1B,0x1D,0x1E,0x1F,0x20,0x22,0x16],
    [0x00,0x02,0x01,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x21],
    [0x00,0x03,0x06,0x2A,0x24,0x25,0x26,0x27,0x28,0x29,0x21],
    [0x00,0x02,0x06,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x21],
    [0x00,0x03,0x06,0x2A,0x24,0x25,0x26,0x27,0x28,0x29,0x21],
]
DRGN_BODY_MASKS = [
    [0,0,0,0x80,0x40,0x80,0x20,0x80,0x50,0x16,0,0x04],
    [0,0,0,0x80,0x20,0x80,0x20,0x80,0x50,0x16,0,0x04],
    [0,0,0,0x80,0x40,0x80,0x20,0x80,0x50,0x16,0,0x04],
    [0,0,0,0x80,0x20,0x80,0x20,0x80,0x50,0x16,0,0x04],
    [0,0,0,0,0,0x20,0x80,0x20,0x90,0x36,0,0x04],
    [0,0,0,0,0,0x20,0x80,0x30,0x90,0x36,0,0x04],
    [0,0,0x08,0x20,0x10,0x20,0x10,0,0x18,0x0A,0,0x04],
    [0x08,0x04,0x08,0x04,0x08,0x04,0x08,0x04,0,0x06,0,0x04],
    [0x08,0x02,0x08,0x04,0x08,0x04,0x08,0x04,0,0x06,0,0x04],
    [0x08,0x04,0x08,0x04,0x08,0x04,0x08,0x04,0,0x06,0,0x04],
    [0x08,0x02,0x08,0x04,0x08,0x04,0x08,0x04,0,0x06,0,0x04],
]

DRGN_DETAIL_TILES = [0x2B,0x2C,0x2D]
DRGN_DETAIL_MASK = [0x80,0,0x80,0x80]

DRGN_LIMB_TILES = [
    [0x50,0x51,0x52,0x54,0x53,0x55],
    [0x56,0x57,0x58,0x5A,0x59,0x5B],
    [0x5C,0x5D,0x5F,0x5E,0x60],
    [0x56,0x57,0x58,0x5A,0x59,0x5B],
]
DRGN_LIMB_MASKS = [
    [0x20,0,0x20,0,0xA0,0,0xA0],
    [0,0x20,0x20,0,0xA0,0,0xA0],
    [0,0,0x20,0,0xA0,0,0xA0],
    [0,0x20,0x20,0,0xA0,0,0xA0],
]

DRGN_RLIMB_TILES = [
    [0x75,0x62,0x63,0x64,0x73,0x65,0x74,0x66],
    [0x75,0x67,0x63,0x69,0x73,0x6A,0x74,0x68],
    [0x61,0x6B,0x6C,0x70,0x73,0x71,0x74,0x72],
    [0x75,0x67,0x63,0x69,0x73,0x6A,0x74,0x68],
]
DRGN_RLIMB_MASK = [0xA0,0,0xA0,0,0xA0,0,0xA0]

DRGN_ANIM_TILES = [
    [0x36,0x35,0x37,0x3C,0x30,0x38,0x3D,0x31,0x39,0x3E,0x32,0x3A,0x3B,0x33,0x34],
    [0x40,0x41,0x46,0x42,0x47,0x4A,0x43,0x48,0x4B,0x49,0x44,0x45],
]
DRGN_ANIM_MASKS = [
    [0x10,0x40,0x28,0x80,0x28,0x80,0x28,0x80,0x30,0x80,0x80],
    [0x10,0,0x28,0,0x58,0,0x58,0x10,0x40,0,0x40],
]

# Optional breath layer. It is rendered outside the 29x10 body buffer by the AI.
DRGN_BREATH_LEFT_TILES = [
    [0x80], [0x83,0x82,0x81], [0x8A,0x89,0x86,0x87,0x85,0x88,0x84],
    [0x8D,0x8E,0x8C,0x8F,0x8B,0x81],
]
DRGN_BREATH_LEFT_MASKS = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0x80],
    [0,0,0,0,0,0,0,0,0,0x10,0,0x40,0x80],
    [0,0,0,0,0,0x08,0,0x08,0,0x18,0x20,0x08,0x80],
    [0,0,0,0,0,0x08,0,0x08,0x10,0x08,0x20,0,0x80],
]
DRGN_BREATH_RIGHT_TILES = [
    [0x90,0x91], [0x92,0x93,0x94], [0x95,0x96,0x97,0x98,0x96,0x99],
    [0x9A,0x9B,0x9B,0x9C,0x9B,0x9D],
]
DRGN_BREATH_RIGHT_MASKS = [
    [0,0,0,0,0,0,0,0,0x20,0x20,0,0,0],
    [0,0,0,0,0,0x20,0,0x20,0,0x20,0,0,0],
    [0x20,0x20,0,0x20,0,0x20,0,0x20,0,0x20,0,0,0],
    [0x20,0x20,0,0x20,0,0x20,0,0x20,0,0x20,0,0,0],
]

TAKO_FRAMES = {
    "Frame Set 00 (byte_A052)": [
        [0, 0, 0, 1, 0],
        [0, 2, 3, 4, 5],
        [0, 0, 0, 6, 7],
        [0, 0, 0, 8, 9],
        [0, 10, 11, 12, 13],
        [0, 14, 15, 16, 17],
        [0, 0, 0, 0, 22],
        [0, 23, 24, 25, 26],
        [0, 27, 28, 29, 30],
        [0, 0, 0, 31, 32],
        [0, 0, 0, 33, 34],
        [0, 35, 36, 37, 38],
        [0, 39, 40, 41, 42],
        [0, 0, 0, 43, 44],
        [0, 45, 46, 47, 48],
        [0, 49, 50, 51, 52],
    ],
    "Frame Set 01 (byte_A0A2)": [
        [0, 0, 0, 0, 53],
        [0, 54, 55, 56, 57],
        [0, 58, 59, 60, 61],
        [0, 0, 0, 0, 62],
        [0, 63, 64, 65, 66],
        [0, 67, 68, 69, 26],
        [0, 0, 0, 70, 71],
        [0, 72, 36, 37, 38],
        [0, 0, 0, 73, 74],
        [0, 75, 76, 77, 78],
        [0, 0, 0, 79, 74],
        [0, 80, 76, 77, 78],
        [0, 0, 0, 33, 81],
        [0, 35, 82, 37, 38],
        [0, 83, 0, 84, 85],
        [0, 0, 86, 87, 88],
    ],
    "Frame Set 02 (byte_A0F2)": [
        [0, 0, 0, 3, 0],
        [0, 89, 90, 91, 92],
        [0, 14, 93, 94, 95],
        [0, 0, 0, 99, 0],
        [0, 100, 101, 102, 103],
        [0, 104, 105, 106, 107],
        [0, 14, 108, 109, 95],
        [0, 113, 68, 69, 26],
        [0, 0, 0, 114, 115],
        [0, 116, 0, 117, 118],
        [0, 0, 0, 119, 120],
        [0, 121, 122, 123, 124],
        [0, 127, 24, 25, 26],
        [0, 128, 0, 129, 130],
        [0, 0, 0, 0, 131],
        [0, 0, 0, 119, 120],
    ],
    "Frame Set 03 (byte_A142)": [
        [0, 132, 133, 134, 135],
        [0, 0, 0, 0, 23],
        [0, 138, 139, 140, 141],
        [0, 0, 0, 142, 143],
        [0, 144, 145, 146, 147],
        [0, 0, 149, 150, 151],
        [0, 102, 0, 152, 153],
        [0, 154, 0, 155, 156],
        [0, 0, 157, 158, 159],
        [0, 162, 163, 0, 164],
        [0, 0, 0, 165, 166],
        [0, 197, 204, 198, 21],
        [0, 10, 169, 170, 13],
        [0, 10, 172, 173, 174],
        [0, 14, 15, 175, 17],
        [0, 0, 86, 0, 0],
    ],
    "Frame Set 04 (byte_A192)": [
        [0, 89, 177, 0, 178],
        [0, 14, 93, 179, 95],
        [0, 181, 182, 0, 103],
        [0, 183, 184, 106, 107],
        [0, 0, 0, 117, 118],
        [0, 0, 186, 123, 124],
        [0, 188, 189, 134, 135],
        [0, 206, 207, 140, 0],
        [0, 144, 191, 0, 192],
        [0, 0, 157, 0, 194],
        [0, 10, 172, 173, 174],
        [0, 14, 93, 196, 95],
        [0, 14, 15, 196, 17],
        [0, 14, 108, 196, 95],
        [0, 14, 15, 196, 199],
        [0, 23, 24, 200, 201],
    ],
    "Frame Set 05 (byte_A1E2)": [
        [0, 202, 203, 29, 30],
        [0, 14, 93, 196, 205],
        [0, 67, 68, 200, 201],
        [0, 14, 108, 196, 205],
        [0, 113, 68, 200, 201],
        [0, 127, 24, 200, 201],
        [0, 0, 0, 8, 168],
    ],
    "Frame Set 15 (byte_A205)": [
        [0, 18, 19, 20, 21],
        [0, 96, 97, 98, 21],
        [0, 110, 111, 112, 21],
        [0, 125, 111, 126, 21],
        [0, 136, 111, 137, 21],
        [0, 148, 111, 137, 21],
        [0, 160, 111, 161, 21],
        [0, 171, 111, 20, 21],
        [0, 176, 19, 20, 21],
        [0, 180, 97, 98, 21],
        [0, 185, 111, 112, 21],
        [0, 187, 111, 126, 21],
        [0, 190, 111, 137, 21],
        [0, 193, 111, 137, 21],
        [0, 195, 111, 137, 21],
        [0, 197, 111, 20, 21],
    ],
    "Frame Set 14 (byte_A255)": [
        [0, 197, 19, 198, 21],
        [0, 0, 0, 167, 168],
    ],
    "Frame Set 16 (byte_A25F)": [
        [2, 0, 208, 0, 209],
        [2, 210, 211, 212, 213],
        [2, 0, 0, 214, 215],
        [2, 216, 217, 218, 219],
        [2, 220, 221, 222, 223],
        [2, 224, 225, 226, 227],
    ],
}


# Tentacle layout tables (tile_group, anim_idx pairs) transcribed from
# tako.asm byte_A5BD..byte_A993 (off_A57D pointer table), index 0..31 =
# tentacle_anim_step (0-7) + anim_group_offset (0/8/16/24). tile_group
# indexes into TAKO_FRAME_SET_BY_INDEX / TAKO_FRAMES; anim_idx indexes
# into that frame set's list.
TAKO_LAYOUT_TABLES = [
    [(0, 0), (0, 1), (0, 2), (0, 3), (0, 4), (0, 5), (15, 0), (0, 6), (0, 7), (0, 8), (0, 10), (0, 11), (0, 12), (0, 13), (0, 14), (0, 15), (1, 0), (1, 1), (1, 2)],  # byte_A5BD
    [(1, 14), (1, 15), (2, 0), (2, 1), (2, 2), (15, 1), (0, 6), (1, 5), (0, 8), (1, 6), (1, 7), (0, 12), (1, 8), (1, 9), (0, 15), (1, 3), (1, 1), (1, 2)],  # byte_A5E3
    [(2, 3), (2, 4), (2, 5), (2, 6), (15, 2), (0, 9), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (0, 13), (0, 14), (0, 15), (1, 3), (1, 4), (1, 2)],  # byte_A607
    [(2, 8), (2, 9), (2, 10), (2, 11), (2, 6), (15, 3), (0, 9), (2, 12), (0, 8), (0, 10), (0, 11), (0, 12), (1, 8), (1, 9), (0, 15), (1, 0), (1, 4), (1, 2)],  # byte_A629
    [(2, 13), (2, 14), (2, 15), (3, 0), (2, 6), (15, 4), (0, 6), (2, 12), (0, 8), (1, 12), (1, 13), (0, 12), (1, 10), (1, 11), (0, 15), (1, 0), (1, 1), (1, 2)],  # byte_A64D
    [(3, 1), (3, 2), (3, 3), (3, 4), (2, 6), (15, 5), (0, 6), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (1, 8), (1, 9), (0, 15), (1, 3), (1, 1), (1, 2)],  # byte_A671
    [(3, 5), (3, 6), (3, 7), (3, 8), (2, 6), (15, 6), (0, 9), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (0, 13), (0, 14), (0, 15), (1, 3), (1, 4), (1, 2)],  # byte_A695
    [(3, 9), (3, 10), (14, 1), (3, 12), (2, 2), (15, 7), (0, 9), (0, 7), (0, 8), (0, 10), (0, 11), (0, 12), (1, 8), (1, 9), (0, 15), (1, 0), (1, 4), (1, 2)],  # byte_A6B9
    [(0, 0), (0, 1), (5, 6), (3, 13), (3, 14), (15, 8), (0, 6), (0, 7), (0, 8), (0, 10), (0, 11), (0, 12), (0, 13), (0, 14), (0, 15), (1, 0), (1, 1), (1, 2)],  # byte_A6DD
    [(1, 14), (3, 15), (2, 0), (4, 0), (4, 1), (15, 9), (0, 6), (1, 5), (0, 8), (1, 6), (1, 7), (0, 12), (1, 8), (1, 9), (0, 15), (1, 3), (1, 1), (1, 2)],  # byte_A701
    [(2, 3), (4, 2), (4, 3), (2, 6), (15, 10), (0, 9), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (0, 13), (0, 14), (0, 15), (1, 3), (1, 4), (1, 2)],  # byte_A725
    [(4, 4), (4, 5), (2, 6), (15, 11), (0, 9), (2, 12), (0, 8), (0, 10), (0, 11), (0, 12), (1, 8), (1, 9), (0, 15), (1, 0), (1, 4), (1, 2)],  # byte_A747
    [(2, 14), (4, 6), (2, 6), (15, 12), (0, 6), (2, 12), (0, 8), (1, 12), (1, 13), (0, 12), (1, 10), (1, 11), (0, 15), (1, 0), (1, 1), (1, 2)],  # byte_A767
    [(3, 1), (4, 7), (3, 3), (4, 8), (2, 6), (15, 13), (0, 6), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (1, 8), (1, 9), (0, 15), (1, 3), (1, 1), (1, 2)],  # byte_A787
    [(3, 5), (3, 7), (4, 9), (2, 6), (15, 14), (0, 9), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (0, 13), (0, 14), (0, 15), (1, 3), (1, 4), (1, 2)],  # byte_A7AB
    [(3, 9), (14, 1), (4, 10), (4, 11), (15, 15), (0, 9), (0, 7), (0, 8), (0, 10), (0, 11), (0, 12), (1, 8), (1, 9), (0, 15), (1, 0), (1, 4), (1, 2)],  # byte_A7CD
    [(4, 12), (14, 0), (0, 6), (0, 7), (0, 8), (0, 10), (0, 11), (0, 12), (0, 13), (0, 14), (0, 15), (1, 0), (1, 1), (1, 2)],  # byte_A7EF
    [(4, 11), (14, 0), (0, 6), (1, 5), (0, 8), (1, 6), (1, 7), (0, 12), (1, 8), (1, 9), (0, 15), (1, 3), (1, 1), (1, 2)],  # byte_A80B
    [(4, 13), (14, 0), (0, 9), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (0, 13), (0, 14), (0, 15), (1, 3), (1, 4), (1, 2)],  # byte_A827
    [(4, 13), (14, 0), (0, 9), (2, 12), (0, 8), (0, 10), (0, 11), (0, 12), (1, 8), (1, 9), (0, 15), (1, 0), (1, 4), (1, 2)],  # byte_A843
    [(4, 13), (14, 0), (0, 6), (2, 12), (0, 8), (1, 12), (1, 13), (0, 12), (1, 10), (1, 11), (0, 15), (1, 0), (1, 1), (1, 2)],  # byte_A85F
    [(4, 13), (14, 0), (0, 6), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (1, 8), (1, 9), (0, 15), (1, 3), (1, 1), (1, 2)],  # byte_A87B
    [(4, 13), (14, 0), (0, 9), (2, 7), (0, 8), (1, 6), (1, 7), (0, 12), (0, 13), (0, 14), (0, 15), (1, 3), (1, 4), (1, 2)],  # byte_A897
    [(4, 11), (14, 0), (0, 9), (0, 7), (0, 8), (0, 10), (0, 11), (0, 12), (1, 8), (1, 9), (0, 15), (1, 0), (1, 4), (1, 2)],  # byte_A8B3
    [(4, 14), (3, 11), (0, 6), (4, 15), (5, 0), (0, 10), (0, 11), (0, 12), (0, 13), (0, 14), (0, 15), (1, 0), (1, 1), (1, 2)],  # byte_A8CF
    [(5, 1), (3, 11), (0, 6), (5, 2), (5, 0), (1, 6), (1, 7), (0, 12), (1, 8), (1, 9), (0, 15), (1, 3), (1, 1), (1, 2)],  # byte_A8EB
    [(5, 3), (3, 11), (0, 9), (5, 4), (5, 0), (1, 6), (1, 7), (0, 12), (0, 13), (0, 14), (0, 15), (1, 3), (1, 4), (1, 2)],  # byte_A907
    [(5, 3), (3, 11), (0, 9), (5, 5), (5, 0), (0, 10), (0, 11), (0, 12), (1, 8), (1, 9), (0, 15), (1, 0), (1, 4), (1, 2)],  # byte_A923
    [(5, 3), (3, 11), (0, 6), (5, 5), (5, 0), (1, 12), (1, 13), (0, 12), (1, 10), (1, 11), (0, 15), (1, 0), (1, 1), (1, 2)],  # byte_A93F
    [(5, 3), (3, 11), (0, 6), (5, 4), (5, 0), (1, 6), (1, 7), (0, 12), (1, 8), (1, 9), (0, 15), (1, 3), (1, 1), (1, 2)],  # byte_A95B
    [(5, 3), (3, 11), (0, 9), (5, 4), (5, 0), (1, 6), (1, 7), (0, 12), (0, 13), (0, 14), (0, 15), (1, 3), (1, 4), (1, 2)],  # byte_A977
    [(5, 1), (3, 11), (0, 9), (4, 15), (5, 0), (0, 10), (0, 11), (0, 12), (1, 8), (1, 9), (0, 15), (1, 0), (1, 4), (1, 2)],  # byte_A993
]

# The 7 distinct tentacle row-visibility bitmasks (byte_A9EF..byte_AA19).
TAKO_SHAPE_BASES = [
    (224, 96, 96, 224, 224, 224, 224),  # byte_A9EF
    (96, 96, 96, 224, 224, 224, 224),  # byte_A9F6
    (96, 32, 96, 224, 224, 224, 224),  # byte_A9FD
    (192, 96, 96, 224, 224, 224, 224),  # byte_AA04
    (32, 32, 96, 224, 224, 224, 224),  # byte_AA0B
    (64, 96, 96, 224, 224, 224, 224),  # byte_AA12
    (0, 0, 96, 224, 224, 224, 224),  # byte_AA19
]

# off_A9AF: which of the 7 base shape masks each of the 32 table slots uses
# (several slots alias the same physical mask in the original data).
TAKO_SHAPE_MAP = [0, 1, 2, 1, 1, 1, 1, 1, 3, 1, 2, 4, 4, 1, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]

# Maps a tile_group value (as found in TAKO_LAYOUT_TABLES) to its
# TAKO_FRAMES key -- i.e. which anim_frame_table_ptrs slot it selects.
TAKO_FRAME_SET_BY_INDEX = {
    0: "Frame Set 00 (byte_A052)",
    1: "Frame Set 01 (byte_A0A2)",
    2: "Frame Set 02 (byte_A0F2)",
    3: "Frame Set 03 (byte_A142)",
    4: "Frame Set 04 (byte_A192)",
    5: "Frame Set 05 (byte_A1E2)",
    14: "Frame Set 14 (byte_A255)",
    15: "Frame Set 15 (byte_A205)",
    16: "Frame Set 16 (byte_A25F)",
}

# Transcribed directly from tori.asm's sprite-frame descriptor tables
# (byte_A04E..byte_A1C5), pointed to by the 15-entry offset table right
# after "start:". Same [pal_idx, tl, tr, bl, br] format as CRAB_FRAMES/
# TAKO_FRAMES/ENP*_FRAMES. Like TAKO_FRAMES, these aren't read by
# Tori_AI_proc itself -- they belong to the generic monster-rendering
# routine -- so they're labeled by their slot index/original symbol
# rather than a hand-picked body-part name.
TORI_FRAMES = {
    "Frame Set 00 (byte_A04E)": [
        [0, 1, 2, 3, 4],
        [0, 0x9C, 2, 0x9D, 4],
        [0, 0x29, 0x2A, 0x2B, 0x2C],
        [0, 0x6A, 0x6B, 0x6C, 0x6D],
        [0, 0x6A, 0x6B, 0x8A, 0x6D],
    ],
    "Frame Set 01 (byte_A067)": [
        [0, 0x0E, 0x0F, 0x12, 0x13],
        [0, 0x2D, 0x32, 0x2E, 0x2F],
        [0, 0x2D, 0x49, 0x2E, 0x50],
        [0, 0x2D, 0, 0x2E, 0x58],
        [0, 0, 0x62, 0x66, 0x67],
        [0, 0x7D, 0x7E, 0, 0x87],
        [0, 0x7D, 0x7E, 0, 0x19],
        [0, 0, 0, 0x8F, 0x90],
        [0, 0x96, 0x97, 0x98, 0x99],
    ],
    "Frame Set 02 (byte_A094)": [
        [0, 0x10, 0x11, 0x14, 0],
        [0, 0, 0x3B, 0x38, 0x39],
        [0, 0x4D, 0x4E, 0x49, 0x4A],
        [0, 0, 0, 0x59, 0x5A],
        [0, 0x63, 0x64, 0x68, 0x69],
        [0, 0, 0x72, 0x6E, 0x6F],
        [0, 0x91, 0, 0x94, 0x95],
        [0, 0x99, 0x9A, 0x28, 0x9B],
    ],
    "Frame Set 03 (byte_A0BC)": [
        [0, 0, 5, 6, 7],
        [0, 0x39, 0x3A, 0x36, 0x37],
        [0, 0x4F, 0, 0x4B, 0x4C],
        [0, 0, 0x5B, 0, 0x5F],
        [0, 0x65, 0, 0xA4, 0xA5],
        [0, 0x7A, 0, 0x76, 0x77],
    ],
    "Frame Set 04 (byte_A0DA)": [
        [0, 0x15, 0x16, 0x17, 0x18],
        [0, 0x35, 0x36, 0x33, 0x34],
        [0, 0x50, 0x51, 0x3C, 0x3D],
        [0, 0x5C, 0x5D, 0x60, 0x61],
        [0, 0x2E, 0xA6, 0, 0x3C],
        [0, 0x7B, 0x7C, 0x78, 0x79],
        [0, 0x92, 0x93, 0xAC, 0xAB],
        [0, 0xAA, 0x28, 0x27, 0x26],
    ],
    "Frame Set 05 (byte_A102)": [
        [0, 8, 9, 0x19, 0x1A],
        [0, 8, 9, 0x1C, 0x1D],
        [0, 8, 9, 0x19, 0x1F],
        [0, 8, 9, 0x21, 0x22],
    ],
    "Frame Set 06 (byte_A116)": [
        [0, 9, 0x0A, 0x1A, 0x1B],
        [0, 9, 0x0A, 0x1D, 0x1E],
        [0, 9, 0x0A, 0x1F, 0x20],
        [0, 9, 0x0A, 0x22, 0x23],
    ],
    "Frame Set 07 (byte_A12A)": [
        [0, 0xAF, 0xB0, 0xB1, 0xB2],
        [0, 0x0B, 0, 0x8B, 0xBA],
        [0, 0x0B, 0, 0x8B, 0x8C],
        [0, 0x0B, 0xB5, 0xB3, 0xB4],
    ],
    "Frame Set 08 (byte_A13E)": [
        [0, 0x0B, 0xB1, 0x0C, 0x0D],
        [0, 0, 0xAD, 0xBB, 0xAE],
        [0, 0, 0, 0x8D, 0x8E],
        [0, 0xB6, 0xB7, 0, 0xB8],
    ],
    "Frame Set 09 (byte_A152)": [
        [0, 0xB1, 0xB2, 0x0D, 0xB9],
    ],
    "Frame Set 10 (byte_A157)": [
        [0, 0x2F, 0x30, 0x3C, 0x3D],
        [0, 0x52, 0x53, 0x3E, 0x3F],
        [0, 0x5E, 0x3F, 0x42, 0x43],
        [0, 0xA7, 0xA8, 0x3D, 0x3E],
        [0, 0x73, 0x74, 0x70, 0x71],
    ],
    "Frame Set 11 (byte_A170)": [
        [0, 0x31, 0, 0x3E, 0x3F],
        [0, 0x40, 0x41, 0, 0],
        [0, 0x9E, 0x9F, 0xA1, 0xA2],
        [0, 0xA9, 0, 0x3F, 0],
        [0, 0x75, 0, 0, 0x82],
        [0, 0x75, 0, 0, 0],
    ],
    "Frame Set 12 (byte_A18E)": [
        [0, 0x40, 0x41, 0, 0x44],
        [0, 0x42, 0x43, 0x54, 0x46],
        [0, 0xA0, 0x44, 0xA3, 0x47],
        [0, 0x40, 0x41, 0, 0],
        [0, 0x85, 0x86, 0x83, 0x84],
        [0, 0x3D, 0x7F, 0x1A, 0x1B],
    ],
    "Frame Set 13 (byte_A1AC)": [
        [0, 0x42, 0x43, 0x45, 0x46],
        [0, 0x55, 0, 0x56, 0x57],
        [0, 0x45, 0x46, 0x48, 0],
        [0, 0x3D, 0x7F, 0x88, 0x89],
        [0, 0x3F, 0, 0x8B, 0x8C],
    ],
    "Frame Set 14 (byte_A1C5)": [
        [0, 0x44, 0x45, 0x47, 0x48],
        [0, 0x80, 0x81, 0, 0],
        [0, 0, 0, 0x8D, 0x8E],
    ],
}

# Maps the high nibble of a pose byte (as found in TORI_POSE_POOLS,
# below) to its TORI_FRAMES key -- i.e. which of the 15
# byte_A04E..byte_A1C5 tables it selects. The low nibble of the same
# byte then indexes the row within that table.
TORI_FRAME_SET_BY_INDEX = {
    0:  "Frame Set 00 (byte_A04E)",
    1:  "Frame Set 01 (byte_A067)",
    2:  "Frame Set 02 (byte_A094)",
    3:  "Frame Set 03 (byte_A0BC)",
    4:  "Frame Set 04 (byte_A0DA)",
    5:  "Frame Set 05 (byte_A102)",
    6:  "Frame Set 06 (byte_A116)",
    7:  "Frame Set 07 (byte_A12A)",
    8:  "Frame Set 08 (byte_A13E)",
    9:  "Frame Set 09 (byte_A152)",
    10: "Frame Set 10 (byte_A157)",
    11: "Frame Set 11 (byte_A170)",
    12: "Frame Set 12 (byte_A18E)",
    13: "Frame Set 13 (byte_A1AC)",
    14: "Frame Set 14 (byte_A1C5)",
}

# Pose source-byte pools (off_A64D, unk_A673..unk_A6C1 in tori.asm) --
# the sequence of bytes select_pose()/sub_A552 consumes (in order) for
# each of the 19 pose indices, one per set bit encountered scanning the
# matching TORI_SHAPE_BASES mask. Each byte packs (table_index << 4) |
# row_index, i.e. which TORI_FRAMES set/row to draw for that body-part
# cell -- see Tori_AI_proc's render_boss_sprite_frame ([di+4]/[di+6]
# split) in tori.c.
TORI_POSE_POOLS = [
    [0x00, 0x30],                                                  # 0  idle: recently_hit_flag == 0
    [0x01, 0x30],                                                  # 1  idle: recently_hit_flag == 1
    [0x80, 0x70, 0x90],                                            # 2  idle: flap_phase == 0
    [0x71, 0x81],                                                  # 3  idle: flap_phase == 1
    [0x72, 0x82],                                                  # 4  idle: flap_phase == 2
    [0x73, 0x83],                                                  # 5  idle: flap_phase == 3
    [0x50, 0x60],                                                  # 6  idle: approach_phase == 0
    [0x51, 0x61],                                                  # 7  idle: approach_phase == 1
    [0x52, 0x62],                                                  # 8  idle: approach_phase == 2
    [0x53, 0x63],                                                  # 9  idle: approach_phase == 3
    [0x10, 0x40, 0x20],                                            # 10 idle: tick_div3 == 0
    [0x17, 0x46, 0x26],                                            # 11 idle: tick_div3 == 1
    [0x18, 0x47, 0x27],                                            # 12 idle: tick_div3 == 2
    [0x02, 0x11, 0xA0, 0xC0, 0x21, 0x41, 0xE0, 0x31, 0xB0, 0xD0],  # 13 attacking: attack_phase == 0
    [0x02, 0x12, 0x22, 0x42, 0xB1, 0x32, 0xA1, 0xC1, 0xD1],        # 14 attacking: attack_phase == 1
    [0x02, 0x33, 0xB2, 0x13, 0x43, 0xC2, 0x23, 0xA2, 0xD2],        # 15 attacking: attack_phase == 2
    [0x02, 0x14, 0x44, 0xC3, 0x24, 0xA3, 0xC1, 0xD1, 0x34, 0xB3],  # 16 attacking: attack_phase == 3
    [0x03, 0x25, 0x15, 0x35, 0xA4, 0xD3, 0x45, 0xB4, 0xE1, 0xC4],  # 17 death/recovering: attack_phase == 0
    [0x04, 0x25, 0x16, 0x35, 0xA4, 0xC5, 0x45, 0xB5, 0xD4, 0xE2],  # 18 death/recovering: attack_phase == 1
]

# The 13 distinct 9-byte column-visibility masks (off_A6CB targets
# unk_A6F1..unk_A75D in tori.asm) that select_pose()/sub_A552 rotates
# through, MSB-first, to decide which rows in each column get a pose
# byte this call.
TORI_SHAPE_BASES = [
    (0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00),  # unk_A6F1 (pose idx 0,1)
    (0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x0C, 0x00),  # unk_A6FA (pose idx 2)
    (0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x04),  # unk_A703 (pose idx 3,4,5)
    (0x00, 0x00, 0x00, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00),  # unk_A70C (pose idx 6,7,8,9)
    (0x00, 0x00, 0x00, 0x00, 0x50, 0x00, 0x40, 0x00, 0x00),  # unk_A715 (pose idx 10)
    (0x00, 0x00, 0x00, 0x00, 0x50, 0x00, 0x20, 0x00, 0x00),  # unk_A71E (pose idx 11)
    (0x00, 0x00, 0x00, 0x00, 0x50, 0x20, 0x00, 0x00, 0x00),  # unk_A727 (pose idx 12)
    (0x10, 0x00, 0x10, 0x0A, 0xA1, 0x4A, 0x00, 0x00, 0x00),  # unk_A730 (pose idx 13)
    (0x20, 0x00, 0x20, 0x54, 0x00, 0x55, 0x00, 0x00, 0x00),  # unk_A739 (pose idx 14)
    (0x10, 0x05, 0x10, 0x05, 0x10, 0x05, 0x00, 0x00, 0x00),  # unk_A742 (pose idx 15)
    (0x20, 0x00, 0x50, 0x04, 0x50, 0x05, 0x50, 0x00, 0x00),  # unk_A74B (pose idx 16)
    (0x04, 0x00, 0x14, 0x00, 0x54, 0x00, 0x54, 0x00, 0x10),  # unk_A754 (pose idx 17)
    (0x04, 0x00, 0x14, 0x00, 0x54, 0x00, 0x54, 0x00, 0x04),  # unk_A75D (pose idx 18)
]

# off_A6CB: which of the 13 base masks each of the 19 pose indices uses
# (several pose indices deliberately alias the same physical mask in
# the original data -- e.g. idx 0/1, 3/4/5, 6/7/8/9).
TORI_SHAPE_MAP = [0, 0, 1, 2, 2, 2, 3, 3, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

# Human-readable label for each pose index, matching the al values
# select_pose() is called with from Tori_AI_proc's render_boss_sprite_frame
# (see tori.c).
TORI_POSE_LABELS = [
    "idle: recently_hit_flag=0", "idle: recently_hit_flag=1",
    "idle: flap_phase=0", "idle: flap_phase=1", "idle: flap_phase=2", "idle: flap_phase=3",
    "idle: approach_phase=0", "idle: approach_phase=1", "idle: approach_phase=2", "idle: approach_phase=3",
    "idle: tick_div3=0", "idle: tick_div3=1", "idle: tick_div3=2",
    "attacking: attack_phase=0", "attacking: attack_phase=1", "attacking: attack_phase=2", "attacking: attack_phase=3",
    "death/recovering: attack_phase=0", "death/recovering: attack_phase=1",
]

# For Lega body tiles, the tile byte written by Lega_AI_proc is decoded as:
#
#   group = (tile >> 4) & 7
#   frame = tile & 0x0F
#
# The projectile pseudo-monster uses fixed flags 0x26, which also selects
# group 6, and its anim_counter selects the frame within byte_A205.

LEGA_FRAMES = {
    "Tile Group 0 (byte_A03E)": [
        [2, 0x00, 0x00, 0x00, 0x03],
        [2, 0x00, 0x00, 0x04, 0x00],
        [2, 0x00, 0x00, 0x00, 0x05],
        [2, 0x00, 0x00, 0x06, 0x00],
        [2, 0x00, 0x00, 0x00, 0x07],
        [2, 0x00, 0x00, 0x08, 0x00],
        [2, 0x00, 0xAD, 0x00, 0xAF],
        [2, 0xAE, 0x00, 0xB0, 0x00],
        [2, 0xB1, 0xB2, 0xB5, 0xB6],
        [2, 0xB3, 0xB4, 0xB7, 0xB8],
        [2, 0xB9, 0xBA, 0x39, 0x01],
        [2, 0x75, 0xAA, 0x02, 0x38],
        [2, 0x00, 0x00, 0x00, 0x01],
        [2, 0x00, 0x00, 0x02, 0x00],
        [2, 0x00, 0x00, 0x00, 0xBB],
        [2, 0x00, 0x00, 0xBC, 0x00],
    ],

    "Tile Group 1 (byte_A08E)": [
        [0, 0x09, 0x0A, 0x0B, 0x0C],
        [0, 0x0D, 0x0E, 0x10, 0x11],
        [0, 0x0E, 0x0F, 0x11, 0x12],
        [0, 0x13, 0x14, 0x15, 0x16],
        [0, 0x17, 0x18, 0x19, 0x1A],
        [0, 0x19, 0x1A, 0x1C, 0x1D],
        [0, 0x1A, 0x1B, 0x1D, 0x1E],
        [0, 0x1F, 0x13, 0x20, 0x21],
        [0, 0x13, 0x14, 0x21, 0x16],
        [0, 0x20, 0x21, 0x22, 0x23],
        [0, 0x21, 0x16, 0x23, 0x18],
        [0, 0x24, 0x1A, 0x25, 0x1D],
        [0, 0x1A, 0x1B, 0x1D, 0x1E],
        [0, 0x0D, 0x0E, 0x26, 0x27],
        [0, 0x0F, 0x00, 0x28, 0x29],
        [0, 0x2A, 0x2B, 0x2E, 0x2F],
    ],

    "Tile Group 2 (byte_A0DE)": [
        [0, 0x2C, 0x2D, 0x30, 0x31],
        [0, 0x32, 0x33, 0x36, 0x37],
        [0, 0x34, 0x35, 0x19, 0x1A],
        [0, 0x36, 0x37, 0x3A, 0x3B],
        [0, 0x19, 0x1A, 0x1C, 0x1D],
        [0, 0x1A, 0x00, 0x1D, 0x1E],
        [0, 0x0D, 0x0E, 0x3D, 0x27],
        [0, 0x3C, 0x3D, 0x3E, 0x3F],
        [0, 0x3F, 0x40, 0x43, 0x44],
        [0, 0x41, 0x42, 0x45, 0x46],
        [0, 0x47, 0x48, 0x49, 0x00],
        [0, 0x4A, 0x0E, 0x4D, 0x27],
        [0, 0x34, 0x35, 0x58, 0x59],
        [0, 0x4B, 0x4C, 0x4E, 0x4F],
        [0, 0x50, 0x51, 0x00, 0x44],
        [0, 0x58, 0x59, 0x5A, 0x5B],
    ],

    "Tile Group 3 (byte_A12E)": [
        [0, 0x53, 0x54, 0x56, 0x57],
        [0, 0x4E, 0x4F, 0x54, 0x55],
        [0, 0x00, 0x00, 0x52, 0x53],
        [0, 0x0D, 0x0E, 0x5D, 0x27],
        [0, 0x0E, 0x0F, 0x27, 0x28],
        [0, 0x61, 0x2C, 0x6A, 0x6B],
        [0, 0x2C, 0x69, 0x6B, 0x6C],
        [0, 0x6B, 0x6C, 0x6D, 0x6E],
        [0, 0x6E, 0x6F, 0x70, 0x71],
        [0, 0x70, 0x71, 0x5A, 0x72],
        [0, 0x00, 0x5C, 0x5E, 0x5F],
        [0, 0x5C, 0x5D, 0x5F, 0x60],
        [0, 0x62, 0x63, 0x65, 0x66],
        [0, 0x64, 0x65, 0x67, 0x68],
        [0, 0x0D, 0x0E, 0x73, 0x74],
        [0, 0x0E, 0x0F, 0x74, 0x12],
    ],

    "Tile Group 4 (byte_A17E)": [
        [0, 0x76, 0x77, 0x7A, 0x7B],
        [0, 0x78, 0x79, 0x7C, 0x7D],
        [0, 0x17, 0x7A, 0x19, 0x1A],
        [0, 0x19, 0x1A, 0x1C, 0x1D],
        [0, 0x1A, 0x1B, 0x1D, 0x1E],
        [0, 0x7E, 0x7F, 0x82, 0x83],
        [0, 0x80, 0x81, 0x84, 0x85],
        [0, 0x19, 0x1A, 0xA2, 0xA3],
        [0, 0x1A, 0x1B, 0xA3, 0xA4],
        [0, 0x7E, 0x7F, 0xA5, 0x83],
        [0, 0x00, 0x00, 0xA0, 0xA1],
        [0, 0x7E, 0x7F, 0xAC, 0x83],
        [0, 0x1A, 0x1B, 0x1D, 0xAB],
        [0, 0x19, 0x1A, 0xA9, 0x1D],
        [0, 0x00, 0xA6, 0xA7, 0xA8],
        [0, 0x86, 0x87, 0x88, 0x89],
    ],

    "Tile Group 5 (byte_A1CE)": [
        [0, 0x8B, 0x8C, 0x8E, 0x8F],
        [0, 0x89, 0x8A, 0x8C, 0x8D],
        [0, 0x92, 0x93, 0x96, 0x97],
        [0, 0x8F, 0x90, 0x93, 0x94],
        [0, 0x98, 0x99, 0x1A, 0x9B],
        [0, 0x99, 0x9A, 0x9B, 0x9C],
        [0, 0x1A, 0x9B, 0x9D, 0x9E],
        [0, 0x9B, 0x9C, 0x9E, 0x9F],
        [0, 0x91, 0x92, 0x95, 0x96],
        [0, 0x17, 0x98, 0x19, 0x1A],
        [0, 0x19, 0x1A, 0x1C, 0x9D],
    ],

    # Projectile / special frames. Lega_AI_proc's projectile pseudo-monster
    # uses flags 0x26 and anim_counter 0..5, selecting this group.
    "Tile Group 6 (byte_A205)": [
        [2, 0xBD, 0xBE, 0xBF, 0xC0],
        [2, 0xC1, 0xC2, 0xC3, 0xC4],
        [2, 0xC5, 0xC6, 0xC7, 0xC8],
        [2, 0xC9, 0xCA, 0xCB, 0xCC],
        [2, 0xCD, 0xCE, 0xCF, 0xD0],
        [2, 0x00, 0x00, 0xD1, 0xD2],
    ],
}

LEGA_FRAME_SET_BY_INDEX = {
    0: "Tile Group 0 (byte_A03E)",
    1: "Tile Group 1 (byte_A08E)",
    2: "Tile Group 2 (byte_A0DE)",
    3: "Tile Group 3 (byte_A12E)",
    4: "Tile Group 4 (byte_A17E)",
    5: "Tile Group 5 (byte_A1CE)",
    6: "Tile Group 6 (byte_A205)",
}

# ---------------------------------------------------------------------------
# Lega composite body layout tables
# ---------------------------------------------------------------------------
# These are the AI-used tables from lega.asm:
#
#   off_A6C8 -> layout tile streams
#   off_A744 -> 8-byte shape masks
#
# Lega_AI_proc expands them into an 8 column x 10 row local buffer:
#
#   rows 0..1   normally empty, then patched with head tiles
#   rows 2..9   filled by the shape-mask walk
#
# The head patch writes:
#
#   buffer[col 4][row] = head_anim * 2
#   buffer[col 6][row] = head_anim * 2 + 1
#
# where row is 0, except when anim_step/table_idx is 6 or >= 8, in which
# case row is 1.

LEGA_LAYOUT_TABLES = [
    # byte_A6DC
    [0x11, 0x10, 0x12, 0x13, 0x14, 0x15, 0x16],

    # byte_A6E3
    [0x11, 0x17, 0x19, 0x10, 0x12, 0x18, 0x1A, 0x1B, 0x1C],

    # byte_A6EC
    [0x1D, 0x1F, 0x21, 0x23, 0x10, 0x1E, 0x20, 0x22, 0x24, 0x25],

    # byte_A6F6
    [0x29, 0x2A, 0x27, 0x26, 0x28, 0x10, 0x1E, 0x20, 0x22, 0x24, 0x25],

    # byte_A701
    [0x32, 0x30, 0x2D, 0x31, 0x2B, 0x2E, 0x10, 0x1E, 0x20, 0x2C, 0x2F],

    # byte_A70C
    [0x3D, 0x3A, 0x3C, 0x3B, 0x33, 0x10, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39],

    # byte_A718
    [0x42, 0x43, 0x40, 0x44, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46],

    # byte_A722
    [0x58, 0x59, 0x5A, 0x4F, 0x50, 0x52, 0x54, 0x56, 0x51, 0x53, 0x55, 0x57],

    # byte_A72E
    [0xCA, 0x42, 0x47, 0x40, 0x48, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46],

    # byte_A739
    [0xCE, 0x42, 0x4D, 0x40, 0x4C, 0x3E, 0x10, 0x3F, 0x41, 0x45, 0x46],
]

# Deliberately aliased in the last two slots in the original data.
_lega_shape_a798 = (0x01, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01)

LEGA_SHAPE_TABLES = [
    # byte_A758
    (0x00, 0x00, 0x00, 0x00, 0x20, 0xAB, 0x01, 0x00),

    # byte_A760
    (0x00, 0x00, 0x00, 0x00, 0x2C, 0xAD, 0x01, 0x00),

    # byte_A768
    (0x00, 0x00, 0x00, 0x00, 0x2B, 0x80, 0x2B, 0x01),

    # byte_A770
    (0x00, 0x00, 0x05, 0x10, 0x28, 0x80, 0x2B, 0x01),

    # byte_A778
    (0x08, 0x04, 0x18, 0x00, 0x28, 0x80, 0x2B, 0x00),

    # byte_A780
    (0x00, 0x02, 0x14, 0x10, 0x20, 0xA8, 0x0C, 0x03),

    # byte_A788
    (0x00, 0x00, 0x03, 0x05, 0x10, 0x55, 0x00, 0x01),

    # byte_A790
    (0x00, 0x00, 0x00, 0x00, 0x0B, 0xAB, 0x53, 0x00),

    # byte_A798, used by table 8
    _lega_shape_a798,

    # byte_A798, used by table 9
    _lega_shape_a798,
]

# Representative named body states.
#
# The first eight approximate the normal idle walk cycle, using the same
# head-animation pattern byte_A41B gives: 0, 1, 2, 1, 0, 1, 2, 1.
#
# The additional entries show the special head states used by the charge
# attack and death hold.
LEGA_BODY_FRAMES = [
    ("idle: table 0, head 0",        0, 0),
    ("idle: table 1, head 1",        1, 1),
    ("idle: table 2, head 2",        2, 2),
    ("idle: table 3, head 1",        3, 1),
    ("idle: table 4, head 0",        4, 0),
    ("idle: table 5, head 1",        5, 1),
    ("idle: table 6, head 2",        6, 2),
    ("idle: table 7, head 1",        7, 1),

    # Charge launch uses table 8 and head_anim 6 in the original.
    ("charge launch: table 8, head 6", 8, 6),

    # Table 9 exists in the original pointer tables. It is not obviously
    # reached by the normal AI state machine, but show it for completeness.
    ("unused/table 9, head 1",         9, 1),

    # Charge recovery frames: table 6 with special head animations.
    ("charge recover: table 6, head 7", 6, 7),
    ("charge end: table 6, head 0",     6, 0),

    # Death hold: after the first death phase the original stays on table 1
    # with head_anim 6.
    ("death hold: table 1, head 6",     1, 6),
]


def compute_lega_phase_layout(table_idx, head_anim):
    """
    Reproduce Lega_AI_proc's buffer build for one layout/shape table pair.

    Returns a list of:

        (col, row, tile_group, frame_idx)

    for every non-empty cell in the 8x10 sprite buffer.

    The original game places body cells into buffer rows 2..9, then patches
    the head tiles into row 0 or 1 at columns 4 and 6.
    """
    if table_idx < 0 or table_idx >= len(LEGA_LAYOUT_TABLES):
        return []

    # grid[col][row], row 0..9
    grid = [[None for _ in range(10)] for _ in range(8)]

    layout = LEGA_LAYOUT_TABLES[table_idx]
    shape = LEGA_SHAPE_TABLES[table_idx]
    layout_iter = iter(layout)

    # Shape-mask expansion: 8 columns, 8 rows each, MSB first.
    # Consumes one layout tile for every set bit.
    for col in range(8):
        b = shape[col]

        for row in range(8):
            carry = (b & 0x80) != 0
            b = ((b << 1) | (1 if carry else 0)) & 0xFF

            if carry:
                try:
                    tile = next(layout_iter)
                except StopIteration:
                    tile = 0xFF

                if tile != 0xFF:
                    grid[col][2 + row] = tile

    # Head patch.
    #
    # Original:
    #   cmp byte_A7B9, 6
    #   jz loc_A49A
    #   cmp byte_A7B9, 8
    #   jb loc_A49B
    # loc_A49A:
    #   inc di
    #
    # So row is 1 for table_idx 6 or table_idx >= 8, otherwise 0.
    head_row = 1 if (table_idx == 6 or table_idx >= 8) else 0

    first_head_tile = head_anim * 2

    # First head tile at column 4.
    grid[4][head_row] = first_head_tile

    # Second head tile is written 20 bytes later in the local buffer.
    # Since each column is 10 bytes wide, this is column 6, same row.
    grid[6][head_row] = first_head_tile + 1

    placements = []

    for col in range(8):
        for row in range(10):
            tile = grid[col][row]

            if tile is None or tile == 0xFF:
                continue

            tile_group = (tile >> 4) & 7
            frame_idx = tile & 0x0F

            placements.append((col, row, tile_group, frame_idx))

    return placements

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
        rx, ry = i % tile_w, i // tile_w
        if p_idx is None or p_idx == transparent_idx:
            # draw_pixel(canvas, x0 + rx * scale, y0 + ry * scale, "#8c38ff", scale)
            continue
        draw_pixel(canvas, x0 + rx * scale, y0 + ry * scale, PALETTE_STRS[p_idx], scale)
        

# ---------------------------------------------------------------------------
# Fman rendering (fman.grp hero dungeon sprites)
# ---------------------------------------------------------------------------

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


def render_crab_group(data, canvas, y_offset):
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

def _drgn_apply_sparse_layer(grid, x0, y0, tiles, masks):
    """Equivalent of drgn.asm sub_A758 for one sparse layer."""
    tile_iter = iter(tiles)
    for col, mask in enumerate(masks):
        for row in range(8):
            if mask & (0x80 >> row):
                try:
                    grid[x0 + col][y0 + row] = next(tile_iter)
                except StopIteration:
                    return


def compute_drgn_body_layout(pose, anim_phase=0, motion_phase=0):
    """
    Recreate render_dragon/loc_A542's complete 29x10 shared layout buffer.
    Returns (col, row, tile_group, frame_idx) entries; Dragon packs those
    last two values into one byte as (group << 4) | frame.
    """
    grid = [[None for _ in range(10)] for _ in range(29)]

    _drgn_apply_sparse_layer(grid, 0, 1, DRGN_BODY_TILES[pose], DRGN_BODY_MASKS[pose])

    a = anim_phase & 1
    _drgn_apply_sparse_layer(grid, 12, 0, DRGN_ANIM_TILES[a], DRGN_ANIM_MASKS[a])

    m = motion_phase & 3
    _drgn_apply_sparse_layer(grid, 9, 6, DRGN_LIMB_TILES[m], DRGN_LIMB_MASKS[m])
    _drgn_apply_sparse_layer(grid, 17, 6, DRGN_RLIMB_TILES[m], DRGN_RLIMB_MASK)

    _drgn_apply_sparse_layer(grid, 25, 8, DRGN_DETAIL_TILES, DRGN_DETAIL_MASK)

    placements = []
    for col in range(29):
        for row in range(10):
            tile = grid[col][row]
            if tile is None:
                continue
            placements.append((col, row, (tile >> 4) & 0x0F, tile & 0x0F))
    return placements


def compute_drgn_breath_layout(pose, breath_frame):
    """
    Recreate loc_A693's optional 13-column breath layer. Coordinates are
    returned relative to the Dragon body's boss_x/boss_y origin, so x can
    be negative (the flame extends left of the main 29x10 body).
    """
    bf = breath_frame & 3
    if pose < 6:
        tiles = DRGN_BREATH_LEFT_TILES[bf]
        masks = DRGN_BREATH_LEFT_MASKS[bf]
        x0 = -6 if pose == 5 else -10
    else:
        tiles = DRGN_BREATH_RIGHT_TILES[bf]
        masks = DRGN_BREATH_RIGHT_MASKS[bf]
        x0 = -10

    tile_iter = iter(tiles)
    placements = []
    for col, mask in enumerate(masks):
        for row in range(8):
            if mask & (0x80 >> row):
                try:
                    tile = next(tile_iter)
                except StopIteration:
                    return placements
                placements.append((x0 + col, 4 + row, (tile >> 4) & 0x0F, tile & 0x0F))
    return placements


# A compact set that exposes every independently varying Dragon layer without
# expanding the sheet to all 11*2*4 Cartesian combinations. Main poses use
# anim=0/motion=0; additional entries isolate the alternate anim/motion layers
# and all four breath-frame masks on both facing families.
DRGN_BODY_FRAMES = (
    [(f"pose {pose}", pose, 0, 0, None) for pose in range(11)]
    + [("anim phase 1", 0, 1, 0, None)]
    + [(f"motion phase {m}", 0, 0, m, None) for m in range(1, 4)]
    + [(f"left breath {bf}", 0, 0, 0, bf) for bf in range(4)]
    + [(f"right breath {bf}", 6, 0, 0, bf) for bf in range(4)]
)


def render_drgn_group(data, canvas, y_offset):
    """
    Dragon boss.

    Part 1 renders complete 29x10 Dragon bodies assembled from the same five
    sparse layers used by Drgn_AI_proc, plus representative complete bodies
    with each breath frame attached. Grid positions are 8px world-tile steps
    while each descriptor draws a 16x16 composed sprite, exactly like Tori/Lega.

    Part 2 renders every raw 16x16 descriptor in DRGN_FRAMES for inspection.
    """
    TILE_SIZE = 32
    tiles_raw = data + b'\x00' * (256 * TILE_SIZE)
    current_y = y_offset

    body_scale = 1
    step = 8
    sprite_span = 16
    # Breath may extend 10 cells left. Normalize the display to x=-10..28.
    min_col, max_col = -10, 28
    cols = max_col - min_col + 1
    rows = 12  # breath reaches body-relative row 11
    block_w = (cols - 1) * step * body_scale + sprite_span * body_scale
    block_h = (rows - 1) * step * body_scale + sprite_span * body_scale
    frames_per_row_body = 3
    body_gap_x, body_gap_y = 12, 18

    for f_idx, (label, pose, anim_phase, motion_phase, breath_frame) in enumerate(DRGN_BODY_FRAMES):
        col_idx = f_idx % frames_per_row_body
        row_idx = f_idx // frames_per_row_body
        x_base = 10 + col_idx * (block_w + body_gap_x)
        y_base = current_y + row_idx * (block_h + body_gap_y)

        canvas.create_rectangle(x_base - 1, y_base - 1,
                                x_base + block_w, y_base + block_h, outline="gray")
        canvas.create_text(x_base + 2, y_base - 8, text=f"{f_idx}: {label}",
                           anchor="w", fill="white", font=("TkDefaultFont", 7))

        placements = compute_drgn_body_layout(pose, anim_phase, motion_phase)
        if breath_frame is not None:
            placements += compute_drgn_breath_layout(pose, breath_frame)

        for gcol, grow, tile_group, frame_idx in placements:
            set_name = DRGN_FRAME_SET_BY_INDEX.get(tile_group)
            if set_name is None:
                continue
            frames = DRGN_FRAMES[set_name]
            if frame_idx >= len(frames):
                continue
            draw_composed_16x16_frame(
                canvas, frames[frame_idx], tiles_raw,
                x_base + (gcol - min_col) * step * body_scale,
                y_base + grow * step * body_scale,
                body_scale)

    num_body_rows = (len(DRGN_BODY_FRAMES) + frames_per_row_body - 1) // frames_per_row_body
    current_y += num_body_rows * (block_h + body_gap_y) + 24

    # Raw descriptor browser.
    scale = 3
    sprite_px = 16
    frames_per_row = 16
    gap_x, gap_y = 0, 8
    n = 0
    for set_name, frames in DRGN_FRAMES.items():
        current_y += 20
        for f_idx, frame_data in enumerate(frames):
            x_frame = 10 + (f_idx % frames_per_row) * (sprite_px * scale + gap_x)
            y_frame = current_y + (f_idx // frames_per_row) * (sprite_px * scale + gap_y)
            canvas.create_text(x_frame + 8, y_frame - 8, text=f"{n}",
                               fill="white", font=("TkDefaultFont", 7))
            n += 1
            canvas.create_rectangle(x_frame, y_frame,
                                    x_frame + sprite_px * scale,
                                    y_frame + sprite_px * scale,
                                    fill="#8c38ff", outline="")
            draw_composed_16x16_frame(canvas, frame_data, tiles_raw,
                                       x_frame, y_frame, scale)
        num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
        current_y += num_rows * (sprite_px * scale + gap_y) + 12

    return current_y - y_offset


def compute_tako_phase_layout(table_idx):
    """
    Reproduce Pulpo_AI_proc's tentacle-layout walk (loc_A3E3's outer/inner
    loop over 7 columns x 8 rows) for a single table_idx (0..31 =
    tentacle_anim_step + anim_group_offset), returning a static snapshot:
    a list of (col, row, tile_group, anim_idx) for every currently-visible
    tentacle segment.

    Note: in the original game the shape-mask byte is rotated in place and
    that rotation persists across frames (and is shared between the several
    table_idx slots that alias the same physical mask -- see
    TAKO_SHAPE_MAP). For this static reference sheet we instead start each
    table_idx from a fresh copy of its base mask, so every phase is shown
    the way it looks the first time it's ever selected, rather than
    depending on unknowable prior-frame history.
    """
    layout_pairs = TAKO_LAYOUT_TABLES[table_idx]
    shape = list(TAKO_SHAPE_BASES[TAKO_SHAPE_MAP[table_idx]])
    pair_iter = iter(layout_pairs)
    placements = []

    for col in range(7):
        b = shape[col]
        for row in range(8):
            carry = (b & 0x80) != 0
            b = ((b << 1) | (1 if carry else 0)) & 0xFF
            if carry:
                try:
                    tile_group, anim_idx = next(pair_iter)
                except StopIteration:
                    break
                placements.append((col, row, tile_group, anim_idx))

    return placements


def render_tako_group(data, canvas, y_offset):
    """
    Pulpo boss.

    Part 1 assembles the actual tentacle body (7 columns x 3 rows)
    for each of the 32 tentacle_anim_step/anim_group_offset combinations,
    exactly as Pulpo_AI_proc lays it out from TAKO_LAYOUT_TABLES /
    TAKO_SHAPE_BASES, using each placement's tile_group to pick the right
    TAKO_FRAMES set and anim_idx to pick the frame within it.

    Part 2 is a plain browser over every raw frame set (same as before),
    since one of them (Frame Set 16 / byte_A25F) is never referenced by
    the tentacle layout tables at all -- it's some other sprite (most
    likely the ink-droplet projectile, which Pulpo_AI_proc addresses with
    a fixed tile id rather than through anim_frame_table_ptrs) and so has
    no placement of its own in the composite body.
    """
    TILE_SIZE = 32
    scale = 3
    current_y = y_offset
    gap_x = 0
    gap_y = 8
    sprite_px = 16  # Total width/height of the 2x2 tile assembly
    frames_per_row = 16

    # Ensure the data buffer is padded to prevent index-out-of-range errors
    # for high tile indices.
    tiles_raw = data + b'\x00' * (256 * TILE_SIZE)

    # -----------------------------------------------------------------------
    # Part 1: Render Composite Tako Body (32 tentacle_anim_step / phase combos)
    # -----------------------------------------------------------------------
    body_scale = 2  # the 7x8-tile grid is much larger than crab's, scale down to fit
    cols, rows = 7, 3
    block_w, block_h = cols * 16 * body_scale, rows * 16 * body_scale
    phases_per_row = 8  # table_idx 0-7/8-15/16-23/24-31 = the 4 anim_group_offset steps
    body_gap_x, body_gap_y = 4, 8

    for table_idx in range(32):
        col_idx = table_idx % phases_per_row
        row_idx = table_idx // phases_per_row
        x_base = 10 + col_idx * (block_w + body_gap_x)
        y_base = current_y + row_idx * (block_h + body_gap_y)

        canvas.create_rectangle(x_base - 1, y_base - 1, x_base + block_w, y_base + block_h, outline="gray")
        # canvas.create_text(x_base+5, y_base + 5, text=f"step {table_idx % 8} / offs {(table_idx // 8) * 8}",
        #                     anchor="nw", fill="white", font=("TkDefaultFont", 7))

        for gcol, grow, tile_group, anim_idx in compute_tako_phase_layout(table_idx):
            set_name = TAKO_FRAME_SET_BY_INDEX.get(tile_group)
            if set_name is None:
                continue
            frames = TAKO_FRAMES[set_name]
            if anim_idx >= len(frames):
                continue
            draw_composed_16x16_frame(canvas, frames[anim_idx], tiles_raw,
                                       x_base + gcol * 16 * body_scale,
                                       y_base + grow * 16 * body_scale,
                                       body_scale)

    num_body_rows = (32 + phases_per_row - 1) // phases_per_row
    current_y += num_body_rows * (block_h + body_gap_y) + 24

    # -----------------------------------------------------------------------
    # Part 2: Render every raw frame set (including the one the composite
    # body never uses, Frame Set 16)
    # -----------------------------------------------------------------------
    n=0
    for set_name, frames in TAKO_FRAMES.items():
        
        # Label each frame set so it's clear which slot in
        # anim_frame_table_ptrs it came from.
        # canvas.create_text(10, current_y + 8, text=set_name, anchor="w", fill="white")
        current_y += 20

        for f_idx, frame_data in enumerate(frames):
            x_frame = 10 + (f_idx % frames_per_row) * (sprite_px * scale + gap_x)
            y_frame = current_y + (f_idx // frames_per_row) * (sprite_px * scale + gap_y)

            canvas.create_text(x_frame+8, y_frame - 8, text=f"{n}",
                                fill="white", font=("TkDefaultFont", 7))
            n+=1
            canvas.create_rectangle(x_frame, y_frame, x_frame + sprite_px * scale,
                                     y_frame + sprite_px * scale, fill="#8c38ff", outline="")
            draw_composed_16x16_frame(canvas, frame_data, tiles_raw, x_frame, y_frame, scale)

        num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
        current_y += num_rows * (sprite_px * scale + gap_y) + 12

    return current_y - y_offset

def compute_tori_pose_layout(pose_idx):
    """
    Reproduce Tori_AI_proc's select_pose()/sub_A552 body-part layout walk
    (render_boss_sprite_frame's 9-column x 8-row scan) for a single
    pose_idx (0..18), returning a static snapshot: a list of
    (col, row, table_index, row_index) for every body-part cell that
    pose fills in.

    Note: as with compute_tako_phase_layout, the original rotates each
    shape-mask byte in place and that rotation is shared between the
    several pose_idx slots that alias the same physical mask (see
    TORI_SHAPE_MAP) -- but since a full pass always performs exactly 8
    rotations of an 8-bit value (a full cycle back to the start), the
    mask's value is unchanged by the time any one call returns, so
    starting each pose_idx from a fresh copy of its base mask here
    reproduces the same set of cells every time, just as in the game.
    """
    pool = TORI_POSE_POOLS[pose_idx]
    shape = list(TORI_SHAPE_BASES[TORI_SHAPE_MAP[pose_idx]])
    pool_iter = iter(pool)
    placements = []

    for col in range(9):
        b = shape[col]
        for row in range(8):
            carry = (b & 0x80) != 0
            b = ((b << 1) | (1 if carry else 0)) & 0xFF
            if carry:
                try:
                    v = next(pool_iter)
                except StopIteration:
                    break
                table_index = v >> 4
                row_index = v & 0x0F
                placements.append((col, row, table_index, row_index))

    return placements


def compose_tori_frame(pose_indices):
    """
    Combine the placements from several select_pose()/sub_A552 calls into
    one shared 9x8 body grid, exactly as Tori_AI_proc's
    render_boss_sprite_frame does per frame: during the "attacking" and
    "death/recovering" states it calls select_pose() exactly once (a
    single pose index already fills in the whole body), but during the
    plain idle state it calls select_pose() FOUR times in a row --
    recently_hit_flag, then approach_phase+6, then tick_div3+0x0A, then
    flap_phase+2 -- each contributing a distinct, non-overlapping subset
    of body-part cells (they're driven by separate mask arrays, so they
    never write the same cell twice). Rendering any single one of those
    four alone only shows a fragment (e.g. just a wing-tip or a head
    bob), which is why a full idle body needs all four combined.
    """
    placements = []
    for idx in pose_indices:
        placements.extend(compute_tori_pose_layout(idx))
    return placements


# Named, fully-assembled body states to render in Part 1, mirroring
# exactly which select_pose() calls render_boss_sprite_frame makes for
# each state (see tori.c):
#   - "attacking" and "death/recovering" states: a single pose index
#     already produces the complete body.
#   - the idle state: recently_hit_flag (0 or 1) + flap_phase (0..3) +
#     approach_phase (0..3) + tick_div3 (0..2) are combined every frame.
#     flap_phase advances every idle frame while approach_phase only
#     advances every other frame and tick_div3 is frozen unless the boss
#     has charged before, so they drift out of sync over real gameplay;
#     the "flap cycle" entries below approximate a representative cycle
#     by advancing flap_phase and approach_phase together, and separate
#     entries show the recently-hit and tick_div3 variants in isolation.
TORI_BODY_FRAMES = [
    ("idle: flap cycle 0",        [0, 2, 6, 10]),
    ("idle: flap cycle 1",        [0, 3, 7, 11]),
    ("idle: flap cycle 2",        [0, 4, 8, 12]),
    ("idle: flap cycle 3",        [0, 5, 9, 10]),
    ("idle: recently hit",        [1, 2, 6, 10]),
    ("idle: tick_div3=1 detail",  [0, 2, 6, 11]),
    ("idle: tick_div3=2 detail",  [0, 2, 6, 12]),
    ("attacking: phase 0",        [13]),
    ("attacking: phase 1",        [14]),
    ("attacking: phase 2",        [15]),
    ("attacking: phase 3",        [16]),
    ("death/recovering: phase 0", [17]),
    ("death/recovering: phase 1", [18]),
]


def render_tori_group(data, canvas, y_offset):
    """
    Pollo boss.

    Part 1 assembles the actual, complete boss body (9 columns x 8 rows)
    for each named state in TORI_BODY_FRAMES, exactly as
    Tori_AI_proc's render_boss_sprite_frame lays it out from
    TORI_POSE_POOLS / TORI_SHAPE_BASES -- combining multiple
    select_pose() calls per frame where the game does (see
    compose_tori_frame) -- using each placement's table_index/row_index
    (the high/low nibble split of the pose byte written into the
    pseudo-monster's .flags/.anim_counter fields) to pick the right
    TORI_FRAMES set and row within it.

    Part 2 is a plain browser over every raw frame set (same approach
    as render_tako_group's Part 2), so every individual 16x16 frame can
    be inspected regardless of whether the composite body walk reaches
    it.
    """
    TILE_SIZE = 32
    scale = 3
    current_y = y_offset
    gap_x = 0
    gap_y = 8
    sprite_px = 16  # Total width/height of the 2x2 tile assembly
    frames_per_row = 16

    # Ensure the data buffer is padded to prevent index-out-of-range errors
    # for high tile indices.
    tiles_raw = data + b'\x00' * (256 * TILE_SIZE)

    # -----------------------------------------------------------------------
    # Part 1: Render Composite Tori Body (named states from TORI_BODY_FRAMES)
    # -----------------------------------------------------------------------
    body_scale = 2  # the 9x8-tile grid is much larger than crab's, scale down to fit
    cols, rows = 9, 8
    # currX/currY (and so col/row here) are in 8px world-tile units -- the
    # same unit render_roka_group/render_dchr_group use for the dungeon
    # map (`col * (8 * SCALE)`) -- while each composed frame is a 16x16
    # (2x2 world-tile) sprite. So adjacent grid steps must be 8px apart
    # (half the drawn sprite's width/height), not a full 16px sprite-width
    # apart, or every piece ends up floating in its own cell with a gap
    # on every side instead of overlapping/tiling with its neighbors.
    step = 8
    sprite_span = 16  # composed frame's own width/height
    block_w = (cols - 1) * step * body_scale + sprite_span * body_scale
    block_h = (rows - 1) * step * body_scale + sprite_span * body_scale
    frames_per_row_body = 5
    body_gap_x, body_gap_y = 12, 16

    for f_idx, (label, pose_indices) in enumerate(TORI_BODY_FRAMES):
        col_idx = f_idx % frames_per_row_body
        row_idx = f_idx // frames_per_row_body
        x_base = 10 + col_idx * (block_w + body_gap_x)
        y_base = current_y + row_idx * (block_h + body_gap_y)

        canvas.create_rectangle(x_base - 1, y_base - 1, x_base + block_w, y_base + block_h, outline="gray")
        canvas.create_text(x_base + 2, y_base - 8, text=f"{f_idx}: {label}",
                            anchor="w", fill="white", font=("TkDefaultFont", 7))

        for gcol, grow, table_index, row_index in compose_tori_frame(pose_indices):
            set_name = TORI_FRAME_SET_BY_INDEX.get(table_index)
            if set_name is None:
                continue
            frames = TORI_FRAMES[set_name]
            if row_index >= len(frames):
                continue
            draw_composed_16x16_frame(canvas, frames[row_index], tiles_raw,
                                       x_base + gcol * step * body_scale,
                                       y_base + grow * step * body_scale,
                                       body_scale)

    num_body_rows = (len(TORI_BODY_FRAMES) + frames_per_row_body - 1) // frames_per_row_body
    current_y += num_body_rows * (block_h + body_gap_y) + 24

    # -----------------------------------------------------------------------
    # Part 2: Render every raw frame set
    # -----------------------------------------------------------------------
    n = 0
    for set_name, frames in TORI_FRAMES.items():
        current_y += 20

        for f_idx, frame_data in enumerate(frames):
            x_frame = 10 + (f_idx % frames_per_row) * (sprite_px * scale + gap_x)
            y_frame = current_y + (f_idx // frames_per_row) * (sprite_px * scale + gap_y)

            canvas.create_text(x_frame + 8, y_frame - 8, text=f"{n}",
                                fill="white", font=("TkDefaultFont", 7))
            n += 1
            canvas.create_rectangle(x_frame, y_frame, x_frame + sprite_px * scale,
                                     y_frame + sprite_px * scale, fill="#8c38ff", outline="")
            draw_composed_16x16_frame(canvas, frame_data, tiles_raw, x_frame, y_frame, scale)

        num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
        current_y += num_rows * (sprite_px * scale + gap_y) + 12

    return current_y - y_offset

# ---------------------------------------------------------------------------
# Zela (Agar boss) rendering
# ---------------------------------------------------------------------------

# Transcribed directly from zela.asm's byte_A03A/byte_A08A/byte_A0D0/
# byte_A116/byte_A166 tables, pointed to by the 5-entry offset table
# right after "start:" (ADDR_MONSTER_AI_MOVE_LEFT_FRAMES). Same
# [pal_idx, tl, tr, bl, br] format as CRAB_FRAMES/TAKO_FRAMES/
# TORI_FRAMES. Unlike Tako/Tori, Zela_AI_proc addresses these directly:
# it writes a tile-group id (0-4, from movement_facing_table below) into
# each body segment's .flags and a frame index (0-11) into
# .anim_counter, and the generic sprite-composition routine reads
# straight from the matching table here -- there's no shape-mask walk
# to reproduce.
ZELA_FRAMES = {
    "Tile Group 0 (byte_A03A)": [
        [2, 0x01, 0x02, 0x03, 0x04],
        [2, 0x11, 0x07, 0x12, 0x13],
        [2, 0x1E, 0x16, 0x1F, 0x20],
        [2, 0x05, 0x06, 0x07, 0x08],
        [2, 0x14, 0x15, 0x16, 0x17],
        [2, 0x21, 0x22, 0x23, 0x24],
        [2, 0x09, 0x0A, 0x0B, 0x0C],
        [2, 0x18, 0x19, 0x1A, 0x1B],
        [2, 0x25, 0x26, 0x27, 0x1D],
        [2, 0x0D, 0x0E, 0x0F, 0x10],
        [2, 0x1C, 0x10, 0x1D, 0x10],
        [2, 0x28, 0x10, 0x29, 0x2A],
        [2, 0x18, 0x2B, 0x1A, 0x2C],
        [2, 0x2D, 0x10, 0x2E, 0x10],
        [2, 0x11, 0x07, 0x12, 0x2F],
        [2, 0x30, 0x15, 0x31, 0x17],
    ],
    "Tile Group 1 (byte_A08A)": [
        [2, 0x32, 0x33, 0x34, 0x35],
        [2, 0x41, 0x42, 0x43, 0x44],
        [2, 0x1E, 0x50, 0x1F, 0x51],
        [2, 0x36, 0x37, 0x38, 0x39],
        [2, 0x45, 0x46, 0x47, 0x48],
        [2, 0x52, 0x53, 0x54, 0x24],
        [2, 0x3A, 0x3B, 0x3C, 0x3D],
        [2, 0x49, 0x4A, 0x4B, 0x4C],
        [2, 0x55, 0x4F, 0x56, 0x57],
        [2, 0x3E, 0x00, 0x3F, 0x40],
        [2, 0x4D, 0x4E, 0x4F, 0x10],
        [2, 0x58, 0x10, 0x59, 0x2A],
        [2, 0x49, 0x5A, 0x4B, 0x5B],
        [2, 0x5C, 0x4E, 0x5D, 0x5E],
    ],
    "Tile Group 2 (byte_A0D0)": [
        [2, 0x00, 0x32, 0x5F, 0x60],
        [2, 0x6B, 0x6C, 0x6D, 0x6E],
        [2, 0x79, 0x7A, 0x7B, 0x7C],
        [2, 0x61, 0x62, 0x63, 0x64],
        [2, 0x6F, 0x70, 0x71, 0x72],
        [2, 0x7D, 0x7E, 0x7F, 0x24],
        [2, 0x65, 0x66, 0x67, 0x68],
        [2, 0x73, 0x1D, 0x74, 0x75],
        [2, 0x80, 0x4F, 0x81, 0x59],
        [2, 0x69, 0x00, 0x6A, 0x00],
        [2, 0x76, 0x77, 0x4F, 0x78],
        [2, 0x82, 0x10, 0x59, 0x2A],
        [2, 0x73, 0x83, 0x74, 0x84],
        [2, 0x76, 0x77, 0x4F, 0x78],
    ],
    "Tile Group 3 (byte_A116)": [
        [2, 0x00, 0x85, 0x86, 0x87],
        [2, 0x93, 0x94, 0x95, 0x96],
        [2, 0x1E, 0xA1, 0xA2, 0xA3],
        [2, 0x88, 0x89, 0x8A, 0x8B],
        [2, 0x97, 0x98, 0x99, 0x9A],
        [2, 0xA4, 0xA5, 0xA6, 0xA7],
        [2, 0x8C, 0x8D, 0x8E, 0x67],
        [2, 0x9B, 0x9C, 0x9D, 0x9E],
        [2, 0x25, 0x26, 0x27, 0x1D],
        [2, 0x8F, 0x90, 0x91, 0x92],
        [2, 0x1D, 0x9F, 0xA0, 0x10],
        [2, 0x28, 0x10, 0x29, 0x2A],
        [2, 0x00, 0x00, 0x00, 0x00],
        [2, 0x00, 0x00, 0x00, 0x00],
        [2, 0x93, 0xA8, 0x95, 0xA9],
        [2, 0xAA, 0xAB, 0xAC, 0xAD],
    ],
    "Tile Group 4 (byte_A166)": [
        [2, 0x00, 0xAE, 0x00, 0xAF],
        [2, 0xBB, 0xBC, 0xBD, 0xBE],
        [2, 0x1E, 0xCA, 0xA2, 0xCB],
        [2, 0xB0, 0xB1, 0xB2, 0xB3],
        [2, 0xBF, 0xC0, 0xC1, 0xC2],
        [2, 0xCC, 0xCD, 0xCE, 0xCF],
        [2, 0xB4, 0xB5, 0xB6, 0xB7],
        [2, 0xC3, 0xC4, 0xC5, 0xC6],
        [2, 0xD0, 0xD1, 0xD2, 0xD3],
        [2, 0xB8, 0x00, 0xB9, 0xBA],
        [2, 0xC7, 0xC8, 0x4F, 0xC9],
        [2, 0xD4, 0x10, 0x1D, 0x2A],
        [2, 0x00, 0x00, 0x00, 0x00],
        [2, 0x00, 0x00, 0x00, 0x00],
        [2, 0xBB, 0xBC, 0xBD, 0xBE],
        [2, 0xBF, 0xD5, 0xC1, 0xD6],
    ],
}
ZELA2_FRAMES = {
    "Tile Group 0 (byte_A03A)": [
        [0, 0x01, 0x02, 0x03, 0x04],
        [0, 0x11, 0x07, 0x12, 0x13],
        [0, 0x1E, 0x16, 0x1F, 0x20],
        [0, 0x05, 0x06, 0x07, 0x08],
        [0, 0x14, 0x15, 0x16, 0x17],
        [0, 0x21, 0x22, 0x23, 0x24],
        [0, 0x09, 0x0A, 0x0B, 0x0C],
        [0, 0x18, 0x19, 0x1A, 0x1B],
        [0, 0x25, 0x26, 0x27, 0x1D],
        [0, 0x0D, 0x0E, 0x0F, 0x10],
        [0, 0x1C, 0x10, 0x1D, 0x10],
        [0, 0x28, 0x10, 0x29, 0x2A],
        [0, 0x18, 0x2B, 0x1A, 0x2C],
        [0, 0x2D, 0x10, 0x2E, 0x10],
        [0, 0x11, 0x07, 0x12, 0x2F],
        [0, 0x30, 0x15, 0x31, 0x17],
    ],
    "Tile Group 1 (byte_A08A)": [
        [0, 0x32, 0x33, 0x34, 0x35],
        [0, 0x41, 0x42, 0x43, 0x44],
        [0, 0x1E, 0x50, 0x1F, 0x51],
        [0, 0x36, 0x37, 0x38, 0x39],
        [0, 0x45, 0x46, 0x47, 0x48],
        [0, 0x52, 0x53, 0x54, 0x24],
        [0, 0x3A, 0x3B, 0x3C, 0x3D],
        [0, 0x49, 0x4A, 0x4B, 0x4C],
        [0, 0x55, 0x4F, 0x56, 0x57],
        [0, 0x3E, 0x00, 0x3F, 0x40],
        [0, 0x4D, 0x4E, 0x4F, 0x10],
        [0, 0x58, 0x10, 0x59, 0x2A],
        [0, 0x49, 0x5A, 0x4B, 0x5B],
        [0, 0x5C, 0x4E, 0x5D, 0x5E],
    ],
    "Tile Group 2 (byte_A0D0)": [
        [0, 0x00, 0x32, 0x5F, 0x60],
        [0, 0x6B, 0x6C, 0x6D, 0x6E],
        [0, 0x79, 0x7A, 0x7B, 0x7C],
        [0, 0x61, 0x62, 0x63, 0x64],
        [0, 0x6F, 0x70, 0x71, 0x72],
        [0, 0x7D, 0x7E, 0x7F, 0x24],
        [0, 0x65, 0x66, 0x67, 0x68],
        [0, 0x73, 0x1D, 0x74, 0x75],
        [0, 0x80, 0x4F, 0x81, 0x59],
        [0, 0x69, 0x00, 0x6A, 0x00],
        [0, 0x76, 0x77, 0x4F, 0x78],
        [0, 0x82, 0x10, 0x59, 0x2A],
        [0, 0x73, 0x83, 0x74, 0x84],
        [0, 0x76, 0x77, 0x4F, 0x78],
    ],
    "Tile Group 3 (byte_A116)": [
        [0, 0x00, 0x85, 0x86, 0x87],
        [0, 0x93, 0x94, 0x95, 0x96],
        [0, 0x1E, 0xA1, 0xA2, 0xA3],
        [0, 0x88, 0x89, 0x8A, 0x8B],
        [0, 0x97, 0x98, 0x99, 0x9A],
        [0, 0xA4, 0xA5, 0xA6, 0xA7],
        [0, 0x8C, 0x8D, 0x8E, 0x67],
        [0, 0x9B, 0x9C, 0x9D, 0x9E],
        [0, 0x25, 0x26, 0x27, 0x1D],
        [0, 0x8F, 0x90, 0x91, 0x92],
        [0, 0x1D, 0x9F, 0xA0, 0x10],
        [0, 0x28, 0x10, 0x29, 0x2A],
        [0, 0x00, 0x00, 0x00, 0x00],
        [0, 0x00, 0x00, 0x00, 0x00],
        [0, 0x93, 0xA8, 0x95, 0xA9],
        [0, 0xAA, 0xAB, 0xAC, 0xAD],
    ],
    "Tile Group 4 (byte_A166)": [
        [0, 0x00, 0xAE, 0x00, 0xAF],
        [0, 0xBB, 0xBC, 0xBD, 0xBE],
        [0, 0x1E, 0xCA, 0xA2, 0xCB],
        [0, 0xB0, 0xB1, 0xB2, 0xB3],
        [0, 0xBF, 0xC0, 0xC1, 0xC2],
        [0, 0xCC, 0xCD, 0xCE, 0xCF],
        [0, 0xB4, 0xB5, 0xB6, 0xB7],
        [0, 0xC3, 0xC4, 0xC5, 0xC6],
        [0, 0xD0, 0xD1, 0xD2, 0xD3],
        [0, 0xB8, 0x00, 0xB9, 0xBA],
        [0, 0xC7, 0xC8, 0x4F, 0xC9],
        [0, 0xD4, 0x10, 0x1D, 0x2A],
        [0, 0x00, 0x00, 0x00, 0x00],
        [0, 0x00, 0x00, 0x00, 0x00],
        [0, 0xBB, 0xBC, 0xBD, 0xBE],
        [0, 0xBF, 0xD5, 0xC1, 0xD6],
    ],
}

# Maps a tile-group id (as written into a body segment's .flags field)
# to its ZELA_FRAMES key.
ZELA_FRAME_SET_BY_INDEX = {
    0: "Tile Group 0 (byte_A03A)",
    1: "Tile Group 1 (byte_A08A)",
    2: "Tile Group 2 (byte_A0D0)",
    3: "Tile Group 3 (byte_A116)",
    4: "Tile Group 4 (byte_A166)",
}

# byte_A4EA: per-anim_phase tile-group id, indexed by anim_phase (0-7).
ZELA_MOVEMENT_FACING_TABLE = [2, 1, 0, 3, 4, 3, 0, 1]


def compute_zela_body_layout(anim_phase):
    """
    Reproduce Zela_AI_proc's body-segment layout (stage_body_segments /
    loc_A3DA feeding place_boss_body_segments / loc_A467) for a single
    anim_phase (0-7): a fixed 4-column x 3-row grid where every one of
    the 12 slots uses the same tile group
    (ZELA_MOVEMENT_FACING_TABLE[anim_phase], i.e. byte_A4EA) and a frame
    index equal to its column-major position in the grid (column 0's
    3 rows are frames 0-2, column 1's are 3-5, and so on) -- unlike
    Tako/Tori, Zela has no shape-mask walk gating which cells appear;
    all 12 are always placed.
    """
    tile_group = ZELA_MOVEMENT_FACING_TABLE[anim_phase & 7]
    placements = []
    idx = 0
    for col in range(4):
        for row in range(3):
            placements.append((col, row, tile_group, idx))
            idx += 1
    return placements


def render_zela_group(data, canvas, y_offset, layout):
    """
    Render zela.grp sprites (Agar/Zela boss).

    Part 1 assembles the actual boss body (4 columns x 3 rows) for each
    of the 8 anim_phase values (0-7), exactly as Zela_AI_proc lays it
    out every frame: stage_body_segments() fills all 12 slots from
    ZELA_MOVEMENT_FACING_TABLE[anim_phase] with sequential frame
    indices 0-11, and place_boss_body_segments() lays those 12 slots
    into the 4x3 grid in column-major order (column, then row).

    Part 2 is a plain browser over every raw frame set (ZELA_FRAMES),
    including the frames beyond index 11 that the composite body never
    reaches -- tables 3 and 4 have two trailing all-zero (blank)
    entries at indices 12-13, and all five tables have a couple of
    entries beyond that the body walk never selects; same caveat as
    Tako's unused Frame Set 16.
    """
    TILE_SIZE = 32
    scale = 3
    current_y = y_offset

    # Ensure the data buffer is padded to prevent index-out-of-range
    # errors for high tile indices.
    tiles_raw = data + b'\x00' * (256 * TILE_SIZE)

    # -----------------------------------------------------------------------
    # Part 1: Render Composite Zela Body (anim_phase 0-7)
    # -----------------------------------------------------------------------
    cols, rows = 4, 3
    block_w, block_h = cols * 16 * scale, rows * 16 * scale
    phases_per_row = 4
    body_gap_x, body_gap_y = 24, 32

    for phase in range(8):
        col_idx = phase % phases_per_row
        row_idx = phase // phases_per_row
        x_base = 10 + col_idx * (block_w + body_gap_x)
        y_base = current_y + row_idx * (block_h + body_gap_y)

        canvas.create_rectangle(x_base - 1, y_base - 1, x_base + block_w, y_base + block_h, outline="gray")
        canvas.create_text(x_base + 2, y_base - 8, text=f"anim_phase {phase}",
                            anchor="w", fill="white", font=("TkDefaultFont", 7))

        for gcol, grow, tile_group, frame_idx in compute_zela_body_layout(phase):
            set_name = ZELA_FRAME_SET_BY_INDEX.get(tile_group)
            if set_name is None:
                continue
            frames = layout[set_name]
            if frame_idx >= len(frames):
                continue
            draw_composed_16x16_frame(canvas, frames[frame_idx], tiles_raw,
                                       x_base + gcol * 16 * scale,
                                       y_base + grow * 16 * scale,
                                       scale)

    num_body_rows = (8 + phases_per_row - 1) // phases_per_row
    current_y += num_body_rows * (block_h + body_gap_y) + 24

    # -----------------------------------------------------------------------
    # Part 2: Render every raw frame set (including frames the composite
    # body never reaches)
    # -----------------------------------------------------------------------
    gap_x, gap_y = 0, 8
    sprite_px = 16
    frames_per_row = 16
    n = 0
    for set_name, frames in layout.items():
        current_y += 20

        for f_idx, frame_data in enumerate(frames):
            x_frame = 10 + (f_idx % frames_per_row) * (sprite_px * scale + gap_x)
            y_frame = current_y + (f_idx // frames_per_row) * (sprite_px * scale + gap_y)

            canvas.create_text(x_frame + 8, y_frame - 8, text=f"{n}",
                                fill="white", font=("TkDefaultFont", 7))
            n += 1
            canvas.create_rectangle(x_frame, y_frame, x_frame + sprite_px * scale,
                                     y_frame + sprite_px * scale, fill="#8c38ff", outline="")
            draw_composed_16x16_frame(canvas, frame_data, tiles_raw, x_frame, y_frame, scale)

        num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
        current_y += num_rows * (sprite_px * scale + gap_y) + 12

    return current_y - y_offset


# ---------------------------------------------------------------------------
# Meda (Vista boss) rendering
# ---------------------------------------------------------------------------

# Transcribed directly from meda.asm's byte_A050/byte_A0A0/byte_A0F0/
# byte_A140/byte_A18B/byte_A1DB tables, pointed to by the offset table at
# A030. Same [pal_idx, tl, tr, bl, br] format as CRAB_FRAMES/TAKO_FRAMES/
# TORI_FRAMES/ZELA_FRAMES.
MEDA_FRAMES = {
    "Tile Group 0 (byte_A050)": [
        [0, 0x01, 0x00, 0x02, 0x03],
        [0, 0x00, 0x04, 0x05, 0x06],
        [0, 0x00, 0x07, 0x16, 0x09],
        [0, 0x08, 0x0B, 0x0A, 0x0C],
        [0, 0x0D, 0x0E, 0x0F, 0x10],
        [0, 0x11, 0x12, 0x13, 0x0A],
        [0, 0x14, 0x00, 0x0A, 0x15],
        [0, 0x00, 0x17, 0x18, 0x19],
        [0, 0x1A, 0x1B, 0x1C, 0x0A],
        [0, 0x1D, 0x1E, 0x1F, 0x20],
        [0, 0x21, 0x22, 0x0A, 0x23],
        [0, 0x0A, 0x24, 0x0A, 0x25],
        [0, 0x26, 0x0A, 0x27, 0x0A],
        [0, 0x28, 0x0A, 0x29, 0x0A],
        [0, 0x2A, 0x0A, 0x2B, 0x0A],
        [0, 0x0A, 0x0A, 0x0A, 0x2C],
    ],
    "Tile Group 1 (byte_A0A0)": [
        [0, 0x2D, 0x00, 0x0A, 0x2E],
        [0, 0x0A, 0x2F, 0x0A, 0x30],
        [0, 0x0A, 0x31, 0x32, 0x33],
        [0, 0x34, 0x00, 0x35, 0x36],
        [0, 0x00, 0x00, 0x37, 0x38],
        [0, 0x00, 0x39, 0x3A, 0x3B],
        [0, 0x00, 0x00, 0x3C, 0x3D],
        [0, 0x3E, 0x3F, 0x40, 0x41],
        [0, 0x42, 0x43, 0x44, 0x45],
        [0, 0x46, 0x47, 0x48, 0x49],
        [0, 0x5A, 0x5B, 0x5C, 0x5D],
        [0, 0x5E, 0x5F, 0x60, 0x61],
        [0, 0x62, 0x63, 0x64, 0x65],
        [0, 0x66, 0x67, 0x68, 0x69],
        [0, 0x6A, 0x6B, 0x6C, 0x6D],
        [0, 0x6E, 0x6F, 0x70, 0x71],
    ],
    "Tile Group 2 (byte_A0F0)": [
        [0, 0x72, 0x73, 0x74, 0x75],
        [0, 0x76, 0x77, 0x78, 0x79],
        [0, 0x7A, 0x7B, 0x7C, 0x7D],
        [0, 0x7E, 0x7F, 0x68, 0x69],
        [0, 0x80, 0x81, 0x6C, 0x6D],
        [0, 0x82, 0x83, 0x70, 0x71],
        [0, 0x72, 0x84, 0x85, 0x86],
        [0, 0x76, 0x87, 0x88, 0x89],
        [0, 0x62, 0x63, 0x8A, 0x8B],
        [0, 0x8C, 0x8D, 0x68, 0x69],
        [0, 0x8E, 0x8F, 0x6C, 0x6D],
        [0, 0x90, 0x91, 0x70, 0x71],
        [0, 0x92, 0x84, 0x93, 0x94],
        [0, 0x95, 0x96, 0x97, 0x98],
        [0, 0x99, 0x63, 0x8A, 0x9A],
        [0, 0x9B, 0x9C, 0x68, 0x69],
    ],
    "Tile Group 3 (byte_A140)": [
        [0, 0x9D, 0x9E, 0x6C, 0x6D],
        [0, 0x9F, 0xA0, 0x70, 0x71],
        [0, 0x72, 0xA1, 0xA2, 0xA3],
        [0, 0x76, 0x77, 0xA4, 0xA5],
        [0, 0x62, 0x63, 0xA6, 0xA7],
        [0, 0xA8, 0xA9, 0x68, 0x69],
        [0, 0x6A, 0xAA, 0x6C, 0x6D],
        [0, 0xAB, 0xAC, 0x70, 0x71],
        [0, 0x5A, 0xAD, 0xAE, 0xAF],
        [0, 0xB0, 0xB1, 0xB2, 0xB3],
        [0, 0xB4, 0x7B, 0xB5, 0xB6],
        [0, 0xB7, 0xB8, 0xB9, 0xBA],
        [0, 0xBB, 0xBC, 0x6C, 0xBD],
        [0, 0xBE, 0xBF, 0x70, 0x71],
        [0, 0x42, 0x43, 0x44, 0xCC],
    ],
    "Tile Group 14 (byte_A18B)": [
        [0, 0x4A, 0x4B, 0x4C, 0x4D],
        [0, 0x4E, 0x4F, 0x50, 0x51],
        [0, 0x52, 0x53, 0x54, 0x55],
        [0, 0x56, 0x57, 0x58, 0x59],
        [0, 0xC0, 0xC1, 0xC2, 0xC3],
        [0, 0xC4, 0xC5, 0xC6, 0xC7],
        [0, 0x00, 0x00, 0xC8, 0xC9],
        [0, 0x00, 0x00, 0xCA, 0xCB],
        [0, 0xC0, 0xC1, 0xCD, 0xCE],
        [0, 0xCF, 0xC5, 0xC6, 0xC7],
        [0, 0xC0, 0xC1, 0xD0, 0xD1],
        [0, 0xD2, 0xC5, 0xC6, 0xC7],
        [0, 0x00, 0x00, 0xC8, 0xD3],
        [0, 0x00, 0x00, 0x00, 0xD4],
        [0, 0xC0, 0xC1, 0xD5, 0xD6],
        [0, 0xD7, 0xC5, 0xD8, 0xC7],
    ],
    "Tile Group 15 (byte_A1DB)": [
        [0, 0x00, 0xD9, 0xDA, 0xDB],
        [0, 0xC0, 0xC1, 0xC2, 0xDC],
        [0, 0xDD, 0xC5, 0xDE, 0xC7],
    ],
}

MEDA_FRAME_SET_BY_INDEX = {
    0: "Tile Group 0 (byte_A050)",
    1: "Tile Group 1 (byte_A0A0)",
    2: "Tile Group 2 (byte_A0F0)",
    3: "Tile Group 3 (byte_A140)",
    14: "Tile Group 14 (byte_A18B)",
    15: "Tile Group 15 (byte_A1DB)",
}

MEDA_LAYOUT_BODY1 = [
    (0, 7), (0, 8), (0, 9), (0, 0), (0, 2), (0, 0x0A), (0, 0x0B), (0, 0x0C), (0, 3), (1, 7),
    (0, 4), (0, 5), (1, 9), (0, 6), (0, 0x0D), (0, 0x0E), (0, 0x0F), (0, 1), (1, 0), (1, 1), (1, 2)
]
MEDA_SHAPE_BODY1 = [0x2A, 0x80, 0x55, 0x00, 0x41, 0x00, 0x40, 0x00, 0x41, 0x00, 0x55, 0x80, 0x2A]

MEDA_LAYOUT_BODY2 = [
    (1, 3), (1, 4), (0x0E, 2), (0x0E, 0), (0x0E, 1), (0x0E, 3), (1, 5), (1, 6)
]
MEDA_SHAPE_BODY2 = [0xC0, 0x10, 0x40, 0, 0, 0, 0, 0, 0x40, 0x10, 0xC0]

MEDA_LAYOUT_DIR = [
    [(1, 0x0A), (1, 0x0D), (1, 0x0B), (1, 0x0E), (1, 0x0C), (1, 0x0F)],  # dir 0
    [(2, 0), (2, 3), (2, 1), (2, 4), (2, 2), (2, 5)],                      # dir 1
    [(2, 6), (2, 9), (2, 7), (2, 0x0A), (2, 8), (2, 0x0B)],              # dir 2
    [(2, 0x0C), (2, 0x0F), (2, 0x0D), (3, 0), (2, 0x0E), (3, 1)],         # dir 3
    [(3, 2), (3, 5), (3, 3), (3, 6), (3, 4), (3, 7)],                      # dir 4
    [(3, 8), (3, 0x0B), (3, 9), (3, 0x0C), (3, 0x0A), (3, 0x0D)]          # dir 5
]
MEDA_SHAPE_DIR = [0xA0, 0, 0xA0, 0, 0xA0]

MEDA_LAYOUT_WING = [
    [(0x0E, 6), (0x0E, 4), (1, 8), (0x0E, 5), (0x0E, 7)],                 # wing 0
    [(0x0E, 6), (0x0E, 8), (3, 0x0E), (0x0E, 9), (0x0E, 7)],               # wing 1
    [(0x0E, 0x0C), (0x0E, 0x0A), (0x0E, 0x0D), (1, 8), (0x0E, 0x0B), (0x0E, 7)], # wing 2
    [(0x0E, 6), (0x0E, 0x0E), (0x0F, 0), (1, 8), (0x0E, 0x0F), (0x0E, 7)], # wing 3
    [(0x0E, 6), (0x0F, 1), (1, 8), (0x0F, 2), (0x0E, 7)]                  # wing 4
]
MEDA_SHAPE_WING = [
    [0x10, 0x20, 0x80, 0x20, 0x10],  # wing 0
    [0x10, 0x20, 0x80, 0x20, 0x10],  # wing 1
    [0x10, 0x30, 0x80, 0x20, 0x10],  # wing 2
    [0x10, 0x28, 0x80, 0x20, 0x10],  # wing 3
    [0x10, 0x20, 0x80, 0x20, 0x10],  # wing 4
]


def place_meda_body_part_into_grid(grid, layout, shape, col_base, row_base):
    grid_cols, grid_rows = 14, 12
    pair_iter = iter(layout)
    col = col_base
    row = row_base

    for mask_byte in shape:
        b = mask_byte
        for bit_idx in range(8):
            carry = (b & 0x80) != 0
            b = ((b << 1) | (1 if carry else 0)) & 0xFF
            if carry:
                try:
                    tile_group, anim_idx = next(pair_iter)
                    if 0 <= col < grid_cols and 0 <= row < grid_rows:
                        grid[col][row] = (tile_group, anim_idx)
                except StopIteration:
                    pass
            row += 1
            if row >= grid_rows:
                col += row // grid_rows
                row = row % grid_rows

        row += 4
        if row >= grid_rows:
            col += row // grid_rows
            row = row % grid_rows


def compute_meda_body_layout(direction_zone, anim_frame):
    """
    Reproduce Meda_AI_proc's body-part layout assembly (build_frame_sprite_list /
    place_body_part) for a given direction_zone (0-5) and anim_frame (0-4),
    returning a list of (col, row, tile_group, anim_idx) for every populated
    cell in the 14-column x 12-row grid.
    """
    grid: list[list[tuple[int, int] | None]] = [[None for _ in range(12)] for _ in range(14)]
    place_meda_body_part_into_grid(grid, MEDA_LAYOUT_BODY1, MEDA_SHAPE_BODY1, 0, 0)
    place_meda_body_part_into_grid(grid, MEDA_LAYOUT_BODY2, MEDA_SHAPE_BODY2, 1, 8)
    place_meda_body_part_into_grid(grid, MEDA_LAYOUT_DIR[direction_zone], MEDA_SHAPE_DIR, 4, 3)
    place_meda_body_part_into_grid(grid, MEDA_LAYOUT_WING[anim_frame], MEDA_SHAPE_WING[anim_frame], 4, 7)

    placements = []
    for col in range(14):
        for row in range(12):
            cell = grid[col][row]
            if cell is not None:
                tile_group, anim_idx = cell
                placements.append((col, row, tile_group, anim_idx))
    return placements


def render_meda_group(data, canvas, y_offset):
    """
    Render meda.grp sprites (Vista / Meda boss).

    Part 1 assembles the composite Meda body (14 columns x 12 rows grid)
    for various direction_zone (0-5) and anim_frame (0-4) combinations,
    reproducing build_frame_sprite_list() from meda.c / meda.asm.

    Part 2 renders every raw frame set (MEDA_FRAMES).
    """
    TILE_SIZE = 32
    scale = 3
    current_y = y_offset

    tiles_raw = data + b'\x00' * (256 * TILE_SIZE)

    # -----------------------------------------------------------------------
    # Part 1: Render Composite Meda Body
    # -----------------------------------------------------------------------
    body_scale = 2
    step = 8
    cols, rows = 14, 12
    sprite_span = 16
    block_w = int((cols - 1) * step * body_scale + sprite_span * body_scale)
    block_h = int((rows - 1) * step * body_scale + sprite_span * body_scale)
    phases_per_row = 4
    body_gap_x, body_gap_y = 16, 24

    poses_to_render = [
        ("dir 0: far left (wing 0)", 0, 0),
        ("dir 1: left (wing 0)", 1, 0),
        ("dir 2: center (wing 0)", 2, 0),
        ("dir 3: right (wing 0)", 3, 0),
        ("dir 4: far right (wing 0)", 4, 0),
        ("dir 5: death pose", 5, 0),
        ("wing flap 1 (center)", 2, 1),
        ("wing flap 2 (center)", 2, 2),
        ("wing flap 3 (center)", 2, 3),
        ("wing flap 4 (center)", 2, 4),
    ]

    for f_idx, (label, dz, wf) in enumerate(poses_to_render):
        col_idx = f_idx % phases_per_row
        row_idx = f_idx // phases_per_row
        x_base = 10 + col_idx * (block_w + body_gap_x)
        y_base = current_y + row_idx * (block_h + body_gap_y)

        canvas.create_rectangle(x_base - 1, y_base - 1, x_base + block_w, y_base + block_h, outline="gray")
        canvas.create_text(x_base + 2, y_base - 8, text=f"{f_idx}: {label}",
                            anchor="w", fill="white", font=("TkDefaultFont", 7))

        for gcol, grow, tile_group, anim_idx in compute_meda_body_layout(dz, wf):
            set_name = MEDA_FRAME_SET_BY_INDEX.get(tile_group)
            if set_name is None:
                continue
            frames = MEDA_FRAMES[set_name]
            if anim_idx >= len(frames):
                continue
            draw_composed_16x16_frame(canvas, frames[anim_idx], tiles_raw,
                                       x_base + int(gcol * step * body_scale),
                                       y_base + int(grow * step * body_scale),
                                       body_scale)

    num_body_rows = (len(poses_to_render) + phases_per_row - 1) // phases_per_row
    current_y += num_body_rows * (block_h + body_gap_y) + 24

    # -----------------------------------------------------------------------
    # Part 2: Render every raw frame set
    # -----------------------------------------------------------------------
    gap_x, gap_y = 0, 8
    sprite_px = 16
    frames_per_row = 16
    n = 0
    for set_name, frames in MEDA_FRAMES.items():
        current_y += 20

        for f_idx, frame_data in enumerate(frames):
            x_frame = 10 + (f_idx % frames_per_row) * (sprite_px * scale + gap_x)
            y_frame = current_y + (f_idx // frames_per_row) * (sprite_px * scale + gap_y)

            canvas.create_text(x_frame + 8, y_frame - 8, text=f"{n}",
                                fill="white", font=("TkDefaultFont", 7))
            n += 1
            canvas.create_rectangle(x_frame, y_frame, x_frame + sprite_px * scale,
                                     y_frame + sprite_px * scale, fill="#8c38ff", outline="")
            draw_composed_16x16_frame(canvas, frame_data, tiles_raw, x_frame, y_frame, scale)

        num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
        current_y += num_rows * (sprite_px * scale + gap_y) + 12

    return current_y - y_offset


def render_lega_group(data, canvas, y_offset):
    """
    Lega / Tarso boss.

    Part 1 assembles the composite boss body for the named states in
    LEGA_BODY_FRAMES, reproducing Lega_AI_proc's 8x10 buffer layout.

    Lega's world coordinates advance by 1 per column and 1 per row, so the
    16x16 sprite parts overlap on an 8px grid, like Tori/Meda, not on a
    16px grid like Crab/Tako.

    Part 2 is a plain browser over every raw frame set, including group 6,
    which is the projectile/special animation set.
    """
    TILE_SIZE = 32

    current_y = y_offset

    # Pad to avoid index errors on high tile indices.
    tiles_raw = data + b"\x00" * (256 * TILE_SIZE)

    # -----------------------------------------------------------------------
    # Part 1: Render composite Lega body
    # -----------------------------------------------------------------------
    body_scale = 2
    step = 8
    cols, rows = 8, 10
    sprite_span = 16

    block_w = int((cols - 1) * step * body_scale + sprite_span * body_scale)
    block_h = int((rows - 1) * step * body_scale + sprite_span * body_scale)

    frames_per_row = 5
    body_gap_x, body_gap_y = 12, 16

    for f_idx, (label, table_idx, head_anim) in enumerate(LEGA_BODY_FRAMES):
        col_idx = f_idx % frames_per_row
        row_idx = f_idx // frames_per_row

        x_base = 10 + col_idx * (block_w + body_gap_x)
        y_base = current_y + row_idx * (block_h + body_gap_y)

        canvas.create_rectangle(
            x_base - 1,
            y_base - 1,
            x_base + block_w,
            y_base + block_h,
            outline="gray"
        )

        canvas.create_text(
            x_base + 2,
            y_base - 8,
            text=f"{f_idx}: {label}",
            anchor="w",
            fill="white",
            font=("TkDefaultFont", 7)
        )

        for gcol, grow, tile_group, frame_idx in compute_lega_phase_layout(table_idx, head_anim):
            set_name = LEGA_FRAME_SET_BY_INDEX.get(tile_group)
            if set_name is None:
                continue

            frames = LEGA_FRAMES[set_name]
            if frame_idx >= len(frames):
                continue

            draw_composed_16x16_frame(
                canvas,
                frames[frame_idx],
                tiles_raw,
                x_base + int(gcol * step * body_scale),
                y_base + int(grow * step * body_scale),
                body_scale
            )

    num_body_rows = (len(LEGA_BODY_FRAMES) + frames_per_row - 1) // frames_per_row
    current_y += num_body_rows * (block_h + body_gap_y) + 24

    # -----------------------------------------------------------------------
    # Part 2: Render every raw frame set
    # -----------------------------------------------------------------------
    gap_x, gap_y = 0, 8
    sprite_px = 16
    scale = 3
    frames_per_row = 16

    n = 0

    for set_name, frames in LEGA_FRAMES.items():
        current_y += 20

        for f_idx, frame_data in enumerate(frames):
            x_frame = 10 + (f_idx % frames_per_row) * (sprite_px * scale + gap_x)
            y_frame = current_y + (f_idx // frames_per_row) * (sprite_px * scale + gap_y)

            canvas.create_text(
                x_frame + 8,
                y_frame - 8,
                text=f"{n}",
                fill="white",
                font=("TkDefaultFont", 7)
            )

            n += 1

            canvas.create_rectangle(
                x_frame,
                y_frame,
                x_frame + sprite_px * scale,
                y_frame + sprite_px * scale,
                fill="#8c38ff",
                outline=""
            )

            draw_composed_16x16_frame(
                canvas,
                frame_data,
                tiles_raw,
                x_frame,
                y_frame,
                scale
            )

        num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
        current_y += num_rows * (sprite_px * scale + gap_y) + 12

    return current_y - y_offset


# ---------------------------------------------------------------------------
# Akma (Alguien) boss rendering (akma.grp)
# ---------------------------------------------------------------------------
#
# Transcribed directly from akma.asm's "start:" export header: two
# 7-pointer tables (offsets 0x1A and 0x3C from "start") point at
# byte_A07E..byte_A2B3 and byte_A0B0..byte_A2EF respectively. Same
# [pal_idx, tl, tr, bl, br] row format as CRAB_FRAMES/TAKO_FRAMES. Like
# TAKO_FRAMES, none of this is read by Akma_AI_proc itself -- confirmed
# by grepping akma.asm, these labels only ever appear in that header
# table -- it belongs to the generic monster/boss-rendering routine, so
# entries are labeled by their table-slot ("Group N") and which of the
# two parallel pointer tables they came from ("Phase 0"/"Phase 1",
# matching Akma_AI_proc's byte_AA21 flight-phase flag) rather than a
# hand-picked body-part name.
#
# Groups 0-2 and 5 are combined by the pose-mask walk below into the
# boss's main body; group 3 is a small 5-slot "arm/weapon" overlay;
# group 4 is a 2-slot "head" overlay; group 6 (byte_A2B3/byte_A2EF) is
# never referenced by the pose or overlay tables at all -- like TAKO's
# Frame Set 16, it's some other sprite (its contents, a run of
# progressively-different last tiles built around a repeated 0xEB/0x19
# tile, look like a hit-spark/impact effect) and so has no placement of
# its own in the composite body; it's still included below for
# reference in Part 2.
AKMA_FRAMES = {
    "Group 0 Phase 0 (byte_A07E)": [
        [0, 0, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 13, 14], [0, 11, 12, 15, 16],
        [0, 15, 16, 17, 189], [0, 243, 0, 187, 244], [0, 187, 244, 190, 191],
        [0, 244, 188, 191, 192], [0, 187, 90, 190, 191], [0, 90, 91, 191, 192],
    ],
    "Group 0 Phase 1 (byte_A0B0)": [
        [0, 18, 0, 21, 22], [0, 19, 20, 23, 24], [0, 28, 29, 32, 33], [0, 26, 27, 30, 31],
        [0, 30, 31, 198, 34], [0, 0, 245, 246, 194], [0, 246, 194, 196, 197],
        [0, 193, 246, 195, 196], [0, 166, 167, 195, 196], [0, 167, 194, 196, 197],
    ],
    "Group 1 Phase 0 (byte_A0E2)": [
        [0, 0, 53, 60, 61], [0, 61, 62, 65, 66], [0, 49, 50, 53, 54], [0, 0, 42, 46, 35],
        [0, 36, 37, 42, 0], [0, 0, 44, 47, 45], [0, 51, 35, 55, 56], [0, 35, 35, 67, 35],
        [0, 68, 69, 70, 71], [0, 38, 39, 45, 35], [0, 35, 35, 35, 35], [0, 57, 58, 35, 64],
        [0, 35, 64, 64, 0], [0, 0, 41, 39, 40], [0, 35, 0, 58, 59],
    ],
    "Group 1 Phase 1 (byte_A12D)": [
        [0, 113, 0, 0, 115], [0, 115, 116, 119, 120], [0, 119, 112, 119, 112],
        [0, 130, 131, 136, 112], [0, 136, 112, 0, 136], [0, 0, 119, 129, 130],
        [0, 121, 122, 120, 121], [0, 112, 120, 132, 133], [0, 112, 112, 112, 140],
        [0, 143, 144, 145, 146], [0, 117, 118, 122, 123], [0, 123, 0, 124, 125],
        [0, 127, 128, 134, 135], [0, 137, 138, 141, 142], [0, 135, 0, 138, 139],
    ],
    "Group 2 Phase 0 (byte_A178)": [
        [0, 0, 0, 72, 73], [0, 0, 0, 0, 75], [0, 78, 79, 83, 84], [0, 76, 77, 80, 81],
        [0, 85, 35, 87, 88], [0, 82, 0, 35, 86], [0, 35, 89, 91, 89], [0, 75, 94, 103, 104],
        [0, 95, 96, 105, 35], [0, 68, 110, 70, 71], [0, 0, 0, 75, 76], [0, 97, 98, 35, 107],
        [0, 0, 0, 76, 77], [0, 99, 100, 108, 109], [0, 0, 0, 101, 102],
    ],
    "Group 2 Phase 1 (byte_A1C3)": [
        [0, 0, 152, 0, 157], [0, 162, 112, 162, 166], [0, 75, 76, 153, 154],
        [0, 158, 159, 163, 164], [0, 0, 0, 77, 0], [0, 155, 156, 160, 161],
        [0, 0, 0, 75, 151], [0, 177, 178, 184, 185], [0, 175, 176, 112, 183],
        [0, 143, 144, 145, 146], [0, 0, 0, 76, 77], [0, 173, 174, 181, 112],
        [0, 0, 0, 75, 76], [0, 171, 172, 179, 180], [0, 0, 0, 169, 170],
    ],
    "Group 3 Arm Phase 0 (byte_A20E)": [
        [0, 203, 204, 205, 206], [0, 0, 201, 207, 208], [0, 199, 200, 201, 202],
        [0, 210, 0, 212, 213], [0, 212, 213, 214, 215], [0, 213, 201, 215, 208],
        [0, 199, 200, 201, 202],
    ],
    "Group 3 Arm Phase 1 (byte_A231)": [
        [0, 216, 217, 218, 219], [0, 219, 0, 221, 222], [0, 225, 226, 223, 224],
        [0, 216, 217, 218, 219], [0, 227, 228, 229, 230], [0, 219, 229, 221, 231],
        [0, 229, 230, 231, 232],
    ],
    "Group 4 Head Phase 0 (byte_A254)": [
        [0, 1, 233, 0, 0], [0, 233, 234, 0, 0], [0, 1, 235, 0, 0], [0, 235, 236, 0, 237],
        [0, 1, 235, 248, 247], [0, 1, 235, 0, 250], [0, 1, 235, 0, 252],
    ],
    "Group 4 Head Phase 1 (byte_A277)": [
        [0, 238, 239, 0, 0], [0, 239, 25, 0, 0], [0, 240, 241, 242, 0], [0, 241, 25, 0, 0],
        [0, 240, 241, 242, 74], [0, 240, 241, 242, 52], [0, 240, 241, 242, 255],
        [0, 241, 25, 74, 92],
    ],
    "Group 5 Phase 0 (byte_A29F)": [
        [0, 0, 111, 106, 147], [0, 114, 126, 148, 149],
    ],
    "Group 5 Phase 1 (byte_A2A9)": [
        [0, 150, 165, 182, 186], [0, 168, 0, 209, 211],
    ],
    "Group 6 Unused Phase 0 (byte_A2B3)": [
        [0, 1, 235, 249, 247], [0, 1, 235, 248, 247], [0, 0, 0, 249, 247], [0, 0, 0, 248, 247],
        [0, 1, 235, 0, 251], [0, 1, 235, 0, 250], [0, 0, 250, 251, 0], [0, 0, 250, 250, 0],
        [0, 1, 235, 0, 254], [0, 1, 235, 0, 252], [0, 0, 253, 254, 0], [0, 0, 253, 252, 0],
    ],
    "Group 6 Unused Phase 1 (byte_A2EF)": [
        [0, 241, 25, 74, 93], [0, 241, 25, 74, 92], [0, 0, 0, 74, 93], [0, 0, 0, 74, 92],
        [0, 241, 25, 63, 0], [0, 241, 25, 52, 0], [0, 52, 0, 0, 63], [0, 52, 0, 0, 52],
        [0, 241, 25, 48, 0], [0, 241, 25, 255, 0], [0, 43, 0, 0, 48], [0, 43, 0, 0, 255],
    ],
}

# Maps a (flight_phase, tile_group) pair -- flight_phase 0/1 mirroring
# Akma_AI_proc's byte_AA21 -- to the AKMA_FRAMES key holding that group's
# frame rows, i.e. which of the two parallel header pointer tables is
# active for that group.
AKMA_FRAME_SET_BY_INDEX = {
    0: {
        0: "Group 0 Phase 0 (byte_A07E)",
        1: "Group 1 Phase 0 (byte_A0E2)",
        2: "Group 2 Phase 0 (byte_A178)",
        3: "Group 3 Arm Phase 0 (byte_A20E)",
        4: "Group 4 Head Phase 0 (byte_A254)",
        5: "Group 5 Phase 0 (byte_A29F)",
        6: "Group 6 Unused Phase 0 (byte_A2B3)",
    },
    1: {
        0: "Group 0 Phase 1 (byte_A0B0)",
        1: "Group 1 Phase 1 (byte_A12D)",
        2: "Group 2 Phase 1 (byte_A1C3)",
        3: "Group 3 Arm Phase 1 (byte_A231)",
        4: "Group 4 Head Phase 1 (byte_A277)",
        5: "Group 5 Phase 1 (byte_A2A9)",
        6: "Group 6 Unused Phase 1 (byte_A2EF)",
    },
}

# Pose layout tables (off_A7EE/off_A7F4 -> unk_A7FA..unk_A85E in akma.asm):
# each raw tile byte's high nibble selects the tile_group (an
# AKMA_FRAME_SET_BY_INDEX key) and low nibble selects the frame index
# within that group's AKMA_FRAMES list. AKMA_LAYOUT_TABLES[phase][pose]
# is one full pose (3 poses per phase, matching Akma_AI_proc's byte_AA20
# 0..2 cycle).
AKMA_LAYOUT_TABLES = {
    0: [  # flight_phase == 0 (off_A7EE)
        [(0, 0), (5, 0), (1, 0), (1, 3), (1, 2), (1, 1), (0, 1), (0, 2), (5, 1), (1, 4),
         (1, 5), (1, 6), (1, 7), (1, 8), (0, 3), (0, 4), (1, 9), (1, 10), (1, 11), (1, 12),
         (0, 5), (0, 6), (1, 13), (1, 14), (0, 7)],  # unk_A7FA
        [(0, 0), (5, 0), (2, 0), (0, 1), (0, 2), (5, 1), (2, 1), (2, 2), (0, 3), (0, 4),
         (2, 3), (2, 4), (0, 8), (0, 9), (2, 5), (2, 6)],  # unk_A82C
        [(0, 0), (5, 0), (2, 7), (0, 1), (0, 2), (5, 1), (2, 8), (2, 9), (0, 3), (0, 4),
         (2, 10), (2, 11), (0, 5), (0, 6), (0, 7), (2, 12), (2, 13), (2, 14)],  # unk_A84C
    ],
    1: [  # flight_phase != 0 (off_A7F4)
        [(1, 0), (1, 5), (0, 7), (1, 1), (1, 2), (1, 3), (1, 4), (0, 5), (0, 6), (1, 6),
         (1, 7), (1, 8), (1, 9), (0, 3), (0, 4), (1, 10), (1, 11), (1, 12), (1, 13), (0, 1),
         (0, 2), (5, 0), (1, 14), (0, 0), (5, 1)],  # unk_A813
        [(2, 0), (2, 1), (0, 8), (2, 2), (2, 3), (0, 9), (2, 4), (2, 5), (0, 3), (0, 4),
         (2, 6), (0, 1), (0, 2), (5, 0), (0, 0), (5, 1)],  # unk_A83C
        [(2, 14), (2, 12), (2, 13), (0, 7), (2, 10), (2, 11), (0, 5), (0, 6), (2, 8), (2, 9),
         (0, 3), (0, 4), (2, 7), (0, 1), (0, 2), (5, 0), (0, 0), (5, 1)],  # unk_A85E
    ],
}

# Pose mask tables (off_A870/off_A876 -> unk_A87C..unk_A8FE): 13 groups
# of 2 bytes = 26 bytes each, consumed/rotated bit-by-bit (MSB first) the
# same way tako.asm's tentacle shape tables are. AKMA_SHAPE_BASES[phase]
# lines up 1:1 with AKMA_LAYOUT_TABLES[phase].
AKMA_SHAPE_BASES = {
    0: [  # off_A870
        (0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x2A, 0xA8, 0x40, 0x00, 0x2A, 0xB0, 0x00, 0x00,
         0x56, 0x30, 0x88, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00),  # unk_A87C
        (0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x02, 0xA8, 0x00, 0x00, 0x02, 0xB0, 0x00, 0x00,
         0x01, 0x50, 0x00, 0x10, 0x00, 0xA0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00),  # unk_A8B0
        (0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x02, 0xA8, 0x00, 0x00, 0x02, 0xB0, 0x00, 0x00,
         0x0A, 0x30, 0x00, 0x10, 0x0A, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00),  # unk_A8E4
    ],
    1: [  # off_A876
        (0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0x10, 0x56, 0x30, 0x00, 0x00, 0x2A, 0xB0,
         0x40, 0x00, 0x2A, 0xA8, 0x04, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00),  # unk_A896
        (0x00, 0x00, 0x00, 0x00, 0x00, 0xA0, 0x00, 0x10, 0x01, 0x50, 0x00, 0x00, 0x02, 0xB0,
         0x00, 0x00, 0x02, 0xA8, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00),  # unk_A8CA
        (0x04, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x00, 0x10, 0x0A, 0x30, 0x00, 0x00, 0x02, 0xB0,
         0x00, 0x00, 0x02, 0xA8, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00),  # unk_A8FE
    ],
}

# "Arm" overlay (unk_A918/unk_A92C): 2 alternating 10-byte pose variants
# (selected by Akma_AI_proc's frame_counter parity), written 5x2 bytes
# starting at grid offset AKMA_ARM_GRID_BASE[phase].
AKMA_ARM_OVERLAY_BYTES = {
    0: (0xFF, 0x30, 0xFF, 0xFF, 0xFF, 0x31, 0x32, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0x33, 0x34, 0xFF, 0x35, 0x36, 0xFF, 0xFF, 0xFF),  # unk_A918
    1: (0x30, 0xFF, 0xFF, 0x31, 0xFF, 0xFF, 0xFF, 0x32, 0xFF, 0xFF,
        0x33, 0xFF, 0xFF, 0x35, 0x34, 0x36, 0xFF, 0xFF, 0xFF, 0xFF),  # unk_A92C
}
AKMA_ARM_GRID_BASE = {0: 93, 1: 61}  # byte_AA87 / byte_AA67 (col*16 + row)

# "Head" overlay (unk_A940/unk_A94A): 5 pose bytes each, indexed by
# Akma_AI_proc's overlay_frame (0..~3), written 2 bytes 16 grid-slots
# apart starting at grid offset AKMA_SECONDARY_GRID_BASE[phase].
AKMA_SECONDARY_OVERLAY_BYTES = {
    0: (0x40, 0x41, 0x42, 0x43, 0x44, 0x43, 0x45, 0x43, 0x46, 0x43),  # unk_A940
    1: (0x40, 0x41, 0x42, 0x43, 0x44, 0x47, 0x45, 0x43, 0x46, 0x43),  # unk_A94A
}
AKMA_SECONDARY_GRID_BASE = {0: 9, 1: 169}  # byte_AA33 / byte_AAD3


def compute_akma_body_layout(phase, pose_idx, arm_parity=0, overlay_idx=0):
    """
    Reproduce Akma_AI_proc's per-frame body build (populate_limb_grid() +
    apply_overlay_arm() + apply_overlay_secondary() in akma.c) for one
    (phase, pose_idx) combination, returning a static snapshot: a list of
    (col, row, tile_group, anim_idx) for every currently-visible
    body/limb/overlay segment in the 13-column x 16-row limb grid.

    Note: as in compute_tako_phase_layout, the mask bytes are rotated in
    place in the original and that rotation persists across frames; here
    each call starts from a fresh copy of the base mask so every pose is
    shown the way it looks the first time it's ever selected.
    """
    grid = {}  # linear grid offset (col*16 + row) -> (tile_group, anim_idx)

    mask = list(AKMA_SHAPE_BASES[phase][pose_idx])
    pair_iter = iter(AKMA_LAYOUT_TABLES[phase][pose_idx])

    di = 0
    for col in range(13):
        for sub in range(2):
            b = mask[col * 2 + sub]
            for _bit in range(8):
                carry = (b & 0x80) != 0
                b = ((b << 1) | (1 if carry else 0)) & 0xFF
                if carry:
                    try:
                        grid[di] = next(pair_iter)
                    except StopIteration:
                        pass
                di += 1

    def apply_slot(pos, byte_val):
        if byte_val == 0xFF:
            grid.pop(pos, None)
        else:
            grid[pos] = (byte_val >> 4, byte_val & 0x0F)

    # Arm overlay (group 3): 5 slots of 2 adjacent bytes, spaced 16 grid
    # slots (1 "column") apart, matching apply_overlay_arm()/loc_A54C.
    arm_src = AKMA_ARM_OVERLAY_BYTES[phase]
    arm_base = AKMA_ARM_GRID_BASE[phase]
    off = 0x0A if (arm_parity & 1) else 0x00
    for i in range(5):
        pos = arm_base + i * 16
        apply_slot(pos, arm_src[off + i * 2])
        apply_slot(pos + 1, arm_src[off + i * 2 + 1])

    # Head/secondary overlay (group 4): 2 bytes, 16 grid slots apart,
    # matching apply_overlay_secondary()/loc_A566.
    sec_src = AKMA_SECONDARY_OVERLAY_BYTES[phase]
    sec_base = AKMA_SECONDARY_GRID_BASE[phase]
    idx2 = (overlay_idx * 2) % len(sec_src)
    apply_slot(sec_base, sec_src[idx2])
    apply_slot(sec_base + 16, sec_src[idx2 + 1])

    placements = []
    for pos, (grp, idx) in sorted(grid.items()):
        col, row = pos // 16, pos % 16
        placements.append((col, row, grp, idx))
    return placements


def render_akma_group(data, canvas, y_offset):
    """
    Akma (Alguien) boss.

    Part 1 assembles the actual boss body (13 columns x 16 rows) for
    each of the 6 anim_phase/flight_phase pose combinations, exactly as
    Akma_AI_proc lays it out from AKMA_LAYOUT_TABLES/AKMA_SHAPE_BASES
    plus the arm/head overlay tables, using each placement's tile_group
    to pick the right AKMA_FRAMES set and anim_idx to pick the frame
    within it. The overlay pieces are shown in their default state
    (arm_parity=0, overlay_idx=0); Part 2 below includes every raw frame
    (including the other overlay/parity variants and the unused Group 6)
    for full reference.

    Part 2 is a plain browser over every raw frame set, since Group 6
    (byte_A2B3/byte_A2EF) is never referenced by the pose/overlay tables
    at all -- like TAKO_FRAMES' Frame Set 16, it has no placement of its
    own in the composite body.
    """
    TILE_SIZE = 32
    scale = 3
    current_y = y_offset
    gap_x = 0
    gap_y = 8
    sprite_px = 16
    frames_per_row = 16

    tiles_raw = data + b'\x00' * (256 * TILE_SIZE)

    # -----------------------------------------------------------------------
    # Part 1: Render Composite Akma Body (6 pose combos: 3 poses x 2 phases)
    # -----------------------------------------------------------------------
    # Each grid (col, row) step is one world-coordinate unit -- and the
    # game's base map tile is 8px, not 16 -- so adjacent 16x16 composed
    # pieces must be placed 8px apart (half their own width/height) to
    # overlap and tile together into a single connected sprite, exactly
    # like Akma_AI_proc's own currX/currY (boss_x+col, boss_y+row)
    # placement onto the 8px proximity map. Using a full 16px step here
    # (one step per whole sprite) is what produced the disconnected
    # "island" pieces with gaps between them.
    GRID_STEP = 8
    body_scale = 3
    cols, rows = 13, 16
    block_w = ((cols - 1) * GRID_STEP + 16) * body_scale
    block_h = ((rows - 1) * GRID_STEP + 16) * body_scale
    poses_per_row = 3
    body_gap_x, body_gap_y = 20, 30

    combos = [(phase, pose_idx) for phase in (0, 1) for pose_idx in range(3)]

    for combo_idx, (phase, pose_idx) in enumerate(combos):
        col_idx = combo_idx % poses_per_row
        row_idx = combo_idx // poses_per_row
        x_base = 10 + col_idx * (block_w + body_gap_x)
        y_base = current_y + row_idx * (block_h + body_gap_y)

        canvas.create_rectangle(x_base - 1, y_base - 1, x_base + block_w, y_base + block_h, outline="gray")
        canvas.create_text(x_base + 4, y_base - 10, text=f"phase {phase} / pose {pose_idx}",
                            anchor="nw", fill="white", font=("TkDefaultFont", 7))

        for gcol, grow, tile_group, anim_idx in compute_akma_body_layout(phase, pose_idx):
            set_name = AKMA_FRAME_SET_BY_INDEX.get(phase, {}).get(tile_group)
            if set_name is None:
                continue
            frames = AKMA_FRAMES[set_name]
            if anim_idx >= len(frames):
                continue
            draw_composed_16x16_frame(canvas, frames[anim_idx], tiles_raw,
                                       x_base + gcol * GRID_STEP * body_scale,
                                       y_base + grow * GRID_STEP * body_scale,
                                       body_scale)

    num_body_rows = (len(combos) + poses_per_row - 1) // poses_per_row
    current_y += num_body_rows * (block_h + body_gap_y) + 24

    # -----------------------------------------------------------------------
    # Part 2: Render every raw frame set (including Group 6, which the
    # composite body never uses)
    # -----------------------------------------------------------------------
    n = 0
    for set_name, frames in AKMA_FRAMES.items():
        current_y += 20

        for f_idx, frame_data in enumerate(frames):
            x_frame = 10 + (f_idx % frames_per_row) * (sprite_px * scale + gap_x)
            y_frame = current_y + (f_idx // frames_per_row) * (sprite_px * scale + gap_y)

            canvas.create_text(x_frame + 8, y_frame - 8, text=f"{n}",
                                fill="white", font=("TkDefaultFont", 7))
            n += 1
            canvas.create_rectangle(x_frame, y_frame, x_frame + sprite_px * scale,
                                     y_frame + sprite_px * scale, fill="#8c38ff", outline="")
            draw_composed_16x16_frame(canvas, frame_data, tiles_raw, x_frame, y_frame, scale)

        num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
        current_y += num_rows * (sprite_px * scale + gap_y) + 12

    return current_y - y_offset


# ---------------------------------------------------------------------------
# Mao1 (Jashiin, room 1) boss rendering (mao1.grp)
# ---------------------------------------------------------------------------
#
# Transcribed directly from mao1.asm's "start:" export header: the 7-pointer
# table at address 0xA030 (right after the AI/state-block pointers and their
# reserved padding) points at byte_A03E, byte_A08E, byte_A0DE, byte_A12E,
# byte_A17E, byte_A1CE and byte_A219. Same [pal_idx, tl, tr, bl, br] row
# format as CRAB_FRAMES/TAKO_FRAMES/AKMA_FRAMES (pal_idx is always 1 here).
# None of this is read by Mao1_AI_proc itself -- it belongs to the generic
# monster/boss-rendering routine -- so entries are labeled by their table
# slot/original symbol rather than a hand-picked body-part name, same as
# TAKO_FRAMES/AKMA_FRAMES.
MAO1_FRAMES = {
    "Group 0 (byte_A03E)": [
        [1, 0x01, 0x02, 0x03, 0x04], [1, 0x05, 0x06, 0x0C, 0x00], [1, 0x00, 0x00, 0x0A, 0x0B],
        [1, 0x00, 0x00, 0x08, 0x09], [1, 0x0E, 0x00, 0x00, 0x00], [1, 0x07, 0x0D, 0x0F, 0x10],
        [1, 0x00, 0x00, 0x01, 0x02], [1, 0x03, 0x04, 0x11, 0x12], [1, 0x00, 0x00, 0x13, 0x00],
        [1, 0x18, 0x19, 0x1E, 0x00], [1, 0x16, 0x17, 0x0A, 0x1D], [1, 0x00, 0x15, 0x1C, 0x09],
        [1, 0x20, 0x00, 0x00, 0x00], [1, 0x00, 0x14, 0x1A, 0x1B], [1, 0x07, 0x1F, 0x0F, 0x10],
        [1, 0x28, 0x00, 0x2F, 0x30],
    ],
    "Group 1 (byte_A08E)": [
        [1, 0x26, 0x27, 0x2D, 0x2E], [1, 0x13, 0x00, 0x18, 0x22], [1, 0x01, 0x02, 0x03, 0x04],
        [1, 0x11, 0x12, 0x16, 0x21], [1, 0x24, 0x25, 0x2B, 0x2C], [1, 0x34, 0x00, 0x00, 0x00],
        [1, 0x00, 0x23, 0x29, 0x2A], [1, 0x32, 0x33, 0x35, 0x36], [1, 0x00, 0x31, 0x00, 0x00],
        [1, 0x00, 0x00, 0x02, 0x00], [1, 0x04, 0x00, 0x39, 0x3A], [1, 0x3D, 0x3E, 0x3D, 0x42],
        [1, 0x3D, 0x45, 0x48, 0x49], [1, 0x4D, 0x4E, 0x52, 0x53], [1, 0x00, 0x00, 0x00, 0x01],
        [1, 0x00, 0x03, 0x37, 0x38],
    ],
    "Group 2 (byte_A0DE)": [
        [1, 0x3B, 0x3C, 0x3F, 0x40], [1, 0x43, 0x44, 0x46, 0x47], [1, 0x4B, 0x4C, 0x50, 0x51],
        [1, 0x00, 0x4A, 0x00, 0x4F], [1, 0x00, 0x03, 0x54, 0x38], [1, 0x57, 0x3C, 0x58, 0x40],
        [1, 0x59, 0x44, 0x46, 0x47], [1, 0x55, 0x56, 0x00, 0x00], [1, 0x00, 0x03, 0x5D, 0x38],
        [1, 0x58, 0x3C, 0x58, 0x40], [1, 0x00, 0x00, 0x5B, 0x5C], [1, 0x00, 0x00, 0x00, 0x5A],
        [1, 0x04, 0x00, 0x61, 0x3A], [1, 0x62, 0x3E, 0x3D, 0x42], [1, 0x00, 0x03, 0x5E, 0x38],
        [1, 0x5F, 0x60, 0x58, 0x40],
    ],
    "Group 3 (byte_A12E)": [
        [1, 0x04, 0x00, 0x67, 0x68], [1, 0x00, 0x03, 0x65, 0x66], [1, 0x00, 0x00, 0x63, 0x64],
        [1, 0x6C, 0x6D, 0x6F, 0x70], [1, 0x6A, 0x6B, 0x69, 0x6E], [1, 0x00, 0x69, 0x00, 0x00],
        [1, 0x71, 0x45, 0x72, 0x73], [1, 0x00, 0x69, 0x00, 0x47], [1, 0x74, 0x75, 0x77, 0x78],
        [1, 0x00, 0x4C, 0x76, 0x51], [1, 0x04, 0x00, 0x83, 0x84], [1, 0x86, 0x87, 0x71, 0x88],
        [1, 0x89, 0x8A, 0x85, 0x71], [1, 0x00, 0x00, 0x8B, 0x00], [1, 0x8C, 0x8D, 0x77, 0x8E],
        [1, 0x7D, 0x03, 0x81, 0x82],
    ],
    "Group 4 (byte_A17E)": [
        [1, 0x80, 0x71, 0x85, 0x80], [1, 0x00, 0x85, 0x00, 0x47], [1, 0x00, 0x00, 0x41, 0x79],
        [1, 0x7B, 0x7C, 0x7F, 0x80], [1, 0x00, 0x7A, 0x00, 0x7E], [1, 0x00, 0x85, 0x00, 0x00],
        [1, 0x04, 0x00, 0xA7, 0x00], [1, 0xAC, 0xAD, 0xB0, 0xB1], [1, 0xB4, 0x00, 0xB6, 0x00],
        [1, 0x8C, 0x8D, 0x77, 0x8E], [1, 0x94, 0x00, 0x9A, 0x01], [1, 0xA0, 0xA1, 0xA5, 0xA6],
        [1, 0xAA, 0xAB, 0xAE, 0xAF], [1, 0xB2, 0xB3, 0x00, 0xB5], [1, 0x00, 0x4C, 0x76, 0x51],
        [1, 0x92, 0x93, 0x98, 0x99],
    ],
    "Group 5 (byte_A1CE)": [
        [1, 0x9E, 0x9F, 0xA3, 0xA4], [1, 0xA8, 0xA9, 0x00, 0x00], [1, 0x90, 0x91, 0x96, 0x97],
        [1, 0x9C, 0x9D, 0x00, 0xA2], [1, 0x00, 0x8F, 0x00, 0x95], [1, 0x00, 0x9B, 0x00, 0x00],
        [1, 0x00, 0x00, 0xC4, 0xC5], [1, 0x04, 0xCA, 0xCF, 0xD0], [1, 0xAC, 0xAD, 0xB0, 0xB1],
        [1, 0xB4, 0x00, 0xB6, 0x00], [1, 0x8C, 0x8D, 0x77, 0x8E], [1, 0xBC, 0xBD, 0xC2, 0xC3],
        [1, 0xC9, 0x03, 0x00, 0xCE], [1, 0x00, 0xD1, 0x00, 0xD2], [1, 0x00, 0xB3, 0x00, 0xB5],
    ],
    "Group 6 (byte_A219)": [
        [1, 0x00, 0x00, 0x00, 0xB8], [1, 0x00, 0x00, 0x00, 0xB7], [1, 0xBA, 0xBB, 0xC0, 0xC1],
        [1, 0x00, 0xB9, 0xBE, 0xBF], [1, 0xC7, 0xC8, 0xCC, 0xCD], [1, 0x00, 0xC6, 0x00, 0xCB],
        [1, 0x00, 0x00, 0x00, 0x07],
    ],
}

# Maps a tile_group value (the high nibble of a packed byte in
# MAO1_LAYOUT_TABLES / off_A495's byte_A4AB..byte_A51F pose tile tables)
# to its MAO1_FRAMES key.
MAO1_FRAME_SET_BY_INDEX = {
    0: "Group 0 (byte_A03E)",
    1: "Group 1 (byte_A08E)",
    2: "Group 2 (byte_A0DE)",
    3: "Group 3 (byte_A12E)",
    4: "Group 4 (byte_A17E)",
    5: "Group 5 (byte_A1CE)",
    6: "Group 6 (byte_A219)",
}

# Pose layout tables (off_A495 -> byte_A4AB..byte_A51F in mao1.asm): each
# raw tile byte's high nibble selects the tile_group (a MAO1_FRAME_SET_BY_INDEX
# key) and low nibble selects the frame index within that group's MAO1_FRAMES
# list -- pre-split into (tile_group, anim_idx) tuples here, same convention
# as TAKO_LAYOUT_TABLES/AKMA_LAYOUT_TABLES. MAO1_LAYOUT_TABLES[pose] lines up
# 1:1 with MAO1_SHAPE_BASES[pose] (11 poses, matching Mao1_AI_proc's
# byte_A59B pose selector, 0..0x0A).
MAO1_LAYOUT_TABLES = [
    [(0, 0x5), (0, 0x3), (0, 0x4), (0, 0x2), (0, 0x0), (0, 0x1)],  # byte_A4AB
    [(0, 0xD), (0, 0xE), (0, 0xB), (0, 0xC), (0, 0x6), (0, 0x7), (0, 0xA), (0, 0x8), (0, 0x9)],  # byte_A4B1
    [(1, 0x8), (1, 0x6), (1, 0x7), (1, 0x2), (1, 0x3), (1, 0x4), (1, 0x5), (1, 0x1), (1, 0x0), (0, 0xF)],  # byte_A4BA
    [(2, 0x3), (1, 0xE), (1, 0xF), (2, 0x0), (2, 0x1), (2, 0x2), (1, 0x9), (1, 0xA), (1, 0xB), (1, 0xC), (1, 0xD)],  # byte_A4C4
    [(2, 0x7), (2, 0x3), (1, 0xE), (2, 0x4), (2, 0x5), (2, 0x6), (2, 0x2), (1, 0x9), (1, 0xA), (1, 0xB), (1, 0xC), (1, 0xD)],  # byte_A4CF
    [(2, 0xB), (2, 0xA), (2, 0x3), (1, 0xE), (2, 0x8), (2, 0x9), (2, 0x6), (2, 0x2), (1, 0x9), (1, 0xA), (1, 0xB), (1, 0xC), (1, 0xD)],  # byte_A4DB
    [(2, 0x3), (1, 0xE), (2, 0xE), (2, 0xF), (2, 0x6), (2, 0x2), (1, 0x9), (2, 0xC), (2, 0xD), (1, 0xC), (1, 0xD)],  # byte_A4E8
    [(3, 0x2), (3, 0x5), (1, 0xE), (3, 0x1), (3, 0x4), (3, 0x7), (3, 0x9), (1, 0x9), (3, 0x0), (3, 0x3), (3, 0x6), (3, 0x8)],  # byte_A4F3
    [(4, 0x4), (4, 0x2), (4, 0x3), (4, 0x5), (1, 0xE), (3, 0xF), (4, 0x0), (4, 0x1), (3, 0x9), (1, 0x9), (3, 0xA), (3, 0xB), (3, 0xC), (3, 0xE), (3, 0xD)],  # byte_A4FF
    [(5, 0x4), (5, 0x5), (5, 0x2), (5, 0x3), (4, 0xF), (5, 0x0), (5, 0x1), (4, 0xA), (4, 0xB), (4, 0xC), (4, 0xD), (4, 0xE), (1, 0x9), (4, 0x6), (4, 0x7), (4, 0x8), (4, 0x9)],  # byte_A50E
    [(6, 0x1), (6, 0x3), (6, 0x5), (6, 0x0), (6, 0x2), (6, 0x4), (5, 0xB), (5, 0xC), (5, 0xD), (5, 0xE), (4, 0xE), (5, 0x6), (5, 0x7), (5, 0x8), (5, 0x9), (5, 0xA)],  # byte_A51F
]

# Pose mask tables (off_A52F -> byte_A545..byte_A57B in mao1.asm): 6 bytes
# each, one bit per potential row (up to 8) per column (6 columns),
# consumed MSB-first via rotate, same scheme as TAKO_SHAPE_BASES/
# AKMA_SHAPE_BASES. Poses 3 and 6 share the exact same physical mask byte
# (byte_A557) in the original data layout.
MAO1_SHAPE_BASES = [
    (0x00, 0x00, 0x04, 0x0C, 0x08, 0x18),  # byte_A545 (pose 0)
    (0x00, 0x00, 0x0C, 0x0C, 0x38, 0x18),  # byte_A54B (pose 1)
    (0x00, 0x04, 0x0C, 0x3C, 0x18, 0x08),  # byte_A551 (pose 2)
    (0x00, 0x00, 0x04, 0x7C, 0x7C, 0x00),  # byte_A557 (pose 3)
    (0x00, 0x00, 0x14, 0x7C, 0x7C, 0x00),  # byte_A55D (pose 4)
    (0x00, 0x20, 0x24, 0x7C, 0x7C, 0x00),  # byte_A563 (pose 5)
    (0x00, 0x00, 0x04, 0x7C, 0x7C, 0x00),  # byte_A557 again (pose 6, shared with pose 3)
    (0x00, 0x00, 0x30, 0x7C, 0x7C, 0x00),  # byte_A569 (pose 7)
    (0x00, 0x20, 0x70, 0x7C, 0x7C, 0x08),  # byte_A56F (pose 8)
    (0x60, 0x60, 0x70, 0x7C, 0x7C, 0x00),  # byte_A575 (pose 9)
    (0x00, 0xE0, 0xE0, 0x7C, 0x7C, 0x00),  # byte_A57B (pose 10 / 0x0A)
]


def compute_mao1_pose_layout(pose_idx):
    """
    Reproduce Mao1_AI_proc's per-pose body layout walk (loc_A290's
    outer/inner loop over 6 columns x 8 rows) for a single pose (0..10),
    returning a static snapshot: a list of (col, row, tile_group, anim_idx)
    for every currently-visible body-part segment.

    Note: in the original game the mask byte is rotated in place and that
    rotation persists across frames, and poses 3 and 6 share the exact same
    physical mask byte (byte_A557 -- see MAO1_SHAPE_BASES). For this static
    reference sheet we instead start from a fresh copy of the pose's base
    mask, exactly as compute_tako_phase_layout / compute_akma_body_layout do.
    """
    layout_pairs = MAO1_LAYOUT_TABLES[pose_idx]
    mask = list(MAO1_SHAPE_BASES[pose_idx])
    pair_iter = iter(layout_pairs)
    placements = []

    for col in range(6):
        b = mask[col]
        for row in range(8):
            carry = (b & 0x80) != 0
            b = ((b << 1) | (1 if carry else 0)) & 0xFF
            if carry:
                try:
                    tile_group, anim_idx = next(pair_iter)
                except StopIteration:
                    break
                placements.append((col, row, tile_group, anim_idx))

    return placements


def render_mao1_group(data, canvas, y_offset):
    """
    Jashiin boss, room 1 (mao1.grp).

    Unlike the fighting bosses, this is a pure cutscene -- Mao1_AI_proc has
    no hit-detection pass and boss_hp is never touched (see mao1.c); it just
    plays a scripted idle-animation timeline that walks through 11 body
    poses and pops the occasional dialog box.

    Part 1 assembles the actual boss body (6 columns x 8 rows) for each of
    the 11 poses, exactly as Mao1_AI_proc lays it out from
    MAO1_LAYOUT_TABLES / MAO1_SHAPE_BASES, using each placement's
    tile_group to pick the right MAO1_FRAMES set and anim_idx to pick the
    frame within it.

    Part 2 is a plain browser over every raw frame set, same pattern as
    render_tako_group/render_akma_group.
    """
    TILE_SIZE = 32
    scale = 3
    current_y = y_offset
    gap_x = 0
    gap_y = 8
    sprite_px = 16
    frames_per_row = 16

    tiles_raw = data + b'\x00' * (256 * TILE_SIZE)

    # -----------------------------------------------------------------------
    # Part 1: Render Composite Jashiin Body (11 poses)
    # -----------------------------------------------------------------------
    # Mao1_AI_proc advances both column and row by 2 world-tile units per
    # step (col_x += 2 per column; currY = boss_y + row*2), and the game's
    # base map tile is 8px -- not 16 -- so each grid step here is
    # 2 * 8px = 16px, which lands pieces edge-to-edge rather than
    # overlapping (unlike Akma's 1-unit/8px-per-column step, which
    # deliberately overlaps its 16x16 pieces). Deriving the step from the
    # 8px world-tile size instead of hardcoding 16 keeps this consistent
    # with how the engine actually places these pieces on the 8px
    # proximity map.
    WORLD_TILE_PX = 8
    COL_STEP_UNITS = 2
    ROW_STEP_UNITS = 2
    GRID_STEP_X = COL_STEP_UNITS * WORLD_TILE_PX  # 16
    GRID_STEP_Y = ROW_STEP_UNITS * WORLD_TILE_PX  # 16

    body_scale = 2
    cols, rows = 6, 8
    block_w = ((cols - 1) * GRID_STEP_X + 16) * body_scale
    block_h = ((rows - 1) * GRID_STEP_Y + 16) * body_scale
    poses_per_row = 4
    body_gap_x, body_gap_y = 16, 24

    for pose_idx in range(11):
        col_idx = pose_idx % poses_per_row
        row_idx = pose_idx // poses_per_row
        x_base = 10 + col_idx * (block_w + body_gap_x)
        y_base = current_y + row_idx * (block_h + body_gap_y)

        canvas.create_rectangle(x_base - 1, y_base - 1, x_base + block_w, y_base + block_h, outline="gray")
        canvas.create_text(x_base + 4, y_base - 10, text=f"pose {pose_idx}",
                            anchor="nw", fill="white", font=("TkDefaultFont", 7))

        for gcol, grow, tile_group, anim_idx in compute_mao1_pose_layout(pose_idx):
            set_name = MAO1_FRAME_SET_BY_INDEX.get(tile_group)
            if set_name is None:
                continue
            frames = MAO1_FRAMES[set_name]
            if anim_idx >= len(frames):
                continue
            draw_composed_16x16_frame(canvas, frames[anim_idx], tiles_raw,
                                       x_base + gcol * GRID_STEP_X * body_scale,
                                       y_base + grow * GRID_STEP_Y * body_scale,
                                       body_scale)

    num_body_rows = (11 + poses_per_row - 1) // poses_per_row
    current_y += num_body_rows * (block_h + body_gap_y) + 24

    # -----------------------------------------------------------------------
    # Part 2: Render every raw frame set
    # -----------------------------------------------------------------------
    n = 0
    for set_name, frames in MAO1_FRAMES.items():
        current_y += 20

        for f_idx, frame_data in enumerate(frames):
            x_frame = 10 + (f_idx % frames_per_row) * (sprite_px * scale + gap_x)
            y_frame = current_y + (f_idx // frames_per_row) * (sprite_px * scale + gap_y)

            canvas.create_text(x_frame + 8, y_frame - 8, text=f"{n}",
                                fill="white", font=("TkDefaultFont", 7))
            n += 1
            canvas.create_rectangle(x_frame, y_frame, x_frame + sprite_px * scale,
                                     y_frame + sprite_px * scale, fill="#8c38ff", outline="")
            draw_composed_16x16_frame(canvas, frame_data, tiles_raw, x_frame, y_frame, scale)

        num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
        current_y += num_rows * (sprite_px * scale + gap_y) + 12

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

        tk.Button(toolbar, text="Open *.grp", command=self.on_open_click).pack(side=tk.LEFT)
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

    def on_open_click(self):
        path = filedialog.askopenfilename(filetypes=[("Zeliard GRP", "*.grp"), ("All Files", "*.*")])
        if path:
            self.load_file(path)


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
                consumed = render_crab_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Monsters/Items Sprites")
            elif modes == 14:
                consumed = render_tako_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Monsters/Items Sprites")
            elif modes == 15:
                consumed = render_tori_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Monsters/Items Sprites")
            elif modes == 16:
                consumed = render_zela_group(data, self.canvas, y_cursor, layout=ZELA_FRAMES)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Monsters/Items Sprites")
            elif modes == 17:
                consumed = render_meda_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Monsters/Items Sprites")
            elif modes == 18:
                consumed = render_lega_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Monsters/Items Sprites")
            elif modes == 19:
                consumed = render_drgn_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Dragon Boss Sprites")
            elif modes == 20:
                consumed = render_zela_group(data, self.canvas, y_cursor, layout=ZELA2_FRAMES)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Monsters/Items Sprites")
            elif modes == 21:
                consumed = render_akma_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Akma (Alguien) Boss Sprites")
            elif modes == 22:
                consumed = render_mao1_group(data, self.canvas, y_cursor)
                self.canvas.config(scrollregion=(0, 0, 1200, y_cursor + consumed + 40))
                self.info_label.config(text=f"File: {filename} | Mao1 (Jashiin) Boss Sprites")
            else:
                return
            return

if __name__ == "__main__":
    app = tk.Tk()
    app.geometry("1100x800")
    GrpViewer(app)
    app.mainloop()
