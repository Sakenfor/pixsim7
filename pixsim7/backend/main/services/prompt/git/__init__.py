"""
Git-like Prompt Operations

Branch, merge, and version control operations for prompts.
"""

from .operations import GitOperationsService
from .branch import GitBranchService
from .merge import GitMergeService

__all__ = [
    "GitOperationsService",
    "GitBranchService",
    "GitMergeService",
]
