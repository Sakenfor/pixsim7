"""Typed Prompt Planning IR — versioned intermediate representation.

Wraps the existing ResolutionRequest → ResolutionResult flow with provenance
tracking, deterministic hashing, and structured slot/constraint records.
"""

from .schema import PromptPlanIR
from .builder import PlanBuilder
from .hashing import compute_plan_hash

__all__ = ["PromptPlanIR", "PlanBuilder", "compute_plan_hash"]
