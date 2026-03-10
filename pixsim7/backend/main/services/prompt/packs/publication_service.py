"""Prompt pack publication and review workflow service."""
from __future__ import annotations

from typing import Optional, Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import (
    PromptPackDraft,
    PromptPackPublication,
    PromptPackVersion,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow

PROMPT_PACK_PUBLICATION_VISIBILITIES = frozenset(
    {
        "private",
        "approved",
        "shared",
    }
)

PROMPT_PACK_PUBLICATION_REVIEW_STATUSES = frozenset(
    {
        "draft",
        "submitted",
        "approved",
        "rejected",
    }
)


class PromptPackPublicationError(Exception):
    """Service-level error for publication workflow operations."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class PromptPackPublicationService:
    """Manage submission/review/publication state transitions for pack versions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_publication(self, *, version_id: UUID) -> Optional[PromptPackPublication]:
        stmt = select(PromptPackPublication).where(PromptPackPublication.version_id == version_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_publications_for_versions(
        self,
        *,
        version_ids: Sequence[UUID],
    ) -> dict[str, PromptPackPublication]:
        if not version_ids:
            return {}

        stmt = select(PromptPackPublication).where(PromptPackPublication.version_id.in_(list(version_ids)))
        result = await self.session.execute(stmt)
        rows = result.scalars().all()
        return {str(row.version_id): row for row in rows}

    async def submit_version(
        self,
        *,
        version: PromptPackVersion,
        draft: PromptPackDraft,
        owner_user_id: int,
    ) -> PromptPackPublication:
        self._assert_owner(draft=draft, actor_user_id=owner_user_id)
        publication = await self._get_or_create_publication(version=version)

        now = utcnow()
        publication.review_status = "submitted"
        publication.visibility = "private"
        publication.reviewed_by_user_id = None
        publication.reviewed_at = None
        publication.review_notes = None
        publication.updated_at = now

        draft.status = "submitted"
        draft.updated_at = now
        await self.session.flush()
        return publication

    async def approve_version(
        self,
        *,
        version: PromptPackVersion,
        draft: PromptPackDraft,
        admin_user_id: int,
    ) -> PromptPackPublication:
        publication = await self._get_or_create_publication(version=version)
        if publication.review_status not in {"submitted", "approved"}:
            raise PromptPackPublicationError(
                "Version must be submitted before approval",
                status_code=409,
            )

        now = utcnow()
        publication.review_status = "approved"
        if publication.visibility != "shared":
            publication.visibility = "approved"
        publication.reviewed_by_user_id = admin_user_id
        publication.reviewed_at = now
        publication.updated_at = now

        draft.status = "approved"
        draft.updated_at = now
        await self.session.flush()
        return publication

    async def reject_version(
        self,
        *,
        version: PromptPackVersion,
        draft: PromptPackDraft,
        admin_user_id: int,
        review_notes: Optional[str] = None,
    ) -> PromptPackPublication:
        publication = await self._get_or_create_publication(version=version)
        if publication.review_status not in {"submitted", "approved", "rejected"}:
            raise PromptPackPublicationError(
                "Version must be submitted before rejection",
                status_code=409,
            )

        now = utcnow()
        publication.review_status = "rejected"
        publication.visibility = "private"
        publication.reviewed_by_user_id = admin_user_id
        publication.reviewed_at = now
        publication.review_notes = _normalize_review_notes(review_notes)
        publication.updated_at = now

        draft.status = "rejected"
        draft.updated_at = now
        await self.session.flush()
        return publication

    async def publish_private(
        self,
        *,
        version: PromptPackVersion,
        draft: PromptPackDraft,
        actor_user_id: int,
        actor_is_admin: bool,
    ) -> PromptPackPublication:
        self._assert_owner_or_admin(
            draft=draft,
            actor_user_id=actor_user_id,
            actor_is_admin=actor_is_admin,
        )
        publication = await self._get_or_create_publication(version=version)

        now = utcnow()
        publication.visibility = "private"
        publication.updated_at = now

        if publication.review_status in {"submitted", "approved", "rejected"}:
            draft.status = publication.review_status
            draft.updated_at = now

        await self.session.flush()
        return publication

    async def publish_shared(
        self,
        *,
        version: PromptPackVersion,
        draft: PromptPackDraft,
        actor_user_id: int,
        actor_is_admin: bool,
    ) -> PromptPackPublication:
        self._assert_owner_or_admin(
            draft=draft,
            actor_user_id=actor_user_id,
            actor_is_admin=actor_is_admin,
        )
        publication = await self._get_or_create_publication(version=version)
        if publication.review_status != "approved":
            raise PromptPackPublicationError(
                "Version must be approved before publishing to shared catalog",
                status_code=409,
            )

        now = utcnow()
        publication.visibility = "shared"
        publication.updated_at = now

        draft.status = "approved"
        draft.updated_at = now

        await self.session.flush()
        return publication

    async def _get_or_create_publication(self, *, version: PromptPackVersion) -> PromptPackPublication:
        existing = await self.get_publication(version_id=version.id)
        if existing is not None:
            return existing

        now = utcnow()
        publication = PromptPackPublication(
            version_id=version.id,
            visibility="private",
            review_status="draft",
            created_at=now,
            updated_at=now,
        )
        self.session.add(publication)
        await self.session.flush()
        return publication

    @staticmethod
    def _assert_owner(*, draft: PromptPackDraft, actor_user_id: int) -> None:
        if draft.owner_user_id == actor_user_id:
            return
        raise PromptPackPublicationError(
            "Not allowed to access this version",
            status_code=403,
        )

    @classmethod
    def _assert_owner_or_admin(
        cls,
        *,
        draft: PromptPackDraft,
        actor_user_id: int,
        actor_is_admin: bool,
    ) -> None:
        if actor_is_admin:
            return
        cls._assert_owner(draft=draft, actor_user_id=actor_user_id)


def _normalize_review_notes(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
