"""
Asset Search Mixin

Handles asset search query building, listing, grouping, and face/action search.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional, Any, List
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, func, and_, or_

from pixsim7.backend.main.domain import (
    Asset,
    User,
    MediaType,
    SyncStatus,
)
from pixsim7.backend.main.services.asset.filter_registry import asset_filter_registry
from pixsim_logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from pixsim7.backend.main.services.user.user_service import UserService

logger = get_logger()


@dataclass
class AssetGroupResult:
    key: str
    count: int
    latest_created_at: datetime
    preview_assets: List[Asset]


class AssetSearchMixin:
    """Mixin providing asset search, listing, and grouping methods."""

    db: AsyncSession
    users: UserService

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
        elif group_by == "sibling":
            from pixsim7.backend.main.domain.generation.models import Generation
            join_generation = True
            raw_key = Generation.reproducible_hash
        else:
            return None, False, False, None

        group_key_expr = func.coalesce(func.nullif(raw_key, ""), literal("ungrouped"))
        return group_key_expr, join_generation, join_lineage, lineage_primary

    def _build_group_filter_expr(self, group_filter: Optional[dict[str, Any]]):
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
        filters: Optional[dict[str, Any]] = None,
        group_filter: Optional[dict[str, Any]] = None,
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
        filters: Optional[dict[str, Any]] = None,
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

    def build_scoped_asset_ids_subquery(
        self,
        *,
        user: User,
        filters: Optional[dict[str, Any]] = None,
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
        group_path: Optional[list[dict[str, Any]]] = None,
    ):
        """
        Public wrapper for the canonical user-scoped asset-id subquery.

        Use this when follow-up queries (metadata, aggregations, joins to other
        tables) must be guaranteed to operate on the exact same visible asset set.
        """
        return self._build_filtered_asset_id_subquery(
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

    async def build_group_meta_payloads(
        self,
        *,
        user: User,
        group_by: str,
        group_keys: list[str],
        filters: Optional[dict[str, Any]] = None,
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
        group_path: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, dict[str, Any]]:
        """
        Build metadata payloads for grouped results using the canonical scoped asset set.

        Every metadata query is anchored to the same user/filter visibility scope
        as list/group queries to avoid accidental cross-user lookups.
        """
        if not group_keys:
            return {}

        from pixsim7.backend.main.domain import Asset

        meta_map: dict[str, dict[str, Any]] = {}
        scoped_asset_ids = self.build_scoped_asset_ids_subquery(
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

        if group_by == "source":
            from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse

            source_ids: list[int] = []
            for key in group_keys:
                try:
                    source_ids.append(int(key))
                except (TypeError, ValueError):
                    continue

            if source_ids:
                result = await self.db.execute(
                    select(Asset)
                    .join(scoped_asset_ids, scoped_asset_ids.c.id == Asset.id)
                    .where(Asset.id.in_(source_ids))
                )
                for asset in result.scalars().all():
                    asset_response = AssetResponse.model_validate(asset)
                    media_type = (
                        asset_response.media_type.value
                        if hasattr(asset_response.media_type, "value")
                        else str(asset_response.media_type)
                    )
                    meta_map[str(asset.id)] = {
                        "kind": "source",
                        "asset_id": asset.id,
                        "media_type": media_type,
                        "created_at": asset.created_at,
                        "description": asset.description,
                        "thumbnail_url": asset_response.thumbnail_url,
                        "preview_url": asset_response.preview_url,
                        "remote_url": asset_response.remote_url,
                        "width": asset_response.width,
                        "height": asset_response.height,
                    }

        elif group_by == "generation":
            from pixsim7.backend.main.domain.generation.models import Generation

            generation_ids: list[int] = []
            for key in group_keys:
                try:
                    generation_ids.append(int(key))
                except (TypeError, ValueError):
                    continue

            if generation_ids:
                scoped_generation_ids = (
                    select(Asset.source_generation_id.label("generation_id"))
                    .select_from(Asset)
                    .join(scoped_asset_ids, scoped_asset_ids.c.id == Asset.id)
                    .where(Asset.source_generation_id.isnot(None))
                    .distinct()
                    .subquery()
                )
                result = await self.db.execute(
                    select(Generation).where(
                        Generation.id.in_(generation_ids),
                        Generation.id.in_(select(scoped_generation_ids.c.generation_id)),
                    )
                )
                for generation in result.scalars().all():
                    operation_type_value = (
                        generation.operation_type.value
                        if hasattr(generation.operation_type, "value")
                        else str(generation.operation_type)
                    )
                    status_value = (
                        generation.status.value
                        if hasattr(generation.status, "value")
                        else str(generation.status)
                    )
                    meta_map[str(generation.id)] = {
                        "kind": "generation",
                        "generation_id": generation.id,
                        "provider_id": generation.provider_id,
                        "operation_type": operation_type_value,
                        "status": status_value,
                        "created_at": generation.created_at,
                        "final_prompt": generation.final_prompt,
                        "prompt_version_id": generation.prompt_version_id,
                    }

        elif group_by == "prompt":
            from pixsim7.backend.main.domain import PromptVersion, PromptFamily
            from pixsim7.backend.main.domain.generation.models import Generation

            prompt_ids: list[UUID] = []
            for key in group_keys:
                try:
                    prompt_ids.append(UUID(key))
                except (TypeError, ValueError):
                    continue

            if prompt_ids:
                scoped_prompt_ids = (
                    select(Generation.prompt_version_id.label("prompt_version_id"))
                    .select_from(Generation)
                    .join(Asset, Asset.source_generation_id == Generation.id)
                    .join(scoped_asset_ids, scoped_asset_ids.c.id == Asset.id)
                    .where(Generation.prompt_version_id.isnot(None))
                    .distinct()
                    .subquery()
                )
                result = await self.db.execute(
                    select(PromptVersion, PromptFamily)
                    .outerjoin(PromptFamily, PromptFamily.id == PromptVersion.family_id)
                    .where(
                        PromptVersion.id.in_(prompt_ids),
                        PromptVersion.id.in_(select(scoped_prompt_ids.c.prompt_version_id)),
                    )
                )
                for version, family in result.all():
                    meta_map[str(version.id)] = {
                        "kind": "prompt",
                        "prompt_version_id": version.id,
                        "prompt_text": version.prompt_text,
                        "commit_message": version.commit_message,
                        "author": version.author,
                        "version_number": version.version_number,
                        "family_id": version.family_id,
                        "family_title": family.title if family else None,
                        "family_slug": family.slug if family else None,
                        "created_at": version.created_at,
                        "tags": list(version.tags or []),
                    }

        elif group_by == "sibling":
            from pixsim7.backend.main.domain.generation.models import Generation

            hash_keys = [k for k in group_keys if k]
            if hash_keys:
                ranked = (
                    select(
                        Generation.reproducible_hash.label("hash"),
                        Generation.id.label("generation_id"),
                        func.row_number()
                        .over(
                            partition_by=Generation.reproducible_hash,
                            order_by=[
                                Asset.created_at.desc(),
                                Asset.id.desc(),
                                Generation.created_at.desc(),
                                Generation.id.desc(),
                            ],
                        )
                        .label("rn"),
                    )
                    .select_from(Asset)
                    .join(scoped_asset_ids, scoped_asset_ids.c.id == Asset.id)
                    .join(Generation, Generation.id == Asset.source_generation_id)
                    .where(Generation.reproducible_hash.in_(hash_keys))
                    .subquery()
                )
                result = await self.db.execute(
                    select(Generation)
                    .join(ranked, Generation.id == ranked.c.generation_id)
                    .where(ranked.c.rn == 1)
                )
                for generation in result.scalars().all():
                    operation_type_value = (
                        generation.operation_type.value
                        if hasattr(generation.operation_type, "value")
                        else str(generation.operation_type)
                    )
                    status_value = (
                        generation.status.value
                        if hasattr(generation.status, "value")
                        else str(generation.status)
                    )
                    prompt_snippet = None
                    if generation.final_prompt:
                        text = generation.final_prompt.strip()
                        prompt_snippet = text[:80] + ("..." if len(text) > 80 else "")
                    meta_map[generation.reproducible_hash] = {
                        "kind": "sibling",
                        "hash": generation.reproducible_hash,
                        "generation_id": generation.id,
                        "provider_id": generation.provider_id,
                        "operation_type": operation_type_value,
                        "status": status_value,
                        "created_at": generation.created_at,
                        "prompt_snippet": prompt_snippet,
                    }

        return meta_map

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
