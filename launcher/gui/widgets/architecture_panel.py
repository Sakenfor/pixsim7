"""
Backend Architecture Metrics Panel

Displays live backend architecture metrics in the launcher UI.
Queries the /dev/architecture/map endpoint to show:
- Total routes and plugins
- Service composition status
- Modernization progress
- Average module size
"""
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QGridLayout, QFrame, QTextEdit
)
from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QFont
from typing import Optional
import webbrowser

try:
    from ..service_discovery import ServiceDiscovery, ArchitectureMetrics
    from ..multi_service_discovery import MultiServiceDiscovery
    from .. import theme
except ImportError:
    from service_discovery import ServiceDiscovery, ArchitectureMetrics
    from multi_service_discovery import MultiServiceDiscovery
    import theme


class MetricCard(QFrame):
    """Single metric display card."""

    def __init__(self, icon: str, label: str, parent=None):
        super().__init__(parent)
        self.setFrameStyle(QFrame.StyledPanel | QFrame.Raised)
        self.setStyleSheet(theme.get_group_frame_stylesheet())

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(4)

        # Label header
        label_widget = QLabel(label)
        label_widget.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY};")
        layout.addWidget(label_widget)

        # Value
        self.value_label = QLabel("--")
        value_font = QFont()
        value_font.setPointSize(18)
        value_font.setBold(True)
        self.value_label.setFont(value_font)
        layout.addWidget(self.value_label)

        # Sublabel
        self.sublabel = QLabel("")
        self.sublabel.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY};")
        layout.addWidget(self.sublabel)

    def set_value(self, value: str):
        """Set the main value."""
        self.value_label.setText(value)

    def set_sublabel(self, text: str):
        """Set the sublabel text."""
        self.sublabel.setText(text)


class ArchitectureMetricsPanel(QWidget):
    """
    Panel displaying live backend architecture metrics.

    Queries /dev/architecture/map and displays:
    - Routes count
    - Services count with sub-services
    - Plugin modernization progress
    - Average module size
    """

    # Signal emitted when metrics are updated
    metrics_updated = Signal(ArchitectureMetrics)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.discovery: Optional[ServiceDiscovery] = None
        self.multi_discovery: Optional[MultiServiceDiscovery] = None
        self.auto_refresh_enabled = False  # Disabled by default to avoid UI freezing
        self.setup_ui()

        # Auto-refresh timer (every 30 seconds when enabled)
        self.refresh_timer = QTimer(self)
        self.refresh_timer.timeout.connect(self.refresh_metrics)
        self.refresh_timer.setInterval(30000)  # 30 seconds (was 10s)

    def setup_ui(self):
        """Set up the UI layout."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        # Metrics grid
        metrics_grid = QGridLayout()
        metrics_grid.setSpacing(8)

        # Create metric cards
        self.routes_card = MetricCard("", "Routes")
        self.services_card = MetricCard("", "Services")
        self.plugins_card = MetricCard("", "Modernized")
        self.module_size_card = MetricCard("", "Avg Module")

        metrics_grid.addWidget(self.routes_card, 0, 0)
        metrics_grid.addWidget(self.services_card, 0, 1)
        metrics_grid.addWidget(self.plugins_card, 1, 0)
        metrics_grid.addWidget(self.module_size_card, 1, 1)

        layout.addLayout(metrics_grid)

        # Status label
        self.status_label = QLabel("Not connected")
        self.status_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        self.status_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.status_label)

        # Buttons
        button_layout = QHBoxLayout()
        button_layout.setSpacing(8)

        self.refresh_btn = QPushButton("Refresh")
        self.refresh_btn.clicked.connect(self.refresh_metrics)
        self.refresh_btn.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        button_layout.addWidget(self.refresh_btn)

        self.auto_refresh_btn = QPushButton("Auto: OFF")
        self.auto_refresh_btn.clicked.connect(self.toggle_auto_refresh)
        self.auto_refresh_btn.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.auto_refresh_btn.setCheckable(True)
        self.auto_refresh_btn.setToolTip("Toggle automatic refresh every 30 seconds")
        button_layout.addWidget(self.auto_refresh_btn)

        self.app_map_btn = QPushButton("Open App Map")
        self.app_map_btn.clicked.connect(self.open_app_map)
        self.app_map_btn.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
        self.app_map_btn.setEnabled(False)
        button_layout.addWidget(self.app_map_btn)

        button_layout.addStretch()

        layout.addLayout(button_layout)

        # Initially show disconnected state
        self.set_disconnected_state()

    def set_discovery(self, discovery: ServiceDiscovery):
        """Set the service discovery instance and fetch initial data."""
        self.discovery = discovery
        self.multi_discovery = None

        # Defer initial discovery to avoid blocking UI during startup
        # Use QTimer.singleShot to run after event loop starts
        QTimer.singleShot(100, self.refresh_metrics)

        # Start auto-refresh timer
        if self.auto_refresh_enabled:
            self.refresh_timer.start()

    def set_multi_discovery(self, multi_discovery: MultiServiceDiscovery):
        """Set the multi-service discovery instance and fetch initial data."""
        self.multi_discovery = multi_discovery
        self.discovery = None

        # Defer initial discovery to avoid blocking UI during startup
        # Use QTimer.singleShot to run after event loop starts
        QTimer.singleShot(100, self.refresh_metrics)

        # Start auto-refresh timer
        if self.auto_refresh_enabled:
            self.refresh_timer.start()

    def refresh_metrics(self):
        """Refresh architecture metrics from backend."""
        if self.multi_discovery:
            # Multi-service discovery
            results = self.multi_discovery.discover_all_services()
            discovered_count = self.multi_discovery.get_discovered_count()
            total_count = self.multi_discovery.get_total_configured()

            if discovered_count > 0:
                metrics = self.multi_discovery.get_combined_metrics()
                self.update_metrics(metrics)
                self.status_label.setText(f"✓ {discovered_count}/{total_count} services discovered")
                self.status_label.setStyleSheet("color: #4CAF50; font-size: 10px;")
                self.app_map_btn.setEnabled(True)
                self.metrics_updated.emit(metrics)
            else:
                self.set_disconnected_state()
                self.status_label.setText(f"✗ No services available ({total_count} configured)")
                self.status_label.setStyleSheet("color: #F44336; font-size: 10px;")
                self.app_map_btn.setEnabled(False)

        elif self.discovery:
            # Single service discovery
            success = self.discovery.discover_architecture()

            if success:
                metrics = self.discovery.get_metrics()
                self.update_metrics(metrics)
                self.status_label.setText("✓ Connected")
                self.status_label.setStyleSheet("color: #4CAF50; font-size: 10px;")
                self.app_map_btn.setEnabled(True)
                self.metrics_updated.emit(metrics)
            else:
                self.set_disconnected_state()
                error = self.discovery.last_fetch_error or "Unknown error"
                self.status_label.setText(f"✗ {error}")
                self.status_label.setStyleSheet("color: #F44336; font-size: 10px;")
                self.app_map_btn.setEnabled(False)

    def update_metrics(self, metrics: ArchitectureMetrics):
        """Update metric cards with new data."""
        # Routes
        self.routes_card.set_value(str(metrics.total_routes))
        self.routes_card.set_sublabel("API endpoints")

        # Services
        self.services_card.set_value(str(metrics.total_services))
        self.services_card.set_sublabel(f"{metrics.total_sub_services} sub-services")

        # Modernization progress
        progress_pct = metrics.modernization_progress
        self.plugins_card.set_value(f"{progress_pct}%")
        self.plugins_card.set_sublabel(f"{metrics.modernized_plugins}/{metrics.total_plugins} plugins")

        # Average module size
        self.module_size_card.set_value(str(metrics.avg_sub_service_lines))
        self.module_size_card.set_sublabel("lines per module")

    def set_disconnected_state(self):
        """Set UI to disconnected state."""
        self.routes_card.set_value("--")
        self.routes_card.set_sublabel("")
        self.services_card.set_value("--")
        self.services_card.set_sublabel("")
        self.plugins_card.set_value("--")
        self.plugins_card.set_sublabel("")
        self.module_size_card.set_value("--")
        self.module_size_card.set_sublabel("")

    def open_app_map(self):
        """Open the App Map in browser."""
        if self.multi_discovery:
            # Multi-service: open app-map for the first discovered service
            discovered = self.multi_discovery.discovered_services
            if discovered:
                # Open the first discovered service's app-map
                first_service = list(discovered.values())[0]
                url = f"{first_service['url']}/app-map"
                webbrowser.open(url)
        elif self.discovery:
            # Single service
            url = f"{self.discovery.backend_url}/app-map"
            webbrowser.open(url)

    def toggle_auto_refresh(self):
        """Toggle automatic refresh on/off."""
        self.auto_refresh_enabled = not self.auto_refresh_enabled

        if self.auto_refresh_enabled:
            self.auto_refresh_btn.setText("Auto: ON")
            self.refresh_timer.start()
        else:
            self.auto_refresh_btn.setText("Auto: OFF")
            self.refresh_timer.stop()

    def stop_auto_refresh(self):
        """Stop the auto-refresh timer."""
        self.refresh_timer.stop()

    def start_auto_refresh(self):
        """Start the auto-refresh timer."""
        if self.auto_refresh_enabled:
            self.refresh_timer.start()


class RoutesPreviewWidget(QWidget):
    """
    Widget showing a preview of available backend routes.

    Displays route tags and counts in a compact list.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setup_ui()

    def setup_ui(self):
        """Set up the UI layout."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        # Routes text area in a frame
        frame = QFrame()
        frame.setFrameShape(QFrame.Shape.StyledPanel)
        frame.setStyleSheet(theme.get_group_frame_stylesheet())
        frame_layout = QVBoxLayout(frame)

        self.routes_text = QTextEdit()
        self.routes_text.setReadOnly(True)
        self.routes_text.setMinimumHeight(200)
        self.routes_text.setStyleSheet(f"""
            QTextEdit {{
                background-color: {theme.BG_TERTIARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: 4px;
                font-family: monospace;
                font-size: 10pt;
                padding: 8px;
            }}
        """)
        self.routes_text.setPlainText("No routes available")

        frame_layout.addWidget(self.routes_text)
        layout.addWidget(frame)

    def update_routes(self, routes_by_tag: dict):
        """Update routes display."""
        if not routes_by_tag:
            self.routes_text.setPlainText("No routes available")
            return

        lines = []
        for tag, routes in sorted(routes_by_tag.items(), key=lambda x: -len(x[1])):
            lines.append(f"{tag.upper()}: {len(routes)} routes")

        self.routes_text.setPlainText("\n".join(lines))
