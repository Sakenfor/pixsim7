"""
Asset Core Service

Core CRUD operations for assets: creation, retrieval, search, listing, and deletion.
"""
import os
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

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
from pixsim7.backend.main.services.asset.filter_registry import asset_filter_registry
from pixsim_logging import get_logger

logger = get_logger()


@dataclass
class AssetGroupResult:
    key: str
    count: int
    latest_created_at: datetime
    preview_assets: List[Asset]


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
        model = submission.model  # convenience property on ProviderSubmission

        # Get prompt analysis - prefer existing analysis from PromptVersion to avoid re-analyzing
        prompt_analysis_result = None
        prompt_text = self._extract_prompt_from_generation(generation, submission)

        # First, try to reuse existing analysis from PromptVersion
        if hasattr(generation, 'prompt_version_id') and generation.prompt_version_id:
            try:
                from pixsim7.backend.main.domain.prompt import PromptVersion
                result = await self.db.execute(
                    select(PromptVersion).where(PromptVersion.id == generation.prompt_version_id)
                )
                prompt_version = result.scalar_one_or_none()
                if prompt_version and prompt_version.prompt_analysis:
                    prompt_analysis_result = prompt_version.prompt_analysis
                    logger.debug(f"Reusing existing prompt_analysis from PromptVersion {generation.prompt_version_id}")
            except Exception as e:
                logger.debug(f"Could not load PromptVersion {generation.prompt_version_id}: {e}")

        # Fallback: analyze if we have text but no existing analysis
        if prompt_analysis_result is None and prompt_text:
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
                # Auto-tag when linking to generation
                await self._auto_tag_generated_asset(
                    existing.id,
                    generation.user_id,
                    provider_id=submission.provider_id,
                    operation_type=generation.operation_type.value if generation.operation_type else None,
                    prompt_analysis=prompt_analysis_result,
                )
            if metadata and not existing.media_metadata:
                existing.media_metadata = metadata
                updated = True
            if prompt_analysis_result and not existing.prompt_analysis:
                existing.prompt_analysis = prompt_analysis_result
                updated = True
            if model and not existing.model:
                existing.model = model
                updated = True
            if updated:
                existing.last_accessed_at = datetime.now(timezone.utc)
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
            model=model,
            remote_url=asset_url,
            width=width,
            height=height,
            duration_sec=duration_sec,  # None for images
            sync_status=SyncStatus.REMOTE,
            source_generation_id=generation.id,
            provider_uploads={submission.provider_id: provider_asset_id},
            media_metadata=metadata or None,
            prompt_analysis=prompt_analysis_result,
            created_at=datetime.now(timezone.utc),
        )

        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)

        # Auto-tag generated assets based on user preferences
        await self._auto_tag_generated_asset(
            asset.id,
            generation.user_id,
            provider_id=submission.provider_id,
            operation_type=generation.operation_type.value if generation.operation_type else None,
            prompt_analysis=prompt_analysis_result,
        )

        # Emit event (triggers ingestion via event handler)
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

    # Default auto_tags settings
    DEFAULT_AUTO_TAGS = {
        # Static tags per source type (empty list = disabled)
        "generated": ["source:generated"],
        "synced": ["source:synced"],
        "extension": ["source:extension"],
        "capture": ["source:capture"],
        "uploaded": [],
        "local_folder": [],
        # Dynamic tag flags
        "include_provider": True,    # adds "provider:{provider_id}"
        "include_operation": True,   # adds "operation:{operation_type}"
        "include_site": True,        # adds "site:{source_site}" for extension imports
    }

    # Default analyzer settings
    DEFAULT_ANALYZER_SETTINGS = {
        "default_id": "prompt:simple",  # Default analyzer for prompts
        "auto_apply_tags": True,        # Apply analysis tags to generated assets
        "tag_prefix": "",               # Optional prefix for analysis tags (e.g., "prompt:")
    }

    async def _auto_tag_asset(
        self,
        asset_id: int,
        user_id: int,
        source_type: str,
        *,
        provider_id: str | None = None,
        operation_type: str | None = None,
        source_site: str | None = None,
    ) -> None:
        """
        Auto-tag an asset based on user preferences and source context.

        Checks user.preferences["auto_tags"] for configuration:
        - Static tags per source type (generated, synced, extension, capture, uploaded, local_folder)
        - Dynamic tag flags (include_provider, include_operation, include_site)

        Args:
            asset_id: The asset to tag
            user_id: The user who owns the asset (for preferences lookup)
            source_type: One of "generated", "synced", "extension", "capture", "uploaded", "local_folder"
            provider_id: Optional provider ID for dynamic "provider:{id}" tag
            operation_type: Optional operation type for dynamic "operation:{type}" tag
            source_site: Optional source site for dynamic "site:{site}" tag
        """
        try:
            from pixsim7.backend.main.domain.user import User
            user = await self.db.get(User, user_id)
            if not user:
                logger.warning(f"User {user_id} not found for auto-tagging asset {asset_id}")
                return

            preferences = user.preferences or {}
            auto_tags_config = preferences.get("auto_tags", self.DEFAULT_AUTO_TAGS)

            # Backwards compatibility: check old "generated_asset_tags" key
            if "auto_tags" not in preferences and "generated_asset_tags" in preferences:
                if source_type == "generated":
                    tags_to_apply = preferences.get("generated_asset_tags", [])
                    if tags_to_apply:
                        from pixsim7.backend.main.services.tag_service import TagService
                        tag_service = TagService(self.db)
                        await tag_service.assign_tags_to_asset(asset_id, tags_to_apply, auto_create=True)
                    return

            # Get static tags for this source type
            static_tags = auto_tags_config.get(source_type, self.DEFAULT_AUTO_TAGS.get(source_type, []))
            tags_to_apply = list(static_tags) if static_tags else []

            # Add dynamic tags based on flags
            if provider_id and auto_tags_config.get("include_provider", True):
                tags_to_apply.append(f"provider:{provider_id}")

            if operation_type and auto_tags_config.get("include_operation", True):
                # Normalize operation type for tag (e.g., "image_to_video" -> "image-to-video")
                normalized_op = operation_type.lower().replace("_", "-")
                tags_to_apply.append(f"operation:{normalized_op}")

            if source_site and auto_tags_config.get("include_site", True):
                # Normalize site (remove www., lowercase)
                normalized_site = source_site.lower().replace("www.", "")
                tags_to_apply.append(f"site:{normalized_site}")

            # Skip if no tags to apply
            if not tags_to_apply:
                return

            from pixsim7.backend.main.services.tag_service import TagService
            tag_service = TagService(self.db)
            await tag_service.assign_tags_to_asset(asset_id, tags_to_apply, auto_create=True)

        except Exception as e:
            logger.warning(f"Failed to auto-tag asset {asset_id} (source={source_type}): {e}")

    async def _auto_tag_generated_asset(
        self,
        asset_id: int,
        user_id: int,
        *,
        provider_id: str | None = None,
        operation_type: str | None = None,
        prompt_analysis: dict | None = None,
    ) -> None:
        """
        Auto-tag a generated asset.

        Applies both source-based tags (via _auto_tag_asset) and analyzer-derived tags
        from prompt_analysis based on user preferences.

        Args:
            asset_id: The asset to tag
            user_id: The user who owns the asset
            provider_id: Optional provider ID for dynamic tag
            operation_type: Optional operation type for dynamic tag
            prompt_analysis: Optional prompt analysis result containing extracted tags
        """
        # Apply source-based tags
        await self._auto_tag_asset(
            asset_id,
            user_id,
            "generated",
            provider_id=provider_id,
            operation_type=operation_type,
        )

        # Apply analyzer-derived tags if enabled
        if prompt_analysis:
            await self._apply_analyzer_tags(asset_id, user_id, prompt_analysis)

    async def _apply_analyzer_tags(
        self,
        asset_id: int,
        user_id: int,
        prompt_analysis: dict,
    ) -> None:
        """
        Apply tags extracted by the prompt analyzer to an asset.

        Checks user.preferences["analyzer"] for configuration:
        - auto_apply_tags: Whether to apply analysis tags (default: True)
        - tag_prefix: Optional prefix for tags (default: "")

        Args:
            asset_id: The asset to tag
            user_id: The user who owns the asset
            prompt_analysis: Analysis result with "tags_flat" or "tags" field
        """
        try:
            # Get analysis tags - prefer tags_flat (flat strings), fallback to extracting from structured tags
            analysis_tags = prompt_analysis.get("tags_flat", [])
            if not analysis_tags:
                # Fallback: try to extract from structured tags
                raw_tags = prompt_analysis.get("tags", [])
                if raw_tags and isinstance(raw_tags[0], dict):
                    analysis_tags = [t.get("tag") for t in raw_tags if t.get("tag")]
                else:
                    analysis_tags = raw_tags
            if not analysis_tags:
                return

            from pixsim7.backend.main.domain.user import User
            user = await self.db.get(User, user_id)
            if not user:
                return

            preferences = user.preferences or {}
            analyzer_config = preferences.get("analyzer", self.DEFAULT_ANALYZER_SETTINGS)

            # Check if auto-apply is enabled
            if not analyzer_config.get("auto_apply_tags", True):
                return

            # Apply optional prefix
            prefix = analyzer_config.get("tag_prefix", "")
            if prefix:
                tags_to_apply = [f"{prefix}{tag}" for tag in analysis_tags]
            else:
                tags_to_apply = list(analysis_tags)

            from pixsim7.backend.main.services.tag_service import TagService
            tag_service = TagService(self.db)
            await tag_service.assign_tags_to_asset(asset_id, tags_to_apply, auto_create=True)

            logger.debug(f"Applied {len(tags_to_apply)} analyzer tags to asset {asset_id}")

        except Exception as e:
            logger.warning(f"Failed to apply analyzer tags to asset {asset_id}: {e}")

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
        asset.last_accessed_at = datetime.now(timezone.utc)
        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)
        return asset

    def _resolve_group_key_expr(self, group_by: str):
        from sqlalchemy import func, cast, String, literal
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage

        lineage_primary = None
        join_generation = False
        join_lineage = False

        if group_by == "source":
            lineage_ranked = (
                select(
                    AssetLineage.child_asset_id.label("child_asset_id"),
                    AssetLineage.parent_asset_id.label("parent_asset_id"),
                    func.row_number()
                    .over(
                        partition_by=AssetLineage.child_asset_id,
                        order_by=[AssetLineage.sequence_order.asc(), AssetLineage.id.asc()],
                    )
                    .label("rn"),
                )
                .subquery()
            )
            lineage_primary = (
                select(
                    lineage_ranked.c.child_asset_id,
                    lineage_ranked.c.parent_asset_id,
                )
                .where(lineage_ranked.c.rn == 1)
                .subquery()
            )
            join_lineage = True
            raw_key = func.coalesce(
                cast(lineage_primary.c.parent_asset_id, String),
                func.nullif(cast(Asset.upload_context["source_asset_id"].astext, String), ""),
            )
        elif group_by == "generation":
            raw_key = cast(Asset.source_generation_id, String)
        elif group_by == "prompt":
            from pixsim7.backend.main.domain.generation.models import Generation
            join_generation = True
            raw_key = cast(Generation.prompt_version_id, String)
        else:
            return None, False, False, None

        group_key_expr = func.coalesce(func.nullif(raw_key, ""), literal("ungrouped"))
        return group_key_expr, join_generation, join_lineage, lineage_primary

    def _build_group_filter_expr(self, group_filter: Optional[Dict[str, Any]]):
        from sqlalchemy import and_

        if not group_filter:
            return None
        conditions = asset_filter_registry.build_filter_conditions(group_filter)
        if not conditions:
            return None
        return and_(*conditions)

    def _build_asset_search_query(
        self,
        *,
        user: User,
        filters: Optional[Dict[str, Any]] = None,
        group_filter: Optional[Dict[str, Any]] = None,
        group_filter_invert: bool = False,
        group_path: Optional[list[dict[str, Any]]] = None,
        sync_status: Optional[SyncStatus] = None,
        provider_status: Optional[str] = None,
        tag: Optional[str | list[str]] = None,
        q: Optional[str] = None,
        include_archived: bool = False,
        searchable: Optional[bool] = True,
        created_from: Optional[datetime] = None,
        created_to: Optional[datetime] = None,
        min_width: Optional[int] = None,
        max_width: Optional[int] = None,
        min_height: Optional[int] = None,
        max_height: Optional[int] = None,
        content_domain: Optional[Any] = None,
        content_category: Optional[str] = None,
        content_rating: Optional[str] = None,
        source_generation_id: Optional[int] = None,
        source_asset_id: Optional[int] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type: Optional[Any] = None,
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        group_by: Optional[str] = None,
        group_key: Optional[str] = None,
    ):
        from sqlalchemy import and_, or_, case, literal, exists, cast, distinct
        from sqlalchemy.dialects.postgresql import JSONB
        from pixsim7.backend.main.domain.assets.tag import AssetTag, Tag
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage

        query = select(Asset)
        tag_joined = False
        generation_joined = False
        Generation = None
        lineage_joined = False

        def _ensure_generation_join() -> None:
            nonlocal query, generation_joined, Generation
            if generation_joined:
                return
            from pixsim7.backend.main.domain.generation.models import Generation as GenerationModel
            Generation = GenerationModel
            query = query.outerjoin(GenerationModel, Asset.source_generation_id == GenerationModel.id)
            generation_joined = True

        def _ensure_lineage_join(next_lineage_primary) -> None:
            nonlocal query, lineage_joined
            if lineage_joined or next_lineage_primary is None:
                return
            query = query.outerjoin(
                next_lineage_primary, next_lineage_primary.c.child_asset_id == Asset.id
            )
            lineage_joined = True

        def _normalize_group_path(raw_path: Optional[list[dict[str, Any]]]):
            entries: list[tuple[str, str]] = []
            seen: set[str] = set()
            for entry in raw_path or []:
                if isinstance(entry, dict):
                    raw_by = entry.get("group_by")
                    raw_key = entry.get("group_key")
                else:
                    raw_by = getattr(entry, "group_by", None)
                    raw_key = getattr(entry, "group_key", None)
                if raw_by is None or raw_key is None:
                    continue
                by_value = raw_by.value if hasattr(raw_by, "value") else str(raw_by)
                key_value = str(raw_key)
                if not by_value:
                    continue
                if by_value in seen:
                    continue
                seen.add(by_value)
                entries.append((by_value, key_value))
            return entries

        normalized_group_path = _normalize_group_path(group_path)
        effective_group_filter_invert = group_filter_invert
        if normalized_group_path:
            if any(key.lower() == "other" for _, key in normalized_group_path):
                effective_group_filter_invert = True
        elif isinstance(group_key, str) and group_key.lower() == "other":
            effective_group_filter_invert = True

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Asset.user_id == user.id)

        # Exclude archived by default
        if not include_archived:
            query = query.where(Asset.is_archived == False)

        # Searchable filter (default True to hide non-searchable assets)
        if searchable is not None:
            query = query.where(Asset.searchable == searchable)

        # Apply registry-driven filters
        if filters:
            for condition in asset_filter_registry.build_filter_conditions(filters):
                query = query.where(condition)

        group_filter_expr = self._build_group_filter_expr(group_filter)
        path_has_other = False
        if group_path:
            for entry in group_path:
                if isinstance(entry, dict):
                    raw_key = entry.get("group_key")
                else:
                    raw_key = getattr(entry, "group_key", None)
                if raw_key is None:
                    continue
                if str(raw_key).lower() == "other":
                    path_has_other = True
                    break
        effective_group_filter_expr = None
        if group_filter_expr is not None:
            effective_group_filter_expr = ~group_filter_expr if path_has_other else group_filter_expr
        if group_filter_expr is not None:
            query = query.where(
                ~group_filter_expr if effective_group_filter_invert else group_filter_expr
            )
        if sync_status:
            query = query.where(Asset.sync_status == sync_status)
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

        # Source asset filter (lineage + upload_context)
        if source_asset_id is not None:
            source_asset_str = str(source_asset_id)
            query = query.where(
                or_(
                    exists(
                        select(AssetLineage.id).where(
                            AssetLineage.child_asset_id == Asset.id,
                            AssetLineage.parent_asset_id == source_asset_id,
                        )
                    ),
                    Asset.upload_context["source_asset_id"].astext == source_asset_str,
                )
            )

        # Prompt version filter (via generation)
        if prompt_version_id is not None:
            _ensure_generation_join()
            query = query.where(Generation.prompt_version_id == prompt_version_id)

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

        def _normalize_list(value: Any) -> list[str]:
            if value is None:
                return []
            if isinstance(value, (list, tuple, set)):
                return [str(v).strip() for v in value if str(v).strip()]
            if isinstance(value, str):
                if "," in value:
                    return [v.strip() for v in value.split(",") if v.strip()]
                return [value.strip()] if value.strip() else []
            return [str(value)]

        tag_values = _normalize_list(tag)
        tag_mode = None
        if filters:
            tag_mode = filters.get("tag__mode") or filters.get("tag_mode")

        # Tag filter (supports multi + all/any)
        if tag_values:
            if tag_mode == "all" and len(tag_values) > 1:
                tag_subquery = (
                    select(AssetTag.asset_id)
                    .join(Tag, Tag.id == AssetTag.tag_id)
                    .where(Tag.slug.in_(tag_values))
                    .group_by(AssetTag.asset_id)
                    .having(func.count(distinct(Tag.slug)) == len(tag_values))
                    .subquery()
                )
                query = query.where(Asset.id.in_(select(tag_subquery.c.asset_id)))
            else:
                query = (
                    query.join(AssetTag, AssetTag.asset_id == Asset.id)
                    .join(Tag, Tag.id == AssetTag.tag_id)
                    .where(Tag.slug.in_(tag_values))
                )
                tag_joined = True

        # Prompt analysis tags filter (supports multi + all/any)
        analysis_tags = _normalize_list(filters.get("analysis_tags") if filters else None)
        analysis_mode = None
        if filters:
            analysis_mode = filters.get("analysis_tags__mode") or filters.get("analysis_tags_mode")
        if analysis_tags:
            query = query.where(Asset.prompt_analysis.isnot(None))
            prompt_jsonb = cast(Asset.prompt_analysis, JSONB)
            query = query.where(prompt_jsonb.has_key("tags_flat"))
            prompt_tags = prompt_jsonb["tags_flat"]
            if analysis_mode == "all" and len(analysis_tags) > 1:
                query = query.where(prompt_tags.contains(analysis_tags))
            else:
                query = query.where(or_(*[prompt_tags.contains([tag]) for tag in analysis_tags]))

        # Group filter (group_by + group_key or group_path)
        def _apply_group_filter_entry(entry_by: str, entry_key: str) -> None:
            nonlocal query
            group_key_expr, join_generation, join_lineage, lineage_primary = self._resolve_group_key_expr(entry_by)
            if group_key_expr is None:
                return
            if join_generation:
                _ensure_generation_join()
            if join_lineage and lineage_primary is not None:
                _ensure_lineage_join(lineage_primary)
            query = query.where(group_key_expr == str(entry_key))

        if normalized_group_path:
            for entry_by, entry_key in normalized_group_path:
                if entry_key.lower() == "other":
                    continue
                _apply_group_filter_entry(entry_by, entry_key)
        elif group_by and group_key is not None:
            if not (isinstance(group_key, str) and group_key.lower() == "other"):
                _apply_group_filter_entry(group_by, str(group_key))
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
            _ensure_generation_join()

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
            # Use json_extract_path_text to get text value from JSON column
            search_conditions.append(
                func.json_extract_path_text(Asset.prompt_analysis, 'prompt').ilike(like)
            )

            # Also search Generation.final_prompt for assets with source_generation_id
            if Generation is not None:
                search_conditions.append(
                    Generation.final_prompt.ilike(like)
                )

            query = query.where(or_(*search_conditions))

        return query, tag_joined

    def _build_filtered_asset_id_subquery(
        self,
        *,
        user: User,
        filters: Optional[Dict[str, Any]] = None,
        sync_status: Optional[SyncStatus] = None,
        provider_status: Optional[str] = None,
        tag: Optional[str | list[str]] = None,
        q: Optional[str] = None,
        include_archived: bool = False,
        searchable: Optional[bool] = True,
        created_from: Optional[datetime] = None,
        created_to: Optional[datetime] = None,
        min_width: Optional[int] = None,
        max_width: Optional[int] = None,
        min_height: Optional[int] = None,
        max_height: Optional[int] = None,
        content_domain: Optional[Any] = None,
        content_category: Optional[str] = None,
        content_rating: Optional[str] = None,
        source_generation_id: Optional[int] = None,
        source_asset_id: Optional[int] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type: Optional[Any] = None,
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        group_by: Optional[str] = None,
        group_key: Optional[str] = None,
        group_path: Optional[list[dict[str, Any]]] = None,
    ):
        query, tag_joined = self._build_asset_search_query(
            user=user,
            filters=filters,
            sync_status=sync_status,
            provider_status=provider_status,
            tag=tag,
            q=q,
            include_archived=include_archived,
            searchable=searchable,
            created_from=created_from,
            created_to=created_to,
            min_width=min_width,
            max_width=max_width,
            min_height=min_height,
            max_height=max_height,
            content_domain=content_domain,
            content_category=content_category,
            content_rating=content_rating,
            source_generation_id=source_generation_id,
            source_asset_id=source_asset_id,
            prompt_version_id=prompt_version_id,
            operation_type=operation_type,
            has_parent=has_parent,
            has_children=has_children,
            group_by=group_by,
            group_key=group_key,
            group_path=group_path,
        )

        if tag_joined:
            return query.with_only_columns(Asset.id).distinct().subquery()
        return query.with_only_columns(Asset.id).subquery()

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
        provider_status: Optional[str] = None,
        *,
        filters: dict[str, Any] | None = None,
        group_filter: dict[str, Any] | None = None,
        group_path: Optional[list[dict[str, Any]]] = None,
        sync_status: Optional[SyncStatus] = None,
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
        source_asset_id: Optional[int] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type = None,  # OperationType enum
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        group_by: Optional[str] = None,
        group_key: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_dir: Optional[str] = "desc",
    ) -> list[Asset]:
        """
        List assets for user with advanced search and filtering.

        Args:
            user: User (or admin)
            filters: Registry-defined filters (media_type, provider_id, upload_method, nested JSONB, etc.)
            group_filter: Registry filters that scope grouping eligibility
            sync_status: Filter by sync status
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
            source_asset_id: Filter by lineage source asset ID
            prompt_version_id: Filter by prompt version ID
            operation_type: Filter by lineage operation type
            has_parent: Filter assets with/without lineage parent
            has_children: Filter assets with/without lineage children
            group_by: Group key to filter assets by (source, generation, prompt)
            group_key: Group value to filter assets by (use 'ungrouped' or 'other')
            group_path: Nested grouping path (ordered list of group_by + group_key)
            sort_by: Sort field (created_at, file_size_bytes)
            sort_dir: Sort direction (asc, desc)

        Returns:
            List of assets
        """
        query, tag_joined = self._build_asset_search_query(
            user=user,
            filters=filters,
            group_filter=group_filter,
            group_filter_invert=False,
            sync_status=sync_status,
            provider_status=provider_status,
            tag=tag,
            q=q,
            include_archived=include_archived,
            searchable=searchable,
            created_from=created_from,
            created_to=created_to,
            min_width=min_width,
            max_width=max_width,
            min_height=min_height,
            max_height=max_height,
            content_domain=content_domain,
            content_category=content_category,
            content_rating=content_rating,
            source_generation_id=source_generation_id,
            source_asset_id=source_asset_id,
            prompt_version_id=prompt_version_id,
            operation_type=operation_type,
            has_parent=has_parent,
            has_children=has_children,
            group_by=group_by,
            group_key=group_key,
            group_path=group_path,
        )

        # Handle deduplication when joins cause row multiplication
        # Can't use DISTINCT on JSON columns, so use subquery for distinct IDs
        if tag_joined:
            # Get distinct asset IDs from filtered query
            id_subquery = (
                query.with_only_columns(Asset.id)
                .distinct()
                .subquery()
            )
            # Build fresh query selecting full Assets by those IDs
            query = select(Asset).where(Asset.id.in_(select(id_subquery.c.id)))

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

    async def list_asset_groups(
        self,
        *,
        user: User,
        group_by: str,
        filters: dict[str, Any] | None = None,
        group_filter: dict[str, Any] | None = None,
        group_path: Optional[list[dict[str, Any]]] = None,
        sync_status: Optional[SyncStatus] = None,
        provider_status: Optional[str] = None,
        tag: Optional[str | list[str]] = None,
        q: Optional[str] = None,
        include_archived: bool = False,
        searchable: Optional[bool] = True,
        created_from: Optional[datetime] = None,
        created_to: Optional[datetime] = None,
        min_width: Optional[int] = None,
        max_width: Optional[int] = None,
        min_height: Optional[int] = None,
        max_height: Optional[int] = None,
        content_domain: Optional[Any] = None,
        content_category: Optional[str] = None,
        content_rating: Optional[str] = None,
        source_generation_id: Optional[int] = None,
        source_asset_id: Optional[int] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type: Optional[Any] = None,
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
        preview_limit: int = 4,
    ) -> tuple[list[AssetGroupResult], int]:
        """
        Group assets for a user using the same filters as list_assets.

        Returns:
            (groups, total_groups)
        """
        from sqlalchemy import select, func, literal

        asset_ids = self._build_filtered_asset_id_subquery(
            user=user,
            filters=filters,
            sync_status=sync_status,
            provider_status=provider_status,
            tag=tag,
            q=q,
            include_archived=include_archived,
            searchable=searchable,
            created_from=created_from,
            created_to=created_to,
            min_width=min_width,
            max_width=max_width,
            min_height=min_height,
            max_height=max_height,
            content_domain=content_domain,
            content_category=content_category,
            content_rating=content_rating,
            source_generation_id=source_generation_id,
            source_asset_id=source_asset_id,
            prompt_version_id=prompt_version_id,
            operation_type=operation_type,
            has_parent=has_parent,
            has_children=has_children,
            group_path=group_path,
        )

        group_key_expr, join_generation, join_lineage, lineage_primary = self._resolve_group_key_expr(group_by)

        if group_key_expr is None:
            return ([], 0)

        group_filter_expr = self._build_group_filter_expr(group_filter)
        path_has_other = False
        if group_path:
            for entry in group_path:
                if isinstance(entry, dict):
                    raw_key = entry.get("group_key")
                else:
                    raw_key = getattr(entry, "group_key", None)
                if raw_key is None:
                    continue
                if str(raw_key).lower() == "other":
                    path_has_other = True
                    break
        effective_group_filter_expr = None
        if group_filter_expr is not None:
            effective_group_filter_expr = (
                ~group_filter_expr if path_has_other else group_filter_expr
            )

        base_query = (
            select(
                group_key_expr.label("group_key"),
                func.count(Asset.id).label("count"),
                func.max(Asset.created_at).label("latest_created_at"),
            )
            .select_from(Asset)
            .join(asset_ids, asset_ids.c.id == Asset.id)
        )
        if effective_group_filter_expr is not None:
            base_query = base_query.where(effective_group_filter_expr)

        if join_generation:
            from pixsim7.backend.main.domain.generation.models import Generation
            base_query = base_query.outerjoin(
                Generation, Generation.id == Asset.source_generation_id
            )
        if join_lineage and lineage_primary is not None:
            base_query = base_query.outerjoin(
                lineage_primary, lineage_primary.c.child_asset_id == Asset.id
            )

        base_query = base_query.group_by(group_key_expr)

        include_other = False
        other_count = 0
        other_latest = None
        if group_filter_expr is not None and not path_has_other:
            other_stats = await self.db.execute(
                select(
                    func.count(Asset.id).label("count"),
                    func.max(Asset.created_at).label("latest_created_at"),
                )
                .select_from(Asset)
                .join(asset_ids, asset_ids.c.id == Asset.id)
                .where(~group_filter_expr)
            )
            other_row = other_stats.one()
            other_count = other_row.count or 0
            other_latest = other_row.latest_created_at
            include_other = other_count > 0 and other_latest is not None

        group_query = base_query
        if include_other:
            other_query = select(
                literal("other").label("group_key"),
                literal(other_count).label("count"),
                literal(other_latest).label("latest_created_at"),
            )
            group_query = base_query.union_all(other_query)

        group_subquery = group_query.subquery()
        total_result = await self.db.execute(
            select(func.count()).select_from(group_subquery)
        )
        total_groups = total_result.scalar_one() or 0

        group_rows = await self.db.execute(
            select(group_subquery)
            .order_by(group_subquery.c.latest_created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        groups_raw = group_rows.all()
        group_keys = [
            str(row.group_key)
            for row in groups_raw
            if str(row.group_key) != "other"
        ]

        preview_map: dict[str, list[Asset]] = {}
        if preview_limit > 0 and group_keys:
            ranked_query = (
                select(
                    Asset.id.label("asset_id"),
                    group_key_expr.label("group_key"),
                    func.row_number()
                    .over(
                        partition_by=group_key_expr,
                        order_by=[Asset.created_at.desc(), Asset.id.desc()],
                    )
                    .label("rn"),
                )
                .select_from(Asset)
                .join(asset_ids, asset_ids.c.id == Asset.id)
                .where(group_key_expr.in_(group_keys))
            )
            if effective_group_filter_expr is not None:
                ranked_query = ranked_query.where(effective_group_filter_expr)
            if join_generation:
                from pixsim7.backend.main.domain.generation.models import Generation
                ranked_query = ranked_query.outerjoin(
                    Generation, Generation.id == Asset.source_generation_id
                )
            if join_lineage and lineage_primary is not None:
                ranked_query = ranked_query.outerjoin(
                    lineage_primary, lineage_primary.c.child_asset_id == Asset.id
                )

            ranked_subquery = ranked_query.subquery()
            preview_query = (
                select(Asset, ranked_subquery.c.group_key)
                .join(ranked_subquery, ranked_subquery.c.asset_id == Asset.id)
                .where(ranked_subquery.c.rn <= preview_limit)
                .order_by(ranked_subquery.c.group_key.asc(), Asset.created_at.desc(), Asset.id.desc())
            )
            preview_rows = await self.db.execute(preview_query)
            for asset, group_key in preview_rows.all():
                preview_map.setdefault(str(group_key), []).append(asset)

        if preview_limit > 0 and include_other and any(str(row.group_key) == "other" for row in groups_raw):
            other_preview_query = (
                select(Asset)
                .join(asset_ids, asset_ids.c.id == Asset.id)
                .where(~group_filter_expr)
                .order_by(Asset.created_at.desc(), Asset.id.desc())
                .limit(preview_limit)
            )
            other_preview_rows = await self.db.execute(other_preview_query)
            preview_map["other"] = list(other_preview_rows.scalars().all())

        groups: list[AssetGroupResult] = []
        for row in groups_raw:
            key = str(row.group_key)
            groups.append(
                AssetGroupResult(
                    key=key,
                    count=row.count,
                    latest_created_at=row.latest_created_at,
                    preview_assets=preview_map.get(key, []),
                )
            )

        return groups, total_groups

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
        Also deletes any generations and lineage that reference this asset.

        Args:
            asset_id: Asset ID to delete
            user: User requesting deletion
            delete_from_provider: If True, also attempt to delete from provider
        """
        from pixsim7.backend.main.domain.generation.models import Generation
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage
        from sqlalchemy import delete as sql_delete, or_

        asset = await self.get_asset_for_user(asset_id, user)

        # Delete related lineage records (both as parent and child)
        await self.db.execute(
            sql_delete(AssetLineage).where(
                or_(
                    AssetLineage.parent_asset_id == asset_id,
                    AssetLineage.child_asset_id == asset_id
                )
            )
        )

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
                media_metadata=asset.media_metadata,
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

        Prefers structured composition_metadata when available (preserves
        influence_type/region from original request). Falls back to
        Generation.inputs for legacy generations.

        Args:
            asset: The newly created child asset
            generation: The generation that created this asset
        """
        from pixsim7.backend.main.services.asset.asset_factory import create_lineage_links_with_metadata
        from pixsim7.backend.main.services.asset.lineage import build_lineage_from_composition_metadata
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage

        # Get operation_type from generation
        operation_type = generation.operation_type

        # Prefer structured composition_metadata when available
        # This preserves influence_type/region from the original request
        canonical_params = getattr(generation, 'canonical_params', None) or {}
        composition_metadata = canonical_params.get("composition_metadata")

        if composition_metadata and isinstance(composition_metadata, list):
            try:
                lineage_rows = build_lineage_from_composition_metadata(
                    child_asset_id=asset.id,
                    composition_metadata=composition_metadata,
                    operation_type=operation_type,
                )

                if lineage_rows:
                    for row in lineage_rows:
                        self.db.add(row)
                    await self.db.flush()

                    logger.info(
                        f"Created {len(lineage_rows)} lineage edge(s) for asset {asset.id} "
                        f"from composition_metadata ({operation_type.value})"
                    )
                    return  # Success - don't fall back to inputs-based lineage

            except Exception as e:
                logger.warning(
                    f"Failed to create lineage from composition_metadata for asset {asset.id}: {e}, "
                    f"falling back to inputs-based lineage"
                )

        # Fallback: use Generation.inputs (legacy path)
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
