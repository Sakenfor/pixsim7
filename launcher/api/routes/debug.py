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
    sql_logging: bool = False
    # "backend" = canonical persisted config; "launcher-local" = degraded
    # fallback served from the launcher-api process's own in-memory logging
    # state when the backend (the persisted-config owner) is unreachable.
    source: str = "backend"


class LoggingConfigPatch(BaseModel):
    log_level: Optional[str] = None
    log_db_min_level: Optional[str] = None
    log_retention_days: Optional[int] = None
    log_domain_levels: Optional[dict[str, str]] = None
    sql_logging: Optional[bool] = None


def _local_logging_config() -> "LoggingConfig":
    """Build a degraded config from the launcher-api process's own logging state.

    Used when the backend (which owns the canonical persisted config) is
    unreachable. Only the fields the launcher process actually knows about are
    populated — ``log_db_min_level`` and ``log_retention_days`` are backend/DB
    concerns and left empty/zero, which the UI renders as disabled in this mode.
    """
    from pixsim_logging.domains import (
        get_global_level_display,
        get_domain_config_display,
    )
    return LoggingConfig(
        log_level=get_global_level_display(),
        log_db_min_level="",
        log_retention_days=0,
        log_domain_levels=get_domain_config_display(),
        source="launcher-local",
    )


# Backend failures that mean "can't reach the canonical config" → fall back to
# the launcher-local state rather than erroring the whole Debug panel.
_OFFLINE_FALLBACK_CODES = frozenset({401, 502, 503, 504})


@router.get("/logging/config", response_model=LoggingConfig)
async def get_logging_config(request: Request):
    """Read the canonical persisted logging config from the backend.

    When the backend is unreachable (or no launcher token exists yet), fall
    back to the launcher-api's own in-memory logging state so the Debug panel
    stays usable for the launcher process itself.
    """
    try:
        data = await _backend_request("GET", _backend_url(request), "/api/v1/admin/logging/config")
    except HTTPException as e:
        if e.status_code in _OFFLINE_FALLBACK_CODES:
            return _local_logging_config()
        raise
    return LoggingConfig(**data)


def _apply_local_logging_config(data: dict) -> None:
    """Apply persisted logging config to the launcher-api process in-memory state.

    Other services pick up config changes via their own refresh paths
    (backend owns the write, worker subscribes to Redis events, ai-client
    polls). The launcher-api process has none — without this self-apply
    it would never pick up Debug-panel edits until launcher restart, so
    its propagation badge would stay drifted forever after any change.
    Best-effort — failure here doesn't fail the PATCH proxy.
    """
    try:
        from pixsim_logging.domains import update_domain_config, update_global_level
        from pixsim_logging.config import set_db_min_level
    except ImportError:
        return

    try:
        if data.get("log_level"):
            update_global_level(data["log_level"])
        if "log_domain_levels" in data:
            update_domain_config(data.get("log_domain_levels") or {})
        if data.get("log_db_min_level"):
            set_db_min_level(data["log_db_min_level"])
    except Exception:
        pass


@router.patch("/logging/config", response_model=LoggingConfig)
async def patch_logging_config(
    request: Request,
    body: LoggingConfigPatch = Body(...),
):
    """Patch the canonical persisted logging config via the backend admin endpoint.

    On success, the change is also applied to the local launcher-api process
    so its propagation badge reflects reality without waiting for a restart.
    """
    payload = body.model_dump(exclude_none=True)
    try:
        data = await _backend_request(
            "PATCH",
            _backend_url(request),
            "/api/v1/admin/logging/config",
            json_body=payload,
        )
    except HTTPException as e:
        if e.status_code in _OFFLINE_FALLBACK_CODES:
            # Backend offline — apply the change to the launcher-api process
            # only (not persisted) so launcher logging can still be tuned.
            _apply_local_logging_config(payload)
            return _local_logging_config()
        raise
    _apply_local_logging_config(data)
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


@router.get("/{service_key}/logging", response_model=LoggingState)
async def get_service_logging(
    service_key: str,
    process_mgr: ProcessManager = Depends(get_process_manager),
):
    """Get current effective logging state for a service (read-only).

    Returns 404 in two cases:
    1. The service definition exposes no /_debug surface at all.
    2. The resolved endpoint responds but doesn't speak pixsim_logging
       (4xx, non-JSON body, or JSON that doesn't shape into LoggingState).
       This is what hides Vite's frontend dev server from the propagation
       row — it has a health_url but no /_debug/logging route.

    Returns 502 only for genuine reachability failures (connection refused,
    timeout, 5xx) so the propagation row can render an ✕ for hung processes.
    """
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

    url = f"{base}/logging"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            body_bytes = resp.read()
    except urllib.error.HTTPError as e:
        if 400 <= e.code < 500:
            raise HTTPException(404, f"Service '{service_key}' has no /_debug/logging route")
        raise HTTPException(502, f"Failed to reach {service_key} debug endpoint: {e}")
    except (urllib.error.URLError, OSError) as e:
        raise HTTPException(502, f"Failed to reach {service_key} debug endpoint: {e}")

    try:
        body = json.loads(body_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(404, f"Service '{service_key}' is not a pixsim_logging endpoint")

    try:
        return LoggingState(**body)
    except (TypeError, ValueError):
        raise HTTPException(404, f"Service '{service_key}' returned non-LoggingState JSON")
