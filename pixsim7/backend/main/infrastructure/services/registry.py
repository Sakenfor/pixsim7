import json
import os
from dataclasses import dataclass
from typing import Dict, Optional

SERVICE_ENV_MAP = {
    "generation": "GENERATION_BASE_URL",
    "analysis": "ANALYSIS_BASE_URL",
}


@dataclass(frozen=True)
class ServiceInfo:
    id: str
    base_url: Optional[str]
    timeout_s: float = 30.0
    enabled: bool = True


def _load_json_mapping(env_key: str) -> Dict[str, str]:
    raw = os.getenv(env_key)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def _coerce_timeout(value: object, fallback: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return fallback


def load_service_registry() -> Dict[str, ServiceInfo]:
    base_urls = _load_json_mapping("PIXSIM_SERVICE_BASE_URLS")
    timeouts = _load_json_mapping("PIXSIM_SERVICE_TIMEOUTS")
    registry: Dict[str, ServiceInfo] = {}

    for service_id, env_key in SERVICE_ENV_MAP.items():
        raw_url = os.getenv(env_key) or base_urls.get(service_id)
        base_url = raw_url.strip() if isinstance(raw_url, str) and raw_url.strip() else None
        timeout_s = _coerce_timeout(timeouts.get(service_id), 30.0)
        registry[service_id] = ServiceInfo(
            id=service_id,
            base_url=base_url,
            timeout_s=timeout_s,
            enabled=True,
        )

    for service_id, raw_url in base_urls.items():
        if service_id in registry:
            continue
        base_url = raw_url.strip() if isinstance(raw_url, str) and raw_url.strip() else None
        timeout_s = _coerce_timeout(timeouts.get(service_id), 30.0)
        registry[service_id] = ServiceInfo(
            id=service_id,
            base_url=base_url,
            timeout_s=timeout_s,
            enabled=True,
        )

    return registry
