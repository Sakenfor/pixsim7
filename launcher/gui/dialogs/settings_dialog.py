from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox, QPushButton,
    QGroupBox, QSpinBox, QDoubleSpinBox, QComboBox, QTabWidget, QWidget
)
from PySide6.QtCore import Qt

try:
    from ..config import UIState, save_ui_state
    from .. import theme
except Exception:
    from config import UIState, save_ui_state
    import theme


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

        layout.addWidget(logging_group)

        layout.addStretch()
        return tab

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

        # Performance / health check
        self._state.health_check_adaptive = self.chk_adaptive_health.isChecked()
        self._state.health_check_interval = float(self.spin_health_interval.value())
        self._state.health_check_startup_interval = float(self.spin_startup_interval.value())
        self._state.health_check_stable_interval = float(self.spin_stable_interval.value())

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
