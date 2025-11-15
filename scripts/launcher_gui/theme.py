"""
Centralized theme system for the launcher UI.
Provides consistent colors, spacing, and styling across all components.
"""

# ========== COLOR PALETTE ==========

# Background colors
BG_PRIMARY = "#1e1e1e"      # Main background
BG_SECONDARY = "#252525"    # Secondary panels
BG_TERTIARY = "#2d2d2d"     # Elevated elements (cards, buttons)
BG_HOVER = "#353535"        # Hover states
BG_PRESSED = "#1a1a1a"      # Pressed states

# Text colors
TEXT_PRIMARY = "#e0e0e0"    # Main text
TEXT_SECONDARY = "#a0a0a0"  # Secondary text
TEXT_DISABLED = "#666666"   # Disabled text
TEXT_INVERSE = "#ffffff"    # Text on colored backgrounds

# Accent colors
ACCENT_PRIMARY = "#5a9fd4"  # Primary accent (blue)
ACCENT_HOVER = "#4a8fc4"    # Accent hover
ACCENT_SUCCESS = "#81C784"  # Success green
ACCENT_WARNING = "#FFB74D"  # Warning orange
ACCENT_ERROR = "#EF5350"    # Error red
ACCENT_INFO = "#64B5F6"     # Info blue

# Border colors
BORDER_DEFAULT = "#404040"  # Default borders
BORDER_SUBTLE = "#333333"   # Subtle borders
BORDER_FOCUS = "#5a9fd4"    # Focused elements

# Status colors
STATUS_HEALTHY = "#81C784"
STATUS_STARTING = "#FFB74D"
STATUS_STOPPED = "#666666"
STATUS_ERROR = "#EF5350"

# ========== SPACING SYSTEM ==========

SPACING_XS = 4
SPACING_SM = 6
SPACING_MD = 8
SPACING_LG = 12
SPACING_XL = 16
SPACING_XXL = 20

# ========== SIZING SYSTEM ==========

# Button heights
BUTTON_HEIGHT_SM = 24
BUTTON_HEIGHT_MD = 28
BUTTON_HEIGHT_LG = 32

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
