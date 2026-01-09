"""
Architecture Tab for Launcher

Creates the backend architecture introspection tab with app map and live metrics.
"""

import json
from pathlib import Path
from PySide6.QtWidgets import (
    QWidget, QTableWidget, QTableWidgetItem, QHeaderView
)

try:
    from .. import theme
    from ..config import read_env_ports
    from ..widgets.architecture_panel import ArchitectureMetricsPanel, RoutesPreviewWidget
    from ..service_discovery import ServiceDiscovery
    from ..multi_service_discovery import MultiServiceDiscovery, load_services_config
    from ..widgets.tab_builder import (
        TabBuilder, create_page, create_info_label
    )
except ImportError:
    import theme
    from config import read_env_ports
    from widgets.architecture_panel import ArchitectureMetricsPanel, RoutesPreviewWidget
    from service_discovery import ServiceDiscovery
    from multi_service_discovery import MultiServiceDiscovery, load_services_config
    from widgets.tab_builder import (
        TabBuilder, create_page, create_info_label
    )


def _merge_unique(left: list | None, right: list | None) -> list:
    """Merge two lists while preserving order and removing duplicates."""
    result: list = []
    seen: set = set()
    for items in (left or [], right or []):
        for item in items:
            if item in seen:
                continue
            seen.add(item)
            result.append(item)
    return result


def _merge_app_map_entries(generated: list, manual: list) -> list:
    """Merge generated entries with manual overrides."""
    generated_by_id = {entry.get("id"): entry for entry in generated if entry.get("id")}
    used_generated: set[str] = set()
    merged: list = []

    for manual_entry in manual:
        entry_id = manual_entry.get("id")
        generated_entry = generated_by_id.get(entry_id)
        if generated_entry:
            merged_entry = dict(generated_entry)
            if manual_entry.get("label"):
                merged_entry["label"] = manual_entry["label"]
            merged_entry["docs"] = manual_entry.get("docs", merged_entry.get("docs", []))
            merged_entry["backend"] = manual_entry.get("backend", merged_entry.get("backend", []))
            merged_entry["routes"] = _merge_unique(
                merged_entry.get("routes", []),
                manual_entry.get("routes", []),
            )
            merged_entry["frontend"] = _merge_unique(
                merged_entry.get("frontend", []),
                manual_entry.get("frontend", []),
            )
            merged.append(merged_entry)
            used_generated.add(entry_id)
        else:
            merged.append(manual_entry)

    for generated_entry in generated:
        entry_id = generated_entry.get("id")
        if entry_id and entry_id not in used_generated:
            merged.append(generated_entry)

    return merged


def load_app_map_registry() -> list:
    """Load the merged app map registry (sources + generated)."""
    launcher_dir = Path(__file__).parent.parent.parent
    project_root = launcher_dir.parent
    sources_path = project_root / "docs" / "app_map.sources.json"
    generated_path = project_root / "docs" / "app_map.generated.json"

    if not sources_path.exists():
        return []

    try:
        with open(sources_path, "r", encoding="utf-8") as f:
            sources = json.load(f)
        manual_entries = sources.get("entries", [])
    except Exception:
        return []

    generated_entries: list = []
    if generated_path.exists():
        try:
            with open(generated_path, "r", encoding="utf-8") as f:
                generated = json.load(f)
            generated_entries = generated.get("entries", [])
        except Exception:
            generated_entries = []

    if generated_entries:
        return _merge_app_map_entries(generated_entries, manual_entries)

    return manual_entries


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
        builder = TabBuilder()
        builder.add_page("Features", lambda: ArchitectureTab._create_features_page(launcher))
        builder.add_page("Metrics", lambda: ArchitectureTab._create_metrics_page(launcher))
        builder.add_page("Routes", lambda: ArchitectureTab._create_routes_page(launcher))

        container, _, _ = builder.build()

        # Initialize service discovery (will connect when backend starts)
        ArchitectureTab._init_service_discovery(launcher)

        # Connect metrics updates to routes preview
        launcher.architecture_panel.metrics_updated.connect(launcher._on_architecture_metrics_updated)

        return container

    @staticmethod
    def _create_features_page(launcher) -> QWidget:
        """Create the Features (App Map) page."""
        page, layout = create_page(
            "App Map",
            "Feature registry showing documentation, frontend components, and backend modules."
        )

        entries = load_app_map_registry()

        table = QTableWidget()
        table.setColumnCount(4)
        table.setHorizontalHeaderLabels(["Feature", "Routes", "Frontend", "Backend"])
        table.setRowCount(len(entries))
        table.setAlternatingRowColors(True)
        table.setSelectionBehavior(QTableWidget.SelectRows)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        table.verticalHeader().setVisible(False)
        table.setStyleSheet(f"""
            QTableWidget {{
                background-color: {theme.BG_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: 4px;
                gridline-color: {theme.BORDER_DEFAULT};
            }}
            QTableWidget::item {{
                padding: 4px 8px;
            }}
            QHeaderView::section {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_SECONDARY};
                padding: 6px 8px;
                border: none;
                border-bottom: 1px solid {theme.BORDER_DEFAULT};
                font-weight: bold;
            }}
        """)

        for row, entry in enumerate(entries):
            # Feature name
            label = entry.get("label", entry.get("id", ""))
            table.setItem(row, 0, QTableWidgetItem(label))

            # Routes
            routes = entry.get("routes", [])
            routes_text = ", ".join(routes) if routes else "-"
            table.setItem(row, 1, QTableWidgetItem(routes_text))

            # Frontend paths (simplified)
            frontend = entry.get("frontend", [])
            if frontend:
                frontend_short = []
                for path in frontend:
                    if "apps/main/src/" in path:
                        frontend_short.append(path.replace("apps/main/src/", ""))
                    elif "packages/" in path:
                        frontend_short.append(path.split("packages/")[1])
                    else:
                        frontend_short.append(path)
                frontend_text = ", ".join(frontend_short)
            else:
                frontend_text = "-"
            table.setItem(row, 2, QTableWidgetItem(frontend_text))

            # Backend modules (simplified)
            backend = entry.get("backend", [])
            if backend:
                backend_short = []
                for mod in backend:
                    if mod.startswith("pixsim7.backend.main."):
                        backend_short.append(mod.replace("pixsim7.backend.main.", ""))
                    else:
                        backend_short.append(mod)
                backend_text = ", ".join(backend_short)
            else:
                backend_text = "-"
            table.setItem(row, 3, QTableWidgetItem(backend_text))

        layout.addWidget(table, 1)
        layout.addWidget(create_info_label(f"{len(entries)} features registered"))

        return page

    @staticmethod
    def _create_metrics_page(launcher) -> QWidget:
        """Create the Metrics page."""
        page, layout = create_page(
            "Backend Metrics",
            "Live introspection from the /dev/architecture/map endpoint. "
            "Requires the backend to be running."
        )

        launcher.architecture_panel = ArchitectureMetricsPanel()
        layout.addWidget(launcher.architecture_panel)
        layout.addStretch()

        return page

    @staticmethod
    def _create_routes_page(launcher) -> QWidget:
        """Create the Routes page."""
        page, layout = create_page(
            "Live Routes",
            "Routes discovered from running backend services, grouped by tag."
        )

        launcher.routes_preview = RoutesPreviewWidget()
        layout.addWidget(launcher.routes_preview)
        layout.addStretch()

        return page

    @staticmethod
    def _init_service_discovery(launcher):
        """Initialize service discovery for architecture introspection."""
        services_config = load_services_config()

        if services_config:
            launcher.multi_service_discovery = MultiServiceDiscovery(services_config)
            launcher.service_discovery = None
            launcher.architecture_panel.set_multi_discovery(launcher.multi_service_discovery)
        else:
            ports = read_env_ports()
            launcher.service_discovery = ServiceDiscovery(f"http://localhost:{ports.backend}")
            launcher.multi_service_discovery = None
            launcher.architecture_panel.set_discovery(launcher.service_discovery)
