"""
Provider Instance Service Base

Shared CRUD operations for ProviderInstanceConfig, scoped by kind.
Subclassed by LlmInstanceService and AnalyzerInstanceService.
"""
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.providers import (
    ProviderInstanceConfig,
    ProviderInstanceConfigKind,
)

logger = logging.getLogger(__name__)


class ProviderInstanceConfigError(Exception):
    """Base error for instance config validation failures."""
    def __init__(self, context_id: str, message: str):
        self.context_id = context_id
        self.message = message
        super().__init__(f"[{context_id}] {message}")

    @property
    def status_code(self) -> int:
        return 400


class ProviderInstanceServiceBase:
    """
    Base service for managing ProviderInstanceConfig rows scoped by kind.

    Subclasses set `_kind` and add domain-specific validation/queries.
    """

    _kind: ProviderInstanceConfigKind  # set by subclass

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Shared queries ──────────────────────────────────────────────

    async def _get_by_id(self, instance_id: int) -> Optional[ProviderInstanceConfig]:
        """Fetch instance by ID, returns None if not found or wrong kind."""
        instance = await self.session.get(ProviderInstanceConfig, instance_id)
        if not instance or instance.kind != self._kind:
            return None
        return instance

    async def _get_for_user(
        self,
        instance_id: int,
        owner_user_id: int,
    ) -> Optional[ProviderInstanceConfig]:
        """Fetch instance by ID scoped to a specific user."""
        instance = await self._get_by_id(instance_id)
        if not instance or instance.owner_user_id != owner_user_id:
            return None
        return instance

    async def _list(
        self,
        *extra_filters,
        enabled_only: bool = True,
    ) -> list[ProviderInstanceConfig]:
        """List instances of this kind with optional extra filters."""
        stmt = select(ProviderInstanceConfig).where(
            ProviderInstanceConfig.kind == self._kind,
            *extra_filters,
        )

        if enabled_only:
            stmt = stmt.where(ProviderInstanceConfig.enabled == True)  # noqa: E712

        stmt = stmt.order_by(
            ProviderInstanceConfig.priority.desc(),
            ProviderInstanceConfig.label,
        )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # ── Shared mutations ────────────────────────────────────────────

    async def _create(self, **fields) -> ProviderInstanceConfig:
        """Create and persist a new instance with kind auto-set."""
        instance = ProviderInstanceConfig(kind=self._kind, **fields)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def _apply_updates(
        self,
        instance: ProviderInstanceConfig,
        allowed_fields: set[str],
        updates: dict,
    ) -> ProviderInstanceConfig:
        """Apply a dict of updates to an instance, restricted to allowed fields."""
        for key, value in updates.items():
            if key in allowed_fields:
                setattr(instance, key, value)

        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def _delete_instance(self, instance: ProviderInstanceConfig) -> bool:
        """Delete an instance."""
        await self.session.delete(instance)
        await self.session.flush()
        return True
