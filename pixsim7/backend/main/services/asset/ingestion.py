"""
Asset Ingestion Service

Orchestrates the media ingestion pipeline:
1. Download remote file (if URL source) - idempotent via hash
2. Store in storage service (stable key for serving)
3. Extract metadata (dimensions, duration, etc.)
4. Generate derivatives (thumbnails, previews)
5. Trigger on-ingest analyzers

Each step is implemented in the services.media package.
This file is the orchestrator only.

Design principles:
- Idempotent: skip re-download if hash matches, unless force=True
- Independent steps: metadata and thumbnails have separate "done" flags
- No user param: permissions derived from asset.user_id
- Storage abstraction: stored_key is stable, local_path is cache
"""
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import attributes

from pixsim7.backend.main.domain import Asset
from pixsim7.backend.main.domain.enums import SyncStatus
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim7.backend.main.shared.storage_utils import compute_sha256 as shared_compute_sha256
from pixsim7.backend.main.services.asset.content import ensure_content_blob
from pixsim7.backend.main.services.media.settings import MediaSettings, get_media_settings
from pixsim7.backend.main.services.media.download import download_file
from pixsim7.backend.main.services.media.metadata import extract_metadata
from pixsim7.backend.main.services.media.derivatives import generate_thumbnail, generate_preview
from pixsim7.backend.main.infrastructure.events.bus import event_bus
from pixsim7.backend.main.services.asset.events import ASSET_UPDATED
from pixsim_logging import get_logger

logger = get_logger()


# Ingestion status constants
INGEST_PENDING = "pending"
INGEST_PROCESSING = "processing"
INGEST_COMPLETED = "completed"
INGEST_FAILED = "failed"


class AssetIngestionService:
    """
    Service for ingesting media assets.

    Usage:
        service = AssetIngestionService(db)

        # Ingest a single asset (idempotent)
        await service.ingest_asset(asset_id)

        # Force re-ingest
        await service.ingest_asset(asset_id, force=True)

        # Ingest with specific options
        await service.ingest_asset(
            asset_id,
            extract_metadata=True,
            generate_thumbnails=False,
        )
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage = get_storage_service()
        self.settings = get_media_settings()

    async def ingest_asset(
        self,
        asset_id: int,
        *,
        force: bool = False,
        store_for_serving: Optional[bool] = None,
        extract_metadata: bool = True,
        generate_thumbnails: Optional[bool] = None,
        generate_previews: Optional[bool] = None,
    ) -> Asset:
        """
        Ingest a single asset.

        Idempotent by default: skips if already ingested (has stored_key and
        ingested_at) unless force=True. Individual steps (metadata, thumbnails, previews)
        can be re-run independently.
        """
        # Load asset
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            raise ValueError(f"Asset {asset_id} not found")

        # Apply defaults from settings
        if store_for_serving is None:
            store_for_serving = self.settings.prefer_local_over_provider
        if generate_thumbnails is None:
            generate_thumbnails = self.settings.generate_thumbnails
        if generate_previews is None:
            generate_previews = self.settings.generate_previews

        # Idempotent check: skip if already ingested with content-addressed storage (unless forced)
        is_content_addressed = asset.stored_key and '/content/' in asset.stored_key
        if not force and asset.ingest_status == INGEST_COMPLETED and is_content_addressed:
            needs_metadata = extract_metadata and not asset.metadata_extracted_at
            # Self-heal: treat thumbnail_generated_at as stale if the key is
            # missing (previous run marked it done but ffmpeg actually failed).
            needs_thumbnails = generate_thumbnails and (
                not asset.thumbnail_generated_at or
                (asset.thumbnail_generated_at and not asset.thumbnail_key)
            )
            needs_previews = generate_previews and (
                not asset.preview_generated_at or
                (asset.preview_generated_at and not asset.preview_key)
            )
            if not (needs_metadata or needs_thumbnails or needs_previews):
                logger.debug(
                    "ingest_skipped_already_complete",
                    asset_id=asset_id,
                    stored_key=asset.stored_key,
                )
                return asset

        # Skip if another call is already processing this asset
        if not force and asset.ingest_status == INGEST_PROCESSING:
            logger.debug(
                "ingest_skipped_already_processing",
                asset_id=asset_id,
            )
            return asset

        # Mark as processing
        asset.ingest_status = INGEST_PROCESSING
        asset.ingest_error = None
        await self.db.commit()

        try:
            # Step 1: Ensure we have local file
            local_path = await self._ensure_local_file(asset)
            if not local_path:
                raise ValueError("No source available (no remote_url or local_path)")

            # Step 2: Check hash for deduplication
            file_hash = shared_compute_sha256(local_path)
            is_content_addressed = asset.stored_key and '/content/' in asset.stored_key
            if asset.sha256 and asset.sha256 == file_hash and is_content_addressed and not force:
                logger.debug(
                    "ingest_skipped_same_hash",
                    asset_id=asset_id,
                    sha256=file_hash[:16],
                )
            else:
                asset.sha256 = file_hash

                # Step 3: Store in storage service (if enabled)
                if store_for_serving and not is_content_addressed:
                    stored_key = await self._store_file(asset, local_path, file_hash)
                    asset.stored_key = stored_key

            # Ensure size tracking for quotas
            if asset.file_size_bytes is None:
                try:
                    asset.file_size_bytes = Path(local_path).stat().st_size
                except Exception:
                    pass
            if asset.logical_size_bytes is None and asset.file_size_bytes is not None:
                asset.logical_size_bytes = asset.file_size_bytes

            # Step 4: Extract metadata
            if extract_metadata and (force or not asset.metadata_extracted_at):
                await self._do_extract_metadata(asset, local_path)
                asset.metadata_extracted_at = datetime.now(timezone.utc)

            # Step 5: Generate thumbnails
            # Self-heal: also retry if timestamp is set but key is missing
            # (previous run marked it done but generation actually failed).
            thumb_needed = force or not asset.thumbnail_generated_at or (
                asset.thumbnail_generated_at and not asset.thumbnail_key
            )
            if generate_thumbnails and thumb_needed:
                await generate_thumbnail(asset, local_path, self.settings)
                # Only mark as done if thumbnail_key was actually set —
                # generate_thumbnail silently returns on ffmpeg failure
                # without setting the key.  Leaving thumbnail_generated_at
                # unset allows future ingestion runs to retry.
                if asset.thumbnail_key:
                    asset.thumbnail_generated_at = datetime.now(timezone.utc)
                elif asset.thumbnail_generated_at:
                    # Clear stale timestamp from a previous failed attempt
                    asset.thumbnail_generated_at = None

            # Step 6: Generate previews
            preview_needed = force or not asset.preview_generated_at or (
                asset.preview_generated_at and not asset.preview_key
            )
            if generate_previews and preview_needed:
                await generate_preview(asset, local_path, self.settings)
                if asset.preview_key:
                    asset.preview_generated_at = datetime.now(timezone.utc)
                elif asset.preview_generated_at:
                    # Clear stale timestamp from a previous failed attempt
                    asset.preview_generated_at = None

            # Step 7: Trigger on-ingest analyzers (best-effort)
            await self._trigger_on_ingest_analyses(asset, local_path)

            # Link to global content blob (best-effort)
            if asset.sha256 and asset.content_id is None:
                content = await ensure_content_blob(
                    self.db,
                    sha256=asset.sha256,
                    size_bytes=asset.file_size_bytes,
                    mime_type=asset.mime_type,
                )
                asset.content_id = content.id

            # Mark as completed
            asset.ingest_status = INGEST_COMPLETED
            asset.ingest_error = None
            asset.ingested_at = datetime.now(timezone.utc)

            if asset.sync_status == SyncStatus.REMOTE:
                asset.sync_status = SyncStatus.DOWNLOADED
                asset.downloaded_at = datetime.now(timezone.utc)

            # Merge any concurrently-set metadata flags (e.g. provider_flagged
            # stamped by the poller while ingestion was downloading).
            # Re-read the current DB row to pick up changes from other sessions.
            from sqlalchemy import select as _select
            fresh_row = await self.db.execute(
                _select(Asset.media_metadata).where(Asset.id == asset.id)
            )
            fresh_meta = fresh_row.scalar_one_or_none() or {}
            if isinstance(fresh_meta, dict):
                local_meta = asset.media_metadata or {}
                for key in ("provider_flagged", "provider_flagged_reason"):
                    if key in fresh_meta and key not in local_meta:
                        local_meta[key] = fresh_meta[key]
                asset.media_metadata = local_meta

            attributes.flag_modified(asset, 'media_metadata')
            await self.db.commit()
            await self.db.refresh(asset)

            logger.info(
                "asset_ingestion_completed",
                asset_id=asset.id,
                stored_key=asset.stored_key,
                thumbnail_key=asset.thumbnail_key,
                metadata_extracted=asset.metadata_extracted_at is not None,
                thumbnail_generated=asset.thumbnail_generated_at is not None,
            )

            # Push a real-time asset update so generation/gallery clients can
            # refresh thumbnail/video URLs without requiring manual reload.
            await event_bus.publish(
                ASSET_UPDATED,
                {
                    "asset_id": asset.id,
                    "user_id": asset.user_id,
                    "source_generation_id": asset.source_generation_id,
                    "reason": "ingestion_completed",
                    "thumbnail_generated": asset.thumbnail_generated_at is not None,
                    "preview_generated": asset.preview_generated_at is not None,
                },
            )

            return asset

        except Exception as e:
            asset.ingest_status = INGEST_FAILED
            asset.ingest_error = str(e)[:500]
            await self.db.commit()

            logger.error(
                "asset_ingestion_failed",
                asset_id=asset.id,
                error=str(e),
                exc_info=True
            )

            raise

    # ── Private helpers ───────────────────────────────────────────────────

    async def _ensure_local_file(self, asset: Asset) -> Optional[str]:
        """Ensure we have a local file — use existing or download."""
        if asset.local_path and Path(asset.local_path).exists():
            logger.debug(
                "using_existing_local_path",
                asset_id=asset.id,
                local_path=asset.local_path,
            )
            return asset.local_path

        if not asset.remote_url:
            return None

        return await download_file(asset, self.settings)

    async def _store_file(self, asset: Asset, local_path: str, sha256: str) -> str:
        """Store file in storage service using content-addressed key."""
        ext = Path(local_path).suffix
        hash_prefix = sha256[:2]
        key = f"u/{asset.user_id}/content/{hash_prefix}/{sha256}{ext}"

        dest_path = self.storage.get_path(key)
        if Path(dest_path).exists():
            logger.debug(
                "file_already_stored",
                asset_id=asset.id,
                sha256=sha256[:16],
                key=key,
            )
            return key

        await self.storage.store_from_path(key, local_path)

        logger.debug(
            "file_stored",
            asset_id=asset.id,
            sha256=sha256[:16],
            key=key,
        )

        return key

    async def _do_extract_metadata(self, asset: Asset, local_path: str) -> None:
        """Delegate metadata extraction to media module."""
        await extract_metadata(asset, local_path)

    async def _trigger_on_ingest_analyses(
        self,
        asset: Asset,
        local_path: str,
    ) -> None:
        """
        Trigger analyzers with on_ingest=True after ingestion.

        Best-effort: individual failures never block ingestion.
        """
        try:
            from pixsim7.backend.main.domain import User
            from pixsim7.backend.main.services.analysis.analyzer_instance_service import (
                AnalyzerInstanceService,
            )
            from pixsim7.backend.main.services.analysis.analysis_service import (
                AnalysisService,
            )
            from pixsim7.backend.main.services.command_runtime import (
                run_subprocess_text,
                parse_shell_args,
            )
            import json

            instance_service = AnalyzerInstanceService(self.db)
            instances = await instance_service.list_on_ingest_instances(
                owner_user_id=asset.user_id,
            )
            if not instances:
                return

            user = await self.db.get(User, asset.user_id)
            if not user:
                logger.warning(
                    "on_ingest_skip_no_user",
                    asset_id=asset.id,
                    user_id=asset.user_id,
                )
                return

            analysis_service = AnalysisService(self.db)

            for instance in instances:
                try:
                    command = instance.config.get("command") if instance.config else None

                    if command:
                        await self._run_inline_analysis(
                            asset=asset,
                            local_path=local_path,
                            instance=instance,
                            user=user,
                            analysis_service=analysis_service,
                            command=command,
                        )
                    else:
                        await analysis_service.create_analysis(
                            user=user,
                            asset_id=asset.id,
                            analyzer_id=instance.analyzer_id,
                            enqueue=True,
                        )

                except Exception as e:
                    logger.warning(
                        "on_ingest_instance_failed",
                        asset_id=asset.id,
                        instance_id=instance.id,
                        analyzer_id=instance.analyzer_id,
                        error=str(e),
                    )

        except Exception as e:
            logger.warning(
                "on_ingest_trigger_failed",
                asset_id=asset.id,
                error=str(e),
            )

    async def _run_inline_analysis(
        self,
        *,
        asset: Asset,
        local_path: str,
        instance,
        user,
        analysis_service,
        command: str,
    ) -> None:
        """Execute a command-based analyzer inline and record result."""
        import json
        from pixsim7.backend.main.services.command_runtime import (
            run_subprocess_text,
            parse_shell_args,
        )

        # Prefer thumbnail for embedding analyzers
        embed_path = local_path
        if asset.thumbnail_key:
            thumb_path = self.storage.get_path(asset.thumbnail_key)
            if Path(thumb_path).exists():
                embed_path = thumb_path

        cmd_list = parse_shell_args(command, logger=logger)
        if not cmd_list:
            logger.warning(
                "on_ingest_empty_command",
                asset_id=asset.id,
                instance_id=instance.id,
            )
            return

        input_payload = json.dumps({
            "task": "embed_images",
            "paths": [embed_path],
        })

        timeout = instance.config.get("timeout", 120) if instance.config else 120
        result = await run_subprocess_text(
            cmd_list,
            input_text=input_payload,
            timeout=timeout,
        )

        # Create analysis record (no ARQ queueing — already executed)
        analysis = await analysis_service.create_analysis(
            user=user,
            asset_id=asset.id,
            analyzer_id=instance.analyzer_id,
            enqueue=False,
        )

        if result.returncode != 0:
            await analysis_service.mark_failed(
                analysis.id,
                f"Command exited {result.returncode}: {result.stderr[:300]}",
            )
            return

        stdout_text = result.stdout.strip()
        if not stdout_text:
            await analysis_service.mark_failed(analysis.id, "Empty output")
            return

        try:
            output_data = json.loads(stdout_text)
        except json.JSONDecodeError as e:
            await analysis_service.mark_failed(analysis.id, f"Invalid JSON: {e}")
            return

        await analysis_service.mark_completed(analysis.id, output_data)

    # ── Queue management ──────────────────────────────────────────────────

    async def queue_ingestion(self, asset_id: int, *, commit: bool = True) -> None:
        """Queue asset for background ingestion."""
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            return

        if asset.ingest_status in (INGEST_PROCESSING, INGEST_COMPLETED):
            return

        asset.ingest_status = INGEST_PENDING
        if commit:
            await self.db.commit()
        else:
            await self.db.flush()

        logger.debug("ingestion_queued", asset_id=asset_id)

    async def process_pending_batch(self, limit: int = 10) -> int:
        """Process a batch of pending ingestion jobs."""
        result = await self.db.execute(
            select(Asset)
            .where(Asset.ingest_status == INGEST_PENDING)
            .order_by(Asset.created_at.asc())
            .limit(limit)
        )
        assets = result.scalars().all()

        if not assets:
            return 0

        processed = 0
        for asset in assets:
            try:
                await self.ingest_asset(asset.id)
                processed += 1
            except Exception as e:
                logger.error(
                    "batch_ingestion_failed",
                    asset_id=asset.id,
                    error=str(e),
                )

        return processed

    async def retry_failed(self, asset_id: int) -> Asset:
        """Retry ingestion for a failed asset."""
        return await self.ingest_asset(asset_id, force=True)

    async def get_ingestion_stats(self) -> Dict[str, int]:
        """Get ingestion queue statistics."""
        from sqlalchemy import func

        result = await self.db.execute(
            select(
                Asset.ingest_status,
                func.count(Asset.id)
            )
            .group_by(Asset.ingest_status)
        )

        stats = {row[0] or "null": row[1] for row in result}

        return {
            "pending": stats.get(INGEST_PENDING, 0),
            "processing": stats.get(INGEST_PROCESSING, 0),
            "completed": stats.get(INGEST_COMPLETED, 0),
            "failed": stats.get(INGEST_FAILED, 0),
            "not_ingested": stats.get("null", 0),
        }
