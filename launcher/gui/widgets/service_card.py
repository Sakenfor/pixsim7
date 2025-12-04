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
    db_logs_requested = Signal(str)

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
        self.setMinimumHeight(54)
        self.setMaximumHeight(66)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_context_menu)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_MD, theme.SPACING_LG, theme.SPACING_MD)
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
        self.stop_btn.setToolTip("Stop service gracefully")
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

        self.force_stop_btn = QPushButton("⚠")
        self.force_stop_btn.setFixedSize(28, theme.BUTTON_HEIGHT_MD)
        self.force_stop_btn.setToolTip("Force stop service (kill all processes)")
        self.force_stop_btn.setEnabled(self.service_process.running)
        self.force_stop_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: #8b0000;
                color: white;
                font-size: {theme.FONT_SIZE_SM};
                font-weight: 700;
                border: none;
                border-radius: {theme.RADIUS_SM}px;
            }}
            QPushButton:hover {{
                background-color: #a00000;
            }}
            QPushButton:disabled {{
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_DISABLED};
            }}
        """)
        btn_layout.addWidget(self.force_stop_btn)

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

        # Quick pivot into DB logs for this service
        db_logs_action = QAction("View Database Logs", self)
        db_logs_action.triggered.connect(lambda: self.db_logs_requested.emit(self.service_def.key))
        menu.addAction(db_logs_action)

        menu.exec_(self.mapToGlobal(position))

    def set_selected(self, selected: bool):
        self.is_selected = selected
        self._update_style()

    def _refresh_title(self):
        """Update title label to reflect external management state."""
        base_title = self.service_def.title
        if getattr(self.service_process, "externally_managed", False):
            # Add a subtle visual marker for externally managed services
            title = f"◇ {base_title}"
            self.title_label.setToolTip(f"{base_title} (running outside launcher)")
        else:
            title = base_title
            self.title_label.setToolTip(base_title)
        self.title_label.setText(title)

    def update_status(self, status: HealthStatus):
        # Determine running state from health status
        # A service is "running" if it's STARTING, HEALTHY, or UNHEALTHY
        old_running = self.service_process.running
        is_running = status in (HealthStatus.STARTING, HealthStatus.HEALTHY, HealthStatus.UNHEALTHY)
        requested_running = getattr(self.service_process, "requested_running", None)

        self.service_process.health_status = status

        # Track start time
        if is_running and not old_running:
            self.start_time = datetime.now()
        elif not is_running and old_running:
            self.start_time = None

        self.status_indicator.setStyleSheet(f"""
            background-color: {STATUS_COLORS[status]};
            border-radius: 5px;
            border: none;
        """)
        status_info = STATUS_TEXT[status]
        # Indicate if service is running outside launcher control
        if getattr(self.service_process, "externally_managed", False):
            status_info += " (external)"
        if not self.service_process.tool_available:
            status_info = f"⚠ {self.service_process.tool_check_message}"
        elif self.service_def.url:
            try:
                port = self.service_def.url.split(':')[-1].split('/')[0]
                status_info += f" • Port {port}"
            except Exception:
                pass

        # Add PID if available
        pid = self.service_process.started_pid or self.service_process.detected_pid
        if pid:
            status_info += f" • PID {pid}"

        # Add uptime if running
        if is_running and self.start_time:
            uptime = datetime.now() - self.start_time
            hours = int(uptime.total_seconds() // 3600)
            minutes = int((uptime.total_seconds() % 3600) // 60)
            if hours > 0:
                status_info += f" • Up {hours}h {minutes}m"
            elif minutes > 0:
                status_info += f" • Up {minutes}m"
            else:
                status_info += f" • Just started"

        # Show intent vs actual state when interesting
        if requested_running is True and not is_running:
            status_info += " • Start requested"
        elif requested_running is False and is_running and getattr(self.service_process, "externally_managed", False):
            status_info += " • Stop requested"

        if status == HealthStatus.UNHEALTHY and getattr(self.service_process, 'last_error_line', ''):
            err = self.service_process.last_error_line
            if len(err) > 80:
                err = err[:77] + '...'
            status_info += f" • {err}"
        self.status_label.setText(status_info)

        # Build a helpful tooltip with error + recent logs
        tooltip_lines = [self.service_def.title]
        if self.service_process.tool_available is False:
            tooltip_lines.append(f"Tool: {self.service_process.tool_check_message}")
        if getattr(self.service_process, 'last_error_line', ''):
            tooltip_lines.append(f"Last error: {self.service_process.last_error_line}")
        buf = getattr(self.service_process, "log_buffer", None)
        if buf:
            recent = [str(l) for l in buf[-2:] if str(l).strip()]
            if recent:
                tooltip_lines.append("Recent log lines:")
                tooltip_lines.extend(recent)
        self.setToolTip("\n".join(tooltip_lines))
        # Keep title in sync with external flag
        self._refresh_title()
        # Update button states based on the new running state
        self.start_btn.setEnabled(not is_running and self.service_process.tool_available)
        self.stop_btn.setEnabled(is_running)
        self.force_stop_btn.setEnabled(is_running)
        self.restart_btn.setEnabled(is_running)
        # Update card style based on health state
        self._update_style()

    def _update_style(self):
        # Determine if service is in an unhealthy state
        is_unhealthy = self.service_process.health_status == HealthStatus.UNHEALTHY
        is_external = getattr(self.service_process, "externally_managed", False)

        if self.is_selected:
            border_color = theme.ACCENT_ERROR if is_unhealthy else theme.ACCENT_PRIMARY
            bg_color = "rgba(248, 81, 73, 0.08)" if is_unhealthy else theme.BG_HOVER
            self.setStyleSheet(f"""
                ServiceCard {{
                    background-color: {bg_color};
                    border: 1px solid {border_color};
                    border-radius: {theme.RADIUS_MD}px;
                }}
                QLabel {{ background: transparent; color: {theme.TEXT_PRIMARY}; }}
            """)
        else:
            # Normal (unselected) state
            if is_unhealthy:
                # Stronger visual for unhealthy services
                self.setStyleSheet(f"""
                    ServiceCard {{
                        background-color: rgba(248, 81, 73, 0.06);
                        border: 1px solid {theme.ACCENT_ERROR};
                        border-radius: {theme.RADIUS_MD}px;
                    }}
                    ServiceCard:hover {{
                        background-color: rgba(248, 81, 73, 0.12);
                        border: 1px solid {theme.ACCENT_ERROR};
                    }}
                    QLabel {{ background: transparent; color: {theme.TEXT_PRIMARY}; }}
                """)
            elif is_external:
                # Subtle indicator for externally managed services
                self.setStyleSheet(f"""
                    ServiceCard {{
                        background-color: {theme.BG_TERTIARY};
                        border: 1px solid {theme.BORDER_DEFAULT};
                        border-left: 3px solid {theme.ACCENT_INFO};
                        border-radius: {theme.RADIUS_MD}px;
                    }}
                    ServiceCard:hover {{
                        background-color: {theme.BG_HOVER};
                        border: 1px solid {theme.BORDER_FOCUS};
                        border-left: 3px solid {theme.ACCENT_INFO};
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
