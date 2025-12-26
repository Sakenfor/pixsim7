"""
Git-like Prompt Operations

Branch, merge, and version control operations for prompts.
"""

# Re-export from old location during migration
from pixsim7.backend.main.services.prompts.git_operations_service import GitOperationsService
from pixsim7.backend.main.services.prompts.git_branch_service import GitBranchService
from pixsim7.backend.main.services.prompts.git_merge_service import GitMergeService

__all__ = [
    "GitOperationsService",
    "GitBranchService",
    "GitMergeService",
]
