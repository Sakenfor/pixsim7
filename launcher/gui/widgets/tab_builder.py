"""
Tab Builder - Standardized components for sidebar + stacked widget tabs.

Provides helpers to create consistent tab layouts across the launcher.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QListWidget, QStackedWidget
)
from typing import Callable, List, Tuple, Optional

try:
    from .. import theme
except ImportError:
    import theme


class TabBuilder:
    """
    Builder for creating sidebar + stacked widget tabs.

    Usage:
        builder = TabBuilder()
        builder.add_page("Features", create_features_page)
        builder.add_page("Metrics", create_metrics_page)
        return builder.build()
    """

    def __init__(self, sidebar_width: int = 160):
        self._sidebar_width = sidebar_width
        self._pages: List[Tuple[str, Callable[[], QWidget]]] = []

    def add_page(self, label: str, factory: Callable[[], QWidget]) -> "TabBuilder":
        """Add a page with a sidebar label and factory function."""
        self._pages.append((label, factory))
        return self

    def build(self) -> Tuple[QWidget, QListWidget, QStackedWidget]:
        """
        Build the tab widget.

        Returns:
            (container, sidebar, stack) - Container widget, sidebar list, and stacked pages
        """
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(
            theme.SPACING_LG, theme.SPACING_LG,
            theme.SPACING_LG, theme.SPACING_LG
        )
        layout.setSpacing(theme.SPACING_LG)

        content_row = QHBoxLayout()

        # Sidebar
        sidebar = QListWidget()
        sidebar.addItems([label for label, _ in self._pages])
        sidebar.setFixedWidth(self._sidebar_width)
        sidebar.setCurrentRow(0)
        content_row.addWidget(sidebar)

        # Stacked pages
        stack = QStackedWidget()
        for _, factory in self._pages:
            stack.addWidget(factory())
        content_row.addWidget(stack, 1)

        sidebar.currentRowChanged.connect(stack.setCurrentIndex)
        layout.addLayout(content_row)

        return container, sidebar, stack


def create_page(title: str = None, description: str = None) -> Tuple[QWidget, QVBoxLayout]:
    """
    Create a standard page with optional header and description.

    Args:
        title: Page header title (optional)
        description: Descriptive text below header (optional)

    Returns:
        (page, layout) - The page widget and its layout
    """
    page = QWidget()
    layout = QVBoxLayout(page)
    layout.setContentsMargins(16, 16, 16, 16)
    layout.setSpacing(12)

    if title:
        header = QLabel(title)
        header.setStyleSheet(
            f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; "
            f"color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;"
        )
        layout.addWidget(header)

    if description:
        desc = QLabel(description)
        desc.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        desc.setWordWrap(True)
        layout.addWidget(desc)

    return page, layout


def create_styled_frame() -> Tuple[QFrame, QVBoxLayout]:
    """
    Create a styled frame with standard styling.

    Returns:
        (frame, layout) - The frame and its layout
    """
    frame = QFrame()
    frame.setFrameShape(QFrame.Shape.StyledPanel)
    frame.setStyleSheet(theme.get_group_frame_stylesheet())
    layout = QVBoxLayout(frame)
    layout.setSpacing(8)
    return frame, layout


def create_section_label(text: str) -> QLabel:
    """
    Create a styled section/subsection label.

    Args:
        text: Label text (e.g., "Git", "Logging")

    Returns:
        Styled QLabel
    """
    label = QLabel(text)
    label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
    return label


def create_info_label(text: str) -> QLabel:
    """
    Create an info/count label (e.g., "15 features registered").

    Args:
        text: Label text

    Returns:
        Styled QLabel
    """
    label = QLabel(text)
    label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
    return label
