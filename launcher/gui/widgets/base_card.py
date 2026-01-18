"""
Base card widget with shared selection and styling logic.

Provides common functionality for selectable cards in the launcher.
"""
from PySide6.QtWidgets import QFrame
from PySide6.QtCore import Qt, Signal

try:
    from .. import theme
except ImportError:
    import theme


class BaseCard(QFrame):
    """
    Base class for selectable card widgets.

    Provides:
    - Click-to-select behavior with `clicked` signal
    - Visual selection state with `set_selected()`
    - Consistent styling across card types
    """
    clicked = Signal(str)  # Emits card identifier when clicked

    def __init__(self, card_id: str, parent=None):
        super().__init__(parent)
        self.card_id = card_id
        self.is_selected = False

        self.setFrameShape(QFrame.StyledPanel)
        self.setFrameShadow(QFrame.Raised)
        self.setLineWidth(1)
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(54)
        self.setMaximumHeight(120)

        self._apply_base_style()

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.clicked.emit(self.card_id)
        super().mousePressEvent(event)

    def set_selected(self, selected: bool):
        """Update the visual selection state."""
        self.is_selected = selected
        self._apply_base_style()

    def _apply_base_style(self):
        """Apply styling based on selection state. Override for custom styling."""
        if self.is_selected:
            self.setStyleSheet(f"""
                {self.__class__.__name__} {{
                    background-color: {theme.BG_HOVER};
                    border: 1px solid {theme.ACCENT_PRIMARY};
                    border-radius: {theme.RADIUS_MD}px;
                }}
                QLabel {{ background: transparent; color: {theme.TEXT_PRIMARY}; }}
            """)
        else:
            self.setStyleSheet(f"""
                {self.__class__.__name__} {{
                    background-color: {theme.BG_TERTIARY};
                    border: 1px solid {theme.BORDER_DEFAULT};
                    border-radius: {theme.RADIUS_MD}px;
                }}
                {self.__class__.__name__}:hover {{
                    background-color: {theme.BG_HOVER};
                    border: 1px solid {theme.BORDER_FOCUS};
                }}
                QLabel {{ background: transparent; color: {theme.TEXT_PRIMARY}; }}
            """)

    def _get_status_color(self) -> str:
        """Override to return status-based border color for selected state."""
        return theme.ACCENT_PRIMARY
