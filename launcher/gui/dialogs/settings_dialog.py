import os
import socket
import shutil
import subprocess
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox, QPushButton,
    QGroupBox, QSpinBox, QDoubleSpinBox, QComboBox, QTabWidget, QWidget,
    QLineEdit, QFormLayout
)
from PySide6.QtCore import Qt

try:
    from ..config import (
        UIState,
        save_ui_state,
        read_env_file,
        write_env_file,
        read_env_ports,
        write_env_ports,
    )
    from .. import theme
    from ..dialogs.ports_dialog import show_ports_dialog
    from ..dialogs.env_editor_dialog import show_env_editor
except Exception:
    from config import (
        UIState,
        save_ui_state,
        read_env_file,
        write_env_file,
        read_env_ports,
        write_env_ports,
    )
    import theme
    from dialogs.ports_dialog import show_ports_dialog
    from dialogs.env_editor_dialog import show_env_editor


def show_settings_dialog(parent, ui_state: UIState) -> UIState | None:
    dlg = SettingsDialog(ui_state, parent)
    if dlg.exec():
        return dlg.get_state()
    return None


class SettingsDialog(QDialog):
    def __init__(self, ui_state: UIState, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Launcher Settings")
        self.setModal(True)
        self._state = ui_state
        self._env_vars = read_env_file()
        self.setMinimumWidth(550)
        self.setMinimumHeight(500)
        # Use centralized dark theme
        self.setStyleSheet(theme.get_dialog_stylesheet() + theme.get_scrollbar_stylesheet())
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Header
        header = QLabel("⚙️ Launcher Settings")
        header.setStyleSheet(f"color: {theme.TEXT_PRIMARY}; font-size: 16pt; font-weight: bold; margin-bottom: 8px;")
        layout.addWidget(header)

        # Tabs for better organization
        tabs = QTabWidget()

        # General Tab
        general_tab = self._create_general_tab()
        tabs.addTab(general_tab, "General")

        # Performance Tab
        performance_tab = self._create_performance_tab()
        tabs.addTab(performance_tab, "Performance")

        # Network Tab
        network_tab = self._create_network_tab()
        tabs.addTab(network_tab, "Network")

        layout.addWidget(tabs)

        # Info label
        info_label = QLabel("💾 Settings are saved automatically to launcher.json")
        info_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; font-style: italic; margin-top: 8px;")
        layout.addWidget(info_label)

        # Buttons
        btn_row = QHBoxLayout()
        btn_row.addStretch()

        self.btn_reset = QPushButton("Reset to Defaults")
        self.btn_reset.setObjectName("cancelButton")
        self.btn_reset.clicked.connect(self._reset_to_defaults)
        btn_row.addWidget(self.btn_reset)

        btn_cancel = QPushButton("Cancel")
        btn_cancel.setObjectName("cancelButton")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_save = QPushButton("💾 Save")
        btn_save.clicked.connect(self.accept)
        btn_row.addWidget(btn_save)

        layout.addLayout(btn_row)

    def _create_general_tab(self) -> QWidget:
        """Create general settings tab."""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # Window Group
        window_group = QGroupBox("Window")
        window_layout = QVBoxLayout(window_group)
        window_layout.setSpacing(12)

        self.chk_always_on_top = QCheckBox("Always on top")
        self.chk_always_on_top.setChecked(self._state.window_always_on_top)
        self.chk_always_on_top.setToolTip("Keep the launcher window on top of other windows")
        window_layout.addWidget(self.chk_always_on_top)

        layout.addWidget(window_group)

        # Behavior Group
        behavior_group = QGroupBox("Behavior")
        behavior_layout = QVBoxLayout(behavior_group)
        behavior_layout.setSpacing(12)

        self.chk_stop_on_exit = QCheckBox("Stop all services when closing launcher")
        self.chk_stop_on_exit.setChecked(self._state.stop_services_on_exit)
        self.chk_stop_on_exit.setToolTip("Automatically stop all running services when you close the launcher")
        behavior_layout.addWidget(self.chk_stop_on_exit)

        layout.addWidget(behavior_group)

        # Logging Group
        logging_group = QGroupBox("Logging")
        logging_layout = QVBoxLayout(logging_group)
        logging_layout.setSpacing(12)

        self.chk_auto_refresh_logs = QCheckBox("Enable log auto-refresh by default")
        self.chk_auto_refresh_logs.setChecked(self._state.auto_refresh_logs)
        self.chk_auto_refresh_logs.setToolTip("Automatically refresh database logs when viewing them (may impact performance)")
        logging_layout.addWidget(self.chk_auto_refresh_logs)

        self.chk_sql_logging = QCheckBox("Enable SQL query logging (verbose)")
        self.chk_sql_logging.setChecked(self._state.sql_logging_enabled)
        self.chk_sql_logging.setToolTip("Log all database queries from backend services (very verbose, requires service restart)")
        logging_layout.addWidget(self.chk_sql_logging)

        self.chk_worker_debug = QCheckBox("Enable worker debug (generation/provider/worker)")
        self.chk_worker_debug.setChecked(bool(self._state.worker_debug_flags))
        self.chk_worker_debug.setToolTip("Enable verbose worker debug logs. Categories are configured globally via PIXSIM_WORKER_DEBUG.")
        logging_layout.addWidget(self.chk_worker_debug)

        self.chk_backend_debug = QCheckBox("Enable backend DEBUG logging (API + workers)")
        self.chk_backend_debug.setChecked(self._state.backend_debug_enabled)
        self.chk_backend_debug.setToolTip("When enabled, services run with LOG_LEVEL=DEBUG for full backend and WebSocket diagnostics.")
        logging_layout.addWidget(self.chk_backend_debug)

        layout.addWidget(logging_group)

        layout.addStretch()
        return tab

    def _create_network_tab(self) -> QWidget:
        """Create base URL/HTTPS settings tab."""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        urls_group = QGroupBox("Base URLs (optional)")
        urls_layout = QFormLayout(urls_group)
        urls_layout.setSpacing(8)
        urls_layout.setFieldGrowthPolicy(QFormLayout.ExpandingFieldsGrow)

        self.chk_use_local_datastores = QCheckBox("Use local Postgres/Redis (skip Docker DB service)")
        self.chk_use_local_datastores.setChecked(self._state.use_local_datastores)
        urls_layout.addRow(self.chk_use_local_datastores)

        button_row = QHBoxLayout()
        btn_ports = QPushButton("Edit Ports")
        btn_ports.clicked.connect(self._open_ports_editor)
        button_row.addWidget(btn_ports)
        btn_env = QPushButton("Edit Environment Variables")
        btn_env.clicked.connect(self._open_env_editor)
        button_row.addWidget(btn_env)
        button_row.addStretch()
        urls_layout.addRow(button_row)

        self.input_local_db_url = QLineEdit()
        self.input_local_db_url.setPlaceholderText("postgresql://pixsim:pixsim123@127.0.0.1:5432/pixsim7")
        self.input_local_db_url.setText(self._env_vars.get("LOCAL_DATABASE_URL", ""))
        urls_layout.addRow("Local DATABASE_URL:", self.input_local_db_url)

        self.input_local_redis_url = QLineEdit()
        self.input_local_redis_url.setPlaceholderText("redis://localhost:6379/0")
        self.input_local_redis_url.setText(self._env_vars.get("LOCAL_REDIS_URL", ""))
        urls_layout.addRow("Local REDIS_URL:", self.input_local_redis_url)

        self.input_backend_base = QLineEdit()
        self.input_backend_base.setPlaceholderText("https://api.pixsim7.local")
        self.input_backend_base.setText(self._env_vars.get("BACKEND_BASE_URL", ""))
        urls_layout.addRow("Backend:", self.input_backend_base)

        self.input_generation_base = QLineEdit()
        self.input_generation_base.setPlaceholderText("https://gen.pixsim7.local")
        self.input_generation_base.setText(self._env_vars.get("GENERATION_BASE_URL", ""))
        urls_layout.addRow("Generation API:", self.input_generation_base)

        self.input_frontend_base = QLineEdit()
        self.input_frontend_base.setPlaceholderText("https://app.pixsim7.local")
        self.input_frontend_base.setText(self._env_vars.get("FRONTEND_BASE_URL", ""))
        urls_layout.addRow("Frontend:", self.input_frontend_base)

        self.input_admin_base = QLineEdit()
        self.input_admin_base.setPlaceholderText("https://admin.pixsim7.local")
        self.input_admin_base.setText(self._env_vars.get("ADMIN_BASE_URL", ""))
        urls_layout.addRow("Admin:", self.input_admin_base)

        self.input_game_base = QLineEdit()
        self.input_game_base.setPlaceholderText("https://game.pixsim7.local")
        self.input_game_base.setText(self._env_vars.get("GAME_FRONTEND_BASE_URL", ""))
        urls_layout.addRow("Game Frontend:", self.input_game_base)

        self.input_launcher_base = QLineEdit()
        self.input_launcher_base.setPlaceholderText("https://launcher.pixsim7.local")
        self.input_launcher_base.setText(self._env_vars.get("LAUNCHER_BASE_URL", ""))
        urls_layout.addRow("Launcher API:", self.input_launcher_base)

        layout.addWidget(urls_group)

        tools_row = QHBoxLayout()
        tools_row.addStretch()
        btn_detect_local = QPushButton("Detect local DB/Redis")
        btn_detect_local.clicked.connect(self._detect_local_datastores)
        tools_row.addWidget(btn_detect_local)
        btn_fill = QPushButton("Use pixsim7.local defaults")
        btn_fill.clicked.connect(self._fill_pixsim7_defaults)
        tools_row.addWidget(btn_fill)
        layout.addLayout(tools_row)

        note = QLabel(
            "Leave a field blank to use http://localhost:<port>. "
            "Local DB URLs are applied when the local toggle is enabled. "
            "Changes take effect after restarting services."
        )
        note.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-top: 6px;")
        note.setWordWrap(True)
        layout.addWidget(note)

        layout.addStretch()
        return tab

    def _fill_pixsim7_defaults(self):
        self.input_backend_base.setText("https://api.pixsim7.local")
        self.input_generation_base.setText("https://gen.pixsim7.local")
        self.input_frontend_base.setText("https://app.pixsim7.local")
        self.input_admin_base.setText("https://admin.pixsim7.local")
        self.input_game_base.setText("https://game.pixsim7.local")
        self.input_launcher_base.setText("https://launcher.pixsim7.local")

    def _open_ports_editor(self):
        parent = self.parent()
        if parent and hasattr(parent, "edit_ports"):
            parent.edit_ports()
        else:
            current = read_env_ports()
            result = show_ports_dialog(self, current)
            if result is not None:
                try:
                    write_env_ports(result)
                except Exception:
                    pass
        self._reload_env_fields()

    def _open_env_editor(self):
        parent = self.parent()
        if parent and hasattr(parent, "edit_env"):
            parent.edit_env()
        else:
            data = show_env_editor(self)
            if data is not None:
                try:
                    write_env_file(data)
                except Exception:
                    pass
        self._reload_env_fields()

    def _reload_env_fields(self):
        self._env_vars = read_env_file()
        self.input_local_db_url.setText(self._env_vars.get("LOCAL_DATABASE_URL", ""))
        self.input_local_redis_url.setText(self._env_vars.get("LOCAL_REDIS_URL", ""))
        self.input_backend_base.setText(self._env_vars.get("BACKEND_BASE_URL", ""))
        self.input_generation_base.setText(self._env_vars.get("GENERATION_BASE_URL", ""))
        self.input_frontend_base.setText(self._env_vars.get("FRONTEND_BASE_URL", ""))
        self.input_admin_base.setText(self._env_vars.get("ADMIN_BASE_URL", ""))
        self.input_game_base.setText(self._env_vars.get("GAME_FRONTEND_BASE_URL", ""))
        self.input_launcher_base.setText(self._env_vars.get("LAUNCHER_BASE_URL", ""))

    def _detect_local_datastores(self):
        """Detect local Postgres/Redis ports and fill URLs."""
        from PySide6.QtWidgets import QMessageBox

        pg_ports = [5432, 5433, 5434, 5435]
        redis_ports = [6379, 6380]

        pg_port = self._find_open_port(pg_ports)
        redis_port = self._find_open_port(redis_ports)

        if pg_port:
            current_db = self.input_local_db_url.text().strip()
            if not current_db:
                self.input_local_db_url.setText(
                    f"postgresql://pixsim:pixsim123@127.0.0.1:{pg_port}/pixsim7"
                )
        if redis_port:
            current_redis = self.input_local_redis_url.text().strip()
            if not current_redis:
                self.input_local_redis_url.setText(
                    f"redis://localhost:{redis_port}/0"
                )

        versions = self._get_local_versions()
        details = []
        if pg_port:
            details.append(f"Postgres port: {pg_port}")
        else:
            details.append("Postgres port: not detected")
        if redis_port:
            details.append(f"Redis port: {redis_port}")
        else:
            details.append("Redis port: not detected")
        if versions:
            details.append(versions)

        QMessageBox.information(
            self,
            "Local Datastores",
            "Detection complete:\n" + "\n".join(details)
        )

    def _find_open_port(self, ports):
        for port in ports:
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    return port
            except OSError:
                continue
        return None

    def _get_local_versions(self) -> str:
        pg_version = None
        redis_version = None

        if shutil.which("psql"):
            try:
                result = subprocess.run(
                    ["psql", "--version"],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if result.returncode == 0:
                    pg_version = result.stdout.strip()
            except Exception:
                pass

        if shutil.which("redis-server"):
            try:
                result = subprocess.run(
                    ["redis-server", "--version"],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if result.returncode == 0:
                    redis_version = result.stdout.strip()
            except Exception:
                pass

        parts = []
        if pg_version:
            parts.append(pg_version)
        if redis_version:
            parts.append(redis_version)
        return " | ".join(parts)

    def _create_performance_tab(self) -> QWidget:
        """Create performance/health check settings tab."""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # Health Check Group
        health_group = QGroupBox("Health Check Intervals")
        health_layout = QVBoxLayout(health_group)
        health_layout.setSpacing(12)

        # Adaptive mode
        self.chk_adaptive_health = QCheckBox("Enable adaptive health checking")
        self.chk_adaptive_health.setChecked(self._state.health_check_adaptive)
        self.chk_adaptive_health.setToolTip(
            "Automatically adjust check frequency:\n"
            "• Fast checks (2s) during service startup\n"
            "• Normal checks (5s) during activity\n"
            "• Slow checks (10s) when all services are stable"
        )
        self.chk_adaptive_health.toggled.connect(self._on_adaptive_toggled)
        health_layout.addWidget(self.chk_adaptive_health)

        # Base interval
        base_row = QHBoxLayout()
        base_row.addWidget(QLabel("Base interval:"))
        self.spin_health_interval = QDoubleSpinBox()
        self.spin_health_interval.setRange(1.0, 60.0)
        self.spin_health_interval.setSingleStep(1.0)
        self.spin_health_interval.setSuffix(" seconds")
        self.spin_health_interval.setValue(self._state.health_check_interval)
        self.spin_health_interval.setToolTip("How often to check service health (default: 5s)")
        base_row.addWidget(self.spin_health_interval)
        base_row.addStretch()
        health_layout.addLayout(base_row)

        # Startup interval (only visible if adaptive)
        self.startup_row = QHBoxLayout()
        self.startup_row.addWidget(QLabel("  └ Startup interval:"))
        self.spin_startup_interval = QDoubleSpinBox()
        self.spin_startup_interval.setRange(0.5, 10.0)
        self.spin_startup_interval.setSingleStep(0.5)
        self.spin_startup_interval.setSuffix(" seconds")
        self.spin_startup_interval.setValue(self._state.health_check_startup_interval)
        self.spin_startup_interval.setToolTip("Fast checks during service startup (default: 2s)")
        self.startup_row.addWidget(self.spin_startup_interval)
        self.startup_row.addStretch()
        health_layout.addLayout(self.startup_row)

        # Stable interval (only visible if adaptive)
        self.stable_row = QHBoxLayout()
        self.stable_row.addWidget(QLabel("  └ Stable interval:"))
        self.spin_stable_interval = QDoubleSpinBox()
        self.spin_stable_interval.setRange(5.0, 120.0)
        self.spin_stable_interval.setSingleStep(5.0)
        self.spin_stable_interval.setSuffix(" seconds")
        self.spin_stable_interval.setValue(self._state.health_check_stable_interval)
        self.spin_stable_interval.setToolTip("Slow checks when all services are stable (default: 10s)")
        self.stable_row.addWidget(self.spin_stable_interval)
        self.stable_row.addStretch()
        health_layout.addLayout(self.stable_row)

        # Info label
        info = QLabel(
            "💡 Tip: Lower intervals = more responsive UI but higher CPU usage.\n"
            "   Recommended: Enable adaptive mode for best balance."
        )
        info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-top: 8px;")
        info.setWordWrap(True)
        health_layout.addWidget(info)

        layout.addWidget(health_group)

        # Update visibility
        self._on_adaptive_toggled(self._state.health_check_adaptive)

        layout.addStretch()
        return tab

    def get_state(self) -> UIState:
        """Return updated UI state from dialog controls."""
        # General / window
        self._state.window_always_on_top = self.chk_always_on_top.isChecked()
        self._state.stop_services_on_exit = self.chk_stop_on_exit.isChecked()

        # Logging
        self._state.auto_refresh_logs = self.chk_auto_refresh_logs.isChecked()
        self._state.sql_logging_enabled = self.chk_sql_logging.isChecked()
        # Simple toggle: when enabled, default to all worker debug categories
        if hasattr(self, "chk_worker_debug") and self.chk_worker_debug.isChecked():
            if not self._state.worker_debug_flags:
                self._state.worker_debug_flags = "generation,provider,worker"
        else:
            self._state.worker_debug_flags = ""
        if hasattr(self, "chk_backend_debug"):
            self._state.backend_debug_enabled = self.chk_backend_debug.isChecked()

        # Performance / health check
        self._state.health_check_adaptive = self.chk_adaptive_health.isChecked()
        self._state.health_check_interval = float(self.spin_health_interval.value())
        self._state.health_check_startup_interval = float(self.spin_startup_interval.value())
        self._state.health_check_stable_interval = float(self.spin_stable_interval.value())

        if hasattr(self, "chk_use_local_datastores"):
            self._state.use_local_datastores = self.chk_use_local_datastores.isChecked()

        env_updates = {
            "BACKEND_BASE_URL": self.input_backend_base.text().strip(),
            "GENERATION_BASE_URL": self.input_generation_base.text().strip(),
            "FRONTEND_BASE_URL": self.input_frontend_base.text().strip(),
            "ADMIN_BASE_URL": self.input_admin_base.text().strip(),
            "GAME_FRONTEND_BASE_URL": self.input_game_base.text().strip(),
            "LAUNCHER_BASE_URL": self.input_launcher_base.text().strip(),
            "USE_LOCAL_DATASTORES": "1" if self._state.use_local_datastores else "0",
            "LOCAL_DATABASE_URL": self.input_local_db_url.text().strip(),
            "LOCAL_REDIS_URL": self.input_local_redis_url.text().strip(),
        }
        if self._state.use_local_datastores:
            current_db = self._env_vars.get("DATABASE_URL", "")
            current_redis = self._env_vars.get("REDIS_URL", "")
            if current_db:
                env_updates.setdefault("DOCKER_DATABASE_URL", current_db)
            if current_redis:
                env_updates.setdefault("DOCKER_REDIS_URL", current_redis)
            if env_updates["LOCAL_DATABASE_URL"]:
                env_updates["DATABASE_URL"] = env_updates["LOCAL_DATABASE_URL"]
            if env_updates["LOCAL_REDIS_URL"]:
                env_updates["REDIS_URL"] = env_updates["LOCAL_REDIS_URL"]
        else:
            docker_db = self._env_vars.get("DOCKER_DATABASE_URL")
            docker_redis = self._env_vars.get("DOCKER_REDIS_URL")
            if docker_db:
                env_updates["DATABASE_URL"] = docker_db
            if docker_redis:
                env_updates["REDIS_URL"] = docker_redis
        try:
            write_env_file(env_updates)
        except Exception:
            pass
        for key, value in env_updates.items():
            if value:
                os.environ[key] = value
            elif key in os.environ:
                del os.environ[key]

        save_ui_state(self._state)
        return self._state

    def _on_adaptive_toggled(self, checked: bool):
        """Show/hide adaptive interval options."""
        # Show adaptive options only when adaptive mode is enabled
        for i in range(self.startup_row.count()):
            widget = self.startup_row.itemAt(i).widget()
            if widget:
                widget.setVisible(checked)

        for i in range(self.stable_row.count()):
            widget = self.stable_row.itemAt(i).widget()
            if widget:
                widget.setVisible(checked)

    def _reset_to_defaults(self):
        """Reset all settings to defaults."""
        from PySide6.QtWidgets import QMessageBox

        reply = QMessageBox.question(
            self,
            'Reset to Defaults',
            'Reset all settings to their default values?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )

        if reply == QMessageBox.Yes:
            defaults = UIState()
            self.chk_always_on_top.setChecked(defaults.window_always_on_top)
            self.chk_stop_on_exit.setChecked(defaults.stop_services_on_exit)
            self.chk_auto_refresh_logs.setChecked(defaults.auto_refresh_logs)
            self.chk_sql_logging.setChecked(defaults.sql_logging_enabled)
            self.chk_adaptive_health.setChecked(defaults.health_check_adaptive)
            self.spin_health_interval.setValue(defaults.health_check_interval)
            self.spin_startup_interval.setValue(defaults.health_check_startup_interval)
            self.spin_stable_interval.setValue(defaults.health_check_stable_interval)
            if hasattr(self, "chk_worker_debug"):
                self.chk_worker_debug.setChecked(bool(defaults.worker_debug_flags))
            if hasattr(self, "chk_backend_debug"):
                self.chk_backend_debug.setChecked(defaults.backend_debug_enabled)
            if hasattr(self, "input_backend_base"):
                self.input_backend_base.setText("")
            if hasattr(self, "input_generation_base"):
                self.input_generation_base.setText("")
            if hasattr(self, "input_frontend_base"):
                self.input_frontend_base.setText("")
            if hasattr(self, "input_admin_base"):
                self.input_admin_base.setText("")
            if hasattr(self, "input_game_base"):
                self.input_game_base.setText("")
            if hasattr(self, "input_launcher_base"):
                self.input_launcher_base.setText("")
            if hasattr(self, "chk_use_local_datastores"):
                self.chk_use_local_datastores.setChecked(defaults.use_local_datastores)
            if hasattr(self, "input_local_db_url"):
                self.input_local_db_url.setText("")
            if hasattr(self, "input_local_redis_url"):
                self.input_local_redis_url.setText("")
