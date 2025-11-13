from typing import Optional
from PySide6.QtWidgets import QFrame, QHBoxLayout, QVBoxLayout, QLabel, QPushButton
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont

try:
    from ..services import ServiceDef
    from ..status import HealthStatus, STATUS_COLORS, STATUS_TEXT
except ImportError:
    from services import ServiceDef
    from status import HealthStatus, STATUS_COLORS, STATUS_TEXT


class ServiceCard(QFrame):
    clicked = Signal(str)

    def __init__(self, service_def: 'ServiceDef', service_process):
        super().__init__()
        self.service_def = service_def
        self.service_process = service_process
        self.is_selected = False

        self.setFrameShape(QFrame.StyledPanel)
        self.setFrameShadow(QFrame.Raised)
        self.setLineWidth(2)
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(80)
        self.setMaximumHeight(100)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(12)

        self.status_indicator = QLabel()
        self.status_indicator.setFixedSize(16, 16)
        self.status_indicator.setStyleSheet(f"""
            background-color: {STATUS_COLORS[self.service_process.health_status]};
            border-radius: 8px;
            border: 2px solid #333;
        """)
        layout.addWidget(self.status_indicator)

        info_layout = QVBoxLayout()
        info_layout.setSpacing(4)

        self.title_label = QLabel(service_def.title)
        title_font = QFont(); title_font.setPointSize(11); title_font.setBold(True)
        self.title_label.setFont(title_font)
        self.title_label.setStyleSheet("color: #1a1a1a;")
        info_layout.addWidget(self.title_label)

        status_info = STATUS_TEXT[self.service_process.health_status]
        if not self.service_process.tool_available:
            status_info = f"⚠ {self.service_process.tool_check_message}"
        elif service_def.url:
            try:
                port = service_def.url.split(':')[-1].split('/')[0]
                status_info += f" • Port {port}"
            except Exception:
                pass
        self.status_label = QLabel(status_info)
        status_font = QFont(); status_font.setPointSize(9)
        self.status_label.setFont(status_font)
        self.status_label.setStyleSheet("color: #555;")
        info_layout.addWidget(self.status_label)

        layout.addLayout(info_layout, stretch=1)

        btn_layout = QHBoxLayout(); btn_layout.setSpacing(6)

        self.start_btn = QPushButton("Start"); self.start_btn.setFixedSize(60, 28)
        self.start_btn.setEnabled(not self.service_process.running and self.service_process.tool_available)
        btn_layout.addWidget(self.start_btn)

        self.stop_btn = QPushButton("Stop"); self.stop_btn.setFixedSize(60, 28)
        self.stop_btn.setEnabled(self.service_process.running)
        btn_layout.addWidget(self.stop_btn)

        if service_def.url:
            self.open_btn = QPushButton("Open"); self.open_btn.setFixedSize(60, 28)
            btn_layout.addWidget(self.open_btn)
        else:
            self.open_btn = None

        layout.addLayout(btn_layout)
        self._update_style()

    def mousePressEvent(self, event):  # type: ignore[override]
        if event.button() == Qt.LeftButton:
            self.clicked.emit(self.service_def.key)
        super().mousePressEvent(event)

    def set_selected(self, selected: bool):
        self.is_selected = selected
        self._update_style()

    def update_status(self, status: HealthStatus):
        self.service_process.health_status = status
        self.status_indicator.setStyleSheet(f"""
            background-color: {STATUS_COLORS[status]};
            border-radius: 8px;
            border: 2px solid #333;
        """)
        status_info = STATUS_TEXT[status]
        if not self.service_process.tool_available:
            status_info = f"⚠ {self.service_process.tool_check_message}"
        elif self.service_def.url:
            try:
                port = self.service_def.url.split(':')[-1].split('/')[0]
                status_info += f" • Port {port}"
            except Exception:
                pass
        if status == HealthStatus.UNHEALTHY and getattr(self.service_process, 'last_error_line', ''):
            err = self.service_process.last_error_line
            if len(err) > 80:
                err = err[:77] + '...'
            status_info += f" • {err}"
        self.status_label.setText(status_info)
        self.start_btn.setEnabled(not self.service_process.running and self.service_process.tool_available)
        self.stop_btn.setEnabled(self.service_process.running)

    def _update_style(self):
        if self.is_selected:
            self.setStyleSheet("""
                ServiceCard {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                                stop:0 #e3f2fd, stop:1 #bbdefb);
                    border: 2px solid #1976D2;
                    border-radius: 8px;
                }
                QLabel { background: transparent; }
            """)
        else:
            self.setStyleSheet("""
                ServiceCard {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                                stop:0 #ffffff, stop:1 #f0f0f0);
                    border: 2px solid #ccc;
                    border-radius: 8px;
                }
                ServiceCard:hover {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                                stop:0 #f8f8f8, stop:1 #e8e8e8);
                    border: 2px solid #999;
                }
                QLabel { background: transparent; }
            """)
