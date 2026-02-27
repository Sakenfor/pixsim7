from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


ResolverId = str


# ---------------------------------------------------------------------------
# Constraint kinds — the known vocabulary of hard constraints.
# Each kind expects a specific payload shape. Unknown kinds are ignored by
# resolvers (forward-compatible), but these are the ones with implementations.
# ---------------------------------------------------------------------------

class ConstraintKind:
    """Known constraint kind constants and their expected payload shapes.

    REQUIRES_TAG
        payload: {"tag": str, "value": str|list}
        Block must have the specified tag matching the expected value.

    FORBID_TAG
        payload: {"tag": str, "value": str|list}
        Block must NOT have the specified tag matching the expected value.

    REQUIRES_CAPABILITY
        payload: {"capability": str}
        Block must declare the named capability in its capabilities list.

    FORBID_PAIR
        payload: {"other_target_key": str, "other_block_id"?: str, "this_block_id"?: str}
        Block cannot be selected alongside a specific block in another target.
        If other_block_id/this_block_id are given, the constraint only fires
        for that specific pair.

    REQUIRES_OTHER_SELECTED
        payload: {"other_target_key": str}
        The named target must have a selected block before this target is
        resolved. Enforced by dependency-aware target ordering.
    """

    REQUIRES_TAG = "requires_tag"
    FORBID_TAG = "forbid_tag"
    REQUIRES_CAPABILITY = "requires_capability"
    FORBID_PAIR = "forbid_pair"
    REQUIRES_OTHER_SELECTED = "requires_other_selected"

    ALL = frozenset({
        REQUIRES_TAG,
        FORBID_TAG,
        REQUIRES_CAPABILITY,
        FORBID_PAIR,
        REQUIRES_OTHER_SELECTED,
    })


# ---------------------------------------------------------------------------
# Scoring configuration — explicit weights used by resolvers.
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class ScoringConfig:
    """Tunable scoring weights for soft-preference dimensions.

    Resolvers can accept this as a constructor argument or use the defaults.
    All values are additive score deltas applied per matching dimension.
    """

    desired_tag_bonus: float = 2.0
    avoid_tag_penalty: float = 2.5  # applied as negative
    desired_feature_bonus: float = 1.5
    rating_weight: float = 0.2  # multiplied by avg_rating (0-5)


@dataclass(slots=True)
class ResolutionDebugOptions:
    include_trace: bool = True
    include_candidate_scores: bool = True


@dataclass(slots=True)
class ResolutionTarget:
    key: str
    kind: str
    label: Optional[str] = None
    category: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ResolutionIntent:
    control_values: Dict[str, Any] = field(default_factory=dict)
    desired_tags_by_target: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    avoid_tags_by_target: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    desired_features_by_target: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    required_capabilities_by_target: Dict[str, List[str]] = field(default_factory=dict)
    targets: List[ResolutionTarget] = field(default_factory=list)


@dataclass(slots=True)
class CandidateBlock:
    block_id: str
    text: str
    package_name: Optional[str] = None
    tags: Dict[str, Any] = field(default_factory=dict)
    category: Optional[str] = None
    avg_rating: Optional[float] = None
    features: Dict[str, Any] = field(default_factory=dict)
    capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ResolutionConstraint:
    id: str
    kind: str
    target_key: Optional[str] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    severity: str = "error"


@dataclass(slots=True)
class PairwiseBonus:
    """Soft cross-target scoring signal.

    When the block already selected for *source_target* matches *source_tags*,
    candidates for *target_key* that match *candidate_tags* receive *bonus*
    added to their score.
    """

    id: str
    source_target: str  # already-resolved target key
    target_key: str  # target currently being scored
    source_tags: Dict[str, Any] = field(default_factory=dict)
    candidate_tags: Dict[str, Any] = field(default_factory=dict)
    bonus: float = 1.0


@dataclass(slots=True)
class TraceEvent:
    kind: str
    target_key: Optional[str] = None
    candidate_block_id: Optional[str] = None
    score: Optional[float] = None
    message: Optional[str] = None
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ResolutionTrace:
    events: List[TraceEvent] = field(default_factory=list)


@dataclass(slots=True)
class SelectedBlock:
    target_key: str
    block_id: str
    text: str
    score: Optional[float] = None
    reasons: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ResolutionResult:
    resolver_id: str
    seed: Optional[int]
    selected_by_target: Dict[str, SelectedBlock] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    trace: ResolutionTrace = field(default_factory=ResolutionTrace)
    diagnostics: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ResolutionRequest:
    resolver_id: str
    seed: Optional[int] = None
    intent: ResolutionIntent = field(default_factory=ResolutionIntent)
    candidates_by_target: Dict[str, List[CandidateBlock]] = field(default_factory=dict)
    constraints: List[ResolutionConstraint] = field(default_factory=list)
    pairwise_bonuses: List[PairwiseBonus] = field(default_factory=list)
    debug: ResolutionDebugOptions = field(default_factory=ResolutionDebugOptions)
    context: Dict[str, Any] = field(default_factory=dict)
