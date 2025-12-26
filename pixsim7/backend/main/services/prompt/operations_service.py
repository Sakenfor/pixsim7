"""
Prompt Operations Service

Batch operations, import/export, inference, search, templates, validation.
Re-exports from old location during migration.
"""

# Re-export from old location
from pixsim7.backend.main.services.prompts.operations_service import PromptOperationsService

__all__ = ["PromptOperationsService"]
