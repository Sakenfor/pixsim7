import os
import socket
import shutil
import subprocess
import json
from urllib.parse import urlparse
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox, QPushButton,
    QGroupBox, QSpinBox, QDoubleSpinBox, QComboBox, QMessageBox,
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
    from ..services import load_service_configs
    from .tab_builder import create_info_label
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
    from services import load_service_configs
    from widgets.tab_builder import create_info_label


class SettingsPanel(QWidget):
    def __init__(self, ui_state: UIState, on_saved=None, parent=None):
        super().__init__(parent)
        self._state = ui_state
        self._env_vars = read_env_file()
        self._services_config = self._load_services_config()
        self._profiles = self._merge_profile_defaults(self._load_profiles())
        self._on_saved = on_saved
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(0, 0, 0, 0)

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

        info_label = create_info_label("Settings are saved automatically to launcher.json")
        info_label.setStyleSheet(info_label.styleSheet() + " font-style: italic; margin-top: 8px;")
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
        tabs.addTab(self._create_network_env_page(), "Advanced")
        layout.addWidget(tabs)
        return tab

    def _create_network_endpoints_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        endpoints_group = QGroupBox("Ports and Base URLs")
        endpoints_layout = QFormLayout(endpoints_group)
        endpoints_layout.setSpacing(8)
        endpoints_layout.setFieldGrowthPolicy(QFormLayout.ExpandingFieldsGrow)

        self._service_port_inputs = {}
        for service in self._collect_service_port_defs():
            label = service["label"]
            env_key = service["env"]
            value = service["value"]
            spin = QSpinBox()
            spin.setRange(1, 65535)
            spin.setValue(value)
            endpoints_layout.addRow(f"{label} Port:", spin)
            self._service_port_inputs[env_key] = spin

        self.spin_backend_port = self._service_port_inputs.get("BACKEND_PORT")
        self.spin_frontend_port = self._service_port_inputs.get("FRONTEND_PORT")
        self.spin_game_frontend_port = self._service_port_inputs.get("GAME_FRONTEND_PORT")
        self.spin_game_service_port = self._service_port_inputs.get("GAME_SERVICE_PORT")
        self.spin_devtools_port = self._service_port_inputs.get("DEVTOOLS_PORT")

        self.input_backend_base = QLineEdit()
        self.input_backend_base.setPlaceholderText(self._get_placeholder_url('backend'))
        self.input_backend_base.setText(self._env_vars.get("BACKEND_BASE_URL", ""))
        endpoints_layout.addRow("Backend Base URL:", self.input_backend_base)
        self.lbl_backend_effective = QLabel()
        endpoints_layout.addRow("Backend Effective URL:", self.lbl_backend_effective)

        self.input_generation_base = QLineEdit()
        self.input_generation_base.setPlaceholderText(self._get_placeholder_url('generation'))
        self.input_generation_base.setText(self._env_vars.get("GENERATION_BASE_URL", ""))
        endpoints_layout.addRow("Generation Base URL:", self.input_generation_base)
        self.lbl_generation_effective = QLabel()
        endpoints_layout.addRow("Generation Effective URL:", self.lbl_generation_effective)

        self.input_frontend_base = QLineEdit()
        self.input_frontend_base.setPlaceholderText(self._get_placeholder_url('frontend'))
        self.input_frontend_base.setText(self._env_vars.get("FRONTEND_BASE_URL", ""))
        endpoints_layout.addRow("Frontend Base URL:", self.input_frontend_base)
        self.lbl_frontend_effective = QLabel()
        endpoints_layout.addRow("Frontend Effective URL:", self.lbl_frontend_effective)

        self.input_game_base = QLineEdit()
        self.input_game_base.setPlaceholderText(self._get_placeholder_url('game_frontend'))
        self.input_game_base.setText(self._env_vars.get("GAME_FRONTEND_BASE_URL", ""))
        endpoints_layout.addRow("Game Frontend Base URL:", self.input_game_base)
        self.lbl_game_effective = QLabel()
        endpoints_layout.addRow("Game Frontend Effective URL:", self.lbl_game_effective)

        self.input_devtools_base = QLineEdit()
        self.input_devtools_base.setPlaceholderText(self._get_placeholder_url('devtools'))
        self.input_devtools_base.setText(self._env_vars.get("DEVTOOLS_BASE_URL", ""))
        endpoints_layout.addRow("DevTools Base URL:", self.input_devtools_base)
        self.lbl_devtools_effective = QLabel()
        endpoints_layout.addRow("DevTools Effective URL:", self.lbl_devtools_effective)

        self.input_launcher_base = QLineEdit()
        self.input_launcher_base.setPlaceholderText(self._get_placeholder_url('launcher'))
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

        note = create_info_label("Leave base URLs blank to use http://localhost:<port>.")
        note.setStyleSheet(note.styleSheet() + " margin-top: 6px;")
        note.setWordWrap(True)
        layout.addWidget(note)

        layout.addStretch()
        self._update_effective_endpoints()
        self.input_backend_base.textChanged.connect(self._update_effective_endpoints)
        self.input_generation_base.textChanged.connect(self._update_effective_endpoints)
        self.input_frontend_base.textChanged.connect(self._update_effective_endpoints)
        self.input_game_base.textChanged.connect(self._update_effective_endpoints)
        self.input_devtools_base.textChanged.connect(self._update_effective_endpoints)
        self.input_launcher_base.textChanged.connect(self._update_effective_endpoints)
        if self.spin_backend_port:
            self.spin_backend_port.valueChanged.connect(self._update_effective_endpoints)
        if self.spin_frontend_port:
            self.spin_frontend_port.valueChanged.connect(self._update_effective_endpoints)
        if self.spin_game_frontend_port:
            self.spin_game_frontend_port.valueChanged.connect(self._update_effective_endpoints)
        if self.spin_game_service_port:
            self.spin_game_service_port.valueChanged.connect(self._update_effective_endpoints)
        if self.spin_devtools_port:
            self.spin_devtools_port.valueChanged.connect(self._update_effective_endpoints)
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
        self.input_local_db_url.setPlaceholderText(
            self._get_db_connection_template('postgres').format(port=5432)
            or "postgresql://pixsim:pixsim123@127.0.0.1:5432/pixsim7"
        )
        self.input_local_db_url.setText(self._env_vars.get("LOCAL_DATABASE_URL", ""))
        local_layout.addRow("Local DATABASE_URL:", self.input_local_db_url)

        self.input_local_redis_url = QLineEdit()
        self.input_local_redis_url.setPlaceholderText(
            self._get_db_connection_template('redis').format(port=6379)
            or "redis://localhost:6379/0"
        )
        self.input_local_redis_url.setText(self._env_vars.get("LOCAL_REDIS_URL", ""))
        local_layout.addRow("Local REDIS_URL:", self.input_local_redis_url)

        layout.addWidget(local_group)

        tools_row = QHBoxLayout()
        tools_row.addStretch()
        btn_detect_local = QPushButton("Detect local DB/Redis")
        btn_detect_local.clicked.connect(self._detect_local_datastores)
        tools_row.addWidget(btn_detect_local)
        layout.addLayout(tools_row)

        note = create_info_label("Local DB URLs are applied when the local toggle is enabled.")
        note.setStyleSheet(note.styleSheet() + " margin-top: 6px;")
        note.setWordWrap(True)
        layout.addWidget(note)

        layout.addStretch()
        return page

    def _create_network_env_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        note = create_info_label("Ports are managed in the Endpoints tab.")
        note.setStyleSheet(note.styleSheet() + " margin-top: 2px;")
        layout.addWidget(note)

        env_group = QGroupBox("Advanced Environment Variables")
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
        self.input_cors_origins.setReadOnly(True)
        self.input_cors_origins.setPlaceholderText("Managed automatically from base URLs and ports")
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

        self.lbl_backend_effective.setText(effective(self.input_backend_base.text(), self._get_port_value("BACKEND_PORT")))
        self.lbl_generation_effective.setText(
            effective(self.input_generation_base.text(), self._get_port_value("GENERATION_API_PORT", self._get_port_value("BACKEND_PORT")))
        )
        self.lbl_frontend_effective.setText(effective(self.input_frontend_base.text(), self._get_port_value("FRONTEND_PORT")))
        self.lbl_game_effective.setText(effective(self.input_game_base.text(), self._get_port_value("GAME_FRONTEND_PORT")))
        self.lbl_devtools_effective.setText(effective(self.input_devtools_base.text(), self._get_port_value("DEVTOOLS_PORT")))
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

    def _merge_profile_defaults(self, profiles: dict) -> dict:
        if not isinstance(profiles, dict):
            return {"default": {"label": "Default", "ports": {}, "base_urls": {}, "use_local_datastores": False}}
        if not self._services_config:
            return profiles

        for profile_key, profile in profiles.items():
            if not isinstance(profile, dict):
                continue
            ports = profile.setdefault("ports", {})
            base_urls = profile.setdefault("base_urls", {})
            for service in self._services_config:
                if not service.get("enabled", True):
                    continue
                service_key = service.get("profile_key") or service.get("id")
                if not service_key:
                    continue
                default_port = service.get("default_port")
                if default_port is not None and service_key not in ports:
                    try:
                        ports[service_key] = int(default_port)
                    except Exception:
                        pass
                if service_key not in base_urls:
                    subdomain = service.get("subdomain")
                    if profile_key == "https_local" and subdomain:
                        base_urls[service_key] = f"https://{subdomain}.pixsim7.local"
                    else:
                        base_urls[service_key] = ""

        return profiles

    def _load_services_config(self) -> list[dict]:
        try:
            return load_service_configs()
        except Exception:
            return []

    def _get_placeholder_url(self, service: str) -> str:
        """Get placeholder URL from https_local profile."""
        https_profile = self._profiles.get('https_local', {})
        base_urls = https_profile.get('base_urls', {})
        return base_urls.get(service, '')

    def _get_db_scan_ports(self, db_type: str) -> list:
        """Get scan ports for postgres/redis from service manifests."""
        for service in self._services_config:
            if service.get('id') != 'db':
                continue
            for port_def in service.get('ports', []):
                if port_def.get('name', '').lower() == db_type.lower():
                    return port_def.get('scan_ports', [])
        # Fallback defaults
        return [5432, 5433, 5434, 5435] if db_type.lower() == 'postgres' else [6379, 6380]

    def _get_db_connection_template(self, db_type: str) -> str:
        """Get connection template for postgres/redis from service manifests."""
        for service in self._services_config:
            if service.get('id') != 'db':
                continue
            for port_def in service.get('ports', []):
                if port_def.get('name', '').lower() == db_type.lower():
                    return port_def.get('connection_template', '')
        return ''

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
            if self.spin_backend_port and "backend" in ports:
                self.spin_backend_port.setValue(int(ports["backend"]))
            gen_spin = self._service_port_inputs.get("GENERATION_API_PORT")
            if gen_spin and "generation" in ports:
                gen_spin.setValue(int(ports["generation"]))
            if self.spin_frontend_port and "frontend" in ports:
                self.spin_frontend_port.setValue(int(ports["frontend"]))
            if self.spin_game_frontend_port and "game_frontend" in ports:
                self.spin_game_frontend_port.setValue(int(ports["game_frontend"]))
            if self.spin_game_service_port and "game_service" in ports:
                self.spin_game_service_port.setValue(int(ports["game_service"]))
            if getattr(self, "spin_devtools_port", None) and "devtools" in ports:
                self.spin_devtools_port.setValue(int(ports["devtools"]))

        base_urls = profile.get("base_urls", {})
        self.input_backend_base.setText(base_urls.get("backend", ""))
        self.input_generation_base.setText(base_urls.get("generation", ""))
        self.input_frontend_base.setText(base_urls.get("frontend", ""))
        self.input_game_base.setText(base_urls.get("game_frontend", ""))
        self.input_devtools_base.setText(base_urls.get("devtools", ""))
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
            "BACKEND_BASE_URL": self._normalize_or_derived(self.input_backend_base.text(), self.spin_backend_port.value()),
            "GENERATION_BASE_URL": self._normalize_or_derived(
                self.input_generation_base.text(),
                self._get_port_value("GENERATION_API_PORT", self._get_port_value("BACKEND_PORT"))
            ),
            "FRONTEND_BASE_URL": self._normalize_or_derived(self.input_frontend_base.text(), self.spin_frontend_port.value()),
            "GAME_FRONTEND_BASE_URL": self._normalize_or_derived(self.input_game_base.text(), self.spin_game_frontend_port.value()),
            "DEVTOOLS_BASE_URL": self._normalize_or_derived(self.input_devtools_base.text(), self._get_port_value("DEVTOOLS_PORT")),
            "LAUNCHER_BASE_URL": self._normalize_or_derived(self.input_launcher_base.text(), 8100),
            "USE_LOCAL_DATASTORES": "1" if self._state.use_local_datastores else "0",
            "LOCAL_DATABASE_URL": self.input_local_db_url.text().strip(),
            "LOCAL_REDIS_URL": self.input_local_redis_url.text().strip(),
            "BACKEND_PORT": str(self._get_port_value("BACKEND_PORT")),
            "FRONTEND_PORT": str(self._get_port_value("FRONTEND_PORT")),
            "GAME_FRONTEND_PORT": str(self._get_port_value("GAME_FRONTEND_PORT")),
            "GAME_SERVICE_PORT": str(self._get_port_value("GAME_SERVICE_PORT")),
            "DEVTOOLS_PORT": str(self._get_port_value("DEVTOOLS_PORT")),
            "DATABASE_URL": self.input_database_url.text().strip(),
            "REDIS_URL": self.input_redis_url.text().strip(),
            "SECRET_KEY": self.input_secret_key.text().strip(),
            "CORS_ORIGINS": self.input_cors_origins.text().strip(),
            "DEBUG": self.input_debug.text().strip(),
            "LOG_LEVEL": self.input_log_level.text().strip(),
        }
        for env_key, spin in self._service_port_inputs.items():
            env_updates[env_key] = str(spin.value())
        self._apply_base_url_fields(env_updates)
        env_updates["CORS_ORIGINS"] = self._generate_cors_origins(env_updates)
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

    def _normalize_or_derived(self, value: str, port: int) -> str:
        value = (value or "").strip()
        if value:
            return value.rstrip("/")
        scheme = "https" if self._profile_prefers_https() else "http"
        return f"{scheme}://localhost:{port}"

    def _profile_prefers_https(self) -> bool:
        key = self.profile_combo.currentData() if hasattr(self, "profile_combo") else ""
        profile = self._profiles.get(key or "", {})
        base_urls = profile.get("base_urls", {}) if isinstance(profile, dict) else {}
        for url in base_urls.values():
            if isinstance(url, str) and url.startswith("https://"):
                return True
        return False

    def _apply_base_url_fields(self, env_updates: dict) -> None:
        self.input_backend_base.setText(env_updates.get("BACKEND_BASE_URL", ""))
        self.input_generation_base.setText(env_updates.get("GENERATION_BASE_URL", ""))
        self.input_frontend_base.setText(env_updates.get("FRONTEND_BASE_URL", ""))
        self.input_game_base.setText(env_updates.get("GAME_FRONTEND_BASE_URL", ""))
        self.input_devtools_base.setText(env_updates.get("DEVTOOLS_BASE_URL", ""))
        self.input_launcher_base.setText(env_updates.get("LAUNCHER_BASE_URL", ""))
        self._update_effective_endpoints()

    def _generate_cors_origins(self, env_updates: dict) -> str:
        urls = [
            env_updates.get("BACKEND_BASE_URL"),
            env_updates.get("GENERATION_BASE_URL"),
            env_updates.get("FRONTEND_BASE_URL"),
            env_updates.get("GAME_FRONTEND_BASE_URL"),
            env_updates.get("DEVTOOLS_BASE_URL"),
            env_updates.get("LAUNCHER_BASE_URL"),
        ]
        ports = {
            "backend": self._get_port_value("BACKEND_PORT"),
            "frontend": self._get_port_value("FRONTEND_PORT"),
            "game_frontend": self._get_port_value("GAME_FRONTEND_PORT"),
            "devtools": self._get_port_value("DEVTOOLS_PORT"),
        }
        for port in ports.values():
            urls.append(f"http://localhost:{port}")
            urls.append(f"http://127.0.0.1:{port}")

        seen = set()
        origins = []
        for url in urls:
            if not url:
                continue
            url = url.strip()
            if not url:
                continue
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                continue
            origin = f"{parsed.scheme}://{parsed.netloc}"
            if origin not in seen:
                seen.add(origin)
                origins.append(origin)
        return ",".join(origins)

    def _get_port_value(self, env_key: str, default: int = 0) -> int:
        spin = self._service_port_inputs.get(env_key)
        if spin is not None:
            return int(spin.value())
        return int(default or 0)

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
            self.spin_frontend_port.setValue(default_ports.frontend)
            self.spin_game_frontend_port.setValue(default_ports.game_frontend)
            self.spin_game_service_port.setValue(default_ports.game_service)
            if hasattr(self, "spin_devtools_port") and self.spin_devtools_port:
                self.spin_devtools_port.setValue(default_ports.devtools)
            if hasattr(self, "input_backend_base"):
                self.input_backend_base.setText("")
            if hasattr(self, "input_generation_base"):
                self.input_generation_base.setText("")
            if hasattr(self, "input_frontend_base"):
                self.input_frontend_base.setText("")
            if hasattr(self, "input_game_base"):
                self.input_game_base.setText("")
            if hasattr(self, "input_devtools_base"):
                self.input_devtools_base.setText("")
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
        if not self._confirm_port_changes():
            return
        updated = self.get_state()
        if self._on_saved:
            try:
                self._on_saved(updated)
            except Exception:
                pass

    def _confirm_port_changes(self) -> bool:
        ports = self._collect_configured_ports()
        running_ports = self._get_running_ports()

        duplicates = {}
        for name, port in ports.items():
            duplicates.setdefault(port, []).append(name)
        dup_lines = [
            f"{port}: {', '.join(names)}"
            for port, names in duplicates.items()
            if len(names) > 1
        ]

        in_use = []
        for name, port in ports.items():
            if port in running_ports:
                continue
            if self._is_port_open(port):
                in_use.append(f"{name} ({port})")

        if not dup_lines and not in_use:
            return True

        lines = []
        if dup_lines:
            lines.append("Duplicate ports:")
            lines.extend(dup_lines)
        if in_use:
            lines.append("Ports currently in use:")
            lines.extend(in_use)

        message = "Potential port conflicts detected.\n\n" + "\n".join(lines) + "\n\nSave anyway?"
        reply = QMessageBox.question(
            self,
            "Port Conflicts",
            message,
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        return reply == QMessageBox.Yes

    def _is_port_open(self, port: int) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", int(port)), timeout=0.2):
                return True
        except OSError:
            return False

    def _collect_configured_ports(self) -> dict:
        env = read_env_file()
        ports_by_id = {}
        seen_env = set()

        for cfg in self._services_config:
            if not cfg.get("enabled", True):
                continue
            port_defs = cfg.get("ports", []) or []
            if not port_defs and cfg.get("port_env"):
                port_defs = [{
                    "name": cfg.get("name", cfg.get("id", cfg.get("port_env"))),
                    "env": cfg.get("port_env"),
                    "default_port": cfg.get("default_port", 0),
                }]

            for port_def in port_defs:
                port_env = port_def.get("env")
                if not port_env or port_env in seen_env:
                    continue
                seen_env.add(port_env)
                port = self._parse_int(env.get(port_env), port_def.get("default_port", 0))
                label = port_def.get("name", cfg.get("name", cfg.get("id", port_env))).strip()
                ports_by_id[port_env] = {"label": label, "port": port}

        # Fallback infra ports if not defined by manifests
        ports_by_id.setdefault("POSTGRES_PORT", {"label": "Postgres", "port": self._parse_int(env.get("POSTGRES_PORT"), default=5434)})
        ports_by_id.setdefault("REDIS_PORT", {"label": "Redis", "port": self._parse_int(env.get("REDIS_PORT"), default=6380)})
        ports_by_id.setdefault("LAUNCHER_PORT", {"label": "Launcher API", "port": self._parse_int(env.get("LAUNCHER_PORT"), default=8100)})
        ports_by_id.setdefault("GAME_SERVICE_PORT", {"label": "Game Service", "port": self._parse_int(env.get("GAME_SERVICE_PORT"), default=8050)})

        # Override with current UI values for known services
        if "BACKEND_PORT" in ports_by_id and self.spin_backend_port:
            ports_by_id["BACKEND_PORT"]["port"] = self.spin_backend_port.value()
        gen_spin = self._service_port_inputs.get("GENERATION_API_PORT")
        if "GENERATION_API_PORT" in ports_by_id and gen_spin:
            ports_by_id["GENERATION_API_PORT"]["port"] = gen_spin.value()
        if "FRONTEND_PORT" in ports_by_id and self.spin_frontend_port:
            ports_by_id["FRONTEND_PORT"]["port"] = self.spin_frontend_port.value()
        if "GAME_FRONTEND_PORT" in ports_by_id and self.spin_game_frontend_port:
            ports_by_id["GAME_FRONTEND_PORT"]["port"] = self.spin_game_frontend_port.value()
        if "DEVTOOLS_PORT" in ports_by_id and getattr(self, "spin_devtools_port", None):
            ports_by_id["DEVTOOLS_PORT"]["port"] = self.spin_devtools_port.value()
        if "GAME_SERVICE_PORT" in ports_by_id and self.spin_game_service_port:
            ports_by_id["GAME_SERVICE_PORT"]["port"] = self.spin_game_service_port.value()

        return {item["label"]: item["port"] for item in ports_by_id.values()}

    def _collect_service_port_defs(self) -> list[dict]:
        env = read_env_file()
        items = []
        seen = set()
        for cfg in self._services_config:
            if not cfg.get("enabled", True):
                continue
            port_defs = cfg.get("ports", []) or []
            if not port_defs and cfg.get("port_env"):
                port_defs = [{
                    "name": cfg.get("name", cfg.get("id", cfg.get("port_env"))),
                    "env": cfg.get("port_env"),
                    "default_port": cfg.get("default_port", 0),
                }]
            for port_def in port_defs:
                port_env = port_def.get("env")
                if not port_env or port_env in seen:
                    continue
                seen.add(port_env)
                value = self._parse_int(env.get(port_env), port_def.get("default_port", 0))
                label = port_def.get("name", cfg.get("name", cfg.get("id", port_env))).strip()
                items.append({"env": port_env, "label": label, "value": value})

        return items

    def _resolve_port_from_config(self, cfg: dict, env: dict) -> int | None:
        port_env = cfg.get("port_env")
        if port_env and port_env in env:
            try:
                return int(env[port_env])
            except Exception:
                return None
        if "default_port" in cfg:
            try:
                return int(cfg["default_port"])
            except Exception:
                return None
        return None

    def _parse_int(self, value, default: int) -> int:
        try:
            return int(value)
        except Exception:
            return default

    def _get_running_ports(self) -> set:
        running = set()
        parent = self.parent()
        processes = getattr(parent, "processes", None) if parent else None
        if not processes:
            return running
        for sp in processes.values():
            if not getattr(sp, "running", False):
                continue
            url = getattr(sp.defn, "health_url", None) or getattr(sp.defn, "url", None)
            port = self._port_from_url(url)
            if port:
                running.add(port)
        return running

    def _port_from_url(self, url: str | None) -> int | None:
        if not url:
            return None
        try:
            parsed = urlparse(url)
            if parsed.port:
                return parsed.port
        except Exception:
            return None
        return None

    def _fill_pixsim7_defaults(self):
        """Fill base URLs from the https_local profile."""
        https_profile = self._profiles.get('https_local', {})
        base_urls = https_profile.get('base_urls', {})
        self.input_backend_base.setText(base_urls.get('backend', ''))
        self.input_generation_base.setText(base_urls.get('generation', ''))
        self.input_frontend_base.setText(base_urls.get('frontend', ''))
        self.input_game_base.setText(base_urls.get('game_frontend', ''))
        self.input_devtools_base.setText(base_urls.get('devtools', ''))
        self.input_launcher_base.setText(base_urls.get('launcher', ''))

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
        self.input_game_base.setText(self._env_vars.get("GAME_FRONTEND_BASE_URL", ""))
        self.input_devtools_base.setText(self._env_vars.get("DEVTOOLS_BASE_URL", ""))
        self.input_launcher_base.setText(self._env_vars.get("LAUNCHER_BASE_URL", ""))
        self.input_database_url.setText(self._env_vars.get("DATABASE_URL", ""))
        self.input_redis_url.setText(self._env_vars.get("REDIS_URL", ""))
        self.input_secret_key.setText(self._env_vars.get("SECRET_KEY", ""))
        self.input_cors_origins.setText(self._env_vars.get("CORS_ORIGINS", ""))
        self.input_debug.setText(self._env_vars.get("DEBUG", ""))
        self.input_log_level.setText(self._env_vars.get("LOG_LEVEL", ""))
        if hasattr(self, "profile_combo"):
            self.profile_combo.setCurrentIndex(self._get_profile_index())
        for env_key, spin in self._service_port_inputs.items():
            value = self._parse_int(self._env_vars.get(env_key), spin.value())
            spin.setValue(value)
        self._update_effective_endpoints()

    def _detect_local_datastores(self):
        pg_ports = self._get_db_scan_ports('postgres')
        redis_ports = self._get_db_scan_ports('redis')

        pg_port = self._find_open_port(pg_ports)
        redis_port = self._find_open_port(redis_ports)

        if pg_port:
            current_db = self.input_local_db_url.text().strip()
            if not current_db:
                template = self._get_db_connection_template('postgres')
                url = template.format(port=pg_port) if template else f"postgresql://pixsim:pixsim123@127.0.0.1:{pg_port}/pixsim7"
                self.input_local_db_url.setText(url)
        if redis_port:
            current_redis = self.input_local_redis_url.text().strip()
            if not current_redis:
                template = self._get_db_connection_template('redis')
                url = template.format(port=redis_port) if template else f"redis://localhost:{redis_port}/0"
                self.input_local_redis_url.setText(url)

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

        self._notify("Detection complete:\n" + "\n".join(details))

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

    def _notify(self, message: str, level: str = "info"):
        parent = self.parent()
        if parent and hasattr(parent, "notify"):
            try:
                parent.notify(message, level=level)
                return
            except Exception:
                pass
        QMessageBox.information(self, "Info", message)
