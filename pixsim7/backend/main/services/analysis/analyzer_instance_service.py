"""
Analyzer Instance Service

Manages CRUD operations for analyzer instances backed by ProviderInstanceConfig.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.providers import (
    ProviderInstanceConfig,
    ProviderInstanceConfigKind,
)
from pixsim7.backend.main.services.prompt.parser import analyzer_registry

logger = logging.getLogger(__name__)


class AnalyzerInstanceConfigError(Exception):
    """Raised when analyzer instance config validation fails."""
    def __init__(self, analyzer_id: str, message: str):
        self.analyzer_id = analyzer_id
        self.message = message
        super().__init__(f"[{analyzer_id}] {message}")


def _resolve_analyzer_defaults(
    analyzer_id: str,
    provider_id: Optional[str],
    model_id: Optional[str],
) -> tuple[str, Optional[str], Optional[str]]:
    analyzer_id = analyzer_registry.resolve_legacy(analyzer_id)
    analyzer_info = analyzer_registry.get(analyzer_id)
    if not analyzer_info:
        raise AnalyzerInstanceConfigError(analyzer_id, "Analyzer is not registered")

    resolved_provider_id = provider_id or analyzer_info.provider_id
    if analyzer_info.provider_id and resolved_provider_id != analyzer_info.provider_id:
        raise AnalyzerInstanceConfigError(
            analyzer_id,
            f"Provider mismatch (expected {analyzer_info.provider_id})"
        )

    if not resolved_provider_id:
        raise AnalyzerInstanceConfigError(analyzer_id, "Provider ID is required")

    resolved_model_id = model_id or analyzer_info.model_id
    return analyzer_info.id, resolved_provider_id, resolved_model_id


class AnalyzerInstanceService:
    """
    Service for managing analyzer instances.

    Uses ProviderInstanceConfig with kind=ANALYZER.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_instance(
        self,
        *,
        owner_user_id: int,
        analyzer_id: str,
        provider_id: Optional[str],
        model_id: Optional[str],
        label: str,
        config: dict,
        description: Optional[str] = None,
        enabled: bool = True,
        priority: int = 0,
    ) -> ProviderInstanceConfig:
        analyzer_id, provider_id, model_id = _resolve_analyzer_defaults(
            analyzer_id,
            provider_id,
            model_id,
        )

        if not isinstance(config, dict):
            raise AnalyzerInstanceConfigError(analyzer_id, "Config must be a dictionary")

        instance = ProviderInstanceConfig(
            kind=ProviderInstanceConfigKind.ANALYZER,
            provider_id=provider_id,
            analyzer_id=analyzer_id,
            model_id=model_id,
            owner_user_id=owner_user_id,
            label=label,
            config=config,
            description=description,
            enabled=enabled,
            priority=priority,
        )
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)

        logger.info(
            "analyzer_instance_created",
            instance_id=instance.id,
            analyzer_id=analyzer_id,
        )
        return instance

    async def get_instance(self, instance_id: int) -> Optional[ProviderInstanceConfig]:
        instance = await self.session.get(ProviderInstanceConfig, instance_id)
        if not instance or instance.kind != ProviderInstanceConfigKind.ANALYZER:
            return None
        return instance

    async def get_instance_for_user(
        self,
        *,
        instance_id: int,
        owner_user_id: int,
    ) -> Optional[ProviderInstanceConfig]:
        instance = await self.get_instance(instance_id)
        if not instance or instance.owner_user_id != owner_user_id:
            return None
        return instance

    async def list_instances(
        self,
        *,
        owner_user_id: int,
        analyzer_id: Optional[str] = None,
        provider_id: Optional[str] = None,
        enabled_only: bool = True,
    ) -> list[ProviderInstanceConfig]:
        stmt = select(ProviderInstanceConfig).where(
            ProviderInstanceConfig.kind == ProviderInstanceConfigKind.ANALYZER,
            ProviderInstanceConfig.owner_user_id == owner_user_id,
        )

        if analyzer_id:
            stmt = stmt.where(ProviderInstanceConfig.analyzer_id == analyzer_id)

        if provider_id:
            stmt = stmt.where(ProviderInstanceConfig.provider_id == provider_id)

        if enabled_only:
            stmt = stmt.where(ProviderInstanceConfig.enabled == True)

        stmt = stmt.order_by(
            ProviderInstanceConfig.priority.desc(),
            ProviderInstanceConfig.label
        )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_instance(
        self,
        *,
        instance_id: int,
        owner_user_id: int,
        **updates,
    ) -> Optional[ProviderInstanceConfig]:
        instance = await self.get_instance_for_user(
            instance_id=instance_id,
            owner_user_id=owner_user_id,
        )
        if not instance:
            return None

        if "analyzer_id" in updates:
            raise AnalyzerInstanceConfigError(
                instance.analyzer_id or "unknown",
                "Analyzer ID cannot be changed"
            )

        provider_id = updates.get("provider_id", instance.provider_id)
        model_id = updates.get("model_id", instance.model_id)
        if provider_id or model_id:
            _resolve_analyzer_defaults(
                instance.analyzer_id or "",
                provider_id,
                model_id,
            )

        if "config" in updates and not isinstance(updates["config"], dict):
            raise AnalyzerInstanceConfigError(
                instance.analyzer_id or "unknown",
                "Config must be a dictionary"
            )

        allowed_fields = {
            "provider_id",
            "model_id",
            "label",
            "description",
            "config",
            "enabled",
            "priority",
        }
        for key, value in updates.items():
            if key in allowed_fields:
                setattr(instance, key, value)

        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete_instance(
        self,
        *,
        instance_id: int,
        owner_user_id: int,
    ) -> bool:
        instance = await self.get_instance_for_user(
            instance_id=instance_id,
            owner_user_id=owner_user_id,
        )
        if not instance:
            return False

        await self.session.delete(instance)
        await self.session.flush()
        return True
