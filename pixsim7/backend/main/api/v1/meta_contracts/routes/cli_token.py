"""Meta-contract cli token endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.shared.config import settings

from ..models import (
    CliTokenResponse,
)
from ..agent_send import (
    _normalize_agent_type_hint,
)

router = APIRouter(tags=["meta"])


@router.post("/agents/cli-token", response_model=CliTokenResponse)
async def generate_cli_token(
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
    scope: str = Query("dev", description="Tool scope: 'user' or 'dev'"),
    hours: int = Query(24, ge=1, le=168, description="Token lifetime in hours (max 7 days)"),
    agent_type: str = Query(
        "claude",
        description="Provider/engine hint for profile defaults (e.g. claude, codex).",
    ),
) -> CliTokenResponse:
    """Generate a CLI agent token for standalone CLI use with MCP tools.

    Mints a proper agent token with agent_id + on_behalf_of so all API
    calls made by the CLI agent are distinguishable from human actions.
    """
    import secrets
    from pixsim7.backend.main.domain import UserSession
    from pixsim7.backend.main.api.v1.agent_profiles import resolve_agent_profile
    from datetime import timedelta
    from pixsim7.backend.main.services.user.token_policy import (
        TokenKind,
        mint_token,
        resolve_inheritable_agent_permissions,
    )
    from pixsim7.backend.main.shared.auth import decode_access_token

    normalized_agent_type = _normalize_agent_type_hint(agent_type) or "claude"
    effective_user_id = user.user_id
    resolved_profile = await resolve_agent_profile(
        db,
        effective_user_id or 0,
        None,
        agent_type=normalized_agent_type,
    )
    agent_id = resolved_profile.id if resolved_profile else f"cli-{secrets.token_hex(4)}"

    inherited_permissions = await resolve_inheritable_agent_permissions(db, effective_user_id)
    token = mint_token(
        TokenKind.AGENT,
        agent_id=agent_id,
        agent_type=normalized_agent_type,
        on_behalf_of=effective_user_id,
        permissions=inherited_permissions,
        ttl=timedelta(hours=hours),
    )

    claims = decode_access_token(token)
    token_id = claims.get("jti")
    if not isinstance(token_id, str) or not token_id.strip():
        raise HTTPException(status_code=500, detail="minted_cli_token_missing_jti")

    exp_claim = claims.get("exp")
    if isinstance(exp_claim, (int, float)):
        expires_at = datetime.fromtimestamp(exp_claim, tz=timezone.utc)
    elif isinstance(exp_claim, datetime):
        expires_at = exp_claim if exp_claim.tzinfo else exp_claim.replace(tzinfo=timezone.utc)
    else:
        raise HTTPException(status_code=500, detail="minted_cli_token_missing_exp")

    if effective_user_id is None and settings.jwt_require_session:
        raise HTTPException(
            status_code=400,
            detail="cli_token_requires_user_binding_in_strict_mode",
        )

    if effective_user_id is not None:
        db.add(
            UserSession(
                user_id=int(effective_user_id),
                token_id=token_id,
                expires_at=expires_at,
                client_type="agent_token",
                client_name=f"agent:{normalized_agent_type}:{agent_id}",
                user_agent=f"agent/{normalized_agent_type}",
            )
        )
        await db.commit()

    if normalized_agent_type == "codex":
        command = f'PIXSIM_API_TOKEN="{token}" PIXSIM_SCOPE="{scope}" codex'
    else:
        command = (
            f'PIXSIM_API_TOKEN="{token}" PIXSIM_SCOPE="{scope}" '
            f"claude --mcp-config pixsim-mcp.json"
        )

    return CliTokenResponse(
        token=token,
        expires_in_hours=hours,
        scope=scope,
        agent_id=agent_id,
        command=command,
    )
