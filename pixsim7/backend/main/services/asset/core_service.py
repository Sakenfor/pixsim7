"""
Asset Core Service

Core CRUD operations for assets: creation, retrieval, search, listing, and deletion.
"""
import os
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain import (
    Asset,
    ProviderSubmission,
    User,
    MediaType,
    SyncStatus,
)
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)
from pixsim7.backend.main.shared.schemas.media_metadata import RecognitionMetadata
from pixsim7.backend.main.infrastructure.events.bus import event_bus, ASSET_CREATED
from pixsim7.backend.main.services.user.user_service import UserService
from pixsim7.backend.main.services.prompt_dsl_adapter import analyze_prompt

import logging
logger = logging.getLogger(__name__)


class AssetCoreService:
    """
    Core asset management operations
    
    Handles:
    - Asset creation from provider submissions
    - Asset retrieval with authorization
    - Asset search and listing
    - Asset deletion
    """

    def __init__(
        self,
        db: AsyncSession,
        user_service: UserService
    ):
        self.db = db
        self.users = user_service

    # ===== ASSET CREATION =====

    async def create_from_submission(
        self,
        submission: ProviderSubmission,
        generation = None,  # Generation object (or job for backward compatibility)
        job = None  # Deprecated: use generation parameter instead
    ) -> Asset:
        """
        Create asset from provider submission

        This is the ONLY way to create assets (single source of truth)

        Args:
            submission: Provider submission with video data
            generation: Generation that created this asset (preferred)
            job: DEPRECATED - use generation parameter instead

        Returns:
            Created asset

        Raises:
            InvalidOperationError: Submission not successful
        """
        # Backward compatibility: accept either generation or job parameter
        if generation is None and job is not None:
            generation = job
        elif generation is None:
            raise InvalidOperationError("Either generation or job parameter must be provided")
        # Validate submission is successful
        if submission.status != "success":
            raise InvalidOperationError(
                f"Cannot create asset from failed submission (status={submission.status})"
            )

        # Extract data from submission response
        response = submission.response

        # Support both images and videos - check for generic asset ID first,
        # then fall back to video-specific or image-specific fields
        provider_asset_id = (
            response.get("provider_asset_id") or
            response.get("provider_video_id") or
            response.get("provider_image_id")
        )

        # Get asset URL - try generic first, then specific types
        asset_url = (
            response.get("asset_url") or
            response.get("video_url") or
            response.get("image_url")
        )
        thumbnail_url = response.get("thumbnail_url")

        if not provider_asset_id or not asset_url:
            raise InvalidOperationError(
                "Submission response missing required fields (provider_asset_id/provider_video_id, asset_url/video_url)"
            )

        # Detect media type from response or infer from operation type
        media_type_str = response.get("media_type")
        if media_type_str:
            media_type = MediaType(media_type_str)
        elif response.get("image_url") or response.get("provider_image_id"):
            media_type = MediaType.IMAGE
        elif response.get("video_url") or response.get("provider_video_id"):
            media_type = MediaType.VIDEO
        else:
            # Default to video for backward compatibility
            media_type = MediaType.VIDEO

        # Extract metadata up-front for dedup and insert
        metadata = response.get("metadata", {})
        width = response.get("width") or metadata.get("width")
        height = response.get("height") or metadata.get("height")
        duration_sec = response.get("duration_sec") or metadata.get("duration_sec")

        # Analyze prompt if available (for block extraction and tagging)
        prompt_analysis_result = None
        prompt_text = self._extract_prompt_from_generation(generation, submission)
        if prompt_text:
            try:
                prompt_analysis_result = await analyze_prompt(prompt_text)
            except Exception as e:
                logger.warning(f"Failed to analyze prompt for generation {generation.id}: {e}")

        # Check for duplicate (by provider_asset_id scoped to user)
        result = await self.db.execute(
            select(Asset).where(
                Asset.provider_id == submission.provider_id,
                Asset.provider_asset_id == provider_asset_id,
                Asset.user_id == generation.user_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            updated = False
            uploads = existing.provider_uploads or {}
            if uploads.get(submission.provider_id) != provider_asset_id:
                uploads = dict(uploads)
                uploads[submission.provider_id] = provider_asset_id
                existing.provider_uploads = uploads
                updated = True
            if not existing.remote_url and asset_url:
                existing.remote_url = asset_url
                updated = True
            # Note: thumbnail_url removed - thumbnails are generated by ingestion service
            if not existing.width and width:
                existing.width = width
                updated = True
            if not existing.height and height:
                existing.height = height
                updated = True
            if not existing.duration_sec and duration_sec:
                existing.duration_sec = duration_sec
                updated = True
            if not existing.provider_account_id and submission.account_id:
                existing.provider_account_id = submission.account_id
                updated = True
            if not existing.source_generation_id:
                existing.source_generation_id = generation.id
                updated = True
            if metadata and not existing.media_metadata:
                existing.media_metadata = metadata
                updated = True
            if prompt_analysis_result and not existing.prompt_analysis:
                existing.prompt_analysis = prompt_analysis_result
                updated = True
            if updated:
                existing.last_accessed_at = datetime.utcnow()
                await self.db.commit()
                await self.db.refresh(existing)
            return existing

        # Create asset
        asset = Asset(
            user_id=generation.user_id,
            media_type=media_type,  # Dynamically detected from response
            provider_id=submission.provider_id,
            provider_asset_id=provider_asset_id,
            provider_account_id=submission.account_id,
            remote_url=asset_url,
            thumbnail_url=thumbnail_url,
            width=width,
            height=height,
            duration_sec=duration_sec,  # None for images
            sync_status=SyncStatus.REMOTE,
            source_generation_id=generation.id,
            provider_uploads={submission.provider_id: provider_asset_id},
            media_metadata=metadata or None,
            prompt_analysis=prompt_analysis_result,
            created_at=datetime.utcnow(),
        )

        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)

        # Emit event
        await event_bus.publish(ASSET_CREATED, {
            "asset_id": asset.id,
            "user_id": generation.user_id,
            "generation_id": generation.id,
            "job_id": generation.id,  # Backward compatibility
            "provider_id": submission.provider_id,
        })

        # Create lineage edges from generation inputs to output asset
        await self._create_generation_lineage(asset, generation)

        return asset

    # ===== ASSET RETRIEVAL =====

    async def get_asset(self, asset_id: int) -> Asset:
        """
        Get asset by ID

        Args:
            asset_id: Asset ID

        Returns:
            Asset

        Raises:
            ResourceNotFoundError: Asset not found
        """
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            raise ResourceNotFoundError("Asset", asset_id)
        return asset

    # ===== RECOGNITION / METADATA HELPERS =====

    async def update_recognition_metadata(
        self,
        asset: Asset,
        recognition: RecognitionMetadata,
    ) -> Asset:
        """
        Merge recognition metadata into asset.media_metadata.

        This is intended to be used by offline analysis jobs that perform
        face recognition, action recognition, etc. It keeps the structure
        flexible and additive.
        """
        meta = dict(asset.media_metadata or {})
        meta["faces"] = [f.model_dump() for f in recognition.faces]
        meta["actions"] = [a.model_dump() for a in recognition.actions]
        meta["interactions"] = [i.model_dump() for i in recognition.interactions]
        asset.media_metadata = meta
        asset.last_accessed_at = datetime.utcnow()
        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)
        return asset

    async def find_assets_by_face_and_action(
        self,
        user: User,
        *,
        face_id: Optional[str] = None,
        action_label: Optional[str] = None,
        media_type: Optional[MediaType] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Asset]:
        """
        Best-effort helper to find assets matching a face and/or action label.

        This uses media_metadata JSON fields and is intended for convenience
        in higher-level systems like the scene builder or game world logic.
        It should not be relied on for strict correctness (recognition is
        inherently probabilistic).
        """
        from sqlalchemy import and_, or_, func

        query = select(Asset)

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Asset.user_id == user.id)

        if media_type:
            query = query.where(Asset.media_type == media_type)

        # JSONB conditions (PostgreSQL)
        # faces[*].face_id == face_id
        # actions[*].label == action_label
        conditions = []
        if face_id:
            conditions.append(
                func.jsonb_path_exists(
                    Asset.media_metadata,
                    f'$.faces[*] ? (@.face_id == "{face_id}")',
                )
            )
        if action_label:
            conditions.append(
                func.jsonb_path_exists(
                    Asset.media_metadata,
                    f'$.actions[*] ? (@.label == "{action_label}")',
                )
            )

        if conditions:
            query = query.where(and_(*conditions))

        query = query.order_by(Asset.created_at.desc(), Asset.id.desc())
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_asset_for_user(self, asset_id: int, user: User) -> Asset:
        """
        Get asset with authorization check

        Args:
            asset_id: Asset ID
            user: Current user

        Returns:
            Asset

        Raises:
            ResourceNotFoundError: Asset not found
            InvalidOperationError: Not authorized
        """
        asset = await self.get_asset(asset_id)

        # Authorization check
        if asset.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot access other users' assets")

        return asset

    async def list_assets(
        self,
        user: User,
        media_type: Optional[MediaType] = None,
        sync_status: Optional[SyncStatus] = None,
        provider_id: Optional[str] = None,
        *,
        tag: Optional[str] = None,
        q: Optional[str] = None,
        include_archived: bool = False,
        cursor: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Asset]:
        """
        List assets for user

        Args:
            user: User (or admin)
            media_type: Filter by media type
            sync_status: Filter by sync status
            provider_id: Filter by provider
            include_archived: If False (default), exclude archived assets
            limit: Max results
            offset: Pagination offset

        Returns:
            List of assets
        """
        # Base query
        from sqlalchemy import and_, or_
        query = select(Asset)

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Asset.user_id == user.id)

        # Exclude archived by default
        if not include_archived:
            query = query.where(Asset.is_archived == False)

        # Apply filters
        if media_type:
            query = query.where(Asset.media_type == media_type)
        if sync_status:
            query = query.where(Asset.sync_status == sync_status)
        if provider_id:
            query = query.where(Asset.provider_id == provider_id)
        if tag:
            # JSON array contains tag (postgres jsonb @>)
            query = query.where(Asset.tags.contains([tag]))
        if q:
            like = f"%{q}%"
            query = query.where(or_(Asset.description.ilike(like)))

        # Order by creation time desc and id desc for stable pagination
        query = query.order_by(Asset.created_at.desc(), Asset.id.desc())

        # Cursor pagination (created_at|id)
        if cursor:
            try:
                created_str, id_str = cursor.split("|", 1)
                from datetime import datetime as _dt
                c_time = _dt.fromisoformat(created_str)
                c_id = int(id_str)
                query = query.where(
                    or_(
                        Asset.created_at < c_time,
                        and_(Asset.created_at == c_time, Asset.id < c_id),
                    )
                )
            except Exception:
                # Ignore malformed cursor
                pass

        # Pagination
        if cursor:
            # Ignore offset when cursor is provided
            query = query.limit(limit)
        else:
            query = query.limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ===== TAG MANAGEMENT =====
    # NOTE: Tag management has been moved to TagService
    # Use: from pixsim7.backend.main.services.tag_service import TagService
    #      tag_service = TagService(db)
    #      await tag_service.assign_tags_to_asset(asset_id, tag_slugs)

    async def bulk_update_tags(
        self,
        asset_ids: List[int],
        tags: List[str],
        user: User,
        mode: str = "add"  # "add", "remove", "replace"
    ) -> List[Asset]:
        """
        Update tags for multiple assets at once using the new TagService

        Args:
            asset_ids: List of asset IDs
            tags: Tag slugs to apply (e.g., ["character:alice", "style:anime"])
            user: Current user
            mode: Operation mode - "add", "remove", or "replace"

        Returns:
            List of updated assets

        Raises:
            ResourceNotFoundError: Any asset not found
            PermissionError: User doesn't own any asset
        """
        from pixsim7.backend.main.services.tag_service import TagService

        tag_service = TagService(self.db)
        assets = []

        for asset_id in asset_ids:
            # Verify ownership
            asset = await self.get_asset_for_user(asset_id, user)

            # Apply tag operations
            if mode == "add":
                await tag_service.assign_tags_to_asset(asset_id, tags, auto_create=True)
            elif mode == "remove":
                await tag_service.remove_tags_from_asset(asset_id, tags)
            elif mode == "replace":
                await tag_service.replace_asset_tags(asset_id, tags, auto_create=True)
            else:
                raise InvalidOperationError(f"Invalid mode: {mode}. Use 'add', 'remove', or 'replace'")

            # Refresh to get updated asset
            await self.db.refresh(asset)
            assets.append(asset)

        return assets

    async def delete_asset(self, asset_id: int, user: User) -> None:
        """
        Delete an asset owned by the user (or any asset if admin).

        Removes the database record and best-effort deletes the local file.
        Also deletes any generations that reference this asset.
        """
        from pixsim7.backend.main.domain.generation.models import Generation
        from sqlalchemy import delete as sql_delete

        asset = await self.get_asset_for_user(asset_id, user)

        # Delete related generations that reference this asset
        await self.db.execute(
            sql_delete(Generation).where(Generation.asset_id == asset_id)
        )

        # Attempt to remove local file if present
        if asset.local_path:
            try:
                if os.path.exists(asset.local_path):
                    os.remove(asset.local_path)
            except Exception:
                # Ignore file system errors; deleting DB record should still proceed
                pass

        await self.db.delete(asset)
        await self.db.commit()

    # ===== PROMPT EXTRACTION HELPER =====

    def _extract_prompt_from_generation(self, generation, submission: ProviderSubmission) -> Optional[str]:
        """
        Extract prompt text from generation or submission.

        Tries multiple sources in order of preference:
        1. generation.final_prompt (post-substitution)
        2. generation.canonical_params.prompt
        3. generation.raw_params.prompt
        4. submission.payload.prompt

        Returns:
            Prompt text if found, None otherwise
        """
        # Try final_prompt first (post-substitution, most accurate)
        if hasattr(generation, 'final_prompt') and generation.final_prompt:
            return generation.final_prompt

        # Try canonical_params.prompt
        if hasattr(generation, 'canonical_params') and generation.canonical_params:
            prompt = generation.canonical_params.get('prompt')
            if prompt:
                return prompt

        # Try raw_params.prompt
        if hasattr(generation, 'raw_params') and generation.raw_params:
            prompt = generation.raw_params.get('prompt')
            if prompt:
                return prompt

        # Fall back to submission payload
        if submission.payload:
            prompt = submission.payload.get('prompt')
            if prompt:
                return prompt

        return None

    async def _create_generation_lineage(self, asset: Asset, generation) -> None:
        """
        Create lineage edges from generation inputs to the output asset.

        Reads generation.inputs (populated by _extract_inputs) and creates
        AssetLineage rows linking parent assets to the child asset.

        Only creates lineage for inputs that have resolvable asset references
        (in "asset:123" format).

        Args:
            asset: The newly created child asset
            generation: The generation that created this asset
        """
        from pixsim7.backend.main.services.asset.asset_factory import create_lineage_links_with_metadata

        # Check if generation has inputs
        if not hasattr(generation, 'inputs') or not generation.inputs:
            return

        inputs = generation.inputs
        if not isinstance(inputs, list) or len(inputs) == 0:
            return

        # Filter to only inputs with asset references
        inputs_with_assets = [
            inp for inp in inputs
            if isinstance(inp, dict) and inp.get("asset")
        ]

        if not inputs_with_assets:
            logger.debug(
                f"No asset inputs found for generation {generation.id}, skipping lineage creation"
            )
            return

        # Get operation_type from generation
        operation_type = generation.operation_type

        try:
            created_count = await create_lineage_links_with_metadata(
                self.db,
                child_asset_id=asset.id,
                parent_inputs=inputs_with_assets,
                operation_type=operation_type,
            )

            if created_count > 0:
                logger.info(
                    f"Created {created_count} lineage edge(s) for asset {asset.id} "
                    f"from generation {generation.id} ({operation_type.value})"
                )
        except Exception as e:
            # Log but don't fail asset creation if lineage fails
            logger.warning(
                f"Failed to create lineage for asset {asset.id}: {e}"
            )
