"""
Shared review workflow for user-created presets.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Protocol, Type

from pixsim7.backend.main.domain.enums import ReviewStatus
from pixsim7.backend.main.shared.datetime_utils import utcnow


class PresetReviewError(Exception):
    """Base error for preset review workflow."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class ReviewablePreset(Protocol):
    status: ReviewStatus
    approved_by_user_id: Optional[int]
    approved_at: Optional[datetime]
    rejected_at: Optional[datetime]
    rejection_reason: Optional[str]
    updated_at: datetime


class ReviewWorkflow:
    """Shared transitions for preset approval workflows."""

    def __init__(self, *, error_cls: Type[PresetReviewError] = PresetReviewError):
        self._error_cls = error_cls

    def ensure_editable(self, status: ReviewStatus) -> None:
        if status == ReviewStatus.APPROVED:
            raise self._error_cls("Approved presets cannot be edited", status_code=403)
        if status == ReviewStatus.PENDING:
            raise self._error_cls("Pending presets cannot be edited", status_code=403)

    def ensure_deletable(self, status: ReviewStatus) -> None:
        if status == ReviewStatus.APPROVED:
            raise self._error_cls("Approved presets cannot be deleted", status_code=403)

    def submit(self, preset: ReviewablePreset) -> None:
        if preset.status == ReviewStatus.APPROVED:
            raise self._error_cls("Preset already approved", status_code=400)
        preset.status = ReviewStatus.PENDING
        preset.updated_at = utcnow()

    def approve(self, preset: ReviewablePreset, *, admin_user_id: int) -> None:
        if preset.status == ReviewStatus.APPROVED:
            return
        preset.status = ReviewStatus.APPROVED
        preset.approved_by_user_id = admin_user_id
        preset.approved_at = utcnow()
        preset.rejected_at = None
        preset.rejection_reason = None
        preset.updated_at = utcnow()

    def reject(
        self,
        preset: ReviewablePreset,
        *,
        admin_user_id: int,
        reason: Optional[str],
    ) -> None:
        if preset.status == ReviewStatus.APPROVED:
            raise self._error_cls("Approved presets cannot be rejected", status_code=400)
        preset.status = ReviewStatus.REJECTED
        preset.approved_by_user_id = admin_user_id
        preset.rejected_at = utcnow()
        preset.rejection_reason = reason
        preset.updated_at = utcnow()
