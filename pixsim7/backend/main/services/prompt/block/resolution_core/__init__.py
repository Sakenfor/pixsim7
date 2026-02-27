from .interfaces import BlockResolver
from .legacy_adapter import adapt_legacy_slot_results
from .next_v1_resolver import NextV1Resolver
from .registry import ResolverRegistry, build_default_resolver_registry
from .types import (
    CandidateBlock,
    ConstraintKind,
    PairwiseBonus,
    ResolutionConstraint,
    ResolutionDebugOptions,
    ResolutionIntent,
    ResolutionRequest,
    ResolutionResult,
    ResolutionTarget,
    ResolutionTrace,
    ScoringConfig,
    SelectedBlock,
    TraceEvent,
)

__all__ = [
    "BlockResolver",
    "NextV1Resolver",
    "ResolverRegistry",
    "build_default_resolver_registry",
    "adapt_legacy_slot_results",
    "CandidateBlock",
    "ConstraintKind",
    "PairwiseBonus",
    "ResolutionConstraint",
    "ResolutionDebugOptions",
    "ResolutionIntent",
    "ResolutionRequest",
    "ResolutionResult",
    "ResolutionTarget",
    "ResolutionTrace",
    "ScoringConfig",
    "SelectedBlock",
    "TraceEvent",
]
