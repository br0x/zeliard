"""
Zeliard MDT Viewer
==================
A viewer for Zeliard (Game Arts / Sierra On-Line, 1987) MDT map files.

Packages:
  app        - Main tkinter application shell
  core       - MDT constants, data models, and decoders
  rendering  - Map renderer and tile graphics support
  archives   - SAR archive reader
  common_ui  - Reusable Tkinter widgets
  viewer_ui  - MDTViewer-specific UI panels and dialogs

Usage:
  python -m MDTViewer
"""

from .viewer import MDTViewer

__all__ = ['MDTViewer']
