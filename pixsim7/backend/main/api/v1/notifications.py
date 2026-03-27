"""
Notifications API — lightweight broadcast/targeted notifications.

Used by plan hooks, agents, and system for event announcements.
"""
from typing import Any, Dict, List, Optional, Set
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import Document, PlanRegistry
from pixsim7.backend.main.domain.platform.notification import Notification
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.notifications.notification_categories import (
    notification_category_registry,
    notification_event_type_registry,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.shared.schemas.user_schemas import (
    NotificationCategoryPref,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])

_CATEGORY_ID_ALIASES: Dict[str, str] = {
    "plans": "plan",
    "features": "feature",
    "systems": "system",
    "documents": "document",
    "generations": "generation",
    "characters": "character",
    "agent": "agent_session",
    "agents": "agent_session",
    "reviews": "review_workflow",
}

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
    eventType: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


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


class NotificationEmitRequest(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=120)
    category: Optional[str] = Field(
        None,
        description="Optional explicit category. If omitted, server maps known events.",
    )
    severity: Optional[str] = Field(
        None,
        description="Optional explicit severity. If omitted, server maps known events.",
    )
    source: Optional[str] = Field(
        None,
        description="Optional source override. Defaults to authenticated user source.",
    )
    ref_type: Optional[str] = Field(None)
    ref_id: Optional[str] = Field(None)
    broadcast: bool = Field(True)
    user_id: Optional[int] = Field(None, description="Target user when broadcast=false")
    actor_name: Optional[str] = Field(
        None,
        description="Optional display actor override. Defaults to authenticated user display name.",
    )
    actor_user_id: Optional[int] = Field(
        None,
        description="Optional actor user id override. Defaults to authenticated user id.",
    )
    title: Optional[str] = Field(
        None,
        max_length=255,
        description="Required for custom event types that do not have built-in renderer rules.",
    )
    body: Optional[str] = Field(None)
    payload: Dict[str, Any] = Field(default_factory=dict)


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
    systemId: Optional[str] = None
    systemLabel: Optional[str] = None
    parentCategoryId: Optional[str] = None


class CategoriesListResponse(BaseModel):
    categories: List[CategoryResponse]


# ── Helpers ───────────────────────────────────────────────────────


def _display_name(user) -> str:
    # If user is a RequestPrincipal with actor_display_name (agent tokens),
    # use the composite name (e.g. "Claude Plan Writer (stefan)").
    if hasattr(user, "actor_display_name"):
        return user.actor_display_name
    return user.display_name or user.username or f"user:{user.id}"


def _resolve_actor_user_id(source: str, actor_user_id: Optional[int]) -> Optional[int]:
    if actor_user_id is not None:
        return actor_user_id
    if source.startswith("user:"):
        raw_id = source.split(":", 1)[1].strip()
        try:
            return int(raw_id)
        except ValueError:
            return None
    return None


def _extract_plan_title(
    n: Notification,
    plan_titles: Dict[str, str],
) -> Optional[str]:
    if n.ref_type == "plan" and n.ref_id and n.ref_id in plan_titles:
        return plan_titles[n.ref_id]

    if isinstance(n.payload, dict):
        payload_title = n.payload.get("planTitle")
        if isinstance(payload_title, str) and payload_title.strip():
            return payload_title.strip()

    for prefix in ("Plan created:", "Plan updated:"):
        if n.title.startswith(prefix):
            parsed = n.title[len(prefix):].strip()
            if parsed:
                return parsed

    if n.ref_id:
        return n.ref_id
    return None


def _extract_changes(payload: Any) -> List[Dict[str, str]]:
    if not isinstance(payload, dict):
        return []
    raw_changes = payload.get("changes")
    if not isinstance(raw_changes, list):
        return []

    changes: List[Dict[str, str]] = []
    for raw in raw_changes:
        if not isinstance(raw, dict):
            continue
        field = raw.get("field")
        if not isinstance(field, str) or not field.strip():
            continue

        old_raw = raw.get("old")
        new_raw = raw.get("new")
        old_value = "" if old_raw is None else str(old_raw)
        new_value = "" if new_raw is None else str(new_raw)
        changes.append({"field": field.strip(), "old": old_value, "new": new_value})

    return changes


def _render_notification_content(
    n: Notification,
    *,
    plan_titles: Dict[str, str],
) -> tuple[str, Optional[str]]:
    if n.event_type == "plan.created":
        plan_title = _extract_plan_title(n, plan_titles) or "Plan"
        return f"Plan created: {plan_title}", f"New plan: **{plan_title}**"

    if n.event_type == "plan.updated":
        plan_title = _extract_plan_title(n, plan_titles) or "Plan"
        changes = _extract_changes(n.payload)
        if changes:
            parts: List[str] = []
            for change in changes:
                next_value = change["new"] or "?"
                if change["field"] == "status":
                    parts.append(f"status -> {next_value}")
                else:
                    parts.append(f"{change['field']} -> {next_value}")
            body = f"**{plan_title}**: {', '.join(parts)}"
        else:
            body = n.body or f"**{plan_title}** updated"
        return f"Plan updated: {plan_title}", body

    return n.title, n.body


def _default_category_for_event(event_type: str, payload: Dict[str, Any]) -> str:
    return notification_event_type_registry.default_category_for_event(event_type, payload)


def _default_severity_for_event(event_type: str) -> str:
    return notification_event_type_registry.default_severity_for_event(event_type)


def _build_emit_title_body(payload: NotificationEmitRequest) -> tuple[str, Optional[str]]:
    if payload.event_type == "plan.created":
        if payload.ref_type != "plan" or not payload.ref_id:
            raise HTTPException(
                status_code=400,
                detail="plan.created requires ref_type='plan' and ref_id",
            )
        plan_title = payload.payload.get("planTitle")
        if not isinstance(plan_title, str) or not plan_title.strip():
            raise HTTPException(
                status_code=400,
                detail="plan.created requires payload.planTitle",
            )
        normalized_title = plan_title.strip()
        return f"Plan created: {normalized_title}", f"New plan: **{normalized_title}**"

    if payload.event_type == "plan.updated":
        if payload.ref_type != "plan" or not payload.ref_id:
            raise HTTPException(
                status_code=400,
                detail="plan.updated requires ref_type='plan' and ref_id",
            )
        changes = _extract_changes(payload.payload)
        if not changes:
            raise HTTPException(
                status_code=400,
                detail="plan.updated requires payload.changes with at least one entry",
            )

        plan_title_raw = payload.payload.get("planTitle")
        plan_title = (
            plan_title_raw.strip()
            if isinstance(plan_title_raw, str) and plan_title_raw.strip()
            else payload.ref_id
        )
        parts: List[str] = []
        for change in changes:
            next_value = change["new"] or "?"
            if change["field"] == "status":
                parts.append(f"status -> {next_value}")
            else:
                parts.append(f"{change['field']} -> {next_value}")
        return f"Plan updated: {plan_title}", f"**{plan_title}**: {', '.join(parts)}"

    if not payload.title:
        raise HTTPException(
            status_code=400,
            detail="title is required for custom event types",
        )
    return payload.title, payload.body


def _to_response(
    n: Notification,
    *,
    actor_names: Dict[int, str],
    plan_titles: Dict[str, str],
) -> dict:
    title, body = _render_notification_content(n, plan_titles=plan_titles)
    actor_name = n.actor_name
    is_agent = isinstance(n.source, str) and n.source.startswith("agent:")
    if n.actor_user_id is not None and not is_agent:
        # For user-sourced notifications, refresh display name from DB.
        # For agent-sourced, preserve the stored composite name
        # (e.g. "Claude Plan Writer (stefan)") instead of overwriting
        # with just the delegating user's name.
        actor_name = actor_names.get(n.actor_user_id, actor_name)

    return {
        "id": str(n.id),
        "title": title,
        "body": body,
        "category": n.category,
        "severity": n.severity,
        "source": n.source,
        "actorName": actor_name,
        "refType": n.ref_type,
        "refId": n.ref_id,
        "broadcast": n.broadcast,
        "read": n.read,
        "createdAt": n.created_at.isoformat() if n.created_at else "",
        "eventType": n.event_type,
        "payload": n.payload if isinstance(n.payload, dict) else None,
    }


def _user_filter(user: User):
    """Notifications visible to user: broadcasts + targeted to this user."""
    return or_(
        Notification.broadcast == True,  # noqa: E712
        Notification.user_id == user.id,
    )


def _normalize_category_id(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    return _CATEGORY_ID_ALIASES.get(normalized, normalized)


def _category_scope_expr(category_id: str):
    """Match a category plus dotted descendants (e.g. plan + plan.*)."""
    return or_(
        Notification.category == category_id,
        Notification.category.like(f"{category_id}.%"),
    )


def _apply_category_scope_filter(stmt, category_id: Optional[str]):
    if not category_id:
        return stmt
    return stmt.where(_category_scope_expr(category_id))


def _apply_suppressed_scope_filters(stmt, suppressed: Set[str]):
    for category_id in sorted(suppressed):
        stmt = stmt.where(~_category_scope_expr(category_id))
    return stmt


def _iter_parent_categories(category_id: str) -> List[str]:
    """Yield dotted parents from nearest to root: plan.status -> [plan]."""
    parts = category_id.split(".")
    parents: List[str] = []
    while len(parts) > 1:
        parts = parts[:-1]
        parents.append(".".join(parts))
    return parents


def _get_user_notification_prefs(user: User) -> Dict[str, NotificationCategoryPref]:
    """Extract typed notification preferences from user, falling back to empty."""
    raw_prefs = getattr(user, "preferences", None) or {}
    notif_prefs = raw_prefs.get("notifications")
    if not isinstance(notif_prefs, dict):
        return {}
    result: Dict[str, NotificationCategoryPref] = {}
    for raw_cat_id, pref_data in notif_prefs.items():
        if not isinstance(pref_data, dict):
            continue
        category_id = _normalize_category_id(str(raw_cat_id))
        if not category_id:
            continue
        parsed = NotificationCategoryPref.model_validate(pref_data)
        # If both alias and canonical keys exist, canonical wins.
        if raw_cat_id == category_id or category_id not in result:
            result[category_id] = parsed
    return result


def _resolve_granularity(category_id: str, user_prefs: Dict[str, NotificationCategoryPref]) -> str:
    """Resolve effective granularity for a category: user pref > registry default."""
    normalized_category_id = _normalize_category_id(category_id)
    if not normalized_category_id:
        return "all"
    category_id = normalized_category_id

    if category_id in user_prefs:
        return user_prefs[category_id].granularity

    spec = notification_category_registry.get_or_none(category_id)
    if spec is not None:
        # Parent-level preference can suppress child categories.
        # This keeps top-level toggles meaningful when systems expose subcategories.
        parent_id = spec.parent_category_id
        visited: Set[str] = set()
        while parent_id and parent_id not in visited:
            visited.add(parent_id)
            parent_pref = user_prefs.get(parent_id)
            if parent_pref is not None and parent_pref.granularity == "off":
                return "off"

            parent_spec = notification_category_registry.get_or_none(parent_id)
            parent_id = parent_spec.parent_category_id if parent_spec is not None else None

        return spec.default_granularity

    # Fallback for unregistered dotted subcategories (e.g. "plan.created"):
    # inherit from the closest known parent preference/spec.
    for parent_id in _iter_parent_categories(category_id):
        if parent_id in user_prefs:
            return user_prefs[parent_id].granularity
        if notification_category_registry.get_or_none(parent_id) is not None:
            return _resolve_granularity(parent_id, user_prefs)

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


async def _resolve_actor_names(
    db: AsyncSession,
    rows: List[Notification],
) -> Dict[int, str]:
    actor_ids = {n.actor_user_id for n in rows if n.actor_user_id is not None}
    if not actor_ids:
        return {}

    users = (
        await db.execute(
            select(User).where(User.id.in_(actor_ids))
        )
    ).scalars().all()
    result: Dict[int, str] = {}
    for user in users:
        if user.id is None:
            continue
        result[user.id] = _display_name(user)
    return result


async def _resolve_plan_titles(
    db: AsyncSession,
    rows: List[Notification],
) -> Dict[str, str]:
    plan_ids = {n.ref_id for n in rows if n.ref_type == "plan" and n.ref_id}
    if not plan_ids:
        return {}

    matches = (
        await db.execute(
            select(PlanRegistry.id, Document.title)
            .join(Document, PlanRegistry.document_id == Document.id)
            .where(PlanRegistry.id.in_(plan_ids))
        )
    ).all()
    return {str(plan_id): title for plan_id, title in matches if isinstance(title, str)}


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
                systemId=spec.system_id,
                systemLabel=spec.system_label,
                parentCategoryId=spec.parent_category_id,
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
    category_id = _normalize_category_id(category)
    stmt = (
        select(Notification)
        .where(_user_filter(user))
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if category_id:
        stmt = _apply_category_scope_filter(stmt, category_id)
    if unread_only:
        stmt = stmt.where(Notification.read == False)  # noqa: E712

    # SQL-level suppression of "off" categories
    if not include_suppressed:
        suppressed = _get_suppressed_categories(user)
        if suppressed:
            stmt = _apply_suppressed_scope_filters(stmt, suppressed)

    rows = list((await db.execute(stmt)).scalars().all())

    # Python-level intermediate granularity filtering
    if not include_suppressed:
        rows = _apply_granularity_filter(rows, user)

    actor_names = await _resolve_actor_names(db, rows)
    plan_titles = await _resolve_plan_titles(db, rows)

    # Unread count with the same visibility/category suppression semantics.
    unread_stmt = (
        select(Notification)
        .where(_user_filter(user))
        .where(Notification.read == False)  # noqa: E712
    )
    if category_id:
        unread_stmt = _apply_category_scope_filter(unread_stmt, category_id)
    if not include_suppressed:
        suppressed = _get_suppressed_categories(user)
        if suppressed:
            unread_stmt = _apply_suppressed_scope_filters(unread_stmt, suppressed)

    unread_rows = list((await db.execute(unread_stmt)).scalars().all())
    if not include_suppressed:
        unread_rows = _apply_granularity_filter(unread_rows, user)
    unread = len(unread_rows)

    return NotificationListResponse(
        notifications=[
            _to_response(
                r,
                actor_names=actor_names,
                plan_titles=plan_titles,
            )
            for r in rows
        ],
        unreadCount=unread,
    )


@router.post(
    "",
    response_model=NotificationResponse,
    deprecated=True,
    summary="Legacy create — prefer POST /notifications/emit",
)
async def create_notification(
    payload: NotificationCreateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Create a notification (broadcast or targeted).

    .. deprecated::
        Use ``POST /notifications/emit`` with an explicit ``event_type`` instead.
        This endpoint stamps ``event_type='notification.manual'`` automatically.
    """
    actor_name = _display_name(user)
    source = f"user:{user.id}" if user.id is not None else "user:unknown"
    n = await emit_notification(
        db,
        title=payload.title,
        body=payload.body,
        category=payload.category,
        severity=payload.severity,
        source=source,
        event_type="notification.manual",
        ref_type=payload.ref_type,
        ref_id=payload.ref_id,
        broadcast=payload.broadcast,
        user_id=payload.user_id,
        actor_name=actor_name,
        actor_user_id=user.id,
        payload={},
    )
    await db.commit()
    return _to_response(
        n,
        actor_names={user.id: _display_name(user)} if user.id is not None else {},
        plan_titles={},
    )


@router.post("/emit", response_model=NotificationResponse)
async def emit_structured_notification(
    payload: NotificationEmitRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Contract-backed structured emit path for agents and system integrations."""
    title, body = _build_emit_title_body(payload)

    source = payload.source or (f"user:{user.id}" if user.id is not None else "user:unknown")
    actor_name = payload.actor_name or _display_name(user)
    actor_user_id = payload.actor_user_id if payload.actor_user_id is not None else user.id
    category = payload.category or _default_category_for_event(payload.event_type, payload.payload)
    severity = payload.severity or _default_severity_for_event(payload.event_type)

    n = await emit_notification(
        db,
        title=title,
        body=body,
        category=category,
        severity=severity,
        source=source,
        event_type=payload.event_type,
        ref_type=payload.ref_type,
        ref_id=payload.ref_id,
        broadcast=payload.broadcast,
        user_id=payload.user_id,
        actor_name=actor_name,
        actor_user_id=actor_user_id,
        payload=payload.payload,
    )
    await db.commit()
    return _to_response(
        n,
        actor_names=(
            {n.actor_user_id: actor_name}
            if n.actor_user_id is not None and actor_name
            else {}
        ),
        plan_titles={},
    )


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
    event_type: str,
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
    broadcast: bool = True,
    user_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Notification:
    """Create a structured notification from backend code.

    Every notification must carry an ``event_type``.  Use a registered
    event type for built-in validation, or a custom dotted string
    (e.g. ``"myfeature.completed"``) for ad-hoc events.
    """
    resolved_payload = payload if payload is not None else {}

    # Validate payload for known event types
    validation_error = notification_event_type_registry.validate_payload(
        event_type, resolved_payload,
    )
    if validation_error:
        raise ValueError(validation_error)

    resolved_actor_user_id = _resolve_actor_user_id(source, actor_user_id)
    n = Notification(
        title=title,
        body=body,
        category=category,
        severity=severity,
        source=source,
        event_type=event_type,
        actor_name=actor_name,
        actor_user_id=resolved_actor_user_id,
        ref_type=ref_type,
        ref_id=ref_id,
        payload=resolved_payload,
        broadcast=broadcast,
        user_id=user_id,
        read=False,
        created_at=utcnow(),
    )
    db.add(n)
    return n
