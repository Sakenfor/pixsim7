"""Asset Sets API — backend-native named collections of assets.

CRUD for ``AssetSet`` rows (plus manual-membership ops), replacing the old
localStorage-only ``useAssetSetStore``. Sets are user-owned with an optional
``is_shared`` read-widening flag (``ASSET_SET_POLICY``), so visibility uses the
composable ownership helpers rather than a raw ``user_id ==`` check — a shared
set is visible to everyone but still editable only by its owner (or an admin).

Two kinds:
* ``manual`` — explicit, position-ordered members in ``asset_set_member``.
* ``smart``  — a saved ``filters`` blob resolved at query time; no members.

See plan ``asset-sets-backend`` (checkpoint s2). Membership wiring into
relocation / gallery search is s4 + media-storage-tiering cp-i i3.
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.assets.asset_set import (
    ASSET_SET_KINDS,
    ASSET_SET_POLICY,
    AssetSet,
    AssetSetMember,
)
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.common.ownership import (
    apply_visibility_filter,
    assert_can_edit,
    assert_can_view,
    gate_admin_only_writes,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/asset-sets", tags=["asset-sets"])


# ── Schemas ───────────────────────────────────────────────────────


class AssetSetResponse(BaseModel):
    id: int
    name: str
    kind: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    # Smart-set criteria (null for manual sets).
    filters: Optional[Dict[str, Any]] = None
    maxResults: Optional[int] = None
    isShared: bool
    # Ordered member asset ids (manual sets only; empty for smart).
    assetIds: List[int] = Field(default_factory=list)
    memberCount: int
    # True when the caller is not the owner (visible via the shared flag).
    shared: bool = False
    createdAt: str
    updatedAt: str


class AssetSetsListResponse(BaseModel):
    sets: List[AssetSetResponse]


class AssetSetCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    kind: str = Field("manual", description="manual | smart")
    description: Optional[str] = Field(None, max_length=1000)
    color: Optional[str] = Field(None, max_length=32)
    icon: Optional[str] = Field(None, max_length=200)
    is_shared: bool = False
    # Smart-set criteria.
    filters: Optional[Dict[str, Any]] = None
    max_results: Optional[int] = None
    # Optional inline members for a manual set (ordered).
    asset_ids: Optional[List[int]] = None


class AssetSetUpdateRequest(BaseModel):
    """PATCH payload — only fields present are written.

    ``model_dump(exclude_unset=True)`` lets callers clear nullable fields
    (description/color/filters/max_results) by sending ``null``.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    color: Optional[str] = Field(None, max_length=32)
    icon: Optional[str] = Field(None, max_length=200)
    is_shared: Optional[bool] = None
    filters: Optional[Dict[str, Any]] = None
    max_results: Optional[int] = None


class AssetSetMembersRequest(BaseModel):
    asset_ids: List[int] = Field(default_factory=list)


# ── Helpers ───────────────────────────────────────────────────────


async def _ordered_member_ids(
    db: AsyncSession, set_ids: List[int]
) -> Dict[int, List[int]]:
    """{set_id: [asset_id, …]} ordered by position then asset_id, batched."""
    if not set_ids:
        return {}
    stmt = (
        select(AssetSetMember.set_id, AssetSetMember.asset_id)
        .where(AssetSetMember.set_id.in_(set_ids))
        .order_by(AssetSetMember.set_id, AssetSetMember.position, AssetSetMember.asset_id)
    )
    out: Dict[int, List[int]] = {sid: [] for sid in set_ids}
    for sid, aid in (await db.execute(stmt)).all():
        out[sid].append(aid)
    return out


def _to_response(
    s: AssetSet, asset_ids: List[int], *, caller_id: Optional[int]
) -> AssetSetResponse:
    return AssetSetResponse(
        id=s.id,
        name=s.name,
        kind=s.kind,
        description=s.description,
        color=s.color,
        icon=s.icon,
        filters=s.filters,
        maxResults=s.max_results,
        isShared=s.is_shared,
        assetIds=asset_ids,
        memberCount=len(asset_ids),
        shared=(caller_id is not None and s.user_id != caller_id),
        createdAt=s.created_at.isoformat(),
        updatedAt=s.updated_at.isoformat(),
    )


async def _load_for_view(db: AsyncSession, set_id: int, user: CurrentUser) -> AssetSet:
    s = await db.get(AssetSet, set_id)
    if s is None:
        raise HTTPException(status_code=404, detail="AssetSet not found")
    assert_can_view(s, user=user, policy=ASSET_SET_POLICY)
    return s


async def _load_for_edit(db: AsyncSession, set_id: int, user: CurrentUser) -> AssetSet:
    s = await db.get(AssetSet, set_id)
    if s is None:
        raise HTTPException(status_code=404, detail="AssetSet not found")
    assert_can_edit(s, user=user, policy=ASSET_SET_POLICY)
    return s


def _require_manual(s: AssetSet) -> None:
    if s.kind != "manual":
        raise HTTPException(
            status_code=400,
            detail="Membership ops apply to manual sets only; smart sets derive members from filters.",
        )


async def _owned_existing_asset_ids(
    db: AsyncSession, user_id: int, asset_ids: List[int]
) -> List[int]:
    """Filter to asset ids that exist and belong to the caller, order-preserving.

    Keeps cross-user assets out of a set without leaking which ids exist.
    """
    if not asset_ids:
        return []
    # Dedupe preserving first-seen order.
    seen: set[int] = set()
    ordered: List[int] = []
    for aid in asset_ids:
        if aid not in seen:
            seen.add(aid)
            ordered.append(aid)
    rows = (
        await db.execute(
            select(Asset.id).where(Asset.id.in_(ordered), Asset.user_id == user_id)
        )
    ).scalars().all()
    allowed = set(rows)
    return [aid for aid in ordered if aid in allowed]


# ── Endpoints ─────────────────────────────────────────────────────


@router.get("", response_model=AssetSetsListResponse)
async def list_asset_sets(
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """List sets the caller can view (own + shared), newest-first."""
    stmt = select(AssetSet)
    stmt = apply_visibility_filter(stmt, model=AssetSet, policy=ASSET_SET_POLICY, user=user)
    stmt = stmt.order_by(AssetSet.created_at.desc())
    rows = list((await db.execute(stmt)).scalars().all())
    members = await _ordered_member_ids(db, [s.id for s in rows])
    return AssetSetsListResponse(
        sets=[_to_response(s, members.get(s.id, []), caller_id=user.id) for s in rows]
    )


@router.post("", response_model=AssetSetResponse)
async def create_asset_set(
    payload: AssetSetCreateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Create a manual or smart set. Manual sets may seed ``asset_ids`` inline."""
    if payload.kind not in ASSET_SET_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"kind must be one of {ASSET_SET_KINDS}, got {payload.kind!r}",
        )

    s = AssetSet(
        user_id=user.id,
        name=payload.name,
        kind=payload.kind,
        description=payload.description,
        color=payload.color,
        is_shared=payload.is_shared,
        filters=payload.filters if payload.kind == "smart" else None,
        max_results=payload.max_results if payload.kind == "smart" else None,
    )
    # is_shared is a free-toggle flag for owners; gate is a no-op here but keeps
    # the create path honest if an admin-only flag is added to the policy later.
    gate_admin_only_writes(s, user=user, policy=ASSET_SET_POLICY)
    db.add(s)
    await db.flush()  # assign s.id before inserting members

    asset_ids: List[int] = []
    if payload.kind == "manual" and payload.asset_ids:
        asset_ids = await _owned_existing_asset_ids(db, user.id, payload.asset_ids)
        for pos, aid in enumerate(asset_ids):
            db.add(AssetSetMember(set_id=s.id, asset_id=aid, position=pos))

    await db.commit()
    await db.refresh(s)
    return _to_response(s, asset_ids, caller_id=user.id)


@router.get("/{set_id}", response_model=AssetSetResponse)
async def get_asset_set(
    set_id: int,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    s = await _load_for_view(db, set_id, user)
    members = await _ordered_member_ids(db, [s.id])
    return _to_response(s, members.get(s.id, []), caller_id=user.id)


@router.patch("/{set_id}", response_model=AssetSetResponse)
async def update_asset_set(
    set_id: int,
    payload: AssetSetUpdateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Partial update. Only fields present in the body are written.

    ``filters`` / ``max_results`` are meaningful for smart sets; they are
    accepted on any set but ignored by membership resolution for manual sets.
    """
    s = await _load_for_edit(db, set_id, user)
    updates = payload.model_dump(exclude_unset=True)
    gate_admin_only_writes(s, user=user, policy=ASSET_SET_POLICY, existing=s)
    for key, value in updates.items():
        setattr(s, key, value)
    s.updated_at = utcnow()
    await db.commit()
    await db.refresh(s)
    members = await _ordered_member_ids(db, [s.id])
    return _to_response(s, members.get(s.id, []), caller_id=user.id)


@router.delete("/{set_id}")
async def delete_asset_set(
    set_id: int,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Delete a set. Member rows cascade via the FK ``ondelete=CASCADE``."""
    s = await _load_for_edit(db, set_id, user)
    await db.delete(s)
    await db.commit()
    return {"ok": True}


@router.post("/{set_id}/members", response_model=AssetSetResponse)
async def add_asset_set_members(
    set_id: int,
    payload: AssetSetMembersRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Append asset ids to a manual set (deduped, owner-scoped, position-ordered)."""
    s = await _load_for_edit(db, set_id, user)
    _require_manual(s)

    existing = await _ordered_member_ids(db, [s.id])
    existing_ids = set(existing.get(s.id, []))
    incoming = await _owned_existing_asset_ids(db, user.id, payload.asset_ids)
    to_add = [aid for aid in incoming if aid not in existing_ids]

    if to_add:
        start = (
            await db.execute(
                select(func.coalesce(func.max(AssetSetMember.position), -1)).where(
                    AssetSetMember.set_id == s.id
                )
            )
        ).scalar() or -1
        for offset, aid in enumerate(to_add, start=1):
            db.add(AssetSetMember(set_id=s.id, asset_id=aid, position=start + offset))
        s.updated_at = utcnow()
        await db.commit()
        await db.refresh(s)

    members = await _ordered_member_ids(db, [s.id])
    return _to_response(s, members.get(s.id, []), caller_id=user.id)


@router.post("/{set_id}/members/remove", response_model=AssetSetResponse)
async def remove_asset_set_members(
    set_id: int,
    payload: AssetSetMembersRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Remove asset ids from a manual set.

    POST (not DELETE) so the id list rides in a body without relying on
    DELETE-with-body, which several HTTP clients and codegen paths mishandle.
    """
    s = await _load_for_edit(db, set_id, user)
    _require_manual(s)

    remove_ids = set(payload.asset_ids)
    if remove_ids:
        await db.execute(
            sa_delete(AssetSetMember).where(
                AssetSetMember.set_id == s.id,
                AssetSetMember.asset_id.in_(remove_ids),
            )
        )
        s.updated_at = utcnow()
        await db.commit()
        await db.refresh(s)

    members = await _ordered_member_ids(db, [s.id])
    return _to_response(s, members.get(s.id, []), caller_id=user.id)


@router.put("/{set_id}/members", response_model=AssetSetResponse)
async def replace_asset_set_members(
    set_id: int,
    payload: AssetSetMembersRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Replace a manual set's full ordered membership (covers reorder + bulk set).

    The body is the exact desired membership in order; ids not owned by the
    caller are dropped. Existing rows are replaced wholesale.
    """
    s = await _load_for_edit(db, set_id, user)
    _require_manual(s)

    ordered = await _owned_existing_asset_ids(db, user.id, payload.asset_ids)

    await db.execute(sa_delete(AssetSetMember).where(AssetSetMember.set_id == s.id))
    for pos, aid in enumerate(ordered):
        db.add(AssetSetMember(set_id=s.id, asset_id=aid, position=pos))
    s.updated_at = utcnow()
    await db.commit()
    await db.refresh(s)
    return _to_response(s, ordered, caller_id=user.id)
