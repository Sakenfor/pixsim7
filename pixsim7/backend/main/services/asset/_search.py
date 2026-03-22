"""
Asset Search Mixin

Handles asset search query building, listing, and face/action search.
Grouping logic is in _search_groups.py.
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
    """Mixin providing asset search, listing, and query-building methods."""

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
            raw_key = cast(Asset.prompt_version_id, String)
        elif group_by == "sibling":
            raw_key = Asset.reproducible_hash
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
        asset_kind: Optional[str] = "content",
        created_from: Optional[datetime] = None,
        created_to: Optional[datetime] = None,
        min_width: Optional[int] = None,
        max_width: Optional[int] = None,
        min_height: Optional[int] = None,
        max_height: Optional[int] = None,
        content_domain: Optional[Any] = None,
        content_category: Optional[str] = None,
        content_rating: Optional[str] = None,
        asset_ids: Optional[list[int]] = None,
        source_generation_id: Optional[int] = None,
        source_asset_id: Optional[int] = None,
        sha256: Optional[str] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type: Optional[Any] = None,
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        group_by: Optional[str] = None,
        group_key: Optional[str] = None,
        similar_to_embedding: Optional[list[float]] = None,
        similar_to_asset_id: Optional[int] = None,
        similarity_threshold: Optional[float] = None,
    ):
        from sqlalchemy import and_, or_, case, literal, exists, cast, distinct, String
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

        # Asset kind filter (default: gallery content only)
        if asset_kind is not None:
            query = query.where(Asset.asset_kind == asset_kind)

        # Asset ID whitelist
        if asset_ids:
            query = query.where(Asset.id.in_(asset_ids))

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
                # Cross-uploaded to at least one provider
                (
                    and_(
                        Asset.provider_uploads.isnot(None),
                        cast(Asset.provider_uploads, String) != '{}',
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

        # SHA-256 filter
        if sha256:
            query = query.where(Asset.sha256 == sha256)

        # Visual similarity filter (CLIP embedding cosine distance)
        if similar_to_embedding is not None:
            threshold = similarity_threshold if similarity_threshold is not None else 0.3
            max_distance = 1.0 - threshold
            distance_expr = Asset.embedding.cosine_distance(similar_to_embedding)
            query = query.where(Asset.embedding.isnot(None))
            query = query.where(distance_expr <= max_distance)
            if similar_to_asset_id is not None:
                query = query.where(Asset.id != similar_to_asset_id)
        elif similar_to_asset_id is not None:
            # Source asset has no embedding — return empty result
            from sqlalchemy import literal
            query = query.where(literal(False))

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

        # Prompt version filter (denormalized on asset)
        if prompt_version_id is not None:
            query = query.where(Asset.prompt_version_id == prompt_version_id)

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

            # Build search conditions (no Generation JOIN needed — prompt is on Asset)
            search_conditions = [
                Asset.description.ilike(like),
                Asset.prompt.ilike(like),
                Asset.local_path.ilike(like),
                Asset.original_source_url.ilike(like),
                Tag.slug.ilike(like),
                Tag.display_name.ilike(like),
                Tag.name.ilike(like),
            ]

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
            asset_kind=asset_kind,
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
        asset_kind: Optional[str] = "content",  # Default to gallery content; None = all kinds
        asset_ids: Optional[list[int]] = None,
        source_generation_id: Optional[int] = None,
        source_asset_id: Optional[int] = None,
        sha256: Optional[str] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type = None,  # OperationType enum
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        group_by: Optional[str] = None,
        group_key: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_dir: Optional[str] = "desc",
        similar_to: Optional[int] = None,
        similarity_threshold: Optional[float] = None,
    ) -> list[Asset]:
        """
        List assets for user with advanced search and filtering.

        Returns:
            List of assets
        """
        # Pre-resolve embedding for similarity search
        similar_to_embedding = None
        if similar_to is not None:
            from sqlalchemy import select as sa_select
            result = await self.db.execute(
                sa_select(Asset.embedding).where(
                    Asset.id == similar_to,
                    Asset.user_id == user.id,
                )
            )
            similar_to_embedding = result.scalar_one_or_none()

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
            asset_kind=asset_kind,
            created_from=created_from,
            created_to=created_to,
            min_width=min_width,
            max_width=max_width,
            min_height=min_height,
            max_height=max_height,
            content_domain=content_domain,
            content_category=content_category,
            content_rating=content_rating,
            asset_ids=asset_ids,
            source_generation_id=source_generation_id,
            source_asset_id=source_asset_id,
            sha256=sha256,
            prompt_version_id=prompt_version_id,
            operation_type=operation_type,
            has_parent=has_parent,
            has_children=has_children,
            group_by=group_by,
            group_key=group_key,
            group_path=group_path,
            similar_to_embedding=similar_to_embedding,
            similar_to_asset_id=similar_to,
            similarity_threshold=similarity_threshold,
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

        # Sorting — similarity search overrides default sort
        if similar_to_embedding is not None:
            distance_expr = Asset.embedding.cosine_distance(similar_to_embedding)
            query = query.order_by(distance_expr.asc(), Asset.created_at.desc())
        elif sort_by and sort_by in ('created_at', 'file_size_bytes'):
            sort_col = getattr(Asset, sort_by)
            if sort_dir == "asc":
                query = query.order_by(sort_col.asc(), Asset.id.asc())
            else:
                query = query.order_by(sort_col.desc(), Asset.id.desc())
        else:
            # Default: created_at DESC
            query = query.order_by(Asset.created_at.desc(), Asset.id.desc())

        # Cursor pagination (created_at|id) — skip cursor for similarity sort
        if cursor and similar_to_embedding is None:
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
        if cursor and similar_to_embedding is None:
            # Ignore offset when cursor is provided (except similarity mode)
            query = query.limit(limit)
        else:
            query = query.limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())
