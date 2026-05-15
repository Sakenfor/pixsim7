"""On-demand FS export routes — admin-gated, killswitch-aware."""
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, get_database
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.schemas.api_base import ApiModel
from pixsim7.backend.main.services.docs.plan_write import (
    PlanBundle,
    _FS_EXPORT_TAG,
    _git_commit,
    export_plan_to_disk,
    get_plan_bundle,
    list_plan_bundles,
)

router = APIRouter()


# ── Request / response models ────────────────────────────────────


class PlanExportRequest(ApiModel):
    commit: bool = True
    scope_override: Optional[Literal["active", "done", "parked"]] = None


class PlanExportResult(ApiModel):
    plan_id: str
    paths: List[str]
    commit_sha: Optional[str] = None


class PlanExportBatchRequest(ApiModel):
    ids: Optional[List[str]] = None
    all_tagged: bool = False
    changed_since: Optional[datetime] = None

    def selector_count(self) -> int:
        return sum([
            self.ids is not None,
            bool(self.all_tagged),
            self.changed_since is not None,
        ])


class PlanExportBatchResponse(ApiModel):
    results: List[PlanExportResult]
    commit_sha: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────


def _check_killswitch() -> None:
    if settings.plans_db_only_mode:
        raise HTTPException(
            status_code=409,
            detail="FS export disabled by plans_db_only_mode.",
        )


def _has_export_tag(bundle: PlanBundle) -> bool:
    return _FS_EXPORT_TAG in (bundle.doc.tags or [])


# ── Endpoints ─────────────────────────────────────────────────────


@router.post("/{plan_id}/export", response_model=PlanExportResult)
async def export_plan(
    plan_id: str,
    payload: PlanExportRequest,
    _admin: CurrentAdminUser,
    db: AsyncSession = Depends(get_database),
):
    """One-shot FS snapshot of a single plan. Works on any plan regardless of tag."""
    _check_killswitch()
    bundle = await get_plan_bundle(db, plan_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    paths = export_plan_to_disk(bundle, scope_override=payload.scope_override)
    sha: Optional[str] = None
    if payload.commit:
        sha = _git_commit(paths, f"plan({plan_id}): on-demand export")

    return PlanExportResult(
        plan_id=plan_id,
        paths=[str(p) for p in paths],
        commit_sha=sha,
    )


@router.post("/export", response_model=PlanExportBatchResponse)
async def export_plans_batch(
    payload: PlanExportBatchRequest,
    _admin: CurrentAdminUser,
    db: AsyncSession = Depends(get_database),
):
    """Batch FS export. Exactly one selector required. Single git commit per batch."""
    _check_killswitch()

    if payload.selector_count() != 1:
        raise HTTPException(
            status_code=400,
            detail="Exactly one selector required: ids, all_tagged, or changed_since.",
        )

    if payload.ids is not None:
        targets: List[PlanBundle] = []
        for pid in payload.ids:
            b = await get_plan_bundle(db, pid)
            if b is None:
                raise HTTPException(status_code=404, detail=f"Plan not found: {pid}")
            targets.append(b)
    else:
        all_bundles = await list_plan_bundles(db)
        tagged = [b for b in all_bundles if _has_export_tag(b)]
        if payload.changed_since is not None:
            cutoff = payload.changed_since
            targets = [
                b for b in tagged
                if (b.plan.updated_at or b.doc.updated_at) and
                   (b.plan.updated_at or b.doc.updated_at) >= cutoff
            ]
        else:
            targets = tagged

    all_paths = []
    results: List[PlanExportResult] = []
    for bundle in targets:
        paths = export_plan_to_disk(bundle)
        all_paths.extend(paths)
        results.append(PlanExportResult(
            plan_id=bundle.plan.id,
            paths=[str(p) for p in paths],
        ))

    sha: Optional[str] = None
    if all_paths:
        sha = _git_commit(all_paths, f"plans: batch export ({len(results)} plans)")

    return PlanExportBatchResponse(results=results, commit_sha=sha)
