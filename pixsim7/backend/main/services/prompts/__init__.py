"""
Prompt Services

Split into focused services for better maintainability and AI agent navigation.

Services:
- PromptFamilyService: Family and version CRUD operations
- PromptVariantService: Variant feedback and metrics tracking
- PromptAnalyticsService: Diff generation, comparison, and analytics
- PromptOperationsService: Batch ops, import/export, inference, search, templates, validation
"""
from .family_service import PromptFamilyService
from .variant_service import PromptVariantService
from .analytics_service import PromptAnalyticsService
from .operations_service import PromptOperationsService

# Backward compatibility - maintain old import
from .prompt_version_service import PromptVersionService

__all__ = [
    "PromptFamilyService",
    "PromptVariantService",
    "PromptAnalyticsService",
    "PromptOperationsService",
    "PromptVersionService",  # Legacy
]
