"""
Agent Token API: mint short-lived JWTs for AI agent/service principals.

Tokens carry ``purpose: "agent"`` so the auth pipeline distinguishes them
from regular user tokens.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import (
    CurrentAdminUser,
    get_current_principal,
    get_database,
)
from pixsim7.backend.main.domain import UserSession
from pixsim7.backend.main.domain.platform.agent_profile import AgentRun
from pixsim7.backend.main.services.user.token_policy import (
    TokenKind,
    mint_token,
    resolve_inheritable_agent_permissions,
)
from pixsim7.backend.main.shared.auth import decode_access_token
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.actor import RequestPrincipal

router = APIRouter(prefix="/dev/agent-tokens", tags=["dev", "agent-tokens"])


class AgentTokenRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=120, description="Stable agent instance ID.")
    agent_type: str = Field(default="unknown", max_length=64, description="Agent type (e.g. claude, codex).")
    scopes: Optional[list[str]] = Field(default=None, description="Allowed scopes (informational for v1).")
    on_behalf_of: Optional[int] = Field(default=None, description="User ID the agent acts for.")
    run_id: Optional[str] = Field(default=None, max_length=120, description="Run/invocation ID.")
    plan_id: Optional[str] = Field(default=None, max_length=120, description="Plan being worked on.")
    ttl_hours: int = Field(default=8, ge=1, le=72, description="Token lifetime in hours (1-72).")


class AgentTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    agent_id: str
    expires_in_hours: int


def _read_expiration_datetime(claims: dict) -> datetime:
    exp_claim = claims.get("exp")
    if isinstance(exp_claim, (int, float)):
        return datetime.fromtimestamp(exp_claim, tz=timezone.utc)
    if isinstance(exp_claim, datetime):
        return exp_claim if exp_claim.tzinfo else exp_claim.replace(tzinfo=timezone.utc)
    raise HTTPException(status_code=500, detail="minted_agent_token_missing_exp")


@router.post("", response_model=AgentTokenResponse)
async def mint_agent_token(
    payload: AgentTokenRequest,
    _admin: CurrentAdminUser,
    db: AsyncSession = Depends(get_database),
):
    """Mint a short-lived agent token. Admin only."""
    inherited_permissions = await resolve_inheritable_agent_permissions(db, payload.on_behalf_of)
    token = mint_token(
        TokenKind.AGENT,
        agent_id=payload.agent_id,
        agent_type=payload.agent_type,
        scopes=payload.scopes,
        on_behalf_of=payload.on_behalf_of,
        permissions=inherited_permissions,
        run_id=payload.run_id,
        plan_id=payload.plan_id,
        ttl=timedelta(hours=payload.ttl_hours),
    )

    claims = decode_access_token(token)
    token_id = claims.get("jti")
    if not isinstance(token_id, str) or not token_id.strip():
        raise HTTPException(status_code=500, detail="minted_agent_token_missing_jti")

    effective_user_id = payload.on_behalf_of or (_admin.id if _admin.id > 0 else None)
    if effective_user_id is None and settings.jwt_require_session:
        raise HTTPException(
            status_code=400,
            detail="agent_token_requires_on_behalf_of_in_strict_mode",
        )

    if effective_user_id is not None:
        db.add(
            UserSession(
                user_id=int(effective_user_id),
                token_id=token_id,
                expires_at=_read_expiration_datetime(claims),
                client_type="agent_token",
                client_name=f"{payload.agent_type}:{payload.agent_id}",
                user_agent=f"agent/{payload.agent_type}",
            )
        )

    # Create AgentRun record if run_id is provided
    run_id = payload.run_id or claims.get("run_id")
    if run_id:
        db.add(
            AgentRun(
                profile_id=payload.agent_id,
                run_id=run_id,
                status="running",
                token_jti=token_id,
            )
        )

    await db.commit()

    return AgentTokenResponse(
        access_token=token,
        agent_id=payload.agent_id,
        expires_in_hours=payload.ttl_hours,
    )


# ──────────────────────────────────────────────────────────────────────
# Bridge-minted per-session agent tokens
#
# The client bridge runs one MCP HTTP server but spawns one Claude/Codex
# subprocess per (agent_type, chat_session_id). Each subprocess needs a
# bearer JWT whose claims identify the chat session it serves so that MCP
# tools (log_work, ask_user, etc.) resolve identity from the token rather
# than from contextvars that don't cross task boundaries. The bridge can't
# sign JWTs (signing secret is server-side only) so it asks this endpoint
# to mint one at subprocess spawn time.
#
# Plan: mcp-http-bridge-session-resolution (checkpoint per-subprocess-jwt-config)
# ──────────────────────────────────────────────────────────────────────


class BridgeAgentSessionTokenRequest(BaseModel):
    chat_session_id: Optional[str] = Field(
        default=None, max_length=120,
        description=(
            "The ChatSession UUID this subprocess will serve. Optional: a new "
            "conversation's first turn has no session id yet (it IS Claude's "
            "cli_session_id, assigned mid-turn), so the bridge mints a "
            "tab-anchored token up front using tab_id/scope_key instead. At "
            "least one of chat_session_id / tab_id / scope_key must be present."
        ),
    )
    agent_type: str = Field(
        ..., min_length=1, max_length=64,
        description="Agent engine (e.g. claude, codex).",
    )
    profile_id: str = Field(
        ..., min_length=1, max_length=120,
        description="Agent profile id (used as agent_id + profile_id claims).",
    )
    tab_id: Optional[str] = Field(
        default=None, max_length=120,
        description="UI tab id (informational; mirrored to scope_key if not supplied).",
    )
    scope_key: Optional[str] = Field(
        default=None, max_length=200,
        description="Scope key for this tab (e.g. tab:abc123).",
    )
    on_behalf_of: Optional[int] = Field(
        default=None,
        description="User id the agent acts for. Required in jwt_require_session mode.",
    )
    ttl_hours: int = Field(
        default=24, ge=1, le=72,
        description="Token lifetime in hours; per-session tokens default longer than admin-minted ones because subprocess lifecycle can span long sessions.",
    )


class BridgeAgentSessionTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    chat_session_id: Optional[str] = None
    agent_type: str


@router.post("/bridge-session", response_model=BridgeAgentSessionTokenResponse)
async def mint_bridge_agent_session_token(
    payload: BridgeAgentSessionTokenRequest,
    principal: RequestPrincipal = Depends(get_current_principal),
    db: AsyncSession = Depends(get_database),
):
    """Mint a per-(chat_session_id, agent_type) agent token for the bridge.

    Gated to bridge-purpose (``principal_type=service``) callers. The
    minted token carries ``chat_session_id`` / ``scope_key`` / ``tab_id``
    / ``agent_type`` claims so MCP tool calls resolve identity directly
    from the JWT without server-side dispatch lookups.
    """
    # Only the bridge service should call this. Bridge tokens decode to
    # principal_type="service"; admin users are explicitly allowed too so
    # ops / tests can still mint manually if needed.
    if principal.principal_type != "service" and not principal.is_admin():
        raise HTTPException(
            status_code=403,
            detail="bridge_agent_session_token_requires_service_or_admin",
        )

    # Need at least one identity anchor to mint a resolvable token. A brand-new
    # conversation has no chat_session_id yet, but the tab_id/scope_key pins the
    # token to its tab — without any of the three the token is identity-less.
    if not (payload.chat_session_id or payload.tab_id or payload.scope_key):
        raise HTTPException(
            status_code=400,
            detail="bridge_agent_session_token_requires_session_or_tab_anchor",
        )

    effective_user_id = payload.on_behalf_of
    if effective_user_id is None and principal.id and principal.id > 0:
        # User-scoped bridge token already binds a user — inherit that.
        effective_user_id = principal.id
    if effective_user_id is None and settings.jwt_require_session:
        raise HTTPException(
            status_code=400,
            detail="bridge_agent_session_token_requires_on_behalf_of_in_strict_mode",
        )

    # Mirror tab_id to scope_key if caller didn't supply one explicitly.
    scope_key = payload.scope_key or (
        f"tab:{payload.tab_id}" if payload.tab_id else None
    )

    inherited_permissions = await resolve_inheritable_agent_permissions(db, effective_user_id)
    token = mint_token(
        TokenKind.AGENT,
        agent_id=payload.profile_id,
        agent_type=payload.agent_type,
        on_behalf_of=effective_user_id,
        permissions=inherited_permissions,
        profile_id=payload.profile_id,
        chat_session_id=payload.chat_session_id,
        scope_key=scope_key,
        tab_id=payload.tab_id,
        ttl=timedelta(hours=payload.ttl_hours),
    )

    claims = decode_access_token(token)
    token_id = claims.get("jti")
    if not isinstance(token_id, str) or not token_id.strip():
        raise HTTPException(status_code=500, detail="minted_session_token_missing_jti")

    expires_at = _read_expiration_datetime(claims)
    expires_in_seconds = max(
        1,
        int((expires_at - datetime.now(timezone.utc)).total_seconds()),
    )

    # Track in UserSession so revocation works the same as for admin-minted
    # agent tokens. The bridge token chain already records the user binding;
    # we just attach the agent JWT to it so logout cascades cleanly.
    if effective_user_id is not None:
        anchor = (payload.chat_session_id or payload.tab_id or "?")[:12]
        db.add(
            UserSession(
                user_id=int(effective_user_id),
                token_id=token_id,
                expires_at=expires_at,
                client_type="bridge_agent_session",
                client_name=f"{payload.agent_type}:{anchor}",
                user_agent=f"bridge/{payload.agent_type}",
            )
        )
        await db.commit()

    return BridgeAgentSessionTokenResponse(
        access_token=token,
        expires_in_seconds=expires_in_seconds,
        chat_session_id=payload.chat_session_id,
        agent_type=payload.agent_type,
    )
