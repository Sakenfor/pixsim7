"""
Asset bulk operations API endpoints

Bulk tag updates, delete, and export operations.
"""
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List

from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError
from pixsim_logging import get_logger

router = APIRouter(tags=["assets-bulk"])
logger = get_logger()


# ===== SCHEMAS =====

class BulkTagRequest(BaseModel):
    """Request for bulk tag operations"""
    asset_ids: List[int] = Field(description="List of asset IDs")
    tags: List[str] = Field(description="Tags to apply")
    mode: str = Field(default="add", description="Operation mode: add, remove, or replace")


class BulkDeleteRequest(BaseModel):
    """Request for bulk delete"""
    asset_ids: List[int] = Field(description="List of asset IDs to delete")


class BulkExportRequest(BaseModel):
    """Request for bulk export"""
    asset_ids: List[int] = Field(description="List of asset IDs to export")


# ===== BULK TAGS =====

@router.post("/bulk/tags")
async def bulk_update_tags(
    request: BulkTagRequest,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Update tags for multiple assets at once

    Modes:
    - "add": Add tags to existing tags
    - "remove": Remove specified tags
    - "replace": Replace all tags with new ones
    """
    try:
        assets = await asset_service.bulk_update_tags(
            asset_ids=request.asset_ids,
            tags=request.tags,
            user=user,
            mode=request.mode
        )
        return {
            "success": True,
            "updated_count": len(assets),
            "asset_ids": [a.id for a in assets]
        }

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to bulk update tags: {str(e)}"
        )


# ===== BULK DELETE =====

@router.post("/bulk/delete")
async def bulk_delete_assets(
    request: BulkDeleteRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
    delete_from_provider: bool = Query(
        default=True,
        description="Also delete assets from provider"
    ),
):
    """Delete multiple assets at once"""
    try:
        deleted_count = 0
        errors = []

        for asset_id in request.asset_ids:
            try:
                await asset_service.delete_asset(asset_id, user, delete_from_provider=delete_from_provider)
                deleted_count += 1
            except Exception as e:
                errors.append({
                    "asset_id": asset_id,
                    "error": str(e)
                })

        return {
            "success": True,
            "deleted_count": deleted_count,
            "total_requested": len(request.asset_ids),
            "errors": errors if errors else None
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to bulk delete: {str(e)}"
        )


# ===== BULK EXPORT =====

@router.post("/bulk/export")
async def bulk_export_assets(
    request: BulkExportRequest,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Export multiple assets as a ZIP file

    Returns a download URL for the generated ZIP file
    """
    temp_dir = None
    try:
        # Create temporary directory for ZIP
        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, f"export_{user.id}_{datetime.utcnow().timestamp()}.zip")

        # Create ZIP file
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for asset_id in request.asset_ids:
                try:
                    asset = await asset_service.get_asset_for_user(asset_id, user)

                    if asset.local_path and os.path.exists(asset.local_path):
                        file_path = asset.local_path
                    else:
                        logger.warning(f"Asset {asset_id} has no local file, skipping")
                        continue

                    ext = os.path.splitext(file_path)[1] or ".bin"
                    zip_filename = f"asset_{asset.id}_{asset.provider_id}{ext}"
                    zipf.write(file_path, zip_filename)

                except Exception as e:
                    logger.error(f"Failed to add asset {asset_id} to ZIP: {e}")
                    continue

        # Move ZIP to permanent storage
        export_dir = Path("data/exports")
        export_dir.mkdir(parents=True, exist_ok=True)

        zip_filename = f"export_{user.id}_{int(datetime.utcnow().timestamp())}.zip"
        final_path = export_dir / zip_filename
        shutil.move(zip_path, final_path)

        # Clean up temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)

        download_url = f"/api/v1/assets/downloads/{zip_filename}"

        return {
            "success": True,
            "download_url": download_url,
            "filename": zip_filename,
            "asset_count": len(request.asset_ids)
        }

    except Exception as e:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)

        logger.error(
            "bulk_export_failed",
            asset_ids=request.asset_ids,
            error=str(e),
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to export assets: {str(e)}"
        )


# ===== DOWNLOAD EXPORT =====

@router.get("/assets/downloads/{filename}")
async def download_export(
    filename: str,
    user: CurrentUser
):
    """Download an exported ZIP file"""
    # Security: validate filename (no path traversal)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Verify filename matches user ID
    if not filename.startswith(f"export_{user.id}_"):
        raise HTTPException(status_code=403, detail="Access denied")

    export_path = Path("data/exports") / filename

    if not export_path.exists():
        raise HTTPException(status_code=404, detail="Export file not found")

    return FileResponse(
        path=str(export_path),
        media_type="application/zip",
        filename=filename
    )
