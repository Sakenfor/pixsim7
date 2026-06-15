"""Chat Tabs API — server-persisted AI Assistant tab list.

CRUD for ``ChatTab`` rows that point at existing ``ChatSession`` rows.
Closing a tab (DELETE) removes the ``ChatTab`` but leaves the underlying
session intact, so chats can be reopened later via the closed-tab picker
(plan ``chat-tab-server-persistence`` checkpoint E).

Tabs are strictly user-private — no shared/public variant and no admin
override. Every endpoint scopes by ``user_id == current_user.id``.
"""
import logging
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import PlanParticipant
from pixsim7.backend.main.domain.platform.agent_profile import (
    ChatSession,
    ChatTab,
)
from pixsim7.backend.main.domain.platform.notification import Notification
from pixsim7.backend.main.shared.datetime_utils import utcnow

# Notification ref convention for chat-tab unread (plan
# `chat-tab-server-persistence` checkpoint D, paired with
# `notification-system` Phase 4a). Cross-device unread follows the SESSION:
# all tabs binding the same chat_session share a single unread state. The
# `chat_tab`-scoped value is accepted as a fallback for emitters that
# specifically want a per-device pip, and is cleaned up alongside.
NOTIF_REF_TYPE_CHAT_SESSION = "chat_session"
NOTIF_REF_TYPE_CHAT_TAB = "chat_tab"

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat-tabs", tags=["chat-tabs"])


# ── Schemas ───────────────────────────────────────────────────────


class ChatTabResponse(BaseModel):
    id: str
    # Nullable: a freshly-created tab has no session until the first turn
    # binds it to Claude's actual ``cli_session_id``. See plan
    # ``chat-tab-server-persistence`` — first-turn resume-failure fix.
    sessionId: Optional[str] = None
    label: str
    # Agent-set identity (plan `agent-freeform-tab-identity`). `icon` is an
    # @lib/icons IconName; `subtitle` renders under the tab title in the
    # profile-name slot. Both null until the agent sets them.
    icon: Optional[str] = None
    subtitle: Optional[str] = None
    draft: Optional[str] = None
    orderIndex: int
    planId: Optional[str] = None
    # Derived single plan the left sidebar groups this tab under: the
    # manual @-mention binding (`planId`) when set, else the most-recent
    # open session claim (so a tab an agent self-assigned — never
    # @-mentioned — still groups). Computed only on the list endpoint
    # (the sidebar source); create/PATCH echo `planId` and converge on
    # the next poll. Plan `plan-participant-liveness` /
    # `unify-tab-plan-categorization`.
    primaryPlanId: Optional[str] = None
    # Session-derived preference hints used when a second device opens tabs
    # that have no local tab-prefs cache yet. Keep optional so unbound tabs
    # and legacy responses remain valid.
    engine: Optional[str] = None
    profileId: Optional[str] = None
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
        description=(
            "Existing ChatSession to bind the tab to (used by the closed-tab "
            "reopen / orphan-session picker). If omitted, the tab is created "
            "unbound and gets bound on first turn when the bridge returns "
            "Claude's actual cli_session_id."
        ),
        max_length=120,
    )
    label: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field(None, max_length=50)
    subtitle: Optional[str] = Field(None, max_length=255)
    plan_id: Optional[str] = Field(None, max_length=120)
    scope_key: Optional[str] = Field(None, max_length=255)
    pinned: bool = False
    draft: Optional[str] = None
    order_index: Optional[int] = Field(
        None,
        description="Tab strip position. If omitted, appended to the end.",
    )
    # Accepted for forward-compat with clients that used to drive ChatSession
    # auto-create. Stored only as client-side tab prefs now — the server no
    # longer mints a ChatSession at tab-create time.
    engine: Optional[str] = Field(None, max_length=32)
    profile_id: Optional[str] = Field(None, max_length=120)


class ChatTabUpdateRequest(BaseModel):
    """PATCH payload — only fields present are updated.

    ``model_dump(exclude_unset=True)`` is used server-side so callers can
    explicitly clear ``plan_id`` / ``scope_key`` by passing ``null``.
    """

    label: Optional[str] = Field(None, max_length=255)
    # Agent-set identity (plan `agent-freeform-tab-identity`). Pass an
    # explicit ``null`` to clear (model_dump(exclude_unset=True) below
    # distinguishes "clear" from "leave untouched").
    icon: Optional[str] = Field(None, max_length=50)
    subtitle: Optional[str] = Field(None, max_length=255)
    plan_id: Optional[str] = Field(None, max_length=120)
    scope_key: Optional[str] = Field(None, max_length=255)
    pinned: Optional[bool] = None
    draft: Optional[str] = None
    order_index: Optional[int] = None
    # First-turn bind: the frontend sets this when the bridge surfaces
    # Claude's real ``cli_session_id``. Validated server-side to point at an
    # existing ChatSession owned by the caller (or system user_id=0). Plan
    # ``chat-tab-server-persistence`` — first-turn resume-failure fix.
    session_id: Optional[str] = Field(None, max_length=120)


class ChatTabReorderEntry(BaseModel):
    id: str
    order_index: int


class ChatTabReorderRequest(BaseModel):
    tabs: List[ChatTabReorderEntry]


# ── Helpers ───────────────────────────────────────────────────────


def _to_response(
    tab: ChatTab,
    *,
    primary_plan_id: Optional[str] = None,
    engine: Optional[str] = None,
    profile_id: Optional[str] = None,
) -> ChatTabResponse:
    # Default the derived primary to the manual binding; the list endpoint
    # overrides with the claim-derived value. create/PATCH leave it == planId
    # and the next list poll fills the self-assigned-only case.
    return ChatTabResponse(
        id=str(tab.id),
        sessionId=tab.session_id,
        label=tab.label,
        icon=tab.icon,
        subtitle=tab.subtitle,
        draft=tab.draft,
        orderIndex=tab.order_index,
        planId=tab.plan_id,
        primaryPlanId=primary_plan_id if primary_plan_id is not None else tab.plan_id,
        engine=engine,
        profileId=profile_id,
        scopeKey=tab.scope_key,
        pinned=tab.pinned,
        createdAt=tab.created_at.isoformat(),
        updatedAt=tab.updated_at.isoformat(),
    )


async def _derive_primary_plan_ids(
    db: AsyncSession, tabs: List[ChatTab]
) -> dict[str, str]:
    """{tab.id: derived primary plan} for tabs the sidebar should group.

    Primary = the tab's manual `plan_id` when set, else the plan of the
    session's most-recent OPEN builder claim (the participant-claim
    ledger keyed by `session_id` — shared with MCP self-assign). One
    batched query over the caller's session ids; tabs with a manual
    binding or no session never need a claim lookup.
    """
    session_ids = {t.session_id for t in tabs if t.session_id and not t.plan_id}
    out: dict[str, str] = {}
    for t in tabs:
        if t.plan_id:
            out[str(t.id)] = t.plan_id
    if not session_ids:
        return out

    from pixsim7.backend.main.api.v1.plans import helpers as _ph

    stmt = select(PlanParticipant).where(
        PlanParticipant.session_id.in_(session_ids),
        PlanParticipant.role == "builder",
    )
    rows = list((await db.execute(stmt)).scalars().all())
    # session_id -> (claimed_at, plan_id) of the most-recent open claim.
    best: dict[str, tuple[str, str]] = {}
    for row in rows:
        claim = _ph.participant_claim(row)
        if not _ph.claim_is_open(claim):
            continue
        at = claim.get("claimed_at") or ""
        cur = best.get(row.session_id)
        if cur is None or at > cur[0]:
            best[row.session_id] = (at, row.plan_id)
    for t in tabs:
        if t.plan_id or not t.session_id:
            continue
        hit = best.get(t.session_id)
        if hit:
            out[str(t.id)] = hit[1]
    return out


async def _to_response_single(
    db: AsyncSession,
    tab: ChatTab,
    *,
    engine: Optional[str] = None,
    profile_id: Optional[str] = None,
) -> ChatTabResponse:
    """``_to_response`` for one freshly-mutated tab, primary included.

    Single-tab mutation endpoints (create / PATCH / set-identity) must carry
    the same claim-derived ``primaryPlanId`` the list poll would, or a partial
    PATCH (e.g. a user rename) collapses it to ``tab.plan_id`` (null for tabs
    grouped via an agent's session claim) and the client shallow-merges that
    over the known value, bouncing the tab out of its plan group until the
    next poll. The list endpoint derives in one batch instead of per-row.
    """
    primary = await _derive_primary_plan_ids(db, [tab])
    return _to_response(
        tab,
        primary_plan_id=primary.get(str(tab.id)),
        engine=engine,
        profile_id=profile_id,
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


async def _sync_plan_claim(
    db: AsyncSession,
    *,
    user: CurrentUser,
    session_id: Optional[str],
    old_plan_id: Optional[str],
    new_plan_id: Optional[str],
) -> None:
    """Mirror a tab's plan binding into a PlanParticipant claim.

    A UI ``@plan:`` mention PATCHes ``ChatTab.plan_id``; that scalar is the
    derived *primary* for sidebar placement, but the multi-plan source of
    truth is the participant-claim ledger. Recording the claim here lets a
    user @-mention and an MCP agent self-assign working the *same* chat
    session resolve to one multi-plan membership (plan
    ``plan-participant-liveness`` / ``unify-tab-plan-categorization``).

    Best-effort: claim bookkeeping must never fail the tab PATCH. Runs in
    the caller's transaction (committed by the endpoint). Lazy import keeps
    the plans helper out of this module's import graph at load time.
    """
    if old_plan_id == new_plan_id:
        return
    try:
        from pixsim7.backend.main.api.v1.plans import helpers as _ph

        if old_plan_id:
            await _ph.release_checkpoint(
                db, principal=user, plan_id=old_plan_id, checkpoint_id=None
            )
        if new_plan_id:
            await _ph.claim_checkpoint(
                db,
                principal=user,
                plan_id=new_plan_id,
                checkpoint_id=None,
                session_id=session_id,
            )
    except Exception:  # noqa: BLE001 — claim sync is non-critical bookkeeping
        logger.warning(
            "chat-tab plan-claim sync failed (tab session=%s, %s -> %s)",
            session_id,
            old_plan_id,
            new_plan_id,
            exc_info=True,
        )


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
    primary = await _derive_primary_plan_ids(db, rows)
    # Session-derived hints for devices that don't have this tab's local
    # prefs cache yet (profile/engine were historically local-only).
    session_hints: dict[str, tuple[Optional[str], Optional[str]]] = {}
    session_ids = {r.session_id for r in rows if r.session_id}
    if session_ids:
        sess_stmt = select(ChatSession).where(
            ChatSession.id.in_(session_ids),
            or_(ChatSession.user_id == user.id, ChatSession.user_id == 0),
        )
        for s in (await db.execute(sess_stmt)).scalars().all():
            session_hints[s.id] = (s.engine, s.profile_id)
    tabs: list[ChatTabResponse] = []
    for row in rows:
        hint_engine: Optional[str] = None
        hint_profile_id: Optional[str] = None
        if row.session_id:
            hint_engine, hint_profile_id = session_hints.get(row.session_id, (None, None))
        tabs.append(
            _to_response(
                row,
                primary_plan_id=primary.get(str(row.id)),
                engine=hint_engine,
                profile_id=hint_profile_id,
            )
        )
    return ChatTabsListResponse(tabs=tabs)


@router.post("", response_model=ChatTabResponse)
async def create_chat_tab(
    payload: ChatTabCreateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Create a chat tab.

    If ``session_id`` is omitted the tab is created **unbound**. The first
    turn's ``cli_session_id`` returned by the bridge then PATCHes the tab
    to bind it — see plan ``chat-tab-server-persistence`` (first-turn
    resume-failure fix). Auto-minting a synthetic ChatSession at this
    point would feed Claude an unknown UUID to ``--resume``.

    If ``session_id`` is provided (closed-tab reopen / orphan picker), the
    session must already exist and belong to the caller (or system,
    ``user_id=0``).

    ``order_index`` defaults to ``max(existing) + 1`` (i.e. append to end).
    """
    session_id = payload.session_id
    if session_id is not None:
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

    # Reopening a session into a fresh tab inherits the identity the session
    # carries (mirrored there from the original tab on set_tab_identity), so a
    # resumed tab shows the same glyph/subtitle even on reopen paths that don't
    # forward it explicitly. An explicit value in the payload still wins.
    icon = payload.icon
    subtitle = payload.subtitle
    if session_id is not None and existing is not None:
        if icon is None:
            icon = existing.icon
        if subtitle is None:
            subtitle = existing.subtitle

    tab_kwargs: dict = dict(
        user_id=user.id,
        session_id=session_id,
        label=payload.label or "Untitled",
        icon=icon,
        subtitle=subtitle,
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
    return await _to_response_single(db, tab)


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
    old_plan_id = tab.plan_id

    # session_id binds the tab to a real ChatSession the first time the
    # bridge surfaces Claude's cli_session_id. Validate the target exists
    # and belongs to the caller before writing the FK — same scoping rule
    # as create_chat_tab. ``None`` is accepted (explicit unbind) so a
    # client can detach a tab from a stale session if needed.
    if "session_id" in updates and updates["session_id"] is not None:
        target_id = updates["session_id"]
        target = await db.get(ChatSession, target_id)
        if target is None:
            raise HTTPException(status_code=404, detail="ChatSession not found")
        if target.user_id not in (user.id, 0):
            raise HTTPException(status_code=403, detail="Not your session")

    for key, value in updates.items():
        setattr(tab, key, value)
    tab.updated_at = utcnow()

    if "plan_id" in updates:
        await _sync_plan_claim(
            db,
            user=user,
            session_id=tab.session_id,
            old_plan_id=old_plan_id,
            new_plan_id=tab.plan_id,
        )

    await db.commit()
    await db.refresh(tab)
    return await _to_response_single(db, tab)


# ── Agent-set tab identity (plan `agent-freeform-tab-identity`) ───


class TabIdentityRequest(BaseModel):
    """Agent-set icon / subtitle for *its own* tab.

    Partial: only fields present are written; pass an explicit ``null`` to
    clear (``model_dump(exclude_unset=True)`` distinguishes "clear" from
    "leave untouched", same convention as ``ChatTabUpdateRequest``).

    The tab is resolved server-side from the caller's token — never from a
    client-supplied tab id — so an agent can only ever brand the tab it was
    minted for. ``session_id`` is an optional last-resort resolver hint for
    tokens that carry neither a ``tab:`` scope_key nor a ``chat_session_id``
    claim; it is still owner-scoped before any write.
    """

    icon: Optional[str] = Field(None, max_length=50)
    subtitle: Optional[str] = Field(None, max_length=255)
    session_id: Optional[str] = Field(None, max_length=120)


async def _resolve_self_tab(
    db: AsyncSession,
    principal,
    *,
    fallback_session_id: Optional[str],
) -> ChatTab:
    """Resolve the caller's *own* chat tab from its token, owner-scoped.

    Priority (all from the validated JWT, not tool args):
      1. ``tab_id`` claim — the tab PK the token was minted for. Works on
         turn 1 (no session yet) and for plan-scoped tabs.
      2. ``scope_key == 'tab:<uuid>'`` — the tab the token was minted for.
      3. ``chat_session_id`` claim — the bound session → its ChatTab.
      4. ``fallback_session_id`` from the request body (last resort).

    Raises 404 when nothing resolves, 403 when the resolved tab is not the
    caller's (mirrors ``_load_owned_tab``). Never trusts a client-supplied
    tab id: the agent can only brand a tab owned by the principal it acts
    for, and the token binding pins it to *its* tab specifically.
    """
    tab: Optional[ChatTab] = None

    async def _by_tab_id(raw: Optional[str]) -> Optional[ChatTab]:
        if not raw:
            return None
        try:
            return await db.get(ChatTab, UUID(raw))
        except (ValueError, AttributeError):
            return None

    tab = await _by_tab_id(getattr(principal, "tab_id", None))

    if tab is None:
        scope_key = getattr(principal, "scope_key", None)
        if scope_key and scope_key.startswith("tab:"):
            tab = await _by_tab_id(scope_key[len("tab:") :])

    async def _by_session(sid: Optional[str]) -> Optional[ChatTab]:
        if not sid:
            return None
        stmt = (
            select(ChatTab)
            .where(ChatTab.session_id == sid)
            .order_by(ChatTab.updated_at.desc())
        )
        return (await db.execute(stmt)).scalars().first()

    if tab is None:
        tab = await _by_session(getattr(principal, "chat_session_id", None))
    if tab is None:
        tab = await _by_session(fallback_session_id)

    if tab is None:
        raise HTTPException(
            status_code=404,
            detail="No chat tab resolvable for this session (token carries no tab_id / tab scope_key / chat_session_id).",
        )
    if tab.user_id != principal.id:
        raise HTTPException(status_code=403, detail="Not your tab")
    return tab


@router.post("/self/identity", response_model=ChatTabResponse)
async def set_self_tab_identity(
    payload: TabIdentityRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Set the calling agent's own tab icon / subtitle (freeform, opt-in).

    Backs the ``set_tab_identity`` MCP tool. ``icon`` is stored as a plain
    short string; the frontend constrains it to the ``@lib/icons`` set and
    falls back to a default glyph for an unknown/unset value (no server-side
    icon enum — the icon registry lives client-side). Never auto-driven:
    only an explicit agent call lands here.
    """
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("session_id", None)
    if not updates:
        # Nothing to write — resolve+return current state so the agent can
        # read back what's set without a separate endpoint.
        tab = await _resolve_self_tab(
            db, user, fallback_session_id=payload.session_id
        )
        return await _to_response_single(db, tab)

    tab = await _resolve_self_tab(db, user, fallback_session_id=payload.session_id)
    for key, value in updates.items():
        setattr(tab, key, value)
    tab.updated_at = utcnow()

    # Mirror the identity onto the bound ChatSession so it survives the tab
    # being closed (closing deletes the ChatTab row). The resume picker reads
    # the session copy to render the same glyph/subtitle the tab had when live
    # (plan `agent-freeform-tab-identity` — resume parity).
    if tab.session_id:
        session = await db.get(ChatSession, tab.session_id)
        if session is not None:
            for key in ("icon", "subtitle"):
                if key in updates:
                    setattr(session, key, updates[key])

    await db.commit()
    await db.refresh(tab)
    return await _to_response_single(db, tab)


class TabPlanClaim(BaseModel):
    """One plan the tab's chat session is bound to / has an open claim on."""

    planId: str
    planTitle: Optional[str] = None
    checkpointId: Optional[str] = None
    claimedAt: Optional[str] = None
    # True for the tab's derived *primary* plan (ChatTab.plan_id) — the one
    # the left sidebar groups this single tab under. The others are
    # surfaced only in the chat header (multi-plan membership).
    primary: bool = False


class TabPlanClaimsResponse(BaseModel):
    tabId: str
    sessionId: Optional[str] = None
    primaryPlanId: Optional[str] = None
    plans: List[TabPlanClaim]


@router.get("/{tab_id}/plan-claims", response_model=TabPlanClaimsResponse)
async def list_tab_plan_claims(
    tab_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """All plans this tab's chat session is on (multi-plan membership).

    Source of truth = the participant-claim ledger keyed by the tab's bound
    ``session_id`` (shared by UI ``@plan:`` mentions and MCP agent
    self-assigns in the same session). The scalar ``ChatTab.plan_id`` is the
    derived *primary* and is always included even if no claim row exists yet
    (unbound tab, or claim sync skipped). Feeds the ContextBar header chip
    set; the left sidebar still groups the tab once under ``primaryPlanId``.
    """
    tab = await _load_owned_tab(db, tab_id, user.id)
    primary = tab.plan_id

    from pixsim7.backend.main.api.v1.plans import helpers as _ph

    by_plan: dict[str, TabPlanClaim] = {}
    if tab.session_id:
        stmt = select(PlanParticipant).where(
            PlanParticipant.session_id == tab.session_id,
            PlanParticipant.role == "builder",
        )
        rows = list((await db.execute(stmt)).scalars().all())
        for row in rows:
            claim = _ph.participant_claim(row)
            if not _ph.claim_is_open(claim):
                continue
            existing = by_plan.get(row.plan_id)
            # Keep the most recent open claim per plan.
            if existing and (existing.claimedAt or "") >= (claim.get("claimed_at") or ""):
                continue
            by_plan[row.plan_id] = TabPlanClaim(
                planId=row.plan_id,
                checkpointId=claim.get("checkpoint_id"),
                claimedAt=claim.get("claimed_at"),
                primary=(row.plan_id == primary),
            )

    # The derived primary is always present, even without a claim row.
    if primary and primary not in by_plan:
        by_plan[primary] = TabPlanClaim(planId=primary, primary=True)

    titles = await _ph.resolve_plan_titles(db, set(by_plan.keys()))
    # Stable chained sort: primary first, then most-recent claim first
    # (ISO-8601 strings sort lexicographically), then plan id.
    plans = sorted(by_plan.values(), key=lambda p: p.planId)
    plans.sort(key=lambda p: p.claimedAt or "", reverse=True)
    plans.sort(key=lambda p: not p.primary)
    for p in plans:
        p.planTitle = titles.get(p.planId)

    return TabPlanClaimsResponse(
        tabId=str(tab.id),
        sessionId=tab.session_id,
        primaryPlanId=primary,
        plans=plans,
    )


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

    Orphan-notification cleanup (checkpoint D): per-tab notifications
    (``ref_type='chat_tab', ref_id=tab.id``) are unconditionally mark-read.
    Per-session notifications (``ref_type='chat_session',
    ref_id=tab.session_id``) are mark-read only when this is the LAST tab
    pointing at that session for the caller — keeping the bell honest when
    the user closes one of several cross-device tabs on the same conversation.
    """
    tab = await _load_owned_tab(db, tab_id, user.id)
    session_id = tab.session_id

    # Snapshot the tab's identity onto its session before the row is deleted.
    # The user-facing name (and agent-set icon/subtitle) live on the ChatTab;
    # ChatSession.label is otherwise a generic "CLI session (…)" placeholder
    # (or the last user message). Once this tab is gone there's no ChatTab left
    # to read the real name from, so persist it here — that's what keeps the
    # closed-tab / Recent Chats picker showing "variables etc" instead of
    # "CLI session (…)". Only overwrite with meaningful values: skip the
    # "Untitled" create-time default, and don't clobber an existing
    # session icon/subtitle with an empty tab one. If another tab still binds
    # this session (cross-device), the snapshot simply reflects this tab's
    # last-known identity, which is fine — they share the conversation.
    if session_id:
        session = await db.get(ChatSession, session_id)
        if session is not None:
            if tab.label and tab.label != "Untitled":
                session.label = tab.label
            if tab.icon:
                session.icon = tab.icon
            if tab.subtitle:
                session.subtitle = tab.subtitle

    await db.delete(tab)
    await db.flush()  # so the count-other-tabs query below sees the deletion

    # Always clear per-tab unread for this exact id.
    notif_filters = [
        and_(
            Notification.ref_type == NOTIF_REF_TYPE_CHAT_TAB,
            Notification.ref_id == str(tab_id),
            Notification.user_id == user.id,
        )
    ]

    # If no other tab binds this session, clear session-scoped unread too.
    if session_id:
        remaining_stmt = select(func.count(ChatTab.id)).where(
            ChatTab.user_id == user.id,
            ChatTab.session_id == session_id,
        )
        remaining = (await db.execute(remaining_stmt)).scalar() or 0
        if remaining == 0:
            notif_filters.append(
                and_(
                    Notification.ref_type == NOTIF_REF_TYPE_CHAT_SESSION,
                    Notification.ref_id == session_id,
                    Notification.user_id == user.id,
                )
            )

    mark_stmt = (
        update(Notification)
        .where(or_(*notif_filters))
        .where(Notification.read == False)  # noqa: E712
        .values(read=True)
    )
    await db.execute(mark_stmt)

    await db.commit()
    return {"ok": True}


class OrphanSession(BaseModel):
    """A ChatSession that the caller can re-open into a new tab.

    Subset of ChatSession columns: just what the picker needs. Excludes the
    messages JSON column (heavy, fetched lazily on actual resume) and
    bookkeeping fields (cli_session_id, status). Sorted newest-first.
    """

    id: str
    engine: str
    label: str
    # Agent-set identity mirrored from the (now-closed) tab, so the reopen
    # picker can show the same glyph/subtitle it had when live.
    icon: Optional[str] = None
    subtitle: Optional[str] = None
    profileId: Optional[str] = None
    scopeKey: Optional[str] = None
    lastPlanId: Optional[str] = None
    messageCount: int
    lastUsedAt: str
    createdAt: str
    source: Optional[str] = None


class OrphanSessionsResponse(BaseModel):
    sessions: List[OrphanSession]


@router.get("/orphan-sessions", response_model=OrphanSessionsResponse)
async def list_orphan_sessions(
    user: CurrentUser,
    db: AsyncSession = Depends(get_database),
    limit: int = 50,
):
    """Sessions the caller could re-open into a tab (plan checkpoint E).

    Returns ``ChatSession`` rows owned by the caller (or system, user_id=0,
    mirroring the resume picker) that have **no** ``ChatTab`` row pointing
    at them. Sorted by ``last_used_at`` descending so recently-used sessions
    surface first. Excludes archived sessions.

    The frontend's resume picker uses this in "orphans only" mode to power
    a 'Recent Chats' / closed-tab reopen workflow.
    """
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    # Subquery: ChatSession.ids that the caller already has a tab for.
    # Filter NULLs explicitly — ``ChatSession.id NOT IN (NULL, …)`` evaluates
    # to NULL in SQL three-valued logic and would hide every session.
    occupied = (
        select(ChatTab.session_id)
        .where(ChatTab.user_id == user.id)
        .where(ChatTab.session_id.is_not(None))
    )

    stmt = (
        select(ChatSession)
        .where(
            or_(
                ChatSession.user_id == user.id,
                ChatSession.user_id == 0,
            )
        )
        .where(ChatSession.id.not_in(occupied))
        .where(ChatSession.status != "archived")
        .order_by(ChatSession.last_used_at.desc())
        .limit(limit)
    )

    rows = list((await db.execute(stmt)).scalars().all())
    sessions = [
        OrphanSession(
            id=r.id,
            engine=r.engine,
            label=r.label,
            icon=r.icon,
            subtitle=r.subtitle,
            profileId=r.profile_id,
            scopeKey=r.scope_key,
            lastPlanId=r.last_plan_id,
            messageCount=r.message_count,
            lastUsedAt=r.last_used_at.isoformat(),
            createdAt=r.created_at.isoformat(),
            source=r.source,
        )
        for r in rows
    ]
    return OrphanSessionsResponse(sessions=sessions)


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
