"""
Assistant Definition Service — CRUD + defaults for AI assistant profiles.

Follows the same pattern as AnalyzerDefinitionService.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assistant_definition import AssistantDefinition
from pixsim7.backend.main.shared.datetime_utils import utcnow

import logging

logger = logging.getLogger(__name__)


# ── Seed profiles (registered on first boot if table is empty) ────────

SEED_PROFILES = [
    AssistantDefinition(
        assistant_id="assistant:general",
        name="General Assistant",
        description="All-purpose assistant with full tool access",
        icon="messageSquare",
        audience="user",
        is_default=True,
    ),
    AssistantDefinition(
        assistant_id="assistant:code-helper",
        name="Code Helper",
        description="Dev-focused assistant with access to plans and codegen tools",
        icon="code",
        audience="dev",
        system_prompt="You are a senior software engineer. Be precise, suggest code, and reference specific files.",
    ),
    AssistantDefinition(
        assistant_id="assistant:creative",
        name="Creative Director",
        description="Helps with generation prompts, asset curation, and visual direction",
        icon="sparkles",
        audience="user",
        system_prompt="You are a creative director. Focus on visual aesthetics, prompt craft, and artistic direction.",
        allowed_contracts=["user.assistant", "prompts.authoring"],
    ),
    AssistantDefinition(
        assistant_id="assistant:quick",
        name="Quick Chat",
        description="Fast, concise responses. No tools — pure text chat.",
        icon="zap",
        model_id="openai:gpt-4o-mini",
        method="api",
        audience="user",
        allowed_contracts=[],
        system_prompt="Be extremely concise. Answer in 1-2 sentences when possible.",
    ),
]


async def seed_default_profiles(db: AsyncSession) -> int:
    """Seed default assistant profiles if none exist."""
    result = await db.execute(select(AssistantDefinition).limit(1))
    if result.scalar_one_or_none() is not None:
        return 0  # Already seeded

    for profile in SEED_PROFILES:
        db.add(profile)

    await db.commit()
    logger.info(f"Seeded {len(SEED_PROFILES)} default assistant profiles")
    return len(SEED_PROFILES)


# ── CRUD ──────────────────────────────────────────────────────────────


async def list_profiles(
    db: AsyncSession,
    user_id: Optional[int] = None,
    include_global: bool = True,
) -> list[AssistantDefinition]:
    """List assistant profiles visible to a user.

    Returns global profiles + user's own profiles, ordered by is_default desc, name asc.
    """
    conditions = [AssistantDefinition.enabled == True]  # noqa: E712

    if user_id is not None:
        if include_global:
            conditions.append(
                (AssistantDefinition.owner_user_id == user_id)
                | (AssistantDefinition.owner_user_id == None)  # noqa: E711
            )
        else:
            conditions.append(AssistantDefinition.owner_user_id == user_id)
    else:
        conditions.append(AssistantDefinition.owner_user_id == None)  # noqa: E711

    stmt = (
        select(AssistantDefinition)
        .where(and_(*conditions))
        .order_by(AssistantDefinition.is_default.desc(), AssistantDefinition.name)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_profile(
    db: AsyncSession,
    assistant_id: str,
) -> Optional[AssistantDefinition]:
    """Get a profile by assistant_id."""
    stmt = select(AssistantDefinition).where(
        AssistantDefinition.assistant_id == assistant_id
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_profile(
    db: AsyncSession,
    *,
    assistant_id: str,
    name: str,
    owner_user_id: Optional[int] = None,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    model_id: Optional[str] = None,
    method: Optional[str] = None,
    system_prompt: Optional[str] = None,
    audience: str = "user",
    allowed_contracts: Optional[list[str]] = None,
    config: Optional[dict] = None,
) -> AssistantDefinition:
    """Create a new assistant profile."""
    profile = AssistantDefinition(
        assistant_id=assistant_id,
        name=name,
        description=description,
        icon=icon,
        model_id=model_id,
        method=method,
        system_prompt=system_prompt,
        audience=audience,
        allowed_contracts=allowed_contracts or [],
        config=config or {},
        owner_user_id=owner_user_id,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession,
    assistant_id: str,
    updates: dict,
) -> Optional[AssistantDefinition]:
    """Update a profile. Returns None if not found."""
    profile = await get_profile(db, assistant_id)
    if not profile:
        return None

    for key, value in updates.items():
        if hasattr(profile, key) and key not in ("id", "assistant_id", "created_at"):
            setattr(profile, key, value)

    profile.updated_at = utcnow()
    profile.version += 1
    await db.commit()
    await db.refresh(profile)
    return profile


async def delete_profile(
    db: AsyncSession,
    assistant_id: str,
) -> bool:
    """Soft-delete a profile."""
    profile = await get_profile(db, assistant_id)
    if not profile:
        return False
    profile.enabled = False
    profile.updated_at = utcnow()
    await db.commit()
    return True


async def set_user_default(
    db: AsyncSession,
    user_id: int,
    assistant_id: str,
) -> None:
    """Set a profile as the user's default. Clears other defaults for that user."""
    # Clear existing defaults for user
    stmt = select(AssistantDefinition).where(
        and_(
            AssistantDefinition.owner_user_id == user_id,
            AssistantDefinition.is_default == True,  # noqa: E712
        )
    )
    result = await db.execute(stmt)
    for p in result.scalars().all():
        p.is_default = False

    # Set new default
    profile = await get_profile(db, assistant_id)
    if profile:
        profile.is_default = True
        await db.commit()


async def resolve_user_profile(
    db: AsyncSession,
    user_id: int,
    assistant_id: Optional[str] = None,
) -> Optional[AssistantDefinition]:
    """Resolve which profile to use for a user.

    Priority: explicit assistant_id > user's default > global default > first available.
    """
    if assistant_id:
        return await get_profile(db, assistant_id)

    # User's default
    stmt = select(AssistantDefinition).where(
        and_(
            AssistantDefinition.owner_user_id == user_id,
            AssistantDefinition.is_default == True,  # noqa: E712
            AssistantDefinition.enabled == True,  # noqa: E712
        )
    )
    result = await db.execute(stmt)
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    # Global default
    stmt = select(AssistantDefinition).where(
        and_(
            AssistantDefinition.owner_user_id == None,  # noqa: E711
            AssistantDefinition.is_default == True,  # noqa: E712
            AssistantDefinition.enabled == True,  # noqa: E712
        )
    )
    result = await db.execute(stmt)
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    # First available
    profiles = await list_profiles(db, user_id=user_id)
    return profiles[0] if profiles else None
