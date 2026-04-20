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
from pixsim7.backend.main.services.asset._filters import AssetSearchFilters
from pixsim7.backend.main.services.asset.filter_registry import asset_filter_registry
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
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
            # Legacy upload_context fallback removed — all source links now
            # live in asset_lineage (backfill 20260419_0002).
            raw_key = cast(lineage_primary.c.parent_asset_id, String)
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
        sf: AssetSearchFilters,
        group_filter_invert: bool = False,
        similar_to_embedding=None,
    ):
        from sqlalchemy import and_, or_, case, literal, exists, cast, distinct, String
        from pixsim7.backend.main.domain.assets.tag import AssetTag, Tag
        from pixsim7.backend.main.domain.assets.lineage import AssetLineage

        # Destructure shared filters so the query-building body can use bare names
        (filters, group_filter, group_path, sync_status, provider_status,
         tag, q, include_archived, searchable, asset_kind,
         created_from, created_to, min_width, max_width, min_height, max_height,
         content_domain, content_category, content_rating,
         asset_ids, source_generation_id, source_asset_id,
         sha256, prompt_version_id, operation_type,
         has_parent, has_children, group_by, group_key,
         similarity_threshold) = (
            sf.filters, sf.group_filter, sf.group_path, sf.sync_status, sf.provider_status,
            sf.tag, sf.q, sf.include_archived, sf.searchable, sf.asset_kind,
            sf.created_from, sf.created_to, sf.min_width, sf.max_width, sf.min_height, sf.max_height,
            sf.content_domain, sf.content_category, sf.content_rating,
            sf.asset_ids, sf.source_generation_id, sf.source_asset_id,
            sf.sha256, sf.prompt_version_id, sf.operation_type,
            sf.has_parent, sf.has_children, sf.group_by, sf.group_key,
            sf.similarity_threshold,
        )
        similar_to_asset_id = sf.similar_to

        query = select(Asset)
        generation_joined = False
        Generation = None
        lineage_joined = False
        owner_user_id = resolve_effective_user_id(user) or 0

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
            query = query.where(Asset.user_id == owner_user_id)

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
            # "flagged" is stored in media_metadata, not derivable from URL heuristics
            if provider_status == "flagged":
                query = query.where(
                    Asset.media_metadata["provider_flagged"].as_string() == "true"
                )
            else:
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

        # Source asset filter (lineage + upload_context).
        # Supports both:
        # - top-level `source_asset_id` (legacy single value)
        # - registry filter `filters.source_asset_ids` (multi-value)
        source_asset_ids: list[int] = []

        def _append_source_asset_id(raw: Any) -> None:
            try:
                value = int(raw)
            except (TypeError, ValueError):
                return
            if value <= 0 or value in source_asset_ids:
                return
            source_asset_ids.append(value)

        if source_asset_id is not None:
            _append_source_asset_id(source_asset_id)

        if isinstance(filters, dict):
            raw_source_asset_ids = filters.get("source_asset_ids")
            if isinstance(raw_source_asset_ids, (list, tuple, set)):
                for raw_id in raw_source_asset_ids:
                    _append_source_asset_id(raw_id)
            elif raw_source_asset_ids is not None:
                _append_source_asset_id(raw_source_asset_ids)

        if source_asset_ids:
            # Legacy upload_context fallback removed — all source links now
            # live in asset_lineage (backfill 20260419_0002).
            query = query.where(
                exists(
                    select(AssetLineage.id).where(
                        AssetLineage.child_asset_id == Asset.id,
                        AssetLineage.parent_asset_id.in_(source_asset_ids),
                    )
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
        # Always use subquery to avoid row multiplication from JOIN
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
                # "any" mode: use EXISTS to avoid row multiplication
                query = query.where(
                    exists(
                        select(AssetTag.asset_id)
                        .join(Tag, Tag.id == AssetTag.tag_id)
                        .where(
                            AssetTag.asset_id == Asset.id,
                            Tag.slug.in_(tag_values),
                        )
                    )
                )

        # Namespace-based tag filters — all query asset_tag join table by slug.
        for ns_key in ("content_elements", "style_tags", "provider_id", "effective_provider_id", "operation_type"):
            ns_values = _normalize_list(filters.get(ns_key) if filters else None)
            if not ns_values:
                continue
            ns_mode = None
            if filters:
                ns_mode = filters.get(f"{ns_key}__mode") or filters.get(f"{ns_key}_mode")
            if ns_mode == "all" and len(ns_values) > 1:
                ns_subquery = (
                    select(AssetTag.asset_id)
                    .join(Tag, Tag.id == AssetTag.tag_id)
                    .where(Tag.slug.in_(ns_values))
                    .group_by(AssetTag.asset_id)
                    .having(func.count(distinct(Tag.slug)) == len(ns_values))
                    .subquery()
                )
                query = query.where(Asset.id.in_(select(ns_subquery.c.asset_id)))
            else:
                query = query.where(
                    exists(
                        select(AssetTag.asset_id)
                        .join(Tag, Tag.id == AssetTag.tag_id)
                        .where(
                            AssetTag.asset_id == Asset.id,
                            Tag.slug.in_(ns_values),
                        )
                    )
                )

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
            # Use EXISTS for tag search to avoid row multiplication from outer join
            like = f"%{q}%"

            tag_text_match = exists(
                select(AssetTag.asset_id)
                .join(Tag, Tag.id == AssetTag.tag_id)
                .where(
                    AssetTag.asset_id == Asset.id,
                    or_(
                        Tag.slug.ilike(like),
                        Tag.display_name.ilike(like),
                        Tag.name.ilike(like),
                    ),
                )
            )

            search_conditions = [
                Asset.description.ilike(like),
                Asset.prompt.ilike(like),
                Asset.local_path.ilike(like),
                Asset.original_source_url.ilike(like),
                tag_text_match,
            ]

            query = query.where(or_(*search_conditions))

        return query

    def _build_filtered_asset_id_subquery(self, *, user: User, sf: AssetSearchFilters):
        query = self._build_asset_search_query(user=user, sf=sf)
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
        owner_user_id = resolve_effective_user_id(user) or 0

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Asset.user_id == owner_user_id)

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

    async def _resolve_similarity_embedding(
        self, similar_to: Optional[int], owner_user_id: int,
    ):
        """Pre-resolve embedding vector for similarity search."""
        if similar_to is None:
            return None
        from sqlalchemy import select as sa_select
        result = await self.db.execute(
            sa_select(Asset.embedding).where(
                Asset.id == similar_to,
                Asset.user_id == owner_user_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_assets(
        self,
        user: User,
        sf: AssetSearchFilters | None = None,
        *,
        cursor: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: Optional[str] = None,
        sort_dir: Optional[str] = "desc",
        include_total: bool = False,
        **kwargs,
    ) -> list[Asset] | tuple[list[Asset], int]:
        """
        List assets for user with advanced search and filtering.

        Accepts an AssetSearchFilters instance or individual kwargs (legacy).

        Returns:
            List of assets, or (assets, total) when include_total=True.
        """
        if sf is None:
            sf = AssetSearchFilters(**kwargs)

        # Pre-resolve embedding for similarity search
        owner_user_id = resolve_effective_user_id(user) or 0
        similar_to_embedding = await self._resolve_similarity_embedding(
            sf.similar_to, owner_user_id,
        )

        query = self._build_asset_search_query(
            user=user, sf=sf, similar_to_embedding=similar_to_embedding,
        )

        # Total count (before sorting/pagination)
        total = None
        if include_total:
            count_query = select(func.count()).select_from(
                query.with_only_columns(Asset.id).subquery()
            )
            total = (await self.db.execute(count_query)).scalar_one() or 0

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
        assets = list(result.scalars().all())
        if include_total:
            return assets, total
        return assets
