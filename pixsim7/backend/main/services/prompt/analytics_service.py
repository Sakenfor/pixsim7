"""
Prompt Analytics Service

Diff generation, comparison, and analytics.
Re-exports from old location during migration.
"""

# Re-export from old location
from pixsim7.backend.main.services.prompts.analytics_service import PromptAnalyticsService

__all__ = ["PromptAnalyticsService"]
