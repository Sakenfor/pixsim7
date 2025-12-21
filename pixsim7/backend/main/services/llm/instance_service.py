"""
LLM Provider Instance Service

Manages CRUD operations for LLM provider instances and resolves
instance configuration for provider adapters.
"""
import logging
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.providers import LlmProviderInstance

logger = logging.getLogger(__name__)


class LlmInstanceService:
    """
    Service for managing LLM provider instances.

    Provides:
    - CRUD operations for instances
    - Instance resolution by ID or provider
    - Config extraction for provider adapters
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    # ===== CRUD Operations =====

    async def create_instance(
        self,
        provider_id: str,
        label: str,
        config: dict,
        description: str | None = None,
        enabled: bool = True,
        priority: int = 0,
    ) -> LlmProviderInstance:
        """
        Create a new provider instance.

        Args:
            provider_id: Provider this instance configures (e.g., "cmd-llm")
            label: Human-readable name (e.g., "Claude CLI")
            config: Provider-specific configuration dict
            description: Optional description
            enabled: Whether instance is active
            priority: Display priority (higher = first)

        Returns:
            Created instance
        """
        instance = LlmProviderInstance(
            provider_id=provider_id,
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
            f"Created LLM instance: id={instance.id}, "
            f"provider={provider_id}, label={label}"
        )
        return instance

    async def get_instance(self, instance_id: int) -> LlmProviderInstance | None:
        """Get instance by ID."""
        return await self.session.get(LlmProviderInstance, instance_id)

    async def get_instance_by_id(self, instance_id: int) -> LlmProviderInstance | None:
        """Alias for get_instance."""
        return await self.get_instance(instance_id)

    async def list_instances(
        self,
        provider_id: str | None = None,
        enabled_only: bool = True,
    ) -> list[LlmProviderInstance]:
        """
        List provider instances.

        Args:
            provider_id: Filter by provider (optional)
            enabled_only: Only return enabled instances (default True)

        Returns:
            List of instances, ordered by priority (desc) then label
        """
        stmt = select(LlmProviderInstance)

        if provider_id:
            stmt = stmt.where(LlmProviderInstance.provider_id == provider_id)

        if enabled_only:
            stmt = stmt.where(LlmProviderInstance.enabled == True)

        stmt = stmt.order_by(
            LlmProviderInstance.priority.desc(),
            LlmProviderInstance.label
        )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_all_instances(self) -> list[LlmProviderInstance]:
        """List all instances (including disabled)."""
        return await self.list_instances(enabled_only=False)

    async def update_instance(
        self,
        instance_id: int,
        **updates,
    ) -> LlmProviderInstance | None:
        """
        Update an instance.

        Args:
            instance_id: Instance to update
            **updates: Fields to update (label, config, description, enabled, priority)

        Returns:
            Updated instance or None if not found
        """
        instance = await self.get_instance(instance_id)
        if not instance:
            return None

        allowed_fields = {"label", "config", "description", "enabled", "priority"}
        for key, value in updates.items():
            if key in allowed_fields:
                setattr(instance, key, value)

        await self.session.flush()
        await self.session.refresh(instance)

        logger.info(f"Updated LLM instance: id={instance_id}")
        return instance

    async def delete_instance(self, instance_id: int) -> bool:
        """
        Delete an instance.

        Args:
            instance_id: Instance to delete

        Returns:
            True if deleted, False if not found
        """
        instance = await self.get_instance(instance_id)
        if not instance:
            return False

        await self.session.delete(instance)
        await self.session.flush()

        logger.info(f"Deleted LLM instance: id={instance_id}")
        return True

    # ===== Instance Resolution =====

    async def resolve_instance_config(
        self,
        provider_id: str,
        instance_id: int | None = None,
    ) -> dict | None:
        """
        Resolve configuration for a provider, optionally from a specific instance.

        Args:
            provider_id: Provider ID
            instance_id: Optional instance ID to use

        Returns:
            Config dict if instance found, None otherwise
        """
        if instance_id is None:
            return None

        instance = await self.get_instance(instance_id)
        if instance is None:
            logger.warning(f"Instance not found: id={instance_id}")
            return None

        if instance.provider_id != provider_id:
            logger.warning(
                f"Instance provider mismatch: "
                f"instance.provider_id={instance.provider_id}, "
                f"requested provider_id={provider_id}"
            )
            return None

        if not instance.enabled:
            logger.warning(f"Instance is disabled: id={instance_id}")
            return None

        return instance.config

    async def get_command_config(
        self,
        instance_id: int | None = None,
    ) -> tuple[str | None, list[str], int]:
        """
        Get command configuration for a cmd-llm instance.

        Args:
            instance_id: Instance ID

        Returns:
            Tuple of (command, args, timeout)
        """
        if instance_id is None:
            return (None, [], 60)

        instance = await self.get_instance(instance_id)
        if instance is None or instance.provider_id != "cmd-llm":
            return (None, [], 60)

        return instance.get_command_config()


# ===== Helper Functions =====

def resolve_command_config_from_instance(
    instance_config: dict | None,
) -> tuple[str | None, list[str] | None, int | None]:
    """
    Extract command config from instance config dict.

    Args:
        instance_config: Config dict from LlmProviderInstance

    Returns:
        Tuple of (command, args, timeout) - values are None if not in config
    """
    if instance_config is None:
        return (None, None, None)

    return (
        instance_config.get("command"),
        instance_config.get("args"),
        instance_config.get("timeout"),
    )
