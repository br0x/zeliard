#!/usr/bin/env python3
"""
hero_renderer.py — Render the composite dungeon hero onto a tkinter Canvas
using pre-rendered sprite sheets (fman.png, sword.png).

Frame resolution logic ported 1:1 from
web/src/render/dungeon.ts (drawDungeonHero / drawDungeonSword).

Usage:
    from hero_renderer import HeroState, render_hero
    render_hero(canvas, state, x=100, y=100, scale=3)

CLI (opens tkinter window with radio-button controls):
    python hero_renderer.py
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from PIL import Image

# ---------------------------------------------------------------------------
# Constants (mirrors web/src/config/engine.ts)
# ---------------------------------------------------------------------------
TILE_SIZE = 24          # native tile size (pixels at 1x)
HERO_FRAME_W = 72       # DUNGEON_HERO_FRAME_W  (3 tiles * 24px)
HERO_FRAME_H = 72       # DUNGEON_HERO_FRAME_H
HERO_SHEET_COLS = 16    # DUNGEON_HERO_SHEET_COLS

SWORD_FRAME_W = 96      # DUNGEON_SWORD_FRAME_W  (4 tiles * 24px)
SWORD_FRAME_H = 96      # DUNGEON_SWORD_FRAME_H
SWORD_SHEET_COLS = 10   # DUNGEON_SWORD_SHEET_COLS

# Sword overlay offsets — pairs of (yOff, xOff) in tile units.
# Keys: 0=right-forward, 1=right-overhead, 2=left-forward, 3=left-overhead
SWORD_OVERLAY_OFFSETS: dict[int, list[int]] = {
    0: [-2, -2, -2, -2, -2, -1, -2, 2, -2, 2, -2, 2],
    1: [-2, -2, -2, -1, -2, 1, 1, 1],
    2: [-2, 1, -2, 1, -2, 0, -2, -3, -2, -3, -2, -3],
    3: [-2, 1, -2, 0, -2, -2, 1, -2],
}

# Default paths relative to the repository root
_DEFAULT_ASSETS_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "web", "public", "assets", "images"
)


# ---------------------------------------------------------------------------
# Hero visual state (mirrors HeroVisualState in dungeon.ts)
# ---------------------------------------------------------------------------
@dataclass
class HeroState:
    facing_left: bool = False         # ADDR_FACING & 1
    anim_phase: int = 0x80            # ADDR_HERO_ANIM_PHASE (0x80 = idle)
    invincible: bool = False          # ADDR_INVINCIBILITY_FLAG
    squat: bool = False               # ADDR_SQUAT_FLAG
    on_rope: bool = False             # ADDR_ON_ROPE_FLAGS
    hidden: bool = False              # ADDR_HERO_HIDDEN_FLAG
    jump: int = 0                     # ADDR_JUMP_PHASE_FLAGS
    shield_anim_active: bool = False   # ADDR_SHIELD_ANIM_ACTIVE
    shield_phase: int = 0             # ADDR_SHIELD_ANIM_PHASE
    shield_variant: int = 0           # ADDR_SHIELD_VARIANT_INDEX
    slope: int = 0                    # ADDR_SLOPE_DIRECTION (0/1/2)
    shield_category: int = 0          # derived: 0=none, 1=small, 2=large

    # Sword overlay state
    sword_swing_active: bool = False   # ADDR_SWORD_SWING_FLAG
    sword_hit_type: int = 0           # 0=forward, 1=overhead, 2=downward
    sword_type: int = 1               # 1..6
    sword_phase: int = 0              # stored phase (display_phase + 1, 0 = no swing)


# ---------------------------------------------------------------------------
# Frame resolution — exact ports from dungeon.ts
# ---------------------------------------------------------------------------

def resolve_body_frame(s: HeroState) -> int:
    """Port of resolveBodyFrame() from dungeon.ts:118."""
    if s.hidden:
        return 30
    if s.on_rope:
        return 26 + (s.anim_phase & 3)
    base = 13 if s.facing_left else 0
    if s.invincible:
        offset = 10 + (s.anim_phase & 3)
    elif s.squat:
        offset = 5
    elif s.jump & 0x80:
        offset = 7
    elif s.slope == 1:
        offset = 8
    elif s.slope == 2:
        offset = 9
    elif s.jump == 0x7F:
        offset = 6
    elif s.anim_phase == 0x80:
        offset = 4
    else:
        offset = s.anim_phase & 3
    return base + offset


def resolve_back_arm_frame(s: HeroState) -> Optional[int]:
    """Port of resolveBackArmFrame() from dungeon.ts:134."""
    if s.invincible or s.on_rope or s.hidden:
        return None

    arm_base = 49 if s.facing_left else 31
    shield_offset = 3 if s.shield_category == 2 else 0

    if s.shield_anim_active:
        phase = s.shield_phase // 2
        if not s.facing_left:
            return 79 + phase + (s.shield_category * 4)
        off = phase + 4
        if s.shield_variant == 1:
            off += 4
        elif s.shield_variant == 2:
            off = 11
        return arm_base + off

    if s.shield_category and not s.facing_left:
        return arm_base + 12 + (1 if s.squat else 0) + shield_offset

    if s.squat or s.anim_phase == 0x80:
        return None
    phase = (s.anim_phase + 2) & 3
    if phase & 1:
        return None
    return arm_base + phase


def resolve_front_arm_frame(s: HeroState) -> Optional[int]:
    """Port of resolveFrontArmFrame() from dungeon.ts:158."""
    arm_base = 49 if s.facing_left else 31
    shield_offset = 3 if s.shield_category == 2 else 0

    if s.invincible:
        return None

    if s.on_rope or s.hidden:
        if not s.shield_category:
            return None
        return arm_base + (17 if s.shield_category == 2 else 14)

    if s.shield_anim_active:
        phase = s.shield_phase // 2
        if s.facing_left:
            return 67 + phase + (s.shield_category * 4)
        off = phase + 4
        if s.shield_variant == 1:
            off += 4
        elif s.shield_variant == 2:
            off = 11
        return arm_base + off

    if s.shield_category and s.facing_left:
        return arm_base + 12 + (1 if s.squat else 0) + shield_offset

    if s.squat or s.anim_phase == 0x80:
        return arm_base + 3
    return arm_base + (s.anim_phase & 3)


# ---------------------------------------------------------------------------
# Sword frame resolution — port of drawDungeonSword() from dungeon.ts:762
# ---------------------------------------------------------------------------

def resolve_sword_frame(s: HeroState) -> Optional[tuple[int, int, int, int]]:
    """Return (spriteIndex, xOff, yOff, displayPhase) or None if no swing."""
    if not s.sword_swing_active or s.sword_phase == 0:
        return None

    hit_type = s.sword_hit_type
    sword_type = max(1, min(6, s.sword_type))
    facing_left = s.facing_left

    c_display_phase = s.sword_phase - 1
    display_phase = min(c_display_phase, {0: 5, 1: 3, 2: 0}.get(hit_type, 5))

    if hit_type == 1:
        col = 5 + display_phase
    elif hit_type == 2:
        col = 9
    else:
        col = min(display_phase, 4)

    base_row = (sword_type - 1) * 2
    row = base_row + (1 if facing_left else 0)
    sprite_index = row * SWORD_SHEET_COLS + col

    if hit_type == 2:
        x_off = -1 if facing_left else 0
        y_off = 1
    else:
        offset_key = (
            (2 if facing_left else 0) if hit_type == 0
            else (3 if facing_left else 1)
        )
        offsets = SWORD_OVERLAY_OFFSETS[offset_key]
        i = display_phase * 2
        y_off = offsets[i] if i < len(offsets) else 0
        x_off = offsets[i + 1] if i + 1 < len(offsets) else 0

    return sprite_index, x_off, y_off, display_phase


# ---------------------------------------------------------------------------
# Sheet helpers
# ---------------------------------------------------------------------------

def _frame_rect(frame_idx: int, sheet_cols: int, frame_w: int, frame_h: int):
    """Return (left, upper, right, lower) crop box for a frame on a sheet."""
    col = frame_idx % sheet_cols
    row = frame_idx // sheet_cols
    return (col * frame_w, row * frame_h,
            (col + 1) * frame_w, (row + 1) * frame_h)


def load_hero_sheet(path: str | None = None) -> Image.Image:
    """Load fman.png hero sprite sheet."""
    if path is None:
        path = os.path.join(_DEFAULT_ASSETS_DIR, "fman.png")
    return Image.open(path).convert("RGBA")


def load_sword_sheet(path: str | None = None) -> Image.Image:
    """Load sword.png sword overlay sprite sheet."""
    if path is None:
        path = os.path.join(_DEFAULT_ASSETS_DIR, "sword.png")
    return Image.open(path).convert("RGBA")


def get_frame(sheet: Image.Image, frame_idx: int,
              sheet_cols: int = HERO_SHEET_COLS,
              frame_w: int = HERO_FRAME_W,
              frame_h: int = HERO_FRAME_H) -> Image.Image:
    """Extract a single frame from a pre-rendered sprite sheet."""
    box = _frame_rect(frame_idx, sheet_cols, frame_w, frame_h)
    return sheet.crop(box)


# ---------------------------------------------------------------------------
# Composite rendering
# ---------------------------------------------------------------------------

def render_hero(canvas, state: HeroState,
                hero_sheet: Image.Image | None = None,
                sword_sheet: Image.Image | None = None,
                x: int = 0, y: int = 0,
                scale: int = 3):
    """Render the composite dungeon hero onto a tkinter Canvas.

    Uses pre-rendered sprite sheets (fman.png, sword.png).
    Frame resolution logic matches web/src/render/dungeon.ts 1:1.
    """
    try:
        from PIL import ImageTk
    except ImportError:
        raise RuntimeError("Pillow (PIL) is required")

    if hero_sheet is None:
        hero_sheet = load_hero_sheet()
    if sword_sheet is None:
        sword_sheet = load_sword_sheet()

    body_frame = resolve_body_frame(state)
    back_arm = resolve_back_arm_frame(state)
    front_arm = resolve_front_arm_frame(state)

    # Render each layer as a separate PhotoImage and composite on canvas.
    # tkinter composites in draw order, so: back arm → body → front arm → sword.
    def _draw_frame(frame_idx: int | None, dx: int, dy: int):
        if frame_idx is None:
            return
        col = frame_idx % HERO_SHEET_COLS
        row = frame_idx // HERO_SHEET_COLS
        left = col * HERO_FRAME_W
        upper = row * HERO_FRAME_H
        frame_img = hero_sheet.crop((left, upper,
                                     left + HERO_FRAME_W,
                                     upper + HERO_FRAME_H))
        if scale != 1:
            frame_img = frame_img.resize(
                (HERO_FRAME_W * scale, HERO_FRAME_H * scale),
                Image.Resampling.NEAREST)
        photo = ImageTk.PhotoImage(frame_img)
        key = f"_hero_lyr_{dx}_{dy}_{frame_idx}"
        setattr(canvas, key, photo)  # prevent GC
        canvas.create_image(dx * scale, dy * scale, anchor="nw", image=photo)

    _draw_frame(back_arm, x, y)
    _draw_frame(body_frame, x, y)
    _draw_frame(front_arm, x, y)

    # Sword overlay
    sword_info = resolve_sword_frame(state)
    if sword_info:
        sprite_idx, sx_off, sy_off, _ = sword_info
        sx = x + sx_off * TILE_SIZE
        sy = y + sy_off * TILE_SIZE
        s_col = sprite_idx % SWORD_SHEET_COLS
        s_row = sprite_idx // SWORD_SHEET_COLS
        left = s_col * SWORD_FRAME_W
        upper = s_row * SWORD_FRAME_H
        sword_img = sword_sheet.crop((left, upper,
                                      left + SWORD_FRAME_W,
                                      upper + SWORD_FRAME_H))
        if scale != 1:
            sword_img = sword_img.resize(
                (SWORD_FRAME_W * scale, SWORD_FRAME_H * scale),
                Image.Resampling.NEAREST)
        photo = ImageTk.PhotoImage(sword_img)
        canvas._hero_sword_ref = photo  # prevent GC
        canvas.create_image(sx * scale, sy * scale, anchor="nw", image=photo)


# ---------------------------------------------------------------------------
# CLI demo — tkinter window with radio-button controls for every state param
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title("hero_renderer")
    CANVAS_BG = "#0f0f1a"

    # --- state variables (tkinter Vars drive both UI and HeroState) --------
    v_facing     = tk.IntVar(value=0)      # 0=right, 1=left
    v_anim       = tk.StringVar(value="idle")
    v_body       = tk.StringVar(value="normal")  # normal/invincible/squat/rope/leaving
    v_jump       = tk.StringVar(value="none")
    v_slope      = tk.StringVar(value="none")
    v_shield_cat = tk.StringVar(value="none")
    v_shield_anim = tk.IntVar(value=0)
    v_shield_variant = tk.StringVar(value="0")
    v_sword_swing = tk.IntVar(value=0)
    v_sword_type  = tk.IntVar(value=1)
    v_sword_hit   = tk.StringVar(value="forward")
    v_sword_phase = tk.IntVar(value=0)

    hero_sheet = load_hero_sheet()
    sword_sheet = load_sword_sheet()

    # --- build state from UI vars ----------------------------------------
    def build_state() -> HeroState:
        anim_map = {"idle": 0x80, "0": 0, "1": 1, "2": 2, "3": 3}
        jump_map = {"none": 0, "ascent": 0x80, "descent": 0x7F}
        slope_map = {"none": 0, "\\": 1, "/": 2}
        shield_map = {"none": 0, "small": 1, "large": 2}
        hit_map = {"forward": 0, "overhead": 1, "downward": 2}
        body = v_body.get()
        # When sword swing is active, the engine overwrites shield anim state
        # with sword data (see dungeon-frame.ts:412-415)
        swing_active = v_sword_swing.get() == 1 and v_sword_phase.get() > 0
        if swing_active:
            shield_anim = True
            shield_var = hit_map.get(v_sword_hit.get(), 0)
            shield_ph = v_sword_phase.get()
        else:
            shield_anim = (v_shield_anim.get() == 1)
            shield_var = int(v_shield_variant.get())
            shield_ph = 0
        return HeroState(
            facing_left=(v_facing.get() == 1),
            anim_phase=anim_map.get(v_anim.get(), 0x80),
            invincible=(body == "invincible"),
            squat=(body == "squat"),
            on_rope=(body == "rope"),
            hidden=(body == "leaving"),
            jump=jump_map.get(v_jump.get(), 0),
            slope=slope_map.get(v_slope.get(), 0),
            shield_category=shield_map.get(v_shield_cat.get(), 0),
            shield_anim_active=shield_anim,
            shield_phase=shield_ph,
            shield_variant=shield_var,
            sword_swing_active=(v_sword_swing.get() == 1),
            sword_type=v_sword_type.get(),
            sword_hit_type=hit_map.get(v_sword_hit.get(), 0),
            sword_phase=v_sword_phase.get(),
        )

    # --- walk-phase radio buttons (dynamically enabled/disabled) ----------
    anim_buttons: dict[str, ttk.Radiobutton] = {}

    def _update_anim_buttons(*_args):
        """Enable/disable walk-phase options based on body variant and jump."""
        body = v_body.get()
        jump = v_jump.get()
        # Determine which phase values are allowed
        if body == "invincible":
            allowed = {"idle", "0", "1", "2"}
        elif body == "rope":
            allowed = {"idle", "0", "1", "2", "3"}
        elif body == "leaving":
            allowed = {"idle"}
        elif jump in ("ascent", "descent"):
            allowed = {"idle"}
        else:
            allowed = {"idle", "0", "1", "2", "3"}
        for key, btn in anim_buttons.items():
            if key in allowed:
                btn.configure(state="normal")
            else:
                btn.configure(state="disabled")
        # If current selection is not allowed, snap to idle
        if v_anim.get() not in allowed:
            v_anim.set("idle")

    v_body.trace_add("write", _update_anim_buttons)
    v_jump.trace_add("write", _update_anim_buttons)

    # --- canvas + redraw --------------------------------------------------
    canvas = tk.Canvas(root, width=400, height=400, bg=CANVAS_BG)
    canvas.grid(row=0, column=0, rowspan=20, padx=5, pady=5, sticky="nsew")

    def redraw(*_args):
        canvas.delete("all")
        render_hero(canvas, build_state(), hero_sheet, sword_sheet,
                    x=24, y=40, scale=3)

    # --- radio-button helper -----------------------------------------------
    def _rb(parent, label, var, options, row, col=0, command=None):
        f = ttk.LabelFrame(parent, text=label)
        f.grid(row=row, column=col, sticky="w", padx=4, pady=2)
        for i, (text, val) in enumerate(options):
            kw = {"text": text, "variable": var, "value": val}
            if command is not None:
                kw["command"] = command
            ttk.Radiobutton(f, **kw).pack(side="left")
        return f

    # --- controls panel ----------------------------------------------------
    ctrl = ttk.Frame(root)
    ctrl.grid(row=0, column=1, sticky="n", padx=5, pady=5)

    _rb(ctrl, "Facing", v_facing,
        [("Right", 0), ("Left", 1)], 0, command=redraw)

    # Walk phase — buttons stored for dynamic enable/disable
    anim_f = ttk.LabelFrame(ctrl, text="Walk Phase")
    anim_f.grid(row=1, column=0, sticky="w", padx=4, pady=2)
    for text, val in [("Idle", "idle"), ("0", "0"), ("1", "1"), ("2", "2"), ("3", "3")]:
        btn = ttk.Radiobutton(anim_f, text=text, variable=v_anim, value=val,
                              command=redraw)
        btn.pack(side="left")
        anim_buttons[val] = btn

    # Body variant — mutually exclusive radio buttons
    _rb(ctrl, "Body", v_body,
        [("Normal", "normal"), ("Invincible", "invincible"), ("Squat", "squat"),
         ("On Rope", "rope"), ("Leaving", "leaving")],
        2, command=redraw)

    _rb(ctrl, "Jump", v_jump,
        [("None", "none"), ("Ascent", "ascent"), ("Descent", "descent")],
        3, command=redraw)

    _rb(ctrl, "Slope", v_slope,
        [("None", "none"), ("\\", "\\"), ("/", "/")],
        4, command=redraw)

    _rb(ctrl, "Shield", v_shield_cat,
        [("None", "none"), ("Small", "small"), ("Large", "large")],
        5, command=redraw)

    shield_f = ttk.LabelFrame(ctrl, text="Shield Extras")
    shield_f.grid(row=6, column=0, sticky="w", padx=4, pady=2)
    ttk.Checkbutton(shield_f, text="Shield Anim", variable=v_shield_anim,
                    command=redraw).pack(side="left")
    ttk.Radiobutton(shield_f, text="0", variable=v_shield_variant, value="0",
                    command=redraw).pack(side="left")
    ttk.Radiobutton(shield_f, text="1", variable=v_shield_variant, value="1",
                    command=redraw).pack(side="left")
    ttk.Radiobutton(shield_f, text="2", variable=v_shield_variant, value="2",
                    command=redraw).pack(side="left")

    sword_f = ttk.LabelFrame(ctrl, text="Sword")
    sword_f.grid(row=7, column=0, sticky="w", padx=4, pady=2)

    def _on_swing_toggle(*_args):
        if v_sword_swing.get() and v_sword_phase.get() == 0:
            v_sword_phase.set(1)
        redraw()

    ttk.Checkbutton(sword_f, text="Swing Active", variable=v_sword_swing,
                    command=_on_swing_toggle).pack(side="left")
    ttk.Label(sword_f, text="Type:").pack(side="left")
    for t in range(1, 7):
        ttk.Radiobutton(sword_f, text=str(t), variable=v_sword_type, value=t,
                        command=redraw).pack(side="left")
    ttk.Label(sword_f, text="Hit:").pack(side="left")
    for text, val in [("Fwd", "forward"), ("Over", "overhead"), ("Down", "downward")]:
        ttk.Radiobutton(sword_f, text=text, variable=v_sword_hit, value=val,
                        command=redraw).pack(side="left")
    ttk.Label(sword_f, text="Phase:").pack(side="left")
    for p in range(8):
        ttk.Radiobutton(sword_f, text=str(p), variable=v_sword_phase, value=p,
                        command=redraw).pack(side="left")

    # --- initial draw + run -----------------------------------------------
    _update_anim_buttons()
    redraw()
    root.mainloop()
