from PySide6.QtWidgets import QDialog, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox, QPushButton
from PySide6.QtCore import Qt

try:
    from ..config import UIState, save_ui_state
except Exception:
    from config import UIState, save_ui_state


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
        self.setMinimumWidth(400)
        self.setStyleSheet("""
            QDialog {
                background-color: #f9f9f9;
            }
            QLabel {
                color: #1a1a1a;
                font-size: 10pt;
            }
            QCheckBox {
                color: #1a1a1a;
                font-size: 10pt;
                spacing: 8px;
            }
            QCheckBox::indicator {
                width: 18px;
                height: 18px;
                border: 2px solid #ccc;
                border-radius: 3px;
                background-color: white;
            }
            QCheckBox::indicator:checked {
                background-color: #2196F3;
                border-color: #2196F3;
                image: url(none);
            }
            QCheckBox::indicator:checked:after {
                content: "✓";
                color: white;
            }
            QPushButton {
                background-color: #2196F3;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 16px;
                font-weight: bold;
                min-height: 28px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
            QPushButton:pressed {
                background-color: #0D47A1;
            }
        """)
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        layout.setContentsMargins(20, 20, 20, 20)

        header = QLabel("General")
        header.setStyleSheet("color: #1a1a1a; font-size: 12pt; font-weight: bold;")
        layout.addWidget(header)

        self.chk_stop_on_exit = QCheckBox("Stop all services on exit")
        self.chk_stop_on_exit.setChecked(self._state.stop_services_on_exit)
        layout.addWidget(self.chk_stop_on_exit)

        self.chk_auto_refresh_logs = QCheckBox("Enable log auto-refresh by default")
        self.chk_auto_refresh_logs.setChecked(self._state.auto_refresh_logs)
        layout.addWidget(self.chk_auto_refresh_logs)

        info_label = QLabel("(Settings are saved to launcher.json)")
        info_label.setStyleSheet("color: #666; font-size: 9pt; font-style: italic;")
        layout.addWidget(info_label)

        btn_row = QHBoxLayout()
        btn_ok = QPushButton("Save")
        btn_cancel = QPushButton("Cancel")
        btn_ok.clicked.connect(self.accept)
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_ok)
        btn_row.addWidget(btn_cancel)
        layout.addLayout(btn_row)

    def get_state(self) -> UIState:
        self._state.stop_services_on_exit = self.chk_stop_on_exit.isChecked()
        self._state.auto_refresh_logs = self.chk_auto_refresh_logs.isChecked()
        # Persist immediately
        try:
            save_ui_state(self._state)
        except Exception:
            pass
        return self._state
