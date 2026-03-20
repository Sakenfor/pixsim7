"""
Agent Token API: mint short-lived JWTs for AI agent/service principals.

Tokens carry ``purpose: "agent"`` so the auth pipeline distinguishes them
from regular user tokens.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, get_database
from pixsim7.backend.main.domain import UserSession
from pixsim7.backend.main.shared.auth import create_agent_token, decode_access_token
from pixsim7.backend.main.shared.config import settings

router = APIRouter(prefix="/dev/agent-tokens", tags=["dev", "agent-tokens"])


class AgentTokenRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=120, description="Stable agent instance ID.")
    agent_type: str = Field(default="claude-cli", max_length=64, description="Agent flavor.")
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
    token = create_agent_token(
        agent_id=payload.agent_id,
        agent_type=payload.agent_type,
        scopes=payload.scopes,
        on_behalf_of=payload.on_behalf_of,
        run_id=payload.run_id,
        plan_id=payload.plan_id,
        ttl_hours=payload.ttl_hours,
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
        await db.commit()

    return AgentTokenResponse(
        access_token=token,
        agent_id=payload.agent_id,
        expires_in_hours=payload.ttl_hours,
    )
