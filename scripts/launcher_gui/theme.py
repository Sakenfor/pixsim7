"""
Centralized theme system for the launcher UI.
Provides consistent colors, spacing, and styling across all components.
"""

# ========== COLOR PALETTE ==========

# Background colors - Darker, sleeker palette (GitHub Dark inspired)
BG_PRIMARY = "#0d1117"      # Main background (darker)
BG_SECONDARY = "#161b22"    # Secondary panels
BG_TERTIARY = "#1f2428"     # Elevated elements (cards, buttons)
BG_HOVER = "#2d333b"        # Hover states
BG_PRESSED = "#0a0e14"      # Pressed states

# Text colors - More subtle
TEXT_PRIMARY = "#c9d1d9"    # Main text (slightly dimmer)
TEXT_SECONDARY = "#8b949e"  # Secondary text (more muted)
TEXT_DISABLED = "#484f58"   # Disabled text
TEXT_INVERSE = "#ffffff"    # Text on colored backgrounds

# Accent colors - More muted, less saturated
ACCENT_PRIMARY = "#58a6ff"  # Primary accent (softer blue)
ACCENT_HOVER = "#479af0"    # Accent hover
ACCENT_SUCCESS = "#3fb950"  # Success green (less bright)
ACCENT_WARNING = "#d29922"  # Warning orange (muted)
ACCENT_ERROR = "#f85149"    # Error red (softer)
ACCENT_INFO = "#58a6ff"     # Info blue

# Border colors - More subtle
BORDER_DEFAULT = "#30363d"  # Default borders (more subtle)
BORDER_SUBTLE = "#21262d"   # Subtle borders
BORDER_FOCUS = "#58a6ff"    # Focused elements

# Status colors - Muted versions
STATUS_HEALTHY = "#3fb950"
STATUS_STARTING = "#d29922"
STATUS_STOPPED = "#484f58"
STATUS_ERROR = "#f85149"

# ========== SPACING SYSTEM ==========
# Reduced spacing for more compact UI

SPACING_XS = 3
SPACING_SM = 4
SPACING_MD = 6
SPACING_LG = 8
SPACING_XL = 10
SPACING_XXL = 12

# ========== SIZING SYSTEM ==========

# Button heights - Smaller for sleeker look
BUTTON_HEIGHT_SM = 22
BUTTON_HEIGHT_MD = 24
BUTTON_HEIGHT_LG = 28

# Icon button sizes
ICON_BUTTON_SM = 28
ICON_BUTTON_MD = 32
ICON_BUTTON_LG = 36

# Font sizes
FONT_SIZE_XS = "8pt"
FONT_SIZE_SM = "9pt"
FONT_SIZE_MD = "10pt"
FONT_SIZE_LG = "11pt"
FONT_SIZE_XL = "13pt"

# Border radius
RADIUS_SM = 3
RADIUS_MD = 4
RADIUS_LG = 6
RADIUS_ROUND = 999  # For circular elements

# ========== COMMON STYLESHEETS ==========

def get_base_stylesheet():
    """Get the base stylesheet for the entire application."""
    return f"""
        QWidget {{
            background-color: {BG_PRIMARY};
            color: {TEXT_PRIMARY};
        }}
        QLabel {{
            color: {TEXT_PRIMARY};
            background-color: transparent;
        }}
        QScrollArea {{
            background-color: {BG_PRIMARY};
            border: none;
        }}
        QFrame {{
            background-color: transparent;
        }}
    """

def get_button_stylesheet():
    """Get the standard button stylesheet."""
    return f"""
        QPushButton {{
            background-color: {BG_TERTIARY};
            color: {TEXT_PRIMARY};
            border: 1px solid {BORDER_DEFAULT};
            border-radius: {RADIUS_MD}px;
            padding: {SPACING_SM}px {SPACING_LG}px;
            font-weight: 500;
            min-height: {BUTTON_HEIGHT_MD}px;
        }}
        QPushButton:hover {{
            background-color: {BG_HOVER};
            border: 1px solid {BORDER_FOCUS};
        }}
        QPushButton:pressed {{
            background-color: {BG_PRESSED};
        }}
        QPushButton:disabled {{
            background-color: {BG_SECONDARY};
            color: {TEXT_DISABLED};
            border: 1px solid {BORDER_SUBTLE};
        }}
    """

def get_primary_button_stylesheet():
    """Get the primary (accent) button stylesheet."""
    return f"""
        QPushButton {{
            background-color: {ACCENT_PRIMARY};
            color: {TEXT_INVERSE};
            border: none;
            border-radius: {RADIUS_MD}px;
            padding: {SPACING_SM}px {SPACING_LG}px;
            font-weight: 600;
            min-height: {BUTTON_HEIGHT_MD}px;
        }}
        QPushButton:hover {{
            background-color: {ACCENT_HOVER};
        }}
        QPushButton:pressed {{
            background-color: #3a7fa4;
        }}
        QPushButton:disabled {{
            background-color: {BG_SECONDARY};
            color: {TEXT_DISABLED};
        }}
    """

def get_icon_button_stylesheet(size="md"):
    """Get stylesheet for icon-only buttons."""
    sizes = {
        "sm": ICON_BUTTON_SM,
        "md": ICON_BUTTON_MD,
        "lg": ICON_BUTTON_LG
    }
    btn_size = sizes.get(size, ICON_BUTTON_MD)

    return f"""
        QPushButton {{
            background-color: {BG_TERTIARY};
            color: {TEXT_PRIMARY};
            border: 1px solid {BORDER_DEFAULT};
            border-radius: {RADIUS_MD}px;
            padding: 0px;
            min-width: {btn_size}px;
            max-width: {btn_size}px;
            min-height: {btn_size}px;
            max-height: {btn_size}px;
        }}
        QPushButton:hover {{
            background-color: {BG_HOVER};
            border: 1px solid {BORDER_FOCUS};
        }}
        QPushButton:pressed {{
            background-color: {BG_PRESSED};
        }}
    """

def get_settings_button_stylesheet():
    """Get stylesheet for the settings gear button."""
    return f"""
        QPushButton {{
            background-color: {ACCENT_PRIMARY};
            color: white;
            border: none;
            border-radius: {ICON_BUTTON_MD // 2}px;
            font-size: 14px;
            padding: 0px;
        }}
        QPushButton:hover {{
            background-color: {ACCENT_HOVER};
        }}
        QPushButton:pressed {{
            background-color: #3a7fa4;
        }}
    """

def get_input_stylesheet():
    """Get stylesheet for text inputs."""
    return f"""
        QLineEdit {{
            border: 1px solid {BORDER_DEFAULT};
            border-radius: {RADIUS_MD}px;
            padding: {SPACING_SM}px {SPACING_MD}px;
            background-color: {BG_TERTIARY};
            color: {TEXT_PRIMARY};
            font-size: {FONT_SIZE_SM};
        }}
        QLineEdit:focus {{
            border: 1px solid {BORDER_FOCUS};
        }}
    """

def get_combobox_stylesheet():
    """Get stylesheet for combo boxes."""
    return f"""
        QComboBox {{
            background-color: {BG_TERTIARY};
            color: {TEXT_PRIMARY};
            padding: {SPACING_XS}px {SPACING_SM}px;
            border: 1px solid {BORDER_DEFAULT};
            border-radius: {RADIUS_MD}px;
            font-size: {FONT_SIZE_SM};
        }}
        QComboBox:hover {{
            border: 1px solid {BORDER_FOCUS};
        }}
        QComboBox::drop-down {{
            border: none;
        }}
        QComboBox QAbstractItemView {{
            background-color: {BG_TERTIARY};
            color: {TEXT_PRIMARY};
            selection-background-color: {ACCENT_PRIMARY};
            border: 1px solid {BORDER_DEFAULT};
        }}
    """

def get_tab_widget_stylesheet():
    """Get stylesheet for tab widgets."""
    return f"""
        QTabWidget::pane {{
            border: 1px solid {BORDER_DEFAULT};
            border-radius: {RADIUS_MD}px;
            background: {BG_PRIMARY};
        }}
        QTabBar::tab {{
            background: {BG_TERTIARY};
            color: {TEXT_PRIMARY};
            padding: {SPACING_SM}px {SPACING_LG}px;
            margin-right: 2px;
            border-top-left-radius: {RADIUS_MD}px;
            border-top-right-radius: {RADIUS_MD}px;
            font-weight: 500;
            font-size: {FONT_SIZE_SM};
            border: 1px solid {BORDER_DEFAULT};
            border-bottom: none;
        }}
        QTabBar::tab:selected {{
            background: {ACCENT_PRIMARY};
            color: {TEXT_INVERSE};
        }}
        QTabBar::tab:hover:!selected {{
            background: {BG_HOVER};
        }}
    """

def get_status_label_stylesheet():
    """Get stylesheet for status labels."""
    return f"""
        QLabel {{
            background-color: {BG_SECONDARY};
            border: 1px solid {BORDER_DEFAULT};
            border-radius: {RADIUS_MD}px;
            padding: {SPACING_SM}px {SPACING_MD}px;
            font-size: {FONT_SIZE_SM};
            font-weight: 500;
            color: {TEXT_SECONDARY};
        }}
    """

def get_group_frame_stylesheet():
    """Get stylesheet for grouped sections."""
    return f"""
        QFrame {{
            background-color: {BG_SECONDARY};
            border: 1px solid {BORDER_DEFAULT};
            border-radius: {RADIUS_LG}px;
            padding: {SPACING_LG}px;
        }}
    """

def get_text_browser_stylesheet():
    """Get stylesheet for log/console text browsers."""
    return f"""
        QTextBrowser {{
            background-color: {BG_SECONDARY};
            color: #d4d4d4;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: {FONT_SIZE_SM};
            border: 1px solid {BORDER_DEFAULT};
            border-radius: {RADIUS_MD}px;
            padding: {SPACING_SM}px;
        }}
    """

def get_checkbox_stylesheet():
    """Get stylesheet for checkboxes."""
    return f"""
        QCheckBox {{
            color: {TEXT_PRIMARY};
            spacing: {SPACING_SM}px;
            font-size: {FONT_SIZE_SM};
        }}
        QCheckBox::indicator {{
            width: 16px;
            height: 16px;
            border-radius: {RADIUS_SM}px;
            border: 1px solid {BORDER_DEFAULT};
            background-color: {BG_TERTIARY};
        }}
        QCheckBox::indicator:hover {{
            border: 1px solid {BORDER_FOCUS};
        }}
        QCheckBox::indicator:checked {{
            background-color: {ACCENT_PRIMARY};
            border: 1px solid {ACCENT_PRIMARY};
        }}
    """
