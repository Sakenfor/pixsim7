from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim_logging import get_logger
from .base import _coverage_pct

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class FolderContextStatsResponse(BaseModel):
    """Folder context coverage statistics for local assets"""
    total_local: int
    with_folder_context: int
    without_folder_context: int
    fixable_from_metadata: int
    fixable_from_prefs: int
    unfixable: int
    percentage: float


class BackfillFolderContextResponse(BaseModel):
    """Response from folder context backfill operation"""
    success: bool
    updated: int
    phase1_bootstrapped: int
    phase2_named: int
    phase3_subfolder: int
    skipped: int
    errors: int


@router.get("/folder-context-stats", response_model=FolderContextStatsResponse)
async def get_folder_context_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> FolderContextStatsResponse:
    """
    Get statistics about folder context coverage for local assets.

    Shows how many local assets have upload_context with source_folder_id,
    and which ones can be recovered from media_metadata or user preferences.
    """

    uid = {"user_id": admin.id}

    total_local_r = await db.execute(text("""
        SELECT count(*) FROM assets
        WHERE user_id = :user_id AND upload_method = 'local'
    """), uid)
    total_local = total_local_r.scalar() or 0

    with_ctx_r = await db.execute(text("""
        SELECT count(*) FROM assets
        WHERE user_id = :user_id
          AND upload_method = 'local'
          AND upload_context IS NOT NULL
          AND upload_context->>'source_folder_id' IS NOT NULL
    """), uid)
    with_folder_context = with_ctx_r.scalar() or 0

    without_folder_context = total_local - with_folder_context

    fixable_meta_r = await db.execute(text("""
        SELECT count(*) FROM assets
        WHERE user_id = :user_id
          AND upload_method = 'local'
          AND upload_context IS NULL
          AND media_metadata IS NOT NULL
          AND (
              media_metadata->'upload_attribution'->>'source_folder_id' IS NOT NULL
              OR media_metadata->'upload_history'->'context'->>'source_folder_id' IS NOT NULL
              OR media_metadata->>'source_folder_id' IS NOT NULL
          )
    """), uid)
    fixable_from_metadata = fixable_meta_r.scalar() or 0

    fixable_prefs_r = await db.execute(text("""
        SELECT count(*) FROM assets
        WHERE user_id = :user_id
          AND upload_method = 'local'
          AND upload_context IS NOT NULL
          AND upload_context->>'source_folder_id' IS NOT NULL
          AND (upload_context->>'source_folder') IS NULL
    """), uid)
    fixable_from_prefs = fixable_prefs_r.scalar() or 0

    unfixable = max(0, without_folder_context - fixable_from_metadata)
    percentage = _coverage_pct(with_folder_context, total_local)

    return FolderContextStatsResponse(
        total_local=total_local,
        with_folder_context=with_folder_context,
        without_folder_context=without_folder_context,
        fixable_from_metadata=fixable_from_metadata,
        fixable_from_prefs=fixable_from_prefs,
        unfixable=unfixable,
        percentage=round(percentage, 2),
    )


@router.post("/backfill-folder-context", response_model=BackfillFolderContextResponse)
async def backfill_folder_context(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(default=200, ge=1, le=1000, description="Max assets per phase"),
) -> BackfillFolderContextResponse:
    """
    Three-phase idempotent backfill of folder context for local assets.

    Phase 1: Bootstrap upload_context from media_metadata hints
    Phase 2: Resolve source_folder display name from user preferences
    Phase 3: Derive source_subfolder from source_relative_path
    """

    try:
        uid = admin.id

        # Phase 1: Bootstrap upload_context from media_metadata
        phase1_result = await db.execute(text("""
            WITH candidates AS (
                SELECT id,
                    COALESCE(
                        media_metadata->'upload_attribution'->>'source_folder_id',
                        media_metadata->'upload_history'->'context'->>'source_folder_id',
                        media_metadata->>'source_folder_id'
                    ) AS folder_id,
                    COALESCE(
                        media_metadata->'upload_attribution'->>'source_relative_path',
                        media_metadata->'upload_history'->'context'->>'source_relative_path',
                        media_metadata->>'source_relative_path'
                    ) AS rel_path
                FROM assets
                WHERE user_id = :user_id
                  AND upload_method = 'local'
                  AND upload_context IS NULL
                  AND media_metadata IS NOT NULL
                  AND (
                      media_metadata->'upload_attribution'->>'source_folder_id' IS NOT NULL
                      OR media_metadata->'upload_history'->'context'->>'source_folder_id' IS NOT NULL
                      OR media_metadata->>'source_folder_id' IS NOT NULL
                  )
                LIMIT :limit
            )
            UPDATE assets a
            SET upload_context = jsonb_strip_nulls(jsonb_build_object(
                'source_folder_id', c.folder_id,
                'source_relative_path', c.rel_path
            ))
            FROM candidates c
            WHERE a.id = c.id
        """), {"user_id": uid, "limit": limit})
        phase1_bootstrapped = phase1_result.rowcount

        # Phase 2: Resolve folder name from user preferences
        phase2_result = await db.execute(text("""
            WITH folder_map AS (
                SELECT
                    u.id AS user_id,
                    f->>'id' AS folder_id,
                    f->>'name' AS folder_name
                FROM users u,
                     jsonb_array_elements((u.preferences->'localFolders')::jsonb) AS f
                WHERE u.id = :user_id
                  AND u.preferences->'localFolders' IS NOT NULL
                  AND jsonb_typeof((u.preferences->'localFolders')::jsonb) = 'array'
            )
            UPDATE assets a
            SET upload_context = a.upload_context || jsonb_build_object('source_folder', fm.folder_name)
            FROM folder_map fm
            WHERE a.user_id = fm.user_id
              AND a.upload_method = 'local'
              AND a.upload_context IS NOT NULL
              AND a.upload_context->>'source_folder_id' = fm.folder_id
              AND (a.upload_context->>'source_folder') IS NULL
        """), {"user_id": uid})
        phase2_named = phase2_result.rowcount

        # Phase 3: Derive source_subfolder from source_relative_path
        phase3_result = await db.execute(text("""
            UPDATE assets
            SET upload_context = upload_context || jsonb_build_object(
                'source_subfolder',
                split_part(
                    replace(upload_context->>'source_relative_path', E'\\\\', '/'),
                    '/', 1
                )
            )
            WHERE user_id = :user_id
              AND upload_method = 'local'
              AND upload_context IS NOT NULL
              AND upload_context->>'source_relative_path' IS NOT NULL
              AND (upload_context->>'source_subfolder') IS NULL
              AND position('/' in replace(upload_context->>'source_relative_path', E'\\\\', '/')) > 0
        """), {"user_id": uid})
        phase3_subfolder = phase3_result.rowcount

        await db.commit()

        updated = phase1_bootstrapped + phase2_named + phase3_subfolder

        logger.info(
            "folder_context_backfill_complete",
            user_id=uid,
            phase1=phase1_bootstrapped,
            phase2=phase2_named,
            phase3=phase3_subfolder,
            total_updated=updated,
        )

        return BackfillFolderContextResponse(
            success=True,
            updated=updated,
            phase1_bootstrapped=phase1_bootstrapped,
            phase2_named=phase2_named,
            phase3_subfolder=phase3_subfolder,
            skipped=0,
            errors=0,
        )
    except Exception as exc:
        logger.error(
            "folder_context_backfill_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill folder context: {str(exc)}"
        )
