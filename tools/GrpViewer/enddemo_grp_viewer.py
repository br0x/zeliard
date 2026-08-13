#!/usr/bin/env python3
"""
grp_viewer.py - Viewer for Zeliard .grp graphics resources
=============================================================

Full pipeline, reverse engineered from STICK.ASM (VFS/resource loader)
and GDMCGA.ASM (MCGA 13h graphics driver), and validated against a real
file (yuup.grp decodes to a recognizable portrait - see notes below).

Pipeline (this is the real, verified chain - three stages):

  1. VFS header strip (fn2_segmented_load in STICK.ASM)
     The raw .grp file starts with a 1-byte flag:
       - flag == 0: the rest of the file (byte 1 onward) is the payload.
       - flag != 0: dual EGA/VGA file. Next 4 bytes are two 16-bit sizes
         (ega_size, vga_size). The EGA block (ega_size bytes) is skipped;
         the VGA/MCGA block (vga_size bytes) that follows is the payload.
         (This driver is MCGA-only, so we always take the VGA branch.)

  2. VFS decompressor (unpack_dispatcher in STICK.ASM)
     The payload's first byte's low 3 bits select 1 of 8 RLE-family
     methods (0=raw copy, 1-4=nibble lookup-table/inline-marker RLE,
     5=byte-pair RLE, 6=word-sentinel-table RLE, 7=3-byte-run RLE).
     Ported directly from the disassembly.

  3. Graphics-specific unscramble (sub_696D in GDMCGA.ASM, used for
     every .grp load in ENDDEMO.ASM)
     Two-stage bit-level unscramble (sub_6972 zero/literal RLE bitmap,
     then a differential 2-bit-group unpacker). Output is the actual
     "3-plane" pixel buffer.

  4. 3-plane -> pixel decode (Decompress_3Plane_Interleaved /
     Decompress_And_Copy_To_VRAM in GDMCGA.ASM)
     3 sub-planes of CH*CL bytes each (back to back in the stage-3
     output) are bit-interleaved via Decompress_3Plane_To_2bpp into a
     row-major pixel buffer, CH*4 bytes wide, CL rows tall, ONE BYTE
     PER PIXEL (this was confirmed by the successful yuup.grp decode -
     earlier guesses about nibble-packed pixels were wrong).

What still is NOT in the file
-------------------------------
  - Width/height (CH/CL): these are immediates at each call site in
    ENDDEMO.ASM (e.g. "mov cx, 1858h" -> CH=18h, CL=58h), not stored in
    the .grp. You must enter them (see the script's comments/call sites
    for the specific image you're viewing). CH=0x18, CL=0x58 is the
    confirmed value for yuup.grp.
  - Palette: the VGA DAC palette is set up elsewhere (GDMCGA_Fade_Palette
    et al), not stored in the .grp. Defaults to grayscale; load a real
    palette or edit swatches once you know the right colors.

Requires: Pillow (pip install pillow). Tkinter ships with standard Python.
"""

import os
import struct
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, colorchooser

try:
    from PIL import Image, ImageTk
except ImportError:
    raise SystemExit("This tool needs Pillow: pip install pillow")


# ---------------------------------------------------------------------------
# Stage 1: VFS header strip (fn2_segmented_load, STICK.ASM)
# ---------------------------------------------------------------------------

def vfs_strip_header(data):
    """Returns (payload_bytes, note_string)."""
    if not data:
        return b"", "empty file"
    flag = data[0]
    if flag == 0:
        return data[1:], "flag byte 0x00 -> simple file, payload = bytes[1:]"
    if len(data) < 5:
        return data[1:], "flag byte nonzero but file too short for dual header; best-effort"
    ega_size, vga_size = struct.unpack_from("<HH", data, 1)
    start = 5 + ega_size
    end = start + vga_size
    payload = data[start:end]
    note = (f"flag byte 0x{flag:02x} -> dual EGA/VGA file "
            f"(ega_size={ega_size}, vga_size={vga_size}); using VGA/MCGA block")
    return payload, note


# ---------------------------------------------------------------------------
# Stage 2: VFS decompressor (unpack_dispatcher, STICK.ASM)
# ---------------------------------------------------------------------------

def unpack(src: bytes) -> bytes:
    """Ported directly from STICK.ASM's unpack_dispatcher and its 8 methods."""
    if not src:
        return b""
    si = 0
    out = bytearray()
    dx = len(src)

    def lodsb():
        nonlocal si
        b = src[si]
        si += 1
        return b

    def lodsw():
        nonlocal si
        lo = src[si]
        hi = src[si + 1]
        si += 2
        return lo | (hi << 8)

    def stosb_rep(b, count):
        out.extend([b] * count)

    method = lodsb() & 0x07
    dx -= 1

    if method == 0:
        out.extend(src[si:si + dx])
    elif method == 1:
        bp = si
        while lodsb() != 0xFF:
            si += 1
        dx = len(src) - si
        while dx > 0:
            al = lodsb(); dx -= 1; ah = al & 0xF0; cx = 1; tbp = bp
            while True:
                entry_key = src[tbp]
                if (entry_key & 0x0F) != 0:
                    break
                if ah == entry_key:
                    cx = (al & 0x0F) + 2; al = src[tbp + 1]; break
                tbp += 2
            stosb_rep(al, cx)
    elif method == 2:
        marker = lodsb(); dx -= 1; ah = marker
        while dx > 0:
            al = lodsb(); dx -= 1; cx = 1
            if (al & 0xF0) == ah:
                cx = (al & 0x0F) + 3; al = lodsb(); dx -= 1
            stosb_rep(al, cx)
    elif method == 3:
        bp = si
        while lodsb() != 0xFF:
            si += 1
        dx = len(src) - si
        while dx > 0:
            al = lodsb(); dx -= 1; ah = al & 0x0F; cx = 1; tbp = bp
            while True:
                entry_key = src[tbp]
                if (entry_key & 0xF0) != 0:
                    break
                if ah == entry_key:
                    cx = (al >> 4) + 2; al = src[tbp + 1]; break
                tbp += 2
            stosb_rep(al, cx)
    elif method == 4:
        marker = lodsb(); dx -= 1; ah = marker
        while dx > 0:
            al = lodsb(); dx -= 1; cx = 1
            if (al & 0x0F) == ah:
                cx = (al >> 4) + 3; al = lodsb(); dx -= 1
            stosb_rep(al, cx)
    elif method == 5:
        while dx > 0:
            al = lodsb(); cx = 1
            if si < len(src) and src[si] == al:
                cx = src[si + 1] + 2; si += 2; dx -= 2
            stosb_rep(al, cx); dx -= 1
    elif method == 6:
        bp = si
        while lodsw() != 0xFFFF:
            pass
        dx = len(src) - si
        while dx > 0:
            al = lodsb(); dx -= 1; cx = 1; tbp = bp
            while True:
                tl = src[tbp]; th = src[tbp + 1]
                if tl == 0xFF and th == 0xFF:
                    break
                if tl == al:
                    dx -= 1; cx = lodsb() + 2; al = th; break
                tbp += 2
            stosb_rep(al, cx)
    elif method == 7:
        ah = lodsb(); dx -= 1
        while dx > 0:
            al = lodsb(); cx = 1
            if al == ah:
                al = lodsb(); cx = lodsb() + 3; dx -= 2
            stosb_rep(al, cx); dx -= 1

    return bytes(out)


# ---------------------------------------------------------------------------
# Stage 3: graphics unscramble (sub_696D = sub_6972 + loc_699C, GDMCGA.ASM)
# ---------------------------------------------------------------------------

def _sub_6972(data, pos=0):
    """Zero/literal RLE expansion. Returns (output_bytes, bytes_consumed)."""
    n = struct.unpack_from('<H', data, pos)[0]
    pos += 2
    ctrl = data[pos:pos + n]
    lit_pos = pos + n
    out = bytearray()
    for cb in ctrl:
        cb &= 0xFF
        for _ in range(8):
            bit = (cb >> 7) & 1
            cb = ((cb << 1) & 0xFF) | bit
            if bit == 0:
                out.append(0)
            else:
                out.append(data[lit_pos] if lit_pos < len(data) else 0)
                lit_pos += 1
    return bytes(out), lit_pos


def _loc_699c(buf):
    """Differential 2-bit-group unpacker (persistent XOR state across the
    whole buffer). Verified against a cycle-accurate flag emulation."""
    out = bytearray(len(buf))
    dh = 0
    for i, byte_in in enumerate(buf):
        val = byte_in
        ah = 0
        for grp in range(4):
            al = 0
            for _ in range(2):
                bit = (val >> 7) & 1
                val = (val << 1) & 0xFF
                al = ((al << 1) | bit) & 0xFF
            dh ^= al
            if grp == 0:
                ah = dh
            else:
                ah = ((ah << 2) & 0xFF) | dh
        out[i] = ah & 0xFF
    return bytes(out)


def sub_696d(data):
    stage1, consumed = _sub_6972(data, 0)
    stage2 = _loc_699c(stage1)
    return stage2, consumed


# ---------------------------------------------------------------------------
# Stage 4: 3-plane -> pixels (Decompress_3Plane_To_2bpp + friends, GDMCGA.ASM)
# ---------------------------------------------------------------------------

def _rol16(v):
    bit = (v >> 15) & 1
    return ((v << 1) & 0xFFFF) | bit, bit


def _decompress_3plane_to_2bpp(planes):
    ax = 0
    for _ in range(2):
        for _ in range(2):
            for key in ('p3', 'p2', 'p1', 'p0'):
                planes[key], bit = _rol16(planes[key])
                ax = ((ax << 1) | bit) & 0xFFFF
    return ax


def _word_at(buf, off):
    b0 = buf[off] if off < len(buf) else 0
    b1 = buf[off + 1] if off + 1 < len(buf) else 0
    return (b0 << 8) | b1


def decode_interleaved(data, ch, cl):
    """Decompress_3Plane_Interleaved / Decompress_And_Copy_To_VRAM.
    Returns (pixel_bytes, width, height); one byte per pixel."""
    bp = ch * cl
    need = 3 * bp
    if need == 0:
        return b"", 0, 0
    data = data + bytes(max(0, need - len(data)))
    p0src, p1src, p2src = data[0:bp], data[bp:2 * bp], data[2 * bp:3 * bp]
    out = bytearray()
    n_words = bp // 2
    for i in range(n_words):
        off = i * 2
        planes = {'p0': _word_at(p0src, off), 'p1': _word_at(p1src, off),
                  'p2': _word_at(p2src, off), 'p3': 0}
        for _ in range(4):
            ax = _decompress_3plane_to_2bpp(planes)
            out.append((ax >> 8) & 0xFF)
            out.append(ax & 0xFF)
    return bytes(out), ch * 4, cl


def decode_2row(data, ch, cl):
    """Decompress_3Plane_2Row: only plane0 & plane3 active (p1=p2=0)."""
    bp = ch * cl
    need = 2 * bp
    if need == 0:
        return b"", 0, 0
    data = data + bytes(max(0, need - len(data)))
    p0src, p3src = data[0:bp], data[bp:2 * bp]
    out = bytearray()
    n_words = bp // 2
    for i in range(n_words):
        off = i * 2
        planes = {'p0': _word_at(p0src, off), 'p1': 0,
                  'p2': 0, 'p3': _word_at(p3src, off)}
        for _ in range(4):
            ax = _decompress_3plane_to_2bpp(planes)
            out.append((ax >> 8) & 0xFF)
            out.append(ax & 0xFF)
    return bytes(out), ch * 4, cl


# ---------------------------------------------------------------------------
# Palettes
# ---------------------------------------------------------------------------

def grayscale256():
    return [(i, i, i) for i in range(256)]


def ega16_padded():
    ega = [
        (0, 0, 0), (0, 0, 170), (0, 170, 0), (0, 170, 170),
        (170, 0, 0), (170, 0, 170), (170, 85, 0), (170, 170, 170),
        (85, 85, 85), (85, 85, 255), (85, 255, 85), (85, 255, 255),
        (255, 85, 85), (255, 85, 255), (255, 255, 85), (255, 255, 255),
    ]
    return [ega[i % 16] for i in range(256)]


def load_raw_palette(path):
    with open(path, 'rb') as f:
        raw = f.read()
    if len(raw) < 3:
        raise ValueError("Palette file too small")
    n = len(raw) // 3
    vals = struct.unpack(f"<{n*3}B", raw[:n * 3])
    scale = 4 if max(vals) <= 63 else 1  # VGA DAC is 6-bit (0-63) per channel
    pal = []
    for i in range(n):
        r, g, b = vals[i * 3:i * 3 + 3]
        pal.append((min(255, r * scale), min(255, g * scale), min(255, b * scale)))
    return pal


def load_jasc_pal(path):
    with open(path, 'r', errors='ignore') as f:
        lines = [l.strip() for l in f if l.strip()]
    if not lines or lines[0].upper() != 'JASC-PAL':
        raise ValueError("Not a JASC-PAL file")
    count = int(lines[2])
    pal = []
    for line in lines[3:3 + count]:
        r, g, b = (int(x) for x in line.split()[:3])
        pal.append((r, g, b))
    return pal


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------

class GrpViewer(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Zeliard GRP Viewer")
        self.geometry("1040x700")

        self.raw_data = b""
        self.palette = grayscale256()
        self.mode = tk.StringVar(value="interleaved")
        self.zoom = tk.IntVar(value=3)
        self.ch_var = tk.StringVar(value="0x18")
        self.cl_var = tk.StringVar(value="0x58")
        self.use_vfs_unpack = tk.BooleanVar(value=True)
        self.use_sub696d = tk.BooleanVar(value=True)
        self.pil_image = None
        self.tk_image = None

        self._build_menu()
        self._build_layout()

    def _build_menu(self):
        m = tk.Menu(self)
        filem = tk.Menu(m, tearoff=0)
        filem.add_command(label="Open .grp...", command=self.open_grp)
        filem.add_command(label="Save decoded image as PNG...", command=self.save_png)
        filem.add_separator()
        filem.add_command(label="Load palette (raw 768-byte RGB)...", command=self.load_palette_raw)
        filem.add_command(label="Load palette (.pal, JASC-PAL)...", command=self.load_palette_jasc)
        filem.add_separator()
        filem.add_command(label="Exit", command=self.destroy)
        m.add_cascade(label="File", menu=filem)
        self.config(menu=m)

    def _build_layout(self):
        root = ttk.Frame(self)
        root.pack(fill=tk.BOTH, expand=True)

        side = ttk.Frame(root, padding=8)
        side.pack(side=tk.LEFT, fill=tk.Y)

        ttk.Label(side, text="File:").pack(anchor="w")
        self.file_label = ttk.Label(side, text="(none loaded)", wraplength=240, foreground="#555")
        self.file_label.pack(anchor="w", pady=(0, 8))
        ttk.Button(side, text="Open .grp...", command=self.open_grp).pack(fill=tk.X)

        ttk.Separator(side).pack(fill=tk.X, pady=8)
        ttk.Label(side, text="Pipeline stages", font=("", 9, "bold")).pack(anchor="w")
        ttk.Checkbutton(side, text="1-2: VFS header strip + unpack_dispatcher",
                         variable=self.use_vfs_unpack, command=self.redecode).pack(anchor="w")
        ttk.Checkbutton(side, text="3: sub_696D graphics unscramble",
                         variable=self.use_sub696d, command=self.redecode).pack(anchor="w")
        ttk.Label(side, text="(both ON is the verified default pipeline;\n"
                              "turn off to inspect intermediate stages)",
                  foreground="#777", wraplength=240, justify="left").pack(anchor="w", pady=(2, 0))

        ttk.Separator(side).pack(fill=tk.X, pady=8)
        ttk.Label(side, text="4: 3-plane decode mode").pack(anchor="w")
        ttk.Radiobutton(side, text="Interleaved (3-plane) - normal images",
                         variable=self.mode, value="interleaved", command=self.redecode).pack(anchor="w")
        ttk.Radiobutton(side, text="2-Row (2-plane) - some sprite/tile assets",
                         variable=self.mode, value="2row", command=self.redecode).pack(anchor="w")

        ttk.Separator(side).pack(fill=tk.X, pady=8)
        ttk.Label(side, text="CH (call-site CX high byte)").pack(anchor="w")
        ttk.Entry(side, textvariable=self.ch_var, width=10).pack(anchor="w")
        ttk.Label(side, text="CL (call-site CX low byte)").pack(anchor="w")
        ttk.Entry(side, textvariable=self.cl_var, width=10).pack(anchor="w")
        ttk.Label(side, text="e.g. \"mov cx, 1858h\" -> CH=0x18, CL=0x58\n"
                              "(yuup.grp's confirmed value)",
                  foreground="#777", wraplength=240, justify="left").pack(anchor="w", pady=(2, 4))
        ttk.Button(side, text="Auto-guess dimensions", command=self.auto_guess).pack(fill=tk.X, pady=(2, 2))
        ttk.Button(side, text="Decode", command=self.redecode).pack(fill=tk.X)

        ttk.Separator(side).pack(fill=tk.X, pady=8)
        ttk.Label(side, text="Palette").pack(anchor="w")
        pal_row = ttk.Frame(side)
        pal_row.pack(fill=tk.X)
        ttk.Button(pal_row, text="Grayscale", command=lambda: self.set_palette(grayscale256())).pack(side=tk.LEFT, expand=True, fill=tk.X)
        ttk.Button(pal_row, text="EGA-ish", command=lambda: self.set_palette(ega16_padded())).pack(side=tk.LEFT, expand=True, fill=tk.X)
        ttk.Button(side, text="Edit low-16 swatches...", command=self.edit_palette).pack(fill=tk.X, pady=(4, 0))

        ttk.Separator(side).pack(fill=tk.X, pady=8)
        ttk.Label(side, text="Zoom").pack(anchor="w")
        ttk.Scale(side, from_=1, to=8, variable=self.zoom, orient=tk.HORIZONTAL,
                  command=lambda e: self.render()).pack(fill=tk.X)

        ttk.Separator(side).pack(fill=tk.X, pady=8)
        self.info_label = ttk.Label(side, text="", foreground="#333", wraplength=240, justify="left")
        self.info_label.pack(anchor="w")

        ttk.Button(side, text="Save PNG...", command=self.save_png).pack(fill=tk.X, pady=(12, 0))

        canvas_frame = ttk.Frame(root)
        canvas_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.canvas = tk.Canvas(canvas_frame, bg="#202020")
        hbar = ttk.Scrollbar(canvas_frame, orient=tk.HORIZONTAL, command=self.canvas.xview)
        vbar = ttk.Scrollbar(canvas_frame, orient=tk.VERTICAL, command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=hbar.set, yscrollcommand=vbar.set)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        vbar.grid(row=0, column=1, sticky="ns")
        hbar.grid(row=1, column=0, sticky="ew")
        canvas_frame.rowconfigure(0, weight=1)
        canvas_frame.columnconfigure(0, weight=1)

    @staticmethod
    def _parse_int(text):
        text = text.strip()
        if text.lower().startswith("0x"):
            return int(text, 16)
        return int(text)

    def open_grp(self):
        path = filedialog.askopenfilename(
            title="Open .grp file",
            filetypes=[("GRP resource", "*.grp"), ("All files", "*.*")])
        if not path:
            return
        with open(path, "rb") as f:
            self.raw_data = f.read()
        self.file_label.config(text=f"{os.path.basename(path)}  ({len(self.raw_data)} bytes)")
        self.redecode()

    def _run_pipeline(self):
        data = self.raw_data
        notes = []
        if self.use_vfs_unpack.get():
            payload, note = vfs_strip_header(data)
            notes.append(note)
            data = unpack(payload)
            notes.append(f"VFS unpack -> {len(data)} bytes")
        if self.use_sub696d.get():
            data, consumed = sub_696d(data)
            notes.append(f"sub_696D -> {len(data)} bytes (consumed {consumed} input bytes)")
        return data, notes

    def auto_guess(self):
        if not self.raw_data:
            messagebox.showinfo("Auto-guess", "Load a .grp file first.")
            return
        data, notes = self._run_pipeline()
        n = len(data)
        divisor = 3 if self.mode.get() == "interleaved" else 2
        if n % divisor != 0:
            messagebox.showinfo("Auto-guess",
                                 f"Decoded stage-3 buffer is {n} bytes, not a multiple of "
                                 f"{divisor}; can't cleanly factor for this mode.")
            return
        bp = n // divisor
        candidates = []
        for ch in range(1, int(bp ** 0.5) + 2):
            if bp % ch != 0:
                continue
            cl = bp // ch
            for a, b in ((ch, cl), (cl, ch)):
                w, h = a * 8, b
                score = (10 if w <= 320 and h <= 200 else 0) - abs(w - h * 1.6)
                candidates.append((score, a, b))
        if not candidates:
            messagebox.showinfo("Auto-guess", "No integer factor pair found.")
            return
        candidates.sort(key=lambda t: -t[0])
        _, ch, cl = candidates[0]
        self.ch_var.set(hex(ch))
        self.cl_var.set(hex(cl))
        self.redecode()

    def redecode(self):
        if not self.raw_data:
            return
        try:
            ch = self._parse_int(self.ch_var.get())
            cl = self._parse_int(self.cl_var.get())
        except ValueError:
            messagebox.showerror("Bad input", "CH/CL must be integers (decimal or 0x-hex).")
            return
        if ch <= 0 or cl <= 0:
            messagebox.showerror("Bad input", "CH/CL must be positive.")
            return

        try:
            data, notes = self._run_pipeline()
        except Exception as e:
            messagebox.showerror("Pipeline error", f"Failed decoding stages 1-3: {e}")
            return

        if self.mode.get() == "interleaved":
            pixels, width, height = decode_interleaved(data, ch, cl)
            needed = 3 * ch * cl
        else:
            pixels, width, height = decode_2row(data, ch, cl)
            needed = 2 * ch * cl

        self._last_pixels = pixels
        self._last_size = (width, height)
        self.build_image()

        avail = len(data)
        note = "" if avail >= needed else f"  (short by {needed - avail} bytes, zero-padded)"
        self.info_label.config(
            text=f"Decoded {width}x{height} px\n"
                 f"mode={self.mode.get()}  CH={ch} CL={cl}\n"
                 f"stage-3 buffer needs {needed}, has {avail}{note}\n\n"
                 + "\n".join(notes))

    def build_image(self):
        pixels, (w, h) = self._last_pixels, self._last_size
        if w == 0 or h == 0:
            return
        img = Image.frombytes("P", (w, h), bytes(pixels))
        flat_pal = []
        for i in range(256):
            c = self.palette[i] if i < len(self.palette) else (0, 0, 0)
            flat_pal.extend(c)
        img.putpalette(flat_pal)
        self.pil_image = img.convert("RGB")
        self.render()

    def render(self):
        if self.pil_image is None:
            return
        z = max(1, int(self.zoom.get()))
        w, h = self.pil_image.size
        disp = self.pil_image.resize((w * z, h * z), Image.NEAREST)
        self.tk_image = ImageTk.PhotoImage(disp)
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor="nw", image=self.tk_image)
        self.canvas.configure(scrollregion=(0, 0, w * z, h * z))

    def set_palette(self, pal):
        self.palette = pal
        self.build_image()

    def load_palette_raw(self):
        path = filedialog.askopenfilename(title="Open raw RGB palette",
                                           filetypes=[("Palette", "*.pal;*.bin;*.raw"), ("All files", "*.*")])
        if not path:
            return
        try:
            self.set_palette(load_raw_palette(path))
        except Exception as e:
            messagebox.showerror("Palette load failed", str(e))

    def load_palette_jasc(self):
        path = filedialog.askopenfilename(title="Open JASC-PAL palette",
                                           filetypes=[("JASC Palette", "*.pal"), ("All files", "*.*")])
        if not path:
            return
        try:
            self.set_palette(load_jasc_pal(path))
        except Exception as e:
            messagebox.showerror("Palette load failed", str(e))

    def edit_palette(self):
        win = tk.Toplevel(self)
        win.title("Edit palette swatches (first 16 entries)")
        while len(self.palette) < 16:
            self.palette.append((0, 0, 0))
        for i in range(16):
            r, c = divmod(i, 4)
            color = self.palette[i]

            def pick(idx=i):
                cur = self.palette[idx]
                hexcur = '#%02x%02x%02x' % cur
                result = colorchooser.askcolor(color=hexcur, title=f"Color {idx}")
                if result and result[0]:
                    rgb = tuple(int(v) for v in result[0])
                    self.palette[idx] = rgb
                    btn.configure(bg='#%02x%02x%02x' % rgb)
                    self.build_image()

            hexcolor = '#%02x%02x%02x' % color
            btn = tk.Button(win, width=6, height=2, bg=hexcolor, command=pick)
            btn.grid(row=r, column=c, padx=3, pady=3)
            tk.Label(win, text=str(i)).grid(row=r, column=c, sticky="se")

    def save_png(self):
        if self.pil_image is None:
            messagebox.showinfo("Nothing to save", "Decode a file first.")
            return
        path = filedialog.asksaveasfilename(defaultextension=".png",
                                             filetypes=[("PNG image", "*.png")])
        if not path:
            return
        self.pil_image.save(path)
        messagebox.showinfo("Saved", f"Saved to {path}")


if __name__ == "__main__":
    app = GrpViewer()
    app.mainloop()
