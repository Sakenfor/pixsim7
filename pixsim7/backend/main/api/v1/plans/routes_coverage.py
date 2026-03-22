"""Coverage discovery routes — test suite matching for plan code_paths."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.services.docs.plan_write import get_plan_bundle
from pixsim7.backend.main.api.v1.plans import helpers as _h

router = APIRouter()

class CoverageSuiteMatch(BaseModel):
    suite_id: str
    suite_label: str
    kind: Optional[str] = None
    category: Optional[str] = None
    path: str = ""
    matched_paths: List[str] = Field(default_factory=list)


class PlanCoverageResponse(BaseModel):
    plan_id: str
    code_paths: List[str]
    explicit_suites: List[str] = Field(
        default_factory=list,
        description="Suite IDs explicitly linked via checkpoint evidence.",
    )
    auto_discovered: List[CoverageSuiteMatch] = Field(
        default_factory=list,
        description="Suites whose 'covers' paths overlap with plan code_paths.",
    )


@router.get("/coverage/{plan_id}", response_model=PlanCoverageResponse)
async def get_plan_coverage(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Discover test suites covering a plan's code paths.

    Returns both explicitly linked suites (from checkpoint evidence) and
    auto-discovered suites (from ``code_paths ∩ suite.covers`` overlap).
    """
    from pixsim7.backend.main.services.testing.catalog import build_catalog

    bundle = await _h.get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    code_paths = bundle.plan.code_paths or []

    # Collect explicit test_suite refs from all checkpoints
    explicit_suite_ids: list[str] = []
    for cp in bundle.plan.checkpoints or []:
        for ev in cp.get("evidence") or []:
            ref = _h._normalize_evidence_ref(ev)
            if ref and ref["kind"] == "test_suite":
                if ref["ref"] not in explicit_suite_ids:
                    explicit_suite_ids.append(ref["ref"])

    # Auto-discover: find suites whose covers overlap with plan code_paths
    all_suites = build_catalog()
    auto_discovered: list[CoverageSuiteMatch] = []

    for suite in all_suites:
        suite_covers = suite.get("covers") or []
        if not suite_covers or not code_paths:
            continue

        matched: list[str] = []
        for plan_path in code_paths:
            for cover_path in suite_covers:
                # Match if either is a prefix of the other
                if plan_path.startswith(cover_path) or cover_path.startswith(plan_path):
                    matched.append(f"{plan_path} ↔ {cover_path}")
                    break

        if matched:
            auto_discovered.append(CoverageSuiteMatch(
                suite_id=suite["id"],
                suite_label=suite.get("label", suite["id"]),
                kind=suite.get("kind"),
                category=suite.get("category"),
                path=suite.get("path", ""),
                matched_paths=matched,
            ))

    return PlanCoverageResponse(
        plan_id=plan_id,
        code_paths=code_paths,
        explicit_suites=explicit_suite_ids,
        auto_discovered=auto_discovered,
    )
