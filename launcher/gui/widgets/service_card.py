"""Service card widget — pure view driven by ServiceCardState snapshots.

The card never reads from or writes to a ServiceProcess.  The launcher
builds a ``ServiceCardState`` and passes it via ``apply_state()``.
Only widgets whose backing data actually changed are touched, avoiding
unnecessary stylesheet re-parsing and Qt layout invalidation.
"""
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
    from .service_card_state import ServiceCardState
except ImportError:
    from services import ServiceDef
    from status import HealthStatus, STATUS_COLORS, STATUS_TEXT
    from openapi_checker import OpenAPIStatus
    import theme
    from service_card_state import ServiceCardState


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

# Pre-built card stylesheet templates (built once, formatted per-call)
_CARD_STYLES: dict[str, str] = {}


def _get_card_style(style_key: str) -> str:
    """Return cached stylesheet for the given style_key."""
    cached = _CARD_STYLES.get(style_key)
    if cached is not None:
        return cached

    if style_key == "selected_unhealthy":
        css = f"""
            ServiceCard {{
                background-color: rgba(248, 81, 73, 0.08);
                border: 1px solid {theme.ACCENT_ERROR};
                border-radius: {theme.RADIUS_MD}px;
            }}
            QLabel {{ background: transparent; color: {theme.TEXT_PRIMARY}; }}
        """
    elif style_key == "selected_normal":
        css = f"""
            ServiceCard {{
                background-color: {theme.BG_HOVER};
                border: 1px solid {theme.ACCENT_PRIMARY};
                border-radius: {theme.RADIUS_MD}px;
            }}
            QLabel {{ background: transparent; color: {theme.TEXT_PRIMARY}; }}
        """
    elif style_key == "unhealthy":
        css = f"""
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
        """
    elif style_key == "external":
        css = f"""
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
        """
    else:  # "normal"
        css = f"""
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
        """
    _CARD_STYLES[style_key] = css
    return css


# ── Details formatting (pure function, no ServiceProcess dependency) ──

_DETAILS_PREFERRED_ORDER = [
    "main_worker_running",
    "main_worker_pid",
    "retry_worker_running",
    "retry_worker_pids",
    "simulation_worker_running",
    "simulation_worker_pids",
    "redis_endpoint",
    "redis_reachable",
    "queue_pending_fresh",
    "queue_pending_retry",
    "queue_pending_simulation",
    "queue_in_progress",
    "queue_pending_legacy_default",
    "companion_worker_pids_unknown",
    "details_updated_at",
    "note",
]

_DETAILS_LABEL_MAP = {
    "main_worker_running": "Main Worker",
    "main_worker_pid": "Main PID",
    "retry_worker_running": "Retry Worker",
    "retry_worker_pids": "Retry PIDs",
    "simulation_worker_running": "Simulation Worker",
    "simulation_worker_pids": "Simulation PIDs",
    "redis_endpoint": "Redis",
    "redis_reachable": "Redis Reachable",
    "queue_pending_fresh": "Fresh Queue",
    "queue_pending_retry": "Retry Queue",
    "queue_pending_simulation": "Simulation Queue",
    "queue_in_progress": "In Progress",
    "queue_pending_legacy_default": "Legacy Queue",
    "companion_worker_pids_unknown": "Unknown Companion PIDs",
    "details_updated_at": "Updated",
    "note": "Note",
}


def _format_card_details(details: Optional[dict]) -> str:
    if not isinstance(details, dict) or not details:
        return ""
    ordered_keys = [k for k in _DETAILS_PREFERRED_ORDER if k in details]
    ordered_keys.extend(k for k in details.keys() if k not in ordered_keys)

    lines: list[str] = []
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
        lines.append(f"{_DETAILS_LABEL_MAP.get(key, key)}: {value_str}")
    return "\n".join(lines)


class ServiceCard(QFrame):
    clicked = Signal(str)
    restart_requested = Signal(str)
    db_logs_requested = Signal(str)
    account_live_feed_requested = Signal(str)
    openapi_refresh_requested = Signal(str)
    openapi_generate_requested = Signal(str)

    def __init__(self, service_def: 'ServiceDef', initial_state: ServiceCardState):
        super().__init__()
        self.service_def = service_def
        self.is_selected = False
        self.is_expanded = False
        self.start_time: Optional[datetime] = None
        self.openapi_status: Optional[OpenAPIStatus] = None

        # Cached state for diffing — will be set at end of __init__
        self._state: Optional[ServiceCardState] = None
        # Cached style key to avoid redundant setStyleSheet calls
        self._applied_style_key: Optional[str] = None

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
        layout.addWidget(self.status_indicator)

        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)

        self.title_label = QLabel(service_def.title)
        title_font = QFont(); title_font.setPointSize(9); title_font.setBold(True)
        self.title_label.setFont(title_font)
        self.title_label.setStyleSheet(f"color: {theme.TEXT_PRIMARY};")
        self.title_label.setMinimumWidth(60)
        info_layout.addWidget(self.title_label)

        self.status_label = QLabel("")
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

        def make_btn(text, min_width, tooltip, bg_color, hover_color):
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
        btn_layout.addWidget(self.start_btn, stretch=1)

        self.stop_btn = make_btn("Stop", 36, "Stop service gracefully", theme.ACCENT_ERROR, "#ff6b6b")
        btn_layout.addWidget(self.stop_btn, stretch=1)

        self.force_stop_btn = QPushButton("!")
        self.force_stop_btn.setFixedSize(24, theme.BUTTON_HEIGHT_MD)
        self.force_stop_btn.setToolTip("Force stop service (kill all processes)")
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

        # Connect restart button
        self.restart_btn.clicked.connect(lambda: self.restart_requested.emit(self.service_def.key))

        # Apply initial state (forces full paint)
        self.apply_state(initial_state)

    # ── Public API ──────────────────────────────────────────────────────

    def apply_state(self, new: ServiceCardState):
        """Apply a new state snapshot, updating only widgets that changed."""
        old = self._state

        # Track start time across state transitions
        if old is not None:
            if new.is_running and not old.is_running:
                self.start_time = datetime.now()
            elif not new.is_running and old.is_running:
                self.start_time = None

        # Status indicator dot — only repaint when health changes
        if old is None or old.health_status != new.health_status:
            self.status_indicator.setStyleSheet(
                f"background-color: {STATUS_COLORS[new.health_status]};"
                f"border-radius: 5px; border: none;"
            )

        # Status text — rebuild only when relevant fields change
        if old is None or self._status_text_differs(old, new):
            self.status_label.setText(self._build_status_text(new))

        # Tooltip — rebuild only when relevant fields change
        if old is None or self._tooltip_differs(old, new):
            self.setToolTip(self._build_tooltip(new))

        # Title tooltip (external flag)
        if old is None or old.externally_managed != new.externally_managed:
            base = self.service_def.title
            if new.externally_managed:
                self.title_label.setToolTip(f"{base} (running outside launcher)")
            else:
                self.title_label.setToolTip(base)

        # Button states — only when running/stopping/tool changes
        if old is None or (
            old.is_running != new.is_running
            or old.stopping != new.stopping
            or old.tool_available != new.tool_available
        ):
            if new.stopping:
                self.start_btn.setEnabled(False)
                self.stop_btn.setEnabled(False)
                self.force_stop_btn.setEnabled(False)
                self.restart_btn.setEnabled(False)
            else:
                self.start_btn.setEnabled(not new.is_running and new.tool_available)
                self.stop_btn.setEnabled(new.is_running)
                self.force_stop_btn.setEnabled(new.is_running)
                self.restart_btn.setEnabled(new.is_running)

        # Details panel — only when card_details or expand state changes
        if old is None or old.card_details is not new.card_details:
            self._refresh_details_panel(new)

        # Card frame style — cached by style key
        self._apply_style_if_changed(new)

        self._state = new

    def set_selected(self, selected: bool):
        if self.is_selected == selected:
            return
        self.is_selected = selected
        if self._state is not None:
            self._apply_style_if_changed(self._state)

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

    # ── Backward-compat shims (will be removed once all callers migrate) ──

    def update_status(self, status: HealthStatus):
        """Legacy shim — prefer apply_state()."""
        if self._state is not None:
            # Patch health into a copy of current state
            from dataclasses import replace
            new = replace(self._state, health_status=status,
                          is_running=status in (HealthStatus.STARTING, HealthStatus.HEALTHY, HealthStatus.UNHEALTHY))
            self.apply_state(new)

    def set_stopping(self, stopping: bool):
        """Legacy shim — prefer apply_state()."""
        if self._state is not None:
            from dataclasses import replace
            new = replace(self._state, stopping=bool(stopping))
            self.apply_state(new)

    # ── Private helpers ─────────────────────────────────────────────────

    def _status_text_differs(self, old: ServiceCardState, new: ServiceCardState) -> bool:
        return (
            old.health_status != new.health_status
            or old.is_running != new.is_running
            or old.tool_available != new.tool_available
            or old.tool_check_message != new.tool_check_message
            or old.externally_managed != new.externally_managed
            or old.requested_running != new.requested_running
            or old.effective_pid != new.effective_pid
            or old.last_error_line != new.last_error_line
            or old.stopping != new.stopping
        )

    def _build_status_text(self, s: ServiceCardState) -> str:
        if not s.tool_available:
            return f"Warn: {s.tool_check_message}"

        info = STATUS_TEXT[s.health_status]
        if s.externally_managed:
            info += " (external)"
        if s.port:
            info += f" | Port {s.port}"
        if s.effective_pid:
            info += f" | PID {s.effective_pid}"

        # Uptime
        if s.is_running and self.start_time:
            uptime = datetime.now() - self.start_time
            hours = int(uptime.total_seconds() // 3600)
            minutes = int((uptime.total_seconds() % 3600) // 60)
            if hours > 0:
                info += f" | Up {hours}h {minutes}m"
            elif minutes > 0:
                info += f" | Up {minutes}m"
            else:
                info += " | Just started"

        # Intent vs actual
        if s.requested_running and not s.is_running:
            info += " | Start requested"
        elif not s.requested_running and s.is_running and s.externally_managed:
            info += " | Stop requested"

        if s.health_status == HealthStatus.UNHEALTHY and s.last_error_line:
            err = s.last_error_line
            if len(err) > 80:
                err = err[:77] + "..."
            info += f" | {err}"
        if s.stopping:
            info += " | Stopping..."
        return info

    def _tooltip_differs(self, old: ServiceCardState, new: ServiceCardState) -> bool:
        return (
            old.tool_available != new.tool_available
            or old.tool_check_message != new.tool_check_message
            or old.last_error_line != new.last_error_line
            or old.recent_log_lines != new.recent_log_lines
        )

    def _build_tooltip(self, s: ServiceCardState) -> str:
        lines = [self.service_def.title]
        if not s.tool_available:
            lines.append(f"Tool: {s.tool_check_message}")
        if s.last_error_line:
            lines.append(f"Last error: {s.last_error_line}")
        if s.recent_log_lines:
            lines.append("Recent log lines:")
            lines.extend(s.recent_log_lines)
        return "\n".join(lines)

    def _compute_style_key(self, s: ServiceCardState) -> str:
        if self.is_selected:
            return "selected_unhealthy" if s.health_class == "unhealthy" else "selected_normal"
        return s.health_class

    def _apply_style_if_changed(self, s: ServiceCardState):
        key = self._compute_style_key(s)
        if key != self._applied_style_key:
            self.setStyleSheet(_get_card_style(key))
            self._applied_style_key = key

    def _toggle_details(self):
        if self._state is None or not self._state.has_card_details:
            self.is_expanded = False
            self.details_frame.setVisible(False)
            self.expand_btn.setText("+")
            return
        self.is_expanded = not self.is_expanded
        self._refresh_details_panel(self._state)

    def _refresh_details_panel(self, s: ServiceCardState):
        has = s.has_card_details
        self.expand_btn.setVisible(has)
        if not has:
            self.is_expanded = False
            self.expand_btn.setText("+")
            self.expand_btn.setToolTip("No additional details")
            self.details_frame.setVisible(False)
            self.details_label.setText("")
            return

        self.details_label.setText(_format_card_details(s.card_details))
        self.expand_btn.setToolTip("Hide details" if self.is_expanded else "Show details")
        self.expand_btn.setText("-" if self.is_expanded else "+")
        self.details_frame.setVisible(self.is_expanded)

    def mousePressEvent(self, event):  # type: ignore[override]
        if event.button() == Qt.LeftButton:
            self.clicked.emit(self.service_def.key)
        super().mousePressEvent(event)

    def _show_context_menu(self, position):
        """Show context menu with quick actions."""
        menu = QMenu(self)
        s = self._state

        if s and s.is_running:
            restart_action = QAction("Restart Service", self)
            restart_action.triggered.connect(lambda: self.restart_requested.emit(self.service_def.key))
            menu.addAction(restart_action)

            stop_action = QAction("Stop Service", self)
            stop_action.triggered.connect(self.stop_btn.click)
            menu.addAction(stop_action)
        else:
            start_action = QAction("Start Service", self)
            start_action.triggered.connect(self.start_btn.click)
            start_action.setEnabled(s.tool_available if s else True)
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

        db_logs_action = QAction("View Database Logs", self)
        db_logs_action.triggered.connect(lambda: self.db_logs_requested.emit(self.service_def.key))
        menu.addAction(db_logs_action)

        if self.service_def.key == "worker":
            live_feed_action = QAction("Open Account Live Feed", self)
            live_feed_action.triggered.connect(lambda: self.account_live_feed_requested.emit(self.service_def.key))
            menu.addAction(live_feed_action)

        menu.exec_(self.mapToGlobal(position))

    def _show_openapi_menu(self):
        """Show context menu for OpenAPI actions."""
        menu = QMenu(self)

        status_text = OPENAPI_STATUS_TEXT.get(self.openapi_status, "Status unknown")
        status_action = QAction(status_text, self)
        status_action.setEnabled(False)
        menu.addAction(status_action)
        menu.addSeparator()

        refresh_action = QAction("Refresh Status", self)
        refresh_action.triggered.connect(lambda: self.openapi_refresh_requested.emit(self.service_def.key))
        menu.addAction(refresh_action)

        generate_action = QAction("Generate Types", self)
        generate_action.setToolTip("Run pnpm openapi:gen to regenerate TypeScript types")
        generate_action.triggered.connect(lambda: self.openapi_generate_requested.emit(self.service_def.key))
        menu.addAction(generate_action)

        menu.addSeparator()

        tools_action = QAction("OpenAPI Tools...", self)
        tools_action.triggered.connect(self._open_openapi_tools)
        menu.addAction(tools_action)

        menu.exec_(self.openapi_indicator.mapToGlobal(self.openapi_indicator.rect().bottomLeft()))

    def _open_openapi_tools(self):
        """Open the OpenAPI Tools dialog for this service."""
        try:
            from ..dialogs.openapi_tools_dialog import show_openapi_tools_dialog
        except ImportError:
            from dialogs.openapi_tools_dialog import show_openapi_tools_dialog
        show_openapi_tools_dialog(
            self.window(),
            openapi_url=self.service_def.openapi_url,
            types_path=self.service_def.openapi_types_path,
            service_name=self.service_def.title
        )
