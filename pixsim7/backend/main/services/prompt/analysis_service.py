"""
Prompt Analysis Service

Orchestrates prompt analysis and persistence.
Re-exports from old location during migration.
"""

# Re-export from old location
from pixsim7.backend.main.services.prompt_analysis.service import PromptAnalysisService

__all__ = ["PromptAnalysisService"]
