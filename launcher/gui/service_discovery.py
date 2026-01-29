"""
Service Discovery Module for Launcher

Queries the backend architecture API to discover available routes, plugins,
and architecture metrics. Used to enrich the launcher UI with live backend data.

Endpoints consumed:
- GET /dev/architecture/map - Backend-only architecture data
- GET /dev/architecture/unified - Combined backend + frontend architecture (canonical)
"""
import requests
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class ArchitectureMetrics:
    """Backend architecture metrics."""
    total_routes: int = 0
    total_services: int = 0
    total_sub_services: int = 0
    avg_sub_service_lines: int = 0
    total_plugins: int = 0
    modernized_plugins: int = 0
    unique_permissions: int = 0

    @property
    def modernization_progress(self) -> int:
        """Calculate modernization progress as percentage."""
        if self.total_plugins == 0:
            return 0
        return int((self.modernized_plugins / self.total_plugins) * 100)


class ServiceDiscovery:
    """
    Discovers backend architecture information by querying the dev API.

    This connects to the /dev/architecture/map endpoint to get live data about:
    - Available routes and their tags
    - Backend plugins and permissions
    - Service composition tree
    - Architecture health metrics
    """

    def __init__(self, backend_url: str = "http://localhost:8000"):
        self.backend_url = backend_url.rstrip('/')
        self.architecture_data: Optional[Dict[str, Any]] = None
        self.unified_data: Optional[Dict[str, Any]] = None
        self.last_fetch_error: Optional[str] = None

    def discover_architecture(self, timeout: int = 2) -> bool:
        """
        Fetch live backend architecture data.

        Args:
            timeout: Request timeout in seconds

        Returns:
            True if successful, False otherwise
        """
        try:
            response = requests.get(
                f"{self.backend_url}/dev/architecture/map",
                timeout=timeout
            )

            if response.ok:
                self.architecture_data = response.json()
                self.last_fetch_error = None
                logger.info("Successfully fetched backend architecture data")
                return True
            else:
                self.last_fetch_error = f"HTTP {response.status_code}"
                logger.warning(f"Failed to fetch architecture: {response.status_code}")
                return False

        except requests.exceptions.ConnectionError:
            self.last_fetch_error = "Backend not running"
            logger.debug("Backend connection failed - service not running")
            return False
        except requests.exceptions.Timeout:
            self.last_fetch_error = "Request timeout"
            logger.warning("Architecture API request timed out")
            return False
        except Exception as e:
            self.last_fetch_error = str(e)
            logger.error(f"Unexpected error fetching architecture: {e}")
            return False

    def get_metrics(self) -> ArchitectureMetrics:
        """
        Extract architecture metrics from fetched data.

        Returns:
            ArchitectureMetrics object (empty if no data available)
        """
        if not self.architecture_data:
            return ArchitectureMetrics()

        metrics_data = self.architecture_data.get('metrics', {})

        return ArchitectureMetrics(
            total_routes=metrics_data.get('total_routes', 0),
            total_services=metrics_data.get('total_services', 0),
            total_sub_services=metrics_data.get('total_sub_services', 0),
            avg_sub_service_lines=metrics_data.get('avg_sub_service_lines', 0),
            total_plugins=metrics_data.get('total_plugins', 0),
            modernized_plugins=metrics_data.get('modernized_plugins', 0),
            unique_permissions=metrics_data.get('unique_permissions', 0),
        )

    def get_routes_by_tag(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all backend routes organized by tag.

        Returns:
            Dictionary mapping tag names to lists of route info dicts
        """
        if not self.architecture_data:
            return {}

        routes_by_tag: Dict[str, List[Dict[str, Any]]] = {}

        for route in self.architecture_data.get('routes', []):
            tags = route.get('tags', ['other'])
            for tag in tags:
                if tag not in routes_by_tag:
                    routes_by_tag[tag] = []
                routes_by_tag[tag].append(route)

        return routes_by_tag

    def get_plugins(self) -> List[Dict[str, Any]]:
        """
        Get backend plugin manifests.

        Returns:
            List of plugin info dicts
        """
        if not self.architecture_data:
            return []

        return self.architecture_data.get('plugins', [])

    def get_services(self) -> List[Dict[str, Any]]:
        """
        Get service composition tree.

        Returns:
            List of service info dicts with sub-services
        """
        if not self.architecture_data:
            return []

        return self.architecture_data.get('services', [])

    def get_capabilities(self) -> List[Dict[str, Any]]:
        """
        Get available capability APIs.

        Returns:
            List of capability API info dicts
        """
        if not self.architecture_data:
            return []

        return self.architecture_data.get('capabilities', [])

    def get_route_count_by_tag(self) -> Dict[str, int]:
        """Get count of routes per tag."""
        routes_by_tag = self.get_routes_by_tag()
        return {tag: len(routes) for tag, routes in routes_by_tag.items()}

    def is_backend_healthy(self) -> bool:
        """Check if backend is responding and healthy."""
        return self.architecture_data is not None

    def get_summary(self) -> str:
        """
        Get human-readable summary of backend architecture.

        Returns:
            Multi-line summary string
        """
        if not self.architecture_data:
            return "Backend architecture data not available"

        metrics = self.get_metrics()
        route_counts = self.get_route_count_by_tag()

        summary_lines = [
            "Backend Architecture Summary",
            "=" * 40,
            f"Routes: {metrics.total_routes} across {len(route_counts)} tags",
            f"Services: {metrics.total_services} ({metrics.total_sub_services} sub-services)",
            f"Avg Module Size: {metrics.avg_sub_service_lines} lines",
            f"Plugins: {metrics.modernized_plugins}/{metrics.total_plugins} modernized ({metrics.modernization_progress}%)",
            f"Permissions: {metrics.unique_permissions} unique",
            "",
            "Top Route Tags:",
        ]

        # Add top 5 tags by route count
        for tag, count in sorted(route_counts.items(), key=lambda x: -x[1])[:5]:
            summary_lines.append(f"  - {tag}: {count} routes")

        return "\n".join(summary_lines)

    # === Unified Architecture API ===

    def discover_unified_architecture(self, timeout: int = 3) -> bool:
        """
        Fetch unified architecture data (backend + frontend).

        This is the CANONICAL endpoint for full application architecture.
        It includes frontend feature modules derived from page.appMap metadata.

        Args:
            timeout: Request timeout in seconds

        Returns:
            True if successful, False otherwise
        """
        try:
            response = requests.get(
                f"{self.backend_url}/dev/architecture/unified",
                timeout=timeout
            )

            if response.ok:
                self.unified_data = response.json()
                # Also update architecture_data with backend portion for compatibility
                backend = self.unified_data.get("backend", {})
                self.architecture_data = {
                    "version": self.unified_data.get("version", "1.0"),
                    "routes": backend.get("routes", []),
                    "capabilities": backend.get("capabilities", []),
                    "services": backend.get("services", []),
                    "plugins": backend.get("plugins", []),
                    "metrics": self.unified_data.get("metrics", {}),
                }
                self.last_fetch_error = None
                logger.info("Successfully fetched unified architecture data")
                return True
            else:
                self.last_fetch_error = f"HTTP {response.status_code}"
                logger.warning(f"Failed to fetch unified architecture: {response.status_code}")
                return False

        except requests.exceptions.ConnectionError:
            self.last_fetch_error = "Backend not running"
            logger.debug("Backend connection failed - service not running")
            return False
        except requests.exceptions.Timeout:
            self.last_fetch_error = "Request timeout"
            logger.warning("Unified architecture API request timed out")
            return False
        except Exception as e:
            self.last_fetch_error = str(e)
            logger.error(f"Unexpected error fetching unified architecture: {e}")
            return False

    def get_frontend_features(self) -> List[Dict[str, Any]]:
        """
        Get frontend feature modules from unified architecture data.

        Returns:
            List of feature entries with routes, frontend paths, docs, backend refs
        """
        if not hasattr(self, 'unified_data') or not self.unified_data:
            return []

        frontend = self.unified_data.get("frontend", {})
        return frontend.get("entries", [])
