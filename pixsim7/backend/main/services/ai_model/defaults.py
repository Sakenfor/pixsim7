"""
AI Model Defaults service for managing default model selections.
"""
from typing import Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.dialects.postgresql import insert
from uuid import UUID
import uuid

from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
from .registry import ai_model_registry


# SQLAlchemy model for ai_model_defaults table
from sqlalchemy import Column, String, DateTime, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class AiModelDefault(Base):
    """Database model for AI model defaults."""
    __tablename__ = 'ai_model_defaults'

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope_type = Column(String(20), nullable=False)  # "global", "user", "workspace"
    scope_id = Column(String(100), nullable=True)    # ID for user/workspace, NULL for global
    capability = Column(String(50), nullable=False)  # "prompt_edit", "prompt_parse", etc.
    model_id = Column(String(100), nullable=False)   # "openai:gpt-4o-mini", etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint('scope_type', 'scope_id', 'capability', name='uq_ai_model_defaults_scope_capability'),
        Index('idx_ai_model_defaults_capability', 'capability', 'scope_type'),
    )


# In-memory fallback defaults (used if database is unavailable or no entry exists)
FALLBACK_DEFAULTS = {
    AiModelCapability.PROMPT_EDIT: "openai:gpt-4o-mini",
    AiModelCapability.PROMPT_PARSE: "prompt-dsl:simple",
    AiModelCapability.TAG_SUGGEST: "openai:gpt-4o-mini",
}


async def get_default_model(
    db: AsyncSession,
    capability: AiModelCapability,
    scope_type: str = "global",
    scope_id: Optional[str] = None
) -> str:
    """
    Get the default model ID for a given capability and scope.

    Args:
        db: Database session
        capability: The capability to look up
        scope_type: "global", "user", or "workspace"
        scope_id: ID for user/workspace scope, None for global

    Returns:
        Model ID string (e.g., "openai:gpt-4o-mini")
    """
    try:
        # Query database for default
        stmt = select(AiModelDefault).where(
            and_(
                AiModelDefault.scope_type == scope_type,
                AiModelDefault.scope_id == scope_id,
                AiModelDefault.capability == capability.value
            )
        )
        result = await db.execute(stmt)
        default = result.scalar_one_or_none()

        if default:
            return default.model_id

        # Fall back to global if user/workspace scope not found
        if scope_type != "global":
            return await get_default_model(db, capability, "global", None)

    except Exception:
        # If database query fails, use fallback
        pass

    # Use in-memory fallback
    return FALLBACK_DEFAULTS.get(capability, "prompt-dsl:simple")


async def get_all_defaults(
    db: AsyncSession,
    scope_type: str = "global",
    scope_id: Optional[str] = None
) -> Dict[str, str]:
    """
    Get all default model IDs for all capabilities in a scope.

    Returns:
        Dict mapping capability string to model ID
    """
    try:
        stmt = select(AiModelDefault).where(
            and_(
                AiModelDefault.scope_type == scope_type,
                AiModelDefault.scope_id == scope_id
            )
        )
        result = await db.execute(stmt)
        defaults = result.scalars().all()

        return {default.capability: default.model_id for default in defaults}
    except Exception:
        # Return fallback defaults
        return {cap.value: model_id for cap, model_id in FALLBACK_DEFAULTS.items()}


async def set_default_model(
    db: AsyncSession,
    capability: AiModelCapability,
    model_id: str,
    scope_type: str = "global",
    scope_id: Optional[str] = None
) -> None:
    """
    Set the default model for a capability and scope.

    Args:
        db: Database session
        capability: The capability to set
        model_id: The model ID to set as default
        scope_type: "global", "user", or "workspace"
        scope_id: ID for user/workspace scope, None for global

    Raises:
        KeyError: If model_id doesn't exist in registry
        ValueError: If model doesn't support the capability
    """
    # Validate model exists and supports capability
    model = ai_model_registry.get_or_raise(model_id)
    if capability not in model.capabilities:
        raise ValueError(
            f"Model '{model_id}' does not support capability '{capability.value}'. "
            f"Supported: {[c.value for c in model.capabilities]}"
        )

    # Upsert default (insert or update if exists)
    stmt = insert(AiModelDefault).values(
        scope_type=scope_type,
        scope_id=scope_id,
        capability=capability.value,
        model_id=model_id
    )
    stmt = stmt.on_conflict_do_update(
        constraint='uq_ai_model_defaults_scope_capability',
        set_={'model_id': model_id, 'updated_at': func.now()}
    )
    await db.execute(stmt)
    await db.commit()


async def set_all_defaults(
    db: AsyncSession,
    defaults: Dict[str, str],
    scope_type: str = "global",
    scope_id: Optional[str] = None
) -> None:
    """
    Set multiple defaults at once.

    Args:
        db: Database session
        defaults: Dict mapping capability string to model ID
        scope_type: "global", "user", or "workspace"
        scope_id: ID for user/workspace scope, None for global

    Raises:
        KeyError: If any model_id doesn't exist in registry
        ValueError: If any model doesn't support its capability
    """
    for capability_str, model_id in defaults.items():
        # Convert string to enum
        try:
            capability = AiModelCapability(capability_str)
        except ValueError:
            raise ValueError(f"Unknown capability: {capability_str}")

        await set_default_model(db, capability, model_id, scope_type, scope_id)
