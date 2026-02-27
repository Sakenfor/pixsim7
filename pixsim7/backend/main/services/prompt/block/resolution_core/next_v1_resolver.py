from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from .interfaces import BlockResolver
from .trace import add_trace_event
from .types import (
    CandidateBlock,
    ConstraintKind,
    PairwiseBonus,
    ResolutionConstraint,
    ResolutionRequest,
    ResolutionResult,
    ScoringConfig,
    SelectedBlock,
)


def _value_matches(actual: Any, expected: Any) -> bool:
    if isinstance(actual, list):
        return any(_value_matches(item, expected) for item in actual)
    if isinstance(expected, list):
        return any(_value_matches(actual, item) for item in expected)
    return actual == expected


def _tag_matches(tags: dict[str, Any], key: str, expected: Any) -> bool:
    if key not in tags:
        return False
    return _value_matches(tags.get(key), expected)


def _feature_matches(features: dict[str, Any], key: str, expected: Any) -> bool:
    if key not in features:
        return False
    return _value_matches(features.get(key), expected)


def _seeded_tiebreaker(seed: int, target_key: str, block_id: str) -> float:
    """Deterministic tiny score jitter for tie-breaking.

    Returns a value in [0, 0.001) so it only matters when real scores are equal.
    Same seed + same target + same block_id always produces the same value.
    """
    h = hashlib.md5(f"{seed}:{target_key}:{block_id}".encode()).hexdigest()
    return int(h[:8], 16) / (0xFFFFFFFF * 1000 + 1)


@dataclass(slots=True)
class _ScoredCandidate:
    candidate: CandidateBlock
    score: float
    reasons: list[str]


class NextV1Resolver:
    """Pilot resolver: hard constraints + soft scoring + trace.

    This intentionally starts simple and generic. It is suitable for a parallel
    `next_v1` engine proof without changing current template resolution flows.
    """

    resolver_id = "next_v1"

    def __init__(self, scoring: ScoringConfig | None = None) -> None:
        self.scoring = scoring or ScoringConfig()

    def resolve(self, request: ResolutionRequest) -> ResolutionResult:
        result = ResolutionResult(resolver_id=self.resolver_id, seed=request.seed)
        selected_so_far: dict[str, SelectedBlock] = {}
        targets = self._ordered_target_keys(request)

        if request.debug.include_trace:
            add_trace_event(
                result.trace,
                kind="target_order",
                data={"order": list(targets)},
            )

        for target_key in targets:
            add_trace_event(result.trace, kind="target_start", target_key=target_key)
            candidates = list(request.candidates_by_target.get(target_key) or [])
            if not candidates:
                warning = f"Target '{target_key}': no candidates"
                result.warnings.append(warning)
                add_trace_event(
                    result.trace,
                    kind="target_no_candidates",
                    target_key=target_key,
                    message=warning,
                )
                continue

            required_caps = set(
                request.intent.required_capabilities_by_target.get(target_key) or []
            )
            scored: list[_ScoredCandidate] = []
            for candidate in candidates:
                blocked_reason = self._first_constraint_failure(
                    request.constraints,
                    target_key=target_key,
                    candidate=candidate,
                    selected_so_far=selected_so_far,
                )
                if blocked_reason is not None:
                    add_trace_event(
                        result.trace,
                        kind="constraint_failed",
                        target_key=target_key,
                        candidate_block_id=candidate.block_id,
                        message=blocked_reason,
                    )
                    continue
                missing_caps = sorted(required_caps - set(candidate.capabilities or []))
                if missing_caps:
                    msg = f"missing capabilities: {', '.join(missing_caps)}"
                    add_trace_event(
                        result.trace,
                        kind="constraint_failed",
                        target_key=target_key,
                        candidate_block_id=candidate.block_id,
                        message=msg,
                    )
                    continue

                scored_candidate = self._score_candidate(request, target_key, candidate)
                scored.append(scored_candidate)

            # Apply pairwise compatibility bonuses (cross-target scoring).
            if request.pairwise_bonuses and selected_so_far:
                for sc in scored:
                    self._apply_pairwise_bonuses(
                        request.pairwise_bonuses,
                        target_key,
                        sc,
                        selected_so_far,
                        result,
                        include_trace=request.debug.include_candidate_scores,
                    )

            # Apply seeded tie-breaking.
            if request.seed is not None:
                for sc in scored:
                    tb = _seeded_tiebreaker(request.seed, target_key, sc.candidate.block_id)
                    sc.score += tb
                    sc.reasons.append(f"+seed_tiebreaker:{tb:.6f}")

            # Emit candidate_scored events (after all scoring is finalized).
            if request.debug.include_candidate_scores:
                for sc in scored:
                    add_trace_event(
                        result.trace,
                        kind="candidate_scored",
                        target_key=target_key,
                        candidate_block_id=sc.candidate.block_id,
                        score=sc.score,
                        data={"reasons": list(sc.reasons)},
                    )

            if not scored:
                warning = f"Target '{target_key}': no candidates after constraints"
                result.warnings.append(warning)
                add_trace_event(
                    result.trace,
                    kind="target_unresolved",
                    target_key=target_key,
                    message=warning,
                )
                continue

            scored.sort(key=lambda item: (-item.score, item.candidate.block_id))
            chosen = scored[0]
            selected = SelectedBlock(
                target_key=target_key,
                block_id=chosen.candidate.block_id,
                text=chosen.candidate.text,
                score=chosen.score,
                reasons=list(chosen.reasons),
                metadata={
                    "package_name": chosen.candidate.package_name,
                    "tags": dict(chosen.candidate.tags or {}),
                },
            )
            selected_so_far[target_key] = selected
            result.selected_by_target[target_key] = selected
            add_trace_event(
                result.trace,
                kind="selected",
                target_key=target_key,
                candidate_block_id=chosen.candidate.block_id,
                score=chosen.score,
                data={"reasons": list(chosen.reasons)},
            )

        result.diagnostics["resolved_target_count"] = len(result.selected_by_target)
        result.diagnostics["requested_target_count"] = len(targets)
        return result

    @staticmethod
    def _ordered_target_keys(request: ResolutionRequest) -> list[str]:
        """Order targets so that depended-upon targets resolve first.

        Dependency edges come from:
        - ``requires_other_selected`` constraints (other_target → target_key)
        - ``pairwise_bonuses`` (source_target → target_key)

        Targets without dependency edges keep their declared order.
        Cycles are broken by falling back to declared position.
        """
        # Collect all keys in declared order (intent.targets first, then extras).
        declared: list[str] = []
        for target in request.intent.targets:
            if target.key and target.key not in declared:
                declared.append(target.key)
        for key in request.candidates_by_target.keys():
            if key not in declared:
                declared.append(key)

        if not declared:
            return declared

        # Build adjacency: edges[a] contains b means "a must come before b".
        edges: dict[str, set[str]] = {k: set() for k in declared}
        for c in request.constraints:
            if c.kind == ConstraintKind.REQUIRES_OTHER_SELECTED and c.target_key:
                other = (c.payload or {}).get("other_target_key", "")
                if other and other in edges and c.target_key in edges:
                    edges[other].add(c.target_key)
        for pb in request.pairwise_bonuses:
            if pb.source_target in edges and pb.target_key in edges:
                edges[pb.source_target].add(pb.target_key)

        # Simple Kahn's topo-sort; ties broken by declared position.
        in_degree: dict[str, int] = {k: 0 for k in declared}
        for deps in edges.values():
            for d in deps:
                in_degree[d] = in_degree.get(d, 0) + 1

        pos = {k: i for i, k in enumerate(declared)}
        queue = sorted(
            [k for k in declared if in_degree[k] == 0],
            key=lambda k: pos[k],
        )
        result: list[str] = []
        while queue:
            node = queue.pop(0)
            result.append(node)
            for dep in sorted(edges.get(node, set()), key=lambda k: pos.get(k, 999)):
                in_degree[dep] -= 1
                if in_degree[dep] == 0:
                    queue.append(dep)
            queue.sort(key=lambda k: pos.get(k, 999))

        # Append any remaining (cycle participants) in declared order.
        for k in declared:
            if k not in result:
                result.append(k)

        return result

    @staticmethod
    def _first_constraint_failure(
        constraints: Iterable[ResolutionConstraint],
        *,
        target_key: str,
        candidate: CandidateBlock,
        selected_so_far: dict[str, SelectedBlock],
    ) -> Optional[str]:
        for constraint in constraints:
            if constraint.target_key and constraint.target_key != target_key:
                continue
            kind = (constraint.kind or "").strip()
            payload = constraint.payload or {}

            if kind == ConstraintKind.REQUIRES_TAG:
                tag_key = str(payload.get("tag") or "")
                if not tag_key:
                    continue
                expected = payload.get("value")
                if not _tag_matches(candidate.tags or {}, tag_key, expected):
                    return f"{constraint.id}: requires_tag {tag_key}={expected!r}"
            elif kind == ConstraintKind.FORBID_TAG:
                tag_key = str(payload.get("tag") or "")
                if not tag_key:
                    continue
                expected = payload.get("value")
                if _tag_matches(candidate.tags or {}, tag_key, expected):
                    return f"{constraint.id}: forbid_tag {tag_key}={expected!r}"
            elif kind == ConstraintKind.REQUIRES_CAPABILITY:
                cap = str(payload.get("capability") or "").strip()
                if cap and cap not in (candidate.capabilities or []):
                    return f"{constraint.id}: requires_capability {cap}"
            elif kind == ConstraintKind.FORBID_PAIR:
                other_target = str(payload.get("other_target_key") or "").strip()
                selected = selected_so_far.get(other_target)
                if not selected:
                    continue
                other_block_id = payload.get("other_block_id")
                this_block_id = payload.get("this_block_id")
                if other_block_id and selected.block_id != str(other_block_id):
                    continue
                if this_block_id and candidate.block_id != str(this_block_id):
                    continue
                return f"{constraint.id}: forbid_pair with {other_target}"
            elif kind == ConstraintKind.REQUIRES_OTHER_SELECTED:
                other_target = str(payload.get("other_target_key") or "").strip()
                if other_target and other_target not in selected_so_far:
                    return f"{constraint.id}: requires_other_selected {other_target}"
            # Unknown kinds are ignored; callers can gate via registry/version.
        return None

    @staticmethod
    def _apply_pairwise_bonuses(
        bonuses: Iterable[PairwiseBonus],
        target_key: str,
        sc: _ScoredCandidate,
        selected_so_far: dict[str, SelectedBlock],
        result: ResolutionResult,
        *,
        include_trace: bool = False,
    ) -> None:
        """Apply cross-target pairwise bonuses to a scored candidate in-place."""
        for pb in bonuses:
            if pb.target_key != target_key:
                continue
            source_selected = selected_so_far.get(pb.source_target)
            if source_selected is None:
                continue
            # Check source_tags against the already-selected block's metadata.
            # We stashed tags in SelectedBlock.metadata["tags"] if available,
            # but more robustly we look at the block_id match or tag conditions.
            if pb.source_tags:
                # source_tags is checked against the selected block.
                # We need the original candidate's tags — stored in metadata by resolve().
                source_tags = source_selected.metadata.get("tags") or {}
                if not all(
                    _tag_matches(source_tags, k, v)
                    for k, v in pb.source_tags.items()
                ):
                    continue
            if pb.candidate_tags:
                if not all(
                    _tag_matches(sc.candidate.tags or {}, k, v)
                    for k, v in pb.candidate_tags.items()
                ):
                    continue
            sc.score += pb.bonus
            reason = f"+pairwise:{pb.id}({pb.source_target}→{target_key})"
            sc.reasons.append(reason)
            if include_trace:
                add_trace_event(
                    result.trace,
                    kind="pairwise_bonus",
                    target_key=target_key,
                    candidate_block_id=sc.candidate.block_id,
                    score=pb.bonus,
                    message=reason,
                    data={
                        "bonus_id": pb.id,
                        "source_target": pb.source_target,
                        "source_block_id": source_selected.block_id,
                    },
                )

    def _score_candidate(
        self,
        request: ResolutionRequest,
        target_key: str,
        candidate: CandidateBlock,
    ) -> _ScoredCandidate:
        sc = self.scoring
        score = 0.0
        reasons: list[str] = []

        desired_tags = request.intent.desired_tags_by_target.get(target_key) or {}
        avoid_tags = request.intent.avoid_tags_by_target.get(target_key) or {}
        desired_features = request.intent.desired_features_by_target.get(target_key) or {}

        for key, expected in desired_tags.items():
            if _tag_matches(candidate.tags or {}, key, expected):
                score += sc.desired_tag_bonus
                reasons.append(f"+desired_tag:{key}")
        for key, expected in avoid_tags.items():
            if _tag_matches(candidate.tags or {}, key, expected):
                score -= sc.avoid_tag_penalty
                reasons.append(f"-avoid_tag:{key}")
        for key, expected in desired_features.items():
            if _feature_matches(candidate.features or {}, key, expected):
                score += sc.desired_feature_bonus
                reasons.append(f"+desired_feature:{key}")

        if candidate.avg_rating is not None:
            try:
                rating = float(candidate.avg_rating)
                score += max(0.0, min(rating, 5.0)) * sc.rating_weight
                reasons.append("+rating")
            except (TypeError, ValueError):
                pass

        return _ScoredCandidate(candidate=candidate, score=score, reasons=reasons)
