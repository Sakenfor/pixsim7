"""
Console Tab for Launcher

Creates and configures the console logs tab with filtering and search.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QLineEdit, QCheckBox, QComboBox
)
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

        # Console header
        console_header_layout = QHBoxLayout()
        console_header_label = QLabel("Service Console")
        console_header_font = QFont()
        console_header_font.setPointSize(13)
        console_header_font.setBold(True)
        console_header_label.setFont(console_header_font)
        console_header_layout.addWidget(console_header_label)

        launcher.log_service_label = QLabel()
        log_service_font = QFont()
        log_service_font.setPointSize(10)
        launcher.log_service_label.setFont(log_service_font)
        launcher.log_service_label.setStyleSheet("color: #555; padding-left: 10px; font-weight: 500;")
        console_header_layout.addWidget(launcher.log_service_label)

        # Quick navigation into DB logs for the same service
        launcher.btn_open_db_logs = QPushButton("Open DB Logs ▶")
        launcher.btn_open_db_logs.setToolTip("Switch to Database Logs tab for this service")
        console_header_layout.addWidget(launcher.btn_open_db_logs)

        console_header_layout.addStretch()
        console_layout.addLayout(console_header_layout)

        # Compact toolbar with filters and actions
        toolbar = QHBoxLayout()
        toolbar.setSpacing(8)

        # Filter section
        launcher.console_level_combo = QComboBox()
        for lvl in ["All", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
            launcher.console_level_combo.addItem(lvl)
        launcher.console_level_combo.setCurrentText("All")
        launcher.console_level_combo.setFixedWidth(90)
        launcher.console_level_combo.setToolTip("Filter by log level")
        launcher.console_level_combo.setStyleSheet(theme.get_combobox_stylesheet())
        launcher.console_level_combo.currentTextChanged.connect(lambda _: launcher._on_console_filter_changed())
        toolbar.addWidget(launcher.console_level_combo)

        launcher.console_search_input = QLineEdit()
        launcher.console_search_input.setPlaceholderText("Search logs (Ctrl+F)...")
        launcher.console_search_input.setFixedWidth(180)
        launcher.console_search_input.textChanged.connect(lambda _: launcher._on_console_filter_changed())
        toolbar.addWidget(launcher.console_search_input)

        launcher.console_style_checkbox = QCheckBox("Readable view")
        launcher.console_style_checkbox.setChecked(True)
        launcher.console_style_checkbox.setToolTip("Toggle enhanced console row layout")
        launcher.console_style_checkbox.toggled.connect(launcher._on_console_style_changed)
        toolbar.addWidget(launcher.console_style_checkbox)

        # Action buttons (compact)
        launcher.btn_refresh_logs = QPushButton('🔄')
        launcher.btn_refresh_logs.setToolTip("Refresh console logs (F5)")
        launcher.btn_refresh_logs.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        toolbar.addWidget(launcher.btn_refresh_logs)

        launcher.btn_clear_logs = QPushButton('🗑')
        launcher.btn_clear_logs.setToolTip("Clear console logs (Ctrl+L)")
        launcher.btn_clear_logs.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        toolbar.addWidget(launcher.btn_clear_logs)

        launcher.autoscroll_checkbox = QCheckBox('Auto-scroll')
        launcher.autoscroll_checkbox.setChecked(False)  # Default OFF to allow manual scrolling
        launcher.autoscroll_checkbox.setToolTip("Automatically scroll to bottom")
        launcher.autoscroll_checkbox.stateChanged.connect(launcher._on_autoscroll_changed)
        toolbar.addWidget(launcher.autoscroll_checkbox)

        # Pause logs button
        launcher.pause_logs_button = QPushButton('⏸ Pause')
        launcher.pause_logs_button.setCheckable(True)
        launcher.pause_logs_button.setChecked(False)
        launcher.pause_logs_button.setToolTip("Pause log updates to scroll through history")
        launcher.pause_logs_button.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        launcher.pause_logs_button.toggled.connect(launcher._on_pause_logs_changed)
        toolbar.addWidget(launcher.pause_logs_button)

        toolbar.addStretch()
        console_layout.addLayout(toolbar)

        # Use unified LogViewWidget for smart scrolling
        launcher.log_view = LogViewWidget()
        launcher.log_view.setStyleSheet(theme.get_text_browser_stylesheet())
        console_layout.addWidget(launcher.log_view)

        # Add keyboard shortcuts for console
        launcher.console_refresh_shortcut = QShortcut(QKeySequence('F5'), console_tab)
        launcher.console_refresh_shortcut.activated.connect(lambda: launcher._refresh_console_logs(force=True))
        launcher.console_clear_shortcut = QShortcut(QKeySequence('Ctrl+L'), console_tab)
        launcher.console_clear_shortcut.activated.connect(launcher._clear_console_display)

        # Quick focus on console search
        launcher.console_search_shortcut = QShortcut(QKeySequence('Ctrl+F'), console_tab)
        launcher.console_search_shortcut.activated.connect(lambda: launcher.console_search_input.setFocus())

        return console_tab
