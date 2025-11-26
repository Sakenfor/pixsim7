import sys
import webbrowser
import subprocess
import os
import signal
import re
from html import escape
from typing import Dict, Optional
from datetime import datetime
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
    from .services import build_services_with_fallback, ServiceDef
    from .config import (
        service_env, read_env_ports, write_env_ports, Ports,
        check_tool_available, load_ui_state, save_ui_state, UIState, ROOT,
        read_env_file, write_env_file, set_sql_logging
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
    from services import build_services_with_fallback, ServiceDef
    from config import (
        service_env, read_env_ports, write_env_ports, Ports,
        check_tool_available, load_ui_state, save_ui_state, UIState, ROOT,
        read_env_file, write_env_file, set_sql_logging
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
            theme.get_checkbox_stylesheet()
        )
        self.setStyleSheet(combined_styles)

        # Load UI state
        self.ui_state = load_ui_state()
        # Apply SQL logging preference
        set_sql_logging(self.ui_state.sql_logging_enabled)
        if self.ui_state.window_width > 0 and self.ui_state.window_height > 0:
            self.resize(self.ui_state.window_width, self.ui_state.window_height)
        else:
            self.resize(1200, 750)

        if self.ui_state.window_x >= 0 and self.ui_state.window_y >= 0:
            self.move(self.ui_state.window_x, self.ui_state.window_y)

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
            card.force_stop_btn.clicked.connect(lambda checked, k=s.key: self._force_stop_service(k))
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
        console_tab = ConsoleTab.create(self)
        self.main_tabs.addTab(console_tab, "📊 Console")

        # Restore console settings from saved state
        if hasattr(self, 'autoscroll_checkbox'):
            self.autoscroll_checkbox.setChecked(self.ui_state.autoscroll_enabled)
        if hasattr(self, 'console_style_checkbox'):
            self.console_style_checkbox.setChecked(self.ui_state.console_style_enhanced)
        if hasattr(self, 'console_level_combo') and self.ui_state.console_level_filter:
            idx = self.console_level_combo.findText(self.ui_state.console_level_filter)
            if idx >= 0:
                self.console_level_combo.setCurrentIndex(idx)
        if hasattr(self, 'console_search_input') and self.ui_state.console_search_text:
            self.console_search_input.setText(self.ui_state.console_search_text)

        # === TAB 2: DATABASE LOGS ===
        db_logs_tab = DbLogsTab.create(self)
        self.main_tabs.addTab(db_logs_tab, "🗄 Database Logs")

        # === TAB 3: TOOLS ===
        tools_tab = ToolsTab.create(self)
        self.main_tabs.addTab(tools_tab, "🔧 Tools")

        # === TAB 4: SETTINGS ===
        settings_tab = ToolsTab.create_settings(self)
        self.main_tabs.addTab(settings_tab, "⚙ Settings")

        # === TAB 5: BACKEND ARCHITECTURE ===
        architecture_tab = ArchitectureTab.create(self)
        self.main_tabs.addTab(architecture_tab, "🏗️ Architecture")

        # Setup all connections
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
        
        # Console log controls
        self.btn_refresh_logs.clicked.connect(lambda: self._refresh_console_logs(force=True))
        self.btn_clear_logs.clicked.connect(self._clear_console_display)
        self.btn_open_db_logs.clicked.connect(self._open_db_logs_for_current_service)

        # Auto-refresh timer for console
        self.console_refresh_timer = QTimer(self)
        self.console_refresh_timer.timeout.connect(self._refresh_console_logs)
        self.last_log_hash = {}  # Track log buffer hashes to avoid unnecessary UI updates
        self.console_refresh_timer.start(1000)  # Refresh every second

        # Track scroll position changes for current service
        if hasattr(self, 'log_view'):
            self.log_view.verticalScrollBar().valueChanged.connect(self._on_console_scroll)

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
        if key in self.cards:
            self.cards[key].set_selected(True)
            _startup_trace("_select_service card selected")

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
                    _launcher_logger.info("service_started", service_key=key, pid=sp.process.processId() if sp.process else None)
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

        # Update service label
        service_title = next((s.title for s in self.services if s.key == self.selected_service_key), self.selected_service_key)
        self.log_service_label.setText(f"({service_title})")

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
                self.log_view.setHtml(log_html)
                _startup_trace("_refresh_console_logs html applied")

                # Scroll behavior based on auto-scroll setting and user's scroll position
                # CRITICAL: Use QTimer.singleShot to defer scroll restoration until AFTER
                # Qt has finished processing the setHtml() and updated scrollbar maximum
                def restore_scroll():
                    if self.autoscroll_enabled or was_at_bottom:
                        # Auto-scroll to bottom when:
                        # 1. Auto-scroll is explicitly enabled, OR
                        # 2. User was already at the bottom before update
                        cursor = self.log_view.textCursor()
                        cursor.movePosition(QTextCursor.End)
                        self.log_view.setTextCursor(cursor)
                        scrollbar.setValue(scrollbar.maximum())
                        _startup_trace("_refresh_console_logs scrolled to bottom")
                    else:
                        # User was scrolled up - preserve their EXACT scroll position
                        # This prevents jumping when new logs arrive
                        # First check if we have a saved position for this service (from tab switch)
                        if self.selected_service_key in self.service_scroll_positions:
                            saved_pos = self.service_scroll_positions[self.selected_service_key]
                            scrollbar.setValue(saved_pos)
                            _startup_trace(f"_refresh_console_logs restored saved position {saved_pos}")
                        else:
                            # Preserve exact scroll position (don't adjust for new content)
                            scrollbar.setValue(min(old_scroll_value, scrollbar.maximum()))
                            _startup_trace(f"_refresh_console_logs preserved scroll position {old_scroll_value}")

                # Defer scroll restoration until Qt event loop processes the document change
                QTimer.singleShot(0, restore_scroll)
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

    def _open_settings(self):
        updated = show_settings_dialog(self, self.ui_state)
        if updated:
            old_always_on_top = self.ui_state.window_always_on_top
            self.ui_state = updated
            # Apply preferences immediately
            set_sql_logging(self.ui_state.sql_logging_enabled)

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

