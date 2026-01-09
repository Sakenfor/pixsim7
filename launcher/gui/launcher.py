import sys
import webbrowser
import subprocess
import os
import signal
import re
from html import escape
from typing import Dict, Optional
from datetime import datetime
from urllib.parse import quote
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QListWidget, QListWidgetItem,
    QTextEdit, QSplitter, QMessageBox, QDialog, QFormLayout, QLineEdit, QCheckBox, QDialogButtonBox,
    QScrollArea, QFrame, QGridLayout, QTabWidget, QMenu
)
from PySide6.QtCore import Qt, QProcess, QTimer, Signal, QSize, QThread, QUrl
from PySide6.QtGui import QColor, QTextCursor, QFont, QPalette, QShortcut, QKeySequence, QAction, QCursor

# Load .env file into environment BEFORE initializing logger
from dotenv import load_dotenv
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
load_dotenv(_env_path)

try:
    from .services import build_services_with_fallback, ServiceDef
    from .config import (
        service_env, read_env_ports, write_env_ports, Ports,
        check_tool_available, load_ui_state, save_ui_state, UIState, ROOT,
        read_env_file, write_env_file, set_sql_logging, set_backend_log_level, set_worker_debug_flags
    )
    from .docker_utils import compose_ps, compose_up_detached, compose_down
    from .dialogs.git_tools_dialog import show_git_tools_dialog
    from .dialogs.simple_git_dialog import show_simple_git_dialog
    from .dialogs.migrations_dialog import show_migrations_dialog
    from .dialogs.ports_dialog import show_ports_dialog
    from .dialogs.env_editor_dialog import show_env_editor
    from .database_log_viewer import DatabaseLogViewer
    from .dialogs.log_management_dialog import show_log_management_dialog
except ImportError:
    # Fallback for running directly
    from services import build_services_with_fallback, ServiceDef
    from config import (
        service_env, read_env_ports, write_env_ports, Ports,
        check_tool_available, load_ui_state, save_ui_state, UIState, ROOT,
        read_env_file, write_env_file, set_sql_logging, set_backend_log_level, set_worker_debug_flags
    )
    from docker_utils import compose_ps, compose_up_detached, compose_down
    from dialogs.git_tools_dialog import show_git_tools_dialog
    from dialogs.simple_git_dialog import show_simple_git_dialog
    from dialogs.migrations_dialog import show_migrations_dialog
    from dialogs.ports_dialog import show_ports_dialog
    from dialogs.env_editor_dialog import show_env_editor
    from database_log_viewer import DatabaseLogViewer
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
    from .widgets.notification_bar import NotificationBar
except Exception:
    from widgets.service_card import ServiceCard
    from widgets.notification_bar import NotificationBar

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
    from .tabs import ConsoleTab, DbLogsTab, ToolsTab, ArchitectureTab
except Exception:
    from tabs import ConsoleTab, DbLogsTab, ToolsTab, ArchitectureTab

try:
    from .icons import (
        ICON_SETTINGS, ICON_RELOAD,
        TAB_CONSOLE, TAB_DB_LOGS, TAB_TOOLS, TAB_SETTINGS, TAB_ARCHITECTURE
    )
except Exception:
    from icons import (
        ICON_SETTINGS, ICON_RELOAD,
        TAB_CONSOLE, TAB_DB_LOGS, TAB_TOOLS, TAB_SETTINGS, TAB_ARCHITECTURE
    )

try:
    from .processes import ServiceProcess
except Exception:
    from processes import ServiceProcess

try:
    from .health_worker import HealthWorker
except Exception:
    from health_worker import HealthWorker

# New launcher_core integration
try:
    from .launcher_facade import LauncherFacade
    from .service_adapter import ServiceProcessAdapter
    USE_NEW_CORE = False
except Exception:
    try:
        from launcher_facade import LauncherFacade
        from service_adapter import ServiceProcessAdapter
        USE_NEW_CORE = False
    except Exception:
        USE_NEW_CORE = False

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
        detect_console_level, decorate_console_message,
        format_console_log_html_classic, format_console_log_html_enhanced,
    )
except Exception:
    from console_utils import (
        CONSOLE_LEVEL_PATTERNS, CONSOLE_LEVEL_STYLES,
        CONSOLE_TIMESTAMP_REGEX, ISO_TIMESTAMP_REGEX, LEVEL_PREFIX_REGEX,
        URL_LINK_REGEX, READY_REGEX, ERROR_REGEX, WARN_REGEX,
        detect_console_level, decorate_console_message,
        format_console_log_html_classic, format_console_log_html_enhanced,
    )

# Ports and Env editor dialogs moved to dialogs/* modules


STARTUP_TRACE_ENABLED = os.getenv("PIXSIM_LAUNCHER_TRACE", "0").lower() in {"1", "true", "yes", "on"}


def _startup_trace(message: str) -> None:
    """Optional startup tracing guarded by PIXSIM_LAUNCHER_TRACE env flag."""
    if not STARTUP_TRACE_ENABLED:
        return
    try:
        root_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        trace_path = os.path.join(root_path, 'data', 'logs', 'launcher', 'startup_trace.log')
        os.makedirs(os.path.dirname(trace_path), exist_ok=True)
        with open(trace_path, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now().isoformat()} {message}\n")
    except Exception:
        pass


class LauncherWindow(QWidget):
    health_check_signal = Signal(str, HealthStatus)

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

        self.services = build_services_with_fallback()

        # Initialize service management
        # Use new launcher_core if available, otherwise fall back to old implementation
        if USE_NEW_CORE:
            # Create facade (wraps core managers)
            self.facade = LauncherFacade(self)
            # Create adapter instances (provides ServiceProcess-compatible interface)
            self.processes: Dict[str, ServiceProcessAdapter] = {
                s.key: ServiceProcessAdapter(s, self.facade) for s in self.services
            }
            # Log that we're using new core
            if _launcher_logger:
                try:
                    _launcher_logger.info(
                        "launcher_using_new_core",
                        message="Using launcher_core managers"
                    )
                except Exception:
                    pass
        else:
            # Fall back to old implementation
            self.facade = None
            self.processes: Dict[str, ServiceProcess] = {s.key: ServiceProcess(s) for s in self.services}
            if _launcher_logger:
                try:
                    _launcher_logger.warning(
                        "launcher_using_old_core",
                        message="Falling back to old ServiceProcess implementation"
                    )
                except Exception:
                    pass

        # Clean up stale PIDs from previous sessions
        try:
            from .pid_store import cleanup_stale_pids
            cleanup_stale_pids()
        except Exception:
            pass

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

        # Widget registry for clean reload
        self.widgets: Dict[str, QWidget] = {}

        # Check tool availability
        for sp in self.processes.values():
            sp.check_tool_availability()

        # Initialize attributes before _init_ui (load from saved state)
        self.autoscroll_enabled = self.ui_state.autoscroll_enabled
        self.console_style_enhanced = self.ui_state.console_style_enhanced
        self.log_filter = ''
        self.log_timer = QTimer(self)
        self.service_scroll_positions = {}  # Track scroll position per service

        self._init_ui()

        # Restore selected service
        if self.ui_state.selected_service and self.ui_state.selected_service in self.cards:
            self._select_service(self.ui_state.selected_service)
        elif self.services:
            # Select first service by default
            self._select_service(self.services[0].key)
        # Nothing heavy until UI is visible

        # Background health worker / health manager
        if USE_NEW_CORE and self.facade:
            # Use new launcher_core health manager (via facade)
            self.health_worker = None
            # Start managers
            self.facade.start_all_managers()
            # Connect facade signals to update UI
            self.facade.health_update.connect(self._update_service_health)
        else:
            # Use old health worker
            self.health_worker = HealthWorker(self.processes, ui_state=self.ui_state, parent=self)
            self.health_worker.health_update.connect(self._update_service_health)
            self.health_worker.openapi_update.connect(self._update_openapi_status)
            self.health_worker.start()

        # Connect health check signal (for any manual triggers if added later)
        self.health_check_signal.connect(self._update_service_health)

        self.update_ports_label()

    def _build_left_panel(self):
        left = QWidget()
        self.left_panel = left
        left.setMinimumWidth(280)
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD, theme.SPACING_MD)

        header = QLabel("Services")
        header_font = QFont()
        header_font.setPointSize(13)
        header_font.setBold(True)
        header.setFont(header_font)
        header_row = QHBoxLayout()
        header_row.addWidget(header)
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

        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setFrameShape(QFrame.NoFrame)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        cards_container = QWidget()
        cards_layout = QVBoxLayout(cards_container)
        cards_layout.setSpacing(8)
        cards_layout.setContentsMargins(0, 0, 0, 0)

        self.cards = {}
        for s in self.services:
            sp = self.processes[s.key]
            card = ServiceCard(s, sp)
            self.cards[s.key] = card
            card.clicked.connect(self._select_service)
            card.start_btn.clicked.connect(lambda checked, k=s.key: self._start_service(k))
            card.stop_btn.clicked.connect(lambda checked, k=s.key: self._stop_service(k))
            card.force_stop_btn.clicked.connect(lambda checked, k=s.key: self._force_stop_service(k))
            card.restart_requested.connect(self._restart_service)
            card.db_logs_requested.connect(lambda k=s.key: (self._select_service(k), self._open_db_logs_for_current_service()))
            card.openapi_refresh_requested.connect(self._refresh_openapi_status)
            card.openapi_generate_requested.connect(self._generate_openapi_types)
            if card.open_btn:
                card.open_btn.clicked.connect(lambda checked, k=s.key: self._open_service_url(k))
            cards_layout.addWidget(card)

        cards_layout.addStretch()
        scroll_area.setWidget(cards_container)
        left_layout.addWidget(scroll_area, stretch=1)

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

        console_tab = ConsoleTab.create(self)
        self.main_tabs.addTab(console_tab, TAB_CONSOLE)

        db_logs_tab = DbLogsTab.create(self)
        self.main_tabs.addTab(db_logs_tab, TAB_DB_LOGS)

        tools_tab = ToolsTab.create(self)
        self.main_tabs.addTab(tools_tab, TAB_TOOLS)

        settings_tab = ToolsTab.create_settings(self)
        self.main_tabs.addTab(settings_tab, TAB_SETTINGS)
        self.settings_tab_index = self.main_tabs.indexOf(settings_tab)

        architecture_tab = ArchitectureTab.create(self)
        self.main_tabs.addTab(architecture_tab, TAB_ARCHITECTURE)

        return right

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
        root = QHBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        self.splitter = QSplitter(Qt.Horizontal)
        self.splitter.setHandleWidth(6)
        self.splitter.setChildrenCollapsible(False)
        root.addWidget(self.splitter)

        left = self._build_left_panel()
        self.splitter.addWidget(left)

        right = self._build_right_panel()
        self.splitter.addWidget(right)

        # Set initial splitter sizes (left panel ~30%, right panel ~70%)
        self.splitter.setSizes([350, 850])

        self._restore_console_ui_state()

        self._setup_connections()

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
            self.btn_reload_ui.clicked.connect(self._reload_ui)
        
        # Console log controls
        self.btn_refresh_logs.clicked.connect(lambda: self._refresh_console_logs(force=True))
        self.btn_clear_logs.clicked.connect(self._clear_console_display)
        if hasattr(self, 'btn_attach_logs'):
            self.btn_attach_logs.clicked.connect(self._on_attach_logs_clicked)

        # Auto-refresh timer for console
        self.console_refresh_timer = QTimer(self)
        self.console_refresh_timer.timeout.connect(self._refresh_console_logs)
        self.last_log_hash = {}  # Track log buffer hashes to avoid unnecessary UI updates
        self.console_refresh_timer.start(1000)  # Refresh every second

        # Track scroll position changes for current service
        if hasattr(self, 'log_view'):
            self.log_view.verticalScrollBar().valueChanged.connect(self._on_console_scroll)

    def _on_console_link_clicked(self, url: QUrl):
        """Handle clickable links in the console view (e.g., ID filters, show dropdown menu)."""
        try:
            scheme = url.scheme()

            # Show dropdown menu with field actions (same as DB logs)
            if scheme == "click":
                field_name = url.host()
                raw_value = url.path().lstrip("/")
                field_value = QUrl.fromPercentEncoding(raw_value.encode("utf-8"))
                if field_name and field_value:
                    self._show_console_field_action_popup(field_name, field_value)
                return

            # Legacy: Pivot into DB logs with a pre-applied field filter
            if scheme == "dbfilter":
                field_name = url.host()
                value = url.path().lstrip("/")
                if not field_name or not value:
                    return

                # Switch to DB logs tab (keeps current service selection in sync)
                self._open_db_logs_for_current_service()

                # Delay filter application to avoid threading race conditions during tab switch
                if hasattr(self, "db_log_viewer") and self.db_log_viewer:
                    def apply_filter():
                        try:
                            filter_url = QUrl(f"filter://{field_name}/{value}")
                            self.db_log_viewer._on_log_link_clicked(filter_url)
                        except Exception:
                            # Best-effort; ignore if viewer isn't ready yet
                            pass
                    QTimer.singleShot(100, apply_filter)
                return

            # Fallback: open regular web links in browser
            if scheme in {"http", "https"}:
                try:
                    webbrowser.open(url.toString())
                except Exception:
                    pass
        except Exception as e:
            try:
                if _launcher_logger:
                    _launcher_logger.warning("console_link_click_failed", error=str(e), url=url.toString())
            except Exception:
                pass

    def _show_console_field_action_popup(self, field_name: str, field_value: str):
        """Show popup menu with actions for a clickable field in console logs."""
        if not field_name or not field_value:
            return
        field_def = get_field(field_name)

        menu = QMenu(self)
        # Keep a reference so the menu isn't GC'd while visible.
        self._active_field_menu = menu
        menu.aboutToHide.connect(lambda: setattr(self, "_active_field_menu", None))
        menu.setStyleSheet("""
            QMenu {
                background-color: #2d2d2d;
                color: #e0e0e0;
                border: 1px solid #555;
                padding: 4px;
            }
            QMenu::item {
                padding: 6px 20px 6px 10px;
                border-radius: 3px;
            }
            QMenu::item:selected {
                background-color: #5a9fd4;
            }
            QMenu::separator {
                height: 1px;
                background-color: #555;
                margin: 4px 8px;
            }
        """)

        if field_def:
            # Add header with field info
            display_name = field_def.display_name
            truncated = field_value[:20] + "..." if len(field_value) > 20 else field_value
            header_action = QAction(f"{display_name}: {truncated}", self)
            header_action.setEnabled(False)
            header_font = header_action.font()
            header_font.setBold(True)
            header_action.setFont(header_font)
            menu.addAction(header_action)
            menu.addSeparator()

            # Add actions from registry
            for action_def in field_def.actions:
                icon = action_def.icon + " " if action_def.icon else ""
                action = QAction(f"{icon}{action_def.label}", self)

                if action_def.tooltip:
                    action.setToolTip(action_def.tooltip)

                # Connect based on action type
                if action_def.action_type == ActionType.FILTER:
                    action.triggered.connect(
                        lambda checked=False, fn=field_name, fv=field_value:
                        self._apply_console_field_filter(fn, fv)
                    )
                elif action_def.action_type == ActionType.COPY:
                    action.triggered.connect(
                        lambda checked=False, v=field_value:
                        self._copy_to_clipboard(v)
                    )
                elif action_def.action_type == ActionType.TRACE:
                    action.triggered.connect(
                        lambda checked=False, fn=field_name, fv=field_value:
                        self._apply_console_trace_action(fn, fv)
                    )

                menu.addAction(action)

            # Convenience: open request trace JSON for request_id values
            if field_name == "request_id":
                menu.addSeparator()
                open_trace_action = QAction("Show request trace", self)
                api_url = getattr(getattr(self, "db_log_viewer", None), "api_url", "http://localhost:8001")
                open_trace_action.triggered.connect(
                    lambda checked=False, rid=str(field_value): (
                        self.db_log_viewer.show_request_trace_popup(rid)
                        if getattr(self, "db_log_viewer", None)
                        else webbrowser.open(
                            f"{api_url}/api/v1/logs/trace/request/{quote(str(field_value), safe='')}"
                        )
                    )
                )
                menu.addAction(open_trace_action)
        else:
            # Fallback for unregistered fields
            filter_action = QAction(f"🔍 Filter by {field_name}", self)
            filter_action.triggered.connect(
                lambda: self._apply_console_field_filter(field_name, field_value)
            )
            menu.addAction(filter_action)

            copy_action = QAction(f"📋 Copy value", self)
            copy_action.triggered.connect(
                lambda: self._copy_to_clipboard(field_value)
            )
            menu.addAction(copy_action)

        # Pause log refresh while menu is visible to avoid re-render races.
        timer = getattr(self, "console_refresh_timer", None)
        try:
            if timer:
                timer.stop()
            menu.popup(QCursor.pos())
        except Exception:
            # Fallback to copy to clipboard rather than crashing.
            try:
                self._copy_to_clipboard(field_value)
            except Exception:
                pass
        finally:
            if timer:
                # Resume after a short delay so the menu can process the click event cleanly.
                QTimer.singleShot(250, timer.start)

    def _apply_console_field_filter(self, field_name: str, field_value: str):
        """Apply field filter by switching to DB logs tab."""
        self._open_db_logs_for_current_service()

        # Apply the filter in DB logs viewer
        if hasattr(self, "db_log_viewer") and self.db_log_viewer:
            def apply_filter():
                try:
                    filter_url = QUrl(f"filter://{field_name}/{field_value}")
                    self.db_log_viewer._on_log_link_clicked(filter_url)
                except Exception:
                    pass
            QTimer.singleShot(100, apply_filter)

    def _apply_console_trace_action(self, field_name: str, field_value: str):
        """Apply trace action by switching to DB logs and showing full trace."""
        self._open_db_logs_for_current_service()

        # Apply the filter in DB logs viewer
        if hasattr(self, "db_log_viewer") and self.db_log_viewer:
            def apply_trace():
                try:
                    # Use click:// to trigger the trace action in DB logs
                    click_url = QUrl(f"click://{field_name}/{field_value}")
                    self.db_log_viewer._on_log_link_clicked(click_url)
                except Exception:
                    pass
            QTimer.singleShot(100, apply_trace)

    def _copy_to_clipboard(self, text: str):
        """Copy text to clipboard."""
        clipboard = QApplication.clipboard()
        clipboard.setText(text)

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
        sp = self.processes.get(key)
        if key in self.cards:
            self.cards[key].set_selected(True)
            _startup_trace("_select_service card selected")

            # Auto-attach logs for externally running services (e.g., backend started outside launcher)
            if sp is not None and getattr(sp, "proc", None) is None and getattr(sp, "running", False):
                attach_fn = getattr(sp, "attach_logs", None)
                if callable(attach_fn):
                    attach_fn()
                    _startup_trace("_select_service auto-attached logs")

            # Refresh logs (scroll position will be restored in _refresh_console_logs)
            self._refresh_console_logs(force=True)
            _startup_trace("_select_service console refreshed")

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
                _startup_trace("_select_service db viewer synced")
        _startup_trace(f"_select_service end ({key})")

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
                # Treat a dependency as satisfied if either:
                # - the launcher is managing it and it's running, or
                # - it's healthy according to health checks (externally managed but OK).
                dep_running = bool(dep_process and getattr(dep_process, "running", False))
                dep_healthy = bool(dep_process and getattr(dep_process, "health_status", None) == HealthStatus.HEALTHY)
                if not dep_process or (not dep_running and not dep_healthy):
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
            # Log service start
            if _launcher_logger:
                try:
                    pid = getattr(sp, "started_pid", None)
                    _launcher_logger.info("service_started", service_key=key, pid=pid)
                except Exception:
                    pass

    def _stop_service(self, key: str):
        """Stop a specific service."""
        sp = self.processes.get(key)
        if sp:
            sp.stop(graceful=True)
            self._refresh_console_logs()
            # Log service stop
            if _launcher_logger:
                try:
                    _launcher_logger.info("service_stopped", service_key=key)
                except Exception:
                    pass

    def _force_stop_service(self, key: str):
        """Force stop a specific service (kill all processes)."""
        sp = self.processes.get(key)
        if sp:
            sp.stop(graceful=False)
            self._refresh_console_logs()
            # Log service force stop
            if _launcher_logger:
                try:
                    _launcher_logger.info("service_force_stopped", service_key=key)
                except Exception:
                    pass

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
        if self.health_worker:
            # Clear the last check time to force immediate recheck
            self.health_worker.last_openapi_check.pop(key, None)
            self.health_worker.openapi_status_cache.pop(key, None)

    def _generate_openapi_types(self, key: str):
        """Generate OpenAPI types for a service."""
        sp = self.processes.get(key)
        if not sp:
            return

        defn = getattr(sp, 'defn', None)
        if not defn or not defn.openapi_url:
            return

        # Run pnpm openapi:gen in background
        import subprocess
        import sys

        pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
        env = service_env()
        env['OPENAPI_URL'] = defn.openapi_url

        try:
            # Show status in console
            if _launcher_logger:
                _launcher_logger.info("openapi_generation_started", url=defn.openapi_url)

            proc = subprocess.Popen(
                [pnpm_cmd, "-s", "openapi:gen"],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env
            )

            # Run in thread to avoid blocking UI
            def on_complete():
                out, err = proc.communicate(timeout=120)
                if proc.returncode == 0:
                    if _launcher_logger:
                        _launcher_logger.info("openapi_generation_success", url=defn.openapi_url)
                    # Update cache and refresh status
                    try:
                        from .openapi_checker import update_schema_cache
                        if defn.openapi_types_path:
                            update_schema_cache(defn.openapi_url, defn.openapi_types_path)
                    except Exception:
                        pass
                    # Trigger refresh
                    self._refresh_openapi_status(key)
                else:
                    if _launcher_logger:
                        _launcher_logger.error("openapi_generation_failed", url=defn.openapi_url, error=err or out)

            from PySide6.QtCore import QThread
            class GenThread(QThread):
                def run(self_thread):
                    on_complete()

            self._gen_thread = GenThread()
            self._gen_thread.start()

        except Exception as e:
            if _launcher_logger:
                _launcher_logger.error("openapi_generation_error", url=defn.openapi_url, error=str(e))

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
        # Disable bulk buttons and update status during operation
        self._set_bulk_buttons_enabled(False)
        self.status_label.setText("Starting all services...")

        # Build dependency graph and start in correct order
        started = set()
        if getattr(self.ui_state, "use_local_datastores", False):
            started.add("db")

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

                if key == "db" and getattr(self.ui_state, "use_local_datastores", False):
                    started.add(key)
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
        # Re-enable buttons and restore status after a short delay
        QTimer.singleShot(500, lambda: (
            self._set_bulk_buttons_enabled(True),
            self._restore_status_label()
        ))

    def _set_bulk_buttons_enabled(self, enabled: bool):
        """Enable/disable bulk action buttons."""
        self.btn_all.setEnabled(enabled)
        self.btn_kill_all.setEnabled(enabled)
        self.btn_restart_all.setEnabled(enabled)
        self.btn_db_down.setEnabled(enabled)

    def _restore_status_label(self):
        """Restore the status label to show port status."""
        self._update_status_bar()

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
            # Disable bulk buttons and update status during operation
            self._set_bulk_buttons_enabled(False)
            self.status_label.setText("Stopping all services...")
            self.stop_all()
            # Re-enable buttons and restore status after a short delay
            QTimer.singleShot(500, lambda: (
                self._set_bulk_buttons_enabled(True),
                self._restore_status_label()
            ))

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

            # Disable bulk buttons and update status during operation
            self._set_bulk_buttons_enabled(False)
            self.status_label.setText("Restarting all services...")

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
        # Re-enable buttons and restore status after restart
        QTimer.singleShot(500, lambda: (
            self._set_bulk_buttons_enabled(True),
            self._restore_status_label()
        ))

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
                self.notify('Databases have been stopped.')
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
        self.services = build_services_with_fallback()
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
        if hasattr(self, 'health_worker') and self.health_worker:
            try:
                self.health_worker.stop()
                self.health_worker.wait(2000)  # Wait up to 2 seconds
            except Exception:
                pass
        # Create new health worker
        self.health_worker = HealthWorker(self.processes, ui_state=self.ui_state, parent=self)
        self.health_worker.health_update.connect(self._on_health_update)
        self.health_worker.start()

        # Update UI (cards will be updated via health_update signals)
        self._refresh_db_logs()

    def _auto_refresh_logs(self):
        """Deprecated: file log auto-refresh; use DB viewer controls."""
        pass

    def _on_autoscroll_changed(self, state):
        self.autoscroll_enabled = (state == Qt.Checked)
        self.ui_state.autoscroll_enabled = self.autoscroll_enabled
        save_ui_state(self.ui_state)
        # Update log view widget
        if hasattr(self, 'log_view'):
            self.log_view.set_autoscroll(self.autoscroll_enabled)

    def _on_pause_logs_changed(self, checked):
        """Pause/resume log updates."""
        # Update log view widget
        if hasattr(self, 'log_view'):
            self.log_view.set_paused(checked)

        if hasattr(self, 'pause_logs_button'):
            if checked:
                self.pause_logs_button.setText('▶ Resume')
                self.pause_logs_button.setToolTip("Resume log updates")
            else:
                self.pause_logs_button.setText('⏸ Pause')
                self.pause_logs_button.setToolTip("Pause log updates to scroll through history")
                # Refresh logs immediately when resuming
                self._refresh_console_logs(force=True)

    def _on_console_scroll(self, value):
        """Track scroll position when user manually scrolls."""
        if self.selected_service_key and not self.autoscroll_enabled:
            self.service_scroll_positions[self.selected_service_key] = value

    def _on_filter_changed(self, text):
        self.log_filter = text.lower()
        # No-op; file log filter removed
        pass

    def _refresh_console_logs(self, force: bool = False):
        """Refresh the console log display with service output (only when changed)."""
        _startup_trace("_refresh_console_logs start")

        if not self.selected_service_key:
            _startup_trace("_refresh_console_logs skipped (no selection)")
            return

        sp = self.processes.get(self.selected_service_key)
        if not sp:
            _startup_trace("_refresh_console_logs skipped (no service)")
            return

        # Update service label (include basic attach state)
        service_title = next((s.title for s in self.services if s.key == self.selected_service_key), self.selected_service_key)
        attached_suffix = ""
        if getattr(sp, "externally_managed", False):
            attached_suffix = " – attached"
        self.log_service_label.setText(f"({service_title}{attached_suffix})")

        # Calculate hash of current log buffer to detect changes
        if sp.log_buffer:
            _startup_trace(f"_refresh_console_logs buffer size={len(sp.log_buffer)}")
            if getattr(self, "_startup_tracing", False):
                try:
                    max_line = max((len(str(line)) for line in sp.log_buffer), default=0)
                    _startup_trace(f"_refresh_console_logs max_line_len={max_line}")
                except Exception:
                    pass
            # Efficient hash: use buffer length + hash of last 10 lines
            # This avoids creating a massive tuple every second
            last_lines = sp.log_buffer[-10:] if len(sp.log_buffer) > 10 else sp.log_buffer
            buffer_signature = hash((len(sp.log_buffer), tuple(last_lines)))
        else:
            buffer_signature = hash((sp.running, sp.health_status.value if sp.health_status else None))
        filter_signature = self._console_filter_signature()
        current_hash = (buffer_signature, filter_signature)
        _startup_trace("_refresh_console_logs hash computed")

        # Only update UI if logs changed
        if not force and self.last_log_hash.get(self.selected_service_key) == current_hash:
            _startup_trace("_refresh_console_logs no changes")
            return

        self.last_log_hash[self.selected_service_key] = current_hash

        # Get logs from buffer and update using LogViewWidget
        if sp.log_buffer:
            _startup_trace("_refresh_console_logs applying filter")
            # Apply in-memory filtering based on console filter controls
            filtered_buffer = self._filter_console_buffer(sp.log_buffer)
            _startup_trace(f"_refresh_console_logs filtered size={len(filtered_buffer)}")

            # Format as HTML with syntax highlighting
            enhanced = getattr(self, "console_style_enhanced", True)
            if enhanced:
                log_html = format_console_log_html_enhanced(filtered_buffer)
            else:
                log_html = format_console_log_html_classic(filtered_buffer)
            _startup_trace("_refresh_console_logs formatted html")

            # Use unified LogViewWidget API - handles scroll preservation automatically
            self.log_view.update_content(log_html, force=force)
            _startup_trace("_refresh_console_logs content updated")
        else:
            # No logs - show appropriate message
            if sp.running:
                # Check health status to provide more context
                if sp.health_status == HealthStatus.HEALTHY:
                    msg = (
                        f'<div style="color: #888; padding: 20px;">'
                        f'Service <strong>{service_title}</strong> is running (detected from previous session).'
                        f'<br><br>'
                        f'Note: Console output is only captured automatically when services are started from this launcher.'
                        f'<br>'
                        f'If you started this service externally, click <strong>Attach</strong> to tail its log file.'
                        f'</div>'
                    )
                else:
                    msg = f'<div style="color: #888; padding: 20px;">Service <strong>{service_title}</strong> is starting up...<br>Waiting for output...</div>'
            else:
                msg = f'<div style="color: #888; padding: 20px;">Service <strong>{service_title}</strong> is not running.<br><br>Click <strong>Start</strong> to launch this service.</div>'

            self.log_view.update_content(msg, force=True)

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
                detected_level = detect_console_level(line_str)
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
        # Save filter settings
        if hasattr(self, 'console_level_combo'):
            self.ui_state.console_level_filter = self.console_level_combo.currentText()
        if hasattr(self, 'console_search_input'):
            self.ui_state.console_search_text = self.console_search_input.text()
        save_ui_state(self.ui_state)
        self._refresh_console_logs(force=True)

    def _on_console_style_changed(self, checked: bool):
        """Swap between classic and enhanced console layouts."""
        self.console_style_enhanced = bool(checked)
        self.ui_state.console_style_enhanced = self.console_style_enhanced
        save_ui_state(self.ui_state)
        self._refresh_console_logs(force=True)

    def _clear_console_display(self):
        """Clear the console log display and persisted logs."""
        if self.selected_service_key and self.selected_service_key in self.processes:
            self.processes[self.selected_service_key].clear_logs()
        self.log_view.clear()

    def _on_attach_logs_clicked(self):
        """Attach console view to the selected service's log file.

        This is useful when the service was started outside the launcher
        but is still writing to data/logs/console/{key}.log.
        """
        if not self.selected_service_key or self.selected_service_key not in self.processes:
            return

        sp = self.processes[self.selected_service_key]
        # Not all process adapters may implement attach_logs; guard accordingly.
        attach_fn = getattr(sp, "attach_logs", None)
        if callable(attach_fn):
            attach_fn()
            # Refresh immediately so the label/empty-state messaging updates
            self._refresh_console_logs(force=True)

    def _refresh_db_logs(self):
        try:
            self.db_log_viewer.refresh_logs()
        except Exception:
            pass
        _startup_trace("_refresh_console_logs end")

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

        # Apply window flags if changed
        if old_always_on_top != self.ui_state.window_always_on_top:
            self._apply_window_flags()

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

    def _reload_ui(self):
        """Rebuild UI tabs and refresh settings without restarting launcher."""
        try:
            if hasattr(self, "console_refresh_timer"):
                self.console_refresh_timer.stop()
        except Exception:
            pass

        # Reset panels (keep splitter)
        try:
            if hasattr(self, "main_tabs") and self.main_tabs:
                self.main_tabs.setParent(None)
        except Exception:
            pass
        try:
            if hasattr(self, "right_panel") and self.right_panel:
                self.right_panel.setParent(None)
        except Exception:
            pass
        try:
            if hasattr(self, "left_panel") and self.left_panel:
                self.left_panel.setParent(None)
        except Exception:
            pass

        # Clear widget registry before rebuild
        self.clear_widgets()
        self.cards.clear()

        # Reload state and services
        try:
            self.ui_state = load_ui_state()
        except Exception:
            pass

        try:
            self.services = build_services_with_fallback()
            old_processes = self.processes
            self.processes = {}
            for s in self.services:
                if s.key in old_processes:
                    old_sp = old_processes[s.key]
                    new_sp = ServiceProcess(s)
                    new_sp.running = old_sp.running
                    new_sp.health_status = old_sp.health_status
                    new_sp.detected_pid = old_sp.detected_pid
                    self.processes[s.key] = new_sp
                else:
                    self.processes[s.key] = ServiceProcess(s)
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
            self.console_refresh_timer.start(1000)
        self._notify_ui_reloaded()

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

        # Stop health monitoring
        if hasattr(self, 'facade') and self.facade:
            try:
                self.facade.stop_all_managers()
            except Exception:
                pass
        elif hasattr(self, 'health_worker') and self.health_worker:
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
