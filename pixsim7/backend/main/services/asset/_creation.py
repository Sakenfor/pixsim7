"""
Asset Creation Mixin

Handles asset creation from provider submissions, auto-tagging,
prompt extraction, and generation lineage creation.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional
from datetime import datetime, timezone

from sqlalchemy import select

from pixsim7.backend.main.domain import (
    Asset,
    ProviderSubmission,
    MediaType,
    SyncStatus,
)
from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim7.backend.main.infrastructure.events.bus import event_bus, ASSET_CREATED
from pixsim7.backend.main.services.prompt.parser import analyze_prompt
from pixsim_logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from pixsim7.backend.main.services.user.user_service import UserService

logger = get_logger()


class AssetCreationMixin:
    """Mixin providing asset creation, auto-tagging, and lineage methods."""

    db: AsyncSession
    users: UserService

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

        # Serialize create-from-submission for this generation and keep this path idempotent.
        # This avoids duplicate Asset rows when pollers race on the same completion.
        generation_id = getattr(generation, "id", None)
        if generation_id is not None:
            from pixsim7.backend.main.domain.generation.models import Generation as GenerationModel

            locked_generation_result = await self.db.execute(
                select(GenerationModel)
                .where(GenerationModel.id == generation_id)
                .with_for_update()
            )
            locked_generation = locked_generation_result.scalar_one_or_none()
            if locked_generation is not None:
                generation = locked_generation

            existing_asset = await self._existing_asset_for_generation(generation)
            if existing_asset is not None:
                return existing_asset

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

        # Create asset — each generation always gets its own Asset record.
        # Content dedup is handled at the storage layer (content-addressed keys)
        # and tracked via ContentBlob.
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

    async def _existing_asset_for_generation(self, generation) -> Optional[Asset]:
        """Return an existing output asset for a generation, if present."""
        generation_id = getattr(generation, "id", None)
        if generation_id is None:
            return None

        existing_asset_id = getattr(generation, "asset_id", None)
        if existing_asset_id:
            existing_asset = await self.db.get(Asset, existing_asset_id)
            if existing_asset is not None:
                return existing_asset

        result = await self.db.execute(
            select(Asset)
            .where(Asset.source_generation_id == generation_id)
            .order_by(Asset.id.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

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
