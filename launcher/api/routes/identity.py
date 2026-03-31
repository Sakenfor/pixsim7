"""Identity routes — launcher auth status and first-time setup."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from launcher.core.auth import create_identity, identity_exists, LauncherIdentity, PIXSIM_DIR

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
    """Check if launcher identity is set up."""
    identity = getattr(request.app.state, "launcher_identity", None)
    if not identity:
        return IdentityStatus(exists=False)
    return IdentityStatus(
        exists=True,
        username=identity.username,
        email=identity.email,
        backend_url=identity.backend_url,
        keypair_id=identity.keypair_id,
    )


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


def _extract_detail(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        return data.get("detail") or data.get("message") or resp.text
    except Exception:
        return resp.text
