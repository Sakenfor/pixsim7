"""
Content blob model for global content-addressed storage.

This table is intentionally lightweight and can be used later to
deduplicate content across users without changing asset semantics.
"""
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Index


class ContentBlob(SQLModel, table=True):
    """Global content record keyed by SHA256 hash."""

    __tablename__ = "content_blobs"

    id: Optional[int] = Field(default=None, primary_key=True)
    sha256: str = Field(
        max_length=64,
        index=True,
        description="SHA256 content hash (global)",
    )
    size_bytes: Optional[int] = Field(
        default=None,
        description="Logical size of the content in bytes",
    )
    mime_type: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Canonical MIME type if known",
    )
    stored_key: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Optional global storage key (reserved for future use)",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_content_blobs_sha256", "sha256", unique=True),
    )
