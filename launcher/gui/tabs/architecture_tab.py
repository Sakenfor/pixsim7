"""
Architecture Tab for Launcher

Creates the backend architecture introspection tab.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel

try:
    from .. import theme
    from ..config import read_env_ports
    from ..widgets.architecture_metrics_panel import ArchitectureMetricsPanel
    from ..widgets.routes_preview import RoutesPreviewWidget
    from ..service_discovery import ServiceDiscovery, load_services_config
    from ..multi_service_discovery import MultiServiceDiscovery
except ImportError:
    import theme
    from config import read_env_ports
    from widgets.architecture_metrics_panel import ArchitectureMetricsPanel
    from widgets.routes_preview import RoutesPreviewWidget
    from service_discovery import ServiceDiscovery, load_services_config
    from multi_service_discovery import MultiServiceDiscovery


class ArchitectureTab:
    """
    Architecture tab builder for the launcher.

    Creates the backend architecture introspection view.
    """

    @staticmethod
    def create(launcher):
        """
        Create the backend architecture tab.

        Args:
            launcher: LauncherWindow instance

        Returns:
            QWidget: The architecture tab widget
        """
        architecture_tab = QWidget()
        architecture_layout = QVBoxLayout(architecture_tab)
        architecture_layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG, theme.SPACING_LG)
        architecture_layout.setSpacing(theme.SPACING_LG)

        # Header
        header_label = QLabel("Backend Architecture")
        header_label.setStyleSheet(f"font-size: {theme.FONT_SIZE_XL}; font-weight: bold; color: {theme.ACCENT_PRIMARY};")
        architecture_layout.addWidget(header_label)

        desc_label = QLabel(
            "Live introspection of backend routes, services, and plugins.\n"
            "This data is fetched from the /dev/architecture/map endpoint."
        )
        desc_label.setStyleSheet("color: palette(mid); font-size: 11px;")
        desc_label.setWordWrap(True)
        architecture_layout.addWidget(desc_label)

        # Architecture metrics panel
        launcher.architecture_panel = ArchitectureMetricsPanel()
        architecture_layout.addWidget(launcher.architecture_panel)

        # Routes preview
        launcher.routes_preview = RoutesPreviewWidget()
        architecture_layout.addWidget(launcher.routes_preview)

        # Initialize service discovery (will connect when backend starts)
        # Try to load services.json for multi-service discovery
        services_config = load_services_config()

        if services_config:
            # Use multi-service discovery
            launcher.multi_service_discovery = MultiServiceDiscovery(services_config)
            launcher.service_discovery = None  # Legacy single service
            launcher.architecture_panel.set_multi_discovery(launcher.multi_service_discovery)
        else:
            # Fall back to single service discovery
            ports = read_env_ports()
            launcher.service_discovery = ServiceDiscovery(f"http://localhost:{ports.backend}")
            launcher.multi_service_discovery = None
            launcher.architecture_panel.set_discovery(launcher.service_discovery)

        # Connect metrics updates to routes preview
        launcher.architecture_panel.metrics_updated.connect(launcher._on_architecture_metrics_updated)

        architecture_layout.addStretch()
        return architecture_tab
