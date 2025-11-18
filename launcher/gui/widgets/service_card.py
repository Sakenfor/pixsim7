from typing import Optional
from PySide6.QtWidgets import QFrame, QHBoxLayout, QVBoxLayout, QLabel, QPushButton, QMenu
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont, QAction
from datetime import datetime

try:
    from ..services import ServiceDef
    from ..status import HealthStatus, STATUS_COLORS, STATUS_TEXT
    from .. import theme
except ImportError:
    from services import ServiceDef
    from status import HealthStatus, STATUS_COLORS, STATUS_TEXT
    import theme


class ServiceCard(QFrame):
    clicked = Signal(str)
    restart_requested = Signal(str)

    def __init__(self, service_def: 'ServiceDef', service_process):
        super().__init__()
        self.service_def = service_def
        self.service_process = service_process
        self.is_selected = False
        self.start_time = None  # Track when service started

        self.setFrameShape(QFrame.StyledPanel)
        self.setFrameShadow(QFrame.Raised)
        self.setLineWidth(1)
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(48)
        self.setMaximumHeight(58)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_context_menu)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_SM, theme.SPACING_LG, theme.SPACING_SM)
        layout.setSpacing(theme.SPACING_LG)

        self.status_indicator = QLabel()
        self.status_indicator.setFixedSize(10, 10)
        self.status_indicator.setStyleSheet(f"""
            background-color: {STATUS_COLORS[self.service_process.health_status]};
            border-radius: 5px;
            border: none;
        """)
        layout.addWidget(self.status_indicator)

        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)

        self.title_label = QLabel(service_def.title)
        title_font = QFont(); title_font.setPointSize(9); title_font.setBold(True)
        self.title_label.setFont(title_font)
        self.title_label.setStyleSheet(f"color: {theme.TEXT_PRIMARY};")
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
        status_font = QFont(); status_font.setPointSize(7)
        self.status_label.setFont(status_font)
        self.status_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY};")
        info_layout.addWidget(self.status_label)

        layout.addLayout(info_layout, stretch=1)

        btn_layout = QHBoxLayout(); btn_layout.setSpacing(4)

        self.start_btn = QPushButton("Start")
        self.start_btn.setFixedSize(45, theme.BUTTON_HEIGHT_MD)
        self.start_btn.setToolTip("Start service")
        self.start_btn.setEnabled(not self.service_process.running and self.service_process.tool_available)
        self.start_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme.ACCENT_SUCCESS};
                color: white;
                font-size: {theme.FONT_SIZE_XS};
                font-weight: 600;
                border: none;
                border-radius: {theme.RADIUS_SM}px;
            }}
            QPushButton:hover {{
                background-color: #56d364;
            }}
            QPushButton:disabled {{
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_DISABLED};
            }}
        """)
        btn_layout.addWidget(self.start_btn)

        self.stop_btn = QPushButton("Stop")
        self.stop_btn.setFixedSize(45, theme.BUTTON_HEIGHT_MD)
        self.stop_btn.setToolTip("Stop service")
        self.stop_btn.setEnabled(self.service_process.running)
        self.stop_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme.ACCENT_ERROR};
                color: white;
                font-size: {theme.FONT_SIZE_XS};
                font-weight: 600;
                border: none;
                border-radius: {theme.RADIUS_SM}px;
            }}
            QPushButton:hover {{
                background-color: #ff6b6b;
            }}
            QPushButton:disabled {{
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_DISABLED};
            }}
        """)
        btn_layout.addWidget(self.stop_btn)

        self.restart_btn = QPushButton("Restart")
        self.restart_btn.setFixedSize(52, theme.BUTTON_HEIGHT_MD)
        self.restart_btn.setToolTip("Restart service")
        self.restart_btn.setEnabled(self.service_process.running)
        self.restart_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme.ACCENT_WARNING};
                color: white;
                font-size: {theme.FONT_SIZE_XS};
                font-weight: 600;
                border: none;
                border-radius: {theme.RADIUS_SM}px;
            }}
            QPushButton:hover {{
                background-color: #e8a730;
            }}
            QPushButton:disabled {{
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_DISABLED};
            }}
        """)
        btn_layout.addWidget(self.restart_btn)

        if service_def.url:
            self.open_btn = QPushButton("Open")
            self.open_btn.setFixedSize(42, theme.BUTTON_HEIGHT_MD)
            self.open_btn.setToolTip(f"Open {service_def.url}")
            self.open_btn.setStyleSheet(f"""
                QPushButton {{
                    background-color: {theme.ACCENT_PRIMARY};
                    color: white;
                    font-size: {theme.FONT_SIZE_XS};
                    font-weight: 600;
                    border: none;
                    border-radius: {theme.RADIUS_SM}px;
                }}
                QPushButton:hover {{
                    background-color: {theme.ACCENT_HOVER};
                }}
            """)
            btn_layout.addWidget(self.open_btn)
        else:
            self.open_btn = None

        layout.addLayout(btn_layout)
        self._update_style()

        # Connect restart button
        self.restart_btn.clicked.connect(lambda: self.restart_requested.emit(self.service_def.key))

    def mousePressEvent(self, event):  # type: ignore[override]
        if event.button() == Qt.LeftButton:
            self.clicked.emit(self.service_def.key)
        super().mousePressEvent(event)

    def _show_context_menu(self, position):
        """Show context menu with quick actions."""
        menu = QMenu(self)

        if self.service_process.running:
            restart_action = QAction("Restart Service", self)
            restart_action.triggered.connect(lambda: self.restart_requested.emit(self.service_def.key))
            menu.addAction(restart_action)

            stop_action = QAction("Stop Service", self)
            stop_action.triggered.connect(self.stop_btn.click)
            menu.addAction(stop_action)
        else:
            start_action = QAction("Start Service", self)
            start_action.triggered.connect(self.start_btn.click)
            start_action.setEnabled(self.service_process.tool_available)
            menu.addAction(start_action)

        if self.service_def.url:
            menu.addSeparator()
            open_action = QAction(f"Open {self.service_def.url}", self)
            open_action.triggered.connect(self.open_btn.click if self.open_btn else lambda: None)
            menu.addAction(open_action)

        menu.addSeparator()
        select_action = QAction("Select & View Logs", self)
        select_action.triggered.connect(lambda: self.clicked.emit(self.service_def.key))
        menu.addAction(select_action)

        menu.exec_(self.mapToGlobal(position))

    def set_selected(self, selected: bool):
        self.is_selected = selected
        self._update_style()

    def update_status(self, status: HealthStatus):
        old_running = self.service_process.running
        self.service_process.health_status = status

        # Track start time
        if self.service_process.running and not old_running:
            self.start_time = datetime.now()
        elif not self.service_process.running and old_running:
            self.start_time = None

        self.status_indicator.setStyleSheet(f"""
            background-color: {STATUS_COLORS[status]};
            border-radius: 5px;
            border: none;
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

        # Add uptime if running
        if self.service_process.running and self.start_time:
            uptime = datetime.now() - self.start_time
            hours = int(uptime.total_seconds() // 3600)
            minutes = int((uptime.total_seconds() % 3600) // 60)
            if hours > 0:
                status_info += f" • Up {hours}h {minutes}m"
            elif minutes > 0:
                status_info += f" • Up {minutes}m"
            else:
                status_info += f" • Just started"

        if status == HealthStatus.UNHEALTHY and getattr(self.service_process, 'last_error_line', ''):
            err = self.service_process.last_error_line
            if len(err) > 80:
                err = err[:77] + '...'
            status_info += f" • {err}"
        self.status_label.setText(status_info)
        self.start_btn.setEnabled(not self.service_process.running and self.service_process.tool_available)
        self.stop_btn.setEnabled(self.service_process.running)
        self.restart_btn.setEnabled(self.service_process.running)

    def _update_style(self):
        if self.is_selected:
            self.setStyleSheet(f"""
                ServiceCard {{
                    background-color: {theme.BG_HOVER};
                    border: 1px solid {theme.ACCENT_PRIMARY};
                    border-radius: {theme.RADIUS_MD}px;
                }}
                QLabel {{ background: transparent; color: {theme.TEXT_PRIMARY}; }}
            """)
        else:
            self.setStyleSheet(f"""
                ServiceCard {{
                    background-color: {theme.BG_TERTIARY};
                    border: 1px solid {theme.BORDER_DEFAULT};
                    border-radius: {theme.RADIUS_MD}px;
                }}
                ServiceCard:hover {{
                    background-color: {theme.BG_HOVER};
                    border: 1px solid {theme.BORDER_FOCUS};
                }}
                QLabel {{ background: transparent; color: {theme.TEXT_PRIMARY}; }}
            """)
