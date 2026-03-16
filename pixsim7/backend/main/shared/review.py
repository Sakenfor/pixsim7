"""
Generic review/approval workflow.

Re-exports the review workflow with generic naming.
The implementation lives in shared.presets.review (originally built for
analyzer presets but fully generic via the Reviewable protocol).

Usage:
    from pixsim7.backend.main.shared.review import (
        ReviewWorkflow,
        ReviewError,
        Reviewable,
        ReviewStatus,
    )

    class MyRequest(SQLModel, table=True):
        status: ReviewStatus = ReviewStatus.DRAFT
        approved_by_user_id: Optional[int] = None
        approved_at: Optional[datetime] = None
        rejected_at: Optional[datetime] = None
        rejection_reason: Optional[str] = None
        updated_at: datetime

    workflow = ReviewWorkflow()
    workflow.submit(request)    # draft -> pending
    workflow.approve(request, admin_user_id=1)  # pending -> approved
    workflow.reject(request, admin_user_id=1, reason="...")  # pending -> rejected
"""
from pixsim7.backend.main.domain.enums import ReviewStatus
from pixsim7.backend.main.shared.presets.review import (
    PresetReviewError as ReviewError,
    ReviewablePreset as Reviewable,
    ReviewWorkflow,
)

__all__ = [
    "ReviewError",
    "Reviewable",
    "ReviewStatus",
    "ReviewWorkflow",
]
