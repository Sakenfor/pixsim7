from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, text
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim_logging import get_logger

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class DuplicatesStatsResponse(BaseModel):
    """Aggregate stats for sha256-based duplicate groups."""
    group_count: int
    total_duplicates: int
    wasted_bytes: int


class DuplicateAssetInfo(BaseModel):
    """Asset summary for duplicate group listing."""
    id: int
    created_at: Optional[str] = None
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    media_type: Optional[str] = None
    upload_method: Optional[str] = None
    asset_kind: Optional[str] = None
    source_folder: Optional[str] = None
    source_relative_path: Optional[str] = None
    thumbnail_url: Optional[str] = None


class DuplicateGroup(BaseModel):
    """One sha256 group with its member assets."""
    sha256: str
    count: int
    total_bytes: int
    assets: list[DuplicateAssetInfo]


class DuplicatesResponse(BaseModel):
    """Paginated duplicate groups."""
    groups: list[DuplicateGroup]
    total_groups: int
    offset: int
    limit: int


@router.get("/duplicates-stats", response_model=DuplicatesStatsResponse)
async def get_duplicates_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> DuplicatesStatsResponse:
    """
    Aggregate stats for sha256-based duplicates across the user's library.

    A "duplicate group" is 2+ assets sharing the same sha256. `wasted_bytes`
    counts file_size_bytes for every asset beyond the first in each group
    (what could be reclaimed by keeping one copy per group).
    """

    row = (await db.execute(text("""
        WITH dup_groups AS (
            SELECT sha256,
                   count(*) AS cnt,
                   coalesce(sum(file_size_bytes), 0) AS total_bytes,
                   coalesce(min(file_size_bytes), 0) AS min_bytes
            FROM assets
            WHERE user_id = :user_id
              AND sha256 IS NOT NULL
            GROUP BY sha256
            HAVING count(*) > 1
        )
        SELECT count(*) AS group_count,
               coalesce(sum(cnt), 0) AS total_assets,
               coalesce(sum(total_bytes - min_bytes), 0) AS wasted
        FROM dup_groups
    """), {"user_id": admin.id})).fetchone()

    group_count = int(row.group_count or 0) if row else 0
    total_assets = int(row.total_assets or 0) if row else 0
    wasted = int(row.wasted or 0) if row else 0

    # total_duplicates = assets-above-one in each group
    total_duplicates = max(0, total_assets - group_count)

    return DuplicatesStatsResponse(
        group_count=group_count,
        total_duplicates=total_duplicates,
        wasted_bytes=wasted,
    )


@router.get("/duplicates", response_model=DuplicatesResponse)
async def list_duplicates(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> DuplicatesResponse:
    """
    List sha256 duplicate groups with member asset details.

    Groups ordered by count desc, then total bytes desc.
    """
    from pixsim7.backend.main.shared.storage_utils import storage_key_to_url

    # Total group count for pagination
    total_row = (await db.execute(text("""
        SELECT count(*) AS n
        FROM (
            SELECT sha256
            FROM assets
            WHERE user_id = :user_id AND sha256 IS NOT NULL
            GROUP BY sha256
            HAVING count(*) > 1
        ) g
    """), {"user_id": admin.id})).fetchone()
    total_groups = int(total_row.n or 0) if total_row else 0

    # Page of groups
    group_rows = (await db.execute(text("""
        SELECT sha256,
               count(*) AS cnt,
               coalesce(sum(file_size_bytes), 0) AS total_bytes
        FROM assets
        WHERE user_id = :user_id AND sha256 IS NOT NULL
        GROUP BY sha256
        HAVING count(*) > 1
        ORDER BY cnt DESC, total_bytes DESC, sha256 ASC
        OFFSET :offset LIMIT :limit
    """), {"user_id": admin.id, "offset": offset, "limit": limit})).fetchall()

    if not group_rows:
        return DuplicatesResponse(groups=[], total_groups=total_groups, offset=offset, limit=limit)

    sha_list = [r.sha256 for r in group_rows]

    # Fetch all member assets for this page in one query
    assets_result = await db.execute(
        select(Asset).where(
            Asset.user_id == admin.id,
            Asset.sha256.in_(sha_list),
        ).order_by(Asset.sha256, Asset.created_at.asc())
    )
    assets = assets_result.scalars().all()

    by_sha: dict[str, list[DuplicateAssetInfo]] = {}
    for a in assets:
        ctx = a.upload_context or {}
        by_sha.setdefault(a.sha256, []).append(DuplicateAssetInfo(
            id=a.id,
            created_at=a.created_at.isoformat() if a.created_at else None,
            file_size_bytes=a.file_size_bytes,
            mime_type=a.mime_type,
            media_type=a.media_type,
            upload_method=a.upload_method,
            asset_kind=getattr(a, 'asset_kind', None),
            source_folder=ctx.get('source_folder') if isinstance(ctx, dict) else None,
            source_relative_path=ctx.get('source_relative_path') if isinstance(ctx, dict) else None,
            thumbnail_url=storage_key_to_url(a.thumbnail_key),
        ))

    groups = [
        DuplicateGroup(
            sha256=r.sha256,
            count=int(r.cnt),
            total_bytes=int(r.total_bytes or 0),
            assets=by_sha.get(r.sha256, []),
        )
        for r in group_rows
    ]

    return DuplicatesResponse(
        groups=groups,
        total_groups=total_groups,
        offset=offset,
        limit=limit,
    )
