"""Dev Vocabulary API.

Review surface for the vocabulary candidate harvesting/learning loop.
Phase 1 (harvest) is implemented in `services/prompt/vocabulary_harvester`,
Phase 2 (LLM propose) in `services/prompt/vocabulary_proposer`. This
router exposes the candidates for human/agent review:

    GET    /dev/vocab/candidates            list, filter by status / min frequency
    GET    /dev/vocab/stats                 status histogram
    POST   /dev/vocab/candidates/propose    run a propose batch
    PATCH  /dev/vocab/candidates/{id}       review action: accept / reject / blocklist / remap
    DELETE /dev/vocab/candidates/{id}       hard delete

Frontend: `apps/main/src/features/panels/components/dev/VocabularyCandidatesPanel.tsx`
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func
from sqlmodel import select

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.domain.prompt.vocabulary_candidate import VocabularyCandidate
from pixsim7.backend.main.services.prompt.vocabulary_proposer import (
    fetch_pending_batch,
    propose_for_batch,
)
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/dev/vocab", tags=["dev", "vocabulary"])

# Same shape the parser/auto-deriver use for ontology IDs.
_TAG_RE = re.compile(r"^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$")


CandidateStatus = Literal["pending", "proposed", "accepted", "rejected", "blocklisted"]


# ── Response models ───────────────────────────────────────────────────────


class CandidateResponse(BaseModel):
    id: int
    term: str
    inferred_role: Optional[str] = None
    frequency: int
    first_seen: datetime
    last_seen: datetime
    sample_contexts: List[str] = Field(default_factory=list)
    status: str
    proposed_tag: Optional[str] = None
    proposed_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[int] = None


class CandidatesListResponse(BaseModel):
    candidates: List[CandidateResponse]
    total: int


class StatusCount(BaseModel):
    status: str
    count: int


class StatsResponse(BaseModel):
    by_status: List[StatusCount] = Field(default_factory=list)
    total: int


class ProposeRequest(BaseModel):
    limit: int = Field(default=25, ge=1, le=100)
    min_frequency: int = Field(default=3, ge=1)


class ProposeResponse(BaseModel):
    batch_size: int
    proposed: int


class ReviewRequest(BaseModel):
    action: Literal["accept", "reject", "blocklist", "remap"]
    tag: Optional[str] = Field(
        default=None,
        description="Required for action='remap'; ignored otherwise",
    )


# ── Helpers ───────────────────────────────────────────────────────────────


def _to_response(row: VocabularyCandidate) -> CandidateResponse:
    return CandidateResponse(
        id=row.id or 0,
        term=row.term,
        inferred_role=row.inferred_role,
        frequency=row.frequency,
        first_seen=row.first_seen,
        last_seen=row.last_seen,
        sample_contexts=list(row.sample_contexts or []),
        status=row.status,
        proposed_tag=row.proposed_tag,
        proposed_at=row.proposed_at,
        reviewed_at=row.reviewed_at,
        reviewed_by=row.reviewed_by,
    )


def _reviewer_id(principal: object) -> Optional[int]:
    return resolve_effective_user_id(principal)


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.get("/candidates", response_model=CandidatesListResponse)
async def list_candidates(
    db: DatabaseSession,
    _user: CurrentUser,
    status: Optional[str] = None,
    min_frequency: int = 1,
    limit: int = 200,
) -> CandidatesListResponse:
    """List harvested candidates, ordered by frequency descending."""
    stmt = select(VocabularyCandidate).where(
        VocabularyCandidate.frequency >= min_frequency
    )
    if status:
        stmt = stmt.where(VocabularyCandidate.status == status)

    stmt = stmt.order_by(
        VocabularyCandidate.frequency.desc(),
        VocabularyCandidate.last_seen.desc(),
    ).limit(limit)

    rows = list((await db.execute(stmt)).scalars().all())

    # Total count for the same filter (without limit) so the panel can
    # show "showing N of total".
    count_stmt = select(func.count()).select_from(VocabularyCandidate).where(
        VocabularyCandidate.frequency >= min_frequency
    )
    if status:
        count_stmt = count_stmt.where(VocabularyCandidate.status == status)
    total = int((await db.execute(count_stmt)).scalar_one() or 0)

    return CandidatesListResponse(
        candidates=[_to_response(row) for row in rows],
        total=total,
    )


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: DatabaseSession,
    _user: CurrentUser,
) -> StatsResponse:
    """Status histogram across the whole table."""
    stmt = select(VocabularyCandidate.status, func.count()).group_by(
        VocabularyCandidate.status
    )
    rows = (await db.execute(stmt)).all()

    by_status = [StatusCount(status=str(s), count=int(c)) for s, c in rows]
    total = sum(s.count for s in by_status)
    return StatsResponse(by_status=by_status, total=total)


@router.post("/candidates/propose", response_model=ProposeResponse)
async def propose_candidates(
    payload: ProposeRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> ProposeResponse:
    """Run the LLM proposer over a batch of pending candidates."""
    rows = await fetch_pending_batch(
        db,
        limit=payload.limit,
        min_frequency=payload.min_frequency,
    )
    if not rows:
        return ProposeResponse(batch_size=0, proposed=0)

    proposed = await propose_for_batch(db, rows, user_id=_reviewer_id(user))
    return ProposeResponse(batch_size=len(rows), proposed=proposed)


@router.patch("/candidates/{candidate_id}", response_model=CandidateResponse)
async def review_candidate(
    candidate_id: int,
    payload: ReviewRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> CandidateResponse:
    """Apply a review action.

    - `accept`     — mark accepted, keep proposed_tag as the canonical mapping
    - `reject`     — mark rejected, keep proposed_tag for audit but won't be re-proposed
    - `blocklist`  — mark blocklisted (also stops harvester from re-bumping it)
    - `remap`      — set a new tag (overwriting any prior proposal) and accept it
    """
    row = await db.get(VocabularyCandidate, candidate_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Candidate not found")

    now = utcnow()
    reviewer_id = _reviewer_id(user)

    if payload.action == "accept":
        if not row.proposed_tag:
            raise HTTPException(
                status_code=400,
                detail="Cannot accept a candidate with no proposed_tag",
            )
        row.status = "accepted"
    elif payload.action == "reject":
        row.status = "rejected"
    elif payload.action == "blocklist":
        row.status = "blocklisted"
    elif payload.action == "remap":
        tag = (payload.tag or "").strip().lower()
        if not tag or not _TAG_RE.match(tag):
            raise HTTPException(
                status_code=400,
                detail="remap requires a valid `tag` of form namespace:value",
            )
        row.proposed_tag = tag
        row.proposed_at = row.proposed_at or now
        row.status = "accepted"
    else:  # pragma: no cover — Literal guards this at the schema level.
        raise HTTPException(status_code=400, detail=f"Unknown action: {payload.action}")

    row.reviewed_at = now
    row.reviewed_by = reviewer_id

    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.delete("/candidates/{candidate_id}")
async def delete_candidate(
    candidate_id: int,
    db: DatabaseSession,
    _user: CurrentUser,
) -> Response:
    """Hard delete a candidate row."""
    stmt = delete(VocabularyCandidate).where(VocabularyCandidate.id == candidate_id)
    result = await db.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    await db.commit()
    return Response(status_code=204)


__all__ = ["router"]
