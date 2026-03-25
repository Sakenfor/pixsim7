import sys
import webbrowser
import subprocess
import os
import signal
import re
import time
from html import escape
from typing import Dict, Optional
from datetime import datetime
from urllib.parse import quote
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QListWidget, QListWidgetItem,
    QTextEdit, QSplitter, QMessageBox, QDialog, QFormLayout, QLineEdit, QCheckBox, QDialogButtonBox,
    QScrollArea, QFrame, QGridLayout, QTabWidget, QMenu, QComboBox, QStackedWidget
)
from PySide6.QtCore import Qt, QProcess, QProcessEnvironment, QTimer, Signal, QSize, QUrl
from PySide6.QtGui import QColor, QTextCursor, QFont, QPalette, QShortcut, QKeySequence, QAction, QCursor

# Load .env file into environment BEFORE initializing logger
from dotenv import load_dotenv
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
load_dotenv(_env_path)

try:
    from .services import build_services_from_manifests, ServiceDef
    from .config import (
        service_env, read_env_ports, write_env_ports, Ports,
        check_tool_available, load_ui_state, save_ui_state, UIState, ROOT,
        read_env_file, write_env_file, set_sql_logging, set_backend_log_level, set_worker_debug_flags,
        set_use_local_datastores
    )
    from ..core.paths import launcher_log_file
    from .docker_utils import compose_ps, compose_up_detached, compose_down
    from .dialogs.git_tools_dialog import show_git_tools_dialog
    from .dialogs.simple_git_dialog import show_simple_git_dialog
    from .dialogs.migrations_dialog import show_migrations_dialog
    from .dialogs.ports_dialog import show_ports_dialog
    from .dialogs.env_editor_dialog import show_env_editor
    from .database_log_viewer import DatabaseLogViewer
    from .dialogs.log_management_dialog import show_log_management_dialog
    from .dialogs.account_live_feed_dialog import show_account_live_feed_dialog
except ImportError:
    # Fallback for running directly
    from services import build_services_from_manifests, ServiceDef
    from config import (
        service_env, read_env_ports, write_env_ports, Ports,
        check_tool_available, load_ui_state, save_ui_state, UIState, ROOT,
        read_env_file, write_env_file, set_sql_logging, set_backend_log_level, set_worker_debug_flags,
        set_use_local_datastores
    )
    from launcher.core.paths import launcher_log_file
    from docker_utils import compose_ps, compose_up_detached, compose_down
    from dialogs.git_tools_dialog import show_git_tools_dialog
    from dialogs.simple_git_dialog import show_simple_git_dialog
    from dialogs.migrations_dialog import show_migrations_dialog
    from dialogs.ports_dialog import show_ports_dialog
    from dialogs.env_editor_dialog import show_env_editor
    from database_log_viewer import DatabaseLogViewer
    from dialogs.log_management_dialog import show_log_management_dialog
    from dialogs.account_live_feed_dialog import show_account_live_feed_dialog

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
    from .widgets.service_card_state import ServiceCardState, build_card_state
    from .widgets.notification_bar import NotificationBar
    from .widgets.databases_widget import DatabaseCardWidget, discover_databases
except Exception:
    from widgets.service_card import ServiceCard
    from widgets.service_card_state import ServiceCardState, build_card_state
    from widgets.notification_bar import NotificationBar
    from widgets.databases_widget import DatabaseCardWidget, discover_databases

try:
    from .clickable_fields import get_field, ActionType
except Exception:
    from clickable_fields import get_field, ActionType

try:
    from .widgets.architecture_panel import ArchitectureMetricsPanel, RoutesPreviewWidget
    from .service_discovery import ServiceDiscovery
    from .multi_service_discovery import MultiServiceDiscovery, load_services_config
except Exception:
    from widgets.architecture_panel import ArchitectureMetricsPanel, RoutesPreviewWidget
    from service_discovery import ServiceDiscovery
    from multi_service_discovery import MultiServiceDiscovery, load_services_config

try:
    from .tabs import ConsoleTab, DbLogsTab, ToolsTab, ArchitectureTab, DiagnosticsTab
except Exception:
    from tabs import ConsoleTab, DbLogsTab, ToolsTab, ArchitectureTab, DiagnosticsTab

try:
    from .icons import (
        ICON_SETTINGS, ICON_RELOAD,
        TAB_CONSOLE, TAB_DB_LOGS, TAB_TOOLS, TAB_DIAGNOSTICS, TAB_SETTINGS, TAB_ARCHITECTURE
    )
except Exception:
    from icons import (
        ICON_SETTINGS, ICON_RELOAD,
        TAB_CONSOLE, TAB_DB_LOGS, TAB_TOOLS, TAB_DIAGNOSTICS, TAB_SETTINGS, TAB_ARCHITECTURE
    )

# Import centralized theme
try:
    from . import theme
except Exception:
    import theme

# Console formatting utilities
try:
    from .console_utils import (
        CONSOLE_LEVEL_PATTERNS, CONSOLE_LEVEL_STYLES,
        CONSOLE_TIMESTAMP_REGEX, ISO_TIMESTAMP_REGEX, LEVEL_PREFIX_REGEX,
        URL_LINK_REGEX, READY_REGEX, ERROR_REGEX, WARN_REGEX,
        detect_console_level,
        detect_console_domain, detect_console_service,
        decorate_console_message, strip_ansi,
        format_console_log_html_classic, format_console_log_html_enhanced,
    )
except Exception:
    from console_utils import (
        CONSOLE_LEVEL_PATTERNS, CONSOLE_LEVEL_STYLES,
        CONSOLE_TIMESTAMP_REGEX, ISO_TIMESTAMP_REGEX, LEVEL_PREFIX_REGEX,
        URL_LINK_REGEX, READY_REGEX, ERROR_REGEX, WARN_REGEX,
        detect_console_level,
        detect_console_domain, detect_console_service,
        decorate_console_message, strip_ansi,
        format_console_log_html_classic, format_console_log_html_enhanced,
    )

# Ports and Env editor dialogs moved to dialogs/* modules


from .trace import _startup_trace
from .mixins import ConsoleLogMixin, ConsoleInteractionMixin, AutoRestartMixin, ServiceLifecycleMixin


class LauncherWindow(
    ConsoleInteractionMixin,
    ConsoleLogMixin,
    AutoRestartMixin,
    ServiceLifecycleMixin,
    QWidget,
):
    health_check_signal = Signal(str, HealthStatus)
    service_selected = Signal(str)  # Emitted when a service card is selected

    def __init__(self):
        super().__init__()
        self.setWindowTitle('PixSim7 Launcher')

        # Log launcher startup
        if _launcher_logger:
            try:
                _launcher_logger.info(
                    "launcher_started",
                    python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
                    platform=sys.platform
                )
            except Exception:
                pass

        # Set dark theme styling using centralized theme
        combined_styles = (
            theme.get_base_stylesheet() +
            theme.get_button_stylesheet() +
            theme.get_input_stylesheet() +
            theme.get_checkbox_stylesheet() +
            theme.get_splitter_stylesheet() +
            theme.get_scrollbar_stylesheet() +
            theme.get_menu_stylesheet() +
            theme.get_tooltip_stylesheet()
        )
        self.setStyleSheet(combined_styles)

        # Load UI state
        self.ui_state = load_ui_state()
        # Apply SQL logging and worker debug preferences
        set_sql_logging(self.ui_state.sql_logging_enabled)
        set_worker_debug_flags(self.ui_state.worker_debug_flags)
        set_backend_log_level('DEBUG' if self.ui_state.backend_debug_enabled else 'INFO')
        set_use_local_datastores(self.ui_state.use_local_datastores)
        # Set minimum window size
        self.setMinimumSize(800, 500)

        # Get available screen geometry
        screen = QApplication.primaryScreen().availableGeometry()
        max_width = screen.width() - 50
        max_height = screen.height() - 50

        # Restore saved size (clamped to screen)
        if self.ui_state.window_width > 0 and self.ui_state.window_height > 0:
            w = min(self.ui_state.window_width, max_width)
            h = min(self.ui_state.window_height, max_height)
            self.resize(w, h)
        else:
            self.resize(min(1200, max_width), min(750, max_height))

        # Restore saved position (ensure visible on screen)
        if self.ui_state.window_x >= 0 and self.ui_state.window_y >= 0:
            x = min(self.ui_state.window_x, screen.width() - 100)
            y = min(self.ui_state.window_y, screen.height() - 100)
            self.move(max(0, x), max(0, y))

        # Apply window flags (always on top)
        self._apply_window_flags()

        self.services = build_services_from_manifests()

        # ── Core managers via LauncherFacade (single source of truth) ──
        from .launcher_facade import LauncherFacade
        self.facade = LauncherFacade(parent=self)

        # self.processes aliases facade states so existing mixin code that
        # does self.processes.get(key) keeps working (returns core.ServiceState).
        self.processes = self.facade.process_mgr.states

        # Check tool availability
        for key in list(self.processes):
            self.facade.process_mgr.check_tool_availability(key)

        # Log service discovery
        if _launcher_logger:
            try:
                _launcher_logger.info(
                    "services_discovered",
                    count=len(self.services),
                    services=[s.key for s in self.services]
                )
            except Exception:
                pass
        self.cards: Dict[str, ServiceCard] = {}
        self.selected_service_key: Optional[str] = None
        self._account_live_feed_dialog = None
        self._openapi_gen_process: Optional[QProcess] = None
        self._openapi_gen_service_key: Optional[str] = None
        self._openapi_gen_url: Optional[str] = None
        # Auto-restart bookkeeping for transient dependency outages (e.g. Docker restart).
        self._auto_restart_attempts: Dict[str, int] = {}
        self._auto_restart_pending: Dict[str, bool] = {}
        self._auto_restart_healthy_since: Dict[str, float] = {}
        self._auto_restart_recent: Dict[str, list[float]] = {}
        self._auto_restart_cooldown_until: Dict[str, float] = {}
        self._auto_restart_reset_stable_sec = 20.0
        self._auto_restart_dependency_wait_ms = 5000
        self._auto_restart_flap_window_sec = 45.0
        self._auto_restart_flap_threshold = 6
        self._auto_restart_cooldown_sec = 120.0
        # Suppress restart scheduling during explicit bulk stop operations.
        self._bulk_stop_active = False
        self._bulk_stop_until = 0.0
        self._stop_in_progress_keys: set[str] = set()
        self._bulk_stop_pending_keys: set[str] = set()
        self._active_stop_workers: Dict[str, object] = {}  # legacy; kept for mixin compat

        # Widget registry for clean reload
        self.widgets: Dict[str, QWidget] = {}

        # Initialize attributes before _init_ui (load from saved state)
        self.autoscroll_enabled = self.ui_state.autoscroll_enabled
        self.console_style_enhanced = self.ui_state.console_style_enhanced
        self.log_filter = ''
        self.log_timer = QTimer(self)
        self.service_scroll_positions = {}  # Track scroll position per service

        self._init_ui()

        # Service selection is handled by React dashboard — no PySide6 cards.
        self.selected_service_key = None

        # Start health monitoring (feeds state to the API for React to read).
        QTimer.singleShot(0, self.facade.start_all_managers)

        # Start embedded Launcher API after first paint to avoid blocking __init__.
        self._api_cleanup = None
        self._embedded_api_server = None
        QTimer.singleShot(500, self._deferred_start_api)


        self.update_ports_label()

    def _deferred_start_api(self):
        """Called after first paint to start the embedded API without blocking UI."""
        try:
            self._start_embedded_api()
        except Exception:
            pass

    def _start_embedded_api(self, port: int = 8100):
        """Start the Launcher API in a daemon thread sharing the facade's container."""
        import socket
        import threading

        # Kill any standalone API process so we can take over the port.
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                try:
                    from .process_utils import find_pid_by_port, kill_process_by_pid
                    import os
                    pid = find_pid_by_port(port)
                    if pid and pid != os.getpid():
                        kill_process_by_pid(pid, force=True)
                        import time as _t; _t.sleep(0.5)
                except Exception:
                    pass

        # Inject the facade's container into the API dependency system.
        from launcher.core.container import LauncherContainer
        from launcher.api.dependencies import set_container

        # Build a container that wraps the facade's existing managers.
        container = LauncherContainer.__new__(LauncherContainer)
        container.services = []
        container.config = None
        from launcher.core.event_bus import get_event_bus as _get_bus
        container.event_bus = _get_bus()
        container._process_mgr = self.facade.process_mgr
        container._health_mgr = self.facade.health_mgr
        container._log_mgr = self.facade.log_mgr
        container._states = self.facade.process_mgr.states

        # Override get methods to return our managers
        container.get_process_manager = lambda: self.facade.process_mgr
        container.get_health_manager = lambda: self.facade.health_mgr
        container.get_log_manager = lambda: self.facade.log_mgr
        from launcher.core.event_bus import get_event_bus
        container.get_event_bus = get_event_bus
        container.start_all = lambda: None
        container.stop_all = lambda: None

        set_container(container)

        self._launch_api_server(port)

    def _launch_api_server(self, port: int = 8100):
        """Spin up the uvicorn server in a daemon thread."""
        import threading
        import uvicorn
        from launcher.api.main import app

        config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
        server = uvicorn.Server(config)
        self._embedded_api_server = server
        self._embedded_api_port = port

        def _run():
            server.run()
            # When server exits, update the launcher-api state
            state = self.processes.get("launcher-api")
            if state:
                from launcher.core.types import ServiceStatus
                state.status = ServiceStatus.STOPPED
                state.health = HealthStatus.STOPPED

        t = threading.Thread(target=_run, daemon=True, name="launcher-api")
        t.start()
        self._api_cleanup = lambda: setattr(server, "should_exit", True)

    def stop_embedded_api(self):
        """Stop the embedded API server."""
        srv = getattr(self, "_embedded_api_server", None)
        if srv:
            srv.should_exit = True
            self._embedded_api_server = None
            self._api_cleanup = None

    def start_embedded_api(self):
        """Start (or restart) the embedded API server."""
        # Ensure old one is stopped
        self.stop_embedded_api()
        import time as _t; _t.sleep(0.3)
        self._start_embedded_api(getattr(self, "_embedded_api_port", 8100))

    def _build_left_panel(self):
        left = QWidget()
        self.left_panel = left
        left.setMinimumWidth(280)
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD)

        # Header row with view selector dropdown
        header_row = QHBoxLayout()
        self.view_selector = QComboBox()
        self.view_selector.addItem("Services")
        self.view_selector.addItem("Databases")
        header_font = QFont()
        header_font.setPointSize(13)
        header_font.setBold(True)
        self.view_selector.setFont(header_font)
        self.view_selector.setStyleSheet(
            f"""
            QComboBox {{
                background-color: transparent;
                border: none;
                color: {theme.TEXT_PRIMARY};
                padding: 2px 8px 2px 0px;
                min-width: 120px;
            }}
            QComboBox::drop-down {{
                border: none;
                width: 20px;
            }}
            QComboBox::down-arrow {{
                image: none;
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-top: 6px solid {theme.TEXT_SECONDARY};
                margin-right: 5px;
            }}
            QComboBox QAbstractItemView {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                selection-background-color: {theme.ACCENT_PRIMARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                outline: none;
            }}
            """
        )
        header_row.addWidget(self.view_selector)
        header_row.addStretch()
        self.btn_settings = QPushButton(ICON_SETTINGS)
        self.btn_settings.setFixedSize(theme.ICON_BUTTON_MD, theme.ICON_BUTTON_MD)
        self.btn_settings.setToolTip("Launcher Settings")
        self.btn_settings.setStyleSheet(theme.get_settings_button_stylesheet())
        header_row.addWidget(self.btn_settings)
        self.btn_reload_ui = QPushButton(ICON_RELOAD)
        self.btn_reload_ui.setFixedSize(theme.ICON_BUTTON_MD, theme.ICON_BUTTON_MD)
        self.btn_reload_ui.setToolTip("Reload UI")
        self.btn_reload_ui.setStyleSheet(theme.get_settings_button_stylesheet())
        header_row.addWidget(self.btn_reload_ui)
        left_layout.addLayout(header_row)

        # Stacked widget for switching between Services and Databases views
        self.left_panel_stack = QStackedWidget()

        # Services view
        services_scroll = QScrollArea()
        services_scroll.setWidgetResizable(True)
        services_scroll.setFrameShape(QFrame.NoFrame)
        services_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        cards_container = QWidget()
        cards_layout = QVBoxLayout(cards_container)
        cards_layout.setSpacing(8)
        cards_layout.setContentsMargins(0, 0, 0, 0)

        self.cards = {}
        for s in self.services:
            sp = self.processes[s.key]
            card = ServiceCard(s, build_card_state(sp))
            self.cards[s.key] = card
            card.clicked.connect(self._select_service)
            card.start_btn.clicked.connect(lambda checked, k=s.key: self._start_service(k))
            card.stop_btn.clicked.connect(lambda checked, k=s.key: self._stop_service(k))
            card.force_stop_btn.clicked.connect(lambda checked, k=s.key: self._force_stop_service(k))
            card.restart_requested.connect(self._restart_service)
            card.db_logs_requested.connect(lambda k=s.key: (self._select_service(k), self._open_db_logs_for_current_service()))
            card.account_live_feed_requested.connect(self._open_account_live_feed)
            card.openapi_refresh_requested.connect(self._refresh_openapi_status)
            card.openapi_generate_requested.connect(self._generate_openapi_types)
            if card.open_btn:
                card.open_btn.clicked.connect(lambda checked, k=s.key: self._open_service_url(k))
            cards_layout.addWidget(card)

        cards_layout.addStretch()
        services_scroll.setWidget(cards_container)
        self.left_panel_stack.addWidget(services_scroll)

        # Databases view
        databases_scroll = QScrollArea()
        databases_scroll.setWidgetResizable(True)
        databases_scroll.setFrameShape(QFrame.NoFrame)
        databases_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        db_container = QWidget()
        db_layout = QVBoxLayout(db_container)
        db_layout.setSpacing(8)
        db_layout.setContentsMargins(0, 0, 0, 0)

        self.db_cards = {}
        self.selected_database = None
        databases = discover_databases()
        if databases:
            for db_info in databases:
                card = DatabaseCardWidget(db_info, db_container)
                self.db_cards[db_info.env_key] = card
                card.clicked.connect(self._select_database)
                db_layout.addWidget(card)
        else:
            no_db_label = QLabel("No databases configured.\nSet DATABASE_URL in .env")
            no_db_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; padding: 20px;")
            no_db_label.setAlignment(Qt.AlignCenter)
            db_layout.addWidget(no_db_label)

        db_layout.addStretch()
        databases_scroll.setWidget(db_container)
        self.left_panel_stack.addWidget(databases_scroll)

        # Connect view selector to stack
        self.view_selector.currentIndexChanged.connect(self.left_panel_stack.setCurrentIndex)

        left_layout.addWidget(self.left_panel_stack, stretch=1)

        btn_row1 = QHBoxLayout()
        self.btn_all = QPushButton('? Start All')
        self.btn_all.setToolTip("Start all services")
        self.btn_kill_all = QPushButton('? Stop All')
        self.btn_kill_all.setToolTip("Stop all services")
        self.btn_restart_all = QPushButton('? Restart All')
        self.btn_restart_all.setToolTip("Restart all running services")
        self.btn_db_down = QPushButton('?? Stop DBs')
        self.btn_db_down.setToolTip("Stop database containers")
        btn_row1.addWidget(self.btn_all)
        btn_row1.addWidget(self.btn_kill_all)
        btn_row1.addWidget(self.btn_restart_all)
        btn_row1.addWidget(self.btn_db_down)
        left_layout.addLayout(btn_row1)

        self.status_label = QLabel('Ports: loading...')
        self.status_label.setStyleSheet(theme.get_status_label_stylesheet())
        left_layout.addWidget(self.status_label)
        return left

    def _build_right_panel(self):
        right = QWidget()
        self.right_panel = right
        right.setMinimumWidth(400)
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD)

        self.notification_bar = NotificationBar()
        right_layout.addWidget(self.notification_bar)

        self.main_tabs = QTabWidget()
        self.main_tabs.setStyleSheet(theme.get_tab_widget_stylesheet())
        right_layout.addWidget(self.main_tabs)

        # Console tab is always needed immediately
        console_tab = ConsoleTab.create(self)
        self.main_tabs.addTab(console_tab, TAB_CONSOLE)

        # Heavy tabs are lazy-loaded on first visit to speed up startup.
        # Placeholder widgets are swapped out when the tab is selected.
        self._lazy_tabs = {}  # index → factory callable

        def _add_lazy_tab(label, factory):
            placeholder = QWidget()
            idx = self.main_tabs.addTab(placeholder, label)
            self._lazy_tabs[idx] = factory

        _add_lazy_tab(TAB_DB_LOGS, lambda: DbLogsTab.create(self))
        _add_lazy_tab(TAB_TOOLS, lambda: ToolsTab.create(self))
        _add_lazy_tab(TAB_DIAGNOSTICS, lambda: DiagnosticsTab.create(self))
        _add_lazy_tab(TAB_SETTINGS, lambda: ToolsTab.create_settings(self))
        self.settings_tab_index = self.main_tabs.count() - 1
        _add_lazy_tab(TAB_ARCHITECTURE, lambda: ArchitectureTab.create(self))

        self.main_tabs.currentChanged.connect(self._on_tab_changed)

        return right

    def _on_tab_changed(self, index: int):
        """Lazy-load tab content on first visit."""
        factory = self._lazy_tabs.pop(index, None)
        if factory is not None:
            try:
                widget = factory()
                old = self.main_tabs.widget(index)
                label = self.main_tabs.tabText(index)
                self.main_tabs.removeTab(index)
                self.main_tabs.insertTab(index, widget, label)
                self.main_tabs.setCurrentIndex(index)
                if old:
                    old.deleteLater()
                # Re-index any remaining lazy tabs after the insert/remove
                updated = {}
                for k, v in self._lazy_tabs.items():
                    updated[k] = v
                self._lazy_tabs = updated
                # Update settings_tab_index if it moved
                for i in range(self.main_tabs.count()):
                    if self.main_tabs.tabText(i) == TAB_SETTINGS:
                        self.settings_tab_index = i
                        break
            except Exception as e:
                if _launcher_logger:
                    try:
                        _launcher_logger.error("lazy_tab_load_failed", index=index, error=str(e))
                    except Exception:
                        pass

    def _restore_console_ui_state(self):
        if hasattr(self, 'autoscroll_checkbox'):
            self.autoscroll_checkbox.setChecked(self.ui_state.autoscroll_enabled)
        if hasattr(self, 'log_view'):
            self.log_view.set_autoscroll(self.ui_state.autoscroll_enabled)
        if hasattr(self, 'console_style_checkbox'):
            self.console_style_checkbox.setChecked(self.ui_state.console_style_enhanced)
        if hasattr(self, 'console_level_combo') and self.ui_state.console_level_filter:
            idx = self.console_level_combo.findText(self.ui_state.console_level_filter)
            if idx >= 0:
                self.console_level_combo.setCurrentIndex(idx)
        if hasattr(self, 'console_scope_actions') and self.ui_state.console_scope_filter:
            raw = self.ui_state.console_scope_filter
            # Detect new format (has colon-prefixed keys like "domain:generation")
            if ':' in raw.split(',')[0]:
                active = set(raw.split(','))
                for key, act in self.console_scope_actions.items():
                    act.setChecked(key in active)
            # Refresh button labels to reflect restored state
            for attr in ('console_domain_button', 'console_service_button'):
                btn = getattr(self, attr, None)
                if btn and hasattr(btn, '_update_scope_label'):
                    btn._update_scope_label()
        if hasattr(self, 'console_search_input') and self.ui_state.console_search_text:
            self.console_search_input.setText(self.ui_state.console_search_text)

    def _notify_ui_reloaded(self):
        self.notify("UI reloaded")

    def notify(self, message: str, level: str = "info", duration_ms: int = 2000, category: str = "INFO"):
        if hasattr(self, "notification_bar") and self.notification_bar:
            try:
                self.notification_bar.show_message(message, duration_ms=duration_ms, level=level, category=category)
                return
            except Exception:
                pass
        if hasattr(self, "status_label"):
            try:
                self.status_label.setText(message)
                QTimer.singleShot(duration_ms, self._restore_status_label)
            except Exception:
                pass


    def _init_ui(self):
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWebEngineCore import QWebEngineSettings

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)

        self.webview = QWebEngineView()
        settings = self.webview.settings()
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)

        # Disable persistent cache so F5 always loads fresh built files
        from PySide6.QtWebEngineCore import QWebEngineProfile
        profile = self.webview.page().profile()
        profile.setHttpCacheType(QWebEngineProfile.NoCache)

        root.addWidget(self.webview)

        # Store as console_webview for _reload_webviews / _toggle_webview_dev_mode
        self.console_webview = self.webview

        # Load the React dashboard after the embedded API is up
        def _load_dashboard():
            from PySide6.QtCore import QUrl
            is_dev = getattr(self, '_webview_dev_mode', False)
            base = "http://localhost:3100" if is_dev else "http://localhost:8100"
            self.webview.setUrl(QUrl(base))

        QTimer.singleShot(1500, _load_dashboard)

        # Dummy attributes for backward compat with mixins that check for widgets
        self.cards = {}
        self.log_view = type('_Dummy', (), {
            'update_content': lambda *a, **k: None,
            'append_html': lambda *a: None,
            'clear': lambda: None,
            'set_autoscroll': lambda *a: None,
            'set_paused': lambda *a: None,
            'is_paused': lambda: False,
            'verticalScrollBar': lambda: type('_Bar', (), {'value': lambda: 0, 'valueChanged': type('_Sig', (), {'connect': lambda *a: None})()})(),
        })()
        self.log_service_label = type('_Dummy', (), {'setText': lambda *a: None})()
        self.console_level_combo = type('_Dummy', (), {'currentText': lambda: 'All', 'findText': lambda *a: -1, 'setCurrentIndex': lambda *a: None})()
        self.console_scope_actions = {}
        self.console_search_input = type('_Dummy', (), {'text': lambda: '', 'setText': lambda *a: None, 'setFocus': lambda: None})()
        self.console_style_checkbox = type('_Dummy', (), {'setChecked': lambda *a: None, 'isChecked': lambda: False})()
        self.autoscroll_checkbox = type('_Dummy', (), {'setChecked': lambda *a: None, 'isChecked': lambda: False})()
        self.pause_logs_button = type('_Dummy', (), {'setChecked': lambda *a: None, 'isChecked': lambda: False})()
        self.btn_refresh_logs = QWidget()
        self.btn_clear_logs = QWidget()
        self.btn_attach_logs = QWidget()
        self.notification_bar = None
        self.status_label = type('_Dummy', (), {'setText': lambda *a: None})()
        self.db_log_viewer = None
        self.console_refresh_timer = QTimer(self)
        self.last_log_hash = {}

        # Keyboard shortcuts
        from PySide6.QtGui import QShortcut, QKeySequence
        QShortcut(QKeySequence('F5'), self).activated.connect(self._reload_webviews)
        QShortcut(QKeySequence('Ctrl+Shift+R'), self).activated.connect(self._reload_ui)
        QShortcut(QKeySequence('Ctrl+Shift+D'), self).activated.connect(self._toggle_webview_dev_mode)

    def _on_architecture_metrics_updated(self, metrics):
        """Handle architecture metrics update."""
        # Update routes preview
        if self.multi_service_discovery:
            # For multi-service, show routes from all services
            all_routes = self.multi_service_discovery.get_all_routes_by_service()
            # Flatten for preview (or we could enhance preview to show per-service)
            if all_routes:
                # Take routes from first available service for now
                first_service = next(iter(all_routes.values()), {})
                self.routes_preview.update_routes(first_service)
        elif self.service_discovery:
            routes_by_tag = self.service_discovery.get_routes_by_tag()
            self.routes_preview.update_routes(routes_by_tag)

    def _setup_connections(self):
        """Setup all button connections"""
        # Main control buttons
        self.btn_all.clicked.connect(self.start_all)
        self.btn_kill_all.clicked.connect(self._stop_all_with_confirmation)
        self.btn_restart_all.clicked.connect(self._restart_all)
        self.btn_db_down.clicked.connect(self.stop_databases)
        if hasattr(self, 'btn_settings'):
            self.btn_settings.clicked.connect(self._open_settings)
        if hasattr(self, 'btn_reload_ui'):
            self.btn_reload_ui.clicked.connect(self._reload_webviews)
            self.btn_reload_ui.setToolTip("F5: Reload webviews | Ctrl+Shift+D: Toggle dev mode (Vite HMR) | Ctrl+Shift+R: Full UI reload")
        
        # Console log controls (may be dummy QWidgets when using embedded React viewer)
        if hasattr(getattr(self, 'btn_refresh_logs', None), 'clicked'):
            self.btn_refresh_logs.clicked.connect(lambda: self._refresh_console_logs(force=True))
        if hasattr(getattr(self, 'btn_clear_logs', None), 'clicked'):
            self.btn_clear_logs.clicked.connect(self._clear_console_display)
        if hasattr(getattr(self, 'btn_attach_logs', None), 'clicked'):
            self.btn_attach_logs.clicked.connect(self._on_attach_logs_clicked)

        # Console refresh timer — disabled when using embedded React viewer.
        self.console_refresh_timer = QTimer(self)
        self.last_log_hash = {}

        # Keyboard shortcuts
        from PySide6.QtGui import QShortcut, QKeySequence
        QShortcut(QKeySequence('F5'), self).activated.connect(self._reload_webviews)
        QShortcut(QKeySequence('Ctrl+Shift+R'), self).activated.connect(self._reload_ui)
        QShortcut(QKeySequence('Ctrl+Shift+D'), self).activated.connect(self._toggle_webview_dev_mode)

    def _select_service(self, key: str):
        """Select a service and refresh logs."""
        _startup_trace(f"_select_service start ({key})")

        # Save scroll position of previous service
        if self.selected_service_key and hasattr(self, 'log_view'):
            scrollbar = self.log_view.verticalScrollBar()
            self.service_scroll_positions[self.selected_service_key] = scrollbar.value()
            _startup_trace(f"_select_service saved scroll position for {self.selected_service_key}")

        # Deselect previous card
        if self.selected_service_key and self.selected_service_key in self.cards:
            self.cards[self.selected_service_key].set_selected(False)
            _startup_trace("_select_service previous deselected")

        # Select new card
        self.selected_service_key = key
        self.service_selected.emit(key)
        sp = self.processes.get(key)
        if key in self.cards:
            self.cards[key].set_selected(True)

            # Update embedded React log viewer to show this service's logs
            webview = getattr(self, 'console_webview', None)
            if webview and getattr(self, '_console_webview_loaded', False):
                webview.page().runJavaScript(f'location.hash = "{key}"')
            else:
                # Fallback: legacy console refresh (if webview not loaded yet)
                self._rebuild_scope_menus_from_buffer(sp)
                self._refresh_console_logs(force=True)

        # Keep database log viewer in sync with selected service for quick pivots.
        # Card keys (main-api, worker) differ from structlog service names (api, worker),
        # so map the card key to the best-matching DB service filter.
        # DB log viewer sync is handled by the React webview (no-op for legacy)
        _startup_trace(f"_select_service end ({key})")

    def _select_database(self, env_key: str):
        """Select a database card."""
        # Deselect previous database card
        if self.selected_database and self.selected_database in self.db_cards:
            self.db_cards[self.selected_database].set_selected(False)

        # Select new database card
        self.selected_database = env_key
        if env_key in self.db_cards:
            self.db_cards[env_key].set_selected(True)

    def _missing_dependency_keys(self, service_key: str) -> list[str]:
        """Return dependency service keys that are not currently running/healthy."""
        state = self.processes.get(service_key)
        if not state:
            return []

        defn = getattr(state, "definition", None) or getattr(state, "defn", None)
        depends_on = getattr(defn, "depends_on", None) or []
        missing: list[str] = []
        for dep_key in depends_on:
            dep = self.processes.get(dep_key)
            dep_running = bool(dep and dep.status.value in ("running", "starting"))
            dep_healthy = bool(dep and dep.health == HealthStatus.HEALTHY)
            if not dep or (not dep_running and not dep_healthy):
                missing.append(dep_key)
        return missing

    def _open_service_url(self, key: str):
        """Open a service's URL in the browser."""
        s = next((x for x in self.services if x.key == key), None)
        if s and s.url:
            webbrowser.open(s.url)

    # _check_health removed; handled by HealthBridge + core HealthManager

    def _update_service_health(self, key: str, status: HealthStatus):
        """Update the health status for a service (called from facade signal)."""
        state = self.processes.get(key)
        if not state:
            return

        old_status = state.health
        # The health manager already set state.health before emitting.
        # But for signals from process_started/stopped lambdas, set it here too.
        if state.health != status:
            state.health = status

        is_running = state.status.value in ("running", "starting")

        # Log status changes
        if old_status != status:
            if _launcher_logger:
                try:
                    _launcher_logger.info("service_health", service_key=key, status=status.value, running=is_running)
                except Exception:
                    pass
            import datetime
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            old_val = old_status.value if hasattr(old_status, 'value') else str(old_status)
            new_val = status.value if hasattr(status, 'value') else str(status)
            state.log_buffer.append(
                f"[{ts}] [LAUNCHER] health: {old_val} → {new_val}  (running={is_running})"
            )

            # Show discovery in notification bar
            title = state.definition.title if hasattr(state, 'definition') else key
            if old_status == HealthStatus.STOPPED and status == HealthStatus.HEALTHY:
                self.notify(f"Detected {title} running", duration_ms=1500, category="SCAN")
            elif old_status == HealthStatus.STOPPED and status == HealthStatus.STARTING:
                self.notify(f"Found {title} starting...", duration_ms=1500, category="SCAN")
            elif status == HealthStatus.STOPPED and old_status in (HealthStatus.HEALTHY, HealthStatus.UNHEALTHY):
                self.notify(f"{title} stopped", duration_ms=1500, category="SCAN")

        # Update card display
        card = self.cards.get(key)
        if card:
            stopping = key in self._stop_in_progress_keys
            card.apply_state(build_card_state(state, stopping=stopping))

        # Keep status bar counts current
        if old_status != status:
            self.update_ports_label()

        # Auto-restart services that were explicitly requested to run but dropped.
        if status == HealthStatus.HEALTHY:
            if old_status != HealthStatus.HEALTHY:
                self._auto_restart_healthy_since[key] = time.monotonic()
            self._auto_restart_pending[key] = False
        else:
            healthy_since = self._auto_restart_healthy_since.pop(key, None)
            if healthy_since is not None and old_status == HealthStatus.HEALTHY:
                healthy_for = time.monotonic() - healthy_since
                if healthy_for >= self._auto_restart_reset_stable_sec:
                    self._clear_auto_restart_state(key, clear_cooldown=True)
                    if _launcher_logger:
                        try:
                            _launcher_logger.info(
                                "service_auto_restart_backoff_reset",
                                service_key=key,
                                healthy_for_s=round(healthy_for, 2),
                            )
                        except Exception:
                            pass
                elif self._auto_restart_attempts.get(key, 0) > 0 and _launcher_logger:
                    try:
                        _launcher_logger.warning(
                            "service_auto_restart_backoff_sticky",
                            service_key=key,
                            healthy_for_s=round(healthy_for, 2),
                            threshold_s=self._auto_restart_reset_stable_sec,
                            attempt=self._auto_restart_attempts.get(key, 0),
                        )
                    except Exception:
                        pass

            if key != "db" and status == HealthStatus.STOPPED and getattr(state, "requested_running", False):
                self._schedule_auto_restart(key, reason="health_stopped")

        # Refresh architecture panel when ANY backend service becomes healthy
        # Check if this is a backend service (main-api, generation-api, etc.)
        is_backend_service = key in ["backend", "main-api", "generation-api"] or key.endswith("-api")
        if is_backend_service and status == HealthStatus.HEALTHY and old_status != status:
            if hasattr(self, 'architecture_panel'):
                # Delay refresh to let service fully initialize
                QTimer.singleShot(2000, self.architecture_panel.refresh_metrics)

    def _update_openapi_status(self, key: str, status):
        """Update the OpenAPI freshness status for a service."""
        card = self.cards.get(key)
        if card:
            card.update_openapi_status(status)

    def _refresh_openapi_status(self, key: str):
        """Force refresh OpenAPI status check for a service."""
        # OpenAPI freshness checks are not yet wired through the facade.
        # TODO: re-add via a periodic timer or on-demand check.
        pass

    def _open_account_live_feed(self, key: str):
        """Open worker account live-feed debug dialog."""
        if key != "worker":
            return
        try:
            # Keep a reference so Qt does not destroy the dialog immediately.
            self._account_live_feed_dialog = show_account_live_feed_dialog(
                self,
                default_account_id="2",
                default_email="stst1616@gmail.com",
                default_provider="pixverse",
            )
        except Exception as e:
            if _launcher_logger:
                try:
                    _launcher_logger.error("account_live_feed_open_failed", error=str(e))
                except Exception:
                    pass

    def _generate_openapi_types(self, key: str):
        """Generate OpenAPI types for a service."""
        state = self.processes.get(key)
        if not state:
            return

        defn = getattr(state, 'definition', None) or getattr(state, 'defn', None)
        if not defn or not getattr(defn, 'openapi_url', None):
            return

        import sys

        # Keep this operation single-flight to avoid thread/process lifecycle races.
        if self._openapi_gen_process and self._openapi_gen_process.state() != QProcess.NotRunning:
            if _launcher_logger:
                _launcher_logger.warning(
                    "openapi_generation_already_running",
                    service_key=self._openapi_gen_service_key,
                    url=self._openapi_gen_url,
                )
            return

        pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
        env = service_env()
        env['OPENAPI_URL'] = defn.openapi_url
        env['OPENAPI_TYPES_OUT'] = defn.openapi_types_path or "packages/shared/api/model/src/generated/openapi"
        env['OPENAPI_ORVAL_OUT'] = defn.openapi_types_path or "packages/shared/api/model/src/generated/openapi"

        try:
            if _launcher_logger:
                _launcher_logger.info("openapi_generation_started", url=defn.openapi_url)

            process = QProcess(self)
            proc_env = QProcessEnvironment()
            for env_key, env_value in env.items():
                proc_env.insert(str(env_key), str(env_value))
            process.setProcessEnvironment(proc_env)
            process.setWorkingDirectory(str(ROOT))
            process.setProgram(pnpm_cmd)
            process.setArguments(["-s", "openapi:gen"])

            self._openapi_gen_process = process
            self._openapi_gen_service_key = key
            self._openapi_gen_url = defn.openapi_url
            process.finished.connect(self._on_openapi_generation_finished)
            process.start()

            if not process.waitForStarted(3000):
                err = process.errorString() or "process failed to start"
                if _launcher_logger:
                    _launcher_logger.error("openapi_generation_error", url=defn.openapi_url, error=err)
                self._cleanup_openapi_generation_process()

        except Exception as e:
            if _launcher_logger:
                _launcher_logger.error("openapi_generation_error", url=defn.openapi_url, error=str(e))

    def _cleanup_openapi_generation_process(self):
        """Release active OpenAPI generation process references safely."""
        process = self._openapi_gen_process
        self._openapi_gen_process = None
        self._openapi_gen_service_key = None
        self._openapi_gen_url = None
        if process:
            try:
                process.deleteLater()
            except Exception:
                pass

    def _on_openapi_generation_finished(self, exit_code: int, exit_status):
        """Handle completion of background OpenAPI generation."""
        process = self._openapi_gen_process
        service_key = self._openapi_gen_service_key
        url = self._openapi_gen_url

        stdout = ""
        stderr = ""
        if process:
            try:
                stdout = bytes(process.readAllStandardOutput()).decode("utf-8", errors="replace")
            except Exception:
                stdout = ""
            try:
                stderr = bytes(process.readAllStandardError()).decode("utf-8", errors="replace")
            except Exception:
                stderr = ""

        if exit_status == QProcess.NormalExit and exit_code == 0:
            if _launcher_logger:
                _launcher_logger.info("openapi_generation_success", url=url)
            if service_key:
                self._refresh_openapi_status(service_key)
        else:
            if _launcher_logger:
                _launcher_logger.error(
                    "openapi_generation_failed",
                    url=url,
                    exit_code=exit_code,
                    exit_status=int(exit_status),
                    error=stderr or stdout or "unknown error",
                )

        self._cleanup_openapi_generation_process()

    def update_ports_label(self):
        p = read_env_ports()
        # Count running services
        running_count = sum(1 for s in self.processes.values() if s.status.value in ("running", "starting"))
        healthy_count = sum(1 for s in self.processes.values() if s.health == HealthStatus.HEALTHY)

        status_emoji = "✓" if healthy_count == running_count and running_count > 0 else "●"
        self.status_label.setText(
            f"{status_emoji} {running_count}/{len(self.processes)} running "
            f"({healthy_count} healthy) • "
            f"Backend:{p.backend} Frontend:{p.frontend}"
        )

    def selected_key(self) -> str | None:
        """Return the currently selected service key."""
        return self.selected_service_key

    def _set_bulk_buttons_enabled(self, enabled: bool):
        """Enable/disable bulk action buttons."""
        self.btn_all.setEnabled(enabled)
        self.btn_kill_all.setEnabled(enabled)
        self.btn_restart_all.setEnabled(enabled)
        self.btn_db_down.setEnabled(enabled)

    def _restore_status_label(self):
        """Restore the status label to show port status."""
        self.update_ports_label()

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
                    running_keys = [k for k, s in self.processes.items() if s.status.value in ("running", "starting")]
                    self.stop_all(synchronous=True)
                    QTimer.singleShot(2000, lambda: self._restart_services(running_keys))
            except Exception as e:
                QMessageBox.critical(self, 'Error', f'Failed to save environment: {e}')
                if _launcher_logger:
                    try:
                        _launcher_logger.error('environment_update_failed', error=str(e))
                    except Exception:
                        pass

    def _apply_window_flags(self):
        """Apply window flags based on UI state."""
        # Start with standard window flags including system buttons
        flags = Qt.Window | Qt.WindowCloseButtonHint | Qt.WindowMinimizeButtonHint | Qt.WindowMaximizeButtonHint

        if self.ui_state.window_always_on_top:
            # Add always on top flag
            flags |= Qt.WindowStaysOnTopHint

        self.setWindowFlags(flags)
        # Need to show again after changing flags
        self.show()

    # ─────────────────────────────────────────────────────────────────────────
    # Widget Registry - for clean UI reload
    # ─────────────────────────────────────────────────────────────────────────

    def register_widget(self, key: str, widget) -> any:
        """Register a widget for lifecycle management. Returns the widget."""
        self.widgets[key] = widget
        return widget

    def get_widget(self, key: str):
        """Get a registered widget by key."""
        return self.widgets.get(key)

    def clear_widgets(self):
        """Clear widget registry (call before rebuild)."""
        self.widgets.clear()

    def _open_settings(self):
        if hasattr(self, "settings_tab_index"):
            self.main_tabs.setCurrentIndex(self.settings_tab_index)

    def _apply_settings(self, updated):
        old_always_on_top = self.ui_state.window_always_on_top
        self.ui_state = updated
        # Apply preferences immediately
        set_sql_logging(self.ui_state.sql_logging_enabled)
        set_worker_debug_flags(self.ui_state.worker_debug_flags)
        set_backend_log_level('DEBUG' if self.ui_state.backend_debug_enabled else 'INFO')
        set_use_local_datastores(self.ui_state.use_local_datastores)

        # Apply window flags if changed
        if old_always_on_top != self.ui_state.window_always_on_top:
            self._apply_window_flags()

        # DB log auto-refresh is now handled by the React webview.

    def _reload_webviews(self):
        """Reload the main webview.

        Forces cache bypass by appending a timestamp query param.
        """
        import time as _t
        from PySide6.QtCore import QUrl
        bust = f"_t={int(_t.time())}"
        is_dev = getattr(self, '_webview_dev_mode', False)
        base = "http://localhost:3100" if is_dev else "http://localhost:8100"

        wv = getattr(self, 'webview', None)
        if wv:
            wv.setUrl(QUrl(f"{base}?{bust}"))

    def _toggle_webview_dev_mode(self):
        """Switch embedded webviews between built files (:8100) and Vite dev server (:3100).

        When Vite dev server is running (pnpm --filter @pixsim7/launcher dev),
        dev mode gives hot-reload — edits appear instantly without building.
        """
        from PySide6.QtCore import QUrl
        import socket

        is_dev = getattr(self, '_webview_dev_mode', False)

        if not is_dev:
            # Check if Vite dev server is running
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("127.0.0.1", 3100)) != 0:
                    self.notify("Vite dev server not running — start with: pnpm --filter @pixsim7/launcher dev", duration_ms=3000)
                    return

        self._webview_dev_mode = not is_dev
        base = "http://localhost:3100" if self._webview_dev_mode else "http://localhost:8100"

        wv = getattr(self, 'webview', None)
        if wv:
            wv.setUrl(QUrl(base))

    def _reload_ui(self):
        """Rebuild UI tabs and refresh settings without restarting launcher."""
        # Pause monitoring during rebuild
        self.facade.stop_all_managers()

        try:
            if hasattr(self, "console_refresh_timer"):
                self.console_refresh_timer.stop()
        except Exception:
            pass

        try:
            diag_watch = getattr(self, "diagnostics_watch_widget", None)
            if diag_watch and hasattr(diag_watch, "shutdown"):
                diag_watch.shutdown()
        except Exception:
            pass

        # Reset panels (keep splitter)
        for attr in ("main_tabs", "right_panel", "left_panel"):
            try:
                w = getattr(self, attr, None)
                if w:
                    w.setParent(None)
            except Exception:
                pass

        self.clear_widgets()
        self.cards.clear()

        # Reload state
        try:
            self.ui_state = load_ui_state()
        except Exception:
            pass

        # Rebuild facade with fresh service definitions
        try:
            self.services = build_services_from_manifests()
            from .launcher_facade import LauncherFacade
            self.facade = LauncherFacade(parent=self)
            self.processes = self.facade.process_mgr.states
            self.facade.health_update.connect(self._update_service_health)
            self.facade.process_started.connect(
                lambda k, d: self._update_service_health(k, HealthStatus.STARTING))
            self.facade.process_stopped.connect(
                lambda k, d: self._update_service_health(k, HealthStatus.STOPPED))
        except Exception:
            pass

        # Rebuild panels
        try:
            if hasattr(self, "splitter"):
                left = self._build_left_panel()
                self.splitter.insertWidget(0, left)
                right = self._build_right_panel()
                self.splitter.addWidget(right)
                self.splitter.setSizes([350, 850])
        except Exception:
            pass

        self._restore_console_ui_state()
        self._setup_connections()
        if hasattr(self, "console_refresh_timer"):
            self.console_refresh_timer.start(2000)

        self.facade.start_all_managers()
        self._notify_ui_reloaded()

    def _open_db_browser(self):
        """Open database browser window"""
        try:
            from PySide6.QtWidgets import QDialog, QVBoxLayout
            try:
                from .widgets.database_browser_widget import DatabaseBrowserWidget
            except Exception:
                from widgets.database_browser_widget import DatabaseBrowserWidget

            dlg = QDialog(self)
            dlg.setWindowTitle("Database Browser")
            dlg.setMinimumWidth(900)
            dlg.setMinimumHeight(600)
            layout = QVBoxLayout(dlg)
            layout.addWidget(DatabaseBrowserWidget(parent=dlg))
            dlg.exec()
        except Exception as exc:
            QMessageBox.critical(self, "Error", f"Failed to open database browser:\n{exc}")

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
                msg = "Successfully imported accounts."
                if result.stdout:
                    msg = f"{msg} {result.stdout.strip()}"
                self.notify(msg)
            else:
                QMessageBox.warning(
                    self,
                    "Import Failed",
                    f"Import failed:\n\n{result.stderr or result.stdout}"
                )
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to run import:\n{e}")

    # Removed inline dialog implementations; they are now in dialogs/* modules

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

        # DB log viewer is now a React webview — no shutdown needed.

        # Stop diagnostics watcher if running.
        try:
            diag_watch = getattr(self, "diagnostics_watch_widget", None)
            if diag_watch and hasattr(diag_watch, "shutdown"):
                diag_watch.shutdown()
        except Exception:
            pass

        # Stop any active OpenAPI generation process launched by the UI.
        try:
            if self._openapi_gen_process and self._openapi_gen_process.state() != QProcess.NotRunning:
                self._openapi_gen_process.kill()
                self._openapi_gen_process.waitForFinished(2000)
        except Exception:
            pass
        finally:
            self._cleanup_openapi_generation_process()

        # Stop facade managers (health monitoring, log monitoring)
        if hasattr(self, 'facade'):
            try:
                self.facade.stop_all_managers()
            except Exception:
                pass

        # Stop embedded API server
        if self._api_cleanup:
            try:
                self._api_cleanup()
            except Exception:
                pass

        if self.ui_state.stop_services_on_exit:
            # Stop launcher-managed services but leave detached containers (db)
            # alive — they should survive launcher restarts.
            try:
                for key, state in self.processes.items():
                    defn = getattr(state, "definition", None)
                    if defn and defn.key == "db":
                        continue
                    try:
                        self.facade.stop_service(key, graceful=True)
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
