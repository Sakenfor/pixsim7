"""
Icons - Centralized icon definitions for the launcher.

Uses text symbols that render reliably across fonts.
Provides both icon characters and full tab labels.
"""

# Button icons (single characters)
ICON_SETTINGS = "\u2699"      # gear
ICON_RELOAD = "\u21BB"        # clockwise arrow
ICON_PLAY = "\u25B6"          # play triangle
ICON_STOP = "\u25A0"          # stop square
ICON_DOCS = "\u2197"          # external link arrow
ICON_EXPAND = "\u2195"        # expand vertical
ICON_COLLAPSE = "\u2012"      # collapse horizontal

# Tab labels (icon + text)
TAB_CONSOLE = "\u2630 Console"
TAB_DB_LOGS = "\u2637 Database Logs"
TAB_TOOLS = "\u2692 Tools"
TAB_DIAGNOSTICS = "\u2697 Diagnostics"
TAB_SETTINGS = "\u2699 Settings"
TAB_ARCHITECTURE = "\u2302 Architecture"

# Fallback text versions (if unicode doesn't render)
FALLBACK = {
    "settings": "[S]",
    "reload": "[R]",
    "play": "[>]",
    "stop": "[X]",
    "docs": "[^]",
}
