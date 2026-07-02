"""Asset maintenance API endpoints.

SHA hash management, storage sync, backfill operations, format
conversion, duplicates, and the broken-video signal-scan surface.

Split from the former monolithic assets_maintenance.py: each feature is
its own module with its own APIRouter; this package aggregates them into
the single `router` that api/v1/assets.py mounts.
"""
from fastapi import APIRouter

from . import (
    sha,
    storage_sync,
    content_blobs,
    thumbnails,
    previews,
    folder_context,
    upload_method,
    format_conversion,
    duplicates,
    signal_scan,
    signal_references,
    signal_backfill_runs,
)

router = APIRouter(tags=["assets-maintenance"])

router.include_router(sha.router)
router.include_router(storage_sync.router)
router.include_router(content_blobs.router)
router.include_router(thumbnails.router)
router.include_router(previews.router)
router.include_router(folder_context.router)
router.include_router(upload_method.router)
router.include_router(format_conversion.router)
router.include_router(duplicates.router)
router.include_router(signal_scan.router)
router.include_router(signal_references.router)
router.include_router(signal_backfill_runs.router)
