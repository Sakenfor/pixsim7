"""
Notifications API — lightweight broadcast/targeted notifications.

Used by plan hooks, agents, and system for event announcements.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.platform.notification import Notification
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Models ────────────────────────────────────────────────────────


class NotificationResponse(BaseModel):
    id: str
    title: str
    body: Optional[str] = None
    category: str
    severity: str
    source: str
    refType: Optional[str] = None
    refId: Optional[str] = None
    broadcast: bool
    read: bool
    createdAt: str


class NotificationListResponse(BaseModel):
    notifications: List[NotificationResponse]
    unreadCount: int


class NotificationCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: Optional[str] = None
    category: str = Field("system", description="plan | feature | system | agent")
    severity: str = Field("info", description="info | success | warning | error")
    ref_type: Optional[str] = None
    ref_id: Optional[str] = None
    broadcast: bool = Field(True, description="True = all users, False = specific user_id")
    user_id: Optional[int] = Field(None, description="Target user (null = broadcast)")


# ── Helpers ───────────────────────────────────────────────────────


def _to_response(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "title": n.title,
        "body": n.body,
        "category": n.category,
        "severity": n.severity,
        "source": n.source,
        "refType": n.ref_type,
        "refId": n.ref_id,
        "broadcast": n.broadcast,
        "read": n.read,
        "createdAt": n.created_at.isoformat() if n.created_at else "",
    }


def _user_filter(user: User):
    """Notifications visible to user: broadcasts + targeted to this user."""
    return or_(
        Notification.broadcast == True,  # noqa: E712
        Notification.user_id == user.id,
    )


# ── Endpoints ─────────────────────────────────────────────────────


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: CurrentUser,
    category: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    """List notifications for the current user (broadcasts + targeted)."""
    stmt = (
        select(Notification)
        .where(_user_filter(user))
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if category:
        stmt = stmt.where(Notification.category == category)
    if unread_only:
        stmt = stmt.where(Notification.read == False)  # noqa: E712

    rows = (await db.execute(stmt)).scalars().all()

    # Unread count
    count_stmt = (
        select(func.count())
        .select_from(Notification)
        .where(_user_filter(user))
        .where(Notification.read == False)  # noqa: E712
    )
    unread = (await db.execute(count_stmt)).scalar_one() or 0

    return NotificationListResponse(
        notifications=[_to_response(r) for r in rows],
        unreadCount=unread,
    )


@router.post("", response_model=NotificationResponse)
async def create_notification(
    payload: NotificationCreateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Create a notification (broadcast or targeted)."""
    now = utcnow()
    n = Notification(
        title=payload.title,
        body=payload.body,
        category=payload.category,
        severity=payload.severity,
        source=f"user:{user.id}",
        ref_type=payload.ref_type,
        ref_id=payload.ref_id,
        broadcast=payload.broadcast,
        user_id=payload.user_id,
        read=False,
        created_at=now,
    )
    db.add(n)
    await db.commit()
    return _to_response(n)


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Mark a notification as read."""
    n = await db.get(Notification, notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read = True
    await db.commit()
    return {"ok": True}


@router.post("/mark-all-read")
async def mark_all_read(
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Mark all notifications as read for the current user."""
    stmt = (
        update(Notification)
        .where(_user_filter(user))
        .where(Notification.read == False)  # noqa: E712
        .values(read=True)
    )
    result = await db.execute(stmt)
    await db.commit()
    return {"ok": True, "marked": result.rowcount}


# ── Service helper (for plan hooks, agents) ───────────────────────


async def emit_notification(
    db: AsyncSession,
    *,
    title: str,
    body: Optional[str] = None,
    category: str = "system",
    severity: str = "info",
    source: str = "system",
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
    broadcast: bool = True,
    user_id: Optional[int] = None,
) -> Notification:
    """Create a notification from backend code (plan hooks, agents, etc.)."""
    n = Notification(
        title=title,
        body=body,
        category=category,
        severity=severity,
        source=source,
        ref_type=ref_type,
        ref_id=ref_id,
        broadcast=broadcast,
        user_id=user_id,
        read=False,
        created_at=utcnow(),
    )
    db.add(n)
    return n
