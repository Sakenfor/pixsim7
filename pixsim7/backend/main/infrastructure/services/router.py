from __future__ import annotations

from typing import Dict, Optional

from .client import ServiceClient
from .registry import ServiceInfo, load_service_registry


class ServiceRouter:
    def __init__(self, registry: Dict[str, ServiceInfo]) -> None:
        self._registry = dict(registry)

    @classmethod
    def from_env(cls) -> "ServiceRouter":
        return cls(load_service_registry())

    def get_service(self, service_id: str) -> Optional[ServiceInfo]:
        return self._registry.get(service_id)

    def get_client(self, service_id: str) -> Optional[ServiceClient]:
        info = self.get_service(service_id)
        if not info or not info.enabled or not info.base_url:
            return None
        return ServiceClient(info.base_url, info.timeout_s)
