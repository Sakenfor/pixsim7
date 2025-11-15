import sys
import webbrowser
import subprocess
import os
import signal
import re
from html import escape
from typing import Dict, Optional
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QListWidget, QListWidgetItem,
    QTextEdit, QSplitter, QMessageBox, QDialog, QFormLayout, QLineEdit, QCheckBox, QDialogButtonBox,
    QScrollArea, QFrame, QGridLayout, QTabWidget
)
from PySide6.QtCore import Qt, QProcess, QTimer, Signal, QSize, QThread
from PySide6.QtGui import QColor, QTextCursor, QFont, QPalette, QShortcut, QKeySequence

# Load .env file into environment BEFORE initializing logger
from dotenv import load_dotenv
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
load_dotenv(_env_path)

try:
    from .services import build_services, ServiceDef
    from .config import (
        service_env, read_env_ports, write_env_ports, Ports,
        check_tool_available, load_ui_state, save_ui_state, UIState, ROOT,
        read_env_file, write_env_file
    )
    from .docker_utils import compose_ps, compose_up_detached, compose_down
    from .dialogs.git_tools_dialog import show_git_tools_dialog
    from .dialogs.simple_git_dialog import show_simple_git_dialog
    from .dialogs.migrations_dialog import show_migrations_dialog
    from .dialogs.ports_dialog import show_ports_dialog
    from .dialogs.env_editor_dialog import show_env_editor
    from .database_log_viewer import DatabaseLogViewer
    from .dialogs.settings_dialog import show_settings_dialog
    from .dialogs.log_management_dialog import show_log_management_dialog
except ImportError:
    # Fallback for running directly
    from services import build_services, ServiceDef
    from config import (
        service_env, read_env_ports, write_env_ports, Ports,
        check_tool_available, load_ui_state, save_ui_state, UIState, ROOT,
        read_env_file, write_env_file
    )
    from docker_utils import compose_ps, compose_up_detached, compose_down
    from dialogs.git_tools_dialog import show_git_tools_dialog
    from dialogs.simple_git_dialog import show_simple_git_dialog
    from dialogs.migrations_dialog import show_migrations_dialog
    from dialogs.ports_dialog import show_ports_dialog
    from dialogs.env_editor_dialog import show_env_editor
    from database_log_viewer import DatabaseLogViewer
    from dialogs.settings_dialog import show_settings_dialog
    from dialogs.log_management_dialog import show_log_management_dialog

# Structured logging for the launcher
try:
    from .logger import launcher_logger as _launcher_logger
except Exception:
    try:
        from logger import launcher_logger as _launcher_logger
    except Exception:
        _launcher_logger = None
try:
    from .status import HealthStatus, STATUS_COLORS, STATUS_TEXT
except Exception:
    from status import HealthStatus, STATUS_COLORS, STATUS_TEXT


try:
    from .widgets.service_card import ServiceCard
except Exception:
    from widgets.service_card import ServiceCard

try:
    from .processes import ServiceProcess
except Exception:
    from processes import ServiceProcess

try:
    from .health_worker import HealthWorker
except Exception:
    from health_worker import HealthWorker

# Import centralized theme
try:
    from . import theme
except Exception:
    import theme


# Ports and Env editor dialogs moved to dialogs/* modules


CONSOLE_LEVEL_PATTERNS = {
    "ERROR": re.compile(r"(?:\[(?:ERR|ERROR)\])|\b(?:ERR|ERROR)\b", re.IGNORECASE),
    "WARNING": re.compile(r"(?:\[(?:WARN|WARNING)\])|\b(?:WARN|WARNING)\b", re.IGNORECASE),
    "DEBUG": re.compile(r"(?:\[(?:DEBUG)\])|\bDEBUG\b", re.IGNORECASE),
    "INFO": re.compile(r"(?:\[(?:INFO)\])|\bINFO\b", re.IGNORECASE),
    "CRITICAL": re.compile(r"(?:\[(?:CRITICAL)\])|\bCRITICAL\b", re.IGNORECASE),
}

CONSOLE_LEVEL_STYLES = {
    "DEBUG": {"accent": "#64B5F6", "bg": "rgba(100,181,246,0.08)"},
    "INFO": {"accent": "#81C784", "bg": "rgba(129,199,132,0.08)"},
    "WARNING": {"accent": "#FFB74D", "bg": "rgba(255,183,77,0.12)"},
    "ERROR": {"accent": "#EF5350", "bg": "rgba(239,83,80,0.12)"},
    "CRITICAL": {"accent": "#FF1744", "bg": "rgba(255,23,68,0.18)"},
}


class LauncherWindow(QWidget):
    health_check_signal = Signal(str, HealthStatus)

    def __init__(self):
        super().__init__()
        self.setWindowTitle('PixSim7 Launcher')

        # Set dark theme styling using centralized theme
        combined_styles = (
            theme.get_base_stylesheet() +
            theme.get_button_stylesheet() +
            theme.get_input_stylesheet() +
            theme.get_checkbox_stylesheet()
        )
        self.setStyleSheet(combined_styles)

        # Load UI state
        self.ui_state = load_ui_state()
        if self.ui_state.window_width > 0 and self.ui_state.window_height > 0:
            self.resize(self.ui_state.window_width, self.ui_state.window_height)
        else:
            self.resize(1200, 750)

        if self.ui_state.window_x >= 0 and self.ui_state.window_y >= 0:
            self.move(self.ui_state.window_x, self.ui_state.window_y)

        self.services = build_services()
        self.processes: Dict[str, ServiceProcess] = {s.key: ServiceProcess(s) for s in self.services}
        self.cards: Dict[str, ServiceCard] = {}
        self.selected_service_key: Optional[str] = None

        # Check tool availability
        for sp in self.processes.values():
            sp.check_tool_availability()

        # Initialize attributes before _init_ui
        self.autoscroll_enabled = True
        self.console_style_enhanced = True
        self.log_filter = ''
        self.log_timer = QTimer(self)

        self._init_ui()

        # Restore selected service
        if self.ui_state.selected_service and self.ui_state.selected_service in self.cards:
            self._select_service(self.ui_state.selected_service)
        elif self.services:
            # Select first service by default
            self._select_service(self.services[0].key)

        # Background health worker replaces direct timer to avoid UI freeze
        self.health_worker = HealthWorker(self.processes, interval_sec=3.0, parent=self)
        self.health_worker.health_update.connect(self._update_service_health)
        self.health_worker.start()

        # Connect health check signal (for any manual triggers if added later)
        self.health_check_signal.connect(self._update_service_health)

        self.update_ports_label()

    def _init_ui(self):
        root = QHBoxLayout(self)
        splitter = QSplitter(Qt.Horizontal)
        root.addWidget(splitter)

        # Left panel: service cards & controls
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD)
        splitter.addWidget(left)

        # Header
        header = QLabel("Services")
        header_font = QFont()
        header_font.setPointSize(13)
        header_font.setBold(True)
        header.setFont(header_font)
        header_row = QHBoxLayout()
        header_row.addWidget(header)
        header_row.addStretch()
        self.btn_settings = QPushButton("⚙")
        self.btn_settings.setFixedSize(theme.ICON_BUTTON_MD, theme.ICON_BUTTON_MD)
        self.btn_settings.setToolTip("Launcher Settings")
        self.btn_settings.setStyleSheet(theme.get_settings_button_stylesheet())
        header_row.addWidget(self.btn_settings)
        left_layout.addLayout(header_row)

        # Scroll area for service cards
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setFrameShape(QFrame.NoFrame)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        # Container for cards
        cards_container = QWidget()
        cards_layout = QVBoxLayout(cards_container)
        cards_layout.setSpacing(8)
        cards_layout.setContentsMargins(0, 0, 0, 0)

        # Create cards for each service
        for s in self.services:
            sp = self.processes[s.key]
            card = ServiceCard(s, sp)
            self.cards[s.key] = card

            # Connect card signals
            card.clicked.connect(self._select_service)
            card.start_btn.clicked.connect(lambda checked, k=s.key: self._start_service(k))
            card.stop_btn.clicked.connect(lambda checked, k=s.key: self._stop_service(k))
            card.restart_requested.connect(self._restart_service)
            if card.open_btn:
                card.open_btn.clicked.connect(lambda checked, k=s.key: self._open_service_url(k))

            cards_layout.addWidget(card)

        cards_layout.addStretch()
        scroll_area.setWidget(cards_container)
        left_layout.addWidget(scroll_area, stretch=1)

        # Global control buttons
        btn_row1 = QHBoxLayout()
        self.btn_all = QPushButton('▶ Start All')
        self.btn_all.setToolTip("Start all services")
        self.btn_kill_all = QPushButton('■ Stop All')
        self.btn_kill_all.setToolTip("Stop all services")
        self.btn_restart_all = QPushButton('↻ Restart All')
        self.btn_restart_all.setToolTip("Restart all running services")
        self.btn_db_down = QPushButton('🗄 Stop DBs')
        self.btn_db_down.setToolTip("Stop database containers")
        btn_row1.addWidget(self.btn_all)
        btn_row1.addWidget(self.btn_kill_all)
        btn_row1.addWidget(self.btn_restart_all)
        btn_row1.addWidget(self.btn_db_down)
        left_layout.addLayout(btn_row1)

        # Status bar with dark theme
        self.status_label = QLabel('Ports: loading...')
        self.status_label.setStyleSheet(theme.get_status_label_stylesheet())
        left_layout.addWidget(self.status_label)

        # Right panel: main tab widget for all tools
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD)
        splitter.addWidget(right)

        # Create main tab widget with dark theme
        self.main_tabs = QTabWidget()
        self.main_tabs.setStyleSheet(theme.get_tab_widget_stylesheet())
        right_layout.addWidget(self.main_tabs)

        # === TAB 1: CONSOLE LOGS ===
        console_tab = self._create_console_tab()
        self.main_tabs.addTab(console_tab, "📊 Console")

        # === TAB 2: DATABASE LOGS ===
        db_logs_tab = self._create_db_logs_tab()
        self.main_tabs.addTab(db_logs_tab, "🗄 Database Logs")

        # === TAB 3: TOOLS ===
        tools_tab = self._create_tools_tab()
        self.main_tabs.addTab(tools_tab, "🔧 Tools")

        # === TAB 4: SETTINGS ===
        settings_tab = self._create_settings_tab()
        self.main_tabs.addTab(settings_tab, "⚙ Settings")

        # Setup all connections
        self._setup_connections()

    def _create_console_tab(self):
        """Create the console logs tab"""
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

        self.log_service_label = QLabel()
        log_service_font = QFont()
        log_service_font.setPointSize(10)
        self.log_service_label.setFont(log_service_font)
        self.log_service_label.setStyleSheet("color: #555; padding-left: 10px; font-weight: 500;")
        console_header_layout.addWidget(self.log_service_label)

        # Quick navigation into DB logs for the same service
        self.btn_open_db_logs = QPushButton("Open DB Logs ▶")
        self.btn_open_db_logs.setToolTip("Switch to Database Logs tab for this service")
        console_header_layout.addWidget(self.btn_open_db_logs)

        console_header_layout.addStretch()
        console_layout.addLayout(console_header_layout)

        # Compact toolbar with filters and actions
        toolbar = QHBoxLayout()
        toolbar.setSpacing(8)

        # Filter section
        from PySide6.QtWidgets import QComboBox
        self.console_level_combo = QComboBox()
        for lvl in ["All", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
            self.console_level_combo.addItem(lvl)
        self.console_level_combo.setCurrentText("All")
        self.console_level_combo.setFixedWidth(90)
        self.console_level_combo.setToolTip("Filter by log level")
        self.console_level_combo.setStyleSheet(theme.get_combobox_stylesheet())
        self.console_level_combo.currentTextChanged.connect(lambda _: self._on_console_filter_changed())
        toolbar.addWidget(self.console_level_combo)

        self.console_search_input = QLineEdit()
        self.console_search_input.setPlaceholderText("Search logs (Ctrl+F)...")
        self.console_search_input.setFixedWidth(180)
        self.console_search_input.textChanged.connect(lambda _: self._on_console_filter_changed())
        toolbar.addWidget(self.console_search_input)

        self.console_style_checkbox = QCheckBox("Readable view")
        self.console_style_checkbox.setChecked(True)
        self.console_style_checkbox.setToolTip("Toggle enhanced console row layout")
        self.console_style_checkbox.toggled.connect(self._on_console_style_changed)
        toolbar.addWidget(self.console_style_checkbox)

        # Action buttons (compact)
        self.btn_refresh_logs = QPushButton('🔄')
        self.btn_refresh_logs.setToolTip("Refresh console logs (F5)")
        self.btn_refresh_logs.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        toolbar.addWidget(self.btn_refresh_logs)

        self.btn_clear_logs = QPushButton('🗑')
        self.btn_clear_logs.setToolTip("Clear console logs (Ctrl+L)")
        self.btn_clear_logs.setStyleSheet(theme.get_icon_button_stylesheet("sm"))
        toolbar.addWidget(self.btn_clear_logs)
        
        self.autoscroll_checkbox = QCheckBox('Auto-scroll')
        self.autoscroll_checkbox.setChecked(True)
        self.autoscroll_checkbox.setToolTip("Automatically scroll to bottom")
        self.autoscroll_checkbox.stateChanged.connect(self._on_autoscroll_changed)
        toolbar.addWidget(self.autoscroll_checkbox)

        toolbar.addStretch()
        console_layout.addLayout(toolbar)

        # Use QTextBrowser for clickable URLs
        from PySide6.QtWidgets import QTextBrowser
        self.log_view = QTextBrowser()
        self.log_view.setReadOnly(True)
        self.log_view.setOpenExternalLinks(True)  # Open URLs in browser
        self.log_view.setStyleSheet(theme.get_text_browser_stylesheet())
        console_layout.addWidget(self.log_view)

        # Add keyboard shortcuts for console
        self.console_refresh_shortcut = QShortcut(QKeySequence('F5'), console_tab)
        self.console_refresh_shortcut.activated.connect(lambda: self._refresh_console_logs(force=True))
        self.console_clear_shortcut = QShortcut(QKeySequence('Ctrl+L'), console_tab)
        self.console_clear_shortcut.activated.connect(self._clear_console_display)

        # Quick focus on console search
        self.console_search_shortcut = QShortcut(QKeySequence('Ctrl+F'), console_tab)
        self.console_search_shortcut.activated.connect(lambda: self.console_search_input.setFocus())

        return console_tab

    def _create_db_logs_tab(self):
        """Create the database logs tab"""
        p = read_env_ports()
        self.db_log_viewer = DatabaseLogViewer(api_url=f"http://localhost:{p.backend}")
        return self.db_log_viewer

    def _create_tools_tab(self):
        """Create the tools tab with organized sections"""
        tools_tab = QWidget()
        tools_layout = QVBoxLayout(tools_tab)
        tools_layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG)
        tools_layout.setSpacing(theme.SPACING_LG)

        # Database Tools Section
        db_group = QFrame()
        db_group.setFrameShape(QFrame.Shape.StyledPanel)
        db_group.setStyleSheet(theme.get_group_frame_stylesheet())
        db_layout = QVBoxLayout(db_group)
        
        db_title = QLabel("🗄 Database Tools")
        db_title.setStyleSheet(f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;")
        db_layout.addWidget(db_title)

        self.btn_migrations = QPushButton('🗃 Migrations')
        self.btn_migrations.setToolTip("Database migration manager")
        self.btn_migrations.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_migrations.clicked.connect(lambda: show_migrations_dialog(self))
        db_layout.addWidget(self.btn_migrations)

        self.btn_db_browser = QPushButton('📊 Database Browser')
        self.btn_db_browser.setToolTip("Browse accounts, copy passwords, export to CSV")
        self.btn_db_browser.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_db_browser.clicked.connect(self._open_db_browser)
        db_layout.addWidget(self.btn_db_browser)

        self.btn_import_accounts = QPushButton('📥 Import Accounts from PixSim6')
        self.btn_import_accounts.setToolTip("Import provider accounts from PixSim6 database")
        self.btn_import_accounts.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_import_accounts.clicked.connect(self._open_import_accounts_dialog)
        db_layout.addWidget(self.btn_import_accounts)
        
        tools_layout.addWidget(db_group)

        # Development Tools Section
        dev_group = QFrame()
        dev_group.setFrameShape(QFrame.Shape.StyledPanel)
        dev_group.setStyleSheet(theme.get_group_frame_stylesheet())
        dev_layout = QVBoxLayout(dev_group)

        dev_title = QLabel("🔀 Development Tools")
        dev_title.setStyleSheet(f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;")
        dev_layout.addWidget(dev_title)

        self.btn_git_workflow = QPushButton('⚡ Git Workflow')
        self.btn_git_workflow.setToolTip("Simple git operations: commit, push, pull, merge, cleanup")
        self.btn_git_workflow.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_git_workflow.clicked.connect(lambda: show_simple_git_dialog(self))
        dev_layout.addWidget(self.btn_git_workflow)

        self.btn_git_tools = QPushButton('🔀 Advanced Git Tools')
        self.btn_git_tools.setToolTip("Structured commit helper (grouped commits)")
        self.btn_git_tools.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_git_tools.clicked.connect(lambda: show_git_tools_dialog(self))
        dev_layout.addWidget(self.btn_git_tools)

        self.btn_log_management = QPushButton('📋 Log Management')
        self.btn_log_management.setToolTip("Manage, archive, and export console logs")
        self.btn_log_management.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_log_management.clicked.connect(lambda: show_log_management_dialog(self, self.processes))
        dev_layout.addWidget(self.btn_log_management)
        
        tools_layout.addWidget(dev_group)
        
        tools_layout.addStretch()
        return tools_tab

    def _create_settings_tab(self):
        """Create the settings tab"""
        settings_tab = QWidget()
        settings_layout = QVBoxLayout(settings_tab)
        settings_layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG)
        settings_layout.setSpacing(theme.SPACING_LG)

        # Configuration Section
        config_group = QFrame()
        config_group.setFrameShape(QFrame.Shape.StyledPanel)
        config_group.setStyleSheet(theme.get_group_frame_stylesheet())
        config_layout = QVBoxLayout(config_group)

        config_title = QLabel("⚙ Configuration")
        config_title.setStyleSheet(f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;")
        config_layout.addWidget(config_title)

        self.btn_ports = QPushButton('🔌 Edit Ports')
        self.btn_ports.setToolTip("Edit service ports")
        self.btn_ports.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_ports.clicked.connect(self.edit_ports)
        config_layout.addWidget(self.btn_ports)

        self.btn_env = QPushButton('🔧 Edit Environment Variables')
        self.btn_env.setToolTip("Edit environment variables")
        self.btn_env.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_env.clicked.connect(self.edit_env)
        config_layout.addWidget(self.btn_env)
        
        settings_layout.addWidget(config_group)

        # Application Settings Section
        app_group = QFrame()
        app_group.setFrameShape(QFrame.Shape.StyledPanel)
        app_group.setStyleSheet(theme.get_group_frame_stylesheet())
        app_layout = QVBoxLayout(app_group)

        app_title = QLabel("🎨 Application Settings")
        app_title.setStyleSheet(f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;")
        app_layout.addWidget(app_title)

        self.btn_settings = QPushButton('⚙ General Settings')
        self.btn_settings.setToolTip("Configure launcher preferences")
        self.btn_settings.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.btn_settings.clicked.connect(self._open_settings)
        app_layout.addWidget(self.btn_settings)
        
        settings_layout.addWidget(app_group)
        
        settings_layout.addStretch()
        return settings_tab

    def _setup_connections(self):
        """Setup all button connections"""
        # Main control buttons
        self.btn_all.clicked.connect(self.start_all)
        self.btn_kill_all.clicked.connect(self._stop_all_with_confirmation)
        self.btn_restart_all.clicked.connect(self._restart_all)
        self.btn_db_down.clicked.connect(self.stop_databases)
        
        # Console log controls
        self.btn_refresh_logs.clicked.connect(lambda: self._refresh_console_logs(force=True))
        self.btn_clear_logs.clicked.connect(self._clear_console_display)
        self.btn_open_db_logs.clicked.connect(self._open_db_logs_for_current_service)

        # Auto-refresh timer for console
        self.console_refresh_timer = QTimer(self)
        self.console_refresh_timer.timeout.connect(self._refresh_console_logs)
        self.last_log_hash = {}  # Track log buffer hashes to avoid unnecessary UI updates
        self.console_refresh_timer.start(1000)  # Refresh every second

    def _open_db_logs_for_current_service(self):
        """Switch to Database Logs tab and apply current service filter."""
        if not hasattr(self, 'db_log_viewer') or not self.db_log_viewer:
            return

        # Ensure selected service is reflected in DB viewer
        if self.selected_service_key:
            svc_name = self.selected_service_key
            idx = self.db_log_viewer.service_combo.findText(svc_name)
            if idx < 0:
                idx = self.db_log_viewer.service_combo.findText(svc_name.lower())
            if idx < 0:
                idx = self.db_log_viewer.service_combo.findText(svc_name.upper())
            if idx >= 0:
                self.db_log_viewer.service_combo.setCurrentIndex(idx)

        # Switch to the Database Logs tab
        if hasattr(self, 'main_tabs') and self.main_tabs:
            for i in range(self.main_tabs.count()):
                if "Database" in self.main_tabs.tabText(i):
                    self.main_tabs.setCurrentIndex(i)
                    break

        # Trigger an immediate refresh in the DB viewer
        try:
            self.db_log_viewer.refresh_logs()
        except Exception:
            pass

    def _select_service(self, key: str):
        """Select a service and refresh logs."""
        # Deselect previous card
        if self.selected_service_key and self.selected_service_key in self.cards:
            self.cards[self.selected_service_key].set_selected(False)

        # Select new card
        self.selected_service_key = key
        if key in self.cards:
            self.cards[key].set_selected(True)
            self._refresh_console_logs()

        # Keep database log viewer in sync with selected service for quick pivots
        if hasattr(self, 'db_log_viewer') and self.db_log_viewer:
            svc_name = key
            idx = self.db_log_viewer.service_combo.findText(svc_name)
            if idx < 0:
                # Also try lowercase/uppercase variants for robustness
                idx = self.db_log_viewer.service_combo.findText(svc_name.lower())
            if idx < 0:
                idx = self.db_log_viewer.service_combo.findText(svc_name.upper())
            if idx >= 0:
                self.db_log_viewer.service_combo.setCurrentIndex(idx)

    def _start_service(self, key: str):
        """Start a specific service."""
        sp = self.processes.get(key)
        if not sp:
            return
        if not sp.tool_available:
            QMessageBox.warning(self, 'Tool Not Available', sp.tool_check_message)
            if _launcher_logger:
                try:
                    _launcher_logger.warning("service_blocked_start", service_key=key, reason=sp.tool_check_message)
                except Exception:
                    pass
            return

        # Check dependencies before starting
        if sp.defn.depends_on:
            missing_deps = []
            for dep_key in sp.defn.depends_on:
                dep_process = self.processes.get(dep_key)
                if not dep_process or not dep_process.running:
                    dep_service = next((s for s in self.services if s.key == dep_key), None)
                    dep_title = dep_service.title if dep_service else dep_key
                    missing_deps.append(dep_title)

            if missing_deps:
                deps_list = ", ".join(missing_deps)
                service_title = sp.defn.title
                QMessageBox.warning(
                    self,
                    'Missing Dependencies',
                    f'{service_title} requires these services to be running first:\n\n{deps_list}\n\nPlease start them before starting {service_title}.'
                )
                if _launcher_logger:
                    try:
                        _launcher_logger.warning("service_blocked_dependencies", service_key=key, missing=missing_deps)
                    except Exception:
                        pass
                return

        if sp.start():
            self._refresh_console_logs()

    def _stop_service(self, key: str):
        """Stop a specific service."""
        sp = self.processes.get(key)
        if sp:
            sp.stop(graceful=True)
            self._refresh_console_logs()

    def _restart_service(self, key: str):
        """Restart a specific service."""
        sp = self.processes.get(key)
        if not sp or not sp.running:
            return

        service_title = next((s.title for s in self.services if s.key == key), key)
        if _launcher_logger:
            try:
                _launcher_logger.info("service_restart", service_key=key)
            except Exception:
                pass

        # Stop the service
        sp.stop(graceful=True)

        # Wait a moment before restarting
        QTimer.singleShot(1500, lambda: self._delayed_restart(key))

    def _delayed_restart(self, key: str):
        """Restart service after a short delay."""
        sp = self.processes.get(key)
        if sp and sp.tool_available:
            sp.start()
            self._refresh_console_logs()

    def _open_service_url(self, key: str):
        """Open a service's URL in the browser."""
        s = next((x for x in self.services if x.key == key), None)
        if s and s.url:
            webbrowser.open(s.url)

    # _check_health removed; handled by HealthWorker

    def _update_service_health(self, key: str, status: HealthStatus):
        """Update the health status for a service (called from signal)."""
        sp = self.processes.get(key)
        if not sp:
            return

        old_status = sp.health_status
        sp.health_status = status

        # Log status changes
        if old_status != status:
            if _launcher_logger:
                try:
                    _launcher_logger.info("service_health", service_key=key, status=status.value, running=sp.running)
                except Exception:
                    pass

        # Update card display
        card = self.cards.get(key)
        if card:
            card.update_status(status)
            # Update button states based on running flag
            card.start_btn.setEnabled(not sp.running and sp.tool_available)
            card.stop_btn.setEnabled(sp.running)

    def update_ports_label(self):
        p = read_env_ports()
        # Count running services
        running_count = sum(1 for sp in self.processes.values() if sp.running)
        healthy_count = sum(1 for sp in self.processes.values() if sp.health_status == HealthStatus.HEALTHY)

        status_emoji = "✓" if healthy_count == running_count and running_count > 0 else "●"
        self.status_label.setText(
            f"{status_emoji} {running_count}/{len(self.processes)} running "
            f"({healthy_count} healthy) • "
            f"Backend:{p.backend} Admin:{p.admin} Frontend:{p.frontend}"
        )

    def selected_key(self) -> str | None:
        """Return the currently selected service key."""
        return self.selected_service_key

    def start_all(self):
        """Start all services in dependency order."""
        # Build dependency graph and start in correct order
        started = set()

        def can_start(service_key):
            """Check if a service's dependencies are satisfied."""
            sp = self.processes.get(service_key)
            if not sp or not sp.tool_available:
                return False
            if sp.defn.depends_on:
                return all(dep in started for dep in sp.defn.depends_on)
            return True

        # Keep trying to start services until no more can be started
        max_iterations = len(self.processes) * 2  # Prevent infinite loops
        iteration = 0

        while iteration < max_iterations:
            made_progress = False

            for key, sp in self.processes.items():
                if key in started or sp.running:
                    continue

                if not sp.tool_available:
                    if _launcher_logger:
                        try:
                            _launcher_logger.info("service_skip_start", service_key=key, reason=sp.tool_check_message)
                        except Exception:
                            pass
                    started.add(key)  # Mark as "started" to avoid retrying
                    continue

                if can_start(key):
                    sp.start()
                    started.add(key)
                    made_progress = True

            if not made_progress:
                break  # No more services can be started

            iteration += 1

        self._refresh_console_logs()

    def stop_all(self):
        for sp in self.processes.values():
            sp.stop(graceful=True)
        self._refresh_console_logs()

    def _stop_all_with_confirmation(self):
        """Stop all services with confirmation dialog."""
        # Count running services
        running_count = sum(1 for sp in self.processes.values() if sp.running)
        if running_count == 0:
            return

        reply = QMessageBox.question(
            self, 'Confirm Stop All',
            f'Stop all {running_count} running service{"s" if running_count != 1 else ""}?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.stop_all()

    def _restart_all(self):
        """Restart all currently running services."""
        running_keys = [k for k, sp in self.processes.items() if sp.running]
        if not running_keys:
            return

        reply = QMessageBox.question(
            self, 'Confirm Restart All',
            f'Restart all {len(running_keys)} running service{"s" if len(running_keys) != 1 else ""}?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            if _launcher_logger:
                try:
                    _launcher_logger.info("restart_all", count=len(running_keys))
                except Exception:
                    pass

            # Stop all running services
            self.stop_all()

            # Wait before restarting
            QTimer.singleShot(2000, lambda: self._delayed_restart_all(running_keys))

    def _delayed_restart_all(self, keys):
        """Restart services after delay."""
        for key in keys:
            sp = self.processes.get(key)
            if sp and sp.tool_available:
                sp.start()
        self._refresh_console_logs()

    def stop_databases(self):
        """Stop databases using docker-compose down."""
        try:
            if _launcher_logger:
                try:
                    _launcher_logger.info('stop_databases_start')
                except Exception:
                    pass
            ok, out = compose_down(os.path.join(ROOT, 'docker-compose.db-only.yml'))
            if ok:
                if _launcher_logger:
                    try:
                        _launcher_logger.info('stop_databases_success')
                    except Exception:
                        pass
                QMessageBox.information(self, 'Database Stopped', 'Databases have been stopped.')
                # Update DB process status
                if 'db' in self.processes:
                    self.processes['db'].running = False
                    self.processes['db'].health_status = HealthStatus.STOPPED
            else:
                if _launcher_logger:
                    try:
                        _launcher_logger.error('stop_databases_failed', error=out)
                    except Exception:
                        pass
                QMessageBox.warning(self, 'Error', f'Failed to stop databases:\n{out}')
        except Exception as e:
            if _launcher_logger:
                try:
                    _launcher_logger.error('stop_databases_exception', error=str(e))
                except Exception:
                    pass
            QMessageBox.warning(self, 'Error', f'Failed to stop databases: {e}')

    def edit_ports(self):
        """Open ports editor dialog."""
        current = read_env_ports()
        result = show_ports_dialog(self, current)
        if result is not None:
            try:
                write_env_ports(result)
                self.update_ports_label()
                if _launcher_logger:
                    try:
                        _launcher_logger.info('ports_updated', ports=str(result))
                    except Exception:
                        pass

                # Ask if user wants to restart affected services
                reply = QMessageBox.question(
                    self, 'Restart Services?',
                    'Port configuration saved. Restart running services to apply changes?',
                    QMessageBox.Yes | QMessageBox.No
                )
                if reply == QMessageBox.Yes:
                    # Rebuild services and restart running ones
                    running_keys = [k for k, sp in self.processes.items() if sp.running]
                    self.stop_all()
                    QTimer.singleShot(2000, lambda: self._restart_services(running_keys))
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to save ports: {e}')
                if _launcher_logger:
                    try:
                        _launcher_logger.error('ports_update_failed', error=str(e))
                    except Exception:
                        pass

    def edit_env(self):
        """Open environment editor dialog."""
        data = show_env_editor(self)
        if data is not None:
            try:
                write_env_file(data)
                self.update_ports_label()
                if _launcher_logger:
                    try:
                        _launcher_logger.info('environment_updated', count=len(data))
                    except Exception:
                        pass

                # Ask if user wants to restart affected services
                reply = QMessageBox.question(
                    self, 'Restart Services?',
                    'Environment configuration saved. Restart running services to apply changes?',
                    QMessageBox.Yes | QMessageBox.No
                )
                if reply == QMessageBox.Yes:
                    # Rebuild services and restart running ones
                    running_keys = [k for k, sp in self.processes.items() if sp.running]
                    self.stop_all()
                    QTimer.singleShot(2000, lambda: self._restart_services(running_keys))
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to save environment: {e}')
                if _launcher_logger:
                    try:
                        _launcher_logger.error('environment_update_failed', error=str(e))
                    except Exception:
                        pass

    def _restart_services(self, keys):
        """Restart specified services after config update."""
        # Stop health worker before rebuilding processes to avoid race condition
        if hasattr(self, 'health_worker') and self.health_worker:
            try:
                self.health_worker.stop()
                self.health_worker.wait(2000)  # Wait up to 2 seconds
            except Exception:
                pass

        # Rebuild services and processes
        self.services = build_services()
        old_processes = self.processes
        self.processes = {}

        # Transfer state from old processes where possible
        for s in self.services:
            if s.key in old_processes:
                # Preserve running state and detected PIDs
                old_sp = old_processes[s.key]
                new_sp = ServiceProcess(s)
                new_sp.running = old_sp.running
                new_sp.health_status = old_sp.health_status
                new_sp.detected_pid = old_sp.detected_pid
                # Don't copy proc - we want fresh processes
                self.processes[s.key] = new_sp
            else:
                self.processes[s.key] = ServiceProcess(s)

        # Start requested services
        for key in keys:
            if key in self.processes:
                self.processes[key].start()

        # Restart health worker with new process dict
        if hasattr(self, 'health_worker'):
            self.health_worker.processes = self.processes
            try:
                from .constants import HEALTH_CHECK_INTERVAL
            except ImportError:
                from constants import HEALTH_CHECK_INTERVAL
            self.health_worker = HealthWorker(self.processes, HEALTH_CHECK_INTERVAL, self)
            self.health_worker.health_update.connect(self._on_health_update)
            self.health_worker.start()

        # Update UI (cards will be updated via health_update signals)
        self._refresh_db_logs()

    def _auto_refresh_logs(self):
        """Deprecated: file log auto-refresh; use DB viewer controls."""
        pass

    def _on_autoscroll_changed(self, state):
        self.autoscroll_enabled = (state == Qt.Checked)

    def _on_filter_changed(self, text):
        self.log_filter = text.lower()
        # No-op; file log filter removed
        pass

    def _format_console_log_html(self, log_lines):
        """Format console logs with syntax highlighting and clickable URLs."""
        if getattr(self, "console_style_enhanced", True):
            return self._format_console_log_html_enhanced(log_lines)
        return self._format_console_log_html_classic(log_lines)

    def _format_console_log_html_classic(self, log_lines):
        html_lines = ['<div style="margin:0; padding:0; line-height:1.4; font-family: \'Consolas\', \'Courier New\', monospace; font-size:9pt;">']
        for raw_line in log_lines:
            line = str(raw_line)
            timestamp_match = re.match(r'\[(\d{2}:\d{2}:\d{2})\] \[(OUT|ERR)\] (.+)', line)
            if timestamp_match:
                time, tag, content = timestamp_match.groups()
                tag_color = '#f44336' if tag == 'ERR' else '#4CAF50'
                content_html = self._decorate_console_message(content)
                formatted = (
                    f'<span style="color:#666;">[{time}]</span> '
                    f'<span style="color:{tag_color}; font-weight:bold;">[{tag}]</span> '
                    f'{content_html}'
                )
                html_lines.append(f'<div style="margin-bottom:2px;">{formatted}</div>')
            else:
                html_lines.append(f'<div style="margin-bottom:2px;">{self._decorate_console_message(line)}</div>')
        html_lines.append('</div>')
        return '\n'.join(html_lines)

    def _format_console_log_html_enhanced(self, log_lines):
        html_lines = ['<div style="margin: 0; padding: 0; line-height: 1.45; font-family: \'Consolas\', \'Courier New\', monospace; font-size: 9pt;">']

        for raw_line in log_lines:
            line = str(raw_line)
            line_level = self._detect_console_level(line)
            style_def = CONSOLE_LEVEL_STYLES.get(line_level, {})
            border_color = style_def.get("accent", "#555")
            bg_color = style_def.get("bg", "")
            wrapper_style = (
                f"border-left: 3px solid {border_color}; padding: 4px 8px;"
                "margin: 0 0 4px; border-radius: 4px;"
            )
            if bg_color:
                wrapper_style += f" background-color: {bg_color};"

            timestamp_match = re.match(r'\[(\d{2}:\d{2}:\d{2})\] \[(OUT|ERR)\] (.+)', line)
            if timestamp_match:
                time, tag, content = timestamp_match.groups()
            else:
                iso_match = re.match(r'(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(.*)', line)
                if iso_match:
                    time = iso_match.group(2)
                    tag = None
                    remainder = iso_match.group(3).strip()
                    content = remainder or line[iso_match.start(3):].strip() or line
                else:
                    prefix_match = re.match(r'(DEBUG|INFO|WARNING|ERROR|CRITICAL):\s*(.*)', line, re.IGNORECASE)
                    if prefix_match:
                        possible_level = prefix_match.group(1).upper()
                        if not line_level:
                            line_level = "WARNING" if possible_level == "WARN" else possible_level
                        time = None
                        tag = None
                        content = prefix_match.group(2) or line
                    else:
                        time, tag, content = None, None, line

            tag_color = '#f44336' if (tag or '').upper() == 'ERR' else '#4CAF50'
            time_display = time or '--:--:--'
            tag_display = tag or 'LOG'

            content_html = self._decorate_console_message(content or "")

            level_badge = ""
            if line_level:
                badge_color = style_def.get("accent", "#888")
                level_badge = (
                    f'<span style="color: {badge_color}; border: 1px solid {badge_color};'
                    'border-radius: 4px; padding: 0 6px; font-size: 8pt; font-weight: bold;'
                    'min-width: 58px; text-align: center;">'
                    f'{line_level}'
                    '</span>'
                )
            level_html = level_badge or '<span style="display:inline-block; width: 60px;"></span>'

            time_html = (
                f'<span style="color: #888; display: inline-block; width: 80px;">[{time_display}]</span>'
            )
            tag_html = (
                f'<span style="color: {tag_color}; font-weight: bold; display: inline-block; width: 60px; text-align: center;">'
                f'[{tag_display}]'
                '</span>'
            )
            text_html = (
                f'<span style="color: #dcdcdc; white-space: pre-wrap;">{content_html}</span>'
            )

            html_lines.append(
                f'<div style="{wrapper_style}">{time_html}&nbsp;'
                f'{tag_html}&nbsp;'
                f'{level_html}&nbsp;'
                f'{text_html}</div>'
            )

        html_lines.append('</div>')
        return '\n'.join(html_lines)

    def _decorate_console_message(self, content: str) -> str:
        """Escape and highlight console content."""
        text = escape(content)
        text = re.sub(
            r'(https?://[^\s]+)',
            r'<a href="\1" style="color: #64B5F6; text-decoration: underline;">\1</a>',
            text
        )
        text = re.sub(r'\b(VITE|ready|Local|Network|running|started|listening)\b',
                      r'<span style="color: #81C784; font-weight: bold;">\1</span>', text)
        text = re.sub(r'\b(ERROR|error|failed|Error|FAILED)\b',
                      r'<span style="color: #EF5350; font-weight: bold;">\1</span>', text)
        text = re.sub(r'\b(WARNING|warning|WARN|warn)\b',
                      r'<span style="color: #FFB74D; font-weight: bold;">\1</span>', text)
        return text

    def _refresh_console_logs(self, force: bool = False):
        """Refresh the console log display with service output (only when changed)."""
        if not self.selected_service_key:
            return

        sp = self.processes.get(self.selected_service_key)
        if not sp:
            return

        # Update service label
        service_title = next((s.title for s in self.services if s.key == self.selected_service_key), self.selected_service_key)
        self.log_service_label.setText(f"({service_title})")

        # Calculate hash of current log buffer to detect changes
        if sp.log_buffer:
            buffer_signature = hash(tuple(sp.log_buffer))
        else:
            buffer_signature = hash((sp.running, sp.health_status.value if sp.health_status else None))
        filter_signature = self._console_filter_signature()
        current_hash = (buffer_signature, filter_signature)

        # Only update UI if logs changed
        if not force and self.last_log_hash.get(self.selected_service_key) == current_hash:
            return

        self.last_log_hash[self.selected_service_key] = current_hash

        # Block signals during update to prevent UI flickering
        self.log_view.blockSignals(True)
        try:
            # Save current scroll position before updating
            scrollbar = self.log_view.verticalScrollBar()
            old_scroll_value = scrollbar.value()
            old_scroll_max = scrollbar.maximum()
            distance_from_bottom = max(0, old_scroll_max - old_scroll_value)
            was_at_bottom = (old_scroll_value >= old_scroll_max - 10) if old_scroll_max > 0 else True

            # Get logs from buffer
            if sp.log_buffer:
                # Apply in-memory filtering based on console filter controls
                filtered_buffer = self._filter_console_buffer(sp.log_buffer)

                # Format as HTML with syntax highlighting
                log_html = self._format_console_log_html(filtered_buffer)
                self.log_view.setHtml(log_html)

                # Scroll behavior based on auto-scroll setting
                if self.autoscroll_enabled:
                    # Auto-scroll to bottom when explicitly enabled
                    cursor = self.log_view.textCursor()
                    cursor.movePosition(QTextCursor.End)
                    self.log_view.setTextCursor(cursor)
                    scrollbar.setValue(scrollbar.maximum())
                else:
                    # Restore previous scroll position when auto-scroll is disabled
                    # Maintain relative position from bottom to handle new content gracefully
                    new_max = scrollbar.maximum()
                    target_value = max(0, new_max - distance_from_bottom)
                    scrollbar.setValue(target_value)
            else:
                if sp.running:
                    # Check health status to provide more context
                    if sp.health_status == HealthStatus.HEALTHY:
                        self.log_view.setHtml(f'<div style="color: #888; padding: 20px;">Service <strong>{service_title}</strong> is running (detected from previous session).<br><br>Note: Console output is only captured when services are started from this launcher.<br>The service was likely started externally or in a previous session.</div>')
                    else:
                        self.log_view.setHtml(f'<div style="color: #888; padding: 20px;">Service <strong>{service_title}</strong> is starting up...<br>Waiting for output...</div>')
                else:
                    self.log_view.setHtml(f'<div style="color: #888; padding: 20px;">Service <strong>{service_title}</strong> is not running.<br><br>Click <strong>Start</strong> to launch this service.</div>')
        finally:
            self.log_view.blockSignals(False)

    def _filter_console_buffer(self, buffer):
        """Filter raw console lines by level and search text.

        This operates purely on the in-memory buffer and does not affect
        persisted logs. Level detection is heuristic: it looks for standard
        level tokens (INFO, ERROR, etc.) in the line.
        """
        if not buffer:
            return buffer

        # Determine active filters
        level_filter = None
        if hasattr(self, 'console_level_combo'):
            lvl = self.console_level_combo.currentText()
            if lvl and lvl != "All":
                level_filter = lvl.upper()

        search_filter = None
        if hasattr(self, 'console_search_input'):
            text = self.console_search_input.text().strip()
            if text:
                search_filter = text.lower()

        # Fast path: no filters
        if not level_filter and not search_filter:
            return buffer

        filtered = []
        for line in buffer:
            line_str = str(line)

            if level_filter:
                detected_level = self._detect_console_level(line_str)
                if not detected_level or detected_level != level_filter:
                    continue

            if search_filter and search_filter not in line_str.lower():
                continue

            filtered.append(line)

        return filtered

    def _console_filter_signature(self):
        """Return current console filter settings as a comparable tuple."""
        level = self.console_level_combo.currentText() if hasattr(self, 'console_level_combo') else "All"
        search = self.console_search_input.text().strip().lower() if hasattr(self, 'console_search_input') else ""
        return (level, search)

    def _on_console_filter_changed(self):
        """React immediately to console filter changes."""
        self._refresh_console_logs(force=True)

    def _on_console_style_changed(self, checked: bool):
        """Swap between classic and enhanced console layouts."""
        self.console_style_enhanced = bool(checked)
        self._refresh_console_logs(force=True)

    def _detect_console_level(self, line: str) -> str | None:
        """Best-effort detection of log level tokens inside console lines."""
        upper_line = line.upper()
        for level, pattern in CONSOLE_LEVEL_PATTERNS.items():
            if pattern.search(upper_line):
                # Treat WARN/WARNING synonyms as WARNING internally
                if level == "WARNING":
                    return "WARNING"
                if level == "ERROR":
                    return "ERROR"
                return level
        return None

    def _clear_console_display(self):
        """Clear the console log display and persisted logs."""
        if self.selected_service_key and self.selected_service_key in self.processes:
            self.processes[self.selected_service_key].clear_logs()
        self.log_view.clear()

    def _refresh_db_logs(self):
        try:
            self.db_log_viewer.refresh_logs()
        except Exception:
            pass

    def _open_settings(self):
        updated = show_settings_dialog(self, self.ui_state)
        if updated:
            self.ui_state = updated
            # Apply preferences immediately
            if self.ui_state.auto_refresh_logs:
                try:
                    self.db_log_viewer.auto_refresh_checkbox.setChecked(True)
                except Exception:
                    pass
            else:
                try:
                    self.db_log_viewer.auto_refresh_checkbox.setChecked(False)
                except Exception:
                    pass

    def _open_db_browser(self):
        """Open database browser window"""
        try:
            import subprocess
            import sys
            script_path = os.path.join(ROOT, "data", "launcher", "db_browser_widget.py")
            if os.path.exists(script_path):
                subprocess.Popen([sys.executable, script_path])
            else:
                QMessageBox.warning(self, "Not Found", f"Database browser not found at:\n{script_path}")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to open database browser:\n{e}")

    def _open_import_accounts_dialog(self):
        """Open import accounts dialog"""
        from PySide6.QtWidgets import QInputDialog
        
        username, ok = QInputDialog.getText(
            self, 
            "Import Accounts",
            "Enter your username to import accounts to:",
            QLineEdit.EchoMode.Normal,
            "sakenfor"
        )
        
        if not ok or not username:
            return
        
        # Show confirmation
        reply = QMessageBox.question(
            self,
            "Import Accounts",
            f"Import all accounts from PixSim6 to user '{username}'?\n\n"
            "This will:\n"
            "• Import credentials (JWT, API keys, cookies)\n"
            "• Import credits and usage stats\n"
            "• Skip duplicates automatically\n\n"
            "Both databases must be running.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        # Run import script
        try:
            import subprocess
            import sys
            script_path = os.path.join(ROOT, "scripts", "import_accounts_from_pixsim6.py")
            
            # Run with output capture
            result = subprocess.run(
                [sys.executable, script_path, "--username", username],
                capture_output=True,
                text=True,
                cwd=ROOT
            )
            
            if result.returncode == 0:
                QMessageBox.information(
                    self,
                    "Import Complete",
                    f"Successfully imported accounts!\n\n{result.stdout}"
                )
            else:
                QMessageBox.warning(
                    self,
                    "Import Failed",
                    f"Import failed:\n\n{result.stderr or result.stdout}"
                )
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to run import:\n{e}")

    # Removed inline dialog implementations; they are now in dialogs/* modules

    def refresh_logs(self):
        # Legacy method: delegate to DB log viewer
        try:
            self._refresh_db_logs()
        except Exception:
            pass

    def closeEvent(self, event):
        """Save UI state and cleanly stop processes on close."""
        self.ui_state.window_x = self.x()
        self.ui_state.window_y = self.y()
        self.ui_state.window_width = self.width()
        self.ui_state.window_height = self.height()
        selected = self.selected_key()
        if selected:
            self.ui_state.selected_service = selected
        save_ui_state(self.ui_state)

        # Stop timers
        try:
            if hasattr(self, 'console_refresh_timer'):
                self.console_refresh_timer.stop()
        except Exception:
            pass

        # Stop background worker threads
        try:
            if hasattr(self, 'db_log_viewer'):
                self.db_log_viewer.shutdown()
        except Exception:
            pass
        if hasattr(self, 'health_worker'):
            try:
                self.health_worker.stop()
                self.health_worker.wait(2000)
            except Exception:
                pass

        if self.ui_state.stop_services_on_exit:
            # Attempt graceful stop of all services, then enforce after short delay
            try:
                self.stop_all()
                for sp in self.processes.values():
                    try:
                        if sp.running and getattr(sp, 'proc', None):
                            sp._kill_process_tree()
                    except Exception:
                        pass
            except Exception:
                pass

        event.accept()


def main():
    # Check for existing launcher instance
    try:
        from .pid_file import ensure_single_instance, remove_pid_file
    except ImportError:
        from pid_file import ensure_single_instance, remove_pid_file

    can_proceed, existing_pid = ensure_single_instance()
    if not can_proceed:
        from PySide6.QtWidgets import QMessageBox
        app = QApplication(sys.argv)
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Warning)
        msg.setWindowTitle("Launcher Already Running")
        msg.setText("PixSim7 Launcher is already running.")
        msg.setInformativeText(
            f"Another instance is running with PID {existing_pid}.\n\n"
            "Please close the existing launcher first, or use that window."
        )
        msg.setStandardButtons(QMessageBox.Ok)
        msg.exec()
        sys.exit(1)

    # Register cleanup on exit
    import atexit
    atexit.register(remove_pid_file)

    app = QApplication(sys.argv)
    w = LauncherWindow()
    w.show()

    exit_code = app.exec()

    # Clean up PID file
    remove_pid_file()
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
