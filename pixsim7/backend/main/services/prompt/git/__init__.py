"""
Git-like Prompt Operations

Branch, merge, and version control operations for prompts.

Services:
- GitBranchService: Branch management (create, delete, list)
- GitMergeService: Merge operations with AI-powered conflict resolution
- GitOperationsService: History, rollback, revert, cherry-pick, tags
- PromptVersioningService: Common operations via shared versioning base
"""

from .operations import GitOperationsService
from .branch import GitBranchService
from .merge import GitMergeService
from .versioning_adapter import PromptVersioningService

__all__ = [
    "GitOperationsService",
    "GitBranchService",
    "GitMergeService",
    "PromptVersioningService",
]
