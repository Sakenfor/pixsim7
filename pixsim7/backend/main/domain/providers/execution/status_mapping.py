"""
Status Mapping

Maps provider-specific status codes to canonical ProviderStatus enum.

Each provider has its own status code conventions:
- Pixverse: 1=completed, 2=processing, 4/7=failed, 5/6=filtered
- Sora: "completed", "in_progress", "failed", etc.
- etc.

This module provides helpers for consistent status mapping.
"""
from typing import Optional, Dict, Any
import logging

from pixsim7.backend.main.domain.enums import ProviderStatus

logger = logging.getLogger(__name__)


# Known status mappings by provider
# These are defaults; providers define canonical mappings in their manifest's
# status_mapping_notes field.
_STATUS_MAPPINGS: Dict[str, Dict[Any, ProviderStatus]] = {
    "pixverse": {
        1: ProviderStatus.COMPLETED,
        2: ProviderStatus.PROCESSING,
        4: ProviderStatus.FAILED,
        5: ProviderStatus.FILTERED,
        6: ProviderStatus.FILTERED,
        7: ProviderStatus.FAILED,
    },
    "sora": {
        "completed": ProviderStatus.COMPLETED,
        "in_progress": ProviderStatus.PROCESSING,
        "queued": ProviderStatus.PENDING,
        "failed": ProviderStatus.FAILED,
        "cancelled": ProviderStatus.CANCELLED,
    },
    "remaker": {
        "completed": ProviderStatus.COMPLETED,
        "processing": ProviderStatus.PROCESSING,
        "pending": ProviderStatus.PENDING,
        "failed": ProviderStatus.FAILED,
    },
}


class StatusMapper:
    """
    Maps provider-specific status codes to canonical ProviderStatus.

    Usage:
        mapper = StatusMapper("pixverse")
        status = mapper.map(2)  # ProviderStatus.PROCESSING
    """

    def __init__(self, provider_id: str):
        """
        Initialize status mapper for a provider.

        Args:
            provider_id: Provider identifier
        """
        self.provider_id = provider_id
        self._mapping = _STATUS_MAPPINGS.get(provider_id, {})

    def map(self, provider_status: Any) -> ProviderStatus:
        """
        Map provider status to canonical ProviderStatus.

        Args:
            provider_status: Provider-specific status code/string

        Returns:
            Canonical ProviderStatus

        Note:
            Returns PENDING for unknown status codes and logs a warning.
        """
        if provider_status in self._mapping:
            return self._mapping[provider_status]

        # Try string conversion for numeric codes
        if isinstance(provider_status, int):
            str_status = str(provider_status)
            if str_status in self._mapping:
                return self._mapping[str_status]

        # Try int conversion for string codes
        if isinstance(provider_status, str):
            try:
                int_status = int(provider_status)
                if int_status in self._mapping:
                    return self._mapping[int_status]
            except ValueError:
                pass

            # Try case-insensitive string matching
            lower_status = provider_status.lower()
            for key, value in self._mapping.items():
                if isinstance(key, str) and key.lower() == lower_status:
                    return value

        logger.warning(
            f"Unknown status code {provider_status!r} for provider {self.provider_id}, "
            f"defaulting to PENDING"
        )
        return ProviderStatus.PENDING

    def is_terminal(self, provider_status: Any) -> bool:
        """
        Check if a status is terminal (no further polling needed).

        Args:
            provider_status: Provider-specific status code

        Returns:
            True if status is COMPLETED, FAILED, FILTERED, or CANCELLED
        """
        mapped = self.map(provider_status)
        return mapped in (
            ProviderStatus.COMPLETED,
            ProviderStatus.FAILED,
            ProviderStatus.FILTERED,
            ProviderStatus.CANCELLED,
        )

    def is_success(self, provider_status: Any) -> bool:
        """
        Check if a status indicates success.

        Args:
            provider_status: Provider-specific status code

        Returns:
            True if status is COMPLETED
        """
        return self.map(provider_status) == ProviderStatus.COMPLETED

    def is_failure(self, provider_status: Any) -> bool:
        """
        Check if a status indicates failure.

        Args:
            provider_status: Provider-specific status code

        Returns:
            True if status is FAILED or FILTERED
        """
        mapped = self.map(provider_status)
        return mapped in (ProviderStatus.FAILED, ProviderStatus.FILTERED)


def map_provider_status(provider_id: str, provider_status: Any) -> ProviderStatus:
    """
    Map provider-specific status to canonical ProviderStatus.

    Convenience function that creates a StatusMapper internally.

    Args:
        provider_id: Provider identifier
        provider_status: Provider-specific status code

    Returns:
        Canonical ProviderStatus
    """
    return StatusMapper(provider_id).map(provider_status)


def get_status_mapping_notes(provider_id: str) -> Optional[str]:
    """
    Get status mapping documentation for a provider.

    Reads from provider's manifest if available.

    Args:
        provider_id: Provider identifier

    Returns:
        Status mapping notes or None
    """
    try:
        from pixsim7.backend.main.domain.providers.registry import registry
        provider = registry.get(provider_id)
        manifest = provider.get_manifest() if hasattr(provider, 'get_manifest') else None
        if manifest and hasattr(manifest, 'status_mapping_notes'):
            return manifest.status_mapping_notes
    except Exception:
        pass
    return None
