from typing import Optional
from PySide6.QtWidgets import QFrame, QHBoxLayout, QVBoxLayout, QLabel, QPushButton, QMenu, QSizePolicy, QToolButton
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont, QAction
from datetime import datetime

try:
    from ..services import ServiceDef
    from ..status import HealthStatus, STATUS_COLORS, STATUS_TEXT
    from ..openapi_checker import OpenAPIStatus
    from .. import theme
except ImportError:
    from services import ServiceDef
    from status import HealthStatus, STATUS_COLORS, STATUS_TEXT
    from openapi_checker import OpenAPIStatus
    import theme


# OpenAPI status colors and tooltips
OPENAPI_STATUS_COLORS = {
    OpenAPIStatus.FRESH: "#3fb950",       # Green
    OpenAPIStatus.STALE: "#d29922",       # Yellow/Orange
    OpenAPIStatus.UNAVAILABLE: "#8b949e", # Gray
    OpenAPIStatus.NO_OPENAPI: None,       # Hidden
}

OPENAPI_STATUS_TEXT = {
    OpenAPIStatus.FRESH: "API Types Fresh",
    OpenAPIStatus.STALE: "API Types Stale",
    OpenAPIStatus.UNAVAILABLE: "? API Types Unknown",
    OpenAPIStatus.NO_OPENAPI: "",
}


class ServiceCard(QFrame):
    clicked = Signal(str)
    restart_requested = Signal(str)
    db_logs_requested = Signal(str)
    account_live_feed_requested = Signal(str)
    openapi_refresh_requested = Signal(str)  # Request to refresh OpenAPI status
    openapi_generate_requested = Signal(str)  # Request to generate OpenAPI types

    def __init__(self, service_def: 'ServiceDef', service_process):
        super().__init__()
        self.service_def = service_def
        self.service_process = service_process
        self.is_selected = False
        self.is_expanded = False
        self.start_time = None  # Track when service started
        self.openapi_status: Optional[OpenAPIStatus] = None  # Track OpenAPI freshness

        self.setFrameShape(QFrame.StyledPanel)
        self.setFrameShadow(QFrame.Raised)
        self.setLineWidth(1)
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(54)
        self.setMaximumHeight(16777215)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_context_menu)

        root_layout = QVBoxLayout(self)
        root_layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_MD, theme.SPACING_LG, theme.SPACING_MD)
        root_layout.setSpacing(6)

        layout = QHBoxLayout()
        layout.setSpacing(theme.SPACING_LG)
        root_layout.addLayout(layout)

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
        self.title_label.setMinimumWidth(60)
        info_layout.addWidget(self.title_label)

        status_info = STATUS_TEXT[self.service_process.health_status]
        if not self.service_process.tool_available:
            status_info = f"Warn: {self.service_process.tool_check_message}"
        elif service_def.url:
            try:
                port = service_def.url.split(':')[-1].split('/')[0]
                status_info += f" | Port {port}"
            except Exception:
                pass
        self.status_label = QLabel(status_info)
        status_font = QFont(); status_font.setPointSize(7)
        self.status_label.setFont(status_font)
        self.status_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY};")
        self.status_label.setMinimumWidth(40)
        info_layout.addWidget(self.status_label)

        layout.addLayout(info_layout, stretch=1)

        self.expand_btn = QToolButton()
        self.expand_btn.setText("+")
        self.expand_btn.setToolTip("Show details")
        self.expand_btn.setCursor(Qt.PointingHandCursor)
        self.expand_btn.setFixedSize(20, 20)
        self.expand_btn.setStyleSheet(f"""
            QToolButton {{
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_SM}px;
                font-weight: 700;
            }}
            QToolButton:hover {{
                background-color: {theme.BG_HOVER};
                color: {theme.TEXT_PRIMARY};
                border-color: {theme.BORDER_FOCUS};
            }}
        """)
        self.expand_btn.clicked.connect(self._toggle_details)
        layout.addWidget(self.expand_btn)

        # OpenAPI status indicator (only shown for services with openapi_url)
        self.openapi_indicator = QPushButton()
        self.openapi_indicator.setFixedHeight(18)
        self.openapi_indicator.setFixedWidth(42)
        openapi_font = QFont(); openapi_font.setPointSize(7); openapi_font.setBold(True)
        self.openapi_indicator.setFont(openapi_font)
        self.openapi_indicator.setCursor(Qt.PointingHandCursor)
        # Hide by default - only show if service has OpenAPI
        if service_def.openapi_url:
            self.openapi_indicator.setText("? API")
            self.openapi_indicator.setStyleSheet(f"""
                QPushButton {{
                    background-color: {theme.BG_SECONDARY};
                    color: {theme.TEXT_DISABLED};
                    border-radius: 3px;
                    padding: 1px 4px;
                    border: none;
                }}
                QPushButton:hover {{
                    background-color: {theme.BG_HOVER};
                }}
            """)
            self.openapi_indicator.setToolTip("OpenAPI types status unknown - click for options")
            self.openapi_indicator.clicked.connect(self._show_openapi_menu)
        else:
            self.openapi_indicator.hide()
        layout.addWidget(self.openapi_indicator)

        btn_layout = QHBoxLayout(); btn_layout.setSpacing(4)

        # Helper to create flexible buttons
        def make_btn(text, min_width, tooltip, bg_color, hover_color, stretch=1):
            btn = QPushButton(text)
            btn.setMinimumWidth(min_width)
            btn.setFixedHeight(theme.BUTTON_HEIGHT_MD)
            btn.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
            btn.setToolTip(tooltip)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background-color: {bg_color};
                    color: white;
                    font-size: {theme.FONT_SIZE_XS};
                    font-weight: 600;
                    border: none;
                    border-radius: {theme.RADIUS_SM}px;
                }}
                QPushButton:hover {{
                    background-color: {hover_color};
                }}
                QPushButton:disabled {{
                    background-color: {theme.BG_SECONDARY};
                    color: {theme.TEXT_DISABLED};
                }}
            """)
            return btn

        self.start_btn = make_btn("Start", 36, "Start service", theme.ACCENT_SUCCESS, "#56d364")
        self.start_btn.setEnabled(not self.service_process.running and self.service_process.tool_available)
        btn_layout.addWidget(self.start_btn, stretch=1)

        self.stop_btn = make_btn("Stop", 36, "Stop service gracefully", theme.ACCENT_ERROR, "#ff6b6b")
        self.stop_btn.setEnabled(self.service_process.running)
        btn_layout.addWidget(self.stop_btn, stretch=1)

        self.force_stop_btn = QPushButton("!")
        self.force_stop_btn.setFixedSize(24, theme.BUTTON_HEIGHT_MD)
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

        self.restart_btn = make_btn("Restart", 52, "Restart service", theme.ACCENT_WARNING, "#e8a730")
        self.restart_btn.setEnabled(self.service_process.running)
        btn_layout.addWidget(self.restart_btn, stretch=1)

        if service_def.url:
            self.open_btn = make_btn("Open", 38, f"Open {service_def.url}", theme.ACCENT_PRIMARY, theme.ACCENT_HOVER)
            btn_layout.addWidget(self.open_btn)
        else:
            self.open_btn = None

        layout.addLayout(btn_layout)

        self.details_frame = QFrame()
        self.details_frame.setVisible(False)
        self.details_frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme.BG_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_SM}px;
            }}
        """)
        details_layout = QVBoxLayout(self.details_frame)
        details_layout.setContentsMargins(8, 6, 8, 6)
        details_layout.setSpacing(2)
        self.details_label = QLabel("")
        self.details_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: {theme.FONT_SIZE_XS};")
        self.details_label.setWordWrap(True)
        self.details_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        details_layout.addWidget(self.details_label)
        root_layout.addWidget(self.details_frame)

        self._refresh_details_panel()
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

        if self.service_def.key == "worker":
            live_feed_action = QAction("Open Account Live Feed", self)
            live_feed_action.triggered.connect(lambda: self.account_live_feed_requested.emit(self.service_def.key))
            menu.addAction(live_feed_action)

        menu.exec_(self.mapToGlobal(position))

    def set_selected(self, selected: bool):
        self.is_selected = selected
        self._update_style()

    def _show_openapi_menu(self):
        """Show context menu for OpenAPI actions."""
        menu = QMenu(self)

        # Status info (non-clickable header)
        status_text = OPENAPI_STATUS_TEXT.get(self.openapi_status, "Status unknown")
        status_action = QAction(status_text, self)
        status_action.setEnabled(False)
        menu.addAction(status_action)
        menu.addSeparator()

        # Refresh status
        refresh_action = QAction("Refresh Status", self)
        refresh_action.triggered.connect(lambda: self.openapi_refresh_requested.emit(self.service_def.key))
        menu.addAction(refresh_action)

        # Generate types
        generate_action = QAction("Generate Types", self)
        generate_action.setToolTip("Run pnpm openapi:gen to regenerate TypeScript types")
        generate_action.triggered.connect(lambda: self.openapi_generate_requested.emit(self.service_def.key))
        menu.addAction(generate_action)

        menu.addSeparator()

        # Open OpenAPI Tools dialog
        tools_action = QAction("OpenAPI Tools...", self)
        tools_action.triggered.connect(self._open_openapi_tools)
        menu.addAction(tools_action)

        # Show menu at button position
        menu.exec_(self.openapi_indicator.mapToGlobal(self.openapi_indicator.rect().bottomLeft()))

    def _open_openapi_tools(self):
        """Open the OpenAPI Tools dialog for this service."""
        try:
            from ..dialogs.openapi_tools_dialog import show_openapi_tools_dialog
        except ImportError:
            from dialogs.openapi_tools_dialog import show_openapi_tools_dialog
        # Pass service-specific OpenAPI settings
        show_openapi_tools_dialog(
            self.window(),
            openapi_url=self.service_def.openapi_url,
            types_path=self.service_def.openapi_types_path,
            service_name=self.service_def.title
        )

    def update_openapi_status(self, status: OpenAPIStatus):
        """Update the OpenAPI freshness indicator."""
        if not self.service_def.openapi_url:
            return

        self.openapi_status = status
        color = OPENAPI_STATUS_COLORS.get(status)
        text = OPENAPI_STATUS_TEXT.get(status, "")

        if color:
            self.openapi_indicator.show()
            if status == OpenAPIStatus.FRESH:
                self.openapi_indicator.setText("OK API")
                self.openapi_indicator.setStyleSheet(f"""
                    QPushButton {{
                        background-color: rgba(63, 185, 80, 0.2);
                        color: {color};
                        border-radius: 3px;
                        padding: 1px 4px;
                        border: none;
                    }}
                    QPushButton:hover {{
                        background-color: rgba(63, 185, 80, 0.3);
                    }}
                """)
            elif status == OpenAPIStatus.STALE:
                self.openapi_indicator.setText("STALE")
                self.openapi_indicator.setStyleSheet(f"""
                    QPushButton {{
                        background-color: rgba(210, 153, 34, 0.2);
                        color: {color};
                        border-radius: 3px;
                        padding: 1px 4px;
                        border: none;
                    }}
                    QPushButton:hover {{
                        background-color: rgba(210, 153, 34, 0.3);
                    }}
                """)
            else:  # UNAVAILABLE
                self.openapi_indicator.setText("? API")
                self.openapi_indicator.setStyleSheet(f"""
                    QPushButton {{
                        background-color: {theme.BG_SECONDARY};
                        color: {color};
                        border-radius: 3px;
                        padding: 1px 4px;
                        border: none;
                    }}
                    QPushButton:hover {{
                        background-color: {theme.BG_HOVER};
                    }}
                """)
            self.openapi_indicator.setToolTip(f"{text} - click for options")
        else:
            self.openapi_indicator.hide()

    def _refresh_title(self):
        """Update title label to reflect external management state."""
        base_title = self.service_def.title
        if getattr(self.service_process, "externally_managed", False):
            self.title_label.setToolTip(f"{base_title} (running outside launcher)")
        else:
            self.title_label.setToolTip(base_title)
        self.title_label.setText(base_title)

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
            status_info = f"Warn: {self.service_process.tool_check_message}"
        elif self.service_def.url:
            try:
                port = self.service_def.url.split(':')[-1].split('/')[0]
                status_info += f" | Port {port}"
            except Exception:
                pass

        # Add PID if available (prefer started > detected > persisted)
        pid = self.service_process.get_effective_pid()
        if pid:
            status_info += f" | PID {pid}"

        # Add uptime if running
        if is_running and self.start_time:
            uptime = datetime.now() - self.start_time
            hours = int(uptime.total_seconds() // 3600)
            minutes = int((uptime.total_seconds() % 3600) // 60)
            if hours > 0:
                status_info += f" | Up {hours}h {minutes}m"
            elif minutes > 0:
                status_info += f" | Up {minutes}m"
            else:
                status_info += f" | Just started"

        # Show intent vs actual state when interesting
        if requested_running is True and not is_running:
            status_info += " | Start requested"
        elif requested_running is False and is_running and getattr(self.service_process, "externally_managed", False):
            status_info += " | Stop requested"

        if status == HealthStatus.UNHEALTHY and getattr(self.service_process, 'last_error_line', ''):
            err = self.service_process.last_error_line
            if len(err) > 80:
                err = err[:77] + '...'
            status_info += f" | {err}"
        self.status_label.setText(status_info)
        self._refresh_details_panel()

        # Build a helpful tooltip with error + recent logs
        tooltip_lines = [self.service_def.title]
        if self.service_process.tool_available is False:
            tooltip_lines.append(f"Tool: {self.service_process.tool_check_message}")
        if getattr(self.service_process, 'last_error_line', ''):
            tooltip_lines.append(f"Last error: {self.service_process.last_error_line}")
        try:
            buf = getattr(self.service_process, "log_buffer", None)
            if buf:
                n = len(buf)
                recent = [str(buf[n - 1 - i]) for i in range(min(2, n)) if str(buf[n - 1 - i]).strip()]
                if recent:
                    tooltip_lines.append("Recent log lines:")
                    tooltip_lines.extend(recent)
        except (IndexError, RuntimeError):
            pass  # deque may be mutated concurrently; skip tooltip lines
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

    def _toggle_details(self):
        if not self._has_card_details():
            self.is_expanded = False
            self.details_frame.setVisible(False)
            self.expand_btn.setText("+")
            return
        self.is_expanded = not self.is_expanded
        self._refresh_details_panel()

    def _has_card_details(self) -> bool:
        details = getattr(self.service_process, "card_details", None)
        return isinstance(details, dict) and bool(details)

    def _format_card_details(self) -> str:
        details = getattr(self.service_process, "card_details", None) or {}
        if not isinstance(details, dict):
            return ""

        preferred_order = [
            "main_worker_running",
            "main_worker_pid",
            "retry_worker_running",
            "retry_worker_pids",
            "redis_endpoint",
            "redis_reachable",
            "queue_pending_fresh",
            "queue_pending_retry",
            "queue_in_progress",
            "queue_pending_legacy_default",
            "details_updated_at",
            "note",
        ]
        ordered_keys = [k for k in preferred_order if k in details]
        ordered_keys.extend(k for k in details.keys() if k not in ordered_keys)

        label_map = {
            "main_worker_running": "Main Worker",
            "main_worker_pid": "Main PID",
            "retry_worker_running": "Retry Worker",
            "retry_worker_pids": "Retry PIDs",
            "redis_endpoint": "Redis",
            "redis_reachable": "Redis Reachable",
            "queue_pending_fresh": "Fresh Queue",
            "queue_pending_retry": "Retry Queue",
            "queue_in_progress": "In Progress",
            "queue_pending_legacy_default": "Legacy Queue",
            "details_updated_at": "Updated",
            "note": "Note",
        }

        lines = []
        for key in ordered_keys:
            value = details.get(key)
            if value is None:
                continue
            if isinstance(value, bool):
                value_str = "yes" if value else "no"
            elif isinstance(value, (list, tuple)):
                value_str = ", ".join(str(v) for v in value) if value else "-"
            else:
                value_str = str(value)
            lines.append(f"{label_map.get(key, key)}: {value_str}")
        return "\n".join(lines)

    def _refresh_details_panel(self):
        has_details = self._has_card_details()
        self.expand_btn.setVisible(has_details)
        if not has_details:
            self.is_expanded = False
            self.expand_btn.setText("+")
            self.expand_btn.setToolTip("No additional details")
            self.details_frame.setVisible(False)
            self.details_label.setText("")
            return

        self.details_label.setText(self._format_card_details())
        self.expand_btn.setToolTip("Hide details" if self.is_expanded else "Show details")
        self.expand_btn.setText("-" if self.is_expanded else "+")
        self.details_frame.setVisible(self.is_expanded)

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
