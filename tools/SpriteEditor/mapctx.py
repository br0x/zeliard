import tkinter as tk
from typing import Optional

from .models import MdtData


class MapContext:
    """Holds all data and canvas references for a single opened MDT map."""
    def __init__(self, path: str, mdt: MdtData, raw_data: bytes):
        self.path = path
        self.mdt = mdt
        self.raw_data = raw_data
        # Per-map image caches (key = (tile_id, block_size, use_checker) or source variant)
        self.tile_images: dict = {}
        self.source_tile_cache: dict = {}
        # Canvas overlay IDs for this map
        self.overlay_ids: list[int] = []
        self.tile_id_overlay_ids: list[int] = []
        # Canvas widget and scrollbars (filled after creation)
        self.canvas: Optional[tk.Canvas] = None
        self.vsb: Optional[tk.Scrollbar] = None
        self.hsb: Optional[tk.Scrollbar] = None
