"""
Prompt Version Service

Version management and CRUD operations.
Re-exports from old location during migration.
"""

# Re-export from old location
from pixsim7.backend.main.services.prompts.prompt_version_service import PromptVersionService

__all__ = ["PromptVersionService"]
