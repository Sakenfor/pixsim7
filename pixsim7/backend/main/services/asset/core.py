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
from pixsim7.backend.main.services.prompt.parser import analyze_prompt
from pixsim_logging import get_logger

logger = get_logger()


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
        provider_status: Optional[str] = None,
        *,
        tag: Optional[str] = None,
        q: Optional[str] = None,
        include_archived: bool = False,
        cursor: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        # New search filters
        created_from: Optional[datetime] = None,
        created_to: Optional[datetime] = None,
        min_width: Optional[int] = None,
        max_width: Optional[int] = None,
        min_height: Optional[int] = None,
        max_height: Optional[int] = None,
        content_domain = None,  # ContentDomain enum
        content_category: Optional[str] = None,
        content_rating: Optional[str] = None,
        searchable: Optional[bool] = True,  # Default True to hide non-searchable
        source_generation_id: Optional[int] = None,
        operation_type = None,  # OperationType enum
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        sort_by: Optional[str] = None,
        sort_dir: Optional[str] = "desc",
    ) -> list[Asset]:
        """
        List assets for user with advanced search and filtering.

        Args:
            user: User (or admin)
            media_type: Filter by media type
            sync_status: Filter by sync status
            provider_id: Filter by provider
            provider_status: Filter by provider status (ok, local_only, flagged, unknown)
            include_archived: If False (default), exclude archived assets
            limit: Max results
            offset: Pagination offset
            created_from: Filter by created_at >= value
            created_to: Filter by created_at <= value
            min_width: Minimum width filter
            max_width: Maximum width filter
            min_height: Minimum height filter
            max_height: Maximum height filter
            content_domain: Filter by content domain
            content_category: Filter by content category
            content_rating: Filter by content rating
            searchable: Filter by searchable flag (default True)
            source_generation_id: Filter by source generation ID
            operation_type: Filter by lineage operation type
            has_parent: Filter assets with/without lineage parent
            has_children: Filter assets with/without lineage children
            sort_by: Sort field (created_at, file_size_bytes)
            sort_dir: Sort direction (asc, desc)

        Returns:
            List of assets
        """
        # Base query
        from sqlalchemy import and_, or_, case, literal, exists
        from pixsim7.backend.main.domain.assets.tag import AssetTag, Tag
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage

        query = select(Asset)
        tag_joined = False

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Asset.user_id == user.id)

        # Exclude archived by default
        if not include_archived:
            query = query.where(Asset.is_archived == False)

        # Searchable filter (default True to hide non-searchable assets)
        if searchable is not None:
            query = query.where(Asset.searchable == searchable)

        # Apply filters
        if media_type:
            query = query.where(Asset.media_type == media_type)
        if sync_status:
            query = query.where(Asset.sync_status == sync_status)
        if provider_id:
            query = query.where(Asset.provider_id == provider_id)
        if provider_status:
            provider_status_expr = case(
                (Asset.remote_url.ilike("http%"), literal("ok")),
                (
                    and_(
                        Asset.provider_asset_id.isnot(None),
                        ~Asset.provider_asset_id.ilike("local_%"),
                    ),
                    literal("ok"),
                ),
                (
                    and_(
                        Asset.provider_asset_id.isnot(None),
                        Asset.provider_asset_id.ilike("local_%"),
                    ),
                    literal("local_only"),
                ),
                else_=literal("unknown"),
            )
            if provider_status == "flagged":
                query = query.where(literal(False))
            else:
                query = query.where(provider_status_expr == provider_status)

        # Date range filters
        if created_from is not None:
            query = query.where(Asset.created_at >= created_from)
        if created_to is not None:
            query = query.where(Asset.created_at <= created_to)

        # Dimension filters - use `is not None` so 0 works as valid filter value
        if min_width is not None:
            query = query.where(Asset.width >= min_width)
        if max_width is not None:
            query = query.where(Asset.width <= max_width)
        if min_height is not None:
            query = query.where(Asset.height >= min_height)
        if max_height is not None:
            query = query.where(Asset.height <= max_height)

        # Content filters
        if content_domain is not None:
            query = query.where(Asset.content_domain == content_domain)
        if content_category is not None:
            query = query.where(Asset.content_category == content_category)
        if content_rating is not None:
            query = query.where(Asset.content_rating == content_rating)

        # Source generation filter
        if source_generation_id is not None:
            query = query.where(Asset.source_generation_id == source_generation_id)

        # Lineage filters - use EXISTS subqueries to avoid row duplication
        if operation_type is not None:
            query = query.where(
                exists(
                    select(AssetLineage.id).where(
                        AssetLineage.child_asset_id == Asset.id,
                        AssetLineage.operation_type == operation_type
                    )
                )
            )

        if has_parent is True:
            query = query.where(
                exists(select(AssetLineage.id).where(AssetLineage.child_asset_id == Asset.id))
            )
        elif has_parent is False:
            query = query.where(
                ~exists(select(AssetLineage.id).where(AssetLineage.child_asset_id == Asset.id))
            )

        if has_children is True:
            query = query.where(
                exists(select(AssetLineage.id).where(AssetLineage.parent_asset_id == Asset.id))
            )
        elif has_children is False:
            query = query.where(
                ~exists(select(AssetLineage.id).where(AssetLineage.parent_asset_id == Asset.id))
            )

        # Tag filter
        if tag:
            query = (
                query.join(AssetTag, AssetTag.asset_id == Asset.id)
                .join(Tag, Tag.id == AssetTag.tag_id)
                .where(
                    or_(
                        Tag.slug == tag,
                        Tag.display_name.ilike(f"%{tag}%"),
                        Tag.name.ilike(f"%{tag}%"),
                    )
                )
            )
            tag_joined = True
        if q:
            # Search across multiple text fields (including tags and prompt)
            like = f"%{q}%"
            if not tag_joined:
                query = (
                    query.outerjoin(AssetTag, AssetTag.asset_id == Asset.id)
                    .outerjoin(Tag, Tag.id == AssetTag.tag_id)
                )
                tag_joined = True

            # Join to Generation for prompt search (via source_generation_id)
            from pixsim7.backend.main.domain.generation.models import Generation
            query = query.outerjoin(
                Generation,
                Asset.source_generation_id == Generation.id
            )

            # Build search conditions
            search_conditions = [
                Asset.description.ilike(like),
                Asset.local_path.ilike(like),
                Asset.original_source_url.ilike(like),
                Tag.slug.ilike(like),
                Tag.display_name.ilike(like),
                Tag.name.ilike(like),
            ]

            # Add prompt search via JSON extraction (prompt_analysis->>'prompt')
            # This extracts the 'prompt' key from the JSON as text for ILIKE search
            search_conditions.append(
                Asset.prompt_analysis['prompt'].astext.ilike(like)
            )

            # Also search Generation.final_prompt for assets with source_generation_id
            search_conditions.append(
                Generation.final_prompt.ilike(like)
            )

            query = query.where(or_(*search_conditions))

        if tag_joined:
            query = query.distinct()

        # Sorting - validate sort_by before using
        if sort_by and sort_by in ('created_at', 'file_size_bytes'):
            sort_col = getattr(Asset, sort_by)
            if sort_dir == "asc":
                query = query.order_by(sort_col.asc(), Asset.id.asc())
            else:
                query = query.order_by(sort_col.desc(), Asset.id.desc())
        else:
            # Default: created_at DESC
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

    async def delete_asset(self, asset_id: int, user: User, delete_from_provider: bool = True) -> None:
        """
        Delete an asset owned by the user (or any asset if admin).

        Removes the database record and best-effort deletes the local file.
        Also deletes any generations that reference this asset.

        Args:
            asset_id: Asset ID to delete
            user: User requesting deletion
            delete_from_provider: If True, also attempt to delete from provider
        """
        from pixsim7.backend.main.domain.generation.models import Generation
        from sqlalchemy import delete as sql_delete

        asset = await self.get_asset_for_user(asset_id, user)

        # Delete related generations that reference this asset
        await self.db.execute(
            sql_delete(Generation).where(Generation.asset_id == asset_id)
        )

        # Attempt provider deletion if requested
        if delete_from_provider and asset.provider_asset_id and asset.provider_id:
            await self._delete_from_provider(asset)

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

    async def _delete_from_provider(self, asset: Asset) -> None:
        """
        Attempt to delete asset from provider (best effort).

        Logs errors but does not raise - local deletion should always proceed.
        """
        from pixsim7.backend.main.domain.providers.models import ProviderAccount

        try:
            # Get provider from registry
            from pixsim7.backend.main.services.provider.provider_service import registry
            provider = registry.get(asset.provider_id)

            # Check if provider supports deletion
            if not hasattr(provider, 'delete_asset'):
                logger.info(
                    "provider_delete_not_supported",
                    provider_id=asset.provider_id,
                    asset_id=asset.id,
                )
                return

            # Get provider account
            if not asset.provider_account_id:
                logger.warning(
                    "provider_delete_no_account",
                    provider_id=asset.provider_id,
                    asset_id=asset.id,
                )
                return

            account = await self.db.get(ProviderAccount, asset.provider_account_id)
            if not account:
                logger.warning(
                    "provider_delete_account_not_found",
                    asset_id=asset.id,
                    provider_account_id=asset.provider_account_id,
                )
                return

            # Call provider delete
            await provider.delete_asset(
                account=account,
                provider_asset_id=asset.provider_asset_id,
                media_type=asset.media_type,
            )

            logger.info(
                "provider_delete_success",
                provider_id=asset.provider_id,
                asset_id=asset.id,
                provider_asset_id=asset.provider_asset_id,
            )

        except Exception as e:
            # Log error but don't fail - local deletion should proceed
            logger.error(
                "provider_delete_failed",
                provider_id=asset.provider_id,
                asset_id=asset.id,
                provider_asset_id=asset.provider_asset_id,
                error=str(e),
                error_type=e.__class__.__name__,
                exc_info=True,
            )
            # Note: Could emit event here for UI notification if needed

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
