"""Content pack management endpoints (list, manifests, reload, inventory, adopt, purge)."""
from typing import List, Optional
from fastapi import Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, require_admin
from pixsim7.backend.main.domain.user import User
from .schemas import ContentPackMatrixManifestResponse
from .router import router


@router.get("/meta/content-packs", response_model=List[str])
async def list_content_packs():
    """List discovered content packs (plugins with content/ dirs)."""
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        discover_content_packs,
    )
    return discover_content_packs()


@router.get("/meta/content-packs/manifests", response_model=List[ContentPackMatrixManifestResponse])
async def list_content_pack_manifests(
    pack: Optional[str] = Query(None, description="Optional pack name filter"),
):
    """List optional content-pack manifest files with Block Matrix query presets."""
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        CONTENT_PACKS_DIR,
        discover_content_packs,
        parse_manifests,
    )

    packs = [pack] if pack else discover_content_packs()
    manifests: List[ContentPackMatrixManifestResponse] = []
    for pack_name in packs:
        content_dir = CONTENT_PACKS_DIR / pack_name
        if not content_dir.exists() or not content_dir.is_dir():
            continue
        for raw in parse_manifests(content_dir, pack_name=pack_name):
            manifests.append(ContentPackMatrixManifestResponse(**raw))
    return manifests


@router.post("/meta/content-packs/reload")
async def reload_content_packs(
    pack: Optional[str] = Query(None, description="Specific pack to reload (default: all)"),
    force: bool = Query(False, description="Overwrite existing blocks/templates"),
    prune: bool = Query(False, description="Delete rows for this pack missing from YAML"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Reload content packs from disk without restarting the server.

    Discovers plugin content/ directories and upserts blocks + templates.
    Default: skip existing. Use force=true to overwrite.
    """
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        discover_content_packs,
        load_pack,
    )

    packs = [pack] if pack else discover_content_packs()
    results = {}

    for pack_name in packs:
        try:
            stats = await load_pack(
                db,
                pack_name,
                force=force,
                prune_missing=prune,
            )
            results[pack_name] = stats
        except FileNotFoundError:
            results[pack_name] = {"error": f"Content pack '{pack_name}' not found"}
        except Exception as e:
            results[pack_name] = {"error": str(e)}

    return {"packs_processed": len(packs), "results": results}


@router.get("/meta/content-packs/inventory")
async def get_content_pack_inventory(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Return full inventory of content packs (DB + disk), with entity counts and status."""
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        get_content_pack_inventory as _get_inventory,
    )

    return await _get_inventory(db)


@router.post("/meta/content-packs/purge")
async def purge_content_packs(
    pack: Optional[str] = Query(None, description="Specific orphaned pack to purge (default: all orphaned)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Purge orphaned content pack entities (packs no longer on disk).

    If pack is specified, purges that single pack. Otherwise purges all orphaned packs.
    """
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        get_content_pack_inventory as _get_inventory,
        purge_orphaned_pack,
    )

    if pack:
        try:
            stats = await purge_orphaned_pack(db, pack)
            return {"packs_purged": 1, "results": {pack: stats}}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Purge all orphaned packs
    inventory = await _get_inventory(db)
    orphaned = [
        name for name, info in inventory["packs"].items()
        if info["status"] == "orphaned"
    ]

    if not orphaned:
        return {"packs_purged": 0, "results": {}}

    results = {}
    packs_purged = 0
    for pack_name in orphaned:
        try:
            results[pack_name] = await purge_orphaned_pack(db, pack_name)
            packs_purged += 1
        except Exception as e:
            results[pack_name] = {"error": str(e)}

    return {"packs_purged": packs_purged, "results": results}


@router.post("/meta/content-packs/adopt")
async def adopt_orphaned_content_pack(
    source_pack: str = Query(..., description="Orphaned source pack name"),
    target_pack: str = Query(..., description="Target on-disk pack name"),
    rewrite_packages: bool = Query(
        True,
        description="Also rewrite template package_name/slot package_name when equal to source pack",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Adopt orphaned pack entities into a target pack by rewriting source metadata."""
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        adopt_orphaned_pack,
    )

    try:
        stats = await adopt_orphaned_pack(
            db,
            source_pack_name=source_pack,
            target_pack_name=target_pack,
            rewrite_package_names=rewrite_packages,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "source_pack": source_pack,
        "target_pack": target_pack,
        "rewrite_packages": rewrite_packages,
        "result": stats,
    }


@router.get("/meta/content-loaders/status")
async def get_content_loader_status():
    """Return health/status summary for all registered content loaders.

    Used by the Content Map panel to show loader status without
    needing to query each subsystem independently.
    """
    from pixsim7.backend.main.services.content import content_loader_registry

    statuses = content_loader_registry.get_all_status()
    return {
        "loaders": [
            {
                "id": s.loader_id,
                "label": s.label,
                "category": s.category,
                "healthy": s.healthy,
                "last_seed": s.last_seed.isoformat() if s.last_seed else None,
                "count": s.last_result.count if s.last_result else 0,
                "error": s.last_result.error if s.last_result else None,
                "duration_ms": s.last_result.duration_ms if s.last_result else None,
                "watchable": len(s.watch_dirs) > 0,
            }
            for s in statuses
        ],
        "summary": content_loader_registry.summary(),
    }
