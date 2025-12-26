"""
Prompt Family Service

Family management and CRUD operations.
Re-exports from old location during migration.
"""

# Re-export from old location
from pixsim7.backend.main.services.prompts.family_service import PromptFamilyService

__all__ = ["PromptFamilyService"]
