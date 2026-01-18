"""
Tab Builder - Standardized components for sidebar + stacked widget tabs.

Provides helpers to create consistent tab layouts across the launcher.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QListWidget, QStackedWidget, QTreeWidget, QTreeWidgetItem
)
from PySide6.QtCore import Qt
from typing import Callable, List, Tuple, Optional, Dict

try:
    from .. import theme
except ImportError:
    import theme


class TabBuilder:
    """
    Builder for creating sidebar + stacked widget tabs.

    Usage (flat):
        builder = TabBuilder()
        builder.add_page("Features", create_features_page)
        builder.add_page("Metrics", create_metrics_page)
        return builder.build()

    Usage (nested):
        builder = TabBuilder()
        builder.add_page("Migrations", create_migrations, category="Database")
        builder.add_page("Git", create_git, category="Development")
        builder.add_page("Logs", create_logs, category="Development")
        return builder.build()
    """

    def __init__(self, sidebar_width: int = 160):
        self._sidebar_width = sidebar_width
        self._pages: List[Tuple[str, Callable[[], QWidget], Optional[str]]] = []
        self._categories: Dict[str, List[int]] = {}  # category -> list of page indices

    def add_page(
        self, label: str, factory: Callable[[], QWidget], category: Optional[str] = None
    ) -> "TabBuilder":
        """Add a page with a sidebar label and factory function."""
        idx = len(self._pages)
        self._pages.append((label, factory, category))
        if category:
            if category not in self._categories:
                self._categories[category] = []
            self._categories[category].append(idx)
        return self

    def build(self) -> Tuple[QWidget, QWidget, QStackedWidget]:
        """
        Build the tab widget.

        Returns:
            (container, sidebar, stack) - Container widget, sidebar widget, and stacked pages
        """
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(
            theme.SPACING_LG, theme.SPACING_LG,
            theme.SPACING_LG, theme.SPACING_LG
        )
        layout.setSpacing(theme.SPACING_LG)

        content_row = QHBoxLayout()

        # Determine if we need nested (tree) or flat (list) sidebar
        has_categories = any(cat is not None for _, _, cat in self._pages)

        if has_categories:
            sidebar, stack = self._build_tree_sidebar()
        else:
            sidebar, stack = self._build_list_sidebar()

        content_row.addWidget(sidebar)
        content_row.addWidget(stack, 1)
        layout.addLayout(content_row)

        return container, sidebar, stack

    def _build_list_sidebar(self) -> Tuple[QListWidget, QStackedWidget]:
        """Build flat list sidebar (original behavior)."""
        sidebar = QListWidget()
        sidebar.addItems([label for label, _, _ in self._pages])
        sidebar.setFixedWidth(self._sidebar_width)
        sidebar.setCurrentRow(0)

        stack = QStackedWidget()
        for _, factory, _ in self._pages:
            stack.addWidget(factory())

        sidebar.currentRowChanged.connect(stack.setCurrentIndex)
        return sidebar, stack

    def _build_tree_sidebar(self) -> Tuple[QTreeWidget, QStackedWidget]:
        """Build nested tree sidebar with expandable categories."""
        sidebar = QTreeWidget()
        sidebar.setHeaderHidden(True)
        sidebar.setFixedWidth(self._sidebar_width)
        sidebar.setIndentation(12)
        sidebar.setStyleSheet(f"""
            QTreeWidget {{
                background-color: {theme.BG_SECONDARY};
                border: none;
                outline: none;
            }}
            QTreeWidget::item {{
                padding: 5px 6px;
                border-radius: {theme.RADIUS_SM}px;
            }}
            QTreeWidget::item:selected {{
                background-color: {theme.ACCENT_PRIMARY};
                color: {theme.TEXT_INVERSE};
            }}
            QTreeWidget::item:hover:!selected {{
                background-color: {theme.BG_TERTIARY};
            }}
            QTreeWidget::branch {{
                background: transparent;
            }}
        """)

        stack = QStackedWidget()

        # Map from tree item to stack index
        item_to_index: Dict[int, int] = {}

        # Track category items for toggle behavior
        category_items: Dict[str, QTreeWidgetItem] = {}
        category_ids: set = set()

        # First pass: create category items with arrow indicators
        for cat_name in self._categories.keys():
            cat_item = QTreeWidgetItem(sidebar, [f"▼ {cat_name}"])
            cat_item.setFlags(cat_item.flags() & ~Qt.ItemIsSelectable)
            font = cat_item.font(0)
            font.setBold(True)
            cat_item.setFont(0, font)
            cat_item.setExpanded(True)
            category_items[cat_name] = cat_item
            category_ids.add(id(cat_item))

        # Second pass: add pages
        for idx, (label, factory, category) in enumerate(self._pages):
            widget = factory()
            stack_idx = stack.addWidget(widget)

            if category and category in category_items:
                # Nested under category
                item = QTreeWidgetItem(category_items[category], [label])
            else:
                # Top-level item
                item = QTreeWidgetItem(sidebar, [label])

            item_to_index[id(item)] = stack_idx

        def on_item_clicked(item, column):
            item_id = id(item)
            # If it's a category header, toggle expand/collapse
            if item_id in category_ids:
                is_expanded = item.isExpanded()
                item.setExpanded(not is_expanded)
                # Update arrow indicator
                text = item.text(0)
                if text.startswith("▼ "):
                    item.setText(0, "▶ " + text[2:])
                elif text.startswith("▶ "):
                    item.setText(0, "▼ " + text[2:])
            elif item_id in item_to_index:
                stack.setCurrentIndex(item_to_index[item_id])

        def on_item_expanded(item):
            text = item.text(0)
            if text.startswith("▶ "):
                item.setText(0, "▼ " + text[2:])

        def on_item_collapsed(item):
            text = item.text(0)
            if text.startswith("▼ "):
                item.setText(0, "▶ " + text[2:])

        sidebar.itemClicked.connect(on_item_clicked)
        sidebar.itemExpanded.connect(on_item_expanded)
        sidebar.itemCollapsed.connect(on_item_collapsed)

        # Select first selectable item
        for i in range(sidebar.topLevelItemCount()):
            top_item = sidebar.topLevelItem(i)
            if top_item.flags() & Qt.ItemIsSelectable:
                sidebar.setCurrentItem(top_item)
                if id(top_item) in item_to_index:
                    stack.setCurrentIndex(item_to_index[id(top_item)])
                break
            # Check children
            for j in range(top_item.childCount()):
                child = top_item.child(j)
                sidebar.setCurrentItem(child)
                if id(child) in item_to_index:
                    stack.setCurrentIndex(item_to_index[id(child)])
                break
            else:
                continue
            break

        return sidebar, stack


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
