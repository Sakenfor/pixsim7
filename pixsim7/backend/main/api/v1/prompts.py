"""
Prompt Versioning API - Compatibility Layer

This module re-exports the router from the prompts/ package for backward compatibility.
New code should import from the prompts/ package directly.

Deprecated location - import from prompts/ package instead:
- prompts.schemas: Request/Response models
- prompts.families: Family and Version CRUD
- prompts.variants: Variant feedback
- prompts.analytics: Analytics and comparisons
- prompts.operations: Advanced operations
"""

# Re-export router from the prompts package for backward compatibility
from .prompts import router

__all__ = ["router"]
