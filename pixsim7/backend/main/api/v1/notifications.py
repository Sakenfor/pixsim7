"""
Notifications API — lightweight broadcast/targeted notifications.

Used by plan hooks, agents, and system for event announcements.
"""
from typing import Any, Dict, List, Optional, Set
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.platform.notification import Notification
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.notifications.notification_categories import (
    notification_category_registry,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.shared.schemas.user_schemas import (
    NotificationCategoryPref,
    UserPreferences,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Models ────────────────────────────────────────────────────────


class NotificationResponse(BaseModel):
    id: str
    title: str
    body: Optional[str] = None
    category: str
    severity: str
    source: str
    actorName: Optional[str] = None
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


class CategoryGranularityOptionResponse(BaseModel):
    id: str
    label: str
    description: str = ""


class CategoryResponse(BaseModel):
    id: str
    label: str
    description: str = ""
    icon: str = "bell"
    defaultGranularity: str = "all"
    granularityOptions: List[CategoryGranularityOptionResponse] = Field(default_factory=list)
    sortOrder: int = 100
    currentGranularity: str = "all"


class CategoriesListResponse(BaseModel):
    categories: List[CategoryResponse]


# ── Helpers ───────────────────────────────────────────────────────


def _to_response(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "title": n.title,
        "body": n.body,
        "category": n.category,
        "severity": n.severity,
        "source": n.source,
        "actorName": n.actor_name,
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


def _get_user_notification_prefs(user: User) -> Dict[str, NotificationCategoryPref]:
    """Extract typed notification preferences from user, falling back to empty."""
    raw_prefs = getattr(user, "preferences", None) or {}
    notif_prefs = raw_prefs.get("notifications")
    if not isinstance(notif_prefs, dict):
        return {}
    result: Dict[str, NotificationCategoryPref] = {}
    for cat_id, pref_data in notif_prefs.items():
        if isinstance(pref_data, dict):
            result[cat_id] = NotificationCategoryPref.model_validate(pref_data)
    return result


def _resolve_granularity(category_id: str, user_prefs: Dict[str, NotificationCategoryPref]) -> str:
    """Resolve effective granularity for a category: user pref > registry default."""
    if category_id in user_prefs:
        return user_prefs[category_id].granularity
    spec = notification_category_registry.get_or_none(category_id)
    if spec is not None:
        return spec.default_granularity
    return "all"


def _get_suppressed_categories(user: User) -> Set[str]:
    """Categories with effective granularity 'off' — excluded at SQL level."""
    user_prefs = _get_user_notification_prefs(user)
    suppressed: Set[str] = set()
    for spec in notification_category_registry.get_sorted():
        granularity = _resolve_granularity(spec.id, user_prefs)
        if granularity == "off":
            suppressed.add(spec.id)
    return suppressed


def _apply_granularity_filter(
    rows: List[Notification],
    user: User,
) -> List[Notification]:
    """Apply intermediate granularity filters (failures_only, status_only, errors_only)."""
    user_prefs = _get_user_notification_prefs(user)
    filtered: List[Notification] = []
    for n in rows:
        granularity = _resolve_granularity(n.category, user_prefs)
        if granularity == "off":
            continue
        if granularity == "all" or granularity == "all_changes":
            filtered.append(n)
            continue
        # Intermediate granularity filters
        if granularity == "failures_only":
            if n.severity in ("error", "warning"):
                filtered.append(n)
        elif granularity == "errors_only":
            if n.severity == "error":
                filtered.append(n)
        elif granularity == "status_only":
            # Status-only: let through severity=info (status changes) and errors
            if n.severity in ("info", "error", "warning"):
                filtered.append(n)
        else:
            # Unknown granularity — pass through
            filtered.append(n)
    return filtered


# ── Endpoints ─────────────────────────────────────────────────────


@router.get("/categories", response_model=CategoriesListResponse)
async def list_categories(user: CurrentUser):
    """List all notification categories with defaults and user's current selections."""
    user_prefs = _get_user_notification_prefs(user)
    categories: List[CategoryResponse] = []
    for spec in notification_category_registry.get_sorted():
        current = _resolve_granularity(spec.id, user_prefs)
        categories.append(
            CategoryResponse(
                id=spec.id,
                label=spec.label,
                description=spec.description,
                icon=spec.icon,
                defaultGranularity=spec.default_granularity,
                granularityOptions=[
                    CategoryGranularityOptionResponse(
                        id=opt.id, label=opt.label, description=opt.description
                    )
                    for opt in spec.granularity_options
                ],
                sortOrder=spec.sort_order,
                currentGranularity=current,
            )
        )
    return CategoriesListResponse(categories=categories)


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: CurrentUser,
    category: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    include_suppressed: bool = Query(False),
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

    # SQL-level suppression of "off" categories
    if not include_suppressed:
        suppressed = _get_suppressed_categories(user)
        if suppressed:
            stmt = stmt.where(Notification.category.notin_(suppressed))

    rows = list((await db.execute(stmt)).scalars().all())

    # Python-level intermediate granularity filtering
    if not include_suppressed:
        rows = _apply_granularity_filter(rows, user)

    # Unread count (also respects suppression)
    count_stmt = (
        select(func.count())
        .select_from(Notification)
        .where(_user_filter(user))
        .where(Notification.read == False)  # noqa: E712
    )
    if not include_suppressed:
        suppressed = _get_suppressed_categories(user)
        if suppressed:
            count_stmt = count_stmt.where(Notification.category.notin_(suppressed))

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
    actor_name = user.display_name or user.username
    n = Notification(
        title=payload.title,
        body=payload.body,
        category=payload.category,
        severity=payload.severity,
        source=f"user:{user.id}",
        actor_name=actor_name,
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
    actor_name: Optional[str] = None,
) -> Notification:
    """Create a notification from backend code (plan hooks, agents, etc.)."""
    n = Notification(
        title=title,
        body=body,
        category=category,
        severity=severity,
        source=source,
        actor_name=actor_name,
        ref_type=ref_type,
        ref_id=ref_id,
        broadcast=broadcast,
        user_id=user_id,
        read=False,
        created_at=utcnow(),
    )
    db.add(n)
    return n
