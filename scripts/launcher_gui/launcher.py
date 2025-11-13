import sys
import webbrowser
import subprocess
import os
import signal
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
    from .dialogs.migrations_dialog import show_migrations_dialog
    from .dialogs.ports_dialog import show_ports_dialog
    from .dialogs.env_editor_dialog import show_env_editor
    from .database_log_viewer import DatabaseLogViewer
    from .dialogs.settings_dialog import show_settings_dialog
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


# Ports and Env editor dialogs moved to dialogs/* modules


class LauncherWindow(QWidget):
    health_check_signal = Signal(str, HealthStatus)

    def __init__(self):
        super().__init__()
        self.setWindowTitle('PixSim7 Launcher')

        # Set dark theme styling
        self.setStyleSheet("""
            QWidget {
                background-color: #2b2b2b;
                color: #e0e0e0;
            }
            QPushButton {
                background-color: #3d3d3d;
                color: #e0e0e0;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 8px 16px;
                font-weight: bold;
                min-height: 28px;
            }
            QPushButton:hover {
                background-color: #4d4d4d;
                border: 1px solid #666;
            }
            QPushButton:pressed {
                background-color: #2d2d2d;
            }
            QPushButton:disabled {
                background-color: #333;
                color: #666;
                border: 1px solid #444;
            }
            QLineEdit {
                border: 1px solid #555;
                border-radius: 4px;
                padding: 6px;
                background-color: #3d3d3d;
                color: #e0e0e0;
            }
            QLineEdit:focus {
                border: 1px solid #5a9fd4;
            }
            QLabel {
                color: #e0e0e0;
                background-color: transparent;
            }
            QScrollArea {
                background-color: #2b2b2b;
                border: none;
            }
            QFrame {
                background-color: transparent;
            }
        """)

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
        left_layout.setContentsMargins(8, 8, 8, 8)
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
        self.btn_settings.setFixedSize(34, 34)
        self.btn_settings.setToolTip("Launcher Settings")
        self.btn_settings.setStyleSheet("""
            QPushButton {
                background-color: #2196F3;
                color: white;
                border: none;
                border-radius: 17px;
                font-size: 16px;
                padding: 0px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
            QPushButton:pressed {
                background-color: #0D47A1;
            }
        """)
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
        btn_row1.addWidget(self.btn_all)
        btn_row1.addWidget(self.btn_kill_all)
        btn_row1.addWidget(self.btn_restart_all)
        left_layout.addLayout(btn_row1)

        btn_row2 = QHBoxLayout()
        self.btn_ports = QPushButton('⚙ Ports')
        self.btn_ports.setToolTip("Edit service ports")
        self.btn_env = QPushButton('🔧 Environment')
        self.btn_env.setToolTip("Edit environment variables")
        self.btn_db_down = QPushButton('🗄 Stop DBs')
        self.btn_db_down.setToolTip("Stop database containers")
        btn_row2.addWidget(self.btn_ports)
        btn_row2.addWidget(self.btn_env)
        btn_row2.addWidget(self.btn_db_down)
        btn_row2.addStretch()
        left_layout.addLayout(btn_row2)

        btn_row3 = QHBoxLayout()
        self.btn_git_tools = QPushButton('🔀 Git Tools')
        self.btn_git_tools.setToolTip("Structured commit helper")
        self.btn_migrations = QPushButton('🗃 Migrations')
        self.btn_migrations.setToolTip("Database migration manager")
        self.btn_log_management = QPushButton('📋 Log Management')
        self.btn_log_management.setToolTip("Manage, archive, and export console logs")
        btn_row3.addWidget(self.btn_git_tools)
        btn_row3.addWidget(self.btn_migrations)
        btn_row3.addWidget(self.btn_log_management)
        btn_row3.addStretch()
        left_layout.addLayout(btn_row3)

        # Status bar with dark theme
        self.status_label = QLabel('Ports: loading...')
        self.status_label.setStyleSheet("""
            QLabel {
                background-color: #1e1e1e;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 6px 10px;
                font-size: 9pt;
                font-weight: 500;
                color: #a0a0a0;
            }
        """)
        left_layout.addWidget(self.status_label)

        # Right panel: log tabs
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(8, 8, 8, 8)
        splitter.addWidget(right)

        # Create tab widget with dark theme
        self.log_tabs = QTabWidget()
        self.log_tabs.setStyleSheet("""
            QTabWidget::pane {
                border: 1px solid #555;
                border-radius: 4px;
                background: #2b2b2b;
            }
            QTabBar::tab {
                background: #3d3d3d;
                color: #e0e0e0;
                padding: 8px 16px;
                margin-right: 2px;
                border-top-left-radius: 4px;
                border-top-right-radius: 4px;
                font-weight: 500;
                border: 1px solid #555;
                border-bottom: none;
            }
            QTabBar::tab:selected {
                background: #5a9fd4;
                color: #ffffff;
            }
            QTabBar::tab:hover {
                background: #4d4d4d;
            }
            QTabBar::tab:selected:hover {
                background: #4a8fc4;
            }
        """)

        # Service Console tab - shows live stdout/stderr from selected service
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
        console_header_layout.addStretch()
        console_layout.addLayout(console_header_layout)

        # Use QTextBrowser for clickable URLs
        from PySide6.QtWidgets import QTextBrowser
        self.log_view = QTextBrowser()
        self.log_view.setReadOnly(True)
        self.log_view.setOpenExternalLinks(True)  # Open URLs in browser
        self.log_view.setStyleSheet("""
            QTextBrowser {
                background-color: #1e1e1e;
                color: #d4d4d4;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 9pt;
                border: 1px solid #555;
                border-radius: 4px;
            }
        """)
        console_layout.addWidget(self.log_view)

        log_btn_row = QHBoxLayout()
        self.btn_refresh_logs = QPushButton('🔄 Refresh')
        self.btn_refresh_logs.setToolTip("Refresh console logs (F5)")
        self.btn_clear_logs = QPushButton('🗑 Clear All')
        self.btn_clear_logs.setToolTip("Clear console logs and persisted file (Ctrl+L)")
        self.autoscroll_checkbox = QCheckBox('Auto-scroll')
        self.autoscroll_checkbox.setChecked(True)
        self.autoscroll_checkbox.setToolTip("Automatically scroll to bottom when new logs arrive")
        self.autoscroll_checkbox.stateChanged.connect(self._on_autoscroll_changed)
        log_btn_row.addWidget(self.btn_refresh_logs)
        log_btn_row.addWidget(self.btn_clear_logs)
        log_btn_row.addWidget(self.autoscroll_checkbox)
        log_btn_row.addStretch()
        console_layout.addLayout(log_btn_row)

        # Add keyboard shortcuts for console
        self.console_refresh_shortcut = QShortcut(QKeySequence('F5'), console_tab)
        self.console_refresh_shortcut.activated.connect(self._refresh_console_logs)
        self.console_clear_shortcut = QShortcut(QKeySequence('Ctrl+L'), console_tab)
        self.console_clear_shortcut.activated.connect(self._clear_console_display)

        # Add console tab first
        self.log_tabs.addTab(console_tab, "Console")

        # Add database logs tab as secondary source (pixsim_logging-backed)
        from .config import read_env_ports
        p = read_env_ports()
        self.db_log_viewer = DatabaseLogViewer(api_url=f"http://localhost:{p.backend}")
        self.log_tabs.addTab(self.db_log_viewer, "Database Logs")

        # Add tabs to right layout
        right_layout.addWidget(self.log_tabs)

        # Connections
        self.btn_all.clicked.connect(self.start_all)
        self.btn_kill_all.clicked.connect(self._stop_all_with_confirmation)
        self.btn_restart_all.clicked.connect(self._restart_all)
        self.btn_ports.clicked.connect(self.edit_ports)
        self.btn_env.clicked.connect(self.edit_env)
        self.btn_db_down.clicked.connect(self.stop_databases)
        # Console log refresh
        self.btn_refresh_logs.clicked.connect(self._refresh_console_logs)
        self.btn_clear_logs.clicked.connect(self._clear_console_display)
        self.btn_git_tools.clicked.connect(lambda: show_git_tools_dialog(self))
        self.btn_migrations.clicked.connect(lambda: show_migrations_dialog(self))
        self.btn_log_management.clicked.connect(lambda: show_log_management_dialog(self, self.processes))
        self.btn_settings.clicked.connect(self._open_settings)

        # Auto-refresh timer for console
        self.console_refresh_timer = QTimer(self)
        self.console_refresh_timer.timeout.connect(self._refresh_console_logs)
        self.last_log_hash = {}  # Track log buffer hashes to avoid unnecessary UI updates
        self.console_refresh_timer.start(1000)  # Refresh every second

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
        for key, sp in self.processes.items():
            if not sp.tool_available:
                if _launcher_logger:
                    try:
                        _launcher_logger.info("service_skip_start", service_key=key, reason=sp.tool_check_message)
                    except Exception:
                        pass
                continue
            sp.start()
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
        import re
        html_lines = ['<pre style="margin: 0; padding: 0; line-height: 1.4;">']

        for line in log_lines:
            # Parse timestamp and tag
            timestamp_match = re.match(r'\[(\d{2}:\d{2}:\d{2})\] \[(OUT|ERR)\] (.+)', line)
            if timestamp_match:
                time, tag, content = timestamp_match.groups()

                # Color code the tag
                tag_color = '#f44336' if tag == 'ERR' else '#4CAF50'

                # Make URLs clickable
                content = re.sub(
                    r'(https?://[^\s]+)',
                    r'<a href="\1" style="color: #64B5F6; text-decoration: underline;">\1</a>',
                    content
                )

                # Highlight special keywords
                content = re.sub(r'\b(VITE|ready|Local|Network|running|started|listening)\b',
                                r'<span style="color: #81C784; font-weight: bold;">\1</span>', content)
                content = re.sub(r'\b(ERROR|error|failed|Error|FAILED)\b',
                                r'<span style="color: #EF5350; font-weight: bold;">\1</span>', content)
                content = re.sub(r'\b(WARNING|warning|WARN|warn)\b',
                                r'<span style="color: #FFB74D; font-weight: bold;">\1</span>', content)

                # Format line with muted timestamp
                html_lines.append(
                    f'<span style="color: #666;">[{time}]</span> '
                    f'<span style="color: {tag_color}; font-weight: bold;">[{tag}]</span> '
                    f'{content}'
                )
            else:
                # Line without timestamp (shouldn't happen, but handle it)
                html_lines.append(line)

        html_lines.append('</pre>')
        return '\n'.join(html_lines)

    def _refresh_console_logs(self):
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
        current_hash = hash(tuple(sp.log_buffer)) if sp.log_buffer else hash((sp.running, sp.health_status.value if sp.health_status else None))

        # Only update UI if logs changed
        if self.last_log_hash.get(self.selected_service_key) == current_hash:
            return

        self.last_log_hash[self.selected_service_key] = current_hash

        # Block signals during update to prevent UI flickering
        self.log_view.blockSignals(True)
        try:
            # Save current scroll position before updating
            scrollbar = self.log_view.verticalScrollBar()
            old_scroll_value = scrollbar.value()
            old_scroll_max = scrollbar.maximum()
            was_at_bottom = (old_scroll_value >= old_scroll_max - 10) if old_scroll_max > 0 else True

            # Get logs from buffer
            if sp.log_buffer:
                # Format as HTML with syntax highlighting
                log_html = self._format_console_log_html(sp.log_buffer)
                self.log_view.setHtml(log_html)

                # Scroll behavior based on auto-scroll setting
                if self.autoscroll_enabled or was_at_bottom:
                    # Auto-scroll to bottom if enabled or user was already at bottom
                    cursor = self.log_view.textCursor()
                    cursor.movePosition(QTextCursor.End)
                    self.log_view.setTextCursor(cursor)
                    scrollbar.setValue(scrollbar.maximum())
                else:
                    # Restore previous scroll position
                    # Try to maintain relative position if content changed
                    new_max = scrollbar.maximum()
                    if old_scroll_max > 0 and new_max > 0:
                        # Maintain relative position
                        relative_pos = old_scroll_value / old_scroll_max
                        new_value = int(relative_pos * new_max)
                        scrollbar.setValue(new_value)
                    else:
                        scrollbar.setValue(old_scroll_value)
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
