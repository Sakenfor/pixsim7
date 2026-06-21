"""Plan-access grant routes — peer (user→user) plan sharing via ResourceGrant.

A plan owner grants another user write/scope access to one of their plans. The
grant is a ResourceGrant(resource_type='plan', scope={plan_id}); enforcement
happens in the scope resolver (services/ownership/scope_authz.load_scope_grants),
which folds these grants in WIDEN-ONLY for already-restricted agents.

Mounted under /dev/plans by dev_plans.py.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.api.v1.plans.helpers import _principal_effective_user_id
from pixsim7.backend.main.domain.docs.models import Document
from pixsim7.backend.main.domain.grants import ResourceGrant, ResourceGrantType
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.docs.plan_write import make_document_id
from pixsim7.backend.main.services.grants import ResourceGrantService
from pixsim7.backend.main.shared.errors import ResourceNotFoundError

router = APIRouter()


class PlanGrantCreate(BaseModel):
    plan_id: str
    recipient_user_id: Optional[int] = None
    recipient_username: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)
    expires_at: Optional[datetime] = None


class PlanGrantEntry(BaseModel):
    id: int
    owner_user_id: int
    recipient_user_id: int
    recipient_username: Optional[str] = None
    plan_id: str
    note: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


def _is_admin(principal) -> bool:
    fn = getattr(principal, "is_admin", None)
    return fn() if callable(fn) else bool(fn)


def _to_entry(grant: ResourceGrant, recipient_username: Optional[str] = None) -> PlanGrantEntry:
    scope = grant.scope or {}
    return PlanGrantEntry(
        id=grant.id,
        owner_user_id=grant.owner_user_id,
        recipient_user_id=grant.recipient_user_id,
        recipient_username=recipient_username,
        plan_id=scope.get("plan_id", ""),
        note=grant.note,
        expires_at=grant.expires_at,
        created_at=grant.created_at,
        updated_at=grant.updated_at,
    )


async def _usernames_for(db: AsyncSession, user_ids) -> dict[int, str]:
    ids = [uid for uid in set(user_ids) if uid is not None]
    if not ids:
        return {}
    result = await db.execute(select(User.id, User.username).where(User.id.in_(ids)))
    return {uid: uname for uid, uname in result.all()}


@router.post("/grants", response_model=PlanGrantEntry, status_code=status.HTTP_201_CREATED)
async def create_plan_grant(
    payload: PlanGrantCreate,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Grant a user access to one of your plans (owner or admin only)."""
    granter = _principal_effective_user_id(principal)
    if not granter:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User binding required")

    recipient_id = payload.recipient_user_id
    if recipient_id is None and payload.recipient_username:
        recipient = (
            await db.execute(select(User).where(User.username == payload.recipient_username))
        ).scalar_one_or_none()
        if recipient is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipient user not found")
        recipient_id = recipient.id
    if recipient_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "recipient_user_id or recipient_username is required",
        )

    # Only the plan owner (or an admin) may share it — else this would be a
    # privilege-escalation (anyone granting themselves access).
    doc = await db.get(Document, make_document_id(payload.plan_id))
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Plan not found: {payload.plan_id}")
    if doc.user_id != granter and not _is_admin(principal):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your plan")

    try:
        grant = await ResourceGrantService(db).create_or_update(
            owner_user_id=granter,
            recipient_user_id=recipient_id,
            resource_type=ResourceGrantType.PLAN,
            scope={"plan_id": payload.plan_id},
            note=payload.note,
            expires_at=payload.expires_at,
        )
        await db.commit()
        await db.refresh(grant)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    names = await _usernames_for(db, [grant.recipient_user_id])
    return _to_entry(grant, names.get(grant.recipient_user_id))


@router.get("/grants/issued", response_model=list[PlanGrantEntry])
async def list_issued_plan_grants(
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Plan grants the current user has created."""
    uid = _principal_effective_user_id(principal)
    if not uid:
        return []
    grants = await ResourceGrantService(db).list_issued(uid, ResourceGrantType.PLAN)
    names = await _usernames_for(db, [g.recipient_user_id for g in grants])
    return [_to_entry(g, names.get(g.recipient_user_id)) for g in grants]


@router.get("/grants/received", response_model=list[PlanGrantEntry])
async def list_received_plan_grants(
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Plan grants shared with the current user."""
    uid = _principal_effective_user_id(principal)
    if not uid:
        return []
    grants = await ResourceGrantService(db).list_received(uid, ResourceGrantType.PLAN)
    names = await _usernames_for(db, [g.recipient_user_id for g in grants])
    return [_to_entry(g, names.get(g.recipient_user_id)) for g in grants]


@router.delete("/grants/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_plan_grant(
    grant_id: int,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Revoke a plan grant (owner only)."""
    uid = _principal_effective_user_id(principal)
    try:
        await ResourceGrantService(db).revoke(grant_id, uid)
        await db.commit()
    except ResourceNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grant not found")
    except ValueError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
