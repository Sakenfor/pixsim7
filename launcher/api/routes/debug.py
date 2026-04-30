"""
Debug Routes — logging-config proxy + per-service status reads.

Two surfaces:

1. **Global logging config** (read+write) — proxies to the backend's
   ``/api/v1/admin/logging/config`` using the launcher's stored token.
   This is the canonical persisted config; changes flow through
   ``system_config`` and apply to backend instantly + worker on reload.

       GET    /debug/logging/config
       PATCH  /debug/logging/config

2. **Per-service effective state** (read-only) — proxies to each managed
   service's ``GET /_debug/logging`` to surface the live in-memory state,
   useful for confirming propagation. Workers don't have an HTTP endpoint
   and won't appear here.

       GET /debug/{service_key}/logging

Plus a static catalog endpoint::

       GET /debug/meta/domains
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel

from launcher.core import ProcessManager
from launcher.core.auth import TOKEN_PATH
from ..dependencies import get_process_manager

router = APIRouter(prefix="/debug", tags=["debug"])


# ─── Domain catalog (static) ────────────────────────────────────────────


@router.get("/meta/domains")
async def get_domain_catalog():
    """Return the canonical domain list and groups from pixsim_logging."""
    from pixsim_logging.spec import DOMAINS, DOMAIN_GROUPS
    return {
        "domains": DOMAINS,
        "groups": [
            {"id": gid, "label": label, "domains": domains}
            for gid, label, domains in DOMAIN_GROUPS
        ],
    }


# ─── Global logging config proxy (backend admin endpoint) ───────────────


def _backend_url(request: Request) -> str:
    identity = getattr(request.app.state, "launcher_identity", None)
    return (identity.backend_url if identity and identity.backend_url else "http://localhost:8000").rstrip("/")


def _auth_headers() -> dict[str, str]:
    if not TOKEN_PATH.exists():
        raise HTTPException(401, "No launcher token — finish setup before configuring logging")
    token = TOKEN_PATH.read_text(encoding="utf-8").strip()
    if not token:
        raise HTTPException(401, "Launcher token is empty")
    return {"Authorization": f"Bearer {token}"}


async def _backend_request(
    method: str,
    backend: str,
    path: str,
    json_body: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    url = f"{backend}{path}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.request(
                method, url, headers=_auth_headers(), json=json_body,
            )
    except httpx.RequestError as e:
        raise HTTPException(502, f"Backend unreachable: {e}")
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail") or resp.text
        except Exception:
            detail = resp.text
        raise HTTPException(resp.status_code, f"Backend error: {detail}")
    return resp.json()


class LoggingConfig(BaseModel):
    log_level: str
    log_db_min_level: str
    log_retention_days: int
    log_domain_levels: dict[str, str]


class LoggingConfigPatch(BaseModel):
    log_level: Optional[str] = None
    log_db_min_level: Optional[str] = None
    log_retention_days: Optional[int] = None
    log_domain_levels: Optional[dict[str, str]] = None


@router.get("/logging/config", response_model=LoggingConfig)
async def get_logging_config(request: Request):
    """Read the canonical persisted logging config from the backend."""
    data = await _backend_request("GET", _backend_url(request), "/api/v1/admin/logging/config")
    return LoggingConfig(**data)


@router.patch("/logging/config", response_model=LoggingConfig)
async def patch_logging_config(
    request: Request,
    body: LoggingConfigPatch = Body(...),
):
    """Patch the canonical persisted logging config via the backend admin endpoint."""
    payload = body.model_dump(exclude_none=True)
    data = await _backend_request(
        "PATCH",
        _backend_url(request),
        "/api/v1/admin/logging/config",
        json_body=payload,
    )
    return LoggingConfig(**data)


# ─── Per-service effective state (read-only) ────────────────────────────


class LoggingState(BaseModel):
    level: str
    domains: dict[str, str]
    active_domains: list[str] = []


def _service_debug_url(service_key: str, process_mgr: ProcessManager) -> Optional[str]:
    """Resolve the /_debug base URL for a service, or None.

    Two discovery sources, in order:

    1. Static ``health_url`` on the service definition — used by services
       bound to a fixed port (backend, frontend).
    2. ``debug_port_file`` on the service definition — for services that
       bind to an ephemeral port and publish it via a side-channel file
       (e.g. the AI client writing to ``~/.pixsim/hook_port``).
    """
    state = process_mgr.get_state(service_key)
    if not state:
        return None

    # 1. Static health_url
    health_url = getattr(state.definition, "health_url", None)
    if health_url:
        from urllib.parse import urlparse
        parsed = urlparse(health_url)
        return f"{parsed.scheme}://{parsed.netloc}/_debug"

    # 2. Port-file discovery (ephemeral-port services)
    port_file = getattr(state.definition, "debug_port_file", None)
    if port_file:
        from pathlib import Path
        try:
            path = Path(port_file).expanduser()
            port = int(path.read_text(encoding="utf-8").strip())
            if port > 0:
                return f"http://127.0.0.1:{port}/_debug"
        except Exception:
            return None

    return None


def _proxy_get(url: str, timeout: float = 3) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


@router.get("/{service_key}/logging", response_model=LoggingState)
async def get_service_logging(
    service_key: str,
    process_mgr: ProcessManager = Depends(get_process_manager),
):
    """Get current effective logging state for a service (read-only)."""
    if service_key == "launcher-api":
        from pixsim_logging.domains import (
            get_global_level_display,
            get_domain_config_display,
            get_active_domains,
        )
        return LoggingState(
            level=get_global_level_display(),
            domains=get_domain_config_display(),
            active_domains=get_active_domains(),
        )

    base = _service_debug_url(service_key, process_mgr)
    if not base:
        raise HTTPException(404, f"Service '{service_key}' has no debug endpoint")
    try:
        return LoggingState(**_proxy_get(f"{base}/logging"))
    except Exception as e:
        raise HTTPException(502, f"Failed to reach {service_key} debug endpoint: {e}")
