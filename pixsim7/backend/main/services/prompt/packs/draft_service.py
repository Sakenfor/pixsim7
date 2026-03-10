"""Prompt pack draft CRUD service."""
from __future__ import annotations

from datetime import datetime
import re
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import PromptPackDraft
from pixsim7.backend.main.shared.datetime_utils import utcnow

PROMPT_PACK_DRAFT_STATUSES = frozenset(
    {
        "draft",
        "compile_ok",
        "compile_failed",
        "submitted",
        "approved",
        "rejected",
    }
)

_PACK_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$")


class PromptPackDraftError(Exception):
    """Service-level validation or workflow error."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class PromptPackDraftService:
    """CRUD operations for user-authored prompt pack drafts."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_draft(
        self,
        *,
        owner_user_id: int,
        namespace: Optional[str],
        pack_slug: str,
        cue_source: str = "",
        status: Optional[str] = None,
    ) -> PromptPackDraft:
        normalized_namespace = _normalize_namespace(namespace, owner_user_id=owner_user_id)
        normalized_slug = _normalize_pack_slug(pack_slug)
        normalized_status = _normalize_status(status)

        conflict = await self._find_conflict(
            owner_user_id=owner_user_id,
            namespace=normalized_namespace,
            pack_slug=normalized_slug,
        )
        if conflict is not None:
            raise PromptPackDraftError(
                "Draft with this namespace and slug already exists",
                status_code=409,
            )

        now = utcnow()
        draft = PromptPackDraft(
            owner_user_id=owner_user_id,
            namespace=normalized_namespace,
            pack_slug=normalized_slug,
            status=normalized_status,
            cue_source=_normalize_cue_source(cue_source),
            created_at=now,
            updated_at=now,
        )
        self.session.add(draft)
        await self.session.flush()
        return draft

    async def list_drafts(
        self,
        *,
        owner_user_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PromptPackDraft]:
        stmt = (
            select(PromptPackDraft)
            .where(PromptPackDraft.owner_user_id == owner_user_id)
            .order_by(PromptPackDraft.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_draft(self, draft_id: UUID) -> Optional[PromptPackDraft]:
        return await self.session.get(PromptPackDraft, draft_id)

    async def update_draft_metadata(
        self,
        *,
        draft_id: UUID,
        owner_user_id: int,
        namespace: Optional[str] = None,
        pack_slug: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Optional[PromptPackDraft]:
        draft = await self.get_draft(draft_id)
        if draft is None:
            return None

        next_namespace = draft.namespace
        next_slug = draft.pack_slug
        next_status = draft.status

        if namespace is not None:
            next_namespace = _normalize_namespace(namespace, owner_user_id=owner_user_id)
        if pack_slug is not None:
            next_slug = _normalize_pack_slug(pack_slug)
        if status is not None:
            next_status = _normalize_status(status)

        if next_namespace != draft.namespace or next_slug != draft.pack_slug:
            conflict = await self._find_conflict(
                owner_user_id=owner_user_id,
                namespace=next_namespace,
                pack_slug=next_slug,
                exclude_id=draft.id,
            )
            if conflict is not None:
                raise PromptPackDraftError(
                    "Draft with this namespace and slug already exists",
                    status_code=409,
                )

        draft.namespace = next_namespace
        draft.pack_slug = next_slug
        draft.status = next_status
        draft.updated_at = utcnow()
        await self.session.flush()
        return draft

    async def replace_draft_source(
        self,
        *,
        draft_id: UUID,
        cue_source: str,
    ) -> Optional[PromptPackDraft]:
        draft = await self.get_draft(draft_id)
        if draft is None:
            return None

        draft.cue_source = _normalize_cue_source(cue_source)
        draft.status = "draft"
        draft.last_compile_status = None
        draft.last_compile_errors = []
        draft.last_compiled_at = None
        draft.updated_at = utcnow()
        await self.session.flush()
        return draft

    async def record_compile_result(
        self,
        *,
        draft_id: UUID,
        status: str,
        diagnostics: list[dict[str, Any]],
        compiled_at: Optional[datetime] = None,
    ) -> Optional[PromptPackDraft]:
        draft = await self.get_draft(draft_id)
        if draft is None:
            return None

        normalized_status = _normalize_status(status)
        if normalized_status not in {"compile_ok", "compile_failed"}:
            raise PromptPackDraftError(
                "Compile result status must be 'compile_ok' or 'compile_failed'",
            )

        effective_compiled_at = compiled_at or utcnow()
        draft.status = normalized_status
        draft.last_compile_status = normalized_status
        draft.last_compile_errors = _normalize_compile_errors(diagnostics)
        draft.last_compiled_at = effective_compiled_at
        draft.updated_at = effective_compiled_at
        await self.session.flush()
        return draft

    async def _find_conflict(
        self,
        *,
        owner_user_id: int,
        namespace: str,
        pack_slug: str,
        exclude_id: Optional[UUID] = None,
    ) -> Optional[PromptPackDraft]:
        stmt = select(PromptPackDraft).where(
            PromptPackDraft.owner_user_id == owner_user_id,
            PromptPackDraft.namespace == namespace,
            PromptPackDraft.pack_slug == pack_slug,
        )
        if exclude_id is not None:
            stmt = stmt.where(PromptPackDraft.id != exclude_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


def _normalize_pack_slug(value: str) -> str:
    slug = str(value or "").strip().lower()
    if not slug:
        raise PromptPackDraftError("pack_slug is required")
    if not _PACK_SLUG_RE.match(slug):
        raise PromptPackDraftError(
            "pack_slug must be lowercase alphanumeric with optional internal hyphens",
        )
    return slug


def _normalize_namespace(value: Optional[str], *, owner_user_id: int) -> str:
    default_namespace = f"user.{owner_user_id}"
    if value is None:
        return default_namespace

    namespace = str(value or "").strip().lower()
    if not namespace:
        return default_namespace

    owner_prefix = f"user.{owner_user_id}"
    if namespace == owner_prefix:
        return namespace
    if namespace.startswith(f"{owner_prefix}."):
        return namespace

    raise PromptPackDraftError(
        f"namespace must start with '{owner_prefix}' for this owner",
    )


def _normalize_status(value: Optional[str]) -> str:
    if value is None:
        return "draft"
    status = str(value or "").strip().lower()
    if not status:
        return "draft"
    if status not in PROMPT_PACK_DRAFT_STATUSES:
        allowed = ", ".join(sorted(PROMPT_PACK_DRAFT_STATUSES))
        raise PromptPackDraftError(f"Unsupported status '{status}'. Allowed: {allowed}")
    return status


def _normalize_cue_source(value: str) -> str:
    if value is None:
        return ""
    return str(value)


def _normalize_compile_errors(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    normalized: list[dict[str, Any]] = []
    for entry in value:
        if isinstance(entry, dict):
            normalized.append(dict(entry))
            continue
        normalized.append(
            {
                "code": "compile.invalid_diagnostic",
                "message": str(entry),
            }
        )
    return normalized
