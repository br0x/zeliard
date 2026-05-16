"""
Zeliard Sprite Editor - Main application (v0.5 - animation/transparency support).
"""

import os
import json
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
from collections import Counter, defaultdict
from typing import Optional, List

from .constants import PALETTE, TOWN_HEIGHT, _MONSTER_TYPE_NAMES, get_map_type_info, _ptr_off_safe
from .models import MdtData
from .decoder import decode_mdt_file, is_town_mdt
from .widgets import Tooltip, InfoBox, ScrollFrame
from PIL import Image, ImageTk

class MDTViewer(tk.Tk):
    """Main Sprite Editor application window."""

    # Color scheme (Catppuccin-inspired)
    C_BG0 = '#0a0a10'
    C_BG1 = '#11111b'
    C_BG2 = '#181825'
    C_BG3 = '#1e1e2e'
    C_PANEL = '#24243a'
    C_SURF = '#313244'
    C_FG = '#cdd6f4'
    C_DIM = '#6c7086'
    C_BLUE = '#89b4fa'
    C_GREEN = '#a6e3a1'
    C_RED = '#f38ba8'
    C_YELL = '#f9e2af'
    C_CYAN = '#89dceb'
    C_PINK = '#f5c2e7'

    BLK_MIN = 2
    BLK_MAX = 72
    BLK_DEF = 8

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

    def __init__(self):
        super().__init__()
        self.title('Zeliard Sprite Editor v0.4')
        self.geometry('1400x880')
        self.minsize(980, 660)
        self.configure(bg=self.C_BG2)

        self.block_size = self.BLK_DEF
        self.mdt: Optional[MdtData] = None
        self.current_file: Optional[str] = None
        self.file_data: Optional[bytes] = None
        self.show_overlay = tk.BooleanVar(value=True)
        self.show_tile_ids = tk.BooleanVar(value=False)
        self.overlay_ids: List[int] = []
        self.tile_id_overlay_ids: List[int] = []
        self.hover_txt = tk.StringVar()
        self.tooltip: Optional[Tooltip] = None
        self.tile_images = {}          # Cache for scaled GRP PhotoImages
        self.source_tile_candidates = None   # dict tile_id -> list of PIL Images
        self.source_tile_selections = {}     # tile_id -> chosen candidate index
        self.source_tile_cache = {}          # cache for scaled source PhotoImages
        self.candidate_labels = {}           # dict (tile_id, idx) -> Label widget
        self.candidate_frames = {}           # dict (tile_id, idx) -> Frame widget (for border)
        self.show_checkerboard = tk.BooleanVar(value=True)
        self._checker_cache = {}           # size -> PIL Image
        self.CHECKER_LIGHT = '#aaaaaa'     # light gray square
        self.CHECKER_DARK  = '#666666'     # dark gray square
        self.CHECKER_CELL  = 4             # cell size in px (at native 8px tile)

        # ---- NEW: persistence attributes ----
        self.selections_dirty = False
        self.selections_file_path = None
        self.source_image_path = None
        self.source_tile_size = None
        # ------------------------------------

        self._build_ui()
        # Intercept window close
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ── UI Construction ───────────────────────────────────────────────────────
    def _build_ui(self):
        """Build the complete UI."""
        self._build_toolbar()
        self._build_body()

    def _build_toolbar(self):
        """Build the top toolbar."""
        tb = tk.Frame(self, bg=self.C_BG0, height=46)
        tb.pack(fill='x')
        tb.pack_propagate(False)

        def btn(text, cmd, fg=None, px=10):
            b = tk.Button(
                tb, text=text, command=cmd,
                bg=self.C_SURF, fg=fg or self.C_FG,
                activebackground='#45475a', activeforeground=self.C_FG,
                relief='flat', bd=0, cursor='hand2',
                font=('Consolas', 9), padx=px, pady=7)
            b.pack(side='left', padx=2, pady=6)
            return b

        def sep():
            tk.Frame(tb, bg=self.C_SURF, width=1).pack(
                side='left', fill='y', pady=8, padx=5)

        btn('Open', self.open_file).pack(side='left', padx=(8, 2), pady=6)
        sep()
        btn('Save PNG', self.save_png, fg=self.C_GREEN)
        btn('Save TXT', self.save_txt, fg=self.C_BLUE)
        sep()

        # ─── Source image buttons ────────────────────────────
        btn('Load Source', self.load_source_image, fg=self.C_CYAN)
        btn('Load TileSheet', self.load_tilesheet, fg=self.C_CYAN)
        btn('Clear Source', self.clear_source_data, fg=self.C_RED)
        btn('Load Anim', self.load_animation, fg=self.C_YELL)     # NEW
        sep()

        self.ov_btn = tk.Button(
            tb, text='Overlay  ON', command=self._toggle_overlay,
            bg='#2a2a45', fg=self.C_YELL,
            activebackground='#45475a', activeforeground=self.C_FG,
            relief='flat', bd=0, cursor='hand2',
            font=('Consolas', 9), padx=10, pady=7)
        self.ov_btn.pack(side='left', padx=2, pady=6)

        self.tid_btn = tk.Button(
            tb, text='Tile IDs  OFF', command=self._toggle_tile_ids,
            bg='#2a2a45', fg=self.C_YELL if self.show_tile_ids.get() else self.C_DIM,
            activebackground='#45475a', activeforeground=self.C_FG,
            relief='flat', bd=0, cursor='hand2',
            font=('Consolas', 9), padx=10, pady=7)
        self.tid_btn.pack(side='left', padx=2, pady=6)

        self.chk_btn = tk.Button(
            tb, text='Checker  ON', command=self._toggle_checkerboard,
            bg='#2a2a45', fg=self.C_YELL,
            activebackground='#45475a', activeforeground=self.C_FG,
            relief='flat', bd=0, cursor='hand2',
            font=('Consolas', 9), padx=10, pady=7)
        self.chk_btn.pack(side='left', padx=2, pady=6)
        sep()

        tk.Label(tb, text='Zoom', bg=self.C_BG0, fg=self.C_DIM,
                 font=('Consolas', 8)).pack(side='left', padx=(2, 0))
        btn('-', self.zoom_out, fg=self.C_RED, px=8)
        self.zoom_lbl = tk.Label(
            tb, text=f'{self.block_size}px',
            bg=self.C_BG0, fg=self.C_FG,
            font=('Consolas', 9), width=5)
        self.zoom_lbl.pack(side='left')
        btn('+', self.zoom_in, fg=self.C_GREEN, px=8)
        sep()

        btn('Save TileSheet', self.save_tilesheet, fg=self.C_PINK)
        sep()

        self.file_lbl = tk.Label(
            tb, text='',
            bg=self.C_BG0, fg=self.C_DIM, font=('Consolas', 9))
        self.file_lbl.pack(side='left', padx=8)

    # ── CORRECTED _build_body (single layout, no duplicates) ──────────────
    def _build_body(self):
        """Build the main body with map canvas and info panel."""
        pane = tk.PanedWindow(self, orient='horizontal',
                              bg=self.C_BG2, sashwidth=5, sashrelief='flat')
        pane.pack(fill='both', expand=True)

        # Left: map canvas
        left = tk.Frame(pane, bg=self.C_BG2)
        pane.add(left, minsize=650, stretch='always')

        self.hint = tk.Label(
            left,
            text='Open an MDT file\n\n'
                 'Level maps:  MP10.MDT  through  MPA0.MDT\n'
                 'Resources:   CMAP / STMP / BSMP / MRMP / ...',
            bg=self.C_BG1, fg=self.C_DIM,
            font=('Consolas', 12), justify='center')
        self.hint.pack(fill='both', expand=True)

        self.cf = tk.Frame(left, bg=self.C_BG1)
        self.canvas = tk.Canvas(self.cf, bg=self.C_BG1,
                                highlightthickness=0, cursor='crosshair')
        # --- Scrollbars (store as instance attributes) ---
        self.vsb = tk.Scrollbar(self.cf, orient='vertical',
                                command=self.canvas.yview,
                                bg=self.C_SURF, troughcolor=self.C_BG2, width=10)
        self.hsb = tk.Scrollbar(self.cf, orient='horizontal',
                                command=self.canvas.xview,
                                bg=self.C_SURF, troughcolor=self.C_BG2, width=10)
        self.canvas.configure(yscrollcommand=self.vsb.set, xscrollcommand=self.hsb.set)
        self.vsb.pack(side='right', fill='y')
        self.hsb.pack(side='bottom', fill='x')
        self.canvas.pack(fill='both', expand=True)
        self.canvas.bind('<Configure>', self._update_canvas_scrollbars)

        # Bindings for scrolling and zooming
        self.canvas.bind('<Motion>', self._on_motion)
        self.canvas.bind('<Leave>', self._on_leave)
        self.canvas.bind('<MouseWheel>', self._on_wheel)
        self.canvas.bind('<Shift-MouseWheel>', self._on_shift_wheel)
        self.canvas.bind('<Button-4>', self._on_wheel)
        self.canvas.bind('<Button-5>', self._on_wheel)
        self.canvas.bind('<Shift-Button-4>', self._on_shift_wheel)
        self.canvas.bind('<Shift-Button-5>', self._on_shift_wheel)

        # Status bar at bottom of the left pane
        status_frame = tk.Frame(left, bg=self.C_BG0)
        status_frame.pack(fill='x', side='bottom')

        self.file_lbl_status = tk.Label(
            status_frame,
            text='No file',
            bg=self.C_BG0, fg=self.C_YELL,
            font=('Consolas', 8), anchor='w', padx=10, pady=3)
        self.file_lbl_status.pack(side='left')

        sep_frame = tk.Frame(status_frame, bg=self.C_SURF, width=1)
        sep_frame.pack(side='left', fill='y', pady=2)

        self.status = tk.Label(
            status_frame, textvariable=self.hover_txt,
            bg=self.C_BG0, fg=self.C_DIM,
            font=('Consolas', 8), anchor='w', padx=10, pady=3)
        self.status.pack(side='left', fill='x', expand=True)

        # Right: info panel
        right = tk.Frame(pane, bg=self.C_BG3)
        pane.add(right, minsize=315, stretch='never')
        self._build_info_panel(right)
    # ──────────────────────────────────────────────────────────────────────

    def _build_info_panel(self, parent: tk.Widget):
        """Right panel: fixed top info boxes and a bottom candidate area that expands."""
        # ---------- Top info section (non‑expandable) ----------
        top_frame = tk.Frame(parent, bg=self.C_BG3)
        top_frame.pack(side='top', fill='x')   # only horizontal fill

        self.info_box1 = InfoBox(top_frame, 'MAP INFORMATION', self.C_SURF, self.C_BLUE)
        self.info_box1.pack(fill='x', padx=5, pady=3)

        self.info_box2 = InfoBox(top_frame, 'HEADER INFORMATION', self.C_SURF, self.C_BLUE)
        self.info_box2.pack(fill='x', padx=5, pady=3)

        self.info_box4 = InfoBox(top_frame, 'TILE INFORMATION', self.C_SURF, self.C_BLUE)
        self.info_box4.pack(fill='x', padx=5, pady=3)

        # Text widgets with fixed height (5 lines) so they don't grow
        self.info_txt1 = tk.Text(self.info_box1._content, bg=self.C_PANEL, fg=self.C_FG,
                                font=('Consolas', 8), relief='flat', state='disabled',
                                width=40, wrap='none', selectbackground=self.C_SURF, height=5)
        self.info_box1.set_text_widget(self.info_txt1)

        self.info_txt2 = tk.Text(self.info_box2._content, bg=self.C_PANEL, fg=self.C_FG,
                                font=('Consolas', 8), relief='flat', state='disabled',
                                width=40, wrap='none', selectbackground=self.C_SURF, height=5)
        self.info_box2.set_text_widget(self.info_txt2)

        self.info_txt4 = tk.Text(self.info_box4._content, bg=self.C_PANEL, fg=self.C_FG,
                                font=('Consolas', 8), relief='flat', state='disabled',
                                width=40, wrap='none', selectbackground=self.C_SURF, height=5)
        self.info_box4.set_text_widget(self.info_txt4)

        # Configure text tags
        tags = [
            ('k', self.C_BLUE), ('v', self.C_FG), ('d', self.C_DIM),
            ('g', self.C_GREEN), ('r', self.C_RED), ('y', self.C_YELL),
            ('c', self.C_CYAN), ('p', self.C_PINK), ('s', self.C_SURF),
        ]
        for txt in [self.info_txt1, self.info_txt2, self.info_txt4]:
            for tag, color in tags:
                txt.tag_config(tag, foreground=color)
            txt.tag_config('sec', foreground=self.C_FG, background=self.C_SURF)
            txt.tag_config('leg_d', foreground='#ffffff', background=self.C_BG0)
            txt.tag_config('leg_m', foreground='#ffffff', background=self.C_BG0)
            txt.tag_config('leg_i', foreground='#ffffff', background=self.C_BG0)

        # ---------- Candidate area takes remaining space ----------
        candidate_frame = tk.Frame(parent, bg=self.C_BG3)
        candidate_frame.pack(side='bottom', fill='both', expand=True)   # now expands

        self.info_box5 = InfoBox(candidate_frame, 'TILE CANDIDATES', self.C_SURF, self.C_BLUE)
        self.info_box5.pack(fill='both', expand=True, padx=5, pady=(3, 0))

    # ── File Operations ───────────────────────────────────────────────────────
    def open_file(self):
        """Open an MDT file via file dialog."""
        path = filedialog.askopenfilename(
            title='Open MDT File',
            filetypes=[('MDT map files', '*.mdt *.MDT'), ('All files', '*.*')])
        if not path:
            return
        try:
            self.tile_images.clear()
            self._clear_source_data()

            self.file_data = open(path, 'rb').read()
            self.mdt = decode_mdt_file(path)
            self.current_file = path
            fname = os.path.basename(path)
            self.title(f'Zeliard Sprite Editor — {fname}')
            self.file_lbl.config(text=fname, fg=self.C_FG)
            self.file_lbl_status.config(text=fname)
            self.hint.pack_forget()
            self.cf.pack(fill='both', expand=True)

            if self.tooltip is None:
                self.tooltip = Tooltip(self)

            self._draw_map()
            self._draw_overlays()
            self._draw_tile_ids()
            self._update_info()

        except Exception as e:
            messagebox.showerror('Load Error', str(e))

    def get_tile_image(self, tile_idx):
        use_checker = self.show_checkerboard.get()
        cache_key = (tile_idx, self.block_size, use_checker)
        if cache_key in self.tile_images:
            return self.tile_images[cache_key]

        if not self.mdt.gfx or tile_idx >= len(self.mdt.gfx):
            return None

        raw_pixels = self.mdt.gfx[tile_idx]
        img = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
        for i, p_idx in enumerate(raw_pixels):
            if p_idx == -1:
                continue                        # truly transparent
            color_hex = self.PALETTE_STRS[p_idx]
            x, y = i % 8, i // 8
            rgb = tuple(int(color_hex[j:j+2], 16) for j in (1, 3, 5))
            img.putpixel((x, y), rgb + (255,))

        bw = self.block_size
        scaled = img.resize((bw, bw), Image.NEAREST)
        if use_checker:
            scaled = self._composite_over_checker(scaled, bw)

        photo = ImageTk.PhotoImage(scaled)
        self.tile_images[cache_key] = photo
        return photo

    # ── Map Rendering ─────────────────────────────────────────────────────────
    def _draw_map(self):
        self.canvas.delete("all")
        bw = self.block_size
        mw, mh = self.mdt.map_width, self.mdt.map_height
        use_checker = self.show_checkerboard.get()

        for y in range(mh):
            for x in range(mw):
                tile_idx = self.mdt.grid[y][x]
                x1, y1 = x * bw, y * bw

                if self.source_tile_candidates and tile_idx in self.source_tile_candidates:
                    sel_idx = self.source_tile_selections.get(tile_idx, 0)
                    if sel_idx < len(self.source_tile_candidates[tile_idx]):
                        src_img = self.source_tile_candidates[tile_idx][sel_idx]
                        cache_key = (tile_idx, bw, sel_idx, use_checker)  # ← added flag
                        if cache_key not in self.source_tile_cache:
                            scaled = src_img.resize((bw, bw), Image.NEAREST)
                            if use_checker:
                                scaled = self._composite_over_checker(scaled, bw)
                            photo = ImageTk.PhotoImage(scaled)
                            self.source_tile_cache[cache_key] = photo
                        tile_img = self.source_tile_cache[cache_key]
                        self.canvas.create_image(x1, y1, image=tile_img, anchor='nw')
                        continue

                tile_img = self.get_tile_image(tile_idx)
                if tile_img:
                    self.canvas.create_image(x1, y1, image=tile_img, anchor='nw')
                else:
                    self.canvas.create_rectangle(x1, y1, x1+bw, y1+bw, fill='gray')

        self.canvas.config(scrollregion=(0, 0, mw * bw, mh * bw))
        self._draw_overlays()
        self._draw_tile_ids()
        self._update_canvas_scrollbars()

    def _draw_overlays(self):
        for iid in self.overlay_ids:
            self.canvas.delete(iid)
        self.overlay_ids = []
        if not self.mdt or not self.show_overlay.get():
            return
        bs = self.block_size
        fs = max(6, min(10, bs - 1))
        font = ('Consolas', fs, 'bold')
        pad = max(1, bs // 6)
        def place(x, y, text):
            cx = x * bs + bs // 2
            cy = y * bs + bs // 2
            tid = self.canvas.create_text(cx, cy, text=text, fill='#ffffff', font=font, anchor='center')
            bb = self.canvas.bbox(tid)
            if bb:
                rid = self.canvas.create_rectangle(bb[0]-pad, bb[1]-pad, bb[2]+pad, bb[3]+pad,
                                                  fill='#000000', outline='#555555', width=1)
                self.canvas.tag_raise(tid)
                self.overlay_ids += [rid, tid]
            else:
                self.overlay_ids.append(tid)
        for d in self.mdt.doors: place(d.x, d.y, d.label)
        for m in self.mdt.monsters: place(m.x, m.y, m.label)
        for i in self.mdt.items: place(i.x, i.y, i.label)
        if self.mdt.is_town:
            ground_row = TOWN_HEIGHT - 1
            for td in self.mdt.town_doors: place(td.x, ground_row, td.label)
            for npc in self.mdt.npcs: place(npc.x, ground_row, npc.label)

    def _draw_tile_ids(self):
        for iid in self.tile_id_overlay_ids:
            self.canvas.delete(iid)
        self.tile_id_overlay_ids = []
        if not self.mdt or not self.show_tile_ids.get():
            return
        bs = self.block_size
        fs = max(4, bs // 4)
        font = ('Consolas', fs, 'bold')
        mw, mh = self.mdt.map_width, self.mdt.map_height
        for y in range(mh):
            for x in range(mw):
                tile_idx = self.mdt.grid[y][x]
                tid = self.canvas.create_text(x*bs+2, y*bs+2, text=str(tile_idx),
                                             fill='white', font=font, anchor='nw')
                self.tile_id_overlay_ids.append(tid)

    def _toggle_overlay(self):
        self.show_overlay.set(not self.show_overlay.get())
        on = self.show_overlay.get()
        self.ov_btn.config(text=f'Overlay  {"ON " if on else "OFF"}',
                           fg=self.C_YELL if on else self.C_DIM)
        self._draw_overlays()

    def _toggle_tile_ids(self):
        self.show_tile_ids.set(not self.show_tile_ids.get())
        on = self.show_tile_ids.get()
        self.tid_btn.config(text=f'Tile IDs  {"ON " if on else "OFF"}',
                            fg=self.C_YELL if on else self.C_DIM)
        self._draw_tile_ids()

    # ── Info Panel Update ─────────────────────────────────────────────────────
    def _update_info(self):
        m = self.mdt
        d = self.file_data
        if not m or not d:
            return
        mw, mh = m.map_width, m.map_height
        total = mw * mh
        flat = [m.grid[r][c] for r in range(mh) for c in range(mw)]
        cnt = Counter(flat)
        fname = os.path.basename(self.current_file) if self.current_file else ''
        mtype = get_map_type_info(self.current_file) if self.current_file else 'Unknown'

        for txt in [self.info_txt1, self.info_txt2, self.info_txt4]:
            txt.config(state='normal')
            txt.delete('1.0', 'end')

        T = self.info_txt1
        def kv(key, val, vt='v'):
            T.insert('end', f'  {key:<18}', 'k')
            T.insert('end', f'{val}\n', vt)
        def sep():
            T.insert('end', '  ' + '-' * 34 + '\n', 's')
        def sec(title):
            T.insert('end', f'\n  [ {title} ]\n', 'sec')

        sec('File Info')
        kv('Filename', fname)
        kv('File size', f'{len(d):,} bytes')
        kv('Map type', mtype)
        if m.is_town and m.town_name:
            kv('Town name', m.town_name, 'y')
        sep()

        sec('Map Structure')
        kv('Width', f'{mw} tiles')
        height_note = '(fixed — town)' if m.is_town else '(fixed)'
        kv('Height', f'{mh} tiles  {height_note}')
        kv('Total tiles', f'{total:,}')
        kv('Unique tiles', f'{len(cnt)} types')
        sep()

        if m.is_town:
            sec('Map Storage')
            kv('Format', 'Unpacked  (column-major)')
            kv('Map offset', '+0x17')
            kv('Map bytes', f'{mw * TOWN_HEIGHT}')
        else:
            cbytes = max(0, m.consumed_si - 0x1B)
            sec('Compression')
            kv('Packed bytes', f'{cbytes}')
            ratio = cbytes / total if total else 0
            kv('Bytes / tile', f'{ratio:.3f}')
            saving = (1 - ratio) * 100 if ratio < 1 else 0
            kv('Space saved', f'{saving:.1f}%', 'g' if saving > 50 else 'v')

        T = self.info_txt2
        def ptr_row(lbl, ptr):
            off = _ptr_off_safe(ptr, len(d))
            s = (f'{ptr:#06x}  ->  +{off:#06x}' if off is not None
                 else f'{ptr:#06x}  (invalid)')
            kv(lbl, s, 'c')

        if m.is_town:
            sec('Town Header Pointers  (runtime -> file offset)')
            ptr_row('Descriptor', m.desc_ptr)
            kv('Width (raw)', f'{m.map_width}  tiles', 'y')
            ptr_row('Name info', m.name_ptr)
            ptr_row('Doors', m.doors_ptr)
            ptr_row('NPC texts', m.npc_texts_ptr)
            ptr_row('NPCs', m.npc_ptr)
            kv('Map data', '+0x17  (unpacked tiles)', 'c')
        else:
            sec('Header Pointers  (runtime -> file offset)')
            ptr_row('Descriptor', m.desc_ptr)
            ptr_row('V-Platforms', m.vplat_ptr)
            ptr_row('C-Platforms', m.cplat_ptr)
            ptr_row('H-Platforms', m.hplat_ptr)
            ptr_row('Doors', m.doors_ptr)
            ptr_row('Achv-Items', m.achv_ptr)
            ptr_row('Name renderer', m.name_ptr)
            ptr_row('Monsters', m.monsters_ptr)
            ptr_row('Signs', m.signs_ptr)
            ptr_row('Map end', m.map_end_ptr)
            kv('Level', str(m.level), 'y')
            kv('Tear X', f'{m.tear_x:#06x}  ({m.tear_x})', 'y')
            kv('Tear Y', f'{m.tear_y:#04x}  ({m.tear_y})', 'y')

        sep()
        sec('Raw Header  +0x00..+0x1A')
        for o in range(0, min(0x1B, len(d)), 4):
            chunk = d[o:o + 4]
            hexs = ' '.join(f'{b:02X}' for b in chunk)
            ascs = ''.join(chr(b) if 0x20 <= b < 0x7F else '.' for b in chunk)
            T.insert('end', f'  +{o:02X}  {hexs:<11}  {ascs}\n', 'd')

        T = self.info_txt4
        sec('Tile Frequency  Top 15')
        for tile, count in cnt.most_common(15):
            pct = count / total * 100
            T.insert('end', f'  #{tile:2d}  {count:6d}  {pct:5.1f}%  {PALETTE[tile % 64]}\n', 'd')

        for txt in [self.info_txt1, self.info_txt2, self.info_txt4]:
            txt.config(state='disabled')

    # ── Mouse Events ──────────────────────────────────────────────────────────
    def _on_motion(self, event):
        if not self.mdt:
            return
        bs = self.block_size
        cx = self.canvas.canvasx(event.x)
        cy = self.canvas.canvasy(event.y)
        col = int(cx // bs)
        row = int(cy // bs)
        mw, mh = self.mdt.map_width, self.mdt.map_height
        if 0 <= col < mw and 0 <= row < mh:
            tile = self.mdt.grid[row][col]
            self.hover_txt.set(f'  col:{col:4d}  row:{row:3d}  tile:{tile:2d}   {PALETTE[tile % 64]}')
        else:
            self.hover_txt.set('')
        entity = self._hit_entity(cx, cy)
        if entity and self.tooltip:
            rx = self.winfo_pointerx()
            ry = self.winfo_pointery()
            self.tooltip.show(rx, ry, self._make_tip(entity))
        elif self.tooltip:
            self.tooltip.hide()

    def _on_leave(self, event):
        self.hover_txt.set('')
        if self.tooltip:
            self.tooltip.hide()

    def _update_canvas_scrollbars(self, event=None):
        """Show/hide scrollbars based on whether content fits the viewport."""
        if event:
            # Unpack the event (from <Configure>)
            pass
        if not self.mdt:
            return
        # Get canvas viewport size
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        # Map full size
        map_full_w = self.mdt.map_width * self.block_size
        map_full_h = self.mdt.map_height * self.block_size

        # Vertical scrollbar
        if map_full_h <= canvas_height:
            self.vsb.pack_forget()
        else:
            self.vsb.pack(side='right', fill='y')

        # Horizontal scrollbar
        if map_full_w <= canvas_width:
            self.hsb.pack_forget()
        else:
            self.hsb.pack(side='bottom', fill='x')

    # ── Scroll handlers (enhanced) ──────────────────────────────────────
    def _on_wheel(self, event):
        """Handle mouse wheel for vertical scrolling and Ctrl+wheel for zoom."""
        if event.state & 0x4:          # Ctrl held → zoom
            if event.delta > 0 or event.num == 4:
                self.zoom_in()
            else:
                self.zoom_out()
            return

        # Vertical scroll
        if event.num == 4:
            self.canvas.yview_scroll(-3, 'units')
        elif event.num == 5:
            self.canvas.yview_scroll(3, 'units')
        else:
            # event.delta on Windows is typically ±120 per notch
            self.canvas.yview_scroll(-1 * (event.delta // 120), 'units')

    def _on_shift_wheel(self, event):
        """Horizontal scroll via Shift+wheel or two-finger horizontal pan."""
        # Ignore Ctrl combinations (they are for zoom)
        if event.state & 0x4:
            return

        # On some systems, Shift+wheel sends a separate event with delta.
        # We'll use that delta for horizontal scrolling.
        if event.num == 4:
            self.canvas.xview_scroll(-3, 'units')
        elif event.num == 5:
            self.canvas.xview_scroll(3, 'units')
        else:
            self.canvas.xview_scroll(-1 * (event.delta // 120), 'units')

    def _hit_entity(self, cx, cy):
        if not self.mdt or not self.show_overlay.get():
            return None
        bs = self.block_size
        thresh = (max(bs, 8) * 0.9) ** 2
        best = None
        best_d = thresh
        is_town = self.mdt.is_town
        ground_row = TOWN_HEIGHT - 1 if is_town else 0
        all_entities = list(self.mdt.doors) + list(self.mdt.monsters) + list(self.mdt.items)
        if is_town:
            all_entities.extend(self.mdt.town_doors)
            all_entities.extend(self.mdt.npcs)
        for e in all_entities:
            ex = e.x * bs + bs // 2
            ey = (ground_row if is_town else e.y) * bs + bs // 2
            d = (cx - ex) ** 2 + (cy - ey) ** 2
            if d < best_d:
                best_d = d
                best = e
        return best

    def _make_tip(self, e) -> str:
        lbl = e.label
        line = '-' * 30
        tip = [f'  {lbl}', f'  {line}']
        if lbl.startswith('D'):
            if hasattr(e, 'door_type'):
                tip += [f'  Type      {e.dtype}', f'  Column X  {e.x}', f'  Door type {e.door_type:#04x}']
            else:
                tip += [f'  Type      {e.dtype}', f'  From      ({e.x}, {e.y})',
                        f'  Dest map  {e.dest}', f'  To        ({e.x1}, {"town" if e.is_town else e.y1})',
                        f'  Lion Key  {"required" if e.needs_key else "not required"}',
                        f'  flags     {e.flags:#04x}   flags2  {e.flags2:#04x}',
                        f'  map_id    {e.map_id:#04x}   unk  {e.unk:#06x}']
        elif lbl.startswith('N'):
            tip += [f'  NPC id    {e.npc_id:#04x}  ({e.npc_id})', f'  Column X  {e.x}']
        elif lbl.startswith('M'):
            name = _MONSTER_TYPE_NAMES.get(e.type, '')
            name_str = f' ({name})' if name else ''
            tip += [f'  Type      {e.type:#04x}{name_str}', f'  Position  ({e.x}, {e.y})',
                    f'  Spawn     ({e.spwn_x}, {e.spwn_y})', f'  SType     {e.spwn_type:#04x}',
                    f'  Act       {e.act:#04x}', f'  Raw:  {e.raw}']
        elif lbl.startswith('I'):
            tip += [f'  Type      {e.type:#04x}  ({e.type})', f'  Position  ({e.x}, {e.y})',
                    f'  Spawn     ({e.spwn_x}, {e.spwn_y})', f'  Raw:  {e.raw}']
        else:
            tip.append('  Unknown entity')
        return '\n'.join(tip)

    # ── Zoom ──────────────────────────────────────────────────────────────────
    def zoom_in(self):
        if self.block_size < self.BLK_MAX:
            self.block_size = min(self.block_size + 2, self.BLK_MAX)
            self.zoom_lbl.config(text=f'{self.block_size}px')
            if self.mdt:
                self._draw_map()

    def zoom_out(self):
        if self.block_size > self.BLK_MIN:
            self.block_size = max(self.block_size - 2, self.BLK_MIN)
            self.zoom_lbl.config(text=f'{self.block_size}px')
            if self.mdt:
                self._draw_map()

    # ── Source Tile Loading & Candidate Palette ──────────────────────────────
    def load_source_image(self):
        if not self.mdt:
            messagebox.showwarning('Warning', 'Open an MDT first.')
            return
        path = filedialog.askopenfilename(
            title='Open Source Map Image',
            filetypes=[('PNG files', '*.png'), ('All files', '*')])
        if not path:
            return
        ts = simpledialog.askinteger(
            'Tile Size', 'Enter tile pixel size in the source image:',
            initialvalue=getattr(self, 'source_tile_size', 8), minvalue=1, parent=self)
        if ts is None:
            return
        try:
            src_img = Image.open(path)
            mw, mh = self.mdt.map_width, self.mdt.map_height
            expected_w = mw * ts
            expected_h = mh * ts
            if src_img.size != (expected_w, expected_h):
                messagebox.showerror('Size Mismatch',
                                     f'Image must be exactly {expected_w}x{expected_h} pixels.\n'
                                     f'(map {mw}x{mh} × tile size {ts})')
                return

            # Slice and deduplicate per tile ID
            candidates = defaultdict(list)
            seen = defaultdict(set)
            for row in range(mh):
                for col in range(mw):
                    tid = self.mdt.grid[row][col]
                    box = (col * ts, row * ts, (col+1) * ts, (row+1) * ts)
                    tile_img = src_img.crop(box)
                    data = tile_img.tobytes()
                    if data not in seen[tid]:
                        seen[tid].add(data)
                        candidates[tid].append(tile_img)

            self.source_tile_candidates = dict(candidates)
            self.source_tile_cache = {}
            self.source_image_path = path
            self.source_tile_size = ts

            # ---- Attempt to load saved selections ----
            self._load_selections_if_match()
            self._build_tile_candidates_ui()
            self._draw_map()

        except Exception as e:
            messagebox.showerror('Load Error', str(e))

    def clear_source_data(self):
        self._clear_source_data()
        if self.mdt:
            self._draw_map()

    def _clear_source_data(self):
        self.source_tile_candidates = None
        self.source_tile_selections = {}
        self.source_tile_cache = {}
        self.candidate_labels = {}
        self.candidate_frames = {}
        self.source_image_path = None
        self.source_tile_size = None
        self.selections_dirty = False
        self.selections_file_path = None
        if hasattr(self, 'info_box5'):
            for w in self.info_box5._content.winfo_children():
                w.destroy()

    def load_animation(self):
        """Load an animation strip (4 horizontal frames) and assign to consecutive tile IDs."""
        if not self.mdt:
            messagebox.showwarning('Warning', 'Open an MDT first.')
            return
        path = filedialog.askopenfilename(
            title='Open Animation PNG (vertical strip of 4 frames)',
            filetypes=[('PNG files', '*.png'), ('All files', '*')])
        if not path:
            return

        ts = simpledialog.askinteger(
            'Frame Size', 'Pixel size of each frame (width & height):',
            initialvalue=getattr(self, 'source_tile_size', 8), minvalue=1, parent=self)
        if ts is None:
            return

        start_id = simpledialog.askinteger(
            'Starting Tile ID', 'First tile ID to assign the animation:',
            initialvalue=0, minvalue=0, parent=self)
        if start_id is None:
            return

        try:
            anim_img = Image.open(path)
            w, h = anim_img.size
            expected_w = ts * 4
            if w != expected_w or h != ts:
                messagebox.showerror(
                    'Size Mismatch',
                    f'Animation image must be exactly {expected_w}x{ts} pixels\n'
                    f'(width = 4 × frame size, height = frame size).')
                return

            # Slice the 4 frames horizontally
            frames = []
            for i in range(4):
                frame = anim_img.crop((i * ts, 0, (i + 1) * ts, ts))
                frames.append(frame)

            # Ensure we have the candidate dict (may not exist if no source loaded)
            if self.source_tile_candidates is None:
                self.source_tile_candidates = {}
                self.source_tile_selections = {}
                self.source_tile_cache = {}

            # Assign frames to consecutive tile IDs
            for offset, tid in enumerate(range(start_id, start_id + 4)):
                if tid not in self.source_tile_candidates:
                    self.source_tile_candidates[tid] = []
                self.source_tile_candidates[tid].append(frames[offset])
                # Select the newly added frame (last index)
                self.source_tile_selections[tid] = len(self.source_tile_candidates[tid]) - 1

            self.selections_dirty = True
            self._build_tile_candidates_ui()
            self._draw_map()

        except Exception as e:
            messagebox.showerror('Load Error', str(e))

    # ─── Persistence methods ─────────────────────────────────────────────────
    def _get_selections_file_path(self):
        """Derive a persistent file path for tile selections next to the MDT."""
        if not self.current_file or not self.source_image_path:
            return None
        base = os.path.splitext(self.current_file)[0]
        return base + '_tile_selections.json'

    def _load_selections_if_match(self):
        """Load saved selections if the source image and tile size match."""
        path = self._get_selections_file_path()
        self.selections_file_path = path
        if not path or not os.path.exists(path):
            return
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            if data.get('source_file') != self.source_image_path or \
               data.get('tile_size') != self.source_tile_size:
                return  # mismatch – start fresh
            saved = {int(k): v for k, v in data.get('selections', {}).items()}
            # validate against current candidates
            for tid in saved:
                if tid in self.source_tile_candidates and \
                   saved[tid] < len(self.source_tile_candidates[tid]):
                    self.source_tile_selections[tid] = saved[tid]
            self.selections_dirty = False
        except Exception:
            pass   # corrupted file – ignore

    def _save_selections(self):
        """Write current selections to the JSON file."""
        path = self.selections_file_path
        if not path:
            return
        data = {
            'source_file': self.source_image_path,
            'tile_size': self.source_tile_size,
            'selections': {str(k): v for k, v in self.source_tile_selections.items()}
        }
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        self.selections_dirty = False

    def _on_close(self):
        """Intercept window close and prompt to save if dirty."""
        if self.selections_dirty:
            answer = messagebox.askyesnocancel(
                "Unsaved tile selections",
                "You have modified tile selections. Save before closing?")
            if answer:        # Yes
                self._save_selections()
                self.destroy()
            elif answer is False:  # No
                self.destroy()
            # Cancel: do nothing (stay open)
        else:
            self.destroy()

    # ── Right panel: tile candidates with CORRECTED horizontal scroll ────────
    def _build_tile_candidates_ui(self):
        """
        Tile candidate palette inside info_box5.
        Has its own vertical scrollbar and a permanent horizontal scrollbar.
        Wheel scrolling works anywhere inside the candidate area.
        """
        content = self.info_box5._content
        for w in content.winfo_children():
            w.destroy()
        if not self.source_tile_candidates:
            return

        outer = tk.Frame(content, bg=self.C_BG2)
        outer.pack(fill='both', expand=True)

        v_canvas = tk.Canvas(outer, bg=self.C_BG2, highlightthickness=0)
        v_scroll = tk.Scrollbar(outer, orient='vertical', command=v_canvas.yview,
                                bg=self.C_SURF, troughcolor=self.C_BG2)
        h_scroll = tk.Scrollbar(outer, orient='horizontal', command=v_canvas.xview,
                                bg=self.C_SURF, troughcolor=self.C_BG2)
        v_canvas.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)

        v_scroll.pack(side='right', fill='y')
        h_scroll.pack(side='bottom', fill='x')
        v_canvas.pack(side='left', fill='both', expand=True)

        inner = tk.Frame(v_canvas, bg=self.C_BG2)
        v_canvas.create_window((0, 0), window=inner, anchor='nw')

        def on_inner_configure(event):
            v_canvas.configure(scrollregion=v_canvas.bbox('all'))
        inner.bind('<Configure>', on_inner_configure)

        # ---------- wheel helpers (attached to all relevant widgets) ----------
        def _vert_wheel(event):
            """Vertical scroll on the candidate canvas."""
            if event.num == 4:
                v_canvas.yview_scroll(-3, 'units')
            elif event.num == 5:
                v_canvas.yview_scroll(3, 'units')
            else:
                v_canvas.yview_scroll(-1 * (event.delta // 120), 'units')

        def _horiz_wheel(event):
            """Horizontal scroll on the candidate canvas."""
            if event.num == 4:
                v_canvas.xview_scroll(-3, 'units')
            elif event.num == 5:
                v_canvas.xview_scroll(3, 'units')
            else:
                v_canvas.xview_scroll(-1 * (event.delta // 120), 'units')

        def _bind_recursive(widget):
            """Bind wheel events to *widget* and all its descendants."""
            widget.bind('<MouseWheel>', _vert_wheel)
            widget.bind('<Shift-MouseWheel>', _horiz_wheel)
            widget.bind('<Button-4>', _vert_wheel)
            widget.bind('<Button-5>', _vert_wheel)
            widget.bind('<Shift-Button-4>', _horiz_wheel)
            widget.bind('<Shift-Button-5>', _horiz_wheel)
            for child in widget.winfo_children():
                _bind_recursive(child)

        # Bind initially to the outer container and the canvas
        _bind_recursive(outer)
        _bind_recursive(v_canvas)
        # -----------------------------------------------------------------------

        self.candidate_labels = {}
        self.candidate_frames = {}

        for tile_id in sorted(self.source_tile_candidates.keys()):
            cands = self.source_tile_candidates[tile_id]
            section = tk.Frame(inner, bg=self.C_BG2)
            section.pack(fill='x', padx=5, pady=2)

            tk.Label(section, text=f'Tile {tile_id}',
                    fg=self.C_FG, bg=self.C_BG2,
                    font=('Consolas', 9)).pack(side='left', padx=5)

            row = tk.Frame(section, bg=self.C_BG2)
            row.pack(side='left', fill='x')

            for i, img in enumerate(cands):
                frame = tk.Frame(row, bg=self.C_BG2, highlightthickness=0,
                                highlightbackground='white', relief='flat')
                frame.pack(side='left', padx=2)
                thumb = img.copy()
                thumb.thumbnail((24, 24), Image.NEAREST)
                photo = ImageTk.PhotoImage(thumb)
                lbl = tk.Label(frame, image=photo, bg=self.C_BG2, borderwidth=0)
                lbl.image = photo
                lbl.pack()
                self.candidate_labels[(tile_id, i)] = lbl
                self.candidate_frames[(tile_id, i)] = frame

                lbl.bind('<Button-1>', lambda e, tid=tile_id, idx=i: self._select_candidate(tid, idx))
                frame.bind('<Button-1>', lambda e, tid=tile_id, idx=i: self._select_candidate(tid, idx))

                # Apply wheel bindings to every newly created widget
                _bind_recursive(frame)
                _bind_recursive(lbl)

                if self.source_tile_selections.get(tile_id) == i:
                    frame.config(highlightthickness=1, relief='solid')

        # Force the inner frame to inherit wheel bindings as well
        _bind_recursive(inner)

        inner.update_idletasks()
        v_canvas.configure(scrollregion=v_canvas.bbox('all'))
        
    def _select_candidate(self, tile_id, idx):
        if self.source_tile_selections.get(tile_id) == idx:
            return
        self.source_tile_selections[tile_id] = idx
        self.selections_dirty = True
        for (tid, i), frame in self.candidate_frames.items():
            if tid == tile_id:
                frame.config(highlightthickness=1 if i == idx else 0,
                             relief='solid' if i == idx else 'flat')
        self._draw_map()

    # ── Save Functions ────────────────────────────────────────────────────────
    def _get_tile_image_for_export(self, tile_id, bs):
        if self.source_tile_candidates and tile_id in self.source_tile_candidates:
            sel = self.source_tile_selections.get(tile_id, 0)
            if sel < len(self.source_tile_candidates[tile_id]):
                img = self.source_tile_candidates[tile_id][sel]
                # Ensure RGBA
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')
                return img.resize((bs, bs), Image.NEAREST)

        # Native MDT tile – create RGBA with proper transparency
        if self.mdt.gfx and tile_id < len(self.mdt.gfx):
            raw_pixels = self.mdt.gfx[tile_id]
            tmp = Image.new('RGBA', (8, 8))
            for i, p_idx in enumerate(raw_pixels):
                if p_idx == -1:
                    pixel = (0, 0, 0, 0)          # fully transparent
                else:
                    color_hex = self.PALETTE_STRS[p_idx]
                    rgb = tuple(int(color_hex[j:j+2], 16) for j in (1, 3, 5))
                    pixel = rgb + (255,)           # fully opaque
                tmp.putpixel((i % 8, i // 8), pixel)
            return tmp.resize((bs, bs), Image.NEAREST)

        # Fallback for missing tile
        return Image.new('RGBA', (bs, bs), (0, 0, 0, 0))

    def save_png(self):
        """Export map as PNG at native tile size (source tile size or 8px)."""
        if not self.mdt:
            messagebox.showwarning('Warning', 'Open a file first.')
            return
        init = os.path.splitext(os.path.basename(self.current_file))[0] + '.png'
        path = filedialog.asksaveasfilename(defaultextension='.png',
                                            filetypes=[('PNG image', '*.png')],
                                            initialfile=init)
        if not path:
            return
        try:
            # Use source tile size if loaded, otherwise native 8px
            if self.source_tile_candidates and self.source_tile_size:
                tile_size = self.source_tile_size
            else:
                tile_size = 8

            mw, mh = self.mdt.map_width, self.mdt.map_height
            full_map = Image.new('RGBA', (mw * tile_size, mh * tile_size), (0, 0, 0, 0))
            for r in range(mh):
                for c in range(mw):
                    tid = self.mdt.grid[r][c]
                    tile_img = self._get_tile_image_for_export(tid, tile_size)
                    full_map.paste(tile_img, (c * tile_size, r * tile_size), tile_img)
            full_map.save(path)
            messagebox.showinfo('Saved', f'High-fidelity PNG saved:\n{path}')
        except Exception as e:
            messagebox.showerror('Save Error', str(e))

    def save_txt(self):
        if not self.mdt:
            messagebox.showwarning('Warning', 'Open a file first.')
            return
        init = os.path.splitext(os.path.basename(self.current_file))[0] + '.txt'
        path = filedialog.asksaveasfilename(defaultextension='.txt',
                                            filetypes=[('Text file', '*.txt')],
                                            initialfile=init)
        if not path:
            return
        try:
            m = self.mdt
            with open(path, 'w', encoding='utf-8') as f:
                f.write(f'; Zeliard MDT:  {os.path.basename(self.current_file)}\n')
                f.write(f'; Width={m.map_width}  Height={m.map_height}\n')
                if m.is_town:
                    f.write(f'; Town name={m.town_name}  Doors={len(m.town_doors)}  NPCs={len(m.npcs)}\n;\n')
                else:
                    f.write(f'; Level={m.level}  Tear=({m.tear_x},{m.tear_y})\n'
                            f'; Doors={len(m.doors)}  Monsters={len(m.monsters)}  Items={len(m.items)}\n;\n')
                for row in m.grid:
                    f.write(''.join(chr(t + 0x20) for t in row) + '\n')
            messagebox.showinfo('Saved', f'TXT saved:\n{path}')
        except Exception as e:
            messagebox.showerror('Save Error', str(e))

    def save_tilesheet(self):
        if not self.mdt or not self.source_tile_candidates:
            messagebox.showwarning('Warning', 'Load source image first to have tile candidates.')
            return
        ts = getattr(self, 'source_tile_size', None)
        if ts is None:
            messagebox.showerror('Error', 'Source tile size unknown. Reload source image.')
            return
        tile_ids = sorted(self.source_tile_candidates.keys())
        if not tile_ids:
            return

        # Determine full range of tile IDs (0 .. max_id)
        max_tid = max(tile_ids)
        total_tiles = max_tid + 1

        # Prepare the empty tile – use a fully transparent RGBA tile for missing IDs
        if 0 in self.source_tile_candidates:
            sel0 = self.source_tile_selections.get(0, 0)
            if sel0 < len(self.source_tile_candidates[0]):
                empty_tile = self.source_tile_candidates[0][sel0].convert('RGBA')
        else:
            empty_tile = Image.new('RGBA', (ts, ts), (0, 0, 0, 0))   # transparent fallback

        base = os.path.splitext(os.path.basename(self.current_file))[0] if self.current_file else 'tiles'
        default_name = f"{base}_x{ts}.png"
        path = filedialog.asksaveasfilename(defaultextension='.png',
                                            filetypes=[('PNG image', '*.png')],
                                            initialfile=default_name)
        if not path:
            return

        max_cols = 16
        cols = min(total_tiles, max_cols)
        rows = (total_tiles + cols - 1) // cols
        sheet_w = cols * ts
        sheet_h = rows * ts

        # --- Create sheet with alpha channel (transparent background) ---
        sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))

        existing_ids = set(tile_ids)
        for tid in range(total_tiles):          # tid is the tile ID
            if tid in existing_ids:
                sel = self.source_tile_selections.get(tid, 0)
                if sel < len(self.source_tile_candidates[tid]):
                    tile_img = self.source_tile_candidates[tid][sel]
                    # Convert to RGBA if it isn't already – leaves RGB opaque
                    if tile_img.mode != 'RGBA':
                        tile_img = tile_img.convert('RGBA')
                else:
                    tile_img = Image.new('RGBA', (ts, ts), (0, 0, 0, 0))
            else:
                tile_img = empty_tile

            row = tid // cols
            col = tid % cols
            sheet.paste(tile_img, (col * ts, row * ts), tile_img)  # use alpha mask

        sheet.save(path)
        messagebox.showinfo('Saved', f'Tile sheet saved as {default_name}\n at:\n{path}')

    def _make_checker_patch(self, size: int) -> Image.Image:
        """Return a checkerboard RGBA image of size×size pixels."""
        if size in self._checker_cache:
            return self._checker_cache[size]
        img = Image.new('RGBA', (size, size))
        cell = max(1, self.CHECKER_CELL * size // 8)
        light = tuple(int(self.CHECKER_LIGHT[i:i+2], 16) for i in (1, 3, 5)) + (255,)
        dark  = tuple(int(self.CHECKER_DARK[i:i+2], 16)  for i in (1, 3, 5)) + (255,)
        for y in range(size):
            for x in range(size):
                img.putpixel((x, y), light if ((x // cell) + (y // cell)) % 2 == 0 else dark)
        self._checker_cache[size] = img
        return img

    def _composite_over_checker(self, tile_img: Image.Image, size: int) -> Image.Image:
        """Paste an RGBA tile over a checkerboard background."""
        checker = self._make_checker_patch(size).copy()
        tile_rgba = tile_img.convert('RGBA') if tile_img.mode != 'RGBA' else tile_img
        checker.paste(tile_rgba, (0, 0), tile_rgba)
        return checker

    def _toggle_checkerboard(self):
        self.show_checkerboard.set(not self.show_checkerboard.get())
        on = self.show_checkerboard.get()
        self.chk_btn.config(
            text=f'Checker  {"ON " if on else "OFF"}',
            fg=self.C_YELL if on else self.C_DIM)
        self.tile_images.clear()
        self.source_tile_cache.clear()
        self._checker_cache.clear()
        if self.mdt:
            self._draw_map()

    def load_tilesheet(self):
        """Load a tilesheet image and assign each tile ID from the sheet to the map."""
        if not self.mdt:
            messagebox.showwarning('Warning', 'Open an MDT first.')
            return

        path = filedialog.askopenfilename(
            title='Open Tilesheet Image',
            filetypes=[('PNG files', '*.png'), ('All files', '*')])
        if not path:
            return

        ts = simpledialog.askinteger(
            'Tile Size', 'Pixel size of each tile in the sheet:',
            initialvalue=getattr(self, 'source_tile_size', 8), minvalue=1, parent=self)
        if ts is None:
            return

        cols = simpledialog.askinteger(
            'Columns', 'Number of tile columns in the sheet:',
            initialvalue=16, minvalue=1, parent=self)
        if cols is None:
            return

        try:
            sheet_img = Image.open(path)
            w, h = sheet_img.size

            # Validate dimensions
            if w % ts != 0 or h % ts != 0:
                messagebox.showerror(
                    'Size Mismatch',
                    f'Image width ({w}) and height ({h}) must be multiples of tile size ({ts}).')
                return

            tiles_across = w // ts
            if tiles_across != cols:
                # Allow but warn – automatically adjust if they mismatched
                cols = tiles_across
                # Optional: ask for confirmation? We'll just use detected cols.
                # messagebox.showinfo('Info', f'Detected {cols} columns from image width.')

            tiles_down = h // ts
            # Slice all tiles into a list where index = tile ID
            tiles = []
            for row in range(tiles_down):
                for col in range(cols):
                    left = col * ts
                    upper = row * ts
                    tile_img = sheet_img.crop((left, upper, left + ts, upper + ts))
                    tiles.append(tile_img)

            # Build candidate dictionary for each tile ID present in the map
            self.source_tile_candidates = {}
            self.source_tile_selections = {}
            self.source_tile_cache = {}

            max_tile_id = max(max(row) for row in self.mdt.grid) if self.mdt.grid else 0

            for y in range(self.mdt.map_height):
                for x in range(self.mdt.map_width):
                    tid = self.mdt.grid[y][x]
                    if tid < len(tiles):                     # valid tile from sheet
                        if tid not in self.source_tile_candidates:
                            self.source_tile_candidates[tid] = []
                        # Avoid duplicates (same tile ID from different positions – they share the candidate)
                        if not any(tiles[tid].tobytes() == existing.tobytes()
                                for existing in self.source_tile_candidates[tid]):
                            self.source_tile_candidates[tid].append(tiles[tid])
                        # Auto‑select the first (only) candidate
                        self.source_tile_selections[tid] = 0
                    # tiles with ID >= len(tiles) are left untouched (original MDT rendering)

            self.source_image_path = path        # for persistence
            self.source_tile_size = ts
            self.selections_dirty = True

            self._build_tile_candidates_ui()
            self._draw_map()

        except Exception as e:
            messagebox.showerror('Load Error', str(e))
