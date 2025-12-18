"""
Credit Semantics

Canonical rules for provider credits.

This module defines:
- What credit types are valid for each provider (from manifest)
- How to filter credits to only usable types
- Display names for credit types
- Credit accounting rules
"""

from .credit_semantics import (
    CreditSemantics,
    is_valid_credit_type,
    get_usable_credits,
    get_credit_display_name,
    filter_credits_by_valid_types,
)

__all__ = [
    "CreditSemantics",
    "is_valid_credit_type",
    "get_usable_credits",
    "get_credit_display_name",
    "filter_credits_by_valid_types",
]
