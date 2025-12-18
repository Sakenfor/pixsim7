"""
Credit Semantics

Canonical rules for provider credits.

Problem this solves:
- "any numeric key counts as credits" style bugs
- Credit type drift between providers
- Inconsistent credit handling in workers

Solution:
- credit_types from manifest are AUTHORITATIVE per provider
- Only those keys are considered "usable credits"
- Workers and services use these functions instead of ad-hoc logic
"""
from typing import Dict, Optional, TYPE_CHECKING
import logging

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.providers.models import ProviderAccount

logger = logging.getLogger(__name__)


# Default credit type display names (fallback if not in provider-specific mapping)
_DEFAULT_DISPLAY_NAMES = {
    "web": "Web Credits",
    "openapi": "API Credits",
    "standard": "Standard Credits",
    "pro": "Pro Credits",
    "api": "API Credits",
    "credits": "Credits",
}

# Provider-specific display name mappings
_PROVIDER_DISPLAY_NAMES: Dict[str, Dict[str, str]] = {
    "pixverse": {
        "web": "Web (Free)",
        "openapi": "OpenAPI (Paid)",
        "standard": "Standard",
        "pro": "Pro Tier",
    },
    "runway": {
        "standard": "Standard Credits",
        "api": "API Credits",
    },
    "kling": {
        "standard": "Credits",
        "credits": "Credits",
    },
    "sora": {
        "credits": "Credits",
    },
}


class CreditSemantics:
    """
    Canonical credit semantics for a provider.

    Use this class to:
    - Get valid credit types for a provider
    - Filter credits to only usable types
    - Get display names

    Example:
        semantics = CreditSemantics.for_provider("pixverse")
        valid_types = semantics.credit_types  # ["web", "openapi", "standard"]
        usable = semantics.filter_usable({"web": 100, "unknown": 50})  # {"web": 100}
    """

    def __init__(self, provider_id: str, credit_types: list[str]):
        """
        Initialize credit semantics for a provider.

        Args:
            provider_id: Provider identifier
            credit_types: List of valid credit types for this provider
        """
        self.provider_id = provider_id
        self.credit_types = credit_types

    @classmethod
    def for_provider(cls, provider_id: str) -> "CreditSemantics":
        """
        Get credit semantics for a provider from registry.

        Args:
            provider_id: Provider identifier

        Returns:
            CreditSemantics instance with credit_types from manifest
        """
        try:
            from pixsim7.backend.main.domain.providers.registry import registry
            provider = registry.get(provider_id)
            credit_types = provider.get_credit_types() or ["web"]
            return cls(provider_id, credit_types)
        except Exception as e:
            logger.warning(f"Could not get credit types for {provider_id}: {e}, using defaults")
            return cls(provider_id, ["web"])

    def is_valid_type(self, credit_type: str) -> bool:
        """Check if a credit type is valid for this provider."""
        return credit_type in self.credit_types

    def filter_usable(self, credits: Dict[str, int]) -> Dict[str, int]:
        """
        Filter credits dict to only include usable credit types.

        Args:
            credits: Dict of credit_type -> amount

        Returns:
            Filtered dict with only valid credit types
        """
        return {k: v for k, v in credits.items() if k in self.credit_types}

    def get_display_name(self, credit_type: str) -> str:
        """Get display name for a credit type."""
        return get_credit_display_name(credit_type, self.provider_id)

    def total_usable(self, credits: Dict[str, int]) -> int:
        """
        Get total usable credits (sum of valid types only).

        Args:
            credits: Dict of credit_type -> amount

        Returns:
            Sum of credits for valid types only
        """
        return sum(self.filter_usable(credits).values())


def is_valid_credit_type(provider_id: str, credit_type: str) -> bool:
    """
    Check if a credit type is valid for a provider.

    This is the canonical check - use this instead of ad-hoc logic.

    Args:
        provider_id: Provider identifier
        credit_type: Credit type to check

    Returns:
        True if credit type is valid for this provider
    """
    semantics = CreditSemantics.for_provider(provider_id)
    return semantics.is_valid_type(credit_type)


def get_usable_credits(account: "ProviderAccount") -> Dict[str, int]:
    """
    Get usable credits for an account (filtered by valid types).

    This prevents "any numeric key counts as credits" bugs.

    Args:
        account: ProviderAccount with credits relationship

    Returns:
        Dict of valid credit_type -> amount
    """
    if not account.credits:
        return {}

    semantics = CreditSemantics.for_provider(account.provider_id)

    usable = {}
    for credit in account.credits:
        if semantics.is_valid_type(credit.credit_type):
            usable[credit.credit_type] = credit.amount

    return usable


def filter_credits_by_valid_types(provider_id: str, credits: Dict[str, int]) -> Dict[str, int]:
    """
    Filter a credits dict to only include valid types for a provider.

    Args:
        provider_id: Provider identifier
        credits: Dict of credit_type -> amount

    Returns:
        Filtered dict with only valid credit types
    """
    semantics = CreditSemantics.for_provider(provider_id)
    return semantics.filter_usable(credits)


def get_credit_display_name(credit_type: str, provider_id: str) -> str:
    """
    Get human-readable display name for a credit type.

    Args:
        credit_type: Credit type (e.g., "web", "openapi")
        provider_id: Provider identifier

    Returns:
        Display name (e.g., "Web (Free)", "API Credits")
    """
    # Try provider-specific mapping first
    provider_map = _PROVIDER_DISPLAY_NAMES.get(provider_id, {})
    if credit_type in provider_map:
        return provider_map[credit_type]

    # Fall back to default mapping
    if credit_type in _DEFAULT_DISPLAY_NAMES:
        return _DEFAULT_DISPLAY_NAMES[credit_type]

    # Last resort: capitalize the type
    return credit_type.replace("_", " ").title()
