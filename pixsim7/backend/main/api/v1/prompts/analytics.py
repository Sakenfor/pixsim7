"""
Prompt Analytics and Comparison Endpoints

Endpoints for analyzing prompt performance, comparing versions, and viewing metrics.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompt import PromptVersionService
from pixsim7.backend.main.services.prompt.family_candidates import (
    DEFAULT_COSINE_FLOOR,
    DEFAULT_K,
    DEFAULT_LEXICAL_FLOOR,
    PromptFamilyCandidateService,
)
from pixsim7.backend.main.services.prompt.variant_outcomes import (
    DEFAULT_MIN_VALUE_GENS,
    DEFAULT_STABLE_RATIO,
    PromptVariantOutcomeService,
    SlotOutcome,
)

router = APIRouter()

@router.get("/versions/{version_id}/diff")
async def get_version_diff(
    version_id: UUID,
    format: str = "inline",
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Get diff for a version compared to its parent

    Query params:
        - format: 'inline' (default), 'unified', or 'summary'
    """
    service = PromptVersionService(db)
    diff = await service.get_version_diff(version_id, format=format)

    if not diff:
        raise HTTPException(
            status_code=404,
            detail="Version not found or has no parent version"
        )

    return diff


@router.get("/versions/compare")
async def compare_versions(
    from_version_id: UUID,
    to_version_id: UUID,
    format: str = "inline",
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Compare two arbitrary versions

    Query params:
        - from_version_id: Source version UUID
        - to_version_id: Target version UUID
        - format: 'inline' (default), 'unified', or 'summary'
    """
    service = PromptVersionService(db)

    try:
        comparison = await service.compare_versions(
            from_version_id,
            to_version_id,
            format=format
        )
        return comparison
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ===== Analytics Endpoints (Phase 2) =====


@router.get("/versions/{version_id}/analytics")
async def get_version_analytics(
    version_id: UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Get comprehensive analytics for a version

    Returns performance metrics, usage stats, and ratings.
    """
    service = PromptVersionService(db)

    try:
        analytics = await service.get_version_analytics(version_id)
        return analytics
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/families/{family_id}/analytics")
async def get_family_analytics(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Get aggregate analytics for all versions in a family

    Returns family-wide performance metrics including best performing version.
    """
    service = PromptVersionService(db)

    try:
        analytics = await service.get_family_analytics(family_id)
        return analytics
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/analytics/top-performing")
async def get_top_performing_versions(
    family_id: Optional[UUID] = None,
    limit: int = 10,
    metric: str = "success_rate",
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Get top performing versions by various metrics

    Query params:
        - family_id: Optional UUID to filter by family
        - limit: Number of results (default 10, max 100)
        - metric: Sort by 'success_rate' (default), 'total_generations', or 'avg_rating'
    """
    if limit > 100:
        limit = 100

    if metric not in ["success_rate", "total_generations", "avg_rating"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid metric. Must be 'success_rate', 'total_generations', or 'avg_rating'"
        )

    service = PromptVersionService(db)
    top_versions = await service.get_top_performing_versions(
        family_id=family_id,
        limit=limit,
        metric=metric
    )

    return {
        "metric": metric,
        "limit": limit,
        "family_id": str(family_id) if family_id else None,
        "versions": top_versions,
    }


# ===== Variant slot outcomes (per-word success deltas) =====
#
# Induce the variable slots in a set of near-identical prompts and attach a
# status-based success rate to each filler word, so the UI can surface "this
# word has proven variations" with a defensible delta. See variant_outcomes.py.


def _shape_slot(slot: SlotOutcome) -> dict:
    return {
        "slot_index": slot.index,
        "kind": slot.kind,
        "interior": slot.interior,
        "prefix": slot.prefix,
        "suffix": slot.suffix,
        "qualifying": slot.qualifying,
        "best_rate": round(slot.best_rate, 4),
        "worst_rate": round(slot.worst_rate, 4),
        "delta": round(slot.delta, 4),
        "values": [
            {
                "value": v.value,
                "versions": v.versions,
                "generations": v.generations,
                "completed": v.completed,
                "failed": v.failed,
                "completion_rate": round(v.completion_rate, 4),
                "wilson_lower": round(v.wilson_lower, 4),
            }
            for v in slot.values
        ],
    }


class VariantOutcomesRequest(BaseModel):
    """Explicit-set path: outcomes for a known family / candidate cluster."""

    version_ids: List[UUID]
    stable_ratio: float = DEFAULT_STABLE_RATIO
    min_value_gens: int = DEFAULT_MIN_VALUE_GENS
    # Only return slots where >= 2 fillers clear min_value_gens (the actionable
    # ones). Set false to see every induced slot.
    qualifying_only: bool = True


@router.post("/variant-outcomes")
async def variant_outcomes(
    request: VariantOutcomesRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Per-word success deltas for an explicit set of related versions.

    Pass a family's or candidate cluster's `version_ids` (e.g. the
    `member_version_ids` from `/family-candidates`). Returns each induced slot
    with its filler words ranked by `wilson_lower`, plus a best/worst
    `completion_rate` `delta`. Success = completed / (completed + failed).
    """
    if len(request.version_ids) < 2:
        raise HTTPException(status_code=400, detail="version_ids needs at least 2 ids")

    service = PromptVariantOutcomeService(db)
    slots = await service.slot_outcomes(
        request.version_ids,
        stable_ratio=request.stable_ratio,
        min_value_gens=request.min_value_gens,
    )
    if request.qualifying_only:
        slots = [s for s in slots if s.qualifying >= 2]
    slots.sort(key=lambda s: s.delta, reverse=True)

    return {
        "version_count": len(request.version_ids),
        "min_value_gens": request.min_value_gens,
        "slot_count": len(slots),
        "slots": [_shape_slot(s) for s in slots],
    }


@router.get("/variant-outcomes/scan")
async def scan_variant_outcomes(
    cosine_floor: float = DEFAULT_COSINE_FLOOR,
    lexical_floor: float = DEFAULT_LEXICAL_FLOOR,
    k: int = DEFAULT_K,
    seed_limit: int = 2000,
    min_size: int = 2,
    max_clusters: int = 200,
    stable_ratio: float = DEFAULT_STABLE_RATIO,
    min_value_gens: int = DEFAULT_MIN_VALUE_GENS,
    kind: Optional[str] = None,
    interior_only: bool = False,
    examples: int = 25,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Library-wide probe: how dense are actionable per-word deltas via the
    FUZZY (embedding+lexical) family grain?

    Clusters near-duplicate versions (reusing `find_candidates`), induces slots
    per cluster (with the noise pass applied), and reports a summary — slots
    with variation vs slots where >= 2 fillers each clear `min_value_gens`,
    broken down by slot `kind` — plus the top `examples` slots ranked by
    completion-rate delta. `seed_limit` bounds the scan (0 = whole library).

    Query params:
        - kind: filter examples to 'word' (natural-language swaps), 'dsl'
          (template-token edits), or 'mixed'. None = all kinds.

    This is the endpoint to eyeball before investing in inline composer UI: it
    answers whether fuzzy neighbours give meaningfully more usable signal than
    the sparse exact one-word-diff grain.
    """
    if kind is not None and kind not in ("word", "dsl", "mixed"):
        raise HTTPException(status_code=400, detail="kind must be word|dsl|mixed")
    seed = seed_limit if seed_limit and seed_limit > 0 else None
    cand_service = PromptFamilyCandidateService(db)
    candidates = await cand_service.find_candidates(
        cosine_floor=cosine_floor,
        lexical_floor=lexical_floor,
        k=max(1, min(k, 50)),
        seed_limit=seed,
        min_size=max(2, min_size),
        max_clusters=max(1, min(max_clusters, 500)),
    )

    out_service = PromptVariantOutcomeService(db)
    all_ids = [m.version_id for c in candidates for m in c.members]
    status = await out_service.status_counts(all_ids)

    slots_with_variation = 0
    actionable: list[tuple[int, dict]] = []  # (cluster_size, shaped slot)
    clusters_with_actionable = 0
    by_kind: dict[str, int] = {"word": 0, "dsl": 0, "mixed": 0}
    word_interior = 0  # headline: clean, composer-ready suggestions
    for c in candidates:
        items = [(m.version_id, m.prompt_text) for m in c.members]
        slots = await out_service.slot_outcomes_for_items(
            items, status, stable_ratio=stable_ratio, min_value_gens=min_value_gens
        )
        slots_with_variation += len(slots)
        cluster_actionable = [s for s in slots if s.qualifying >= 2]
        if cluster_actionable:
            clusters_with_actionable += 1
        for s in cluster_actionable:
            by_kind[s.kind] = by_kind.get(s.kind, 0) + 1
            if s.kind == "word" and s.interior:
                word_interior += 1
            actionable.append((c.size, _shape_slot(s)))

    shown = [
        t
        for t in actionable
        if (kind is None or t[1]["kind"] == kind)
        and (not interior_only or t[1]["interior"])
    ]
    shown.sort(key=lambda t: t[1]["delta"], reverse=True)

    return {
        "params": {
            "cosine_floor": cosine_floor,
            "lexical_floor": lexical_floor,
            "k": k,
            "seed_limit": seed,
            "min_value_gens": min_value_gens,
            "stable_ratio": stable_ratio,
            "kind": kind,
            "interior_only": interior_only,
        },
        "summary": {
            "clusters": len(candidates),
            "clusters_with_actionable_slots": clusters_with_actionable,
            "slots_with_variation": slots_with_variation,
            "actionable_slots": len(actionable),
            "actionable_by_kind": by_kind,
            "word_interior": word_interior,
        },
        "examples": [
            {"cluster_size": size, **slot} for size, slot in shown[:max(0, examples)]
        ],
    }


