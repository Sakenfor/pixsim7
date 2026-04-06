"""Identity routes — launcher auth status and first-time setup."""
from __future__ import annotations

import asyncio
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from launcher.core.auth import (
    create_identity,
    get_token_info,
    identity_exists,
    LauncherIdentity,
    PIXSIM_DIR,
    refresh_stored_token,
    token_needs_refresh,
)

router = APIRouter(tags=["identity"])


def _store_login_token(token: str) -> None:
    """Save the backend login token so MCP/bridge can use it."""
    token_path = PIXSIM_DIR / "token"
    PIXSIM_DIR.mkdir(parents=True, exist_ok=True)
    token_path.write_text(token)
    import os
    if os.name != "nt":
        try:
            os.chmod(token_path, 0o600)
        except OSError:
            pass


class IdentityStatus(BaseModel):
    exists: bool
    username: Optional[str] = None
    email: Optional[str] = None
    backend_url: Optional[str] = None
    keypair_id: Optional[str] = None
    token_expires_at: Optional[int] = None   # unix epoch
    token_valid: bool = False


class SetupCreateRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class SetupLinkRequest(BaseModel):
    backend_url: str
    username: str
    password: str


class SetupResponse(BaseModel):
    ok: bool
    message: str
    username: Optional[str] = None


@router.get("/identity", response_model=IdentityStatus)
async def get_identity_status(request: Request) -> IdentityStatus:
    """Check if launcher identity is set up, including token health."""
    identity = getattr(request.app.state, "launcher_identity", None)
    if not identity:
        return IdentityStatus(exists=False)

    import time
    info = get_token_info()
    expires_at = info.get("exp") if info else None
    valid = bool(expires_at and time.time() < expires_at)

    return IdentityStatus(
        exists=True,
        username=identity.username,
        email=identity.email,
        backend_url=identity.backend_url,
        keypair_id=identity.keypair_id,
        token_expires_at=expires_at,
        token_valid=valid,
    )


class RefreshResponse(BaseModel):
    ok: bool
    token_expires_at: Optional[int] = None
    message: str = ""


@router.post("/identity/refresh-token", response_model=RefreshResponse)
async def refresh_token(request: Request) -> RefreshResponse:
    """Manually refresh the launcher token.

    Mints a new RS256 JWT and writes it to ~/.pixsim/token.
    MCP/bridge pick up the new token on their next read.
    """
    identity = getattr(request.app.state, "launcher_identity", None)
    if not identity:
        raise HTTPException(status_code=404, detail="No identity configured")

    ok = refresh_stored_token(identity)
    if not ok:
        raise HTTPException(status_code=500, detail="Token refresh failed — keypair may be missing")

    info = get_token_info()
    expires_at = info.get("exp") if info else None

    # Emit event so WebSocket subscribers see the refresh
    try:
        from launcher.core.event_bus import get_event_bus, EventTypes
        get_event_bus().publish_simple(EventTypes.TOKEN_REFRESHED, "auth", {
            "expires_at": expires_at,
            "manual": True,
        })
    except Exception:
        pass

    return RefreshResponse(ok=True, token_expires_at=expires_at, message="Token refreshed")


@router.post("/identity/setup/create", response_model=SetupResponse)
async def setup_create(payload: SetupCreateRequest, request: Request) -> SetupResponse:
    """Create admin account on local backend and store identity.

    1. Ensures backend is reachable
    2. Registers admin user via backend API
    3. Logs in to get a token
    4. Creates launcher identity + keypair
    """
    if identity_exists():
        raise HTTPException(status_code=409, detail="Identity already exists")

    backend_url = "http://localhost:8000"

    # Register the admin user on the backend
    async with httpx.AsyncClient(timeout=10) as client:
        # Try to register
        try:
            reg_resp = await client.post(
                f"{backend_url}/api/v1/auth/register",
                json={
                    "username": payload.username,
                    "password": payload.password,
                    "email": payload.email or f"{payload.username}@localhost",
                    "is_admin": True,
                },
            )
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail="Backend not reachable at http://localhost:8000 — start it first.",
            )

        if reg_resp.status_code == 409:
            # User already exists — try logging in instead
            pass
        elif reg_resp.status_code >= 400:
            detail = _extract_detail(reg_resp)
            raise HTTPException(status_code=reg_resp.status_code, detail=f"Registration failed: {detail}")

        # Log in to get user_id
        login_resp = await client.post(
            f"{backend_url}/api/v1/auth/login",
            json={"username": payload.username, "password": payload.password},
        )
        if login_resp.status_code != 200:
            detail = _extract_detail(login_resp)
            raise HTTPException(status_code=login_resp.status_code, detail=f"Login failed: {detail}")

        login_data = login_resp.json()
        user_id = login_data.get("user", {}).get("id") or login_data.get("user_id") or 0
        email = login_data.get("user", {}).get("email") or payload.email or ""
        token = login_data.get("token") or login_data.get("access_token", "")

    identity = create_identity(
        user_id=int(user_id),
        username=payload.username,
        email=email,
        backend_url=backend_url,
    )
    request.app.state.launcher_identity = identity

    # Store login token so MCP server and bridge can authenticate
    if token:
        _store_login_token(token)

    return SetupResponse(ok=True, message="Admin account created", username=identity.username)


@router.post("/identity/setup/link", response_model=SetupResponse)
async def setup_link(payload: SetupLinkRequest, request: Request) -> SetupResponse:
    """Link to an existing backend by logging in.

    1. Calls /api/v1/auth/login on the target backend
    2. Extracts user info from the response
    3. Creates launcher identity + keypair
    """
    if identity_exists():
        raise HTTPException(status_code=409, detail="Identity already exists")

    backend_url = payload.backend_url.rstrip("/")

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            login_resp = await client.post(
                f"{backend_url}/api/v1/auth/login",
                json={"username": payload.username, "password": payload.password},
            )
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail=f"Backend not reachable at {backend_url}")

        if login_resp.status_code != 200:
            detail = _extract_detail(login_resp)
            raise HTTPException(status_code=login_resp.status_code, detail=f"Login failed: {detail}")

        login_data = login_resp.json()
        user_id = login_data.get("user", {}).get("id") or login_data.get("user_id") or 0
        email = login_data.get("user", {}).get("email") or ""
        username = login_data.get("user", {}).get("username") or payload.username
        token = login_data.get("token") or login_data.get("access_token", "")

    identity = create_identity(
        user_id=int(user_id),
        username=username,
        email=email,
        backend_url=backend_url,
    )
    request.app.state.launcher_identity = identity

    # Store login token so MCP server and bridge can authenticate
    if token:
        _store_login_token(token)

    return SetupResponse(ok=True, message=f"Linked to {backend_url}", username=identity.username)


# ── System info (aggregated launcher + backend status) ─────────────


class BackendStatus(BaseModel):
    reachable: bool = False
    status: Optional[str] = None         # healthy / degraded
    database: Optional[str] = None       # connected / error
    redis: Optional[str] = None          # connected / disconnected
    providers: list[str] = []
    api_version: Optional[str] = None
    build_sha: Optional[str] = None
    server_time: Optional[str] = None


class LauncherStatus(BaseModel):
    version: str
    uptime_seconds: float
    managers: dict[str, bool] = {}


class SystemInfo(BaseModel):
    launcher: LauncherStatus
    backend: BackendStatus
    identity: IdentityStatus


@router.get("/system-info", response_model=SystemInfo)
async def get_system_info(request: Request) -> SystemInfo:
    """Combined launcher + backend status for the Account panel."""
    import time as _time
    from launcher.core import __version__

    # --- Identity ---
    identity_obj = getattr(request.app.state, "launcher_identity", None)
    if identity_obj:
        info = get_token_info()
        expires_at = info.get("exp") if info else None
        valid = bool(expires_at and _time.time() < expires_at)
        identity_resp = IdentityStatus(
            exists=True,
            username=identity_obj.username,
            email=identity_obj.email,
            backend_url=identity_obj.backend_url,
            keypair_id=identity_obj.keypair_id,
            token_expires_at=expires_at,
            token_valid=valid,
        )
    else:
        identity_resp = IdentityStatus(exists=False)

    # --- Launcher ---
    from ..dependencies import get_process_manager as _get_pm, get_health_manager as _get_hm, get_log_manager as _get_lm
    try:
        pm = _get_pm()
        hm = _get_hm()
        lm = _get_lm()
    except Exception:
        pm = hm = lm = None

    from launcher.api.routes.health import _api_start_time
    launcher_resp = LauncherStatus(
        version=__version__,
        uptime_seconds=_time.time() - _api_start_time,
        managers={
            "process_manager": pm is not None,
            "health_manager": hm.is_running() if hm else False,
            "log_manager": lm.is_monitoring() if lm else False,
        },
    )

    # --- Backend (proxy health + version) ---
    backend_url = identity_obj.backend_url if identity_obj else "http://localhost:8000"
    backend_resp = BackendStatus()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            health_r, version_r = await asyncio.gather(
                client.get(f"{backend_url}/health"),
                client.get(f"{backend_url}/api/v1/version"),
                return_exceptions=True,
            )
            if isinstance(health_r, httpx.Response) and health_r.status_code == 200:
                h = health_r.json()
                backend_resp.reachable = True
                backend_resp.status = h.get("status")
                backend_resp.database = h.get("database")
                backend_resp.redis = h.get("redis")
                backend_resp.providers = h.get("providers", [])
            if isinstance(version_r, httpx.Response) and version_r.status_code == 200:
                v = version_r.json()
                backend_resp.reachable = True
                backend_resp.api_version = v.get("api_version")
                backend_resp.build_sha = v.get("build_sha")
                backend_resp.server_time = v.get("server_time")
    except Exception:
        pass

    return SystemInfo(launcher=launcher_resp, backend=backend_resp, identity=identity_resp)


def _extract_detail(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        return data.get("detail") or data.get("message") or resp.text
    except Exception:
        return resp.text
