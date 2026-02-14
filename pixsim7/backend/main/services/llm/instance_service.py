"""
LLM Provider Instance Service

Manages CRUD operations for LLM provider instances and resolves
instance configuration for provider adapters. Uses the shared
ProviderInstanceConfig table with kind=LLM.
"""
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.providers import (
    ProviderInstanceConfig,
    ProviderInstanceConfigKind,
)
from pixsim7.backend.main.services.provider_instance_base import (
    ProviderInstanceServiceBase,
    ProviderInstanceConfigError,
)

logger = logging.getLogger(__name__)


def validate_instance_config(provider_id: str, config: dict) -> None:
    """
    Validate instance config for a specific provider type.

    Args:
        provider_id: The provider type (e.g., "cmd-llm", "openai-llm")
        config: The configuration dict to validate

    Raises:
        ProviderInstanceConfigError: If validation fails
    """
    if not isinstance(config, dict):
        raise ProviderInstanceConfigError(provider_id, "Config must be a dictionary")

    if provider_id == "cmd-llm":
        # cmd-llm requires 'command' field
        if not config.get("command"):
            raise ProviderInstanceConfigError(
                provider_id,
                "Config must include 'command' field with the CLI command to execute"
            )
        command = config["command"]
        if not isinstance(command, str) or not command.strip():
            raise ProviderInstanceConfigError(
                provider_id,
                "'command' must be a non-empty string"
            )

        # Validate optional 'args' field
        if "args" in config:
            args = config["args"]
            if not isinstance(args, (str, list)):
                raise ProviderInstanceConfigError(
                    provider_id,
                    "'args' must be a string or list of strings"
                )
            if isinstance(args, list) and not all(isinstance(a, str) for a in args):
                raise ProviderInstanceConfigError(
                    provider_id,
                    "'args' list must contain only strings"
                )

        # Validate optional 'timeout' field
        if "timeout" in config:
            timeout = config["timeout"]
            if not isinstance(timeout, (int, float)) or timeout <= 0:
                raise ProviderInstanceConfigError(
                    provider_id,
                    "'timeout' must be a positive number (seconds)"
                )

    elif provider_id == "openai-llm":
        # openai-llm: optional api_key and base_url
        if "api_key" in config:
            api_key = config["api_key"]
            if not isinstance(api_key, str):
                raise ProviderInstanceConfigError(
                    provider_id,
                    "'api_key' must be a string"
                )
        if "base_url" in config:
            base_url = config["base_url"]
            if not isinstance(base_url, str):
                raise ProviderInstanceConfigError(
                    provider_id,
                    "'base_url' must be a string"
                )

    elif provider_id == "anthropic-llm":
        # anthropic-llm: optional api_key
        if "api_key" in config:
            api_key = config["api_key"]
            if not isinstance(api_key, str):
                raise ProviderInstanceConfigError(
                    provider_id,
                    "'api_key' must be a string"
                )

    # Other providers: no specific validation (extensible)
    # Add new provider validations here as needed


class LlmInstanceService(ProviderInstanceServiceBase):
    """
    Service for managing LLM provider instances.

    Provides:
    - CRUD operations for instances
    - Instance resolution by ID or provider
    - Config extraction for provider adapters
    """

    _kind = ProviderInstanceConfigKind.LLM

    # ===== CRUD Operations =====

    async def create_instance(
        self,
        provider_id: str,
        label: str,
        config: dict,
        description: str | None = None,
        enabled: bool = True,
        priority: int = 0,
        owner_user_id: int | None = None,
    ) -> ProviderInstanceConfig:
        """
        Create a new LLM provider instance.

        Raises:
            ProviderInstanceConfigError: If config validation fails
        """
        validate_instance_config(provider_id, config)

        instance = await self._create(
            provider_id=provider_id,
            label=label,
            config=config,
            description=description,
            enabled=enabled,
            priority=priority,
            owner_user_id=owner_user_id,
        )

        logger.info(
            f"Created LLM instance: id={instance.id}, "
            f"provider={provider_id}, label={label}"
        )
        return instance

    async def get_instance(self, instance_id: int) -> ProviderInstanceConfig | None:
        """Get LLM instance by ID."""
        return await self._get_by_id(instance_id)

    async def get_instance_by_id(self, instance_id: int) -> ProviderInstanceConfig | None:
        """Alias for get_instance."""
        return await self._get_by_id(instance_id)

    async def list_instances(
        self,
        provider_id: str | None = None,
        enabled_only: bool = True,
        owner_user_id: int | None = None,
    ) -> list[ProviderInstanceConfig]:
        """List LLM instances with optional filters."""
        filters = []
        if provider_id:
            filters.append(ProviderInstanceConfig.provider_id == provider_id)
        if owner_user_id is not None:
            filters.append(ProviderInstanceConfig.owner_user_id == owner_user_id)

        return await self._list(*filters, enabled_only=enabled_only)

    async def list_all_instances(self) -> list[ProviderInstanceConfig]:
        """List all instances (including disabled)."""
        return await self._list(enabled_only=False)

    async def update_instance(
        self,
        instance_id: int,
        **updates,
    ) -> ProviderInstanceConfig | None:
        """
        Update an LLM instance.

        Raises:
            ProviderInstanceConfigError: If config validation fails
        """
        instance = await self._get_by_id(instance_id)
        if not instance:
            return None

        if "config" in updates:
            validate_instance_config(instance.provider_id, updates["config"])

        result = await self._apply_updates(
            instance,
            {"label", "config", "description", "enabled", "priority"},
            updates,
        )

        logger.info(f"Updated LLM instance: id={instance_id}")
        return result

    async def delete_instance(self, instance_id: int) -> bool:
        """Delete an LLM instance."""
        instance = await self._get_by_id(instance_id)
        if not instance:
            return False

        await self._delete_instance(instance)
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
        """
        if instance_id is None:
            return None

        instance = await self._get_by_id(instance_id)
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
        """Get command configuration for a cmd-llm instance."""
        if instance_id is None:
            return (None, [], 60)

        instance = await self._get_by_id(instance_id)
        if instance is None or instance.provider_id != "cmd-llm":
            return (None, [], 60)

        return instance.get_command_config()


# ===== Helper Functions =====

def resolve_command_config_from_instance(
    instance_config: dict | None,
) -> tuple[str | None, list[str] | None, int | None]:
    """
    Extract command config from instance config dict.

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
