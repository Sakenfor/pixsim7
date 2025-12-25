"""
Helpers for managing global content blob records.
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from pixsim_logging import get_logger

from pixsim7.backend.main.domain.assets.content import ContentBlob

logger = get_logger()


async def ensure_content_blob(
    db: AsyncSession,
    *,
    sha256: str,
    size_bytes: Optional[int] = None,
    mime_type: Optional[str] = None,
) -> ContentBlob:
    """Create or fetch a ContentBlob for a SHA256 hash."""
    if not sha256:
        raise ValueError("sha256 is required to ensure ContentBlob")

    values = {"sha256": sha256}
    if size_bytes is not None:
        values["size_bytes"] = int(size_bytes)
    if mime_type:
        values["mime_type"] = mime_type

    # Insert if missing (no-op on conflict), then fetch the record.
    stmt = insert(ContentBlob).values(**values).on_conflict_do_nothing(
        index_elements=["sha256"]
    )
    await db.execute(stmt)

    result = await db.execute(
        select(ContentBlob).where(ContentBlob.sha256 == sha256)
    )
    content = result.scalar_one()

    updated = False
    if size_bytes is not None and content.size_bytes is None:
        content.size_bytes = int(size_bytes)
        updated = True
    elif (
        size_bytes is not None
        and content.size_bytes is not None
        and int(size_bytes) != content.size_bytes
    ):
        logger.warning(
            "content_size_mismatch",
            sha256=sha256[:16],
            existing_size=content.size_bytes,
            new_size=int(size_bytes),
        )
    if mime_type and not content.mime_type:
        content.mime_type = mime_type
        updated = True

    if updated:
        db.add(content)

    return content
