"""
Agent Token API — mint short-lived JWTs for AI agent / service principals.

Tokens carry ``purpose: "agent"`` so the auth pipeline distinguishes them
from regular user tokens.  Admin-only for v1.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentAdminUser
from pixsim7.backend.main.shared.auth import create_agent_token

router = APIRouter(prefix="/dev/agent-tokens", tags=["dev", "agent-tokens"])


# ── Schemas ──────────────────────────────────────────────────────

class AgentTokenRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=120, description="Stable agent instance ID.")
    agent_type: str = Field(default="claude-cli", max_length=64, description="Agent flavor.")
    scopes: Optional[list[str]] = Field(default=None, description="Allowed scopes (informational for v1).")
    on_behalf_of: Optional[int] = Field(default=None, description="User ID the agent acts for.")
    run_id: Optional[str] = Field(default=None, max_length=120, description="Run/invocation ID.")
    plan_id: Optional[str] = Field(default=None, max_length=120, description="Plan being worked on.")
    ttl_hours: int = Field(default=8, ge=1, le=72, description="Token lifetime (1–72 hours).")


class AgentTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    agent_id: str
    expires_in_hours: int


# ── Endpoint ─────────────────────────────────────────────────────

@router.post("", response_model=AgentTokenResponse)
async def mint_agent_token(
    payload: AgentTokenRequest,
    _admin: CurrentAdminUser,
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
    return AgentTokenResponse(
        access_token=token,
        agent_id=payload.agent_id,
        expires_in_hours=payload.ttl_hours,
    )
