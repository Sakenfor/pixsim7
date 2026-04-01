"""
Debug Routes — proxy runtime debug controls to managed services.

Services that mount ``pixsim_logging.debug_endpoint`` expose a ``/_debug/logging``
API.  This router lets the launcher UI query and update logging state for
any managed service through a single entry point, avoiding CORS and
port-discovery in the frontend.

    GET  /debug/{service_key}/logging          → current state
    PUT  /debug/{service_key}/logging/level    → change level
    PUT  /debug/{service_key}/logging/domains  → change domain levels
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from launcher.core import ProcessManager
from ..dependencies import get_process_manager

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/meta/domains")
async def get_domain_catalog():
    """Return the canonical domain list and groups from pixsim_logging.

    The frontend uses this to render domain toggle UIs without hardcoding.
    """
    from pixsim_logging.spec import DOMAINS, DOMAIN_GROUPS
    return {
        "domains": DOMAINS,
        "groups": [
            {"id": gid, "label": label, "domains": domains}
            for gid, label, domains in DOMAIN_GROUPS
        ],
    }


class LoggingState(BaseModel):
    level: str
    domains: dict[str, str]
    active_domains: list[str] = []


class LevelUpdate(BaseModel):
    level: str


class DomainsUpdate(BaseModel):
    domains: dict[str, str]


def _service_debug_url(service_key: str, process_mgr: ProcessManager) -> Optional[str]:
    """Resolve the /_debug base URL for a service, or None."""
    state = process_mgr.get_state(service_key)
    if not state:
        return None
    health_url = getattr(state.definition, "health_url", None)
    if not health_url:
        return None
    # health_url is like http://localhost:8000/health — strip path to get base
    from urllib.parse import urlparse
    parsed = urlparse(health_url)
    return f"{parsed.scheme}://{parsed.netloc}/_debug"


def _proxy_get(url: str, timeout: float = 3) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _proxy_put(url: str, body: dict, timeout: float = 3) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, method="PUT",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


@router.get("/{service_key}/logging", response_model=LoggingState)
async def get_service_logging(
    service_key: str,
    process_mgr: ProcessManager = Depends(get_process_manager),
):
    """Get current logging state for a service."""
    # Self: launcher-api — call locally
    if service_key == "launcher-api":
        from pixsim_logging.domains import get_global_level_display, get_domain_config_display, get_active_domains
        return LoggingState(level=get_global_level_display(), domains=get_domain_config_display(), active_domains=get_active_domains())

    base = _service_debug_url(service_key, process_mgr)
    if not base:
        raise HTTPException(404, f"Service '{service_key}' has no debug endpoint")
    try:
        return LoggingState(**_proxy_get(f"{base}/logging"))
    except Exception as e:
        raise HTTPException(502, f"Failed to reach {service_key} debug endpoint: {e}")


@router.put("/{service_key}/logging/level", response_model=LoggingState)
async def set_service_logging_level(
    service_key: str,
    body: LevelUpdate = Body(...),
    process_mgr: ProcessManager = Depends(get_process_manager),
):
    """Change log level for a running service (no restart needed)."""
    if service_key == "launcher-api":
        from pixsim_logging.domains import update_global_level, get_global_level_display, get_domain_config_display
        update_global_level(body.level)
        return LoggingState(level=get_global_level_display(), domains=get_domain_config_display())

    base = _service_debug_url(service_key, process_mgr)
    if not base:
        raise HTTPException(404, f"Service '{service_key}' has no debug endpoint")
    try:
        return LoggingState(**_proxy_put(f"{base}/logging/level", {"level": body.level}))
    except Exception as e:
        raise HTTPException(502, f"Failed to reach {service_key} debug endpoint: {e}")


@router.put("/{service_key}/logging/domains", response_model=LoggingState)
async def set_service_logging_domains(
    service_key: str,
    body: DomainsUpdate = Body(...),
    process_mgr: ProcessManager = Depends(get_process_manager),
):
    """Change per-domain log levels for a running service (no restart needed)."""
    if service_key == "launcher-api":
        from pixsim_logging.domains import update_domain_config, get_global_level_display, get_domain_config_display
        update_domain_config(body.domains)
        return LoggingState(level=get_global_level_display(), domains=get_domain_config_display())

    base = _service_debug_url(service_key, process_mgr)
    if not base:
        raise HTTPException(404, f"Service '{service_key}' has no debug endpoint")
    try:
        return LoggingState(**_proxy_put(f"{base}/logging/domains", {"domains": body.domains}))
    except Exception as e:
        raise HTTPException(502, f"Failed to reach {service_key} debug endpoint: {e}")
