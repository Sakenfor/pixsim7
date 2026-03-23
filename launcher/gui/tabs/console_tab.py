"""
Console Tab for Launcher

Creates and configures the console logs tab with filtering and search.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QLineEdit, QCheckBox, QComboBox, QToolButton, QMenu
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont, QShortcut, QKeySequence

try:
    from .. import theme
    from ..log_view_widget import LogViewWidget
except ImportError:
    import theme
    from log_view_widget import LogViewWidget


class ConsoleTab:
    """
    Console tab builder for the launcher.

    Creates the console logs view with filtering, search, and controls.
    """

    @staticmethod
    def create(launcher):
        """
        Create the console logs tab.

        Args:
            launcher: LauncherWindow instance (needs attributes set on it)

        Returns:
            QWidget: The console tab widget
        """
        console_tab = QWidget()
        console_layout = QVBoxLayout(console_tab)

        # Helper to register widget and set launcher attribute
        def reg(key, widget):
            launcher.register_widget(key, widget)
            setattr(launcher, key, widget)
            return widget

        # Console header - show current service name
        console_header_layout = QHBoxLayout()

        log_service_label = reg('log_service_label', QLabel())
        log_service_font = QFont()
        log_service_font.setPointSize(12)
        log_service_font.setBold(True)
        log_service_label.setFont(log_service_font)
        log_service_label.setStyleSheet(f"color: {theme.TEXT_PRIMARY};")
        console_header_layout.addWidget(log_service_label)

        console_header_layout.addStretch()
        console_layout.addLayout(console_header_layout)

        # Compact toolbar with filters and actions
        toolbar = QHBoxLayout()
        toolbar.setSpacing(8)

        # Filter section
        console_level_combo = reg('console_level_combo', QComboBox())
        for lvl in ["All", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
            console_level_combo.addItem(lvl)
        console_level_combo.setCurrentText("All")
        console_level_combo.setFixedWidth(90)
        console_level_combo.setToolTip("Filter by log level")
        console_level_combo.setStyleSheet(theme.get_combobox_stylesheet())
        console_level_combo.currentTextChanged.connect(lambda _: launcher._on_console_filter_changed())
        toolbar.addWidget(console_level_combo)

        # Scope filter buttons — one per category, multi-toggle menus
        scope_actions = {}

        menu_stylesheet = f"""
            QMenu {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                padding: 4px 0;
            }}
            QMenu::item {{
                padding: 4px 16px 4px 24px;
            }}
            QMenu::item:hover {{
                background-color: {theme.BG_HOVER};
            }}
            QMenu::indicator {{
                width: 14px; height: 14px;
                margin-left: 6px;
            }}
            QMenu::indicator:checked {{
                image: none;
                background-color: {theme.ACCENT_SUCCESS};
                border: 1px solid {theme.ACCENT_SUCCESS};
                border-radius: 2px;
            }}
            QMenu::indicator:unchecked {{
                image: none;
                background-color: transparent;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: 2px;
            }}
        """

        btn_style_inactive = f"""
            QToolButton {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
                padding: 0 8px;
                font-size: {theme.FONT_SIZE_SM};
            }}
            QToolButton:hover {{
                border: 1px solid {theme.BORDER_FOCUS};
            }}
            QToolButton::menu-indicator {{ image: none; }}
        """
        btn_style_active = f"""
            QToolButton {{
                background-color: #1a3a2a;
                color: {theme.ACCENT_SUCCESS};
                border: 1px solid {theme.ACCENT_SUCCESS};
                border-radius: {theme.RADIUS_MD}px;
                padding: 0 8px;
                font-size: {theme.FONT_SIZE_SM};
            }}
            QToolButton:hover {{
                border: 1px solid {theme.BORDER_FOCUS};
            }}
            QToolButton::menu-indicator {{ image: none; }}
        """

        def _make_scope_button(label, key_prefix, items=()):
            btn = QToolButton()
            btn.setText(f'{label} \u25BE')
            btn.setPopupMode(QToolButton.InstantPopup)
            btn.setFixedHeight(24)
            btn.setToolTip(f"Filter logs by {label.lower()}")
            btn.setStyleSheet(btn_style_inactive)

            menu = QMenu(btn)
            menu.setStyleSheet(menu_stylesheet)
            btn.setMenu(menu)

            def _update_label():
                count = sum(1 for k, a in scope_actions.items()
                            if k.startswith(key_prefix + ':') and a.isChecked())
                if count:
                    btn.setText(f'{label} ({count}) \u25BE')
                    btn.setStyleSheet(btn_style_active)
                else:
                    btn.setText(f'{label} \u25BE')
                    btn.setStyleSheet(btn_style_inactive)

            def _on_toggled(checked):
                _update_label()
                launcher._on_console_filter_changed()
                menu.show()

            def _rebuild_items(new_items):
                """Replace menu items, preserving checked state for items that still exist."""
                # Snapshot current checked keys
                prev_checked = {
                    k for k, a in scope_actions.items()
                    if k.startswith(key_prefix + ':') and a.isChecked()
                }
                # Remove old actions from scope_actions and menu
                for k in [k for k in scope_actions if k.startswith(key_prefix + ':')]:
                    del scope_actions[k]
                menu.clear()
                # Add new items
                for item in new_items:
                    act = menu.addAction(item)
                    act.setCheckable(True)
                    act.setChecked(f"{key_prefix}:{item}" in prev_checked)
                    act.triggered.connect(_on_toggled)
                    scope_actions[f"{key_prefix}:{item}"] = act
                _update_label()

            # Initial population
            _rebuild_items(items)

            btn._update_scope_label = _update_label
            btn._rebuild_items = _rebuild_items
            return btn

        # Start empty — items are rebuilt dynamically from the selected
        # service's log buffer in _rebuild_scope_menus_from_buffer()
        domain_btn = _make_scope_button("Domain", "domain")
        reg('console_domain_button', domain_btn)
        toolbar.addWidget(domain_btn)

        service_btn = _make_scope_button("Service", "service")
        reg('console_service_button', service_btn)
        toolbar.addWidget(service_btn)

        # Store actions dict on launcher for filter logic
        launcher.console_scope_actions = scope_actions

        console_search_input = reg('console_search_input', QLineEdit())
        console_search_input.setPlaceholderText("Search logs (Ctrl+F)...")
        console_search_input.setFixedWidth(180)
        console_search_input.textChanged.connect(lambda _: launcher._on_console_filter_changed())
        toolbar.addWidget(console_search_input)

        console_style_checkbox = reg('console_style_checkbox', QCheckBox("Readable view"))
        console_style_checkbox.setChecked(True)
        console_style_checkbox.setToolTip("Toggle enhanced console row layout")
        console_style_checkbox.toggled.connect(launcher._on_console_style_changed)
        toolbar.addWidget(console_style_checkbox)

        # Action buttons (compact)
        btn_refresh_logs = reg('btn_refresh_logs', QPushButton('\U0001F504'))
        btn_refresh_logs.setToolTip("Refresh console logs (F5)")
        btn_refresh_logs.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        toolbar.addWidget(btn_refresh_logs)

        btn_clear_logs = reg('btn_clear_logs', QPushButton('\U0001F5D1'))
        btn_clear_logs.setToolTip("Clear console logs (Ctrl+L)")
        btn_clear_logs.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        toolbar.addWidget(btn_clear_logs)

        btn_copy_logs = reg('btn_copy_logs', QPushButton('\U0001F4CB'))
        btn_copy_logs.setToolTip("Copy visible logs as plain text (Ctrl+Shift+C)")
        btn_copy_logs.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        btn_copy_logs.clicked.connect(launcher._copy_console_logs_plain)
        toolbar.addWidget(btn_copy_logs)

        autoscroll_checkbox = reg('autoscroll_checkbox', QCheckBox('Force scroll'))
        autoscroll_checkbox.setChecked(False)  # Default OFF for smart scroll
        autoscroll_checkbox.setToolTip(
            "OFF: Smart scroll (follows logs only when you're at bottom)\n"
            "ON: Force scroll (always jumps to bottom, even if you scrolled up)"
        )
        autoscroll_checkbox.stateChanged.connect(launcher._on_autoscroll_changed)
        toolbar.addWidget(autoscroll_checkbox)

        # Pause logs button
        pause_logs_button = reg('pause_logs_button', QPushButton('\u23F8 Pause'))
        pause_logs_button.setCheckable(True)
        pause_logs_button.setChecked(False)
        pause_logs_button.setToolTip("Pause log updates to scroll through history")
        pause_logs_button.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        pause_logs_button.setFocusPolicy(Qt.NoFocus)  # Prevent accidental Space/Enter toggle
        pause_logs_button.toggled.connect(launcher._on_pause_logs_changed)
        toolbar.addWidget(pause_logs_button)

        # Attach logs button for externally started services
        btn_attach_logs = reg('btn_attach_logs', QPushButton('Attach'))
        btn_attach_logs.setToolTip("Attach to this service's log file (useful if it was started externally)")
        btn_attach_logs.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        toolbar.addWidget(btn_attach_logs)

        toolbar.addStretch()
        console_layout.addLayout(toolbar)

        # Use unified LogViewWidget for smart scrolling
        log_view = reg('log_view', LogViewWidget())
        log_view.setStyleSheet(theme.get_text_browser_stylesheet())
        # Let launcher handle clicks (e.g., DB filters) instead of opening links directly
        log_view.setOpenLinks(False)
        log_view.setOpenExternalLinks(False)
        try:
            log_view.anchorClicked.connect(launcher._on_console_link_clicked)
        except Exception:
            # Fallback: if handler is missing for some reason, just ignore anchor clicks
            pass
        console_layout.addWidget(log_view)

        # Add keyboard shortcuts for console (not registered - owned by console_tab widget)
        launcher.console_refresh_shortcut = QShortcut(QKeySequence('F5'), console_tab)
        launcher.console_refresh_shortcut.activated.connect(lambda: launcher._refresh_console_logs(force=True))
        launcher.console_clear_shortcut = QShortcut(QKeySequence('Ctrl+L'), console_tab)
        launcher.console_clear_shortcut.activated.connect(launcher._clear_console_display)

        # Copy logs shortcut
        launcher.console_copy_shortcut = QShortcut(QKeySequence('Ctrl+Shift+C'), console_tab)
        launcher.console_copy_shortcut.activated.connect(launcher._copy_console_logs_plain)

        # Quick focus on console search
        launcher.console_search_shortcut = QShortcut(QKeySequence('Ctrl+F'), console_tab)
        launcher.console_search_shortcut.activated.connect(lambda: console_search_input.setFocus())

        return console_tab
