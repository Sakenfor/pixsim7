import os
import socket
import shutil
import subprocess
import json
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox, QPushButton,
    QGroupBox, QSpinBox, QDoubleSpinBox, QComboBox,
    QLineEdit, QFormLayout, QListWidget, QStackedWidget, QTabWidget
)
from PySide6.QtCore import Qt

try:
    from ..config import (
        UIState,
        Ports,
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
        Ports,
        save_ui_state,
        read_env_file,
        write_env_file,
        read_env_ports,
        write_env_ports,
    )
    import theme
    from dialogs.ports_dialog import show_ports_dialog
    from dialogs.env_editor_dialog import show_env_editor


class SettingsPanel(QWidget):
    def __init__(self, ui_state: UIState, on_saved=None, parent=None):
        super().__init__(parent)
        self._state = ui_state
        self._env_vars = read_env_file()
        self._profiles = self._load_profiles()
        self._on_saved = on_saved
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        content_row = QHBoxLayout()
        self.sidebar = QListWidget()
        self.sidebar.addItems(["General", "Network", "Performance"])
        self.sidebar.setFixedWidth(160)
        self.sidebar.setCurrentRow(0)
        content_row.addWidget(self.sidebar)

        self.stack = QStackedWidget()
        self.stack.addWidget(self._create_general_tab())
        self.stack.addWidget(self._create_network_tab())
        self.stack.addWidget(self._create_performance_tab())
        content_row.addWidget(self.stack, 1)

        self.sidebar.currentRowChanged.connect(self.stack.setCurrentIndex)
        layout.addLayout(content_row)

        info_label = QLabel("Settings are saved automatically to launcher.json")
        info_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; font-style: italic; margin-top: 8px;")
        layout.addWidget(info_label)

        btn_row = QHBoxLayout()
        btn_row.addStretch()

        self.btn_reset = QPushButton("Reset to Defaults")
        self.btn_reset.setObjectName("cancelButton")
        self.btn_reset.clicked.connect(self._reset_to_defaults)
        btn_row.addWidget(self.btn_reset)

        btn_save = QPushButton("Save")
        btn_save.clicked.connect(self._save_settings)
        btn_row.addWidget(btn_save)

        layout.addLayout(btn_row)

    def _create_general_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        window_group = QGroupBox("Window")
        window_layout = QVBoxLayout(window_group)
        window_layout.setSpacing(12)

        self.chk_always_on_top = QCheckBox("Always on top")
        self.chk_always_on_top.setChecked(self._state.window_always_on_top)
        self.chk_always_on_top.setToolTip("Keep the launcher window on top of other windows")
        window_layout.addWidget(self.chk_always_on_top)

        layout.addWidget(window_group)

        behavior_group = QGroupBox("Behavior")
        behavior_layout = QVBoxLayout(behavior_group)
        behavior_layout.setSpacing(12)

        self.chk_stop_on_exit = QCheckBox("Stop all services when closing launcher")
        self.chk_stop_on_exit.setChecked(self._state.stop_services_on_exit)
        self.chk_stop_on_exit.setToolTip("Automatically stop all running services when you close the launcher")
        behavior_layout.addWidget(self.chk_stop_on_exit)

        layout.addWidget(behavior_group)

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
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        profile_group = QGroupBox("Profile")
        profile_layout = QHBoxLayout(profile_group)
        profile_layout.setContentsMargins(12, 8, 12, 8)
        profile_layout.addWidget(QLabel("Active profile:"))
        self.profile_combo = QComboBox()
        self._profile_keys = list(self._profiles.keys())
        for key in self._profile_keys:
            label = self._profiles[key].get("label", key)
            self.profile_combo.addItem(label, key)
        self.profile_combo.setCurrentIndex(self._get_profile_index())
        profile_layout.addWidget(self.profile_combo)
        btn_apply_profile = QPushButton("Apply Profile")
        btn_apply_profile.clicked.connect(self._apply_selected_profile)
        profile_layout.addWidget(btn_apply_profile)
        profile_layout.addStretch()
        layout.addWidget(profile_group)

        tabs = QTabWidget()
        tabs.addTab(self._create_network_endpoints_page(), "Endpoints")
        tabs.addTab(self._create_network_local_page(), "Local Datastores")
        tabs.addTab(self._create_network_env_page(), "Environment")
        layout.addWidget(tabs)
        return tab

    def _create_network_endpoints_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        ports = read_env_ports()

        endpoints_group = QGroupBox("Ports and Base URLs")
        endpoints_layout = QFormLayout(endpoints_group)
        endpoints_layout.setSpacing(8)
        endpoints_layout.setFieldGrowthPolicy(QFormLayout.ExpandingFieldsGrow)

        self.spin_backend_port = QSpinBox()
        self.spin_backend_port.setRange(1, 65535)
        self.spin_backend_port.setValue(ports.backend)
        endpoints_layout.addRow("Backend Port:", self.spin_backend_port)

        self.spin_admin_port = QSpinBox()
        self.spin_admin_port.setRange(1, 65535)
        self.spin_admin_port.setValue(ports.admin)
        endpoints_layout.addRow("Admin Port:", self.spin_admin_port)

        self.spin_frontend_port = QSpinBox()
        self.spin_frontend_port.setRange(1, 65535)
        self.spin_frontend_port.setValue(ports.frontend)
        endpoints_layout.addRow("Frontend Port:", self.spin_frontend_port)

        self.spin_game_frontend_port = QSpinBox()
        self.spin_game_frontend_port.setRange(1, 65535)
        self.spin_game_frontend_port.setValue(ports.game_frontend)
        endpoints_layout.addRow("Game Frontend Port:", self.spin_game_frontend_port)

        self.spin_game_service_port = QSpinBox()
        self.spin_game_service_port.setRange(1, 65535)
        self.spin_game_service_port.setValue(ports.game_service)
        endpoints_layout.addRow("Game Service Port:", self.spin_game_service_port)

        self.input_backend_base = QLineEdit()
        self.input_backend_base.setPlaceholderText("https://api.pixsim7.local")
        self.input_backend_base.setText(self._env_vars.get("BACKEND_BASE_URL", ""))
        endpoints_layout.addRow("Backend Base URL:", self.input_backend_base)
        self.lbl_backend_effective = QLabel()
        endpoints_layout.addRow("Backend Effective URL:", self.lbl_backend_effective)

        self.input_generation_base = QLineEdit()
        self.input_generation_base.setPlaceholderText("https://gen.pixsim7.local")
        self.input_generation_base.setText(self._env_vars.get("GENERATION_BASE_URL", ""))
        endpoints_layout.addRow("Generation Base URL:", self.input_generation_base)
        self.lbl_generation_effective = QLabel()
        endpoints_layout.addRow("Generation Effective URL:", self.lbl_generation_effective)

        self.input_frontend_base = QLineEdit()
        self.input_frontend_base.setPlaceholderText("https://app.pixsim7.local")
        self.input_frontend_base.setText(self._env_vars.get("FRONTEND_BASE_URL", ""))
        endpoints_layout.addRow("Frontend Base URL:", self.input_frontend_base)
        self.lbl_frontend_effective = QLabel()
        endpoints_layout.addRow("Frontend Effective URL:", self.lbl_frontend_effective)

        self.input_admin_base = QLineEdit()
        self.input_admin_base.setPlaceholderText("https://admin.pixsim7.local")
        self.input_admin_base.setText(self._env_vars.get("ADMIN_BASE_URL", ""))
        endpoints_layout.addRow("Admin Base URL:", self.input_admin_base)
        self.lbl_admin_effective = QLabel()
        endpoints_layout.addRow("Admin Effective URL:", self.lbl_admin_effective)

        self.input_game_base = QLineEdit()
        self.input_game_base.setPlaceholderText("https://game.pixsim7.local")
        self.input_game_base.setText(self._env_vars.get("GAME_FRONTEND_BASE_URL", ""))
        endpoints_layout.addRow("Game Frontend Base URL:", self.input_game_base)
        self.lbl_game_effective = QLabel()
        endpoints_layout.addRow("Game Frontend Effective URL:", self.lbl_game_effective)

        self.input_launcher_base = QLineEdit()
        self.input_launcher_base.setPlaceholderText("https://launcher.pixsim7.local")
        self.input_launcher_base.setText(self._env_vars.get("LAUNCHER_BASE_URL", ""))
        endpoints_layout.addRow("Launcher Base URL:", self.input_launcher_base)
        self.lbl_launcher_effective = QLabel()
        endpoints_layout.addRow("Launcher Effective URL:", self.lbl_launcher_effective)

        layout.addWidget(endpoints_group)

        tools_row = QHBoxLayout()
        tools_row.addStretch()
        btn_fill = QPushButton("Use pixsim7.local defaults")
        btn_fill.clicked.connect(self._fill_pixsim7_defaults)
        tools_row.addWidget(btn_fill)
        layout.addLayout(tools_row)

        note = QLabel("Leave base URLs blank to use http://localhost:<port>.")
        note.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-top: 6px;")
        note.setWordWrap(True)
        layout.addWidget(note)

        layout.addStretch()
        self._update_effective_endpoints()
        self.input_backend_base.textChanged.connect(self._update_effective_endpoints)
        self.input_generation_base.textChanged.connect(self._update_effective_endpoints)
        self.input_frontend_base.textChanged.connect(self._update_effective_endpoints)
        self.input_admin_base.textChanged.connect(self._update_effective_endpoints)
        self.input_game_base.textChanged.connect(self._update_effective_endpoints)
        self.input_launcher_base.textChanged.connect(self._update_effective_endpoints)
        self.spin_backend_port.valueChanged.connect(self._update_effective_endpoints)
        self.spin_frontend_port.valueChanged.connect(self._update_effective_endpoints)
        self.spin_game_frontend_port.valueChanged.connect(self._update_effective_endpoints)
        self.spin_admin_port.valueChanged.connect(self._update_effective_endpoints)
        self.spin_game_service_port.valueChanged.connect(self._update_effective_endpoints)
        return page

    def _create_network_local_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        local_group = QGroupBox("Local Datastores")
        local_layout = QFormLayout(local_group)
        local_layout.setSpacing(8)
        local_layout.setFieldGrowthPolicy(QFormLayout.ExpandingFieldsGrow)

        self.chk_use_local_datastores = QCheckBox("Use local Postgres/Redis (skip Docker DB service)")
        self.chk_use_local_datastores.setChecked(self._state.use_local_datastores)
        local_layout.addRow(self.chk_use_local_datastores)

        self.input_local_db_url = QLineEdit()
        self.input_local_db_url.setPlaceholderText("postgresql://pixsim:pixsim123@127.0.0.1:5432/pixsim7")
        self.input_local_db_url.setText(self._env_vars.get("LOCAL_DATABASE_URL", ""))
        local_layout.addRow("Local DATABASE_URL:", self.input_local_db_url)

        self.input_local_redis_url = QLineEdit()
        self.input_local_redis_url.setPlaceholderText("redis://localhost:6379/0")
        self.input_local_redis_url.setText(self._env_vars.get("LOCAL_REDIS_URL", ""))
        local_layout.addRow("Local REDIS_URL:", self.input_local_redis_url)

        layout.addWidget(local_group)

        tools_row = QHBoxLayout()
        tools_row.addStretch()
        btn_detect_local = QPushButton("Detect local DB/Redis")
        btn_detect_local.clicked.connect(self._detect_local_datastores)
        tools_row.addWidget(btn_detect_local)
        layout.addLayout(tools_row)

        note = QLabel("Local DB URLs are applied when the local toggle is enabled.")
        note.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-top: 6px;")
        note.setWordWrap(True)
        layout.addWidget(note)

        layout.addStretch()
        return page

    def _create_network_env_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        env_group = QGroupBox("Environment Variables")
        env_layout = QFormLayout(env_group)
        env_layout.setSpacing(8)
        env_layout.setFieldGrowthPolicy(QFormLayout.ExpandingFieldsGrow)

        self.input_database_url = QLineEdit()
        self.input_database_url.setText(self._env_vars.get("DATABASE_URL", ""))
        env_layout.addRow("DATABASE_URL:", self.input_database_url)

        self.input_redis_url = QLineEdit()
        self.input_redis_url.setText(self._env_vars.get("REDIS_URL", ""))
        env_layout.addRow("REDIS_URL:", self.input_redis_url)

        self.input_secret_key = QLineEdit()
        self.input_secret_key.setText(self._env_vars.get("SECRET_KEY", ""))
        env_layout.addRow("SECRET_KEY:", self.input_secret_key)

        self.input_cors_origins = QLineEdit()
        self.input_cors_origins.setText(self._env_vars.get("CORS_ORIGINS", ""))
        env_layout.addRow("CORS_ORIGINS:", self.input_cors_origins)

        self.input_debug = QLineEdit()
        self.input_debug.setText(self._env_vars.get("DEBUG", ""))
        env_layout.addRow("DEBUG:", self.input_debug)

        self.input_log_level = QLineEdit()
        self.input_log_level.setText(self._env_vars.get("LOG_LEVEL", ""))
        env_layout.addRow("LOG_LEVEL:", self.input_log_level)

        layout.addWidget(env_group)

        tools_row = QHBoxLayout()
        tools_row.addStretch()
        btn_env = QPushButton("Open Environment Editor")
        btn_env.clicked.connect(self._open_env_editor)
        tools_row.addWidget(btn_env)
        layout.addLayout(tools_row)

        layout.addStretch()
        return page

    def _update_effective_endpoints(self):
        def effective(base_value: str, port: int) -> str:
            value = (base_value or "").strip()
            if value:
                return value
            return f"http://localhost:{port}"

        self.lbl_backend_effective.setText(effective(self.input_backend_base.text(), self.spin_backend_port.value()))
        self.lbl_generation_effective.setText(effective(self.input_generation_base.text(), self.spin_backend_port.value()))
        self.lbl_frontend_effective.setText(effective(self.input_frontend_base.text(), self.spin_frontend_port.value()))
        self.lbl_admin_effective.setText(effective(self.input_admin_base.text(), self.spin_admin_port.value()))
        self.lbl_game_effective.setText(effective(self.input_game_base.text(), self.spin_game_frontend_port.value()))
        self.lbl_launcher_effective.setText(effective(self.input_launcher_base.text(), 8100))

    def _load_profiles(self) -> dict:
        profiles_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'profiles.json'))
        try:
            with open(profiles_path, 'r', encoding='utf-8') as f:
                profiles = json.load(f)
            if isinstance(profiles, dict):
                return profiles
        except Exception:
            pass
        return {"default": {"label": "Default", "ports": {}, "base_urls": {}, "use_local_datastores": False}}

    def _get_profile_index(self) -> int:
        active = self._env_vars.get("LAUNCHER_PROFILE", "default")
        if active in self._profile_keys:
            return self._profile_keys.index(active)
        return 0

    def _apply_selected_profile(self):
        key = self.profile_combo.currentData()
        profile = self._profiles.get(key)
        if not profile:
            return

        ports = profile.get("ports", {})
        if ports:
            if "backend" in ports:
                self.spin_backend_port.setValue(int(ports["backend"]))
            if "admin" in ports:
                self.spin_admin_port.setValue(int(ports["admin"]))
            if "frontend" in ports:
                self.spin_frontend_port.setValue(int(ports["frontend"]))
            if "game_frontend" in ports:
                self.spin_game_frontend_port.setValue(int(ports["game_frontend"]))
            if "game_service" in ports:
                self.spin_game_service_port.setValue(int(ports["game_service"]))

        base_urls = profile.get("base_urls", {})
        self.input_backend_base.setText(base_urls.get("backend", ""))
        self.input_generation_base.setText(base_urls.get("generation", ""))
        self.input_frontend_base.setText(base_urls.get("frontend", ""))
        self.input_admin_base.setText(base_urls.get("admin", ""))
        self.input_game_base.setText(base_urls.get("game_frontend", ""))
        self.input_launcher_base.setText(base_urls.get("launcher", ""))

        use_local = bool(profile.get("use_local_datastores", False))
        self.chk_use_local_datastores.setChecked(use_local)

    def _create_performance_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        health_group = QGroupBox("Health Check Intervals")
        health_layout = QVBoxLayout(health_group)
        health_layout.setSpacing(12)

        self.chk_adaptive_health = QCheckBox("Enable adaptive health checking")
        self.chk_adaptive_health.setChecked(self._state.health_check_adaptive)
        self.chk_adaptive_health.setToolTip(
            "Automatically adjust check frequency:\n"
            "  Fast checks (2s) during service startup\n"
            "  Normal checks (5s) during activity\n"
            "  Slow checks (10s) when all services are stable"
        )
        self.chk_adaptive_health.toggled.connect(self._on_adaptive_toggled)
        health_layout.addWidget(self.chk_adaptive_health)

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

        self.startup_row = QHBoxLayout()
        self.startup_row.addWidget(QLabel("  Startup interval:"))
        self.spin_startup_interval = QDoubleSpinBox()
        self.spin_startup_interval.setRange(0.5, 10.0)
        self.spin_startup_interval.setSingleStep(0.5)
        self.spin_startup_interval.setSuffix(" seconds")
        self.spin_startup_interval.setValue(self._state.health_check_startup_interval)
        self.spin_startup_interval.setToolTip("Fast checks during service startup (default: 2s)")
        self.startup_row.addWidget(self.spin_startup_interval)
        self.startup_row.addStretch()
        health_layout.addLayout(self.startup_row)

        self.stable_row = QHBoxLayout()
        self.stable_row.addWidget(QLabel("  Stable interval:"))
        self.spin_stable_interval = QDoubleSpinBox()
        self.spin_stable_interval.setRange(5.0, 120.0)
        self.spin_stable_interval.setSingleStep(5.0)
        self.spin_stable_interval.setSuffix(" seconds")
        self.spin_stable_interval.setValue(self._state.health_check_stable_interval)
        self.spin_stable_interval.setToolTip("Slow checks when all services are stable (default: 10s)")
        self.stable_row.addWidget(self.spin_stable_interval)
        self.stable_row.addStretch()
        health_layout.addLayout(self.stable_row)

        info = QLabel(
            "Tip: Lower intervals = more responsive UI but higher CPU usage.\n"
            "Recommended: Enable adaptive mode for best balance."
        )
        info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-top: 8px;")
        info.setWordWrap(True)
        health_layout.addWidget(info)

        layout.addWidget(health_group)

        self._on_adaptive_toggled(self._state.health_check_adaptive)

        layout.addStretch()
        return tab

    def get_state(self) -> UIState:
        self._state.window_always_on_top = self.chk_always_on_top.isChecked()
        self._state.stop_services_on_exit = self.chk_stop_on_exit.isChecked()

        self._state.auto_refresh_logs = self.chk_auto_refresh_logs.isChecked()
        self._state.sql_logging_enabled = self.chk_sql_logging.isChecked()
        if hasattr(self, "chk_worker_debug") and self.chk_worker_debug.isChecked():
            if not self._state.worker_debug_flags:
                self._state.worker_debug_flags = "generation,provider,worker"
        else:
            self._state.worker_debug_flags = ""
        if hasattr(self, "chk_backend_debug"):
            self._state.backend_debug_enabled = self.chk_backend_debug.isChecked()

        self._state.health_check_adaptive = self.chk_adaptive_health.isChecked()
        self._state.health_check_interval = float(self.spin_health_interval.value())
        self._state.health_check_startup_interval = float(self.spin_startup_interval.value())
        self._state.health_check_stable_interval = float(self.spin_stable_interval.value())

        if hasattr(self, "chk_use_local_datastores"):
            self._state.use_local_datastores = self.chk_use_local_datastores.isChecked()

        env_updates = {
            "LAUNCHER_PROFILE": self.profile_combo.currentData() if hasattr(self, "profile_combo") else "",
            "BACKEND_BASE_URL": self.input_backend_base.text().strip(),
            "GENERATION_BASE_URL": self.input_generation_base.text().strip(),
            "FRONTEND_BASE_URL": self.input_frontend_base.text().strip(),
            "ADMIN_BASE_URL": self.input_admin_base.text().strip(),
            "GAME_FRONTEND_BASE_URL": self.input_game_base.text().strip(),
            "LAUNCHER_BASE_URL": self.input_launcher_base.text().strip(),
            "USE_LOCAL_DATASTORES": "1" if self._state.use_local_datastores else "0",
            "LOCAL_DATABASE_URL": self.input_local_db_url.text().strip(),
            "LOCAL_REDIS_URL": self.input_local_redis_url.text().strip(),
            "BACKEND_PORT": str(self.spin_backend_port.value()),
            "ADMIN_PORT": str(self.spin_admin_port.value()),
            "FRONTEND_PORT": str(self.spin_frontend_port.value()),
            "GAME_FRONTEND_PORT": str(self.spin_game_frontend_port.value()),
            "GAME_SERVICE_PORT": str(self.spin_game_service_port.value()),
            "DATABASE_URL": self.input_database_url.text().strip(),
            "REDIS_URL": self.input_redis_url.text().strip(),
            "SECRET_KEY": self.input_secret_key.text().strip(),
            "CORS_ORIGINS": self.input_cors_origins.text().strip(),
            "DEBUG": self.input_debug.text().strip(),
            "LOG_LEVEL": self.input_log_level.text().strip(),
        }
        if self._state.use_local_datastores:
            current_db = env_updates.get("DATABASE_URL") or self._env_vars.get("DATABASE_URL", "")
            current_redis = env_updates.get("REDIS_URL") or self._env_vars.get("REDIS_URL", "")
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
        for i in range(self.startup_row.count()):
            widget = self.startup_row.itemAt(i).widget()
            if widget:
                widget.setVisible(checked)

        for i in range(self.stable_row.count()):
            widget = self.stable_row.itemAt(i).widget()
            if widget:
                widget.setVisible(checked)

    def _reset_to_defaults(self):
        from PySide6.QtWidgets import QMessageBox

        reply = QMessageBox.question(
            self,
            "Reset to Defaults",
            "Reset all settings to their default values?",
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
            default_ports = Ports()
            self.spin_backend_port.setValue(default_ports.backend)
            self.spin_admin_port.setValue(default_ports.admin)
            self.spin_frontend_port.setValue(default_ports.frontend)
            self.spin_game_frontend_port.setValue(default_ports.game_frontend)
            self.spin_game_service_port.setValue(default_ports.game_service)
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
            if hasattr(self, "input_database_url"):
                self.input_database_url.setText("")
            if hasattr(self, "input_redis_url"):
                self.input_redis_url.setText("")
            if hasattr(self, "input_secret_key"):
                self.input_secret_key.setText("")
            if hasattr(self, "input_cors_origins"):
                self.input_cors_origins.setText("")
            if hasattr(self, "input_debug"):
                self.input_debug.setText("")
            if hasattr(self, "input_log_level"):
                self.input_log_level.setText("")

    def _save_settings(self):
        updated = self.get_state()
        if self._on_saved:
            try:
                self._on_saved(updated)
            except Exception:
                pass

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
        ports = read_env_ports()
        self.input_local_db_url.setText(self._env_vars.get("LOCAL_DATABASE_URL", ""))
        self.input_local_redis_url.setText(self._env_vars.get("LOCAL_REDIS_URL", ""))
        self.input_backend_base.setText(self._env_vars.get("BACKEND_BASE_URL", ""))
        self.input_generation_base.setText(self._env_vars.get("GENERATION_BASE_URL", ""))
        self.input_frontend_base.setText(self._env_vars.get("FRONTEND_BASE_URL", ""))
        self.input_admin_base.setText(self._env_vars.get("ADMIN_BASE_URL", ""))
        self.input_game_base.setText(self._env_vars.get("GAME_FRONTEND_BASE_URL", ""))
        self.input_launcher_base.setText(self._env_vars.get("LAUNCHER_BASE_URL", ""))
        self.input_database_url.setText(self._env_vars.get("DATABASE_URL", ""))
        self.input_redis_url.setText(self._env_vars.get("REDIS_URL", ""))
        self.input_secret_key.setText(self._env_vars.get("SECRET_KEY", ""))
        self.input_cors_origins.setText(self._env_vars.get("CORS_ORIGINS", ""))
        self.input_debug.setText(self._env_vars.get("DEBUG", ""))
        self.input_log_level.setText(self._env_vars.get("LOG_LEVEL", ""))
        if hasattr(self, "profile_combo"):
            self.profile_combo.setCurrentIndex(self._get_profile_index())
        self.spin_backend_port.setValue(ports.backend)
        self.spin_admin_port.setValue(ports.admin)
        self.spin_frontend_port.setValue(ports.frontend)
        self.spin_game_frontend_port.setValue(ports.game_frontend)
        self.spin_game_service_port.setValue(ports.game_service)
        self._update_effective_endpoints()

    def _detect_local_datastores(self):
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
