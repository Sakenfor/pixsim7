"""
Multi-Service Discovery for Launcher

Supports discovering and managing multiple backend services for microservices architecture.
"""
import os
import json
import time
import requests
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from pathlib import Path
import logging

from .service_discovery import ServiceDiscovery, ArchitectureMetrics

try:
    from .services import _resolve_port
except ImportError:
    from services import _resolve_port

logger = logging.getLogger(__name__)


@dataclass
class ServiceInfo:
    """Metadata about a discovered backend service."""
    service_id: str
    name: str
    port: int
    type: str = "backend"
    version: str = "unknown"
    provides: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    endpoints: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class MultiServiceDiscovery:
    """
    Discovers and manages multiple backend services.

    Automatically detects available backend APIs and merges their architecture data.
    Supports microservices architecture where generation, game logic, etc. are split.
    """

    def __init__(self, services_config: List[Dict]):
        """
        Initialize multi-service discovery.

        Args:
            services_config: List of service configuration dicts from services.json
        """
        self.services_config = services_config
        self.discovered_services: Dict[str, ServiceDiscovery] = {}
        self.service_info: Dict[str, ServiceInfo] = {}
        self.last_discovery_time: Optional[float] = None

    def discover_all_services(self, timeout: int = 2) -> Dict[str, bool]:
        """
        Attempt to discover all configured backend services.

        Args:
            timeout: Request timeout in seconds

        Returns:
            Dict mapping service_id to discovery success (True/False)
        """
        results = {}

        for service_config in self.services_config:
            service_id = service_config['id']
            port = _resolve_port(service_config)
            base_url = f"http://localhost:{port}"

            try:
                # Try to fetch service info
                info_endpoint = service_config.get('info_endpoint', '/dev/info')
                info_response = requests.get(
                    f"{base_url}{info_endpoint}",
                    timeout=timeout
                )

                if info_response.ok:
                    info_data = info_response.json()

                    # Store service info
                    self.service_info[service_id] = ServiceInfo(
                        service_id=info_data.get('service_id', service_id),
                        name=info_data.get('name', service_config.get('name', service_id)),
                        port=port,
                        type=info_data.get('type', 'backend'),
                        version=info_data.get('version', 'unknown'),
                        provides=info_data.get('provides', []),
                        dependencies=info_data.get('dependencies', []),
                        tags=info_data.get('tags', []),
                        endpoints=info_data.get('endpoints', {}),
                        metadata=info_data,
                    )

                    # Create discovery instance for architecture data
                    discovery = ServiceDiscovery(base_url)
                    if discovery.discover_architecture(timeout):
                        self.discovered_services[service_id] = discovery
                        results[service_id] = True
                        logger.info(f"Discovered service: {service_id} at {base_url}")
                    else:
                        results[service_id] = False
                        logger.warning(f"Service {service_id} responded but architecture discovery failed")
                else:
                    results[service_id] = False
                    logger.debug(f"Service {service_id} not available: HTTP {info_response.status_code}")

            except requests.exceptions.ConnectionError:
                results[service_id] = False
                logger.debug(f"Service {service_id} not running at {base_url}")
            except requests.exceptions.Timeout:
                results[service_id] = False
                logger.warning(f"Service {service_id} timed out")
            except Exception as e:
                results[service_id] = False
                logger.error(f"Error discovering service {service_id}: {e}")

        self.last_discovery_time = time.time()
        return results

    def get_combined_metrics(self) -> ArchitectureMetrics:
        """
        Combine architecture metrics from all discovered services.

        Returns:
            Combined metrics across all services
        """
        combined = ArchitectureMetrics()

        for discovery in self.discovered_services.values():
            metrics = discovery.get_metrics()
            combined.total_routes += metrics.total_routes
            combined.total_services += metrics.total_services
            combined.total_sub_services += metrics.total_sub_services
            combined.total_plugins += metrics.total_plugins
            combined.modernized_plugins += metrics.modernized_plugins
            combined.unique_permissions += metrics.unique_permissions

        # Recalculate average module size
        if combined.total_sub_services > 0:
            total_lines = sum(
                discovery.get_metrics().avg_sub_service_lines *
                discovery.get_metrics().total_sub_services
                for discovery in self.discovered_services.values()
                if discovery.get_metrics().total_sub_services > 0
            )
            combined.avg_sub_service_lines = int(total_lines / combined.total_sub_services)

        return combined

    def get_all_routes_by_service(self) -> Dict[str, Dict[str, List[Dict]]]:
        """
        Get routes from all services, organized by service then by tag.

        Returns:
            Dict mapping service_name -> {tag -> [routes]}
        """
        all_routes = {}

        for service_id, discovery in self.discovered_services.items():
            service_name = self.service_info[service_id].name if service_id in self.service_info else service_id
            all_routes[service_name] = discovery.get_routes_by_tag()

        return all_routes

    def get_service_status(self) -> Dict[str, Dict[str, Any]]:
        """
        Get status of all configured services.

        Returns:
            Dict mapping service_id to status info
        """
        status = {}

        for service_config in self.services_config:
            service_id = service_config['id']

            status[service_id] = {
                'configured': True,
                'discovered': service_id in self.discovered_services,
                'info': self.service_info.get(service_id),
                'healthy': service_id in self.discovered_services and
                          self.discovered_services[service_id].is_backend_healthy(),
                'config': service_config,
            }

        return status

    def get_discovered_count(self) -> int:
        """Get count of successfully discovered services."""
        return len(self.discovered_services)

    def get_total_configured(self) -> int:
        """Get count of configured services (enabled)."""
        return len([s for s in self.services_config if s.get('enabled', True)])


def load_services_config(config_path: Optional[str] = None) -> Optional[List[Dict]]:
    """
    Load backend services configuration from services.json.

    Args:
        config_path: Path to services.json (defaults to launcher/services.json)

    Returns:
        List of backend service configurations, or None if file doesn't exist
    """
    if not config_path:
        # Try to find services.json relative to this file
        launcher_dir = Path(__file__).parent.parent
        config_path = launcher_dir / "services.json"

    if not Path(config_path).exists():
        logger.debug(f"Services config not found at {config_path}")
        return None

    try:
        with open(config_path, 'r') as f:
            data = json.load(f)

        backend_services = data.get('backend_services', [])

        # Filter to enabled services only
        enabled_services = [s for s in backend_services if s.get('enabled', True)]

        logger.info(f"Loaded {len(enabled_services)} backend services from config")
        return enabled_services

    except Exception as e:
        logger.error(f"Failed to load services config: {e}")
        return None
