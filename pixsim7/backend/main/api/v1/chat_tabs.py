"""Chat Tabs API — server-persisted AI Assistant tab list.

CRUD for ``ChatTab`` rows that point at existing ``ChatSession`` rows.
Closing a tab (DELETE) removes the ``ChatTab`` but leaves the underlying
session intact, so chats can be reopened later via the closed-tab picker
(plan ``chat-tab-server-persistence`` checkpoint E).

Tabs are strictly user-private — no shared/public variant and no admin
override. Every endpoint scopes by ``user_id == current_user.id``.
"""
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.platform.agent_profile import (
    ChatSession,
    ChatTab,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow

router = APIRouter(prefix="/chat-tabs", tags=["chat-tabs"])


# ── Schemas ───────────────────────────────────────────────────────


class ChatTabResponse(BaseModel):
    id: str
    sessionId: str
    label: str
    draft: Optional[str] = None
    orderIndex: int
    planId: Optional[str] = None
    scopeKey: Optional[str] = None
    pinned: bool
    createdAt: str
    updatedAt: str


class ChatTabsListResponse(BaseModel):
    tabs: List[ChatTabResponse]


class ChatTabCreateRequest(BaseModel):
    id: Optional[UUID] = Field(
        None,
        description=(
            "Optional client-minted UUID for the new tab. Lets the frontend "
            "use the id immediately for optimistic UI without awaiting the "
            "server response. If omitted, the server generates one."
        ),
    )
    session_id: Optional[str] = Field(
        None,
        description="Existing ChatSession to bind the tab to. If omitted, a new session is auto-created.",
        max_length=120,
    )
    label: Optional[str] = Field(None, max_length=255)
    plan_id: Optional[str] = Field(None, max_length=120)
    scope_key: Optional[str] = Field(None, max_length=255)
    pinned: bool = False
    draft: Optional[str] = None
    order_index: Optional[int] = Field(
        None,
        description="Tab strip position. If omitted, appended to the end.",
    )
    # Only used when auto-creating a ChatSession (session_id omitted):
    engine: Optional[str] = Field(None, max_length=32)
    profile_id: Optional[str] = Field(None, max_length=120)


class ChatTabUpdateRequest(BaseModel):
    """PATCH payload — only fields present are updated.

    ``model_dump(exclude_unset=True)`` is used server-side so callers can
    explicitly clear ``plan_id`` / ``scope_key`` by passing ``null``.
    """

    label: Optional[str] = Field(None, max_length=255)
    plan_id: Optional[str] = Field(None, max_length=120)
    scope_key: Optional[str] = Field(None, max_length=255)
    pinned: Optional[bool] = None
    draft: Optional[str] = None
    order_index: Optional[int] = None


class ChatTabReorderEntry(BaseModel):
    id: str
    order_index: int


class ChatTabReorderRequest(BaseModel):
    tabs: List[ChatTabReorderEntry]


# ── Helpers ───────────────────────────────────────────────────────


def _to_response(tab: ChatTab) -> ChatTabResponse:
    return ChatTabResponse(
        id=str(tab.id),
        sessionId=tab.session_id,
        label=tab.label,
        draft=tab.draft,
        orderIndex=tab.order_index,
        planId=tab.plan_id,
        scopeKey=tab.scope_key,
        pinned=tab.pinned,
        createdAt=tab.created_at.isoformat(),
        updatedAt=tab.updated_at.isoformat(),
    )


async def _load_owned_tab(db: AsyncSession, tab_id: UUID, user_id: int) -> ChatTab:
    """Fetch a tab and assert it belongs to the caller.

    Raises 404 if not found, 403 if owned by someone else — same shape as
    the existing notifications/plans patterns.
    """
    tab = await db.get(ChatTab, tab_id)
    if tab is None:
        raise HTTPException(status_code=404, detail="ChatTab not found")
    if tab.user_id != user_id:
        # 403 rather than 404 — leaks existence, but matches policy semantics
        # and the user can't address this row in any other endpoint anyway.
        raise HTTPException(status_code=403, detail="Not your tab")
    return tab


# ── Endpoints ─────────────────────────────────────────────────────


@router.get("", response_model=ChatTabsListResponse)
async def list_chat_tabs(
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """List the caller's open chat tabs, ordered by ``order_index`` then ``created_at``."""
    stmt = (
        select(ChatTab)
        .where(ChatTab.user_id == user.id)
        .order_by(ChatTab.order_index, ChatTab.created_at)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return ChatTabsListResponse(tabs=[_to_response(r) for r in rows])


@router.post("", response_model=ChatTabResponse)
async def create_chat_tab(
    payload: ChatTabCreateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Create a chat tab.

    If ``session_id`` is omitted, a fresh ``ChatSession`` is auto-created and
    the new tab bound to it. If provided, the session must already exist
    and belong to the caller.

    ``order_index`` defaults to ``max(existing) + 1`` (i.e. append to end).
    """
    session_id = payload.session_id
    if session_id is None:
        # Auto-create a new ChatSession owned by the caller.
        session_id = uuid4().hex
        session = ChatSession(
            id=session_id,
            user_id=user.id,
            engine=payload.engine or "claude",
            profile_id=payload.profile_id,
            scope_key=payload.scope_key,
            label=payload.label or "Untitled",
            source="chat",
        )
        db.add(session)
    else:
        existing = await db.get(ChatSession, session_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="ChatSession not found")
        # Accept the caller's own sessions plus user_id=0 system/legacy sessions
        # — matches the list/get endpoints (meta_contracts.list_chat_sessions
        # filters by `user_id == user.id OR user_id == 0`). Without this, the
        # resume picker surfaces sessions the tab-create endpoint then rejects
        # with 403, the frontend optimistic insert rolls back, and the resumed
        # tab disappears on screen.
        if existing.user_id not in (user.id, 0):
            raise HTTPException(status_code=403, detail="Not your session")

    if payload.order_index is not None:
        order_index = payload.order_index
    else:
        max_stmt = select(func.max(ChatTab.order_index)).where(ChatTab.user_id == user.id)
        current_max = (await db.execute(max_stmt)).scalar()
        order_index = (current_max + 1) if current_max is not None else 0

    # Honour client-provided id when present, else fall back to the model's
    # default_factory=uuid4. Lets the frontend optimistically render with the
    # same id it will eventually receive back.
    if payload.id is not None:
        existing_tab = await db.get(ChatTab, payload.id)
        if existing_tab is not None:
            raise HTTPException(
                status_code=409,
                detail="ChatTab with this id already exists",
            )

    tab_kwargs: dict = dict(
        user_id=user.id,
        session_id=session_id,
        label=payload.label or "Untitled",
        plan_id=payload.plan_id,
        scope_key=payload.scope_key,
        pinned=payload.pinned,
        draft=payload.draft,
        order_index=order_index,
    )
    if payload.id is not None:
        tab_kwargs["id"] = payload.id
    tab = ChatTab(**tab_kwargs)
    db.add(tab)
    await db.commit()
    await db.refresh(tab)
    return _to_response(tab)


@router.patch("/{tab_id}", response_model=ChatTabResponse)
async def update_chat_tab(
    tab_id: UUID,
    payload: ChatTabUpdateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Partial update. Only fields included in the body are written.

    Pass ``null`` for ``plan_id`` / ``scope_key`` / ``draft`` to clear them;
    omit them to leave them untouched.
    """
    tab = await _load_owned_tab(db, tab_id, user.id)

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(tab, key, value)
    tab.updated_at = utcnow()

    await db.commit()
    await db.refresh(tab)
    return _to_response(tab)


@router.delete("/{tab_id}")
async def delete_chat_tab(
    tab_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Close a tab.

    Deletes the ``ChatTab`` row. The underlying ``ChatSession`` is **not**
    touched — the conversation persists and can be reopened later via the
    closed-tab picker (checkpoint E).
    """
    tab = await _load_owned_tab(db, tab_id, user.id)
    await db.delete(tab)
    await db.commit()
    return {"ok": True}


@router.post("/reorder")
async def reorder_chat_tabs(
    payload: ChatTabReorderRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Bulk reorder tabs.

    Body: ``{"tabs": [{"id": "<uuid>", "order_index": N}, …]}``. Each id
    must belong to the caller; any unknown or other-owner id fails the whole
    request (no partial writes).
    """
    if not payload.tabs:
        return {"ok": True, "updated": 0}

    try:
        target = {UUID(entry.id): entry.order_index for entry in payload.tabs}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid tab id: {exc}") from exc

    stmt = select(ChatTab).where(
        ChatTab.user_id == user.id,
        ChatTab.id.in_(list(target.keys())),
    )
    rows = list((await db.execute(stmt)).scalars().all())

    if len(rows) != len(target):
        found_ids = {r.id for r in rows}
        missing = [str(i) for i in target.keys() if i not in found_ids]
        raise HTTPException(
            status_code=400,
            detail=f"Tabs not found or not yours: {missing}",
        )

    now = utcnow()
    updated = 0
    for tab in rows:
        new_index = target[tab.id]
        if tab.order_index != new_index:
            tab.order_index = new_index
            tab.updated_at = now
            updated += 1

    await db.commit()
    return {"ok": True, "updated": updated}
